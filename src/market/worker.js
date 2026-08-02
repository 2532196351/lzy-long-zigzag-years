import {
  advanceTo,
  canonicalMarketState,
  createMarketSimulation,
  processExternalCommand,
  snapshotMarket,
  snapshotMarketCommandPatch,
  snapshotRealtimeLevel2,
} from './simulator.js?v=20260803-02';
import {
  getCompanyCatalog,
  getDerivativesProjection,
  getEntertainmentProjection,
  getLifeProjection,
} from '../engine.js?v=20260803-02';
import { buildCompanyUniverseV2 } from '../content/company-universe-v2.js?v=20260803-02';
import { projectOpenWorldCityFromWorld } from '../experience/open-world-city-authority.js?v=20260803-02';
import { projectWorld2D } from '../world2d/index.js?v=20260803-02';
import {
  AUDIT_COLD_TRANSPORT_SCHEMA,
  validAuditColdReference,
} from './audit-cold-store.js?v=20260803-02';

const NORMAL_VIRTUAL_RATE = 3;
const PLAYBACK_VERIFICATION_INTERVAL_MS = 300_000;
const PLAYBACK_WALL_SLICE_BUDGET_MS_BY_SPEED = Object.freeze({
  1: 12,
  4: 16,
  // A playback task can already be running when a player command reaches the
  // Worker queue. Keep its cooperative slice below the interaction tail
  // budget so the queued command still has room for matching and transport.
  // The remaining virtual debt is retained and resumed by the next wake.
  16: 12,
});
const COMMAND_WALL_SLICE_BUDGET_MS_BY_SPEED = Object.freeze({
  1: 12,
  4: 16,
  // The simulator prepares the exact phase boundary after this cooperative
  // catch-up slice, so interaction latency no longer depends on draining a
  // whole autonomous burst before accepting a player order. Keep the command
  // slice at the same twelve-millisecond ceiling as ordinary playback; the
  // zero-delay wake retains accelerated debt without charging it to the next
  // player acknowledgement.
  16: 12,
});
const PLAYBACK_FAIRNESS_DELAY_MS_BY_SPEED = Object.freeze({
  1: 1,
  4: 1,
  // The bounded catch-up slice already returns to WebKit's task queue before
  // every continuation. Retain one real timer turn so posted player messages
  // remain dispatchable without charging an extra idle millisecond to every
  // saturated accelerated slice.
  16: 1,
});
// Every order receives the command-local conservation and audit-chain proof.
// Complete scans belong to playback-idle periodic work and unconditional
// pause/save/restore barriers; an acknowledgement must never inherit a
// history-wide scan merely because it happens to cross a cadence threshold.
const LEVEL2_MIN_WALL_INTERVAL_MS = 32;
const NORMAL_VISIBLE_QUOTE_INTERVAL_MS = 9_000;
const PUBLICATION_CREDIT_SCHEMA =
  'lzy_market_publication_credit_v1';
const LEVEL2_AUTHORITY_TRACE_SCHEMA =
  'lzy_level2_authority_trace_v1';
const DERIVATIVES_DELTA_SCHEMA =
  'lzy_derivatives_cadence_delta_v1';
const DERIVATIVES_CADENCE_FIELDS = Object.freeze([
  'cadence',
  'access',
  'books',
  'lastTradePriceTicks',
  'settlementPriceTicks',
  'impliedVolatilityPpm',
  'seriesByContract',
  'priceAuthoritiesByContract',
  'financingFacility',
  'securitiesLending',
  'player',
  'actors',
  'recentTrades',
]);
const MAX_PENDING_QUOTE_FRAMES = 240;
const LEVEL2_BOOK_EVENT_TYPES = new Set([
  'command',
  'agent_command_batch',
  'world_day_settlement',
]);

const SUPPORTED_SPEEDS = new Set([1, 4, 16]);
const MAX_ADVANCE_WORLD_DAYS = 5;
const MAX_ADVANCE_VIRTUAL_MS = 300_000;
const EXTERNAL_PLAYER_ID = 'player';
const EXTERNAL_PLAYER_BROKER_ID = 'broker_lzy';
const PUBLIC_WORLD_SCHEMA = 'lzy_world_public_v1';
const PUBLIC_COMPANY_UNIVERSE_V2 = buildCompanyUniverseV2(
  getCompanyCatalog(),
);
const PUBLIC_RECORD_LIMITS = Object.freeze({
  clues: 83,
  facts: 96,
  memories: 96,
  narratives: 80,
  events: 96,
  ledger: 96,
});
const PRIVATE_PUBLICATION_KEYS = new Set([
  'accountId',
  'agentId',
  'buyerId',
  'memory',
  'observedTradeIds',
  'parentOrderId',
  'sellerId',
  'strategy',
  'trigger',
]);
const EXTERNAL_WORLD_COMMAND_FIELDS = Object.freeze({
  submit_order: new Set([
    'type',
    'actorId',
    'brokerId',
    'symbol',
    'side',
    'orderType',
    'priceTicks',
    'quantity',
    'tif',
  ]),
  cancel_order: new Set([
    'type',
    'actorId',
    'brokerId',
    'orderId',
  ]),
  world_action: new Set([
    'type',
    'actorId',
    'action',
  ]),
  player_control: new Set([
    'type',
    'actorId',
    'commandId',
    'baseCommitSeq',
    'sceneId',
    'geometryRevision',
    'controlSeq',
    'control',
  ]),
});

function cloneValue(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function redactPrivatePublication(value) {
  if (Array.isArray(value)) {
    return value.map(redactPrivatePublication);
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PRIVATE_PUBLICATION_KEYS.has(key))
      .map(([key, child]) => [
        key,
        redactPrivatePublication(child),
      ]),
  );
}

function publicCompany(company) {
  return {
    id: company.id,
    symbol: company.symbol,
    name: company.name,
    shortName: company.shortName,
    role: company.role,
    description: company.description,
    lifecycle: company.lifecycle,
    industry: company.industry,
    informationTransparencyBps:
      company.informationTransparencyBps,
    management: company.management,
    macroExposures: company.macroExposures,
    supplierCompanyIds: company.supplierCompanyIds,
    customerCompanyIds: company.customerCompanyIds,
    businessModel: company.businessModel,
    products: company.products,
    researchPrograms: company.researchPrograms,
    publishedFinancialSnapshot:
      company.publishedFinancialSnapshot,
  };
}

function publicSecurity(security) {
  return {
    symbol: security.symbol,
    issuerId: security.issuerId,
    name: security.name,
    board: security.board,
    dailyLimitBps: security.dailyLimitBps,
    previousCloseTicks: security.previousCloseTicks,
    outstandingUnits: security.outstandingUnits,
    lastPrice: security.lastPrice,
    priceHistory: (security.priceHistory ?? [])
      .slice(-18)
      .map((point) => ({
        tick: point.tick,
        price: point.price,
      })),
    valuation: security.valuation,
  };
}

function recentRecords(values, limit) {
  const source = Array.isArray(values) ? values : [];
  return source.slice(Math.max(0, source.length - limit));
}

function publicLedgerAccount(account) {
  const value = String(account ?? '').toLowerCase();
  if (value.includes('player') && value.includes('cash')) {
    return '账户现金';
  }
  if (value.includes('player')) return '个人账户';
  if (value.includes('company')) return '企业往来';
  if (value.includes('exchange')) return '交易服务';
  if (value.includes('economy')) return '商业往来';
  if (value.includes('maker') || value.includes('liquidity')) {
    return '市场流动性';
  }
  if (value.includes('npc') || value.includes('investor')) {
    return '市场参与者';
  }
  return '其他往来';
}

export function projectPublicWorldExperience(world, context = {}) {
  const {
    city: _cityAuthority,
    ...life
  } = getLifeProjection(world);
  const recordTotals = {
    clues: (world.clues ?? []).length,
    facts: (world.facts ?? []).length,
    memories: (world.memories ?? []).filter(
      (memory) =>
        memory.visibility === 'public' ||
        memory.visibility === 'player',
    ).length,
    narratives: (world.narratives ?? []).length,
    events: (world.eventLog ?? []).filter(
      (event) =>
        event.visibility === 'public' ||
        event.visibility === 'player',
    ).length,
    ledger: (world.ledger ?? []).length,
  };
  const publicMemories = recentRecords(
    (world.memories ?? []).filter(
      (memory) =>
        memory.visibility === 'public' ||
        memory.visibility === 'player',
    ),
    PUBLIC_RECORD_LIMITS.memories,
  );
  const publicEvents = recentRecords(
    (world.eventLog ?? []).filter(
      (event) =>
        event.visibility === 'public' ||
        event.visibility === 'player',
    ),
    PUBLIC_RECORD_LIMITS.events,
  );
  return {
    publication: 'lzy_world_experience_public_v1',
    life,
    world2d: projectWorld2D(world),
    openWorldCity: projectOpenWorldCityFromWorld(
      world,
      context,
    ),
    entertainment: getEntertainmentProjection(world, context),
    recordTotals,
    recordsTruncated: Object.fromEntries(
      Object.entries(recordTotals).map(([key, count]) => [
        key,
        count > PUBLIC_RECORD_LIMITS[key],
      ]),
    ),
    records: {
      clues: cloneValue(
        recentRecords(world.clues, PUBLIC_RECORD_LIMITS.clues),
      ),
      facts: recentRecords(
        world.facts,
        PUBLIC_RECORD_LIMITS.facts,
      ).map((fact) => ({
        tick: fact.tick,
        summary: fact.summary,
        visibility: fact.visibility,
      })),
      memories: publicMemories.map((memory) => ({
          content: memory.content,
          createdTick: memory.createdTick,
          lastRecalledTick: memory.lastRecalledTick,
          salience: memory.salience,
        })),
      narratives: recentRecords(
        world.narratives,
        PUBLIC_RECORD_LIMITS.narratives,
      ).map((narrative) => ({
        tick: narrative.tick,
        text: narrative.text,
        perspective: narrative.perspective,
      })),
      events: publicEvents.map((event) => ({
          tick: event.tick,
          summary: event.summary,
        })),
      ledger: recentRecords(
        world.ledger,
        PUBLIC_RECORD_LIMITS.ledger,
      ).map((journal) => ({
        tick: journal.tick,
        description: journal.description,
        postings: (journal.postings ?? []).map((posting) => ({
          account: publicLedgerAccount(posting.account),
          debit: posting.debit,
          credit: posting.credit,
        })),
      })),
    },
  };
}

function publicWorldState(world, context = {}) {
  return cloneValue({
    world: {
      id: world.world.id,
      name: world.world.name,
      tick: world.world.tick,
      status: world.world.status,
      ruleVersion: world.world.ruleVersion,
      calendar: world.world.calendar,
      interfaceMode: world.world.interfaceMode,
    },
    worldline: world.worldline,
    player: world.player,
    entities: {
      companies: Object.fromEntries(
        Object.entries(world.entities?.companies ?? {}).map(
          ([companyId, company]) => [
            companyId,
            publicCompany(company),
          ],
        ),
      ),
      companyUniverseV2: PUBLIC_COMPANY_UNIVERSE_V2,
    },
    economy: world.economy,
    market: {
      venue: world.market.venue,
      exchangeFeePool: world.market.exchangeFeePool,
      securities: Object.fromEntries(
        Object.entries(world.market.securities ?? {}).map(
          ([symbol, security]) => [
            symbol,
            publicSecurity(security),
          ],
        ),
      ),
      marketDataProducts: world.market.marketDataProducts,
      valuation: world.market.valuation,
    },
    experience: projectPublicWorldExperience(world, context),
  });
}

function publicDerivativesProjection(
  state,
  { patch = false } = {},
) {
  const projection = getDerivativesProjection(
    state.world,
  );
  const derivativeActors = Object.values(
    state.world.derivatives?.actors ?? {},
  );
  const decisionTimes = derivativeActors
    .map((actor) => actor.lastDecisionAtMs)
    .filter(Number.isSafeInteger);
  const cadence = {
    decisionCount: derivativeActors.reduce(
      (sum, actor) =>
        sum +
        (
          Number.isSafeInteger(actor.decisionCount)
            ? actor.decisionCount
            : 0
        ),
      0,
    ),
    lastDecisionAtMs:
      decisionTimes.length > 0
        ? Math.max(...decisionTimes)
        : null,
  };
  const {
    actors: _privateActors,
    ...publicProjection
  } = projection;
  const authority = {
    publication: 'lzy_derivatives_public_v1',
    authorityNowMs: state.nowMs,
    authorityCommitSeq: state.commitSeq,
    commitSeq: projection.commitSeq,
    nowMs: projection.nowMs,
    cadence,
  };
  if (!patch) {
    return redactPrivatePublication({
      ...publicProjection,
      ...authority,
    });
  }
  return redactPrivatePublication({
    ...authority,
    publicationMode: 'cadence_patch',
    access: projection.access,
    books: projection.books,
    lastTradePriceTicks:
      projection.lastTradePriceTicks,
    settlementPriceTicks:
      projection.settlementPriceTicks,
    impliedVolatilityPpm:
      projection.impliedVolatilityPpm,
    seriesByContract:
      projection.seriesByContract,
    priceAuthoritiesByContract:
      projection.priceAuthoritiesByContract,
    financingFacility:
      projection.financingFacility,
    securitiesLending:
      projection.securitiesLending,
    player: projection.player,
    recentTrades: projection.recentTrades,
  });
}

function isPlainRecord(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value),
  );
}

function sameProjectionValue(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (
      !Array.isArray(left) ||
      !Array.isArray(right) ||
      left.length !== right.length
    ) {
      return false;
    }
    return left.every((value, index) =>
      sameProjectionValue(value, right[index]),
    );
  }
  if (isPlainRecord(left) || isPlainRecord(right)) {
    if (!isPlainRecord(left) || !isPlainRecord(right)) {
      return false;
    }
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.hasOwn(right, key) &&
          sameProjectionValue(left[key], right[key]),
      )
    );
  }
  return false;
}

function createProjectionObjectDelta(previous, current) {
  const prior = isPlainRecord(previous) ? previous : {};
  const next = isPlainRecord(current) ? current : {};
  const set = {};
  const merge = {};
  const remove = [];
  for (const key of Object.keys(prior)) {
    if (!Object.hasOwn(next, key)) remove.push(key);
  }
  for (const [key, value] of Object.entries(next)) {
    if (!Object.hasOwn(prior, key)) {
      set[key] = value;
      continue;
    }
    if (sameProjectionValue(prior[key], value)) continue;
    if (
      isPlainRecord(prior[key]) &&
      isPlainRecord(value)
    ) {
      const child = createProjectionObjectDelta(
        prior[key],
        value,
      );
      if (child) merge[key] = child;
      continue;
    }
    set[key] = value;
  }
  if (
    Object.keys(set).length === 0 &&
    Object.keys(merge).length === 0 &&
    remove.length === 0
  ) {
    return null;
  }
  return {
    ...(Object.keys(set).length > 0 ? { set } : {}),
    ...(Object.keys(merge).length > 0 ? { merge } : {}),
    ...(remove.length > 0 ? { remove } : {}),
  };
}

function derivativeProjectionChange(previous, current) {
  if (sameProjectionValue(previous, current)) return null;
  if (
    isPlainRecord(previous) &&
    isPlainRecord(current)
  ) {
    return {
      type: 'object',
      delta: createProjectionObjectDelta(previous, current),
    };
  }
  return {
    type: 'replace',
    value: current,
  };
}

function recentDerivativeTradeAppend(previous, current) {
  const prior = Array.isArray(previous) ? previous : [];
  const next = Array.isArray(current) ? current : [];
  if (sameProjectionValue(prior, next)) return null;
  const priorLastSequence =
    prior.length > 0
      ? Number(prior.at(-1)?.sequence)
      : null;
  if (
    priorLastSequence !== null &&
    !Number.isSafeInteger(priorLastSequence)
  ) {
    return false;
  }
  const priorBySequence = new Map();
  const priorIds = new Set();
  let priorSequence = null;
  for (const trade of prior) {
    if (
      typeof trade?.id !== 'string' ||
      !Number.isSafeInteger(trade.sequence) ||
      (
        priorSequence !== null &&
        trade.sequence !== priorSequence + 1
      ) ||
      priorBySequence.has(trade.sequence) ||
      priorIds.has(trade.id)
    ) {
      return false;
    }
    priorBySequence.set(trade.sequence, trade);
    priorIds.add(trade.id);
    priorSequence = trade.sequence;
  }
  let lastSequence = null;
  const nextIds = new Set();
  for (const trade of next) {
    if (
      typeof trade?.id !== 'string' ||
      !Number.isSafeInteger(trade.sequence) ||
      (
        lastSequence !== null &&
        trade.sequence !== lastSequence + 1
      ) ||
      nextIds.has(trade.id)
    ) {
      return false;
    }
    const known = priorBySequence.get(trade.sequence);
    if (known && !sameProjectionValue(known, trade)) {
      return false;
    }
    if (
      trade.sequence <= (priorLastSequence ?? -1) &&
      !known
    ) {
      return false;
    }
    nextIds.add(trade.id);
    lastSequence = trade.sequence;
  }
  if (
    priorLastSequence !== null &&
    next.length > 0 &&
    !next.some(
      (trade) => trade.sequence === priorLastSequence,
    )
  ) {
    return false;
  }
  const items = next.filter(
    (trade) =>
      priorLastSequence === null ||
      trade.sequence > priorLastSequence,
  );
  if (
    items.length === 0 &&
    !sameProjectionValue(prior, next)
  ) {
    return false;
  }
  return {
    type: 'append',
    afterTradeSequence: priorLastSequence,
    trimBeforeTradeSequence:
      next.length > 0 ? next[0].sequence : null,
    maxItems: Math.max(1, next.length, 100),
    items,
  };
}

function createDerivativesCadenceDelta(
  previous,
  current,
  {
    streamId,
    baseSequence,
    sequence,
  },
) {
  const changes = {};
  for (const field of DERIVATIVES_CADENCE_FIELDS) {
    if (
      !Object.hasOwn(previous, field) &&
      !Object.hasOwn(current, field)
    ) {
      continue;
    }
    if (field === 'recentTrades') {
      const append = recentDerivativeTradeAppend(
        previous[field],
        current[field],
      );
      if (append === false) return null;
      if (append) changes[field] = append;
      continue;
    }
    const change = derivativeProjectionChange(
      previous[field],
      current[field],
    );
    if (change) changes[field] = change;
  }
  return {
    publication: 'lzy_derivatives_public_v1',
    publicationMode: 'cadence_delta',
    deltaSchema: DERIVATIVES_DELTA_SCHEMA,
    streamId,
    baseSequence,
    sequence,
    authorityNowMs: current.authorityNowMs,
    authorityCommitSeq: current.authorityCommitSeq,
    commitSeq: current.commitSeq,
    nowMs: current.nowMs,
    changeMask: Object.keys(changes),
    changes,
  };
}

function publicWorldEnvelope(
  state,
  { derivatives = null } = {},
) {
  const worldState = publicWorldState(state.world, {
    authorityCommitSeq: state.commitSeq,
    virtualTime: state.nowMs,
    worldEpoch: state.streamId,
    availableCashCents:
      state.accounts?.player?.cashCents ??
      Math.round(state.world.player.cash * 100),
  });
  worldState.derivatives =
    derivatives ?? publicDerivativesProjection(state);
  return {
    publication: PUBLIC_WORLD_SCHEMA,
    commitSeq: state.commitSeq,
    state: redactPrivatePublication(
      worldState,
    ),
  };
}

function publicWorldCommandPatch(state, symbol) {
  return {
    publication: PUBLIC_WORLD_SCHEMA,
    publicationMode: 'command_delta',
    commitSeq: state.commitSeq,
    state: redactPrivatePublication({
      world: {
        id: state.world.world.id,
        tick: state.world.world.tick,
        calendar: state.world.world.calendar,
      },
      worldline: state.world.worldline,
      player: {
        cash: state.world.player.cash,
        holdings: state.world.player.holdings,
      },
      market: {
        exchangeFeePool: state.world.market.exchangeFeePool,
        securities: {
          [symbol]: publicSecurity(
            state.world.market.securities[symbol],
          ),
        },
      },
    }),
  };
}

function publicWorldSpatialPatch(state) {
  return {
    publication: PUBLIC_WORLD_SCHEMA,
    publicationMode: 'spatial_delta',
    commitSeq: state.commitSeq,
    state: redactPrivatePublication({
      world: {
        id: state.world.world.id,
        tick: state.world.world.tick,
        calendar: state.world.world.calendar,
      },
      experience: {
        publication: 'lzy_world_experience_public_v1',
        world2d: projectWorld2D(state.world, {
          authorityCommitSeq: state.commitSeq,
        }),
        openWorldCity: projectOpenWorldCityFromWorld(
          state.world,
          {
            authorityCommitSeq: state.commitSeq,
            virtualTime: state.nowMs,
            worldEpoch: state.streamId,
            availableCashCents: Math.max(
              0,
              state.accounts.player.cashCents -
                state.accounts.player.reservedCashCents,
            ),
          },
        ),
        entertainment: getEntertainmentProjection(
          state.world,
          {
            authorityCommitSeq: state.commitSeq,
            virtualTime: state.nowMs,
            worldEpoch: state.streamId,
            availableCashCents:
              state.accounts.player.cashCents,
          },
        ),
      },
    }),
  };
}

function publicReceipt(receipt) {
  return redactPrivatePublication(cloneValue(receipt));
}

function sameLevel2DepthLevel(left, right) {
  return Boolean(
    left &&
    right &&
    left.priceTicks === right.priceTicks &&
    left.quantity === right.quantity &&
    left.orderCount === right.orderCount &&
    left.playerQuantity === right.playerQuantity,
  );
}

function level2DepthSideDelta(previousLevels, currentLevels) {
  const previousByPrice = new Map(
    (previousLevels ?? []).map((level) => [
      level.priceTicks,
      level,
    ]),
  );
  const currentByPrice = new Map(
    (currentLevels ?? []).map((level) => [
      level.priceTicks,
      level,
    ]),
  );
  return {
    upsert: (currentLevels ?? []).filter(
      (level) =>
        !sameLevel2DepthLevel(
          previousByPrice.get(level.priceTicks),
          level,
        ),
    ),
    removePriceTicks: [...previousByPrice.keys()]
      .filter((priceTicks) => !currentByPrice.has(priceTicks))
      .sort((left, right) => left - right),
  };
}

function compactLevel2DepthTransport(previous, current) {
  if (!previous?.symbols || !current?.symbols) return current;
  return {
    ...current,
    symbols: Object.fromEntries(
      Object.entries(current.symbols).map(([symbol, projection]) => {
        const previousDepth =
          previous.symbols[symbol]?.level2Depth;
        const currentDepth = projection.level2Depth;
        if (!previousDepth || !currentDepth) {
          return [symbol, projection];
        }
        const {
          level2Depth: _level2Depth,
          ...compactProjection
        } = projection;
        return [
          symbol,
          {
            ...compactProjection,
            level2DepthDelta: {
              schema: 'lzy_level2_depth_delta_v1',
              depth: currentDepth.depth,
              actualBidLevels:
                currentDepth.actualBidLevels,
              actualAskLevels:
                currentDepth.actualAskLevels,
              source: currentDepth.source,
              bids: level2DepthSideDelta(
                previousDepth.bids,
                currentDepth.bids,
              ),
              asks: level2DepthSideDelta(
                previousDepth.asks,
                currentDepth.asks,
              ),
            },
          },
        ];
      }),
    ),
  };
}

function mergeLevel2ProjectionBaseline(previous, current) {
  if (!previous?.symbols || !current?.symbols) return current;
  return {
    ...previous,
    ...current,
    symbols: {
      ...previous.symbols,
      ...current.symbols,
    },
  };
}

function publicQuoteFrame(frame) {
  return redactPrivatePublication(cloneValue({
    virtualMs: frame.virtualMs,
    worldTick: frame.worldTick,
    tradeCount: frame.tradeCount,
    volume: frame.volume,
    commitSeq: frame.commitSeq,
    frameBars: frame.frameBars,
    symbols: Object.fromEntries(
      Object.entries(frame.symbols ?? {}).map(
        ([symbol, snapshot]) => [
          symbol,
          {
            lastPriceTicks: snapshot.lastPriceTicks,
            frameBar: snapshot.frameBar,
          },
        ],
      ),
    ),
  }));
}

export function epochAlignedMonotonicNow(
  performanceLike = globalThis.performance,
  dateNow = Date.now,
) {
  const timeOrigin = Number(performanceLike?.timeOrigin);
  if (
    Number.isFinite(timeOrigin) &&
    typeof performanceLike?.now === 'function'
  ) {
    const elapsedMs = Number(performanceLike.now());
    if (Number.isFinite(elapsedMs)) {
      return timeOrigin + elapsedMs;
    }
  }
  return dateNow();
}

function defaultNow() {
  return epochAlignedMonotonicNow();
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function assertCheckpointValue(value, path = 'command', ancestors = new Set()) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return;
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return;
    throw new TypeError(`${path} must contain finite JSON numbers.`);
  }
  if (typeof value !== 'object') {
    throw new TypeError(
      'WORLD_COMMAND must contain checkpoint-serializable JSON data.',
    );
  }
  if (ancestors.has(value)) {
    throw new TypeError('WORLD_COMMAND cannot contain cyclic JSON data.');
  }
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new TypeError(
      'WORLD_COMMAND must contain checkpoint-serializable JSON objects.',
    );
  }
  ancestors.add(value);
  for (const [key, child] of Object.entries(value)) {
    assertCheckpointValue(child, `${path}.${key}`, ancestors);
  }
  ancestors.delete(value);
}

function externalWorldCommand(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('WORLD_COMMAND requires a command object.');
  }
  assertCheckpointValue(value);
  const allowedFields = EXTERNAL_WORLD_COMMAND_FIELDS[value.type];
  if (!allowedFields) {
    throw new TypeError(`Unsupported WORLD_COMMAND type: ${value.type ?? 'missing'}.`);
  }
  for (const field of Object.keys(value)) {
    if (allowedFields.has(field)) continue;
    if (
      field === 'source' ||
      field === 'agentActivityId' ||
      field === 'scheduledMs'
    ) {
      throw new TypeError(`WORLD_COMMAND field "${field}" is reserved.`);
    }
    throw new TypeError(
      `Unsupported field "${field}" for WORLD_COMMAND ${value.type}.`,
    );
  }
  if (value.actorId !== EXTERNAL_PLAYER_ID) {
    throw new TypeError(
      `External WORLD_COMMAND actorId must be "${EXTERNAL_PLAYER_ID}".`,
    );
  }
  if (
    (value.type === 'submit_order' || value.type === 'cancel_order') &&
    value.brokerId !== EXTERNAL_PLAYER_BROKER_ID
  ) {
    throw new TypeError(
      `External WORLD_COMMAND brokerId must be "${EXTERNAL_PLAYER_BROKER_ID}".`,
    );
  }
  return cloneValue(value);
}

function assertWorldDays(days) {
  if (
    !Number.isSafeInteger(days) ||
    days < 1 ||
    days > MAX_ADVANCE_WORLD_DAYS
  ) {
    throw new RangeError(
      `days must be a positive integer between 1 and ${MAX_ADVANCE_WORLD_DAYS}.`,
    );
  }
}

function assertVirtualDuration(durationMs) {
  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs < 1 ||
    durationMs > MAX_ADVANCE_VIRTUAL_MS
  ) {
    throw new RangeError(
      `virtual duration must be a positive integer at most ${MAX_ADVANCE_VIRTUAL_MS}ms.`,
    );
  }
}

/**
 * Owns the complete realtime simulation behind a Worker-like message port.
 * The injected clock and timers are production defaults with deterministic
 * seams for controller tests and the main-thread fallback.
 */
export function createMarketWorkerController({
  port,
  now = defaultNow,
  setTimeout: scheduleTimeout = globalThis.setTimeout,
  clearTimeout: cancelTimeout = globalThis.clearTimeout,
  simulationOptions = {},
  onFullVerification = () => {},
} = {}) {
  if (
    !port ||
    typeof port.postMessage !== 'function' ||
    typeof port.addEventListener !== 'function'
  ) {
    throw new TypeError('A Worker-like message port is required.');
  }

  let state = null;
  let playing = false;
  let speed = 1;
  let timerId = null;
  let wallAnchorMs = 0;
  let virtualAnchorMs = 0;
  let lastVerifiedVirtualMs = 0;
  let lastVerifiedCommitSeq = 0;
  let orderCommandsSinceFullVerification = 0;
  let level2StreamId = null;
  let level2Sequence = 0;
  let lastLevel2CommitSeq = -1;
  let quotePublicationSequence = 0;
  let derivativesStreamId = null;
  let derivativesPublicationSequence = 0;
  let acknowledgedDerivativesProjection = null;
  let acknowledgedDerivativesSequence = 0;
  let inFlightDerivativesProjection = null;
  let inFlightDerivativesSequence = null;
  let forceNextDerivativesFull = true;
  let publicationCreditEnabled = false;
  let acknowledgedLevel2Projection = null;
  let inFlightLevel2Projection = null;
  let inFlightLevel2Publication = null;
  let inFlightQuotePublication = null;
  let pendingLevel2Publication = null;
  let pendingQuotePublication = null;
  // The Worker and client consume one ordered message stream. Remember the
  // latest full depth projection that was actually posted so ordinary quote
  // frames can transport only changed price levels. This is a transport
  // baseline, never authority and never part of SAVE_BARRIER state.
  let quoteDepthBaseline = null;
  let deferredFixedEndpointFrames = [];
  let pendingPauseMessage = null;
  let activePlaybackTaskTrace = null;
  let lastPlaybackTaskTrace = null;
  let lastPublicationAckTrace = null;
  let destroyed = false;

  function auditColdStoreForInit(message) {
    const transport = message.auditColdTransport;
    if (transport === undefined || transport === null) return null;
    if (
      transport.schema !== AUDIT_COLD_TRANSPORT_SCHEMA ||
      !Array.isArray(transport.verifiedReferences)
    ) {
      throw new TypeError('Invalid realtime-audit cold transport.');
    }
    const known = new Map();
    for (const reference of transport.verifiedReferences) {
      if (!validAuditColdReference(reference)) {
        throw new TypeError(
          'Invalid verified realtime-audit cold reference.',
        );
      }
      const previous = known.get(reference.key);
      if (
        previous &&
        (
          previous.kind !== reference.kind ||
          previous.digest !== reference.digest ||
          previous.encodedCharacters !==
            reference.encodedCharacters
        )
      ) {
        throw new TypeError(
          'Conflicting verified realtime-audit cold reference.',
        );
      }
      known.set(reference.key, cloneValue(reference));
    }
    return {
      put(record) {
        if (
          destroyed ||
          !validAuditColdReference(record) ||
          typeof record.value !== 'string' ||
          record.value.length !== record.encodedCharacters
        ) {
          return false;
        }
        post({
          type: 'AUDIT_COLD_RECORD',
          schema: AUDIT_COLD_TRANSPORT_SCHEMA,
          record,
        });
        known.set(record.key, {
          schema: record.schema,
          kind: record.kind,
          key: record.key,
          digest: record.digest,
          encodedCharacters: record.encodedCharacters,
        });
        return true;
      },
      has(reference) {
        if (!validAuditColdReference(reference)) return false;
        const entry = known.get(reference.key);
        return Boolean(
          entry &&
            entry.kind === reference.kind &&
            entry.digest === reference.digest &&
            entry.encodedCharacters ===
              reference.encodedCharacters,
        );
      },
    };
  }

  function noteFullVerification() {
    lastVerifiedVirtualMs = state.nowMs;
    lastVerifiedCommitSeq = state.commitSeq;
    orderCommandsSinceFullVerification = 0;
    try {
      onFullVerification({
        nowMs: state.nowMs,
        commitSeq: state.commitSeq,
      });
    } catch {
      // Observability hooks cannot alter or block market authority.
    }
  }

  function post(message) {
    if (destroyed) return;
    const startedAt = activePlaybackTaskTrace
      ? now()
      : null;
    port.postMessage(message);
    if (activePlaybackTaskTrace) {
      const durationMs = now() - startedAt;
      activePlaybackTaskTrace.postMs += durationMs;
      activePlaybackTaskTrace.postCount += 1;
      activePlaybackTaskTrace.postByType[message?.type ?? 'UNKNOWN'] =
        (activePlaybackTaskTrace.postByType[
          message?.type ?? 'UNKNOWN'
        ] ?? 0) + durationMs;
    }
  }

  function requireState() {
    if (!state) throw new Error('Market worker is not initialized.');
    return state;
  }

  function clearWake() {
    if (timerId === null) return;
    cancelTimeout(timerId);
    timerId = null;
  }

  function publicationTrace(
    market,
    publicationMs,
    wallPublishedAt = now(),
    fallbackCommitSeq = state.commitSeq,
  ) {
    const byId = new Map();
    for (const trade of [
      ...(Array.isArray(market?.tradeDeltas)
        ? market.tradeDeltas
        : []),
      ...Object.values(market?.symbols ?? {}).flatMap(
        (view) =>
          Array.isArray(view?.ultraTradeDeltas)
            ? view.ultraTradeDeltas
            : [],
      ),
    ]) {
      const id =
        typeof trade?.id === 'string'
          ? trade.id
          : `${trade?.symbol}:${trade?.virtualMs}:${trade?.sequence}`;
      byId.set(id, trade);
    }
    const events = [...byId.entries()]
      .sort(
        ([leftId, left], [rightId, right]) =>
          Number(left?.virtualMs) - Number(right?.virtualMs) ||
          Number(left?.sequence) - Number(right?.sequence) ||
          leftId.localeCompare(rightId),
      );
    const latest = events.at(-1)?.[1] ?? null;
    return {
      publicationMs,
      wallPublishedAt,
      sourceEventIds: events.map(([id]) => id),
      latestEventMs:
        Number.isSafeInteger(latest?.virtualMs)
          ? latest.virtualMs
          : publicationMs,
      latestSequence:
        Number.isSafeInteger(latest?.sequence)
          ? latest.sequence
          : fallbackCommitSeq,
    };
  }

  function attachPublicationTrace(
    market,
    publicationMs,
    wallPublishedAt,
    fallbackCommitSeq,
  ) {
    const trace = publicationTrace(
      market,
      publicationMs,
      wallPublishedAt,
      fallbackCommitSeq,
    );
    Object.assign(market, trace);
    return trace;
  }

  function fullDerivativesPublication({
    mode,
    baseSequence,
    sequence,
    projection = publicDerivativesProjection(state),
  }) {
    return {
      ...projection,
      publicationMode: mode,
      deltaSchema: DERIVATIVES_DELTA_SCHEMA,
      streamId: derivativesStreamId,
      baseSequence,
      sequence,
      changeMask: DERIVATIVES_CADENCE_FIELDS.filter(
        (field) => Object.hasOwn(projection, field),
      ),
    };
  }

  function nextDerivativesPublication(
    projection = publicDerivativesProjection(state),
  ) {
    const sequence = derivativesPublicationSequence + 1;
    let publication = null;
    if (
      !forceNextDerivativesFull &&
      acknowledgedDerivativesProjection &&
      Number.isSafeInteger(acknowledgedDerivativesSequence)
    ) {
      publication = createDerivativesCadenceDelta(
        acknowledgedDerivativesProjection,
        projection,
        {
          streamId: derivativesStreamId,
          baseSequence:
            acknowledgedDerivativesSequence,
          sequence,
        },
      );
    }
    if (!publication) {
      publication = fullDerivativesPublication({
        mode: 'cadence_full',
        baseSequence:
          acknowledgedDerivativesSequence,
        sequence,
        projection,
      });
    }
    derivativesPublicationSequence = sequence;
    forceNextDerivativesFull = false;
    return {
      projection,
      publication,
      sequence,
    };
  }

  function publicationCreditFields(
    kind,
    sequence,
    creditControlled,
  ) {
    if (!publicationCreditEnabled || !creditControlled) return {};
    return {
      publicationCreditSchema: PUBLICATION_CREDIT_SCHEMA,
      publicationKind: kind,
      publicationId:
        `${level2StreamId}:${kind}:${String(sequence).padStart(8, '0')}`,
    };
  }

  function mergePendingSymbols(previous, next) {
    if (previous === null || next === null) return null;
    return [...new Set([...(previous ?? []), ...(next ?? [])])];
  }

  function mergeEligibleAuthorityEvents(previous, next) {
    const byId = new Map();
    for (const event of [
      ...(Array.isArray(previous) ? previous : []),
      ...(Array.isArray(next) ? next : []),
    ]) {
      if (typeof event?.id !== 'string') continue;
      byId.set(event.id, event);
    }
    return [...byId.values()].sort(
      (left, right) =>
        left.virtualMs - right.virtualMs ||
        left.sequence - right.sequence ||
        left.id.localeCompare(right.id),
    );
  }

  function mergePendingTradeDeltas(previous, next) {
    const byId = new Map();
    for (const trade of [
      ...(Array.isArray(previous) ? previous : []),
      ...(Array.isArray(next) ? next : []),
    ]) {
      if (typeof trade?.id !== 'string') continue;
      byId.set(trade.id, trade);
    }
    return [...byId.values()].sort(
      (left, right) =>
        Number(left.virtualMs) - Number(right.virtualMs) ||
        Number(left.sequence) - Number(right.sequence) ||
        left.id.localeCompare(right.id),
    );
  }

  function mergePendingQuoteMarket(previous, next) {
    if (!previous) return next;
    if (!next) return previous;
    const symbols = { ...previous.symbols };
    for (const [symbol, current] of Object.entries(
      next.symbols ?? {},
    )) {
      const prior = previous.symbols?.[symbol];
      symbols[symbol] = prior
        ? {
            ...prior,
            ...current,
            ultraTradeDeltas:
              mergePendingTradeDeltas(
                prior.ultraTradeDeltas,
                current.ultraTradeDeltas,
              ),
          }
        : current;
    }
    return {
      ...previous,
      ...next,
      symbols,
      tradeDeltas: mergePendingTradeDeltas(
        previous.tradeDeltas,
        next.tradeDeltas,
      ),
    };
  }

  function deferLevel2Publication({
    mutationCount,
    fromExclusiveVirtualMs,
    wallPublishedAt,
    symbols,
    eligibleEvents,
  }) {
    if (!pendingLevel2Publication) {
      pendingLevel2Publication = {
        mutationCount,
        fromExclusiveVirtualMs,
        wallPublishedAt,
        symbols: Array.isArray(symbols)
          ? [...new Set(symbols)]
          : null,
        eligibleEvents: mergeEligibleAuthorityEvents(
          [],
          eligibleEvents,
        ),
      };
      return;
    }
    pendingLevel2Publication.mutationCount += mutationCount;
    pendingLevel2Publication.fromExclusiveVirtualMs = Math.min(
      pendingLevel2Publication.fromExclusiveVirtualMs,
      fromExclusiveVirtualMs,
    );
    pendingLevel2Publication.wallPublishedAt =
      wallPublishedAt ??
      pendingLevel2Publication.wallPublishedAt;
    pendingLevel2Publication.symbols = mergePendingSymbols(
      pendingLevel2Publication.symbols,
      Array.isArray(symbols) ? symbols : null,
    );
    pendingLevel2Publication.eligibleEvents =
      mergeEligibleAuthorityEvents(
        pendingLevel2Publication.eligibleEvents,
        eligibleEvents,
      );
  }

  function deferQuotePublication({
    frame,
    frames,
    crossedFrameCount,
    wallPublishedAt,
    resync,
    market,
    derivativesProjection,
    authorityCommitSeq,
    preserveVisibleEndpoint,
  }) {
    if (!pendingQuotePublication) {
      pendingQuotePublication = {
        segments: [],
        current: null,
        frameCount: 0,
        resync: null,
      };
    }
    const pending = pendingQuotePublication;
    const next = {
      frame,
      frames: [...frames],
      crossedFrameCount,
      wallPublishedAt,
      resync: Boolean(resync),
      market,
      derivativesProjection,
      authorityCommitSeq,
      preserveVisibleEndpoint:
        Boolean(preserveVisibleEndpoint),
    };
    if (pending.resync) {
      pending.resync.frame = frame;
      pending.resync.crossedFrameCount += crossedFrameCount;
      pending.resync.wallPublishedAt =
        wallPublishedAt ??
        pending.resync.wallPublishedAt;
      return;
    }
    const queuedCrossedFrameCount =
      pending.segments.reduce(
        (total, segment) =>
          total + segment.crossedFrameCount,
        pending.current?.crossedFrameCount ?? 0,
      );
    if (
      next.resync ||
      pending.frameCount + next.frames.length >
        MAX_PENDING_QUOTE_FRAMES
    ) {
      pending.segments = [];
      pending.current = null;
      pending.frameCount = 0;
      pending.resync = {
        ...next,
        frames: [],
        crossedFrameCount:
          queuedCrossedFrameCount +
          next.crossedFrameCount,
        resync: true,
        market: null,
        derivativesProjection: null,
      };
      return;
    }
    if (!pending.current) {
      pending.current = next;
    } else {
      pending.current.frame = next.frame;
      pending.current.frames.push(...next.frames);
      pending.current.crossedFrameCount +=
        next.crossedFrameCount;
      pending.current.wallPublishedAt =
        next.wallPublishedAt ??
        pending.current.wallPublishedAt;
      // Credit coalescing may replace several fixed endpoints with one
      // publication, but every skipped endpoint's settled tape delta remains
      // part of the recipient information set. Keep the newest quote/depth
      // fields while losslessly accumulating those bounded deltas.
      pending.current.market =
        mergePendingQuoteMarket(
          pending.current.market,
          next.market,
        );
      pending.current.derivativesProjection =
        next.derivativesProjection;
      pending.current.authorityCommitSeq =
        next.authorityCommitSeq;
      pending.current.preserveVisibleEndpoint ||=
        next.preserveVisibleEndpoint;
    }
    pending.frameCount += next.frames.length;
    if (pending.current.preserveVisibleEndpoint) {
      pending.segments.push(pending.current);
      pending.current = null;
    }
  }

  function takePendingQuotePublication() {
    const pending = pendingQuotePublication;
    if (!pending) return null;
    if (pending.resync) {
      pendingQuotePublication = null;
      return pending.resync;
    }
    const next =
      pending.segments.shift() ??
      pending.current;
    if (!next) {
      pendingQuotePublication = null;
      return null;
    }
    if (next === pending.current) {
      pending.current = null;
    }
    pending.frameCount = Math.max(
      0,
      pending.frameCount - next.frames.length,
    );
    if (
      pending.segments.length === 0 &&
      !pending.current
    ) {
      pendingQuotePublication = null;
    }
    return next;
  }

  function emitQuotePublication({
    frame,
    frames = [frame],
    crossedFrameCount = 1,
    wallPublishedAt,
    resync = false,
    creditControlled = true,
    market: preparedMarket = null,
    derivativesProjection = null,
    authorityCommitSeq = null,
    preserveVisibleEndpoint = false,
  }) {
    if (
      publicationCreditEnabled &&
      creditControlled &&
      inFlightQuotePublication
    ) {
      deferQuotePublication({
        frame,
        frames,
        crossedFrameCount,
        wallPublishedAt,
        resync,
        market: preparedMarket,
        derivativesProjection,
        authorityCommitSeq,
        preserveVisibleEndpoint,
      });
      return false;
    }
    const resolvedCommitSeq =
      Number.isSafeInteger(authorityCommitSeq)
        ? authorityCommitSeq
        : state.commitSeq;
    const fullMarket = resync
      ? snapshotMarket(state)
      : preparedMarket ??
        framePublicationWithUltraDeltas(frames);
    const trace = attachPublicationTrace(
      fullMarket,
      frame.virtualMs,
      wallPublishedAt,
      resolvedCommitSeq,
    );
    const market =
      publicationCreditEnabled &&
      creditControlled &&
      !resync
        ? compactLevel2DepthTransport(
            quoteDepthBaseline,
            fullMarket,
          )
        : fullMarket;
    if (
      resync ||
      (
        !creditControlled &&
        inFlightQuotePublication
      )
    ) {
      forceNextDerivativesFull = true;
    }
    const derivatives = nextDerivativesPublication(
      derivativesProjection ??
        publicDerivativesProjection(state),
    );
    quotePublicationSequence += 1;
    const message = {
      type: 'QUOTE_FRAME',
      frame: publicQuoteFrame(frame),
      market,
      derivativesPatch: derivatives.publication,
      commitSeq: resolvedCommitSeq,
      crossedFrameCount,
      resync,
      ...trace,
      ...publicationCreditFields(
        'quote_frame',
        quotePublicationSequence,
        creditControlled,
      ),
    };
    if (publicationCreditEnabled && creditControlled) {
      inFlightQuotePublication = message.publicationId;
      inFlightDerivativesProjection =
        derivatives.projection;
      inFlightDerivativesSequence =
        derivatives.sequence;
    } else {
      acknowledgedDerivativesProjection =
        derivatives.projection;
      acknowledgedDerivativesSequence =
        derivatives.sequence;
    }
    post(message);
    quoteDepthBaseline = fullMarket;
    return true;
  }

  function emitQuoteFrame(frame) {
    return emitQuotePublication({ frame });
  }

  function realtimeLevel2Entitled() {
    const entitlement =
      state?.world?.player?.marketDataEntitlements?.L2_DEPTH_100;
    return Boolean(
      entitlement?.status === 'active' &&
      (
        !Number.isSafeInteger(entitlement.expiresAtTick) ||
        state.world.world.tick < entitlement.expiresAtTick
      ),
    );
  }

  function realtimeEligibleSymbol(symbol) {
    const board = state?.world?.market?.securities?.[symbol]?.board;
    return board === 'star' || board === 'chinext';
  }

  function stockCommandSymbol(command) {
    if (command.type === 'submit_order') {
      return Object.hasOwn(state.books ?? {}, command.symbol)
        ? command.symbol
        : null;
    }
    if (command.type !== 'cancel_order') return null;
    for (const [symbol, book] of Object.entries(state.books ?? {})) {
      if (
        Object.hasOwn(book?.orders ?? {}, command.orderId)
      ) {
        return symbol;
      }
    }
    return null;
  }

  function realtimeCommandSymbols(command) {
    const symbol = stockCommandSymbol(command);
    if (symbol && realtimeEligibleSymbol(symbol)) return [symbol];
    return [];
  }

  function successfulBookMutation(receipt) {
    return Boolean(
      receipt &&
      receipt.reason === null &&
      receipt.status !== 'rejected' &&
      (
        receipt.type === 'submit_order' ||
        receipt.type === 'cancel_order'
      ),
    );
  }

  function eligibleEventTrace(event, result, draft) {
    if (!event || !LEVEL2_BOOK_EVENT_TYPES.has(event.type)) {
      return null;
    }
    if (event.type === 'world_day_settlement') {
      const symbols = Object.keys(draft.books ?? {})
        .filter((symbol) => realtimeEligibleSymbol(symbol))
        .sort();
      return symbols.length === 0
        ? null
        : {
            id: event.id,
            type: event.type,
            virtualMs: event.scheduledMs,
            sequence: event.sequence,
            symbols,
            mutationCount: 1,
          };
    }
    const commands =
      event.type === 'agent_command_batch'
        ? event.payload.commands
        : [event.payload];
    const receipts = Array.isArray(result)
      ? result
      : [result];
    const symbols = new Set();
    let mutationCount = 0;
    for (let index = 0; index < commands.length; index += 1) {
      const command = commands[index];
      const receipt = receipts[index];
      if (!successfulBookMutation(receipt)) continue;
      const symbol =
        command.type === 'submit_order'
          ? command.symbol
          : receipt.symbol ?? stockCommandSymbol(command);
      if (!symbol || !realtimeEligibleSymbol(symbol)) continue;
      symbols.add(symbol);
      mutationCount += 1;
    }
    return mutationCount === 0
      ? null
      : {
          id: event.id,
          type: event.type,
          virtualMs: event.scheduledMs,
          sequence: event.sequence,
          symbols: [...symbols].sort(),
          mutationCount,
        };
  }

  function externalCommandEventTrace(command, receipt, symbols) {
    if (
      !successfulBookMutation(receipt) ||
      !Array.isArray(symbols) ||
      symbols.length === 0
    ) {
      return null;
    }
    return {
      id: receipt.id,
      type: 'command',
      virtualMs: receipt.virtualMs,
      sequence: receipt.commitSeq,
      symbols: [...new Set(symbols)].sort(),
      mutationCount: 1,
    };
  }

  function restrictRealtimeMarket(market, symbols) {
    if (!Array.isArray(symbols)) return market;
    const symbolSet = new Set(
      symbols.filter((symbol) => realtimeEligibleSymbol(symbol)),
    );
    market.symbols = Object.fromEntries(
      Object.entries(market.symbols ?? {}).filter(([symbol]) =>
        symbolSet.has(symbol),
      ),
    );
    market.activeOrders = (market.activeOrders ?? []).filter((order) =>
      symbolSet.has(order.symbol),
    );
    market.tradeDeltas = (market.tradeDeltas ?? []).filter((trade) =>
      symbolSet.has(trade.symbol),
    );
    return market;
  }

  function emitRealtimeLevel2({
    mutationCount = 0,
    fromExclusiveVirtualMs = state?.nowMs ?? 0,
    resync = false,
    wallPublishedAt,
    symbols = null,
    eligibleEvents = [],
    creditControlled = true,
  } = {}) {
    if (!realtimeLevel2Entitled()) return false;
    if (
      Array.isArray(symbols) &&
      !symbols.some((symbol) => realtimeEligibleSymbol(symbol))
    ) {
      return false;
    }
    if (
      publicationCreditEnabled &&
      creditControlled &&
      inFlightLevel2Publication &&
      !resync
    ) {
      deferLevel2Publication({
        mutationCount,
        fromExclusiveVirtualMs,
        wallPublishedAt,
        symbols,
        eligibleEvents,
      });
      return false;
    }
    const fullMarket = restrictRealtimeMarket(
      snapshotRealtimeLevel2(state, {
        afterCommitSeq: resync ? -1 : lastLevel2CommitSeq,
        afterVirtualMs:
          resync ? -1 : fromExclusiveVirtualMs,
        symbols: Array.isArray(symbols) ? symbols : null,
      }),
      symbols,
    );
    if (!fullMarket) return false;
    if (
      !resync &&
      mutationCount === 0 &&
      fullMarket.commitSeq <= lastLevel2CommitSeq
    ) {
      return false;
    }
    const market =
      resync
        ? fullMarket
        : compactLevel2DepthTransport(
            acknowledgedLevel2Projection,
            fullMarket,
          );
    const previousSequence = resync ? null : level2Sequence;
    level2Sequence += 1;
    const actualWallPublishedAt = now();
    const trace = attachPublicationTrace(
      market,
      state.nowMs,
      actualWallPublishedAt,
    );
    const message = {
      type: 'LEVEL2_UPDATE',
      schema: 'lzy_level2_realtime_v1',
      streamId: level2StreamId,
      sequence: level2Sequence,
      previousSequence,
      fromExclusiveVirtualMs,
      throughVirtualMs: state.nowMs,
      commitSeq: state.commitSeq,
      mutationCount,
      authorityTrace: {
        schema: LEVEL2_AUTHORITY_TRACE_SCHEMA,
        eligibleEventCount: eligibleEvents.length,
        eligibleMutationCount: mutationCount,
        // One authority mutation can be painted without coalescing. Every
        // additional mutation represented by this publication is an explicit
        // merged delta, whether it came from one batch event or a deferred
        // publication window.
        mergedDeltaCount: Math.max(0, mutationCount - 1),
        eligibleEvents: cloneValue(eligibleEvents),
      },
      resync,
      market,
      ...trace,
      ...publicationCreditFields(
        'level2',
        level2Sequence,
        creditControlled,
      ),
    };
    if (publicationCreditEnabled && creditControlled) {
      inFlightLevel2Publication = message.publicationId;
      inFlightLevel2Projection =
        mergeLevel2ProjectionBaseline(
          acknowledgedLevel2Projection,
          fullMarket,
        );
    } else {
      acknowledgedLevel2Projection =
        mergeLevel2ProjectionBaseline(
          acknowledgedLevel2Projection,
          fullMarket,
        );
      inFlightLevel2Projection = null;
    }
    post(message);
    lastLevel2CommitSeq = state.commitSeq;
    return true;
  }

  function framePublicationWithUltraDeltas(
    frames,
    sourceState = state,
  ) {
    const market = snapshotMarket(sourceState, {
      framePublication: true,
      transportOwned: true,
    });
    const visibleThroughMs = Number(
      frames.at(-1)?.virtualMs,
    );
    const visibleAfterMs = Number(
      frames[0]?.virtualMs,
    ) - (sourceState.quoteFrameMs ?? 3_000);
    // READY and SAVE_BARRIER are the full-history resync surfaces. A quote
    // publication carries only the newly visible tape interval; the client
    // already materializes a bounded, ordered trade history from deltas.
    // Re-sending every live trade on every 9s endpoint made transport work
    // grow with the live window and consumed the 16× command budget.
    market.tradeDeltas = (market.trades ?? []).filter(
      (trade) =>
        // A later authority mutation may settle at the exact millisecond of
        // the prior visible endpoint. Re-sending that boundary is harmless
        // because the client deduplicates by trade id; excluding it would
        // permanently hide same-millisecond fills that committed after the
        // earlier publication.
        Number(trade.virtualMs) >= visibleAfterMs &&
        Number(trade.virtualMs) <= visibleThroughMs,
    );
    delete market.trades;
    for (const symbol of Object.keys(market.symbols ?? {})) {
      const symbolPublication = market.symbols[symbol];
      if (symbolPublication.level2Depth) {
        // The top-ten rows are an exact prefix of the same authoritative
        // depth.  Transport the depth once; the client materializes that
        // prefix before publishing the frame to the UI.
        delete symbolPublication.bids;
        delete symbolPublication.asks;
      }
      const byId = new Map();
      for (const trade of [
        ...frames.flatMap(
          (frame) =>
            frame?.symbols?.[symbol]?.ultraTradeDeltas ?? [],
        ),
        ...(symbolPublication.ultraTradeDeltas ?? []),
      ]) {
        const id =
          typeof trade?.id === 'string'
            ? trade.id
            : `${symbol}:${trade?.virtualMs}:${trade?.sequence}`;
        byId.set(id, trade);
      }
      symbolPublication.ultraTradeDeltas =
        [...byId.values()].sort(
          (left, right) =>
            Number(left.virtualMs) - Number(right.virtualMs) ||
            Number(left.sequence) - Number(right.sequence) ||
            String(left.id).localeCompare(String(right.id)),
        );
    }
    return market;
  }

  function advanceAndEmit(
    targetMs,
    {
      verifyState = true,
      reuseVerifiedArchives = false,
      wallPublishedAt = null,
      creditControlled = true,
      shouldYield = null,
      performanceEventTrace = null,
    } = {},
  ) {
    requireState();
    if (!Number.isSafeInteger(targetMs) || targetMs < state.nowMs) {
      throw new RangeError(
        'Virtual target must be an integer at or after current market time.',
      );
    }
    let crossedFrameCount = 0;
    let latestCrossedFrame = null;
    const crossedFrames = [];
    const fixedEndpointPublications = [];
    const preserveFixedVisibleEndpoints =
      publicationCreditEnabled &&
      creditControlled;
    const coalesceAcceleratedQuoteEndpoints =
      preserveFixedVisibleEndpoints &&
      speed === 16;
    let fixedEndpointSegmentFrames =
      coalesceAcceleratedQuoteEndpoints
        ? deferredFixedEndpointFrames
        : [];
    deferredFixedEndpointFrames = [];
    let level2MutationCount = 0;
    let level2EligibleEvents = [];
    let firstLevel2MutationMs = state.nowMs;
    let latestSpatialMotion = null;
    let sharedWallPublishedAt = wallPublishedAt;
    const publicationWallTime = () => {
      sharedWallPublishedAt ??= now();
      return sharedWallPublishedAt;
    };
    let priorEventWallAt =
      performanceEventTrace ? now() : null;
    advanceTo(state, targetMs, {
      onEvent(event, _result, draft) {
        if (performanceEventTrace) {
          const eventWallAt = now();
          const durationMs =
            eventWallAt - priorEventWallAt;
          priorEventWallAt = eventWallAt;
          performanceEventTrace.count += 1;
          performanceEventTrace.byType[event.type] =
            (performanceEventTrace.byType[event.type] ?? 0) +
            1;
          performanceEventTrace.durationMs += durationMs;
          performanceEventTrace.durationByType[event.type] =
            (
              performanceEventTrace.durationByType[
                event.type
              ] ?? 0
            ) + durationMs;
          if (
            !performanceEventTrace.slowest ||
            durationMs >
              performanceEventTrace.slowest.durationMs
          ) {
            performanceEventTrace.slowest = {
              type: event.type,
              scheduledMs: event.scheduledMs,
              durationMs,
            };
          }
        }
        const eligibleEvent = eligibleEventTrace(
          event,
          _result,
          draft,
        );
        if (eligibleEvent) {
          if (level2MutationCount === 0) {
            firstLevel2MutationMs = Math.max(
              0,
              event.scheduledMs - 1,
            );
          }
          level2MutationCount +=
            eligibleEvent.mutationCount;
          level2EligibleEvents.push(eligibleEvent);
        }
        if (event.type === 'player_motion_step') {
          latestSpatialMotion = {
            scheduledMs: event.scheduledMs,
            commitSeq: draft.commitSeq,
          };
        }
        if (event.type !== 'quote_frame') return;
        crossedFrameCount += 1;
        latestCrossedFrame = draft.quoteFrames.at(-1);
        crossedFrames.push(latestCrossedFrame);
        if (!preserveFixedVisibleEndpoints) return;
        fixedEndpointSegmentFrames.push(
          latestCrossedFrame,
        );
        if (
          latestCrossedFrame.virtualMs %
            NORMAL_VISIBLE_QUOTE_INTERVAL_MS !==
          0
        ) {
          return;
        }
        fixedEndpointPublications.push({
          frame: latestCrossedFrame,
          frames: fixedEndpointSegmentFrames,
          crossedFrameCount:
            fixedEndpointSegmentFrames.length,
          market: framePublicationWithUltraDeltas(
            fixedEndpointSegmentFrames,
            draft,
          ),
          derivativesProjection:
            publicDerivativesProjection(draft),
          authorityCommitSeq: draft.commitSeq,
          preserveVisibleEndpoint: true,
        });
        fixedEndpointSegmentFrames = [];
      },
      verifyState,
      reuseVerifiedArchives,
      shouldYield,
      deferWorldOrderMirrorFlush: !verifyState,
    });
    if (verifyState) noteFullVerification();
    if (latestSpatialMotion) {
      post({
        type: 'WORLD2D_UPDATE',
        worldPatch: publicWorldSpatialPatch(state),
        authorityTrace: {
          schema: 'lzy_world2d_authority_trace_v1',
          eventType: 'player_motion_step',
          scheduledMs: latestSpatialMotion.scheduledMs,
          authorityCommitSeq: latestSpatialMotion.commitSeq,
        },
        wallPublishedAt: publicationWallTime(),
      });
    }
    if (level2MutationCount > 0) {
      const affectedSymbols = [
        ...new Set(
          level2EligibleEvents.flatMap(
            (event) => event.symbols,
          ),
        ),
      ].sort();
      emitRealtimeLevel2({
        mutationCount: level2MutationCount,
        fromExclusiveVirtualMs: firstLevel2MutationMs,
        wallPublishedAt: publicationWallTime(),
        symbols: affectedSymbols,
        eligibleEvents: level2EligibleEvents,
        creditControlled,
      });
    }
    if (
      !latestCrossedFrame &&
      coalesceAcceleratedQuoteEndpoints &&
      fixedEndpointSegmentFrames.length > 0
    ) {
      // A Level-2/event wake can fall between quote boundaries. Preserve the
      // already crossed frames until the next fixed visible endpoint instead
      // of silently dropping their ordinary tape interval.
      deferredFixedEndpointFrames =
        fixedEndpointSegmentFrames;
    }
    if (latestCrossedFrame) {
      if (preserveFixedVisibleEndpoints) {
        if (fixedEndpointSegmentFrames.length > 0) {
          if (coalesceAcceleratedQuoteEndpoints) {
            deferredFixedEndpointFrames =
              fixedEndpointSegmentFrames;
          } else {
            fixedEndpointPublications.push({
              frame: fixedEndpointSegmentFrames.at(-1),
              frames: fixedEndpointSegmentFrames,
              crossedFrameCount:
                fixedEndpointSegmentFrames.length,
              market: framePublicationWithUltraDeltas(
                fixedEndpointSegmentFrames,
                state,
              ),
              derivativesProjection:
                publicDerivativesProjection(state),
              authorityCommitSeq: state.commitSeq,
              preserveVisibleEndpoint: false,
            });
          }
        }
        for (const publication of fixedEndpointPublications) {
          emitQuotePublication({
            ...publication,
            wallPublishedAt: publicationWallTime(),
            creditControlled,
          });
        }
      } else {
        emitQuotePublication({
          frame: latestCrossedFrame,
          frames: crossedFrames,
          crossedFrameCount,
          wallPublishedAt: publicationWallTime(),
          creditControlled,
        });
      }
    }
    return state.nowMs === targetMs;
  }

  function mappedVirtualMs(wallMs) {
    const elapsedMs = Math.max(0, wallMs - wallAnchorMs);
    return (
      virtualAnchorMs +
      Math.floor(elapsedMs * speed * NORMAL_VIRTUAL_RATE)
    );
  }

  function syncToWall({
    rebase = false,
    verifyState = true,
    verifyPeriodically = false,
    yieldToCommands = false,
    wallSliceBudgetMs =
      PLAYBACK_WALL_SLICE_BUDGET_MS_BY_SPEED[speed],
    performanceTrace = null,
  } = {}) {
    const wallMs = now();
    const targetMs = mappedVirtualMs(wallMs);
    const periodicVerification =
      !verifyState &&
      verifyPeriodically &&
      (
        yieldToCommands
          ? state.nowMs
          : targetMs
      ) -
        lastVerifiedVirtualMs >=
        PLAYBACK_VERIFICATION_INTERVAL_MS;
    const shouldVerify =
      verifyState || periodicVerification;
    const performanceEventTrace = performanceTrace
      ? {
          count: 0,
          byType: {},
          durationMs: 0,
          durationByType: {},
          slowest: null,
        }
      : null;
    const caughtUp = advanceAndEmit(targetMs, {
      verifyState: shouldVerify,
      reuseVerifiedArchives:
        periodicVerification,
      wallPublishedAt: wallMs,
      performanceEventTrace,
      shouldYield:
        yieldToCommands &&
        targetMs > state.nowMs
          ? () =>
              now() - wallMs >=
              wallSliceBudgetMs
          : null,
    });
    if (performanceTrace) {
      performanceTrace.catchUpEvents =
        performanceEventTrace;
    }
    if (rebase && caughtUp) {
      wallAnchorMs = wallMs;
      virtualAnchorMs = state.nowMs;
    }
    return wallMs;
  }

  function verifyCurrentState() {
    requireState();
    if (
      lastVerifiedVirtualMs === state.nowMs &&
      lastVerifiedCommitSeq === state.commitSeq
    ) {
      return;
    }
    advanceAndEmit(state.nowMs, { verifyState: true });
  }

  function scheduleNextWake() {
    clearWake();
    if (!playing || destroyed) return;
    const wallMs = now();
    const outstandingVirtualDebt =
      mappedVirtualMs(wallMs) >
      state.nowMs;
    const virtualRate = speed * NORMAL_VIRTUAL_RATE;
    const nextBoundaryMs =
      (Math.floor(state.nowMs / state.quoteFrameMs) + 1) *
      state.quoteFrameMs;
    const nextQueuedEvent = state.eventQueue?.[0];
    const nextEventMs =
      (
        realtimeLevel2Entitled() ||
        nextQueuedEvent?.type === 'player_motion_step'
      ) &&
      Number.isSafeInteger(nextQueuedEvent?.scheduledMs)
        ? nextQueuedEvent.scheduledMs
        : null;
    const nextTargetMs =
      nextEventMs !== null && nextEventMs < nextBoundaryMs
        ? nextEventMs
        : nextBoundaryMs;
    const wallTargetFor = (virtualMs) =>
      wallAnchorMs +
      (virtualMs - virtualAnchorMs) / virtualRate;
    const boundaryDelayMs = Math.max(
      0,
      wallTargetFor(nextBoundaryMs) - wallMs,
    );
    let delayMs = Math.max(
      0,
      wallTargetFor(nextTargetMs) - wallMs,
    );
    if (outstandingVirtualDebt) {
      // A cooperative slice yielded CPU while the authority clock was still
      // behind wall time. Continue on the next task turn; the 32ms Level-2
      // paint cadence is a publication limit, not permission to leave
      // deterministic market work asleep.
      delayMs =
        PLAYBACK_FAIRNESS_DELAY_MS_BY_SPEED[speed];
    } else if (nextTargetMs !== nextBoundaryMs) {
      delayMs = Math.min(
        boundaryDelayMs,
        Math.max(
          LEVEL2_MIN_WALL_INTERVAL_MS,
          delayMs,
        ),
      );
    }
    // Keep sub-millisecond authority boundaries exact. Browsers may clamp the
    // timer themselves, but rounding every fractional remainder up to a full
    // millisecond can put a fixed quote endpoint behind its wall mapping. Only
    // guard the true floating-point no-progress case.
    if (wallMs + delayMs <= wallMs) {
      delayMs = 1;
    }
    timerId = scheduleTimeout(wake, delayMs);
  }

  function wake() {
    timerId = null;
    if (!playing || destroyed) return;
    const startedAt = now();
    const playbackTaskTrace = {
      startedAt,
      postMs: 0,
      postCount: 0,
      postByType: {},
      totalMs: null,
      nonPostMs: null,
    };
    activePlaybackTaskTrace = playbackTaskTrace;
    try {
      syncToWall({
        verifyState: false,
        verifyPeriodically: true,
        yieldToCommands: true,
      });
      scheduleNextWake();
    } catch (error) {
      playing = false;
      clearWake();
      post({
        type: 'ERROR',
        requestId: null,
        requestType: 'PLAY',
        message: errorMessage(error),
      });
    } finally {
      playbackTaskTrace.totalMs = now() - startedAt;
      playbackTaskTrace.nonPostMs =
        playbackTaskTrace.totalMs - playbackTaskTrace.postMs;
      lastPlaybackTaskTrace = playbackTaskTrace;
      activePlaybackTaskTrace = null;
    }
  }

  function acknowledge(message, extra = {}) {
    const acknowledgement = {
      type: 'COMMAND_ACK',
      requestId: message.requestId ?? null,
      requestType: message.type,
      playing,
      speed,
      commitSeq: state?.commitSeq ?? null,
      ...extra,
    };
    const trace = acknowledgement.performanceTrace;
    if (
      trace &&
      typeof trace === 'object' &&
      trace.messageBytes !== null
    ) {
      trace.messageBytes = 0;
      const encoder = new TextEncoder();
      const zeroBytes = encoder.encode(
        JSON.stringify(acknowledgement),
      ).byteLength;
      let exactBytes = zeroBytes;
      while (true) {
        const nextBytes =
          zeroBytes - 1 + String(exactBytes).length;
        if (nextBytes === exactBytes) break;
        exactBytes = nextBytes;
      }
      trace.messageBytes = exactBytes;
    }
    post(acknowledgement);
  }

  function runWorldCommand(message) {
    requireState();
    const command = externalWorldCommand(message.command);
    const traceRequest = message.performanceTrace;
    const traced =
      traceRequest === true ||
      (
        traceRequest !== null &&
        typeof traceRequest === 'object' &&
        !Array.isArray(traceRequest)
      );
    const measureMessageBytes =
      traceRequest === true ||
      traceRequest?.messageBytes !== false;
    const performanceTrace = traced
      ? {
          schema:
            'lzy_world_command_performance_trace_v1',
          targetSymbol: null,
          commitSeq: null,
          fillCount: 0,
          cloneRoots: 0,
          phases: [],
          publicationCredit: null,
          messageBytes: measureMessageBytes ? 0 : null,
          realtimeAudit: null,
          catchUpEvents: null,
          projectionParts: null,
          previousPlaybackTask:
            lastPlaybackTaskTrace
              ? cloneValue(lastPlaybackTaskTrace)
              : null,
          previousPublicationAck:
            lastPublicationAckTrace
              ? cloneValue(lastPublicationAckTrace)
              : null,
        }
      : null;
    const tracePhase = (name) => {
      performanceTrace?.phases.push({
        name,
        wallAt: now(),
      });
    };
    const incrementalOrder =
      command.type === 'submit_order' ||
      command.type === 'cancel_order';
    const incrementalSpatial =
      command.type === 'player_control';
    const incrementalCommand =
      incrementalOrder || incrementalSpatial;
    const commandSymbol = incrementalOrder
      ? stockCommandSymbol(command)
      : null;
    if (performanceTrace) {
      performanceTrace.targetSymbol =
        commandSymbol;
      // The incremental transaction clones one target book plus eight
      // explicitly named authority roots. This is structural diagnostics,
      // not a traversal that would itself distort the measured command.
      performanceTrace.cloneRoots = incrementalSpatial
        ? 4
        : incrementalOrder && commandSymbol
          ? 9
          : 1;
    }
    const realtimeSymbols = incrementalOrder
      ? realtimeCommandSymbols(command)
      : [];
    const realtimeAuditBefore = performanceTrace
      ? {
          liveChainCount:
            state.realtimeAuditArchive
              ?.liveChainCount ?? null,
          totalArchivedChains:
            state.realtimeAuditArchive
              ?.totalArchivedChains ?? null,
        }
      : null;

    tracePhase('accepted');
    if (playing) {
      syncToWall({
        rebase: true,
        verifyState: !incrementalCommand,
        // A playing order first performs a bounded deterministic catch-up and
        // then its command-local proof.  Periodic full scans remain owned by
        // playback wakes and barriers so crossing the five-minute audit
        // cadence cannot turn one otherwise identical order into a long UI
        // stall.
        verifyPeriodically: false,
        yieldToCommands: incrementalCommand,
        wallSliceBudgetMs:
          COMMAND_WALL_SLICE_BUDGET_MS_BY_SPEED[speed],
        performanceTrace,
      });
    } else if (!incrementalCommand) {
      verifyCurrentState();
    }
    try {
      tracePhase('match');
      const transactionParts =
        performanceTrace ? {} : null;
      const transaction = processExternalCommand(state, command, {
        verification: incrementalCommand ? 'incremental' : 'full',
        performanceTrace: transactionParts,
        reuseVerifiedArchives: incrementalCommand,
      });
      if (performanceTrace) {
        performanceTrace.transactionParts =
          transactionParts;
      }
      tracePhase('settle');
      tracePhase('commit');
      if (incrementalOrder) {
        orderCommandsSinceFullVerification += 1;
        if (performanceTrace) {
          performanceTrace.orderCommandOrdinal =
            orderCommandsSinceFullVerification;
          performanceTrace.postCommandVerificationMs = 0;
        }
      } else if (!incrementalSpatial) {
        noteFullVerification();
      }
      for (const frame of transaction.quoteFrames) {
        emitQuoteFrame(frame);
      }
      const receipt = publicReceipt(transaction.receipt);
      if (incrementalOrder) {
        const precedingEligibleEvents =
          transaction.precedingEvents
            .map(({ event, result }) =>
              eligibleEventTrace(event, result, state),
            )
            .filter(Boolean);
        const commandEligibleEvent =
          externalCommandEventTrace(
            command,
            receipt,
            realtimeSymbols,
          );
        const eligibleEvents = commandEligibleEvent
          ? [
              ...precedingEligibleEvents,
              commandEligibleEvent,
            ]
          : precedingEligibleEvents;
        if (eligibleEvents.length > 0) {
          const eligibleSymbols = [
            ...new Set(
              eligibleEvents.flatMap(
                (event) => event.symbols,
              ),
            ),
          ].sort();
          emitRealtimeLevel2({
            mutationCount: eligibleEvents.reduce(
              (sum, event) =>
                sum + event.mutationCount,
              0,
            ),
            fromExclusiveVirtualMs: Math.max(
              0,
              Math.min(
                ...eligibleEvents.map(
                  (event) => event.virtualMs,
                ),
              ) - 1,
            ),
            symbols: eligibleSymbols,
            eligibleEvents,
          });
        }
      }
      if (playing) {
        scheduleNextWake();
      }
      let commandProjection;
      if (incrementalOrder && commandSymbol) {
        const marketPatchStartedAt =
          performanceTrace ? now() : null;
        const marketPatch = snapshotMarketCommandPatch(state, {
          symbol: commandSymbol,
        });
        const marketPatchBuiltAt =
          performanceTrace ? now() : null;
        const worldPatch = publicWorldCommandPatch(
          state,
          commandSymbol,
        );
        if (performanceTrace) {
          const worldPatchBuiltAt = now();
          performanceTrace.projectionParts = {
            marketPatchMs:
              marketPatchBuiltAt -
              marketPatchStartedAt,
            worldPatchMs:
              worldPatchBuiltAt -
              marketPatchBuiltAt,
          };
        }
        commandProjection = {
          marketPatch,
          worldPatch,
        };
      } else if (incrementalOrder) {
        commandProjection = {};
      } else if (incrementalSpatial) {
        commandProjection = {
          worldPatch: publicWorldSpatialPatch(state),
        };
      } else {
        const market = snapshotMarket(state, {
          framePublication: true,
        });
        quoteDepthBaseline = market;
        commandProjection = {
          market,
          world: publicWorldEnvelope(state),
        };
      }
      tracePhase('delta_built');
      if (performanceTrace) {
        performanceTrace.commitSeq =
          state.commitSeq;
        performanceTrace.fillCount =
          transaction.receipt.tradeIds?.length ??
          0;
        performanceTrace.publicationCredit = {
          enabled: publicationCreditEnabled,
          inFlightLevel2:
            inFlightLevel2Publication !== null,
          inFlightQuote:
            inFlightQuotePublication !== null,
          pendingLevel2:
            pendingLevel2Publication !== null,
          pendingQuote:
            pendingQuotePublication !== null,
        };
        performanceTrace.realtimeAudit = {
          before:
            realtimeAuditBefore,
          after: {
            liveChainCount:
              state.realtimeAuditArchive
                ?.liveChainCount ?? null,
            totalArchivedChains:
              state.realtimeAuditArchive
                ?.totalArchivedChains ?? null,
          },
        };
      }
      tracePhase('post');
      acknowledge(message, {
        receipt,
        ...commandProjection,
        ...(transaction.derivativesPatch
          ? {
              derivativesPatch: redactPrivatePublication(
                cloneValue(transaction.derivativesPatch),
              ),
            }
          : {}),
        ...(performanceTrace
          ? { performanceTrace }
          : {}),
      });
    } catch (error) {
      if (playing) {
        scheduleNextWake();
      }
      throw error;
    }
  }

  function advanceWorldDays(message) {
    requireState();
    assertWorldDays(message.days);
    if (playing) syncToWall({ rebase: true });
    playing = false;
    clearWake();
    const targetMs =
      state.lastWorldDaySettlementMs + message.days * state.worldDayMs;
    if (!Number.isSafeInteger(targetMs) || targetMs < state.nowMs) {
      throw new RangeError('ADVANCE_WORLD_DAYS produced an invalid target.');
    }
    advanceAndEmit(targetMs, { creditControlled: false });
    const market = snapshotMarket(state);
    quoteDepthBaseline = market;
    acknowledge(message, {
      days: message.days,
      frame: publicQuoteFrame(state.quoteFrames.at(-1)),
      tick: state.world.world.tick,
      market,
      world: publicWorldEnvelope(state),
    });
  }

  function advanceVirtualTime(message) {
    requireState();
    assertVirtualDuration(message.durationMs);
    if (playing) syncToWall({ rebase: true });
    playing = false;
    clearWake();
    const targetMs = state.nowMs + message.durationMs;
    if (!Number.isSafeInteger(targetMs) || targetMs < state.nowMs) {
      throw new RangeError('ADVANCE_VIRTUAL_TIME produced an invalid target.');
    }
    advanceAndEmit(targetMs, { creditControlled: false });
    const market = snapshotMarket(state);
    quoteDepthBaseline = market;
    acknowledge(message, {
      durationMs: message.durationMs,
      frame: state.quoteFrames.at(-1)
        ? publicQuoteFrame(state.quoteFrames.at(-1))
        : null,
      tick: state.world.world.tick,
      market,
      world: publicWorldEnvelope(state),
    });
  }

  function saveBarrier(message) {
    requireState();
    if (playing) syncToWall({ rebase: true });
    else verifyCurrentState();
    const checkpoint = canonicalMarketState(state);
    const commitSeq = checkpoint.commitSeq;
    const market = snapshotMarket(state);
    quoteDepthBaseline = market;
    post({
      type: 'WORLD_SNAPSHOT',
      requestId: message.requestId ?? null,
      requestType: message.type,
      commitSeq,
      checkpoint,
      market,
      world: {
        commitSeq,
        state: checkpoint.world,
      },
      worldProjection: publicWorldEnvelope(state),
    });
    if (playing) scheduleNextWake();
  }

  function enablePublicationCredit(message) {
    if (
      message.schema !== PUBLICATION_CREDIT_SCHEMA ||
      message.maxInFlightPerKind !== 1
    ) {
      throw new RangeError(
        'Market publication credit requires the supported schema and one in-flight publication per kind.',
      );
    }
    publicationCreditEnabled = true;
    acknowledge(message, {
      publicationCreditSchema: PUBLICATION_CREDIT_SCHEMA,
      maxInFlightPerKind: 1,
    });
  }

  function acknowledgeMarketPublication(message) {
    const startedAt = now();
    const finishTrace = (outcome) => {
      lastPublicationAckTrace = {
        startedAt,
        totalMs: now() - startedAt,
        kind: message?.publicationKind ?? null,
        outcome,
      };
    };
    if (
      !publicationCreditEnabled ||
      message.publicationCreditSchema !==
        PUBLICATION_CREDIT_SCHEMA ||
      typeof message.publicationId !== 'string'
    ) {
      finishTrace('ignored_invalid');
      return;
    }
    if (message.publicationKind === 'level2') {
      if (message.publicationId !== inFlightLevel2Publication) {
        finishTrace('ignored_stale');
        return;
      }
      inFlightLevel2Publication = null;
      if (inFlightLevel2Projection) {
        acknowledgedLevel2Projection =
          inFlightLevel2Projection;
      }
      inFlightLevel2Projection = null;
      const pending = pendingLevel2Publication;
      pendingLevel2Publication = null;
      if (pending) emitRealtimeLevel2(pending);
      completePendingPause();
      finishTrace(pending ? 'flushed_pending' : 'acknowledged');
      return;
    }
    if (message.publicationKind !== 'quote_frame') {
      finishTrace('ignored_kind');
      return;
    }
    if (message.publicationId !== inFlightQuotePublication) {
      finishTrace('ignored_stale');
      return;
    }
    inFlightQuotePublication = null;
    if (
      inFlightDerivativesProjection &&
      Number.isSafeInteger(inFlightDerivativesSequence) &&
      inFlightDerivativesSequence >
        acknowledgedDerivativesSequence
    ) {
      acknowledgedDerivativesProjection =
        inFlightDerivativesProjection;
      acknowledgedDerivativesSequence =
        inFlightDerivativesSequence;
    }
    inFlightDerivativesProjection = null;
    inFlightDerivativesSequence = null;
    const pending = takePendingQuotePublication();
    if (pending) {
      emitQuotePublication({
        ...pending,
        wallPublishedAt: now(),
      });
    }
    completePendingPause();
    finishTrace(pending ? 'flushed_pending' : 'acknowledged');
  }

  function completePendingPause() {
    if (
      !pendingPauseMessage ||
      inFlightLevel2Publication !== null ||
      inFlightQuotePublication !== null ||
      pendingLevel2Publication !== null ||
      pendingQuotePublication !== null
    ) {
      return false;
    }
    const message = pendingPauseMessage;
    pendingPauseMessage = null;
    const market = snapshotMarket(state, {
      framePublication: true,
    });
    quoteDepthBaseline = market;
    acknowledge(message, {
      frame: state.quoteFrames.at(-1)
        ? publicQuoteFrame(state.quoteFrames.at(-1))
        : null,
      market,
    });
    return true;
  }

  function handleMessage({ data } = {}) {
    const message = data;
    if (destroyed) return;
    try {
      if (!message || typeof message.type !== 'string') {
        throw new TypeError('Worker message requires a type.');
      }

      switch (message.type) {
        case 'INIT': {
          if (
            message.testingAccessOpen !== undefined &&
            typeof message.testingAccessOpen !==
              'boolean'
          ) {
            throw new TypeError(
              'INIT testingAccessOpen must be a boolean.',
            );
          }
          clearWake();
          playing = false;
          speed = 1;
          const auditColdStore =
            auditColdStoreForInit(message) ??
            simulationOptions.auditColdStore;
          state = createMarketSimulation(
            cloneValue(message.world),
            message.savedState ? cloneValue(message.savedState) : null,
            {
              ...simulationOptions,
              auditColdStore,
              testingAccessOpen:
                message.testingAccessOpen === true,
            },
          );
          wallAnchorMs = now();
          virtualAnchorMs = state.nowMs;
          lastVerifiedVirtualMs = state.nowMs;
          lastVerifiedCommitSeq = state.commitSeq;
          orderCommandsSinceFullVerification = 0;
          level2StreamId =
            `${state.world.world.id}:${state.nowMs}:${state.commitSeq}`;
          level2Sequence = 0;
          lastLevel2CommitSeq = state.commitSeq;
          quotePublicationSequence = 0;
          derivativesStreamId =
            `${state.world.world.id}:derivatives:${state.nowMs}:${state.commitSeq}`;
          derivativesPublicationSequence = 0;
          acknowledgedDerivativesSequence = 0;
          acknowledgedDerivativesProjection =
            publicDerivativesProjection(state);
          inFlightDerivativesProjection = null;
          inFlightDerivativesSequence = null;
          forceNextDerivativesFull = true;
          publicationCreditEnabled = false;
          acknowledgedLevel2Projection =
            snapshotRealtimeLevel2(state, {
              afterCommitSeq: -1,
            });
          inFlightLevel2Projection = null;
          inFlightLevel2Publication = null;
          inFlightQuotePublication = null;
          pendingLevel2Publication = null;
          pendingQuotePublication = null;
          quoteDepthBaseline = null;
          deferredFixedEndpointFrames = [];
          pendingPauseMessage = null;
          const readyDerivatives =
            fullDerivativesPublication({
              mode: 'snapshot',
              baseSequence: null,
              sequence: 0,
              projection:
                acknowledgedDerivativesProjection,
            });
          const readyMarket = snapshotMarket(state);
          quoteDepthBaseline = readyMarket;
          post({
            type: 'READY',
            requestId: message.requestId ?? null,
            requestType: message.type,
            commitSeq: state.commitSeq,
            market: readyMarket,
            world: publicWorldEnvelope(state, {
              derivatives: readyDerivatives,
            }),
          });
          return;
        }
        case 'PLAY':
          requireState();
          if (!playing) {
            playing = true;
            wallAnchorMs = now();
            virtualAnchorMs = state.nowMs;
            scheduleNextWake();
          }
          acknowledge(message);
          return;
        case 'PAUSE':
          requireState();
          if (playing && message.discardElapsed !== true) syncToWall();
          else verifyCurrentState();
          playing = false;
          clearWake();
          if (message.discardElapsed === true) {
            acknowledge(message);
            return;
          }
          if (pendingPauseMessage) {
            throw new Error(
              'A market pause publication barrier is already pending.',
            );
          }
          pendingPauseMessage = message;
          completePendingPause();
          return;
        case 'SET_SPEED':
          requireState();
          if (!SUPPORTED_SPEEDS.has(message.speed)) {
            throw new RangeError('Speed must be one of 1, 4 or 16.');
          }
          if (playing) syncToWall({ rebase: true });
          speed = message.speed;
          if (playing) {
            scheduleNextWake();
          }
          acknowledge(message);
          return;
        case 'STEP_FRAME': {
          requireState();
          if (playing) syncToWall();
          playing = false;
          clearWake();
          const targetMs =
            (Math.floor(state.nowMs / state.quoteFrameMs) + 1) *
            state.quoteFrameMs;
          advanceAndEmit(targetMs, { creditControlled: false });
          acknowledge(message, {
            frame: publicQuoteFrame(state.quoteFrames.at(-1)),
          });
          return;
        }
        case 'WORLD_COMMAND':
          runWorldCommand(message);
          return;
        case 'ADVANCE_WORLD_DAYS':
          advanceWorldDays(message);
          return;
        case 'ADVANCE_VIRTUAL_TIME':
          advanceVirtualTime(message);
          return;
        case 'SAVE_BARRIER':
          saveBarrier(message);
          return;
        case 'MARKET_PUBLICATION_CREDIT':
          requireState();
          enablePublicationCredit(message);
          return;
        case 'MARKET_PUBLICATION_ACK':
          requireState();
          acknowledgeMarketPublication(message);
          return;
        case 'DERIVATIVES_PUBLICATION_RESYNC':
          requireState();
          forceNextDerivativesFull = true;
          return;
        case 'MARKET_DATA_RESYNC':
          requireState();
          acknowledgedLevel2Projection = null;
          inFlightLevel2Projection = null;
          inFlightLevel2Publication = null;
          pendingLevel2Publication = null;
          emitRealtimeLevel2({
            mutationCount: 0,
            fromExclusiveVirtualMs: Math.max(
              0,
              Number(message.afterVirtualMs) || 0,
            ),
            resync: true,
          });
          return;
        default:
          throw new Error(`Unknown worker message type: ${message.type}`);
      }
    } catch (error) {
      post({
        type: 'ERROR',
        requestId: message?.requestId ?? null,
        requestType: message?.type ?? null,
        message: errorMessage(error),
      });
    }
  }

  port.addEventListener('message', handleMessage);

  return Object.freeze({
    destroy() {
      if (destroyed) return;
      playing = false;
      clearWake();
      port.removeEventListener?.('message', handleMessage);
      state = null;
      pendingPauseMessage = null;
      destroyed = true;
    },
  });
}

const isDedicatedWorkerScope =
  typeof self !== 'undefined' &&
  typeof WorkerGlobalScope !== 'undefined' &&
  self instanceof WorkerGlobalScope;

if (isDedicatedWorkerScope) {
  createMarketWorkerController({ port: self });
}

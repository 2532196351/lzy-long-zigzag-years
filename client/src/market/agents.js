import {
  activeBookStats,
  activeOrdersForOwner,
  activePriceTicksExcludingOrders,
  aggregateBookMetrics,
  bookLevelMetrics,
} from './order-book.js?v=20260801-01';
import {
  buildLimitFollowerQueue,
  diffLimitFollowerQueue,
  diffMakerLadder,
} from './liquidity.js?v=20260801-01';
import {
  createActorValuationObservation,
  createValuationSnapshot,
} from './valuation.js?v=20260801-01';
import {
  computeMakerQuotePlan,
  REGIME_PRESETS,
} from './maker-ecology.js?v=20260801-01';
import { deriveInstitutionValuationView } from './institutional-ecology.js?v=20260801-01';
import {
  createInstitutionValuationObservation,
  createMakerValuationObservation,
  institutionalPolicyForLiveAgent,
} from './ecology-contract.js?v=20260801-01';
import {
  BEHAVIOR_LIMITS,
  BEHAVIOR_RULE_VERSION,
  RETAIL_AGENT_IDS,
  RETAIL_AGENT_TEMPLATES,
  behaviorDecisionSignal,
  behaviorSizeMultiplier,
  behaviorStateErrors,
  createBehaviorState,
  createRetailIntent,
  evaluateProfitSeekingOrder,
  migrateBehaviorState,
  observeBehaviorState,
  refreshBehaviorMarkToMarket,
  recordBehaviorAction,
  recordBehaviorReceipt,
  recordBehaviorSettlement,
} from './behavior-kernel.js?v=20260801-01';

export const AGENT_RULE_VERSION =
  'lzy-agent-ecology-0.9.0';
export const SYMBOL_ORDER_CONTEXT_VERSION =
  'lzy-symbol-order-context-1';
const LIMIT_QUEUE_EPISODE_VERSION =
  'lzy-limit-queue-episode-1';
const PREVIOUS_AGENT_RULE_VERSION =
  'lzy-agent-ecology-0.8.0';
const PRE_CAPACITY_AGENT_RULE_VERSION =
  'lzy-agent-ecology-0.7.0';
const LEGACY_AGENT_RULE_VERSION =
  'lzy-agent-ecology-0.6.0';
const CAPACITY_LEDGER_RULE_VERSION =
  'lzy-agent-capacity-ledger-2';
const LEGACY_CAPACITY_LEDGER_RULE_VERSION =
  'lzy-agent-capacity-ledger-1';
const MAX_RECENT_ACTIVITY = 240;
const MAX_PUBLIC_FLOW = 48;
const MAX_OBSERVED_TRADES_PER_RESPONSE = 24;
const MAX_PUBLIC_ACTIONS_PER_ACTIVITY = 4;
const MAX_FUNDAMENTAL_SOURCES_PER_SYMBOL = 8;
const MIN_INSTITUTION_ACTION_INTERVAL_MS = 700;
const MIN_PUBLIC_RESPONSE_INTERVAL_MS = 1_200;
const MIN_LIMIT_FOLLOWER_REST_MS = 1_200;
const MIN_CONSENSUS_LIMIT_REST_MS = 4_500;
const MAX_CONSENSUS_LIMIT_REST_MS = 7_500;
const MAX_EVENT_APPROACH_AGE_MS = 180_000;
// Product contract: a normal 10,000-share clip must be executable from the
// finite standing book.  This is a game interaction calibration, not a claim
// about a universal real-market order size.
const NORMAL_STANDING_BOOK_CLIP_UNITS = 10_000;
const LIMIT_QUEUE_EPISODE_STATES = new Set([
  'approach',
  'touched_unlocked',
  'consensus_lock',
  'stable_lock',
  'divergence',
  'break',
  'relock',
  'exhaustion',
  'failed_recovery',
]);
const MAX_RETAIL_WORKING_ORDERS = 4;
const MIN_RETAIL_RESTING_LIFETIME_MS = 3_000;
const MAX_RETAIL_RESTING_LIFETIME_MS = 9_000;
const MAKER_DEEP_REQUOTE_HORIZON_MS = 3_000;
const FUNDAMENTAL_FACT_TYPES = Object.freeze([
  'company_inventory',
  'company_receivables',
  'company_operating_result',
  'company_financial_report',
  'company_capital_allocation',
  'company_share_change',
  'company_debt_change',
  'company_supply_chain_signal',
  'bank_financial_result',
  'insurance_financial_result',
]);
const LEGACY_THREE_STOCK_SYMBOLS = Object.freeze([
  'LZA001',
  'LZA002',
  'LZA003',
]);
const LEGACY_EIGHT_STOCK_SYMBOLS = Object.freeze([
  ...LEGACY_THREE_STOCK_SYMBOLS,
  'LZB101',
  'LZC201',
  'LZD301',
  'LZE401',
  'LZF501',
]);
const KNOWN_LEGACY_STOCK_UNIVERSES = Object.freeze([
  LEGACY_THREE_STOCK_SYMBOLS,
  LEGACY_EIGHT_STOCK_SYMBOLS,
]);

const CORE_AGENT_TEMPLATES = Object.freeze({
  maker_chengming: Object.freeze({
    id: 'maker_chengming',
    name: '澄明做市',
    kind: 'maker',
    strategy: 'inventory_aware_market_maker',
    brokerId: 'broker_chengming',
    cadenceMs: 1_800,
    cadenceJitterMs: 110,
    initialOffsetMs: 0,
    informationDelayMs: 180,
    fundamentalNoiseBps: 60,
    valuationMethodWeightsBps: {
      earnings: 5_000,
      book: 1_500,
      freeCashFlow: 3_500,
    },
    latencyMs: 24,
    riskAversionBps: 520,
    adverseSelectionBps: 760,
    valuationWeightBps: 3_200,
    baseHalfSpreadTicks: 1,
    baseOrderUnits: 76,
    maxLevels: 63,
    minimumSpacingTicks: 2,
    priceLaneModulus: 2,
    priceLaneRemainder: 0,
    riskFractionBps: 1200,
  }),
  maker_lingnan: Object.freeze({
    id: 'maker_lingnan',
    name: '岭南做市',
    kind: 'maker',
    strategy: 'inventory_aware_market_maker',
    brokerId: 'broker_lingnan',
    cadenceMs: 2_400,
    cadenceJitterMs: 140,
    initialOffsetMs: 0,
    informationDelayMs: 230,
    fundamentalNoiseBps: 90,
    valuationMethodWeightsBps: {
      earnings: 2_500,
      book: 4_000,
      freeCashFlow: 3_500,
    },
    latencyMs: 41,
    riskAversionBps: 680,
    adverseSelectionBps: 620,
    valuationWeightBps: 2_700,
    baseHalfSpreadTicks: 1,
    baseOrderUnits: 88,
    maxLevels: 63,
    minimumSpacingTicks: 2,
    priceLaneModulus: 2,
    priceLaneRemainder: 1,
    riskFractionBps: 1200,
  }),
  npc_value_fund: Object.freeze({
    id: 'npc_value_fund',
    name: '远衡价值基金',
    kind: 'institution',
    strategy: 'delayed_fundamental_value',
    brokerId: 'broker_lzy',
    cadenceMs: 2_400,
    cadenceJitterMs: 120,
    initialOffsetMs: 680,
    informationDelayMs: 6_000,
    fundamentalNoiseBps: 120,
    accountAllocationBps: 8_630,
    valuationMethodWeightsBps: {
      earnings: 6_500,
      book: 1_000,
      freeCashFlow: 2_500,
    },
    riskFractionBps: 1500,
  }),
  npc_trend_fund: Object.freeze({
    id: 'npc_trend_fund',
    name: '折线趋势组合',
    kind: 'institution',
    strategy: 'published_frame_trend',
    brokerId: 'broker_lzy',
    cadenceMs: 2_000,
    cadenceJitterMs: 90,
    initialOffsetMs: 820,
    informationDelayMs: 3_000,
    fundamentalNoiseBps: 250,
    accountAllocationBps: 8_510,
    valuationMethodWeightsBps: {
      earnings: 3_000,
      book: 2_500,
      freeCashFlow: 4_500,
    },
    riskFractionBps: 1800,
  }),
  npc_industry_fund: Object.freeze({
    id: 'npc_industry_fund',
    name: '积流产业资本',
    kind: 'institution',
    strategy: 'industry_mean_reversion',
    brokerId: 'broker_lzy',
    cadenceMs: 2_800,
    cadenceJitterMs: 140,
    initialOffsetMs: 960,
    informationDelayMs: 18_000,
    fundamentalNoiseBps: 180,
    accountAllocationBps: 8_500,
    valuationMethodWeightsBps: {
      earnings: 2_500,
      book: 2_000,
      freeCashFlow: 5_500,
    },
    riskFractionBps: 1400,
  }),
});

const AGENT_TEMPLATES = Object.freeze({
  ...CORE_AGENT_TEMPLATES,
  ...RETAIL_AGENT_TEMPLATES,
});
const AGENT_IDS = Object.freeze(Object.keys(AGENT_TEMPLATES));
const LEGACY_AGENT_IDS = Object.freeze(
  Object.keys(CORE_AGENT_TEMPLATES),
);
const PUBLIC_RESPONSE_AGENT_IDS = Object.freeze(
  AGENT_IDS.filter((id) => AGENT_TEMPLATES[id].kind !== 'maker'),
);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function cents(value) {
  return Math.round(Number(value) * 100);
}

function securityDailyBand(security) {
  const previousCloseTicks = isPositiveInteger(
    security?.previousCloseTicks,
  )
    ? security.previousCloseTicks
    : cents(security?.lastPrice ?? 0);
  const dailyLimitBps =
    Number.isSafeInteger(security?.dailyLimitBps)
      ? security.dailyLimitBps
      : 1_000;
  return {
    limitUpTicks: Math.max(
      previousCloseTicks + 1,
      Math.round(
        previousCloseTicks *
          (10_000 + dailyLimitBps) /
          10_000,
      ),
    ),
    limitDownTicks: Math.max(
      1,
      Math.min(
        previousCloseTicks - 1,
        Math.round(
          previousCloseTicks *
            (10_000 - dailyLimitBps) /
            10_000,
        ),
      ),
    ),
  };
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function saturatingSafeAdd(left, right) {
  if (right > 0 && left > Number.MAX_SAFE_INTEGER - right) {
    return Number.MAX_SAFE_INTEGER;
  }
  if (right < 0 && left < Number.MIN_SAFE_INTEGER - right) {
    return Number.MIN_SAFE_INTEGER;
  }
  return left + right;
}

function sameStringSet(left, right) {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

function ecologyTrackedAccountIds(state) {
  return Object.values(state.accounts ?? {})
    .filter(
      (account) =>
        account.kind !==
        'derivative_lending_custody',
    )
    .map((account) => account.id)
    .sort((left, right) =>
      left.localeCompare(right),
    );
}

function hash32(input) {
  let hash = 2166136261;
  for (const character of String(input)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mixIntegrityInteger(hash, value) {
  const safeValue =
    value === null || value === undefined ? -1 : value;
  const low = safeValue >>> 0;
  const high =
    Math.floor(safeValue / 0x1_0000_0000) >>> 0;
  hash = Math.imul(hash ^ low, 16777619) >>> 0;
  return Math.imul(hash ^ high, 16777619) >>> 0;
}

function mixIntegrityString(hash, value) {
  return Math.imul(
    hash ^ hash32(value ?? 'null'),
    16777619,
  ) >>> 0;
}

function integrityHex(hash) {
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function deterministicUnit(state, agent, salt) {
  const key = [
    state.world.world.seed,
    agent.id,
    state.nowMs,
    agent.decisionSequence,
    salt,
  ].join(':');
  return hash32(key) / 4294967296;
}

function stableAgentUnit(state, agent, salt) {
  return hash32(
    `${state.world.world.seed}:${agent.id}:${salt}`,
  ) / 4294967296;
}

function capacityTotalsIntegrityDigest(scopeId, totals) {
  let digest = hash32(scopeId);
  digest = mixIntegrityInteger(digest, totals.filledUnits);
  digest = mixIntegrityInteger(
    digest,
    totals.filledNotionalCents,
  );
  digest = mixIntegrityInteger(
    digest,
    totals.adverseTicksQuantity,
  );
  digest = mixIntegrityInteger(digest, totals.feeCents);
  digest = mixIntegrityInteger(
    digest,
    totals.firstSubmitMs,
  );
  digest = mixIntegrityInteger(digest, totals.lastFillMs);
  return integrityHex(digest);
}

function sealCapacityTotals(scopeId, totals) {
  totals.integrityDigest =
    capacityTotalsIntegrityDigest(scopeId, totals);
  return totals;
}

function emptyCapacityTotals(scopeId) {
  return sealCapacityTotals(scopeId, {
    filledUnits: 0,
    filledNotionalCents: 0,
    adverseTicksQuantity: 0,
    feeCents: 0,
    firstSubmitMs: null,
    lastFillMs: null,
  });
}

function capacityLedgerIntegrityDigest(ledger) {
  let digest = hash32(ledger.ruleVersion);
  digest = mixIntegrityString(digest, ledger.lastTradeId);
  digest = mixIntegrityInteger(
    digest,
    ledger.lastTradeSequence,
  );
  digest = mixIntegrityInteger(
    digest,
    ledger.lastTradeCommitSeq,
  );
  digest = mixIntegrityString(
    digest,
    ledger.coverage?.status,
  );
  digest = mixIntegrityInteger(
    digest,
    ledger.coverage?.unobservableArchivedChainCount,
  );
  digest = mixIntegrityInteger(
    digest,
    ledger.coverage?.unattributedAgentParticipantCount,
  );
  digest = mixIntegrityInteger(
    digest,
    ledger.coverage?.executionFallbackParticipantCount,
  );
  digest = mixIntegrityString(
    digest,
    ledger.coverage?.priorArchiveDigest,
  );
  digest = mixIntegrityInteger(
    digest,
    ledger.market?.tradeCount,
  );
  digest = mixIntegrityString(
    digest,
    ledger.market?.integrityDigest,
  );
  for (const [accountId, totals] of Object.entries(
    ledger.byAccount ?? {},
  )) {
    digest = mixIntegrityString(digest, accountId);
    digest = mixIntegrityString(
      digest,
      totals.integrityDigest,
    );
  }
  for (const [agentId, totals] of Object.entries(
    ledger.byAgent ?? {},
  )) {
    digest = mixIntegrityString(digest, agentId);
    digest = mixIntegrityString(
      digest,
      totals.integrityDigest,
    );
  }
  return integrityHex(digest);
}

function sealCapacityLedger(ledger) {
  ledger.integrityDigest =
    capacityLedgerIntegrityDigest(ledger);
  return ledger;
}

function createCapacityLedger(accountSource, {
  status = 'complete',
  unobservableArchivedChainCount = 0,
  unattributedAgentParticipantCount = 0,
  executionFallbackParticipantCount = 0,
  priorArchiveDigest = '00000000',
} = {}) {
  const accountIds = Array.isArray(accountSource)
    ? accountSource
    : Object.keys(accountSource.accounts ?? {});
  return sealCapacityLedger({
    ruleVersion: CAPACITY_LEDGER_RULE_VERSION,
    lastTradeId: null,
    lastTradeSequence: 0,
    lastTradeCommitSeq: 0,
    coverage: {
      status,
      unobservableArchivedChainCount,
      unattributedAgentParticipantCount,
      executionFallbackParticipantCount,
      priorArchiveDigest,
    },
    market: {
      tradeCount: 0,
      ...emptyCapacityTotals('market'),
    },
    byAccount: Object.fromEntries(
      accountIds.map((accountId) => [
        accountId,
        emptyCapacityTotals(`account:${accountId}`),
      ]),
    ),
    byAgent: Object.fromEntries(
      AGENT_IDS.map((agentId) => [
        agentId,
        emptyCapacityTotals(`agent:${agentId}`),
      ]),
    ),
  });
}

function realtimeTradeSequence(tradeId) {
  const match = /^rt_trade_(\d+)$/.exec(tradeId ?? '');
  if (!match) return null;
  const sequence = Number(match[1]);
  return isPositiveInteger(sequence) ? sequence : null;
}

function observableCapacityTrades(state) {
  const bySequence = new Map();
  for (const bundle of
    state.realtimeAuditArchive?.recentBundles ?? []) {
    for (const chain of bundle.chainReferences ?? []) {
      const sequence = realtimeTradeSequence(
        chain.trade?.id,
      );
      if (sequence) bySequence.set(sequence, chain.trade);
    }
  }
  for (const trade of state.world.market.trades ?? []) {
    if (trade?.source !== 'realtime_order_book') continue;
    const sequence = realtimeTradeSequence(trade.id);
    if (sequence) bySequence.set(sequence, trade);
  }
  return [...bySequence.entries()]
    .sort((left, right) => left[0] - right[0])
    .map((entry) => entry[1]);
}

function hydrateCapacityLedger(state) {
  const observable = observableCapacityTrades(state);
  const archivedCount =
    state.realtimeAuditArchive?.totalArchivedChains ?? 0;
  const archivedObservableCount = new Set(
    (state.realtimeAuditArchive?.recentBundles ?? [])
      .flatMap((bundle) => bundle.chainReferences ?? [])
      .map((chain) => chain.trade?.id)
      .filter(Boolean),
  ).size;
  const unobservableArchivedChainCount = Math.max(
    0,
    archivedCount - archivedObservableCount,
  );
  state.agentEcology.capacityLedger =
    createCapacityLedger(
      ecologyTrackedAccountIds(state),
      {
      status:
        unobservableArchivedChainCount === 0
          ? 'complete'
          : 'legacy_partial',
      unobservableArchivedChainCount,
      priorArchiveDigest:
        state.realtimeAuditArchive?.rollingDigest ??
        '00000000',
      },
    );
  for (const trade of observable) {
    recordCapacityTrade(state, trade, {
      trackLegacyCoverage: true,
    });
  }
  const coverage =
    state.agentEcology.capacityLedger.coverage;
  coverage.status =
    coverage.unobservableArchivedChainCount === 0 &&
    coverage.unattributedAgentParticipantCount === 0 &&
    coverage.executionFallbackParticipantCount === 0
      ? 'complete'
      : 'legacy_partial';
  sealCapacityLedger(state.agentEcology.capacityLedger);
}

function migrateLegacyCapacityLedger(state) {
  const ledger = state.agentEcology?.capacityLedger;
  if (
    !ledger ||
    ledger.ruleVersion !==
      LEGACY_CAPACITY_LEDGER_RULE_VERSION ||
    !sameStringSet(
      Object.keys(ledger.byAccount ?? {}),
      ecologyTrackedAccountIds(state),
    ) ||
    !sameStringSet(
      Object.keys(ledger.byAgent ?? {}),
      AGENT_IDS,
    ) ||
    !ledger.market ||
    !isNonNegativeInteger(ledger.market.tradeCount) ||
    !isNonNegativeInteger(ledger.lastTradeSequence) ||
    !isNonNegativeInteger(ledger.lastTradeCommitSeq) ||
    !ledger.coverage ||
    !['complete', 'legacy_partial'].includes(
      ledger.coverage.status,
    ) ||
    !isNonNegativeInteger(
      ledger.coverage.unobservableArchivedChainCount,
    ) ||
    typeof ledger.coverage.priorArchiveDigest !== 'string'
  ) {
    throw new Error(
      `Unsupported capacity ledger schema: ${ledger?.ruleVersion}`,
    );
  }
  const numericKeys = [
    'filledUnits',
    'filledNotionalCents',
    'adverseTicksQuantity',
    'feeCents',
  ];
  const totalsEntries = [
    ['market', ledger.market],
    ...Object.entries(ledger.byAccount).map(
      ([accountId, totals]) => [
        `account:${accountId}`,
        totals,
      ],
    ),
    ...Object.entries(ledger.byAgent).map(
      ([agentId, totals]) => [
        `agent:${agentId}`,
        totals,
      ],
    ),
  ];
  if (
    totalsEntries.some(
      ([, totals]) =>
        numericKeys.some(
          (key) => !isNonNegativeInteger(totals?.[key]),
        ) ||
        !(
          (
            totals?.filledUnits === 0 &&
            totals?.firstSubmitMs === null &&
            totals?.lastFillMs === null
          ) ||
          (
            totals?.filledUnits > 0 &&
            isNonNegativeInteger(totals?.firstSubmitMs) &&
            isNonNegativeInteger(totals?.lastFillMs) &&
            totals.firstSubmitMs <= totals.lastFillMs &&
            totals.lastFillMs <= state.nowMs
          )
        ),
    )
  ) {
    throw new Error(
      `Unsupported capacity ledger schema: ${ledger.ruleVersion}`,
    );
  }
  const accountTotals = Object.values(ledger.byAccount);
  const sumAccount = (key) =>
    accountTotals.reduce(
      (sum, totals) => sum + totals[key],
      0,
    );
  if (
    sumAccount('filledUnits') !==
      ledger.market.filledUnits * 2 ||
    sumAccount('filledNotionalCents') !==
      ledger.market.filledNotionalCents * 2 ||
    sumAccount('adverseTicksQuantity') !==
      ledger.market.adverseTicksQuantity ||
    sumAccount('feeCents') !== ledger.market.feeCents
  ) {
    throw new Error(
      `Unsupported capacity ledger schema: ${ledger.ruleVersion}`,
    );
  }
  ledger.ruleVersion = CAPACITY_LEDGER_RULE_VERSION;
  ledger.coverage.unattributedAgentParticipantCount =
    ledger.market.tradeCount * 2;
  ledger.coverage.executionFallbackParticipantCount =
    ledger.market.tradeCount * 2;
  ledger.coverage.status =
    ledger.market.tradeCount === 0 &&
    ledger.coverage.unobservableArchivedChainCount === 0
      ? 'complete'
      : 'legacy_partial';
  for (const [scopeId, totals] of totalsEntries) {
    sealCapacityTotals(scopeId, totals);
  }
  sealCapacityLedger(ledger);
}

function openingAuctionConsensusOffsetTicks(
  state,
  symbol,
) {
  const previousCloseTicks =
    state.world.market.securities[symbol]
      ?.previousCloseTicks;
  if (!isPositiveInteger(previousCloseTicks)) return 0;
  const offsetBps =
    (hash32(
      `${state.world.world.seed}:${symbol}:opening-auction-consensus`,
    ) % 101) -
    50;
  return Math.round(
    previousCloseTicks * offsetBps / 10_000,
  );
}

function activeOrder(order) {
  return Boolean(
    order &&
      order.remainingQty > 0 &&
      (order.status === 'accepted' ||
        order.status === 'partially_filled'),
  );
}

const orderReferenceCache = new WeakMap();
const publicTradeIndexCache = new WeakMap();
const publicShockCache = new WeakMap();
const publicTapeCache = new WeakMap();
const eligibleFundamentalFactsCache = new WeakMap();

function publicRealtimeTape(state) {
  const trades = state.world.market.trades;
  const lastTrade = trades.at(-1);
  const cached = publicTapeCache.get(state);
  if (
    cached?.commitSeq === state.commitSeq &&
    cached.tradesLength === trades.length &&
    cached.lastTradeId === lastTrade?.id
  ) {
    return cached;
  }
  const bySymbol = new Map();
  for (const trade of trades) {
    if (trade.source !== 'realtime_order_book') continue;
    const symbolTrades = bySymbol.get(trade.symbol);
    if (symbolTrades) {
      symbolTrades.push(trade);
    } else {
      bySymbol.set(trade.symbol, [trade]);
    }
  }
  const tape = {
    commitSeq: state.commitSeq,
    tradesLength: trades.length,
    lastTradeId: lastTrade?.id,
    bySymbol,
  };
  publicTapeCache.set(state, tape);
  return tape;
}

function activeOrdersOwnedBy(state, ownerId) {
  return Object.values(state.books).flatMap((book) =>
    activeOrdersForOwner(book, ownerId),
  );
}

function orderReferences(state) {
  const archived = state.orderArchive?.totalArchived ?? 0;
  const cached = orderReferenceCache.get(state);
  if (
    cached &&
    cached.archived === archived
  ) {
    return cached.byId;
  }
  const byId = new Map();
  for (const entry of Object.values(state.orderArchive?.bySymbol ?? {})) {
    for (const reference of entry.recentReferences ?? []) {
      byId.set(reference.id, reference);
    }
  }
  orderReferenceCache.set(state, { archived, byId });
  return byId;
}

function equityCentsFromWorld(world, cashCents, holdings) {
  return (
    cashCents +
    Object.entries(holdings).reduce(
      (sum, [symbol, quantity]) =>
        sum +
        quantity * cents(world.market.securities[symbol]?.lastPrice ?? 0),
      0,
    )
  );
}

function initialEquityCentsFromWorld(
  world,
  cashCents,
  holdings,
) {
  return (
    cashCents +
    Object.entries(holdings).reduce(
      (sum, [symbol, quantity]) => {
        const security = world.market.securities[symbol];
        const opening = security?.priceHistory?.find(
          (point) => point.tick === 0,
        );
        const priceTicks =
          opening && Number.isFinite(opening.price)
            ? cents(opening.price)
            : security?.previousCloseTicks;
        return (
          sum +
          quantity *
            (isPositiveInteger(priceTicks) ? priceTicks : 0)
        );
      },
      0,
    )
  );
}

function makeBaselines(world) {
  const symbols = Object.keys(world.market.securities);
  const baselines = {};
  baselines.player = {
    cashCents: cents(world.player.cash),
    holdings: cloneJson(world.player.holdings),
  };
  for (const investor of Object.values(world.entities.investors ?? {})) {
    baselines[investor.id] = {
      cashCents: cents(investor.cash),
      holdings: cloneJson(investor.holdings),
    };
  }

  const makerCashCents = cents(world.market.maker.cash);
  const firstCash = Math.floor(makerCashCents / 2);
  const derivativeCustodyHoldings =
    Object.fromEntries(
      symbols.map((symbol) => [
        symbol,
        Object.values(
          world.derivatives?.actors ?? {},
        ).reduce(
          (sum, actor) =>
            sum +
            (
              world.derivatives?.accounts?.[
                actor.accountId
              ]?.borrowedSecurityCustody?.[
                symbol
              ] ?? 0
            ),
          0,
        ),
      ]),
    );
  const lendingPoolHoldings = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      Math.min(
        world.market.maker.holdings[symbol] ?? 0,
        world.derivatives?.clearing
          ?.lendableSecurities?.[symbol] ?? 0,
      ),
    ]),
  );
  const tradableMakerHoldings = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      (world.market.maker.holdings[symbol] ?? 0) -
        lendingPoolHoldings[symbol] -
        derivativeCustodyHoldings[symbol],
    ]),
  );
  const firstHoldings = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      Math.floor(
        tradableMakerHoldings[symbol] / 2,
      ),
    ]),
  );
  const secondHoldings = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      tradableMakerHoldings[symbol] -
        firstHoldings[symbol],
    ]),
  );
  baselines.maker_chengming = {
    cashCents: firstCash,
    holdings: firstHoldings,
  };
  baselines.maker_lingnan = {
    cashCents: makerCashCents - firstCash,
    holdings: secondHoldings,
  };
  baselines.securities_lending_pool = {
    cashCents: 0,
    holdings: lendingPoolHoldings,
  };
  for (const baseline of Object.values(baselines)) {
    baseline.initialEquityCents = initialEquityCentsFromWorld(
      world,
      baseline.cashCents,
      baseline.holdings,
    );
  }
  return baselines;
}

function eligibleFundamentalFacts(world, symbol) {
  const issuerId = world.market.securities[symbol]?.issuerId;
  const facts = world.facts ?? [];
  const worldTick = world.world.tick;
  const firstFactId = facts[0]?.id ?? null;
  const lastFactId = facts.at(-1)?.id ?? null;
  let cache = eligibleFundamentalFactsCache.get(world);
  if (
    !cache ||
    cache.facts !== facts ||
    cache.factsLength !== facts.length ||
    cache.firstFactId !== firstFactId ||
    cache.lastFactId !== lastFactId ||
    cache.worldTick !== worldTick
  ) {
    const byIssuer = new Map();
    for (const fact of facts) {
      if (
        fact.authority === 'world_fact' &&
        fact.visibility === 'public' &&
        fact.confidence === 1 &&
        FUNDAMENTAL_FACT_TYPES.includes(fact.type) &&
        Number.isSafeInteger(fact.tick) &&
        fact.tick <= worldTick
      ) {
        const issuerFacts =
          byIssuer.get(fact.entityId) ?? [];
        issuerFacts.push(fact);
        byIssuer.set(fact.entityId, issuerFacts);
      }
    }
    for (const [entityId, issuerFacts] of byIssuer) {
      byIssuer.set(
        entityId,
        issuerFacts
          .sort(
            (left, right) =>
              left.tick - right.tick ||
              (
                Number.isSafeInteger(
                  left.publishedAtMs,
                )
                  ? left.publishedAtMs
                  : Number.isSafeInteger(
                        left.virtualMs,
                      )
                    ? left.virtualMs
                    : left.tick *
                      86_400_000
              ) -
                (
                  Number.isSafeInteger(
                    right.publishedAtMs,
                  )
                    ? right.publishedAtMs
                    : Number.isSafeInteger(
                          right.virtualMs,
                        )
                      ? right.virtualMs
                      : right.tick *
                        86_400_000
                ) ||
              left.id.localeCompare(right.id),
          )
          .slice(-MAX_FUNDAMENTAL_SOURCES_PER_SYMBOL),
      );
    }
    cache = {
      facts,
      factsLength: facts.length,
      firstFactId,
      lastFactId,
      worldTick,
      byIssuer,
    };
    eligibleFundamentalFactsCache.set(world, cache);
  }
  return cache.byIssuer.get(issuerId) ?? [];
}

function fundamentalFactSignalTicks(fact, security = null) {
  if (fact.type === 'company_inventory') return 4;
  if (fact.type === 'company_receivables') return -4;
  if (fact.type === 'company_supply_chain_signal') {
    return clamp(
      Math.round(Number(fact.value?.signalTicks) || 0),
      -12,
      12,
    );
  }
  if (fact.type === 'bank_financial_result') {
    if (
      security?.businessModel?.kind &&
      security.businessModel.kind !== 'commercial_bank'
    ) {
      return 0;
    }
    const value = fact.value ?? {};
    const netInterestMarginBps =
      Number(value.netInterestMarginBps) || 0;
    const creditCostBps =
      Number(value.creditCostBps) || 0;
    const nonPerformingLoanBps =
      Number(value.nonPerformingLoanBps) || 0;
    const capitalAdequacyBps =
      Number(value.capitalAdequacyBps) || 0;
    const liquidityCoverageBps =
      Number(value.liquidityCoverageBps) || 0;
    const netInterestIncome =
      Number(value.netInterestIncome) || 0;
    const feeIncome = Number(value.feeIncome) || 0;
    const creditLoss = Number(value.creditLoss) || 0;
    const operatingIncome = Math.max(
      1,
      Math.abs(netInterestIncome) + Math.abs(feeIncome),
    );
    const postCreditBufferBps = Math.round(
      (netInterestIncome + feeIncome - creditLoss) *
        10_000 /
        operatingIncome,
    );
    const creditCostScore =
      creditCostBps > 0
        ? clamp(
            Math.round((100 - creditCostBps) / 8),
            -15,
            15,
          )
        : clamp(
            Math.round((5_500 - postCreditBufferBps) / -900),
            -10,
            10,
          );
    return clamp(
      clamp(
        Math.round((netInterestMarginBps - 160) / 8),
        -15,
        15,
      ) +
        creditCostScore +
        clamp(
          Math.round((150 - nonPerformingLoanBps) / 12),
          -12,
          12,
        ) +
        clamp(
          Math.round((capitalAdequacyBps - 1_200) / 50),
          -10,
          10,
        ) +
        clamp(
          Math.round((liquidityCoverageBps - 10_000) / 1_000),
          -6,
          6,
        ) +
        clamp(
          Math.round((postCreditBufferBps - 4_000) / 1_000),
          -6,
          6,
        ),
      -60,
      60,
    );
  }
  if (fact.type === 'insurance_financial_result') {
    if (
      security?.businessModel?.kind &&
      security.businessModel.kind !== 'insurance_group'
    ) {
      return 0;
    }
    const value = fact.value ?? {};
    const premiumEarned =
      Number(value.premiumEarned) || 0;
    const claims = Number(value.claims) || 0;
    const reserveChange =
      Number(value.reserveChange) || 0;
    const investmentIncome =
      Number(value.investmentIncome) || 0;
    const claimsRatioBps =
      Number(value.claimsRatioBps) || 0;
    const investmentYieldBps =
      Number(value.investmentYieldBps) || 0;
    const solvencyRatioBps =
      Number(value.solvencyRatioBps) || 0;
    const underwritingBufferBps =
      premiumEarned === 0
        ? 0
        : Math.round(
            (premiumEarned - claims - reserveChange) *
              10_000 /
              Math.abs(premiumEarned),
          );
    const investmentContributionBps =
      premiumEarned === 0
        ? 0
        : Math.round(
            investmentIncome *
              10_000 /
              Math.abs(premiumEarned),
          );
    return clamp(
      clamp(
        Math.round((7_000 - claimsRatioBps) / 250),
        -14,
        14,
      ) +
        clamp(
          Math.round((solvencyRatioBps - 15_000) / 800),
          -12,
          12,
        ) +
        clamp(
          Math.round((investmentYieldBps - 300) / 30),
          -8,
          8,
        ) +
        clamp(
          Math.round((underwritingBufferBps - 500) / 400),
          -10,
          10,
        ) +
        clamp(
          Math.round(
            (investmentContributionBps - 500) / 300,
          ),
          -6,
          6,
        ),
      -60,
      60,
    );
  }
  if (fact.type === 'company_operating_result') {
    const netCash = Number(fact.value?.netCash) || 0;
    const sold = Number(fact.value?.sold) || 0;
    const produced = Number(fact.value?.produced) || 0;
    const direction =
      netCash === 0
        ? sold >= produced
          ? 1
          : -1
        : Math.sign(netCash);
    const outstandingUnits = Math.max(
      1,
      Number(security?.outstandingUnits) || 1,
    );
    const cashPerShareTicks = Math.round(
      Math.abs(netCash) * 100 / outstandingUnits,
    );
    const throughputBps =
      produced + sold <= 0
        ? 0
        : Math.round(
            Math.abs(sold - produced) *
              10_000 /
              Math.max(1, produced + sold),
          );
    const magnitude = clamp(
      Math.max(
        2,
        cashPerShareTicks +
          Math.round(throughputBps / 800),
      ),
      2,
      60,
    );
    return direction * magnitude;
  }
  return 0;
}

function derivedFundamentalTicks(world, symbol, facts) {
  const referenceTicks = cents(
    world.market.securities[symbol].referenceValue,
  );
  const adjustment = clamp(
    facts.reduce(
      (sum, fact) => sum + fundamentalFactSignalTicks(fact),
      0,
    ),
    -12,
    12,
  );
  return Math.max(1, referenceTicks + adjustment);
}

/**
 * Interprets only already-published world facts available after the actor's
 * own information delay.  The result is an order-decision input in ticks, not
 * a price write or a claim of intrinsic value.
 */
export function publicCatalystSignalTicks(
  state,
  agent,
  symbol,
  observedMs = state?.nowMs,
) {
  if (
    !state?.world ||
    !agent?.id ||
    !state.world.market.securities?.[symbol] ||
    !isNonNegativeInteger(observedMs)
  ) {
    return 0;
  }
  const informationDelayMs = Math.max(
    0,
    Number.isSafeInteger(agent.informationDelayMs)
      ? agent.informationDelayMs
      : 0,
  );
  const visibleFacts = eligibleFundamentalFacts(
    state.world,
    symbol,
  )
    .filter((fact) => {
      const publishedAtMs = Number.isSafeInteger(
        fact.publishedAtMs,
      )
        ? fact.publishedAtMs
        : fact.tick * 86_400_000;
      return (
        fact.tick > 0 &&
        publishedAtMs + informationDelayMs <= observedMs
      );
    })
    .slice(-4);
  if (visibleFacts.length === 0) return 0;
  const security = state.world.market.securities[symbol];
  const rawSignalTicks = clamp(
    visibleFacts.reduce(
      (sum, fact) =>
        sum +
        fundamentalFactSignalTicks(fact, security),
      0,
    ),
    -80,
    80,
  );
  if (rawSignalTicks === 0) return 0;
  const strategyWeightBps =
    agent.strategy === 'delayed_fundamental_value'
      ? 10_000
      : agent.strategy === 'published_frame_trend'
        ? 7_200
        : agent.strategy === 'industry_mean_reversion'
          ? 11_500
          : agent.kind === 'retail'
            ? clamp(
                4_000 +
                  (
                    agent.traits?.reasoningLevel ??
                    agent.behaviorState?.persona?.traits
                      ?.reasoningLevel ??
                    0
                  ) *
                    1_500 +
                  Math.round(
                    (
                      agent.traits?.socialLearningBps ??
                      agent.behaviorState?.persona?.traits
                        ?.socialLearningBps ??
                      0
                    ) /
                      8,
                  ) +
                  Math.round(
                    (
                      agent.traits
                        ?.capitalPreservationBps ??
                      agent.behaviorState?.persona
                        ?.stableGoals
                        ?.capitalPreservationBps ??
                      0
                    ) /
                      20,
                  ),
                3_500,
                12_000,
              )
            : 8_500;
  const weightedTicks = Math.round(
    rawSignalTicks * strategyWeightBps / 10_000,
  );
  const interpretationResidualTicks =
    Math.abs(weightedTicks) < 2
      ? 0
      : (
          hash32(
            `${agent.id}:${visibleFacts.at(-1).id}:interpretation`,
          ) %
            3
        ) -
        1;
  const interpretedTicks =
    Math.sign(weightedTicks) *
    Math.max(
      1,
      Math.abs(weightedTicks) +
        interpretationResidualTicks,
    );
  const noiseBoundTicks = Math.max(
    0,
    Math.floor(
      Math.abs(interpretedTicks) *
        Math.max(0, agent.fundamentalNoiseBps ?? 0) /
        10_000,
    ),
  );
  const noiseTicks =
    noiseBoundTicks === 0
      ? 0
      : Math.round(
          (
            deterministicUnit(
              state,
              agent,
              `public-catalyst:${symbol}:${visibleFacts.at(-1).id}`,
            ) *
              2 -
            1
          ) *
            noiseBoundTicks,
        );
  return clamp(
    interpretedTicks + noiseTicks,
    -80,
    80,
  );
}

function visibleFundamentalTick(world, nowMs, informationDelayMs) {
  const visibleAtMs = Math.max(
    -Number.MAX_SAFE_INTEGER,
    Math.floor(nowMs - informationDelayMs),
  );
  const ticks = (world.facts ?? [])
    .filter(
      (fact) =>
        fact.type === 'company_financial_report' &&
        fact.authority === 'world_fact' &&
        fact.visibility === 'public' &&
        Number(fact.confidence) > 0 &&
        Number.isSafeInteger(fact.tick) &&
        fact.tick <= world.world.tick &&
        (
          Number.isSafeInteger(fact.publishedAtMs)
            ? fact.publishedAtMs
            : fact.tick * 86_400_000
        ) <= visibleAtMs,
    )
    .map((fact) => fact.tick);
  if (ticks.length === 0) return 0;
  return Math.max(...ticks);
}

function createFundamentalSnapshot(
  world,
  { actor, nowMs = 0 } = {},
) {
  if (!actor?.id) {
    throw new TypeError('an agent template is required');
  }
  const symbols = Object.keys(world.market.securities);
  const institutionPolicy =
    actor.kind === 'institution'
      ? institutionalPolicyForLiveAgent(
          actor.id,
          symbols,
          world,
        )
      : null;
  const visibleTick = visibleFundamentalTick(
    world,
    nowMs,
    institutionPolicy?.observationDelayMs ??
      actor.informationDelayMs,
  );
  const valuation = createValuationSnapshot(world, {
    asOfTick: visibleTick,
  });
  const observations = {};
  for (const symbol of symbols) {
    if (institutionPolicy) {
      const enterpriseObservation =
        createInstitutionValuationObservation({
          world,
          symbol,
          asOfTick: visibleTick,
        });
      const view = deriveInstitutionValuationView(
        enterpriseObservation,
        institutionPolicy,
        {
          seed: world.world.seed,
          actorId: actor.id,
          marketPriceTicks: cents(
            world.market.securities[symbol].lastPrice,
          ),
        },
      );
      observations[symbol] = {
        observedLowTicks: view.lowTicks,
        observedMidpointTicks: view.centralTicks,
        observedHighTicks: view.highTicks,
        actionableValueTicks: view.actionableValueTicks,
        publicMidpointTicks:
          valuation.symbols[symbol].midpointTicks,
        sourceAsOfTick: valuation.symbols[symbol].asOfTick,
        sourceFactIds: valuation.symbols[symbol].sourceFactIds,
        sourceFinancialFactId:
          valuation.symbols[symbol].sourceFinancialFactId,
        publishedAtMs: view.observationPublishedMs,
        availableAtMs: view.actorAvailableMs,
        methodWeightsBps: Object.fromEntries(
          Object.entries(view.methodWeightsPpm)
            .filter(([method]) => method !== 'distribution')
            .map(([method, weightPpm]) => [
              method,
              Math.round(weightPpm / 100),
            ]),
        ),
        modelNoiseBps: Math.round(
          Math.abs(view.noisePpm) / 100,
        ),
        valuationModel: {
          mode: institutionPolicy.mode,
          centralTicks: view.centralTicks,
          actionableValueTicks: view.actionableValueTicks,
          dynamicMultiplesMilli: view.dynamicMultiplesMilli,
          requiredReturnBps: view.requiredReturnBps,
          longTermGrowthBps: view.longTermGrowthBps,
          debtPressurePpm: view.debtPressurePpm,
          totalActionableHaircutPpm:
            view.totalActionableHaircutPpm,
          priceRole: view.priceRole,
        },
      };
      continue;
    }
    const observation = createActorValuationObservation(
      valuation.symbols[symbol],
      {
        actorId: actor.id,
        seed: world.world.seed,
        observedTick: visibleTick,
        informationDelayTicks: 0,
        noiseBps: actor.fundamentalNoiseBps,
        methodWeightsBps:
          actor.valuationMethodWeightsBps,
      },
    );
    observations[symbol] = {
      ...observation,
      actionableValueTicks:
        observation.observedMidpointTicks,
      sourceFinancialFactId:
        valuation.symbols[symbol].sourceFinancialFactId,
      publishedAtMs:
        valuation.symbols[symbol].publishedAtMs,
      availableAtMs:
        valuation.symbols[symbol].publishedAtMs +
        actor.informationDelayMs,
      valuationModel: {
        mode: 'public_multi_method_maker_reservation_input',
        centralTicks: observation.observedMidpointTicks,
        actionableValueTicks:
          observation.observedMidpointTicks,
        priceRole:
          'order_comparison_not_intrinsic_value_input',
      },
    };
  }
  return {
    delayedFundamentals: Object.fromEntries(
      symbols.map((symbol) => [
        symbol,
        observations[symbol].observedMidpointTicks,
      ]),
    ),
    fundamentalSourceFactIds: Object.fromEntries(
      symbols.map((symbol) => [
        symbol,
        valuation.symbols[symbol].sourceFactIds,
      ]),
    ),
    valuationBands: Object.fromEntries(
      symbols.map((symbol) => [
        symbol,
        {
          lowTicks:
            observations[symbol].observedLowTicks,
          midpointTicks:
            observations[symbol].observedMidpointTicks,
          highTicks:
            observations[symbol].observedHighTicks,
          confidenceBps: valuation.symbols[symbol].confidenceBps,
          ruleVersion: valuation.symbols[symbol].ruleVersion,
          sourceFinancialFactId:
            observations[symbol].sourceFinancialFactId,
          sourceFactIds:
            observations[symbol].sourceFactIds ??
            valuation.symbols[symbol].sourceFactIds,
          sourceAsOfTick:
            observations[symbol].sourceAsOfTick,
          publishedAtMs:
            observations[symbol].publishedAtMs,
          availableAtMs:
            observations[symbol].availableAtMs,
          methodWeightsBps:
            observations[symbol].methodWeightsBps,
          modelNoiseBps:
            observations[symbol].modelNoiseBps ??
            observations[symbol].noiseBps,
          actionableValueTicks:
            observations[symbol].actionableValueTicks,
          publicMidpointTicks:
            observations[symbol].publicMidpointTicks ??
            observations[symbol].observedMidpointTicks,
          valuationModel:
            observations[symbol].valuationModel,
        },
      ]),
    ),
    lastFundamentalTick: Math.max(
      0,
      ...Object.values(valuation.symbols).map(
        (item) => item.asOfTick,
      ),
    ),
  };
}

function createOpeningSignals(world, agentId, fundamentals) {
  const symbols = Object.keys(world.market.securities);
  const signals = Object.fromEntries(
    symbols.map((symbol) => [symbol, 0]),
  );
  const valueFundamentals =
    agentId === 'npc_value_fund'
      ? fundamentals
      : createFundamentalSnapshot(world, {
          actor: CORE_AGENT_TEMPLATES.npc_value_fund,
          nowMs: 0,
        });
  const valueSelection = symbols
      .map((symbol) => ({
        symbol,
        signal:
          valueFundamentals.delayedFundamentals[symbol] -
          cents(world.market.securities[symbol].lastPrice),
      }))
      .sort(
        (left, right) =>
          Math.abs(right.signal) - Math.abs(left.signal) ||
          left.symbol.localeCompare(right.symbol),
      )[0];
  if (agentId === 'npc_value_fund') {
    signals[valueSelection.symbol] =
      Math.sign(valueSelection.signal || 1) * 8;
    return signals;
  }
  const remainingSymbols = symbols.filter(
    (symbol) => symbol !== valueSelection.symbol,
  );
  const trendIndex =
    hash32(`${world.world.seed}:opening-coverage`) %
    Math.max(1, remainingSymbols.length);
  const trendSymbol =
    remainingSymbols[trendIndex] ?? valueSelection.symbol;
  const selectedSymbol =
    agentId === 'npc_trend_fund'
      ? trendSymbol
      : remainingSymbols.find(
          (symbol) => symbol !== trendSymbol,
        ) ?? trendSymbol;
  const hash = hash32(
    `${world.world.seed}:${agentId}:${selectedSymbol}:opening-direction`,
  );
  signals[selectedSymbol] =
    (hash % 2 === 0 ? 1 : -1) * (8 + (hash % 5));
  return signals;
}

/**
 * Creates only configuration and delayed/permitted observations. It contains
 * no reference to a player draft, command queue or another client's account.
 */
export function createAgentCatalog(world) {
  const symbols = Object.keys(world.market.securities);
  const baselines = makeBaselines(world);
  const agents = Object.fromEntries(
    AGENT_IDS.map((id) => {
      const template = AGENT_TEMPLATES[id];
      const accountId = template.accountId ?? id;
      const baseline = baselines[accountId];
      if (!baseline) {
        throw new Error(
          `Agent ${id} has no authorized capital account ${accountId}.`,
        );
      }
      const accountAllocationBps =
        template.accountAllocationBps ?? 10_000;
      const behaviorState = createBehaviorState({
        world,
        agent: {
          ...template,
          accountId,
        },
        accountBaseline: baseline,
        allocationBps: accountAllocationBps,
      });
      const fundamentals = createFundamentalSnapshot(world, {
        actor: template,
        nowMs: 0,
      });
      return [
        id,
        {
          ...cloneJson(template),
          accountId,
          accountAllocationBps,
          riskBudgetCents: Math.max(
            1,
            Math.floor(
              baseline.cashCents *
                accountAllocationBps /
                10_000 *
                template.riskFractionBps /
                10_000,
            ),
          ),
          decisionSequence: 0,
          lastDecisionMs: null,
          lastOrderMs: null,
          lastFundamentalRefreshMs: 0,
          lastTrigger: null,
          lastObservedTradeMs: -1,
          publicFlowMemory: null,
          initialEquityCents: Math.max(
            1,
            Math.floor(
              baseline.initialEquityCents *
                accountAllocationBps /
                10_000,
            ),
          ),
          targetHoldings:
            template.kind === 'maker'
              ? cloneJson(baseline.holdings)
              : cloneJson(
                  behaviorState.account.initialHoldings,
                ),
          delayedFundamentals: cloneJson(
            fundamentals.delayedFundamentals,
          ),
          fundamentalSourceFactIds: cloneJson(
            fundamentals.fundamentalSourceFactIds,
          ),
          valuationBands: cloneJson(fundamentals.valuationBands),
          lastFundamentalTick: fundamentals.lastFundamentalTick,
          openingSignals: createOpeningSignals(
            world,
            id,
            fundamentals,
          ),
          openingSignalConsumed: template.kind === 'maker',
          limitQueueEpisodes: {},
          behaviorState,
        },
      ];
    }),
  );
  return {
    ruleVersion: AGENT_RULE_VERSION,
    enabled: true,
    maxRecentActivity: MAX_RECENT_ACTIVITY,
    maxPublicFlow: MAX_PUBLIC_FLOW,
    maxObservedTradesPerResponse: MAX_OBSERVED_TRADES_PER_RESPONSE,
    agents,
    accountBaselines: baselines,
    capacityLedger: createCapacityLedger(
      Object.keys(baselines),
    ),
    recentActivity: [],
    publicFlow: [],
    pendingResponses: {},
  };
}

function migrateObservedRecord(
  state,
  record,
  { pending = false } = {},
) {
  if (!record || !Array.isArray(record.observedTradeIds)) {
    return { valid: false, changed: false };
  }
  let changed = false;
  if (!Array.isArray(record.observedTrades)) {
    const chains = record.observedTradeIds.map((tradeId) =>
      resolveSettledPublicTradeChain(state, tradeId),
    );
    if (chains.some((chain) => !chain)) {
      return { valid: false, changed };
    }
    record.observedTrades = chains.map((chain) =>
      compactObservedTrade(chain.trade),
    );
    changed = true;
  }
  if (
    pending &&
    !Array.isArray(record.deferredObservedTradeIds)
  ) {
    record.deferredObservedTradeIds = [];
    changed = true;
  }
  if (
    pending &&
    !Array.isArray(record.deferredObservedTrades)
  ) {
    record.deferredObservedTrades = [];
    changed = true;
  }
  return {
    valid: observedAggregateMatches(state, record),
    changed,
  };
}

function migratePublicObservationEvidence(state) {
  const ecology = state.agentEcology;
  let changed = false;
  const migratedPublicFlow = [];
  for (const record of ecology.publicFlow ?? []) {
    const chain = resolveSettledPublicTradeChain(
      state,
      record?.tradeId,
    );
    if (!chain) {
      changed = true;
      continue;
    }
    const next = record;
    if (next.factId !== chain.trade.factId) {
      next.factId = chain.trade.factId;
      changed = true;
    }
    migratedPublicFlow.push(next);
  }
  ecology.publicFlow = migratedPublicFlow.slice(
    -MAX_PUBLIC_FLOW,
  );

  for (const [agentId, pending] of Object.entries(
    ecology.pendingResponses ?? {},
  )) {
    const result = migrateObservedRecord(state, pending, {
      pending: true,
    });
    changed = result.changed || changed;
    if (result.valid) continue;
    delete ecology.pendingResponses[agentId];
    state.eventQueue = (state.eventQueue ?? []).filter(
      (event) => event.id !== pending?.eventId,
    );
    changed = true;
  }
  for (const agent of Object.values(ecology.agents ?? {})) {
    for (const key of [
      'publicFlowMemory',
      'activePublicSignal',
    ]) {
      const record = agent?.[key];
      if (record === null || record === undefined) continue;
      const result = migrateObservedRecord(state, record);
      changed = result.changed || changed;
      if (result.valid) {
        continue;
      }
      if (key === 'publicFlowMemory') {
        agent[key] = null;
      } else {
        delete agent[key];
      }
      changed = true;
    }
  }
  return changed;
}

/**
 * Deterministically upgrades the last production ecology schema in place.
 * Unknown, future, or partially upgraded schemas remain fail-closed.
 *
 * The migration deliberately does not invent exchange accounts: retail
 * personas operate bounded mandates over existing broker-client capital
 * accounts, while the matching engine remains the final resource authority.
 */
function migrateCustodyAccountTracking(
  state,
  custodyMigration,
) {
  if (!custodyMigration?.migrated) return false;
  const ecology = state.agentEcology;
  const pool =
    state.accounts?.securities_lending_pool;
  if (!ecology || !pool) return false;
  const symbols = Object.keys(state.books ?? {});
  ecology.accountBaselines ??= {};
  for (const [
    accountId,
    transfers,
  ] of Object.entries(
    custodyMigration.transfersByAccount ?? {},
  )) {
    const baseline =
      ecology.accountBaselines[accountId];
    if (!baseline) continue;
    for (const symbol of symbols) {
      baseline.holdings[symbol] = Math.max(
        0,
        (baseline.holdings[symbol] ?? 0) -
          (transfers[symbol] ?? 0),
      );
    }
    baseline.initialEquityCents =
      initialEquityCentsFromWorld(
        state.world,
        baseline.cashCents,
        baseline.holdings,
      );
    for (const agent of Object.values(
      ecology.agents ?? {},
    )) {
      if (agent.accountId !== accountId) continue;
      const allocationBps =
        agent.accountAllocationBps ?? 10_000;
      if (agent.behaviorState?.account) {
        agent.behaviorState.account.initialHoldings =
          Object.fromEntries(
            symbols.map((symbol) => [
              symbol,
              Math.floor(
                baseline.holdings[symbol] *
                  allocationBps /
                  10_000,
              ),
            ]),
          );
      }
      if (agent.kind === 'maker') {
        agent.targetHoldings =
          cloneJson(baseline.holdings);
      }
      agent.initialEquityCents = Math.max(
        1,
        Math.floor(
          baseline.initialEquityCents *
            allocationBps /
            10_000,
        ),
      );
    }
  }
  const outstandingLoans = Object.values(
    state.world.derivatives?.accounts ?? {},
  ).reduce((totals, account) => {
    for (const [symbol, loan] of Object.entries(
      account.borrowedSecurities ?? {},
    )) {
      totals[symbol] =
        (totals[symbol] ?? 0) +
        (loan.quantity ?? 0);
    }
    return totals;
  }, {});
  const poolBaselineHoldings = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      (pool.holdings[symbol] ?? 0) +
        (outstandingLoans[symbol] ?? 0),
    ]),
  );
  ecology.accountBaselines[
    'securities_lending_pool'
  ] = {
    cashCents: 0,
    holdings: poolBaselineHoldings,
    initialEquityCents:
      initialEquityCentsFromWorld(
        state.world,
        0,
        poolBaselineHoldings,
      ),
  };
  if (
    ecology.capacityLedger &&
    !sameStringSet(
      Object.keys(
        ecology.capacityLedger.byAccount ?? {},
      ),
      ecologyTrackedAccountIds(state),
    )
  ) {
    hydrateCapacityLedger(state);
  }
  return true;
}

function migrateExpandedStockUniverseEcology(state) {
  const ecology = state.agentEcology;
  const symbols = Object.keys(state.books ?? {});
  const baselineEntries = Object.values(
    ecology.accountBaselines ?? {},
  );
  const alreadyCurrent =
    baselineEntries.length > 0 &&
    baselineEntries.every((baseline) =>
      sameStringSet(
        Object.keys(baseline?.holdings ?? {}),
        symbols,
      ),
    );
  if (alreadyCurrent) return false;
  const legacySymbols =
    KNOWN_LEGACY_STOCK_UNIVERSES.find(
      (candidate) =>
        baselineEntries.length > 0 &&
        baselineEntries.every((baseline) =>
          sameStringSet(
            Object.keys(baseline?.holdings ?? {}),
            candidate,
          ),
        ),
    );
  if (
    !legacySymbols ||
    symbols.length <= legacySymbols.length ||
    legacySymbols.some((symbol) => !symbols.includes(symbol)) ||
    baselineEntries.length === 0 ||
    Object.keys(ecology.accountBaselines ?? {}).some(
      (accountId) => !state.accounts?.[accountId],
    )
  ) {
    throw new Error(
      'Unsupported partial agent stock-universe checkpoint.',
    );
  }

  const fresh = createAgentCatalog(state.world);
  const addedSymbols = symbols.filter(
    (symbol) => !legacySymbols.includes(symbol),
  );
  for (const accountId of ecologyTrackedAccountIds(
    state,
  )) {
    const source =
      fresh.accountBaselines[accountId];
    if (!source) {
      throw new Error(
        `Missing migrated agent baseline ${accountId}.`,
      );
    }
    const baseline =
      ecology.accountBaselines[accountId];
    if (!baseline) {
      ecology.accountBaselines[accountId] =
        cloneJson(source);
      continue;
    }
    for (const symbol of addedSymbols) {
      baseline.holdings[symbol] =
        source.holdings[symbol];
    }
    baseline.initialEquityCents =
      initialEquityCentsFromWorld(
        state.world,
        baseline.cashCents,
        baseline.holdings,
      );
  }

  for (const agentId of AGENT_IDS) {
    const agent = ecology.agents?.[agentId];
    const source = fresh.agents[agentId];
    const template = AGENT_TEMPLATES[agentId];
    if (
      !agent ||
      !source ||
      !sameStringSet(
        Object.keys(agent.targetHoldings ?? {}),
        legacySymbols,
      ) ||
      !sameStringSet(
        Object.keys(
          agent.behaviorState?.account
            ?.initialHoldings ?? {},
        ),
        legacySymbols,
      ) ||
      !sameStringSet(
        Object.keys(
          agent.behaviorState?.cognition
            ?.beliefs ?? {},
        ),
        legacySymbols,
      )
    ) {
      throw new Error(
        `Unsupported partial agent stock-universe state: ${agentId}.`,
      );
    }
    const fundamentals = createFundamentalSnapshot(
      state.world,
      {
        actor: template,
        nowMs: agent.lastFundamentalRefreshMs,
      },
    );
    for (const symbol of addedSymbols) {
      agent.targetHoldings[symbol] =
        source.targetHoldings[symbol];
      agent.behaviorState.account.initialHoldings[
        symbol
      ] =
        source.behaviorState.account.initialHoldings[
          symbol
        ];
      agent.behaviorState.account.settledNetUnits[
        symbol
      ] = 0;
      agent.behaviorState.account.openExposureCostTicks[
        symbol
      ] = 0;
      agent.behaviorState.cognition.beliefs[symbol] =
        cloneJson(
          source.behaviorState.cognition.beliefs[
            symbol
          ],
        );
    }
    agent.delayedFundamentals = cloneJson(
      fundamentals.delayedFundamentals,
    );
    agent.fundamentalSourceFactIds = cloneJson(
      fundamentals.fundamentalSourceFactIds,
    );
    agent.valuationBands = cloneJson(
      fundamentals.valuationBands,
    );
    agent.lastFundamentalTick =
      fundamentals.lastFundamentalTick;
    agent.openingSignals = Object.fromEntries(
      symbols.map((symbol) => [
        symbol,
        agent.openingSignals?.[symbol] ?? 0,
      ]),
    );
    const baseline =
      ecology.accountBaselines[agent.accountId];
    agent.initialEquityCents = Math.max(
      1,
      Math.floor(
        baseline.initialEquityCents *
          agent.accountAllocationBps /
          10_000,
      ),
    );
  }

  const ledger = ecology.capacityLedger;
  if (
    !ledger ||
    ledger.ruleVersion !==
      CAPACITY_LEDGER_RULE_VERSION ||
    Object.keys(ledger.byAccount ?? {}).some(
      (accountId) => !state.accounts[accountId],
    )
  ) {
    throw new Error(
      'Unsupported partial agent capacity checkpoint.',
    );
  }
  for (const accountId of ecologyTrackedAccountIds(
    state,
  )) {
    ledger.byAccount[accountId] ??=
      cloneJson(
        fresh.capacityLedger.byAccount[accountId],
      );
  }
  sealCapacityLedger(ledger);
  return true;
}

export function migrateAgentEcologyState(
  state,
  {
    custodyMigration = null,
    strictCurrentSchema = false,
  } = {},
) {
  const ecology = state?.agentEcology;
  if (!ecology) {
    throw new Error('Agent ecology state is required.');
  }
  const stockUniverseMigrated =
    ecology.ruleVersion === AGENT_RULE_VERSION
      ? migrateExpandedStockUniverseEcology(state)
      : false;
  const custodyTrackingMigrated =
    migrateCustodyAccountTracking(
      state,
      custodyMigration,
    );
  if (ecology.ruleVersion === AGENT_RULE_VERSION) {
    let migrated =
      stockUniverseMigrated ||
      custodyTrackingMigrated;
    if (
      ecology.capacityLedger?.ruleVersion ===
      LEGACY_CAPACITY_LEDGER_RULE_VERSION
    ) {
      migrateLegacyCapacityLedger(state);
      migrated = true;
    } else if (
      ecology.capacityLedger?.ruleVersion !==
      CAPACITY_LEDGER_RULE_VERSION
    ) {
      throw new Error(
        `Unsupported capacity ledger schema: ${
          ecology.capacityLedger?.ruleVersion
        }`,
      );
    }
    const symbols = Object.keys(state.books ?? {});
    for (const agent of Object.values(ecology.agents ?? {})) {
      if (!agent?.behaviorState) {
        throw new Error(
          `Unsupported behavior schema: ${agent?.id ?? 'unknown'}`,
        );
      }
      migrated =
        migrateBehaviorState(
          agent.behaviorState,
          symbols,
          {
            agentId: agent.id,
            executionAccountId: agent.accountId,
          },
        ) ||
        migrated;
      if (agent.limitQueueEpisodes === undefined) {
        agent.limitQueueEpisodes = {};
        migrated = true;
      } else if (
        !agent.limitQueueEpisodes ||
        Array.isArray(agent.limitQueueEpisodes) ||
        typeof agent.limitQueueEpisodes !== 'object'
      ) {
        throw new Error(
          `Unsupported limit-queue episode schema: ${agent.id}`,
        );
      }
    }
    if (!strictCurrentSchema) {
      migrated =
        migratePublicObservationEvidence(state) ||
        migrated;
    }
    return migrated;
  }
  if (
    ecology.ruleVersion === PREVIOUS_AGENT_RULE_VERSION
  ) {
    if (
      !sameStringSet(
        Object.keys(ecology.agents ?? {}),
        AGENT_IDS,
      )
    ) {
      throw new Error(
        `Unsupported agent ecology schema: ${ecology.ruleVersion}`,
      );
    }
    if (
      ecology.capacityLedger?.ruleVersion ===
      LEGACY_CAPACITY_LEDGER_RULE_VERSION
    ) {
      migrateLegacyCapacityLedger(state);
    } else if (
      ecology.capacityLedger?.ruleVersion !==
      CAPACITY_LEDGER_RULE_VERSION
    ) {
      throw new Error(
        `Unsupported capacity ledger schema: ${
          ecology.capacityLedger?.ruleVersion
        }`,
      );
    }
    const symbols = Object.keys(state.books ?? {});
    for (const agent of Object.values(ecology.agents)) {
      if (!agent?.behaviorState) {
        throw new Error(
          `Unsupported behavior schema: ${agent?.id ?? 'unknown'}`,
        );
      }
      migrateBehaviorState(
        agent.behaviorState,
        symbols,
        {
          agentId: agent.id,
          executionAccountId: agent.accountId,
        },
      );
      agent.limitQueueEpisodes ??= {};
    }
    ecology.ruleVersion = AGENT_RULE_VERSION;
    migratePublicObservationEvidence(state);
    return true;
  }
  if (
    ecology.ruleVersion ===
    PRE_CAPACITY_AGENT_RULE_VERSION
  ) {
    if (
      !sameStringSet(
        Object.keys(ecology.agents ?? {}),
        AGENT_IDS,
      ) ||
      Object.hasOwn(ecology, 'capacityLedger')
    ) {
      throw new Error(
        `Unsupported agent ecology schema: ${ecology.ruleVersion}`,
      );
    }
    const symbols = Object.keys(state.books ?? {});
    for (const agent of Object.values(ecology.agents)) {
      if (!agent?.behaviorState) {
        throw new Error(
          `Unsupported behavior schema: ${agent?.id ?? 'unknown'}`,
        );
      }
      migrateBehaviorState(
        agent.behaviorState,
        symbols,
        {
          agentId: agent.id,
          executionAccountId: agent.accountId,
        },
      );
      agent.limitQueueEpisodes ??= {};
    }
    ecology.ruleVersion = AGENT_RULE_VERSION;
    hydrateCapacityLedger(state);
    migratePublicObservationEvidence(state);
    return true;
  }
  if (
    ecology.ruleVersion !== LEGACY_AGENT_RULE_VERSION ||
    !sameStringSet(
      Object.keys(ecology.agents ?? {}),
      LEGACY_AGENT_IDS,
    ) ||
    Object.hasOwn(ecology, 'capacityLedger') ||
    Object.values(ecology.agents ?? {}).some(
      (agent) =>
        Object.hasOwn(agent, 'behaviorState') ||
        Object.hasOwn(agent, 'accountAllocationBps'),
    )
  ) {
    throw new Error(
      `Unsupported agent ecology schema: ${ecology.ruleVersion}`,
    );
  }
  const fresh = createAgentCatalog(state.world);
  fresh.accountBaselines = cloneJson(
    ecology.accountBaselines,
  );
  for (const agent of Object.values(fresh.agents)) {
    const baseline =
      fresh.accountBaselines[agent.accountId];
    agent.riskBudgetCents = Math.max(
      1,
      Math.floor(
        baseline.cashCents *
          agent.accountAllocationBps /
          10_000 *
          agent.riskFractionBps /
          10_000,
      ),
    );
    agent.initialEquityCents = Math.max(
      1,
      Math.floor(
        baseline.initialEquityCents *
          agent.accountAllocationBps /
          10_000,
      ),
    );
    agent.behaviorState = createBehaviorState({
      world: state.world,
      agent,
      accountBaseline: baseline,
      allocationBps: agent.accountAllocationBps,
    });
    if (agent.kind === 'retail') {
      agent.targetHoldings = cloneJson(
        agent.behaviorState.account.initialHoldings,
      );
    }
  }
  for (const agentId of LEGACY_AGENT_IDS) {
    const migrated = fresh.agents[agentId];
    const account =
      state.accounts[migrated.accountId];
    const baseline =
      fresh.accountBaselines[migrated.accountId];
    migrated.behaviorState.account.settledNetCashCents =
      account.cashCents - baseline.cashCents;
    migrated.behaviorState.account.settledNetUnits =
      Object.fromEntries(
        Object.keys(state.books).map((symbol) => [
          symbol,
          account.holdings[symbol] -
            baseline.holdings[symbol],
        ]),
      );
    migrated.behaviorState.account.openExposureCostTicks =
      Object.fromEntries(
        Object.keys(state.books).map((symbol) => [
          symbol,
          migrated.behaviorState.account
            .settledNetUnits[symbol] === 0
            ? 0
            : publicLastPriceTicks(state, symbol),
        ]),
      );
    fresh.agents[agentId] = {
      ...migrated,
      ...cloneJson(ecology.agents[agentId]),
      accountId: migrated.accountId,
      accountAllocationBps: migrated.accountAllocationBps,
      riskBudgetCents: migrated.riskBudgetCents,
      initialEquityCents: migrated.initialEquityCents,
      targetHoldings: migrated.targetHoldings,
      behaviorState: migrated.behaviorState,
    };
  }
  for (const event of state.eventQueue ?? []) {
    if (
      event.type !== 'agent_command_batch' ||
      !LEGACY_AGENT_IDS.includes(event.actorId)
    ) {
      continue;
    }
    for (const command of event.payload?.commands ?? []) {
      command.ecologyAgentId ??= event.actorId;
    }
  }
  state.agentEcology = {
    ...fresh,
    enabled: ecology.enabled,
    recentActivity: cloneJson(ecology.recentActivity ?? [])
      .slice(-MAX_RECENT_ACTIVITY)
      .map((activity) => ({
          ...activity,
          publicActions: activity.publicActions ?? [],
        })),
    publicFlow: cloneJson(ecology.publicFlow ?? []).slice(
      -MAX_PUBLIC_FLOW,
    ),
    pendingResponses: cloneJson(
      ecology.pendingResponses ?? {},
    ),
  };
  hydrateCapacityLedger(state);
  migratePublicObservationEvidence(state);
  return true;
}

export function refreshDelayedFundamentals(
  state,
  agentId = null,
) {
  const targetIds =
    agentId === null ? AGENT_IDS : [agentId];
  const snapshots = {};
  for (const id of targetIds) {
    const agent = state.agentEcology.agents[id];
    if (!agent) continue;
    const snapshot = createFundamentalSnapshot(state.world, {
      actor: agent,
      nowMs: state.nowMs,
    });
    snapshots[id] = snapshot;
    agent.delayedFundamentals = cloneJson(
      snapshot.delayedFundamentals,
    );
    agent.fundamentalSourceFactIds = cloneJson(
      snapshot.fundamentalSourceFactIds,
    );
    agent.valuationBands = cloneJson(snapshot.valuationBands);
    agent.lastFundamentalTick = snapshot.lastFundamentalTick;
    agent.lastFundamentalRefreshMs = state.nowMs;
  }
  return cloneJson(
    agentId === null ? snapshots : snapshots[agentId] ?? null,
  );
}

function compareEvents(left, right) {
  return (
    left.scheduledMs - right.scheduledMs ||
    left.phasePriority - right.phasePriority ||
    left.sequence - right.sequence
  );
}

function scheduleEcologyEvent(
  state,
  { type, scheduledMs, phasePriority, actorId, payload },
) {
  if (!Number.isSafeInteger(scheduledMs) || scheduledMs < state.nowMs) {
    throw new RangeError('agent event must be scheduled at an integer millisecond');
  }
  const sequence = state.nextEventSequence++;
  const event = {
    id: `market_event_${String(sequence).padStart(8, '0')}`,
    scheduledMs,
    phasePriority,
    sequence,
    type,
    actorId,
    payload: cloneJson(payload),
    rngKey: `${state.world.world.seed}:${scheduledMs}:${phasePriority}:${sequence}`,
  };
  state.eventQueue.push(event);
  state.eventQueue.sort(compareEvents);
  return event;
}

function cadenceFor(state, agent) {
  const jitterUnit = deterministicUnit(state, agent, 'cadence');
  const jitter = Math.round(
    (jitterUnit * 2 - 1) * agent.cadenceJitterMs,
  );
  return Math.max(1, agent.cadenceMs + jitter);
}

/**
 * Ensures exactly one recurring decision event per agent. Missing events are
 * recreated from the agent's own deterministic substream.
 */
export function scheduleAgentDecisions(state) {
  if (!state.agentEcology?.enabled) return [];
  const scheduled = [];
  for (const agentId of AGENT_IDS) {
    const alreadyScheduled = state.eventQueue.some(
      (event) =>
        event.type === 'agent_decision' &&
        event.actorId === agentId,
    );
    if (alreadyScheduled) continue;
    const agent = state.agentEcology.agents[agentId];
    const scheduledMs =
      agent.lastDecisionMs === null
        ? state.nowMs + agent.initialOffsetMs
        : state.nowMs + cadenceFor(state, agent);
    scheduled.push(
      scheduleEcologyEvent(state, {
        type: 'agent_decision',
        scheduledMs,
        phasePriority:
          agent.kind === 'maker'
            ? state.phasePriority.MAKER_QUOTE
            : state.phasePriority.INSTITUTION_DECISION,
        actorId: agentId,
        payload: {
          agentId,
          trigger: 'cadence',
        },
      }),
    );
  }
  return scheduled;
}

function publicLastPriceTicks(state, symbol) {
  return cents(state.world.market.securities[symbol].lastPrice);
}

function publicVolatilityTicks(state, symbol) {
  const trades =
    publicRealtimeTape(state).bySymbol.get(symbol) ?? [];
  const prices = [];
  for (
    let index = Math.max(0, trades.length - 32);
    index < trades.length;
    index += 1
  ) {
    const priceTicks = trades[index]?.priceTicks;
    if (isPositiveInteger(priceTicks)) {
      prices.push(priceTicks);
    }
  }
  if (prices.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < prices.length; index += 1) {
    total += Math.abs(prices[index] - prices[index - 1]);
  }
  return Math.round(total / (prices.length - 1));
}

function freeCash(account) {
  return Math.max(0, account.cashCents - account.reservedCashCents);
}

function freeUnits(account, symbol) {
  return Math.max(
    0,
    (account.holdings[symbol] ?? 0) -
      (account.reservedHoldings[symbol] ?? 0),
  );
}

function makerQuoteState(account) {
  const stress = account.fundingStressBps ?? 0;
  if (stress >= 7_500) return 'REDUCE_SIZE';
  if (stress >= 3_800) return 'WIDEN';
  return 'ACTIVE';
}

function makerBuyOrderCostCents(priceTicks, quantity) {
  const grossCents = priceTicks * quantity;
  return (
    grossCents +
    Math.max(5, Math.ceil(grossCents * 5 / 10_000))
  );
}

function maximumAffordableMakerBuyQuantity(
  priceTicks,
  budgetCents,
) {
  let low = 0;
  let high = Math.max(
    0,
    Math.floor(budgetCents / Math.max(1, priceTicks)),
  );
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (
      makerBuyOrderCostCents(priceTicks, middle) <=
      budgetCents
    ) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

function concentrateFiniteStandingClip(
  orders,
  targetNearUnits,
  nearLevelCount = 2,
) {
  if (!Array.isArray(orders) || orders.length === 0) return [];
  const totalUnits = orders.reduce(
    (sum, order) => sum + Math.max(0, order.quantity ?? 0),
    0,
  );
  const nearCount = Math.min(
    orders.length,
    Math.max(1, nearLevelCount),
  );
  const tailCount = orders.length - nearCount;
  const existingNearUnits = orders
    .slice(0, nearCount)
    .reduce(
      (sum, order) => sum + Math.max(0, order.quantity ?? 0),
      0,
    );
  const nearUnits = Math.min(
    Math.max(nearCount, totalUnits - tailCount),
    Math.max(existingNearUnits, Math.round(targetNearUnits)),
  );
  if (nearUnits <= existingNearUnits) {
    return orders;
  }
  const distribute = (slice, targetUnits) => {
    if (slice.length === 0) return [];
    const minimumUnits = slice.length;
    const extraUnits = Math.max(0, targetUnits - minimumUnits);
    const weights = slice.map((order) =>
      Math.max(1, order.quantity ?? 0),
    );
    const weightTotal = weights.reduce(
      (sum, weight) => sum + weight,
      0,
    );
    const allocated = weights.map((weight) =>
      Math.floor(extraUnits * weight / weightTotal),
    );
    let remainder =
      extraUnits -
      allocated.reduce((sum, quantity) => sum + quantity, 0);
    for (
      let index = 0;
      remainder > 0 && index < allocated.length;
      index = (index + 1) % allocated.length
    ) {
      allocated[index] += 1;
      remainder -= 1;
    }
    return slice.map((order, index) => ({
      ...order,
      quantity: 1 + allocated[index],
    }));
  };
  return [
    ...distribute(orders.slice(0, nearCount), nearUnits),
    ...distribute(
      orders.slice(nearCount),
      totalUnits - nearUnits,
    ),
  ];
}

function makerDesiredOrders({
  agent,
  symbol,
  quotePlan,
  orderContext,
  buyBudgetCents,
  sellCapacityUnits,
  buySizeMultiplier = 1,
  sellSizeMultiplier = 1,
}) {
  let remainingBuyCents = Math.max(0, buyBudgetCents);
  let remainingSellUnits = Math.max(0, sellCapacityUnits);
  const desired = [];
  const inventoryCapacityUnits = Math.max(
    1_200,
    agent.baseOrderUnits * 30,
  );
  const inventoryBucketUnits = Math.max(
    24,
    Math.round(inventoryCapacityUnits * 0.04),
  );
  const inventoryGapUnits =
    quotePlan.diagnostics.inventoryGapUnits;
  const inventoryBucket = Math.trunc(
    inventoryGapUnits / inventoryBucketUnits,
  );
  const liquidityIntent = (gridIndex) => {
    if (gridIndex < 10) {
      return { zone: 'TOUCH', purpose: 'queue_capture' };
    }
    if (gridIndex < 30) {
      return { zone: 'CORE', purpose: 'spread_capture' };
    }
    if (gridIndex < 60) {
      return {
        zone: 'INVENTORY',
        purpose: 'inventory_rebalance',
      };
    }
    if (gridIndex < 80) {
      return { zone: 'VOLATILITY', purpose: 'jump_buffer' };
    }
    return { zone: 'TAIL', purpose: 'valuation_tail' };
  };
  const append = (orders, side) => {
    const sizedOrders = orders.map((order, level) => {
      const layerSizeBps =
        9_700 +
        (
          hash32(
            `${agent.id}:${symbol}:${side}:${level}:layer-size`,
          ) %
          601
        );
      return {
        order,
        level,
        desiredQuantity: Math.max(
          1,
          Math.floor(
            order.quantity *
              (side === 'buy'
                ? buySizeMultiplier
                : sellSizeMultiplier) *
              layerSizeBps /
              10_000,
          ),
        ),
      };
    });
    const futureMinimum = new Array(sizedOrders.length + 1).fill(0);
    for (let index = sizedOrders.length - 1; index >= 0; index -= 1) {
      futureMinimum[index] =
        futureMinimum[index + 1] +
        (
          side === 'buy'
            ? makerBuyOrderCostCents(
                sizedOrders[index].order.priceTicks,
                1,
              )
            : 1
        );
    }
    const canFundEveryLevel =
      (
        side === 'buy'
          ? remainingBuyCents
          : remainingSellUnits
      ) >= futureMinimum[0];
    for (const {
      order,
      level,
      desiredQuantity,
    } of sizedOrders) {
      let quantity = desiredQuantity;
      if (side === 'buy') {
        const reservedForLater = canFundEveryLevel
          ? futureMinimum[level + 1]
          : 0;
        const maximum = maximumAffordableMakerBuyQuantity(
          order.priceTicks,
          Math.max(0, remainingBuyCents - reservedForLater),
        );
        quantity = Math.min(quantity, maximum);
        if (quantity > 0) {
          remainingBuyCents -= makerBuyOrderCostCents(
            order.priceTicks,
            quantity,
          );
        }
      } else {
        const reservedForLater = canFundEveryLevel
          ? futureMinimum[level + 1]
          : 0;
        quantity = Math.min(
          quantity,
          Math.max(0, remainingSellUnits - reservedForLater),
        );
        remainingSellUnits -= quantity;
      }
      if (quantity <= 0) continue;
      const gridIndex =
        level * Math.max(1, agent.priceLaneModulus ?? 1) +
        Math.max(0, agent.priceLaneRemainder ?? 0);
      const layerKey =
        `maker:${agent.id}:${symbol}:${side}:${level}`;
      const intent = liquidityIntent(gridIndex);
      desired.push({
        layerKey,
        makerId: agent.id,
        symbol,
        side,
        priceTicks: order.priceTicks,
        quantity,
        tif: 'GTC',
        parentOrderId:
          `${layerKey}:intent:${agent.decisionSequence}`,
        liquidityLayer: {
          layerKey,
          symbol,
          side,
          gridIndex,
          zone: intent.zone,
          purpose: intent.purpose,
          anchorTicks: quotePlan.reservationPriceTicks,
          valuationObservationId:
            quotePlan.diagnostics.valuationObservationId,
          inventoryDirection: Math.sign(
            inventoryGapUnits,
          ),
          inventoryBucket,
          inventoryBucketUnits,
          quoteState: quotePlan.diagnostics.quoteState,
          symbolRegime: orderContext?.regime ?? null,
          flowPressureBucket: Math.floor(
            Math.max(
              0,
              orderContext?.flowIntensityBps ?? 0,
            ) / 1_000,
          ),
          flowDirection: Math.sign(
            orderContext?.flowNetSignedUnits ?? 0,
          ),
        },
      });
    }
  };
  // Two percent is reservation headroom for deterministic per-layer lot
  // rounding; it is still part of the same finite clip, not replenishment.
  const perMakerRoutineClipUnits = Math.ceil(
    NORMAL_STANDING_BOOK_CLIP_UNITS * 1.02 / 2,
  );
  const routineClipInputUnits = (sideSizeMultiplier) =>
    Math.ceil(
      perMakerRoutineClipUnits /
        Math.max(0.1, sideSizeMultiplier * 0.97),
    );
  append(
    concentrateFiniteStandingClip(
      quotePlan.bids,
      routineClipInputUnits(buySizeMultiplier),
    ),
    'buy',
  );
  append(
    concentrateFiniteStandingClip(
      quotePlan.asks,
      routineClipInputUnits(sellSizeMultiplier),
    ),
    'sell',
  );
  return desired;
}

function fitMakerCoverageToFiniteResources(
  orders,
  buyBudgetCents,
  sellCapacityUnits,
) {
  const adjustedByLayer = new Map();
  const fitSide = (side, capacity) => {
    const sideOrders = orders.filter((order) => order.side === side);
    const cost = (order, quantity) =>
      side === 'buy'
        ? makerBuyOrderCostCents(order.priceTicks, quantity)
        : quantity;
    const requestedCost = sideOrders.reduce(
      (total, order) => total + cost(order, order.quantity),
      0,
    );
    if (requestedCost <= capacity) {
      for (const order of sideOrders) {
        adjustedByLayer.set(order.layerKey, order);
      }
      return;
    }
    const futureMinimum = new Array(sideOrders.length + 1).fill(0);
    for (let index = sideOrders.length - 1; index >= 0; index -= 1) {
      futureMinimum[index] =
        futureMinimum[index + 1] + cost(sideOrders[index], 1);
    }
    const canFundEveryLevel = capacity >= futureMinimum[0];
    let remaining = Math.max(0, capacity);
    for (const [index, order] of sideOrders.entries()) {
      const reservedForLater = canFundEveryLevel
        ? futureMinimum[index + 1]
        : 0;
      const available = Math.max(0, remaining - reservedForLater);
      const maximum = side === 'buy'
        ? maximumAffordableMakerBuyQuantity(
            order.priceTicks,
            available,
          )
        : available;
      const quantity = Math.min(order.quantity, maximum);
      if (quantity <= 0) continue;
      remaining -= cost(order, quantity);
      adjustedByLayer.set(
        order.layerKey,
        quantity === order.quantity
          ? order
          : { ...order, quantity },
      );
    }
  };
  fitSide('buy', Math.max(0, buyBudgetCents));
  fitSide('sell', Math.max(0, sellCapacityUnits));
  return orders.flatMap((order) => {
    const adjusted = adjustedByLayer.get(order.layerKey);
    return adjusted ? [adjusted] : [];
  });
}

function reallocateMakerLawfulLaneCoverage({
  orders,
  agent,
  dailyBand,
  bestExternalBidTicks,
  bestExternalAskTicks,
  buyBudgetCents,
  sellCapacityUnits,
}) {
  const laneModulus = Math.max(
    1,
    Math.floor(agent.priceLaneModulus ?? 1),
  );
  const laneRemainder =
    (
      Math.floor(agent.priceLaneRemainder ?? 0) %
        laneModulus +
      laneModulus
    ) % laneModulus;
  const targetLevelsPerLane = Math.ceil(100 / laneModulus);
  const reallocatedByLayer = new Map();
  const retainSide = (side) => {
    const sideOrders = orders.filter((order) => order.side === side);
    const minimumPriceTicks = side === 'buy'
      ? dailyBand.limitDownTicks
      : Math.max(
          dailyBand.limitDownTicks,
          isPositiveInteger(bestExternalBidTicks)
            ? bestExternalBidTicks + 1
            : dailyBand.limitDownTicks,
        );
    const maximumPriceTicks = side === 'buy'
      ? Math.min(
          dailyBand.limitUpTicks,
          isPositiveInteger(bestExternalAskTicks)
            ? bestExternalAskTicks - 1
            : dailyBand.limitUpTicks,
        )
      : dailyBand.limitUpTicks;
    if (minimumPriceTicks > maximumPriceTicks) return;
    const firstLanePriceTicks =
      minimumPriceTicks +
      (
        laneRemainder -
          (minimumPriceTicks % laneModulus) +
          laneModulus
      ) % laneModulus;
    const lawfulLanePrices = [];
    for (
      let priceTicks = firstLanePriceTicks;
      priceTicks <= maximumPriceTicks;
      priceTicks += laneModulus
    ) {
      lawfulLanePrices.push(priceTicks);
    }
    const lawfulOrders = sideOrders.filter(
      (order) =>
        order.priceTicks >= minimumPriceTicks &&
        order.priceTicks <= maximumPriceTicks,
    );
    for (const order of lawfulOrders) {
      reallocatedByLayer.set(order.layerKey, order);
    }
    const targetLevels = Math.min(
      targetLevelsPerLane,
      lawfulLanePrices.length,
      sideOrders.length,
    );
    const occupiedPrices = new Set(
      lawfulOrders.map((order) => order.priceTicks),
    );
    const unusedOrders = sideOrders.filter(
      (order) => !reallocatedByLayer.has(order.layerKey),
    );
    while (
      occupiedPrices.size < targetLevels &&
      unusedOrders.length > 0
    ) {
      const missingPrices = lawfulLanePrices.filter(
        (priceTicks) => !occupiedPrices.has(priceTicks),
      );
      if (missingPrices.length === 0) break;
      const distanceToCoverage = (priceTicks) => {
        let minimumDistance = Number.MAX_SAFE_INTEGER;
        for (const occupiedPriceTicks of occupiedPrices) {
          minimumDistance = Math.min(
            minimumDistance,
            Math.abs(priceTicks - occupiedPriceTicks),
          );
        }
        return minimumDistance;
      };
      missingPrices.sort(
        (left, right) =>
          distanceToCoverage(left) - distanceToCoverage(right) ||
          (side === 'buy' ? right - left : left - right),
      );
      const priceTicks = missingPrices[0];
      unusedOrders.sort(
        (left, right) =>
          Math.abs(left.priceTicks - priceTicks) -
            Math.abs(right.priceTicks - priceTicks) ||
          left.layerKey.localeCompare(right.layerKey),
      );
      const source = unusedOrders.shift();
      const reallocated = {
        ...source,
        priceTicks,
        liquidityLayer: {
          ...source.liquidityLayer,
          lawfulCoverageRepair: 'lawful_lane_reallocation',
          unconstrainedPriceTicks: source.priceTicks,
        },
      };
      reallocatedByLayer.set(source.layerKey, reallocated);
      occupiedPrices.add(priceTicks);
    }
  };
  retainSide('buy');
  retainSide('sell');
  const reallocated = orders.flatMap((order) => {
    const retained = reallocatedByLayer.get(order.layerKey);
    return retained ? [retained] : [];
  });
  return fitMakerCoverageToFiniteResources(
    reallocated,
    buyBudgetCents,
    sellCapacityUnits,
  );
}

function transitionLimitQueueEpisode(
  agent,
  symbol,
  next,
) {
  agent.limitQueueEpisodes ??= {};
  const previous = agent.limitQueueEpisodes[symbol] ?? null;
  const nextOrPrevious = (key, fallback) =>
    Object.hasOwn(next, key)
      ? next[key]
      : previous?.[key] ?? fallback;
  const transitionSequence =
    (previous?.transitionSequence ?? 0) + 1;
  const sameState =
    previous &&
    previous.state === next.state &&
    previous.direction === next.direction &&
    previous.limitPriceTicks === next.limitPriceTicks;
  const episode = {
    version: LIMIT_QUEUE_EPISODE_VERSION,
    episodeId:
      nextOrPrevious('episodeId', null) ??
      `limit-episode:${agent.id}:${symbol}:${next.direction}:${next.nowMs}:${transitionSequence}`,
    symbol,
    direction: next.direction,
    limitPriceTicks: next.limitPriceTicks,
    state: next.state,
    stateSinceMs: sameState
      ? previous.stateSinceMs
      : next.nowMs,
    lastTransitionMs: sameState
      ? previous.lastTransitionMs
      : next.nowMs,
    transitionSequence: sameState
      ? previous.transitionSequence
      : transitionSequence,
    finiteBudgetUnits:
      nextOrPrevious('finiteBudgetUnits', 0),
    usedBudgetUnits:
      nextOrPrevious('usedBudgetUnits', 0),
    remainingReplenishmentUnits:
      nextOrPrevious(
        'remainingReplenishmentUnits',
        0,
      ),
    activeLayerKey:
      nextOrPrevious('activeLayerKey', null),
    transitionReason:
      nextOrPrevious(
        'transitionReason',
        'public_order_book_evidence',
      ),
    lastObservedCommitSeq: next.commitSeq,
  };
  agent.limitQueueEpisodes[symbol] = episode;
  return episode;
}

function concentrateMakerBoundaryQueue({
  state,
  agent,
  symbol,
  security,
  orderContext,
  publicShock,
  currentOrders,
  desiredOrders,
  buyBudgetCents,
}) {
  const band = securityDailyBand(security);
  const lastPriceTicks = publicLastPriceTicks(state, symbol);
  const direction =
    lastPriceTicks === band.limitUpTicks
      ? 'up'
      : lastPriceTicks === band.limitDownTicks
        ? 'down'
        : null;
  const previous =
    agent.limitQueueEpisodes?.[symbol] ?? null;
  if (!direction) {
    if (
      previous &&
      !['break', 'failed_recovery'].includes(
        previous.state,
      )
    ) {
      transitionLimitQueueEpisode(agent, symbol, {
        nowMs: state.nowMs,
        commitSeq: state.commitSeq,
        direction: previous.direction,
        limitPriceTicks: previous.limitPriceTicks,
        state: 'break',
        transitionReason: 'last_trade_left_boundary',
        remainingReplenishmentUnits: 0,
        activeLayerKey: null,
      });
    } else if (
      previous?.state === 'break' &&
      state.nowMs - previous.stateSinceMs >=
        MAX_CONSENSUS_LIMIT_REST_MS
    ) {
      transitionLimitQueueEpisode(agent, symbol, {
        nowMs: state.nowMs,
        commitSeq: state.commitSeq,
        direction: previous.direction,
        limitPriceTicks: previous.limitPriceTicks,
        state: 'failed_recovery',
        transitionReason:
          'finite_relock_evidence_window_expired',
        remainingReplenishmentUnits: 0,
        activeLayerKey: null,
      });
    }
    return desiredOrders;
  }

  const side = direction === 'up' ? 'buy' : 'sell';
  const directionSign = direction === 'up' ? 1 : -1;
  const limitPriceTicks =
    direction === 'up'
      ? band.limitUpTicks
      : band.limitDownTicks;
  const layerKey =
    `maker:${agent.id}:${symbol}:${side}:limit-queue`;
  const activeBoundaryOrder =
    currentOrders.find(
      (order) =>
        activeOrder(order) &&
        (
          order.liquidityLayer?.layerKey ??
          order.parentOrderId
        ) === layerKey &&
        order.side === side &&
        order.priceTicks === limitPriceTicks,
    ) ?? null;
  const sameEpisode =
    previous &&
    previous.direction === direction &&
    previous.limitPriceTicks === limitPriceTicks;
  if (
    sameEpisode &&
    ['consensus_lock', 'stable_lock', 'relock'].includes(
      previous.state,
    ) &&
    !activeBoundaryOrder
  ) {
    transitionLimitQueueEpisode(agent, symbol, {
      nowMs: state.nowMs,
      commitSeq: state.commitSeq,
      direction,
      limitPriceTicks,
      state: 'exhaustion',
      transitionReason: 'finite_boundary_budget_consumed',
      remainingReplenishmentUnits: 0,
      activeLayerKey: null,
    });
    return desiredOrders;
  }
  if (
    sameEpisode &&
    previous.state === 'exhaustion'
  ) {
    return desiredOrders;
  }

  const directionalFlowUnits =
    directionSign * publicShock.netSignedUnits;
  const directionalBeliefBps =
    directionSign * orderContext.beliefGapBps;
  const continuationEvidenceBps = clamp(
    Math.round(
      Math.max(0, directionalFlowUnits) * 0.9 +
        publicShock.intensityBps * 0.72 +
        Math.max(0, directionalBeliefBps) * 0.8,
    ),
    0,
    10_000,
  );
  const adverseSelectionCostBps = clamp(
    Math.round(
      agent.adverseSelectionBps +
        orderContext.observedVolatilityBps * 1.8 +
        Math.max(0, -directionalBeliefBps) * 0.7,
    ),
    0,
    10_000,
  );
  if (
    !activeBoundaryOrder &&
    continuationEvidenceBps <=
      adverseSelectionCostBps
  ) {
    transitionLimitQueueEpisode(agent, symbol, {
      nowMs: state.nowMs,
      commitSeq: state.commitSeq,
      direction,
      limitPriceTicks,
      state: 'touched_unlocked',
      transitionReason: 'maker_expected_utility_non_positive',
      finiteBudgetUnits: 0,
      usedBudgetUnits: 0,
      remainingReplenishmentUnits: 0,
      activeLayerKey: null,
    });
    return desiredOrders;
  }

  const sideOrders = desiredOrders.filter(
    (order) => order.side === side,
  );
  const sideBudgetUnits = sideOrders.reduce(
    (sum, order) => sum + order.quantity,
    0,
  );
  if (sideBudgetUnits <= 0) return desiredOrders;
  const allocationBiasBps = Math.round(
    (
      stableAgentUnit(
        state,
        agent,
        `maker-limit-allocation:${symbol}:${direction}`,
      ) -
      0.5
    ) *
      1_600,
  );
  const allocationBps = clamp(
    Math.round(
      6_000 +
        continuationEvidenceBps * 0.28 -
        adverseSelectionCostBps * 0.1 +
        allocationBiasBps,
    ),
    5_500,
    9_500,
  );
  const targetBoundaryUnits = activeBoundaryOrder
    ? activeBoundaryOrder.remainingQty
    : Math.max(
        1,
        Math.floor(
          sideBudgetUnits * allocationBps / 10_000,
        ),
      );
  const nonBoundary = desiredOrders.filter(
    (order) =>
      order.side === side &&
      order.priceTicks !== limitPriceTicks,
  );
  const sameSideNonBoundary = nonBoundary.filter(
    (order) => order.side === side,
  );
  const remainingSideUnits = Math.max(
    0,
    sideBudgetUnits - targetBoundaryUnits,
  );
  const originalNonBoundaryUnits =
    sameSideNonBoundary.reduce(
      (sum, order) => sum + order.quantity,
      0,
    );
  const rebalanced = nonBoundary
    .map((order) => {
      if (order.side !== side) return order;
      const quantity = Math.floor(
        order.quantity *
          remainingSideUnits /
          Math.max(1, originalNonBoundaryUnits),
      );
      return quantity > 0
        ? { ...order, quantity }
        : null;
    })
    .filter(Boolean);
  let boundaryUnits = targetBoundaryUnits;
  if (side === 'buy') {
    const nonBoundaryCost = rebalanced
      .filter((order) => order.side === 'buy')
      .reduce((sum, order) => {
        const gross = order.priceTicks * order.quantity;
        return (
          sum +
          gross +
          Math.max(5, Math.ceil(gross * 5 / 10_000))
        );
      }, 0);
    const availableBoundaryCents = Math.max(
      0,
      buyBudgetCents - nonBoundaryCost,
    );
    boundaryUnits = Math.min(
      boundaryUnits,
      Math.max(
        0,
        Math.floor(
          (availableBoundaryCents - 5) /
            Math.max(1, limitPriceTicks),
        ),
      ),
    );
  }
  if (boundaryUnits <= 0) return desiredOrders;

  const nextState =
    activeBoundaryOrder
      ? 'stable_lock'
      : sameEpisode &&
          ['break', 'failed_recovery'].includes(previous.state)
        ? 'relock'
        : 'consensus_lock';
  const episode = transitionLimitQueueEpisode(
    agent,
    symbol,
    {
      nowMs: state.nowMs,
      commitSeq: state.commitSeq,
      direction,
      limitPriceTicks,
      state: nextState,
      episodeId:
        activeBoundaryOrder
          ? previous?.episodeId
          : undefined,
      finiteBudgetUnits:
        activeBoundaryOrder
          ? previous?.finiteBudgetUnits
          : boundaryUnits,
      usedBudgetUnits:
        activeBoundaryOrder
          ? previous?.usedBudgetUnits
          : boundaryUnits,
      remainingReplenishmentUnits: 0,
      activeLayerKey: layerKey,
      transitionReason:
        activeBoundaryOrder
          ? 'residual_gtc_queue_retained'
          : 'independent_positive_boundary_utility',
    },
  );
  rebalanced.unshift({
    layerKey,
    makerId: agent.id,
    symbol,
    side,
    priceTicks: limitPriceTicks,
    quantity: boundaryUnits,
    tif: 'GTC',
    parentOrderId: episode.episodeId,
    liquidityLayer: {
      layerKey,
      symbol,
      side,
      gridIndex: 0,
      zone: 'LIMIT_QUEUE',
      purpose: 'profit_seeking_boundary_concentration',
      episodeId: episode.episodeId,
      limitQueuePhase: episode.state,
      minimumRestMs:
        MIN_CONSENSUS_LIMIT_REST_MS +
        Math.round(
          stableAgentUnit(
            state,
            agent,
            `maker-limit-rest:${symbol}:${direction}`,
          ) *
            (
              MAX_CONSENSUS_LIMIT_REST_MS -
              MIN_CONSENSUS_LIMIT_REST_MS
            ),
        ),
      boundaryBudgetAllocationBps: allocationBps,
      expectedContinuationBps:
        continuationEvidenceBps,
      adverseSelectionCostBps,
      symbolRegime: orderContext.regime,
      flowPressureBucket: Math.floor(
        Math.max(0, publicShock.intensityBps) / 1_000,
      ),
      flowDirection: Math.sign(
        orderContext.flowNetSignedUnits,
      ),
    },
  });
  return rebalanced;
}

function purposefulMakerCandidates(
  currentOrders,
  desiredOrders,
) {
  const activeByLayer = new Map();
  for (const order of currentOrders) {
    if (activeOrder(order)) {
      activeByLayer.set(
        order.liquidityLayer?.layerKey ??
          order.parentOrderId,
        order,
      );
    }
  }
  const anchorThresholds = {
    CORE: 6,
    INVENTORY: 12,
    VOLATILITY: 24,
    TAIL: 48,
  };
  const inventoryBucketThresholds = {
    CORE: 2,
    INVENTORY: 2,
    VOLATILITY: 3,
    TAIL: 4,
  };
  const retentionWeight = {
    CORE: 1_000,
    INVENTORY: 100_000,
    VOLATILITY: 10_000_000,
    TAIL: 1_000_000_000,
  };
  const candidates = [];
  for (const desired of desiredOrders) {
    const layer = desired.liquidityLayer;
    const active = activeByLayer.get(desired.layerKey);
    if (
      active &&
      (
        layer?.zone === 'LIMIT_QUEUE' ||
        layer?.zone === 'TOUCH'
      ) &&
      active.side === desired.side &&
      active.priceTicks === desired.priceTicks &&
      active.remainingQty > 0 &&
      active.remainingQty <= desired.quantity
    ) {
      candidates.push({
        desired,
        retained: {
          ...desired,
          quantity: active.remainingQty,
        },
        score: 0,
      });
      continue;
    }
    if (!active || !layer || layer.zone === 'TOUCH') {
      candidates.push({ desired, retained: null, score: 0 });
      continue;
    }
    const activeLayer = active.liquidityLayer;
    const threshold = anchorThresholds[layer.zone];
    const activeInventoryBucket = Number.isSafeInteger(
      activeLayer?.inventoryBucket,
    )
      ? activeLayer.inventoryBucket
      : activeLayer?.inventoryDirection;
    const activeMaterialFlowDirection =
      (activeLayer?.flowPressureBucket ?? 0) > 0
        ? activeLayer.flowDirection
        : 0;
    const desiredMaterialFlowDirection =
      (layer.flowPressureBucket ?? 0) > 0
        ? layer.flowDirection
        : 0;
    if (
      !activeLayer ||
      !Number.isSafeInteger(threshold) ||
      activeLayer.symbolRegime !== layer.symbolRegime ||
      activeLayer.flowPressureBucket !==
        layer.flowPressureBucket ||
      activeMaterialFlowDirection !==
        desiredMaterialFlowDirection ||
      !Number.isSafeInteger(activeInventoryBucket) ||
      Math.abs(
        activeInventoryBucket - layer.inventoryBucket,
      ) >
        (inventoryBucketThresholds[layer.zone] ?? 0) ||
      activeLayer.quoteState !== layer.quoteState ||
      !Number.isSafeInteger(activeLayer.anchorTicks) ||
      Math.abs(activeLayer.anchorTicks - layer.anchorTicks) > threshold
    ) {
      candidates.push({ desired, retained: null, score: 0 });
      continue;
    }
    // Deep liquidity has a longer queue horizon than touch quotes.  Preserve
    // its real order id, residual quantity and price until the relevant
    // valuation anchor, inventory regime, funding state or flow state changes.
    // A valuation observation id is a provenance identity generated for every
    // observation.  Rotating that identity without an economic input change
    // must not destroy GTC time priority; anchor/regime/flow/inventory fields
    // carry the quote-dirty semantics instead.
    candidates.push({
      desired,
      retained: {
        ...desired,
        priceTicks: active.priceTicks,
        quantity: active.remainingQty,
      },
      score:
        (retentionWeight[layer.zone] ?? 1) +
        Math.max(0, layer.gridIndex),
    });
  }
  return candidates;
}

export function stabilizePurposefulMakerOrders(
  currentOrders,
  desiredOrders,
  preparedCandidates = null,
) {
  const candidates =
    Array.isArray(preparedCandidates)
      ? preparedCandidates
      : purposefulMakerCandidates(
          currentOrders,
          desiredOrders,
        );

  const selectedByLayer = new Map();
  for (const side of ['buy', 'sell']) {
    const sideCandidates = candidates.filter(
      (candidate) => candidate.desired.side === side,
    );
    if (sideCandidates.length === 0) continue;
    const preferredOrders = sideCandidates.map(
      (candidate) =>
        candidate.retained ?? candidate.desired,
    );
    const preferredIsMonotonic = preferredOrders.every(
      (order, index) =>
        index === 0 ||
        (
          side === 'buy'
            ? preferredOrders[index - 1].priceTicks >
              order.priceTicks
            : preferredOrders[index - 1].priceTicks <
              order.priceTicks
        ),
    );
    if (preferredIsMonotonic) {
      for (const order of preferredOrders) {
        selectedByLayer.set(order.layerKey, order);
      }
      continue;
    }
    const optionPrices = sideCandidates.flatMap((candidate) => [
      candidate.desired.priceTicks,
      ...(candidate.retained
        ? [candidate.retained.priceTicks]
        : []),
    ]);
    const prices = [...new Set(optionPrices)].sort(
      (left, right) => left - right,
    );
    const ascendingRank = new Map(
      prices.map((priceTicks, index) => [priceTicks, index + 1]),
    );
    const rankFor = (priceTicks) => {
      const rank = ascendingRank.get(priceTicks);
      return side === 'sell'
        ? rank
        : prices.length - rank + 1;
    };
    const treeBest = Array(prices.length + 1).fill(null);
    const treeEarliest = Array(prices.length + 1).fill(null);
    const entriesByPrice = new Map();
    const keyWordCount = Math.max(
      1,
      Math.ceil(sideCandidates.length / 16),
    );
    const emptyEventKey = Array(keyWordCount).fill(0);
    const eventKeyWithDigit = (key, index, digit) => {
      if (digit === 0) return key;
      const next = key.slice();
      const wordIndex = Math.floor(index / 16);
      const shift = (15 - (index % 16)) * 2;
      next[wordIndex] =
        (
          next[wordIndex] |
          (digit << shift)
        ) >>> 0;
      return next;
    };
    const eventKeyEarlier = (left, right) => {
      if (!right) return true;
      for (let index = 0; index < left.length; index += 1) {
        const leftWord = left[index] >>> 0;
        const rightWord = right[index] >>> 0;
        if (leftWord !== rightWord) {
          return leftWord < rightWord;
        }
      }
      return false;
    };
    const earlierSlot = (left, right) =>
      !right ||
      eventKeyEarlier(left.slotKey, right.slotKey);
    const betterPredecessor = (left, right) =>
      !right ||
      left.totalScore > right.totalScore ||
      (
        left.totalScore === right.totalScore &&
        eventKeyEarlier(left.slotKey, right.slotKey)
      );
    const updateTree = (tree, rank, entry, better) => {
      for (
        let cursor = rank;
        cursor < tree.length;
        cursor += cursor & -cursor
      ) {
        if (better(entry, tree[cursor])) {
          tree[cursor] = entry;
        }
      }
    };
    const queryTree = (tree, rank, better) => {
      let selected = null;
      for (
        let cursor = rank;
        cursor > 0;
        cursor -= cursor & -cursor
      ) {
        if (tree[cursor] && better(tree[cursor], selected)) {
          selected = tree[cursor];
        }
      }
      return selected;
    };
    const publishEntry = (entry) => {
      const rank = rankFor(entry.priceTicks);
      updateTree(treeBest, rank, entry, betterPredecessor);
      updateTree(treeEarliest, rank, entry, earlierSlot);
    };
    const optionList = (candidate) => [
      {
        order: candidate.desired,
        score: 1,
        retained: false,
      },
      ...(candidate.retained
        ? [{
            order: candidate.retained,
            score: candidate.score + 1,
            retained: true,
          }]
        : []),
    ];
    const selectedCandidateIsBetter = (left, right) =>
      !right ||
      left.totalScore > right.totalScore ||
      (
        left.totalScore === right.totalScore &&
        (
          Number(left.retained) > Number(right.retained) ||
          (
            left.retained === right.retained &&
            eventKeyEarlier(left.eventKey, right.eventKey)
          )
        )
      );

    for (const [index, candidate] of sideCandidates.entries()) {
      const options = optionList(candidate);
      if (index === 0) {
        const pending = new Map();
        for (const [optionIndex, option] of options.entries()) {
          const eventKey = eventKeyWithDigit(
            emptyEventKey,
            index,
            optionIndex,
          );
          const proposal = {
            order: option.order,
            selectedOrder: option.order,
            retained: option.retained,
            totalScore: option.score,
            previous: null,
            eventKey,
          };
          const priceTicks = option.order.priceTicks;
          const aggregate = pending.get(priceTicks) ?? {
            slotKey: eventKey,
            selected: null,
          };
          if (eventKeyEarlier(eventKey, aggregate.slotKey)) {
            aggregate.slotKey = eventKey;
          }
          if (
            selectedCandidateIsBetter(
              proposal,
              aggregate.selected,
            )
          ) {
            aggregate.selected = proposal;
          }
          pending.set(priceTicks, aggregate);
        }
        for (const [priceTicks, aggregate] of pending) {
          const entry = {
            priceTicks,
            retained: aggregate.selected.retained,
            selectedAtIndex: index,
            totalScore: aggregate.selected.totalScore,
            slotKey: aggregate.slotKey,
            node: {
              order: aggregate.selected.order,
              selectedOrder:
                aggregate.selected.selectedOrder,
              previous: null,
            },
          };
          entriesByPrice.set(priceTicks, entry);
          publishEntry(entry);
        }
        continue;
      }

      const pending = new Map();
      for (const [optionIndex, option] of options.entries()) {
        const rank = rankFor(option.order.priceTicks);
        const bestPrevious = queryTree(
          treeBest,
          rank - 1,
          betterPredecessor,
        );
        if (!bestPrevious) continue;
        const earliestPrevious = queryTree(
          treeEarliest,
          rank - 1,
          earlierSlot,
        );
        const actionDigit = optionIndex + 1;
        const selectedEventKey = eventKeyWithDigit(
          bestPrevious.slotKey,
          index,
          actionDigit,
        );
        const earliestEventKey = eventKeyWithDigit(
          earliestPrevious.slotKey,
          index,
          actionDigit,
        );
        const priceTicks = option.order.priceTicks;
        const aggregate = pending.get(priceTicks) ?? {
          slotKey: earliestEventKey,
          selected: null,
        };
        if (
          eventKeyEarlier(
            earliestEventKey,
            aggregate.slotKey,
          )
        ) {
          aggregate.slotKey = earliestEventKey;
        }
        const proposal = {
          order: option.order,
          selectedOrder: option.order,
          retained: option.retained,
          totalScore: bestPrevious.totalScore + option.score,
          previous: bestPrevious.node,
          eventKey: selectedEventKey,
        };
        if (
          selectedCandidateIsBetter(
            proposal,
            aggregate.selected,
          )
        ) {
          aggregate.selected = proposal;
        }
        pending.set(priceTicks, aggregate);
      }

      for (const [priceTicks, aggregate] of pending) {
        const existing = entriesByPrice.get(priceTicks);
        const carry = existing
          ? {
              order: existing.node.order,
              selectedOrder: null,
              retained: false,
              totalScore: existing.totalScore,
              previous: existing.node,
              eventKey: existing.slotKey,
            }
          : null;
        const selectedCandidate =
          selectedCandidateIsBetter(aggregate.selected, carry)
            ? aggregate.selected
            : carry;
        const slotKey =
          existing &&
          eventKeyEarlier(
            existing.slotKey,
            aggregate.slotKey,
          )
            ? existing.slotKey
            : aggregate.slotKey;
        if (existing) {
          existing.slotKey = slotKey;
          if (selectedCandidate !== carry) {
            existing.retained = selectedCandidate.retained;
            existing.selectedAtIndex = index;
            existing.totalScore =
              selectedCandidate.totalScore;
            existing.node = {
              order: selectedCandidate.order,
              selectedOrder:
                selectedCandidate.selectedOrder,
              previous: selectedCandidate.previous,
            };
          }
          publishEntry(existing);
        } else {
          const entry = {
            priceTicks,
            retained: selectedCandidate.retained,
            selectedAtIndex: index,
            totalScore: selectedCandidate.totalScore,
            slotKey,
            node: {
              order: selectedCandidate.order,
              selectedOrder:
                selectedCandidate.selectedOrder,
              previous: selectedCandidate.previous,
            },
          };
          entriesByPrice.set(priceTicks, entry);
          publishEntry(entry);
        }
      }
    }
    const finalIndex = sideCandidates.length - 1;
    let selected = null;
    for (const entry of entriesByPrice.values()) {
      const entryRetained =
        entry.selectedAtIndex === finalIndex &&
        entry.retained;
      const selectedRetained =
        selected?.selectedAtIndex === finalIndex &&
        selected.retained;
      if (
        !selected ||
        entry.totalScore > selected.totalScore ||
        (
          entry.totalScore === selected.totalScore &&
          (
            Number(entryRetained) >
              Number(selectedRetained) ||
            (
              entryRetained === selectedRetained &&
              eventKeyEarlier(
                entry.slotKey,
                selected.slotKey,
              )
            )
          )
        )
      ) {
        selected = entry;
      }
    }
    if (!selected) {
      for (const candidate of sideCandidates) {
        selectedByLayer.set(
          candidate.desired.layerKey,
          candidate.desired,
        );
      }
      continue;
    }
    selected = selected.node;
    while (selected) {
      if (selected.selectedOrder) {
        selectedByLayer.set(
          selected.selectedOrder.layerKey,
          selected.selectedOrder,
        );
      }
      selected = selected.previous;
    }
  }
  return desiredOrders.flatMap((desired) => {
    const selected = selectedByLayer.get(desired.layerKey);
    return selected ? [selected] : [];
  });
}

export function coveragePurposefulMakerOrders(
  currentOrders,
  desiredOrders,
  minimumLevelsBySide,
  preparedCandidates = null,
) {
  const candidates =
    Array.isArray(preparedCandidates)
      ? preparedCandidates
      : purposefulMakerCandidates(
          currentOrders,
          desiredOrders,
        );
  const selectedByLayer = new Map();
  for (const side of ['buy', 'sell']) {
    const sideCandidates = candidates.filter(
      (candidate) => candidate.desired.side === side,
    );
    const minimumLevels = clamp(
      minimumLevelsBySide[side] ?? 0,
      0,
      sideCandidates.length,
    );
    // A zero minimum belongs to the non-deficient side. Its coverage result
    // is deliberately ignored by repairDeficientRealDepth, so avoid solving
    // a second unconstrained selector here.
    if (minimumLevels === 0 || sideCandidates.length === 0) {
      continue;
    }
    const preferredOrders = sideCandidates.map(
      (candidate) =>
        candidate.retained ?? candidate.desired,
    );
    const preferredIsMonotonic = preferredOrders.every(
      (order, index) =>
        index === 0 ||
        (
          side === 'buy'
            ? preferredOrders[index - 1].priceTicks >
              order.priceTicks
            : preferredOrders[index - 1].priceTicks <
              order.priceTicks
        ),
    );
    if (preferredIsMonotonic) {
      for (const order of preferredOrders) {
        selectedByLayer.set(order.layerKey, order);
      }
      continue;
    }
    const optionPrices = sideCandidates.flatMap((candidate) => [
      candidate.desired.priceTicks,
      ...(candidate.retained
        ? [candidate.retained.priceTicks]
        : []),
    ]);
    const prices = [...new Set(optionPrices)].sort(
      (left, right) => left - right,
    );
    const ascendingRank = new Map(
      prices.map((priceTicks, index) => [priceTicks, index + 1]),
    );
    const rankFor = (priceTicks) => {
      const rank = ascendingRank.get(priceTicks);
      return side === 'sell'
        ? rank
        : prices.length - rank + 1;
    };
    const keyWordCount = Math.max(
      1,
      Math.ceil(sideCandidates.length / 16),
    );
    const emptyEventKey = Array(keyWordCount).fill(0);
    const eventKeyWithDigit = (key, index, digit) => {
      if (digit === 0) return key;
      const next = key.slice();
      const wordIndex = Math.floor(index / 16);
      const shift = (15 - (index % 16)) * 2;
      next[wordIndex] =
        (
          next[wordIndex] |
          (digit << shift)
        ) >>> 0;
      return next;
    };
    const eventKeyEarlier = (left, right) => {
      if (!right) return true;
      for (let index = 0; index < left.length; index += 1) {
        const leftWord = left[index] >>> 0;
        const rightWord = right[index] >>> 0;
        if (leftWord !== rightWord) {
          return leftWord < rightWord;
        }
      }
      return false;
    };
    const betterPredecessor = (left, right) =>
      !right ||
      left.totalScore > right.totalScore ||
      (
        left.totalScore === right.totalScore &&
        eventKeyEarlier(left.slotKey, right.slotKey)
      );
    const earlierSlot = (left, right) =>
      !right ||
      eventKeyEarlier(left.slotKey, right.slotKey);
    const selectedCandidateIsBetter = (left, right) =>
      !right ||
      left.totalScore > right.totalScore ||
      (
        left.totalScore === right.totalScore &&
        (
          Number(left.retained) > Number(right.retained) ||
          (
            left.retained === right.retained &&
            eventKeyEarlier(left.eventKey, right.eventKey)
          )
        )
      );
    const entriesByCount = new Map();
    const bestTreesByCount = new Map();
    const earliestTreesByCount = new Map();
    const treeFor = (trees, count) => {
      let tree = trees.get(count);
      if (!tree) {
        tree = Array(prices.length + 1).fill(null);
        trees.set(count, tree);
      }
      return tree;
    };
    const updateTree = (tree, rank, entry, better) => {
      for (
        let cursor = rank;
        cursor < tree.length;
        cursor += cursor & -cursor
      ) {
        if (better(entry, tree[cursor])) {
          tree[cursor] = entry;
        }
      }
    };
    const queryTree = (tree, rank, better) => {
      let selected = null;
      for (
        let cursor = rank;
        cursor > 0;
        cursor -= cursor & -cursor
      ) {
        if (tree[cursor] && better(tree[cursor], selected)) {
          selected = tree[cursor];
        }
      }
      return selected;
    };
    const publishEntry = (entry) => {
      const rank = rankFor(entry.priceTicks);
      updateTree(
        treeFor(bestTreesByCount, entry.selectedCount),
        rank,
        entry,
        betterPredecessor,
      );
      updateTree(
        treeFor(earliestTreesByCount, entry.selectedCount),
        rank,
        entry,
        earlierSlot,
      );
    };
    const optionsFor = (candidate) => [
      {
        order: candidate.desired,
        score: 1,
        retained: false,
      },
      ...(candidate.retained
        ? [{
            order: candidate.retained,
            score: candidate.score + 1,
            retained: true,
          }]
        : []),
    ];

    const firstPending = new Map();
    for (const [optionIndex, option] of
      optionsFor(sideCandidates[0]).entries()) {
      const eventKey = eventKeyWithDigit(
        emptyEventKey,
        0,
        optionIndex,
      );
      const aggregate =
        firstPending.get(option.order.priceTicks) ?? {
          slotKey: eventKey,
          selected: null,
        };
      if (eventKeyEarlier(eventKey, aggregate.slotKey)) {
        aggregate.slotKey = eventKey;
      }
      const proposal = {
        order: option.order,
        retained: option.retained,
        totalScore: option.score,
        eventKey,
      };
      if (
        selectedCandidateIsBetter(
          proposal,
          aggregate.selected,
        )
      ) {
        aggregate.selected = proposal;
      }
      firstPending.set(option.order.priceTicks, aggregate);
    }
    const firstEntries = new Map();
    for (const [priceTicks, aggregate] of firstPending) {
      const entry = {
        priceTicks,
        selectedCount: 1,
        retained: aggregate.selected.retained,
        totalScore: aggregate.selected.totalScore,
        slotKey: aggregate.slotKey,
        node: {
          order: aggregate.selected.order,
          selectedOrder: aggregate.selected.order,
          previous: null,
        },
      };
      firstEntries.set(priceTicks, entry);
      publishEntry(entry);
    }
    entriesByCount.set(1, firstEntries);

    for (
      let index = 1;
      index < sideCandidates.length;
      index += 1
    ) {
      const remaining = sideCandidates.length - index - 1;
      const pendingByCount = new Map();
      for (const option of optionsFor(sideCandidates[index])) {
        const rank = rankFor(option.order.priceTicks);
        for (const selectedCount of entriesByCount.keys()) {
          const nextCount = selectedCount + 1;
          if (nextCount + remaining < minimumLevels) continue;
          const bestPrevious = queryTree(
            bestTreesByCount.get(selectedCount),
            rank - 1,
            betterPredecessor,
          );
          if (!bestPrevious) continue;
          const earliestPrevious = queryTree(
            earliestTreesByCount.get(selectedCount),
            rank - 1,
            earlierSlot,
          );
          const actionDigit =
            option.retained ? 2 : 1;
          const eventKey = eventKeyWithDigit(
            bestPrevious.slotKey,
            index,
            actionDigit,
          );
          const earliestEventKey = eventKeyWithDigit(
            earliestPrevious.slotKey,
            index,
            actionDigit,
          );
          let pendingForCount = pendingByCount.get(nextCount);
          if (!pendingForCount) {
            pendingForCount = new Map();
            pendingByCount.set(nextCount, pendingForCount);
          }
          const aggregate =
            pendingForCount.get(option.order.priceTicks) ?? {
              slotKey: earliestEventKey,
              selected: null,
            };
          if (
            eventKeyEarlier(
              earliestEventKey,
              aggregate.slotKey,
            )
          ) {
            aggregate.slotKey = earliestEventKey;
          }
          const proposal = {
            order: option.order,
            retained: option.retained,
            totalScore:
              bestPrevious.totalScore + option.score,
            previous: bestPrevious.node,
            eventKey,
          };
          if (
            selectedCandidateIsBetter(
              proposal,
              aggregate.selected,
            )
          ) {
            aggregate.selected = proposal;
          }
          pendingForCount.set(
            option.order.priceTicks,
            aggregate,
          );
        }
      }

      for (const [selectedCount, entries] of entriesByCount) {
        if (selectedCount + remaining < minimumLevels) {
          entriesByCount.delete(selectedCount);
          bestTreesByCount.delete(selectedCount);
          earliestTreesByCount.delete(selectedCount);
          continue;
        }
        for (const entry of entries.values()) {
          entry.retained = false;
        }
      }
      for (const [selectedCount, pending] of pendingByCount) {
        let entries = entriesByCount.get(selectedCount);
        if (!entries) {
          entries = new Map();
          entriesByCount.set(selectedCount, entries);
        }
        for (const [priceTicks, aggregate] of pending) {
          const existing = entries.get(priceTicks);
          const carry = existing
            ? {
                order: existing.node.order,
                retained: false,
                totalScore: existing.totalScore,
                previous: existing.node,
                eventKey: existing.slotKey,
              }
            : null;
          const selectedProposal =
            selectedCandidateIsBetter(
              aggregate.selected,
              carry,
            )
              ? aggregate.selected
              : carry;
          const slotKey =
            existing &&
            eventKeyEarlier(
              existing.slotKey,
              aggregate.slotKey,
            )
              ? existing.slotKey
              : aggregate.slotKey;
          if (existing) {
            existing.slotKey = slotKey;
            if (selectedProposal !== carry) {
              existing.retained =
                selectedProposal.retained;
              existing.totalScore =
                selectedProposal.totalScore;
              existing.node = {
                order: selectedProposal.order,
                selectedOrder: selectedProposal.order,
                previous: selectedProposal.previous,
              };
            }
            publishEntry(existing);
          } else {
            const entry = {
              priceTicks,
              selectedCount,
              retained: selectedProposal.retained,
              totalScore: selectedProposal.totalScore,
              slotKey,
              node: {
                order: selectedProposal.order,
                selectedOrder: selectedProposal.order,
                previous: selectedProposal.previous,
              },
            };
            entries.set(priceTicks, entry);
            publishEntry(entry);
          }
        }
      }
    }
    let selected = null;
    for (const [selectedCount, entries] of entriesByCount) {
      if (selectedCount < minimumLevels) continue;
      for (const entry of entries.values()) {
        if (
          !selected ||
          entry.totalScore > selected.totalScore ||
          (
            entry.totalScore === selected.totalScore &&
            (
              Number(entry.retained) >
                Number(selected.retained) ||
              (
                entry.retained === selected.retained &&
                eventKeyEarlier(
                  entry.slotKey,
                  selected.slotKey,
                )
              )
            )
          )
        ) {
          selected = entry;
        }
      }
    }
    if (!selected) {
      for (const candidate of sideCandidates) {
        selectedByLayer.set(
          candidate.desired.layerKey,
          candidate.desired,
        );
      }
      continue;
    }
    selected = selected.node;
    while (selected) {
      if (selected.selectedOrder) {
        selectedByLayer.set(
          selected.selectedOrder.layerKey,
          selected.selectedOrder,
        );
      }
      selected = selected.previous;
    }
  }
  return desiredOrders.flatMap((desired) => {
    const selected = selectedByLayer.get(desired.layerKey);
    return selected ? [selected] : [];
  });
}

function otherRealPrices(
  book,
  replacedOrderIds,
  side,
) {
  return activePriceTicksExcludingOrders(
    book,
    side,
    replacedOrderIds,
  );
}

function projectedRealLevelCount(
  otherPrices,
  projectedOrders,
  side,
) {
  const prices = new Set(otherPrices);
  for (const order of projectedOrders) {
    if (order.side === side) prices.add(order.priceTicks);
  }
  return prices.size;
}

function repairDeficientRealDepth(
  book,
  currentOrders,
  desiredOrders,
  stableOrders,
  preparedCandidates = null,
  minimumOwnedLevelsBySide = {},
) {
  const replacedOrderIds = new Set();
  for (const order of currentOrders) {
    replacedOrderIds.add(order.id);
  }
  const otherPricesBySide = Object.fromEntries(
    ['buy', 'sell'].map((side) => [
      side,
      otherRealPrices(
        book,
        replacedOrderIds,
        side,
      ),
    ]),
  );
  const minimumLevelsBySide = {};
  const deficientSides = new Set();
  for (const side of ['buy', 'sell']) {
    const stableOwnedLevels = new Set(
      stableOrders
        .filter((order) => order.side === side)
        .map((order) => order.priceTicks),
    ).size;
    const desiredOwnedLevels = new Set(
      desiredOrders
        .filter((order) => order.side === side)
        .map((order) => order.priceTicks),
    ).size;
    const desiredProjectedLevels = projectedRealLevelCount(
      otherPricesBySide[side],
      desiredOrders,
      side,
    );
    const aggregateCoverageMinimum =
      desiredProjectedLevels >= 100
        ? Math.max(
            1,
            100 - otherPricesBySide[side].size,
          )
        : 0;
    // Sequential maker decisions must not create a depth-repair deadlock:
    // once both complementary lanes have been partially consumed, neither
    // lane alone can make the aggregate reach one hundred. Preserve each
    // finite owner lane's lawful floor independently, then aggregate coverage
    // recovers as the two real makers take their own cadences.
    const ownedCoverageMinimum = Math.max(
      0,
      Math.floor(minimumOwnedLevelsBySide[side] ?? 0),
    );
    const minimumLevels = Math.min(
      desiredOwnedLevels,
      Math.max(
        aggregateCoverageMinimum,
        ownedCoverageMinimum,
      ),
    );
    minimumLevelsBySide[side] = minimumLevels;
    if (stableOwnedLevels < minimumLevels) {
      deficientSides.add(side);
    }
  }
  if (deficientSides.size === 0) return stableOrders;
  const coverageOrders = coveragePurposefulMakerOrders(
    currentOrders,
    desiredOrders,
    minimumLevelsBySide,
    preparedCandidates,
  );
  const coverageByLayer = new Map(
    coverageOrders.map((order) => [order.layerKey, order]),
  );
  const stableByLayer = new Map(
    stableOrders.map((order) => [order.layerKey, order]),
  );
  return desiredOrders.flatMap((desired) => {
    if (
      desired.liquidityLayer?.zone === 'LIMIT_QUEUE'
    ) {
      return [
        stableByLayer.get(desired.layerKey) ?? desired,
      ];
    }
    const selected = deficientSides.has(desired.side)
      ? coverageByLayer.get(desired.layerKey)
      : stableByLayer.get(desired.layerKey);
    return selected ? [selected] : [];
  });
}

function makerValuationForQuote(
  state,
  agent,
  symbol,
  band,
) {
  if (
    agent.lastFundamentalTick !== 0 ||
    !isPositiveInteger(band?.midpointTicks)
  ) {
    return {
      lowTicks: band.lowTicks,
      midpointTicks: band.midpointTicks,
      highTicks: band.highTicks,
    };
  }
  const previousCloseTicks =
    state.world.market.securities[symbol]
      ?.previousCloseTicks;
  const peerCenters = Object.values(
    state.agentEcology.agents,
  )
    .filter(
      (candidate) =>
        candidate.kind === 'maker' &&
        isPositiveInteger(
          candidate.valuationBands?.[symbol]?.midpointTicks,
        ),
    )
    .map(
      (candidate) =>
        candidate.valuationBands[symbol].midpointTicks,
    );
  if (
    !isPositiveInteger(previousCloseTicks) ||
    peerCenters.length < 2
  ) {
    return {
      lowTicks: band.lowTicks,
      midpointTicks: band.midpointTicks,
      highTicks: band.highTicks,
    };
  }

  // The previous close is the public clearing result of the opening
  // collection, not a hidden price target.  Genesis fundamental models can
  // share a level bias because they reuse the same sparse report.  Recenter
  // that common component once while retaining each maker's relative
  // valuation disagreement, uncertainty width and subsequent inventory/order
  // flow response.  Any later fundamental tick exits this opening bridge.
  const peerMeanTicks =
    peerCenters.reduce((sum, value) => sum + value, 0) /
    peerCenters.length;
  const commonAuctionOffsetTicks =
    openingAuctionConsensusOffsetTicks(state, symbol);
  const rawDisagreementTicks = Math.round(
    (band.midpointTicks - peerMeanTicks) * 0.5,
  );
  const measuredDisagreementDirection = Math.sign(
    band.midpointTicks - peerMeanTicks,
  );
  const disagreementDirection =
    measuredDisagreementDirection ||
    (
      agent.id === 'maker_chengming'
        ? -1
        : 1
    );
  const disagreementTicks =
    disagreementDirection === 0
      ? 0
      : disagreementDirection *
        Math.max(
          Math.abs(rawDisagreementTicks),
          Math.abs(commonAuctionOffsetTicks) + 2,
        );
  const midpointTicks = Math.max(
    1,
    previousCloseTicks +
      commonAuctionOffsetTicks +
      disagreementTicks,
  );
  return {
    lowTicks: Math.max(
      1,
      midpointTicks -
        Math.max(1, band.midpointTicks - band.lowTicks),
    ),
    midpointTicks,
    highTicks:
      midpointTicks +
      Math.max(1, band.highTicks - band.midpointTicks),
  };
}

function makerCommands(
  state,
  agent,
  observedCapacity = null,
) {
  const account = state.accounts[agent.accountId];
  const symbols = Object.keys(state.books);
  const commands = [];
  if (!account) return commands;
  const activeQuantityBySymbol = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      activeBookStats(state.books[symbol]).quantity,
    ]),
  );
  const ownedOrdersBySymbol = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      activeOrdersForOwner(
        state.books[symbol],
        agent.accountId,
      ).filter(
        (order) =>
          typeof order.parentOrderId === 'string' &&
          order.parentOrderId.startsWith(
            `maker:${agent.id}:`,
          ),
      ),
    ]),
  );
  const perSymbolRiskCents = Math.floor(
    agent.riskBudgetCents / Math.max(1, symbols.length),
  );
  const notionalReferenceTicks = Math.max(
    1,
    Math.round(
      symbols.reduce(
        (sum, symbol) =>
          sum +
          (
            state.world.market.securities[symbol]
              ?.previousCloseTicks ??
            publicLastPriceTicks(state, symbol)
          ),
        0,
      ) /
        Math.max(1, symbols.length),
    ),
  );
  const capacityMultiplier = calculateCapacityMultiplier(
    state,
    agent.accountId,
    agent.id,
    observedCapacity,
  );
  const currentEquityCents = equityCentsFromWorld(
    state.world,
    account.cashCents,
    account.holdings,
  );
  for (const [symbolIndex, symbol] of symbols.entries()) {
    const currentOrders = ownedOrdersBySymbol[symbol];
    const security =
      state.world.market.securities[symbol];
    const lastPriceTicks = publicLastPriceTicks(state, symbol);
    const orderContext = symbolOrderContextFor(
      state,
      agent,
      symbol,
    );
    const volatility = Math.max(
      1,
      publicVolatilityTicks(state, symbol),
      orderContext.profileConfigured
        ? Math.round(
            lastPriceTicks *
              orderContext.volatilityBudgetBps /
              320_000,
          )
        : 1,
    );
    const publicShock = recentPublicShock(
      state,
      agent,
      symbol,
    );
    let reusableCashCents = 0;
    let reusableSellUnits = 0;
    for (const order of currentOrders) {
      if (order.side === 'buy') {
        reusableCashCents += order.reservedCashCents;
      } else {
        reusableSellUnits += order.reservedUnits;
      }
    }
    const buyBudgetCents = Math.max(
      0,
      Math.min(
        perSymbolRiskCents,
        freeCash(account) + reusableCashCents,
      ),
    );
    const sellCapacityUnits =
      freeUnits(account, symbol) + reusableSellUnits;
    const depth = aggregateBookMetrics(
      state.books[symbol],
      10,
      { excludeOwnerId: agent.accountId },
    );
    const bidDepthUnits = depth.bids.totalQuantity;
    const askDepthUnits = depth.asks.totalQuantity;
    const bestBidTicks = depth.bids.bestPriceTicks;
    const bestBidQuantity = depth.bids.bestQuantity;
    const bestAskTicks = depth.asks.bestPriceTicks;
    const bestAskQuantity = depth.asks.bestQuantity;
    const totalDepthUnits = bidDepthUnits + askDepthUnits;
    const imbalanceBps =
      totalDepthUnits === 0
        ? 0
        : Math.round(
            (bidDepthUnits - askDepthUnits) *
              10_000 /
              totalDepthUnits,
          );
    const totalActiveUnits =
      activeQuantityBySymbol[symbol];
    const makerActiveUnits = currentOrders.reduce(
      (sum, order) => sum + order.remainingQty,
      0,
    );
    const crowdingBps =
      totalActiveUnits === 0
        ? 0
        : Math.round(
            makerActiveUnits * 10_000 / totalActiveUnits,
          );
    const band = agent.valuationBands[symbol];
    const quoteMicroNoiseTicks =
      (
        hash32(
          [
            state.world.world.seed,
            agent.id,
            symbol,
            Math.floor(state.nowMs / 12_000),
            'finite-private-quote-noise',
          ].join(':'),
        ) %
        3
      ) -
      1;
    let currentOrderFingerprint = 2166136261;
    for (const order of currentOrders) {
      currentOrderFingerprint ^=
        order.priceTicks ^
        order.remainingQty ^
        Number(order.reservedCashCents ?? 0) ^
        Number(order.reservedUnits ?? 0);
      currentOrderFingerprint = Math.imul(
        currentOrderFingerprint,
        16777619,
      ) >>> 0;
    }
    const quoteInputSignature = [
      lastPriceTicks,
      bestBidTicks ?? 0,
      bestBidQuantity,
      bestAskTicks ?? 0,
      bestAskQuantity,
      bidDepthUnits,
      askDepthUnits,
      account.holdings[symbol] ?? 0,
      freeCash(account),
      freeUnits(account, symbol),
      account.fundingStressBps ?? 0,
      makerQuoteState(account),
      band.ruleVersion,
      band.midpointTicks,
      band.confidenceBps,
      agent.lastFundamentalTick,
      Math.round(capacityMultiplier * 10_000),
      publicShock.intensityBps,
      publicShock.netSignedUnits,
      volatility,
      orderContext.version,
      orderContext.regime,
      orderContext.beliefGapBps,
      orderContext.beliefDispersionBps,
      orderContext.catalystSignalBps,
      orderContext.arrivalBudgetUnits,
      orderContext.depthBudgetUnits,
      quoteMicroNoiseTicks,
      currentOrderFingerprint,
    ].join(':');
    agent.makerQuoteInputCache ??= {};
    const priorQuoteInput =
      agent.makerQuoteInputCache[symbol];
    if (
      priorQuoteInput?.signature ===
        quoteInputSignature &&
      state.nowMs - priorQuoteInput.computedAtMs <
        MAKER_DEEP_REQUOTE_HORIZON_MS
    ) {
      continue;
    }
    agent.makerQuoteInputCache[symbol] = {
      signature: quoteInputSignature,
      computedAtMs: state.nowMs,
    };
    const rawMakerValuation = makerValuationForQuote(
      state,
      agent,
      symbol,
      band,
    );
    // The maker valuation band already contains its fundamental estimate.
    // Re-applying the complete belief gap here double-counts that common
    // component and defeats the opening-auction consensus bridge. Symbol
    // context still changes real maker spread, size, depth and regime, while
    // participant reservation prices use the explicit belief components.
    const makerValuation = rawMakerValuation;
    // A last trade is public evidence, but a few ordinary child fills must not
    // become a self-confirming quote ratchet. Calm makers blend it with the
    // public transaction mean; a genuinely intense sweep rapidly increases
    // the tape weight. This changes quotes, never the authoritative price.
    const tapeWeightBps = clamp(
      6_500 +
        Math.round(publicShock.intensityBps * 0.3),
      6_500,
      9_500,
    );
    const tapeObservedMidTicks = Math.max(
      1,
      Math.round(
        (
          lastPriceTicks * tapeWeightBps +
          publishedMeanPrice(state, symbol) *
            (10_000 - tapeWeightBps)
        ) /
          10_000,
      ) + quoteMicroNoiseTicks,
    );
    const valuationAnchorBps =
      orderContext.regime === 'stress' &&
      orderContext.makerRegime === 'mean_reversion'
        ? clamp(
            orderContext.stabilizerBps + 5_200,
            0,
            10_000,
          )
        : 0;
    const observedMidTicks = Math.max(
      1,
      Math.round(
        (
          tapeObservedMidTicks *
            (10_000 - valuationAnchorBps) +
          rawMakerValuation.midpointTicks *
            valuationAnchorBps
        ) /
          10_000,
      ),
    );
    const valuationObservation =
      createMakerValuationObservation({
        world: state.world,
        symbol,
        valuation: {
          ruleVersion: band.ruleVersion,
          sourceFinancialFactId:
            band.sourceFinancialFactId,
          publishedAtMs: band.publishedAtMs,
          observedLowTicks: makerValuation.lowTicks,
          observedMidpointTicks: makerValuation.midpointTicks,
          observedHighTicks: makerValuation.highTicks,
          confidenceBps: band.confidenceBps,
        },
      });
    const inventoryTargetUnits = Math.max(
      1,
      agent.targetHoldings[symbol] ?? 1,
    );
    const configuredInventoryCapacity =
      orderContext.profileConfigured
        ? Math.max(
            1,
            // Inventory capacity is a slow risk limit. Shrinking it together
            // with event/stress displayed depth creates a pro-cyclical cliff:
            // after one sweep the maker can sit outside its newly shrunken
            // capacity and withdraw the entire depleted side. The regime
            // multiplier belongs to current quote quantity, not to the
            // balance-sheet limit.
            Math.round(orderContext.baseDepthUnits / 2),
          )
        : security.liquidityProfile
            ?.makerInventoryCapacityUnits;
    const inventoryCapacityUnits = clamp(
      Number.isSafeInteger(configuredInventoryCapacity) &&
        configuredInventoryCapacity > 0
        ? configuredInventoryCapacity
        : Math.round(
            Math.max(
              agent.baseOrderUnits * 30,
              (security.outstandingUnits ?? 0) *
                60 /
                10_000,
            ),
          ),
      Math.max(1_200, agent.baseOrderUnits * 30),
      2_000_000,
    );
    // A hundred-price GTC ladder survives many actor cadences.  Sizing that
    // entire resting book from only one cadence's expected arrivals made the
    // configured deep-book budget collapse to a few hundred shares on quiet
    // securities.  Keep a finite number of base ladder risk windows instead:
    // event/stress books still contract, while a calm book can execute an
    // ordinary institutional clip without turning the remaining ninety
    // levels into one-share placeholders.
    const persistentBookRiskWindows =
      (
        {
          calm: 5,
          ordinary: 5,
          event: 3,
          stress: 2,
        }[orderContext.regime] ?? 3
      );
    const persistentBookBudgetUnits =
      agent.baseOrderUnits *
      Math.max(1, agent.maxLevels) *
      persistentBookRiskWindows;
    const displayedDepthUnits =
      orderContext.profileConfigured
        ? Math.max(
            1,
            Math.min(
              Math.round(orderContext.depthBudgetUnits / 2),
              Math.max(
                agent.maxLevels,
                persistentBookBudgetUnits,
                orderContext.arrivalBudgetUnits *
                  (
                    {
                      calm: 24,
                      ordinary: 20,
                      event: 12,
                      stress: 8,
                    }[orderContext.regime] ?? 16
                  ),
              ),
            ),
          )
        : inventoryCapacityUnits;
    const effectiveBaseOrderUnits = Math.max(
      agent.baseOrderUnits,
      Math.ceil(
        displayedDepthUnits /
          Math.max(1, agent.maxLevels),
      ),
    );
    const symbolLiquidityMultiplier =
      (
        orderContext.profileConfigured
          ? 0.94 +
            stableAgentUnit(
              state,
              agent,
              `ladder-liquidity:${symbol}`,
            ) *
              0.12
          : 0.82 +
            symbolIndex * 0.08 +
            stableAgentUnit(
              state,
              agent,
              `ladder-liquidity:${symbol}`,
            ) *
              0.12
      ) *
      clamp(
        Math.sqrt(
          notionalReferenceTicks /
            Math.max(1, security.previousCloseTicks),
        ),
        0.92,
        1.08,
      );
    const makerRegimePreset =
      REGIME_PRESETS[orderContext.makerRegime] ??
      REGIME_PRESETS.normal;
    const makerRegime =
      orderContext.profileConfigured
        ? {
            ...makerRegimePreset,
            // Real books keep at least the existing hundred-price coverage.
            // Regime depth changes finite quantity, spacing and spread rather
            // than replacing real levels with synthetic placeholders.
            quoteSizeMultiplierBps: Math.max(
              7_500,
              makerRegimePreset.quoteSizeMultiplierBps,
            ),
          }
        : 'normal';
    const quotePlan = computeMakerQuotePlan({
      id: agent.id,
      latencyMs: agent.latencyMs,
      riskAversionBps: agent.riskAversionBps,
      adverseSelectionBps: agent.adverseSelectionBps,
      valuationWeightBps: agent.valuationWeightBps,
      baseHalfSpreadTicks: agent.baseHalfSpreadTicks,
      baseOrderUnits: Math.max(
        1,
        Math.round(
          effectiveBaseOrderUnits *
            symbolLiquidityMultiplier,
        ),
      ),
      maxLevels: agent.maxLevels,
      minimumSpacingTicks: agent.minimumSpacingTicks,
      // Stress changes finite size and reservation price, not the maker's
      // absolute price lane.  Keeping the complementary lanes prevents two
      // independent makers from collapsing onto the same subset of prices
      // after one side has been swept.
      priceLaneModulus: agent.priceLaneModulus,
      priceLaneRemainder: agent.priceLaneRemainder,
      quoteState: makerQuoteState(account),
      inventoryTargetUnits,
      inventoryCapacityUnits,
      holdings: account.holdings[symbol] ?? 0,
      cashCents: buyBudgetCents,
      creditLimitCents: 0,
      creditUsedCents: 0,
      capitalMultiplier:
        currentEquityCents /
        Math.max(1, agent.initialEquityCents),
      marginalSizeMultiplierBps: Math.round(
        capacityMultiplier * 10_000,
      ),
    }, {
      nowMs: state.nowMs,
      symbol,
      observedMidTicks,
      valuationObservation,
      valuationAgeMs: Math.max(
        0,
        state.nowMs - valuationObservation.publishedMs,
      ),
      bestBidTicks,
      bestAskTicks,
      bidDepthUnits,
      askDepthUnits,
      imbalanceBps,
      volatilityTicks: volatility,
      jumpRiskBps: clamp(
        Math.max(
          volatility * 450,
          orderContext.profileConfigured
            ? orderContext.volatilityBudgetBps * 8
            : 0,
        ),
        0,
        10_000,
      ),
      toxicityBps: clamp(
        Math.max(
          Math.abs(
            publicFlowSignal(state, agent, symbol),
          ) *
            (
              agent.riskAversionBps <= 600
                ? 0.45
                : 1.8
            ),
          publicShock.intensityBps *
            (
              agent.riskAversionBps <= 600
                ? 0.18
              : 0.78
            ),
          orderContext.profileConfigured
            ? Math.abs(orderContext.catalystSignalBps) * 4 +
              orderContext.beliefDispersionBps * 2
            : 0,
        ),
        0,
        10_000,
      ),
      crowdingBps,
      regime: makerRegime,
      activeMakerCount: 2,
      calmHalfSpreadCapTicks:
        orderContext.regime === 'calm'
          ? security.liquidityProfile
              ?.normalHalfSpreadTicks
          : undefined,
    });
    agent.lastMakerQuoteDiagnostics ??= {};
    agent.lastMakerQuoteDiagnostics[symbol] = {
      virtualMs: state.nowMs,
      reservationPriceTicks: quotePlan.reservationPriceTicks,
      halfSpreadTicks: quotePlan.halfSpreadTicks,
      valuationCenterTicks:
        valuationObservation.estimate.centerTicks,
      sourceFactIds: valuationObservation.sourceFactIds,
      orderContext: cloneJson(orderContext),
      ...quotePlan.diagnostics,
    };
    const dailyBand = securityDailyBand(
      state.world.market.securities[symbol],
    );
    const oneSidedTake = (() => {
      const roundTripCostBps = 12;
      if (
        !isPositiveInteger(bestBidTicks) &&
        bestAskTicks === dailyBand.limitDownTicks
      ) {
        const expectedGrossEdgeBps = Math.round(
          (
            quotePlan.reservationPriceTicks -
            bestAskTicks
          ) *
            10_000 /
            bestAskTicks,
        );
        const quantity = Math.min(
          bestAskQuantity,
          quotePlan.totalBidUnits,
          orderContext.arrivalBudgetUnits,
          Math.max(1, agent.baseOrderUnits * 8),
          Math.max(
            0,
            Math.floor(
              (buyBudgetCents - 5) /
                bestAskTicks,
            ),
          ),
        );
        if (
          expectedGrossEdgeBps >
            roundTripCostBps &&
          quantity > 0
        ) {
          return {
            side: 'buy',
            priceTicks: bestAskTicks,
            quantity,
            expectedGrossEdgeBps,
            expectedCostBps: roundTripCostBps,
          };
        }
      }
      if (
        !isPositiveInteger(bestAskTicks) &&
        bestBidTicks === dailyBand.limitUpTicks
      ) {
        const expectedGrossEdgeBps = Math.round(
          (
            bestBidTicks -
            quotePlan.reservationPriceTicks
          ) *
            10_000 /
            bestBidTicks,
        );
        const quantity = Math.min(
          bestBidQuantity,
          quotePlan.totalAskUnits,
          orderContext.arrivalBudgetUnits,
          Math.max(1, agent.baseOrderUnits * 8),
          sellCapacityUnits,
        );
        if (
          expectedGrossEdgeBps >
            roundTripCostBps &&
          quantity > 0
        ) {
          return {
            side: 'sell',
            priceTicks: bestBidTicks,
            quantity,
            expectedGrossEdgeBps,
            expectedCostBps: roundTripCostBps,
          };
        }
      }
      return null;
    })();
    const oneSidedTakeGrossCents =
      oneSidedTake?.side === 'buy'
        ? oneSidedTake.priceTicks *
          oneSidedTake.quantity
        : 0;
    const oneSidedTakeFeeCents =
      oneSidedTakeGrossCents > 0
        ? Math.max(
            5,
            Math.ceil(
              oneSidedTakeGrossCents * 5 /
                10_000,
            ),
          )
        : 0;
    const passiveBuyBudgetCents = Math.max(
      0,
      buyBudgetCents -
        oneSidedTakeGrossCents -
        oneSidedTakeFeeCents,
    );
    const passiveSellCapacityUnits = Math.max(
      0,
      sellCapacityUnits -
        (
          oneSidedTake?.side === 'sell'
            ? oneSidedTake.quantity
            : 0
        ),
    );
    const unconcentratedDesiredOrders = makerDesiredOrders({
        agent,
        symbol,
        quotePlan,
        orderContext,
        buyBudgetCents: passiveBuyBudgetCents,
        sellCapacityUnits: passiveSellCapacityUnits,
        buySizeMultiplier:
          (
            0.86 +
            stableAgentUnit(
              state,
              agent,
              `ladder-side:${symbol}:buy`,
            ) *
              0.12
          ) *
          (
            publicShock.intensityBps < 1_000
              ? 1
              : agent.riskAversionBps <= 600
                ? publicShock.netSignedUnits > 0
                  ? 0.65
                  : 3
                : publicShock.netSignedUnits > 0
                  ? 0.92
                  : 0.45
          ),
        sellSizeMultiplier:
          (
            0.86 +
            stableAgentUnit(
              state,
              agent,
              `ladder-side:${symbol}:sell`,
            ) *
              0.12
          ) *
          (
            publicShock.intensityBps < 1_000
              ? 1
              : agent.riskAversionBps <= 600
                ? publicShock.netSignedUnits > 0
                  ? 3
                  : 0.65
                : publicShock.netSignedUnits > 0
                  ? 0.45
                  : 0.92
          ),
      });
    // A private valuation can put a maker's first passive layer through the
    // currently visible opposite quote.  Dropping only that layer destroys
    // both the finite clip allocation and the intended lane coverage.  Shift
    // the complete passive side just far enough to remain non-marketable;
    // relative spacing, quantities, ownership and FIFO intent stay intact.
    const bestExternalBidTicks =
      bestBidTicks;
    const bestExternalAskTicks =
      bestAskTicks;
    const bestDesiredBidTicks = Math.max(
      ...unconcentratedDesiredOrders
        .filter(
          (order) =>
            order.side === 'buy' &&
            order.liquidityLayer?.zone !== 'LIMIT_QUEUE',
        )
        .map((order) => order.priceTicks),
      0,
    );
    const bestDesiredAskTicks = Math.min(
      ...unconcentratedDesiredOrders
        .filter(
          (order) =>
            order.side === 'sell' &&
            order.liquidityLayer?.zone !== 'LIMIT_QUEUE',
        )
        .map((order) => order.priceTicks),
      Number.MAX_SAFE_INTEGER,
    );
    const ordinaryTouchCompetitionTicks = Math.max(
      1,
      security.liquidityProfile?.normalHalfSpreadTicks ?? 1,
    );
    const rawBidPassiveShiftTicks =
      bestDesiredBidTicks > 0 &&
      isPositiveInteger(bestExternalAskTicks)
        ? (
            clamp(
              bestDesiredBidTicks,
              isPositiveInteger(bestBidTicks)
                ? Math.max(
                    1,
                    bestBidTicks -
                      ordinaryTouchCompetitionTicks,
                  )
                : 1,
              bestExternalAskTicks - 1,
            ) - bestDesiredBidTicks
          )
        : 0;
    const rawAskPassiveShiftTicks =
      bestDesiredAskTicks !== Number.MAX_SAFE_INTEGER &&
      isPositiveInteger(bestExternalBidTicks)
        ? (
            clamp(
              bestDesiredAskTicks,
              bestExternalBidTicks + 1,
              isPositiveInteger(bestAskTicks)
                ? bestAskTicks +
                  ordinaryTouchCompetitionTicks
                : Number.MAX_SAFE_INTEGER,
            ) - bestDesiredAskTicks
          )
        : 0;
    const passiveLaneModulus = Math.max(
      1,
      agent.priceLaneModulus ?? 1,
    );
    const lanePreservingShift = (
      rawShiftTicks,
      outwardSign,
    ) => {
      const magnitude = Math.abs(rawShiftTicks);
      if (magnitude === 0) return 0;
      const outward =
        Math.sign(rawShiftTicks) === outwardSign;
      const steps = outward
        ? Math.ceil(magnitude / passiveLaneModulus)
        : Math.floor(magnitude / passiveLaneModulus);
      return Math.sign(rawShiftTicks) *
        steps *
        passiveLaneModulus;
    };
    const bidPassiveShiftTicks = lanePreservingShift(
      rawBidPassiveShiftTicks,
      -1,
    );
    const askPassiveShiftTicks = lanePreservingShift(
      rawAskPassiveShiftTicks,
      1,
    );
    const passiveDesiredOrders =
      unconcentratedDesiredOrders.map((order) => {
        if (order.liquidityLayer?.zone === 'LIMIT_QUEUE') {
          return order;
        }
        if (order.side === 'buy' && bidPassiveShiftTicks !== 0) {
          return {
            ...order,
            priceTicks:
              order.priceTicks + bidPassiveShiftTicks,
          };
        }
        if (order.side === 'sell' && askPassiveShiftTicks !== 0) {
          return {
            ...order,
            priceTicks:
              order.priceTicks + askPassiveShiftTicks,
          };
        }
        return order;
      });
    const lawfulPassiveDesiredOrders =
      reallocateMakerLawfulLaneCoverage({
        orders: passiveDesiredOrders,
        agent,
        dailyBand,
        bestExternalBidTicks,
        bestExternalAskTicks,
        buyBudgetCents: passiveBuyBudgetCents,
        sellCapacityUnits: passiveSellCapacityUnits,
      });
    const rawDesiredOrders =
      concentrateMakerBoundaryQueue({
        state,
        agent,
        symbol,
        security,
        orderContext,
        publicShock,
        currentOrders,
        desiredOrders: lawfulPassiveDesiredOrders,
        buyBudgetCents: passiveBuyBudgetCents,
      }).filter(
      (order) =>
        order.priceTicks >= dailyBand.limitDownTicks &&
        order.priceTicks <= dailyBand.limitUpTicks &&
        (
          order.side !== 'buy' ||
          order.liquidityLayer?.zone === 'LIMIT_QUEUE' ||
          !isPositiveInteger(bestAskTicks) ||
          order.priceTicks < bestAskTicks
        ) &&
        (
          order.side !== 'sell' ||
          order.liquidityLayer?.zone === 'LIMIT_QUEUE' ||
          !isPositiveInteger(bestBidTicks) ||
          order.priceTicks > bestBidTicks
        ),
    );
    const purposefulCandidates =
      purposefulMakerCandidates(
        currentOrders,
        rawDesiredOrders,
      );
    const stableDesiredOrders =
      stabilizePurposefulMakerOrders(
        currentOrders,
        rawDesiredOrders,
        purposefulCandidates,
      );
    const desiredOrders = repairDeficientRealDepth(
      state.books[symbol],
      currentOrders,
      rawDesiredOrders,
      stableDesiredOrders,
      purposefulCandidates,
      {
        buy: Math.ceil(
          100 /
            Math.max(1, agent.priceLaneModulus ?? 1),
        ),
        sell: Math.ceil(
          100 /
            Math.max(1, agent.priceLaneModulus ?? 1),
        ),
      },
    );
    const diff = diffMakerLadder(currentOrders, desiredOrders);
    for (const orderId of diff.cancelOrderIds) {
      commands.push({
        type: 'cancel_order',
        actorId: agent.accountId,
        brokerId: agent.brokerId,
        orderId,
      });
    }
    if (oneSidedTake) {
      commands.push({
        type: 'submit_order',
        actorId: agent.accountId,
        brokerId: agent.brokerId,
        symbol,
        side: oneSidedTake.side,
        priceTicks: oneSidedTake.priceTicks,
        quantity: oneSidedTake.quantity,
        tif: 'IOC',
        parentOrderId:
          `maker-one-sided-take:${agent.id}:${symbol}:` +
          `${agent.decisionSequence}`,
        ecologyIntentKind: 'one_sided_liquidity_take',
        expectedUtility: {
          model:
            'finite_inventory_one_sided_liquidity_take',
          expectedGrossEdgeBps:
            oneSidedTake.expectedGrossEdgeBps,
          expectedCostBps:
            oneSidedTake.expectedCostBps,
          expectedNetEdgeBps:
            oneSidedTake.expectedGrossEdgeBps -
            oneSidedTake.expectedCostBps,
          expectedNetPnlCents: Math.max(
            1,
            Math.floor(
              oneSidedTake.priceTicks *
                oneSidedTake.quantity *
                (
                  oneSidedTake
                    .expectedGrossEdgeBps -
                  oneSidedTake.expectedCostBps
                ) /
                10_000,
            ),
          ),
          shouldTrade: true,
        },
      });
    }
    for (const desired of diff.submitOrders) {
      commands.push({
        type: 'submit_order',
        actorId: agent.accountId,
        brokerId: agent.brokerId,
        symbol,
        side: desired.side,
        priceTicks: desired.priceTicks,
        quantity: desired.quantity,
        tif: 'GTC',
        parentOrderId: desired.parentOrderId,
        liquidityLayer: desired.liquidityLayer,
      });
    }
  }
  return commands;
}

function publishedMomentum(state, symbol) {
  const trades =
    publicRealtimeTape(state).bySymbol.get(symbol) ?? [];
  let firstPriceTicks = null;
  let lastPriceTicks = null;
  let priceCount = 0;
  for (
    let index = Math.max(0, trades.length - 20);
    index < trades.length;
    index += 1
  ) {
    const priceTicks = trades[index].priceTicks;
    if (!isPositiveInteger(priceTicks)) continue;
    firstPriceTicks ??= priceTicks;
    lastPriceTicks = priceTicks;
    priceCount += 1;
  }
  return priceCount < 2
    ? 0
    : lastPriceTicks - firstPriceTicks;
}

function publishedMeanPrice(state, symbol) {
  const trades =
    publicRealtimeTape(state).bySymbol.get(symbol) ?? [];
  let totalPriceTicks = 0;
  let priceCount = 0;
  for (
    let index = Math.max(0, trades.length - 32);
    index < trades.length;
    index += 1
  ) {
    const priceTicks = trades[index].priceTicks;
    if (!isPositiveInteger(priceTicks)) continue;
    totalPriceTicks += priceTicks;
    priceCount += 1;
  }
  return priceCount === 0
    ? publicLastPriceTicks(state, symbol)
    : Math.round(totalPriceTicks / priceCount);
}

function eligibleBehaviorPublicTrades(state, agent) {
  const byTradeId = new Map();
  for (const record of state.agentEcology.publicFlow ?? []) {
    const trade = resolveSettledPublicTradeChain(
      state,
      record.tradeId,
    )?.trade;
    if (trade) {
      byTradeId.set(trade.id, trade);
    } else {
      if (typeof record.factId === 'string') {
        byTradeId.set(record.tradeId, {
          id: record.tradeId,
          factId: record.factId,
          virtualMs: record.virtualMs,
          symbol: record.symbol,
          side: record.side,
          priceTicks: record.priceTicks,
          quantity: record.quantity,
          commitSeq: record.commitSeq,
        });
      }
    }
  }
  for (const trade of [
    ...(agent.activePublicSignal?.observedTrades ?? []),
    ...(agent.publicFlowMemory?.observedTrades ?? []),
  ]) {
    if (
      !byTradeId.has(trade.id) &&
      observedTradeFactIsValid(state, trade)
    ) {
      byTradeId.set(trade.id, trade);
    }
  }
  return [...byTradeId.values()]
    .filter(
      (trade) =>
        trade.virtualMs + agent.informationDelayMs <=
          state.nowMs &&
        trade.commitSeq >
          (
            agent.behaviorState?.memory
              ?.publicCursorCommitSeq ?? 0
          ),
    )
    .sort(
      (left, right) =>
        left.commitSeq - right.commitSeq ||
        left.id.localeCompare(right.id),
    );
}

function behaviorValueTicks(
  state,
  agent,
  symbol,
) {
  const rawValueTicks =
    agent.valuationBands?.[symbol]
      ?.actionableValueTicks ??
    agent.delayedFundamentals?.[symbol] ??
    publicLastPriceTicks(state, symbol);
  const catalystTicks = publicCatalystSignalTicks(
    state,
    agent,
    symbol,
  );
  if (
    agent.lastFundamentalTick !== 0 ||
    !isPositiveInteger(rawValueTicks)
  ) {
    return isPositiveInteger(rawValueTicks)
      ? Math.max(1, rawValueTicks + catalystTicks)
      : rawValueTicks;
  }
  const previousCloseTicks =
    state.world.market.securities[symbol]
      ?.previousCloseTicks;
  const peerValues = Object.values(
    state.agentEcology.agents,
  )
    .filter((candidate) => candidate.kind === agent.kind)
    .map(
      (candidate) =>
        candidate.valuationBands?.[symbol]
          ?.actionableValueTicks ??
        candidate.delayedFundamentals?.[symbol],
    )
    .filter(isPositiveInteger);
  if (
    !isPositiveInteger(previousCloseTicks) ||
    peerValues.length < 2
  ) {
    return Math.max(1, rawValueTicks + catalystTicks);
  }
  const peerMeanTicks =
    peerValues.reduce((sum, value) => sum + value, 0) /
    peerValues.length;
  const relativeDisagreementTicks = Math.round(
    (rawValueTicks - peerMeanTicks) * 0.3,
  );
  const personalResidualTicks =
    (hash32(
      `${state.world.world.seed}:${agent.id}:${symbol}:opening-belief-residual`,
    ) % 7) -
    3;
  return Math.max(
    1,
    previousCloseTicks +
      openingAuctionConsensusOffsetTicks(state, symbol) +
      relativeDisagreementTicks +
      personalResidualTicks +
      catalystTicks,
  );
}

function observeAgentBehavior(state, agent) {
  if (!agent.behaviorState) return null;
  const publicTrades = eligibleBehaviorPublicTrades(
    state,
    agent,
  );
  const symbols = Object.fromEntries(
    Object.keys(state.books).map((symbol) => {
      const orderContext = symbolOrderContextFor(
        state,
        agent,
        symbol,
      );
      const symbolTrades = publicTrades.filter(
        (trade) => trade.symbol === symbol,
      );
      const rawNetSignedQuantity = symbolTrades.reduce(
        (sum, trade) =>
          sum +
          (
            trade.side === 'buy'
              ? trade.quantity
              : -trade.quantity
          ),
        0,
      );
      const flowContext = recentPublicShock(
        state,
        agent,
        symbol,
      );
      const flowEvidenceBps = clamp(
        Math.round(
          (flowContext.intensityBps - 1_200) *
            10_000 /
            3_800,
        ),
        1_000,
        10_000,
      );
      const traits =
        agent.behaviorState.persona.traits;
      const flowInterpretationBps =
        agent.kind === 'retail'
          ? clamp(
              (
                traits.socialLearningBps -
                traits.contrarianBps
              ) * 2,
              -10_000,
              10_000,
            )
          : 10_000;
      return [
        symbol,
        {
          priceTicks: publicLastPriceTicks(state, symbol),
          valueTicks: behaviorValueTicks(
            state,
            agent,
            symbol,
          ) +
            (
              orderContext.profileConfigured
                ? Math.round(
                    publicLastPriceTicks(state, symbol) *
                      orderContext.privateInterpretationBps /
                      10_000,
                  )
                : 0
            ),
          momentumTicks: publishedMomentum(state, symbol),
          netSignedQuantity: Math.round(
            rawNetSignedQuantity *
              flowEvidenceBps /
              10_000 *
              flowInterpretationBps /
              10_000,
          ),
        },
      ];
    }),
  );
  const capacity = evaluateCapacity(
    state,
    agent.accountId,
    agent.id,
  );
  observeBehaviorState(agent.behaviorState, {
    nowMs: state.nowMs,
    symbols,
    publicTrades,
    capacityPressureBps: Math.max(
      0,
      Math.round(
        capacity.footprintBps * 0.55 +
          capacity.crowdingBps * 0.45,
      ),
    ),
    fundingStressBps:
      state.accounts[agent.accountId]
        ?.fundingStressBps ?? 0,
  });
  const publicCatalystAttention = Object.keys(state.books)
    .map((symbol) => agent.lastSymbolOrderContext[symbol])
    .filter(
      (context) =>
        context.visibleFactIds.length > 0 &&
        context.rawCatalystTicks !== 0,
    )
    .sort(
      (left, right) =>
        Math.abs(right.catalystSignalBps) -
          Math.abs(left.catalystSignalBps) ||
        left.symbol.localeCompare(right.symbol),
    )[0];
  if (publicCatalystAttention) {
    const attentionSlots = Math.max(
      1,
      agent.behaviorState.persona.traits.attentionSlots,
    );
    agent.behaviorState.cognition.attentionSymbols = [
      publicCatalystAttention.symbol,
      ...agent.behaviorState.cognition.attentionSymbols.filter(
        (symbol) =>
          symbol !== publicCatalystAttention.symbol,
      ),
    ].slice(0, attentionSlots);
  }
  return capacity;
}

function publicFlowObservationDelayMs(agent) {
  if (agent.kind === 'maker') {
    return Math.max(0, agent.informationDelayMs ?? 0);
  }
  if (agent.strategy === 'published_frame_trend') {
    return Math.min(agent.informationDelayMs ?? 0, 480);
  }
  if (agent.strategy === 'delayed_fundamental_value') {
    return Math.min(agent.informationDelayMs ?? 0, 1_350);
  }
  if (agent.strategy === 'industry_mean_reversion') {
    return Math.min(agent.informationDelayMs ?? 0, 1_850);
  }
  return Math.max(0, agent.informationDelayMs ?? 0);
}

/**
 * Converts each listing's float, expected turnover, and finite maker inventory
 * into one comparable public-flow shock scale. This keeps an ordinary block in
 * a mega-cap routine while allowing the same quantity to be exceptional in a
 * small-cap book.
 */
export function marketFlowShockScale(state, symbol) {
  const security = state.world.market.securities[symbol];
  const profile = security?.liquidityProfile ?? {};
  const floatUnits = Math.max(
    1,
    Math.floor(Number(security?.floatUnits) || 0),
  );
  const expectedDailyTurnoverBps = clamp(
    Math.floor(Number(profile.expectedDailyTurnoverBps) || 0),
    1,
    10_000,
  );
  const expectedDailyUnits = Math.max(
    1,
    Math.round(
      floatUnits * expectedDailyTurnoverBps / 10_000,
    ),
  );
  const makerInventoryCapacityUnits = Math.max(
    1,
    Math.floor(
      Number(profile.makerInventoryCapacityUnits) || 0,
    ),
  );
  const expectedWindowUnits = Math.max(
    1,
    Math.round(
      expectedDailyUnits * 3_000 / 86_400_000,
    ),
  );
  const advShockUnits = Math.max(
    1_000,
    Math.round(expectedDailyUnits * 50 / 10_000),
  );
  const inventoryShockUnits = Math.max(
    1_000,
    Math.round(makerInventoryCapacityUnits * 2_500 / 10_000),
  );
  return {
    floatUnits,
    expectedDailyTurnoverBps,
    expectedDailyUnits,
    expectedWindowUnits,
    makerInventoryCapacityUnits,
    shockCapacityUnits: Math.max(
      1_000,
      Math.min(advShockUnits, inventoryShockUnits),
    ),
  };
}

function recentPublicShock(state, agent, symbol) {
  const observationDelayMs =
    publicFlowObservationDelayMs(agent);
  const tape = publicRealtimeTape(state);
  const trades = tape.bySymbol.get(symbol) ?? [];
  let cache = publicShockCache.get(state);
  if (
    !cache ||
    cache.commitSeq !== state.commitSeq ||
    cache.nowMs !== state.nowMs ||
    cache.tradesLength !== tape.tradesLength ||
    cache.lastTradeId !== tape.lastTradeId
  ) {
    cache = {
      commitSeq: state.commitSeq,
      nowMs: state.nowMs,
      tradesLength: tape.tradesLength,
      lastTradeId: tape.lastTradeId,
      byObservation: new Map(),
    };
    publicShockCache.set(state, cache);
  }
  const cacheKey = `${observationDelayMs}:${symbol}`;
  const cached = cache.byObservation.get(cacheKey);
  if (cached) return cached;
  const visibleMs = state.nowMs - observationDelayMs;
  const cutoffMs = visibleMs - 3_000;
  let buyUnits = 0;
  let sellUnits = 0;
  let firstPriceTicks = null;
  let lastPriceTicks = null;
  let minimumPriceTicks = null;
  let maximumPriceTicks = null;
  let tradeCount = 0;
  for (const trade of trades) {
    if (
      trade.virtualMs < cutoffMs ||
      trade.virtualMs > visibleMs
    ) {
      continue;
    }
    if (trade.side === 'buy') {
      buyUnits += trade.quantity;
    } else {
      sellUnits += trade.quantity;
    }
    firstPriceTicks ??= trade.priceTicks;
    lastPriceTicks = trade.priceTicks;
    minimumPriceTicks =
      minimumPriceTicks === null
        ? trade.priceTicks
        : Math.min(minimumPriceTicks, trade.priceTicks);
    maximumPriceTicks =
      maximumPriceTicks === null
        ? trade.priceTicks
        : Math.max(maximumPriceTicks, trade.priceTicks);
    tradeCount += 1;
  }
  const totalUnits = buyUnits + sellUnits;
  const netSignedUnits = buyUnits - sellUnits;
  const rangeTicks =
    minimumPriceTicks === null || maximumPriceTicks === null
      ? 0
      : maximumPriceTicks - minimumPriceTicks;
  const currentTicks = publicLastPriceTicks(state, symbol);
  const rangeBps = Math.round(
    rangeTicks * 10_000 / Math.max(1, currentTicks),
  );
  const shockScale = marketFlowShockScale(state, symbol);
  const intensityBps = clamp(
    Math.round(
      Math.max(
        0,
        totalUnits - shockScale.expectedWindowUnits,
      ) *
        10_000 /
        shockScale.shockCapacityUnits +
        rangeBps * 12,
    ),
    0,
    10_000,
  );
  const result = {
    observationDelayMs,
    visibleMs,
    tradeCount,
    buyUnits,
    sellUnits,
    totalUnits,
    netSignedUnits,
    firstPriceTicks,
    lastPriceTicks,
    rangeTicks,
    rangeBps,
    intensityBps,
    expectedWindowUnits: shockScale.expectedWindowUnits,
    shockCapacityUnits: shockScale.shockCapacityUnits,
  };
  cache.byObservation.set(cacheKey, result);
  return result;
}

const SYMBOL_REGIME_RANK = Object.freeze({
  calm: 0,
  ordinary: 1,
  event: 2,
  stress: 3,
});

const MAKER_REGIME_BY_SYMBOL_REGIME = Object.freeze({
  calm: 'normal',
  ordinary: 'mean_reversion',
  event: 'volatility_burst',
  stress: 'liquidity_drought',
});

function boundedProfileInteger(
  profile,
  keys,
  fallback,
  minimum,
  maximum,
) {
  for (const key of keys) {
    const value = Number(profile?.[key]);
    if (Number.isFinite(value)) {
      return clamp(Math.round(value), minimum, maximum);
    }
  }
  return clamp(Math.round(fallback), minimum, maximum);
}

function volatilityBudgetForRegime(profile, regime) {
  const defaults = {
    calm: 45,
    ordinary: 110,
    event: 260,
    stress: 480,
  };
  return boundedProfileInteger(
    profile,
    [
      `${regime}Bps`,
      `${regime}RangeBps`,
      `${regime}VolatilityBps`,
    ],
    profile?.regimes?.[regime] ?? defaults[regime],
    1,
    5_000,
  );
}

function depthMultiplierForRegime(profile, regime) {
  const defaults = {
    calm: 11_000,
    ordinary: 10_000,
    event: 6_500,
    stress: 4_000,
  };
  return boundedProfileInteger(
    profile,
    [
      `${regime}MultiplierBps`,
      `${regime}DepthMultiplierBps`,
    ],
    profile?.regimes?.[regime] ?? defaults[regime],
    1_000,
    20_000,
  );
}

function arrivalProbabilityForRegime(profile, regime) {
  const defaults = {
    calm: 4_500,
    ordinary: 7_000,
    event: 9_500,
    stress: 8_000,
  };
  return boundedProfileInteger(
    profile,
    [
      `${regime}ArrivalProbabilityBps`,
      `${regime}ProbabilityBps`,
    ],
    defaults[regime],
    500,
    10_000,
  );
}

function visibleCompanyFacts(
  state,
  agent,
  symbol,
  observedMs = state.nowMs,
) {
  const informationDelayMs = Math.max(
    0,
    Number.isSafeInteger(agent?.informationDelayMs)
      ? agent.informationDelayMs
      : 0,
  );
  return eligibleFundamentalFacts(state.world, symbol)
    .filter((fact) => {
      const publishedAtMs = Number.isSafeInteger(
        fact.publishedAtMs,
      )
        ? fact.publishedAtMs
        : fact.tick * 86_400_000;
      return (
        fact.tick > 0 &&
        publishedAtMs + informationDelayMs <= observedMs
      );
    })
    .slice(-4);
}

function visibleCompanyFactIds(state, agent, symbol) {
  return visibleCompanyFacts(
    state,
    agent,
    symbol,
  ).map((fact) => fact.id);
}

/**
 * Purely derives one agent's per-symbol order context from public market
 * evidence, delayed public company facts, finite listing profiles and the
 * agent's own belief state. It never mutates the book, account or last price.
 */
export function deriveSymbolOrderContext(
  state,
  agent,
  symbol,
  previousContext = null,
) {
  const security = state?.world?.market?.securities?.[symbol];
  if (!security || !agent?.id || !state?.books?.[symbol]) {
    throw new Error('A live agent and listed symbol are required.');
  }
  const volatilityProfile = security.volatilityProfile ?? {};
  const depthProfile = security.depthProfile ?? {};
  const catalystProfile = security.catalystProfile ?? {};
  const profileConfigured = Boolean(
    isPositiveInteger(security.advUnits) ||
      security.volatilityProfile ||
      security.depthProfile ||
      security.catalystProfile,
  );
  const currentTicks = publicLastPriceTicks(state, symbol);
  const publicShock = recentPublicShock(state, agent, symbol);
  const visibleFacts = visibleCompanyFacts(
    state,
    agent,
    symbol,
  );
  const visibleFactIds = visibleFacts.map(
    (fact) => fact.id,
  );
  const latestVisibleFactPublishedAtMs =
    visibleFacts.length === 0
      ? null
      : Math.max(
          ...visibleFacts.map((fact) =>
            Number.isSafeInteger(fact.publishedAtMs)
              ? fact.publishedAtMs
              : Number.isSafeInteger(fact.virtualMs)
                ? fact.virtualMs
                : fact.tick * 86_400_000,
          ),
        );
  const catalystAgeMs =
    latestVisibleFactPublishedAtMs === null
      ? null
      : Math.max(
          0,
          state.nowMs -
            latestVisibleFactPublishedAtMs,
        );
  const rawCatalystTicks = publicCatalystSignalTicks(
    state,
    agent,
    symbol,
  );
  const catalystSensitivityBps = boundedProfileInteger(
    catalystProfile,
    ['sensitivityBps', 'signalSensitivityBps'],
    10_000,
    0,
    30_000,
  );
  const rawCatalystBps = Math.round(
    rawCatalystTicks * 10_000 / Math.max(1, currentTicks),
  );
  const catalystSignalBps = profileConfigured
    ? Math.round(
        rawCatalystBps * catalystSensitivityBps / 10_000,
      )
    : rawCatalystBps;
  const observedVolatilityBps = Math.round(
    publicVolatilityTicks(state, symbol) *
      10_000 /
      Math.max(1, currentTicks),
  );
  const calmBudgetBps = volatilityBudgetForRegime(
    volatilityProfile,
    'calm',
  );
  const eventBudgetBps = volatilityBudgetForRegime(
    volatilityProfile,
    'event',
  );
  const stressBudgetBps = volatilityBudgetForRegime(
    volatilityProfile,
    'stress',
  );
  const eventThresholdBps = boundedProfileInteger(
    catalystProfile,
    ['eventThresholdBps'],
    Math.max(40, Math.round(eventBudgetBps * 0.35)),
    1,
    5_000,
  );
  const stressThresholdBps = boundedProfileInteger(
    catalystProfile,
    ['stressThresholdBps'],
    Math.max(
      eventThresholdBps + 1,
      Math.round(stressBudgetBps * 0.65),
    ),
    eventThresholdBps + 1,
    10_000,
  );
  const eventFlowThresholdBps = boundedProfileInteger(
    catalystProfile,
    ['eventFlowThresholdBps'],
    1_800,
    500,
    9_000,
  );
  const stressFlowThresholdBps = boundedProfileInteger(
    catalystProfile,
    ['stressFlowThresholdBps'],
    6_500,
    eventFlowThresholdBps + 1,
    10_000,
  );

  let candidateRegime = 'ordinary';
  if (!profileConfigured) {
    candidateRegime = 'ordinary';
  } else if (
    publicShock.intensityBps >= stressFlowThresholdBps ||
    observedVolatilityBps >= stressBudgetBps ||
    Math.abs(catalystSignalBps) >= stressThresholdBps
  ) {
    candidateRegime = 'stress';
  } else if (
    publicShock.intensityBps >= eventFlowThresholdBps ||
    observedVolatilityBps >= eventBudgetBps ||
    Math.abs(catalystSignalBps) >= eventThresholdBps
  ) {
    candidateRegime = 'event';
  } else if (
    publicShock.intensityBps <= 350 &&
    observedVolatilityBps <= calmBudgetBps &&
    Math.abs(catalystSignalBps) <
      Math.max(1, Math.floor(eventThresholdBps / 2))
  ) {
    candidateRegime = 'calm';
  }

  const priorRegime =
    previousContext?.version ===
      SYMBOL_ORDER_CONTEXT_VERSION &&
    SYMBOL_REGIME_RANK[previousContext.regime] !== undefined
      ? previousContext.regime
      : null;
  const priorSinceMs = isNonNegativeInteger(
    previousContext?.regimeSinceMs,
  )
    ? previousContext.regimeSinceMs
    : state.nowMs;
  const holdMs = boundedProfileInteger(
    volatilityProfile,
    ['regimeHoldMs', 'hysteresisMs'],
    12_000,
    3_000,
    120_000,
  );
  const deescalating =
    priorRegime &&
    SYMBOL_REGIME_RANK[candidateRegime] <
      SYMBOL_REGIME_RANK[priorRegime];
  const regime =
    deescalating && state.nowMs - priorSinceMs < holdMs
      ? priorRegime
      : candidateRegime;
  const regimeSinceMs =
    priorRegime === regime ? priorSinceMs : state.nowMs;

  const baseDispersionBps = boundedProfileInteger(
    volatilityProfile,
    ['beliefDispersionBps', 'dispersionBps'],
    65,
    1,
    3_000,
  );
  const agentDispersionScaleBps = Math.round(
    8_500 +
      stableAgentUnit(
        state,
        agent,
        `order-context-dispersion:${symbol}`,
      ) *
        3_000,
  );
  const beliefDispersionBps = profileConfigured
    ? Math.max(
        1,
        Math.round(
          baseDispersionBps *
            agentDispersionScaleBps /
            10_000,
        ),
      )
    : 0;
  const valuationCenterTicks =
    agent.valuationBands?.[symbol]?.actionableValueTicks ??
    agent.valuationBands?.[symbol]?.midpointTicks ??
    agent.delayedFundamentals?.[symbol] ??
    currentTicks;
  const valuationGapBps = isPositiveInteger(
    valuationCenterTicks,
  )
    ? clamp(
        Math.round(
          (valuationCenterTicks - currentTicks) *
            10_000 /
            Math.max(1, currentTicks),
        ),
        -2_500,
        2_500,
      )
    : 0;
  const privateInterpretationBps = profileConfigured
    ? Math.round(
        (
          stableAgentUnit(
            state,
            agent,
            `order-context-belief:${symbol}`,
          ) *
            2 -
          1
        ) *
          beliefDispersionBps,
      )
    : 0;
  const beliefGapBps = profileConfigured
    ? clamp(
        valuationGapBps +
          catalystSignalBps +
          privateInterpretationBps,
        -3_000,
        3_000,
      )
    : 0;
  const volatilityBudgetBps = volatilityBudgetForRegime(
    volatilityProfile,
    regime,
  );
  const stabilizerBps = boundedProfileInteger(
    volatilityProfile,
    ['stabilizerBps'],
    4_800,
    0,
    10_000,
  );
  const depthMultiplierBps = depthMultiplierForRegime(
    depthProfile,
    regime,
  );
  const fallbackFlowScale = marketFlowShockScale(state, symbol);
  const advUnits = isPositiveInteger(security.advUnits)
    ? security.advUnits
    : fallbackFlowScale.expectedDailyUnits;
  const baseDepthUnits = boundedProfileInteger(
    depthProfile,
    [
      'baseDepthUnits',
      'targetDepthUnits',
      'normalDepthUnits',
    ],
    security.liquidityProfile
      ?.makerInventoryCapacityUnits ??
      fallbackFlowScale.makerInventoryCapacityUnits,
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const depthBudgetUnits = Math.max(
    1,
    Math.round(baseDepthUnits * depthMultiplierBps / 10_000),
  );
  const arrivalMultiplierBps = {
    calm: 7_000,
    ordinary: 10_000,
    event: 17_000,
    stress: 13_000,
  }[regime];
  const decisionWindowMs = clamp(
    Math.round(agent.cadenceMs ?? 3_000),
    700,
    30_000,
  );
  const arrivalBudgetUnits = Math.max(
    1,
    Math.round(
      advUnits *
        decisionWindowMs /
        86_400_000 *
        arrivalMultiplierBps /
        10_000,
    ),
  );
  const arrivalProbabilityBps = profileConfigured
    ? arrivalProbabilityForRegime(
        catalystProfile,
        regime,
      )
    : 10_000;
  const mechanismSources = [];
  if (isPositiveInteger(security.advUnits)) {
    mechanismSources.push('security.advUnits');
  }
  if (security.volatilityProfile) {
    mechanismSources.push('security.volatilityProfile');
  }
  if (security.depthProfile) {
    mechanismSources.push('security.depthProfile');
  }
  if (security.catalystProfile) {
    mechanismSources.push('security.catalystProfile');
  }
  if (visibleFactIds.length > 0 && rawCatalystTicks !== 0) {
    mechanismSources.push('public.company_fact');
  }
  if (publicShock.tradeCount > 0) {
    mechanismSources.push('public.order_flow');
  }

  return {
    version: SYMBOL_ORDER_CONTEXT_VERSION,
    symbol,
    virtualMs: state.nowMs,
    profileConfigured,
    regime,
    regimeSinceMs,
    regimeHoldMs: holdMs,
    makerRegime:
      profileConfigured
        ? (
            regime === 'stress' &&
            (agent.riskAversionBps ?? 10_000) <= 600
              ? 'mean_reversion'
              : MAKER_REGIME_BY_SYMBOL_REGIME[regime]
          )
        : 'normal',
    valuationGapBps,
    privateInterpretationBps,
    beliefGapBps,
    beliefDispersionBps,
    catalystSignalBps,
    rawCatalystTicks,
    visibleFactIds,
    latestVisibleFactPublishedAtMs,
    catalystAgeMs,
    observedVolatilityBps,
    flowIntensityBps: publicShock.intensityBps,
    flowNetSignedUnits: publicShock.netSignedUnits,
    eventThresholdBps,
    stressThresholdBps,
    volatilityBudgetBps,
    stabilizerBps,
    advUnits,
    arrivalBudgetUnits,
    arrivalProbabilityBps,
    baseDepthUnits,
    depthMultiplierBps,
    depthBudgetUnits,
    mechanismSources,
  };
}

function symbolOrderContextFor(state, agent, symbol) {
  const previous =
    agent.lastSymbolOrderContext?.[symbol] ??
    agent.lastMakerQuoteDiagnostics?.[symbol]
      ?.orderContext ??
    null;
  if (
    previous?.version === SYMBOL_ORDER_CONTEXT_VERSION &&
    previous.symbol === symbol &&
    previous.virtualMs === state.nowMs
  ) {
    return previous;
  }
  const context = deriveSymbolOrderContext(
    state,
    agent,
    symbol,
    previous,
  );
  agent.lastSymbolOrderContext ??= {};
  agent.lastSymbolOrderContext[symbol] = context;
  return context;
}

function publicFlowSignal(state, agent, symbol) {
  const pending =
    agent.activePublicSignal ??
    agent.publicFlowMemory;
  let pendingSignal = 0;
  if (
    pending &&
    pending.lastTradeMs + 9_000 >= state.nowMs
  ) {
    pendingSignal = Number(
      pending.netSignedQuantity?.[symbol] ?? 0,
    );
  }
  const shock = recentPublicShock(
    state,
    agent,
    symbol,
  );
  const shockParticipationBps = clamp(
    Math.round(
      (shock.intensityBps - 400) *
        10_000 /
        1_600,
    ),
    0,
    10_000,
  );
  const shockSignal = Math.round(
    shock.netSignedUnits *
      shockParticipationBps /
      10_000,
  );
  return clamp(
    Math.abs(shockSignal) >= Math.abs(pendingSignal)
      ? shockSignal
      : pendingSignal,
    -5_000,
    5_000,
  );
}

export function institutionValuationRiskSignal(
  state,
  agent,
  symbol,
  currentPriceTicks,
) {
  const band = agent.valuationBands?.[symbol];
  const actionableValueTicks =
    agent.lastFundamentalTick === 0
      ? behaviorValueTicks(state, agent, symbol)
      : band?.publicMidpointTicks ??
        band?.valuationModel?.centralTicks ??
        band?.midpointTicks;
  if (
    !isPositiveInteger(actionableValueTicks) ||
    !isPositiveInteger(currentPriceTicks)
  ) {
    return 0;
  }
  const gapTicks = actionableValueTicks - currentPriceTicks;
  const mode = band?.valuationModel?.mode;
  if (mode === 'risk_anchor_not_primary_signal') {
    return clamp(gapTicks * 0.04, -4, 4);
  }
  if (
    mode ===
    'research_committee_intrinsic_value_distribution'
  ) {
    return clamp(gapTicks * 0.06, -6, 6);
  }
  return gapTicks;
}

function institutionSignal(state, agent, symbol, symbolIndex) {
  const current = publicLastPriceTicks(state, symbol);
  const seedBias =
    deterministicUnit(state, agent, `signal:${symbol}`) - 0.5;
  const flow = publicFlowSignal(state, agent, symbol);
  const openingSignal = agent.openingSignalConsumed
    ? 0
    : agent.openingSignals[symbol] ?? 0;
  const valuationRisk = institutionValuationRiskSignal(
    state,
    agent,
    symbol,
    current,
  );
  const adaptiveSignal = behaviorDecisionSignal(
    agent.behaviorState,
    symbol,
  );
  const catalystSignal = publicCatalystSignalTicks(
    state,
    agent,
    symbol,
  );
  if (agent.strategy === 'delayed_fundamental_value') {
    const band = agent.valuationBands[symbol];
    const fair = Math.round(
      (
        agent.lastFundamentalTick === 0
          ? behaviorValueTicks(state, agent, symbol)
          : band.actionableValueTicks ??
            band.valuationModel?.actionableValueTicks ??
            band.midpointTicks
      ) *
        (1 + seedBias * 0.001),
    );
    const noTradeTicks = Math.max(
      2,
      Math.round(
        Math.max(0, band.highTicks - band.lowTicks) * 0.03,
      ),
    );
    const rawGap = fair - current;
    const valuationSignal =
      Math.abs(rawGap) <= noTradeTicks
        ? 0
        : Math.sign(rawGap) *
          (Math.abs(rawGap) - noTradeTicks) *
          0.08;
    return (
      valuationSignal -
      Math.sign(flow) * Math.min(4, Math.abs(flow) / 120) +
      openingSignal +
      adaptiveSignal +
      catalystSignal * 0.2
    );
  }
  if (agent.strategy === 'published_frame_trend') {
    const momentum = publishedMomentum(state, symbol);
    return (
      momentum * 2 +
      valuationRisk +
      seedBias * 1.5 +
      flow / 55 +
      openingSignal +
      adaptiveSignal +
      catalystSignal
    );
  }
  const mean = publishedMeanPrice(state, symbol);
  return (
    (mean - current) * 1.8 +
    valuationRisk +
    seedBias * (symbolIndex % 2 === 0 ? 1.2 : -1.2) -
    flow / 90 +
    openingSignal +
    adaptiveSignal +
    catalystSignal * 1.1
  );
}

export function calculateCapacityMultiplier(
  state,
  accountId,
  agentId = null,
  observedCapacity = null,
) {
  const capacity =
    observedCapacity ??
    evaluateCapacity(
      state,
      accountId,
      agentId,
    );
  const profitBps =
    capacity.activeTradePnlCents <= 0
      ? 0
      : (
          capacity.activeTradePnlCents *
          10_000 /
          Math.max(1, capacity.initialEquityCents)
        );
  const growth = 1 + clamp(profitBps / 25, 0, 2);
  const footprintPenalty =
    1 / (1 + capacity.footprintBps / 15_000);
  const crowdingPenalty =
    1 / (1 + capacity.crowdingBps / 5000);
  const drawdownPenalty =
    1 / (1 + capacity.drawdownBps / 1500);
  const fundingPenalty =
    1 / (1 + capacity.fundingStressBps / 2000);
  return Number(
    clamp(
      growth *
        footprintPenalty *
        crowdingPenalty *
        drawdownPenalty *
        fundingPenalty,
      0.1,
      3,
    ).toFixed(6),
  );
}

export function selectOrdinaryParticipationSymbol(
  state,
  agent,
  symbols,
) {
  const behavior = agent.behaviorState;
  const attention = behavior.cognition.attentionSymbols;
  const attentionSlots = Math.max(1, attention.length);
  const recentActions = behavior.actionTrace.slice(-6);
  const recentFills = behavior.memory.episodes
    .filter(
      (episode) =>
        episode.kind === 'own_fill' &&
        state.nowMs - episode.virtualMs <= 12_000,
    )
    .slice(-6);
  return symbols
    .map((symbol) => {
      const belief =
        behavior.cognition.beliefs[symbol];
      const depth = aggregateBookMetrics(
        state.books[symbol],
        1,
        { excludeOwnerId: agent.accountId },
      );
      const currentTicks =
        publicLastPriceTicks(state, symbol);
      const meanTicks =
        publishedMeanPrice(state, symbol);
      const attentionIndex = attention.indexOf(symbol);
      const attentionScore =
        attentionIndex < 0
          ? 0
          : (
              attentionSlots - attentionIndex
            ) * 4_200;
      const beliefScore =
        Math.abs(belief?.convictionBps ?? 0) * 0.35 +
        Math.abs(belief?.momentumBps ?? 0) * 0.12 +
        Math.abs(belief?.flowBps ?? 0) * 0.08;
      const publicScore =
        Math.min(
          5_000,
          Math.abs(currentTicks - meanTicks) * 35,
        ) +
        Math.min(
          1_500,
          Math.abs(
            publicFlowSignal(state, agent, symbol),
          ) * 1.5,
        ) +
        Math.min(
          600,
          Math.max(
            0,
            (depth.asks.bestPriceTicks ?? currentTicks) -
            (depth.bids.bestPriceTicks ?? currentTicks),
          ) * 60,
        );
      const lastPricePoint =
        state.world.market.securities[symbol].priceHistory.at(-1);
      const lastPublicTradeMs =
        lastPricePoint?.source === 'realtime_order_book' &&
        isNonNegativeInteger(lastPricePoint.virtualMs)
          ? lastPricePoint.virtualMs
          : 0;
      const tapeStalenessScore = Math.min(
        18_000,
        Math.floor(
          Math.max(
            0,
            state.nowMs - lastPublicTradeMs - 12_000,
          ) / 2,
        ),
      );
      const actionFatigue = recentActions
        .filter((action) => action.symbol === symbol)
        .reduce((sum, action) => {
          const ageMs = Math.max(
            0,
            state.nowMs - action.virtualMs,
          );
          return (
            sum +
            Math.max(
              0,
              Math.round(
                1_500 * (1 - ageMs / 12_000),
              ),
            )
          );
        }, 0);
      const fillFatigue = recentFills
        .filter((episode) => episode.symbol === symbol)
        .reduce(
          (sum, episode) =>
            sum +
            Math.min(
              1_200,
              300 +
                Math.round(
                  Math.sqrt(episode.quantity) * 80,
                ),
            ),
          0,
        );
      const privateExploration =
        hash32(
          [
            state.world.world.seed,
            agent.id,
            symbol,
            'ordinary-attention',
            Math.floor(state.nowMs / 3_000),
            behavior.memory.revision,
            behavior.memory.publicCursorCommitSeq,
          ].join(':'),
        ) % 1_000;
      return {
        symbol,
        score:
          attentionScore +
          beliefScore +
          publicScore +
          tapeStalenessScore +
          privateExploration -
          actionFatigue -
          fillFatigue,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.symbol.localeCompare(right.symbol),
    )[0]?.symbol ?? symbols[0];
}

function profitCertificateForOrder(
  state,
  agent,
  mandate,
  {
    symbol,
    side,
    priceTicks,
    expectedExitTicks,
    quantity,
    tif,
  },
) {
  const depth = aggregateBookMetrics(
    state.books[symbol],
    1,
    { excludeOwnerId: agent.accountId },
  );
  const availableAtBestUnits =
    tif === 'GTC'
      ? side === 'buy'
        ? depth.bids.bestQuantity
        : depth.asks.bestQuantity
      : side === 'buy'
        ? depth.asks.bestQuantity
        : depth.bids.bestQuantity;
  const behavior = agent.behaviorState;
  const traits = behavior.persona.traits;
  const existingPositionUnits =
    mandate.positionUnitsBySymbol[symbol] ?? 0;
  const targetPositionUnits =
    agent.targetHoldings[symbol] ?? existingPositionUnits;
  const direction = side === 'buy' ? 1 : -1;
  const deviationBefore =
    existingPositionUnits - targetPositionUnits;
  const deviationAfter =
    deviationBefore + direction * quantity;
  const reducedDeviationUnits = Math.max(
    0,
    Math.abs(deviationBefore) -
      Math.abs(deviationAfter),
  );
  const bestBidTicks =
    depth.bids.bestPriceTicks ??
    Math.max(1, priceTicks - 1);
  const bestAskTicks =
    depth.asks.bestPriceTicks ??
    priceTicks + 1;
  const volatilityTicks =
    publicVolatilityTicks(state, symbol);
  const mandateAvoidedLossCents =
    reducedDeviationUnits *
    (
      Math.max(1, bestAskTicks - bestBidTicks) * 2 +
      Math.max(1, volatilityTicks) +
      Math.min(
        24,
        Math.ceil(Math.abs(deviationBefore) / 2),
      )
    );
  const expectedUtility = evaluateProfitSeekingOrder({
    side,
    quantity,
    priceTicks,
    expectedExitTicks: Math.max(
      1,
      Math.round(expectedExitTicks),
    ),
    bestBidTicks,
    bestAskTicks,
    availableAtBestUnits,
    volatilityTicks,
    existingPositionUnits,
    capitalCents: Math.max(
      1,
      behavior.account.cashEnvelopeCents +
        behavior.account.settledNetCashCents,
    ),
    riskAversionBps: clamp(
      agent.riskAversionBps ??
        Math.round(
          (
            10_000 -
            traits.riskToleranceBps +
            traits.lossAversionBps
          ) /
            2,
        ),
      0,
      10_000,
    ),
    drawdownBps:
      behavior.performance.drawdownBps,
    tif,
    strategicBenefitCents:
      mandateAvoidedLossCents,
  });
  return {
    expectedUtility,
    profitObjective: {
      actorId: agent.id,
      capitalOwnerId:
        behavior.account.capitalOwnerId,
      executionAccountId:
        behavior.account.executionAccountId,
      accountingBasis:
        behavior.performance.accountingBasis,
      strategy: agent.strategy,
      realizedNetPnlCents:
        behavior.performance.realizedNetPnlCents,
      markedPnlCents:
        behavior.performance.markedPnlCents,
      drawdownBps:
        behavior.performance.drawdownBps,
    },
  };
}

function privateReservationShockTicks(
  state,
  agent,
  symbol,
  orderContext = null,
) {
  const seed = state.world.world.seed;
  const horizonMs =
    12_000 +
    (
      hash32(
        `${seed}:${agent.id}:${symbol}:reservation-horizon`,
      ) %
      12_001
    );
  const epoch = Math.floor(state.nowMs / horizonMs);
  const phase = (state.nowMs % horizonMs) / horizonMs;
  const smoothPhase =
    phase * phase * (3 - 2 * phase);
  const signedAt = (index) =>
    hash32(
      `${seed}:${agent.id}:${symbol}:reservation:${index}`,
    ) /
      4294967296 *
      2 -
    1;
  const activeOrderContext =
    orderContext ??
    symbolOrderContextFor(state, agent, symbol);
  const baseAmplitudeTicks =
    activeOrderContext.profileConfigured
      ? Math.max(
          1,
          Math.round(
            publicLastPriceTicks(state, symbol) *
              activeOrderContext.beliefDispersionBps /
              10_000,
          ),
        )
      : 7 +
        (
          hash32(
            `${seed}:${agent.id}:${symbol}:reservation-amplitude`,
          ) %
          8
        );
  const riskScale =
    0.75 +
    agent.behaviorState.persona.traits
      .riskToleranceBps /
      20_000;
  return Math.round(
    (
      signedAt(epoch) * (1 - smoothPhase) +
      signedAt(epoch + 1) * smoothPhase
    ) *
      baseAmplitudeTicks *
      riskScale,
  );
}

function contextArrivalAllowed(
  state,
  agent,
  orderContext,
  salt,
) {
  if (!orderContext.profileConfigured) return true;
  return (
    deterministicUnit(
      state,
      agent,
      `order-context-arrival:${orderContext.symbol}:${salt}`,
    ) *
      10_000 <
    orderContext.arrivalProbabilityBps
  );
}

function contextualParticipantQuantity(
  orderContext,
  legacyQuantity,
) {
  const quantity = Math.max(1, Math.round(legacyQuantity));
  if (!orderContext.profileConfigured) return quantity;
  return clamp(
    Math.round(
      Math.sqrt(
        quantity *
          Math.max(1, orderContext.arrivalBudgetUnits),
      ),
    ),
    1,
    Math.max(1, orderContext.arrivalBudgetUnits * 2),
  );
}

function tagCommandOrderContext(command, orderContext) {
  return {
    ...command,
    orderContextVersion: orderContext.version,
    orderContextRegime: orderContext.regime,
    orderContextSymbol: orderContext.symbol,
    orderContextArrivalBudgetUnits:
      orderContext.arrivalBudgetUnits,
    orderContextDepthBudgetUnits:
      orderContext.depthBudgetUnits,
    orderContextMechanismSources: [
      ...orderContext.mechanismSources,
    ],
  };
}

function activeOrdersAtPrice(
  state,
  symbol,
  side,
  priceTicks,
) {
  const book = state.books[symbol];
  if (!book) return [];
  const levels = side === 'buy' ? book.bids : book.asks;
  return (levels[String(priceTicks)] ?? [])
    .map((orderId) => book.orders[orderId])
    .filter(activeOrder);
}

function activeLimitFollowerOrdersForAgent(
  state,
  agent,
) {
  const orders = [];
  const seen = new Set();
  for (const [symbol, book] of Object.entries(
    state.books,
  )) {
    const band = securityDailyBand(
      state.world.market.securities[symbol],
    );
    for (const [side, priceTicks] of [
      ['buy', band.limitUpTicks],
      ['sell', band.limitDownTicks],
    ]) {
      const levels =
        side === 'buy' ? book.bids : book.asks;
      for (const orderId of levels[String(priceTicks)] ?? []) {
        if (seen.has(orderId)) continue;
        const order = book.orders[orderId];
        if (
          activeOrder(order) &&
          order.ownerId === agent.accountId &&
          order.ecologyAgentId === agent.id &&
          typeof order.parentOrderId === 'string' &&
          order.parentOrderId.startsWith(
            `limit-follow:${agent.id}:`,
          )
        ) {
          seen.add(orderId);
          orders.push(order);
        }
      }
    }
  }
  return orders;
}

function limitFollowerCommands(
  state,
  agent,
  account,
  mandate,
) {
  const activeFollowerOrders =
    activeLimitFollowerOrdersForAgent(state, agent);
  const behavior = agent.behaviorState;
  const traits = behavior.persona.traits;
  const candidates = [];
  for (const [symbolIndex, symbol] of Object.keys(
    state.books,
  ).entries()) {
    const security = state.world.market.securities[symbol];
    const band = securityDailyBand(security);
    const lastPriceTicks = publicLastPriceTicks(
      state,
      symbol,
    );
    const previousCloseTicks = isPositiveInteger(
      security.previousCloseTicks,
    )
      ? security.previousCloseTicks
      : lastPriceTicks;
    const book = state.books[symbol];
    const boundaryBid = bookLevelMetrics(
      book,
      'buy',
      band.limitUpTicks,
      { excludeOwnerId: agent.accountId },
    );
    const boundaryAsk = bookLevelMetrics(
      book,
      'sell',
      band.limitDownTicks,
      { excludeOwnerId: agent.accountId },
    );
    const rawActorSignal =
      agent.kind === 'institution'
        ? institutionSignal(
            state,
            agent,
            symbol,
            symbolIndex,
          )
        : behaviorDecisionSignal(behavior, symbol);
    const momentumTicks = publishedMomentum(state, symbol);
    const flowSignal = publicFlowSignal(
      state,
      agent,
      symbol,
    );
    const orderContext =
      symbolOrderContextFor(
        state,
        agent,
        symbol,
      );
    const strategyConvictionBps =
      agent.strategy === 'published_frame_trend'
        ? 8_600
        : agent.strategy === 'industry_mean_reversion'
          ? 6_200
          : agent.strategy === 'delayed_fundamental_value'
            ? 4_800
            : clamp(
                Math.round(
                  (
                    traits.riskToleranceBps +
                    traits.socialLearningBps +
                    behavior.persona.stableGoals.growthBps
                  ) /
                    3,
                ),
                2_500,
                8_500,
              );
    const riskAversionBps = clamp(
      agent.riskAversionBps ??
        Math.round(
          (
            10_000 -
            traits.riskToleranceBps +
            traits.lossAversionBps
          ) /
            2,
        ),
      0,
      10_000,
    );
    const baseMaximumOrderUnits = Math.max(
      1,
      Math.floor(
        traits.baseOrderUnits *
          behaviorSizeMultiplier(behavior),
      ),
    );
    const positionUnits =
      mandate.positionUnitsBySymbol[symbol] ?? 0;
    const targetUnits =
      agent.targetHoldings[symbol] ?? positionUnits;
    for (const direction of ['up', 'down']) {
      const directionSign = direction === 'up' ? 1 : -1;
      const limitPriceTicks =
        direction === 'up'
          ? band.limitUpTicks
          : band.limitDownTicks;
      const resourceCapacityUnits =
        direction === 'up'
          ? Math.max(
              0,
              Math.floor(
                Math.min(
                  mandate.freeCashCents,
                  agent.riskBudgetCents ??
                    behavior.account.cashEnvelopeCents,
                ) /
                  limitPriceTicks,
              ),
            )
          : Math.max(
              0,
              Math.min(
                mandate.freeUnitsBySymbol[symbol],
                positionUnits,
              ),
            );
      const squareRootParticipationUnits = Math.floor(
        Math.sqrt(resourceCapacityUnits) *
          (
            agent.kind === 'institution'
              ? 12
              : 0.8
          ),
      );
      const maximumOrderUnits = Math.max(
        baseMaximumOrderUnits,
        Math.min(
          resourceCapacityUnits,
          squareRootParticipationUnits,
          agent.kind === 'institution' ? 5_000 : 80,
        ),
      );
      const inventoryCapacityUnits = Math.max(
        maximumOrderUnits * 6,
        Math.ceil(Math.max(1, targetUnits) * 0.08),
      );
      const queueAheadUnits =
        direction === 'up'
          ? boundaryBid.quantity
          : boundaryAsk.quantity;
      const visibleOppositeUnits = bookLevelMetrics(
        book,
        direction === 'up' ? 'sell' : 'buy',
        limitPriceTicks,
        { excludeOwnerId: agent.accountId },
      ).quantity;
      const dailyMoveBps = Math.round(
        directionSign *
          (lastPriceTicks - previousCloseTicks) *
          10_000 /
          Math.max(1, previousCloseTicks),
      );
      const directionalPrivateSignal =
        directionSign * rawActorSignal;
      const directionalCatalystBps =
        directionSign *
        orderContext.catalystSignalBps;
      const directionalTapeSignal =
        directionSign *
        (
          momentumTicks * 25 +
          flowSignal / 4
        );
      const directionalEvidenceBps =
        Math.max(
          0,
          directionalPrivateSignal * 30,
          directionalCatalystBps * 5,
        );
      const queueSupportBps = Math.round(
        queueAheadUnits *
          10_000 /
          Math.max(
            1,
            queueAheadUnits +
              visibleOppositeUnits +
              100,
          ),
      );
      const expectedContinuationBps = clamp(
        Math.round(
          180 +
            Math.max(0, dailyMoveBps) * 0.45 +
            directionalEvidenceBps +
            Math.max(0, directionalTapeSignal) +
            queueSupportBps * 0.025,
        ),
        0,
        2_000,
      );
      const reversalRiskBps = clamp(
        Math.round(
          70 +
            publicVolatilityTicks(state, symbol) * 24 +
            Math.max(
              0,
              -directionalPrivateSignal * 18 -
                Math.max(
                  0,
                  directionalCatalystBps,
                ) *
                  6,
            ) +
            behavior.performance.drawdownBps * 0.04,
        ),
        0,
        2_000,
      );
      const toxicityBps = clamp(
        Math.round(
          publicVolatilityTicks(state, symbol) * 90 +
            Math.max(
              0,
              -directionSign * flowSignal,
            ) *
              0.5 +
            (
              agent.kind === 'retail' &&
              agent.lastSymbolOrderContext?.[symbol]
                ?.regime === 'stress'
                ? 3_000
                : 0
            ),
        ),
        0,
        10_000,
      );
      const activeDirectionOrder =
        activeFollowerOrders.find(
          (order) =>
            order.symbol === symbol &&
            order.side ===
              (direction === 'up' ? 'buy' : 'sell') &&
            order.priceTicks === limitPriceTicks,
        ) ?? null;
      const previousLimitPhase =
        agent.lastSymbolOrderContext?.[symbol]
          ?.limitQueuePhase;
      const atBoundary = lastPriceTicks === limitPriceTicks;
      const limitQueuePhase = atBoundary
        ? (
            activeDirectionOrder &&
            (
              previousLimitPhase === 'consensus_lock' ||
              previousLimitPhase === 'stable_lock' ||
              previousLimitPhase === 'relock'
            )
              ? 'stable_lock'
              : previousLimitPhase === 'break'
                ? 'relock'
                : 'consensus_lock'
          )
        : (
            activeDirectionOrder
              ? 'divergence'
              : 'approach'
          );
      const maxParticipationBps = clamp(
        8_000 -
          Math.round(
            behavior.performance.drawdownBps * 0.4,
          ),
        1_000,
        9_000,
      );
      const independentAllocationBiasBps = Math.round(
        (
          stableAgentUnit(
            state,
            agent,
            `limit-boundary-allocation:${symbol}:${direction}`,
          ) -
          0.5
        ) *
          1_600,
      );
      const boundaryBudgetAllocationBps = atBoundary
        ? clamp(
            Math.round(
              5_200 +
                strategyConvictionBps * 0.24 +
                Math.max(0, directionalTapeSignal) * 0.12 -
                reversalRiskBps * 0.35 -
                toxicityBps * 0.04 +
                independentAllocationBiasBps,
            ),
            3_500,
            maxParticipationBps,
          )
        : 0;
      const minimumRestMs = atBoundary
        ? clamp(
            Math.round(
              MIN_CONSENSUS_LIMIT_REST_MS +
                traits.patienceBps *
                  (
                    MAX_CONSENSUS_LIMIT_REST_MS -
                      MIN_CONSENSUS_LIMIT_REST_MS
                  ) /
                  10_000,
            ),
            MIN_CONSENSUS_LIMIT_REST_MS,
            MAX_CONSENSUS_LIMIT_REST_MS,
          )
        : MIN_LIMIT_FOLLOWER_REST_MS;
      const crowdedOutOfBoundaryQueue =
        agent.kind === 'retail' &&
        atBoundary &&
        queueAheadUnits >=
          Math.max(
            500,
            maximumOrderUnits * 8,
          );
      if (crowdedOutOfBoundaryQueue) {
        continue;
      }
      // A sufficiently strong, delayed public company event can justify a
      // marketable limit order all the way to the exchange price boundary.
      // The order still carries this actor's finite cash/inventory, expected
      // utility, price-time identity and cancellable GTC remainder. Ordinary
      // or opposing evidence retains the narrow two-tick follower trigger.
      const eventApproachThresholdBps =
        orderContext.regime === 'stress'
          ? (
              orderContext.stressThresholdBps ??
              Math.max(
                120,
                Math.round(
                  orderContext
                    .volatilityBudgetBps * 0.45,
                ),
              )
            )
          : (
              orderContext.eventThresholdBps ??
              Math.max(
                120,
                Math.round(
                  orderContext
                    .volatilityBudgetBps * 0.45,
                ),
              )
            );
      const eventDrivenApproach =
        (
          orderContext.regime === 'event' ||
          orderContext.regime === 'stress'
        ) &&
        Number(
          orderContext.latestVisibleFactPublishedAtMs,
        ) > 0 &&
        Number(orderContext.catalystAgeMs) <=
          MAX_EVENT_APPROACH_AGE_MS &&
        directionalCatalystBps >=
          eventApproachThresholdBps;
      const triggerDistanceTicks =
        eventDrivenApproach
          ? Math.abs(
              limitPriceTicks -
                lastPriceTicks,
            )
          : 2;
      const plan = buildLimitFollowerQueue({
        seed: state.world.world.seed,
        symbol,
        nowMs: state.nowMs,
        decisionSequence: agent.decisionSequence,
        direction,
        limitPriceTicks,
        lastPriceTicks,
        triggerDistanceTicks,
        expectedContinuationBps,
        reversalRiskBps,
        toxicityBps,
        queueAheadUnits,
        visibleOppositeUnits,
        feeBps: 5,
        participants: [
          {
            id: agent.id,
            brokerId: agent.brokerId,
            account: {
              cashCents: mandate.freeCashCents,
              reservedCashCents: 0,
              holdings: {
                [symbol]: positionUnits,
              },
              reservedHoldings: {
                [symbol]: 0,
              },
              fundingStressBps:
                account.fundingStressBps ?? 0,
            },
            targetUnits,
            inventoryCapacityUnits,
            riskBudgetCents: Math.min(
              mandate.freeCashCents,
              agent.riskBudgetCents ??
                behavior.account.cashEnvelopeCents,
            ),
            maxOrderUnits: maximumOrderUnits,
            convictionBps: clamp(
              Math.round(
                strategyConvictionBps +
                  Math.max(
                    0,
                    directionalPrivateSignal * 30,
                  ),
              ),
              0,
              10_000,
            ),
            riskAversionBps,
            maxParticipationBps,
            boundaryBudgetAllocationBps,
            limitQueuePhase,
            minimumRestMs,
            minimumDurableQueueUnits: 0,
          },
        ],
      });
      const decision = plan.decisions[0];
      if (
        plan.orders.length > 0 &&
        decision?.action === 'join'
      ) {
        const plannedLayerKey =
          plan.orders[0]?.layerKey ?? null;
        candidates.push({
          plan,
          decision,
          retainsQueuePosition: activeFollowerOrders.some(
            (order) =>
              (
                order.liquidityLayer?.layerKey ??
                order.parentOrderId
              ) === plannedLayerKey,
          ),
        });
      }
    }
  }
  candidates.sort(
    (left, right) =>
      Number(right.retainsQueuePosition) -
        Number(left.retainsQueuePosition) ||
      Number(right.plan.distanceToLimitTicks === 0) -
        Number(left.plan.distanceToLimitTicks === 0) ||
      right.decision.expectedNetEdgeBps -
        left.decision.expectedNetEdgeBps ||
      left.plan.distanceToLimitTicks -
        right.plan.distanceToLimitTicks ||
      left.plan.symbol.localeCompare(right.plan.symbol),
  );
  const selected = candidates[0] ?? null;
  if (selected) {
    const context =
      agent.lastSymbolOrderContext?.[selected.plan.symbol];
    if (context) {
      const nextPhase =
        selected.plan.orders[0]?.liquidityLayer
          ?.limitQueuePhase ?? 'approach';
      const previousPhase = context.limitQueuePhase;
      context.limitQueuePhase = nextPhase;
      context.limitQueueDirection =
        selected.plan.direction;
      context.limitQueuePhaseSinceMs =
        previousPhase === nextPhase &&
        isNonNegativeInteger(
          context.limitQueuePhaseSinceMs,
        )
          ? context.limitQueuePhaseSinceMs
          : state.nowMs;
    }
  }
  const protectedFollowerOrders = activeFollowerOrders.filter(
    (order) => {
      const security =
        state.world.market.securities[order.symbol];
      if (!security) return false;
      const orderContext =
        agent.lastSymbolOrderContext?.[order.symbol];
      const directionalCatalystBps =
        (order.side === 'buy' ? 1 : -1) *
        Number(orderContext?.catalystSignalBps ?? 0);
      const opposingEventThresholdBps = Math.max(
        1,
        Number(orderContext?.eventThresholdBps) ||
          Math.round(
            Number(
              orderContext?.volatilityBudgetBps ??
                120,
            ) * 0.45,
          ),
      );
      // Minimum resting time protects FIFO identity during an unchanged
      // consensus. It must not trap a finite actor behind a newly visible,
      // material public event that opposes the order: the actor may cancel
      // the remaining GTC quantity through the normal command path.
      if (
        directionalCatalystBps <=
        -opposingEventThresholdBps
      ) {
        return false;
      }
      const band = securityDailyBand(security);
      const limitPriceTicks =
        order.side === 'buy'
          ? band.limitUpTicks
          : band.limitDownTicks;
      const minimumRestMs = Math.max(
        MIN_LIMIT_FOLLOWER_REST_MS,
        Number(
          order.liquidityLayer?.minimumRestMs,
        ) || 0,
      );
      const externalBoundaryUnits =
        activeOrdersAtPrice(
          state,
          order.symbol,
          order.side,
          limitPriceTicks,
        ).reduce(
          (sum, candidate) =>
            candidate.ownerId !== agent.accountId
              ? sum + candidate.remainingQty
              : sum,
          0,
        );
      const crowdedOut =
        agent.kind === 'retail' &&
        externalBoundaryUnits >=
          Math.max(
            500,
            order.originalQty * 8,
          );
      return Boolean(
        state.nowMs - order.submittedMs < minimumRestMs &&
          !crowdedOut &&
          order.priceTicks === limitPriceTicks &&
          Math.abs(
            publicLastPriceTicks(state, order.symbol) -
              limitPriceTicks,
          ) <= 2
      );
    },
  );
  const desiredOrders = [];
  if (selected?.plan.orders?.[0]) {
    desiredOrders.push(...selected.plan.orders);
  }
  const desiredLayers = new Set(
    desiredOrders.map((order) => order.layerKey),
  );
  for (const order of protectedFollowerOrders) {
    const layerKey =
      order.liquidityLayer?.layerKey ??
      order.parentOrderId;
    if (desiredLayers.has(layerKey)) continue;
    desiredLayers.add(layerKey);
    desiredOrders.push({
      layerKey,
      actorId: agent.id,
      brokerId: order.brokerId,
      symbol: order.symbol,
      side: order.side,
      priceTicks: order.priceTicks,
      quantity: Math.max(
        order.remainingQty,
        order.originalQty,
      ),
      tif: 'GTC',
      parentOrderId: order.parentOrderId,
      liquidityLayer: cloneJson(
        order.liquidityLayer,
      ),
    });
  }
  const diff = diffLimitFollowerQueue(
    activeFollowerOrders.map((order) => ({
      ...order,
      ownerId: agent.id,
    })),
    {
      orders: desiredOrders,
    },
  );
  const commands = diff.cancelOrders.map((cancel) => ({
    type: 'cancel_order',
    actorId: agent.accountId,
    brokerId: cancel.brokerId,
    orderId: cancel.orderId,
  }));
  if (!selected) return commands;
  const expectedUtility = {
    model: 'profit_seeking_limit_follower',
    expectedGrossEdgeBps:
      selected.decision.expectedGrossEdgeBps,
    expectedCostBps:
      selected.decision.expectedCostBps,
    expectedNetEdgeBps:
      selected.decision.expectedNetEdgeBps,
    fillProbabilityBps:
      selected.decision.fillProbabilityBps,
    expectedNetPnlCents: Math.max(
      1,
      Math.floor(
        selected.plan.limitPriceTicks *
          selected.plan.orders[0].quantity *
          selected.decision.expectedNetEdgeBps /
          10_000,
      ),
    ),
    shouldTrade: true,
  };
  const profitObjective = {
    actorId: agent.id,
    capitalOwnerId:
      behavior.account.capitalOwnerId,
    executionAccountId:
      behavior.account.executionAccountId,
    accountingBasis:
      behavior.performance.accountingBasis,
    strategy: agent.strategy,
    realizedNetPnlCents:
      behavior.performance.realizedNetPnlCents,
    markedPnlCents:
      behavior.performance.markedPnlCents,
    drawdownBps:
      behavior.performance.drawdownBps,
  };
  for (const order of diff.submitOrders) {
    commands.push({
      ...order,
      type: 'submit_order',
      actorId: agent.accountId,
      mandateOwnerId: agent.id,
      ecologyIntentKind: 'limit_follower',
      liquidityLayer: {
        ...order.liquidityLayer,
        mandateOwnerId: agent.id,
      },
      expectedUtility,
      profitObjective,
    });
  }
  return commands;
}

function accountHasStableLimitFollower(state, accountId) {
  for (const [symbol, security] of Object.entries(
    state.world.market.securities,
  )) {
    const band = securityDailyBand(security);
    const lastPriceTicks = publicLastPriceTicks(
      state,
      symbol,
    );
    for (const [side, boundaryTicks] of [
      ['buy', band.limitUpTicks],
      ['sell', band.limitDownTicks],
    ]) {
      if (lastPriceTicks !== boundaryTicks) continue;
      if (
        activeOrdersAtPrice(
          state,
          symbol,
          side,
          boundaryTicks,
        ).some(
          (order) =>
            order.ownerId === accountId &&
            order.ecologyIntentKind === 'limit_follower',
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function boundaryQueueExecutionThreshold(
  state,
  symbol,
  aggressiveSide,
  orderContext,
) {
  const security =
    state.world.market.securities[symbol];
  if (!security) return null;
  const band = securityDailyBand(security);
  const lastPriceTicks = publicLastPriceTicks(
    state,
    symbol,
  );
  const lockingSide =
    lastPriceTicks === band.limitUpTicks
      ? 'buy'
      : lastPriceTicks === band.limitDownTicks
        ? 'sell'
        : null;
  if (
    !lockingSide ||
    lockingSide === aggressiveSide
  ) {
    return null;
  }
  const boundaryTicks =
    lockingSide === 'buy'
      ? band.limitUpTicks
      : band.limitDownTicks;
  const queueOrders = activeOrdersAtPrice(
    state,
    symbol,
    lockingSide,
    boundaryTicks,
  ).filter(
    (order) =>
      order.ownerId !== 'player' &&
      order.side === lockingSide,
  );
  const owners = new Set(
    queueOrders.map((order) => order.ownerId),
  );
  if (owners.size < 2 || queueOrders.length < 2) {
    return null;
  }
  const queueUnits = queueOrders.reduce(
    (sum, order) => sum + order.remainingQty,
    0,
  );
  const oldestSubmittedMs = Math.min(
    ...queueOrders.map((order) => order.submittedMs),
  );
  const queueAgeMs = Math.max(
    0,
    state.nowMs - oldestSubmittedMs,
  );
  const evidenceHorizonMs = Math.max(
    MIN_LIMIT_FOLLOWER_REST_MS,
    ...queueOrders.map(
      (order) =>
        Number(
          order.liquidityLayer?.minimumRestMs,
        ) || 0,
    ),
  );
  const arrivalBudgetUnits = Math.max(
    1,
    orderContext?.arrivalBudgetUnits ?? 1,
  );
  const requiredSignal = clamp(
    3 +
      Math.log2(
        1 + queueUnits / arrivalBudgetUnits,
      ) *
        1.25 +
      owners.size * 0.4,
    4,
    18,
  );
  return {
    lockingSide,
    boundaryTicks,
    ownerCount: owners.size,
    queueUnits,
    queueAgeMs,
    evidenceHorizonMs,
    requiredSignal,
  };
}

function ordinaryParticipantCommands(
  state,
  agent,
  account,
  symbols,
  mandate,
  observedCapacity = null,
) {
  // A live book cannot consist only of infrequent high-conviction alpha
  // decisions. Ordinary participants quote finite passive interest when their
  // own expected exit can cover fees, queue waiting and inventory risk.
  const symbol = selectOrdinaryParticipationSymbol(
    state,
    agent,
    symbols,
  );
  const depth = aggregateBookMetrics(
    state.books[symbol],
    1,
    { excludeOwnerId: agent.accountId },
  );
  const security = state.world.market.securities[symbol];
  const orderContext = symbolOrderContextFor(
    state,
    agent,
    symbol,
  );
  const activeOrdinaryOrders = activeOrdersOwnedBy(
    state,
    agent.accountId,
  ).filter(
    (order) =>
      order.ownerId === agent.accountId &&
      order.ecologyAgentId === agent.id &&
      order.ecologyIntentKind ===
        'ordinary_participation',
  );
  if (
    activeOrdinaryOrders.length === 0 &&
    !contextArrivalAllowed(
      state,
      agent,
      orderContext,
      'ordinary',
    )
  ) {
    return [];
  }
  const dailyBand = securityDailyBand(security);
  const previousCloseTicks =
    isPositiveInteger(security.previousCloseTicks)
      ? security.previousCloseTicks
      : cents(security.lastPrice);
  const currentTicks = cents(security.lastPrice);
  const publicMeanTicks = publishedMeanPrice(state, symbol);
  const anchorBiasTicks =
    (hash32(
      `${state.world.world.seed}:${agent.id}:${symbol}:participation-anchor`,
    ) % 11) -
    5;
  const referenceTicks = Math.round(
    previousCloseTicks * 0.15 +
      publicMeanTicks * 0.25 +
      currentTicks * 0.6,
  ) +
    anchorBiasTicks +
    privateReservationShockTicks(
      state,
      agent,
      symbol,
      orderContext,
    ) +
    (
      orderContext.profileConfigured
        ? Math.round(
            currentTicks *
              orderContext.catalystSignalBps /
              10_000,
          )
        : 0
    );
  const noTradeThresholdTicks =
    orderContext.profileConfigured
      ? Math.max(
          1,
          Math.round(
            currentTicks *
              orderContext.volatilityBudgetBps /
              200_000,
          ),
        )
      : 1 +
        (
          hash32(
            `${state.world.world.seed}:${agent.id}:${symbol}:participation-threshold`,
          ) % 5
        );
  const inventoryDeviationUnits =
    mandate.positionUnitsBySymbol[symbol] -
    (agent.targetHoldings[symbol] ?? 0);
  const inventoryBandUnits =
    2 +
    (
      hash32(
        `${state.world.world.seed}:${agent.id}:${symbol}:participation-inventory`,
      ) % 7
    );
  const adaptiveSignal =
    behaviorDecisionSignal(agent.behaviorState, symbol) +
    publicFlowSignal(state, agent, symbol) / 160;
  const visibleFlowMs =
    state.nowMs - publicFlowObservationDelayMs(agent);
  const lastVisiblePublicTrade = [
    ...(publicRealtimeTape(state).bySymbol.get(symbol) ?? []),
  ]
    .reverse()
    .find((trade) => trade.virtualMs <= visibleFlowMs);
  let preferredSide;
  if (inventoryDeviationUnits >= inventoryBandUnits) {
    preferredSide = 'sell';
  } else if (inventoryDeviationUnits <= -inventoryBandUnits) {
    preferredSide = 'buy';
  } else if (lastVisiblePublicTrade) {
    // Ordinary liquidity provision leans against the last observable
    // aggressive trade. High-conviction institution/retail intents are
    // handled before this fallback; this branch prevents a quiet tape from
    // becoming a permanent one-sided script while remaining delayed and
    // based only on public settled flow.
    preferredSide =
      lastVisiblePublicTrade.side === 'buy'
        ? 'sell'
        : 'buy';
  } else if (
    currentTicks >
    referenceTicks + noTradeThresholdTicks
  ) {
    preferredSide = 'sell';
  } else if (
    currentTicks <
    referenceTicks - noTradeThresholdTicks
  ) {
    preferredSide = 'buy';
  } else if (Math.abs(adaptiveSignal) >= 1) {
    preferredSide = adaptiveSignal > 0 ? 'buy' : 'sell';
  } else {
    preferredSide =
      stableAgentUnit(
        state,
        agent,
        `participation-liquidity-side:${symbol}`,
      ) >= 0.5
        ? 'buy'
        : 'sell';
  }
  const availableBuy =
    isPositiveInteger(depth.bids.bestPriceTicks) &&
    isPositiveInteger(depth.asks.bestPriceTicks) &&
    mandate.freeCashCents >
      depth.asks.bestPriceTicks + 5;
  const availableSell =
    isPositiveInteger(depth.asks.bestPriceTicks) &&
    isPositiveInteger(depth.bids.bestPriceTicks) &&
    mandate.freeUnitsBySymbol[symbol] > 0;
  const side =
    preferredSide === 'buy'
      ? availableBuy
        ? 'buy'
        : availableSell
          ? 'sell'
          : null
      : availableSell
        ? 'sell'
        : availableBuy
          ? 'buy'
          : null;
  if (!side) return [];
  const rawPassivePrice =
    side === 'buy'
      ? depth.bids.bestPriceTicks
      : depth.asks.bestPriceTicks;
  const rawAggressivePrice =
    side === 'buy'
      ? depth.asks.bestPriceTicks
      : depth.bids.bestPriceTicks;
  const withinDailyBand = (priceTicks) =>
    clamp(
      priceTicks,
      dailyBand.limitDownTicks,
      dailyBand.limitUpTicks,
    );
  const passivePrice = withinDailyBand(rawPassivePrice);
  const aggressivePrice = withinDailyBand(rawAggressivePrice);
  const unit = deterministicUnit(
    state,
    agent,
    `ordinary-flow:${symbol}:${side}`,
  );
  const desiredQuantity = contextualParticipantQuantity(
    orderContext,
    1 + Math.floor(unit * unit * 16),
  );
  const quantity =
    side === 'buy'
      ? Math.min(
          desiredQuantity,
          Math.max(
            0,
            Math.floor(
              (mandate.freeCashCents - 5) /
                aggressivePrice,
            ),
          ),
        )
      : Math.min(
          desiredQuantity,
          mandate.freeUnitsBySymbol[symbol],
        );
  if (quantity <= 0) return [];
  const expectedExitTicks = Math.max(
    1,
    Math.round(
      referenceTicks + adaptiveSignal,
    ),
  );
  const candidates = [
    {
      priceTicks: aggressivePrice,
      tif: 'IOC',
    },
    {
      priceTicks: passivePrice,
      tif: 'GTC',
    },
  ].map((candidate) => ({
    ...candidate,
    ...profitCertificateForOrder(
      state,
      agent,
      mandate,
      {
        symbol,
        side,
        priceTicks: candidate.priceTicks,
        expectedExitTicks,
        quantity,
        tif: candidate.tif,
      },
    ),
  }));
  const selected = candidates
    .filter(
      (candidate) =>
        candidate.expectedUtility.shouldTrade,
    )
    .sort(
      (left, right) =>
        right.expectedUtility.expectedNetPnlCents -
          left.expectedUtility.expectedNetPnlCents ||
        (
          left.tif === 'IOC' ? -1 : 1
        ),
    )[0];
  if (!selected) {
    return activeOrdinaryOrders.map((order) => ({
      type: 'cancel_order',
      actorId: agent.accountId,
      brokerId: agent.brokerId,
      orderId: order.id,
    }));
  }
  const matchingOrder = activeOrdinaryOrders.find(
    (order) =>
      order.symbol === symbol &&
      order.side === side &&
      selected.tif === 'GTC' &&
      order.priceTicks === selected.priceTicks,
  );
  if (
    matchingOrder &&
    activeOrdinaryOrders.length === 1
  ) {
    return [];
  }
  if (activeOrdinaryOrders.length > 0) {
    return activeOrdinaryOrders
      .filter((order) => order.id !== matchingOrder?.id)
      .map((order) => ({
        type: 'cancel_order',
        actorId: agent.accountId,
        brokerId: agent.brokerId,
        orderId: order.id,
      }));
  }
  return [
    tagCommandOrderContext({
      type: 'submit_order',
      actorId: agent.accountId,
      brokerId: agent.brokerId,
      symbol,
      side,
      priceTicks: selected.priceTicks,
      quantity,
      tif: selected.tif,
      parentOrderId:
        `ordinary:${agent.id}:${symbol}:` +
        `${state.nowMs}:${agent.decisionSequence}`,
      ecologyIntentKind: 'ordinary_participation',
      capacityMultiplierBps: Math.round(
        calculateCapacityMultiplier(
          state,
          agent.accountId,
          agent.id,
          observedCapacity,
        ) * 10_000,
      ),
      expectedUtility:
        selected.expectedUtility,
      profitObjective:
        selected.profitObjective,
    }, orderContext),
  ];
}

function mandateResources(state, agent, account) {
  const behavior = agent.behaviorState;
  const symbols = Object.keys(state.books);
  const activeMandateOrders = activeOrdersOwnedBy(
    state,
    agent.accountId,
  ).filter(
    (order) =>
      activeOrder(order) &&
      order.ownerId === agent.accountId &&
      (
        order.ecologyAgentId === agent.id ||
        (
          !order.ecologyAgentId &&
          typeof order.parentOrderId === 'string' &&
          (
            order.parentOrderId.startsWith(
              `behavior:${agent.id}:`,
            ) ||
            order.parentOrderId.includes(`:${agent.id}:`)
          )
        )
      ),
  );
  let reservedCashCents = 0;
  const reservedUnitsBySymbol = Object.fromEntries(
    symbols.map((symbol) => [symbol, 0]),
  );
  for (const order of activeMandateOrders) {
    if (order.side === 'buy') {
      const remainingGrossCents =
        order.priceTicks * order.remainingQty;
      const filledGrossCents = order.filledGrossCents ?? 0;
      const chargedFeeCents = order.chargedFeeCents ?? 0;
      const maximumFeeCents = Math.max(
        5,
        Math.ceil(
          (filledGrossCents + remainingGrossCents) *
            5 /
            10_000,
        ),
      );
      reservedCashCents +=
        remainingGrossCents +
        Math.max(0, maximumFeeCents - chargedFeeCents);
    } else {
      reservedUnitsBySymbol[order.symbol] +=
        order.remainingQty;
    }
  }
  const mandateCashCents = Math.max(
    0,
    behavior.account.cashEnvelopeCents +
      behavior.account.settledNetCashCents -
      reservedCashCents,
  );
  return {
    freeCashCents: Math.min(
      freeCash(account),
      mandateCashCents,
    ),
    freeUnitsBySymbol: Object.fromEntries(
      symbols.map((symbol) => [
        symbol,
        Math.min(
          freeUnits(account, symbol),
          Math.max(
            0,
            behavior.account.initialHoldings[symbol] +
              behavior.account.settledNetUnits[symbol] -
              reservedUnitsBySymbol[symbol],
          ),
        ),
      ]),
    ),
    positionUnitsBySymbol: Object.fromEntries(
      symbols.map((symbol) => [
        symbol,
        behavior.account.initialHoldings[symbol] +
          behavior.account.settledNetUnits[symbol],
      ]),
    ),
  };
}

function expandRetailClusterCommands(
  state,
  agent,
  mandate,
  commands,
) {
  const behavior = agent.behaviorState;
  const traits = behavior.persona.traits;
  const populationWeight =
    behavior.persona.populationWeight;
  const socialBelongingBps =
    behavior.persona.stableGoals.socialBelongingBps;
  const confidenceBps =
    behavior.cognition.confidenceBps;
  const stressBps = behavior.pressure.stressBps;
  const expanded = [];
  for (const command of commands) {
    if (command.type !== 'submit_order') {
      expanded.push(command);
      continue;
    }
    const priceTicks = command.priceTicks;
    if (
      !isPositiveInteger(priceTicks) ||
      !isPositiveInteger(command.quantity)
    ) {
      expanded.push(command);
      continue;
    }
    const participationScore =
      populationWeight +
      Math.round(socialBelongingBps / 10) +
      Math.round(confidenceBps / 20) -
      Math.round(stressBps / 25);
    const quantityMultiplier = clamp(
      1 + Math.floor(Math.max(0, participationScore) / 360),
      1,
      4,
    );
    const maximumResourceUnits =
      command.side === 'buy'
        ? Math.max(
            0,
            Math.floor(
              (mandate.freeCashCents - 5) /
                priceTicks,
            ),
          )
        : mandate.freeUnitsBySymbol[command.symbol] ?? 0;
    const totalQuantity = Math.min(
      maximumResourceUnits,
      command.quantity * quantityMultiplier,
      traits.baseOrderUnits * 4,
    );
    if (totalQuantity === command.quantity) {
      expanded.push(command);
      continue;
    }
    const desiredChildCount = clamp(
      2 +
        Math.floor(populationWeight / 220) +
        (
          hash32(
            [
              state.world.world.seed,
              agent.id,
              command.symbol,
              command.side,
              state.nowMs,
              agent.decisionSequence,
              'retail-cluster-slices',
            ].join(':'),
          ) %
          2
        ),
      2,
      4,
    );
    const childCount = Math.min(
      desiredChildCount,
      totalQuantity,
    );
    const baseChildQuantity = Math.floor(
      totalQuantity / childCount,
    );
    let remainder = totalQuantity % childCount;
    for (let index = 0; index < childCount; index += 1) {
      const childQuantity =
        baseChildQuantity + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
      const expectedUtility = command.expectedUtility
        ? {
            ...command.expectedUtility,
            expectedNetPnlCents: Math.max(
              1,
              Math.floor(
                command.expectedUtility.expectedNetPnlCents *
                  childQuantity /
                  command.quantity,
              ),
            ),
          }
        : command.expectedUtility;
      expanded.push({
        ...command,
        quantity: childQuantity,
        expectedUtility,
      });
    }
  }
  return expanded;
}

function retailClusterBehaviorIntent(intent, commands) {
  const firstSubmit = commands.find(
    (command) => command.type === 'submit_order',
  );
  if (!firstSubmit) return null;
  const siblingSubmits = commands.filter(
    (command) =>
      command.type === 'submit_order' &&
      command.parentOrderId === firstSubmit.parentOrderId &&
      command.symbol === firstSubmit.symbol &&
      command.side === firstSubmit.side,
  );
  const quantity = siblingSubmits.reduce(
    (sum, command) => sum + command.quantity,
    0,
  );
  const expectedNetPnlCents = siblingSubmits.reduce(
    (sum, command) =>
      sum +
      (
        command.expectedUtility?.expectedNetPnlCents ??
        0
      ),
    0,
  );
  return {
    ...(intent ?? {}),
    intentId: firstSubmit.parentOrderId,
    command: {
      ...firstSubmit,
      quantity,
      expectedUtility: firstSubmit.expectedUtility
        ? {
            ...firstSubmit.expectedUtility,
            expectedNetPnlCents,
          }
        : firstSubmit.expectedUtility,
    },
  };
}

function retailWorkingOrderLifecycle(
  state,
  agent,
) {
  const workingOrders = activeOrdersOwnedBy(
    state,
    agent.accountId,
  ).filter(
    (order) =>
      activeOrder(order) &&
      order.ownerId === agent.accountId &&
      order.ecologyAgentId === agent.id &&
      order.ecologyIntentKind !== 'limit_follower',
  );
  if (workingOrders.length === 0) {
    return { blocked: false, commands: [] };
  }
  const patienceBps = clamp(
    Number(
      agent.behaviorState?.persona?.traits
        ?.patienceBps,
    ) || 0,
    0,
    10_000,
  );
  const restingLifetimeMs = Math.round(
    MIN_RETAIL_RESTING_LIFETIME_MS +
      (
        MAX_RETAIL_RESTING_LIFETIME_MS -
        MIN_RETAIL_RESTING_LIFETIME_MS
      ) *
        patienceBps /
        10_000,
  );
  const oldestSubmittedMs = Math.min(
    ...workingOrders.map((order) => order.submittedMs),
  );
  const mustCancel =
    workingOrders.length > MAX_RETAIL_WORKING_ORDERS ||
    state.nowMs - oldestSubmittedMs >= restingLifetimeMs;
  if (!mustCancel) {
    return { blocked: true, commands: [] };
  }
  return {
    blocked: true,
    commands: workingOrders.map((order) => ({
      type: 'cancel_order',
      actorId: agent.accountId,
      brokerId: order.brokerId,
      orderId: order.id,
    })),
  };
}

function behaviorCommandWithInFlightExposure(
  state,
  agent,
  command,
) {
  if (
    !command ||
    command.type !== 'submit_order' ||
    typeof command.parentOrderId !== 'string'
  ) {
    return command;
  }
  const priorFilledQuantity =
    agent.behaviorState.memory.intentAggregates
      .filter(
        (aggregate) =>
          aggregate.intentId === command.parentOrderId &&
          aggregate.symbol === command.symbol &&
          aggregate.side === command.side,
      )
      .reduce(
        (sum, aggregate) => sum + aggregate.quantity,
        0,
      );
  const inFlightQuantity = activeOrdersOwnedBy(
    state,
    agent.accountId,
  )
    .filter(
      (order) =>
        activeOrder(order) &&
        order.ownerId === agent.accountId &&
        order.ecologyAgentId === agent.id &&
        order.parentOrderId === command.parentOrderId &&
        order.symbol === command.symbol &&
        order.side === command.side,
    )
    .reduce(
      (sum, order) => sum + order.remainingQty,
      0,
    );
  return {
    ...command,
    quantity:
      priorFilledQuantity +
      inFlightQuantity +
      command.quantity,
  };
}

function retailCommands(
  state,
  agent,
  observedCapacity = null,
) {
  const account = state.accounts[agent.accountId];
  if (!account) return [];
  const market = Object.fromEntries(
    Object.keys(state.books).map((symbol) => {
      const depth = aggregateBookMetrics(
        state.books[symbol],
        1,
        { excludeOwnerId: agent.accountId },
      );
      const orderContext = symbolOrderContextFor(
        state,
        agent,
        symbol,
      );
      return [
        symbol,
        {
          lastPriceTicks: publicLastPriceTicks(state, symbol),
          bestBidTicks:
            depth.bids.bestPriceTicks ??
            publicLastPriceTicks(state, symbol) - 1,
          bestAskTicks:
            depth.asks.bestPriceTicks ??
            publicLastPriceTicks(state, symbol) + 1,
          availableBidUnits:
            depth.bids.bestQuantity,
          availableAskUnits:
            depth.asks.bestQuantity,
          volatilityTicks:
            Math.max(
              publicVolatilityTicks(state, symbol),
              orderContext.profileConfigured
                ? Math.round(
                    publicLastPriceTicks(state, symbol) *
                      orderContext.volatilityBudgetBps /
                      320_000,
                  )
                : 0,
            ),
        },
      ];
    }),
  );
  const mandate = mandateResources(state, agent, account);
  const limitCommands = limitFollowerCommands(
    state,
    agent,
    account,
    mandate,
  );
  if (limitCommands.length > 0) {
    const firstSubmit = limitCommands.find(
      (command) => command.type === 'submit_order',
    );
    recordBehaviorAction(agent.behaviorState, {
      nowMs: state.nowMs,
      intent: firstSubmit
        ? {
            intentId: firstSubmit.parentOrderId,
            motiveCode: 'profit_seeking_limit_follow',
            bindingConstraintCodes: [
              'DAILY_LIMIT_QUEUE',
              'FINITE_MANDATE_RESOURCE',
            ],
            command: firstSubmit,
          }
        : null,
      productionOrderCount: limitCommands.filter(
        (command) => command.type === 'submit_order',
      ).length,
    });
    return limitCommands;
  }
  if (
    accountHasStableLimitFollower(
      state,
      agent.accountId,
    )
  ) {
    return [];
  }
  const workingLifecycle = retailWorkingOrderLifecycle(
    state,
    agent,
  );
  if (workingLifecycle.blocked) {
    recordBehaviorAction(agent.behaviorState, {
      nowMs: state.nowMs,
      intent: null,
      productionOrderCount: 0,
    });
    return workingLifecycle.commands;
  }
  if (
    agent.lastOrderMs !== null &&
    state.nowMs <
      agent.lastOrderMs + MIN_INSTITUTION_ACTION_INTERVAL_MS
  ) {
    return [];
  }
  const intent = createRetailIntent({
    behavior: agent.behaviorState,
    agentId: agent.id,
    accountId: agent.accountId,
    brokerId: agent.brokerId,
    decisionSequence: agent.decisionSequence,
    nowMs: state.nowMs,
    market,
    freeCashCents: Math.min(
      freeCash(account),
      mandate.freeCashCents,
    ),
    freeUnitsBySymbol: Object.fromEntries(
      Object.keys(state.books).map((symbol) => [
        symbol,
        Math.min(
          freeUnits(account, symbol),
          mandate.freeUnitsBySymbol[symbol],
        ),
      ]),
    ),
  });
  if (!intent) {
    const ordinaryCommands = expandRetailClusterCommands(
      state,
      agent,
      mandate,
      ordinaryParticipantCommands(
        state,
        agent,
        account,
        Object.keys(state.books),
        mandate,
        observedCapacity,
      ),
    );
    const behaviorIntent = retailClusterBehaviorIntent(
      null,
      ordinaryCommands,
    );
    recordBehaviorAction(agent.behaviorState, {
      nowMs: state.nowMs,
      intent: behaviorIntent
        ? {
            ...behaviorIntent,
            motiveCode:
              'bounded_private_reservation_value',
            bindingConstraintCodes: [
              'EXPECTED_NET_UTILITY',
              'FINITE_MANDATE_RESOURCE',
            ],
          }
        : null,
      productionOrderCount: ordinaryCommands.filter(
        (command) => command.type === 'submit_order',
      ).length,
    });
    return ordinaryCommands;
  }
  const intentOrderContext = symbolOrderContextFor(
    state,
    agent,
    intent.command.symbol,
  );
  const contextualIntentQuantity =
    contextualParticipantQuantity(
      intentOrderContext,
      intent.command.quantity,
    );
  const contextualIntentCommand = tagCommandOrderContext(
    {
      ...intent.command,
      quantity: contextualIntentQuantity,
      expectedUtility: intent.command.expectedUtility
        ? {
            ...intent.command.expectedUtility,
            expectedNetPnlCents: Math.round(
              intent.command.expectedUtility
                .expectedNetPnlCents *
                contextualIntentQuantity /
                Math.max(1, intent.command.quantity),
            ),
          }
        : intent.command.expectedUtility,
    },
    intentOrderContext,
  );
  const intentCommands = expandRetailClusterCommands(
    state,
    agent,
    mandate,
    [
      {
        ...contextualIntentCommand,
        ecologyIntentKind: 'behavior_execution',
        capacityMultiplierBps: Math.round(
          calculateCapacityMultiplier(
            state,
            agent.accountId,
            agent.id,
            observedCapacity,
          ) *
            behaviorSizeMultiplier(
              agent.behaviorState,
            ) *
            10_000,
        ),
      },
    ],
  );
  const behaviorIntent = retailClusterBehaviorIntent(
    intent,
    intentCommands,
  );
  recordBehaviorAction(agent.behaviorState, {
    nowMs: state.nowMs,
    intent: behaviorIntent,
    productionOrderCount: intentCommands.filter(
      (command) => command.type === 'submit_order',
    ).length,
  });
  return intentCommands;
}

function institutionCommands(
  state,
  agent,
  observedCapacity = null,
) {
  const account = state.accounts[agent.accountId];
  if (!account || state.quoteFrames.length === 0) return [];
  const symbols = Object.keys(state.books);
  const mandate = mandateResources(state, agent, account);
  const limitCommands = limitFollowerCommands(
    state,
    agent,
    account,
    mandate,
  );
  if (limitCommands.length > 0) {
    return limitCommands;
  }
  if (
    accountHasStableLimitFollower(
      state,
      agent.accountId,
    )
  ) {
    return [];
  }
  if (
    agent.lastOrderMs !== null &&
    state.nowMs <
      agent.lastOrderMs + MIN_INSTITUTION_ACTION_INTERVAL_MS
  ) {
    return [];
  }
  const ranked = symbols
    .map((symbol, index) => {
      const positionUnits =
        mandate.positionUnitsBySymbol[symbol] ?? 0;
      const targetUnits =
        agent.targetHoldings[symbol] ??
        positionUnits;
      const targetDeviationUnits =
        positionUnits - targetUnits;
      const currentTicks =
        publicLastPriceTicks(state, symbol);
      const orderContext = symbolOrderContextFor(
        state,
        agent,
        symbol,
      );
      const targetDeviationRiskCents =
        Math.abs(targetDeviationUnits) *
        currentTicks;
      const riskReductionPriority =
        targetDeviationRiskCents >=
        agent.riskBudgetCents
          ? targetDeviationRiskCents /
            Math.max(1, agent.riskBudgetCents)
          : 0;
      const baseSignal =
        riskReductionPriority > 0 &&
        targetDeviationUnits !== 0
          ? -Math.sign(targetDeviationUnits) *
            clamp(
              4 + riskReductionPriority * 4,
              4,
              24,
            )
          : institutionSignal(
              state,
              agent,
              symbol,
              index,
            );
      return {
        symbol,
        // institutionSignal already includes the actor's valuation and
        // catalyst interpretation. Re-applying the combined context belief
        // gap would double-count both and can hide the newest public fact
        // behind a stale cross-symbol valuation gap.
        signal: baseSignal,
        orderContext,
        riskReductionPriority,
        openingPriority:
          !agent.openingSignalConsumed &&
          (agent.openingSignals[symbol] ?? 0) !==
            0
            ? 1
            : 0,
      };
    })
    .sort(
      (left, right) =>
        right.riskReductionPriority -
          left.riskReductionPriority ||
        right.openingPriority -
          left.openingPriority ||
        Math.abs(right.signal) - Math.abs(left.signal) ||
        left.symbol.localeCompare(right.symbol),
    );
  const selected = ranked[0];
  if (!selected) return [];
  if (Math.abs(selected.signal) < 1.1) {
    return ordinaryParticipantCommands(
      state,
      agent,
      account,
      symbols,
      mandate,
      observedCapacity,
    );
  }

  const depth = aggregateBookMetrics(
    state.books[selected.symbol],
    1,
    { excludeOwnerId: agent.accountId },
  );
  const side = selected.signal > 0 ? 'buy' : 'sell';
  const boundaryExecution =
    boundaryQueueExecutionThreshold(
      state,
      selected.symbol,
      side,
      selected.orderContext,
    );
  if (
    boundaryExecution &&
    boundaryExecution.queueAgeMs <
      boundaryExecution.evidenceHorizonMs &&
    Math.abs(selected.signal) <
      boundaryExecution.requiredSignal
  ) {
    selected.orderContext.limitQueuePhase =
      'stable_lock';
    selected.orderContext.limitQueuePhaseSinceMs =
      Math.min(
        selected.orderContext.limitQueuePhaseSinceMs ??
          state.nowMs,
        state.nowMs,
      );
    return [];
  }
  const executablePrice =
    side === 'buy'
      ? depth.asks.bestPriceTicks
      : depth.bids.bestPriceTicks;
  if (!isPositiveInteger(executablePrice)) return [];
  const intensity = clamp(Math.abs(selected.signal) / 10, 0.35, 2.4);
  const selectedShock = recentPublicShock(
    state,
    agent,
    selected.symbol,
  );
  const riskBudgetUnits = Math.max(
    0,
    Math.floor(
      Math.min(
        agent.riskBudgetCents,
        side === 'buy'
          ? mandate.freeCashCents
          : agent.riskBudgetCents,
      ) /
        executablePrice,
    ),
  );
  const shockParticipationScale =
    agent.strategy === 'delayed_fundamental_value'
      ? 0.85
      : agent.strategy === 'published_frame_trend'
        ? 0.65
        : 0.75;
  const shockCapacityUnits = Math.min(
    700,
    Math.floor(
      Math.sqrt(riskBudgetUnits) *
        shockParticipationScale,
    ),
  );
  const shockOrderUnits = Math.floor(
    shockCapacityUnits *
      selectedShock.intensityBps /
      10_000,
  );
  const baseQuantity = contextualParticipantQuantity(
    selected.orderContext,
    8 +
      Math.floor(
        stableAgentUnit(
          state,
          agent,
          `size:${selected.symbol}`,
        ) * 24,
      ) +
      shockOrderUnits,
  );
  const capacityMultiplier = calculateCapacityMultiplier(
    state,
    agent.accountId,
    agent.id,
    observedCapacity,
  );
  const desiredQuantity = Math.max(
    1,
    Math.floor(
      baseQuantity *
        intensity *
        capacityMultiplier *
        behaviorSizeMultiplier(agent.behaviorState),
    ),
  );
  const inventoryDeviationUnits =
    mandate.positionUnitsBySymbol[selected.symbol] -
    (agent.targetHoldings[selected.symbol] ?? 0);
  const targetHoldingUnits =
    agent.targetHoldings[selected.symbol] ?? 0;
  // Net participation grows sub-linearly with fund size. A larger institution
  // can trade more, but cannot dump a fixed percentage of a huge book into a
  // thin synthetic touch every few seconds without first attracting opposing
  // flow. This is the intended size/exit-friction feedback, not a moral or
  // directional restriction.
  const maximumSignalDeviationUnits = Math.max(
    24,
    Math.round(
      Math.sqrt(targetHoldingUnits) *
        0.06 *
        clamp(capacityMultiplier, 0.5, 2),
    ) +
      shockOrderUnits,
  );
  const deployedRiskCents =
    Math.abs(inventoryDeviationUnits) * executablePrice;
  const remainingRiskCents = Math.max(
    0,
    agent.riskBudgetCents - deployedRiskCents,
  );
  const orderDirection = side === 'buy' ? 1 : -1;
  const reducesRisk =
    inventoryDeviationUnits !== 0 &&
    Math.sign(inventoryDeviationUnits) !== orderDirection;
  const riskQuantity = reducesRisk
    ? Math.abs(inventoryDeviationUnits) +
      Math.floor(agent.riskBudgetCents / executablePrice)
    : Math.max(
        0,
        Math.min(
          Math.floor(remainingRiskCents / executablePrice),
          side === 'buy'
            ? maximumSignalDeviationUnits -
              inventoryDeviationUnits
            : maximumSignalDeviationUnits +
              inventoryDeviationUnits,
        ),
      );
  const quantity =
    side === 'buy'
      ? Math.min(
          desiredQuantity,
          Math.max(
            0,
            Math.floor(
              (mandate.freeCashCents - 5) / executablePrice,
            ),
          ),
          riskQuantity,
        )
      : Math.min(
          desiredQuantity,
          mandate.freeUnitsBySymbol[selected.symbol],
          riskQuantity,
        );
  if (quantity <= 0) {
    return ordinaryParticipantCommands(
      state,
      agent,
      account,
      symbols,
      mandate,
      observedCapacity,
    );
  }
  const currentPriceTicks = publicLastPriceTicks(
    state,
    selected.symbol,
  );
  const expectedMoveTicks = Math.max(
    1,
    Math.round(Math.abs(selected.signal) * 2),
  );
  const expectedExitTicks =
    side === 'buy'
      ? currentPriceTicks + expectedMoveTicks
      : Math.max(
          1,
          currentPriceTicks - expectedMoveTicks,
        );
  const certificate = profitCertificateForOrder(
    state,
    agent,
    mandate,
    {
      symbol: selected.symbol,
      side,
      priceTicks: executablePrice,
      expectedExitTicks,
      quantity,
      tif: 'IOC',
    },
  );
  if (!certificate.expectedUtility.shouldTrade) {
    return ordinaryParticipantCommands(
      state,
      agent,
      account,
      symbols,
      mandate,
      observedCapacity,
    );
  }
  const lowConvictionFlow =
    selected.openingPriority === 1 ||
    Math.abs(selected.signal) < 4;
  return [
    tagCommandOrderContext({
      type: 'submit_order',
      actorId: agent.accountId,
      brokerId: agent.brokerId,
      symbol: selected.symbol,
      side,
      priceTicks: executablePrice,
      quantity,
      tif: 'IOC',
      parentOrderId: lowConvictionFlow
        ? `low_conviction_flow:${agent.id}:${selected.symbol}:${state.nowMs}`
        : `${agent.strategy}:${agent.id}:${state.nowMs}`,
      ecologyIntentKind: lowConvictionFlow
        ? 'ordinary_participation'
        : 'signal_execution',
      capacityMultiplierBps: Math.round(
        capacityMultiplier * 10_000,
      ),
      expectedUtility:
        certificate.expectedUtility,
      profitObjective:
        certificate.profitObjective,
    }, selected.orderContext),
  ];
}

/**
 * Produces intents from an explicitly bounded information set: an agent's own
 * account, public depth/trades/frames and catalogued delayed observations.
 */
export function decideAgentOrders(state, agentId) {
  if (
    state?.agentEcology?.ruleVersion !== AGENT_RULE_VERSION ||
    state.agentEcology.capacityLedger?.ruleVersion !==
      CAPACITY_LEDGER_RULE_VERSION
  ) {
    throw new Error(
      'A current migrated agent ecology authority is required.',
    );
  }
  const agent = state.agentEcology?.agents?.[agentId];
  if (!agent) return [];
  const visibleTick = visibleFundamentalTick(
    state.world,
    state.nowMs,
    agent.informationDelayMs,
  );
  if (visibleTick !== agent.lastFundamentalTick) {
    refreshDelayedFundamentals(state, agentId);
  }
  if (
    agent.publicFlowMemory &&
    agent.publicFlowMemory.lastTradeMs + 9000 < state.nowMs
  ) {
    agent.publicFlowMemory = null;
  }
  const observedCapacity = observeAgentBehavior(state, agent);
  const commands =
    agent.kind === 'maker'
      ? makerCommands(state, agent, observedCapacity)
      : agent.kind === 'retail'
        ? retailCommands(state, agent, observedCapacity)
        : institutionCommands(
            state,
            agent,
            observedCapacity,
          );
  if (agent.kind !== 'retail') {
    const firstSubmit = commands.find(
      (command) => command.type === 'submit_order',
    );
    const behaviorCommand =
      behaviorCommandWithInFlightExposure(
        state,
        agent,
        firstSubmit,
      );
    recordBehaviorAction(agent.behaviorState, {
      nowMs: state.nowMs,
      intent: behaviorCommand
        ? {
            intentId: behaviorCommand.parentOrderId,
            motiveCode: agent.strategy,
            bindingConstraintCodes: [
              agent.kind === 'maker'
                ? 'INVENTORY_AND_ADVERSE_SELECTION'
                : 'MANDATE_AND_CAPACITY',
            ],
            command: behaviorCommand,
          }
        : null,
      productionOrderCount: commands.filter(
        (command) => command.type === 'submit_order',
      ).length,
    });
  }
  if (
    agent.kind === 'institution' &&
    !agent.openingSignalConsumed &&
    commands.some(
      (command) =>
        command.type === 'submit_order' &&
        (
          command.ecologyIntentKind ===
            'signal_execution' ||
          command.parentOrderId?.startsWith(
            'low_conviction_flow:',
          )
        ) &&
        (agent.openingSignals[command.symbol] ?? 0) !== 0,
    )
  ) {
    agent.openingSignalConsumed = true;
  }
  if (
    (
      agent.kind === 'institution' ||
      agent.kind === 'retail'
    ) &&
    commands.some((command) => command.type === 'submit_order')
  ) {
    agent.lastOrderMs = state.nowMs;
  }
  agent.decisionSequence += 1;
  agent.lastDecisionMs = state.nowMs;
  return commands;
}

function completeSettledPublicTradeChain(state, chain) {
  const { trade, event, journal, fact, memory } = chain ?? {};
  return Boolean(
    trade &&
      typeof trade.id === 'string' &&
      trade.source === 'realtime_order_book' &&
      isNonNegativeInteger(trade.virtualMs) &&
      trade.virtualMs <= state.nowMs &&
      isPositiveInteger(trade.priceTicks) &&
      isPositiveInteger(trade.quantity) &&
      isPositiveInteger(trade.commitSeq) &&
      event?.id === trade.eventId &&
      event.type === 'realtime_market_trade' &&
      event.status === 'settled' &&
      event.visibility === 'public' &&
      event.commitSeq === trade.commitSeq &&
      event.ledgerEntryIds?.length === 1 &&
      journal?.id === event.ledgerEntryIds[0] &&
      journal.eventId === event.id &&
      journal.commitSeq === trade.commitSeq &&
      fact?.id === trade.factId &&
      fact.eventId === event.id &&
      fact.visibility === 'public' &&
      fact.commitSeq === trade.commitSeq &&
      memory?.factId === fact.id &&
      memory.visibility === 'public' &&
      memory.commitSeq === trade.commitSeq
  );
}

function appendIndexedRecords(index, name, values, keyOf) {
  const previous = index.sources[name];
  if (
    !previous ||
    previous.values !== values ||
    values.length < previous.length
  ) {
    index.maps[name] = new Map();
    index.sources[name] = { values, length: 0 };
  }
  const source = index.sources[name];
  const map = index.maps[name];
  for (let position = source.length; position < values.length; position += 1) {
    const value = values[position];
    const key = keyOf(value);
    if (key === null || key === undefined) continue;
    if (name === 'memories') {
      const records = map.get(key) ?? [];
      records.push(value);
      map.set(key, records);
    } else {
      map.set(key, value);
    }
  }
  source.length = values.length;
}

function settledPublicTradeIndex(state) {
  let index = publicTradeIndexCache.get(state);
  if (!index) {
    index = {
      sources: {},
      maps: {
        trades: new Map(),
        events: new Map(),
        journals: new Map(),
        facts: new Map(),
        memories: new Map(),
      },
      archiveDigest: null,
      archivedChains: new Map(),
    };
    publicTradeIndexCache.set(state, index);
  }
  appendIndexedRecords(
    index,
    'trades',
    state.world.market.trades,
    (record) => record?.id,
  );
  appendIndexedRecords(
    index,
    'events',
    state.world.eventLog,
    (record) => record?.id,
  );
  appendIndexedRecords(
    index,
    'journals',
    state.world.ledger,
    (record) => record?.id,
  );
  appendIndexedRecords(
    index,
    'facts',
    state.world.facts,
    (record) => record?.id,
  );
  appendIndexedRecords(
    index,
    'memories',
    state.world.memories,
    (record) => record?.factId,
  );

  const archive = state.realtimeAuditArchive;
  const archiveDigest = [
    archive?.rollingDigest ?? '',
    archive?.totalArchivedBundles ?? 0,
    archive?.recentBundles?.length ?? 0,
    archive?.recentBundles?.at(-1)?.lastTradeId ?? '',
  ].join(':');
  if (archiveDigest !== index.archiveDigest) {
    index.archivedChains = new Map(
      (archive?.recentBundles ?? []).flatMap((bundle) =>
        (bundle.chainReferences ?? []).map((chain) => [
          chain.trade?.id,
          chain,
        ]),
      ),
    );
    index.archiveDigest = archiveDigest;
  }
  return index;
}

function resolveSettledPublicTradeChain(state, tradeId) {
  const index = settledPublicTradeIndex(state);
  const trade = index.maps.trades.get(tradeId);
  if (trade) {
    const event = index.maps.events.get(trade.eventId);
    const journal = index.maps.journals.get(event?.ledgerEntryIds?.[0]);
    const fact = index.maps.facts.get(trade.factId);
    const memories = index.maps.memories.get(trade.factId) ?? [];
    const chain = {
      trade,
      event,
      journal,
      fact,
      memory: memories[0],
    };
    if (
      memories.length === 1 &&
      completeSettledPublicTradeChain(state, chain)
    ) {
      return chain;
    }
    return null;
  }
  const chain = index.archivedChains.get(tradeId);
  if (completeSettledPublicTradeChain(state, chain)) {
    return chain;
  }
  return null;
}

function publicTradeExists(state, trade) {
  const chain = resolveSettledPublicTradeChain(state, trade?.id);
  return publicTradeMatchesChain(state, trade, chain);
}

function publicTradeMatchesChain(state, trade, chain) {
  return Boolean(
    completeSettledPublicTradeChain(state, chain) &&
      chain.trade.commitSeq === trade.commitSeq &&
      chain.trade.virtualMs === trade.virtualMs &&
      chain.trade.symbol === trade.symbol &&
      chain.trade.side === trade.side &&
      chain.trade.priceTicks === trade.priceTicks &&
      chain.trade.quantity === trade.quantity
  );
}

function aggregateTrades(trades) {
  const netSignedQuantity = {};
  for (const trade of trades) {
    const signedQuantity =
      trade.side === 'buy' ? trade.quantity : -trade.quantity;
    netSignedQuantity[trade.symbol] = saturatingSafeAdd(
      netSignedQuantity[trade.symbol] ?? 0,
      signedQuantity,
    );
  }
  return {
    firstTradeId: trades[0].id,
    lastTradeId: trades.at(-1).id,
    firstTradeMs: trades[0].virtualMs,
    lastTradeMs: trades.at(-1).virtualMs,
    firstPriceTicks: trades[0].priceTicks,
    lastPriceTicks: trades.at(-1).priceTicks,
    minimumPriceTicks: Math.min(
      ...trades.map((trade) => trade.priceTicks),
    ),
    maximumPriceTicks: Math.max(
      ...trades.map((trade) => trade.priceTicks),
    ),
    firstCommitSeq: trades[0].commitSeq,
    lastCommitSeq: trades.at(-1).commitSeq,
    tradeCount: trades.length,
    netSignedQuantity,
  };
}

function compactObservedTrade(trade) {
  return {
    id: trade.id,
    factId: trade.factId,
    virtualMs: trade.virtualMs,
    symbol: trade.symbol,
    side: trade.side,
    priceTicks: trade.priceTicks,
    quantity: trade.quantity,
    commitSeq: trade.commitSeq,
  };
}

function observedTradeFactIsValid(state, trade) {
  if (
    !trade ||
    typeof trade.id !== 'string' ||
    typeof trade.factId !== 'string' ||
    !isNonNegativeInteger(trade.virtualMs) ||
    trade.virtualMs > state.nowMs ||
    !Object.hasOwn(state.books, trade.symbol) ||
    (trade.side !== 'buy' && trade.side !== 'sell') ||
    !isPositiveInteger(trade.priceTicks) ||
    !isPositiveInteger(trade.quantity) ||
    !isPositiveInteger(trade.commitSeq) ||
    trade.commitSeq > state.commitSeq
  ) {
    return false;
  }
  const chain = resolveSettledPublicTradeChain(
    state,
    trade.id,
  );
  if (chain) {
    const authority = chain.trade;
    return (
      authority.virtualMs === trade.virtualMs &&
      authority.factId === trade.factId &&
      authority.symbol === trade.symbol &&
      authority.side === trade.side &&
      authority.priceTicks === trade.priceTicks &&
      authority.quantity === trade.quantity &&
      authority.commitSeq === trade.commitSeq
    );
  }
  const sequence = realtimeTradeSequence(trade.id);
  const archive = state.realtimeAuditArchive;
  return Boolean(
    sequence &&
      isPositiveInteger(archive?.firstTradeSequence) &&
      isPositiveInteger(archive?.lastTradeSequence) &&
      sequence >= archive.firstTradeSequence &&
      sequence <= archive.lastTradeSequence
  );
}

function aggregateObservedTrades(state, observedTradeIds) {
  const chains = observedTradeIds.map((tradeId) =>
    resolveSettledPublicTradeChain(state, tradeId),
  );
  if (chains.some((chain) => !chain)) return null;
  return aggregateTrades(chains.map((chain) => chain.trade));
}

function applyObservedAggregate(pending, aggregate) {
  Object.assign(pending, aggregate);
}

function appendObservedTrade(pending, trade) {
  pending.observedTrades.push(compactObservedTrade(trade));
  pending.lastTradeId = trade.id;
  pending.lastTradeMs = trade.virtualMs;
  pending.lastPriceTicks = trade.priceTicks;
  pending.minimumPriceTicks = Math.min(
    pending.minimumPriceTicks,
    trade.priceTicks,
  );
  pending.maximumPriceTicks = Math.max(
    pending.maximumPriceTicks,
    trade.priceTicks,
  );
  pending.lastCommitSeq = trade.commitSeq;
  pending.tradeCount += 1;
  const signedQuantity =
    trade.side === 'buy' ? trade.quantity : -trade.quantity;
  pending.netSignedQuantity[trade.symbol] = saturatingSafeAdd(
    pending.netSignedQuantity[trade.symbol] ?? 0,
    signedQuantity,
  );
}

function behaviorAgentIdFromParentOrderId(
  state,
  parentOrderId,
  ownerId,
) {
  const ownerAgents = Object.values(
    state.agentEcology.agents,
  ).filter((agent) => agent.accountId === ownerId);
  if (typeof parentOrderId !== 'string') {
    return ownerAgents.length === 1
      ? ownerAgents[0].id
      : null;
  }
  if (parentOrderId.startsWith('behavior:')) {
    const agentId = parentOrderId.split(':')[1];
    const agent = state.agentEcology.agents[agentId];
    return agent?.accountId === ownerId ? agentId : null;
  }
  return (
    Object.values(state.agentEcology.agents).find(
      (agent) =>
        agent.accountId === ownerId &&
        (
          parentOrderId.startsWith(`maker:${agent.id}:`) ||
          parentOrderId.includes(`:${agent.id}:`)
        ),
    )?.id ?? null
  );
}

function anonymousVenueRelationshipCohort(trade, ownSide) {
  return (
    'venue:continuous_lob:' +
    (
      trade.side === ownSide
        ? 'liquidity_taker'
        : 'liquidity_provider'
    )
  );
}

function addCapacityTotals(
  totals,
  {
    quantity,
    notionalCents,
    adverseTicksQuantity,
    feeCents,
    submittedMs,
    fillMs,
  },
) {
  totals.filledUnits = saturatingSafeAdd(
    totals.filledUnits,
    quantity,
  );
  totals.filledNotionalCents = saturatingSafeAdd(
    totals.filledNotionalCents,
    notionalCents,
  );
  totals.adverseTicksQuantity = saturatingSafeAdd(
    totals.adverseTicksQuantity,
    adverseTicksQuantity,
  );
  totals.feeCents = saturatingSafeAdd(
    totals.feeCents,
    feeCents,
  );
  totals.firstSubmitMs =
    totals.firstSubmitMs === null
      ? submittedMs
      : Math.min(totals.firstSubmitMs, submittedMs);
  totals.lastFillMs =
    totals.lastFillMs === null
      ? fillMs
      : Math.max(totals.lastFillMs, fillMs);
}

function recordCapacityTrade(
  state,
  trade,
  { trackLegacyCoverage = false } = {},
) {
  const ledger = state.agentEcology?.capacityLedger;
  if (!ledger) {
    throw new Error('Agent capacity ledger is required.');
  }
  const sequence = realtimeTradeSequence(trade?.id);
  if (!sequence) {
    throw new Error(
      `Invalid realtime capacity trade: ${trade?.id}`,
    );
  }
  if (sequence <= ledger.lastTradeSequence) return false;
  const quantity = trade.quantity;
  const notionalCents = trade.priceTicks * quantity;
  const resolvedOrders = trade.orderIds
    .map((orderId) =>
      findOrderOrReference(
        state,
        orderId,
        trade.symbol,
      ),
    )
    .filter(Boolean);
  let marketAdverseTicksQuantity = 0;
  let marketFirstSubmitMs = trade.virtualMs;
  for (const participant of [
    {
      accountId: trade.buyerId,
      side: 'buy',
      feeCents: trade.feeCents,
    },
    {
      accountId: trade.sellerId,
      side: 'sell',
      feeCents: 0,
    },
  ]) {
    const accountTotals =
      ledger.byAccount[participant.accountId];
    if (!accountTotals) {
      throw new Error(
        `Unknown capacity account: ${participant.accountId}`,
      );
    }
    const participantOrderId =
      participant.side === trade.side
        ? trade.incomingOrderId
        : trade.restingOrderId;
    const order = resolvedOrders.find(
      (candidate) =>
        candidate.ownerId === participant.accountId &&
        candidate.side === participant.side,
    );
    const orderIndex = trade.orderIds.indexOf(
      participantOrderId ?? order?.id,
    );
    const parentOrderId =
      order?.parentOrderId ??
      (
        orderIndex >= 0
          ? trade.parentOrderIds?.[orderIndex]
          : null
      );
    const arrivalPriceTicks =
      order?.arrivalPriceTicks ??
      (
        participantOrderId === trade.incomingOrderId &&
        isPositiveInteger(trade.incomingArrivalPriceTicks)
          ? trade.incomingArrivalPriceTicks
          : trade.priceTicks
      );
    const adverseTicks =
      participant.side === 'buy'
        ? Math.max(
            0,
            trade.priceTicks - arrivalPriceTicks,
          )
        : Math.max(
            0,
            arrivalPriceTicks - trade.priceTicks,
          );
    const adverseTicksQuantity =
      adverseTicks * quantity;
    const submittedMs =
      order?.submittedMs ?? trade.virtualMs;
    if (
      trackLegacyCoverage &&
      (
        !order ||
        !isPositiveInteger(order.arrivalPriceTicks) ||
        !isNonNegativeInteger(order.submittedMs)
      )
    ) {
      ledger.coverage.executionFallbackParticipantCount += 1;
    }
    marketAdverseTicksQuantity =
      saturatingSafeAdd(
        marketAdverseTicksQuantity,
        adverseTicksQuantity,
      );
    marketFirstSubmitMs = Math.min(
      marketFirstSubmitMs,
      submittedMs,
    );
    const update = {
      quantity,
      notionalCents,
      adverseTicksQuantity,
      feeCents: participant.feeCents,
      submittedMs,
      fillMs: trade.virtualMs,
    };
    addCapacityTotals(accountTotals, update);
    sealCapacityTotals(
      `account:${participant.accountId}`,
      accountTotals,
    );
    const agentId =
      typeof order?.ecologyAgentId === 'string' &&
      state.agentEcology.agents[
        order.ecologyAgentId
      ]?.accountId === participant.accountId
        ? order.ecologyAgentId
        : behaviorAgentIdFromParentOrderId(
            state,
            parentOrderId,
            participant.accountId,
          );
    if (agentId && ledger.byAgent[agentId]) {
      addCapacityTotals(
        ledger.byAgent[agentId],
        update,
      );
      sealCapacityTotals(
        `agent:${agentId}`,
        ledger.byAgent[agentId],
      );
    } else if (
      trackLegacyCoverage &&
      Object.values(state.agentEcology.agents).some(
        (agent) =>
          agent.accountId === participant.accountId,
      )
    ) {
      ledger.coverage.unattributedAgentParticipantCount += 1;
    }
  }
  ledger.market.tradeCount = saturatingSafeAdd(
    ledger.market.tradeCount,
    1,
  );
  addCapacityTotals(ledger.market, {
    quantity,
    notionalCents,
    adverseTicksQuantity:
      marketAdverseTicksQuantity,
    feeCents: trade.feeCents,
    submittedMs: marketFirstSubmitMs,
    fillMs: trade.virtualMs,
  });
  sealCapacityTotals('market', ledger.market);
  ledger.lastTradeId = trade.id;
  ledger.lastTradeSequence = sequence;
  ledger.lastTradeCommitSeq = trade.commitSeq;
  if (trackLegacyCoverage) {
    ledger.coverage.status =
      ledger.coverage.unobservableArchivedChainCount === 0 &&
      ledger.coverage.unattributedAgentParticipantCount === 0 &&
      ledger.coverage.executionFallbackParticipantCount === 0
        ? 'complete'
        : 'legacy_partial';
  }
  sealCapacityLedger(ledger);
  return true;
}

function recordSettledBehaviorTrade(state, trade) {
  const markPrices = Object.fromEntries(
    Object.keys(state.books).map((symbol) => [
      symbol,
      {
        priceTicks: publicLastPriceTicks(state, symbol),
      },
    ]),
  );
  for (const orderId of trade.orderIds) {
    const order = findOrderOrReference(
      state,
      orderId,
      trade.symbol,
    );
    if (!order) continue;
    const attributedAgent =
      typeof order.ecologyAgentId === 'string'
        ? state.agentEcology.agents[
            order.ecologyAgentId
          ]
        : null;
    const agentId =
      attributedAgent?.accountId === order.ownerId
        ? attributedAgent.id
        : behaviorAgentIdFromParentOrderId(
            state,
            order.parentOrderId,
            order.ownerId,
          );
    const agent = state.agentEcology.agents[agentId];
    if (!agent?.behaviorState) continue;
    const side = order.side;
    const counterpartyAccountId =
      anonymousVenueRelationshipCohort(trade, side);
    // Exchange fees are charged to the buyer in the authoritative settlement
    // journal. Project that same participant-specific amount into the actor's
    // private performance ledger instead of charging the seller a second time.
    const participantTrade =
      side === 'buy'
        ? trade
        : {
            ...trade,
            feeCents: 0,
          };
    recordBehaviorSettlement(agent.behaviorState, {
      trade: participantTrade,
      side,
      counterpartyAccountId,
      intentId:
        order.parentOrderId ??
        `account_order:${order.id}`,
    });
  }
  for (const agent of Object.values(
    state.agentEcology.agents,
  )) {
    if (!agent.behaviorState) continue;
    refreshBehaviorMarkToMarket(
      agent.behaviorState,
      markPrices,
    );
  }
}

export function recordAgentCommandOutcome(
  state,
  agentId,
  receipt,
) {
  const behavior =
    state.agentEcology?.agents?.[agentId]?.behaviorState;
  if (!behavior) return;
  recordBehaviorReceipt(behavior, receipt);
}

function scheduleMakerLimitTouchResponses(state, trade) {
  if (!state.agentEcology?.enabled) return [];
  const security =
    state.world.market.securities[trade.symbol];
  if (!security) return [];
  const band = securityDailyBand(security);
  if (
    trade.priceTicks !== band.limitUpTicks &&
    trade.priceTicks !== band.limitDownTicks
  ) {
    return [];
  }
  const relockEvidencePending = AGENT_IDS.some((agentId) => {
    const agent = state.agentEcology.agents[agentId];
    const episode = agent?.limitQueueEpisodes?.[trade.symbol];
    return (
      agent?.kind === 'maker' &&
      episode &&
      ['break', 'failed_recovery'].includes(episode.state)
    );
  });
  if (!relockEvidencePending) return [];
  const scheduled = [];
  for (const agentId of AGENT_IDS) {
    const agent = state.agentEcology.agents[agentId];
    if (agent?.kind !== 'maker') continue;
    const responseMs =
      Math.max(state.nowMs, trade.virtualMs) +
      // Public tape/limit-state latency is the maker's market-data path.
      // Fundamental-information delay is a separate authority clock and
      // would let slower retail response events erase the touch first.
      Math.max(1, agent.latencyMs);
    const existing = state.eventQueue.find(
      (event) =>
        event.type === 'agent_decision' &&
        event.actorId === agentId,
    );
    if (existing) {
      if (existing.scheduledMs <= responseMs) continue;
      existing.scheduledMs = responseMs;
      existing.rngKey =
        `${state.world.world.seed}:${existing.scheduledMs}:` +
        `${existing.phasePriority}:${existing.sequence}`;
      scheduled.push(existing);
      continue;
    }
    scheduled.push(
      scheduleEcologyEvent(state, {
        type: 'agent_decision',
        scheduledMs: responseMs,
        phasePriority: state.phasePriority.MAKER_QUOTE,
        actorId: agentId,
        payload: {
          agentId,
          trigger: 'cadence',
        },
      }),
    );
  }
  if (scheduled.length > 0) {
    state.eventQueue.sort(compareEvents);
  }
  return scheduled;
}

/**
 * Converts an already-settled public trade into delayed, coalesced response
 * events. A draft intent or a private broker command is deliberately ignored.
 */
export function schedulePublicFlowResponses(
  state,
  trade,
  verifiedChain = null,
) {
  if (
    verifiedChain
      ? !publicTradeMatchesChain(state, trade, verifiedChain)
      : !publicTradeExists(state, trade)
  ) {
    return [];
  }
  recordCapacityTrade(state, trade);
  recordSettledBehaviorTrade(state, trade);
  if (!state.agentEcology?.enabled) return [];
  const makerLimitResponses =
    scheduleMakerLimitTouchResponses(state, trade);
  if (
    state.agentEcology.publicFlow.some(
      (record) => record.tradeId === trade.id,
    )
  ) {
    return makerLimitResponses;
  }
  const publicRecord = {
    tradeId: trade.id,
    factId: trade.factId,
    virtualMs: trade.virtualMs,
    symbol: trade.symbol,
    side: trade.side,
    priceTicks: trade.priceTicks,
    quantity: trade.quantity,
    commitSeq: trade.commitSeq,
  };
  state.agentEcology.publicFlow.push(publicRecord);
  if (state.agentEcology.publicFlow.length > MAX_PUBLIC_FLOW) {
    state.agentEcology.publicFlow.splice(
      0,
      state.agentEcology.publicFlow.length - MAX_PUBLIC_FLOW,
    );
  }

  const scheduled = [...makerLimitResponses];
  for (const agentId of PUBLIC_RESPONSE_AGENT_IDS) {
    const agent = state.agentEcology.agents[agentId];
    const existing = state.agentEcology.pendingResponses[agentId];
    if (existing) {
      // The first unseen trade fixes the observation deadline. Later trades
      // remain in the bounded public tape and are consumed at an eligible
      // cadence; they must not slide this response forever. A trade may join
      // the batch only when its own information delay has already matured by
      // the fixed deadline.
      if (
        trade.virtualMs + agent.informationDelayMs <=
          existing.scheduledMs &&
        existing.observedTradeIds.length <
          MAX_OBSERVED_TRADES_PER_RESPONSE
      ) {
        existing.observedTradeIds.push(trade.id);
        appendObservedTrade(existing, trade);
      } else if (
        !existing.deferredObservedTradeIds.includes(trade.id) &&
        existing.deferredObservedTradeIds.length <
          MAX_OBSERVED_TRADES_PER_RESPONSE
      ) {
        existing.deferredObservedTradeIds.push(trade.id);
        existing.deferredObservedTrades.push(
          compactObservedTrade(trade),
        );
      }
      continue;
    }
    const scheduledMs =
      Math.max(
        Math.max(state.nowMs, trade.virtualMs) +
          agent.informationDelayMs,
        agent.lastObservedTradeMs < 0
          ? 0
          : agent.lastObservedTradeMs +
            MIN_PUBLIC_RESPONSE_INTERVAL_MS,
      );
    const event = scheduleEcologyEvent(state, {
      type: 'public_flow_response',
      scheduledMs,
      phasePriority: state.phasePriority.PUBLIC_FLOW_RESPONSE,
      actorId: agentId,
      payload: {
        agentId,
        trigger: 'public_flow',
      },
    });
    const observedTradeIds = [trade.id];
    const pending = {
      eventId: event.id,
      scheduledMs,
      observedTradeIds,
      observedTrades: [compactObservedTrade(trade)],
      deferredObservedTradeIds: [],
      deferredObservedTrades: [],
    };
    applyObservedAggregate(
      pending,
      aggregateTrades([trade]),
    );
    state.agentEcology.pendingResponses[agentId] = pending;
    scheduled.push(event);
  }
  return scheduled;
}

export function scheduleDeferredPublicFlowResponse(
  state,
  agentId,
  completedPending,
) {
  const agent = state.agentEcology?.agents?.[agentId];
  if (
    !agent ||
    !PUBLIC_RESPONSE_AGENT_IDS.includes(agentId) ||
    state.agentEcology.pendingResponses[agentId]
  ) {
    return null;
  }
  const observedTrades = (
    completedPending?.deferredObservedTrades ?? []
  )
    .filter((trade) => observedTradeFactIsValid(state, trade))
    .slice(0, MAX_OBSERVED_TRADES_PER_RESPONSE);
  if (observedTrades.length === 0) return null;
  const scheduledMs = Math.max(
    state.nowMs,
    ...observedTrades.map(
      (trade) =>
        trade.virtualMs + agent.informationDelayMs,
    ),
    agent.lastObservedTradeMs < 0
      ? 0
      : agent.lastObservedTradeMs +
        MIN_PUBLIC_RESPONSE_INTERVAL_MS,
  );
  const event = scheduleEcologyEvent(state, {
    type: 'public_flow_response',
    scheduledMs,
    phasePriority: state.phasePriority.PUBLIC_FLOW_RESPONSE,
    actorId: agentId,
    payload: {
      agentId,
      trigger: 'public_flow',
    },
  });
  const pending = {
    eventId: event.id,
    scheduledMs,
    observedTradeIds: observedTrades.map(
      (trade) => trade.id,
    ),
    observedTrades: cloneJson(observedTrades),
    deferredObservedTradeIds: [],
    deferredObservedTrades: [],
  };
  applyObservedAggregate(
    pending,
    aggregateTrades(observedTrades),
  );
  state.agentEcology.pendingResponses[agentId] = pending;
  return event;
}

function findOrderOrReference(
  state,
  orderId,
  symbol = null,
) {
  if (symbol && state.books[symbol]?.orders[orderId]) {
    return state.books[symbol].orders[orderId];
  }
  if (!symbol) {
    for (const book of Object.values(state.books)) {
      if (book.orders[orderId]) return book.orders[orderId];
    }
  }
  return orderReferences(state).get(orderId) ?? null;
}

function accountEquityCents(state, account) {
  return (
    account.cashCents +
    Object.entries(account.holdings).reduce(
      (sum, [symbol, quantity]) =>
        sum +
        quantity * cents(state.world.market.securities[symbol].lastPrice),
      0,
    )
  );
}

function capacityAgentForOrder(state, order) {
  if (!order) return null;
  if (typeof order.ecologyAgentId === 'string') {
    const attributed =
      state.agentEcology?.agents?.[order.ecologyAgentId];
    if (attributed?.accountId === order.ownerId) {
      return attributed.id;
    }
    return null;
  }
  return behaviorAgentIdFromParentOrderId(
    state,
    order.parentOrderId,
    order.ownerId,
  );
}

function capacityLedgerView(state, accountId, agentId) {
  const account = state.accounts[accountId];
  const parentBaseline =
    state.agentEcology?.accountBaselines?.[accountId] ?? {
      cashCents: account.cashCents,
      holdings: cloneJson(account.holdings),
      initialEquityCents: accountEquityCents(state, account),
    };
  if (agentId === null) {
    return {
      cashCents: account.cashCents,
      holdings: account.holdings,
      baseline: parentBaseline,
      drawdownBps: account.drawdownBps ?? 0,
      parentFundingStressBps:
        account.fundingStressBps ?? 0,
    };
  }
  const agent = state.agentEcology?.agents?.[agentId];
  if (
    !agent ||
    agent.accountId !== accountId ||
    !agent.behaviorState?.account
  ) {
    throw new Error(
      `Unknown ecology mandate: ${accountId}/${agentId}`,
    );
  }
  const ledger = agent.behaviorState.account;
  const holdings = Object.fromEntries(
    Object.keys(state.books).map((symbol) => [
      symbol,
      ledger.initialHoldings[symbol] +
        ledger.settledNetUnits[symbol],
    ]),
  );
  const baseline = {
    cashCents: ledger.cashEnvelopeCents,
    holdings: cloneJson(ledger.initialHoldings),
    initialEquityCents: equityCentsFromWorld(
      state.world,
      ledger.cashEnvelopeCents,
      ledger.initialHoldings,
    ),
  };
  const equityCents = equityCentsFromWorld(
    state.world,
    ledger.cashEnvelopeCents +
      ledger.settledNetCashCents,
    holdings,
  );
  return {
    cashCents:
      ledger.cashEnvelopeCents +
      ledger.settledNetCashCents,
    holdings,
    baseline,
    drawdownBps: Math.max(
      0,
      Math.round(
        (baseline.initialEquityCents - equityCents) *
          10_000 /
          Math.max(1, baseline.initialEquityCents),
      ),
    ),
    parentFundingStressBps: 0,
  };
}

/**
 * Capacity is a derived view over actual orders, fills and current funding. It
 * never predicts a settlement or writes back into the order book.
 */
export function evaluateCapacity(
  state,
  accountId,
  agentId = null,
) {
  const account = state.accounts?.[accountId];
  if (!account) throw new Error(`Unknown market account: ${accountId}`);
  const capacityLedger =
    state.agentEcology?.capacityLedger;
  if (!capacityLedger) {
    throw new Error('Agent capacity ledger is required.');
  }
  const capacityTotals =
    agentId === null
      ? capacityLedger.byAccount[accountId]
      : capacityLedger.byAgent[agentId];
  if (!capacityTotals) {
    throw new Error(
      `Unknown capacity attribution: ${accountId}/${agentId}`,
    );
  }
  const consumedDepthUnits =
    capacityTotals.filledUnits;
  const slippageTicksQuantity =
    capacityTotals.adverseTicksQuantity;
  const totalFeesCents = capacityTotals.feeCents;
  const firstSubmitMs = capacityTotals.firstSubmitMs;
  const lastFillMs = capacityTotals.lastFillMs;

  let ownedActiveOrderCount = 0;
  let ownedActiveQuantity = 0;
  let totalActiveQuantity = 0;
  let activeReservationCents = 0;
  const accountHasReservedResources =
    account.reservedCashCents > 0 ||
    Object.values(account.reservedHoldings).some(
      (quantity) => quantity > 0,
    );
  if (agentId !== null || accountHasReservedResources) {
    totalActiveQuantity = Object.values(
      state.books,
    ).reduce(
      (sum, book) =>
        sum + activeBookStats(book).quantity,
      0,
    );
    for (const order of activeOrdersOwnedBy(
      state,
      accountId,
    )) {
      if (
        (
          agentId !== null &&
          capacityAgentForOrder(state, order) !== agentId
        )
      ) {
        continue;
      }
      ownedActiveOrderCount += 1;
      ownedActiveQuantity += order.remainingQty;
      activeReservationCents +=
        order.side === 'buy'
          ? order.priceTicks * order.remainingQty
          : cents(
              state.world.market.securities[order.symbol]
                .lastPrice,
            ) * order.remainingQty;
    }
  }
  const totalPublicVolume =
    capacityLedger.market.filledUnits;
  const ledgerView = capacityLedgerView(
    state,
    accountId,
    agentId,
  );
  const baseline = ledgerView.baseline;
  const equityCents = equityCentsFromWorld(
    state.world,
    ledgerView.cashCents,
    ledgerView.holdings,
  );
  const initialEquityCents = Math.max(1, baseline.initialEquityCents);
  const passiveBenchmarkEquityCents = equityCentsFromWorld(
    state.world,
    baseline.cashCents,
    baseline.holdings,
  );
  const activeTradePnlCents =
    equityCents - passiveBenchmarkEquityCents;
  const slippageBps =
    consumedDepthUnits === 0
      ? 0
      : Number(
          (
            slippageTicksQuantity * 10_000 /
            Math.max(1, capacityTotals.filledNotionalCents)
          ).toFixed(6),
        );
  const mandateFundingStressBps = Math.round(
    activeReservationCents *
      10_000 /
      Math.max(1, equityCents),
  );
  return {
    accountId,
    agentId,
    consumedDepthUnits,
    slippageBps,
    completionTimeMs:
      firstSubmitMs === null || lastFillMs === null
        ? 0
        : Math.max(0, lastFillMs - firstSubmitMs),
    footprintBps:
      totalPublicVolume === 0
        ? 0
        : Number(
            (
              consumedDepthUnits * 10_000 /
              totalPublicVolume
            ).toFixed(6),
          ),
    crowdingBps:
      totalActiveQuantity === 0
        ? 0
        : Number(
            (
              ownedActiveQuantity * 10_000 /
              totalActiveQuantity
            ).toFixed(6),
          ),
    drawdownBps: ledgerView.drawdownBps,
    fundingStressBps: Math.max(
      ledgerView.parentFundingStressBps,
      mandateFundingStressBps,
    ),
    totalFeesCents,
    markToMarketTradePnlCents: activeTradePnlCents,
    equityCents,
    passiveBenchmarkEquityCents,
    activeTradePnlCents,
    initialEquityCents,
    activeReturnBps: Number(
      (
        activeTradePnlCents * 10_000 /
        initialEquityCents
      ).toFixed(6),
    ),
    equityReturnBps: Number(
      (
        (equityCents - initialEquityCents) * 10_000 /
        initialEquityCents
      ).toFixed(6),
    ),
    activeOrderCount: ownedActiveOrderCount,
  };
}

function observedAggregateMatches(state, record) {
  if (
    !record ||
    !Array.isArray(record.observedTradeIds) ||
    !Array.isArray(record.observedTrades) ||
    record.observedTrades.length !==
      record.observedTradeIds.length ||
    new Set(record.observedTradeIds).size !==
      record.observedTradeIds.length ||
    record.observedTrades.some(
      (trade, index) =>
        trade.id !== record.observedTradeIds[index] ||
        !observedTradeFactIsValid(state, trade),
    )
  ) {
    return false;
  }
  const aggregate = aggregateTrades(record.observedTrades);
  const scalarKeys = [
    'firstTradeId',
    'lastTradeId',
    'firstTradeMs',
    'lastTradeMs',
    'firstPriceTicks',
    'lastPriceTicks',
    'minimumPriceTicks',
    'maximumPriceTicks',
    'firstCommitSeq',
    'lastCommitSeq',
    'tradeCount',
  ];
  return Boolean(
    scalarKeys.every((key) => record[key] === aggregate[key]) &&
      sameStringSet(
        Object.keys(record.netSignedQuantity ?? {}),
        Object.keys(aggregate.netSignedQuantity),
      ) &&
      Object.entries(aggregate.netSignedQuantity).every(
        ([symbol, quantity]) =>
          record.netSignedQuantity[symbol] === quantity,
      )
  );
}

function capacityLedgerInvariantErrors(state) {
  const ledger = state.agentEcology?.capacityLedger;
  const errors = [];
  const totalKeys = [
    'filledUnits',
    'filledNotionalCents',
    'adverseTicksQuantity',
    'feeCents',
    'firstSubmitMs',
    'lastFillMs',
    'integrityDigest',
  ];
  const validTotals = (scopeId, totals) =>
    sameStringSet(
      Object.keys(totals ?? {}),
      totalKeys,
    ) &&
    totalKeys.slice(0, 4).every(
      (key) => isNonNegativeInteger(totals[key]),
    ) &&
    totals.filledNotionalCents >= totals.filledUnits &&
    totals.integrityDigest ===
      capacityTotalsIntegrityDigest(scopeId, totals) &&
    (
      (
        totals.firstSubmitMs === null &&
        totals.lastFillMs === null &&
        totals.filledUnits === 0 &&
        totalKeys.slice(1, 4).every(
          (key) => totals[key] === 0,
        )
      ) ||
      (
        isNonNegativeInteger(totals.firstSubmitMs) &&
        isNonNegativeInteger(totals.lastFillMs) &&
        totals.firstSubmitMs <= totals.lastFillMs &&
        totals.lastFillMs <= state.nowMs &&
        totals.filledUnits > 0
      )
    );
  if (
    !ledger ||
    ledger.ruleVersion !== CAPACITY_LEDGER_RULE_VERSION ||
    !sameStringSet(
      Object.keys(ledger.byAccount ?? {}),
      ecologyTrackedAccountIds(state),
    ) ||
    !sameStringSet(
      Object.keys(ledger.byAgent ?? {}),
      AGENT_IDS,
    ) ||
    !ledger.market ||
    !isNonNegativeInteger(ledger.market.tradeCount) ||
    !validTotals(
      'market',
      Object.fromEntries(
        totalKeys.map((key) => [key, ledger.market[key]]),
      ),
    ) ||
    Object.entries(ledger.byAccount ?? {}).some(
      ([accountId, totals]) =>
        !validTotals(`account:${accountId}`, totals),
    ) ||
    Object.entries(ledger.byAgent ?? {}).some(
      ([agentId, totals]) =>
        !validTotals(`agent:${agentId}`, totals),
    ) ||
    !isNonNegativeInteger(ledger.lastTradeSequence) ||
    !isNonNegativeInteger(ledger.lastTradeCommitSeq) ||
    ledger.lastTradeCommitSeq > state.commitSeq ||
    !ledger.coverage ||
    !sameStringSet(
      Object.keys(ledger.coverage),
      [
        'status',
        'unobservableArchivedChainCount',
        'unattributedAgentParticipantCount',
        'executionFallbackParticipantCount',
        'priorArchiveDigest',
      ],
    ) ||
    ![
      'complete',
      'legacy_partial',
    ].includes(ledger.coverage.status) ||
    !isNonNegativeInteger(
      ledger.coverage.unobservableArchivedChainCount,
    ) ||
    !isNonNegativeInteger(
      ledger.coverage.unattributedAgentParticipantCount,
    ) ||
    !isNonNegativeInteger(
      ledger.coverage.executionFallbackParticipantCount,
    ) ||
    typeof ledger.coverage.priorArchiveDigest !== 'string' ||
    !/^[0-9a-f]{8}$/.test(
      ledger.coverage.priorArchiveDigest,
    ) ||
    typeof ledger.integrityDigest !== 'string' ||
    ledger.integrityDigest !==
      capacityLedgerIntegrityDigest(ledger)
  ) {
    return ['INVALID_CAPACITY_LEDGER_SCHEMA'];
  }
  if (
    ledger.lastTradeSequence === 0
      ? (
          ledger.lastTradeId !== null ||
          ledger.lastTradeCommitSeq !== 0 ||
          ledger.market.tradeCount !== 0
        )
      : (
          realtimeTradeSequence(ledger.lastTradeId) !==
            ledger.lastTradeSequence ||
          ledger.lastTradeCommitSeq < 1 ||
          ledger.market.tradeCount < 1
        )
  ) {
    errors.push('INVALID_CAPACITY_LEDGER_CURSOR');
  }
  if (
    ledger.market.tradeCount > ledger.market.filledUnits
  ) {
    errors.push('INVALID_CAPACITY_LEDGER_CARDINALITY');
  }
  const incompleteCoverage =
    ledger.coverage.unobservableArchivedChainCount > 0 ||
    ledger.coverage.unattributedAgentParticipantCount > 0 ||
    ledger.coverage.executionFallbackParticipantCount > 0;
  if (
    (
      ledger.coverage.status === 'complete' &&
      incompleteCoverage
    ) ||
    (
      ledger.coverage.status === 'legacy_partial' &&
      !incompleteCoverage
    )
  ) {
    errors.push('INVALID_CAPACITY_LEDGER_COVERAGE');
  }
  const accountTotals = Object.values(ledger.byAccount);
  const sumAccount = (key) =>
    accountTotals.reduce(
      (sum, totals) => sum + totals[key],
      0,
    );
  if (
    sumAccount('filledUnits') !==
      ledger.market.filledUnits * 2 ||
    sumAccount('filledNotionalCents') !==
      ledger.market.filledNotionalCents * 2 ||
    sumAccount('adverseTicksQuantity') !==
      ledger.market.adverseTicksQuantity ||
    sumAccount('feeCents') !== ledger.market.feeCents
  ) {
    errors.push('CAPACITY_LEDGER_MARKET_MISMATCH');
  }
  for (const accountId of Object.keys(ledger.byAccount)) {
    const attributed = AGENT_IDS
      .filter(
        (agentId) =>
          state.agentEcology.agents[agentId].accountId ===
          accountId,
      )
      .map((agentId) => ledger.byAgent[agentId]);
    for (const key of totalKeys.slice(0, 4)) {
      if (
        attributed.reduce(
          (sum, totals) => sum + totals[key],
          0,
        ) > ledger.byAccount[accountId][key]
      ) {
        errors.push(
          `CAPACITY_LEDGER_MANDATE_MISMATCH:${accountId}:${key}`,
        );
      }
    }
  }
  let liveRealtimeTradeCount = 0;
  let latestLiveTrade = null;
  for (const trade of state.world.market.trades) {
    if (trade.source !== 'realtime_order_book') continue;
    liveRealtimeTradeCount += 1;
    latestLiveTrade = trade;
  }
  const latestArchivedTrade =
    state.realtimeAuditArchive?.recentBundles
      ?.at(-1)
      ?.chainReferences?.at(-1)?.trade;
  const latestKnownTrade =
    (realtimeTradeSequence(latestLiveTrade?.id) ?? 0) >=
    (
      realtimeTradeSequence(latestArchivedTrade?.id) ?? 0
    )
      ? latestLiveTrade
      : latestArchivedTrade;
  const maximumKnownTradeSequence =
    realtimeTradeSequence(latestKnownTrade?.id) ?? 0;
  const authorityTradeCount =
    (state.realtimeAuditArchive?.totalArchivedChains ?? 0) +
    liveRealtimeTradeCount;
  if (
    ledger.lastTradeSequence !== maximumKnownTradeSequence ||
    ledger.lastTradeId !== (latestKnownTrade?.id ?? null) ||
    ledger.lastTradeCommitSeq !==
      (latestKnownTrade?.commitSeq ?? 0) ||
    ledger.market.tradeCount +
      ledger.coverage.unobservableArchivedChainCount !==
      authorityTradeCount
  ) {
    errors.push('CAPACITY_LEDGER_AUTHORITY_MISMATCH');
  }
  return errors;
}

function limitQueueEpisodeErrors(
  state,
  agent,
  symbols,
) {
  const episodes = agent?.limitQueueEpisodes;
  if (
    !episodes ||
    Array.isArray(episodes) ||
    typeof episodes !== 'object'
  ) {
    return ['INVALID_LIMIT_QUEUE_EPISODE_MAP'];
  }
  const errors = [];
  for (const [symbol, episode] of Object.entries(episodes)) {
    const security =
      state.world.market.securities?.[symbol];
    const band = security
      ? securityDailyBand(security)
      : null;
    const expectedLimitTicks =
      episode?.direction === 'up'
        ? band?.limitUpTicks
        : episode?.direction === 'down'
          ? band?.limitDownTicks
          : null;
    if (
      !symbols.includes(symbol) ||
      !episode ||
      Array.isArray(episode) ||
      episode.version !==
        LIMIT_QUEUE_EPISODE_VERSION ||
      typeof episode.episodeId !== 'string' ||
      episode.episodeId.length === 0 ||
      episode.symbol !== symbol ||
      (
        episode.direction !== 'up' &&
        episode.direction !== 'down'
      ) ||
      episode.limitPriceTicks !== expectedLimitTicks ||
      !LIMIT_QUEUE_EPISODE_STATES.has(episode.state) ||
      !isNonNegativeInteger(episode.stateSinceMs) ||
      episode.stateSinceMs > state.nowMs ||
      !isNonNegativeInteger(episode.lastTransitionMs) ||
      episode.lastTransitionMs > episode.stateSinceMs ||
      !isPositiveInteger(episode.transitionSequence) ||
      !isNonNegativeInteger(episode.finiteBudgetUnits) ||
      !isNonNegativeInteger(episode.usedBudgetUnits) ||
      episode.usedBudgetUnits >
        episode.finiteBudgetUnits ||
      !isNonNegativeInteger(
        episode.remainingReplenishmentUnits,
      ) ||
      episode.remainingReplenishmentUnits >
        episode.finiteBudgetUnits -
          episode.usedBudgetUnits ||
      !(
        episode.activeLayerKey === null ||
        (
          typeof episode.activeLayerKey === 'string' &&
          episode.activeLayerKey.length > 0
        )
      ) ||
      typeof episode.transitionReason !== 'string' ||
      episode.transitionReason.length === 0 ||
      !isNonNegativeInteger(
        episode.lastObservedCommitSeq,
      ) ||
      episode.lastObservedCommitSeq > state.commitSeq ||
      (
        [
          'consensus_lock',
          'stable_lock',
          'relock',
        ].includes(episode.state) &&
        episode.activeLayerKey === null
      ) ||
      (
        [
          'approach',
          'touched_unlocked',
          'break',
          'exhaustion',
          'failed_recovery',
        ].includes(episode.state) &&
        episode.activeLayerKey !== null
      )
    ) {
      errors.push(
        `INVALID_LIMIT_QUEUE_EPISODE:${agent.id}:${symbol}`,
      );
    }
  }
  return errors;
}

export function agentEcologyInvariantErrors(state) {
  const errors = [];
  const ecology = state.agentEcology;
  const legacySchema =
    ecology?.ruleVersion === LEGACY_AGENT_RULE_VERSION;
  const expectedAgentIds = legacySchema
    ? LEGACY_AGENT_IDS
    : AGENT_IDS;
  if (
    !ecology ||
    (
      ecology.ruleVersion !== AGENT_RULE_VERSION &&
      !legacySchema
    ) ||
    typeof ecology.enabled !== 'boolean' ||
    ecology.maxRecentActivity !== MAX_RECENT_ACTIVITY ||
    ecology.maxPublicFlow !== MAX_PUBLIC_FLOW ||
    ecology.maxObservedTradesPerResponse !==
      MAX_OBSERVED_TRADES_PER_RESPONSE ||
    !ecology.agents ||
    !sameStringSet(
      Object.keys(ecology.agents),
      expectedAgentIds,
    ) ||
    !ecology.accountBaselines ||
    !sameStringSet(
      Object.keys(ecology.accountBaselines),
      ecologyTrackedAccountIds(state),
    ) ||
    !Array.isArray(ecology.recentActivity) ||
    ecology.recentActivity.length > MAX_RECENT_ACTIVITY ||
    !Array.isArray(ecology.publicFlow) ||
    ecology.publicFlow.length > MAX_PUBLIC_FLOW ||
    !ecology.pendingResponses ||
    Array.isArray(ecology.pendingResponses)
  ) {
    return ['INVALID_AGENT_ECOLOGY_SCHEMA'];
  }
  const symbols = Object.keys(state.books);
  if (!legacySchema) {
    errors.push(...capacityLedgerInvariantErrors(state));
  }
  for (const agentId of expectedAgentIds) {
    const agent = ecology.agents[agentId];
    const template = AGENT_TEMPLATES[agentId];
    const expectedFundamentals = createFundamentalSnapshot(
      state.world,
      {
        actor: template,
        nowMs: agent?.lastFundamentalRefreshMs ?? 0,
      },
    );
    const sourceFactsBySymbol = Object.fromEntries(
      symbols.map((symbol) => [
        symbol,
        (agent?.fundamentalSourceFactIds?.[symbol] ?? []).map(
          (factId) =>
            state.world.facts.find((fact) => fact.id === factId),
        ),
      ]),
    );
    const validFundamentalSources = symbols.every((symbol) => {
      const sourceIds =
        agent?.fundamentalSourceFactIds?.[symbol];
      const sourceFacts = sourceFactsBySymbol[symbol];
      return Boolean(
        Array.isArray(sourceIds) &&
          sourceIds.length <=
            MAX_FUNDAMENTAL_SOURCES_PER_SYMBOL &&
          new Set(sourceIds).size === sourceIds.length &&
          sourceFacts.every(
            (fact) =>
              fact &&
              fact.authority === 'world_fact' &&
              fact.visibility === 'public' &&
              fact.confidence === 1 &&
              fact.entityId ===
                state.world.market.securities[symbol].issuerId &&
              FUNDAMENTAL_FACT_TYPES.includes(fact.type) &&
              fact.tick <= state.world.world.tick,
          ) &&
          sameStringSet(
            sourceIds,
            expectedFundamentals
              .fundamentalSourceFactIds[symbol],
          ) &&
          agent?.delayedFundamentals?.[symbol] ===
            expectedFundamentals.delayedFundamentals[symbol] &&
          sameJson(
            agent?.valuationBands?.[symbol],
            expectedFundamentals.valuationBands[symbol],
          )
      );
    });
    const expectedLastFundamentalTick =
      expectedFundamentals.lastFundamentalTick;
    const limitQueueErrors = legacySchema
      ? []
      : limitQueueEpisodeErrors(
          state,
          agent,
          symbols,
        );
    if (
      !agent ||
      agent.id !== agentId ||
      (
        legacySchema &&
        (
          Object.hasOwn(agent, 'behaviorState') ||
          Object.hasOwn(agent, 'accountAllocationBps')
        )
      ) ||
      agent.accountId !== (template.accountId ?? agentId) ||
      (
        !legacySchema &&
        agent.accountAllocationBps !==
          (template.accountAllocationBps ?? 10_000)
      ) ||
      agent.kind !== template.kind ||
      agent.strategy !== template.strategy ||
      agent.brokerId !== template.brokerId ||
      agent.cadenceMs !== template.cadenceMs ||
      agent.cadenceJitterMs !== template.cadenceJitterMs ||
      agent.initialOffsetMs !== template.initialOffsetMs ||
      agent.informationDelayMs !== template.informationDelayMs ||
      agent.fundamentalNoiseBps !==
        template.fundamentalNoiseBps ||
      !sameJson(
        agent.valuationMethodWeightsBps,
        template.valuationMethodWeightsBps,
      ) ||
      !isPositiveInteger(agent.riskBudgetCents) ||
      !isNonNegativeInteger(agent.decisionSequence) ||
      !(
        agent.lastDecisionMs === null ||
        (
          isNonNegativeInteger(agent.lastDecisionMs) &&
          agent.lastDecisionMs <= state.nowMs
        )
      ) ||
      !(
        agent.lastOrderMs === null ||
        (
          isNonNegativeInteger(agent.lastOrderMs) &&
          agent.lastOrderMs <= state.nowMs
        )
      ) ||
      !isNonNegativeInteger(agent.lastFundamentalRefreshMs) ||
      agent.lastFundamentalRefreshMs > state.nowMs ||
      !isNonNegativeInteger(agent.initialEquityCents) ||
      !sameStringSet(Object.keys(agent.targetHoldings ?? {}), symbols) ||
      !sameStringSet(
        Object.keys(agent.delayedFundamentals ?? {}),
        symbols,
      ) ||
      !sameStringSet(
        Object.keys(agent.fundamentalSourceFactIds ?? {}),
        symbols,
      ) ||
      !sameStringSet(
        Object.keys(agent.openingSignals ?? {}),
        symbols,
      ) ||
      typeof agent.openingSignalConsumed !== 'boolean' ||
      Object.values(agent.openingSignals ?? {}).some(
        (signal) =>
          !Number.isSafeInteger(signal) ||
          Math.abs(signal) > 12,
      ) ||
      !isNonNegativeInteger(agent.lastFundamentalTick) ||
      agent.lastFundamentalTick !==
        expectedLastFundamentalTick ||
      !validFundamentalSources ||
      Object.values(agent.targetHoldings ?? {}).some(
        (quantity) => !isNonNegativeInteger(quantity),
      ) ||
      Object.values(agent.delayedFundamentals ?? {}).some(
        (priceTicks) => !isPositiveInteger(priceTicks),
      ) ||
      !(
        agent.publicFlowMemory === null ||
        (
          isNonNegativeInteger(agent.publicFlowMemory.lastTradeMs) &&
          Array.isArray(agent.publicFlowMemory.observedTradeIds) &&
          agent.publicFlowMemory.observedTradeIds.length <=
            MAX_OBSERVED_TRADES_PER_RESPONSE &&
          observedAggregateMatches(
            state,
            agent.publicFlowMemory,
          )
        )
      ) ||
      (
        !legacySchema &&
        behaviorStateErrors(
          agent.behaviorState,
          symbols,
        ).length > 0
      ) ||
      limitQueueErrors.length > 0
    ) {
      errors.push(`INVALID_AGENT_SCHEMA:${agentId}`);
    }
    errors.push(...limitQueueErrors);
  }

  for (const [accountId, baseline] of Object.entries(
    ecology.accountBaselines,
  )) {
    if (
      !state.accounts[accountId] ||
      !isNonNegativeInteger(baseline.cashCents) ||
      !isPositiveInteger(baseline.initialEquityCents) ||
      !sameStringSet(Object.keys(baseline.holdings ?? {}), symbols) ||
      Object.values(baseline.holdings ?? {}).some(
        (quantity) => !isNonNegativeInteger(quantity),
      ) ||
      baseline.initialEquityCents !==
        initialEquityCentsFromWorld(
          state.world,
          baseline.cashCents,
          baseline.holdings,
        )
    ) {
      errors.push(`INVALID_AGENT_BASELINE:${accountId}`);
    }
    if (!legacySchema) {
      const mandates = Object.values(ecology.agents).filter(
        (agent) => agent.accountId === accountId,
      );
      if (mandates.length === 0) {
        continue;
      }
      const allocationBps = mandates.reduce(
        (sum, agent) => sum + agent.accountAllocationBps,
        0,
      );
      const allocatedCashCents = mandates.reduce(
        (sum, agent) =>
          sum +
          (agent.behaviorState?.account
            ?.cashEnvelopeCents ?? 0),
        0,
      );
      const account = state.accounts[accountId];
      const invalidMandateLedger = mandates.some(
        (agent) => {
          const ledger = agent.behaviorState?.account;
          const expectedCashEnvelopeCents = Math.floor(
            baseline.cashCents *
              agent.accountAllocationBps /
              10_000,
          );
          if (
            !ledger ||
            ledger.capitalOwnerId !== agent.id ||
            ledger.executionAccountId !== accountId ||
            ledger.cashEnvelopeCents !==
              expectedCashEnvelopeCents ||
            !Number.isSafeInteger(ledger.settledNetCashCents) ||
            ledger.cashEnvelopeCents +
                ledger.settledNetCashCents <
              0 ||
            ledger.cashEnvelopeCents +
                ledger.settledNetCashCents >
              Math.max(
                baseline.cashCents,
                account.cashCents,
              )
          ) {
            return true;
          }
          return symbols.some((symbol) => {
            const expectedInitialUnits = Math.floor(
              baseline.holdings[symbol] *
                agent.accountAllocationBps /
                10_000,
            );
            const initialUnits =
              ledger.initialHoldings?.[symbol];
            const settledUnits =
              ledger.settledNetUnits?.[symbol];
            return (
              initialUnits !== expectedInitialUnits ||
              !Number.isSafeInteger(settledUnits) ||
              initialUnits + settledUnits < 0 ||
              initialUnits + settledUnits >
                Math.max(
                  baseline.holdings[symbol],
                  account.holdings[symbol],
                )
            );
          });
        },
      );
      if (
        allocationBps !== 10_000 ||
        invalidMandateLedger ||
        allocatedCashCents > baseline.cashCents ||
        symbols.some(
          (symbol) =>
            mandates.reduce(
              (sum, agent) =>
                sum +
                (
                  agent.behaviorState?.account
                    ?.initialHoldings?.[symbol] ?? 0
                ),
              0,
            ) > baseline.holdings[symbol],
        )
      ) {
        errors.push(`INVALID_AGENT_MANDATE_POOL:${accountId}`);
      }
    }
  }
  const activityIds = new Set();
  for (const activity of ecology.recentActivity) {
    const queuedCommandCount = state.eventQueue
      .filter(
        (event) =>
          event.type === 'agent_command_batch' &&
          event.payload?.agentActivityId === activity?.id,
      )
      .reduce(
        (total, event) =>
          total +
          (Array.isArray(event.payload?.commands)
            ? event.payload.commands.length
            : 0),
        0,
      );
    if (
      !activity ||
      typeof activity.id !== 'string' ||
      activityIds.has(activity.id) ||
      !expectedAgentIds.includes(activity.agentId) ||
      !isNonNegativeInteger(activity.virtualMs) ||
      activity.virtualMs > state.nowMs ||
      (activity.trigger !== 'cadence' &&
        activity.trigger !== 'public_flow') ||
      !Array.isArray(activity.observedTradeIds) ||
      activity.observedTradeIds.length >
        MAX_OBSERVED_TRADES_PER_RESPONSE ||
      !isNonNegativeInteger(activity.commandCount) ||
      !isNonNegativeInteger(activity.processedCount) ||
      !isNonNegativeInteger(activity.acceptedCount) ||
      !isNonNegativeInteger(activity.rejectedCount) ||
      activity.processedCount > activity.commandCount ||
      activity.acceptedCount + activity.rejectedCount !==
        activity.processedCount ||
      !Array.isArray(activity.publicActions) ||
      activity.publicActions.length >
        MAX_PUBLIC_ACTIONS_PER_ACTIVITY ||
      activity.publicActions.some(
        (action) =>
          !action ||
          !symbols.includes(action.symbol) ||
          (action.side !== 'buy' && action.side !== 'sell') ||
          (action.orderType !== 'limit' &&
            action.orderType !== 'market') ||
          (action.tif !== 'GTC' && action.tif !== 'IOC') ||
          (
            action.orderType === 'limit'
              ? !isPositiveInteger(action.priceTicks)
              : action.priceTicks !== null
          ) ||
          !isPositiveInteger(action.quantity) ||
          !isNonNegativeInteger(action.filledQuantity) ||
          action.filledQuantity > action.quantity ||
          ![
            'accepted',
            'partially_filled',
            'filled',
            'cancelled',
            'rejected',
          ].includes(action.status),
      ) ||
      activity.processedCount + queuedCommandCount !==
        activity.commandCount
    ) {
      errors.push(`INVALID_AGENT_ACTIVITY:${activity?.id ?? 'unknown'}`);
    }
    activityIds.add(activity?.id);
  }
  const publicTradeIds = new Set();
  for (const record of ecology.publicFlow) {
    const resolved = resolveSettledPublicTradeChain(
      state,
      record?.tradeId,
    )?.trade;
    if (
      !record ||
      typeof record.tradeId !== 'string' ||
      typeof record.factId !== 'string' ||
      publicTradeIds.has(record.tradeId) ||
      !isNonNegativeInteger(record.virtualMs) ||
      record.virtualMs > state.nowMs ||
      !symbols.includes(record.symbol) ||
      (record.side !== 'buy' && record.side !== 'sell') ||
      !isPositiveInteger(record.priceTicks) ||
      !isPositiveInteger(record.quantity) ||
      !isPositiveInteger(record.commitSeq) ||
      record.commitSeq > state.commitSeq ||
      !resolved ||
      resolved.factId !== record.factId ||
      resolved.virtualMs !== record.virtualMs ||
      resolved.symbol !== record.symbol ||
      resolved.side !== record.side ||
      resolved.priceTicks !== record.priceTicks ||
      resolved.quantity !== record.quantity ||
      resolved.commitSeq !== record.commitSeq
    ) {
      errors.push(`INVALID_PUBLIC_FLOW:${record?.tradeId ?? 'unknown'}`);
    }
    publicTradeIds.add(record?.tradeId);
  }
  for (const [agentId, pending] of Object.entries(
    ecology.pendingResponses,
  )) {
    const matchingEvent = state.eventQueue.find(
      (event) => event.id === pending?.eventId,
    );
    const observedTrades =
      pending?.observedTrades ?? [];
    const informationDelayMs =
      ecology.agents[agentId]?.informationDelayMs;
    const requiredResponseMs =
      observedTrades.length > 0 &&
      observedTrades.every((trade) =>
        observedTradeFactIsValid(state, trade),
      ) &&
      isPositiveInteger(informationDelayMs)
        ? Math.max(
            ...observedTrades.map(
              (trade) =>
                trade.virtualMs + informationDelayMs,
            ),
          )
        : Number.POSITIVE_INFINITY;
    if (
      !PUBLIC_RESPONSE_AGENT_IDS.includes(agentId) ||
      !pending ||
      typeof pending.eventId !== 'string' ||
      !isNonNegativeInteger(pending.scheduledMs) ||
      pending.scheduledMs < state.nowMs ||
      pending.scheduledMs < requiredResponseMs ||
      !isPositiveInteger(pending.tradeCount) ||
      !isPositiveInteger(pending.firstPriceTicks) ||
      !isPositiveInteger(pending.lastPriceTicks) ||
      !isPositiveInteger(pending.minimumPriceTicks) ||
      !isPositiveInteger(pending.maximumPriceTicks) ||
      pending.minimumPriceTicks >
        Math.min(
          pending.firstPriceTicks,
          pending.lastPriceTicks,
          pending.maximumPriceTicks,
        ) ||
      pending.maximumPriceTicks <
        Math.max(
          pending.firstPriceTicks,
          pending.lastPriceTicks,
          pending.minimumPriceTicks,
        ) ||
      !Array.isArray(pending.observedTradeIds) ||
      pending.observedTradeIds.length < 1 ||
      pending.observedTradeIds.length >
        MAX_OBSERVED_TRADES_PER_RESPONSE ||
      !Array.isArray(pending.deferredObservedTradeIds) ||
      !Array.isArray(pending.deferredObservedTrades) ||
      pending.deferredObservedTradeIds.length !==
        pending.deferredObservedTrades.length ||
      pending.deferredObservedTradeIds.length >
        MAX_OBSERVED_TRADES_PER_RESPONSE ||
      new Set(pending.deferredObservedTradeIds).size !==
        pending.deferredObservedTradeIds.length ||
      pending.deferredObservedTrades.some(
        (trade, index) =>
          trade.id !==
            pending.deferredObservedTradeIds[index] ||
          pending.observedTradeIds.includes(trade.id) ||
          !observedTradeFactIsValid(state, trade) ||
          (
            pending.observedTradeIds.length <
              MAX_OBSERVED_TRADES_PER_RESPONSE &&
            trade.virtualMs + informationDelayMs <=
              pending.scheduledMs
          ),
      ) ||
      !pending.netSignedQuantity ||
      Array.isArray(pending.netSignedQuantity) ||
      Object.keys(pending.netSignedQuantity).some(
        (symbol) => !symbols.includes(symbol),
      ) ||
      Object.values(pending.netSignedQuantity).some(
        (quantity) => !Number.isSafeInteger(quantity),
      ) ||
      !observedAggregateMatches(state, pending) ||
      !matchingEvent ||
      matchingEvent.type !== 'public_flow_response' ||
      matchingEvent.actorId !== agentId ||
      matchingEvent.scheduledMs !== pending.scheduledMs
    ) {
      errors.push(`INVALID_PENDING_PUBLIC_RESPONSE:${agentId}`);
    }
  }
  return errors;
}

export const AGENT_ECOLOGY_LIMITS = Object.freeze({
  maxRecentActivity: MAX_RECENT_ACTIVITY,
  maxPublicFlow: MAX_PUBLIC_FLOW,
  maxObservedTradesPerResponse: MAX_OBSERVED_TRADES_PER_RESPONSE,
  maxPublicActionsPerActivity: MAX_PUBLIC_ACTIONS_PER_ACTIVITY,
  maxBehaviorEpisodes: BEHAVIOR_LIMITS.maxEpisodes,
  maxBehaviorActionTrace: BEHAVIOR_LIMITS.maxActionTrace,
  retailAgentIds: RETAIL_AGENT_IDS,
  publicResponseAgentIds: PUBLIC_RESPONSE_AGENT_IDS,
  behaviorRuleVersion: BEHAVIOR_RULE_VERSION,
});

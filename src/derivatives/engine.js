import {
  aggregateBook,
  assertBookIntegrity,
  cancelInBook,
  createOrderBook,
  previewBookExecution,
  submitToBook,
} from '../market/order-book.js?v=f34a1d70e1a7aaed';
import {
  ACCESS_THRESHOLD_CENTS,
  assertAccessState,
  checkpointAccess,
  createAccessState,
  createTestingOpenAccessState,
  derivePermissionMode,
  enablePermission,
  observeEligibility,
  restoreAccess,
} from './eligibility.js?v=f34a1d70e1a7aaed';
import {
  CONTRACT_RULE_VERSION,
  allContracts,
  appendSyntheticExpiry,
  assertContractUniverse,
  contractById,
  contractReferenceSpotTicks,
  createSyntheticDerivativeUniverse,
  equityBasketByIdentity,
  migrateContractUniverse,
  sameEquityBasketIdentity,
} from './contracts.js?v=f34a1d70e1a7aaed';
import {
  FINANCING_INITIAL_RATIO_BPS,
  FINANCING_LIQUIDATION_RATIO_BPS,
  FINANCING_MAINTENANCE_RATIO_BPS,
  accrueInterestCents,
  applyMatchedFill,
  auditRiskAccounts,
  calculatePortfolioMargin,
  createDerivativeAccount,
  facilityRiskState,
  markAccountEquity,
  securitiesLendingRiskState,
  settleFutureVariation,
} from './risk.js?v=f34a1d70e1a7aaed';
import {
  actorOpenContractLimitReason,
  actorOrderInvariantErrors,
  createStandingQuoteIndex,
  createDerivativeActorCatalog,
  derivativeActorAccountSpecs,
  deriveActorCommands,
  migrateDerivativeActorCatalog,
  updateActorCapacity,
} from './actors.js?v=f34a1d70e1a7aaed';
import {
  impliedVolatility,
  noArbitrageBounds,
  priceEuropeanOption,
  resolveOptionCarryInputs,
  surfaceVolatilityPpm,
} from './pricing.js?v=f34a1d70e1a7aaed';
import {
  constrainDerivativeActorCommands,
  PROFESSIONAL_ECOLOGY_CONTROL_VERSION,
} from '../market/professional-ecology-control.js?v=f34a1d70e1a7aaed';

export const DERIVATIVES_RULE_VERSION =
  'lzy-derivatives-market-v4';
export const DERIVATIVE_ACTOR_CADENCE_MS = 3_000;

const BPS = 10_000;
const PREVIOUS_DERIVATIVES_RULE_VERSION =
  'lzy-derivatives-market-v3';
const PREVIOUS_BASKET_DERIVATIVES_RULE_VERSION =
  'lzy-derivatives-market-v2';
const LEGACY_DERIVATIVES_RULE_VERSION =
  'lzy-derivatives-market-v1';
const MAX_RECEIPTS = 32;
const MAX_TRADES = 256;
const MAX_PLAYER_TERMINAL_ORDERS = 64;
const MAX_REFERENCE_OBSERVATIONS = 64;
const DERIVATIVE_SERIES_SCHEMA =
  'lzy_derivative_trade_series_v1';
const DERIVATIVE_SERIES_MINUTE_MS = 60_000;
const DERIVATIVE_SERIES_DAY_MS = 86_400_000;
const MAX_DERIVATIVE_SERIES_TRADE_POINTS = 256;
const MAX_DERIVATIVE_SERIES_MINUTE_BARS = 480;
const MAX_DERIVATIVE_SERIES_DAILY_BARS = 365;
const FULL_CADENCE_AUDIT_INTERVAL_MS = 60_000;
const MAX_ACTOR_QUIESCENCE_CERTIFICATE_MS = 120_000;
const PROFESSIONAL_ECOLOGY_STATE_SCHEMA =
  'lzy_derivative_professional_ecology_v1';
const PROFESSIONAL_ECOLOGY_POLICY_SCHEMA =
  'lzy_derivative_professional_actor_policy_v1';
const PROFESSIONAL_ECOLOGY_CONTROL_SCHEMA =
  'lzy_derivative_actor_control_v1';
const MAX_PROFESSIONAL_SUBMIT_COMMANDS = 512;
const PLAYER_FACILITY_COLLATERAL_SHAPE_VERSION =
  'lzy-two-finance-collateral-shape-v1';
const CREDIT_FACILITY_CAPACITY_CENTS = 1_000_000_000;
const CREDIT_FACILITY_LIQUIDITY_RESERVE_CENTS =
  100_000_000;
const INITIAL_DEFAULT_FUND_CENTS = 300_000_000;
const CREDIT_FACILITY_PROVIDER = Object.freeze({
  id: 'deriv_credit_cooperative',
  name: '历择证券信用合作池',
  baseAnnualRateBps: 800,
});
const SECURITIES_LENDING_PROVIDER = Object.freeze({
  id: 'deriv_securities_custody_pool',
  name: '历择证券出借托管池',
  baseAnnualFeeBps: 600,
  maximumAnnualFeeBps: 2_400,
});
const NPC_CREDIT_BORROWER_ID = 'deriv_quant_basis';
const NPC_SECURITIES_BORROWER_ID =
  'deriv_macro_discretionary';
const DEFAULT_SECURITY_LENDING_INVENTORY = Object.freeze({
  LZA001: 100_000,
  LZA002: 100_000,
  LZA003: 100_000,
});
const verifiedDerivativeAuthorities = new WeakMap();
const derivativeReducerDiagnostics = new WeakMap();
const activeOrderIndexesByBooksRoot = new WeakMap();
const actorQuiescenceCertificatesByBooksRoot =
  new WeakMap();
const recursivelyFrozenDerivativeNodes = new WeakSet();

function recordDerivativeReducerDiagnostics(
  state,
  diagnostics,
) {
  derivativeReducerDiagnostics.set(
    state,
    Object.freeze({ ...diagnostics }),
  );
}

export function inspectDerivativeReducerDiagnostics(state) {
  const diagnostics =
    derivativeReducerDiagnostics.get(state);
  return diagnostics ? { ...diagnostics } : null;
}

function sealDerivativeAuthority(
  state,
  lastFullAuditAtMs,
) {
  recursivelyFreezeDerivativeAuthority(state);
  verifiedDerivativeAuthorities.set(state, {
    lastFullAuditAtMs,
    stateRoot: state,
    booksRoot: state.books,
  });
  return state;
}

function recursivelyFreezeDerivativeAuthority(
  value,
  visiting = new WeakSet(),
) {
  if (
    value === null ||
    typeof value !== 'object' ||
    recursivelyFrozenDerivativeNodes.has(value)
  ) {
    return value;
  }
  if (visiting.has(value)) return value;
  visiting.add(value);
  for (const child of Object.values(value)) {
    recursivelyFreezeDerivativeAuthority(child, visiting);
  }
  Object.freeze(value);
  recursivelyFrozenDerivativeNodes.add(value);
  return value;
}

function shallowFreezeDerivativeAuthority(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    recursivelyFrozenDerivativeNodes.has(value)
  ) {
    return value;
  }
  Object.freeze(value);
  recursivelyFrozenDerivativeNodes.add(value);
  return value;
}

function sealIncrementalQuiescentAuthority(
  state,
  lastFullAuditAtMs,
) {
  recursivelyFreezeDerivativeAuthority(state.access);
  recursivelyFreezeDerivativeAuthority(
    state.accounts.player
      ?.facilityCollateralShape,
  );
  recursivelyFreezeDerivativeAuthority(
    state.receipts.at(-1),
  );
  for (const observation of state.market
    .referenceObservations) {
    if (
      !recursivelyFrozenDerivativeNodes.has(
        observation,
      )
    ) {
      recursivelyFreezeDerivativeAuthority(
        observation,
      );
    }
  }

  for (const underlying of Object.values(
    state.universe.underlyings,
  )) {
    shallowFreezeDerivativeAuthority(underlying);
  }
  shallowFreezeDerivativeAuthority(
    state.universe.underlyings,
  );
  for (const references of Object.values(
    state.universe.equityBasketReferences ?? {},
  )) {
    for (const reference of Object.values(references)) {
      shallowFreezeDerivativeAuthority(reference);
    }
    shallowFreezeDerivativeAuthority(references);
  }
  shallowFreezeDerivativeAuthority(
    state.universe.equityBasketReferences,
  );
  shallowFreezeDerivativeAuthority(state.universe);

  for (const actor of Object.values(state.actors)) {
    shallowFreezeDerivativeAuthority(actor);
  }
  shallowFreezeDerivativeAuthority(state.actors);

  for (const account of Object.values(state.accounts)) {
    shallowFreezeDerivativeAuthority(account.risk);
    shallowFreezeDerivativeAuthority(account);
  }
  shallowFreezeDerivativeAuthority(state.accounts);
  shallowFreezeDerivativeAuthority(state.books);

  shallowFreezeDerivativeAuthority(
    state.market.lastTradePriceTicks,
  );
  shallowFreezeDerivativeAuthority(
    state.market.settlementPriceTicks,
  );
  shallowFreezeDerivativeAuthority(
    state.market.settlementSources,
  );
  shallowFreezeDerivativeAuthority(
    state.market.impliedVolatilityPpm,
  );
  shallowFreezeDerivativeAuthority(
    state.market.securityReferencePrices,
  );
  shallowFreezeDerivativeAuthority(
    state.market.referenceObservations,
  );
  shallowFreezeDerivativeAuthority(
    state.market.trades,
  );
  shallowFreezeDerivativeAuthority(
    state.market.seriesByContract,
  );
  for (const policy of Object.values(
    state.market.professionalEcology?.policiesByActorId ?? {},
  )) {
    shallowFreezeDerivativeAuthority(
      policy.allowedContractTypes,
    );
    shallowFreezeDerivativeAuthority(policy);
  }
  shallowFreezeDerivativeAuthority(
    state.market.professionalEcology?.policiesByActorId,
  );
  shallowFreezeDerivativeAuthority(
    state.market.professionalEcology,
  );
  shallowFreezeDerivativeAuthority(state.market);
  shallowFreezeDerivativeAuthority(
    state.historyCompaction,
  );
  shallowFreezeDerivativeAuthority(state.receipts);
  shallowFreezeDerivativeAuthority(state);
  verifiedDerivativeAuthorities.set(state, {
    lastFullAuditAtMs,
    stateRoot: state,
    booksRoot: state.books,
  });
  return state;
}

function assertSealedDerivativeAuthorityUnchanged(
  state,
  authoritySeal,
) {
  if (
    state !== authoritySeal.stateRoot ||
    !Object.isFrozen(state) ||
    state.books !== authoritySeal.booksRoot ||
    !Object.isFrozen(state.books)
  ) {
    throw new Error(
      'Derivative input authority invariant failed: SEALED_DERIVATIVE_AUTHORITY_CHANGED',
    );
  }
}

function fullDerivativeAuditOrThrow(
  state,
  messagePrefix,
) {
  const audit = auditDerivativesState(state);
  if (!audit.ok) {
    throw new Error(
      `${messagePrefix}: ${audit.errors.join('; ')}`,
    );
  }
  return audit;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function cloneBookSide(side) {
  return Object.fromEntries(
    Object.entries(side).map(([price, orderIds]) => [
      price,
      [...orderIds],
    ]),
  );
}

function createActorCadenceDraft(state) {
  const books = { ...state.books };
  const accounts = structuredClone(state.accounts);
  if (
    state.accounts.player
      ?.facilityCollateralShapeTracker !== undefined
  ) {
    accounts.player.facilityCollateralShapeTracker =
      state.accounts.player
        .facilityCollateralShapeTracker;
  }
  if (
    state.accounts.player
      ?.facilityCollateralShape !== undefined
  ) {
    // The collateral shape is sealed authority. Actor cadence may advance its
    // timestamp, but an unchanged classification must keep the (potentially
    // large) security partition by identity instead of cloning every listed
    // security on every derivative cadence.
    accounts.player.facilityCollateralShape =
      state.accounts.player.facilityCollateralShape;
  }
  const clonedBookIds = new Set();
  const context = {
    draftMode: 'cadence_cow',
    ensureWritableBook(contractId) {
      if (clonedBookIds.has(contractId)) {
        return books[contractId];
      }
      const current = books[contractId];
      if (!current) return null;
      const writable = {
        ...current,
        bids: cloneBookSide(current.bids),
        asks: cloneBookSide(current.asks),
        orders: Object.fromEntries(
          Object.entries(current.orders).map(
            ([orderId, order]) => [
              orderId,
              { ...order },
            ],
          ),
        ),
      };
      books[contractId] = writable;
      clonedBookIds.add(contractId);
      return writable;
    },
    clonedBookIds,
  };
  const equityBasketReferences = Object.fromEntries(
    Object.entries(
      state.universe.equityBasketReferences ?? {},
    ).map(([underlyingId, references]) => [
      underlyingId,
      Object.fromEntries(
        Object.entries(references).map(
          ([version, reference]) => [
            version,
            { ...reference },
          ],
        ),
      ),
    ]),
  );
  const draft = {
    ...state,
    access: structuredClone(state.access),
    universe: {
      ...state.universe,
      underlyings: Object.fromEntries(
        Object.entries(state.universe.underlyings).map(
          ([underlyingId, underlying]) => [
            underlyingId,
            { ...underlying },
          ],
        ),
      ),
      equityBasketReferences,
    },
    actors: structuredClone(state.actors),
    accounts,
    books,
    market: {
      ...state.market,
      lastTradePriceTicks: {
        ...state.market.lastTradePriceTicks,
      },
      settlementPriceTicks: {
        ...state.market.settlementPriceTicks,
      },
      settlementSources: {
        ...state.market.settlementSources,
      },
      impliedVolatilityPpm: {
        ...state.market.impliedVolatilityPpm,
      },
      referenceObservations: [
        ...state.market.referenceObservations,
      ],
      securityReferencePrices: {
        ...state.market.securityReferencePrices,
      },
      trades: [...state.market.trades],
      seriesByContract: structuredClone(
        state.market.seriesByContract,
      ),
    },
    clearing: structuredClone(state.clearing),
    historyCompaction: {
      ...state.historyCompaction,
    },
    receipts: [...state.receipts],
  };
  return { draft, context };
}

function createQuiescentCadenceDraft(state) {
  const books = { ...state.books };
  const inheritedActiveOrderIndex =
    activeOrderIndexesByBooksRoot.get(state.books);
  if (inheritedActiveOrderIndex) {
    activeOrderIndexesByBooksRoot.set(
      books,
      inheritedActiveOrderIndex,
    );
  }
  const inheritedActorCertificate =
    actorQuiescenceCertificatesByBooksRoot.get(
      state.books,
    );
  if (inheritedActorCertificate) {
    actorQuiescenceCertificatesByBooksRoot.set(
      books,
      inheritedActorCertificate,
    );
  }
  const clonedBookIds = new Set();
  const context = {
    draftMode: 'quiescent_cow',
    quiescentActorPreview: true,
    ensureWritableBook(contractId) {
      activeOrderIndexesByBooksRoot.delete(books);
      actorQuiescenceCertificatesByBooksRoot.delete(
        books,
      );
      if (clonedBookIds.has(contractId)) {
        return books[contractId];
      }
      const current = books[contractId];
      if (!current) return null;
      const writable = {
        ...current,
        bids: cloneBookSide(current.bids),
        asks: cloneBookSide(current.asks),
        orders: Object.fromEntries(
          Object.entries(current.orders).map(
            ([orderId, order]) => [
              orderId,
              { ...order },
            ],
          ),
        ),
      };
      books[contractId] = writable;
      clonedBookIds.add(contractId);
      return writable;
    },
    clonedBookIds,
  };
  const draft = {
    ...state,
    universe: {
      ...state.universe,
      underlyings: Object.fromEntries(
        Object.entries(state.universe.underlyings).map(
          ([underlyingId, underlying]) => [
            underlyingId,
            { ...underlying },
          ],
        ),
      ),
      equityBasketReferences: Object.fromEntries(
        Object.entries(
          state.universe.equityBasketReferences ?? {},
        ).map(([underlyingId, references]) => [
          underlyingId,
          Object.fromEntries(
            Object.entries(references).map(
              ([version, reference]) => [
                version,
                { ...reference },
              ],
            ),
          ),
        ]),
      ),
    },
    actors: Object.fromEntries(
      Object.entries(state.actors).map(
        ([actorId, actor]) => [
          actorId,
          { ...actor },
        ],
      ),
    ),
    accounts: Object.fromEntries(
      Object.entries(state.accounts).map(
        ([accountId, account]) => [
          accountId,
          {
            ...account,
            risk: account.risk
              ? { ...account.risk }
              : account.risk,
          },
        ],
      ),
    ),
    books,
    market: {
      ...state.market,
      lastTradePriceTicks: {
        ...state.market.lastTradePriceTicks,
      },
      settlementPriceTicks: {
        ...state.market.settlementPriceTicks,
      },
      settlementSources: {
        ...state.market.settlementSources,
      },
      impliedVolatilityPpm: {
        ...state.market.impliedVolatilityPpm,
      },
      referenceObservations: [
        ...state.market.referenceObservations,
      ],
      securityReferencePrices: {
        ...state.market.securityReferencePrices,
      },
      trades: [...state.market.trades],
    },
    historyCompaction: {
      ...state.historyCompaction,
    },
    receipts: [...state.receipts],
  };
  return { draft, context };
}

function contractBasketIdentity(contract) {
  return contract?.basketIdentity
    ? cloneJson(contract.basketIdentity)
    : null;
}

function referenceSpotTicks(state, contract) {
  const spotTicks = contractReferenceSpotTicks(
    state.universe,
    contract,
  );
  return positiveInteger(
    spotTicks,
    `reference spot for ${contract.id}`,
  );
}

function safeTimestamp(value, label = 'atMs') {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`);
  }
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer`);
  }
  return value;
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `${label} must be a non-negative integer`,
    );
  }
  return value;
}

function nextId(state, prefix, field) {
  const sequence = state[field];
  state[field] += 1;
  return `${prefix}_${String(sequence).padStart(8, '0')}`;
}

function activeOrder(order) {
  return Boolean(
    order &&
      order.remainingQty > 0 &&
      (
        order.status === 'accepted' ||
        order.status === 'partially_filled'
      ),
  );
}

function emptyHistoryCompaction() {
  return {
    archivedReceiptCount: 0,
    archivedTradeCount: 0,
    archivedOrderCount: 0,
    archivedContractCount: 0,
    archivedBookCount: 0,
    lastCompactedAtMs: null,
  };
}

function ensureHistoryCompaction(state) {
  state.historyCompaction ??= emptyHistoryCompaction();
  return state.historyCompaction;
}

function emptyDerivativeSeriesArchive() {
  return {
    tradePointCount: 0,
    minuteBarCount: 0,
    dailyBarCount: 0,
    volume: 0,
    turnoverTicks: 0,
    firstTradeAtMs: null,
    lastTradeAtMs: null,
  };
}

function createDerivativeTradeSeries(contractId) {
  return {
    schema: DERIVATIVE_SERIES_SCHEMA,
    contractId,
    priceAuthority: 'matched_order_fills_only',
    tradePoints: [],
    minuteBars: [],
    dailyBars: [],
    archive: emptyDerivativeSeriesArchive(),
  };
}

function ensureDerivativeTradeSeries(state, contractId) {
  state.market.seriesByContract ??= {};
  state.market.seriesByContract[contractId] ??=
    createDerivativeTradeSeries(contractId);
  return state.market.seriesByContract[contractId];
}

function tradeSeriesPoint(trade) {
  return {
    tradeId: trade.id,
    sequence: trade.sequence,
    atMs: trade.atMs,
    priceTicks: trade.priceTicks,
    quantity: trade.quantity,
    turnoverTicks: trade.priceTicks * trade.quantity,
    priceAuthority: 'matched_order_fill',
  };
}

function appendTradeBar(bars, trade, intervalMs, maximum) {
  const startMs =
    Math.floor(trade.atMs / intervalMs) * intervalMs;
  const last = bars.at(-1);
  if (last?.startMs === startMs) {
    last.highTicks = Math.max(
      last.highTicks,
      trade.priceTicks,
    );
    last.lowTicks = Math.min(
      last.lowTicks,
      trade.priceTicks,
    );
    last.closeTicks = trade.priceTicks;
    last.volume += trade.quantity;
    last.turnoverTicks +=
      trade.priceTicks * trade.quantity;
    last.tradeCount += 1;
    last.lastTradeId = trade.id;
  } else {
    bars.push({
      startMs,
      endMs: startMs + intervalMs,
      openTicks: trade.priceTicks,
      highTicks: trade.priceTicks,
      lowTicks: trade.priceTicks,
      closeTicks: trade.priceTicks,
      volume: trade.quantity,
      turnoverTicks:
        trade.priceTicks * trade.quantity,
      tradeCount: 1,
      firstTradeId: trade.id,
      lastTradeId: trade.id,
      priceAuthority: 'matched_order_fills_only',
    });
  }
  if (bars.length <= maximum) return [];
  return bars.splice(0, bars.length - maximum);
}

function archiveDerivativeSeriesHistory(
  archive,
  { tradePoints = [], minuteBars = [], dailyBars = [] },
) {
  archive.tradePointCount += tradePoints.length;
  archive.minuteBarCount += minuteBars.length;
  archive.dailyBarCount += dailyBars.length;
  for (const point of tradePoints) {
    archive.volume += point.quantity;
    archive.turnoverTicks += point.turnoverTicks;
    archive.firstTradeAtMs ??= point.atMs;
    archive.lastTradeAtMs = point.atMs;
  }
}

function appendDerivativeTradeSeries(state, trade) {
  const series = ensureDerivativeTradeSeries(
    state,
    trade.contractId,
  );
  series.tradePoints.push(tradeSeriesPoint(trade));
  const removedTradePoints =
    series.tradePoints.length >
    MAX_DERIVATIVE_SERIES_TRADE_POINTS
      ? series.tradePoints.splice(
          0,
          series.tradePoints.length -
            MAX_DERIVATIVE_SERIES_TRADE_POINTS,
        )
      : [];
  const removedMinuteBars = appendTradeBar(
    series.minuteBars,
    trade,
    DERIVATIVE_SERIES_MINUTE_MS,
    MAX_DERIVATIVE_SERIES_MINUTE_BARS,
  );
  const removedDailyBars = appendTradeBar(
    series.dailyBars,
    trade,
    DERIVATIVE_SERIES_DAY_MS,
    MAX_DERIVATIVE_SERIES_DAILY_BARS,
  );
  archiveDerivativeSeriesHistory(series.archive, {
    tradePoints: removedTradePoints,
    minuteBars: removedMinuteBars,
    dailyBars: removedDailyBars,
  });
}

function rebuildDerivativeTradeSeries(state) {
  state.market.seriesByContract = {};
  for (const trade of [...(state.market.trades ?? [])].sort(
    (left, right) =>
      left.sequence - right.sequence ||
      left.atMs - right.atMs,
  )) {
    if (contractById(state.universe, trade.contractId)) {
      appendDerivativeTradeSeries(state, trade);
    }
  }
}

function terminalOrder(order) {
  return Boolean(order && !activeOrder(order));
}

function commandReceiptSummary(commandReceipts) {
  const summary = {
    appliedCount: 0,
    rejectedCount: 0,
    submitCount: 0,
    cancelCount: 0,
    rejectionReasons: {},
  };
  for (const receipt of commandReceipts) {
    if (receipt.commandType === 'CANCEL_ORDER') {
      summary.cancelCount += 1;
    } else {
      summary.submitCount += 1;
    }
    if (receipt.status === 'applied') {
      summary.appliedCount += 1;
    } else {
      summary.rejectedCount += 1;
      const reason = receipt.reason ?? 'UNKNOWN';
      summary.rejectionReasons[reason] =
        (summary.rejectionReasons[reason] ?? 0) + 1;
    }
  }
  return summary;
}

function compactReceiptHistory(state) {
  const archive = ensureHistoryCompaction(state);
  let changed = false;
  for (const receipt of state.receipts) {
    if (
      receipt.type === 'RUN_ACTOR_CYCLE' &&
      Array.isArray(receipt.commandReceipts)
    ) {
      receipt.commandSummary = commandReceiptSummary(
        receipt.commandReceipts,
      );
      delete receipt.commandReceipts;
      changed = true;
    }
  }
  if (state.receipts.length > MAX_RECEIPTS) {
    const removed = state.receipts.splice(
      0,
      state.receipts.length - MAX_RECEIPTS,
    );
    archive.archivedReceiptCount += removed.length;
    changed = true;
  }
  if (changed) archive.lastCompactedAtMs = state.nowMs;
}

function compactExpiredMaturities(state) {
  const archive = ensureHistoryCompaction(state);
  const contractsByExpiry = new Map();
  for (const contract of allContracts(state.universe)) {
    const group =
      contractsByExpiry.get(contract.expiryMs) ?? [];
    group.push(contract);
    contractsByExpiry.set(contract.expiryMs, group);
  }
  const removedContractIds = new Set();
  for (const contracts of [...contractsByExpiry.values()].sort(
    (left, right) =>
      left[0].expiryMs - right[0].expiryMs,
  )) {
    if (
      contracts.some(
        (contract) => contract.status !== 'expired',
      )
    ) {
      continue;
    }
    const ids = new Set(
      contracts.map((contract) => contract.id),
    );
    const hasPosition = Object.values(state.accounts).some(
      (account) =>
        Object.entries(account.positions ?? {}).some(
          ([contractId, position]) =>
            ids.has(contractId) &&
            position.quantity !== 0,
        ),
    );
    const hasActiveOrder = contracts.some((contract) =>
      Object.values(
        state.books[contract.id]?.orders ?? {},
      ).some(activeOrder),
    );
    if (hasPosition || hasActiveOrder) continue;
    for (const contract of contracts) {
      removedContractIds.add(contract.id);
      delete state.books[contract.id];
      delete state.universe.futures[contract.id];
      delete state.universe.options[contract.id];
      delete state.market.lastTradePriceTicks[
        contract.id
      ];
      delete state.market.settlementPriceTicks[
        contract.id
      ];
      delete state.market.settlementSources[
        contract.id
      ];
      delete state.market.impliedVolatilityPpm[
        contract.id
      ];
      delete state.market.seriesByContract?.[
        contract.id
      ];
      for (const account of Object.values(
        state.accounts,
      )) {
        delete account.positions[contract.id];
      }
      archive.archivedContractCount += 1;
      archive.archivedBookCount += 1;
    }
  }
  if (removedContractIds.size > 0) {
    const before = state.market.trades.length;
    state.market.trades = state.market.trades.filter(
      (trade) => !removedContractIds.has(trade.contractId),
    );
    archive.archivedTradeCount +=
      before - state.market.trades.length;
  }
}

function compactTrades(state) {
  const trades = state.market.trades;
  if (trades.length <= MAX_TRADES) return;
  const mandatoryTradeIds = new Set();
  for (const contractId of Object.keys(
    state.market.lastTradePriceTicks,
  )) {
    const last = [...trades]
      .reverse()
      .find((trade) => trade.contractId === contractId);
    if (last) mandatoryTradeIds.add(last.id);
  }
  const retainedIds = new Set(
    trades
      .slice(-MAX_TRADES)
      .map((trade) => trade.id),
  );
  for (const tradeId of mandatoryTradeIds) {
    retainedIds.add(tradeId);
  }
  const retained = trades.filter((trade) =>
    retainedIds.has(trade.id),
  );
  ensureHistoryCompaction(state).archivedTradeCount +=
    trades.length - retained.length;
  state.market.trades = retained;
}

function compactTerminalOrders(state, context = {}) {
  const retainedTradeOrderIds = new Set(
    state.market.trades.flatMap((trade) => [
      trade.buyerOrderId,
      trade.sellerOrderId,
    ]),
  );
  const retainedPlayerOrderIds = new Set(
    Object.values(state.books)
      .flatMap((book) => Object.values(book.orders))
      .filter(
        (order) =>
          order.ownerId === 'player' &&
          terminalOrder(order),
      )
      .sort((left, right) =>
        right.id.localeCompare(left.id),
      )
      .slice(0, MAX_PLAYER_TERMINAL_ORDERS)
      .map((order) => order.id),
  );
  let removed = 0;
  for (const [
    contractId,
    currentBook,
  ] of Object.entries(state.books)) {
    for (const [orderId, order] of Object.entries(
      currentBook.orders,
    )) {
      if (
        activeOrder(order) ||
        retainedTradeOrderIds.has(orderId) ||
        retainedPlayerOrderIds.has(orderId)
      ) {
        continue;
      }
      const writableBook =
        context.ensureWritableBook?.(contractId) ??
        currentBook;
      delete writableBook.orders[orderId];
      removed += 1;
    }
  }
  ensureHistoryCompaction(state).archivedOrderCount +=
    removed;
}

function compactDerivativeHistory(state, context = {}) {
  const archive = ensureHistoryCompaction(state);
  const before = {
    receipts: archive.archivedReceiptCount,
    trades: archive.archivedTradeCount,
    orders: archive.archivedOrderCount,
    contracts: archive.archivedContractCount,
  };
  compactReceiptHistory(state);
  compactExpiredMaturities(state);
  compactTrades(state);
  compactTerminalOrders(state, context);
  if (
    archive.archivedReceiptCount !== before.receipts ||
    archive.archivedTradeCount !== before.trades ||
    archive.archivedOrderCount !== before.orders ||
    archive.archivedContractCount !== before.contracts
  ) {
    archive.lastCompactedAtMs = state.nowMs;
  }
}

function marks(state) {
  return {
    ...state.market.settlementPriceTicks,
    ...state.market.lastTradePriceTicks,
  };
}

function accountCashTotal(state) {
  return Object.values(state.accounts).reduce(
    (sum, account) => sum + account.cashCents,
    0,
  );
}

function systemCashTotal(state) {
  return (
    accountCashTotal(state) +
    state.clearing.creditPoolCents +
    (state.clearing.worldCashBridgeCents ?? 0) +
    state.clearing.defaultFundCents +
    state.clearing.feePoolCents
  );
}

function financingOutstandingCents(state) {
  return Object.values(state.accounts).reduce(
    (sum, account) =>
      sum + account.financing.cashDebtCents,
    0,
  );
}

function creditFacilityAvailability(state) {
  const facility = state.clearing.creditFacility;
  const outstandingCents =
    financingOutstandingCents(state);
  const capitalHeadroomCents = Math.max(
    0,
    facility.capacityCents -
      facility.minimumLiquidityReserveCents -
      outstandingCents,
  );
  const liquidHeadroomCents = Math.max(
    0,
    state.clearing.creditPoolCents -
      facility.minimumLiquidityReserveCents,
  );
  return {
    outstandingCents,
    availableCreditCents: Math.min(
      capitalHeadroomCents,
      liquidHeadroomCents,
    ),
    capitalHeadroomCents,
    liquidHeadroomCents,
  };
}

function unreservedAccountCashCents(account) {
  return Math.max(
    0,
    account.cashCents -
      account.reservedInitialMarginCents -
      account.reservedTransactionFeesCents -
      (account.externalReservedCashCents ?? 0),
  );
}

function securityLendingFeeBps(state, securityId) {
  const initial =
    state.clearing.initialLendableSecurities[
      securityId
    ] ?? 0;
  const available =
    state.clearing.lendableSecurities[securityId] ?? 0;
  const borrowed = Math.max(0, initial - available);
  const utilizationBps =
    initial <= 0
      ? 0
      : Math.floor(borrowed * BPS / initial);
  const facility =
    state.clearing.securitiesLendingFacility;
  return Math.min(
    facility.maximumAnnualFeeBps,
    facility.baseAnnualFeeBps +
      Math.floor(utilizationBps * 1_800 / BPS) +
      Math.floor(
        Math.max(0, state.market.liquidityRiskBps - 100) /
          4,
      ),
  );
}

function ceilBasisPoints(value, basisPoints) {
  const numerator = BigInt(value) * BigInt(basisPoints);
  const denominator = BigInt(BPS);
  return Number(
    (numerator + denominator - 1n) / denominator,
  );
}

function facilityCollateralCents(account) {
  if (account.accountType === 'player') {
    return account.facilityEligibleCollateralCents;
  }
  return Math.max(
    account.externalCollateralCents,
    account.capacityCents,
  );
}

function aggregateFacilityRisk(account) {
  const collateralValueCents =
    facilityCollateralCents(account);
  const financing = facilityRiskState({
    collateralValueCents,
    debtCents: account.financing.cashDebtCents,
  });
  const securitiesLending =
    securitiesLendingRiskState({
      collateralValueCents,
      borrowedSecurities:
        account.borrowedSecurities,
    });
  const financingInitialRequiredCollateralCents =
    ceilBasisPoints(
      account.financing.cashDebtCents,
      FINANCING_INITIAL_RATIO_BPS,
    );
  const financingMaintenanceRequiredCollateralCents =
    ceilBasisPoints(
      account.financing.cashDebtCents,
      FINANCING_MAINTENANCE_RATIO_BPS,
    );
  const financingLiquidationRequiredCollateralCents =
    ceilBasisPoints(
      account.financing.cashDebtCents,
      FINANCING_LIQUIDATION_RATIO_BPS,
    );
  const initialRequiredCollateralCents =
    financingInitialRequiredCollateralCents +
    securitiesLending.initialRequiredCollateralCents;
  const maintenanceRequiredCollateralCents =
    financingMaintenanceRequiredCollateralCents +
    securitiesLending.maintenanceRequiredCollateralCents;
  const liquidationRequiredCollateralCents =
    financingLiquidationRequiredCollateralCents +
    securitiesLending.liquidationRequiredCollateralCents;
  let status = 'NORMAL';
  if (
    liquidationRequiredCollateralCents > 0 &&
    collateralValueCents <
      liquidationRequiredCollateralCents
  ) {
    status = 'LIQUIDATE';
  } else if (
    maintenanceRequiredCollateralCents > 0 &&
    collateralValueCents <
      maintenanceRequiredCollateralCents
  ) {
    status = 'MARGIN_CALL';
  }
  return {
    status,
    financing,
    securitiesLending,
    initialRequiredCollateralCents,
    maintenanceRequiredCollateralCents,
    liquidationRequiredCollateralCents,
    financingInitialRequiredCollateralCents,
    financingMaintenanceRequiredCollateralCents,
    financingLiquidationRequiredCollateralCents,
  };
}

function financingCollateralHeadroomCents(account) {
  const existingFacilityRisk =
    aggregateFacilityRisk(account);
  const collateralForFinancingCents = Math.max(
    0,
    facilityCollateralCents(account) -
      existingFacilityRisk.securitiesLending
        .initialRequiredCollateralCents,
  );
  const maximumDebtCents = Number(
    BigInt(collateralForFinancingCents) *
      BigInt(BPS) /
      BigInt(FINANCING_INITIAL_RATIO_BPS),
  );
  return {
    existingFacilityRisk,
    collateralForFinancingCents,
    maximumDebtCents,
    headroomCents: Math.max(
      0,
      maximumDebtCents -
        account.financing.cashDebtCents,
    ),
  };
}

function maximumSecurityBorrowQuantity(
  state,
  account,
  securityId,
  referencePriceTicks,
  requestedQuantity,
) {
  if (
    !Number.isSafeInteger(referencePriceTicks) ||
    referencePriceTicks <= 0 ||
    !Number.isSafeInteger(requestedQuantity) ||
    requestedQuantity <= 0
  ) {
    return 0;
  }
  const availableQuantity = Math.max(
    0,
    state.clearing.lendableSecurities[
      securityId
    ] ?? 0,
  );
  let low = 0;
  let high = Math.min(
    requestedQuantity,
    availableQuantity,
  );
  const annualFeeBps = securityLendingFeeBps(
    state,
    securityId,
  );
  while (low < high) {
    const candidate =
      low + Math.ceil((high - low) / 2);
    const hypothetical = cloneJson(account);
    const loan =
      hypothetical.borrowedSecurities[securityId] ?? {
        securityId,
        quantity: 0,
        referencePriceTicks,
        annualFeeBps,
        accruedFeeCents: 0,
        lastAccruedAtMs: state.nowMs,
      };
    loan.quantity += candidate;
    loan.referencePriceTicks = referencePriceTicks;
    hypothetical.borrowedSecurities[securityId] = loan;
    if (
      aggregateFacilityRisk(hypothetical)
        .initialRequiredCollateralCents <=
      facilityCollateralCents(hypothetical)
    ) {
      low = candidate;
    } else {
      high = candidate - 1;
    }
  }
  return low;
}

function orderOpeningQuantity(
  currentQuantity,
  side,
  quantity,
) {
  const delta = side === 'buy' ? quantity : -quantity;
  const next = currentQuantity + delta;
  if (currentQuantity === 0) return Math.abs(next);
  if (Math.sign(next) === Math.sign(currentQuantity)) {
    return Math.max(
      0,
      Math.abs(next) - Math.abs(currentQuantity),
    );
  }
  return Math.abs(next);
}

function splitTransactionQuantity(
  currentQuantity,
  side,
  quantity,
) {
  const openingQuantity = orderOpeningQuantity(
    currentQuantity,
    side,
    quantity,
  );
  return {
    openingQuantity,
    closingQuantity: quantity - openingQuantity,
  };
}

function transactionFeeCents(
  contract,
  currentQuantity,
  side,
  quantity,
) {
  const { openingQuantity, closingQuantity } =
    splitTransactionQuantity(
      currentQuantity,
      side,
      quantity,
    );
  const feeSchedule = contract.feeSchedule;
  const feeCents =
    openingQuantity *
      feeSchedule.openFeeCentsPerContract +
    closingQuantity *
      feeSchedule.closeFeeCentsPerContract;
  if (!Number.isSafeInteger(feeCents)) {
    throw new RangeError(
      `transaction fee exceeds safe integer range: ${contract.id}`,
    );
  }
  return {
    feeScheduleId: feeSchedule.id,
    openingQuantity,
    closingQuantity,
    feeCents,
  };
}

function maximumOrderTransactionFeeCents(
  contract,
  quantity,
) {
  const feePerContract = Math.max(
    contract.feeSchedule.openFeeCentsPerContract,
    contract.feeSchedule.closeFeeCentsPerContract,
  );
  const feeCents = feePerContract * quantity;
  if (!Number.isSafeInteger(feeCents)) {
    throw new RangeError(
      `order fee reservation exceeds safe integer range: ${contract.id}`,
    );
  }
  return feeCents;
}

function sameSideActiveOrderQuantity(
  state,
  contractId,
  ownerId,
  side,
) {
  return Object.values(
    state.books[contractId]?.orders ?? {},
  ).reduce(
    (sum, order) =>
      order.ownerId === ownerId &&
      order.side === side &&
      activeOrder(order)
        ? sum + order.remainingQty
        : sum,
    0,
  );
}

function incrementalOpeningQuantity(
  currentQuantity,
  side,
  quantity,
  priorSameSideQuantity,
) {
  return Math.max(
    0,
    orderOpeningQuantity(
      currentQuantity,
      side,
      priorSameSideQuantity + quantity,
    ) -
      orderOpeningQuantity(
        currentQuantity,
        side,
        priorSameSideQuantity,
      ),
  );
}

function candidateOpeningQuantity(
  state,
  contract,
  account,
  side,
  quantity,
) {
  const current =
    account.positions[contract.id]?.quantity ?? 0;
  const priorSameSideQuantity =
    sameSideActiveOrderQuantity(
      state,
      contract.id,
      account.id,
      side,
    );
  return incrementalOpeningQuantity(
    current,
    side,
    quantity,
    priorSameSideQuantity,
  );
}

function playerPermissionReason(
  state,
  contract,
  side,
  quantity,
) {
  const current =
    state.accounts.player.positions[contract.id]?.quantity ??
    0;
  const delta = side === 'buy' ? quantity : -quantity;
  const next = current + delta;
  if (contract.type === 'future') {
    const opening = candidateOpeningQuantity(
      state,
      contract,
      state.accounts.player,
      side,
      quantity,
    );
    if (
      opening > 0 &&
      derivePermissionMode(
        state.access,
        'futures_trading',
      ) !== 'OPEN'
    ) {
      return 'FUTURES_ACCESS_REQUIRED';
    }
    return null;
  }
  if (side === 'sell') {
    const activeClosingSellQuantity = Object.values(
      state.books[contract.id]?.orders ?? {},
    ).reduce(
      (sum, order) =>
        order.ownerId === 'player' &&
        order.side === 'sell' &&
        activeOrder(order)
          ? sum + order.remainingQty
          : sum,
      0,
    );
    if (
      quantity >
      Math.max(0, current - activeClosingSellQuantity)
    ) {
      return 'PLAYER_OPTION_WRITING_NOT_ENABLED';
    }
  }
  const openingLong = Math.max(0, next) - Math.max(0, current);
  const openingShort =
    Math.max(0, -next) - Math.max(0, -current);
  if (
    openingLong > 0 &&
    derivePermissionMode(state.access, 'option_buyer') !==
      'OPEN'
  ) {
    return 'OPTION_BUYER_ACCESS_REQUIRED';
  }
  if (openingShort > 0) {
    return 'PLAYER_OPTION_WRITING_NOT_ENABLED';
  }
  return null;
}

function futurePriceBand(state, contract) {
  if (contract?.type !== 'future') return null;
  const referenceTicks =
    state.market.settlementPriceTicks[contract.id] ??
    contractReferenceSpotTicks(state.universe, contract);
  if (
    !Number.isSafeInteger(referenceTicks) ||
    referenceTicks <= 0
  ) {
    return null;
  }
  const tickSize = contract.tickSize;
  const dailyLimitBps = contract.dailyLimitBps;
  return {
    referenceTicks,
    lowerTicks: Math.max(
      tickSize,
      Math.ceil(
        referenceTicks *
          (BPS - dailyLimitBps) /
          BPS /
          tickSize,
      ) * tickSize,
    ),
    upperTicks:
      Math.floor(
        referenceTicks *
          (BPS + dailyLimitBps) /
          BPS /
          tickSize,
      ) * tickSize,
    dailyLimitBps,
    tickSize,
  };
}

function orderReferencePrice(state, command, contract) {
  if (command.orderType !== 'market') {
    return command.priceTicks;
  }
  const priceBand = futurePriceBand(state, contract);
  const preview = previewBookExecution(
    state.books[contract.id],
    {
      side: command.side,
      ownerId: command.actorId,
      type: 'market',
      priceTicks: null,
      protectionPriceTicks:
        command.side === 'buy'
          ? priceBand?.upperTicks
          : priceBand?.lowerTicks,
      quantity: command.quantity,
    },
  );
  if (preview.matches.length > 0) {
    if (command.side === 'buy') {
      return Math.max(
        ...preview.matches.map((match) => match.priceTicks),
      );
    }
    return Math.min(
      ...preview.matches.map((match) => match.priceTicks),
    );
  }
  return (
    state.market.lastTradePriceTicks[contract.id] ??
    state.market.settlementPriceTicks[contract.id] ??
    1
  );
}

function hypotheticalAccountForOrder(
  account,
  contract,
  side,
  quantity,
  priceTicks,
) {
  const hypothetical = cloneJson(account);
  const position =
    hypothetical.positions[contract.id] ?? {
      contractId: contract.id,
      basketIdentity:
        contractBasketIdentity(contract),
      quantity: 0,
      averageOpenPriceTicks: priceTicks,
      lastSettlementPriceTicks:
        contract.type === 'future' ? priceTicks : null,
      realizedPnLCents: 0,
    };
  position.quantity += side === 'buy' ? quantity : -quantity;
  if (position.quantity === 0) {
    position.averageOpenPriceTicks = 0;
    position.lastSettlementPriceTicks = null;
  }
  hypothetical.positions[contract.id] = position;
  return hypothetical;
}

function validateOrderRisk(
  state,
  command,
  contract,
  account,
) {
  const referencePrice = orderReferencePrice(
    state,
    command,
    contract,
  );
  const candidateTransactionFeeCents =
    maximumOrderTransactionFeeCents(
      contract,
      command.quantity,
    );
  if (
    unreservedAccountCashCents(account) <
    candidateTransactionFeeCents
  ) {
    return 'INSUFFICIENT_TRANSACTION_FEE_CASH';
  }
  if (contract.type === 'future') {
    const opening = candidateOpeningQuantity(
      state,
      contract,
      account,
      command.side,
      command.quantity,
    );
    const candidateReservationCents =
      ceilBasisPoints(
        opening *
          referencePrice *
          contract.tickValueCents,
        contract.initialMarginBps,
      );
    const currentMargin = calculatePortfolioMargin({
      account,
      universe: state.universe,
      marks: {
        ...marks(state),
        [contract.id]: referencePrice,
      },
      atMs: state.nowMs,
      volatilityPpmByContract:
        state.market.impliedVolatilityPpm,
    });
    const equity = markAccountEquity({
      account,
      universe: state.universe,
      marks: marks(state),
    });
    const facility = aggregateFacilityRisk(account);
    if (
      equity <
      currentMargin.initialMarginCents +
        facility.initialRequiredCollateralCents +
        candidateReservationCents +
        candidateTransactionFeeCents
    ) {
      return 'INSUFFICIENT_INITIAL_MARGIN';
    }
    return null;
  }
  const hypothetical = hypotheticalAccountForOrder(
    account,
    contract,
    command.side,
    command.quantity,
    referencePrice,
  );
  const margin = calculatePortfolioMargin({
    account: hypothetical,
    universe: state.universe,
    marks: {
      ...marks(state),
      [contract.id]: referencePrice,
    },
    atMs: state.nowMs,
    volatilityPpmByContract:
      state.market.impliedVolatilityPpm,
  });
  const equity = markAccountEquity({
    account,
    universe: state.universe,
    marks: marks(state),
  });
  const facility = aggregateFacilityRisk(account);
  let premiumReservationCents = 0;
  if (
    contract.type === 'option' &&
    command.side === 'buy'
  ) {
    premiumReservationCents =
      referencePrice *
      command.quantity *
      contract.tickValueCents;
  }
  if (
    unreservedAccountCashCents(account) <
    premiumReservationCents +
      candidateTransactionFeeCents
  ) {
    return 'INSUFFICIENT_OPTION_PREMIUM_CASH';
  }
  if (
    equity <
    margin.initialMarginCents +
      facility.initialRequiredCollateralCents +
      premiumReservationCents +
      candidateTransactionFeeCents
  ) {
    return 'INSUFFICIENT_INITIAL_MARGIN';
  }
  return null;
}

function orderReservationCents(
  state,
  order,
  contract,
  account,
  priorSameSideQuantity = 0,
) {
  if (!activeOrder(order)) return 0;
  const quantity = order.remainingQty;
  const current =
    account.positions[contract.id]?.quantity ?? 0;
  const opening = incrementalOpeningQuantity(
    current,
    order.side,
    quantity,
    priorSameSideQuantity,
  );
  if (opening === 0) return 0;
  if (contract.type === 'future') {
    return ceilBasisPoints(
      opening *
        order.priceTicks *
        contract.tickValueCents,
      contract.initialMarginBps,
    );
  }
  if (order.side === 'buy') {
    return (
      opening *
      order.priceTicks *
      contract.tickValueCents
    );
  }
  return ceilBasisPoints(
    opening *
      referenceSpotTicks(state, contract) *
      contract.tickValueCents,
    1_500,
  );
}

function recomputeReservations(
  state,
  { ensureWritableBook = null } = {},
) {
  for (const account of Object.values(state.accounts)) {
    account.reservedInitialMarginCents = 0;
    account.reservedTransactionFeesCents = 0;
  }
  for (const [
    contractId,
    currentBook,
  ] of Object.entries(state.books)) {
    const contract = contractById(
      state.universe,
      currentBook.symbol,
    );
    const priorQuantityByOwnerSide = new Map();
    const reservations = [];
    let requiresWrite = false;
    for (const order of Object.values(
      currentBook.orders,
    )) {
      if (!activeOrder(order)) {
        reservations.push({
          orderId: order.id,
          reservation: 0,
          feeReservation: 0,
        });
        requiresWrite ||=
          order.reservedInitialMarginCents !== 0 ||
          order.reservedTransactionFeesCents !== 0;
        continue;
      }
      const account = state.accounts[order.ownerId];
      const allocationKey =
        `${order.ownerId}\u0000${order.side}`;
      const priorSameSideQuantity =
        priorQuantityByOwnerSide.get(allocationKey) ?? 0;
      const reservation = orderReservationCents(
        state,
        order,
        contract,
        account,
        priorSameSideQuantity,
      );
      account.reservedInitialMarginCents += reservation;
      const feeReservation =
        maximumOrderTransactionFeeCents(
        contract,
        order.remainingQty,
      );
      account.reservedTransactionFeesCents +=
        feeReservation;
      reservations.push({
        orderId: order.id,
        reservation,
        feeReservation,
      });
      requiresWrite ||=
        order.reservedInitialMarginCents !==
          reservation ||
        order.reservedTransactionFeesCents !==
          feeReservation;
      priorQuantityByOwnerSide.set(
        allocationKey,
        priorSameSideQuantity + order.remainingQty,
      );
    }
    if (!requiresWrite) continue;
    const writableBook = ensureWritableBook
      ? ensureWritableBook(contractId)
      : currentBook;
    for (const {
      orderId,
      reservation,
      feeReservation,
    } of reservations) {
      const writableOrder =
        writableBook.orders[orderId];
      writableOrder.reservedInitialMarginCents =
        reservation;
      writableOrder.reservedTransactionFeesCents =
        feeReservation;
    }
  }
}

function recomputeBookReservations(state, contractId) {
  const book = state.books[contractId];
  const contract = contractById(
    state.universe,
    contractId,
  );
  if (!book || !contract) return;
  for (const order of Object.values(book.orders)) {
    const account = state.accounts[order.ownerId];
    const prior =
      order.reservedInitialMarginCents ?? 0;
    const priorFee =
      order.reservedTransactionFeesCents ?? 0;
    if (account && prior !== 0) {
      account.reservedInitialMarginCents -= prior;
    }
    order.reservedInitialMarginCents = 0;
    if (account && priorFee !== 0) {
      account.reservedTransactionFeesCents -=
        priorFee;
    }
    order.reservedTransactionFeesCents = 0;
  }
  const priorQuantityByOwnerSide = new Map();
  for (const order of Object.values(book.orders)) {
    if (!activeOrder(order)) continue;
    const account = state.accounts[order.ownerId];
    const allocationKey =
      `${order.ownerId}\u0000${order.side}`;
    const priorSameSideQuantity =
      priorQuantityByOwnerSide.get(allocationKey) ?? 0;
    const reservation = orderReservationCents(
      state,
      order,
      contract,
      account,
      priorSameSideQuantity,
    );
    order.reservedInitialMarginCents = reservation;
    account.reservedInitialMarginCents += reservation;
    const feeReservation =
      maximumOrderTransactionFeeCents(
        contract,
        order.remainingQty,
      );
    order.reservedTransactionFeesCents =
      feeReservation;
    account.reservedTransactionFeesCents +=
      feeReservation;
    priorQuantityByOwnerSide.set(
      allocationKey,
      priorSameSideQuantity + order.remainingQty,
    );
  }
}

function refreshRiskState(state, context = {}) {
  context.riskRefreshPasses =
    (context.riskRefreshPasses ?? 0) + 1;
  recomputeReservations(state, context);
  const currentMarks = marks(state);
  for (const account of Object.values(state.accounts)) {
    const margin = calculatePortfolioMargin({
      account,
      universe: state.universe,
      marks: currentMarks,
      atMs: state.nowMs,
      volatilityPpmByContract:
        state.market.impliedVolatilityPpm,
    });
    const equityCents = markAccountEquity({
      account,
      universe: state.universe,
      marks: currentMarks,
    });
    const facility = aggregateFacilityRisk(account);
    let status = 'NORMAL';
    if (
      facility.status === 'LIQUIDATE' ||
      (
        margin.maintenanceMarginCents > 0 &&
        equityCents <
          Math.floor(
            margin.maintenanceMarginCents * 3 / 4,
          )
      )
    ) {
      status = 'LIQUIDATE';
    } else if (
      facility.status === 'MARGIN_CALL' ||
      equityCents < margin.maintenanceMarginCents
    ) {
      status = 'MARGIN_CALL';
    }
    account.riskStatus = status;
    account.risk = {
      atMs: state.nowMs,
      equityCents,
      ...margin,
      financing: facility.financing,
      securitiesLending:
        facility.securitiesLending,
      facilityAggregate: {
        status: facility.status,
        initialRequiredCollateralCents:
          facility.initialRequiredCollateralCents,
        maintenanceRequiredCollateralCents:
          facility.maintenanceRequiredCollateralCents,
        liquidationRequiredCollateralCents:
          facility.liquidationRequiredCollateralCents,
      },
      availableInitialMarginCents:
        equityCents -
        margin.initialMarginCents -
        facility.initialRequiredCollateralCents,
    };
    if (
      account.clearingDefault?.status === 'DEFAULTED'
    ) {
      account.capacityMultiplierBps = 0;
      account.capacityCents = 0;
      account.lifecycleStatus =
        'DEFAULTED_CLOSE_ONLY';
    }
  }
  for (const actorId of Object.keys(state.actors)) {
    updateActorCapacity(state, actorId);
    const actor = state.actors[actorId];
    const account = state.accounts[actor.accountId];
    if (
      account.clearingDefault?.status === 'DEFAULTED'
    ) {
      account.capacityMultiplierBps = 0;
      account.capacityCents = 0;
      account.lifecycleStatus =
        'DEFAULTED_CLOSE_ONLY';
      actor.lifecycleStatus =
        'DEFAULTED_CLOSE_ONLY';
      actor.eliminationReason =
        'CLEARING_DEFAULT';
    }
  }
}

function refreshRiskTimestamps(state) {
  for (const account of Object.values(state.accounts)) {
    if (!account.risk || typeof account.risk !== 'object') {
      throw new Error(
        `Missing derivative risk state for ${account.id}`,
      );
    }
    account.risk.atMs = state.nowMs;
  }
}

function recordTrade(
  state,
  contract,
  fill,
  buyerId,
  sellerId,
  feeDetails,
) {
  const priceBand = futurePriceBand(state, contract);
  const sequence = state.nextTradeSequence;
  const trade = {
    id: nextId(state, 'deriv_trade', 'nextTradeSequence'),
    sequence,
    contractId: contract.id,
    basketIdentity: contractBasketIdentity(contract),
    buyerId,
    sellerId,
    selfTrade: buyerId === sellerId,
    buyerOrderId: fill.buyerOrderId,
    sellerOrderId: fill.sellerOrderId,
    priceTicks: fill.priceTicks,
    quantity: fill.quantity,
    feeScheduleId: contract.feeSchedule.id,
    buyerOpeningQuantity:
      feeDetails.buyer.openingQuantity,
    buyerClosingQuantity:
      feeDetails.buyer.closingQuantity,
    sellerOpeningQuantity:
      feeDetails.seller.openingQuantity,
    sellerClosingQuantity:
      feeDetails.seller.closingQuantity,
    buyerFeeCents: feeDetails.buyer.feeCents,
    sellerFeeCents: feeDetails.seller.feeCents,
    atMs: state.nowMs,
    commitSeq: state.commitSeq + 1,
    priceAuthority: 'matched_order_fill',
    ...(priceBand
      ? {
          referenceSettlementTicks:
            priceBand.referenceTicks,
          limitDownTicks: priceBand.lowerTicks,
          limitUpTicks: priceBand.upperTicks,
        }
      : {}),
  };
  const book = state.books[contract.id];
  const hedgeOrder = [
    book.orders[fill.buyerOrderId],
    book.orders[fill.sellerOrderId],
  ].find((order) => order?.hedge);
  if (hedgeOrder) {
    trade.hedge = cloneJson(hedgeOrder.hedge);
  }
  state.market.trades.push(trade);
  state.market.lastTradePriceTicks[contract.id] =
    fill.priceTicks;
  appendDerivativeTradeSeries(state, trade);
  if (contract.type === 'option') {
    const optionCarry = resolveOptionCarryInputs({
      contract,
      underlying:
        state.universe.underlyings[
          contract.underlyingId
        ],
    });
    const iv = impliedVolatility({
      kind: contract.kind,
      spotTicks: referenceSpotTicks(state, contract),
      strikeTicks: contract.strikeTicks,
      timeToExpiryMs: Math.max(
        0,
        contract.expiryMs - state.nowMs,
      ),
      ...optionCarry,
      marketPriceTicks: fill.priceTicks,
    });
    if (iv.status === 'SOLVED') {
      state.market.impliedVolatilityPpm[contract.id] =
        iv.volatilityPpm;
    } else {
      state.market.impliedVolatilityPpm[contract.id] =
        null;
    }
    trade.impliedVolatility = iv;
    trade.optionCarry = optionCarry;
  }
  return trade;
}

function validateSubmitCommand(state, command) {
  const clearingLiquidation =
    command.source === 'clearing_liquidation';
  const contract = contractById(
    state.universe,
    command.contractId,
  );
  if (!contract) return { reason: 'UNKNOWN_CONTRACT' };
  if (
    contract.status !== 'active' ||
    state.nowMs >= contract.expiryMs
  ) {
    return { reason: 'CONTRACT_NOT_ACTIVE', contract };
  }
  const account = state.accounts[command.actorId];
  if (!account) {
    return { reason: 'UNKNOWN_ACCOUNT', contract };
  }
  if (
    account.lifecycleStatus !== 'ACTIVE' &&
    !clearingLiquidation
  ) {
    return { reason: 'ACCOUNT_NOT_ACTIVE', contract, account };
  }
  if (command.side !== 'buy' && command.side !== 'sell') {
    return { reason: 'INVALID_SIDE', contract, account };
  }
  if (
    command.orderType !== 'limit' &&
    command.orderType !== 'market'
  ) {
    return {
      reason: 'UNSUPPORTED_ORDER_TYPE',
      contract,
      account,
    };
  }
  if (
    command.orderType === 'limit' &&
    (
      !Number.isSafeInteger(command.priceTicks) ||
      command.priceTicks <= 0 ||
      command.priceTicks % contract.tickSize !== 0
    )
  ) {
    return {
      reason: 'INVALID_PRICE_TICKS',
      contract,
      account,
    };
  }
  if (
    command.orderType === 'market' &&
    command.priceTicks !== null &&
    command.priceTicks !== undefined
  ) {
    return {
      reason: 'INVALID_MARKET_PRICE',
      contract,
      account,
    };
  }
  const priceBand = futurePriceBand(state, contract);
  if (
    command.orderType === 'limit' &&
    priceBand &&
    command.priceTicks > priceBand.upperTicks
  ) {
    return {
      reason: 'PRICE_ABOVE_DAILY_LIMIT',
      contract,
      account,
      priceBand,
    };
  }
  if (
    command.orderType === 'limit' &&
    priceBand &&
    command.priceTicks < priceBand.lowerTicks
  ) {
    return {
      reason: 'PRICE_BELOW_DAILY_LIMIT',
      contract,
      account,
      priceBand,
    };
  }
  if (
    !Number.isSafeInteger(command.quantity) ||
    command.quantity <= 0
  ) {
    return {
      reason: 'INVALID_QUANTITY',
      contract,
      account,
    };
  }
  if (command.tif !== 'GTC' && command.tif !== 'IOC') {
    return {
      reason: 'INVALID_TIF',
      contract,
      account,
    };
  }
  if (
    command.orderType === 'market' &&
    command.tif !== 'IOC'
  ) {
    return {
      reason: 'INVALID_MARKET_TIF',
      contract,
      account,
    };
  }
  if (
    command.actorId === 'player' &&
    !clearingLiquidation
  ) {
    const permissionReason = playerPermissionReason(
      state,
      contract,
      command.side,
      command.quantity,
    );
    if (permissionReason) {
      return {
        reason: permissionReason,
        contract,
        account,
      };
    }
  }
  const actorLimitReason = clearingLiquidation
    ? null
    : actorOpenContractLimitReason(
        state,
        command.actorId,
        contract.id,
        command.side,
        command.quantity,
      );
  if (actorLimitReason) {
    return {
      reason: actorLimitReason,
      contract,
      account,
    };
  }
  const riskReason = clearingLiquidation
    ? null
    : validateOrderRisk(
        state,
        command,
        contract,
        account,
      );
  return { reason: riskReason, contract, account };
}

function rejected(type, reason, details = {}) {
  return {
    type,
    status: 'rejected',
    reason,
    ...details,
  };
}

function submitOrder(state, command, context = {}) {
  const validation = validateSubmitCommand(state, command);
  if (validation.reason) {
    return rejected('SUBMIT_ORDER', validation.reason, {
      actorId: command.actorId,
      contractId: command.contractId,
    });
  }
  const { contract } = validation;
  if (
    contract.type === 'option' &&
    command.orderType === 'limit'
  ) {
    const optionCarry = resolveOptionCarryInputs({
      contract,
      underlying:
        state.universe.underlyings[
          contract.underlyingId
        ],
    });
    const bounds = noArbitrageBounds({
      kind: contract.kind,
      spotTicks: referenceSpotTicks(state, contract),
      strikeTicks: contract.strikeTicks,
      timeToExpiryMs: contract.expiryMs - state.nowMs,
      ...optionCarry,
    });
    if (command.priceTicks > bounds.upperTicks) {
      return rejected(
        'SUBMIT_ORDER',
        'OPTION_PRICE_ABOVE_NO_ARBITRAGE_BOUND',
        {
          actorId: command.actorId,
          contractId: contract.id,
          upperTicks: bounds.upperTicks,
        },
      );
    }
  }
  const priceBand = futurePriceBand(state, contract);
  const id =
    command.orderId ??
    nextId(state, 'deriv_order', 'nextOrderSequence');
  const basketIdentity =
    contractBasketIdentity(contract);
  const hedge =
    command.source === 'derivative_actor' &&
    command.hedgePurpose ===
      'option_delta_inventory'
      ? {
          purpose: command.hedgePurpose,
          sourceUnderlyingIds: [
            ...new Set(
              Array.isArray(
                command.hedgeUnderlyingIds,
              )
                ? command.hedgeUnderlyingIds
                : [command.hedgeUnderlyingId].filter(
                    Boolean,
                  ),
            ),
          ].sort((left, right) =>
            left.localeCompare(right),
          ),
          instrumentUnderlyingId:
            command.hedgeInstrumentUnderlyingId,
          mode: command.hedgeMode,
          ratioBps:
            command.hedgeRatioBps ?? null,
          residualBasisRiskBps:
            command.residualBasisRiskBps ?? 0,
        }
      : null;
  const order = {
    id,
    ownerId: command.actorId,
    symbol: contract.id,
    ...(basketIdentity
      ? { basketIdentity }
      : {}),
    side: command.side,
    type: command.orderType,
    priceTicks:
      command.orderType === 'market'
        ? null
        : command.priceTicks,
    ...(command.orderType === 'market'
      ? {
          protectionPriceTicks:
            command.side === 'buy'
              ? priceBand?.upperTicks ?? null
              : priceBand?.lowerTicks ?? null,
        }
      : {}),
    originalQty: command.quantity,
    remainingQty: command.quantity,
    submittedMs: state.nowMs,
    tif:
      command.orderType === 'market' ? 'IOC' : command.tif,
    status: 'accepted',
    source: command.source ?? 'external_command',
    ...(command.actorPolicyId
      ? { actorPolicyId: command.actorPolicyId }
      : {}),
    ...(command.rollGroupId
      ? { rollGroupId: command.rollGroupId }
      : {}),
    ...(hedge ? { hedge } : {}),
    reservedInitialMarginCents: 0,
    reservedTransactionFeesCents: 0,
    commitSeq: state.commitSeq + 1,
  };
  const writableBook =
    context.ensureWritableBook?.(contract.id) ??
    state.books[contract.id];
  const result = submitToBook(writableBook, order);
  if (result.rejected) {
    return rejected(
      'SUBMIT_ORDER',
      result.rejected.reason,
      {
        actorId: command.actorId,
        contractId: contract.id,
      },
    );
  }
  const trades = [];
  for (const fill of result.fills) {
    const book = state.books[contract.id];
    const buyerOrder = book.orders[fill.buyerOrderId];
    const sellerOrder = book.orders[fill.sellerOrderId];
    const buyer = state.accounts[buyerOrder.ownerId];
    const seller = state.accounts[sellerOrder.ownerId];
    const buyerFee = transactionFeeCents(
      contract,
      buyer.positions[contract.id]?.quantity ?? 0,
      'buy',
      fill.quantity,
    );
    const sellerFee = transactionFeeCents(
      contract,
      seller.positions[contract.id]?.quantity ?? 0,
      'sell',
      fill.quantity,
    );
    const optionPremiumCents =
      contract.type === 'option'
        ? fill.priceTicks *
          fill.quantity *
          contract.tickValueCents
        : 0;
    const selfTrade = buyer === seller;
    const feeCashDeficit = selfTrade
      ? buyer.cashCents <
        buyerFee.feeCents + sellerFee.feeCents
      : buyer.cashCents <
          optionPremiumCents + buyerFee.feeCents ||
        seller.cashCents + optionPremiumCents <
          sellerFee.feeCents;
    if (feeCashDeficit) {
      throw new Error(
        `MATCHED_ACCOUNT_FEE_CASH_DEFICIT:${contract.id}`,
      );
    }
    applyMatchedFill({
      accounts: state.accounts,
      contract,
      priceTicks: fill.priceTicks,
      quantity: fill.quantity,
      buyerId: buyerOrder.ownerId,
      sellerId: sellerOrder.ownerId,
    });
    buyer.cashCents -= buyerFee.feeCents;
    seller.cashCents -= sellerFee.feeCents;
    buyer.transactionFeesCents += buyerFee.feeCents;
    seller.transactionFeesCents += sellerFee.feeCents;
    state.clearing.feePoolCents +=
      buyerFee.feeCents + sellerFee.feeCents;
    trades.push(
      recordTrade(
        state,
        contract,
        fill,
        buyerOrder.ownerId,
        sellerOrder.ownerId,
        {
          buyer: buyerFee,
          seller: sellerFee,
        },
      ),
    );
  }
  recomputeBookReservations(state, contract.id);
  const storedOrder =
    state.books[contract.id].orders[id];
  const remainingReason =
    storedOrder.remainingQty === 0
      ? null
      : command.orderType === 'market'
        ? 'INSUFFICIENT_ELIGIBLE_LIQUIDITY'
        : command.tif === 'IOC'
          ? 'IOC_PRICE_PROTECTION_EXHAUSTED'
          : 'RESTING_IN_BOOK';
  return {
    type: 'SUBMIT_ORDER',
    status: 'applied',
    reason: null,
    actorId: command.actorId,
    contractId: contract.id,
    orderId: id,
    orderStatus: storedOrder.status,
    requestedQuantity: command.quantity,
    remainingQuantity: storedOrder.remainingQty,
    quantityUnit: contract.quantityUnit,
    remainingReason,
    marketProtectionTicks:
      storedOrder.protectionPriceTicks ?? null,
    fills: trades,
  };
}

function cancelOrder(state, command, context = {}) {
  let book = state.books[command.contractId];
  if (!book) {
    return rejected('CANCEL_ORDER', 'UNKNOWN_CONTRACT', {
      orderId: command.orderId,
    });
  }
  book =
    context.ensureWritableBook?.(
      command.contractId,
    ) ?? book;
  const result = cancelInBook(
    book,
    command.orderId,
    command.actorId,
  );
  if (!result.cancelled) {
    return rejected('CANCEL_ORDER', result.reason, {
      orderId: command.orderId,
    });
  }
  recomputeBookReservations(
    state,
    command.contractId,
  );
  return {
    type: 'CANCEL_ORDER',
    status: 'applied',
    reason: null,
    orderId: command.orderId,
    contractId: command.contractId,
    actorId: command.actorId,
  };
}

const FACILITY_COLLATERAL_SHAPE_TOTAL_FIELDS =
  Object.freeze([
    'playerCashCents',
    'pledgeableOwnCashCents',
    'restrictedShortSaleProceedsCents',
    'restrictedProceedsFundingDeficitCents',
    'ownedSecuritiesCents',
    'borrowedSecuritiesInCustodyCents',
    'totalSecuritiesCents',
    'otherEligibleAssetsCents',
    'nonDerivativeLiabilitiesCents',
    'nonDerivativeLiabilityShortfallCents',
    'externalCollateralCents',
    'financingDebtCents',
    'borrowedSecuritiesLiabilityCents',
    'eligibleCollateralCents',
  ]);
const FACILITY_COLLATERAL_SECURITY_FIELDS =
  Object.freeze([
    'ownedQuantity',
    'borrowedQuantity',
    'borrowedCustodyQuantity',
    'shortQuantity',
    'referencePriceTicks',
    'ownedValueCents',
    'borrowedCustodyValueCents',
    'restrictedShortSaleProceedsCents',
  ]);
const FACILITY_COLLATERAL_TRACKER_SECURITY_FIELDS =
  Object.freeze([
    'observedBorrowedQuantity',
    'borrowedCustodyQuantity',
    'restrictedShortSaleProceedsCents',
  ]);

function sameStringArray(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function samePrimitiveFields(left, right, fields) {
  return (
    left &&
    right &&
    fields.every((field) => left[field] === right[field])
  );
}

function sameFacilityCollateralTracker(left, right) {
  if (
    !left ||
    !right ||
    left.schemaVersion !== right.schemaVersion ||
    left.classificationStatus !==
      right.classificationStatus ||
    left.lastProcessedMarketCommitSeq !==
      right.lastProcessedMarketCommitSeq ||
    !sameStringArray(
      left.lastProcessedTradeIdsAtCommitSeq,
      right.lastProcessedTradeIdsAtCommitSeq,
    )
  ) {
    return false;
  }
  const leftIds = Object.keys(left.securities ?? {}).sort();
  const rightIds = Object.keys(
    right.securities ?? {},
  ).sort();
  return (
    sameStringArray(leftIds, rightIds) &&
    leftIds.every((securityId) =>
      samePrimitiveFields(
        left.securities[securityId],
        right.securities[securityId],
        FACILITY_COLLATERAL_TRACKER_SECURITY_FIELDS,
      ),
    )
  );
}

function sameFacilityCollateralShapeCore(left, right) {
  if (
    !left ||
    !right ||
    left.schemaVersion !== right.schemaVersion ||
    left.classificationStatus !==
      right.classificationStatus ||
    left.processedThroughMarketCommitSeq !==
      right.processedThroughMarketCommitSeq ||
    !samePrimitiveFields(
      left,
      right,
      FACILITY_COLLATERAL_SHAPE_TOTAL_FIELDS,
    )
  ) {
    return false;
  }
  const leftIds = Object.keys(left.securities ?? {}).sort();
  const rightIds = Object.keys(
    right.securities ?? {},
  ).sort();
  return (
    sameStringArray(leftIds, rightIds) &&
    leftIds.every((securityId) =>
      samePrimitiveFields(
        left.securities[securityId],
        right.securities[securityId],
        FACILITY_COLLATERAL_SECURITY_FIELDS,
      ),
    )
  );
}

function sameFacilityCollateralShape(left, right) {
  return (
    left?.authorityAtMs === right?.authorityAtMs &&
    sameFacilityCollateralShapeCore(left, right)
  );
}

function validFacilityCollateralAuthority(
  authority,
  {
    atMs,
    playerCashCents,
    playerExternalCollateralCents,
    playerFacilityEligibleCollateralCents,
    playerFinancingDebtCents,
  },
) {
  const tracker = authority?.tracker;
  const shape = authority?.shape;
  if (
    !tracker ||
    !shape ||
    tracker.schemaVersion !==
      PLAYER_FACILITY_COLLATERAL_SHAPE_VERSION ||
    shape.schemaVersion !==
      PLAYER_FACILITY_COLLATERAL_SHAPE_VERSION ||
    !['authoritative', 'legacy_unresolved'].includes(
      tracker.classificationStatus,
    ) ||
    shape.classificationStatus !==
      tracker.classificationStatus ||
    !Number.isSafeInteger(
      tracker.lastProcessedMarketCommitSeq,
    ) ||
    tracker.lastProcessedMarketCommitSeq < 0 ||
    shape.processedThroughMarketCommitSeq !==
      tracker.lastProcessedMarketCommitSeq ||
    shape.authorityAtMs !== atMs ||
    shape.playerCashCents !== playerCashCents ||
    shape.externalCollateralCents !==
      playerExternalCollateralCents ||
    shape.eligibleCollateralCents !==
      playerFacilityEligibleCollateralCents ||
    shape.financingDebtCents !==
      playerFinancingDebtCents ||
    !Array.isArray(
      tracker.lastProcessedTradeIdsAtCommitSeq,
    ) ||
    tracker.lastProcessedTradeIdsAtCommitSeq.some(
      (tradeId, index, values) =>
        typeof tradeId !== 'string' ||
        tradeId.length === 0 ||
        (
          index > 0 &&
          values[index - 1].localeCompare(tradeId) >= 0
        ),
    ) ||
    !tracker.securities ||
    typeof tracker.securities !== 'object' ||
    Array.isArray(tracker.securities) ||
    !shape.securities ||
    typeof shape.securities !== 'object' ||
    Array.isArray(shape.securities) ||
    FACILITY_COLLATERAL_SHAPE_TOTAL_FIELDS.some(
      (field) =>
        !Number.isSafeInteger(shape[field]) ||
        shape[field] < 0,
    )
  ) {
    return false;
  }
  const trackerIds = Object.keys(
    tracker.securities,
  ).sort();
  const shapeIds = Object.keys(shape.securities).sort();
  if (!sameStringArray(trackerIds, shapeIds)) {
    return false;
  }
  let ownedSecuritiesCents = 0;
  let borrowedSecuritiesInCustodyCents = 0;
  let totalSecuritiesCents = 0;
  let restrictedShortSaleProceedsCents = 0;
  for (const securityId of trackerIds) {
    const tracked = tracker.securities[securityId];
    const projected = shape.securities[securityId];
    if (
      !tracked ||
      !projected ||
      FACILITY_COLLATERAL_TRACKER_SECURITY_FIELDS.some(
        (field) =>
          !Number.isSafeInteger(tracked[field]) ||
          tracked[field] < 0,
      ) ||
      FACILITY_COLLATERAL_SECURITY_FIELDS.some(
        (field) =>
          !Number.isSafeInteger(projected[field]) ||
          projected[field] < 0,
      ) ||
      projected.referencePriceTicks <= 0 ||
      projected.borrowedCustodyQuantity >
        projected.borrowedQuantity ||
      projected.shortQuantity !==
        projected.borrowedQuantity -
          projected.borrowedCustodyQuantity ||
      projected.ownedValueCents !==
        projected.ownedQuantity *
          projected.referencePriceTicks ||
      projected.borrowedCustodyValueCents !==
        projected.borrowedCustodyQuantity *
          projected.referencePriceTicks ||
      tracked.observedBorrowedQuantity !==
        projected.borrowedQuantity ||
      tracked.borrowedCustodyQuantity !==
        projected.borrowedCustodyQuantity ||
      tracked.restrictedShortSaleProceedsCents !==
        projected.restrictedShortSaleProceedsCents
    ) {
      return false;
    }
    ownedSecuritiesCents += projected.ownedValueCents;
    borrowedSecuritiesInCustodyCents +=
      projected.borrowedCustodyValueCents;
    totalSecuritiesCents +=
      (
        projected.ownedQuantity +
        projected.borrowedCustodyQuantity
      ) * projected.referencePriceTicks;
    restrictedShortSaleProceedsCents +=
      projected.restrictedShortSaleProceedsCents;
  }
  return (
    shape.ownedSecuritiesCents ===
      ownedSecuritiesCents &&
    shape.borrowedSecuritiesInCustodyCents ===
      borrowedSecuritiesInCustodyCents &&
    shape.totalSecuritiesCents === totalSecuritiesCents &&
    shape.restrictedShortSaleProceedsCents ===
      restrictedShortSaleProceedsCents
  );
}

function worldSynchronizationChangesRiskInputs(
  state,
  command,
) {
  const player = state.accounts.player;
  const synchronizedPlayerCashCents =
    command.playerCashCents ?? player.cashCents;
  const playerExternalReservedCashCents =
    command.playerExternalReservedCashCents ??
    player.externalReservedCashCents ??
    0;
  const playerFacilityEligibleCollateralCents =
    command.playerFacilityEligibleCollateralCents ??
    Math.max(
      0,
      synchronizedPlayerCashCents +
        command.playerExternalCollateralCents -
        player.financing.cashDebtCents -
        securitiesLendingRiskState({
          collateralValueCents: 0,
          borrowedSecurities:
            player.borrowedSecurities,
        }).liabilityCents,
    );
  if (
    synchronizedPlayerCashCents !== player.cashCents ||
    command.playerExternalCollateralCents !==
      player.externalCollateralCents ||
    playerExternalReservedCashCents !==
      (player.externalReservedCashCents ?? 0) ||
    playerFacilityEligibleCollateralCents !==
      player.facilityEligibleCollateralCents
  ) {
    return true;
  }
  for (const [underlyingId, spotTicks] of Object.entries(
    command.underlyingSpots ?? {},
  )) {
    if (
      state.universe.underlyings[underlyingId]
        ?.spotTicks !== spotTicks
    ) {
      return true;
    }
  }
  for (const [
    underlyingId,
    versionedReferences,
  ] of Object.entries(
    command.underlyingBasketSpots ?? {},
  )) {
    for (const [
      constituentSetVersion,
      reference,
    ] of Object.entries(versionedReferences ?? {})) {
      if (
        state.universe.equityBasketReferences?.[
          underlyingId
        ]?.[constituentSetVersion]?.spotTicks !==
        reference?.spotTicks
      ) {
        return true;
      }
    }
  }
  for (const [
    underlyingId,
    carryRateBps,
  ] of Object.entries(
    command.underlyingCarryRateBps ?? {},
  )) {
    if (
      state.universe.underlyings[underlyingId]
        ?.carryRateBps !== carryRateBps
    ) {
      return true;
    }
  }
  for (const [
    underlyingId,
    riskFreeRateBps,
  ] of Object.entries(
    command.underlyingRiskFreeRateBps ?? {},
  )) {
    if (
      state.universe.underlyings[underlyingId]
        ?.riskFreeRateBps !== riskFreeRateBps
    ) {
      return true;
    }
  }
  for (const [
    securityId,
    referencePriceTicks,
  ] of Object.entries(
    command.securityReferencePrices ?? {},
  )) {
    if (
      state.market.securityReferencePrices[
        securityId
      ] !== referencePriceTicks
    ) {
      return true;
    }
  }
  return (
    (
      command.regimeSignalBps !== undefined &&
      command.regimeSignalBps !==
        state.market.regimeSignalBps
    ) ||
    (
      command.jumpRiskBps !== undefined &&
      command.jumpRiskBps !==
        state.market.jumpRiskBps
    ) ||
    (
      command.liquidityRiskBps !== undefined &&
      command.liquidityRiskBps !==
        state.market.liquidityRiskBps
    )
  );
}

function synchronizationReferenceInputsAreUnchanged(
  state,
  command,
) {
  for (const [underlyingId, spotTicks] of Object.entries(
    command.underlyingSpots ?? {},
  )) {
    if (
      state.universe.underlyings[underlyingId]
        ?.spotTicks !== spotTicks
    ) {
      return false;
    }
  }
  for (const [
    underlyingId,
    versionedReferences,
  ] of Object.entries(
    command.underlyingBasketSpots ?? {},
  )) {
    if (
      !versionedReferences ||
      typeof versionedReferences !== 'object' ||
      Array.isArray(versionedReferences)
    ) {
      return false;
    }
    for (const [
      constituentSetVersion,
      reference,
    ] of Object.entries(versionedReferences)) {
      const current =
        state.universe.equityBasketReferences?.[
          underlyingId
        ]?.[constituentSetVersion];
      if (
        current?.spotTicks !== reference?.spotTicks ||
        !sameEquityBasketIdentity(
          current?.basketIdentity,
          reference?.basketIdentity,
        )
      ) {
        return false;
      }
    }
  }
  for (const [underlyingId, carryRateBps] of
    Object.entries(
      command.underlyingCarryRateBps ?? {},
    )) {
    if (
      state.universe.underlyings[underlyingId]
        ?.carryRateBps !== carryRateBps
    ) {
      return false;
    }
  }
  for (const [underlyingId, riskFreeRateBps] of
    Object.entries(
      command.underlyingRiskFreeRateBps ?? {},
    )) {
    if (
      state.universe.underlyings[underlyingId]
        ?.riskFreeRateBps !== riskFreeRateBps
    ) {
      return false;
    }
  }
  for (const [securityId, referencePriceTicks] of
    Object.entries(
      command.securityReferencePrices ?? {},
    )) {
    if (
      state.market.securityReferencePrices[
        securityId
      ] !== referencePriceTicks
    ) {
      return false;
    }
  }
  return (
    (
      command.regimeSignalBps === undefined ||
      command.regimeSignalBps ===
        state.market.regimeSignalBps
    ) &&
    (
      command.jumpRiskBps === undefined ||
      command.jumpRiskBps ===
        state.market.jumpRiskBps
    ) &&
    (
      command.liquidityRiskBps === undefined ||
      command.liquidityRiskBps ===
        state.market.liquidityRiskBps
    )
  );
}

function synchronizationCollateralAuthorityIsUnchanged(
  state,
  command,
) {
  const incoming =
    command.playerFacilityCollateralAuthority;
  if (incoming === undefined) return true;
  const player = state.accounts.player;
  return (
    validFacilityCollateralAuthority(incoming, {
      atMs: state.nowMs,
      playerCashCents: player.cashCents,
      playerExternalCollateralCents:
        player.externalCollateralCents,
      playerFacilityEligibleCollateralCents:
        player.facilityEligibleCollateralCents,
      playerFinancingDebtCents:
        player.financing.cashDebtCents,
    }) &&
    sameFacilityCollateralTracker(
      player.facilityCollateralShapeTracker,
      incoming.tracker,
    ) &&
    sameFacilityCollateralShape(
      player.facilityCollateralShape,
      incoming.shape,
    )
  );
}

function canUseExternalReservationSync(
  state,
  command,
  authoritySeal,
) {
  const player = state.accounts.player;
  const reserved =
    command.playerExternalReservedCashCents;
  return (
    command.type === 'SYNC_WORLD' &&
    command.atMs === state.nowMs &&
    command.testingAccessOpen !== true &&
    Number.isSafeInteger(reserved) &&
    reserved >= 0 &&
    reserved !==
      (player.externalReservedCashCents ?? 0) &&
    player.cashCents >=
      player.reservedInitialMarginCents + reserved &&
    command.playerCashCents === player.cashCents &&
    command.playerExternalCollateralCents ===
      player.externalCollateralCents &&
    command.playerFacilityEligibleCollateralCents ===
      player.facilityEligibleCollateralCents &&
    command.totalEquivalentAssetCents ===
      state.access.lastTotalEquivalentAssetCents &&
    state.nowMs - authoritySeal.lastFullAuditAtMs <
      FULL_CADENCE_AUDIT_INTERVAL_MS &&
    synchronizationReferenceInputsAreUnchanged(
      state,
      command,
    ) &&
    synchronizationCollateralAuthorityIsUnchanged(
      state,
      command,
    )
  );
}

function auditIncrementalExternalReservationSync({
  before,
  after,
  receipt,
  reservedCashCents,
}) {
  const errors = [];
  if (
    after.ruleVersion !== before.ruleVersion ||
    after.worldId !== before.worldId ||
    after.worldSeed !== before.worldSeed ||
    after.worldStartedAtMs !== before.worldStartedAtMs ||
    after.nowMs !== before.nowMs
  ) {
    errors.push('INVALID_RESERVATION_SYNC_IDENTITY');
  }
  if (
    after.commitSeq !== before.commitSeq + 1 ||
    after.nextReceiptSequence !==
      before.nextReceiptSequence + 1 ||
    after.nextOrderSequence !==
      before.nextOrderSequence ||
    after.nextTradeSequence !==
      before.nextTradeSequence ||
    receipt.commitSeq !== after.commitSeq ||
    receipt.atMs !== after.nowMs ||
    after.receipts.at(-1) !== receipt
  ) {
    errors.push('INVALID_RESERVATION_SYNC_COMMIT');
  }
  for (const root of [
    'access',
    'universe',
    'actors',
    'books',
    'market',
    'clearing',
  ]) {
    if (after[root] !== before[root]) {
      errors.push(
        `UNEXPECTED_RESERVATION_SYNC_ROOT_CHANGE:${root}`,
      );
    }
  }
  if (
    after.initialTotalCashCents !==
      before.initialTotalCashCents ||
    !sameOwnFieldsExcept(
      before.accounts.player,
      after.accounts.player,
      new Set(['externalReservedCashCents']),
    ) ||
    after.accounts.player.externalReservedCashCents !==
      reservedCashCents ||
    after.accounts.player.risk !==
      before.accounts.player.risk ||
    before.accounts.player.cashCents <
      before.accounts.player.reservedInitialMarginCents +
        reservedCashCents
  ) {
    errors.push('INVALID_RESERVATION_SYNC_PLAYER_ACCOUNT');
  }
  const beforeAccountIds = Object.keys(
    before.accounts,
  ).sort();
  const afterAccountIds = Object.keys(
    after.accounts,
  ).sort();
  if (
    !sameStringArray(beforeAccountIds, afterAccountIds) ||
    beforeAccountIds.some(
      (accountId) =>
        accountId !== 'player' &&
        after.accounts[accountId] !==
          before.accounts[accountId],
    )
  ) {
    errors.push('UNEXPECTED_RESERVATION_SYNC_ACCOUNT_CHANGE');
  }
  const archivedReceiptDelta =
    before.receipts.length >= MAX_RECEIPTS ? 1 : 0;
  const retainedBeforeReceipts = before.receipts.slice(
    Math.max(
      0,
      before.receipts.length -
        (MAX_RECEIPTS - 1),
    ),
  );
  if (
    after.receipts.length !==
      Math.min(MAX_RECEIPTS, before.receipts.length + 1) ||
    after.receipts
      .slice(0, -1)
      .some(
        (record, index) =>
          record !== retainedBeforeReceipts[index],
      ) ||
    after.historyCompaction.archivedReceiptCount !==
      before.historyCompaction.archivedReceiptCount +
        archivedReceiptDelta ||
    after.historyCompaction.archivedTradeCount !==
      before.historyCompaction.archivedTradeCount ||
    after.historyCompaction.archivedOrderCount !==
      before.historyCompaction.archivedOrderCount ||
    after.historyCompaction.archivedContractCount !==
      before.historyCompaction.archivedContractCount ||
    after.historyCompaction.archivedBookCount !==
      before.historyCompaction.archivedBookCount ||
    after.historyCompaction.lastCompactedAtMs !==
      (
        archivedReceiptDelta > 0
          ? after.nowMs
          : before.historyCompaction.lastCompactedAtMs
      )
  ) {
    errors.push('INVALID_RESERVATION_SYNC_HISTORY');
  }
  if (
    receipt.type !== 'SYNC_WORLD' ||
    receipt.status !== 'applied' ||
    receipt.reason !== null ||
    receipt.observationCount !== 0 ||
    receipt.carryObservationCount !== 0 ||
    receipt.riskFreeObservationCount !== 0 ||
    receipt.securityReferenceObservationCount !== 0 ||
    receipt.riskInputsChanged !== true ||
    receipt.testingAccessOpened !== false ||
    receipt.qualificationStatus !==
      before.access.qualification.status
  ) {
    errors.push('INVALID_RESERVATION_SYNC_RECEIPT');
  }
  return { ok: errors.length === 0, errors };
}

function reduceExternalReservationSync(
  state,
  command,
  authoritySeal,
  inputAuditMode,
) {
  const reservedCashCents =
    command.playerExternalReservedCashCents;
  const draft = {
    ...state,
    accounts: {
      ...state.accounts,
      player: {
        ...state.accounts.player,
        externalReservedCashCents:
          reservedCashCents,
      },
    },
    historyCompaction: {
      ...state.historyCompaction,
    },
    receipts: [...state.receipts],
  };
  const receipt = appendReceipt(
    draft,
    {
      type: 'SYNC_WORLD',
      status: 'applied',
      reason: null,
      observationCount: 0,
      carryObservationCount: 0,
      riskFreeObservationCount: 0,
      securityReferenceObservationCount: 0,
      riskInputsChanged: true,
      testingAccessOpened: false,
      qualificationStatus:
        state.access.qualification.status,
    },
    command,
  );
  const audit = auditIncrementalExternalReservationSync({
    before: state,
    after: draft,
    receipt,
    reservedCashCents,
  });
  if (!audit.ok) {
    throw new Error(
      `Derivative external reservation incremental invariant failed: ${audit.errors.join('; ')}`,
    );
  }
  sealIncrementalQuiescentAuthority(
    draft,
    authoritySeal.lastFullAuditAtMs,
  );
  recordDerivativeReducerDiagnostics(draft, {
    commandType: command.type,
    inputAuditMode,
    auditMode: 'incremental',
    riskMode: 'external_reservation_only',
    riskRefreshPasses: 0,
    dirtyBookCount: 0,
    commandCount: 0,
    draftMode: 'reservation_sync_cow',
    actorPreviewIndexMode: 'not_applicable',
    actorPreviewOrderScans: 0,
    actorPreviewCertificateMode: 'not_applicable',
    actorPreviewCertifiedThroughMs: draft.nowMs,
    historyCompactionMode: 'receipt_only',
    sealMode: 'incremental_known_nodes',
  });
  return { state: draft, receipt };
}

function syncWorld(state, command, context = {}) {
  if (
    command.testingAccessOpen !== undefined &&
    typeof command.testingAccessOpen !== 'boolean'
  ) {
    return rejected(
      'SYNC_WORLD',
      'INVALID_TESTING_ACCESS_MODE',
    );
  }
  if (
    command.testingAccessOpen === true &&
    command.source !==
      'explicit_testing_worker_initialization'
  ) {
    return rejected(
      'SYNC_WORLD',
      'UNAUTHORIZED_TESTING_ACCESS_SOURCE',
    );
  }
  nonNegativeInteger(
    command.totalEquivalentAssetCents,
    'totalEquivalentAssetCents',
  );
  if (
    !Number.isSafeInteger(
      command.playerExternalCollateralCents,
    ) ||
    command.playerExternalCollateralCents < 0
  ) {
    return rejected(
      'SYNC_WORLD',
      'INVALID_EXTERNAL_COLLATERAL',
    );
  }
  if (
    command.playerCashCents !== undefined &&
    (
      !Number.isSafeInteger(command.playerCashCents) ||
      command.playerCashCents < 0
    )
  ) {
    return rejected(
      'SYNC_WORLD',
      'INVALID_PLAYER_CASH',
    );
  }
  if (
    command.playerFacilityEligibleCollateralCents !==
      undefined &&
    (
      !Number.isSafeInteger(
        command.playerFacilityEligibleCollateralCents,
      ) ||
      command.playerFacilityEligibleCollateralCents < 0
    )
  ) {
    return rejected(
      'SYNC_WORLD',
      'INVALID_PLAYER_FACILITY_ELIGIBLE_COLLATERAL',
    );
  }
  if (
    command.playerExternalReservedCashCents !== undefined &&
    (
      !Number.isSafeInteger(
        command.playerExternalReservedCashCents,
      ) ||
      command.playerExternalReservedCashCents < 0
    )
  ) {
    return rejected(
      'SYNC_WORLD',
      'INVALID_PLAYER_EXTERNAL_RESERVED_CASH',
    );
  }
  const playerExternalReservedCashCents =
    command.playerExternalReservedCashCents ??
    state.accounts.player.externalReservedCashCents ??
    0;
  const synchronizedPlayerCashCents =
    command.playerCashCents ??
    state.accounts.player.cashCents;
  const synchronizedFacilityEligibleCollateralCents =
    command.playerFacilityEligibleCollateralCents ??
    Math.max(
      0,
      synchronizedPlayerCashCents +
        command.playerExternalCollateralCents -
        state.accounts.player.financing.cashDebtCents -
        securitiesLendingRiskState({
          collateralValueCents: 0,
          borrowedSecurities:
            state.accounts.player.borrowedSecurities,
        }).liabilityCents,
    );
  if (
    synchronizedPlayerCashCents <
    state.accounts.player.reservedInitialMarginCents +
      playerExternalReservedCashCents
  ) {
    return rejected(
      'SYNC_WORLD',
      'PLAYER_CASH_BELOW_ACTIVE_RESERVATIONS',
    );
  }
  const playerCashDeltaCents =
    command.playerCashCents === undefined
      ? 0
      : command.playerCashCents -
        state.accounts.player.cashCents;
  if (
    !Number.isSafeInteger(
      (state.clearing.worldCashBridgeCents ?? 0) -
        playerCashDeltaCents,
    )
  ) {
    return rejected(
      'SYNC_WORLD',
      'PLAYER_CASH_BRIDGE_RANGE_EXCEEDED',
    );
  }
  if (
    command.playerFacilityCollateralAuthority !==
      undefined &&
    !validFacilityCollateralAuthority(
      command.playerFacilityCollateralAuthority,
      {
        atMs: state.nowMs,
        playerCashCents: synchronizedPlayerCashCents,
        playerExternalCollateralCents:
          command.playerExternalCollateralCents,
        playerFacilityEligibleCollateralCents:
          synchronizedFacilityEligibleCollateralCents,
        playerFinancingDebtCents:
          state.accounts.player.financing.cashDebtCents,
      },
    )
  ) {
    return rejected(
      'SYNC_WORLD',
      'INVALID_PLAYER_FACILITY_COLLATERAL_AUTHORITY',
    );
  }
  const observations = [];
  for (const [underlyingId, spotTicks] of Object.entries(
    command.underlyingSpots ?? {},
  )) {
    const underlying =
      state.universe.underlyings[underlyingId];
    if (!underlying || !Number.isSafeInteger(spotTicks) || spotTicks <= 0) {
      return rejected(
        'SYNC_WORLD',
        'INVALID_UNDERLYING_OBSERVATION',
        { underlyingId },
      );
    }
    observations.push({
      underlyingId,
      spotTicks,
      carryRateBps: null,
      atMs: state.nowMs,
      authority: 'world_reference_observation',
      basketIdentity: underlying.basketIdentity
        ? cloneJson(underlying.basketIdentity)
        : null,
    });
  }
  for (const [
    underlyingId,
    versionedReferences,
  ] of Object.entries(
    command.underlyingBasketSpots ?? {},
  )) {
    const underlying =
      state.universe.underlyings[underlyingId];
    if (
      !underlying?.basketIdentity ||
      !versionedReferences ||
      typeof versionedReferences !== 'object' ||
      Array.isArray(versionedReferences)
    ) {
      return rejected(
        'SYNC_WORLD',
        'INVALID_UNDERLYING_BASKET_OBSERVATION',
        { underlyingId },
      );
    }
    for (const [
      constituentSetVersion,
      reference,
    ] of Object.entries(versionedReferences)) {
      const registeredReference =
        state.universe.equityBasketReferences?.[
          underlyingId
        ]?.[constituentSetVersion];
      if (
        !registeredReference ||
        !equityBasketByIdentity(
          registeredReference.basketIdentity,
        )
      ) {
        return rejected(
          'SYNC_WORLD',
          'UNKNOWN_REFERENCE_BASKET_VERSION',
          { underlyingId, constituentSetVersion },
        );
      }
      if (
        !sameEquityBasketIdentity(
          reference?.basketIdentity,
          registeredReference.basketIdentity,
        )
      ) {
        return rejected(
          'SYNC_WORLD',
          'REFERENCE_BASKET_IDENTITY_MISMATCH',
          { underlyingId, constituentSetVersion },
        );
      }
      if (
        !Number.isSafeInteger(reference.spotTicks) ||
        reference.spotTicks <= 0
      ) {
        return rejected(
          'SYNC_WORLD',
          'INVALID_UNDERLYING_BASKET_OBSERVATION',
          { underlyingId, constituentSetVersion },
        );
      }
      observations.push({
        underlyingId,
        spotTicks: reference.spotTicks,
        carryRateBps: null,
        atMs: state.nowMs,
        authority:
          'world_versioned_basket_reference_observation',
        basketIdentity: cloneJson(
          registeredReference.basketIdentity,
        ),
      });
    }
  }
  const carryObservations = [];
  for (const [
    underlyingId,
    carryRateBps,
  ] of Object.entries(
    command.underlyingCarryRateBps ?? {},
  )) {
    const underlying =
      state.universe.underlyings[underlyingId];
    if (
      !underlying ||
      !Number.isSafeInteger(carryRateBps) ||
      carryRateBps < -5_000 ||
      carryRateBps > 5_000
    ) {
      return rejected(
        'SYNC_WORLD',
        'INVALID_UNDERLYING_CARRY_OBSERVATION',
        { underlyingId },
      );
    }
    carryObservations.push({
      underlyingId,
      carryRateBps,
      atMs: state.nowMs,
      authority: 'world_reference_observation',
    });
  }
  const riskFreeObservations = [];
  for (const [
    underlyingId,
    riskFreeRateBps,
  ] of Object.entries(
    command.underlyingRiskFreeRateBps ?? {},
  )) {
    const underlying =
      state.universe.underlyings[underlyingId];
    if (
      !underlying ||
      !Number.isSafeInteger(riskFreeRateBps) ||
      riskFreeRateBps < -5_000 ||
      riskFreeRateBps > 5_000
    ) {
      return rejected(
        'SYNC_WORLD',
        'INVALID_UNDERLYING_RISK_FREE_OBSERVATION',
        { underlyingId },
      );
    }
    riskFreeObservations.push({
      underlyingId,
      riskFreeRateBps,
      atMs: state.nowMs,
      authority: 'world_reference_observation',
    });
  }
  const securityReferenceObservations = [];
  for (const [
    securityId,
    referencePriceTicks,
  ] of Object.entries(
    command.securityReferencePrices ?? {},
  )) {
    if (
      !Object.hasOwn(
        state.clearing.initialLendableSecurities,
        securityId,
      ) ||
      !Number.isSafeInteger(referencePriceTicks) ||
      referencePriceTicks <= 0
    ) {
      return rejected(
        'SYNC_WORLD',
        'INVALID_SECURITY_REFERENCE_OBSERVATION',
        { securityId },
      );
    }
    securityReferenceObservations.push({
      securityId,
      referencePriceTicks,
      atMs: state.nowMs,
      authority: 'world_reference_observation',
    });
  }
  if (command.regimeSignalBps !== undefined) {
    if (!Number.isSafeInteger(command.regimeSignalBps)) {
      return rejected('SYNC_WORLD', 'INVALID_REGIME_SIGNAL');
    }
  }
  if (command.jumpRiskBps !== undefined) {
    nonNegativeInteger(
      command.jumpRiskBps,
      'jumpRiskBps',
    );
  }
  if (command.liquidityRiskBps !== undefined) {
    nonNegativeInteger(
      command.liquidityRiskBps,
      'liquidityRiskBps',
    );
  }
  const riskInputsChanged =
    worldSynchronizationChangesRiskInputs(
      state,
      command,
    );

  if (command.testingAccessOpen === true) {
    state.access = createTestingOpenAccessState({
      worldStartedAtMs: state.worldStartedAtMs,
      atMs: state.nowMs,
      totalEquivalentAssetCents:
        command.totalEquivalentAssetCents,
      source: command.source,
    });
  }
  state.access = observeEligibility(state.access, {
    atMs: state.nowMs,
    totalEquivalentAssetCents:
      command.totalEquivalentAssetCents,
  });
  state.accounts.player.externalCollateralCents =
    command.playerExternalCollateralCents;
  state.accounts.player.facilityEligibleCollateralCents =
    synchronizedFacilityEligibleCollateralCents;
  if (
    command.playerFacilityCollateralAuthority !==
    undefined
  ) {
    const incoming =
      command.playerFacilityCollateralAuthority;
    if (
      !sameFacilityCollateralTracker(
        state.accounts.player
          .facilityCollateralShapeTracker,
        incoming.tracker,
      )
    ) {
      state.accounts.player
        .facilityCollateralShapeTracker =
        cloneJson(incoming.tracker);
    }
    const currentShape =
      state.accounts.player
        .facilityCollateralShape;
    state.accounts.player.facilityCollateralShape =
      sameFacilityCollateralShapeCore(
        currentShape,
        incoming.shape,
      )
        ? {
            ...currentShape,
            authorityAtMs:
              incoming.shape.authorityAtMs,
          }
        : cloneJson(incoming.shape);
    context.facilityCollateralAuthority = {
      expectedTracker: incoming.tracker,
      expectedShape: incoming.shape,
    };
  }
  state.accounts.player.externalReservedCashCents =
    playerExternalReservedCashCents;
  if (command.playerCashCents !== undefined) {
    state.accounts.player.cashCents = command.playerCashCents;
    if (playerCashDeltaCents !== 0) {
      state.clearing.worldCashBridgeCents =
        (state.clearing.worldCashBridgeCents ?? 0) -
        playerCashDeltaCents;
    }
  }
  for (const observation of observations) {
    const underlying =
      state.universe.underlyings[
        observation.underlyingId
      ];
    const currentBasketObservation =
      !observation.basketIdentity ||
      sameEquityBasketIdentity(
        observation.basketIdentity,
        underlying.basketIdentity,
      );
    if (currentBasketObservation) {
      underlying.spotTicks = observation.spotTicks;
      underlying.observationAtMs = state.nowMs;
    }
    if (observation.basketIdentity) {
      const references =
        state.universe.equityBasketReferences?.[
          observation.underlyingId
        ];
      const reference =
        references?.[
          observation.basketIdentity
            .constituentSetVersion
        ];
      if (reference) {
        reference.spotTicks = observation.spotTicks;
        reference.observationAtMs = state.nowMs;
        reference.authority = observation.authority;
      }
    }
  }
  for (const observation of carryObservations) {
    const underlying =
      state.universe.underlyings[
        observation.underlyingId
      ];
    underlying.carryRateBps =
      observation.carryRateBps;
    underlying.observationAtMs = state.nowMs;
    const spotObservation = observations.find(
      (candidate) =>
        candidate.underlyingId ===
        observation.underlyingId,
    );
    if (spotObservation) {
      spotObservation.carryRateBps =
        observation.carryRateBps;
    }
  }
  for (const observation of riskFreeObservations) {
    const underlying =
      state.universe.underlyings[
        observation.underlyingId
      ];
    underlying.riskFreeRateBps =
      observation.riskFreeRateBps;
    underlying.observationAtMs = state.nowMs;
  }
  for (const observation of securityReferenceObservations) {
    state.market.securityReferencePrices[
      observation.securityId
    ] = observation.referencePriceTicks;
    for (const account of Object.values(state.accounts)) {
      const loan =
        account.borrowedSecurities[
          observation.securityId
        ];
      if (
        loan &&
        loan.referencePriceTicks !==
          observation.referencePriceTicks
      ) {
        loan.referencePriceTicks =
          observation.referencePriceTicks;
      }
    }
  }
  state.market.referenceObservations.push(...observations);
  if (
    state.market.referenceObservations.length >
    MAX_REFERENCE_OBSERVATIONS
  ) {
    state.market.referenceObservations.splice(
      0,
      state.market.referenceObservations.length -
        MAX_REFERENCE_OBSERVATIONS,
    );
  }
  if (command.regimeSignalBps !== undefined) {
    state.market.regimeSignalBps =
      command.regimeSignalBps;
  }
  if (command.jumpRiskBps !== undefined) {
    state.market.jumpRiskBps = command.jumpRiskBps;
  }
  if (command.liquidityRiskBps !== undefined) {
    state.market.liquidityRiskBps =
      command.liquidityRiskBps;
  }
  return {
    type: 'SYNC_WORLD',
    status: 'applied',
    reason: null,
    observationCount: observations.length,
    carryObservationCount:
      carryObservations.length,
    riskFreeObservationCount:
      riskFreeObservations.length,
    securityReferenceObservationCount:
      securityReferenceObservations.length,
    riskInputsChanged,
    testingAccessOpened:
      command.testingAccessOpen === true,
    qualificationStatus:
      state.access.qualification.status,
  };
}

function enableAccessPermission(state, command) {
  const result = enablePermission(
    state.access,
    command.permission,
    state.nowMs,
  );
  state.access = result.state;
  return {
    ...result.receipt,
    type: 'ENABLE_PERMISSION',
  };
}

function institutionalFacilityDemandBps(state) {
  return Math.min(
    4_000,
    Math.max(
      0,
      -state.market.regimeSignalBps,
    ) +
      Math.max(0, state.market.jumpRiskBps - 200) +
      Math.max(
        0,
        state.market.liquidityRiskBps - 100,
      ),
  );
}

function rebalanceInstitutionalFacilities(state) {
  const facilityActions = [];
  const demandBps =
    institutionalFacilityDemandBps(state);
  const creditAccount =
    state.accounts[NPC_CREDIT_BORROWER_ID];
  if (creditAccount) {
    const targetDebtCents = Math.floor(
      creditAccount.capacityCents *
        demandBps /
        BPS,
    );
    const debtDeltaCents =
      targetDebtCents -
      creditAccount.financing.cashDebtCents;
    if (debtDeltaCents > 0) {
      facilityActions.push(
        drawMarginCredit(state, {
          type: 'DRAW_MARGIN_CREDIT',
          atMs: state.nowMs,
          actorId: NPC_CREDIT_BORROWER_ID,
          amountCents: debtDeltaCents,
          source:
            'institutional_facility_risk_budget',
        }),
      );
    } else if (debtDeltaCents < 0) {
      const repayableCents = Math.min(
        -debtDeltaCents,
        creditAccount.financing.cashDebtCents,
        unreservedAccountCashCents(creditAccount),
      );
      if (repayableCents > 0) {
        facilityActions.push(
          repayMarginCredit(state, {
            type: 'REPAY_MARGIN_CREDIT',
            atMs: state.nowMs,
            actorId: NPC_CREDIT_BORROWER_ID,
            amountCents: repayableCents,
            source:
              'institutional_facility_risk_budget',
          }),
        );
      }
    }
  }

  const lendingAccount =
    state.accounts[NPC_SECURITIES_BORROWER_ID];
  if (lendingAccount) {
    for (const securityId of Object.keys(
      state.clearing.initialLendableSecurities,
    ).sort()) {
      const initialQuantity =
        state.clearing.initialLendableSecurities[
          securityId
        ];
      if (
        !Number.isSafeInteger(initialQuantity) ||
        initialQuantity <= 0
      ) {
        continue;
      }
      const targetQuantity = Math.floor(
        initialQuantity * demandBps / BPS,
      );
      const loan =
        lendingAccount.borrowedSecurities[securityId];
      const currentQuantity = loan?.quantity ?? 0;
      const quantityDelta =
        targetQuantity - currentQuantity;
      if (quantityDelta > 0) {
        const referencePriceTicks =
          state.market.securityReferencePrices[
            securityId
          ];
        if (
          !Number.isSafeInteger(referencePriceTicks) ||
          referencePriceTicks <= 0
        ) {
          continue;
        }
        facilityActions.push(
          borrowSecurity(state, {
            type: 'BORROW_SECURITY',
            atMs: state.nowMs,
            actorId:
              NPC_SECURITIES_BORROWER_ID,
            securityId,
            quantity: quantityDelta,
            referencePriceTicks,
            source:
              'institutional_lending_inventory_budget',
          }),
        );
      } else if (quantityDelta < 0) {
        facilityActions.push(
          returnSecurity(state, {
            type: 'RETURN_SECURITY',
            atMs: state.nowMs,
            actorId: NPC_SECURITIES_BORROWER_ID,
            securityId,
            quantity: -quantityDelta,
            source:
              'institutional_lending_inventory_budget',
          }),
        );
      }
    }
  }
  return facilityActions;
}

function institutionalFacilitiesAreQuiescent(state) {
  if (institutionalFacilityDemandBps(state) !== 0) {
    return false;
  }
  const creditAccount =
    state.accounts[NPC_CREDIT_BORROWER_ID];
  const lendingAccount =
    state.accounts[NPC_SECURITIES_BORROWER_ID];
  return (
    (creditAccount?.financing.cashDebtCents ?? 0) === 0 &&
    Object.values(
      lendingAccount?.borrowedSecurities ?? {},
    ).every((loan) => (loan?.quantity ?? 0) === 0)
  );
}

function activeOrderIndexByOwner(
  state,
  previewDiagnostics = {},
) {
  const cached =
    activeOrderIndexesByBooksRoot.get(state.books);
  if (cached) {
    previewDiagnostics.actorPreviewIndexMode = 'reused';
    previewDiagnostics.actorPreviewOrderScans = 0;
    return cached;
  }
  const activeOrdersByOwner = new Map();
  let scannedOrderCount = 0;
  for (const book of Object.values(state.books)) {
    for (const order of Object.values(book.orders)) {
      scannedOrderCount += 1;
      if (!activeOrder(order)) continue;
      const ownerEntry =
        activeOrdersByOwner.get(order.ownerId) ?? {
          activeOrders: [],
          standingQuoteIndex: null,
        };
      const ownerOrders = ownerEntry.activeOrders;
      ownerOrders.push(order);
      activeOrdersByOwner.set(
        order.ownerId,
        ownerEntry,
      );
    }
  }
  for (const [ownerId, entry] of activeOrdersByOwner) {
    const activeOrders = Object.freeze(
      entry.activeOrders,
    );
    activeOrdersByOwner.set(
      ownerId,
      Object.freeze({
        activeOrders,
        standingQuoteIndex:
          createStandingQuoteIndex(activeOrders),
      }),
    );
  }
  activeOrderIndexesByBooksRoot.set(
    state.books,
    activeOrdersByOwner,
  );
  previewDiagnostics.actorPreviewIndexMode = 'built';
  previewDiagnostics.actorPreviewOrderScans =
    scannedOrderCount;
  return activeOrdersByOwner;
}

function actorCycleHasCommandsAt(
  state,
  atMs,
  previewDiagnostics = {},
) {
  const previewState =
    state.nowMs === atMs
      ? state
      : {
          ...state,
          nowMs: atMs,
        };
  const activeOrdersByOwner = activeOrderIndexByOwner(
    state,
    previewDiagnostics,
  );
  for (const actorId of Object.keys(state.actors)) {
    const actor = state.actors[actorId];
    const ownerEntry =
      activeOrdersByOwner.get(actor.accountId);
    const commands = deriveActorCommands(
      previewState,
      actorId,
      atMs,
      {
        activeOrders:
          ownerEntry?.activeOrders ?? [],
        activeOrdersAreCanonical: true,
        standingQuoteIndex:
          ownerEntry?.standingQuoteIndex ??
          createStandingQuoteIndex([]),
      },
    );
    if (commands.length > 0) return true;
  }
  return false;
}

function actorQuiescenceCertificateHorizonMs(
  state,
  atMs,
) {
  let throughMs =
    atMs + MAX_ACTOR_QUIESCENCE_CERTIFICATE_MS;
  const earliestExpiryMs = allContracts(state.universe)
    .filter(
      (contract) =>
        contract.status === 'active' &&
        contract.expiryMs > atMs,
    )
    .reduce(
      (minimum, contract) =>
        Math.min(minimum, contract.expiryMs),
      Number.POSITIVE_INFINITY,
    );
  if (earliestExpiryMs <= throughMs) {
    throughMs = Math.max(
      atMs,
      Math.floor(
        (earliestExpiryMs - 1) /
          DERIVATIVE_ACTOR_CADENCE_MS,
      ) * DERIVATIVE_ACTOR_CADENCE_MS,
    );
  }
  return throughMs;
}

function actorCycleIsCertifiedQuiescentAt(
  state,
  atMs,
  previewDiagnostics,
) {
  const cached =
    actorQuiescenceCertificatesByBooksRoot.get(
      state.books,
    );
  if (cached && atMs <= cached.throughMs) {
    previewDiagnostics.actorPreviewCertificateMode =
      'reused';
    previewDiagnostics.actorPreviewIndexMode =
      'reused';
    previewDiagnostics.actorPreviewOrderScans = 0;
    previewDiagnostics.actorPreviewCertifiedThroughMs =
      cached.throughMs;
    return true;
  }
  const currentDiagnostics = {};
  if (
    actorCycleHasCommandsAt(
      state,
      atMs,
      currentDiagnostics,
    )
  ) {
    Object.assign(
      previewDiagnostics,
      currentDiagnostics,
      {
        actorPreviewCertificateMode:
          'current_commands',
        actorPreviewCertifiedThroughMs: atMs,
      },
    );
    return false;
  }
  const throughMs =
    actorQuiescenceCertificateHorizonMs(state, atMs);
  if (throughMs > atMs) {
    const horizonDiagnostics = {};
    if (
      !actorCycleHasCommandsAt(
        state,
        throughMs,
        horizonDiagnostics,
      )
    ) {
      const certificate = Object.freeze({
        verifiedAtMs: atMs,
        throughMs,
      });
      actorQuiescenceCertificatesByBooksRoot.set(
        state.books,
        certificate,
      );
      Object.assign(
        previewDiagnostics,
        currentDiagnostics,
        {
          actorPreviewCertificateMode: 'built',
          actorPreviewCertifiedThroughMs: throughMs,
        },
      );
      return true;
    }
  }
  Object.assign(
    previewDiagnostics,
    currentDiagnostics,
    {
      actorPreviewCertificateMode:
        'horizon_has_commands',
      actorPreviewCertifiedThroughMs: atMs,
    },
  );
  return true;
}

function canonicalCadenceWorldInputsMatch(
  state,
  command,
) {
  if (
    command.type !== 'ADVANCE_MARKET_CADENCE' ||
    !Number.isSafeInteger(
      command.totalEquivalentAssetCents,
    ) ||
    command.totalEquivalentAssetCents < 0 ||
    !Number.isSafeInteger(
      command.playerExternalCollateralCents,
    ) ||
    command.playerExternalCollateralCents < 0 ||
    (
      command.playerCashCents !== undefined &&
      (
        !Number.isSafeInteger(command.playerCashCents) ||
        command.playerCashCents < 0
      )
    ) ||
    (
      command.playerExternalReservedCashCents !==
        undefined &&
      (
        !Number.isSafeInteger(
          command.playerExternalReservedCashCents,
        ) ||
        command.playerExternalReservedCashCents < 0
      )
    ) ||
    (
      command.playerFacilityEligibleCollateralCents !==
        undefined &&
      (
        !Number.isSafeInteger(
          command.playerFacilityEligibleCollateralCents,
        ) ||
        command.playerFacilityEligibleCollateralCents < 0
      )
    )
  ) {
    return false;
  }
  for (const [underlyingId, spotTicks] of Object.entries(
    command.underlyingSpots ?? {},
  )) {
    if (
      !state.universe.underlyings[underlyingId] ||
      !Number.isSafeInteger(spotTicks) ||
      spotTicks <= 0
    ) {
      return false;
    }
  }
  for (const [
    underlyingId,
    versionedReferences,
  ] of Object.entries(
    command.underlyingBasketSpots ?? {},
  )) {
    if (
      !versionedReferences ||
      typeof versionedReferences !== 'object' ||
      Array.isArray(versionedReferences)
    ) {
      return false;
    }
    for (const [
      constituentSetVersion,
      reference,
    ] of Object.entries(versionedReferences)) {
      const registered =
        state.universe.equityBasketReferences?.[
          underlyingId
        ]?.[constituentSetVersion];
      if (
        !registered ||
        !sameEquityBasketIdentity(
          reference?.basketIdentity,
          registered.basketIdentity,
        ) ||
        !Number.isSafeInteger(reference?.spotTicks) ||
        reference.spotTicks <= 0
      ) {
        return false;
      }
    }
  }
  for (const [underlyingId, rateBps] of [
    ...Object.entries(
      command.underlyingCarryRateBps ?? {},
    ),
    ...Object.entries(
      command.underlyingRiskFreeRateBps ?? {},
    ),
  ]) {
    if (
      !state.universe.underlyings[underlyingId] ||
      !Number.isSafeInteger(rateBps) ||
      rateBps < -5_000 ||
      rateBps > 5_000
    ) {
      return false;
    }
  }
  for (const [
    securityId,
    referencePriceTicks,
  ] of Object.entries(
    command.securityReferencePrices ?? {},
  )) {
    if (
      !Object.hasOwn(
        state.clearing.initialLendableSecurities,
        securityId,
      ) ||
      !Number.isSafeInteger(referencePriceTicks) ||
      referencePriceTicks <= 0
    ) {
      return false;
    }
  }
  if (
    (
      command.regimeSignalBps !== undefined &&
      !Number.isSafeInteger(command.regimeSignalBps)
    ) ||
    (
      command.jumpRiskBps !== undefined &&
      (
        !Number.isSafeInteger(command.jumpRiskBps) ||
        command.jumpRiskBps < 0
      )
    ) ||
    (
      command.liquidityRiskBps !== undefined &&
      (
        !Number.isSafeInteger(
          command.liquidityRiskBps,
        ) ||
        command.liquidityRiskBps < 0
      )
    )
  ) {
    return false;
  }
  const synchronizedCash =
    command.playerCashCents ??
    state.accounts.player.cashCents;
  const synchronizedReserved =
    command.playerExternalReservedCashCents ??
    state.accounts.player.externalReservedCashCents ??
    0;
  if (
    synchronizedCash <
    state.accounts.player.reservedInitialMarginCents +
      synchronizedReserved
  ) {
    return false;
  }
  if (
    command.playerFacilityCollateralAuthority !==
      undefined &&
    !sameFacilityCollateralTracker(
      state.accounts.player
        .facilityCollateralShapeTracker,
      command.playerFacilityCollateralAuthority.tracker,
    )
  ) {
    return false;
  }
  return !worldSynchronizationChangesRiskInputs(
    state,
    command,
  );
}

function canUseQuiescentCadenceDraft(
  state,
  command,
  previewDiagnostics = {},
) {
  if (
    hasTimeSensitiveRiskExposure(state) ||
    !institutionalFacilitiesAreQuiescent(state) ||
    allContracts(state.universe).some(
      (contract) => contract.status === 'expired',
    )
  ) {
    return false;
  }
  if (
    command.type === 'ADVANCE_MARKET_CADENCE' &&
    !canonicalCadenceWorldInputsMatch(state, command)
  ) {
    return false;
  }
  if (
    command.type !== 'ADVANCE_MARKET_CADENCE' &&
    command.type !== 'RUN_ACTOR_CYCLE'
  ) {
    return false;
  }
  return actorCycleIsCertifiedQuiescentAt(
    state,
    command.atMs,
    previewDiagnostics,
  );
}

function recordActorDecisionSpotReferences(
  state,
  actor,
) {
  if (
    !Object.hasOwn(
      actor,
      'lastObservedSpotTicksByUnderlying',
    )
  ) {
    return;
  }
  const nextReferences = Object.fromEntries(
    Object.values(state.universe.underlyings).map(
      (underlying) => [
        underlying.id,
        underlying.spotTicks,
      ],
    ),
  );
  const previousReferences =
    actor.lastObservedSpotTicksByUnderlying;
  if (
    previousReferences &&
    Object.keys(previousReferences).length ===
      Object.keys(nextReferences).length &&
    Object.entries(nextReferences).every(
      ([underlyingId, spotTicks]) =>
        previousReferences[underlyingId] === spotTicks,
    )
  ) {
    return;
  }
  actor.lastObservedSpotTicksByUnderlying =
    nextReferences;
}

function createProfessionalEcologyState() {
  return {
    schemaVersion: PROFESSIONAL_ECOLOGY_STATE_SCHEMA,
    ruleVersion: PROFESSIONAL_ECOLOGY_CONTROL_VERSION,
    authority: 'controller_policy_only',
    integrationStatus: 'production_replacement_gate',
    executionMode: 'replace_existing_actor_batch',
    policiesByActorId: {},
  };
}

function professionalActorPolicyReason(
  state,
  actorId,
  policy,
) {
  if (
    !policy ||
    typeof policy !== 'object' ||
    Array.isArray(policy) ||
    policy.schemaVersion !==
      PROFESSIONAL_ECOLOGY_POLICY_SCHEMA ||
    typeof policy.controlId !== 'string' ||
    policy.controlId.length === 0 ||
    typeof policy.enabled !== 'boolean' ||
    !Number.isSafeInteger(policy.intensityBps) ||
    policy.intensityBps < 0 ||
    policy.intensityBps > BPS ||
    !Number.isSafeInteger(policy.maxSubmitCommands) ||
    policy.maxSubmitCommands < 0 ||
    policy.maxSubmitCommands >
      MAX_PROFESSIONAL_SUBMIT_COMMANDS ||
    !Number.isSafeInteger(policy.maxContractsPerOrder) ||
    policy.maxContractsPerOrder < 1 ||
    !Number.isSafeInteger(policy.maxBatchNotionalCents) ||
    policy.maxBatchNotionalCents < 1 ||
    !Array.isArray(policy.allowedContractTypes) ||
    policy.allowedContractTypes.length === 0 ||
    new Set(policy.allowedContractTypes).size !==
      policy.allowedContractTypes.length ||
    policy.allowedContractTypes.some(
      (type) => type !== 'future' && type !== 'option',
    )
  ) {
    return 'PROFESSIONAL_ACTOR_POLICY_INVALID';
  }
  const actor = state.actors?.[actorId];
  if (!actor || actor.accountId !== actorId) {
    return 'PROFESSIONAL_ACTOR_UNKNOWN';
  }
  return null;
}

function setProfessionalActorControl(state, command) {
  if (
    command.source !==
      'controller_professional_ecology_policy'
  ) {
    return rejected(
      'SET_PROFESSIONAL_ACTOR_CONTROL',
      'CONTROLLER_AUTHORITY_REQUIRED',
    );
  }
  const actorId = command.actorId;
  const policy = {
    schemaVersion: PROFESSIONAL_ECOLOGY_POLICY_SCHEMA,
    controlId: command.policy?.controlId,
    enabled: command.policy?.enabled,
    intensityBps: command.policy?.intensityBps,
    maxSubmitCommands:
      command.policy?.maxSubmitCommands,
    maxContractsPerOrder:
      command.policy?.maxContractsPerOrder,
    maxBatchNotionalCents:
      command.policy?.maxBatchNotionalCents,
    allowedContractTypes: Array.isArray(
      command.policy?.allowedContractTypes,
    )
      ? [...command.policy.allowedContractTypes]
      : command.policy?.allowedContractTypes,
  };
  const reason = professionalActorPolicyReason(
    state,
    actorId,
    policy,
  );
  if (reason) {
    return rejected(
      'SET_PROFESSIONAL_ACTOR_CONTROL',
      reason,
    );
  }
  state.market.professionalEcology
    .policiesByActorId[actorId] = policy;
  return {
    type: 'SET_PROFESSIONAL_ACTOR_CONTROL',
    status: 'applied',
    reason: null,
    actorId,
    integrationStatus: 'production_replacement_gate',
    executionMode: 'replace_existing_actor_batch',
    policy: cloneJson(policy),
  };
}

function controlledProfessionalActorBatch(
  state,
  actorId,
  candidateCommands,
) {
  const policy = state.market.professionalEcology
    ?.policiesByActorId?.[actorId];
  if (!policy?.enabled) {
    return {
      commands: candidateCommands,
      evidence: null,
    };
  }
  const batch = constrainDerivativeActorCommands({
    state,
    actorId,
    atMs: state.nowMs,
    candidateCommands,
    control: {
      schemaVersion: PROFESSIONAL_ECOLOGY_CONTROL_SCHEMA,
      controlId: policy.controlId,
      active: true,
      observedCommitSeq: state.commitSeq,
      issuedAtMs: state.nowMs,
      expiresAtMs: state.nowMs,
      intensityBps: policy.intensityBps,
      maxSubmitCommands: policy.maxSubmitCommands,
      maxContractsPerOrder: policy.maxContractsPerOrder,
      maxBatchNotionalCents:
        policy.maxBatchNotionalCents,
      allowedContractTypes: [
        ...policy.allowedContractTypes,
      ],
    },
  });
  return {
    commands: batch.commands,
    evidence: {
      actorId,
      controlId: policy.controlId,
      status: batch.status,
      executionMode: batch.executionMode,
      reasonCodes: [...batch.reasonCodes],
      ...batch.controlProof,
    },
  };
}

function professionalEcologyCycleSummary(actorBatches = []) {
  return {
    schemaVersion: PROFESSIONAL_ECOLOGY_STATE_SCHEMA,
    ruleVersion: PROFESSIONAL_ECOLOGY_CONTROL_VERSION,
    authority: 'controller_policy_before_derivatives_reducer',
    integrationStatus: 'production_replacement_gate',
    executionMode: 'replace_existing_actor_batch',
    controlledActorCount: actorBatches.length,
    actorBatches,
  };
}

function actorCycle(state, context = {}) {
  const actorIds = Object.keys(state.actors).sort(
    (left, right) =>
      state.actors[left].decisionPriority -
        state.actors[right].decisionPriority ||
      left.localeCompare(right),
  );
  if (
    state.market.lastActorCycleAtMs !== null &&
    state.nowMs < state.market.nextActorCycleAtMs
  ) {
    return {
      type: 'RUN_ACTOR_CYCLE',
      status: 'applied',
      reason: null,
      duplicate: true,
      actorCount: actorIds.length,
      commandCount: 0,
      tradeCount: 0,
      commandSummary: {
        appliedCount: 0,
        rejectedCount: 0,
        submitCount: 0,
        cancelCount: 0,
        rejectionReasons: {},
      },
      facilityActions: [],
      professionalEcology:
        professionalEcologyCycleSummary(),
      lastActorCycleAtMs:
        state.market.lastActorCycleAtMs,
      nextActorCycleAtMs:
        state.market.nextActorCycleAtMs,
    };
  }
  if (context.quiescentActorPreview === true) {
    for (const actorId of actorIds) {
      const actor = state.actors[actorId];
      actor.lastDecisionAtMs = state.nowMs;
      actor.decisionCount += 1;
      recordActorDecisionSpotReferences(
        state,
        actor,
      );
    }
    state.market.lastActorCycleAtMs = state.nowMs;
    state.market.nextActorCycleAtMs =
      state.nowMs + DERIVATIVE_ACTOR_CADENCE_MS;
    return {
      type: 'RUN_ACTOR_CYCLE',
      status: 'applied',
      reason: null,
      duplicate: false,
      actorCount: actorIds.length,
      commandCount: 0,
      tradeCount: 0,
      commandSummary: {
        appliedCount: 0,
        rejectedCount: 0,
        submitCount: 0,
        cancelCount: 0,
        rejectionReasons: {},
      },
      facilityActions: [],
      professionalEcology:
        professionalEcologyCycleSummary(),
      lastActorCycleAtMs:
        state.market.lastActorCycleAtMs,
      nextActorCycleAtMs:
        state.market.nextActorCycleAtMs,
    };
  }
  const activeOrderLocationsByOwner = new Map();
  for (const book of Object.values(state.books)) {
    for (const order of Object.values(book.orders)) {
      if (!activeOrder(order)) continue;
      const ownerLocations =
        activeOrderLocationsByOwner.get(
          order.ownerId,
        ) ?? [];
      ownerLocations.push({
        contractId: book.symbol,
        orderId: order.id,
      });
      activeOrderLocationsByOwner.set(
        order.ownerId,
        ownerLocations,
      );
    }
  }
  const commandSummary = {
    appliedCount: 0,
    rejectedCount: 0,
    submitCount: 0,
    cancelCount: 0,
    rejectionReasons: {},
  };
  let commandCount = 0;
  const tradesBefore = state.market.trades.length;
  const professionalActorBatches = [];
  const facilityActions =
    rebalanceInstitutionalFacilities(state);
  for (const actorId of actorIds) {
    const actor = state.actors[actorId];
    const candidateCommands = deriveActorCommands(
      state,
      actorId,
      state.nowMs,
      {
        activeOrders: (
          activeOrderLocationsByOwner.get(
            actor.accountId,
          ) ?? []
        ).map(
          ({ contractId, orderId }) =>
            state.books[contractId].orders[
              orderId
            ],
        ),
      },
    );
    const controlled = controlledProfessionalActorBatch(
      state,
      actorId,
      candidateCommands,
    );
    if (controlled.evidence) {
      professionalActorBatches.push(
        controlled.evidence,
      );
    }
    const commands = controlled.commands;
    for (const command of commands) {
      const receipt =
        command.type === 'CANCEL_ORDER'
          ? cancelOrder(state, command, context)
          : submitOrder(state, command, context);
      commandCount += 1;
      if (command.type === 'CANCEL_ORDER') {
        commandSummary.cancelCount += 1;
      } else {
        commandSummary.submitCount += 1;
      }
      if (receipt.status === 'applied') {
        commandSummary.appliedCount += 1;
      } else {
        commandSummary.rejectedCount += 1;
        const reason = receipt.reason ?? 'UNKNOWN';
        commandSummary.rejectionReasons[reason] =
          (commandSummary.rejectionReasons[reason] ?? 0) +
          1;
      }
    }
    actor.lastDecisionAtMs = state.nowMs;
    actor.decisionCount += 1;
    recordActorDecisionSpotReferences(state, actor);
  }
  state.market.lastActorCycleAtMs = state.nowMs;
  state.market.nextActorCycleAtMs =
    state.nowMs + DERIVATIVE_ACTOR_CADENCE_MS;
  return {
    type: 'RUN_ACTOR_CYCLE',
    status: 'applied',
    reason: null,
    duplicate: false,
    actorCount: actorIds.length,
    commandCount,
    tradeCount:
      state.market.trades.length - tradesBefore,
    commandSummary,
    facilityActions,
    professionalEcology:
      professionalEcologyCycleSummary(
        professionalActorBatches,
      ),
    lastActorCycleAtMs:
      state.market.lastActorCycleAtMs,
    nextActorCycleAtMs:
      state.market.nextActorCycleAtMs,
  };
}

function actorCycleNotDue(state, command) {
  return (
    (
      command.type === 'RUN_ACTOR_CYCLE' ||
      command.type === 'ADVANCE_MARKET_CADENCE'
    ) &&
    state.market.lastActorCycleAtMs !== null &&
    Number.isSafeInteger(
      state.market.nextActorCycleAtMs,
    ) &&
    command.atMs < state.market.nextActorCycleAtMs
  );
}

function actorCycleNoopReceipt(state, command) {
  const actorCount = Object.keys(state.actors).length;
  return {
    id: null,
    type: 'RUN_ACTOR_CYCLE',
    status: 'applied',
    reason: null,
    duplicate: true,
    notDueUntilMs: state.market.nextActorCycleAtMs,
    actorCount,
    commandCount: 0,
    tradeCount: 0,
    commandSummary: {
      appliedCount: 0,
      rejectedCount: 0,
      submitCount: 0,
      cancelCount: 0,
      rejectionReasons: {},
    },
    facilityActions: [],
    professionalEcology:
      professionalEcologyCycleSummary(),
    lastActorCycleAtMs:
      state.market.lastActorCycleAtMs,
    nextActorCycleAtMs:
      state.market.nextActorCycleAtMs,
    playerCashCentsBeforeActor:
      state.accounts.player.cashCents,
    playerDebtCentsBeforeActor:
      state.accounts.player.financing.cashDebtCents,
    synchronization: {
      observationCount: 0,
      carryObservationCount: 0,
      riskFreeObservationCount: 0,
      securityReferenceObservationCount: 0,
      riskInputsChanged: false,
      qualificationStatus:
        state.access.qualification.status,
    },
    atMs: command.atMs,
    commandSource:
      command.source ?? 'external_world_writer',
    commitSeq: state.commitSeq,
  };
}

function advanceMarketCadence(
  state,
  command,
  context = {},
) {
  const syncReceipt = syncWorld(state, {
    ...command,
    type: 'SYNC_WORLD',
  }, context);
  if (syncReceipt.status !== 'applied') {
    return {
      type: 'RUN_ACTOR_CYCLE',
      status: 'rejected',
      reason: syncReceipt.reason,
      synchronization: syncReceipt,
    };
  }
  if (syncReceipt.riskInputsChanged) {
    refreshRiskState(state, context);
    context.preActorRiskRefresh = true;
    context.preActorDirtyBookIds = new Set(
      context.clonedBookIds ?? [],
    );
  }
  const playerCashCentsBeforeActor =
    state.accounts.player.cashCents;
  const playerDebtCentsBeforeActor =
    state.accounts.player.financing.cashDebtCents;
  return {
    ...actorCycle(state, context),
    synchronization: {
      observationCount:
        syncReceipt.observationCount,
      carryObservationCount:
        syncReceipt.carryObservationCount,
      riskFreeObservationCount:
        syncReceipt.riskFreeObservationCount,
      securityReferenceObservationCount:
        syncReceipt.securityReferenceObservationCount,
      riskInputsChanged:
        syncReceipt.riskInputsChanged,
      qualificationStatus:
        syncReceipt.qualificationStatus,
    },
    playerCashCentsBeforeActor,
    playerDebtCentsBeforeActor,
  };
}

function accrueSecuritiesLendingFees(state, account) {
  let totalFeeCents = 0;
  for (const loan of Object.values(
    account.borrowedSecurities,
  )) {
    const elapsedMs = Math.max(
      0,
      state.nowMs - loan.lastAccruedAtMs,
    );
    const feeCents = accrueInterestCents({
      principalCents:
        loan.quantity * loan.referencePriceTicks,
      annualRateBps: loan.annualFeeBps,
      elapsedMs,
    });
    const payableCents = Math.min(
      feeCents,
      unreservedAccountCashCents(account),
    );
    account.cashCents -= payableCents;
    state.clearing.feePoolCents += payableCents;
    loan.accruedFeeCents =
      (loan.accruedFeeCents ?? 0) +
      feeCents -
      payableCents;
    loan.lastAccruedAtMs = state.nowMs;
    totalFeeCents += feeCents;
  }
  return totalFeeCents;
}

function settleDay(state) {
  const settlements = [];
  for (const contract of Object.values(
    state.universe.futures,
  )) {
    if (contract.status !== 'active') continue;
    const previousSettlementSource =
      state.market.settlementSources[contract.id] ?? {};
    const lastIncludedTradeSequence = Math.max(
      0,
      Number(
        previousSettlementSource
          .lastIncludedTradeSequence,
      ) || 0,
    );
    const lastTrade = [...state.market.trades]
      .reverse()
      .find(
        (trade) =>
          trade.contractId === contract.id &&
          trade.atMs <= state.nowMs &&
          trade.sequence > lastIncludedTradeSequence,
      );
    const settlementPriceTicks =
      lastTrade?.priceTicks ??
      futuresTheoreticalPriceTicks(state, contract);
    const variation = settleFutureVariation({
      accounts: state.accounts,
      contract,
      settlementPriceTicks,
    });
    if (variation.netCashflowCents !== 0) {
      throw new Error(
        `Non-zero futures variation margin: ${contract.id}`,
      );
    }
    state.market.settlementPriceTicks[contract.id] =
      settlementPriceTicks;
    state.market.settlementSources[contract.id] =
      lastTrade
        ? {
            source: 'last_matched_trade',
            tradeId: lastTrade.id,
            lastIncludedTradeSequence:
              lastTrade.sequence,
            atMs: state.nowMs,
            basketIdentity:
              contractBasketIdentity(contract),
          }
        : {
            source: 'cost_of_carry_settlement_reference',
            tradeId: null,
            lastIncludedTradeSequence,
            atMs: state.nowMs,
            basketIdentity:
              contractBasketIdentity(contract),
          };
    settlements.push(variation);
  }
  const financingInterest = {};
  for (const account of Object.values(state.accounts)) {
    const facility = account.financing;
    if (facility.cashDebtCents <= 0) {
      facility.lastAccruedAtMs = state.nowMs;
      continue;
    }
    const elapsedMs = Math.max(
      0,
      state.nowMs - facility.lastAccruedAtMs,
    );
    const interestCents = accrueInterestCents({
      principalCents: facility.cashDebtCents,
      annualRateBps: facility.annualRateBps,
      elapsedMs,
    });
    const paidInterestCents = Math.min(
      interestCents,
      unreservedAccountCashCents(account),
    );
    const capitalizedInterestCents =
      interestCents - paidInterestCents;
    account.cashCents -= paidInterestCents;
    state.clearing.creditPoolCents +=
      paidInterestCents;
    facility.cashDebtCents +=
      capitalizedInterestCents;
    state.clearing.creditFacility
      .interestIncomeCents += interestCents;
    facility.lastAccruedAtMs = state.nowMs;
    financingInterest[account.id] = interestCents;
  }
  const securitiesLendingFees = {};
  for (const account of Object.values(state.accounts)) {
    const feeCents = accrueSecuritiesLendingFees(
      state,
      account,
    );
    if (feeCents > 0) {
      securitiesLendingFees[account.id] = feeCents;
    }
  }
  state.market.lastSettlementAtMs = state.nowMs;
  return {
    type: 'SETTLE_DAY',
    status: 'applied',
    reason: null,
    settlements,
    financingInterest,
    securitiesLendingFees,
  };
}

function cancelContractOrders(state, contractId) {
  const book = state.books[contractId];
  const cancelledOrderIds = [];
  for (const order of Object.values(book.orders)) {
    if (!activeOrder(order)) continue;
    const result = cancelInBook(
      book,
      order.id,
      order.ownerId,
    );
    if (result.cancelled) cancelledOrderIds.push(order.id);
  }
  return cancelledOrderIds;
}

function finalSettlementReference(
  state,
  command,
  contract,
) {
  const fallbackTicks =
    command.underlyingSettlementTicks?.[
      contract.underlyingId
    ];
  if (!contract.basketIdentity) {
    return Number.isSafeInteger(fallbackTicks) &&
      fallbackTicks > 0
      ? { spotTicks: fallbackTicks, reason: null }
      : {
          spotTicks: null,
          reason:
            'MISSING_FINAL_SETTLEMENT_REFERENCE',
        };
  }
  const versionedReference =
    command.underlyingSettlementReferences?.[
      contract.underlyingId
    ]?.[
      contract.basketIdentity.constituentSetVersion
    ];
  if (versionedReference) {
    if (
      !sameEquityBasketIdentity(
        versionedReference.basketIdentity,
        contract.basketIdentity,
      )
    ) {
      return {
        spotTicks: null,
        reason:
          'FINAL_SETTLEMENT_BASKET_IDENTITY_MISMATCH',
      };
    }
    return Number.isSafeInteger(
      versionedReference.spotTicks,
    ) && versionedReference.spotTicks > 0
      ? {
          spotTicks: versionedReference.spotTicks,
          reason: null,
        }
      : {
          spotTicks: null,
          reason:
            'MISSING_FINAL_SETTLEMENT_REFERENCE',
        };
  }
  const currentIdentity =
    state.universe.underlyings[
      contract.underlyingId
    ]?.basketIdentity;
  if (
    sameEquityBasketIdentity(
      contract.basketIdentity,
      currentIdentity,
    ) &&
    Number.isSafeInteger(fallbackTicks) &&
    fallbackTicks > 0
  ) {
    return { spotTicks: fallbackTicks, reason: null };
  }
  return {
    spotTicks: null,
    reason:
      'MISSING_FINAL_SETTLEMENT_BASKET_REFERENCE',
  };
}

function expiryPositionCashflowCents(
  contract,
  position,
  settlementPriceTicks,
) {
  let priceDeltaTicks;
  if (contract.type === 'future') {
    const previousSettlementPriceTicks =
      position.lastSettlementPriceTicks ??
      position.averageOpenPriceTicks;
    priceDeltaTicks =
      settlementPriceTicks -
      previousSettlementPriceTicks;
  } else {
    priceDeltaTicks =
      contract.kind === 'call'
        ? Math.max(
            0,
            settlementPriceTicks -
              contract.strikeTicks,
          )
        : Math.max(
            0,
            contract.strikeTicks -
              settlementPriceTicks,
          );
  }
  const cashflowCents =
    position.quantity *
    priceDeltaTicks *
    contract.tickValueCents;
  if (!Number.isSafeInteger(cashflowCents)) {
    throw new RangeError(
      `expiry cashflow exceeds safe integer range: ${contract.id}`,
    );
  }
  return cashflowCents;
}

function exerciseFeeCents(
  contract,
  position,
  settlementPriceTicks,
) {
  if (
    contract.type !== 'option' ||
    position.quantity === 0
  ) {
    return 0;
  }
  const intrinsicTicks =
    contract.kind === 'call'
      ? Math.max(
          0,
          settlementPriceTicks -
            contract.strikeTicks,
        )
      : Math.max(
          0,
          contract.strikeTicks -
            settlementPriceTicks,
        );
  if (intrinsicTicks === 0) return 0;
  const feeCents =
    Math.abs(position.quantity) *
    contract.feeSchedule
      .exerciseFeeCentsPerContract;
  if (!Number.isSafeInteger(feeCents)) {
    throw new RangeError(
      `exercise fee exceeds safe integer range: ${contract.id}`,
    );
  }
  return feeCents;
}

function expirySettlementPlan(
  state,
  expiring,
  finalSettlementByContract,
) {
  const reservationPreview = cloneJson(state);
  for (const contract of expiring) {
    cancelContractOrders(
      reservationPreview,
      contract.id,
    );
  }
  recomputeReservations(reservationPreview);
  const cashflowsByContract = {};
  const exerciseFeesByContract = {};
  const accounts = new Map();
  for (const contract of expiring) {
    const settlementPriceTicks =
      finalSettlementByContract.get(contract.id);
    const cashflows = {};
    const exerciseFees = {};
    let contractNetCashflowCents = 0;
    for (const account of Object.values(
      state.accounts,
    )) {
      const position =
        account.positions[contract.id];
      if (!position || position.quantity === 0) {
        continue;
      }
      const cashflowCents =
        expiryPositionCashflowCents(
          contract,
          position,
          settlementPriceTicks,
        );
      const feeCents = exerciseFeeCents(
        contract,
        position,
        settlementPriceTicks,
      );
      cashflows[account.id] = cashflowCents;
      if (feeCents > 0) {
        exerciseFees[account.id] = feeCents;
      }
      contractNetCashflowCents += cashflowCents;
      const accountPlan =
        accounts.get(account.id) ?? {
          accountId: account.id,
          contractIds: new Set(),
          contractualCashflowCents: 0,
          exerciseFeeCents: 0,
        };
      accountPlan.contractIds.add(contract.id);
      accountPlan.contractualCashflowCents +=
        cashflowCents;
      accountPlan.exerciseFeeCents += feeCents;
      accounts.set(account.id, accountPlan);
    }
    if (contractNetCashflowCents !== 0) {
      throw new Error(
        `Non-zero expiry settlement: ${contract.id}`,
      );
    }
    cashflowsByContract[contract.id] = cashflows;
    if (Object.keys(exerciseFees).length > 0) {
      exerciseFeesByContract[contract.id] =
        exerciseFees;
    }
  }
  const defaultAccounts = [];
  let requiredDefaultFundCents = 0;
  for (const accountPlan of [...accounts.values()].sort(
    (left, right) =>
      left.accountId.localeCompare(right.accountId),
  )) {
    const previewAccount =
      reservationPreview.accounts[
        accountPlan.accountId
      ];
    const cashFloorCents =
      (previewAccount.externalReservedCashCents ?? 0) +
      previewAccount.reservedInitialMarginCents +
      previewAccount.reservedTransactionFeesCents;
    const netSettlementCashflowCents =
      accountPlan.contractualCashflowCents -
      accountPlan.exerciseFeeCents;
    const obligationCents = Math.max(
      0,
      -netSettlementCashflowCents,
    );
    const availableOwnCashCents = Math.max(
      0,
      previewAccount.cashCents - cashFloorCents,
    );
    const ownCashUsedCents = Math.min(
      obligationCents,
      availableOwnCashCents,
    );
    const defaultFundDrawCents =
      obligationCents - ownCashUsedCents;
    const settlement = {
      accountId: accountPlan.accountId,
      contractIds: [...accountPlan.contractIds].sort(),
      contractualCashflowCents:
        accountPlan.contractualCashflowCents,
      exerciseFeeCents:
        accountPlan.exerciseFeeCents,
      netSettlementCashflowCents,
      cashFloorCents,
      ownCashUsedCents,
      defaultFundDrawCents,
    };
    if (defaultFundDrawCents > 0) {
      defaultAccounts.push(settlement);
      requiredDefaultFundCents +=
        defaultFundDrawCents;
    }
  }
  return {
    cashflowsByContract,
    exerciseFeesByContract,
    defaultAccounts,
    requiredDefaultFundCents,
  };
}

function expireContracts(state, command) {
  const expiring = allContracts(state.universe).filter(
    (contract) =>
      contract.status === 'active' &&
      contract.expiryMs <= state.nowMs,
  );
  const finalSettlementByContract = new Map();
  for (const contract of expiring) {
    const reference = finalSettlementReference(
      state,
      command,
      contract,
    );
    if (reference.reason) {
      return rejected(
        'EXPIRE_CONTRACTS',
        reference.reason,
        {
          underlyingId: contract.underlyingId,
          basketIdentity:
            contractBasketIdentity(contract),
        },
      );
    }
    finalSettlementByContract.set(
      contract.id,
      reference.spotTicks,
    );
  }
  const settlementPlan = expirySettlementPlan(
    state,
    expiring,
    finalSettlementByContract,
  );
  if (
    settlementPlan.requiredDefaultFundCents >
    state.clearing.defaultFundCents
  ) {
    return rejected(
      'EXPIRE_CONTRACTS',
      'DEFAULT_FUND_EXHAUSTED',
      {
        expiredContractIds: [],
        expiringContractIds: expiring.map(
          (contract) => contract.id,
        ),
        requiredDefaultFundCents:
          settlementPlan.requiredDefaultFundCents,
        availableDefaultFundCents:
          state.clearing.defaultFundCents,
        defaultWaterfall: {
          status:
            'REJECTED_DEFAULT_FUND_EXHAUSTED',
          defaultFundDrawCents: 0,
          accounts:
            settlementPlan.defaultAccounts,
        },
      },
    );
  }
  const cancelledOrderIds = [];
  for (const contract of expiring) {
    const settlement =
      finalSettlementByContract.get(contract.id);
    cancelledOrderIds.push(
      ...cancelContractOrders(state, contract.id),
    );
    if (contract.type === 'future') {
      const variation = settleFutureVariation({
        accounts: state.accounts,
        contract,
        settlementPriceTicks: settlement,
      });
      if (variation.netCashflowCents !== 0) {
        throw new Error(
          `Non-zero final futures settlement: ${contract.id}`,
        );
      }
      state.market.settlementPriceTicks[contract.id] =
        settlement;
      state.market.settlementSources[contract.id] = {
        source: 'contract_final_settlement_reference',
        tradeId: null,
        lastIncludedTradeSequence:
          state.market.settlementSources[contract.id]
            ?.lastIncludedTradeSequence ?? 0,
        atMs: state.nowMs,
        basketIdentity:
          contractBasketIdentity(contract),
      };
    } else {
      const intrinsicTicks =
        contract.kind === 'call'
          ? Math.max(0, settlement - contract.strikeTicks)
          : Math.max(0, contract.strikeTicks - settlement);
      let net = 0;
      for (const account of Object.values(state.accounts)) {
        const position =
          account.positions[contract.id];
        if (!position || position.quantity === 0) continue;
        const cashflow =
          position.quantity *
          intrinsicTicks *
          contract.tickValueCents;
        const realizedPnL =
          position.quantity *
          (
            intrinsicTicks -
            position.averageOpenPriceTicks
          ) *
          contract.tickValueCents;
        account.cashCents += cashflow;
        account.realizedPnLCents += realizedPnL;
        position.realizedPnLCents += realizedPnL;
        net += cashflow;
        const feeCents =
          settlementPlan.exerciseFeesByContract[
            contract.id
          ]?.[account.id] ?? 0;
        if (feeCents > 0) {
          account.cashCents -= feeCents;
          account.transactionFeesCents += feeCents;
          state.clearing.feePoolCents +=
            feeCents;
        }
      }
      if (net !== 0) {
        throw new Error(
          `Non-zero option expiry settlement: ${contract.id}`,
        );
      }
    }
    for (const account of Object.values(state.accounts)) {
      const position = account.positions[contract.id];
      if (!position) continue;
      position.quantity = 0;
      position.averageOpenPriceTicks = 0;
      position.lastSettlementPriceTicks = null;
    }
    contract.status = 'expired';
  }
  const defaultFundBeforeCents =
    state.clearing.defaultFundCents;
  for (const settlement of
    settlementPlan.defaultAccounts) {
    const account =
      state.accounts[settlement.accountId];
    const drawCents =
      settlement.defaultFundDrawCents;
    state.clearing.defaultFundCents -= drawCents;
    state.clearing.defaultFundDrawnCents +=
      drawCents;
    account.cashCents += drawCents;
    account.clearingDefault.status = 'DEFAULTED';
    account.clearingDefault.liabilityCents +=
      drawCents;
    account.clearingDefault
      .defaultFundDrawnCents += drawCents;
    account.clearingDefault.lastDefaultAtMs =
      state.nowMs;
    if (account.cashCents < settlement.cashFloorCents) {
      throw new Error(
        `Clearing default waterfall breached protected cash: ${account.id}`,
      );
    }
  }
  return {
    type: 'EXPIRE_CONTRACTS',
    status: 'applied',
    reason: null,
    expiredContractIds: expiring.map(
      (contract) => contract.id,
    ),
    cashflowsByContract:
      settlementPlan.cashflowsByContract,
    exerciseFeesByContract:
      settlementPlan.exerciseFeesByContract,
    defaultWaterfall: {
      status:
        settlementPlan.requiredDefaultFundCents > 0
          ? 'DEFAULT_FUND_USED'
          : 'NO_DEFAULT',
      defaultFundBeforeCents,
      defaultFundAfterCents:
        state.clearing.defaultFundCents,
      defaultFundDrawCents:
        settlementPlan.requiredDefaultFundCents,
      accounts: settlementPlan.defaultAccounts,
    },
    cancelledOrderIds,
  };
}

function maintainContracts(state) {
  const listedContractIds = [];
  let maximumExpiryMs = Math.max(
    state.nowMs,
    ...Object.values(state.universe.futures).map(
      (contract) => contract.expiryMs,
    ),
  );
  const futuresUnderlyings = [
    ...new Set(
      Object.values(state.universe.futures).map(
        (contract) => contract.underlyingId,
      ),
    ),
  ];
  const activeTermsFor = (underlyingId) =>
    Object.values(state.universe.futures).filter(
      (contract) =>
        contract.underlyingId === underlyingId &&
        contract.status === 'active',
    ).length;
  while (
    futuresUnderlyings.some(
      (underlyingId) =>
        activeTermsFor(underlyingId) < 2,
    )
  ) {
    maximumExpiryMs += 60 * 24 * 60 * 60 * 1_000;
    const added = appendSyntheticExpiry(
      state.universe,
      {
        expiryMs: maximumExpiryMs,
        spotTicks:
          state.universe.underlyings.SYNTH300.spotTicks,
      },
    );
    for (const contractId of added) {
      state.books[contractId] =
        createOrderBook(contractId);
      const future =
        state.universe.futures[contractId];
      if (future) {
        state.market.settlementPriceTicks[
          contractId
        ] =
          referenceSpotTicks(state, future);
        state.market.settlementSources[
          contractId
        ] = {
          source: 'listing_reference_not_trade',
          tradeId: null,
          lastIncludedTradeSequence: 0,
          atMs: state.nowMs,
          basketIdentity:
            contractBasketIdentity(future),
        };
      }
    }
    listedContractIds.push(...added);
  }
  return {
    type: 'MAINTAIN_CONTRACTS',
    status: 'applied',
    reason: null,
    listedContractIds,
  };
}

function drawMarginCredit(state, command) {
  const account = state.accounts[command.actorId];
  if (!account || account.lifecycleStatus !== 'ACTIVE') {
    return rejected(
      'DRAW_MARGIN_CREDIT',
      account ? 'ACCOUNT_NOT_ACTIVE' : 'UNKNOWN_ACCOUNT',
    );
  }
  if (
    command.actorId === 'player' &&
    derivePermissionMode(
      state.access,
      'margin_financing',
    ) !== 'OPEN'
  ) {
    return rejected(
      'DRAW_MARGIN_CREDIT',
      'MARGIN_FINANCING_ACCESS_REQUIRED',
    );
  }
  positiveInteger(command.amountCents, 'amountCents');
  const facilityAvailability =
    creditFacilityAvailability(state);
  const {
    existingFacilityRisk,
    headroomCents: collateralHeadroomCents,
  } = financingCollateralHeadroomCents(account);
  const grantedAmountCents = Math.min(
    command.amountCents,
    facilityAvailability.availableCreditCents,
    collateralHeadroomCents,
  );
  if (grantedAmountCents <= 0) {
    if (
      facilityAvailability.availableCreditCents <= 0
    ) {
      return rejected(
        'DRAW_MARGIN_CREDIT',
        'CREDIT_FACILITY_CAPACITY_EXHAUSTED',
        {
          requestedAmountCents: command.amountCents,
          grantedAmountCents: 0,
          remainingAmountCents: command.amountCents,
        },
      );
    }
    return rejected(
      'DRAW_MARGIN_CREDIT',
      'INSUFFICIENT_FINANCING_COLLATERAL',
      {
        requestedAmountCents: command.amountCents,
        grantedAmountCents: 0,
        remainingAmountCents: command.amountCents,
        requiredCollateralCents:
          ceilBasisPoints(
            account.financing.cashDebtCents + 1,
            FINANCING_INITIAL_RATIO_BPS,
          ) +
          existingFacilityRisk.securitiesLending
            .initialRequiredCollateralCents,
      },
    );
  }
  if (account.financing.cashDebtCents === 0) {
    account.financing.lastAccruedAtMs = state.nowMs;
  }
  state.clearing.creditPoolCents -= grantedAmountCents;
  account.cashCents += grantedAmountCents;
  account.financing.cashDebtCents += grantedAmountCents;
  const remainingAmountCents =
    command.amountCents - grantedAmountCents;
  const partialReason =
    remainingAmountCents === 0
      ? null
      : grantedAmountCents ===
          facilityAvailability.availableCreditCents
        ? 'CREDIT_FACILITY_CAPACITY_LIMIT'
        : 'FINANCING_COLLATERAL_LIMIT';
  return {
    type: 'DRAW_MARGIN_CREDIT',
    status: 'applied',
    reason: null,
    actorId: command.actorId,
    amountCents: grantedAmountCents,
    requestedAmountCents: command.amountCents,
    grantedAmountCents,
    remainingAmountCents,
    partialReason,
    debtCents: account.financing.cashDebtCents,
  };
}

function repayMarginCredit(state, command) {
  const account = state.accounts[command.actorId];
  if (!account) {
    return rejected(
      'REPAY_MARGIN_CREDIT',
      'UNKNOWN_ACCOUNT',
    );
  }
  positiveInteger(command.amountCents, 'amountCents');
  if (
    command.amountCents >
      account.financing.cashDebtCents ||
    command.amountCents >
      unreservedAccountCashCents(account)
  ) {
    return rejected(
      'REPAY_MARGIN_CREDIT',
      'INVALID_REPAYMENT_AMOUNT',
    );
  }
  account.cashCents -= command.amountCents;
  account.financing.cashDebtCents -= command.amountCents;
  state.clearing.creditPoolCents += command.amountCents;
  if (account.financing.cashDebtCents === 0) {
    account.financing.lastAccruedAtMs = state.nowMs;
  }
  return {
    type: 'REPAY_MARGIN_CREDIT',
    status: 'applied',
    reason: null,
    actorId: command.actorId,
    amountCents: command.amountCents,
    debtCents: account.financing.cashDebtCents,
  };
}

function borrowSecurity(state, command) {
  const account = state.accounts[command.actorId];
  if (!account || account.lifecycleStatus !== 'ACTIVE') {
    return rejected(
      'BORROW_SECURITY',
      account ? 'ACCOUNT_NOT_ACTIVE' : 'UNKNOWN_ACCOUNT',
    );
  }
  if (
    command.actorId === 'player' &&
    derivePermissionMode(
      state.access,
      'securities_lending',
    ) !== 'OPEN'
  ) {
    return rejected(
      'BORROW_SECURITY',
      'SECURITIES_LENDING_ACCESS_REQUIRED',
    );
  }
  positiveInteger(command.quantity, 'quantity');
  positiveInteger(
    command.referencePriceTicks,
    'referencePriceTicks',
  );
  if (
    !Object.hasOwn(
      state.clearing.initialLendableSecurities,
      command.securityId,
    )
  ) {
    return rejected(
      'BORROW_SECURITY',
      'UNKNOWN_LENDING_SECURITY',
      { securityId: command.securityId },
    );
  }
  const availableQuantity =
    state.clearing.lendableSecurities[
      command.securityId
    ] ?? 0;
  if (availableQuantity <= 0) {
    return rejected(
      'BORROW_SECURITY',
      'LENDING_INVENTORY_EXHAUSTED',
      {
        requestedQuantity: command.quantity,
        grantedQuantity: 0,
        remainingQuantity: command.quantity,
      },
    );
  }
  const inventoryLimitedQuantity = Math.min(
    command.quantity,
    availableQuantity,
  );
  const annualFeeBps = securityLendingFeeBps(
    state,
    command.securityId,
  );
  const grantedQuantity =
    maximumSecurityBorrowQuantity(
      state,
      account,
      command.securityId,
      command.referencePriceTicks,
      inventoryLimitedQuantity,
    );
  if (grantedQuantity <= 0) {
    return rejected(
      'BORROW_SECURITY',
      'INSUFFICIENT_LENDING_COLLATERAL',
      {
        requestedQuantity: command.quantity,
        grantedQuantity: 0,
        remainingQuantity: command.quantity,
      },
    );
  }
  state.clearing.lendableSecurities[
    command.securityId
  ] -= grantedQuantity;
  const loan =
    account.borrowedSecurities[command.securityId] ?? {
      securityId: command.securityId,
      quantity: 0,
      referencePriceTicks: command.referencePriceTicks,
      annualFeeBps,
      accruedFeeCents: 0,
      lastAccruedAtMs: state.nowMs,
    };
  loan.quantity += grantedQuantity;
  loan.referencePriceTicks = command.referencePriceTicks;
  loan.annualFeeBps = annualFeeBps;
  loan.accruedFeeCents ??= 0;
  account.borrowedSecurities[command.securityId] = loan;
  if (account.accountType !== 'player') {
    account.borrowedSecurityCustody ??= {};
    account.borrowedSecurityCustody[
      command.securityId
    ] =
      (
        account.borrowedSecurityCustody[
          command.securityId
        ] ?? 0
      ) + grantedQuantity;
  }
  state.market.securityReferencePrices[
    command.securityId
  ] = command.referencePriceTicks;
  const remainingQuantity =
    command.quantity - grantedQuantity;
  const partialReason =
    remainingQuantity === 0
      ? null
      : grantedQuantity === availableQuantity
        ? 'LENDING_INVENTORY_LIMIT'
        : 'LENDING_COLLATERAL_LIMIT';
  return {
    type: 'BORROW_SECURITY',
    status: 'applied',
    reason: null,
    securityId: command.securityId,
    actorId: command.actorId,
    quantity: grantedQuantity,
    requestedQuantity: command.quantity,
    grantedQuantity,
    remainingQuantity,
    partialReason,
    annualFeeBps,
  };
}

function returnSecurity(state, command) {
  const account = state.accounts[command.actorId];
  if (!account) {
    return rejected(
      'RETURN_SECURITY',
      'UNKNOWN_ACCOUNT',
    );
  }
  positiveInteger(command.quantity, 'quantity');
  const loan =
    account.borrowedSecurities[command.securityId];
  if (!loan || loan.quantity < command.quantity) {
    return rejected(
      'RETURN_SECURITY',
      'INVALID_RETURN_QUANTITY',
    );
  }
  if (
    account.accountType !== 'player' &&
    (
      account.borrowedSecurityCustody?.[
        command.securityId
      ] ?? 0
    ) < command.quantity
  ) {
    return rejected(
      'RETURN_SECURITY',
      'INSUFFICIENT_INSTITUTIONAL_CUSTODY',
    );
  }
  if (
    command.quantity === loan.quantity &&
    (loan.accruedFeeCents ?? 0) > 0
  ) {
    const accruedFeeCents =
      loan.accruedFeeCents;
    if (
      unreservedAccountCashCents(account) <
      accruedFeeCents
    ) {
      return rejected(
        'RETURN_SECURITY',
        'UNPAID_LENDING_FEES',
        { accruedFeeCents },
      );
    }
    account.cashCents -= accruedFeeCents;
    state.clearing.feePoolCents +=
      accruedFeeCents;
    loan.accruedFeeCents = 0;
  }
  loan.quantity -= command.quantity;
  if (account.accountType !== 'player') {
    account.borrowedSecurityCustody[
      command.securityId
    ] -= command.quantity;
    if (
      account.borrowedSecurityCustody[
        command.securityId
      ] === 0
    ) {
      delete account.borrowedSecurityCustody[
        command.securityId
      ];
    }
  }
  state.clearing.lendableSecurities[
    command.securityId
  ] =
    (
      state.clearing.lendableSecurities[
        command.securityId
      ] ?? 0
    ) + command.quantity;
  if (loan.quantity === 0) {
    delete account.borrowedSecurities[
      command.securityId
    ];
  }
  return {
    type: 'RETURN_SECURITY',
    status: 'applied',
    reason: null,
    actorId: command.actorId,
    securityId: command.securityId,
    quantity: command.quantity,
  };
}

function applySecurityCorporateAction(state, command) {
  if (
    typeof command.actionId !== 'string' ||
    command.actionId.length === 0
  ) {
    return rejected(
      'APPLY_SECURITY_CORPORATE_ACTION',
      'INVALID_CORPORATE_ACTION_ID',
    );
  }
  if (
    state.clearing.appliedSecurityCorporateActions[
      command.actionId
    ]
  ) {
    return rejected(
      'APPLY_SECURITY_CORPORATE_ACTION',
      'CORPORATE_ACTION_ALREADY_APPLIED',
      { actionId: command.actionId },
    );
  }
  if (
    !Object.hasOwn(
      state.clearing.initialLendableSecurities,
      command.securityId,
    )
  ) {
    return rejected(
      'APPLY_SECURITY_CORPORATE_ACTION',
      'UNKNOWN_LENDING_SECURITY',
      { securityId: command.securityId },
    );
  }
  positiveInteger(
    command.splitNumerator,
    'splitNumerator',
  );
  positiveInteger(
    command.splitDenominator,
    'splitDenominator',
  );
  nonNegativeInteger(
    command.cashDividendCentsPerShare,
    'cashDividendCentsPerShare',
  );
  const adjustedQuantity = (quantity) => {
    const numerator =
      BigInt(quantity) *
      BigInt(command.splitNumerator);
    const denominator =
      BigInt(command.splitDenominator);
    if (numerator % denominator !== 0n) {
      return null;
    }
    const adjusted = Number(
      numerator / denominator,
    );
    return Number.isSafeInteger(adjusted)
      ? adjusted
      : null;
  };
  const initialQuantity = adjustedQuantity(
    state.clearing.initialLendableSecurities[
      command.securityId
    ],
  );
  const availableQuantity = adjustedQuantity(
    state.clearing.lendableSecurities[
      command.securityId
    ] ?? 0,
  );
  const accountLoans = Object.values(
    state.accounts,
  )
    .map((account) => ({
      account,
      loan:
        account.borrowedSecurities[
          command.securityId
        ],
    }))
    .filter(({ loan }) => Boolean(loan));
  const adjustedLoans = accountLoans.map(
    ({ account, loan }) => ({
      account,
      loan,
      quantity: adjustedQuantity(loan.quantity),
    }),
  );
  if (
    initialQuantity === null ||
    availableQuantity === null ||
    adjustedLoans.some(
      ({ quantity }) => quantity === null,
    )
  ) {
    return rejected(
      'APPLY_SECURITY_CORPORATE_ACTION',
      'NON_INTEGER_CORPORATE_ACTION_QUANTITY',
      { actionId: command.actionId },
    );
  }
  state.clearing.initialLendableSecurities[
    command.securityId
  ] = initialQuantity;
  state.clearing.lendableSecurities[
    command.securityId
  ] = availableQuantity;
  let compensationCents = 0;
  let paidCompensationCents = 0;
  for (const {
    account,
    loan,
    quantity,
  } of adjustedLoans) {
    if (account.accountType !== 'player') {
      account.borrowedSecurityCustody ??= {};
      account.borrowedSecurityCustody[
        command.securityId
      ] = quantity;
    }
    loan.quantity = quantity;
    loan.referencePriceTicks = Math.max(
      1,
      Math.round(
        loan.referencePriceTicks *
          command.splitDenominator /
          command.splitNumerator,
      ),
    );
    const accountCompensationCents =
      quantity *
      command.cashDividendCentsPerShare;
    const paidCents = Math.min(
      accountCompensationCents,
      unreservedAccountCashCents(account),
    );
    account.cashCents -= paidCents;
    state.clearing.feePoolCents += paidCents;
    loan.accruedFeeCents =
      (loan.accruedFeeCents ?? 0) +
      accountCompensationCents -
      paidCents;
    compensationCents +=
      accountCompensationCents;
    paidCompensationCents += paidCents;
  }
  const priorReference =
    state.market.securityReferencePrices[
      command.securityId
    ];
  if (
    Number.isSafeInteger(priorReference) &&
    priorReference > 0
  ) {
    state.market.securityReferencePrices[
      command.securityId
    ] = Math.max(
      1,
      Math.round(
        priorReference *
          command.splitDenominator /
          command.splitNumerator,
      ),
    );
  }
  const record = {
    actionId: command.actionId,
    securityId: command.securityId,
    splitNumerator: command.splitNumerator,
    splitDenominator: command.splitDenominator,
    cashDividendCentsPerShare:
      command.cashDividendCentsPerShare,
    compensationCents,
    paidCompensationCents,
    atMs: state.nowMs,
  };
  state.clearing.appliedSecurityCorporateActions[
    command.actionId
  ] = record;
  return {
    type: 'APPLY_SECURITY_CORPORATE_ACTION',
    status: 'applied',
    reason: null,
    ...record,
    unpaidCompensationCents:
      compensationCents - paidCompensationCents,
  };
}

function liquidateAccount(state, command) {
  const account = state.accounts[command.actorId];
  if (!account) {
    return rejected(
      'LIQUIDATE_ACCOUNT',
      'UNKNOWN_ACCOUNT',
    );
  }
  const attempts = [];
  for (const position of Object.values(account.positions)) {
    if (position.quantity === 0) continue;
    const contract = contractById(
      state.universe,
      position.contractId,
    );
    if (!contract || contract.status !== 'active') continue;
    const side = position.quantity > 0 ? 'sell' : 'buy';
    const before = Math.abs(position.quantity);
    const receipt = submitOrder(state, {
      type: 'SUBMIT_ORDER',
      atMs: state.nowMs,
      actorId: account.id,
      contractId: contract.id,
      side,
      orderType: 'market',
      priceTicks: null,
      quantity: before,
      tif: 'IOC',
      source: 'clearing_liquidation',
    });
    const after = Math.abs(
      account.positions[contract.id]?.quantity ?? 0,
    );
    attempts.push({
      contractId: contract.id,
      side,
      requestedQuantity: before,
      closedQuantity: before - after,
      remainingQuantity: after,
      orderStatus: receipt.status,
      rejectionReason: receipt.reason,
    });
  }
  const remaining = attempts.reduce(
    (sum, attempt) => sum + attempt.remainingQuantity,
    0,
  );
  if (remaining > 0) {
    account.lifecycleStatus =
      'LIQUIDATION_BLOCKED_NO_LIQUIDITY';
  } else {
    account.lifecycleStatus = 'LIQUIDATED_CLOSE_ONLY';
  }
  return {
    type: 'LIQUIDATE_ACCOUNT',
    status: 'applied',
    reason:
      remaining > 0
        ? 'LIQUIDATION_PARTIAL_NO_LIQUIDITY'
        : null,
    actorId: account.id,
    attempts,
    remainingContracts: remaining,
  };
}

function routeCommand(state, command, context = {}) {
  switch (command.type) {
    case 'SYNC_WORLD':
      return syncWorld(state, command, context);
    case 'ENABLE_PERMISSION':
      return enableAccessPermission(state, command);
    case 'SUBMIT_ORDER':
      return submitOrder(state, command, context);
    case 'CANCEL_ORDER':
      return cancelOrder(state, command, context);
    case 'SET_PROFESSIONAL_ACTOR_CONTROL':
      return setProfessionalActorControl(state, command);
    case 'RUN_ACTOR_CYCLE':
      return actorCycle(state, context);
    case 'ADVANCE_MARKET_CADENCE':
      return advanceMarketCadence(
        state,
        command,
        context,
      );
    case 'SETTLE_DAY':
      return settleDay(state);
    case 'EXPIRE_CONTRACTS':
      return expireContracts(state, command);
    case 'MAINTAIN_CONTRACTS':
      return maintainContracts(state);
    case 'DRAW_MARGIN_CREDIT':
      return drawMarginCredit(state, command);
    case 'REPAY_MARGIN_CREDIT':
      return repayMarginCredit(state, command);
    case 'BORROW_SECURITY':
      return borrowSecurity(state, command);
    case 'RETURN_SECURITY':
      return returnSecurity(state, command);
    case 'APPLY_SECURITY_CORPORATE_ACTION':
      return applySecurityCorporateAction(
        state,
        command,
      );
    case 'LIQUIDATE_ACCOUNT':
      return liquidateAccount(state, command);
    default:
      return rejected(
        command.type ?? 'UNKNOWN_COMMAND',
        'UNSUPPORTED_DERIVATIVE_COMMAND',
      );
  }
}

function appendReceipt(state, receipt, command) {
  state.commitSeq += 1;
  const record = {
    id: nextId(
      state,
      'deriv_receipt',
      'nextReceiptSequence',
    ),
    ...receipt,
    atMs: state.nowMs,
    commitSeq: state.commitSeq,
    commandSource:
      command.source ?? 'external_world_writer',
  };
  state.receipts.push(record);
  if (state.receipts.length > MAX_RECEIPTS) {
    const removed = state.receipts.splice(
      0,
      state.receipts.length - MAX_RECEIPTS,
    );
    ensureHistoryCompaction(
      state,
    ).archivedReceiptCount += removed.length;
    state.historyCompaction.lastCompactedAtMs =
      state.nowMs;
  }
  return record;
}

function cadenceHasPostActorRiskMutations(
  receipt,
  context,
) {
  const preActorDirtyBookIds =
    context.preActorDirtyBookIds ?? new Set();
  const actorDirtyBook =
    [...(context.clonedBookIds ?? [])].some(
      (contractId) =>
        !preActorDirtyBookIds.has(contractId),
    );
  return (
    receipt.status !== 'applied' ||
    (receipt.commandCount ?? 0) !== 0 ||
    (receipt.tradeCount ?? 0) !== 0 ||
    (receipt.facilityActions?.length ?? 0) !== 0 ||
    actorDirtyBook
  );
}

function hasTimeSensitiveRiskExposure(state) {
  return Object.values(state.accounts).some((account) =>
    Object.values(account.positions ?? {}).some(
      (position) =>
        position.quantity !== 0 &&
        Boolean(
          state.universe.options?.[
            position.contractId
          ],
        ),
    ),
  );
}

function quiescentCadence(state, receipt, context) {
  return (
    !cadenceHasPostActorRiskMutations(
      receipt,
      context,
    ) &&
    receipt.duplicate !== true &&
    receipt.synchronization?.riskInputsChanged !== true &&
    !hasTimeSensitiveRiskExposure(state)
  );
}

function sameOwnFieldsExcept(
  before,
  after,
  ignoredKeys,
) {
  const beforeKeys = Object.keys(before);
  const afterKeys = Object.keys(after);
  if (
    beforeKeys.length !== afterKeys.length ||
    beforeKeys.some(
      (key) => !Object.hasOwn(after, key),
    )
  ) {
    return false;
  }
  return beforeKeys.every(
    (key) =>
      ignoredKeys.has(key) ||
      before[key] === after[key],
  );
}

function samePrimitiveMap(before, after) {
  return sameOwnFieldsExcept(
    before,
    after,
    new Set(),
  );
}

function auditIncrementalQuiescentCadence({
  before,
  after,
  receipt,
  context,
}) {
  const errors = [];
  if (
    !after ||
    after.ruleVersion !== DERIVATIVES_RULE_VERSION ||
    after.worldId !== before.worldId ||
    after.worldSeed !== before.worldSeed ||
    after.worldStartedAtMs !== before.worldStartedAtMs ||
    after.nowMs < before.nowMs
  ) {
    errors.push('INVALID_INCREMENTAL_STATE_IDENTITY');
  }
  if (
    after.commitSeq !== before.commitSeq + 1 ||
    receipt.commitSeq !== after.commitSeq ||
    receipt.atMs !== after.nowMs ||
    after.receipts.at(-1)?.id !== receipt.id
  ) {
    errors.push('INVALID_INCREMENTAL_COMMIT');
  }
  if (
    after.nextOrderSequence !==
      before.nextOrderSequence ||
    after.nextTradeSequence !==
      before.nextTradeSequence ||
    after.nextReceiptSequence !==
      before.nextReceiptSequence + 1
  ) {
    errors.push('UNEXPECTED_INCREMENTAL_SEQUENCE_CHANGE');
  }
  if (
    after.market.trades.length !==
      before.market.trades.length ||
    after.market.trades.some(
      (trade, index) =>
        trade !== before.market.trades[index],
    )
  ) {
    errors.push('UNEXPECTED_INCREMENTAL_TRADE_CHANGE');
  }
  if (
    (context.clonedBookIds?.size ?? 0) !== 0 ||
    Object.keys(after.books).length !==
      Object.keys(before.books).length ||
    Object.entries(before.books).some(
      ([contractId, book]) =>
        after.books[contractId] !== book,
    )
  ) {
    errors.push('UNEXPECTED_INCREMENTAL_BOOK_CHANGE');
  }
  if (
    after.universe.futures !==
      before.universe.futures ||
    after.universe.options !==
      before.universe.options
  ) {
    errors.push('UNEXPECTED_INCREMENTAL_UNIVERSE_CHANGE');
  } else {
    for (const [underlyingId, prior] of Object.entries(
      before.universe.underlyings,
    )) {
      const current =
        after.universe.underlyings[underlyingId];
      if (
        !current ||
        !sameOwnFieldsExcept(
          prior,
          current,
          new Set(['observationAtMs']),
        )
      ) {
        errors.push(
          `UNEXPECTED_INCREMENTAL_UNDERLYING_CHANGE:${underlyingId}`,
        );
      }
    }
    for (const [
      underlyingId,
      references,
    ] of Object.entries(
      before.universe.equityBasketReferences ?? {},
    )) {
      for (const [version, prior] of Object.entries(
        references,
      )) {
        const current =
          after.universe.equityBasketReferences?.[
            underlyingId
          ]?.[version];
        if (
          !current ||
          !sameOwnFieldsExcept(
            prior,
            current,
            new Set(['observationAtMs']),
          )
        ) {
          errors.push(
            `UNEXPECTED_INCREMENTAL_BASKET_REFERENCE_CHANGE:${underlyingId}:${version}`,
          );
        }
      }
    }
  }
  if (
    !samePrimitiveMap(
      before.market.lastTradePriceTicks,
      after.market.lastTradePriceTicks,
    ) ||
    !samePrimitiveMap(
      before.market.settlementPriceTicks,
      after.market.settlementPriceTicks,
    ) ||
    !samePrimitiveMap(
      before.market.settlementSources,
      after.market.settlementSources,
    ) ||
    !samePrimitiveMap(
      before.market.impliedVolatilityPpm,
      after.market.impliedVolatilityPpm,
    ) ||
    !samePrimitiveMap(
      before.market.securityReferencePrices,
      after.market.securityReferencePrices,
    ) ||
    before.market.lastSettlementAtMs !==
      after.market.lastSettlementAtMs ||
    before.market.regimeSignalBps !==
      after.market.regimeSignalBps ||
    before.market.jumpRiskBps !==
      after.market.jumpRiskBps ||
    before.market.liquidityRiskBps !==
      after.market.liquidityRiskBps
  ) {
    errors.push('UNEXPECTED_INCREMENTAL_MARKET_CHANGE');
  }
  const appendedObservationCount = Math.min(
    MAX_REFERENCE_OBSERVATIONS,
    receipt.synchronization?.observationCount ?? 0,
  );
  const expectedObservationLength = Math.min(
    MAX_REFERENCE_OBSERVATIONS,
    before.market.referenceObservations.length +
      appendedObservationCount,
  );
  const retainedObservationCount =
    expectedObservationLength -
    appendedObservationCount;
  const retainedBeforeObservations =
    retainedObservationCount === 0
      ? []
      : before.market.referenceObservations.slice(
          -retainedObservationCount,
        );
  const retainedAfterObservations =
    after.market.referenceObservations.slice(
      0,
      retainedObservationCount,
    );
  const appendedObservations =
    after.market.referenceObservations.slice(
      retainedObservationCount,
    );
  if (
    after.market.referenceObservations.length !==
      expectedObservationLength ||
    retainedAfterObservations.some(
      (observation, index) =>
        observation !== retainedBeforeObservations[index],
    ) ||
    appendedObservations.some(
      (observation) =>
        observation.atMs !== after.nowMs ||
        typeof observation.underlyingId !== 'string' ||
        !Number.isSafeInteger(observation.spotTicks) ||
        observation.spotTicks <= 0,
    )
  ) {
    errors.push(
      'INVALID_INCREMENTAL_REFERENCE_OBSERVATIONS',
    );
  }
  const beforeAccountIds =
    Object.keys(before.accounts).sort();
  const afterAccountIds =
    Object.keys(after.accounts).sort();
  if (
    beforeAccountIds.length !== afterAccountIds.length ||
    beforeAccountIds.some(
      (accountId, index) =>
        accountId !== afterAccountIds[index],
    )
  ) {
    errors.push('UNEXPECTED_INCREMENTAL_ACCOUNT_SET');
  } else {
    for (const accountId of beforeAccountIds) {
      const prior = before.accounts[accountId];
      const current = after.accounts[accountId];
      const facilityAuthorityUpdated =
        accountId === 'player' &&
        context.facilityCollateralAuthority !==
          undefined;
      const accountFieldsMatch =
        sameOwnFieldsExcept(
          prior,
          current,
          new Set([
            'risk',
            ...(facilityAuthorityUpdated
              ? ['facilityCollateralShape']
              : []),
          ]),
        );
      const riskFieldsMatch =
        prior.risk &&
        current.risk &&
        sameOwnFieldsExcept(
          prior.risk,
          current.risk,
          new Set(['atMs']),
        );
      if (
        !accountFieldsMatch ||
        !riskFieldsMatch ||
        current.risk.atMs !== after.nowMs ||
        (
          facilityAuthorityUpdated &&
          (
            current.facilityCollateralShapeTracker !==
              prior.facilityCollateralShapeTracker ||
            !sameFacilityCollateralTracker(
              current.facilityCollateralShapeTracker,
              context.facilityCollateralAuthority
                .expectedTracker,
            ) ||
            !sameFacilityCollateralShape(
              current.facilityCollateralShape,
              context.facilityCollateralAuthority
                .expectedShape,
            ) ||
            current.facilityEligibleCollateralCents !==
              prior.facilityEligibleCollateralCents
          )
        )
      ) {
        errors.push(
          `UNEXPECTED_INCREMENTAL_ACCOUNT_CHANGE:${accountId}`,
        );
      }
    }
  }
  const beforeActorIds = Object.keys(
    before.actors,
  ).sort();
  const afterActorIds = Object.keys(
    after.actors,
  ).sort();
  if (
    beforeActorIds.length !== afterActorIds.length ||
    beforeActorIds.some(
      (actorId, index) =>
        actorId !== afterActorIds[index],
    )
  ) {
    errors.push('UNEXPECTED_INCREMENTAL_ACTOR_SET');
  } else {
    for (const actorId of beforeActorIds) {
      const prior = before.actors[actorId];
      const current = after.actors[actorId];
      const observesSpotReferences = Object.hasOwn(
        prior,
        'lastObservedSpotTicksByUnderlying',
      );
      const expectedSpotReferences = observesSpotReferences
        ? Object.fromEntries(
            Object.values(after.universe.underlyings).map(
              (underlying) => [
                underlying.id,
                underlying.spotTicks,
              ],
            ),
          )
        : null;
      if (
        !sameOwnFieldsExcept(
          prior,
          current,
          new Set([
            'lastDecisionAtMs',
            'decisionCount',
            ...(observesSpotReferences
              ? ['lastObservedSpotTicksByUnderlying']
              : []),
          ]),
        ) ||
        current.lastDecisionAtMs !== after.nowMs ||
        current.decisionCount !==
          prior.decisionCount + 1 ||
        (
          observesSpotReferences &&
          !samePrimitiveMap(
            current.lastObservedSpotTicksByUnderlying,
            expectedSpotReferences,
          )
        )
      ) {
        errors.push(
          `UNEXPECTED_INCREMENTAL_ACTOR_CHANGE:${actorId}`,
        );
      }
    }
  }
  if (
    after.clearing !== before.clearing ||
    after.initialTotalCashCents !==
      before.initialTotalCashCents
  ) {
    errors.push('UNEXPECTED_INCREMENTAL_CLEARING_CHANGE');
  }
  const archivedReceiptDelta =
    before.receipts.length >= MAX_RECEIPTS ? 1 : 0;
  const expectedReceiptLength = Math.min(
    MAX_RECEIPTS,
    before.receipts.length + 1,
  );
  if (
    after.receipts.length !== expectedReceiptLength ||
    after.historyCompaction.archivedReceiptCount !==
      before.historyCompaction.archivedReceiptCount +
        archivedReceiptDelta ||
    after.historyCompaction.archivedTradeCount !==
      before.historyCompaction.archivedTradeCount ||
    after.historyCompaction.archivedOrderCount !==
      before.historyCompaction.archivedOrderCount ||
    after.historyCompaction.archivedContractCount !==
      before.historyCompaction.archivedContractCount ||
    after.historyCompaction.archivedBookCount !==
      before.historyCompaction.archivedBookCount ||
    after.historyCompaction.lastCompactedAtMs !==
      (
        archivedReceiptDelta > 0
          ? after.nowMs
          : before.historyCompaction.lastCompactedAtMs
      )
  ) {
    errors.push(
      'INVALID_INCREMENTAL_HISTORY_COMPACTION',
    );
  }
  if (
    after.market.lastActorCycleAtMs !==
      after.nowMs ||
    after.market.nextActorCycleAtMs !==
      after.nowMs + DERIVATIVE_ACTOR_CADENCE_MS
  ) {
    errors.push('INVALID_INCREMENTAL_CADENCE_ANCHOR');
  }
  try {
    assertAccessState(after.access);
  } catch (error) {
    errors.push(`INVALID_INCREMENTAL_ACCESS:${error.message}`);
  }
  return {
    ok: errors.length === 0,
    errors,
  };
}

export function createDerivativesState({
  worldId,
  worldSeed,
  worldStartedAtMs,
  nowMs,
  spotTicks,
  underlyingSpots = {},
  playerCashCents,
  playerExternalReservedCashCents = 0,
  playerExternalCollateralCents = 0,
  playerFacilityEligibleCollateralCents = null,
  playerFacilityCollateralAuthority = null,
  testingAccessOpen = false,
  securityLendingInventory =
    DEFAULT_SECURITY_LENDING_INVENTORY,
} = {}) {
  if (typeof worldId !== 'string' || worldId.length === 0) {
    throw new TypeError('worldId must be a non-empty string');
  }
  if (
    typeof worldSeed !== 'string' ||
    worldSeed.length === 0
  ) {
    throw new TypeError('worldSeed must be a non-empty string');
  }
  safeTimestamp(worldStartedAtMs, 'worldStartedAtMs');
  safeTimestamp(nowMs, 'nowMs');
  if (nowMs < worldStartedAtMs) {
    throw new RangeError('nowMs cannot precede worldStartedAtMs');
  }
  positiveInteger(spotTicks, 'spotTicks');
  nonNegativeInteger(playerCashCents, 'playerCashCents');
  nonNegativeInteger(
    playerExternalReservedCashCents,
    'playerExternalReservedCashCents',
  );
  if (playerExternalReservedCashCents > playerCashCents) {
    throw new RangeError(
      'playerExternalReservedCashCents cannot exceed playerCashCents',
    );
  }
  nonNegativeInteger(
    playerExternalCollateralCents,
    'playerExternalCollateralCents',
  );
  if (playerFacilityEligibleCollateralCents !== null) {
    nonNegativeInteger(
      playerFacilityEligibleCollateralCents,
      'playerFacilityEligibleCollateralCents',
    );
  }
  if (typeof testingAccessOpen !== 'boolean') {
    throw new TypeError(
      'testingAccessOpen must be a boolean',
    );
  }
  if (
    !securityLendingInventory ||
    typeof securityLendingInventory !== 'object' ||
    Array.isArray(securityLendingInventory) ||
    Object.keys(securityLendingInventory).length === 0
  ) {
    throw new TypeError(
      'securityLendingInventory must be a non-empty object',
    );
  }
  const initialLendableSecurities = Object.fromEntries(
    Object.entries(securityLendingInventory).map(
      ([securityId, quantity]) => {
        if (typeof securityId !== 'string' || securityId.length === 0) {
          throw new TypeError(
            'security lending inventory ids must be non-empty strings',
          );
        }
        return [
          securityId,
          nonNegativeInteger(
            quantity,
            `securityLendingInventory.${securityId}`,
          ),
        ];
      },
    ),
  );
  const universe = createSyntheticDerivativeUniverse({
    nowMs,
    spotTicks,
    underlyingSpots,
  });
  const actors = createDerivativeActorCatalog();
  const accounts = {
    player: createDerivativeAccount({
      id: 'player',
      cashCents: playerCashCents,
      accountType: 'player',
      externalReservedCashCents:
        playerExternalReservedCashCents,
      externalCollateralCents:
        playerExternalCollateralCents,
      facilityEligibleCollateralCents:
        playerFacilityEligibleCollateralCents ??
        playerCashCents +
          playerExternalCollateralCents,
      capacityCents:
        playerCashCents +
        playerExternalCollateralCents,
    }),
    ...Object.fromEntries(
      derivativeActorAccountSpecs().map((spec) => [
        spec.id,
        createDerivativeAccount(spec),
      ]),
    ),
  };
  if (playerFacilityCollateralAuthority !== null) {
    const playerAccount = accounts.player;
    if (
      !validFacilityCollateralAuthority(
        playerFacilityCollateralAuthority,
        {
          atMs: nowMs,
          playerCashCents,
          playerExternalCollateralCents,
          playerFacilityEligibleCollateralCents:
            playerAccount.facilityEligibleCollateralCents,
          playerFinancingDebtCents: 0,
        },
      )
    ) {
      throw new TypeError(
        'playerFacilityCollateralAuthority is invalid',
      );
    }
    playerAccount.facilityCollateralShapeTracker =
      cloneJson(
        playerFacilityCollateralAuthority.tracker,
      );
    playerAccount.facilityCollateralShape = cloneJson(
      playerFacilityCollateralAuthority.shape,
    );
  }
  const books = Object.fromEntries(
    allContracts(universe).map((contract) => [
      contract.id,
      createOrderBook(contract.id),
    ]),
  );
  const settlementPriceTicks = Object.fromEntries(
    Object.values(universe.futures).map((contract) => [
      contract.id,
      contractReferenceSpotTicks(universe, contract),
    ]),
  );
  const settlementSources = Object.fromEntries(
    Object.values(universe.futures).map((contract) => [
      contract.id,
      {
        source: 'listing_reference_not_trade',
        tradeId: null,
        lastIncludedTradeSequence: 0,
        atMs: nowMs,
        basketIdentity:
          contractBasketIdentity(contract),
      },
    ]),
  );
  const state = {
    ruleVersion: DERIVATIVES_RULE_VERSION,
    worldId,
    worldSeed,
    worldStartedAtMs,
    nowMs,
    commitSeq: 0,
    nextOrderSequence: 1,
    nextTradeSequence: 1,
    nextReceiptSequence: 1,
    access: testingAccessOpen
      ? createTestingOpenAccessState({
          worldStartedAtMs,
          atMs: nowMs,
          totalEquivalentAssetCents:
            playerCashCents +
            playerExternalCollateralCents,
        })
      : createAccessState({
          worldStartedAtMs,
          atMs: nowMs,
        }),
    universe,
    actors,
    accounts,
    books,
    market: {
      lastTradePriceTicks: {},
      settlementPriceTicks,
      settlementSources,
      lastSettlementAtMs: nowMs,
      impliedVolatilityPpm: {},
      referenceObservations: Object.values(
        universe.underlyings,
      ).map((underlying) => ({
        underlyingId: underlying.id,
        spotTicks: underlying.spotTicks,
        carryRateBps: underlying.carryRateBps,
        atMs: nowMs,
        authority: underlying.authority,
        basketIdentity: underlying.basketIdentity
          ? cloneJson(underlying.basketIdentity)
          : null,
      })),
      securityReferencePrices: {},
      regimeSignalBps: 0,
      jumpRiskBps: 200,
      liquidityRiskBps: 100,
      lastActorCycleAtMs: null,
      nextActorCycleAtMs: nowMs,
      trades: [],
      seriesByContract: {},
      professionalEcology:
        createProfessionalEcologyState(),
    },
    clearing: {
      creditPoolCents: CREDIT_FACILITY_CAPACITY_CENTS,
      worldCashBridgeCents: 0,
      creditFacility: {
        ...CREDIT_FACILITY_PROVIDER,
        capacityCents: CREDIT_FACILITY_CAPACITY_CENTS,
        minimumLiquidityReserveCents:
          CREDIT_FACILITY_LIQUIDITY_RESERVE_CENTS,
        interestIncomeCents: 0,
      },
      initialDefaultFundCents:
        INITIAL_DEFAULT_FUND_CENTS,
      defaultFundCents:
        INITIAL_DEFAULT_FUND_CENTS,
      defaultFundDrawnCents: 0,
      feePoolCents: 0,
      securitiesLendingFacility: {
        ...SECURITIES_LENDING_PROVIDER,
      },
      appliedSecurityCorporateActions: {},
      lendableSecurities: cloneJson(
        initialLendableSecurities,
      ),
      initialLendableSecurities,
    },
    initialTotalCashCents: 0,
    historyCompaction: emptyHistoryCompaction(),
    receipts: [],
  };
  state.initialTotalCashCents = systemCashTotal(state);
  refreshRiskState(state);
  const audit = auditDerivativesState(state);
  if (!audit.ok) {
    throw new Error(
      `Invalid initial derivative state: ${audit.errors.join('; ')}`,
    );
  }
  return sealDerivativeAuthority(state, state.nowMs);
}

/**
 * Pure command/reducer entry point. It never schedules a timer and never
 * mutates the supplied checkpoint; the complete returned state is for the
 * existing world writer to own, persist, or publish.
 */
export function reduceDerivatives(state, command) {
  if (
    !state ||
    state.ruleVersion !== DERIVATIVES_RULE_VERSION
  ) {
    throw new Error('A derivative market state is required');
  }
  if (!command || typeof command !== 'object') {
    throw new TypeError('A derivative command is required');
  }
  safeTimestamp(command.atMs, 'command.atMs');
  if (command.atMs < state.nowMs) {
    throw new RangeError(
      'Derivative commands cannot rewind world time',
    );
  }
  let authoritySeal =
    verifiedDerivativeAuthorities.get(state);
  let inputAuditMode = 'sealed';
  if (!authoritySeal) {
    fullDerivativeAuditOrThrow(
      state,
      'Derivative input authority invariant failed',
    );
    authoritySeal = {
      lastFullAuditAtMs: state.nowMs,
      stateRoot: state,
      booksRoot: state.books,
    };
    inputAuditMode = 'full';
  } else {
    assertSealedDerivativeAuthorityUnchanged(
      state,
      authoritySeal,
    );
  }
  if (
    canUseExternalReservationSync(
      state,
      command,
      authoritySeal,
    )
  ) {
    return reduceExternalReservationSync(
      state,
      command,
      authoritySeal,
      inputAuditMode,
    );
  }
  if (actorCycleNotDue(state, command)) {
    const duplicateState = cloneJson(state);
    sealDerivativeAuthority(
      duplicateState,
      authoritySeal.lastFullAuditAtMs,
    );
    recordDerivativeReducerDiagnostics(
      duplicateState,
      {
        commandType: command.type,
        inputAuditMode,
        auditMode: 'noop',
        riskMode: 'unchanged',
        riskRefreshPasses: 0,
        dirtyBookCount: 0,
        commandCount: 0,
      },
    );
    return {
      state: duplicateState,
      receipt: actorCycleNoopReceipt(state, command),
    };
  }
  const cadenceCommand =
    command.type === 'RUN_ACTOR_CYCLE' ||
    command.type === 'ADVANCE_MARKET_CADENCE';
  const cadencePreviewDiagnostics = {};
  const quiescentCadenceDraft =
    cadenceCommand &&
    canUseQuiescentCadenceDraft(
      state,
      command,
      cadencePreviewDiagnostics,
    );
  const cadenceDraft = cadenceCommand
    ? quiescentCadenceDraft
      ? createQuiescentCadenceDraft(state)
      : createActorCadenceDraft(state)
    : null;
  const draft =
    cadenceDraft?.draft ?? cloneJson(state);
  const context = cadenceDraft?.context ?? {};
  Object.assign(context, cadencePreviewDiagnostics);
  if (!cadenceCommand) {
    migrateDerivativeContractNetwork(draft);
  }
  draft.nowMs = command.atMs;
  const rawReceipt = routeCommand(
    draft,
    command,
    context,
  );
  const cadenceWasQuiescent =
    cadenceCommand &&
    quiescentCadence(
      draft,
      rawReceipt,
      context,
    );
  let riskMode = 'full';
  if (cadenceWasQuiescent) {
    refreshRiskTimestamps(draft);
    riskMode = 'timestamp_only';
  } else if (
    !(
      context.preActorRiskRefresh === true &&
      !cadenceHasPostActorRiskMutations(
        rawReceipt,
        context,
      )
    )
  ) {
    refreshRiskState(draft, context);
  }
  if (
    command.type === 'SETTLE_DAY' &&
    rawReceipt.status === 'applied'
  ) {
    rawReceipt.forcedLiquidations = [];
    for (const account of Object.values(draft.accounts)) {
      if (
        account.riskStatus !== 'LIQUIDATE' ||
        !Object.values(account.positions).some(
          (position) => position.quantity !== 0,
        )
      ) {
        continue;
      }
      rawReceipt.forcedLiquidations.push(
        liquidateAccount(draft, {
          type: 'LIQUIDATE_ACCOUNT',
          atMs: draft.nowMs,
          actorId: account.id,
          source: 'automatic_daily_risk_gate',
        }),
      );
    }
    refreshRiskState(draft);
    rawReceipt.financingCashLiquidations = [];
    for (const account of Object.values(
      draft.accounts,
    )) {
      if (
        account.financing.cashDebtCents <= 0 ||
        account.risk.financing.status !==
          'LIQUIDATE'
      ) {
        continue;
      }
      const amountCents = Math.min(
        account.financing.cashDebtCents,
        unreservedAccountCashCents(account),
      );
      if (amountCents <= 0) continue;
      const repayment = repayMarginCredit(
        draft,
        {
          type: 'REPAY_MARGIN_CREDIT',
          atMs: draft.nowMs,
          actorId: account.id,
          amountCents,
          source:
            'automatic_daily_financing_cash_liquidation',
        },
      );
      if (repayment.status !== 'applied') {
        throw new Error(
          `Automatic financing cash liquidation failed: ${account.id}:${repayment.reason}`,
        );
      }
      rawReceipt.financingCashLiquidations.push({
        ...repayment,
        source:
          'automatic_daily_financing_cash_liquidation',
      });
    }
    refreshRiskState(draft);
    rawReceipt.financingActions =
      Object.values(draft.accounts)
        .filter(
          (account) =>
            account.financing.cashDebtCents > 0 &&
            account.risk.financing.status !==
              'NORMAL',
        )
        .map((account) => {
          const collateralForFinancingCents =
            Math.max(
              0,
              facilityCollateralCents(account) -
                account.risk.securitiesLending
                  .initialRequiredCollateralCents,
            );
          const restoredDebtLimitCents = Number(
            BigInt(collateralForFinancingCents) *
              BigInt(BPS) /
              BigInt(
                FINANCING_INITIAL_RATIO_BPS,
              ),
          );
          return {
            accountId: account.id,
            status:
              account.risk.financing.status,
            action:
              account.risk.financing.status ===
              'LIQUIDATE'
                ? 'PARENT_WORLD_COLLATERAL_LIQUIDATION_REQUIRED'
                : 'ADDITIONAL_COLLATERAL_REQUIRED',
            outstandingDebtCents:
              account.financing.cashDebtCents,
            requiredRepaymentCents: Math.max(
              0,
              account.financing.cashDebtCents -
                restoredDebtLimitCents,
            ),
            restoredDebtLimitCents,
            collateralRatioBps:
              account.risk.financing
                .collateralRatioBps,
          };
        });
    rawReceipt.securitiesLendingActions =
      Object.values(draft.accounts)
        .filter(
          (account) =>
            Object.keys(
              account.borrowedSecurities,
            ).length > 0 &&
            account.risk.facilityAggregate.status !==
              'NORMAL',
        )
        .map((account) => ({
          accountId: account.id,
          status:
            account.risk.facilityAggregate.status,
          action:
            account.risk.facilityAggregate.status ===
            'LIQUIDATE'
              ? 'PARENT_WORLD_BUY_IN_REQUIRED'
              : 'ADDITIONAL_COLLATERAL_REQUIRED',
          requiredBuyIns: Object.values(
            account.borrowedSecurities,
          ).map((loan) => ({
            securityId: loan.securityId,
            quantity: loan.quantity,
            referencePriceTicks:
              loan.referencePriceTicks,
          })),
        }));
    rawReceipt.marginCalls = Object.values(draft.accounts)
      .filter(
        (account) => account.riskStatus === 'MARGIN_CALL',
      )
      .map((account) => {
        const derivativesDeficitCents = Math.max(
          0,
          account.risk.maintenanceMarginCents -
            account.risk.equityCents,
        );
        const financingRequiredCollateralCents =
          ceilBasisPoints(
            account.financing.cashDebtCents,
            account.risk.financing.maintenanceRatioBps,
          );
        const financingDeficitCents = Math.max(
          0,
          financingRequiredCollateralCents -
            account.externalCollateralCents,
        );
        const securitiesLendingDeficitCents =
          Math.max(
            0,
            account.risk.securitiesLending
              .maintenanceRequiredCollateralCents -
              account.externalCollateralCents,
          );
        const facilityAggregateDeficitCents =
          Math.max(
            0,
            account.risk.facilityAggregate
              .maintenanceRequiredCollateralCents -
              account.externalCollateralCents,
          );
        return {
          accountId: account.id,
          status: 'MARGIN_CALL',
          equityCents: account.risk.equityCents,
          maintenanceMarginCents:
            account.risk.maintenanceMarginCents,
          derivativesDeficitCents,
          financingDeficitCents,
          securitiesLendingDeficitCents,
          facilityAggregateDeficitCents,
          deficitCents: Math.max(
            derivativesDeficitCents,
            facilityAggregateDeficitCents,
          ),
        };
      });
  }
  const receipt = appendReceipt(
    draft,
    rawReceipt,
    command,
  );
  if (
    cadenceWasQuiescent &&
    context.draftMode === 'quiescent_cow'
  ) {
    context.historyCompactionMode = 'receipt_only';
  } else {
    compactDerivativeHistory(draft, context);
    context.historyCompactionMode = 'full';
  }
  const incrementalEligible =
    cadenceWasQuiescent &&
    context.draftMode === 'quiescent_cow' &&
    (context.clonedBookIds?.size ?? 0) === 0;
  const fullAuditDue =
    !incrementalEligible ||
    draft.nowMs -
      authoritySeal.lastFullAuditAtMs >=
      FULL_CADENCE_AUDIT_INTERVAL_MS;
  let auditMode;
  let lastFullAuditAtMs =
    authoritySeal.lastFullAuditAtMs;
  if (fullAuditDue) {
    fullDerivativeAuditOrThrow(
      draft,
      'Derivative reducer invariant failed',
    );
    auditMode = 'full';
    lastFullAuditAtMs = draft.nowMs;
  } else {
    const audit =
      auditIncrementalQuiescentCadence({
        before: state,
        after: draft,
        receipt,
        context,
      });
    if (!audit.ok) {
      throw new Error(
        `Derivative incremental reducer invariant failed: ${audit.errors.join('; ')}`,
      );
    }
    auditMode = 'incremental';
  }
  const sealMode =
    incrementalEligible &&
    context.draftMode === 'quiescent_cow'
      ? 'incremental_known_nodes'
      : 'recursive_full';
  if (sealMode === 'incremental_known_nodes') {
    sealIncrementalQuiescentAuthority(
      draft,
      lastFullAuditAtMs,
    );
  } else {
    sealDerivativeAuthority(
      draft,
      lastFullAuditAtMs,
    );
  }
  recordDerivativeReducerDiagnostics(draft, {
    commandType: command.type,
    inputAuditMode,
    auditMode,
    riskMode,
    riskRefreshPasses:
      context.riskRefreshPasses ?? 0,
    dirtyBookCount:
      context.clonedBookIds?.size ?? 0,
    commandCount: rawReceipt.commandCount ?? 0,
    draftMode:
      context.draftMode ??
      (cadenceCommand ? 'cadence_cow' : 'full_clone'),
    actorPreviewIndexMode:
      context.actorPreviewIndexMode ?? 'not_applicable',
    actorPreviewOrderScans:
      context.actorPreviewOrderScans ?? 0,
    actorPreviewCertificateMode:
      context.actorPreviewCertificateMode ??
      'not_applicable',
    actorPreviewCertifiedThroughMs:
      context.actorPreviewCertifiedThroughMs ??
      draft.nowMs,
    historyCompactionMode:
      context.historyCompactionMode ?? 'full',
    sealMode,
  });
  return { state: draft, receipt };
}

export function checkpointDerivatives(state) {
  fullDerivativeAuditOrThrow(
    state,
    'Cannot checkpoint invalid derivative state',
  );
  sealDerivativeAuthority(state, state.nowMs);
  return cloneJson({
    ...state,
    access: checkpointAccess(state.access),
  });
}

function migrateDerivativeClearingState(state) {
  state.clearing ??= {};
  const clearing = state.clearing;
  const outstandingCents = Object.values(
    state.accounts ?? {},
  ).reduce(
    (sum, account) =>
      sum +
      Math.max(
        0,
        Number(account.financing?.cashDebtCents) ||
          0,
      ),
    0,
  );
  if (!clearing.creditFacility) {
    const legacyPoolCents = Number.isSafeInteger(
      clearing.creditPoolCents,
    )
      ? clearing.creditPoolCents
      : CREDIT_FACILITY_CAPACITY_CENTS -
        outstandingCents;
    const canonicalPrincipalPoolCents = Math.max(
      0,
      CREDIT_FACILITY_CAPACITY_CENTS -
        outstandingCents,
    );
    clearing.creditPoolCents =
      canonicalPrincipalPoolCents;
    clearing.worldCashBridgeCents =
      legacyPoolCents -
      canonicalPrincipalPoolCents;
    clearing.creditFacility = {
      ...CREDIT_FACILITY_PROVIDER,
      capacityCents:
        CREDIT_FACILITY_CAPACITY_CENTS,
      minimumLiquidityReserveCents:
        CREDIT_FACILITY_LIQUIDITY_RESERVE_CENTS,
      interestIncomeCents: 0,
    };
  } else {
    clearing.worldCashBridgeCents ??= 0;
    clearing.creditFacility.id ??=
      CREDIT_FACILITY_PROVIDER.id;
    clearing.creditFacility.name ??=
      CREDIT_FACILITY_PROVIDER.name;
    clearing.creditFacility.baseAnnualRateBps ??=
      CREDIT_FACILITY_PROVIDER.baseAnnualRateBps;
    clearing.creditFacility.capacityCents ??=
      CREDIT_FACILITY_CAPACITY_CENTS;
    clearing.creditFacility
      .minimumLiquidityReserveCents ??=
      CREDIT_FACILITY_LIQUIDITY_RESERVE_CENTS;
    clearing.creditFacility.interestIncomeCents ??=
      Math.max(
        0,
        clearing.creditPoolCents +
          outstandingCents -
          clearing.creditFacility.capacityCents,
      );
  }
  clearing.securitiesLendingFacility ??= {
    ...SECURITIES_LENDING_PROVIDER,
  };
  clearing.securitiesLendingFacility.id ??=
    SECURITIES_LENDING_PROVIDER.id;
  clearing.securitiesLendingFacility.name ??=
    SECURITIES_LENDING_PROVIDER.name;
  clearing.securitiesLendingFacility
    .baseAnnualFeeBps ??=
    SECURITIES_LENDING_PROVIDER.baseAnnualFeeBps;
  clearing.securitiesLendingFacility
    .maximumAnnualFeeBps ??=
    SECURITIES_LENDING_PROVIDER
      .maximumAnnualFeeBps;
  clearing.appliedSecurityCorporateActions ??= {};
  for (const account of Object.values(
    state.accounts ?? {},
  )) {
    account.externalReservedCashCents ??= 0;
    account.reservedTransactionFeesCents ??= 0;
    account.transactionFeesCents ??= 0;
    account.clearingDefault ??= {
      status: 'CURRENT',
      liabilityCents: 0,
      defaultFundDrawnCents: 0,
      lastDefaultAtMs: null,
    };
    account.clearingDefault.status ??=
      account.clearingDefault.liabilityCents > 0
        ? 'DEFAULTED'
        : 'CURRENT';
    account.clearingDefault.liabilityCents ??= 0;
    account.clearingDefault.defaultFundDrawnCents ??= 0;
    account.clearingDefault.lastDefaultAtMs ??= null;
    account.borrowedSecurityCustody ??= {};
    if (
      account.accountType === 'player' &&
      !Number.isSafeInteger(
        account.facilityEligibleCollateralCents,
      )
    ) {
      account.facilityEligibleCollateralCents =
        Math.max(
          0,
          account.cashCents +
            account.externalCollateralCents -
            (account.financing?.cashDebtCents ?? 0) -
            securitiesLendingRiskState({
              collateralValueCents: 0,
              borrowedSecurities:
                account.borrowedSecurities ?? {},
            }).liabilityCents,
        );
    }
    for (const loan of Object.values(
      account.borrowedSecurities ?? {},
    )) {
      loan.accruedFeeCents ??= 0;
      if (account.accountType !== 'player') {
        account.borrowedSecurityCustody[
          loan.securityId
        ] ??= loan.quantity;
      }
    }
  }
  const accountDefaultFundDrawnCents = Object.values(
    state.accounts ?? {},
  ).reduce(
    (sum, account) =>
      sum +
      Math.max(
        0,
        Number(
          account.clearingDefault
            ?.defaultFundDrawnCents,
        ) || 0,
      ),
    0,
  );
  clearing.defaultFundDrawnCents ??=
    accountDefaultFundDrawnCents;
  clearing.initialDefaultFundCents ??=
    (clearing.defaultFundCents ?? 0) +
    clearing.defaultFundDrawnCents;
  const actorDecisionTimes = Object.values(
    state.actors ?? {},
  )
    .filter(
      (actor) =>
        actor.decisionCount > 0 &&
        Number.isSafeInteger(
          actor.lastDecisionAtMs,
        ),
    )
    .map((actor) => actor.lastDecisionAtMs);
  state.market.lastActorCycleAtMs ??=
    actorDecisionTimes.length > 0
      ? Math.max(...actorDecisionTimes)
      : null;
  state.market.nextActorCycleAtMs ??=
    state.market.lastActorCycleAtMs === null
      ? state.nowMs
      : state.market.lastActorCycleAtMs +
        DERIVATIVE_ACTOR_CADENCE_MS;
}

function migrateProfessionalEcologyState(state) {
  if (state.market.professionalEcology === undefined) {
    state.market.professionalEcology =
      createProfessionalEcologyState();
    return true;
  }
  return false;
}

function migrateDerivativeContractNetwork(state) {
  migrateDerivativeClearingState(state);
  const actorCatalogMigrated =
    migrateDerivativeActorCatalog(state.actors);
  const sourceRuleVersion = state.ruleVersion;
  const sourceContractRuleVersion =
    state.universe?.ruleVersion;
  const universeMigrated =
    migrateContractUniverse(state.universe);
  const professionalEcologyMigrated =
    migrateProfessionalEcologyState(state);
  let migrated =
    universeMigrated ||
    actorCatalogMigrated ||
    professionalEcologyMigrated;
  const migratingLegacyBasketState = [
    PREVIOUS_BASKET_DERIVATIVES_RULE_VERSION,
    LEGACY_DERIVATIVES_RULE_VERSION,
  ].includes(sourceRuleVersion) ||
    sourceContractRuleVersion !== CONTRACT_RULE_VERSION;
  const observationIdentityFor = (underlyingId) => {
    const currentIdentity =
      state.universe.underlyings[underlyingId]
        ?.basketIdentity ?? null;
    if (!migratingLegacyBasketState || !currentIdentity) {
      return currentIdentity;
    }
    return (
      allContracts(state.universe).find(
        (contract) =>
          contract.underlyingId === underlyingId &&
          contract.basketIdentity &&
          !sameEquityBasketIdentity(
            contract.basketIdentity,
            currentIdentity,
          ),
      )?.basketIdentity ?? currentIdentity
    );
  };
  let lastTradeSequence = 0;
  for (const trade of state.market.trades ?? []) {
    const contract = contractById(
      state.universe,
      trade.contractId,
    );
    if (contract) {
      trade.feeScheduleId ??=
        contract.feeSchedule.id;
      trade.buyerOpeningQuantity ??= 0;
      trade.buyerClosingQuantity ??=
        trade.quantity;
      trade.sellerOpeningQuantity ??= 0;
      trade.sellerClosingQuantity ??=
        trade.quantity;
      trade.buyerFeeCents ??= 0;
      trade.sellerFeeCents ??= 0;
    }
    if (
      contract &&
      !sameEquityBasketIdentity(
        trade.basketIdentity,
        contract.basketIdentity,
      ) &&
      (
        trade.basketIdentity === undefined ||
        migratingLegacyBasketState
      )
    ) {
      trade.basketIdentity =
        contractBasketIdentity(contract);
      migrated = true;
    }
    if (
      !Number.isSafeInteger(trade.sequence) ||
      trade.sequence <= lastTradeSequence
    ) {
      const idSequence = Number(
        String(trade.id).match(/(\d+)$/)?.[1],
      );
      trade.sequence =
        Number.isSafeInteger(idSequence) &&
        idSequence > lastTradeSequence
          ? idSequence
          : lastTradeSequence + 1;
      migrated = true;
    }
    lastTradeSequence = trade.sequence;
  }
  state.nextTradeSequence = Math.max(
    Number(state.nextTradeSequence) || 1,
    lastTradeSequence + 1,
  );
  if (
    !state.market.seriesByContract ||
    typeof state.market.seriesByContract !== 'object' ||
    Array.isArray(state.market.seriesByContract)
  ) {
    rebuildDerivativeTradeSeries(state);
    migrated = true;
  } else {
    const validContractIds = new Set(
      allContracts(state.universe).map(
        (contract) => contract.id,
      ),
    );
    for (const contractId of Object.keys(
      state.market.seriesByContract,
    )) {
      if (validContractIds.has(contractId)) continue;
      delete state.market.seriesByContract[contractId];
      migrated = true;
    }
  }
  state.market.referenceObservations ??= [];
  for (const observation of state.market
    .referenceObservations) {
    if (
      observation.basketIdentity === undefined ||
      migratingLegacyBasketState
    ) {
      observation.basketIdentity =
        observationIdentityFor(
          observation.underlyingId,
        );
      migrated = true;
    }
  }
  const observationKey = (
    underlyingId,
    basketIdentity,
  ) =>
    [
      underlyingId,
      basketIdentity?.constituentSetVersion ?? 'none',
    ].join(':');
  const observedUnderlyingVersions = new Set(
    state.market.referenceObservations.map(
      (observation) =>
        observationKey(
          observation.underlyingId,
          observation.basketIdentity,
        ),
    ),
  );
  for (const underlying of Object.values(
    state.universe.underlyings,
  )) {
    const key = observationKey(
      underlying.id,
      underlying.basketIdentity,
    );
    if (!observedUnderlyingVersions.has(key)) {
      state.market.referenceObservations.push({
        underlyingId: underlying.id,
        spotTicks: underlying.spotTicks,
        carryRateBps: underlying.carryRateBps,
        atMs: state.nowMs,
        authority: underlying.authority,
        basketIdentity: underlying.basketIdentity
          ? cloneJson(underlying.basketIdentity)
          : null,
      });
      migrated = true;
    }
  }
  state.market.referenceObservations =
    state.market.referenceObservations.slice(
      -MAX_REFERENCE_OBSERVATIONS,
    );
  for (const contract of allContracts(state.universe)) {
    state.books[contract.id] ??=
      createOrderBook(contract.id);
    for (const order of Object.values(
      state.books[contract.id].orders,
    )) {
      order.reservedTransactionFeesCents ??= 0;
      if (
        contract.basketIdentity &&
        (
          order.basketIdentity === undefined ||
          migratingLegacyBasketState
        )
      ) {
        order.basketIdentity =
          contractBasketIdentity(contract);
        migrated = true;
      }
    }
    for (const account of Object.values(state.accounts)) {
      const position = account.positions?.[contract.id];
      if (
        position &&
        (
          position.basketIdentity === undefined ||
          migratingLegacyBasketState
        )
      ) {
        position.basketIdentity =
          contractBasketIdentity(contract);
        migrated = true;
      }
    }
    if (contract.type !== 'future') continue;
    state.market.settlementPriceTicks[contract.id] ??=
      referenceSpotTicks(state, contract);
    state.market.settlementSources[contract.id] ??= {
      source: 'migration_listing_reference_not_trade',
      tradeId: null,
      lastIncludedTradeSequence: 0,
      atMs: state.nowMs,
      basketIdentity:
        contractBasketIdentity(contract),
    };
    const settlementSource =
      state.market.settlementSources[contract.id];
    if (
      settlementSource.basketIdentity === undefined ||
      migratingLegacyBasketState
    ) {
      settlementSource.basketIdentity =
        contractBasketIdentity(contract);
      migrated = true;
    }
    if (
      !Number.isSafeInteger(
        settlementSource.lastIncludedTradeSequence,
      ) ||
      settlementSource.lastIncludedTradeSequence < 0
    ) {
      const referencedTrade =
        settlementSource.tradeId
          ? state.market.trades.find(
              (trade) =>
                trade.id === settlementSource.tradeId,
            )
          : null;
      settlementSource.lastIncludedTradeSequence =
        referencedTrade?.sequence ??
        state.market.trades.reduce(
          (maximum, trade) =>
            trade.contractId === contract.id &&
            trade.atMs < settlementSource.atMs
              ? Math.max(maximum, trade.sequence)
              : maximum,
          0,
        );
      migrated = true;
    }
  }
  recomputeReservations(state);
  return migrated;
}

export function restoreDerivatives(
  checkpoint,
  { worldId = null } = {},
) {
  const restored = cloneJson(checkpoint);
  if (
    worldId !== null &&
    restored.worldId !== worldId
  ) {
    throw new Error(
      'Derivative checkpoint belongs to a different world',
    );
  }
  restored.access = restoreAccess(restored.access);
  migrateDerivativeContractNetwork(restored);
  if (
    [
      PREVIOUS_DERIVATIVES_RULE_VERSION,
      PREVIOUS_BASKET_DERIVATIVES_RULE_VERSION,
    ].includes(restored.ruleVersion)
  ) {
    restored.ruleVersion = DERIVATIVES_RULE_VERSION;
  }
  if (
    restored.ruleVersion ===
    LEGACY_DERIVATIVES_RULE_VERSION
  ) {
    restored.ruleVersion = DERIVATIVES_RULE_VERSION;
    restored.historyCompaction =
      emptyHistoryCompaction();
    compactReceiptHistory(restored);
    const legacyAudit = auditDerivativesState(restored);
    if (!legacyAudit.ok) {
      throw new Error(
        `Invalid legacy derivative checkpoint: ${legacyAudit.errors.join('; ')}`,
      );
    }
    compactDerivativeHistory(restored);
  }
  const audit = auditDerivativesState(restored);
  if (!audit.ok) {
    throw new Error(
      `Invalid derivative checkpoint: ${audit.errors.join('; ')}`,
    );
  }
  return sealDerivativeAuthority(
    restored,
    restored.nowMs,
  );
}

export function buildRollCommands({
  state,
  actorId,
  fromContractId,
  toContractId,
  quantity,
  atMs,
}) {
  const from = state.universe.futures[fromContractId];
  const to = state.universe.futures[toContractId];
  if (!from || !to || from.underlyingId !== to.underlyingId) {
    throw new Error(
      'Roll requires two futures on the same underlying',
    );
  }
  positiveInteger(quantity, 'quantity');
  const position =
    state.accounts[actorId]?.positions[fromContractId]
      ?.quantity ?? 0;
  if (position === 0 || quantity > Math.abs(position)) {
    throw new RangeError(
      'Roll quantity exceeds the source futures position',
    );
  }
  const closeSide = position > 0 ? 'sell' : 'buy';
  const openSide = position > 0 ? 'buy' : 'sell';
  const rollGroupId = [
    'roll',
    actorId,
    fromContractId,
    toContractId,
    atMs,
  ].join(':');
  return [
    {
      type: 'SUBMIT_ORDER',
      atMs,
      actorId,
      contractId: fromContractId,
      side: closeSide,
      orderType: 'market',
      priceTicks: null,
      quantity,
      tif: 'IOC',
      rollGroupId,
      source: 'roll_leg_close',
    },
    {
      type: 'SUBMIT_ORDER',
      atMs,
      actorId,
      contractId: toContractId,
      side: openSide,
      orderType: 'market',
      priceTicks: null,
      quantity,
      tif: 'IOC',
      rollGroupId,
      source: 'roll_leg_open',
    },
  ];
}

function optionDiagnostic(state, contract) {
  const underlying =
    state.universe.underlyings[contract.underlyingId];
  const spotTicks = referenceSpotTicks(
    state,
    contract,
  );
  const tradedVolatility =
    state.market.impliedVolatilityPpm[contract.id];
  const hasTradedVolatility =
    Number.isSafeInteger(tradedVolatility) &&
    tradedVolatility >= 0;
  const volatilityPpm = hasTradedVolatility
    ? tradedVolatility
    : surfaceVolatilityPpm(
        {
          baseVolatilityPpm:
            contract.baseVolatilityPpm,
          termSlopePpmPerYear:
            underlying.driverModel
              .termSlopePpmPerYear,
          putSkewPpm: 110_000,
          smilePpm: 55_000,
          minimumVolatilityPpm: 60_000,
          maximumVolatilityPpm: 1_500_000,
        },
        {
          spotTicks,
          strikeTicks: contract.strikeTicks,
          timeToExpiryMs: Math.max(
            0,
            contract.expiryMs - state.nowMs,
          ),
        },
      );
  const optionCarry = resolveOptionCarryInputs({
    contract,
    underlying:
      state.universe.underlyings[
        contract.underlyingId
      ],
  });
  return {
    contractId: contract.id,
    underlyingId: contract.underlyingId,
    basketIdentity:
      contractBasketIdentity(contract),
    referenceSpotTicks: spotTicks,
    asOfMs: state.nowMs,
    volatilityPpm,
    volatilitySource: hasTradedVolatility
      ? 'matched_trade_implied'
      : 'contract_surface',
    optionCarry,
    ...priceEuropeanOption({
      kind: contract.kind,
      spotTicks,
      strikeTicks: contract.strikeTicks,
      timeToExpiryMs: Math.max(
        0,
        contract.expiryMs - state.nowMs,
      ),
      volatilityPpm,
      ...optionCarry,
    }),
  };
}

function optionGreekProjections(state, player) {
  const diagnostics = Object.fromEntries(
    Object.values(state.universe.options).map(
      (contract) => [
        contract.id,
        optionDiagnostic(state, contract),
      ],
    ),
  );
  const exposures = {};
  for (const position of Object.values(player.positions)) {
    const contract =
      state.universe.options[position.contractId];
    if (!contract || position.quantity === 0) continue;
    const diagnostic = diagnostics[contract.id];
    exposures[contract.id] = {
      contractId: contract.id,
      quantity: position.quantity,
      contractMultiplier:
        contract.contractMultiplier,
      multiplierUnit: contract.multiplierUnit,
      deltaPpmUnits:
        position.quantity *
        contract.contractMultiplier *
        diagnostic.deltaPpm,
      gammaPpmUnitsPerTick:
        position.quantity *
        contract.contractMultiplier *
        diagnostic.gammaPpmPerTick,
      vegaCentsPerVolPoint:
        position.quantity *
        contract.tickValueCents *
        diagnostic.vegaTicksPerVolPoint,
      thetaCentsPerDay:
        position.quantity *
        contract.tickValueCents *
        diagnostic.thetaTicksPerDay,
      rhoCentsPerRatePoint:
        position.quantity *
        contract.tickValueCents *
        diagnostic.rhoTicksPerRatePoint,
    };
  }
  return { diagnostics, exposures };
}

function positionMarkProjections(
  state,
  player,
  priceAuthoritiesByContract,
) {
  const projected = {};
  for (const position of Object.values(player.positions)) {
    if (position.quantity === 0) continue;
    const contract = contractById(
      state.universe,
      position.contractId,
    );
    if (!contract) continue;
    const authority =
      priceAuthoritiesByContract[contract.id];
    const projectedMark = authority?.mark;
    const markPriceTicks =
      Number.isSafeInteger(projectedMark?.priceTicks) &&
      projectedMark.priceTicks > 0
        ? projectedMark.priceTicks
        : position.lastSettlementPriceTicks ??
          position.averageOpenPriceTicks;
    const markSource =
      projectedMark?.source ?? 'position_basis';
    const basisTicks =
      contract.type === 'future'
        ? position.lastSettlementPriceTicks ??
          position.averageOpenPriceTicks
        : position.averageOpenPriceTicks;
    const unrealizedPnLCents =
      position.quantity *
      (markPriceTicks - basisTicks) *
      contract.tickValueCents;
    projected[contract.id] = {
      contractId: contract.id,
      quantity: position.quantity,
      contractMultiplier:
        contract.contractMultiplier,
      markPriceTicks,
      markSource,
      basisTicks,
      unrealizedPnLCents,
      realizedPnLCents:
        position.realizedPnLCents,
      marketValueCents:
        contract.type === 'option'
          ? position.quantity *
            markPriceTicks *
            contract.tickValueCents
          : null,
      notionalCents:
        contract.type === 'future'
          ? Math.abs(position.quantity) *
            markPriceTicks *
            contract.tickValueCents
          : null,
    };
  }
  return projected;
}

function futuresTheoreticalPriceTicks(state, contract) {
  const underlying =
    state.universe.underlyings[contract.underlyingId];
  const spotTicks = referenceSpotTicks(state, contract);
  const remainingYears =
    Math.max(0, contract.expiryMs - state.nowMs) /
    (365 * DERIVATIVE_SERIES_DAY_MS);
  const carryRateBps =
    underlying?.carryRateBps ??
    contract.carryRateBps ??
    200;
  const unrounded =
    spotTicks *
    (1 + carryRateBps / BPS * remainingYears);
  return Math.max(
    contract.tickSize,
    Math.round(unrounded / contract.tickSize) *
      contract.tickSize,
  );
}

function priceAuthorityProjections(
  state,
  optionDiagnostics,
  books,
) {
  const latestTradeByContract = new Map();
  for (const trade of state.market.trades) {
    const previous = latestTradeByContract.get(
      trade.contractId,
    );
    if (
      !previous ||
      trade.sequence > previous.sequence
    ) {
      latestTradeByContract.set(trade.contractId, trade);
    }
  }
  return Object.fromEntries(
    allContracts(state.universe).map((contract) => {
      const lastTrade = latestTradeByContract.get(
        contract.id,
      );
      const settlementPriceTicks =
        state.market.settlementPriceTicks[contract.id];
      const settlementSource =
        state.market.settlementSources[contract.id];
      const theoreticalPriceTicks =
        contract.type === 'future'
          ? futuresTheoreticalPriceTicks(state, contract)
          : optionDiagnostics[contract.id]?.priceTicks ??
            null;
      const theoreticalSource =
        contract.type === 'future'
          ? 'cost_of_carry_model'
          : 'option_pricing_model';
      const hasSettlement =
        Number.isSafeInteger(settlementPriceTicks) &&
        settlementPriceTicks > 0;
      const executableBook = books[contract.id];
      const bestBid = executableBook?.bids?.[0];
      const bestAsk = executableBook?.asks?.[0];
      const hasExecutableMidpoint = Boolean(
        Number.isSafeInteger(bestBid?.priceTicks) &&
          Number.isSafeInteger(bestAsk?.priceTicks) &&
          bestBid.priceTicks > 0 &&
          bestAsk.priceTicks > bestBid.priceTicks,
      );
      const executableMidpointTicks =
        hasExecutableMidpoint
          ? Math.max(
              contract.tickSize,
              Math.round(
                (
                  bestBid.priceTicks +
                  bestAsk.priceTicks
                ) /
                  2 /
                  contract.tickSize,
              ) * contract.tickSize,
            )
          : null;
      const markPriceTicks = hasExecutableMidpoint
        ? executableMidpointTicks
        : lastTrade
          ? lastTrade.priceTicks
          : hasSettlement
            ? settlementPriceTicks
            : theoreticalPriceTicks;
      const markSource = hasExecutableMidpoint
        ? 'executable_midpoint'
        : lastTrade
          ? 'matched_trade'
          : hasSettlement
            ? 'clearing_settlement'
            : 'theoretical_reference_no_trade';
      return [
        contract.id,
        {
          contractId: contract.id,
          lastTrade: lastTrade
            ? {
                priceTicks: lastTrade.priceTicks,
                source: 'matched_order_fill',
                tradeId: lastTrade.id,
                atMs: lastTrade.atMs,
                sequence: lastTrade.sequence,
              }
            : null,
          settlement: hasSettlement
            ? {
                priceTicks: settlementPriceTicks,
                source:
                  settlementSource?.source ??
                  'clearing_settlement',
                tradeId:
                  settlementSource?.tradeId ?? null,
                atMs:
                  settlementSource?.atMs ??
                  state.market.lastSettlementAtMs,
              }
            : null,
          mark: {
            priceTicks: markPriceTicks,
            source: markSource,
            asOfMs: hasExecutableMidpoint
              ? state.nowMs
              : lastTrade
                ? lastTrade.atMs
                : hasSettlement
                  ? settlementSource?.atMs ??
                    state.market.lastSettlementAtMs
                  : state.nowMs,
          },
          theoretical: {
            priceTicks: theoreticalPriceTicks,
            source: theoreticalSource,
          },
        },
      ];
    }),
  );
}

export function snapshotDerivatives(state, depth = 5) {
  const player = state.accounts.player;
  const optionGreeks = optionGreekProjections(
    state,
    player,
  );
  const creditAvailability =
    creditFacilityAvailability(state);
  const playerFinancingHeadroom =
    financingCollateralHeadroomCents(player);
  const playerAvailableCreditCents = Math.min(
    creditAvailability.availableCreditCents,
    playerFinancingHeadroom.headroomCents,
  );
  const playerOutstandingCents =
    player.financing.cashDebtCents;
  const institutionalOutstandingCents =
    creditAvailability.outstandingCents -
    playerOutstandingCents;
  const books = Object.fromEntries(
    Object.entries(state.books).map(([contractId, book]) => [
      contractId,
      aggregateBook(book, depth),
    ]),
  );
  const priceAuthoritiesByContract =
    priceAuthorityProjections(
      state,
      optionGreeks.diagnostics,
      books,
    );
  return cloneJson({
    publication: 'lzy_derivatives_public_v1',
    nowMs: state.nowMs,
    commitSeq: state.commitSeq,
    access: {
      qualification: state.access.qualification,
      permissionModes: Object.fromEntries(
        Object.keys(state.access.grants).map((permission) => [
          permission,
          derivePermissionMode(state.access, permission),
        ]),
      ),
    },
    professionalEcology: {
      schemaVersion: PROFESSIONAL_ECOLOGY_STATE_SCHEMA,
      ruleVersion: PROFESSIONAL_ECOLOGY_CONTROL_VERSION,
      authority: 'controller_policy_only',
      integrationStatus: 'production_replacement_gate',
      executionMode: 'replace_existing_actor_batch',
      policiesByActorId:
        state.market.professionalEcology
          .policiesByActorId,
    },
    contracts: {
      underlyings: state.universe.underlyings,
      futures: state.universe.futures,
      options: state.universe.options,
    },
    books,
    lastTradePriceTicks:
      state.market.lastTradePriceTicks,
    settlementPriceTicks:
      state.market.settlementPriceTicks,
    impliedVolatilityPpm:
      state.market.impliedVolatilityPpm,
    seriesByContract:
      state.market.seriesByContract,
    priceAuthoritiesByContract,
    clearing: {
      initialDefaultFundCents:
        state.clearing.initialDefaultFundCents,
      defaultFundCents:
        state.clearing.defaultFundCents,
      defaultFundDrawnCents:
        state.clearing.defaultFundDrawnCents,
      feePoolCents:
        state.clearing.feePoolCents,
    },
    financingFacility: {
      providerId:
        state.clearing.creditFacility.id,
      providerName:
        state.clearing.creditFacility.name,
      capacityCents:
        state.clearing.creditFacility.capacityCents,
      minimumLiquidityReserveCents:
        state.clearing.creditFacility
          .minimumLiquidityReserveCents,
      availableCreditCents:
        creditAvailability.availableCreditCents,
      playerAvailableCreditCents,
      playerFacilityEligibleCollateralCents:
        player.facilityEligibleCollateralCents,
      outstandingCreditCents:
        creditAvailability.outstandingCents,
      playerOutstandingCents,
      institutionalOutstandingCents,
      annualRateBps:
        state.clearing.creditFacility
          .baseAnnualRateBps,
      utilizationBps:
        state.clearing.creditFacility.capacityCents <= 0
          ? 0
          : Math.floor(
              creditAvailability.outstandingCents *
                BPS /
                state.clearing.creditFacility
                  .capacityCents,
            ),
    },
    securitiesLending: {
      providerId:
        state.clearing.securitiesLendingFacility.id,
      providerName:
        state.clearing.securitiesLendingFacility.name,
      instruments: Object.fromEntries(
        Object.entries(
          state.clearing.initialLendableSecurities,
        ).map(([securityId, initialQuantity]) => {
          const availableQuantity =
            state.clearing.lendableSecurities[
              securityId
            ] ?? 0;
          const borrowedQuantity =
            initialQuantity - availableQuantity;
          const playerBorrowedQuantity =
            player.borrowedSecurities[securityId]
              ?.quantity ?? 0;
          const referencePriceTicks =
            state.market.securityReferencePrices[
              securityId
            ] ?? null;
          const playerAvailableQuantity =
            maximumSecurityBorrowQuantity(
              state,
              player,
              securityId,
              referencePriceTicks,
              availableQuantity,
            );
          return [
            securityId,
            {
              securityId,
              initialQuantity,
              availableQuantity,
              playerAvailableQuantity,
              borrowedQuantity,
              playerBorrowedQuantity,
              institutionalBorrowedQuantity:
                borrowedQuantity -
                playerBorrowedQuantity,
              utilizationBps:
                initialQuantity <= 0
                  ? 0
                  : Math.floor(
                      borrowedQuantity *
                        BPS /
                        initialQuantity,
                    ),
              referencePriceTicks,
              annualFeeBps:
                securityLendingFeeBps(
                  state,
                  securityId,
                ),
            },
          ];
        }),
      ),
    },
    priceBands: Object.fromEntries(
      Object.values(state.universe.futures).map(
        (contract) => [
          contract.id,
          futurePriceBand(state, contract),
        ],
      ),
    ),
    optionDiagnostics: optionGreeks.diagnostics,
    player: {
      cashCents: player.cashCents,
      externalReservedCashCents:
        player.externalReservedCashCents ?? 0,
      availableCashCents:
        unreservedAccountCashCents(player),
      transactionFeesCents:
        player.transactionFeesCents,
      reservedTransactionFeesCents:
        player.reservedTransactionFeesCents,
      clearingDefault:
        player.clearingDefault,
      positions: player.positions,
      risk: player.risk,
      riskStatus: player.riskStatus,
      lifecycleStatus: player.lifecycleStatus,
      financing: player.financing,
      borrowedSecurities: player.borrowedSecurities,
      optionGreekExposures:
        optionGreeks.exposures,
      positionMarks: positionMarkProjections(
        state,
        player,
        priceAuthoritiesByContract,
      ),
      openOrders: Object.values(state.books).flatMap(
        (book) =>
          Object.values(book.orders)
            .filter(
              (order) =>
                order.ownerId === 'player' &&
                activeOrder(order),
            )
            .map((order) => ({
              id: order.id,
              contractId: order.symbol,
              basketIdentity:
                order.basketIdentity,
              side: order.side,
              priceTicks: order.priceTicks,
              remainingQty: order.remainingQty,
              submittedMs: order.submittedMs,
            })),
      ),
    },
    actors: Object.fromEntries(
      Object.values(state.actors).map((actor) => {
        const account = state.accounts[actor.accountId];
        return [
          actor.id,
          {
            id: actor.id,
            name: actor.name,
            actorType: actor.actorType,
            strategyFamily: actor.strategyFamily,
            decisionMode: actor.decisionMode,
            objective: actor.objective,
            lifecycleStatus: actor.lifecycleStatus,
            capacityMultiplierBps:
              account.capacityMultiplierBps,
            riskStatus: account.riskStatus,
            clearingDefault:
              account.clearingDefault,
          },
        ];
      }),
    ),
    recentTrades: state.market.trades.slice(-100),
    recentReceipts: state.receipts.slice(-100),
  });
}

function validHedgeAuditMetadata(
  state,
  contractId,
  hedge,
) {
  const contract = state.universe.futures?.[contractId];
  return Boolean(
    contract &&
      hedge &&
      hedge.purpose === 'option_delta_inventory' &&
      Array.isArray(hedge.sourceUnderlyingIds) &&
      hedge.sourceUnderlyingIds.length > 0 &&
      new Set(hedge.sourceUnderlyingIds).size ===
        hedge.sourceUnderlyingIds.length &&
      hedge.sourceUnderlyingIds.every((underlyingId) =>
        Object.hasOwn(
          state.universe.underlyings,
          underlyingId,
        ),
      ) &&
      hedge.instrumentUnderlyingId ===
        contract.underlyingId &&
      [
        'direct_underlying_future',
        'index_future_proxy',
        'portfolio_future_proxy',
      ].includes(hedge.mode) &&
      (
        hedge.ratioBps === null ||
        (
          Number.isSafeInteger(hedge.ratioBps) &&
          hedge.ratioBps > 0 &&
          hedge.ratioBps <= 20_000
        )
      ) &&
      Number.isSafeInteger(
        hedge.residualBasisRiskBps,
      ) &&
      hedge.residualBasisRiskBps >= 0 &&
      hedge.residualBasisRiskBps <= BPS
  );
}

function derivativeSeriesAuditErrors(state) {
  const errors = [];
  const seriesByContract =
    state.market?.seriesByContract;
  if (
    !seriesByContract ||
    typeof seriesByContract !== 'object' ||
    Array.isArray(seriesByContract)
  ) {
    return ['INVALID_DERIVATIVE_SERIES_ROOT'];
  }
  const contractIds = new Set(
    allContracts(state.universe ?? {}).map(
      (contract) => contract.id,
    ),
  );
  if (
    Object.keys(seriesByContract).some(
      (contractId) => !contractIds.has(contractId),
    )
  ) {
    errors.push('INVALID_DERIVATIVE_SERIES_KEYS');
  }
  const validBar = (bar, intervalMs) =>
    bar?.priceAuthority ===
      'matched_order_fills_only' &&
    Number.isSafeInteger(bar.startMs) &&
    bar.startMs >= 0 &&
    bar.endMs === bar.startMs + intervalMs &&
    [
      bar.openTicks,
      bar.highTicks,
      bar.lowTicks,
      bar.closeTicks,
      bar.volume,
      bar.turnoverTicks,
      bar.tradeCount,
    ].every(
      (value) => Number.isSafeInteger(value) && value > 0,
    ) &&
    bar.lowTicks <= bar.openTicks &&
    bar.lowTicks <= bar.closeTicks &&
    bar.highTicks >= bar.openTicks &&
    bar.highTicks >= bar.closeTicks &&
    typeof bar.firstTradeId === 'string' &&
    typeof bar.lastTradeId === 'string';
  for (const [contractId, series] of Object.entries(
    seriesByContract,
  )) {
    if (
      !series ||
      series.schema !== DERIVATIVE_SERIES_SCHEMA ||
      series.contractId !== contractId ||
      series.priceAuthority !==
        'matched_order_fills_only' ||
      !Array.isArray(series.tradePoints) ||
      !Array.isArray(series.minuteBars) ||
      !Array.isArray(series.dailyBars) ||
      series.tradePoints.length >
        MAX_DERIVATIVE_SERIES_TRADE_POINTS ||
      series.minuteBars.length >
        MAX_DERIVATIVE_SERIES_MINUTE_BARS ||
      series.dailyBars.length >
        MAX_DERIVATIVE_SERIES_DAILY_BARS
    ) {
      errors.push(
        `INVALID_DERIVATIVE_SERIES:${contractId}`,
      );
      continue;
    }
    if (
      series.tradePoints.some(
        (point, index) =>
          point?.priceAuthority !==
            'matched_order_fill' ||
          typeof point.tradeId !== 'string' ||
          !Number.isSafeInteger(point.sequence) ||
          !Number.isSafeInteger(point.atMs) ||
          !Number.isSafeInteger(point.priceTicks) ||
          point.priceTicks <= 0 ||
          !Number.isSafeInteger(point.quantity) ||
          point.quantity <= 0 ||
          point.turnoverTicks !==
            point.priceTicks * point.quantity ||
          (
            index > 0 &&
            point.sequence <=
              series.tradePoints[index - 1].sequence
          ),
      ) ||
      series.minuteBars.some(
        (bar, index) =>
          !validBar(
            bar,
            DERIVATIVE_SERIES_MINUTE_MS,
          ) ||
          (
            index > 0 &&
            bar.startMs <=
              series.minuteBars[index - 1].startMs
          ),
      ) ||
      series.dailyBars.some(
        (bar, index) =>
          !validBar(
            bar,
            DERIVATIVE_SERIES_DAY_MS,
          ) ||
          (
            index > 0 &&
            bar.startMs <=
              series.dailyBars[index - 1].startMs
          ),
      )
    ) {
      errors.push(
        `INVALID_DERIVATIVE_SERIES_DATA:${contractId}`,
      );
    }
    const archive = series.archive;
    if (
      !archive ||
      [
        'tradePointCount',
        'minuteBarCount',
        'dailyBarCount',
        'volume',
        'turnoverTicks',
      ].some(
        (field) =>
          !Number.isSafeInteger(archive[field]) ||
          archive[field] < 0,
      ) ||
      (
        archive.firstTradeAtMs !== null &&
        !Number.isSafeInteger(
          archive.firstTradeAtMs,
        )
      ) ||
      (
        archive.lastTradeAtMs !== null &&
        !Number.isSafeInteger(
          archive.lastTradeAtMs,
        )
      )
    ) {
      errors.push(
        `INVALID_DERIVATIVE_SERIES_ARCHIVE:${contractId}`,
      );
    }
  }
  return errors;
}

function professionalEcologyAuditErrors(state) {
  const ecology = state.market?.professionalEcology;
  if (
    !ecology ||
    ecology.schemaVersion !==
      PROFESSIONAL_ECOLOGY_STATE_SCHEMA ||
    ecology.ruleVersion !==
      PROFESSIONAL_ECOLOGY_CONTROL_VERSION ||
    ecology.authority !== 'controller_policy_only' ||
    ecology.integrationStatus !==
      'production_replacement_gate' ||
    ecology.executionMode !==
      'replace_existing_actor_batch' ||
    !ecology.policiesByActorId ||
    typeof ecology.policiesByActorId !== 'object' ||
    Array.isArray(ecology.policiesByActorId)
  ) {
    return ['INVALID_PROFESSIONAL_ECOLOGY_STATE'];
  }
  const errors = [];
  for (const [actorId, policy] of Object.entries(
    ecology.policiesByActorId,
  )) {
    const reason = professionalActorPolicyReason(
      state,
      actorId,
      policy,
    );
    if (reason) {
      errors.push(`${reason}:${actorId}`);
    }
  }
  return errors;
}

export function auditDerivativesState(state) {
  const errors = [];
  if (
    !state ||
    state.ruleVersion !== DERIVATIVES_RULE_VERSION ||
    typeof state.worldId !== 'string' ||
    !Number.isSafeInteger(state.nowMs) ||
    state.nowMs < state.worldStartedAtMs
  ) {
    return {
      ok: false,
      errors: ['INVALID_DERIVATIVE_STATE'],
    };
  }
  try {
    assertAccessState(state.access);
  } catch (error) {
    errors.push(`INVALID_ACCESS:${error.message}`);
  }
  const contractAudit = assertContractUniverse(
    state.universe,
  );
  errors.push(...contractAudit.errors);
  errors.push(...derivativeSeriesAuditErrors(state));
  errors.push(...professionalEcologyAuditErrors(state));
  for (const contract of allContracts(
    state.universe ?? {},
  )) {
    if (!state.books?.[contract.id]) {
      errors.push(`CONTRACT_WITHOUT_BOOK:${contract.id}`);
    }
  }
  for (const [contractId, book] of Object.entries(
    state.books ?? {},
  )) {
    const bookContract = contractById(
      state.universe,
      contractId,
    );
    if (!bookContract) {
      errors.push(`BOOK_WITHOUT_CONTRACT:${contractId}`);
      continue;
    }
    const bookAudit = assertBookIntegrity(book);
    errors.push(
      ...bookAudit.errors.map(
        (error) => `BOOK:${contractId}:${error}`,
      ),
    );
    for (const order of Object.values(book.orders)) {
      if (activeOrder(order) && order.tif !== 'GTC') {
        errors.push(
          `BOOK:${contractId}:${
            order.tif === 'IOC'
              ? 'ACTIVE_IOC_ORDER'
              : 'ACTIVE_NON_GTC_ORDER'
          }:${order.id}`,
        );
      }
      if (
        !sameEquityBasketIdentity(
          order.basketIdentity,
          bookContract.basketIdentity,
        )
      ) {
        errors.push(
          `INVALID_ORDER_BASKET_IDENTITY:${order.id}`,
        );
      }
      if (
        order.hedge !== null &&
        order.hedge !== undefined &&
        !validHedgeAuditMetadata(
          state,
          contractId,
          order.hedge,
        )
      ) {
        errors.push(
          `INVALID_HEDGE_ORDER_METADATA:${order.id}`,
        );
      }
    }
  }
  const accountAudit = auditRiskAccounts(
    state.accounts,
    state.universe,
  );
  errors.push(...accountAudit.errors);
  const playerAccount = state.accounts?.player;
  const hasFacilityCollateralTracker =
    playerAccount?.facilityCollateralShapeTracker !==
    undefined;
  const hasFacilityCollateralShape =
    playerAccount?.facilityCollateralShape !== undefined;
  if (
    hasFacilityCollateralTracker !==
    hasFacilityCollateralShape
  ) {
    errors.push(
      'INCOMPLETE_PLAYER_FACILITY_COLLATERAL_AUTHORITY',
    );
  } else if (
    hasFacilityCollateralTracker &&
    !validFacilityCollateralAuthority(
      {
        tracker:
          playerAccount.facilityCollateralShapeTracker,
        shape: playerAccount.facilityCollateralShape,
      },
      {
        atMs:
          playerAccount.facilityCollateralShape
            .authorityAtMs,
        playerCashCents:
          playerAccount.facilityCollateralShape
            .playerCashCents,
        playerExternalCollateralCents:
          playerAccount.facilityCollateralShape
            .externalCollateralCents,
        playerFacilityEligibleCollateralCents:
          playerAccount.facilityCollateralShape
            .eligibleCollateralCents,
        playerFinancingDebtCents:
          playerAccount.facilityCollateralShape
            .financingDebtCents,
      },
    )
  ) {
    errors.push(
      'INVALID_PLAYER_FACILITY_COLLATERAL_AUTHORITY',
    );
  } else if (
    hasFacilityCollateralShape &&
    playerAccount.facilityEligibleCollateralCents !==
      playerAccount.facilityCollateralShape
        .eligibleCollateralCents
  ) {
    errors.push(
      'PLAYER_FACILITY_COLLATERAL_ELIGIBLE_MISMATCH',
    );
  }
  errors.push(...actorOrderInvariantErrors(state));
  if (
    (
      state.market.lastActorCycleAtMs !== null &&
      (
        !Number.isSafeInteger(
          state.market.lastActorCycleAtMs,
        ) ||
        state.market.lastActorCycleAtMs < 0 ||
        state.market.lastActorCycleAtMs >
          state.nowMs
      )
    ) ||
    !Number.isSafeInteger(
      state.market.nextActorCycleAtMs,
    ) ||
    state.market.nextActorCycleAtMs < 0 ||
    (
      state.market.lastActorCycleAtMs !== null &&
      state.market.nextActorCycleAtMs !==
        state.market.lastActorCycleAtMs +
          DERIVATIVE_ACTOR_CADENCE_MS
    )
  ) {
    errors.push('INVALID_ACTOR_CYCLE_ANCHOR');
  }
  const creditFacility =
    state.clearing?.creditFacility;
  const creditOutstandingCents =
    financingOutstandingCents(state);
  if (
    !creditFacility ||
    typeof creditFacility.id !== 'string' ||
    typeof creditFacility.name !== 'string' ||
    !Number.isSafeInteger(
      creditFacility.capacityCents,
    ) ||
    creditFacility.capacityCents < 0 ||
    !Number.isSafeInteger(
      creditFacility.minimumLiquidityReserveCents,
    ) ||
    creditFacility.minimumLiquidityReserveCents < 0 ||
    creditFacility.minimumLiquidityReserveCents >
      creditFacility.capacityCents ||
    !Number.isSafeInteger(
      creditFacility.interestIncomeCents,
    ) ||
    creditFacility.interestIncomeCents < 0 ||
    !Number.isSafeInteger(
      state.clearing.creditPoolCents,
    ) ||
    state.clearing.creditPoolCents < 0 ||
    !Number.isSafeInteger(
      state.clearing.worldCashBridgeCents,
    )
  ) {
    errors.push('INVALID_CREDIT_FACILITY');
  } else {
    if (
      creditOutstandingCents >
      creditFacility.capacityCents -
        creditFacility.minimumLiquidityReserveCents +
        creditFacility.interestIncomeCents
    ) {
      errors.push(
        'CREDIT_FACILITY_CAPITAL_LIMIT_EXCEEDED',
      );
    }
    if (
      state.clearing.creditPoolCents +
        creditOutstandingCents !==
      creditFacility.capacityCents +
        creditFacility.interestIncomeCents
    ) {
      errors.push(
        'CREDIT_FACILITY_PRINCIPAL_NOT_CONSERVED',
      );
    }
  }
  const lendingFacility =
    state.clearing?.securitiesLendingFacility;
  if (
    !lendingFacility ||
    typeof lendingFacility.id !== 'string' ||
    typeof lendingFacility.name !== 'string' ||
    !Number.isSafeInteger(
      lendingFacility.baseAnnualFeeBps,
    ) ||
    lendingFacility.baseAnnualFeeBps < 0 ||
    !Number.isSafeInteger(
      lendingFacility.maximumAnnualFeeBps,
    ) ||
    lendingFacility.maximumAnnualFeeBps <
      lendingFacility.baseAnnualFeeBps
  ) {
    errors.push(
      'INVALID_SECURITIES_LENDING_FACILITY',
    );
  }
  if (
    !state.clearing
      ?.appliedSecurityCorporateActions ||
    Array.isArray(
      state.clearing
        .appliedSecurityCorporateActions,
    )
  ) {
    errors.push(
      'INVALID_SECURITY_CORPORATE_ACTION_LEDGER',
    );
  } else {
    for (const [actionId, action] of Object.entries(
      state.clearing
        .appliedSecurityCorporateActions,
    )) {
      if (
        action?.actionId !== actionId ||
        !Object.hasOwn(
          state.clearing
            .initialLendableSecurities,
          action.securityId,
        ) ||
        !Number.isSafeInteger(
          action.splitNumerator,
        ) ||
        action.splitNumerator <= 0 ||
        !Number.isSafeInteger(
          action.splitDenominator,
        ) ||
        action.splitDenominator <= 0 ||
        !Number.isSafeInteger(
          action.cashDividendCentsPerShare,
        ) ||
        action.cashDividendCentsPerShare < 0 ||
        !Number.isSafeInteger(
          action.compensationCents,
        ) ||
        action.compensationCents < 0 ||
        !Number.isSafeInteger(
          action.paidCompensationCents,
        ) ||
        action.paidCompensationCents < 0 ||
        action.paidCompensationCents >
          action.compensationCents ||
        !Number.isSafeInteger(action.atMs) ||
        action.atMs < 0 ||
        action.atMs > state.nowMs
      ) {
        errors.push(
          `INVALID_SECURITY_CORPORATE_ACTION:${actionId}`,
        );
      }
    }
  }
  const initialLendingInventory =
    state.clearing?.initialLendableSecurities;
  const availableLendingInventory =
    state.clearing?.lendableSecurities;
  const validInventoryMap = (inventory) =>
    Boolean(
      inventory &&
        typeof inventory === 'object' &&
        !Array.isArray(inventory),
    );
  if (
    !validInventoryMap(initialLendingInventory) ||
    !validInventoryMap(availableLendingInventory) ||
    Object.keys(initialLendingInventory)
      .sort()
      .join('\u0000') !==
      Object.keys(availableLendingInventory)
        .sort()
        .join('\u0000')
  ) {
    errors.push('INVALID_LENDING_INVENTORY_KEYS');
  } else {
    for (const securityId of Object.keys(
      initialLendingInventory,
    )) {
      if (
        !Number.isSafeInteger(
          initialLendingInventory[securityId],
        ) ||
        initialLendingInventory[securityId] < 0 ||
        !Number.isSafeInteger(
          availableLendingInventory[securityId],
        ) ||
        availableLendingInventory[securityId] < 0
      ) {
        errors.push(
          `INVALID_LENDING_INVENTORY_QUANTITY:${securityId}`,
        );
      }
    }
  }
  for (const account of Object.values(
    state.accounts ?? {},
  )) {
    for (const [securityId, loan] of Object.entries(
      account.borrowedSecurities ?? {},
    )) {
      if (loan?.securityId !== securityId) {
        errors.push(
          `BORROWED_SECURITY_IDENTITY_MISMATCH:${account.id}:${securityId}:${loan?.securityId ?? 'unknown'}`,
        );
      }
    }
  }
  const accountDefaultFundDrawnCents = Object.values(
    state.accounts ?? {},
  ).reduce(
    (sum, account) =>
      sum +
      (
        account.clearingDefault
          ?.defaultFundDrawnCents ?? 0
      ),
    0,
  );
  const accountDefaultLiabilityCents = Object.values(
    state.accounts ?? {},
  ).reduce(
    (sum, account) =>
      sum +
      (
        account.clearingDefault
          ?.liabilityCents ?? 0
      ),
    0,
  );
  if (
    !Number.isSafeInteger(
      state.clearing?.initialDefaultFundCents,
    ) ||
    state.clearing.initialDefaultFundCents < 0 ||
    !Number.isSafeInteger(
      state.clearing.defaultFundCents,
    ) ||
    state.clearing.defaultFundCents < 0 ||
    !Number.isSafeInteger(
      state.clearing.defaultFundDrawnCents,
    ) ||
    state.clearing.defaultFundDrawnCents < 0 ||
    !Number.isSafeInteger(
      state.clearing.feePoolCents,
    ) ||
    state.clearing.feePoolCents < 0 ||
    state.clearing.defaultFundCents +
      state.clearing.defaultFundDrawnCents !==
      state.clearing.initialDefaultFundCents ||
    accountDefaultFundDrawnCents !==
      state.clearing.defaultFundDrawnCents ||
    accountDefaultLiabilityCents <
      accountDefaultFundDrawnCents
  ) {
    errors.push('INVALID_CLEARING_DEFAULT_FUND');
  }
  for (const account of Object.values(
    state.accounts ?? {},
  )) {
    if (
      account.clearingDefault?.lastDefaultAtMs !== null &&
      account.clearingDefault?.lastDefaultAtMs >
        state.nowMs
    ) {
      errors.push(
        `INVALID_CLEARING_DEFAULT_TIME:${account.id}`,
      );
    }
  }
  const totalCash = systemCashTotal(state);
  if (totalCash !== state.initialTotalCashCents) {
    errors.push(
      `CASH_NOT_CONSERVED:${state.initialTotalCashCents}:${totalCash}`,
    );
  }
  const compaction = state.historyCompaction;
  if (
    !compaction ||
    [
      'archivedReceiptCount',
      'archivedTradeCount',
      'archivedOrderCount',
      'archivedContractCount',
      'archivedBookCount',
    ].some(
      (field) =>
        !Number.isSafeInteger(compaction[field]) ||
        compaction[field] < 0,
    ) ||
    (
      compaction.lastCompactedAtMs !== null &&
      (
        !Number.isSafeInteger(
          compaction.lastCompactedAtMs,
        ) ||
        compaction.lastCompactedAtMs < 0 ||
        compaction.lastCompactedAtMs > state.nowMs
      )
    )
  ) {
    errors.push('INVALID_HISTORY_COMPACTION');
  }
  for (const [securityId, initialQuantity] of Object.entries(
    validInventoryMap(initialLendingInventory)
      ? initialLendingInventory
      : {},
  )) {
    const borrowed = Object.values(state.accounts).reduce(
      (sum, account) =>
        sum +
        (
          account.borrowedSecurities?.[securityId]?.quantity ??
          0
        ),
      0,
    );
    if (
      (
        state.clearing.lendableSecurities[securityId] ??
        0
      ) +
        borrowed !==
      initialQuantity
    ) {
      errors.push(
        `LENDABLE_SECURITY_NOT_CONSERVED:${securityId}`,
      );
    }
  }
  const tradeIds = new Set();
  const tradeSequences = new Set();
  for (const trade of state.market.trades) {
    const tradedContract = contractById(
      state.universe,
      trade.contractId,
    );
    if (
      tradeIds.has(trade.id) ||
      tradeSequences.has(trade.sequence) ||
      !Number.isSafeInteger(trade.sequence) ||
      trade.sequence <= 0 ||
      trade.sequence >= state.nextTradeSequence ||
      !state.books[trade.contractId]?.orders[
        trade.buyerOrderId
      ] ||
      !state.books[trade.contractId]?.orders[
        trade.sellerOrderId
      ] ||
      trade.priceAuthority !== 'matched_order_fill'
    ) {
      errors.push(`INVALID_TRADE:${trade.id}`);
    }
    if (
      !sameEquityBasketIdentity(
        trade.basketIdentity,
        tradedContract?.basketIdentity,
      )
    ) {
      errors.push(
        `INVALID_TRADE_BASKET_IDENTITY:${trade.id}`,
      );
    }
    if (
      !tradedContract ||
      trade.feeScheduleId !==
        tradedContract.feeSchedule.id ||
      [
        trade.buyerOpeningQuantity,
        trade.buyerClosingQuantity,
        trade.sellerOpeningQuantity,
        trade.sellerClosingQuantity,
        trade.buyerFeeCents,
        trade.sellerFeeCents,
      ].some(
        (value) =>
          !Number.isSafeInteger(value) || value < 0,
      ) ||
      trade.buyerOpeningQuantity +
        trade.buyerClosingQuantity !==
        trade.quantity ||
      trade.sellerOpeningQuantity +
        trade.sellerClosingQuantity !==
        trade.quantity
    ) {
      errors.push(`INVALID_TRADE_FEES:${trade.id}`);
    }
    if (
      trade.hedge !== undefined &&
      !validHedgeAuditMetadata(
        state,
        trade.contractId,
        trade.hedge,
      )
    ) {
      errors.push(
        `INVALID_HEDGE_TRADE_METADATA:${trade.id}`,
      );
    }
    if (
      tradedContract?.type === 'future' &&
      Number.isSafeInteger(trade.limitDownTicks) &&
      Number.isSafeInteger(trade.limitUpTicks) &&
      (
        trade.priceTicks < trade.limitDownTicks ||
        trade.priceTicks > trade.limitUpTicks
      )
    ) {
      errors.push(
        `FUTURE_TRADE_OUTSIDE_RECORDED_BAND:${trade.id}`,
      );
    }
    tradeIds.add(trade.id);
    tradeSequences.add(trade.sequence);
  }
  for (const [contractId, source] of Object.entries(
    state.market.settlementSources ?? {},
  )) {
    if (
      !state.universe.futures[contractId] ||
      !Number.isSafeInteger(
        source.lastIncludedTradeSequence,
      ) ||
      source.lastIncludedTradeSequence < 0 ||
      source.lastIncludedTradeSequence >=
        state.nextTradeSequence
    ) {
      errors.push(
        `INVALID_SETTLEMENT_TRADE_CUT:${contractId}`,
      );
    }
    if (
      !sameEquityBasketIdentity(
        source.basketIdentity,
        state.universe.futures[contractId]
          ?.basketIdentity,
      )
    ) {
      errors.push(
        `INVALID_SETTLEMENT_BASKET_IDENTITY:${contractId}`,
      );
    }
  }
  for (const observation of state.market
    .referenceObservations ?? []) {
    const underlying =
      state.universe.underlyings[
        observation.underlyingId
      ];
    const basketUnderlying =
      Boolean(underlying?.basketIdentity);
    if (
      !underlying ||
      (
        basketUnderlying &&
        !equityBasketByIdentity(
          observation.basketIdentity,
        )
      ) ||
      (!basketUnderlying && observation.basketIdentity)
    ) {
      errors.push(
        `INVALID_REFERENCE_BASKET_IDENTITY:${observation.underlyingId ?? 'unknown'}`,
      );
    }
  }
  for (const [
    contractId,
    priceTicks,
  ] of Object.entries(
    state.market.lastTradePriceTicks,
  )) {
    const last = [...state.market.trades]
      .reverse()
      .find((trade) => trade.contractId === contractId);
    if (!last || last.priceTicks !== priceTicks) {
      errors.push(
        `LAST_PRICE_WITHOUT_MATCHED_TRADE:${contractId}`,
      );
    }
  }
  const receiptIds = new Set();
  for (const receipt of state.receipts) {
    if (
      receiptIds.has(receipt.id) ||
      !Number.isSafeInteger(receipt.commitSeq) ||
      receipt.commitSeq <= 0 ||
      receipt.commitSeq > state.commitSeq
    ) {
      errors.push(`INVALID_RECEIPT:${receipt.id}`);
    }
    if (
      receipt.type === 'RUN_ACTOR_CYCLE' &&
      (
        Object.hasOwn(receipt, 'commandReceipts') ||
        !receipt.commandSummary ||
        !Number.isSafeInteger(
          receipt.commandSummary.appliedCount,
        ) ||
        !Number.isSafeInteger(
          receipt.commandSummary.rejectedCount,
        ) ||
        receipt.commandSummary.appliedCount +
          receipt.commandSummary.rejectedCount !==
          receipt.commandCount
      )
    ) {
      errors.push(
        `INVALID_ACTOR_CYCLE_SUMMARY:${receipt.id}:${
          receipt.commandSummary?.appliedCount ?? 'missing'
        }:${
          receipt.commandSummary?.rejectedCount ?? 'missing'
        }:${receipt.commandCount ?? 'missing'}:${
          receipt.status ?? 'missing'
        }:${receipt.reason ?? 'none'}`,
      );
    }
    receiptIds.add(receipt.id);
  }
  return { ok: errors.length === 0, errors };
}

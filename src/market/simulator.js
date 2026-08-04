import {
  advanceEmbeddedDerivativesMarket,
  applyCanonicalSecurityCorporateAction,
  applyAction,
  advanceWorld,
  auditWorld,
  getMarketDataProjection,
  migrateEmbeddedWorldStateForRestore,
  migrateLegacyMarketHistoryForRealtime,
  openTestingTradingAccess,
  settleOpenWorldCityCompletion,
  synchronizeEmbeddedDerivativeReservations,
  synchronizeEmbeddedDerivatives,
} from '../engine.js?v=20260804-01';
import {
  activeOrdersForOwner,
  aggregateBook,
  assertBookIntegrity,
  cancelInBook,
  commitOrderBookTransaction,
  compactOrderBookQueues,
  copyOrderBookRuntimeMetadata,
  createOrderBook,
  createOrderBookTransaction,
  materializeOrderBookTransaction,
  orderBookTransactionChanges,
  previewBookExecution,
  submitToBook,
} from './order-book.js?v=20260804-01';
import {
  agentEcologyInvariantErrors,
  createAgentCatalog,
  decideAgentOrders,
  evaluateCapacity,
  migrateAgentEcologyState,
  publicTradeTailsBySymbol,
  recordAgentCommandOutcome,
  refreshDelayedFundamentals,
  scheduleAgentDecisions,
  scheduleNextAgentDecision,
  scheduleDeferredPublicFlowResponse,
  schedulePublicFlowResponses,
} from './agents.js?v=20260804-01';
import {
  NATURAL_DAY_MS,
  aggregateBars,
  appendFillInPlace,
  closeFrameInPlace,
  createBarSeries,
} from './bars.js?v=20260804-01';
import {
  deriveFixedIntradayTimeDomain,
  INTRADAY_WINDOW_MS,
  MARKET_CLOCK_ORIGIN_OFFSET_MS,
} from './chart-domain.js?v=20260804-01';
import { deriveIssuerValuation } from './valuation.js?v=20260804-01';
import {
  advanceWorldlineState,
  archiveWorldlineSourceEvidence,
} from '../worldline.js?v=20260804-01';
import {
  quantStrategyDefinition,
} from '../role-strategies.js?v=20260804-01';
import {
  acceptWorld2DControl,
  auditWorldSpatialState,
  normalizeWorldSpatialState,
  priorSpatialControlReceipt,
  stepWorld2DMotion,
  WORLD2D_MOTION_STEP_MS,
  world2dMotionEventDescriptor,
} from '../world2d/index.js?v=20260804-01';
import {
  markEntertainmentProjectionChanged,
} from '../experience/entertainment-world.js?v=20260804-01';
import { reduceDerivatives } from '../derivatives/engine.js?v=20260804-01';
import {
  createCumulativeTurnoverState,
  projectCumulativeTurnover,
  reduceCumulativeTurnover,
} from './turnover-truth.js?v=20260804-01';
import {
  projectFundamentalRelationshipNetwork,
} from './fundamental-network-projection.js?v=20260804-01';

export const LEGACY_MARKET_RULE_VERSION =
  'lzy-realtime-market-0.4.0';
export const MARKET_RULE_VERSION = 'lzy-realtime-market-0.5.0';
const TURNOVER_PRODUCTION_INTEGRATION_SCHEMA =
  'lzy_turnover_production_integration_v1';
const QUOTE_FRAME_MS = 3_000;
const WORLD_DAY_MS = NATURAL_DAY_MS;
const MAX_VISIBLE_FRAMES = 240;
const MAX_VISIBLE_TRADES = 600;
const MAX_WORLD_PRICE_HISTORY_POINTS = 120;
const MAX_ARCHIVED_MINUTE_BARS_PER_SYMBOL = 10_080;
const MAX_ARCHIVED_DAILY_BARS_PER_SYMBOL = 365;
const MAX_TERMINAL_ORDERS_PER_SYMBOL = 64;
const MAX_ARCHIVE_REFERENCES_PER_SYMBOL = 64;
const MAX_LIVE_REALTIME_AUDIT_CHAINS =
  MAX_VISIBLE_TRADES;
const REALTIME_AUDIT_BACKGROUND_TARGET = Math.floor(
  MAX_LIVE_REALTIME_AUDIT_CHAINS * 3 / 4,
);
const MAX_RECENT_REALTIME_AUDIT_BUNDLES = 64;
const MAX_CHAIN_REFERENCES_PER_AUDIT_BUNDLE = 64;
const MAX_RECEIPT_REFERENCES_PER_AUDIT_BUNDLE = 8;
const MAX_REALTIME_AUDIT_FOLDED_BLOCKS = 64;
const REALTIME_AUDIT_LOSSLESS_PAYLOAD_VERSION = 1;
const REALTIME_AUDIT_PACKED_PAYLOAD_VERSION = 2;
const REALTIME_AUDIT_BLOCK_PAYLOAD_ENCODING =
  'lzy_realtime_audit_lz4_json_base64_v1';
const REALTIME_AUDIT_COLD_RECORD_SCHEMA =
  'lzy_realtime_audit_cold_record_v1';
const REALTIME_AUDIT_PACKED_KEYS = Object.freeze([
  'version',
  'commitSeq',
  'receipts',
  'id',
  'type',
  'status',
  'reason',
  'orderId',
  'actorId',
  'symbol',
  'side',
  'orderType',
  'requestedQuantity',
  'limitPriceTicks',
  'parentOrderId',
  'ecologyAgentId',
  'ecologyIntentKind',
  'automationKind',
  'automationDecisionId',
  'automationStrategyIds',
  'orderContextVersion',
  'orderContextRegime',
  'orderContextSymbol',
  'orderContextArrivalBudgetUnits',
  'orderContextDepthBudgetUnits',
  'orderContextMechanismSources',
  'filledQuantity',
  'remainingQuantity',
  'cancelledQuantity',
  'cancelReason',
  'selfTradeCount',
  'selfTradeQuantity',
  'filledGrossCents',
  'averageFillPriceTicks',
  'worstFillPriceTicks',
  'reservedCashCents',
  'reservedUnits',
  'tradeIds',
  'virtualMs',
  'source',
  'agentId',
  'agentActivityId',
  'chains',
  'trade',
  'eventId',
  'factId',
  'tick',
  'buyerId',
  'sellerId',
  'selfTrade',
  'price',
  'priceTicks',
  'quantity',
  'orderIds',
  'parentOrderIds',
  'restingOrderId',
  'incomingOrderId',
  'incomingArrivalPriceTicks',
  'grossCents',
  'buyerFeeCents',
  'sellerFeeCents',
  'feeCents',
  'event',
  'effectiveAt',
  'effectiveAtMs',
  'authority',
  'affectedEntities',
  'preconditions',
  'ruleVersion',
  'seedRef',
  'parentIds',
  'ledgerEntryIds',
  'visibility',
  'correctionRef',
  'summary',
  'journal',
  'description',
  'amountUnit',
  'postings',
  'account',
  'debit',
  'credit',
  'securityTransfers',
  'from',
  'to',
  'fact',
  'entityId',
  'value',
  'confidence',
  'memory',
  'ownerId',
  'content',
  'salience',
  'accuracyState',
  'createdTick',
  'createdMs',
  'lastRecalledTick',
  'decay',
  'digest',
  'custodySource',
]);
const REALTIME_AUDIT_PACKED_KEY_INDEX = new Map(
  REALTIME_AUDIT_PACKED_KEYS.map(
    (key, index) => [key, index],
  ),
);
const REALTIME_AUDIT_SLOT_SOURCE =
  'realtime_audit_archive_slot';
const MAX_AGENT_NONTRADE_RECEIPTS = 128;
const MAX_PLAYER_REJECTED_RECEIPTS = 64;
const MAX_PLAYER_AUTOMATION_NONTRADE_RECEIPTS = 64;
const MAX_LIVE_QUIET_DERIVATIVE_CADENCE_RECEIPTS = 32;
const DERIVATIVE_CADENCE_RECEIPT_ARCHIVE_FORMAT =
  'derivative-cadence-receipt-ranges-v1';
const DERIVATIVE_CADENCE_RECEIPT_ID_PREFIX =
  'derivative_cadence_receipt_';
const MAX_QUEUED_AGENT_EVENTS = 48;
const MAX_AGENT_COMMANDS_PER_BATCH = 128;
const MAX_PUBLIC_AGENT_ACTIONS_PER_ACTIVITY = 4;
const MAX_MAKER_SYMBOLS_PER_CADENCE = 8;
const PLAYER_ROLE_AUTOMATION_SCHEMA =
  'lzy-player-role-automation-v1';
const MAX_PLAYER_AUTOMATION_DECISIONS = 24;
const PLAYER_AUTOMATION_CADENCE_MS = 30_000;
const PUBLIC_MARKET_SCHEMA = 'lzy_market_public_v1';
const PUBLIC_MARKET_COMMAND_PATCH_SCHEMA =
  'lzy_market_command_patch_v1';
const PUBLIC_AGENT_AGGREGATE_SCHEMA = 'anonymous_aggregate_v1';
const DEFAULT_LISTING_RULES = Object.freeze({
  LZA001: Object.freeze({ board: 'main', dailyLimitBps: 1_000 }),
  LZA002: Object.freeze({ board: 'star', dailyLimitBps: 2_000 }),
  LZA003: Object.freeze({ board: 'chinext', dailyLimitBps: 2_000 }),
  LZB101: Object.freeze({ board: 'main', dailyLimitBps: 1_000 }),
  LZC201: Object.freeze({ board: 'star', dailyLimitBps: 2_000 }),
  LZD301: Object.freeze({ board: 'main', dailyLimitBps: 1_000 }),
  LZE401: Object.freeze({ board: 'main', dailyLimitBps: 1_000 }),
  LZF501: Object.freeze({ board: 'chinext', dailyLimitBps: 2_000 }),
  LZG601: Object.freeze({ board: 'star', dailyLimitBps: 2_000 }),
  LZH701: Object.freeze({ board: 'chinext', dailyLimitBps: 2_000 }),
  LZI801: Object.freeze({ board: 'main', dailyLimitBps: 1_000 }),
  LZJ901: Object.freeze({ board: 'main', dailyLimitBps: 1_000 }),
  LZK011: Object.freeze({ board: 'main', dailyLimitBps: 1_000 }),
  LZL121: Object.freeze({ board: 'star', dailyLimitBps: 2_000 }),
});
const LEGACY_THREE_STOCK_CHECKPOINT_SYMBOLS =
  Object.freeze([
    'LZA001',
    'LZA002',
    'LZA003',
  ]);
const LEGACY_EIGHT_STOCK_CHECKPOINT_SYMBOLS =
  Object.freeze([
    ...LEGACY_THREE_STOCK_CHECKPOINT_SYMBOLS,
    'LZB101',
    'LZC201',
    'LZD301',
    'LZE401',
    'LZF501',
  ]);
const CHECKPOINT_EVENT_TYPES = Object.freeze([
  'command',
  'player_motion_step',
  'open_world_city_completion',
  'agent_command_batch',
  'agent_decision',
  'derivative_actor_cycle',
  'public_flow_response',
  'security_corporate_action',
  'quote_frame',
  'world_day_settlement',
]);
const CHECKPOINT_COMMAND_TYPES = Object.freeze([
  'submit_order',
  'cancel_order',
  'world_action',
  'player_control',
]);
const terminalOrderIndexes = new WeakMap();
const orderIndexes = new WeakMap();
const orderIndexOverlays = new WeakSet();
const recentActivityIndexes = new WeakMap();
const minuteBarProjectionCaches = new WeakMap();
const archivedMinuteDayProjectionCaches = new WeakMap();
const archivedMinuteBarIndexes = new WeakMap();
const archivedUltraFillIndexes = new WeakMap();
const shareholderProjectionCaches = new WeakMap();
const marketProjectionDiagnostics = new WeakMap();
const marketProgressionDiagnostics = new WeakMap();
const worldBalanceMirrorStates = new WeakMap();
const deferredWorldOrderMirrorSymbols = new WeakMap();
const deferredBarFillTransactions = new WeakMap();
const verifiedAccountAuthoritySeals = new WeakMap();
const verifiedRealtimeAuditPayloadSummaries = new WeakMap();
const verifiedRealtimeAuditBlocks = new WeakSet();
const realtimeAuditColdStores = new WeakMap();
const authorizedPlayerAutomationCommands = new WeakSet();
const INTERNAL_PROCESS_NEXT_EVENT_AUTHORITY = Symbol(
  'lzy.internal-process-next-event-authority',
);
const LIQUIDITY_LAYER_SCALAR_FIELDS = new Set([
  'layerKey',
  'symbol',
  'side',
  'gridIndex',
  'zone',
  'purpose',
  'anchorTicks',
  'valuationObservationId',
  'inventoryDirection',
  'inventoryBucket',
  'inventoryBucketUnits',
  'quoteState',
  'symbolRegime',
  'flowPressureBucket',
  'flowDirection',
  'episodeId',
  'limitQueuePhase',
  'minimumRestMs',
  'boundaryBudgetAllocationBps',
  'expectedContinuationBps',
  'adverseSelectionCostBps',
  'expectedNetEdgeBps',
  'fillProbabilityBps',
  'decisionSequence',
  'minimumDurableQueueUnits',
  'mandateOwnerId',
  'lawfulCoverageRepair',
  'unconstrainedPriceTicks',
]);

export const MARKET_PHASE_PRIORITY = Object.freeze({
  SESSION: 10,
  CANCEL_EXPIRE: 20,
  PLAYER_COMMAND: 30,
  PLAYER_MOTION: 35,
  BROKER_ROUTE: 40,
  PUBLIC_FLOW_RESPONSE: 50,
  MAKER_QUOTE: 60,
  INSTITUTION_DECISION: 70,
  DERIVATIVE_ACTOR_CYCLE: 80,
  QUOTE_FRAME: 90,
  WORLD_DAY_SETTLEMENT: 100,
});

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function projectionDiagnosticsFor(state) {
  let diagnostics = marketProjectionDiagnostics.get(state);
  if (!diagnostics) {
    diagnostics = {
      quoteFrameCount: 0,
      minuteBarsCurrentDayCalls: 0,
      archivedMinuteBarsScanned: 0,
      archivedMinuteBarsAppended: 0,
      shareholderProjectionCalls: 0,
      shareholderRankBuilds: 0,
      shareholderAccountsRanked: 0,
    };
    marketProjectionDiagnostics.set(state, diagnostics);
  }
  return diagnostics;
}

export function inspectMarketProjectionDiagnostics(
  state,
  { reset = false } = {},
) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('market state is required');
  }
  if (reset) {
    marketProjectionDiagnostics.delete(state);
  }
  return {
    ...projectionDiagnosticsFor(state),
  };
}

function cloneStructured(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : cloneJson(value);
}

function normalizeJsonSignedZerosInPlace(value) {
  const visited = new WeakSet();
  const visit = (candidate) => {
    if (
      candidate === null ||
      typeof candidate !== 'object' ||
      visited.has(candidate)
    ) {
      return;
    }
    visited.add(candidate);
    for (const key of Object.keys(candidate)) {
      const entry = candidate[key];
      if (
        typeof entry === 'number' &&
        Object.is(entry, -0)
      ) {
        candidate[key] = 0;
      } else {
        visit(entry);
      }
    }
  };
  visit(value);
  return value;
}

function cloneLiquidityLayer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return cloneJson(value);
  }
  const keys = Object.keys(value);
  const scalarRecord =
    keys.every((key) => LIQUIDITY_LAYER_SCALAR_FIELDS.has(key)) &&
    keys.every((key) => {
      const field = value[key];
      return (
        field === null ||
        typeof field === 'string' ||
        typeof field === 'boolean' ||
        (
          typeof field === 'number' &&
          Number.isFinite(field) &&
          !Object.is(field, -0)
        )
      );
    });
  return scalarRecord ? { ...value } : cloneJson(value);
}

function cents(value) {
  return Math.round(Number(value) * 100);
}

function moneyFromCents(value) {
  return value / 100;
}

function listingRuleFromIdentity(security = {}) {
  const identity = security.listingIdentity;
  const board = {
    MAIN: 'main',
    STAR: 'star',
    CHINEXT: 'chinext',
  }[identity?.board];
  if (!board) return null;
  const riskDesignation = identity.riskDesignation;
  if (
    riskDesignation !== 'NONE' &&
    riskDesignation !== 'ST' &&
    riskDesignation !== 'STAR_ST'
  ) {
    return null;
  }
  return {
    board,
    dailyLimitBps:
      riskDesignation === 'NONE'
        ? board === 'main'
          ? 1_000
          : 2_000
        : 500,
  };
}

function listingRule(symbol, security = {}) {
  const canonical =
    DEFAULT_LISTING_RULES[symbol] ??
    listingRuleFromIdentity(security);
  if (canonical) return canonical;
  const fallback = {
    board: 'main',
    dailyLimitBps: 1_000,
  };
  return {
    board:
      typeof security.board === 'string' && security.board
        ? security.board
        : fallback.board,
    dailyLimitBps:
      Number.isSafeInteger(security.dailyLimitBps) &&
      security.dailyLimitBps > 0 &&
      security.dailyLimitBps < 10_000
        ? security.dailyLimitBps
        : fallback.dailyLimitBps,
  };
}

function savedListingFieldErrors(world) {
  const errors = [];
  for (const [symbol, security] of Object.entries(
    world?.market?.securities ?? {},
  )) {
    const canonical =
      DEFAULT_LISTING_RULES[symbol] ??
      listingRuleFromIdentity(security);
    if (
      !isPositiveInteger(security?.previousCloseTicks)
    ) {
      errors.push(`MISSING_PREVIOUS_CLOSE:${symbol}`);
    }
    if (
      canonical &&
      (
        security?.board !== canonical.board ||
        security?.dailyLimitBps !== canonical.dailyLimitBps
      )
    ) {
      errors.push(`INVALID_LISTING_RULE:${symbol}`);
    }
  }
  return errors;
}

function securityPriceBand(security) {
  const rule = listingRule(security.symbol, security);
  const previousCloseTicks =
    isPositiveInteger(security.previousCloseTicks)
      ? security.previousCloseTicks
      : cents(security.lastPrice);
  const rawUpper = Math.round(
    previousCloseTicks *
      (10_000 + rule.dailyLimitBps) /
      10_000,
  );
  const rawLower = Math.round(
    previousCloseTicks *
      (10_000 - rule.dailyLimitBps) /
      10_000,
  );
  return {
    ...rule,
    previousCloseTicks,
    limitUpTicks: Math.max(previousCloseTicks + 1, rawUpper),
    limitDownTicks: Math.max(
      1,
      Math.min(previousCloseTicks - 1, rawLower),
    ),
  };
}

function playerRoleAutomationKind(world) {
  if (world?.player?.roleType === 'quant_institution') return 'quant';
  if (world?.player?.roleType === 'stabilization_fund') {
    return 'stabilization';
  }
  return 'none';
}

function playerRoleAutomationConfiguration(world) {
  const kind = playerRoleAutomationKind(world);
  if (kind === 'quant') {
    return world.player.roleState?.strategyLab ?? null;
  }
  if (kind === 'stabilization') {
    return world.player.roleState?.stabilityDesk ?? null;
  }
  return null;
}

function createPlayerRoleAutomation(world) {
  const kind = playerRoleAutomationKind(world);
  const configuration = playerRoleAutomationConfiguration(world);
  return {
    schemaVersion: PLAYER_ROLE_AUTOMATION_SCHEMA,
    kind,
    configRevision:
      Number.isSafeInteger(configuration?.revision)
        ? configuration.revision
        : 0,
    nextDecisionAtMs: kind === 'none' ? null : 0,
    lastDecisionAtMs: null,
    totalDecisions: 0,
    totalOrderAttempts: 0,
    totalFilledQuantity: 0,
    recentDecisions: [],
  };
}

function hydratePlayerRoleAutomation(state) {
  const expectedKind = playerRoleAutomationKind(state.world);
  const runtime = state.playerRoleAutomation;
  if (
    !runtime ||
    runtime.schemaVersion !== PLAYER_ROLE_AUTOMATION_SCHEMA ||
    runtime.kind !== expectedKind
  ) {
    state.playerRoleAutomation = createPlayerRoleAutomation(state.world);
    return true;
  }
  return false;
}

function synchronizePlayerRoleAutomationConfiguration(state) {
  hydratePlayerRoleAutomation(state);
  const runtime = state.playerRoleAutomation;
  const configuration = playerRoleAutomationConfiguration(state.world);
  const revision = Number.isSafeInteger(configuration?.revision)
    ? configuration.revision
    : 0;
  if (runtime.configRevision !== revision) {
    runtime.configRevision = revision;
    runtime.nextDecisionAtMs =
      runtime.kind === 'none' ? null : state.nowMs;
  }
  return runtime;
}

function clampInteger(value, minimum, maximum) {
  const number = Math.round(Number(value) || 0);
  return Math.min(maximum, Math.max(minimum, number));
}

function playerAvailableCashCents(state) {
  const account = state.accounts.player;
  return Math.max(
    0,
    account.cashCents -
      account.reservedCashCents -
      derivativeReservedPlayerCashCents(state),
  );
}

function playerFreeHoldings(state, symbol) {
  const account = state.accounts.player;
  return Math.max(
    0,
    (account.holdings[symbol] ?? 0) -
      (account.reservedHoldings[symbol] ?? 0),
  );
}

function hotSymbolFactors(state, symbol) {
  const security = state.world.market.securities[symbol];
  const band = securityPriceBand(security);
  const lastPriceTicks = cents(security.lastPrice);
  const valuation = security.valuation;
  const midpointTicks = Number.isSafeInteger(valuation?.midpointTicks)
    ? valuation.midpointTicks
    : lastPriceTicks;
  const momentum = clampInteger(
    (lastPriceTicks - band.previousCloseTicks) * 10_000 /
      Math.max(1, band.previousCloseTicks),
    -10_000,
    10_000,
  );
  const valuationSignal = clampInteger(
    (midpointTicks - lastPriceTicks) * 10_000 /
      Math.max(1, lastPriceTicks),
    -10_000,
    10_000,
  );
  const expectedGrowthBps = Number.isSafeInteger(
    valuation?.metrics?.expectedGrowthBps,
  )
    ? valuation.metrics.expectedGrowthBps
    : 0;
  const confidenceBps = Number.isSafeInteger(valuation?.confidenceBps)
    ? valuation.confidenceBps
    : 5_000;
  const quality = clampInteger(
    expectedGrowthBps * 0.65 + (confidenceBps - 5_000) * 0.35,
    -10_000,
    10_000,
  );
  const depth = aggregateBook(state.books[symbol], 5);
  const bidQuantity = depth.bids.reduce(
    (sum, level) => sum + level.quantity,
    0,
  );
  const askQuantity = depth.asks.reduce(
    (sum, level) => sum + level.quantity,
    0,
  );
  const totalDepth = bidQuantity + askQuantity;
  const orderImbalance = totalDepth > 0
    ? clampInteger(
        (bidQuantity - askQuantity) * 10_000 / totalDepth,
        -10_000,
        10_000,
      )
    : 0;
  return {
    symbol,
    band,
    lastPriceTicks,
    depth,
    factors: {
      valuation: valuationSignal,
      quality,
      momentum,
      meanReversion: -momentum,
      orderImbalance,
    },
  };
}

function quantDefinitionScore(definition, factors) {
  const weights = definition?.factors ?? {};
  const grossWeight = Object.values(weights).reduce(
    (sum, weight) => sum + Math.abs(Number(weight) || 0),
    0,
  );
  if (grossWeight === 0) return 0;
  return clampInteger(
    Object.entries(weights).reduce(
      (sum, [factor, weight]) =>
        sum + (factors[factor] ?? 0) * (Number(weight) || 0),
      0,
    ) / grossWeight,
    -10_000,
    10_000,
  );
}

function quantSignalForSymbol(lab, hotState) {
  const attribution = [];
  let weightedScore = 0;
  let weightedLevel = 0;
  let maximumOrderBps = 0;
  let maximumParticipationBps = 0;
  for (const strategyId of lab.selectedStrategyIds) {
    const definition = quantStrategyDefinition(lab, strategyId);
    if (!definition) continue;
    const weight = lab.strategyWeightsBps[strategyId] ?? 0;
    const builtInState = lab.strategies?.[strategyId];
    const level = clampInteger(
      builtInState?.level ?? definition.level ?? 1,
      1,
      5,
    );
    const scoreBps = quantDefinitionScore(
      definition,
      hotState.factors,
    );
    weightedScore += scoreBps * weight;
    weightedLevel += level * weight;
    maximumOrderBps = Math.max(
      maximumOrderBps,
      definition.execution?.maxOrderBps ?? 0,
    );
    maximumParticipationBps = Math.max(
      maximumParticipationBps,
      definition.execution?.maxParticipationBps ?? 0,
    );
    attribution.push({ strategyId, weightBps: weight, scoreBps, level });
  }
  return {
    scoreBps: clampInteger(weightedScore / 10_000, -10_000, 10_000),
    averageLevel: Math.max(1, weightedLevel / 10_000),
    maximumOrderBps,
    maximumParticipationBps,
    attribution,
  };
}

function quantOrderQuantity(
  state,
  hotState,
  side,
  signal,
  riskMode,
) {
  const opposite = side === 'buy'
    ? hotState.depth.asks[0]
    : hotState.depth.bids[0];
  const riskOrderBps = {
    conservative: 20,
    balanced: 50,
    aggressive: 100,
  }[riskMode] ?? 50;
  const levelOrderBps = Math.round(
    riskOrderBps * (1 + (signal.averageLevel - 1) * 0.18),
  );
  const orderBps = clampInteger(
    signal.maximumOrderBps > 0
      ? Math.min(levelOrderBps, signal.maximumOrderBps)
      : levelOrderBps,
    1,
    500,
  );
  const participationBps = clampInteger(
    signal.maximumParticipationBps || 1_000,
    25,
    2_500,
  );
  let capacity;
  if (side === 'buy') {
    const cashBudget = Math.floor(
      playerAvailableCashCents(state) * orderBps / 10_000,
    );
    capacity = Math.floor(
      cashBudget / Math.max(1, opposite?.priceTicks ?? hotState.lastPriceTicks),
    );
  } else {
    capacity = Math.floor(
      playerFreeHoldings(state, hotState.symbol) * orderBps / 10_000,
    );
  }
  if (capacity < 1) return 0;
  if (!opposite) return Math.min(capacity, 1_000);
  return Math.max(
    1,
    Math.min(
      capacity,
      Math.max(1, Math.floor(opposite.quantity * participationBps / 10_000)),
    ),
  );
}

function evaluateQuantAutomationDecision(state) {
  const lab = state.world.player.roleState?.strategyLab;
  if (!lab?.automationEnabled || !Array.isArray(lab.selectedStrategyIds)) {
    return null;
  }
  const candidates = Object.keys(state.books)
    .sort()
    .map((symbol) => {
      const hotState = hotSymbolFactors(state, symbol);
      const signal = quantSignalForSymbol(lab, hotState);
      const side = signal.scoreBps < 0 ? 'sell' : 'buy';
      return {
        hotState,
        signal,
        side,
        quantity: quantOrderQuantity(
          state,
          hotState,
          side,
          signal,
          lab.riskMode,
        ),
      };
    })
    .filter((candidate) => candidate.quantity > 0)
    .sort(
      (left, right) =>
        Math.abs(right.signal.scoreBps) -
          Math.abs(left.signal.scoreBps) ||
        left.hotState.symbol.localeCompare(right.hotState.symbol),
    );
  let selected = candidates[0] ?? null;
  if (!selected && playerAvailableCashCents(state) > 0) {
    const symbol = Object.keys(state.books).sort()[0];
    const hotState = hotSymbolFactors(state, symbol);
    const signal = quantSignalForSymbol(lab, hotState);
    selected = {
      hotState,
      signal: { ...signal, scoreBps: 1 },
      side: 'buy',
      quantity: 1,
    };
  }
  if (!selected) return null;
  const { hotState, signal, side, quantity } = selected;
  const opposite = side === 'buy'
    ? hotState.depth.asks[0]
    : hotState.depth.bids[0];
  const priceTicks = clampInteger(
    opposite?.priceTicks ?? hotState.lastPriceTicks,
    hotState.band.limitDownTicks,
    hotState.band.limitUpTicks,
  );
  return {
    kind: 'quant',
    symbol: hotState.symbol,
    side,
    scoreBps: signal.scoreBps,
    strategyIds: signal.attribution.map((entry) => entry.strategyId),
    attribution: signal.attribution,
    command: {
      type: 'submit_order',
      actorId: 'player',
      brokerId: 'broker_lzy',
      symbol: hotState.symbol,
      side,
      orderType: 'limit',
      priceTicks,
      quantity,
      tif: 'IOC',
      source: 'player_role_automation',
      automationKind: 'quant',
      automationStrategyIds: signal.attribution.map(
        (entry) => entry.strategyId,
      ),
    },
  };
}

function marketStressSnapshot(state) {
  const rows = Object.keys(state.books).sort().map((symbol) => {
    const hotState = hotSymbolFactors(state, symbol);
    const returnBps = clampInteger(
      (hotState.lastPriceTicks - hotState.band.previousCloseTicks) * 10_000 /
        Math.max(1, hotState.band.previousCloseTicks),
      -10_000,
      10_000,
    );
    const bid = hotState.depth.bids[0];
    const ask = hotState.depth.asks[0];
    const spreadBps = bid && ask
      ? clampInteger(
          (ask.priceTicks - bid.priceTicks) * 10_000 /
            Math.max(1, hotState.lastPriceTicks),
          0,
          10_000,
        )
      : 0;
    return { hotState, returnBps, spreadBps };
  });
  const total = Math.max(1, rows.length);
  const decliners = rows.filter((row) => row.returnBps < 0).length;
  return {
    rows,
    weightedReturnBps: Math.round(
      rows.reduce((sum, row) => sum + row.returnBps, 0) / total,
    ),
    breadthBps: -Math.round(decliners * 10_000 / total),
    liquidityStressBps: Math.round(
      rows.reduce((sum, row) => sum + row.spreadBps, 0) / total,
    ),
  };
}

function evaluateStabilizationAutomationDecision(state) {
  const desk = state.world.player.roleState?.stabilityDesk;
  if (!desk?.automationEnabled) return null;
  const stress = marketStressSnapshot(state);
  const broadStress =
    stress.weightedReturnBps <= desk.weightedReturnTriggerBps ||
    (
      stress.breadthBps <= desk.breadthTriggerBps &&
      stress.weightedReturnBps < 0
    ) ||
    (
      stress.liquidityStressBps >= desk.liquidityStressTriggerBps &&
      stress.weightedReturnBps < 0
    );
  let side = 'buy';
  let selected = null;
  if (broadStress) {
    selected = [...stress.rows].sort(
      (left, right) =>
        left.returnBps - right.returnBps ||
        right.spreadBps - left.spreadBps ||
        left.hotState.symbol.localeCompare(right.hotState.symbol),
    )[0] ?? null;
  } else if (stress.weightedReturnBps >= 200) {
    side = 'sell';
    selected = stress.rows.find(
      (row) =>
        (desk.interventionInventoryBySymbol?.[
          row.hotState.symbol
        ] ?? 0) > 0,
    ) ?? null;
  }
  if (!selected) return null;
  const hotState = selected.hotState;
  const opposite = side === 'buy'
    ? hotState.depth.asks[0]
    : hotState.depth.bids[0];
  const priceTicks = clampInteger(
    opposite?.priceTicks ?? hotState.lastPriceTicks,
    hotState.band.limitDownTicks,
    hotState.band.limitUpTicks,
  );
  let quantity;
  if (side === 'buy') {
    const budgetBps = clampInteger(
      Math.round(desk.intensityBps * 50 / 10_000),
      5,
      50,
    );
    quantity = Math.floor(
      playerAvailableCashCents(state) * budgetBps /
        10_000 /
        Math.max(1, priceTicks),
    );
  } else {
    quantity = Math.min(
      playerFreeHoldings(state, hotState.symbol),
      desk.interventionInventoryBySymbol?.[hotState.symbol] ?? 0,
    );
  }
  if (quantity < 1) return null;
  if (opposite) {
    quantity = Math.max(
      1,
      Math.min(
        quantity,
        Math.max(
          1,
          Math.floor(opposite.quantity * desk.intensityBps / 10_000),
        ),
      ),
    );
  } else {
    quantity = Math.min(quantity, 1_000);
  }
  return {
    kind: 'stabilization',
    symbol: hotState.symbol,
    side,
    scoreBps: selected.returnBps,
    strategyIds: [`stability_${desk.targetMode}`],
    marketStress: {
      weightedReturnBps: stress.weightedReturnBps,
      breadthBps: stress.breadthBps,
      liquidityStressBps: stress.liquidityStressBps,
    },
    command: {
      type: 'submit_order',
      actorId: 'player',
      brokerId: 'broker_lzy',
      symbol: hotState.symbol,
      side,
      orderType: 'limit',
      priceTicks,
      quantity,
      tif: 'IOC',
      source: 'player_role_automation',
      automationKind: 'stabilization',
      automationStrategyIds: [`stability_${desk.targetMode}`],
    },
  };
}

export function evaluatePlayerRoleAutomationDecision(state) {
  if (!state?.world?.player || !state?.accounts?.player) {
    throw new Error('A realtime market simulation is required.');
  }
  const kind = playerRoleAutomationKind(state.world);
  if (kind === 'quant') return evaluateQuantAutomationDecision(state);
  if (kind === 'stabilization') {
    return evaluateStabilizationAutomationDecision(state);
  }
  return null;
}

function playerAutomationCadenceMs(state) {
  const lab = state.world.player.roleState?.strategyLab;
  if (playerRoleAutomationKind(state.world) !== 'quant' || !lab) {
    return PLAYER_AUTOMATION_CADENCE_MS;
  }
  const cadences = lab.selectedStrategyIds
    .map((strategyId) => quantStrategyDefinition(lab, strategyId)?.cadenceMs)
    .filter((value) => Number.isSafeInteger(value));
  return Math.max(
    PLAYER_AUTOMATION_CADENCE_MS,
    Math.min(PLAYER_AUTOMATION_CADENCE_MS, ...cadences),
  );
}

function automationAttribution(command) {
  if (!authorizedPlayerAutomationCommands.has(command)) return {};
  return {
    automationKind: command.automationKind,
    automationDecisionId: command.automationDecisionId,
    automationStrategyIds: [...(command.automationStrategyIds ?? [])],
  };
}

function appendPlayerAutomationDecision(runtime, decision) {
  runtime.recentDecisions.push(decision);
  if (runtime.recentDecisions.length > MAX_PLAYER_AUTOMATION_DECISIONS) {
    runtime.recentDecisions.splice(
      0,
      runtime.recentDecisions.length - MAX_PLAYER_AUTOMATION_DECISIONS,
    );
  }
}

function runPlayerRoleAutomation(
  state,
  { deferMarketMirror = false } = {},
) {
  const runtime = synchronizePlayerRoleAutomationConfiguration(state);
  if (
    runtime.kind === 'none' ||
    runtime.nextDecisionAtMs === null ||
    state.nowMs < runtime.nextDecisionAtMs
  ) {
    return null;
  }
  const configuration = playerRoleAutomationConfiguration(state.world);
  runtime.nextDecisionAtMs = state.nowMs + playerAutomationCadenceMs(state);
  if (configuration?.automationEnabled !== true) return null;
  runtime.totalDecisions += 1;
  runtime.lastDecisionAtMs = state.nowMs;
  const decisionId = `player_auto_${runtime.kind}_${String(
    runtime.totalDecisions,
  ).padStart(8, '0')}`;
  const decision = evaluatePlayerRoleAutomationDecision(state);
  if (!decision) {
    appendPlayerAutomationDecision(runtime, {
      id: decisionId,
      virtualMs: state.nowMs,
      kind: runtime.kind,
      status: 'no_action',
      symbol: null,
      side: null,
      scoreBps: null,
      strategyIds: [],
      orderId: null,
      filledQuantity: 0,
      reason: 'NO_ELIGIBLE_SIGNAL',
    });
    return null;
  }
  decision.command.automationDecisionId = decisionId;
  authorizedPlayerAutomationCommands.add(decision.command);
  runtime.totalOrderAttempts += 1;
  const receipt = handleSubmitOrder(state, decision.command, {
    deferBatchMaintenance: deferMarketMirror,
  });
  const filledQuantity = Number.isSafeInteger(receipt.filledQuantity)
    ? receipt.filledQuantity
    : 0;
  runtime.totalFilledQuantity += filledQuantity;
  if (runtime.kind === 'stabilization' && filledQuantity > 0) {
    const desk = state.world.player.roleState.stabilityDesk;
    const previous = desk.interventionInventoryBySymbol[decision.symbol] ?? 0;
    desk.interventionInventoryBySymbol[decision.symbol] = Math.max(
      0,
      previous + (decision.side === 'buy' ? filledQuantity : -filledQuantity),
    );
  }
  appendPlayerAutomationDecision(runtime, {
    id: decisionId,
    virtualMs: state.nowMs,
    kind: runtime.kind,
    status: receipt.status,
    symbol: decision.symbol,
    side: decision.side,
    scoreBps: decision.scoreBps,
    strategyIds: [...decision.strategyIds],
    orderId: receipt.orderId ?? null,
    filledQuantity,
    reason: receipt.reason ?? null,
  });
  markAccountRisk(state);
  if (deferMarketMirror) {
    markDeferredWorldOrderMirror(state, decision.symbol);
  }
  return receipt;
}

function playerRoleAutomationInvariantErrors(state) {
  const runtime = state.playerRoleAutomation;
  const expectedKind = playerRoleAutomationKind(state.world);
  const configuration = playerRoleAutomationConfiguration(state.world);
  const expectedRevision = Number.isSafeInteger(configuration?.revision)
    ? configuration.revision
    : 0;
  if (
    !runtime ||
    runtime.schemaVersion !== PLAYER_ROLE_AUTOMATION_SCHEMA ||
    runtime.kind !== expectedKind ||
    runtime.configRevision !== expectedRevision ||
    !Number.isSafeInteger(runtime.totalDecisions) ||
    runtime.totalDecisions < 0 ||
    !Number.isSafeInteger(runtime.totalOrderAttempts) ||
    runtime.totalOrderAttempts < 0 ||
    runtime.totalOrderAttempts > runtime.totalDecisions ||
    !Number.isSafeInteger(runtime.totalFilledQuantity) ||
    runtime.totalFilledQuantity < 0 ||
    !Array.isArray(runtime.recentDecisions) ||
    runtime.recentDecisions.length > MAX_PLAYER_AUTOMATION_DECISIONS ||
    (expectedKind === 'none'
      ? runtime.nextDecisionAtMs !== null
      : !Number.isSafeInteger(runtime.nextDecisionAtMs) ||
        runtime.nextDecisionAtMs < 0) ||
    (runtime.lastDecisionAtMs !== null &&
      (!Number.isSafeInteger(runtime.lastDecisionAtMs) ||
        runtime.lastDecisionAtMs < 0 ||
        runtime.lastDecisionAtMs > state.nowMs))
  ) {
    return ['INVALID_PLAYER_ROLE_AUTOMATION'];
  }
  const errors = [];
  let priorVirtualMs = -1;
  for (const decision of runtime.recentDecisions) {
    if (
      !decision ||
      typeof decision.id !== 'string' ||
      !Number.isSafeInteger(decision.virtualMs) ||
      decision.virtualMs < priorVirtualMs ||
      decision.virtualMs > state.nowMs ||
      decision.kind !== expectedKind ||
      !Array.isArray(decision.strategyIds) ||
      decision.strategyIds.length > 8 ||
      !Number.isSafeInteger(decision.filledQuantity) ||
      decision.filledQuantity < 0
    ) {
      errors.push(`INVALID_PLAYER_AUTOMATION_DECISION:${decision?.id ?? 'unknown'}`);
    }
    priorVirtualMs = decision?.virtualMs ?? priorVirtualMs;
  }
  const interventionInventory =
    state.world.player.roleState?.stabilityDesk
      ?.interventionInventoryBySymbol;
  if (
    expectedKind === 'stabilization' &&
    (!interventionInventory ||
      Array.isArray(interventionInventory) ||
      Object.entries(interventionInventory).some(
        ([symbol, quantity]) =>
          !state.books[symbol] ||
          !Number.isSafeInteger(quantity) ||
          quantity < 0 ||
          quantity > (state.accounts.player.holdings[symbol] ?? 0),
      ))
  ) {
    errors.push('INVALID_STABILIZATION_INTERVENTION_INVENTORY');
  }
  return errors;
}

function hydrateSecurityListingFields(world) {
  for (const [symbol, security] of Object.entries(
    world.market.securities,
  )) {
    const band = securityPriceBand({ ...security, symbol });
    security.symbol = symbol;
    security.board = band.board;
    security.dailyLimitBps = band.dailyLimitBps;
    security.previousCloseTicks = band.previousCloseTicks;
  }
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function activeOrder(order) {
  return Boolean(
    order &&
    order.remainingQty > 0 &&
    (order.status === 'accepted' || order.status === 'partially_filled'),
  );
}

function calculateFeeCents(grossCents) {
  if (grossCents <= 0) return 0;
  return Math.max(5, Math.ceil(grossCents * 5 / 10_000));
}

function calculateBuyReservation(orderOrPriceTicks, quantity = null) {
  if (typeof orderOrPriceTicks === 'number') {
    if (quantity <= 0) return 0;
    const grossCents = orderOrPriceTicks * quantity;
    return grossCents + calculateFeeCents(grossCents);
  }
  const order = orderOrPriceTicks;
  if (!activeOrder(order)) return 0;
  const remainingGrossCents = order.priceTicks * order.remainingQty;
  const filledGrossCents = order.filledGrossCents ?? 0;
  const chargedFeeCents = order.chargedFeeCents ?? 0;
  const maximumFeeCents = calculateFeeCents(
    filledGrossCents + remainingGrossCents,
  );
  return (
    remainingGrossCents +
    Math.max(0, maximumFeeCents - chargedFeeCents)
  );
}

function hashText(input) {
  let hash = 2166136261;
  for (const character of String(input)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function configureRealtimeAuditColdStore(state, store) {
  if (store === undefined || store === null) return;
  if (
    typeof store !== 'object' ||
    typeof store.put !== 'function' ||
    (
      store.has !== undefined &&
      typeof store.has !== 'function'
    ) ||
    (
      store.get !== undefined &&
      typeof store.get !== 'function'
    )
  ) {
    throw new TypeError(
      'auditColdStore must provide put and optional has/get functions.',
    );
  }
  realtimeAuditColdStores.set(state, store);
}

function validRealtimeAuditColdReference(reference, kind) {
  return Boolean(
    reference?.schema === REALTIME_AUDIT_COLD_RECORD_SCHEMA &&
      reference.kind === kind &&
      typeof reference.key === 'string' &&
      reference.key.length > 0 &&
      typeof reference.digest === 'string' &&
      /^[0-9a-f]{8}$/.test(reference.digest) &&
      Number.isSafeInteger(reference.encodedCharacters) &&
      reference.encodedCharacters > 0,
  );
}

function realtimeAuditColdRecordValue(
  state,
  reference,
  kind,
) {
  if (!validRealtimeAuditColdReference(reference, kind)) {
    throw new Error('INVALID_REALTIME_AUDIT_COLD_REFERENCE');
  }
  const store = realtimeAuditColdStores.get(state);
  if (
    !store ||
    (typeof store.has === 'function' && !store.has(reference)) ||
    typeof store.get !== 'function'
  ) {
    throw new Error('MISSING_REALTIME_AUDIT_COLD_RECORD');
  }
  const value = store.get(reference);
  if (
    typeof value !== 'string' ||
    value.length !== reference.encodedCharacters ||
    hashText(value) !== reference.digest
  ) {
    throw new Error('INVALID_REALTIME_AUDIT_COLD_RECORD');
  }
  return value;
}

function realtimeAuditColdReferenceKnown(
  state,
  reference,
  kind,
) {
  if (!validRealtimeAuditColdReference(reference, kind)) {
    return false;
  }
  const store = realtimeAuditColdStores.get(state);
  try {
    return Boolean(store?.has?.(reference));
  } catch {
    return false;
  }
}

function realtimeAuditColdStoreCanRead(state) {
  return typeof realtimeAuditColdStores.get(state)?.get === 'function';
}

function externalizeRealtimeAuditPayload(state, block) {
  const value = block?.compressedLosslessPayloads;
  const store = realtimeAuditColdStores.get(state);
  if (typeof value !== 'string' || !store) return false;
  const digest = hashText(value);
  const key = [
    state.world.world.id,
    'audit-payload',
    block.id,
    digest,
  ].join(':');
  const record = {
    schema: REALTIME_AUDIT_COLD_RECORD_SCHEMA,
    kind: 'payload',
    key,
    digest,
    encodedCharacters: value.length,
    value,
  };
  let accepted;
  try {
    accepted = store.put(record);
  } catch {
    return false;
  }
  if (accepted === false) return false;
  block.compressedLosslessPayloads = {
    schema: record.schema,
    kind: record.kind,
    key: record.key,
    digest: record.digest,
    encodedCharacters: record.encodedCharacters,
  };
  return true;
}

function realtimeAuditBlockSummary(block, coldBlock = null) {
  return {
    id: block.id,
    bundleCount: block.bundleCount,
    chainCount: block.chainCount,
    receiptCount: block.receiptCount,
    fromTradeId: block.fromTradeId,
    toTradeId: block.toTradeId,
    fromTradeSequence: block.fromTradeSequence,
    toTradeSequence: block.toTradeSequence,
    fromCommitSeq: block.fromCommitSeq,
    toCommitSeq: block.toCommitSeq,
    digest: block.digest,
    losslessPayloads: [],
    losslessBundleCount: block.losslessBundleCount,
    losslessChainCount: block.losslessChainCount,
    losslessReceiptCount: block.losslessReceiptCount,
    losslessPayloadDigest: block.losslessPayloadDigest,
    ...(coldBlock ? { coldBlock } : {}),
  };
}

function isRealtimeAuditColdBlockReference(block) {
  return Boolean(
    block &&
      validRealtimeAuditColdReference(
        block.coldBlock,
        'block',
      ),
  );
}

function sameRealtimeAuditBlockSummary(reference, block) {
  const expected = realtimeAuditBlockSummary(block);
  return Object.entries(expected).every(([key, value]) =>
    Array.isArray(value)
      ? Array.isArray(reference[key]) &&
        reference[key].length === 0
      : reference[key] === value,
  );
}

function resolveRealtimeAuditColdBlock(state, reference) {
  if (!isRealtimeAuditColdBlockReference(reference)) {
    return reference;
  }
  const value = realtimeAuditColdRecordValue(
    state,
    reference.coldBlock,
    'block',
  );
  let block;
  try {
    block = JSON.parse(value);
  } catch {
    throw new Error('INVALID_REALTIME_AUDIT_COLD_BLOCK');
  }
  if (
    !block ||
    typeof block !== 'object' ||
    Array.isArray(block) ||
    !sameRealtimeAuditBlockSummary(reference, block)
  ) {
    throw new Error('INVALID_REALTIME_AUDIT_COLD_BLOCK');
  }
  return block;
}

function externalizeRealtimeAuditBlock(state, block) {
  const store = realtimeAuditColdStores.get(state);
  if (!store) return block;
  const value = JSON.stringify(block);
  const digest = hashText(value);
  const key = [
    state.world.world.id,
    'audit-block',
    block.id,
    digest,
  ].join(':');
  const record = {
    schema: REALTIME_AUDIT_COLD_RECORD_SCHEMA,
    kind: 'block',
    key,
    digest,
    encodedCharacters: value.length,
    value,
  };
  let accepted;
  try {
    accepted = store.put(record);
  } catch {
    return block;
  }
  if (accepted === false) return block;
  return realtimeAuditBlockSummary(block, {
    schema: record.schema,
    kind: record.kind,
    key: record.key,
    digest: record.digest,
    encodedCharacters: record.encodedCharacters,
  });
}

function compareEvents(left, right) {
  return (
    left.scheduledMs - right.scheduledMs ||
    left.phasePriority - right.phasePriority ||
    left.sequence - right.sequence
  );
}

function insertEventQueue(state, event) {
  const queue = state.eventQueue;
  queue.push(event);
  let index = queue.length - 1;
  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    if (compareEvents(queue[parentIndex], queue[index]) <= 0) {
      break;
    }
    [queue[parentIndex], queue[index]] = [
      queue[index],
      queue[parentIndex],
    ];
    index = parentIndex;
  }
}

function popEventQueue(state) {
  const queue = state.eventQueue;
  if (queue.length === 0) return null;
  const frontier = queue[0];
  const tail = queue.pop();
  if (queue.length === 0) return frontier;
  queue[0] = tail;
  let index = 0;
  while (true) {
    const leftIndex = index * 2 + 1;
    const rightIndex = leftIndex + 1;
    let smallestIndex = index;
    if (
      leftIndex < queue.length &&
      compareEvents(
        queue[leftIndex],
        queue[smallestIndex],
      ) < 0
    ) {
      smallestIndex = leftIndex;
    }
    if (
      rightIndex < queue.length &&
      compareEvents(
        queue[rightIndex],
        queue[smallestIndex],
      ) < 0
    ) {
      smallestIndex = rightIndex;
    }
    if (smallestIndex === index) break;
    [queue[index], queue[smallestIndex]] = [
      queue[smallestIndex],
      queue[index],
    ];
    index = smallestIndex;
  }
  return frontier;
}

function heapifyEventQueue(state) {
  const events = state.eventQueue;
  state.eventQueue = [];
  for (const event of events) {
    insertEventQueue(state, event);
  }
}

function nextLocalId(state, prefix, sequence = null) {
  const value = sequence ?? state.nextRecordSequence++;
  return `${prefix}_${String(value).padStart(8, '0')}`;
}

function createScheduledEvent(
  state,
  {
    type,
    scheduledMs,
    phasePriority,
    actorId = 'market_system',
    payload = {},
    ownedPayload = false,
  },
) {
  if (!Number.isSafeInteger(scheduledMs) || scheduledMs < state.nowMs) {
    throw new RangeError('scheduledMs must be an integer at or after nowMs');
  }
  const sequence = state.nextEventSequence++;
  const event = {
    id: nextLocalId(state, 'market_event', sequence),
    scheduledMs,
    phasePriority,
    sequence,
    type,
    actorId,
    payload: ownedPayload ? payload : cloneJson(payload),
    rngKey: `${state.world.world.seed}:${scheduledMs}:${phasePriority}:${sequence}`,
  };
  return event;
}

function scheduleEvent(state, descriptor) {
  const event = createScheduledEvent(
    state,
    descriptor,
  );
  insertEventQueue(state, event);
  return event;
}

function blankReservedHoldings(symbols) {
  return Object.fromEntries(symbols.map((symbol) => [symbol, 0]));
}

function createPositionLedger(holdings, securities) {
  return Object.fromEntries(
    Object.entries(securities).map(([symbol, security]) => {
      const quantity = holdings[symbol] ?? 0;
      return [
        symbol,
        {
          costCents: quantity * cents(security.lastPrice),
          realizedPnlCents: 0,
        },
      ];
    }),
  );
}

function makeAccount({
  id,
  kind,
  brokerId,
  cashCents,
  holdings,
  securities,
}) {
  const symbols = Object.keys(securities);
  return {
    id,
    kind,
    brokerId,
    cashCents,
    reservedCashCents: 0,
    holdings: cloneJson(holdings),
    reservedHoldings: blankReservedHoldings(symbols),
    positionLedger: createPositionLedger(holdings, securities),
    realizedPnlCents: 0,
    pnlDayAnchor: {
      dayId: 0,
      totalPnlCents: 0,
    },
    peakEquityCents: cashCents,
    drawdownBps: 0,
    fundingStressBps: 0,
    commitSeq: 0,
  };
}

function derivativeCustodyAccountId(actorId) {
  return `derivative_lending_custody_${actorId}`;
}

function derivativeCustodySpecs(world) {
  return Object.values(
    world.derivatives?.actors ?? {},
  )
    .map((actor) => {
      const borrowerId = actor.accountId;
      const account =
        world.derivatives?.accounts?.[borrowerId];
      return {
        borrowerId,
        accountId:
          derivativeCustodyAccountId(borrowerId),
        holdings: cloneJson(
          account?.borrowedSecurityCustody ?? {},
        ),
      };
    })
    .sort((left, right) =>
      left.accountId.localeCompare(right.accountId),
    );
}

function createAccounts(world) {
  const securities = world.market.securities;
  const symbols = Object.keys(securities);
  const accounts = {
    player: makeAccount({
      id: 'player',
      kind: 'broker_client',
      brokerId: 'broker_lzy',
      cashCents: cents(world.player.cash),
      holdings: world.player.holdings,
      securities,
    }),
  };

  for (const investor of Object.values(world.entities.investors ?? {})) {
    accounts[investor.id] = makeAccount({
      id: investor.id,
      kind: 'broker_client',
      brokerId: 'broker_lzy',
      cashCents: cents(investor.cash),
      holdings: investor.holdings,
      securities,
    });
  }

  const makerCashCents = cents(world.market.maker.cash);
  const makerHoldings = world.market.maker.holdings;
  const derivativeCustodies =
    derivativeCustodySpecs(world);
  const institutionalCustodyHoldings =
    Object.fromEntries(
      symbols.map((symbol) => [
        symbol,
        derivativeCustodies.reduce(
          (sum, custody) =>
            sum + (custody.holdings[symbol] ?? 0),
          0,
        ),
      ]),
    );
  const lendingPoolHoldings = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      Math.min(
        makerHoldings[symbol] ?? 0,
        world.derivatives?.clearing
          ?.lendableSecurities?.[symbol] ?? 0,
      ),
    ]),
  );
  const tradableMakerHoldings = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      (makerHoldings[symbol] ?? 0) -
        lendingPoolHoldings[symbol] -
        institutionalCustodyHoldings[symbol],
    ]),
  );
  const firstMakerHoldings = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      Math.floor(
        tradableMakerHoldings[symbol] / 2,
      ),
    ]),
  );
  const secondMakerHoldings = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      tradableMakerHoldings[symbol] -
        firstMakerHoldings[symbol],
    ]),
  );
  const firstMakerCash = Math.floor(makerCashCents / 2);
  accounts.maker_chengming = makeAccount({
    id: 'maker_chengming',
    kind: 'proprietary_maker',
    brokerId: 'broker_chengming',
    cashCents: firstMakerCash,
    holdings: firstMakerHoldings,
    securities,
  });
  accounts.maker_lingnan = makeAccount({
    id: 'maker_lingnan',
    kind: 'proprietary_maker',
    brokerId: 'broker_lingnan',
    cashCents: makerCashCents - firstMakerCash,
    holdings: secondMakerHoldings,
    securities,
  });
  accounts.securities_lending_pool = makeAccount({
    id: 'securities_lending_pool',
    kind: 'securities_lending_pool',
    brokerId: 'lzy_derivatives_clearing',
    cashCents: 0,
    holdings: lendingPoolHoldings,
    securities,
  });
  for (const custody of derivativeCustodies) {
    accounts[custody.accountId] = makeAccount({
      id: custody.accountId,
      kind: 'derivative_lending_custody',
      brokerId: 'lzy_derivatives_clearing',
      cashCents: 0,
      holdings: Object.fromEntries(
        symbols.map((symbol) => [
          symbol,
          custody.holdings[symbol] ?? 0,
        ]),
      ),
      securities,
    });
  }
  return accounts;
}

function ensureStabilizationFundAccount(state) {
  const accountId = 'npc_stabilization_fund';
  if (state.accounts[accountId]) return false;
  const investor =
    state.world.entities?.investors?.[accountId];
  if (!investor) return false;
  const securities = state.world.market.securities;
  const sourceCustody =
    state.accounts.holder_public_custody;
  if (!sourceCustody) {
    throw new Error(
      'Missing public custody for stabilization-account migration.',
    );
  }
  const targetHoldings = Object.fromEntries(
    Object.keys(securities).map((symbol) => [
      symbol,
      investor.holdings?.[symbol] ?? 0,
    ]),
  );
  const sourceHoldings = cloneJson(
    sourceCustody.holdings,
  );
  for (const [symbol, quantity] of Object.entries(
    targetHoldings,
  )) {
    const free = Math.max(
      0,
      (sourceHoldings[symbol] ?? 0) -
        (sourceCustody.reservedHoldings?.[symbol] ?? 0),
    );
    if (free < quantity) {
      throw new Error(
        `Insufficient public custody for stabilization migration: ${symbol}`,
      );
    }
    sourceHoldings[symbol] -= quantity;
  }
  const targetCashCents = cents(investor.cash);
  let remainingCashCents = targetCashCents;
  const makers = Object.values(state.accounts)
    .filter(
      (account) =>
        account.kind === 'proprietary_maker',
    )
    .sort((left, right) =>
      left.id.localeCompare(right.id),
    );
  for (const maker of makers) {
    if (remainingCashCents <= 0) break;
    const free = Math.max(
      0,
      maker.cashCents - maker.reservedCashCents,
    );
    const transferred = Math.min(
      free,
      remainingCashCents,
    );
    maker.cashCents -= transferred;
    remainingCashCents -= transferred;
  }
  if (remainingCashCents > 0) {
    throw new Error(
      'Insufficient maker cash for stabilization migration.',
    );
  }
  synchronizeTransferredHoldings(
    sourceCustody,
    sourceHoldings,
    securities,
  );
  state.accounts[accountId] = makeAccount({
    id: accountId,
    kind: 'broker_client',
    brokerId: 'broker_lzy',
    cashCents: targetCashCents,
    holdings: targetHoldings,
    securities,
  });
  return true;
}

function ensureQuantInstitutionAccount(state) {
  const accountId = 'npc_quant_institution';
  if (state.accounts[accountId]) return false;
  const investor =
    state.world.entities?.investors?.[accountId];
  if (!investor) return false;
  const securities = state.world.market.securities;
  const sourceCustody =
    state.accounts.holder_public_custody;
  if (!sourceCustody) {
    throw new Error(
      'Missing public custody for quant-institution migration.',
    );
  }
  const targetHoldings = Object.fromEntries(
    Object.keys(securities).map((symbol) => [
      symbol,
      investor.holdings?.[symbol] ?? 0,
    ]),
  );
  const sourceHoldings = cloneJson(
    sourceCustody.holdings,
  );
  for (const [symbol, quantity] of Object.entries(
    targetHoldings,
  )) {
    const free = Math.max(
      0,
      (sourceHoldings[symbol] ?? 0) -
        (sourceCustody.reservedHoldings?.[symbol] ?? 0),
    );
    if (free < quantity) {
      throw new Error(
        `Insufficient public custody for quant migration: ${symbol}`,
      );
    }
    sourceHoldings[symbol] -= quantity;
  }
  const targetCashCents = cents(investor.cash);
  const canonicalMakerCashCents = cents(
    state.world.market.maker.cash,
  );
  const makers = Object.values(state.accounts)
    .filter(
      (account) =>
        account.kind === 'proprietary_maker',
    )
    .sort((left, right) =>
      left.id.localeCompare(right.id),
    );
  let makerExcessCents = Math.max(
    0,
    makers.reduce(
      (sum, maker) => sum + maker.cashCents,
      0,
    ) - canonicalMakerCashCents,
  );
  for (const maker of makers) {
    if (makerExcessCents <= 0) break;
    const transferred = Math.min(
      maker.cashCents - maker.reservedCashCents,
      makerExcessCents,
    );
    maker.cashCents -= transferred;
    makerExcessCents -= transferred;
  }
  if (makerExcessCents > 0) {
    throw new Error(
      'Unable to reconcile maker cash for quant migration.',
    );
  }
  synchronizeTransferredHoldings(
    sourceCustody,
    sourceHoldings,
    securities,
  );
  state.accounts[accountId] = makeAccount({
    id: accountId,
    kind: 'broker_client',
    brokerId: 'broker_lzy',
    cashCents: targetCashCents,
    holdings: targetHoldings,
    securities,
  });
  return true;
}

function ensureSecuritiesLendingCustodyAccount(state) {
  if (state.accounts.securities_lending_pool) {
    return {
      migrated: false,
      transfersByAccount: {},
    };
  }
  const securities = state.world.market.securities;
  const symbols = Object.keys(securities);
  const poolHoldings = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      state.world.derivatives?.clearing
        ?.lendableSecurities?.[symbol] ?? 0,
    ]),
  );
  const makers = Object.values(state.accounts)
    .filter(
      (account) =>
        account.kind === 'proprietary_maker',
    )
    .sort((left, right) =>
      left.id.localeCompare(right.id),
    );
  const transfersByAccount = {};
  for (const symbol of symbols) {
    let remaining = poolHoldings[symbol];
    for (const maker of makers) {
      if (remaining <= 0) break;
      const free = Math.max(
        0,
        (maker.holdings[symbol] ?? 0) -
          (maker.reservedHoldings[symbol] ?? 0),
      );
      const transferred = Math.min(
        free,
        remaining,
      );
      if (transferred <= 0) continue;
      synchronizeTransferredHoldings(
        maker,
        {
          ...maker.holdings,
          [symbol]:
            maker.holdings[symbol] - transferred,
        },
        securities,
      );
      transfersByAccount[maker.id] ??=
        Object.fromEntries(
          symbols.map((trackedSymbol) => [
            trackedSymbol,
            0,
          ]),
        );
      transfersByAccount[maker.id][symbol] +=
        transferred;
      remaining -= transferred;
    }
    if (remaining > 0) {
      throw new Error(
        `Insufficient free custody inventory for ${symbol}`,
      );
    }
  }
  state.accounts.securities_lending_pool =
    makeAccount({
      id: 'securities_lending_pool',
      kind: 'securities_lending_pool',
      brokerId: 'lzy_derivatives_clearing',
      cashCents: 0,
      holdings: poolHoldings,
      securities,
    });
  return {
    migrated: true,
    transfersByAccount,
  };
}

function ensureDerivativeLendingCustodyAccounts(
  state,
) {
  const templates = createAccounts(state.world);
  const custodyTemplates = Object.values(
    templates,
  ).filter(
    (account) =>
      account.kind ===
      'derivative_lending_custody',
  );
  const makers = Object.values(state.accounts)
    .filter(
      (account) =>
        account.kind === 'proprietary_maker',
    )
    .sort((left, right) =>
      left.id.localeCompare(right.id),
    );
  const securities = state.world.market.securities;
  let migrated = false;
  for (const template of custodyTemplates) {
    if (state.accounts[template.id]) continue;
    const targetHoldings = cloneJson(
      template.holdings,
    );
    const custody = makeAccount({
      id: template.id,
      kind: template.kind,
      brokerId: template.brokerId,
      cashCents: 0,
      holdings: Object.fromEntries(
        Object.keys(securities).map((symbol) => [
          symbol,
          0,
        ]),
      ),
      securities,
    });
    const receivedHoldings = cloneJson(
      custody.holdings,
    );
    for (const [
      symbol,
      targetQuantity,
    ] of Object.entries(targetHoldings)) {
      let remaining = targetQuantity;
      for (const maker of makers) {
        if (remaining <= 0) break;
        const free = Math.max(
          0,
          (maker.holdings[symbol] ?? 0) -
            (maker.reservedHoldings[symbol] ?? 0),
        );
        const transferred = Math.min(
          free,
          remaining,
        );
        if (transferred <= 0) continue;
        synchronizeTransferredHoldings(
          maker,
          {
            ...maker.holdings,
            [symbol]:
              maker.holdings[symbol] - transferred,
          },
          securities,
        );
        receivedHoldings[symbol] += transferred;
        remaining -= transferred;
      }
      if (remaining > 0) {
        throw new Error(
          `Insufficient institutional lending custody for ${template.id}:${symbol}`,
        );
      }
    }
    synchronizeTransferredHoldings(
      custody,
      receivedHoldings,
      securities,
    );
    state.accounts[custody.id] = custody;
    migrated = true;
  }
  return migrated;
}

function accountTotalPnlCents(state, account) {
  return Object.entries(account.holdings).reduce(
    (sum, [symbol, quantity]) => {
      const position = account.positionLedger[symbol];
      const lastPriceTicks = cents(
        state.world.market.securities[symbol].lastPrice,
      );
      return (
        sum +
        quantity * lastPriceTicks -
        position.costCents +
        position.realizedPnlCents
      );
    },
    0,
  );
}

function accountPortfolioProjection(state, account) {
  const positions = Object.fromEntries(
    Object.keys(state.world.market.securities).map((symbol) => {
      const quantity = account.holdings[symbol] ?? 0;
      const reservedQuantity =
        account.reservedHoldings[symbol] ?? 0;
      const ledger = account.positionLedger[symbol];
      const lastPriceTicks = cents(
        state.world.market.securities[symbol].lastPrice,
      );
      const marketValueCents = quantity * lastPriceTicks;
      const unrealizedPnlCents =
        marketValueCents - ledger.costCents;
      const totalPnlCents =
        unrealizedPnlCents + ledger.realizedPnlCents;
      const averageCostTicks =
        quantity > 0 ? ledger.costCents / quantity : null;
      const breakEvenCostTicks =
        quantity > 0
          ? (
              ledger.costCents -
              ledger.realizedPnlCents
            ) / quantity
          : null;
      const displayReturnBps =
        quantity > 0
          ? Math.round(
              totalPnlCents *
                10_000 /
                Math.max(
                  1,
                  Math.abs(
                    ledger.costCents -
                    ledger.realizedPnlCents,
                  ),
                ),
            )
          : 0;
      return [
        symbol,
        {
          symbol,
          quantity,
          reservedQuantity,
          availableQuantity: quantity - reservedQuantity,
          costCents: ledger.costCents,
          averageCostTicks,
          breakEvenCostTicks,
          displayCostTicks: breakEvenCostTicks,
          displayReturnBps,
          lastPriceTicks,
          marketValueCents,
          unrealizedPnlCents,
          realizedPnlCents: ledger.realizedPnlCents,
          totalPnlCents,
          returnBps:
            ledger.costCents > 0
              ? Math.round(
                  unrealizedPnlCents *
                    10_000 /
                    ledger.costCents,
                )
              : 0,
        },
      ];
    }),
  );
  const totals = Object.values(positions).reduce(
    (result, position) => ({
      marketValueCents:
        result.marketValueCents + position.marketValueCents,
      totalCostCents:
        result.totalCostCents + position.costCents,
      unrealizedPnlCents:
        result.unrealizedPnlCents +
        position.unrealizedPnlCents,
      realizedPnlCents:
        result.realizedPnlCents +
        position.realizedPnlCents,
      totalPnlCents:
        result.totalPnlCents + position.totalPnlCents,
    }),
    {
      marketValueCents: 0,
      totalCostCents: 0,
      unrealizedPnlCents: 0,
      realizedPnlCents: 0,
      totalPnlCents: 0,
    },
  );
  return {
    ...totals,
    dayPnlCents:
      totals.totalPnlCents -
      account.pnlDayAnchor.totalPnlCents,
    positions,
  };
}

function hydrateAccountPortfolioFields(state) {
  const securities = state.world.market.securities;
  const dayId = Math.floor(state.nowMs / WORLD_DAY_MS);
  for (const account of Object.values(state.accounts)) {
    if (
      !account.positionLedger ||
      typeof account.positionLedger !== 'object' ||
      Array.isArray(account.positionLedger)
    ) {
      account.positionLedger = createPositionLedger(
        account.holdings,
        securities,
      );
      account.realizedPnlCents = 0;
    }
    for (const [symbol, security] of Object.entries(securities)) {
      const quantity = account.holdings[symbol] ?? 0;
      const position = account.positionLedger[symbol];
      if (
        !position ||
        !Number.isSafeInteger(position.costCents) ||
        !Number.isSafeInteger(position.realizedPnlCents)
      ) {
        account.positionLedger[symbol] = {
          costCents: quantity * cents(security.lastPrice),
          realizedPnlCents: 0,
        };
      } else if (quantity === 0) {
        position.costCents = 0;
      }
    }
    account.realizedPnlCents = Object.values(
      account.positionLedger,
    ).reduce(
      (sum, position) => sum + position.realizedPnlCents,
      0,
    );
    if (
      !account.pnlDayAnchor ||
      !Number.isSafeInteger(account.pnlDayAnchor.dayId) ||
      !Number.isSafeInteger(
        account.pnlDayAnchor.totalPnlCents,
      )
    ) {
      account.pnlDayAnchor = {
        dayId,
        totalPnlCents: accountTotalPnlCents(state, account),
      };
    }
  }
}

function proprietaryMakerAccounts(state) {
  return Object.values(state.accounts).filter(
    (account) => account.kind === 'proprietary_maker',
  );
}

function marketInventoryAccounts(state) {
  return Object.values(state.accounts).filter(
    (account) =>
      account.kind === 'proprietary_maker' ||
      account.kind === 'securities_lending_pool' ||
      account.kind ===
        'derivative_lending_custody',
  );
}

function sameHoldingQuantities(left, right) {
  if (
    !left ||
    !right ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Array.isArray(left) ||
    Array.isArray(right)
  ) {
    return false;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (symbol) =>
        Object.hasOwn(right, symbol) &&
        left[symbol] === right[symbol],
    )
  );
}

function replaceHoldingsWhenChanged(target, holdings) {
  if (sameHoldingQuantities(target.holdings, holdings)) {
    return false;
  }
  target.holdings = cloneJson(holdings);
  return true;
}

function markWorldBalanceMirrorDirty(state) {
  worldBalanceMirrorStates.set(state, {
    dirty: true,
  });
}

function syncWorldBalancesFromAccounts(state) {
  if (
    worldBalanceMirrorStates.get(state)?.dirty ===
    false
  ) {
    return false;
  }
  const player = state.accounts.player;
  state.world.player.cash = moneyFromCents(player.cashCents);
  replaceHoldingsWhenChanged(
    state.world.player,
    player.holdings,
  );

  for (const [investorId, investor] of Object.entries(
    state.world.entities.investors ?? {},
  )) {
    const account = state.accounts[investorId];
    if (!account) continue;
    investor.cash = moneyFromCents(account.cashCents);
    replaceHoldingsWhenChanged(
      investor,
      account.holdings,
    );
  }

  const makerAccounts = marketInventoryAccounts(state);
  state.world.market.maker.cash = moneyFromCents(
    makerAccounts.reduce((sum, account) => sum + account.cashCents, 0),
  );
  const makerHoldings = Object.fromEntries(
    Object.keys(state.world.market.securities).map((symbol) => [
      symbol,
      makerAccounts.reduce(
        (sum, account) => sum + (account.holdings[symbol] ?? 0),
        0,
      ),
    ]),
  );
  replaceHoldingsWhenChanged(
    state.world.market.maker,
    makerHoldings,
  );
  state.world.market.exchangeFeePool = moneyFromCents(
    state.exchangeFeePoolCents,
  );
  worldBalanceMirrorStates.set(state, {
    dirty: false,
  });
  return true;
}

function synchronizeTransferredHoldings(
  account,
  holdings,
  securities,
) {
  if (sameHoldingQuantities(account.holdings, holdings)) {
    return false;
  }
  for (const [symbol, security] of Object.entries(
    securities,
  )) {
    const before = account.holdings[symbol] ?? 0;
    const after = holdings[symbol] ?? 0;
    const delta = after - before;
    const ledger =
      account.positionLedger[symbol] ?? {
        costCents:
          before * cents(security.lastPrice),
        realizedPnlCents: 0,
      };
    if (delta > 0) {
      ledger.costCents +=
        delta * cents(security.lastPrice);
    } else if (delta < 0 && before > 0) {
      const removedQuantity = Math.min(
        before,
        -delta,
      );
      ledger.costCents -= Math.round(
        ledger.costCents *
          removedQuantity /
          before,
      );
    }
    if (after === 0) {
      ledger.costCents = 0;
    }
    account.positionLedger[symbol] = ledger;
  }
  account.holdings = cloneJson(holdings);
  return true;
}

function syncAccountsAfterWorldMutation(
  state,
  { synchronizeHoldings = true } = {},
) {
  const player = state.accounts.player;
  player.cashCents = cents(state.world.player.cash);
  if (synchronizeHoldings) {
    synchronizeTransferredHoldings(
      player,
      state.world.player.holdings,
      state.world.market.securities,
    );

    for (const [investorId, investor] of Object.entries(
      state.world.entities.investors ?? {},
    )) {
      const account = state.accounts[investorId];
      if (!account) continue;
      account.cashCents = cents(investor.cash);
      if (
        !sameHoldingQuantities(
          account.holdings,
          investor.holdings,
        )
      ) {
        account.holdings = cloneJson(investor.holdings);
      }
    }
    const lendingPool =
      state.accounts.securities_lending_pool;
    if (lendingPool) {
      synchronizeTransferredHoldings(
        lendingPool,
        Object.fromEntries(
          Object.keys(
            state.world.market.securities,
          ).map((symbol) => [
            symbol,
            state.world.derivatives?.clearing
              ?.lendableSecurities?.[symbol] ?? 0,
          ]),
        ),
        state.world.market.securities,
      );
    }
    for (const custody of derivativeCustodySpecs(
      state.world,
    )) {
      const account =
        state.accounts[custody.accountId];
      if (!account) continue;
      synchronizeTransferredHoldings(
        account,
        Object.fromEntries(
          Object.keys(
            state.world.market.securities,
          ).map((symbol) => [
            symbol,
            custody.holdings[symbol] ?? 0,
          ]),
        ),
        state.world.market.securities,
      );
    }
  }
  state.exchangeFeePoolCents = cents(state.world.market.exchangeFeePool);
  worldBalanceMirrorStates.set(state, {
    dirty: false,
  });
}

function allBookOrders(state) {
  return Object.values(state.books).flatMap((book) =>
    Object.values(book.orders),
  );
}

function createOrderArchive(symbols) {
  return {
    maxTerminalPerSymbol: MAX_TERMINAL_ORDERS_PER_SYMBOL,
    maxReferencesPerSymbol: MAX_ARCHIVE_REFERENCES_PER_SYMBOL,
    totalArchived: 0,
    bySymbol: Object.fromEntries(
      symbols.map((symbol) => [
        symbol,
        {
          totalArchived: 0,
          statusCounts: {},
          firstOrderId: null,
          lastOrderId: null,
          firstOrderSequence: null,
          lastOrderSequence: null,
          rollingDigest: '00000000',
          recentReferences: [],
        },
      ]),
    ),
  };
}

function compareTerminalOrders(left, right) {
  return (
    left.sequence - right.sequence ||
    left.id.localeCompare(right.id)
  );
}

function combineOrderArchiveDigest(
  currentDigest,
  reference,
) {
  const current = Number.parseInt(currentDigest, 16) >>> 0;
  const contribution =
    Number.parseInt(
      hashText(JSON.stringify(reference)),
      16,
    ) >>> 0;
  return (
    (current + contribution) >>> 0
  ).toString(16).padStart(8, '0');
}

function pushTerminalHeap(heap, order) {
  heap.push(order);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (compareTerminalOrders(heap[parent], order) <= 0) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = order;
}

function popTerminalHeap(heap) {
  if (heap.length === 0) return null;
  const oldest = heap[0];
  const tail = heap.pop();
  if (heap.length === 0) return oldest;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    if (left >= heap.length) break;
    const right = left + 1;
    const child =
      right < heap.length &&
      compareTerminalOrders(heap[right], heap[left]) < 0
        ? right
        : left;
    if (compareTerminalOrders(heap[child], tail) >= 0) break;
    heap[index] = heap[child];
    index = child;
  }
  heap[index] = tail;
  return oldest;
}

function terminalOrderIndex(book) {
  let index = terminalOrderIndexes.get(book);
  if (!index) {
    const orders = Object.values(book.orders ?? {}).filter(
      (order) => !activeOrder(order),
    );
    index = {
      ids: new Set(orders.map((order) => order.id)),
      heap: [],
    };
    for (const order of orders) {
      pushTerminalHeap(index.heap, order);
    }
    terminalOrderIndexes.set(book, index);
  }
  return index;
}

function noteTerminalOrders(state, orderIds) {
  for (const orderId of new Set(orderIds)) {
    const order = findOrder(state, orderId);
    if (!order || activeOrder(order)) continue;
    const index = terminalOrderIndex(state.books[order.symbol]);
    if (index.ids.has(order.id)) continue;
    index.ids.add(order.id);
    pushTerminalHeap(index.heap, order);
  }
}

function archiveTerminalOrders(state, symbol) {
  const book = state.books[symbol];
  const terminalIndex = terminalOrderIndex(book);
  const overflow =
    terminalIndex.ids.size - MAX_TERMINAL_ORDERS_PER_SYMBOL;
  if (overflow <= 0) return 0;

  const symbolArchive = state.orderArchive.bySymbol[symbol];
  let archivedCount = 0;
  for (let archived = 0; archived < overflow; archived += 1) {
    let order = popTerminalHeap(terminalIndex.heap);
    while (
      order &&
      (
        !terminalIndex.ids.has(order.id) ||
        !book.orders[order.id] ||
        activeOrder(book.orders[order.id])
      )
    ) {
      order = popTerminalHeap(terminalIndex.heap);
    }
    if (!order) break;
    order = book.orders[order.id];
    const reference = {
      id: order.id,
      symbol: order.symbol,
      ownerId: order.ownerId,
      brokerId: order.brokerId,
      side: order.side,
      type: order.type,
      status: order.status,
      priceTicks: order.priceTicks,
      originalQty: order.originalQty,
      remainingQty: order.remainingQty,
      submittedMs: order.submittedMs,
      arrivalPriceTicks: order.arrivalPriceTicks,
      tif: order.tif,
      ecologyAgentId: order.ecologyAgentId ?? null,
      parentOrderId: order.parentOrderId ?? null,
      automationKind: order.automationKind ?? null,
      automationDecisionId: order.automationDecisionId ?? null,
      automationStrategyIds: [...(order.automationStrategyIds ?? [])],
      sequence: order.sequence,
      commitSeq: order.commitSeq,
    };
    symbolArchive.totalArchived += 1;
    state.orderArchive.totalArchived += 1;
    symbolArchive.statusCounts[order.status] =
      (symbolArchive.statusCounts[order.status] ?? 0) + 1;
    if (
      symbolArchive.firstOrderSequence === null ||
      order.sequence < symbolArchive.firstOrderSequence
    ) {
      symbolArchive.firstOrderSequence = order.sequence;
      symbolArchive.firstOrderId = order.id;
    }
    if (
      symbolArchive.lastOrderSequence === null ||
      order.sequence > symbolArchive.lastOrderSequence
    ) {
      symbolArchive.lastOrderSequence = order.sequence;
      symbolArchive.lastOrderId = order.id;
    }
    symbolArchive.rollingDigest = combineOrderArchiveDigest(
      symbolArchive.rollingDigest,
      reference,
    );
    symbolArchive.recentReferences.push(reference);
    symbolArchive.recentReferences.sort((left, right) =>
      left.sequence - right.sequence ||
      left.id.localeCompare(right.id),
    );
    if (
      symbolArchive.recentReferences.length >
      MAX_ARCHIVE_REFERENCES_PER_SYMBOL
    ) {
      symbolArchive.recentReferences.splice(
        0,
        symbolArchive.recentReferences.length -
          MAX_ARCHIVE_REFERENCES_PER_SYMBOL,
      );
    }
    delete book.orders[order.id];
    unindexOrder(state, order.id);
    terminalIndex.ids.delete(order.id);
    archivedCount += 1;
  }
  return archivedCount;
}

function worldOrderMirror(order) {
  return {
    ...order,
    liquidityLayer: order.liquidityLayer
      ? cloneLiquidityLayer(order.liquidityLayer)
      : null,
    actorId: order.ownerId,
    quantity: order.originalQty,
    remainingQuantity: order.remainingQty,
    source: 'realtime_order_book',
  };
}

function worldBookMirror(book, worldTick) {
  const depth = aggregateBook(book, Number.MAX_SAFE_INTEGER);
  return {
    bids: depth.bids.map((level) => ({
      price: moneyFromCents(level.priceTicks),
      quantity: level.quantity,
    })),
    asks: depth.asks.map((level) => ({
      price: moneyFromCents(level.priceTicks),
      quantity: level.quantity,
    })),
    lastUpdatedTick: worldTick,
    authority: 'realtime_order_book_derived_view',
  };
}

function dirtyWorldOrderMirrors(state, dirtySymbols) {
  const dirty = new Set(dirtySymbols);
  const transactionalChanges = new Map(
    [...dirty].flatMap((symbol) => {
      const changes = orderBookTransactionChanges(
        state.books[symbol],
      );
      return changes ? [[symbol, changes]] : [];
    }),
  );
  const retainedBySymbol = new Map();
  const changedOrderIdsSeen = new Map(
    [...transactionalChanges].map(([symbol]) => [
      symbol,
      new Set(),
    ]),
  );
  for (const order of state.world.market.orders ?? []) {
    if (dirty.has(order.symbol)) {
      const changes =
        transactionalChanges.get(order.symbol);
      if (!changes) continue;
      if (changes.deletedOrderIds.has(order.id)) {
        continue;
      }
      if (changes.changedOrders.has(order.id)) {
        const changed =
          changes.changedOrders.get(order.id);
        const retained =
          retainedBySymbol.get(order.symbol) ?? [];
        retained.push(worldOrderMirror(changed));
        retainedBySymbol.set(order.symbol, retained);
        changedOrderIdsSeen
          .get(order.symbol)
          .add(order.id);
        continue;
      }
    }
    const retained = retainedBySymbol.get(order.symbol) ?? [];
    retained.push(order);
    retainedBySymbol.set(order.symbol, retained);
  }
  return Object.keys(state.books).flatMap((symbol) =>
    dirty.has(symbol)
      ? transactionalChanges.has(symbol)
        ? [
            ...(retainedBySymbol.get(symbol) ?? []),
            ...[...transactionalChanges
              .get(symbol)
              .changedOrders]
              .filter(
                ([orderId]) =>
                  !changedOrderIdsSeen
                    .get(symbol)
                    .has(orderId) &&
                  !transactionalChanges
                    .get(symbol)
                    .deletedOrderIds
                    .has(orderId),
              )
              .map(([, order]) =>
                worldOrderMirror(order),
              ),
          ]
        : Object.values(
            state.books[symbol].orders,
          ).map(worldOrderMirror)
      : retainedBySymbol.get(symbol) ?? [],
  );
}

function markDeferredWorldOrderMirror(state, symbol) {
  if (!Object.hasOwn(state.books, symbol)) return;
  let symbols = deferredWorldOrderMirrorSymbols.get(state);
  if (!symbols) {
    symbols = new Set();
    deferredWorldOrderMirrorSymbols.set(state, symbols);
  }
  symbols.add(symbol);
}

function syncWorldMarketMirrors(
  state,
  {
    dirtySymbols = null,
    synchronizeDerivatives = true,
    performanceTrace = null,
  } = {},
) {
  const traceNow = performanceTrace
    ? () => globalThis.performance?.now?.() ?? Date.now()
    : null;
  let traceStartedAt = traceNow?.();
  const tracePart = performanceTrace
    ? (name) => {
        const completedAt = traceNow();
        performanceTrace[name] = completedAt - traceStartedAt;
        traceStartedAt = completedAt;
      }
    : () => {};
  syncWorldBalancesFromAccounts(state);
  tracePart('worldBalanceMirrorMs');
  const scopedSymbols = Array.isArray(dirtySymbols)
    ? [...new Set(dirtySymbols)].filter((symbol) =>
        Object.hasOwn(state.books, symbol),
      )
    : null;
  state.world.market.orders = scopedSymbols
    ? dirtyWorldOrderMirrors(state, scopedSymbols)
    : allBookOrders(state).map(worldOrderMirror);
  tracePart('worldOrderMirrorMs');
  if (scopedSymbols) {
    state.world.market.orderBooks = {
      ...state.world.market.orderBooks,
    };
  }
  const booksToMirror = scopedSymbols
    ? scopedSymbols.map((symbol) => [symbol, state.books[symbol]])
    : Object.entries(state.books);
  for (const [symbol, book] of booksToMirror) {
    state.world.market.orderBooks[symbol] = worldBookMirror(
      book,
      state.world.world.tick,
    );
  }
  tracePart('worldBookMirrorMs');
  const deferredSymbols =
    deferredWorldOrderMirrorSymbols.get(state);
  if (deferredSymbols) {
    if (scopedSymbols) {
      for (const symbol of scopedSymbols) {
        deferredSymbols.delete(symbol);
      }
    } else {
      deferredSymbols.clear();
    }
    if (deferredSymbols.size === 0) {
      deferredWorldOrderMirrorSymbols.delete(state);
    }
  }
  if (synchronizeDerivatives) {
    if (synchronizeDerivatives === 'reservation_only') {
      synchronizeEmbeddedDerivativeReservations(
        state.world,
      );
    } else {
      synchronizeEmbeddedDerivatives(state.world);
    }
  }
  tracePart('worldDerivativeMirrorMs');
}

function flushDeferredWorldOrderMirrors(state) {
  const symbols =
    deferredWorldOrderMirrorSymbols.get(state);
  if (!symbols || symbols.size === 0) return false;
  syncWorldMarketMirrors(state, {
    dirtySymbols: [...symbols],
    synchronizeDerivatives: false,
  });
  return true;
}

function synchronizeDeferredBalancesForDerivatives(
  state,
  deferMarketMirror,
) {
  if (
    !deferMarketMirror ||
    worldBalanceMirrorStates.get(state)?.dirty !== true
  ) {
    return false;
  }
  syncWorldBalancesFromAccounts(state);
  return true;
}

function findOrder(state, orderId) {
  let index = orderIndexes.get(state);
  if (!index) {
    index = new Map();
    for (const book of Object.values(state.books)) {
      for (const order of Object.values(book.orders ?? {})) {
        if (index.has(order.id)) {
          throw new Error(`Duplicate market order id: ${order.id}`);
        }
        index.set(order.id, order);
      }
    }
    orderIndexes.set(state, index);
  }
  if (orderIndexOverlays.has(index)) {
    if (index.deleted.has(orderId)) return null;
    if (index.changed.has(orderId)) {
      return index.changed.get(orderId) ?? null;
    }
    const baseOrder = index.base.get(orderId) ?? null;
    if (!baseOrder) return null;
    const book = state.books[baseOrder.symbol];
    const changes = orderBookTransactionChanges(book);
    if (changes?.deletedOrderIds.has(orderId)) {
      index.deleted.add(orderId);
      return null;
    }
    if (changes?.changedOrders.has(orderId)) {
      const changed =
        changes.changedOrders.get(orderId);
      index.changed.set(orderId, changed);
      return changed;
    }
    return baseOrder;
  }
  return index.get(orderId) ?? null;
}

function indexOrder(state, order) {
  if (!order) return;
  let index = orderIndexes.get(state);
  if (!index) {
    findOrder(state, order.id);
    index = orderIndexes.get(state);
  }
  const existing = orderIndexOverlays.has(index)
    ? index.deleted.has(order.id)
      ? null
      : index.changed.has(order.id)
        ? index.changed.get(order.id)
        : index.base.get(order.id)
    : index.get(order.id);
  if (existing && existing !== order) {
    throw new Error(`Duplicate market order id: ${order.id}`);
  }
  if (orderIndexOverlays.has(index)) {
    index.deleted.delete(order.id);
    index.changed.set(order.id, order);
  } else {
    index.set(order.id, order);
  }
}

function unindexOrder(state, orderId) {
  const index = orderIndexes.get(state);
  if (!index) return;
  if (orderIndexOverlays.has(index)) {
    index.changed.delete(orderId);
    index.deleted.add(orderId);
  } else {
    index.delete(orderId);
  }
}

function pushReceipt(state, receipt) {
  state.receipts.push(receipt);
  if (receipt.actorId === 'player' && state.world?.ui) {
    state.world.ui.lastReceipt = cloneJson(receipt);
  }
  return receipt;
}

function rejectedReceipt(state, type, reason, details = {}) {
  return pushReceipt(state, {
    id: nextLocalId(state, 'receipt'),
    type,
    status: 'rejected',
    reason,
    virtualMs: state.nowMs,
    commitSeq: state.commitSeq,
    ...details,
  });
}

function validateBrokerCommand(state, command) {
  const account = state.accounts[command.actorId];
  if (!account) return { reason: 'UNKNOWN_ACTOR', account: null };
  if (
    account.kind === 'securities_lending_pool' ||
    account.kind === 'derivative_lending_custody'
  ) {
    return {
      reason: 'CUSTODY_ACCOUNT_READ_ONLY',
      account: null,
    };
  }
  if (account.brokerId !== command.brokerId) {
    return { reason: 'BROKER_CLIENT_MISMATCH', account: null };
  }
  return { reason: null, account };
}

function derivativeReservedPlayerCashCents(state) {
  const account =
    state.world?.derivatives?.accounts?.player;
  return [
    account?.reservedInitialMarginCents,
    account?.reservedTransactionFeesCents,
  ].reduce(
    (sum, reserved) =>
      Number.isSafeInteger(reserved) && reserved > 0
        ? sum + reserved
        : sum,
    0,
  );
}

function reconcileOrderReservations(state, orderIds) {
  for (const orderId of new Set(orderIds)) {
    const order = findOrder(state, orderId);
    if (!order) continue;
    const account = state.accounts[order.ownerId];
    if (order.side === 'buy') {
      const required = calculateBuyReservation(order);
      account.reservedCashCents -= order.reservedCashCents - required;
      order.reservedCashCents = required;
    } else {
      const required = activeOrder(order) ? order.remainingQty : 0;
      account.reservedHoldings[order.symbol] -= order.reservedUnits - required;
      order.reservedUnits = required;
    }
  }
}

function appendMarketFill(state, symbol, fill) {
  const transaction = deferredBarFillTransactions.get(state);
  if (!transaction) {
    appendFillInPlace(state.barSeries[symbol], fill);
    return;
  }
  let entry = transaction.get(symbol);
  if (!entry) {
    const sourceSeries = state.barSeries[symbol];
    const retainedTail = sourceSeries.fills.at(-1);
    entry = {
      sourceSeries,
      validationSeries: {
        ...sourceSeries,
        fills: retainedTail ? [retainedTail] : [],
        bars: sourceSeries.bars,
      },
      fills: [],
    };
    transaction.set(symbol, entry);
  }
  appendFillInPlace(entry.validationSeries, fill);
  entry.fills.push(entry.validationSeries.fills.at(-1));
}

function turnoverWindowId(openedAtMs) {
  return `market_day:${Math.floor(openedAtMs / WORLD_DAY_MS)}`;
}

function effectiveFloatUnits(world, symbol) {
  const security = world.market.securities[symbol];
  const units = Math.trunc(
    Number(
      security?.floatUnits ??
        security?.floatShares,
    ),
  );
  if (!Number.isSafeInteger(units) || units < 1) {
    throw new Error(
      `Invalid effective float for turnover: ${symbol}`,
    );
  }
  return units;
}

function createTurnoverTruthBySymbol(
  world,
  openedAtMs,
) {
  return Object.fromEntries(
    Object.keys(world.market.securities).map((symbol) => [
      symbol,
      createCumulativeTurnoverState({
        assetId: symbol,
        windowId: turnoverWindowId(openedAtMs),
        effectiveFloatUnits:
          effectiveFloatUnits(world, symbol),
        openedAtMs,
      }),
    ]),
  );
}

function exactTurnoverIntegrationBySymbol(world) {
  return Object.fromEntries(
    Object.keys(world.market.securities).map((symbol) => [
      symbol,
      {
        schemaVersion:
          TURNOVER_PRODUCTION_INTEGRATION_SCHEMA,
        status: 'exact_from_window_open',
        grossAuthority: 'settled_matched_fills_only',
        selfTradeCoverage: 'exact',
      },
    ]),
  );
}

function recordSettledTurnoverFill(state, trade) {
  const current =
    state.turnoverTruthBySymbol[trade.symbol];
  const result = reduceCumulativeTurnover(current, {
    type: 'MATCHED_FILL_SETTLED',
    eventId: trade.id,
    eventSeq: current.lastEventSeq + 1,
    atMs: trade.virtualMs,
    priceAuthority: 'matched_order_fill',
    quantity: trade.quantity,
    priceTicks: trade.priceTicks,
    selfTrade: trade.selfTrade,
  });
  state.turnoverTruthBySymbol[trade.symbol] =
    result.state;
  return result.receipt;
}

function openTurnoverTruthWindow(state) {
  for (const symbol of Object.keys(state.books)) {
    const current =
      state.turnoverTruthBySymbol[symbol];
    const result = reduceCumulativeTurnover(current, {
      type: 'OPEN_TURNOVER_WINDOW',
      eventId:
        `turnover_window:${symbol}:${state.nowMs}`,
      eventSeq: current.lastEventSeq + 1,
      atMs: state.nowMs,
      windowId: turnoverWindowId(state.nowMs),
      effectiveFloatUnits:
        effectiveFloatUnits(state.world, symbol),
    });
    state.turnoverTruthBySymbol[symbol] = result.state;
    state.turnoverTruthIntegrationBySymbol[symbol] = {
      schemaVersion:
        TURNOVER_PRODUCTION_INTEGRATION_SCHEMA,
      status: 'exact_from_window_open',
      grossAuthority: 'settled_matched_fills_only',
      selfTradeCoverage: 'exact',
    };
  }
}

function publicTurnoverTruth(state, symbol) {
  const source = projectCumulativeTurnover(
    state.turnoverTruthBySymbol[symbol],
  );
  const integration =
    state.turnoverTruthIntegrationBySymbol[symbol];
  const projection = {
    ...source,
    integrationStatus: 'production_integrated',
    sourceModuleIntegrationStatus:
      source.integrationStatus,
    productionIntegration: cloneJson(integration),
  };
  if (integration.selfTradeCoverage !== 'exact') {
    projection.selfTradeUnits = null;
    projection.selfTradeTurnoverTicks = null;
    projection.selfTradeCount = null;
    projection.armLengthUnits = null;
    projection.armLengthTurnoverBps = null;
  }
  return projection;
}

function publishFill(state, fill, commitSeq) {
  const buyOrder = findOrder(state, fill.buyerOrderId);
  const sellOrder = findOrder(state, fill.sellerOrderId);
  if (!buyOrder || !sellOrder) {
    throw new Error(
      `fill settlement orders missing: ${fill.buyerOrderId}:${fill.sellerOrderId}`,
    );
  }
  const selfTrade =
    buyOrder.ownerId === sellOrder.ownerId;
  if (fill.selfTrade !== selfTrade) {
    throw new Error(
      `fill ownership trace mismatch: ${fill.buyerOrderId}:${fill.sellerOrderId}`,
    );
  }
  const buyer = state.accounts[buyOrder.ownerId];
  const seller = state.accounts[sellOrder.ownerId];
  const grossCents = fill.priceTicks * fill.quantity;
  const buyerFilledGrossCents =
    buyOrder.filledGrossCents ?? 0;
  const buyerChargedFeeCents =
    buyOrder.chargedFeeCents ?? 0;
  const nextBuyerFilledGrossCents =
    buyerFilledGrossCents + grossCents;
  const nextBuyerChargedFeeCents =
    calculateFeeCents(nextBuyerFilledGrossCents);
  const buyerFeeCents =
    nextBuyerChargedFeeCents -
    buyerChargedFeeCents;
  const sellerFilledGrossCents =
    sellOrder.filledGrossCents ?? 0;
  const sellerSelfTradeGrossCents =
    sellOrder.selfTradeGrossCents ?? 0;
  const nextSellerSelfTradeGrossCents =
    sellerSelfTradeGrossCents +
    (selfTrade ? grossCents : 0);
  const sellerChargedFeeCents =
    sellOrder.chargedFeeCents ?? 0;
  const nextSellerChargedFeeCents =
    calculateFeeCents(
      nextSellerSelfTradeGrossCents,
    );
  const sellerFeeCents =
    nextSellerChargedFeeCents -
    sellerChargedFeeCents;
  const feeCents =
    buyerFeeCents + sellerFeeCents;
  const tradeId = nextLocalId(state, 'rt_trade');
  const eventId = nextLocalId(state, 'rt_event');
  const journalId = nextLocalId(state, 'rt_journal');
  const factId = nextLocalId(state, 'rt_fact');
  const memoryId = nextLocalId(state, 'rt_memory');
  const priceBand = securityPriceBand(
    state.world.market.securities[buyOrder.symbol],
  );
  if (
    fill.priceTicks < priceBand.limitDownTicks ||
    fill.priceTicks > priceBand.limitUpTicks
  ) {
    throw new Error(
      `fill outside daily price band: ${buyOrder.symbol}:${fill.priceTicks}`,
    );
  }

  const symbol = buyOrder.symbol;
  const buyerPosition = buyer.positionLedger[symbol];
  const sellerPosition = seller.positionLedger[symbol];
  const sellerQuantityBefore = seller.holdings[symbol] ?? 0;
  const releasedSellerCostCents =
    fill.quantity === sellerQuantityBefore
      ? sellerPosition.costCents
      : Math.round(
          sellerPosition.costCents *
            fill.quantity /
            Math.max(1, sellerQuantityBefore),
        );

  if (selfTrade) {
    if (buyer.cashCents < feeCents) {
      throw new Error(
        `self-trade fee cash unavailable: ${buyer.id}:${feeCents}`,
      );
    }
    buyer.cashCents -= feeCents;
  } else {
    buyer.cashCents -= grossCents + buyerFeeCents;
    seller.cashCents += grossCents;
    buyer.holdings[symbol] =
      (buyer.holdings[symbol] ?? 0) + fill.quantity;
    seller.holdings[symbol] =
      sellerQuantityBefore - fill.quantity;
    buyerPosition.costCents +=
      grossCents + buyerFeeCents;
    sellerPosition.costCents -=
      releasedSellerCostCents;
    sellerPosition.realizedPnlCents +=
      grossCents - releasedSellerCostCents;
    seller.realizedPnlCents +=
      grossCents - releasedSellerCostCents;
  }
  markWorldBalanceMirrorDirty(state);
  buyer.commitSeq = commitSeq;
  seller.commitSeq = commitSeq;
  state.exchangeFeePoolCents += feeCents;
  buyOrder.filledGrossCents =
    nextBuyerFilledGrossCents;
  buyOrder.chargedFeeCents =
    nextBuyerChargedFeeCents;
  sellOrder.filledGrossCents =
    sellerFilledGrossCents + grossCents;
  sellOrder.selfTradeGrossCents =
    nextSellerSelfTradeGrossCents;
  sellOrder.chargedFeeCents =
    nextSellerChargedFeeCents;
  buyOrder.commitSeq = commitSeq;
  sellOrder.commitSeq = commitSeq;

  const journal = {
    id: journalId,
    tick: state.world.world.tick,
    virtualMs: state.nowMs,
    eventId,
    type: 'realtime_secondary_trade_settlement',
    description: `${buyOrder.symbol} 成交结算`,
    amountUnit: 'cents',
    postings: [
      {
        account: `${seller.id}.cash`,
        debit: grossCents,
        credit: 0,
      },
      {
        account: 'exchange.fee_pool',
        debit: feeCents,
        credit: 0,
      },
      {
        account: `${buyer.id}.cash`,
        debit: 0,
        credit: grossCents + feeCents,
      },
    ],
    securityTransfers: [
      {
        symbol: buyOrder.symbol,
        from: seller.id,
        to: buyer.id,
        quantity: fill.quantity,
        selfTrade,
        ...(sellOrder.custodySource
          ? {
              custodySource:
                sellOrder.custodySource,
            }
          : {}),
      },
    ],
    commitSeq,
  };
  const event = {
    id: eventId,
    type: 'realtime_market_trade',
    tick: state.world.world.tick,
    effectiveAt: state.world.world.tick,
    effectiveAtMs: state.nowMs,
    actorId: buyOrder.ownerId,
    authority: 'realtime_market_matching',
    affectedEntities: [
      ...new Set([
        buyer.id,
        seller.id,
        state.world.market.securities[buyOrder.symbol].issuerId,
      ]),
    ],
    preconditions: [
      buyOrder.id,
      sellOrder.id,
    ],
    ruleVersion: MARKET_RULE_VERSION,
    seedRef: `${state.world.world.seed}:${state.nowMs}`,
    parentIds: [],
    factIds: [factId],
    ledgerEntryIds: [journalId],
    visibility: 'public',
    status: 'settled',
    correctionRef: null,
    summary: `${buyOrder.symbol} 以 ${moneyFromCents(fill.priceTicks).toFixed(2)} 元成交 ${fill.quantity} 股。`,
    commitSeq,
  };
  const fact = {
    id: factId,
    tick: state.world.world.tick,
    virtualMs: state.nowMs,
    authority: 'world_fact',
    type: 'realtime_market_fill',
    entityId: state.world.market.securities[buyOrder.symbol].issuerId,
    eventId,
    summary: `${buyOrder.symbol} 成交 ${fill.quantity} 股。`,
    value: {
      symbol: buyOrder.symbol,
      priceTicks: fill.priceTicks,
      quantity: fill.quantity,
      buyerId: buyer.id,
      sellerId: seller.id,
      selfTrade,
    },
    visibility: 'public',
    confidence: 1,
    commitSeq,
  };
  const memory = {
    id: memoryId,
    factId,
    ownerId: 'public_market',
    content: `${buyOrder.symbol} 出现一笔 ${fill.quantity} 股的公开成交。`,
    salience: 0.55,
    accuracyState: 'anchored',
    createdTick: state.world.world.tick,
    createdMs: state.nowMs,
    lastRecalledTick: state.world.world.tick,
    decay: 0.015,
    visibility: 'public',
    commitSeq,
  };
  const trade = {
    id: tradeId,
    eventId,
    factId,
    tick: state.world.world.tick,
    virtualMs: state.nowMs,
    symbol: buyOrder.symbol,
    side: buyOrder.id === fill.incomingOrderId ? 'buy' : 'sell',
    buyerId: buyer.id,
    sellerId: seller.id,
    selfTrade,
    price: moneyFromCents(fill.priceTicks),
    priceTicks: fill.priceTicks,
    quantity: fill.quantity,
    source: 'realtime_order_book',
    orderIds: [buyOrder.id, sellOrder.id],
    parentOrderIds: [
      buyOrder.parentOrderId,
      sellOrder.parentOrderId,
    ],
    restingOrderId: fill.restingOrderId,
    incomingOrderId: fill.incomingOrderId,
    incomingArrivalPriceTicks:
      findOrder(state, fill.incomingOrderId)?.arrivalPriceTicks ?? null,
    grossCents,
    buyerFeeCents,
    sellerFeeCents,
    feeCents,
    ...(sellOrder.custodySource
      ? {
          custodySource:
            sellOrder.custodySource,
        }
      : {}),
    commitSeq,
  };

  state.world.ledger.push(journal);
  state.world.eventLog.push(event);
  state.world.facts.push(fact);
  state.world.worldline = advanceWorldlineState(
    state.world.worldline,
    event,
    { mutate: true },
  );
  state.world.memories.push(memory);
  state.world.market.trades.push(trade);
  recordSettledTurnoverFill(state, trade);
  state.realtimeAuditArchive.liveChainCount += 1;
  appendMarketFill(state, buyOrder.symbol, {
    timestampMs: state.nowMs,
    sequence: Number(tradeId.slice(-8)),
    priceTicks: fill.priceTicks,
    quantity: fill.quantity,
  });
  const security = state.world.market.securities[buyOrder.symbol];
  security.lastPrice = moneyFromCents(fill.priceTicks);
  security.priceHistory.push({
    tick: state.world.world.tick,
    virtualMs: state.nowMs,
    price: security.lastPrice,
    priceTicks: fill.priceTicks,
    source: 'realtime_order_book',
    tradeId,
    commitSeq,
  });
  schedulePublicFlowResponses(state, trade, {
    trade,
    event,
    journal,
    fact,
    memory,
  });
  return trade;
}

function validateSubmitIntent(state, command, account) {
  const invalid = (reason) => ({ reason, marketQuote: null });
  if (!state.books[command.symbol]) return invalid('UNKNOWN_SECURITY');
  if (command.side !== 'buy' && command.side !== 'sell') {
    return invalid('INVALID_SIDE');
  }
  const orderType = command.orderType ?? 'limit';
  if (orderType !== 'limit' && orderType !== 'market') {
    return invalid('INVALID_ORDER_TYPE');
  }
  if (orderType === 'limit' && !isPositiveInteger(command.priceTicks)) {
    return invalid('INVALID_PRICE_TICKS');
  }
  if (
    orderType === 'market' &&
    command.priceTicks !== null &&
    command.priceTicks !== undefined
  ) {
    return invalid('INVALID_MARKET_PRICE');
  }
  if (!isPositiveInteger(command.quantity)) {
    return invalid('INVALID_QUANTITY');
  }
  if (command.tif !== 'GTC' && command.tif !== 'IOC') {
    return invalid('INVALID_TIF');
  }
  if (orderType === 'market' && command.tif !== 'IOC') {
    return invalid('INVALID_MARKET_TIF');
  }
  if (orderType === 'limit') {
    const band = securityPriceBand(
      state.world.market.securities[command.symbol],
    );
    if (command.priceTicks > band.limitUpTicks) {
      return invalid('PRICE_ABOVE_DAILY_LIMIT');
    }
    if (command.priceTicks < band.limitDownTicks) {
      return invalid('PRICE_BELOW_DAILY_LIMIT');
    }
    if (
      command.liquidityLayer?.zone === 'LIMIT_QUEUE' &&
      typeof command.liquidityLayer.episodeId === 'string'
    ) {
      const agent =
        state.agentEcology?.agents?.[
          command.ecologyAgentId
        ];
      const episode =
        agent?.limitQueueEpisodes?.[command.symbol];
      const expectedDirection =
        command.side === 'buy' ? 'up' : 'down';
      const expectedLimitPriceTicks =
        command.side === 'buy'
          ? band.limitUpTicks
          : band.limitDownTicks;
      if (
        !episode ||
        episode.episodeId !== command.parentOrderId ||
        episode.episodeId !==
          command.liquidityLayer.episodeId ||
        episode.direction !== expectedDirection ||
        episode.limitPriceTicks !==
          expectedLimitPriceTicks ||
        command.priceTicks !==
          expectedLimitPriceTicks ||
        episode.activeLayerKey !==
          command.liquidityLayer.layerKey ||
        command.liquidityLayer.limitQueuePhase !==
          episode.state
      ) {
        return invalid(
          'STALE_DAILY_LIMIT_QUEUE_EPISODE',
        );
      }
    }
  }

  const marketQuote =
    orderType === 'market'
      ? prepareMarketExecution(state, command)
      : null;
  if (command.side === 'buy') {
    const required =
      orderType === 'market'
        ? marketQuote.requiredCashCents
        : calculateBuyReservation(
            command.priceTicks,
            command.quantity,
          );
    const sharedDerivativeReservation =
      account.id === 'player'
        ? derivativeReservedPlayerCashCents(state)
        : 0;
    if (
      account.cashCents -
        account.reservedCashCents -
        sharedDerivativeReservation <
        required
    ) {
      return invalid('INSUFFICIENT_CASH');
    }
  } else {
    const freeUnits =
      (account.holdings[command.symbol] ?? 0) -
      (account.reservedHoldings[command.symbol] ?? 0);
    if (freeUnits < command.quantity) {
      return invalid('INSUFFICIENT_HOLDINGS');
    }
  }
  return { reason: null, marketQuote };
}

function prepareMarketExecution(state, command) {
  const book = state.books[command.symbol];
  if (!book) {
    return {
      filledQuantity: 0,
      grossCents: 0,
      requiredCashCents: 0,
      worstPriceTicks: null,
      levelCount: 0,
      executionPlan: null,
    };
  }
  const band = securityPriceBand(
    state.world.market.securities[command.symbol],
  );
  const plan = previewBookExecution(book, {
    side: command.side,
    ownerId: command.actorId,
    type: 'market',
    priceTicks: null,
    quantity: command.quantity,
  });
  let filledQuantity = 0;
  let grossCents = 0;
  let worstPriceTicks = null;
  let levelCount = 0;
  let previousPriceTicks = null;
  for (const match of plan.matches) {
    if (
      match.priceTicks < band.limitDownTicks ||
      match.priceTicks > band.limitUpTicks
    ) {
      continue;
    }
    filledQuantity += match.quantity;
    grossCents += match.quantity * match.priceTicks;
    worstPriceTicks = match.priceTicks;
    if (match.priceTicks !== previousPriceTicks) {
      levelCount += 1;
      previousPriceTicks = match.priceTicks;
    }
  }
  return {
    filledQuantity,
    grossCents,
    requiredCashCents:
      command.side === 'buy'
        ? grossCents + calculateFeeCents(grossCents)
        : 0,
    worstPriceTicks,
    levelCount,
    executionPlan: plan,
  };
}

function marketExecutionQuote(state, command) {
  const {
    executionPlan: _executionPlan,
    ...quote
  } = prepareMarketExecution(state, command);
  return quote;
}

function rejectedSubmitOrderReceipt(
  state,
  command,
  reason,
  roleAutomation,
) {
  const orderType = command.orderType ?? 'limit';
  return rejectedReceipt(state, 'submit_order', reason, {
    actorId: command.actorId,
    symbol: command.symbol ?? null,
    side: command.side ?? null,
    orderType,
    requestedQuantity: command.quantity ?? null,
    limitPriceTicks:
      orderType === 'market'
        ? null
        : command.priceTicks ?? null,
    parentOrderId: command.parentOrderId ?? null,
    ecologyAgentId: command.ecologyAgentId ?? null,
    ecologyIntentKind: command.ecologyIntentKind ?? null,
    ...roleAutomation,
  });
}

function handleSubmitOrder(
  state,
  command,
  { deferBatchMaintenance = false } = {},
) {
  const roleAutomation = automationAttribution(command);
  const brokerCheck = validateBrokerCommand(state, command);
  if (brokerCheck.reason) {
    return rejectedSubmitOrderReceipt(
      state,
      command,
      brokerCheck.reason,
      roleAutomation,
    );
  }
  const validation = validateSubmitIntent(
    state,
    command,
    brokerCheck.account,
  );
  if (validation.reason) {
    return rejectedSubmitOrderReceipt(
      state,
      command,
      validation.reason,
      roleAutomation,
    );
  }

  const commitSeq = state.commitSeq + 1;
  const orderId = nextLocalId(state, 'order', state.nextOrderSequence++);
  const orderType = command.orderType ?? 'limit';
  const marketQuote =
    orderType === 'market'
      ? validation.marketQuote
      : null;
  const order = {
    id: orderId,
    ownerId: command.actorId,
    brokerId: command.brokerId,
    symbol: command.symbol,
    side: command.side,
    type: orderType,
    priceTicks: orderType === 'market' ? null : command.priceTicks,
    originalQty: command.quantity,
    remainingQty: command.quantity,
    submittedMs: state.nowMs,
    arrivalPriceTicks: cents(
      state.world.market.securities[command.symbol].lastPrice,
    ),
    tif: orderType === 'market' ? 'IOC' : command.tif,
    status: 'accepted',
    reservedCashCents: 0,
    reservedUnits: 0,
    filledGrossCents: 0,
    selfTradeGrossCents: 0,
    chargedFeeCents: 0,
    parentOrderId: command.parentOrderId ?? null,
    ecologyAgentId:
      typeof command.ecologyAgentId === 'string'
        ? command.ecologyAgentId
        : null,
    ecologyIntentKind:
      typeof command.ecologyIntentKind === 'string'
        ? command.ecologyIntentKind
        : null,
    custodySource:
      command.source ===
        'margin_financing_collateral_liquidation' &&
      command.actorId === 'player' &&
      command.side === 'sell'
        ? 'owned_collateral'
        : null,
    liquidityLayer: command.liquidityLayer
      ? cloneLiquidityLayer(command.liquidityLayer)
      : null,
    ...roleAutomation,
    commitSeq,
  };
  if (
    typeof command.orderContextVersion === 'string' &&
    typeof command.orderContextRegime === 'string' &&
    command.orderContextSymbol === command.symbol &&
    Number.isSafeInteger(
      command.orderContextArrivalBudgetUnits,
    ) &&
    command.orderContextArrivalBudgetUnits > 0 &&
    Number.isSafeInteger(
      command.orderContextDepthBudgetUnits,
    ) &&
    command.orderContextDepthBudgetUnits > 0 &&
    Array.isArray(command.orderContextMechanismSources)
  ) {
    order.orderContextVersion = command.orderContextVersion;
    order.orderContextRegime = command.orderContextRegime;
    order.orderContextSymbol = command.orderContextSymbol;
    order.orderContextArrivalBudgetUnits =
      command.orderContextArrivalBudgetUnits;
    order.orderContextDepthBudgetUnits =
      command.orderContextDepthBudgetUnits;
    order.orderContextMechanismSources = [
      ...command.orderContextMechanismSources,
    ];
  }
  if (order.side === 'buy') {
    order.reservedCashCents =
      orderType === 'market'
        ? marketQuote.requiredCashCents
        : calculateBuyReservation(order);
    brokerCheck.account.reservedCashCents += order.reservedCashCents;
  } else {
    order.reservedUnits = order.originalQty;
    brokerCheck.account.reservedHoldings[order.symbol] += order.reservedUnits;
  }

  const result = submitToBook(
    state.books[order.symbol],
    order,
    {
      executionPlan: marketQuote?.executionPlan ?? null,
    },
  );
  if (result.rejected) {
    if (order.side === 'buy') {
      brokerCheck.account.reservedCashCents -= order.reservedCashCents;
    } else {
      brokerCheck.account.reservedHoldings[order.symbol] -= order.reservedUnits;
    }
    return rejectedSubmitOrderReceipt(
      state,
      command,
      result.rejected.reason,
      roleAutomation,
    );
  }
  indexOrder(state, state.books[order.symbol].orders[orderId]);

  const tradeIds = result.fills.map(
    (fill) => publishFill(state, fill, commitSeq).id,
  );
  const affectedOrderIds = result.fills.flatMap((fill) => [
    fill.buyerOrderId,
    fill.sellerOrderId,
  ]);
  affectedOrderIds.push(orderId);
  reconcileOrderReservations(state, affectedOrderIds);

  const stored = state.books[order.symbol].orders[orderId];
  const filledQuantity = order.originalQty - stored.remainingQty;
  const selfTradeFills = result.fills.filter(
    (fill) => fill.selfTrade === true,
  );
  let status = stored.status;
  if (stored.status === 'cancelled' && filledQuantity > 0) {
    status = 'partially_filled';
  }
  for (const affectedOrderId of new Set(affectedOrderIds)) {
    const affectedOrder = findOrder(state, affectedOrderId);
    if (affectedOrder) {
      affectedOrder.commitSeq = commitSeq;
      state.accounts[affectedOrder.ownerId].commitSeq = commitSeq;
    }
  }
  noteTerminalOrders(state, affectedOrderIds);
  state.commitSeq = commitSeq;
  if (!deferBatchMaintenance) {
    archiveTerminalOrders(state, order.symbol);
    markAccountRisk(state);
    syncWorldMarketMirrors(state, {
      synchronizeDerivatives: false,
    });
  }
  const receipt = pushReceipt(state, {
    id: nextLocalId(state, 'receipt'),
    type: 'submit_order',
    status,
    reason: null,
    orderId,
    actorId: command.actorId,
    symbol: command.symbol,
    side: command.side,
    orderType,
    requestedQuantity: order.originalQty,
    limitPriceTicks: order.type === 'limit' ? order.priceTicks : null,
    parentOrderId: order.parentOrderId,
    ecologyAgentId: order.ecologyAgentId,
    ecologyIntentKind: order.ecologyIntentKind,
    ...(order.automationKind
      ? {
          automationKind: order.automationKind,
          automationDecisionId: order.automationDecisionId,
          automationStrategyIds: [...order.automationStrategyIds],
        }
      : {}),
    ...(order.orderContextVersion
      ? {
          orderContextVersion: order.orderContextVersion,
          orderContextRegime: order.orderContextRegime,
          orderContextSymbol: order.orderContextSymbol,
          orderContextArrivalBudgetUnits:
            order.orderContextArrivalBudgetUnits,
          orderContextDepthBudgetUnits:
            order.orderContextDepthBudgetUnits,
          orderContextMechanismSources: [
            ...order.orderContextMechanismSources,
          ],
        }
      : {}),
    filledQuantity,
    remainingQuantity: activeOrder(stored) ? stored.remainingQty : 0,
    cancelledQuantity:
      stored.status === 'cancelled' ? stored.remainingQty : 0,
    cancelReason:
      stored.status === 'cancelled'
        ? 'IOC_UNFILLED_REMAINDER'
        : null,
    selfTradeCount: selfTradeFills.length,
    selfTradeQuantity: selfTradeFills.reduce(
      (sum, fill) => sum + fill.quantity,
      0,
    ),
    filledGrossCents: stored.filledGrossCents,
    averageFillPriceTicks:
      filledQuantity > 0
        ? Math.round(stored.filledGrossCents / filledQuantity)
        : null,
    worstFillPriceTicks:
      result.fills.length > 0
        ? result.fills.reduce(
            (worst, fill) =>
              worst === null
                ? fill.priceTicks
                : order.side === 'buy'
                  ? Math.max(worst, fill.priceTicks)
                  : Math.min(worst, fill.priceTicks),
            null,
          )
        : null,
    reservedCashCents: stored.reservedCashCents,
    reservedUnits: stored.reservedUnits,
    tradeIds,
    virtualMs: state.nowMs,
    commitSeq,
  });
  const liveRealtimeTradeCount =
    state.realtimeAuditArchive.liveChainCount;
  if (
    !deferBatchMaintenance &&
    liveRealtimeTradeCount > MAX_LIVE_REALTIME_AUDIT_CHAINS
  ) {
    compactRealtimeAuditOverflow(
      state,
      commitSeq,
      REALTIME_AUDIT_BACKGROUND_TARGET,
    );
  }
  return receipt;
}

function handleCancelOrder(
  state,
  command,
  { deferBatchMaintenance = false } = {},
) {
  const brokerCheck = validateBrokerCommand(state, command);
  if (brokerCheck.reason) {
    return rejectedReceipt(state, 'cancel_order', brokerCheck.reason, {
      actorId: command.actorId,
    });
  }
  const order = findOrder(state, command.orderId);
  if (!order) {
    return rejectedReceipt(state, 'cancel_order', 'ORDER_NOT_FOUND', {
      actorId: command.actorId,
    });
  }
  if (order.brokerId !== command.brokerId) {
    return rejectedReceipt(
      state,
      'cancel_order',
      'BROKER_CLIENT_MISMATCH',
      { actorId: command.actorId },
    );
  }
  const result = cancelInBook(
    state.books[order.symbol],
    command.orderId,
    command.actorId,
  );
  if (!result.cancelled) {
    return rejectedReceipt(state, 'cancel_order', result.reason, {
      actorId: command.actorId,
    });
  }
  const cancelledOrder = result.order;
  const commitSeq = state.commitSeq + 1;
  const releasedCashCents =
    cancelledOrder.reservedCashCents;
  const releasedUnits = cancelledOrder.reservedUnits;
  reconcileOrderReservations(state, [command.orderId]);
  cancelledOrder.commitSeq = commitSeq;
  noteTerminalOrders(state, [command.orderId]);
  brokerCheck.account.commitSeq = commitSeq;
  state.commitSeq = commitSeq;
  if (!deferBatchMaintenance) {
    archiveTerminalOrders(state, cancelledOrder.symbol);
    markAccountRisk(state);
    syncWorldMarketMirrors(state, {
      synchronizeDerivatives: false,
    });
  }
  return pushReceipt(state, {
    id: nextLocalId(state, 'receipt'),
    type: 'cancel_order',
    status: 'cancelled',
    reason: null,
    orderId: command.orderId,
    actorId: command.actorId,
    releasedCashCents:
      cancelledOrder.side === 'buy'
        ? releasedCashCents
        : 0,
    releasedUnits:
      cancelledOrder.side === 'sell'
        ? releasedUnits
        : 0,
    virtualMs: state.nowMs,
    commitSeq,
  });
}

function captureWorldRecordIds(world) {
  return Object.fromEntries(
    ['eventLog', 'ledger', 'facts', 'memories', 'narratives', 'replay'].map(
      (collection) => [
        collection,
        new Set(world[collection].map((record) => record.id)),
      ],
    ),
  );
}

function stampNewWorldRecords(world, previousIds, commitSeq) {
  for (const collection of Object.keys(previousIds)) {
    for (const record of world[collection]) {
      if (!previousIds[collection].has(record.id)) {
        record.commitSeq = commitSeq;
      }
    }
  }
}

function createAuditChainArchive() {
  return {
    format: 'realtime-audit-chain-archive-v1',
    maxLiveChains: MAX_LIVE_REALTIME_AUDIT_CHAINS,
    maxRecentBundles: MAX_RECENT_REALTIME_AUDIT_BUNDLES,
    maxChainReferencesPerBundle:
      MAX_CHAIN_REFERENCES_PER_AUDIT_BUNDLE,
    maxReceiptReferencesPerBundle:
      MAX_RECEIPT_REFERENCES_PER_AUDIT_BUNDLE,
    maxFoldedBlocks: MAX_REALTIME_AUDIT_FOLDED_BLOCKS,
    losslessPayloadVersion:
      REALTIME_AUDIT_LOSSLESS_PAYLOAD_VERSION,
    losslessArchivedBundles: 0,
    losslessArchivedChains: 0,
    losslessArchivedReceipts: 0,
    legacyDigestOnlyBundles: 0,
    legacyDigestOnlyChains: 0,
    legacyDigestOnlyReceipts: 0,
    totalArchivedBundles: 0,
    totalArchivedChains: 0,
    totalArchivedReceipts: 0,
    rollingDigest: '00000000',
    firstTradeId: null,
    lastTradeId: null,
    firstTradeSequence: null,
    lastTradeSequence: null,
    nextBlockSequence: 1,
    liveChainCount: 0,
    slotDomainStartMs: 0,
    recentBundles: [],
    foldedBlocks: [],
    pendingFrame: {
      afterFrameMs: -1,
      tradeCount: 0,
      volume: 0,
    },
  };
}

function realtimeAuditCollections(world) {
  const trades = world.market.trades.filter(
    (trade) =>
      trade.source === 'realtime_order_book' ||
      trade.id?.startsWith('rt_trade_'),
  );
  const events = new Map(
    world.eventLog
      .filter(
        (event) =>
          event.type === 'realtime_market_trade' ||
          event.id?.startsWith('rt_event_'),
      )
      .map((event) => [event.id, event]),
  );
  const journals = new Map(
    world.ledger
      .filter(
        (journal) =>
          journal.type === 'realtime_secondary_trade_settlement' ||
          journal.id?.startsWith('rt_journal_'),
      )
      .map((journal) => [journal.id, journal]),
  );
  const facts = new Map(
    world.facts
      .filter(
        (fact) =>
          fact.type === 'realtime_market_fill' ||
          fact.id?.startsWith('rt_fact_'),
      )
      .map((fact) => [fact.id, fact]),
  );
  const memoriesByFactId = new Map();
  for (const memory of world.memories) {
    if (
      !memory.id?.startsWith('rt_memory_') &&
      !facts.has(memory.factId)
    ) {
      continue;
    }
    const memories = memoriesByFactId.get(memory.factId) ?? [];
    memories.push(memory);
    memoriesByFactId.set(memory.factId, memories);
  }
  return { trades, events, journals, facts, memoriesByFactId };
}

function captureRealtimeAuditChains(world) {
  const { trades, events, journals, facts, memoriesByFactId } =
    realtimeAuditCollections(world);
  return trades
    .map((trade) => {
      const event = events.get(trade.eventId);
      const journal = event
        ? journals.get(event.ledgerEntryIds?.[0])
        : null;
      const fact = facts.get(trade.factId);
      const memories = fact
        ? memoriesByFactId.get(fact.id) ?? []
        : [];
      if (
        !event ||
        event.ledgerEntryIds?.length !== 1 ||
        !journal ||
        !fact ||
        memories.length !== 1
      ) {
        throw new Error(
          `Cannot compact incomplete realtime audit chain ${trade.id}.`,
        );
      }
      return cloneJson({
        trade,
        event,
        journal,
        fact,
        memory: memories[0],
      });
    })
    .sort(
      (left, right) =>
        numericIdSuffix(left.trade.id) -
          numericIdSuffix(right.trade.id) ||
        left.trade.id.localeCompare(right.trade.id),
    );
}

function compactRealtimeAuditOverflow(
  state,
  archiveCommitSeq,
  maxLiveChains = MAX_LIVE_REALTIME_AUDIT_CHAINS,
) {
  if (
    !Number.isSafeInteger(maxLiveChains) ||
    maxLiveChains < 1 ||
    maxLiveChains > MAX_LIVE_REALTIME_AUDIT_CHAINS
  ) {
    throw new RangeError('Invalid realtime audit compaction target.');
  }
  const domain = deriveFixedIntradayTimeDomain(state.nowMs, {
    clockOffsetMs: MARKET_CLOCK_ORIGIN_OFFSET_MS,
  });
  const archive = state.realtimeAuditArchive;
  rollRealtimeAuditSlotDomain(
    state,
    domain.startMs,
  );
  if (archive.liveChainCount <= maxLiveChains) return;
  const current = realtimeAuditCollections(state.world);
  if (
    current.trades.length !==
    archive.liveChainCount
  ) {
    throw new Error(
      'Realtime audit live-chain count diverged from authority.',
    );
  }

  const tradesByCommit = new Map();
  for (const trade of [...current.trades].sort(
    (left, right) =>
      numericIdSuffix(left.id) - numericIdSuffix(right.id) ||
      left.id.localeCompare(right.id),
  )) {
    const trades = tradesByCommit.get(trade.commitSeq) ?? [];
    trades.push(trade);
    tradesByCommit.set(trade.commitSeq, trades);
  }
  const selectedCommits = [];
  let retainedCount = current.trades.length;
  for (const [commitSeq, trades] of tradesByCommit) {
    if (retainedCount <= maxLiveChains) break;
    selectedCommits.push(commitSeq);
    retainedCount -= trades.length;
  }
  const selectedCommitSet = new Set(selectedCommits);
  const bundles = selectedCommits.map((commitSeq) => {
    const chains = tradesByCommit.get(commitSeq).map((trade) => {
      const event = current.events.get(trade.eventId);
      const journal = event
        ? current.journals.get(event.ledgerEntryIds?.[0])
        : null;
      const fact = current.facts.get(trade.factId);
      const memories = fact
        ? current.memoriesByFactId.get(fact.id) ?? []
        : [];
      if (
        !event ||
        event.ledgerEntryIds?.length !== 1 ||
        !journal ||
        !fact ||
        memories.length !== 1
      ) {
        throw new Error(
          `Cannot compact incomplete realtime audit chain ${trade.id}.`,
        );
      }
      return {
        trade,
        event,
        journal,
        fact,
        memory: memories[0],
      };
    });
    return {
      commitSeq,
      chains,
      receipts: state.receipts.filter(
        (receipt) =>
          receipt.commitSeq === commitSeq &&
          Array.isArray(receipt.tradeIds) &&
          receipt.tradeIds.length > 0,
      ),
    };
  });
  const selectedIds = {
    trades: new Set(
      bundles.flatMap((bundle) =>
        bundle.chains.map((chain) => chain.trade.id),
      ),
    ),
    events: new Set(
      bundles.flatMap((bundle) =>
        bundle.chains.map((chain) => chain.event.id),
      ),
    ),
    journals: new Set(
      bundles.flatMap((bundle) =>
        bundle.chains.map((chain) => chain.journal.id),
      ),
    ),
    facts: new Set(
      bundles.flatMap((bundle) =>
        bundle.chains.map((chain) => chain.fact.id),
      ),
    ),
    memories: new Set(
      bundles.flatMap((bundle) =>
        bundle.chains.map((chain) => chain.memory.id),
      ),
    ),
  };
  const archivedReceiptIds = new Set(
    bundles.flatMap((bundle) =>
      bundle.receipts.map((receipt) => receipt.id),
    ),
  );
  archiveRealtimeAuditBundles(state, bundles, archiveCommitSeq);
  // The lossless audit bundle and bounded bar authority already retain every
  // archived fill. Keeping one placeholder in world.market.trades for each
  // archived fill made the supposedly live collection grow with intraday
  // elapsed history and forced every quote/command projection to rescan it.
  // Remove archived trades completely; old checkpoints that contain the
  // former slot records are still cleaned by rollRealtimeAuditSlotDomain.
  state.world.market.trades =
    state.world.market.trades.filter(
      (trade) => !selectedIds.trades.has(trade.id),
    );
  state.world.eventLog = state.world.eventLog.filter(
    (event) => !selectedIds.events.has(event.id),
  );
  state.world.ledger = state.world.ledger.filter(
    (journal) => !selectedIds.journals.has(journal.id),
  );
  state.world.facts = state.world.facts.filter(
    (fact) => !selectedIds.facts.has(fact.id),
  );
  state.world.memories = state.world.memories.filter(
    (memory) => !selectedIds.memories.has(memory.id),
  );
  state.receipts = state.receipts.filter(
    (receipt) => !archivedReceiptIds.has(receipt.id),
  );
  archive.liveChainCount =
    current.trades.length -
    selectedIds.trades.size;
  if (selectedCommitSet.size === 0) {
    throw new Error('Realtime audit overflow did not select a commit bundle.');
  }
}

function rollRealtimeAuditSlotDomain(
  state,
  domainStartMs = deriveFixedIntradayTimeDomain(
    state.nowMs,
    {
      clockOffsetMs:
        MARKET_CLOCK_ORIGIN_OFFSET_MS,
    },
  ).startMs,
) {
  const archive = state.realtimeAuditArchive;
  if (archive.slotDomainStartMs === domainStartMs) {
    return false;
  }
  state.world.market.trades =
    state.world.market.trades.filter(
      (trade) =>
        trade?.source !== REALTIME_AUDIT_SLOT_SOURCE ||
        trade.virtualMs >= domainStartMs,
    );
  archive.slotDomainStartMs = domainStartMs;
  return true;
}

function auditChainDigest(chain) {
  return hashText(
    JSON.stringify({
      trade: chain.trade,
      event: chain.event,
      journal: chain.journal,
      fact: chain.fact,
      memory: chain.memory,
    }),
  );
}

function auditBundleDigest(receipts, chains) {
  return [
    ...receipts.map((receipt) =>
      hashText(JSON.stringify(receipt)),
    ),
    ...chains.map((chain) =>
      chain.digest ?? auditChainDigest(chain),
    ),
  ].reduce(
    (rolling, item) => hashText(`${rolling}|${item}`),
    '00000000',
  );
}

function packRealtimeAuditValue(value) {
  if (Array.isArray(value)) {
    return [
      1,
      ...value.map(packRealtimeAuditValue),
    ];
  }
  if (value && typeof value === 'object') {
    const packed = [0];
    for (const [key, entry] of Object.entries(value)) {
      packed.push(
        REALTIME_AUDIT_PACKED_KEY_INDEX.get(key) ??
          key,
        packRealtimeAuditValue(entry),
      );
    }
    return packed;
  }
  return value;
}

function unpackRealtimeAuditValue(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return value;
  }
  if (value[0] === 1) {
    return value
      .slice(1)
      .map(unpackRealtimeAuditValue);
  }
  if (
    value[0] !== 0 ||
    value.length % 2 !== 1
  ) {
    throw new Error(
      'INVALID_REALTIME_AUDIT_LOSSLESS_PAYLOAD',
    );
  }
  const unpacked = {};
  for (let index = 1; index < value.length; index += 2) {
    const packedKey = value[index];
    const key =
      Number.isSafeInteger(packedKey)
        ? REALTIME_AUDIT_PACKED_KEYS[packedKey]
        : packedKey;
    if (
      typeof key !== 'string' ||
      key.length === 0
    ) {
      throw new Error(
        'INVALID_REALTIME_AUDIT_LOSSLESS_PAYLOAD',
      );
    }
    Object.defineProperty(unpacked, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: unpackRealtimeAuditValue(
        value[index + 1],
      ),
    });
  }
  return unpacked;
}

function encodeLosslessAuditBundle({
  commitSeq,
  receipts,
  chains,
  digest,
}) {
  const decoded = {
    version: REALTIME_AUDIT_LOSSLESS_PAYLOAD_VERSION,
    commitSeq,
    receipts: cloneJson(receipts),
    chains: cloneJson(chains),
    digest,
  };
  const payload = JSON.stringify([
    REALTIME_AUDIT_PACKED_PAYLOAD_VERSION,
    packRealtimeAuditValue(decoded),
  ]);
  return {
    payload,
    payloadDigest: hashText(payload),
  };
}

function decodeLosslessAuditBundle(
  payload,
  expectedPayloadDigest = null,
) {
  if (
    typeof payload !== 'string' ||
    payload.length === 0 ||
    (
      expectedPayloadDigest !== null &&
      hashText(payload) !== expectedPayloadDigest
    )
  ) {
    throw new Error('INVALID_REALTIME_AUDIT_LOSSLESS_PAYLOAD');
  }
  let decoded;
  try {
    decoded = JSON.parse(payload);
    if (Array.isArray(decoded)) {
      if (
        decoded.length !== 2 ||
        decoded[0] !==
          REALTIME_AUDIT_PACKED_PAYLOAD_VERSION
      ) {
        throw new Error(
          'INVALID_REALTIME_AUDIT_LOSSLESS_PAYLOAD',
        );
      }
      decoded = unpackRealtimeAuditValue(decoded[1]);
    }
  } catch {
    throw new Error('INVALID_REALTIME_AUDIT_LOSSLESS_PAYLOAD');
  }
  if (
    !decoded ||
    decoded.version !== REALTIME_AUDIT_LOSSLESS_PAYLOAD_VERSION ||
    !Number.isSafeInteger(decoded.commitSeq) ||
    decoded.commitSeq < 1 ||
    !Array.isArray(decoded.receipts) ||
    decoded.receipts.length < 1 ||
    !Array.isArray(decoded.chains) ||
    decoded.chains.length < 1 ||
    typeof decoded.digest !== 'string' ||
    !/^[0-9a-f]{8}$/.test(decoded.digest)
  ) {
    throw new Error('INVALID_REALTIME_AUDIT_LOSSLESS_PAYLOAD');
  }
  let previousTradeSequence = 0;
  const tradeIds = new Set();
  const recordIds = new Set();
  for (const chain of decoded.chains) {
    const tradeSequence = numericIdSuffix(chain?.trade?.id);
    const records = [
      chain?.trade,
      chain?.event,
      chain?.journal,
      chain?.fact,
      chain?.memory,
    ];
    if (
      !isCompleteRealtimeAuditChain(chain, decoded.commitSeq) ||
      chain.digest !== auditChainDigest(chain) ||
      !Number.isSafeInteger(tradeSequence) ||
      tradeSequence <= previousTradeSequence ||
      records.some(
        (record) =>
          typeof record?.id !== 'string' ||
          recordIds.has(record.id),
      )
    ) {
      throw new Error('INVALID_REALTIME_AUDIT_LOSSLESS_PAYLOAD');
    }
    for (const record of records) recordIds.add(record.id);
    tradeIds.add(chain.trade.id);
    previousTradeSequence = tradeSequence;
  }
  const receiptIds = new Set();
  for (const receipt of decoded.receipts) {
    if (
      !receipt ||
      typeof receipt.id !== 'string' ||
      receiptIds.has(receipt.id) ||
      receipt.commitSeq !== decoded.commitSeq ||
      !Array.isArray(receipt.tradeIds) ||
      receipt.tradeIds.length < 1 ||
      receipt.tradeIds.some((tradeId) => !tradeIds.has(tradeId))
    ) {
      throw new Error('INVALID_REALTIME_AUDIT_LOSSLESS_PAYLOAD');
    }
    receiptIds.add(receipt.id);
  }
  if (
    auditBundleDigest(decoded.receipts, decoded.chains) !==
    decoded.digest
  ) {
    throw new Error('INVALID_REALTIME_AUDIT_LOSSLESS_PAYLOAD');
  }
  return decoded;
}

function losslessAuditPayloadSummary({
  payloadDigest,
  commitSeq,
  receipts,
  chains,
  digest,
}) {
  return {
    payloadDigest,
    commitSeq,
    chainCount: chains.length,
    receiptCount: receipts.length,
    firstTradeId: chains[0]?.trade?.id ?? null,
    lastTradeId:
      chains.at(-1)?.trade?.id ?? null,
    digest,
    recordIds: [
      ...receipts.map((receipt) => receipt.id),
      ...chains.flatMap((chain) => [
        chain.trade.id,
        chain.event.id,
        chain.journal.id,
        chain.fact.id,
        chain.memory.id,
      ]),
    ],
  };
}

function cacheVerifiedLosslessAuditPayload(
  state,
  payload,
  summary,
) {
  let cache =
    verifiedRealtimeAuditPayloadSummaries.get(state);
  if (!cache) {
    cache = new Map();
    verifiedRealtimeAuditPayloadSummaries.set(state, cache);
  }
  cache.set(payload, summary);
  return summary;
}

function verifiedLosslessAuditPayloadSummary(
  state,
  payload,
  expectedPayloadDigest = null,
  { reuseVerified = false } = {},
) {
  const cache =
    verifiedRealtimeAuditPayloadSummaries.get(state);
  const cached = cache?.get(payload);
  if (reuseVerified && cached) {
    if (
      expectedPayloadDigest !== null &&
      cached.payloadDigest !== expectedPayloadDigest
    ) {
      throw new Error(
        'INVALID_REALTIME_AUDIT_LOSSLESS_PAYLOAD',
      );
    }
    return cached;
  }
  const decoded = decodeLosslessAuditBundle(
    payload,
    expectedPayloadDigest,
  );
  return cacheVerifiedLosslessAuditPayload(
    state,
    payload,
    losslessAuditPayloadSummary({
      payloadDigest:
        expectedPayloadDigest ?? hashText(payload),
      commitSeq: decoded.commitSeq,
      receipts: decoded.receipts,
      chains: decoded.chains,
      digest: decoded.digest,
    }),
  );
}

function lz4Hash(bytes, index) {
  const value =
    (
      bytes[index] |
      (bytes[index + 1] << 8) |
      (bytes[index + 2] << 16) |
      (bytes[index + 3] << 24)
    ) >>> 0;
  return (
    Math.imul(value, 0x9e3779b1) >>> 16
  ) & 0xffff;
}

function encodeLz4Block(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('LZ4 input must be bytes.');
  }
  const output = [];
  const positions = new Int32Array(65_536);
  let anchor = 0;
  let index = 0;
  const appendLength = (length) => {
    let remaining = length;
    while (remaining >= 255) {
      output.push(255);
      remaining -= 255;
    }
    output.push(remaining);
  };

  while (index + 4 <= bytes.length) {
    const hash = lz4Hash(bytes, index);
    const reference = positions[hash] - 1;
    positions[hash] = index + 1;
    if (
      reference < 0 ||
      index - reference > 65_535 ||
      bytes[reference] !== bytes[index] ||
      bytes[reference + 1] !== bytes[index + 1] ||
      bytes[reference + 2] !== bytes[index + 2] ||
      bytes[reference + 3] !== bytes[index + 3]
    ) {
      index += 1;
      continue;
    }

    let matchLength = 4;
    while (
      index + matchLength < bytes.length &&
      bytes[reference + matchLength] ===
        bytes[index + matchLength]
    ) {
      matchLength += 1;
    }
    const literalLength = index - anchor;
    const tokenIndex = output.length;
    output.push(0);
    output[tokenIndex] =
      Math.min(15, literalLength) << 4 |
      Math.min(15, matchLength - 4);
    if (literalLength >= 15) {
      appendLength(literalLength - 15);
    }
    for (let cursor = anchor; cursor < index; cursor += 1) {
      output.push(bytes[cursor]);
    }
    const offset = index - reference;
    output.push(offset & 0xff, offset >>> 8);
    if (matchLength - 4 >= 15) {
      appendLength(matchLength - 4 - 15);
    }
    index += matchLength;
    anchor = index;
    for (
      let cursor = Math.max(anchor - 3, 0);
      cursor < anchor && cursor + 4 <= bytes.length;
      cursor += 1
    ) {
      positions[lz4Hash(bytes, cursor)] =
        cursor + 1;
    }
  }

  const literalLength = bytes.length - anchor;
  const tokenIndex = output.length;
  output.push(Math.min(15, literalLength) << 4);
  if (literalLength >= 15) {
    appendLength(literalLength - 15);
  }
  for (let cursor = anchor; cursor < bytes.length; cursor += 1) {
    output.push(bytes[cursor]);
  }
  return Uint8Array.from(output);
}

function decodeLz4Block(bytes, uncompressedLength) {
  if (
    !(bytes instanceof Uint8Array) ||
    !Number.isSafeInteger(uncompressedLength) ||
    uncompressedLength < 0
  ) {
    throw new Error('INVALID_REALTIME_AUDIT_COMPRESSED_PAYLOAD');
  }
  const output = new Uint8Array(uncompressedLength);
  let sourceIndex = 0;
  let outputIndex = 0;
  const readExtendedLength = (baseLength) => {
    let length = baseLength;
    if (baseLength !== 15) return length;
    while (true) {
      if (sourceIndex >= bytes.length) {
        throw new Error(
          'INVALID_REALTIME_AUDIT_COMPRESSED_PAYLOAD',
        );
      }
      const value = bytes[sourceIndex++];
      length += value;
      if (value !== 255) return length;
    }
  };

  while (sourceIndex < bytes.length) {
    const token = bytes[sourceIndex++];
    const literalLength = readExtendedLength(
      token >>> 4,
    );
    if (
      sourceIndex + literalLength > bytes.length ||
      outputIndex + literalLength > output.length
    ) {
      throw new Error(
        'INVALID_REALTIME_AUDIT_COMPRESSED_PAYLOAD',
      );
    }
    output.set(
      bytes.subarray(
        sourceIndex,
        sourceIndex + literalLength,
      ),
      outputIndex,
    );
    sourceIndex += literalLength;
    outputIndex += literalLength;
    if (sourceIndex === bytes.length) break;
    if (sourceIndex + 2 > bytes.length) {
      throw new Error(
        'INVALID_REALTIME_AUDIT_COMPRESSED_PAYLOAD',
      );
    }
    const offset =
      bytes[sourceIndex] |
      (bytes[sourceIndex + 1] << 8);
    sourceIndex += 2;
    if (offset < 1 || offset > outputIndex) {
      throw new Error(
        'INVALID_REALTIME_AUDIT_COMPRESSED_PAYLOAD',
      );
    }
    const matchLength =
      readExtendedLength(token & 0x0f) + 4;
    if (outputIndex + matchLength > output.length) {
      throw new Error(
        'INVALID_REALTIME_AUDIT_COMPRESSED_PAYLOAD',
      );
    }
    for (let copied = 0; copied < matchLength; copied += 1) {
      output[outputIndex] =
        output[outputIndex - offset];
      outputIndex += 1;
    }
  }
  if (
    sourceIndex !== bytes.length ||
    outputIndex !== output.length
  ) {
    throw new Error('INVALID_REALTIME_AUDIT_COMPRESSED_PAYLOAD');
  }
  return output;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 32_768) {
    binary += String.fromCharCode(
      ...bytes.subarray(index, index + 32_768),
    );
  }
  return globalThis.btoa(binary);
}

function base64ToBytes(value) {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function compressLosslessPayloads(payloads) {
  const source = new TextEncoder().encode(
    JSON.stringify(payloads),
  );
  return {
    encoded: bytesToBase64(encodeLz4Block(source)),
    uncompressedBytes: source.length,
  };
}

function decompressLosslessPayloads(block, state = null) {
  const compressedPayload =
    typeof block?.compressedLosslessPayloads === 'string'
      ? block.compressedLosslessPayloads
      : realtimeAuditColdRecordValue(
          state,
          block?.compressedLosslessPayloads,
          'payload',
        );
  if (
    block?.losslessPayloadEncoding !==
      REALTIME_AUDIT_BLOCK_PAYLOAD_ENCODING ||
    compressedPayload.length === 0 ||
    !Number.isSafeInteger(
      block.losslessPayloadUncompressedBytes,
    ) ||
    block.losslessPayloadUncompressedBytes < 2 ||
    !Number.isSafeInteger(block.losslessPayloadCount) ||
    block.losslessPayloadCount < 1
  ) {
    throw new Error('INVALID_REALTIME_AUDIT_COMPRESSED_PAYLOAD');
  }
  let payloads;
  try {
    const decoded = decodeLz4Block(
      base64ToBytes(
        compressedPayload,
      ),
      block.losslessPayloadUncompressedBytes,
    );
    payloads = JSON.parse(
      new TextDecoder('utf-8', {
        fatal: true,
      }).decode(decoded),
    );
  } catch {
    throw new Error('INVALID_REALTIME_AUDIT_COMPRESSED_PAYLOAD');
  }
  if (
    !Array.isArray(payloads) ||
    payloads.length !== block.losslessPayloadCount ||
    payloads.some(
      (payload) =>
        typeof payload !== 'string' ||
        payload.length === 0,
    )
  ) {
    throw new Error('INVALID_REALTIME_AUDIT_COMPRESSED_PAYLOAD');
  }
  return payloads;
}

function losslessPayloadsFromBlock(block, state = null) {
  const resolved = resolveRealtimeAuditColdBlock(
    state,
    block,
  );
  if (resolved !== block) {
    return losslessPayloadsFromBlock(resolved, state);
  }
  if (Array.isArray(block?.children)) {
    return block.children.flatMap(
      (child) => losslessPayloadsFromBlock(child, state),
    );
  }
  if (
    block?.losslessPayloadEncoding ===
    REALTIME_AUDIT_BLOCK_PAYLOAD_ENCODING
  ) {
    return decompressLosslessPayloads(block, state);
  }
  return Array.isArray(block?.losslessPayloads)
    ? block.losslessPayloads
    : [];
}

function auditBlockBranchDigest(children) {
  return children.reduce(
    (digest, item) =>
      hashText(
        `${digest}|${item.id}|${item.digest}`,
      ),
    '00000000',
  );
}

function auditBlockBranchPayloadDigest(children) {
  return hashText(
    JSON.stringify(
      children.map((item) => ({
        id: item.id,
        bundleCount: item.bundleCount,
        chainCount: item.chainCount,
        receiptCount: item.receiptCount,
        losslessBundleCount:
          item.losslessBundleCount,
        losslessChainCount:
          item.losslessChainCount,
        losslessReceiptCount:
          item.losslessReceiptCount,
        payloadDigest:
          item.losslessPayloadDigest,
      })),
    ),
  );
}

function archivedLosslessPayloads(archive, state = null) {
  return [
    ...(archive?.foldedBlocks ?? []).flatMap(
      (block) => losslessPayloadsFromBlock(block, state),
    ),
    ...(archive?.recentBundles ?? [])
      .map((bundle) => bundle?.losslessPayload)
      .filter((payload) => typeof payload === 'string'),
  ];
}

function losslessAuditTotals(payloads) {
  const decoded = payloads.map((payload) =>
    decodeLosslessAuditBundle(payload));
  return {
    decoded,
    bundles: decoded.length,
    chains: decoded.reduce(
      (sum, bundle) => sum + bundle.chains.length,
      0,
    ),
    receipts: decoded.reduce(
      (sum, bundle) => sum + bundle.receipts.length,
      0,
    ),
  };
}

function hydrateRealtimeAuditArchiveLosslessFields(state) {
  const archive = state.realtimeAuditArchive;
  if (!archive || typeof archive !== 'object') return;
  if (!Number.isSafeInteger(archive.liveChainCount)) {
    archive.liveChainCount =
      realtimeAuditCollections(state.world).trades.length;
  }
  if (!Number.isSafeInteger(archive.slotDomainStartMs)) {
    archive.slotDomainStartMs =
      deriveFixedIntradayTimeDomain(state.nowMs, {
        clockOffsetMs:
          MARKET_CLOCK_ORIGIN_OFFSET_MS,
      }).startMs;
  }
  function hydrateBlock(block) {
    if (!Array.isArray(block.losslessPayloads)) {
      block.losslessPayloads = [];
    }
    if (isRealtimeAuditColdBlockReference(block)) {
      return {
        bundles: block.losslessBundleCount,
        chains: block.losslessChainCount,
        receipts: block.losslessReceiptCount,
      };
    }
    if (
      validRealtimeAuditColdReference(
        block.compressedLosslessPayloads,
        'payload',
      ) &&
      realtimeAuditColdReferenceKnown(
        state,
        block.compressedLosslessPayloads,
        'payload',
      ) &&
      !realtimeAuditColdStoreCanRead(state)
    ) {
      return {
        bundles: block.losslessBundleCount,
        chains: block.losslessChainCount,
        receipts: block.losslessReceiptCount,
      };
    }
    if (Array.isArray(block.children)) {
      for (const child of block.children) {
        hydrateBlock(child);
      }
      block.losslessBundleCount =
        block.children.reduce(
          (sum, child) =>
            sum + child.losslessBundleCount,
          0,
        );
      block.losslessChainCount =
        block.children.reduce(
          (sum, child) =>
            sum + child.losslessChainCount,
          0,
        );
      block.losslessReceiptCount =
        block.children.reduce(
          (sum, child) =>
            sum + child.losslessReceiptCount,
          0,
        );
      if (
        typeof block.losslessPayloadDigest !==
        'string'
      ) {
        block.losslessPayloadDigest =
          auditBlockBranchPayloadDigest(
            block.children,
          );
      }
      return {
        bundles: block.losslessBundleCount,
        chains: block.losslessChainCount,
        receipts: block.losslessReceiptCount,
      };
    }
    const compressed =
      block.losslessPayloadEncoding ===
      REALTIME_AUDIT_BLOCK_PAYLOAD_ENCODING;
    const payloads = compressed
      ? decompressLosslessPayloads(block, state)
      : block.losslessPayloads;
    const totals = losslessAuditTotals(payloads);
    block.losslessBundleCount = totals.bundles;
    block.losslessChainCount = totals.chains;
    block.losslessReceiptCount = totals.receipts;
    if (typeof block.losslessPayloadDigest !== 'string') {
      block.losslessPayloadDigest = compressed
        ? hashText(
            block.compressedLosslessPayloads,
          )
        : hashText(
            JSON.stringify(block.losslessPayloads),
          );
    }
    return {
      bundles: block.losslessBundleCount,
      chains: block.losslessChainCount,
      receipts: block.losslessReceiptCount,
    };
  }
  const totals = {
    bundles: 0,
    chains: 0,
    receipts: 0,
  };
  for (const block of archive.foldedBlocks ?? []) {
    const blockTotals = hydrateBlock(block);
    totals.bundles += blockTotals.bundles;
    totals.chains += blockTotals.chains;
    totals.receipts += blockTotals.receipts;
  }
  for (const bundle of archive.recentBundles ?? []) {
    if (typeof bundle?.losslessPayload !== 'string') {
      continue;
    }
    const decoded = decodeLosslessAuditBundle(
      bundle.losslessPayload,
      bundle.losslessPayloadDigest ?? null,
    );
    totals.bundles += 1;
    totals.chains += decoded.chains.length;
    totals.receipts += decoded.receipts.length;
  }
  if (!Number.isSafeInteger(archive.losslessPayloadVersion)) {
    archive.losslessPayloadVersion =
      REALTIME_AUDIT_LOSSLESS_PAYLOAD_VERSION;
  }
  if (!Number.isSafeInteger(archive.losslessArchivedBundles)) {
    archive.losslessArchivedBundles = totals.bundles;
  }
  if (!Number.isSafeInteger(archive.losslessArchivedChains)) {
    archive.losslessArchivedChains = totals.chains;
  }
  if (!Number.isSafeInteger(archive.losslessArchivedReceipts)) {
    archive.losslessArchivedReceipts = totals.receipts;
  }
  if (!Number.isSafeInteger(archive.legacyDigestOnlyBundles)) {
    archive.legacyDigestOnlyBundles =
      archive.totalArchivedBundles - totals.bundles;
  }
  if (!Number.isSafeInteger(archive.legacyDigestOnlyChains)) {
    archive.legacyDigestOnlyChains =
      archive.totalArchivedChains - totals.chains;
  }
  if (!Number.isSafeInteger(archive.legacyDigestOnlyReceipts)) {
    archive.legacyDigestOnlyReceipts =
      archive.totalArchivedReceipts - totals.receipts;
  }
}

export function materializeRealtimeAuditArchive(state) {
  const archive = state?.realtimeAuditArchive ?? state;
  if (!archive || typeof archive !== 'object') {
    throw new TypeError('A realtime audit archive is required.');
  }
  const totals = losslessAuditTotals(
    archivedLosslessPayloads(
      archive,
      state?.realtimeAuditArchive ? state : null,
    ),
  );
  if (
    totals.bundles !== archive.losslessArchivedBundles ||
    totals.chains !== archive.losslessArchivedChains ||
    totals.receipts !== archive.losslessArchivedReceipts
  ) {
    throw new Error('INVALID_REALTIME_AUDIT_LOSSLESS_TOTALS');
  }
  const entries = [...totals.decoded].sort(
    (left, right) => left.commitSeq - right.commitSeq,
  );
  const chains = entries
    .flatMap((entry) => entry.chains)
    .sort(
      (left, right) =>
        numericIdSuffix(left.trade.id) -
          numericIdSuffix(right.trade.id) ||
        left.trade.id.localeCompare(right.trade.id),
    );
  const receipts = entries
    .flatMap((entry) => entry.receipts)
    .sort(
      (left, right) =>
        left.commitSeq - right.commitSeq ||
        left.id.localeCompare(right.id),
    );
  return {
    complete:
      archive.legacyDigestOnlyBundles === 0 &&
      archive.legacyDigestOnlyChains === 0 &&
      archive.legacyDigestOnlyReceipts === 0 &&
      totals.bundles === archive.totalArchivedBundles &&
      totals.chains === archive.totalArchivedChains &&
      totals.receipts === archive.totalArchivedReceipts,
    archivedBundleCount: archive.totalArchivedBundles,
    legacyDigestOnlyBundles: archive.legacyDigestOnlyBundles,
    legacyDigestOnlyChains: archive.legacyDigestOnlyChains,
    legacyDigestOnlyReceipts: archive.legacyDigestOnlyReceipts,
    receipts,
    chains,
  };
}

function foldArchivedBundles(state) {
  const archive = state.realtimeAuditArchive;
  if (archive.recentBundles.length <= archive.maxRecentBundles) return;
  // Fold one complete bounded hot batch. The previous one-bundle overflow
  // produced thousands of tiny cold leaves and forfeited cross-bundle LZ4
  // repetition. This keeps recent authority bounded while making leaf count
  // depend on bounded batches rather than individual elapsed commits.
  const overflowCount = Math.max(
    archive.recentBundles.length - archive.maxRecentBundles,
    Math.min(
      archive.maxRecentBundles,
      archive.recentBundles.length,
    ),
  );
  const overflow = archive.recentBundles.splice(
    0,
    overflowCount,
  );
  const losslessPayloads = overflow
    .map((bundle) => bundle.losslessPayload)
    .filter((payload) => typeof payload === 'string');
  const compressedLosslessPayloads =
    compressLosslessPayloads(losslessPayloads);
  const verifiedPayloads =
    verifiedRealtimeAuditPayloadSummaries.get(state);
  for (const payload of losslessPayloads) {
    verifiedPayloads?.delete(payload);
  }
  const block = {
    id: `rt_chain_archive_block_${String(
      archive.nextBlockSequence++,
    ).padStart(8, '0')}`,
    bundleCount: overflow.length,
    chainCount: overflow.reduce(
      (sum, bundle) => sum + bundle.chainCount,
      0,
    ),
    receiptCount: overflow.reduce(
      (sum, bundle) => sum + bundle.receiptCount,
      0,
    ),
    fromTradeId: overflow[0].firstTradeId,
    toTradeId: overflow.at(-1).lastTradeId,
    fromTradeSequence: overflow[0].firstTradeSequence,
    toTradeSequence: overflow.at(-1).lastTradeSequence,
    fromCommitSeq: overflow[0].commitSeq,
    toCommitSeq: overflow.at(-1).commitSeq,
    digest: overflow.reduce(
      (digest, bundle) =>
        hashText(`${digest}|${bundle.commitSeq}|${bundle.digest}`),
      '00000000',
    ),
    losslessPayloads: [],
    losslessPayloadEncoding:
      REALTIME_AUDIT_BLOCK_PAYLOAD_ENCODING,
    compressedLosslessPayloads:
      compressedLosslessPayloads.encoded,
    losslessPayloadUncompressedBytes:
      compressedLosslessPayloads.uncompressedBytes,
    losslessPayloadCount: losslessPayloads.length,
    losslessBundleCount: losslessPayloads.length,
    losslessChainCount: overflow.reduce(
      (sum, bundle) =>
        sum +
        (
          typeof bundle.losslessPayload === 'string'
            ? bundle.chainCount
            : 0
        ),
      0,
    ),
    losslessReceiptCount: overflow.reduce(
      (sum, bundle) =>
        sum +
        (
          typeof bundle.losslessPayload === 'string'
            ? bundle.receiptCount
            : 0
        ),
      0,
    ),
    losslessPayloadDigest: hashText(
      compressedLosslessPayloads.encoded,
    ),
  };
  externalizeRealtimeAuditPayload(state, block);
  verifiedRealtimeAuditBlocks.add(block);
  archive.foldedBlocks.push(block);
  while (
    archive.foldedBlocks.length >
    archive.maxFoldedBlocks
  ) {
    let mergeIndex = 0;
    let mergeWeight = Number.POSITIVE_INFINITY;
    for (
      let index = 0;
      index < archive.foldedBlocks.length - 1;
      index += 1
    ) {
      const left = archive.foldedBlocks[index];
      const right = archive.foldedBlocks[index + 1];
      const weight =
        left.chainCount +
        left.receiptCount +
        right.chainCount +
        right.receiptCount;
      if (weight < mergeWeight) {
        mergeIndex = index;
        mergeWeight = weight;
      }
    }
    const blocksToFold = archive.foldedBlocks.splice(
      mergeIndex,
      2,
    );
    const coldChildren = blocksToFold.map((block) =>
      externalizeRealtimeAuditBlock(state, block),
    );
    const mergedBlock = {
      id: `rt_chain_archive_block_${String(
        archive.nextBlockSequence++,
      ).padStart(8, '0')}`,
      bundleCount: blocksToFold.reduce(
        (sum, item) => sum + item.bundleCount,
        0,
      ),
      chainCount: blocksToFold.reduce(
        (sum, item) => sum + item.chainCount,
        0,
      ),
      receiptCount: blocksToFold.reduce(
        (sum, item) => sum + item.receiptCount,
        0,
      ),
      fromTradeId: blocksToFold[0].fromTradeId,
      toTradeId: blocksToFold.at(-1).toTradeId,
      fromTradeSequence:
        blocksToFold[0].fromTradeSequence,
      toTradeSequence:
        blocksToFold.at(-1).toTradeSequence,
      fromCommitSeq: blocksToFold[0].fromCommitSeq,
      toCommitSeq: blocksToFold.at(-1).toCommitSeq,
      digest: auditBlockBranchDigest(
        coldChildren,
      ),
      children: coldChildren,
      losslessPayloads: [],
      losslessBundleCount: blocksToFold.reduce(
        (sum, item) =>
          sum + item.losslessBundleCount,
        0,
      ),
      losslessChainCount: blocksToFold.reduce(
        (sum, item) =>
          sum + item.losslessChainCount,
        0,
      ),
      losslessReceiptCount: blocksToFold.reduce(
        (sum, item) =>
          sum + item.losslessReceiptCount,
        0,
      ),
      losslessPayloadDigest:
        auditBlockBranchPayloadDigest(
          coldChildren,
        ),
    };
    verifiedRealtimeAuditBlocks.add(mergedBlock);
    archive.foldedBlocks.splice(
      mergeIndex,
      0,
      mergedBlock,
    );
  }
}

function receiptArchiveReference(receipt) {
  return {
    id: receipt.id,
    type: receipt.type,
    status: receipt.status,
    commitSeq: receipt.commitSeq,
    tradeCount: receipt.tradeIds.length,
    firstTradeId: receipt.tradeIds[0],
    lastTradeId: receipt.tradeIds.at(-1),
    digest: hashText(JSON.stringify(receipt)),
  };
}

function archiveRealtimeAuditBundles(state, bundles, archiveCommitSeq) {
  const archive = state.realtimeAuditArchive;
  for (const sourceBundle of bundles) {
    const chains = sourceBundle.chains.map((chain) => ({
      ...cloneJson(chain),
      digest: auditChainDigest(chain),
    }));
    archiveWorldlineSourceEvidence(
      state.world.worldline,
      {
        eventIds: chains.map((chain) => chain.event.id),
        factIds: chains.map((chain) => chain.fact.id),
      },
    );
    const receiptReferences = sourceBundle.receipts
      .slice(-archive.maxReceiptReferencesPerBundle)
      .map(receiptArchiveReference);
    const chainReferences = chains.slice(
      -archive.maxChainReferencesPerBundle,
    );
    const firstChain = chains[0];
    const lastChain = chains.at(-1);
    const digest = auditBundleDigest(
      sourceBundle.receipts,
      chains,
    );
    const {
      payload: losslessPayload,
      payloadDigest: losslessPayloadDigest,
    } = encodeLosslessAuditBundle({
      commitSeq: sourceBundle.commitSeq,
      receipts: sourceBundle.receipts,
      chains,
      digest,
    });
    cacheVerifiedLosslessAuditPayload(
      state,
      losslessPayload,
      losslessAuditPayloadSummary({
        payloadDigest: losslessPayloadDigest,
        commitSeq: sourceBundle.commitSeq,
        receipts: sourceBundle.receipts,
        chains,
        digest,
      }),
    );
    const bundle = {
      commitSeq: sourceBundle.commitSeq,
      archivedAtTick: state.world.world.tick,
      archivedAtMs: state.nowMs,
      archivedAtCommitSeq: archiveCommitSeq,
      receiptCount: sourceBundle.receipts.length,
      chainCount: chains.length,
      statusCounts: Object.fromEntries(
        [...new Set(sourceBundle.receipts.map(
          (receipt) => receipt.status,
        ))].map((status) => [
          status,
          sourceBundle.receipts.filter(
            (receipt) => receipt.status === status,
          ).length,
        ]),
      ),
      firstTradeId: firstChain.trade.id,
      lastTradeId: lastChain.trade.id,
      firstTradeSequence: numericIdSuffix(firstChain.trade.id),
      lastTradeSequence: numericIdSuffix(lastChain.trade.id),
      receiptReferences,
      chainReferences,
      referenceDigest: hashText(
        JSON.stringify({ receiptReferences, chainReferences }),
      ),
      losslessPayload,
      losslessPayloadDigest,
      digest,
    };
    if (archive.totalArchivedBundles === 0) {
      archive.firstTradeId = bundle.firstTradeId;
      archive.firstTradeSequence = bundle.firstTradeSequence;
    }
    archive.lastTradeId = bundle.lastTradeId;
    archive.lastTradeSequence = bundle.lastTradeSequence;
    archive.totalArchivedBundles += 1;
    archive.totalArchivedChains += bundle.chainCount;
    archive.totalArchivedReceipts += bundle.receiptCount;
    archive.losslessArchivedBundles += 1;
    archive.losslessArchivedChains += bundle.chainCount;
    archive.losslessArchivedReceipts += bundle.receiptCount;
    archive.rollingDigest = hashText(
      `${archive.rollingDigest}|${bundle.commitSeq}|${bundle.digest}`,
    );
    const lastPublishedFrameMs =
      state.quoteFrames.at(-1)?.virtualMs ?? -1;
    const unpublishedChains = chains.filter(
      (chain) => chain.trade.virtualMs > lastPublishedFrameMs,
    );
    archive.pendingFrame.afterFrameMs = lastPublishedFrameMs;
    archive.pendingFrame.tradeCount += unpublishedChains.length;
    archive.pendingFrame.volume += unpublishedChains.reduce(
      (sum, chain) => sum + chain.trade.quantity,
      0,
    );
    archive.recentBundles.push(bundle);
  }
  foldArchivedBundles(state);
}

function advanceRealtimeMemory(memory, worldTick, commitSeq) {
  const next = cloneJson(memory);
  if (next.lastRecalledTick !== worldTick) {
    next.salience = Number(
      Math.max(0.05, next.salience * (1 - next.decay)).toFixed(6),
    );
    next.lastMutationCommitSeq = commitSeq;
  }
  return next;
}

function reconcileRealtimeAuditChains(
  state,
  previousChains,
  commitSeq,
) {
  if (previousChains.length === 0) return;
  const current = realtimeAuditCollections(state.world);
  const priorIds = {
    trades: new Set(previousChains.map((chain) => chain.trade.id)),
    events: new Set(previousChains.map((chain) => chain.event.id)),
    journals: new Set(previousChains.map((chain) => chain.journal.id)),
    facts: new Set(previousChains.map((chain) => chain.fact.id)),
    memories: new Set(previousChains.map((chain) => chain.memory.id)),
  };
  const refreshedChains = previousChains.map((chain) => {
    const currentMemory = (
      current.memoriesByFactId.get(chain.fact.id) ?? []
    )[0];
    return {
      trade: cloneJson(
        current.trades.find((trade) => trade.id === chain.trade.id) ??
          chain.trade,
      ),
      event: cloneJson(current.events.get(chain.event.id) ?? chain.event),
      journal: cloneJson(
        current.journals.get(chain.journal.id) ?? chain.journal,
      ),
      fact: cloneJson(current.facts.get(chain.fact.id) ?? chain.fact),
      memory: currentMemory
        ? cloneJson(currentMemory)
        : advanceRealtimeMemory(
            chain.memory,
            state.world.world.tick,
            commitSeq,
          ),
    };
  });

  state.world.market.trades = state.world.market.trades.filter(
    (trade) => !priorIds.trades.has(trade.id),
  );
  state.world.eventLog = state.world.eventLog.filter(
    (event) => !priorIds.events.has(event.id),
  );
  state.world.ledger = state.world.ledger.filter(
    (journal) => !priorIds.journals.has(journal.id),
  );
  state.world.facts = state.world.facts.filter(
    (fact) => !priorIds.facts.has(fact.id),
  );
  state.world.memories = state.world.memories.filter(
    (memory) => !priorIds.memories.has(memory.id),
  );

  const bundlesByCommit = new Map();
  for (const chain of refreshedChains) {
    const bundle = bundlesByCommit.get(chain.trade.commitSeq) ?? {
      commitSeq: chain.trade.commitSeq,
      chains: [],
      receipts: [],
    };
    bundle.chains.push(chain);
    bundlesByCommit.set(bundle.commitSeq, bundle);
  }
  for (const receipt of state.receipts) {
    if (!Array.isArray(receipt.tradeIds) || receipt.tradeIds.length === 0) {
      continue;
    }
    const bundle = bundlesByCommit.get(receipt.commitSeq);
    if (bundle) bundle.receipts.push(receipt);
  }
  const bundles = [...bundlesByCommit.values()].sort(
    (left, right) => left.commitSeq - right.commitSeq,
  );
  let liveChainCount = bundles.reduce(
    (sum, bundle) => sum + bundle.chains.length,
    0,
  );
  const bundlesToArchive = [];
  const bundlesToKeep = [];
  for (const bundle of bundles) {
    if (liveChainCount > MAX_LIVE_REALTIME_AUDIT_CHAINS) {
      bundlesToArchive.push(bundle);
      liveChainCount -= bundle.chains.length;
    } else {
      bundlesToKeep.push(bundle);
    }
  }
  const archivedReceiptIds = new Set(
    bundlesToArchive.flatMap((bundle) =>
      bundle.receipts.map((receipt) => receipt.id),
    ),
  );
  state.receipts = state.receipts.filter(
    (receipt) => !archivedReceiptIds.has(receipt.id),
  );
  archiveRealtimeAuditBundles(state, bundlesToArchive, commitSeq);
  for (const bundle of bundlesToKeep) {
    for (const chain of bundle.chains) {
      state.world.market.trades.push(chain.trade);
      state.world.eventLog.push(chain.event);
      state.world.ledger.push(chain.journal);
      state.world.facts.push(chain.fact);
      state.world.memories.push(chain.memory);
    }
  }
  state.realtimeAuditArchive.liveChainCount =
    liveChainCount;
}

function handleWorldAction(state, command) {
  if (command.action?.type === 'place_order') {
    return rejectedReceipt(
      state,
      'world_action',
      'LEGACY_MARKET_ACTION_DISABLED',
      { actorId: command.actorId },
    );
  }
  syncWorldBalancesFromAccounts(state);
  const previousIds = captureWorldRecordIds(state.world);
  const action = {
    ...(command.action ?? {}),
    actorId: command.actorId,
    authorityCommitSeq:
      command.action?.type === 'entertainment_action'
        ? state.world.entertainment.projectionRevision
        : state.commitSeq,
    virtualTime: state.nowMs,
    worldEpoch: state.streamId,
    availableCashCents:
      state.accounts.player.cashCents -
      state.accounts.player.reservedCashCents -
      derivativeReservedPlayerCashCents(state),
    availableHoldings: Object.fromEntries(
      Object.keys(
        state.world.market.securities,
      ).map((symbol) => [
        symbol,
        (state.accounts.player.holdings[symbol] ?? 0) -
          (
            state.accounts.player
              .reservedHoldings[symbol] ?? 0
          ),
      ]),
    ),
  };
  const result = applyAction(state.world, action);
  if (result.receipt.status !== 'accepted') {
    return pushReceipt(state, {
      ...cloneJson(result.receipt),
      id: nextLocalId(state, 'receipt'),
      engineReceiptId: result.receipt.id ?? null,
      actorId: command.actorId,
      type: command.action?.type ?? result.receipt.type,
      engineReceiptType: result.receipt.type,
      commandType: 'world_action',
      virtualMs: state.nowMs,
      commitSeq: state.commitSeq,
    });
  }
  const commitSeq = state.commitSeq + 1;
  state.world = result.state;
  synchronizePlayerRoleAutomationConfiguration(state);
  stampNewWorldRecords(state.world, previousIds, commitSeq);
  syncAccountsAfterWorldMutation(state);
  for (const account of Object.values(state.accounts)) {
    account.commitSeq = commitSeq;
  }
  state.commitSeq = commitSeq;
  markAccountRisk(state);
  syncWorldMarketMirrors(state);
  const scheduledCompletion =
    result.receipt.scheduledCompletion;
  if (
    scheduledCompletion?.type ===
      'open_world_city_completion' &&
    typeof scheduledCompletion.commitmentId === 'string' &&
    scheduledCompletion.commitmentId.length > 0 &&
    Number.isSafeInteger(scheduledCompletion.scheduledMs) &&
    scheduledCompletion.scheduledMs >= state.nowMs
  ) {
    scheduleEvent(state, {
      type: 'open_world_city_completion',
      scheduledMs: scheduledCompletion.scheduledMs,
      phasePriority: MARKET_PHASE_PRIORITY.PLAYER_COMMAND,
      actorId: command.actorId,
      payload: {
        commitmentId: scheduledCompletion.commitmentId,
      },
    });
  }
  return pushReceipt(state, {
    ...cloneJson(result.receipt),
    id: nextLocalId(state, 'receipt'),
    engineReceiptId: result.receipt.id ?? null,
    actorId: command.actorId,
    type: command.action?.type ?? result.receipt.type,
    engineReceiptType: result.receipt.type,
    commandType: 'world_action',
    virtualMs: state.nowMs,
    commitSeq,
  });
}

function handleOpenWorldCityCompletion(state, event) {
  const previousIds = captureWorldRecordIds(state.world);
  const commitSeq = state.commitSeq + 1;
  const result = settleOpenWorldCityCompletion(
    state.world,
    event.payload.commitmentId,
    {
      authorityCommitSeq: commitSeq,
      virtualTime: event.scheduledMs,
    },
  );
  if (result.status !== 'accepted') {
    return pushReceipt(state, {
      ...cloneJson(result),
      id: nextLocalId(state, 'receipt'),
      engineReceiptId: result.id ?? null,
      actorId: event.actorId,
      virtualMs: state.nowMs,
      commitSeq: state.commitSeq,
    });
  }
  stampNewWorldRecords(
    state.world,
    previousIds,
    commitSeq,
  );
  state.commitSeq = commitSeq;
  if (result.destinationPlaceId) {
    state.world.spatial.player.authorityCommitSeq = commitSeq;
    state.world.spatial.player.authorityVirtualMs =
      event.scheduledMs;
  }
  for (const account of Object.values(state.accounts)) {
    account.commitSeq = commitSeq;
  }
  markAccountRisk(state);
  return pushReceipt(state, {
    ...cloneJson(result),
    id: nextLocalId(state, 'receipt'),
    engineReceiptId: result.id ?? null,
    actorId: event.actorId,
    virtualMs: state.nowMs,
    commitSeq,
  });
}

function queuedPlayerMotion(state) {
  return state.eventQueue.some(
    (event) =>
      event.type === 'player_motion_step' &&
      event.actorId === 'player',
  );
}

function schedulePlayerMotion(state, scheduledMs) {
  if (queuedPlayerMotion(state)) return null;
  return scheduleEvent(state, {
    ...world2dMotionEventDescriptor(
      state.world,
      scheduledMs,
    ),
    phasePriority:
      MARKET_PHASE_PRIORITY.PLAYER_MOTION,
  });
}

function handlePlayerControl(state, command) {
  const prior = priorSpatialControlReceipt(
    state.world.spatial,
    command.commandId,
  );
  if (prior) return cloneJson(prior);
  const priorPlaceId = state.world.spatial.player.currentPlaceId;
  const result = acceptWorld2DControl(
    state.world,
    command,
    {
      authorityCommitSeq: state.commitSeq,
      authorityVirtualMs: state.nowMs,
    },
  );
  if (result.status !== 'accepted') {
    return pushReceipt(state, {
      id: nextLocalId(state, 'receipt'),
      type: 'player_control',
      commandType: 'player_control',
      actorId: command.actorId,
      commandId: command.commandId,
      controlSeq: command.controlSeq,
      status: 'rejected',
      reason: result.reason,
      virtualMs: state.nowMs,
      commitSeq: state.commitSeq,
    });
  }
  const commitSeq = state.commitSeq + 1;
  state.commitSeq = commitSeq;
  state.world.spatial.player.authorityCommitSeq =
    commitSeq;
  if (
    state.world.spatial.player.currentPlaceId !== priorPlaceId
  ) {
    markEntertainmentProjectionChanged(state.world);
  }
  if (result.shouldSchedule) {
    schedulePlayerMotion(
      state,
      state.nowMs + WORLD2D_MOTION_STEP_MS,
    );
  }
  const receipt = pushReceipt(state, {
    ...cloneJson(result),
    id: nextLocalId(state, 'receipt'),
    type: 'player_control',
    commandType: 'player_control',
    actorId: command.actorId,
    virtualMs: state.nowMs,
    commitSeq,
  });
  const remembered = state.world.spatial.recentControlCommands.find(
    (entry) => entry.commandId === command.commandId,
  );
  if (remembered) remembered.receipt = cloneJson(receipt);
  return receipt;
}

function routeCommand(state, command, options = {}) {
  switch (command.type) {
    case 'submit_order':
      return handleSubmitOrder(state, command, options);
    case 'cancel_order':
      return handleCancelOrder(state, command, options);
    case 'world_action':
      return handleWorldAction(state, command);
    case 'player_control':
      return handlePlayerControl(state, command);
    default:
      return rejectedReceipt(
        state,
        command.type ?? 'unknown',
        'UNKNOWN_COMMAND',
        { actorId: command.actorId },
      );
  }
}

function markAccountRisk(state) {
  for (const account of Object.values(state.accounts)) {
    const equityCents =
      account.cashCents +
      Object.entries(account.holdings).reduce(
        (sum, [symbol, quantity]) =>
          sum +
          quantity *
            cents(state.world.market.securities[symbol].lastPrice),
        0,
      );
    account.peakEquityCents = Math.max(
      account.peakEquityCents ?? 0,
      equityCents,
    );
    account.drawdownBps =
      account.peakEquityCents <= 0
        ? 0
        : Math.max(
            0,
            Math.round(
              (account.peakEquityCents - equityCents) *
                10_000 /
                account.peakEquityCents,
            ),
          );
    const reservedHoldingNotional = Object.entries(
      account.reservedHoldings,
    ).reduce(
      (sum, [symbol, quantity]) =>
        sum +
        quantity *
          cents(state.world.market.securities[symbol].lastPrice),
      0,
    );
    account.fundingStressBps =
      equityCents <= 0
        ? 10_000
        : Math.min(
            10_000,
            Math.round(
              (account.reservedCashCents + reservedHoldingNotional) *
                10_000 /
                equityCents,
            ),
          );
  }
}

const QUIET_DERIVATIVE_CADENCE_RECEIPT_KEYS =
  Object.freeze([
    'id',
    'type',
    'status',
    'reason',
    'virtualMs',
    'authorityAtMs',
    'derivativeCommitSeq',
    'institutionalSecuritiesTransfers',
    'commitSeq',
  ]);
const DERIVATIVE_CADENCE_RECEIPT_RANGE_KEYS =
  Object.freeze([
    'idPrefix',
    'firstIdSequence',
    'lastIdSequence',
    'idSequenceStep',
    'firstId',
    'lastId',
    'type',
    'status',
    'reason',
    'firstVirtualMs',
    'lastVirtualMs',
    'virtualMsStep',
    'firstAuthorityAtMs',
    'lastAuthorityAtMs',
    'authorityAtMsStep',
    'firstDerivativeCommitSeq',
    'lastDerivativeCommitSeq',
    'derivativeCommitSeqStep',
    'institutionalSecuritiesTransfers',
    'firstCommitSeq',
    'lastCommitSeq',
    'commitSeqStep',
    'count',
  ]);

function createDerivativeCadenceReceiptArchive() {
  return {
    format:
      DERIVATIVE_CADENCE_RECEIPT_ARCHIVE_FORMAT,
    maxLiveQuietReceipts:
      MAX_LIVE_QUIET_DERIVATIVE_CADENCE_RECEIPTS,
    totalArchivedReceipts: 0,
    firstReceiptId: null,
    lastReceiptId: null,
    ranges: [],
  };
}

function derivativeCadenceReceiptSequence(id) {
  if (
    typeof id !== 'string' ||
    !id.startsWith(
      DERIVATIVE_CADENCE_RECEIPT_ID_PREFIX,
    )
  ) {
    return null;
  }
  const suffix = id.slice(
    DERIVATIVE_CADENCE_RECEIPT_ID_PREFIX.length,
  );
  if (!/^\d{8}$/.test(suffix)) return null;
  const sequence = Number(suffix);
  return Number.isSafeInteger(sequence) &&
    sequence > 0
    ? sequence
    : null;
}

function derivativeCadenceReceiptId(sequence) {
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 1 ||
    sequence > 99_999_999
  ) {
    throw new RangeError(
      'Derivative cadence receipt sequence is out of range.',
    );
  }
  return (
    DERIVATIVE_CADENCE_RECEIPT_ID_PREFIX +
    String(sequence).padStart(8, '0')
  );
}

function isQuietDerivativeCadenceReceipt(receipt) {
  return Boolean(
    receipt &&
    typeof receipt === 'object' &&
    !Array.isArray(receipt) &&
    sameStringSet(
      Object.keys(receipt),
      QUIET_DERIVATIVE_CADENCE_RECEIPT_KEYS,
    ) &&
    derivativeCadenceReceiptSequence(receipt.id) !== null &&
    receipt.type === 'derivative_actor_cycle' &&
    receipt.status === 'applied' &&
    receipt.reason === null &&
    Number.isSafeInteger(receipt.virtualMs) &&
    receipt.virtualMs >= 0 &&
    Number.isSafeInteger(receipt.authorityAtMs) &&
    receipt.authorityAtMs >= 0 &&
    Number.isSafeInteger(
      receipt.derivativeCommitSeq,
    ) &&
    receipt.derivativeCommitSeq >= 1 &&
    Array.isArray(
      receipt.institutionalSecuritiesTransfers,
    ) &&
    receipt.institutionalSecuritiesTransfers.length === 0 &&
    Number.isSafeInteger(receipt.commitSeq) &&
    receipt.commitSeq >= 1
  );
}

function createDerivativeCadenceReceiptRange(receipt) {
  const idSequence =
    derivativeCadenceReceiptSequence(receipt.id);
  return {
    idPrefix:
      DERIVATIVE_CADENCE_RECEIPT_ID_PREFIX,
    firstIdSequence: idSequence,
    lastIdSequence: idSequence,
    idSequenceStep: 1,
    firstId: receipt.id,
    lastId: receipt.id,
    type: receipt.type,
    status: receipt.status,
    reason: receipt.reason,
    firstVirtualMs: receipt.virtualMs,
    lastVirtualMs: receipt.virtualMs,
    virtualMsStep: QUOTE_FRAME_MS,
    firstAuthorityAtMs: receipt.authorityAtMs,
    lastAuthorityAtMs: receipt.authorityAtMs,
    authorityAtMsStep: QUOTE_FRAME_MS,
    firstDerivativeCommitSeq:
      receipt.derivativeCommitSeq,
    lastDerivativeCommitSeq:
      receipt.derivativeCommitSeq,
    derivativeCommitSeqStep: 1,
    institutionalSecuritiesTransfers: [],
    firstCommitSeq: receipt.commitSeq,
    lastCommitSeq: receipt.commitSeq,
    commitSeqStep: 1,
    count: 1,
  };
}

function steppedRangeValue(first, step, index) {
  const value = first + step * index;
  return Number.isSafeInteger(value) ? value : null;
}

function cadenceRangeCanAppend(range, receipt) {
  if (!isQuietDerivativeCadenceReceipt(receipt)) {
    return false;
  }
  const index = range.count;
  const expectedIdSequence = steppedRangeValue(
    range.firstIdSequence,
    range.idSequenceStep,
    index,
  );
  if (expectedIdSequence === null) return false;
  return (
    range.idPrefix ===
      DERIVATIVE_CADENCE_RECEIPT_ID_PREFIX &&
    receipt.id ===
      derivativeCadenceReceiptId(
        expectedIdSequence,
      ) &&
    receipt.type === range.type &&
    receipt.status === range.status &&
    receipt.reason === range.reason &&
    receipt.virtualMs ===
      steppedRangeValue(
        range.firstVirtualMs,
        range.virtualMsStep,
        index,
      ) &&
    receipt.authorityAtMs ===
      steppedRangeValue(
        range.firstAuthorityAtMs,
        range.authorityAtMsStep,
        index,
      ) &&
    receipt.derivativeCommitSeq ===
      steppedRangeValue(
        range.firstDerivativeCommitSeq,
        range.derivativeCommitSeqStep,
        index,
      ) &&
    receipt.commitSeq ===
      steppedRangeValue(
        range.firstCommitSeq,
        range.commitSeqStep,
        index,
      )
  );
}

function appendDerivativeCadenceReceiptToArchive(
  archive,
  receipt,
) {
  const lastRange = archive.ranges.at(-1);
  if (
    lastRange &&
    cadenceRangeCanAppend(lastRange, receipt)
  ) {
    lastRange.count += 1;
    lastRange.lastIdSequence =
      derivativeCadenceReceiptSequence(receipt.id);
    lastRange.lastId = receipt.id;
    lastRange.lastVirtualMs = receipt.virtualMs;
    lastRange.lastAuthorityAtMs =
      receipt.authorityAtMs;
    lastRange.lastDerivativeCommitSeq =
      receipt.derivativeCommitSeq;
    lastRange.lastCommitSeq = receipt.commitSeq;
  } else {
    archive.ranges.push(
      createDerivativeCadenceReceiptRange(receipt),
    );
  }
  archive.totalArchivedReceipts += 1;
  archive.firstReceiptId ??= receipt.id;
  archive.lastReceiptId = receipt.id;
}

function archiveQuietDerivativeCadenceReceipts(state) {
  const archive =
    state.derivativeCadenceReceiptArchive;
  if (!archive) {
    throw new Error(
      'Missing derivative cadence receipt archive.',
    );
  }
  const quietReceipts = state.receipts.filter(
    isQuietDerivativeCadenceReceipt,
  );
  const archiveCount = Math.max(
    0,
    quietReceipts.length -
      MAX_LIVE_QUIET_DERIVATIVE_CADENCE_RECEIPTS,
  );
  if (archiveCount === 0) return;
  const selected = quietReceipts.slice(0, archiveCount);
  const selectedIds = new Set();
  for (const receipt of selected) {
    appendDerivativeCadenceReceiptToArchive(
      archive,
      receipt,
    );
    selectedIds.add(receipt.id);
  }
  state.receipts = state.receipts.filter(
    (receipt) => !selectedIds.has(receipt.id),
  );
}

function derivativeCadenceReceiptArchiveErrors(
  state,
  { enforceLiveLimit = true } = {},
) {
  const archive =
    state.derivativeCadenceReceiptArchive;
  const errors = [];
  const invalid = (reason) => {
    errors.push(
      `INVALID_DERIVATIVE_CADENCE_RECEIPT_ARCHIVE:${reason}`,
    );
  };
  if (
    !archive ||
    typeof archive !== 'object' ||
    Array.isArray(archive) ||
    !sameStringSet(Object.keys(archive), [
      'format',
      'maxLiveQuietReceipts',
      'totalArchivedReceipts',
      'firstReceiptId',
      'lastReceiptId',
      'ranges',
    ]) ||
    archive.format !==
      DERIVATIVE_CADENCE_RECEIPT_ARCHIVE_FORMAT ||
    archive.maxLiveQuietReceipts !==
      MAX_LIVE_QUIET_DERIVATIVE_CADENCE_RECEIPTS ||
    !Number.isSafeInteger(
      archive.totalArchivedReceipts,
    ) ||
    archive.totalArchivedReceipts < 0 ||
    !Array.isArray(archive.ranges)
  ) {
    invalid('SCHEMA');
    return errors;
  }

  let total = 0;
  let previousRange = null;
  for (
    let rangeIndex = 0;
    rangeIndex < archive.ranges.length;
    rangeIndex += 1
  ) {
    const range = archive.ranges[rangeIndex];
    if (
      !range ||
      typeof range !== 'object' ||
      Array.isArray(range) ||
      !sameStringSet(
        Object.keys(range),
        DERIVATIVE_CADENCE_RECEIPT_RANGE_KEYS,
      ) ||
      range.idPrefix !==
        DERIVATIVE_CADENCE_RECEIPT_ID_PREFIX ||
      range.idSequenceStep !== 1 ||
      range.virtualMsStep !== QUOTE_FRAME_MS ||
      range.authorityAtMsStep !== QUOTE_FRAME_MS ||
      range.derivativeCommitSeqStep !== 1 ||
      range.commitSeqStep !== 1 ||
      range.type !== 'derivative_actor_cycle' ||
      range.status !== 'applied' ||
      range.reason !== null ||
      !Array.isArray(
        range.institutionalSecuritiesTransfers,
      ) ||
      range.institutionalSecuritiesTransfers.length !== 0 ||
      !Number.isSafeInteger(range.count) ||
      range.count < 1
    ) {
      invalid(`RANGE_SCHEMA:${rangeIndex}`);
      continue;
    }
    const lastIndex = range.count - 1;
    const expectedLastIdSequence =
      steppedRangeValue(
        range.firstIdSequence,
        range.idSequenceStep,
        lastIndex,
      );
    const expectedLastVirtualMs =
      steppedRangeValue(
        range.firstVirtualMs,
        range.virtualMsStep,
        lastIndex,
      );
    const expectedLastAuthorityAtMs =
      steppedRangeValue(
        range.firstAuthorityAtMs,
        range.authorityAtMsStep,
        lastIndex,
      );
    const expectedLastDerivativeCommitSeq =
      steppedRangeValue(
        range.firstDerivativeCommitSeq,
        range.derivativeCommitSeqStep,
        lastIndex,
      );
    const expectedLastCommitSeq =
      steppedRangeValue(
        range.firstCommitSeq,
        range.commitSeqStep,
        lastIndex,
      );
    if (
      derivativeCadenceReceiptSequence(
        range.firstId,
      ) !== range.firstIdSequence ||
      derivativeCadenceReceiptSequence(
        range.lastId,
      ) !== range.lastIdSequence ||
      range.firstId !==
        derivativeCadenceReceiptId(
          range.firstIdSequence,
        ) ||
      range.lastId !==
        derivativeCadenceReceiptId(
          range.lastIdSequence,
        ) ||
      range.lastIdSequence !==
        expectedLastIdSequence ||
      range.lastVirtualMs !==
        expectedLastVirtualMs ||
      range.lastAuthorityAtMs !==
        expectedLastAuthorityAtMs ||
      range.lastDerivativeCommitSeq !==
        expectedLastDerivativeCommitSeq ||
      range.lastCommitSeq !==
        expectedLastCommitSeq ||
      !Number.isSafeInteger(range.firstVirtualMs) ||
      range.firstVirtualMs < 0 ||
      range.lastVirtualMs > state.nowMs ||
      !Number.isSafeInteger(
        range.firstAuthorityAtMs,
      ) ||
      range.firstAuthorityAtMs < 0 ||
      range.lastAuthorityAtMs >
        state.world.derivatives.nowMs ||
      !Number.isSafeInteger(
        range.firstDerivativeCommitSeq,
      ) ||
      range.firstDerivativeCommitSeq < 1 ||
      range.lastDerivativeCommitSeq >
        state.world.derivatives.commitSeq ||
      !Number.isSafeInteger(range.firstCommitSeq) ||
      range.firstCommitSeq < 1 ||
      range.lastCommitSeq > state.commitSeq
    ) {
      invalid(`RANGE_BOUNDARY:${rangeIndex}`);
    }
    if (
      previousRange &&
      (
        range.firstIdSequence <=
          previousRange.lastIdSequence ||
        range.firstVirtualMs <=
          previousRange.lastVirtualMs ||
        range.firstAuthorityAtMs <=
          previousRange.lastAuthorityAtMs ||
        range.firstDerivativeCommitSeq <=
          previousRange.lastDerivativeCommitSeq ||
        range.firstCommitSeq <=
          previousRange.lastCommitSeq
      )
    ) {
      invalid(`RANGE_ORDER:${rangeIndex}`);
    }
    if (
      previousRange &&
      cadenceRangeCanAppend(previousRange, {
        id: range.firstId,
        type: range.type,
        status: range.status,
        reason: range.reason,
        virtualMs: range.firstVirtualMs,
        authorityAtMs: range.firstAuthorityAtMs,
        derivativeCommitSeq:
          range.firstDerivativeCommitSeq,
        institutionalSecuritiesTransfers: [],
        commitSeq: range.firstCommitSeq,
      })
    ) {
      invalid(`UNMERGED_CONTIGUOUS_RANGE:${rangeIndex}`);
    }
    total += range.count;
    if (!Number.isSafeInteger(total)) {
      invalid('TOTAL_OVERFLOW');
    }
    previousRange = range;
  }

  const firstRange = archive.ranges[0];
  const lastRange = archive.ranges.at(-1);
  if (
    total !== archive.totalArchivedReceipts ||
    (
      total === 0 &&
      (
        archive.firstReceiptId !== null ||
        archive.lastReceiptId !== null ||
        archive.ranges.length !== 0
      )
    ) ||
    (
      total > 0 &&
      (
        archive.firstReceiptId !== firstRange?.firstId ||
        archive.lastReceiptId !== lastRange?.lastId
      )
    )
  ) {
    invalid('TOTAL_OR_BOUNDARY');
  }

  const liveQuiet = state.receipts.filter(
    isQuietDerivativeCadenceReceipt,
  );
  if (
    enforceLiveLimit &&
    liveQuiet.length >
      MAX_LIVE_QUIET_DERIVATIVE_CADENCE_RECEIPTS
  ) {
    invalid('LIVE_LIMIT');
  }
  for (const receipt of state.receipts) {
    const sequence =
      derivativeCadenceReceiptSequence(receipt?.id);
    if (
      sequence !== null &&
      archive.ranges.some(
        (range) =>
          sequence >= range.firstIdSequence &&
          sequence <= range.lastIdSequence,
      )
    ) {
      invalid(`LIVE_ARCHIVE_DUPLICATE:${receipt.id}`);
      break;
    }
  }
  return errors;
}

function hydrateDerivativeCadenceReceiptArchive(
  state,
) {
  if (
    !Object.hasOwn(
      state,
      'derivativeCadenceReceiptArchive',
    )
  ) {
    state.derivativeCadenceReceiptArchive =
      createDerivativeCadenceReceiptArchive();
  } else {
    const errors =
      derivativeCadenceReceiptArchiveErrors(
        state,
        { enforceLiveLimit: false },
      );
    if (errors.length > 0) {
      throw new Error(
        `market invariant violation: ${errors.join('; ')}`,
      );
    }
  }
  archiveQuietDerivativeCadenceReceipts(state);
}

function pruneBoundedAgentReceipts(state) {
  archiveQuietDerivativeCadenceReceipts(state);
  const disposableAgentReceipts = state.receipts.filter(
    (receipt) =>
      receipt.source === 'npc_agent' &&
      (!Array.isArray(receipt.tradeIds) ||
        receipt.tradeIds.length === 0),
  );
  const disposablePlayerReceipts = state.receipts.filter(
    (receipt) =>
      receipt.actorId === 'player' &&
      receipt.status === 'rejected' &&
      (!Array.isArray(receipt.tradeIds) ||
        receipt.tradeIds.length === 0),
  );
  const disposableAutomationReceipts = state.receipts.filter(
    (receipt) =>
      (receipt.automationKind === 'quant' ||
        receipt.automationKind === 'stabilization') &&
      (!Array.isArray(receipt.tradeIds) ||
        receipt.tradeIds.length === 0),
  );
  const removeIds = new Set([
    ...disposableAgentReceipts
      .slice(
        0,
        Math.max(
          0,
          disposableAgentReceipts.length -
            MAX_AGENT_NONTRADE_RECEIPTS,
        ),
      )
      .map((receipt) => receipt.id),
    ...disposablePlayerReceipts
      .slice(
        0,
        Math.max(
          0,
          disposablePlayerReceipts.length -
            MAX_PLAYER_REJECTED_RECEIPTS,
        ),
      )
      .map((receipt) => receipt.id),
    ...disposableAutomationReceipts
      .slice(
        0,
        Math.max(
          0,
          disposableAutomationReceipts.length -
            MAX_PLAYER_AUTOMATION_NONTRADE_RECEIPTS,
        ),
      )
      .map((receipt) => receipt.id),
  ]);
  if (removeIds.size === 0) return;
  state.receipts = state.receipts.filter(
    (receipt) => !removeIds.has(receipt.id),
  );
}

function commandPriority(command) {
  if (command.type === 'cancel_order') {
    return MARKET_PHASE_PRIORITY.CANCEL_EXPIRE;
  }
  if (command.type === 'submit_order') {
    return MARKET_PHASE_PRIORITY.BROKER_ROUTE;
  }
  return MARKET_PHASE_PRIORITY.PLAYER_COMMAND;
}

function parentOrderProvenanceMatchesAgent(
  state,
  parentOrderId,
  agentId,
) {
  if (typeof parentOrderId !== 'string') return true;
  const claimedAgentIds = Object.keys(
    state.agentEcology?.agents ?? {},
  ).filter((candidateId) =>
    parentOrderId.includes(`:${candidateId}:`),
  );
  return (
    claimedAgentIds.length === 0 ||
    (
      claimedAgentIds.length === 1 &&
      claimedAgentIds[0] === agentId
    )
  );
}

function recentActivityIndex(state) {
  const activities = state.agentEcology?.recentActivity;
  if (!Array.isArray(activities)) return null;
  let index = recentActivityIndexes.get(activities);
  if (!index) {
    index = new Map(
      activities.map((activity) => [activity.id, activity]),
    );
    recentActivityIndexes.set(activities, index);
  }
  return index;
}

function recentActivityById(state, activityId) {
  return recentActivityIndex(state)?.get(activityId) ?? null;
}

function makerSymbolsForCadence(
  state,
  agent,
  event,
  openingMakerDecision,
) {
  const symbols = Object.keys(state.books);
  const hydrationSymbols =
    event.payload?.universeHydrationSymbols;
  if (hydrationSymbols !== undefined) {
    if (
      !Array.isArray(hydrationSymbols) ||
      hydrationSymbols.length === 0 ||
      new Set(hydrationSymbols).size !==
        hydrationSymbols.length ||
      hydrationSymbols.some(
        (symbol) =>
          typeof symbol !== 'string' ||
          !Object.hasOwn(state.books, symbol),
      )
    ) {
      throw new Error(
        'Invalid stock-universe maker hydration event.',
      );
    }
    return [...hydrationSymbols];
  }
  if (
    openingMakerDecision ||
    symbols.length <= MAX_MAKER_SYMBOLS_PER_CADENCE
  ) {
    return symbols;
  }
  const prioritySymbols = new Set(
    (event.payload?.prioritySymbols ?? []).filter((symbol) =>
      Object.hasOwn(state.books, symbol),
    ),
  );
  const urgentBoundarySymbols = [
    ...new Set(
      (event.payload?.urgentBoundarySymbols ?? []).filter(
        (symbol) => Object.hasOwn(state.books, symbol),
      ),
    ),
  ].slice(0, MAX_MAKER_SYMBOLS_PER_CADENCE);
  for (const [symbol, episode] of Object.entries(
    agent.limitQueueEpisodes ?? {},
  )) {
    if (
      episode &&
      episode.state !== 'exhaustion' &&
      episode.state !== 'failed_recovery'
    ) {
      prioritySymbols.add(symbol);
    }
  }
  const cursor =
    Number.isSafeInteger(agent.makerCadenceCursor) &&
    agent.makerCadenceCursor >= 0
      ? agent.makerCadenceCursor % symbols.length
      : 0;
  const shard = Array.from(
    { length: MAX_MAKER_SYMBOLS_PER_CADENCE },
    (_, offset) => symbols[(cursor + offset) % symbols.length],
  );
  // Ordinary settled trades only reorder their existing fixed shard. A first
  // daily-boundary touch (or a documented relock) may replace one slot so the
  // player does not wait a whole universe pass for a maker response; the
  // episode gate prevents subsequent boundary fills from repeatedly doing so.
  // Either path preserves the hard eight-symbol decision budget and advances
  // the fairness cursor by the same fixed amount.
  const urgentSet = new Set(urgentBoundarySymbols);
  const selected = [
    ...urgentBoundarySymbols,
    ...shard.filter(
      (symbol) =>
        !urgentSet.has(symbol) &&
        prioritySymbols.has(symbol),
    ),
    ...shard.filter(
      (symbol) =>
        !urgentSet.has(symbol) &&
        !prioritySymbols.has(symbol),
    ),
  ].slice(0, MAX_MAKER_SYMBOLS_PER_CADENCE);
  agent.makerCadenceCursor =
    (cursor + MAX_MAKER_SYMBOLS_PER_CADENCE) %
    symbols.length;
  return selected;
}

function handleEcologyDecision(state, event) {
  const agentId = event.actorId;
  const agent = state.agentEcology.agents[agentId];
  const openingMakerDecision =
    state.nowMs === 0 &&
    agent.kind === 'maker' &&
    agent.lastDecisionMs === null;
  const trigger =
    event.type === 'public_flow_response'
      ? 'public_flow'
      : 'cadence';
  let pending = null;
  if (trigger === 'public_flow') {
    pending = state.agentEcology.pendingResponses[agentId];
    if (!pending || pending.eventId !== event.id) {
      throw new Error(`Missing public-flow observation for ${event.id}`);
    }
    delete state.agentEcology.pendingResponses[agentId];
    const observed = cloneJson(pending);
    delete observed.deferredObservedTradeIds;
    delete observed.deferredObservedTrades;
    agent.activePublicSignal = observed;
    agent.publicFlowMemory = cloneJson(observed);
    agent.publicFlowMemory.processedAtMs = state.nowMs;
    agent.lastObservedTradeMs = pending.lastTradeMs;
    scheduleDeferredPublicFlowResponse(
      state,
      agentId,
      pending,
    );
  }
  agent.lastTrigger = trigger;
  const makerSymbols =
    agent.kind === 'maker'
      ? makerSymbolsForCadence(
          state,
          agent,
          event,
          openingMakerDecision,
        )
      : null;
  const commands = decideAgentOrders(state, agentId, {
    makerSymbols,
  });
  delete agent.activePublicSignal;
  agent.lastTrigger = null;

  const activity = {
    id: `agent_activity_${String(event.sequence).padStart(8, '0')}`,
    agentId,
    strategy: agent.strategy,
    trigger,
    virtualMs: state.nowMs,
    decisionSequence: agent.decisionSequence,
    observedTradeIds: pending?.observedTradeIds ?? [],
    evaluatedSymbols:
      agent.kind === 'maker'
        ? [...(agent.lastMakerEvaluatedSymbols ?? [])]
        : [],
    commandCount: commands.length,
    processedCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    publicActions: [],
  };
  const activityIndex = recentActivityIndex(state);
  state.agentEcology.recentActivity.push(activity);
  activityIndex.set(activity.id, activity);
  if (
    state.agentEcology.recentActivity.length >
    state.agentEcology.maxRecentActivity
  ) {
    const removedActivities =
      state.agentEcology.recentActivity.splice(
        0,
        state.agentEcology.recentActivity.length -
          state.agentEcology.maxRecentActivity,
      );
    for (const removed of removedActivities) {
      if (activityIndex.get(removed.id) === removed) {
        activityIndex.delete(removed.id);
      }
    }
  }
  for (const commandType of ['cancel_order', 'submit_order']) {
    const batchCommands = commands.filter(
      (command) => command.type === commandType,
    );
    if (batchCommands.length === 0) continue;
    for (
      let offset = 0;
      offset < batchCommands.length;
      offset += MAX_AGENT_COMMANDS_PER_BATCH
    ) {
      const chunk = batchCommands.slice(
        offset,
        offset + MAX_AGENT_COMMANDS_PER_BATCH,
      );
      scheduleEvent(state, {
        type: 'agent_command_batch',
        scheduledMs:
          state.nowMs +
          (openingMakerDecision ? 0 : 1),
        phasePriority: commandPriority(chunk[0]),
        actorId: agentId,
        payload: {
          agentId,
          agentActivityId: activity.id,
          commands: chunk.map((command) => ({
            ...command,
            source: 'npc_agent',
            agentActivityId: activity.id,
            ecologyAgentId: agentId,
          })),
        },
        ownedPayload: true,
      });
    }
  }
  if (openingMakerDecision) {
    scheduleEvent(state, {
      type: 'agent_decision',
      scheduledMs:
        state.nowMs +
        Math.max(
          1,
          Math.trunc(
            Number(agent.latencyMs) || 1,
          ),
        ),
      phasePriority:
        MARKET_PHASE_PRIORITY.MAKER_QUOTE,
      actorId: agentId,
      payload: {
        agentId,
        trigger: 'cadence',
      },
    });
  } else if (event.type === 'agent_decision') {
    scheduleNextAgentDecision(state, agentId);
  }
  return cloneJson(activity);
}

function attributeAgentCommand(
  state,
  command,
  receipt,
  { deferReceiptPrune = false } = {},
) {
  if (command.source !== 'npc_agent') return;
  receipt.source = 'npc_agent';
  receipt.agentId =
    command.ecologyAgentId ?? command.actorId;
  receipt.agentActivityId = command.agentActivityId;
  recordAgentCommandOutcome(
    state,
    receipt.agentId,
    receipt,
  );
  const activity = recentActivityById(
    state,
    command.agentActivityId,
  );
  if (activity) {
    activity.processedCount += 1;
    if (receipt.status === 'rejected') {
      activity.rejectedCount += 1;
    } else {
      activity.acceptedCount += 1;
    }
    if (
      command.type === 'submit_order' &&
      activity.publicActions.length <
        MAX_PUBLIC_AGENT_ACTIONS_PER_ACTIVITY
    ) {
      activity.publicActions.push({
        symbol: command.symbol,
        side: command.side,
        orderType: command.orderType ?? 'limit',
        tif:
          command.orderType === 'market'
            ? 'IOC'
            : command.tif,
        priceTicks:
          command.orderType === 'market'
            ? null
            : command.priceTicks,
        quantity: command.quantity,
        filledQuantity: receipt.filledQuantity ?? 0,
        status: receipt.status,
      });
    }
  }
  if (!deferReceiptPrune) pruneBoundedAgentReceipts(state);
}

function handleAgentCommandBatch(
  state,
  event,
  { deferMarketMirror = false } = {},
) {
  const results = [];
  for (const command of event.payload.commands) {
    const dirtySymbol = deferMarketMirror
      ? externalOrderSymbol(state, command)
      : null;
    const receipt = routeCommand(state, command, {
      deferBatchMaintenance: true,
    });
    if (dirtySymbol) {
      markDeferredWorldOrderMirror(state, dirtySymbol);
    }
    attributeAgentCommand(state, command, receipt, {
      deferReceiptPrune: deferMarketMirror,
    });
    results.push(receipt);
  }
  // One mature-world opening batch can legitimately cross hundreds of
  // finite orders before the next playback-slice boundary. Keep the live
  // audit working set bounded at the same command authority boundary; a
  // transactional processNextEvent must never fail merely because one NPC
  // batch produced more fills than the visible tape can retain.
  if (
    state.realtimeAuditArchive.liveChainCount >
    MAX_LIVE_REALTIME_AUDIT_CHAINS
  ) {
    compactRealtimeAuditOverflow(
      state,
      state.commitSeq,
      REALTIME_AUDIT_BACKGROUND_TARGET,
    );
  }
  if (!deferMarketMirror) {
    for (const symbol of Object.keys(state.books)) {
      archiveTerminalOrders(state, symbol);
    }
    pruneBoundedAgentReceipts(state);
  }
  markAccountRisk(state);
  if (!deferMarketMirror) {
    syncWorldMarketMirrors(state, {
      synchronizeDerivatives: false,
    });
  }
  return results;
}

function visibleBar(state, symbol, bar) {
  if (!bar) return null;
  return {
    symbol,
    dayId: state.barSeries[symbol].dayId,
    frameStartMs: bar.startMs,
    frameEndMs: bar.endMs,
    startMs: bar.startMs,
    endMs: bar.endMs,
    openTicks: bar.openTicks,
    highTicks: bar.highTicks,
    lowTicks: bar.lowTicks,
    closeTicks: bar.closeTicks,
    volumeShares: bar.volume,
    volume: bar.volume,
    turnoverCents: bar.turnoverTicks,
    turnoverTicks: bar.turnoverTicks,
    tradeCount: bar.tradeCount,
    vwapTicks:
      bar.volume > 0
        ? Math.round(bar.turnoverTicks / bar.volume)
        : null,
  };
}

function copyUltraFill(fill) {
  return {
    timestampMs: fill.timestampMs,
    sequence: fill.sequence,
    priceTicks: fill.priceTicks,
    quantity: fill.quantity,
  };
}

function publicUltraTrade(symbol, fill) {
  return {
    id: `${symbol}:${fill.timestampMs}:${fill.sequence}`,
    symbol,
    virtualMs: fill.timestampMs,
    sequence: fill.sequence,
    priceTicks: fill.priceTicks,
    quantity: fill.quantity,
  };
}

function compareUltraFills(left, right) {
  return (
    left.timestampMs - right.timestampMs ||
    left.sequence - right.sequence
  );
}

function sameUltraFill(left, right) {
  return (
    left?.timestampMs === right?.timestampMs &&
    left?.sequence === right?.sequence &&
    left?.priceTicks === right?.priceTicks &&
    left?.quantity === right?.quantity
  );
}

function mergedUltraFills(...collections) {
  const byId = new Map();
  for (const collection of collections) {
    for (const fill of Array.isArray(collection) ? collection : []) {
      const key = `${fill.timestampMs}:${fill.sequence}`;
      const existing = byId.get(key);
      if (existing && !sameUltraFill(existing, fill)) {
        throw new Error(
          `Closed ultra authority changed at ${key}.`,
        );
      }
      if (!existing) byId.set(key, copyUltraFill(fill));
    }
  }
  return [...byId.values()].sort(compareUltraFills);
}

function currentDomainUltraFills(state, symbol) {
  const domain = deriveFixedIntradayTimeDomain(state.nowMs, {
    clockOffsetMs: MARKET_CLOCK_ORIGIN_OFFSET_MS,
  });
  return mergedUltraFills(
    state.barArchives.bySymbol[symbol].ultraFills,
    state.barSeries[symbol].fills,
  ).filter(
    (fill) =>
      fill.timestampMs >= domain.startMs &&
      fill.timestampMs <= Math.min(state.nowMs, domain.endMs),
  );
}

function completeUltraTrades(state, symbol) {
  return currentDomainUltraFills(state, symbol)
    .map((fill) => publicUltraTrade(symbol, fill));
}

function quotePublicationMs(timestampMs) {
  if (timestampMs === 0) return QUOTE_FRAME_MS;
  return (
    Math.ceil(timestampMs / QUOTE_FRAME_MS) *
    QUOTE_FRAME_MS
  );
}

function quoteCadenceTrades(
  state,
  symbol,
  { latestOnly = false } = {},
) {
  const fills = latestOnly
    ? state.barSeries[symbol].fills
    : currentDomainUltraFills(state, symbol);
  const publicationMs = latestOnly
    ? state.nowMs
    : null;
  const publications = new Map();
  for (const fill of fills) {
    const visibleMs = quotePublicationMs(fill.timestampMs);
    if (
      visibleMs > state.nowMs ||
      (latestOnly && visibleMs !== publicationMs)
    ) {
      continue;
    }
    const current = publications.get(visibleMs) ?? {
      id: `${symbol}:quote:${visibleMs}`,
      symbol,
      virtualMs: visibleMs,
      sequence: fill.sequence,
      priceTicks: fill.priceTicks,
      quantity: 0,
    };
    current.sequence = fill.sequence;
    current.priceTicks = fill.priceTicks;
    current.quantity += fill.quantity;
    if (!Number.isSafeInteger(current.quantity)) {
      throw new RangeError(
        `quote-cadence quantity exceeds safe integer range: ${symbol}`,
      );
    }
    publications.set(visibleMs, current);
  }
  return [...publications.values()].sort(
    (left, right) =>
      left.virtualMs - right.virtualMs ||
      left.sequence - right.sequence,
  );
}

function currentUltraTradeDeltas(state, symbol) {
  const latestFrame = state.quoteFrames.at(-1);
  if (
    latestFrame?.virtualMs === state.nowMs &&
    Array.isArray(
      latestFrame.symbols?.[symbol]?.ultraTradeDeltas,
    )
  ) {
    return latestFrame.symbols[symbol].ultraTradeDeltas;
  }
  const afterMs = latestFrame?.virtualMs ??
    state.barSeries[symbol].dayStartMs - 1;
  const fills = state.barSeries[symbol].fills;
  let low = 0;
  let high = fills.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (fills[middle].timestampMs <= afterMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const deltas = [];
  for (
    let index = low;
    index < fills.length &&
      fills[index].timestampMs <= state.nowMs;
    index += 1
  ) {
    deltas.push(publicUltraTrade(symbol, fills[index]));
  }
  return deltas;
}

function ultraTradeDeltasAfterMs(
  state,
  symbol,
  afterExclusiveMs,
) {
  if (
    !Number.isSafeInteger(afterExclusiveMs) ||
    afterExclusiveMs < -1 ||
    afterExclusiveMs > state.nowMs
  ) {
    throw new RangeError(
      'afterExclusiveMs must be an integer between -1 and nowMs',
    );
  }
  const domain = deriveFixedIntradayTimeDomain(
    state.nowMs,
    {
      clockOffsetMs:
        MARKET_CLOCK_ORIGIN_OFFSET_MS,
    },
  );
  const thresholdMs = Math.max(
    afterExclusiveMs,
    domain.startMs - 1,
  );
  const tailAfter = (fills) => {
    let low = 0;
    let high = fills.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (fills[middle].timestampMs <= thresholdMs) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return fills.slice(low);
  };
  return mergedUltraFills(
    tailAfter(
      state.barArchives.bySymbol[symbol]
        .ultraFills,
    ),
    tailAfter(state.barSeries[symbol].fills),
  )
    .filter(
      (fill) =>
        fill.timestampMs <=
        Math.min(state.nowMs, domain.endMs),
    )
    .map((fill) => publicUltraTrade(symbol, fill));
}

function mergeMinuteProjectionBar(target, bar) {
  target.endMs = Math.max(target.endMs, bar.endMs);
  target.volume += bar.volume;
  target.turnoverTicks += bar.turnoverTicks;
  target.tradeCount += bar.tradeCount;
  if (bar.openTicks === null) return;
  if (target.openTicks === null) {
    target.openTicks = bar.openTicks;
    target.highTicks = bar.highTicks;
    target.lowTicks = bar.lowTicks;
  } else {
    target.highTicks = Math.max(target.highTicks, bar.highTicks);
    target.lowTicks = Math.min(target.lowTicks, bar.lowTicks);
  }
  target.closeTicks = bar.closeTicks;
}

/**
 * Minute chart bars are a derived transport projection, not persisted
 * authority. Cache only the already-closed prefix so a new three-second frame
 * updates one minute bucket instead of rescanning the complete natural day.
 */
function minuteBarsForSeries(series) {
  let cache = minuteBarProjectionCaches.get(series.bars);
  if (!cache) {
    cache = {
      processedLength: series.bars.length,
      minuteBars: aggregateBars(series.bars, 60_000),
    };
    minuteBarProjectionCaches.set(series.bars, cache);
    return cache.minuteBars;
  }
  if (cache.processedLength > series.bars.length) {
    cache.processedLength = series.bars.length;
    cache.minuteBars = aggregateBars(series.bars, 60_000);
    return cache.minuteBars;
  }
  for (
    let index = cache.processedLength;
    index < series.bars.length;
    index += 1
  ) {
    const bar = series.bars[index];
    const minuteStartMs =
      Math.floor(bar.startMs / 60_000) * 60_000;
    let target = cache.minuteBars.at(-1);
    if (!target || target.startMs !== minuteStartMs) {
      target = {
        startMs: minuteStartMs,
        endMs: bar.endMs,
        openTicks: null,
        highTicks: null,
        lowTicks: null,
        closeTicks: null,
        volume: 0,
        turnoverTicks: 0,
        tradeCount: 0,
      };
      cache.minuteBars.push(target);
    }
    mergeMinuteProjectionBar(target, bar);
  }
  cache.processedLength = series.bars.length;
  return cache.minuteBars;
}

function emptyMinuteBarSummary() {
  return {
    openingTicks: null,
    highTicks: null,
    lowTicks: null,
    volume: 0,
    turnoverTicks: 0,
    tradeCount: 0,
  };
}

function mergeMinuteBarSummary(summary, bar) {
  const volume = Number(
    bar.volume ?? bar.volumeShares ?? 0,
  );
  const turnoverTicks = Number(
    bar.turnoverTicks ?? bar.turnoverCents ?? 0,
  );
  const tradeCount = Number(bar.tradeCount ?? 0);
  if (
    bar.openTicks !== null &&
    (volume > 0 || tradeCount > 0)
  ) {
    if (summary.openingTicks === null) {
      summary.openingTicks = bar.openTicks;
      summary.highTicks = bar.highTicks;
      summary.lowTicks = bar.lowTicks;
    } else {
      summary.highTicks = Math.max(
        summary.highTicks,
        bar.highTicks,
      );
      summary.lowTicks = Math.min(
        summary.lowTicks,
        bar.lowTicks,
      );
    }
    summary.volume += volume;
    summary.turnoverTicks += turnoverTicks;
    summary.tradeCount += tradeCount;
  }
  return summary;
}

function rebuildArchivedMinuteDayProjection(
  state,
  source,
  series,
) {
  const bars = barsInTimeRange(
    source,
    series.dayStartMs,
    series.dayEndMs,
  ).filter(
    (bar) =>
      bar.startMs >= series.dayStartMs &&
      bar.endMs <= series.dayEndMs,
  );
  projectionDiagnosticsFor(
    state,
  ).archivedMinuteBarsScanned += bars.length;
  const summary = emptyMinuteBarSummary();
  for (const bar of bars) mergeMinuteBarSummary(summary, bar);
  const cache = {
    dayStartMs: series.dayStartMs,
    dayEndMs: series.dayEndMs,
    sourceLength: source.length,
    sourceFirst: source[0] ?? null,
    sourceLast: source.at(-1) ?? null,
    bars,
    summary,
  };
  archivedMinuteDayProjectionCaches.set(source, cache);
  return cache;
}

function archivedMinuteDayProjection(
  state,
  symbol,
  series,
) {
  const source =
    state.barArchives.bySymbol[symbol].minuteBars;
  let cache = archivedMinuteDayProjectionCaches.get(source);
  if (
    !cache ||
    cache.dayStartMs !== series.dayStartMs ||
    cache.dayEndMs !== series.dayEndMs ||
    cache.sourceLength > source.length ||
    (
      cache.sourceLength > 0 &&
      (
        source[0] !== cache.sourceFirst ||
        source[cache.sourceLength - 1] !== cache.sourceLast
      )
    )
  ) {
    return rebuildArchivedMinuteDayProjection(
      state,
      source,
      series,
    );
  }
  if (cache.sourceLength === source.length) {
    return cache;
  }
  const additions = source.slice(cache.sourceLength);
  projectionDiagnosticsFor(
    state,
  ).archivedMinuteBarsScanned += additions.length;
  for (const bar of additions) {
    if (
      bar.startMs >= series.dayStartMs &&
      bar.endMs <= series.dayEndMs
    ) {
      cache.bars.push(bar);
      mergeMinuteBarSummary(cache.summary, bar);
    }
  }
  cache.sourceLength = source.length;
  cache.sourceFirst = source[0] ?? null;
  cache.sourceLast = source.at(-1) ?? null;
  return cache;
}

function archivedMinuteBarsForDay(
  state,
  symbol,
  series,
) {
  return archivedMinuteDayProjection(
    state,
    symbol,
    series,
  ).bars;
}

function mergeOrderedMinuteBars(leftBars, rightBars) {
  const merged = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (
    leftIndex < leftBars.length ||
    rightIndex < rightBars.length
  ) {
    const left = leftBars[leftIndex];
    const right = rightBars[rightIndex];
    if (!right) {
      merged.push(left);
      leftIndex += 1;
      continue;
    }
    if (!left) {
      merged.push(right);
      rightIndex += 1;
      continue;
    }
    if (left.startMs < right.startMs) {
      merged.push(left);
      leftIndex += 1;
      continue;
    }
    if (right.startMs < left.startMs) {
      merged.push(right);
      rightIndex += 1;
      continue;
    }
    // Live authority is newer when a restore/migration briefly exposes the
    // same minute in both layers.
    merged.push(right);
    leftIndex += 1;
    rightIndex += 1;
  }
  return merged;
}

function minuteBarsForCurrentDay(
  state,
  symbol,
  series,
) {
  projectionDiagnosticsFor(
    state,
  ).minuteBarsCurrentDayCalls += 1;
  return mergeOrderedMinuteBars(
    archivedMinuteBarsForDay(
      state,
      symbol,
      series,
    ),
    minuteBarsForSeries(series),
  );
}

function barsInTimeRange(bars, startMs, endMs) {
  let low = 0;
  let high = bars.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (bars[middle].endMs <= startMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const firstIndex = low;
  low = firstIndex;
  high = bars.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (bars[middle].startMs < endMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return bars.slice(firstIndex, low);
}

function framePublicationTimeDomain(state) {
  return deriveFixedIntradayTimeDomain(state.nowMs, {
    clockOffsetMs: MARKET_CLOCK_ORIGIN_OFFSET_MS,
  });
}

function minuteBarsForFramePublication(
  state,
  symbol,
  series,
) {
  const domain = framePublicationTimeDomain(state);
  return mergeOrderedMinuteBars(
    barsInTimeRange(
      archivedMinuteBarsForDay(
        state,
        symbol,
        series,
      ),
      domain.startMs,
      domain.endMs,
    ),
    barsInTimeRange(
      minuteBarsForSeries(series),
      domain.startMs,
      domain.endMs,
    ),
  );
}

function completedMinuteWindowForFramePublication(
  state,
  symbol,
  series,
) {
  const domain = framePublicationTimeDomain(state);
  if (
    domain.startMs <= series.dayStartMs ||
    state.nowMs >= domain.startMs + 60_000
  ) {
    return [];
  }
  return mergeOrderedMinuteBars(
    barsInTimeRange(
      archivedMinuteBarsForDay(
        state,
        symbol,
        series,
      ),
      domain.startMs - INTRADAY_WINDOW_MS,
      domain.startMs,
    ),
    barsInTimeRange(
      minuteBarsForSeries(series),
      domain.startMs - INTRADAY_WINDOW_MS,
      domain.startMs,
    ),
  );
}

function firstFillIndexAtOrAfter(fills, timestampMs) {
  let low = 0;
  let high = fills.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (fills[middle].timestampMs < timestampMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function firstFillIndexAfter(fills, timestampMs) {
  let low = 0;
  let high = fills.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (fills[middle].timestampMs <= timestampMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function fillsAtTimestamp(fills, timestampMs) {
  const first = firstFillIndexAtOrAfter(
    fills,
    timestampMs,
  );
  const after = firstFillIndexAfter(
    fills,
    timestampMs,
  );
  return fills.slice(first, after);
}

function unclosedFillStartMs(series) {
  return (
    series.bars.length === 0 &&
    series.closedUntilMs === series.dayStartMs
  )
    ? series.dayStartMs
    : series.closedUntilMs + 1;
}

function minuteBarAtStart(
  state,
  symbol,
  series,
  startMs,
) {
  const live = minuteBarsForSeries(series);
  const liveMatch = barsInTimeRange(
    live,
    startMs,
    startMs + 60_000,
  ).find((bar) => bar.startMs === startMs);
  if (liveMatch) return liveMatch;
  return barsInTimeRange(
    archivedMinuteBarsForDay(
      state,
      symbol,
      series,
    ),
    startMs,
    startMs + 60_000,
  ).find((bar) => bar.startMs === startMs) ?? null;
}

function currentOrdinaryBucketAuthority(
  state,
  symbol,
  series,
  published,
  tailFills,
) {
  const bucketStartMs =
    state.nowMs === 0
      ? 0
      : Math.floor((state.nowMs - 1) / 60_000) * 60_000;
  const bucketEndMs = bucketStartMs + 60_000;
  const domain = framePublicationTimeDomain(state);
  const includesStartBoundary = bucketStartMs === domain.startMs;
  let openTicks = published?.openTicks ?? null;
  let highTicks = published?.highTicks ?? null;
  let lowTicks = published?.lowTicks ?? null;
  let closeTicks = published?.closeTicks ?? null;
  let volume = Number(
    published?.volume ?? published?.volumeShares ?? 0,
  );
  let turnoverTicks = Number(
    published?.turnoverTicks ?? published?.turnoverCents ?? 0,
  );
  let tradeCount = Number(published?.tradeCount ?? 0);
  let latestEventMs = null;
  for (const fill of series.fills) {
    if (
      (
        fill.timestampMs > bucketStartMs ||
        (
          includesStartBoundary &&
          fill.timestampMs === bucketStartMs
        )
      ) &&
      fill.timestampMs <= Math.min(state.nowMs, bucketEndMs)
    ) {
      latestEventMs = fill.timestampMs;
    }
  }
  for (const fill of tailFills) {
    if (
      (
        fill.timestampMs < bucketStartMs ||
        (
          fill.timestampMs === bucketStartMs &&
          !includesStartBoundary
        )
      ) ||
      fill.timestampMs > bucketEndMs
    ) {
      continue;
    }
    if (openTicks === null) {
      openTicks = fill.priceTicks;
      highTicks = fill.priceTicks;
      lowTicks = fill.priceTicks;
    } else {
      highTicks = Math.max(highTicks, fill.priceTicks);
      lowTicks = Math.min(lowTicks, fill.priceTicks);
    }
    closeTicks = fill.priceTicks;
    volume += fill.quantity;
    turnoverTicks += fill.priceTicks * fill.quantity;
    tradeCount += 1;
    latestEventMs = fill.timestampMs;
  }
  if (
    openTicks === null ||
    closeTicks === null ||
    tradeCount === 0
  ) {
    return null;
  }
  return {
    symbol,
    bucketId: Math.floor(bucketStartMs / 60_000),
    startMs: bucketStartMs,
    endMs: bucketEndMs,
    openTicks,
    highTicks,
    lowTicks,
    closeTicks,
    volumeShares: volume,
    volume,
    turnoverCents: turnoverTicks,
    turnoverTicks,
    tradeCount,
    latestEventMs,
    closed: state.nowMs >= bucketEndMs,
  };
}

function intradayChartAuthority(state, symbol, series) {
  const domain = framePublicationTimeDomain(state);
  const security = state.world.market.securities[symbol];
  const exactFills = mergedUltraFills(
    fillsAtTimestamp(
      state.barArchives.bySymbol[symbol].ultraFills,
      domain.startMs,
    ),
    series.fills,
  );
  const archivedProjection = archivedMinuteDayProjection(
    state,
    symbol,
    series,
  );
  const summary = {
    ...archivedProjection.summary,
  };
  for (const bar of minuteBarsForSeries(series)) {
    mergeMinuteBarSummary(summary, bar);
  }
  const tailStart = firstFillIndexAtOrAfter(
    series.fills,
    unclosedFillStartMs(series),
  );
  const tailFills = series.fills.slice(tailStart);
  const openingTicks =
    summary.openingTicks ??
    tailFills[0]?.priceTicks ??
    null;
  const highTicks =
    openingTicks === null
      ? null
      : Math.max(
          openingTicks,
          summary.highTicks ?? openingTicks,
          ...tailFills.map((fill) => fill.priceTicks),
        );
  const lowTicks =
    openingTicks === null
      ? null
      : Math.min(
          openingTicks,
          summary.lowTicks ?? openingTicks,
          ...tailFills.map((fill) => fill.priceTicks),
        );

  const boundaryIndex = firstFillIndexAtOrAfter(
    exactFills,
    domain.startMs,
  );
  let boundaryTrade = null;
  let boundaryCursor = boundaryIndex;
  while (
    boundaryCursor < exactFills.length &&
    exactFills[boundaryCursor].timestampMs ===
      domain.startMs
  ) {
    const fill = exactFills[boundaryCursor];
    boundaryTrade ??= {
      timeMs: domain.startMs,
      priceTicks: fill.priceTicks,
      volume: 0,
      turnoverTicks: 0,
      tradeCount: 0,
    };
    boundaryTrade.priceTicks = fill.priceTicks;
    boundaryTrade.volume += fill.quantity;
    boundaryTrade.turnoverTicks +=
      fill.priceTicks * fill.quantity;
    boundaryTrade.tradeCount += 1;
    boundaryCursor += 1;
  }
  const carryIndex = boundaryTrade
    ? boundaryCursor - 1
    : boundaryIndex - 1;
  const carryInPriceTicks =
    exactFills[carryIndex]?.priceTicks ??
    securityPriceBand(security).previousCloseTicks;
  const sessionVolumeShares =
    summary.volume +
    tailFills.reduce(
      (total, fill) => total + fill.quantity,
      0,
    );
  const sessionTurnoverCents =
    summary.turnoverTicks +
    tailFills.reduce(
      (total, fill) =>
        total + fill.priceTicks * fill.quantity,
      0,
    );
  const latestFill = exactFills[
    firstFillIndexAfter(exactFills, state.nowMs) - 1
  ];
  const latestEventMs =
    latestFill?.timestampMs >= series.dayStartMs
      ? latestFill.timestampMs
      : null;
  const currentBucketStartMs =
    state.nowMs === 0
      ? 0
      : Math.floor((state.nowMs - 1) / 60_000) * 60_000;

  return {
    sessionStartMs: series.dayStartMs,
    openingTicks,
    highTicks,
    lowTicks,
    domainStartMs: domain.startMs,
    carryInPriceTicks,
    boundaryTrade,
    sessionVolumeShares,
    sessionTurnoverCents,
    latestEventMs,
    ordinaryCurrentBucket: currentOrdinaryBucketAuthority(
      state,
      symbol,
      series,
      minuteBarAtStart(
        state,
        symbol,
        series,
        currentBucketStartMs,
      ),
      tailFills,
    ),
  };
}

function sessionSnapshotProjection(chartAuthority) {
  return {
    sessionStartMs: chartAuthority.sessionStartMs,
    sessionOpenTicks: chartAuthority.openingTicks,
    sessionHighTicks: chartAuthority.highTicks,
    sessionLowTicks: chartAuthority.lowTicks,
    sessionVolumeShares: chartAuthority.sessionVolumeShares,
    sessionTurnoverCents: chartAuthority.sessionTurnoverCents,
    latestEventMs: chartAuthority.latestEventMs,
    ordinaryCurrentBucket:
      chartAuthority.ordinaryCurrentBucket,
  };
}

function shareholderName(state, account) {
  if (account.id === 'player') return '我的账户';
  const investor =
    state.world.entities?.investors?.[account.id];
  if (typeof investor?.name === 'string' && investor.name.length > 0) {
    return investor.name;
  }
  const agent = state.agentEcology?.agents?.[account.id];
  if (typeof agent?.name === 'string' && agent.name.length > 0) {
    return agent.name;
  }
  if (account.id === 'maker_chengming') return '澄明做市';
  if (account.id === 'maker_lingnan') return '岭南做市';
  return account.kind === 'proprietary_maker'
    ? '做市账户'
    : '市场账户';
}

function shareholderKind(state, account) {
  if (account.id === 'player') return 'player';
  const investor =
    state.world.entities?.investors?.[account.id];
  if (
    typeof investor?.holderKind === 'string' &&
    investor.holderKind.length > 0
  ) {
    return investor.holderKind;
  }
  return account.kind === 'proprietary_maker'
    ? 'maker'
    : 'institution';
}

function shareholderMetadata(state, account, symbol, quantity) {
  const investor =
    state.world.entities?.investors?.[account.id];
  if (investor) {
    return {
      beneficialOwner:
        investor.beneficialOwner ?? investor.name,
      holderNature:
        investor.holderNature ?? 'investment_fund',
      controlChain: Array.isArray(investor.controlChain)
        ? [...investor.controlChain]
        : [investor.name],
      votesPerUnitBps: Math.max(
        1,
        Math.trunc(
          Number(
            investor.votesPerUnitBps ?? 10_000,
          ),
        ),
      ),
      lockedUnits: Math.min(
        quantity,
        Math.max(
          0,
          Math.trunc(
            Number(
              investor.lockedUnitsBySymbol?.[symbol],
            ) || 0,
          ),
        ),
      ),
      pledgedUnits: Math.min(
        quantity,
        Math.max(
          0,
          Math.trunc(
            Number(
              investor.pledgedUnitsBySymbol?.[symbol],
            ) || 0,
          ),
        ),
      ),
    };
  }
  if (account.id === 'player') {
    return {
      beneficialOwner: '玩家本人或玩家所管理产品',
      holderNature:
        state.world.player?.roleType === 'household' ||
        state.world.player?.roleType === 'private_whale'
          ? 'natural_person'
          : 'player_managed_vehicle',
      controlChain: ['玩家账户'],
      votesPerUnitBps: 10_000,
      lockedUnits: 0,
      pledgedUnits: 0,
    };
  }
  return {
    beneficialOwner:
      account.kind === 'proprietary_maker'
        ? '做市业务自营账户'
        : '市场账户受益所有人',
    holderNature:
      account.kind === 'proprietary_maker'
        ? 'market_maker'
        : 'institution',
    controlChain: [],
    votesPerUnitBps: 10_000,
    lockedUnits: 0,
    pledgedUnits: 0,
  };
}

function shareholderCacheFor(state) {
  let cache = shareholderProjectionCaches.get(state);
  if (!cache || cache.accountsRoot !== state.accounts) {
    cache = {
      accountsRoot: state.accounts,
      accounts: Object.values(state.accounts),
      bySymbol: new Map(),
    };
    shareholderProjectionCaches.set(state, cache);
  }
  return cache;
}

function publicShareholderProjection(state, symbol, security) {
  const diagnostics = projectionDiagnosticsFor(state);
  diagnostics.shareholderProjectionCalls += 1;
  const outstandingUnits = Math.max(
    0,
    Math.trunc(
      Number(
        security.outstandingUnits ??
          security.valuation?.metrics?.sharesOutstanding,
      ) || 0,
    ),
  );
  const projectionCache = shareholderCacheFor(state);
  const accounts = projectionCache.accounts;
  const quantities = new Array(accounts.length);
  const names = new Array(accounts.length);
  const kinds = new Array(accounts.length);
  const metadata = new Array(accounts.length);
  let unchanged =
    projectionCache.bySymbol.has(symbol);
  const prior = projectionCache.bySymbol.get(symbol);
  if (
    !prior ||
    prior.outstandingUnits !== outstandingUnits ||
    prior.accountIds.length !== accounts.length
  ) {
    unchanged = false;
  }
  for (let index = 0; index < accounts.length; index += 1) {
    const account = accounts[index];
    const quantity = Math.max(
      0,
      Math.trunc(Number(account.holdings?.[symbol]) || 0),
    );
    const name = shareholderName(state, account);
    const kind = shareholderKind(state, account);
    const holderMetadata = shareholderMetadata(
      state,
      account,
      symbol,
      quantity,
    );
    quantities[index] = quantity;
    names[index] = name;
    kinds[index] = kind;
    metadata[index] = holderMetadata;
    if (
      unchanged &&
      (
        prior.accountIds[index] !== account.id ||
        prior.quantities[index] !== quantity ||
        prior.names[index] !== name ||
        prior.kinds[index] !== kind
      )
    ) {
      unchanged = false;
    }
  }
  if (unchanged) {
    return {
      asOfCommitSeq: state.commitSeq,
      ...prior.projection,
    };
  }
  diagnostics.shareholderRankBuilds += 1;
  diagnostics.shareholderAccountsRanked += accounts.length;
  const ranked = accounts
    .map((account, index) => ({
      id: account.id,
      name: names[index],
      kind: kinds[index],
      quantity: quantities[index],
      isPlayer: account.id === 'player',
      ...metadata[index],
    }))
    .filter((holder) => holder.quantity > 0)
    .sort(
      (left, right) =>
        right.quantity - left.quantity ||
        left.name.localeCompare(right.name, 'zh-CN') ||
        left.id.localeCompare(right.id),
    );
  const accountedUnits = ranked.reduce(
    (sum, holder) => sum + holder.quantity,
    0,
  );
  const totalVotingWeight = ranked.reduce(
    (sum, holder) =>
      sum +
      holder.quantity * holder.votesPerUnitBps,
    0,
  );
  const top = ranked.slice(0, 5).map((holder, index) => ({
    rank: index + 1,
    name: holder.name,
    kind: holder.kind,
    quantity: holder.quantity,
    ownershipBps:
      outstandingUnits > 0
        ? Math.round(
            holder.quantity * 10_000 / outstandingUnits,
          )
        : 0,
    isPlayer: holder.isPlayer,
    beneficialOwner: holder.beneficialOwner,
    holderNature: holder.holderNature,
    controlChain: holder.controlChain,
    votingRightsBps:
      totalVotingWeight > 0
        ? Math.round(
            holder.quantity *
              holder.votesPerUnitBps *
              10_000 /
              totalVotingWeight,
          )
        : 0,
    lockedUnits: holder.lockedUnits,
    pledgedUnits: holder.pledgedUnits,
  }));
  const projection = {
    outstandingUnits,
    registeredUnits: accountedUnits,
    accountedUnits,
    votingRightsBpsTotal:
      accountedUnits === outstandingUnits
        ? 10_000
        : Math.round(
            accountedUnits * 10_000 /
              Math.max(1, outstandingUnits),
          ),
    top,
    othersUnits:
      accountedUnits -
      top.reduce((sum, holder) => sum + holder.quantity, 0),
  };
  projectionCache.bySymbol.set(symbol, {
    outstandingUnits,
    accountIds: accounts.map((account) => account.id),
    quantities,
    names,
    kinds,
    projection,
  });
  return {
    asOfCommitSeq: state.commitSeq,
    ...projection,
  };
}

function companyResearchProjection(
  state,
  symbol,
  company,
  valuation,
) {
  const service =
    state.world.socialCareer?.researchNetwork
      ?.services?.playerCoverage;
  const report =
    service?.reportsBySymbol?.[symbol] ?? null;
  const worldTick = state.world.world.tick;
  const ageDays = report
    ? Math.max(0, worldTick - report.processedTick)
    : null;
  const leadAvailable =
    service?.availability?.leadAvailable === true;
  const reportFresh =
    report &&
    ageDays <=
      Number(service?.reportFreshnessDays ?? 0);
  const frozenModel = report?.model ?? null;
  const processed =
    Boolean(
      service?.active &&
      reportFresh &&
      Number.isSafeInteger(frozenModel?.lowTicks) &&
      frozenModel.lowTicks > 0 &&
      Number.isSafeInteger(frozenModel?.midpointTicks) &&
      Number.isSafeInteger(frozenModel?.highTicks) &&
      frozenModel.highTicks > frozenModel.lowTicks,
    );
  const analyst =
    report
      ? state.world.socialCareer?.actors?.[
          report.analystId
        ]
      : null;
  const drivers = Array.isArray(report?.drivers)
    ? report.drivers
    : [];
  return {
    status: processed ? 'processed' : 'public_only',
    serviceStatus:
      service?.availability?.serviceStatus ??
      'public_only',
    publicDataAvailable: true,
    marketDataIndependent: true,
    leadAvailable,
    covered: Boolean(
      service?.coverageSymbols?.includes(symbol),
    ),
    analystId: processed ? report.analystId : null,
    analystName: processed
      ? analyst?.name ?? '覆盖人员'
      : null,
    processingMode: processed
      ? report.processingMode
      : null,
    asOfTick: processed
      ? report.processedTick
      : null,
    ageDays: processed ? ageDays : null,
    qualityBps: processed
      ? report.qualityBps
      : null,
    informationDelayDays: processed
      ? report.informationDelayDays
      : null,
    errorBandBps: processed
      ? report.errorBandBps
      : null,
    model: processed ? cloneJson(frozenModel) : null,
    drivers: processed ? drivers : [],
  };
}

function symbolSnapshot(
  state,
  symbol,
  {
    includeIntraday = false,
    framePublication = false,
    includeUltraDelta = false,
    ultraDeltaAfterMs = null,
    includeLevel2Depth = null,
    includeStableFacts = true,
    marketData = getMarketDataProjection(state.world),
  } = {},
) {
  const series = state.barSeries[symbol];
  const reusableFrameSymbol =
    includeIntraday &&
    state.quoteFrames.at(-1)?.virtualMs ===
      state.nowMs &&
    Array.isArray(
      state.quoteFrames.at(-1)?.symbols?.[symbol]?.bids,
    ) &&
    Array.isArray(
      state.quoteFrames.at(-1)?.symbols?.[symbol]?.asks,
    )
      ? state.quoteFrames.at(-1)?.symbols?.[
          symbol
        ]
      : null;
  if (reusableFrameSymbol) {
    const snapshot = {
      ...reusableFrameSymbol,
      authorityCommitSeq: state.commitSeq,
    };
    const level2Realtime =
      snapshot.level2Realtime === true;
    const publishLevel2Depth =
      includeLevel2Depth === true ||
      (
        includeLevel2Depth !== false &&
        (!framePublication || !level2Realtime)
      );
    if (!publishLevel2Depth) {
      delete snapshot.level2Depth;
    }
    if (!includeStableFacts) {
      delete snapshot.valuation;
      delete snapshot.research;
      delete snapshot.shareholders;
    }
    snapshot.chartAuthority = intradayChartAuthority(
      state,
      symbol,
      series,
    );
    Object.assign(
      snapshot,
      sessionSnapshotProjection(snapshot.chartAuthority),
    );
    snapshot.turnoverTruth =
      publicTurnoverTruth(state, symbol);
    snapshot.intradayBars = framePublication
      ? []
      : series.bars.map((bar) =>
          visibleBar(state, symbol, bar),
        );
    const minuteBars = framePublication
      ? minuteBarsForFramePublication(
          state,
          symbol,
          series,
        ).slice(-2)
      : minuteBarsForCurrentDay(
          state,
          symbol,
          series,
        );
    snapshot.minuteBars = minuteBars.map(
      (bar) => visibleBar(state, symbol, bar),
    );
    if (framePublication) {
      const completedWindow =
        completedMinuteWindowForFramePublication(
          state,
          symbol,
          series,
        );
      if (completedWindow.length > 0) {
        snapshot.archivedMinuteBars =
          completedWindow.map((bar) =>
            visibleBar(state, symbol, bar),
          );
      }
      snapshot.ultraTradeDeltas = level2Realtime
        ? currentUltraTradeDeltas(
            state,
            symbol,
          )
        : quoteCadenceTrades(
            state,
            symbol,
            { latestOnly: true },
          );
    } else {
      snapshot.archivedMinuteBars =
        state.barArchives.bySymbol[
          symbol
        ].minuteBars;
      snapshot.dailyBars =
        state.barArchives.bySymbol[
          symbol
        ].dailyBars;
      snapshot.ultraTrades = level2Realtime
        ? completeUltraTrades(state, symbol)
        : quoteCadenceTrades(state, symbol);
      if (!includeUltraDelta) {
        delete snapshot.ultraTradeDeltas;
      }
    }
    return snapshot;
  }
  const playerQuantities = new Map();
  for (const order of activeOrdersForOwner(
    state.books[symbol],
    'player',
  )) {
    const key = `${order.side}:${order.priceTicks}`;
    playerQuantities.set(
      key,
      (playerQuantities.get(key) ?? 0) + order.remainingQty,
    );
  }
  const withPlayerQuantity = (levels, side) =>
    levels.map((level) => ({
      ...level,
      playerQuantity:
        playerQuantities.get(`${side}:${level.priceTicks}`) ?? 0,
    }));
  const rawDepth = aggregateBook(state.books[symbol], 10);
  const depth = {
    bids: withPlayerQuantity(rawDepth.bids, 'buy'),
    asks: withPlayerQuantity(rawDepth.asks, 'sell'),
  };
  const security = state.world.market.securities[symbol];
  const company = includeStableFacts
    ? state.world.entities.companies[security.issuerId]
    : null;
  const valuation = includeStableFacts
    ? (
        security.valuation ??
        deriveIssuerValuation({
          company,
          security,
          facts: state.world.facts,
          worldTick: state.world.world.tick,
        })
      )
    : null;
  const priceBand = securityPriceBand(security);
  const lastPriceTicks = cents(security.lastPrice);
  const changeTicks =
    lastPriceTicks - priceBand.previousCloseTicks;
  const level2Active =
    marketData.viewer.entitlements?.L2_DEPTH_100?.status === 'active';
  const level2Realtime =
    level2Active &&
    (priceBand.board === 'star' || priceBand.board === 'chinext');
  const publishLevel2Depth =
    level2Active &&
    (
      includeLevel2Depth === true ||
      (
        includeLevel2Depth !== false &&
        (!framePublication || !level2Realtime)
      )
    );
  const chartAuthority = intradayChartAuthority(
    state,
    symbol,
    series,
  );
  const snapshot = {
    authorityCommitSeq: state.commitSeq,
    lastPriceTicks,
    previousCloseTicks: priceBand.previousCloseTicks,
    limitUpTicks: priceBand.limitUpTicks,
    limitDownTicks: priceBand.limitDownTicks,
    dailyLimitBps: priceBand.dailyLimitBps,
    board: priceBand.board,
    quoteCadenceMs: level2Realtime ? 1 : QUOTE_FRAME_MS,
    level2Realtime,
    changeTicks,
    changeBps: Math.round(
      changeTicks *
        10_000 /
        priceBand.previousCloseTicks,
    ),
    direction:
      changeTicks > 0 ? 'up' : changeTicks < 0 ? 'down' : 'flat',
    ...sessionSnapshotProjection(chartAuthority),
    turnoverTruth: publicTurnoverTruth(state, symbol),
    bids: depth.bids,
    asks: depth.asks,
    frameBar: visibleBar(state, symbol, series.bars.at(-1)),
  };
  if (includeStableFacts) {
    snapshot.valuation = valuation;
    snapshot.research = companyResearchProjection(
      state,
      symbol,
      company,
      valuation,
    );
    snapshot.shareholders = publicShareholderProjection(
      state,
      symbol,
      security,
    );
  }
  if (publishLevel2Depth) {
    const level2 = aggregateBook(state.books[symbol], 100);
    snapshot.level2Depth = {
      bids: withPlayerQuantity(level2.bids, 'buy'),
      asks: withPlayerQuantity(level2.asks, 'sell'),
      depth: 100,
      actualBidLevels: level2.bids.length,
      actualAskLevels: level2.asks.length,
      source: 'authoritative_active_orders',
    };
  }
  if (includeIntraday) {
    snapshot.chartAuthority = chartAuthority;
    snapshot.intradayBars = framePublication
      ? []
      : series.bars.map((bar) =>
          visibleBar(state, symbol, bar),
        );
    const minuteBars = framePublication
      ? minuteBarsForFramePublication(
          state,
          symbol,
          series,
        ).slice(-2)
      : minuteBarsForCurrentDay(
          state,
          symbol,
          series,
        );
    snapshot.minuteBars = minuteBars.map(
      (bar) => visibleBar(state, symbol, bar),
    );
    if (framePublication) {
      const completedWindow =
        completedMinuteWindowForFramePublication(
          state,
          symbol,
          series,
        );
      if (completedWindow.length > 0) {
        snapshot.archivedMinuteBars = completedWindow.map(
          (bar) => visibleBar(state, symbol, bar),
        );
      }
      snapshot.ultraTradeDeltas = level2Realtime
        ? currentUltraTradeDeltas(state, symbol)
        : quoteCadenceTrades(
            state,
            symbol,
            { latestOnly: true },
          );
    } else {
      snapshot.archivedMinuteBars =
        state.barArchives.bySymbol[symbol].minuteBars;
      snapshot.dailyBars =
        state.barArchives.bySymbol[symbol].dailyBars;
      snapshot.ultraTrades = level2Realtime
        ? completeUltraTrades(state, symbol)
        : quoteCadenceTrades(state, symbol);
    }
  }
  if (includeUltraDelta) {
    snapshot.ultraTradeDeltas = level2Realtime
      ? ultraDeltaAfterMs === null
        ? currentUltraTradeDeltas(state, symbol)
        : ultraTradeDeltasAfterMs(
            state,
            symbol,
            ultraDeltaAfterMs,
          )
      : quoteCadenceTrades(
          state,
          symbol,
          { latestOnly: true },
        );
  }
  return snapshot;
}

function compactHistoricalQuoteFrame(frame) {
  return {
    virtualMs: frame.virtualMs,
    worldTick: frame.worldTick,
    tradeCount: frame.tradeCount,
    volume: frame.volume,
    commitSeq: frame.commitSeq,
    frameBars: frame.frameBars,
    symbols: Object.fromEntries(
      Object.entries(frame.symbols).map(([symbol, snapshot]) => [
        symbol,
        {
          lastPriceTicks: snapshot.lastPriceTicks,
          frameBar: snapshot.frameBar,
        },
      ]),
    ),
  };
}

function compactCurrentQuoteFrameSymbol(
  state,
  symbol,
  frameBar,
  marketData,
) {
  const security = state.world.market.securities[symbol];
  const level2Active =
    marketData.viewer.entitlements?.L2_DEPTH_100?.status ===
    'active';
  const level2Realtime =
    level2Active &&
    (
      security.board === 'star' ||
      security.board === 'chinext'
    );
  return {
    lastPriceTicks: cents(security.lastPrice),
    frameBar: visibleBar(state, symbol, frameBar),
    ultraTradeDeltas: level2Realtime
      ? currentUltraTradeDeltas(state, symbol)
      : quoteCadenceTrades(state, symbol, {
          latestOnly: true,
        }),
  };
}

function archivedMinuteBarIndex(minuteBars) {
  let index = archivedMinuteBarIndexes.get(minuteBars);
  if (
    !index ||
    index.sourceLength !== minuteBars.length ||
    (
      minuteBars.length > 0 &&
      (
        index.sourceFirst !== minuteBars[0] ||
        index.sourceLast !== minuteBars.at(-1)
      )
    )
  ) {
    index = {
      sourceLength: minuteBars.length,
      sourceFirst: minuteBars[0] ?? null,
      sourceLast: minuteBars.at(-1) ?? null,
      byInterval: new Map(
        minuteBars.map((bar) => [
          `${bar.startMs}:${bar.endMs}`,
          bar,
        ]),
      ),
    };
    archivedMinuteBarIndexes.set(minuteBars, index);
  }
  return index;
}

function appendArchivedMinuteBars(
  state,
  symbol,
  bars,
) {
  const archive =
    state.barArchives.bySymbol[symbol];
  let index = archivedMinuteBarIndex(
    archive.minuteBars,
  );
  let requiresRebuild = false;
  for (const bar of bars) {
    const visible =
      Object.hasOwn(bar, 'frameStartMs')
        ? bar
        : visibleBar(state, symbol, bar);
    const key =
      `${visible.startMs}:${visible.endMs}`;
    const existing = index.byInterval.get(key);
    if (existing) {
      if (!sameJson(existing, visible)) {
        throw new Error(
          `Closed minute authority changed for ${symbol} at ${visible.startMs}.`,
        );
      }
      continue;
    }
    const priorLast = archive.minuteBars.at(-1);
    if (
      priorLast &&
      (
        visible.startMs < priorLast.startMs ||
        (
          visible.startMs === priorLast.startMs &&
          visible.endMs < priorLast.endMs
        )
      )
    ) {
      requiresRebuild = true;
    }
    archive.minuteBars.push(visible);
    projectionDiagnosticsFor(
      state,
    ).archivedMinuteBarsAppended += 1;
    index.byInterval.set(key, visible);
  }
  if (requiresRebuild) {
    archive.minuteBars.sort(
      (left, right) =>
        left.startMs - right.startMs ||
        left.endMs - right.endMs,
    );
  }
  if (
    archive.minuteBars.length >
    MAX_ARCHIVED_MINUTE_BARS_PER_SYMBOL
  ) {
    archive.minuteBars.splice(
      0,
      archive.minuteBars.length -
        MAX_ARCHIVED_MINUTE_BARS_PER_SYMBOL,
    );
    requiresRebuild = true;
  }
  if (requiresRebuild) {
    archivedMinuteBarIndexes.delete(
      archive.minuteBars,
    );
    index = archivedMinuteBarIndex(
      archive.minuteBars,
    );
  } else {
    index.sourceLength = archive.minuteBars.length;
    index.sourceFirst = archive.minuteBars[0] ?? null;
    index.sourceLast = archive.minuteBars.at(-1) ?? null;
  }
}

function archivedUltraFillIndex(ultraFills) {
  let index = archivedUltraFillIndexes.get(
    ultraFills,
  );
  if (
    !index ||
    index.sourceLength !== ultraFills.length ||
    (
      ultraFills.length > 0 &&
      (
        index.sourceFirst !== ultraFills[0] ||
        index.sourceLast !== ultraFills.at(-1)
      )
    )
  ) {
    index = {
      sourceLength: ultraFills.length,
      sourceFirst: ultraFills[0] ?? null,
      sourceLast: ultraFills.at(-1) ?? null,
      byId: new Map(
        ultraFills.map((fill) => [
          `${fill.timestampMs}:${fill.sequence}`,
          fill,
        ]),
      ),
    };
    archivedUltraFillIndexes.set(
      ultraFills,
      index,
    );
  }
  return index;
}

function primeArchivedUltraFillIndexes(state) {
  for (const archive of Object.values(
    state?.barArchives?.bySymbol ?? {},
  )) {
    if (Array.isArray(archive?.ultraFills)) {
      archivedUltraFillIndex(archive.ultraFills);
    }
  }
}

function appendArchivedUltraFills(
  state,
  symbol,
  fills,
  domain,
) {
  const archive =
    state.barArchives.bySymbol[symbol];
  let index = archivedUltraFillIndex(
    archive.ultraFills,
  );
  let requiresRebuild = false;
  for (const fill of fills) {
    if (
      fill.timestampMs < domain.startMs ||
      fill.timestampMs > Math.min(state.nowMs, domain.endMs)
    ) {
      continue;
    }
    const key = `${fill.timestampMs}:${fill.sequence}`;
    const existing = index.byId.get(key);
    if (existing) {
      if (!sameUltraFill(existing, fill)) {
        throw new Error(
          `Closed ultra authority changed for ${symbol} at ${key}.`,
        );
      }
      continue;
    }
    const archived = copyUltraFill(fill);
    const priorLast = archive.ultraFills.at(-1);
    if (
      priorLast &&
      compareUltraFills(priorLast, archived) >= 0
    ) {
      requiresRebuild = true;
    }
    archive.ultraFills.push(archived);
    index.byId.set(key, archived);
  }
  if (requiresRebuild) {
    archive.ultraFills.sort(compareUltraFills);
    archivedUltraFillIndexes.delete(
      archive.ultraFills,
    );
    index = archivedUltraFillIndex(
      archive.ultraFills,
    );
  } else {
    index.sourceLength = archive.ultraFills.length;
    index.sourceFirst = archive.ultraFills[0] ?? null;
    index.sourceLast = archive.ultraFills.at(-1) ?? null;
  }
}

function compactClosedUltraAuthority(
  state,
  symbol,
  series,
  completeMinuteThroughMs,
  domain,
  rotateDomain,
) {
  if (
    completeMinuteThroughMs <=
    series.dayStartMs
  ) {
    if (rotateDomain) {
      state.barArchives.bySymbol[
        symbol
      ].ultraFills = [];
    }
    return;
  }
  const archive =
    state.barArchives.bySymbol[symbol];
  const archivedFirst = archive.ultraFills[0] ?? null;
  const archivedLast = archive.ultraFills.at(-1) ?? null;
  let carry = archivedLast;
  let priorDomainCarry =
    archivedLast?.timestampMs < domain.startMs
      ? archivedLast
      : null;
  let domainAnchor =
    archivedFirst?.timestampMs >= domain.startMs
      ? archivedFirst
      : null;
  const boundaryFills = [];
  const newlyClosedFills = [];
  for (const fill of series.fills) {
    if (fill.timestampMs > completeMinuteThroughMs) {
      break;
    }
    if (!carry || compareUltraFills(carry, fill) < 0) {
      carry = fill;
    }
    if (fill.timestampMs < domain.startMs) {
      if (
        !priorDomainCarry ||
        compareUltraFills(
          priorDomainCarry,
          fill,
        ) < 0
      ) {
        priorDomainCarry = fill;
      }
    } else if (!domainAnchor) {
      domainAnchor = fill;
    }
    if (
      fill.timestampMs === domain.startMs &&
      domain.startMs !== series.dayStartMs
    ) {
      boundaryFills.push(fill);
    }
    if (
      (
        fill.timestampMs > domain.startMs ||
        domain.startMs === series.dayStartMs
      ) &&
      !(
        completeMinuteThroughMs ===
          series.dayStartMs &&
        fill.timestampMs ===
          series.dayStartMs
      )
    ) {
      newlyClosedFills.push(fill);
    }
  }
  if (rotateDomain) {
    archive.ultraFills = [];
    domainAnchor = null;
  }
  appendArchivedUltraFills(
    state,
    symbol,
    newlyClosedFills,
    domain,
  );
  domainAnchor = archive.ultraFills[0] ?? domainAnchor;
  carry = archive.ultraFills.at(-1) ?? carry;
  const liveTail = series.fills.filter(
    (fill) =>
      fill.timestampMs > completeMinuteThroughMs,
  );
  const retained = mergedUltraFills(
    priorDomainCarry ? [priorDomainCarry] : [],
    boundaryFills,
    domainAnchor ? [domainAnchor] : [],
    carry ? [carry] : [],
    liveTail,
  );
  series.fills.splice(
    0,
    series.fills.length,
    ...retained,
  );
}

function compactClosedChartAuthority(state) {
  const completeMinuteThroughMs =
    Math.floor(state.nowMs / 60_000) * 60_000;
  const domain = framePublicationTimeDomain(state);
  const rotateUltraWindow =
    state.nowMs > 0 &&
    domain.startMs === state.nowMs;
  for (const symbol of Object.keys(state.books)) {
    const series = state.barSeries[symbol];
    let completedBarCount = 0;
    while (
      completedBarCount < series.bars.length &&
      series.bars[completedBarCount].endMs <=
        completeMinuteThroughMs
    ) {
      completedBarCount += 1;
    }
    if (
      completeMinuteThroughMs > series.dayStartMs &&
      completedBarCount > 0
    ) {
      const completedBars = series.bars.slice(
        0,
        completedBarCount,
      );
      appendArchivedMinuteBars(
        state,
        symbol,
        aggregateBars(
          completedBars,
          60_000,
        ),
      );
      series.bars.splice(0, completedBarCount);
    }
    compactClosedUltraAuthority(
      state,
      symbol,
      series,
      completeMinuteThroughMs,
      domain,
      rotateUltraWindow,
    );
  }
}

function compactRealtimePriceEvidence(state) {
  for (const security of Object.values(
    state.world.market.securities,
  )) {
    const history = security.priceHistory;
    if (
      !Array.isArray(history) ||
      history.length <= MAX_WORLD_PRICE_HISTORY_POINTS
    ) {
      continue;
    }
    const opening = history.find(
      (point) => point?.tick === 0,
    );
    let legacyCloseAnchor = null;
    for (let index = history.length - 1; index >= 0; index -= 1) {
      if (history[index]?.source === 'matched_npc_orders') {
        legacyCloseAnchor = history[index];
        break;
      }
    }
    const retainedAnchors = [];
    if (opening) retainedAnchors.push(opening);
    if (
      legacyCloseAnchor &&
      legacyCloseAnchor !== opening
    ) {
      retainedAnchors.push(legacyCloseAnchor);
    }
    const tailLength =
      MAX_WORLD_PRICE_HISTORY_POINTS -
      retainedAnchors.length;
    const tail = history.slice(-tailLength);
    security.priceHistory = [
      ...retainedAnchors.filter(
        (anchor) => !tail.includes(anchor),
      ),
      ...tail,
    ];
  }
}

function publishQuoteFrame(
  state,
  { deferMarketMirror = false } = {},
) {
  projectionDiagnosticsFor(state).quoteFrameCount += 1;
  for (const symbol of Object.keys(state.books)) {
    if (
      archiveTerminalOrders(state, symbol) > 0 &&
      deferMarketMirror
    ) {
      markDeferredWorldOrderMirror(state, symbol);
    }
  }
  pruneBoundedAgentReceipts(state);
  const frameBars = {};
  for (const symbol of Object.keys(state.books)) {
    closeFrameInPlace(state.barSeries[symbol], state.nowMs);
    frameBars[symbol] = state.barSeries[symbol].bars.at(-1);
  }
  const liveRealtimeTradeCount =
    state.realtimeAuditArchive.liveChainCount;
  if (liveRealtimeTradeCount > REALTIME_AUDIT_BACKGROUND_TARGET) {
    compactRealtimeAuditOverflow(
      state,
      state.commitSeq,
      REALTIME_AUDIT_BACKGROUND_TARGET,
    );
  }
  if (!deferMarketMirror) syncWorldMarketMirrors(state);
  const marketData = getMarketDataProjection(state.world);
  const archivedFrame = state.realtimeAuditArchive.pendingFrame;
  const frame = {
    virtualMs: state.nowMs,
    worldTick: state.world.world.tick,
    tradeCount: Object.values(frameBars).reduce(
      (sum, bar) => sum + bar.tradeCount,
      0,
    ),
    volume: Object.values(frameBars).reduce(
      (sum, bar) => sum + bar.volume,
      0,
    ),
    commitSeq: state.commitSeq,
    frameBars: Object.fromEntries(
      Object.keys(state.books).map((symbol) => [
        symbol,
        visibleBar(state, symbol, frameBars[symbol]),
      ]),
    ),
    symbols: Object.fromEntries(
      Object.keys(state.books).map((symbol) => [
        symbol,
        compactCurrentQuoteFrameSymbol(
          state,
          symbol,
          frameBars[symbol],
          marketData,
        ),
      ]),
    ),
  };
  if (state.quoteFrames.length > 0) {
    const previousIndex = state.quoteFrames.length - 1;
    state.quoteFrames[previousIndex] = compactHistoricalQuoteFrame(
      state.quoteFrames[previousIndex],
    );
  }
  state.quoteFrames.push(frame);
  if (state.quoteFrames.length > MAX_VISIBLE_FRAMES) {
    state.quoteFrames.splice(0, state.quoteFrames.length - MAX_VISIBLE_FRAMES);
  }
  compactClosedChartAuthority(state);
  compactRealtimePriceEvidence(state);
  archivedFrame.afterFrameMs = state.nowMs;
  archivedFrame.tradeCount = 0;
  archivedFrame.volume = 0;
  scheduleEvent(state, {
    type: 'quote_frame',
    scheduledMs: state.nowMs + QUOTE_FRAME_MS,
    phasePriority: MARKET_PHASE_PRIORITY.QUOTE_FRAME,
  });
  return frame;
}

function archiveNaturalDayBars(state) {
  for (const symbol of Object.keys(state.books)) {
    const series = state.barSeries[symbol];
    const archive = state.barArchives.bySymbol[symbol];
    const liveMinuteBars = aggregateBars(
      series.bars,
      60_000,
    );
    const currentDayArchivedMinutes =
      archivedMinuteBarsForDay(
        state,
        symbol,
        series,
      );
    const dailyBars = aggregateBars(
      [
        ...currentDayArchivedMinutes,
        ...series.bars,
      ],
      WORLD_DAY_MS,
    );
    const visibleDailyBars = dailyBars.map((bar) =>
      visibleBar(state, symbol, bar),
    );
    appendArchivedMinuteBars(
      state,
      symbol,
      liveMinuteBars,
    );
    archive.ultraFills = [];
    archive.dailyBars.push(...visibleDailyBars);
    if (
      archive.dailyBars.length >
      MAX_ARCHIVED_DAILY_BARS_PER_SYMBOL
    ) {
      archive.dailyBars.splice(
        0,
        archive.dailyBars.length -
          MAX_ARCHIVED_DAILY_BARS_PER_SYMBOL,
      );
    }
    state.barSeries[symbol] = createBarSeries(symbol, state.nowMs);
  }
}

function settledClosingPriceTicks(state, symbol) {
  const security = state.world.market.securities[symbol];
  const dayFills = state.barSeries[symbol].fills.filter(
    (fill) =>
      fill.timestampMs > state.lastWorldDaySettlementMs &&
      fill.timestampMs <= state.nowMs,
  );
  return (
    dayFills.at(-1)?.priceTicks ??
    cents(security.lastPrice) ??
    securityPriceBand(security).previousCloseTicks
  );
}

function expireDailyLimitQueueEpisodes(state) {
  const expiredEpisodeIds = new Set();
  for (const agent of Object.values(
    state.agentEcology?.agents ?? {},
  )) {
    const episodes = agent.limitQueueEpisodes;
    if (
      !episodes ||
      Array.isArray(episodes) ||
      typeof episodes !== 'object'
    ) {
      continue;
    }
    for (const episode of Object.values(episodes)) {
      if (typeof episode?.episodeId === 'string') {
        expiredEpisodeIds.add(episode.episodeId);
      }
    }
    // A limit-queue episode is evidence about one closing-price band, not a
    // perpetual maker belief.  Retaining it after previousCloseTicks rolls
    // would attach yesterday's boundary and budget to today's different
    // exchange limit.  The order/trade audit archives retain the settled
    // history; this map contains only live strategy state.
    agent.limitQueueEpisodes = {};
  }
  return expiredEpisodeIds;
}

function rollDailyPriceBands(state, commitSeq) {
  const cancelledOrderIds = [];
  const closingPrices = {};
  const expiredLimitQueueEpisodeIds =
    expireDailyLimitQueueEpisodes(state);
  for (const [symbol, security] of Object.entries(
    state.world.market.securities,
  )) {
    const closingPriceTicks =
      settledClosingPriceTicks(state, symbol);
    closingPrices[symbol] = closingPriceTicks;
    security.previousCloseTicks = closingPriceTicks;
    const band = securityPriceBand(security);
    for (const order of Object.values(state.books[symbol].orders)) {
      const dailyLimitQueueOrder =
        order.liquidityLayer?.zone === 'LIMIT_QUEUE' ||
        expiredLimitQueueEpisodeIds.has(order.parentOrderId);
      if (
        !activeOrder(order) ||
        order.type !== 'limit' ||
        (
          !dailyLimitQueueOrder &&
          order.priceTicks >= band.limitDownTicks &&
          order.priceTicks <= band.limitUpTicks
        )
      ) {
        continue;
      }
      const result = cancelInBook(
        state.books[symbol],
        order.id,
        order.ownerId,
      );
      if (!result.cancelled) {
        throw new Error(
          `failed to expire out-of-band order ${order.id}`,
        );
      }
      order.commitSeq = commitSeq;
      state.accounts[order.ownerId].commitSeq = commitSeq;
      cancelledOrderIds.push(order.id);
    }
  }
  reconcileOrderReservations(state, cancelledOrderIds);
  noteTerminalOrders(state, cancelledOrderIds);
  for (const symbol of Object.keys(state.books)) {
    archiveTerminalOrders(state, symbol);
  }
  return closingPrices;
}

function scheduleDailyBandMakerHydration(state) {
  if (!state.agentEcology?.enabled) return [];
  const symbols = Object.keys(state.books);
  const scheduled = [];
  let heapChanged = false;
  for (const agent of Object.values(
    state.agentEcology.agents,
  )) {
    if (agent.kind !== 'maker') continue;
    const cadence = state.eventQueue.find(
      (event) =>
        event.type === 'agent_decision' &&
        event.actorId === agent.id,
    );
    const latencyMs = Math.max(
      1,
      Math.trunc(Number(agent.latencyMs) || 1),
    );
    const latestHydrationMs = state.nowMs + latencyMs;
    if (!cadence) {
      scheduled.push(
        scheduleEvent(state, {
          type: 'agent_decision',
          scheduledMs: latestHydrationMs,
          phasePriority:
            MARKET_PHASE_PRIORITY.MAKER_QUOTE,
          actorId: agent.id,
          payload: {
            agentId: agent.id,
            trigger: 'cadence',
            universeHydrationSymbols: symbols,
          },
        }),
      );
      continue;
    }
    cadence.scheduledMs =
      cadence.scheduledMs > state.nowMs
        ? Math.min(
            cadence.scheduledMs,
            latestHydrationMs,
          )
        : latestHydrationMs;
    cadence.phasePriority =
      MARKET_PHASE_PRIORITY.MAKER_QUOTE;
    cadence.payload = {
      agentId: agent.id,
      trigger: 'cadence',
      universeHydrationSymbols: [...symbols],
    };
    cadence.rngKey =
      `${state.world.world.seed}:${cadence.scheduledMs}:` +
      `${cadence.phasePriority}:${cadence.sequence}`;
    scheduled.push(cadence);
    heapChanged = true;
  }
  if (heapChanged) heapifyEventQueue(state);
  return scheduled;
}

function resetPortfolioDayAnchors(state) {
  const dayId = Math.floor(state.nowMs / WORLD_DAY_MS);
  for (const account of Object.values(state.accounts)) {
    account.pnlDayAnchor = {
      dayId,
      totalPnlCents: accountTotalPnlCents(state, account),
    };
  }
}

const FINANCING_COLLATERAL_LIQUIDATION_SOURCE =
  'margin_financing_collateral_liquidation';

function tagFinancingCollateralLiquidationReceipt(
  receipt,
) {
  if (receipt) {
    receipt.forcedBy =
      FINANCING_COLLATERAL_LIQUIDATION_SOURCE;
  }
  return receipt;
}

function playerFinancingLiquidationAction(
  settlementReceipts,
) {
  return settlementReceipts
    .flatMap(
      (receipt) =>
        receipt.derivativeFinancingActions ?? [],
    )
    .find(
      (action) =>
        action.accountId === 'player' &&
        action.action ===
          'PARENT_WORLD_COLLATERAL_LIQUIDATION_REQUIRED' &&
        isPositiveInteger(
          action.requiredRepaymentCents,
        ),
    ) ?? null;
}

function maximumForcedCollateralSaleQuantity(
  state,
  symbol,
  maximumQuantity,
  targetProceedsCents,
) {
  const quoteFor = (quantity) =>
    marketExecutionQuote(state, {
      actorId: 'player',
      symbol,
      side: 'sell',
      orderType: 'market',
      priceTicks: null,
      quantity,
      tif: 'IOC',
    });
  const maximumQuote = quoteFor(maximumQuantity);
  if (maximumQuote.filledQuantity <= 0) {
    return 0;
  }
  if (
    maximumQuote.grossCents <
    targetProceedsCents
  ) {
    return maximumQuantity;
  }
  let low = 0;
  let high = maximumQuantity;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (
      quoteFor(middle).grossCents <=
      targetProceedsCents
    ) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

function repayFinancingLiquidationCash(
  state,
  maximumAmountCents,
  receipts,
) {
  const player = state.accounts.player;
  const derivativeAccount =
    state.world.derivatives.accounts.player;
  const amountCents = Math.min(
    maximumAmountCents,
    derivativeAccount.financing.cashDebtCents,
    Math.max(
      0,
      player.cashCents -
        player.reservedCashCents -
        derivativeReservedPlayerCashCents(state),
    ),
  );
  if (amountCents <= 0) return 0;
  const receipt = handleWorldAction(state, {
    type: 'world_action',
    actorId: 'player',
    source:
      FINANCING_COLLATERAL_LIQUIDATION_SOURCE,
    action: {
      type: 'derivatives_action',
      command: {
        type: 'REPAY_MARGIN_CREDIT',
        amountCents,
        source:
          FINANCING_COLLATERAL_LIQUIDATION_SOURCE,
      },
    },
  });
  receipts.push(
    tagFinancingCollateralLiquidationReceipt(
      receipt,
    ),
  );
  if (receipt.status !== 'accepted') {
    throw new Error(
      `financing collateral repayment failed: ${receipt.reason}`,
    );
  }
  return amountCents;
}

function settleForcedFinancingCollateralSales(
  state,
  settlementReceipts,
) {
  const action =
    playerFinancingLiquidationAction(
      settlementReceipts,
    );
  if (!action) {
    return {
      receipts: [],
      repaidCents: 0,
    };
  }
  const receipts = [];
  let remainingRepaymentCents =
    action.requiredRepaymentCents;
  let repaidCents = 0;

  const activePlayerOrderIds = allBookOrders(state)
    .filter(
      (order) =>
        activeOrder(order) &&
        order.ownerId === 'player',
    )
    .sort(
      (left, right) =>
        left.sequence - right.sequence ||
        left.id.localeCompare(right.id),
    )
    .map((order) => order.id);
  for (const orderId of activePlayerOrderIds) {
    receipts.push(
      tagFinancingCollateralLiquidationReceipt(
        handleCancelOrder(state, {
          type: 'cancel_order',
          actorId: 'player',
          brokerId: 'broker_lzy',
          orderId,
          source:
            FINANCING_COLLATERAL_LIQUIDATION_SOURCE,
        }),
      ),
    );
  }

  const releasedCashRepayment =
    repayFinancingLiquidationCash(
      state,
      remainingRepaymentCents,
      receipts,
    );
  repaidCents += releasedCashRepayment;
  remainingRepaymentCents -=
    releasedCashRepayment;

  const collateralShape =
    state.world.derivatives.accounts.player
      .facilityCollateralShape;
  const symbols = Object.keys(state.books).sort();
  for (const symbol of symbols) {
    if (remainingRepaymentCents <= 0) break;
    const ownedQuantity = Math.max(
      0,
      Math.min(
        collateralShape?.securities?.[symbol]
          ?.ownedQuantity ?? 0,
        (state.accounts.player.holdings[symbol] ?? 0) -
          (
            state.accounts.player
              .reservedHoldings[symbol] ?? 0
          ),
      ),
    );
    if (ownedQuantity <= 0) continue;
    const quantity =
      maximumForcedCollateralSaleQuantity(
        state,
        symbol,
        ownedQuantity,
        remainingRepaymentCents,
      );
    if (quantity <= 0) continue;
    const saleReceipt = handleSubmitOrder(state, {
      type: 'submit_order',
      actorId: 'player',
      brokerId: 'broker_lzy',
      symbol,
      side: 'sell',
      orderType: 'market',
      priceTicks: null,
      quantity,
      tif: 'IOC',
      source:
        FINANCING_COLLATERAL_LIQUIDATION_SOURCE,
      parentOrderId:
        `margin-financing-liquidation:player:${symbol}:` +
        `${state.world.world.tick}`,
      ecologyIntentKind:
        'forced_margin_collateral_liquidation',
    });
    receipts.push(
      tagFinancingCollateralLiquidationReceipt(
        saleReceipt,
      ),
    );
    if ((saleReceipt.filledQuantity ?? 0) <= 0) {
      continue;
    }
    const saleRepayment =
      repayFinancingLiquidationCash(
        state,
        remainingRepaymentCents,
        receipts,
      );
    repaidCents += saleRepayment;
    remainingRepaymentCents -= saleRepayment;
  }

  if (remainingRepaymentCents > 0) {
    receipts.push(
      tagFinancingCollateralLiquidationReceipt(
        pushReceipt(state, {
          id: nextLocalId(
            state,
            'financing_liquidation_receipt',
          ),
          type:
            'margin_financing_collateral_liquidation',
          status:
            repaidCents > 0
              ? 'partially_filled'
              : 'rejected',
          reason:
            'INSUFFICIENT_EXECUTABLE_COLLATERAL_DEPTH',
          actorId: 'player',
          requestedAmountCents:
            action.requiredRepaymentCents,
          repaidAmountCents: repaidCents,
          remainingAmountCents:
            remainingRepaymentCents,
          virtualMs: state.nowMs,
          commitSeq: state.commitSeq,
        }),
      ),
    );
  }
  return {
    receipts,
    repaidCents,
  };
}

function mergeCollateralRepaymentIntoWorldReceipt(
  settlementReceipts,
  repaidCents,
) {
  if (repaidCents <= 0) return;
  const worldReceipt = settlementReceipts.find(
    (receipt) => receipt.type === 'world_advanced',
  );
  if (!worldReceipt) return;
  const liquidations =
    worldReceipt
      .derivativeFinancingCashLiquidations;
  if (liquidations.length > 0) {
    const primary = liquidations[0];
    worldReceipt
      .derivativeFinancingCashLiquidations = [
      {
        ...primary,
        amountCents:
          primary.amountCents + repaidCents,
        cashLiquidationCents:
          primary.cashLiquidationCents ??
          primary.amountCents,
        collateralSaleRepaymentCents:
          repaidCents,
      },
      ...liquidations.slice(1),
    ];
    return;
  }
  worldReceipt
    .derivativeFinancingCashLiquidations = [
    {
      type: 'REPAY_MARGIN_CREDIT',
      status: 'applied',
      reason: null,
      actorId: 'player',
      amountCents: repaidCents,
      cashLiquidationCents: 0,
      collateralSaleRepaymentCents:
        repaidCents,
      source:
        FINANCING_COLLATERAL_LIQUIDATION_SOURCE,
    },
  ];
}

function forcedSecuritiesLendingRequirements(state) {
  const account =
    state.world.derivatives?.accounts?.player;
  if (
    account?.risk?.facilityAggregate?.status !==
    'LIQUIDATE'
  ) {
    return [];
  }
  return Object.values(
    account.borrowedSecurities ?? {},
  )
    .filter(
      (loan) =>
        typeof loan?.securityId === 'string' &&
        Object.hasOwn(state.books, loan.securityId) &&
        isPositiveInteger(loan.quantity),
    )
    .map((loan) => ({
      securityId: loan.securityId,
      quantity: loan.quantity,
    }))
    .sort((left, right) =>
      left.securityId.localeCompare(right.securityId),
    );
}

function tagForcedSecuritiesLendingReceipt(receipt) {
  if (receipt) {
    receipt.forcedBy =
      'securities_lending_liquidation';
  }
  return receipt;
}

function maximumAffordableMarketBuyQuantity(
  state,
  symbol,
  requestedQuantity,
) {
  const player = state.accounts.player;
  const availableCashCents = Math.max(
    0,
    player.cashCents -
      player.reservedCashCents -
      derivativeReservedPlayerCashCents(state),
  );
  let low = 0;
  let high = requestedQuantity;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const quote = marketExecutionQuote(state, {
      actorId: 'player',
      symbol,
      side: 'buy',
      orderType: 'market',
      priceTicks: null,
      quantity: middle,
      tif: 'IOC',
    });
    if (
      quote.filledQuantity > 0 &&
      quote.requiredCashCents <= availableCashCents
    ) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

function settleForcedSecuritiesLendingBuyIns(state) {
  const requirements =
    forcedSecuritiesLendingRequirements(state);
  if (requirements.length === 0) return [];
  const receipts = [];

  const activePlayerOrderIds = allBookOrders(state)
    .filter(
      (order) =>
        activeOrder(order) &&
        order.ownerId === 'player',
    )
    .sort(
      (left, right) =>
        left.sequence - right.sequence ||
        left.id.localeCompare(right.id),
    )
    .map((order) => order.id);
  for (const orderId of activePlayerOrderIds) {
    const receipt = handleCancelOrder(state, {
      type: 'cancel_order',
      actorId: 'player',
      brokerId: 'broker_lzy',
      orderId,
      source: 'securities_lending_liquidation',
    });
    receipts.push(
      tagForcedSecuritiesLendingReceipt(receipt),
    );
  }

  for (const requirement of requirements) {
    const symbol = requirement.securityId;
    let outstanding =
      state.world.derivatives.accounts.player
        .borrowedSecurities[symbol]?.quantity ?? 0;
    const returnAvailable = () => {
      const freeUnits = Math.max(
        0,
        (state.accounts.player.holdings[symbol] ?? 0) -
          (
            state.accounts.player
              .reservedHoldings[symbol] ?? 0
          ),
      );
      const quantity = Math.min(outstanding, freeUnits);
      if (quantity <= 0) return 0;
      const receipt = handleWorldAction(state, {
        type: 'world_action',
        actorId: 'player',
        source: 'securities_lending_liquidation',
        action: {
          type: 'derivatives_action',
          command: {
            type: 'RETURN_SECURITY',
            securityId: symbol,
            quantity,
          },
        },
      });
      receipts.push(
        tagForcedSecuritiesLendingReceipt(receipt),
      );
      if (receipt.status !== 'accepted') return 0;
      outstanding -= quantity;
      return quantity;
    };

    returnAvailable();
    if (outstanding <= 0) continue;
    const buyQuantity =
      maximumAffordableMarketBuyQuantity(
        state,
        symbol,
        outstanding,
      );
    if (buyQuantity > 0) {
      const buyReceipt = handleSubmitOrder(state, {
        type: 'submit_order',
        actorId: 'player',
        brokerId: 'broker_lzy',
        symbol,
        side: 'buy',
        orderType: 'market',
        priceTicks: null,
        quantity: buyQuantity,
        tif: 'IOC',
        source: 'securities_lending_liquidation',
        parentOrderId:
          `securities-buy-in:player:${symbol}:` +
          `${state.world.world.tick}`,
        ecologyIntentKind:
          'forced_securities_buy_in',
      });
      receipts.push(
        tagForcedSecuritiesLendingReceipt(buyReceipt),
      );
      if ((buyReceipt.filledQuantity ?? 0) > 0) {
        returnAvailable();
      }
    }
    const remainingQuantity =
      state.world.derivatives.accounts.player
        .borrowedSecurities[symbol]?.quantity ?? 0;
    if (remainingQuantity > 0) {
      const quote = marketExecutionQuote(state, {
        actorId: 'player',
        symbol,
        side: 'buy',
        orderType: 'market',
        priceTicks: null,
        quantity: remainingQuantity,
        tif: 'IOC',
      });
      const player = state.accounts.player;
      const availableCashCents = Math.max(
        0,
        player.cashCents -
          player.reservedCashCents -
          derivativeReservedPlayerCashCents(state),
      );
      const unresolved = pushReceipt(state, {
        id: nextLocalId(state, 'receipt'),
        type: 'securities_buy_in',
        status:
          remainingQuantity < requirement.quantity
            ? 'partially_filled'
            : 'rejected',
        reason:
          quote.filledQuantity <= 0
            ? 'NO_EXECUTABLE_ASK_WITHIN_PRICE_LIMIT'
            : quote.requiredCashCents >
                availableCashCents
              ? 'INSUFFICIENT_CASH_FOR_BUY_IN'
              : 'INSUFFICIENT_MARKET_DEPTH',
        actorId: 'player',
        symbol,
        requestedQuantity: requirement.quantity,
        filledQuantity:
          requirement.quantity - remainingQuantity,
        remainingQuantity,
        virtualMs: state.nowMs,
        commitSeq: state.commitSeq,
      });
      receipts.push(
        tagForcedSecuritiesLendingReceipt(unresolved),
      );
    }
  }
  return receipts;
}

export function settleWorldDay(state) {
  const commitSeq = state.commitSeq + 1;
  const previousIds = captureWorldRecordIds(state.world);
  const previousRealtimeChains = captureRealtimeAuditChains(state.world);
  const previousMemoryStates = new Map(
    state.world.memories.map((memory) => [
      memory.id,
      JSON.stringify(memory),
    ]),
  );
  rollDailyPriceBands(state, commitSeq);
  archiveNaturalDayBars(state);
  syncWorldMarketMirrors(state);
  const result = advanceWorld(state.world, 1, {
    realtimeMarketAuthority: true,
    preserveRealtimeAuditChains: true,
  });
  state.world = result.state;
  hydrateSecurityListingFields(state.world);
  for (const memory of state.world.memories) {
    if (
      previousMemoryStates.has(memory.id) &&
      previousMemoryStates.get(memory.id) !== JSON.stringify(memory)
    ) {
      memory.lastMutationCommitSeq = commitSeq;
    }
  }
  stampNewWorldRecords(state.world, previousIds, commitSeq);
  reconcileRealtimeAuditChains(
    state,
    previousRealtimeChains,
    commitSeq,
  );
  syncAccountsAfterWorldMutation(state);
  hydrateAccountPortfolioFields(state);
  resetPortfolioDayAnchors(state);
  for (const account of Object.values(state.accounts)) {
    account.commitSeq = commitSeq;
  }
  state.commitSeq = commitSeq;
  openTurnoverTruthWindow(state);
  refreshDelayedFundamentals(state);
  scheduleDailyBandMakerHydration(state);
  state.lastWorldDaySettlementMs = state.nowMs;
  markAccountRisk(state);
  syncWorldMarketMirrors(state);
  const forcedFinancingLiquidation =
    settleForcedFinancingCollateralSales(
      state,
      result.receipts,
    );
  mergeCollateralRepaymentIntoWorldReceipt(
    result.receipts,
    forcedFinancingLiquidation.repaidCents,
  );
  const forcedSecuritiesLendingReceipts =
    settleForcedSecuritiesLendingBuyIns(state);
  for (const receipt of result.receipts) {
    pushReceipt(state, {
      ...cloneJson(receipt),
      virtualMs: state.nowMs,
      commitSeq,
    });
  }
  scheduleEvent(state, {
    type: 'world_day_settlement',
    scheduledMs: state.nowMs + WORLD_DAY_MS,
    phasePriority: MARKET_PHASE_PRIORITY.WORLD_DAY_SETTLEMENT,
  });
  return [
    ...result.receipts,
    ...forcedFinancingLiquidation.receipts,
    ...forcedSecuritiesLendingReceipts,
  ];
}

function replaceState(target, source) {
  const verifiedAccountSeal =
    verifiedAccountAuthoritySeals.get(source);
  const verifiedRealtimeAuditPayloads =
    verifiedRealtimeAuditPayloadSummaries.get(source);
  const realtimeAuditColdStore =
    realtimeAuditColdStores.get(source);
  const worldBalanceMirrorState =
    worldBalanceMirrorStates.get(source);
  let committedOrderIndex = orderIndexes.get(source);
  if (
    committedOrderIndex &&
    orderIndexOverlays.has(committedOrderIndex)
  ) {
    for (const orderId of committedOrderIndex.deleted) {
      committedOrderIndex.base.delete(orderId);
    }
    for (const [orderId, order] of
      committedOrderIndex.changed) {
      committedOrderIndex.base.set(orderId, order);
    }
    committedOrderIndex = committedOrderIndex.base;
  }
  orderIndexes.delete(target);
  verifiedAccountAuthoritySeals.delete(target);
  verifiedRealtimeAuditPayloadSummaries.delete(target);
  realtimeAuditColdStores.delete(target);
  worldBalanceMirrorStates.delete(target);
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
  if (typeof verifiedAccountSeal === 'string') {
    verifiedAccountAuthoritySeals.set(
      target,
      verifiedAccountSeal,
    );
  }
  if (verifiedRealtimeAuditPayloads) {
    verifiedRealtimeAuditPayloadSummaries.set(
      target,
      verifiedRealtimeAuditPayloads,
    );
  }
  if (realtimeAuditColdStore) {
    realtimeAuditColdStores.set(
      target,
      realtimeAuditColdStore,
    );
  }
  if (worldBalanceMirrorState) {
    worldBalanceMirrorStates.set(
      target,
      worldBalanceMirrorState,
    );
  }
  if (committedOrderIndex) {
    orderIndexes.set(target, committedOrderIndex);
  }
}

function inheritRealtimeAuditRuntimeMetadata(
  source,
  target,
) {
  const cache =
    verifiedRealtimeAuditPayloadSummaries.get(source);
  if (cache) {
    verifiedRealtimeAuditPayloadSummaries.set(target, cache);
  }
  const coldStore = realtimeAuditColdStores.get(source);
  if (coldStore) {
    realtimeAuditColdStores.set(target, coldStore);
  }
  return target;
}

function sameJson(left, right) {
  if (Object.is(left, right)) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Array.isArray(left) !== Array.isArray(right)
  ) {
    return false;
  }
  if (Array.isArray(left)) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!sameJson(left[index], right[index])) return false;
    }
    return true;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];
    if (key !== rightKeys[index] || !sameJson(left[key], right[key])) {
      return false;
    }
  }
  return true;
}

function sameStringSet(left, right) {
  const leftValues = Array.isArray(left) ? left : [...left];
  const rightValues = Array.isArray(right) ? right : [...right];
  if (leftValues.length !== rightValues.length) return false;
  const remaining = new Set(rightValues);
  if (remaining.size === rightValues.length) {
    for (const value of leftValues) {
      if (!remaining.delete(value)) return false;
    }
    return remaining.size === 0;
  }
  const counts = new Map();
  for (const value of rightValues) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  for (const value of leftValues) {
    const count = counts.get(value) ?? 0;
    if (count === 0) return false;
    if (count === 1) counts.delete(value);
    else counts.set(value, count - 1);
  }
  return counts.size === 0;
}

function sameScalarRecord(left, right) {
  if (
    !left ||
    typeof left !== 'object' ||
    Array.isArray(left) ||
    !sameStringSet(Object.keys(left), Object.keys(right))
  ) {
    return false;
  }
  return Object.entries(right).every(([key, value]) => left[key] === value);
}

function barSeriesInvariantErrors(state, symbols) {
  const errors = [];
  if (
    !state.barSeries ||
    typeof state.barSeries !== 'object' ||
    Array.isArray(state.barSeries) ||
    !sameStringSet(Object.keys(state.barSeries), symbols)
  ) {
    return ['INVALID_BAR_SERIES_SCHEMA'];
  }
  const expectedDayStartMs =
    state.nowMs > 0 &&
    state.nowMs % WORLD_DAY_MS === 0 &&
    state.lastWorldDaySettlementMs < state.nowMs
      ? state.nowMs - WORLD_DAY_MS
      : Math.floor(state.nowMs / WORLD_DAY_MS) * WORLD_DAY_MS;
  for (const symbol of symbols) {
    const series = state.barSeries[symbol];
    try {
      if (
        !series ||
        typeof series !== 'object' ||
        Array.isArray(series) ||
        !sameStringSet(
          Object.keys(series),
          [
            'symbol',
            'dayId',
            'dayStartMs',
            'dayEndMs',
            'closedUntilMs',
            'fills',
            'bars',
          ],
        ) ||
        series.symbol !== symbol ||
        series.dayId !== expectedDayStartMs ||
        series.dayStartMs !== expectedDayStartMs ||
        series.dayEndMs !== expectedDayStartMs + WORLD_DAY_MS ||
        !Number.isSafeInteger(series.closedUntilMs) ||
        series.closedUntilMs < series.dayStartMs ||
        series.closedUntilMs > Math.min(state.nowMs, series.dayEndMs) ||
        series.closedUntilMs % QUOTE_FRAME_MS !== 0 ||
        !Array.isArray(series.fills) ||
        !Array.isArray(series.bars)
      ) {
        errors.push(`INVALID_BAR_SERIES:${symbol}`);
        continue;
      }
      const fillSequences = new Set(
        series.fills.map((fill) => fill?.sequence),
      );
      if (fillSequences.size !== series.fills.length) {
        errors.push(`DUPLICATE_BAR_FILL_SEQUENCE:${symbol}`);
        continue;
      }
      let previousFill = null;
      let invalidFill = false;
      for (const fill of series.fills) {
        if (
          !fill ||
          typeof fill !== 'object' ||
          Array.isArray(fill) ||
          !sameStringSet(
            Object.keys(fill),
            [
              'timestampMs',
              'sequence',
              'priceTicks',
              'quantity',
            ],
          ) ||
          !Number.isSafeInteger(fill.timestampMs) ||
          fill.timestampMs < series.dayStartMs ||
          fill.timestampMs > series.dayEndMs ||
          !Number.isSafeInteger(fill.sequence) ||
          fill.sequence < 0 ||
          !isPositiveInteger(fill.priceTicks) ||
          !isPositiveInteger(fill.quantity) ||
          !Number.isSafeInteger(
            fill.priceTicks * fill.quantity,
          ) ||
          (
            previousFill &&
            compareUltraFills(previousFill, fill) >= 0
          )
        ) {
          invalidFill = true;
          break;
        }
        previousFill = fill;
      }
      if (invalidFill) {
        errors.push(`INVALID_BAR_FILL:${symbol}`);
        continue;
      }
      const liveStartMs =
        series.bars[0]?.startMs ??
        series.closedUntilMs;
      const rebuilt = {
        ...createBarSeries(
          symbol,
          series.dayId,
        ),
        closedUntilMs: liveStartMs,
        fills: series.fills,
        bars: [],
      };
      let previousBarEndMs = liveStartMs;
      for (const bar of series.bars) {
        if (bar?.startMs !== previousBarEndMs) {
          errors.push(
            `BAR_SERIES_GAP:${symbol}`,
          );
          invalidFill = true;
          break;
        }
        closeFrameInPlace(rebuilt, bar?.endMs);
        previousBarEndMs = bar.endMs;
      }
      if (invalidFill) {
        continue;
      }
      if (
        rebuilt.closedUntilMs !== series.closedUntilMs ||
        rebuilt.bars.length !== series.bars.length ||
        rebuilt.bars.some(
          (bar, index) =>
            !sameScalarRecord(series.bars[index], bar),
        )
      ) {
        errors.push(`BAR_SERIES_RECONCILIATION_MISMATCH:${symbol}`);
      }
    } catch {
      errors.push(`INVALID_BAR_SERIES:${symbol}`);
    }
  }
  return errors;
}

function visibleBarIsValid(bar, symbol, archivedThroughMs) {
  const keys = [
    'symbol',
    'dayId',
    'frameStartMs',
    'frameEndMs',
    'startMs',
    'endMs',
    'openTicks',
    'highTicks',
    'lowTicks',
    'closeTicks',
    'volumeShares',
    'volume',
    'turnoverCents',
    'turnoverTicks',
    'tradeCount',
    'vwapTicks',
  ];
  if (
    !bar ||
    typeof bar !== 'object' ||
    Array.isArray(bar) ||
    !sameStringSet(Object.keys(bar), keys) ||
    bar.symbol !== symbol ||
    !Number.isSafeInteger(bar.dayId) ||
    !Number.isSafeInteger(bar.startMs) ||
    !Number.isSafeInteger(bar.endMs) ||
    bar.dayId !==
      Math.floor(bar.startMs / WORLD_DAY_MS) * WORLD_DAY_MS ||
    bar.frameStartMs !== bar.startMs ||
    bar.frameEndMs !== bar.endMs ||
    bar.startMs < 0 ||
    bar.endMs <= bar.startMs ||
    bar.endMs > archivedThroughMs ||
    !Number.isSafeInteger(bar.volume) ||
    bar.volume < 0 ||
    bar.volumeShares !== bar.volume ||
    !Number.isSafeInteger(bar.turnoverTicks) ||
    bar.turnoverTicks < 0 ||
    bar.turnoverCents !== bar.turnoverTicks ||
    !Number.isSafeInteger(bar.tradeCount) ||
    bar.tradeCount < 0
  ) {
    return false;
  }
  const prices = [
    bar.openTicks,
    bar.highTicks,
    bar.lowTicks,
    bar.closeTicks,
  ];
  const empty = prices.every((price) => price === null);
  if (empty) {
    return (
      bar.volume === 0 &&
      bar.turnoverTicks === 0 &&
      bar.tradeCount === 0 &&
      bar.vwapTicks === null
    );
  }
  if (
    prices.some(
      (price) => !Number.isSafeInteger(price) || price < 1,
    ) ||
    bar.volume < 1 ||
    bar.turnoverTicks < 1 ||
    bar.tradeCount < 1 ||
    bar.highTicks < Math.max(bar.openTicks, bar.closeTicks) ||
    bar.lowTicks > Math.min(bar.openTicks, bar.closeTicks) ||
    bar.lowTicks > bar.highTicks
  ) {
    return false;
  }
  return bar.vwapTicks === Math.round(
    bar.turnoverTicks / bar.volume,
  );
}

function barArchiveInvariantErrors(state, symbols) {
  const archive = state.barArchives;
  if (
    !archive ||
    typeof archive !== 'object' ||
    Array.isArray(archive) ||
    !sameStringSet(Object.keys(archive), ['bySymbol']) ||
    !archive.bySymbol ||
    typeof archive.bySymbol !== 'object' ||
    Array.isArray(archive.bySymbol) ||
    !sameStringSet(Object.keys(archive.bySymbol), symbols)
  ) {
    return ['INVALID_BAR_ARCHIVE_SCHEMA'];
  }
  const errors = [];
  for (const symbol of symbols) {
    const entry = archive.bySymbol[symbol];
    if (
      !entry ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      !sameStringSet(
        Object.keys(entry),
        ['minuteBars', 'dailyBars', 'ultraFills'],
      ) ||
      !Array.isArray(entry.minuteBars) ||
      entry.minuteBars.length >
        MAX_ARCHIVED_MINUTE_BARS_PER_SYMBOL ||
      !Array.isArray(entry.dailyBars) ||
      entry.dailyBars.length >
        MAX_ARCHIVED_DAILY_BARS_PER_SYMBOL ||
      !Array.isArray(entry.ultraFills)
    ) {
      errors.push(`INVALID_BAR_ARCHIVE_ENTRY:${symbol}`);
      continue;
    }
    let previousUltraFill = null;
    const ultraSequences = new Set();
    let validUltraFills = true;
    const activeDomain =
      deriveFixedIntradayTimeDomain(
        state.nowMs,
        {
          clockOffsetMs:
            MARKET_CLOCK_ORIGIN_OFFSET_MS,
        },
      );
    for (const fill of entry.ultraFills) {
      if (
        !fill ||
        typeof fill !== 'object' ||
        Array.isArray(fill) ||
        !sameStringSet(Object.keys(fill), [
          'timestampMs',
          'sequence',
          'priceTicks',
          'quantity',
        ]) ||
        !Number.isSafeInteger(fill.timestampMs) ||
        fill.timestampMs < activeDomain.startMs ||
        fill.timestampMs > state.nowMs ||
        !Number.isSafeInteger(fill.sequence) ||
        fill.sequence < 0 ||
        ultraSequences.has(fill.sequence) ||
        !isPositiveInteger(fill.priceTicks) ||
        !isPositiveInteger(fill.quantity) ||
        !Number.isSafeInteger(
          fill.priceTicks * fill.quantity,
        ) ||
        (
          previousUltraFill &&
          compareUltraFills(previousUltraFill, fill) >= 0
        )
      ) {
        errors.push(`INVALID_ARCHIVED_ULTRA_FILL:${symbol}`);
        validUltraFills = false;
        break;
      }
      ultraSequences.add(fill.sequence);
      previousUltraFill = fill;
    }
    if (!validUltraFills) continue;
    const ultraMinuteBuckets = new Map();
    for (const fill of entry.ultraFills) {
      const minuteStartMs =
        fill.timestampMs ===
        state.barSeries[symbol]?.dayStartMs
          ? fill.timestampMs
          : Math.floor((fill.timestampMs - 1) / 60_000) *
            60_000;
      const bucket = ultraMinuteBuckets.get(minuteStartMs) ?? {
        startMs: minuteStartMs,
        openTicks: fill.priceTicks,
        highTicks: fill.priceTicks,
        lowTicks: fill.priceTicks,
        closeTicks: fill.priceTicks,
        volume: 0,
        turnoverTicks: 0,
        tradeCount: 0,
      };
      bucket.highTicks = Math.max(
        bucket.highTicks,
        fill.priceTicks,
      );
      bucket.lowTicks = Math.min(
        bucket.lowTicks,
        fill.priceTicks,
      );
      bucket.closeTicks = fill.priceTicks;
      bucket.volume += fill.quantity;
      bucket.turnoverTicks +=
        fill.priceTicks * fill.quantity;
      bucket.tradeCount += 1;
      ultraMinuteBuckets.set(minuteStartMs, bucket);
    }
    const minuteByStart = new Map(
      entry.minuteBars.map((bar) => [
        bar.startMs,
        bar,
      ]),
    );
    const ultraOhlcvMatches =
      [...ultraMinuteBuckets.entries()].every(
        ([startMs, bucket]) => {
          const bar = minuteByStart.get(startMs);
          return (
            bar &&
            bucket.openTicks === bar.openTicks &&
            bucket.highTicks === bar.highTicks &&
            bucket.lowTicks === bar.lowTicks &&
            bucket.closeTicks === bar.closeTicks &&
            bucket.volume === bar.volume &&
            bucket.turnoverTicks ===
              bar.turnoverTicks &&
            bucket.tradeCount === bar.tradeCount
          );
        },
      );
    if (!ultraOhlcvMatches) {
      errors.push(`INVALID_ARCHIVED_ULTRA_OHLCV:${symbol}`);
    }
    for (const [kind, bars] of [
      ['MINUTE', entry.minuteBars],
      ['DAILY', entry.dailyBars],
    ]) {
      let previousEndMs = -1;
      for (const bar of bars) {
        if (
          !visibleBarIsValid(
            bar,
            symbol,
            kind === 'MINUTE'
              ? state.nowMs
              : state.lastWorldDaySettlementMs,
          ) ||
          bar.startMs < previousEndMs ||
          (
            kind === 'MINUTE' &&
            bar.startMs % 60_000 !== 0
          ) ||
          (
            kind === 'DAILY' &&
            bar.startMs % WORLD_DAY_MS !== 0
          )
        ) {
          errors.push(`INVALID_ARCHIVED_${kind}_BAR:${symbol}`);
          break;
        }
        previousEndMs = bar.endMs;
      }
    }
    const series = state.barSeries[symbol];
    if (
      !series ||
      !Array.isArray(series.bars)
    ) {
      errors.push(
        `MISSING_BAR_SERIES_FOR_ARCHIVE:${symbol}`,
      );
      continue;
    }
    const currentArchivedMinutes =
      entry.minuteBars.filter(
        (bar) =>
          bar.startMs >= series.dayStartMs &&
          bar.endMs <= series.closedUntilMs,
      );
    const liveMinutes = aggregateBars(
      series.bars,
      60_000,
    );
    const lastArchived =
      currentArchivedMinutes.at(-1);
    const firstLive = liveMinutes[0];
    if (
      lastArchived &&
      firstLive &&
      lastArchived.endMs !== firstLive.startMs
    ) {
      errors.push(
        `BAR_ARCHIVE_LIVE_GAP:${symbol}`,
      );
    }
    if (
      currentArchivedMinutes.some(
        (bar, index) =>
          (
            index > 0 &&
            currentArchivedMinutes[index - 1]
              .endMs !== bar.startMs
          ) ||
          (
            bar.endMs <
              Math.min(
                series.closedUntilMs,
                bar.startMs + 60_000,
              )
          ),
      )
    ) {
      errors.push(
        `INVALID_CURRENT_DAY_MINUTE_PREFIX:${symbol}`,
      );
    }
  }
  return errors;
}

function numericIdSuffix(id) {
  const match = typeof id === 'string' && id.match(/_(\d{8})$/);
  return match ? Number(match[1]) : 0;
}

function isCompleteRealtimeAuditChain(chain, expectedCommitSeq) {
  return Boolean(
    chain?.trade &&
    chain?.event &&
    chain?.journal &&
    chain?.fact &&
    chain?.memory &&
    chain.event.id === chain.trade.eventId &&
    chain.event.ledgerEntryIds?.length === 1 &&
    chain.event.ledgerEntryIds[0] === chain.journal.id &&
    chain.journal.eventId === chain.event.id &&
    chain.fact.id === chain.trade.factId &&
    chain.fact.eventId === chain.event.id &&
    chain.memory.factId === chain.fact.id &&
    [
      chain.trade,
      chain.event,
      chain.journal,
      chain.fact,
      chain.memory,
    ].every(
      (record) =>
        typeof record.id === 'string' &&
        record.commitSeq === expectedCommitSeq,
    )
  );
}

function turnoverTruthInvariantErrors(state, symbols) {
  if (
    !state.turnoverTruthBySymbol ||
    typeof state.turnoverTruthBySymbol !== 'object' ||
    Array.isArray(state.turnoverTruthBySymbol) ||
    !sameStringSet(
      Object.keys(state.turnoverTruthBySymbol),
      symbols,
    ) ||
    !state.turnoverTruthIntegrationBySymbol ||
    typeof state.turnoverTruthIntegrationBySymbol !==
      'object' ||
    Array.isArray(
      state.turnoverTruthIntegrationBySymbol,
    ) ||
    !sameStringSet(
      Object.keys(
        state.turnoverTruthIntegrationBySymbol,
      ),
      symbols,
    )
  ) {
    return ['INVALID_TURNOVER_TRUTH_ROOT'];
  }
  const errors = [];
  for (const symbol of symbols) {
    try {
      const projection = projectCumulativeTurnover(
        state.turnoverTruthBySymbol[symbol],
      );
      const integration =
        state.turnoverTruthIntegrationBySymbol[symbol];
      if (
        projection.assetId !== symbol ||
        projection.openedAtMs !==
          state.lastWorldDaySettlementMs ||
        projection.windowId !==
          turnoverWindowId(
            state.lastWorldDaySettlementMs,
          ) ||
        !integration ||
        integration.schemaVersion !==
          TURNOVER_PRODUCTION_INTEGRATION_SCHEMA ||
        integration.grossAuthority === undefined ||
        ![
          'exact',
          'unavailable_for_legacy_compacted_fills',
        ].includes(integration.selfTradeCoverage)
      ) {
        errors.push(`INVALID_TURNOVER_TRUTH:${symbol}`);
      }
    } catch (error) {
      errors.push(
        `INVALID_TURNOVER_TRUTH:${symbol}:${error.message}`,
      );
    }
  }
  return errors;
}

function marketInvariantErrors(
  state,
  { reuseVerifiedArchives = false } = {},
) {
  const errors = [];
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return ['INVALID_STATE_SCHEMA'];
  }
  if (state.marketRuleVersion !== MARKET_RULE_VERSION) {
    errors.push('INVALID_MARKET_RULE_VERSION');
  }
  if (!state.world?.world || !state.world?.market?.securities) {
    errors.push('INVALID_WORLD_SCHEMA');
    return errors;
  }
  if (
    !Number.isSafeInteger(state.nowMs) ||
    state.nowMs < 0 ||
    !Number.isSafeInteger(state.lastWorldDaySettlementMs) ||
    state.lastWorldDaySettlementMs < 0 ||
    state.lastWorldDaySettlementMs > state.nowMs ||
    state.lastWorldDaySettlementMs % WORLD_DAY_MS !== 0 ||
    !Number.isSafeInteger(
      state.derivativeAuthorityOriginMs,
    ) ||
    state.derivativeAuthorityOriginMs < 0 ||
    !Number.isSafeInteger(
      state.world.derivatives?.nowMs,
    ) ||
    state.world.derivatives.nowMs <
      state.derivativeAuthorityOriginMs ||
    state.world.derivatives.nowMs >
      state.derivativeAuthorityOriginMs +
        state.nowMs ||
    state.quoteFrameMs !== QUOTE_FRAME_MS ||
    state.worldDayMs !== WORLD_DAY_MS
  ) {
    errors.push('INVALID_NOW_MS');
  }
  if (
    !Number.isSafeInteger(state.commitSeq) ||
    state.commitSeq < 0 ||
    !Number.isSafeInteger(state.nextEventSequence) ||
    state.nextEventSequence < 1 ||
    !Number.isSafeInteger(state.nextOrderSequence) ||
    state.nextOrderSequence < 1 ||
    !Number.isSafeInteger(state.nextRecordSequence) ||
    state.nextRecordSequence < 1
  ) {
    errors.push('INVALID_SEQUENCE_COUNTERS');
  }
  if (!sameScalarRecord(state.phasePriority, MARKET_PHASE_PRIORITY)) {
    errors.push('INVALID_PHASE_PRIORITY_SCHEMA');
  }
  errors.push(...playerRoleAutomationInvariantErrors(state));

  const symbols = Object.keys(state.world.market.securities);
  for (const [symbol, security] of Object.entries(
    state.world.market.securities,
  )) {
    const band = securityPriceBand(security);
    const lastPriceTicks = cents(security.lastPrice);
    if (
      security.symbol !== symbol ||
      security.board !== band.board ||
      security.dailyLimitBps !== band.dailyLimitBps ||
      security.previousCloseTicks !== band.previousCloseTicks ||
      lastPriceTicks < band.limitDownTicks ||
      lastPriceTicks > band.limitUpTicks
    ) {
      errors.push(`INVALID_SECURITY_PRICE_BAND:${symbol}`);
    }
    if (
      !Array.isArray(security.priceHistory) ||
      security.priceHistory.length >
        MAX_WORLD_PRICE_HISTORY_POINTS ||
      security.priceHistory[0]?.tick !== 0
    ) {
      errors.push(`INVALID_SECURITY_PRICE_HISTORY:${symbol}`);
    }
  }
  if (
    !state.books ||
    typeof state.books !== 'object' ||
    Array.isArray(state.books) ||
    !sameStringSet(Object.keys(state.books), symbols)
  ) {
    errors.push('INVALID_BOOKS_SCHEMA');
    return errors;
  }
  for (const [symbol, book] of Object.entries(state.books)) {
    const result = assertBookIntegrity(book);
    errors.push(...result.errors.map((error) => `${symbol}:${error}`));
    const band = securityPriceBand(
      state.world.market.securities[symbol],
    );
    for (const order of Object.values(book.orders)) {
      if (
        activeOrder(order) &&
        (
          order.priceTicks < band.limitDownTicks ||
          order.priceTicks > band.limitUpTicks
        )
      ) {
        errors.push(`ACTIVE_ORDER_OUTSIDE_DAILY_BAND:${order.id}`);
      }
    }
    const maximumBookSequence = Math.max(
      0,
      ...Object.values(book.orders ?? {}).map(
        (order) => Number.isSafeInteger(order?.sequence) ? order.sequence : 0,
      ),
    );
    if (
      !Number.isSafeInteger(book.nextSequence) ||
      book.nextSequence <= maximumBookSequence
    ) {
      errors.push(`INVALID_BOOK_NEXT_SEQUENCE:${symbol}`);
    }
    const terminalCount = Object.values(book.orders ?? {}).filter(
      (order) => !activeOrder(order),
    ).length;
    if (terminalCount > MAX_TERMINAL_ORDERS_PER_SYMBOL) {
      errors.push(`TERMINAL_ORDER_LIMIT_EXCEEDED:${symbol}`);
    }
  }
  errors.push(...barSeriesInvariantErrors(state, symbols));
  errors.push(...barArchiveInvariantErrors(state, symbols));
  errors.push(...turnoverTruthInvariantErrors(state, symbols));
  errors.push(
    ...derivativeCadenceReceiptArchiveErrors(
      state,
    ),
  );

  if (!Array.isArray(state.eventQueue)) {
    errors.push('INVALID_EVENT_QUEUE_SCHEMA');
  } else {
    let maximumSequence = 0;
    const eventIds = new Set();
    const eventSequences = new Set();
    const quoteFrameEvents = [];
    const worldDayEvents = [];
    const derivativeActorCycleEvents = [];
    const agentDecisionEvents = [];
    const publicResponseEvents = [];
    const playerMotionEvents = [];
    const openWorldCityCompletionEvents = [];
    for (let index = 0; index < state.eventQueue.length; index += 1) {
      const event = state.eventQueue[index];
      if (
        !event ||
        typeof event.id !== 'string' ||
        !Number.isSafeInteger(event.scheduledMs) ||
        event.scheduledMs < state.nowMs ||
        !Number.isSafeInteger(event.phasePriority) ||
        !Object.values(MARKET_PHASE_PRIORITY).includes(event.phasePriority) ||
        !Number.isSafeInteger(event.sequence) ||
        event.sequence < 1 ||
        typeof event.type !== 'string' ||
        typeof event.actorId !== 'string' ||
        event.id !== nextLocalId(
          { nextRecordSequence: 0 },
          'market_event',
          event.sequence,
        ) ||
        event.rngKey !==
          `${state.world.world.seed}:${event.scheduledMs}:${event.phasePriority}:${event.sequence}` ||
        !event.payload ||
        typeof event.payload !== 'object' ||
        Array.isArray(event.payload)
      ) {
        errors.push(`INVALID_EVENT_SCHEMA:${index}`);
        continue;
      }
      if (eventIds.has(event.id) || eventSequences.has(event.sequence)) {
        errors.push(`DUPLICATE_EVENT_ID_OR_SEQUENCE:${index}`);
      }
      eventIds.add(event.id);
      eventSequences.add(event.sequence);
      maximumSequence = Math.max(maximumSequence, event.sequence);
      if (!CHECKPOINT_EVENT_TYPES.includes(event.type)) {
        errors.push(`UNKNOWN_EVENT_TYPE:${event.id}`);
        continue;
      }
      if (
        event.type === 'command' &&
        !CHECKPOINT_COMMAND_TYPES.includes(event.payload.type)
      ) {
        errors.push(`UNKNOWN_COMMAND_TYPE:${event.id}`);
        continue;
      }
      if (
        event.type ===
          'security_corporate_action' &&
        (
          event.actorId !==
            'issuer_corporate_registry' ||
          typeof event.payload.actionId !==
            'string' ||
          event.payload.actionId.length === 0 ||
          typeof event.payload.securityId !==
            'string' ||
          !state.books[
            event.payload.securityId
          ] ||
          !Number.isSafeInteger(
            event.payload.splitNumerator,
          ) ||
          event.payload.splitNumerator <= 0 ||
          !Number.isSafeInteger(
            event.payload.splitDenominator,
          ) ||
          event.payload.splitDenominator <= 0 ||
          event.payload
            .cashDividendCentsPerShare !== 0
        )
      ) {
        errors.push(
          `INVALID_SECURITY_CORPORATE_ACTION:${event.id}`,
        );
        continue;
      }
      if (
        event.type === 'player_motion_step' &&
        (
          event.actorId !== 'player' ||
          event.payload.sceneId !==
            state.world.spatial?.activeSceneId ||
          event.payload.geometryRevision !==
            state.world.spatial?.geometryRevision ||
          !Number.isSafeInteger(
            event.payload.controlSeq,
          ) ||
          event.payload.controlSeq < 0
        )
      ) {
        errors.push(
          `INVALID_PLAYER_MOTION_EVENT:${event.id}`,
        );
        continue;
      }
      if (event.type === 'open_world_city_completion') {
        const commitmentId = event.payload.commitmentId;
        const commitment =
          state.world.openWorldCityAuthority?.commitments?.find(
            (entry) => entry.commitmentId === commitmentId,
          );
        if (
          event.actorId !== 'player' ||
          typeof commitmentId !== 'string' ||
          commitmentId.length === 0 ||
          !commitment ||
          commitment.actorId !== event.actorId ||
          commitment.endsAtVirtualTime !== event.scheduledMs
        ) {
          errors.push(
            `INVALID_OPEN_WORLD_CITY_COMPLETION_EVENT:${event.id}`,
          );
        }
        openWorldCityCompletionEvents.push(event);
      }
      if (
        event.type === 'agent_command_batch' &&
        (() => {
          const agent =
            state.agentEcology?.agents?.[event.actorId];
          const activity = recentActivityById(
            state,
            event.payload.agentActivityId,
          );
          return (
          !agent ||
          event.payload.agentId !== event.actorId ||
          typeof event.payload.agentActivityId !== 'string' ||
          !activity ||
          activity.agentId !== event.actorId ||
          event.scheduledMs !== activity.virtualMs + 1 ||
          !Array.isArray(event.payload.commands) ||
          event.payload.commands.length < 1 ||
          event.payload.commands.length >
            MAX_AGENT_COMMANDS_PER_BATCH ||
          event.payload.commands.some(
            (command) =>
              (
                command.type !== 'cancel_order' &&
                command.type !== 'submit_order'
              ) ||
              command.actorId !== agent.accountId ||
              command.brokerId !== agent.brokerId ||
              command.source !== 'npc_agent' ||
              (
                command.ecologyAgentId ??
                (
                  state.agentEcology?.ruleVersion ===
                  'lzy-agent-ecology-0.6.0'
                    ? command.actorId
                    : null
                )
              ) !== event.actorId ||
              command.agentActivityId !==
                event.payload.agentActivityId ||
              !parentOrderProvenanceMatchesAgent(
                state,
                command.parentOrderId,
                event.actorId,
              ),
          )
          );
        })()
      ) {
        errors.push(`INVALID_AGENT_COMMAND_BATCH:${event.id}`);
        continue;
      }
      if (event.type === 'quote_frame') quoteFrameEvents.push(event);
      if (event.type === 'derivative_actor_cycle') {
        derivativeActorCycleEvents.push(event);
      }
      if (event.type === 'world_day_settlement') worldDayEvents.push(event);
      if (event.type === 'agent_decision') {
        agentDecisionEvents.push(event);
      }
      if (event.type === 'public_flow_response') {
        publicResponseEvents.push(event);
      }
      if (event.type === 'player_motion_step') {
        playerMotionEvents.push(event);
      }
      if (
        index > 0 &&
        compareEvents(
          state.eventQueue[Math.floor((index - 1) / 2)],
          event,
        ) > 0
      ) {
        errors.push(`INVALID_EVENT_QUEUE_HEAP:${index}`);
      }
      let expectedPriority = MARKET_PHASE_PRIORITY.PLAYER_COMMAND;
      if (event.type === 'quote_frame') {
        expectedPriority = MARKET_PHASE_PRIORITY.QUOTE_FRAME;
      } else if (event.type === 'player_motion_step') {
        expectedPriority = MARKET_PHASE_PRIORITY.PLAYER_MOTION;
      } else if (
        event.type ===
        'security_corporate_action'
      ) {
        expectedPriority =
          MARKET_PHASE_PRIORITY.SESSION;
      } else if (
        event.type === 'derivative_actor_cycle'
      ) {
        expectedPriority =
          MARKET_PHASE_PRIORITY
            .DERIVATIVE_ACTOR_CYCLE;
      } else if (event.type === 'world_day_settlement') {
        expectedPriority = MARKET_PHASE_PRIORITY.WORLD_DAY_SETTLEMENT;
      } else if (event.type === 'agent_decision') {
        const agent = state.agentEcology?.agents?.[event.actorId];
        if (
          !agent ||
          event.payload.agentId !== event.actorId ||
          event.payload.trigger !== 'cadence'
        ) {
          errors.push(`INVALID_AGENT_DECISION_EVENT:${event.id}`);
        }
        expectedPriority =
          agent?.kind === 'maker'
            ? MARKET_PHASE_PRIORITY.MAKER_QUOTE
            : MARKET_PHASE_PRIORITY.INSTITUTION_DECISION;
      } else if (event.type === 'public_flow_response') {
        const pending =
          state.agentEcology?.pendingResponses?.[event.actorId];
        if (
          event.payload.agentId !== event.actorId ||
          event.payload.trigger !== 'public_flow' ||
          !pending ||
          pending.eventId !== event.id
        ) {
          errors.push(`INVALID_PUBLIC_RESPONSE_EVENT:${event.id}`);
        }
        expectedPriority = MARKET_PHASE_PRIORITY.PUBLIC_FLOW_RESPONSE;
      } else if (event.type === 'agent_command_batch') {
        const commandTypes = new Set(
          event.payload.commands.map((command) => command.type),
        );
        if (commandTypes.size !== 1) {
          errors.push(`MIXED_AGENT_COMMAND_BATCH:${event.id}`);
        }
        expectedPriority = commandPriority(
          event.payload.commands[0],
        );
      } else if (event.payload.type === 'cancel_order') {
        expectedPriority = MARKET_PHASE_PRIORITY.CANCEL_EXPIRE;
      } else if (event.payload.type === 'submit_order') {
        expectedPriority = MARKET_PHASE_PRIORITY.BROKER_ROUTE;
      }
      if (event.phasePriority !== expectedPriority) {
        errors.push(`EVENT_PHASE_MISMATCH:${event.id}`);
      }
    }
    if (playerMotionEvents.length > 1) {
      errors.push('DUPLICATE_PLAYER_MOTION_EVENT');
    }
    const completionCounts = new Map();
    for (const event of openWorldCityCompletionEvents) {
      const commitmentId = event.payload.commitmentId;
      completionCounts.set(
        commitmentId,
        Number(completionCounts.get(commitmentId) ?? 0) + 1,
      );
    }
    for (const commitment of
      state.world.openWorldCityAuthority?.commitments ?? []) {
      if (completionCounts.get(commitment.commitmentId) !== 1) {
        errors.push(
          `INVALID_OPEN_WORLD_CITY_COMPLETION_ANCHOR:${commitment.commitmentId}`,
        );
      }
    }
    const lastPublishedFrameMs =
      state.quoteFrames?.at(-1)?.virtualMs ?? 0;
    const atQuoteBoundary =
      state.nowMs > 0 && state.nowMs % QUOTE_FRAME_MS === 0;
    const atWorldDayBoundary =
      state.nowMs > 0 && state.nowMs % WORLD_DAY_MS === 0;
    const quoteFramePendingAtCurrentBoundary =
      atQuoteBoundary && lastPublishedFrameMs < state.nowMs;
    const worldDayPendingAtCurrentBoundary =
      atWorldDayBoundary &&
      state.lastWorldDaySettlementMs < state.nowMs;
    const expectedQuoteFrameMs = quoteFramePendingAtCurrentBoundary
      ? state.nowMs
      : (Math.floor(state.nowMs / QUOTE_FRAME_MS) + 1) * QUOTE_FRAME_MS;
    const expectedWorldDayMs = worldDayPendingAtCurrentBoundary
      ? state.nowMs
      : (Math.floor(state.nowMs / WORLD_DAY_MS) + 1) * WORLD_DAY_MS;
    const expectedDerivativeCycleMs =
      expectedDerivativeActorCycleEventMs(state);
    if (
      lastPublishedFrameMs > state.nowMs ||
      state.lastWorldDaySettlementMs > lastPublishedFrameMs ||
      (
        atWorldDayBoundary &&
        state.lastWorldDaySettlementMs === state.nowMs &&
        lastPublishedFrameMs !== state.nowMs
      )
    ) {
      errors.push('INVALID_BOUNDARY_PHASE_STATE');
    }
    if (
      quoteFrameEvents.length !== 1 ||
      quoteFrameEvents[0].scheduledMs !== expectedQuoteFrameMs
    ) {
      errors.push('INVALID_NEXT_QUOTE_FRAME_ANCHOR');
    }
    if (
      worldDayEvents.length !== 1 ||
      worldDayEvents[0].scheduledMs !== expectedWorldDayMs
    ) {
      errors.push('INVALID_NEXT_WORLD_DAY_ANCHOR');
    }
    if (
      derivativeActorCycleEvents.length !== 1 ||
      derivativeActorCycleEvents[0].scheduledMs !==
        expectedDerivativeCycleMs
    ) {
      errors.push(
        'INVALID_NEXT_DERIVATIVE_ACTOR_CYCLE_ANCHOR',
      );
    }
    if (state.agentEcology?.enabled) {
      for (const agentId of Object.keys(
        state.agentEcology?.agents ?? {},
      )) {
        if (
          agentDecisionEvents.filter(
            (event) => event.actorId === agentId,
          ).length !== 1
        ) {
          errors.push(`INVALID_AGENT_DECISION_ANCHOR:${agentId}`);
        }
      }
    } else if (
      agentDecisionEvents.length > 0 ||
      publicResponseEvents.length > 0
    ) {
      errors.push('DISABLED_AGENT_ECOLOGY_HAS_EVENTS');
    }
    if (
      publicResponseEvents.length !==
      Object.keys(
        state.agentEcology?.pendingResponses ?? {},
      ).length
    ) {
      errors.push('INVALID_PUBLIC_RESPONSE_ANCHOR');
    }
    const queuedAgentEventCount = state.eventQueue.filter(
      (event) =>
        event.type === 'agent_decision' ||
        event.type === 'public_flow_response' ||
        event.type === 'agent_command_batch',
    ).length;
    if (queuedAgentEventCount > MAX_QUEUED_AGENT_EVENTS) {
      errors.push('AGENT_EVENT_QUEUE_LIMIT_EXCEEDED');
    }
    if (
      Number.isSafeInteger(state.nextEventSequence) &&
      state.nextEventSequence <= maximumSequence
    ) {
      errors.push('INVALID_NEXT_EVENT_SEQUENCE');
    }
  }

  if (
    !state.accounts ||
    typeof state.accounts !== 'object' ||
    Array.isArray(state.accounts)
  ) {
    errors.push('INVALID_ACCOUNTS_SCHEMA');
    return errors;
  }
  const requiredAccountIds = [
    'player',
    ...Object.keys(state.world.entities?.investors ?? {}),
    'maker_chengming',
    'maker_lingnan',
    'securities_lending_pool',
    ...derivativeCustodySpecs(state.world).map(
      (custody) => custody.accountId,
    ),
  ];
  const expectedAccountAuthority = Object.fromEntries(
    requiredAccountIds.map((accountId) => [
      accountId,
      accountId === 'maker_chengming'
        ? {
            kind: 'proprietary_maker',
            brokerId: 'broker_chengming',
          }
        : accountId === 'maker_lingnan'
          ? {
              kind: 'proprietary_maker',
              brokerId: 'broker_lingnan',
            }
          : accountId === 'securities_lending_pool'
            ? {
                kind: 'securities_lending_pool',
                brokerId: 'lzy_derivatives_clearing',
              }
            : accountId.startsWith(
                  'derivative_lending_custody_',
                )
              ? {
                  kind:
                    'derivative_lending_custody',
                  brokerId:
                    'lzy_derivatives_clearing',
                }
          : {
              kind: 'broker_client',
              brokerId: 'broker_lzy',
            },
    ]),
  );
  if (!sameStringSet(Object.keys(state.accounts), requiredAccountIds)) {
    errors.push('INVALID_ACCOUNT_ID_SET');
  }
  for (const accountId of requiredAccountIds) {
    if (!state.accounts[accountId]) {
      errors.push(`MISSING_ACCOUNT:${accountId}`);
    }
  }
  for (const [accountId, account] of Object.entries(state.accounts)) {
    if (
      !account ||
      typeof account.id !== 'string' ||
      account.id !== accountId ||
      !account.holdings ||
      !account.reservedHoldings ||
      !account.positionLedger ||
      !sameStringSet(Object.keys(account.holdings ?? {}), symbols) ||
      !sameStringSet(Object.keys(account.reservedHoldings ?? {}), symbols) ||
      !sameStringSet(Object.keys(account.positionLedger ?? {}), symbols) ||
      account.kind !== expectedAccountAuthority[accountId]?.kind ||
      account.brokerId !== expectedAccountAuthority[accountId]?.brokerId ||
      !Number.isSafeInteger(account.commitSeq) ||
      account.commitSeq < 0 ||
      account.commitSeq > state.commitSeq
    ) {
      errors.push(`INVALID_ACCOUNT_SCHEMA:${account?.id ?? 'unknown'}`);
      continue;
    }
    if (
      !Number.isSafeInteger(account.cashCents) ||
      !Number.isSafeInteger(account.reservedCashCents) ||
      account.cashCents < 0 ||
      account.reservedCashCents < 0 ||
      account.reservedCashCents > account.cashCents ||
      (
        account.id === 'player' &&
        account.reservedCashCents +
          derivativeReservedPlayerCashCents(state) >
          account.cashCents
      ) ||
      !Number.isSafeInteger(account.peakEquityCents) ||
      account.peakEquityCents < 0 ||
      !Number.isSafeInteger(account.drawdownBps) ||
      account.drawdownBps < 0 ||
      account.drawdownBps > 10_000 ||
      !Number.isSafeInteger(account.fundingStressBps) ||
      account.fundingStressBps < 0 ||
      account.fundingStressBps > 10_000 ||
      !Number.isSafeInteger(account.realizedPnlCents) ||
      !account.pnlDayAnchor ||
      !Number.isSafeInteger(account.pnlDayAnchor.dayId) ||
      account.pnlDayAnchor.dayId < 0 ||
      account.pnlDayAnchor.dayId >
        Math.floor(state.nowMs / WORLD_DAY_MS) ||
      !Number.isSafeInteger(
        account.pnlDayAnchor.totalPnlCents,
      )
    ) {
      errors.push(`INVALID_ACCOUNT_CASH:${account.id}`);
    }
    let realizedPnlCents = 0;
    for (const symbol of Object.keys(state.books)) {
      const holdings = account.holdings[symbol] ?? 0;
      const reserved = account.reservedHoldings[symbol] ?? 0;
      const position = account.positionLedger[symbol];
      if (
        !Number.isSafeInteger(holdings) ||
        !Number.isSafeInteger(reserved) ||
        holdings < 0 ||
        reserved < 0 ||
        reserved > holdings ||
        !position ||
        !Number.isSafeInteger(position.costCents) ||
        position.costCents < 0 ||
        !Number.isSafeInteger(position.realizedPnlCents) ||
        (holdings === 0 && position.costCents !== 0)
      ) {
        errors.push(`INVALID_ACCOUNT_HOLDINGS:${account.id}:${symbol}`);
      }
      realizedPnlCents += position?.realizedPnlCents ?? 0;
    }
    if (realizedPnlCents !== account.realizedPnlCents) {
      errors.push(`ACCOUNT_REALIZED_PNL_MISMATCH:${account.id}`);
    }
  }

  const expectedReservedCash = Object.fromEntries(
    Object.keys(state.accounts).map((accountId) => [accountId, 0]),
  );
  const expectedReservedHoldings = Object.fromEntries(
    Object.keys(state.accounts).map((accountId) => [
      accountId,
      Object.fromEntries(symbols.map((symbol) => [symbol, 0])),
    ]),
  );
  for (const order of allBookOrders(state)) {
    const account = state.accounts[order.ownerId];
    if (!account) {
      errors.push(`ORDER_WITHOUT_ACCOUNT:${order.id}`);
      continue;
    }
    if (order.brokerId !== account.brokerId) {
      errors.push(`ORDER_BROKER_AUTHORITY_MISMATCH:${order.id}`);
    }
    if (
      account.kind === 'securities_lending_pool' ||
      account.kind ===
        'derivative_lending_custody'
    ) {
      errors.push(`CUSTODY_ACCOUNT_HAS_ORDER:${order.id}`);
    }
    if (
      (
        order.type === 'limit' &&
        !isPositiveInteger(order.priceTicks)
      ) ||
      (
        order.type === 'market' &&
        (
          order.priceTicks !== null ||
          order.tif !== 'IOC' ||
          activeOrder(order)
        )
      ) ||
      (order.type !== 'limit' && order.type !== 'market') ||
      (
        order.ecologyAgentId !== null &&
        order.ecologyAgentId !== undefined &&
        state.agentEcology?.agents?.[order.ecologyAgentId]
          ?.accountId !== order.ownerId
      ) ||
      !Number.isSafeInteger(order.filledGrossCents) ||
      order.filledGrossCents < 0 ||
      !Number.isSafeInteger(order.selfTradeGrossCents) ||
      order.selfTradeGrossCents < 0 ||
      order.selfTradeGrossCents > order.filledGrossCents ||
      !Number.isSafeInteger(order.chargedFeeCents) ||
      order.chargedFeeCents !==
        (
          order.side === 'buy'
            ? calculateFeeCents(order.filledGrossCents)
            : calculateFeeCents(
                order.selfTradeGrossCents,
              )
        ) ||
      !isPositiveInteger(order.arrivalPriceTicks) ||
      !Number.isSafeInteger(order.commitSeq) ||
      order.commitSeq < 1 ||
      order.commitSeq > state.commitSeq
    ) {
      errors.push(`INVALID_ORDER_SETTLEMENT_STATE:${order.id}`);
    }
    if (order.side === 'buy') {
      const required = calculateBuyReservation(order);
      if (order.reservedCashCents !== required) {
        errors.push(`ORDER_RESERVATION_MISMATCH:${order.id}`);
      }
      expectedReservedCash[order.ownerId] += required;
      if (order.reservedUnits !== 0) {
        errors.push(`BUY_ORDER_RESERVED_UNITS:${order.id}`);
      }
    } else {
      const required = activeOrder(order) ? order.remainingQty : 0;
      if (order.reservedUnits !== required) {
        errors.push(`ORDER_RESERVATION_MISMATCH:${order.id}`);
      }
      expectedReservedHoldings[order.ownerId][order.symbol] += required;
      if (order.reservedCashCents !== 0) {
        errors.push(`SELL_ORDER_RESERVED_CASH:${order.id}`);
      }
    }
  }
  for (const account of Object.values(state.accounts)) {
    if (account.reservedCashCents !== expectedReservedCash[account.id]) {
      errors.push(`ACCOUNT_CASH_RESERVATION_MISMATCH:${account.id}`);
    }
    for (const symbol of symbols) {
      if (
        (account.reservedHoldings[symbol] ?? 0) !==
        expectedReservedHoldings[account.id][symbol]
      ) {
        errors.push(
          `ACCOUNT_HOLDING_RESERVATION_MISMATCH:${account.id}:${symbol}`,
        );
      }
    }
  }

  const playerAccount = state.accounts.player;
  if (
    playerAccount &&
    (
      cents(state.world.player.cash) !== playerAccount.cashCents ||
      !sameJson(state.world.player.holdings, playerAccount.holdings)
    )
  ) {
    errors.push('PLAYER_ACCOUNT_WORLD_MIRROR_MISMATCH');
  }
  for (const [investorId, investor] of Object.entries(
    state.world.entities?.investors ?? {},
  )) {
    const account = state.accounts[investorId];
    if (
      account &&
      (
        cents(investor.cash) !== account.cashCents ||
        !sameJson(investor.holdings, account.holdings)
      )
    ) {
      errors.push(`INVESTOR_ACCOUNT_WORLD_MIRROR_MISMATCH:${investorId}`);
    }
  }
  const makerAccounts = marketInventoryAccounts(state);
  const makerCashCents = makerAccounts.reduce(
    (sum, account) => sum + account.cashCents,
    0,
  );
  const makerHoldings = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      makerAccounts.reduce(
        (sum, account) => sum + (account.holdings[symbol] ?? 0),
        0,
      ),
    ]),
  );
  if (
    cents(state.world.market.maker.cash) !== makerCashCents ||
    !sameJson(state.world.market.maker.holdings, makerHoldings)
  ) {
    errors.push('MAKER_WORLD_MIRROR_MISMATCH');
  }
  const lendingPool =
    state.accounts.securities_lending_pool;
  const lendableSecurities =
    state.world.derivatives?.clearing
      ?.lendableSecurities ?? {};
  if (
    lendingPool &&
    (
      lendingPool.cashCents !== 0 ||
      lendingPool.reservedCashCents !== 0 ||
      symbols.some(
        (symbol) =>
          (lendingPool.holdings[symbol] ?? 0) !==
            (lendableSecurities[symbol] ?? 0) ||
          (lendingPool.reservedHoldings[symbol] ?? 0) !== 0,
      )
    )
  ) {
    errors.push('SECURITIES_LENDING_CUSTODY_MISMATCH');
  }
  for (const custody of derivativeCustodySpecs(
    state.world,
  )) {
    const account =
      state.accounts[custody.accountId];
    if (
      !account ||
      account.cashCents !== 0 ||
      account.reservedCashCents !== 0 ||
      symbols.some(
        (symbol) =>
          (account.holdings[symbol] ?? 0) !==
            (custody.holdings[symbol] ?? 0) ||
          (
            account.reservedHoldings[symbol] ?? 0
          ) !== 0,
      )
    ) {
      errors.push(
        `DERIVATIVE_LENDING_CUSTODY_MISMATCH:${custody.borrowerId}`,
      );
    }
  }
  if (
    !Number.isSafeInteger(state.exchangeFeePoolCents) ||
    state.exchangeFeePoolCents < 0 ||
    cents(state.world.market.exchangeFeePool) !== state.exchangeFeePoolCents
  ) {
    errors.push('FEE_POOL_WORLD_MIRROR_MISMATCH');
  }
  const expectedWorldOrders = allBookOrders(state).map(worldOrderMirror);
  if (!sameJson(state.world.market.orders, expectedWorldOrders)) {
    errors.push('ORDER_WORLD_MIRROR_MISMATCH');
  }
  for (const [symbol, book] of Object.entries(state.books)) {
    if (
      !sameJson(
        state.world.market.orderBooks[symbol],
        worldBookMirror(book, state.world.world.tick),
      )
    ) {
      errors.push(`BOOK_WORLD_MIRROR_MISMATCH:${symbol}`);
    }
  }

  const archive = state.orderArchive;
  if (
    !archive ||
    archive.maxTerminalPerSymbol !== MAX_TERMINAL_ORDERS_PER_SYMBOL ||
    archive.maxReferencesPerSymbol !== MAX_ARCHIVE_REFERENCES_PER_SYMBOL ||
    !Number.isSafeInteger(archive.totalArchived) ||
    archive.totalArchived < 0 ||
    !archive.bySymbol ||
    !sameStringSet(Object.keys(archive.bySymbol), symbols)
  ) {
    errors.push('INVALID_ORDER_ARCHIVE_SCHEMA');
  } else {
    let totalArchived = 0;
    const archivedReferenceIds = new Set();
    for (const symbol of symbols) {
      const entry = archive.bySymbol[symbol];
      if (
        !entry ||
        !Number.isSafeInteger(entry.totalArchived) ||
        entry.totalArchived < 0 ||
        !entry.statusCounts ||
        typeof entry.rollingDigest !== 'string' ||
        !/^[0-9a-f]{8}$/.test(entry.rollingDigest) ||
        !Array.isArray(entry.recentReferences) ||
        entry.recentReferences.length > MAX_ARCHIVE_REFERENCES_PER_SYMBOL
      ) {
        errors.push(`INVALID_ORDER_ARCHIVE_ENTRY:${symbol}`);
        continue;
      }
      const statusTotal = Object.values(entry.statusCounts).reduce(
        (sum, count) =>
          sum + (Number.isSafeInteger(count) && count >= 0 ? count : NaN),
        0,
      );
      if (
        Object.keys(entry.statusCounts).some(
          (status) => status !== 'filled' && status !== 'cancelled',
        ) ||
        statusTotal !== entry.totalArchived
      ) {
        errors.push(`ORDER_ARCHIVE_COUNT_MISMATCH:${symbol}`);
      }
      const expectedReferenceCount = Math.min(
        entry.totalArchived,
        MAX_ARCHIVE_REFERENCES_PER_SYMBOL,
      );
      if (entry.recentReferences.length !== expectedReferenceCount) {
        errors.push(`ORDER_ARCHIVE_REFERENCE_COUNT_MISMATCH:${symbol}`);
      }
      if (entry.totalArchived === 0) {
        if (
          entry.firstOrderId !== null ||
          entry.lastOrderId !== null ||
          entry.firstOrderSequence !== null ||
          entry.lastOrderSequence !== null
        ) {
          errors.push(`ORDER_ARCHIVE_EMPTY_BOUNDARY_MISMATCH:${symbol}`);
        }
      } else if (
        typeof entry.firstOrderId !== 'string' ||
        typeof entry.lastOrderId !== 'string' ||
        numericIdSuffix(entry.firstOrderId) < 1 ||
        numericIdSuffix(entry.lastOrderId) < 1 ||
        !Number.isSafeInteger(entry.firstOrderSequence) ||
        !Number.isSafeInteger(entry.lastOrderSequence) ||
        entry.firstOrderSequence < 1 ||
        entry.lastOrderSequence < entry.firstOrderSequence
      ) {
        errors.push(`ORDER_ARCHIVE_BOUNDARY_MISMATCH:${symbol}`);
      }
      let previousReference = null;
      for (const reference of entry.recentReferences) {
        const ownerAccount = state.accounts[reference?.ownerId];
        if (
          !reference ||
          typeof reference.id !== 'string' ||
          numericIdSuffix(reference.id) < 1 ||
          reference.symbol !== symbol ||
          !ownerAccount ||
          reference.brokerId !== ownerAccount?.brokerId ||
          (
            reference.ecologyAgentId !== null &&
            reference.ecologyAgentId !== undefined &&
            state.agentEcology?.agents?.[
              reference.ecologyAgentId
            ]?.accountId !== reference.ownerId
          ) ||
          (reference.side !== 'buy' && reference.side !== 'sell') ||
          (reference.type !== 'limit' && reference.type !== 'market') ||
          (reference.status !== 'filled' &&
            reference.status !== 'cancelled') ||
          (
            reference.type === 'limit' &&
            !isPositiveInteger(reference.priceTicks)
          ) ||
          (
            reference.type === 'market' &&
            (
              reference.priceTicks !== null ||
              reference.tif !== 'IOC'
            )
          ) ||
          !isPositiveInteger(reference.originalQty) ||
          !Number.isSafeInteger(reference.remainingQty) ||
          reference.remainingQty < 0 ||
          reference.remainingQty > reference.originalQty ||
          !Number.isSafeInteger(reference.submittedMs) ||
          reference.submittedMs < 0 ||
          !isPositiveInteger(reference.arrivalPriceTicks) ||
          !Number.isSafeInteger(reference.sequence) ||
          reference.sequence < 1 ||
          !Number.isSafeInteger(reference.commitSeq) ||
          reference.commitSeq < 1 ||
          reference.commitSeq > state.commitSeq ||
          archivedReferenceIds.has(reference.id) ||
          Object.values(state.books).some(
            (book) => Boolean(book.orders[reference.id]),
          ) ||
          (
            previousReference &&
            (
              reference.sequence < previousReference.sequence ||
              (
                reference.sequence === previousReference.sequence &&
                reference.id <= previousReference.id
              )
            )
          )
        ) {
          errors.push(`INVALID_ORDER_ARCHIVE_REFERENCE:${symbol}`);
        }
        archivedReferenceIds.add(reference?.id);
        previousReference = reference;
      }
      const firstReference = entry.recentReferences[0];
      const lastReference = entry.recentReferences.at(-1);
      if (
        entry.totalArchived > 0 &&
        (
          !lastReference ||
          entry.lastOrderId !== lastReference.id ||
          entry.lastOrderSequence !== lastReference.sequence ||
          (
            entry.totalArchived <= MAX_ARCHIVE_REFERENCES_PER_SYMBOL &&
            (
              entry.firstOrderId !== firstReference?.id ||
              entry.firstOrderSequence !== firstReference?.sequence
            )
          )
        )
      ) {
        errors.push(`ORDER_ARCHIVE_REFERENCE_BOUNDARY_MISMATCH:${symbol}`);
      }
      totalArchived += entry.totalArchived;
    }
    if (totalArchived !== archive.totalArchived) {
      errors.push('ORDER_ARCHIVE_TOTAL_MISMATCH');
    }
  }

  const realtimeArchive = state.realtimeAuditArchive;
  if (
    !realtimeArchive ||
    realtimeArchive.format !== 'realtime-audit-chain-archive-v1' ||
    realtimeArchive.maxLiveChains !==
      MAX_LIVE_REALTIME_AUDIT_CHAINS ||
    realtimeArchive.maxRecentBundles !==
      MAX_RECENT_REALTIME_AUDIT_BUNDLES ||
    realtimeArchive.maxChainReferencesPerBundle !==
      MAX_CHAIN_REFERENCES_PER_AUDIT_BUNDLE ||
    realtimeArchive.maxReceiptReferencesPerBundle !==
      MAX_RECEIPT_REFERENCES_PER_AUDIT_BUNDLE ||
    realtimeArchive.maxFoldedBlocks !==
      MAX_REALTIME_AUDIT_FOLDED_BLOCKS ||
    realtimeArchive.losslessPayloadVersion !==
      REALTIME_AUDIT_LOSSLESS_PAYLOAD_VERSION ||
    !Number.isSafeInteger(
      realtimeArchive.losslessArchivedBundles,
    ) ||
    realtimeArchive.losslessArchivedBundles < 0 ||
    !Number.isSafeInteger(
      realtimeArchive.losslessArchivedChains,
    ) ||
    realtimeArchive.losslessArchivedChains < 0 ||
    !Number.isSafeInteger(
      realtimeArchive.losslessArchivedReceipts,
    ) ||
    realtimeArchive.losslessArchivedReceipts < 0 ||
    !Number.isSafeInteger(
      realtimeArchive.legacyDigestOnlyBundles,
    ) ||
    realtimeArchive.legacyDigestOnlyBundles < 0 ||
    !Number.isSafeInteger(
      realtimeArchive.legacyDigestOnlyChains,
    ) ||
    realtimeArchive.legacyDigestOnlyChains < 0 ||
    !Number.isSafeInteger(
      realtimeArchive.legacyDigestOnlyReceipts,
    ) ||
    realtimeArchive.legacyDigestOnlyReceipts < 0 ||
    !Number.isSafeInteger(realtimeArchive.totalArchivedBundles) ||
    realtimeArchive.totalArchivedBundles < 0 ||
    !Number.isSafeInteger(realtimeArchive.totalArchivedChains) ||
    realtimeArchive.totalArchivedChains < 0 ||
    !Number.isSafeInteger(realtimeArchive.totalArchivedReceipts) ||
    realtimeArchive.totalArchivedReceipts < 0 ||
    typeof realtimeArchive.rollingDigest !== 'string' ||
    !/^[0-9a-f]{8}$/.test(realtimeArchive.rollingDigest) ||
    !Number.isSafeInteger(realtimeArchive.nextBlockSequence) ||
    realtimeArchive.nextBlockSequence < 1 ||
    !Number.isSafeInteger(realtimeArchive.liveChainCount) ||
    realtimeArchive.liveChainCount < 0 ||
    realtimeArchive.liveChainCount >
      MAX_LIVE_REALTIME_AUDIT_CHAINS ||
    !Number.isSafeInteger(
      realtimeArchive.slotDomainStartMs,
    ) ||
    realtimeArchive.slotDomainStartMs !==
      deriveFixedIntradayTimeDomain(state.nowMs, {
        clockOffsetMs:
          MARKET_CLOCK_ORIGIN_OFFSET_MS,
      }).startMs ||
    !Array.isArray(realtimeArchive.recentBundles) ||
    realtimeArchive.recentBundles.length >
      MAX_RECENT_REALTIME_AUDIT_BUNDLES ||
    !Array.isArray(realtimeArchive.foldedBlocks) ||
    realtimeArchive.foldedBlocks.length >
      MAX_REALTIME_AUDIT_FOLDED_BLOCKS ||
    !realtimeArchive.pendingFrame ||
    !Number.isSafeInteger(realtimeArchive.pendingFrame.afterFrameMs) ||
    realtimeArchive.pendingFrame.afterFrameMs !==
      (state.quoteFrames?.at(-1)?.virtualMs ?? -1) ||
    !Number.isSafeInteger(realtimeArchive.pendingFrame.tradeCount) ||
    realtimeArchive.pendingFrame.tradeCount < 0 ||
    !Number.isSafeInteger(realtimeArchive.pendingFrame.volume) ||
    realtimeArchive.pendingFrame.volume < 0
  ) {
    errors.push('INVALID_REALTIME_AUDIT_ARCHIVE_SCHEMA');
  } else {
    const actualLiveChainCount =
      state.world.market.trades.reduce(
        (count, trade) =>
          count +
          (
            trade?.source ===
              'realtime_order_book' ||
            trade?.id?.startsWith('rt_trade_')
              ? 1
              : 0
          ),
        0,
      );
    if (
      actualLiveChainCount !==
      realtimeArchive.liveChainCount
    ) {
      errors.push(
        'REALTIME_AUDIT_LIVE_CHAIN_COUNT_MISMATCH',
      );
    }
    const liveRecordIds = new Set([
      ...state.world.market.trades.map((record) => record.id),
      ...state.world.eventLog.map((record) => record.id),
      ...state.world.ledger.map((record) => record.id),
      ...state.world.facts.map((record) => record.id),
      ...state.world.memories.map((record) => record.id),
      ...state.receipts.map((record) => record.id),
    ]);
    let archivedBundleCount = 0;
    let archivedChainCount = 0;
    let archivedReceiptCount = 0;
    let previousTradeSequence = 0;
    let previousCommitSeq = 0;
    const archivedReferenceIds = new Set();
    const losslessRecordIds = new Set();
    let losslessBundleCount = 0;
    let losslessChainCount = 0;
    let losslessReceiptCount = 0;
    function registerLosslessPayload(
      payload,
      {
        payloadDigest = null,
        commitSeq = null,
        minimumCommitSeq = null,
        maximumCommitSeq = null,
        chainCount = null,
        receiptCount = null,
        firstTradeId = null,
        lastTradeId = null,
        digest = null,
      } = {},
    ) {
      let summary;
      try {
        summary = verifiedLosslessAuditPayloadSummary(
          state,
          payload,
          payloadDigest,
          {
            reuseVerified:
              reuseVerifiedArchives,
          },
        );
      } catch {
        errors.push('INVALID_REALTIME_AUDIT_LOSSLESS_PAYLOAD');
        return null;
      }
      if (
        (commitSeq !== null && summary.commitSeq !== commitSeq) ||
        (
          minimumCommitSeq !== null &&
          summary.commitSeq < minimumCommitSeq
        ) ||
        (
          maximumCommitSeq !== null &&
          summary.commitSeq > maximumCommitSeq
        ) ||
        (chainCount !== null &&
          summary.chainCount !== chainCount) ||
        (receiptCount !== null &&
          summary.receiptCount !== receiptCount) ||
        (firstTradeId !== null &&
          summary.firstTradeId !== firstTradeId) ||
        (lastTradeId !== null &&
          summary.lastTradeId !== lastTradeId) ||
        (digest !== null && summary.digest !== digest) ||
        summary.recordIds.some(
          (recordId) =>
            liveRecordIds.has(recordId) ||
            losslessRecordIds.has(recordId),
        )
      ) {
        errors.push('INVALID_REALTIME_AUDIT_LOSSLESS_PAYLOAD');
        return null;
      }
      for (const recordId of summary.recordIds) {
        losslessRecordIds.add(recordId);
      }
      losslessBundleCount += 1;
      losslessChainCount += summary.chainCount;
      losslessReceiptCount += summary.receiptCount;
      return summary;
    }
    function auditFoldedBlock(block) {
      const trusted =
        reuseVerifiedArchives &&
        verifiedRealtimeAuditBlocks.has(block);
      const branch = Array.isArray(block?.children);
      if (
        !block ||
        typeof block.id !== 'string' ||
        !/^rt_chain_archive_block_\d{8}$/.test(block.id) ||
        !Number.isSafeInteger(block.bundleCount) ||
        block.bundleCount < 1 ||
        !Number.isSafeInteger(block.chainCount) ||
        block.chainCount < block.bundleCount ||
        !Number.isSafeInteger(block.receiptCount) ||
        block.receiptCount < block.bundleCount ||
        typeof block.fromTradeId !== 'string' ||
        typeof block.toTradeId !== 'string' ||
        !Number.isSafeInteger(block.fromTradeSequence) ||
        !Number.isSafeInteger(block.toTradeSequence) ||
        block.fromTradeSequence < 1 ||
        block.toTradeSequence < block.fromTradeSequence ||
        numericIdSuffix(block.fromTradeId) !==
          block.fromTradeSequence ||
        numericIdSuffix(block.toTradeId) !==
          block.toTradeSequence ||
        !Number.isSafeInteger(block.fromCommitSeq) ||
        !Number.isSafeInteger(block.toCommitSeq) ||
        block.fromCommitSeq < 1 ||
        block.toCommitSeq < block.fromCommitSeq ||
        block.toCommitSeq > state.commitSeq ||
        typeof block.digest !== 'string' ||
        !/^[0-9a-f]{8}$/.test(block.digest) ||
        !Array.isArray(block.losslessPayloads) ||
        typeof block.losslessPayloadDigest !== 'string' ||
        !/^[0-9a-f]{8}$/.test(
          block.losslessPayloadDigest,
        ) ||
        !Number.isSafeInteger(
          block.losslessBundleCount,
        ) ||
        block.losslessBundleCount < 0 ||
        block.losslessBundleCount > block.bundleCount ||
        !Number.isSafeInteger(
          block.losslessChainCount,
        ) ||
        block.losslessChainCount <
          block.losslessBundleCount ||
        block.losslessChainCount > block.chainCount ||
        !Number.isSafeInteger(
          block.losslessReceiptCount,
        ) ||
        block.losslessReceiptCount <
          block.losslessBundleCount ||
        block.losslessReceiptCount > block.receiptCount
      ) {
        errors.push(
          `INVALID_REALTIME_AUDIT_ARCHIVE_BLOCK:${block?.id}`,
        );
        return false;
      }

      if (isRealtimeAuditColdBlockReference(block)) {
        if (
          realtimeAuditColdReferenceKnown(
            state,
            block.coldBlock,
            'block',
          ) &&
          !realtimeAuditColdStoreCanRead(state)
        ) {
          losslessBundleCount +=
            block.losslessBundleCount;
          losslessChainCount +=
            block.losslessChainCount;
          losslessReceiptCount +=
            block.losslessReceiptCount;
          return true;
        }
        let resolved;
        try {
          resolved = resolveRealtimeAuditColdBlock(
            state,
            block,
          );
        } catch {
          errors.push(
            `INVALID_REALTIME_AUDIT_ARCHIVE_COLD_BLOCK:${block.id}`,
          );
          return false;
        }
        return auditFoldedBlock(resolved);
      }

      const losslessBefore = {
        bundles: losslessBundleCount,
        chains: losslessChainCount,
        receipts: losslessReceiptCount,
      };
      if (branch) {
        const [left, right] = block.children;
        if (
          block.children.length !== 2 ||
          block.losslessPayloads.length !== 0 ||
          !left ||
          !right ||
          block.bundleCount !==
            left.bundleCount + right.bundleCount ||
          block.chainCount !==
            left.chainCount + right.chainCount ||
          block.receiptCount !==
            left.receiptCount + right.receiptCount ||
          block.losslessBundleCount !==
            left.losslessBundleCount +
              right.losslessBundleCount ||
          block.losslessChainCount !==
            left.losslessChainCount +
              right.losslessChainCount ||
          block.losslessReceiptCount !==
            left.losslessReceiptCount +
              right.losslessReceiptCount ||
          block.fromTradeId !== left.fromTradeId ||
          block.toTradeId !== right.toTradeId ||
          block.fromTradeSequence !==
            left.fromTradeSequence ||
          block.toTradeSequence !==
            right.toTradeSequence ||
          block.fromCommitSeq !== left.fromCommitSeq ||
          block.toCommitSeq !== right.toCommitSeq ||
          left.toTradeSequence >=
            right.fromTradeSequence ||
          left.toCommitSeq >= right.fromCommitSeq ||
          block.digest !==
            auditBlockBranchDigest(block.children) ||
          block.losslessPayloadDigest !==
            auditBlockBranchPayloadDigest(
              block.children,
            )
        ) {
          errors.push(
            `INVALID_REALTIME_AUDIT_ARCHIVE_BRANCH:${block.id}`,
          );
          return false;
        }
        if (trusted) {
          losslessBundleCount +=
            block.losslessBundleCount;
          losslessChainCount +=
            block.losslessChainCount;
          losslessReceiptCount +=
            block.losslessReceiptCount;
        } else {
          auditFoldedBlock(left);
          auditFoldedBlock(right);
        }
      } else if (trusted) {
        losslessBundleCount +=
          block.losslessBundleCount;
        losslessChainCount +=
          block.losslessChainCount;
        losslessReceiptCount +=
          block.losslessReceiptCount;
      } else {
        if (
          validRealtimeAuditColdReference(
            block.compressedLosslessPayloads,
            'payload',
          ) &&
          realtimeAuditColdReferenceKnown(
            state,
            block.compressedLosslessPayloads,
            'payload',
          ) &&
          !realtimeAuditColdStoreCanRead(state)
        ) {
          losslessBundleCount +=
            block.losslessBundleCount;
          losslessChainCount +=
            block.losslessChainCount;
          losslessReceiptCount +=
            block.losslessReceiptCount;
          return true;
        }
        const compressed =
          block.losslessPayloadEncoding ===
          REALTIME_AUDIT_BLOCK_PAYLOAD_ENCODING;
        let payloads = block.losslessPayloads;
        try {
          if (compressed) {
            const compressedPayload =
              typeof block.compressedLosslessPayloads ===
              'string'
                ? block.compressedLosslessPayloads
                : realtimeAuditColdRecordValue(
                    state,
                    block.compressedLosslessPayloads,
                    'payload',
                  );
            if (
              block.losslessPayloads.length !== 0 ||
              block.losslessPayloadDigest !==
                hashText(compressedPayload)
            ) {
              throw new Error(
                'INVALID_REALTIME_AUDIT_COMPRESSED_PAYLOAD',
              );
            }
            payloads = decompressLosslessPayloads(
              block,
              state,
            );
          } else if (
            block.losslessPayloadDigest !==
              hashText(
                JSON.stringify(
                  block.losslessPayloads,
                ),
              )
          ) {
            throw new Error(
              'INVALID_REALTIME_AUDIT_LOSSLESS_PAYLOAD',
            );
          }
        } catch {
          errors.push(
            `INVALID_REALTIME_AUDIT_ARCHIVE_LEAF:${block.id}`,
          );
          return false;
        }
        if (
          payloads.length > block.bundleCount ||
          payloads.length !== block.losslessBundleCount
        ) {
          errors.push(
            `INVALID_REALTIME_AUDIT_ARCHIVE_LEAF:${block.id}`,
          );
          return false;
        }
        for (const payload of payloads) {
          registerLosslessPayload(payload, {
            minimumCommitSeq: block.fromCommitSeq,
            maximumCommitSeq: block.toCommitSeq,
          });
        }
        const verifiedPayloads =
          verifiedRealtimeAuditPayloadSummaries.get(
            state,
          );
        for (const payload of payloads) {
          verifiedPayloads?.delete(payload);
        }
      }
      if (
        losslessBundleCount -
            losslessBefore.bundles !==
          block.losslessBundleCount ||
        losslessChainCount -
            losslessBefore.chains !==
          block.losslessChainCount ||
        losslessReceiptCount -
            losslessBefore.receipts !==
          block.losslessReceiptCount
      ) {
        errors.push(
          `INVALID_REALTIME_AUDIT_ARCHIVE_LOSSLESS_COUNT:${block.id}`,
        );
        return false;
      }
      return true;
    }
    for (const block of realtimeArchive.foldedBlocks) {
      const ordered =
        block?.fromTradeSequence >
          previousTradeSequence &&
        block?.fromCommitSeq > previousCommitSeq;
      if (!ordered) {
        errors.push(
          `INVALID_REALTIME_AUDIT_ARCHIVE_ORDER:${block?.id}`,
        );
      }
      const validBlock = auditFoldedBlock(block);
      if (!ordered || !validBlock) {
        continue;
      }
      archivedBundleCount += block.bundleCount;
      archivedChainCount += block.chainCount;
      archivedReceiptCount += block.receiptCount;
      previousTradeSequence = block.toTradeSequence;
      previousCommitSeq = block.toCommitSeq;
    }
    for (const bundle of realtimeArchive.recentBundles) {
      const expectedChainReferences = Math.min(
        bundle?.chainCount ?? 0,
        MAX_CHAIN_REFERENCES_PER_AUDIT_BUNDLE,
      );
      const expectedReceiptReferences = Math.min(
        bundle?.receiptCount ?? 0,
        MAX_RECEIPT_REFERENCES_PER_AUDIT_BUNDLE,
      );
      const statusTotal = Object.values(
        bundle?.statusCounts ?? {},
      ).reduce(
        (sum, count) =>
          sum + (Number.isSafeInteger(count) && count >= 0 ? count : NaN),
        0,
      );
      if (
        !bundle ||
        !Number.isSafeInteger(bundle.commitSeq) ||
        bundle.commitSeq < 1 ||
        bundle.commitSeq > state.commitSeq ||
        !Number.isSafeInteger(bundle.archivedAtTick) ||
        bundle.archivedAtTick < 0 ||
        !Number.isSafeInteger(bundle.archivedAtMs) ||
        bundle.archivedAtMs < 0 ||
        !Number.isSafeInteger(bundle.archivedAtCommitSeq) ||
        bundle.archivedAtCommitSeq < bundle.commitSeq ||
        bundle.archivedAtCommitSeq > state.commitSeq ||
        !Number.isSafeInteger(bundle.chainCount) ||
        bundle.chainCount < 1 ||
        !Number.isSafeInteger(bundle.receiptCount) ||
        bundle.receiptCount < 1 ||
        statusTotal !== bundle.receiptCount ||
        typeof bundle.firstTradeId !== 'string' ||
        typeof bundle.lastTradeId !== 'string' ||
        !Number.isSafeInteger(bundle.firstTradeSequence) ||
        !Number.isSafeInteger(bundle.lastTradeSequence) ||
        bundle.firstTradeSequence < 1 ||
        bundle.lastTradeSequence < bundle.firstTradeSequence ||
        numericIdSuffix(bundle.firstTradeId) !==
          bundle.firstTradeSequence ||
        numericIdSuffix(bundle.lastTradeId) !==
          bundle.lastTradeSequence ||
        bundle.firstTradeSequence <= previousTradeSequence ||
        bundle.commitSeq <= previousCommitSeq ||
        !Array.isArray(bundle.receiptReferences) ||
        bundle.receiptReferences.length !== expectedReceiptReferences ||
        !Array.isArray(bundle.chainReferences) ||
        bundle.chainReferences.length !== expectedChainReferences ||
        bundle.chainReferences.at(-1)?.trade?.id !==
          bundle.lastTradeId ||
        (
          bundle.chainCount <=
            MAX_CHAIN_REFERENCES_PER_AUDIT_BUNDLE &&
          bundle.chainReferences[0]?.trade?.id !==
            bundle.firstTradeId
        ) ||
        bundle.referenceDigest !==
          hashText(
            JSON.stringify({
              receiptReferences: bundle.receiptReferences,
              chainReferences: bundle.chainReferences,
            }),
          ) ||
        (
          Object.hasOwn(bundle, 'losslessPayload') !==
          Object.hasOwn(bundle, 'losslessPayloadDigest')
        ) ||
        (
          Object.hasOwn(bundle, 'losslessPayload') &&
          (
            typeof bundle.losslessPayload !== 'string' ||
            bundle.losslessPayload.length === 0 ||
            typeof bundle.losslessPayloadDigest !== 'string' ||
            !/^[0-9a-f]{8}$/.test(
              bundle.losslessPayloadDigest,
            )
          )
        ) ||
        typeof bundle.digest !== 'string' ||
        !/^[0-9a-f]{8}$/.test(bundle.digest)
      ) {
        errors.push(
          `INVALID_REALTIME_AUDIT_ARCHIVE_BUNDLE:${
            bundle?.commitSeq ?? 'unknown'
          }`,
        );
        continue;
      }
      for (const reference of bundle.receiptReferences) {
        if (
          !reference ||
          typeof reference.id !== 'string' ||
          reference.commitSeq !== bundle.commitSeq ||
          !Number.isSafeInteger(reference.tradeCount) ||
          reference.tradeCount < 1 ||
          reference.tradeCount > bundle.chainCount ||
          typeof reference.firstTradeId !== 'string' ||
          typeof reference.lastTradeId !== 'string' ||
          numericIdSuffix(reference.firstTradeId) <
            bundle.firstTradeSequence ||
          numericIdSuffix(reference.lastTradeId) >
            bundle.lastTradeSequence ||
          numericIdSuffix(reference.lastTradeId) <
            numericIdSuffix(reference.firstTradeId) ||
          typeof reference.status !== 'string' ||
          typeof reference.digest !== 'string' ||
          !/^[0-9a-f]{8}$/.test(reference.digest) ||
          liveRecordIds.has(reference.id) ||
          archivedReferenceIds.has(reference.id)
        ) {
          errors.push(
            `INVALID_REALTIME_AUDIT_RECEIPT_REFERENCE:${reference?.id}`,
          );
        }
        archivedReferenceIds.add(reference?.id);
      }
      let previousReferenceTradeSequence = 0;
      for (const chain of bundle.chainReferences) {
        const records = [
          chain?.trade,
          chain?.event,
          chain?.journal,
          chain?.fact,
          chain?.memory,
        ];
        if (
          !isCompleteRealtimeAuditChain(chain, bundle.commitSeq) ||
          chain.digest !== auditChainDigest(chain) ||
          numericIdSuffix(chain.trade.id) <=
            previousReferenceTradeSequence ||
          numericIdSuffix(chain.trade.id) <
            bundle.firstTradeSequence ||
          numericIdSuffix(chain.trade.id) >
            bundle.lastTradeSequence ||
          records.some(
            (record) =>
              liveRecordIds.has(record?.id) ||
              archivedReferenceIds.has(record?.id),
          )
        ) {
          errors.push(
            `INVALID_REALTIME_AUDIT_CHAIN_REFERENCE:${
              chain?.trade?.id ?? 'unknown'
            }`,
          );
        }
        for (const record of records) {
          archivedReferenceIds.add(record?.id);
        }
        previousReferenceTradeSequence = numericIdSuffix(chain.trade.id);
      }
      if (typeof bundle.losslessPayload === 'string') {
        registerLosslessPayload(bundle.losslessPayload, {
          payloadDigest: bundle.losslessPayloadDigest,
          commitSeq: bundle.commitSeq,
          chainCount: bundle.chainCount,
          receiptCount: bundle.receiptCount,
          firstTradeId: bundle.firstTradeId,
          lastTradeId: bundle.lastTradeId,
          digest: bundle.digest,
        });
      }
      archivedBundleCount += 1;
      archivedChainCount += bundle.chainCount;
      archivedReceiptCount += bundle.receiptCount;
      previousTradeSequence = bundle.lastTradeSequence;
      previousCommitSeq = bundle.commitSeq;
    }
    if (
      archivedBundleCount !== realtimeArchive.totalArchivedBundles ||
      archivedChainCount !== realtimeArchive.totalArchivedChains ||
      archivedReceiptCount !== realtimeArchive.totalArchivedReceipts
    ) {
      errors.push('REALTIME_AUDIT_ARCHIVE_TOTAL_MISMATCH');
    }
    if (
      losslessBundleCount !==
        realtimeArchive.losslessArchivedBundles ||
      losslessChainCount !==
        realtimeArchive.losslessArchivedChains ||
      losslessReceiptCount !==
        realtimeArchive.losslessArchivedReceipts ||
      realtimeArchive.losslessArchivedBundles +
          realtimeArchive.legacyDigestOnlyBundles !==
        realtimeArchive.totalArchivedBundles ||
      realtimeArchive.losslessArchivedChains +
          realtimeArchive.legacyDigestOnlyChains !==
        realtimeArchive.totalArchivedChains ||
      realtimeArchive.losslessArchivedReceipts +
          realtimeArchive.legacyDigestOnlyReceipts !==
        realtimeArchive.totalArchivedReceipts
    ) {
      errors.push('INVALID_REALTIME_AUDIT_LOSSLESS_TOTALS');
    }
    const firstItem =
      realtimeArchive.foldedBlocks[0] ??
      realtimeArchive.recentBundles[0];
    const lastItem =
      realtimeArchive.recentBundles.at(-1) ??
      realtimeArchive.foldedBlocks.at(-1);
    if (realtimeArchive.totalArchivedBundles === 0) {
      if (
        realtimeArchive.firstTradeId !== null ||
        realtimeArchive.lastTradeId !== null ||
        realtimeArchive.firstTradeSequence !== null ||
        realtimeArchive.lastTradeSequence !== null ||
        realtimeArchive.rollingDigest !== '00000000'
      ) {
        errors.push('REALTIME_AUDIT_ARCHIVE_EMPTY_BOUNDARY_MISMATCH');
      }
    } else if (
      realtimeArchive.firstTradeId !==
        (firstItem.firstTradeId ?? firstItem.fromTradeId) ||
      realtimeArchive.firstTradeSequence !==
        (firstItem.firstTradeSequence ?? firstItem.fromTradeSequence) ||
      realtimeArchive.lastTradeId !==
        (lastItem.lastTradeId ?? lastItem.toTradeId) ||
      realtimeArchive.lastTradeSequence !==
        (lastItem.lastTradeSequence ?? lastItem.toTradeSequence)
    ) {
      errors.push('REALTIME_AUDIT_ARCHIVE_BOUNDARY_MISMATCH');
    }
    const maximumBlockSequence = Math.max(
      0,
      ...realtimeArchive.foldedBlocks.map((block) =>
        numericIdSuffix(block.id),
      ),
    );
    if (realtimeArchive.nextBlockSequence <= maximumBlockSequence) {
      errors.push('INVALID_REALTIME_AUDIT_ARCHIVE_SEQUENCE');
    }
  }

  if (!Array.isArray(state.quoteFrames) || !Array.isArray(state.receipts)) {
    errors.push('INVALID_PUBLICATION_SCHEMA');
  } else {
    const receiptIds = state.receipts.map((receipt) => receipt?.id);
    if (
      receiptIds.some(
        (id) => typeof id !== 'string' || id.length === 0,
      ) ||
      new Set(receiptIds).size !== receiptIds.length
    ) {
      errors.push('DUPLICATE_OR_INVALID_RECEIPT_ID');
    }
    const agentNontradeReceiptCount = state.receipts.filter(
      (receipt) =>
        receipt.source === 'npc_agent' &&
        (!Array.isArray(receipt.tradeIds) ||
          receipt.tradeIds.length === 0),
    ).length;
    if (
      agentNontradeReceiptCount >
      MAX_AGENT_NONTRADE_RECEIPTS
    ) {
      errors.push('AGENT_NONTRADE_RECEIPT_LIMIT_EXCEEDED');
    }
    const playerRejectedReceiptCount = state.receipts.filter(
      (receipt) =>
        receipt.actorId === 'player' &&
        receipt.status === 'rejected' &&
        (!Array.isArray(receipt.tradeIds) ||
          receipt.tradeIds.length === 0),
    ).length;
    if (
      playerRejectedReceiptCount >
      MAX_PLAYER_REJECTED_RECEIPTS
    ) {
      errors.push('PLAYER_REJECTED_RECEIPT_LIMIT_EXCEEDED');
    }
    const playerAutomationNontradeReceiptCount = state.receipts.filter(
      (receipt) =>
        (receipt.automationKind === 'quant' ||
          receipt.automationKind === 'stabilization') &&
        (!Array.isArray(receipt.tradeIds) ||
          receipt.tradeIds.length === 0),
    ).length;
    if (
      playerAutomationNontradeReceiptCount >
      MAX_PLAYER_AUTOMATION_NONTRADE_RECEIPTS
    ) {
      errors.push('PLAYER_AUTOMATION_RECEIPT_LIMIT_EXCEEDED');
    }
    let previousFrameMs = -1;
    for (const frame of state.quoteFrames) {
      if (
        !frame ||
        !Number.isSafeInteger(frame.virtualMs) ||
        frame.virtualMs <= previousFrameMs ||
        frame.virtualMs > state.nowMs ||
        frame.virtualMs % QUOTE_FRAME_MS !== 0 ||
        !Number.isSafeInteger(frame.tradeCount) ||
        frame.tradeCount < 0 ||
        !Number.isSafeInteger(frame.volume) ||
        frame.volume < 0 ||
        !frame.frameBars ||
        typeof frame.frameBars !== 'object' ||
        Array.isArray(frame.frameBars) ||
        !sameStringSet(Object.keys(frame.frameBars), symbols) ||
        !frame.symbols ||
        typeof frame.symbols !== 'object' ||
        Array.isArray(frame.symbols) ||
        !sameStringSet(Object.keys(frame.symbols), symbols)
      ) {
        errors.push(
          `INVALID_QUOTE_FRAME_SCHEMA:${frame?.virtualMs ?? 'unknown'}`,
        );
        continue;
      }
      let tradeCount = 0;
      let volume = 0;
      for (const symbol of symbols) {
        const bar = frame.frameBars[symbol];
        const mirroredBar = frame.symbols[symbol]?.frameBar;
        if (
          !visibleBarIsValid(bar, symbol, frame.virtualMs) ||
          !sameScalarRecord(mirroredBar, bar)
        ) {
          errors.push(
            `INVALID_QUOTE_FRAME_BAR:${frame.virtualMs}:${symbol}`,
          );
          continue;
        }
        tradeCount += bar.tradeCount;
        volume += bar.volume;
      }
      if (
        tradeCount !== frame.tradeCount ||
        volume !== frame.volume
      ) {
        errors.push(`QUOTE_FRAME_TOTAL_MISMATCH:${frame.virtualMs}`);
      }
      previousFrameMs = frame.virtualMs;
    }
    for (const [kind, records] of [
      ['FRAME', state.quoteFrames],
      ['RECEIPT', state.receipts],
    ]) {
      for (const record of records) {
        if (
          !Number.isSafeInteger(record.commitSeq) ||
          record.commitSeq < 0 ||
          record.commitSeq > state.commitSeq
        ) {
          errors.push(
            `INVALID_${kind}_COMMIT_SEQ:${record.id ?? record.virtualMs}`,
          );
        }
      }
    }
    const committedRecords = [
      ...state.quoteFrames,
      ...state.receipts,
      ...state.world.eventLog,
      ...state.world.ledger,
      ...state.world.facts,
      ...state.world.memories,
      ...state.world.narratives,
      ...state.world.replay,
      ...state.world.market.trades,
    ];
    for (const record of committedRecords) {
      if (
        record.commitSeq !== undefined &&
        (
          !Number.isSafeInteger(record.commitSeq) ||
          record.commitSeq < 0 ||
          record.commitSeq > state.commitSeq
        )
      ) {
        errors.push(`INVALID_RECORD_COMMIT_SEQ:${record.id ?? 'frame'}`);
      }
    }

    const lastWorldDayReceipt = [...state.receipts].reverse().find(
      (receipt) => receipt.type === 'world_advanced',
    );
    if (
      (
        state.lastWorldDaySettlementMs === 0 &&
        lastWorldDayReceipt
      ) ||
      (
        state.lastWorldDaySettlementMs > 0 &&
        (
          !lastWorldDayReceipt ||
          lastWorldDayReceipt.virtualMs !==
            state.lastWorldDaySettlementMs
        )
      )
    ) {
      errors.push('WORLD_DAY_SETTLEMENT_MARKER_MISMATCH');
    }
    for (const memory of state.world.memories) {
      if (
        memory.lastMutationCommitSeq !== undefined &&
        (
          !Number.isSafeInteger(memory.lastMutationCommitSeq) ||
          memory.lastMutationCommitSeq < 1 ||
          memory.lastMutationCommitSeq > state.commitSeq ||
          (
            Number.isSafeInteger(memory.commitSeq) &&
            memory.lastMutationCommitSeq < memory.commitSeq
          )
        )
      ) {
        errors.push(`INVALID_MEMORY_MUTATION_COMMIT_SEQ:${memory.id}`);
      }
      if (
        lastWorldDayReceipt &&
        memory.createdTick < lastWorldDayReceipt.tick &&
        memory.lastRecalledTick !== lastWorldDayReceipt.tick &&
        memory.lastMutationCommitSeq !== lastWorldDayReceipt.commitSeq
      ) {
        errors.push(`MEMORY_MUTATION_COMMIT_MISMATCH:${memory.id}`);
      }
    }

    const realtimeTrades = state.world.market.trades.filter(
      (trade) =>
        trade.source === 'realtime_order_book' ||
        trade.id?.startsWith('rt_trade_'),
    );
    const realtimeEvents = state.world.eventLog.filter(
      (event) =>
        event.type === 'realtime_market_trade' ||
        event.id?.startsWith('rt_event_'),
    );
    const realtimeJournals = state.world.ledger.filter(
      (journal) =>
        journal.type === 'realtime_secondary_trade_settlement' ||
        journal.id?.startsWith('rt_journal_'),
    );
    const realtimeFacts = state.world.facts.filter(
      (fact) =>
        fact.type === 'realtime_market_fill' ||
        fact.id?.startsWith('rt_fact_'),
    );
    const realtimeFactIds = new Set(realtimeFacts.map((fact) => fact.id));
    const realtimeMemories = state.world.memories.filter(
      (memory) =>
        memory.id?.startsWith('rt_memory_') ||
        realtimeFactIds.has(memory.factId),
    );
    const eventById = new Map(
      realtimeEvents.map((event) => [event.id, event]),
    );
    const journalById = new Map(
      realtimeJournals.map((journal) => [journal.id, journal]),
    );
    const factById = new Map(
      realtimeFacts.map((fact) => [fact.id, fact]),
    );
    const memoriesByFactId = new Map();
    for (const memory of realtimeMemories) {
      const memories = memoriesByFactId.get(memory.factId) ?? [];
      memories.push(memory);
      memoriesByFactId.set(memory.factId, memories);
    }
    const linkedEventIds = new Set();
    const linkedJournalIds = new Set();
    const linkedFactIds = new Set();
    const linkedMemoryIds = new Set();
    const realtimeTradeById = new Map(
      realtimeTrades.map((trade) => [trade.id, trade]),
    );
    const realtimeMemoryById = new Map(
      realtimeMemories.map((memory) => [memory.id, memory]),
    );
    if (
      realtimeTrades.length >
      MAX_LIVE_REALTIME_AUDIT_CHAINS
    ) {
      errors.push('REALTIME_AUDIT_LIVE_CHAIN_LIMIT_EXCEEDED');
    }
    if (
      realtimeTradeById.size !== realtimeTrades.length ||
      eventById.size !== realtimeEvents.length ||
      journalById.size !== realtimeJournals.length ||
      factById.size !== realtimeFacts.length ||
      realtimeMemoryById.size !== realtimeMemories.length
    ) {
      errors.push('DUPLICATE_REALTIME_AUDIT_ID');
    }
    for (const trade of realtimeTrades) {
      const event = eventById.get(trade.eventId);
      const journalId = event?.ledgerEntryIds?.[0];
      const journal = journalById.get(journalId);
      const fact = factById.get(trade.factId);
      const memories = memoriesByFactId.get(trade.factId) ?? [];
      const commitSeq = trade.commitSeq;
      if (
        !Number.isSafeInteger(commitSeq) ||
        commitSeq < 1 ||
        commitSeq > state.commitSeq ||
        !event ||
        event.ledgerEntryIds?.length !== 1 ||
        !journal ||
        journal.eventId !== event.id ||
        !fact ||
        fact.eventId !== event.id ||
        memories.length !== 1 ||
        event.commitSeq !== commitSeq ||
        journal.commitSeq !== commitSeq ||
        fact.commitSeq !== commitSeq ||
        memories[0]?.commitSeq !== commitSeq
      ) {
        errors.push(`INVALID_REALTIME_AUDIT_CHAIN:${trade.id}`);
        continue;
      }
      linkedEventIds.add(event.id);
      linkedJournalIds.add(journal.id);
      linkedFactIds.add(fact.id);
      linkedMemoryIds.add(memories[0].id);
    }
    const receiptLinkedTradeIds = new Set();
    for (const receipt of state.receipts) {
      if (
        receipt.type !== 'submit_order' ||
        !Array.isArray(receipt.tradeIds)
      ) {
        continue;
      }
      const uniqueTradeIds = new Set(receipt.tradeIds);
      if (
        uniqueTradeIds.size !== receipt.tradeIds.length ||
        receipt.tradeIds.some((tradeId) => {
          const trade = realtimeTradeById.get(tradeId);
          if (
            !trade ||
            trade.commitSeq !== receipt.commitSeq ||
            receiptLinkedTradeIds.has(tradeId)
          ) {
            return true;
          }
          receiptLinkedTradeIds.add(tradeId);
          return false;
        })
      ) {
        errors.push(`INVALID_RECEIPT_TRADE_COMMIT:${receipt.id}`);
      }
    }
    for (const trade of realtimeTrades) {
      if (!receiptLinkedTradeIds.has(trade.id)) {
        errors.push(`REALTIME_TRADE_WITHOUT_LIVE_RECEIPT:${trade.id}`);
      }
    }
    for (const [kind, records, linkedIds] of [
      ['EVENT', realtimeEvents, linkedEventIds],
      ['JOURNAL', realtimeJournals, linkedJournalIds],
      ['FACT', realtimeFacts, linkedFactIds],
      ['MEMORY', realtimeMemories, linkedMemoryIds],
    ]) {
      for (const record of records) {
        if (
          !Number.isSafeInteger(record.commitSeq) ||
          record.commitSeq < 1 ||
          record.commitSeq > state.commitSeq ||
          !linkedIds.has(record.id)
        ) {
          errors.push(`INVALID_REALTIME_${kind}_COMMIT:${record.id}`);
        }
      }
    }

    const maximumRecordSequence = Math.max(
      0,
      ...committedRecords.map((record) => numericIdSuffix(record.id)),
      state.realtimeAuditArchive?.lastTradeSequence ?? 0,
      ...(
        state.derivativeCadenceReceiptArchive
          ?.ranges ?? []
      ).map((range) => range.lastIdSequence ?? 0),
      ...(state.realtimeAuditArchive?.recentBundles ?? []).flatMap((bundle) => [
        ...bundle.receiptReferences.map((record) =>
          numericIdSuffix(record.id),
        ),
        ...bundle.chainReferences.flatMap((chain) => [
          numericIdSuffix(chain.trade.id),
          numericIdSuffix(chain.event.id),
          numericIdSuffix(chain.journal.id),
          numericIdSuffix(chain.fact.id),
          numericIdSuffix(chain.memory.id),
        ]),
      ]),
    );
    if (state.nextRecordSequence <= maximumRecordSequence) {
      errors.push('INVALID_NEXT_RECORD_SEQUENCE');
    }
  }

  const archivedOrderReferences = state.orderArchive?.bySymbol
    ? Object.values(state.orderArchive.bySymbol).flatMap(
        (entry) => entry.recentReferences ?? [],
      )
    : [];
  const maximumOrderSequence = Math.max(
    0,
    ...allBookOrders(state).map((order) => numericIdSuffix(order.id)),
    ...archivedOrderReferences.map((order) => numericIdSuffix(order.id)),
  );
  if (state.nextOrderSequence <= maximumOrderSequence) {
    errors.push('INVALID_NEXT_ORDER_SEQUENCE');
  }
  errors.push(
    ...agentEcologyInvariantErrors(state).map(
      (error) => `AGENT:${error}`,
    ),
  );
  try {
    const worldAudit = auditWorld(state.world);
    errors.push(...worldAudit.errors.map((error) => `WORLD:${error}`));
  } catch (error) {
    errors.push(`WORLD_AUDIT_ERROR:${error.message}`);
  }
  return errors;
}

function assertMarketState(
  state,
  { reuseVerifiedArchives = false } = {},
) {
  const errors = marketInvariantErrors(state, {
    reuseVerifiedArchives,
  });
  if (errors.length > 0) {
    throw new Error(`market invariant violation: ${errors.join('; ')}`);
  }
}

function accountAuthoritySeal(state) {
  return JSON.stringify(state.accounts);
}

function assertFullMarketState(
  state,
  { reuseVerifiedArchives = false } = {},
) {
  compactRealtimePriceEvidence(state);
  for (const book of Object.values(state.books ?? {})) {
    compactOrderBookQueues(book);
  }
  assertMarketState(state, {
    reuseVerifiedArchives,
  });
  for (const block of
    state.realtimeAuditArchive?.foldedBlocks ?? []) {
    verifiedRealtimeAuditBlocks.add(block);
  }
  verifiedAccountAuthoritySeals.set(
    state,
    accountAuthoritySeal(state),
  );
}

function hydrateBarArchiveFields(state) {
  for (const entry of Object.values(
    state?.barArchives?.bySymbol ?? {},
  )) {
    if (
      entry &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      !Object.hasOwn(entry, 'ultraFills')
    ) {
      entry.ultraFills = [];
    }
    if (
      entry &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      Array.isArray(entry.ultraFills) &&
      entry.ultraFills.length > 0
    ) {
      const domain =
        deriveFixedIntradayTimeDomain(
          state.nowMs,
          {
            clockOffsetMs:
              MARKET_CLOCK_ORIGIN_OFFSET_MS,
          },
        );
      if (
        entry.ultraFills.every(
          (fill) =>
            Number.isSafeInteger(
              fill?.timestampMs,
            ),
        )
      ) {
        entry.ultraFills =
          entry.ultraFills.filter(
            (fill) =>
              fill.timestampMs >=
                domain.startMs,
          );
      }
    }
  }
  const symbols = Object.keys(state?.books ?? {});
  if (
    state?.barSeries &&
    state?.barArchives?.bySymbol &&
    sameStringSet(
      Object.keys(state.barSeries),
      symbols,
    ) &&
    sameStringSet(
      Object.keys(state.barArchives.bySymbol),
      symbols,
    )
  ) {
    compactClosedChartAuthority(state);
  }
}

function legacyTurnoverAggregate(state, symbol) {
  const series = state.barSeries[symbol];
  const summary = emptyMinuteBarSummary();
  for (const bar of minuteBarsForCurrentDay(
    state,
    symbol,
    series,
  )) {
    mergeMinuteBarSummary(summary, bar);
  }
  const tailStart = firstFillIndexAtOrAfter(
    series.fills,
    unclosedFillStartMs(series),
  );
  const tailFills = series.fills.slice(tailStart);
  const matchedUnits =
    summary.volume +
    tailFills.reduce(
      (total, fill) => total + fill.quantity,
      0,
    );
  const matchedTurnoverTicks =
    summary.turnoverTicks +
    tailFills.reduce(
      (total, fill) =>
        total + fill.priceTicks * fill.quantity,
      0,
    );
  const matchedTradeCount =
    summary.tradeCount + tailFills.length;
  const retainedTrades = state.world.market.trades.filter(
    (trade) =>
      trade.source === 'realtime_order_book' &&
      trade.symbol === symbol &&
      trade.virtualMs >= series.dayStartMs &&
      trade.virtualMs <= state.nowMs,
  );
  const retainedSelfTrades = retainedTrades.filter(
    (trade) => trade.selfTrade === true,
  );
  return {
    matchedUnits,
    matchedTurnoverTicks,
    matchedTradeCount,
    selfTradeUnits: retainedSelfTrades.reduce(
      (total, trade) => total + trade.quantity,
      0,
    ),
    selfTradeTurnoverTicks: retainedSelfTrades.reduce(
      (total, trade) =>
        total + trade.priceTicks * trade.quantity,
      0,
    ),
    selfTradeCount: retainedSelfTrades.length,
    selfTradeCoverage:
      retainedTrades.length === matchedTradeCount
        ? 'exact'
        : 'unavailable_for_legacy_compacted_fills',
    lastEventAtMs:
      retainedTrades.at(-1)?.virtualMs ?? state.nowMs,
  };
}

function reconstructLegacyTurnoverTruth(state, symbol) {
  const openedAtMs =
    state.barSeries[symbol].dayStartMs;
  const base = createCumulativeTurnoverState({
    assetId: symbol,
    windowId: turnoverWindowId(openedAtMs),
    effectiveFloatUnits:
      effectiveFloatUnits(state.world, symbol),
    openedAtMs,
  });
  const aggregate = legacyTurnoverAggregate(
    state,
    symbol,
  );
  const reconstructed = aggregate.matchedTradeCount > 0
    ? {
        ...base,
        lastEventId:
          `legacy_turnover_reconstruction:${symbol}:${state.nowMs}`,
        lastEventSeq: aggregate.matchedTradeCount,
        lastEventAtMs: aggregate.lastEventAtMs,
        matchedUnits: aggregate.matchedUnits,
        matchedTurnoverTicks:
          aggregate.matchedTurnoverTicks,
        matchedTradeCount: aggregate.matchedTradeCount,
        selfTradeUnits: aggregate.selfTradeUnits,
        selfTradeTurnoverTicks:
          aggregate.selfTradeTurnoverTicks,
        selfTradeCount: aggregate.selfTradeCount,
      }
    : base;
  projectCumulativeTurnover(reconstructed);
  return {
    state: reconstructed,
    integration: {
      schemaVersion:
        TURNOVER_PRODUCTION_INTEGRATION_SCHEMA,
      status:
        'legacy_gross_reconstructed_from_bar_authority',
      grossAuthority:
        'current_day_minute_bars_and_unclosed_fills',
      selfTradeCoverage: aggregate.selfTradeCoverage,
    },
  };
}

function hydrateTurnoverTruthFields(state) {
  const symbols = Object.keys(state.books);
  if (state.turnoverTruthBySymbol === undefined) {
    state.turnoverTruthBySymbol = {};
    state.turnoverTruthIntegrationBySymbol = {};
    for (const symbol of symbols) {
      const reconstructed =
        reconstructLegacyTurnoverTruth(state, symbol);
      state.turnoverTruthBySymbol[symbol] =
        reconstructed.state;
      state.turnoverTruthIntegrationBySymbol[symbol] =
        reconstructed.integration;
    }
    return;
  }
  if (
    !state.turnoverTruthIntegrationBySymbol ||
    typeof state.turnoverTruthIntegrationBySymbol !==
      'object' ||
    Array.isArray(
      state.turnoverTruthIntegrationBySymbol,
    )
  ) {
    throw new Error(
      'Invalid turnover integration checkpoint.',
    );
  }
}

function hydrateOrderSettlementFields(state) {
  for (const book of Object.values(state.books ?? {})) {
    for (const order of Object.values(book.orders ?? {})) {
      if (
        order.selfTradeGrossCents !== undefined &&
        order.selfTradeGrossCents !== null
      ) {
        continue;
      }
      if (
        order.side === 'sell' &&
        (order.chargedFeeCents ?? 0) !== 0
      ) {
        throw new Error(
          `Cannot infer legacy self-trade fees for ${order.id}.`,
        );
      }
      order.selfTradeGrossCents = 0;
    }
  }
}

function accountResourceTotals(state) {
  const symbols = Object.keys(state.books ?? {});
  return {
    cashCents:
      Object.values(state.accounts ?? {}).reduce(
        (sum, account) => sum + (account?.cashCents ?? 0),
        0,
      ) + (state.exchangeFeePoolCents ?? 0),
    holdings: Object.fromEntries(
      symbols.map((symbol) => [
        symbol,
        Object.values(state.accounts ?? {}).reduce(
          (sum, account) => sum + (account?.holdings?.[symbol] ?? 0),
          0,
        ),
      ]),
    ),
  };
}

function incrementalBarSeriesErrors(
  previous,
  state,
  symbols,
  pendingBarFills,
) {
  const errors = [];
  if (
    !state.barSeries ||
    !sameStringSet(Object.keys(state.barSeries), symbols) ||
    state.barArchives !== previous.barArchives
  ) {
    return ['INVALID_INCREMENTAL_BAR_AUTHORITY'];
  }
  for (const symbol of symbols) {
    const before = previous.barSeries?.[symbol];
    const after = state.barSeries[symbol];
    const deferred = pendingBarFills?.get(symbol);
    const appended = deferred?.fills ?? [];
    if (
      !before ||
      !after ||
      after !== before ||
      (
        deferred &&
        deferred.sourceSeries !== before
      ) ||
      !Array.isArray(after.fills) ||
      !Array.isArray(after.bars) ||
      after.fills !== before.fills ||
      after.bars !== before.bars ||
      !Array.isArray(appended)
    ) {
      errors.push(`INVALID_INCREMENTAL_BAR_SERIES:${symbol}`);
      continue;
    }
    const fillSequences = new Set();
    for (let index = 0; index < appended.length; index += 1) {
      const fill = appended[index];
      const preceding =
        appended[index - 1] ?? before.fills.at(-1);
      const firstFrameDayStartFill =
        before.bars.length === 0 &&
        before.closedUntilMs === before.dayStartMs &&
        fill?.timestampMs === before.dayStartMs;
      if (
        !fill ||
        !sameStringSet(
          Object.keys(fill),
          ['timestampMs', 'sequence', 'priceTicks', 'quantity'],
        ) ||
        !Number.isSafeInteger(fill.timestampMs) ||
        !Number.isSafeInteger(fill.sequence) ||
        fillSequences.has(fill.sequence) ||
        fill.sequence < previous.nextRecordSequence ||
        !isPositiveInteger(fill.priceTicks) ||
        !isPositiveInteger(fill.quantity) ||
        !Number.isSafeInteger(fill.priceTicks * fill.quantity) ||
        (
          !firstFrameDayStartFill &&
          fill.timestampMs <= before.closedUntilMs
        ) ||
        fill.timestampMs > before.dayEndMs ||
        fill.timestampMs > state.nowMs ||
        (
          preceding &&
          (
            preceding.timestampMs > fill.timestampMs ||
            (
              preceding.timestampMs === fill.timestampMs &&
              preceding.sequence > fill.sequence
            )
          )
        )
      ) {
        errors.push(
          `INVALID_INCREMENTAL_BAR_FILL:${symbol}:` +
          `${before.fills.length + index}`,
        );
        break;
      }
      fillSequences.add(fill.sequence);
    }
  }
  return errors;
}

/**
 * Checks the complete live settlement boundary for a player order without
 * rescanning immutable historical archives. The pre-command authority was
 * already fully verified by INIT, playback cadence, pause or save barriers;
 * the next full barrier still audits every retained and folded record.
 */
function incrementalOrderInvariantErrors(
  previous,
  state,
  command,
  receipt,
  pendingBarFills,
  transactionSymbols = null,
) {
  const errors = [];
  if (
    command.type !== 'submit_order' &&
    command.type !== 'cancel_order'
  ) {
    return ['INCREMENTAL_VERIFICATION_REQUIRES_ORDER_COMMAND'];
  }
  const verifiedAccountSeal =
    verifiedAccountAuthoritySeals.get(previous);
  if (
    typeof verifiedAccountSeal !== 'string' ||
    verifiedAccountSeal !== accountAuthoritySeal(previous)
  ) {
    return ['INVALID_PRECOMMAND_ACCOUNT_AUTHORITY'];
  }
  if (
    !state ||
    state.marketRuleVersion !== MARKET_RULE_VERSION ||
    !state.world?.world ||
    !state.world?.market?.securities ||
    !Number.isSafeInteger(state.nowMs) ||
    state.nowMs < previous.nowMs ||
    !Number.isSafeInteger(state.commitSeq) ||
    state.commitSeq < previous.commitSeq ||
    state.world.world.tick !== previous.world.world.tick ||
    state.lastWorldDaySettlementMs !==
      previous.lastWorldDaySettlementMs
  ) {
    return ['INVALID_INCREMENTAL_COMMAND_BOUNDARY'];
  }

  const symbols = Object.keys(state.world.market.securities);
  if (
    !state.books ||
    !sameStringSet(Object.keys(state.books), symbols)
  ) {
    return ['INVALID_BOOKS_SCHEMA'];
  }
  const dirtySymbol =
    externalOrderSymbol(previous, command) ??
    externalOrderSymbol(state, command);
  if (!dirtySymbol || !Object.hasOwn(state.books, dirtySymbol)) {
    return ['INVALID_INCREMENTAL_DIRTY_SYMBOL'];
  }
  const scopedSymbols = new Set(
    Array.isArray(transactionSymbols)
      ? transactionSymbols
      : [dirtySymbol],
  );
  if (!scopedSymbols.has(dirtySymbol)) {
    return ['INVALID_INCREMENTAL_TRANSACTION_SCOPE'];
  }
  for (const [symbol, book] of Object.entries(state.books)) {
    if (!scopedSymbols.has(symbol)) {
      if (book !== previous.books[symbol]) {
        errors.push(`UNSCOPED_BOOK_MUTATION:${symbol}`);
      }
      continue;
    }
    const integrity = assertBookIntegrity(book);
    errors.push(
      ...integrity.errors.map((error) => `${symbol}:${error}`),
    );
    const terminalCount =
      terminalOrderIndex(book).ids.size;
    if (terminalCount > MAX_TERMINAL_ORDERS_PER_SYMBOL) {
      errors.push(`TERMINAL_ORDER_LIMIT_EXCEEDED:${symbol}`);
    }
  }
  errors.push(
    ...incrementalBarSeriesErrors(
      previous,
      state,
      symbols,
      pendingBarFills,
    ),
  );

  if (!Array.isArray(state.eventQueue)) {
    errors.push('INVALID_EVENT_QUEUE_SCHEMA');
  } else {
    const ids = new Set();
    for (let index = 0; index < state.eventQueue.length; index += 1) {
      const event = state.eventQueue[index];
      if (
        !event ||
        typeof event.id !== 'string' ||
        ids.has(event.id) ||
        !Number.isSafeInteger(event.scheduledMs) ||
        event.scheduledMs < state.nowMs ||
        !Number.isSafeInteger(event.sequence) ||
        event.sequence < 1 ||
        (
          index > 0 &&
          compareEvents(
            state.eventQueue[Math.floor((index - 1) / 2)],
            event,
          ) > 0
        )
      ) {
        errors.push(`INVALID_INCREMENTAL_EVENT_QUEUE:${index}`);
      }
      ids.add(event?.id);
    }
    const derivativeCycles = state.eventQueue.filter(
      (event) => event.type === 'derivative_actor_cycle',
    );
    const expectedDerivativeCycleMs =
      expectedDerivativeActorCycleEventMs(state);
    if (
      derivativeCycles.length !== 1 ||
      derivativeCycles[0].scheduledMs !==
        expectedDerivativeCycleMs
    ) {
      errors.push(
        `INVALID_INCREMENTAL_DERIVATIVE_ACTOR_CYCLE_ANCHOR:${JSON.stringify({
          marketNowMs: state.nowMs,
          expectedDerivativeCycleMs,
          derivativeNowMs:
            state.world.derivatives?.nowMs ?? null,
          previousCycles: previous.eventQueue
            .filter(
              (event) =>
                event.type === 'derivative_actor_cycle',
            )
            .map((event) => ({
              id: event.id,
              scheduledMs: event.scheduledMs,
              sequence: event.sequence,
            })),
          derivativeCycles: derivativeCycles.map((event) => ({
            id: event.id,
            scheduledMs: event.scheduledMs,
            sequence: event.sequence,
          })),
          commandType: command.type,
          commandSymbol: command.symbol ?? null,
          receiptType: receipt?.type ?? null,
          receiptVirtualMs: receipt?.virtualMs ?? null,
        })}`,
      );
    }
  }

  if (
    !receipt ||
    receipt.type !== command.type ||
    state.receipts?.at(-1)?.id !== receipt.id ||
    !Number.isSafeInteger(receipt.commitSeq) ||
    receipt.commitSeq < previous.commitSeq ||
    receipt.commitSeq > state.commitSeq ||
    (
      command.actorId === 'player' &&
      !sameJson(state.world.ui?.lastReceipt, receipt)
    )
  ) {
    errors.push(
      `INVALID_INCREMENTAL_COMMAND_RECEIPT:${JSON.stringify({
        commandType: command.type,
        receiptType: receipt?.type ?? null,
        receiptId: receipt?.id ?? null,
        lastReceiptId:
          state.receipts?.at(-1)?.id ?? null,
        receiptCommitSeq:
          receipt?.commitSeq ?? null,
        previousCommitSeq: previous.commitSeq,
        stateCommitSeq: state.commitSeq,
        playerWorldReceiptMatches:
          command.actorId !== 'player' ||
          sameJson(
            state.world.ui?.lastReceipt,
            receipt,
          ),
      })}`,
    );
  }

  if (
    !sameStringSet(
      Object.keys(state.accounts ?? {}),
      Object.keys(previous.accounts ?? {}),
    )
  ) {
    errors.push('INVALID_INCREMENTAL_ACCOUNT_SET');
  }
  for (const account of Object.values(state.accounts ?? {})) {
    if (
      !account ||
      !Number.isSafeInteger(account.cashCents) ||
      !Number.isSafeInteger(account.reservedCashCents) ||
      account.cashCents < 0 ||
      account.reservedCashCents < 0 ||
      account.reservedCashCents > account.cashCents ||
      (
        account.id === 'player' &&
        account.reservedCashCents +
          derivativeReservedPlayerCashCents(state) >
          account.cashCents
      )
    ) {
      errors.push(`INVALID_ACCOUNT_CASH:${account?.id ?? 'unknown'}`);
      continue;
    }
    for (const symbol of symbols) {
      if (
        !Number.isSafeInteger(account.holdings?.[symbol]) ||
        !Number.isSafeInteger(account.reservedHoldings?.[symbol]) ||
        account.holdings[symbol] < 0 ||
        account.reservedHoldings[symbol] < 0 ||
        account.reservedHoldings[symbol] > account.holdings[symbol]
      ) {
        errors.push(`INVALID_ACCOUNT_HOLDINGS:${account.id}:${symbol}`);
      }
    }
  }

  function targetReservationContributions(book, validate) {
    const cash = Object.fromEntries(
      Object.keys(state.accounts ?? {}).map((accountId) => [accountId, 0]),
    );
    const holdings = Object.fromEntries(
      Object.keys(state.accounts ?? {}).map((accountId) => [accountId, 0]),
    );
    for (const order of Object.values(book?.orders ?? {})) {
      const account = state.accounts?.[order?.ownerId];
      if (
        !account ||
        order.symbol !== dirtySymbol ||
        !isPositiveInteger(order.originalQty) ||
        !Number.isSafeInteger(order.remainingQty) ||
        order.remainingQty < 0 ||
        order.remainingQty > order.originalQty
      ) {
        if (validate) {
          errors.push(`INVALID_INCREMENTAL_ORDER:${order?.id ?? 'unknown'}`);
        }
        continue;
      }
      if (order.side === 'buy') {
        const required = calculateBuyReservation(order);
        if (validate && order.reservedCashCents !== required) {
          errors.push(`ORDER_RESERVATION_MISMATCH:${order.id}`);
        }
        cash[order.ownerId] += required;
      } else if (order.side === 'sell') {
        const required = activeOrder(order) ? order.remainingQty : 0;
        if (validate && order.reservedUnits !== required) {
          errors.push(`ORDER_RESERVATION_MISMATCH:${order.id}`);
        }
        holdings[order.ownerId] += required;
      } else if (validate) {
        errors.push(`INVALID_INCREMENTAL_ORDER_SIDE:${order.id}`);
      }
    }
    return { cash, holdings };
  }

  const transactionChanges = orderBookTransactionChanges(
    state.books[dirtySymbol],
  );
  let beforeTargetReservations;
  let afterTargetReservations;
  if (transactionChanges) {
    const accountIds = Object.keys(state.accounts ?? {});
    beforeTargetReservations = {
      cash: Object.fromEntries(
        accountIds.map((accountId) => [accountId, 0]),
      ),
      holdings: Object.fromEntries(
        accountIds.map((accountId) => [accountId, 0]),
      ),
    };
    afterTargetReservations = cloneJson(
      beforeTargetReservations,
    );
    const addContribution = (
      target,
      order,
      validate,
    ) => {
      if (!order) return;
      const account = state.accounts?.[order.ownerId];
      if (
        !account ||
        order.symbol !== dirtySymbol ||
        !isPositiveInteger(order.originalQty) ||
        !Number.isSafeInteger(order.remainingQty) ||
        order.remainingQty < 0 ||
        order.remainingQty > order.originalQty
      ) {
        if (validate) {
          errors.push(
            `INVALID_INCREMENTAL_ORDER:${order?.id ?? 'unknown'}`,
          );
        }
        return;
      }
      if (order.side === 'buy') {
        const required = calculateBuyReservation(order);
        if (
          validate &&
          order.reservedCashCents !== required
        ) {
          errors.push(
            `ORDER_RESERVATION_MISMATCH:${order.id}`,
          );
        }
        target.cash[order.ownerId] += required;
      } else if (order.side === 'sell') {
        const required = activeOrder(order)
          ? order.remainingQty
          : 0;
        if (
          validate &&
          order.reservedUnits !== required
        ) {
          errors.push(
            `ORDER_RESERVATION_MISMATCH:${order.id}`,
          );
        }
        target.holdings[order.ownerId] += required;
      } else if (validate) {
        errors.push(
          `INVALID_INCREMENTAL_ORDER_SIDE:${order.id}`,
        );
      }
    };
    const changedIds = new Set([
      ...transactionChanges.changedOrders.keys(),
      ...transactionChanges.deletedOrderIds,
    ]);
    for (const orderId of changedIds) {
      addContribution(
        beforeTargetReservations,
        transactionChanges.sourceBook.orders[orderId],
        false,
      );
      addContribution(
        afterTargetReservations,
        transactionChanges.deletedOrderIds.has(orderId)
          ? null
          : transactionChanges.changedOrders.get(orderId),
        true,
      );
    }
  } else {
    beforeTargetReservations = targetReservationContributions(
      previous.books[dirtySymbol],
      false,
    );
    afterTargetReservations = targetReservationContributions(
      state.books[dirtySymbol],
      true,
    );
  }
  for (const account of Object.values(state.accounts ?? {})) {
    const beforeAccount = previous.accounts?.[account.id];
    if (!beforeAccount) continue;
    const expectedReservedCash =
      beforeAccount.reservedCashCents -
      beforeTargetReservations.cash[account.id] +
      afterTargetReservations.cash[account.id];
    if (
      account.reservedCashCents !== expectedReservedCash
    ) {
      errors.push(`ACCOUNT_CASH_RESERVATION_MISMATCH:${account.id}`);
    }
    for (const symbol of symbols) {
      const expectedReservedHoldings =
        symbol === dirtySymbol
          ? beforeAccount.reservedHoldings[symbol] -
            beforeTargetReservations.holdings[account.id] +
            afterTargetReservations.holdings[account.id]
          : beforeAccount.reservedHoldings[symbol];
      if (
        account.reservedHoldings[symbol] !==
        expectedReservedHoldings
      ) {
        errors.push(
          `ACCOUNT_HOLDING_RESERVATION_MISMATCH:${account.id}:${symbol}`,
        );
      }
    }
  }

  const beforeResources = accountResourceTotals(previous);
  const afterResources = accountResourceTotals(state);
  if (beforeResources.cashCents !== afterResources.cashCents) {
    errors.push('INCREMENTAL_CASH_CONSERVATION_MISMATCH');
  }
  for (const symbol of symbols) {
    if (
      beforeResources.holdings[symbol] !==
      afterResources.holdings[symbol]
    ) {
      errors.push(`INCREMENTAL_SHARE_CONSERVATION_MISMATCH:${symbol}`);
    }
  }

  const player = state.accounts?.player;
  if (
    !player ||
    cents(state.world.player.cash) !== player.cashCents ||
    !sameJson(state.world.player.holdings, player.holdings) ||
    cents(state.world.market.exchangeFeePool) !==
      state.exchangeFeePoolCents
  ) {
    errors.push('INCREMENTAL_WORLD_MIRROR_MISMATCH');
  }
  const expectedOrderMirrors = dirtyWorldOrderMirrors(
    {
      ...state,
      world: {
        ...state.world,
        market: {
          ...state.world.market,
          orders: previous.world.market.orders,
        },
      },
    },
    [...scopedSymbols],
  );
  const actualOrderMirrors = state.world.market.orders ?? [];
  if (actualOrderMirrors.length !== expectedOrderMirrors.length) {
    errors.push('INCREMENTAL_WORLD_ORDER_MIRROR_LENGTH');
  } else {
    for (let index = 0; index < expectedOrderMirrors.length; index += 1) {
      const expected = expectedOrderMirrors[index];
      const actual = actualOrderMirrors[index];
      const valid =
        scopedSymbols.has(expected.symbol)
          ? sameJson(actual, expected)
          : actual === expected;
      if (!valid) {
        errors.push(`INCREMENTAL_WORLD_ORDER_MIRROR:${index}`);
        break;
      }
    }
  }
  for (const [symbol, book] of Object.entries(state.books)) {
    const valid =
      scopedSymbols.has(symbol)
        ? sameJson(
            state.world.market.orderBooks[symbol],
            worldBookMirror(book, state.world.world.tick),
          )
        : state.world.market.orderBooks[symbol] ===
          previous.world.market.orderBooks[symbol];
    if (!valid) {
      errors.push(`BOOK_WORLD_MIRROR_MISMATCH:${symbol}`);
    }
  }

  const tradesById = new Map(
    state.world.market.trades.map((trade) => [trade.id, trade]),
  );
  const eventsById = new Map(
    state.world.eventLog.map((event) => [event.id, event]),
  );
  const journalsById = new Map(
    state.world.ledger.map((journal) => [journal.id, journal]),
  );
  const factsById = new Map(
    state.world.facts.map((fact) => [fact.id, fact]),
  );
  const memoriesByFactId = new Map(
    state.world.memories.map((memory) => [memory.factId, memory]),
  );
  for (const tradeId of receipt?.tradeIds ?? []) {
    const trade = tradesById.get(tradeId);
    const event = eventsById.get(trade?.eventId);
    const journal = journalsById.get(event?.ledgerEntryIds?.[0]);
    const fact = factsById.get(trade?.factId);
    const memory = memoriesByFactId.get(fact?.id);
    if (
      !isCompleteRealtimeAuditChain(
        { trade, event, journal, fact, memory },
        trade?.commitSeq,
      )
    ) {
      errors.push(`INCOMPLETE_INCREMENTAL_AUDIT_CHAIN:${tradeId}`);
    }
  }
  return errors;
}

function assertIncrementalOrderState(
  previous,
  state,
  command,
  receipt,
  pendingBarFills,
  transactionSymbols = null,
) {
  const errors = incrementalOrderInvariantErrors(
    previous,
    state,
    command,
    receipt,
    pendingBarFills,
    transactionSymbols,
  );
  if (errors.length > 0) {
    throw new Error(
      `incremental market invariant violation: ${errors.join('; ')}`,
    );
  }
}

function canonicalLegacyListingRule(symbol, security) {
  const canonical =
    DEFAULT_LISTING_RULES[symbol] ??
    listingRuleFromIdentity(security);
  if (!canonical) return listingRule(symbol, security);
  if (
    Object.hasOwn(security, 'board') &&
    security.board !== canonical.board
  ) {
    throw new Error(`INVALID_LISTING_RULE:${symbol}`);
  }
  if (
    Object.hasOwn(security, 'dailyLimitBps') &&
    security.dailyLimitBps !== canonical.dailyLimitBps
  ) {
    throw new Error(`INVALID_LISTING_RULE:${symbol}`);
  }
  return canonical;
}

function priceBandFromAnchor(anchorTicks, dailyLimitBps) {
  return {
    limitUpTicks: Math.max(
      anchorTicks + 1,
      Math.round(
        anchorTicks * (10_000 + dailyLimitBps) / 10_000,
      ),
    ),
    limitDownTicks: Math.max(
      1,
      Math.min(
        anchorTicks - 1,
        Math.round(
          anchorTicks * (10_000 - dailyLimitBps) / 10_000,
        ),
      ),
    ),
  };
}

/**
 * Activates the first listing-band protocol over a legacy 0.4 checkpoint.
 * The transaction never rewrites historical trades. If the evolved public
 * last price cannot legally fit the legacy close (or no close exists), the
 * activation price itself becomes the first explicit band anchor. Resting
 * orders made impossible by that activation are cancelled with reservations
 * released before the migrated checkpoint can be resumed.
 */
export function migrateLegacyMarketRuleCheckpoint(
  world,
  savedState,
) {
  if (!world?.world?.id || !savedState) {
    throw new Error('A legacy market checkpoint and world are required.');
  }
  const resumed = cloneJson(savedState);
  if (resumed.world?.world?.id !== world.world.id) {
    throw new Error('Invalid or incompatible realtime market save.');
  }
  if (resumed.marketRuleVersion === MARKET_RULE_VERSION) {
    return resumed;
  }
  if (
    resumed.marketRuleVersion !== LEGACY_MARKET_RULE_VERSION
  ) {
    throw new Error('Invalid or incompatible realtime market save.');
  }
  if (
    !Number.isSafeInteger(resumed.commitSeq) ||
    resumed.commitSeq < 0 ||
    resumed.commitSeq >= Number.MAX_SAFE_INTEGER ||
    !Number.isSafeInteger(resumed.nextRecordSequence) ||
    resumed.nextRecordSequence < 1 ||
    resumed.nextRecordSequence >= Number.MAX_SAFE_INTEGER ||
    !resumed.books ||
    !resumed.accounts ||
    !Array.isArray(resumed.receipts)
  ) {
    throw new Error('Invalid legacy realtime market checkpoint.');
  }
  const legacyLiveRecordIds = [
    ...resumed.receipts,
    ...(resumed.world?.eventLog ?? []),
    ...(resumed.world?.ledger ?? []),
    ...(resumed.world?.facts ?? []),
    ...(resumed.world?.memories ?? []),
    ...(resumed.world?.narratives ?? []),
    ...(resumed.world?.replay ?? []),
    ...(resumed.world?.market?.trades ?? []),
  ].map((record) => record?.id);
  const migrationReceiptId = nextLocalId(
    resumed,
    'receipt',
    resumed.nextRecordSequence,
  );
  const maximumLegacyRecordSequence = Math.max(
    0,
    ...legacyLiveRecordIds.map(numericIdSuffix),
  );
  if (
    legacyLiveRecordIds.includes(migrationReceiptId) ||
    resumed.nextRecordSequence <= maximumLegacyRecordSequence
  ) {
    throw new Error(
      'Invalid legacy realtime market checkpoint record sequence.',
    );
  }

  const commitSeq = resumed.commitSeq + 1;
  const listingActivations = {};
  const cancelledOrderIds = [];
  const affectedAccountIds = new Set();

  for (const [symbol, security] of Object.entries(
    resumed.world?.market?.securities ?? {},
  )) {
    const canonical = canonicalLegacyListingRule(
      symbol,
      security,
    );
    const lastPriceTicks = cents(security.lastPrice);
    if (!isPositiveInteger(lastPriceTicks)) {
      throw new Error(`INVALID_LAST_PRICE:${symbol}`);
    }
    if (
      Object.hasOwn(security, 'previousCloseTicks') &&
      !isPositiveInteger(security.previousCloseTicks)
    ) {
      throw new Error(`MISSING_PREVIOUS_CLOSE:${symbol}`);
    }

    let previousCloseTicks = security.previousCloseTicks;
    let anchorSource = 'existing_previous_close';
    if (isPositiveInteger(previousCloseTicks)) {
      const existingBand = priceBandFromAnchor(
        previousCloseTicks,
        canonical.dailyLimitBps,
      );
      if (
        lastPriceTicks < existingBand.limitDownTicks ||
        lastPriceTicks > existingBand.limitUpTicks
      ) {
        previousCloseTicks = lastPriceTicks;
        anchorSource = 'rule_activation_last_price';
      }
    } else {
      previousCloseTicks = lastPriceTicks;
      anchorSource = 'rule_activation_last_price';
    }

    security.symbol = symbol;
    security.board = canonical.board;
    security.dailyLimitBps = canonical.dailyLimitBps;
    security.previousCloseTicks = previousCloseTicks;
    listingActivations[symbol] = {
      board: canonical.board,
      dailyLimitBps: canonical.dailyLimitBps,
      previousCloseTicks,
      lastPriceTicks,
      anchorSource,
    };

    const book = resumed.books[symbol];
    if (!book) {
      throw new Error(`MISSING_ORDER_BOOK:${symbol}`);
    }
    const band = priceBandFromAnchor(
      previousCloseTicks,
      canonical.dailyLimitBps,
    );
    for (const order of Object.values(book.orders ?? {})) {
      if (
        !activeOrder(order) ||
        order.type !== 'limit' ||
        (
          order.priceTicks >= band.limitDownTicks &&
          order.priceTicks <= band.limitUpTicks
        )
      ) {
        continue;
      }
      const result = cancelInBook(
        book,
        order.id,
        order.ownerId,
      );
      if (!result.cancelled) {
        throw new Error(
          `failed to cancel legacy out-of-band order ${order.id}`,
        );
      }
      order.commitSeq = commitSeq;
      cancelledOrderIds.push(order.id);
      affectedAccountIds.add(order.ownerId);
    }
  }

  cancelledOrderIds.sort();
  reconcileOrderReservations(resumed, cancelledOrderIds);
  noteTerminalOrders(resumed, cancelledOrderIds);
  for (const symbol of Object.keys(resumed.books)) {
    archiveTerminalOrders(resumed, symbol);
  }
  for (const accountId of affectedAccountIds) {
    resumed.accounts[accountId].commitSeq = commitSeq;
  }
  resumed.marketRuleVersion = MARKET_RULE_VERSION;
  resumed.commitSeq = commitSeq;
  hydrateAccountPortfolioFields(resumed);
  markAccountRisk(resumed);
  syncWorldMarketMirrors(resumed);
  pushReceipt(resumed, {
    id: nextLocalId(resumed, 'receipt'),
    type: 'market_rule_migration',
    status: 'applied',
    reason: null,
    fromVersion: LEGACY_MARKET_RULE_VERSION,
    toVersion: MARKET_RULE_VERSION,
    listingActivations,
    cancelledOrderIds,
    virtualMs: resumed.nowMs,
    commitSeq,
  });
  return resumed;
}

function migrateLegacyRealtimeStockUniverseCheckpoint(
  state,
) {
  const checkpointSymbols = Object.keys(
    state.books ?? {},
  );
  const currentSymbols = Object.keys(
    state.world.market.securities ?? {},
  );
  if (
    sameStringSet(
      checkpointSymbols,
      currentSymbols,
    )
  ) {
    return {
      migrated: false,
      addedSymbols: [],
    };
  }
  const knownLegacyCheckpoint =
    sameStringSet(
      checkpointSymbols,
      LEGACY_THREE_STOCK_CHECKPOINT_SYMBOLS,
    ) ||
    sameStringSet(
      checkpointSymbols,
      LEGACY_EIGHT_STOCK_CHECKPOINT_SYMBOLS,
    );
  if (
    !knownLegacyCheckpoint ||
    !state.barSeries ||
    !sameStringSet(
      Object.keys(state.barSeries),
      checkpointSymbols,
    ) ||
    !state.barArchives?.bySymbol ||
    !sameStringSet(
      Object.keys(state.barArchives.bySymbol),
      checkpointSymbols,
    ) ||
    !state.orderArchive?.bySymbol ||
    !sameStringSet(
      Object.keys(state.orderArchive.bySymbol),
      checkpointSymbols,
    )
  ) {
    throw new Error(
      'Invalid or incompatible realtime stock-universe checkpoint.',
    );
  }
  const addedSymbols = currentSymbols.filter(
    (symbol) => !checkpointSymbols.includes(symbol),
  );
  if (addedSymbols.length === 0) {
    throw new Error(
      'Invalid partial realtime stock-universe checkpoint.',
    );
  }
  const commitSeq = state.commitSeq + 1;
  if (!Number.isSafeInteger(commitSeq)) {
    throw new Error(
      'Realtime stock-universe migration sequence overflow.',
    );
  }
  const templateAccounts = createAccounts(state.world);
  const custodyMissing =
    !state.accounts.securities_lending_pool;
  const makerIds = [
    'maker_chengming',
    'maker_lingnan',
  ];
  for (const [accountId, account] of Object.entries(
    state.accounts ?? {},
  )) {
    if (
      !templateAccounts[accountId] ||
      !sameStringSet(
        Object.keys(account.holdings ?? {}),
        checkpointSymbols,
      ) ||
      !sameStringSet(
        Object.keys(account.reservedHoldings ?? {}),
        checkpointSymbols,
      ) ||
      !sameStringSet(
        Object.keys(account.positionLedger ?? {}),
        checkpointSymbols,
      )
    ) {
      throw new Error(
        `Invalid legacy realtime account universe: ${accountId}.`,
      );
    }
  }
  for (const [accountId, template] of Object.entries(
    templateAccounts,
  )) {
    if (
      accountId === 'securities_lending_pool' &&
      custodyMissing
    ) {
      continue;
    }
    if (!state.accounts[accountId]) {
      const created = cloneJson(template);
      created.commitSeq = commitSeq;
      state.accounts[accountId] = created;
      continue;
    }
    const account = state.accounts[accountId];
    for (const symbol of addedSymbols) {
      let quantity = template.holdings[symbol];
      if (
        custodyMissing &&
        makerIds.includes(accountId)
      ) {
        const total =
          state.world.market.maker.holdings[
            symbol
          ] ?? 0;
        const first = Math.floor(total / 2);
        quantity =
          accountId === makerIds[0]
            ? first
            : total - first;
      }
      account.holdings[symbol] = quantity;
      account.reservedHoldings[symbol] = 0;
      account.positionLedger[symbol] = {
        costCents:
          quantity *
          cents(
            state.world.market.securities[
              symbol
            ].lastPrice,
          ),
        realizedPnlCents: 0,
      };
    }
    account.commitSeq = commitSeq;
  }

  const legacySeries =
    state.barSeries[checkpointSymbols[0]];
  if (
    !legacySeries ||
    !Number.isSafeInteger(legacySeries.dayId)
  ) {
    throw new Error(
      'Invalid legacy realtime chart clock.',
    );
  }
  const retainedQuoteFrame =
    state.quoteFrames.at(-1) ?? null;
  const retainedFrameMs =
    retainedQuoteFrame?.virtualMs ?? null;
  if (
    retainedQuoteFrame &&
    (
      !Number.isSafeInteger(retainedFrameMs) ||
      retainedFrameMs <= legacySeries.dayStartMs ||
      retainedFrameMs > state.nowMs ||
      retainedFrameMs % QUOTE_FRAME_MS !== 0
    )
  ) {
    throw new Error(
      'Invalid legacy realtime quote-frame anchor.',
    );
  }
  const closedUntilMs =
    retainedFrameMs ?? legacySeries.dayStartMs;
  const emptyOrderArchive = createOrderArchive(
    addedSymbols,
  );
  for (const symbol of addedSymbols) {
    state.books[symbol] = createOrderBook(symbol);
    const series = createBarSeries(
      symbol,
      legacySeries.dayId,
    );
    series.closedUntilMs = closedUntilMs;
    if (retainedFrameMs !== null) {
      series.bars.push({
        startMs:
          retainedFrameMs -
          QUOTE_FRAME_MS,
        endMs: retainedFrameMs,
        openTicks: null,
        highTicks: null,
        lowTicks: null,
        closeTicks: null,
        volume: 0,
        turnoverTicks: 0,
        tradeCount: 0,
      });
    }
    state.barSeries[symbol] = series;
    state.barArchives.bySymbol[symbol] = {
      minuteBars: [],
      dailyBars: [],
      ultraFills: [],
    };
    state.orderArchive.bySymbol[symbol] =
      emptyOrderArchive.bySymbol[symbol];
  }

  const discardedQuoteFrameCount =
    Math.max(
      0,
      state.quoteFrames.length -
        (retainedQuoteFrame ? 1 : 0),
    );
  state.quoteFrames = retainedQuoteFrame
    ? [retainedQuoteFrame]
    : [];
  state.commitSeq = commitSeq;
  hydrateAccountPortfolioFields(state);
  markAccountRisk(state);
  syncWorldMarketMirrors(state);
  if (retainedQuoteFrame) {
    const marketData =
      getMarketDataProjection(state.world);
    retainedQuoteFrame.commitSeq =
      commitSeq;
    retainedQuoteFrame.marketData =
      marketData;
    for (const symbol of addedSymbols) {
      const bar = visibleBar(
        state,
        symbol,
        state.barSeries[symbol].bars.at(-1),
      );
      retainedQuoteFrame.frameBars[symbol] =
        bar;
      retainedQuoteFrame.symbols[symbol] =
        symbolSnapshot(
          state,
          symbol,
          {
            includeUltraDelta: true,
            marketData,
          },
        );
    }
    state.realtimeAuditArchive
      .pendingFrame.afterFrameMs =
        retainedFrameMs;
  } else {
    state.realtimeAuditArchive
      .pendingFrame.afterFrameMs = -1;
  }
  pushReceipt(state, {
    id: nextLocalId(state, 'receipt'),
    type:
      'stock_universe_checkpoint_migration',
    status: 'applied',
    reason: null,
    fromSymbols: [
      ...checkpointSymbols,
    ].sort(),
    addedSymbols: [...addedSymbols].sort(),
    discardedDerivedQuoteFrameCount:
      discardedQuoteFrameCount,
    preservedChartSymbols: [
      ...checkpointSymbols,
    ].sort(),
    virtualMs: state.nowMs,
    commitSeq,
  });
  return {
    migrated: true,
    addedSymbols,
  };
}

function markStockUniverseMakerHydration(
  state,
  addedSymbols,
) {
  if (addedSymbols.length === 0 || !state.agentEcology?.enabled) {
    return;
  }
  const makerIds = new Set(
    Object.values(state.agentEcology.agents ?? {})
      .filter((agent) => agent.kind === 'maker')
      .map((agent) => agent.id),
  );
  const markedMakerIds = new Set();
  for (const event of state.eventQueue) {
    if (
      event.type !== 'agent_decision' ||
      !makerIds.has(event.actorId) ||
      markedMakerIds.has(event.actorId)
    ) {
      continue;
    }
    event.payload = {
      ...(event.payload ?? {}),
      universeHydrationSymbols: [...addedSymbols],
    };
    markedMakerIds.add(event.actorId);
  }
  if (markedMakerIds.size !== makerIds.size) {
    throw new Error(
      'Missing maker cadence for stock-universe hydration.',
    );
  }
}

function expectedDerivativeActorCycleEventMs(state) {
  const nextAuthorityAtMs =
    state.world.derivatives?.market
      ?.nextActorCycleAtMs ??
    state.world.derivatives?.nowMs ??
    state.derivativeAuthorityOriginMs +
      state.nowMs;
  if (!Number.isSafeInteger(nextAuthorityAtMs)) {
    return null;
  }
  return Math.max(
    state.nowMs,
    nextAuthorityAtMs -
      state.derivativeAuthorityOriginMs,
  );
}

function ensureDerivativeActorCycleEvent(state) {
  if (!Array.isArray(state.eventQueue)) {
    throw new Error(
      'Invalid realtime market event queue.',
    );
  }
  const queued = state.eventQueue.filter(
    (event) =>
      event.type === 'derivative_actor_cycle',
  );
  if (queued.length > 0) return;
  const scheduledMs =
    expectedDerivativeActorCycleEventMs(state);
  if (!Number.isSafeInteger(scheduledMs)) {
    throw new Error(
      'Invalid derivative actor cadence authority.',
    );
  }
  scheduleEvent(state, {
    type: 'derivative_actor_cycle',
    scheduledMs,
    phasePriority:
      MARKET_PHASE_PRIORITY
        .DERIVATIVE_ACTOR_CYCLE,
    actorId: 'derivatives_clearing',
  });
}

function migrateMissingDerivativeActorCycleEvent(state) {
  state.eventQueue = state.eventQueue.filter(
    (event) => event.type !== 'derivative_actor_cycle',
  );
  heapifyEventQueue(state);
  ensureDerivativeActorCycleEvent(state);
}

function applyTestingAccessInitialization(
  state,
  testingAccessOpen,
) {
  if (!testingAccessOpen) return false;
  const authorityAtMs =
    state.derivativeAuthorityOriginMs +
    state.nowMs;
  const result = openTestingTradingAccess(
    state.world,
    {
      atMs: authorityAtMs,
      source:
        'explicit_testing_worker_initialization',
    },
  );
  if (!result.changed) return false;
  const commitSeq = state.commitSeq + 1;
  state.commitSeq = commitSeq;
  for (const account of Object.values(
    state.accounts,
  )) {
    account.commitSeq = commitSeq;
  }
  markAccountRisk(state);
  pushReceipt(state, {
    id: nextLocalId(state, 'receipt'),
    type: 'testing_access_initialized',
    status: 'applied',
    reason: null,
    source:
      'explicit_testing_worker_initialization',
    virtualMs: state.nowMs,
    authorityAtMs,
    derivativeReceiptId:
      result.receipt.id,
    derivativeCommitSeq:
      state.world.derivatives.commitSeq,
    commitSeq,
  });
  return true;
}

function professionalDerivativePolicyEntries(options) {
  const policies =
    options.professionalDerivativeActorPolicies;
  if (policies === undefined) return [];
  if (
    !policies ||
    typeof policies !== 'object' ||
    Array.isArray(policies)
  ) {
    throw new TypeError(
      'professionalDerivativeActorPolicies must be an object.',
    );
  }
  return Object.entries(policies).sort(
    ([left], [right]) => left.localeCompare(right),
  );
}

function applyInitialProfessionalDerivativePolicies(
  state,
  entries,
) {
  for (const [actorId, policy] of entries) {
    const result = reduceDerivatives(
      state.world.derivatives,
      {
        type: 'SET_PROFESSIONAL_ACTOR_CONTROL',
        atMs: state.world.derivatives.nowMs,
        actorId,
        policy,
        source:
          'controller_professional_ecology_policy',
      },
    );
    if (result.receipt.status !== 'applied') {
      throw new Error(
        `Invalid professional derivative actor policy: ${actorId}:${result.receipt.reason}`,
      );
    }
    state.world.derivatives = result.state;
  }
}

/**
 * Creates a JSON-serializable full-world market authority. A supplied saved
 * state is restored exactly; the separate world argument is used only to
 * validate that the checkpoint belongs to the requested world.
 */
export function createMarketSimulation(
  world,
  savedState = null,
  options = {},
) {
  if (!world?.world || world.world.status !== 'running') {
    throw new Error('A running LZY world is required.');
  }
  if (
    options.testingAccessOpen !== undefined &&
    typeof options.testingAccessOpen !== 'boolean'
  ) {
    throw new TypeError(
      'testingAccessOpen must be a boolean.',
    );
  }
  const professionalPolicyEntries =
    professionalDerivativePolicyEntries(options);
  if (savedState) {
    if (professionalPolicyEntries.length > 0) {
      throw new Error(
        'A saved derivative authority cannot be overridden by initialization policies.',
      );
    }
    let resumed = cloneJson(savedState);
    if (
      resumed.phasePriority?.PLAYER_MOTION !==
        MARKET_PHASE_PRIORITY.PLAYER_MOTION
    ) {
      resumed.phasePriority = cloneJson(
        MARKET_PHASE_PRIORITY,
      );
    }
    configureRealtimeAuditColdStore(
      resumed,
      options.auditColdStore,
    );
    if (resumed.world?.world?.id !== world.world.id) {
      throw new Error('Invalid or incompatible realtime market save.');
    }
    if (
      resumed.marketRuleVersion === LEGACY_MARKET_RULE_VERSION
    ) {
      resumed = migrateLegacyMarketRuleCheckpoint(
        world,
        resumed,
      );
    } else if (
      resumed.marketRuleVersion !== MARKET_RULE_VERSION
    ) {
      throw new Error('Invalid or incompatible realtime market save.');
    }
    const listingErrors = savedListingFieldErrors(resumed.world);
    if (listingErrors.length > 0) {
      throw new Error(
        `Invalid realtime market listing state: ${listingErrors.join('; ')}`,
      );
    }
    hydrateSecurityListingFields(resumed.world);
    const missingDerivativeAuthority =
      resumed.world.derivatives === undefined;
    migrateEmbeddedWorldStateForRestore(
      resumed.world,
    );
    hydratePlayerRoleAutomation(resumed);
    resumed.derivativeAuthorityOriginMs ??=
      resumed.world.derivatives.nowMs -
      resumed.nowMs;
    const stockUniverseMigration =
      migrateLegacyRealtimeStockUniverseCheckpoint(
        resumed,
      );
    hydrateAccountPortfolioFields(resumed);
    ensureStabilizationFundAccount(resumed);
    ensureQuantInstitutionAccount(resumed);
    const custodyMigration =
      ensureSecuritiesLendingCustodyAccount(
        resumed,
      );
    ensureDerivativeLendingCustodyAccounts(
      resumed,
    );
    hydrateAccountPortfolioFields(resumed);
    hydrateOrderSettlementFields(resumed);
    hydrateBarArchiveFields(resumed);
    hydrateTurnoverTruthFields(resumed);
    hydrateRealtimeAuditArchiveLosslessFields(resumed);
    hydrateDerivativeCadenceReceiptArchive(
      resumed,
    );
    compactRealtimePriceEvidence(resumed);
    if (
      migrateAgentEcologyState(resumed, {
        custodyMigration,
        strictCurrentSchema: true,
      })
    ) {
      scheduleAgentDecisions(resumed);
    }
    markStockUniverseMakerHydration(
      resumed,
      stockUniverseMigration.addedSymbols,
    );
    if (missingDerivativeAuthority) {
      migrateMissingDerivativeActorCycleEvent(resumed);
    } else {
      ensureDerivativeActorCycleEvent(resumed);
    }
    applyTestingAccessInitialization(
      resumed,
      options.testingAccessOpen === true,
    );
    assertFullMarketState(resumed);
    primeArchivedUltraFillIndexes(resumed);
    return resumed;
  }

  const {
    state: authoritativeWorld,
    migration: legacyMarketHistoryMigration,
  } = migrateLegacyMarketHistoryForRealtime(world);
  normalizeWorldSpatialState(authoritativeWorld);
  hydrateSecurityListingFields(authoritativeWorld);
  const books = Object.fromEntries(
    Object.keys(authoritativeWorld.market.securities).map((symbol) => [
      symbol,
      createOrderBook(symbol),
    ]),
  );
  const state = {
    marketRuleVersion: MARKET_RULE_VERSION,
    world: authoritativeWorld,
    nowMs: 0,
    derivativeAuthorityOriginMs:
      authoritativeWorld.derivatives.nowMs,
    lastWorldDaySettlementMs: 0,
    quoteFrameMs: QUOTE_FRAME_MS,
    worldDayMs: WORLD_DAY_MS,
    phasePriority: cloneJson(MARKET_PHASE_PRIORITY),
    commitSeq: 0,
    nextEventSequence: 1,
    nextOrderSequence: 1,
    nextRecordSequence: 1,
    eventQueue: [],
    books,
    barSeries: Object.fromEntries(
      Object.keys(books).map((symbol) => [
        symbol,
        createBarSeries(symbol, 0),
      ]),
    ),
    barArchives: {
      bySymbol: Object.fromEntries(
        Object.keys(books).map((symbol) => [
          symbol,
          {
            minuteBars: [],
            dailyBars: [],
            ultraFills: [],
          },
        ]),
      ),
    },
    accounts: createAccounts(authoritativeWorld),
    turnoverTruthBySymbol:
      createTurnoverTruthBySymbol(authoritativeWorld, 0),
    turnoverTruthIntegrationBySymbol:
      exactTurnoverIntegrationBySymbol(authoritativeWorld),
    exchangeFeePoolCents: cents(authoritativeWorld.market.exchangeFeePool),
    orderArchive: createOrderArchive(Object.keys(books)),
    realtimeAuditArchive: createAuditChainArchive(),
    derivativeCadenceReceiptArchive:
      createDerivativeCadenceReceiptArchive(),
    playerRoleAutomation:
      createPlayerRoleAutomation(authoritativeWorld),
    agentEcology: null,
    quoteFrames: [],
    receipts: [],
  };
  configureRealtimeAuditColdStore(
    state,
    options.auditColdStore,
  );
  hydrateAccountPortfolioFields(state);
  state.agentEcology = createAgentCatalog(authoritativeWorld);
  state.agentEcology.enabled = options.enableAgentEcology !== false;
  applyInitialProfessionalDerivativePolicies(
    state,
    professionalPolicyEntries,
  );
  markAccountRisk(state);
  syncWorldMarketMirrors(state);
  // A supplied world may already sit on a later slow-world day while its
  // embedded derivative snapshot still awaits reconciliation. The initial
  // mirror sync owns that reconciliation, so re-anchor realtime elapsed zero
  // to the resulting derivative authority before scheduling the zero-time
  // actor cadence.
  state.derivativeAuthorityOriginMs =
    state.world.derivatives.nowMs - state.nowMs;
  if (legacyMarketHistoryMigration.applied) {
    pushReceipt(state, {
      id: nextLocalId(state, 'receipt'),
      type: 'legacy_market_history_migration',
      status: 'applied',
      reason: null,
      archivedTradeCount:
        legacyMarketHistoryMigration.archivedTradeCount,
      archivedOrderCount:
        legacyMarketHistoryMigration.archivedOrderCount,
      archiveBlockIds:
        legacyMarketHistoryMigration.archiveBlockIds,
      archiveDigest:
        legacyMarketHistoryMigration.archiveDigest,
      virtualMs: state.nowMs,
      commitSeq: state.commitSeq,
    });
  }
  scheduleEvent(state, {
    type: 'derivative_actor_cycle',
    scheduledMs: 0,
    phasePriority:
      MARKET_PHASE_PRIORITY
        .DERIVATIVE_ACTOR_CYCLE,
    actorId: 'derivatives_clearing',
  });
  scheduleEvent(state, {
    type: 'quote_frame',
    scheduledMs: QUOTE_FRAME_MS,
    phasePriority: MARKET_PHASE_PRIORITY.QUOTE_FRAME,
  });
  scheduleEvent(state, {
    type: 'world_day_settlement',
    scheduledMs: WORLD_DAY_MS,
    phasePriority: MARKET_PHASE_PRIORITY.WORLD_DAY_SETTLEMENT,
  });
  scheduleAgentDecisions(state);
  while (
    state.eventQueue[0]?.scheduledMs === 0 &&
    (
      state.agentEcology.enabled ||
      state.eventQueue[0]?.type ===
        'derivative_actor_cycle'
    )
  ) {
    processNextEventInPlace(state, {
      deferMarketMirror: true,
    });
  }
  if (
    state.agentEcology.enabled ||
    state.world.derivatives.market
      .lastActorCycleAtMs !== null
  ) {
    for (const symbol of Object.keys(state.books)) {
      archiveTerminalOrders(state, symbol);
    }
    pruneBoundedAgentReceipts(state);
    syncWorldMarketMirrors(state, {
      synchronizeDerivatives: false,
    });
  }
  applyTestingAccessInitialization(
    state,
    options.testingAccessOpen === true,
  );
  assertFullMarketState(state);
  primeArchivedUltraFillIndexes(state);
  return state;
}

function commandEventDescriptor(state, command) {
  if (!state || state.marketRuleVersion !== MARKET_RULE_VERSION) {
    throw new Error('A realtime market simulation is required.');
  }
  const explicitlyScheduled =
    command.scheduledMs !== undefined &&
    command.scheduledMs !== null;
  const lastPublishedFrameMs =
    state.quoteFrames.at(-1)?.virtualMs ?? 0;
  const currentMillisecondPhaseClosed =
    state.nowMs > 0 &&
    (
      lastPublishedFrameMs === state.nowMs ||
      state.lastWorldDaySettlementMs === state.nowMs
    );
  const scheduledMs = explicitlyScheduled
    ? command.scheduledMs
    : state.nowMs + (currentMillisecondPhaseClosed ? 1 : 0);
  if (
    !Number.isSafeInteger(scheduledMs) ||
    scheduledMs < state.nowMs
  ) {
    throw new RangeError(
      'scheduledMs must be an integer at or after nowMs',
    );
  }
  if (
    explicitlyScheduled &&
    scheduledMs === state.nowMs &&
    currentMillisecondPhaseClosed
  ) {
    throw new RangeError(
      'Cannot enqueue a lower-priority command after this millisecond phase has closed.',
    );
  }
  const phasePriority =
    command.type === 'cancel_order'
      ? MARKET_PHASE_PRIORITY.CANCEL_EXPIRE
      : command.type === 'submit_order'
        ? MARKET_PHASE_PRIORITY.BROKER_ROUTE
        : MARKET_PHASE_PRIORITY.PLAYER_COMMAND;
  return {
    type: 'command',
    scheduledMs,
    phasePriority,
    actorId: command.actorId ?? 'world_system',
    payload: command,
  };
}

/** Adds a command to the deterministic queue without executing it. */
export function enqueueCommand(state, command) {
  return scheduleEvent(
    state,
    commandEventDescriptor(state, command),
  );
}

function reserveCommandEvent(state, command) {
  return createScheduledEvent(
    state,
    commandEventDescriptor(state, command),
  );
}

function splitAdjustedInteger(
  quantity,
  splitNumerator,
  splitDenominator,
) {
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 0
  ) {
    return null;
  }
  const numerator =
    BigInt(quantity) *
    BigInt(splitNumerator);
  const denominator =
    BigInt(splitDenominator);
  if (numerator % denominator !== 0n) {
    return null;
  }
  const adjusted = numerator / denominator;
  return adjusted <=
    BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(adjusted)
    : null;
}

function adjustAgentEcologyForSecuritySplit(
  state,
  {
    symbol,
    splitNumerator,
    splitDenominator,
  },
) {
  const ecology = state.agentEcology;
  if (!ecology) return;
  for (const agent of Object.values(
    ecology.agents ?? {},
  )) {
    const target = splitAdjustedInteger(
      agent.targetHoldings?.[symbol],
      splitNumerator,
      splitDenominator,
    );
    if (target !== null) {
      agent.targetHoldings[symbol] = target;
    }
    const account =
      agent.behaviorState?.account;
    if (!account) continue;
    const initial =
      account.initialHoldings?.[symbol];
    const settled =
      account.settledNetUnits?.[symbol];
    const current =
      Number.isSafeInteger(initial) &&
      Number.isSafeInteger(settled)
        ? initial + settled
        : null;
    const adjustedCurrent =
      splitAdjustedInteger(
        current,
        splitNumerator,
        splitDenominator,
      );
    if (adjustedCurrent !== null) {
      account.settledNetUnits[symbol] =
        adjustedCurrent - initial;
    }
    const exposureTicks =
      account.openExposureCostTicks?.[
        symbol
      ];
    if (
      Number.isSafeInteger(exposureTicks) &&
      exposureTicks > 0
    ) {
      account.openExposureCostTicks[
        symbol
      ] = Math.max(
        1,
        Math.round(
          exposureTicks *
            splitDenominator /
            splitNumerator,
        ),
      );
    } else if (
      account.settledNetUnits[symbol] !==
      0
    ) {
      account.openExposureCostTicks[
        symbol
      ] = Math.max(
        1,
        cents(
          state.world.market.securities[
            symbol
          ].lastPrice,
        ),
      );
    } else {
      account.openExposureCostTicks[
        symbol
      ] = 0;
    }
  }
  refreshDelayedFundamentals(state);
}

function handleSecurityCorporateAction(
  state,
  event,
) {
  flushDeferredWorldOrderMirrors(state);
  syncWorldBalancesFromAccounts(state);
  const authorityAtMs =
    state.derivativeAuthorityOriginMs +
    event.scheduledMs;
  const worldResult =
    applyCanonicalSecurityCorporateAction(
      state.world,
      {
        ...event.payload,
        authorityAtMs,
      },
    );
  if (
    worldResult.receipt.status !==
      'applied'
  ) {
    return pushReceipt(state, {
      id: nextLocalId(
        state,
        'receipt',
      ),
      type:
        'security_corporate_action',
      status: 'rejected',
      reason:
        worldResult.receipt.reason,
      actionId:
        event.payload.actionId,
      securityId:
        event.payload.securityId,
      virtualMs: state.nowMs,
      commitSeq: state.commitSeq,
    });
  }

  const {
    securityId: symbol,
    splitNumerator,
    splitDenominator,
  } = event.payload;
  const accountAdjustments =
    Object.values(state.accounts).map(
      (account) => ({
        account,
        after: splitAdjustedInteger(
          account.holdings[symbol],
          splitNumerator,
          splitDenominator,
        ),
      }),
    );
  const stabilityInventoryBefore =
    state.world.player.roleType ===
      'stabilization_fund' &&
    Object.hasOwn(
      state.world.player.roleState
        .stabilityDesk
        .interventionInventoryBySymbol,
      symbol,
    )
      ? state.world.player.roleState
          .stabilityDesk
          .interventionInventoryBySymbol[
          symbol
        ]
      : null;
  const stabilityInventoryAfter =
    stabilityInventoryBefore === null
      ? null
      : splitAdjustedInteger(
          stabilityInventoryBefore,
          splitNumerator,
          splitDenominator,
        );
  if (
    accountAdjustments.some(
      (adjustment) =>
        adjustment.after === null,
    ) ||
    (stabilityInventoryBefore !== null &&
      stabilityInventoryAfter === null)
  ) {
    return pushReceipt(state, {
      id: nextLocalId(
        state,
        'receipt',
      ),
      type:
        'security_corporate_action',
      status: 'rejected',
      reason:
        'NON_INTEGER_CORPORATE_ACTION_CUSTODY',
      actionId:
        event.payload.actionId,
      securityId: symbol,
      virtualMs: state.nowMs,
      commitSeq: state.commitSeq,
    });
  }

  const commitSeq = state.commitSeq + 1;
  const cancelledOrderIds = [];
  for (const order of Object.values(
    state.books[symbol].orders,
  )) {
    if (!activeOrder(order)) continue;
    const cancellation = cancelInBook(
      state.books[symbol],
      order.id,
      order.ownerId,
    );
    if (!cancellation.cancelled) {
      throw new Error(
        `failed to cancel corporate-action order ${order.id}`,
      );
    }
    order.commitSeq = commitSeq;
    state.accounts[
      order.ownerId
    ].commitSeq = commitSeq;
    cancelledOrderIds.push(order.id);
  }
  reconcileOrderReservations(
    state,
    cancelledOrderIds,
  );
  noteTerminalOrders(
    state,
    cancelledOrderIds,
  );
  archiveTerminalOrders(
    state,
    symbol,
  );

  const previousIds =
    captureWorldRecordIds(state.world);
  state.world = worldResult.state;
  if (stabilityInventoryAfter !== null) {
    state.world.player.roleState
      .stabilityDesk
      .interventionInventoryBySymbol[
      symbol
    ] = stabilityInventoryAfter;
  }
  for (const adjustment of accountAdjustments) {
    adjustment.account.holdings[
      symbol
    ] = adjustment.after;
    adjustment.account.commitSeq =
      commitSeq;
  }
  adjustAgentEcologyForSecuritySplit(
    state,
    {
      symbol,
      splitNumerator,
      splitDenominator,
    },
  );
  markWorldBalanceMirrorDirty(state);
  syncWorldBalancesFromAccounts(state);
  syncAccountsAfterWorldMutation(state);
  stampNewWorldRecords(
    state.world,
    previousIds,
    commitSeq,
  );
  state.commitSeq = commitSeq;
  markAccountRisk(state);
  syncWorldMarketMirrors(state);
  return pushReceipt(state, {
    ...cloneJson(worldResult.receipt),
    id: nextLocalId(
      state,
      'receipt',
    ),
    virtualMs: state.nowMs,
    authorityAtMs,
    cancelledOrderIds:
      cancelledOrderIds.sort(),
    commitSeq,
  });
}

function handlePlayerMotionStep(state, event) {
  const spatial = state.world.spatial;
  if (
    event.payload.sceneId !== spatial.activeSceneId ||
    event.payload.geometryRevision !== spatial.geometryRevision
  ) {
    return {
      type: 'player_motion_step',
      status: 'stopped',
      reason: 'STALE_SCENE',
      changed: false,
      shouldSchedule: false,
      virtualMs: state.nowMs,
      commitSeq: state.commitSeq,
    };
  }
  const result = stepWorld2DMotion(
    state.world,
    {
      authorityCommitSeq: state.commitSeq,
      authorityVirtualMs: event.scheduledMs,
      eventSequence: event.sequence,
    },
  );
  if (result.changed) {
    state.commitSeq += 1;
    state.world.spatial.player.authorityCommitSeq =
      state.commitSeq;
  }
  if (result.shouldSchedule) {
    schedulePlayerMotion(
      state,
      event.scheduledMs + WORLD2D_MOTION_STEP_MS,
    );
  }
  return {
    ...result,
    type: 'player_motion_step',
    reason: null,
    sceneId: spatial.activeSceneId,
    geometryRevision: spatial.geometryRevision,
    virtualMs: state.nowMs,
    commitSeq: state.commitSeq,
  };
}

function executeNextEvent(
  state,
  { deferMarketMirror = false } = {},
) {
  const event = popEventQueue(state);
  if (!event) return null;
  state.nowMs = event.scheduledMs;
  rollRealtimeAuditSlotDomain(state);
  let result;
  if (event.type === 'command') {
    const dirtySymbol = deferMarketMirror
      ? externalOrderSymbol(state, event.payload)
      : null;
    result = routeCommand(state, event.payload, {
      deferBatchMaintenance: deferMarketMirror,
    });
    if (dirtySymbol) {
      markDeferredWorldOrderMirror(state, dirtySymbol);
    }
    attributeAgentCommand(state, event.payload, result);
    synchronizeDeferredBalancesForDerivatives(
      state,
      deferMarketMirror,
    );
  } else if (event.type === 'player_motion_step') {
    result = handlePlayerMotionStep(state, event);
  } else if (event.type === 'open_world_city_completion') {
    result = handleOpenWorldCityCompletion(state, event);
  } else if (event.type === 'agent_command_batch') {
    result = handleAgentCommandBatch(state, event, {
      deferMarketMirror,
    });
    synchronizeDeferredBalancesForDerivatives(
      state,
      deferMarketMirror,
    );
  } else if (
    event.type === 'agent_decision' ||
    event.type === 'public_flow_response'
  ) {
    result = handleEcologyDecision(state, event);
  } else if (
    event.type ===
    'security_corporate_action'
  ) {
    result =
      handleSecurityCorporateAction(
        state,
        event,
      );
  } else if (
    event.type === 'derivative_actor_cycle'
  ) {
    // Derivative cadence consumes settled spot prices, player balances and
    // collateral authority; it never consumes the stock order-list mirror.
    // Keep that rebuild deferred until the enclosing publication/verification
    // boundary so one three-second cadence cannot rescan the complete live
    // order mirror merely to price futures and options.
    syncWorldBalancesFromAccounts(state);
    const authorityAtMs =
      state.derivativeAuthorityOriginMs +
      event.scheduledMs;
    const cadence =
      advanceEmbeddedDerivativesMarket(
        state.world,
        {
          atMs: authorityAtMs,
          // The realtime account ledger is the reservation authority. Passing
          // its scalar directly avoids rebuilding the complete order-list
          // projection merely so derivatives can respect stock buying power.
          playerExternalReservedCashCents:
            state.accounts.player
              .reservedCashCents,
        },
      );
    syncAccountsAfterWorldMutation(state, {
      synchronizeHoldings:
        cadence.institutionalSecuritiesTransfers
          .length > 0,
    });
    const duplicate =
      cadence.receipt.duplicate === true;
    if (!duplicate) {
      const commitSeq = state.commitSeq + 1;
      state.commitSeq = commitSeq;
      for (const account of Object.values(
        state.accounts,
      )) {
        account.commitSeq = commitSeq;
      }
      markAccountRisk(state);
      pushReceipt(state, {
        id: nextLocalId(
          state,
          'derivative_cadence_receipt',
        ),
        type: 'derivative_actor_cycle',
        status: 'applied',
        reason: null,
        virtualMs: state.nowMs,
        authorityAtMs,
        derivativeCommitSeq:
          state.world.derivatives.commitSeq,
        institutionalSecuritiesTransfers:
          cadence.institutionalSecuritiesTransfers,
        commitSeq,
      });
      archiveQuietDerivativeCadenceReceipts(
        state,
      );
    }
    scheduleEvent(state, {
      type: 'derivative_actor_cycle',
      scheduledMs:
        event.scheduledMs + QUOTE_FRAME_MS,
      phasePriority:
        MARKET_PHASE_PRIORITY
          .DERIVATIVE_ACTOR_CYCLE,
      actorId: 'derivatives_clearing',
    });
    if (!deferMarketMirror) {
      syncWorldMarketMirrors(state);
    }
    result = cadence.receipt;
  } else if (event.type === 'quote_frame') {
    runPlayerRoleAutomation(state, { deferMarketMirror });
    result = publishQuoteFrame(state, { deferMarketMirror });
  } else if (event.type === 'world_day_settlement') {
    if (deferMarketMirror) syncWorldMarketMirrors(state);
    result = settleWorldDay(state);
  } else {
    throw new Error(`Unknown market event type: ${event.type}`);
  }
  return { event, result };
}

function recordMarketProgression(
  state,
  execution,
  { inPlace },
) {
  const current =
    marketProgressionDiagnostics.get(state) ?? {
      processNextEventCallCount: 0,
      inPlaceAuthorityCallCount: 0,
      transactionalAuthorityCallCount: 0,
      executedEventCount: 0,
      lastEventId: null,
      lastEventType: null,
      lastEventScheduledMs: null,
    };
  current.processNextEventCallCount += 1;
  if (inPlace) {
    current.inPlaceAuthorityCallCount += 1;
  } else {
    current.transactionalAuthorityCallCount += 1;
  }
  if (execution) {
    current.executedEventCount += 1;
    current.lastEventId = execution.event.id;
    current.lastEventType = execution.event.type;
    current.lastEventScheduledMs =
      execution.event.scheduledMs;
  }
  marketProgressionDiagnostics.set(state, current);
}

export function getMarketProgressionDiagnostics(state) {
  if (!Array.isArray(state?.eventQueue)) {
    throw new Error('A realtime market simulation is required.');
  }
  const current =
    marketProgressionDiagnostics.get(state) ?? {
      processNextEventCallCount: 0,
      inPlaceAuthorityCallCount: 0,
      transactionalAuthorityCallCount: 0,
      executedEventCount: 0,
      lastEventId: null,
      lastEventType: null,
      lastEventScheduledMs: null,
    };
  return { ...current };
}

function processNextEventInPlace(
  state,
  { deferMarketMirror = false } = {},
) {
  return processNextEvent(state, {
    [INTERNAL_PROCESS_NEXT_EVENT_AUTHORITY]: true,
    deferMarketMirror,
  });
}

/** Executes exactly one queue event, including all synchronous fill commits. */
export function processNextEvent(state, options = undefined) {
  if (!Array.isArray(state?.eventQueue)) {
    throw new Error('A realtime market simulation is required.');
  }
  const inPlace =
    options?.[INTERNAL_PROCESS_NEXT_EVENT_AUTHORITY] === true;
  if (options !== undefined && !inPlace) {
    throw new TypeError('Invalid processNextEvent authority options.');
  }
  if (inPlace) {
    const execution = executeNextEvent(state, {
      deferMarketMirror:
        options.deferMarketMirror === true,
    });
    recordMarketProgression(state, execution, {
      inPlace: true,
    });
    return execution;
  }
  const draft =
    inheritRealtimeAuditRuntimeMetadata(
      state,
      cloneJson(state),
    );
  const execution = executeNextEvent(draft);
  if (!execution) {
    recordMarketProgression(state, null, {
      inPlace: false,
    });
    return null;
  }
  assertFullMarketState(draft);
  replaceState(state, draft);
  recordMarketProgression(state, execution, {
    inPlace: false,
  });
  return execution.result;
}

function externalOrderSymbol(state, command) {
  if (command.type === 'submit_order') {
    return state.books[command.symbol] ? command.symbol : null;
  }
  if (command.type !== 'cancel_order') return null;
  return findOrder(state, command.orderId)?.symbol ?? null;
}

function immediateOrderMayTrade(
  state,
  command,
  symbol,
) {
  if (
    command.type !== 'submit_order' ||
    !symbol ||
    (
      command.side !== 'buy' &&
      command.side !== 'sell'
    )
  ) {
    return false;
  }
  const opposite = aggregateBook(
    state.books[symbol],
    1,
  )[
    command.side === 'buy'
      ? 'asks'
      : 'bids'
  ][0];
  if (!opposite) return false;
  const orderType =
    command.orderType ?? 'limit';
  if (orderType === 'market') return true;
  if (!isPositiveInteger(command.priceTicks)) {
    return false;
  }
  return command.side === 'buy'
    ? opposite.priceTicks <=
        command.priceTicks
    : opposite.priceTicks >=
        command.priceTicks;
}

function cloneImmediateWorldTransaction(
  source,
  symbols,
  { cloneWorldline = false } = {},
) {
  const securities = {
    ...source.market.securities,
  };
  for (const symbol of symbols) {
    const security =
      source.market.securities[symbol];
    if (!security) continue;
    securities[symbol] = {
      ...security,
      priceHistory: [
        ...(security.priceHistory ?? []),
      ],
    };
  }
  const investors = Object.fromEntries(
    Object.entries(
      source.entities.investors ?? {},
    ).map(([investorId, investor]) => [
      investorId,
      { ...investor },
    ]),
  );
  return {
    ...source,
    worldline: cloneWorldline
      ? cloneStructured(source.worldline)
      : source.worldline,
    player: {
      ...source.player,
    },
    ui: source.ui
      ? {
          ...source.ui,
        }
      : source.ui,
    entities: {
      ...source.entities,
      investors,
    },
    market: {
      ...source.market,
      securities,
      maker: {
        ...source.market.maker,
      },
      trades: cloneWorldline
        ? [...(source.market.trades ?? [])]
        : source.market.trades,
      orders: source.market.orders,
      orderBooks: {
        ...source.market.orderBooks,
      },
    },
    eventLog: cloneWorldline
      ? [...source.eventLog]
      : source.eventLog,
    ledger: cloneWorldline
      ? [...source.ledger]
      : source.ledger,
    facts: cloneWorldline
      ? [...source.facts]
      : source.facts,
    memories: cloneWorldline
      ? [...source.memories]
      : source.memories,
  };
}

function cloneImmediateOrderArchive(
  source,
  symbols,
) {
  const bySymbol = {
    ...source.bySymbol,
  };
  for (const symbol of symbols) {
    const entry = source.bySymbol[symbol];
    if (!entry) continue;
    bySymbol[symbol] = {
      ...entry,
      statusCounts: {
        ...entry.statusCounts,
      },
      recentReferences: [
        ...entry.recentReferences,
      ],
    };
  }
  return {
    ...source,
    bySymbol,
  };
}

function cloneImmediateRealtimeAuditArchive(
  source,
) {
  return {
    ...source,
    recentBundles: [
      ...source.recentBundles,
    ],
    foldedBlocks: [
      ...source.foldedBlocks,
    ],
    pendingFrame: {
      ...source.pendingFrame,
    },
  };
}

function cloneImmediateDerivativeReceiptArchive(
  source,
) {
  const ranges = [
    ...source.ranges,
  ];
  if (ranges.length > 0) {
    ranges[ranges.length - 1] = {
      ...ranges.at(-1),
    };
  }
  return {
    ...source,
    ranges,
  };
}

function cloneImmediateAgentEcology(source) {
  if (!source) return source;
  const agents = Object.fromEntries(
    Object.entries(source.agents).map(
      ([agentId, agent]) => [
        agentId,
        agent.behaviorState
          ? {
              ...agent,
              behaviorState:
                cloneStructured(
                  agent.behaviorState,
                ),
            }
          : agent,
      ],
    ),
  );
  return {
    ...source,
    agents,
    capacityLedger:
      cloneStructured(
        source.capacityLedger,
      ),
    publicFlow: [
      ...source.publicFlow,
    ],
    pendingResponses:
      cloneStructured(
        source.pendingResponses,
      ),
  };
}

/**
 * Player order commands normally execute before the next autonomous event.
 * For that common path, copy only the authority slices an order can mutate
 * and rebuild the duplicated engine-facing order mirrors at publication.
 * Unrelated books, bars and quote history remain immutable structural shares.
 */
function cloneImmediateOrderTransaction(
  state,
  command,
  { archiveAllSymbols = false } = {},
) {
  const targetSymbol = externalOrderSymbol(state, command);
  const overflowSymbols =
    !archiveAllSymbols && targetSymbol
      ? Object.keys(state.books).filter(
          (symbol) =>
            terminalOrderIndex(state.books[symbol])
              .ids.size >
            MAX_TERMINAL_ORDERS_PER_SYMBOL,
        )
      : [];
  const symbols = archiveAllSymbols
    ? Object.keys(state.books)
    : targetSymbol
      ? [
          ...new Set([
            targetSymbol,
            ...overflowSymbols,
          ]),
        ]
      : [];
  const mayTrade = immediateOrderMayTrade(
    state,
    command,
    targetSymbol,
  );
  const world = cloneImmediateWorldTransaction(
    state.world,
    symbols,
    { cloneWorldline: mayTrade },
  );
  const clonedBooks = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      archiveAllSymbols
        ? copyOrderBookRuntimeMetadata(
            state.books[symbol],
            cloneStructured(state.books[symbol]),
          )
        : createOrderBookTransaction(
            state.books[symbol],
          ),
    ]),
  );
  if (!archiveAllSymbols) {
    for (const symbol of symbols) {
      const sourceIndex =
        terminalOrderIndex(state.books[symbol]);
      terminalOrderIndexes.set(
        clonedBooks[symbol],
        {
          ids: new Set(sourceIndex.ids),
          heap: [...sourceIndex.heap],
        },
      );
    }
  }
  const draft = {
    ...state,
    world,
    eventQueue: cloneStructured(state.eventQueue),
    books: {
      ...state.books,
      ...clonedBooks,
    },
    barSeries: { ...state.barSeries },
    accounts: cloneStructured(state.accounts),
    turnoverTruthBySymbol: {
      ...state.turnoverTruthBySymbol,
    },
    orderArchive: cloneImmediateOrderArchive(
      state.orderArchive,
      symbols,
    ),
    realtimeAuditArchive:
      cloneImmediateRealtimeAuditArchive(
      state.realtimeAuditArchive,
    ),
    derivativeCadenceReceiptArchive:
      cloneImmediateDerivativeReceiptArchive(
        state.derivativeCadenceReceiptArchive,
      ),
    agentEcology:
      mayTrade
        ? cloneImmediateAgentEcology(
            state.agentEcology,
          )
        : state.agentEcology,
    receipts: [...state.receipts],
  };
  if (archiveAllSymbols) {
    const fullOrderIndex = new Map();
    for (const book of Object.values(clonedBooks)) {
      for (const order of Object.values(book.orders)) {
        if (fullOrderIndex.has(order.id)) {
          throw new Error(
            `Duplicate market order id: ${order.id}`,
          );
        }
        fullOrderIndex.set(order.id, order);
      }
    }
    orderIndexes.set(draft, fullOrderIndex);
  } else {
    if (!orderIndexes.get(state)) {
      findOrder(state, '__build_order_index__');
    }
    const scopedOrderIndex = {
      base: orderIndexes.get(state),
      changed: new Map(),
      deleted: new Set(),
    };
    orderIndexOverlays.add(scopedOrderIndex);
    orderIndexes.set(draft, scopedOrderIndex);
  }
  const pendingBarFills = new Map();
  deferredBarFillTransactions.set(draft, pendingBarFills);
  inheritRealtimeAuditRuntimeMetadata(
    state,
    draft,
  );
  return {
    draft,
    symbols,
    incrementalEligible: true,
    mayTrade,
    pendingBarFills,
  };
}

function cloneMarketStateWithOrderBookRuntimeMetadata(state) {
  const cloned =
    inheritRealtimeAuditRuntimeMetadata(
      state,
      cloneStructured(state),
    );
  for (let index = 0; index <
    (state.realtimeAuditArchive?.foldedBlocks?.length ?? 0);
    index += 1) {
    if (
      verifiedRealtimeAuditBlocks.has(
        state.realtimeAuditArchive.foldedBlocks[index],
      )
    ) {
      verifiedRealtimeAuditBlocks.add(
        cloned.realtimeAuditArchive.foldedBlocks[index],
      );
    }
  }
  for (const [symbol, sourceBook] of Object.entries(
    state.books,
  )) {
    copyOrderBookRuntimeMetadata(
      sourceBook,
      cloned.books[symbol],
    );
  }
  return cloned;
}

function materializeDeferredBarFills(draft, pendingBarFills) {
  const replacements = {};
  for (const [symbol, entry] of pendingBarFills ?? []) {
    if (entry.fills.length === 0) continue;
    if (draft.barSeries[symbol] !== entry.sourceSeries) {
      throw new Error(
        `Deferred bar-fill authority changed before verification: ${symbol}`,
      );
    }
    replacements[symbol] = {
      ...entry.sourceSeries,
      fills: entry.sourceSeries.fills.concat(entry.fills),
      bars: entry.sourceSeries.bars,
    };
  }
  if (Object.keys(replacements).length > 0) {
    draft.barSeries = {
      ...draft.barSeries,
      ...replacements,
    };
  }
  deferredBarFillTransactions.delete(draft);
}

function finalizeImmediateOrderBookTransactions(
  draft,
  symbols,
  { materialize = false } = {},
) {
  for (const symbol of symbols) {
    const transactionBook = draft.books[symbol];
    const terminalIndex =
      terminalOrderIndexes.get(transactionBook);
    const committedBook = materialize
      ? materializeOrderBookTransaction(
          transactionBook,
        )
      : commitOrderBookTransaction(
          transactionBook,
        );
    draft.books[symbol] = committedBook;
    terminalOrderIndexes.delete(transactionBook);
    if (terminalIndex) {
      terminalOrderIndexes.set(
        committedBook,
        terminalIndex,
      );
    }
  }
}

function commitDeferredBarFills(draft, pendingBarFills) {
  for (const [symbol, entry] of pendingBarFills ?? []) {
    if (draft.barSeries[symbol] !== entry.sourceSeries) {
      throw new Error(
        `Deferred bar-fill authority changed before commit: ${symbol}`,
      );
    }
    for (const fill of entry.fills) {
      entry.sourceSeries.fills.push(fill);
    }
  }
  deferredBarFillTransactions.delete(draft);
}

function settleEventsBeforeReservedCommand(
  state,
  reservedCommand,
) {
  const executions = [];
  while (
    state.eventQueue[0] &&
    compareEvents(
      state.eventQueue[0],
      reservedCommand,
    ) < 0
  ) {
    const execution = processNextEventInPlace(state, {
      deferMarketMirror: true,
    });
    if (!execution) {
      throw new Error(
        'A preceding market event disappeared before execution.',
      );
    }
    executions.push(execution);
  }
  if (executions.length > 0) {
    flushDeferredWorldOrderMirrors(state);
    compactRealtimeAuditOverflow(
      state,
      state.commitSeq,
    );
    verifiedAccountAuthoritySeals.set(
      state,
      accountAuthoritySeal(state),
    );
  }
  return executions;
}

function cloneSpatialControlTransaction(state) {
  const draft = {
    ...state,
    world: {
      ...state.world,
      spatial: cloneJson(state.world.spatial),
    },
    eventQueue: cloneJson(state.eventQueue),
    receipts: [...state.receipts],
  };
  inheritRealtimeAuditRuntimeMetadata(state, draft);
  const accountSeal =
    verifiedAccountAuthoritySeals.get(state);
  if (typeof accountSeal === 'string') {
    verifiedAccountAuthoritySeals.set(
      draft,
      accountSeal,
    );
  }
  const orderIndex = orderIndexes.get(state);
  if (orderIndex) orderIndexes.set(draft, orderIndex);
  const balanceMirror =
    worldBalanceMirrorStates.get(state);
  if (balanceMirror) {
    worldBalanceMirrorStates.set(
      draft,
      balanceMirror,
    );
  }
  return draft;
}

function assertIncrementalSpatialState(
  previous,
  draft,
  receipt,
) {
  const protectedRoots = [
    'books',
    'accounts',
    'barSeries',
    'barArchives',
    'orderArchive',
    'realtimeAuditArchive',
    'derivativeCadenceReceiptArchive',
    'playerRoleAutomation',
    'agentEcology',
    'quoteFrames',
  ];
  for (const root of protectedRoots) {
    if (draft[root] !== previous[root]) {
      throw new Error(
        `incremental spatial authority touched ${root}`,
      );
    }
  }
  for (const root of [
    'player',
    'cityLife',
    'socialCareer',
    'entities',
    'economy',
    'market',
    'clues',
    'facts',
    'memories',
    'narratives',
    'ledger',
    'eventLog',
    'replay',
    'historyArchive',
    'accounting',
    'worldline',
    'derivatives',
  ]) {
    if (draft.world[root] !== previous.world[root]) {
      throw new Error(
        `incremental spatial authority touched world.${root}`,
      );
    }
  }
  const audit = auditWorldSpatialState(draft.world);
  if (!audit.ok) {
    throw new Error(
      `spatial invariant violation: ${audit.errors.join('; ')}`,
    );
  }
  if (receipt.status === 'accepted') {
    if (
      draft.commitSeq !== previous.commitSeq + 1 ||
      draft.world.spatial.player.authorityCommitSeq !==
        draft.commitSeq
    ) {
      throw new Error('invalid incremental spatial commit');
    }
  } else if (
    draft.commitSeq !== previous.commitSeq ||
    !sameJson(
      draft.world.spatial,
      previous.world.spatial,
    )
  ) {
    throw new Error('rejected spatial command mutated authority');
  }
}

function processSpatialControlCommand(
  state,
  command,
  { performanceTrace = null, tracePart = () => {} } = {},
) {
  const duplicate = priorSpatialControlReceipt(
    state.world.spatial,
    command.commandId,
  );
  if (duplicate) {
    if (performanceTrace) {
      performanceTrace.cloneRoots = 0;
      performanceTrace.bookCloneCount = 0;
      performanceTrace.coldHistoryReads = 0;
      performanceTrace.duplicate = true;
    }
    return {
      receipt: cloneJson(duplicate),
      quoteFrames: [],
      precedingEvents: [],
    };
  }
  const reservationNextEventSequence =
    state.nextEventSequence;
  const reservedCommand = reserveCommandEvent(
    state,
    command,
  );
  const precedingEvents =
    settleEventsBeforeReservedCommand(
      state,
      reservedCommand,
    );
  const authorityBefore = {
    ...state,
    world: state.world,
  };
  if (performanceTrace) {
    performanceTrace.cloneRoots = 4;
    performanceTrace.bookCloneCount = 0;
    performanceTrace.coldHistoryReads = 0;
    performanceTrace.precedingEventCount =
      precedingEvents.length;
  }
  tracePart('prepareBoundaryMs');
  try {
    const draft = cloneSpatialControlTransaction(
      state,
    );
    insertEventQueue(draft, reservedCommand);
    tracePart('cloneAndScheduleMs');
    let receipt = null;
    while (!receipt) {
      const execution = processNextEventInPlace(
        draft,
      );
      if (!execution) {
        throw new Error(
          'Spatial command disappeared before execution.',
        );
      }
      if (execution.event.id === reservedCommand.id) {
        receipt = execution.result;
      }
    }
    tracePart('executeMs');
    assertIncrementalSpatialState(
      authorityBefore,
      draft,
      receipt,
    );
    tracePart('incrementalAuditMs');
    replaceState(state, draft);
    tracePart('replaceMs');
    return {
      receipt,
      quoteFrames: precedingEvents
        .filter(({ event }) => event.type === 'quote_frame')
        .map(({ result }) => result),
      precedingEvents,
    };
  } catch (error) {
    if (
      precedingEvents.length === 0 &&
      state.nextEventSequence ===
        reservationNextEventSequence + 1
    ) {
      state.nextEventSequence =
        reservationNextEventSequence;
    }
    throw error;
  }
}

/**
 * Runs one external command at the deterministic queue boundary. Trusted
 * autonomous events that already precede the reserved command settle on the
 * sole authority first; the player command then uses a symbol-scoped
 * copy-on-write transaction. A rejected or failed player command therefore
 * cannot roll back market work that was already due, and it cannot mutate its
 * target book before the incremental invariant proof succeeds.
 */
export function processExternalCommand(
  state,
  command,
  {
    verification = 'full',
    performanceTrace = null,
    reuseVerifiedArchives = false,
  } = {},
) {
  if (!state || state.marketRuleVersion !== MARKET_RULE_VERSION) {
    throw new Error('A realtime market simulation is required.');
  }
  if (verification !== 'full' && verification !== 'incremental') {
    throw new TypeError(
      'verification must be "full" or "incremental".',
    );
  }
  if (typeof reuseVerifiedArchives !== 'boolean') {
    throw new TypeError(
      'reuseVerifiedArchives must be a boolean',
    );
  }
  const traceNow = performanceTrace
    ? () =>
        globalThis.performance?.now?.() ??
        Date.now()
    : null;
  let traceStartedAt = traceNow?.();
  const tracePart = performanceTrace
    ? (name) => {
        const completedAt = traceNow();
        performanceTrace[name] =
          completedAt - traceStartedAt;
        traceStartedAt = completedAt;
      }
    : () => {};
  // Cooperative playback may retain derived book mirrors across CPU turns.
  // An external command is an authority boundary, so materialize that dirty
  // set once before creating its transactional snapshot.
  flushDeferredWorldOrderMirrors(state);
  tracePart('boundaryMs');
  if (command.type === 'player_control') {
    return processSpatialControlCommand(
      state,
      command,
      { performanceTrace, tracePart },
    );
  }
  const immediateOrder =
    command.type === 'submit_order' ||
    command.type === 'cancel_order';
  const reservationNextEventSequence =
    state.nextEventSequence;
  const reservedCommand = immediateOrder
    ? reserveCommandEvent(state, command)
    : null;
  const precedingEvents = immediateOrder
    ? settleEventsBeforeReservedCommand(
        state,
        reservedCommand,
      )
    : [];
  if (performanceTrace) {
    performanceTrace.precedingEventCount =
      precedingEvents.length;
  }
  tracePart('prepareBoundaryMs');
  try {
  let transaction = immediateOrder
    ? cloneImmediateOrderTransaction(state, command, {
        archiveAllSymbols: verification === 'full',
      })
    : {
        draft:
          cloneMarketStateWithOrderBookRuntimeMetadata(
            state,
          ),
        symbols: Object.keys(state.books),
        incrementalEligible: false,
      };
  let { draft } = transaction;
  for (const symbol of transaction.symbols) {
    archiveTerminalOrders(draft, symbol);
  }
  pruneBoundedAgentReceipts(draft);
  const scheduled = immediateOrder
    ? reservedCommand
    : enqueueCommand(draft, command);
  if (immediateOrder) {
    insertEventQueue(draft, scheduled);
    if (draft.eventQueue[0]?.id !== scheduled.id) {
      throw new Error(
        'Reserved player command boundary was not fully prepared.',
      );
    }
  }
  tracePart('cloneAndScheduleMs');
  const quoteFrames = precedingEvents
    .filter(
      ({ event }) => event.type === 'quote_frame',
    )
    .map(({ result }) => result);
  let receipt = null;
  let commandExecuted = false;
  while (!commandExecuted) {
    const execution = processNextEventInPlace(draft, {
      deferMarketMirror: transaction.incrementalEligible,
    });
    if (!execution) {
      throw new Error('External command disappeared before execution.');
    }
    if (execution.event.type === 'quote_frame') {
      quoteFrames.push(execution.result);
    }
    if (execution.event.id === scheduled.id) {
      receipt = execution.result;
      commandExecuted = true;
    }
  }
  tracePart('executeMs');
  const maintenancePart = performanceTrace
    ? (name, operation) => {
        const startedAt = traceNow();
        const result = operation();
        performanceTrace[name] = traceNow() - startedAt;
        return result;
      }
    : (_name, operation) => operation();
  maintenancePart('terminalArchiveMs', () => {
    for (const symbol of transaction.symbols) {
      archiveTerminalOrders(draft, symbol);
    }
  });
  maintenancePart('receiptPruneMs', () =>
    pruneBoundedAgentReceipts(draft),
  );
  maintenancePart('accountRiskMs', () =>
    markAccountRisk(draft),
  );
  maintenancePart('priceEvidenceMs', () =>
    compactRealtimePriceEvidence(draft),
  );
  maintenancePart('worldMirrorMs', () =>
    syncWorldMarketMirrors(
      draft,
      transaction.incrementalEligible
          ? {
            dirtySymbols: transaction.symbols,
            synchronizeDerivatives:
              transaction.mayTrade === false
                ? 'reservation_only'
                : true,
            performanceTrace,
          }
        : performanceTrace
          ? { performanceTrace }
          : undefined,
    ),
  );
  tracePart('maintenanceMs');
  const incrementalVerification =
    verification === 'incremental' &&
    transaction.incrementalEligible;
  if (incrementalVerification) {
    assertIncrementalOrderState(
      state,
      draft,
      command,
      receipt,
      transaction.pendingBarFills,
      transaction.symbols,
    );
    tracePart('incrementalAuditMs');
    const liveRealtimeTradeCount = draft.world.market.trades.reduce(
      (count, trade) =>
        count +
        (
          trade.source === 'realtime_order_book' ||
          trade.id?.startsWith('rt_trade_')
            ? 1
            : 0
        ),
      0,
    );
    if (
      liveRealtimeTradeCount >
      MAX_LIVE_REALTIME_AUDIT_CHAINS
    ) {
      finalizeImmediateOrderBookTransactions(
        draft,
        transaction.symbols,
        { materialize: true },
      );
      materializeDeferredBarFills(
        draft,
        transaction.pendingBarFills,
      );
      compactRealtimeAuditOverflow(
        draft,
        draft.commitSeq,
        REALTIME_AUDIT_BACKGROUND_TARGET,
      );
      // Large single-commit bursts cross from the live layer into the audit
      // archive inside this still-unpublished transaction. Verify the folded
      // representation before replacing the sole authority.
      assertFullMarketState(draft, {
        reuseVerifiedArchives,
      });
    } else {
      finalizeImmediateOrderBookTransactions(
        draft,
        transaction.symbols,
      );
      commitDeferredBarFills(
        draft,
        transaction.pendingBarFills,
      );
    }
    tracePart('finalizeMs');
  } else {
    if (transaction.pendingBarFills) {
      materializeDeferredBarFills(
        draft,
        transaction.pendingBarFills,
      );
    }
    compactRealtimeAuditOverflow(draft, draft.commitSeq);
    assertFullMarketState(draft, {
      reuseVerifiedArchives,
    });
    tracePart('fullAuditMs');
  }
  verifiedAccountAuthoritySeals.set(
    draft,
    accountAuthoritySeal(draft),
  );
  replaceState(state, draft);
  tracePart('replaceMs');
  return { receipt, quoteFrames, precedingEvents };
  } catch (error) {
    if (
      immediateOrder &&
      precedingEvents.length === 0 &&
      state.nextEventSequence ===
        reservationNextEventSequence + 1
    ) {
      state.nextEventSequence =
        reservationNextEventSequence;
    }
    throw error;
  }
}

/**
 * Advances through every event at or before targetMs, then moves the clock.
 *
 * A playback time slice processes trusted, already-validated internal events
 * in place and, by default, runs the complete invariant suite once at the
 * slice boundary. The Worker may defer that complete scan during uninterrupted
 * playback, but verifies periodically and at every command/save/pause barrier.
 * External commands still use the transactional `processNextEvent` path. The
 * split avoids cloning the full audit world on every cadence event and lets
 * the advertised accelerated clocks keep pace with wall time.
 */
export function advanceTo(
  state,
  targetMs,
  {
    onEvent = null,
    verifyState = true,
    reuseVerifiedArchives = false,
    shouldYield = null,
    deferWorldOrderMirrorFlush = false,
  } = {},
) {
  if (
    !Number.isSafeInteger(targetMs) ||
    targetMs < state.nowMs
  ) {
    throw new RangeError('targetMs must be an integer at or after nowMs');
  }
  if (onEvent !== null && typeof onEvent !== 'function') {
    throw new TypeError('onEvent must be a function when provided');
  }
  if (typeof verifyState !== 'boolean') {
    throw new TypeError('verifyState must be a boolean');
  }
  if (typeof reuseVerifiedArchives !== 'boolean') {
    throw new TypeError(
      'reuseVerifiedArchives must be a boolean',
    );
  }
  if (typeof deferWorldOrderMirrorFlush !== 'boolean') {
    throw new TypeError(
      'deferWorldOrderMirrorFlush must be a boolean',
    );
  }
  if (
    shouldYield !== null &&
    typeof shouldYield !== 'function'
  ) {
    throw new TypeError(
      'shouldYield must be a function when provided',
    );
  }
  if (
    !verifyState &&
    verifiedAccountAuthoritySeals.get(state) !==
      accountAuthoritySeal(state)
  ) {
    throw new Error('Invalid pre-advance account authority.');
  }
  let yielded = false;
  while (
    state.eventQueue[0] &&
    state.eventQueue[0].scheduledMs <= targetMs
  ) {
    const execution = processNextEventInPlace(state, {
      deferMarketMirror: true,
    });
    onEvent?.(execution.event, execution.result, state);
    if (
      state.eventQueue[0] &&
      state.eventQueue[0].scheduledMs <= targetMs &&
      state.eventQueue[0].scheduledMs >
        execution.event.scheduledMs &&
      shouldYield?.(
        execution.event,
        execution.result,
        state,
      )
    ) {
      yielded = true;
      break;
    }
  }
  if (verifyState) {
    const archivedSymbols = [];
    for (const symbol of Object.keys(state.books)) {
      if (archiveTerminalOrders(state, symbol) > 0) {
        archivedSymbols.push(symbol);
      }
    }
    pruneBoundedAgentReceipts(state);
    if (reuseVerifiedArchives) {
      const mirrorSymbols = new Set(
        archivedSymbols,
      );
      for (const symbol of
        deferredWorldOrderMirrorSymbols.get(state) ?? []) {
        mirrorSymbols.add(symbol);
      }
      if (mirrorSymbols.size > 0) {
        syncWorldMarketMirrors(state, {
          dirtySymbols: [...mirrorSymbols],
          synchronizeDerivatives: false,
        });
      } else {
        syncWorldBalancesFromAccounts(state);
      }
    } else {
      syncWorldMarketMirrors(state, {
        synchronizeDerivatives: false,
      });
    }
  } else if (
    !yielded &&
    !deferWorldOrderMirrorFlush
  ) {
    flushDeferredWorldOrderMirrors(state);
  }
  compactRealtimeAuditOverflow(state, state.commitSeq);
  if (!yielded) {
    state.nowMs = targetMs;
  }
  if (verifyState) {
    assertFullMarketState(state, {
      reuseVerifiedArchives,
    });
  } else {
    verifiedAccountAuthoritySeals.set(
      state,
      accountAuthoritySeal(state),
    );
  }
  return state;
}

/** Advances to the next visible 3,000ms quote boundary. */
export function stepQuoteFrame(state) {
  const targetMs =
    (Math.floor(state.nowMs / QUOTE_FRAME_MS) + 1) * QUOTE_FRAME_MS;
  advanceTo(state, targetMs);
  return state.quoteFrames.at(-1);
}

function publicTradeSnapshot(trade) {
  const playerSide =
    trade.selfTrade &&
    trade.buyerId === 'player' &&
    trade.sellerId === 'player'
      ? trade.side
      : trade.buyerId === 'player'
      ? 'buy'
      : trade.sellerId === 'player'
        ? 'sell'
        : null;
  return {
    id: trade.id,
    symbol: trade.symbol,
    side: trade.side,
    priceTicks: trade.priceTicks,
    quantity: trade.quantity,
    virtualMs: trade.virtualMs,
    source: trade.source,
    selfTrade: trade.selfTrade === true,
    ...(playerSide ? { playerSide } : {}),
    commitSeq: trade.commitSeq,
  };
}

function publicFlowTradeSnapshot(record) {
  return {
    id: record.tradeId,
    symbol: record.symbol,
    side: record.side,
    priceTicks: record.priceTicks,
    quantity: record.quantity,
    virtualMs: record.virtualMs,
    source: 'realtime_order_book',
    selfTrade: record.selfTrade === true,
    ...(record.playerSide
      ? { playerSide: record.playerSide }
      : {}),
    commitSeq: record.commitSeq,
  };
}

function publicTradeRetention(state, visibleTrades = null) {
  const retained = Array.isArray(visibleTrades)
    ? visibleTrades
    : state.world.market.trades
        .filter(
          (trade) => trade.source === 'realtime_order_book',
        )
        .slice(-MAX_VISIBLE_TRADES);
  const firstTrade = retained[0] ?? null;
  return {
    schema: 'lzy_public_trade_retention_v1',
    authorityCommitSeq: state.commitSeq,
    empty: firstTrade === null,
    firstTrade:
      firstTrade === null
        ? null
        : {
            id: firstTrade.id,
            virtualMs: firstTrade.virtualMs,
          },
  };
}

function publicOrderSnapshot(order) {
  return {
    id: order.id,
    ownerId: order.ownerId,
    brokerId: order.brokerId,
    symbol: order.symbol,
    side: order.side,
    type: order.type,
    priceTicks: order.priceTicks,
    originalQty: order.originalQty,
    remainingQty: order.remainingQty,
    submittedMs: order.submittedMs,
    tif: order.tif,
    status: order.status,
    reservedCashCents: order.reservedCashCents,
    reservedUnits: order.reservedUnits,
    filledGrossCents: order.filledGrossCents,
    selfTradeGrossCents:
      order.selfTradeGrossCents,
    chargedFeeCents: order.chargedFeeCents,
    ...(order.automationKind
      ? {
          automationKind: order.automationKind,
          automationDecisionId: order.automationDecisionId,
          automationStrategyIds: [...order.automationStrategyIds],
        }
      : {}),
    commitSeq: order.commitSeq,
  };
}

function publicPlayerRoleAutomationSnapshot(state) {
  const runtime = state.playerRoleAutomation;
  return {
    schemaVersion: runtime.schemaVersion,
    kind: runtime.kind,
    configRevision: runtime.configRevision,
    nextDecisionAtMs: runtime.nextDecisionAtMs,
    lastDecisionAtMs: runtime.lastDecisionAtMs,
    totalDecisions: runtime.totalDecisions,
    totalOrderAttempts: runtime.totalOrderAttempts,
    totalFilledQuantity: runtime.totalFilledQuantity,
    recentDecisions: runtime.recentDecisions.map((decision) => ({
      ...decision,
      strategyIds: [...decision.strategyIds],
    })),
  };
}

function publicQuantityBucket(quantity) {
  const units = Math.max(0, Math.trunc(Number(quantity) || 0));
  if (units <= 10) return 'micro';
  if (units <= 100) return 'small';
  if (units <= 1_000) return 'medium';
  if (units <= 10_000) return 'large';
  return 'block';
}

function publicUrgencyBucket(action) {
  if (action.orderType === 'market') return 'aggressive';
  if (action.tif === 'IOC') return 'immediate';
  return 'resting';
}

function publicAgentEcologySnapshot(state) {
  const publishThroughMs =
    Math.floor(
      Math.max(0, state.nowMs - QUOTE_FRAME_MS) /
        QUOTE_FRAME_MS,
    ) * QUOTE_FRAME_MS;
  const aggregates = new Map();
  for (const activity of state.agentEcology.recentActivity ?? []) {
    const windowStartMs =
      Math.floor(activity.virtualMs / QUOTE_FRAME_MS) *
      QUOTE_FRAME_MS;
    const windowEndMs = windowStartMs + QUOTE_FRAME_MS;
    if (windowEndMs > publishThroughMs) continue;
    for (const action of activity.publicActions ?? []) {
      const urgency = publicUrgencyBucket(action);
      const quantityBucket = publicQuantityBucket(action.quantity);
      const key = [
        windowStartMs,
        action.symbol,
        action.side,
        urgency,
        quantityBucket,
      ].join(':');
      let aggregate = aggregates.get(key);
      if (!aggregate) {
        aggregate = {
          windowStartMs,
          windowEndMs,
          symbol: action.symbol,
          side: action.side,
          urgency,
          quantityBucket,
          actionCount: 0,
          participants: new Set(),
        };
        aggregates.set(key, aggregate);
      }
      aggregate.actionCount += 1;
      aggregate.participants.add(activity.agentId);
    }
  }
  const actionAggregates = [...aggregates.values()]
    .map(({ participants, ...aggregate }) => ({
      ...aggregate,
      participantCount: participants.size,
    }))
    .sort(
      (left, right) =>
        left.windowStartMs - right.windowStartMs ||
        left.symbol.localeCompare(right.symbol) ||
        left.side.localeCompare(right.side) ||
        left.urgency.localeCompare(right.urgency) ||
        left.quantityBucket.localeCompare(right.quantityBucket),
    );
  return {
    publication: PUBLIC_AGENT_AGGREGATE_SCHEMA,
    enabled: state.agentEcology.enabled,
    lagFrames: 1,
    frameMs: QUOTE_FRAME_MS,
    publishedThroughWindowEndMs: publishThroughMs,
    actionAggregates,
  };
}

function publicMarketDataProjection(world) {
  const marketData = cloneJson(getMarketDataProjection(world));
  if (marketData.viewer) delete marketData.viewer.accountId;
  return marketData;
}

function publicQuoteFrameSnapshot(frame) {
  const publication = cloneJson(frame);
  if (publication.marketData?.viewer) {
    delete publication.marketData.viewer.accountId;
  }
  return publication;
}

function publicCapacityProjection(state) {
  const {
    accountId: _accountId,
    agentId: _agentId,
    ...capacity
  } = evaluateCapacity(state, 'player');
  return capacity;
}

const FUNDAMENTAL_SOURCE_METRICS = Object.freeze([
  Object.freeze({
    metric: 'deliveryReliabilityBps',
    relationship: 'supplier',
  }),
  Object.freeze({
    metric: 'demandHealthBps',
    relationship: 'customer',
  }),
  Object.freeze({
    metric: 'creditHealthBps',
    relationship: 'credit',
  }),
  Object.freeze({
    metric: 'investmentPerformanceBps',
    relationship: 'investment',
  }),
]);

function fundamentalHolderAuthority(state) {
  const accounts = Object.values(state.accounts)
    .filter((account) =>
      Object.values(account.holdings ?? {}).some(
        (quantity) => quantity > 0,
      ),
    )
    .sort((left, right) =>
      left.id.localeCompare(right.id),
    );
  const publicHolderIdByAccountId = new Map(
    accounts.map((account, index) => [
      account.id,
      `public_holder_${String(index + 1).padStart(2, '0')}`,
    ]),
  );
  return {
    accounts,
    publicHolderIdByAccountId,
    shareholderProfiles: accounts.map((account) => ({
      holderId: publicHolderIdByAccountId.get(account.id),
      displayName: shareholderName(state, account),
      linkEligible:
        Object.values(account.holdings ?? {}).filter(
          (quantity) => quantity > 0,
        ).length >= 2,
    })),
  };
}

function fundamentalCompaniesFrame(
  state,
  holderAuthority,
) {
  const securityByIssuerId = new Map(
    Object.values(state.world.market.securities).map(
      (security) => [security.issuerId, security],
    ),
  );
  return Object.values(state.world.entities.companies)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((company) => {
      const security = securityByIssuerId.get(company.id);
      const holders = Object.fromEntries(
        holderAuthority.accounts
          .map((account) => [
            holderAuthority.publicHolderIdByAccountId.get(
              account.id,
            ),
            account.holdings[security.symbol] ?? 0,
          ])
          .filter(([, quantity]) => quantity > 0),
      );
      const issuedUnits = Math.trunc(
        Number(security.outstandingUnits),
      );
      const floatUnits = Math.trunc(
        Number(
          security.floatUnits ?? security.floatShares,
        ),
      );
      return {
        id: company.id,
        symbol: security.symbol,
        metrics: cloneJson(
          state.world.economy.businessNetwork
            .lastSignalsByCompany[company.id] ?? {},
        ),
        ownership: {
          issuedUnits,
          registeredUnits: Object.values(holders).reduce(
            (sum, quantity) => sum + quantity,
            0,
          ),
          floatUnits,
          lockedUnits: issuedUnits - floatUnits,
          holders,
        },
      };
    });
}

function fundamentalEdgesFrame(network) {
  const activeEdges = network.edges
    .map((edge) => ({
      id: edge.id,
      fromCompanyId: edge.fromCompanyId,
      toCompanyId: edge.toCompanyId,
      relationship: edge.relationship,
      weightBps: edge.weightBps,
      maxImpactBps: edge.maxImpactBps,
      lagDays: edge.lagDays,
      validFromDay: edge.validFromDay ?? 0,
      validToDay:
        edge.validToDay ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort(
      (left, right) =>
        left.fromCompanyId.localeCompare(
          right.fromCompanyId,
        ) ||
        right.maxImpactBps * right.weightBps -
          left.maxImpactBps * left.weightBps ||
        left.id.localeCompare(right.id),
    );
  const retainedBySource = new Map();
  const retained = [];
  for (const edge of activeEdges) {
    const count =
      retainedBySource.get(edge.fromCompanyId) ?? 0;
    if (count >= 8) continue;
    retainedBySource.set(edge.fromCompanyId, count + 1);
    retained.push(edge);
  }
  return retained.sort(
    (left, right) => left.id.localeCompare(right.id),
  );
}

function recentSettledBusinessFacts(network, edges) {
  const edgesBySourceAndRelationship = new Map();
  for (const edge of edges) {
    const key =
      `${edge.fromCompanyId}:${edge.relationship}`;
    edgesBySourceAndRelationship.set(
      key,
      (edgesBySourceAndRelationship.get(key) ?? 0) + 1,
    );
  }
  const candidates = [];
  for (const [companyId, window] of Object.entries(
    network.metricWindowByCompany,
  ).sort(([left], [right]) => left.localeCompare(right))) {
    if (!Array.isArray(window) || window.length < 2) continue;
    const previous = window.at(-2);
    const latest = window.at(-1);
    for (const source of FUNDAMENTAL_SOURCE_METRICS) {
      const deltaBps =
        latest[source.metric] - previous[source.metric];
      const matchingEdgeCount =
        edgesBySourceAndRelationship.get(
          `${companyId}:${source.relationship}`,
        ) ?? 0;
      if (
        !Number.isSafeInteger(deltaBps) ||
        deltaBps === 0 ||
        matchingEdgeCount === 0
      ) {
        continue;
      }
      candidates.push({
        fact: {
          id: `${latest.sourceFactId}:${source.metric}`,
          sourceFactId: latest.sourceFactId,
          status: 'settled',
          authority: 'world_company_operating_ledger',
          kind: 'operating_metric_change',
          companyId,
          metric: source.metric,
          deltaBps,
          settledDay: latest.tick,
        },
        matchingEdgeCount,
      });
    }
  }
  let projectedCandidateCount = 0;
  const facts = [];
  for (const candidate of candidates) {
    if (
      facts.length >= 96 ||
      projectedCandidateCount +
          candidate.matchingEdgeCount >
        64
    ) {
      continue;
    }
    facts.push(candidate.fact);
    projectedCandidateCount +=
      candidate.matchingEdgeCount;
  }
  return facts;
}

function publicFundamentalNetworkProjection(state) {
  const network = state.world.economy?.businessNetwork;
  if (
    !network ||
    network.authority !== 'world_company_operating_ledger'
  ) {
    return {
      schemaVersion:
        'lzy_fundamental_relationship_network_projection_v1',
      authority: 'read_only_projection',
      integrationStatus: 'production_integrated_read_only',
      status: 'blocked',
      nodes: [],
      relationships: [],
      causalCandidates: {
        status: 'blocked',
        candidates: [],
        reasonCodes: ['SETTLED_BUSINESS_NETWORK_UNAVAILABLE'],
      },
      reasonCodes: ['SETTLED_BUSINESS_NETWORK_UNAVAILABLE'],
      productionIntegration: {
        status: 'blocked',
        applicationAuthority:
          'existing_world_business_network_only',
      },
    };
  }
  const nowDay = state.world.world.tick;
  const holderAuthority = fundamentalHolderAuthority(state);
  const edges = fundamentalEdgesFrame(network);
  const frame = {
    schemaVersion: 'lzy_bounded_settled_fact_frame_v1',
    worldSeed: state.world.world.seed,
    observedCommitSeq: state.commitSeq,
    nowDay,
    ruleEpoch: network.contractVersion,
    companies: fundamentalCompaniesFrame(
      state,
      holderAuthority,
    ),
    recentSettledFacts:
      recentSettledBusinessFacts(network, edges),
    edges,
    appliedCandidateIds: [],
    shareholderProfiles:
      holderAuthority.shareholderProfiles,
  };
  const projection =
    projectFundamentalRelationshipNetwork(frame);
  return {
    ...projection,
    integrationStatus: 'production_integrated_read_only',
    sourceModuleIntegrationStatus:
      projection.integrationStatus,
    productionIntegration: {
      status: 'projected_from_settled_business_network',
      inputAuthority: network.authority,
      applicationAuthority:
        'existing_world_business_network_only',
      hotPathPolicy:
        'full_snapshot_only_fixed_active_catalog',
      marketObservationsConsumed: false,
      sourceEdgeCount: network.edges.length,
      projectedEdgeCount: edges.length,
      omittedColdEdgeCount:
        network.edges.length - edges.length,
      activeEdgeSelection:
        'top_8_per_source_by_weighted_max_impact',
    },
  };
}

/**
 * Returns a read-only market view derived from authoritative orders.
 * Every normal caller receives the same versioned player-facing projection.
 * The authoritative replay checkpoint is available only through
 * canonicalMarketState and the Worker's explicit SAVE_BARRIER.
 */
export function snapshotMarket(
  state,
  {
    framePublication = false,
    transportOwned = false,
  } = {},
) {
  if (typeof framePublication !== 'boolean') {
    throw new TypeError('framePublication must be a boolean');
  }
  if (typeof transportOwned !== 'boolean') {
    throw new TypeError('transportOwned must be a boolean');
  }
  const activeOrders = Object.values(state.books)
    .flatMap((book) =>
      activeOrdersForOwner(book, 'player'))
    .sort((left, right) =>
      left.submittedMs - right.submittedMs ||
      left.sequence - right.sequence ||
      left.id.localeCompare(right.id),
    );
  const visibleTrades = state.world.market.trades
    .filter((trade) => trade.source === 'realtime_order_book')
    .slice(-MAX_VISIBLE_TRADES);
  const tradesBySymbol = framePublication
    ? null
    : Object.fromEntries(
        Object.entries(
          publicTradeTailsBySymbol(state),
        ).map(([symbol, records]) => [
          symbol,
          records.map(publicFlowTradeSnapshot),
        ]),
      );
  const marketData = publicMarketDataProjection(state.world);
  const symbols = Object.fromEntries(
    Object.keys(state.books).map((symbol) => [
      symbol,
      symbolSnapshot(state, symbol, {
        includeIntraday: true,
        framePublication,
        includeStableFacts: !framePublication,
        marketData,
      }),
    ]),
  );
  const player = state.accounts.player;
  const projection = {
    publication: PUBLIC_MARKET_SCHEMA,
    publicationMode: framePublication ? 'quote_frame' : 'snapshot',
    nowMs: state.nowMs,
    marketClockOffsetMs: MARKET_CLOCK_ORIGIN_OFFSET_MS,
    worldTick: state.world.world.tick,
    calendar: state.world.world.calendar,
    commitSeq: state.commitSeq,
    marketData,
    symbols,
    accounts: {
      player: {
        ...player,
        portfolio: accountPortfolioProjection(state, player),
      },
    },
    activeOrders: activeOrders.map(publicOrderSnapshot),
    trades: visibleTrades.map(publicTradeSnapshot),
    tradeRetention: publicTradeRetention(state, visibleTrades),
    agentEcology: publicAgentEcologySnapshot(state),
    playerRoleAutomation: publicPlayerRoleAutomationSnapshot(state),
    capacity: {
      player: publicCapacityProjection(state),
    },
    quoteFrames: (
      framePublication
        ? state.quoteFrames.slice(-1)
        : state.quoteFrames
    ).map(
      framePublication
        ? compactHistoricalQuoteFrame
        : publicQuoteFrameSnapshot,
    ),
    ...(framePublication
      ? {}
      : {
          tradesBySymbol,
          barArchives: state.barArchives,
          fundamentalNetwork:
            publicFundamentalNetworkProjection(state),
        }),
  };
  // A Worker immediately hands an owned frame projection to structured-clone
  // transport on the same task turn. Every mutable collection assembled
  // above is already a projection, so an additional JSON round trip would
  // only duplicate the exact snapshot before postMessage duplicates it again.
  return transportOwned
    ? projection
    : cloneJson(projection);
}

/**
 * Builds the bounded acknowledgement projection for one stock command.
 * READY, SAVE_BARRIER and explicit resync remain the only full snapshots;
 * ordinary submit/cancel acknowledgements carry this same-commit target patch.
 */
export function snapshotMarketCommandPatch(
  state,
  { symbol } = {},
) {
  if (
    typeof symbol !== 'string' ||
    !Object.hasOwn(state?.books ?? {}, symbol)
  ) {
    throw new RangeError('A listed command-patch symbol is required.');
  }
  const marketData = publicMarketDataProjection(state.world);
  const player = state.accounts.player;
  const activeOrders = activeOrdersForOwner(
    state.books[symbol],
    'player',
  )
    .sort(
      (left, right) =>
        left.submittedMs - right.submittedMs ||
        left.sequence - right.sequence ||
        left.id.localeCompare(right.id),
    )
    .map(publicOrderSnapshot);
  const tradeDeltas = state.world.market.trades
    .filter(
      (trade) =>
        trade.source === 'realtime_order_book' &&
        trade.symbol === symbol &&
        trade.commitSeq === state.commitSeq,
    )
    .map(publicTradeSnapshot);
  const symbolPatch = symbolSnapshot(state, symbol, {
    // Intraday history is carried by ordered quote/Level-2 publications.
    // A stock command changes the target book/account and may append only
    // the current trade delta; retransmitting the complete six-hour chart
    // on every submit/cancel creates an avoidable 16× feedback loop.
    includeIntraday: false,
    framePublication: true,
    includeUltraDelta: true,
    includeLevel2Depth: false,
    includeStableFacts: false,
    marketData,
  });
  if (symbolPatch.frameBar === null) {
    delete symbolPatch.frameBar;
  }
  return cloneJson({
    publication: PUBLIC_MARKET_COMMAND_PATCH_SCHEMA,
    publicationMode: 'command_delta',
    nowMs: state.nowMs,
    marketClockOffsetMs: MARKET_CLOCK_ORIGIN_OFFSET_MS,
    worldTick: state.world.world.tick,
    calendar: state.world.world.calendar,
    commitSeq: state.commitSeq,
    symbols: {
      [symbol]: symbolPatch,
    },
    accounts: {
      player: {
        ...player,
        portfolio: accountPortfolioProjection(state, player),
      },
    },
    activeOrders,
    tradeDeltas,
    tradeRetention: publicTradeRetention(state),
    playerRoleAutomation: publicPlayerRoleAutomationSnapshot(state),
    capacity: {
      player: publicCapacityProjection(state),
    },
  });
}

/**
 * Returns an ephemeral Level-2 transport projection. It never participates in
 * checkpoint authority: the canonical order books remain the sole source and
 * a READY/SAVE_BARRIER snapshot can always rebuild this view.
 */
export function snapshotRealtimeLevel2(
  state,
  {
    afterCommitSeq = -1,
    afterVirtualMs = null,
    symbols: requestedSymbols = null,
  } = {},
) {
  if (
    !Number.isSafeInteger(afterCommitSeq) ||
    afterCommitSeq < -1
  ) {
    throw new RangeError('afterCommitSeq must be an integer at least -1');
  }
  if (
    afterVirtualMs !== null &&
    (
      !Number.isSafeInteger(afterVirtualMs) ||
      afterVirtualMs < -1 ||
      afterVirtualMs > state.nowMs
    )
  ) {
    throw new RangeError(
      'afterVirtualMs must be null or an integer between -1 and nowMs',
    );
  }
  const marketData = publicMarketDataProjection(state.world);
  if (
    marketData.viewer.entitlements?.L2_DEPTH_100?.status !== 'active'
  ) {
    return null;
  }
  if (
    requestedSymbols !== null &&
    (
      !Array.isArray(requestedSymbols) ||
      requestedSymbols.some((symbol) => typeof symbol !== 'string')
    )
  ) {
    throw new TypeError('symbols must be an array of security ids');
  }
  const requestedSet = Array.isArray(requestedSymbols)
    ? new Set(requestedSymbols)
    : null;
  const symbols = Object.keys(state.books).filter((symbol) => {
    const board = state.world.market.securities[symbol]?.board;
    return (
      (board === 'star' || board === 'chinext') &&
      (!requestedSet || requestedSet.has(symbol))
    );
  });
  if (symbols.length === 0) return null;
  const symbolSet = new Set(symbols);
  const activeOrders = symbols
    .flatMap((symbol) =>
      activeOrdersForOwner(
        state.books[symbol],
        'player',
      ))
    .sort(
      (left, right) =>
        left.submittedMs - right.submittedMs ||
        left.sequence - right.sequence ||
        left.id.localeCompare(right.id),
    )
    .map(publicOrderSnapshot);
  const tradeDeltas = state.world.market.trades
    .filter(
      (trade) =>
        trade.source === 'realtime_order_book' &&
        symbolSet.has(trade.symbol) &&
        trade.commitSeq > afterCommitSeq,
    )
    .slice(-MAX_VISIBLE_TRADES)
    .map(publicTradeSnapshot);
  return cloneJson({
    publication: 'lzy_market_level2_v1',
    publicationMode: 'level2_delta',
    nowMs: state.nowMs,
    marketClockOffsetMs: MARKET_CLOCK_ORIGIN_OFFSET_MS,
    worldTick: state.world.world.tick,
    commitSeq: state.commitSeq,
    symbols: Object.fromEntries(
      symbols.map((symbol) => [
        symbol,
        symbolSnapshot(state, symbol, {
          includeIntraday: false,
          framePublication: true,
          includeUltraDelta: true,
          ultraDeltaAfterMs: afterVirtualMs,
          includeLevel2Depth: true,
          includeStableFacts: false,
          marketData,
        }),
      ]),
    ),
    activeOrders,
    tradeDeltas,
    tradeRetention: publicTradeRetention(state),
  });
}

/** Returns the complete deterministic checkpoint used for replay comparison. */
export function canonicalMarketState(state) {
  for (const book of Object.values(state.books)) {
    compactOrderBookQueues(book);
  }
  // A checkpoint is a complete publication barrier. Sparse command commits
  // preserve prior mirror object identities between frames, so materialize the
  // canonical book/order ordering before serializing the save authority.
  syncWorldMarketMirrors(state, {
    synchronizeDerivatives: true,
  });
  const checkpoint = normalizeJsonSignedZerosInPlace(
    cloneStructured({
      marketRuleVersion: state.marketRuleVersion,
      world: state.world,
      nowMs: state.nowMs,
      derivativeAuthorityOriginMs:
        state.derivativeAuthorityOriginMs,
      lastWorldDaySettlementMs:
        state.lastWorldDaySettlementMs,
      quoteFrameMs: state.quoteFrameMs,
      worldDayMs: state.worldDayMs,
      phasePriority: state.phasePriority,
      commitSeq: state.commitSeq,
      nextEventSequence: state.nextEventSequence,
      nextOrderSequence: state.nextOrderSequence,
      nextRecordSequence: state.nextRecordSequence,
      eventQueue: state.eventQueue,
      books: state.books,
      barSeries: state.barSeries,
      barArchives: state.barArchives,
      accounts: state.accounts,
      turnoverTruthBySymbol:
        state.turnoverTruthBySymbol,
      turnoverTruthIntegrationBySymbol:
        state.turnoverTruthIntegrationBySymbol,
      exchangeFeePoolCents: state.exchangeFeePoolCents,
      orderArchive: state.orderArchive,
      realtimeAuditArchive: state.realtimeAuditArchive,
      derivativeCadenceReceiptArchive:
        state.derivativeCadenceReceiptArchive,
      playerRoleAutomation:
        state.playerRoleAutomation,
      agentEcology: state.agentEcology,
      quoteFrames: state.quoteFrames,
      receipts: state.receipts,
    }),
  );
  return checkpoint;
}

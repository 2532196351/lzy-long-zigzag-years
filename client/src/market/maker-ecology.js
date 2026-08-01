/**
 * LZY maker ecology research kernel.
 *
 * This module is deliberately isolated from the authoritative simulator. It
 * supplies a deterministic, serializable market-ecology fixture and a bounded
 * intent adapter. The production simulator must remain the sole authority for
 * event sequencing, order ids, matching, settlement and public quote frames.
 */

export const MAKER_ECOLOGY_VERSION = 'lzy-maker-ecology-v1.2.0';
export const VALUATION_OBSERVATION_VERSION =
  'lzy-maker-valuation-observation-v1.1.0';
export const MAKER_POLICY_STATE_VERSION =
  'lzy-maker-policy-state-v1.0.0';
export const MAKER_POLICY_FRAME_VERSION =
  'lzy-maker-policy-frame-v1.0.0';
export const QUOTE_FRAME_MS = 3_000;
export const SUPPORTED_SPEEDS = Object.freeze([1, 4, 16]);

const SCHEMA_VERSION = MAKER_ECOLOGY_VERSION;
const MARKOUT_DELAY_MS = 500;
const MAX_HISTORY = 2_000;
const MAX_QUOTE_FRAMES = 720;
const MAX_UNIQUE_TRADE_PRICES = 2_000;
const ALLOWED_EVENT_TYPES = new Set([
  'valuation_observation',
  'markout',
  'flow_arrival',
  'expire_order',
  'maker_apply',
  'maker_decision',
  'quote_frame',
]);
const EVENT_PRIORITY = Object.freeze({
  VALUATION: 10,
  MARKOUT: 20,
  FLOW: 30,
  EXPIRE: 35,
  MAKER_APPLY: 40,
  MAKER_DECISION: 50,
  QUOTE_FRAME: 90,
});
const EVENT_PRIORITY_BY_TYPE = Object.freeze({
  valuation_observation: EVENT_PRIORITY.VALUATION,
  markout: EVENT_PRIORITY.MARKOUT,
  flow_arrival: EVENT_PRIORITY.FLOW,
  expire_order: EVENT_PRIORITY.EXPIRE,
  maker_apply: EVENT_PRIORITY.MAKER_APPLY,
  maker_decision: EVENT_PRIORITY.MAKER_DECISION,
  quote_frame: EVENT_PRIORITY.QUOTE_FRAME,
});
const CHECKPOINT_INTEGRITY_ALGORITHM = 'fnv-mix32-json-v1';

const VALUATION_DRIVER_RULES = Object.freeze({
  earnings_per_share_improvement: { sign: 1 },
  earnings_per_share_deterioration: { sign: -1 },
  book_value_per_share_improvement: { sign: 1 },
  book_value_per_share_deterioration: { sign: -1 },
  free_cash_flow_per_share_improvement: { sign: 1 },
  free_cash_flow_per_share_deterioration: { sign: -1 },
  share_dilution: { sign: -1 },
  share_repurchase: { sign: 1 },
  net_debt_per_share_increase: { sign: -1 },
  net_debt_per_share_reduction: { sign: 1 },
  financing_pressure: { sign: -1 },
  financing_relief: { sign: 1 },
  pe_multiple_expansion: { sign: 1 },
  pe_multiple_compression: { sign: -1 },
  pb_multiple_expansion: { sign: 1 },
  pb_multiple_compression: { sign: -1 },
  growth_persistence_improvement: { sign: 1 },
  growth_persistence_deterioration: { sign: -1 },
  world_slow_variable_tailwind: { sign: 1 },
  world_slow_variable_headwind: { sign: -1 },
});
const VALUATION_BASIS_COMPONENTS = new Set([
  'earnings_per_share_multiple',
  'book_value_per_share_multiple',
  'free_cash_flow_per_share_multiple',
  'net_debt_per_share_discount',
  'diluted_share_count',
  'growth_persistence',
  'world_slow_variables',
]);

export const REGIME_PRESETS = deepFreeze({
  normal: {
    id: 'normal',
    volatilityScaleBps: 10_000,
    jumpRiskBps: 500,
    spreadMultiplierBps: 10_000,
    quoteSizeMultiplierBps: 10_000,
    arrivalMultiplierBps: 10_000,
    commonStressBps: 700,
    momentumResponseBps: 500,
    valuationReversionBps: 2_500,
  },
  trend: {
    id: 'trend',
    volatilityScaleBps: 14_000,
    jumpRiskBps: 1_800,
    spreadMultiplierBps: 11_500,
    quoteSizeMultiplierBps: 9_000,
    arrivalMultiplierBps: 13_000,
    commonStressBps: 2_100,
    momentumResponseBps: 8_500,
    valuationReversionBps: 1_000,
  },
  mean_reversion: {
    id: 'mean_reversion',
    volatilityScaleBps: 12_000,
    jumpRiskBps: 1_000,
    spreadMultiplierBps: 10_500,
    quoteSizeMultiplierBps: 10_500,
    arrivalMultiplierBps: 11_000,
    commonStressBps: 1_200,
    momentumResponseBps: 1_000,
    valuationReversionBps: 9_000,
  },
  volatility_burst: {
    id: 'volatility_burst',
    volatilityScaleBps: 30_000,
    jumpRiskBps: 8_500,
    spreadMultiplierBps: 22_000,
    quoteSizeMultiplierBps: 4_800,
    arrivalMultiplierBps: 17_000,
    commonStressBps: 7_300,
    momentumResponseBps: 4_500,
    valuationReversionBps: 1_800,
  },
  liquidity_drought: {
    id: 'liquidity_drought',
    volatilityScaleBps: 22_000,
    jumpRiskBps: 6_500,
    spreadMultiplierBps: 28_000,
    quoteSizeMultiplierBps: 2_500,
    arrivalMultiplierBps: 9_000,
    commonStressBps: 8_600,
    momentumResponseBps: 2_000,
    valuationReversionBps: 1_500,
  },
  crowding: {
    id: 'crowding',
    volatilityScaleBps: 18_000,
    jumpRiskBps: 4_500,
    spreadMultiplierBps: 16_000,
    quoteSizeMultiplierBps: 5_500,
    arrivalMultiplierBps: 19_000,
    commonStressBps: 6_200,
    momentumResponseBps: 7_000,
    valuationReversionBps: 1_200,
  },
  recovery: {
    id: 'recovery',
    volatilityScaleBps: 15_000,
    jumpRiskBps: 2_000,
    spreadMultiplierBps: 12_000,
    quoteSizeMultiplierBps: 8_000,
    arrivalMultiplierBps: 12_000,
    commonStressBps: 2_600,
    momentumResponseBps: 1_800,
    valuationReversionBps: 7_500,
  },
});

const MAKER_TEMPLATES = deepFreeze({
  maker_orchid: {
    id: 'maker_orchid',
    name: '兰序电子做市',
    speedClass: 'ultra_fast',
    latencyMs: 12,
    informationDelayMs: 25,
    quoteCadenceMs: 130,
    cadenceJitterMs: 35,
    riskAversionBps: 330,
    adverseSelectionBps: 640,
    valuationWeightBps: 3_600,
    baseHalfSpreadTicks: 1,
    baseOrderUnits: 18,
    maxLevels: 5,
    maxCancelsPerSecond: 24,
    cashCents: 2_400_000,
    holdings: 500,
    creditLimitCents: 1_100_000,
  },
  maker_cedar: {
    id: 'maker_cedar',
    name: '雪松稳态做市',
    speedClass: 'slow',
    latencyMs: 185,
    informationDelayMs: 340,
    quoteCadenceMs: 430,
    cadenceJitterMs: 110,
    riskAversionBps: 520,
    adverseSelectionBps: 520,
    valuationWeightBps: 2_400,
    baseHalfSpreadTicks: 1,
    baseOrderUnits: 28,
    maxLevels: 4,
    maxCancelsPerSecond: 2,
    cashCents: 2_050_000,
    holdings: 560,
    creditLimitCents: 850_000,
  },
  maker_jade: {
    id: 'maker_jade',
    name: '碧衡库存做市',
    speedClass: 'balanced',
    latencyMs: 58,
    informationDelayMs: 115,
    quoteCadenceMs: 235,
    cadenceJitterMs: 70,
    riskAversionBps: 710,
    adverseSelectionBps: 430,
    valuationWeightBps: 3_000,
    baseHalfSpreadTicks: 2,
    baseOrderUnits: 23,
    maxLevels: 5,
    maxCancelsPerSecond: 10,
    cashCents: 2_200_000,
    holdings: 470,
    creditLimitCents: 700_000,
  },
  maker_sable: {
    id: 'maker_sable',
    name: '玄沙资本做市',
    speedClass: 'capital_heavy',
    latencyMs: 92,
    informationDelayMs: 185,
    quoteCadenceMs: 310,
    cadenceJitterMs: 90,
    riskAversionBps: 420,
    adverseSelectionBps: 760,
    valuationWeightBps: 1_900,
    baseHalfSpreadTicks: 2,
    baseOrderUnits: 34,
    maxLevels: 4,
    maxCancelsPerSecond: 7,
    cashCents: 2_850_000,
    holdings: 620,
    creditLimitCents: 1_350_000,
  },
});

const FLOW_TEMPLATES = deepFreeze({
  retail_noise: {
    id: 'retail_noise',
    behavior: 'noise',
    baseIntervalMs: 420,
    maxOrderUnits: 10,
    aggressiveBps: 5_200,
    patienceMs: 2_800,
    cashCents: 650_000,
    holdings: 150,
    initialCostBasisTicks: 2_000,
  },
  retail_value: {
    id: 'retail_value',
    behavior: 'value',
    baseIntervalMs: 650,
    maxOrderUnits: 14,
    aggressiveBps: 3_000,
    patienceMs: 5_500,
    cashCents: 720_000,
    holdings: 170,
    initialCostBasisTicks: 2_020,
  },
  retail_momentum: {
    id: 'retail_momentum',
    behavior: 'momentum',
    baseIntervalMs: 300,
    maxOrderUnits: 12,
    aggressiveBps: 8_400,
    patienceMs: 1_600,
    cashCents: 760_000,
    holdings: 155,
    initialCostBasisTicks: 1_980,
  },
  retail_disposition: {
    id: 'retail_disposition',
    behavior: 'disposition',
    baseIntervalMs: 610,
    maxOrderUnits: 9,
    aggressiveBps: 4_500,
    patienceMs: 4_200,
    cashCents: 600_000,
    holdings: 210,
    initialCostBasisTicks: 1_900,
  },
  retail_liquidity: {
    id: 'retail_liquidity',
    behavior: 'liquidity_need',
    baseIntervalMs: 470,
    maxOrderUnits: 16,
    aggressiveBps: 6_800,
    patienceMs: 2_100,
    cashCents: 680_000,
    holdings: 190,
    initialCostBasisTicks: 2_000,
  },
  fast_adverse_taker: {
    id: 'fast_adverse_taker',
    behavior: 'latency_arbitrage',
    baseIntervalMs: 210,
    maxOrderUnits: 11,
    aggressiveBps: 10_000,
    patienceMs: 0,
    cashCents: 1_100_000,
    holdings: 260,
    initialCostBasisTicks: 2_000,
  },
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function safeAdd(left, right, label = 'integer') {
  const value = left + right;
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} exceeds the safe integer range.`);
  }
  return value;
}

function safeRatioBps(numerator, denominator, label = 'ratio') {
  if (
    !isNonNegativeInteger(numerator) ||
    !isPositiveInteger(denominator)
  ) {
    throw new Error(`Invalid ${label} inputs.`);
  }
  const rounded =
    (BigInt(numerator) * 10_000n +
      BigInt(Math.floor(denominator / 2))) /
    BigInt(denominator);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds the safe integer range.`);
  }
  return Number(rounded);
}

function hash32(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return hash >>> 0;
}

function stableUnit(seed, ...parts) {
  return hash32([seed, ...parts].join('|')) / 0x1_0000_0000;
}

function stableSigned(seed, ...parts) {
  return stableUnit(seed, ...parts) * 2 - 1;
}

function roundScaled(value, bps) {
  return Math.round((value * bps) / 10_000);
}

function rollingMean(values) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

/**
 * Validates and clones the only valuation input accepted by this module.
 *
 * The contract deliberately contains no trade-price-derived fallback. Its
 * center must reconcile exactly to a prior declared estimate plus explicitly
 * signed, source-referenced effects. This structural check does not prove that
 * an upstream fact exists or that its claimed economic magnitude is correct.
 */
export function validateValuationObservation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid valuation observation.');
  }
  const observation = cloneJson(input);
  if (observation?.version !== VALUATION_OBSERVATION_VERSION) {
    throw new Error('Invalid valuation observation version.');
  }
  if (observation.informationScope !== 'public_disclosures_only') {
    throw new Error('Valuation observation must use public disclosures only.');
  }
  if (
    Object.hasOwn(observation, 'trueValueTicks') ||
    Object.hasOwn(observation, 'fundamentalTicks')
  ) {
    throw new Error('Valuation observation cannot claim a hidden true value.');
  }
  assertNonEmptyString(observation.id, 'valuation observation id');
  assertNonEmptyString(observation.symbol, 'valuation observation symbol');
  if (
    !isNonNegativeInteger(observation.asOfMs) ||
    !isNonNegativeInteger(observation.publishedMs) ||
    observation.asOfMs > observation.publishedMs ||
    !isPositiveInteger(observation.priorCenterTicks)
  ) {
    throw new Error('Invalid valuation observation timestamps or prior center.');
  }
  const estimate = observation.estimate;
  if (
    !estimate ||
    !isPositiveInteger(estimate.lowTicks) ||
    !isPositiveInteger(estimate.centerTicks) ||
    !isPositiveInteger(estimate.highTicks) ||
    estimate.lowTicks > estimate.centerTicks ||
    estimate.centerTicks > estimate.highTicks ||
    !isNonNegativeInteger(estimate.confidenceBps) ||
    estimate.confidenceBps > 10_000
  ) {
    throw new Error('Invalid valuation estimate or confidence interval.');
  }
  const basis = observation.valuationBasis;
  if (
    basis?.kind !== 'public_per_share_multi_method' ||
    basis.perShareEconomics !== true ||
    !Array.isArray(basis.components) ||
    basis.components.length === 0 ||
    new Set(basis.components).size !== basis.components.length ||
    basis.components.some(
      (component) => !VALUATION_BASIS_COMPONENTS.has(component),
    ) ||
    !Array.isArray(basis.worldSlowVariableFactIds) ||
    new Set(basis.worldSlowVariableFactIds).size !==
      basis.worldSlowVariableFactIds.length
  ) {
    throw new Error('Invalid public per-share valuation basis.');
  }
  assertNonEmptyString(basis.modelId, 'valuation basis model id');
  assertNonEmptyString(basis.modelVersion, 'valuation basis model version');
  if (
    !Array.isArray(observation.sourceFactIds) ||
    observation.sourceFactIds.length === 0 ||
    new Set(observation.sourceFactIds).size !==
      observation.sourceFactIds.length
  ) {
    throw new Error('Invalid valuation sourceFactIds.');
  }
  for (const factId of observation.sourceFactIds) {
    assertNonEmptyString(factId, 'valuation source fact id');
  }
  if (!Array.isArray(observation.drivers)) {
    throw new Error('valuation drivers must be an array.');
  }
  let driverEffectTicks = 0;
  const citedFactIds = new Set();
  const worldSlowDriverFactIds = new Set();
  for (const [index, driver] of observation.drivers.entries()) {
    const rule = VALUATION_DRIVER_RULES[driver?.kind];
    if (
      !rule ||
      !Number.isSafeInteger(driver.effectTicks) ||
      !isNonNegativeInteger(driver.uncertaintyTicks) ||
      !Array.isArray(driver.factIds) ||
      driver.factIds.length === 0 ||
      new Set(driver.factIds).size !== driver.factIds.length
    ) {
      throw new Error(`Invalid valuation driver ${index}.`);
    }
    if (
      Math.sign(driver.effectTicks) !== rule.sign
    ) {
      throw new Error(`Invalid effect sign for valuation driver ${driver.kind}.`);
    }
    for (const factId of driver.factIds) {
      assertNonEmptyString(factId, 'valuation driver fact id');
      citedFactIds.add(factId);
      if (driver.kind.startsWith('world_slow_variable_')) {
        worldSlowDriverFactIds.add(factId);
      }
    }
    driverEffectTicks = safeAdd(
      driverEffectTicks,
      driver.effectTicks,
      'valuation driver effects',
    );
  }
  if (
    safeAdd(
      observation.priorCenterTicks,
      driverEffectTicks,
      'valuation center',
    ) !== estimate.centerTicks
  ) {
    throw new Error('Valuation center does not reconcile to operating drivers.');
  }
  const source = observation.evidenceSource;
  if (
    source?.kind !== 'game_operating_fact_bundle' ||
    !Array.isArray(source.factRefs) ||
    source.factRefs.length === 0
  ) {
    throw new Error('Invalid valuation evidence source.');
  }
  assertNonEmptyString(source.derivationRuleId, 'valuation derivation rule id');
  assertNonEmptyString(
    source.derivationRuleVersion,
    'valuation derivation rule version',
  );
  const sourceFactIds = new Set();
  for (const [index, fact] of source.factRefs.entries()) {
    if (
      !fact ||
      !isNonNegativeInteger(fact.publishedMs) ||
      fact.publishedMs > observation.publishedMs ||
      fact.visibility !== 'public'
    ) {
      throw new Error(`Invalid public valuation fact reference ${index}.`);
    }
    assertNonEmptyString(fact.factId, 'valuation fact id');
    if (fact.eventId !== undefined && fact.eventId !== null) {
      assertNonEmptyString(fact.eventId, 'valuation fact event id');
    }
    if (sourceFactIds.has(fact.factId)) {
      throw new Error(`Duplicate valuation fact reference ${fact.factId}.`);
    }
    sourceFactIds.add(fact.factId);
  }
  for (const factId of citedFactIds) {
    if (!sourceFactIds.has(factId)) {
      throw new Error(`Valuation driver cites missing public fact ${factId}.`);
    }
  }
  if (
    observation.sourceFactIds.length !== sourceFactIds.size ||
    observation.sourceFactIds.some(
      (factId, index) =>
        factId !== source.factRefs[index]?.factId,
    ) ||
    basis.worldSlowVariableFactIds.some(
      (factId) => !sourceFactIds.has(factId),
    ) ||
    basis.worldSlowVariableFactIds.length !==
      worldSlowDriverFactIds.size ||
    basis.worldSlowVariableFactIds.some(
      (factId) => !worldSlowDriverFactIds.has(factId),
    )
  ) {
    throw new Error('Valuation sourceFactIds do not match the public evidence bundle.');
  }
  return observation;
}

function validateRegimeSchedule(schedule) {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    throw new Error('regimeSchedule must be a non-empty array.');
  }
  let previousEnd = 0;
  return schedule.map((segment, index) => {
    if (
      !isNonNegativeInteger(segment.startMs) ||
      !isPositiveInteger(segment.endMs) ||
      segment.endMs <= segment.startMs ||
      segment.startMs !== previousEnd ||
      !REGIME_PRESETS[segment.regime]
    ) {
      throw new Error(`Invalid regimeSchedule segment ${index}.`);
    }
    previousEnd = segment.endMs;
    return {
      startMs: segment.startMs,
      endMs: segment.endMs,
      regime: segment.regime,
    };
  });
}

function defaultRegimeSchedule() {
  return [
    {
      startMs: 0,
      endMs: Number.MAX_SAFE_INTEGER,
      regime: 'normal',
    },
  ];
}

function currentRegimeId(state, virtualMs = state.nowMs) {
  const segment =
    state.config.regimeSchedule.find(
      (candidate) =>
        virtualMs >= candidate.startMs && virtualMs < candidate.endMs,
    ) ?? state.config.regimeSchedule.at(-1);
  return segment.regime;
}

function currentRegime(state, virtualMs = state.nowMs) {
  return REGIME_PRESETS[currentRegimeId(state, virtualMs)];
}

function scheduleEvent(
  state,
  type,
  scheduledMs,
  priority,
  payload = null,
) {
  if (!isNonNegativeInteger(scheduledMs)) {
    throw new Error(`Invalid event time for ${type}.`);
  }
  const event = {
    id: `meco_evt_${String(state.nextEventSequence).padStart(10, '0')}`,
    sequence: state.nextEventSequence,
    type,
    scheduledMs,
    priority,
    payload,
  };
  state.nextEventSequence += 1;
  state.eventQueue.push(event);
  state.eventQueue.sort(
    (left, right) =>
      left.scheduledMs - right.scheduledMs ||
      left.priority - right.priority ||
      left.sequence - right.sequence,
  );
  return event;
}

function activeOrders(state, predicate = () => true) {
  return Object.values(state.book.orders).filter(
    (order) =>
      (order.status === 'accepted' ||
        order.status === 'partially_filled') &&
      order.remainingQty > 0 &&
      predicate(order),
  );
}

function pruneTerminalOrders(state, maximumTerminalOrders = 96) {
  const terminal = Object.values(state.book.orders)
    .filter(
      (order) =>
        order.status !== 'accepted' &&
        order.status !== 'partially_filled',
    )
    .sort(
      (left, right) =>
        right.bookSequence - left.bookSequence,
    );
  for (const order of terminal.slice(maximumTerminalOrders)) {
    delete state.book.orders[order.id];
    state.archivedOrderCount += 1;
  }
}

function sideComparator(side) {
  return (left, right) => {
    const priceOrder =
      side === 'buy'
        ? right.priceTicks - left.priceTicks
        : left.priceTicks - right.priceTicks;
    return (
      priceOrder ||
      left.bookSequence - right.bookSequence ||
      left.id.localeCompare(right.id)
    );
  };
}

function orderedSide(state, side) {
  return activeOrders(state, (order) => order.side === side).sort(
    sideComparator(side),
  );
}

function aggregateLevels(state, side, limit = 5) {
  const levels = [];
  for (const order of orderedSide(state, side)) {
    let level = levels.find(
      (candidate) => candidate.priceTicks === order.priceTicks,
    );
    if (!level) {
      if (levels.length >= limit) continue;
      level = {
        priceTicks: order.priceTicks,
        quantity: 0,
        orderCount: 0,
      };
      levels.push(level);
    }
    level.quantity += order.remainingQty;
    level.orderCount += 1;
  }
  return levels;
}

function bookView(state) {
  const bids = aggregateLevels(state, 'buy', 10);
  const asks = aggregateLevels(state, 'sell', 10);
  const bestBidTicks = bids[0]?.priceTicks ?? null;
  const bestAskTicks = asks[0]?.priceTicks ?? null;
  const bidDepthUnits = bids
    .slice(0, 5)
    .reduce((total, level) => total + level.quantity, 0);
  const askDepthUnits = asks
    .slice(0, 5)
    .reduce((total, level) => total + level.quantity, 0);
  const denominator = bidDepthUnits + askDepthUnits;
  return {
    bids,
    asks,
    bestBidTicks,
    bestAskTicks,
    bidDepthUnits,
    askDepthUnits,
    totalDepthUnits: bidDepthUnits + askDepthUnits,
    imbalanceBps:
      denominator === 0
        ? 0
        : Math.round(
            ((bidDepthUnits - askDepthUnits) * 10_000) / denominator,
          ),
    spreadTicks:
      bestBidTicks !== null && bestAskTicks !== null
        ? bestAskTicks - bestBidTicks
        : null,
  };
}

function rebuildReservations(state) {
  for (const account of Object.values(state.accounts)) {
    account.reservedBuyCents = 0;
    account.reservedSellUnits = 0;
    account.reservedCreditCents = 0;
  }
  for (const order of activeOrders(state)) {
    const account = state.accounts[order.ownerId];
    if (!account) continue;
    if (order.side === 'buy') {
      account.reservedBuyCents = safeAdd(
        account.reservedBuyCents,
        order.priceTicks * order.remainingQty,
        'buy reservation',
      );
    } else {
      account.reservedSellUnits = safeAdd(
        account.reservedSellUnits,
        order.remainingQty,
        'sell reservation',
      );
    }
  }
  let reservedCreditCents = 0;
  for (const account of Object.values(state.accounts)) {
    account.reservedCreditCents = Math.max(
      0,
      account.reservedBuyCents - account.cashCents,
    );
    reservedCreditCents = safeAdd(
      reservedCreditCents,
      account.reservedCreditCents,
      'credit reservation',
    );
  }
  state.creditPool.reservedCents = reservedCreditCents;
}

function accountBuyingPower(state, account) {
  return (
    account.cashCents +
    account.creditLimitCents -
    account.creditUsedCents -
    account.reservedBuyCents
  );
}

function maximumRestingBuyQuantity(state, account, priceTicks) {
  if (!isPositiveInteger(priceTicks)) return 0;
  const accountCapacity = Math.floor(
    Math.max(0, accountBuyingPower(state, account)) / priceTicks,
  );
  const poolCapacity = Math.floor(
    Math.max(
      0,
      state.creditPool.cashCents - state.creditPool.reservedCents,
    ) / priceTicks,
  );
  const cashCapacity = Math.floor(
    Math.max(0, account.cashCents - account.reservedBuyCents) /
      priceTicks,
  );
  return Math.min(
    accountCapacity,
    safeAdd(cashCapacity, poolCapacity, 'buy capacity'),
  );
}

function maximumSellQuantity(account) {
  return Math.max(0, account.holdings - account.reservedSellUnits);
}

function cancelOrder(state, orderId, reason = 'refresh') {
  const order = state.book.orders[orderId];
  if (
    !order ||
    (order.status !== 'accepted' &&
      order.status !== 'partially_filled')
  ) {
    return false;
  }
  order.status = 'cancelled';
  order.cancelledMs = state.nowMs;
  order.cancelReason = reason;
  rebuildReservations(state);
  recordMarketObservation(state);
  return true;
}

function financeBuyer(state, account, costCents) {
  if (costCents > account.cashCents) {
    const needed = costCents - account.cashCents;
    const lineAvailable =
      account.creditLimitCents - account.creditUsedCents;
    if (
      needed > lineAvailable ||
      needed >
        state.creditPool.cashCents -
          state.creditPool.reservedCents
    ) {
      return false;
    }
    state.creditPool.cashCents -= needed;
    account.cashCents += needed;
    account.creditUsedCents += needed;
  }
  if (account.cashCents < costCents) return false;
  account.cashCents -= costCents;
  return true;
}

function updateCostBasisOnBuy(account, priceTicks, quantity) {
  const priorUnits = account.holdings;
  const newUnits = priorUnits + quantity;
  if (newUnits <= 0) {
    account.costBasisTicks = priceTicks;
    return;
  }
  account.costBasisTicks = Math.max(
    1,
    Math.round(
      (account.costBasisTicks * priorUnits + priceTicks * quantity) /
        newUnits,
    ),
  );
}

function makerForAccount(state, accountId) {
  return state.makers[accountId] ?? null;
}

function flowForAccount(state, accountId) {
  return state.flowCohorts[accountId] ?? null;
}

function latestPublishedValuationAt(state, observedMs = state.nowMs) {
  for (
    let index = state.publishedValuations.length - 1;
    index >= 0;
    index -= 1
  ) {
    const observation = state.publishedValuations[index];
    if (observation.publishedMs <= observedMs) return observation;
  }
  throw new Error('No published valuation observation is visible.');
}

function recordTrade(state, trade) {
  state.trades.push(trade);
  state.totalTradeCount += 1;
  state.totalTradeVolumeUnits += trade.quantity;
  if (state.trades.length > 10_000) {
    const archived = state.trades.splice(0, 1_000);
    state.tradeArchive.count += archived.length;
    state.tradeArchive.volumeUnits += archived.reduce(
      (total, candidate) => total + candidate.quantity,
      0,
    );
    state.tradeArchive.throughMs = archived.at(-1)?.virtualMs ?? 0;
  }
  state.lastPriceTicks = trade.priceTicks;
  if (!state.uniqueTradePrices.includes(trade.priceTicks)) {
    state.uniqueTradePrices.push(trade.priceTicks);
    state.totalUniqueTradePriceCount += 1;
    if (state.uniqueTradePrices.length > MAX_UNIQUE_TRADE_PRICES) {
      state.uniqueTradePrices.splice(
        0,
        state.uniqueTradePrices.length - MAX_UNIQUE_TRADE_PRICES,
      );
    }
  }
  state.signedFlow.push({
    virtualMs: trade.virtualMs,
    signedUnits:
      trade.externalRiskTransfer === false
        ? 0
        : trade.aggressorSide === 'buy'
          ? trade.quantity
          : -trade.quantity,
  });
  const flowCutoff = state.nowMs - 12_000;
  state.signedFlow = state.signedFlow.filter(
    (entry) => entry.virtualMs >= flowCutoff,
  );

  if (trade.externalRiskTransfer !== false) {
    const buyerFlow = flowForAccount(state, trade.buyerId);
    const sellerFlow = flowForAccount(state, trade.sellerId);
    if (buyerFlow) buyerFlow.fillUnits += trade.quantity;
    if (sellerFlow) sellerFlow.fillUnits += trade.quantity;

    for (const [makerId, makerSide] of [
      [trade.buyerId, 'buy'],
      [trade.sellerId, 'sell'],
    ]) {
      const maker = makerForAccount(state, makerId);
      if (!maker) continue;
      maker.tradeStats.fillUnits += trade.quantity;
      maker.tradeStats.fillCount += 1;
      maker.tradeStats.notionalCents +=
        trade.priceTicks * trade.quantity;
      maker.frameFillUnits += trade.quantity;
      const makerOrder =
        makerSide === 'buy' ? trade.buyOrder : trade.sellOrder;
      const ageMs = Math.max(
        0,
        trade.virtualMs - makerOrder.submittedMs,
      );
      const publicValuation = latestPublishedValuationAt(state);
      const changedObservation =
        makerOrder.valuationObservationId !== publicValuation.id;
      const outsideCurrentPublicRange =
        makerSide === 'sell'
          ? trade.priceTicks < publicValuation.estimate.lowTicks
          : trade.priceTicks > publicValuation.estimate.highTicks;
      const stale = changedObservation && outsideCurrentPublicRange;
      if (stale) {
        maker.risk.staleFillCount += 1;
        maker.risk.staleExposureCents +=
          Math.max(
            1,
            makerSide === 'sell'
              ? publicValuation.estimate.lowTicks - trade.priceTicks
              : trade.priceTicks - publicValuation.estimate.highTicks,
          ) * trade.quantity;
      }
      scheduleEvent(
        state,
        'markout',
        state.nowMs + MARKOUT_DELAY_MS,
        EVENT_PRIORITY.MARKOUT,
        {
          makerId,
          makerSide,
          priceTicks: trade.priceTicks,
          quantity: trade.quantity,
          tradeId: trade.id,
          orderAgeMs: ageMs,
        },
      );
    }
  }

  if (trade.adverseTaker && trade.externalRiskTransfer !== false) {
    const cohort = state.flowCohorts.fast_adverse_taker;
    cohort.staleQuoteTakeCount += 1;
  }
  recordMarketObservation(state);
}

function settleTrade(
  state,
  buyOrder,
  sellOrder,
  quantity,
  priceTicks,
  aggressorSide,
) {
  const buyer = state.accounts[buyOrder.ownerId];
  const seller = state.accounts[sellOrder.ownerId];
  if (!buyer || !seller) return false;
  const selfTrade = buyer.id === seller.id;
  if (seller.holdings < quantity) return false;
  const costCents = priceTicks * quantity;
  if (!selfTrade && !financeBuyer(state, buyer, costCents)) {
    return false;
  }

  if (!selfTrade) {
    const sellerCostBasisTicks = seller.costBasisTicks;
    updateCostBasisOnBuy(buyer, priceTicks, quantity);
    buyer.holdings += quantity;
    seller.holdings -= quantity;
    seller.cashCents = safeAdd(
      seller.cashCents,
      costCents,
      'seller cash',
    );
    const sellerFlow = flowForAccount(state, seller.id);
    if (sellerFlow?.behavior === 'disposition') {
      if (priceTicks >= sellerCostBasisTicks) {
        sellerFlow.realizedWinnerSales += 1;
      } else {
        sellerFlow.realizedLoserSales += 1;
      }
    }
  }

  const trade = {
    id: `meco_trade_${String(state.nextTradeSequence).padStart(10, '0')}`,
    sequence: state.nextTradeSequence,
    virtualMs: state.nowMs,
    priceTicks,
    quantity,
    aggressorSide,
    buyerId: buyer.id,
    sellerId: seller.id,
    selfTrade,
    externalRiskTransfer: !selfTrade,
    buyOrderId: buyOrder.id,
    sellOrderId: sellOrder.id,
    buyOrder: {
      ownerId: buyOrder.ownerId,
      submittedMs: buyOrder.submittedMs,
      bookSequence: buyOrder.bookSequence,
    },
    sellOrder: {
      ownerId: sellOrder.ownerId,
      submittedMs: sellOrder.submittedMs,
      bookSequence: sellOrder.bookSequence,
    },
    adverseTaker:
      !selfTrade &&
      (
        buyOrder.ownerId === 'fast_adverse_taker' ||
        sellOrder.ownerId === 'fast_adverse_taker'
      ),
  };
  state.nextTradeSequence += 1;
  recordTrade(state, trade);
  return true;
}

function orderCrosses(incoming, resting) {
  return incoming.side === 'buy'
    ? incoming.priceTicks >= resting.priceTicks
    : incoming.priceTicks <= resting.priceTicks;
}

function submitOrder(state, intent) {
  const account = state.accounts[intent.ownerId];
  if (
    !account ||
    !['buy', 'sell'].includes(intent.side) ||
    !isPositiveInteger(intent.priceTicks) ||
    !isPositiveInteger(intent.quantity) ||
    !['GTC', 'IOC'].includes(intent.tif)
  ) {
    return { status: 'rejected', filledQuantity: 0, orderId: null };
  }

  rebuildReservations(state);
  const resourceLimit =
    intent.side === 'buy'
      ? maximumRestingBuyQuantity(
          state,
          account,
          intent.priceTicks,
        )
      : maximumSellQuantity(account);
  let remainingQty = Math.min(intent.quantity, resourceLimit);
  if (remainingQty <= 0) {
    return { status: 'rejected', filledQuantity: 0, orderId: null };
  }

  const order = {
    id: `meco_ord_${String(state.nextOrderSequence).padStart(10, '0')}`,
    ownerId: intent.ownerId,
    role: intent.role ?? 'flow',
    behavior: intent.behavior ?? null,
    side: intent.side,
    priceTicks: intent.priceTicks,
    originalQty: remainingQty,
    remainingQty,
    submittedMs: state.nowMs,
    tif: intent.tif,
    status: 'accepted',
    bookSequence: state.nextBookSequence,
    queueAheadAtSubmit: 0,
    valuationObservationId: intent.valuationObservationId ?? null,
    valuationObservationVersion:
      intent.valuationObservationVersion ?? null,
    valuationLowTicks: intent.valuationLowTicks ?? null,
    valuationHighTicks: intent.valuationHighTicks ?? null,
  };
  state.nextOrderSequence += 1;
  state.nextBookSequence += 1;

  const oppositeSide = order.side === 'buy' ? 'sell' : 'buy';
  while (remainingQty > 0) {
    const resting = orderedSide(state, oppositeSide).find((candidate) =>
      orderCrosses(order, candidate),
    );
    if (!resting) break;
    const restingOwner = state.accounts[resting.ownerId];
    const seller =
      order.side === 'sell' ? account : restingOwner;
    const fillQuantity = Math.min(
      remainingQty,
      resting.remainingQty,
      seller.holdings,
    );
    if (fillQuantity <= 0) break;

    const buyOrder = order.side === 'buy' ? order : resting;
    const sellOrder = order.side === 'sell' ? order : resting;
    remainingQty -= fillQuantity;
    order.remainingQty = remainingQty;
    resting.remainingQty -= fillQuantity;
    if (resting.remainingQty === 0) {
      resting.status = 'filled';
      resting.filledMs = state.nowMs;
    } else {
      resting.status = 'partially_filled';
    }
    rebuildReservations(state);
    if (
      !settleTrade(
        state,
        buyOrder,
        sellOrder,
        fillQuantity,
        resting.priceTicks,
        order.side,
      )
    ) {
      throw new Error('Trade settlement failed after resource validation.');
    }
    rebuildReservations(state);
  }

  const filledQuantity = order.originalQty - remainingQty;
  if (remainingQty === 0) {
    order.status = 'filled';
    order.filledMs = state.nowMs;
    state.book.orders[order.id] = order;
  } else if (intent.tif === 'IOC') {
    order.status =
      filledQuantity > 0 ? 'partially_filled_cancelled' : 'cancelled';
    order.cancelledMs = state.nowMs;
    order.cancelReason = 'IOC_REMAINDER';
    order.remainingQty = 0;
    state.book.orders[order.id] = order;
  } else {
    rebuildReservations(state);
    let restingLimit = remainingQty;
    if (order.side === 'buy') {
      restingLimit = Math.min(
        restingLimit,
        maximumRestingBuyQuantity(
          state,
          account,
          order.priceTicks,
        ),
      );
    } else {
      restingLimit = Math.min(
        restingLimit,
        maximumSellQuantity(account),
      );
    }
    if (restingLimit <= 0) {
      order.status =
        filledQuantity > 0
          ? 'partially_filled_cancelled'
          : 'cancelled';
      order.remainingQty = 0;
      order.cancelledMs = state.nowMs;
      order.cancelReason = 'RESOURCE_LIMIT';
      state.book.orders[order.id] = order;
    } else {
      order.remainingQty = restingLimit;
      order.queueAheadAtSubmit = activeOrders(
        state,
        (candidate) =>
          candidate.side === order.side &&
          candidate.priceTicks === order.priceTicks,
      ).reduce(
        (total, candidate) => total + candidate.remainingQty,
        0,
      );
      state.book.orders[order.id] = order;
      const maker = makerForAccount(state, order.ownerId);
      if (maker) {
        maker.orderStats.queueAheadUnits += order.queueAheadAtSubmit;
      }
    }
  }
  rebuildReservations(state);
  recordMarketObservation(state);
  return {
    status: order.status,
    filledQuantity,
    orderId: order.id,
    remainingQuantity: order.remainingQty,
  };
}

function observedHistoryEntry(state, observedMs) {
  const history = state.marketHistory;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].virtualMs <= observedMs) return history[index];
  }
  return history[0] ?? {
    virtualMs: 0,
    midTicks: state.referencePriceTicks,
    bestBidTicks: state.referencePriceTicks - 1,
    bestAskTicks: state.referencePriceTicks + 1,
    bidDepthUnits: 0,
    askDepthUnits: 0,
    imbalanceBps: 0,
    volatilityTicks: 1,
  };
}

function recordMarketObservation(state) {
  const view = bookView(state);
  const midTicks =
    view.bestBidTicks !== null && view.bestAskTicks !== null
      ? Math.round((view.bestBidTicks + view.bestAskTicks) / 2)
      : state.lastPriceTicks;
  const last = state.marketHistory.at(-1);
  const observation = {
    virtualMs: state.nowMs,
    midTicks,
    bestBidTicks: view.bestBidTicks ?? midTicks - 1,
    bestAskTicks: view.bestAskTicks ?? midTicks + 1,
    bidDepthUnits: view.bidDepthUnits,
    askDepthUnits: view.askDepthUnits,
    imbalanceBps: view.imbalanceBps,
    volatilityTicks: state.volatilityTicks,
  };
  if (
    last &&
    last.virtualMs === observation.virtualMs &&
    last.midTicks === observation.midTicks &&
    last.bidDepthUnits === observation.bidDepthUnits &&
    last.askDepthUnits === observation.askDepthUnits
  ) {
    return;
  }
  state.marketHistory.push(observation);
  if (state.marketHistory.length > MAX_HISTORY) {
    state.marketHistory.splice(
      0,
      state.marketHistory.length - MAX_HISTORY,
    );
  }
}

function rollingVolatilityTicks(state) {
  const cutoff = state.nowMs - 6_000;
  const points = state.marketHistory.filter(
    (entry) => entry.virtualMs >= cutoff,
  );
  const changes = [];
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].midTicks !== points[index - 1].midTicks) {
      changes.push(
        Math.abs(points[index].midTicks - points[index - 1].midTicks),
      );
    }
  }
  return Math.max(1, Math.round(rollingMean(changes)));
}

function rollingToxicityBps(state) {
  const cutoff = state.nowMs - 12_000;
  state.signedFlow = state.signedFlow.filter(
    (entry) => entry.virtualMs >= cutoff,
  );
  const buyUnits = state.signedFlow
    .filter((entry) => entry.signedUnits > 0)
    .reduce((total, entry) => total + entry.signedUnits, 0);
  const sellUnits = state.signedFlow
    .filter((entry) => entry.signedUnits < 0)
    .reduce((total, entry) => total - entry.signedUnits, 0);
  const total = buyUnits + sellUnits;
  if (total === 0) return 0;
  const imbalance = Math.abs(buyUnits - sellUnits) / total;
  const intensity = clamp(total / 180, 0, 1);
  return Math.round(
    clamp(imbalance * 7_000 + intensity * 3_000, 0, 10_000),
  );
}

function makerStressBps(maker, account, context) {
  const inventoryGap = Math.abs(
    account.holdings - maker.inventoryTargetUnits,
  );
  const inventoryStress = Math.round(
    (inventoryGap * 10_000) /
      Math.max(1, maker.inventoryCapacityUnits),
  );
  const fundingStress =
    account.creditLimitCents === 0
      ? 0
      : Math.round(
          (account.creditUsedCents * 10_000) /
            account.creditLimitCents,
        );
  const drawdownStress =
    maker.capital.peakEquityCents <= 0
      ? 0
      : Math.round(
          ((maker.capital.peakEquityCents -
            maker.capital.currentEquityCents) *
            10_000) /
            maker.capital.peakEquityCents,
        );
  return clamp(
    Math.round(
      context.regime.commonStressBps * 0.95 +
        inventoryStress * 0.14 +
        fundingStress * 0.08 +
        maker.risk.toxicityEwmaBps * 0.1 +
        Math.max(0, drawdownStress) * 0.06,
    ),
    0,
    10_000,
  );
}

function quoteStateForStress(previous, stressBps, regimeId) {
  if (regimeId === 'recovery') {
    if (stressBps < 3_200) return 'ACTIVE';
    if (stressBps < 5_000) return 'WIDEN';
    return 'REDUCE_SIZE';
  }
  const withdrawalThresholdBps =
    regimeId === 'liquidity_drought' ? 8_250 : 8_300;
  if (stressBps >= withdrawalThresholdBps) {
    return 'WITHDRAWN';
  }
  if (stressBps >= 6_200) return 'REDUCE_SIZE';
  if (stressBps >= 3_800) return 'WIDEN';
  if (
    previous !== 'ACTIVE' &&
    stressBps >= 2_300
  ) {
    return 'WIDEN';
  }
  return 'ACTIVE';
}

/**
 * Pure quote policy. Prices and quantities are integer units and are bounded by
 * the maker's own resources. It never mutates the order book or last price.
 */
export function computeMakerQuotePlan(makerInput, contextInput) {
  const maker = cloneJson(makerInput);
  const context = cloneJson(contextInput);
  const regime =
    typeof context.regime === 'string'
      ? REGIME_PRESETS[context.regime]
      : context.regime;
  if (
    !regime ||
    !isNonNegativeInteger(context.nowMs) ||
    !isPositiveInteger(context.observedMidTicks)
  ) {
    throw new Error('Invalid quote context.');
  }
  const valuation = validateValuationObservation(
    context.valuationObservation,
  );
  if (valuation.publishedMs > context.nowMs) {
    throw new Error('Quote context valuation is not yet public.');
  }
  if (
    context.symbol &&
    valuation.symbol !== context.symbol
  ) {
    throw new Error('Quote context valuation symbol mismatch.');
  }
  const inventoryGap =
    maker.holdings - maker.inventoryTargetUnits;
  const capacity = Math.max(1, maker.inventoryCapacityUnits);
  const inventoryRatio = clamp(inventoryGap / capacity, -1.5, 1.5);
  const riskAversionBps = maker.riskAversionBps ?? 500;
  const adverseSelectionBps =
    maker.adverseSelectionBps ?? 500;
  const volatilityTicks = Math.max(
    1,
    Math.round(context.volatilityTicks ?? 1),
  );
  const valuationDrivers = valuation.drivers;
  const driverUncertaintyTicks = valuationDrivers.reduce(
    (total, driver) => total + driver.uncertaintyTicks,
    0,
  );
  const financingRiskTicks = valuationDrivers
    .filter((driver) =>
      [
        'net_debt_per_share_increase',
        'financing_pressure',
      ].includes(driver.kind),
    )
    .reduce(
      (total, driver) =>
        total +
        Math.ceil(
          (Math.abs(driver.effectTicks) + driver.uncertaintyTicks) / 10,
        ),
      0,
    );
  const dilutionRiskTicks = valuationDrivers
    .filter((driver) => driver.kind === 'share_dilution')
    .reduce(
      (total, driver) =>
        total +
        Math.ceil(
          (Math.abs(driver.effectTicks) + driver.uncertaintyTicks) / 12,
        ),
      0,
    );
  const intervalHalfWidthTicks = Math.ceil(
    (valuation.estimate.highTicks - valuation.estimate.lowTicks) / 2,
  );
  const confidenceDeficitBps =
    10_000 - valuation.estimate.confidenceBps;
  const valuationUncertaintyTicks = Math.max(
    0,
    Math.ceil(
      (intervalHalfWidthTicks * confidenceDeficitBps) / 20_000 +
      driverUncertaintyTicks / 4,
    ),
  );
  // A multi-year valuation interval governs inventory capacity and tail
  // liquidity; only a bounded fraction belongs in the millisecond touch
  // spread. Treating the full interval as one-tick adverse-selection risk
  // creates artificial jumps even when no new public fact exists.
  const shortHorizonValuationRiskTicks = Math.min(
    3,
    Math.max(0, Math.ceil(valuationUncertaintyTicks / 48)),
  );
  const valuationAgeMs = isNonNegativeInteger(context.valuationAgeMs)
    ? context.valuationAgeMs
    : Math.max(0, (context.nowMs ?? valuation.publishedMs) - valuation.publishedMs);
  const valuationAgeRiskTicks = clamp(
    Math.floor(valuationAgeMs / 21_600_000),
    0,
    4,
  );
  const inventorySkewTicks = Math.max(
    0,
    Math.round(
      Math.abs(inventoryRatio) *
        (1 +
          volatilityTicks * 0.45 +
          valuationUncertaintyTicks * 0.12) *
        (riskAversionBps / 420),
    ),
  );
  const valuationGap =
    valuation.estimate.centerTicks - context.observedMidTicks;
  const maximumValuationGap = Math.max(
    12,
    Math.floor(context.observedMidTicks * 0.05),
  );
  const valuationWeightBps = clamp(
    maker.valuationWeightBps ?? 2_800,
    0,
    6_000,
  );
  const rawValuationCenterSignalTicks = Math.round(
    clamp(
      valuationGap,
      -maximumValuationGap,
      maximumValuationGap,
    ) *
      (valuationWeightBps / 10_000) *
      (valuation.estimate.confidenceBps / 10_000),
  );
  const shortHorizonValuationSignalCapTicks = Math.max(
    1,
    Math.round(context.observedMidTicks * 0.00025),
  );
  const valuationCenterSignalTicks = Math.round(
    shortHorizonValuationSignalCapTicks *
      Math.tanh(
        rawValuationCenterSignalTicks /
          shortHorizonValuationSignalCapTicks,
      ),
  );
  const imbalanceSignalTicks = Math.round(
    ((context.imbalanceBps ?? 0) *
      adverseSelectionBps *
      volatilityTicks) /
      35_000_000,
  );
  const reservationPriceTicks = Math.max(
    2,
    context.observedMidTicks +
      valuationCenterSignalTicks +
      imbalanceSignalTicks -
      Math.sign(inventoryGap) * inventorySkewTicks,
  );

  const volatilityRiskTicks = Math.max(
    0,
    Math.ceil(
      (volatilityTicks * riskAversionBps) / 4_000,
    ),
  );
  const adverseSelectionTicks = Math.max(
    0,
    Math.ceil(
      ((context.toxicityBps ?? 0) *
        adverseSelectionBps) /
        6_000_000,
    ),
  );
  const latencyRiskTicks = Math.max(
    0,
    Math.ceil(
      ((maker.latencyMs ?? 0) *
        (context.jumpRiskBps ?? regime.jumpRiskBps)) /
        750_000,
    ),
  );
  const fundingBps =
    maker.creditLimitCents > 0
      ? Math.round(
          ((maker.creditUsedCents ?? 0) * 10_000) /
            maker.creditLimitCents,
        )
      : 0;
  const fundingRiskTicks = Math.ceil(fundingBps / 2_500);
  const crowdingRiskTicks = Math.ceil(
    (context.crowdingBps ?? 0) / 7_500,
  );
  const queueRiskTicks = Math.ceil(
    (context.queueAheadBps ?? 0) / 4_000,
  );
  const competitionDiscountTicks =
    (context.activeMakerCount ?? 1) >= 2 ? 1 : 0;
  const rawHalfSpread =
    (maker.baseHalfSpreadTicks ?? 1) +
    volatilityRiskTicks +
    adverseSelectionTicks +
    latencyRiskTicks +
    fundingRiskTicks +
    crowdingRiskTicks -
    competitionDiscountTicks +
    shortHorizonValuationRiskTicks +
    valuationAgeRiskTicks +
    financingRiskTicks +
    dilutionRiskTicks +
    queueRiskTicks;
  const quoteState = maker.quoteState ?? 'ACTIVE';
  const stateSpreadMultiplierBps = {
    ACTIVE: 10_000,
    WIDEN: 14_000,
    REDUCE_SIZE: 18_000,
    WITHDRAWN: 20_000,
  }[quoteState] ?? 10_000;
  const preliminaryHalfSpreadTicks = Math.max(
    1,
    Math.ceil(
      (rawHalfSpread *
        regime.spreadMultiplierBps *
        stateSpreadMultiplierBps) /
      100_000_000,
    ),
  );
  const inventoryRiskTicks = Math.max(
    0,
    Math.ceil(
      Math.abs(inventoryRatio) *
        volatilityTicks *
        riskAversionBps /
        4_000,
    ),
  );
  const preliminaryExpectedFillBps = clamp(
    Math.round(
      9_000 -
        (context.toxicityBps ?? 0) * 0.55 -
        (context.crowdingBps ?? 0) * 0.2 -
        preliminaryHalfSpreadTicks * 150,
    ),
    1_500,
    9_000,
  );
  const preliminaryGrossEdgeTickBps =
    preliminaryHalfSpreadTicks * preliminaryExpectedFillBps;
  // Tick-bps keep the opportunity check integer and deterministic.  This is
  // an expected-utility control, not a promise of profit: quoted spread is
  // weighted by fill probability, while adverse markout, latency, volatility,
  // funding, queue loss and inventory carrying risk are charged separately.
  const expectedRiskCostTickBps =
    adverseSelectionTicks * 9_000 +
    latencyRiskTicks * 7_000 +
    volatilityRiskTicks * 3_500 +
    fundingRiskTicks * 4_000 +
    crowdingRiskTicks * 2_000 +
    queueRiskTicks * 5_000 +
    inventoryRiskTicks * 6_000;
  const usesDeepBookPolicy =
    Math.max(1, maker.maxLevels ?? 3) >= 20;
  const profitabilityWidenTicks = usesDeepBookPolicy
    ? clamp(
        Math.ceil(
          Math.max(
            0,
            expectedRiskCostTickBps -
              preliminaryGrossEdgeTickBps,
          ) / 10_000,
        ),
        0,
        4,
      )
    : 0;
  const unconstrainedHalfSpreadTicks =
    preliminaryHalfSpreadTicks + profitabilityWidenTicks;
  const calmHalfSpreadCapTicks = isPositiveInteger(
    context.calmHalfSpreadCapTicks,
  )
    ? context.calmHalfSpreadCapTicks
    : null;
  const calmSpreadCapApplied =
    calmHalfSpreadCapTicks !== null &&
    regime.id === 'normal' &&
    quoteState === 'ACTIVE' &&
    volatilityTicks <= 3 &&
    (context.toxicityBps ?? 0) <= 4_000 &&
    (context.jumpRiskBps ?? regime.jumpRiskBps) <= 1_500;
  const halfSpreadTicks = calmSpreadCapApplied
    ? Math.min(
        unconstrainedHalfSpreadTicks,
        calmHalfSpreadCapTicks,
      )
    : unconstrainedHalfSpreadTicks;
  const expectedFillBps = clamp(
    Math.round(
      9_000 -
        (context.toxicityBps ?? 0) * 0.55 -
        (context.crowdingBps ?? 0) * 0.2 -
        halfSpreadTicks * 150,
    ),
    1_500,
    9_000,
  );
  const expectedGrossEdgeTickBps =
    halfSpreadTicks * expectedFillBps;
  const expectedNetEdgeTickBps =
    expectedGrossEdgeTickBps - expectedRiskCostTickBps;
  const stateTouchAllocationBps = {
    ACTIVE: 10_000,
    WIDEN: 7_000,
    REDUCE_SIZE: 4_500,
  }[quoteState] ?? 10_000;
  const nearTouchAllocationBps =
    quoteState === 'WITHDRAWN'
      ? 0
      : Math.round(
          clamp(
            Math.round(
              3_200 +
                expectedNetEdgeTickBps * 3 / 5,
            ),
            1_800,
            9_600,
          ) *
            stateTouchAllocationBps /
            10_000,
        );

  if (quoteState === 'WITHDRAWN') {
    return {
      reservationPriceTicks,
      halfSpreadTicks,
      levelsPerSide: 0,
      spacingTicks: Math.max(1, Math.ceil(volatilityTicks / 2)),
      totalBidUnits: 0,
      totalAskUnits: 0,
      bids: [],
      asks: [],
      diagnostics: {
        inventoryGapUnits: inventoryGap,
        inventorySkewTicks,
        valuationObservationVersion: valuation.version,
        valuationObservationId: valuation.id,
        valuationPublishedMs: valuation.publishedMs,
        valuationLowTicks: valuation.estimate.lowTicks,
        valuationHighTicks: valuation.estimate.highTicks,
        valuationCenterSignalTicks,
        rawValuationCenterSignalTicks,
        shortHorizonValuationSignalCapTicks,
        valuationUncertaintyTicks,
        shortHorizonValuationRiskTicks,
        valuationAgeMs,
        valuationAgeRiskTicks,
        financingRiskTicks,
        dilutionRiskTicks,
        imbalanceSignalTicks,
        volatilityRiskTicks,
        adverseSelectionTicks,
        latencyRiskTicks,
        fundingRiskTicks,
        crowdingRiskTicks,
        queueRiskTicks,
        expectedFillBps,
        inventoryRiskTicks,
        profitabilityWidenTicks,
        unconstrainedHalfSpreadTicks,
        calmHalfSpreadCapTicks,
        calmSpreadCapApplied,
        expectedGrossEdgeTickBps,
        expectedRiskCostTickBps,
        expectedNetEdgeTickBps,
        nearTouchAllocationBps,
        quoteState,
      },
    };
  }
  const stateSizeBps = {
    ACTIVE: 10_000,
    WIDEN: 7_500,
    REDUCE_SIZE: 3_800,
  }[quoteState] ?? 10_000;
  const stateLevelBps = {
    ACTIVE: 10_000,
    WIDEN: 8_000,
    REDUCE_SIZE: 4_500,
  }[quoteState] ?? 10_000;
  const riskSizeBps = clamp(
    10_000 -
      Math.round((context.toxicityBps ?? 0) * 0.42) -
      Math.round((context.crowdingBps ?? 0) * 0.2),
    1_500,
    10_000,
  );
  const capacityMultiplierBps = clamp(
    maker.marginalSizeMultiplierBps ?? 10_000,
    1_000,
    12_000,
  );
  const capitalScale = clamp(
    Math.sqrt(Math.max(0.1, maker.capitalMultiplier ?? 1)),
    0.5,
    3,
  );
  const commonSize = Math.max(
    1,
    Math.floor(
      (maker.baseOrderUnits ?? 10) *
        capitalScale *
        (regime.quoteSizeMultiplierBps / 10_000) *
        (stateSizeBps / 10_000) *
        (riskSizeBps / 10_000) *
        (capacityMultiplierBps / 10_000),
    ),
  );
  const longPressure = clamp(inventoryRatio, -1, 1);
  const bidWeight = clamp(1 - longPressure * 0.68, 0.15, 1.75);
  const askWeight = clamp(1 + longPressure * 0.68, 0.15, 1.75);
  const maxLevels = Math.max(1, maker.maxLevels ?? 3);
  const levelsPerSide = clamp(
    Math.floor(
      maxLevels *
        (stateLevelBps / 10_000) *
        clamp(regime.quoteSizeMultiplierBps / 7_500, 0.3, 1),
    ),
    1,
    maxLevels,
  );
  const laneModulus = Math.max(
    1,
    Math.floor(maker.priceLaneModulus ?? 1),
  );
  const laneRemainder =
    ((Math.floor(maker.priceLaneRemainder ?? 0) % laneModulus) +
      laneModulus) %
    laneModulus;
  const rawSpacingTicks = Math.max(
    Math.floor(maker.minimumSpacingTicks ?? 1),
    1,
  );
  const spacingTicks =
    Math.ceil(rawSpacingTicks / laneModulus) * laneModulus;
  const bidUnitsWanted = Math.max(
    1,
    Math.floor(commonSize * bidWeight * levelsPerSide),
  );
  const askUnitsWanted = Math.max(
    1,
    Math.floor(commonSize * askWeight * levelsPerSide),
  );
  const unusedCreditCents = Math.max(
    0,
    (maker.creditLimitCents ?? 0) -
      (maker.creditUsedCents ?? 0),
  );
  const bestProspectiveBid = Math.max(
    1,
    reservationPriceTicks - halfSpreadTicks,
  );
  const cashBoundUnits = Math.floor(
    Math.max(0, (maker.cashCents ?? 0) + unusedCreditCents) /
      bestProspectiveBid,
  );
  const capacityBuyUnits = Math.max(
    0,
    maker.inventoryTargetUnits +
      capacity -
      maker.holdings,
  );
  const capacitySellUnits = Math.max(
    0,
    maker.holdings -
      Math.max(0, maker.inventoryTargetUnits - capacity),
  );
  const totalBidUnits = Math.min(
    bidUnitsWanted,
    cashBoundUnits,
    capacityBuyUnits,
  );
  const totalAskUnits = Math.min(
    askUnitsWanted,
    maker.holdings ?? 0,
    capacitySellUnits,
  );

  const distribute = (total, side) => {
    if (total <= 0) return [];
    const actualLevelCount = Math.min(levelsPerSide, total);
    // Every level remains fully resource-backed.  The maker allocates one unit
    // to each selected layer, spreads the risk-budget floor evenly, then
    // places only the residual according to expected risk-adjusted edge.
    // Calm positive-edge markets therefore have a useful touch without
    // increasing total inventory; toxic markets flatten or shrink naturally.
    const weights = new Array(actualLevelCount);
    let weightTotal = 0;
    const usesDeepBookAllocation = actualLevelCount >= 20;
    const locationDecay = usesDeepBookAllocation
      ? 0.87 +
        ((10_000 - nearTouchAllocationBps) / 10_000) * 0.1
      : 0.82;
    for (let index = 0; index < actualLevelCount; index += 1) {
      const weight = Math.pow(locationDecay, index);
      weights[index] = weight;
      weightTotal += weight;
    }
    const extraTotal = total - actualLevelCount;
    const uniformExtraTotal = usesDeepBookAllocation
      ? Math.floor(
          extraTotal *
            (10_000 - nearTouchAllocationBps) /
            10_000,
        )
      : 0;
    const concentratedExtraTotal =
      extraTotal - uniformExtraTotal;
    const extraUnits = new Array(actualLevelCount);
    const remainders = new Array(actualLevelCount);
    let distributed = 0;
    for (let index = 0; index < actualLevelCount; index += 1) {
      const exactExtra =
        concentratedExtraTotal * weights[index] / weightTotal;
      const uniformExtra =
        Math.floor(uniformExtraTotal / actualLevelCount) +
        (index < uniformExtraTotal % actualLevelCount ? 1 : 0);
      const concentratedQuantity = Math.floor(exactExtra);
      const quantity = uniformExtra + concentratedQuantity;
      extraUnits[index] = quantity;
      remainders[index] = exactExtra - concentratedQuantity;
      distributed += concentratedQuantity;
    }
    let undistributed = concentratedExtraTotal - distributed;
    const remainderPriority = Array.from(
      { length: actualLevelCount },
      (_, index) => index,
    )
      .sort(
        (left, right) =>
          remainders[right] - remainders[left] ||
          left - right,
      );
    for (const index of remainderPriority) {
      if (undistributed <= 0) break;
      extraUnits[index] += 1;
      undistributed -= 1;
    }
    const orders = new Array(actualLevelCount);
    for (let index = 0; index < actualLevelCount; index += 1) {
      const distance =
        halfSpreadTicks + index * spacingTicks;
      const rawPriceTicks =
        side === 'buy'
          ? Math.max(1, reservationPriceTicks - distance)
          : reservationPriceTicks + distance;
      const remainder =
        ((rawPriceTicks % laneModulus) + laneModulus) %
        laneModulus;
      const priceTicks =
        side === 'buy'
          ? Math.max(
              1,
              rawPriceTicks -
                ((remainder - laneRemainder + laneModulus) %
                  laneModulus),
            )
          : rawPriceTicks +
            ((laneRemainder - remainder + laneModulus) %
              laneModulus);
      orders[index] = {
        side,
        priceTicks,
        quantity: 1 + extraUnits[index],
      };
    }
    return orders;
  };

  const bids = distribute(totalBidUnits, 'buy');
  const asks = distribute(totalAskUnits, 'sell');
  return {
    reservationPriceTicks,
    halfSpreadTicks,
    levelsPerSide,
    spacingTicks,
    totalBidUnits,
    totalAskUnits,
    bids,
    asks,
    diagnostics: {
      inventoryGapUnits: inventoryGap,
      inventorySkewTicks,
      valuationObservationVersion: valuation.version,
      valuationObservationId: valuation.id,
      valuationPublishedMs: valuation.publishedMs,
      valuationLowTicks: valuation.estimate.lowTicks,
      valuationHighTicks: valuation.estimate.highTicks,
      valuationCenterSignalTicks,
      rawValuationCenterSignalTicks,
      shortHorizonValuationSignalCapTicks,
      valuationUncertaintyTicks,
      shortHorizonValuationRiskTicks,
      valuationAgeMs,
      valuationAgeRiskTicks,
      financingRiskTicks,
      dilutionRiskTicks,
      imbalanceSignalTicks,
      volatilityRiskTicks,
      adverseSelectionTicks,
      latencyRiskTicks,
      fundingRiskTicks,
      crowdingRiskTicks,
      queueRiskTicks,
      expectedFillBps,
      inventoryRiskTicks,
      profitabilityWidenTicks,
      unconstrainedHalfSpreadTicks,
      calmHalfSpreadCapTicks,
      calmSpreadCapApplied,
      expectedGrossEdgeTickBps,
      expectedRiskCostTickBps,
      expectedNetEdgeTickBps,
      nearTouchAllocationBps,
      quoteState,
    },
  };
}

function makerQuoteContext(state, maker) {
  const observedMs = Math.max(
    0,
    state.nowMs - maker.informationDelayMs,
  );
  const observed = observedHistoryEntry(state, observedMs);
  const valuationObservation = latestPublishedValuationAt(
    state,
    observedMs,
  );
  const view = bookView(state);
  const totalMakerFillUnits = Object.values(state.makers).reduce(
    (total, candidate) => total + candidate.tradeStats.fillUnits,
    0,
  );
  const makerFillShareBps =
    totalMakerFillUnits === 0
      ? 0
      : Math.round(
          (maker.tradeStats.fillUnits * 10_000) /
            totalMakerFillUnits,
        );
  return {
    nowMs: state.nowMs,
    symbol: state.config.symbol,
    observedMidTicks: observed.midTicks,
    valuationObservation,
    valuationAgeMs: Math.max(
      0,
      state.nowMs - valuationObservation.publishedMs,
    ),
    bestBidTicks: observed.bestBidTicks,
    bestAskTicks: observed.bestAskTicks,
    bidDepthUnits: observed.bidDepthUnits,
    askDepthUnits: observed.askDepthUnits,
    imbalanceBps: observed.imbalanceBps,
    volatilityTicks: Math.max(
      observed.volatilityTicks,
      state.volatilityTicks,
    ),
    jumpRiskBps: currentRegime(state).jumpRiskBps,
    toxicityBps: Math.max(
      state.toxicityBps,
      maker.risk.toxicityEwmaBps,
    ),
    crowdingBps: clamp(
      Math.round(
        makerFillShareBps * 0.55 +
          maker.capacity.opponentLearningBps * 0.45,
      ),
      0,
      10_000,
    ),
    regime: currentRegime(state),
    activeMakerCount: Object.values(state.makers).filter(
      (candidate) => candidate.quoteState !== 'WITHDRAWN',
    ).length,
    queueAheadBps: clamp(
      Math.round(
        (maker.orderStats.queueAheadUnits * 10_000) /
          Math.max(
            1,
            maker.orderStats.submitCount *
              Math.max(1, view.totalDepthUnits),
          ),
      ),
      0,
      10_000,
    ),
    liveBookImbalanceBps: view.imbalanceBps,
  };
}

function makerInput(state, maker) {
  const account = state.accounts[maker.id];
  return {
    ...maker,
    holdings: account.holdings,
    cashCents: account.cashCents,
    creditLimitCents: account.creditLimitCents,
    creditUsedCents: account.creditUsedCents,
    marginalSizeMultiplierBps:
      maker.capacity.marginalSizeMultiplierBps,
  };
}

function recentMakerCancels(maker, nowMs) {
  maker.cancelTimestamps = maker.cancelTimestamps.filter(
    (timestamp) => timestamp > nowMs - 1_000,
  );
  return maker.cancelTimestamps.length;
}

function applyMakerPlan(state, maker, plan) {
  const desired = [...plan.bids, ...plan.asks];
  const desiredKeys = new Set(
    desired.map((order) => `${order.side}:${order.priceTicks}`),
  );
  const existing = activeOrders(
    state,
    (order) => order.ownerId === maker.id,
  );
  const retainedKeys = new Set();
  for (const order of existing) {
    const key = `${order.side}:${order.priceTicks}`;
    if (desiredKeys.has(key) && !retainedKeys.has(key)) {
      retainedKeys.add(key);
      maker.orderStats.priorityPreservedCount += 1;
      continue;
    }
    if (
      recentMakerCancels(maker, state.nowMs) >=
      maker.maxCancelsPerSecond
    ) {
      maker.orderStats.cancelThrottleCount += 1;
      continue;
    }
    if (cancelOrder(state, order.id, 'maker_refresh')) {
      maker.cancelTimestamps.push(state.nowMs);
      maker.orderStats.cancelCount += 1;
      maker.orderStats.priorityLostCount += 1;
    }
  }

  const activeAfterCancel = activeOrders(
    state,
    (order) => order.ownerId === maker.id,
  );
  const activeKeys = new Set(
    activeAfterCancel.map(
      (order) => `${order.side}:${order.priceTicks}`,
    ),
  );
  const activeCap = maker.maxLevels * 2 + 6;
  for (const desiredOrder of desired) {
    const key = `${desiredOrder.side}:${desiredOrder.priceTicks}`;
    if (activeKeys.has(key)) continue;
    if (
      activeOrders(
        state,
        (order) => order.ownerId === maker.id,
      ).length >= activeCap
    ) {
      break;
    }
    const receipt = submitOrder(state, {
      ownerId: maker.id,
      role: 'maker',
      side: desiredOrder.side,
      priceTicks: desiredOrder.priceTicks,
      quantity: desiredOrder.quantity,
      tif: 'GTC',
      valuationObservationId:
        plan.diagnostics.valuationObservationId,
      valuationObservationVersion:
        plan.diagnostics.valuationObservationVersion,
      valuationLowTicks:
        plan.diagnostics.valuationLowTicks,
      valuationHighTicks:
        plan.diagnostics.valuationHighTicks,
    });
    if (receipt.orderId) {
      maker.orderStats.submitCount += 1;
      activeKeys.add(key);
    }
  }
  maker.latestPlan = plan;
  maker.lastApplyMs = state.nowMs;
}

function nextMakerCadence(state, maker) {
  const jitter = Math.round(
    stableSigned(
      state.seed,
      maker.id,
      maker.decisionCount,
      'maker-cadence',
    ) * maker.cadenceJitterMs,
  );
  return Math.max(40, maker.quoteCadenceMs + jitter);
}

function handleMakerDecision(state, event) {
  const maker = state.makers[event.payload.makerId];
  if (!maker) return;
  const context = makerQuoteContext(state, maker);
  const account = state.accounts[maker.id];
  const stressBps = makerStressBps(maker, account, context);
  maker.risk.stressBps = stressBps;
  maker.quoteState = quoteStateForStress(
    maker.quoteState,
    stressBps,
    currentRegimeId(state),
  );
  const plan = computeMakerQuotePlan(
    makerInput(state, maker),
    context,
  );
  maker.lastDecisionMs = state.nowMs;
  maker.decisionCount += 1;
  scheduleEvent(
    state,
    'maker_apply',
    state.nowMs + maker.latencyMs,
    EVENT_PRIORITY.MAKER_APPLY,
    {
      makerId: maker.id,
      plan,
      decisionMs: state.nowMs,
      observedMs: Math.max(
        0,
        state.nowMs - maker.informationDelayMs,
      ),
    },
  );
  scheduleEvent(
    state,
    'maker_decision',
    state.nowMs + nextMakerCadence(state, maker),
    EVENT_PRIORITY.MAKER_DECISION,
    { makerId: maker.id },
  );
}

function handleMakerApply(state, event) {
  const maker = state.makers[event.payload.makerId];
  if (!maker) return;
  applyMakerPlan(state, maker, event.payload.plan);
}

function processMarkout(state, event) {
  const maker = state.makers[event.payload.makerId];
  if (!maker) return;
  const view = bookView(state);
  const markTicks =
    view.bestBidTicks !== null && view.bestAskTicks !== null
      ? Math.round((view.bestBidTicks + view.bestAskTicks) / 2)
      : state.lastPriceTicks;
  const adverseTicks =
    event.payload.makerSide === 'buy'
      ? event.payload.priceTicks - markTicks
      : markTicks - event.payload.priceTicks;
  const adverseCents =
    Math.max(0, adverseTicks) * event.payload.quantity;
  maker.risk.realizedAdverseSelectionCents += adverseCents;
  const sampleBps = clamp(
    Math.max(0, adverseTicks) * 1_800,
    0,
    10_000,
  );
  maker.risk.toxicityEwmaBps = Math.round(
    maker.risk.toxicityEwmaBps * 0.86 + sampleBps * 0.14,
  );
  maker.frameMarkoutCount += 1;
}

function publishValuationObservation(state, event) {
  const observation = validateValuationObservation(
    event.payload?.observation,
  );
  if (
    observation.symbol !== state.config.symbol ||
    observation.publishedMs !== state.nowMs ||
    state.publishedValuations.some(
      (candidate) => candidate.id === observation.id,
    )
  ) {
    throw new Error('Invalid or duplicate valuation publication event.');
  }
  const previous = state.publishedValuations.at(-1);
  if (
    previous &&
    (observation.publishedMs < previous.publishedMs ||
      observation.asOfMs < previous.asOfMs)
  ) {
    throw new Error('Valuation observations must be time ordered.');
  }
  state.publishedValuations.push(observation);
  state.latestValuationObservationId = observation.id;
}

function updateObservedMarketRisk(state) {
  const regime = currentRegime(state);
  const observedVolatility = rollingVolatilityTicks(state);
  state.volatilityTicks = Math.max(
    1,
    Math.round(
      observedVolatility * regime.volatilityScaleBps / 10_000,
    ),
  );
  state.toxicityBps = Math.round(
    state.toxicityBps * 0.82 +
      rollingToxicityBps(state) * 0.18,
  );
}

function recentReturnTicks(state, horizonMs = 3_000) {
  const before = observedHistoryEntry(
    state,
    Math.max(0, state.nowMs - horizonMs),
  );
  const current = state.marketHistory.at(-1) ?? before;
  return current.midTicks - before.midTicks;
}

function chooseFlowSide(state, cohort) {
  const account = state.accounts[cohort.id];
  const view = bookView(state);
  const mid =
    view.bestBidTicks !== null && view.bestAskTicks !== null
      ? Math.round((view.bestBidTicks + view.bestAskTicks) / 2)
      : state.lastPriceTicks;
  const rngSequence = cohort.arrivalCount;
  const regime = currentRegime(state);
  const unit = stableUnit(
    state.seed,
    cohort.id,
    rngSequence,
    'side',
  );
  let buyProbability = 0.5;

  if (cohort.behavior === 'value') {
    const publicValuation = latestPublishedValuationAt(state);
    const gap = publicValuation.estimate.centerTicks - mid;
    const reversionScale =
      0.5 + regime.valuationReversionBps / 5_000;
    buyProbability = clamp(
      0.5 + gap * 0.035 * reversionScale,
      0.1,
      0.9,
    );
  } else if (cohort.behavior === 'momentum') {
    const momentum = recentReturnTicks(state);
    const momentumScale =
      0.5 + regime.momentumResponseBps / 5_000;
    buyProbability = clamp(
      0.5 +
        Math.sign(momentum) *
          Math.min(
            0.42,
            Math.abs(momentum) * 0.035 * momentumScale,
          ),
      0.08,
      0.92,
    );
  } else if (cohort.behavior === 'disposition') {
    const unrealized = mid - account.costBasisTicks;
    if (unrealized > 0) {
      buyProbability = 0.2;
    } else if (unrealized < 0) {
      if (unit < 0.72) {
        cohort.deferredLoserSales += 1;
        return null;
      }
      buyProbability = 0.78;
    }
  } else if (cohort.behavior === 'liquidity_need') {
    const inventoryValue = account.holdings * mid;
    const total = inventoryValue + account.cashCents;
    const inventoryShare =
      total <= 0 ? 0.5 : inventoryValue / total;
    buyProbability = clamp(
      0.5 + (0.42 - inventoryShare) * 1.2,
      0.2,
      0.8,
    );
  } else if (cohort.behavior === 'noise') {
    buyProbability =
      0.5 +
      stableSigned(
        state.seed,
        cohort.id,
        rngSequence,
        'noise',
      ) * 0.18;
  }

  let side = unit < buyProbability ? 'buy' : 'sell';
  const bestPrice =
    side === 'buy'
      ? view.bestAskTicks ?? mid + 1
      : view.bestBidTicks ?? mid - 1;
  if (
    side === 'buy' &&
    maximumRestingBuyQuantity(state, account, bestPrice) <= 0
  ) {
    side = 'sell';
  }
  if (side === 'sell' && account.holdings <= 0) side = 'buy';
  return side;
}

function adverseOpportunity(state) {
  const publicValuation = latestPublishedValuationAt(state);
  const threshold = Math.max(1, Math.ceil(state.volatilityTicks / 2));
  const asks = orderedSide(state, 'sell').filter((order) =>
    Boolean(state.makers[order.ownerId]),
  );
  const bids = orderedSide(state, 'buy').filter((order) =>
    Boolean(state.makers[order.ownerId]),
  );
  const ask = asks.find(
    (order) => {
      const learnedThreshold = Math.max(
        1,
        threshold -
          Math.floor(
            state.makers[order.ownerId].capacity.opponentLearningBps /
              2_500,
          ),
      );
      return (
        publicValuation.estimate.lowTicks - order.priceTicks >=
        learnedThreshold
      );
    },
  );
  const bid = bids.find(
    (order) => {
      const learnedThreshold = Math.max(
        1,
        threshold -
          Math.floor(
            state.makers[order.ownerId].capacity.opponentLearningBps /
              2_500,
          ),
      );
      return (
        order.priceTicks - publicValuation.estimate.highTicks >=
        learnedThreshold
      );
    },
  );
  const askEdge = ask
    ? publicValuation.estimate.lowTicks - ask.priceTicks
    : 0;
  const bidEdge = bid
    ? bid.priceTicks - publicValuation.estimate.highTicks
    : 0;
  if (!ask && !bid) return null;
  if (askEdge >= bidEdge) {
    return {
      side: 'buy',
      priceTicks: ask.priceTicks,
      maximumQty: Math.min(
        ask.remainingQty,
        1 +
          Math.ceil(
            state.makers[ask.ownerId].capacity.opponentLearningBps /
              1_500,
          ),
      ),
    };
  }
  return {
    side: 'sell',
    priceTicks: bid.priceTicks,
    maximumQty: Math.min(
      bid.remainingQty,
      1 +
        Math.ceil(
          state.makers[bid.ownerId].capacity.opponentLearningBps /
            1_500,
        ),
    ),
  };
}

function nextFlowDelay(state, cohort) {
  const regime = currentRegime(state);
  const scaled =
    (cohort.baseIntervalMs * 10_000) /
    regime.arrivalMultiplierBps;
  const jitter =
    0.55 +
    stableUnit(
      state.seed,
      cohort.id,
      cohort.arrivalCount,
      'arrival',
    ) * 1.1;
  return Math.max(25, Math.round(scaled * jitter));
}

function handleFlowArrival(state, event) {
  const cohort = state.flowCohorts[event.payload.cohortId];
  if (!cohort) return;
  cohort.arrivalCount += 1;
  const account = state.accounts[cohort.id];
  const view = bookView(state);
  let side;
  let aggressive;
  let priceTicks;
  let maximumQty = cohort.maxOrderUnits;

  if (cohort.behavior === 'latency_arbitrage') {
    const opportunity = adverseOpportunity(state);
    if (opportunity) {
      side = opportunity.side;
      aggressive = true;
      priceTicks = opportunity.priceTicks;
      maximumQty = Math.min(maximumQty, opportunity.maximumQty);
    }
  } else {
    side = chooseFlowSide(state, cohort);
    aggressive =
      stableUnit(
        state.seed,
        cohort.id,
        cohort.arrivalCount,
        'aggression',
      ) <
      cohort.aggressiveBps / 10_000;
  }

  if (side) {
    const mid =
      view.bestBidTicks !== null && view.bestAskTicks !== null
        ? Math.round(
            (view.bestBidTicks + view.bestAskTicks) / 2,
          )
        : state.lastPriceTicks;
    if (!priceTicks) {
      if (aggressive) {
        const protection = Math.max(2, state.volatilityTicks * 2);
        priceTicks =
          side === 'buy'
            ? (view.bestAskTicks ?? mid + 1) + protection
            : Math.max(
                1,
                (view.bestBidTicks ?? mid - 1) - protection,
              );
      } else {
        const distance =
          1 +
          Math.floor(
            stableUnit(
              state.seed,
              cohort.id,
              cohort.arrivalCount,
              'distance',
            ) * 4,
          );
        priceTicks =
          side === 'buy'
            ? Math.max(
                1,
                (view.bestBidTicks ?? mid - 1) - distance,
              )
            : (view.bestAskTicks ?? mid + 1) + distance;
      }
    }
    const sizeUnit = stableUnit(
      state.seed,
      cohort.id,
      cohort.arrivalCount,
      'quantity',
    );
    let quantity = Math.max(
      1,
      Math.min(
        maximumQty,
        1 + Math.floor(sizeUnit * sizeUnit * maximumQty),
      ),
    );
    if (side === 'buy') {
      quantity = Math.min(
        quantity,
        maximumRestingBuyQuantity(state, account, priceTicks),
      );
    } else {
      quantity = Math.min(quantity, maximumSellQuantity(account));
    }
    if (quantity > 0) {
      cohort.orderCount += 1;
      if (side === 'buy') cohort.buyOrderCount += 1;
      else cohort.sellOrderCount += 1;
      if (aggressive) cohort.aggressiveOrderCount += 1;
      else cohort.passiveOrderCount += 1;
      const receipt = submitOrder(state, {
        ownerId: cohort.id,
        role: 'flow',
        behavior: cohort.behavior,
        side,
        priceTicks,
        quantity,
        tif: aggressive ? 'IOC' : 'GTC',
      });
      if (
        !aggressive &&
        receipt.orderId &&
        receipt.remainingQuantity > 0
      ) {
        const expiryJitter = Math.round(
          stableUnit(
            state.seed,
            cohort.id,
            cohort.arrivalCount,
            'expiry',
          ) * cohort.patienceMs,
        );
        scheduleEvent(
          state,
          'expire_order',
          state.nowMs +
            Math.max(250, cohort.patienceMs + expiryJitter),
          EVENT_PRIORITY.EXPIRE,
          { orderId: receipt.orderId },
        );
      }
    }
  }

  updateObservedMarketRisk(state);
  scheduleEvent(
    state,
    'flow_arrival',
    state.nowMs + nextFlowDelay(state, cohort),
    EVENT_PRIORITY.FLOW,
    { cohortId: cohort.id },
  );
}

function updateMakerCapitalAndCapacity(state, maker, view) {
  const account = state.accounts[maker.id];
  const equityCents =
    account.cashCents +
    account.holdings * state.lastPriceTicks -
    account.creditUsedCents;
  maker.capital.currentEquityCents = equityCents;
  maker.capital.peakEquityCents = Math.max(
    maker.capital.peakEquityCents,
    equityCents,
  );
  const totalMakerFills = Object.values(state.makers).reduce(
    (total, candidate) => total + candidate.frameFillUnits,
    0,
  );
  const frameShareBps =
    totalMakerFills === 0
      ? 0
      : Math.round(
          (maker.frameFillUnits * 10_000) / totalMakerFills,
        );
  maker.capacity.footprintBps = Math.round(
    maker.capacity.footprintBps * 0.78 +
      frameShareBps * 0.22,
  );
  const patternSample = clamp(
    Math.round(
      frameShareBps * 0.7 +
        Math.min(3_000, maker.orderStats.cancelCount * 8) +
        Math.min(2_000, maker.risk.staleFillCount * 20),
    ),
    0,
    10_000,
  );
  maker.capacity.opponentLearningBps = Math.round(
    maker.capacity.opponentLearningBps * 0.84 +
      patternSample * 0.16,
  );
  const drawdownBps =
    maker.capital.peakEquityCents <= 0
      ? 0
      : Math.max(
          0,
          Math.round(
            ((maker.capital.peakEquityCents - equityCents) *
              10_000) /
              maker.capital.peakEquityCents,
          ),
        );
  maker.capacity.marginalSizeMultiplierBps = clamp(
    10_000 -
      Math.round(maker.capacity.footprintBps * 0.36) -
      Math.round(
        maker.capacity.opponentLearningBps * 0.29,
      ) -
      Math.round(drawdownBps * 0.2) -
      Math.round(maker.risk.toxicityEwmaBps * 0.15),
    1_800,
    10_000,
  );
  const inventoryGap = Math.abs(
    account.holdings - maker.inventoryTargetUnits,
  );
  const exitDepth = Math.max(
    1,
    view.totalDepthUnits -
      maker.frameFillUnits +
      Math.round(maker.baseOrderUnits / 2),
  );
  maker.capacity.exitCostCents = Math.round(
    inventoryGap *
      Math.max(1, view.spreadTicks ?? 2) +
      ((inventoryGap + maker.tradeStats.fillUnits * 0.08) ** 2) /
        exitDepth +
      (maker.capacity.footprintBps *
        Math.max(1, maker.capitalMultiplier)) /
        8,
  );
}

function publishQuoteFrame(state) {
  updateObservedMarketRisk(state);
  const view = bookView(state);
  const makers = Object.values(state.makers);
  const frameLeader = [...makers].sort(
    (left, right) =>
      right.frameFillUnits - left.frameFillUnits ||
      left.id.localeCompare(right.id),
  )[0]?.id ?? null;
  if (
    frameLeader &&
    state.lastFrameLeaderId &&
    frameLeader !== state.lastFrameLeaderId
  ) {
    state.leadingMakerChanges += 1;
  }
  state.lastFrameLeaderId = frameLeader;

  for (const maker of makers) {
    if (maker.frameMarkoutCount === 0) {
      maker.risk.toxicityEwmaBps = Math.round(
        maker.risk.toxicityEwmaBps * 0.86,
      );
    }
    updateMakerCapitalAndCapacity(state, maker, view);
  }
  const frameTrades = state.trades.filter(
    (trade) =>
      trade.virtualMs > state.lastQuoteFrameMs &&
      trade.virtualMs <= state.nowMs,
  );
  const publicValuation = latestPublishedValuationAt(state);
  const frame = {
    sequence: state.nextQuoteFrameSequence,
    virtualMs: state.nowMs,
    regime: currentRegimeId(state),
    lastPriceTicks: state.lastPriceTicks,
    valuationObservationId: publicValuation.id,
    valuationObservationVersion: publicValuation.version,
    valuationLowTicks: publicValuation.estimate.lowTicks,
    valuationCenterTicks: publicValuation.estimate.centerTicks,
    valuationHighTicks: publicValuation.estimate.highTicks,
    bestBidTicks: view.bestBidTicks,
    bestAskTicks: view.bestAskTicks,
    spreadTicks: view.spreadTicks,
    bidDepthUnits: view.bidDepthUnits,
    askDepthUnits: view.askDepthUnits,
    totalDepthUnits: view.totalDepthUnits,
    imbalanceBps: view.imbalanceBps,
    toxicityBps: state.toxicityBps,
    volatilityTicks: state.volatilityTicks,
    tradeCount: frameTrades.length,
    lastTradeSequence: state.nextTradeSequence - 1,
    volumeUnits: frameTrades.reduce(
      (total, trade) => total + trade.quantity,
      0,
    ),
    withdrawingMakerCount: makers.filter(
      (maker) =>
        maker.quoteState === 'REDUCE_SIZE' ||
        maker.quoteState === 'WITHDRAWN',
    ).length,
    leadingMakerId: frameLeader,
    makerDepthUnits: Object.fromEntries(
      makers.map((maker) => {
        const orders = activeOrders(
          state,
          (order) => order.ownerId === maker.id,
        );
        return [
          maker.id,
          {
            bidUnits: orders
              .filter((order) => order.side === 'buy')
              .reduce(
                (total, order) => total + order.remainingQty,
                0,
              ),
            askUnits: orders
              .filter((order) => order.side === 'sell')
              .reduce(
                (total, order) => total + order.remainingQty,
                0,
              ),
          },
        ];
      }),
    ),
  };
  state.nextQuoteFrameSequence += 1;
  state.quoteFrames.push(frame);
  if (
    state.quoteFrames.length >
    state.config.maxRetainedQuoteFrames
  ) {
    const archived = state.quoteFrames.shift();
    state.quoteFrameArchive.count += 1;
    state.quoteFrameArchive.tradeCount += archived.tradeCount;
    state.quoteFrameArchive.volumeUnits += archived.volumeUnits;
    state.quoteFrameArchive.twoSidedCount +=
      archived.bestBidTicks &&
      archived.bestAskTicks &&
      archived.bestBidTicks < archived.bestAskTicks
        ? 1
        : 0;
    state.quoteFrameArchive.depthUnitSum += archived.totalDepthUnits;
    state.quoteFrameArchive.spreadTickSum += archived.spreadTicks ?? 0;
    state.quoteFrameArchive.firstVirtualMs ??= archived.virtualMs;
    state.quoteFrameArchive.lastVirtualMs = archived.virtualMs;
  }
  state.lastQuoteFrameMs = state.nowMs;
  for (const maker of makers) {
    maker.frameFillUnits = 0;
    maker.frameMarkoutCount = 0;
  }

  for (const account of Object.values(state.accounts)) {
    if (account.creditUsedCents <= 0) continue;
    const protectedCash = Math.ceil(
      account.reservedBuyCents * 1.05,
    );
    const repay = Math.min(
      account.creditUsedCents,
      Math.max(0, account.cashCents - protectedCash),
      2_000,
    );
    if (repay <= 0) continue;
    account.cashCents -= repay;
    account.creditUsedCents -= repay;
    state.creditPool.cashCents += repay;
  }
  rebuildReservations(state);
  pruneTerminalOrders(state);
  scheduleEvent(
    state,
    'quote_frame',
    state.nowMs + QUOTE_FRAME_MS,
    EVENT_PRIORITY.QUOTE_FRAME,
  );
}

function processEvent(state, event) {
  state.nowMs = event.scheduledMs;
  if (event.type === 'valuation_observation') {
    publishValuationObservation(state, event);
  } else if (event.type === 'maker_decision') {
    handleMakerDecision(state, event);
  } else if (event.type === 'maker_apply') {
    handleMakerApply(state, event);
  } else if (event.type === 'flow_arrival') {
    handleFlowArrival(state, event);
  } else if (event.type === 'markout') {
    processMarkout(state, event);
  } else if (event.type === 'expire_order') {
    cancelOrder(state, event.payload.orderId, 'flow_expiry');
  } else if (event.type === 'quote_frame') {
    publishQuoteFrame(state);
  } else {
    throw new Error(`Unknown maker ecology event ${event.type}.`);
  }
  state.processedEventCount += 1;
}

function createMakerState(template, multiplier, referencePriceTicks) {
  const inventoryTargetUnits = Math.max(
    20,
    Math.round(template.holdings * multiplier),
  );
  const initialCashCents = Math.max(
    1,
    Math.round(template.cashCents * multiplier),
  );
  const initialEquityCents =
    initialCashCents +
    inventoryTargetUnits * referencePriceTicks;
  return {
    ...cloneJson(template),
    capitalMultiplier: multiplier,
    inventoryTargetUnits,
    inventoryCapacityUnits: Math.max(
      20,
      Math.round(inventoryTargetUnits * 0.72),
    ),
    // Capital affects quote size exactly once inside computeMakerQuotePlan.
    // Keeping the template base here makes standalone and adapter policies use
    // the same square-root capacity scaling.
    baseOrderUnits: template.baseOrderUnits,
    quoteState: 'ACTIVE',
    decisionCount: 0,
    lastDecisionMs: null,
    lastApplyMs: null,
    latestPlan: null,
    cancelTimestamps: [],
    frameFillUnits: 0,
    frameMarkoutCount: 0,
    orderStats: {
      submitCount: 0,
      cancelCount: 0,
      cancelThrottleCount: 0,
      priorityPreservedCount: 0,
      priorityLostCount: 0,
      queueAheadUnits: 0,
    },
    tradeStats: {
      fillCount: 0,
      fillUnits: 0,
      notionalCents: 0,
    },
    risk: {
      toxicityEwmaBps: 0,
      stressBps: 0,
      staleFillCount: 0,
      staleExposureCents: 0,
      realizedAdverseSelectionCents: 0,
    },
    capital: {
      initialEquityCents,
      currentEquityCents: initialEquityCents,
      peakEquityCents: initialEquityCents,
    },
    capacity: {
      footprintBps: 0,
      opponentLearningBps: 0,
      marginalSizeMultiplierBps: 10_000,
      exitCostCents: 0,
    },
  };
}

/**
 * Returns a JSON policy profile that can be bound directly to an authoritative
 * simulator snapshot. It contains no book, clock, account or price authority.
 */
export function createMakerPolicyProfile(
  makerId,
  {
    capitalMultiplier = 1,
    inventoryTargetUnits = null,
    inventoryCapacityUnits = null,
  } = {},
) {
  const template = MAKER_TEMPLATES[makerId];
  const defaultInventoryTargetUnits = Math.max(
    20,
    Math.round(template?.holdings * capitalMultiplier),
  );
  const resolvedInventoryTargetUnits =
    inventoryTargetUnits ?? defaultInventoryTargetUnits;
  const resolvedInventoryCapacityUnits =
    inventoryCapacityUnits ??
    Math.max(
      20,
      Math.round(template?.holdings * capitalMultiplier * 0.72),
    );
  if (
    !template ||
    typeof capitalMultiplier !== 'number' ||
    !Number.isFinite(capitalMultiplier) ||
    capitalMultiplier <= 0 ||
    capitalMultiplier > 20 ||
    !isNonNegativeInteger(resolvedInventoryTargetUnits) ||
    !isPositiveInteger(resolvedInventoryCapacityUnits)
  ) {
    throw new Error('Invalid maker policy profile request.');
  }
  return cloneJson({
    ...template,
    policyStateVersion: MAKER_POLICY_STATE_VERSION,
    capitalMultiplier,
    inventoryTargetUnits: resolvedInventoryTargetUnits,
    inventoryCapacityUnits: resolvedInventoryCapacityUnits,
    quoteState: 'ACTIVE',
    binding: null,
    cursor: {
      frameSequence: null,
      virtualMs: null,
      commitSeq: null,
      lastMarkoutSequence: 0,
    },
    risk: {
      toxicityEwmaBps: 0,
      stressBps: 0,
      staleFillCount: 0,
      staleExposureCents: 0,
      realizedAdverseSelectionCents: 0,
    },
    capital: {
      initialEquityCents: null,
      currentEquityCents: null,
      peakEquityCents: null,
    },
    capacity: {
      footprintBps: 0,
      opponentLearningBps: 0,
      marginalSizeMultiplierBps: 10_000,
      exitCostCents: 0,
    },
  });
}

/**
 * Advances a production-facing maker policy from one authoritative 3-second
 * observation frame. The host simulator remains responsible for constructing
 * the frame from its own book, accounts, fills and exact 500ms markouts.
 *
 * This reducer never owns a clock, price, order, account or trade. It is pure,
 * fail-closed, deterministic and JSON serializable so its result can live in
 * the authoritative simulator checkpoint.
 */
export function reduceMakerPolicyState(policyInput, frameInput) {
  if (
    !policyInput ||
    policyInput.policyStateVersion !== MAKER_POLICY_STATE_VERSION ||
    !frameInput ||
    frameInput.version !== MAKER_POLICY_FRAME_VERSION
  ) {
    throw new Error('Invalid maker policy state or observation frame version.');
  }
  const policy = cloneJson(policyInput);
  const frame = cloneJson(frameInput);
  assertNonEmptyString(frame.actorId, 'maker policy frame actor id');
  assertNonEmptyString(frame.symbol, 'maker policy frame symbol');
  const expectedFrameMs =
    frame.frameSequence * QUOTE_FRAME_MS;
  if (
    !isPositiveInteger(frame.frameSequence) ||
    !isNonNegativeInteger(frame.virtualMs) ||
    !Number.isSafeInteger(expectedFrameMs) ||
    frame.virtualMs !== expectedFrameMs ||
    !isNonNegativeInteger(frame.commitSeq) ||
    !REGIME_PRESETS[frame.regime]
  ) {
    throw new Error('Invalid maker policy frame cursor or regime.');
  }
  const previousCursor = policy.cursor;
  if (
    !previousCursor ||
    !isNonNegativeInteger(previousCursor.lastMarkoutSequence) ||
    !(
      (previousCursor.frameSequence === null &&
        previousCursor.virtualMs === null &&
        previousCursor.commitSeq === null) ||
      (isPositiveInteger(previousCursor.frameSequence) &&
        isNonNegativeInteger(previousCursor.virtualMs) &&
        isNonNegativeInteger(previousCursor.commitSeq))
    )
  ) {
    throw new Error('Invalid maker policy cursor.');
  }
  if (
    previousCursor.frameSequence !== null &&
    (frame.frameSequence !== previousCursor.frameSequence + 1 ||
      frame.virtualMs !== previousCursor.virtualMs + QUOTE_FRAME_MS ||
      frame.commitSeq < previousCursor.commitSeq)
  ) {
    throw new Error('Maker policy frame is duplicate, missing or out of order.');
  }
  if (
    policy.binding &&
    (policy.binding.actorId !== frame.actorId ||
      policy.binding.symbol !== frame.symbol)
  ) {
    throw new Error('Maker policy frame identity does not match its binding.');
  }

  const market = frame.market;
  const account = frame.account;
  const activity = frame.activity;
  const integerMarketFields = [
    market?.lastPriceTicks,
    market?.externalBidDepthUnits,
    market?.externalAskDepthUnits,
    market?.ownMakerFillUnits,
    market?.allMakerFillUnits,
  ];
  const integerAccountFields = [
    account?.cashCents,
    account?.reservedCashCents,
    account?.holdingsUnits,
    account?.reservedHoldingsUnits,
    account?.creditUsedCents,
  ];
  const integerActivityFields = [
    activity?.submitCount,
    activity?.cancelCount,
  ];
  if (
    !isPositiveInteger(market?.lastPriceTicks) ||
    integerMarketFields.slice(1).some(
      (value) => !isNonNegativeInteger(value),
    ) ||
    market.ownMakerFillUnits > market.allMakerFillUnits ||
    integerAccountFields.some(
      (value) => !isNonNegativeInteger(value),
    ) ||
    account.reservedCashCents > account.cashCents ||
    account.reservedHoldingsUnits > account.holdingsUnits ||
    integerActivityFields.some(
      (value) => !isNonNegativeInteger(value),
    ) ||
    !Array.isArray(activity?.markouts) ||
    activity.markouts.length > 4_096
  ) {
    throw new Error('Invalid maker policy frame resources or activity.');
  }
  const hasBid = market.bestBidTicks !== null;
  const hasAsk = market.bestAskTicks !== null;
  if (
    (hasBid && !isPositiveInteger(market.bestBidTicks)) ||
    (hasAsk && !isPositiveInteger(market.bestAskTicks)) ||
    (hasBid &&
      hasAsk &&
      market.bestBidTicks >= market.bestAskTicks)
  ) {
    throw new Error('Invalid maker policy frame market view.');
  }
  if (
    !isPositiveInteger(policy.inventoryCapacityUnits) ||
    !isNonNegativeInteger(policy.inventoryTargetUnits) ||
    !isNonNegativeInteger(policy.creditLimitCents) ||
    account.creditUsedCents > policy.creditLimitCents ||
    !['ACTIVE', 'WIDEN', 'REDUCE_SIZE', 'WITHDRAWN'].includes(
      policy.quoteState,
    ) ||
    !Number.isFinite(policy.capitalMultiplier) ||
    policy.capitalMultiplier <= 0 ||
    policy.capitalMultiplier > 20
  ) {
    throw new Error('Invalid maker policy inventory or capital configuration.');
  }

  let toxicityEwmaBps = policy.risk?.toxicityEwmaBps;
  let realizedAdverseSelectionCents =
    policy.risk?.realizedAdverseSelectionCents;
  if (
    !isNonNegativeInteger(toxicityEwmaBps) ||
    toxicityEwmaBps > 10_000 ||
    !isNonNegativeInteger(realizedAdverseSelectionCents)
  ) {
    throw new Error('Invalid maker policy risk state.');
  }
  let lastMarkoutSequence = previousCursor.lastMarkoutSequence;
  const markoutIds = new Set();
  const markoutWindowStartMs =
    previousCursor.virtualMs ??
    frame.virtualMs - QUOTE_FRAME_MS;
  for (const markout of activity.markouts) {
    if (
      !isPositiveInteger(markout?.tradeSequence) ||
      markout.tradeSequence <= lastMarkoutSequence ||
      typeof markout.tradeId !== 'string' ||
      markout.tradeId.length === 0 ||
      markoutIds.has(markout.tradeId) ||
      markout.actorId !== frame.actorId ||
      !isNonNegativeInteger(markout.tradeMs) ||
      !isNonNegativeInteger(markout.markoutMs) ||
      markout.markoutMs !== markout.tradeMs + MARKOUT_DELAY_MS ||
      markout.markoutMs <= markoutWindowStartMs ||
      markout.markoutMs > frame.virtualMs ||
      !['buy', 'sell'].includes(markout.side) ||
      !isPositiveInteger(markout.quantity) ||
      !isPositiveInteger(markout.executionPriceTicks) ||
      !isPositiveInteger(markout.markPriceTicks)
    ) {
      throw new Error('Invalid authoritative maker markout.');
    }
    const adverseTicks =
      markout.side === 'buy'
        ? Math.max(
            0,
            markout.executionPriceTicks - markout.markPriceTicks,
          )
        : Math.max(
            0,
            markout.markPriceTicks - markout.executionPriceTicks,
          );
    const adverseCents = adverseTicks * markout.quantity;
    if (!Number.isSafeInteger(adverseCents)) {
      throw new Error('Maker markout cost exceeds the safe integer range.');
    }
    realizedAdverseSelectionCents = safeAdd(
      realizedAdverseSelectionCents,
      adverseCents,
      'maker realized adverse selection',
    );
    const sampleBps =
      adverseTicks >= 6
        ? 10_000
        : adverseTicks * 1_800;
    toxicityEwmaBps = Math.round(
      toxicityEwmaBps * 0.86 + sampleBps * 0.14,
    );
    markoutIds.add(markout.tradeId);
    lastMarkoutSequence = markout.tradeSequence;
  }
  if (activity.markouts.length === 0) {
    toxicityEwmaBps = Math.round(toxicityEwmaBps * 0.86);
  }

  const fillShareBps =
    market.allMakerFillUnits === 0
      ? 0
      : safeRatioBps(
          market.ownMakerFillUnits,
          market.allMakerFillUnits,
          'maker fill share',
        );
  const oldFootprintBps = policy.capacity?.footprintBps;
  const oldOpponentLearningBps =
    policy.capacity?.opponentLearningBps;
  if (
    !isNonNegativeInteger(oldFootprintBps) ||
    oldFootprintBps > 10_000 ||
    !isNonNegativeInteger(oldOpponentLearningBps) ||
    oldOpponentLearningBps > 10_000
  ) {
    throw new Error('Invalid maker policy capacity state.');
  }
  const footprintBps = Math.round(
    oldFootprintBps * 0.78 + fillShareBps * 0.22,
  );
  const activityCount = safeAdd(
    activity.cancelCount,
    activity.submitCount,
    'maker policy activity count',
  );
  const cancelIntensityBps =
    activityCount === 0
      ? 0
      : safeRatioBps(
          activity.cancelCount,
          activityCount,
          'maker cancel intensity',
        );
  const patternSampleBps = clamp(
    Math.round(
      fillShareBps * 0.6 +
        cancelIntensityBps * 0.2 +
        toxicityEwmaBps * 0.2,
    ),
    0,
    10_000,
  );
  const opponentLearningBps = Math.round(
    oldOpponentLearningBps * 0.84 +
      patternSampleBps * 0.16,
  );

  const midTicks =
    hasBid && hasAsk
      ? market.bestBidTicks +
        Math.round(
          (market.bestAskTicks - market.bestBidTicks) / 2,
        )
      : market.lastPriceTicks;
  const holdingsValueCents =
    account.holdingsUnits * midTicks;
  if (!Number.isSafeInteger(holdingsValueCents)) {
    throw new Error('Maker policy equity exceeds the safe integer range.');
  }
  const equityCents = safeAdd(
    account.cashCents,
    holdingsValueCents,
    'maker policy equity',
  ) - account.creditUsedCents;
  if (!isNonNegativeInteger(equityCents)) {
    throw new Error('Invalid maker policy equity.');
  }
  const initialEquityCents =
    policy.capital?.initialEquityCents ?? equityCents;
  const peakEquityCents = Math.max(
    policy.capital?.peakEquityCents ?? equityCents,
    equityCents,
  );
  if (
    !isNonNegativeInteger(initialEquityCents) ||
    !isNonNegativeInteger(peakEquityCents)
  ) {
    throw new Error('Invalid maker policy capital state.');
  }
  const drawdownBps =
    peakEquityCents === 0
      ? 0
      : safeRatioBps(
          Math.max(0, peakEquityCents - equityCents),
          peakEquityCents,
          'maker drawdown',
        );
  const inventoryGapUnits = Math.abs(
    account.holdingsUnits - policy.inventoryTargetUnits,
  );
  const inventoryStressBps = safeRatioBps(
    inventoryGapUnits,
    policy.inventoryCapacityUnits,
    'maker inventory stress',
  );
  const creditLimitCents = policy.creditLimitCents;
  const creditStressBps =
    creditLimitCents === 0
      ? 0
      : safeRatioBps(
          account.creditUsedCents,
          creditLimitCents,
          'maker credit stress',
        );
  const commitmentStressBps = Math.max(
    creditStressBps,
    safeRatioBps(
      account.reservedCashCents,
      Math.max(1, account.cashCents),
      'maker cash commitment stress',
    ),
  );
  const regime = REGIME_PRESETS[frame.regime];
  const stressBps = clamp(
    Math.round(
      regime.commonStressBps * 0.95 +
        inventoryStressBps * 0.14 +
        commitmentStressBps * 0.08 +
        toxicityEwmaBps * 0.1 +
        drawdownBps * 0.06,
    ),
    0,
    10_000,
  );
  const quoteState = quoteStateForStress(
    policy.quoteState,
    stressBps,
    frame.regime,
  );
  const marginalSizeMultiplierBps = clamp(
    10_000 -
      Math.round(footprintBps * 0.36) -
      Math.round(opponentLearningBps * 0.29) -
      Math.round(drawdownBps * 0.2) -
      Math.round(toxicityEwmaBps * 0.15),
    1_800,
    10_000,
  );
  let exitCostCents = 0;
  if (inventoryGapUnits > 0) {
    const exitDepthUnits =
      account.holdingsUnits > policy.inventoryTargetUnits
        ? market.externalBidDepthUnits
        : market.externalAskDepthUnits;
    const spreadTicks =
      hasBid && hasAsk
        ? market.bestAskTicks - market.bestBidTicks
        : 2;
    const quadraticExitCost =
      inventoryGapUnits * inventoryGapUnits;
    if (!Number.isSafeInteger(quadraticExitCost)) {
      throw new Error('Maker exit cost exceeds the safe integer range.');
    }
    exitCostCents = Math.round(
      inventoryGapUnits * Math.max(1, spreadTicks) +
        quadraticExitCost / Math.max(1, exitDepthUnits) +
        footprintBps * Math.max(1, policy.capitalMultiplier) / 8,
    );
    if (!isNonNegativeInteger(exitCostCents)) {
      throw new Error('Invalid maker exit cost.');
    }
  }

  policy.binding = {
    actorId: frame.actorId,
    symbol: frame.symbol,
  };
  policy.cursor = {
    frameSequence: frame.frameSequence,
    virtualMs: frame.virtualMs,
    commitSeq: frame.commitSeq,
    lastMarkoutSequence,
  };
  policy.quoteState = quoteState;
  policy.risk = {
    ...policy.risk,
    toxicityEwmaBps,
    stressBps,
    realizedAdverseSelectionCents,
  };
  policy.capital = {
    initialEquityCents,
    currentEquityCents: equityCents,
    peakEquityCents,
  };
  policy.capacity = {
    ...policy.capacity,
    footprintBps,
    opponentLearningBps,
    marginalSizeMultiplierBps,
    exitCostCents,
  };
  return policy;
}

function createFlowState(template) {
  return {
    ...cloneJson(template),
    arrivalCount: 0,
    orderCount: 0,
    buyOrderCount: 0,
    sellOrderCount: 0,
    aggressiveOrderCount: 0,
    passiveOrderCount: 0,
    fillUnits: 0,
    realizedWinnerSales: 0,
    realizedLoserSales: 0,
    deferredLoserSales: 0,
    staleQuoteTakeCount: 0,
  };
}

/**
 * Creates a deterministic standalone ecology fixture. The fixture is useful
 * for stress/property tests and research calibration; it is not a second
 * production settlement authority.
 */
export function createMakerEcology(options = {}) {
  const seed =
    typeof options.seed === 'string' && options.seed.length > 0
      ? options.seed
      : null;
  if (!seed) throw new Error('seed must be a non-empty string.');
  const referencePriceTicks =
    options.referencePriceTicks ?? 2_000;
  if (!isPositiveInteger(referencePriceTicks)) {
    throw new Error('referencePriceTicks must be a positive integer.');
  }
  if (
    !Array.isArray(options.valuationObservations) ||
    options.valuationObservations.length === 0
  ) {
    throw new Error(
      'valuationObservations must contain an authoritative observation at virtualMs 0.',
    );
  }
  const valuationObservations = options.valuationObservations.map(
    validateValuationObservation,
  );
  const valuationIds = new Set();
  let previousValuation = null;
  for (const [index, observation] of valuationObservations.entries()) {
    if (
      valuationIds.has(observation.id) ||
      (index === 0 && observation.publishedMs !== 0) ||
      (previousValuation &&
        (observation.symbol !== previousValuation.symbol ||
          observation.publishedMs <= previousValuation.publishedMs ||
          observation.asOfMs < previousValuation.asOfMs ||
          observation.priorCenterTicks !==
            previousValuation.estimate.centerTicks))
    ) {
      throw new Error('valuationObservations must form one ordered public chain.');
    }
    valuationIds.add(observation.id);
    previousValuation = observation;
  }
  const symbol = valuationObservations[0].symbol;
  const makerIds =
    options.makerIds ?? Object.keys(MAKER_TEMPLATES);
  if (
    !Array.isArray(makerIds) ||
    makerIds.length === 0 ||
    new Set(makerIds).size !== makerIds.length ||
    makerIds.some((id) => !MAKER_TEMPLATES[id])
  ) {
    throw new Error('makerIds contains an unknown or duplicate maker.');
  }
  const regimeSchedule = validateRegimeSchedule(
    options.regimeSchedule ?? defaultRegimeSchedule(),
  );
  const maxRetainedQuoteFrames =
    options.maxRetainedQuoteFrames ?? MAX_QUOTE_FRAMES;
  if (
    !isPositiveInteger(maxRetainedQuoteFrames) ||
    maxRetainedQuoteFrames > MAX_QUOTE_FRAMES
  ) {
    throw new Error('maxRetainedQuoteFrames is outside the bounded range.');
  }
  const capitalMultipliers = options.capitalMultipliers ?? {};
  const makers = {};
  const accounts = {};
  for (const makerId of makerIds) {
    const multiplier = capitalMultipliers[makerId] ?? 1;
    if (
      typeof multiplier !== 'number' ||
      !Number.isFinite(multiplier) ||
      multiplier <= 0 ||
      multiplier > 20
    ) {
      throw new Error(`Invalid capital multiplier for ${makerId}.`);
    }
    const template = MAKER_TEMPLATES[makerId];
    const maker = createMakerState(
      template,
      multiplier,
      referencePriceTicks,
    );
    makers[makerId] = maker;
    accounts[makerId] = {
      id: makerId,
      kind: 'maker',
      cashCents: Math.round(template.cashCents * multiplier),
      holdings: maker.inventoryTargetUnits,
      costBasisTicks: referencePriceTicks,
      creditLimitCents: Math.round(
        template.creditLimitCents * multiplier,
      ),
      creditUsedCents: 0,
      reservedBuyCents: 0,
      reservedSellUnits: 0,
      reservedCreditCents: 0,
    };
  }
  const flowCohorts = {};
  for (const template of Object.values(FLOW_TEMPLATES)) {
    const cohort = createFlowState(template);
    flowCohorts[cohort.id] = cohort;
    accounts[cohort.id] = {
      id: cohort.id,
      kind: 'flow',
      cashCents: cohort.cashCents,
      holdings: cohort.holdings,
      costBasisTicks: Math.max(
        1,
        Math.round(
          (cohort.initialCostBasisTicks * referencePriceTicks) /
            2_000,
        ),
      ),
      creditLimitCents: 0,
      creditUsedCents: 0,
      reservedBuyCents: 0,
      reservedSellUnits: 0,
      reservedCreditCents: 0,
    };
  }

  const creditPoolCents = Math.max(
    30_000_000,
    Object.values(accounts).reduce(
      (total, account) => total + account.creditLimitCents,
      0,
    ) * 2,
  );
  const state = {
    schemaVersion: SCHEMA_VERSION,
    seed,
    config: {
      symbol,
      referencePriceTicks,
      makerIds: [...makerIds],
      capitalMultipliers: cloneJson(capitalMultipliers),
      regimeSchedule,
      maxRetainedQuoteFrames,
    },
    nowMs: 0,
    referencePriceTicks,
    lastPriceTicks: referencePriceTicks,
    volatilityTicks: 1,
    toxicityBps: 0,
    nextEventSequence: 1,
    nextOrderSequence: 1,
    nextBookSequence: 1,
    nextTradeSequence: 1,
    nextQuoteFrameSequence: 1,
    processedEventCount: 0,
    lastQuoteFrameMs: 0,
    lastFrameLeaderId: null,
    leadingMakerChanges: 0,
    eventQueue: [],
    book: { orders: {} },
    archivedOrderCount: 0,
    trades: [],
    totalTradeCount: 0,
    totalTradeVolumeUnits: 0,
    tradeArchive: {
      count: 0,
      volumeUnits: 0,
      throughMs: 0,
    },
    quoteFrames: [],
    quoteFrameArchive: {
      count: 0,
      tradeCount: 0,
      volumeUnits: 0,
      twoSidedCount: 0,
      depthUnitSum: 0,
      spreadTickSum: 0,
      firstVirtualMs: null,
      lastVirtualMs: null,
    },
    marketHistory: [],
    signedFlow: [],
    uniqueTradePrices: [],
    totalUniqueTradePriceCount: 0,
    publishedValuations: [cloneJson(valuationObservations[0])],
    latestValuationObservationId: valuationObservations[0].id,
    accounts,
    makers,
    flowCohorts,
    creditPool: {
      cashCents: creditPoolCents,
      reservedCents: 0,
      initialCashCents: creditPoolCents,
    },
    initialTotals: null,
  };
  recordMarketObservation(state);
  for (const observation of valuationObservations.slice(1)) {
    scheduleEvent(
      state,
      'valuation_observation',
      observation.publishedMs,
      EVENT_PRIORITY.VALUATION,
      { observation },
    );
  }
  for (const maker of Object.values(makers)) {
    const phase = Math.round(
      stableUnit(seed, maker.id, 'opening-phase') *
        maker.quoteCadenceMs,
    );
    scheduleEvent(
      state,
      'maker_decision',
      phase,
      EVENT_PRIORITY.MAKER_DECISION,
      { makerId: maker.id },
    );
  }
  for (const cohort of Object.values(flowCohorts)) {
    const phase = Math.max(
      25,
      Math.round(
        stableUnit(seed, cohort.id, 'opening-phase') *
          cohort.baseIntervalMs,
      ),
    );
    scheduleEvent(
      state,
      'flow_arrival',
      phase,
      EVENT_PRIORITY.FLOW,
      { cohortId: cohort.id },
    );
  }
  scheduleEvent(
    state,
    'quote_frame',
    QUOTE_FRAME_MS,
    EVENT_PRIORITY.QUOTE_FRAME,
  );
  state.initialTotals = resourceTotals(state);
  return state;
}

/**
 * Adds a future observation to the public valuation feed without changing any
 * order or trade price. Publication is an ordinary deterministic event.
 */
export function enqueueValuationObservation(state, input) {
  if (state?.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('Invalid maker ecology state.');
  }
  const observation = validateValuationObservation(input);
  const scheduledObservations = state.eventQueue
    .filter((event) => event.type === 'valuation_observation')
    .map((event) => event.payload.observation);
  const latest = [
    ...state.publishedValuations,
    ...scheduledObservations,
  ].sort(
    (left, right) =>
      left.publishedMs - right.publishedMs ||
      left.id.localeCompare(right.id),
  ).at(-1);
  if (
    observation.symbol !== state.config.symbol ||
    observation.publishedMs <= state.nowMs ||
    !latest ||
    observation.publishedMs <= latest.publishedMs ||
    observation.asOfMs < latest.asOfMs ||
    observation.priorCenterTicks !== latest.estimate.centerTicks ||
    state.publishedValuations.some(
      (candidate) => candidate.id === observation.id,
    ) ||
    scheduledObservations.some(
      (candidate) => candidate.id === observation.id,
    )
  ) {
    throw new Error('Valuation observation is duplicate or out of chain.');
  }
  scheduleEvent(
    state,
    'valuation_observation',
    observation.publishedMs,
    EVENT_PRIORITY.VALUATION,
    { observation },
  );
  return observation.id;
}

export function advanceMakerEcology(state, targetMs) {
  if (
    state?.schemaVersion !== SCHEMA_VERSION ||
    !isNonNegativeInteger(targetMs) ||
    targetMs < state.nowMs
  ) {
    throw new Error('Invalid maker ecology advance target.');
  }
  while (
    state.eventQueue.length > 0 &&
    state.eventQueue[0].scheduledMs <= targetMs
  ) {
    const event = state.eventQueue.shift();
    processEvent(state, event);
  }
  state.nowMs = targetMs;
  return state;
}

/**
 * Executes an inventory exit against the fixture's live FIFO book. This is an
 * observable liquidity-capacity experiment, not a theoretical cost estimate:
 * own quotes are cancelled, the IOC remainder is never invented, and the
 * returned slippage is calculated from actual fills.
 */
export function executeMakerInventoryExit(
  state,
  makerId,
  { targetUnits = null } = {},
) {
  if (state?.schemaVersion !== SCHEMA_VERSION || !state.makers[makerId]) {
    throw new Error('Unknown maker exit target.');
  }
  const maker = state.makers[makerId];
  const account = state.accounts[makerId];
  const desiredTarget =
    targetUnits === null ? maker.inventoryTargetUnits : targetUnits;
  if (!isNonNegativeInteger(desiredTarget)) {
    throw new Error('targetUnits must be a non-negative integer.');
  }
  const requestedMs = state.nowMs;
  let executionMs = state.nowMs + 1;
  if (executionMs % QUOTE_FRAME_MS === 0) executionMs += 1;
  advanceMakerEcology(state, executionMs);
  const viewBefore = bookView(state);
  const midBefore =
    viewBefore.bestBidTicks !== null &&
    viewBefore.bestAskTicks !== null
      ? Math.round(
          (viewBefore.bestBidTicks + viewBefore.bestAskTicks) / 2,
        )
      : state.lastPriceTicks;
  const cancelledOrderIds = [];
  for (const order of activeOrders(
    state,
    (candidate) => candidate.ownerId === makerId,
  )) {
    if (cancelOrder(state, order.id, 'inventory_exit')) {
      cancelledOrderIds.push(order.id);
    }
  }
  const quantityRequested = Math.abs(account.holdings - desiredTarget);
  if (quantityRequested === 0) {
    return {
      makerId,
      requestedMs,
      executionMs,
      side: null,
      targetUnits: desiredTarget,
      quantityRequested: 0,
      filledUnits: 0,
      unfilledUnits: 0,
      completionBps: 10_000,
      averageFillTicks: null,
      slippageTicks: 0,
      priceImpactTicks: 0,
      cancelledOrderIds,
      tradeIds: [],
    };
  }
  const side = account.holdings > desiredTarget ? 'sell' : 'buy';
  const beforeTradeSequence = state.nextTradeSequence;
  const protectionPriceTicks =
    side === 'sell'
      ? 1
      : Math.max(
          state.lastPriceTicks * 10,
          (bookView(state).bestAskTicks ?? state.lastPriceTicks) * 2,
        );
  const receipt = submitOrder(state, {
    ownerId: makerId,
    role: 'maker_exit',
    side,
    priceTicks: protectionPriceTicks,
    quantity: quantityRequested,
    tif: 'IOC',
    valuationObservationId:
      latestPublishedValuationAt(state).id,
    valuationObservationVersion:
      VALUATION_OBSERVATION_VERSION,
  });
  const exitTrades = state.trades.filter(
    (trade) =>
      trade.sequence >= beforeTradeSequence &&
      (trade.buyerId === makerId || trade.sellerId === makerId),
  );
  const filledUnits = exitTrades.reduce(
    (total, trade) => total + trade.quantity,
    0,
  );
  const averageFillTicks =
    filledUnits === 0
      ? null
      : Math.round(
          exitTrades.reduce(
            (total, trade) => total + trade.priceTicks * trade.quantity,
            0,
          ) / filledUnits,
        );
  const viewAfter = bookView(state);
  const midAfter =
    viewAfter.bestBidTicks !== null &&
    viewAfter.bestAskTicks !== null
      ? Math.round(
          (viewAfter.bestBidTicks + viewAfter.bestAskTicks) / 2,
        )
      : state.lastPriceTicks;
  const slippageTicks =
    averageFillTicks === null
      ? 0
      : Math.max(
          0,
          side === 'sell'
            ? midBefore - averageFillTicks
            : averageFillTicks - midBefore,
        );
  maker.capacity.lastExitExecution = {
    virtualMs: state.nowMs,
    side,
    quantityRequested,
    filledUnits,
    unfilledUnits: quantityRequested - filledUnits,
    averageFillTicks,
    slippageTicks,
    priceImpactTicks: Math.abs(midAfter - midBefore),
  };
  return {
    makerId,
    requestedMs,
    executionMs,
    side,
    targetUnits: desiredTarget,
    quantityRequested,
    filledUnits,
    unfilledUnits: quantityRequested - filledUnits,
    completionBps: Math.round(
      (filledUnits * 10_000) / quantityRequested,
    ),
    averageFillTicks,
    slippageTicks,
    priceImpactTicks: Math.abs(midAfter - midBefore),
    cancelledOrderIds,
    tradeIds: exitTrades.map((trade) => trade.id),
    receiptStatus: receipt.status,
  };
}

function makerSnapshot(state, maker) {
  const account = state.accounts[maker.id];
  const makerOrders = activeOrders(
    state,
    (order) => order.ownerId === maker.id,
  );
  const bidUnits = makerOrders
    .filter((order) => order.side === 'buy')
    .reduce((total, order) => total + order.remainingQty, 0);
  const askUnits = makerOrders
    .filter((order) => order.side === 'sell')
    .reduce((total, order) => total + order.remainingQty, 0);
  return {
    id: maker.id,
    name: maker.name,
    speedClass: maker.speedClass,
    latencyMs: maker.latencyMs,
    informationDelayMs: maker.informationDelayMs,
    quoteCadenceMs: maker.quoteCadenceMs,
    riskAversionBps: maker.riskAversionBps,
    adverseSelectionBps: maker.adverseSelectionBps,
    valuationWeightBps: maker.valuationWeightBps,
    baseHalfSpreadTicks: maker.baseHalfSpreadTicks,
    baseOrderUnits: maker.baseOrderUnits,
    maxLevels: maker.maxLevels,
    maxCancelsPerSecond: maker.maxCancelsPerSecond,
    capitalMultiplier: maker.capitalMultiplier,
    inventoryCapacityUnits: maker.inventoryCapacityUnits,
    quoteState: maker.quoteState,
    inventoryUnits: account.holdings,
    inventoryTargetUnits: maker.inventoryTargetUnits,
    quoteStats: {
      bidUnits,
      askUnits,
      activeOrderCount: makerOrders.length,
    },
    orderStats: cloneJson(maker.orderStats),
    tradeStats: cloneJson(maker.tradeStats),
    risk: {
      ...cloneJson(maker.risk),
      valuationStaleExposureCents:
        maker.risk.staleExposureCents,
      totalAdverseRiskCostCents:
        maker.risk.realizedAdverseSelectionCents +
        maker.risk.staleExposureCents,
      adverseSelectionCents:
        maker.risk.realizedAdverseSelectionCents,
    },
    capital: {
      ...cloneJson(maker.capital),
      pnlCents:
        maker.capital.currentEquityCents -
        maker.capital.initialEquityCents,
      returnOnCapitalBps: Math.round(
        ((maker.capital.currentEquityCents -
          maker.capital.initialEquityCents) *
          10_000) /
          Math.max(1, maker.capital.initialEquityCents),
      ),
    },
    capacity: cloneJson(maker.capacity),
    quotePlan: cloneJson(maker.latestPlan),
  };
}

function qualitySnapshot(state) {
  const frames = state.quoteFrames;
  const twoSidedFrames = frames.filter(
    (frame) =>
      isPositiveInteger(frame.bestBidTicks) &&
      isPositiveInteger(frame.bestAskTicks) &&
      frame.bestBidTicks < frame.bestAskTicks,
  );
  const makerFillUnits = Object.values(state.makers).map(
    (maker) => ({
      id: maker.id,
      units: maker.tradeStats.fillUnits,
    }),
  );
  const totalMakerFillUnits = makerFillUnits.reduce(
    (total, maker) => total + maker.units,
    0,
  );
  const leader = [...makerFillUnits].sort(
    (left, right) =>
      right.units - left.units || left.id.localeCompare(right.id),
  )[0] ?? { id: null, units: 0 };
  return {
    twoSidedFrameRatioBps:
      frames.length === 0
        ? 0
        : Math.round(
            (twoSidedFrames.length * 10_000) / frames.length,
          ),
    averageBidDepthUnits: Math.round(
      rollingMean(
        twoSidedFrames.map((frame) => frame.bidDepthUnits),
      ),
    ),
    averageAskDepthUnits: Math.round(
      rollingMean(
        twoSidedFrames.map((frame) => frame.askDepthUnits),
      ),
    ),
    averageTotalDepthUnits: Math.round(
      rollingMean(
        twoSidedFrames.map((frame) => frame.totalDepthUnits),
      ),
    ),
    averageSpreadTicks:
      twoSidedFrames.length === 0
        ? 0
        : Number(
            rollingMean(
              twoSidedFrames.map((frame) => frame.spreadTicks),
            ).toFixed(3),
          ),
    tradeCount: state.totalTradeCount,
    uniqueTradePriceCount: state.totalUniqueTradePriceCount,
    leadingMakerId: leader.id,
    leadingMakerChanges: state.leadingMakerChanges,
    maximumMakerFillShareBps:
      totalMakerFillUnits === 0
        ? 0
        : Math.round(
            (leader.units * 10_000) / totalMakerFillUnits,
          ),
  };
}

export function snapshotMakerEcology(state) {
  if (state?.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('Invalid maker ecology state.');
  }
  const view = bookView(state);
  const publicValuation = latestPublishedValuationAt(state);
  return {
    schemaVersion: state.schemaVersion,
    seed: state.seed,
    nowMs: state.nowMs,
    market: {
      lastPriceTicks: state.lastPriceTicks,
      valuationObservation: cloneJson(publicValuation),
      bestBidTicks: view.bestBidTicks,
      bestAskTicks: view.bestAskTicks,
      bids: view.bids,
      asks: view.asks,
      imbalanceBps: view.imbalanceBps,
      volatilityTicks: state.volatilityTicks,
      toxicityBps: state.toxicityBps,
      regime: currentRegimeId(state),
    },
    makers: Object.fromEntries(
      Object.values(state.makers).map((maker) => [
        maker.id,
        makerSnapshot(state, maker),
      ]),
    ),
    flowCohorts: Object.fromEntries(
      Object.values(state.flowCohorts).map((cohort) => [
        cohort.id,
        {
          id: cohort.id,
          behavior: cohort.behavior,
          finite: true,
          arrivalCount: cohort.arrivalCount,
          orderCount: cohort.orderCount,
          buyOrderCount: cohort.buyOrderCount,
          sellOrderCount: cohort.sellOrderCount,
          aggressiveOrderCount: cohort.aggressiveOrderCount,
          passiveOrderCount: cohort.passiveOrderCount,
          fillUnits: cohort.fillUnits,
          realizedWinnerSales: cohort.realizedWinnerSales,
          realizedLoserSales: cohort.realizedLoserSales,
          deferredLoserSales: cohort.deferredLoserSales,
          staleQuoteTakeCount: cohort.staleQuoteTakeCount,
          cashCents: state.accounts[cohort.id].cashCents,
          holdings: state.accounts[cohort.id].holdings,
        },
      ]),
    ),
    quoteFrames: cloneJson(state.quoteFrames),
    quoteFrameArchive: cloneJson(state.quoteFrameArchive),
    recentTrades: cloneJson(state.trades.slice(-200)),
    quality: qualitySnapshot(state),
  };
}

export function canonicalMakerEcologyState(state) {
  if (state?.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('Invalid maker ecology state.');
  }
  const checkpoint = cloneJson(state);
  delete checkpoint.checkpointIntegrity;
  checkpoint.checkpointIntegrity = {
    algorithm: CHECKPOINT_INTEGRITY_ALGORITHM,
    digest: hash32(JSON.stringify(checkpoint))
      .toString(16)
      .padStart(8, '0'),
  };
  return checkpoint;
}

function resourceTotals(state) {
  return {
    cashCents:
      state.creditPool.cashCents +
      Object.values(state.accounts).reduce(
        (total, account) => total + account.cashCents,
        0,
      ),
    inventoryUnits: Object.values(state.accounts).reduce(
      (total, account) => total + account.holdings,
      0,
    ),
    creditUsedCents: Object.values(state.accounts).reduce(
      (total, account) => total + account.creditUsedCents,
      0,
    ),
    creditPoolCents: state.creditPool.initialCashCents,
  };
}

function expectedGenesisTotals(config) {
  const makerAccounts = config.makerIds.map((makerId) => {
    const template = MAKER_TEMPLATES[makerId];
    const multiplier = config.capitalMultipliers[makerId] ?? 1;
    return {
      cashCents: Math.round(template.cashCents * multiplier),
      holdings: Math.max(
        20,
        Math.round(template.holdings * multiplier),
      ),
      creditLimitCents: Math.round(
        template.creditLimitCents * multiplier,
      ),
    };
  });
  const flowAccounts = Object.values(FLOW_TEMPLATES).map((template) => ({
    cashCents: template.cashCents,
    holdings: template.holdings,
    creditLimitCents: 0,
  }));
  const accounts = [...makerAccounts, ...flowAccounts];
  const creditPoolCents = Math.max(
    30_000_000,
    accounts.reduce(
      (total, account) => total + account.creditLimitCents,
      0,
    ) * 2,
  );
  return {
    cashCents:
      creditPoolCents +
      accounts.reduce(
        (total, account) => total + account.cashCents,
        0,
      ),
    inventoryUnits: accounts.reduce(
      (total, account) => total + account.holdings,
      0,
    ),
    creditUsedCents: 0,
    creditPoolCents,
  };
}

function reservationErrors(state) {
  const expected = Object.fromEntries(
    Object.keys(state.accounts).map((id) => [
      id,
      { buy: 0, sell: 0 },
    ]),
  );
  for (const order of activeOrders(state)) {
    if (!expected[order.ownerId]) continue;
    if (order.side === 'buy') {
      expected[order.ownerId].buy +=
        order.priceTicks * order.remainingQty;
    } else {
      expected[order.ownerId].sell += order.remainingQty;
    }
  }
  const errors = [];
  for (const account of Object.values(state.accounts)) {
    if (account.reservedBuyCents !== expected[account.id].buy) {
      errors.push(`RESERVED_BUY_MISMATCH:${account.id}`);
    }
    if (account.reservedSellUnits !== expected[account.id].sell) {
      errors.push(`RESERVED_SELL_MISMATCH:${account.id}`);
    }
    if (account.reservedSellUnits > account.holdings) {
      errors.push(`OVER_RESERVED_HOLDINGS:${account.id}`);
    }
    const expectedReservedCredit = Math.max(
      0,
      expected[account.id].buy - account.cashCents,
    );
    if (account.reservedCreditCents !== expectedReservedCredit) {
      errors.push(`RESERVED_CREDIT_MISMATCH:${account.id}`);
    }
    if (
      account.reservedBuyCents >
      account.cashCents +
        account.creditLimitCents -
        account.creditUsedCents
    ) {
      errors.push(`OVER_RESERVED_BUYING_POWER:${account.id}`);
    }
  }
  return errors;
}

export function auditMakerEcology(state) {
  const errors = [];
  if (!state || state.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      errors: ['INVALID_SCHEMA'],
      totals: {},
      initialTotals: {},
    };
  }
  if (!isNonNegativeInteger(state.nowMs)) errors.push('INVALID_CLOCK');
  try {
    const normalizedRegimes = validateRegimeSchedule(
      state.config?.regimeSchedule,
    );
    if (
      JSON.stringify(normalizedRegimes) !==
      JSON.stringify(state.config.regimeSchedule)
    ) {
      errors.push('NON_CANONICAL_REGIME_SCHEDULE');
    }
  } catch {
    errors.push('INVALID_REGIME_SCHEDULE');
  }
  if (
    !isPositiveInteger(state.config?.maxRetainedQuoteFrames) ||
    state.config.maxRetainedQuoteFrames > MAX_QUOTE_FRAMES ||
    state.quoteFrames?.length > state.config.maxRetainedQuoteFrames
  ) {
    errors.push('INVALID_QUOTE_FRAME_RETENTION');
  }
  let expectedInitialTotals = null;
  try {
    expectedInitialTotals = expectedGenesisTotals(state.config);
    if (
      JSON.stringify(state.initialTotals) !==
      JSON.stringify(expectedInitialTotals)
    ) {
      errors.push('FORGED_INITIAL_TOTALS');
    }
  } catch {
    errors.push('INVALID_GENESIS_CONFIG');
  }
  let previous = null;
  const eventIds = new Set();
  let maximumEventSequence = 0;
  for (const event of state.eventQueue) {
    if (
      !isNonNegativeInteger(event.scheduledMs) ||
      event.scheduledMs < state.nowMs ||
      !isPositiveInteger(event.sequence) ||
      !isNonNegativeInteger(event.priority) ||
      !ALLOWED_EVENT_TYPES.has(event.type) ||
      event.priority !== EVENT_PRIORITY_BY_TYPE[event.type]
    ) {
      errors.push(`INVALID_EVENT:${event.id}`);
    }
    maximumEventSequence = Math.max(
      maximumEventSequence,
      event.sequence ?? 0,
    );
    if (event.type === 'valuation_observation') {
      try {
        const observation = validateValuationObservation(
          event.payload?.observation,
        );
        if (
          observation.publishedMs !== event.scheduledMs ||
          observation.symbol !== state.config.symbol
        ) {
          errors.push(`INVALID_VALUATION_EVENT:${event.id}`);
        }
      } catch {
        errors.push(`INVALID_VALUATION_EVENT:${event.id}`);
      }
    }
    if (eventIds.has(event.id)) errors.push(`DUPLICATE_EVENT:${event.id}`);
    eventIds.add(event.id);
    if (
      previous &&
      (event.scheduledMs < previous.scheduledMs ||
        (event.scheduledMs === previous.scheduledMs &&
          (event.priority < previous.priority ||
            (event.priority === previous.priority &&
              event.sequence < previous.sequence))))
    ) {
      errors.push('EVENT_QUEUE_OUT_OF_ORDER');
    }
    previous = event;
  }
  if (
    !isPositiveInteger(state.nextEventSequence) ||
    state.nextEventSequence <= maximumEventSequence
  ) {
    errors.push('INVALID_EVENT_SEQUENCE_WATERMARK');
  }
  const allValuations = [];
  const valuationIds = new Set();
  for (const observation of state.publishedValuations ?? []) {
    try {
      const validated = validateValuationObservation(observation);
      if (
        validated.symbol !== state.config.symbol ||
        validated.publishedMs > state.nowMs ||
        valuationIds.has(validated.id)
      ) {
        errors.push(`INVALID_PUBLISHED_VALUATION:${validated.id}`);
      }
      valuationIds.add(validated.id);
      allValuations.push(validated);
    } catch {
      errors.push('INVALID_PUBLISHED_VALUATION');
    }
  }
  for (
    let index = 1;
    index < (state.publishedValuations?.length ?? 0);
    index += 1
  ) {
    if (
      state.publishedValuations[index].publishedMs <=
      state.publishedValuations[index - 1].publishedMs
    ) {
      errors.push('PUBLISHED_VALUATIONS_OUT_OF_ORDER');
    }
  }
  for (const event of state.eventQueue.filter(
    (candidate) => candidate.type === 'valuation_observation',
  )) {
    try {
      const validated = validateValuationObservation(
        event.payload.observation,
      );
      if (valuationIds.has(validated.id)) {
        errors.push(`DUPLICATE_VALUATION:${validated.id}`);
      }
      valuationIds.add(validated.id);
      allValuations.push(validated);
    } catch {
      // The event-specific error above is sufficient.
    }
  }
  allValuations.sort(
    (left, right) =>
      left.publishedMs - right.publishedMs ||
      left.id.localeCompare(right.id),
  );
  for (let index = 0; index < allValuations.length; index += 1) {
    const observation = allValuations[index];
    const prior = allValuations[index - 1];
    if (
      (index === 0 && observation.publishedMs !== 0) ||
      (prior &&
        (observation.publishedMs <= prior.publishedMs ||
          observation.asOfMs < prior.asOfMs ||
          observation.priorCenterTicks !==
            prior.estimate.centerTicks))
    ) {
      errors.push(`BROKEN_VALUATION_CHAIN:${observation.id}`);
    }
  }
  if (
    state.latestValuationObservationId !==
    state.publishedValuations?.at(-1)?.id
  ) {
    errors.push('LATEST_VALUATION_POINTER_MISMATCH');
  }
  const orderIds = new Set();
  let maximumOrderSequence = 0;
  let maximumBookSequence = 0;
  for (const order of Object.values(state.book.orders)) {
    if (
      orderIds.has(order.id) ||
      !state.accounts[order.ownerId] ||
      !['buy', 'sell'].includes(order.side) ||
      !isPositiveInteger(order.priceTicks) ||
      !isNonNegativeInteger(order.remainingQty) ||
      !isPositiveInteger(order.bookSequence)
    ) {
      errors.push(`INVALID_ORDER:${order.id}`);
    }
    maximumBookSequence = Math.max(
      maximumBookSequence,
      order.bookSequence ?? 0,
    );
    const parsedOrderSequence = Number(
      String(order.id).replace('meco_ord_', ''),
    );
    if (!isPositiveInteger(parsedOrderSequence)) {
      errors.push(`INVALID_ORDER_SEQUENCE:${order.id}`);
    } else {
      maximumOrderSequence = Math.max(
        maximumOrderSequence,
        parsedOrderSequence,
      );
    }
    orderIds.add(order.id);
  }
  if (
    !isPositiveInteger(state.nextOrderSequence) ||
    state.nextOrderSequence <= maximumOrderSequence
  ) {
    errors.push('INVALID_ORDER_SEQUENCE_WATERMARK');
  }
  if (
    !isPositiveInteger(state.nextBookSequence) ||
    state.nextBookSequence <= maximumBookSequence
  ) {
    errors.push('INVALID_BOOK_SEQUENCE_WATERMARK');
  }
  const activeBids = orderedSide(state, 'buy');
  const activeAsks = orderedSide(state, 'sell');
  if (
    activeBids[0] &&
    activeAsks[0] &&
    activeBids[0].priceTicks >= activeAsks[0].priceTicks
  ) {
    errors.push('CROSSED_BOOK');
  }
  for (const account of Object.values(state.accounts)) {
    if (
      !isNonNegativeInteger(account.cashCents) ||
      !isNonNegativeInteger(account.holdings) ||
      !isNonNegativeInteger(account.creditLimitCents) ||
      !isNonNegativeInteger(account.creditUsedCents) ||
      account.creditUsedCents > account.creditLimitCents
    ) {
      errors.push(`INVALID_ACCOUNT_RESOURCE:${account.id}`);
    }
  }
  for (const maker of Object.values(state.makers)) {
    if (
      !state.accounts[maker.id] ||
      !isNonNegativeInteger(maker.frameFillUnits) ||
      !isNonNegativeInteger(maker.frameMarkoutCount) ||
      !isNonNegativeInteger(maker.risk?.toxicityEwmaBps) ||
      maker.risk.toxicityEwmaBps > 10_000 ||
      !isNonNegativeInteger(
        maker.risk?.realizedAdverseSelectionCents,
      ) ||
      !isNonNegativeInteger(maker.risk?.staleExposureCents) ||
      !['ACTIVE', 'WIDEN', 'REDUCE_SIZE', 'WITHDRAWN'].includes(
        maker.quoteState,
      ) ||
      !isNonNegativeInteger(maker.capacity?.footprintBps) ||
      maker.capacity.footprintBps > 10_000 ||
      !isNonNegativeInteger(
        maker.capacity?.opponentLearningBps,
      ) ||
      maker.capacity.opponentLearningBps > 10_000 ||
      !isPositiveInteger(
        maker.capacity?.marginalSizeMultiplierBps,
      )
    ) {
      errors.push(`INVALID_MAKER_STATE:${maker.id}`);
    }
  }
  for (const cohort of Object.values(state.flowCohorts)) {
    if (
      !isNonNegativeInteger(cohort.buyOrderCount) ||
      !isNonNegativeInteger(cohort.sellOrderCount) ||
      cohort.buyOrderCount + cohort.sellOrderCount !==
        cohort.orderCount
    ) {
      errors.push(`INVALID_FLOW_ORDER_COUNTS:${cohort.id}`);
    }
  }
  if (
    !isNonNegativeInteger(state.creditPool.cashCents) ||
    !isNonNegativeInteger(state.creditPool.reservedCents) ||
    state.creditPool.reservedCents > state.creditPool.cashCents
  ) {
    errors.push('INVALID_CREDIT_POOL');
  }
  const totalReservedCreditCents = Object.values(state.accounts).reduce(
    (total, account) => total + account.reservedCreditCents,
    0,
  );
  if (state.creditPool.reservedCents !== totalReservedCreditCents) {
    errors.push('CREDIT_POOL_RESERVATION_MISMATCH');
  }
  const totalCreditUsedCents = Object.values(state.accounts).reduce(
    (total, account) => total + account.creditUsedCents,
    0,
  );
  if (
    state.creditPool.initialCashCents !==
      expectedInitialTotals?.creditPoolCents ||
    state.creditPool.cashCents + totalCreditUsedCents !==
      state.creditPool.initialCashCents
  ) {
    errors.push('CREDIT_POOL_IDENTITY_MISMATCH');
  }
  errors.push(...reservationErrors(state));
  const totals = resourceTotals(state);
  if (
    totals.cashCents !== state.initialTotals.cashCents
  ) {
    errors.push('CASH_NOT_CONSERVED');
  }
  if (
    totals.inventoryUnits !== state.initialTotals.inventoryUnits
  ) {
    errors.push('INVENTORY_NOT_CONSERVED');
  }
  if (
    totals.creditUsedCents >
    state.initialTotals.creditPoolCents
  ) {
    errors.push('CREDIT_POOL_EXCEEDED');
  }
  const maximumTradeSequence = state.trades.reduce(
    (maximum, trade) => Math.max(maximum, trade.sequence ?? 0),
    0,
  );
  if (
    !isPositiveInteger(state.nextTradeSequence) ||
    state.nextTradeSequence <= maximumTradeSequence ||
    state.totalTradeCount !==
      (state.tradeArchive?.count ?? 0) + state.trades.length ||
    state.totalTradeVolumeUnits !==
      (state.tradeArchive?.volumeUnits ?? 0) +
        state.trades.reduce(
          (total, trade) => total + trade.quantity,
          0,
        )
  ) {
    errors.push('INVALID_TRADE_ARCHIVE_OR_WATERMARK');
  }
  const quoteArchive = state.quoteFrameArchive;
  if (
    !quoteArchive ||
    [
      quoteArchive.count,
      quoteArchive.tradeCount,
      quoteArchive.volumeUnits,
      quoteArchive.twoSidedCount,
      quoteArchive.depthUnitSum,
      quoteArchive.spreadTickSum,
    ].some((value) => !isNonNegativeInteger(value)) ||
    quoteArchive.twoSidedCount > quoteArchive.count
  ) {
    errors.push('INVALID_QUOTE_FRAME_ARCHIVE');
  }
  let priorFrame = null;
  for (const [index, frame] of state.quoteFrames.entries()) {
    const expectedSequence =
      (state.quoteFrameArchive?.count ?? 0) + index + 1;
    if (
      frame.sequence !== expectedSequence ||
      !isNonNegativeInteger(frame.virtualMs) ||
      frame.virtualMs % QUOTE_FRAME_MS !== 0 ||
      !isNonNegativeInteger(frame.tradeCount) ||
      !isNonNegativeInteger(frame.volumeUnits) ||
      !isNonNegativeInteger(frame.lastTradeSequence) ||
      (priorFrame &&
        frame.virtualMs !== priorFrame.virtualMs + QUOTE_FRAME_MS)
    ) {
      errors.push(`INVALID_QUOTE_FRAME:${frame.sequence}`);
    }
    const isTwoSided =
      isPositiveInteger(frame.bestBidTicks) &&
      isPositiveInteger(frame.bestAskTicks) &&
      frame.bestBidTicks < frame.bestAskTicks;
    if (
      (isTwoSided &&
        (!isPositiveInteger(frame.spreadTicks) ||
          frame.spreadTicks !==
            frame.bestAskTicks - frame.bestBidTicks)) ||
      (!isTwoSided && frame.spreadTicks !== null) ||
      (priorFrame &&
        frame.lastTradeSequence < priorFrame.lastTradeSequence)
    ) {
      errors.push(`INVALID_QUOTE_FRAME_MARKET_VIEW:${frame.sequence}`);
    }
    const intervalStart = frame.virtualMs - QUOTE_FRAME_MS;
    if (intervalStart >= (state.tradeArchive?.throughMs ?? 0)) {
      const intervalTrades = state.trades.filter(
        (trade) =>
          trade.virtualMs > intervalStart &&
          trade.virtualMs <= frame.virtualMs &&
          trade.sequence <= frame.lastTradeSequence,
      );
      if (
        frame.tradeCount !== intervalTrades.length ||
        frame.volumeUnits !==
          intervalTrades.reduce(
            (total, trade) => total + trade.quantity,
            0,
          )
      ) {
        errors.push(`QUOTE_FRAME_TRADE_MISMATCH:${frame.sequence}`);
      }
    }
    if (
      !valuationIds.has(frame.valuationObservationId) ||
      frame.valuationObservationVersion !==
        VALUATION_OBSERVATION_VERSION
    ) {
      errors.push(`QUOTE_FRAME_VALUATION_MISMATCH:${frame.sequence}`);
    }
    priorFrame = frame;
  }
  if (
    !isPositiveInteger(state.nextQuoteFrameSequence) ||
    state.nextQuoteFrameSequence !==
      (state.quoteFrameArchive?.count ?? 0) +
        state.quoteFrames.length +
        1
  ) {
    errors.push('INVALID_QUOTE_FRAME_SEQUENCE_WATERMARK');
  }
  const archivedFrameThroughMs =
    state.quoteFrameArchive?.lastVirtualMs ?? 0;
  for (const trade of state.trades) {
    if (
      trade.virtualMs <= archivedFrameThroughMs ||
      trade.virtualMs > state.lastQuoteFrameMs
    ) {
      continue;
    }
    const containingFrame = state.quoteFrames.find(
      (frame) =>
        trade.virtualMs > frame.virtualMs - QUOTE_FRAME_MS &&
        trade.virtualMs <= frame.virtualMs &&
        trade.sequence <= frame.lastTradeSequence,
    );
    if (!containingFrame) {
      errors.push(`UNFRAMED_CLOSED_PHASE_TRADE:${trade.id}`);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    totals,
    initialTotals: cloneJson(state.initialTotals),
    expectedInitialTotals,
  };
}

export function restoreMakerEcology(checkpoint) {
  if (
    !checkpoint ||
    checkpoint.schemaVersion !== SCHEMA_VERSION
  ) {
    throw new Error('Invalid maker ecology checkpoint schema.');
  }
  if (
    checkpoint.checkpointIntegrity?.algorithm !==
      CHECKPOINT_INTEGRITY_ALGORITHM ||
    typeof checkpoint.checkpointIntegrity?.digest !== 'string'
  ) {
    throw new Error('Invalid maker ecology checkpoint integrity receipt.');
  }
  const state = cloneJson(checkpoint);
  const suppliedDigest = state.checkpointIntegrity.digest;
  delete state.checkpointIntegrity;
  const expectedDigest = hash32(JSON.stringify(state))
    .toString(16)
    .padStart(8, '0');
  if (suppliedDigest !== expectedDigest) {
    throw new Error('Invalid maker ecology checkpoint integrity digest.');
  }
  const audit = auditMakerEcology(state);
  if (!audit.ok) {
    throw new Error(
      `Invalid maker ecology checkpoint invariant: ${audit.errors.join(', ')}`,
    );
  }
  return state;
}

/**
 * Converts one ecology maker's current quote plan into bounded intents that
 * match the current simulator's submit/cancel command schema. It intentionally
 * omits internal provenance; simulator integration must add its own activity id
 * after assigning an authoritative event sequence.
 */
export function buildSimulatorCommandBatch(
  ecologySnapshot,
  marketSnapshot,
  binding,
) {
  const maker =
    binding?.makerPolicy ??
    ecologySnapshot?.makers?.[binding?.ecologyMakerId];
  const symbolView = marketSnapshot?.symbols?.[binding?.symbol];
  const account = marketSnapshot?.accounts?.[binding?.actorId];
  if (
    !isNonNegativeInteger(marketSnapshot?.nowMs) ||
    !maker ||
    !symbolView ||
    !account ||
    typeof binding.actorId !== 'string' ||
    typeof binding.brokerId !== 'string' ||
    (account.id !== undefined && account.id !== binding.actorId) ||
    (account.brokerId !== undefined &&
      account.brokerId !== binding.brokerId)
  ) {
    throw new Error('Invalid simulator maker-ecology binding.');
  }
  const directPolicy = binding?.makerPolicy;
  if (directPolicy) {
    if (
      directPolicy.policyStateVersion !== MAKER_POLICY_STATE_VERSION ||
      (binding.inventoryTargetUnits !== undefined &&
        binding.inventoryTargetUnits !==
          directPolicy.inventoryTargetUnits) ||
      (binding.inventoryCapacityUnits !== undefined &&
        binding.inventoryCapacityUnits !==
          directPolicy.inventoryCapacityUnits)
    ) {
      throw new Error('Simulator binding conflicts with maker policy state.');
    }
    if (marketSnapshot.nowMs >= QUOTE_FRAME_MS) {
      const policyAgeMs =
        marketSnapshot.nowMs - directPolicy.cursor?.virtualMs;
      if (
        !isNonNegativeInteger(policyAgeMs) ||
        policyAgeMs >= QUOTE_FRAME_MS ||
        directPolicy.binding?.actorId !== binding.actorId ||
        directPolicy.binding?.symbol !== binding.symbol
      ) {
        throw new Error(
          'Simulator maker policy has not consumed the authoritative current frame.',
        );
      }
    } else if (
      directPolicy.cursor?.virtualMs !== null &&
      (directPolicy.cursor.virtualMs !== marketSnapshot.nowMs ||
        directPolicy.binding?.actorId !== binding.actorId ||
        directPolicy.binding?.symbol !== binding.symbol)
    ) {
      throw new Error('Simulator maker policy cursor is not current.');
    }
  }
  const valuationObservation = validateValuationObservation(
    binding.valuationObservation,
  );
  if (valuationObservation.symbol !== binding.symbol) {
    throw new Error('Simulator binding valuation symbol mismatch.');
  }
  const valuationVisibilityCutoffMs = Math.max(
    0,
    marketSnapshot.nowMs - (maker.informationDelayMs ?? 0),
  );
  if (
    valuationObservation.publishedMs >
    valuationVisibilityCutoffMs
  ) {
    throw new Error(
      'Simulator binding valuation is not yet visible through the maker information delay.',
    );
  }
  const bids = Array.isArray(symbolView.bids) ? symbolView.bids : [];
  const asks = Array.isArray(symbolView.asks) ? symbolView.asks : [];
  const bestBidTicks = bids[0]?.priceTicks ?? null;
  const bestAskTicks = asks[0]?.priceTicks ?? null;
  const observedMidTicks =
    isPositiveInteger(bestBidTicks) &&
    isPositiveInteger(bestAskTicks) &&
    bestBidTicks < bestAskTicks
      ? Math.round((bestBidTicks + bestAskTicks) / 2)
      : symbolView.lastPriceTicks;
  if (!isPositiveInteger(observedMidTicks)) {
    throw new Error('Simulator snapshot has no authoritative market price.');
  }
  const bidDepthUnits = bids
    .slice(0, 5)
    .reduce((total, level) => total + (level.quantity ?? 0), 0);
  const askDepthUnits = asks
    .slice(0, 5)
    .reduce((total, level) => total + (level.quantity ?? 0), 0);
  const depthTotal = bidDepthUnits + askDepthUnits;
  const recentCloses = (symbolView.intradayBars ?? [])
    .slice(-20)
    .map((bar) => bar.closeTicks)
    .filter(isPositiveInteger);
  const absoluteChanges = recentCloses
    .slice(1)
    .map((close, index) => Math.abs(close - recentCloses[index]));
  const authoritativeHoldings =
    account.holdings?.[binding.symbol] ?? 0;
  const authoritativeAvailableCashCents = Math.max(
    0,
    account.cashCents - (account.reservedCashCents ?? 0),
  );
  const authoritativeAvailableHoldings = Math.max(
    0,
    authoritativeHoldings -
      (account.reservedHoldings?.[binding.symbol] ?? 0),
  );
  const plan = computeMakerQuotePlan(
    {
      id: maker.id,
      latencyMs: maker.latencyMs,
      riskAversionBps: maker.riskAversionBps,
      adverseSelectionBps: maker.adverseSelectionBps,
      valuationWeightBps: maker.valuationWeightBps,
      baseHalfSpreadTicks: maker.baseHalfSpreadTicks,
      baseOrderUnits: maker.baseOrderUnits,
      maxLevels: maker.maxLevels,
      quoteState: maker.quoteState,
      capitalMultiplier: maker.capitalMultiplier,
      marginalSizeMultiplierBps:
        maker.capacity?.marginalSizeMultiplierBps ?? 10_000,
      inventoryTargetUnits:
        binding.inventoryTargetUnits ??
        maker.inventoryTargetUnits ??
        authoritativeHoldings,
      inventoryCapacityUnits:
        binding.inventoryCapacityUnits ??
        maker.inventoryCapacityUnits ??
        Math.max(1, Math.ceil(authoritativeHoldings * 0.25)),
      holdings: authoritativeHoldings,
      cashCents: account.cashCents,
      creditLimitCents: 0,
      creditUsedCents: 0,
    },
    {
      nowMs: marketSnapshot.nowMs,
      symbol: binding.symbol,
      observedMidTicks,
      valuationObservation,
      valuationAgeMs: Math.max(
        0,
        marketSnapshot.nowMs - valuationObservation.publishedMs,
      ),
      bestBidTicks,
      bestAskTicks,
      bidDepthUnits,
      askDepthUnits,
      imbalanceBps:
        depthTotal === 0
          ? 0
          : Math.round(
              ((bidDepthUnits - askDepthUnits) * 10_000) /
                depthTotal,
            ),
      volatilityTicks: Math.max(
        1,
        Math.round(rollingMean(absoluteChanges)),
      ),
      jumpRiskBps:
        binding.jumpRiskBps ?? REGIME_PRESETS.normal.jumpRiskBps,
      toxicityBps:
        maker.risk?.toxicityEwmaBps ?? 0,
      crowdingBps:
        maker.capacity?.opponentLearningBps ?? 0,
      queueAheadBps: 0,
      regime: binding.regime ?? REGIME_PRESETS.normal,
      activeMakerCount:
        binding.activeMakerCount ?? 2,
    },
  );
  const maxLevels = clamp(
    binding.maxLevels ?? 3,
    1,
    Math.max(1, Math.min(5, plan.levelsPerSide || 1)),
  );
  const maxCancelsPerBatch = clamp(
    binding.maxCancelsPerBatch ?? 2,
    0,
    32,
  );
  const maxCommandsPerBatch = clamp(
    binding.maxCommandsPerBatch ?? 8,
    1,
    64,
  );
  const scheduledMs =
    marketSnapshot.nowMs + Math.max(1, maker.latencyMs);
  const desired = [
    ...plan.bids.slice(0, maxLevels),
    ...plan.asks.slice(0, maxLevels),
  ];
  const desiredByKey = new Map(
    desired.map((order) => [
      `${order.side}:${order.priceTicks}`,
      order,
    ]),
  );
  const commands = [];
  const active = (marketSnapshot.activeOrders ?? []).filter(
    (order) =>
      order.ownerId === binding.actorId &&
      order.symbol === binding.symbol &&
      (order.status === 'accepted' ||
        order.status === 'partially_filled'),
  );
  const retained = new Set();
  const staleRiskScore = (order) => {
    const valuationRisk =
      order.side === 'buy'
        ? Math.max(
            0,
            order.priceTicks -
              valuationObservation.estimate.highTicks,
          )
        : Math.max(
            0,
            valuationObservation.estimate.lowTicks -
              order.priceTicks,
          );
    return (
      valuationRisk * 1_000 +
      Math.abs(order.priceTicks - observedMidTicks) * 10 +
      Math.max(0, marketSnapshot.nowMs - (order.submittedMs ?? 0))
    );
  };
  const cancellationCandidates = [];
  for (const order of active) {
    const key = `${order.side}:${order.priceTicks}`;
    const desiredOrder = desiredByKey.get(key);
    if (
      desiredOrder &&
      order.remainingQty <= desiredOrder.quantity &&
      !retained.has(key)
    ) {
      retained.add(key);
      continue;
    }
    cancellationCandidates.push(order);
  }
  cancellationCandidates.sort(
    (left, right) =>
      staleRiskScore(right) - staleRiskScore(left) ||
      String(left.id).localeCompare(String(right.id)),
  );
  const selectedCancellations = cancellationCandidates.slice(
    0,
    Math.min(maxCancelsPerBatch, maxCommandsPerBatch),
  );
  for (const order of selectedCancellations) {
    commands.push({
      type: 'cancel_order',
      actorId: binding.actorId,
      brokerId: binding.brokerId,
      orderId: order.id,
      scheduledMs,
    });
  }
  const selectedCancellationIds = new Set(
    selectedCancellations.map((order) => order.id),
  );
  const projectedOwnOrders = active
    .filter((order) => !selectedCancellationIds.has(order.id))
    .map((order) => ({
      side: order.side,
      priceTicks: order.priceTicks,
    }));
  let availableCashCents = Math.max(
    0,
    authoritativeAvailableCashCents,
  );
  let availableHoldings = Math.max(
    0,
    authoritativeAvailableHoldings,
  );
  const feeCents = (grossCents) =>
    grossCents <= 0
      ? 0
      : Math.max(5, Math.ceil(grossCents * 5 / 10_000));
  for (const order of selectedCancellations) {
    if (order.side === 'buy') {
      const remainingGross =
        order.priceTicks * order.remainingQty;
      const maximumFee = feeCents(
        (order.filledGrossCents ?? 0) + remainingGross,
      );
      availableCashCents +=
        remainingGross +
        Math.max(
          0,
          maximumFee - (order.chargedFeeCents ?? 0),
        );
    } else {
      availableHoldings += order.remainingQty;
    }
  }
  for (const order of desired) {
    if (commands.length >= maxCommandsPerBatch) break;
    const key = `${order.side}:${order.priceTicks}`;
    if (retained.has(key)) continue;
    const wouldCrossOwnOrder = projectedOwnOrders.some(
      (ownOrder) =>
        ownOrder.side !== order.side &&
        (order.side === 'buy'
          ? order.priceTicks >= ownOrder.priceTicks
          : order.priceTicks <= ownOrder.priceTicks),
    );
    if (wouldCrossOwnOrder) continue;
    let quantity = order.quantity;
    if (order.side === 'buy') {
      quantity = Math.min(
        quantity,
        Math.floor(availableCashCents / order.priceTicks),
      );
      while (
        quantity > 0 &&
        quantity * order.priceTicks +
          feeCents(quantity * order.priceTicks) >
          availableCashCents
      ) {
        quantity -= 1;
      }
      const grossCents = quantity * order.priceTicks;
      availableCashCents -= grossCents + feeCents(grossCents);
    } else {
      quantity = Math.min(quantity, availableHoldings);
      availableHoldings -= quantity;
    }
    if (quantity <= 0) continue;
    commands.push({
      type: 'submit_order',
      actorId: binding.actorId,
      brokerId: binding.brokerId,
      symbol: binding.symbol,
      side: order.side,
      priceTicks: order.priceTicks,
      quantity,
      tif: 'GTC',
      scheduledMs,
    });
    projectedOwnOrders.push({
      side: order.side,
      priceTicks: order.priceTicks,
    });
  }
  return commands.slice(0, maxCommandsPerBatch);
}

export function wallTimeToVirtualMs(wallMs, speed = 1) {
  if (!isNonNegativeInteger(wallMs)) {
    throw new Error('wallMs must be a non-negative integer.');
  }
  if (!SUPPORTED_SPEEDS.includes(speed)) {
    throw new Error('speed must be one of 1, 4 or 16.');
  }
  const virtualMs = wallMs * 3 * speed;
  if (!Number.isSafeInteger(virtualMs)) {
    throw new Error('wall-time conversion exceeds the safe integer range.');
  }
  return virtualMs;
}

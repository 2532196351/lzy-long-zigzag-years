export const QUANT_LAB_SCHEMA = 'lzy-player-quant-lab-v1';
export const STABILITY_DESK_SCHEMA = 'lzy-player-stability-desk-v1';
export const PLAYER_STRATEGY_FILE_SCHEMA =
  'lzy-player-quant-strategy-v1';

const BPS = 10_000;
const MAX_CUSTOM_STRATEGIES = 8;
const MAX_MANIFEST_BYTES = 64 * 1024;
const FACTOR_KEYS = Object.freeze([
  'valuation',
  'quality',
  'momentum',
  'meanReversion',
  'orderImbalance',
]);
const RISK_MODES = new Set(['conservative', 'balanced', 'aggressive']);
const STABILITY_TARGET_MODES = new Set([
  'balanced',
  'systemic',
  'liquidity',
]);

function frozenStrategy(value) {
  return Object.freeze({
    ...value,
    factors: Object.freeze({ ...value.factors }),
  });
}

export const QUANT_STRATEGY_CATALOG = Object.freeze([
  frozenStrategy({
    id: 'multi_scale_trend',
    label: '多尺度趋势',
    description: '组合日内方向、成交确认与波动预算，追随但不过度追价。',
    researchRequired: 0,
    baseCashCost: 800_000,
    baseTechnologyCost: 600_000,
    factors: {
      valuation: 0,
      quality: 500,
      momentum: 7_000,
      meanReversion: -1_500,
      orderImbalance: 2_000,
    },
  }),
  frozenStrategy({
    id: 'value_quality',
    label: '价值质量',
    description: '比较公开价值锚、经营质量和价格偏离，容量较大、换手较低。',
    researchRequired: 0,
    baseCashCost: 650_000,
    baseTechnologyCost: 450_000,
    factors: {
      valuation: 5_500,
      quality: 3_000,
      momentum: 500,
      meanReversion: 1_000,
      orderImbalance: 0,
    },
  }),
  frozenStrategy({
    id: 'volatility_control',
    label: '波动率控制',
    description: '按波动与组合风险缩放头寸，在拥挤阶段主动降低暴露。',
    researchRequired: 0,
    baseCashCost: 900_000,
    baseTechnologyCost: 800_000,
    factors: {
      valuation: 1_000,
      quality: 1_000,
      momentum: 2_500,
      meanReversion: 2_500,
      orderImbalance: 3_000,
    },
  }),
  frozenStrategy({
    id: 'liquidity_mean_reversion',
    label: '流动性均值回归',
    description: '识别短时流动性失衡，提供有限反向流动性并严格限制参与率。',
    researchRequired: 8,
    baseCashCost: 1_600_000,
    baseTechnologyCost: 1_400_000,
    factors: {
      valuation: 1_000,
      quality: 0,
      momentum: -1_500,
      meanReversion: 6_000,
      orderImbalance: 4_500,
    },
  }),
  frozenStrategy({
    id: 'microstructure_flow',
    label: '微观结构与订单流',
    description: '只使用公开盘口与成交状态，在极短持有期内控制排队和冲击成本。',
    researchRequired: 12,
    baseCashCost: 2_800_000,
    baseTechnologyCost: 2_400_000,
    factors: {
      valuation: 0,
      quality: 0,
      momentum: 1_000,
      meanReversion: 2_000,
      orderImbalance: 7_000,
    },
  }),
]);

const BUILTIN_BY_ID = Object.freeze(
  Object.fromEntries(
    QUANT_STRATEGY_CATALOG.map((strategy) => [strategy.id, strategy]),
  ),
);

function clone(value) {
  return structuredClone(value);
}

function plainObject(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype,
  );
}

function assertExactKeys(value, allowed, path) {
  if (!plainObject(value)) {
    throw new TypeError(`${path} must be a plain JSON object.`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new TypeError(`${path} contains unsupported field "${key}".`);
    }
  }
}

function boundedInteger(value, minimum, maximum, field) {
  const number = Number(value);
  if (
    !Number.isSafeInteger(number) ||
    number < minimum ||
    number > maximum
  ) {
    throw new RangeError(
      `${field} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return number;
}

function boundedText(value, minimum, maximum, field) {
  const text = String(value ?? '').trim();
  if (text.length < minimum || text.length > maximum) {
    throw new RangeError(
      `${field} must contain ${minimum}-${maximum} characters.`,
    );
  }
  return text;
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  const text = stableJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function playerStrategyTemplate() {
  return {
    schemaVersion: PLAYER_STRATEGY_FILE_SCHEMA,
    id: 'user_public_factor_strategy',
    name: '公开因子组合',
    description: '只使用游戏公开行情、估值、质量和盘口状态。',
    cadenceMs: 60_000,
    entryThresholdBps: 120,
    factors: {
      valuation: 3_000,
      quality: 2_000,
      momentum: 2_000,
      meanReversion: 2_000,
      orderImbalance: 1_000,
    },
    execution: {
      maxOrderBps: 75,
      maxPositionBps: 1_500,
      maxParticipationBps: 1_000,
      urgency: 'patient',
    },
  };
}

export function importPlayerStrategyManifest(raw) {
  const serialized = JSON.stringify(raw);
  if (
    typeof serialized !== 'string' ||
    new TextEncoder().encode(serialized).byteLength > MAX_MANIFEST_BYTES
  ) {
    throw new RangeError('Strategy file exceeds the 64 KiB limit.');
  }
  assertExactKeys(
    raw,
    new Set([
      'schemaVersion',
      'id',
      'name',
      'description',
      'cadenceMs',
      'entryThresholdBps',
      'factors',
      'execution',
    ]),
    'strategy',
  );
  if (raw.schemaVersion !== PLAYER_STRATEGY_FILE_SCHEMA) {
    throw new TypeError('Unsupported player strategy schema.');
  }
  const id = String(raw.id ?? '');
  if (!/^user_[a-z0-9_]{3,44}$/.test(id)) {
    throw new TypeError(
      'Strategy id must start with user_ and use lowercase letters, digits or underscores.',
    );
  }
  if (BUILTIN_BY_ID[id]) {
    throw new TypeError('A player strategy cannot replace a built-in strategy.');
  }
  assertExactKeys(raw.factors, new Set(FACTOR_KEYS), 'strategy.factors');
  assertExactKeys(
    raw.execution,
    new Set([
      'maxOrderBps',
      'maxPositionBps',
      'maxParticipationBps',
      'urgency',
    ]),
    'strategy.execution',
  );
  const factors = Object.fromEntries(
    FACTOR_KEYS.map((key) => [
      key,
      boundedInteger(raw.factors[key] ?? 0, -10_000, 10_000, `factors.${key}`),
    ]),
  );
  const grossWeight = Object.values(factors).reduce(
    (sum, weight) => sum + Math.abs(weight),
    0,
  );
  if (grossWeight === 0 || grossWeight > 20_000) {
    throw new RangeError('Factor gross weight must be from 1 to 20000 bps.');
  }
  const urgency = String(raw.execution.urgency ?? 'patient');
  if (!['patient', 'balanced', 'urgent'].includes(urgency)) {
    throw new TypeError('Unsupported execution urgency.');
  }
  const normalized = {
    schemaVersion: PLAYER_STRATEGY_FILE_SCHEMA,
    id,
    name: boundedText(raw.name, 2, 32, 'name'),
    description: boundedText(raw.description, 4, 160, 'description'),
    cadenceMs: boundedInteger(raw.cadenceMs, 30_000, 900_000, 'cadenceMs'),
    entryThresholdBps: boundedInteger(
      raw.entryThresholdBps,
      25,
      2_500,
      'entryThresholdBps',
    ),
    factors,
    execution: {
      maxOrderBps: boundedInteger(
        raw.execution.maxOrderBps,
        1,
        500,
        'execution.maxOrderBps',
      ),
      maxPositionBps: boundedInteger(
        raw.execution.maxPositionBps,
        50,
        4_000,
        'execution.maxPositionBps',
      ),
      maxParticipationBps: boundedInteger(
        raw.execution.maxParticipationBps,
        25,
        2_500,
        'execution.maxParticipationBps',
      ),
      urgency,
    },
  };
  return {
    ...normalized,
    source: 'player_declarative_file',
    level: 1,
    unlocked: true,
    importedAtRevision: null,
    digest: digest(normalized),
  };
}

export function createQuantStrategyLab({ technologyBudget = 0 } = {}) {
  const budget = Math.max(0, Number(technologyBudget) || 0);
  return {
    schemaVersion: QUANT_LAB_SCHEMA,
    automationEnabled: true,
    riskMode: 'balanced',
    selectedStrategyIds: ['multi_scale_trend', 'value_quality'],
    strategyWeightsBps: {
      multi_scale_trend: 5_500,
      value_quality: 4_500,
    },
    strategies: Object.fromEntries(
      QUANT_STRATEGY_CATALOG.map((strategy) => [
        strategy.id,
        {
          unlocked: strategy.researchRequired === 0,
          level: 1,
          researchSpent: 0,
          cashSpent: 0,
          technologySpent: 0,
        },
      ]),
    ),
    customStrategies: [],
    technologyBudgetInitial: budget,
    technologyBudgetRemaining: budget,
    revision: 1,
  };
}

export function createStabilityDesk() {
  return {
    schemaVersion: STABILITY_DESK_SCHEMA,
    automationEnabled: true,
    targetMode: 'balanced',
    intensityBps: 5_000,
    breadthTriggerBps: -3_500,
    weightedReturnTriggerBps: -2_800,
    liquidityStressTriggerBps: 6_500,
    manualAccess: true,
    oversightPressureBps: 0,
    interventionInventoryBySymbol: {},
    revision: 1,
  };
}

export function normalizeRoleStrategyState(
  roleType,
  roleState,
  { technologyBudget = roleState?.technologyBudget ?? 0 } = {},
) {
  if (!roleState || typeof roleState !== 'object') return roleState;
  if (roleType === 'quant_institution') {
    roleState.strategyLab ??= createQuantStrategyLab({ technologyBudget });
  } else if (roleType === 'stabilization_fund') {
    roleState.stabilityDesk ??= createStabilityDesk();
  }
  return roleState;
}

export function quantStrategyDefinition(lab, strategyId) {
  const builtin = BUILTIN_BY_ID[strategyId];
  if (builtin) return builtin;
  return lab?.customStrategies?.find(
    (strategy) => strategy.id === strategyId,
  ) ?? null;
}

export function quantStrategyUpgradeCost(lab, strategyId) {
  const definition = quantStrategyDefinition(lab, strategyId);
  const state = lab?.strategies?.[strategyId] ?? definition;
  if (!definition || !state?.unlocked) return null;
  const level = boundedInteger(state.level ?? 1, 1, 5, 'strategy level');
  if (level >= 5) return null;
  const scale = 2 ** (level - 1);
  return {
    cashCost: Math.round(
      (definition.baseCashCost ?? 1_200_000) * scale,
    ),
    technologyCost: Math.round(
      (definition.baseTechnologyCost ?? 1_000_000) * scale,
    ),
    researchCost: Math.min(8, level + 1),
    nextLevel: level + 1,
  };
}

export function researchCostForStrategy(strategyId) {
  return BUILTIN_BY_ID[strategyId]?.researchRequired ?? null;
}

export function normalizeStrategyWeights(selectedIds, rawWeights = {}) {
  const ids = [...new Set(selectedIds.map(String))].slice(0, 8);
  if (ids.length === 0) {
    throw new RangeError('At least one strategy must be selected.');
  }
  const requested = ids.map((id) =>
    Math.max(0, Number.isFinite(Number(rawWeights[id])) ? Number(rawWeights[id]) : 0),
  );
  const requestedTotal = requested.reduce((sum, weight) => sum + weight, 0);
  const source = requestedTotal > 0
    ? requested
    : ids.map(() => 1);
  const sourceTotal = source.reduce((sum, weight) => sum + weight, 0);
  const normalized = {};
  let assigned = 0;
  ids.forEach((id, index) => {
    const weight =
      index === ids.length - 1
        ? BPS - assigned
        : Math.max(0, Math.floor((source[index] * BPS) / sourceTotal));
    normalized[id] = weight;
    assigned += weight;
  });
  return normalized;
}

export function validateQuantConfiguration(lab, action) {
  const selectedStrategyIds = [...new Set(
    (Array.isArray(action.selectedStrategyIds)
      ? action.selectedStrategyIds
      : lab.selectedStrategyIds
    ).map(String),
  )].slice(0, 8);
  if (
    selectedStrategyIds.length === 0 ||
    selectedStrategyIds.some((id) => {
      const definition = quantStrategyDefinition(lab, id);
      const builtInState = lab.strategies[id];
      return !definition || (builtInState && !builtInState.unlocked);
    })
  ) {
    throw new RangeError('Selected strategies must exist and be unlocked.');
  }
  const riskMode = String(action.riskMode ?? lab.riskMode);
  if (!RISK_MODES.has(riskMode)) {
    throw new TypeError('Unsupported quant risk mode.');
  }
  return {
    automationEnabled:
      action.automationEnabled === undefined
        ? lab.automationEnabled
        : action.automationEnabled === true,
    riskMode,
    selectedStrategyIds,
    strategyWeightsBps: normalizeStrategyWeights(
      selectedStrategyIds,
      action.strategyWeightsBps ?? lab.strategyWeightsBps,
    ),
  };
}

export function validateStabilityConfiguration(desk, action) {
  const targetMode = String(action.targetMode ?? desk.targetMode);
  if (!STABILITY_TARGET_MODES.has(targetMode)) {
    throw new TypeError('Unsupported stabilization target mode.');
  }
  return {
    automationEnabled:
      action.automationEnabled === undefined
        ? desk.automationEnabled
        : action.automationEnabled === true,
    targetMode,
    intensityBps: boundedInteger(
      action.intensityBps ?? desk.intensityBps,
      1_000,
      10_000,
      'intensityBps',
    ),
    breadthTriggerBps: boundedInteger(
      action.breadthTriggerBps ?? desk.breadthTriggerBps,
      -8_000,
      -500,
      'breadthTriggerBps',
    ),
    weightedReturnTriggerBps: boundedInteger(
      action.weightedReturnTriggerBps ?? desk.weightedReturnTriggerBps,
      -8_000,
      -500,
      'weightedReturnTriggerBps',
    ),
    liquidityStressTriggerBps: boundedInteger(
      action.liquidityStressTriggerBps ?? desk.liquidityStressTriggerBps,
      1_000,
      10_000,
      'liquidityStressTriggerBps',
    ),
  };
}

export function auditRoleStrategyState(roleType, roleState) {
  const errors = [];
  if (roleType === 'quant_institution') {
    const lab = roleState?.strategyLab;
    if (
      lab?.schemaVersion !== QUANT_LAB_SCHEMA ||
      typeof lab.automationEnabled !== 'boolean' ||
      !RISK_MODES.has(lab.riskMode) ||
      !Array.isArray(lab.selectedStrategyIds) ||
      lab.selectedStrategyIds.length < 1 ||
      lab.selectedStrategyIds.length > 8 ||
      new Set(lab.selectedStrategyIds).size !== lab.selectedStrategyIds.length ||
      lab.selectedStrategyIds.some((id) => {
        const definition = quantStrategyDefinition(lab, id);
        const state = lab.strategies?.[id];
        return !definition || (state && !state.unlocked);
      }) ||
      Object.values(lab.strategyWeightsBps ?? {}).reduce(
        (sum, value) => sum + value,
        0,
      ) !== BPS ||
      Object.keys(lab.strategyWeightsBps ?? {}).some(
        (id) => !lab.selectedStrategyIds.includes(id),
      ) ||
      !Number.isFinite(lab.technologyBudgetInitial) ||
      !Number.isFinite(lab.technologyBudgetRemaining) ||
      lab.technologyBudgetRemaining < 0 ||
      lab.technologyBudgetRemaining > lab.technologyBudgetInitial ||
      !Number.isSafeInteger(lab.revision) ||
      lab.revision < 1 ||
      !Array.isArray(lab.customStrategies) ||
      lab.customStrategies.length > MAX_CUSTOM_STRATEGIES
    ) {
      errors.push('INVALID_QUANT_STRATEGY_LAB');
    }
    for (const [id, state] of Object.entries(lab?.strategies ?? {})) {
      if (
        !quantStrategyDefinition(lab, id) ||
        typeof state.unlocked !== 'boolean' ||
        !Number.isSafeInteger(state.level) ||
        state.level < 1 ||
        state.level > 5
      ) {
        errors.push(`INVALID_QUANT_STRATEGY_STATE:${id}`);
      }
    }
    for (const custom of lab?.customStrategies ?? []) {
      try {
        const normalized = importPlayerStrategyManifest({
          schemaVersion: custom.schemaVersion,
          id: custom.id,
          name: custom.name,
          description: custom.description,
          cadenceMs: custom.cadenceMs,
          entryThresholdBps: custom.entryThresholdBps,
          factors: custom.factors,
          execution: custom.execution,
        });
        if (normalized.digest !== custom.digest) {
          errors.push(`INVALID_CUSTOM_STRATEGY_DIGEST:${custom.id}`);
        }
      } catch {
        errors.push(`INVALID_CUSTOM_STRATEGY:${custom?.id ?? 'unknown'}`);
      }
    }
  } else if (roleType === 'stabilization_fund') {
    const desk = roleState?.stabilityDesk;
    if (
      desk?.schemaVersion !== STABILITY_DESK_SCHEMA ||
      typeof desk.automationEnabled !== 'boolean' ||
      !STABILITY_TARGET_MODES.has(desk.targetMode) ||
      !Number.isSafeInteger(desk.intensityBps) ||
      desk.intensityBps < 1_000 ||
      desk.intensityBps > 10_000 ||
      desk.manualAccess !== true ||
      !plainObject(desk.interventionInventoryBySymbol) ||
      !Number.isSafeInteger(desk.revision) ||
      desk.revision < 1
    ) {
      errors.push('INVALID_STABILITY_DESK');
    }
  }
  return { ok: errors.length === 0, errors };
}

export function maximumCustomStrategies() {
  return MAX_CUSTOM_STRATEGIES;
}

export function isQuantRiskMode(value) {
  return RISK_MODES.has(value);
}

export function cloneQuantStrategyCatalog() {
  return clone(QUANT_STRATEGY_CATALOG);
}

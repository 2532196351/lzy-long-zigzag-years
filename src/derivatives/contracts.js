export const CONTRACT_RULE_VERSION =
  'lzy-synthetic-derivative-contracts-v4';
export const PREVIOUS_CONTRACT_RULE_VERSION =
  'lzy-synthetic-derivative-contracts-v3';
export const INTERMEDIATE_CONTRACT_RULE_VERSION =
  'lzy-synthetic-derivative-contracts-v2';
export const LEGACY_CONTRACT_RULE_VERSION =
  'lzy-synthetic-derivative-contracts-v1';
export const SYNTHETIC_FUNDING_CURVE = Object.freeze({
  id: 'lzy-offline-synthetic-funding-v1',
  authority: 'offline_synthetic_world_assumption',
  riskFreeRateBps: 200,
  optionCarryConventionVersion: 'lzy-option-carry-v1',
});

const DAY_MS = 24 * 60 * 60 * 1_000;
const PRICE_SCALE = 100;

function fnv1a32(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function createEquityBasket({
  underlyingId,
  constituentSetVersion,
  weightingMethod = 'float_market_cap',
  baseLevelTicks,
  constituentSymbols,
}) {
  const symbols = Object.freeze([...constituentSymbols]);
  const constituentSetDigest = `fnv1a32:${fnv1a32(
    JSON.stringify({
      underlyingId,
      constituentSetVersion,
      weightingMethod,
      baseLevelTicks,
      constituentSymbols: symbols,
    }),
  )}`;
  return Object.freeze({
    weightingMethod,
    baseLevelTicks,
    constituentSymbols: symbols,
    constituentCount: symbols.length,
    constituentSetVersion,
    constituentSetDigest,
  });
}

const INTERMEDIATE_DERIVATIVE_EQUITY_BASKETS =
  Object.freeze({
    SYNTH300: createEquityBasket({
      underlyingId: 'SYNTH300',
      constituentSetVersion:
        'lzy-synth300-constituents-v2',
      baseLevelTicks: 400_000,
      constituentSymbols: [
        'LZA001',
        'LZA002',
        'LZA003',
        'LZB101',
        'LZC201',
        'LZD301',
        'LZE401',
        'LZF501',
      ],
    }),
    LZETF50: createEquityBasket({
      underlyingId: 'LZETF50',
      constituentSetVersion:
        'lzy-lzetf50-constituents-v2',
      baseLevelTicks: 320,
      constituentSymbols: [
        'LZA002',
        'LZA003',
        'LZB101',
        'LZD301',
      ],
    }),
  });

const PREVIOUS_DERIVATIVE_EQUITY_BASKETS = Object.freeze({
  SYNTH300: createEquityBasket({
    underlyingId: 'SYNTH300',
    constituentSetVersion: 'lzy-synth300-constituents-v3',
    baseLevelTicks: 400_000,
    constituentSymbols: [
      'LZA001',
      'LZA002',
      'LZA003',
      'LZB101',
      'LZC201',
      'LZD301',
      'LZE401',
      'LZF501',
      'LZG601',
      'LZH701',
      'LZI801',
      'LZJ901',
      'LZK011',
      'LZL121',
    ],
  }),
  LZETF50: createEquityBasket({
    underlyingId: 'LZETF50',
    constituentSetVersion: 'lzy-lzetf50-constituents-v3',
    baseLevelTicks: 320,
    constituentSymbols: [
      'LZA002',
      'LZA003',
      'LZB101',
      'LZD301',
      'LZI801',
      'LZJ901',
    ],
  }),
});

export const DERIVATIVE_EQUITY_BASKETS = Object.freeze({
  SYNTH300: createEquityBasket({
    underlyingId: 'SYNTH300',
    constituentSetVersion: 'lzy-synth300-constituents-v4',
    baseLevelTicks: 400_000,
    constituentSymbols: [
      'LZA001',
      'LZA002',
      'LZA003',
      'LZB101',
      'LZC201',
      'LZD301',
      'LZE401',
      'LZF501',
      'LZG601',
      'LZH701',
      'LZI801',
      'LZJ901',
      'LZK011',
      'LZL121',
      'LZM101',
      'LZM102',
      'LZM103',
      'LZM104',
      'LZM105',
      'LZN201',
      'LZN202',
      'LZN203',
      'LZN204',
      'LZO301',
      'LZO302',
      'LZO303',
      'LZO304',
      'LZP401',
      'LZP402',
      'LZP403',
      'LZP404',
      'LZP405',
    ],
  }),
  LZETF50: createEquityBasket({
    underlyingId: 'LZETF50',
    constituentSetVersion: 'lzy-lzetf50-constituents-v4',
    baseLevelTicks: 320,
    constituentSymbols: [
      'LZA002',
      'LZA003',
      'LZB101',
      'LZD301',
      'LZI801',
      'LZJ901',
      'LZM101',
      'LZN201',
      'LZN202',
      'LZN203',
      'LZO301',
      'LZP401',
    ],
  }),
});

export const DERIVATIVE_EQUITY_BASKET_VERSIONS =
  Object.freeze(
    Object.fromEntries(
      Object.keys(DERIVATIVE_EQUITY_BASKETS).map(
        (underlyingId) => [
          underlyingId,
          Object.freeze({
            [INTERMEDIATE_DERIVATIVE_EQUITY_BASKETS[
              underlyingId
            ].constituentSetVersion]:
              INTERMEDIATE_DERIVATIVE_EQUITY_BASKETS[
                underlyingId
              ],
            [PREVIOUS_DERIVATIVE_EQUITY_BASKETS[
              underlyingId
            ].constituentSetVersion]:
              PREVIOUS_DERIVATIVE_EQUITY_BASKETS[
                underlyingId
              ],
            [DERIVATIVE_EQUITY_BASKETS[
              underlyingId
            ].constituentSetVersion]:
              DERIVATIVE_EQUITY_BASKETS[underlyingId],
          }),
        ],
      ),
    ),
  );

export function equityBasketIdentity(underlyingId, basket) {
  if (!basket) return null;
  return {
    underlyingId,
    constituentCount: basket.constituentCount,
    constituentSetVersion: basket.constituentSetVersion,
    constituentSetDigest: basket.constituentSetDigest,
  };
}

export function sameEquityBasketIdentity(left, right) {
  if (left === null || left === undefined) {
    return right === null || right === undefined;
  }
  return (
    right !== null &&
    right !== undefined &&
    left.underlyingId === right.underlyingId &&
    left.constituentCount === right.constituentCount &&
    left.constituentSetVersion ===
      right.constituentSetVersion &&
    left.constituentSetDigest ===
      right.constituentSetDigest
  );
}

export function equityBasketByIdentity(identity) {
  if (!identity) return null;
  const basket =
    DERIVATIVE_EQUITY_BASKET_VERSIONS[
      identity.underlyingId
    ]?.[identity.constituentSetVersion] ?? null;
  return sameEquityBasketIdentity(
    identity,
    equityBasketIdentity(identity.underlyingId, basket),
  )
    ? basket
    : null;
}

export function buildEquityBasketSettlementReferences(
  universe,
  spotTicksByUnderlyingVersion,
) {
  if (
    !spotTicksByUnderlyingVersion ||
    typeof spotTicksByUnderlyingVersion !== 'object' ||
    Array.isArray(spotTicksByUnderlyingVersion)
  ) {
    throw new TypeError(
      'spotTicksByUnderlyingVersion must be an object',
    );
  }
  const references = {};
  for (const [
    underlyingId,
    spotTicksByVersion,
  ] of Object.entries(spotTicksByUnderlyingVersion)) {
    if (
      !spotTicksByVersion ||
      typeof spotTicksByVersion !== 'object' ||
      Array.isArray(spotTicksByVersion)
    ) {
      throw new TypeError(
        `Basket settlement spots must be an object: ${underlyingId}`,
      );
    }
    const registeredVersions =
      universe?.equityBasketVersions?.[underlyingId];
    if (!registeredVersions) {
      throw new Error(
        `Unknown basket underlying: ${underlyingId}`,
      );
    }
    references[underlyingId] = {};
    for (const [
      constituentSetVersion,
      spotTicks,
    ] of Object.entries(spotTicksByVersion)) {
      const basket =
        registeredVersions[constituentSetVersion];
      const basketIdentity = equityBasketIdentity(
        underlyingId,
        basket,
      );
      const canonicalBasket =
        equityBasketByIdentity(basketIdentity);
      if (
        !basket ||
        !canonicalBasket ||
        !sameJson(basket, canonicalBasket)
      ) {
        throw new Error(
          `Unknown basket version: ${underlyingId}:${constituentSetVersion}`,
        );
      }
      references[underlyingId][
        constituentSetVersion
      ] = {
        spotTicks: positiveInteger(
          spotTicks,
          `${underlyingId}.${constituentSetVersion}.spotTicks`,
        ),
        basketIdentity,
      };
    }
  }
  return references;
}

export function equityBasketDisplayName(
  underlyingId,
  basketOrIdentity,
) {
  const count = basketOrIdentity?.constituentCount;
  if (!Number.isSafeInteger(count) || count <= 0) return '';
  if (underlyingId === 'SYNTH300') {
    return `历择${count}合成指数`;
  }
  if (underlyingId === 'LZETF50') {
    return `历择${count}核心ETF`;
  }
  return '';
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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function basketVersionRegistrySnapshot() {
  return Object.fromEntries(
    Object.entries(
      DERIVATIVE_EQUITY_BASKET_VERSIONS,
    ).map(([underlyingId, versions]) => [
      underlyingId,
      cloneJson(versions),
    ]),
  );
}

function basketReference(
  underlyingId,
  basket,
  spotTicks,
  observationAtMs,
  authority,
) {
  return {
    basketIdentity: equityBasketIdentity(
      underlyingId,
      basket,
    ),
    spotTicks,
    observationAtMs,
    authority,
  };
}

function currentBasketReferences(underlyings) {
  return Object.fromEntries(
    Object.entries(DERIVATIVE_EQUITY_BASKETS).map(
      ([underlyingId, basket]) => {
        const underlying = underlyings[underlyingId];
        return [
          underlyingId,
          {
            [basket.constituentSetVersion]:
              basketReference(
                underlyingId,
                basket,
                underlying.spotTicks,
                underlying.observationAtMs,
                underlying.authority,
              ),
          },
        ];
      },
    ),
  );
}

export function contractReferenceSpotTicks(
  universe,
  contract,
) {
  const underlying =
    universe?.underlyings?.[contract?.underlyingId];
  if (!underlying || !contract) return null;
  if (!contract.basketIdentity) {
    return underlying.spotTicks;
  }
  if (
    sameEquityBasketIdentity(
      contract.basketIdentity,
      underlying.basketIdentity,
    )
  ) {
    return underlying.spotTicks;
  }
  return (
    universe?.equityBasketReferences?.[
      contract.underlyingId
    ]?.[
      contract.basketIdentity.constituentSetVersion
    ]?.spotTicks ?? null
  );
}

function formatPriceTicks(priceTicks) {
  return (priceTicks / PRICE_SCALE).toFixed(2);
}

const UNDERLYING_TEMPLATES = Object.freeze({
  SYNTH300: Object.freeze({
    id: 'SYNTH300',
    name: equityBasketDisplayName(
      'SYNTH300',
      DERIVATIVE_EQUITY_BASKETS.SYNTH300,
    ),
    kind: 'synthetic_index',
    defaultSpotTicks: 400_000,
    quoteUnit: '点',
    sector: '宽基权益',
    authority: 'world_reference_observation',
    basket: DERIVATIVE_EQUITY_BASKETS.SYNTH300,
    driverModel: Object.freeze({
      family: 'float_weighted_equity_index',
      supplyState: 'constituent_float',
      demandState: 'cross_asset_risk_budget',
      inventoryState: 'constituent_turnover',
      seasonalityState: 'earnings_and_policy_cycle',
      macroExposures: Object.freeze([
        'growth',
        'liquidity',
        'risk_appetite',
      ]),
      baseVolatilityPpm: 220_000,
      termSlopePpmPerYear: 28_000,
      liquidityClass: 'deep_index',
    }),
  }),
  LZETF50: Object.freeze({
    id: 'LZETF50',
    name: equityBasketDisplayName(
      'LZETF50',
      DERIVATIVE_EQUITY_BASKETS.LZETF50,
    ),
    kind: 'synthetic_etf',
    defaultSpotTicks: 320,
    quoteUnit: '元/份',
    sector: '核心资产',
    authority: 'world_reference_observation',
    basket: DERIVATIVE_EQUITY_BASKETS.LZETF50,
    driverModel: Object.freeze({
      family: 'fund_share_and_creation_redemption',
      supplyState: 'fund_units_and_creation_basket',
      demandState: 'household_and_institution_allocation',
      inventoryState: 'authorized_participant_inventory',
      seasonalityState: 'dividend_calendar',
      macroExposures: Object.freeze([
        'large_cap_earnings',
        'rates',
        'fund_flows',
      ]),
      baseVolatilityPpm: 205_000,
      termSlopePpmPerYear: 24_000,
      liquidityClass: 'deep_etf',
    }),
  }),
  LZA003: Object.freeze({
    id: 'LZA003',
    name: '岚序系统',
    kind: 'listed_stock',
    defaultSpotTicks: 4_680,
    quoteUnit: '元/股',
    sector: '软件与算力',
    authority: 'listed_security_last_trade',
    driverModel: Object.freeze({
      family: 'listed_company_equity',
      supplyState: 'listed_float',
      demandState: 'fundamental_and_flow_demand',
      inventoryState: 'public_order_book_inventory',
      seasonalityState: 'reporting_calendar',
      macroExposures: Object.freeze([
        'technology_capex',
        'rates',
        'risk_appetite',
      ]),
      baseVolatilityPpm: 360_000,
      termSlopePpmPerYear: 42_000,
      liquidityClass: 'single_stock',
    }),
  }),
  LZYAU: Object.freeze({
    id: 'LZYAU',
    name: '历择黄金',
    kind: 'synthetic_commodity',
    defaultSpotTicks: 78_000,
    quoteUnit: '元/克',
    sector: '贵金属',
    authority: 'world_synthetic_commodity_balance',
    driverModel: Object.freeze({
      family: 'precious_metal_stock_flow',
      supplyState: 'mine_and_recycling_supply',
      demandState: 'jewelry_investment_and_reserve_demand',
      inventoryState: 'vault_inventory',
      seasonalityState: 'jewelry_and_festival_cycle',
      macroExposures: Object.freeze([
        'real_rates',
        'currency',
        'tail_risk',
      ]),
      baseVolatilityPpm: 190_000,
      termSlopePpmPerYear: 18_000,
      liquidityClass: 'deep_precious_metal',
    }),
  }),
  LZYAG: Object.freeze({
    id: 'LZYAG',
    name: '历择白银',
    kind: 'synthetic_commodity',
    defaultSpotTicks: 980_000,
    quoteUnit: '元/千克',
    sector: '贵金属与工业材料',
    authority: 'world_synthetic_commodity_balance',
    driverModel: Object.freeze({
      family: 'dual_use_precious_metal',
      supplyState: 'mine_byproduct_and_recycling_supply',
      demandState: 'industrial_and_investment_demand',
      inventoryState: 'exchange_and_fabricator_inventory',
      seasonalityState: 'electronics_and_solar_cycle',
      macroExposures: Object.freeze([
        'manufacturing',
        'real_rates',
        'gold_beta',
      ]),
      baseVolatilityPpm: 315_000,
      termSlopePpmPerYear: 35_000,
      liquidityClass: 'volatile_precious_metal',
    }),
  }),
  LZYA: Object.freeze({
    id: 'LZYA',
    name: '历择黄大豆1号',
    kind: 'synthetic_commodity',
    defaultSpotTicks: 460_000,
    quoteUnit: '元/吨',
    sector: '农产品',
    authority: 'world_synthetic_commodity_balance',
    driverModel: Object.freeze({
      family: 'crop_balance_sheet',
      supplyState: 'acreage_yield_and_imports',
      demandState: 'crushing_feed_and_food_demand',
      inventoryState: 'commercial_and_port_stocks',
      seasonalityState: 'planting_weather_and_harvest_cycle',
      macroExposures: Object.freeze([
        'weather',
        'feed_margin',
        'trade_flow',
      ]),
      baseVolatilityPpm: 245_000,
      termSlopePpmPerYear: 52_000,
      liquidityClass: 'seasonal_agriculture',
    }),
  }),
  LZYCU: Object.freeze({
    id: 'LZYCU',
    name: '历择阴极铜',
    kind: 'synthetic_commodity',
    defaultSpotTicks: 8_500_000,
    quoteUnit: '元/吨',
    sector: '工业金属',
    authority: 'world_synthetic_commodity_balance',
    driverModel: Object.freeze({
      family: 'industrial_metal_balance',
      supplyState: 'mine_smelter_and_scrap_supply',
      demandState: 'grid_construction_and_manufacturing',
      inventoryState: 'warehouse_and_pipeline_inventory',
      seasonalityState: 'construction_and_maintenance_cycle',
      macroExposures: Object.freeze([
        'industrial_growth',
        'currency',
        'energy_cost',
      ]),
      baseVolatilityPpm: 235_000,
      termSlopePpmPerYear: 30_000,
      liquidityClass: 'deep_industrial_metal',
    }),
  }),
  LZYSC: Object.freeze({
    id: 'LZYSC',
    name: '历择原油',
    kind: 'synthetic_commodity',
    defaultSpotTicks: 62_000,
    quoteUnit: '元/桶',
    sector: '能源',
    authority: 'world_synthetic_commodity_balance',
    driverModel: Object.freeze({
      family: 'energy_inventory_and_spare_capacity',
      supplyState: 'production_and_spare_capacity',
      demandState: 'transport_and_industrial_demand',
      inventoryState: 'tank_and_pipeline_inventory',
      seasonalityState: 'refinery_and_transport_cycle',
      macroExposures: Object.freeze([
        'global_growth',
        'geopolitical_risk',
        'currency',
      ]),
      baseVolatilityPpm: 410_000,
      termSlopePpmPerYear: -38_000,
      liquidityClass: 'event_sensitive_energy',
    }),
  }),
});

const FUTURE_SPECS = Object.freeze({
  SYNTH300: Object.freeze({
    contractMultiplier: 300,
    multiplierUnit: '元/点',
    tickSize: 20,
    initialMarginBps: 1_200,
    maintenanceMarginBps: 900,
    liquidationMarginBps: 650,
    dailyLimitBps: 1_000,
    carryRateBps: 240,
    settlementMethod: 'index_cash_settlement',
    depthClass: 'deep_index',
  }),
  LZYAU: Object.freeze({
    contractMultiplier: 1_000,
    multiplierUnit: '克',
    tickSize: 2,
    initialMarginBps: 1_000,
    maintenanceMarginBps: 800,
    liquidationMarginBps: 620,
    dailyLimitBps: 600,
    carryRateBps: 180,
    settlementMethod: 'cash_equivalent_synthetic_delivery',
    depthClass: 'deep_precious_metal',
  }),
  LZYAG: Object.freeze({
    contractMultiplier: 15,
    multiplierUnit: '千克',
    tickSize: 100,
    initialMarginBps: 1_400,
    maintenanceMarginBps: 1_100,
    liquidationMarginBps: 850,
    dailyLimitBps: 900,
    carryRateBps: 210,
    settlementMethod: 'cash_equivalent_synthetic_delivery',
    depthClass: 'volatile_precious_metal',
  }),
  LZYA: Object.freeze({
    contractMultiplier: 10,
    multiplierUnit: '吨',
    tickSize: 100,
    initialMarginBps: 1_000,
    maintenanceMarginBps: 780,
    liquidationMarginBps: 600,
    dailyLimitBps: 700,
    carryRateBps: 320,
    settlementMethod: 'cash_equivalent_synthetic_delivery',
    depthClass: 'seasonal_agriculture',
  }),
  LZYCU: Object.freeze({
    contractMultiplier: 5,
    multiplierUnit: '吨',
    tickSize: 1_000,
    initialMarginBps: 1_200,
    maintenanceMarginBps: 950,
    liquidationMarginBps: 720,
    dailyLimitBps: 800,
    carryRateBps: 260,
    settlementMethod: 'cash_equivalent_synthetic_delivery',
    depthClass: 'deep_industrial_metal',
  }),
  LZYSC: Object.freeze({
    contractMultiplier: 1_000,
    multiplierUnit: '桶',
    tickSize: 10,
    initialMarginBps: 1_900,
    maintenanceMarginBps: 1_500,
    liquidationMarginBps: 1_150,
    dailyLimitBps: 1_700,
    carryRateBps: 420,
    settlementMethod: 'cash_equivalent_synthetic_delivery',
    depthClass: 'event_sensitive_energy',
  }),
});

const OPTION_SPECS = Object.freeze({
  SYNTH300: Object.freeze({
    contractMultiplier: 100,
    multiplierUnit: '元/点',
    tickSize: 20,
    strikeStepTicks: 10_000,
    exercise: 'european',
    settlementMethod: 'index_cash_settlement',
    baseVolatilityPpm: 220_000,
    dividendYieldBps: 180,
    holdingCostBps: 0,
    depthClass: 'deep_index',
  }),
  LZETF50: Object.freeze({
    contractMultiplier: 10_000,
    multiplierUnit: '份',
    tickSize: 1,
    strikeStepTicks: 5,
    exercise: 'european',
    settlementMethod: 'cash_equivalent_fund_unit_delivery',
    baseVolatilityPpm: 205_000,
    dividendYieldBps: 220,
    holdingCostBps: 0,
    depthClass: 'deep_etf',
  }),
  LZA003: Object.freeze({
    contractMultiplier: 100,
    multiplierUnit: '股',
    tickSize: 1,
    strikeStepTicks: 100,
    exercise: 'european',
    settlementMethod: 'cash_equivalent_share_delivery',
    baseVolatilityPpm: 360_000,
    dividendYieldBps: 80,
    holdingCostBps: 0,
    depthClass: 'single_stock',
  }),
  LZYAU: Object.freeze({
    contractMultiplier: 1_000,
    multiplierUnit: '克',
    tickSize: 2,
    strikeStepTicks: 1_000,
    exercise: 'european',
    settlementMethod: 'cash_equivalent_synthetic_delivery',
    baseVolatilityPpm: 190_000,
    dividendYieldBps: 0,
    holdingCostBps: 180,
    depthClass: 'deep_precious_metal',
  }),
  LZYA: Object.freeze({
    contractMultiplier: 10,
    multiplierUnit: '吨',
    tickSize: 50,
    strikeStepTicks: 10_000,
    exercise: 'european',
    settlementMethod: 'cash_equivalent_synthetic_delivery',
    baseVolatilityPpm: 245_000,
    dividendYieldBps: 0,
    holdingCostBps: 320,
    depthClass: 'seasonal_agriculture',
  }),
  LZYSC: Object.freeze({
    contractMultiplier: 1_000,
    multiplierUnit: '桶',
    tickSize: 5,
    strikeStepTicks: 500,
    exercise: 'european',
    settlementMethod: 'cash_equivalent_synthetic_delivery',
    baseVolatilityPpm: 410_000,
    dividendYieldBps: 0,
    holdingCostBps: 420,
    depthClass: 'event_sensitive_energy',
  }),
});

// The offline exchange uses product-specific per-contract schedules. This
// follows the public Chinese-market structure (fees belong to the contract
// and may differ between opening, closing, and exercise) without pretending
// that a live exchange tariff is immutable inside the synthetic world.
const FUTURE_FEE_SPECS = Object.freeze({
  SYNTH300: Object.freeze({
    openFeeCentsPerContract: 230,
    closeFeeCentsPerContract: 230,
    exerciseFeeCentsPerContract: 100,
  }),
  LZYAU: Object.freeze({
    openFeeCentsPerContract: 1_000,
    closeFeeCentsPerContract: 1_000,
    exerciseFeeCentsPerContract: 1_000,
  }),
  LZYAG: Object.freeze({
    openFeeCentsPerContract: 800,
    closeFeeCentsPerContract: 800,
    exerciseFeeCentsPerContract: 800,
  }),
  LZYA: Object.freeze({
    openFeeCentsPerContract: 500,
    closeFeeCentsPerContract: 500,
    exerciseFeeCentsPerContract: 500,
  }),
  LZYCU: Object.freeze({
    openFeeCentsPerContract: 500,
    closeFeeCentsPerContract: 500,
    exerciseFeeCentsPerContract: 500,
  }),
  LZYSC: Object.freeze({
    openFeeCentsPerContract: 4_000,
    closeFeeCentsPerContract: 4_000,
    exerciseFeeCentsPerContract: 4_000,
  }),
});

const OPTION_FEE_SPECS = Object.freeze({
  SYNTH300: Object.freeze({
    openFeeCentsPerContract: 1_500,
    closeFeeCentsPerContract: 1_500,
    exerciseFeeCentsPerContract: 200,
  }),
  LZETF50: Object.freeze({
    openFeeCentsPerContract: 130,
    closeFeeCentsPerContract: 130,
    exerciseFeeCentsPerContract: 60,
  }),
  LZA003: Object.freeze({
    openFeeCentsPerContract: 300,
    closeFeeCentsPerContract: 300,
    exerciseFeeCentsPerContract: 90,
  }),
  LZYAU: Object.freeze({
    openFeeCentsPerContract: 500,
    closeFeeCentsPerContract: 500,
    exerciseFeeCentsPerContract: 500,
  }),
  LZYA: Object.freeze({
    openFeeCentsPerContract: 500,
    closeFeeCentsPerContract: 500,
    exerciseFeeCentsPerContract: 500,
  }),
  LZYSC: Object.freeze({
    openFeeCentsPerContract: 2_000,
    closeFeeCentsPerContract: 2_000,
    exerciseFeeCentsPerContract: 2_000,
  }),
});

function optionContractCarryRateBps(underlyingId) {
  const spec = OPTION_SPECS[underlyingId];
  if (!spec) {
    throw new Error(
      `Missing option carry specification: ${underlyingId}`,
    );
  }
  return (
    SYNTHETIC_FUNDING_CURVE.riskFreeRateBps -
    spec.dividendYieldBps +
    spec.holdingCostBps
  );
}

function contractFeeSchedule(type, underlyingId) {
  const spec =
    type === 'future'
      ? FUTURE_FEE_SPECS[underlyingId]
      : OPTION_FEE_SPECS[underlyingId];
  if (!spec) {
    throw new Error(
      `Missing derivative fee schedule: ${type}:${underlyingId}`,
    );
  }
  return {
    id:
      `lzy-${type}-${underlyingId}-` +
      'per-contract-fees-v1',
    basis: 'per_contract',
    currencyUnit: 'cents',
    ...spec,
  };
}

function createUnderlying(template, nowMs, spotTicks) {
  return {
    id: template.id,
    name: template.name,
    kind: template.kind,
    spotTicks,
    priceScale: PRICE_SCALE,
    quoteUnit: template.quoteUnit,
    sector: template.sector,
    observationAtMs: nowMs,
    riskFreeRateBps:
      SYNTHETIC_FUNDING_CURVE.riskFreeRateBps,
    riskFreeRateAuthority:
      SYNTHETIC_FUNDING_CURVE.authority,
    fundingCurveVersion:
      SYNTHETIC_FUNDING_CURVE.id,
    carryRateBps:
      FUTURE_SPECS[template.id]?.carryRateBps ??
      (
        OPTION_SPECS[template.id]
          ? optionContractCarryRateBps(template.id)
          : 0
      ),
    authority: template.authority,
    driverModel: cloneJson(template.driverModel),
    ...(template.basket
      ? {
          basket: cloneJson(template.basket),
          basketIdentity: equityBasketIdentity(
            template.id,
            template.basket,
          ),
        }
      : {}),
  };
}

function expiryKey(expiryMs) {
  const expiryDay = Math.floor(expiryMs / DAY_MS);
  return `E${String(expiryDay).padStart(7, '0')}`;
}

function strikeGrid(spotTicks, stepTicks) {
  return [
    9_000,
    10_000,
    11_000,
  ].map((basisPoints) =>
    Math.max(
      stepTicks,
      Math.round(
        spotTicks * basisPoints /
          10_000 /
          stepTicks,
      ) * stepTicks,
    ),
  );
}

export function contractDisplayName(contract, universe) {
  const underlying =
    universe?.underlyings?.[contract?.underlyingId];
  if (!underlying || !contract) return '';
  const basketName = equityBasketDisplayName(
    contract.underlyingId,
    contract.basketIdentity ??
      underlying.basketIdentity,
  );
  const underlyingName = basketName || underlying.name;
  const expiryDay = Math.floor(contract.expiryMs / DAY_MS);
  const expiry = `第${expiryDay}世界日`;
  if (contract.type === 'future') {
    return (
      `${underlyingName}${expiry}期货` +
      `（1手=${contract.contractMultiplier}` +
      `${contract.multiplierUnit}）`
    );
  }
  return (
    `${underlyingName}${expiry}` +
    `${contract.kind === 'call' ? '认购' : '认沽'}` +
    `·行权${formatPriceTicks(contract.strikeTicks)}` +
    `${underlying.quoteUnit}` +
    `（1张=${contract.contractMultiplier}` +
    `${contract.multiplierUnit}）`
  );
}

function createFutureContract(
  universe,
  underlyingId,
  expiryMs,
) {
  const spec = FUTURE_SPECS[underlyingId];
  const key = expiryKey(expiryMs);
  const id = `${underlyingId}-FUT-${key}`;
  const contract = {
    id,
    contractCode: id,
    type: 'future',
    underlyingId,
    listedAtMs:
      universe.underlyings[underlyingId].observationAtMs,
    expiryMs,
    settlement: 'cash',
    settlementMethod: spec.settlementMethod,
    deliveryReference: 'underlying_final_settlement',
    priceScale: PRICE_SCALE,
    quoteUnit:
      universe.underlyings[underlyingId].quoteUnit,
    quantityUnit: '手',
    contractMultiplier: spec.contractMultiplier,
    multiplierUnit: spec.multiplierUnit,
    deliveryQuantityPerContract:
      spec.contractMultiplier,
    tickSize: spec.tickSize,
    tickValueCents: spec.contractMultiplier,
    initialMarginBps: spec.initialMarginBps,
    maintenanceMarginBps: spec.maintenanceMarginBps,
    liquidationMarginBps:
      spec.liquidationMarginBps,
    dailyLimitBps: spec.dailyLimitBps,
    carryRateBps: spec.carryRateBps,
    depthClass: spec.depthClass,
    feeSchedule: contractFeeSchedule(
      'future',
      underlyingId,
    ),
    ...(universe.underlyings[underlyingId]
      .basketIdentity
      ? {
          basketIdentity: cloneJson(
            universe.underlyings[underlyingId]
              .basketIdentity,
          ),
        }
      : {}),
    status: 'active',
  };
  contract.displayName = contractDisplayName(
    contract,
    universe,
  );
  return contract;
}

function createOptionContract(
  universe,
  underlyingId,
  expiryMs,
  strikeTicks,
  kind,
) {
  const spec = OPTION_SPECS[underlyingId];
  const key = expiryKey(expiryMs);
  const id = [
    underlyingId,
    'OPT',
    key,
    kind === 'call' ? 'C' : 'P',
    strikeTicks,
  ].join('-');
  const contract = {
    id,
    contractCode: id,
    type: 'option',
    kind,
    underlyingId,
    listedAtMs:
      universe.underlyings[underlyingId].observationAtMs,
    expiryMs,
    strikeTicks,
    exercise: spec.exercise,
    settlement: 'cash',
    settlementMethod: spec.settlementMethod,
    priceScale: PRICE_SCALE,
    quoteUnit:
      universe.underlyings[underlyingId].quoteUnit,
    premiumQuoteUnit:
      universe.underlyings[underlyingId].quoteUnit,
    quantityUnit: '张',
    contractMultiplier: spec.contractMultiplier,
    multiplierUnit: spec.multiplierUnit,
    deliveryQuantityPerContract:
      spec.contractMultiplier,
    tickSize: spec.tickSize,
    tickValueCents: spec.contractMultiplier,
    dailyLimitBps: spec.dailyLimitBps ?? 10_000,
    baseVolatilityPpm: spec.baseVolatilityPpm,
    riskFreeRateBps:
      SYNTHETIC_FUNDING_CURVE.riskFreeRateBps,
    dividendYieldBps: spec.dividendYieldBps,
    holdingCostBps: spec.holdingCostBps,
    carryRateBps:
      optionContractCarryRateBps(underlyingId),
    carryConventionVersion:
      SYNTHETIC_FUNDING_CURVE
        .optionCarryConventionVersion,
    fundingCurveVersion:
      SYNTHETIC_FUNDING_CURVE.id,
    depthClass: spec.depthClass,
    feeSchedule: contractFeeSchedule(
      'option',
      underlyingId,
    ),
    ...(universe.underlyings[underlyingId]
      .basketIdentity
      ? {
          basketIdentity: cloneJson(
            universe.underlyings[underlyingId]
              .basketIdentity,
          ),
        }
      : {}),
    status: 'active',
  };
  contract.displayName = contractDisplayName(
    contract,
    universe,
  );
  return contract;
}

export function appendSyntheticExpiry(
  universe,
  { expiryMs, spotTicks } = {},
) {
  nonNegativeInteger(expiryMs, 'expiryMs');
  if (
    universe?.ruleVersion !== CONTRACT_RULE_VERSION ||
    expiryMs <= universe.createdAtMs
  ) {
    throw new RangeError(
      'A valid future expiry is required',
    );
  }
  if (spotTicks !== undefined) {
    positiveInteger(spotTicks, 'spotTicks');
    universe.underlyings.SYNTH300.spotTicks = spotTicks;
    const currentIdentity =
      universe.underlyings.SYNTH300.basketIdentity;
    const reference =
      universe.equityBasketReferences?.SYNTH300?.[
        currentIdentity?.constituentSetVersion
      ];
    if (reference) {
      reference.spotTicks = spotTicks;
      reference.observationAtMs =
        universe.underlyings.SYNTH300.observationAtMs;
    }
  }
  const listedIds = [];
  for (const underlyingId of Object.keys(FUTURE_SPECS)) {
    const contract = createFutureContract(
      universe,
      underlyingId,
      expiryMs,
    );
    if (universe.futures[contract.id]) continue;
    universe.futures[contract.id] = contract;
    listedIds.push(contract.id);
  }
  for (const [
    underlyingId,
    spec,
  ] of Object.entries(OPTION_SPECS)) {
    const underlying = universe.underlyings[underlyingId];
    for (const strikeTicks of strikeGrid(
      underlying.spotTicks,
      spec.strikeStepTicks,
    )) {
      for (const kind of ['call', 'put']) {
        const contract = createOptionContract(
          universe,
          underlyingId,
          expiryMs,
          strikeTicks,
          kind,
        );
        if (universe.options[contract.id]) continue;
        universe.options[contract.id] = contract;
        listedIds.push(contract.id);
      }
    }
  }
  const audit = assertContractUniverse(universe);
  if (!audit.ok) {
    throw new Error(
      `Invalid extended derivative universe: ${audit.errors.join('; ')}`,
    );
  }
  return listedIds;
}

export function createSyntheticDerivativeUniverse({
  nowMs,
  spotTicks,
  underlyingSpots = {},
} = {}) {
  nonNegativeInteger(nowMs, 'nowMs');
  positiveInteger(spotTicks, 'spotTicks');
  if (
    !underlyingSpots ||
    typeof underlyingSpots !== 'object' ||
    Array.isArray(underlyingSpots)
  ) {
    throw new TypeError('underlyingSpots must be an object');
  }
  const underlyings = Object.fromEntries(
    Object.values(UNDERLYING_TEMPLATES).map(
      (template) => {
        const supplied =
          template.id === 'SYNTH300'
            ? spotTicks
            : underlyingSpots[template.id] ??
              template.defaultSpotTicks;
        return [
          template.id,
          createUnderlying(
            template,
            nowMs,
            positiveInteger(
              supplied,
              `underlyingSpots.${template.id}`,
            ),
          ),
        ];
      },
    ),
  );
  const universe = {
    ruleVersion: CONTRACT_RULE_VERSION,
    createdAtMs: nowMs,
    underlyings,
    equityBasketVersions:
      basketVersionRegistrySnapshot(),
    equityBasketReferences:
      currentBasketReferences(underlyings),
    futures: {},
    options: {},
  };
  for (const days of [30, 90]) {
    appendSyntheticExpiry(universe, {
      expiryMs: nowMs + days * DAY_MS,
      spotTicks,
    });
  }
  return universe;
}

function decorateLegacyContract(
  universe,
  contract,
  basketIdentity = null,
) {
  const underlyingId = contract.underlyingId;
  const spec =
    contract.type === 'future'
      ? FUTURE_SPECS[underlyingId]
      : OPTION_SPECS[underlyingId];
  if (!spec) return;
  contract.contractCode ??= contract.id;
  contract.priceScale ??= PRICE_SCALE;
  contract.quoteUnit ??=
    universe.underlyings[underlyingId].quoteUnit;
  contract.quantityUnit ??=
    contract.type === 'future' ? '手' : '张';
  contract.contractMultiplier ??=
    spec.contractMultiplier;
  contract.multiplierUnit ??= spec.multiplierUnit;
  contract.deliveryQuantityPerContract ??=
    contract.contractMultiplier;
  contract.tickValueCents =
    contract.contractMultiplier;
  contract.settlementMethod ??=
    spec.settlementMethod;
  contract.dailyLimitBps ??=
    spec.dailyLimitBps ?? 10_000;
  contract.depthClass ??=
    spec.depthClass ?? 'option_chain';
  contract.feeSchedule ??=
    contractFeeSchedule(
      contract.type,
      underlyingId,
    );
  if (
    DERIVATIVE_EQUITY_BASKETS[underlyingId] &&
    !contract.basketIdentity
  ) {
    contract.basketIdentity = cloneJson(
      basketIdentity ??
        universe.underlyings[underlyingId]
          .basketIdentity,
    );
  }
  if (contract.type === 'future') {
    contract.carryRateBps ??= spec.carryRateBps;
  } else {
    contract.premiumQuoteUnit ??=
      universe.underlyings[underlyingId].quoteUnit;
    contract.baseVolatilityPpm ??=
      spec.baseVolatilityPpm;
    contract.riskFreeRateBps ??=
      SYNTHETIC_FUNDING_CURVE.riskFreeRateBps;
    contract.dividendYieldBps ??=
      spec.dividendYieldBps;
    contract.holdingCostBps ??=
      spec.holdingCostBps;
    contract.carryRateBps ??=
      optionContractCarryRateBps(underlyingId);
    contract.carryConventionVersion ??=
      SYNTHETIC_FUNDING_CURVE
        .optionCarryConventionVersion;
    contract.fundingCurveVersion ??=
      SYNTHETIC_FUNDING_CURVE.id;
  }
  contract.displayName = contractDisplayName(
    contract,
    universe,
  );
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function basketConstituentsMatch(left, right) {
  return (
    left?.weightingMethod === right.weightingMethod &&
    left?.baseLevelTicks === right.baseLevelTicks &&
    sameJson(
      left?.constituentSymbols,
      right.constituentSymbols,
    )
  );
}

function currentUnderlyingNetwork(
  savedUnderlyings,
  createdAtMs,
) {
  return Object.fromEntries(
    Object.values(UNDERLYING_TEMPLATES).map(
      (template) => {
        const saved = savedUnderlyings?.[template.id];
        const spotTicks =
          saved?.spotTicks ?? template.defaultSpotTicks;
        const observationAtMs =
          saved?.observationAtMs ?? createdAtMs;
        const current = createUnderlying(
          template,
          observationAtMs,
          positiveInteger(
            spotTicks,
            `underlyings.${template.id}.spotTicks`,
          ),
        );
        return [
          template.id,
          {
            ...current,
            ...(saved ?? {}),
            id: template.id,
            name: template.name,
            kind: template.kind,
            spotTicks,
            quoteUnit: template.quoteUnit,
            sector: template.sector,
            observationAtMs,
            riskFreeRateBps:
              Number.isSafeInteger(
                saved?.riskFreeRateBps,
              )
                ? saved.riskFreeRateBps
                : SYNTHETIC_FUNDING_CURVE
                    .riskFreeRateBps,
            riskFreeRateAuthority:
              typeof saved?.riskFreeRateAuthority ===
              'string'
                ? saved.riskFreeRateAuthority
                : SYNTHETIC_FUNDING_CURVE.authority,
            fundingCurveVersion:
              typeof saved?.fundingCurveVersion ===
              'string'
                ? saved.fundingCurveVersion
                : SYNTHETIC_FUNDING_CURVE.id,
            carryRateBps:
              Number.isSafeInteger(saved?.carryRateBps)
                ? saved.carryRateBps
                : FUTURE_SPECS[template.id]
                    ?.carryRateBps ??
                  (
                    OPTION_SPECS[template.id]
                      ? optionContractCarryRateBps(
                          template.id,
                        )
                      : 0
                  ),
            authority: template.authority,
            driverModel: cloneJson(template.driverModel),
            ...(template.basket
              ? {
                  basket: cloneJson(template.basket),
                  basketIdentity: equityBasketIdentity(
                    template.id,
                    template.basket,
                  ),
                }
              : {}),
          },
        ];
      },
    ),
  );
}

function installBasketInfrastructure(
  universe,
  historicalReferences = {},
) {
  universe.equityBasketVersions =
    basketVersionRegistrySnapshot();
  universe.equityBasketReferences = {
    ...currentBasketReferences(universe.underlyings),
  };
  for (const [
    underlyingId,
    references,
  ] of Object.entries(historicalReferences)) {
    universe.equityBasketReferences[underlyingId] = {
      ...(universe.equityBasketReferences[underlyingId] ??
        {}),
      ...cloneJson(references),
    };
  }
}

function referencesForSavedBaskets(
  savedUnderlyings,
  basketSet,
) {
  return Object.fromEntries(
    Object.entries(basketSet).map(
      ([underlyingId, basket]) => {
        const saved = savedUnderlyings?.[underlyingId];
        if (!saved) return [underlyingId, {}];
        return [
          underlyingId,
          {
            [basket.constituentSetVersion]:
              basketReference(
                underlyingId,
                basket,
                saved.spotTicks,
                saved.observationAtMs ?? 0,
                saved.authority ??
                  UNDERLYING_TEMPLATES[underlyingId]
                    .authority,
              ),
          },
        ];
      },
    ),
  );
}

export function migrateContractUniverse(universe) {
  if (universe?.ruleVersion === CONTRACT_RULE_VERSION) {
    let migrated = false;
    const versions = basketVersionRegistrySnapshot();
    if (!sameJson(universe.equityBasketVersions, versions)) {
      universe.equityBasketVersions = versions;
      migrated = true;
    }
    for (const template of Object.values(
      UNDERLYING_TEMPLATES,
    )) {
      const underlying = universe.underlyings?.[template.id];
      if (
        underlying &&
        !Number.isSafeInteger(underlying.carryRateBps)
      ) {
        underlying.carryRateBps =
          FUTURE_SPECS[template.id]
            ?.carryRateBps ?? 0;
        migrated = true;
      }
      if (
        underlying &&
        !Number.isSafeInteger(
          underlying.riskFreeRateBps,
        )
      ) {
        underlying.riskFreeRateBps =
          SYNTHETIC_FUNDING_CURVE.riskFreeRateBps;
        migrated = true;
      }
      if (
        underlying &&
        typeof underlying.riskFreeRateAuthority !==
          'string'
      ) {
        underlying.riskFreeRateAuthority =
          SYNTHETIC_FUNDING_CURVE.authority;
        migrated = true;
      }
      if (
        underlying &&
        typeof underlying.fundingCurveVersion !==
          'string'
      ) {
        underlying.fundingCurveVersion =
          SYNTHETIC_FUNDING_CURVE.id;
        migrated = true;
      }
      if (!template.basket || !underlying) continue;
      const currentIdentity = equityBasketIdentity(
        template.id,
        template.basket,
      );
      if (
        !underlying.basket &&
        sameEquityBasketIdentity(
          underlying.basketIdentity,
          currentIdentity,
        )
      ) {
        underlying.basket = cloneJson(template.basket);
        migrated = true;
      }
      if (
        basketConstituentsMatch(
          underlying.basket,
          template.basket,
        ) &&
        !sameJson(underlying.basket, template.basket)
      ) {
        underlying.basket = cloneJson(template.basket);
        migrated = true;
      }
      if (
        basketConstituentsMatch(
          underlying.basket,
          template.basket,
        ) &&
        !sameEquityBasketIdentity(
          underlying.basketIdentity,
          currentIdentity,
        )
      ) {
        underlying.basketIdentity =
          cloneJson(currentIdentity);
        migrated = true;
      }
      const currentName = equityBasketDisplayName(
        template.id,
        underlying.basketIdentity,
      );
      if (
        currentName &&
        underlying.name !== currentName
      ) {
        underlying.name = currentName;
        migrated = true;
      }
    }
    universe.equityBasketReferences ??=
      currentBasketReferences(universe.underlyings);
    for (const [underlyingId, basket] of Object.entries(
      DERIVATIVE_EQUITY_BASKETS,
    )) {
      const underlying = universe.underlyings[underlyingId];
      const version = basket.constituentSetVersion;
      universe.equityBasketReferences[underlyingId] ??= {};
      if (
        !universe.equityBasketReferences[underlyingId][
          version
        ]
      ) {
        universe.equityBasketReferences[underlyingId][
          version
        ] = basketReference(
          underlyingId,
          basket,
          underlying.spotTicks,
          underlying.observationAtMs,
          underlying.authority,
        );
        migrated = true;
      }
    }
    for (const contract of allContracts(universe)) {
      const before = JSON.stringify({
        basketIdentity: contract.basketIdentity,
        displayName: contract.displayName,
        feeSchedule: contract.feeSchedule,
        riskFreeRateBps: contract.riskFreeRateBps,
        carryRateBps: contract.carryRateBps,
        carryConventionVersion:
          contract.carryConventionVersion,
        fundingCurveVersion:
          contract.fundingCurveVersion,
      });
      decorateLegacyContract(
        universe,
        contract,
        universe.underlyings[contract.underlyingId]
          ?.basketIdentity,
      );
      if (
        before !==
        JSON.stringify({
          basketIdentity: contract.basketIdentity,
          displayName: contract.displayName,
          feeSchedule: contract.feeSchedule,
          riskFreeRateBps:
            contract.riskFreeRateBps,
          carryRateBps: contract.carryRateBps,
          carryConventionVersion:
            contract.carryConventionVersion,
          fundingCurveVersion:
            contract.fundingCurveVersion,
        })
      ) {
        migrated = true;
      }
    }
    return migrated;
  }
  if (
    universe?.ruleVersion !==
      PREVIOUS_CONTRACT_RULE_VERSION &&
    universe?.ruleVersion !==
      INTERMEDIATE_CONTRACT_RULE_VERSION &&
    universe?.ruleVersion !==
      LEGACY_CONTRACT_RULE_VERSION
  ) {
    throw new Error(
      `Unsupported contract universe: ${universe?.ruleVersion}`,
    );
  }
  const synthSpot = positiveInteger(
    universe.underlyings?.SYNTH300?.spotTicks,
    'legacy SYNTH300 spotTicks',
  );
  const savedUnderlyings = universe.underlyings;
  const historicalBasketSet =
    universe.ruleVersion === PREVIOUS_CONTRACT_RULE_VERSION
      ? PREVIOUS_DERIVATIVE_EQUITY_BASKETS
      : INTERMEDIATE_DERIVATIVE_EQUITY_BASKETS;
  if (
    universe.ruleVersion === PREVIOUS_CONTRACT_RULE_VERSION ||
    universe.ruleVersion === INTERMEDIATE_CONTRACT_RULE_VERSION
  ) {
    for (const [
      underlyingId,
      previousBasket,
    ] of Object.entries(
      historicalBasketSet,
    )) {
      const savedBasket =
        savedUnderlyings?.[underlyingId]?.basket;
      if (
        savedBasket &&
        !basketConstituentsMatch(
          savedBasket,
          previousBasket,
        )
      ) {
        throw new Error(
          `Legacy equity basket mismatch: ${underlyingId}`,
        );
      }
    }
  }
  const historicalReferences =
    referencesForSavedBaskets(
      savedUnderlyings,
      historicalBasketSet,
    );
  const priorIdentityByUnderlying =
    Object.fromEntries(
      Object.entries(
        historicalBasketSet,
      ).map(([underlyingId, basket]) => [
        underlyingId,
        equityBasketIdentity(underlyingId, basket),
      ]),
    );
  universe.underlyings = currentUnderlyingNetwork(
    savedUnderlyings,
    universe.createdAtMs,
  );
  installBasketInfrastructure(
    universe,
    historicalReferences,
  );
  for (const contract of allContracts(universe)) {
    const priorIdentity =
      priorIdentityByUnderlying[
        contract.underlyingId
      ] ?? null;
    if (priorIdentity) {
      contract.basketIdentity =
        cloneJson(priorIdentity);
    }
    decorateLegacyContract(
      universe,
      contract,
      priorIdentity,
    );
  }
  universe.ruleVersion = CONTRACT_RULE_VERSION;
  const expiries = [
    ...new Set(
      Object.values(universe.futures).map(
        (contract) => contract.expiryMs,
      ),
    ),
  ].sort((left, right) => left - right);
  for (const expiryMs of expiries) {
    appendSyntheticExpiry(universe, {
      expiryMs,
      spotTicks: synthSpot,
    });
  }
  const audit = assertContractUniverse(universe);
  if (!audit.ok) {
    throw new Error(
      `Invalid migrated derivative universe: ${audit.errors.join('; ')}`,
    );
  }
  return true;
}

export function contractById(universe, contractId) {
  return (
    universe.futures?.[contractId] ??
    universe.options?.[contractId] ??
    null
  );
}

export function allContracts(universe) {
  return [
    ...Object.values(universe.futures ?? {}),
    ...Object.values(universe.options ?? {}),
  ];
}

export function assertContractUniverse(universe) {
  const errors = [];
  if (universe?.ruleVersion !== CONTRACT_RULE_VERSION) {
    errors.push('INVALID_CONTRACT_RULE_VERSION');
  }
  if (
    !sameJson(
      universe?.equityBasketVersions,
      basketVersionRegistrySnapshot(),
    )
  ) {
    errors.push('INVALID_EQUITY_BASKET_REGISTRY');
  }
  for (const [id, underlying] of Object.entries(
    universe?.underlyings ?? {},
  )) {
    if (
      id !== underlying.id ||
      !Number.isSafeInteger(underlying.spotTicks) ||
      underlying.spotTicks <= 0 ||
      !Number.isSafeInteger(underlying.observationAtMs) ||
      !Number.isSafeInteger(
        underlying.riskFreeRateBps,
      ) ||
      underlying.riskFreeRateBps < -5_000 ||
      underlying.riskFreeRateBps > 5_000 ||
      typeof underlying.riskFreeRateAuthority !==
        'string' ||
      typeof underlying.fundingCurveVersion !==
        'string' ||
      !Number.isSafeInteger(underlying.carryRateBps) ||
      underlying.carryRateBps < -5_000 ||
      underlying.carryRateBps > 5_000 ||
      typeof underlying.quoteUnit !== 'string' ||
      !underlying.driverModel ||
      !Number.isSafeInteger(
        underlying.driverModel.baseVolatilityPpm,
      ) ||
      !Array.isArray(
        underlying.driverModel.macroExposures,
      )
    ) {
      errors.push(`INVALID_UNDERLYING:${id}`);
    }
    if (
      ['SYNTH300', 'LZETF50'].includes(id) &&
      (
        underlying.basket?.weightingMethod !==
          'float_market_cap' ||
        !Number.isSafeInteger(
          underlying.basket?.baseLevelTicks,
        ) ||
        underlying.basket.baseLevelTicks <= 0 ||
        !Array.isArray(
          underlying.basket?.constituentSymbols,
        ) ||
        underlying.basket.constituentSymbols.length === 0 ||
        underlying.basket.constituentCount !==
          underlying.basket.constituentSymbols.length ||
        typeof underlying.basket.constituentSetVersion !==
          'string' ||
        !/^fnv1a32:[0-9a-f]{8}$/.test(
          underlying.basket.constituentSetDigest,
        ) ||
        new Set(
          underlying.basket.constituentSymbols,
        ).size !==
          underlying.basket.constituentSymbols.length ||
        !sameEquityBasketIdentity(
          underlying.basketIdentity,
          equityBasketIdentity(id, underlying.basket),
        ) ||
        !sameJson(
          underlying.basket,
          DERIVATIVE_EQUITY_BASKETS[id],
        )
      )
    ) {
      errors.push(`INVALID_UNDERLYING_BASKET:${id}`);
    }
  }
  const pairs = new Map();
  for (const contract of allContracts(universe ?? {})) {
    const basketUnderlying =
      DERIVATIVE_EQUITY_BASKETS[contract.underlyingId];
    if (
      (
        basketUnderlying &&
        !equityBasketByIdentity(
          contract.basketIdentity,
        )
      ) ||
      (!basketUnderlying && contract.basketIdentity)
    ) {
      errors.push(
        `INVALID_CONTRACT_BASKET_IDENTITY:${contract.id ?? 'unknown'}`,
      );
    }
    if (basketUnderlying) {
      const reference =
        universe?.equityBasketReferences?.[
          contract.underlyingId
        ]?.[
          contract.basketIdentity
            ?.constituentSetVersion
        ];
      if (
        !reference ||
        !sameEquityBasketIdentity(
          reference.basketIdentity,
          contract.basketIdentity,
        ) ||
        !Number.isSafeInteger(reference.spotTicks) ||
        reference.spotTicks <= 0 ||
        !Number.isSafeInteger(
          reference.observationAtMs,
        ) ||
        reference.observationAtMs < 0
      ) {
        errors.push(
          `INVALID_CONTRACT_BASKET_REFERENCE:${contract.id ?? 'unknown'}`,
        );
      }
    }
    if (
      !contract.id ||
      !universe.underlyings?.[contract.underlyingId] ||
      !Number.isSafeInteger(contract.expiryMs) ||
      contract.expiryMs <= universe.createdAtMs ||
      !Number.isSafeInteger(contract.tickSize) ||
      contract.tickSize <= 0 ||
      !Number.isSafeInteger(contract.tickValueCents) ||
      contract.tickValueCents <= 0 ||
      !Number.isSafeInteger(contract.contractMultiplier) ||
      contract.contractMultiplier <= 0 ||
      contract.tickValueCents !==
        contract.contractMultiplier ||
      contract.deliveryQuantityPerContract !==
        contract.contractMultiplier ||
      typeof contract.multiplierUnit !== 'string' ||
      typeof contract.quoteUnit !== 'string' ||
      !['手', '张'].includes(contract.quantityUnit) ||
      !['future', 'option'].includes(contract.type) ||
      !sameJson(
        contract.feeSchedule,
        contractFeeSchedule(
          contract.type,
          contract.underlyingId,
        ),
      ) ||
      contract.displayName !==
        contractDisplayName(contract, universe) ||
      !['active', 'expired'].includes(contract.status)
    ) {
      errors.push(
        `INVALID_CONTRACT:${contract.id ?? 'unknown'}`,
      );
      continue;
    }
    if (contract.type === 'future') {
      if (
        contract.quantityUnit !== '手' ||
        contract.settlement !== 'cash' ||
        !Number.isSafeInteger(contract.initialMarginBps) ||
        !Number.isSafeInteger(
          contract.maintenanceMarginBps,
        ) ||
        contract.initialMarginBps <
          contract.maintenanceMarginBps ||
        typeof contract.settlementMethod !== 'string'
      ) {
        errors.push(`INVALID_FUTURE:${contract.id}`);
      }
    } else if (contract.type === 'option') {
      if (
        contract.quantityUnit !== '张' ||
        !['call', 'put'].includes(contract.kind) ||
        contract.exercise !== 'european' ||
        contract.settlement !== 'cash' ||
        !Number.isSafeInteger(contract.strikeTicks) ||
        contract.strikeTicks <= 0 ||
        !Number.isSafeInteger(
          contract.baseVolatilityPpm,
        ) ||
        !Number.isSafeInteger(
          contract.riskFreeRateBps,
        ) ||
        !Number.isSafeInteger(
          contract.dividendYieldBps,
        ) ||
        !Number.isSafeInteger(
          contract.holdingCostBps,
        ) ||
        !Number.isSafeInteger(
          contract.carryRateBps,
        ) ||
        contract.carryRateBps !==
          contract.riskFreeRateBps -
            contract.dividendYieldBps +
            contract.holdingCostBps ||
        contract.carryConventionVersion !==
          SYNTHETIC_FUNDING_CURVE
            .optionCarryConventionVersion ||
        contract.fundingCurveVersion !==
          SYNTHETIC_FUNDING_CURVE.id ||
        typeof contract.premiumQuoteUnit !== 'string'
      ) {
        errors.push(`INVALID_OPTION:${contract.id}`);
      }
      const key = [
        contract.underlyingId,
        contract.expiryMs,
        contract.strikeTicks,
      ].join(':');
      const kinds = pairs.get(key) ?? new Set();
      kinds.add(contract.kind);
      pairs.set(key, kinds);
    } else {
      errors.push(
        `INVALID_CONTRACT_TYPE:${contract.id}`,
      );
    }
  }
  for (const [key, kinds] of pairs) {
    if (!kinds.has('call') || !kinds.has('put')) {
      errors.push(`UNPAIRED_OPTION:${key}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

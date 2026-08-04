import { createValuationSnapshot } from './valuation.js?v=20260804-01';
import {
  VALUATION_OBSERVATION_VERSION,
} from './maker-ecology.js?v=20260804-01';
import {
  INSTITUTIONAL_VALUATION_INPUT_VERSION,
  createInstitutionalEcology,
} from './institutional-ecology.js?v=20260804-01';

const ONE_YEAR_MS = 31_536_000_000;
const PPM = 1_000_000;
const INSTITUTION_LINEAGED_FIELDS = Object.freeze([
  'expectedHorizonMs',
  'riskFreeRateBps',
  'issuerCreditSpreadBps',
  'longTermGrowthPpm',
  'ttmRevenueCents',
  'ttmNetProfitCents',
  'ttmFreeCashFlowCents',
  'expectedRevenueCents',
  'expectedNetProfitCents',
  'expectedFreeCashFlowCents',
  'bookEquityCents',
  'netDebtCents',
  'floatShares',
  'totalShares',
  'dilutedShares',
  'shareCountPeriodStartMs',
  'periodStartTotalShares',
  'dividendsPaidCents',
  'buybackShares',
  'newSharesIssued',
  'buybackCashPaidCents',
  'issuanceProceedsCents',
  'capitalActionsReflectedInFinancials',
  'confidenceIntervalPpm',
]);

const LIVE_INSTITUTION_MODEL = Object.freeze({
  npc_value_fund: 'inst_quant_value',
  npc_trend_fund: 'inst_quant_trend',
  npc_quant_institution: 'inst_quant_trend',
  npc_industry_fund: 'inst_discretionary_industry',
  npc_stabilization_fund: 'inst_market_stabilization',
});
const LIVE_INSTITUTION_MULTIPLE_FACTOR_PPM =
  Object.freeze({
    npc_value_fund: 980_000,
    npc_trend_fund: 920_000,
    npc_quant_institution: 1_000_000,
    npc_industry_fund: 1_060_000,
    npc_stabilization_fund: 900_000,
  });

const policyCache = new Map();

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function positiveInteger(value, fallback = 1) {
  return Math.max(1, integer(value, fallback));
}

function moneyCents(value) {
  const result = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('financial observation exceeds safe integer range');
  }
  return result;
}

function valuationFor(world, symbol, asOfTick = world?.world?.tick) {
  const valuation = createValuationSnapshot(world, {
    asOfTick,
  }).symbols[symbol];
  if (!valuation) {
    throw new RangeError(`unknown valuation symbol: ${symbol}`);
  }
  return valuation;
}

function sourceFact(world, valuation) {
  const fact = (world.facts ?? []).find(
    (candidate) =>
      candidate.id === valuation.sourceFinancialFactId &&
      candidate.type === 'company_financial_report' &&
      candidate.authority === 'world_fact' &&
      candidate.visibility === 'public',
  );
  if (!fact) {
    throw new Error(
      `missing public financial source ${valuation.sourceFinancialFactId}`,
    );
  }
  return fact;
}

/**
 * Translates one published per-share valuation into the strict maker input.
 * It does not read the traded price and never emits an order or a fill.
 */
export function createMakerValuationObservation({
  world,
  symbol,
  valuation: suppliedValuation = null,
} = {}) {
  const valuation =
    suppliedValuation ?? valuationFor(world, symbol);
  const fact = sourceFact(world, valuation);
  const publishedMs = Math.max(
    0,
    integer(valuation.publishedAtMs),
  );
  const centerTicks = positiveInteger(
    valuation.observedMidpointTicks ??
      valuation.midpointTicks,
  );
  const lowTicks = Math.max(
    1,
    Math.min(
      centerTicks,
      positiveInteger(
        valuation.observedLowTicks ?? valuation.lowTicks,
        centerTicks,
      ),
    ),
  );
  const highTicks = Math.max(
    centerTicks,
    positiveInteger(
      valuation.observedHighTicks ?? valuation.highTicks,
      centerTicks,
    ),
  );
  const factRef = {
    factId: fact.id,
    publishedMs,
    visibility: 'public',
  };
  if (typeof fact.eventId === 'string' && fact.eventId) {
    factRef.eventId = fact.eventId;
  }
  return {
    version: VALUATION_OBSERVATION_VERSION,
    informationScope: 'public_disclosures_only',
    id: `maker-valuation:${symbol}:${fact.id}:${centerTicks}`,
    symbol,
    asOfMs: publishedMs,
    publishedMs,
    priorCenterTicks: centerTicks,
    sourceFactIds: [fact.id],
    estimate: {
      lowTicks,
      centerTicks,
      highTicks,
      confidenceBps: clamp(
        integer(valuation.confidenceBps, 7_500),
        0,
        10_000,
      ),
    },
    valuationBasis: {
      kind: 'public_per_share_multi_method',
      modelId: 'lzy-published-enterprise-valuation',
      modelVersion: valuation.ruleVersion,
      perShareEconomics: true,
      components: [
        'earnings_per_share_multiple',
        'book_value_per_share_multiple',
        'free_cash_flow_per_share_multiple',
        'net_debt_per_share_discount',
        'diluted_share_count',
        'growth_persistence',
        'world_slow_variables',
      ],
      worldSlowVariableFactIds: [],
    },
    drivers: [],
    evidenceSource: {
      kind: 'game_operating_fact_bundle',
      derivationRuleId: 'lzy-published-enterprise-valuation',
      derivationRuleVersion: valuation.ruleVersion,
      factRefs: [factRef],
    },
  };
}

/**
 * Translates the same report into the institutional per-share contract.
 * Expected values, rates, share count and capital actions all come from that
 * report; market price remains outside this observation.
 */
export function createInstitutionValuationObservation({
  world,
  symbol,
  asOfTick = world?.world?.tick,
} = {}) {
  const valuation = valuationFor(world, symbol, asOfTick);
  const fact = sourceFact(world, valuation);
  const published = fact.value;
  const publishedMs = Math.max(
    0,
    integer(valuation.publishedAtMs),
  );
  const totalShares = positiveInteger(
    published.sharesOutstanding,
  );
  const buybackShares = Math.max(
    0,
    integer(published.buybackUnits),
  );
  const newSharesIssued = Math.max(
    0,
    integer(published.issuedUnits),
  );
  const periodStartTotalShares =
    totalShares - newSharesIssued + buybackShares;
  if (periodStartTotalShares <= 0) {
    throw new RangeError('invalid published share-count roll-forward');
  }
  const longTermGrowthPpm = clamp(
    integer(published.expectedGrowthBps) * 100,
    -500_000,
    500_000,
  );
  const growthFactor = clamp(
    PPM + longTermGrowthPpm,
    100_000,
    1_800_000,
  );
  const forward = (value) => {
    const result = Math.round(
      moneyCents(value) * growthFactor / PPM,
    );
    if (!Number.isSafeInteger(result)) {
      throw new RangeError(
        'forward financial observation exceeds safe integer range',
      );
    }
    return result;
  };
  const bookEquityCents = moneyCents(published.bookEquity);
  const factSource = {
    id: `filing:${fact.id}`,
    kind: 'game_enterprise_filing',
    authority: 'authoritative_game_company_fact',
    visibility: 'public',
    publishedMs,
    factIds: [fact.id],
  };
  const center = positiveInteger(valuation.midpointTicks);
  const confidenceLowPpm = clamp(
    Math.round(
      positiveInteger(valuation.lowTicks) * PPM / center,
    ),
    1,
    PPM,
  );
  const confidenceHighPpm = clamp(
    Math.round(
      positiveInteger(valuation.highTicks) * PPM / center,
    ),
    PPM,
    2_000_000,
  );
  const bookPerShareCents = Math.max(
    1,
    Math.round(
      Math.max(0, bookEquityCents) / totalShares,
    ),
  );
  return {
    contractVersion: INSTITUTIONAL_VALUATION_INPUT_VERSION,
    symbol,
    asOfMs: publishedMs,
    publishedMs,
    expectedHorizonMs: ONE_YEAR_MS,
    riskFreeRateBps: integer(published.riskFreeRateBps),
    issuerCreditSpreadBps: Math.max(
      0,
      integer(published.creditSpreadBps),
    ),
    longTermGrowthPpm,
    ttmRevenueCents: Math.max(
      0,
      moneyCents(published.trailingRevenue),
    ),
    ttmNetProfitCents: moneyCents(
      published.trailingNetIncome,
    ),
    ttmFreeCashFlowCents: moneyCents(
      published.trailingFreeCashFlow,
    ),
    expectedRevenueCents: Math.max(
      0,
      forward(published.trailingRevenue),
    ),
    expectedNetProfitCents: forward(
      published.trailingNetIncome,
    ),
    expectedFreeCashFlowCents: forward(
      published.trailingFreeCashFlow,
    ),
    bookEquityCents,
    netDebtCents: moneyCents(published.netDebt),
    floatShares:
      positiveInteger(published.floatShares) ?? totalShares,
    totalShares,
    dilutedShares: totalShares,
    shareCountPeriodStartMs: 0,
    periodStartTotalShares,
    dividendsPaidCents: Math.max(
      0,
      moneyCents(published.distributions ?? 0),
    ),
    buybackShares,
    newSharesIssued,
    buybackCashPaidCents:
      buybackShares > 0
        ? buybackShares * bookPerShareCents
        : 0,
    issuanceProceedsCents:
      newSharesIssued > 0
        ? newSharesIssued * bookPerShareCents
        : 0,
    capitalActionsReflectedInFinancials: true,
    confidenceIntervalPpm: {
      low: confidenceLowPpm,
      high: confidenceHighPpm,
    },
    derivation: {
      kind: 'game_enterprise_operating_and_accounting_facts',
      inputFactIds: [fact.id],
      fieldFactIds: Object.fromEntries(
        INSTITUTION_LINEAGED_FIELDS.map((field) => [
          field,
          [fact.id],
        ]),
      ),
      excludesMarketPriceInputs: true,
    },
    evidenceSources: [factSource],
  };
}

/**
 * Returns the frozen strategy policy used by one live NPC account. The
 * independent institutional module remains calculation-only; this bridge
 * grants no matching, cash or securities authority.
 */
export function institutionalPolicyForLiveAgent(
  agentId,
  symbols,
  world = null,
) {
  const modelId = LIVE_INSTITUTION_MODEL[agentId];
  if (!modelId) {
    throw new RangeError(`no institutional model for ${agentId}`);
  }
  const normalizedSymbols = [...symbols].sort();
  const key = normalizedSymbols.join('|');
  let prototype = policyCache.get(key);
  if (!prototype) {
    prototype = createInstitutionalEcology({
      seed: 'LZY-INSTITUTIONAL-POLICY-CATALOG',
      symbols: normalizedSymbols,
      initialPricesTicks: Object.fromEntries(
        normalizedSymbols.map((symbol) => [symbol, 1_000]),
      ),
      regime: 'mean_reverting',
    });
    policyCache.set(key, prototype);
  }
  const policy = cloneJson(
    prototype.participants[modelId].valuationPolicy,
  );
  if (world?.entities?.companies) {
    const factorPpm =
      LIVE_INSTITUTION_MULTIPLE_FACTOR_PPM[
        agentId
      ] ?? PPM;
    policy.multiplesBySymbolMilli =
      Object.fromEntries(
        normalizedSymbols.map((symbol) => {
          const security =
            world.market?.securities?.[symbol];
          const issuer =
            world.entities.companies[
              security?.issuerId
            ];
          const source =
            issuer?.initialValuationPolicy;
          if (!source) {
            return [
              symbol,
              cloneJson(policy.multiplesMilli),
            ];
          }
          const scaled = (value, fallback) =>
            Math.max(
              100,
              Math.round(
                Number(value ?? fallback) *
                  1_000 *
                  factorPpm /
                  PPM,
              ),
            );
          return [
            symbol,
            {
              earnings: scaled(
                source.earningsMultiple,
                10,
              ),
              book: scaled(
                source.bookMultiple,
                1,
              ),
              freeCashFlow: scaled(
                source.freeCashFlowMultiple,
                12,
              ),
              distribution: scaled(
                Math.max(
                  12,
                  Number(
                    source.earningsMultiple ?? 16,
                  ),
                ),
                16,
              ),
            },
          ];
        }),
      );
  }
  return policy;
}

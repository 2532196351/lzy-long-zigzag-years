/**
 * Deterministic issuer valuation bridge.
 *
 * This module never writes a trade price or an order book. It turns accounting
 * facts into an auditable per-share valuation range, then lets heterogeneous
 * actors observe that range with their own method weights, delay and bounded
 * model noise.
 */

export const VALUATION_RULE_VERSION = 'lzy-issuer-valuation-0.3.0';

const BPS_SCALE = 10_000;
const VALUATION_FACT_TYPES = new Set([
  'company_financial_report',
  'company_capital_allocation',
  'company_share_change',
  'company_debt_change',
]);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback = 1) {
  return Math.max(1, finite(value, fallback));
}

function ticks(value) {
  return Math.max(1, Math.round(finite(value) * 100));
}

function nonNegativeTicks(value) {
  return Math.max(0, Math.round(finite(value) * 100));
}

function rounded(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round((finite(value) + Number.EPSILON) * scale) / scale;
}

function hash32(input) {
  let hash = 2166136261;
  for (const character of String(input)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function publicSourceFacts(facts, companyId, worldTick) {
  return (Array.isArray(facts) ? facts : [])
    .filter(
      (fact) =>
        fact?.entityId === companyId &&
        fact?.authority === 'world_fact' &&
        fact?.visibility === 'public' &&
        finite(fact?.confidence, 0) > 0 &&
        VALUATION_FACT_TYPES.has(fact?.type) &&
        Number.isSafeInteger(fact?.tick) &&
        fact.tick <= worldTick,
    )
    .sort(
      (left, right) =>
        left.tick - right.tick ||
        String(left.id).localeCompare(String(right.id)),
    )
    .slice(-32);
}

function latestFinancialReport(facts, companyId, worldTick) {
  const report = publicSourceFacts(facts, companyId, worldTick)
    .filter(
      (fact) =>
        fact.type === 'company_financial_report' &&
        fact.value &&
        typeof fact.value === 'object',
    )
    .at(-1);
  if (!report) {
    throw new Error(
      `No authoritative public financial report for ${companyId} at tick ${worldTick}.`,
    );
  }
  const required = [
    'trailingRevenue',
    'trailingNetIncome',
    'trailingFreeCashFlow',
    'bookEquity',
    'sharesOutstanding',
  ];
  const missing = required.filter(
    (field) => !Number.isFinite(Number(report.value[field])),
  );
  if (missing.length > 0) {
    throw new Error(
      `Incomplete public financial report ${report.id}: ${missing.join(', ')}`,
    );
  }
  return report;
}

function normalizedWeights(policy = {}) {
  const raw = {
    earnings: Math.max(0, finite(policy.earningsWeightBps, 4_500)),
    book: Math.max(0, finite(policy.bookWeightBps, 2_000)),
    freeCashFlow: Math.max(
      0,
      finite(policy.freeCashFlowWeightBps, 3_500),
    ),
  };
  const total = raw.earnings + raw.book + raw.freeCashFlow || 1;
  return Object.fromEntries(
    Object.entries(raw).map(([name, value]) => [
      name,
      value / total,
    ]),
  );
}

function weightedMethodTicks(methods, weights) {
  return Math.max(
    1,
    Math.round(
      methods.earnings.valueTicks * weights.earnings +
        methods.book.valueTicks * weights.book +
        methods.freeCashFlow.valueTicks * weights.freeCashFlow,
    ),
  );
}

/**
 * Derives a price-independent economic range from issuer accounting state.
 * `lastPrice` is used only for observable market ratios such as P/E.
 */
export function deriveIssuerValuation({
  company,
  security,
  facts = [],
  worldTick = 0,
} = {}) {
  if (!company || !security) {
    throw new TypeError('company and security are required');
  }
  const report = latestFinancialReport(
    facts,
    company.id,
    Math.max(0, Math.floor(finite(worldTick))),
  );
  const published = report.value;
  const policy =
    published.valuationPolicy ??
    company.initialValuationPolicy ??
    company.financials?.valuationPolicy ??
    {};
  const sharesOutstanding = positive(published.sharesOutstanding);
  const trailingRevenue = finite(published.trailingRevenue);
  const trailingNetIncome = finite(published.trailingNetIncome);
  const trailingFreeCashFlow = finite(
    published.trailingFreeCashFlow,
  );
  const bookEquity = finite(published.bookEquity);
  const earningsPerShare = trailingNetIncome / sharesOutstanding;
  const bookValuePerShare = bookEquity / sharesOutstanding;
  const freeCashFlowPerShare =
    trailingFreeCashFlow / sharesOutstanding;
  const lastPrice = positive(security.lastPrice) / 1;
  const publishedCash = finite(published.cash);
  const publishedDebt = finite(published.debt);
  const netDebt = Math.max(
    0,
    Number.isFinite(Number(published.netDebt))
      ? finite(published.netDebt)
      : publishedDebt - publishedCash,
  );
  const leverageRatio =
    netDebt / Math.max(1, trailingRevenue, Math.abs(bookEquity));
  const netDebtDiscountBps = clamp(
    Math.round(leverageRatio * 2_500),
    0,
    3_500,
  );

  const revenueGrowthBps = Math.round(
    (
      trailingRevenue /
        Math.max(
          1,
          finite(published.priorTrailingRevenue, trailingRevenue),
        ) -
      1
    ) * BPS_SCALE,
  );
  const earningsGrowthBps = Math.round(
    (
      trailingNetIncome /
        Math.max(
          1,
          Math.abs(
            finite(
              published.priorTrailingNetIncome,
              trailingNetIncome,
            ),
          ),
        ) -
      1
    ) * BPS_SCALE,
  );
  const expectedGrowthBps = clamp(
    Math.round(
      finite(
        published.expectedGrowthBps,
        revenueGrowthBps * 0.55 + earningsGrowthBps * 0.45,
      ),
    ),
    -2_500,
    2_500,
  );
  const riskFreeRateBps = clamp(
    Math.round(finite(published.riskFreeRateBps, 280)),
    0,
    2_000,
  );
  const creditSpreadBps = clamp(
    Math.round(finite(published.creditSpreadBps, 260)),
    0,
    3_000,
  );
  const discountRateBps = riskFreeRateBps + creditSpreadBps;
  const growthAdjustment = (expectedGrowthBps - 300) * 0.00008;
  const discountAdjustment = (discountRateBps - 500) * 0.00006;
  const dynamicMultipleFactor = clamp(
    1 + growthAdjustment - discountAdjustment,
    0.55,
    1.65,
  );
  const earningsMultiple = rounded(
    positive(policy.earningsMultiple, 10) *
      dynamicMultipleFactor,
    4,
  );
  const bookMultiple = rounded(
    positive(policy.bookMultiple, 1.5) *
      clamp(1 + growthAdjustment * 0.55 - discountAdjustment * 0.7, 0.6, 1.5),
    4,
  );
  const freeCashFlowMultiple = rounded(
    positive(policy.freeCashFlowMultiple, 12) *
      clamp(1 + growthAdjustment * 0.8 - discountAdjustment * 1.1, 0.5, 1.7),
    4,
  );

  const methods = {
    earnings: {
      multiple: earningsMultiple,
      valueTicks: nonNegativeTicks(
        Math.max(0, earningsPerShare) * earningsMultiple,
      ),
    },
    book: {
      multiple: bookMultiple,
      valueTicks: nonNegativeTicks(
        Math.max(0, bookValuePerShare) * bookMultiple,
      ),
    },
    freeCashFlow: {
      multiple: freeCashFlowMultiple,
      valueTicks: nonNegativeTicks(
        Math.max(0, freeCashFlowPerShare) *
          freeCashFlowMultiple,
      ),
    },
  };
  const weights = normalizedWeights(policy);
  const undiscountedTicks = weightedMethodTicks(methods, weights);
  const midpointTicks = Math.max(
    1,
    Math.round(
      undiscountedTicks *
        (BPS_SCALE - netDebtDiscountBps) /
        BPS_SCALE,
    ),
  );
  const disclosureQualityBps = clamp(
    Math.round(
      finite(
        published.disclosureQualityBps,
        finite(company.governance?.disclosureQuality, 0.5) *
          BPS_SCALE,
      ),
    ),
    0,
    BPS_SCALE,
  );
  const disclosurePenaltyBps = Math.round(
    (BPS_SCALE - disclosureQualityBps) * 0.09,
  );
  const uncertaintyBps = clamp(
    Math.round(
      finite(policy.baseUncertaintyBps, 1_500) +
        leverageRatio * 1_800 +
        disclosurePenaltyBps +
        creditSpreadBps * 0.18,
    ),
    500,
    4_500,
  );
  const lowTicks = Math.max(
    1,
    Math.round(midpointTicks * (BPS_SCALE - uncertaintyBps) / BPS_SCALE),
  );
  const highTicks = Math.max(
    lowTicks,
    Math.round(midpointTicks * (BPS_SCALE + uncertaintyBps) / BPS_SCALE),
  );
  const asOfTick = report.tick;

  return {
    ruleVersion: VALUATION_RULE_VERSION,
    symbol: security.symbol,
    issuerId: company.id,
    asOfTick,
    publishedAtMs: Number.isSafeInteger(report.publishedAtMs)
      ? report.publishedAtMs
      : asOfTick * 86_400_000,
    sourceFinancialFactId: report.id,
    sharesOutstanding,
    metrics: {
      trailingRevenue: rounded(trailingRevenue, 2),
      trailingNetIncome: rounded(trailingNetIncome, 2),
      trailingFreeCashFlow: rounded(trailingFreeCashFlow, 2),
      bookEquity: rounded(bookEquity, 2),
      cash: rounded(publishedCash, 2),
      debt: rounded(publishedDebt, 2),
      netDebt: rounded(netDebt, 2),
      earningsPerShare: rounded(earningsPerShare),
      bookValuePerShare: rounded(bookValuePerShare),
      freeCashFlowPerShare: rounded(freeCashFlowPerShare),
      revenueGrowthBps,
      earningsGrowthBps,
      expectedGrowthBps,
      riskFreeRateBps,
      creditSpreadBps,
      discountRateBps,
      developmentIndex: rounded(
        finite(published.developmentIndex, 1),
      ),
      potentialDemandIndex: rounded(
        finite(published.potentialDemandIndex, 1),
      ),
      productivity: rounded(finite(published.productivity, 1)),
      capacity: rounded(finite(published.capacity, company.capacity)),
      marketShare: rounded(finite(published.marketShare, 1 / 3)),
    },
    marketRatios: {
      priceEarnings:
        earningsPerShare > 0
          ? rounded(lastPrice / earningsPerShare, 2)
          : null,
      priceBook:
        bookValuePerShare > 0
          ? rounded(lastPrice / bookValuePerShare, 2)
          : null,
      priceFreeCashFlow:
        freeCashFlowPerShare > 0
          ? rounded(lastPrice / freeCashFlowPerShare, 2)
          : null,
    },
    methods,
    dynamicMultipleFactorBps: Math.round(
      dynamicMultipleFactor * BPS_SCALE,
    ),
    methodWeightsBps: {
      earnings: Math.round(weights.earnings * BPS_SCALE),
      book: Math.round(weights.book * BPS_SCALE),
      freeCashFlow: Math.round(weights.freeCashFlow * BPS_SCALE),
    },
    netDebtDiscountBps,
    uncertaintyBps,
    confidenceBps: BPS_SCALE - uncertaintyBps,
    lowTicks,
    midpointTicks,
    highTicks,
    sourceFactIds: [report.id],
  };
}

/** Builds the versioned valuation view for every listed issuer in a world. */
export function createValuationSnapshot(
  world,
  { asOfTick = world?.world?.tick } = {},
) {
  if (!world?.market?.securities || !world?.entities?.companies) {
    throw new TypeError('a world with securities and companies is required');
  }
  const worldTick = clamp(
    Math.floor(finite(asOfTick)),
    0,
    Math.max(0, Math.floor(finite(world.world?.tick))),
  );
  const symbols = Object.fromEntries(
    Object.entries(world.market.securities).map(([symbol, security]) => {
      const company = world.entities.companies[security.issuerId];
      if (!company) {
        throw new Error(`missing issuer ${security.issuerId} for ${symbol}`);
      }
      return [
        symbol,
        deriveIssuerValuation({
          company,
          security,
          facts: world.facts,
          worldTick,
        }),
      ];
    }),
  );
  return {
    ruleVersion: VALUATION_RULE_VERSION,
    asOfTick: worldTick,
    symbols,
  };
}

/**
 * Produces one actor's delayed, bounded and reproducible valuation observation.
 */
export function createActorValuationObservation(
  valuation,
  {
    actorId,
    seed,
    observedTick,
    informationDelayTicks = 0,
    noiseBps = 0,
    methodWeightsBps = valuation?.methodWeightsBps,
  } = {},
) {
  if (!valuation?.methods || !actorId) {
    throw new TypeError('valuation and actorId are required');
  }
  const delay = Math.max(0, Math.floor(finite(informationDelayTicks)));
  const sourceAsOfTick = Math.max(0, Math.floor(finite(valuation.asOfTick)));
  const availableAtTick = sourceAsOfTick + delay;
  const observationTick = Math.max(
    0,
    Math.floor(finite(observedTick, availableAtTick)),
  );
  const weights = normalizedWeights({
    earningsWeightBps: methodWeightsBps?.earnings,
    bookWeightBps: methodWeightsBps?.book,
    freeCashFlowWeightBps: methodWeightsBps?.freeCashFlow,
  });
  const methodMidpointTicks = weightedMethodTicks(
    valuation.methods,
    weights,
  );
  const boundedNoiseBps = clamp(
    Math.round(Math.abs(finite(noiseBps))),
    0,
    3_000,
  );
  const deterministicNoiseBps =
    boundedNoiseBps === 0
      ? 0
      : Math.round(
          (
            hash32(
              `${seed}:${actorId}:${valuation.symbol}:${sourceAsOfTick}`,
            ) /
              4294967295 *
              2 -
            1
          ) * boundedNoiseBps,
        );
  const discountedTicks = Math.max(
    1,
    Math.round(
      methodMidpointTicks *
        (BPS_SCALE - finite(valuation.netDebtDiscountBps)) /
        BPS_SCALE,
    ),
  );
  const observedMidpointTicks =
    observationTick < availableAtTick
      ? null
      : Math.max(
          1,
          Math.round(
            discountedTicks *
              (BPS_SCALE + deterministicNoiseBps) /
              BPS_SCALE,
          ),
        );
  const uncertaintyBps = clamp(
    Math.round(
      finite(valuation.uncertaintyBps, 1_500) +
        boundedNoiseBps / 2,
    ),
    500,
    5_000,
  );

  return {
    ruleVersion: VALUATION_RULE_VERSION,
    actorId,
    symbol: valuation.symbol,
    sourceAsOfTick,
    availableAtTick,
    observedTick: observationTick,
    status:
      observedMidpointTicks === null ? 'not_yet_available' : 'available',
    observedMidpointTicks,
    observedLowTicks:
      observedMidpointTicks === null
        ? null
        : Math.max(
            1,
            Math.round(
              observedMidpointTicks *
                (BPS_SCALE - uncertaintyBps) /
                BPS_SCALE,
            ),
          ),
    observedHighTicks:
      observedMidpointTicks === null
        ? null
        : Math.round(
            observedMidpointTicks *
              (BPS_SCALE + uncertaintyBps) /
              BPS_SCALE,
          ),
    uncertaintyBps,
    noiseBps: deterministicNoiseBps,
    methodWeightsBps: {
      earnings: Math.round(weights.earnings * BPS_SCALE),
      book: Math.round(weights.book * BPS_SCALE),
      freeCashFlow: Math.round(weights.freeCashFlow * BPS_SCALE),
    },
    sourceFactIds: [...(valuation.sourceFactIds ?? [])],
  };
}

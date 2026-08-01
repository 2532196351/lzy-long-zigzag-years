export const DAYS_PER_YEAR = 365;
export const OPTION_NUMERIC_RULE_VERSION =
  'lzy-option-numerics-v1';
export const OPTION_CARRY_CONVENTION_VERSION =
  'lzy-option-carry-v1';

const DAY_MS = 24 * 60 * 60 * 1_000;
const PPM = 1_000_000;
const MAX_VOLATILITY_PPM = 5_000_000;
const SQRT_TWO_PI = Math.sqrt(2 * Math.PI);

function finite(value, label) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }
  return Number(value);
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `${label} must be a non-negative safe integer`,
    );
  }
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(
      `${label} must be a positive safe integer`,
    );
  }
  return value;
}

function validateKind(kind) {
  if (kind !== 'call' && kind !== 'put') {
    throw new RangeError('kind must be call or put');
  }
  return kind;
}

function years(timeToExpiryMs) {
  nonNegativeInteger(timeToExpiryMs, 'timeToExpiryMs');
  return timeToExpiryMs / (DAYS_PER_YEAR * DAY_MS);
}

function rateFromBps(value, label) {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an integer`);
  }
  return value / 10_000;
}

function optionalIntegerBps(value, label) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an integer`);
  }
  return value;
}

export function resolveOptionCarryInputs({
  contract,
  underlying,
} = {}) {
  if (!contract || contract.type !== 'option') {
    throw new TypeError('contract must be an option contract');
  }
  if (
    !underlying ||
    underlying.id !== contract.underlyingId
  ) {
    throw new RangeError(
      'underlying must match the option contract',
    );
  }
  const worldRiskFreeRateBps = optionalIntegerBps(
    underlying.riskFreeRateBps,
    'underlying.riskFreeRateBps',
  );
  const contractRiskFreeRateBps = optionalIntegerBps(
    contract.riskFreeRateBps,
    'contract.riskFreeRateBps',
  );
  const riskFreeRateBps =
    worldRiskFreeRateBps ?? contractRiskFreeRateBps;
  if (riskFreeRateBps === null) {
    throw new RangeError(
      'option funding requires a risk-free rate',
    );
  }
  const dividendYieldBps =
    optionalIntegerBps(
      contract.dividendYieldBps ?? 0,
      'contract.dividendYieldBps',
    ) ?? 0;
  const contractHoldingCostBps =
    optionalIntegerBps(
      contract.holdingCostBps ?? 0,
      'contract.holdingCostBps',
    ) ?? 0;
  const worldCarryRateBps = optionalIntegerBps(
    underlying.carryRateBps,
    'underlying.carryRateBps',
  );
  const contractCarryRateBps = optionalIntegerBps(
    contract.carryRateBps,
    'contract.carryRateBps',
  );
  const carryRateBps =
    worldCarryRateBps ??
    contractCarryRateBps ??
    (
      riskFreeRateBps -
      dividendYieldBps +
      contractHoldingCostBps
    );
  const holdingCostBps =
    carryRateBps -
    riskFreeRateBps +
    dividendYieldBps;
  if (!Number.isSafeInteger(holdingCostBps)) {
    throw new RangeError(
      'resolved option holding cost must be an integer',
    );
  }
  return {
    conventionVersion: OPTION_CARRY_CONVENTION_VERSION,
    riskFreeRateBps,
    dividendYieldBps,
    holdingCostBps,
    carryRateBps,
    riskFreeRateSource:
      worldRiskFreeRateBps !== null
        ? 'world_underlying_funding'
        : 'contract_offline_funding_assumption',
    carryRateSource:
      worldCarryRateBps !== null
        ? 'world_underlying_carry'
        : contractCarryRateBps !== null
          ? 'contract_carry'
          : 'contract_components',
  };
}

function normalPdf(value) {
  return Math.exp(-0.5 * value * value) / SQRT_TWO_PI;
}

// Abramowitz-Stegun 7.1.26. Rounding every public result to integer ticks
// makes the approximation stable well outside its sub-tick error here.
function normalCdf(value) {
  const absolute = Math.abs(value);
  const t = 1 / (1 + 0.2316419 * absolute);
  const polynomial =
    t *
    (
      0.319381530 +
      t *
        (
          -0.356563782 +
          t *
            (
              1.781477937 +
              t * (-1.821255978 + t * 1.330274429)
            )
        )
    );
  const upper = 1 - normalPdf(absolute) * polynomial;
  return value >= 0 ? upper : 1 - upper;
}

function discountedLegs({
  spotTicks,
  strikeTicks,
  timeToExpiryMs,
  riskFreeRateBps = 0,
  dividendYieldBps = 0,
  holdingCostBps = 0,
}) {
  positiveInteger(spotTicks, 'spotTicks');
  positiveInteger(strikeTicks, 'strikeTicks');
  const timeYears = years(timeToExpiryMs);
  const riskFreeRate = rateFromBps(
    riskFreeRateBps,
    'riskFreeRateBps',
  );
  const dividendYield = rateFromBps(
    dividendYieldBps,
    'dividendYieldBps',
  ) -
    rateFromBps(
      holdingCostBps,
      'holdingCostBps',
    );
  const spotPresent =
    spotTicks * Math.exp(-dividendYield * timeYears);
  const strikePresent =
    strikeTicks * Math.exp(-riskFreeRate * timeYears);
  return {
    timeYears,
    riskFreeRate,
    dividendYield,
    spotPresent,
    strikePresent,
  };
}

export function noArbitrageBounds(input) {
  const kind = validateKind(input.kind);
  const {
    spotPresent,
    strikePresent,
  } = discountedLegs(input);
  const rawLower =
    kind === 'call'
      ? Math.max(0, spotPresent - strikePresent)
      : Math.max(0, strikePresent - spotPresent);
  const rawUpper =
    kind === 'call' ? spotPresent : strikePresent;
  return {
    lowerTicks: Math.max(0, Math.ceil(rawLower - 1e-9)),
    upperTicks: Math.max(0, Math.floor(rawUpper + 1e-9)),
  };
}

function expiryResult(kind, spotTicks, strikeTicks) {
  const intrinsicTicks =
    kind === 'call'
      ? Math.max(0, spotTicks - strikeTicks)
      : Math.max(0, strikeTicks - spotTicks);
  let deltaPpm = 0;
  if (kind === 'call') {
    if (spotTicks > strikeTicks) deltaPpm = PPM;
    else if (spotTicks === strikeTicks) deltaPpm = PPM / 2;
  } else if (spotTicks < strikeTicks) {
    deltaPpm = -PPM;
  } else if (spotTicks === strikeTicks) {
    deltaPpm = -PPM / 2;
  }
  return {
    priceTicks: intrinsicTicks,
    intrinsicTicks,
    timeValueTicks: 0,
    deltaPpm,
    gammaPpmPerTick: 0,
    vegaTicksPerVolPoint: 0,
    thetaTicksPerDay: 0,
    rhoTicksPerRatePoint: 0,
    status: 'AT_EXPIRY',
  };
}

export function priceEuropeanOption(input) {
  const kind = validateKind(input.kind);
  const spotTicks = positiveInteger(
    input.spotTicks,
    'spotTicks',
  );
  const strikeTicks = positiveInteger(
    input.strikeTicks,
    'strikeTicks',
  );
  const timeToExpiryMs = nonNegativeInteger(
    input.timeToExpiryMs,
    'timeToExpiryMs',
  );
  const volatilityPpm = nonNegativeInteger(
    input.volatilityPpm,
    'volatilityPpm',
  );
  if (timeToExpiryMs === 0) {
    return expiryResult(kind, spotTicks, strikeTicks);
  }
  const {
    timeYears,
    riskFreeRate,
    dividendYield,
    spotPresent,
    strikePresent,
  } = discountedLegs(input);
  const bounds = noArbitrageBounds(input);
  const intrinsicTicks =
    kind === 'call'
      ? Math.max(0, spotTicks - strikeTicks)
      : Math.max(0, strikeTicks - spotTicks);

  if (volatilityPpm === 0) {
    const forwardIntrinsic =
      kind === 'call'
        ? Math.max(0, spotPresent - strikePresent)
        : Math.max(0, strikePresent - spotPresent);
    const priceTicks = Math.min(
      bounds.upperTicks,
      Math.max(bounds.lowerTicks, Math.round(forwardIntrinsic)),
    );
    const inMoney =
      kind === 'call'
        ? spotPresent > strikePresent
        : strikePresent > spotPresent;
    const discountedDelta = Math.exp(
      -dividendYield * timeYears,
    );
    return {
      priceTicks,
      intrinsicTicks,
      timeValueTicks: Math.max(
        0,
        priceTicks - intrinsicTicks,
      ),
      deltaPpm: inMoney
        ? Math.round(
            discountedDelta *
              PPM *
              (kind === 'call' ? 1 : -1),
          )
        : 0,
      gammaPpmPerTick: 0,
      vegaTicksPerVolPoint: 0,
      thetaTicksPerDay: 0,
      rhoTicksPerRatePoint: 0,
      status: 'ZERO_VOLATILITY',
    };
  }

  const volatility = volatilityPpm / PPM;
  const sqrtTime = Math.sqrt(timeYears);
  const d1 =
    (
      Math.log(spotTicks / strikeTicks) +
      (
        riskFreeRate -
        dividendYield +
        0.5 * volatility * volatility
      ) *
        timeYears
    ) /
    (volatility * sqrtTime);
  const d2 = d1 - volatility * sqrtTime;
  const discountSpot = Math.exp(
    -dividendYield * timeYears,
  );
  const discountStrike = Math.exp(
    -riskFreeRate * timeYears,
  );
  const pdf = normalPdf(d1);

  let rawPrice;
  let delta;
  let thetaPerYear;
  let rhoPerRateOne;
  if (kind === 'call') {
    rawPrice =
      spotTicks * discountSpot * normalCdf(d1) -
      strikeTicks * discountStrike * normalCdf(d2);
    delta = discountSpot * normalCdf(d1);
    thetaPerYear =
      -(
        spotTicks *
        discountSpot *
        pdf *
        volatility
      ) /
        (2 * sqrtTime) -
      riskFreeRate *
        strikeTicks *
        discountStrike *
        normalCdf(d2) +
      dividendYield *
        spotTicks *
        discountSpot *
        normalCdf(d1);
    rhoPerRateOne =
      strikeTicks *
      timeYears *
      discountStrike *
      normalCdf(d2);
  } else {
    rawPrice =
      strikeTicks * discountStrike * normalCdf(-d2) -
      spotTicks * discountSpot * normalCdf(-d1);
    delta = discountSpot * (normalCdf(d1) - 1);
    thetaPerYear =
      -(
        spotTicks *
        discountSpot *
        pdf *
        volatility
      ) /
        (2 * sqrtTime) +
      riskFreeRate *
        strikeTicks *
        discountStrike *
        normalCdf(-d2) -
      dividendYield *
        spotTicks *
        discountSpot *
        normalCdf(-d1);
    rhoPerRateOne =
      -strikeTicks *
      timeYears *
      discountStrike *
      normalCdf(-d2);
  }

  const priceTicks = Math.min(
    bounds.upperTicks,
    Math.max(bounds.lowerTicks, Math.round(rawPrice)),
  );
  const gamma =
    (discountSpot * pdf) /
    (spotTicks * volatility * sqrtTime);
  const vegaPerVolatilityOne =
    spotTicks * discountSpot * pdf * sqrtTime;
  return {
    priceTicks,
    intrinsicTicks,
    timeValueTicks: Math.max(
      0,
      priceTicks - intrinsicTicks,
    ),
    deltaPpm: Math.round(delta * PPM),
    gammaPpmPerTick: Math.max(0, Math.round(gamma * PPM)),
    vegaTicksPerVolPoint: Math.max(
      0,
      Math.round(vegaPerVolatilityOne * 0.01),
    ),
    thetaTicksPerDay: Math.round(
      thetaPerYear / DAYS_PER_YEAR,
    ),
    rhoTicksPerRatePoint: Math.round(
      rhoPerRateOne * 0.01,
    ),
    status: 'VALUED',
  };
}

export function putCallParityGapTicks({
  callPriceTicks,
  putPriceTicks,
  ...input
}) {
  nonNegativeInteger(callPriceTicks, 'callPriceTicks');
  nonNegativeInteger(putPriceTicks, 'putPriceTicks');
  const {
    spotPresent,
    strikePresent,
  } = discountedLegs(input);
  return Math.round(
    callPriceTicks -
      putPriceTicks -
      (spotPresent - strikePresent),
  );
}

export function impliedVolatility(input) {
  const marketPriceTicks = nonNegativeInteger(
    input.marketPriceTicks,
    'marketPriceTicks',
  );
  const bounds = noArbitrageBounds(input);
  if (
    marketPriceTicks < bounds.lowerTicks ||
    marketPriceTicks > bounds.upperTicks
  ) {
    return {
      status: 'OUTSIDE_NO_ARBITRAGE',
      volatilityPpm: null,
      iterations: 0,
      lowerTicks: bounds.lowerTicks,
      upperTicks: bounds.upperTicks,
    };
  }
  if (input.timeToExpiryMs === 0) {
    return {
      status: 'AT_EXPIRY',
      volatilityPpm: null,
      iterations: 0,
      lowerTicks: bounds.lowerTicks,
      upperTicks: bounds.upperTicks,
    };
  }

  let low = 0;
  let high = MAX_VOLATILITY_PPM;
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let iteration = 0; iteration < 48; iteration += 1) {
    const middle = Math.floor((low + high) / 2);
    const priceTicks = priceEuropeanOption({
      ...input,
      volatilityPpm: middle,
    }).priceTicks;
    const distance = Math.abs(priceTicks - marketPriceTicks);
    if (
      distance < bestDistance ||
      (distance === bestDistance &&
        middle < best)
    ) {
      best = middle;
      bestDistance = distance;
    }
    if (priceTicks < marketPriceTicks) {
      low = Math.min(MAX_VOLATILITY_PPM, middle + 1);
    } else {
      high = Math.max(0, middle);
    }
  }
  const plateauProbePpm = 1_000;
  const lowerProbePpm = Math.max(
    0,
    best - plateauProbePpm,
  );
  const upperProbePpm = Math.min(
    MAX_VOLATILITY_PPM,
    best + plateauProbePpm,
  );
  const lowerProbePrice = priceEuropeanOption({
    ...input,
    volatilityPpm: lowerProbePpm,
  }).priceTicks;
  const upperProbePrice = priceEuropeanOption({
    ...input,
    volatilityPpm: upperProbePpm,
  }).priceTicks;
  if (
    lowerProbePpm !== upperProbePpm &&
    lowerProbePrice === marketPriceTicks &&
    upperProbePrice === marketPriceTicks
  ) {
    return {
      status: 'PRICE_PLATEAU',
      volatilityPpm: null,
      iterations: 48,
      lowerTicks: bounds.lowerTicks,
      upperTicks: bounds.upperTicks,
      residualTicks: bestDistance,
      plateauProbePpm,
    };
  }
  return {
    status: 'SOLVED',
    volatilityPpm: best,
    iterations: 48,
    lowerTicks: bounds.lowerTicks,
    upperTicks: bounds.upperTicks,
    residualTicks: bestDistance,
  };
}

export function surfaceVolatilityPpm(policy, input) {
  const spotTicks = positiveInteger(
    input.spotTicks,
    'spotTicks',
  );
  const strikeTicks = positiveInteger(
    input.strikeTicks,
    'strikeTicks',
  );
  const timeYears = years(input.timeToExpiryMs);
  const base = nonNegativeInteger(
    policy.baseVolatilityPpm,
    'baseVolatilityPpm',
  );
  const termSlope = finite(
    policy.termSlopePpmPerYear ?? 0,
    'termSlopePpmPerYear',
  );
  const putSkew = finite(
    policy.putSkewPpm ?? 0,
    'putSkewPpm',
  );
  const smile = finite(policy.smilePpm ?? 0, 'smilePpm');
  const logMoneyness = Math.log(strikeTicks / spotTicks);
  const downsideMoneyness = Math.max(
    0,
    (spotTicks - strikeTicks) / spotTicks,
  );
  const raw =
    base +
    termSlope * timeYears +
    putSkew * downsideMoneyness +
    smile * Math.abs(logMoneyness);
  const minimum = nonNegativeInteger(
    policy.minimumVolatilityPpm ?? 1,
    'minimumVolatilityPpm',
  );
  const maximum = nonNegativeInteger(
    policy.maximumVolatilityPpm ??
      MAX_VOLATILITY_PPM,
    'maximumVolatilityPpm',
  );
  if (maximum < minimum) {
    throw new RangeError(
      'maximumVolatilityPpm cannot be below minimumVolatilityPpm',
    );
  }
  return Math.min(maximum, Math.max(minimum, Math.round(raw)));
}

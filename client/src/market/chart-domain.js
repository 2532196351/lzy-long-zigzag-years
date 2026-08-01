export const INTRADAY_WINDOW_MS = 6 * 60 * 60_000;
export const INTRADAY_DAY_START_MS = 9 * 60 * 60_000;
export const MARKET_CLOCK_ORIGIN_OFFSET_MS = INTRADAY_DAY_START_MS;
function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function nonNegativeSafeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function finitePrices(values) {
  return Array.isArray(values)
    ? values.map(positiveInteger).filter(Boolean)
    : [];
}

/**
 * Resolves the fixed 24-hour intraday cycle whose trading day begins at 09:00:
 * 09:00-15:00, 15:00-21:00, 21:00-03:00, and 03:00-09:00.
 */
export function deriveFixedIntradayTimeDomain(
  nowMs,
  { clockOffsetMs = 0 } = {},
) {
  const resolvedNowMs = nonNegativeSafeInteger(nowMs, 'nowMs');
  const resolvedClockOffsetMs = nonNegativeSafeInteger(
    clockOffsetMs,
    'clockOffsetMs',
  );
  const displayedNowMs = resolvedNowMs + resolvedClockOffsetMs;
  if (!Number.isSafeInteger(displayedNowMs)) {
    throw new RangeError('intraday display time exceeds safe integer range');
  }
  const segmentIndex = Math.floor(
    (displayedNowMs - INTRADAY_DAY_START_MS) /
      INTRADAY_WINDOW_MS,
  );
  const displayedStartMs =
    INTRADAY_DAY_START_MS +
    segmentIndex * INTRADAY_WINDOW_MS;
  const startMs = displayedStartMs - resolvedClockOffsetMs;
  const endMs = startMs + INTRADAY_WINDOW_MS;
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs)) {
    throw new RangeError('intraday time domain exceeds safe integer range');
  }
  return { startMs, endMs };
}

/**
 * Keeps a conventional intraday chart centred on yesterday's close.
 * The opening print establishes the first visible radius; later session
 * extremes may expand it, but a retreat cannot shrink it.
 */
export function deriveAdaptiveIntradayPriceDomain({
  previousCloseTicks,
  openingTicks,
  lows = [],
  highs = [],
} = {}) {
  const opening = positiveInteger(openingTicks);
  const baseline =
    positiveInteger(previousCloseTicks) ??
    opening ??
    finitePrices([...lows, ...highs])[0] ??
    1;
  const prices = [
    opening,
    ...finitePrices(lows),
    ...finitePrices(highs),
  ].filter(Boolean);
  const observedRadiusTicks = Math.max(
    1,
    ...prices.map((price) => Math.abs(price - baseline)),
  );
  const radiusTicks = observedRadiusTicks;
  const observedRadiusBps = Math.max(
    0,
    ...prices.map((price) =>
      Math.ceil(Math.abs(price - baseline) * 10_000 / baseline),
    ),
  );
  const radiusBps = Math.ceil(radiusTicks * 10_000 / baseline);
  const minimumTicks = baseline - radiusTicks;
  const maximumTicks = baseline + radiusTicks;
  return {
    minimumTicks,
    maximumTicks,
    baselineTicks: baseline,
    radiusTicks,
    radiusBps,
    observedRadiusBps,
    baselineRatio:
      (baseline - minimumTicks) /
      Math.max(1, maximumTicks - minimumTicks),
    scale: 'symmetric_opening_extreme',
  };
}

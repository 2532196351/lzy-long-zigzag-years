import {
  deriveFixedIntradayTimeDomain,
  INTRADAY_WINDOW_MS,
} from './chart-domain.js?v=20260804-01';

export const NATURAL_DAY_MS = 86_400_000;
export const NATURAL_WEEK_MS = NATURAL_DAY_MS * 7;
export const MOVING_AVERAGE_PERIODS = Object.freeze([5, 10, 20, 60]);

export const CHART_TIMEFRAMES = Object.freeze({
  ultra: Object.freeze({
    kind: 'line',
    intervalMs: null,
    defaultWindowMs: INTRADAY_WINDOW_MS,
    defaultMaxPoints: Number.MAX_SAFE_INTEGER,
  }),
  intraday: Object.freeze({
    kind: 'line',
    intervalMs: 60_000,
    defaultWindowMs: INTRADAY_WINDOW_MS,
    defaultMaxPoints: INTRADAY_WINDOW_MS / 60_000,
  }),
  '1m': Object.freeze({
    kind: 'candles',
    intervalMs: 60_000,
    defaultMaxPoints: 120,
  }),
  '5m': Object.freeze({
    kind: 'candles',
    intervalMs: 5 * 60_000,
    defaultMaxPoints: 96,
  }),
  '15m': Object.freeze({
    kind: 'candles',
    intervalMs: 15 * 60_000,
    defaultMaxPoints: 96,
  }),
  '30m': Object.freeze({
    kind: 'candles',
    intervalMs: 30 * 60_000,
    defaultMaxPoints: 96,
  }),
  '60m': Object.freeze({
    kind: 'candles',
    intervalMs: 60 * 60_000,
    defaultMaxPoints: 96,
  }),
  '1d': Object.freeze({
    kind: 'candles',
    intervalMs: NATURAL_DAY_MS,
    defaultMaxPoints: 90,
  }),
  '1w': Object.freeze({
    kind: 'candles',
    intervalMs: NATURAL_WEEK_MS,
    defaultMaxPoints: 72,
  }),
});

function isSafeInteger(value) {
  return Number.isSafeInteger(value);
}

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function requireSafeInteger(value, name, minimum = null) {
  if (!isSafeInteger(value) || (minimum !== null && value < minimum)) {
    throw new RangeError(`${name} must be a safe integer${minimum === null ? '' : ` at least ${minimum}`}`);
  }
  return value;
}

function addSafe(left, right, name) {
  const total = left + right;
  return requireSafeInteger(total, name);
}

function multiplySafe(left, right, name) {
  const product = left * right;
  return requireSafeInteger(product, name);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function optionalSafeInteger(value, fallback, name, minimum = null) {
  if (value === undefined || value === null) return fallback;
  return requireSafeInteger(value, name, minimum);
}

function resolveBarTime(bar, primary, fallback) {
  return bar[primary] ?? bar[fallback];
}

function normalizeVisibleBar(bar) {
  const value = asObject(bar);
  return copyBar({
    startMs: resolveBarTime(value, 'startMs', 'frameStartMs'),
    endMs: resolveBarTime(value, 'endMs', 'frameEndMs'),
    openTicks: value.openTicks ?? null,
    highTicks: value.highTicks ?? null,
    lowTicks: value.lowTicks ?? null,
    closeTicks: value.closeTicks ?? null,
    volume: value.volume ?? value.volumeShares ?? 0,
    turnoverTicks:
      value.turnoverTicks ?? value.turnoverCents ?? 0,
    tradeCount: value.tradeCount ?? 0,
  });
}

function normalizeVisibleBars(values) {
  const bars = [];
  for (const value of asArray(values)) {
    try {
      bars.push(normalizeVisibleBar(value));
    } catch {
      // A malformed transport projection is not promoted into chart authority.
    }
  }
  return bars.sort(compareBars);
}

function normalizeVisibleBarsInRange(
  values,
  startMs = null,
  endMs = null,
) {
  const bars = [];
  for (const value of asArray(values)) {
    try {
      const bar = normalizeVisibleBar(value);
      if (startMs !== null && bar.endMs <= startMs) continue;
      if (endMs !== null && bar.startMs >= endMs) continue;
      bars.push(bar);
    } catch {
      // A malformed transport projection is not promoted into chart authority.
    }
  }
  return bars.sort(compareBars);
}

function dayStartFor(dayId) {
  requireSafeInteger(dayId, 'dayId');
  return Math.floor(dayId / NATURAL_DAY_MS) * NATURAL_DAY_MS;
}

function compareFills(left, right) {
  return left.timestampMs - right.timestampMs || left.sequence - right.sequence;
}

function compareBars(left, right) {
  return left.startMs - right.startMs || left.endMs - right.endMs ||
    (left.openTicks ?? -1) - (right.openTicks ?? -1) ||
    (left.closeTicks ?? -1) - (right.closeTicks ?? -1);
}

function copyFill(fill) {
  if (!fill || typeof fill !== 'object') throw new TypeError('fill must be an object');
  const copied = {
    timestampMs: requireSafeInteger(fill.timestampMs, 'fill.timestampMs'),
    sequence: requireSafeInteger(fill.sequence, 'fill.sequence', 0),
    priceTicks: requireSafeInteger(fill.priceTicks, 'fill.priceTicks', 1),
    quantity: requireSafeInteger(fill.quantity, 'fill.quantity', 1),
  };
  multiplySafe(copied.priceTicks, copied.quantity, 'fill turnoverTicks');
  return copied;
}

function copyBar(bar) {
  if (!bar || typeof bar !== 'object') throw new TypeError('bar must be an object');
  const copied = {
    startMs: requireSafeInteger(bar.startMs, 'bar.startMs'),
    endMs: requireSafeInteger(bar.endMs, 'bar.endMs'),
    openTicks: bar.openTicks,
    highTicks: bar.highTicks,
    lowTicks: bar.lowTicks,
    closeTicks: bar.closeTicks,
    volume: requireSafeInteger(bar.volume, 'bar.volume', 0),
    turnoverTicks: requireSafeInteger(bar.turnoverTicks, 'bar.turnoverTicks', 0),
    tradeCount: requireSafeInteger(bar.tradeCount, 'bar.tradeCount', 0),
  };
  if (copied.endMs <= copied.startMs) throw new RangeError('bar.endMs must be after bar.startMs');
  const prices = ['openTicks', 'highTicks', 'lowTicks', 'closeTicks'];
  const empty = prices.every((name) => copied[name] === null);
  if (!empty) {
    for (const name of prices) requireSafeInteger(copied[name], `bar.${name}`, 1);
  }
  if (empty && (copied.volume !== 0 || copied.turnoverTicks !== 0 || copied.tradeCount !== 0)) {
    throw new RangeError('empty bars cannot contain activity');
  }
  return copied;
}

function barFromFills(startMs, endMs, fills) {
  const ordered = fills.map(copyFill).sort(compareFills);
  if (ordered.length === 0) {
    return {
      startMs,
      endMs,
      openTicks: null,
      highTicks: null,
      lowTicks: null,
      closeTicks: null,
      volume: 0,
      turnoverTicks: 0,
      tradeCount: 0,
    };
  }
  let volume = 0;
  let turnoverTicks = 0;
  let highTicks = ordered[0].priceTicks;
  let lowTicks = ordered[0].priceTicks;
  for (const trade of ordered) {
    volume = addSafe(volume, trade.quantity, 'bar volume');
    turnoverTicks = addSafe(
      turnoverTicks,
      multiplySafe(trade.priceTicks, trade.quantity, 'fill turnoverTicks'),
      'bar turnoverTicks',
    );
    highTicks = Math.max(highTicks, trade.priceTicks);
    lowTicks = Math.min(lowTicks, trade.priceTicks);
  }
  return {
    startMs,
    endMs,
    openTicks: ordered[0].priceTicks,
    highTicks,
    lowTicks,
    closeTicks: ordered.at(-1).priceTicks,
    volume,
    turnoverTicks,
    tradeCount: ordered.length,
  };
}

function aggregateBucket(startMs, bars) {
  const ordered = bars.map(copyBar).sort(compareBars);
  let volume = 0;
  let turnoverTicks = 0;
  let tradeCount = 0;
  let first = null;
  let last = null;
  let highTicks = null;
  let lowTicks = null;
  for (const bar of ordered) {
    volume = addSafe(volume, bar.volume, 'aggregate volume');
    turnoverTicks = addSafe(turnoverTicks, bar.turnoverTicks, 'aggregate turnoverTicks');
    tradeCount = addSafe(tradeCount, bar.tradeCount, 'aggregate tradeCount');
    if (bar.openTicks === null) continue;
    first ||= bar;
    last = bar;
    highTicks = highTicks === null ? bar.highTicks : Math.max(highTicks, bar.highTicks);
    lowTicks = lowTicks === null ? bar.lowTicks : Math.min(lowTicks, bar.lowTicks);
  }
  return {
    startMs,
    endMs: Math.max(...ordered.map((bar) => bar.endMs)),
    openTicks: first ? first.openTicks : null,
    highTicks,
    lowTicks,
    closeTicks: last ? last.closeTicks : null,
    volume,
    turnoverTicks,
    tradeCount,
  };
}

function columnIndex(timestampMs, width) {
  const x = xForNaturalDay(timestampMs, width);
  return Math.min(width - 1, Math.floor(x));
}

/** Creates a serializable, immutable-input series for one UTC natural day. */
export function createBarSeries(symbol, dayId) {
  if (typeof symbol !== 'string' || symbol.length === 0) {
    throw new TypeError('symbol must be a non-empty string');
  }
  const dayStartMs = dayStartFor(dayId);
  return {
    symbol,
    dayId,
    dayStartMs,
    dayEndMs: addSafe(dayStartMs, NATURAL_DAY_MS, 'dayEndMs'),
    closedUntilMs: dayStartMs,
    fills: [],
    bars: [],
  };
}

/** Returns a new series with one validated fill; closed frames remain immutable. */
export function recordFill(series, fill) {
  if (!series || typeof series !== 'object') throw new TypeError('series must be an object');
  const trade = copyFill(fill);
  const firstFrameDayStartFill =
    series.bars.length === 0 &&
    series.closedUntilMs === series.dayStartMs &&
    trade.timestampMs === series.dayStartMs;
  if (
    (!firstFrameDayStartFill &&
      trade.timestampMs <= series.closedUntilMs) ||
    trade.timestampMs > series.dayEndMs
  ) {
    throw new RangeError('fill timestamp must be in the unclosed portion of the series day');
  }
  return {
    ...series,
    fills: [...series.fills.map(copyFill), trade].sort(compareFills),
    bars: series.bars.map(copyBar),
  };
}

/**
 * Appends one already time-ordered authoritative fill without copying the
 * complete day. Transport and test callers can keep using immutable
 * `recordFill`; the simulator owns this mutable series exclusively.
 */
export function appendFillInPlace(series, fill) {
  if (!series || typeof series !== 'object') {
    throw new TypeError('series must be an object');
  }
  if (!Array.isArray(series.fills) || !Array.isArray(series.bars)) {
    throw new TypeError('series must contain fills and bars');
  }
  const trade = copyFill(fill);
  const firstFrameDayStartFill =
    series.bars.length === 0 &&
    series.closedUntilMs === series.dayStartMs &&
    trade.timestampMs === series.dayStartMs;
  if (
    (!firstFrameDayStartFill &&
      trade.timestampMs <= series.closedUntilMs) ||
    trade.timestampMs > series.dayEndMs
  ) {
    throw new RangeError(
      'fill timestamp must be in the unclosed portion of the series day',
    );
  }
  const previous = series.fills.at(-1);
  if (previous && compareFills(previous, trade) > 0) {
    throw new RangeError(
      'authoritative fills must be appended in deterministic order',
    );
  }
  series.fills.push(trade);
  return series;
}

function firstFillIndex(fills, timestampMs, inclusive) {
  let low = 0;
  let high = fills.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const value = fills[middle].timestampMs;
    if (value > timestampMs || (inclusive && value === timestampMs)) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
}

function barFromOrderedRange(fills, startIndex, endIndex, startMs, endMs) {
  if (startIndex >= endIndex) {
    return {
      startMs,
      endMs,
      openTicks: null,
      highTicks: null,
      lowTicks: null,
      closeTicks: null,
      volume: 0,
      turnoverTicks: 0,
      tradeCount: 0,
    };
  }
  const first = fills[startIndex];
  let volume = 0;
  let turnoverTicks = 0;
  let highTicks = first.priceTicks;
  let lowTicks = first.priceTicks;
  for (let index = startIndex; index < endIndex; index += 1) {
    const trade = fills[index];
    volume = addSafe(volume, trade.quantity, 'bar volume');
    turnoverTicks = addSafe(
      turnoverTicks,
      multiplySafe(
        trade.priceTicks,
        trade.quantity,
        'fill turnoverTicks',
      ),
      'bar turnoverTicks',
    );
    highTicks = Math.max(highTicks, trade.priceTicks);
    lowTicks = Math.min(lowTicks, trade.priceTicks);
  }
  return {
    startMs,
    endMs,
    openTicks: first.priceTicks,
    highTicks,
    lowTicks,
    closeTicks: fills[endIndex - 1].priceTicks,
    volume,
    turnoverTicks,
    tradeCount: endIndex - startIndex,
  };
}

/**
 * Closes one frame in place by binary-searching the ordered fill log. This is
 * byte-equivalent to `closeFrame` but O(log n + fills in this frame), instead
 * of copying and rescanning the complete current day.
 */
export function closeFrameInPlace(series, frameEndMs) {
  if (!series || typeof series !== 'object') {
    throw new TypeError('series must be an object');
  }
  requireSafeInteger(frameEndMs, 'frameEndMs');
  if (frameEndMs <= series.closedUntilMs || frameEndMs > series.dayEndMs) {
    throw new RangeError(
      'frameEndMs must advance within the series day',
    );
  }
  const firstFrame =
    series.bars.length === 0 &&
    series.closedUntilMs === series.dayStartMs;
  const startIndex = firstFillIndex(
    series.fills,
    series.closedUntilMs,
    firstFrame,
  );
  const endIndex = firstFillIndex(series.fills, frameEndMs, false);
  const bar = barFromOrderedRange(
    series.fills,
    startIndex,
    endIndex,
    series.closedUntilMs,
    frameEndMs,
  );
  series.closedUntilMs = frameEndMs;
  series.bars.push(bar);
  return series;
}

/** Closes the next non-overlapping frame and derives its OHLCV from authoritative fills. */
export function closeFrame(series, frameEndMs) {
  if (!series || typeof series !== 'object') throw new TypeError('series must be an object');
  requireSafeInteger(frameEndMs, 'frameEndMs');
  if (frameEndMs <= series.closedUntilMs || frameEndMs > series.dayEndMs) {
    throw new RangeError('frameEndMs must advance within the series day');
  }
  const fills = series.fills.map(copyFill);
  const bar = barFromFills(
    series.closedUntilMs,
    frameEndMs,
    fills.filter((trade) =>
      (
        series.bars.length === 0 &&
        series.closedUntilMs === series.dayStartMs
          ? trade.timestampMs >= series.closedUntilMs
          : trade.timestampMs > series.closedUntilMs
      ) &&
      trade.timestampMs <= frameEndMs
    ),
  );
  return {
    ...series,
    closedUntilMs: frameEndMs,
    fills,
    bars: [...series.bars.map(copyBar), bar],
  };
}

/** Aggregates non-overlapping source bars into fixed epoch-aligned buckets. */
export function aggregateBars(bars, intervalMs) {
  if (!Array.isArray(bars)) throw new TypeError('bars must be an array');
  requireSafeInteger(intervalMs, 'intervalMs', 1);
  const buckets = new Map();
  for (const source of bars.map(copyBar).sort(compareBars)) {
    const startMs = Math.floor(source.startMs / intervalMs) * intervalMs;
    const bucket = buckets.get(startMs) || [];
    bucket.push(source);
    buckets.set(startMs, bucket);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([startMs, bucket]) => aggregateBucket(startMs, bucket));
}

function timeframeSpec(timeframe) {
  const spec = CHART_TIMEFRAMES[timeframe];
  if (!spec) {
    throw new RangeError(`unsupported chart timeframe: ${timeframe}`);
  }
  return spec;
}

function worldWeekStartMs(timestampMs) {
  return Math.floor(timestampMs / NATURAL_WEEK_MS) *
    NATURAL_WEEK_MS;
}

function bucketStartForTimeframe(timestampMs, timeframe) {
  requireSafeInteger(timestampMs, 'timestampMs');
  const spec = timeframeSpec(timeframe);
  if (timeframe === '1w') return worldWeekStartMs(timestampMs);
  if (timeframe === '1d') return dayStartFor(timestampMs);
  return Math.floor(timestampMs / spec.intervalMs) * spec.intervalMs;
}

/**
 * Derives a supported K-line timeframe from lower-granularity authoritative
 * bars. Minute, day and week series are views; callers do not need to persist
 * a separate copy for each timeframe.
 */
export function aggregateBarsForTimeframe(bars, timeframe) {
  if (!Array.isArray(bars)) throw new TypeError('bars must be an array');
  const spec = timeframeSpec(timeframe);
  if (spec.kind !== 'candles') {
    throw new RangeError(`${timeframe} is not a K-line timeframe`);
  }
  const buckets = new Map();
  for (const source of bars.map(copyBar).sort(compareBars)) {
    const startMs = bucketStartForTimeframe(source.startMs, timeframe);
    const bucket = buckets.get(startMs) ?? [];
    bucket.push(source);
    buckets.set(startMs, bucket);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([startMs, bucket]) => aggregateBucket(startMs, bucket));
}

function tradeTimestamp(trade) {
  return trade.virtualMs ?? trade.timestampMs ?? trade.timeMs;
}

function tradePrice(trade) {
  return trade.priceTicks ?? trade.limitPriceTicks;
}

function normalizeChartTrade(trade, inputIndex) {
  if (!trade || typeof trade !== 'object') {
    throw new TypeError('trade must be an object');
  }
  const timestampMs = requireSafeInteger(
    tradeTimestamp(trade),
    'trade timestamp',
  );
  const priceTicks = requireSafeInteger(
    tradePrice(trade),
    'trade.priceTicks',
    1,
  );
  const quantity = requireSafeInteger(
    trade.quantity ?? trade.volume,
    'trade.quantity',
    1,
  );
  const turnoverTicks =
    trade.turnoverTicks === undefined ||
    trade.turnoverTicks === null
      ? multiplySafe(priceTicks, quantity, 'trade turnoverTicks')
      : requireSafeInteger(
          trade.turnoverTicks,
          'trade.turnoverTicks',
          0,
        );
  return {
    id: String(trade.id ?? `trade-${inputIndex}`),
    symbol:
      typeof trade.symbol === 'string' ? trade.symbol : null,
    timestampMs,
    sequence: optionalSafeInteger(
      trade.sequence,
      null,
      'trade.sequence',
      0,
    ),
    priceTicks,
    quantity,
    turnoverTicks,
    inputIndex,
  };
}

function compareChartTrades(left, right) {
  return (
    left.timestampMs - right.timestampMs ||
    (left.sequence ?? Number.MAX_SAFE_INTEGER) -
      (right.sequence ?? Number.MAX_SAFE_INTEGER) ||
    left.id.localeCompare(right.id) ||
    left.inputIndex - right.inputIndex
  );
}

function normalizedChartTrades(trades, { symbol = null } = {}) {
  if (!Array.isArray(trades)) {
    throw new TypeError('trades must be an array');
  }
  const result = [];
  for (const [index, trade] of trades.entries()) {
    try {
      const normalized = normalizeChartTrade(trade, index);
      if (symbol && normalized.symbol !== symbol) continue;
      result.push(normalized);
    } catch {
      // Invalid transport records never become chart authority.
    }
  }
  return result.sort(compareChartTrades);
}

function boundedMaxPoints(value, fallback) {
  return optionalSafeInteger(value, fallback, 'maxPoints', 1);
}

function windowedTrades(trades, nowMs, windowMs) {
  if (trades.length === 0) return [];
  const resolvedNowMs = optionalSafeInteger(
    nowMs,
    trades.at(-1).timestampMs,
    'nowMs',
  );
  const resolvedWindowMs = optionalSafeInteger(
    windowMs,
    null,
    'windowMs',
    1,
  );
  if (resolvedWindowMs === null) return trades;
  const windowStartMs = resolvedNowMs - resolvedWindowMs;
  return trades.filter(
    (trade) =>
      trade.timestampMs > windowStartMs &&
      trade.timestampMs <= resolvedNowMs,
  );
}

/**
 * Produces a high-resolution intraday line from authoritative trades. Runs at
 * an unchanged price are compressed into one plateau point, while every real
 * price transition remains present and ordered.
 */
export function derivePriceChangesFromTrades(
  trades,
  {
    symbol = null,
    nowMs = null,
    windowMs = CHART_TIMEFRAMES.ultra.defaultWindowMs,
    maxPoints = CHART_TIMEFRAMES.ultra.defaultMaxPoints,
    domainStartExclusiveMs = null,
    domainEndInclusiveMs = null,
  } = {},
) {
  const startMs = optionalSafeInteger(
    domainStartExclusiveMs,
    null,
    'domainStartExclusiveMs',
  );
  const endMs = optionalSafeInteger(
    domainEndInclusiveMs,
    null,
    'domainEndInclusiveMs',
  );
  const ordered = windowedTrades(
    normalizedChartTrades(trades, { symbol }),
    nowMs,
    windowMs,
  ).filter(
    (trade) =>
      (startMs === null || trade.timestampMs > startMs) &&
      (endMs === null || trade.timestampMs <= endMs),
  );
  const points = [];
  for (const trade of ordered) {
    const previous = points.at(-1);
    if (
      previous &&
      previous.priceTicks === trade.priceTicks
    ) {
      previous.volume = addSafe(
        previous.volume,
        trade.quantity,
        'price-change volume',
      );
      previous.turnoverTicks = addSafe(
        previous.turnoverTicks,
        trade.turnoverTicks,
        'price-change turnoverTicks',
      );
      previous.tradeCount = addSafe(
        previous.tradeCount,
        1,
        'price-change tradeCount',
      );
      previous.lastTradeId = trade.id;
      continue;
    }
    points.push({
      timeMs: trade.timestampMs,
      priceTicks: trade.priceTicks,
      volume: trade.quantity,
      turnoverTicks: trade.turnoverTicks,
      tradeCount: 1,
      hasTrade: true,
      firstTradeId: trade.id,
      lastTradeId: trade.id,
    });
  }
  // `maxPoints` used to truncate the authoritative six-hour series into a
  // trailing window. Keep every price change in the active fixed domain;
  // canvas density is bounded later by the display-only pixel projection.
  boundedMaxPoints(
    maxPoints,
    CHART_TIMEFRAMES.ultra.defaultMaxPoints,
  );
  return points;
}

function fixedTradeEndpointPoints(trades, intervalMs, options) {
  const ordered = windowedTrades(
    normalizedChartTrades(trades, options),
    options.nowMs,
    options.windowMs,
  );
  const buckets = new Map();
  for (const trade of ordered) {
    const startMs =
      trade.timestampMs === options.domainStartInclusiveMs
        ? trade.timestampMs
        : trade.timestampMs === 0
        ? 0
        : Math.floor((trade.timestampMs - 1) / intervalMs) *
          intervalMs;
    const current = buckets.get(startMs) ?? {
      timeMs: addSafe(startMs, intervalMs, 'endpoint timeMs'),
      priceTicks: trade.priceTicks,
      volume: 0,
      turnoverTicks: 0,
      tradeCount: 0,
      hasTrade: true,
    };
    current.priceTicks = trade.priceTicks;
    current.volume = addSafe(
      current.volume,
      trade.quantity,
      'endpoint volume',
    );
    current.turnoverTicks = addSafe(
      current.turnoverTicks,
      trade.turnoverTicks,
      'endpoint turnoverTicks',
    );
    current.tradeCount = addSafe(
      current.tradeCount,
      1,
      'endpoint tradeCount',
    );
    buckets.set(startMs, current);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, point]) => point);
}

function fixedBarEndpointPoints(
  bars,
  intervalMs,
  {
    carryInPriceTicks = null,
    boundaryTrade = null,
    domainStartInclusiveMs = null,
  } = {},
) {
  const points = [];
  let lastPriceTicks =
    positiveSafeInteger(carryInPriceTicks);
  let boundaryPending =
    boundaryTrade &&
    Number.isSafeInteger(domainStartInclusiveMs) &&
    boundaryTrade.timeMs === domainStartInclusiveMs &&
    positiveSafeInteger(boundaryTrade.priceTicks) &&
    Number.isSafeInteger(boundaryTrade.volume) &&
    boundaryTrade.volume > 0
      ? boundaryTrade
      : null;
  for (const bar of aggregateBars(bars, intervalMs)) {
    const barHasTrade =
      bar.openTicks !== null &&
      (bar.volume > 0 || bar.tradeCount > 0);
    const includesBoundary =
      boundaryPending &&
      bar.startMs === domainStartInclusiveMs;
    if (includesBoundary) {
      lastPriceTicks = boundaryPending.priceTicks;
    }
    if (barHasTrade) lastPriceTicks = bar.closeTicks;
    if (lastPriceTicks === null) continue;
    const boundaryVolume = includesBoundary
      ? boundaryPending.volume
      : 0;
    const boundaryTurnoverTicks = includesBoundary
      ? boundaryPending.turnoverTicks
      : 0;
    const boundaryTradeCount = includesBoundary
      ? boundaryPending.tradeCount
      : 0;
    points.push({
      timeMs: addSafe(
        bar.startMs,
        intervalMs,
        'endpoint timeMs',
      ),
      priceTicks: lastPriceTicks,
      volume:
        (barHasTrade ? bar.volume : 0) +
        boundaryVolume,
      turnoverTicks:
        (barHasTrade ? bar.turnoverTicks : 0) +
        boundaryTurnoverTicks,
      tradeCount:
        (barHasTrade ? bar.tradeCount : 0) +
        boundaryTradeCount,
      hasTrade:
        barHasTrade || boundaryTradeCount > 0,
    });
    if (includesBoundary) boundaryPending = null;
  }
  return points;
}

function latestLinePublicationMs(
  source,
  {
    symbol = null,
    nowMs,
  } = {},
) {
  const resolvedNowMs = optionalSafeInteger(
    nowMs,
    0,
    'nowMs',
    0,
  );
  const bars = asArray(asObject(source).bars);
  for (let index = bars.length - 1; index >= 0; index -= 1) {
    const bar = asObject(bars[index]);
    const endMs = resolveBarTime(bar, 'endMs', 'frameEndMs');
    if (
      Number.isSafeInteger(endMs) &&
      endMs <= resolvedNowMs &&
      bar.openTicks !== null &&
      (
        Number(bar.volume ?? bar.volumeShares) > 0 ||
        Number(bar.tradeCount) > 0
      )
    ) {
      return endMs;
    }
  }
  const trades = normalizedChartTrades(
    asArray(asObject(source).trades),
    { symbol },
  ).filter((trade) => trade.timestampMs <= resolvedNowMs);
  return trades.at(-1)?.timestampMs ?? null;
}

function finalizeIntradayEndpoints(
  sampledPoints,
  _source,
  {
    nowMs,
  } = {},
) {
  // Each endpoint belongs to the absolute minute grid. The current bucket may
  // update its price and activity, but its x coordinate is already final.
  const fixed = sampledPoints.filter(
    (point) => point.timeMs <= nowMs,
  );
  const provisional = sampledPoints.find(
    (point) => point.timeMs > nowMs,
  );
  if (!provisional) return fixed;
  return [...fixed, provisional];
}

function materializeIntradayMinuteGrid(
  sampledPoints,
  {
    domain,
    nowMs,
    intervalMs,
    carryInPriceTicks = null,
  },
) {
  if (
    !domain ||
    !Number.isSafeInteger(domain.startMs) ||
    !Number.isSafeInteger(domain.endMs) ||
    domain.endMs <= domain.startMs
  ) {
    return sampledPoints;
  }
  const clampedNowMs = Math.min(
    domain.endMs,
    Math.max(domain.startMs, nowMs),
  );
  const currentEndpointMs = Math.min(
    domain.endMs,
    clampedNowMs <= domain.startMs
      ? domain.startMs + intervalMs
      : (
          Math.floor((clampedNowMs - 1) / intervalMs) *
            intervalMs +
          intervalMs
        ),
  );
  const byEndpoint = new Map(
    sampledPoints.map((point) => [point.timeMs, point]),
  );
  const points = [];
  let lastPriceTicks = positiveSafeInteger(carryInPriceTicks);
  for (
    let endpointMs = domain.startMs + intervalMs;
    endpointMs <= currentEndpointMs;
    endpointMs += intervalMs
  ) {
    const authoritative = byEndpoint.get(endpointMs);
    if (authoritative) {
      lastPriceTicks = authoritative.priceTicks;
      points.push(authoritative);
      continue;
    }
    if (lastPriceTicks === null) continue;
    points.push({
      timeMs: endpointMs,
      priceTicks: lastPriceTicks,
      volume: 0,
      turnoverTicks: 0,
      tradeCount: 0,
      hasTrade: false,
    });
  }
  return points;
}

function attachCumulativeAveragePrice(points) {
  let cumulativeVolume = 0;
  let cumulativeTurnoverTicks = 0;
  return points.map((point) => {
    cumulativeVolume = addSafe(
      cumulativeVolume,
      point.volume,
      'cumulative intraday volume',
    );
    cumulativeTurnoverTicks = addSafe(
      cumulativeTurnoverTicks,
      point.turnoverTicks,
      'cumulative intraday turnoverTicks',
    );
    return {
      ...point,
      cumulativeVolume,
      cumulativeTurnoverTicks,
      averagePriceTicks:
        cumulativeVolume > 0
          ? Math.round(cumulativeTurnoverTicks / cumulativeVolume)
          : null,
    };
  });
}

function attachMovingAverages(
  bars,
  periods = MOVING_AVERAGE_PERIODS,
) {
  const rolling = new Map(
    periods.map((period) => [period, { values: [], sum: 0 }]),
  );
  return bars.map((bar) => {
    const movingAverages = {};
    for (const period of periods) {
      const state = rolling.get(period);
      if (positiveSafeInteger(bar.closeTicks)) {
        state.values.push(bar.closeTicks);
        state.sum += bar.closeTicks;
        if (state.values.length > period) {
          state.sum -= state.values.shift();
        }
      }
      movingAverages[String(period)] =
        state.values.length === period
          ? Math.round(state.sum / period)
          : null;
    }
    return { ...bar, movingAverages };
  });
}

/**
 * Samples fixed-time endpoint prices for a conventional intraday line. Empty
 * buckets are omitted: no carry-forward point is labelled as a trade and no
 * volume is invented.
 */
export function sampleFixedIntervalEndpoints(
  source,
  intervalMs,
  {
    symbol = null,
    nowMs = null,
    windowMs = null,
    maxPoints = Number.MAX_SAFE_INTEGER,
    carryInPriceTicks = null,
    boundaryTrade = null,
    domainStartInclusiveMs = null,
  } = {},
) {
  requireSafeInteger(intervalMs, 'intervalMs', 1);
  const value = asObject(source);
  const bars = normalizeVisibleBars(value.bars);
  const points = bars.length
    ? fixedBarEndpointPoints(bars, intervalMs, {
        carryInPriceTicks,
        boundaryTrade,
        domainStartInclusiveMs,
      })
    : fixedTradeEndpointPoints(asArray(value.trades), intervalMs, {
        symbol,
        nowMs,
        windowMs,
        domainStartInclusiveMs,
      });
  const resolvedNowMs = optionalSafeInteger(
    nowMs,
    points.at(-1)?.timeMs ?? 0,
    'nowMs',
  );
  const resolvedWindowMs = optionalSafeInteger(
    windowMs,
    null,
    'windowMs',
    1,
  );
  const inWindow =
    resolvedWindowMs === null
      ? points
      : points.filter(
          (point) =>
            point.timeMs > resolvedNowMs - resolvedWindowMs &&
            point.timeMs <=
              resolvedNowMs + intervalMs,
        );
  return inWindow.slice(-boundedMaxPoints(
    maxPoints,
    Number.MAX_SAFE_INTEGER,
  ));
}

function quoteFrameBars(snapshot, symbol) {
  const result = [];
  for (const frame of asArray(snapshot.quoteFrames)) {
    const value = asObject(frame);
    const frameBars = asObject(value.frameBars ?? value.bars);
    const symbolFrame = asObject(asObject(value.symbols)[symbol]);
    const candidate =
      frameBars[symbol] ??
      (value.symbol === symbol ? value : null) ??
      symbolFrame.frameBar;
    if (!candidate) continue;
    try {
      result.push(normalizeVisibleBar(candidate));
    } catch {
      // A quote frame without an authoritative bar is not reconstructed from
      // a last-price mirror.
    }
  }
  return result.sort(compareBars);
}

function deduplicateBars(bars) {
  const result = new Map();
  for (const bar of bars.map(copyBar).sort(compareBars)) {
    result.set(`${bar.startMs}:${bar.endMs}`, bar);
  }
  return [...result.values()].sort(compareBars);
}

function barsOverlap(left, right) {
  return left.startMs < right.endMs && right.startMs < left.endMs;
}

function withoutAuthorityOverlap(candidates, authorities) {
  if (authorities.length === 0) return candidates;
  const orderedCandidates = candidates.map(copyBar).sort(compareBars);
  const orderedAuthorities = authorities.map(copyBar).sort(compareBars);
  const result = [];
  let authorityIndex = 0;
  for (const candidate of orderedCandidates) {
    while (
      authorityIndex < orderedAuthorities.length &&
      orderedAuthorities[authorityIndex].endMs <= candidate.startMs
    ) {
      authorityIndex += 1;
    }
    let cursor = authorityIndex;
    let overlaps = false;
    while (
      cursor < orderedAuthorities.length &&
      orderedAuthorities[cursor].startMs < candidate.endMs
    ) {
      if (barsOverlap(candidate, orderedAuthorities[cursor])) {
        overlaps = true;
        break;
      }
      cursor += 1;
    }
    if (!overlaps) result.push(candidate);
  }
  return result;
}

function snapshotBarSources(
  snapshot,
  symbol,
  {
    includeMinuteArchive = false,
    includeDailyArchive = false,
    minuteArchiveStartMs = null,
    minuteArchiveEndMs = null,
  } = {},
) {
  const value = asObject(snapshot);
  const view = asObject(asObject(value.symbols)[symbol]);
  const intradayBars = normalizeVisibleBars(view.intradayBars);
  const publishedFrameBars = quoteFrameBars(value, symbol);
  const currentMinuteBars = intradayBars.length
    ? []
    : normalizeVisibleBars(view.minuteBars);
  const selectedCurrentBars = intradayBars.length
    ? intradayBars
    : publishedFrameBars.length
      ? publishedFrameBars
    : currentMinuteBars.length
      ? currentMinuteBars
      : [];
  const ordinaryCurrentBucket = normalizeVisibleBars(
    view.ordinaryCurrentBucket
      ? [view.ordinaryCurrentBucket]
      : [],
  );
  const currentBars = ordinaryCurrentBucket.length
    ? deduplicateBars([
        ...withoutAuthorityOverlap(
          selectedCurrentBars,
          ordinaryCurrentBucket,
        ),
        ...ordinaryCurrentBucket,
      ])
    : selectedCurrentBars;
  const archive =
    includeMinuteArchive || includeDailyArchive
      ? asObject(
          asObject(asObject(value.barArchives).bySymbol)[symbol],
        )
      : {};
  const minuteArchiveValues = includeMinuteArchive
    ? asArray(view.archivedMinuteBars ?? archive.minuteBars)
    : [];
  const archivedMinuteBars = normalizeVisibleBarsInRange(
    minuteArchiveValues,
    minuteArchiveStartMs,
    minuteArchiveEndMs,
  );
  const dailyBars = includeDailyArchive
    ? normalizeVisibleBars(
        view.dailyBars ?? archive.dailyBars,
      )
    : [];
  const minuteBase = deduplicateBars([
    ...withoutAuthorityOverlap(archivedMinuteBars, currentBars),
    ...currentBars,
  ]);
  return {
    currentBars,
    minuteBase,
    dailyBars: deduplicateBars(dailyBars),
  };
}

function completeDailyBars(sources) {
  const archivedDaily = aggregateBarsForTimeframe(
    sources.dailyBars,
    '1d',
  );
  const archivedDays = new Set(
    archivedDaily.map((bar) => bar.startMs),
  );
  const derivedMissingDays = aggregateBarsForTimeframe(
    sources.currentBars,
    '1d',
  ).filter((bar) => !archivedDays.has(bar.startMs));
  return deduplicateBars([
    ...archivedDaily,
    ...derivedMissingDays,
  ]);
}

function sessionPriceEnvelope(snapshot, symbol, nowMs) {
  const sessionStartMs = dayStartFor(nowMs);
  const sessionEndMs = sessionStartMs + NATURAL_DAY_MS;
  const chartAuthority = asObject(
    asObject(asObject(snapshot).symbols)[symbol]
      ?.chartAuthority,
  );
  if (
    chartAuthority.sessionStartMs === sessionStartMs &&
    positiveSafeInteger(chartAuthority.openingTicks) &&
    positiveSafeInteger(chartAuthority.highTicks) &&
    positiveSafeInteger(chartAuthority.lowTicks)
  ) {
    return {
      sessionStartMs,
      openingTicks: chartAuthority.openingTicks,
      sessionHighTicks: chartAuthority.highTicks,
      sessionLowTicks: chartAuthority.lowTicks,
    };
  }
  const sources = snapshotBarSources(snapshot, symbol);
  const bars = sources.currentBars.filter(
    (bar) =>
      bar.startMs >= sessionStartMs &&
      bar.startMs < sessionEndMs &&
      bar.openTicks !== null,
  );
  if (bars.length) {
    return {
      sessionStartMs,
      openingTicks: bars[0].openTicks,
      sessionHighTicks: Math.max(
        ...bars.map((bar) => bar.highTicks),
      ),
      sessionLowTicks: Math.min(
        ...bars.map((bar) => bar.lowTicks),
      ),
    };
  }
  const trades = normalizedChartTrades(snapshot.trades ?? [], {
    symbol,
  }).filter(
    (trade) =>
      trade.timestampMs >= sessionStartMs &&
      trade.timestampMs < sessionEndMs,
  );
  if (!trades.length) {
    return {
      sessionStartMs,
      openingTicks: null,
      sessionHighTicks: null,
      sessionLowTicks: null,
    };
  }
  return {
    sessionStartMs,
    openingTicks: trades[0].priceTicks,
    sessionHighTicks: Math.max(
      ...trades.map((trade) => trade.priceTicks),
    ),
    sessionLowTicks: Math.min(
      ...trades.map((trade) => trade.priceTicks),
    ),
  };
}

function fixedIntradayWindowMs(requestedWindowMs) {
  const windowMs = optionalSafeInteger(
    requestedWindowMs,
    INTRADAY_WINDOW_MS,
    'windowMs',
    1,
  );
  if (windowMs !== INTRADAY_WINDOW_MS) {
    throw new RangeError(
      'windowMs must use the fixed six-hour intraday window',
    );
  }
  return windowMs;
}

function trailingCandleDomain(nowMs, intervalMs, maxPoints) {
  const widthMs = multiplySafe(
    intervalMs,
    maxPoints,
    'candle domain widthMs',
  );
  const resolvedNowMs = optionalSafeInteger(
    nowMs,
    0,
    'nowMs',
    0,
  );
  const endMs = addSafe(
    Math.floor(resolvedNowMs / intervalMs) * intervalMs,
    intervalMs,
    'candle domain endMs',
  );
  return {
    startMs: Math.max(0, endMs - widthMs),
    endMs,
  };
}

/**
 * Builds a chart-ready view directly from a market snapshot. The
 * snapshot remains the only persisted source: recent trades/frame bars feed
 * high-resolution views, minute archives feed larger intraday candles, and
 * daily authority feeds week aggregation.
 */
export function deriveMarketChartSeries(
  snapshot,
  symbol,
  timeframe = 'intraday',
  options = {},
) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new TypeError('snapshot must be an object');
  }
  if (typeof symbol !== 'string' || symbol.length === 0) {
    throw new TypeError('symbol must be a non-empty string');
  }
  const spec = timeframeSpec(timeframe);
  const nowMs = optionalSafeInteger(
    options.nowMs,
    snapshot.nowMs ?? 0,
    'nowMs',
    0,
  );
  const maxPoints = boundedMaxPoints(
    options.maxPoints,
    spec.defaultMaxPoints,
  );
  const displayTimeOffsetMs = optionalSafeInteger(
    options.displayTimeOffsetMs,
    snapshot.marketClockOffsetMs ?? 0,
    'displayTimeOffsetMs',
    0,
  );

  if (timeframe === 'ultra') {
    const windowMs = fixedIntradayWindowMs(options.windowMs);
    const domain = deriveFixedIntradayTimeDomain(nowMs, {
      clockOffsetMs: displayTimeOffsetMs,
    });
    const completeSymbolTrades =
      snapshot.symbols?.[symbol]?.ultraTrades;
    const hasCompleteSymbolTrades =
      Array.isArray(completeSymbolTrades);
    const rawPoints = derivePriceChangesFromTrades(
      hasCompleteSymbolTrades
        ? completeSymbolTrades
        : snapshot.trades ?? [],
      {
      symbol,
      nowMs,
      windowMs,
      maxPoints,
      // The chart domain is inclusive at its exact six-hour boundary. Filter
      // before plateau compression so an equal-price point from the previous
      // window cannot absorb the first in-window trade.
      domainStartExclusiveMs: domain.startMs - 1,
      domainEndInclusiveMs: domain.endMs,
      },
    ).filter(
      (point) =>
        point.timeMs >= domain.startMs &&
        point.timeMs <= domain.endMs,
    );
    const points = attachCumulativeAveragePrice(rawPoints);
    return {
      timeframe,
      kind: spec.kind,
      intervalMs: spec.intervalMs,
      domain,
      displayTimeOffsetMs,
      ...sessionPriceEnvelope(snapshot, symbol, nowMs),
      points,
      bars: [],
      source: hasCompleteSymbolTrades
        ? 'authoritative_symbol_ultra_trades'
        : 'authoritative_trades',
      axisMode: 'fixed_aligned_window',
      averageLineKind: 'domain_cumulative_vwap',
      averagePriceBasis: 'authoritative_turnover_divided_by_volume',
      adjustmentBasis: 'unadjusted',
    };
  }

  if (timeframe === 'intraday') {
    const windowMs = fixedIntradayWindowMs(options.windowMs);
    const domain = deriveFixedIntradayTimeDomain(nowMs, {
      clockOffsetMs: displayTimeOffsetMs,
    });
    const sources = snapshotBarSources(snapshot, symbol, {
      includeMinuteArchive: true,
      minuteArchiveStartMs: domain.startMs,
      minuteArchiveEndMs: domain.endMs,
    });
    const rawEndpointBars = sources.minuteBase;
    const endpointBars = rawEndpointBars.filter(
      (bar) =>
        bar.endMs > domain.startMs &&
        bar.startMs < domain.endMs,
    );
    const endpointSource = endpointBars.length
      ? { bars: endpointBars }
      : { trades: snapshot.trades ?? [] };
    const chartAuthority = asObject(
      asObject(asObject(snapshot).symbols)[symbol]
        ?.chartAuthority,
    );
    const authorityMatchesDomain =
      chartAuthority.domainStartMs === domain.startMs;
    const boundaryTrade =
      authorityMatchesDomain &&
      chartAuthority.boundaryTrade
        ? asObject(chartAuthority.boundaryTrade)
        : null;
    const sampledPoints = sampleFixedIntervalEndpoints(
      endpointSource,
      spec.intervalMs,
      {
        symbol,
        nowMs,
        windowMs,
        maxPoints: Number.MAX_SAFE_INTEGER,
        carryInPriceTicks: authorityMatchesDomain
          ? chartAuthority.carryInPriceTicks
          : null,
        boundaryTrade,
        domainStartInclusiveMs: domain.startMs,
      },
    );
    const finalizedEndpoints = finalizeIntradayEndpoints(
        sampledPoints,
        endpointSource,
        { symbol, nowMs },
      ).filter(
        (point) =>
          point.timeMs > domain.startMs &&
          point.timeMs <= domain.endMs,
      );
    const view = asObject(
      asObject(asObject(snapshot).symbols)[symbol],
    );
    const points = attachCumulativeAveragePrice(
      materializeIntradayMinuteGrid(
        finalizedEndpoints,
        {
          domain,
          nowMs,
          intervalMs: spec.intervalMs,
          carryInPriceTicks:
            (
              authorityMatchesDomain
                ? chartAuthority.carryInPriceTicks
                : null
            ) ??
            view.previousCloseTicks,
        },
      ),
    );
    return {
      timeframe,
      kind: spec.kind,
      intervalMs: spec.intervalMs,
      domain,
      displayTimeOffsetMs,
      ...sessionPriceEnvelope(snapshot, symbol, nowMs),
      points,
      bars: [],
      source: endpointBars.length
        ? 'authoritative_current_and_archived_bars_fixed_endpoints'
        : 'authoritative_trades_fixed_endpoints',
      axisMode: 'fixed_aligned_window',
      averageLineKind: 'domain_cumulative_vwap',
      averagePriceBasis: 'authoritative_turnover_divided_by_volume',
      adjustmentBasis: 'unadjusted',
    };
  }

  const dailyTimeframe =
    timeframe === '1d' || timeframe === '1w';
  const sources = snapshotBarSources(snapshot, symbol, {
    includeMinuteArchive: !dailyTimeframe,
    includeDailyArchive: dailyTimeframe,
  });
  let bars;
  let source;
  if (timeframe === '1d') {
    bars = completeDailyBars(sources);
    source = 'daily_authority_plus_live_derived';
  } else if (timeframe === '1w') {
    bars = aggregateBarsForTimeframe(
      completeDailyBars(sources),
      '1w',
    );
    source = 'derived_from_daily_authority';
  } else {
    bars = aggregateBarsForTimeframe(
      sources.minuteBase,
      timeframe,
    );
    source = 'derived_from_recent_frame_and_minute_authority';
  }
  const domain = trailingCandleDomain(
    nowMs,
    spec.intervalMs,
    maxPoints,
  );
  const barsWithMovingAverages = attachMovingAverages(bars);
  const visibleBars = barsWithMovingAverages
    .filter((bar) => bar.openTicks !== null)
    .filter(
      (bar) =>
        bar.startMs >= domain.startMs &&
        bar.startMs < domain.endMs,
    )
    .slice(-maxPoints);
  return {
    timeframe,
    kind: spec.kind,
    intervalMs: spec.intervalMs,
    domain,
    displayTimeOffsetMs,
    points: [],
    bars: visibleBars,
    source,
    axisMode: 'trailing_fixed_slots',
    movingAveragePeriods: [...MOVING_AVERAGE_PERIODS],
    movingAverageBasis: 'authoritative_close',
    adjustmentBasis: 'unadjusted',
  };
}

/** Maps a timestamp to a stable x coordinate within its UTC natural-day domain. */
export function xForNaturalDay(timestampMs, width) {
  requireSafeInteger(timestampMs, 'timestampMs');
  requireSafeInteger(width, 'width', 1);
  const offsetMs = ((timestampMs % NATURAL_DAY_MS) + NATURAL_DAY_MS) % NATURAL_DAY_MS;
  return offsetMs * width / NATURAL_DAY_MS;
}

/** Produces one price M4 envelope per pixel without deriving missing prices. */
export function downsamplePriceColumns(bars, width) {
  if (!Array.isArray(bars)) throw new TypeError('bars must be an array');
  requireSafeInteger(width, 'width', 1);
  const columns = Array.from({ length: width }, (_, x) => ({
    x,
    firstTicks: null,
    lastTicks: null,
    highTicks: null,
    lowTicks: null,
    barCount: 0,
  }));
  for (const bar of bars.map(copyBar).sort(compareBars)) {
    if (bar.openTicks === null) continue;
    const column = columns[columnIndex(bar.endMs, width)];
    if (column.firstTicks === null) column.firstTicks = bar.openTicks;
    column.lastTicks = bar.closeTicks;
    column.highTicks = column.highTicks === null ? bar.highTicks : Math.max(column.highTicks, bar.highTicks);
    column.lowTicks = column.lowTicks === null ? bar.lowTicks : Math.min(column.lowTicks, bar.lowTicks);
    column.barCount = addSafe(column.barCount, 1, 'price column barCount');
  }
  return columns;
}

/** Sums source-bar shares into the same fixed natural-day pixel columns. */
export function sumVolumeColumns(bars, width) {
  if (!Array.isArray(bars)) throw new TypeError('bars must be an array');
  requireSafeInteger(width, 'width', 1);
  const columns = Array.from({ length: width }, (_, x) => ({
    x,
    volume: 0,
    turnoverTicks: 0,
    tradeCount: 0,
  }));
  for (const bar of bars.map(copyBar)) {
    const column = columns[columnIndex(bar.endMs, width)];
    column.volume = addSafe(column.volume, bar.volume, 'volume column volume');
    column.turnoverTicks = addSafe(column.turnoverTicks, bar.turnoverTicks, 'volume column turnoverTicks');
    column.tradeCount = addSafe(column.tradeCount, bar.tradeCount, 'volume column tradeCount');
  }
  return columns;
}

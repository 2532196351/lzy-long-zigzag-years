import {
  createMarketWorkerController,
  epochAlignedMonotonicNow,
} from './worker.js?v=20260803-02';
import {
  NATURAL_DAY_MS,
  aggregateBars,
} from './bars.js?v=20260803-02';
import {
  deriveFixedIntradayTimeDomain,
  INTRADAY_WINDOW_MS,
} from './chart-domain.js?v=20260803-02';
import {
  mergeDerivativesAuthorityPublication,
  mergeWorldAuthorityPublication,
} from './world-publication.js?v=20260803-02';
import {
  AUDIT_COLD_TRANSPORT_SCHEMA,
  createBrowserAuditColdStore,
} from './audit-cold-store.js?v=20260803-02';

const MAX_ADVANCE_WORLD_DAYS = 5;
const MAX_ADVANCE_VIRTUAL_MS = 300_000;
const MAX_CLIENT_MINUTE_ARCHIVE = 10_080;
const MAX_CLIENT_DAILY_ARCHIVE = 365;
const QUOTE_FRAME_MS = 3_000;
const MAX_CLIENT_INTRADAY_FRAMES =
  INTRADAY_WINDOW_MS / QUOTE_FRAME_MS;
const PUBLICATION_CREDIT_SCHEMA =
  'lzy_market_publication_credit_v1';

export function createVisibleFramePublicationGate({
  intervalMs,
} = {}) {
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs <= 0
  ) {
    throw new RangeError(
      'Visible frame interval must be a positive integer.',
    );
  }
  let baselineMs = null;

  function snapshotMs(snapshot) {
    const value = Number(snapshot?.nowMs);
    return Number.isSafeInteger(value) ? value : null;
  }

  function alignedEndpointAtOrBefore(nowMs) {
    return Math.floor(nowMs / intervalMs) * intervalMs;
  }

  return {
    setBaseline(snapshot) {
      const nowMs = snapshotMs(snapshot);
      baselineMs =
        nowMs === null
          ? null
          : alignedEndpointAtOrBefore(nowMs);
      return baselineMs;
    },
    reset() {
      baselineMs = null;
    },
    shouldPublish(snapshot, { speed = 1 } = {}) {
      const nowMs = snapshotMs(snapshot);
      if (nowMs === null) return false;
      if (
        speed !== 1 ||
        baselineMs === null ||
        nowMs - baselineMs >= intervalMs
      ) {
        baselineMs =
          speed === 1
            ? alignedEndpointAtOrBefore(nowMs)
            : nowMs;
        return true;
      }
      return false;
    },
  };
}

function cloneValue(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function defaultFrameScheduler(callback) {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    return globalThis.requestAnimationFrame(callback);
  }
  callback();
  return null;
}

function defaultCancelFrame(handle) {
  globalThis.cancelAnimationFrame?.(handle);
}

function defaultWallNow() {
  return epochAlignedMonotonicNow();
}

function createLoopbackWorker(controllerOptions = {}) {
  const clientListeners = new Set();
  const workerListeners = new Set();
  let terminated = false;
  let controller = null;

  const clientPort = {
    postMessage(message) {
      if (terminated) throw new Error('Worker has been terminated.');
      const event = { data: cloneValue(message) };
      for (const listener of workerListeners) listener(event);
    },
    addEventListener(type, listener) {
      if (type === 'message') clientListeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === 'message') clientListeners.delete(listener);
    },
    terminate() {
      if (terminated) return;
      controller?.destroy();
      terminated = true;
      clientListeners.clear();
      workerListeners.clear();
    },
  };
  const workerPort = {
    postMessage(message) {
      if (terminated) return;
      const event = { data: cloneValue(message) };
      for (const listener of clientListeners) listener(event);
    },
    addEventListener(type, listener) {
      if (type === 'message') workerListeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === 'message') workerListeners.delete(listener);
    },
  };

  controller = createMarketWorkerController({
    ...controllerOptions,
    port: workerPort,
  });
  return clientPort;
}

function defaultWorkerFactory() {
  if (typeof Worker !== 'function') {
    throw new Error('Module Worker is unavailable.');
  }
  return new Worker(new URL('./worker.js?v=20260803-02', import.meta.url), {
    type: 'module',
  });
}

function asError(message) {
  const error = new Error(message.message || 'Market worker error.');
  error.response = cloneValue(message);
  return error;
}

function commandReceipt(message) {
  const receipt = { ...message.receipt };
  // The complete accumulators remain directly queryable for authority
  // consumers, but they are transport context rather than receipt fields.
  // Keeping them non-enumerable prevents generic logs/notifications from
  // serializing the whole market and derivatives surface per stock command.
  if (message.market) {
    Object.defineProperty(receipt, 'marketSnapshot', {
      value: message.market,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  if (message.world?.state) {
    Object.defineProperty(receipt, 'worldSnapshot', {
      value: message.world.state,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  if (message.derivativesPatch) {
    receipt.derivativesPatch = message.derivativesPatch;
  }
  return receipt;
}

function assertWorldDays(days) {
  if (
    !Number.isSafeInteger(days) ||
    days < 1 ||
    days > MAX_ADVANCE_WORLD_DAYS
  ) {
    throw new RangeError(
      `days must be a positive integer between 1 and ${MAX_ADVANCE_WORLD_DAYS}.`,
    );
  }
}

function assertVirtualDuration(durationMs) {
  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs < 1 ||
    durationMs > MAX_ADVANCE_VIRTUAL_MS
  ) {
    throw new RangeError(
      `virtual duration must be a positive integer at most ${MAX_ADVANCE_VIRTUAL_MS}ms.`,
    );
  }
}

function barStartMs(bar) {
  return Number(bar?.startMs ?? bar?.frameStartMs);
}

function mergeBarHistory(...collections) {
  const populated = collections.filter(
    (collection) => Array.isArray(collection) && collection.length > 0,
  );
  if (populated.length === 0) return [];
  if (
    populated.length === 1 &&
    populated[0] === collections[0]
  ) {
    return populated[0];
  }
  const byStart = new Map();
  for (const collection of populated) {
    for (const bar of collection) {
      const startMs = barStartMs(bar);
      if (!Number.isSafeInteger(startMs)) continue;
      byStart.set(startMs, bar);
    }
  }
  return [...byStart.values()].sort(
    (left, right) => barStartMs(left) - barStartMs(right),
  );
}

function barNaturalDay(bar) {
  const startMs = barStartMs(bar);
  return Number.isSafeInteger(startMs)
    ? Math.floor(startMs / NATURAL_DAY_MS)
    : null;
}

function barEndMs(bar) {
  return Number(bar?.endMs ?? bar?.frameEndMs);
}

function firstBarEndingAfter(bars, timestampMs) {
  let low = 0;
  let high = bars.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (barEndMs(bars[middle]) <= timestampMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function firstBarStartingAtOrAfter(bars, timestampMs) {
  let low = 0;
  let high = bars.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (barStartMs(bars[middle]) < timestampMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function barsWithinDomain(bars, startMs, endMs) {
  const source = Array.isArray(bars) ? bars : [];
  if (source.length === 0) return source;
  const startIndex = firstBarEndingAfter(source, startMs);
  const endIndex = firstBarStartingAtOrAfter(source, endMs);
  return startIndex === 0 && endIndex === source.length
    ? source
    : source.slice(startIndex, endIndex);
}

function appendMonotonicBars(previousBars, ...collections) {
  const previous = Array.isArray(previousBars) ? previousBars : [];
  const incoming = collections.flatMap((collection) =>
    Array.isArray(collection) ? collection : [],
  );
  if (incoming.length === 0) return previous;
  let lastStart = barStartMs(previous.at(-1));
  let retained = previous;
  const additions = [];
  for (const bar of incoming) {
    const startMs = barStartMs(bar);
    if (!Number.isSafeInteger(startMs)) continue;
    if (Number.isSafeInteger(lastStart) && startMs < lastStart) {
      return mergeBarHistory(previous, incoming);
    }
    if (startMs === lastStart) {
      if (additions.length > 0) {
        additions[additions.length - 1] = bar;
      } else {
        retained = previous.slice(0, -1);
        additions.push(bar);
      }
    } else {
      additions.push(bar);
    }
    lastStart = startMs;
  }
  return additions.length === 0
    ? retained
    : retained.concat(additions);
}

function mergeFixedIntradayHistory({
  previousBars,
  currentBars,
  currentFrameBar,
  nowMs,
  clockOffsetMs,
}) {
  const domain = deriveFixedIntradayTimeDomain(nowMs, {
    clockOffsetMs,
  });
  const previous = barsWithinDomain(
    previousBars,
    domain.startMs,
    domain.endMs,
  );
  const incoming = [
    ...(Array.isArray(currentBars) ? currentBars : []),
    ...(currentFrameBar ? [currentFrameBar] : []),
  ].filter(
    (bar) =>
      barEndMs(bar) > domain.startMs &&
      barStartMs(bar) < domain.endMs,
  );
  const merged = appendMonotonicBars(previous, incoming);
  return merged.length > MAX_CLIENT_INTRADAY_FRAMES
    ? merged.slice(-MAX_CLIENT_INTRADAY_FRAMES)
    : merged;
}

function quoteFrameTime(frame) {
  return Number(frame?.virtualMs);
}

function firstQuoteFrameAtOrAfter(frames, timestampMs) {
  let low = 0;
  let high = frames.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (quoteFrameTime(frames[middle]) < timestampMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function firstQuoteFrameAfter(frames, timestampMs) {
  let low = 0;
  let high = frames.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (quoteFrameTime(frames[middle]) <= timestampMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function mergeQuoteFrameFallback(previousFrames, incomingFrames) {
  const byTime = new Map();
  for (const collection of [previousFrames, incomingFrames]) {
    for (const frame of collection) {
      const timestampMs = quoteFrameTime(frame);
      if (!Number.isSafeInteger(timestampMs)) continue;
      byTime.set(timestampMs, frame);
    }
  }
  return [...byTime.values()].sort(
    (left, right) => quoteFrameTime(left) - quoteFrameTime(right),
  );
}

function mergeQuoteFrameHistory({
  previousFrames,
  currentFrames,
  nowMs,
  clockOffsetMs,
}) {
  const domain = deriveFixedIntradayTimeDomain(nowMs, {
    clockOffsetMs,
  });
  const previous = Array.isArray(previousFrames)
    ? previousFrames
    : [];
  const startIndex = firstQuoteFrameAtOrAfter(
    previous,
    domain.startMs,
  );
  const endIndex = firstQuoteFrameAfter(previous, domain.endMs);
  let retained =
    startIndex === 0 && endIndex === previous.length
      ? previous
      : previous.slice(startIndex, endIndex);
  const additions = [];
  let lastTime = quoteFrameTime(retained.at(-1));
  for (const frame of Array.isArray(currentFrames)
    ? currentFrames
    : []) {
    const timestampMs = quoteFrameTime(frame);
    if (
      !Number.isSafeInteger(timestampMs) ||
      timestampMs < domain.startMs ||
      timestampMs > domain.endMs
    ) {
      continue;
    }
    if (Number.isSafeInteger(lastTime) && timestampMs < lastTime) {
      return mergeQuoteFrameFallback(
        retained,
        currentFrames,
      ).filter((candidate) => {
        const candidateTime = quoteFrameTime(candidate);
        return (
          candidateTime >= domain.startMs &&
          candidateTime <= domain.endMs
        );
      });
    }
    if (timestampMs === lastTime) {
      if (additions.length > 0) {
        additions[additions.length - 1] = frame;
      } else {
        retained = retained.slice(0, -1);
        additions.push(frame);
      }
    } else {
      additions.push(frame);
    }
    lastTime = timestampMs;
  }
  return additions.length === 0
    ? retained
    : retained.concat(additions);
}

function ultraTradeKey(trade) {
  if (typeof trade?.id === 'string' && trade.id.length > 0) {
    return trade.id;
  }
  return [
    trade?.symbol ?? '',
    trade?.virtualMs ?? trade?.timestampMs ?? '',
    trade?.sequence ?? '',
  ].join(':');
}

function ultraTradeTime(trade) {
  return Number(trade?.virtualMs ?? trade?.timestampMs);
}

function compareUltraTrades(left, right) {
  return (
    ultraTradeTime(left) - ultraTradeTime(right) ||
    Number(left.sequence) - Number(right.sequence) ||
    ultraTradeKey(left).localeCompare(ultraTradeKey(right))
  );
}

function validUltraTrade(trade) {
  return (
    Number.isSafeInteger(ultraTradeTime(trade)) &&
    Number.isSafeInteger(Number(trade?.sequence))
  );
}

function firstUltraAfter(trades, timestampMs) {
  let low = 0;
  let high = trades.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (ultraTradeTime(trades[middle]) <= timestampMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function firstUltraAtOrAfter(trades, timestampMs) {
  let low = 0;
  let high = trades.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (ultraTradeTime(trades[middle]) < timestampMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function ultraInsertionIndex(trades, trade) {
  let low = 0;
  let high = trades.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (compareUltraTrades(trades[middle], trade) < 0) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function mergeSortedUltraTrades(left, right) {
  const merged = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length || rightIndex < right.length) {
    if (leftIndex >= left.length) {
      merged.push(right[rightIndex]);
      rightIndex += 1;
      continue;
    }
    if (rightIndex >= right.length) {
      merged.push(left[leftIndex]);
      leftIndex += 1;
      continue;
    }
    const order = compareUltraTrades(
      left[leftIndex],
      right[rightIndex],
    );
    if (order <= 0) {
      merged.push(left[leftIndex]);
      leftIndex += 1;
      if (order === 0) rightIndex += 1;
    } else {
      merged.push(right[rightIndex]);
      rightIndex += 1;
    }
  }
  return merged;
}

function mergeUltraTradeHistory(
  nowMs,
  clockOffsetMs,
  previousTrades,
  ...incomingCollections
) {
  const previous = Array.isArray(previousTrades)
    ? previousTrades
    : [];
  const domain = deriveFixedIntradayTimeDomain(nowMs, {
    clockOffsetMs:
      Number.isSafeInteger(Number(clockOffsetMs)) &&
      Number(clockOffsetMs) >= 0
        ? Number(clockOffsetMs)
        : 0,
  });
  const startIndex = firstUltraAtOrAfter(
    previous,
    domain.startMs,
  );
  const endIndex = firstUltraAfter(previous, domain.endMs);
  const retained =
    startIndex === 0 && endIndex === previous.length
      ? previous
      : previous.slice(startIndex, endIndex);
  const incomingById = new Map();
  for (const collection of incomingCollections) {
    for (const trade of Array.isArray(collection) ? collection : []) {
      if (!validUltraTrade(trade)) continue;
      const timestampMs = ultraTradeTime(trade);
      if (
        timestampMs < domain.startMs ||
        timestampMs > domain.endMs
      ) {
        continue;
      }
      incomingById.set(ultraTradeKey(trade), trade);
    }
  }
  if (incomingById.size === 0) return retained;
  const incoming = [...incomingById.values()].sort(compareUltraTrades);
  const additions = [];
  for (const trade of incoming) {
    const index = ultraInsertionIndex(retained, trade);
    if (
      index < retained.length &&
      compareUltraTrades(retained[index], trade) === 0
    ) {
      continue;
    }
    additions.push(trade);
  }
  if (additions.length === 0) return retained;
  if (
    retained.length === 0 ||
    compareUltraTrades(retained.at(-1), additions[0]) < 0
  ) {
    return retained.concat(additions);
  }
  return mergeSortedUltraTrades(retained, additions);
}

function comparePublicTrades(left, right) {
  return (
    Number(left?.virtualMs) - Number(right?.virtualMs) ||
    String(left?.id).localeCompare(String(right?.id))
  );
}

function validTradeRetention(retention) {
  if (
    retention?.schema !== 'lzy_public_trade_retention_v1' ||
    !Number.isSafeInteger(retention.authorityCommitSeq) ||
    retention.authorityCommitSeq < 0 ||
    typeof retention.empty !== 'boolean'
  ) {
    return false;
  }
  if (retention.empty) return retention.firstTrade === null;
  return Boolean(
    typeof retention.firstTrade?.id === 'string' &&
      retention.firstTrade.id.length > 0 &&
      Number.isSafeInteger(retention.firstTrade.virtualMs) &&
      retention.firstTrade.virtualMs >= 0,
  );
}

function latestTradeRetention(previous, next) {
  const prior = validTradeRetention(previous) ? previous : null;
  const current = validTradeRetention(next) ? next : null;
  if (!prior) return current;
  if (!current) return prior;
  if (
    current.authorityCommitSeq !== prior.authorityCommitSeq
  ) {
    return current.authorityCommitSeq > prior.authorityCommitSeq
      ? current
      : prior;
  }
  if (current.empty !== prior.empty) {
    return current.empty ? current : prior;
  }
  if (current.empty) return current;
  return comparePublicTrades(
    current.firstTrade,
    prior.firstTrade,
  ) >= 0
    ? current
    : prior;
}

function applyTradeRetention(trades, retention) {
  if (!validTradeRetention(retention)) return trades;
  if (retention.empty) return [];
  let low = 0;
  let high = trades.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (
      comparePublicTrades(
        trades[middle],
        retention.firstTrade,
      ) < 0
    ) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low === 0 ? trades : trades.slice(low);
}

function mergeRetainedPublicTrades(
  previous,
  next,
  ...deltaCollections
) {
  const retention = latestTradeRetention(
    previous?.tradeRetention,
    next?.tradeRetention,
  );
  return {
    retention,
    trades: applyTradeRetention(
      mergePublicTrades(
        previous?.trades,
        ...deltaCollections,
      ),
      retention,
    ),
  };
}

function mergePublicTradesFallback(previousTrades, deltaCollections) {
  const byId = new Map();
  for (const collection of [previousTrades, ...deltaCollections]) {
    for (const trade of Array.isArray(collection) ? collection : []) {
      if (typeof trade?.id !== 'string' || trade.id.length === 0) {
        continue;
      }
      byId.set(trade.id, trade);
    }
  }
  return [...byId.values()]
    .sort(comparePublicTrades)
    .slice(-600);
}

function mergePublicTrades(previousTrades, ...deltaCollections) {
  const previous = Array.isArray(previousTrades) ? previousTrades : [];
  const additions = [];
  for (const collection of deltaCollections) {
    for (const trade of Array.isArray(collection) ? collection : []) {
      if (typeof trade?.id !== 'string' || trade.id.length === 0) {
        continue;
      }
      const priorAddition = additions.at(-1);
      if (priorAddition?.id === trade.id) {
        additions[additions.length - 1] = trade;
        continue;
      }
      if (
        priorAddition &&
        comparePublicTrades(priorAddition, trade) > 0
      ) {
        return mergePublicTradesFallback(previous, deltaCollections);
      }
      additions.push(trade);
    }
  }
  if (additions.length === 0) return previous;
  const previousTail = previous.at(-1);
  let retained = previous;
  if (previousTail) {
    const boundaryOrder = comparePublicTrades(
      previousTail,
      additions[0],
    );
    if (boundaryOrder > 0) {
      return mergePublicTradesFallback(previous, deltaCollections);
    }
    if (boundaryOrder === 0) {
      if (previousTail.id !== additions[0].id) {
        return mergePublicTradesFallback(previous, deltaCollections);
      }
      retained = previous.slice(0, -1);
    }
  }
  const merged = retained.concat(additions);
  return merged.length > 600 ? merged.slice(-600) : merged;
}

function applyLevel2DepthSideDelta(
  previousLevels,
  delta,
  { descending = false } = {},
) {
  if (
    !delta ||
    !Array.isArray(delta.upsert) ||
    !Array.isArray(delta.removePriceTicks)
  ) {
    throw new Error('Invalid Level-2 depth delta side.');
  }
  const byPrice = new Map(
    (previousLevels ?? []).map((level) => [
      Number(level.priceTicks),
      level,
    ]),
  );
  for (const priceTicks of delta.removePriceTicks) {
    if (!Number.isSafeInteger(Number(priceTicks))) {
      throw new Error('Invalid Level-2 removal price.');
    }
    byPrice.delete(Number(priceTicks));
  }
  for (const level of delta.upsert) {
    const priceTicks = Number(level?.priceTicks);
    if (!Number.isSafeInteger(priceTicks) || priceTicks < 1) {
      throw new Error('Invalid Level-2 upsert level.');
    }
    byPrice.set(priceTicks, level);
  }
  return [...byPrice.values()].sort(
    (left, right) =>
      descending
        ? right.priceTicks - left.priceTicks
        : left.priceTicks - right.priceTicks,
  );
}

function materializeLevel2Depth(previousDepth, delta) {
  if (
    !previousDepth ||
    delta?.schema !== 'lzy_level2_depth_delta_v1' ||
    !Number.isSafeInteger(delta.depth) ||
    delta.depth < 1 ||
    !Number.isSafeInteger(delta.actualBidLevels) ||
    delta.actualBidLevels < 0 ||
    delta.actualBidLevels > delta.depth ||
    !Number.isSafeInteger(delta.actualAskLevels) ||
    delta.actualAskLevels < 0 ||
    delta.actualAskLevels > delta.depth
  ) {
    throw new Error('Invalid Level-2 depth delta baseline.');
  }
  const bids = applyLevel2DepthSideDelta(
    previousDepth.bids,
    delta.bids,
    { descending: true },
  ).slice(0, delta.depth);
  const asks = applyLevel2DepthSideDelta(
    previousDepth.asks,
    delta.asks,
  ).slice(0, delta.depth);
  if (
    bids.length !== delta.actualBidLevels ||
    asks.length !== delta.actualAskLevels
  ) {
    throw new Error('Level-2 depth delta did not materialize exactly.');
  }
  return {
    bids,
    asks,
    depth: delta.depth,
    actualBidLevels: delta.actualBidLevels,
    actualAskLevels: delta.actualAskLevels,
    source: delta.source,
  };
}

function replaceQuoteDepthBaselines(baselines, market) {
  baselines.clear();
  for (const [symbol, projection] of Object.entries(
    market?.symbols ?? {},
  )) {
    if (projection?.level2Depth) {
      baselines.set(symbol, projection.level2Depth);
    }
  }
}

function materializeQuoteDepthTransport(baselines, market) {
  if (!market?.symbols) return market;
  return {
    ...market,
    symbols: Object.fromEntries(
      Object.entries(market.symbols).map(([symbol, projection]) => {
        let materialized = projection;
        if (projection?.level2DepthDelta) {
          materialized = {
            ...projection,
            level2Depth: materializeLevel2Depth(
              baselines.get(symbol),
              projection.level2DepthDelta,
            ),
          };
        }
        const {
          level2DepthDelta: _level2DepthDelta,
          ...withoutDelta
        } = materialized;
        if (withoutDelta.level2Depth) {
          baselines.set(symbol, withoutDelta.level2Depth);
        }
        return [symbol, withoutDelta];
      }),
    ),
  };
}

function mixLevel2Fingerprint(hash, value) {
  const text = String(value ?? 'null');
  let next = hash >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    next ^= text.charCodeAt(index);
    next = Math.imul(next, 0x01000193) >>> 0;
  }
  return next;
}

function level2SymbolFingerprint(symbol, security) {
  let hash = 0x811c9dc5;
  const mix = (value) => {
    hash = mixLevel2Fingerprint(hash, value);
  };
  mix(symbol);
  mix(security?.lastPriceTicks);
  const depth = security?.level2Depth;
  for (const side of ['bids', 'asks']) {
    mix(side);
    for (const level of depth?.[side] ?? []) {
      mix(level.priceTicks);
      mix(level.quantity);
      mix(level.orderCount);
    }
  }
  const trades = security?.ultraTrades ?? [];
  const lastTrade = trades.at?.(-1) ?? null;
  mix(trades.length);
  mix(lastTrade?.id);
  mix(lastTrade?.virtualMs);
  mix(lastTrade?.priceTicks);
  mix(lastTrade?.quantity);
  return hash.toString(16).padStart(8, '0');
}

function globalLevel2MaterializationFingerprint(
  symbolFingerprints,
) {
  let hash = 0x811c9dc5;
  for (const [symbol, fingerprint] of [
    ...symbolFingerprints,
  ].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    hash = mixLevel2Fingerprint(hash, symbol);
    hash = mixLevel2Fingerprint(hash, fingerprint);
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

function mergeLevel2Publication(
  previous,
  next,
  { resync = false } = {},
) {
  if (!previous?.symbols || !next?.symbols) return next;
  const symbols = { ...previous.symbols };
  const clockOffsetMs =
    next.marketClockOffsetMs ??
    previous.marketClockOffsetMs ??
    0;
  for (const [symbol, current] of Object.entries(next.symbols)) {
    const prior = previous.symbols[symbol] ?? {};
    const materializedCurrent =
      current.level2DepthDelta
        ? {
            ...current,
            level2Depth: materializeLevel2Depth(
              prior.level2Depth,
              current.level2DepthDelta,
            ),
          }
        : current;
    const {
      ultraTradeDeltas,
      level2DepthDelta: _level2DepthDelta,
      ...currentWithoutUltraDelta
    } = materializedCurrent;
    symbols[symbol] = {
      ...prior,
      ...currentWithoutUltraDelta,
      ultraTrades: mergeUltraTradeHistory(
        Number(next.nowMs) || 0,
        clockOffsetMs,
        resync && Array.isArray(materializedCurrent.ultraTrades)
          ? []
          : prior.ultraTrades,
        materializedCurrent.ultraTrades,
        ultraTradeDeltas,
      ),
    };
  }
  const {
    symbols: _symbols,
    tradeDeltas,
    ...topLevel
  } = next;
  const patchedSymbols = new Set(Object.keys(next.symbols));
  const activeOrders = Array.isArray(next.activeOrders)
    ? [
        ...(previous.activeOrders ?? []).filter(
          (order) => !patchedSymbols.has(order.symbol),
        ),
        ...next.activeOrders,
      ].sort(
        (left, right) =>
          Number(left.submittedMs) - Number(right.submittedMs) ||
          Number(left.sequence) - Number(right.sequence) ||
          String(left.id).localeCompare(String(right.id)),
      )
    : previous.activeOrders;
  const retainedTrades = mergeRetainedPublicTrades(
    resync && Array.isArray(next.trades)
      ? { ...previous, trades: [] }
      : previous,
    next,
    next.trades,
    tradeDeltas,
  );
  return {
    ...previous,
    ...topLevel,
    symbols,
    activeOrders,
    tradeRetention: retainedTrades.retention,
    trades: retainedTrades.trades,
  };
}

function mergeCommandMarketPatch(previous, patch) {
  if (!previous?.symbols || !patch?.symbols) return patch;
  const patchedSymbols = new Set(Object.keys(patch.symbols));
  const compact = mergeMarketPublication(previous, {
    ...patch,
    publication: 'lzy_market_public_v1',
    publicationMode: 'quote_frame',
    quoteFrames: [],
  });
  const {
    symbols: _symbols,
    accounts: _accounts,
    activeOrders: _activeOrders,
    tradeDeltas,
    capacity: _capacity,
    quoteFrames: _quoteFrames,
    ...topLevel
  } = patch;
  const activeOrders = [
    ...(previous.activeOrders ?? []).filter(
      (order) => !patchedSymbols.has(order.symbol),
    ),
    ...(patch.activeOrders ?? []),
  ].sort(
    (left, right) =>
      Number(left.submittedMs) - Number(right.submittedMs) ||
      Number(left.sequence) - Number(right.sequence) ||
      String(left.id).localeCompare(String(right.id)),
  );
  const retainedTrades = mergeRetainedPublicTrades(
    previous,
    patch,
    tradeDeltas,
  );
  return {
    ...previous,
    ...topLevel,
    publication:
      previous.publication ?? 'lzy_market_public_v1',
    publicationMode:
      previous.publicationMode ?? 'snapshot',
    symbols: {
      ...previous.symbols,
      ...compact.symbols,
    },
    accounts: {
      ...previous.accounts,
      ...patch.accounts,
    },
    activeOrders,
    tradeRetention: retainedTrades.retention,
    trades: retainedTrades.trades,
    capacity: {
      ...previous.capacity,
      ...patch.capacity,
    },
    quoteFrames: previous.quoteFrames,
    barArchives: previous.barArchives,
  };
}

/**
 * A quote frame intentionally omits stable chart archives and the raw
 * three-second day. Reattach the previous read-only archive and, when the
 * natural day rolls, promote the completed minute authority locally. A later
 * save/ready barrier replaces this projection with the canonical archive.
 */
export function mergeMarketPublication(
  previous,
  next,
  options = {},
) {
  if (
    next?.publication === 'lzy_market_command_patch_v1' &&
    next?.publicationMode === 'command_delta'
  ) {
    return mergeCommandMarketPatch(previous, next);
  }
  if (
    next?.publication === 'lzy_market_level2_v1' &&
    next?.publicationMode === 'level2_delta'
  ) {
    return mergeLevel2Publication(previous, next, options);
  }
  const compactPublication =
    next?.publication === 'quote_frame_compact_v1' ||
    (
      next?.publication === 'lzy_market_public_v1' &&
      next?.publicationMode === 'quote_frame'
    );
  if (
    !next ||
    !compactPublication ||
    !next.symbols
  ) {
    return next;
  }
  const previousNowMs = Number(previous?.nowMs);
  const currentNowMs = Number(next.nowMs);
  const authorityNowMs =
    Number.isSafeInteger(previousNowMs) &&
    previousNowMs >= 0 &&
    Number.isSafeInteger(currentNowMs) &&
    currentNowMs >= 0
      ? Math.max(previousNowMs, currentNowMs)
      : Number.isSafeInteger(currentNowMs) && currentNowMs >= 0
        ? currentNowMs
        : Number.isSafeInteger(previousNowMs) && previousNowMs >= 0
          ? previousNowMs
          : 0;
  const authoritySequence = (record, publication) => {
    const value = Number(
      record?.authorityCommitSeq ??
        publication?.commitSeq,
    );
    return Number.isSafeInteger(value) && value >= 0
      ? value
      : -1;
  };
  const previousSymbols = previous?.symbols ?? {};
  const preferPriorCurrentSymbols = new Set();
  const symbols = Object.fromEntries(
    Object.entries(next.symbols).map(([symbol, publication]) => {
      const prior = previousSymbols[symbol] ?? {};
      const materializedPublication =
        publication.level2DepthDelta
          ? {
              ...publication,
              level2Depth: materializeLevel2Depth(
                prior.level2Depth,
                publication.level2DepthDelta,
              ),
            }
          : publication;
      const {
        level2DepthDelta: _level2DepthDelta,
        ...publicationWithoutLevel2Delta
      } = materializedPublication;
      const current =
        publicationWithoutLevel2Delta.level2Depth &&
        !Array.isArray(publicationWithoutLevel2Delta.bids) &&
        !Array.isArray(publicationWithoutLevel2Delta.asks)
          ? {
              ...publicationWithoutLevel2Delta,
              bids:
                publicationWithoutLevel2Delta.level2Depth.bids.slice(0, 10),
              asks:
                publicationWithoutLevel2Delta.level2Depth.asks.slice(0, 10),
            }
          : publicationWithoutLevel2Delta;
      const {
        ultraTradeDeltas,
        ...currentWithoutUltraDelta
      } = current;
      const priorMinutes = Array.isArray(prior.minuteBars)
        ? prior.minuteBars
        : [];
      const currentMinutes = Array.isArray(current.minuteBars)
        ? current.minuteBars
        : [];
      let archivedMinutes = mergeBarHistory(
        prior.archivedMinuteBars,
        current.archivedMinuteBars,
      );
      let dailyBars = mergeBarHistory(
        prior.dailyBars,
        current.dailyBars,
      );
      const priorDay = barNaturalDay(priorMinutes.at(-1));
      const currentDay = barNaturalDay(currentMinutes[0]);
      const clockOffsetMs =
        Number(
          next.marketClockOffsetMs ??
            previous?.marketClockOffsetMs,
        ) || 0;
      const crossedIntradayDomain =
        Number.isSafeInteger(previousNowMs) &&
        previousNowMs >= 0 &&
        Number.isSafeInteger(currentNowMs) &&
        currentNowMs >= previousNowMs &&
        deriveFixedIntradayTimeDomain(currentNowMs, {
          clockOffsetMs,
        }).startMs >
          deriveFixedIntradayTimeDomain(previousNowMs, {
            clockOffsetMs,
          }).startMs;
      if (
        priorMinutes.length > 0 &&
        currentMinutes.length > 0 &&
        (
          crossedIntradayDomain ||
          (
            priorDay !== null &&
            currentDay !== null &&
            currentDay > priorDay
          )
        )
      ) {
        archivedMinutes = mergeBarHistory(
          archivedMinutes,
          priorMinutes,
        ).slice(-MAX_CLIENT_MINUTE_ARCHIVE);
      }
      if (
        priorMinutes.length > 0 &&
        currentMinutes.length > 0 &&
        priorDay !== null &&
        currentDay !== null &&
        currentDay > priorDay
      ) {
        dailyBars = mergeBarHistory(
          dailyBars,
          aggregateBars(priorMinutes, NATURAL_DAY_MS),
        ).slice(-MAX_CLIENT_DAILY_ARCHIVE);
      }
      const preferPriorCurrent =
        authoritySequence(prior, previous) >
        authoritySequence(current, next);
      if (preferPriorCurrent) {
        preferPriorCurrentSymbols.add(symbol);
      }
      return [
        symbol,
        {
          ...(preferPriorCurrent
            ? {
                ...currentWithoutUltraDelta,
                ...prior,
              }
            : {
                ...prior,
                ...currentWithoutUltraDelta,
              }),
          intradayBars: mergeFixedIntradayHistory({
            previousBars: prior.intradayBars,
            currentBars: current.intradayBars,
            currentFrameBar: current.frameBar,
            nowMs: authorityNowMs,
            clockOffsetMs:
              Number(
                next.marketClockOffsetMs ??
                  previous?.marketClockOffsetMs,
              ) || 0,
          }),
          archivedMinuteBars: archivedMinutes,
          dailyBars,
          ultraTrades: mergeUltraTradeHistory(
            authorityNowMs,
            next.marketClockOffsetMs ??
              previous?.marketClockOffsetMs ??
              0,
            prior.ultraTrades,
            current.ultraTrades,
            ultraTradeDeltas,
          ),
        },
      ];
    }),
  );
  const nextSymbolSet = new Set(Object.keys(next.symbols));
  const activeOrders = Array.isArray(next.activeOrders)
    ? [
        ...(previous?.activeOrders ?? []).filter(
          (order) =>
            !nextSymbolSet.has(order.symbol) ||
            preferPriorCurrentSymbols.has(order.symbol),
        ),
        ...next.activeOrders.filter(
          (order) =>
            !preferPriorCurrentSymbols.has(order.symbol),
        ),
      ].sort(
        (left, right) =>
          Number(left.submittedMs) - Number(right.submittedMs) ||
          Number(left.sequence) - Number(right.sequence) ||
          String(left.id).localeCompare(String(right.id)),
      )
    : previous?.activeOrders;
  const accounts = {
    ...(previous?.accounts ?? {}),
    ...(next.accounts ?? {}),
  };
  let retainedPriorPlayerAccount = false;
  for (const [
    accountId,
    priorAccount,
  ] of Object.entries(previous?.accounts ?? {})) {
    const currentAccount = next.accounts?.[accountId];
    if (
      !currentAccount ||
      authoritySequence(priorAccount, previous) >
        authoritySequence(currentAccount, next)
    ) {
      accounts[accountId] = priorAccount;
      if (accountId === 'player') {
        retainedPriorPlayerAccount = true;
      }
    }
  }
  const previousCommitSeq = Number(previous?.commitSeq);
  const currentCommitSeq = Number(next.commitSeq);
  const priorTopLevelIsNewer =
    Number.isSafeInteger(previousCommitSeq) &&
    (
      !Number.isSafeInteger(currentCommitSeq) ||
      previousCommitSeq > currentCommitSeq
    );
  const retainedTrades = mergeRetainedPublicTrades(
    previous,
    next,
    next.trades,
    next.tradeDeltas,
  );
  return {
    ...next,
    nowMs: authorityNowMs,
    commitSeq:
      Number.isSafeInteger(previousCommitSeq) &&
      Number.isSafeInteger(currentCommitSeq)
        ? Math.max(previousCommitSeq, currentCommitSeq)
        : next.commitSeq ?? previous?.commitSeq,
    worldTick:
      Number.isSafeInteger(Number(previous?.worldTick)) &&
      Number.isSafeInteger(Number(next.worldTick))
        ? Math.max(
            Number(previous.worldTick),
            Number(next.worldTick),
          )
        : next.worldTick ?? previous?.worldTick,
    marketData:
      priorTopLevelIsNewer
        ? previous?.marketData
        : next.marketData ?? previous?.marketData,
    fundamentalNetwork:
      priorTopLevelIsNewer
        ? previous?.fundamentalNetwork
        : next.fundamentalNetwork ?? previous?.fundamentalNetwork,
    symbols,
    accounts,
    activeOrders,
    tradeRetention: retainedTrades.retention,
    trades: retainedTrades.trades,
    capacity:
      retainedPriorPlayerAccount
        ? previous?.capacity
        : next.capacity ?? previous?.capacity,
    quoteFrames: mergeQuoteFrameHistory({
      previousFrames: previous?.quoteFrames,
      currentFrames: next.quoteFrames,
      nowMs: authorityNowMs,
      clockOffsetMs:
        Number(
          next.marketClockOffsetMs ??
            previous?.marketClockOffsetMs,
        ) || 0,
    }),
  };
}

/**
 * Creates the sole main-thread facade for the full-world market authority.
 * Worker construction can be injected for tests; construction failure uses
 * the exact same controller through a structured-clone loopback port.
 */
export function createMarketClient({
  world,
  savedState = null,
  testingAccessOpen = false,
  onFrame = () => {},
  onRealtime = () => {},
  onWorld2D = () => {},
  onPaint = () => {},
  onReceipt = () => {},
  onError = () => {},
  workerFactory = defaultWorkerFactory,
  fallbackControllerOptions = {},
  documentTarget = globalThis.document ?? null,
  frameScheduler = defaultFrameScheduler,
  cancelFrame = defaultCancelFrame,
  wallNow = defaultWallNow,
  auditColdStore = undefined,
} = {}) {
  if (typeof testingAccessOpen !== 'boolean') {
    throw new TypeError(
      'testingAccessOpen must be a boolean.',
    );
  }
  if (
    typeof frameScheduler !== 'function' ||
    typeof cancelFrame !== 'function' ||
    typeof wallNow !== 'function'
  ) {
    throw new TypeError(
      'frameScheduler, cancelFrame and wallNow must be functions.',
    );
  }
  const resolvedAuditColdStore =
    auditColdStore === undefined
      ? createBrowserAuditColdStore()
      : auditColdStore;
  if (
    resolvedAuditColdStore !== null &&
    (
      typeof resolvedAuditColdStore !== 'object' ||
      typeof resolvedAuditColdStore.put !== 'function' ||
      typeof resolvedAuditColdStore.verifyCheckpoint !== 'function'
    )
  ) {
    throw new TypeError(
      'auditColdStore must provide put and verifyCheckpoint.',
    );
  }
  let worker = null;
  let workerCandidate = null;
  let fallback = false;
  try {
    workerCandidate = workerFactory();
    if (
      !workerCandidate ||
      typeof workerCandidate.postMessage !== 'function' ||
      typeof workerCandidate.addEventListener !== 'function'
    ) {
      throw new TypeError('Worker factory returned an invalid Worker.');
    }
    worker = workerCandidate;
  } catch {
    workerCandidate?.terminate?.();
    fallback = true;
    worker = createLoopbackWorker(fallbackControllerOptions);
  }

  let destroyed = false;
  let failedError = null;
  let readyReceived = false;
  let desiredPlaying = false;
  let resumeAfterVisibility = false;
  let nextRequestSequence = 1;
  let initRequestId = null;
  let fallbackAttempted = fallback;
  let pendingFrameMessage = null;
  let pendingRealtimeMessage = null;
  let pendingWorld2DMessage = null;
  let renderDrainWaiters = [];
  let renderScheduled = false;
  let renderHandle = null;
  let realtimeStreamId = null;
  let realtimeSequence = 0;
  let realtimeResyncPending = false;
  const realtimeSymbolFingerprints = new Map();
  let lastRealtimeMaterializationFingerprint = null;
  let latestDerivativesAuthority = null;
  let derivativesResyncPending = false;
  let latestMarketPublication = null;
  // Quote-frame depth deltas are chained to the last quote transport that the
  // Worker posted, not to whichever newer command, save or realtime
  // publication currently wins the semantic market projection. A
  // SAVE_BARRIER can publish a newer full snapshot while older fixed quote
  // endpoints are still draining under publication credit. Keeping this
  // transport baseline separate lets those endpoints materialize exactly;
  // mergeMarketPublication then independently retains the newest authority.
  const quoteDepthBaselines = new Map();
  // Public quote/command publications must never be accumulated on top of the
  // canonical INIT/SAVE world. The canonical state is intentionally private;
  // this accumulator is only for the redacted public projection.
  let latestWorldAuthority = null;
  const pending = new Map();
  const pendingAuditColdWrites = new Set();
  let auditColdFailure = null;

  function persistAuditColdRecord(message) {
    if (
      message?.schema !== AUDIT_COLD_TRANSPORT_SCHEMA ||
      !resolvedAuditColdStore
    ) {
      failClosed(
        new Error(
          'Realtime-audit cold storage transport is unavailable.',
        ),
      );
      return;
    }
    let operation;
    operation = Promise.resolve()
      .then(() => resolvedAuditColdStore.put(message.record))
      .catch((error) => {
        auditColdFailure =
          error instanceof Error
            ? error
            : new Error(String(error));
        failClosed(auditColdFailure);
      })
      .finally(() => {
        pendingAuditColdWrites.delete(operation);
      });
    pendingAuditColdWrites.add(operation);
  }

  async function flushAuditColdWrites() {
    while (pendingAuditColdWrites.size > 0) {
      await Promise.all([...pendingAuditColdWrites]);
    }
    if (auditColdFailure) throw auditColdFailure;
  }

  function mergePublicWorldAuthority(envelope) {
    const merged = mergeWorldAuthorityPublication(
      latestWorldAuthority,
      envelope,
    );
    const {
      clues: _clues,
      facts: _facts,
      memories: _memories,
      narratives: _narratives,
      eventLog: _eventLog,
      ledger: _ledger,
      ...publicState
    } = merged ?? {};
    return publicState;
  }

  function ensureActive() {
    if (destroyed) throw new Error('Market client has been destroyed.');
    if (failedError) throw failedError;
  }

  function reportTransportError(error) {
    try {
      onError(error);
    } catch {
      // A consumer callback cannot compromise client lifecycle cleanup.
    }
  }

  function safelyObserve(callback, ...args) {
    try {
      callback(...args);
    } catch (error) {
      reportTransportError(error);
    }
  }

  function requestPublicationCredit() {
    try {
      worker.postMessage({
        type: 'MARKET_PUBLICATION_CREDIT',
        schema: PUBLICATION_CREDIT_SCHEMA,
        maxInFlightPerKind: 1,
      });
    } catch (error) {
      reportTransportError(error);
    }
  }

  function acknowledgePublication(message) {
    if (
      destroyed ||
      message?.publicationCreditSchema !==
        PUBLICATION_CREDIT_SCHEMA ||
      typeof message.publicationId !== 'string' ||
      (
        message.publicationKind !== 'level2' &&
        message.publicationKind !== 'quote_frame'
      )
    ) {
      return;
    }
    try {
      worker.postMessage({
        type: 'MARKET_PUBLICATION_ACK',
        publicationCreditSchema: PUBLICATION_CREDIT_SCHEMA,
        publicationKind: message.publicationKind,
        publicationId: message.publicationId,
      });
    } catch (error) {
      reportTransportError(error);
    }
  }

  function settle(message, error = null) {
    const entry = pending.get(message.requestId);
    if (!entry) return;
    pending.delete(message.requestId);
    if (error) {
      entry.reject(error);
      return;
    }
    try {
      entry.resolve(entry.transform(message));
    } catch (transformError) {
      entry.reject(transformError);
    }
  }

  function flushRender() {
    renderScheduled = false;
    renderHandle = null;
    const realtimeMessage = pendingRealtimeMessage;
    const frameMessage = pendingFrameMessage;
    const world2dMessage = pendingWorld2DMessage;
    pendingRealtimeMessage = null;
    pendingFrameMessage = null;
    pendingWorld2DMessage = null;
    if (destroyed || failedError) {
      const waiters = renderDrainWaiters;
      renderDrainWaiters = [];
      for (const resolve of waiters) resolve();
      return;
    }
    const wallPaintedAt = wallNow();
    if (frameMessage) {
      safelyObserve(
        onFrame,
        frameMessage.frame,
        frameMessage.market,
        frameMessage.market?.derivatives ??
          frameMessage.derivativesPatch ??
          null,
      );
      safelyObserve(onPaint, {
        kind: 'quote_frame',
        streamId: frameMessage.streamId ?? null,
        streamSequence: frameMessage.sequence ?? null,
        wallPaintedAt,
        wallPublishedAt:
          frameMessage.wallPublishedAt ??
          frameMessage.market?.wallPublishedAt ??
          null,
        latestPublicationMs:
          frameMessage.publicationMs ??
          frameMessage.market?.publicationMs ??
          frameMessage.frame?.virtualMs ??
          null,
        latestEventMs:
          frameMessage.latestEventMs ??
          frameMessage.market?.latestEventMs ??
          null,
        latestSequence:
          frameMessage.latestSequence ??
          frameMessage.market?.latestSequence ??
          null,
      });
      acknowledgePublication(frameMessage);
    }
    if (realtimeMessage) {
      const realtimeMarket = marketPublicationSupersedes(
        latestMarketPublication,
        realtimeMessage.market,
      )
        ? latestMarketPublication
        : realtimeMessage.market;
      safelyObserve(
        onRealtime,
        realtimeMessage,
        realtimeMarket,
      );
      safelyObserve(onPaint, {
        kind: 'level2',
        streamId: realtimeMessage.streamId ?? null,
        streamSequence: realtimeMessage.sequence ?? null,
        authorityTrace:
          realtimeMessage.authorityTrace === undefined
            ? null
            : cloneValue(realtimeMessage.authorityTrace),
        clientTrace:
          realtimeMessage.clientTrace === undefined
            ? null
            : cloneValue(realtimeMessage.clientTrace),
        wallPaintedAt,
        wallPublishedAt:
          realtimeMessage.wallPublishedAt ??
          realtimeMessage.market?.wallPublishedAt ??
          null,
        latestPublicationMs:
          realtimeMessage.publicationMs ??
          realtimeMessage.market?.publicationMs ??
          realtimeMessage.market?.nowMs ??
          null,
        latestEventMs:
          realtimeMessage.latestEventMs ??
          realtimeMessage.market?.latestEventMs ??
          null,
        latestSequence:
          realtimeMessage.latestSequence ??
          realtimeMessage.market?.latestSequence ??
          realtimeMessage.sequence ??
          null,
      });
      acknowledgePublication(realtimeMessage);
    }
    if (world2dMessage) {
      safelyObserve(
        onWorld2D,
        world2dMessage.world?.state ?? latestWorldAuthority,
        world2dMessage,
      );
      safelyObserve(onPaint, {
        kind: 'world2d',
        authorityTrace:
          world2dMessage.authorityTrace === undefined
            ? null
            : cloneValue(world2dMessage.authorityTrace),
        wallPaintedAt,
        wallPublishedAt:
          world2dMessage.wallPublishedAt ?? null,
        latestPublicationMs:
          world2dMessage.world?.state?.experience?.world2d
            ?.authorityNowMs ?? null,
        latestEventMs:
          world2dMessage.authorityTrace?.scheduledMs ?? null,
        latestSequence:
          world2dMessage.world?.commitSeq ?? null,
      });
    }
    const waiters = renderDrainWaiters;
    renderDrainWaiters = [];
    for (const resolve of waiters) resolve();
  }

  function waitForRenderDrain() {
    if (
      !renderScheduled &&
      !pendingFrameMessage &&
      !pendingRealtimeMessage &&
      !pendingWorld2DMessage
    ) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      renderDrainWaiters.push(resolve);
    });
  }

  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    try {
      renderHandle = frameScheduler(flushRender);
    } catch (error) {
      renderScheduled = false;
      renderHandle = null;
      reportTransportError(error);
      flushRender();
    }
  }

  function scheduleFrame(message) {
    pendingFrameMessage = message;
    scheduleRender();
  }

  function scheduleRealtime(message) {
    pendingRealtimeMessage = message;
    scheduleRender();
  }

  function scheduleWorld2D(message) {
    pendingWorld2DMessage = message;
    scheduleRender();
  }

  function cancelRenderIfIdle() {
    if (
      pendingFrameMessage ||
      pendingRealtimeMessage ||
      pendingWorld2DMessage
    ) return;
    if (renderScheduled && renderHandle !== null) {
      try {
        cancelFrame(renderHandle);
      } catch {
        // Cancellation failure cannot revive or mutate the authority.
      }
    }
    renderScheduled = false;
    renderHandle = null;
  }

  function cancelPendingFrame() {
    const message = pendingFrameMessage;
    pendingFrameMessage = null;
    acknowledgePublication(message);
    cancelRenderIfIdle();
  }

  function cancelPendingRealtime() {
    const message = pendingRealtimeMessage;
    pendingRealtimeMessage = null;
    acknowledgePublication(message);
    cancelRenderIfIdle();
  }

  function cancelPendingWorld2D() {
    pendingWorld2DMessage = null;
    cancelRenderIfIdle();
  }

  function marketPublicationSupersedes(nextMarket, pendingMarket) {
    if (!nextMarket || !pendingMarket) return false;
    const nextNowMs = Number(nextMarket.nowMs);
    const pendingNowMs = Number(pendingMarket.nowMs);
    const nextCommitSeq = Number(nextMarket.commitSeq);
    const pendingCommitSeq = Number(pendingMarket.commitSeq);
    return (
      nextNowMs > pendingNowMs ||
      (
        nextNowMs === pendingNowMs &&
        nextCommitSeq >= pendingCommitSeq
      )
    );
  }

  function supersedePendingRender(message) {
    if (
      message?.type === 'COMMAND_ACK' &&
      (
        message.receipt?.type === 'submit_order' ||
        message.receipt?.type === 'cancel_order'
      )
    ) {
      // The Worker deliberately sends the ordered Level-2 delta before the
      // acknowledgement. The receipt may carry a same-commit account snapshot,
      // but it must not erase the already accepted book/trade publication or
      // its user-observed paint receipt.
      return;
    }
    const nextMarket = message?.market;
    const pendingMarket = pendingFrameMessage?.market;
    const pendingRealtimeMarket = pendingRealtimeMessage?.market;
    if (marketPublicationSupersedes(nextMarket, pendingMarket)) {
      cancelPendingFrame();
    }
    if (
      marketPublicationSupersedes(
        nextMarket,
        pendingRealtimeMarket,
      )
    ) {
      cancelPendingRealtime();
    }
  }

  function noteFullDerivativesAuthority(publication) {
    if (
      publication?.publication !==
      'lzy_derivatives_public_v1'
    ) {
      return;
    }
    const merged = mergeDerivativesAuthorityPublication(
      latestDerivativesAuthority,
      publication,
      {
        commitSeq: publication.authorityCommitSeq,
        nowMs: publication.authorityNowMs,
      },
    );
    if (merged !== latestDerivativesAuthority) {
      latestDerivativesAuthority = merged;
      if (
        publication.publicationMode === 'snapshot' ||
        publication.publicationMode === 'cadence_full'
      ) {
        derivativesResyncPending = false;
      }
      return;
    }
    if (!publication.publicationMode) {
      latestDerivativesAuthority = {
        ...latestDerivativesAuthority,
        ...publication,
      };
    }
  }

  function acceptDerivativesPatch(message) {
    const patch = message?.derivativesPatch;
    if (
      patch?.publication !==
      'lzy_derivatives_public_v1'
    ) {
      return latestDerivativesAuthority;
    }
    const previous = latestDerivativesAuthority;
    const merged = mergeDerivativesAuthorityPublication(
      previous,
      patch,
      {
        commitSeq:
          message.market?.commitSeq ??
          message.marketPatch?.commitSeq ??
          message.commitSeq,
        nowMs:
          message.market?.nowMs ??
          message.marketPatch?.nowMs ??
          patch.authorityNowMs,
      },
    );
    if (merged !== previous) {
      latestDerivativesAuthority = merged;
      if (
        patch.publicationMode === 'snapshot' ||
        patch.publicationMode === 'cadence_full'
      ) {
        derivativesResyncPending = false;
      }
      return merged;
    }
    const previousSequence = Number(previous?.sequence);
    const patchSequence = Number(patch.sequence);
    if (
      Number.isSafeInteger(previousSequence) &&
      Number.isSafeInteger(patchSequence) &&
      patchSequence <= previousSequence
    ) {
      return previous;
    }
    requestDerivativesResync(patch);
    return previous;
  }

  function handleMessage({ data }) {
    if (destroyed || failedError) return;
    if (data?.type === 'AUDIT_COLD_RECORD') {
      persistAuditColdRecord(data);
      return;
    }
    let message = data;
    const level2WallReceivedAt =
      message?.type === 'LEVEL2_UPDATE'
        ? wallNow()
        : null;
    if (
      message?.world?.state &&
      (
        message.world.publication ===
          'lzy_world_public_v1' ||
        message.type === 'READY'
      )
    ) {
      noteFullDerivativesAuthority(
        message.world.state.derivatives,
      );
      latestWorldAuthority =
        mergePublicWorldAuthority(message.world);
    }
    if (
      message?.worldPatch?.publication ===
        'lzy_world_public_v1' &&
      message.worldPatch.state
    ) {
      latestWorldAuthority =
        mergePublicWorldAuthority(
          message.worldPatch,
        );
      message = {
        ...message,
        world: {
          publication: message.worldPatch.publication,
          publicationMode:
            message.worldPatch.publicationMode,
          commitSeq: message.worldPatch.commitSeq,
          state: latestWorldAuthority,
        },
      };
    }
    if (message?.type === 'WORLD2D_UPDATE') {
      scheduleWorld2D(message);
      return;
    }
    const directMarket = message?.market;
    if (message?.type === 'QUOTE_FRAME' && directMarket) {
      message = {
        ...message,
        market: materializeQuoteDepthTransport(
          quoteDepthBaselines,
          directMarket,
        ),
      };
    } else if (
      message?.type !== 'LEVEL2_UPDATE' &&
      directMarket?.symbols
    ) {
      replaceQuoteDepthBaselines(
        quoteDepthBaselines,
        directMarket,
      );
    }
    if (message?.marketPatch) {
      const market = mergeMarketPublication(
        latestMarketPublication,
        message.marketPatch,
      );
      latestMarketPublication = market;
      message = { ...message, market };
    }
    if (message?.derivativesPatch && message?.market) {
      const derivatives = acceptDerivativesPatch(message);
      message = {
        ...message,
        market: {
          ...message.market,
          derivativesPatch: message.derivativesPatch,
          ...(derivatives ? { derivatives } : {}),
        },
      };
    }
    if (message?.type === 'LEVEL2_UPDATE') {
      const sequence = Number(message.sequence);
      const previousSequence =
        message.previousSequence === null
          ? null
          : Number(message.previousSequence);
      const validSequence =
        Number.isSafeInteger(sequence) && sequence >= 1;
      if (!validSequence || typeof message.streamId !== 'string') {
        return;
      }
      if (message.resync !== true) {
        if (realtimeStreamId === null) {
          if (sequence !== 1 || previousSequence !== 0) {
            requestRealtimeResync(message);
            return;
          }
        }
        if (
          realtimeStreamId !== null &&
          message.streamId !== realtimeStreamId
        ) {
          requestRealtimeResync(message);
          return;
        }
        if (sequence <= realtimeSequence) return;
        if (previousSequence !== realtimeSequence) {
          requestRealtimeResync(message);
          return;
        }
      }
      let market;
      try {
        market = mergeMarketPublication(
          latestMarketPublication,
          message.market,
          { resync: message.resync === true },
        );
      } catch {
        requestRealtimeResync(message);
        return;
      }
      realtimeStreamId = message.streamId;
      realtimeSequence = sequence;
      if (message.resync === true) {
        realtimeResyncPending = false;
      }
      latestMarketPublication = market;
      for (const symbol of Object.keys(
        message.market?.symbols ?? {},
      )) {
        realtimeSymbolFingerprints.set(
          symbol,
          level2SymbolFingerprint(
            symbol,
            market.symbols?.[symbol],
          ),
        );
      }
      const materializationFingerprint =
        globalLevel2MaterializationFingerprint(
          realtimeSymbolFingerprints,
        );
      const clientTrace = {
        schema: 'lzy_level2_client_trace_v1',
        wallReceivedAt: level2WallReceivedAt,
        wallMaterializedAt: wallNow(),
        integerMillisecondAuthority:
          Number.isSafeInteger(
            Number(message.publicationMs),
          ) &&
          Number.isSafeInteger(
            Number(message.latestEventMs),
          ) &&
          (
            message.authorityTrace?.eligibleEvents ?? []
          ).every((event) =>
            Number.isSafeInteger(event?.virtualMs),
          ),
        materializationFingerprint,
        distinctFromPreviousMaterialization:
          materializationFingerprint !==
          lastRealtimeMaterializationFingerprint,
      };
      lastRealtimeMaterializationFingerprint =
        materializationFingerprint;
      scheduleRealtime({
        ...message,
        market,
        clientTrace,
      });
      return;
    }
    if (message?.market) {
      const market = mergeMarketPublication(
        latestMarketPublication,
        message.market,
      );
      latestMarketPublication = market;
      if (market !== message.market) {
        message = { ...message, market };
      }
    }
    if (message.type === 'READY') {
      readyReceived = true;
      realtimeStreamId = null;
      realtimeSequence = 0;
      realtimeResyncPending = false;
      requestPublicationCredit();
    }
    if (message.type === 'QUOTE_FRAME') {
      scheduleFrame(message);
      return;
    }
    supersedePendingRender(message);
    if (
      message.type === 'COMMAND_ACK' &&
      message.requestType === 'PAUSE' &&
      message.frame &&
      message.market
    ) {
      scheduleFrame({
        ...message,
        type: 'QUOTE_FRAME',
      });
    }
    if (message.type === 'ERROR') {
      const error = asError(message);
      reportTransportError(error);
      settle(message, error);
      return;
    }
    if (message.type === 'COMMAND_ACK' && message.receipt) {
      const publication = commandReceipt(message);
      const entry = pending.get(message.requestId);
      if (entry) {
        pending.delete(message.requestId);
        entry.resolve(publication);
      }
      // Receipt observers commonly reconcile a dense market stage. Keep that
      // presentation work behind the command-promise boundary so a large DOM
      // cannot hold the authoritative acknowledgement hostage. The observer
      // still runs in the same task turn, before the browser may paint.
      queueMicrotask(() => {
        safelyObserve(onReceipt, publication);
      });
      return;
    }
    settle(message);
  }

  function requestRealtimeResync(message) {
    if (realtimeResyncPending || destroyed || failedError) return;
    realtimeResyncPending = true;
    try {
      worker.postMessage({
        type: 'MARKET_DATA_RESYNC',
        requestId: `market_request_${nextRequestSequence++}`,
        streamId: message?.streamId ?? realtimeStreamId,
        afterSequence: realtimeSequence,
        afterVirtualMs:
          Number(latestMarketPublication?.nowMs) || 0,
      });
    } catch (error) {
      realtimeResyncPending = false;
      reportTransportError(error);
    }
  }

  function requestDerivativesResync(patch) {
    if (
      derivativesResyncPending ||
      destroyed ||
      failedError
    ) {
      return;
    }
    derivativesResyncPending = true;
    try {
      worker.postMessage({
        type: 'DERIVATIVES_PUBLICATION_RESYNC',
        requestId: `market_request_${nextRequestSequence++}`,
        streamId:
          patch?.streamId ??
          latestDerivativesAuthority?.streamId ??
          null,
        afterSequence:
          Number(latestDerivativesAuthority?.sequence) || 0,
      });
    } catch (error) {
      derivativesResyncPending = false;
      reportTransportError(error);
    }
  }

  function eventError(event) {
    if (event?.error instanceof Error) return event.error;
    const kind = event?.type || 'error';
    return new Error(
      event?.message || `Market Worker transport ${kind} event.`,
    );
  }

  function attachWorker(target) {
    target.addEventListener('message', handleMessage);
    target.addEventListener('error', handleTransportFailure);
    target.addEventListener('messageerror', handleTransportFailure);
  }

  function detachWorker(target) {
    target.removeEventListener?.('message', handleMessage);
    target.removeEventListener?.('error', handleTransportFailure);
    target.removeEventListener?.('messageerror', handleTransportFailure);
  }

  function rawPause(target) {
    if (!desiredPlaying || !readyReceived) return;
    try {
      target.postMessage({
        type: 'PAUSE',
        requestId: `market_request_${nextRequestSequence++}`,
      });
    } catch {
      // The transport may already be unavailable; termination remains final.
    }
  }

  function rejectAll(error) {
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  }

  function failClosed(error) {
    if (destroyed || failedError) return;
    failedError = new Error(
      `Market Worker transport failed: ${error.message}`,
      { cause: error },
    );
    resumeAfterVisibility = false;
    cancelPendingFrame();
    cancelPendingRealtime();
    cancelPendingWorld2D();
    documentTarget?.removeEventListener?.(
      'visibilitychange',
      visibilityChanged,
    );
    detachWorker(worker);
    rawPause(worker);
    desiredPlaying = false;
    worker.terminate?.();
    rejectAll(failedError);
    reportTransportError(failedError);
  }

  function handleTransportFailure(event) {
    event?.preventDefault?.();
    if (destroyed || failedError) return;
    const error = eventError(event);
    if (!readyReceived && !fallbackAttempted) {
      fallbackAttempted = true;
      reportTransportError(error);
      const failedWorker = worker;
      detachWorker(failedWorker);
      failedWorker.terminate?.();
      fallback = true;
      try {
        worker = createLoopbackWorker(fallbackControllerOptions);
        attachWorker(worker);
        const initEntry = pending.get(initRequestId);
        if (!initEntry) {
          throw new Error('Initial market request is no longer pending.');
        }
        worker.postMessage(cloneValue(initEntry.envelope));
      } catch (fallbackError) {
        failClosed(fallbackError);
      }
      return;
    }
    failClosed(error);
  }

  attachWorker(worker);

  function send(type, payload = {}, transform = (message) => message) {
    try {
      ensureActive();
    } catch (error) {
      return Promise.reject(error);
    }
    const requestId = `market_request_${nextRequestSequence++}`;
    const envelope = cloneValue({
      type,
      requestId,
      ...payload,
    });
    if (type === 'INIT') initRequestId = requestId;
    return new Promise((resolve, reject) => {
      pending.set(requestId, {
        resolve,
        reject,
        transform,
        envelope,
      });
      try {
        worker.postMessage(cloneValue(envelope));
      } catch (error) {
        handleTransportFailure({
          type: 'postmessage',
          message: error?.message,
          error,
        });
      }
    });
  }

  const initPayload = {
    world: cloneValue(world),
    savedState:
      savedState && cloneValue(savedState),
    testingAccessOpen,
  };
  const beginInit = (verifiedReferences = null) =>
    send(
      'INIT',
      {
        ...initPayload,
        ...(verifiedReferences
          ? {
              auditColdTransport: {
                schema: AUDIT_COLD_TRANSPORT_SCHEMA,
                verifiedReferences,
              },
            }
          : {}),
      },
      (message) => ({ ...message, fallback }),
    );
  const ready = resolvedAuditColdStore
    ? Promise.resolve()
        .then(() =>
          savedState
            ? resolvedAuditColdStore.verifyCheckpoint(savedState)
            : [],
        )
        .then(beginInit)
    : beginInit();

  function visibilityChanged() {
    if (destroyed) return;
    if (documentTarget.hidden) {
      resumeAfterVisibility = desiredPlaying;
      if (desiredPlaying) {
        void send('PAUSE', { discardElapsed: true }).catch(() => {});
      }
      return;
    }
    if (resumeAfterVisibility) {
      resumeAfterVisibility = false;
      void send('PLAY').catch(() => {});
    }
  }

  documentTarget?.addEventListener?.(
    'visibilitychange',
    visibilityChanged,
  );

  const preservedOptions = {
    testingAccessOpen,
    onFrame,
    onRealtime,
    onWorld2D,
    onPaint,
    onReceipt,
    onError,
    workerFactory,
    fallbackControllerOptions,
    documentTarget,
    frameScheduler,
    cancelFrame,
    wallNow,
    auditColdStore: resolvedAuditColdStore,
  };
  let clientApi = null;
  clientApi = Object.freeze({
    ready,

    async play() {
      ensureActive();
      await ready;
      desiredPlaying = true;
      if (documentTarget?.hidden) {
        resumeAfterVisibility = true;
        return { type: 'COMMAND_ACK', requestType: 'PLAY', deferred: true };
      }
      return send('PLAY');
    },

    async pause() {
      ensureActive();
      await ready;
      desiredPlaying = false;
      resumeAfterVisibility = false;
      const acknowledgement = await send('PAUSE');
      await waitForRenderDrain();
      return acknowledgement;
    },

    async setSpeed(speed) {
      ensureActive();
      await ready;
      return send('SET_SPEED', { speed });
    },

    async stepFrame() {
      ensureActive();
      await ready;
      desiredPlaying = false;
      resumeAfterVisibility = false;
      return send('STEP_FRAME');
    },

    worldCommand(command) {
      ensureActive();
      const dispatch = () =>
        send(
          'WORLD_COMMAND',
          { command: cloneValue(command) },
          commandReceipt,
        );
      return readyReceived
        ? dispatch()
        : ready.then(dispatch);
    },

    async advanceWorldDays(days) {
      ensureActive();
      assertWorldDays(days);
      await ready;
      desiredPlaying = false;
      resumeAfterVisibility = false;
      return send('ADVANCE_WORLD_DAYS', { days });
    },

    async advanceVirtualTime(durationMs) {
      ensureActive();
      assertVirtualDuration(durationMs);
      await ready;
      desiredPlaying = false;
      resumeAfterVisibility = false;
      return send('ADVANCE_VIRTUAL_TIME', { durationMs });
    },

    async saveBarrier() {
      ensureActive();
      await ready;
      return send(
        'SAVE_BARRIER',
        {},
        async (message) => {
          await flushAuditColdWrites();
          return message;
        },
      );
    },

    async replaceWorld({
      world: replacementWorld,
      savedState: replacementSavedState = null,
    } = {}) {
      ensureActive();
      if (!replacementWorld) {
        throw new TypeError('replaceWorld requires a world.');
      }
      await clientApi.destroy();
      const replacement = createMarketClient({
        ...preservedOptions,
        world: replacementWorld,
        savedState: replacementSavedState,
      });
      try {
        await replacement.ready;
        return replacement;
      } catch (error) {
        await replacement.destroy();
        throw error;
      }
    },

    async destroy() {
      if (destroyed) return;
      destroyed = true;
      resumeAfterVisibility = false;
      cancelPendingFrame();
      cancelPendingRealtime();
      cancelPendingWorld2D();
      documentTarget?.removeEventListener?.(
        'visibilitychange',
        visibilityChanged,
      );
      detachWorker(worker);
      rawPause(worker);
      desiredPlaying = false;
      worker.terminate?.();
      const error = new Error('Market client has been destroyed.');
      rejectAll(error);
    },
  });
  return clientApi;
}

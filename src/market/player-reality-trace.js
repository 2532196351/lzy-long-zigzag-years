import { deriveMarketChartSeries } from './bars.js?v=20260804-01';

export const PLAYER_REALITY_TRACE_SCHEMA =
  'lzy_market_player_reality_trace_v1';

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function canonicalCheckpointHash(value) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError(
      'a JSON-serializable canonical checkpoint is required',
    );
  }
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

function pointRecord(
  point,
  intervalMs,
  nowMs,
  {
    timeframe,
    index,
    pointCount,
  },
) {
  const endpointMs = Number(point.timeMs);
  const ultra = timeframe === 'ultra';
  return {
    bucketId:
      !ultra &&
      Number.isSafeInteger(intervalMs) &&
      intervalMs > 0
        ? Math.floor((endpointMs - 1) / intervalMs)
        : null,
    eventId:
      ultra && point.firstTradeId !== null &&
      point.firstTradeId !== undefined
        ? String(point.firstTradeId)
        : null,
    x: endpointMs,
    y: point.priceTicks,
    volume: point.volume,
    turnover: point.turnoverTicks,
    averagePriceTicks: point.averagePriceTicks ?? null,
    vwapNumerator:
      point.cumulativeTurnoverTicks ?? null,
    vwapDenominator:
      point.cumulativeVolume ?? null,
    closed:
      ultra
        ? index < pointCount - 1
        : endpointMs <= nowMs,
    hasTrade: point.hasTrade === true,
    firstTradeId: point.firstTradeId ?? null,
    lastTradeId: point.lastTradeId ?? null,
  };
}

export function createPlayerRealityTrace({
  symbol = null,
  createdAtMs = 0,
} = {}) {
  return {
    schema: PLAYER_REALITY_TRACE_SCHEMA,
    symbol,
    createdAtMs,
    entries: [],
  };
}

export function recordPlayerRealityPublication(
  trace,
  {
    kind = 'publication',
    snapshot,
    symbol = trace?.symbol,
    timeframe = 'intraday',
    mode = timeframe,
    inputTrades = [],
    publication = null,
    paint = null,
    checkpoint = null,
    transition = null,
    saveCheckpoint = null,
    reloadCheckpoint = null,
  } = {},
) {
  if (trace?.schema !== PLAYER_REALITY_TRACE_SCHEMA) {
    throw new TypeError('a player-reality trace is required');
  }
  if (!snapshot || typeof snapshot !== 'object') {
    throw new TypeError('an authoritative market snapshot is required');
  }
  const series = deriveMarketChartSeries(snapshot, symbol, timeframe);
  const nowMs = Number(snapshot.nowMs) || 0;
  const publicationRecord = {
    entitlement: publication?.entitlement ?? null,
    board: publication?.board ?? null,
    speed: publication?.speed ?? null,
    publicationMs:
      publication?.publicationMs ??
      publication?.visiblePublicationTimeMs ??
      nowMs,
    wallPublishedAt:
      publication?.wallPublishedAt ?? null,
    sourceEventIds: safeArray(
      publication?.sourceEventIds,
    ).map(String),
    latestEventMs:
      publication?.latestEventMs ??
      publication?.authoritativeEventTimeMs ??
      nowMs,
    latestSequence:
      publication?.latestSequence ?? null,
  };
  const paintRecord = paint
    ? {
        wallPaintedAt: paint.wallPaintedAt ?? null,
        latestPublicationMs:
          paint.latestPublicationMs ?? null,
        latestEventMs:
          paint.latestEventMs ?? null,
        latestSequence: paint.latestSequence ?? null,
      }
    : null;
  const transitionRecord =
    transition && typeof transition === 'object'
      ? clone(transition)
      : (
          saveCheckpoint !== null ||
          reloadCheckpoint !== null
        )
        ? {}
        : null;
  if (transitionRecord && saveCheckpoint !== null) {
    transitionRecord.saveHash =
      canonicalCheckpointHash(saveCheckpoint);
  }
  if (transitionRecord && reloadCheckpoint !== null) {
    transitionRecord.reloadHash =
      canonicalCheckpointHash(reloadCheckpoint);
  }
  const entry = {
    sequence: trace.entries.length + 1,
    kind,
    symbol,
    mode,
    timeframe,
    authoritativeEventTimeMs:
      publicationRecord.latestEventMs,
    visiblePublicationTimeMs:
      publicationRecord.publicationMs,
    paintTimeMs:
      paintRecord?.wallPaintedAt ??
      publication?.paintTimeMs ??
      null,
    publication: publicationRecord,
    paint: paintRecord,
    commitSeq: snapshot.commitSeq ?? null,
    domain: clone(series.domain),
    inputs: safeArray(inputTrades).map(clone),
    points: safeArray(series.points).map((point, index, points) =>
      pointRecord(
        point,
        series.intervalMs,
        nowMs,
        {
          timeframe,
          index,
          pointCount: points.length,
        },
      ),
    ),
    bars: safeArray(series.bars).map(clone),
    movingAveragePeriods: safeArray(
      series.movingAveragePeriods,
    ).map(Number),
    adjustmentBasis:
      series.adjustmentBasis ?? null,
    save: checkpoint
      ? {
          commitSeq: checkpoint.commitSeq ?? null,
          nowMs: checkpoint.nowMs ?? null,
        }
      : null,
    transition: transitionRecord,
  };
  trace.entries.push(entry);
  return entry;
}

export function assertPlayerRealityTrace(trace) {
  const errors = [];
  if (trace?.schema !== PLAYER_REALITY_TRACE_SCHEMA) {
    return { ok: false, errors: ['INVALID_TRACE_SCHEMA'] };
  }
  let previousPublicationMs = -1;
  let previousEventMs = -1;
  let previousSequence = -1;
  let previousWallPaintedAt = -1;
  let previousCommitSeq = -1;
  const domainStateByScope = new Map();
  let previousEntry = null;
  for (const entry of safeArray(trace.entries)) {
    const publication = entry.publication ?? {
      publicationMs: entry.visiblePublicationTimeMs,
      latestEventMs: entry.authoritativeEventTimeMs,
      latestSequence: null,
      sourceEventIds: [],
      wallPublishedAt: null,
      entitlement: null,
      speed: null,
    };
    const paint = entry.paint ?? (
      entry.paintTimeMs === null ||
      entry.paintTimeMs === undefined
        ? null
        : {
            wallPaintedAt: entry.paintTimeMs,
            latestPublicationMs:
              entry.visiblePublicationTimeMs,
            latestEventMs:
              entry.authoritativeEventTimeMs,
            latestSequence:
              publication.latestSequence,
          }
    );
    if (
      !Number.isSafeInteger(publication.publicationMs) ||
      publication.publicationMs < previousPublicationMs
    ) {
      errors.push(`PUBLICATION_TIME_REGRESSION:${entry.sequence}`);
    }
    if (
      !Number.isSafeInteger(publication.latestEventMs) ||
      publication.latestEventMs < previousEventMs
    ) {
      errors.push(`EVENT_TIME_REGRESSION:${entry.sequence}`);
    }
    if (
      Number.isSafeInteger(publication.latestSequence) &&
      publication.latestSequence < previousSequence
    ) {
      errors.push(`EVENT_SEQUENCE_REGRESSION:${entry.sequence}`);
    }
    if (
      Number.isSafeInteger(entry.commitSeq) &&
      entry.commitSeq < previousCommitSeq
    ) {
      errors.push(`COMMIT_REGRESSION:${entry.sequence}`);
    }
    const xs = entry.points.map((point) => point.x);
    if (
      xs.some(
        (x, index) =>
          index > 0 &&
          (
            entry.timeframe === 'ultra'
              ? x < xs[index - 1]
              : x <= xs[index - 1]
          ),
      )
    ) {
      errors.push(`NON_MONOTONIC_X:${entry.sequence}`);
    }
    const scopeKey = `${entry.symbol}:${entry.timeframe}`;
    let domainState = domainStateByScope.get(scopeKey);
    if (domainState?.domainStartMs === entry.domain?.startMs) {
      const currentEarliestX = xs[0] ?? null;
      if (
        currentEarliestX !== null &&
        domainState.earliestVisibleX !== null &&
        currentEarliestX > domainState.earliestVisibleX
      ) {
        errors.push(`LEFT_EDGE_HISTORY_LOSS:${entry.sequence}`);
      }
      if (
        currentEarliestX !== null &&
        (
          domainState.earliestVisibleX === null ||
          currentEarliestX < domainState.earliestVisibleX
        )
      ) {
        domainState.earliestVisibleX = currentEarliestX;
      }
    } else {
      domainState = {
        domainStartMs: entry.domain?.startMs ?? null,
        earliestVisibleX: entry.points[0]?.x ?? null,
        closedByBucket: new Map(),
        closedUltraByEvent: new Map(),
        previousClosedUltraEventIds: [],
      };
      domainStateByScope.set(scopeKey, domainState);
    }
    if (entry.timeframe === 'ultra') {
      const currentByEvent = new Map();
      for (const point of entry.points) {
        if (
          typeof point.eventId !== 'string' ||
          point.eventId.length === 0
        ) {
          errors.push(`ULTRA_EVENT_ID_MISSING:${entry.sequence}`);
          continue;
        }
        if (currentByEvent.has(point.eventId)) {
          errors.push(
            `ULTRA_EVENT_ID_DUPLICATE:${entry.sequence}:${entry.symbol}:${point.eventId}`,
          );
          continue;
        }
        currentByEvent.set(point.eventId, point);
      }
      for (
        const eventId of
          domainState.previousClosedUltraEventIds
      ) {
        if (!currentByEvent.has(eventId)) {
          errors.push(
            `ULTRA_EVENT_HISTORY_LOSS:${entry.sequence}:${entry.symbol}:${eventId}`,
          );
        }
      }
      const currentEventOrder = [
        ...currentByEvent.keys(),
      ];
      let previousEventIndex = -1;
      let eventOrderRegressed = false;
      for (
        const eventId of
          domainState.previousClosedUltraEventIds
      ) {
        const currentIndex =
          currentEventOrder.indexOf(eventId);
        if (currentIndex < 0) continue;
        if (currentIndex < previousEventIndex) {
          eventOrderRegressed = true;
          break;
        }
        previousEventIndex = currentIndex;
      }
      if (eventOrderRegressed) {
        errors.push(
          `ULTRA_EVENT_ORDER_REGRESSION:${entry.sequence}:${entry.symbol}`,
        );
      }
      for (const [eventId, point] of currentByEvent) {
        const prior =
          domainState.closedUltraByEvent.get(eventId);
        if (
          prior &&
          (
            prior.x !== point.x ||
            prior.y !== point.y ||
            prior.volume !== point.volume ||
            prior.turnover !== point.turnover ||
            prior.firstTradeId !== point.firstTradeId ||
            prior.lastTradeId !== point.lastTradeId
          )
        ) {
          errors.push(
            `ULTRA_EVENT_REWRITE:${entry.sequence}:${entry.symbol}:${eventId}`,
          );
        }
        if (point.closed) {
          domainState.closedUltraByEvent.set(eventId, point);
        }
      }
      domainState.previousClosedUltraEventIds = entry.points
        .filter((point) => point.closed)
        .map((point) => point.eventId)
        .filter(
          (eventId) =>
            typeof eventId === 'string' &&
            eventId.length > 0,
        );
    } else {
      for (const point of entry.points) {
        const key = `${entry.symbol}:${entry.timeframe}:${point.bucketId}`;
        const prior = domainState.closedByBucket.get(key);
        if (
          prior &&
          (
            prior.x !== point.x ||
            prior.y !== point.y ||
            prior.volume !== point.volume ||
            prior.turnover !== point.turnover
          )
        ) {
          errors.push(`CLOSED_BUCKET_REWRITE:${entry.sequence}:${key}`);
        }
        if (point.closed) {
          domainState.closedByBucket.set(key, point);
        }
      }
    }
    const inputEventIds = safeArray(entry.inputs)
      .map((input) => input.eventId ?? input.id ?? null)
      .filter(Boolean)
      .map(String);
    const sourceEventIds = new Set(
      safeArray(publication.sourceEventIds).map(String),
    );
    if (
      inputEventIds.some((eventId) => !sourceEventIds.has(eventId))
    ) {
      errors.push(`SOURCE_EVENT_GAP:${entry.sequence}`);
    }
    if (paint) {
      if (
        !Number.isFinite(paint.wallPaintedAt) ||
        paint.wallPaintedAt < previousWallPaintedAt
      ) {
        errors.push(`PAINT_TIME_REGRESSION:${entry.sequence}`);
      }
      if (
        Number.isSafeInteger(publication.publicationMs) &&
        paint.latestPublicationMs !== publication.publicationMs
      ) {
        errors.push(`PAINT_PUBLICATION_MISMATCH:${entry.sequence}`);
      }
      if (
        Number.isSafeInteger(publication.latestSequence) &&
        paint.latestSequence !== publication.latestSequence
      ) {
        errors.push(`PAINT_SEQUENCE_MISMATCH:${entry.sequence}`);
      }
      if (
        Number.isSafeInteger(publication.latestEventMs) &&
        paint.latestEventMs !== publication.latestEventMs
      ) {
        errors.push(`PAINT_EVENT_MISMATCH:${entry.sequence}`);
      }
      if (
        publication.entitlement === 'level2' &&
        publication.speed === 16 &&
        Number.isFinite(publication.wallPublishedAt) &&
        Number.isFinite(paint.wallPaintedAt) &&
        paint.wallPaintedAt - publication.wallPublishedAt > 250
      ) {
        errors.push(`PAINT_BUDGET_EXCEEDED:${entry.sequence}`);
      }
      if (Number.isFinite(paint.wallPaintedAt)) {
        previousWallPaintedAt = Math.max(
          previousWallPaintedAt,
          paint.wallPaintedAt,
        );
      }
    }
    if (
      entry.save &&
      (
        entry.save.commitSeq !== entry.commitSeq ||
        entry.save.nowMs !== publication.publicationMs
      )
    ) {
      errors.push(`SAVE_BARRIER_MISMATCH:${entry.sequence}`);
    }
    const transition = entry.transition;
    if (transition && typeof transition === 'object') {
      if (
        transition.saveHash !== null &&
        transition.saveHash !== undefined &&
        transition.reloadHash !== null &&
        transition.reloadHash !== undefined &&
        transition.saveHash !== transition.reloadHash
      ) {
        errors.push(
          `SAVE_RELOAD_HASH_MISMATCH:${entry.sequence}`,
        );
      }
      if (
        transition.modeAfter !== null &&
        transition.modeAfter !== undefined &&
        transition.modeAfter !== entry.mode
      ) {
        errors.push(`TRANSITION_MODE_MISMATCH:${entry.sequence}`);
      }
      if (
        previousEntry &&
        transition.modeBefore !== null &&
        transition.modeBefore !== undefined &&
        transition.modeBefore !== previousEntry.mode
      ) {
        errors.push(
          `TRANSITION_PREVIOUS_MODE_MISMATCH:${entry.sequence}`,
        );
      }
      const previousPublication =
        previousEntry?.publication ?? null;
      if (
        previousPublication?.speed !== null &&
        previousPublication?.speed !== undefined &&
        transition.speedBefore !== null &&
        transition.speedBefore !== undefined &&
        transition.speedBefore !== previousPublication.speed
      ) {
        errors.push(
          `TRANSITION_PREVIOUS_SPEED_MISMATCH:${entry.sequence}`,
        );
      }
      if (
        publication.speed !== null &&
        publication.speed !== undefined &&
        transition.speedAfter !== null &&
        transition.speedAfter !== undefined &&
        transition.speedAfter !== publication.speed
      ) {
        errors.push(
          `TRANSITION_SPEED_MISMATCH:${entry.sequence}`,
        );
      }
      if (
        previousPublication?.entitlement !== null &&
        previousPublication?.entitlement !== undefined &&
        transition.entitlementBefore !== null &&
        transition.entitlementBefore !== undefined &&
        transition.entitlementBefore !==
          previousPublication.entitlement
      ) {
        errors.push(
          `TRANSITION_PREVIOUS_ENTITLEMENT_MISMATCH:${entry.sequence}`,
        );
      }
      if (
        publication.entitlement !== null &&
        publication.entitlement !== undefined &&
        transition.entitlementAfter !== null &&
        transition.entitlementAfter !== undefined &&
        transition.entitlementAfter !==
          publication.entitlement
      ) {
        errors.push(
          `TRANSITION_ENTITLEMENT_MISMATCH:${entry.sequence}`,
        );
      }
    }
    previousPublicationMs = Math.max(
      previousPublicationMs,
      publication.publicationMs,
    );
    previousEventMs = Math.max(
      previousEventMs,
      publication.latestEventMs,
    );
    if (Number.isSafeInteger(publication.latestSequence)) {
      previousSequence = Math.max(
        previousSequence,
        publication.latestSequence,
      );
    }
    if (Number.isSafeInteger(entry.commitSeq)) {
      previousCommitSeq = Math.max(previousCommitSeq, entry.commitSeq);
    }
    previousEntry = entry;
  }
  return { ok: errors.length === 0, errors };
}

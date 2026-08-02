const STATE_SCHEMA = 'lzy_cumulative_turnover_state_v1';
const CHECKPOINT_SCHEMA =
  'lzy_cumulative_turnover_checkpoint_v1';
const BASIS_POINTS = 10_000;
const PASSIVE_EVENT_TYPES = new Set([
  'ORDER_SUBMITTED',
  'ORDER_CANCELLED',
  'PRICE_OBSERVED',
  'PERMISSION_CHANGED',
]);

export const TURNOVER_TRUTH_VERSION =
  'lzy-cumulative-turnover-truth-v1';

function isRecord(value) {
  return value !== null && typeof value === 'object' &&
    !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function safeInteger(value, minimum = Number.MIN_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function positiveInteger(value) {
  return safeInteger(value, 1);
}

function clone(value) {
  return structuredClone(value);
}

function safeAdd(left, right) {
  const value = BigInt(left) + BigInt(right);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('TURNOVER_SAFE_INTEGER_OVERFLOW');
  }
  return Number(value);
}

function safeMultiply(left, right) {
  const value = BigInt(left) * BigInt(right);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('TURNOVER_SAFE_INTEGER_OVERFLOW');
  }
  return Number(value);
}

function assertState(state) {
  if (
    !isRecord(state) ||
    state.schemaVersion !== STATE_SCHEMA ||
    state.ruleVersion !== TURNOVER_TRUTH_VERSION ||
    state.authority !== 'settled_matched_fills_only' ||
    state.integrationStatus !== 'not_integrated' ||
    !nonEmptyString(state.assetId) ||
    !nonEmptyString(state.windowId) ||
    !positiveInteger(state.effectiveFloatUnits) ||
    !safeInteger(state.openedAtMs, 0) ||
    !safeInteger(state.lastEventSeq, 0) ||
    !safeInteger(state.matchedUnits, 0) ||
    !safeInteger(state.matchedTurnoverTicks, 0) ||
    !safeInteger(state.matchedTradeCount, 0) ||
    !safeInteger(state.selfTradeUnits, 0) ||
    !safeInteger(state.selfTradeTurnoverTicks, 0) ||
    !safeInteger(state.selfTradeCount, 0) ||
    state.selfTradeUnits > state.matchedUnits ||
    state.selfTradeTurnoverTicks >
      state.matchedTurnoverTicks ||
    state.selfTradeCount > state.matchedTradeCount
  ) {
    throw new TypeError('INVALID_CUMULATIVE_TURNOVER_STATE');
  }
  if (state.lastEventSeq === 0) {
    if (
      state.lastEventId !== null ||
      state.lastEventAtMs !== null
    ) {
      throw new TypeError('INVALID_CUMULATIVE_TURNOVER_CURSOR');
    }
  } else if (
    !nonEmptyString(state.lastEventId) ||
    !safeInteger(state.lastEventAtMs, state.openedAtMs)
  ) {
    throw new TypeError('INVALID_CUMULATIVE_TURNOVER_CURSOR');
  }
}

export function createCumulativeTurnoverState({
  assetId,
  windowId,
  effectiveFloatUnits,
  openedAtMs,
} = {}) {
  const state = {
    schemaVersion: STATE_SCHEMA,
    ruleVersion: TURNOVER_TRUTH_VERSION,
    authority: 'settled_matched_fills_only',
    integrationStatus: 'not_integrated',
    assetId,
    windowId,
    effectiveFloatUnits,
    openedAtMs,
    lastEventId: null,
    lastEventSeq: 0,
    lastEventAtMs: null,
    matchedUnits: 0,
    matchedTurnoverTicks: 0,
    matchedTradeCount: 0,
    selfTradeUnits: 0,
    selfTradeTurnoverTicks: 0,
    selfTradeCount: 0,
  };
  assertState(state);
  return state;
}

function assertEventIdentity(state, event) {
  if (
    !isRecord(event) ||
    !nonEmptyString(event.type) ||
    !nonEmptyString(event.eventId) ||
    !safeInteger(event.eventSeq, 0) ||
    !safeInteger(event.atMs, state.openedAtMs)
  ) {
    throw new TypeError('INVALID_TURNOVER_EVENT');
  }
  if (
    event.eventSeq === state.lastEventSeq &&
    event.eventId === state.lastEventId
  ) {
    return 'duplicate';
  }
  if (event.eventSeq <= state.lastEventSeq) {
    throw new RangeError('TURNOVER_EVENT_REWIND');
  }
  if (event.eventSeq !== state.lastEventSeq + 1) {
    throw new RangeError('TURNOVER_EVENT_SEQUENCE_GAP');
  }
  return 'next';
}

function withCursor(state, event) {
  return {
    ...state,
    lastEventId: event.eventId,
    lastEventSeq: event.eventSeq,
    lastEventAtMs: event.atMs,
  };
}

export function reduceCumulativeTurnover(state, event) {
  assertState(state);
  const identity = assertEventIdentity(state, event);
  if (identity === 'duplicate') {
    return {
      state: clone(state),
      receipt: {
        status: 'applied',
        duplicate: true,
        eventId: event.eventId,
        eventSeq: event.eventSeq,
        countersChanged: false,
      },
    };
  }
  if (event.type === 'OPEN_TURNOVER_WINDOW') {
    if (
      !nonEmptyString(event.windowId) ||
      event.windowId === state.windowId ||
      !positiveInteger(event.effectiveFloatUnits)
    ) {
      throw new TypeError('INVALID_TURNOVER_WINDOW_TRANSITION');
    }
    const next = {
      ...state,
      windowId: event.windowId,
      effectiveFloatUnits: event.effectiveFloatUnits,
      openedAtMs: event.atMs,
      lastEventId: event.eventId,
      lastEventSeq: event.eventSeq,
      lastEventAtMs: event.atMs,
      matchedUnits: 0,
      matchedTurnoverTicks: 0,
      matchedTradeCount: 0,
      selfTradeUnits: 0,
      selfTradeTurnoverTicks: 0,
      selfTradeCount: 0,
    };
    assertState(next);
    return {
      state: next,
      receipt: {
        status: 'applied',
        duplicate: false,
        eventId: event.eventId,
        eventSeq: event.eventSeq,
        countersChanged: true,
        windowReset: true,
      },
    };
  }
  if (PASSIVE_EVENT_TYPES.has(event.type)) {
    const next = withCursor(state, event);
    assertState(next);
    return {
      state: next,
      receipt: {
        status: 'applied',
        duplicate: false,
        eventId: event.eventId,
        eventSeq: event.eventSeq,
        countersChanged: false,
      },
    };
  }
  if (event.type !== 'MATCHED_FILL_SETTLED') {
    throw new RangeError('UNSUPPORTED_TURNOVER_EVENT');
  }
  if (event.priceAuthority !== 'matched_order_fill') {
    throw new RangeError('MATCHED_FILL_AUTHORITY_REQUIRED');
  }
  if (
    !positiveInteger(event.quantity) ||
    !positiveInteger(event.priceTicks) ||
    typeof event.selfTrade !== 'boolean'
  ) {
    throw new TypeError('INVALID_MATCHED_FILL_EVENT');
  }
  const turnoverTicks = safeMultiply(
    event.priceTicks,
    event.quantity,
  );
  const next = {
    ...withCursor(state, event),
    matchedUnits: safeAdd(
      state.matchedUnits,
      event.quantity,
    ),
    matchedTurnoverTicks: safeAdd(
      state.matchedTurnoverTicks,
      turnoverTicks,
    ),
    matchedTradeCount: safeAdd(
      state.matchedTradeCount,
      1,
    ),
    selfTradeUnits: event.selfTrade
      ? safeAdd(state.selfTradeUnits, event.quantity)
      : state.selfTradeUnits,
    selfTradeTurnoverTicks: event.selfTrade
      ? safeAdd(
          state.selfTradeTurnoverTicks,
          turnoverTicks,
        )
      : state.selfTradeTurnoverTicks,
    selfTradeCount: event.selfTrade
      ? safeAdd(state.selfTradeCount, 1)
      : state.selfTradeCount,
  };
  assertState(next);
  return {
    state: next,
    receipt: {
      status: 'applied',
      duplicate: false,
      eventId: event.eventId,
      eventSeq: event.eventSeq,
      countersChanged: true,
      matchedUnitsDelta: event.quantity,
      matchedTurnoverTicksDelta: turnoverTicks,
      selfTrade: event.selfTrade,
    },
  };
}

function turnoverBps(units, effectiveFloatUnits) {
  return Number(
    BigInt(units) * BigInt(BASIS_POINTS) /
      BigInt(effectiveFloatUnits),
  );
}

export function projectCumulativeTurnover(state) {
  assertState(state);
  const armLengthUnits =
    state.matchedUnits - state.selfTradeUnits;
  return {
    schemaVersion: 'lzy_cumulative_turnover_projection_v1',
    ruleVersion: TURNOVER_TRUTH_VERSION,
    authority: state.authority,
    integrationStatus: state.integrationStatus,
    assetId: state.assetId,
    windowId: state.windowId,
    effectiveFloatUnits: state.effectiveFloatUnits,
    openedAtMs: state.openedAtMs,
    asOfEventSeq: state.lastEventSeq,
    asOfMs: state.lastEventAtMs,
    matchedUnits: state.matchedUnits,
    matchedTurnoverTicks: state.matchedTurnoverTicks,
    matchedTradeCount: state.matchedTradeCount,
    selfTradeUnits: state.selfTradeUnits,
    selfTradeTurnoverTicks: state.selfTradeTurnoverTicks,
    selfTradeCount: state.selfTradeCount,
    armLengthUnits,
    grossTurnoverBps: turnoverBps(
      state.matchedUnits,
      state.effectiveFloatUnits,
    ),
    armLengthTurnoverBps: turnoverBps(
      armLengthUnits,
      state.effectiveFloatUnits,
    ),
  };
}

export function checkpointCumulativeTurnover(state) {
  assertState(state);
  return {
    schemaVersion: CHECKPOINT_SCHEMA,
    ruleVersion: TURNOVER_TRUTH_VERSION,
    state: clone(state),
  };
}

export function restoreCumulativeTurnover(checkpoint) {
  if (
    !isRecord(checkpoint) ||
    checkpoint.schemaVersion !== CHECKPOINT_SCHEMA ||
    checkpoint.ruleVersion !== TURNOVER_TRUTH_VERSION
  ) {
    throw new TypeError('INVALID_CUMULATIVE_TURNOVER_CHECKPOINT');
  }
  const state = clone(checkpoint.state);
  assertState(state);
  return state;
}

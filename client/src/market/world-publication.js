const PUBLIC_WORLD_SCHEMA = 'lzy_world_public_v1';
const PUBLIC_EXPERIENCE_SCHEMA = 'lzy_world_experience_public_v1';
const PUBLIC_DERIVATIVES_SCHEMA = 'lzy_derivatives_public_v1';
const DERIVATIVES_DELTA_SCHEMA =
  'lzy_derivatives_cadence_delta_v1';
const DERIVATIVES_CADENCE_FIELDS = new Set([
  'cadence',
  'access',
  'books',
  'lastTradePriceTicks',
  'settlementPriceTicks',
  'impliedVolatilityPpm',
  'seriesByContract',
  'priceAuthoritiesByContract',
  'financingFacility',
  'securitiesLending',
  'player',
  'actors',
  'recentTrades',
]);
const FORBIDDEN_DELTA_KEYS = new Set([
  '__proto__',
  'prototype',
  'constructor',
]);
const INVALID_DELTA = Symbol('invalid_derivatives_delta');

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function array(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function mergeRecordMap(previous, next) {
  const priorRecords = object(previous);
  const nextRecords = object(next);
  return Object.fromEntries(
    [...new Set([
      ...Object.keys(priorRecords),
      ...Object.keys(nextRecords),
    ])].map((key) => [
      key,
      {
        ...object(priorRecords[key]),
        ...object(nextRecords[key]),
      },
    ]),
  );
}

function applyObjectDelta(previous, delta) {
  if (!delta || typeof delta !== 'object') return INVALID_DELTA;
  const set = object(delta.set);
  const merge = object(delta.merge);
  const remove = Array.isArray(delta.remove)
    ? delta.remove
    : [];
  const touched = new Set();
  for (const key of [
    ...Object.keys(set),
    ...Object.keys(merge),
    ...remove,
  ]) {
    if (
      typeof key !== 'string' ||
      FORBIDDEN_DELTA_KEYS.has(key) ||
      touched.has(key)
    ) {
      return INVALID_DELTA;
    }
    touched.add(key);
  }
  const next = { ...object(previous) };
  for (const key of remove) delete next[key];
  for (const [key, value] of Object.entries(set)) {
    next[key] = value;
  }
  for (const [key, childDelta] of Object.entries(merge)) {
    const child = applyObjectDelta(next[key], childDelta);
    if (child === INVALID_DELTA) return INVALID_DELTA;
    next[key] = child;
  }
  return next;
}

function applyRecentTradeAppend(previous, change) {
  if (
    change?.type !== 'append' ||
    !Array.isArray(change.items) ||
    !Number.isSafeInteger(change.maxItems) ||
    change.maxItems < 1 ||
    change.maxItems > 1_000
  ) {
    return INVALID_DELTA;
  }
  const prior = Array.isArray(previous) ? previous : [];
  const priorLastSequence =
    prior.length > 0
      ? Number(prior.at(-1)?.sequence)
      : null;
  const afterSequence =
    change.afterTradeSequence === null
      ? null
      : Number(change.afterTradeSequence);
  if (
    (
      priorLastSequence !== null &&
      !Number.isSafeInteger(priorLastSequence)
    ) ||
    afterSequence !== priorLastSequence
  ) {
    return INVALID_DELTA;
  }
  const ids = new Set(
    prior.map((trade) => trade?.id).filter(Boolean),
  );
  const sequences = new Set(
    prior.map((trade) => trade?.sequence),
  );
  let lastSequence = priorLastSequence;
  for (const trade of change.items) {
    if (
      typeof trade?.id !== 'string' ||
      !Number.isSafeInteger(trade.sequence) ||
      (
        trade.sequence !==
        (lastSequence === null ? 1 : lastSequence + 1)
      ) ||
      ids.has(trade.id) ||
      sequences.has(trade.sequence)
    ) {
      return INVALID_DELTA;
    }
    ids.add(trade.id);
    sequences.add(trade.sequence);
    lastSequence = trade.sequence;
  }
  const trimBefore =
    change.trimBeforeTradeSequence === null
      ? null
      : Number(change.trimBeforeTradeSequence);
  if (
    trimBefore !== null &&
    !Number.isSafeInteger(trimBefore)
  ) {
    return INVALID_DELTA;
  }
  return [...prior, ...change.items]
    .filter(
      (trade) =>
        trimBefore === null ||
        trade.sequence >= trimBefore,
    )
    .slice(-change.maxItems);
}

function authorityMatches(
  patch,
  { commitSeq = null, nowMs = null } = {},
) {
  const patchCommitSeq = Number(patch?.authorityCommitSeq);
  const patchNowMs = Number(patch?.authorityNowMs);
  return (
    Number.isSafeInteger(patchCommitSeq) &&
    Number.isSafeInteger(patchNowMs) &&
    (
      !Number.isSafeInteger(commitSeq) ||
      patchCommitSeq === commitSeq
    ) &&
    (
      !Number.isSafeInteger(nowMs) ||
      patchNowMs === nowMs
    )
  );
}

export function mergeDerivativesAuthorityPublication(
  previous,
  patch,
  { commitSeq = null, nowMs = null } = {},
) {
  if (patch?.publication !== PUBLIC_DERIVATIVES_SCHEMA) {
    return previous;
  }
  if (!authorityMatches(patch, { commitSeq, nowMs })) {
    return previous;
  }
  const patchCommitSeq = Number(patch.authorityCommitSeq);
  const patchNowMs = Number(patch.authorityNowMs);
  const previousCommitSeq = Number(
    previous?.authorityCommitSeq,
  );
  const previousNowMs = Number(previous?.authorityNowMs);
  if (
    (
      Number.isSafeInteger(previousCommitSeq) &&
      patchCommitSeq < previousCommitSeq
    ) ||
    (
      Number.isSafeInteger(previousNowMs) &&
      patchNowMs < previousNowMs
    )
  ) {
    return previous;
  }
  if (patch.publicationMode === 'cadence_patch') {
    return {
      ...object(previous),
      ...patch,
      publicationMode: 'materialized',
      sourcePublicationMode: 'cadence_patch',
    };
  }
  if (
    patch.publicationMode === 'snapshot' ||
    patch.publicationMode === 'cadence_full'
  ) {
    if (
      patch.deltaSchema !== DERIVATIVES_DELTA_SCHEMA ||
      typeof patch.streamId !== 'string' ||
      !Number.isSafeInteger(patch.sequence) ||
      patch.sequence < 0
    ) {
      return previous;
    }
    return { ...patch };
  }
  if (
    patch.publicationMode !== 'cadence_delta' ||
    patch.deltaSchema !== DERIVATIVES_DELTA_SCHEMA ||
    typeof patch.streamId !== 'string' ||
    patch.streamId !== previous?.streamId ||
    !Number.isSafeInteger(patch.baseSequence) ||
    patch.baseSequence !== previous?.sequence ||
    !Number.isSafeInteger(patch.sequence) ||
    patch.sequence !== patch.baseSequence + 1 ||
    !Array.isArray(patch.changeMask) ||
    !patch.changes ||
    typeof patch.changes !== 'object'
  ) {
    return previous;
  }
  const changeKeys = Object.keys(patch.changes);
  if (
    new Set(patch.changeMask).size !==
      patch.changeMask.length ||
    patch.changeMask.length !== changeKeys.length ||
    patch.changeMask.some(
      (field) =>
        !DERIVATIVES_CADENCE_FIELDS.has(field) ||
        !Object.hasOwn(patch.changes, field),
    )
  ) {
    return previous;
  }
  const next = { ...object(previous) };
  for (const field of patch.changeMask) {
    const change = patch.changes[field];
    if (field === 'recentTrades') {
      const trades = applyRecentTradeAppend(
        next.recentTrades,
        change,
      );
      if (trades === INVALID_DELTA) return previous;
      next.recentTrades = trades;
      continue;
    }
    if (change?.type === 'replace') {
      next[field] = change.value;
      continue;
    }
    if (change?.type !== 'object') return previous;
    const value = applyObjectDelta(
      next[field],
      change.delta,
    );
    if (value === INVALID_DELTA) return previous;
    next[field] = value;
  }
  const {
    changes: _changes,
    ...metadata
  } = patch;
  return {
    ...next,
    ...metadata,
    publicationMode: 'materialized',
    sourcePublicationMode: 'cadence_delta',
  };
}

/**
 * Applies an ordinary public authority projection without discarding the
 * canonical UI-only collections that are intentionally absent from the wire.
 * A SAVE_BARRIER is not a public projection and therefore replaces the world
 * exactly.
 */
export function mergeWorldAuthorityPublication(previous, envelope) {
  const next = envelope?.state ?? envelope;
  if (!next?.world?.id) return previous;
  if (envelope?.publication !== PUBLIC_WORLD_SCHEMA) return next;

  const prior = object(previous);
  const experience =
    next.experience?.publication === PUBLIC_EXPERIENCE_SCHEMA
      ? next.experience
      : null;
  const records = object(experience?.records);

  return {
    ...prior,
    ...next,
    world: {
      ...object(prior.world),
      ...object(next.world),
    },
    player: {
      ...object(prior.player),
      ...object(next.player),
    },
    entities: {
      ...object(prior.entities),
      ...object(next.entities),
      companies: mergeRecordMap(
        prior.entities?.companies,
        next.entities?.companies,
      ),
    },
    economy: {
      ...object(prior.economy),
      ...object(next.economy),
    },
    market: {
      ...object(prior.market),
      ...object(next.market),
      securities: mergeRecordMap(
        prior.market?.securities,
        next.market?.securities,
      ),
    },
    experience: experience ?? prior.experience,
    clues: array(records.clues, array(prior.clues)),
    facts: array(records.facts, array(prior.facts)),
    memories: array(records.memories, array(prior.memories)),
    narratives: array(records.narratives, array(prior.narratives)),
    eventLog: array(records.events, array(prior.eventLog)),
    ledger: array(records.ledger, array(prior.ledger)),
  };
}

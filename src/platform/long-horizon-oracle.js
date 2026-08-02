export const WORLD_AGE_DAY_SET = Object.freeze([
  1,
  7,
  30,
  100,
  365,
  1_000,
]);

export const FIRST_DAY_CONTINUOUS_VIRTUAL_MS =
  8 * 60 * 60_000;

export const PLAYER_FASTEST_MULTIPLIER = 16;

const PAINT_FRESHNESS_MS = 250;
const PENDING_AUTHORITY_EVENT_CAP = 256;
const COMMAND_P95_MS = 150;
const COMMAND_WORST_MS = 750;
const PUBLICATION_MS = 250;
const ACTIVE_COMPLEXITY_KEYS = Object.freeze([
  'activeOrders',
  'eventQueue',
  'foldedAuditRoots',
  'liveAuditChains',
  'quoteFrames',
  'recentAuditBundles',
  'visibleTrades',
]);

function deepFreeze(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Object.isFrozen(value)
  ) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function safeInteger(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function finite(value, minimum = 0) {
  return Number.isFinite(value) && value >= minimum;
}

function hash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/iu.test(value);
}

function complexityShape(value) {
  return Object.fromEntries(
    ACTIVE_COMPLEXITY_KEYS.map((key) => [key, value?.[key] ?? null]),
  );
}

function sameShape(left, right) {
  return ACTIVE_COMPLEXITY_KEYS.every(
    (key) => left?.[key] === right?.[key],
  );
}

function uniqueSorted(values) {
  return [
    ...new Set(values.filter((value) => typeof value === 'string')),
  ].sort((left, right) => left.localeCompare(right));
}

export function assessFixedWorldAgeSamples(value) {
  const reasons = [];
  const samples = Array.isArray(value) ? value : [];
  if (
    samples.length !== WORLD_AGE_DAY_SET.length ||
    samples.some(
      (sample, index) =>
        sample?.dayIndex !== WORLD_AGE_DAY_SET[index],
    )
  ) {
    reasons.push('WORLD_AGE_SET_MISMATCH');
  }
  const baseline = complexityShape(samples[0]?.activeComplexity);
  for (const sample of samples) {
    const day = sample?.dayIndex ?? 'unknown';
    const shape = complexityShape(sample?.activeComplexity);
    if (
      ACTIVE_COMPLEXITY_KEYS.some(
        (key) => !safeInteger(shape[key]),
      ) ||
      !sameShape(shape, baseline)
    ) {
      reasons.push(`ACTIVE_COMPLEXITY_DRIFT:day${day}`);
    }
    const extreme = sample?.extreme;
    if (
      !safeInteger(extreme?.priceTransitions, 1) ||
      extreme?.tradeBackedTransitions !==
        extreme?.priceTransitions
    ) {
      reasons.push(`NON_TRADE_BACKED_PRICE_TRANSITION:day${day}`);
    }
    if (
      !safeInteger(extreme?.resealAccepted, 1) ||
      extreme.resealAccepted !== extreme?.resealCancelled
    ) {
      reasons.push(`INVALID_RESEAL_CANCEL_CHAIN:day${day}`);
    }
    if (!safeInteger(extreme?.peakQueueUnits, 2_000_000)) {
      reasons.push(`GIANT_SEAL_QUEUE_MISSING:day${day}`);
    }
    if (
      !finite(sample?.latencyMs?.commandP95) ||
      sample.latencyMs.commandP95 > COMMAND_P95_MS
    ) {
      reasons.push(`COMMAND_P95_BUDGET_EXCEEDED:day${day}`);
    }
    if (
      !finite(sample?.latencyMs?.commandWorst) ||
      sample.latencyMs.commandWorst > COMMAND_WORST_MS
    ) {
      reasons.push(`COMMAND_WORST_BUDGET_EXCEEDED:day${day}`);
    }
    if (
      !finite(sample?.latencyMs?.publication) ||
      sample.latencyMs.publication > PUBLICATION_MS
    ) {
      reasons.push(`PUBLICATION_BUDGET_EXCEEDED:day${day}`);
    }
  }
  const reasonCodes = uniqueSorted(reasons);
  return deepFreeze({
    schema: 'lzy_fixed_world_age_assessment_v1',
    status: reasonCodes.length === 0 ? 'accepted' : 'rejected',
    reasonCodes,
    claims: {
      fixedActiveComplexityVerified: reasonCodes.length === 0,
      fullWorldChronologyVerified: false,
    },
  });
}

export function assessLongHorizonReceipt(receipt) {
  const reasons = [];
  if (
    receipt?.schema !==
    'lzy_long_horizon_performance_receipt_v1'
  ) {
    reasons.push('INVALID_LONG_HORIZON_RECEIPT');
  }
  if (receipt?.authority?.writer !== 'worker_controller') {
    reasons.push('INVALID_AUTHORITY_WRITER');
  }
  if (receipt?.authority?.progression !== 'processNextEvent') {
    reasons.push('INVALID_PROGRESSION_GATE');
  }
  if (
    receipt?.authority?.priceAuthority !==
    'finite_subject_order_book'
  ) {
    reasons.push('INVALID_PRICE_AUTHORITY');
  }

  const scope = receipt?.scope;
  if (
    !safeInteger(scope?.firstDayContinuousVirtualMs) ||
    scope.firstDayContinuousVirtualMs <
      FIRST_DAY_CONTINUOUS_VIRTUAL_MS
  ) {
    reasons.push('FIRST_DAY_CONTINUOUS_DURATION_TOO_SHORT');
  }
  if (scope?.playerSpeedMultiplier !== PLAYER_FASTEST_MULTIPLIER) {
    reasons.push('INVALID_PLAYER_SPEED_MULTIPLIER');
  }
  if (scope?.verificationMode !== 'accelerated_virtual_time') {
    reasons.push('INVALID_VERIFICATION_TIME_MODE');
  }
  if (!finite(scope?.measuredWallMs)) {
    reasons.push('INVALID_MEASURED_WALL_DURATION');
  }

  const samples = Array.isArray(receipt?.worldAgeSamples)
    ? receipt.worldAgeSamples
    : [];
  reasons.push(
    ...assessFixedWorldAgeSamples(samples).reasonCodes,
  );

  const density = receipt?.temporalDensity;
  if (
    !safeInteger(density?.authorityEventCount, 1) ||
    !safeInteger(density?.publicationCount, 1) ||
    density.authorityEventCount < density.publicationCount
  ) {
    reasons.push('INVALID_AUTHORITY_PUBLICATION_DENSITY');
  }
  if (
    !safeInteger(density?.materializationCount, 1) ||
    density.materializationCount > density?.publicationCount
  ) {
    reasons.push('INVALID_MATERIALIZATION_DENSITY');
  }
  if (
    !safeInteger(density?.distinctMaterializedStateCount, 1) ||
    density.distinctMaterializedStateCount > density?.materializationCount
  ) {
    reasons.push('NO_DISTINCT_MATERIALIZED_STATE');
  }
  if (
    !safeInteger(density?.paintCount, 1) ||
    density.paintCount > density?.materializationCount
  ) {
    reasons.push('INVALID_PAINT_DENSITY');
  }
  if (
    !finite(density?.maximumPublicationToPaintMs) ||
    density.maximumPublicationToPaintMs > PAINT_FRESHNESS_MS
  ) {
    reasons.push('PAINT_FRESHNESS_BUDGET_EXCEEDED');
  }
  if (
    !safeInteger(density?.pendingAuthorityEventPeak) ||
    density.pendingAuthorityEventPeak > PENDING_AUTHORITY_EVENT_CAP
  ) {
    reasons.push('PENDING_AUTHORITY_EVENT_BOUND_EXCEEDED');
  }
  if (
    density?.clockDomain !== 'epoch_aligned_monotonic' ||
    density?.integerVirtualTime !== true
  ) {
    reasons.push('INVALID_TEMPORAL_CLOCK_DOMAIN');
  }

  const save = receipt?.saveReopen;
  if (
    save?.barrier !== 'SAVE_BARRIER' ||
    save?.durable !== true ||
    !safeInteger(save?.savedCommitSeq) ||
    !safeInteger(save?.restoredCommitSeq) ||
    save.restoredCommitSeq < save.savedCommitSeq
  ) {
    reasons.push('INVALID_SAVE_REOPEN_BARRIER');
  }
  if (
    !hash(save?.savedHash) ||
    !hash(save?.restoredHash) ||
    save.savedHash !== save.restoredHash
  ) {
    reasons.push('SAVE_REOPEN_HASH_MISMATCH');
  }
  if (
    receipt?.migration?.status !== 'verified' ||
    receipt?.migration?.resumed !== true ||
    typeof receipt?.migration?.fromVersion !== 'string' ||
    typeof receipt?.migration?.toVersion !== 'string' ||
    receipt.migration.fromVersion === receipt.migration.toVersion
  ) {
    reasons.push('MIGRATION_NOT_VERIFIED');
  }

  const reasonCodes = uniqueSorted(reasons);
  return deepFreeze({
    schema: 'lzy_long_horizon_assessment_v1',
    status: reasonCodes.length === 0 ? 'accepted' : 'rejected',
    reasonCodes,
    claims: {
      acceleratedFirstDayVerified:
        reasonCodes.length === 0,
      nativeRuntimeVerified: false,
      realWallEnduranceVerified:
        reasonCodes.length === 0 &&
        scope?.wallEnduranceStatus === 'verified' &&
        scope?.measuredWallMs >= FIRST_DAY_CONTINUOUS_VIRTUAL_MS,
    },
  });
}

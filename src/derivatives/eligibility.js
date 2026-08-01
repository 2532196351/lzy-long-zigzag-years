export const ACCESS_RULE_VERSION = 'lzy-derivatives-access-v1';
export const ACCESS_THRESHOLD_CENTS = 50_000_000;
export const ACCESS_CONTINUOUS_MS = 24 * 60 * 60 * 1_000;

export const DERIVATIVE_PERMISSIONS = Object.freeze([
  'margin_financing',
  'securities_lending',
  'option_buyer',
  'futures_trading',
]);
export const TESTING_ACCESS_POLICY = 'testing_open';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeTimestamp(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`);
  }
  return value;
}

function safeAssetCents(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      'totalEquivalentAssetCents must be a non-negative integer',
    );
  }
  return value;
}

function makeGrants() {
  return Object.fromEntries(
    DERIVATIVE_PERMISSIONS.map((permission) => [
      permission,
      {
        enabled: false,
        grantedAtMs: null,
      },
    ]),
  );
}

function audit(state, event) {
  state.nextAuditSequence += 1;
  state.auditTrail.push({
    id: `access_audit_${String(
      state.nextAuditSequence,
    ).padStart(8, '0')}`,
    ...event,
  });
}

function qualifiesAt(state, atMs) {
  const since =
    state.qualification.aboveThresholdSinceMs;
  return (
    since !== null &&
    atMs - state.worldStartedAtMs >= ACCESS_CONTINUOUS_MS
  );
}

function expectedQualification(state) {
  if (state.qualificationPolicy === TESTING_ACCESS_POLICY) {
    return {
      status: 'QUALIFIED',
      aboveThresholdSinceMs: null,
      qualifiedAtMs: state.testingOpenedAtMs,
    };
  }
  const atMs = state.lastObservedAtMs;
  if (state.lastTotalEquivalentAssetCents === null) {
    return {
      status: 'UNOBSERVED',
      aboveThresholdSinceMs: null,
      qualifiedAtMs: null,
    };
  }
  const firstReachedAtMs =
    state.qualification.aboveThresholdSinceMs;
  if (firstReachedAtMs === null) {
    return {
      status: 'BELOW_THRESHOLD',
      aboveThresholdSinceMs: null,
      qualifiedAtMs: null,
    };
  }
  if (qualifiesAt(state, atMs)) {
    return {
      status: 'QUALIFIED',
      aboveThresholdSinceMs: firstReachedAtMs,
      qualifiedAtMs: Math.max(
        state.worldStartedAtMs + ACCESS_CONTINUOUS_MS,
        firstReachedAtMs,
      ),
    };
  }
  return {
    status: 'WAITING_FOR_WORLD_AGE',
    aboveThresholdSinceMs: firstReachedAtMs,
    qualifiedAtMs: null,
  };
}

export function createAccessState({
  worldStartedAtMs,
  atMs = worldStartedAtMs,
} = {}) {
  safeTimestamp(worldStartedAtMs, 'worldStartedAtMs');
  safeTimestamp(atMs, 'atMs');
  if (atMs < worldStartedAtMs) {
    throw new RangeError('atMs cannot precede worldStartedAtMs');
  }
  return {
    ruleVersion: ACCESS_RULE_VERSION,
    worldStartedAtMs,
    lastObservedAtMs: atMs,
    lastTotalEquivalentAssetCents: null,
    qualification: {
      status: 'UNOBSERVED',
      aboveThresholdSinceMs: null,
      qualifiedAtMs: null,
      qualificationEpoch: 0,
    },
    grants: makeGrants(),
    nextAuditSequence: 0,
    auditTrail: [],
  };
}

export function createTestingOpenAccessState({
  worldStartedAtMs,
  atMs = worldStartedAtMs,
  totalEquivalentAssetCents = 0,
  source = 'explicit_testing_world_configuration',
} = {}) {
  safeAssetCents(totalEquivalentAssetCents);
  if (
    typeof source !== 'string' ||
    source.length === 0
  ) {
    throw new TypeError(
      'testing access source must be a non-empty string',
    );
  }
  const state = createAccessState({
    worldStartedAtMs,
    atMs,
  });
  state.qualificationPolicy = TESTING_ACCESS_POLICY;
  state.testingOpenedAtMs = atMs;
  state.lastTotalEquivalentAssetCents =
    totalEquivalentAssetCents;
  state.qualification = {
    ...state.qualification,
    status: 'QUALIFIED',
    aboveThresholdSinceMs: null,
    qualifiedAtMs: atMs,
  };
  audit(state, {
    type: 'testing_access_opened',
    atMs,
    source,
    totalEquivalentAssetCents,
  });
  audit(state, {
    type: 'access_qualified',
    atMs,
    qualifiedAtMs: atMs,
    highWaterReachedAtMs: null,
    source,
  });
  for (const permission of DERIVATIVE_PERMISSIONS) {
    state.grants[permission] = {
      enabled: true,
      grantedAtMs: atMs,
    };
    audit(state, {
      type: 'permission_enabled',
      permission,
      atMs,
      source,
    });
  }
  assertAccessState(state);
  return state;
}

export function observeEligibility(
  access,
  { atMs, totalEquivalentAssetCents },
) {
  assertAccessState(access);
  safeTimestamp(atMs, 'atMs');
  safeAssetCents(totalEquivalentAssetCents);
  if (atMs < access.lastObservedAtMs) {
    throw new RangeError('eligibility observations must be monotonic');
  }

  const next = cloneJson(access);
  const previousStatus = next.qualification.status;
  const standardPolicy =
    next.qualificationPolicy !== TESTING_ACCESS_POLICY;
  const isAbove =
    totalEquivalentAssetCents >= ACCESS_THRESHOLD_CENTS;

  next.lastObservedAtMs = atMs;
  next.lastTotalEquivalentAssetCents =
    totalEquivalentAssetCents;

  if (
    standardPolicy &&
    isAbove &&
    next.qualification.aboveThresholdSinceMs === null
  ) {
    next.qualification.aboveThresholdSinceMs = atMs;
    audit(next, {
      type: 'asset_high_water_reached',
      atMs,
      totalEquivalentAssetCents,
    });
  }

  const expected = expectedQualification(next);
  next.qualification.status = expected.status;
  next.qualification.qualifiedAtMs = expected.qualifiedAtMs;
  if (
    expected.status === 'QUALIFIED' &&
    previousStatus !== 'QUALIFIED'
  ) {
    audit(next, {
      type: 'access_qualified',
      atMs,
      qualifiedAtMs: expected.qualifiedAtMs,
      highWaterReachedAtMs: expected.aboveThresholdSinceMs,
      totalEquivalentAssetCents,
    });
  }
  return next;
}

export function derivePermissionMode(access, permission) {
  assertAccessState(access);
  if (!DERIVATIVE_PERMISSIONS.includes(permission)) {
    throw new RangeError(`Unknown derivative permission: ${permission}`);
  }
  const grant = access.grants[permission];
  if (!grant.enabled) {
    return access.qualification.status === 'QUALIFIED'
      ? 'QUALIFIED_NOT_ENABLED'
      : 'LOCKED';
  }
  return access.qualification.status === 'QUALIFIED'
    ? 'OPEN'
    : 'CLOSE_ONLY';
}

export function enablePermission(access, permission, atMs) {
  assertAccessState(access);
  if (!DERIVATIVE_PERMISSIONS.includes(permission)) {
    throw new RangeError(`Unknown derivative permission: ${permission}`);
  }
  safeTimestamp(atMs, 'atMs');
  if (atMs < access.lastObservedAtMs) {
    throw new RangeError('permission transition cannot rewind time');
  }
  const next = cloneJson(access);
  if (next.qualification.status !== 'QUALIFIED') {
    return {
      state: next,
      receipt: {
        type: 'enable_permission',
        permission,
        status: 'rejected',
        reason: 'ACCESS_NOT_QUALIFIED',
        atMs,
      },
    };
  }
  if (atMs !== next.lastObservedAtMs) {
    return {
      state: next,
      receipt: {
        type: 'enable_permission',
        permission,
        status: 'rejected',
        reason: 'ELIGIBILITY_OBSERVATION_STALE',
        atMs,
      },
    };
  }
  if (!next.grants[permission].enabled) {
    next.grants[permission] = {
      enabled: true,
      grantedAtMs: atMs,
    };
    audit(next, {
      type: 'permission_enabled',
      permission,
      atMs,
      qualificationEpoch:
        next.qualification.qualificationEpoch,
    });
  }
  return {
    state: next,
    receipt: {
      type: 'enable_permission',
      permission,
      status: 'applied',
      reason: null,
      atMs,
    },
  };
}

export function checkpointAccess(access) {
  assertAccessState(access);
  return cloneJson(access);
}

export function restoreAccess(checkpoint) {
  const restored = cloneJson(checkpoint);
  assertAccessState(restored);
  const expected = expectedQualification(restored);
  const actual = restored.qualification;
  if (
    actual.status !== expected.status ||
    actual.aboveThresholdSinceMs !==
      expected.aboveThresholdSinceMs ||
    actual.qualifiedAtMs !== expected.qualifiedAtMs
  ) {
    throw new Error(
      'Invalid derivative access checkpoint qualification',
    );
  }
  return restored;
}

export function assertAccessState(access) {
  if (
    !access ||
    access.ruleVersion !== ACCESS_RULE_VERSION ||
    !Number.isSafeInteger(access.worldStartedAtMs) ||
    !Number.isSafeInteger(access.lastObservedAtMs) ||
    access.lastObservedAtMs < access.worldStartedAtMs ||
    !access.qualification ||
    !Array.isArray(access.auditTrail) ||
    !Number.isSafeInteger(access.nextAuditSequence)
  ) {
    throw new Error('Invalid derivative access checkpoint');
  }
  if (
    access.qualificationPolicy !== undefined &&
    access.qualificationPolicy !== TESTING_ACCESS_POLICY
  ) {
    throw new Error(
      'Invalid derivative access checkpoint policy',
    );
  }
  if (
    access.qualificationPolicy === TESTING_ACCESS_POLICY &&
    (
      !Number.isSafeInteger(access.testingOpenedAtMs) ||
      access.testingOpenedAtMs < access.worldStartedAtMs ||
      access.testingOpenedAtMs > access.lastObservedAtMs ||
      !access.auditTrail.some(
        (event) =>
          event.type === 'testing_access_opened' &&
          event.atMs === access.testingOpenedAtMs,
      )
    )
  ) {
    throw new Error(
      'Invalid derivative testing access checkpoint',
    );
  }
  if (
    access.lastTotalEquivalentAssetCents !== null &&
    (
      !Number.isSafeInteger(
        access.lastTotalEquivalentAssetCents,
      ) ||
      access.lastTotalEquivalentAssetCents < 0
    )
  ) {
    throw new Error('Invalid derivative access checkpoint assets');
  }
  const since =
    access.qualification.aboveThresholdSinceMs;
  const qualifiedAt = access.qualification.qualifiedAtMs;
  if (
    (since !== null &&
      (
        !Number.isSafeInteger(since) ||
        since < access.worldStartedAtMs ||
        since > access.lastObservedAtMs
      )) ||
    (qualifiedAt !== null &&
      (
        !Number.isSafeInteger(qualifiedAt) ||
        qualifiedAt > access.lastObservedAtMs
      ))
  ) {
    throw new Error(
      'Invalid derivative access checkpoint continuous period',
    );
  }
  for (const permission of DERIVATIVE_PERMISSIONS) {
    const grant = access.grants?.[permission];
    if (
      !grant ||
      typeof grant.enabled !== 'boolean' ||
      (
        grant.enabled &&
        (
          !Number.isSafeInteger(grant.grantedAtMs) ||
          grant.grantedAtMs <
            access.worldStartedAtMs ||
          grant.grantedAtMs > access.lastObservedAtMs
        )
      ) ||
      (!grant.enabled && grant.grantedAtMs !== null)
    ) {
      throw new Error(
      'Invalid derivative access checkpoint grant',
      );
    }
  }
  if (
    access.nextAuditSequence !== access.auditTrail.length
  ) {
    throw new Error(
      'Invalid derivative access checkpoint audit sequence',
    );
  }
  for (
    let index = 0;
    index < access.auditTrail.length;
    index += 1
  ) {
    const event = access.auditTrail[index];
    if (
      event.id !==
        `access_audit_${String(index + 1).padStart(8, '0')}` ||
      !Number.isSafeInteger(event.atMs) ||
      event.atMs < access.worldStartedAtMs ||
      event.atMs > access.lastObservedAtMs
    ) {
      throw new Error(
        'Invalid derivative access checkpoint audit record',
      );
    }
  }
  const highWaterIndex = access.auditTrail.findLastIndex(
    (event) => event.type === 'asset_high_water_reached',
  );
  if (since !== null) {
    const startEvent = access.auditTrail[highWaterIndex];
    if (
      !startEvent ||
      startEvent.atMs !== since
    ) {
      throw new Error(
        'Invalid derivative access checkpoint high-water audit',
      );
    }
  }
  if (access.qualification.status === 'QUALIFIED') {
    const qualificationEvent =
      access.auditTrail.findLast(
        (event) => event.type === 'access_qualified',
      );
    if (
      !qualificationEvent ||
      qualificationEvent.qualifiedAtMs !== qualifiedAt ||
      qualificationEvent.atMs < qualifiedAt ||
      qualificationEvent.highWaterReachedAtMs !== since
    ) {
      throw new Error(
        'Invalid derivative access checkpoint qualification audit',
      );
    }
  }
  for (const permission of DERIVATIVE_PERMISSIONS) {
    const grant = access.grants[permission];
    if (!grant.enabled) continue;
    const grantEvent = access.auditTrail.findLast(
      (event) =>
        event.type === 'permission_enabled' &&
        event.permission === permission,
    );
    if (
      !grantEvent ||
      grantEvent.atMs !== grant.grantedAtMs
    ) {
      throw new Error(
        'Invalid derivative access checkpoint permission audit',
      );
    }
  }
  return { ok: true, errors: [] };
}

export const RUNTIME_BOUNDARY_RECEIPT_SCHEMA =
  'lzy_runtime_boundary_receipt_v1';

export const LZY_SITES_PROJECT_ID =
  'appgprj_6a69faca59408191b7f4411de1e247be';

const ARTIFACT_KEYS = Object.freeze([
  'authorityCoreHash',
  'ruleManifestHash',
  'contentManifestHash',
  'clientArtifactHash',
]);

const ALLOWED_ADAPTER_METHODS = new Set([
  'init',
  'command',
  'saveBarrier',
  'pause',
  'resume',
  'subscribe',
  'readSave',
  'writeAtomicSave',
  'preserveBackup',
  'mapInput',
  'emitConfirmedEffect',
  'openExternalLink',
]);

const REQUIRED_ADAPTER_METHODS = Object.freeze([
  'init',
  'command',
  'saveBarrier',
  'pause',
  'resume',
  'subscribe',
  'readSave',
  'writeAtomicSave',
  'preserveBackup',
  'mapInput',
  'emitConfirmedEffect',
]);

function profile(requiredCapabilities, allowedAuthorityHosts) {
  return Object.freeze({
    requiredCapabilities: Object.freeze(requiredCapabilities),
    allowedAuthorityHosts: Object.freeze(allowedAuthorityHosts),
  });
}

export const RUNTIME_PLATFORM_PROFILES = Object.freeze({
  web: profile(
    [
      'dedicated_worker',
      'indexeddb',
      'save_barrier',
      'lifecycle_pause',
      'offline_assets',
    ],
    ['dedicated_worker'],
  ),
  ios: profile(
    [
      'dedicated_worker',
      'atomic_replace',
      'durable_flush',
      'save_barrier',
      'lifecycle_pause',
      'private_storage',
      'crash_recovery',
    ],
    ['dedicated_worker', 'verified_native_host'],
  ),
  android: profile(
    [
      'dedicated_worker',
      'atomic_replace',
      'durable_flush',
      'save_barrier',
      'lifecycle_pause',
      'private_storage',
      'crash_recovery',
    ],
    ['dedicated_worker', 'verified_native_host'],
  ),
  steam_desktop: profile(
    [
      'dedicated_worker',
      'atomic_replace',
      'durable_flush',
      'save_barrier',
      'lifecycle_pause',
      'private_storage',
      'crash_recovery',
      'sandboxed_renderer',
      'validated_ipc',
      'offline_assets',
    ],
    ['dedicated_worker', 'verified_native_host'],
  ),
});

function strings(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .filter((value) => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function isHash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function cloneArtifacts(artifacts) {
  return Object.fromEntries(
    ARTIFACT_KEYS.map((key) => [key, artifacts?.[key] ?? null]),
  );
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function boundedAuthority(authority) {
  return {
    instanceCount: authority?.instanceCount ?? null,
    writer: authority?.writer ?? null,
    progression: authority?.progression ?? null,
    externalCommandGateway:
      authority?.externalCommandGateway ?? null,
    saveBarrier: authority?.saveBarrier ?? null,
    priceAuthority: authority?.priceAuthority ?? null,
  };
}

function receiptBase(manifest, profileEntry, reasonCodes) {
  const accepted = reasonCodes.length === 0;
  const artifacts = cloneArtifacts(manifest?.artifacts);
  return deepFreeze({
    schema: RUNTIME_BOUNDARY_RECEIPT_SCHEMA,
    status: accepted ? 'accepted' : 'rejected',
    canStartAuthority: accepted,
    platform:
      typeof manifest?.platform === 'string'
        ? manifest.platform
        : null,
    buildId:
      typeof manifest?.buildId === 'string'
        ? manifest.buildId
        : null,
    projectId:
      typeof manifest?.projectId === 'string'
        ? manifest.projectId
        : null,
    authority: boundedAuthority(manifest?.authority),
    verifiedArtifacts: artifacts,
    requiredCapabilities: [
      ...(profileEntry?.requiredCapabilities ?? []),
    ],
    reasonCodes: [...reasonCodes],
    integrationStatus: 'boundary_validated_not_integrated',
  });
}

export function validatePlatformRuntime(
  manifest,
  {
    expectedArtifacts = null,
    expectedProjectId = LZY_SITES_PROJECT_ID,
  } = {},
) {
  const errors = [];
  const platform = manifest?.platform;
  const profileEntry = RUNTIME_PLATFORM_PROFILES[platform];

  if (
    !manifest ||
    manifest.schema !== 'lzy_platform_capabilities_v1'
  ) {
    errors.push('INVALID_PLATFORM_MANIFEST');
  }
  if (!profileEntry) {
    errors.push('UNSUPPORTED_PLATFORM');
  }
  if (
    typeof manifest?.buildId !== 'string' ||
    !manifest.buildId.trim()
  ) {
    errors.push('INVALID_BUILD_ID');
  }
  if (!isHash(manifest?.sourceIdentity?.sourceTreeHash)) {
    errors.push('INVALID_SOURCE_TREE_HASH');
  }
  if (
    typeof expectedProjectId === 'string' &&
    expectedProjectId &&
    manifest?.projectId !== expectedProjectId
  ) {
    errors.push('PROJECT_ID_MISMATCH');
  }

  const authority = manifest?.authority;
  if (authority?.instanceCount !== 1) {
    errors.push('AUTHORITY_INSTANCE_COUNT_MUST_BE_ONE');
  }
  if (authority?.writer !== 'worker_controller') {
    errors.push('INVALID_AUTHORITY_WRITER');
  }
  if (authority?.progression !== 'processNextEvent') {
    errors.push('INVALID_PROGRESSION_GATE');
  }
  if (
    authority?.externalCommandGateway !==
    'processExternalCommand'
  ) {
    errors.push('INVALID_EXTERNAL_COMMAND_GATEWAY');
  }
  if (authority?.saveBarrier !== 'SAVE_BARRIER') {
    errors.push('INVALID_SAVE_BARRIER');
  }
  if (
    authority?.priceAuthority !==
    'finite_subject_order_book'
  ) {
    errors.push('INVALID_PRICE_AUTHORITY');
  }

  const adapter = manifest?.adapter;
  if (
    !adapter ||
    typeof adapter.id !== 'string' ||
    !adapter.id.trim()
  ) {
    errors.push('INVALID_PLATFORM_ADAPTER');
  }
  if (
    profileEntry &&
    !profileEntry.allowedAuthorityHosts.includes(
      adapter?.authorityHost,
    )
  ) {
    errors.push('UNSUPPORTED_AUTHORITY_HOST');
  }
  if (adapter?.worldWriteAccess !== false) {
    errors.push('ADAPTER_WORLD_WRITE_FORBIDDEN');
  }
  if (adapter?.directPriceWriteAccess !== false) {
    errors.push('ADAPTER_PRICE_WRITE_FORBIDDEN');
  }
  if (adapter?.narrativeAuthority !== false) {
    errors.push('NARRATIVE_AUTHORITY_FORBIDDEN');
  }

  const capabilities = new Set(strings(adapter?.capabilities));
  for (const capability of
    profileEntry?.requiredCapabilities ?? []) {
    if (!capabilities.has(capability)) {
      errors.push(`MISSING_CAPABILITY:${capability}`);
    }
  }
  const exposedMethods = strings(adapter?.exposedMethods);
  const exposedMethodSet = new Set(exposedMethods);
  for (const method of REQUIRED_ADAPTER_METHODS) {
    if (!exposedMethodSet.has(method)) {
      errors.push(`MISSING_ADAPTER_METHOD:${method}`);
    }
  }
  for (const method of exposedMethods) {
    if (!ALLOWED_ADAPTER_METHODS.has(method)) {
      errors.push(`UNSAFE_ADAPTER_METHOD:${method}`);
    }
  }

  for (const key of ARTIFACT_KEYS) {
    const declared = manifest?.artifacts?.[key];
    const loaded = adapter?.loadedArtifacts?.[key];
    const expected = expectedArtifacts?.[key];
    if (!isHash(declared) || !isHash(loaded)) {
      errors.push(`INVALID_ARTIFACT_HASH:${key}`);
      continue;
    }
    if (
      declared !== loaded ||
      (typeof expected === 'string' && declared !== expected)
    ) {
      errors.push(`ARTIFACT_HASH_MISMATCH:${key}`);
    }
  }

  const services = Array.isArray(manifest?.optionalServices)
    ? manifest.optionalServices
    : [];
  for (const service of services) {
    const serviceId =
      typeof service?.id === 'string' && service.id
        ? service.id
        : 'unknown';
    if (service?.worldWriteAccess !== false) {
      errors.push(
        `OPTIONAL_SERVICE_WORLD_WRITE_FORBIDDEN:${serviceId}`,
      );
    }
    if (service?.consumesConfirmedReceiptsOnly !== true) {
      errors.push(
        `OPTIONAL_SERVICE_UNCONFIRMED_EFFECT_FORBIDDEN:${serviceId}`,
      );
    }
  }

  return receiptBase(
    manifest,
    profileEntry,
    strings(errors),
  );
}

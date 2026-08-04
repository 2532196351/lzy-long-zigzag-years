import {
  validatePlatformRuntime,
} from './runtime-boundary.js?v=20260804-01';

const PORT_METHODS = Object.freeze([
  'command',
  'emitConfirmedEffect',
  'init',
  'mapInput',
  'pause',
  'preserveBackup',
  'readSave',
  'resume',
  'saveBarrier',
  'subscribe',
  'writeAtomicSave',
]);

function clone(value) {
  return value === undefined
    ? undefined
    : structuredClone(value);
}

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

function fail(code, details = null) {
  const error = new Error(
    details === null ? code : `${code}:${details}`,
  );
  error.code = code;
  error.details = details;
  throw error;
}

function sameArtifacts(actual, expected) {
  return Object.keys(expected ?? {}).every(
    (key) => actual?.[key] === expected[key],
  );
}

function validAuthorityReady(receipt, expectedArtifacts) {
  return (
    receipt?.type === 'AUTHORITY_READY' &&
    receipt?.status === 'confirmed' &&
    typeof receipt?.authorityInstanceId === 'string' &&
    receipt.authorityInstanceId.length > 0 &&
    receipt?.writer === 'worker_controller' &&
    receipt?.progression === 'processNextEvent' &&
    sameArtifacts(receipt?.artifacts, expectedArtifacts)
  );
}

function requireState(state, allowed) {
  if (!allowed.includes(state)) fail('RUNTIME_NOT_READY', state);
}

export function createExecutableRuntime({
  adapter,
  expectedArtifacts,
  manifest,
  expectedProjectId,
} = {}) {
  const preflight = validatePlatformRuntime(manifest, {
    expectedArtifacts,
    ...(expectedProjectId === undefined
      ? {}
      : { expectedProjectId }),
  });
  if (preflight.status !== 'accepted') {
    fail(
      'RUNTIME_PREFLIGHT_REJECTED',
      preflight.reasonCodes.join(','),
    );
  }
  for (const method of PORT_METHODS) {
    if (typeof adapter?.[method] !== 'function') {
      fail('RUNTIME_PORT_MISSING', method);
    }
  }

  let state = 'validated_not_initialized';
  let authorityInstanceId = null;
  let operationTail = Promise.resolve();

  function serialize(operation) {
    const pending = operationTail.then(operation, operation);
    operationTail = pending.catch(() => null);
    return pending;
  }

  function status() {
    return deepFreeze({
      authorityInstanceId,
      integrationStatus: 'not_product_integrated',
      nativeRuntimeVerified: false,
      platform: preflight.platform,
      state,
    });
  }

  async function init() {
    return serialize(async () => {
      if (state !== 'validated_not_initialized') {
        fail('RUNTIME_ALREADY_INITIALIZED', state);
      }
      state = 'initializing';
      try {
        const receipt = await adapter.init({
          manifest: clone(manifest),
          preflight: clone(preflight),
        });
        if (!validAuthorityReady(receipt, expectedArtifacts)) {
          fail('INVALID_AUTHORITY_READY_RECEIPT');
        }
        authorityInstanceId = receipt.authorityInstanceId;
        state = 'ready';
        return deepFreeze(clone(receipt));
      } catch (error) {
        state = 'failed';
        throw error;
      }
    });
  }

  async function command(input) {
    return serialize(async () => {
      requireState(state, ['ready']);
      const mapped = await adapter.mapInput(clone(input));
      if (!mapped || typeof mapped.type !== 'string') {
        fail('INVALID_MAPPED_COMMAND');
      }
      const receipt = await adapter.command(mapped);
      if (
        receipt?.confirmed !== true ||
        !Number.isSafeInteger(receipt?.commitSeq) ||
        typeof receipt?.status !== 'string'
      ) {
        fail('UNCONFIRMED_COMMAND_RECEIPT');
      }
      if (receipt.effect !== undefined && receipt.effect !== null) {
        await adapter.emitConfirmedEffect(
          clone(receipt.effect),
          clone(receipt),
        );
      }
      return deepFreeze(clone(receipt));
    });
  }

  async function saveBarrier(reason = 'manual') {
    return serialize(async () => {
      requireState(state, ['ready', 'paused']);
      const barrier = await adapter.saveBarrier({ reason });
      if (
        barrier?.type !== 'SAVE_BARRIER' ||
        barrier?.status !== 'confirmed' ||
        !Number.isSafeInteger(barrier?.commitSeq) ||
        !barrier?.checkpoint ||
        typeof barrier?.digest !== 'string' ||
        !/^[a-f0-9]{64}$/iu.test(barrier.digest)
      ) {
        fail('INVALID_SAVE_BARRIER_RECEIPT');
      }
      const previous = await adapter.readSave();
      await adapter.preserveBackup({
        nextCommitSeq: barrier.commitSeq,
        previous: clone(previous),
      });
      const durable = await adapter.writeAtomicSave({
        checkpoint: clone(barrier.checkpoint),
        commitSeq: barrier.commitSeq,
        digest: barrier.digest,
        reason,
      });
      if (
        durable?.status !== 'durable' ||
        durable?.commitSeq !== barrier.commitSeq ||
        durable?.digest !== barrier.digest
      ) {
        fail('SAVE_NOT_DURABLE');
      }
      return deepFreeze({
        barrier: clone(barrier),
        commitSeq: durable.commitSeq,
        digest: durable.digest,
        status: 'durable',
      });
    });
  }

  async function pause() {
    return serialize(async () => {
      requireState(state, ['ready']);
      const receipt = await adapter.pause();
      if (
        receipt?.status !== 'confirmed' ||
        receipt?.state !== 'paused'
      ) {
        fail('PAUSE_NOT_CONFIRMED');
      }
      state = 'paused';
      return deepFreeze(clone(receipt));
    });
  }

  async function resume() {
    return serialize(async () => {
      requireState(state, ['paused']);
      const receipt = await adapter.resume();
      if (
        receipt?.status !== 'confirmed' ||
        receipt?.state !== 'running'
      ) {
        fail('RESUME_NOT_CONFIRMED');
      }
      state = 'ready';
      return deepFreeze(clone(receipt));
    });
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Runtime subscriber must be a function.');
    }
    return adapter.subscribe((receipt) => {
      if (receipt?.confirmed === true) {
        listener(deepFreeze(clone(receipt)));
      }
    });
  }

  async function readSave() {
    return deepFreeze(clone(await adapter.readSave()));
  }

  return Object.freeze({
    command,
    init,
    pause,
    preflight,
    readSave,
    resume,
    saveBarrier,
    status,
    subscribe,
  });
}

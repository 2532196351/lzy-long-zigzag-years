import {
  actorOpenContractLimitReason,
} from '../derivatives/actors.js?v=20260803-02';

const BASIS_POINTS = 10_000;
const MAX_CANDIDATE_COMMANDS = 1_024;
const MAX_CONTROLLED_SUBMISSIONS = 512;
const BATCH_SCHEMA =
  'lzy_controlled_derivative_actor_batch_v1';
const CONTROL_SCHEMA = 'lzy_derivative_actor_control_v1';
const ADVANCED_SPOT_ACTOR_KINDS = new Set([
  'quant_institution',
  'stabilization_fund',
  'private_whale',
]);
const CONTRACT_TYPES = new Set(['future', 'option']);

export const PROFESSIONAL_ECOLOGY_CONTROL_VERSION =
  'lzy-professional-ecology-control-v1';

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

function clone(value) {
  return structuredClone(value);
}

function uniqueStrings(values) {
  return Array.isArray(values) &&
    values.every(nonEmptyString) &&
    new Set(values).size === values.length;
}

export function classifyProfessionalEcologyRoute({
  actorId,
  actorKind,
  derivativeActorIds = [],
} = {}) {
  if (
    !nonEmptyString(actorId) ||
    !nonEmptyString(actorKind) ||
    !uniqueStrings(derivativeActorIds)
  ) {
    return {
      status: 'blocked',
      actorId: nonEmptyString(actorId) ? actorId : null,
      commandSource: null,
      executionMode: null,
      mayRunAlongsideRunActorCycle: false,
      reasonCodes: ['ECOLOGY_ROUTE_IDENTITY_INVALID'],
    };
  }
  const isDerivativeActor = derivativeActorIds.includes(actorId);
  const isAdvancedSpotActor =
    ADVANCED_SPOT_ACTOR_KINDS.has(actorKind);
  if (isDerivativeActor && isAdvancedSpotActor) {
    return {
      status: 'blocked',
      actorId,
      commandSource: null,
      executionMode: null,
      mayRunAlongsideRunActorCycle: false,
      reasonCodes: ['DUPLICATE_ECOLOGY_ROUTE'],
    };
  }
  if (isDerivativeActor) {
    return {
      status: 'routed',
      actorId,
      commandSource: 'existing_derivative_actor_catalog',
      executionMode: 'replace_existing_actor_batch',
      mayRunAlongsideRunActorCycle: false,
      reasonCodes: [],
    };
  }
  if (isAdvancedSpotActor) {
    return {
      status: 'routed',
      actorId,
      commandSource: 'advanced_participant_ecology',
      executionMode: 'single_advanced_spot_intent_batch',
      mayRunAlongsideRunActorCycle: true,
      reasonCodes: [],
    };
  }
  return {
    status: 'blocked',
    actorId,
    commandSource: null,
    executionMode: null,
    mayRunAlongsideRunActorCycle: false,
    reasonCodes: ['ECOLOGY_ROUTE_UNSUPPORTED'],
  };
}

function baseBatch(state, actorId, atMs, candidateCommands) {
  return {
    schemaVersion: BATCH_SCHEMA,
    ruleVersion: PROFESSIONAL_ECOLOGY_CONTROL_VERSION,
    authority: 'advisory_candidate_only',
    integrationStatus: 'not_integrated',
    executionMode: 'replace_existing_actor_batch',
    actorId,
    observedCommitSeq: safeInteger(state?.commitSeq, 0)
      ? state.commitSeq
      : null,
    atMs: safeInteger(atMs, 0) ? atMs : null,
    status: 'blocked',
    commands: [],
    reasonCodes: [],
    controlProof: {
      sourceCommandCount: Array.isArray(candidateCommands)
        ? candidateCommands.length
        : null,
      sourceSubmitCount: 0,
      sourceCancelCount: 0,
      retainedSubmitCount: 0,
      retainedCancelCount: 0,
      retainedBatchNotionalCents: 0,
      intensityBps: null,
      capacityMultiplierBps: null,
      finalRiskAuthority:
        'derivatives_reducer_order_and_margin_checks',
    },
  };
}

function validCandidate(command, state, actorId, atMs) {
  if (
    !isRecord(command) ||
    !['SUBMIT_ORDER', 'CANCEL_ORDER'].includes(command.type) ||
    command.actorId !== actorId ||
    command.actorPolicyId !== actorId ||
    command.source !== 'derivative_actor' ||
    command.atMs !== atMs ||
    !nonEmptyString(command.contractId)
  ) {
    return false;
  }
  const contract =
    state.universe?.futures?.[command.contractId] ??
    state.universe?.options?.[command.contractId];
  if (!contract) return false;
  if (command.type === 'CANCEL_ORDER') {
    return nonEmptyString(command.orderId);
  }
  return (
    ['buy', 'sell'].includes(command.side) &&
    command.orderType === 'limit' &&
    ['GTC', 'IOC'].includes(command.tif) &&
    safeInteger(command.priceTicks, 1) &&
    safeInteger(command.quantity, 1)
  );
}

function controlReasons(control, state, atMs) {
  const reasons = [];
  if (!isRecord(control) || control.schemaVersion !== CONTROL_SCHEMA) {
    return ['CONTROL_SCHEMA_INVALID'];
  }
  if (!nonEmptyString(control.controlId)) {
    reasons.push('CONTROL_ID_INVALID');
  }
  if (control.active !== true) {
    reasons.push('CONTROL_INACTIVE');
  }
  if (
    !safeInteger(control.observedCommitSeq, 0) ||
    control.observedCommitSeq !== state.commitSeq
  ) {
    reasons.push('CONTROL_COMMIT_STALE');
  }
  if (
    !safeInteger(control.issuedAtMs, 0) ||
    !safeInteger(control.expiresAtMs, 0) ||
    control.issuedAtMs > atMs ||
    control.expiresAtMs < atMs
  ) {
    reasons.push(
      safeInteger(control.expiresAtMs, 0) &&
        control.expiresAtMs < atMs
        ? 'CONTROL_EXPIRED'
        : 'CONTROL_TIME_INVALID',
    );
  }
  if (
    !safeInteger(control.intensityBps, 0) ||
    control.intensityBps > BASIS_POINTS
  ) {
    reasons.push('CONTROL_INTENSITY_INVALID');
  }
  if (
    !safeInteger(control.maxSubmitCommands, 0) ||
    control.maxSubmitCommands > MAX_CONTROLLED_SUBMISSIONS ||
    !safeInteger(control.maxContractsPerOrder, 1) ||
    !safeInteger(control.maxBatchNotionalCents, 1)
  ) {
    reasons.push('CONTROL_CAPACITY_INVALID');
  }
  if (
    !uniqueStrings(control.allowedContractTypes) ||
    control.allowedContractTypes.length === 0 ||
    control.allowedContractTypes.some(
      (type) => !CONTRACT_TYPES.has(type),
    )
  ) {
    reasons.push('CONTROL_CONTRACT_SET_INVALID');
  }
  return [...new Set(reasons)];
}

function cancellationCandidates(
  candidateCommands,
  state,
  actorId,
  atMs,
) {
  if (!Array.isArray(candidateCommands)) return [];
  return candidateCommands
    .filter(
      (command) =>
        command?.type === 'CANCEL_ORDER' &&
        validCandidate(command, state, actorId, atMs),
    )
    .map(clone);
}

function safeCommandNotionalCents(contract, command) {
  const value =
    BigInt(command.priceTicks) *
    BigInt(command.quantity) *
    BigInt(contract.tickValueCents);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(value);
}

export function constrainDerivativeActorCommands({
  state,
  actorId,
  atMs,
  candidateCommands,
  control,
} = {}) {
  const batch = baseBatch(
    state,
    actorId,
    atMs,
    candidateCommands,
  );
  if (
    !isRecord(state) ||
    !nonEmptyString(actorId) ||
    !safeInteger(atMs, 0) ||
    !Array.isArray(candidateCommands) ||
    candidateCommands.length > MAX_CANDIDATE_COMMANDS
  ) {
    return {
      ...batch,
      reasonCodes: ['DERIVATIVE_CANDIDATE_BATCH_INVALID'],
    };
  }
  const actor = state.actors?.[actorId];
  const account = state.accounts?.[actor?.accountId];
  if (!actor || !account || actor.accountId !== actorId) {
    return {
      ...batch,
      reasonCodes: ['DERIVATIVE_ACTOR_IDENTITY_INVALID'],
    };
  }
  const cancellations = cancellationCandidates(
    candidateCommands,
    state,
    actorId,
    atMs,
  );
  if (
    candidateCommands.some(
      (command) =>
        !validCandidate(command, state, actorId, atMs),
    )
  ) {
    return {
      ...batch,
      commands: cancellations,
      reasonCodes: ['DERIVATIVE_CANDIDATE_COMMAND_INVALID'],
      controlProof: {
        ...batch.controlProof,
        sourceCancelCount: cancellations.length,
        retainedCancelCount: cancellations.length,
      },
    };
  }
  const controlFailures = controlReasons(control, state, atMs);
  const sourceSubmits = candidateCommands.filter(
    (command) => command.type === 'SUBMIT_ORDER',
  );
  const proof = {
    ...batch.controlProof,
    sourceSubmitCount: sourceSubmits.length,
    sourceCancelCount: cancellations.length,
    retainedCancelCount: cancellations.length,
    intensityBps: safeInteger(control?.intensityBps, 0)
      ? control.intensityBps
      : null,
    capacityMultiplierBps:
      account.capacityMultiplierBps ?? null,
  };
  if (controlFailures.length > 0) {
    return {
      ...batch,
      commands: cancellations,
      reasonCodes: controlFailures,
      controlProof: proof,
    };
  }
  if (
    actor.lifecycleStatus !== 'ACTIVE' ||
    account.lifecycleStatus !== 'ACTIVE' ||
    account.riskStatus !== 'NORMAL' ||
    !safeInteger(account.capacityMultiplierBps, 0) ||
    account.capacityMultiplierBps <= 0 ||
    !safeInteger(account.capacityCents, 0) ||
    account.capacityCents <= 0
  ) {
    return {
      ...batch,
      commands: cancellations,
      reasonCodes: ['DERIVATIVE_ACTOR_RISK_GATE_CLOSED'],
      controlProof: proof,
    };
  }

  const retainedSubmissions = [];
  let retainedBatchNotionalCents = 0;
  for (const source of sourceSubmits) {
    if (
      retainedSubmissions.length >=
      control.maxSubmitCommands
    ) {
      break;
    }
    const contract =
      state.universe.futures[source.contractId] ??
      state.universe.options[source.contractId];
    if (!control.allowedContractTypes.includes(contract.type)) {
      continue;
    }
    const scaledQuantity = Math.min(
      control.maxContractsPerOrder,
      Math.floor(
        source.quantity * control.intensityBps /
          BASIS_POINTS,
      ),
    );
    if (scaledQuantity <= 0) continue;
    if (
      actorOpenContractLimitReason(
        state,
        actorId,
        source.contractId,
        source.side,
        scaledQuantity,
      )
    ) {
      continue;
    }
    const command = {
      ...clone(source),
      quantity: scaledQuantity,
    };
    const notionalCents = safeCommandNotionalCents(
      contract,
      command,
    );
    if (
      notionalCents === null ||
      retainedBatchNotionalCents + notionalCents >
        control.maxBatchNotionalCents ||
      retainedBatchNotionalCents + notionalCents >
        account.capacityCents
    ) {
      continue;
    }
    retainedBatchNotionalCents += notionalCents;
    retainedSubmissions.push(command);
  }
  const commands = [
    ...cancellations,
    ...retainedSubmissions,
  ];
  const reasonCodes = [];
  if (
    control.intensityBps === 0 &&
    sourceSubmits.length > 0
  ) {
    reasonCodes.push('SUBMISSION_STRENGTH_ZERO');
  }
  if (
    retainedSubmissions.length < sourceSubmits.length &&
    control.intensityBps > 0
  ) {
    reasonCodes.push('SUBMISSIONS_REDUCED_BY_CONTROL');
  }
  return {
    ...batch,
    status: commands.length > 0 ? 'ready' : 'no_action',
    commands,
    reasonCodes,
    controlProof: {
      ...proof,
      retainedSubmitCount: retainedSubmissions.length,
      retainedBatchNotionalCents,
    },
  };
}

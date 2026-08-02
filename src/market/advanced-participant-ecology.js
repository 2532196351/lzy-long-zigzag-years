const OBSERVATION_SCHEMA =
  'lzy_advanced_participant_observation_v1';
const BATCH_SCHEMA = 'lzy_bounded_order_intent_batch_v1';
const MAX_ACTIVE_SYMBOLS = 8;
const MAX_BATCH_INTENTS = 8;
const BASIS_POINTS = 10_000;
const YI_YUAN_CENTS = 100_000_000 * 100;
const PRIVATE_WHALE_CAPITAL_CEILING_CENTS =
  1_000 * YI_YUAN_CENTS;

export const ADVANCED_PARTICIPANT_ECOLOGY_VERSION =
  'lzy-advanced-participant-ecology-v1';

const SUPPORTED_ACTOR_KINDS = new Set([
  'quant_institution',
  'stabilization_fund',
  'private_whale',
]);

const SUPPORTED_SIDES = new Set(['buy', 'sell']);

function isRecord(value) {
  return value !== null && typeof value === 'object' &&
    !Array.isArray(value);
}

function isSafeInteger(value, minimum = Number.MIN_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function floorToLot(value, lotSize) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value / lotSize) * lotSize;
}

function boundedUnitsFromNotional(notionalCents, priceTicks, lotSize) {
  if (!isSafeInteger(notionalCents, 0) ||
      !isSafeInteger(priceTicks, 1)) {
    return 0;
  }
  return floorToLot(
    Math.floor(notionalCents / priceTicks),
    lotSize,
  );
}

function boundedParticipationUnits(
  expectedDailyUnits,
  participationBps,
  lotSize,
) {
  if (!isSafeInteger(expectedDailyUnits, 0) ||
      !isSafeInteger(participationBps, 0)) {
    return 0;
  }
  const proportionalUnits = Number(
    BigInt(expectedDailyUnits) * BigInt(participationBps) /
      BigInt(BASIS_POINTS),
  );
  return floorToLot(
    proportionalUnits,
    lotSize,
  );
}

function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function deterministicId(prefix, parts) {
  return `${prefix}_${fnv1a32(parts.join('\u001f'))}`;
}

function baseBatch(observation) {
  const actorId = isNonEmptyString(observation?.actor?.id)
    ? observation.actor.id
    : 'unknown_actor';
  const observedCommitSeq = isSafeInteger(
    observation?.observedCommitSeq,
    0,
  )
    ? observation.observedCommitSeq
    : 0;
  const expiresAtMs = isSafeInteger(
    observation?.authorization?.expiresAtMs,
    0,
  )
    ? observation.authorization.expiresAtMs
    : 0;
  const worldSeed = isNonEmptyString(observation?.worldSeed)
    ? observation.worldSeed
    : 'invalid_world_seed';
  const ruleEpoch = isNonEmptyString(observation?.ruleEpoch)
    ? observation.ruleEpoch
    : 'invalid_rule_epoch';

  return {
    schemaVersion: BATCH_SCHEMA,
    authority: 'advisory_intent_only',
    integrationStatus: 'not_integrated',
    decisionId: deterministicId('participant_decision', [
      ADVANCED_PARTICIPANT_ECOLOGY_VERSION,
      worldSeed,
      ruleEpoch,
      String(observedCommitSeq),
      actorId,
    ]),
    actorId,
    observedCommitSeq,
    expiresAtMs,
    status: 'blocked',
    intents: [],
    riskProof: {
      accountCommitSeq: isSafeInteger(
        observation?.accountHot?.commitSeq,
        0,
      )
        ? observation.accountHot.commitSeq
        : null,
      quantityLimits: {},
      selectedQuantity: 0,
    },
    reasonCodes: [],
  };
}

function withOutcome(batch, status, reasonCodes, additions = {}) {
  return {
    ...batch,
    ...additions,
    status,
    reasonCodes: [...reasonCodes],
  };
}

function validateCommonObservation(observation) {
  const reasons = [];
  if (!isRecord(observation) ||
      observation.schemaVersion !== OBSERVATION_SCHEMA) {
    reasons.push('OBSERVATION_SCHEMA_INVALID');
    return reasons;
  }
  if (!isNonEmptyString(observation.worldSeed) ||
      !isNonEmptyString(observation.ruleEpoch) ||
      !isSafeInteger(observation.observedCommitSeq, 0) ||
      !isSafeInteger(observation.nowMs, 0)) {
    reasons.push('OBSERVATION_IDENTITY_INVALID');
  }

  const actor = observation.actor;
  if (!isRecord(actor) || !isNonEmptyString(actor.id) ||
      !SUPPORTED_ACTOR_KINDS.has(actor.kind) ||
      actor.marketPriceWriteAuthority !== 'none') {
    reasons.push('ACTOR_AUTHORITY_INVALID');
  }

  const authorization = observation.authorization;
  if (!isRecord(authorization)) {
    reasons.push('AUTHORIZATION_INVALID');
  } else {
    if (authorization.active !== true ||
        !isSafeInteger(authorization.expiresAtMs, 0) ||
        authorization.expiresAtMs < observation.nowMs) {
      reasons.push('AUTHORIZATION_INACTIVE_OR_EXPIRED');
    }
    if (!Array.isArray(authorization.allowedSymbols) ||
        authorization.allowedSymbols.length > 32 ||
        authorization.allowedSymbols.some(
          (symbol) => !isNonEmptyString(symbol),
        ) ||
        new Set(authorization.allowedSymbols).size !==
          authorization.allowedSymbols.length) {
      reasons.push('AUTHORIZED_SYMBOL_SET_INVALID');
    }
    if (!Array.isArray(authorization.permittedSides) ||
        authorization.permittedSides.length === 0 ||
        authorization.permittedSides.some(
          (side) => !SUPPORTED_SIDES.has(side),
        )) {
      reasons.push('AUTHORIZED_SIDE_SET_INVALID');
    }
    for (const key of [
      'maxOrderNotionalCents',
      'maxPositionNotionalCents',
      'maxGrossNotionalCents',
      'maxWorkingOrders',
      'maxIntents',
    ]) {
      if (!isSafeInteger(authorization[key], 1)) {
        reasons.push('AUTHORIZATION_LIMIT_INVALID');
        break;
      }
    }
    if (!isSafeInteger(authorization.maxParticipationBps, 0) ||
        authorization.maxParticipationBps > BASIS_POINTS ||
        authorization.maxIntents > MAX_BATCH_INTENTS) {
      reasons.push('AUTHORIZATION_LIMIT_INVALID');
    }
  }

  const account = observation.accountHot;
  if (!isRecord(account) ||
      !isSafeInteger(account.commitSeq, 0) ||
      !isSafeInteger(account.cashCents, 0) ||
      !isSafeInteger(account.protectedCashCents, 0) ||
      account.protectedCashCents > account.cashCents ||
      !isRecord(account.holdingsBySymbol) ||
      !isRecord(account.positionNotionalCentsBySymbol) ||
      !isSafeInteger(account.grossNotionalCents, 0) ||
      !isSafeInteger(account.workingOrderCount, 0) ||
      !isSafeInteger(account.drawdownBps, 0) ||
      !isSafeInteger(account.fundingStressBps, 0)) {
    reasons.push('ACCOUNT_HOT_STATE_INVALID');
  } else if (account.commitSeq !== observation.observedCommitSeq) {
    reasons.push('STALE_ACCOUNT_OBSERVATION');
  }

  if (!Array.isArray(observation.activeSymbols)) {
    reasons.push('ACTIVE_SYMBOL_SET_INVALID');
  } else if (observation.activeSymbols.length > MAX_ACTIVE_SYMBOLS) {
    reasons.push('ACTIVE_SYMBOL_LIMIT_EXCEEDED');
  } else {
    const seenSymbols = new Set();
    for (const symbolState of observation.activeSymbols) {
      if (!isValidSymbolState(symbolState) ||
          seenSymbols.has(symbolState?.symbol)) {
        reasons.push('ACTIVE_SYMBOL_SET_INVALID');
        break;
      }
      seenSymbols.add(symbolState.symbol);
    }
  }

  if (isRecord(actor) && isRecord(account)) {
    const riskPolicy = actor.riskPolicy;
    if (actor.kind === 'quant_institution' &&
        (!isRecord(riskPolicy) ||
         !isSafeInteger(riskPolicy.maxDrawdownBps, 0) ||
         !isSafeInteger(riskPolicy.maxFundingStressBps, 0))) {
      reasons.push('RISK_POLICY_INVALID');
    } else if (actor.kind === 'quant_institution') {
      if (account.drawdownBps > riskPolicy.maxDrawdownBps) {
        reasons.push('DRAWDOWN_KILL_SWITCH');
      }
      if (account.fundingStressBps >
          riskPolicy.maxFundingStressBps) {
        reasons.push('FUNDING_STRESS_KILL_SWITCH');
      }
    }
  }

  if (isRecord(authorization) && isRecord(account) &&
      isSafeInteger(authorization.maxWorkingOrders, 1) &&
      account.workingOrderCount >= authorization.maxWorkingOrders) {
    reasons.push('WORKING_ORDER_CAP_REACHED');
  }

  return [...new Set(reasons)];
}

function isValidSymbolState(symbolState) {
  if (!isRecord(symbolState) ||
      !isNonEmptyString(symbolState.symbol) ||
      !isSafeInteger(symbolState.lotSize, 1) ||
      !isSafeInteger(symbolState.bestBidTicks, 1) ||
      !isSafeInteger(symbolState.bestAskTicks, 1) ||
      symbolState.bestBidTicks > symbolState.bestAskTicks ||
      !isSafeInteger(symbolState.visibleBidUnits, 0) ||
      !isSafeInteger(symbolState.visibleAskUnits, 0) ||
      !isSafeInteger(symbolState.expectedDailyUnits, 0) ||
      !isSafeInteger(symbolState.floatUnits, 1) ||
      !isSafeInteger(symbolState.returnBps) ||
      !isSafeInteger(symbolState.liquidityStressBps, 0)) {
    return false;
  }
  return true;
}

function findSymbolState(observation, symbol) {
  return observation.activeSymbols.find(
    (candidate) => candidate.symbol === symbol,
  ) ?? null;
}

function permitted(observation, symbol, side) {
  return observation.authorization.allowedSymbols.includes(symbol) &&
    observation.authorization.permittedSides.includes(side);
}

function quantityEnvelope(
  observation,
  symbolState,
  side,
  options = {},
) {
  const authorization = observation.authorization;
  const account = observation.accountHot;
  const lotSize = symbolState.lotSize;
  const priceTicks = side === 'buy'
    ? symbolState.bestAskTicks
    : symbolState.bestBidTicks;
  const visibleDepth = floorToLot(
    side === 'buy'
      ? symbolState.visibleAskUnits
      : symbolState.visibleBidUnits,
    lotSize,
  );
  const participationBps = clamp(
    Math.min(
      authorization.maxParticipationBps,
      options.maxParticipationBps ?? BASIS_POINTS,
    ),
    0,
    BASIS_POINTS,
  );
  const participation = boundedParticipationUnits(
    symbolState.expectedDailyUnits,
    participationBps,
    lotSize,
  );
  const orderNotional = boundedUnitsFromNotional(
    authorization.maxOrderNotionalCents,
    priceTicks,
    lotSize,
  );
  const availableCash = boundedUnitsFromNotional(
    Math.max(
      0,
      account.cashCents - account.protectedCashCents,
    ),
    priceTicks,
    lotSize,
  );
  const holdings = floorToLot(
    isSafeInteger(account.holdingsBySymbol[symbolState.symbol], 0)
      ? account.holdingsBySymbol[symbolState.symbol]
      : 0,
    lotSize,
  );
  const positionNotional = isSafeInteger(
    account.positionNotionalCentsBySymbol[symbolState.symbol],
    0,
  )
    ? account.positionNotionalCentsBySymbol[symbolState.symbol]
    : 0;
  const position = side === 'buy'
    ? boundedUnitsFromNotional(
        Math.max(
          0,
          authorization.maxPositionNotionalCents -
            positionNotional,
        ),
        priceTicks,
        lotSize,
      )
    : holdings;
  const gross = side === 'buy'
    ? boundedUnitsFromNotional(
        Math.max(
          0,
          authorization.maxGrossNotionalCents -
            account.grossNotionalCents,
        ),
        priceTicks,
        lotSize,
      )
    : holdings;
  const resource = side === 'buy' ? availableCash : holdings;
  const optionLimits = [
    options.remainingUnits,
    options.maxSliceUnits,
    options.exitCapacityUnits,
    options.ticketBudgetCents === undefined
      ? undefined
      : boundedUnitsFromNotional(
          options.ticketBudgetCents,
          priceTicks,
          lotSize,
        ),
  ].filter((value) => value !== undefined)
    .map((value) => floorToLot(value, lotSize));

  const limits = {
    authorizationOrderNotional: orderNotional,
    resource,
    position,
    gross,
    participation,
    visibleDepth,
  };
  if (options.remainingUnits !== undefined) {
    limits.parentRemaining = floorToLot(
      options.remainingUnits,
      lotSize,
    );
  }
  if (options.maxSliceUnits !== undefined) {
    limits.parentSlice = floorToLot(
      options.maxSliceUnits,
      lotSize,
    );
  }
  if (options.exitCapacityUnits !== undefined) {
    limits.exitCapacity = floorToLot(
      options.exitCapacityUnits,
      lotSize,
    );
  }
  if (options.ticketBudgetCents !== undefined) {
    limits.manualTicketBudget = optionLimits.at(-1);
  }

  const quantity = floorToLot(
    Math.min(
      orderNotional,
      resource,
      position,
      gross,
      participation,
      visibleDepth,
      ...optionLimits,
    ),
    lotSize,
  );

  return {
    priceTicks,
    quantity,
    limits,
  };
}

function makeIntent(batch, symbolState, side, quantity, extras = {}) {
  const priceTicks = side === 'buy'
    ? symbolState.bestAskTicks
    : symbolState.bestBidTicks;
  return {
    intentId: deterministicId('order_intent', [
      batch.decisionId,
      symbolState.symbol,
      side,
      String(priceTicks),
      String(quantity),
      extras.parentIntentId ?? '',
    ]),
    type: 'submit_order',
    symbol: symbolState.symbol,
    side,
    orderType: 'limit',
    priceTicks,
    quantity,
    tif: 'IOC',
    ...(extras.parentIntentId
      ? { parentIntentId: extras.parentIntentId }
      : {}),
  };
}

function validateStrategyManifest(manifest) {
  if (!isRecord(manifest) ||
      manifest.schemaVersion !== 'lzy-player-quant-strategy-v1' ||
      !isNonEmptyString(manifest.id) ||
      !isSafeInteger(manifest.cadenceMs, 1) ||
      !isSafeInteger(manifest.entryThresholdBps, 0) ||
      !isRecord(manifest.factors) ||
      !isRecord(manifest.execution)) {
    return false;
  }
  const factorNames = [
    'valuation',
    'quality',
    'momentum',
    'meanReversion',
    'orderImbalance',
  ];
  const suppliedFactorNames = Object.keys(manifest.factors).sort(
    compareText,
  );
  if (suppliedFactorNames.length !== factorNames.length ||
      suppliedFactorNames.some(
        (factorName, index) =>
          factorName !== [...factorNames].sort(compareText)[index],
      )) {
    return false;
  }
  let totalWeight = 0;
  for (const factorName of factorNames) {
    const weight = manifest.factors[factorName];
    if (!isSafeInteger(weight, 0) || weight > BASIS_POINTS) {
      return false;
    }
    totalWeight += weight;
  }
  return totalWeight === BASIS_POINTS &&
    isSafeInteger(manifest.execution.maxOrderBps, 0) &&
    manifest.execution.maxOrderBps <= BASIS_POINTS &&
    isSafeInteger(manifest.execution.maxPositionBps, 0) &&
    manifest.execution.maxPositionBps <= BASIS_POINTS &&
    isSafeInteger(manifest.execution.maxParticipationBps, 0) &&
    manifest.execution.maxParticipationBps <= BASIS_POINTS &&
    ['patient', 'balanced', 'urgent'].includes(
      manifest.execution.urgency,
    );
}

function factorScore(symbolState, manifest) {
  if (!isRecord(symbolState.factorScoresBps)) return null;
  let weighted = 0;
  for (const factorName of Object.keys(manifest.factors)) {
    const score = symbolState.factorScoresBps[factorName];
    const weight = manifest.factors[factorName];
    if (!isSafeInteger(score, -BASIS_POINTS) ||
        score > BASIS_POINTS || !isSafeInteger(weight, 0)) {
      return null;
    }
    weighted += score * weight;
  }
  if (!Number.isSafeInteger(weighted)) return null;
  return Math.round(weighted / BASIS_POINTS);
}

function deriveQuant(batch, observation) {
  const manifest = observation.strategyManifest;
  if (!validateStrategyManifest(manifest)) {
    return withOutcome(batch, 'blocked', [
      'STRATEGY_MANIFEST_INVALID',
    ]);
  }

  const ranked = [];
  for (const symbolState of observation.activeSymbols) {
    const scoreBps = factorScore(symbolState, manifest);
    if (scoreBps === null) {
      return withOutcome(batch, 'blocked', [
        'FACTOR_INPUT_INVALID',
      ]);
    }
    if (Math.abs(scoreBps) < manifest.entryThresholdBps) continue;
    ranked.push({ symbolState, scoreBps });
  }
  ranked.sort((left, right) =>
    Math.abs(right.scoreBps) - Math.abs(left.scoreBps) ||
    compareText(left.symbolState.symbol, right.symbolState.symbol),
  );
  const selected = ranked.find(({ symbolState, scoreBps }) =>
    permitted(
      observation,
      symbolState.symbol,
      scoreBps >= 0 ? 'buy' : 'sell',
    ),
  );
  if (!selected) {
    return withOutcome(batch, 'no_action', [
      'NO_AUTHORIZED_SIGNAL_ABOVE_THRESHOLD',
    ]);
  }

  const side = selected.scoreBps >= 0 ? 'buy' : 'sell';
  const envelope = quantityEnvelope(
    observation,
    selected.symbolState,
    side,
    {
      maxParticipationBps:
        manifest.execution.maxParticipationBps,
    },
  );
  const riskProof = {
    accountCommitSeq: observation.accountHot.commitSeq,
    selectedSymbol: selected.symbolState.symbol,
    selectedSide: side,
    signalScoreBps: selected.scoreBps,
    quantityLimits: envelope.limits,
    selectedQuantity: envelope.quantity,
  };
  if (envelope.quantity <= 0) {
    return withOutcome(batch, 'no_action', [
      'CAPACITY_OR_RESOURCE_LIMIT_ZERO',
    ], { riskProof });
  }

  return withOutcome(batch, 'ready', [], {
    intents: [makeIntent(
      batch,
      selected.symbolState,
      side,
      envelope.quantity,
    )],
    riskProof,
  });
}

function validateManualTicket(ticket, observation) {
  if (!isRecord(ticket) || !isNonEmptyString(ticket.ticketId) ||
      ticket.authorized !== true ||
      !isSafeInteger(ticket.expiresAtMs, 0) ||
      ticket.expiresAtMs < observation.nowMs ||
      !Array.isArray(ticket.allowedSymbols) ||
      ticket.allowedSymbols.length === 0 ||
      ticket.allowedSymbols.some(
        (symbol) => !isNonEmptyString(symbol),
      ) ||
      !isSafeInteger(ticket.remainingBudgetCents, 1) ||
      !isSafeInteger(ticket.maxParticipationBps, 0) ||
      ticket.maxParticipationBps > BASIS_POINTS ||
      !isNonEmptyString(ticket.reasonCode)) {
    return false;
  }
  return true;
}

function deriveStabilization(batch, observation) {
  const policy = observation.actor.stabilizationPolicy;
  if (!isRecord(policy) ||
      !['automatic', 'manual'].includes(policy.mode) ||
      !isSafeInteger(policy.minimumDistressedBreadthBps, 0) ||
      !isSafeInteger(policy.minimumWeightedDeclineBps, 0) ||
      !isSafeInteger(policy.minimumLiquidityStressBps, 0) ||
      policy.permittedSide !== 'buy' ||
      policy.guaranteedFloor !== false) {
    return withOutcome(batch, 'blocked', [
      'STABILIZATION_POLICY_INVALID',
    ]);
  }

  let allowedSymbols;
  let maxParticipationBps =
    observation.authorization.maxParticipationBps;
  let ticketBudgetCents;
  if (policy.mode === 'manual') {
    if (!validateManualTicket(observation.manualTicket, observation)) {
      return withOutcome(batch, 'blocked', [
        'MANUAL_TICKET_REQUIRED',
      ]);
    }
    allowedSymbols = observation.manualTicket.allowedSymbols;
    maxParticipationBps = Math.min(
      maxParticipationBps,
      observation.manualTicket.maxParticipationBps,
    );
    ticketBudgetCents =
      observation.manualTicket.remainingBudgetCents;
  } else {
    const stress = observation.systemicStressHot;
    if (!isRecord(stress) ||
        !isSafeInteger(stress.declineBreadthBps, 0) ||
        !isSafeInteger(stress.weightedMarketReturnBps) ||
        !isSafeInteger(stress.liquidityStressBps, 0) ||
        !Array.isArray(stress.distressedSymbols) ||
        stress.distressedSymbols.some(
          (symbol) => !isNonEmptyString(symbol),
        )) {
      return withOutcome(batch, 'blocked', [
        'SYSTEMIC_STRESS_FRAME_INVALID',
      ]);
    }
    const systemic =
      stress.declineBreadthBps >=
        policy.minimumDistressedBreadthBps &&
      stress.weightedMarketReturnBps <=
        -policy.minimumWeightedDeclineBps &&
      stress.liquidityStressBps >=
        policy.minimumLiquidityStressBps;
    if (!systemic) {
      return withOutcome(batch, 'no_action', [
        'SYSTEMIC_THRESHOLD_NOT_MET',
      ]);
    }
    allowedSymbols = stress.distressedSymbols;
  }

  const candidates = allowedSymbols
    .map((symbol) => findSymbolState(observation, symbol))
    .filter((symbolState) =>
      symbolState !== null &&
      permitted(observation, symbolState.symbol, 'buy'),
    )
    .sort((left, right) =>
      left.returnBps - right.returnBps ||
      compareText(left.symbol, right.symbol),
    );
  const selected = candidates[0];
  if (!selected) {
    return withOutcome(batch, 'no_action', [
      'NO_AUTHORIZED_DISTRESSED_SYMBOL',
    ]);
  }

  const envelope = quantityEnvelope(
    observation,
    selected,
    'buy',
    { maxParticipationBps, ticketBudgetCents },
  );
  const riskProof = {
    accountCommitSeq: observation.accountHot.commitSeq,
    selectedSymbol: selected.symbol,
    selectedSide: 'buy',
    quantityLimits: envelope.limits,
    selectedQuantity: envelope.quantity,
  };
  if (envelope.quantity <= 0) {
    return withOutcome(batch, 'no_action', [
      'CAPACITY_OR_RESOURCE_LIMIT_ZERO',
    ], { riskProof });
  }

  return withOutcome(batch, 'ready', [], {
    intents: [makeIntent(
      batch,
      selected,
      'buy',
      envelope.quantity,
    )],
    riskProof,
  });
}

function deriveWhale(batch, observation) {
  const actor = observation.actor;
  const parent = observation.parentIntent;
  if (!isSafeInteger(actor.controlledCapitalCents, 1) ||
      actor.controlledCapitalCents >
        PRIVATE_WHALE_CAPITAL_CEILING_CENTS ||
      !isRecord(parent) || !isNonEmptyString(parent.id) ||
      !isNonEmptyString(parent.symbol) ||
      !SUPPORTED_SIDES.has(parent.side) ||
      !isSafeInteger(parent.remainingUnits, 1) ||
      !isSafeInteger(parent.maxSliceUnits, 1) ||
      !isSafeInteger(parent.exitCapacityUnits, 1)) {
    return withOutcome(batch, 'blocked', [
      'WHALE_PARENT_INTENT_INVALID',
    ]);
  }
  const symbolState = findSymbolState(observation, parent.symbol);
  if (!symbolState ||
      !permitted(observation, parent.symbol, parent.side)) {
    return withOutcome(batch, 'blocked', [
      'WHALE_PARENT_INTENT_UNAUTHORIZED',
    ]);
  }

  const envelope = quantityEnvelope(
    observation,
    symbolState,
    parent.side,
    {
      maxParticipationBps:
        observation.authorization.maxParticipationBps,
      remainingUnits: parent.remainingUnits,
      maxSliceUnits: parent.maxSliceUnits,
      exitCapacityUnits: parent.exitCapacityUnits,
    },
  );
  const riskProof = {
    accountCommitSeq: observation.accountHot.commitSeq,
    selectedSymbol: symbolState.symbol,
    selectedSide: parent.side,
    controlledCapitalCents: actor.controlledCapitalCents,
    quantityLimits: envelope.limits,
    selectedQuantity: envelope.quantity,
  };
  if (envelope.quantity <= 0) {
    return withOutcome(batch, 'no_action', [
      'CAPACITY_OR_RESOURCE_LIMIT_ZERO',
    ], { riskProof });
  }

  return withOutcome(batch, 'ready', [], {
    intents: [makeIntent(
      batch,
      symbolState,
      parent.side,
      envelope.quantity,
      { parentIntentId: parent.id },
    )],
    riskProof,
  });
}

export function deriveAdvancedParticipantIntents(observation) {
  const batch = baseBatch(observation);
  const reasons = validateCommonObservation(observation);
  if (reasons.length > 0) {
    return withOutcome(batch, 'blocked', reasons);
  }

  switch (observation.actor.kind) {
    case 'quant_institution':
      return deriveQuant(batch, observation);
    case 'stabilization_fund':
      return deriveStabilization(batch, observation);
    case 'private_whale':
      return deriveWhale(batch, observation);
    default:
      return withOutcome(batch, 'blocked', [
        'ACTOR_KIND_UNSUPPORTED',
      ]);
  }
}

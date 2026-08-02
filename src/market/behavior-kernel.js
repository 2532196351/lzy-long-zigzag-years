export const BEHAVIOR_RULE_VERSION =
  'lzy-behavior-kernel-0.3.0';
export const LEGACY_BEHAVIOR_RULE_VERSION =
  'lzy-behavior-kernel-0.2.0';
const OLDEST_BEHAVIOR_RULE_VERSION =
  'lzy-behavior-kernel-0.1.0';

export const BEHAVIOR_LIMITS = Object.freeze({
  maxEpisodes: 6,
  maxActionTrace: 6,
  maxIntentAggregates: 24,
  maxReceiptIds: 64,
  maxSettlementKeys: 64,
  maxRelationshipAccounts: 6,
  maxPublicTradesPerObservation: 8,
});

const MEMORY_EXPOSURE_DECAY_MS = 86_400_000;
const SHORT_MARKOUT_MS = 2_000;
const FINAL_MARKOUT_MS = 8_000;

const RETAIL_PROFILES = Object.freeze([
  {
    id: 'retail_lin_lan',
    name: '林岚',
    accountId: 'npc_value_fund',
    initialOffsetMs: 3_340,
    cadenceMs: 2_450,
    cadenceJitterMs: 310,
    informationDelayMs: 2_400,
    accountAllocationBps: 760,
    populationWeight: 420,
    stableGoals: {
      capitalPreservationBps: 7_400,
      growthBps: 3_100,
      liquidityBps: 5_800,
      socialBelongingBps: 2_100,
    },
    traits: {
      riskToleranceBps: 3_200,
      lossAversionBps: 7_600,
      dispositionBps: 6_800,
      socialLearningBps: 2_400,
      contrarianBps: 4_600,
      patienceBps: 7_800,
      reasoningLevel: 1,
      attentionSlots: 1,
      baseOrderUnits: 5,
    },
  },
  {
    id: 'retail_zhou_qi',
    name: '周启',
    accountId: 'npc_trend_fund',
    initialOffsetMs: 3_610,
    cadenceMs: 2_180,
    cadenceJitterMs: 260,
    informationDelayMs: 1_200,
    accountAllocationBps: 820,
    populationWeight: 360,
    stableGoals: {
      capitalPreservationBps: 2_900,
      growthBps: 7_900,
      liquidityBps: 4_200,
      socialBelongingBps: 5_700,
    },
    traits: {
      riskToleranceBps: 7_300,
      lossAversionBps: 4_900,
      dispositionBps: 3_600,
      socialLearningBps: 6_900,
      contrarianBps: 1_400,
      patienceBps: 2_600,
      reasoningLevel: 2,
      attentionSlots: 2,
      baseOrderUnits: 13,
    },
  },
  {
    id: 'retail_chen_ya',
    name: '陈雅',
    accountId: 'npc_industry_fund',
    initialOffsetMs: 3_880,
    cadenceMs: 2_760,
    cadenceJitterMs: 360,
    informationDelayMs: 3_800,
    accountAllocationBps: 720,
    populationWeight: 280,
    stableGoals: {
      capitalPreservationBps: 5_900,
      growthBps: 5_600,
      liquidityBps: 3_300,
      socialBelongingBps: 2_700,
    },
    traits: {
      riskToleranceBps: 5_100,
      lossAversionBps: 6_300,
      dispositionBps: 4_900,
      socialLearningBps: 2_800,
      contrarianBps: 7_200,
      patienceBps: 6_700,
      reasoningLevel: 2,
      attentionSlots: 2,
      baseOrderUnits: 9,
    },
  },
  {
    id: 'retail_he_yu',
    name: '何予',
    accountId: 'npc_value_fund',
    initialOffsetMs: 4_060,
    cadenceMs: 3_180,
    cadenceJitterMs: 420,
    informationDelayMs: 5_200,
    accountAllocationBps: 610,
    populationWeight: 510,
    stableGoals: {
      capitalPreservationBps: 6_700,
      growthBps: 3_800,
      liquidityBps: 8_100,
      socialBelongingBps: 4_900,
    },
    traits: {
      riskToleranceBps: 3_900,
      lossAversionBps: 7_100,
      dispositionBps: 5_900,
      socialLearningBps: 5_200,
      contrarianBps: 2_600,
      patienceBps: 4_300,
      reasoningLevel: 0,
      attentionSlots: 1,
      baseOrderUnits: 4,
    },
  },
  {
    id: 'retail_sun_ke',
    name: '孙恪',
    accountId: 'npc_trend_fund',
    initialOffsetMs: 4_330,
    cadenceMs: 2_920,
    cadenceJitterMs: 380,
    informationDelayMs: 2_900,
    accountAllocationBps: 670,
    populationWeight: 330,
    stableGoals: {
      capitalPreservationBps: 5_300,
      growthBps: 6_100,
      liquidityBps: 4_600,
      socialBelongingBps: 3_400,
    },
    traits: {
      riskToleranceBps: 5_800,
      lossAversionBps: 8_200,
      dispositionBps: 7_700,
      socialLearningBps: 3_900,
      contrarianBps: 3_100,
      patienceBps: 5_100,
      reasoningLevel: 1,
      attentionSlots: 2,
      baseOrderUnits: 8,
    },
  },
  {
    id: 'retail_fang_ning',
    name: '方宁',
    accountId: 'npc_industry_fund',
    initialOffsetMs: 4_570,
    cadenceMs: 2_360,
    cadenceJitterMs: 290,
    informationDelayMs: 1_700,
    accountAllocationBps: 780,
    populationWeight: 240,
    stableGoals: {
      capitalPreservationBps: 3_600,
      growthBps: 7_200,
      liquidityBps: 5_100,
      socialBelongingBps: 2_900,
    },
    traits: {
      riskToleranceBps: 6_800,
      lossAversionBps: 5_400,
      dispositionBps: 3_200,
      socialLearningBps: 3_300,
      contrarianBps: 5_600,
      patienceBps: 3_500,
      reasoningLevel: 2,
      attentionSlots: 2,
      baseOrderUnits: 11,
    },
  },
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export const RETAIL_AGENT_TEMPLATES = deepFreeze(
  Object.fromEntries(
    RETAIL_PROFILES.map((profile) => [
      profile.id,
      {
        ...profile,
        kind: 'retail',
        strategy: 'bounded_adaptive_retail',
        brokerId: 'broker_lzy',
        fundamentalNoiseBps:
          170 + profile.traits.reasoningLevel * 35,
        valuationMethodWeightsBps: {
          earnings:
            3_500 +
            profile.traits.reasoningLevel * 500,
          book:
            3_800 -
            profile.traits.reasoningLevel * 300,
          freeCashFlow:
            2_700 -
            profile.traits.reasoningLevel * 200,
        },
        riskFractionBps: Math.max(
          240,
          Math.round(
            profile.traits.riskToleranceBps * 0.11,
          ),
        ),
      },
    ]),
  ),
);

export const RETAIL_AGENT_IDS = Object.freeze(
  Object.keys(RETAIL_AGENT_TEMPLATES),
);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hash32(input) {
  let hash = 2166136261;
  for (const character of String(input)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableSignedUnit(seed, agentId, salt) {
  return (
    hash32(`${seed}:${agentId}:${salt}`) / 4294967296 *
      2 -
    1
  );
}

function boundedPush(values, value, maximum) {
  values.push(value);
  if (values.length > maximum) {
    values.splice(0, values.length - maximum);
  }
}

function estimatedOrderFeeCents(
  priceTicks,
  quantity,
  feeRateBps,
  minimumFeeCents,
) {
  return Math.max(
    minimumFeeCents,
    Math.ceil(
      priceTicks * quantity * feeRateBps / 10_000,
    ),
  );
}

/**
 * Compares one contemplated order with the complete private cost stack that
 * the actor can know at decision time. It is deliberately a bounded
 * expectation, not a promise of profit and not a price-setting mechanism.
 */
export function evaluateProfitSeekingOrder({
  side,
  quantity,
  priceTicks,
  expectedExitTicks,
  bestBidTicks,
  bestAskTicks,
  availableAtBestUnits,
  volatilityTicks = 0,
  existingPositionUnits = 0,
  capitalCents,
  riskAversionBps = 5_000,
  drawdownBps = 0,
  tif = 'IOC',
  feeRateBps = 5,
  minimumFeeCents = 5,
  additionalImpactBps = 0,
  strategicBenefitCents = 0,
}) {
  const positiveIntegers = [
    quantity,
    priceTicks,
    expectedExitTicks,
    bestBidTicks,
    bestAskTicks,
    capitalCents,
  ];
  if (
    !['buy', 'sell'].includes(side) ||
    positiveIntegers.some(
      (value) => !Number.isSafeInteger(value) || value <= 0,
    ) ||
    !Number.isSafeInteger(availableAtBestUnits) ||
    availableAtBestUnits < 0 ||
    !Number.isSafeInteger(volatilityTicks) ||
    volatilityTicks < 0 ||
    !Number.isSafeInteger(existingPositionUnits) ||
    !Number.isSafeInteger(riskAversionBps) ||
    riskAversionBps < 0 ||
    riskAversionBps > 10_000 ||
    !Number.isSafeInteger(drawdownBps) ||
    drawdownBps < 0 ||
    drawdownBps > 10_000 ||
    !['IOC', 'GTC'].includes(tif) ||
    !Number.isSafeInteger(feeRateBps) ||
    feeRateBps < 0 ||
    feeRateBps > 10_000 ||
    !Number.isSafeInteger(minimumFeeCents) ||
    minimumFeeCents < 0 ||
    !Number.isSafeInteger(additionalImpactBps) ||
    additionalImpactBps < 0 ||
    additionalImpactBps > 10_000 ||
    !Number.isSafeInteger(strategicBenefitCents) ||
    strategicBenefitCents < 0
  ) {
    throw new TypeError(
      'profit-seeking order inputs are outside the bounded integer contract',
    );
  }
  const direction = side === 'buy' ? 1 : -1;
  const expectedGrossPnlCents =
    direction *
    (expectedExitTicks - priceTicks) *
    quantity;
  const entryFeeCents = estimatedOrderFeeCents(
    priceTicks,
    quantity,
    feeRateBps,
    minimumFeeCents,
  );
  const exitFeeCents = estimatedOrderFeeCents(
    expectedExitTicks,
    quantity,
    feeRateBps,
    minimumFeeCents,
  );
  const estimatedFeesCents =
    entryFeeCents + exitFeeCents;
  const spreadTicks = Math.max(
    0,
    bestAskTicks - bestBidTicks,
  );
  const touchSlippageCents =
    tif === 'IOC'
      ? Math.ceil(spreadTicks * quantity / 2)
      : 0;
  const overflowUnits = Math.max(
    0,
    quantity - availableAtBestUnits,
  );
  const impactStepTicks = Math.max(1, spreadTicks);
  const bookImpactCents =
    tif === 'GTC' || overflowUnits === 0
      ? 0
      : Math.ceil(
          overflowUnits *
            impactStepTicks *
            (
              1 +
              overflowUnits /
                Math.max(1, availableAtBestUnits)
            ),
        );
  const modeledImpactCents = Math.ceil(
    priceTicks *
      quantity *
      additionalImpactBps /
      10_000,
  );
  const expectedImpactCents =
    bookImpactCents + modeledImpactCents;
  const expectedSlippageCents =
    touchSlippageCents + expectedImpactCents;
  const postTradePositionUnits =
    existingPositionUnits + direction * quantity;
  const inventoryRiskDeltaCents =
    (
      Math.abs(postTradePositionUnits) -
      Math.abs(existingPositionUnits)
    ) *
    volatilityTicks *
    riskAversionBps /
    10_000;
  const inventoryRiskCents = Math.max(
    0,
    Math.ceil(inventoryRiskDeltaCents),
  );
  const inventoryRiskReliefCents = Math.max(
    0,
    Math.floor(-inventoryRiskDeltaCents),
  );
  const queueDelayBps =
    tif === 'GTC'
      ? Math.min(
          7_000,
          Math.round(
            availableAtBestUnits *
              7_000 /
              Math.max(
                1,
                availableAtBestUnits + quantity * 4,
              ),
          ),
        )
      : 0;
  const opportunityCostCents =
    tif === 'GTC'
      ? Math.ceil(
          Math.max(
            0,
            expectedGrossPnlCents +
              strategicBenefitCents +
              inventoryRiskReliefCents,
          ) *
            (
              1_500 +
              Math.min(1_500, volatilityTicks * 150) +
              queueDelayBps
            ) /
            10_000,
        )
      : 0;
  const drawdownRiskCents = Math.ceil(
    (
      Math.max(0, expectedGrossPnlCents) +
      Math.abs(postTradePositionUnits) *
        Math.max(1, volatilityTicks)
    ) *
      drawdownBps /
      10_000,
  );
  const expectedNetPnlCents =
    expectedGrossPnlCents -
    estimatedFeesCents -
    expectedSlippageCents -
    inventoryRiskCents -
    opportunityCostCents -
    drawdownRiskCents +
    inventoryRiskReliefCents +
    strategicBenefitCents;
  return {
    expectedGrossPnlCents,
    estimatedFeesCents,
    expectedSlippageCents,
    expectedImpactCents,
    inventoryRiskCents,
    inventoryRiskReliefCents,
    opportunityCostCents,
    drawdownRiskCents,
    strategicBenefitCents,
    expectedNetPnlCents,
    expectedReturnBps: Math.round(
      expectedNetPnlCents * 10_000 /
        Math.max(1, capitalCents),
    ),
    postTradePositionUnits,
    shouldTrade: expectedNetPnlCents > 0,
  };
}

function initialBeliefs(world, agent) {
  return Object.fromEntries(
    Object.entries(world.market.securities).map(
      ([symbol, security]) => {
        const priceTicks = Math.max(
          1,
          Math.round(Number(security.lastPrice) * 100),
        );
        return [
          symbol,
          {
            convictionBps: Math.round(
              stableSignedUnit(
                world.world.seed,
                agent.id,
                `opening-belief:${symbol}`,
              ) *
                (
                  agent.kind === 'retail'
                    ? 1_600
                    : 600
                ),
            ),
            valueGapBps: 0,
            momentumBps: 0,
            flowBps: 0,
            referencePriceTicks: priceTicks,
            lastUpdatedMs: 0,
          },
        ];
      },
    ),
  );
}

export function createBehaviorState({
  world,
  agent,
  accountBaseline,
  allocationBps = 10_000,
}) {
  const symbols = Object.keys(world.market.securities);
  const allocation = clamp(
    Math.round(allocationBps),
    1,
    10_000,
  );
  const traits = cloneJson(
    agent.traits ?? {
      riskToleranceBps: 5_000,
      lossAversionBps: 5_000,
      dispositionBps: 2_500,
      socialLearningBps: 2_500,
      contrarianBps: 2_500,
      patienceBps: 5_000,
      reasoningLevel: agent.kind === 'maker' ? 2 : 1,
      attentionSlots: Math.min(2, symbols.length),
      baseOrderUnits: agent.kind === 'maker' ? 24 : 12,
    },
  );
  const stableGoals = cloneJson(
    agent.stableGoals ?? {
      capitalPreservationBps:
        agent.kind === 'maker' ? 7_000 : 5_000,
      growthBps: agent.kind === 'institution' ? 6_500 : 4_500,
      liquidityBps: agent.kind === 'maker' ? 8_500 : 4_500,
      socialBelongingBps: 1_000,
    },
  );
  const allocatedHoldings = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      Math.floor(
        (accountBaseline.holdings[symbol] ?? 0) *
          allocation /
          10_000,
      ),
    ]),
  );
  return {
    ruleVersion: BEHAVIOR_RULE_VERSION,
    persona: {
      stableGoals,
      traits,
      populationWeight: agent.populationWeight ?? 1,
      groupLayer:
        agent.kind === 'retail'
          ? 'named_persona_over_bounded_household_cluster'
          : 'single_licensed_actor',
    },
    account: {
      capitalOwnerId: agent.id,
      executionAccountId: agent.accountId ?? agent.id,
      allocationBps: allocation,
      cashEnvelopeCents: Math.max(
        1,
        Math.floor(accountBaseline.cashCents * allocation / 10_000),
      ),
      initialHoldings: allocatedHoldings,
      settledNetUnits: Object.fromEntries(
        symbols.map((symbol) => [symbol, 0]),
      ),
      openExposureCostTicks: Object.fromEntries(
        symbols.map((symbol) => [symbol, 0]),
      ),
      settledNetCashCents: 0,
    },
    performance: {
      accountingBasis: 'world_start',
      realizedGrossPnlCents: 0,
      feesPaidCents: 0,
      realizedNetPnlCents: 0,
      tradedNotionalCents: 0,
      markedPnlCents: 0,
      peakMarkedPnlCents: 0,
      drawdownCents: 0,
      drawdownBps: 0,
      lastSettlementCommitSeq: 0,
    },
    cognition: {
      attentionSymbols: symbols.slice(
        0,
        clamp(traits.attentionSlots, 1, symbols.length),
      ),
      beliefs: initialBeliefs(world, agent),
      confidenceBps: 5_000,
      lastObservationMs: 0,
    },
    pressure: {
      stressBps: 0,
      liquidityBps: 0,
      capacityBps: 0,
      rejectionBps: 0,
    },
    memory: {
      revision: 0,
      publicCursorCommitSeq: 0,
      ownCursorCommitSeq: 0,
      episodes: [],
      intentAggregates: [],
      receiptIds: [],
      settlementKeys: [],
      relationshipAccounts: {},
    },
    learning: {
      adaptationBps: 0,
      successfulSignals: 0,
      failedSignals: 0,
    },
    lastIntent: null,
    actionTrace: [],
  };
}

function applyExposureFillToLedger(
  ledger,
  {
    symbol,
    side,
    quantity,
    priceTicks,
  },
) {
  const signedUnits = side === 'buy' ? quantity : -quantity;
  const previousUnits = ledger.units[symbol] ?? 0;
  const previousCostTicks = ledger.costTicks[symbol] ?? 0;
  const nextUnits = previousUnits + signedUnits;
  if (nextUnits === 0) {
    ledger.costTicks[symbol] = 0;
  } else if (
    previousUnits === 0 ||
    Math.sign(previousUnits) !== Math.sign(nextUnits)
  ) {
    ledger.costTicks[symbol] = priceTicks;
  } else if (Math.sign(previousUnits) === Math.sign(signedUnits)) {
    ledger.costTicks[symbol] = Math.round(
      (
        Math.abs(previousUnits) * previousCostTicks +
        Math.abs(signedUnits) * priceTicks
      ) /
        Math.abs(nextUnits),
    );
  }
  ledger.units[symbol] = nextUnits;
}

function upgradeLegacyEvaluation(record) {
  if (!record || record.evaluatedAtMs === undefined) return;
  record.evaluationStage = 'legacy_final';
  record.evaluationCount = 1;
  record.successfulSignalDelta =
    record.markoutTicks > 0 ? 1 : 0;
  record.failedSignalDelta =
    record.markoutTicks < 0 ? 1 : 0;
  delete record.nextEvaluationMs;
}

function legacyBehaviorHasPartialNewSchema(behavior) {
  const records = [
    ...(behavior?.memory?.episodes ?? []),
    ...(behavior?.memory?.intentAggregates ?? []),
    ...(behavior?.actionTrace ?? []).map(
      (action) => action?.settlementAggregate,
    ),
  ].filter(Boolean);
  return Boolean(
    Object.hasOwn(
      behavior?.memory ?? {},
      'settlementKeys',
    ) ||
      Object.hasOwn(
        behavior?.account ?? {},
        'openExposureCostTicks',
      ) ||
      records.some((record) =>
        [
          'evaluationStage',
          'evaluationCount',
          'nextEvaluationMs',
          'successfulSignalDelta',
          'failedSignalDelta',
        ].some((key) => Object.hasOwn(record, key)),
      )
  );
}

function attachProfitSeekingSchema(
  behavior,
  {
    agentId = null,
    executionAccountId = null,
  } = {},
) {
  if (
    Object.hasOwn(
      behavior?.account ?? {},
      'executionAccountId',
    ) ||
    Object.hasOwn(behavior ?? {}, 'performance')
  ) {
    throw new Error(
      `Unsupported partial behavior schema: ${behavior?.ruleVersion}`,
    );
  }
  const legacyExecutionAccountId =
    executionAccountId ??
    behavior.account.capitalOwnerId;
  behavior.account.executionAccountId =
    legacyExecutionAccountId;
  behavior.account.capitalOwnerId =
    agentId ?? behavior.account.capitalOwnerId;
  behavior.performance = {
    accountingBasis: 'migration_forward_only',
    realizedGrossPnlCents: 0,
    feesPaidCents: 0,
    realizedNetPnlCents: 0,
    tradedNotionalCents: 0,
    markedPnlCents: 0,
    peakMarkedPnlCents: 0,
    drawdownCents: 0,
    drawdownBps: 0,
    lastSettlementCommitSeq:
      behavior.memory?.ownCursorCommitSeq ?? 0,
  };
  behavior.ruleVersion = BEHAVIOR_RULE_VERSION;
}

/**
 * Upgrades the only prior behavior checkpoint without inventing private
 * counterpart identities. Newly introduced ledgers are derived from settled
 * intent aggregates; partially upgraded or future states remain fail-closed.
 */
export function migrateBehaviorState(
  behavior,
  symbols,
  identity = {},
) {
  if (behavior?.ruleVersion === BEHAVIOR_RULE_VERSION) {
    return false;
  }
  if (behavior?.ruleVersion === LEGACY_BEHAVIOR_RULE_VERSION) {
    if (!Array.isArray(symbols) || symbols.length === 0) {
      throw new Error(
        `Unsupported behavior schema: ${behavior?.ruleVersion}`,
      );
    }
    attachProfitSeekingSchema(behavior, identity);
    return true;
  }
  if (
    behavior?.ruleVersion !== OLDEST_BEHAVIOR_RULE_VERSION ||
    !Array.isArray(symbols) ||
    symbols.length === 0 ||
    legacyBehaviorHasPartialNewSchema(behavior)
  ) {
    throw new Error(
      `Unsupported behavior schema: ${behavior?.ruleVersion}`,
    );
  }

  const anonymousLegacyCohort =
    'venue:continuous_lob:liquidity_provider';
  const legacyRelationships = Object.values(
    behavior.memory?.relationshipAccounts ?? {},
  );
  if (legacyRelationships.length > 0) {
    const encounters = legacyRelationships.reduce(
      (sum, relationship) =>
        sum + (relationship.encounters ?? 0),
      0,
    );
    const netUnits = legacyRelationships.reduce(
      (sum, relationship) =>
        sum + (relationship.netUnits ?? 0),
      0,
    );
    const weightedTrust = legacyRelationships.reduce(
      (sum, relationship) =>
        sum +
        (relationship.trustBps ?? 5_000) *
          Math.max(1, relationship.encounters ?? 0),
      0,
    );
    behavior.memory.relationshipAccounts = {
      [anonymousLegacyCohort]: {
        encounters,
        netUnits,
        trustBps: clamp(
          Math.round(
            weightedTrust / Math.max(1, encounters),
          ),
          1_000,
          9_000,
        ),
      },
    };
  } else {
    behavior.memory.relationshipAccounts = {};
  }

  behavior.memory.episodes = (
    behavior.memory.episodes ?? []
  ).filter(
    (episode) =>
      episode.kind !== 'public_flow' ||
      symbols.includes(episode.symbol),
  );
  for (const episode of behavior.memory.episodes) {
    if (episode.kind === 'own_fill') {
      episode.counterpartyAccountId =
        anonymousLegacyCohort;
      upgradeLegacyEvaluation(episode);
    } else if (episode.kind === 'public_flow') {
      episode.overflowTradeCount ??= 0;
    }
  }
  for (const aggregate of behavior.memory.intentAggregates ?? []) {
    aggregate.counterpartyAccountId =
      anonymousLegacyCohort;
    upgradeLegacyEvaluation(aggregate);
  }
  for (const action of behavior.actionTrace ?? []) {
    if (action.settlementAggregate) {
      action.settlementAggregate.counterpartyAccountId =
        anonymousLegacyCohort;
      upgradeLegacyEvaluation(action.settlementAggregate);
    }
  }
  if (behavior.lastIntent?.settlementAggregate) {
    behavior.lastIntent.settlementAggregate.counterpartyAccountId =
      anonymousLegacyCohort;
    upgradeLegacyEvaluation(
      behavior.lastIntent.settlementAggregate,
    );
  }

  const aggregates = [
    ...(behavior.memory.intentAggregates ?? []),
  ].sort(
    (left, right) =>
      left.commitSeq - right.commitSeq ||
      left.tradeId.localeCompare(right.tradeId) ||
      left.side.localeCompare(right.side),
  );
  behavior.memory.settlementKeys = [
    ...new Set(
      aggregates.map(
        (aggregate) =>
          `${aggregate.tradeId}:${aggregate.side}`,
      ),
    ),
  ].slice(-BEHAVIOR_LIMITS.maxSettlementKeys);

  const ledger = {
    units: Object.fromEntries(
      symbols.map((symbol) => [symbol, 0]),
    ),
    costTicks: Object.fromEntries(
      symbols.map((symbol) => [symbol, 0]),
    ),
  };
  for (const aggregate of aggregates) {
    if (
      symbols.includes(aggregate.symbol) &&
      (aggregate.side === 'buy' ||
        aggregate.side === 'sell') &&
      Number.isSafeInteger(aggregate.quantity) &&
      aggregate.quantity > 0 &&
      Number.isSafeInteger(aggregate.priceTicks) &&
      aggregate.priceTicks > 0
    ) {
      applyExposureFillToLedger(ledger, aggregate);
    }
  }
  behavior.account.openExposureCostTicks =
    Object.fromEntries(
      symbols.map((symbol) => {
        const targetUnits =
          behavior.account.settledNetUnits[symbol];
        if (targetUnits === 0) return [symbol, 0];
        if (ledger.units[symbol] === targetUnits) {
          return [symbol, ledger.costTicks[symbol]];
        }
        const targetSide = targetUnits > 0 ? 'buy' : 'sell';
        const fallback =
          [...aggregates]
            .reverse()
            .find(
              (aggregate) =>
                aggregate.symbol === symbol &&
                aggregate.side === targetSide,
            )?.priceTicks ??
          behavior.cognition.beliefs[symbol]
            .referencePriceTicks;
        return [symbol, fallback];
      }),
    );
  behavior.ruleVersion = LEGACY_BEHAVIOR_RULE_VERSION;
  attachProfitSeekingSchema(behavior, identity);
  return true;
}

function episodeSalience(episode) {
  if (episode.kind === 'own_fill') return 9_000;
  if (episode.kind === 'order_rejection') return 7_500;
  return clamp(
    1_500 +
      Math.abs(episode.netSignedQuantity ?? 0) * 8 +
      Math.abs(episode.priceMoveTicks ?? 0) * 400,
    1_000,
    8_000,
  );
}

function trimMemoryEpisodes(behavior) {
  while (
    behavior.memory.episodes.length >
    BEHAVIOR_LIMITS.maxEpisodes
  ) {
    const removable = behavior.memory.episodes
      .map((episode, index) => ({ episode, index }))
      .filter(
        ({ episode }) =>
          !(
            episode.kind === 'own_fill' &&
            episode.evaluationStage !== 'final'
          ),
      )
      .sort(
        (left, right) =>
          left.episode.salienceBps -
            right.episode.salienceBps ||
          left.episode.memoryRevision -
            right.episode.memoryRevision ||
          left.episode.id.localeCompare(right.episode.id),
      );
    let removeIndex = removable[0]?.index ?? -1;
    if (removeIndex < 0) {
      removeIndex = 0;
    }
    const removedId =
      behavior.memory.episodes[removeIndex]?.id;
    for (const action of behavior.actionTrace ?? []) {
      if (
        action.usedMemoryEpisodeId === removedId
      ) {
        action.usedMemoryEpisodeId = null;
      }
    }
    if (
      behavior.lastIntent?.usedMemoryEpisodeId === removedId
    ) {
      behavior.lastIntent.usedMemoryEpisodeId = null;
    }
    behavior.memory.episodes.splice(removeIndex, 1);
  }
}

function remember(behavior, episode) {
  behavior.memory.revision += 1;
  behavior.memory.episodes.push({
    ...episode,
    memoryRevision: behavior.memory.revision,
    salienceBps: episodeSalience(episode),
  });
  trimMemoryEpisodes(behavior);
  return behavior.memory.revision;
}

function updateRelationship(behavior, accountId, direction) {
  if (!accountId) return;
  const relationships = behavior.memory.relationshipAccounts;
  const current = relationships[accountId] ?? {
    encounters: 0,
    netUnits: 0,
    trustBps: 5_000,
  };
  current.encounters += 1;
  current.netUnits += direction;
  relationships[accountId] = current;
  const entries = Object.entries(relationships);
  if (entries.length > BEHAVIOR_LIMITS.maxRelationshipAccounts) {
    entries
      .sort(
        (left, right) =>
          left[1].encounters - right[1].encounters ||
          left[0].localeCompare(right[0]),
      )
      .slice(
        0,
        entries.length -
          BEHAVIOR_LIMITS.maxRelationshipAccounts,
      )
      .forEach(([id]) => delete relationships[id]);
  }
}

function reverseEvaluation(behavior, evaluation) {
  if (evaluation?.evaluatedAtMs === undefined) return;
  behavior.learning.successfulSignals = Math.max(
    0,
    behavior.learning.successfulSignals -
      (
        evaluation.successfulSignalDelta ??
        (evaluation.markoutTicks > 0 ? 1 : 0)
      ),
  );
  behavior.learning.failedSignals = Math.max(
    0,
    behavior.learning.failedSignals -
      (
        evaluation.failedSignalDelta ??
        (evaluation.markoutTicks < 0 ? 1 : 0)
      ),
  );
  const fallbackLearningDelta =
    evaluation.markoutTicks > 0
      ? 90
      : evaluation.markoutTicks < 0
        ? -130
        : 0;
  behavior.learning.adaptationBps = clamp(
    behavior.learning.adaptationBps -
      (
        evaluation.learningDeltaBps ??
        fallbackLearningDelta
      ),
    -3_000,
    3_000,
  );
  const relationship =
    behavior.memory.relationshipAccounts[
      evaluation.counterpartyAccountId
    ];
  if (relationship) {
    const fallbackTrustDelta =
      evaluation.markoutTicks > 0
        ? 80
        : evaluation.markoutTicks < 0
          ? -120
          : 0;
    relationship.trustBps = clamp(
      relationship.trustBps -
        (
          evaluation.relationshipTrustDeltaBps ??
          fallbackTrustDelta
        ),
      1_000,
      9_000,
    );
  }
}

function clearEvaluation(evaluation) {
  if (!evaluation) return;
  delete evaluation.evaluatedAtMs;
  delete evaluation.markoutTicks;
  delete evaluation.learningDeltaBps;
  delete evaluation.relationshipTrustDeltaBps;
  delete evaluation.evaluationStage;
  delete evaluation.evaluationCount;
  delete evaluation.nextEvaluationMs;
  delete evaluation.successfulSignalDelta;
  delete evaluation.failedSignalDelta;
}

function matchingIntentAction(
  behavior,
  intentId,
) {
  return [...behavior.actionTrace]
    .reverse()
    .find((entry) => entry.intentId === intentId);
}

function matchingIntentAggregate(
  behavior,
  intentId,
  symbol = null,
  side = null,
) {
  return [...behavior.memory.intentAggregates]
    .reverse()
    .find(
      (aggregate) =>
        aggregate.intentId === intentId &&
        (
          symbol === null ||
          aggregate.symbol === symbol
        ) &&
        (
          side === null ||
          aggregate.side === side
        ),
    );
}

function trimIntentAggregates(behavior) {
  while (
    behavior.memory.intentAggregates.length >
    BEHAVIOR_LIMITS.maxIntentAggregates
  ) {
    const retainedEpisodeKeys = new Set(
      behavior.memory.episodes
        .filter((episode) => episode.kind === 'own_fill')
        .map(
          (episode) =>
            `${episode.intentId}:${episode.symbol}:${episode.side}`,
        ),
    );
    const isRetainedEpisodeAggregate = (aggregate) =>
      retainedEpisodeKeys.has(
        `${aggregate.intentId}:${aggregate.symbol}:` +
          `${aggregate.side}`,
      );
    let removeIndex =
      behavior.memory.intentAggregates.findIndex(
        (aggregate) => {
          if (isRetainedEpisodeAggregate(aggregate)) {
            return false;
          }
          const action = matchingIntentAction(
            behavior,
            aggregate.intentId,
          );
          return Boolean(
            action &&
              (
                action.rejectedOrderCount > 0 ||
                action.filledQuantity >= action.quantity
              ),
          );
        },
      );
    if (removeIndex < 0) {
      removeIndex =
        behavior.memory.intentAggregates.findIndex(
          (aggregate) =>
            !isRetainedEpisodeAggregate(aggregate) &&
            aggregate.evaluatedAtMs !== undefined,
        );
    }
    if (removeIndex < 0) {
      removeIndex =
        behavior.memory.intentAggregates.findIndex(
          (aggregate) =>
            !isRetainedEpisodeAggregate(aggregate),
        );
    }
    if (removeIndex < 0) removeIndex = 0;
    behavior.memory.intentAggregates.splice(removeIndex, 1);
  }
}

function settlementAggregateFromEpisode(episode) {
  if (!episode || episode.kind !== 'own_fill') return null;
  return {
    symbol: episode.symbol,
    side: episode.side,
    quantity: episode.quantity,
    grossPriceTicks:
      episode.priceTicks * episode.quantity,
    feeCents: 0,
    priceTicks: episode.priceTicks,
    virtualMs: episode.virtualMs,
    tradeId: episode.tradeId,
    factId: episode.factId,
    commitSeq: episode.commitSeq,
    counterpartyAccountId:
      episode.counterpartyAccountId,
    ...(
      episode.evaluatedAtMs === undefined
        ? {}
        : {
            evaluatedAtMs: episode.evaluatedAtMs,
            markoutTicks: episode.markoutTicks,
            learningDeltaBps: episode.learningDeltaBps ?? 0,
            relationshipTrustDeltaBps:
              episode.relationshipTrustDeltaBps ?? 0,
            evaluationStage: episode.evaluationStage,
            evaluationCount: episode.evaluationCount,
            successfulSignalDelta:
              episode.successfulSignalDelta ?? 0,
            failedSignalDelta:
              episode.failedSignalDelta ?? 0,
            ...(
              episode.nextEvaluationMs === undefined
                ? {}
                : {
                    nextEvaluationMs:
                      episode.nextEvaluationMs,
                  }
            ),
          }
    ),
  };
}

function mergeSettlementAggregate(
  aggregate,
  {
    trade,
    side,
    counterpartyAccountId,
  },
) {
  const previousQuantity = aggregate?.quantity ?? 0;
  const quantity = previousQuantity + trade.quantity;
  const grossPriceTicks =
    (aggregate?.grossPriceTicks ?? 0) +
    trade.priceTicks * trade.quantity;
  return {
    symbol: trade.symbol,
    side,
    quantity,
    grossPriceTicks,
    feeCents:
      (aggregate?.feeCents ?? 0) +
      (trade.feeCents ?? 0),
    priceTicks: Math.round(grossPriceTicks / quantity),
    virtualMs: Math.max(
      aggregate?.virtualMs ?? 0,
      trade.virtualMs,
    ),
    tradeId: trade.id,
    factId: trade.factId,
    commitSeq: trade.commitSeq,
    counterpartyAccountId,
  };
}

function copyEpisodeEvaluationToAction(
  behavior,
  episode,
) {
  const intentAggregate = matchingIntentAggregate(
    behavior,
    episode.intentId,
    episode.symbol,
    episode.side,
  );
  if (intentAggregate) {
    intentAggregate.evaluatedAtMs = episode.evaluatedAtMs;
    intentAggregate.markoutTicks = episode.markoutTicks;
    intentAggregate.learningDeltaBps =
      episode.learningDeltaBps ?? 0;
    intentAggregate.relationshipTrustDeltaBps =
      episode.relationshipTrustDeltaBps ?? 0;
    intentAggregate.evaluationStage =
      episode.evaluationStage;
    intentAggregate.evaluationCount =
      episode.evaluationCount;
    intentAggregate.successfulSignalDelta =
      episode.successfulSignalDelta ?? 0;
    intentAggregate.failedSignalDelta =
      episode.failedSignalDelta ?? 0;
    if (episode.nextEvaluationMs === undefined) {
      delete intentAggregate.nextEvaluationMs;
    } else {
      intentAggregate.nextEvaluationMs =
        episode.nextEvaluationMs;
    }
  }
  const action = matchingIntentAction(
    behavior,
    episode.intentId,
  );
  const aggregate = action?.settlementAggregate;
  if (
    !aggregate ||
    aggregate.symbol !== episode.symbol ||
    aggregate.side !== episode.side
  ) {
    return;
  }
  aggregate.evaluatedAtMs = episode.evaluatedAtMs;
  aggregate.markoutTicks = episode.markoutTicks;
  aggregate.learningDeltaBps =
    episode.learningDeltaBps ?? 0;
  aggregate.relationshipTrustDeltaBps =
    episode.relationshipTrustDeltaBps ?? 0;
  aggregate.evaluationStage = episode.evaluationStage;
  aggregate.evaluationCount = episode.evaluationCount;
  aggregate.successfulSignalDelta =
    episode.successfulSignalDelta ?? 0;
  aggregate.failedSignalDelta =
    episode.failedSignalDelta ?? 0;
  if (episode.nextEvaluationMs === undefined) {
    delete aggregate.nextEvaluationMs;
  } else {
    aggregate.nextEvaluationMs = episode.nextEvaluationMs;
  }
}

function nonZeroSignedRound(value) {
  if (value === 0) return 0;
  const rounded = Math.round(value);
  if (rounded !== 0) return rounded;
  return value > 0 ? 1 : -1;
}

function outcomeExposureWeightBps(behavior, episode) {
  const notionalCents =
    episode.priceTicks * episode.quantity;
  return clamp(
    Math.round(
      Math.sqrt(
        notionalCents /
          Math.max(1, behavior.account.cashEnvelopeCents),
      ) * 10_000,
    ),
    500,
    10_000,
  );
}

function markoutLearningDeltaBps(
  behavior,
  episode,
  markoutTicks,
  horizonWeightBps,
) {
  if (markoutTicks === 0) return 0;
  const returnMagnitudeBps = clamp(
    Math.round(
      Math.abs(markoutTicks) *
        10_000 /
        Math.max(1, episode.priceTicks),
    ),
    1,
    4_000,
  );
  const magnitudeScore = clamp(
    30 + Math.round(returnMagnitudeBps / 4),
    30,
    900,
  );
  const asymmetricScore =
    markoutTicks > 0
      ? magnitudeScore
      : -Math.round(magnitudeScore * 1.35);
  return nonZeroSignedRound(
    asymmetricScore *
      outcomeExposureWeightBps(behavior, episode) /
      10_000 *
      horizonWeightBps /
      10_000,
  );
}

function markoutTrustDeltaBps(
  behavior,
  episode,
  markoutTicks,
  horizonWeightBps,
) {
  if (markoutTicks === 0) return 0;
  const base = markoutTicks > 0 ? 60 : -90;
  return nonZeroSignedRound(
    base *
      outcomeExposureWeightBps(behavior, episode) /
      10_000 *
      horizonWeightBps /
      10_000,
  );
}

function applyMarkoutEvaluation(
  behavior,
  episode,
  {
    nowMs,
    priceTicks,
    stage,
  },
) {
  const markoutTicks =
    (priceTicks - episode.priceTicks) *
    (episode.side === 'buy' ? 1 : -1);
  const horizonWeightBps =
    stage === 'short' ? 4_000 : 6_000;
  const requestedLearningDelta =
    markoutLearningDeltaBps(
      behavior,
      episode,
      markoutTicks,
      horizonWeightBps,
    );
  const previousAdaptationBps =
    behavior.learning.adaptationBps;
  behavior.learning.adaptationBps = clamp(
    behavior.learning.adaptationBps +
      requestedLearningDelta,
    -3_000,
    3_000,
  );
  const learningDeltaBps =
    behavior.learning.adaptationBps -
    previousAdaptationBps;
  const successfulSignalDelta =
    markoutTicks > 0 ? 1 : 0;
  const failedSignalDelta =
    markoutTicks < 0 ? 1 : 0;
  behavior.learning.successfulSignals +=
    successfulSignalDelta;
  behavior.learning.failedSignals +=
    failedSignalDelta;

  const relationship =
    behavior.memory.relationshipAccounts[
      episode.counterpartyAccountId
    ];
  let relationshipTrustDeltaBps = 0;
  if (relationship && markoutTicks !== 0) {
    const previousTrustBps = relationship.trustBps;
    relationship.trustBps = clamp(
      relationship.trustBps +
        markoutTrustDeltaBps(
          behavior,
          episode,
          markoutTicks,
          horizonWeightBps,
        ),
      1_000,
      9_000,
    );
    relationshipTrustDeltaBps =
      relationship.trustBps - previousTrustBps;
  }

  episode.evaluatedAtMs = nowMs;
  episode.markoutTicks = markoutTicks;
  episode.learningDeltaBps =
    (episode.learningDeltaBps ?? 0) +
    learningDeltaBps;
  episode.relationshipTrustDeltaBps =
    (episode.relationshipTrustDeltaBps ?? 0) +
    relationshipTrustDeltaBps;
  episode.successfulSignalDelta =
    (episode.successfulSignalDelta ?? 0) +
    successfulSignalDelta;
  episode.failedSignalDelta =
    (episode.failedSignalDelta ?? 0) +
    failedSignalDelta;
  episode.evaluationCount =
    (episode.evaluationCount ?? 0) + 1;
  episode.evaluationStage = stage;
  if (stage === 'short') {
    episode.nextEvaluationMs =
      episode.virtualMs + FINAL_MARKOUT_MS;
  } else {
    delete episode.nextEvaluationMs;
  }
  copyEpisodeEvaluationToAction(behavior, episode);
}

export function refreshBehaviorMarkToMarket(
  behavior,
  symbols,
) {
  const openMarkToMarketPnlCents = Object.entries(
    symbols,
  ).reduce((sum, [symbol, observation]) => {
    const units =
      behavior.account.settledNetUnits[symbol] ?? 0;
    const costTicks =
      behavior.account.openExposureCostTicks[symbol] ?? 0;
    if (units === 0 || costTicks <= 0) return sum;
    return (
      sum +
      units * (observation.priceTicks - costTicks)
    );
  }, 0);
  behavior.performance.markedPnlCents =
    behavior.performance.realizedNetPnlCents +
    openMarkToMarketPnlCents;
  behavior.performance.peakMarkedPnlCents = Math.max(
    behavior.performance.peakMarkedPnlCents,
    behavior.performance.markedPnlCents,
  );
  behavior.performance.drawdownCents = Math.max(
    0,
    behavior.performance.peakMarkedPnlCents -
      behavior.performance.markedPnlCents,
  );
  behavior.performance.drawdownBps = clamp(
    Math.round(
      behavior.performance.drawdownCents *
        10_000 /
        Math.max(
          1,
          behavior.account.cashEnvelopeCents,
        ),
    ),
    0,
    10_000,
  );
  return behavior.performance.markedPnlCents;
}

export function observeBehaviorState(
  behavior,
  {
    nowMs,
    symbols,
    markPrices = symbols,
    publicTrades = [],
    capacityPressureBps = 0,
    fundingStressBps = 0,
  },
) {
  let evaluatedEpisodes = 0;
  for (const episode of behavior.memory.episodes) {
    if (episode.kind !== 'own_fill' || !symbols[episode.symbol]) {
      continue;
    }
    const stage =
      episode.evaluationStage === undefined &&
      nowMs >= episode.virtualMs + SHORT_MARKOUT_MS
        ? 'short'
        : episode.evaluationStage === 'short' &&
            nowMs >= episode.virtualMs + FINAL_MARKOUT_MS
          ? 'final'
          : null;
    if (!stage) continue;
    applyMarkoutEvaluation(behavior, episode, {
      nowMs,
      priceTicks: symbols[episode.symbol].priceTicks,
      stage,
    });
    evaluatedEpisodes += 1;
  }
  if (evaluatedEpisodes > 0) {
    behavior.memory.revision += 1;
  }
  refreshBehaviorMarkToMarket(behavior, markPrices);
  behavior.pressure.capacityBps = clamp(
    Math.round(capacityPressureBps),
    0,
    10_000,
  );
  behavior.pressure.liquidityBps = clamp(
    Math.round(fundingStressBps),
    0,
    10_000,
  );
  behavior.pressure.rejectionBps = Math.floor(
    behavior.pressure.rejectionBps * 0.82,
  );
  behavior.pressure.stressBps = clamp(
    Math.round(
      behavior.pressure.capacityBps * 0.35 +
        behavior.pressure.liquidityBps * 0.4 +
        behavior.pressure.rejectionBps * 0.25,
    ),
    0,
    10_000,
  );

  const observed = [
    ...new Map(
      publicTrades
        .filter(
          (trade) =>
            trade.commitSeq >
            behavior.memory.publicCursorCommitSeq,
        )
        .map((trade) => [trade.id, trade]),
    ).values(),
  ].sort(
    (left, right) =>
      left.commitSeq - right.commitSeq ||
      left.id.localeCompare(right.id),
  );
  if (observed.length > 0) {
    const bySymbol = new Map();
    for (const [index, trade] of observed.entries()) {
      let aggregate = bySymbol.get(trade.symbol);
      if (!aggregate) {
        aggregate = {
          symbol: trade.symbol,
          first: trade,
          last: trade,
          tradeCount: 0,
          overflowTradeCount: 0,
          netSignedQuantity: 0,
        };
        bySymbol.set(trade.symbol, aggregate);
      }
      aggregate.last = trade;
      aggregate.tradeCount += 1;
      if (
        index >=
        BEHAVIOR_LIMITS.maxPublicTradesPerObservation
      ) {
        aggregate.overflowTradeCount += 1;
      }
      aggregate.netSignedQuantity +=
        trade.side === 'buy' ? trade.quantity : -trade.quantity;
    }
    for (const aggregate of [...bySymbol.values()].sort(
      (left, right) =>
        left.first.commitSeq - right.first.commitSeq ||
        left.symbol.localeCompare(right.symbol),
    )) {
      const { first, last } = aggregate;
      remember(behavior, {
        id:
          `behavior_episode_public_${aggregate.symbol}_` +
          `${last.commitSeq}`,
        kind: 'public_flow',
        virtualMs: nowMs,
        symbol: aggregate.symbol,
        firstTradeId: first.id,
        lastTradeId: last.id,
        firstFactId: first.factId,
        lastFactId: last.factId,
        tradeCount: aggregate.tradeCount,
        overflowTradeCount: aggregate.overflowTradeCount,
        firstCommitSeq: first.commitSeq,
        lastCommitSeq: last.commitSeq,
        priceMoveTicks: last.priceTicks - first.priceTicks,
        netSignedQuantity: aggregate.netSignedQuantity,
      });
    }
    behavior.memory.publicCursorCommitSeq =
      observed.at(-1).commitSeq;
  }

  const traits = behavior.persona.traits;
  const goals = behavior.persona.stableGoals;
  const scoredAttention = [];
  for (const [symbol, observation] of Object.entries(symbols)) {
    const belief = behavior.cognition.beliefs[symbol];
    if (!belief) continue;
    const priceTicks = Math.max(1, observation.priceTicks);
    const valueGapBps = clamp(
      Math.round(
        (observation.valueTicks - priceTicks) *
          10_000 /
          priceTicks,
      ),
      -10_000,
      10_000,
    );
    const momentumBps = clamp(
      Math.round(
        observation.momentumTicks * 10_000 / priceTicks,
      ),
      -10_000,
      10_000,
    );
    const flowBps = clamp(
      Math.round(observation.netSignedQuantity * 22),
      -10_000,
      10_000,
    );
    const valueWeight =
      goals.capitalPreservationBps +
      traits.contrarianBps;
    const momentumWeight =
      goals.growthBps +
      traits.socialLearningBps -
      traits.contrarianBps;
    const flowWeight =
      traits.socialLearningBps +
      goals.socialBelongingBps;
    const targetConviction = clamp(
      Math.round(
        (
          valueGapBps * valueWeight +
          momentumBps * momentumWeight +
          flowBps * flowWeight
        ) /
          20_000,
      ),
      -10_000,
      10_000,
    );
    belief.convictionBps = clamp(
      Math.round(
        belief.convictionBps * 0.72 +
          targetConviction * 0.28,
      ),
      -10_000,
      10_000,
    );
    belief.valueGapBps = valueGapBps;
    belief.momentumBps = momentumBps;
    belief.flowBps = flowBps;
    belief.referencePriceTicks = priceTicks;
    belief.lastUpdatedMs = nowMs;
    scoredAttention.push({
      symbol,
      salience:
        Math.abs(belief.convictionBps) +
        Math.abs(momentumBps) * 0.25 +
        Math.abs(flowBps) * 0.2,
    });
  }
  behavior.cognition.attentionSymbols = scoredAttention
    .sort(
      (left, right) =>
        right.salience - left.salience ||
        left.symbol.localeCompare(right.symbol),
    )
    .slice(
      0,
      clamp(
        traits.attentionSlots,
        1,
        Math.max(1, scoredAttention.length),
      ),
    )
    .map((item) => item.symbol);
  behavior.cognition.confidenceBps = clamp(
    Math.round(
      4_500 +
        traits.reasoningLevel * 850 -
        behavior.pressure.stressBps * 0.28,
    ),
    1_000,
    9_000,
  );
  behavior.cognition.lastObservationMs = nowMs;
  return behavior;
}

function openExposureMemoryContext(
  behavior,
  symbol,
  nowMs,
  lastPriceTicks,
) {
  const openExposureUnits =
    behavior.account.settledNetUnits[symbol] ?? 0;
  const exposureSide =
    openExposureUnits > 0
      ? 'buy'
      : openExposureUnits < 0
        ? 'sell'
        : null;
  const latestOwnFill = exposureSide
    ? [...behavior.memory.episodes]
        .reverse()
        .find(
          (episode) =>
            episode.kind === 'own_fill' &&
            episode.symbol === symbol &&
            episode.side === exposureSide,
        )
    : null;
  if (!latestOwnFill) {
    return {
      openExposureUnits,
      latestOwnFill: null,
      memoryInfluenceBps: 0,
    };
  }
  const openExposureCostTicks =
    behavior.account.openExposureCostTicks[symbol];
  const unrealizedDirection =
    latestOwnFill.side === 'buy'
      ? lastPriceTicks - openExposureCostTicks
      : openExposureCostTicks - lastPriceTicks;
  let rawMemoryInfluenceBps = 0;
  if (unrealizedDirection < 0) {
    rawMemoryInfluenceBps =
      latestOwnFill.side === 'buy'
        ? Math.round(
            behavior.persona.traits.lossAversionBps *
              0.08,
          )
        : -Math.round(
            behavior.persona.traits.lossAversionBps *
              0.08,
          );
  } else if (unrealizedDirection > 0) {
    rawMemoryInfluenceBps =
      latestOwnFill.side === 'buy'
        ? -Math.round(
            behavior.persona.traits.dispositionBps *
              0.08,
          )
        : Math.round(
            behavior.persona.traits.dispositionBps *
              0.08,
          );
  }
  const openFractionBps = clamp(
    Math.round(
      Math.abs(openExposureUnits) *
        10_000 /
        Math.max(1, latestOwnFill.quantity),
    ),
    0,
    10_000,
  );
  const ageMs = Math.max(
    0,
    nowMs - latestOwnFill.virtualMs,
  );
  const decayBps = clamp(
    10_000 -
      Math.floor(
        Math.min(ageMs, MEMORY_EXPOSURE_DECAY_MS) *
          10_000 /
          MEMORY_EXPOSURE_DECAY_MS,
      ),
    0,
    10_000,
  );
  return {
    openExposureUnits,
    latestOwnFill,
    memoryInfluenceBps: Math.round(
      Math.round(
        rawMemoryInfluenceBps * openFractionBps / 10_000,
      ) *
        decayBps /
        10_000,
    ),
  };
}

export function createRetailIntent({
  behavior,
  agentId,
  accountId,
  brokerId,
  decisionSequence,
  nowMs,
  market,
  freeCashCents,
  freeUnitsBySymbol,
}) {
  const candidates = behavior.cognition.attentionSymbols
    .map((symbol) => {
      const candidateMarket = market[symbol];
      return {
        symbol,
        belief: behavior.cognition.beliefs[symbol],
        market: candidateMarket,
        memoryContext: candidateMarket
          ? openExposureMemoryContext(
              behavior,
              symbol,
              nowMs,
              candidateMarket.lastPriceTicks,
            )
          : null,
      };
    })
    .filter(
      (candidate) =>
        candidate.belief &&
        candidate.market &&
        candidate.market.bestBidTicks > 0 &&
        candidate.market.bestAskTicks > 0,
    )
    .sort(
      (left, right) =>
        Math.abs(right.belief.convictionBps) -
          Math.abs(left.belief.convictionBps) ||
        left.symbol.localeCompare(right.symbol),
    );
  const memoryReviewCandidates = candidates
    .filter(
      (candidate) =>
        candidate.memoryContext
          ?.memoryInfluenceBps !== 0,
    )
    .sort(
      (left, right) =>
        right.memoryContext.latestOwnFill.virtualMs -
          left.memoryContext.latestOwnFill.virtualMs ||
        left.symbol.localeCompare(right.symbol),
    );
  // A recent open gain or loss receives a bounded review slot every third
  // decision. This makes learning causally reachable without increasing the
  // actor cadence or allowing memory to dominate every fresh public signal.
  const selected =
    decisionSequence % 3 === 0 &&
    memoryReviewCandidates.length > 0
      ? memoryReviewCandidates[0]
      : candidates[0];
  if (!selected) return null;

  const traits = behavior.persona.traits;
  const goals = behavior.persona.stableGoals;
  const confidenceScaleBps =
    5_000 + behavior.cognition.confidenceBps;
  const learnedSignalScaleBps =
    10_000 + behavior.learning.adaptationBps;
  let scoreBps = Math.round(
    selected.belief.convictionBps *
      confidenceScaleBps /
      10_000 *
      learnedSignalScaleBps /
      10_000,
  );
  const positionUnits =
    behavior.account.initialHoldings[selected.symbol] +
    behavior.account.settledNetUnits[selected.symbol];
  const referenceUnits = Math.max(
    1,
    behavior.account.initialHoldings[selected.symbol],
  );
  const inventoryBps = clamp(
    Math.round(
      (positionUnits - referenceUnits) *
        10_000 /
        referenceUnits,
    ),
    -10_000,
    10_000,
  );
  scoreBps -= Math.round(
    inventoryBps *
      (
        goals.capitalPreservationBps +
        behavior.pressure.stressBps
      ) /
      20_000,
  );

  const openExposureUnits =
    selected.memoryContext.openExposureUnits;
  const latestOwnFill =
    selected.memoryContext.latestOwnFill;
  const memoryInfluenceBps =
    selected.memoryContext.memoryInfluenceBps;
  scoreBps += memoryInfluenceBps;

  const populationParticipationBps = clamp(
    Math.round(
      Math.log2(
        behavior.persona.populationWeight + 1,
      ) * 250,
    ),
    0,
    2_500,
  );
  const riskGuardBps = Math.round(
    (
      goals.capitalPreservationBps +
      traits.lossAversionBps -
      traits.riskToleranceBps -
      goals.growthBps
    ) /
      40,
  );
  const decisionThresholdBps = clamp(
    Math.round(
      650 +
        riskGuardBps -
        populationParticipationBps / 10 -
        behavior.learning.adaptationBps / 20 +
        (
          5_000 -
          behavior.cognition.confidenceBps
        ) /
          20,
    ),
    100,
    750,
  );
  if (Math.abs(scoreBps) < decisionThresholdBps) return null;
  const side = scoreBps > 0 ? 'buy' : 'sell';
  const relationships = Object.values(
    behavior.memory.relationshipAccounts,
  );
  const averageRelationshipTrustBps =
    relationships.length === 0
      ? 5_000
      : relationships.reduce(
          (sum, relationship) =>
            sum + relationship.trustBps,
          0,
        ) / relationships.length;
  const urgencyBps = clamp(
    Math.abs(scoreBps) +
      Math.round(behavior.pressure.liquidityBps * 0.4) +
      (10_000 - traits.patienceBps) * 0.15 +
      (averageRelationshipTrustBps - 5_000) * 0.12,
    0,
    10_000,
  );
  const marketableThresholdBps = clamp(
    Math.round(
      1_150 -
        behavior.learning.adaptationBps / 4 -
        (
          behavior.cognition.confidenceBps -
          5_000
        ) /
          10,
    ),
    650,
    1_800,
  );
  const marketable =
    urgencyBps >= marketableThresholdBps ||
    traits.patienceBps < 4_000;
  const executableTicks =
    side === 'buy'
      ? selected.market.bestAskTicks
      : selected.market.bestBidTicks;
  const passiveTicks =
    side === 'buy'
      ? selected.market.bestBidTicks
      : selected.market.bestAskTicks;
  const priceTicks = marketable
    ? executableTicks
    : passiveTicks;
  const envelopeNotionalCents = Math.max(
    1,
    Math.floor(
      behavior.account.cashEnvelopeCents *
        traits.riskToleranceBps /
        10_000,
    ),
  );
  const envelopeQuantity = Math.max(
    1,
    Math.floor(envelopeNotionalCents / Math.max(1, priceTicks)),
  );
  const desiredQuantity = Math.max(
    1,
    Math.floor(
      traits.baseOrderUnits *
        (0.55 + urgencyBps / 4_000) *
        (
          1 +
          behavior.learning.adaptationBps /
            20_000
        ) *
        (
          1 -
          behavior.pressure.capacityBps /
            14_000
        ) *
        clamp(
          1 -
            behavior.pressure.rejectionBps /
              8_000,
          0.35,
          1,
        ),
    ),
  );
  const quantity =
    side === 'buy'
      ? Math.min(
          desiredQuantity,
          envelopeQuantity,
          Math.max(
            0,
            Math.floor((freeCashCents - 5) / priceTicks),
          ),
        )
      : Math.min(
          desiredQuantity,
          envelopeQuantity,
          Math.max(0, freeUnitsBySymbol[selected.symbol] ?? 0),
        );
  if (quantity <= 0) return null;
  const expectedMoveBps = clamp(
    Math.round(
      Math.abs(scoreBps) *
        (
          0.35 +
          behavior.cognition.confidenceBps /
            20_000
        ),
    ),
    25,
    2_500,
  );
  const expectedMoveTicks = Math.max(
    1,
    Math.round(
      selected.market.lastPriceTicks *
        expectedMoveBps /
        10_000,
    ),
  );
  const expectedExitTicks =
    side === 'buy'
      ? selected.market.lastPriceTicks +
        expectedMoveTicks
      : Math.max(
          1,
          selected.market.lastPriceTicks -
            expectedMoveTicks,
        );
  const expectedUtility = evaluateProfitSeekingOrder({
    side,
    quantity,
    priceTicks,
    expectedExitTicks,
    bestBidTicks: selected.market.bestBidTicks,
    bestAskTicks: selected.market.bestAskTicks,
    availableAtBestUnits: Math.max(
      0,
      Math.round(
        (
          side === 'buy'
            ? selected.market.availableAskUnits
            : selected.market.availableBidUnits
        ) ??
          selected.market.availableAtBestUnits ??
          quantity,
      ),
    ),
    volatilityTicks: Math.max(
      0,
      Math.round(
        selected.market.volatilityTicks ?? 0,
      ),
    ),
    existingPositionUnits: positionUnits,
    capitalCents: Math.max(
      1,
      behavior.account.cashEnvelopeCents +
        behavior.account.settledNetCashCents,
    ),
    riskAversionBps: clamp(
      Math.round(
        (
          10_000 -
          traits.riskToleranceBps +
          traits.lossAversionBps
        ) /
          2,
      ),
      0,
      10_000,
    ),
    drawdownBps: behavior.performance.drawdownBps,
    tif: marketable ? 'IOC' : 'GTC',
  });
  if (!expectedUtility.shouldTrade) return null;

  const intentId =
    `behavior:${agentId}:${decisionSequence}:` +
    `${behavior.memory.revision}`;
  const usedMemoryEvidence =
    memoryInfluenceBps === 0 || !latestOwnFill
      ? null
      : {
          episodeId: latestOwnFill.id,
          kind: latestOwnFill.kind,
          symbol: latestOwnFill.symbol,
          side: latestOwnFill.side,
          priceTicks: latestOwnFill.priceTicks,
          quantity: latestOwnFill.quantity,
          virtualMs: latestOwnFill.virtualMs,
          tradeId: latestOwnFill.tradeId,
          factId: latestOwnFill.factId,
          commitSeq: latestOwnFill.commitSeq,
        };
  return {
    intentId,
    motiveCode:
      Math.abs(selected.belief.valueGapBps) >=
      Math.abs(selected.belief.momentumBps)
        ? 'bounded_value_comparison'
        : 'bounded_public_flow_response',
    bindingConstraintCodes: [
      marketable ? 'WAITING_COST' : 'QUEUE_PATIENCE',
      behavior.pressure.capacityBps > 2_500
        ? 'CAPACITY_PRESSURE'
        : 'CAPITAL_ENVELOPE',
      `ATTENTION_${behavior.cognition.attentionSymbols.length}`,
    ],
    memoryRevision: behavior.memory.revision,
    usedMemoryEpisodeId:
      memoryInfluenceBps === 0
        ? null
        : latestOwnFill?.id ?? null,
    usedMemoryEvidence,
    memoryInfluenceBps,
    expectedUtility,
    command: {
      type: 'submit_order',
      actorId: accountId,
      brokerId,
      symbol: selected.symbol,
      side,
      priceTicks,
      quantity,
      tif: marketable ? 'IOC' : 'GTC',
      parentOrderId: intentId,
      behaviorAgentId: agentId,
      behaviorMemoryRevision: behavior.memory.revision,
      expectedUtility: cloneJson(expectedUtility),
    },
  };
}

export function recordBehaviorAction(
  behavior,
  { nowMs, intent, productionOrderCount },
) {
  const priorIntentAction = intent?.intentId
    ? matchingIntentAction(behavior, intent.intentId)
    : null;
  const priorIntentAggregate = intent?.intentId
    ? matchingIntentAggregate(
        behavior,
        intent.intentId,
        intent.command?.symbol ?? null,
        intent.command?.side ?? null,
      )
    : null;
  const action = {
    intentId: intent?.intentId ?? null,
    virtualMs: nowMs,
    memoryRevision: behavior.memory.revision,
    usedMemoryEpisodeId:
      intent?.usedMemoryEpisodeId ?? null,
    usedMemoryEvidence:
      cloneJson(intent?.usedMemoryEvidence ?? null),
    memoryInfluenceBps: intent?.memoryInfluenceBps ?? 0,
    symbol: intent?.command?.symbol ?? null,
    side: intent?.command?.side ?? null,
    tif: intent?.command?.tif ?? null,
    quantity: intent?.command?.quantity ?? 0,
    productionOrderCount,
    acceptedOrderCount: 0,
    rejectedOrderCount: 0,
    filledQuantity: 0,
    settlementAggregate: cloneJson(
      priorIntentAction?.settlementAggregate ??
        priorIntentAggregate ??
        null,
    ),
  };
  behavior.lastIntent = cloneJson(action);
  boundedPush(
    behavior.actionTrace,
    action,
    BEHAVIOR_LIMITS.maxActionTrace,
  );
  return action;
}

export function recordBehaviorSettlement(
  behavior,
  {
    trade,
    side,
    counterpartyAccountId,
    intentId,
  },
) {
  const settlementKey = `${trade?.id ?? ''}:${side}`;
  if (
    !Number.isSafeInteger(trade.commitSeq) ||
    trade.commitSeq < behavior.memory.ownCursorCommitSeq ||
    behavior.memory.settlementKeys.includes(settlementKey)
  ) {
    return behavior.memory.revision;
  }
  boundedPush(
    behavior.memory.settlementKeys,
    settlementKey,
    BEHAVIOR_LIMITS.maxSettlementKeys,
  );
  const signedUnits =
    side === 'buy' ? trade.quantity : -trade.quantity;
  const previousUnits =
    behavior.account.settledNetUnits[trade.symbol];
  const previousCostTicks =
    behavior.account.openExposureCostTicks[trade.symbol];
  const closingQuantity =
    previousUnits !== 0 &&
    Math.sign(previousUnits) !== Math.sign(signedUnits)
      ? Math.min(
          Math.abs(previousUnits),
          Math.abs(signedUnits),
        )
      : 0;
  const realizedGrossPnlDeltaCents =
    closingQuantity === 0
      ? 0
      : previousUnits > 0
        ? (
            trade.priceTicks - previousCostTicks
          ) * closingQuantity
        : (
            previousCostTicks - trade.priceTicks
          ) * closingQuantity;
  const feeCents =
    Number.isSafeInteger(trade.feeCents) &&
    trade.feeCents >= 0
      ? trade.feeCents
      : 0;
  const nextUnits = previousUnits + signedUnits;
  if (nextUnits === 0) {
    behavior.account.openExposureCostTicks[trade.symbol] = 0;
  } else if (
    previousUnits === 0 ||
    Math.sign(previousUnits) !== Math.sign(nextUnits)
  ) {
    behavior.account.openExposureCostTicks[trade.symbol] =
      trade.priceTicks;
  } else if (Math.sign(previousUnits) === Math.sign(signedUnits)) {
    behavior.account.openExposureCostTicks[trade.symbol] =
      Math.round(
        (
          Math.abs(previousUnits) * previousCostTicks +
          Math.abs(signedUnits) * trade.priceTicks
        ) /
          Math.abs(nextUnits),
      );
  }
  behavior.account.settledNetUnits[trade.symbol] += signedUnits;
  const grossCash = trade.priceTicks * trade.quantity;
  const signedCash =
    side === 'buy'
      ? -(grossCash + feeCents)
      : grossCash - feeCents;
  behavior.account.settledNetCashCents += signedCash;
  behavior.performance.realizedGrossPnlCents +=
    realizedGrossPnlDeltaCents;
  behavior.performance.feesPaidCents += feeCents;
  behavior.performance.realizedNetPnlCents =
    behavior.performance.realizedGrossPnlCents -
    behavior.performance.feesPaidCents;
  behavior.performance.tradedNotionalCents += grossCash;
  behavior.performance.markedPnlCents =
    behavior.performance.realizedNetPnlCents;
  behavior.performance.peakMarkedPnlCents = Math.max(
    behavior.performance.peakMarkedPnlCents,
    behavior.performance.markedPnlCents,
  );
  behavior.performance.drawdownCents = Math.max(
    0,
    behavior.performance.peakMarkedPnlCents -
      behavior.performance.markedPnlCents,
  );
  behavior.performance.drawdownBps = clamp(
    Math.round(
      behavior.performance.drawdownCents *
        10_000 /
        Math.max(
          1,
          behavior.account.cashEnvelopeCents,
        ),
    ),
    0,
    10_000,
  );
  behavior.performance.lastSettlementCommitSeq = Math.max(
    behavior.performance.lastSettlementCommitSeq,
    trade.commitSeq,
  );
  behavior.memory.ownCursorCommitSeq = Math.max(
    behavior.memory.ownCursorCommitSeq,
    trade.commitSeq,
  );
  const existingEpisode = behavior.memory.episodes.find(
    (episode) =>
      episode.kind === 'own_fill' &&
      episode.intentId === intentId &&
      episode.symbol === trade.symbol &&
      episode.side === side,
  );
  const action = matchingIntentAction(behavior, intentId);
  const intentAggregate = matchingIntentAggregate(
    behavior,
    intentId,
    trade.symbol,
    side,
  );
  let settlementAggregate =
    intentAggregate ??
    action?.settlementAggregate ??
    settlementAggregateFromEpisode(existingEpisode);
  const evaluatedAggregate =
    intentAggregate?.evaluatedAtMs !== undefined
      ? intentAggregate
      : existingEpisode?.evaluatedAtMs !== undefined
        ? existingEpisode
        : action?.settlementAggregate?.evaluatedAtMs !==
              undefined
          ? action.settlementAggregate
          : null;
  if (evaluatedAggregate) {
    reverseEvaluation(behavior, evaluatedAggregate);
  }
  clearEvaluation(intentAggregate);
  clearEvaluation(existingEpisode);
  clearEvaluation(action?.settlementAggregate);
  clearEvaluation(settlementAggregate);
  settlementAggregate = mergeSettlementAggregate(
    settlementAggregate,
    {
      trade,
      side,
      counterpartyAccountId,
    },
  );
  if (intentAggregate) {
    Object.assign(intentAggregate, settlementAggregate);
  } else {
    behavior.memory.intentAggregates.push({
      intentId,
      ...settlementAggregate,
    });
    trimIntentAggregates(behavior);
  }
  if (action) {
    action.settlementAggregate =
      cloneJson(settlementAggregate);
  }
  let memoryRevision;
  if (existingEpisode) {
    existingEpisode.priceTicks =
      settlementAggregate.priceTicks;
    existingEpisode.quantity =
      settlementAggregate.quantity;
    existingEpisode.virtualMs =
      settlementAggregate.virtualMs;
    existingEpisode.tradeId =
      settlementAggregate.tradeId;
    existingEpisode.factId =
      settlementAggregate.factId;
    existingEpisode.commitSeq =
      settlementAggregate.commitSeq;
    existingEpisode.counterpartyAccountId =
      counterpartyAccountId;
    behavior.memory.revision += 1;
    existingEpisode.memoryRevision =
      behavior.memory.revision;
    existingEpisode.salienceBps =
      episodeSalience(existingEpisode);
    memoryRevision = behavior.memory.revision;
  } else {
    memoryRevision = remember(behavior, {
      id: `behavior_episode_fill_${trade.id}_${side}`,
      kind: 'own_fill',
      virtualMs: settlementAggregate.virtualMs,
      tradeId: settlementAggregate.tradeId,
      factId: settlementAggregate.factId,
      commitSeq: settlementAggregate.commitSeq,
      intentId,
      symbol: trade.symbol,
      side,
      priceTicks: settlementAggregate.priceTicks,
      quantity: settlementAggregate.quantity,
      counterpartyAccountId,
    });
  }
  updateRelationship(
    behavior,
    counterpartyAccountId,
    signedUnits,
  );
  if (action) action.filledQuantity += trade.quantity;
  if (behavior.lastIntent?.intentId === intentId) {
    behavior.lastIntent.filledQuantity += trade.quantity;
    behavior.lastIntent.settlementAggregate =
      cloneJson(settlementAggregate);
  }
  return memoryRevision;
}

export function recordBehaviorReceipt(
  behavior,
  receipt,
) {
  let action = null;
  for (
    let index = behavior.actionTrace.length - 1;
    index >= 0;
    index -= 1
  ) {
    if (
      behavior.actionTrace[index].intentId ===
      receipt.parentOrderId
    ) {
      action = behavior.actionTrace[index];
      break;
    }
  }
  const receiptAlreadyRecorded =
    behavior.memory.receiptIds.includes(receipt.id) ||
    behavior.memory.episodes.some(
      (episode) =>
        episode.kind === 'order_rejection' &&
        episode.receiptId === receipt.id,
    );
  if (receiptAlreadyRecorded) return;
  boundedPush(
    behavior.memory.receiptIds,
    receipt.id,
    BEHAVIOR_LIMITS.maxReceiptIds,
  );
  if (receipt.status === 'rejected') {
    behavior.pressure.rejectionBps = clamp(
      behavior.pressure.rejectionBps + 1_800,
      0,
      10_000,
    );
    remember(behavior, {
      id: `behavior_episode_rejection_${receipt.id}`,
      kind: 'order_rejection',
      virtualMs:
        Number.isSafeInteger(receipt.virtualMs)
          ? receipt.virtualMs
          : behavior.cognition.lastObservationMs,
      receiptId: receipt.id,
      intentId: receipt.parentOrderId ?? null,
      reason: receipt.reason,
    });
    if (action) action.rejectedOrderCount = 1;
  } else if (action) {
    action.acceptedOrderCount = 1;
  }
}

export function behaviorDecisionSignal(
  behavior,
  symbol,
) {
  const belief = behavior?.cognition?.beliefs?.[symbol];
  if (!belief) return 0;
  return clamp(
    belief.convictionBps / 40_000,
    -0.25,
    0.25,
  );
}

export function behaviorSizeMultiplier(
  behavior,
) {
  if (!behavior) return 1;
  const realizedReturnBps = clamp(
    Math.round(
      behavior.performance.realizedNetPnlCents *
        10_000 /
        Math.max(
          1,
          behavior.account.cashEnvelopeCents,
        ),
    ),
    -5_000,
    5_000,
  );
  const profitAdjustment =
    Math.max(0, realizedReturnBps) / 25_000 -
    Math.max(0, -realizedReturnBps) / 8_000;
  return Number(
    clamp(
      1 -
        behavior.pressure.capacityBps / 14_000 -
        behavior.pressure.rejectionBps / 20_000 +
        behavior.learning.adaptationBps / 30_000 +
        profitAdjustment -
        behavior.performance.drawdownBps / 12_000,
      0.25,
      1.35,
    ).toFixed(6),
  );
}

function integerInRange(value, minimum, maximum) {
  return (
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function validAnonymousVenueCohort(value) {
  return (
    typeof value === 'string' &&
    /^venue:continuous_lob:(liquidity_taker|liquidity_provider)$/.test(
      value,
    )
  );
}

function sameKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function validMemoryEvidence(evidence, symbols) {
  if (evidence === undefined || evidence === null) return true;
  return Boolean(
    evidence &&
      typeof evidence === 'object' &&
      typeof evidence.episodeId === 'string' &&
      evidence.kind === 'own_fill' &&
      symbols.includes(evidence.symbol) &&
      (evidence.side === 'buy' || evidence.side === 'sell') &&
      integerInRange(
        evidence.priceTicks,
        1,
        Number.MAX_SAFE_INTEGER,
      ) &&
      integerInRange(
        evidence.quantity,
        1,
        Number.MAX_SAFE_INTEGER,
      ) &&
      integerInRange(
        evidence.virtualMs,
        0,
        Number.MAX_SAFE_INTEGER,
      ) &&
      typeof evidence.tradeId === 'string' &&
      typeof evidence.factId === 'string' &&
      integerInRange(
        evidence.commitSeq,
        1,
        Number.MAX_SAFE_INTEGER,
      )
  );
}

function validEvaluationFields(record) {
  const hasEvaluation =
    record.evaluatedAtMs !== undefined;
  if (!hasEvaluation) {
    return [
      'markoutTicks',
      'learningDeltaBps',
      'relationshipTrustDeltaBps',
      'evaluationStage',
      'evaluationCount',
      'nextEvaluationMs',
      'successfulSignalDelta',
      'failedSignalDelta',
    ].every((key) => record[key] === undefined);
  }
  const validStage =
    (
      record.evaluationStage === 'short' &&
      record.evaluationCount === 1 &&
      record.nextEvaluationMs ===
        record.virtualMs + FINAL_MARKOUT_MS
    ) ||
    (
      record.evaluationStage === 'final' &&
      record.evaluationCount === 2 &&
      record.nextEvaluationMs === undefined
    ) ||
    (
      record.evaluationStage === 'legacy_final' &&
      record.evaluationCount === 1 &&
      record.nextEvaluationMs === undefined
    );
  return Boolean(
    validStage &&
      integerInRange(
        record.evaluatedAtMs,
        record.virtualMs,
        Number.MAX_SAFE_INTEGER,
      ) &&
      Number.isSafeInteger(record.markoutTicks) &&
      integerInRange(
        record.learningDeltaBps,
        -3_000,
        3_000,
      ) &&
      integerInRange(
        record.relationshipTrustDeltaBps,
        -8_000,
        8_000,
      ) &&
      integerInRange(
        record.successfulSignalDelta,
        0,
        record.evaluationCount,
      ) &&
      integerInRange(
        record.failedSignalDelta,
        0,
        record.evaluationCount,
      ) &&
      record.successfulSignalDelta +
        record.failedSignalDelta <=
        record.evaluationCount
  );
}

function validSettlementAggregate(
  aggregate,
  action,
  symbols,
) {
  if (aggregate === null) {
    return action.filledQuantity === 0;
  }
  if (
    !aggregate ||
    typeof aggregate !== 'object' ||
    action.intentId === null ||
    aggregate.symbol !== action.symbol ||
    aggregate.side !== action.side ||
    !symbols.includes(aggregate.symbol) ||
    !integerInRange(
      aggregate.quantity,
      Math.max(1, action.filledQuantity),
      Number.MAX_SAFE_INTEGER,
    ) ||
    !integerInRange(
      aggregate.grossPriceTicks,
      aggregate.quantity,
      Number.MAX_SAFE_INTEGER,
    ) ||
    !integerInRange(
      aggregate.feeCents,
      0,
      Number.MAX_SAFE_INTEGER,
    ) ||
    !integerInRange(
      aggregate.priceTicks,
      1,
      Number.MAX_SAFE_INTEGER,
    ) ||
    aggregate.priceTicks !==
      Math.round(
        aggregate.grossPriceTicks /
          aggregate.quantity,
    ) ||
    !integerInRange(
      aggregate.virtualMs,
      0,
      Number.MAX_SAFE_INTEGER,
    ) ||
    typeof aggregate.tradeId !== 'string' ||
    typeof aggregate.factId !== 'string' ||
    !integerInRange(
      aggregate.commitSeq,
      1,
      Number.MAX_SAFE_INTEGER,
    ) ||
    !validAnonymousVenueCohort(
      aggregate.counterpartyAccountId,
    )
  ) {
    return false;
  }
  return validEvaluationFields(aggregate);
}

function validActionRecord(action, symbols) {
  if (!action || typeof action !== 'object') return false;
  const hasIntent = action.intentId !== null;
  return Boolean(
    (
      action.intentId === null ||
      (
        typeof action.intentId === 'string' &&
        action.intentId.length > 0 &&
        action.intentId.length <= 256
      )
    ) &&
      integerInRange(
        action.virtualMs,
        0,
        Number.MAX_SAFE_INTEGER,
      ) &&
      integerInRange(
        action.memoryRevision,
        0,
        Number.MAX_SAFE_INTEGER,
      ) &&
      (
        action.usedMemoryEpisodeId === null ||
        (
          typeof action.usedMemoryEpisodeId === 'string' &&
          action.usedMemoryEpisodeId.length > 0 &&
          action.usedMemoryEpisodeId.length <= 256
        )
      ) &&
      validMemoryEvidence(action.usedMemoryEvidence, symbols) &&
      integerInRange(
        action.memoryInfluenceBps,
        -10_000,
        10_000,
      ) &&
      (
        hasIntent
          ? symbols.includes(action.symbol) &&
            (action.side === 'buy' || action.side === 'sell') &&
            (action.tif === 'IOC' || action.tif === 'GTC') &&
            integerInRange(
              action.quantity,
              1,
              Number.MAX_SAFE_INTEGER,
            )
          : action.symbol === null &&
            action.side === null &&
            action.tif === null &&
            action.quantity === 0
      ) &&
      integerInRange(
        action.productionOrderCount,
        0,
        Number.MAX_SAFE_INTEGER,
      ) &&
      integerInRange(action.acceptedOrderCount, 0, 1) &&
      integerInRange(action.rejectedOrderCount, 0, 1) &&
      action.acceptedOrderCount + action.rejectedOrderCount <= 1 &&
      integerInRange(
        action.filledQuantity,
        0,
        hasIntent ? action.quantity : 0,
      ) &&
      validSettlementAggregate(
        action.settlementAggregate,
        action,
        symbols,
      )
  );
}

function validIntentAggregate(aggregate, symbols) {
  return Boolean(
    aggregate &&
      typeof aggregate.intentId === 'string' &&
      aggregate.intentId.length > 0 &&
      aggregate.intentId.length <= 256 &&
      validSettlementAggregate(
        aggregate,
        {
          intentId: aggregate.intentId,
          symbol: aggregate.symbol,
          side: aggregate.side,
          quantity: Number.MAX_SAFE_INTEGER,
          filledQuantity: 0,
          virtualMs: 0,
        },
        symbols,
      )
  );
}

function validActionMemoryProvenance(
  action,
  episodesById,
) {
  const evidence = action.usedMemoryEvidence;
  const episodeId = action.usedMemoryEpisodeId;
  if (action.memoryInfluenceBps === 0) {
    return (
      episodeId === null &&
      (evidence === null || evidence === undefined)
    );
  }
  if (!evidence) return false;
  if (episodeId === null) {
    return true;
  }
  if (episodeId !== evidence.episodeId) return false;
  const episode = episodesById.get(episodeId);
  return Boolean(
    episode &&
      episode.kind === evidence.kind &&
      episode.symbol === evidence.symbol &&
      episode.side === evidence.side &&
      episode.commitSeq >= evidence.commitSeq &&
      episode.virtualMs >= evidence.virtualMs
  );
}

function validEpisode(episode, symbols) {
  if (
    !episode ||
    typeof episode !== 'object' ||
    typeof episode.id !== 'string' ||
    episode.id.length === 0 ||
    episode.id.length > 256 ||
    !integerInRange(
      episode.virtualMs,
      0,
      Number.MAX_SAFE_INTEGER,
    ) ||
    !integerInRange(
      episode.memoryRevision,
      1,
      Number.MAX_SAFE_INTEGER,
    ) ||
    !integerInRange(episode.salienceBps, 0, 10_000)
  ) {
    return false;
  }
  if (episode.kind === 'own_fill') {
    return Boolean(
      typeof episode.tradeId === 'string' &&
        typeof episode.factId === 'string' &&
        integerInRange(
          episode.commitSeq,
          1,
          Number.MAX_SAFE_INTEGER,
        ) &&
        typeof episode.intentId === 'string' &&
        symbols.includes(episode.symbol) &&
        (episode.side === 'buy' || episode.side === 'sell') &&
        integerInRange(
          episode.priceTicks,
          1,
          Number.MAX_SAFE_INTEGER,
        ) &&
        integerInRange(
          episode.quantity,
          1,
          Number.MAX_SAFE_INTEGER,
        ) &&
        validAnonymousVenueCohort(
          episode.counterpartyAccountId,
        ) &&
        validEvaluationFields(episode)
    );
  }
  if (episode.kind === 'public_flow') {
    return Boolean(
      symbols.includes(episode.symbol) &&
        typeof episode.firstTradeId === 'string' &&
        typeof episode.lastTradeId === 'string' &&
        typeof episode.firstFactId === 'string' &&
        typeof episode.lastFactId === 'string' &&
        integerInRange(
          episode.tradeCount,
          1,
          Number.MAX_SAFE_INTEGER,
        ) &&
        integerInRange(
          episode.overflowTradeCount,
          0,
          episode.tradeCount,
        ) &&
        integerInRange(
          episode.firstCommitSeq,
          1,
          Number.MAX_SAFE_INTEGER,
        ) &&
        integerInRange(
          episode.lastCommitSeq,
          episode.firstCommitSeq,
          Number.MAX_SAFE_INTEGER,
        ) &&
        Number.isSafeInteger(episode.priceMoveTicks) &&
        Number.isSafeInteger(episode.netSignedQuantity)
    );
  }
  if (episode.kind === 'order_rejection') {
    return Boolean(
      typeof episode.receiptId === 'string' &&
        (
          episode.intentId === undefined ||
          episode.intentId === null ||
          typeof episode.intentId === 'string'
        ) &&
        typeof episode.reason === 'string'
    );
  }
  return false;
}

export function behaviorStateErrors(
  behavior,
  symbols,
) {
  const errors = [];
  const traits = behavior?.persona?.traits;
  const goals = behavior?.persona?.stableGoals;
  const account = behavior?.account;
  const performance = behavior?.performance;
  const cognition = behavior?.cognition;
  const pressure = behavior?.pressure;
  const memory = behavior?.memory;
  const learning = behavior?.learning;
  const traitBpsKeys = [
    'riskToleranceBps',
    'lossAversionBps',
    'dispositionBps',
    'socialLearningBps',
    'contrarianBps',
    'patienceBps',
  ];
  const goalBpsKeys = [
    'capitalPreservationBps',
    'growthBps',
    'liquidityBps',
    'socialBelongingBps',
  ];
  const relationships = memory?.relationshipAccounts;
  const episodes = memory?.episodes;
  const intentAggregates = memory?.intentAggregates;
  const receiptIds = memory?.receiptIds;
  const settlementKeys = memory?.settlementKeys;
  const episodeIds = Array.isArray(episodes)
    ? episodes.map((episode) => episode?.id)
    : [];
  const episodesById = new Map(
    Array.isArray(episodes)
      ? episodes.map((episode) => [episode?.id, episode])
      : [],
  );
  const invalid = Boolean(
    !behavior ||
      behavior.ruleVersion !== BEHAVIOR_RULE_VERSION ||
      !traits ||
      traitBpsKeys.some(
        (key) => !integerInRange(traits[key], 0, 10_000),
      ) ||
      !integerInRange(traits.reasoningLevel, 0, 4) ||
      !integerInRange(
        traits.attentionSlots,
        1,
        Math.max(1, symbols.length),
      ) ||
      !integerInRange(
        traits.baseOrderUnits,
        1,
        1_000_000,
      ) ||
      !goals ||
      goalBpsKeys.some(
        (key) => !integerInRange(goals[key], 0, 10_000),
      ) ||
      !integerInRange(
        behavior.persona.populationWeight,
        1,
        Number.MAX_SAFE_INTEGER,
      ) ||
      (
        behavior.persona.groupLayer !==
          'named_persona_over_bounded_household_cluster' &&
        behavior.persona.groupLayer !== 'single_licensed_actor'
      ) ||
      !account ||
      typeof account.capitalOwnerId !== 'string' ||
      account.capitalOwnerId.length === 0 ||
      account.capitalOwnerId.length > 128 ||
      typeof account.executionAccountId !== 'string' ||
      account.executionAccountId.length === 0 ||
      account.executionAccountId.length > 128 ||
      !integerInRange(account.allocationBps, 1, 10_000) ||
      !integerInRange(
        account.cashEnvelopeCents,
        1,
        Number.MAX_SAFE_INTEGER,
      ) ||
      !Number.isSafeInteger(account.settledNetCashCents) ||
      account.settledNetCashCents <
        -account.cashEnvelopeCents ||
      !sameKeys(account.initialHoldings, symbols) ||
      !sameKeys(account.settledNetUnits, symbols) ||
      !sameKeys(account.openExposureCostTicks, symbols) ||
      symbols.some(
        (symbol) =>
          !integerInRange(
            account.initialHoldings[symbol],
            0,
            Number.MAX_SAFE_INTEGER,
          ) ||
          !Number.isSafeInteger(
            account.settledNetUnits[symbol],
          ) ||
          account.settledNetUnits[symbol] <
            -account.initialHoldings[symbol] ||
          !integerInRange(
            account.openExposureCostTicks[symbol],
            account.settledNetUnits[symbol] === 0 ? 0 : 1,
            Number.MAX_SAFE_INTEGER,
          ) ||
          (
            account.settledNetUnits[symbol] === 0 &&
            account.openExposureCostTicks[symbol] !== 0
          ),
      ) ||
      !performance ||
      ![
        'world_start',
        'migration_forward_only',
      ].includes(performance.accountingBasis) ||
      !Number.isSafeInteger(
        performance.realizedGrossPnlCents,
      ) ||
      !integerInRange(
        performance.feesPaidCents,
        0,
        Number.MAX_SAFE_INTEGER,
      ) ||
      !Number.isSafeInteger(
        performance.realizedNetPnlCents,
      ) ||
      performance.realizedNetPnlCents !==
        performance.realizedGrossPnlCents -
          performance.feesPaidCents ||
      !integerInRange(
        performance.tradedNotionalCents,
        0,
        Number.MAX_SAFE_INTEGER,
      ) ||
      !Number.isSafeInteger(performance.markedPnlCents) ||
      !integerInRange(
        performance.peakMarkedPnlCents,
        0,
        Number.MAX_SAFE_INTEGER,
      ) ||
      !integerInRange(
        performance.drawdownCents,
        0,
        Number.MAX_SAFE_INTEGER,
      ) ||
      performance.drawdownCents !==
        Math.max(
          0,
          performance.peakMarkedPnlCents -
            performance.markedPnlCents,
        ) ||
      !integerInRange(
        performance.drawdownBps,
        0,
        10_000,
      ) ||
      !integerInRange(
        performance.lastSettlementCommitSeq,
        0,
        Number.MAX_SAFE_INTEGER,
      ) ||
      !cognition ||
      !sameKeys(cognition.beliefs, symbols) ||
      !Array.isArray(cognition.attentionSymbols) ||
      cognition.attentionSymbols.length < 1 ||
      cognition.attentionSymbols.length >
        traits?.attentionSlots ||
      new Set(cognition.attentionSymbols).size !==
        cognition.attentionSymbols.length ||
      cognition.attentionSymbols.some(
        (symbol) => !symbols.includes(symbol),
      ) ||
      !integerInRange(cognition.confidenceBps, 0, 10_000) ||
      !integerInRange(
        cognition.lastObservationMs,
        0,
        Number.MAX_SAFE_INTEGER,
      ) ||
      symbols.some((symbol) => {
        const belief = cognition.beliefs[symbol];
        return Boolean(
          !belief ||
            !integerInRange(
              belief.convictionBps,
              -10_000,
              10_000,
            ) ||
            !integerInRange(
              belief.valueGapBps,
              -10_000,
              10_000,
            ) ||
            !integerInRange(
              belief.momentumBps,
              -10_000,
              10_000,
            ) ||
            !integerInRange(
              belief.flowBps,
              -10_000,
              10_000,
            ) ||
            !integerInRange(
              belief.referencePriceTicks,
              1,
              Number.MAX_SAFE_INTEGER,
            ) ||
            !integerInRange(
              belief.lastUpdatedMs,
              0,
              Number.MAX_SAFE_INTEGER,
            )
        );
      }) ||
      !pressure ||
      ['stressBps', 'liquidityBps', 'capacityBps', 'rejectionBps']
        .some(
          (key) =>
            !integerInRange(pressure[key], 0, 10_000),
        ) ||
      !memory ||
      !integerInRange(
        memory.revision,
        0,
        Number.MAX_SAFE_INTEGER,
      ) ||
      !integerInRange(
        memory.publicCursorCommitSeq,
        0,
        Number.MAX_SAFE_INTEGER,
      ) ||
      !integerInRange(
        memory.ownCursorCommitSeq,
        0,
        Number.MAX_SAFE_INTEGER,
      ) ||
      !Array.isArray(episodes) ||
      episodes.length > BEHAVIOR_LIMITS.maxEpisodes ||
      new Set(episodeIds).size !== episodeIds.length ||
      episodes?.some(
        (episode) => !validEpisode(episode, symbols),
      ) ||
      !Array.isArray(intentAggregates) ||
      intentAggregates.length >
        BEHAVIOR_LIMITS.maxIntentAggregates ||
      new Set(
        intentAggregates?.map(
          (aggregate) =>
            `${aggregate?.intentId}:${aggregate?.symbol}:` +
            `${aggregate?.side}`,
        ),
      ).size !== intentAggregates?.length ||
      intentAggregates?.some(
        (aggregate) =>
          !validIntentAggregate(aggregate, symbols),
      ) ||
      episodes?.some((episode) => {
        if (episode.kind !== 'own_fill') return false;
        const aggregate = intentAggregates?.find(
          (candidate) =>
            candidate.intentId === episode.intentId &&
            candidate.symbol === episode.symbol &&
            candidate.side === episode.side,
        );
        return Boolean(
          !aggregate ||
            aggregate.quantity !== episode.quantity ||
            aggregate.priceTicks !== episode.priceTicks ||
            aggregate.virtualMs !== episode.virtualMs ||
            aggregate.tradeId !== episode.tradeId ||
            aggregate.factId !== episode.factId ||
            aggregate.commitSeq !== episode.commitSeq ||
            aggregate.counterpartyAccountId !==
              episode.counterpartyAccountId ||
            aggregate.evaluatedAtMs !==
              episode.evaluatedAtMs ||
            aggregate.markoutTicks !== episode.markoutTicks ||
            aggregate.learningDeltaBps !==
              episode.learningDeltaBps ||
            aggregate.relationshipTrustDeltaBps !==
              episode.relationshipTrustDeltaBps ||
            aggregate.evaluationStage !==
              episode.evaluationStage ||
            aggregate.evaluationCount !==
              episode.evaluationCount ||
            aggregate.nextEvaluationMs !==
              episode.nextEvaluationMs ||
            aggregate.successfulSignalDelta !==
              episode.successfulSignalDelta ||
            aggregate.failedSignalDelta !==
              episode.failedSignalDelta
        );
      }) ||
      !Array.isArray(receiptIds) ||
      receiptIds.length > BEHAVIOR_LIMITS.maxReceiptIds ||
      new Set(receiptIds).size !== receiptIds.length ||
      receiptIds.some(
        (receiptId) =>
          typeof receiptId !== 'string' ||
          receiptId.length === 0 ||
          receiptId.length > 256,
      ) ||
      !Array.isArray(settlementKeys) ||
      settlementKeys.length >
        BEHAVIOR_LIMITS.maxSettlementKeys ||
      new Set(settlementKeys).size !==
        settlementKeys.length ||
      settlementKeys.some(
        (key) =>
          typeof key !== 'string' ||
          !/^[^:]+:(buy|sell)$/.test(key),
      ) ||
      !relationships ||
      typeof relationships !== 'object' ||
      Array.isArray(relationships) ||
      Object.keys(relationships).length >
        BEHAVIOR_LIMITS.maxRelationshipAccounts ||
      Object.entries(relationships).some(
        ([accountId, relationship]) =>
          !validAnonymousVenueCohort(accountId) ||
          !integerInRange(
            relationship?.encounters,
            1,
            Number.MAX_SAFE_INTEGER,
          ) ||
          !Number.isSafeInteger(relationship?.netUnits) ||
          !integerInRange(
            relationship?.trustBps,
            1_000,
            9_000,
          ),
      ) ||
      !learning ||
      !integerInRange(
        learning.adaptationBps,
        -3_000,
        3_000,
      ) ||
      !integerInRange(
        learning.successfulSignals,
        0,
        Number.MAX_SAFE_INTEGER,
      ) ||
      !integerInRange(
        learning.failedSignals,
        0,
        Number.MAX_SAFE_INTEGER,
      ) ||
      !Array.isArray(behavior.actionTrace) ||
      behavior.actionTrace.length >
        BEHAVIOR_LIMITS.maxActionTrace ||
      behavior.actionTrace.some(
        (action) =>
          !validActionRecord(action, symbols) ||
          !validActionMemoryProvenance(
            action,
            episodesById,
          ),
      ) ||
      (
        behavior.lastIntent !== null &&
        (
          !validActionRecord(
            behavior.lastIntent,
            symbols,
          ) ||
          !validActionMemoryProvenance(
            behavior.lastIntent,
            episodesById,
          )
        )
      )
  );
  if (invalid) {
    errors.push('INVALID_BEHAVIOR_STATE');
  }
  return errors;
}

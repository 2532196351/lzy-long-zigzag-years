import {
  auditDerivativesState,
  createDerivativesState,
  reduceDerivatives,
} from './engine.js?v=20260804-01';
import { ACCESS_THRESHOLD_CENTS } from './eligibility.js?v=20260804-01';
import { markAccountEquity } from './risk.js?v=20260804-01';

export const STRESS_RULE_VERSION =
  'lzy-derivatives-stress-v1';

const DAY_MS = 24 * 60 * 60 * 1_000;

const DEFAULT_SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'baseline_low_volatility',
    spotPathTicks: Object.freeze([
      400_000,
      401_000,
      399_000,
      402_000,
      398_000,
      401_000,
      400_000,
      399_500,
      400_500,
      400_000,
      401_000,
    ]),
  }),
  Object.freeze({
    id: 'persistent_bull_curve',
    spotPathTicks: Object.freeze([
      400_000,
      405_000,
      410_000,
      420_000,
      430_000,
      440_000,
      450_000,
      460_000,
      470_000,
      480_000,
      490_000,
    ]),
  }),
  Object.freeze({
    id: 'persistent_bear_curve',
    spotPathTicks: Object.freeze([
      400_000,
      395_000,
      390_000,
      380_000,
      370_000,
      360_000,
      350_000,
      340_000,
      330_000,
      320_000,
      310_000,
    ]),
  }),
  Object.freeze({
    id: 'gap_and_volatility_whipsaw',
    spotPathTicks: Object.freeze([
      400_000,
      420_000,
      380_000,
      430_000,
      370_000,
      440_000,
      360_000,
      450_000,
      350_000,
      460_000,
      340_000,
    ]),
  }),
  Object.freeze({
    id: 'long_horizon_regime_rotation',
    spotPathTicks: Object.freeze([
      400_000,
      403_000,
      406_000,
      409_000,
      412_000,
      415_000,
      418_000,
      421_000,
      424_000,
      427_000,
      430_000,
      425_000,
      420_000,
      415_000,
      410_000,
      405_000,
      400_000,
      395_000,
      390_000,
      385_000,
      380_000,
      384_000,
      388_000,
      392_000,
      396_000,
      400_000,
      404_000,
      408_000,
      412_000,
      416_000,
      420_000,
      418_000,
      416_000,
      414_000,
      412_000,
      410_000,
      408_000,
      406_000,
      404_000,
      402_000,
      400_000,
    ]),
  }),
]);

function systemCashCents(state) {
  return (
    Object.values(state.accounts).reduce(
      (sum, account) => sum + account.cashCents,
      0,
    ) +
    state.clearing.creditPoolCents +
    (state.clearing.worldCashBridgeCents ?? 0) +
    state.clearing.defaultFundCents +
    state.clearing.feePoolCents
  );
}

function facilityClaimCents(state) {
  const financingClaims = Object.values(
    state.accounts,
  ).reduce(
    (sum, account) =>
      sum + account.financing.cashDebtCents,
    0,
  );
  const lendingClaims = Object.values(
    state.accounts,
  ).reduce(
    (sum, account) =>
      sum +
      Object.values(
        account.borrowedSecurities,
      ).reduce(
        (loanSum, loan) =>
          loanSum +
          loan.quantity *
            loan.referencePriceTicks +
          (loan.accruedFeeCents ?? 0),
        0,
      ),
    0,
  );
  return financingClaims + lendingClaims;
}

function fnv1a(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function outcomeSign(value) {
  if (value > 0) return 'profit';
  if (value < 0) return 'loss';
  return 'flat';
}

function underlyingSpots(
  state,
  synthTicks,
  openingSpots = null,
  openingSynthTicks = null,
) {
  return Object.fromEntries(
    Object.values(state.universe.underlyings).map(
      (underlying) => [
        underlying.id,
        underlying.id === 'SYNTH300'
          ? synthTicks
          : openingSpots && openingSynthTicks > 0
            ? Math.max(
                1,
                Math.round(
                  openingSpots[underlying.id] *
                    synthTicks /
                    openingSynthTicks,
                ),
              )
            : underlying.spotTicks,
      ],
    ),
  );
}

export function runDerivativeStressScenario({
  scenarioId,
  spotPathTicks,
}) {
  if (
    typeof scenarioId !== 'string' ||
    scenarioId.length === 0 ||
    !Array.isArray(spotPathTicks) ||
    spotPathTicks.length < 2 ||
    spotPathTicks.some(
      (ticks) =>
        !Number.isSafeInteger(ticks) || ticks <= 0,
    )
  ) {
    throw new TypeError(
      'A named stress scenario with at least two positive integer spots is required',
    );
  }
  let state = createDerivativesState({
    worldId: `stress-world-${scenarioId}`,
    worldSeed: `stress-seed-${scenarioId}`,
    worldStartedAtMs: 0,
    nowMs: 0,
    spotTicks: spotPathTicks[0],
    playerCashCents: 100_000_000,
    playerExternalCollateralCents: 100_000_000,
  });
  const openingUnderlyingSpots = Object.fromEntries(
    Object.values(state.universe.underlyings).map(
      (underlying) => [
        underlying.id,
        underlying.spotTicks,
      ],
    ),
  );
  const scenarioUnderlyingSpots = (ticks) =>
    underlyingSpots(
      state,
      ticks,
      openingUnderlyingSpots,
      spotPathTicks[0],
    );
  const openingSystemCashCents = systemCashCents(state);
  const openingActorCashCents = Object.fromEntries(
    Object.keys(state.actors).map((actorId) => [
      actorId,
      state.accounts[actorId].cashCents,
    ]),
  );
  const openingCounterpartyCashCents =
    openingSystemCashCents -
    Object.values(openingActorCashCents).reduce(
      (sum, cashCents) => sum + cashCents,
      0,
    );
  const openingFacilityClaimCents =
    facilityClaimCents(state);
  const openingActorEquityCents = Object.fromEntries(
    Object.keys(state.actors).map((actorId) => [
      actorId,
      markAccountEquity({
        account: state.accounts[actorId],
        universe: state.universe,
        marks: {
          ...state.market.settlementPriceTicks,
          ...state.market.lastTradePriceTicks,
        },
      }),
    ]),
  );
  ({ state } = reduceDerivatives(state, {
    type: 'SYNC_WORLD',
    atMs: 0,
    totalEquivalentAssetCents: ACCESS_THRESHOLD_CENTS,
    underlyingSpots: scenarioUnderlyingSpots(
      spotPathTicks[0],
    ),
    playerExternalCollateralCents: 100_000_000,
    regimeSignalBps: 0,
    jumpRiskBps: 200,
    source: 'stress_harness',
  }));

  for (
    let index = 1;
    index < spotPathTicks.length;
    index += 1
  ) {
    const settlementAtMs = index * DAY_MS;
    const previous = spotPathTicks[index - 1];
    const current = spotPathTicks[index];
    const regimeSignalBps = Math.round(
      (current - previous) * 10_000 / previous,
    );
    ({ state } = reduceDerivatives(state, {
      type: 'SYNC_WORLD',
      atMs: settlementAtMs - 2_000,
      totalEquivalentAssetCents:
        ACCESS_THRESHOLD_CENTS,
      underlyingSpots:
        scenarioUnderlyingSpots(current),
      playerExternalCollateralCents: 100_000_000,
      regimeSignalBps,
      jumpRiskBps:
        Math.abs(regimeSignalBps) + 200,
      source: 'stress_harness',
    }));
    ({ state } = reduceDerivatives(state, {
      type: 'RUN_ACTOR_CYCLE',
      atMs: settlementAtMs - 1_000,
      source: 'stress_harness',
    }));
    ({ state } = reduceDerivatives(state, {
      type: 'SETTLE_DAY',
      atMs: settlementAtMs,
      source: 'stress_harness',
    }));
    ({ state } = reduceDerivatives(state, {
      type: 'EXPIRE_CONTRACTS',
      atMs: settlementAtMs,
      underlyingSettlementTicks:
        scenarioUnderlyingSpots(current),
      source: 'stress_harness',
    }));
  }

  const actorCashPnLCents = Object.fromEntries(
    Object.keys(state.actors).map((actorId) => [
      actorId,
      state.accounts[actorId].cashCents -
      openingActorCashCents[actorId],
    ]),
  );
  const closingMarks = {
    ...state.market.settlementPriceTicks,
    ...state.market.lastTradePriceTicks,
  };
  const actorEquityPnLCents = Object.fromEntries(
    Object.keys(state.actors).map((actorId) => [
      actorId,
      markAccountEquity({
        account: state.accounts[actorId],
        universe: state.universe,
        marks: closingMarks,
      }) - openingActorEquityCents[actorId],
    ]),
  );
  const audit = auditDerivativesState(state);
  const closingSystemCashCents = systemCashCents(state);
  const closingActorCashCents = Object.keys(
    state.actors,
  ).reduce(
    (sum, actorId) =>
      sum + state.accounts[actorId].cashCents,
    0,
  );
  const counterpartyCashPnLCents =
    closingSystemCashCents -
    closingActorCashCents -
    openingCounterpartyCashCents;
  const facilityClaimPnLCents =
    facilityClaimCents(state) -
    openingFacilityClaimCents;
  const actorCashPnLTotalCents =
    Object.values(actorCashPnLCents).reduce(
      (sum, pnl) => sum + pnl,
      0,
    );
  const actorEquityPnLTotalCents =
    Object.values(actorEquityPnLCents).reduce(
      (sum, pnl) => sum + pnl,
      0,
    );
  const result = {
    ruleVersion: STRESS_RULE_VERSION,
    scenarioId,
    observationCount: spotPathTicks.length,
    tradeCount: state.market.trades.length,
    expiredContractCount: [
      ...Object.values(state.universe.futures),
      ...Object.values(state.universe.options),
    ].filter((contract) => contract.status === 'expired')
      .length +
      state.historyCompaction.archivedContractCount,
    actorCashPnLCents,
    actorEquityPnLCents,
    counterpartyCashPnLCents,
    facilityClaimPnLCents,
    actorCashClearingResidualCents:
      actorCashPnLTotalCents +
      counterpartyCashPnLCents,
    actorEquityClearingResidualCents:
      actorEquityPnLTotalCents +
      counterpartyCashPnLCents +
      facilityClaimPnLCents,
    actorOutcomeSigns: Object.fromEntries(
      Object.entries(actorEquityPnLCents).map(
        ([actorId, pnl]) => [actorId, outcomeSign(pnl)],
      ),
    ),
    cashConserved:
      closingSystemCashCents === openingSystemCashCents,
    openingSystemCashCents,
    closingSystemCashCents,
    audit,
    matchedPriceAuthorityOnly:
      state.market.trades.every(
        (trade) =>
          trade.priceAuthority === 'matched_order_fill',
      ),
  };
  return {
    ...result,
    deterministicDigest: fnv1a(JSON.stringify(result)),
  };
}

export function runDerivativeStressSuite(
  scenarios = DEFAULT_SCENARIOS,
) {
  const results = scenarios.map((scenario) =>
    runDerivativeStressScenario({
      scenarioId: scenario.id,
      spotPathTicks: [...scenario.spotPathTicks],
    }),
  );
  const actorIds = Object.keys(
    results[0]?.actorCashPnLCents ?? {},
  );
  const actorOutcomeSigns = Object.fromEntries(
    actorIds.map((actorId) => [
      actorId,
      results.map(
        (result) =>
          result.actorOutcomeSigns[actorId],
      ),
    ]),
  );
  const noAlwaysProfitableActors = actorIds.every(
    (actorId) =>
      !results.every(
        (result) =>
          result.actorEquityPnLCents[actorId] > 0,
      ),
  );
  const summary = {
    ruleVersion: STRESS_RULE_VERSION,
    scenarios: results,
    actorOutcomeSigns,
    noAlwaysProfitableActors,
    allCashConserved: results.every(
      (result) => result.cashConserved,
    ),
    allAuditsPass: results.every(
      (result) => result.audit.ok,
    ),
    allPricesFromMatches: results.every(
      (result) => result.matchedPriceAuthorityOnly,
    ),
  };
  return {
    ...summary,
    suiteDigest: fnv1a(JSON.stringify(summary)),
  };
}

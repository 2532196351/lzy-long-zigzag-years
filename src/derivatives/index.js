export {
  ACCESS_CONTINUOUS_MS,
  ACCESS_RULE_VERSION,
  ACCESS_THRESHOLD_CENTS,
  DERIVATIVE_PERMISSIONS,
  TESTING_ACCESS_POLICY,
  checkpointAccess,
  createAccessState,
  createTestingOpenAccessState,
  derivePermissionMode,
  enablePermission,
  observeEligibility,
  restoreAccess,
} from './eligibility.js?v=f34a1d70e1a7aaed';

export {
  CONTRACT_RULE_VERSION,
  DERIVATIVE_EQUITY_BASKETS,
  DERIVATIVE_EQUITY_BASKET_VERSIONS,
  PREVIOUS_CONTRACT_RULE_VERSION,
  allContracts,
  appendSyntheticExpiry,
  assertContractUniverse,
  buildEquityBasketSettlementReferences,
  contractById,
  contractDisplayName,
  contractReferenceSpotTicks,
  createSyntheticDerivativeUniverse,
  equityBasketByIdentity,
  equityBasketDisplayName,
  equityBasketIdentity,
  sameEquityBasketIdentity,
} from './contracts.js?v=f34a1d70e1a7aaed';

export {
  DAYS_PER_YEAR,
  OPTION_NUMERIC_RULE_VERSION,
  impliedVolatility,
  noArbitrageBounds,
  priceEuropeanOption,
  putCallParityGapTicks,
  surfaceVolatilityPpm,
} from './pricing.js?v=f34a1d70e1a7aaed';

export {
  FINANCING_INITIAL_RATIO_BPS,
  FINANCING_LIQUIDATION_RATIO_BPS,
  FINANCING_MAINTENANCE_RATIO_BPS,
  LENDING_INITIAL_RATIO_BPS,
  LENDING_LIQUIDATION_RATIO_BPS,
  LENDING_MAINTENANCE_RATIO_BPS,
  RISK_RULE_VERSION,
  accrueInterestCents,
  applyMatchedFill,
  calculatePortfolioMargin,
  createDerivativeAccount,
  facilityRiskState,
  markAccountEquity,
  netContractPositions,
  securitiesLendingRiskState,
  settleFutureVariation,
} from './risk.js?v=f34a1d70e1a7aaed';

export {
  ACTOR_RULE_VERSION,
  actorOrderInvariantErrors,
  createDerivativeActorCatalog,
  deriveActorCommands,
  updateActorCapacity,
} from './actors.js?v=f34a1d70e1a7aaed';

export {
  DERIVATIVES_RULE_VERSION,
  auditDerivativesState,
  buildRollCommands,
  checkpointDerivatives,
  createDerivativesState,
  reduceDerivatives,
  restoreDerivatives,
  snapshotDerivatives,
} from './engine.js?v=f34a1d70e1a7aaed';

export {
  STRESS_RULE_VERSION,
  runDerivativeStressScenario,
  runDerivativeStressSuite,
} from './stress.js?v=f34a1d70e1a7aaed';

export const DERIVATIVE_COMMAND_TYPES = Object.freeze([
  'SYNC_WORLD',
  'ENABLE_PERMISSION',
  'SUBMIT_ORDER',
  'CANCEL_ORDER',
  'RUN_ACTOR_CYCLE',
  'SETTLE_DAY',
  'EXPIRE_CONTRACTS',
  'MAINTAIN_CONTRACTS',
  'DRAW_MARGIN_CREDIT',
  'REPAY_MARGIN_CREDIT',
  'BORROW_SECURITY',
  'RETURN_SECURITY',
  'LIQUIDATE_ACCOUNT',
]);

const INTEGRATION_CONTRACT = Object.freeze({
  version: 'lzy-derivatives-integration-v2',
  worldAuthority: 'existing_world_writer',
  ownsClock: false,
  startsTimers: false,
  stateOwnership: 'embedded_in_existing_world_state',
  worldSyncCadence:
    'on_every_authoritative_asset_or_reference_commit',
  saveBarrier:
    'checkpoint_with_parent_world_at_same_parent_commit',
  cashReconciliation:
    'parent_world_applies_each_returned_player_cash_or_debt_delta_exactly_once',
  reducer: 'reduceDerivatives(state, command)',
  checkpoint: 'checkpointDerivatives(state)',
  restore: 'restoreDerivatives(checkpoint, { worldId })',
  projection: 'snapshotDerivatives(state, depth)',
  requiredWorldSyncFields: Object.freeze([
    'atMs',
    'totalEquivalentAssetCents',
    'playerCashCents',
    'underlyingSpots',
    'securityReferencePrices',
    'playerExternalCollateralCents',
    'regimeSignalBps',
    'jumpRiskBps',
    'liquidityRiskBps',
  ]),
  optionalVersionedReferenceField:
    'underlyingBasketSpots[underlyingId][constituentSetVersion] = { spotTicks, basketIdentity }',
  historicalFinalSettlementField:
    'underlyingSettlementReferences[underlyingId][constituentSetVersion] = { spotTicks, basketIdentity }',
  settlementReferenceBuilder:
    'buildEquityBasketSettlementReferences(universe, spotTicksByUnderlyingVersion)',
  commandTypes: DERIVATIVE_COMMAND_TYPES,
  orderingRule:
    'The existing world writer assigns atMs and serializes commands with stock/world settlement; this module rejects time rewind.',
  priceAuthority:
    'Tradable derivative last prices are written only by matched order fills; world references and model values are diagnostics or contractual settlement inputs.',
});

export function getDerivativeIntegrationContract() {
  return JSON.parse(JSON.stringify(INTEGRATION_CONTRACT));
}

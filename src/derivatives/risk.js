import {
  allContracts,
  contractById,
  contractReferenceSpotTicks,
  sameEquityBasketIdentity,
} from './contracts.js?v=f34a1d70e1a7aaed';
import {
  priceEuropeanOption,
  resolveOptionCarryInputs,
} from './pricing.js?v=f34a1d70e1a7aaed';

export const RISK_RULE_VERSION = 'lzy-derivatives-risk-v1';
export const FINANCING_INITIAL_RATIO_BPS = 18_000;
export const FINANCING_MAINTENANCE_RATIO_BPS = 15_000;
export const FINANCING_LIQUIDATION_RATIO_BPS = 11_000;
export const LENDING_INITIAL_RATIO_BPS = 15_000;
export const LENDING_MAINTENANCE_RATIO_BPS = 13_000;
export const LENDING_LIQUIDATION_RATIO_BPS = 11_000;

const DAY_MS = 24 * 60 * 60 * 1_000;
const YEAR_MS = 365 * DAY_MS;
const BPS = 10_000;

function integer(value, label) {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer`);
  }
  return value;
}

function nonNegativeInteger(value, label) {
  integer(value, label);
  if (value < 0) {
    throw new RangeError(`${label} cannot be negative`);
  }
  return value;
}

function positiveInteger(value, label) {
  integer(value, label);
  if (value <= 0) {
    throw new RangeError(`${label} must be positive`);
  }
  return value;
}

function referenceSpotTicks(universe, contract) {
  return positiveInteger(
    contractReferenceSpotTicks(universe, contract),
    `reference spot for ${contract.id}`,
  );
}

function ceilRatio(value, basisPoints) {
  const numerator = BigInt(value) * BigInt(basisPoints);
  const denominator = BigInt(BPS);
  return Number(
    (numerator + denominator - 1n) / denominator,
  );
}

function emptyPosition(contract) {
  return {
    contractId: contract.id,
    basketIdentity: contract.basketIdentity
      ? JSON.parse(JSON.stringify(contract.basketIdentity))
      : null,
    quantity: 0,
    averageOpenPriceTicks: 0,
    lastSettlementPriceTicks: null,
    realizedPnLCents: 0,
  };
}

function updateAveragePosition(
  account,
  contract,
  signedQuantity,
  priceTicks,
) {
  let position =
    account.positions[contract.id] ??
    emptyPosition(contract);
  const existing = position.quantity;
  const next = existing + signedQuantity;
  if (
    existing === 0 ||
    Math.sign(existing) === Math.sign(signedQuantity)
  ) {
    const totalUnits =
      Math.abs(existing) + Math.abs(signedQuantity);
    position.averageOpenPriceTicks = Math.round(
      (
        Math.abs(existing) *
          position.averageOpenPriceTicks +
        Math.abs(signedQuantity) * priceTicks
      ) /
        totalUnits,
    );
    if (contract.type === 'future') {
      const previousSettlement =
        position.lastSettlementPriceTicks ??
        position.averageOpenPriceTicks;
      position.lastSettlementPriceTicks = Math.round(
        (
          Math.abs(existing) * previousSettlement +
          Math.abs(signedQuantity) * priceTicks
        ) /
          totalUnits,
      );
    }
  } else if (Math.abs(signedQuantity) > Math.abs(existing)) {
    position.averageOpenPriceTicks = priceTicks;
    position.lastSettlementPriceTicks =
      contract.type === 'future' ? priceTicks : null;
  }
  position.quantity = next;
  if (next === 0) {
    position.averageOpenPriceTicks = 0;
    position.lastSettlementPriceTicks = null;
  }
  account.positions[contract.id] = position;
  return position;
}

function realizeClosedOption(
  account,
  contract,
  signedQuantity,
  priceTicks,
) {
  const position = account.positions[contract.id];
  if (
    !position ||
    position.quantity === 0 ||
    Math.sign(position.quantity) ===
      Math.sign(signedQuantity)
  ) {
    return 0;
  }
  const closingQuantity = Math.min(
    Math.abs(position.quantity),
    Math.abs(signedQuantity),
  );
  const realizedPnLCents =
    closingQuantity *
    (
      priceTicks -
      position.averageOpenPriceTicks
    ) *
    contract.tickValueCents *
    Math.sign(position.quantity);
  account.realizedPnLCents += realizedPnLCents;
  position.realizedPnLCents += realizedPnLCents;
  return realizedPnLCents;
}

export function createDerivativeAccount({
  id,
  cashCents,
  accountType = 'participant',
  policyId = null,
  externalCollateralCents = 0,
  externalReservedCashCents = 0,
  facilityEligibleCollateralCents = null,
  capacityCents = null,
} = {}) {
  if (typeof id !== 'string' || id.length === 0) {
    throw new TypeError('account id must be a non-empty string');
  }
  nonNegativeInteger(cashCents, 'cashCents');
  nonNegativeInteger(
    externalCollateralCents,
    'externalCollateralCents',
  );
  nonNegativeInteger(
    externalReservedCashCents,
    'externalReservedCashCents',
  );
  if (externalReservedCashCents > cashCents) {
    throw new RangeError(
      'externalReservedCashCents cannot exceed cashCents',
    );
  }
  const initialCapacity =
    capacityCents === null ? cashCents : capacityCents;
  nonNegativeInteger(initialCapacity, 'capacityCents');
  const initialFacilityEligibleCollateralCents =
    facilityEligibleCollateralCents === null
      ? cashCents + externalCollateralCents
      : facilityEligibleCollateralCents;
  nonNegativeInteger(
    initialFacilityEligibleCollateralCents,
    'facilityEligibleCollateralCents',
  );
  return {
    id,
    accountType,
    policyId,
    cashCents,
    externalCollateralCents,
    externalReservedCashCents,
    facilityEligibleCollateralCents:
      initialFacilityEligibleCollateralCents,
    positions: {},
    reservedInitialMarginCents: 0,
    reservedTransactionFeesCents: 0,
    transactionFeesCents: 0,
    clearingDefault: {
      status: 'CURRENT',
      liabilityCents: 0,
      defaultFundDrawnCents: 0,
      lastDefaultAtMs: null,
    },
    financing: {
      cashDebtCents: 0,
      annualRateBps: 800,
      lastAccruedAtMs: 0,
    },
    borrowedSecurities: {},
    borrowedSecurityCustody: {},
    realizedPnLCents: 0,
    initialCapitalCents: cashCents,
    peakEquityCents: cashCents + externalCollateralCents,
    capacityCents: initialCapacity,
    capacityMultiplierBps: BPS,
    riskStatus: 'NORMAL',
    lifecycleStatus: 'ACTIVE',
  };
}

export function applyMatchedFill({
  accounts,
  contract,
  priceTicks,
  quantity,
  buyerId,
  sellerId,
}) {
  positiveInteger(priceTicks, 'priceTicks');
  positiveInteger(quantity, 'quantity');
  const buyer = accounts?.[buyerId];
  const seller = accounts?.[sellerId];
  if (!buyer || !seller) {
    throw new Error('Matched fill requires valid accounts');
  }
  const selfTrade = buyer === seller;
  let premiumCents = 0;
  let futuresVariation = null;
  let buyerRealizedPnLCents = 0;
  let sellerRealizedPnLCents = 0;
  if (contract.type === 'option') {
    premiumCents =
      priceTicks * quantity * contract.tickValueCents;
    if (!Number.isSafeInteger(premiumCents)) {
      throw new RangeError('option premium exceeds safe integer range');
    }
    if (selfTrade) {
      return {
        contractId: contract.id,
        buyerId,
        sellerId,
        selfTrade: true,
        priceTicks,
        quantity,
        premiumCents,
        futuresVariation,
        buyerRealizedPnLCents,
        sellerRealizedPnLCents,
      };
    }
    if (buyer.cashCents < premiumCents) {
      throw new Error('INSUFFICIENT_OPTION_PREMIUM_CASH');
    }
    buyer.cashCents -= premiumCents;
    seller.cashCents += premiumCents;
    buyerRealizedPnLCents = realizeClosedOption(
      buyer,
      contract,
      quantity,
      priceTicks,
    );
    sellerRealizedPnLCents = realizeClosedOption(
      seller,
      contract,
      -quantity,
      priceTicks,
    );
  } else if (contract.type === 'future') {
    if (selfTrade) {
      return {
        contractId: contract.id,
        buyerId,
        sellerId,
        selfTrade: true,
        priceTicks,
        quantity,
        premiumCents,
        futuresVariation,
        buyerRealizedPnLCents,
        sellerRealizedPnLCents,
      };
    }
    // Rebase every open futures position on this contract to the matched
    // trade before transferring inventory. This realizes the existing
    // zero-sum variation first, so a close or novation cannot erase one
    // side's cost basis and manufacture cash at the next daily settlement.
    futuresVariation = settleFutureVariation({
      accounts,
      contract,
      settlementPriceTicks: priceTicks,
    });
    if (futuresVariation.netCashflowCents !== 0) {
      throw new Error(
        `NON_ZERO_INTRADAY_FUTURES_VARIATION:${contract.id}`,
      );
    }
  } else {
    throw new RangeError('Unsupported derivative contract');
  }
  updateAveragePosition(
    buyer,
    contract,
    quantity,
    priceTicks,
  );
  updateAveragePosition(
    seller,
    contract,
    -quantity,
    priceTicks,
  );
  return {
    contractId: contract.id,
    buyerId,
    sellerId,
    selfTrade: false,
    priceTicks,
    quantity,
    premiumCents,
    futuresVariation,
    buyerRealizedPnLCents,
    sellerRealizedPnLCents,
  };
}

function optionScenarioMargin({
  account,
  universe,
  marks,
  atMs,
  volatilityPpmByContract,
}) {
  const optionPositions = Object.values(account.positions)
    .filter((position) => {
      const contract = universe.options[position.contractId];
      return contract && position.quantity !== 0;
    });
  if (optionPositions.length === 0) {
    return {
      optionInitialMarginCents: 0,
      optionMaintenanceMarginCents: 0,
      optionScenarioLossesCents: [],
    };
  }
  if (
    optionPositions.every(
      (position) => position.quantity >= 0,
    )
  ) {
    return {
      optionInitialMarginCents: 0,
      optionMaintenanceMarginCents: 0,
      optionScenarioLossesCents: [],
    };
  }

  const scenarios = [];
  for (const spotMultiplierBps of [
    7_000,
    8_500,
    10_000,
    11_500,
    13_000,
  ]) {
    for (const volatilityMultiplierBps of [
      7_000,
      10_000,
      13_000,
    ]) {
      scenarios.push({
        spotMultiplierBps,
        volatilityMultiplierBps,
      });
    }
  }
  let shortMinimumCents = 0;
  for (const position of optionPositions) {
    if (position.quantity >= 0) continue;
    const contract =
      universe.options[position.contractId];
    const spotTicks = referenceSpotTicks(
      universe,
      contract,
    );
    shortMinimumCents += ceilRatio(
      Math.abs(position.quantity) *
        spotTicks *
        contract.tickValueCents,
      200,
    );
  }

  const losses = scenarios.map((scenario) => {
    let pnlCents = 0;
    for (const position of optionPositions) {
      const contract =
        universe.options[position.contractId];
      const spotTicks = referenceSpotTicks(
        universe,
        contract,
      );
      const baseVolatilityPpm =
        volatilityPpmByContract?.[contract.id] ?? 250_000;
      const scenarioSpotTicks = Math.max(
        1,
        Math.round(
          spotTicks *
            scenario.spotMultiplierBps /
            BPS,
        ),
      );
      const scenarioVolatilityPpm = Math.max(
        1,
        Math.round(
          baseVolatilityPpm *
            scenario.volatilityMultiplierBps /
            BPS,
        ),
      );
      const timeToExpiryMs = Math.max(
        0,
        contract.expiryMs - atMs,
      );
      const optionCarry = resolveOptionCarryInputs({
        contract,
        underlying:
          universe.underlyings[
            contract.underlyingId
          ],
      });
      const basePriceTicks =
        marks?.[contract.id] ??
        priceEuropeanOption({
          kind: contract.kind,
          spotTicks,
          strikeTicks: contract.strikeTicks,
          timeToExpiryMs,
          volatilityPpm: baseVolatilityPpm,
          ...optionCarry,
        }).priceTicks;
      const scenarioPriceTicks = priceEuropeanOption({
        kind: contract.kind,
        spotTicks: scenarioSpotTicks,
        strikeTicks: contract.strikeTicks,
        timeToExpiryMs,
        volatilityPpm: scenarioVolatilityPpm,
        ...optionCarry,
      }).priceTicks;
      pnlCents +=
        position.quantity *
        (scenarioPriceTicks - basePriceTicks) *
        contract.tickValueCents;
    }
    return Math.max(0, -pnlCents);
  });
  const worstLoss = Math.max(0, ...losses);
  const initial = Math.max(worstLoss, shortMinimumCents);
  return {
    optionInitialMarginCents: initial,
    optionMaintenanceMarginCents: ceilRatio(initial, 8_000),
    optionScenarioLossesCents: losses,
  };
}

export function calculatePortfolioMargin({
  account,
  universe,
  marks = {},
  atMs,
  volatilityPpmByContract = {},
}) {
  nonNegativeInteger(atMs, 'atMs');
  let futuresNotionalCents = 0;
  let futuresInitialMarginCents = 0;
  let futuresMaintenanceMarginCents = 0;
  for (const position of Object.values(account.positions)) {
    const contract = universe.futures[position.contractId];
    if (!contract || position.quantity === 0) continue;
    const mark =
      marks[contract.id] ??
      position.lastSettlementPriceTicks ??
      position.averageOpenPriceTicks;
    positiveInteger(mark, `mark:${contract.id}`);
    const notional =
      Math.abs(position.quantity) *
      mark *
      contract.tickValueCents;
    if (!Number.isSafeInteger(notional)) {
      throw new RangeError('futures notional exceeds safe integer range');
    }
    futuresNotionalCents += notional;
    futuresInitialMarginCents += ceilRatio(
      notional,
      contract.initialMarginBps,
    );
    futuresMaintenanceMarginCents += ceilRatio(
      notional,
      contract.maintenanceMarginBps,
    );
  }
  const option = optionScenarioMargin({
    account,
    universe,
    marks,
    atMs,
    volatilityPpmByContract,
  });
  return {
    futuresNotionalCents,
    futuresInitialMarginCents,
    futuresMaintenanceMarginCents,
    ...option,
    initialMarginCents:
      futuresInitialMarginCents +
      option.optionInitialMarginCents +
      account.reservedInitialMarginCents,
    maintenanceMarginCents:
      futuresMaintenanceMarginCents +
      option.optionMaintenanceMarginCents,
  };
}

export function settleFutureVariation({
  accounts,
  contract,
  settlementPriceTicks,
}) {
  if (contract.type !== 'future') {
    throw new RangeError(
      'Variation margin applies only to futures',
    );
  }
  positiveInteger(
    settlementPriceTicks,
    'settlementPriceTicks',
  );
  const cashflows = {};
  let netCashflowCents = 0;
  for (const account of Object.values(accounts)) {
    const position = account.positions[contract.id];
    if (!position || position.quantity === 0) continue;
    const previous =
      position.lastSettlementPriceTicks ??
      position.averageOpenPriceTicks;
    const cashflow =
      position.quantity *
      (settlementPriceTicks - previous) *
      contract.tickValueCents;
    if (!Number.isSafeInteger(cashflow)) {
      throw new RangeError(
        'variation margin exceeds safe integer range',
      );
    }
    account.cashCents += cashflow;
    account.realizedPnLCents += cashflow;
    position.realizedPnLCents += cashflow;
    position.lastSettlementPriceTicks =
      settlementPriceTicks;
    cashflows[account.id] = cashflow;
    netCashflowCents += cashflow;
  }
  return {
    contractId: contract.id,
    settlementPriceTicks,
    cashflows,
    netCashflowCents,
  };
}

export function facilityRiskState({
  collateralValueCents,
  debtCents,
}) {
  nonNegativeInteger(
    collateralValueCents,
    'collateralValueCents',
  );
  nonNegativeInteger(debtCents, 'debtCents');
  const collateralRatioBps =
    debtCents === 0
      ? null
      : Math.floor(
          collateralValueCents * BPS / debtCents,
        );
  let status = 'NORMAL';
  if (
    collateralRatioBps !== null &&
    collateralRatioBps <
      FINANCING_LIQUIDATION_RATIO_BPS
  ) {
    status = 'LIQUIDATE';
  } else if (
    collateralRatioBps !== null &&
    collateralRatioBps <
      FINANCING_MAINTENANCE_RATIO_BPS
  ) {
    status = 'MARGIN_CALL';
  }
  return {
    status,
    collateralRatioBps,
    maintenanceRatioBps:
      FINANCING_MAINTENANCE_RATIO_BPS,
    liquidationRatioBps:
      FINANCING_LIQUIDATION_RATIO_BPS,
  };
}

export function securitiesLendingRiskState({
  collateralValueCents,
  borrowedSecurities = {},
}) {
  nonNegativeInteger(
    collateralValueCents,
    'collateralValueCents',
  );
  let liabilityCents = 0;
  for (const loan of Object.values(
    borrowedSecurities ?? {},
  )) {
    positiveInteger(loan.quantity, 'borrowed quantity');
    positiveInteger(
      loan.referencePriceTicks,
      'borrowed referencePriceTicks',
    );
    const accruedFeeCents =
      loan.accruedFeeCents ?? 0;
    nonNegativeInteger(
      accruedFeeCents,
      'borrowed accruedFeeCents',
    );
    const liability =
      loan.quantity * loan.referencePriceTicks +
      accruedFeeCents;
    if (!Number.isSafeInteger(liability)) {
      throw new RangeError(
        'borrowed security liability exceeds safe integer range',
      );
    }
    liabilityCents += liability;
  }
  const collateralRatioBps =
    liabilityCents === 0
      ? null
      : Math.floor(
          collateralValueCents * BPS /
            liabilityCents,
        );
  const initialRequiredCollateralCents = ceilRatio(
    liabilityCents,
    LENDING_INITIAL_RATIO_BPS,
  );
  const maintenanceRequiredCollateralCents = ceilRatio(
    liabilityCents,
    LENDING_MAINTENANCE_RATIO_BPS,
  );
  const liquidationRequiredCollateralCents = ceilRatio(
    liabilityCents,
    LENDING_LIQUIDATION_RATIO_BPS,
  );
  let status = 'NORMAL';
  if (
    liabilityCents > 0 &&
    collateralValueCents <
      liquidationRequiredCollateralCents
  ) {
    status = 'LIQUIDATE';
  } else if (
    liabilityCents > 0 &&
    collateralValueCents <
      maintenanceRequiredCollateralCents
  ) {
    status = 'MARGIN_CALL';
  }
  return {
    status,
    liabilityCents,
    collateralRatioBps,
    initialRatioBps: LENDING_INITIAL_RATIO_BPS,
    maintenanceRatioBps: LENDING_MAINTENANCE_RATIO_BPS,
    liquidationRatioBps: LENDING_LIQUIDATION_RATIO_BPS,
    initialRequiredCollateralCents,
    maintenanceRequiredCollateralCents,
    liquidationRequiredCollateralCents,
  };
}

export function accrueInterestCents({
  principalCents,
  annualRateBps,
  elapsedMs,
}) {
  nonNegativeInteger(principalCents, 'principalCents');
  nonNegativeInteger(annualRateBps, 'annualRateBps');
  nonNegativeInteger(elapsedMs, 'elapsedMs');
  if (
    principalCents === 0 ||
    annualRateBps === 0 ||
    elapsedMs === 0
  ) {
    return 0;
  }
  const numerator =
    BigInt(principalCents) *
    BigInt(annualRateBps) *
    BigInt(elapsedMs);
  const denominator =
    BigInt(BPS) * BigInt(YEAR_MS);
  return Number(
    (numerator + denominator - 1n) / denominator,
  );
}

export function netContractPositions(accounts) {
  const totals = {};
  for (const account of Object.values(accounts ?? {})) {
    for (const position of Object.values(
      account.positions ?? {},
    )) {
      totals[position.contractId] =
        (totals[position.contractId] ?? 0) +
        position.quantity;
    }
  }
  return totals;
}

export function markAccountEquity({
  account,
  universe,
  marks = {},
}) {
  let equity =
    account.cashCents +
    account.externalCollateralCents -
    account.financing.cashDebtCents;
  for (const loan of Object.values(
    account.borrowedSecurities ?? {},
  )) {
    const liabilityCents =
      loan.quantity * loan.referencePriceTicks;
    equity -=
      liabilityCents + (loan.accruedFeeCents ?? 0);
    if (account.accountType !== 'player') {
      equity +=
        (account.borrowedSecurityCustody?.[
          loan.securityId
        ] ?? 0) * loan.referencePriceTicks;
    }
  }
  for (const position of Object.values(account.positions)) {
    const contract = contractById(
      universe,
      position.contractId,
    );
    if (!contract || position.quantity === 0) continue;
    const mark =
      marks[contract.id] ??
      position.lastSettlementPriceTicks ??
      position.averageOpenPriceTicks;
    if (contract.type === 'option') {
      equity +=
        position.quantity *
        mark *
        contract.tickValueCents;
    } else {
      const previous =
        position.lastSettlementPriceTicks ??
        position.averageOpenPriceTicks;
      equity +=
        position.quantity *
        (mark - previous) *
        contract.tickValueCents;
    }
  }
  return equity;
}

export function auditRiskAccounts(accounts, universe) {
  const errors = [];
  const knownContracts = new Set(
    allContracts(universe).map((contract) => contract.id),
  );
  for (const account of Object.values(accounts ?? {})) {
    if (
      !account.id ||
      !Number.isSafeInteger(account.cashCents) ||
      account.cashCents < 0 ||
      !Number.isSafeInteger(account.externalCollateralCents) ||
      account.externalCollateralCents < 0 ||
      (
        account.accountType === 'player' &&
        (
          !Number.isSafeInteger(
            account.facilityEligibleCollateralCents,
          ) ||
          account.facilityEligibleCollateralCents < 0
        )
      ) ||
      !Number.isSafeInteger(
        account.reservedTransactionFeesCents,
      ) ||
      account.reservedTransactionFeesCents < 0 ||
      !Number.isSafeInteger(
        account.transactionFeesCents,
      ) ||
      account.transactionFeesCents < 0 ||
      !Number.isSafeInteger(
        account.externalReservedCashCents ?? 0,
      ) ||
      (account.externalReservedCashCents ?? 0) < 0 ||
      (account.externalReservedCashCents ?? 0) +
        account.reservedInitialMarginCents +
        account.reservedTransactionFeesCents >
        account.cashCents
    ) {
      errors.push(`INVALID_ACCOUNT:${account.id ?? 'unknown'}`);
    }
    if (
      !account.financing ||
      !Number.isSafeInteger(
        account.financing.cashDebtCents,
      ) ||
      account.financing.cashDebtCents < 0 ||
      !Number.isSafeInteger(
        account.financing.annualRateBps,
      ) ||
      account.financing.annualRateBps < 0 ||
      !Number.isSafeInteger(
        account.financing.lastAccruedAtMs,
      ) ||
      account.financing.lastAccruedAtMs < 0
    ) {
      errors.push(
        `INVALID_FINANCING_ACCOUNT:${account.id ?? 'unknown'}`,
      );
    }
    const clearingDefault = account.clearingDefault;
    if (
      !clearingDefault ||
      !['CURRENT', 'DEFAULTED'].includes(
        clearingDefault.status,
      ) ||
      !Number.isSafeInteger(
        clearingDefault.liabilityCents,
      ) ||
      clearingDefault.liabilityCents < 0 ||
      !Number.isSafeInteger(
        clearingDefault.defaultFundDrawnCents,
      ) ||
      clearingDefault.defaultFundDrawnCents < 0 ||
      clearingDefault.defaultFundDrawnCents >
        clearingDefault.liabilityCents ||
      (
        clearingDefault.lastDefaultAtMs !== null &&
        (
          !Number.isSafeInteger(
            clearingDefault.lastDefaultAtMs,
          ) ||
          clearingDefault.lastDefaultAtMs < 0
        )
      ) ||
      (
        clearingDefault.status === 'CURRENT' &&
        (
          clearingDefault.liabilityCents !== 0 ||
          clearingDefault.defaultFundDrawnCents !== 0 ||
          clearingDefault.lastDefaultAtMs !== null
        )
      ) ||
      (
        clearingDefault.status === 'DEFAULTED' &&
        (
          clearingDefault.liabilityCents <= 0 ||
          clearingDefault.lastDefaultAtMs === null
        )
      )
    ) {
      errors.push(
        `INVALID_CLEARING_DEFAULT_ACCOUNT:${account.id ?? 'unknown'}`,
      );
    }
    for (const position of Object.values(
      account.positions ?? {},
    )) {
      const contract = contractById(
        universe,
        position.contractId,
      );
      if (
        !knownContracts.has(position.contractId) ||
        !Number.isSafeInteger(position.quantity) ||
        !sameEquityBasketIdentity(
          position.basketIdentity,
          contract?.basketIdentity,
        )
      ) {
        errors.push(
          `INVALID_POSITION:${account.id}:${position.contractId}`,
        );
      }
    }
    for (const loan of Object.values(
      account.borrowedSecurities ?? {},
    )) {
      if (
        !loan.securityId ||
        !Number.isSafeInteger(loan.quantity) ||
        loan.quantity <= 0 ||
        !Number.isSafeInteger(loan.referencePriceTicks) ||
        loan.referencePriceTicks <= 0 ||
        !Number.isSafeInteger(loan.annualFeeBps) ||
        loan.annualFeeBps < 0 ||
        !Number.isSafeInteger(
          loan.accruedFeeCents ?? 0,
        ) ||
        (loan.accruedFeeCents ?? 0) < 0 ||
        !Number.isSafeInteger(loan.lastAccruedAtMs) ||
        loan.lastAccruedAtMs < 0
      ) {
        errors.push(
          `INVALID_BORROWED_SECURITY:${account.id}:${loan.securityId ?? 'unknown'}`,
        );
      }
    }
    const custody =
      account.borrowedSecurityCustody ?? {};
    if (
      !custody ||
      typeof custody !== 'object' ||
      Array.isArray(custody)
    ) {
      errors.push(
        `INVALID_BORROWED_SECURITY_CUSTODY:${account.id}`,
      );
    } else if (account.accountType === 'player') {
      if (
        Object.values(custody).some(
          (quantity) => quantity !== 0,
        )
      ) {
        errors.push(
          `PLAYER_BORROWED_SECURITY_CUSTODY_MUST_BE_EXTERNAL:${account.id}`,
        );
      }
    } else {
      const securityIds = new Set([
        ...Object.keys(
          account.borrowedSecurities ?? {},
        ),
        ...Object.keys(custody),
      ]);
      for (const securityId of securityIds) {
        const quantity = custody[securityId] ?? 0;
        if (
          !Number.isSafeInteger(quantity) ||
          quantity < 0 ||
          quantity !==
            (
              account.borrowedSecurities?.[
                securityId
              ]?.quantity ?? 0
            )
        ) {
          errors.push(
            `BORROWED_SECURITY_CUSTODY_MISMATCH:${account.id}:${securityId}`,
          );
        }
      }
    }
  }
  const net = netContractPositions(accounts);
  for (const [contractId, quantity] of Object.entries(net)) {
    if (quantity !== 0) {
      errors.push(`OPEN_INTERMEDIARY_IMBALANCE:${contractId}:${quantity}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

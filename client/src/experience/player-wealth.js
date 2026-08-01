/**
 * Authoritative read-side wealth projection for the player account.
 *
 * The projection reads one canonical world plus its latest market publication.
 * It never sends commands and never mutates either authority input.
 */

export const PLAYER_WEALTH_PROJECTION_VERSION =
  'lzy-player-wealth-v1';

const BPS_SCALE = 10_000;
const CENTS_PER_YUAN = 100;
const UI_CASH_ALLOCATION_BPS = Object.freeze(
  Array.from({ length: 15 }, (_, index) => 2_000 + index * 500),
);
const LEGACY_PROFILE_CAPITAL_CENTS = Object.freeze({
  household_low: 16_000_000,
  household_high: 98_000_000,
  professional_low: 72_000_000,
  professional_high: 480_000_000,
  operator_low: 42_000_000,
  operator_high: 260_000_000,
  institution_low: 320_000_000,
  institution_high: 2_400_000_000,
});
const LEGACY_PROFILE_NON_MARKET_NET_CENTS =
  Object.freeze({
    household_low: 17_400_000,
    household_high: 142_000_000,
    professional_low: 18_000_000,
    professional_high: 76_000_000,
    operator_low: 35_000_000,
    operator_high: 480_000_000,
    institution_low: -70_000_000,
    institution_high: -700_000_000,
  });

function record(value) {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value)
    ? value
    : null;
}

function safeInteger(value) {
  return Number.isSafeInteger(value) ? value : null;
}

function signedQuantity(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function amountToCents(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const cents = Math.round(parsed * CENTS_PER_YUAN);
  return Number.isSafeInteger(cents) ? cents : null;
}

function positiveTicks(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : null;
}

function safeProduct(left, right) {
  const product = left * right;
  return Number.isSafeInteger(product) ? product : null;
}

function safeSum(values) {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) return null;
    total += value;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

function ratioBps(amount, denominator) {
  if (
    !Number.isSafeInteger(amount) ||
    !Number.isSafeInteger(denominator) ||
    denominator <= 0
  ) {
    return null;
  }
  const ratio = Math.round(amount / denominator * BPS_SCALE);
  return Number.isSafeInteger(ratio) ? ratio : null;
}

function playerAccount(world, marketSnapshot) {
  const projected = record(marketSnapshot?.accounts)?.player;
  return record(projected) ?? {
    id: world.player.id,
    cashCents: amountToCents(world.player.cash),
    reservedCashCents: 0,
    holdings: record(world.player.holdings) ?? {},
    reservedHoldings: {},
    positionLedger: {},
  };
}

function cashProjection(world, account) {
  const frozenCents = Math.max(
    0,
    safeInteger(account.reservedCashCents) ?? 0,
  );
  let totalCents = safeInteger(account.cashCents);
  let source = 'market_account_total';

  if (totalCents === null) {
    const availableCents = safeInteger(account.availableCashCents);
    if (availableCents !== null) {
      totalCents = availableCents + frozenCents;
      source = 'market_account_available_plus_frozen';
    }
  }
  if (totalCents === null) {
    totalCents = amountToCents(world.player.cash);
    source = 'world_player_cash';
  }
  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents < 0 ||
    frozenCents > totalCents
  ) {
    throw new RangeError('Invalid canonical player cash balance.');
  }
  return {
    totalCents,
    availableCents: totalCents - frozenCents,
    frozenCents,
    source,
  };
}

function latestOpeningPriceTicks(security) {
  const points = Array.isArray(security?.priceHistory)
    ? security.priceHistory
    : [];
  const opening = points
    .filter(
      (point) =>
        Number(point?.tick) === 0 &&
        positiveTicks(amountToCents(point?.price)),
    )
    .sort((left, right) =>
      String(left.id ?? '').localeCompare(String(right.id ?? '')),
    )[0];
  return (
    positiveTicks(amountToCents(opening?.price)) ??
    positiveTicks(security?.previousCloseTicks) ??
    null
  );
}

function quoteForSymbol(
  symbol,
  world,
  marketSnapshot,
  account,
) {
  const marketSymbol = record(marketSnapshot?.symbols)?.[symbol];
  const portfolioPosition =
    record(account.portfolio?.positions)?.[symbol];
  const worldSecurity =
    record(world.market?.securities)?.[symbol];
  const candidates = [
    {
      ticks: positiveTicks(marketSymbol?.lastPriceTicks),
      source: 'market_snapshot',
    },
    {
      ticks: positiveTicks(portfolioPosition?.lastPriceTicks),
      source: 'market_portfolio',
    },
    {
      ticks: positiveTicks(amountToCents(worldSecurity?.lastPrice)),
      source: 'world_market_fallback',
    },
  ];
  const selected = candidates.find(
    (candidate) => candidate.ticks !== null,
  );
  if (!selected) {
    return {
      status: 'missing',
      priceTicks: null,
      source: null,
    };
  }
  return {
    status: 'available',
    priceTicks: selected.ticks,
    source: selected.source,
  };
}

function positionName(symbol, world) {
  const security = record(world.market?.securities)?.[symbol];
  const company =
    record(world.entities?.companies)?.[security?.issuerId];
  return String(
    company?.shortName ??
      company?.name ??
      security?.name ??
      symbol,
  );
}

function positionCost(account, symbol, quantity, priceTicks) {
  const ledger = record(account.positionLedger)?.[symbol];
  const portfolioPosition =
    record(account.portfolio?.positions)?.[symbol];
  let storedCostCents = safeInteger(ledger?.costCents);
  let source = 'position_ledger';
  let realizedPnlCents =
    safeInteger(ledger?.realizedPnlCents) ?? 0;

  if (storedCostCents === null) {
    storedCostCents = safeInteger(portfolioPosition?.costCents);
    realizedPnlCents =
      safeInteger(portfolioPosition?.realizedPnlCents) ??
      realizedPnlCents;
    source = 'market_portfolio';
  }
  if (storedCostCents === null && priceTicks !== null) {
    storedCostCents = safeProduct(quantity, priceTicks);
    source = 'quote_reconstruction';
  }
  if (storedCostCents === null) {
    return {
      signedCostCents: null,
      costBasisCents: null,
      averageCostTicks: null,
      realizedPnlCents,
      source: 'missing',
    };
  }

  const costBasisCents = Math.abs(storedCostCents);
  const signedCostCents =
    quantity < 0 ? -costBasisCents : costBasisCents;
  return {
    signedCostCents,
    costBasisCents,
    averageCostTicks:
      quantity === 0
        ? null
        : costBasisCents / Math.abs(quantity),
    realizedPnlCents,
    source,
  };
}

function projectPositions(world, marketSnapshot, account) {
  const holdings =
    record(account.holdings) ??
    record(world.player.holdings) ??
    {};
  return Object.keys(holdings)
    .sort()
    .map((symbol) => {
      const quantity = signedQuantity(holdings[symbol]);
      if (quantity === 0) return null;
      const frozenQuantity = Math.max(
        0,
        signedQuantity(
          record(account.reservedHoldings)?.[symbol] ??
            record(account.portfolio?.positions)?.[symbol]
              ?.reservedQuantity,
        ),
      );
      const quote = quoteForSymbol(
        symbol,
        world,
        marketSnapshot,
        account,
      );
      const cost = positionCost(
        account,
        symbol,
        quantity,
        quote.priceTicks,
      );
      const marketValueCents =
        quote.priceTicks === null
          ? null
          : safeProduct(quantity, quote.priceTicks);
      const holdingPnlCents =
        marketValueCents === null ||
        cost.signedCostCents === null
          ? null
          : marketValueCents - cost.signedCostCents;
      return {
        symbol,
        name: positionName(symbol, world),
        side: quantity < 0 ? 'short' : 'long',
        quantity,
        frozenQuantity,
        availableQuantity:
          quantity < 0
            ? quantity
            : Math.max(0, quantity - frozenQuantity),
        priceTicks: quote.priceTicks,
        quoteStatus: quote.status,
        quoteSource: quote.source,
        marketValueCents,
        costBasisCents: cost.costBasisCents,
        signedCostCents: cost.signedCostCents,
        averageCostTicks: cost.averageCostTicks,
        costSource: cost.source,
        holdingPnlCents,
        realizedPnlCents: cost.realizedPnlCents,
        returnBps: ratioBps(
          holdingPnlCents,
          cost.costBasisCents,
        ),
      };
    })
    .filter(Boolean);
}

function balanceSheetProjection(world) {
  const otherAssetsCents =
    amountToCents(world.player?.otherAssets) ?? 0;
  const liabilitiesCents =
    amountToCents(world.player?.liabilities) ?? 0;
  if (otherAssetsCents < 0 || liabilitiesCents < 0) {
    throw new RangeError(
      'Invalid canonical player balance sheet.',
    );
  }
  const derivativeAccount =
    record(world.derivatives?.accounts)?.player;
  const riskEquityCents = safeInteger(
    derivativeAccount?.risk?.equityCents,
  );
  const derivativeCashCents = safeInteger(
    derivativeAccount?.cashCents,
  );
  const derivativeCollateralCents = safeInteger(
    derivativeAccount?.externalCollateralCents,
  );
  const derivativeDebtCents =
    safeInteger(
      derivativeAccount?.financing?.cashDebtCents,
    ) ?? 0;
  const securitiesLoanLiabilityCents =
    safeInteger(
      derivativeAccount?.risk?.securitiesLending
        ?.liabilityCents,
    ) ?? 0;
  const derivativePositionValueCents =
    riskEquityCents !== null &&
    derivativeCashCents !== null &&
    derivativeCollateralCents !== null
      ? riskEquityCents -
        derivativeCashCents -
        derivativeCollateralCents +
        derivativeDebtCents
      : 0;
  if (
    !Number.isSafeInteger(
      derivativePositionValueCents,
    ) ||
    securitiesLoanLiabilityCents < 0
  ) {
    throw new RangeError(
      'Invalid canonical derivative valuation.',
    );
  }
  return {
    otherAssetsCents,
    liabilitiesCents,
    derivativePositionValueCents,
    securitiesLoanLiabilityCents,
  };
}

function canonicalBaseline(world, account) {
  const candidates = [
    [
      account.wealthBaseline?.equivalentCapitalCents,
      'market.accounts.player.wealthBaseline.equivalentCapitalCents',
    ],
    [
      account.initialEquivalentCapitalCents,
      'market.accounts.player.initialEquivalentCapitalCents',
    ],
    [
      world.player?.wealthBaseline?.equivalentCapitalCents,
      'world.player.wealthBaseline.equivalentCapitalCents',
    ],
    [
      world.player?.initialEquivalentCapitalCents,
      'world.player.initialEquivalentCapitalCents',
    ],
    [
      world.accounting?.playerInitialEquivalentCapitalCents,
      'world.accounting.playerInitialEquivalentCapitalCents',
    ],
  ];
  const selected = candidates.find(
    ([value]) => safeInteger(value) !== null && value > 0,
  );
  if (!selected) return null;
  return {
    equivalentCapitalCents: selected[0],
    status: 'canonical',
    source: selected[1],
  };
}

function openingPlayerHoldings(world) {
  const journals = Array.isArray(world.ledger) ? world.ledger : [];
  const opening = journals.find(
    (journal) => journal?.type === 'genesis_opening',
  );
  if (!opening || !Array.isArray(opening.securityTransfers)) {
    return null;
  }
  const holdings = {};
  for (const transfer of opening.securityTransfers) {
    if (transfer?.to !== world.player.id) continue;
    const symbol = String(transfer.symbol ?? '');
    const quantity = signedQuantity(transfer.quantity);
    if (!symbol || quantity < 0) return null;
    holdings[symbol] = (holdings[symbol] ?? 0) + quantity;
  }
  return Object.keys(holdings).length > 0 ? holdings : null;
}

function openingPrices(world, symbols) {
  const securities = record(world.market?.securities) ?? {};
  const prices = {};
  for (const symbol of symbols) {
    const ticks = latestOpeningPriceTicks(securities[symbol]);
    if (ticks === null) return null;
    prices[symbol] = ticks;
  }
  return prices;
}

function holdingsForAllocation(
  capitalCents,
  equityAllocationBps,
  prices,
) {
  const symbols = Object.keys(prices);
  const equityBudgetYuan =
    capitalCents /
    CENTS_PER_YUAN *
    equityAllocationBps /
    BPS_SCALE;
  const perSecurityYuan = equityBudgetYuan / symbols.length;
  return Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      Math.floor(
        perSecurityYuan /
          (prices[symbol] / CENTS_PER_YUAN),
      ),
    ]),
  );
}

function sameHoldings(left, right) {
  const symbols = new Set([
    ...Object.keys(left),
    ...Object.keys(right),
  ]);
  return [...symbols].every(
    (symbol) =>
      signedQuantity(left[symbol]) ===
      signedQuantity(right[symbol]),
  );
}

function migratedBaseline(world) {
  const profileId =
    String(world.player?.profileId ?? '') ||
    `${world.player?.roleType}_${world.player?.strengthTier}`;
  const capitalCents =
    LEGACY_PROFILE_CAPITAL_CENTS[profileId] ?? null;
  if (!capitalCents) return null;
  const nonMarketNetCents =
    LEGACY_PROFILE_NON_MARKET_NET_CENTS[profileId] ??
    0;

  const openingHoldings = openingPlayerHoldings(world);
  const prices = openingHoldings
    ? openingPrices(world, Object.keys(openingHoldings).sort())
    : null;
  if (openingHoldings && prices) {
    const matches = UI_CASH_ALLOCATION_BPS.filter(
      (cashAllocationBps) =>
        sameHoldings(
          holdingsForAllocation(
            capitalCents,
            BPS_SCALE - cashAllocationBps,
            prices,
          ),
          openingHoldings,
        ),
    );
    if (matches.length === 1) {
      const cashCents = Math.round(
        capitalCents * matches[0] / BPS_SCALE,
      );
      const openingMarketValueCents = safeSum(
        Object.entries(openingHoldings).map(
          ([symbol, quantity]) =>
            safeProduct(quantity, prices[symbol]),
        ),
      );
      const equivalentCapitalCents =
        openingMarketValueCents === null
          ? null
          : safeSum([cashCents, openingMarketValueCents]);
      if (equivalentCapitalCents !== null) {
        return {
          equivalentCapitalCents:
            equivalentCapitalCents +
            nonMarketNetCents,
          status: 'migrated',
          source:
            'legacy_genesis_net_asset_allocation_v2',
        };
      }
    }
  }

  return {
    equivalentCapitalCents:
      capitalCents + nonMarketNetCents,
    status: 'migrated',
    source: 'legacy_profile_net_assets_v2',
  };
}

function dayResult(
  world,
  account,
  positions,
  totalEquivalentCents,
) {
  if (totalEquivalentCents === null) {
    return {
      dayPnlCents: null,
      dayPnlSource: 'unavailable',
      dayStartEquivalentCents: null,
      dayReturnBps: null,
    };
  }
  const wholeAccountAnchor = safeInteger(
    world.accounting
      ?.playerDayStartEquivalentCapitalCents,
  );
  const wholeAccountAnchorTick = safeInteger(
    world.accounting?.playerDayStartTick,
  );
  if (
    wholeAccountAnchor !== null &&
    wholeAccountAnchorTick ===
      safeInteger(world.world?.tick)
  ) {
    const dayPnlCents =
      totalEquivalentCents - wholeAccountAnchor;
    return {
      dayPnlCents,
      dayPnlSource:
        'canonical_world_net_asset_anchor',
      dayStartEquivalentCents: wholeAccountAnchor,
      dayReturnBps: ratioBps(
        dayPnlCents,
        wholeAccountAnchor,
      ),
    };
  }
  let dayPnlCents = safeInteger(account.portfolio?.dayPnlCents);
  let dayPnlSource = 'canonical_portfolio';
  if (dayPnlCents === null) {
    const anchor = safeInteger(
      account.pnlDayAnchor?.totalPnlCents,
    );
    const currentPortfolioPnl = safeSum(
      positions.map((position) =>
        position.holdingPnlCents === null
          ? null
          : position.holdingPnlCents +
            position.realizedPnlCents,
      ),
    );
    if (anchor !== null && currentPortfolioPnl !== null) {
      dayPnlCents = currentPortfolioPnl - anchor;
      dayPnlSource = 'canonical_account_anchor';
    }
  }
  if (dayPnlCents === null) {
    return {
      dayPnlCents: null,
      dayPnlSource: 'unavailable',
      dayStartEquivalentCents: null,
      dayReturnBps: null,
    };
  }
  const dayStartEquivalentCents =
    totalEquivalentCents - dayPnlCents;
  return {
    dayPnlCents,
    dayPnlSource,
    dayStartEquivalentCents,
    dayReturnBps: ratioBps(
      dayPnlCents,
      dayStartEquivalentCents,
    ),
  };
}

/**
 * Rebuilds total marked wealth from canonical cash and signed positions.
 *
 * Cash identity:
 *   total cash = available cash + frozen cash
 *
 * Wealth identity:
 *   total equivalent cash = total cash + sum(quantity * latest price)
 *
 * Frozen cash/shares remain part of owned wealth; cost basis is used only for
 * position PnL and is never added to total wealth.
 */
export function projectPlayerWealth(
  world,
  marketSnapshot = null,
) {
  if (!world?.world?.id || !world?.player?.id) {
    throw new TypeError(
      'A complete authoritative world is required.',
    );
  }
  const account = playerAccount(world, marketSnapshot);
  const cash = cashProjection(world, account);
  const positions = projectPositions(
    world,
    marketSnapshot,
    account,
  );
  const missingQuoteSymbols = positions
    .filter((position) => position.quoteStatus === 'missing')
    .map((position) => position.symbol);
  const valuationStatus =
    missingQuoteSymbols.length === 0 ? 'complete' : 'incomplete';
  const totalMarketValueCents =
    valuationStatus === 'complete'
      ? safeSum(
          positions.map((position) => position.marketValueCents),
        )
      : null;
  const balanceSheet = balanceSheetProjection(world);
  const totalEquivalentCents =
    totalMarketValueCents === null
      ? null
      : safeSum([
          cash.totalCents,
          totalMarketValueCents,
          balanceSheet.otherAssetsCents,
          -balanceSheet.liabilitiesCents,
          balanceSheet.derivativePositionValueCents,
        ]);
  const baseline =
    canonicalBaseline(world, account) ??
    migratedBaseline(world) ?? {
      equivalentCapitalCents: null,
      status: 'unavailable',
      source: 'missing_canonical_or_legacy_baseline',
    };
  const totalPnlCents =
    totalEquivalentCents === null ||
    baseline.equivalentCapitalCents === null
      ? null
      : totalEquivalentCents -
        baseline.equivalentCapitalCents;
  const day = dayResult(
    world,
    account,
    positions,
    totalEquivalentCents,
  );

  return {
    projectionVersion: PLAYER_WEALTH_PROJECTION_VERSION,
    asOf: {
      virtualMs:
        safeInteger(marketSnapshot?.nowMs) ?? null,
      commitSeq:
        safeInteger(marketSnapshot?.commitSeq) ?? null,
      worldTick:
        safeInteger(world.world.tick) ?? null,
    },
    identity: {
      id: world.player.id,
      roleType: String(world.player.roleType ?? ''),
      label: String(
        world.player.roleLabel ?? world.player.roleType ?? '',
      ),
      profile: String(world.player.profileName ?? ''),
    },
    valuationStatus,
    missingQuoteSymbols,
    cash,
    positions,
    positionCount: positions.length,
    longPositionCount: positions.filter(
      (position) => position.side === 'long',
    ).length,
    shortPositionCount: positions.filter(
      (position) => position.side === 'short',
    ).length,
    totalMarketValueCents,
    ...balanceSheet,
    totalCostBasisCents: safeSum(
      positions.map((position) => position.costBasisCents),
    ),
    totalEquivalentCents,
    baseline,
    totalPnlCents,
    totalReturnBps: ratioBps(
      totalPnlCents,
      baseline.equivalentCapitalCents,
    ),
    ...day,
    accountingIdentity:
      'totalEquivalentCents = cash.totalCents + sum(position.marketValueCents) + otherAssetsCents - liabilitiesCents + derivativePositionValueCents',
    authority: {
      world: 'read_only',
      market: 'read_only',
      commandsEmitted: 0,
    },
  };
}

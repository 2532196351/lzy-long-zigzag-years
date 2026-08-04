import {
  noArbitrageBounds,
  priceEuropeanOption,
  resolveOptionCarryInputs,
  surfaceVolatilityPpm,
} from './pricing.js?v=20260804-01';
import {
  contractReferenceSpotTicks,
} from './contracts.js?v=20260804-01';
import { markAccountEquity } from './risk.js?v=20260804-01';

export const ACTOR_RULE_VERSION =
  'lzy-derivative-actors-v2';

const DAY_MS = 24 * 60 * 60 * 1_000;
const BPS = 10_000;

function referenceSpotTicks(state, contract) {
  const spotTicks = contractReferenceSpotTicks(
    state.universe,
    contract,
  );
  if (!Number.isSafeInteger(spotTicks) || spotTicks <= 0) {
    throw new Error(
      `Missing basket reference spot for ${contract.id}`,
    );
  }
  return spotTicks;
}

const LIQUIDITY_PROFILES = Object.freeze({
  deep_index: Object.freeze({
    quantityBps: 10_000,
    spreadBps: 10_000,
    depthStepBps: 10_000,
  }),
  deep_etf: Object.freeze({
    quantityBps: 10_000,
    spreadBps: 11_000,
    depthStepBps: 10_000,
  }),
  single_stock: Object.freeze({
    quantityBps: 5_000,
    spreadBps: 16_000,
    depthStepBps: 14_000,
  }),
  deep_precious_metal: Object.freeze({
    quantityBps: 9_000,
    spreadBps: 11_500,
    depthStepBps: 10_000,
  }),
  volatile_precious_metal: Object.freeze({
    quantityBps: 6_000,
    spreadBps: 17_000,
    depthStepBps: 15_000,
  }),
  seasonal_agriculture: Object.freeze({
    quantityBps: 7_000,
    spreadBps: 14_000,
    depthStepBps: 13_000,
  }),
  deep_industrial_metal: Object.freeze({
    quantityBps: 8_500,
    spreadBps: 12_000,
    depthStepBps: 11_000,
  }),
  event_sensitive_energy: Object.freeze({
    quantityBps: 4_000,
    spreadBps: 22_000,
    depthStepBps: 18_000,
  }),
});

const OPTION_HEDGE_ROUTES = Object.freeze({
  LZETF50: Object.freeze({
    instrumentUnderlyingId: 'SYNTH300',
    betaBps: 9_800,
    residualBasisRiskBps: 900,
  }),
  LZA003: Object.freeze({
    instrumentUnderlyingId: 'SYNTH300',
    betaBps: 12_500,
    residualBasisRiskBps: 4_800,
  }),
});

const ACTOR_TEMPLATES = Object.freeze({
  deriv_maker_curve: Object.freeze({
    id: 'deriv_maker_curve',
    accountId: 'deriv_maker_curve',
    name: '远岫期限结构做市',
    actorType: 'market_maker',
    strategyFamily: 'inventory_aware_futures_curve',
    decisionMode: 'quantitative',
    objective: 'spread_capture_with_inventory_survival',
    decisionPriority: 20,
    openingCashCents: 2_400_000_000,
    capacityCents: 1_800_000_000,
    baseOrderContracts: 3,
    maximumOpenContracts: 120,
    carryRateBps: 260,
    inventorySkewTicks: 2,
    minimumHalfSpreadTicks: 40,
  }),
  deriv_maker_vol: Object.freeze({
    id: 'deriv_maker_vol',
    accountId: 'deriv_maker_vol',
    name: '澄镜波动率做市',
    actorType: 'market_maker',
    strategyFamily: 'surface_and_delta_inventory',
    decisionMode: 'quantitative',
    objective: 'volatility_spread_capture_with_tail_limits',
    decisionPriority: 30,
    openingCashCents: 2_800_000_000,
    capacityCents: 2_200_000_000,
    baseOrderContracts: 2,
    maximumOpenContracts: 120,
    volSurface: Object.freeze({
      baseVolatilityPpm: 240_000,
      termSlopePpmPerYear: 35_000,
      putSkewPpm: 110_000,
      smilePpm: 55_000,
      minimumVolatilityPpm: 60_000,
      maximumVolatilityPpm: 1_500_000,
    }),
  }),
  deriv_quant_basis: Object.freeze({
    id: 'deriv_quant_basis',
    accountId: 'deriv_quant_basis',
    name: '折衡基差量化',
    actorType: 'institution',
    strategyFamily: 'cross_maturity_basis_arbitrage',
    decisionMode: 'quantitative',
    objective: 'capacity_bounded_relative_value',
    decisionPriority: 40,
    openingCashCents: 500_000_000,
    capacityCents: 300_000_000,
    baseOrderContracts: 2,
    maximumOpenContracts: 40,
    carryRateBps: 220,
    entryDeviationTicks: 240,
  }),
  deriv_macro_discretionary: Object.freeze({
    id: 'deriv_macro_discretionary',
    accountId: 'deriv_macro_discretionary',
    name: '叙衡宏观主观基金',
    actorType: 'institution',
    strategyFamily: 'discretionary_regime_expression',
    decisionMode: 'non_quantitative_rule_proxy',
    objective: 'conviction_return_with_drawdown_budget',
    decisionPriority: 50,
    openingCashCents: 420_000_000,
    capacityCents: 240_000_000,
    baseOrderContracts: 1,
    maximumOpenContracts: 24,
    convictionThresholdBps: 100,
  }),
  deriv_industrial_hedger: Object.freeze({
    id: 'deriv_industrial_hedger',
    accountId: 'deriv_industrial_hedger',
    name: '岚工经营套保户',
    actorType: 'commercial_hedger',
    strategyFamily: 'scheduled_cashflow_hedge',
    decisionMode: 'non_speculative',
    objective: 'reduce_operating_exposure_variance',
    decisionPriority: 60,
    openingCashCents: 360_000_000,
    capacityCents: 220_000_000,
    baseOrderContracts: 2,
    maximumOpenContracts: 30,
    targetShortContracts: 8,
  }),
  deriv_tail_risk_fund: Object.freeze({
    id: 'deriv_tail_risk_fund',
    accountId: 'deriv_tail_risk_fund',
    name: '砺尾风险基金',
    actorType: 'institution',
    strategyFamily: 'convex_tail_risk_demand',
    decisionMode: 'quantitative',
    objective: 'crash_convexity_under_premium_budget',
    decisionPriority: 70,
    openingCashCents: 300_000_000,
    capacityCents: 160_000_000,
    baseOrderContracts: 1,
    maximumOpenContracts: 120,
    jumpRiskThresholdBps: 450,
    spotShockThresholdBps: 600,
    maximumShockOrderContracts: 4,
    lastObservedSpotTicksByUnderlying: Object.freeze({}),
  }),
});

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function activeOrder(order) {
  return Boolean(
    order &&
      order.remainingQty > 0 &&
      (
        order.status === 'accepted' ||
        order.status === 'partially_filled'
      ),
  );
}

function actorForAccount(state, accountId) {
  return Object.values(state.actors ?? {}).find(
    (actor) => actor.accountId === accountId,
  );
}

function actorManagesContract(state, actor, contractId) {
  const future = state.universe?.futures?.[contractId];
  const option = state.universe?.options?.[contractId];
  switch (actor.strategyFamily) {
    case 'inventory_aware_futures_curve':
    case 'cross_maturity_basis_arbitrage':
    case 'discretionary_regime_expression':
    case 'scheduled_cashflow_hedge':
      return Boolean(future);
    case 'surface_and_delta_inventory':
      return Boolean(option || future);
    case 'convex_tail_risk_demand':
      return Boolean(option);
    default:
      return false;
  }
}

function openContractExposure(
  state,
  accountId,
  contractId,
  extraSide = null,
  extraQuantity = 0,
) {
  const position =
    state.accounts?.[accountId]?.positions?.[contractId]
      ?.quantity ?? 0;
  let activeBuyQuantity = 0;
  let activeSellQuantity = 0;
  for (const order of Object.values(
    state.books?.[contractId]?.orders ?? {},
  )) {
    if (
      order.ownerId !== accountId ||
      !activeOrder(order)
    ) {
      continue;
    }
    if (order.side === 'buy') {
      activeBuyQuantity += order.remainingQty;
    } else {
      activeSellQuantity += order.remainingQty;
    }
  }
  if (extraSide === 'buy') {
    activeBuyQuantity += extraQuantity;
  } else if (extraSide === 'sell') {
    activeSellQuantity += extraQuantity;
  }
  return Math.max(
    Math.abs(position + activeBuyQuantity),
    Math.abs(position - activeSellQuantity),
  );
}

export function actorOpenContractLimitReason(
  state,
  accountId,
  contractId,
  side,
  quantity,
) {
  const actor = actorForAccount(state, accountId);
  if (!actor) return null;
  const currentExposure = openContractExposure(
    state,
    accountId,
    contractId,
  );
  const prospectiveExposure = openContractExposure(
    state,
    accountId,
    contractId,
    side,
    quantity,
  );
  if (
    prospectiveExposure > actor.maximumOpenContracts &&
    prospectiveExposure > currentExposure
  ) {
    return 'ACTOR_OPEN_CONTRACT_LIMIT';
  }
  return null;
}

function floorToTick(value, tickSize) {
  return Math.max(
    tickSize,
    Math.floor(value / tickSize) * tickSize,
  );
}

function ceilToTick(value, tickSize) {
  return Math.max(
    tickSize,
    Math.ceil(value / tickSize) * tickSize,
  );
}

function actorOrderQuantity(state, actor, base = null) {
  const account = state.accounts[actor.accountId];
  const multiplier =
    Math.min(
      account.capacityMultiplierBps,
      Math.floor(
        account.capacityCents * BPS /
          Math.max(1, actor.capacityCents),
      ),
    );
  return Math.max(
    1,
    Math.floor(
      (base ?? actor.baseOrderContracts) *
        multiplier /
        BPS,
    ),
  );
}

function depthQuantity(quantity, level) {
  if (level === 0) return quantity;
  return Math.max(
    1,
    Math.floor(
      quantity /
        (level < 3 ? 1.5 : 2.5),
    ),
  );
}

function liquidityProfile(state, contract) {
  const depthClass =
    contract.depthClass ??
    state.universe.underlyings[contract.underlyingId]
      ?.driverModel?.liquidityClass;
  return (
    LIQUIDITY_PROFILES[depthClass] ??
    LIQUIDITY_PROFILES.single_stock
  );
}

function profileQuantity(quantity, profile) {
  return Math.max(
    1,
    Math.floor(quantity * profile.quantityBps / BPS),
  );
}

function profileSpread(value, profile, tickSize) {
  return Math.max(
    tickSize,
    Math.ceil(
      value * profile.spreadBps / BPS / tickSize,
    ) * tickSize,
  );
}

function actorActiveOrders(
  state,
  actor,
  indexedOrders = null,
  indexedOrdersAreCanonical = false,
) {
  if (
    indexedOrdersAreCanonical &&
    Array.isArray(indexedOrders)
  ) {
    return indexedOrders;
  }
  const candidates = Array.isArray(indexedOrders)
    ? indexedOrders
    : Object.values(state.books).flatMap((book) =>
        Object.values(book.orders),
      );
  return candidates.filter(
    (order) =>
      order.ownerId === actor.accountId &&
      activeOrder(order),
  );
}

function cancelCommand(actor, atMs, order) {
  return {
    type: 'CANCEL_ORDER',
    atMs,
    actorId: actor.accountId,
    contractId: order.symbol,
    orderId: order.id,
    source: 'derivative_actor',
    actorPolicyId: actor.id,
  };
}

function standingQuoteKey(orderOrCommand) {
  return [
    orderOrCommand.contractId ??
      orderOrCommand.symbol,
    orderOrCommand.side,
    orderOrCommand.orderType ??
      orderOrCommand.type,
    orderOrCommand.priceTicks,
    orderOrCommand.quantity ??
      orderOrCommand.remainingQty,
    orderOrCommand.tif,
    orderOrCommand.actorPolicyId ?? '',
  ].join('\u0000');
}

function compareStandingOrderAuthority(left, right) {
  return (
    left.submittedMs - right.submittedMs ||
    left.sequence - right.sequence ||
    left.id.localeCompare(right.id)
  );
}

export function createStandingQuoteIndex(currentOrders) {
  const orderedCurrentOrders = Object.freeze(
    [...currentOrders].sort(
      compareStandingOrderAuthority,
    ),
  );
  const ordersByKey = new Map();
  for (const current of orderedCurrentOrders) {
    const key = standingQuoteKey(current);
    const matching = ordersByKey.get(key) ?? [];
    matching.push(current);
    ordersByKey.set(key, matching);
  }
  for (const [key, orders] of ordersByKey) {
    ordersByKey.set(key, Object.freeze(orders));
  }
  return Object.freeze({
    orderCount: orderedCurrentOrders.length,
    orderedCurrentOrders,
    ordersByKey,
  });
}

function desiredStandingMatchesIndex(
  desiredStanding,
  standingQuoteIndex,
) {
  if (
    !standingQuoteIndex ||
    desiredStanding.length !==
      standingQuoteIndex.orderCount
  ) {
    return false;
  }
  const orderedCurrentOrders =
    standingQuoteIndex.orderedCurrentOrders;
  let positionalMatch = true;
  for (
    let index = 0;
    index < desiredStanding.length;
    index += 1
  ) {
    const desired = desiredStanding[index];
    const current = orderedCurrentOrders[index];
    if (
      (desired.contractId ?? desired.symbol) !==
        (current.contractId ?? current.symbol) ||
      desired.side !== current.side ||
      (desired.orderType ?? desired.type) !==
        (current.orderType ?? current.type) ||
      desired.priceTicks !== current.priceTicks ||
      (desired.quantity ?? desired.remainingQty) !==
        (current.quantity ?? current.remainingQty) ||
      desired.tif !== current.tif ||
      (desired.actorPolicyId ?? '') !==
        (current.actorPolicyId ?? '')
    ) {
      positionalMatch = false;
      break;
    }
  }
  if (positionalMatch) return true;
  const remainingByKey = new Map(
    [...standingQuoteIndex.ordersByKey].map(
      ([key, orders]) => [key, orders.length],
    ),
  );
  for (const desired of desiredStanding) {
    const key = standingQuoteKey(desired);
    const remaining = remainingByKey.get(key) ?? 0;
    if (remaining === 0) return false;
    if (remaining === 1) {
      remainingByKey.delete(key);
    } else {
      remainingByKey.set(key, remaining - 1);
    }
  }
  return remainingByKey.size === 0;
}

function diffStandingQuotes(
  actor,
  atMs,
  currentOrders,
  desiredIntents,
  standingQuoteIndex = null,
) {
  const desiredStanding = [];
  const transient = [];
  for (const intent of desiredIntents) {
    if (intent.tif === 'GTC') {
      desiredStanding.push(intent);
    } else {
      transient.push(intent);
    }
  }
  if (
    transient.length === 0 &&
    desiredStandingMatchesIndex(
      desiredStanding,
      standingQuoteIndex,
    )
  ) {
    return [];
  }
  const currentIndex =
    standingQuoteIndex ??
    createStandingQuoteIndex(currentOrders);
  const orderedCurrentOrders =
    currentIndex.orderedCurrentOrders;
  const currentByKey = new Map(
    [...currentIndex.ordersByKey].map(
      ([key, orders]) => [key, [...orders]],
    ),
  );
  const retainedOrderIds = new Set();
  const submissions = [];
  for (const desired of desiredStanding) {
    const matching =
      currentByKey.get(standingQuoteKey(desired));
    const retained = matching?.shift() ?? null;
    if (retained) {
      retainedOrderIds.add(retained.id);
    } else {
      submissions.push(desired);
    }
  }
  const cancellations = orderedCurrentOrders
    .filter(
      (current) => !retainedOrderIds.has(current.id),
    )
    .map((current) =>
      cancelCommand(actor, atMs, current),
    );
  return [
    ...cancellations,
    ...submissions,
    ...transient,
  ];
}

function order(
  actor,
  atMs,
  contract,
  side,
  priceTicks,
  quantity,
  tif = 'GTC',
) {
  return {
    type: 'SUBMIT_ORDER',
    atMs,
    actorId: actor.accountId,
    contractId: contract.id,
    side,
    orderType: 'limit',
    priceTicks,
    quantity,
    tif,
    source: 'derivative_actor',
    actorPolicyId: actor.id,
  };
}

function bestCounterpartyLevel(
  state,
  contractId,
  takerSide,
  excludeOwnerId,
) {
  const wantedSide =
    takerSide === 'buy' ? 'sell' : 'buy';
  let priceTicks = null;
  let quantity = 0;
  for (const candidate of Object.values(
    state.books?.[contractId]?.orders ?? {},
  )) {
    if (
      candidate.side !== wantedSide ||
      candidate.ownerId === excludeOwnerId ||
      !activeOrder(candidate)
    ) {
      continue;
    }
    const better =
      priceTicks === null ||
      (takerSide === 'buy'
        ? candidate.priceTicks < priceTicks
        : candidate.priceTicks > priceTicks);
    if (better) {
      priceTicks = candidate.priceTicks;
      quantity = candidate.remainingQty;
    } else if (candidate.priceTicks === priceTicks) {
      quantity += candidate.remainingQty;
    }
  }
  return priceTicks === null
    ? null
    : { priceTicks, quantity };
}

function futuresFairTicks(state, actor, contract) {
  const underlying =
    state.universe.underlyings[contract.underlyingId];
  const spotTicks = referenceSpotTicks(state, contract);
  // Futures carry is settled on the natural-day boundary.  Recomputing the
  // same standing curve from the continuously advancing millisecond clock can
  // move a large-notional contract across one exchange tick after only a few
  // seconds, even though spot, funding and inventory are unchanged.  That
  // causes a full cancel/reinsert of otherwise identical GTC liquidity and
  // destroys queue priority.  Mark carry at the current settlement-day open;
  // intraday spot/rate/inventory changes still reprice immediately, while pure
  // elapsed milliseconds roll once at the next lawful daily settlement.
  const carryMarkMs = Math.floor(state.nowMs / DAY_MS) * DAY_MS;
  const remainingYears =
    Math.max(0, contract.expiryMs - carryMarkMs) /
    (365 * DAY_MS);
  const carryRateBps =
    underlying.carryRateBps ??
    contract.carryRateBps ??
    actor.carryRateBps ??
    200;
  return Math.max(
    contract.tickSize,
    Math.round(
      spotTicks *
        (1 + carryRateBps / BPS * remainingYears),
    ),
  );
}

function makerCurveCommands(state, actor, atMs) {
  const account = state.accounts[actor.accountId];
  const baseQuantity = actorOrderQuantity(state, actor);
  const jumpRiskBps = state.market.jumpRiskBps;
  return Object.values(state.universe.futures)
    .filter((contract) => contract.status === 'active')
    .flatMap((contract) => {
      const profile = liquidityProfile(state, contract);
      const quantity = profileQuantity(
        baseQuantity,
        profile,
      );
      const position =
        account.positions[contract.id]?.quantity ?? 0;
      const fair =
        futuresFairTicks(state, actor, contract) -
        position *
          actor.inventorySkewTicks *
          contract.tickSize;
      const halfSpread = profileSpread(
        Math.max(
          actor.minimumHalfSpreadTicks,
          contract.tickSize *
            (
              1 +
              Math.floor(jumpRiskBps / 300) +
              Math.floor(
                state.market.liquidityRiskBps / 500,
              )
            ),
        ),
        profile,
        contract.tickSize,
      );
      const bid = floorToTick(
        fair - halfSpread,
        contract.tickSize,
      );
      const ask = ceilToTick(
        fair + halfSpread,
        contract.tickSize,
      );
      return Array.from(
        { length: 5 },
        (_, level) => {
          const depthSteps = Math.ceil(
            level *
              (level + 1) /
              2 *
              profile.depthStepBps /
              BPS,
          );
          const levelQuantity = depthQuantity(
            quantity,
            level,
          );
          return [
            order(
              actor,
              atMs,
              contract,
              'buy',
              Math.max(
                contract.tickSize,
                bid -
                  depthSteps *
                    contract.tickSize,
              ),
              levelQuantity,
            ),
            order(
              actor,
              atMs,
              contract,
              'sell',
              Math.max(
                ask +
                  depthSteps *
                    contract.tickSize,
                bid + contract.tickSize,
              ),
              levelQuantity,
            ),
          ];
        },
      ).flat();
    });
}

function makerVolCommands(state, actor, atMs) {
  const account = state.accounts[actor.accountId];
  const baseQuantity = actorOrderQuantity(state, actor);
  return Object.values(state.universe.options)
    .filter(
      (contract) =>
        contract.status === 'active' &&
        contract.expiryMs > atMs,
    )
    .flatMap((contract) => {
      const profile = liquidityProfile(state, contract);
      const quantity = profileQuantity(
        baseQuantity,
        profile,
      );
      const underlying =
        state.universe.underlyings[contract.underlyingId];
      const spotTicks = referenceSpotTicks(
        state,
        contract,
      );
      const contractSurface = {
        ...actor.volSurface,
        baseVolatilityPpm:
          contract.baseVolatilityPpm,
        termSlopePpmPerYear:
          underlying.driverModel
            .termSlopePpmPerYear,
      };
      const volatilityPpm = surfaceVolatilityPpm(
        contractSurface,
        {
          spotTicks,
          strikeTicks: contract.strikeTicks,
          timeToExpiryMs: contract.expiryMs - atMs,
        },
      );
      const optionCarry = resolveOptionCarryInputs({
        contract,
        underlying,
      });
      const model = priceEuropeanOption({
        kind: contract.kind,
        spotTicks,
        strikeTicks: contract.strikeTicks,
        timeToExpiryMs: contract.expiryMs - atMs,
        volatilityPpm,
        ...optionCarry,
      });
      const bounds = noArbitrageBounds({
        kind: contract.kind,
        spotTicks,
        strikeTicks: contract.strikeTicks,
        timeToExpiryMs: contract.expiryMs - atMs,
        ...optionCarry,
      });
      const inventory =
        account.positions[contract.id]?.quantity ?? 0;
      const inventorySkew = Math.max(
        -Math.floor(model.priceTicks / 10),
        Math.min(
          Math.floor(model.priceTicks / 10),
          -inventory * 2,
        ),
      );
      const center = Math.max(
        bounds.lowerTicks,
        Math.min(
          bounds.upperTicks,
          model.priceTicks + inventorySkew,
        ),
      );
      const halfSpread = profileSpread(
        Math.max(
          contract.tickSize,
          Math.ceil(model.priceTicks * 25 / BPS) +
            Math.floor(state.market.jumpRiskBps / 250) +
            Math.floor(
              state.market.liquidityRiskBps / 250,
            ),
        ),
        profile,
        contract.tickSize,
      );
      const maximumQuotedTicks =
        Math.floor(
          bounds.upperTicks / contract.tickSize,
        ) * contract.tickSize;
      if (
        maximumQuotedTicks < contract.tickSize
      ) {
        return [];
      }
      const minimumQuotedTicks = Math.max(
        contract.tickSize,
        ceilToTick(
          bounds.lowerTicks,
          contract.tickSize,
        ),
      );
      if (
        maximumQuotedTicks - minimumQuotedTicks <
        contract.tickSize * 5
      ) {
        return [];
      }
      const topBidMinimum =
        minimumQuotedTicks +
        contract.tickSize * 2;
      const topAskMaximum =
        maximumQuotedTicks -
        contract.tickSize * 2;
      const bid = Math.min(
        topAskMaximum - contract.tickSize,
        Math.max(
          topBidMinimum,
          floorToTick(
            center - halfSpread,
            contract.tickSize,
          ),
        ),
      );
      const ask = Math.max(
        bid + contract.tickSize,
        Math.min(
          topAskMaximum,
          ceilToTick(
            center + halfSpread,
            contract.tickSize,
          ),
        ),
      );
      return Array.from(
        { length: 3 },
        (_, level) => [
          order(
            actor,
            atMs,
            contract,
            'buy',
            bid - level * contract.tickSize,
            depthQuantity(quantity, level),
          ),
          order(
            actor,
            atMs,
            contract,
            'sell',
            ask + level * contract.tickSize,
            depthQuantity(quantity, level),
          ),
        ],
      ).flat();
    });
}

function makerVolHedgeCommands(state, actor, atMs) {
  const account = state.accounts[actor.accountId];
  const deltaByUnderlying = new Map();
  for (const position of Object.values(account.positions)) {
    const option =
      state.universe.options[position.contractId];
    if (!option || position.quantity === 0) continue;
    const underlying =
      state.universe.underlyings[option.underlyingId];
    const spotTicks = referenceSpotTicks(state, option);
    const volatilityPpm = surfaceVolatilityPpm(
      {
        ...actor.volSurface,
        baseVolatilityPpm:
          option.baseVolatilityPpm,
        termSlopePpmPerYear:
          underlying.driverModel
            .termSlopePpmPerYear,
      },
      {
        spotTicks,
        strikeTicks: option.strikeTicks,
        timeToExpiryMs: Math.max(
          0,
          option.expiryMs - atMs,
        ),
      },
    );
    const diagnostic = priceEuropeanOption({
      kind: option.kind,
      spotTicks,
      strikeTicks: option.strikeTicks,
      timeToExpiryMs: Math.max(
        0,
        option.expiryMs - atMs,
      ),
      volatilityPpm,
      ...resolveOptionCarryInputs({
        contract: option,
        underlying,
      }),
    });
    const delta =
      position.quantity *
      diagnostic.deltaPpm *
      option.tickValueCents /
      1_000_000;
    deltaByUnderlying.set(
      option.underlyingId,
      (deltaByUnderlying.get(option.underlyingId) ?? 0) +
        delta,
    );
  }
  const targetsByInstrument = new Map();
  for (const [
    underlyingId,
    optionDeltaCentsPerUnderlyingTick,
  ] of deltaByUnderlying) {
    const directFuture = Object.values(
      state.universe.futures,
    )
      .filter(
        (candidate) =>
          candidate.status === 'active' &&
          candidate.underlyingId === underlyingId,
      )
      .sort(
        (left, right) =>
          left.expiryMs - right.expiryMs,
      )[0];
    const proxy = OPTION_HEDGE_ROUTES[underlyingId];
    const instrumentUnderlyingId =
      directFuture?.underlyingId ??
      proxy?.instrumentUnderlyingId;
    if (!instrumentUnderlyingId) continue;
    const future =
      directFuture ??
      Object.values(state.universe.futures)
        .filter(
          (candidate) =>
            candidate.status === 'active' &&
            candidate.underlyingId ===
              instrumentUnderlyingId,
        )
        .sort(
          (left, right) =>
            left.expiryMs - right.expiryMs,
        )[0];
    if (!future) continue;
    const sourceSpotTicks =
      state.universe.underlyings[underlyingId]
        ?.spotTicks;
    const instrumentSpotTicks =
      state.universe.underlyings[
        instrumentUnderlyingId
      ]?.spotTicks;
    if (
      !Number.isSafeInteger(sourceSpotTicks) ||
      !Number.isSafeInteger(instrumentSpotTicks) ||
      sourceSpotTicks <= 0 ||
      instrumentSpotTicks <= 0
    ) {
      continue;
    }
    const betaBps = directFuture
      ? BPS
      : proxy.betaBps;
    const rawTargetQuantity =
      -optionDeltaCentsPerUnderlyingTick *
      sourceSpotTicks *
      betaBps /
      (
        future.tickValueCents *
        instrumentSpotTicks *
        BPS
      );
    const target =
      targetsByInstrument.get(future.id) ?? {
        future,
        rawTargetQuantity: 0,
        sources: [],
      };
    target.rawTargetQuantity += rawTargetQuantity;
    target.sources.push({
      underlyingId,
      instrumentUnderlyingId,
      hedgeMode: directFuture
        ? 'direct_underlying_future'
        : 'index_future_proxy',
      betaBps,
      residualBasisRiskBps: directFuture
        ? 0
        : proxy.residualBasisRiskBps,
    });
    targetsByInstrument.set(future.id, target);
  }

  const commands = [];
  for (const target of targetsByInstrument.values()) {
    const { future } = target;
    let roundedTarget = Math.round(
      target.rawTargetQuantity,
    );
    if (
      roundedTarget === 0 &&
      Math.abs(target.rawTargetQuantity) >= 0.1
    ) {
      roundedTarget = Math.sign(
        target.rawTargetQuantity,
      );
    }
    const targetFutureQuantity = Math.max(
      -actor.maximumOpenContracts,
      Math.min(
        actor.maximumOpenContracts,
        roundedTarget,
      ),
    );
    const existingFutureQuantity =
      account.positions[future.id]?.quantity ?? 0;
    const adjustment =
      targetFutureQuantity - existingFutureQuantity;
    if (adjustment === 0) continue;
    const side = adjustment > 0 ? 'buy' : 'sell';
    const fair = futuresFairTicks(
      state,
      actor,
      future,
    );
    const liquidityTicks =
      future.tickSize *
      (
        2 +
        Math.floor(
          state.market.jumpRiskBps / 400,
        ) +
        Math.floor(
          state.market.liquidityRiskBps / 500,
        )
      );
    const priceTicks =
      side === 'buy'
        ? ceilToTick(
            fair + liquidityTicks,
            future.tickSize,
          )
        : floorToTick(
            fair - liquidityTicks,
            future.tickSize,
          );
    commands.push({
      ...order(
        actor,
        atMs,
        future,
        side,
        priceTicks,
        Math.abs(adjustment),
        'IOC',
      ),
      hedgePurpose: 'option_delta_inventory',
      hedgeUnderlyingId:
        target.sources.length === 1
          ? target.sources[0].underlyingId
          : 'portfolio',
      hedgeUnderlyingIds: target.sources
        .map((source) => source.underlyingId)
        .sort((left, right) =>
          left.localeCompare(right),
        ),
      hedgeInstrumentUnderlyingId:
        future.underlyingId,
      hedgeMode:
        target.sources.length === 1
          ? target.sources[0].hedgeMode
          : 'portfolio_future_proxy',
      hedgeRatioBps:
        target.sources.length === 1
          ? target.sources[0].betaBps
          : null,
      residualBasisRiskBps: Math.max(
        ...target.sources.map(
          (source) =>
            source.residualBasisRiskBps,
        ),
      ),
    });
  }
  return commands;
}

function basisCommands(state, actor, atMs) {
  const quantity = actorOrderQuantity(state, actor);
  const byUnderlying = Object.groupBy(
    Object.values(state.universe.futures).filter(
      (contract) => contract.status === 'active',
    ),
    (contract) => contract.underlyingId,
  );
  return Object.values(byUnderlying).flatMap(
    (contracts) =>
      contracts
        .sort(
          (left, right) =>
            left.expiryMs - right.expiryMs,
        )
        .flatMap((contract, index) => {
          const fair = futuresFairTicks(
            state,
            actor,
            contract,
          );
          const traded =
            state.market.lastTradePriceTicks[
              contract.id
            ];
          if (
            traded !== undefined &&
            Math.abs(traded - fair) >=
              actor.entryDeviationTicks
          ) {
            const side =
              traded > fair ? 'sell' : 'buy';
            const counterparty = bestCounterpartyLevel(
              state,
              contract.id,
              side,
              actor.accountId,
            );
            const executable = Boolean(
              counterparty &&
                (
                  side === 'buy'
                    ? counterparty.priceTicks <= traded
                    : counterparty.priceTicks >= traded
                ),
            );
            // An IOC is a real executable attempt, not a polling message.  If
            // the dislocation remains in the last print but no counterparty is
            // presently reachable at that price, wait for the public book to
            // change instead of creating one doomed order every three seconds.
            if (!executable) return [];
            return [
              order(
                actor,
                atMs,
                contract,
                side,
                traded,
                quantity,
                'IOC',
              ),
            ];
          }
          const side = index === 0 ? 'buy' : 'sell';
          const price =
            side === 'buy'
              ? floorToTick(
                  fair - contract.tickSize * 3,
                  contract.tickSize,
                )
              : ceilToTick(
                  fair + contract.tickSize * 3,
                  contract.tickSize,
                );
          return [
            order(
              actor,
              atMs,
              contract,
              side,
              price,
              quantity,
            ),
          ];
        }),
  );
}

function macroCommands(state, actor, atMs) {
  if (
    Math.abs(state.market.regimeSignalBps) <
    actor.convictionThresholdBps
  ) {
    return [];
  }
  const contract = Object.values(state.universe.futures)
    .filter(
      (candidate) =>
        candidate.status === 'active' &&
        candidate.underlyingId === 'SYNTH300',
    )
    .sort((left, right) => left.expiryMs - right.expiryMs)[0];
  if (!contract) return [];
  const side =
    state.market.regimeSignalBps > 0 ? 'buy' : 'sell';
  const fair = futuresFairTicks(state, actor, contract);
  const convictionTicks =
    2 +
    Math.ceil(
      Math.abs(state.market.regimeSignalBps) /
        100,
    ) *
      2;
  const price =
    side === 'buy'
      ? ceilToTick(
          fair +
            contract.tickSize * convictionTicks,
          contract.tickSize,
        )
      : floorToTick(
          fair -
            contract.tickSize * convictionTicks,
          contract.tickSize,
        );
  return [
    order(
      actor,
      atMs,
      contract,
      side,
      price,
      actorOrderQuantity(state, actor),
      'IOC',
    ),
  ];
}

function hedgerCommands(state, actor, atMs) {
  const contract = Object.values(state.universe.futures)
    .filter(
      (candidate) =>
        candidate.status === 'active' &&
        candidate.underlyingId ===
          (actor.hedgeUnderlyingId ?? 'LZYCU'),
    )
    .sort((left, right) => right.expiryMs - left.expiryMs)[0];
  if (!contract) return [];
  const existing =
    state.accounts[actor.accountId].positions[contract.id]
      ?.quantity ?? 0;
  const remaining = Math.max(
    0,
    actor.targetShortContracts + existing,
  );
  if (remaining === 0) return [];
  const executableBid = bestCounterpartyLevel(
    state,
    contract.id,
    'sell',
    actor.accountId,
  );
  if (!executableBid) {
    const fair = futuresFairTicks(
      state,
      actor,
      contract,
    );
    return [
      order(
        actor,
        atMs,
        contract,
        'sell',
        ceilToTick(
          fair + contract.tickSize * 4,
          contract.tickSize,
        ),
        Math.min(
          remaining,
          actorOrderQuantity(state, actor),
        ),
      ),
    ];
  }
  return [
    order(
      actor,
      atMs,
      contract,
      'sell',
      executableBid.priceTicks,
      Math.min(
        remaining,
        actorOrderQuantity(state, actor),
        executableBid.quantity,
        1,
      ),
      'IOC',
    ),
  ];
}

function latestSpotImpulse(
  state,
  actor,
  underlyingId,
  atMs,
) {
  const actorReferenceTicks =
    actor.lastObservedSpotTicksByUnderlying?.[
      underlyingId
    ];
  const currentSpotTicks =
    state.universe.underlyings[underlyingId]
      ?.spotTicks;
  if (
    Number.isSafeInteger(actorReferenceTicks) &&
    actorReferenceTicks > 0 &&
    Number.isSafeInteger(currentSpotTicks) &&
    currentSpotTicks > 0
  ) {
    return {
      previousSpotTicks: actorReferenceTicks,
      spotTicks: currentSpotTicks,
      moveBps: Math.round(
        (currentSpotTicks - actorReferenceTicks) *
          BPS /
          actorReferenceTicks,
      ),
    };
  }
  const observations =
    state.market.referenceObservations ?? [];
  let latest = null;
  let prior = null;
  for (let index = observations.length - 1;
    index >= 0;
    index -= 1) {
    const observation = observations[index];
    if (observation.underlyingId !== underlyingId) {
      continue;
    }
    if (!latest) {
      latest = observation;
      continue;
    }
    if (observation.atMs < latest.atMs) {
      prior = observation;
      break;
    }
  }
  if (
    !latest ||
    !prior ||
    latest.atMs !== atMs ||
    prior.spotTicks <= 0
  ) {
    return null;
  }
  return {
    previousSpotTicks: prior.spotTicks,
    spotTicks: latest.spotTicks,
    moveBps: Math.round(
      (latest.spotTicks - prior.spotTicks) *
        BPS /
        prior.spotTicks,
    ),
  };
}

function shockOptionDemandCommands(state, actor, atMs) {
  const commands = [];
  for (const underlying of Object.values(
    state.universe.underlyings,
  )) {
    const impulse = latestSpotImpulse(
      state,
      actor,
      underlying.id,
      atMs,
    );
    const absoluteMoveBps = Math.abs(
      impulse?.moveBps ?? 0,
    );
    if (
      !impulse ||
      absoluteMoveBps <
        (actor.spotShockThresholdBps ?? 600)
    ) {
      continue;
    }
    const kind = impulse.moveBps > 0 ? 'call' : 'put';
    const contract = Object.values(
      state.universe.options,
    )
      .filter(
        (candidate) =>
          candidate.status === 'active' &&
          candidate.expiryMs > atMs &&
          candidate.underlyingId === underlying.id &&
          candidate.kind === kind,
      )
      .sort(
        (left, right) =>
          left.expiryMs - right.expiryMs ||
          Math.abs(
            left.strikeTicks -
              impulse.previousSpotTicks,
          ) -
            Math.abs(
              right.strikeTicks -
                impulse.previousSpotTicks,
            ) ||
          left.id.localeCompare(right.id),
      )[0];
    if (!contract) continue;
    const executableAsk = bestCounterpartyLevel(
      state,
      contract.id,
      'buy',
      actor.accountId,
    );
    if (!executableAsk) continue;
    const shockVolatilityPpm = Math.min(
      1_500_000,
      contract.baseVolatilityPpm +
        Math.min(500_000, absoluteMoveBps * 100),
    );
    const model = priceEuropeanOption({
      kind: contract.kind,
      spotTicks: impulse.spotTicks,
      strikeTicks: contract.strikeTicks,
      timeToExpiryMs: Math.max(
        0,
        contract.expiryMs - atMs,
      ),
      volatilityPpm: shockVolatilityPpm,
      ...resolveOptionCarryInputs({
        contract,
        underlying,
      }),
    });
    const maximumWillingnessTicks =
      ceilToTick(
        model.priceTicks + contract.tickSize * 2,
        contract.tickSize,
      );
    if (
      executableAsk.priceTicks >
      maximumWillingnessTicks
    ) {
      continue;
    }
    const existingLong = Math.max(
      0,
      state.accounts[actor.accountId].positions[
        contract.id
      ]?.quantity ?? 0,
    );
    const targetQuantity = Math.min(
      actor.maximumShockOrderContracts ?? 4,
      1 +
        Math.floor(
          (
            absoluteMoveBps -
            (actor.spotShockThresholdBps ?? 600)
          ) /
            500,
        ),
    );
    const quantity = Math.min(
      executableAsk.quantity,
      actorOrderQuantity(state, actor),
      Math.max(0, targetQuantity - existingLong),
    );
    if (quantity <= 0) continue;
    commands.push({
      ...order(
        actor,
        atMs,
        contract,
        'buy',
        executableAsk.priceTicks,
        quantity,
        'IOC',
      ),
      observedUnderlyingMoveBps: impulse.moveBps,
      observedPreviousSpotTicks:
        impulse.previousSpotTicks,
      observedSpotTicks: impulse.spotTicks,
      executionPurpose:
        'event_driven_convexity_demand',
    });
  }
  return commands;
}

function tailRiskCommands(state, actor, atMs) {
  const shockCommands = shockOptionDemandCommands(
    state,
    actor,
    atMs,
  );
  if (
    state.market.jumpRiskBps <
    actor.jumpRiskThresholdBps
  ) {
    return shockCommands;
  }
  const option = Object.values(state.universe.options)
    .filter(
      (candidate) =>
        candidate.status === 'active' &&
        candidate.kind === 'put' &&
        candidate.underlyingId === 'SYNTH300',
    )
    .sort(
      (left, right) =>
        left.expiryMs - right.expiryMs ||
        left.strikeTicks - right.strikeTicks,
    )[0];
  if (!option) return shockCommands;
  const spotTicks = referenceSpotTicks(state, option);
  const model = priceEuropeanOption({
    kind: option.kind,
    spotTicks,
    strikeTicks: option.strikeTicks,
    timeToExpiryMs: Math.max(0, option.expiryMs - atMs),
    volatilityPpm: 300_000,
    ...resolveOptionCarryInputs({
      contract: option,
      underlying:
        state.universe.underlyings[
          option.underlyingId
        ],
    }),
  });
  return [
    ...shockCommands,
    order(
      actor,
      atMs,
      option,
      'buy',
      Math.max(1, model.priceTicks),
      actorOrderQuantity(state, actor),
    ),
  ];
}

export function createDerivativeActorCatalog() {
  return Object.fromEntries(
    Object.values(ACTOR_TEMPLATES).map((template) => [
      template.id,
      {
        ...cloneJson(template),
        ruleVersion: ACTOR_RULE_VERSION,
        lifecycleStatus: 'ACTIVE',
        lastDecisionAtMs: null,
        decisionCount: 0,
        eliminationReason: null,
      },
    ]),
  );
}

export function migrateDerivativeActorCatalog(actors) {
  if (
    !actors ||
    typeof actors !== 'object' ||
    Array.isArray(actors)
  ) {
    throw new TypeError(
      'Derivative actor catalog must be an object',
    );
  }
  let migrated = false;
  const canonical = createDerivativeActorCatalog();
  for (const [actorId, template] of Object.entries(
    canonical,
  )) {
    if (!actors[actorId]) {
      actors[actorId] = template;
      migrated = true;
      continue;
    }
    const actor = actors[actorId];
    for (const [key, value] of Object.entries(template)) {
      if (actor[key] !== undefined) continue;
      actor[key] = cloneJson(value);
      migrated = true;
    }
    if (actor.ruleVersion !== ACTOR_RULE_VERSION) {
      actor.ruleVersion = ACTOR_RULE_VERSION;
      migrated = true;
    }
  }
  return migrated;
}

export function derivativeActorAccountSpecs() {
  return Object.values(ACTOR_TEMPLATES).map((actor) => ({
    id: actor.accountId,
    cashCents: actor.openingCashCents,
    accountType: actor.actorType,
    policyId: actor.id,
    capacityCents: actor.capacityCents,
  }));
}

export function deriveActorCommands(
  state,
  actorId,
  atMs,
  {
    activeOrders: indexedOrders = null,
    activeOrdersAreCanonical = false,
    standingQuoteIndex = null,
  } = {},
) {
  const actor = state.actors?.[actorId];
  const account = state.accounts?.[actor?.accountId];
  if (!actor || !account) {
    return [];
  }
  const currentOrders = actorActiveOrders(
    state,
    actor,
    indexedOrders,
    activeOrdersAreCanonical,
  );
  if (
    actor.lifecycleStatus !== 'ACTIVE' ||
    account.lifecycleStatus !== 'ACTIVE' ||
    account.capacityMultiplierBps <= 0
  ) {
    return currentOrders.map((current) =>
      cancelCommand(actor, atMs, current),
    );
  }
  let intents;
  switch (actor.strategyFamily) {
    case 'inventory_aware_futures_curve':
      intents = makerCurveCommands(state, actor, atMs);
      break;
    case 'surface_and_delta_inventory':
      intents = [
        ...makerVolCommands(state, actor, atMs),
        ...makerVolHedgeCommands(state, actor, atMs),
      ];
      break;
    case 'cross_maturity_basis_arbitrage':
      intents = basisCommands(state, actor, atMs);
      break;
    case 'discretionary_regime_expression':
      intents = macroCommands(state, actor, atMs);
      break;
    case 'scheduled_cashflow_hedge':
      intents = hedgerCommands(state, actor, atMs);
      break;
    case 'convex_tail_risk_demand':
      intents = tailRiskCommands(state, actor, atMs);
      break;
    default:
      throw new Error(
        `Unknown derivative actor strategy: ${actor.strategyFamily}`,
      );
  }
  return diffStandingQuotes(
    actor,
    atMs,
    currentOrders,
    intents,
    standingQuoteIndex,
  );
}

export function updateActorCapacity(state, actorId) {
  const actor = state.actors[actorId];
  const account = state.accounts[actor.accountId];
  const equityCents = markAccountEquity({
    account,
    universe: state.universe,
    marks: {
      ...state.market.settlementPriceTicks,
      ...state.market.lastTradePriceTicks,
    },
  });
  account.peakEquityCents = Math.max(
    account.peakEquityCents,
    equityCents,
  );
  const drawdownBps =
    account.peakEquityCents <= 0
      ? BPS
      : Math.max(
          0,
          Math.floor(
            (
              account.peakEquityCents - equityCents
            ) *
              BPS /
              account.peakEquityCents,
          ),
        );
  if (
    equityCents <= 0 ||
    equityCents <
      Math.floor(account.initialCapitalCents / 4)
  ) {
    account.capacityMultiplierBps = 0;
    account.lifecycleStatus = 'ELIMINATED';
    actor.lifecycleStatus = 'ELIMINATED';
    actor.eliminationReason = 'CAPITAL_EXHAUSTION';
  } else if (drawdownBps >= 3_000) {
    account.capacityMultiplierBps = 4_000;
  } else if (drawdownBps >= 1_500) {
    account.capacityMultiplierBps = 7_000;
  } else {
    account.capacityMultiplierBps = BPS;
  }
  account.capacityCents = Math.max(
    0,
    Math.floor(
      actor.capacityCents *
        account.capacityMultiplierBps /
        BPS,
    ),
  );
  return {
    actorId,
    equityCents,
    drawdownBps,
    capacityMultiplierBps:
      account.capacityMultiplierBps,
    lifecycleStatus: account.lifecycleStatus,
  };
}

export function actorOrderInvariantErrors(state) {
  const errors = [];
  const accountIds = new Set();
  for (const actor of Object.values(state.actors ?? {})) {
    const account = state.accounts?.[actor.accountId];
    if (
      actor.ruleVersion !== ACTOR_RULE_VERSION ||
      !account ||
      !Number.isSafeInteger(
        actor.maximumOpenContracts,
      ) ||
      actor.maximumOpenContracts <= 0 ||
      accountIds.has(actor.accountId)
    ) {
      errors.push(`INVALID_ACTOR:${actor.id}`);
    }
    accountIds.add(actor.accountId);
    if (!account) continue;
    const spotReferences =
      actor.lastObservedSpotTicksByUnderlying;
    if (spotReferences !== undefined) {
      if (
        !spotReferences ||
        typeof spotReferences !== 'object' ||
        Array.isArray(spotReferences)
      ) {
        errors.push(
          `INVALID_ACTOR_SPOT_REFERENCE:${actor.id}:catalog`,
        );
      } else {
        for (const [underlyingId, spotTicks] of
          Object.entries(spotReferences)) {
          if (
            !state.universe?.underlyings?.[
              underlyingId
            ] ||
            !Number.isSafeInteger(spotTicks) ||
            spotTicks <= 0
          ) {
            errors.push(
              `INVALID_ACTOR_SPOT_REFERENCE:${actor.id}:${underlyingId}`,
            );
          }
        }
      }
    }
    const contractIds = new Set(
      Object.keys(account.positions ?? {}),
    );
    for (const [contractId, book] of Object.entries(
      state.books ?? {},
    )) {
      if (
        Object.values(book.orders ?? {}).some(
          (order) =>
            order.ownerId === actor.accountId &&
            activeOrder(order),
        )
      ) {
        contractIds.add(contractId);
      }
    }
    for (const contractId of contractIds) {
      if (
        !actorManagesContract(
          state,
          actor,
          contractId,
        )
      ) {
        continue;
      }
      const exposure = openContractExposure(
        state,
        actor.accountId,
        contractId,
      );
      if (exposure > actor.maximumOpenContracts) {
        errors.push(
          `ACTOR_OPEN_CONTRACT_LIMIT_EXCEEDED:${actor.id}:${contractId}:${exposure}:${actor.maximumOpenContracts}`,
        );
      }
    }
  }
  return errors;
}

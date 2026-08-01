const DEFAULT_DEPTH = 10;
const MAX_DEPTH = 100;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function positiveSafeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeSafeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function basisPoints(value, name) {
  const normalized = nonNegativeSafeInteger(value, name);
  if (normalized > 10_000) {
    throw new RangeError(`${name} must be between 0 and 10000`);
  }
  return normalized;
}

function activeOrder(order) {
  return Boolean(
    order &&
      Number.isSafeInteger(order.remainingQty) &&
      order.remainingQty > 0 &&
      (order.status === 'accepted' ||
        order.status === 'partially_filled'),
  );
}

function hash32(input) {
  let hash = 2166136261;
  for (const character of String(input)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicUnit(context, salt) {
  return (
    hash32(
      [
        context.seed,
        context.flowId,
        context.nowMs,
        context.decisionSequence,
        salt,
      ].join(':'),
    ) / 4294967296
  );
}

function freeCash(account) {
  return Math.max(
    0,
    nonNegativeSafeInteger(account.cashCents ?? 0, 'cashCents') -
      nonNegativeSafeInteger(
        account.reservedCashCents ?? 0,
        'reservedCashCents',
      ),
  );
}

function freeUnits(account, symbol) {
  return Math.max(
    0,
    nonNegativeSafeInteger(
      account.holdings?.[symbol] ?? 0,
      `holdings.${symbol}`,
    ) -
      nonNegativeSafeInteger(
        account.reservedHoldings?.[symbol] ?? 0,
        `reservedHoldings.${symbol}`,
      ),
  );
}

function allocateLayerQuantity({
  desired,
  remaining,
  unitCost,
  layersRemaining,
}) {
  if (remaining <= 0) return 0;
  const fairShare = Math.floor(
    remaining / Math.max(1, unitCost * layersRemaining),
  );
  return Math.max(0, Math.min(desired, fairShare));
}

/**
 * Produces actual desired GTC orders. It does not mutate an order book and it
 * never returns aggregate/fake depth. Every layer can be routed through the
 * normal broker and price-time book.
 */
export function buildMakerLadder(context) {
  const makerId = String(context.makerId ?? '');
  const symbol = String(context.symbol ?? '');
  if (!makerId || !symbol) {
    throw new TypeError('makerId and symbol are required');
  }
  const midTicks = positiveSafeInteger(context.midTicks, 'midTicks');
  const tickSize = positiveSafeInteger(
    context.tickSize ?? 1,
    'tickSize',
  );
  const levels = clamp(
    positiveSafeInteger(
      context.levels ?? DEFAULT_DEPTH,
      'levels',
    ),
    1,
    MAX_DEPTH,
  );
  const spreadTicks = positiveSafeInteger(
    context.spreadTicks ?? 2,
    'spreadTicks',
  );
  const levelStepTicks = positiveSafeInteger(
    context.levelStepTicks ?? 1,
    'levelStepTicks',
  );
  const account = context.account ?? {};
  const targetUnits = positiveSafeInteger(
    context.targetUnits ?? 1,
    'targetUnits',
  );
  const holdings = nonNegativeSafeInteger(
    account.holdings?.[symbol] ?? 0,
    `holdings.${symbol}`,
  );
  const rawInventoryBps = Math.round(
    ((holdings - targetUnits) * 10_000) / targetUnits,
  );
  const requestedSkewBps = Number.isFinite(context.inventorySkewBps)
    ? Math.round(context.inventorySkewBps)
    : 0;
  const inventoryBps = clamp(
    rawInventoryBps + requestedSkewBps,
    -10_000,
    10_000,
  );
  const fundingStressBps = clamp(
    nonNegativeSafeInteger(
      account.fundingStressBps ?? 0,
      'fundingStressBps',
    ),
    0,
    10_000,
  );
  const fundingSpreadTicks = Math.ceil(fundingStressBps / 2_000);
  const effectiveSpreadTicks =
    spreadTicks + fundingSpreadTicks;
  const centerShiftTicks = Math.round(
    (inventoryBps * Math.max(1, spreadTicks)) / 5_000,
  );
  const centerTicks = Math.max(
    tickSize * (levels + effectiveSpreadTicks + 1),
    midTicks - centerShiftTicks * tickSize,
  );
  const sizePressureBps = clamp(
    fundingStressBps +
      Math.round(Math.abs(inventoryBps) / 3),
    0,
    9_500,
  );
  const baseQuantity = positiveSafeInteger(
    context.quantityPerLevel ?? 100,
    'quantityPerLevel',
  );
  const desiredQuantity = Math.max(
    1,
    Math.floor(
      (baseQuantity * (10_000 - sizePressureBps)) / 10_000,
    ),
  );
  const riskBudgetCents = nonNegativeSafeInteger(
    context.riskBudgetCents ?? freeCash(account),
    'riskBudgetCents',
  );
  let remainingBuyCents = Math.min(
    freeCash(account),
    riskBudgetCents,
  );
  let remainingSellUnits = freeUnits(account, symbol);
  const orders = [];

  for (let level = 0; level < levels; level += 1) {
    const distanceTicks =
      effectiveSpreadTicks + level * levelStepTicks;
    const bidTicks = Math.max(
      tickSize,
      centerTicks - distanceTicks * tickSize,
    );
    const askTicks =
      centerTicks + distanceTicks * tickSize;
    const layersRemaining = levels - level;
    const buyQuantity = allocateLayerQuantity({
      desired: desiredQuantity,
      remaining: remainingBuyCents,
      unitCost: bidTicks,
      layersRemaining,
    });
    if (buyQuantity > 0) {
      const layerKey = `maker:${makerId}:${symbol}:buy:${level}`;
      orders.push({
        layerKey,
        makerId,
        symbol,
        side: 'buy',
        priceTicks: bidTicks,
        quantity: buyQuantity,
        tif: 'GTC',
        parentOrderId: layerKey,
      });
      remainingBuyCents -= bidTicks * buyQuantity;
    }

    const sellQuantity = Math.max(
      0,
      Math.min(
        desiredQuantity,
        Math.floor(
          remainingSellUnits / Math.max(1, layersRemaining),
        ),
      ),
    );
    if (sellQuantity > 0) {
      const layerKey = `maker:${makerId}:${symbol}:sell:${level}`;
      orders.push({
        layerKey,
        makerId,
        symbol,
        side: 'sell',
        priceTicks: askTicks,
        quantity: sellQuantity,
        tif: 'GTC',
        parentOrderId: layerKey,
      });
      remainingSellUnits -= sellQuantity;
    }
  }

  return orders;
}

/**
 * Calculates a minimal cancel/submit set. An unchanged live order keeps its id
 * and therefore its original price-time priority.
 */
export function diffMakerLadder(activeOrders, desiredOrders) {
  const activeByLayer = new Map();
  for (const order of activeOrders ?? []) {
    if (!activeOrder(order)) continue;
    const layerKey =
      order.layerKey ??
      order.liquidityLayer?.layerKey ??
      order.parentOrderId;
    if (typeof layerKey === 'string' && !activeByLayer.has(layerKey)) {
      activeByLayer.set(layerKey, order);
    }
  }
  const desiredByLayer = new Map(
    (desiredOrders ?? []).map((order) => [order.layerKey, order]),
  );
  const cancelOrderIds = [];
  const keepOrderIds = [];
  const submitOrders = [];

  for (const [layerKey, active] of activeByLayer) {
    const desired = desiredByLayer.get(layerKey);
    if (
      desired &&
      active.symbol === desired.symbol &&
      active.side === desired.side &&
      active.priceTicks === desired.priceTicks &&
      active.remainingQty === desired.quantity
    ) {
      keepOrderIds.push(active.id);
      desiredByLayer.delete(layerKey);
    } else {
      cancelOrderIds.push(active.id);
    }
  }
  for (const desired of desiredByLayer.values()) {
    submitOrders.push({ ...desired });
  }

  return {
    cancelOrderIds,
    keepOrderIds,
    submitOrders,
  };
}

function ratioBps(numerator, denominator) {
  if (denominator <= 0) return 0;
  const scaled =
    (BigInt(numerator) * 10_000n) / BigInt(denominator);
  return Number(
    scaled > 10_000n ? 10_000n : scaled,
  );
}

function cashBoundQuantity(cashCents, priceTicks, feeBps) {
  const denominator =
    BigInt(priceTicks) * BigInt(10_000 + feeBps);
  if (cashCents <= 0 || denominator <= 0n) return 0;
  const quantity =
    (BigInt(cashCents) * 10_000n) / denominator;
  return Number(
    quantity > BigInt(Number.MAX_SAFE_INTEGER)
      ? BigInt(Number.MAX_SAFE_INTEGER)
      : quantity,
  );
}

function participantDecision(context, participant, fillProbabilityBps) {
  const id = String(participant?.id ?? '');
  if (!id) {
    throw new TypeError('limit follower id is required');
  }
  const account = participant.account ?? {};
  const fundingStressBps = clamp(
    basisPoints(
      account.fundingStressBps ?? 0,
      `${id}.fundingStressBps`,
    ),
    0,
    10_000,
  );
  const convictionBps = clamp(
    basisPoints(
      participant.convictionBps ?? 5_000,
      `${id}.convictionBps`,
    ),
    0,
    10_000,
  );
  const riskAversionBps = clamp(
    basisPoints(
      participant.riskAversionBps ?? 5_000,
      `${id}.riskAversionBps`,
    ),
    0,
    10_000,
  );
  const grossEdgeBps = Math.round(
    context.expectedContinuationBps *
      convictionBps *
      fillProbabilityBps /
      100_000_000,
  );
  const reversalCostBps = Math.round(
    context.reversalRiskBps *
      riskAversionBps /
      10_000,
  );
  const toxicityCostBps = Math.round(
    context.toxicityBps * 0.08,
  );
  const fundingCostBps = Math.round(
    fundingStressBps * 0.05,
  );
  const queueOpportunityCostBps = Math.round(
    context.queueCompetitionBps * 0.01,
  );
  const expectedNetEdgeBps =
    grossEdgeBps -
    reversalCostBps -
    toxicityCostBps -
    fundingCostBps -
    queueOpportunityCostBps -
    context.feeBps;
  const baseDecision = {
    actorId: id,
    brokerId: String(participant.brokerId ?? 'broker_lzy'),
    expectedGrossEdgeBps: grossEdgeBps,
    expectedCostBps:
      reversalCostBps +
      toxicityCostBps +
      fundingCostBps +
      queueOpportunityCostBps +
      context.feeBps,
    expectedNetEdgeBps,
    fillProbabilityBps,
    action: 'abstain',
    quantity: 0,
  };
  const minimumEdgeBps = nonNegativeSafeInteger(
    participant.minimumEdgeBps ?? 1,
    `${id}.minimumEdgeBps`,
  );
  if (
    context.distanceToLimitTicks < 0 ||
    context.distanceToLimitTicks > context.triggerDistanceTicks
  ) {
    return {
      ...baseDecision,
      reason: 'outside_limit_approach',
    };
  }
  if (expectedNetEdgeBps < minimumEdgeBps) {
    return {
      ...baseDecision,
      reason: 'non_positive_expected_utility',
    };
  }

  const holdings = nonNegativeSafeInteger(
    account.holdings?.[context.symbol] ?? 0,
    `${id}.holdings.${context.symbol}`,
  );
  const targetUnits = nonNegativeSafeInteger(
    participant.targetUnits ?? holdings,
    `${id}.targetUnits`,
  );
  const inventoryCapacityUnits = nonNegativeSafeInteger(
    participant.inventoryCapacityUnits ?? holdings,
    `${id}.inventoryCapacityUnits`,
  );
  const maxOrderUnits = positiveSafeInteger(
    participant.maxOrderUnits ?? 100,
    `${id}.maxOrderUnits`,
  );
  let maximumExecutableUnits;
  if (context.side === 'buy') {
    const inventoryHeadroom = Math.max(
      0,
      targetUnits + inventoryCapacityUnits - holdings,
    );
    const freeCashCents = freeCash(account);
    const riskBudgetCents = nonNegativeSafeInteger(
      participant.riskBudgetCents ?? freeCashCents,
      `${id}.riskBudgetCents`,
    );
    const cashCapacity = cashBoundQuantity(
      Math.min(freeCashCents, riskBudgetCents),
      context.limitPriceTicks,
      context.feeBps,
    );
    maximumExecutableUnits = Math.min(
      maxOrderUnits,
      inventoryHeadroom,
      cashCapacity,
    );
  } else {
    const lowerInventoryBound = Math.max(
      0,
      targetUnits - inventoryCapacityUnits,
    );
    const inventoryRiskCapacity = Math.max(
      0,
      holdings - lowerInventoryBound,
    );
    maximumExecutableUnits = Math.min(
      maxOrderUnits,
      freeUnits(account, context.symbol),
      inventoryRiskCapacity,
    );
  }
  if (maximumExecutableUnits <= 0) {
    return {
      ...baseDecision,
      reason: 'no_unreserved_capacity',
    };
  }
  const minimumDurableQueueUnits =
    nonNegativeSafeInteger(
      participant.minimumDurableQueueUnits ?? 0,
      `${id}.minimumDurableQueueUnits`,
    );
  if (
    context.distanceToLimitTicks === 0 &&
    maximumExecutableUnits <
      minimumDurableQueueUnits
  ) {
    return {
      ...baseDecision,
      reason: 'insufficient_durable_queue_budget',
      maximumExecutableUnits,
    };
  }
  const maximumParticipationBps = clamp(
    basisPoints(
      participant.maxParticipationBps ?? 9_000,
      `${id}.maxParticipationBps`,
    ),
    0,
    10_000,
  );
  const ordinaryParticipationBps = clamp(
    Math.round(
      1_500 +
        expectedNetEdgeBps * 12 +
        convictionBps * 0.2,
    ),
    500,
    maximumParticipationBps,
  );
  const boundaryBudgetAllocationBps =
    context.distanceToLimitTicks === 0
      ? clamp(
          basisPoints(
            participant.boundaryBudgetAllocationBps ?? 0,
            `${id}.boundaryBudgetAllocationBps`,
          ),
          0,
          maximumParticipationBps,
        )
      : 0;
  const desiredParticipationBps = Math.max(
    ordinaryParticipationBps,
    boundaryBudgetAllocationBps,
  );
  const heterogeneityBps = Math.round(
    9_000 +
      deterministicUnit(context, `limit-follower:${id}`) *
        2_000,
  );
  const participationBps = clamp(
    Math.round(
      desiredParticipationBps * heterogeneityBps / 10_000,
    ),
    1,
    maximumParticipationBps,
  );
  const quantity = Math.max(
    1,
    Math.min(
      maximumExecutableUnits,
      Math.floor(
        maximumExecutableUnits * participationBps / 10_000,
      ),
    ),
  );
  return {
    ...baseDecision,
    action: 'join',
    reason: 'positive_expected_utility',
    quantity,
    maximumExecutableUnits,
    participationBps,
    boundaryBudgetAllocationBps,
  };
}

/**
 * Builds one real, resource-backed GTC order per profit-seeking participant
 * near a daily price limit.  It never creates an aggregate wall: every order
 * retains its actor, broker, finite cash/inventory and cancellable layer key.
 */
export function buildLimitFollowerQueue(input) {
  const symbol = String(input?.symbol ?? '');
  if (!symbol) throw new TypeError('symbol is required');
  const direction = input.direction;
  if (direction !== 'up' && direction !== 'down') {
    throw new TypeError('direction must be up or down');
  }
  const context = {
    seed: String(input.seed ?? 'lzy-limit-followers'),
    flowId: `limit:${symbol}:${direction}`,
    symbol,
    nowMs: nonNegativeSafeInteger(input.nowMs ?? 0, 'nowMs'),
    decisionSequence: nonNegativeSafeInteger(
      input.decisionSequence ?? 0,
      'decisionSequence',
    ),
    direction,
    side: direction === 'up' ? 'buy' : 'sell',
    limitPriceTicks: positiveSafeInteger(
      input.limitPriceTicks,
      'limitPriceTicks',
    ),
    lastPriceTicks: positiveSafeInteger(
      input.lastPriceTicks,
      'lastPriceTicks',
    ),
    triggerDistanceTicks: nonNegativeSafeInteger(
      input.triggerDistanceTicks ?? 2,
      'triggerDistanceTicks',
    ),
    expectedContinuationBps: basisPoints(
      input.expectedContinuationBps ?? 0,
      'expectedContinuationBps',
    ),
    reversalRiskBps: basisPoints(
      input.reversalRiskBps ?? 0,
      'reversalRiskBps',
    ),
    toxicityBps: basisPoints(
      input.toxicityBps ?? 0,
      'toxicityBps',
    ),
    queueAheadUnits: nonNegativeSafeInteger(
      input.queueAheadUnits ?? 0,
      'queueAheadUnits',
    ),
    visibleOppositeUnits: nonNegativeSafeInteger(
      input.visibleOppositeUnits ?? 0,
      'visibleOppositeUnits',
    ),
    feeBps: basisPoints(
      input.feeBps ?? 0,
      'feeBps',
    ),
  };
  context.distanceToLimitTicks =
    direction === 'up'
      ? context.limitPriceTicks - context.lastPriceTicks
      : context.lastPriceTicks - context.limitPriceTicks;
  context.queueCompetitionBps = ratioBps(
    context.queueAheadUnits,
    context.queueAheadUnits +
      context.visibleOppositeUnits +
      100,
  );
  context.visibleMatchBps = ratioBps(
    context.visibleOppositeUnits,
    context.queueAheadUnits +
      context.visibleOppositeUnits +
      100,
  );
  const fillProbabilityBps = clamp(
    Math.round(
      2_200 +
        context.visibleMatchBps * 0.82 -
        context.queueCompetitionBps * 0.03 -
        context.toxicityBps * 0.12,
    ),
    500,
    9_500,
  );
  const participants = Array.isArray(input.participants)
    ? input.participants
    : [];
  const seenIds = new Set();
  const decisions = [];
  const orders = [];
  for (const participant of participants) {
    const id = String(participant?.id ?? '');
    if (seenIds.has(id)) {
      throw new Error(`duplicate limit follower id: ${id}`);
    }
    seenIds.add(id);
    const decision = participantDecision(
      context,
      participant,
      fillProbabilityBps,
    );
    decisions.push(decision);
    if (decision.action !== 'join' || decision.quantity <= 0) {
      continue;
    }
    const layerKey =
      `limit-follow:${decision.actorId}:${symbol}:${direction}`;
    orders.push({
      layerKey,
      actorId: decision.actorId,
      brokerId: decision.brokerId,
      symbol,
      side: context.side,
      orderType: 'limit',
      priceTicks: context.limitPriceTicks,
      quantity: decision.quantity,
      tif: 'GTC',
      parentOrderId: layerKey,
      liquidityLayer: {
        layerKey,
        symbol,
        side: context.side,
        zone: 'LIMIT_QUEUE',
        purpose: 'profit_seeking_limit_follow',
        expectedNetEdgeBps: decision.expectedNetEdgeBps,
        fillProbabilityBps,
        decisionSequence: context.decisionSequence,
        limitQueuePhase:
          participant.limitQueuePhase ?? 'approach',
        minimumRestMs: nonNegativeSafeInteger(
          participant.minimumRestMs ?? 0,
          `${decision.actorId}.minimumRestMs`,
        ),
        minimumDurableQueueUnits:
          nonNegativeSafeInteger(
            participant.minimumDurableQueueUnits ?? 0,
            `${decision.actorId}.minimumDurableQueueUnits`,
          ),
        boundaryBudgetAllocationBps:
          decision.boundaryBudgetAllocationBps,
      },
    });
  }
  return {
    symbol,
    direction,
    side: context.side,
    limitPriceTicks: context.limitPriceTicks,
    distanceToLimitTicks: context.distanceToLimitTicks,
    queueCompetitionBps: context.queueCompetitionBps,
    visibleMatchBps: context.visibleMatchBps,
    fillProbabilityBps,
    orders,
    decisions,
  };
}

/**
 * Computes cancel/keep/submit actions for limit followers.  Risk-off decisions
 * therefore remove the actual resting order instead of hiding a display wall.
 */
export function diffLimitFollowerQueue(activeOrders, queuePlan) {
  const desiredByLayer = new Map(
    (queuePlan?.orders ?? []).map((order) => [
      order.layerKey,
      order,
    ]),
  );
  const cancelOrders = [];
  const keepOrderIds = [];
  const submitOrders = [];
  const keptLayers = new Set();
  for (const order of activeOrders ?? []) {
    if (!activeOrder(order)) continue;
    const layerKey =
      order.layerKey ??
      order.liquidityLayer?.layerKey ??
      order.parentOrderId;
    const desired = desiredByLayer.get(layerKey);
    const ownerId = order.ownerId ?? order.actorId;
    if (
      desired &&
      !keptLayers.has(layerKey) &&
      ownerId === desired.actorId &&
      order.brokerId === desired.brokerId &&
      order.symbol === desired.symbol &&
      order.side === desired.side &&
      order.priceTicks === desired.priceTicks &&
      order.remainingQty > 0
    ) {
      keepOrderIds.push(order.id);
      keptLayers.add(layerKey);
      desiredByLayer.delete(layerKey);
    } else {
      cancelOrders.push({
        orderId: order.id,
        actorId: ownerId,
        brokerId: order.brokerId,
      });
    }
  }
  for (const desired of desiredByLayer.values()) {
    submitOrders.push({ ...desired });
  }
  return {
    cancelOrders,
    keepOrderIds,
    submitOrders,
  };
}

function executableQuantity(context, symbol, side, priceTicks) {
  const maximum = positiveSafeInteger(
    context.maxQuantity ?? 100,
    'maxQuantity',
  );
  const sizeUnit = deterministicUnit(context, `quantity:${symbol}`);
  const desired = Math.max(
    1,
    Math.floor(maximum * (0.15 + sizeUnit * 0.85)),
  );
  if (side === 'buy') {
    return Math.min(
      desired,
      Math.floor(freeCash(context.account ?? {}) / priceTicks),
    );
  }
  return Math.min(
    desired,
    freeUnits(context.account ?? {}, symbol),
  );
}

/**
 * Returns one deterministic broker-client intent. It reads only the supplied
 * public quotes and the flow account's own finite resources.
 */
export function nextClientFlowIntent(context) {
  if (!Array.isArray(context.symbols) || context.symbols.length === 0) {
    throw new TypeError('symbols must be a non-empty array');
  }
  const symbolIndex = Math.min(
    context.symbols.length - 1,
    Math.floor(
      deterministicUnit(context, 'symbol') *
        context.symbols.length,
    ),
  );
  const symbol = context.symbols[symbolIndex];
  const quote = context.quotes?.[symbol];
  if (
    !quote ||
    !Number.isSafeInteger(quote.bestBidTicks) ||
    !Number.isSafeInteger(quote.bestAskTicks) ||
    quote.bestBidTicks <= 0 ||
    quote.bestAskTicks <= quote.bestBidTicks
  ) {
    return null;
  }
  let side =
    deterministicUnit(context, `side:${symbol}`) < 0.5
      ? 'buy'
      : 'sell';
  if (
    side === 'sell' &&
    freeUnits(context.account ?? {}, symbol) === 0
  ) {
    side = 'buy';
  }
  if (
    side === 'buy' &&
    freeCash(context.account ?? {}) < quote.bestAskTicks
  ) {
    side = 'sell';
  }
  const aggressive =
    deterministicUnit(context, `tif:${symbol}`) < 0.72;
  const tif = aggressive ? 'IOC' : 'GTC';
  const priceTicks =
    side === 'buy'
      ? aggressive
        ? quote.bestAskTicks
        : quote.bestBidTicks
      : aggressive
        ? quote.bestBidTicks
        : quote.bestAskTicks;
  const quantity = executableQuantity(
    context,
    symbol,
    side,
    priceTicks,
  );
  if (quantity <= 0) return null;

  return {
    type: 'submit_order',
    actorId: String(context.account?.id ?? context.flowId),
    brokerId: String(context.brokerId ?? 'broker_lzy'),
    symbol,
    side,
    priceTicks,
    quantity,
    tif,
    parentOrderId: `flow:${context.flowId}:${context.nowMs}:${context.decisionSequence}`,
  };
}

function aggregateActiveOrders(book, side) {
  const levels = new Map();
  for (const order of Object.values(book?.orders ?? {})) {
    if (!activeOrder(order) || order.side !== side) continue;
    const previous = levels.get(order.priceTicks) ?? {
      priceTicks: order.priceTicks,
      quantity: 0,
      orderCount: 0,
    };
    previous.quantity += order.remainingQty;
    previous.orderCount += 1;
    levels.set(order.priceTicks, previous);
  }
  return [...levels.values()].sort((left, right) =>
    side === 'buy'
      ? right.priceTicks - left.priceTicks
      : left.priceTicks - right.priceTicks,
  );
}

export function liquidityHealth(book, depth = DEFAULT_DEPTH) {
  const requestedDepth = clamp(
    positiveSafeInteger(depth, 'depth'),
    1,
    MAX_DEPTH,
  );
  const bids = aggregateActiveOrders(book, 'buy').slice(
    0,
    requestedDepth,
  );
  const asks = aggregateActiveOrders(book, 'sell').slice(
    0,
    requestedDepth,
  );
  return {
    depth: requestedDepth,
    bidLevelCount: bids.length,
    askLevelCount: asks.length,
    complete:
      bids.length >= requestedDepth &&
      asks.length >= requestedDepth,
    bids,
    asks,
  };
}

/**
 * A deliberately small, serializable order book. The per-price order-id queues
 * and `orders` dictionary are authoritative. A WeakMap keeps only a rebuildable
 * sorted-price index, so matching and depth reads do not repeatedly sort the
 * same levels and checkpoints remain plain JSON with no derived authority.
 */

const derivedIndexes = new WeakMap();
const preparedExecutionPlans = new WeakMap();
const transactionalBooks = new WeakMap();
const runtimeQueueTombstones = new WeakMap();

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function priceKey(priceTicks) {
  return String(priceTicks);
}

function sideLevels(book, side) {
  return side === 'buy' ? book.bids : book.asks;
}

function oppositeSide(side) {
  return side === 'buy' ? 'sell' : 'buy';
}

function priceSort(side) {
  return side === 'buy' ? (a, b) => b - a : (a, b) => a - b;
}

function addOwnerOrderId(ownerOrderIds, order) {
  let orderIds = ownerOrderIds.get(order.ownerId);
  if (!orderIds) {
    orderIds = new Set();
    ownerOrderIds.set(order.ownerId, orderIds);
  }
  orderIds.add(order.id);
}

function buildSideIndex(
  book,
  side,
  queuedIds,
  ownerOrderIds,
) {
  const levels = sideLevels(book, side);
  const aggregates = new Map();
  let totalQuantity = 0;
  let totalOrderCount = 0;
  for (const [key, queue] of Object.entries(levels)) {
    const priceTicks = Number(key);
    let quantity = 0;
    let orderCount = 0;
    const ownerQuantities = new Map();
    const ownerOrderCounts = new Map();
    for (const orderId of queue) {
      const order = book.orders[orderId];
      if (!orderIsActive(order)) continue;
      quantity += order.remainingQty;
      orderCount += 1;
      queuedIds.add(orderId);
      addOwnerOrderId(ownerOrderIds, order);
      ownerQuantities.set(
        order.ownerId,
        (ownerQuantities.get(order.ownerId) ?? 0) +
          order.remainingQty,
      );
      ownerOrderCounts.set(
        order.ownerId,
        (ownerOrderCounts.get(order.ownerId) ?? 0) +
          1,
      );
    }
    if (orderCount > 0) {
      aggregates.set(priceTicks, {
        quantity,
        orderCount,
        ownerQuantities,
        ownerOrderCounts,
      });
      totalQuantity += quantity;
      totalOrderCount += orderCount;
    }
  }
  const prices = [...aggregates.keys()].sort(
    priceSort(side),
  );
  return {
    prices,
    levelCount: prices.length,
    aggregates,
    totalQuantity,
    totalOrderCount,
  };
}

function bookIndex(book) {
  let index = derivedIndexes.get(book);
  if (!index) {
    const queuedIds = new Set();
    const ownerOrderIds = new Map();
    index = {
      buy: buildSideIndex(
        book,
        'buy',
        queuedIds,
        ownerOrderIds,
      ),
      sell: buildSideIndex(
        book,
        'sell',
        queuedIds,
        ownerOrderIds,
      ),
      queuedIds,
      ownerOrderIds,
      revision: 0,
    };
    derivedIndexes.set(book, index);
  }
  return index;
}

function touchBook(book) {
  bookIndex(book).revision += 1;
}

function sortedPrices(book, side) {
  return bookIndex(book)[side].prices;
}

function addIndexedPrice(book, side, priceTicks) {
  const index = bookIndex(book)[side];
  const prices = index.prices;
  let low = 0;
  let high = prices.length;
  const compare = priceSort(side);
  while (low < high) {
    const middle = (low + high) >> 1;
    if (compare(prices[middle], priceTicks) < 0) low = middle + 1;
    else high = middle;
  }
  if (prices[low] !== priceTicks) prices.splice(low, 0, priceTicks);
  index.levelCount = prices.length;
}

function removeIndexedPrice(book, side, priceTicks) {
  const index = bookIndex(book)[side];
  const position = index.prices.indexOf(priceTicks);
  if (position !== -1) index.prices.splice(position, 1);
  index.levelCount = index.prices.length;
}

function cloneSideIndex(index) {
  return {
    prices: [...index.prices],
    levelCount: index.levelCount,
    totalQuantity: index.totalQuantity,
    totalOrderCount: index.totalOrderCount,
    aggregates: new Map(
      [...index.aggregates].map(
        ([priceTicks, aggregate]) => [
          priceTicks,
          {
            quantity: aggregate.quantity,
            orderCount: aggregate.orderCount,
            ownerQuantities: new Map(
              aggregate.ownerQuantities,
            ),
            ownerOrderCounts: new Map(
              aggregate.ownerOrderCounts,
            ),
          },
        ],
      ),
    ),
  };
}

function cloneBookIndex(book) {
  const source = bookIndex(book);
  return {
    buy: cloneSideIndex(source.buy),
    sell: cloneSideIndex(source.sell),
    queuedIds: new Set(source.queuedIds),
    // Owner sets are immutable until touched by this sparse transaction.
    // The map itself is cheap (number of owners), while copying every order
    // id on each player command would recreate the flood-sized hot path.
    ownerOrderIds: new Map(source.ownerOrderIds),
    revision: source.revision,
  };
}

function mutableOwnerOrderIds(book, ownerId) {
  const index = bookIndex(book);
  const transaction = transactionalBooks.get(book);
  if (
    transaction &&
    !transaction.clonedOwnerOrderIds.has(ownerId)
  ) {
    const cloned = new Set(
      index.ownerOrderIds.get(ownerId) ?? [],
    );
    index.ownerOrderIds.set(ownerId, cloned);
    transaction.clonedOwnerOrderIds.add(ownerId);
    return cloned;
  }
  let orderIds = index.ownerOrderIds.get(ownerId);
  if (!orderIds) {
    orderIds = new Set();
    index.ownerOrderIds.set(ownerId, orderIds);
  }
  return orderIds;
}

function indexActiveOwnerOrder(book, order) {
  mutableOwnerOrderIds(book, order.ownerId).add(order.id);
}

function unindexActiveOwnerOrder(book, order) {
  const orderIds = mutableOwnerOrderIds(book, order.ownerId);
  orderIds.delete(order.id);
  if (orderIds.size === 0) {
    bookIndex(book).ownerOrderIds.delete(order.ownerId);
  }
}

function levelAggregate(book, side, priceTicks) {
  return bookIndex(book)[side].aggregates.get(priceTicks) ?? null;
}

function adjustLevelAggregate(
  book,
  side,
  priceTicks,
  ownerId,
  quantityDelta,
  orderCountDelta,
) {
  const sideIndex = bookIndex(book)[side];
  let aggregate = sideIndex.aggregates.get(priceTicks);
  if (!aggregate) {
    aggregate = {
      quantity: 0,
      orderCount: 0,
      ownerQuantities: new Map(),
      ownerOrderCounts: new Map(),
    };
    sideIndex.aggregates.set(priceTicks, aggregate);
    addIndexedPrice(book, side, priceTicks);
  }
  aggregate.quantity += quantityDelta;
  aggregate.orderCount += orderCountDelta;
  sideIndex.totalQuantity += quantityDelta;
  sideIndex.totalOrderCount += orderCountDelta;
  const ownerQuantity =
    (aggregate.ownerQuantities.get(ownerId) ?? 0) +
    quantityDelta;
  if (ownerQuantity === 0) {
    aggregate.ownerQuantities.delete(ownerId);
  } else {
    aggregate.ownerQuantities.set(ownerId, ownerQuantity);
  }
  const ownerOrderCount =
    (aggregate.ownerOrderCounts.get(ownerId) ?? 0) +
    orderCountDelta;
  if (ownerOrderCount === 0) {
    aggregate.ownerOrderCounts.delete(ownerId);
  } else {
    aggregate.ownerOrderCounts.set(
      ownerId,
      ownerOrderCount,
    );
  }
  if (
    aggregate.quantity < 0 ||
    aggregate.orderCount < 0 ||
    sideIndex.totalQuantity < 0 ||
    sideIndex.totalOrderCount < 0
  ) {
    throw new Error(
      `book aggregate underflow: ${book.symbol}:${side}:${priceTicks}`,
    );
  }
  if (aggregate.orderCount === 0) {
    if (aggregate.quantity !== 0) {
      throw new Error(
        `book aggregate quantity mismatch: ${book.symbol}:${side}:${priceTicks}`,
      );
    }
    sideIndex.aggregates.delete(priceTicks);
    removeIndexedPrice(book, side, priceTicks);
  }
}

function bestPrice(book, side) {
  return sortedPrices(book, side)[0];
}

function crosses(incoming, restingPrice) {
  if (incoming.type === 'market') {
    if (!isPositiveInteger(incoming.protectionPriceTicks)) {
      return true;
    }
    return incoming.side === 'buy'
      ? restingPrice <= incoming.protectionPriceTicks
      : restingPrice >= incoming.protectionPriceTicks;
  }
  return incoming.side === 'buy'
    ? restingPrice <= incoming.priceTicks
    : restingPrice >= incoming.priceTicks;
}

function orderIsActive(order) {
  return order && order.remainingQty > 0 &&
    (order.status === 'accepted' || order.status === 'partially_filled');
}

function validateOrder(book, order) {
  if (!order || typeof order !== 'object') return 'INVALID_ORDER';
  if (
    typeof order.id !== 'string' ||
    order.id.length === 0 ||
    order.id === 'prototype' ||
    Object.hasOwn(Object.prototype, order.id)
  ) return 'INVALID_ORDER_ID';
  if (typeof order.ownerId !== 'string' || order.ownerId.length === 0) return 'INVALID_OWNER_ID';
  if (order.symbol !== book.symbol) return 'SYMBOL_MISMATCH';
  if (order.side !== 'buy' && order.side !== 'sell') return 'INVALID_SIDE';
  if (order.type !== 'limit' && order.type !== 'market') {
    return 'UNSUPPORTED_ORDER_TYPE';
  }
  if (order.type === 'limit' && !isPositiveInteger(order.priceTicks)) {
    return 'INVALID_PRICE_TICKS';
  }
  if (
    order.type === 'market' &&
    order.priceTicks !== null &&
    order.priceTicks !== undefined
  ) {
    return 'INVALID_MARKET_PRICE';
  }
  if (
    order.protectionPriceTicks !== null &&
    order.protectionPriceTicks !== undefined &&
    !isPositiveInteger(order.protectionPriceTicks)
  ) {
    return 'INVALID_PROTECTION_PRICE_TICKS';
  }
  if (!isPositiveInteger(order.originalQty) || !isPositiveInteger(order.remainingQty)) return 'INVALID_QUANTITY';
  if (order.remainingQty > order.originalQty) return 'INVALID_QUANTITY';
  if (order.tif !== 'GTC' && order.tif !== 'IOC') return 'INVALID_TIF';
  if (order.type === 'market' && order.tif !== 'IOC') {
    return 'INVALID_MARKET_TIF';
  }
  if (Object.hasOwn(book.orders, order.id)) return 'DUPLICATE_ORDER_ID';
  return null;
}

function transactionalOrder(book, orderId) {
  const transaction = transactionalBooks.get(book);
  if (!transaction) return book.orders[orderId];
  if (transaction.deletedOrderIds.has(orderId)) {
    return undefined;
  }
  return transaction.changedOrders.has(orderId)
    ? transaction.changedOrders.get(orderId)
    : transaction.sourceBook.orders[orderId];
}

function mutableOrder(book, orderId) {
  const transaction = transactionalBooks.get(book);
  if (!transaction) return book.orders[orderId];
  if (transaction.changedOrders.has(orderId)) {
    return transaction.changedOrders.get(orderId);
  }
  const source = transaction.sourceBook.orders[orderId];
  if (!source) return undefined;
  const cloned = { ...source };
  transaction.changedOrders.set(orderId, cloned);
  return cloned;
}

function queueAppendKey(side, priceTicks) {
  return `${side}:${priceTicks}`;
}

function addToQueue(book, order) {
  const levels = sideLevels(book, order.side);
  const key = priceKey(order.priceTicks);
  const newLevel = !levels[key];
  const transaction = transactionalBooks.get(book);
  if (transaction) {
    const appendKey = queueAppendKey(
      order.side,
      order.priceTicks,
    );
    const appended =
      transaction.queueAppends.get(appendKey) ?? [];
    appended.push(order.id);
    transaction.queueAppends.set(appendKey, appended);
  } else {
    const queue = levels[key] || (levels[key] = []);
    queue.push(order.id);
  }
  if (newLevel) {
    addIndexedPrice(book, order.side, order.priceTicks);
  }
  bookIndex(book).queuedIds.add(order.id);
  indexActiveOwnerOrder(book, order);
  adjustLevelAggregate(
    book,
    order.side,
    order.priceTicks,
    order.ownerId,
    order.remainingQty,
    1,
  );
}

function removeFromQueue(
  book,
  order,
  { quantity = order.remainingQty } = {},
) {
  const levels = sideLevels(book, order.side);
  const key = priceKey(order.priceTicks);
  const queue = levels[key];
  if (!queue) return false;
  const index = bookIndex(book);
  if (!index.queuedIds.has(order.id)) return false;
  if (!transactionalBooks.has(book)) {
    const position = queue.indexOf(order.id);
    if (position === -1) return false;
    queue.splice(position, 1);
    if (queue.length === 0) {
      delete levels[key];
    }
  }
  const transaction = transactionalBooks.get(book);
  if (transaction) {
    transaction.removedQueueIds.add(order.id);
  }
  index.queuedIds.delete(order.id);
  unindexActiveOwnerOrder(book, order);
  adjustLevelAggregate(
    book,
    order.side,
    order.priceTicks,
    order.ownerId,
    -quantity,
    -1,
  );
  return true;
}

function makeFill(incoming, resting, quantity) {
  const buyOrder = incoming.side === 'buy' ? incoming : resting;
  const sellOrder = incoming.side === 'sell' ? incoming : resting;
  return {
    restingOrderId: resting.id,
    incomingOrderId: incoming.id,
    buyerOrderId: buyOrder.id,
    sellerOrderId: sellOrder.id,
    selfTrade: buyOrder.ownerId === sellOrder.ownerId,
    priceTicks: resting.priceTicks,
    quantity,
  };
}

function reject(book, reason) {
  return {
    book,
    fills: [],
    restingOrder: null,
    rejected: { reason },
  };
}

/** Creates a plain-object book that can be JSON serialized without adapters. */
export function createOrderBook(symbol) {
  if (typeof symbol !== 'string' || symbol.length === 0) {
    throw new TypeError('symbol must be a non-empty string');
  }

  return {
    symbol,
    bids: {},
    asks: {},
    orders: {},
    nextSequence: 1,
  };
}

function visibleTransactionOrderIds(transaction) {
  const ids = new Set(
    Reflect.ownKeys(transaction.sourceBook.orders),
  );
  for (const orderId of transaction.deletedOrderIds) {
    ids.delete(orderId);
  }
  for (const orderId of transaction.changedOrders.keys()) {
    ids.add(orderId);
  }
  return [...ids];
}

function transactionOrdersProxy(transaction) {
  return new Proxy(Object.create(null), {
    get(_target, property) {
      if (property === 'toJSON') {
        return () =>
          Object.fromEntries(
            visibleTransactionOrderIds(transaction).map(
              (orderId) => [
                orderId,
                transactionalOrder(
                  transaction.book,
                  orderId,
                ),
              ],
            ),
          );
      }
      if (typeof property !== 'string') return undefined;
      return transactionalOrder(
        transaction.book,
        property,
      );
    },
    set(_target, property, value) {
      if (typeof property !== 'string') return false;
      transaction.deletedOrderIds.delete(property);
      transaction.changedOrders.set(property, value);
      return true;
    },
    deleteProperty(_target, property) {
      if (typeof property !== 'string') return false;
      transaction.changedOrders.delete(property);
      transaction.deletedOrderIds.add(property);
      return true;
    },
    has(_target, property) {
      return (
        typeof property === 'string' &&
        transactionalOrder(
          transaction.book,
          property,
        ) !== undefined
      );
    },
    ownKeys() {
      return visibleTransactionOrderIds(transaction);
    },
    getOwnPropertyDescriptor(_target, property) {
      if (
        typeof property !== 'string' ||
        transactionalOrder(
          transaction.book,
          property,
        ) === undefined
      ) {
        return undefined;
      }
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: transactionalOrder(
          transaction.book,
          property,
        ),
      };
    },
  });
}

/**
 * Creates a sparse, uncommitted view over one plain canonical book. Only
 * changed orders and queue appends are owned by the view; the source stays
 * untouched until the surrounding market transaction has passed its audit.
 */
export function createOrderBookTransaction(sourceBook) {
  if (
    !sourceBook ||
    typeof sourceBook !== 'object' ||
    !sourceBook.orders ||
    transactionalBooks.has(sourceBook)
  ) {
    throw new TypeError(
      'A plain canonical order book is required.',
    );
  }
  const book = {
    ...sourceBook,
    bids: sourceBook.bids,
    asks: sourceBook.asks,
    orders: null,
  };
  const transaction = {
    sourceBook,
    book,
    changedOrders: new Map(),
    deletedOrderIds: new Set(),
    queueAppends: new Map(),
    removedQueueIds: new Set(),
    clonedOwnerOrderIds: new Set(),
  };
  book.orders = transactionOrdersProxy(transaction);
  transactionalBooks.set(book, transaction);
  derivedIndexes.set(book, cloneBookIndex(sourceBook));
  return book;
}

export function orderBookTransactionChanges(book) {
  const transaction = transactionalBooks.get(book);
  if (!transaction) return null;
  return {
    sourceBook: transaction.sourceBook,
    changedOrders: transaction.changedOrders,
    deletedOrderIds: transaction.deletedOrderIds,
    queueAppends: transaction.queueAppends,
    removedQueueIds: transaction.removedQueueIds,
  };
}

/**
 * Carries rebuildable queue-removal provenance across an in-memory clone.
 * Tombstones are intentionally absent from checkpoints, but a full
 * transaction clone still needs to distinguish verified lazy removals from
 * a genuinely corrupted queue before the next compaction barrier.
 */
export function copyOrderBookRuntimeMetadata(
  sourceBook,
  targetBook,
) {
  if (
    !sourceBook ||
    !targetBook ||
    sourceBook.symbol !== targetBook.symbol
  ) {
    throw new TypeError(
      'Matching source and target order books are required.',
    );
  }
  const tombstones =
    runtimeQueueTombstones.get(sourceBook);
  if (tombstones?.size > 0) {
    runtimeQueueTombstones.set(
      targetBook,
      new Set(tombstones),
    );
  }
  return targetBook;
}

/**
 * Applies a verified sparse book transaction in bounded changed-order work.
 * Cancelled/filled queue ids remain as runtime tombstones and are compacted
 * at the next complete audit/checkpoint barrier.
 */
export function commitOrderBookTransaction(book) {
  const transaction = transactionalBooks.get(book);
  if (!transaction) return book;
  const source = transaction.sourceBook;
  let tombstones = runtimeQueueTombstones.get(source);
  if (!tombstones) {
    tombstones = new Set();
    runtimeQueueTombstones.set(source, tombstones);
  }
  for (const orderId of transaction.removedQueueIds) {
    tombstones.add(orderId);
  }
  for (const orderId of transaction.deletedOrderIds) {
    const deleted = source.orders[orderId];
    if (deleted?.type === 'limit') {
      const levels = sideLevels(source, deleted.side);
      const key = priceKey(deleted.priceTicks);
      const queue = levels[key];
      const position = queue?.indexOf(orderId) ?? -1;
      if (position !== -1) {
        queue.splice(position, 1);
        if (queue.length === 0) delete levels[key];
      }
    }
    delete source.orders[orderId];
    tombstones.delete(orderId);
  }
  for (const [orderId, order] of
    transaction.changedOrders) {
    source.orders[orderId] = order;
  }
  for (const [appendKey, orderIds] of
    transaction.queueAppends) {
    const separator = appendKey.indexOf(':');
    const side = appendKey.slice(0, separator);
    const priceTicks = Number(
      appendKey.slice(separator + 1),
    );
    const levels = sideLevels(source, side);
    const key = priceKey(priceTicks);
    const queue = levels[key] || (levels[key] = []);
    queue.push(...orderIds);
  }
  source.nextSequence = book.nextSequence;
  derivedIndexes.set(source, bookIndex(book));
  transactionalBooks.delete(book);
  return source;
}

export function materializeOrderBookTransaction(book) {
  const transaction = transactionalBooks.get(book);
  if (!transaction) return book;
  const orders = Object.fromEntries(
    visibleTransactionOrderIds(transaction).map(
      (orderId) => [
        orderId,
        transactionalOrder(book, orderId),
      ],
    ),
  );
  const materializeLevels = (side) => {
    const sourceLevels = sideLevels(
      transaction.sourceBook,
      side,
    );
    const levels = Object.fromEntries(
      Object.entries(sourceLevels).map(
        ([key, queue]) => [key, [...queue]],
      ),
    );
    for (const [appendKey, orderIds] of
      transaction.queueAppends) {
      const separator = appendKey.indexOf(':');
      if (appendKey.slice(0, separator) !== side) {
        continue;
      }
      const key = appendKey.slice(separator + 1);
      const queue = levels[key] || (levels[key] = []);
      queue.push(...orderIds);
    }
    for (const [key, queue] of Object.entries(levels)) {
      const activeIds = queue.filter((orderId) =>
        orderIsActive(orders[orderId]),
      );
      if (activeIds.length === 0) {
        delete levels[key];
      } else {
        levels[key] = activeIds;
      }
    }
    return levels;
  };
  return {
    symbol: book.symbol,
    bids: materializeLevels('buy'),
    asks: materializeLevels('sell'),
    orders,
    nextSequence: book.nextSequence,
  };
}

/**
 * Removes runtime queue tombstones before a full invariant or checkpoint.
 * The authority remains a plain JSON-compatible object.
 */
export function compactOrderBookQueues(book) {
  if (transactionalBooks.has(book)) {
    throw new Error(
      'Cannot compact an uncommitted order book transaction.',
    );
  }
  const tombstones =
    runtimeQueueTombstones.get(book) ?? new Set();
  for (const side of ['buy', 'sell']) {
    const levels = sideLevels(book, side);
    for (const [key, queue] of Object.entries(levels)) {
      for (const orderId of queue) {
        const order = book.orders[orderId];
        if (
          (
            !order &&
            !tombstones.has(orderId)
          ) ||
          (
            order &&
            !orderIsActive(order) &&
            !tombstones.has(orderId)
          )
        ) {
          throw new Error(
            `Unknown queued order during compaction: ${book.symbol}:${orderId}`,
          );
        }
      }
      const activeIds = queue.filter((orderId) =>
        orderIsActive(book.orders[orderId]),
      );
      if (activeIds.length === 0) {
        delete levels[key];
      } else if (activeIds.length !== queue.length) {
        levels[key] = activeIds;
      }
    }
  }
  runtimeQueueTombstones.delete(book);
  derivedIndexes.delete(book);
  bookIndex(book);
  return book;
}

/**
 * Builds the same price-time execution prefix used by submitToBook without
 * mutating the book. Ownership is recorded on resulting fills but never changes
 * price-time priority: orders controlled by the same account remain eligible
 * counterparties.
 */
export function previewBookExecution(book, incoming) {
  if (
    !book ||
    !book.orders ||
    !incoming ||
    (incoming.side !== 'buy' && incoming.side !== 'sell') ||
    typeof incoming.ownerId !== 'string' ||
    !isPositiveInteger(incoming.quantity)
  ) {
    throw new TypeError('A valid book execution preview is required');
  }
  const normalized = {
    side: incoming.side,
    ownerId: incoming.ownerId,
    type: incoming.type ?? 'market',
    priceTicks: incoming.priceTicks ?? null,
    protectionPriceTicks:
      incoming.protectionPriceTicks ?? null,
  };
  const restingSide = oppositeSide(normalized.side);
  let remainingQty = incoming.quantity;
  const matches = [];
  for (const restingPrice of sortedPrices(book, restingSide)) {
    if (
      remainingQty <= 0 ||
      !crosses(normalized, restingPrice)
    ) {
      break;
    }
    const queue =
      sideLevels(book, restingSide)[priceKey(restingPrice)];
    for (const orderId of queue) {
      if (remainingQty <= 0) break;
      const restingOrder = transactionalOrder(
        book,
        orderId,
      );
      if (!orderIsActive(restingOrder)) {
        continue;
      }
      const quantity = Math.min(
        remainingQty,
        restingOrder.remainingQty,
      );
      remainingQty -= quantity;
      matches.push({
        restingOrderId: restingOrder.id,
        priceTicks: restingPrice,
        quantity,
      });
    }
  }
  const plan = {
    matches,
    remainingQty,
  };
  preparedExecutionPlans.set(plan, {
    book,
    revision: bookIndex(book).revision,
    side: normalized.side,
    ownerId: normalized.ownerId,
    type: normalized.type,
    priceTicks: normalized.priceTicks,
    protectionPriceTicks: normalized.protectionPriceTicks,
    quantity: incoming.quantity,
  });
  return plan;
}

function preparedExecutionFor(book, order, candidate) {
  if (candidate === null || candidate === undefined) return null;
  const metadata = preparedExecutionPlans.get(candidate);
  if (
    !metadata ||
    metadata.book !== book ||
    metadata.revision !== bookIndex(book).revision ||
    metadata.side !== order.side ||
    metadata.ownerId !== order.ownerId ||
    metadata.type !== order.type ||
    metadata.priceTicks !== (order.priceTicks ?? null) ||
    metadata.protectionPriceTicks !==
      (order.protectionPriceTicks ?? null) ||
    metadata.quantity !== order.remainingQty
  ) {
    throw new Error('Prepared book execution is stale or mismatched.');
  }
  preparedExecutionPlans.delete(candidate);
  return candidate;
}

/**
 * Routes one limit order, executing against the best resting orders first.
 * The passed order is copied, so callers may safely reuse their intent object.
 */
export function submitToBook(
  book,
  order,
  { executionPlan: preparedExecution = null } = {},
) {
  const reason = !book || typeof book !== 'object' || !book.orders
    ? 'INVALID_BOOK'
    : validateOrder(book, order);
  if (reason) return reject(book, reason);

  const storedOrder = { ...order };
  const executionPlan =
    preparedExecutionFor(book, storedOrder, preparedExecution) ??
    previewBookExecution(book, {
      side: storedOrder.side,
      ownerId: storedOrder.ownerId,
      type: storedOrder.type,
      priceTicks: storedOrder.priceTicks,
      protectionPriceTicks:
        storedOrder.protectionPriceTicks ?? null,
      quantity: storedOrder.remainingQty,
    });
  storedOrder.sequence = book.nextSequence;
  book.nextSequence += 1;
  book.orders[storedOrder.id] = storedOrder;
  touchBook(book);

  const fills = [];
  for (const match of executionPlan.matches) {
    const restingOrder = mutableOrder(
      book,
      match.restingOrderId,
    );
    if (
      !orderIsActive(restingOrder) ||
      restingOrder.priceTicks !== match.priceTicks ||
      restingOrder.remainingQty < match.quantity
    ) {
      throw new Error(
        `book execution plan diverged at ${match.restingOrderId}`,
      );
    }
    storedOrder.remainingQty -= match.quantity;
    restingOrder.remainingQty -= match.quantity;
    adjustLevelAggregate(
      book,
      restingOrder.side,
      restingOrder.priceTicks,
      restingOrder.ownerId,
      -match.quantity,
      0,
    );
    fills.push(
      makeFill(storedOrder, restingOrder, match.quantity),
    );

    if (restingOrder.remainingQty === 0) {
      restingOrder.status = 'filled';
      removeFromQueue(book, restingOrder, {
        quantity: 0,
      });
    } else {
      restingOrder.status = 'partially_filled';
    }
  }
  if (storedOrder.remainingQty === 0) {
    storedOrder.status = 'filled';
    return {
      book,
      fills,
      restingOrder: null,
      rejected: null,
    };
  }

  if (
    storedOrder.tif === 'IOC' ||
    storedOrder.type === 'market'
  ) {
    storedOrder.status = 'cancelled';
    return {
      book,
      fills,
      restingOrder: null,
      rejected: null,
    };
  }

  storedOrder.status = storedOrder.remainingQty === storedOrder.originalQty
    ? 'accepted'
    : 'partially_filled';
  addToQueue(book, storedOrder);
  return {
    book,
    fills,
    restingOrder: storedOrder,
    rejected: null,
  };
}

/** Cancels an active order only when the given owner owns that order. */
export function cancelInBook(book, orderId, ownerId) {
  const order =
    book && book.orders
      ? transactionalOrder(book, orderId)
      : null;
  if (!order) return { cancelled: false, reason: 'ORDER_NOT_FOUND', order: null };
  if (order.ownerId !== ownerId) {
    return { cancelled: false, reason: 'NOT_ORDER_OWNER', order: null };
  }
  if (!orderIsActive(order)) {
    return { cancelled: false, reason: 'ORDER_NOT_ACTIVE', order: null };
  }
  const mutable = mutableOrder(book, orderId);
  if (!removeFromQueue(book, mutable)) {
    return { cancelled: false, reason: 'BOOK_INTEGRITY_ERROR', order: null };
  }

  mutable.status = 'cancelled';
  touchBook(book);
  return { cancelled: true, reason: null, order: mutable };
}

/**
 * Returns active orders for one owner from a rebuildable runtime index. The
 * returned order records remain the canonical book objects; the index only
 * narrows lookup and is never serialized as authority.
 */
export function activeOrdersForOwner(book, ownerId) {
  if (
    !book ||
    typeof book !== 'object' ||
    !book.orders ||
    typeof ownerId !== 'string'
  ) {
    return [];
  }
  const orderIds =
    bookIndex(book).ownerOrderIds.get(ownerId);
  if (!orderIds || orderIds.size === 0) return [];
  return [...orderIds]
    .map((orderId) => transactionalOrder(book, orderId))
    .filter(orderIsActive)
    .sort(
      (left, right) =>
        left.sequence - right.sequence ||
        left.id.localeCompare(right.id),
    );
}

/**
 * Counts active displayed authority from per-level aggregates. Runtime cost
 * scales with real price levels, not with the number of FIFO orders at them.
 */
export function activeBookStats(book) {
  if (!book || typeof book !== 'object' || !book.orders) {
    return { quantity: 0, orderCount: 0 };
  }
  let quantity = 0;
  let orderCount = 0;
  const index = bookIndex(book);
  for (const side of [index.buy, index.sell]) {
    quantity += side.totalQuantity;
    orderCount += side.totalOrderCount;
  }
  return { quantity, orderCount };
}

/**
 * Returns active price levels after removing a selected order-id set. The
 * rebuildable aggregate index supplies the remaining order counts, so callers
 * do not have to rescan every FIFO queue at the selected prices.
 */
export function activePriceTicksExcludingOrders(
  book,
  side,
  excludedOrderIds,
) {
  if (
    !book ||
    typeof book !== 'object' ||
    !book.orders ||
    (side !== 'buy' && side !== 'sell')
  ) {
    return new Set();
  }
  const excludedCounts = new Map();
  for (const orderId of excludedOrderIds ?? []) {
    const order = transactionalOrder(book, orderId);
    if (!orderIsActive(order) || order.side !== side) continue;
    excludedCounts.set(
      order.priceTicks,
      (excludedCounts.get(order.priceTicks) ?? 0) + 1,
    );
  }
  const prices = new Set();
  for (const priceTicks of sortedPrices(book, side)) {
    const activeCount =
      levelAggregate(book, side, priceTicks)?.orderCount ?? 0;
    if (
      activeCount >
      (excludedCounts.get(priceTicks) ?? 0)
    ) {
      prices.add(priceTicks);
    }
  }
  return prices;
}

/**
 * Summarizes a bounded visible ladder for decision logic without allocating
 * one public level object per price. Matching and displayed depth still use
 * the same aggregate authority.
 */
export function aggregateBookMetrics(
  book,
  depth = 5,
  { excludeOwnerId = null } = {},
) {
  const limit =
    Number.isSafeInteger(depth) && depth >= 0
      ? depth
      : 0;
  const summarize = (side) => {
    let bestPriceTicks = null;
    let bestQuantity = 0;
    let totalQuantity = 0;
    let levelCount = 0;
    if (limit === 0) {
      return {
        bestPriceTicks,
        bestQuantity,
        totalQuantity,
        levelCount,
      };
    }
    for (const priceTicks of sortedPrices(book, side)) {
      const aggregate =
        levelAggregate(book, side, priceTicks);
      const excluded =
        typeof excludeOwnerId === 'string'
          ? aggregate?.ownerQuantities.get(
              excludeOwnerId,
            ) ?? 0
          : 0;
      const quantity =
        (aggregate?.quantity ?? 0) - excluded;
      if (quantity <= 0) continue;
      if (levelCount === 0) {
        bestPriceTicks = priceTicks;
        bestQuantity = quantity;
      }
      totalQuantity += quantity;
      levelCount += 1;
      if (levelCount >= limit) break;
    }
    return {
      bestPriceTicks,
      bestQuantity,
      totalQuantity,
      levelCount,
    };
  };
  return {
    bids: summarize('buy'),
    asks: summarize('sell'),
  };
}

/**
 * Reads one exact derived price level from the rebuildable aggregate index.
 * This keeps boundary-queue decisions O(1) even when the price is outside the
 * visible top-N ladder. Matching authority and FIFO order records are unchanged.
 */
export function bookLevelMetrics(
  book,
  side,
  priceTicks,
  { excludeOwnerId = null } = {},
) {
  if (
    !book ||
    typeof book !== 'object' ||
    !book.orders ||
    (side !== 'buy' && side !== 'sell') ||
    !Number.isSafeInteger(priceTicks)
  ) {
    return {
      priceTicks,
      quantity: 0,
      orderCount: 0,
    };
  }
  const aggregate = levelAggregate(
    book,
    side,
    priceTicks,
  );
  const excludedQuantity =
    typeof excludeOwnerId === 'string'
      ? aggregate?.ownerQuantities.get(excludeOwnerId) ?? 0
      : 0;
  const excludedOrderCount =
    typeof excludeOwnerId === 'string'
      ? aggregate?.ownerOrderCounts.get(excludeOwnerId) ?? 0
      : 0;
  return {
    priceTicks,
    quantity: Math.max(
      0,
      (aggregate?.quantity ?? 0) - excludedQuantity,
    ),
    orderCount: Math.max(
      0,
      (aggregate?.orderCount ?? 0) -
        excludedOrderCount,
    ),
  };
}

/** Returns the top N derived levels; quantities still come from live FIFO queues. */
export function aggregateBook(
  book,
  depth = 5,
  { excludeOwnerId = null } = {},
) {
  const limit = Number.isSafeInteger(depth) && depth >= 0 ? depth : 0;
  const aggregateSide = (side) => {
    if (limit === 0) return [];
    const levels = [];
    for (const priceTicks of sortedPrices(book, side)) {
      const aggregate =
        levelAggregate(book, side, priceTicks);
      const excluded =
        typeof excludeOwnerId === 'string'
          ? aggregate?.ownerQuantities.get(
              excludeOwnerId,
            ) ?? 0
          : 0;
      const excludedOrderCount =
        typeof excludeOwnerId === 'string'
          ? aggregate?.ownerOrderCounts.get(
              excludeOwnerId,
            ) ?? 0
          : 0;
      const level = {
        priceTicks,
        quantity:
          (aggregate?.quantity ?? 0) - excluded,
        orderCount:
          (aggregate?.orderCount ?? 0) -
          excludedOrderCount,
      };
      if (level.quantity <= 0) continue;
      levels.push(level);
      if (levels.length >= limit) break;
    }
    return levels;
  };

  return { bids: aggregateSide('buy'), asks: aggregateSide('sell') };
}

/** Reports, rather than repairs, violations of the book's source-of-truth data. */
export function assertBookIntegrity(book) {
  const errors = [];
  if (!book || typeof book !== 'object') return { ok: false, errors: ['INVALID_BOOK'] };
  if (typeof book.symbol !== 'string' || !book.bids || !book.asks || !book.orders) {
    return { ok: false, errors: ['INVALID_BOOK_SHAPE'] };
  }
  const transaction = transactionalBooks.get(book);
  if (transaction) {
    const index = bookIndex(book);
    for (const [id, order] of
      transaction.changedOrders) {
      if (!order || order.id !== id) {
        errors.push(`ORDER_KEY_MISMATCH:${id}`);
      } else if (
        orderIsActive(order) &&
        !index.queuedIds.has(id)
      ) {
        errors.push(`UNQUEUED_ACTIVE_ORDER:${id}`);
      } else if (
        !orderIsActive(order) &&
        index.queuedIds.has(id)
      ) {
        errors.push(`QUEUED_TERMINAL_ORDER:${id}`);
      } else if (
        orderIsActive(order) !==
        Boolean(
          index.ownerOrderIds
            .get(order.ownerId)
            ?.has(id),
        )
      ) {
        errors.push(`OWNER_INDEX_MISMATCH:${id}`);
      }
    }
    for (const [appendKey, orderIds] of
      transaction.queueAppends) {
      const separator = appendKey.indexOf(':');
      const side = appendKey.slice(0, separator);
      const priceTicks = Number(
        appendKey.slice(separator + 1),
      );
      for (const orderId of orderIds) {
        const order = transactionalOrder(book, orderId);
        if (
          !order ||
          order.side !== side ||
          order.priceTicks !== priceTicks ||
          !orderIsActive(order)
        ) {
          errors.push(`QUEUE_MISMATCH:${orderId}`);
        }
      }
    }
    const bestBid = bestPrice(book, 'buy');
    const bestAsk = bestPrice(book, 'sell');
    if (
      bestBid !== undefined &&
      bestAsk !== undefined &&
      bestBid >= bestAsk
    ) {
      errors.push('CROSSED_BOOK');
    }
    return { ok: errors.length === 0, errors };
  }

  const queuedIds = new Set();
  for (const side of ['buy', 'sell']) {
    const levels = sideLevels(book, side);
    for (const [key, queue] of Object.entries(levels)) {
      const ticks = Number(key);
      if (!isPositiveInteger(ticks) || !Array.isArray(queue) || queue.length === 0) {
        errors.push(`INVALID_LEVEL:${side}:${key}`);
        continue;
      }
      let previousSequence = -Infinity;
      for (const id of queue) {
        const order = book.orders[id];
        if (!order || order.id !== id) errors.push(`UNKNOWN_QUEUE_ID:${id}`);
        else if (orderIsActive(order)) {
          if (queuedIds.has(id)) {
            errors.push(`DUPLICATE_QUEUE_ID:${id}`);
          }
          queuedIds.add(id);
          if (order.side !== side || order.priceTicks !== ticks) errors.push(`QUEUE_MISMATCH:${id}`);
          if (!Number.isSafeInteger(order.sequence) || order.sequence < previousSequence) {
            errors.push(`QUEUE_NOT_FIFO:${side}:${key}`);
          }
          previousSequence = order.sequence;
        }
      }
    }
  }

  for (const [id, order] of Object.entries(book.orders)) {
    if (!order || order.id !== id) errors.push(`ORDER_KEY_MISMATCH:${id}`);
    else if (orderIsActive(order) && !queuedIds.has(id)) errors.push(`UNQUEUED_ACTIVE_ORDER:${id}`);
    else if (!orderIsActive(order) && queuedIds.has(id)) errors.push(`QUEUED_TERMINAL_ORDER:${id}`);
  }

  const bestBid = bestPrice(book, 'buy');
  const bestAsk = bestPrice(book, 'sell');
  if (bestBid !== undefined && bestAsk !== undefined && bestBid >= bestAsk) {
    errors.push('CROSSED_BOOK');
  }
  return { ok: errors.length === 0, errors };
}

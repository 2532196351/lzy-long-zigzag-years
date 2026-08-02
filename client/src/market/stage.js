import { deriveMarketChartSeries } from './bars.js?v=20260803-02';
import {
  deriveAdaptiveIntradayPriceDomain,
  MARKET_CLOCK_ORIGIN_OFFSET_MS,
} from './chart-domain.js?v=20260803-02';
import {
  projectMarketIntelligence,
  projectMarketQuote,
} from '../experience/market-intelligence.js?v=20260803-02';
import {
  isPublishedDerivativesProjection,
  patchStockFinancingPanel,
  renderDerivativeTerminalTask,
  renderStockFinancingPanel,
} from '../experience/derivatives-view.js?v=20260803-02';
import {
  deriveThreeAssetColumnGeometry,
  projectThreeAssetMarketColumns,
} from '../experience/market-three-asset-contract.js?v=20260803-02';

const ACTIVE_ORDER_STATUSES = new Set([
  'accepted',
  'open',
  'partially_filled',
  'resting',
]);
const SPEEDS = new Set([1, 4, 16]);
const PLAYER_ID = 'player';
const BROKER_ID = 'broker_lzy';
const LEVEL2_PRODUCT_ID = 'L2_DEPTH_100';
const PRICE_SCALE = 100;
const NATURAL_DAY_MS = 86_400_000;
const CHART_TIMEFRAMES = Object.freeze({
  ultra: Object.freeze({
    label: '超精分时',
    summary: '超精分时',
  }),
  intraday: Object.freeze({
    label: '分时',
    summary: '分时',
  }),
  '1m': Object.freeze({ label: '1分', summary: '1 分钟 K 线' }),
  '5m': Object.freeze({ label: '5分', summary: '5 分钟 K 线' }),
  '15m': Object.freeze({ label: '15分', summary: '15 分钟 K 线' }),
  '30m': Object.freeze({ label: '30分', summary: '30 分钟 K 线' }),
  '60m': Object.freeze({ label: '60分', summary: '60 分钟 K 线' }),
  '1d': Object.freeze({ label: '日K', summary: '日 K 线' }),
  '1w': Object.freeze({ label: '周K', summary: '周 K 线' }),
});
const CHART_TIMEFRAME_KEYS = new Set(Object.keys(CHART_TIMEFRAMES));

function object(value) {
  return value && typeof value === 'object' ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : fallback;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function positiveFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function positionDisplayCostTicks(position) {
  const value = object(position);
  return (
    positiveFiniteNumber(value.displayCostTicks) ??
    positiveFiniteNumber(value.breakEvenCostTicks) ??
    positiveFiniteNumber(value.averageCostTicks)
  );
}

function positionDisplayReturnBps(position) {
  const value = object(position);
  const preferred = Number(value.displayReturnBps);
  return Number.isFinite(preferred)
    ? preferred
    : finite(value.returnBps);
}

function priceTicks(value) {
  const ticks = Math.round(finite(value) * PRICE_SCALE);
  return Number.isSafeInteger(ticks) && ticks > 0 ? ticks : null;
}

function fromTicks(value) {
  return finite(value) / PRICE_SCALE;
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(finite(value));
}

function formatCompactCurrencyCents(value) {
  const cents = Number(value);
  if (!Number.isSafeInteger(cents)) return '—';
  const yuan = cents / 100;
  if (Math.abs(yuan) >= 100_000_000) {
    return `${formatNumber(yuan / 100_000_000, 2)}亿`;
  }
  if (Math.abs(yuan) >= 10_000) {
    return `${formatNumber(yuan / 10_000, 2)}万`;
  }
  return `¥${formatNumber(yuan, 2)}`;
}

function formatDuration(value) {
  const totalMs = Math.max(0, finite(value));
  if (totalMs < 1000) return '不足 1 秒';
  if (totalMs < 60_000) {
    return `${formatNumber(totalMs / 1000, totalMs < 10_000 ? 1 : 0)} 秒`;
  }
  const totalSeconds = Math.round(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${formatNumber(hours)} 时${
      minutes > 0 ? ` ${formatNumber(minutes)} 分` : ''
    }`;
  }
  return `${formatNumber(minutes)} 分${
    seconds > 0 ? ` ${formatNumber(seconds)} 秒` : ''
  }`;
}

function formatCompactQuantity(value) {
  const quantity = Math.max(0, integer(value));
  if (quantity < 1000) return String(quantity);
  if (quantity < 10_000) {
    return `${(quantity / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  if (quantity < 100_000_000) {
    const wan = Number((quantity / 10_000).toFixed(1));
    if (wan >= 10_000) return '1亿';
    return `${String(wan).replace(/\.0$/, '')}万`;
  }
  return `${(quantity / 100_000_000).toFixed(1).replace(/\.0$/, '')}亿`;
}

function formatPrice(value) {
  return formatNumber(fromTicks(value), 2);
}

function formatCompactBookPrice(value) {
  const ticks = positiveInteger(value);
  if (!ticks) return '—';
  const yuan = fromTicks(ticks);
  if (Math.abs(yuan) >= 100_000) {
    const wan = yuan / 10_000;
    return `${formatNumber(
      wan,
      Math.abs(wan) >= 100 ? 0 : 1,
    )}万`;
  }
  return formatPrice(ticks);
}

function formatMoneyFromCents(value) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 2,
  }).format(fromTicks(value));
}

function formatSignedMoneyFromCents(value) {
  const amount = finite(value);
  if (amount > 0) return `+${formatMoneyFromCents(amount)}`;
  return formatMoneyFromCents(amount);
}

function formatPercentFromBps(value) {
  return `${formatNumber(finite(value) / 100, 2)}%`;
}

function formatSignedPercentFromBps(value) {
  const amount = finite(value);
  const sign = amount > 0 ? '+' : '';
  return `${sign}${formatNumber(amount / 100, 2)}%`;
}

function signedDirection(value) {
  const amount = finite(value);
  return amount > 0 ? 'up' : amount < 0 ? 'down' : 'flat';
}

function priceDirection(value, previousClose) {
  const price = positiveInteger(value);
  const baseline = positiveInteger(previousClose);
  if (!price || !baseline) return 'unknown';
  return price > baseline ? 'up' : price < baseline ? 'down' : 'flat';
}

function setMarketDirection(node, direction) {
  if (!node) return;
  node.dataset.marketDirection = [
    'up',
    'down',
    'flat',
  ].includes(direction)
    ? direction
    : 'unknown';
}

function formatClock(value) {
  const totalMs = Math.max(0, integer(value));
  const dayMs = totalMs % NATURAL_DAY_MS;
  const totalSeconds = Math.floor(dayMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = dayMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
    2,
    '0',
  )}:${String(seconds).padStart(
    2,
    '0',
  )}.${String(milliseconds).padStart(3, '0')}`;
}

function formatInputPrice(ticks) {
  return fromTicks(ticks).toFixed(2);
}

function formatDate(calendar, tick) {
  const value = object(calendar);
  if (Number.isFinite(Number(value.year)) && Number.isFinite(Number(value.day))) {
    return `第 ${value.year} 年 · 第 ${value.day} 日`;
  }
  return Number.isFinite(Number(tick)) ? `第 ${tick + 1} 日` : '交易进行中';
}

function securityCatalog(world) {
  return object(object(world).market).securities ?? {};
}

function companyCatalog(world) {
  return object(object(world).entities).companies ?? {};
}

function legacyLevel(level) {
  const item = object(level);
  const ticks =
    positiveInteger(item.priceTicks) ??
    priceTicks(item.price) ??
    positiveInteger(item.limitPriceTicks);
  return {
    priceTicks: ticks ?? 0,
    quantity: Math.max(0, integer(item.quantity ?? item.remainingQty)),
    orderCount: Math.max(0, integer(item.orderCount, 1)),
    playerQuantity: Math.max(0, integer(item.playerQuantity)),
  };
}

function legacySymbolView(world, symbol) {
  const market = object(object(world).market);
  const security = object(object(market.securities)[symbol]);
  const book = object(object(market.orderBooks)[symbol]);
  const lastPriceTicks =
    positiveInteger(security.lastPriceTicks) ??
    priceTicks(security.lastPrice) ??
    priceTicks(security.referenceValue) ??
    PRICE_SCALE;
  const previousCloseTicks =
    positiveInteger(security.previousCloseTicks) ?? lastPriceTicks;
  const dailyLimitBps = Math.max(
    0,
    integer(security.dailyLimitBps, 1_000),
  );
  return {
    lastPriceTicks,
    previousCloseTicks,
    limitUpTicks:
      positiveInteger(security.limitUpTicks) ??
      Math.round(
        previousCloseTicks * (10_000 + dailyLimitBps) / 10_000,
      ),
    limitDownTicks:
      positiveInteger(security.limitDownTicks) ??
      Math.round(
        previousCloseTicks * (10_000 - dailyLimitBps) / 10_000,
      ),
    dailyLimitBps,
    board: security.board ?? 'main',
    bids: array(book.bids).slice(0, 5).map(legacyLevel),
    asks: array(book.asks).slice(0, 5).map(legacyLevel),
    valuation: object(security.valuation),
  };
}

function fallbackSnapshot(world) {
  const source = object(world);
  const symbols = Object.keys(securityCatalog(source));
  const player = object(source.player);
  const market = object(source.market);
  const symbolViews = Object.fromEntries(
    symbols.map((symbol) => [symbol, legacySymbolView(source, symbol)]),
  );
  const currentFrame = {
    virtualMs: 0,
    worldTick: finite(object(source.world).tick),
    tradeCount: 0,
    volume: 0,
    commitSeq: 0,
    symbols: symbolViews,
  };
  return {
    nowMs: 0,
    worldTick: finite(object(source.world).tick),
    calendar: object(object(source.world).calendar),
    commitSeq: 0,
    symbols: symbolViews,
    accounts: {
      player: {
        id: player.id ?? PLAYER_ID,
        cashCents: Math.round(finite(player.cash) * PRICE_SCALE),
        reservedCashCents: 0,
        holdings: object(player.holdings),
        reservedHoldings: {},
        drawdownBps: null,
        fundingStressBps: null,
      },
    },
    activeOrders: array(market.orders),
    trades: array(market.trades),
    quoteFrames: symbols.length ? [currentFrame] : [],
    capacity: {},
    agentEcology: { agents: {}, recentActivity: [] },
    marketData: object(market.marketData ?? source.marketData),
  };
}

function bookOrders(book) {
  return Object.values(object(object(book).orders));
}

function canonicalDepth(book, side) {
  const orders = bookOrders(book).filter(
    (order) =>
      order.side === side &&
      ACTIVE_ORDER_STATUSES.has(order.status) &&
      finite(order.remainingQty) > 0,
  );
  const totals = new Map();
  for (const order of orders) {
    const ticks = positiveInteger(order.priceTicks);
    if (!ticks) continue;
    const current = totals.get(ticks) ?? {
      quantity: 0,
      orderCount: 0,
      playerQuantity: 0,
    };
    current.quantity += Math.max(0, integer(order.remainingQty));
    current.orderCount += 1;
    if (order.ownerId === PLAYER_ID) {
      current.playerQuantity += Math.max(0, integer(order.remainingQty));
    }
    totals.set(ticks, current);
  }
  return [...totals.entries()]
    .sort(([left], [right]) => (side === 'buy' ? right - left : left - right))
    .slice(0, 10)
    .map(([ticks, total]) => ({ priceTicks: ticks, ...total }));
}

function canonicalSnapshot(value) {
  const state = object(value);
  const sourceWorld = object(state.world);
  const symbols = Object.keys(object(state.books));
  return {
    nowMs: integer(state.nowMs),
    worldTick: finite(object(sourceWorld.world).tick),
    calendar: object(object(sourceWorld.world).calendar),
    commitSeq: integer(state.commitSeq),
    symbols: Object.fromEntries(
      symbols.map((symbol) => {
        const security = object(securityCatalog(sourceWorld)[symbol]);
        const lastPriceTicks =
          positiveInteger(security.lastPriceTicks) ??
          priceTicks(security.lastPrice) ??
          PRICE_SCALE;
        const previousCloseTicks =
          positiveInteger(security.previousCloseTicks) ??
          lastPriceTicks;
        const dailyLimitBps = Math.max(
          0,
          integer(security.dailyLimitBps, 1_000),
        );
        return [
          symbol,
          {
            lastPriceTicks,
            previousCloseTicks,
            limitUpTicks:
              positiveInteger(security.limitUpTicks) ??
              Math.round(
                previousCloseTicks *
                  (10_000 + dailyLimitBps) /
                  10_000,
              ),
            limitDownTicks:
              positiveInteger(security.limitDownTicks) ??
              Math.round(
                previousCloseTicks *
                  (10_000 - dailyLimitBps) /
                  10_000,
              ),
            dailyLimitBps,
            board: security.board ?? 'main',
            bids: canonicalDepth(state.books[symbol], 'buy'),
            asks: canonicalDepth(state.books[symbol], 'sell'),
            valuation: object(security.valuation),
          },
        ];
      }),
    ),
    accounts: object(state.accounts),
    activeOrders: symbols.flatMap((symbol) => bookOrders(state.books[symbol])),
    trades: array(object(sourceWorld.market).trades),
    quoteFrames: array(state.quoteFrames),
    capacity: object(state.capacity),
    agentEcology: object(state.agentEcology),
    marketData: object(
      state.marketData ??
        sourceWorld.marketData ??
        object(sourceWorld.market).marketData,
    ),
  };
}

function unwrapPayload(payload) {
  const value = object(payload);
  const wrapped = value.marketSnapshot ?? value.snapshot ?? null;
  const candidate = object(wrapped ?? value);
  if (
    candidate.symbols &&
    candidate.accounts &&
    Array.isArray(candidate.activeOrders) &&
    Array.isArray(candidate.trades) &&
    Array.isArray(candidate.quoteFrames)
  ) {
    return candidate;
  }
  if (candidate.books && candidate.accounts && candidate.world) {
    return canonicalSnapshot(candidate);
  }
  return null;
}

function symbolList(snapshot, world) {
  const combined = new Set([
    ...Object.keys(object(snapshot.symbols)),
    ...Object.keys(securityCatalog(world)),
  ]);
  return [...combined];
}

function selectedSymbol(current, requested, snapshot, world) {
  const symbols = symbolList(snapshot, world);
  if (symbols.includes(current)) return current;
  if (symbols.includes(requested)) return requested;
  return symbols[0] ?? '';
}

function symbolMeta(world, symbol) {
  const security = object(securityCatalog(world)[symbol]);
  const company = object(companyCatalog(world)[security.issuerId]);
  return {
    symbol,
    name: security.name ?? company.shortName ?? company.name ?? '证券',
    role: [
      company.industry ??
        security.industry ??
        company.role ??
        '所属行业',
      company.lifecycle ?? security.lifecycle,
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

function currentView(snapshot, symbol) {
  return object(object(snapshot.symbols)[symbol]);
}

function marketDataEntitlement(snapshot) {
  const marketData = object(object(snapshot).marketData);
  const viewer = object(marketData.viewer);
  const entitlements = object(viewer.entitlements);
  const record = object(entitlements[LEVEL2_PRODUCT_ID]);
  const shorthand = viewer.entitlement;
  const status =
    (typeof shorthand === 'string' ? shorthand : object(shorthand).status) ??
    record.status ??
    'locked';
  const product = object(object(marketData.products)[LEVEL2_PRODUCT_ID]);
  const declared =
    Object.hasOwn(entitlements, LEVEL2_PRODUCT_ID) ||
    shorthand !== undefined ||
    Object.hasOwn(object(marketData.products), LEVEL2_PRODUCT_ID);
  return {
    status,
    active: status === 'active',
    eligible: Boolean(record.eligible ?? viewer.eligible ?? true),
    supported: declared && product.supported !== false,
    costCents: Math.max(0, integer(product.costCents)),
    expiresAtTick:
      positiveInteger(record.expiresAtTick) ??
      positiveInteger(viewer.expiresAtTick),
  };
}

function activePlayerOrders(snapshot) {
  return array(snapshot.activeOrders).filter(
    (order) =>
      order.ownerId === PLAYER_ID &&
      ACTIVE_ORDER_STATUSES.has(order.status) &&
      finite(order.remainingQty) > 0,
  );
}

function currentTrades(snapshot, symbol) {
  return array(snapshot.trades)
    .filter(
      (trade) =>
        trade.symbol === symbol &&
        (!trade.source || trade.source === 'realtime_order_book'),
    )
    .sort(
      (left, right) =>
        finite(right.virtualMs) - finite(left.virtualMs) ||
        String(right.id).localeCompare(String(left.id)),
    );
}

function tradePriceTicks(trade) {
  return (
    positiveInteger(trade.priceTicks) ??
    priceTicks(trade.price) ??
    positiveInteger(trade.limitPriceTicks) ??
    0
  );
}

function chartEntries(series) {
  const value = object(series);
  if (value.kind === 'candles') {
    const intervalMs = Math.max(1, integer(value.intervalMs, 1));
    return array(value.bars)
      .map((bar) => {
        const item = object(bar);
        const open = positiveInteger(item.openTicks);
        const high = positiveInteger(item.highTicks);
        const low = positiveInteger(item.lowTicks);
        const close = positiveInteger(item.closeTicks);
        if (!open || !high || !low || !close) return null;
        return {
          key: `bar:${finite(item.startMs)}`,
          startMs: finite(item.startMs),
          virtualMs:
            finite(item.startMs) + Math.floor(intervalMs / 2),
          open,
          high,
          low,
          close,
          volume: Math.max(0, integer(item.volume)),
          tradeCount: Math.max(0, integer(item.tradeCount)),
          hasTrade: integer(item.tradeCount) > 0,
          movingAverages: object(item.movingAverages),
        };
      })
      .filter(Boolean);
  }
  return array(value.points)
    .map((point, index) => {
      const item = object(point);
      const price = positiveInteger(item.priceTicks);
      if (!price) return null;
      return {
        key:
          item.firstTradeId ??
          item.lastTradeId ??
          `point:${finite(item.timeMs)}:${index}`,
        virtualMs: finite(item.timeMs),
        open: price,
        high: price,
        low: price,
        close: price,
        volume: Math.max(0, integer(item.volume)),
        tradeCount: Math.max(0, integer(item.tradeCount)),
        hasTrade: Boolean(item.hasTrade),
        averagePriceTicks: positiveInteger(item.averagePriceTicks),
      };
    })
    .filter(Boolean);
}

/**
 * Produces a display-only M4 projection for a dense ultra-intraday line.
 * Authority points stay untouched. Each occupied CSS pixel retains its first,
 * high, low and last observation in source order, while volume is conserved in
 * one drawable column.
 */
export function projectUltraPointsForCanvas(
  points,
  {
    domainStartMs,
    domainEndMs,
    left,
    right,
  },
) {
  if (!Array.isArray(points)) {
    throw new TypeError('points must be an array');
  }
  const startMs = finite(domainStartMs, Number.NaN);
  const endMs = finite(domainEndMs, Number.NaN);
  const firstPixel = Math.ceil(finite(left, Number.NaN));
  const lastPixel = Math.floor(finite(right, Number.NaN));
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs ||
    !Number.isSafeInteger(firstPixel) ||
    !Number.isSafeInteger(lastPixel) ||
    lastPixel < firstPixel
  ) {
    throw new RangeError('invalid ultra canvas projection domain');
  }
  const pixelCount = lastPixel - firstPixel + 1;
  const domainSpan = endMs - startMs;
  const byPixel = new Map();
  for (const [sourceIndex, point] of points.entries()) {
    const virtualMs = finite(point?.virtualMs, Number.NaN);
    const close = positiveInteger(point?.close);
    if (
      !Number.isFinite(virtualMs) ||
      virtualMs <= startMs ||
      virtualMs > endMs ||
      !close
    ) {
      continue;
    }
    const offset = Math.max(
      0,
      Math.min(
        pixelCount - 1,
        Math.floor(
          ((virtualMs - startMs) / domainSpan) * pixelCount,
        ),
      ),
    );
    const pixelX = firstPixel + offset;
    const vertex = {
      ...point,
      virtualMs,
      close,
      sourceIndex,
      pixelX,
    };
    let column = byPixel.get(pixelX);
    if (!column) {
      column = {
        pixelX,
        first: vertex,
        high: vertex,
        low: vertex,
        last: vertex,
        volume: 0,
        tradeCount: 0,
      };
      byPixel.set(pixelX, column);
    } else {
      column.last = vertex;
      if (vertex.close > column.high.close) column.high = vertex;
      if (vertex.close < column.low.close) column.low = vertex;
    }
    column.volume += Math.max(0, integer(point.volume));
    column.tradeCount += Math.max(0, integer(point.tradeCount));
  }
  const columns = [...byPixel.values()].map((column) => {
    const uniqueBySource = new Map(
      [
        column.first,
        column.high,
        column.low,
        column.last,
      ].map((point) => [point.sourceIndex, point]),
    );
    return {
      ...column,
      linePoints: [...uniqueBySource.values()].sort(
        (leftPoint, rightPoint) =>
          leftPoint.sourceIndex - rightPoint.sourceIndex,
      ),
    };
  });
  return {
    columns,
    linePoints: columns.flatMap((column) => column.linePoints),
    volumeColumns: columns.map((column) => ({
      pixelX: column.pixelX,
      virtualMs: column.last.virtualMs,
      close: column.last.close,
      previousClose: column.first.close,
      volume: column.volume,
      tradeCount: column.tradeCount,
    })),
  };
}

function chartAxisLabel(value, intervalMs, includeDay = false) {
  const timestampMs = integer(value);
  const day = Math.floor(timestampMs / NATURAL_DAY_MS) + 1;
  if (intervalMs >= NATURAL_DAY_MS) return `第${day}日`;
  const clockMs =
    ((timestampMs % NATURAL_DAY_MS) + NATURAL_DAY_MS) %
    NATURAL_DAY_MS;
  const clock = formatClock(clockMs);
  const time =
    intervalMs && intervalMs < 60_000 ? clock.slice(0, 8) : clock.slice(0, 5);
  return includeDay ? `第${day}日 ${time}` : time;
}

function clientCapabilities(client) {
  const value = object(client);
  const worldCommand = typeof value.worldCommand === 'function';
  return {
    play: typeof value.play === 'function',
    pause: typeof value.pause === 'function',
    step: typeof value.stepFrame === 'function',
    speed: typeof value.setSpeed === 'function',
    submit: worldCommand,
    cancel: worldCommand,
  };
}

function marketKindSwitchMarkup(modifier = '') {
  return `
    <nav class="lzy-stage__market-kind-switch ${modifier}"
      aria-label="交易市场">
      <button type="button" data-stage-market-kind="stocks"
        aria-pressed="true">股票</button>
      <button type="button" data-stage-market-kind="futures"
        aria-pressed="false">期货</button>
      <button type="button" data-stage-market-kind="options"
        aria-pressed="false">期权</button>
    </nav>
  `;
}

function roleConsoleMarkup(
  world,
  { derivativeMode = false } = {},
) {
  const roleType = object(world).player?.roleType;
  if (roleType === 'quant_institution') {
    return `
      <section class="lzy-stage__panel lzy-stage__role-console"
        data-stage-role-console data-stage-panel="role"
        data-role-console="quant" data-testid="quant-market-console">
        <div class="lzy-stage__role-console-heading">
          <div>
            <span class="lzy-stage__eyebrow">量化策略控制</span>
            <h3>自动交易组合</h3>
          </div>
          <span class="lzy-stage__badge" data-stage-role-status>待同步</span>
        </div>
        <p data-stage-role-summary>正在读取策略组合与实盘决策状态。</p>
        <dl class="lzy-stage__role-console-metrics">
          <div><dt>策略</dt><dd data-stage-role-strategies>—</dd></div>
          <div><dt>决策</dt><dd data-stage-role-decisions>—</dd></div>
          <div><dt>成交量</dt><dd data-stage-role-filled>—</dd></div>
        </dl>
        <div class="lzy-stage__role-console-actions">
          <button type="button" data-stage-role-toggle aria-pressed="true">
            暂停自动交易
          </button>
          <button type="button" data-stage-role-open>策略研究室</button>
        </div>
      </section>`;
  }
  if (roleType === 'stabilization_fund') {
    return `
      <section class="lzy-stage__panel lzy-stage__role-console"
        data-stage-role-console data-stage-panel="role"
        data-role-console="stabilization"
        data-testid="stabilization-market-console">
        <div class="lzy-stage__role-console-heading">
          <div>
            <span class="lzy-stage__eyebrow">市场稳定控制</span>
            <h3>自动协议与人工干预</h3>
          </div>
          <span class="lzy-stage__badge" data-stage-role-status>待同步</span>
        </div>
        <p data-stage-role-summary>正在读取市场压力和稳定协议状态。</p>
        <dl class="lzy-stage__role-console-metrics">
          <div><dt>目标</dt><dd data-stage-role-strategies>—</dd></div>
          <div><dt>决策</dt><dd data-stage-role-decisions>—</dd></div>
          <div><dt>介入量</dt><dd data-stage-role-filled>—</dd></div>
        </dl>
        <div class="lzy-stage__role-console-actions">
          <button type="button" data-stage-role-toggle aria-pressed="true">
            暂停自动稳定
          </button>
          <button type="button"
            ${
              derivativeMode
                ? 'data-stage-role-manual-stock'
                : 'data-stage-open-ticket="buy"'
            }
            data-testid="stabilization-stage-manual-entry">${
              derivativeMode ? '转到股票手动进场' : '手动进场'
            }</button>
          <button type="button" data-stage-role-open>协议控制台</button>
        </div>
      </section>`;
  }
  return '';
}

function roleMobileDockMarkup(world) {
  const roleType = object(world).player?.roleType;
  if (roleType === 'quant_institution') {
    return '<button type="button" data-stage-open-role-drawer>策略</button>';
  }
  if (roleType === 'stabilization_fund') {
    return '<button type="button" data-stage-open-role-drawer>稳定</button>';
  }
  return '';
}

function stageMarkup(reducedMotion, world) {
  return `
    <section class="lzy-market-stage" data-testid="market-stage"
      data-reduced-motion="${reducedMotion ? 'true' : 'false'}"
      data-playing="false" aria-labelledby="lzy-stage-title">
      <a class="lzy-stage__skip" href="#lzy-stage-ticket">跳到下单</a>

      <header class="lzy-stage__topbar">
        <div class="lzy-stage__brand">
          <span class="lzy-stage__eyebrow">LZY / 历·择·衍</span>
          <h2 id="lzy-stage-title">实时行情</h2>
          <span data-stage-node="world-date">交易进行中</span>
        </div>
        <div class="lzy-stage__clock" aria-label="市场时钟">
          <strong data-stage-node="clock">00:00.000</strong>
          <span>3 秒行情 · 毫秒级撮合</span>
          <span data-stage-node="run-state">连接中</span>
          <span data-stage-node="commit" hidden>序号 —</span>
        </div>
        <div class="lzy-stage__playback" role="group" aria-label="市场播放控制">
          <button type="button" data-stage-command="toggle"
            data-stage-node="desktop-run-toggle" aria-label="播放市场"
            aria-keyshortcuts="Space">
            <span data-stage-node="desktop-run-icon" aria-hidden="true">▶</span>
            <span data-stage-node="desktop-run-label">播放</span>
          </button>
          <button type="button" data-stage-command="step" aria-keyshortcuts=".">
            <span aria-hidden="true">›</span> 单步一帧
          </button>
          <label class="lzy-stage__speed">
            <span>倍速</span>
            <select data-stage-node="desktop-speed-select"
              aria-label="市场倍速">
              <option value="1">1×</option>
              <option value="4">4×</option>
              <option value="16">16×</option>
            </select>
          </label>
          <span class="lzy-stage__connection" data-stage-node="connection">
            市场待连接
          </span>
        </div>
        <nav class="lzy-stage__mobile-utility-nav"
          aria-label="移动市场工具">
          <label>
            <span>标的</span>
            <select data-stage-node="mobile-symbol-select"
              aria-label="切换股票"></select>
          </label>
          <button type="button" data-stage-command="toggle"
            data-stage-node="mobile-run-toggle" aria-label="播放市场">
            <span data-stage-node="mobile-run-icon" aria-hidden="true">▶</span>
            <span data-stage-node="mobile-run-label">播放</span>
          </button>
          <label class="lzy-stage__mobile-speed">
            <span aria-hidden="true">倍速</span>
            <select data-stage-node="mobile-speed-select"
              aria-label="市场倍速">
              <option value="1">1×</option>
              <option value="4">4×</option>
              <option value="16">16×</option>
            </select>
          </label>
        </nav>
      </header>

      <div class="lzy-stage__grid">
        <aside class="lzy-stage__panel lzy-stage__symbols" data-stage-panel="symbols"
          aria-labelledby="lzy-stage-symbols-title">
          ${marketKindSwitchMarkup(
            'lzy-stage__market-kind-switch--rail',
          )}
          <div class="lzy-stage__panel-heading">
            <div>
              <span class="lzy-stage__eyebrow">股票</span>
              <h3 id="lzy-stage-symbols-title">产业观察席</h3>
            </div>
            <span class="lzy-stage__badge">离线</span>
          </div>
          <div class="lzy-stage__symbol-list" data-stage-node="symbol-list"></div>
          <div class="lzy-stage__identity">
            <span>当前身份</span>
            <strong data-stage-node="identity">未载入</strong>
            <small data-stage-node="profile">只读观察</small>
          </div>
        </aside>

        <div class="lzy-stage__center">
          <nav class="lzy-stage__mobile-task-nav" aria-label="市场导航">
            <button type="button" data-stage-mobile-task="market"
              aria-current="page">行情</button>
            <button type="button" data-stage-mobile-task="trades">逐笔</button>
            <button type="button" data-stage-mobile-task="orders">委托</button>
            <button type="button" data-stage-mobile-task="funds">资金</button>
            <button type="button" data-stage-mobile-task="info">简况</button>
          </nav>
          <section class="lzy-stage__panel lzy-stage__quote-summary"
            data-stage-node="quote-summary"
            aria-labelledby="lzy-stage-chart-title">
            <div class="lzy-stage__panel-heading">
              <div class="lzy-stage__quote-identity"
                data-stage-quote-identity>
                <span class="lzy-stage__eyebrow">成交走势</span>
                <h3 id="lzy-stage-chart-title">
                  <span data-stage-node="chart-symbol">—</span>
                  <span data-stage-node="chart-name">证券</span>
                </h3>
                <div class="lzy-stage__last">
                  <strong data-stage-node="last-price">—</strong>
                  <small data-stage-node="price-change">等待行情帧</small>
                </div>
              </div>
              <dl class="lzy-stage__valuation-strip"
                data-stage-node="quote-metrics"
                aria-label="当前证券行情与估值摘要">
                <div><dt>今开</dt><dd data-stage-node="session-open">—</dd></div>
                <div><dt>最高</dt><dd data-stage-node="session-high">—</dd></div>
                <div><dt>最低</dt><dd data-stage-node="session-low">—</dd></div>
                <div><dt>昨收</dt><dd data-stage-node="previous-close">—</dd></div>
                <div><dt>量比</dt><dd data-stage-node="volume-ratio">—</dd></div>
                <div><dt>换手率</dt><dd data-stage-node="turnover-rate">—</dd></div>
                <div><dt>成交量</dt><dd data-stage-node="session-volume">—</dd></div>
                <div><dt>成交额</dt><dd data-stage-node="session-turnover">—</dd></div>
                <div><dt>最新</dt><dd data-stage-node="latest-event">—</dd></div>
                <div><dt>行情</dt><dd data-stage-node="market-data-tier">—</dd></div>
                <div><dt>市盈</dt><dd data-stage-node="valuation-pe">—</dd></div>
                <div><dt>市净</dt><dd data-stage-node="valuation-pb">—</dd></div>
                <div><dt>总市值</dt><dd data-stage-node="total-market-cap">—</dd></div>
                <div><dt>流通市值</dt><dd data-stage-node="float-market-cap">—</dd></div>
                <div class="lzy-stage__metric-cluster"
                  data-stage-node="quote-metrics-expanded">
                  <div><dt>每股收益</dt><dd data-stage-node="valuation-eps">—</dd></div>
                  <div><dt>估值区间</dt><dd data-stage-node="valuation-range">—</dd></div>
                  <div><dt>财务截至</dt><dd data-stage-node="valuation-asof">—</dd></div>
                </div>
              </dl>
              ${marketKindSwitchMarkup(
                'lzy-stage__market-kind-switch--compact',
              )}
            </div>
          </section>
          <section class="lzy-stage__panel lzy-stage__chart-panel"
            data-stage-panel="chart" aria-labelledby="lzy-stage-chart-title">
            <div class="lzy-stage__chart-tools" role="group" aria-label="图表模式">
              <select class="lzy-stage__chart-mode"
                data-stage-node="chart-mode-select"
                aria-label="图表周期">
                <option value="ultra">超精分时</option>
                <option value="intraday" selected>分时</option>
                <option value="1m">1分</option>
                <option value="5m">5分</option>
                <option value="15m">15分</option>
                <option value="30m">30分</option>
                <option value="60m">60分</option>
                <option value="1d">日K</option>
                <option value="1w">周K</option>
              </select>
              <span class="lzy-stage__chart-overlay-label"
                data-stage-node="intraday-average-label">均价线</span>
              <label class="lzy-stage__moving-average-control"
                data-stage-node="moving-average-control">
                <span>均线</span>
                <select data-stage-node="moving-average-period"
                  aria-label="均线周期">
                  <option value="5" selected>MA5</option>
                  <option value="10">MA10</option>
                  <option value="20">MA20</option>
                  <option value="60">MA60</option>
                </select>
              </label>
              <span data-stage-node="chart-unit">价格：元 · 成交量：股</span>
            </div>
            <div class="lzy-stage__canvas-wrap">
              <canvas data-stage-node="chart" data-stage-time-domain="等待行情"
                data-stage-x-layout="fixed-aligned-window"
                data-stage-timeframe="intraday" role="img"
                aria-labelledby="lzy-stage-chart-title"
                aria-describedby="lzy-stage-chart-summary"></canvas>
              <span class="lzy-stage__scan" aria-hidden="true"></span>
            </div>
            <p id="lzy-stage-chart-summary" class="lzy-stage__chart-summary"
              data-stage-node="chart-summary">
              暂无行情。
            </p>
            <details class="lzy-stage__chart-data"
              data-stage-node="chart-data-detail">
              <summary data-stage-node="chart-data-summary">图表数据表（分时）</summary>
              <div class="lzy-stage__table-wrap" tabindex="0">
                <table>
                  <caption data-stage-node="chart-data-caption">当前证券可见分时端点的价格与成交量</caption>
                  <thead>
                    <tr><th>时间</th><th>开</th><th>高</th><th>低</th><th>收</th><th>成交量</th></tr>
                  </thead>
                  <tbody data-stage-node="chart-data-body"></tbody>
                </table>
              </div>
            </details>
            <dl class="lzy-stage__mobile-status" aria-label="账户与订单状态">
              <div><dt>可用</dt><dd data-stage-node="mobile-cash">—</dd></div>
              <div><dt>持仓</dt><dd data-stage-node="mobile-holding">—</dd></div>
              <div><dt>委托</dt><dd data-stage-node="mobile-active-count">—</dd></div>
            </dl>
          </section>

          <section class="lzy-stage__panel lzy-stage__depth-panel"
            data-stage-panel="depth" aria-labelledby="lzy-stage-depth-title">
            <div class="lzy-stage__panel-heading">
              <div>
                <span class="lzy-stage__eyebrow">累计深度</span>
                <h3 id="lzy-stage-depth-title">买卖资源与限价位置</h3>
              </div>
              <span class="lzy-stage__badge" data-stage-node="spread">价差 —</span>
            </div>
            <figure class="lzy-stage__depth-figure">
              <svg data-stage-node="depth" viewBox="0 0 1000 240" role="img"
                aria-labelledby="lzy-stage-depth-title lzy-stage-depth-summary"
                preserveAspectRatio="none">
                <path class="lzy-stage__depth-area lzy-stage__depth-area--bid"
                  data-stage-depth-path="bid" d="" />
                <path class="lzy-stage__depth-area lzy-stage__depth-area--ask"
                  data-stage-depth-path="ask" d="" />
                <line class="lzy-stage__limit-line" data-stage-node="limit-line"
                  x1="500" x2="500" y1="18" y2="218" />
                <circle class="lzy-stage__risk-ring" data-stage-node="risk-ring"
                  cx="500" cy="118" r="42" pathLength="100" />
              </svg>
              <figcaption id="lzy-stage-depth-summary" data-stage-node="depth-summary">
                盘口深度尚未发布。
              </figcaption>
            </figure>
          </section>

          <section class="lzy-stage__panel lzy-stage__book-panel"
            data-stage-panel="book" aria-labelledby="lzy-stage-book-title">
            <div class="lzy-stage__panel-heading">
              <div>
                <span class="lzy-stage__eyebrow">盘口</span>
                <h3 id="lzy-stage-book-title">五档盘口</h3>
              </div>
              <div class="lzy-stage__trade-actions" role="group" aria-label="快速交易">
                <button type="button" data-stage-open-ticket="buy">买入</button>
                <button type="button" data-stage-open-ticket="sell">卖出</button>
              </div>
            </div>
            <div class="lzy-stage__table-wrap" tabindex="0">
              <table class="lzy-stage__book-table">
                <caption>五档盘口价量；缺档以“—”表示</caption>
                <colgroup>
                  <col class="lzy-stage__book-col-side" />
                  <col class="lzy-stage__book-col-price" />
                  <col class="lzy-stage__book-col-quantity" />
                  <col class="lzy-stage__book-col-count" />
                </colgroup>
                <thead>
                  <tr>
                    <th>方向</th>
                    <th title="价格（元）">价格</th>
                    <th title="数量（股）">数量</th>
                    <th>订单数</th>
                  </tr>
                </thead>
                <tbody data-stage-node="book-body"></tbody>
              </table>
            </div>
            <button class="lzy-stage__depth-compact-toggle" type="button"
              data-stage-depth-toggle aria-controls="lzy-stage-depth-detail"
              aria-expanded="false">十档</button>
            <details id="lzy-stage-depth-detail" class="lzy-stage__depth-detail"
              data-stage-node="depth-detail">
              <summary>盘口详情</summary>
              <div class="lzy-stage__depth-controls"
                data-stage-depth-mode="ten">
                <label>
                  <span>可见深度</span>
                  <select data-stage-node="depth-mode-select"
                    aria-label="盘口可见深度">
                    <option value="ten">十档</option>
                    <option value="level2">深度100</option>
                  </select>
                </label>
                <span class="lzy-stage__level2-status"
                  data-stage-node="level2-status">百档行情状态待同步</span>
                <button type="button" data-stage-activate-level2 hidden>
                  开通
                </button>
              </div>
              <div class="lzy-stage__table-wrap" tabindex="0">
                <table>
                  <caption data-stage-node="depth-detail-caption">
                    十档盘口；暂无挂单的档位以“—”表示
                  </caption>
                  <thead><tr><th>方向</th><th>档位</th><th>价格（元）</th><th>数量（股）</th><th>订单数</th></tr></thead>
                  <tbody data-stage-node="depth-detail-body"></tbody>
                </table>
              </div>
            </details>
          </section>
        </div>

        <section class="lzy-stage__flow-strip" data-stage-panel="flow"
          aria-label="当前证券近一分钟成交与盘口概览">
          <div class="lzy-stage__flow-heading">
            <strong>近 1 分钟成交</strong>
            <span data-stage-node="flow-trades">0 笔 · 0 股</span>
          </div>
          <div class="lzy-stage__flow-bar" aria-hidden="true">
            <span data-stage-node="flow-buy-bar"></span>
            <span data-stage-node="flow-sell-bar"></span>
          </div>
          <dl class="lzy-stage__flow-metrics">
            <div><dt>主动买</dt><dd data-stage-node="flow-buy-volume">0 股</dd></div>
            <div><dt>主动卖</dt><dd data-stage-node="flow-sell-volume">0 股</dd></div>
            <div><dt>价差</dt><dd data-stage-node="flow-spread">—</dd></div>
            <div><dt>买/卖深度</dt><dd data-stage-node="flow-depth">—</dd></div>
          </dl>
        </section>

        <button class="lzy-stage__drawer-toggle" type="button"
          data-stage-node="drawer-toggle" data-stage-drawer-toggle
          aria-controls="lzy-stage-drawer-panels" aria-expanded="false">
          <span data-stage-node="drawer-label">打开订单与风险</span>
          <span aria-hidden="true">⌃</span>
        </button>
        <div class="lzy-stage__mobile-trade-dock" aria-label="固定交易入口"
          data-role-dock="${
            ['quant_institution', 'stabilization_fund'].includes(
              object(world).player?.roleType,
            ) ? 'true' : 'false'
          }">
          ${roleMobileDockMarkup(world)}
          <button type="button" data-stage-open-ticket="buy">买入</button>
          <button type="button" data-stage-open-ticket="sell">卖出</button>
        </div>

        <aside class="lzy-stage__right" data-stage-node="right-drawer"
          data-drawer-open="false">
          <button class="lzy-stage__drawer-close" type="button"
            data-stage-drawer-close aria-label="关闭订单与风险面板">×</button>
          <div id="lzy-stage-drawer-panels" class="lzy-stage__drawer-panels">
          ${roleConsoleMarkup(world)}
          <section class="lzy-stage__panel lzy-stage__ticket-panel"
            data-stage-panel="ticket" aria-labelledby="lzy-stage-ticket-title">
            <div class="lzy-stage__panel-heading">
              <div>
                <span class="lzy-stage__eyebrow">交易</span>
                <h3 id="lzy-stage-ticket-title"
                  data-stage-node="ticket-title">买入委托</h3>
              </div>
              <span class="lzy-stage__badge">限价 / 市价</span>
            </div>
            <form id="lzy-stage-ticket" class="lzy-stage__ticket"
              data-trade-side="buy" data-order-type="limit">
              <div class="lzy-stage__ticket-meta">
                <div class="lzy-stage__field">
                  <span class="lzy-stage__field-label">当前标的</span>
                  <output class="lzy-stage__symbol-output"
                    data-stage-node="order-symbol">—</output>
                </div>
                <div class="lzy-stage__field">
                  <label for="lzy-stage-order-type">订单类型</label>
                  <select id="lzy-stage-order-type" name="orderType"
                    data-stage-node="order-type-input">
                    <option value="limit">限价</option>
                    <option value="market">市价</option>
                  </select>
                </div>
              </div>
              <fieldset class="lzy-stage__side">
                <legend>方向</legend>
                <label>
                  <input type="radio" name="side" value="buy" checked />
                  <span>买入</span>
                </label>
                <label>
                  <input type="radio" name="side" value="sell" aria-label="卖出" />
                  <span>卖出</span>
                </label>
              </fieldset>
              <div class="lzy-stage__ticket-grid">
                <div class="lzy-stage__field">
                  <label for="lzy-stage-limit">限价（元）</label>
                  <div class="lzy-stage__price-control">
                    <button type="button" data-stage-price-step="-1" aria-label="价格减一档">−</button>
                    <input id="lzy-stage-limit" name="limitPrice" type="number"
                      min="0.01" step="0.01" inputmode="decimal" required
                      data-stage-node="limit-input" />
                    <button type="button" data-stage-price-step="1" aria-label="价格加一档">+</button>
                  </div>
                </div>
                <div class="lzy-stage__field lzy-stage__quantity-field">
                  <label for="lzy-stage-quantity">数量（股）</label>
                  <input id="lzy-stage-quantity" name="quantity" type="number"
                    min="1" step="1" inputmode="numeric" value="100" required
                    data-stage-node="quantity-input" />
                </div>
              </div>
              <div class="lzy-stage__quantity-presets"
                data-stage-node="quantity-presets"
                role="group" aria-label="快捷数量">
                <button type="button" data-stage-quantity-preset="all">全仓</button>
                <button type="button" data-stage-quantity-preset="half">1/2仓</button>
                <button type="button" data-stage-quantity-preset="third">1/3仓</button>
                <button type="button" data-stage-quantity-preset="1000">1000股</button>
                <button type="button" data-stage-quantity-preset="100">100股</button>
              </div>
              <div class="lzy-stage__field lzy-stage__tif-field">
                <label for="lzy-stage-tif">有效期</label>
                <select id="lzy-stage-tif" name="tif">
                  <option value="GTC">撤销前有效</option>
                  <option value="IOC">立即成交，余量撤销</option>
                </select>
              </div>
              <div class="lzy-stage__impact" data-stage-node="impact-preview">
                等待盘口以估算可成交量与锁定资源。
              </div>
              <button class="lzy-stage__primary" type="submit"
                data-stage-node="submit-order">
                提交限价订单
              </button>
            </form>
            <div class="lzy-stage__receipt" data-stage-node="receipt"
              data-status="idle" tabindex="-1">
              <strong>暂无成交回报</strong>
              <span>成交、挂单和撤单结果会显示在这里。</span>
            </div>
          </section>

          <section class="lzy-stage__panel lzy-stage__risk-panel"
            data-stage-panel="risk" aria-labelledby="lzy-stage-risk-title">
            <div class="lzy-stage__panel-heading">
              <div>
                <span class="lzy-stage__eyebrow">资金与容量</span>
                <h3 id="lzy-stage-risk-title">账户与持仓</h3>
              </div>
            </div>
            <section class="lzy-stage__funds-portfolio"
              data-stage-node="funds-portfolio"
              data-authority-path="accounts.player.portfolio"
              aria-label="证券组合">
              <dl class="lzy-stage__funds-summary">
                <div>
                  <dt>总盈亏</dt>
                  <dd data-stage-node="funds-total-pnl">—</dd>
                </div>
                <div>
                  <dt>当日盈亏</dt>
                  <dd data-stage-node="funds-day-pnl">—</dd>
                </div>
                <div>
                  <dt>持仓市值</dt>
                  <dd data-stage-node="funds-market-value">—</dd>
                </div>
              </dl>
              <div class="lzy-stage__table-wrap">
                <table class="lzy-stage__funds-table">
                  <caption>持仓成本、现价与收益率</caption>
                  <thead>
                    <tr><th>证券</th><th>持仓</th><th>成本</th><th>现价</th><th>收益率</th></tr>
                  </thead>
                  <tbody data-stage-node="funds-position-body"></tbody>
                </table>
              </div>
              <p class="lzy-stage__funds-status"
                data-stage-node="funds-status"></p>
            </section>
            <dl class="lzy-stage__metrics">
              <div><dt>可用现金</dt><dd data-stage-node="available-cash">—</dd></div>
              <div><dt>锁定现金</dt><dd data-stage-node="reserved-cash">—</dd></div>
              <div><dt>可用持仓</dt><dd data-stage-node="available-holding">—</dd></div>
              <div><dt>锁定持仓</dt><dd data-stage-node="reserved-holding">—</dd></div>
              <div><dt>盘口足迹</dt><dd data-stage-node="footprint">待连接</dd></div>
              <div><dt>滑点</dt><dd data-stage-node="slippage">待连接</dd></div>
              <div><dt>回撤</dt><dd data-stage-node="drawdown">待连接</dd></div>
              <div><dt>资金压力</dt><dd data-stage-node="funding-stress">待连接</dd></div>
              <div><dt>预计完成</dt><dd data-stage-node="completion-time">待连接</dd></div>
              <div><dt>未成交</dt><dd data-stage-node="active-count">0</dd></div>
            </dl>
            <p class="lzy-stage__boundary">
              大额成交会受到盘口容量、滑点与资金压力影响。
            </p>
          </section>
          </div>
        </aside>

        <section class="lzy-stage__bottom">
          <section class="lzy-stage__panel" data-stage-panel="trades"
            aria-labelledby="lzy-stage-trades-title">
            <div class="lzy-stage__panel-heading">
              <div>
                <span class="lzy-stage__eyebrow">成交</span>
                <h3 id="lzy-stage-trades-title">逐笔成交</h3>
              </div>
            </div>
            <div class="lzy-stage__table-wrap" tabindex="0">
              <table>
                <caption>当前证券逐笔成交</caption>
                <thead><tr><th>时间</th><th>方向</th><th>价格</th><th>数量</th><th>状态</th></tr></thead>
                <tbody data-stage-node="trade-body"></tbody>
              </table>
            </div>
          </section>

          <section class="lzy-stage__panel" data-stage-panel="orders"
            aria-labelledby="lzy-stage-orders-title">
            <div class="lzy-stage__panel-heading">
              <div>
                <span class="lzy-stage__eyebrow">未成交委托</span>
                <h3 id="lzy-stage-orders-title">当日委托</h3>
              </div>
            </div>
            <div class="lzy-stage__table-wrap" tabindex="0">
              <table>
                <caption>当前未成交委托</caption>
                <thead><tr><th>时间</th><th>方向</th><th>限价</th><th>余量</th><th>操作</th></tr></thead>
                <tbody data-stage-node="order-body"></tbody>
              </table>
            </div>
          </section>

          <section class="lzy-stage__panel" data-stage-panel="agents"
            aria-labelledby="lzy-stage-agents-title">
            <div class="lzy-stage__panel-heading">
              <div>
                <span class="lzy-stage__eyebrow">公司简况</span>
                <h3 id="lzy-stage-agents-title">主要股东与市场主体</h3>
              </div>
            </div>
            <section class="lzy-stage__research"
              aria-label="当前公司的研究覆盖">
              <div>
                <span>研究覆盖</span>
                <strong data-stage-node="research-analyst">当前无可用覆盖</strong>
              </div>
              <p data-stage-node="research-status">仅显示公开资料。</p>
              <dl>
                <div><dt>更新</dt><dd data-stage-node="research-asof">—</dd></div>
                <div><dt>可靠度</dt><dd data-stage-node="research-quality">—</dd></div>
              </dl>
              <p data-stage-node="research-drivers">公告、财务与公开行情仍可查看。</p>
            </section>
            <section class="lzy-stage__shareholders"
              aria-label="当前证券主要股东">
              <div class="lzy-stage__table-wrap">
                <table>
                  <caption>登记持股、受益所有权与表决权</caption>
                  <thead>
                    <tr><th>序</th><th>股东</th><th>持股</th><th>占比</th></tr>
                  </thead>
                  <tbody data-stage-node="shareholder-body"></tbody>
                </table>
              </div>
              <p data-stage-node="shareholder-summary">股东数据连接中。</p>
            </section>
            <h4 class="lzy-stage__agent-heading">市场主体动作</h4>
            <p class="lzy-stage__agent-order">按持仓市值排列</p>
            <ol class="lzy-stage__agent-list" data-stage-node="agent-list"></ol>
          </section>
        </section>
      </div>

      <div class="lzy-stage__live" data-stage-node="live"
        aria-live="polite" aria-atomic="true"></div>
      <div class="lzy-stage__notice" data-stage-node="notice" hidden
        role="alert" aria-atomic="true">
        <span data-stage-node="notice-message"></span>
        <button type="button" data-stage-dismiss-notice
          aria-label="关闭通知">×</button>
      </div>
    </section>`;
}

function establishStageColumns(root) {
  const grid = root.querySelector('.lzy-stage__grid');
  if (!grid) return;
  const directChild = (className) =>
    [...grid.children].find((node) => node.classList.contains(className));
  const center = directChild('lzy-stage__center');
  const flow = directChild('lzy-stage__flow-strip');
  const bottom = directChild('lzy-stage__bottom');
  const symbols = directChild('lzy-stage__symbols');
  const right = directChild('lzy-stage__right');
  if (!center || !flow || !bottom || !symbols || !right) return;

  const workspace = root.ownerDocument.createElement('section');
  workspace.className = 'lzy-stage__workspace';
  workspace.dataset.stageNode = 'workspace';
  workspace.setAttribute('aria-label', '行情、盘口与市场详情');
  workspace.tabIndex = 0;
  grid.insertBefore(workspace, center);
  workspace.append(center, flow, bottom);

  symbols.setAttribute('aria-label', '证券列表');
  symbols.tabIndex = 0;
  right.setAttribute('aria-label', '交易与账户');
  right.tabIndex = 0;
}

function createRow(document, key, cells) {
  const row = document.createElement('tr');
  row.dataset.stageKey = key;
  for (const cellName of cells) {
    const cell = document.createElement(cellName === cells[0] ? 'th' : 'td');
    if (cellName === cells[0]) cell.scope = 'row';
    cell.dataset.stageCell = cellName;
    row.append(cell);
  }
  return row;
}

function createEmptyRow(document, message, columnCount = 5) {
  const row = document.createElement('tr');
  row.dataset.stageKey = 'empty';
  row.dataset.stageEmpty = 'true';
  const cell = document.createElement('td');
  cell.colSpan = columnCount;
  cell.textContent = message;
  row.append(cell);
  return row;
}

function reconcileRows(container, items, keyOf, create, update) {
  const existing = new Map(
    [...container.children].map((node) => [node.dataset.stageKey, node]),
  );
  const retained = new Set();
  items.forEach((item, index) => {
    const key = String(keyOf(item, index));
    let node = existing.get(key);
    if (!node) {
      node = create(item, key, index);
      node.dataset.stageKey = key;
    }
    retained.add(key);
    update(node, item, index);
    const position = container.children[index];
    if (position !== node) container.insertBefore(node, position ?? null);
  });
  for (const [key, node] of existing) {
    if (!retained.has(key)) node.remove();
  }
}

function setText(node, value) {
  if (node && node.textContent !== String(value)) node.textContent = String(value);
}

function cssColor(element, name, fallback = 'currentColor') {
  const value = element.ownerDocument.defaultView
    .getComputedStyle(element)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function failureMessage(value, orderFailure = false) {
  const receipt = object(value);
  const code = [
    receipt.reason,
    receipt.code,
    receipt.message,
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
  if (code.includes('TERMINAL_ORDER_LIMIT_EXCEEDED')) {
    return '活动委托较多，请先撤销部分委托。';
  }
  if (
    code.includes('INSUFFICIENT_CASH') ||
    code.includes('INSUFFICIENT_FUNDS')
  ) {
    return '可用资金不足。';
  }
  if (
    code.includes('INSUFFICIENT_HOLDING') ||
    code.includes('INSUFFICIENT_POSITION')
  ) {
    return '可卖数量不足。';
  }
  if (code.includes('PRICE_LIMIT')) {
    return '委托价格超出当日可申报范围。';
  }
  if (code.includes('ORDER_NOT_FOUND')) {
    return '这笔委托已经结束。';
  }
  return orderFailure
    ? '订单暂未提交，请稍后重试。'
    : '操作暂未完成，请稍后重试。';
}

function receiptMessage(value) {
  const receipt = object(value);
  const status = String(receipt.status ?? '').toLowerCase();
  const type = String(receipt.type ?? receipt.commandType ?? '');
  const isOrderReceipt =
    type === 'submit_order' ||
    type === 'cancel_order';
  if (!isOrderReceipt) {
    if (status === 'rejected' || status === 'error') {
      return failureMessage(receipt);
    }
    return receipt.shortFeedback ?? '市场状态已更新。';
  }
  if (status === 'partially_filled') {
    if (receipt.orderType === 'market') {
      return `市价单成交 ${finite(
        receipt.filledQuantity,
      )} 股，余量 ${finite(
        receipt.cancelledQuantity,
      )} 股已自动撤销。`;
    }
    return `部分成交 ${finite(receipt.filledQuantity)} 股，余量 ${finite(
      receipt.remainingQuantity,
    )} 股继续等待。`;
  }
  if (status === 'filled') {
    return `${receipt.orderType === 'market' ? '市价单' : '订单'}已全部成交 ${finite(
      receipt.filledQuantity ?? receipt.requestedQuantity,
    )} 股。`;
  }
  if (status === 'accepted' || status === 'open') {
    return `订单已受理；${finite(
      receipt.remainingQuantity ?? receipt.requestedQuantity,
    )} 股已进入盘口。`;
  }
  if (status === 'cancelled' || status === 'canceled') {
    if (type === 'submit_order' && receipt.orderType === 'market') {
      return '市价单当前没有可成交对手盘，全部余量已自动撤销。';
    }
    return '撤单已完成，冻结资源已经释放。';
  }
  if (status === 'rejected' || status === 'error') {
    return failureMessage(receipt, true);
  }
  return receipt.shortFeedback ?? '市场状态已更新。';
}

function receiptStatusLabel(value) {
  const status = String(object(value).status ?? '').toLowerCase();
  if (status === 'accepted' || status === 'open') return '已受理';
  if (status === 'partially_filled') return '部分成交';
  if (status === 'filled') return '全部成交';
  if (status === 'cancelled' || status === 'canceled') return '已撤单';
  if (status === 'rejected' || status === 'error') return '未完成';
  return '已更新';
}

function isOlderPublication(candidate, previous) {
  const next = object(candidate);
  const current = object(previous);
  const nextTime = Number(next.virtualMs);
  const currentTime = Number(current.virtualMs);
  const nextCommit = Number(next.commitSeq);
  const currentCommit = Number(current.commitSeq);
  const hasTimes =
    Number.isSafeInteger(nextTime) && Number.isSafeInteger(currentTime);
  if (hasTimes && nextTime !== currentTime) return nextTime < currentTime;
  if (
    Number.isSafeInteger(nextCommit) &&
    Number.isSafeInteger(currentCommit)
  ) {
    return nextCommit < currentCommit;
  }
  return false;
}

function derivativePublicationOrder(projection) {
  const value = object(projection);
  return {
    nowMs: integer(
      value.authorityNowMs ??
        value.nowMs,
    ),
    commitSeq: integer(
      value.authorityCommitSeq ??
        value.commitSeq,
    ),
  };
}

function isOlderDerivativeProjection(
  candidate,
  previous,
) {
  if (!previous) return false;
  const candidateHasStreamAuthority =
    Number.isSafeInteger(
      Number(candidate?.authorityNowMs),
    ) &&
    Number.isSafeInteger(
      Number(candidate?.authorityCommitSeq),
    );
  const previousHasStreamAuthority =
    Number.isSafeInteger(
      Number(previous?.authorityNowMs),
    ) &&
    Number.isSafeInteger(
      Number(previous?.authorityCommitSeq),
    );
  if (
    previousHasStreamAuthority !==
    candidateHasStreamAuthority
  ) {
    return (
      previousHasStreamAuthority &&
      !candidateHasStreamAuthority
    );
  }
  const next = derivativePublicationOrder(
    candidate,
  );
  const current = derivativePublicationOrder(
    previous,
  );
  return (
    next.nowMs < current.nowMs ||
    (
      next.nowMs === current.nowMs &&
      next.commitSeq < current.commitSeq
    )
  );
}

export function projectMarketStageThreeAssetContract({
  marketKind,
  symbol,
  selectedDerivativeContractIds = {},
  stockProjection,
  derivativesProjection,
  viewportWidthPx,
} = {}) {
  const assetClassByMarketKind = {
    stocks: 'stock',
    futures: 'future',
    options: 'option',
  };
  const assetClass =
    assetClassByMarketKind[marketKind] ?? null;
  const assetId =
    marketKind === 'stocks'
      ? symbol
      : selectedDerivativeContractIds[marketKind];
  const columns = projectThreeAssetMarketColumns({
    selection: { assetClass, assetId },
    stockProjection,
    derivativesProjection,
    permissionModeByAssetClass: {
      stock: 'OPEN',
      future:
        derivativesProjection?.access
          ?.permissionModes?.futures_trading ?? 'LOCKED',
      option:
        derivativesProjection?.access
          ?.permissionModes?.option_buyer ?? 'LOCKED',
    },
  });
  const geometry = deriveThreeAssetColumnGeometry({
    viewportWidthPx,
    gapPx: 12,
  });
  return {
    schemaVersion:
      'lzy_market_stage_three_asset_contract_v1',
    authority: 'read_only_stage_projection',
    integrationStatus:
      columns.status === 'ready'
        ? 'production_stage_integrated'
        : 'blocked',
    sourceModuleIntegrationStatus:
      columns.integrationStatus,
    assetClass,
    columns,
    geometry,
  };
}

/**
 * Mounts the isolated realtime market presentation layer.
 *
 * `update(marketSnapshot)` consumes the complete second argument from the
 * client's `onFrame(frame, marketSnapshot)` callback. The stage delegates every
 * authority-changing operation to the injected client and never mutates either
 * supplied world metadata or market snapshots.
 */
export function mountMarketStage(
  root,
  {
    world,
    client,
    symbol,
    marketKind = 'stocks',
    derivativesProjection = null,
    selectedDerivativeContractId = null,
    onWorldChange = () => {},
    onSymbolChange = () => {},
    onMarketKindChange = () => {},
    onDerivativeContractChange = () => {},
    onRoleConsoleOpen = () => {},
  } = {},
) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('mountMarketStage requires a DOM root element');
  }

  const document = root.ownerDocument;
  const window = document.defaultView;
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const compactQuery = window.matchMedia?.('(max-width: 959px)');
  const state = {
    world: object(world),
    client: object(client),
    snapshot: fallbackSnapshot(world),
    requestedSymbol: symbol,
    symbol: '',
    requestedMarketKind: [
      'stocks',
      'futures',
      'options',
    ].includes(marketKind)
      ? marketKind
      : 'stocks',
    marketKind: 'stocks',
    derivativesProjection:
      isPublishedDerivativesProjection(
        derivativesProjection,
      )
        ? derivativesProjection
        : null,
    selectedDerivativeContractIds: {
      futures:
        selectedDerivativeContractId ?? null,
      options:
        selectedDerivativeContractId ?? null,
    },
    derivativeSeriesTimeframes: {
      futures: 'intraday',
      options: 'intraday',
    },
    speed: 1,
    playing: false,
    chartMode: 'intraday',
    movingAveragePeriod: 5,
    chartCache: new Map(),
    intelligenceBySymbol: new Map(),
    reducedMotion: Boolean(motionQuery?.matches),
    destroyed: false,
    lastReceipt: null,
    seenTradeIds: new Set(),
    hasExternalSnapshot: false,
    pulseTimer: null,
    playbackRequestSeq: 0,
    speedRequestSeq: 0,
    orderRequestSeq: 0,
    orderSettledSeq: 0,
    orderSending: false,
    orderAwaitingReceipt: false,
    orderRowsSignature: null,
    limitTif: 'GTC',
    ticketDirty: false,
    drawerOpen: false,
    drawerMode: 'ticket',
    drawerTrigger: null,
    mobileTask: 'market',
    depthMode: 'ten',
    level2ActivationPending: false,
    level2ActivationRequested: false,
    noticeTimer: null,
    canvasMetrics: null,
    chartColors: null,
  };
  const capabilities = clientCapabilities(state.client);

  root.innerHTML = stageMarkup(state.reducedMotion, state.world);
  establishStageColumns(root);
  const shell = root.querySelector('[data-testid="market-stage"]');
  const nodes = Object.fromEntries(
    [...root.querySelectorAll('[data-stage-node]')].map((node) => [
      node.dataset.stageNode.replace(/-([a-z])/g, (_, letter) =>
        letter.toUpperCase(),
      ),
      node,
    ]),
  );
  const form = root.querySelector('#lzy-stage-ticket');
  form.dataset.symbolConfirmationRequired =
    'false';
  const sideInputs = [...form.querySelectorAll('input[name="side"]')];
  const tifInput = form.querySelector('select[name="tif"]');
  const level2ActivationButton = root.querySelector(
    '[data-stage-activate-level2]',
  );
  const drawerPanels = [
    ...nodes.rightDrawer.querySelectorAll(
      '[data-stage-panel="ticket"], [data-stage-panel="risk"], [data-stage-role-console]',
    ),
  ];
  const taskColumns = [
    root.querySelector('.lzy-stage__symbols'),
    root.querySelector('.lzy-stage__workspace'),
    root.querySelector('.lzy-stage__right'),
  ];
  const taskColumnNames = [
    'selection',
    'market',
    'action',
  ];
  taskColumns.forEach((column, index) => {
    if (column) {
      column.dataset.marketTaskColumn =
        taskColumnNames[index];
    }
  });
  const stockActionPanels = root.querySelector(
    '#lzy-stage-drawer-panels',
  );
  if (
    stockActionPanels &&
    state.derivativesProjection
  ) {
    stockActionPanels.insertAdjacentHTML(
      'beforeend',
      renderStockFinancingPanel(
        state.derivativesProjection,
        state.requestedSymbol,
      ),
    );
  }
  let stockColumnFragments = null;

  function synchronizeNodeAttributes(
    target,
    source,
  ) {
    const sourceNames = new Set(
      source.getAttributeNames(),
    );
    for (const name of target.getAttributeNames()) {
      if (!sourceNames.has(name)) {
        target.removeAttribute(name);
      }
    }
    for (const name of sourceNames) {
      target.setAttribute(
        name,
        source.getAttribute(name),
      );
    }
  }

  function derivativeTask() {
    if (
      !state.derivativesProjection ||
      state.marketKind === 'stocks'
    ) {
      return null;
    }
    const task = renderDerivativeTerminalTask(
      state.derivativesProjection,
      {
        section: state.marketKind,
        selectedContractId:
          state.selectedDerivativeContractIds[
            state.marketKind
          ],
        seriesTimeframe:
          state.derivativeSeriesTimeframes[
            state.marketKind
          ] ?? 'intraday',
      },
    );
    state.selectedDerivativeContractIds[
      state.marketKind
    ] = task.selectedEntityId || null;
    return task;
  }

  function markupNodes(markup) {
    const template =
      document.createElement('template');
    template.innerHTML = markup;
    return [...template.content.childNodes];
  }

  function patchDerivativeColumn(
    column,
    markup,
  ) {
    const template =
      document.createElement('template');
    template.innerHTML = markup;
    const nextRoot =
      document.createElement('div');
    nextRoot.append(
      ...[...template.content.childNodes],
    );
    const currentNodes = new Map(
      [...column.querySelectorAll(
        '[data-derivatives-live-key]',
      )].map((node) => [
        node.dataset.derivativesLiveKey,
        node,
      ]),
    );
    for (const nextNode of nextRoot.querySelectorAll(
      '[data-derivatives-live-key]',
    )) {
      const currentNode = currentNodes.get(
        nextNode.dataset.derivativesLiveKey,
      );
      if (!currentNode) continue;
      synchronizeNodeAttributes(
        currentNode,
        nextNode,
      );
      currentNode.replaceChildren(
        ...[...nextNode.childNodes].map(
          (node) => node.cloneNode(true),
        ),
      );
    }
  }

  function authorityForCurrentMode() {
    if (
      state.marketKind !== 'stocks' &&
      state.derivativesProjection
    ) {
      return {
        nowMs: integer(
          state.derivativesProjection
            .authorityNowMs ??
            state.derivativesProjection.nowMs,
        ),
        commitSeq: integer(
          state.derivativesProjection
            .authorityCommitSeq ??
            state.derivativesProjection.commitSeq,
        ),
      };
    }
    return {
      nowMs: integer(state.snapshot.nowMs),
      commitSeq: integer(
        state.snapshot.commitSeq,
      ),
    };
  }

  function selectedEntityForCurrentMode() {
    if (state.marketKind === 'stocks') {
      return state.symbol;
    }
    return (
      state.selectedDerivativeContractIds[
        state.marketKind
      ] ?? ''
    );
  }

  function updateMarketKindButtons() {
    for (const button of root.querySelectorAll(
      '[data-stage-market-kind]',
    )) {
      button.setAttribute(
        'aria-pressed',
        button.dataset.stageMarketKind ===
          state.marketKind
          ? 'true'
          : 'false',
      );
    }
  }

  function annotateTerminalColumns() {
    const selected =
      selectedEntityForCurrentMode();
    const authority =
      authorityForCurrentMode();
    const viewportWidthPx =
      positiveInteger(root.clientWidth) ??
      positiveInteger(shell.clientWidth) ??
      positiveInteger(window.innerWidth) ??
      1;
    const threeAssetContract =
      projectMarketStageThreeAssetContract({
        marketKind: state.marketKind,
        symbol: state.symbol,
        selectedDerivativeContractIds:
          state.selectedDerivativeContractIds,
        stockProjection: state.snapshot,
        derivativesProjection:
          state.derivativesProjection,
        viewportWidthPx,
      });
    const selectedEntityKey =
      threeAssetContract.columns.columns?.left
        ?.selectedEntityKey ?? '';
    const series =
      threeAssetContract.columns.columns?.center
        ?.series;
    const annotateContract = (target) => {
      if (!target) return;
      target.dataset.marketThreeAssetContract =
        threeAssetContract.schemaVersion;
      target.dataset.marketThreeAssetIntegration =
        threeAssetContract.integrationStatus;
      target.dataset.marketThreeAssetClass =
        threeAssetContract.assetClass ?? '';
      target.dataset.marketThreeAssetEntity =
        selectedEntityKey;
      target.dataset.marketColumnGeometry =
        threeAssetContract.geometry.mode;
      target.dataset.marketColumnOrder =
        threeAssetContract.geometry.columnOrder.join(',');
      target.dataset.marketTradeAuthority =
        series?.trade?.priceAuthority ?? '';
      target.dataset.marketMarkAuthority =
        series?.mark?.point?.source ??
        series?.mark?.applicability ?? '';
      target.dataset.marketTheoreticalAuthority =
        series?.theoretical?.point?.source ??
        series?.theoretical?.applicability ?? '';
      target.dataset.marketSettlementAuthority =
        series?.settlement?.point?.source ??
        series?.settlement?.applicability ?? '';
    };
    shell.dataset.marketMode =
      state.marketKind;
    shell.dataset.marketSelectedEntity =
      selected;
    annotateContract(shell);
    const host = root.closest(
      '[data-testid="market-stage-host"]',
    );
    if (host) {
      host.dataset.marketMode =
        state.marketKind;
      host.dataset.marketSelectedEntity =
        selected;
      annotateContract(host);
    }
    taskColumns.forEach((column, index) => {
      if (!column) return;
      column.dataset.marketTaskColumn =
        taskColumnNames[index];
      column.dataset.marketSelectedEntity =
        selected;
      column.dataset.authorityNowMs =
        String(authority.nowMs);
      column.dataset.authorityCommitSeq =
        String(authority.commitSeq);
      const geometryRole =
        threeAssetContract.geometry.columnOrder[index];
      column.dataset.marketGeometryRole = geometryRole;
      column.dataset.marketExpectedWidthPx = String(
        threeAssetContract.geometry
          .columnWidthsPx[geometryRole],
      );
      column.dataset.marketThreeAssetEntity =
        selectedEntityKey;
    });
    updateMarketKindButtons();
  }

  function refreshStockFinancing() {
    if (
      state.marketKind !== 'stocks' ||
      !state.derivativesProjection
    ) {
      return false;
    }
    const panel = nodes.rightDrawer.querySelector(
      '[data-stock-financing-symbol]',
    );
    if (panel) {
      return patchStockFinancingPanel(
        panel,
        state.derivativesProjection,
        state.symbol,
      );
    }
    const panels = nodes.rightDrawer.querySelector(
      '#lzy-stage-drawer-panels',
    );
    if (!panels) return false;
    panels.insertAdjacentHTML(
      'beforeend',
      renderStockFinancingPanel(
        state.derivativesProjection,
        state.symbol,
      ),
    );
    return true;
  }

  function stockLendingForm() {
    return nodes.rightDrawer.querySelector(
      '#derivatives-lending-form',
    );
  }

  function invalidateSymbolSpecificDrafts() {
    state.ticketDirty = false;
    nodes.quantityInput.value = '';
    form.dataset.symbolConfirmationRequired =
      'true';
    const lendingForm = stockLendingForm();
    const lendingQuantity =
      lendingForm?.querySelector(
        '[name="quantity"]',
      );
    if (lendingQuantity) {
      lendingQuantity.value = '';
    }
    if (lendingForm) {
      lendingForm.dataset
        .symbolConfirmationRequired = 'true';
    }
  }

  function confirmStockTicketDraft() {
    const quantity = positiveInteger(
      nodes.quantityInput.value,
    );
    const validPrice =
      selectedOrderType() === 'market' ||
      Boolean(
        priceTicks(nodes.limitInput.value),
      );
    if (quantity && validPrice) {
      form.dataset.symbolConfirmationRequired =
        'false';
    }
  }

  function confirmLendingDraft(target) {
    const lendingForm = target?.closest?.(
      '#derivatives-lending-form',
    );
    if (
      lendingForm &&
      positiveInteger(
        lendingForm.querySelector(
          '[name="quantity"]',
        )?.value,
      )
    ) {
      lendingForm.dataset
        .symbolConfirmationRequired = 'false';
    }
  }

  function renderCurrentDerivative({
    preserveDrafts = false,
  } = {}) {
    const task = derivativeTask();
    if (!task) return false;
    const markups = [
      task.selectionHtml,
      task.marketHtml,
      `${roleConsoleMarkup(state.world, {
        derivativeMode: true,
      })}${task.actionHtml}`,
    ];
    taskColumns.forEach((column, index) => {
      if (!column) return;
      if (preserveDrafts) {
        patchDerivativeColumn(
          column,
          markups[index],
        );
      } else {
        column.replaceChildren(
          ...markupNodes(markups[index]),
        );
      }
    });
    annotateTerminalColumns();
    updateRoleConsole();
    return true;
  }

  function acceptDerivativeProjection(
    projection,
  ) {
    if (
      !isPublishedDerivativesProjection(
        projection,
      ) ||
      isOlderDerivativeProjection(
        projection,
        state.derivativesProjection,
      )
    ) {
      return false;
    }
    if (
      projection ===
      state.derivativesProjection
    ) {
      return false;
    }
    state.derivativesProjection =
      projection;
    return true;
  }

  function refreshDerivativeProjectionDom() {
    if (state.marketKind === 'stocks') {
      refreshStockFinancing();
      annotateTerminalColumns();
    } else {
      renderCurrentDerivative({
        preserveDrafts: true,
      });
    }
  }

  function setMarketKind(
    nextKind,
    {
      announce = true,
      notify = true,
    } = {},
  ) {
    if (
      ![
        'stocks',
        'futures',
        'options',
      ].includes(nextKind)
    ) {
      return false;
    }
    if (
      nextKind !== 'stocks' &&
      !state.derivativesProjection
    ) {
      publish(
        '衍生品行情尚未就绪。',
        { visual: true },
      );
      return false;
    }
    if (nextKind === state.marketKind) {
      annotateTerminalColumns();
      return true;
    }
    if (state.marketKind === 'stocks') {
      stockColumnFragments =
        taskColumns.map((column) => {
          const fragment =
            document.createDocumentFragment();
          while (column?.firstChild) {
            fragment.append(column.firstChild);
          }
          return fragment;
        });
    }
    state.marketKind = nextKind;
    if (nextKind === 'stocks') {
      taskColumns.forEach((column, index) => {
        column?.replaceChildren(
          ...(stockColumnFragments?.[index]
            ? [
                ...stockColumnFragments[
                  index
                ].childNodes,
              ]
            : []),
        );
      });
      stockColumnFragments = null;
      refreshStockFinancing();
      renderFrame();
      annotateTerminalColumns();
    } else {
      renderCurrentDerivative();
    }
    if (notify) {
      onMarketKindChange(
        nextKind,
        selectedEntityForCurrentMode(),
      );
    }
    if (announce) {
      publish(
        nextKind === 'stocks'
          ? '已切换至股票。'
          : nextKind === 'futures'
            ? '已切换至期货。'
            : '已切换至期权。',
      );
    }
    return true;
  }

  function dismissNotice() {
    window.clearTimeout(state.noticeTimer);
    state.noticeTimer = null;
    nodes.notice.hidden = true;
    setText(nodes.noticeMessage, '');
  }

  function publish(
    message,
    { visual = false, persistent = false } = {},
  ) {
    setText(nodes.live, message);
    if (!visual) return;
    window.clearTimeout(state.noticeTimer);
    setText(nodes.noticeMessage, message);
    nodes.notice.hidden = false;
    if (!persistent) {
      state.noticeTimer = window.setTimeout(dismissNotice, 4_000);
    }
  }

  function commandFailure(error) {
    console.error('市场操作失败', error);
    publish('操作暂未完成，请稍后重试。', { visual: true });
  }

  function updateDrawer() {
    const compact = Boolean(compactQuery?.matches);
    const fundsPage = compact && state.mobileTask === 'funds';
    const rolePage = compact && state.drawerMode === 'role';
    const open = !compact || state.drawerOpen || fundsPage;
    const expanded = compact && state.drawerOpen;
    const roleType = object(state.world.player).roleType;
    const drawerSubject = roleType === 'quant_institution'
      ? '策略与交易'
      : roleType === 'stabilization_fund'
        ? '稳定与交易'
        : '订单与风险';
    shell.dataset.orderSheetOpen = expanded ? 'true' : 'false';
    nodes.rightDrawer.dataset.drawerOpen = open ? 'true' : 'false';
    nodes.rightDrawer.dataset.drawerMode = state.drawerMode;
    nodes.rightDrawer.dataset.taskPage = fundsPage ? 'funds' : 'none';
    nodes.drawerToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    nodes.drawerToggle.setAttribute(
      'aria-label',
      expanded
        ? `打开${drawerSubject}（当前已展开，再按收起）`
        : `打开${drawerSubject}`,
    );
    setText(
      nodes.drawerLabel,
      expanded ? `收起${drawerSubject}` : `打开${drawerSubject}`,
    );
    for (const panel of drawerPanels) {
      panel.inert =
        !open ||
        (fundsPage && panel.dataset.stagePanel !== 'risk') ||
        (rolePage && panel.dataset.stagePanel !== 'role');
    }
  }

  function updateMobileTask() {
    shell.dataset.mobileTask = state.mobileTask;
    nodes.depthDetail.open = state.mobileTask === 'depth';
    const depthExpanded = state.mobileTask === 'depth';
    const depthToggle = root.querySelector('[data-stage-depth-toggle]');
    depthToggle.setAttribute(
      'aria-expanded',
      depthExpanded ? 'true' : 'false',
    );
    setText(depthToggle, depthExpanded ? '返回五档' : '十档');
    for (const button of root.querySelectorAll('[data-stage-mobile-task]')) {
      const currentTask =
        state.mobileTask === 'depth' ? 'market' : state.mobileTask;
      if (button.dataset.stageMobileTask === currentTask) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    }
  }

  async function invoke(kind, payload) {
    try {
      if (kind === 'play') {
        await state.client.play();
      } else if (kind === 'pause') {
        await state.client.pause();
      } else if (kind === 'step') {
        await state.client.stepFrame();
      } else if (kind === 'speed') {
        await state.client.setSpeed(payload);
      } else if (kind === 'submit') {
        await state.client.worldCommand(payload);
      } else if (kind === 'cancel') {
        await state.client.worldCommand(payload);
      } else if (kind === 'action') {
        await state.client.worldCommand(payload);
      }
      return true;
    } catch (error) {
      commandFailure(error);
      return false;
    }
  }

  function updatePlayback() {
    shell.dataset.playing = state.playing ? 'true' : 'false';
    setText(nodes.runState, state.playing ? '运行' : '暂停');
    setText(nodes.mobileRunIcon, state.playing ? 'Ⅱ' : '▶');
    setText(nodes.mobileRunLabel, state.playing ? '暂停' : '播放');
    setText(nodes.desktopRunIcon, state.playing ? 'Ⅱ' : '▶');
    setText(nodes.desktopRunLabel, state.playing ? '暂停' : '播放');
    nodes.mobileRunToggle.setAttribute(
      'aria-label',
      state.playing ? '暂停市场' : '播放市场',
    );
    nodes.desktopRunToggle.setAttribute(
      'aria-label',
      state.playing ? '暂停市场' : '播放市场',
    );
    nodes.mobileSpeedSelect.value = String(state.speed);
    nodes.desktopSpeedSelect.value = String(state.speed);
  }

  async function play() {
    if (!capabilities.play) {
      publish('行情连接中，请稍后再试。');
      return;
    }
    const requestSeq = ++state.playbackRequestSeq;
    const accepted = await invoke('play');
    if (!accepted || state.destroyed || requestSeq !== state.playbackRequestSeq) {
      return;
    }
    state.playing = true;
    updatePlayback();
    publish(`已切换至 ${state.speed}×。`);
  }

  async function pause(message = '行情已暂停。') {
    if (!capabilities.pause) {
      publish('行情连接中，请稍后再试。');
      return;
    }
    const requestSeq = ++state.playbackRequestSeq;
    const accepted = await invoke('pause');
    if (!accepted || state.destroyed || requestSeq !== state.playbackRequestSeq) {
      return;
    }
    state.playing = false;
    updatePlayback();
    publish(message);
  }

  async function step() {
    if (!capabilities.step) {
      publish('行情连接中，请稍后再试。');
      return;
    }
    const requestSeq = ++state.playbackRequestSeq;
    const accepted = await invoke('step');
    if (!accepted || state.destroyed || requestSeq !== state.playbackRequestSeq) {
      return;
    }
    state.playing = false;
    updatePlayback();
    publish('已推进到下一三秒行情边界；市场保持暂停。');
  }

  async function setSpeed(value) {
    const speed = Number(value);
    if (!SPEEDS.has(speed)) return;
    if (!capabilities.speed) {
      publish('行情连接中，请稍后再试。');
      return;
    }
    const requestSeq = ++state.speedRequestSeq;
    const accepted = await invoke('speed', speed);
    if (!accepted || state.destroyed || requestSeq !== state.speedRequestSeq) {
      if (!state.destroyed && requestSeq === state.speedRequestSeq) {
        updatePlayback();
      }
      return;
    }
    state.speed = speed;
    updatePlayback();
    publish(`市场倍速已切换为 ${speed}×。`);
  }

  function bestLimit(side = 'buy') {
    const view = currentView(state.snapshot, state.symbol);
    const levels = side === 'sell' ? array(view.bids) : array(view.asks);
    return (
      positiveInteger(object(levels[0]).priceTicks) ??
      positiveInteger(view.lastPriceTicks) ??
      PRICE_SCALE
    );
  }

  function selectedSide() {
    return sideInputs.find((input) => input.checked)?.value === 'sell'
      ? 'sell'
      : 'buy';
  }

  function selectedOrderType() {
    return nodes.orderTypeInput.value === 'market' ? 'market' : 'limit';
  }

  function buyReservationCents(price, quantity) {
    const ticks = positiveInteger(price);
    const units = positiveInteger(quantity);
    if (!ticks || !units) return 0;
    const grossCents = ticks * units;
    const feeCents = Math.max(
      5,
      Math.ceil(grossCents * 5 / 10_000),
    );
    return grossCents + feeCents;
  }

  function boardLotQuantity(quantity) {
    return Math.max(0, Math.floor(finite(quantity) / 100) * 100);
  }

  function maximumTicketQuantity() {
    const account = object(object(state.snapshot.accounts).player);
    if (selectedSide() === 'sell') {
      return boardLotQuantity(
        Math.max(
          0,
          finite(object(account.holdings)[state.symbol]) -
            finite(object(account.reservedHoldings)[state.symbol]),
        ),
      );
    }
    const derivativesAccount = object(
      object(object(state.world.derivatives).accounts).player,
    );
    const derivativeReservedInitialMarginCents =
      Math.max(
        0,
        finite(
          derivativesAccount.reservedInitialMarginCents ??
            account.reservedInitialMarginCents,
        ),
      );
    const freeCashCents = Math.max(
      0,
      finite(account.cashCents) -
        finite(account.reservedCashCents) -
        derivativeReservedInitialMarginCents,
    );
    if (selectedOrderType() === 'market') {
      const view = currentView(state.snapshot, state.symbol);
      const depthSource =
        object(view.level2Depth).depth
          ? object(view.level2Depth)
          : view;
      const asks = array(depthSource.asks)
        .map((level) => ({
          priceTicks: positiveInteger(level?.priceTicks),
          quantity: Math.max(0, integer(level?.quantity)),
        }))
        .filter((level) => level.priceTicks && level.quantity > 0)
        .sort((left, right) => left.priceTicks - right.priceTicks);
      if (!asks.length) return 0;
      let filled = 0;
      let grossCents = 0;
      for (const level of asks) {
        let low = 0;
        let high = level.quantity;
        while (low < high) {
          const midpoint = Math.ceil((low + high) / 2);
          const candidateGross =
            grossCents + midpoint * level.priceTicks;
          const candidateFee = Math.max(
            5,
            Math.ceil(candidateGross * 5 / 10_000),
          );
          if (candidateGross + candidateFee <= freeCashCents) {
            low = midpoint;
          } else {
            high = midpoint - 1;
          }
        }
        filled += low;
        grossCents += low * level.priceTicks;
        if (low < level.quantity) break;
      }
      return boardLotQuantity(filled);
    }
    const referenceTicks =
      priceTicks(nodes.limitInput.value) ?? bestLimit('buy');
    let quantity = boardLotQuantity(
      referenceTicks ? Math.floor(freeCashCents / referenceTicks) : 0,
    );
    while (
      quantity > 0 &&
      buyReservationCents(referenceTicks, quantity) > freeCashCents
    ) {
      quantity -= 100;
    }
    return quantity;
  }

  function updateQuantityPresets() {
    const maximum = maximumTicketQuantity();
    nodes.quantityPresets.dataset.stageMaximumQuantity = String(maximum);
    for (const button of nodes.quantityPresets.querySelectorAll(
      '[data-stage-quantity-preset]',
    )) {
      button.disabled = maximum < 100;
      button.title =
        maximum >= 100
          ? `本方向当前最多 ${formatNumber(maximum)} 股`
          : '当前资金或可卖持仓不足一手';
    }
  }

  function applyQuantityPreset(preset) {
    const maximum = maximumTicketQuantity();
    if (maximum < 100) return;
    const requested =
      preset === 'all'
        ? maximum
        : preset === 'half'
          ? boardLotQuantity(maximum / 2)
          : preset === 'third'
            ? boardLotQuantity(maximum / 3)
            : preset === '1000'
              ? 1_000
              : 100;
    const quantity = Math.max(100, Math.min(maximum, requested));
    nodes.quantityInput.value = String(quantity);
    state.ticketDirty = true;
    updatePreview();
  }

  function ticketPriceBand() {
    const view = currentView(state.snapshot, state.symbol);
    return {
      minimum: positiveInteger(view.limitDownTicks),
      maximum: positiveInteger(view.limitUpTicks),
    };
  }

  function updateOrderRequestState() {
    const side = selectedSide();
    const sideLabel = side === 'sell' ? '卖出' : '买入';
    const orderType = selectedOrderType();
    const typeLabel = orderType === 'market' ? '市价' : '';
    const requestState = state.orderSending
      ? 'sending'
      : state.orderAwaitingReceipt
        ? 'awaiting'
        : 'idle';
    const limitTicks = priceTicks(nodes.limitInput.value);
    const band = ticketPriceBand();
    const validLimit =
      Boolean(limitTicks) &&
      (!band.minimum || limitTicks >= band.minimum) &&
      (!band.maximum || limitTicks <= band.maximum);
    const draftValid =
      Boolean(state.symbol) &&
      Boolean(positiveInteger(nodes.quantityInput.value)) &&
      (
        orderType === 'market' ||
        validLimit
      );
    nodes.submitOrder.dataset.stageRequestState = requestState;
    nodes.submitOrder.dataset.stageDraftValid = draftValid
      ? 'true'
      : 'false';
    nodes.submitOrder.setAttribute(
      'aria-busy',
      state.orderSending ? 'true' : 'false',
    );
    nodes.submitOrder.disabled =
      !capabilities.submit || state.orderSending || !draftValid;
    if (state.orderSending) {
      setText(nodes.submitOrder, '发送中…');
    } else if (state.orderAwaitingReceipt) {
      setText(nodes.submitOrder, '已发送 · 等待成交回报');
    } else {
      setText(
        nodes.submitOrder,
        `${sideLabel}${typeLabel ? ` ${typeLabel}` : ''} ${
          state.symbol || '当前标的'
        }`,
      );
    }
    nodes.submitOrder.setAttribute(
      'aria-label',
      `${sideLabel} ${state.symbol || '当前标的'}，提交${
        orderType === 'market' ? '市价' : '限价'
      }订单`,
    );
  }

  function updateTicketPresentation() {
    const side = selectedSide();
    const label = side === 'sell' ? '卖出' : '买入';
    const orderType = selectedOrderType();
    const previousOrderType = form.dataset.orderType;
    if (orderType === 'market' && previousOrderType === 'limit') {
      state.limitTif = tifInput.value === 'IOC' ? 'IOC' : 'GTC';
    } else if (
      orderType === 'limit' &&
      previousOrderType === 'market'
    ) {
      tifInput.value = state.limitTif;
    }
    form.dataset.tradeSide = side;
    form.dataset.orderType = orderType;
    setText(nodes.ticketTitle, `${label}委托`);
    const band = ticketPriceBand();
    nodes.limitInput.min = band.minimum
      ? formatInputPrice(band.minimum)
      : '0.01';
    if (band.maximum) {
      nodes.limitInput.max = formatInputPrice(band.maximum);
    } else {
      nodes.limitInput.removeAttribute('max');
    }
    nodes.limitInput.disabled = orderType === 'market';
    for (const button of root.querySelectorAll('[data-stage-price-step]')) {
      button.disabled = orderType === 'market';
    }
    tifInput.disabled = orderType === 'market';
    if (orderType === 'market') tifInput.value = 'IOC';
    updateQuantityPresets();
    updateOrderRequestState();
  }

  function updateLimitDefault() {
    const ticks = bestLimit(selectedSide());
    nodes.limitInput.value = formatInputPrice(ticks);
    updateQuantityPresets();
    updateOrderRequestState();
  }

  function updateSymbolControls(onlySymbols = null) {
    const symbols = symbolList(state.snapshot, state.world);
    const updateButton = (button, item) => {
        const meta = symbolMeta(state.world, item);
        const view = currentView(state.snapshot, item);
        const lastTicks = positiveInteger(view.lastPriceTicks);
        const previousCloseTicks = positiveInteger(view.previousCloseTicks);
        const deltaTicks =
          lastTicks && previousCloseTicks
            ? lastTicks - previousCloseTicks
            : null;
        const direction =
          deltaTicks === null
            ? 'flat'
            : signedDirection(deltaTicks);
        const sign =
          deltaTicks > 0 ? '+' : deltaTicks < 0 ? '−' : '';
        button.dataset.stagePreviousCloseTicks =
          previousCloseTicks ? String(previousCloseTicks) : '';
        button.dataset.stageLastPriceTicks =
          lastTicks ? String(lastTicks) : '';
        button.setAttribute(
          'aria-current',
          item === state.symbol ? 'true' : 'false',
        );
        button.setAttribute(
          'aria-label',
          `${item} ${meta.name}，最近成交 ${
            lastTicks ? formatPrice(lastTicks) : '暂无'
          }${
            deltaTicks === null
              ? ''
              : `，涨跌 ${sign}${formatPrice(Math.abs(deltaTicks))}，${sign}${(
                  Math.abs(deltaTicks) /
                  previousCloseTicks *
                  100
                ).toFixed(2)}%`
          }`,
        );
        setText(button.querySelector('[data-stage-symbol-code]'), item);
        setText(button.querySelector('[data-stage-symbol-name]'), meta.name);
        const priceNode = button.querySelector(
          '[data-stage-symbol-price]',
        );
        setText(
          priceNode,
          lastTicks
            ? formatPrice(lastTicks)
            : '—',
        );
        setMarketDirection(priceNode, direction);
        const changeNode = button.querySelector(
          '[data-stage-symbol-change]',
        );
        const percentNode = button.querySelector(
          '[data-stage-symbol-change-percent]',
        );
        setText(
          changeNode,
          deltaTicks === null
            ? '—'
            : `${sign}${formatPrice(Math.abs(deltaTicks))}`,
        );
        setText(
          percentNode,
          deltaTicks === null
            ? '—'
            : `${sign}${(
                Math.abs(deltaTicks) /
                previousCloseTicks *
                100
              ).toFixed(2)}%`,
        );
        setMarketDirection(changeNode, direction);
        setMarketDirection(percentNode, direction);
        setText(button.querySelector('[data-stage-symbol-role]'), meta.role);
    };
    if (Array.isArray(onlySymbols)) {
      const refresh = new Set(onlySymbols);
      for (const button of nodes.symbolList.querySelectorAll(
        '[data-stage-symbol]',
      )) {
        const item = button.dataset.stageSymbol;
        if (refresh.has(item)) updateButton(button, item);
      }
      return;
    }
    reconcileRows(
      nodes.symbolList,
      symbols,
      (item) => item,
      (item, key) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.stageSymbol = key;
        button.innerHTML = `
          <span data-stage-symbol-code></span>
          <strong data-stage-symbol-name></strong>
          <span data-stage-symbol-price></span>
          <span data-stage-symbol-change></span>
          <span data-stage-symbol-change-percent></span>
          <small data-stage-symbol-role></small>`;
        return button;
      },
      updateButton,
    );

    for (const select of [nodes.mobileSymbolSelect]) {
      const currentOptions = new Map(
        [...select.options].map((option) => [option.value, option]),
      );
      symbols.forEach((item, index) => {
        let option = currentOptions.get(item);
        if (!option) {
          option = document.createElement('option');
          option.value = item;
        }
        option.textContent = `${item} · ${symbolMeta(state.world, item).name}`;
        if (select.options[index] !== option) {
          select.insertBefore(
            option,
            select.options[index] ?? null,
          );
        }
        currentOptions.delete(item);
      });
      for (const option of currentOptions.values()) option.remove();
      select.value = state.symbol;
    }
    const meta = symbolMeta(state.world, state.symbol);
    setText(nodes.orderSymbol, `${state.symbol} · ${meta.name}`);
    updateTicketPresentation();
  }

  function updateHeader() {
    const worldState = object(state.world.world);
    const player = object(state.world.player);
    setText(
      nodes.worldDate,
      `${worldState.name ?? '本地世界'} · ${formatDate(
        state.snapshot.calendar ?? worldState.calendar,
        state.snapshot.worldTick ?? worldState.tick,
      )}`,
    );
    setText(
      nodes.clock,
      formatClock(
        finite(state.snapshot.nowMs) +
          Math.max(
            0,
            integer(
              state.snapshot.marketClockOffsetMs ??
                MARKET_CLOCK_ORIGIN_OFFSET_MS,
            ),
          ),
      ),
    );
    setText(nodes.commit, `序号 ${state.snapshot.commitSeq ?? '—'}`);
    setText(nodes.identity, player.roleLabel ?? player.identity ?? '只读观察者');
    setText(nodes.profile, player.profileName ?? '市场参与者');
    const connected = Object.values(capabilities).some(Boolean);
    setText(
      nodes.connection,
      connected ? '行情在线' : '行情连接中',
    );
    nodes.connection.dataset.connected = connected ? 'true' : 'false';
  }

  function getChartSeries(timeframe = state.chartMode) {
    const normalized = CHART_TIMEFRAME_KEYS.has(timeframe)
      ? timeframe
      : 'intraday';
    const cacheKey = `${state.symbol}:${normalized}`;
    if (!state.chartCache.has(cacheKey)) {
      state.chartCache.set(
        cacheKey,
        deriveMarketChartSeries(
          state.snapshot,
          state.symbol,
          normalized,
        ),
      );
    }
    return state.chartCache.get(cacheKey);
  }

  function refreshIntelligenceProjection() {
    try {
      const network = projectMarketIntelligence(
        state.world,
        state.snapshot,
      );
      state.intelligenceBySymbol = new Map(
        array(network.companies).map((company) => [
          company.symbol,
          company,
        ]),
      );
    } catch {
      state.intelligenceBySymbol = new Map();
    }
  }

  function refreshRealtimeQuoteProjection(symbol) {
    const current = object(
      state.intelligenceBySymbol.get(symbol),
    );
    if (Object.keys(current).length === 0) return;
    try {
      state.intelligenceBySymbol.set(symbol, {
        ...current,
        quote: projectMarketQuote(
          state.world,
          state.snapshot,
          symbol,
        ),
      });
    } catch {
      // Keep the last complete public projection if a partial transport frame
      // cannot yet produce a self-contained quote.
    }
  }

  function updatePrice() {
    const view = currentView(state.snapshot, state.symbol);
    const meta = symbolMeta(state.world, state.symbol);
    const security = object(securityCatalog(state.world)[state.symbol]);
    const valuation = Object.keys(object(view.valuation)).length
      ? object(view.valuation)
      : object(security.valuation);
    const research = object(view.research);
    const hasResearchContract =
      Object.keys(research).length > 0;
    const processedResearch =
      research.status === 'processed';
    const researchModel = object(research.model);
    const metrics = object(valuation.metrics);
    const ratios = object(valuation.marketRatios);
    const intelligence = object(
      state.intelligenceBySymbol.get(state.symbol),
    );
    const quote = object(intelligence.quote);
    const last = positiveInteger(view.lastPriceTicks);
    const previousClose =
      positiveInteger(view.previousCloseTicks) ??
      positiveInteger(security.previousCloseTicks) ??
      last;
    const chartAuthority = object(view.chartAuthority);
    const sessionOpen =
      positiveInteger(view.sessionOpenTicks) ??
      positiveInteger(chartAuthority.openingTicks);
    const sessionHigh =
      positiveInteger(view.sessionHighTicks) ??
      positiveInteger(chartAuthority.highTicks) ??
      sessionOpen;
    const sessionLow =
      positiveInteger(view.sessionLowTicks) ??
      positiveInteger(chartAuthority.lowTicks) ??
      sessionOpen;
    const delta =
      last && previousClose ? last - previousClose : 0;
    const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
    const percent = previousClose
      ? (Math.abs(delta) / Math.max(1, previousClose)) * 100
      : 0;
    setText(nodes.chartSymbol, state.symbol || '—');
    setText(nodes.chartName, meta.name);
    setText(
      nodes.lastPrice,
      last ? formatPrice(last) : '—',
    );
    const direction = priceDirection(last, previousClose);
    setMarketDirection(nodes.lastPrice, direction);
    setMarketDirection(nodes.priceChange, direction);
    setText(
      nodes.priceChange,
      last && previousClose
        ? `${sign}${formatPrice(Math.abs(delta))} ${sign}${percent.toFixed(2)}%`
        : '等待昨收基准',
    );
    const latestEventMs =
      Math.max(
        0,
        integer(
          view.latestEventMs ??
            chartAuthority.latestEventMs ??
            state.snapshot.nowMs,
        ),
      );
    setText(
      nodes.latestEvent,
      formatClock(
        latestEventMs +
          Math.max(
            0,
            integer(
              state.snapshot.marketClockOffsetMs ??
                MARKET_CLOCK_ORIGIN_OFFSET_MS,
            ),
          ),
      ),
    );
    setText(
      nodes.marketDataTier,
      view.level2Realtime === true ? 'L2 毫秒' : '公开秒级',
    );
    for (const [node, value] of [
      [nodes.sessionOpen, sessionOpen],
      [nodes.sessionHigh, sessionHigh],
      [nodes.sessionLow, sessionLow],
      [nodes.previousClose, previousClose],
    ]) {
      setText(node, value ? formatPrice(value) : '—');
      setMarketDirection(
        node,
        value && previousClose
          ? priceDirection(value, previousClose)
          : 'unknown',
      );
    }
    setText(
      nodes.valuationPe,
      Number.isFinite(Number(ratios.priceEarnings))
        ? `${formatNumber(ratios.priceEarnings, 2)}×`
        : '亏损',
    );
    setText(
      nodes.valuationPb,
      Number.isFinite(Number(ratios.priceBook))
        ? `${formatNumber(ratios.priceBook, 2)}×`
        : '—',
    );
    setText(
      nodes.valuationEps,
      Number.isFinite(Number(metrics.earningsPerShare))
        ? formatNumber(metrics.earningsPerShare, 2)
        : '—',
    );
    setText(
      nodes.valuationRange,
      processedResearch &&
        positiveInteger(researchModel.lowTicks) &&
        positiveInteger(researchModel.highTicks)
        ? `${formatPrice(researchModel.lowTicks)}–${formatPrice(
            researchModel.highTicks,
          )}`
        : !hasResearchContract &&
              positiveInteger(valuation.lowTicks) &&
              positiveInteger(valuation.highTicks)
          ? `${formatPrice(valuation.lowTicks)}–${formatPrice(
              valuation.highTicks,
            )}`
          : hasResearchContract
            ? '暂无内部测算'
            : '—',
    );
    setText(
      nodes.researchAnalyst,
      processedResearch && research.analystName
        ? research.analystName
        : '当前无可用覆盖',
    );
    setText(
      nodes.researchStatus,
      processedResearch
        ? research.processingMode === 'substitute'
          ? '替补完成一轮整理，更新较慢。'
          : research.leadAvailable
            ? '覆盖人员在岗，模型已更新。'
            : '已有报告可查看；覆盖人员当前不在岗，暂无新加工。'
        : '覆盖人员当前不可用，仅显示公开资料。',
    );
    setText(
      nodes.researchAsof,
      processedResearch &&
        Number.isSafeInteger(
          Number(research.asOfTick),
        )
        ? `第 ${research.asOfTick} 日`
        : '—',
    );
    setText(
      nodes.researchQuality,
      processedResearch &&
        Number.isSafeInteger(
          Number(research.qualityBps),
        )
        ? `${formatNumber(
            Number(research.qualityBps) / 100,
            0,
          )}%`
        : '—',
    );
    setText(
      nodes.researchDrivers,
      processedResearch &&
        array(research.drivers).length > 0
        ? `关注：${array(research.drivers)
            .slice(0, 4)
            .join('、')}`
        : '公告、财务与公开行情仍可查看。',
    );
    setText(
      nodes.valuationAsof,
      Number.isSafeInteger(Number(valuation.asOfTick))
        ? `日 ${valuation.asOfTick}`
        : '—',
    );
    setText(
      nodes.volumeRatio,
      Number.isFinite(Number(quote.volumeRatio))
        ? `${formatNumber(quote.volumeRatio, 2)}×`
        : '—',
    );
    const sessionVolumeShares =
      positiveInteger(view.sessionVolumeShares) ??
      positiveInteger(quote.sessionVolumeShares) ??
      0;
    const sessionTurnoverCents =
      positiveInteger(view.sessionTurnoverCents) ??
      positiveInteger(quote.sessionTurnoverCents) ??
      0;
    setText(
      nodes.sessionVolume,
      `${formatCompactQuantity(sessionVolumeShares)}股`,
    );
    setText(
      nodes.sessionTurnover,
      formatCompactCurrencyCents(sessionTurnoverCents),
    );
    const outstandingUnits =
      positiveInteger(quote.outstandingUnits);
    const floatUnits = positiveInteger(quote.floatUnits);
    setText(
      nodes.totalMarketCap,
      last && outstandingUnits
        ? formatCompactCurrencyCents(last * outstandingUnits)
        : '—',
    );
    setText(
      nodes.floatMarketCap,
      last && floatUnits
        ? formatCompactCurrencyCents(last * floatUnits)
        : '—',
    );
    setText(
      nodes.turnoverRate,
      Number.isSafeInteger(Number(quote.turnoverBps))
        ? `${formatNumber(Number(quote.turnoverBps) / 100, 2)}%`
        : '—',
    );
    const quoteCommitSeq = String(
      integer(state.snapshot.commitSeq),
    );
    const atomicQuoteNodes = [
      nodes.lastPrice,
      nodes.sessionOpen,
      nodes.sessionHigh,
      nodes.sessionLow,
      nodes.previousClose,
      nodes.volumeRatio,
      nodes.turnoverRate,
      nodes.sessionVolume,
      nodes.sessionTurnover,
      nodes.latestEvent,
      nodes.marketDataTier,
      nodes.valuationPe,
      nodes.valuationPb,
      nodes.totalMarketCap,
      nodes.floatMarketCap,
    ];
    for (const node of atomicQuoteNodes) {
      node.dataset.stageQuoteCommitSeq = quoteCommitSeq;
    }
    nodes.quoteSummary.dataset.stageQuoteCommitSeq = quoteCommitSeq;
    nodes.quoteSummary.dataset.stageLatestEventMs = String(latestEventMs);
  }

  function bookRows() {
    const view = currentView(state.snapshot, state.symbol);
    const asks = Array.from({ length: 5 }, (_, index) => ({
      side: 'ask',
      level: 5 - index,
      value: array(view.asks)[4 - index] ?? null,
    }));
    const bids = Array.from({ length: 5 }, (_, index) => ({
      side: 'bid',
      level: index + 1,
      value: array(view.bids)[index] ?? null,
    }));
    return [...asks, ...bids];
  }

  function playerQuantityAt(price, side = null) {
    const ticks = positiveInteger(price);
    if (!ticks) return 0;
    return activePlayerOrders(state.snapshot)
      .filter(
        (order) =>
          order.symbol === state.symbol &&
          positiveInteger(order.priceTicks) === ticks &&
          (side === null || order.side === side),
      )
      .reduce(
        (sum, order) =>
          sum + Math.max(0, integer(order.remainingQty)),
        0,
      );
  }

  function updateBook() {
    reconcileRows(
      nodes.bookBody,
      bookRows(),
      (item) => `${item.side}-${item.level}`,
      (item, key) => {
        const row = createRow(document, key, [
          'label',
          'price',
          'quantity',
          'count',
        ]);
        row.dataset.stageBookSide = item.side;
        row.querySelector('[data-stage-cell="quantity"]').dataset.stageBookQty =
          '';
        const priceCell = row.querySelector('[data-stage-cell="price"]');
        const priceButton = document.createElement('button');
        priceButton.type = 'button';
        priceButton.dataset.stageBookPrice = '';
        priceCell.replaceChildren(priceButton);
        return row;
      },
      (row, item) => {
        const value = object(item.value);
        row.dataset.stageBookSide = item.side;
        row.dataset.empty = item.value ? 'false' : 'true';
        setText(
          row.querySelector('[data-stage-cell="label"]'),
          `${item.side === 'ask' ? '卖' : '买'}${item.level}`,
        );
        const priceButton = row.querySelector('[data-stage-book-price]');
        const ticks = positiveInteger(value.priceTicks);
        const direction = priceDirection(
          ticks,
          currentView(state.snapshot, state.symbol)
            .previousCloseTicks,
        );
        priceButton.disabled = !item.value || !ticks;
        priceButton.dataset.stagePriceTicks = ticks ? String(ticks) : '';
        priceButton.setAttribute(
          'aria-label',
          item.value && ticks
            ? `${item.side === 'ask' ? '卖' : '买'} ${item.level}，价格 ${formatPrice(ticks)} 元，写入限价`
            : `${item.side === 'ask' ? '卖' : '买'} ${item.level}，无可用盘口`,
        );
        priceButton.title =
          item.value && ticks ? `${formatPrice(ticks)} 元` : '无可用盘口';
        setText(
          priceButton,
          item.value && ticks ? formatCompactBookPrice(ticks) : '—',
        );
        setMarketDirection(priceButton, direction);
        const quantityCell = row.querySelector(
          '[data-stage-cell="quantity"]',
        );
        const quantity = item.value ? Math.max(0, integer(value.quantity)) : 0;
        const playerQuantity = item.value
          ? Math.max(
              0,
              integer(
                value.playerQuantity,
                playerQuantityAt(
                  ticks,
                  item.side === 'ask' ? 'sell' : 'buy',
                ),
              ),
            )
          : 0;
        const compactQuantity = item.value
          ? `${formatCompactQuantity(quantity)}${
              playerQuantity
                ? '·我'
                : ''
            }`
          : '—';
        quantityCell.dataset.stageCompactQty = item.value
          ? compactQuantity
          : '—';
        quantityCell.title = item.value
          ? `${formatNumber(quantity)} 股${
              playerQuantity
                ? `，其中我的 ${formatNumber(playerQuantity)} 股`
                : ''
            }`
          : '无可用盘口';
        quantityCell.setAttribute('aria-label', quantityCell.title);
        setText(
          quantityCell,
          compactQuantity,
        );
        const countCell = row.querySelector(
          '[data-stage-cell="count"]',
        );
        const orderCount = item.value
          ? Math.max(0, integer(value.orderCount))
          : 0;
        countCell.title = item.value
          ? `${formatNumber(orderCount)} 笔订单`
          : '无可用盘口';
        countCell.setAttribute('aria-label', countCell.title);
        setText(
          countCell,
          item.value ? formatCompactQuantity(orderCount) : '—',
        );
        row.setAttribute(
          'aria-label',
          item.value && ticks
            ? `${item.side === 'ask' ? '卖' : '买'}${item.level}，价格 ${priceButton.title}，数量 ${quantityCell.title}，${countCell.title}`
            : `${item.side === 'ask' ? '卖' : '买'}${item.level}，无可用盘口`,
        );
      },
    );
    const view = currentView(state.snapshot, state.symbol);
    const bestBid = positiveInteger(object(array(view.bids)[0]).priceTicks);
    const bestAsk = positiveInteger(object(array(view.asks)[0]).priceTicks);
    setText(
      nodes.spread,
      bestBid && bestAsk
        ? `价差 ${formatPrice(Math.max(0, bestAsk - bestBid))}`
        : '价差 —',
    );
    updatePriceSelection();
  }

  function depthRows() {
    const view = currentView(state.snapshot, state.symbol);
    const entitlement = marketDataEntitlement(state.snapshot);
    const useLevel2 = state.depthMode === 'level2' && entitlement.active;
    const source = useLevel2 ? object(view.level2Depth) : view;
    const bidValues = array(source.bids).slice(0, useLevel2 ? 100 : 10);
    const askValues = array(source.asks).slice(0, useLevel2 ? 100 : 10);
    const bidCount = useLevel2 ? bidValues.length : 10;
    const askCount = useLevel2 ? askValues.length : 10;
    const asks = Array.from({ length: askCount }, (_, index) => ({
      side: 'ask',
      level: askCount - index,
      value: askValues[askCount - 1 - index] ?? null,
    }));
    const bids = Array.from({ length: bidCount }, (_, index) => ({
      side: 'bid',
      level: index + 1,
      value: bidValues[index] ?? null,
    }));
    return [...asks, ...bids];
  }

  function updateDepthEntitlement() {
    const entitlement = marketDataEntitlement(state.snapshot);
    const controls = nodes.depthModeSelect.closest(
      '[data-stage-depth-mode]',
    );
    controls.dataset.stageDepthMode = state.depthMode;
    nodes.depthModeSelect.value = state.depthMode;
    if (entitlement.active) {
      state.level2ActivationPending = false;
      state.level2ActivationRequested = false;
      setText(
        nodes.level2Status,
        entitlement.expiresAtTick
          ? `百档行情已开通 · 至世界日 ${entitlement.expiresAtTick}`
          : '百档行情已开通',
      );
    } else if (!entitlement.supported) {
      setText(nodes.level2Status, '百档行情尚未发布');
    } else {
      const suffix = state.level2ActivationRequested
        ? ' · 开通中'
        : entitlement.status === 'expired'
          ? ' · 已到期'
          : '';
      setText(nodes.level2Status, `百档行情尚未开通${suffix}`);
    }
    const showActivation =
      state.depthMode === 'level2' &&
      entitlement.supported &&
      entitlement.eligible &&
      !entitlement.active;
    level2ActivationButton.hidden = !showActivation;
    level2ActivationButton.disabled =
      state.level2ActivationPending ||
      state.level2ActivationRequested ||
      !capabilities.submit;
    if (showActivation) {
      const price = entitlement.costCents
        ? ` ${formatMoneyFromCents(entitlement.costCents)}`
        : '';
      setText(
        level2ActivationButton,
        state.level2ActivationPending
          ? '发送中…'
          : `${entitlement.status === 'expired' ? '续开' : '开通'}${price}`,
      );
    }
  }

  function updateDepthDetail() {
    updateDepthEntitlement();
    const entitlement = marketDataEntitlement(state.snapshot);
    const useLevel2 = state.depthMode === 'level2' && entitlement.active;
    const visible =
      compactQuery?.matches
        ? state.mobileTask === 'depth'
        : nodes.depthDetail.open;
    if (!visible) {
      nodes.depthDetailBody.replaceChildren();
      return;
    }
    const rows = depthRows();
    reconcileRows(
      nodes.depthDetailBody,
      rows,
      (item) => `${item.side}-${item.level}`,
      (item, key) => createRow(document, key, ['side', 'level', 'price', 'quantity', 'count']),
      (row, item) => {
        const value = object(item.value);
        const ticks = positiveInteger(value.priceTicks);
        row.dataset.stageBookSide = item.side;
        row.dataset.empty = item.value && ticks ? 'false' : 'true';
        setText(row.querySelector('[data-stage-cell="side"]'), item.side === 'ask' ? '卖' : '买');
        setText(row.querySelector('[data-stage-cell="level"]'), formatNumber(item.level));
        const priceCell = row.querySelector('[data-stage-cell="price"]');
        let priceButton = priceCell.querySelector('[data-stage-depth-price]');
        if (!priceButton) {
          priceButton = document.createElement('button');
          priceButton.type = 'button';
          priceButton.dataset.stageDepthPrice = '';
          priceCell.replaceChildren(priceButton);
        }
        priceButton.disabled = !item.value || !ticks;
        priceButton.dataset.stagePriceTicks = ticks ? String(ticks) : '';
        priceButton.setAttribute(
          'aria-label',
          item.value && ticks
            ? `${item.side === 'ask' ? '卖' : '买'} ${item.level}，价格 ${formatPrice(ticks)} 元，写入限价`
            : `${item.side === 'ask' ? '卖' : '买'} ${item.level}，无可用盘口`,
        );
        setText(priceButton, ticks ? formatPrice(ticks) : '—');
        setMarketDirection(
          priceButton,
          priceDirection(
            ticks,
            currentView(state.snapshot, state.symbol)
              .previousCloseTicks,
          ),
        );
        const playerQuantity = item.value
          ? Math.max(
              0,
              integer(
                value.playerQuantity,
                playerQuantityAt(
                  ticks,
                  item.side === 'ask' ? 'sell' : 'buy',
                ),
              ),
            )
          : 0;
        setText(
          row.querySelector('[data-stage-cell="quantity"]'),
          item.value
            ? `${formatNumber(value.quantity)}${
                playerQuantity
                  ? ` · 我 ${formatNumber(playerQuantity)}`
                  : ''
              }`
            : '—',
        );
        setText(row.querySelector('[data-stage-cell="count"]'), item.value ? formatNumber(value.orderCount) : '—');
      },
    );
    if (useLevel2) {
      const bidCount = rows.filter((item) => item.side === 'bid').length;
      const askCount = rows.length - bidCount;
      setText(
        nodes.depthDetailCaption,
        `百档盘口：卖 ${askCount} 档、买 ${bidCount} 档`,
      );
    } else {
      setText(
        nodes.depthDetailCaption,
        '十档盘口；暂无挂单的档位以“—”表示',
      );
    }
    updatePriceSelection();
  }

  function depthPath(levels, side, maximum) {
    let cumulative = 0;
    const values = array(levels).slice(0, 5);
    const points = values.map((level, index) => {
      cumulative += Math.max(0, finite(level.quantity));
      const x =
        side === 'bid'
          ? 500 - ((index + 1) / 5) * 470
          : 500 + ((index + 1) / 5) * 470;
      const y = 214 - (cumulative / Math.max(1, maximum)) * 174;
      return `${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    if (!points.length) return '';
    const edge = side === 'bid' ? '30 220' : '970 220';
    return `M 500 220 L ${points.join(' L ')} L ${edge} Z`;
  }

  function updateDepth() {
    const view = currentView(state.snapshot, state.symbol);
    const bids = array(view.bids).slice(0, 5);
    const asks = array(view.asks).slice(0, 5);
    const bidTotal = bids.reduce(
      (sum, level) => sum + Math.max(0, finite(level.quantity)),
      0,
    );
    const askTotal = asks.reduce(
      (sum, level) => sum + Math.max(0, finite(level.quantity)),
      0,
    );
    const maximum = Math.max(bidTotal, askTotal, 1);
    root
      .querySelector('[data-stage-depth-path="bid"]')
      .setAttribute('d', depthPath(bids, 'bid', maximum));
    root
      .querySelector('[data-stage-depth-path="ask"]')
      .setAttribute('d', depthPath(asks, 'ask', maximum));

    const allPrices = [...bids, ...asks]
      .map((level) => positiveInteger(level.priceTicks))
      .filter(Boolean);
    const limit =
      selectedOrderType() === 'limit'
        ? priceTicks(nodes.limitInput.value)
        : null;
    nodes.limitLine.hidden = !limit;
    if (limit) {
      const minimum = allPrices.length
        ? Math.min(...allPrices)
        : limit;
      const maximumPrice = allPrices.length
        ? Math.max(...allPrices)
        : limit;
      const span = Math.max(1, maximumPrice - minimum);
      const x = 30 + ((limit - minimum) / span) * 940;
      const boundedX = String(Math.max(30, Math.min(970, x)));
      nodes.limitLine.setAttribute('x1', boundedX);
      nodes.limitLine.setAttribute('x2', boundedX);
    }
    const capacity = object(object(state.snapshot.capacity).player);
    const risk = Math.max(
      0,
      Math.min(
        100,
        finite(capacity.footprintBps ?? capacity.fundingStressBps) / 10,
      ),
    );
    nodes.riskRing.style.strokeDasharray = `${risk} ${100 - risk}`;
    setText(
      nodes.depthSummary,
      `${state.symbol} 累计买盘 ${formatNumber(
        bidTotal,
      )} 股，累计卖盘 ${formatNumber(askTotal)} 股；${
        limit
          ? `当前限价 ${formatPrice(limit)}`
          : selectedOrderType() === 'market'
            ? '当前为市价单'
            : '尚未输入限价'
      }。`,
    );
    updateDepthDetail();
  }

  function updateTrades() {
    const trades = currentTrades(state.snapshot, state.symbol).slice(0, 16);
    reconcileRows(
      nodes.tradeBody,
      trades,
      (trade) => trade.id ?? `${trade.virtualMs}-${trade.priceTicks}`,
      (trade, key) =>
        createRow(document, key, ['time', 'side', 'price', 'quantity', 'event']),
      (row, trade) => {
        row.dataset.stageTradeId = trade.id ?? '';
        setText(
          row.querySelector('[data-stage-cell="time"]'),
          formatClock(trade.virtualMs),
        );
        setText(
          row.querySelector('[data-stage-cell="side"]'),
          trade.side === 'sell' ? '卖' : '买',
        );
        const priceCell = row.querySelector(
          '[data-stage-cell="price"]',
        );
        setText(
          priceCell,
          formatPrice(tradePriceTicks(trade)),
        );
        setMarketDirection(
          priceCell,
          priceDirection(
            tradePriceTicks(trade),
            currentView(state.snapshot, state.symbol)
              .previousCloseTicks,
          ),
        );
        setText(
          row.querySelector('[data-stage-cell="quantity"]'),
          formatNumber(trade.quantity),
        );
        setText(
          row.querySelector('[data-stage-cell="event"]'),
          '已成交',
        );
      },
    );
    if (!trades.length) {
      nodes.tradeBody.replaceChildren(
        createEmptyRow(
          document,
          '当前股票暂无逐笔成交。',
        ),
      );
    }
  }

  function updateOrders() {
    const orders = activePlayerOrders(state.snapshot);
    const signature = orders
      .map((order) => [
        order.id,
        order.symbol,
        order.side,
        order.priceTicks,
        order.remainingQty,
        order.originalQty,
        order.submittedMs,
        order.status,
        currentView(state.snapshot, order.symbol)
          .previousCloseTicks,
      ].join(':'))
      .concat(capabilities.cancel ? 'cancel:1' : 'cancel:0')
      .join('|');
    if (signature === state.orderRowsSignature) return;
    const focusedControl = nodes.orderBody.contains(document.activeElement)
      ? document.activeElement
      : null;
    reconcileRows(
      nodes.orderBody,
      orders,
      (order) => order.id,
      (order, key) => {
        const row = createRow(document, key, [
          'id',
          'side',
          'price',
          'remaining',
          'action',
        ]);
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.stageCancel = key;
        row.querySelector('[data-stage-cell="action"]').append(button);
        return row;
      },
      (row, order) => {
        row.dataset.stageOrderId = order.id;
        setText(
          row.querySelector('[data-stage-cell="id"]'),
          Number.isFinite(Number(order.submittedMs))
            ? formatClock(order.submittedMs)
            : '—',
        );
        setText(
          row.querySelector('[data-stage-cell="side"]'),
          order.side === 'sell' ? '卖' : '买',
        );
        const priceCell = row.querySelector(
          '[data-stage-cell="price"]',
        );
        setText(
          priceCell,
          formatPrice(order.priceTicks),
        );
        setMarketDirection(
          priceCell,
          priceDirection(
            order.priceTicks,
            currentView(state.snapshot, order.symbol)
              .previousCloseTicks,
          ),
        );
        setText(
          row.querySelector('[data-stage-cell="remaining"]'),
          `${formatNumber(order.remainingQty)} / ${formatNumber(
            order.originalQty,
          )}`,
        );
        const button = row.querySelector('[data-stage-cancel]');
        if (button.dataset.stageCancel !== order.id) {
          button.dataset.stageCancel = order.id;
        }
        setText(button, '撤单');
        const cancelLabel = `撤销${
          order.side === 'sell' ? '卖出' : '买入'
        } ${order.symbol ?? '当前证券'} ${formatPrice(
          order.priceTicks,
        )} 元委托`;
        if (button.getAttribute('aria-label') !== cancelLabel) {
          button.setAttribute('aria-label', cancelLabel);
        }
        if (button.disabled === capabilities.cancel) {
          button.disabled = !capabilities.cancel;
        }
      },
    );
    if (!orders.length) {
      nodes.orderBody.replaceChildren(
        createEmptyRow(
          document,
          '当前没有可撤销委托。',
        ),
      );
    }
    if (focusedControl && !nodes.orderBody.contains(focusedControl)) {
      nodes.submitOrder.focus();
    }
    state.orderRowsSignature = signature;
  }

  function agentItems() {
    const ecology = object(state.snapshot.agentEcology);
    if (ecology.publication === 'anonymous_aggregate_v1') {
      return array(ecology.actionAggregates)
        .filter(
          (aggregate) =>
            aggregate?.symbol === state.symbol &&
            ['buy', 'sell'].includes(aggregate?.side) &&
            integer(aggregate?.actionCount) > 0 &&
            integer(aggregate?.participantCount) > 0,
        )
        .sort(
          (left, right) =>
            integer(right.windowEndMs) - integer(left.windowEndMs) ||
            integer(right.actionCount) - integer(left.actionCount) ||
            String(left.side).localeCompare(String(right.side)) ||
            String(left.urgency).localeCompare(String(right.urgency)) ||
            String(left.quantityBucket).localeCompare(
              String(right.quantityBucket),
            ),
        )
        .slice(0, 8)
        .map((aggregate) => ({
          key: [
            'group',
            integer(aggregate.windowStartMs),
            aggregate.symbol,
            aggregate.side,
            aggregate.urgency,
            aggregate.quantityBucket,
          ].join(':'),
          publicAggregate: true,
          virtualMs: integer(aggregate.windowEndMs),
          symbol: aggregate.symbol,
          side: aggregate.side,
          urgency: aggregate.urgency,
          quantityBucket: aggregate.quantityBucket,
          actionCount: Math.max(0, integer(aggregate.actionCount)),
          participantCount: Math.max(
            0,
            integer(aggregate.participantCount),
          ),
        }));
    }

    const agents = object(ecology.agents);
    const tradeSymbols = new Map(
      array(state.snapshot.trades)
        .filter((trade) => trade?.id)
        .map((trade) => [trade.id, trade.symbol]),
    );
    return array(ecology.recentActivity)
      .slice()
      .filter((activity) => {
        const observed = array(activity.observedTradeIds);
        return (
          !observed.length ||
          observed.some((tradeId) => tradeSymbols.get(tradeId) === state.symbol)
        );
      })
      .sort(
        (left, right) =>
          finite(right.virtualMs) - finite(left.virtualMs) ||
          String(right.id).localeCompare(String(left.id)),
      )
      .slice(0, 8)
      .map((activity) => {
        const agent = object(agents[activity.agentId]);
        const observedCount = array(activity.observedTradeIds).length;
        const acceptedCount = Math.max(
          0,
          integer(activity.acceptedCount),
        );
        const rejectedCount = Math.max(
          0,
          integer(activity.rejectedCount),
        );
        return {
          key: String(activity.id),
          publicAggregate: false,
          virtualMs: integer(activity.virtualMs),
          name: agent.name ?? '市场参与者',
          observedCount,
          acceptedCount,
          rejectedCount,
          pendingCount: Math.max(
            0,
            integer(activity.commandCount) -
              integer(activity.processedCount),
          ),
        };
      });
  }

  function updateShareholders() {
    const view = currentView(state.snapshot, state.symbol);
    const shareholders = object(view.shareholders);
    const holders = array(shareholders.top)
      .filter(
        (holder) =>
          positiveInteger(holder.rank) &&
          typeof holder.name === 'string' &&
          holder.name.trim().length > 0 &&
          Number.isFinite(Number(holder.quantity)) &&
          Number(holder.quantity) >= 0,
      )
      .slice(0, 5);
    reconcileRows(
      nodes.shareholderBody,
      holders,
      (holder) => `${holder.rank}:${holder.name}`,
      () =>
        createRow(document, '', [
          'rank',
          'holder',
          'holding',
          'ownership',
        ]),
      (row, holder) => {
        row.dataset.stagePlayerHolder =
          holder.isPlayer ? 'true' : 'false';
        setText(
          row.querySelector('[data-stage-cell="rank"]'),
          holder.rank,
        );
        setText(
          row.querySelector('[data-stage-cell="holder"]'),
          `${holder.name.trim()}${
            holder.beneficialOwner
              ? `\n受益：${holder.beneficialOwner}`
              : ''
          }`,
        );
        setText(
          row.querySelector('[data-stage-cell="holding"]'),
          `${formatNumber(Math.max(0, integer(holder.quantity)))}${
            finite(holder.lockedUnits) > 0
              ? `\n锁定 ${formatNumber(Math.max(0, integer(holder.lockedUnits)))}`
              : ''
          }`,
        );
        const ownershipBps = Math.max(
          0,
          finite(holder.ownershipBps),
        );
        setText(
          row.querySelector('[data-stage-cell="ownership"]'),
          `${(ownershipBps / 100).toFixed(2)}%${
            Number.isFinite(Number(holder.votingRightsBps))
              ? `\n表决 ${(Math.max(0, finite(holder.votingRightsBps)) / 100).toFixed(2)}%`
              : ''
          }${
            finite(holder.pledgedUnits) > 0
              ? `\n质押 ${formatNumber(Math.max(0, integer(holder.pledgedUnits)))}`
              : ''
          }`,
        );
      },
    );
    if (!holders.length) {
      const row = createEmptyRow(
        document,
        '当前证券尚无可显示的持股记录。',
        4,
      );
      row.dataset.stageKey = 'empty';
      nodes.shareholderBody.replaceChildren(row);
    }
    const outstandingUnits = Math.max(
      0,
      integer(shareholders.outstandingUnits),
    );
    const othersUnits = Math.max(
      0,
      integer(shareholders.othersUnits),
    );
    const registeredUnits = Math.max(
      0,
      integer(
        shareholders.registeredUnits ??
          shareholders.accountedUnits,
      ),
    );
    const votingRightsBpsTotal = Math.max(
      0,
      integer(shareholders.votingRightsBpsTotal),
    );
    setText(
      nodes.shareholderSummary,
      holders.length
        ? `总股本 ${formatNumber(outstandingUnits)} 股 · 其余 ${formatNumber(
            othersUnits,
          )} 股 · 名册 ${formatNumber(registeredUnits)} 股 · 表决权口径 ${(
            votingRightsBpsTotal / 100
          ).toFixed(2)}%`
        : '股东数据连接中。',
    );
  }

  function updateAgents() {
    updateShareholders();
    const items = agentItems();
    reconcileRows(
      nodes.agentList,
      items,
      (item) => item.key,
      () => {
        const item = document.createElement('li');
        item.innerHTML = `
          <div><strong data-stage-agent-name></strong><span data-stage-agent-time></span></div>
          <p data-stage-agent-summary></p>
          <small data-stage-agent-anchor></small>`;
        return item;
      },
      (item, entry) => {
        const name = item.querySelector('[data-stage-agent-name]');
        if (entry.publicAggregate) {
          const urgencyLabel = {
            aggressive: '市价',
            immediate: '即时',
            resting: '挂单',
          }[entry.urgency] ?? '挂单';
          const quantityLabel = {
            micro: '微量',
            small: '小额',
            medium: '中量',
            large: '大额',
            block: '大宗',
          }[entry.quantityBucket] ?? '中量';
          setText(
            name,
            entry.side === 'buy' ? '买方群体' : '卖方群体',
          );
          setMarketDirection(
            name,
            entry.side === 'buy' ? 'up' : 'down',
          );
          setText(
            item.querySelector('[data-stage-agent-time]'),
            formatClock(entry.virtualMs),
          );
          setText(
            item.querySelector('[data-stage-agent-summary]'),
            `${urgencyLabel} · ${quantityLabel} · ${formatNumber(
              entry.participantCount,
            )} 方 / ${formatNumber(entry.actionCount)} 次`,
          );
          setText(
            item.querySelector('[data-stage-agent-anchor]'),
            `${entry.symbol} · 市场群体活动`,
          );
          return;
        }

        setMarketDirection(name, 'unknown');
        const actionLabel = entry.observedCount > 0
          ? `成交响应 · ${formatNumber(entry.observedCount)} 笔`
          : '市场动作';
        const resultLabel = entry.acceptedCount > 0
          ? `挂单/撤单 ${formatNumber(entry.acceptedCount)} 笔`
          : '暂未形成新委托';
        const constrainedLabel = entry.rejectedCount > 0
          ? ` · 受限 ${formatNumber(entry.rejectedCount)} 笔`
          : '';
        const pendingLabel = entry.pendingCount > 0
          ? ` · 在途 ${formatNumber(entry.pendingCount)} 笔`
          : '';
        setText(
          name,
          entry.name,
        );
        setText(
          item.querySelector('[data-stage-agent-time]'),
          formatClock(entry.virtualMs),
        );
        setText(
          item.querySelector('[data-stage-agent-summary]'),
          `${actionLabel} · ${resultLabel}${constrainedLabel}${pendingLabel}`,
        );
        setText(
          item.querySelector('[data-stage-agent-anchor]'),
          entry.observedCount > 0
            ? `涉及 ${formatNumber(entry.observedCount)} 笔公开成交`
            : '公开盘口可见',
        );
      },
    );
    if (!items.length) {
      const item = document.createElement('li');
      item.dataset.stageKey = 'empty';
      item.dataset.stageEmpty = 'true';
      item.textContent = '市场主体暂未出现新的公开动作。';
      nodes.agentList.replaceChildren(item);
    }
  }

  function optionalMetric(value, formatter, empty = '待连接') {
    return value === null || value === undefined || !Number.isFinite(Number(value))
      ? empty
      : formatter(value);
  }

  function updateFunds() {
    const account = object(
      object(state.snapshot.accounts).player,
    );
    const portfolio = object(account.portfolio);
    const positions = object(portfolio.positions);
    const hasPortfolio = Object.keys(portfolio).length > 0;
    if (!hasPortfolio) {
      setText(nodes.fundsTotalPnl, '—');
      setText(nodes.fundsDayPnl, '—');
      setText(nodes.fundsMarketValue, '—');
      setMarketDirection(nodes.fundsTotalPnl, 'unknown');
      setMarketDirection(nodes.fundsDayPnl, 'unknown');
      nodes.fundsPositionBody.replaceChildren(
        createEmptyRow(
          document,
          '持仓数据正在更新。',
          5,
        ),
      );
      setText(
        nodes.fundsStatus,
        '资金数据连接中。',
      );
      return;
    }

    setText(
      nodes.fundsTotalPnl,
      formatSignedMoneyFromCents(portfolio.totalPnlCents),
    );
    setMarketDirection(
      nodes.fundsTotalPnl,
      signedDirection(portfolio.totalPnlCents),
    );
    setText(
      nodes.fundsDayPnl,
      formatSignedMoneyFromCents(portfolio.dayPnlCents),
    );
    setMarketDirection(
      nodes.fundsDayPnl,
      signedDirection(portfolio.dayPnlCents),
    );
    setText(
      nodes.fundsMarketValue,
      formatMoneyFromCents(portfolio.marketValueCents),
    );

    const entries = [
      ...new Set([
        ...symbolList(state.snapshot, state.world),
        ...Object.keys(positions),
      ]),
    ]
      .map((symbol) => ({
        symbol,
        position: object(positions[symbol]),
      }))
      .filter(
        ({ position }) =>
          Math.max(0, integer(position.quantity)) > 0,
      );
    reconcileRows(
      nodes.fundsPositionBody,
      entries,
      ({ symbol }) => symbol,
      (_entry, key) =>
        createRow(document, key, [
          'symbol',
          'quantity',
          'cost',
          'last',
          'return',
        ]),
      (row, entry) => {
        const { symbol, position } = entry;
        row.dataset.stagePositionSymbol = symbol;
        const meta = symbolMeta(state.world, symbol);
        setText(
          row.querySelector('[data-stage-cell="symbol"]'),
          `${symbol} ${meta.name}`,
        );
        setText(
          row.querySelector('[data-stage-cell="quantity"]'),
          formatNumber(position.quantity),
        );
        setText(
          row.querySelector('[data-stage-cell="cost"]'),
          positionDisplayCostTicks(position)
            ? formatPrice(positionDisplayCostTicks(position))
            : '—',
        );
        const lastCell = row.querySelector(
          '[data-stage-cell="last"]',
        );
        setText(
          lastCell,
          positiveInteger(position.lastPriceTicks)
            ? formatPrice(position.lastPriceTicks)
            : '—',
        );
        setMarketDirection(
          lastCell,
          priceDirection(
            position.lastPriceTicks,
            currentView(state.snapshot, symbol)
              .previousCloseTicks,
          ),
        );
        const returnCell = row.querySelector(
          '[data-stage-cell="return"]',
        );
        setText(
          returnCell,
          formatSignedPercentFromBps(
            positionDisplayReturnBps(position),
          ),
        );
        setMarketDirection(
          returnCell,
          signedDirection(positionDisplayReturnBps(position)),
        );
      },
    );
    if (!entries.length) {
      nodes.fundsPositionBody.replaceChildren(
        createEmptyRow(document, '当前没有证券持仓。', 5),
      );
    }
    setText(
      nodes.fundsStatus,
      `持仓 ${formatNumber(entries.length)} 只`,
    );
  }

  function updateRisk() {
    const account = object(object(state.snapshot.accounts).player);
    const capacity = object(object(state.snapshot.capacity).player);
    const cash = finite(account.cashCents);
    const reserved = finite(account.reservedCashCents);
    const holding = Math.max(0, finite(object(account.holdings)[state.symbol]));
    const reservedHolding = Math.max(
      0,
      finite(object(account.reservedHoldings)[state.symbol]),
    );
    setText(nodes.availableCash, formatMoneyFromCents(Math.max(0, cash - reserved)));
    setText(nodes.reservedCash, formatMoneyFromCents(reserved));
    setText(
      nodes.availableHolding,
      `${state.symbol || '当前证券'} · ${formatNumber(
        Math.max(0, holding - reservedHolding),
      )} 股`,
    );
    setText(
      nodes.reservedHolding,
      `${state.symbol || '当前证券'} · ${formatNumber(reservedHolding)} 股`,
    );
    setText(
      nodes.footprint,
      optionalMetric(capacity.footprintBps, formatPercentFromBps),
    );
    setText(
      nodes.slippage,
      optionalMetric(capacity.slippageBps, formatPercentFromBps),
    );
    setText(
      nodes.drawdown,
      optionalMetric(
        capacity.drawdownBps ?? account.drawdownBps,
        formatPercentFromBps,
      ),
    );
    setText(
      nodes.fundingStress,
      optionalMetric(
        capacity.fundingStressBps ?? account.fundingStressBps,
        formatPercentFromBps,
      ),
    );
    setText(
      nodes.completionTime,
      optionalMetric(capacity.completionTimeMs, formatDuration),
    );
    setText(
      nodes.activeCount,
      formatNumber(
        capacity.activeOrderCount ?? activePlayerOrders(state.snapshot).length,
      ),
    );
    setText(nodes.mobileCash, formatMoneyFromCents(Math.max(0, cash - reserved)));
    setText(
      nodes.mobileHolding,
      `${formatNumber(Math.max(0, holding - reservedHolding))} 股`,
    );
    setText(
      nodes.mobileActiveCount,
      formatNumber(capacity.activeOrderCount ?? activePlayerOrders(state.snapshot).length),
    );
  }

  function updateRoleConsole() {
    const consoleNode = root.querySelector('[data-stage-role-console]');
    if (!consoleNode) return;
    const runtime = object(state.snapshot.playerRoleAutomation);
    const roleState = object(object(state.world.player).roleState);
    const quant = consoleNode.dataset.roleConsole === 'quant';
    const configuration = quant
      ? object(roleState.strategyLab)
      : object(roleState.stabilityDesk);
    const enabled = configuration.automationEnabled === true;
    const latest = array(runtime.recentDecisions).at(-1);
    const status = consoleNode.querySelector('[data-stage-role-status]');
    const summary = consoleNode.querySelector('[data-stage-role-summary]');
    const strategies = consoleNode.querySelector(
      '[data-stage-role-strategies]',
    );
    const decisions = consoleNode.querySelector('[data-stage-role-decisions]');
    const filled = consoleNode.querySelector('[data-stage-role-filled]');
    const toggle = consoleNode.querySelector('[data-stage-role-toggle]');
    setText(status, enabled ? '自动运行' : '自动暂停');
    status.dataset.active = enabled ? 'true' : 'false';
    if (quant) {
      const selected = array(configuration.selectedStrategyIds);
      setText(strategies, `${formatNumber(selected.length)} 个组合`);
      setText(
        summary,
        latest
          ? `${latest.symbol ?? '全市场'} · ${latest.status === 'no_action' ? '本轮未触发' : `${latest.side === 'sell' ? '卖出' : '买入'}决策`} · 风险模式 ${configuration.riskMode ?? '—'}`
          : '策略只读取公开估值、质量、价格与盘口热状态。',
      );
    } else {
      const targetLabel = {
        balanced: '均衡',
        systemic: '系统性风险',
        liquidity: '流动性修复',
      }[configuration.targetMode] ?? '—';
      setText(strategies, targetLabel);
      setText(
        summary,
        latest
          ? `${latest.symbol ?? '全市场'} · ${latest.status === 'no_action' ? '保持观察' : `${latest.side === 'sell' ? '退出' : '介入'}决策`}`
          : '平静市场不进场；达到协议阈值才提交真实订单。',
      );
    }
    setText(decisions, formatNumber(runtime.totalDecisions ?? 0));
    setText(filled, formatNumber(runtime.totalFilledQuantity ?? 0));
    toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    toggle.disabled = !capabilities.submit;
    setText(
      toggle,
      enabled
        ? quant
          ? '暂停自动交易'
          : '暂停自动稳定'
        : quant
          ? '启动自动交易'
          : '启动自动稳定',
    );
  }

  function updateFlowStrip() {
    const nowMs = Math.max(0, finite(state.snapshot.nowMs));
    const recentTrades = array(state.snapshot.trades).filter(
      (trade) =>
        trade?.symbol === state.symbol &&
        (!trade.source || trade.source === 'realtime_order_book') &&
        finite(trade.virtualMs) >= Math.max(0, nowMs - 60_000) &&
        finite(trade.virtualMs) <= nowMs,
    );
    const buyVolume = recentTrades
      .filter((trade) => trade.side === 'buy')
      .reduce((sum, trade) => sum + Math.max(0, integer(trade.quantity)), 0);
    const sellVolume = recentTrades
      .filter((trade) => trade.side === 'sell')
      .reduce((sum, trade) => sum + Math.max(0, integer(trade.quantity)), 0);
    const totalVolume = buyVolume + sellVolume;
    const buyShare = totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 50;
    nodes.flowBuyBar.style.width = `${buyShare.toFixed(2)}%`;
    nodes.flowSellBar.style.width = `${(100 - buyShare).toFixed(2)}%`;
    setText(
      nodes.flowTrades,
      `${formatNumber(recentTrades.length)} 笔 · ${formatCompactQuantity(
        totalVolume,
      )} 股`,
    );
    setText(nodes.flowBuyVolume, `${formatCompactQuantity(buyVolume)} 股`);
    setText(nodes.flowSellVolume, `${formatCompactQuantity(sellVolume)} 股`);

    const view = currentView(state.snapshot, state.symbol);
    const bids = array(view.bids);
    const asks = array(view.asks);
    const bestBid = positiveInteger(object(bids[0]).priceTicks);
    const bestAsk = positiveInteger(object(asks[0]).priceTicks);
    const bidDepth = bids.reduce(
      (sum, level) => sum + Math.max(0, integer(level?.quantity)),
      0,
    );
    const askDepth = asks.reduce(
      (sum, level) => sum + Math.max(0, integer(level?.quantity)),
      0,
    );
    setText(
      nodes.flowSpread,
      bestBid && bestAsk
        ? formatPrice(Math.max(0, bestAsk - bestBid))
        : '—',
    );
    setText(
      nodes.flowDepth,
      `${formatCompactQuantity(bidDepth)} / ${formatCompactQuantity(
        askDepth,
      )}`,
    );
  }

  function updatePreview() {
    updateQuantityPresets();
    const view = currentView(state.snapshot, state.symbol);
    const side = selectedSide();
    const orderType = selectedOrderType();
    const limit = priceTicks(nodes.limitInput.value);
    const quantity = positiveInteger(nodes.quantityInput.value);
    if (!quantity || (orderType === 'limit' && !limit)) {
      setText(
        nodes.impactPreview,
        orderType === 'market'
          ? '请输入有效的整数数量。'
          : '请输入有效的正数限价与整数数量。',
      );
      nodes.impactPreview.dataset.impact = 'invalid';
      updateOrderRequestState();
      updateDepth();
      return;
    }
    const depthSource =
      orderType === 'market' && object(view.level2Depth).depth
        ? object(view.level2Depth)
        : view;
    const levels =
      side === 'buy'
        ? array(depthSource.asks)
        : array(depthSource.bids);
    const eligible =
      orderType === 'market'
        ? levels
        : levels.filter((level) =>
            side === 'buy'
              ? finite(level.priceTicks) <= limit
              : finite(level.priceTicks) >= limit,
          );
    let remaining = quantity;
    let filled = 0;
    let grossCents = 0;
    let levelsUsed = 0;
    for (const level of eligible) {
      if (remaining <= 0) break;
      const amount = Math.min(remaining, Math.max(0, integer(level.quantity)));
      if (!amount) continue;
      filled += amount;
      remaining -= amount;
      grossCents += amount * finite(level.priceTicks);
      levelsUsed += 1;
    }
    const totalDepth = levels.reduce(
      (sum, level) => sum + Math.max(0, finite(level.quantity)),
      0,
    );
    const highImpact =
      levelsUsed > 1 || filled / Math.max(1, totalDepth) >= 0.25;
    const account = object(object(state.snapshot.accounts).player);
    const holding = finite(object(account.holdings)[state.symbol]);
    const reservedHolding = finite(
      object(account.reservedHoldings)[state.symbol],
    );
    const boundary =
      side === 'buy'
        ? `可用现金 ${formatMoneyFromCents(
            finite(account.cashCents) - finite(account.reservedCashCents),
          )}`
        : `可用持仓 ${formatNumber(
            Math.max(0, holding - reservedHolding),
          )} 股，锁定 ${formatNumber(Math.max(0, reservedHolding))} 股`;
    const averageTicks =
      filled > 0 ? Math.round(grossCents / filled) : null;
    setText(
      nodes.impactPreview,
      orderType === 'market'
        ? `市价单预计成交 ${formatNumber(filled)} / ${formatNumber(
            quantity,
          )} 股，均价 ${
            averageTicks ? formatPrice(averageTicks) : '—'
          }，穿越 ${formatNumber(levelsUsed)} 档；未成交余量自动撤销，${boundary}。`
        : `预计可成交 ${formatNumber(filled)} / ${formatNumber(
            quantity,
          )} 股，金额 ${formatMoneyFromCents(grossCents)}，消耗 ${formatNumber(
            levelsUsed,
          )} 档；${boundary}。实际成交以盘口变化为准。`,
    );
    nodes.impactPreview.dataset.impact = highImpact ? 'high' : 'normal';
    updateOrderRequestState();
    updateDepth();
  }

  function resizeCanvas() {
    const canvas = nodes.chart;
    if (!state.canvasMetrics) {
      const bounds = canvas.getBoundingClientRect();
      state.canvasMetrics = {
        width: Math.max(1, Math.round(bounds.width || 640)),
        height: Math.max(1, Math.round(bounds.height || 320)),
      };
    }
    const { width, height } = state.canvasMetrics;
    const dpr = Math.min(Math.max(1, finite(window.devicePixelRatio, 1)), 2);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext('2d');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { context, width, height };
  }

  function updateChartData(points, series) {
    const timeframe = CHART_TIMEFRAMES[state.chartMode];
    const intervalMs = Math.max(0, integer(series.intervalMs));
    const displayTimeOffsetMs = Math.max(
      0,
      integer(series.displayTimeOffsetMs),
    );
    setText(
      nodes.chartDataSummary,
      `图表数据表（${timeframe.label}）`,
    );
    setText(
      nodes.chartDataCaption,
      series.kind === 'candles'
        ? `当前证券${timeframe.summary}的开、高、低、收与成交量`
        : `当前证券${timeframe.summary}的端点价格与成交量`,
    );
    if (!nodes.chartDataDetail.open) {
      nodes.chartDataBody.replaceChildren();
      return;
    }
    reconcileRows(
      nodes.chartDataBody,
      points,
      (point) => point.key,
      (point, key) =>
        createRow(document, key, [
          'time',
          'open',
          'high',
          'low',
          'close',
          'volume',
        ]),
      (row, point) => {
        row.dataset.stageHasTrade = point.hasTrade ? 'true' : 'false';
        const displayMs =
          series.kind === 'candles' ? point.startMs : point.virtualMs;
        setText(
          row.querySelector('[data-stage-cell="time"]'),
          intervalMs >= NATURAL_DAY_MS
            ? chartAxisLabel(displayMs, intervalMs, true)
            : formatClock(displayMs + displayTimeOffsetMs),
        );
        for (const key of ['open', 'high', 'low', 'close']) {
          setText(
            row.querySelector(`[data-stage-cell="${key}"]`),
            formatPrice(point[key]),
          );
        }
        setText(
          row.querySelector('[data-stage-cell="volume"]'),
          formatNumber(point.volume),
        );
      },
    );
    if (!points.length) {
      nodes.chartDataBody.replaceChildren(
        createEmptyRow(
          document,
          `当前证券在${timeframe.label}可见域内尚无成交数据。`,
          6,
        ),
      );
    }
  }

  function drawChart() {
    const { context, width, height } = resizeCanvas();
    const series = getChartSeries();
    const chartView = currentView(state.snapshot, state.symbol);
    const chartAuthority = object(chartView.chartAuthority);
    const rawPoints = chartEntries(series);
    const previousCloseTicks =
      positiveInteger(chartView.previousCloseTicks);
    const hasAuthoritativeTradePoint = rawPoints.some(
      (point) => point.hasTrade,
    );
    const sessionOpeningTicks =
      (
        hasAuthoritativeTradePoint
          ? positiveInteger(series.openingTicks)
          : null
      ) ??
      positiveInteger(chartAuthority.openingTicks) ??
      positiveInteger(chartView.sessionOpenTicks);
    const sessionHighTicks =
      (
        hasAuthoritativeTradePoint
          ? positiveInteger(series.sessionHighTicks)
          : null
      ) ??
      positiveInteger(chartAuthority.highTicks) ??
      positiveInteger(chartView.sessionHighTicks);
    const sessionLowTicks =
      (
        hasAuthoritativeTradePoint
          ? positiveInteger(series.sessionLowTicks)
          : null
      ) ??
      positiveInteger(chartAuthority.lowTicks) ??
      positiveInteger(chartView.sessionLowTicks);
    const carryOnlyWithoutSessionOpening =
      series.kind === 'line' &&
      !sessionOpeningTicks &&
      !hasAuthoritativeTradePoint &&
      previousCloseTicks;
    const points = carryOnlyWithoutSessionOpening
      ? rawPoints.map((point) => ({
          ...point,
          open: previousCloseTicks,
          high: previousCloseTicks,
          low: previousCloseTicks,
          close: previousCloseTicks,
        }))
      : rawPoints;
    const account = object(
      object(state.snapshot.accounts).player,
    );
    const position = object(
      object(object(account.portfolio).positions)[state.symbol],
    );
    const costTicks =
      integer(position.quantity) > 0
        ? positionDisplayCostTicks(position)
        : null;
    const limitMap = new Map();
    for (const order of activePlayerOrders(state.snapshot)) {
      const ticks = positiveInteger(order.priceTicks);
      if (
        order.symbol !== state.symbol ||
        !ticks ||
        order.orderType === 'market' ||
        order.type === 'market'
      ) {
        continue;
      }
      const side = order.side === 'sell' ? 'sell' : 'buy';
      const key = `${side}:${ticks}`;
      const aggregate = limitMap.get(key) ?? {
        side,
        priceTicks: ticks,
        quantity: 0,
        orderCount: 0,
      };
      aggregate.quantity += Math.max(
        0,
        integer(order.remainingQty),
      );
      aggregate.orderCount += 1;
      limitMap.set(key, aggregate);
    }
    const playerLimits = [...limitMap.values()].sort(
      (leftItem, rightItem) =>
        leftItem.priceTicks - rightItem.priceTicks ||
        leftItem.side.localeCompare(rightItem.side),
    );
    nodes.chart.dataset.stageCostTicks = costTicks
      ? String(costTicks)
      : '';
    nodes.chart.dataset.stagePlayerLimitTicks = playerLimits
      .map((item) => item.priceTicks)
      .join(',');
    nodes.chart.dataset.stagePlayerLimitCount = String(
      playerLimits.length,
    );
    const timeframe = CHART_TIMEFRAMES[state.chartMode];
    const intervalMs = Math.max(0, integer(series.intervalMs));
    const fixedIntradayLine =
      series.kind === 'line' &&
      series.axisMode === 'fixed_aligned_window';
    const displayTimeOffsetMs = Math.max(
      0,
      integer(series.displayTimeOffsetMs),
    );
    const axisIntervalMs =
      fixedIntradayLine
        ? 60_000
        : state.chartMode === 'ultra'
          ? 1000
          : intervalMs;
    const rawDomain = object(series.domain);
    const fallbackStart = points[0]?.virtualMs ?? finite(state.snapshot.nowMs);
    const fallbackEnd = points.at(-1)?.virtualMs ?? fallbackStart;
    let domainStart = finite(rawDomain.startMs, fallbackStart);
    let domainEnd = finite(rawDomain.endMs, fallbackEnd);
    if (domainEnd <= domainStart) {
      domainEnd = domainStart + Math.max(1, intervalMs || 1000);
    }
    const domainSpan = Math.max(1, domainEnd - domainStart);
    const crossesDay =
      Math.floor(domainStart / NATURAL_DAY_MS) !==
      Math.floor(Math.max(domainStart, domainEnd - 1) / NATURAL_DAY_MS);
    const includeDayOnAxis = crossesDay && !fixedIntradayLine;
    const domainText = `${chartAxisLabel(
      domainStart + displayTimeOffsetMs,
      axisIntervalMs,
      includeDayOnAxis,
    )}–${chartAxisLabel(
      domainEnd + displayTimeOffsetMs,
      axisIntervalMs,
      includeDayOnAxis,
    )}`;
    nodes.chart.dataset.stageTimeframe = state.chartMode;
    nodes.chart.dataset.stageXLayout =
      series.axisMode === 'fixed_aligned_window'
        ? 'fixed-aligned-window'
        : series.axisMode === 'trailing_fixed_slots'
          ? 'trailing-fixed-slots'
          : 'rolling-window';
    nodes.chart.dataset.stageTimeDomain = domainText;
    nodes.chart.dataset.stageDomainStartMs = String(Math.round(domainStart));
    nodes.chart.dataset.stageDomainEndMs = String(Math.round(domainEnd));
    nodes.chart.dataset.stageAxisMode =
      series.axisMode ?? 'rolling_active_window';
    setText(
      nodes.chartUnit,
      series.kind === 'candles'
        ? `开高低收：元 · MA${state.movingAveragePeriod} · 成交量：股`
        : '价格：元 · 均价线：成交额÷成交量 · 成交量：股',
    );
    nodes.intradayAverageLabel.hidden = series.kind !== 'line';
    nodes.movingAverageControl.hidden = series.kind !== 'candles';
    nodes.movingAveragePeriod.value = String(state.movingAveragePeriod);
    updateChartData(points, series);
    context.clearRect(0, 0, width, height);
    if (!state.chartColors) {
      state.chartColors = {
        border: cssColor(shell, '--color-border'),
        muted: cssColor(shell, '--color-text-muted'),
        info: cssColor(shell, '--color-info'),
        marketUp: cssColor(
          shell,
          '--lzy-stage-market-up',
          '#ff5a5f',
        ),
        marketDown: cssColor(
          shell,
          '--lzy-stage-market-down',
          '#31b36b',
        ),
        marketFlat: cssColor(
          shell,
          '--lzy-stage-market-flat',
          '#9aa1aa',
        ),
        orderLine: cssColor(
          shell,
          '--lzy-stage-order-line',
          '#f4ca5b',
        ),
        costLine: cssColor(
          shell,
          '--lzy-stage-cost-line',
          '#b28cff',
        ),
        averageLine: cssColor(
          shell,
          '--lzy-stage-average-line',
          '#f4ca5b',
        ),
        movingAverage: cssColor(
          shell,
          '--lzy-stage-moving-average',
          '#66d9ff',
        ),
      };
    }
    const {
      border,
      muted,
      info,
      marketUp,
      marketDown,
      marketFlat,
      orderLine,
      costLine,
      averageLine,
      movingAverage,
    } = state.chartColors;
    const left = 48;
    const right = Math.max(left + 1, width - 18);
    const ultraCanvasProjection =
      state.chartMode === 'ultra'
        ? projectUltraPointsForCanvas(points, {
            domainStartMs: domainStart,
            domainEndMs: domainEnd,
            left,
            right,
          })
        : null;
    const lineDrawPoints =
      ultraCanvasProjection?.linePoints ?? points;
    const volumeDrawPoints =
      ultraCanvasProjection?.volumeColumns ?? points;
    nodes.chart.dataset.stageAuthorityPointCount = String(
      points.length,
    );
    nodes.chart.dataset.stageDisplayLinePointCount = String(
      lineDrawPoints.length,
    );
    nodes.chart.dataset.stageDisplayVolumeColumnCount = String(
      volumeDrawPoints.length,
    );
    const top = 18;
    const volumeBottom = Math.max(top + 36, height - 20);
    const volumeHeight = Math.max(
      44,
      Math.min(110, Math.round(height * 0.32)),
    );
    const volumeTop = Math.max(top + 24, volumeBottom - volumeHeight);
    const priceBottom = Math.max(top + 1, volumeTop - 10);
    nodes.chart.dataset.stageVolumeHeight = String(
      Math.max(0, Math.round(volumeBottom - volumeTop)),
    );

    context.lineWidth = 1;
    context.strokeStyle = border;
    context.fillStyle = muted;
    context.font = '11px sans-serif';
    context.textAlign = 'left';
    for (let index = 0; index < 5; index += 1) {
      const y = top + ((priceBottom - top) / 4) * index;
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(right, y);
      context.stroke();
    }
    context.beginPath();
    context.moveTo(left, volumeTop);
    context.lineTo(right, volumeTop);
    context.stroke();
    const axisLabelCount = width < 320 ? 3 : 5;
    const timeLabels = Array.from({ length: axisLabelCount }, (_, index) => {
      const timestamp =
        domainStart +
        (domainSpan / Math.max(1, axisLabelCount - 1)) * index;
      return chartAxisLabel(
        timestamp + displayTimeOffsetMs,
        axisIntervalMs,
        includeDayOnAxis,
      );
    });
    timeLabels.forEach((label, index) => {
      const x =
        left +
        ((right - left) / Math.max(1, axisLabelCount - 1)) * index;
      context.textAlign =
        index === 0
          ? 'left'
          : index === timeLabels.length - 1
            ? 'right'
            : 'center';
      context.beginPath();
      context.moveTo(x, top);
      context.lineTo(x, volumeBottom);
      context.stroke();
      context.fillText(label, x, height - 4);
    });
    context.textAlign = 'left';

    const priceDomainPoints =
      ultraCanvasProjection?.linePoints ?? points;
    const tradedPriceDomainPoints =
      series.kind === 'line'
        ? priceDomainPoints.filter((point) => point.hasTrade)
        : priceDomainPoints;
    const lows = tradedPriceDomainPoints
      .map((point) => point.low)
      .filter(Number.isFinite);
    const highs = tradedPriceDomainPoints
      .map((point) => point.high)
      .filter(Number.isFinite);
    if (sessionLowTicks) lows.push(sessionLowTicks);
    if (sessionHighTicks) highs.push(sessionHighTicks);
    const overlayPrices = [
      costTicks,
      ...playerLimits.map((item) => item.priceTicks),
    ].filter(Number.isFinite);
    const fallbackPrices = [
      positiveInteger(chartView.lastPriceTicks),
      previousCloseTicks,
      ...overlayPrices,
    ].filter(Number.isFinite);
    const priceDomainValues =
      lows.length && highs.length
        ? [...lows, ...highs]
        : fallbackPrices.length
          ? fallbackPrices
          : [1];
    const rawMinimum = Math.min(...priceDomainValues);
    const rawMaximum = Math.max(...priceDomainValues);
    const adaptiveDomain =
      series.kind === 'line'
        ? deriveAdaptiveIntradayPriceDomain({
            previousCloseTicks,
            openingTicks: sessionOpeningTicks,
            lows,
            highs,
          })
        : null;
    const pricePadding = Math.max(
      1,
      Math.round(Math.max(1, rawMaximum - rawMinimum) * 0.08),
    );
    const minimum =
      adaptiveDomain?.minimumTicks ??
      rawMinimum - pricePadding;
    const maximum =
      adaptiveDomain?.maximumTicks ??
      rawMaximum + pricePadding;
    const priceSpan = Math.max(1, maximum - minimum);
    nodes.chart.dataset.stagePriceMinTicks = String(minimum);
    nodes.chart.dataset.stagePriceMaxTicks = String(maximum);
    nodes.chart.dataset.stageReferenceTicks = adaptiveDomain
      ? String(adaptiveDomain.baselineTicks)
      : '';
    nodes.chart.dataset.stageBaselineRatio = adaptiveDomain
      ? String(adaptiveDomain.baselineRatio)
      : '';
    nodes.chart.dataset.stageRadiusBps = adaptiveDomain
      ? String(adaptiveDomain.radiusBps)
      : '';
    nodes.chart.dataset.stagePriceTopReturnBps = adaptiveDomain
      ? String(adaptiveDomain.radiusBps)
      : '';
    nodes.chart.dataset.stagePriceBottomReturnBps = adaptiveDomain
      ? String(-adaptiveDomain.radiusBps)
      : '';
    nodes.chart.dataset.stageOpeningTicks =
      sessionOpeningTicks
        ? String(sessionOpeningTicks)
        : '';
    const openingTicks = sessionOpeningTicks;
    nodes.chart.dataset.stageOpeningRatio =
      adaptiveDomain && openingTicks
        ? String(
            (openingTicks - minimum) /
              Math.max(1, maximum - minimum),
          )
        : '';
    nodes.chart.dataset.stageOpeningReturnBps =
      adaptiveDomain && openingTicks
        ? String(
            Math.round(
              (openingTicks - adaptiveDomain.baselineTicks) *
                10_000 /
                adaptiveDomain.baselineTicks,
            ),
          )
        : '';
    const maxVolume = volumeDrawPoints.reduce(
      (maximumVolume, point) =>
        Math.max(maximumVolume, point.volume),
      1,
    );
    const xForPoint = (point) => {
      if (Number.isFinite(point?.pixelX)) return point.pixelX;
      const withinDomain = Math.max(
        0,
        Math.min(
          domainSpan,
          point.virtualMs - domainStart,
        ),
      );
      return left + (withinDomain / domainSpan) * (right - left);
    };
    const xFor = (index) => xForPoint(points[index]);
    const yFor = (value) =>
      priceBottom - ((value - minimum) / priceSpan) * (priceBottom - top);
    const lastAuthorityPoint = points.at(-1);
    nodes.chart.dataset.stageLastEndpointMs = lastAuthorityPoint
      ? String(Math.round(lastAuthorityPoint.virtualMs))
      : '';
    nodes.chart.dataset.stageLastEndpointTicks = lastAuthorityPoint
      ? String(lastAuthorityPoint.close)
      : '';

    context.fillStyle = muted;
    context.fillText(
      adaptiveDomain
        ? `${formatPrice(maximum)} +${(
            adaptiveDomain.radiusBps / 100
          ).toFixed(2)}%`
        : formatPrice(maximum),
      2,
      top + 4,
    );
    context.fillText(
      adaptiveDomain
        ? `${formatPrice(minimum)} −${(
            adaptiveDomain.radiusBps / 100
          ).toFixed(2)}%`
        : formatPrice(minimum),
      2,
      priceBottom,
    );
    if (adaptiveDomain) {
      const baselineY = yFor(adaptiveDomain.baselineTicks);
      context.save();
      context.strokeStyle = muted;
      context.lineWidth = 1;
      context.setLineDash([4, 4]);
      context.beginPath();
      context.moveTo(left, baselineY);
      context.lineTo(right, baselineY);
      context.stroke();
      context.restore();
    }

    const observedPixelStep = ultraCanvasProjection
      ? 1
      : intervalMs
      ? ((right - left) * intervalMs) / domainSpan
      : points.length > 1
        ? Math.max(
            1,
            ...points
              .slice(1)
              .map((_, index) => xFor(index + 1) - xFor(index)),
          )
        : 3;
    const candleWidth = Math.max(
      1,
      Math.min(12, observedPixelStep * 0.68),
    );
    if (series.kind === 'candles') {
      points.forEach((point, index) => {
        const x = xFor(index);
        const direction = signedDirection(
          point.close - point.open,
        );
        const color =
          direction === 'up'
            ? marketUp
            : direction === 'down'
              ? marketDown
              : marketFlat;
        context.strokeStyle = color;
        context.fillStyle = color;
        context.beginPath();
        context.moveTo(x, yFor(point.high));
        context.lineTo(x, yFor(point.low));
        context.stroke();
        const topY = yFor(Math.max(point.open, point.close));
        const bottomY = yFor(Math.min(point.open, point.close));
        context.fillRect(
          x - candleWidth / 2,
          topY,
          candleWidth,
          Math.max(1, bottomY - topY),
        );
      });
    } else {
      context.strokeStyle = info;
      context.lineWidth = 2;
      context.beginPath();
      lineDrawPoints.forEach((point, index) => {
        const x = xForPoint(point);
        const y = yFor(point.close);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
      if (
        state.chartMode === 'ultra' ||
        lineDrawPoints.length === 1
      ) {
        context.fillStyle = info;
        lineDrawPoints.forEach((point) => {
          context.beginPath();
          context.arc(
            xForPoint(point),
            yFor(point.close),
            1.7,
            0,
            Math.PI * 2,
          );
          context.fill();
        });
      }
    }

    const overlayPoints =
      series.kind === 'line'
        ? points
            .filter((point) => positiveInteger(point.averagePriceTicks))
            .map((point) => ({
              ...point,
              overlayTicks: point.averagePriceTicks,
            }))
        : points
            .filter((point) =>
              positiveInteger(
                object(point.movingAverages)[
                  String(state.movingAveragePeriod)
                ],
              ),
            )
            .map((point) => ({
              ...point,
              overlayTicks: positiveInteger(
                object(point.movingAverages)[
                  String(state.movingAveragePeriod)
                ],
              ),
            }));
    nodes.chart.dataset.stageOverlayKind =
      series.kind === 'line'
        ? 'domain_cumulative_vwap'
        : `close_ma_${state.movingAveragePeriod}`;
    nodes.chart.dataset.stageOverlayPointCount = String(
      overlayPoints.length,
    );
    if (overlayPoints.length > 0) {
      context.save();
      context.strokeStyle =
        series.kind === 'line' ? averageLine : movingAverage;
      context.lineWidth = 1.6;
      context.beginPath();
      overlayPoints.forEach((point, index) => {
        const x = xForPoint(point);
        const y = yFor(point.overlayTicks);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
      context.restore();
    }

    const drawPriceOverlay = ({
      priceTicks: overlayTicks,
      color,
      dash,
      label,
    }) => {
      const rawY = yFor(overlayTicks);
      const y = Math.max(top, Math.min(priceBottom, rawY));
      const edgeMarker =
        rawY < top ? '↑ ' : rawY > priceBottom ? '↓ ' : '';
      context.save();
      context.strokeStyle = color;
      context.fillStyle = color;
      context.lineWidth = 1.4;
      context.setLineDash(dash);
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(right, y);
      context.stroke();
      context.setLineDash([]);
      context.textAlign = 'right';
      context.font = '10px sans-serif';
      context.fillText(
        `${edgeMarker}${label}`,
        right - 3,
        Math.max(top + 10, y - 3),
      );
      context.restore();
    };
    if (costTicks) {
      drawPriceOverlay({
        priceTicks: costTicks,
        color: costLine,
        dash: [3, 4],
        label: `成本 ${formatPrice(costTicks)}`,
      });
    }
    for (const item of playerLimits) {
      drawPriceOverlay({
        priceTicks: item.priceTicks,
        color: orderLine,
        dash: [8, 5],
        label: `${item.side === 'sell' ? '卖' : '买'} ${formatPrice(
          item.priceTicks,
        )} ×${formatCompactQuantity(item.quantity)}`,
      });
    }

    if (!points.length) {
      context.fillStyle = muted;
      context.fillText(`等待${timeframe.label}成交数据`, left, top + 20);
      const overlaySummary = [
        costTicks ? `成本 ${formatPrice(costTicks)}` : '',
        ...playerLimits.map(
          (item) =>
            `${item.side === 'sell' ? '卖出' : '买入'}委托 ${formatPrice(
              item.priceTicks,
            )} ×${formatNumber(item.quantity)}`,
        ),
      ]
        .filter(Boolean)
        .join('；');
      setText(
        nodes.chartSummary,
        `${state.symbol || '当前证券'} ${timeframe.summary}尚无成交数据${
          overlaySummary ? `；${overlaySummary}` : ''
        }。`,
      );
      return;
    }

    const totalVolume = volumeDrawPoints.reduce(
      (sum, point) => sum + point.volume,
      0,
    );
    context.fillStyle = muted;
    context.fillText(
      `量 ${formatCompactQuantity(totalVolume)}`,
      left + 4,
      volumeTop + 12,
    );
    volumeDrawPoints.forEach((point, index) => {
      if (!point.volume) return;
      const comparison =
        series.kind === 'line'
          ? index === 0
            ? adaptiveDomain?.baselineTicks ?? point.close
            : volumeDrawPoints[index - 1].close
          : point.open;
      const direction = signedDirection(point.close - comparison);
      context.fillStyle =
        direction === 'up'
          ? marketUp
          : direction === 'down'
            ? marketDown
            : marketFlat;
      const x = xForPoint(point);
      const barHeight =
        (point.volume / maxVolume) * Math.max(1, volumeBottom - volumeTop);
      context.fillRect(
        x - candleWidth / 2,
        volumeBottom - barHeight,
        candleWidth,
        barHeight,
      );
    });

    const first = points[0];
    const last = points.at(-1);
    const rangeLabel = (point) =>
      intervalMs >= NATURAL_DAY_MS
        ? chartAxisLabel(point.startMs, intervalMs, true)
        : formatClock(point.virtualMs + displayTimeOffsetMs);
    const overlaySummary = [
      costTicks ? `成本 ${formatPrice(costTicks)}` : '',
      ...playerLimits.map(
        (item) =>
          `${item.side === 'sell' ? '卖出' : '买入'}委托 ${formatPrice(
            item.priceTicks,
          )} ×${formatNumber(item.quantity)}`,
      ),
    ]
      .filter(Boolean)
      .join('；');
    setText(
      nodes.chartSummary,
      `${state.symbol} ${timeframe.summary} ${domainText}，${rangeLabel(
        first,
      )} 至 ${rangeLabel(last)}，价格 ${formatPrice(first.close)} → ${formatPrice(
        last.close,
      )}，成交量 ${formatNumber(totalVolume)} 股${
        overlaySummary ? `；${overlaySummary}` : ''
      }。`,
    );
  }

  function detectNewTrades() {
    const currentIds = new Set(
      array(state.snapshot.trades)
        .filter(
          (trade) =>
            !trade.source || trade.source === 'realtime_order_book',
        )
        .map((trade) => trade.id)
        .filter(Boolean),
    );
    if (!state.hasExternalSnapshot) {
      state.seenTradeIds = currentIds;
      return;
    }
    const hasNew = [...currentIds].some((id) => !state.seenTradeIds.has(id));
    state.seenTradeIds = currentIds;
    if (!hasNew || state.reducedMotion) return;
    shell.dataset.fillPulse = 'true';
    window.clearTimeout(state.pulseTimer);
    state.pulseTimer = window.setTimeout(() => {
      delete shell.dataset.fillPulse;
    }, 520);
  }

  function renderCoreFrame({ resetLimit = false } = {}) {
    if (state.destroyed) return;
    state.symbol = selectedSymbol(
      state.symbol,
      state.requestedSymbol,
      state.snapshot,
      state.world,
    );
    if (state.marketKind !== 'stocks') {
      renderCurrentDerivative({
        preserveDrafts: true,
      });
      return;
    }
    updateRoleConsole();
    updateHeader();
    updateSymbolControls();
    updatePrice();
    if (resetLimit && !state.ticketDirty) updateLimitDefault();
    const compact = Boolean(compactQuery?.matches);
    const task = state.mobileTask;
    const marketVisible =
      !compact || task === 'market' || task === 'depth';
    if (marketVisible) {
      updateBook();
      updateFlowStrip();
      updatePreview();
    }
    if (!compact || task === 'trades') updateTrades();
    if (!compact || task === 'orders') updateOrders();
    detectNewTrades();
    if (state.marketKind === 'stocks') {
      refreshStockFinancing();
    }
    annotateTerminalColumns();
  }

  function renderFrame({ resetLimit = false } = {}) {
    renderCoreFrame({ resetLimit });
    if (
      state.destroyed ||
      state.marketKind !== 'stocks'
    ) {
      return;
    }
    const compact = Boolean(compactQuery?.matches);
    const task = state.mobileTask;
    if (!compact || task === 'info') updateAgents();
    if (!compact || task === 'market' || task === 'funds') {
      updateRisk();
    }
    if (!compact || task === 'funds') updateFunds();
    if (!compact || task === 'market') drawChart();
  }

  function chooseSymbol(value, announce = true) {
    const symbols = symbolList(state.snapshot, state.world);
    if (!symbols.includes(value)) return;
    const changed = state.symbol !== value;
    state.symbol = value;
    state.requestedSymbol = value;
    if (changed) {
      invalidateSymbolSpecificDrafts();
    }
    renderFrame({
      resetLimit:
        changed ||
        (!changed && !state.ticketDirty),
    });
    if (announce && changed) {
      onSymbolChange(value);
      publish(`已切换至 ${value}。`);
    }
  }

  function setTicketSide(side) {
    const input = sideInputs.find((item) => item.value === side);
    if (!input) return;
    input.checked = true;
    updateTicketPresentation();
  }

  function writeTicketPrice(ticks) {
    const exactTicks = positiveInteger(ticks);
    if (!exactTicks) return;
    if (selectedOrderType() === 'market') {
      nodes.orderTypeInput.value = 'limit';
      updateTicketPresentation();
    }
    nodes.limitInput.value = formatInputPrice(exactTicks);
    state.ticketDirty = true;
    updatePriceSelection();
    updatePreview();
  }

  function updatePriceSelection() {
    const selectedTicks = priceTicks(nodes.limitInput.value);
    for (const button of root.querySelectorAll(
      '[data-stage-book-price], [data-stage-depth-price]',
    )) {
      const selected =
        selectedTicks !== null &&
        positiveInteger(button.dataset.stagePriceTicks) === selectedTicks;
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }
  }

  function stepTicketPrice(direction) {
    const current = priceTicks(nodes.limitInput.value) ?? bestLimit(selectedSide());
    const band = ticketPriceBand();
    writeTicketPrice(
      Math.max(
        band.minimum ?? 1,
        Math.min(
          band.maximum ?? Number.MAX_SAFE_INTEGER,
          current + direction,
        ),
      ),
    );
  }

  function openTicket(side, trigger = null) {
    if (state.mobileTask === 'funds') {
      state.mobileTask = 'market';
      updateMobileTask();
    }
    setTicketSide(side);
    state.ticketDirty = false;
    updateLimitDefault();
    state.drawerMode = 'ticket';
    state.drawerOpen = true;
    state.drawerTrigger = trigger;
    updateDrawer();
    updatePreview();
  }

  function setChartMode(value) {
    const legacyMode = value === 'time'
      ? 'intraday'
      : value === 'candle'
        ? '1m'
        : value;
    state.chartMode = CHART_TIMEFRAME_KEYS.has(legacyMode)
      ? legacyMode
      : 'intraday';
    nodes.chartModeSelect.value = state.chartMode;
    drawChart();
  }

  function setMovingAveragePeriod(value) {
    const period = integer(value);
    state.movingAveragePeriod = [5, 10, 20, 60].includes(period)
      ? period
      : 5;
    nodes.movingAveragePeriod.value = String(
      state.movingAveragePeriod,
    );
    if (
      state.chartMode !== 'ultra' &&
      state.chartMode !== 'intraday'
    ) {
      drawChart();
    }
  }

  function update(payload) {
    if (state.destroyed) return false;
    const value = object(payload);
    const nextWorld = value.world?.market?.securities ? value.world : state.world;
    const nextSnapshot = unwrapPayload(payload);
    if (!nextSnapshot) {
      publish('行情暂不可用，等待下一帧。');
      return false;
    }
    const nextDerivatives =
      value.derivatives ??
      nextSnapshot.derivatives ??
      value.derivativesProjection;
    const derivativeChanged =
      acceptDerivativeProjection(
        nextDerivatives,
      );
    if (
      integer(nextSnapshot.nowMs) < integer(state.snapshot.nowMs) ||
      (integer(nextSnapshot.nowMs) === integer(state.snapshot.nowMs) &&
        integer(nextSnapshot.commitSeq) < integer(state.snapshot.commitSeq))
    ) {
      if (derivativeChanged) {
        refreshDerivativeProjectionDom();
      }
      return derivativeChanged;
    }
    const firstExternalSnapshot = !state.hasExternalSnapshot;
    state.world = nextWorld;
    state.snapshot = nextSnapshot;
    state.chartCache.clear();
    refreshIntelligenceProjection();
    if (firstExternalSnapshot) {
      state.seenTradeIds = new Set(
        array(nextSnapshot.trades)
          .filter(
            (trade) =>
              !trade.source || trade.source === 'realtime_order_book',
          )
          .map((trade) => trade.id)
          .filter(Boolean),
      );
      state.hasExternalSnapshot = true;
    }
    if (value.playing !== undefined) state.playing = Boolean(value.playing);
    if (SPEEDS.has(Number(value.speed))) state.speed = Number(value.speed);
    updatePlayback();
    if (
      firstExternalSnapshot ||
      state.speed !== 16
    ) {
      renderFrame({
        resetLimit:
          firstExternalSnapshot &&
          !state.ticketDirty,
      });
    } else {
      renderCoreFrame();
      scheduleCommandChartPaint();
      scheduleSupplementalFramePaint();
    }
    return true;
  }

  let commandChartFrame = 0;
  let supplementalFrame = 0;
  let supplementalTimer = 0;
  let lastSupplementalPaintAt = 0;
  const SUPPLEMENTAL_FRAME_INTERVAL_MS = 250;

  function scheduleCommandChartPaint() {
    if (commandChartFrame || state.destroyed) return;
    commandChartFrame = window.requestAnimationFrame(() => {
      commandChartFrame = 0;
      if (
        state.destroyed ||
        state.marketKind !== 'stocks' ||
        (
          compactQuery?.matches &&
          state.mobileTask !== 'market'
        )
      ) {
        return;
      }
      const startedAt =
        window.performance?.now?.() ?? Date.now();
      drawChart();
      root.dataset.stageChartPaintMs = String(
        (window.performance?.now?.() ?? Date.now()) - startedAt,
      );
    });
  }

  function scheduleSupplementalFramePaint() {
    if (
      supplementalFrame ||
      supplementalTimer ||
      state.destroyed ||
      state.marketKind !== 'stocks'
    ) {
      return;
    }
    const wallNow =
      window.performance?.now?.() ?? Date.now();
    const delayMs = Math.max(
      0,
      SUPPLEMENTAL_FRAME_INTERVAL_MS -
        (wallNow - lastSupplementalPaintAt),
    );
    supplementalTimer = window.setTimeout(() => {
      supplementalTimer = 0;
      if (state.destroyed) return;
      supplementalFrame =
        window.requestAnimationFrame(() => {
          supplementalFrame = 0;
          if (
            state.destroyed ||
            state.marketKind !== 'stocks'
          ) {
            return;
          }
          const startedAt =
            window.performance?.now?.() ?? Date.now();
          const compact = Boolean(
            compactQuery?.matches,
          );
          const task = state.mobileTask;
          if (!compact || task === 'info') {
            updateAgents();
          }
          if (
            !compact ||
            task === 'market' ||
            task === 'funds'
          ) {
            updateRisk();
          }
          if (!compact || task === 'funds') {
            updateFunds();
          }
          lastSupplementalPaintAt =
            window.performance?.now?.() ??
            Date.now();
          root.dataset.stageSupplementalPaintMs = String(
            lastSupplementalPaintAt - startedAt,
          );
        });
    }, delayMs);
  }

  function updateCommand(payload) {
    if (state.destroyed) return false;
    const value = object(payload);
    const nextWorld =
      value.world?.market?.securities
        ? value.world
        : state.world;
    const nextSnapshot = unwrapPayload(payload);
    if (!nextSnapshot) return false;
    const nextDerivatives =
      value.derivatives ??
      nextSnapshot.derivatives ??
      value.derivativesProjection;
    const derivativeChanged =
      acceptDerivativeProjection(
        nextDerivatives,
      );
    if (
      integer(nextSnapshot.nowMs) <
        integer(state.snapshot.nowMs) ||
      (
        integer(nextSnapshot.nowMs) ===
          integer(state.snapshot.nowMs) &&
        integer(nextSnapshot.commitSeq) <
          integer(state.snapshot.commitSeq)
      )
    ) {
      if (derivativeChanged) {
        refreshDerivativeProjectionDom();
      }
      return derivativeChanged;
    }
    state.world = nextWorld;
    state.snapshot = nextSnapshot;
    state.chartCache.delete(`${state.symbol}:ultra`);
    state.chartCache.delete(`${state.symbol}:intraday`);
    if (value.playing !== undefined) {
      state.playing = Boolean(value.playing);
    }
    if (SPEEDS.has(Number(value.speed))) {
      state.speed = Number(value.speed);
    }
    updatePlayback();
    if (state.marketKind !== 'stocks') {
      renderCurrentDerivative({
        preserveDrafts: true,
      });
      return true;
    }
    updateHeader();
    updatePrice();
    updateSymbolControls();
    const compact = Boolean(compactQuery?.matches);
    const task = state.mobileTask;
    const marketVisible =
      !compact || task === 'market' || task === 'depth';
    if (marketVisible) {
      updateBook();
      updateFlowStrip();
      updatePreview();
    }
    if (!compact || task === 'trades') updateTrades();
    if (!compact || task === 'orders') updateOrders();
    detectNewTrades();
    refreshStockFinancing();
    annotateTerminalColumns();
    scheduleCommandChartPaint();
    return true;
  }

  function updateRealtime(payload) {
    if (state.destroyed) return false;
    const value = object(payload);
    const nextSnapshot = unwrapPayload(payload);
    if (!nextSnapshot) return false;
    const nextDerivatives =
      value.derivatives ??
      nextSnapshot.derivatives ??
      value.derivativesProjection;
    const derivativeChanged =
      acceptDerivativeProjection(
        nextDerivatives,
      );
    if (
      integer(nextSnapshot.nowMs) < integer(state.snapshot.nowMs) ||
      (integer(nextSnapshot.nowMs) === integer(state.snapshot.nowMs) &&
        integer(nextSnapshot.commitSeq) < integer(state.snapshot.commitSeq))
    ) {
      if (derivativeChanged) {
        refreshDerivativeProjectionDom();
      }
      return derivativeChanged;
    }
    const realtimeUpdate = object(value.realtimeUpdate);
    const scopedRealtimeSymbols = Object.keys(
      object(object(realtimeUpdate.market).symbols),
    );
    const hasScopedRealtimeAuthority =
      realtimeUpdate.type === 'LEVEL2_UPDATE' &&
      scopedRealtimeSymbols.length > 0;
    state.snapshot = nextSnapshot;
    for (const symbol of (
      hasScopedRealtimeAuthority
        ? scopedRealtimeSymbols
        : Object.keys(object(nextSnapshot.symbols))
    )) {
      state.chartCache.delete(`${symbol}:ultra`);
      state.chartCache.delete(`${symbol}:intraday`);
    }
    if (state.marketKind !== 'stocks') {
      if (derivativeChanged) {
        renderCurrentDerivative({
          preserveDrafts: true,
        });
      }
      return true;
    }
    if (
      hasScopedRealtimeAuthority &&
      !scopedRealtimeSymbols.includes(state.symbol)
    ) {
      // A Level-2 packet for another stock still advances the local snapshot
      // and watchlist, but it cannot change the selected ticket, book, tape or
      // chart. Avoid repainting that entire right/centre column at millisecond
      // cadence while a player is clicking it.
      updateSymbolControls(scopedRealtimeSymbols);
      return true;
    }
    refreshRealtimeQuoteProjection(state.symbol);
    updateHeader();
    updatePrice();
    updateSymbolControls();

    const compact = Boolean(compactQuery?.matches);
    const task = state.mobileTask;
    const marketVisible =
      !compact || task === 'market' || task === 'depth';
    if (marketVisible) {
      updateBook();
      updateFlowStrip();
      updatePreview();
    }
    if (!compact || task === 'trades') updateTrades();
    if (!compact || task === 'orders') updateOrders();
    detectNewTrades();
    if (
      (state.chartMode === 'ultra' ||
        state.chartMode === 'intraday') &&
      (!compact || task === 'market')
    ) {
      drawChart();
    }
    refreshStockFinancing();
    annotateTerminalColumns();
    return true;
  }

  function receipt(value) {
    if (state.destroyed || !value) return false;
    const result = object(value);
    if (state.lastReceipt && isOlderPublication(result, state.lastReceipt)) {
      return false;
    }
    const receiptType = String(result.type ?? result.commandType ?? '');
    if (receiptType === 'submit_order') {
      state.orderSettledSeq = state.orderRequestSeq;
      state.orderSending = false;
      state.orderAwaitingReceipt = false;
      updateOrderRequestState();
    }
    const nextWorld = result.world ?? result.nextWorld ?? result.worldSnapshot;
    if (nextWorld) state.world = object(nextWorld);
    if (result.marketSnapshot || result.snapshot) {
      updateCommand(result);
    }
    if (nextWorld) onWorldChange(nextWorld);
    const receiptAction = object(result.action);
    if (
      result.productId === LEVEL2_PRODUCT_ID ||
      receiptAction.productId === LEVEL2_PRODUCT_ID ||
      (result.actionType === 'activate_market_data' &&
        (!result.productId || result.productId === LEVEL2_PRODUCT_ID))
    ) {
      state.level2ActivationPending = false;
      state.level2ActivationRequested = false;
      updateDepthDetail();
    }
    state.lastReceipt = result;
    const message = receiptMessage(result);
    nodes.receipt.dataset.status = result.status ?? 'updated';
    nodes.receipt.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = message;
    const meta = document.createElement('span');
    meta.textContent = `时间 ${formatClock(
      result.virtualMs ?? state.snapshot.nowMs,
    )} · ${receiptStatusLabel(result)}`;
    nodes.receipt.append(title, meta);
    const status = String(result.status ?? '').toLowerCase();
    publish(message, {
      visual: status === 'rejected' || status === 'error',
      persistent: status === 'rejected' || status === 'error',
    });
    return true;
  }

  async function submitOrder() {
    if (state.orderSending) return;
    if (
      form.dataset
        .symbolConfirmationRequired === 'true'
    ) {
      publish(
        '订单未发送：切换股票后请重新确认价格和数量。',
        { visual: true },
      );
      return;
    }
    const orderType = selectedOrderType();
    const command = {
      type: 'submit_order',
      actorId: PLAYER_ID,
      brokerId: BROKER_ID,
      symbol: state.symbol,
      side: selectedSide(),
      ...(orderType === 'limit'
        ? { priceTicks: priceTicks(nodes.limitInput.value) }
        : { orderType: 'market' }),
      quantity: positiveInteger(nodes.quantityInput.value),
      tif:
        orderType === 'market' || tifInput.value === 'IOC'
          ? 'IOC'
          : 'GTC',
    };
    if (
      !command.symbol ||
      (orderType === 'limit' && !command.priceTicks) ||
      !command.quantity
    ) {
      publish(
        orderType === 'market'
          ? '订单未发送：请填写有效证券与整数数量。'
          : '订单未发送：请填写有效证券、正数限价与整数数量。',
        { visual: true },
      );
      return;
    }
    if (!capabilities.submit) {
      publish(
        '行情连接中，订单尚未发送。',
        { visual: true, persistent: true },
      );
      return;
    }
    const requestSeq = ++state.orderRequestSeq;
    state.orderSending = true;
    state.orderAwaitingReceipt = false;
    updateOrderRequestState();
    const accepted = await invoke('submit', command);
    if (state.destroyed || requestSeq !== state.orderRequestSeq) return;
    state.orderSending = false;
    state.orderAwaitingReceipt =
      accepted && state.orderSettledSeq < requestSeq;
    updateOrderRequestState();
  }

  function cancelOrder(orderId) {
    if (!capabilities.cancel) {
      publish('行情连接中，撤单尚未发送。');
      return;
    }
    invoke('cancel', {
      type: 'cancel_order',
      actorId: PLAYER_ID,
      brokerId: BROKER_ID,
      orderId,
    });
  }

  function invokeDerivativeCommand(command) {
    return invoke('action', {
      type: 'world_action',
      actorId: PLAYER_ID,
      action: {
        type: 'derivatives_action',
        command,
      },
    });
  }

  function selectedDerivativeContract() {
    const contractId =
      selectedEntityForCurrentMode();
    if (!contractId) return null;
    return (
      state.derivativesProjection?.contracts?.[
        state.marketKind
      ]?.[contractId] ?? null
    );
  }

  function existingOptionQuantity(contractId) {
    return Math.max(
      0,
      integer(
        state.derivativesProjection?.player
          ?.positions?.[contractId]?.quantity,
      ),
    );
  }

  async function submitDerivativeOrder(
    derivativeForm,
  ) {
    const data = new window.FormData(
      derivativeForm,
    );
    const contractId = String(
      data.get('contractId') ?? '',
    );
    const selectedContract =
      selectedDerivativeContract();
    const side = String(data.get('side') ?? '');
    const orderType =
      data.get('orderType') === 'limit'
        ? 'limit'
        : 'market';
    const quantity = positiveInteger(
      data.get('quantity'),
    );
    const limitTicks = priceTicks(
      data.get('limitPrice'),
    );
    if (
      !selectedContract ||
      contractId !== selectedContract.id ||
      !['buy', 'sell'].includes(side) ||
      !quantity ||
      (orderType === 'limit' && !limitTicks)
    ) {
      publish(
        '委托未发送：请重新确认合约、价格与数量。',
        { visual: true },
      );
      return false;
    }
    if (
      selectedContract.type === 'option' &&
      side === 'sell' &&
      quantity >
        existingOptionQuantity(contractId)
    ) {
      publish(
        '委托未发送：当前仅可卖出已有期权持仓。',
        { visual: true },
      );
      return false;
    }
    return invokeDerivativeCommand({
      type: 'SUBMIT_ORDER',
      contractId,
      side,
      orderType,
      quantity,
      ...(orderType === 'limit'
        ? {
            priceTicks: limitTicks,
            tif: 'GTC',
          }
        : {}),
    });
  }

  async function submitFinancingAction(
    financingForm,
    submitter,
  ) {
    const data = new window.FormData(
      financingForm,
    );
    const amount = positiveFiniteNumber(
      data.get('amount'),
    );
    if (!amount) {
      publish(
        '融资操作未发送：请输入有效金额。',
        { visual: true },
      );
      return false;
    }
    return invokeDerivativeCommand({
      type:
        submitter?.value === 'repay'
          ? 'REPAY_MARGIN_CREDIT'
          : 'DRAW_MARGIN_CREDIT',
      amountCents: Math.round(
        amount * PRICE_SCALE,
      ),
    });
  }

  async function submitLendingAction(
    lendingForm,
    submitter,
  ) {
    if (
      lendingForm.dataset
        .symbolConfirmationRequired === 'true'
    ) {
      publish(
        '借券操作未发送：切换股票后请重新确认数量。',
        { visual: true },
      );
      return false;
    }
    const data = new window.FormData(lendingForm);
    const securityId = String(
      data.get('securityId') ?? '',
    );
    const quantity = positiveInteger(
      data.get('quantity'),
    );
    if (
      securityId !== state.symbol ||
      !quantity
    ) {
      publish(
        '借券操作未发送：请重新确认当前股票和数量。',
        { visual: true },
      );
      return false;
    }
    return invokeDerivativeCommand({
      type:
        submitter?.value === 'return'
          ? 'RETURN_SECURITY'
          : 'BORROW_SECURITY',
      securityId: state.symbol,
      quantity,
    });
  }

  function enableDerivativePermission(permission) {
    const allowed =
      state.marketKind === 'stocks'
        ? new Set([
            'margin_financing',
            'securities_lending',
          ])
        : state.marketKind === 'futures'
          ? new Set(['futures_trading'])
          : new Set(['option_buyer']);
    if (!allowed.has(permission)) return false;
    invokeDerivativeCommand({
      type: 'ENABLE_PERMISSION',
      permission,
    });
    return true;
  }

  function closeDerivativePosition(button) {
    const contractId =
      button.dataset.derivativesContract;
    const quantity = positiveInteger(
      button.dataset.derivativesQuantity,
    );
    const side =
      button.dataset.derivativesSide;
    if (
      !contractId ||
      !quantity ||
      !['buy', 'sell'].includes(side)
    ) {
      return false;
    }
    invokeDerivativeCommand({
      type: 'SUBMIT_ORDER',
      contractId,
      side,
      orderType: 'market',
      quantity,
    });
    return true;
  }

  function cancelDerivativeOrder(button) {
    const contractId =
      button.dataset.derivativesContract;
    const orderId =
      button.dataset.derivativesOrder;
    if (!contractId || !orderId) return false;
    invokeDerivativeCommand({
      type: 'CANCEL_ORDER',
      contractId,
      orderId,
    });
    return true;
  }

  async function activateLevel2() {
    const entitlement = marketDataEntitlement(state.snapshot);
    if (
      entitlement.active ||
      !entitlement.supported ||
      !entitlement.eligible ||
      state.level2ActivationPending
    ) {
      return;
    }
    if (!capabilities.submit) {
      publish('行情连接中，百档行情尚未开通。');
      return;
    }
    state.level2ActivationPending = true;
    updateDepthEntitlement();
    const accepted = await invoke('action', {
      type: 'world_action',
      actorId: PLAYER_ID,
      action: {
        type: 'activate_market_data',
        productId: LEVEL2_PRODUCT_ID,
      },
    });
    state.level2ActivationPending = false;
    state.level2ActivationRequested = accepted;
    updateDepthEntitlement();
    if (accepted) {
      publish('百档行情开通中。');
    }
  }

  async function toggleRoleAutomation(button) {
    const roleType = object(state.world.player).roleType;
    const quant = roleType === 'quant_institution';
    const stabilization = roleType === 'stabilization_fund';
    if (!quant && !stabilization) return;
    const roleState = object(object(state.world.player).roleState);
    const configuration = quant
      ? object(roleState.strategyLab)
      : object(roleState.stabilityDesk);
    button.disabled = true;
    const accepted = await invoke('action', {
      type: 'world_action',
      actorId: PLAYER_ID,
      action: {
        type: 'role_action',
        command: quant
          ? 'configure_quant_automation'
          : 'configure_stabilization_automation',
        automationEnabled: configuration.automationEnabled !== true,
      },
    });
    button.disabled = false;
    if (accepted) {
      publish(
        configuration.automationEnabled === true
          ? '自动协议已请求暂停。'
          : '自动协议已请求启动。',
      );
    }
  }

  function onClick(event) {
    const noticeDismiss = event.target.closest('[data-stage-dismiss-notice]');
    if (noticeDismiss && root.contains(noticeDismiss)) {
      dismissNotice();
      return;
    }
    const drawerClose = event.target.closest('[data-stage-drawer-close]');
    if (drawerClose && root.contains(drawerClose)) {
      state.drawerOpen = false;
      updateDrawer();
      state.drawerTrigger?.focus?.({ preventScroll: true });
      state.drawerTrigger = null;
      return;
    }
    const drawerToggle = event.target.closest('[data-stage-drawer-toggle]');
    if (drawerToggle && root.contains(drawerToggle)) {
      state.drawerOpen = !state.drawerOpen;
      updateDrawer();
      return;
    }
    const ticketOpener = event.target.closest('[data-stage-open-ticket]');
    if (ticketOpener && root.contains(ticketOpener)) {
      openTicket(
        ticketOpener.dataset.stageOpenTicket === 'sell' ? 'sell' : 'buy',
        ticketOpener,
      );
      return;
    }
    const roleDrawer = event.target.closest('[data-stage-open-role-drawer]');
    if (roleDrawer && root.contains(roleDrawer)) {
      state.drawerMode = 'role';
      state.drawerOpen = true;
      state.drawerTrigger = roleDrawer;
      updateDrawer();
      return;
    }
    const roleConsoleOpen = event.target.closest('[data-stage-role-open]');
    if (roleConsoleOpen && root.contains(roleConsoleOpen)) {
      onRoleConsoleOpen();
      return;
    }
    const roleToggle = event.target.closest('[data-stage-role-toggle]');
    if (roleToggle && root.contains(roleToggle)) {
      toggleRoleAutomation(roleToggle);
      return;
    }
    const roleManualStock = event.target.closest(
      '[data-stage-role-manual-stock]',
    );
    if (roleManualStock && root.contains(roleManualStock)) {
      if (setMarketKind('stocks')) {
        openTicket(
          'buy',
          root.querySelector(
            '[data-testid="stabilization-stage-manual-entry"]',
          ) ?? roleManualStock,
        );
      }
      return;
    }
    const mobileTask = event.target.closest('[data-stage-mobile-task]');
    if (mobileTask && root.contains(mobileTask)) {
      state.mobileTask = mobileTask.dataset.stageMobileTask || 'market';
      state.drawerOpen = false;
      state.drawerMode =
        state.mobileTask === 'funds' ? 'funds' : 'ticket';
      state.drawerTrigger =
        state.mobileTask === 'funds' ? mobileTask : null;
      updateMobileTask();
      updateDrawer();
      renderFrame();
      return;
    }
    const depthToggle = event.target.closest('[data-stage-depth-toggle]');
    if (depthToggle && root.contains(depthToggle)) {
      state.mobileTask =
        state.mobileTask === 'depth' ? 'market' : 'depth';
      state.drawerOpen = false;
      state.drawerMode = 'ticket';
      updateMobileTask();
      updateDrawer();
      renderFrame();
      return;
    }
    const level2Activation = event.target.closest(
      '[data-stage-activate-level2]',
    );
    if (level2Activation && root.contains(level2Activation)) {
      activateLevel2();
      return;
    }
    const bookPrice = event.target.closest('[data-stage-book-price], [data-stage-depth-price]');
    if (bookPrice && root.contains(bookPrice)) {
      writeTicketPrice(bookPrice.dataset.stagePriceTicks);
      state.drawerMode = 'ticket';
      state.drawerOpen = true;
      state.drawerTrigger = bookPrice;
      updateDrawer();
      return;
    }
    const quantityPreset = event.target.closest(
      '[data-stage-quantity-preset]',
    );
    if (quantityPreset && root.contains(quantityPreset)) {
      applyQuantityPreset(quantityPreset.dataset.stageQuantityPreset);
      return;
    }
    const priceStep = event.target.closest('[data-stage-price-step]');
    if (priceStep && root.contains(priceStep)) {
      stepTicketPrice(integer(priceStep.dataset.stagePriceStep));
      return;
    }
    const command = event.target.closest('[data-stage-command]');
    if (command && root.contains(command)) {
      const name = command.dataset.stageCommand;
      if (name === 'play') play();
      else if (name === 'pause') pause();
      else if (name === 'step') step();
      else if (name === 'toggle') {
        if (state.playing) pause();
        else play();
      }
      return;
    }
    const marketKind = event.target.closest(
      '[data-stage-market-kind]',
    );
    if (marketKind && root.contains(marketKind)) {
      const kind = marketKind.dataset.stageMarketKind;
      if (
        [
          'stocks',
          'futures',
          'options',
        ].includes(kind)
      ) {
        event.preventDefault();
        event.stopPropagation();
        setMarketKind(kind);
      }
      return;
    }
    const derivativeContract =
      event.target.closest(
        '[data-action="derivatives-contract"]',
      );
    const derivativeSeriesTimeframe =
      event.target.closest(
        '[data-action="derivatives-series-timeframe"]',
      );
    if (
      derivativeSeriesTimeframe &&
      root.contains(derivativeSeriesTimeframe) &&
      state.marketKind !== 'stocks'
    ) {
      event.preventDefault();
      event.stopPropagation();
      const timeframe =
        derivativeSeriesTimeframe.dataset
          .derivativesSeriesTimeframe;
      if (['intraday', '1m', '1d'].includes(timeframe)) {
        state.derivativeSeriesTimeframes[
          state.marketKind
        ] = timeframe;
        renderCurrentDerivative();
      }
      return;
    }
    if (
      derivativeContract &&
      root.contains(derivativeContract) &&
      state.marketKind !== 'stocks'
    ) {
      event.preventDefault();
      event.stopPropagation();
      const contractId =
        derivativeContract.dataset
          .derivativesContract;
      state.selectedDerivativeContractIds[
        state.marketKind
      ] = contractId ?? null;
      renderCurrentDerivative();
      onDerivativeContractChange(
        selectedEntityForCurrentMode(),
        state.marketKind,
      );
      return;
    }
    const derivativeUnderlying =
      event.target.closest(
        '[data-action="derivatives-underlying"]',
      );
    if (
      derivativeUnderlying &&
      root.contains(derivativeUnderlying) &&
      state.marketKind !== 'stocks'
    ) {
      event.preventDefault();
      event.stopPropagation();
      state.selectedDerivativeContractIds[
        state.marketKind
      ] =
        derivativeUnderlying.dataset
          .derivativesDefaultContract ?? null;
      renderCurrentDerivative();
      onDerivativeContractChange(
        selectedEntityForCurrentMode(),
        state.marketKind,
      );
      return;
    }
    const derivativePermission =
      event.target.closest(
        '[data-action="derivatives-enable"]',
      );
    if (
      derivativePermission &&
      root.contains(derivativePermission)
    ) {
      event.preventDefault();
      event.stopPropagation();
      enableDerivativePermission(
        derivativePermission.dataset
          .derivativesPermission,
      );
      return;
    }
    const derivativeClose = event.target.closest(
      '[data-action="derivatives-close"]',
    );
    if (
      derivativeClose &&
      root.contains(derivativeClose)
    ) {
      event.preventDefault();
      event.stopPropagation();
      closeDerivativePosition(
        derivativeClose,
      );
      return;
    }
    const derivativeCancel = event.target.closest(
      '[data-action="derivatives-cancel"]',
    );
    if (
      derivativeCancel &&
      root.contains(derivativeCancel)
    ) {
      event.preventDefault();
      event.stopPropagation();
      cancelDerivativeOrder(
        derivativeCancel,
      );
      return;
    }
    const symbolButton = event.target.closest('[data-stage-symbol]');
    if (symbolButton && root.contains(symbolButton)) {
      chooseSymbol(symbolButton.dataset.stageSymbol);
      return;
    }
    const cancelButton = event.target.closest('[data-stage-cancel]');
    if (cancelButton && root.contains(cancelButton)) {
      cancelOrder(cancelButton.dataset.stageCancel);
    }
  }

  function onSubmit(event) {
    const submittedForm = event.target;
    if (
      submittedForm !== form &&
      !root.contains(submittedForm)
    ) {
      return;
    }
    if (submittedForm === form) {
      event.preventDefault();
      event.stopPropagation();
      submitOrder();
      return;
    }
    if (
      submittedForm.id ===
      'derivatives-order-form'
    ) {
      event.preventDefault();
      event.stopPropagation();
      submitDerivativeOrder(submittedForm);
      return;
    }
    if (
      submittedForm.id ===
      'derivatives-financing-form'
    ) {
      event.preventDefault();
      event.stopPropagation();
      submitFinancingAction(
        submittedForm,
        event.submitter,
      );
      return;
    }
    if (
      submittedForm.id ===
      'derivatives-lending-form'
    ) {
      event.preventDefault();
      event.stopPropagation();
      submitLendingAction(
        submittedForm,
        event.submitter,
      );
    }
  }

  function onInput(event) {
    if (
      event.target === nodes.limitInput ||
      event.target === nodes.quantityInput
    ) {
      state.ticketDirty = true;
      confirmStockTicketDraft();
      updatePreview();
      return;
    }
    confirmLendingDraft(event.target);
  }

  function onChange(event) {
    if (event.target === nodes.mobileSymbolSelect) {
      chooseSymbol(event.target.value);
    } else if (event.target === nodes.mobileSpeedSelect) {
      setSpeed(event.target.value);
    } else if (event.target === nodes.desktopSpeedSelect) {
      setSpeed(event.target.value);
    } else if (event.target === nodes.chartModeSelect) {
      setChartMode(event.target.value);
    } else if (event.target === nodes.movingAveragePeriod) {
      setMovingAveragePeriod(event.target.value);
    } else if (event.target === nodes.orderTypeInput) {
      state.ticketDirty = true;
      updateTicketPresentation();
      updatePreview();
    } else if (event.target === nodes.depthModeSelect) {
      state.depthMode =
        event.target.value === 'level2' ? 'level2' : 'ten';
      updateDepthDetail();
    } else if (sideInputs.includes(event.target)) {
      state.ticketDirty = false;
      updateTicketPresentation();
      updateLimitDefault();
      updatePreview();
    } else if (event.target === tifInput) {
      if (selectedOrderType() === 'limit') {
        state.limitTif = tifInput.value === 'IOC' ? 'IOC' : 'GTC';
      }
      updatePreview();
    }
  }

  function editableTarget(target) {
    return Boolean(
      target?.closest?.(
        'input, select, textarea, button, a[href], summary, [role="button"], [contenteditable="true"]',
      ),
    );
  }

  function onKeydown(event) {
    if (state.destroyed) return;
    const target = event.target;
    const globalTarget =
      target === document ||
      target === document.body ||
      target === document.documentElement;
    if ((!globalTarget && !root.contains(target)) || editableTarget(target)) return;
    if (event.key === 'Escape' && compactQuery?.matches && state.drawerOpen) {
      event.preventDefault();
      state.drawerOpen = false;
      updateDrawer();
      nodes.drawerToggle.focus();
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      if (state.playing) pause();
      else play();
    } else if (event.key === '.') {
      event.preventDefault();
      step();
    } else if (event.key === '1' || event.key === '4' || event.key === '6') {
      event.preventDefault();
      setSpeed(event.key === '6' ? 16 : Number(event.key));
    }
  }

  function onMotionChange(event) {
    state.reducedMotion = Boolean(event.matches);
    shell.dataset.reducedMotion = state.reducedMotion ? 'true' : 'false';
    if (state.reducedMotion) delete shell.dataset.fillPulse;
    drawChart();
  }

  function onCompactChange() {
    if (!compactQuery?.matches) state.drawerOpen = false;
    updateDrawer();
    renderFrame();
  }

  function onDetailsToggle(event) {
    if (event.target === nodes.chartDataDetail && event.target.open) {
      drawChart();
    } else if (event.target === nodes.depthDetail && event.target.open) {
      updateDepthDetail();
    }
  }

  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
  root.addEventListener('toggle', onDetailsToggle, true);
  document.addEventListener('keydown', onKeydown);
  motionQuery?.addEventListener?.('change', onMotionChange);
  compactQuery?.addEventListener?.('change', onCompactChange);

  let resizeObserver = null;
  let resizeFrame = 0;
  let resizeFramesRemaining = 0;
  const drawAfterResize = () => {
    resizeFrame = 0;
    if (state.destroyed) return;
    state.canvasMetrics = null;
    drawChart();
    resizeFramesRemaining -= 1;
    if (resizeFramesRemaining > 0) {
      resizeFrame = window.requestAnimationFrame(drawAfterResize);
    }
  };
  const resizeHandler = () => {
    window.cancelAnimationFrame(resizeFrame);
    // A viewport resize can cross a media-query grid boundary over successive
    // layout frames in WebKit. Redraw through the short settling window so the
    // canvas bitmap follows the final CSS box even without ResizeObserver.
    resizeFramesRemaining = 3;
    resizeFrame = window.requestAnimationFrame(drawAfterResize);
  };
  if (typeof window.ResizeObserver === 'function') {
    resizeObserver = new window.ResizeObserver(resizeHandler);
    resizeObserver.observe(nodes.chart.parentElement);
  } else {
    window.addEventListener('resize', resizeHandler);
  }

  nodes.submitOrder.disabled = !capabilities.submit;
  const runDisabled = !capabilities.play || !capabilities.pause;
  nodes.desktopRunToggle.disabled = runDisabled;
  nodes.mobileRunToggle.disabled = runDisabled;
  root.querySelector('[data-stage-command="step"]').disabled =
    !capabilities.step;
  nodes.desktopSpeedSelect.disabled = !capabilities.speed;
  nodes.mobileSpeedSelect.disabled = !capabilities.speed;

  updateDrawer();
  updateMobileTask();
  renderFrame({ resetLimit: true });
  setMarketKind(state.requestedMarketKind, {
    announce: false,
    notify: false,
  });

  function destroy() {
    if (state.destroyed) return false;
    state.destroyed = true;
    window.clearTimeout(state.pulseTimer);
    window.clearTimeout(state.noticeTimer);
    window.clearTimeout(supplementalTimer);
    window.cancelAnimationFrame(commandChartFrame);
    window.cancelAnimationFrame(supplementalFrame);
    window.cancelAnimationFrame(resizeFrame);
    resizeFramesRemaining = 0;
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('input', onInput);
    root.removeEventListener('change', onChange);
    root.removeEventListener('toggle', onDetailsToggle, true);
    document.removeEventListener('keydown', onKeydown);
    motionQuery?.removeEventListener?.('change', onMotionChange);
    compactQuery?.removeEventListener?.('change', onCompactChange);
    resizeObserver?.disconnect();
    if (!resizeObserver) window.removeEventListener('resize', resizeHandler);
    root.replaceChildren();
    return true;
  }

  return {
    update,
    updateCommand,
    updateRealtime,
    receipt,
    destroy,
  };
}

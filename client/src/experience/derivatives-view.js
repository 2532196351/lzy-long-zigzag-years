import {
  contractDisplayName,
  equityBasketDisplayName,
} from '../derivatives/contracts.js?v=20260801-01';
import {
  mergeDerivativesAuthorityPublication,
} from '../market/world-publication.js?v=20260801-01';

const PUBLIC_DERIVATIVES_SCHEMA =
  'lzy_derivatives_public_v1';

export function isPublishedDerivativesProjection(
  value,
) {
  return Boolean(
    value &&
      value.publication ===
        PUBLIC_DERIVATIVES_SCHEMA &&
      value.contracts?.underlyings &&
      value.contracts?.futures &&
      value.contracts?.options &&
      value.access?.qualification &&
      value.books &&
      value.player,
  );
}

export function mergePublishedDerivativesProjection(
  previous,
  patch,
  authority = {},
) {
  return mergeDerivativesAuthorityPublication(
    previous,
    patch,
    authority,
  );
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function yuanFromCents(value) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 2,
  }).format((Number(value) || 0) / 100);
}

function quotePrice(value) {
  return (Math.max(0, Number(value) || 0) / 100).toFixed(2);
}

function integer(value) {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function signedNumber(value, digits = 2) {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: 'always',
  }).format(Number(value) || 0);
}

function signedYuanFromCents(value) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 2,
    signDisplay: 'always',
  }).format((Number(value) || 0) / 100);
}

function percentFromBps(value, fallback = '—') {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return `${(number / 100).toFixed(2)}%`;
}

function safeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number)
    ? number
    : fallback;
}

function derivativeAuthorityFields(projection) {
  const authorityNowMs = safeInteger(
    projection?.authorityNowMs,
    safeInteger(projection?.nowMs),
  );
  const authorityCommitSeq = safeInteger(
    projection?.authorityCommitSeq,
    safeInteger(projection?.commitSeq),
  );
  const derivativeCommitSeq = safeInteger(
    projection?.commitSeq,
  );
  const decisionCount = safeInteger(
    projection?.cadence?.decisionCount,
  );
  const lastDecisionAtMs =
    projection?.cadence?.lastDecisionAtMs === null
      ? null
      : safeInteger(
          projection?.cadence?.lastDecisionAtMs,
          authorityNowMs,
        );
  return {
    authorityNowMs,
    authorityCommitSeq,
    derivativeCommitSeq,
    decisionCount,
    lastDecisionAtMs,
  };
}

function derivativeAuthorityStatus(projection) {
  const authority =
    derivativeAuthorityFields(projection);
  return `
    <p class="derivative-market-freshness"
      data-derivatives-live-key="market-freshness"
      data-derivatives-authority-now-ms="${authority.authorityNowMs}"
      data-derivatives-authority-commit-seq="${authority.authorityCommitSeq}"
      data-derivatives-commit-seq="${authority.derivativeCommitSeq}"
      data-derivatives-decision-count="${authority.decisionCount}"
      data-derivatives-last-decision-at-ms="${
        authority.lastDecisionAtMs ?? ''
      }">
      <span>市场时间 ${integer(
        authority.authorityNowMs,
      )} ms</span>
      <span>市场主体已更新 ${integer(
        authority.decisionCount,
      )} 次</span>
    </p>
  `;
}

function riskStatusCopy(status) {
  if (status === 'LIQUIDATE') {
    return {
      label: '强制处理',
      detail: '保证金已低于强制处理线，请尽快降低风险。',
      tone: 'danger',
    };
  }
  if (status === 'MARGIN_CALL') {
    return {
      label: '需要补充保证金',
      detail: '担保品接近风险线，可补充资金或减少持仓。',
      tone: 'warning',
    };
  }
  return {
    label: '正常',
    detail: '',
    tone: 'normal',
  };
}

function daysToExpiry(contract, nowMs) {
  return Math.max(
    0,
    Math.ceil(
      (contract.expiryMs - nowMs) /
        (24 * 60 * 60 * 1_000),
    ),
  );
}

function playerFacingUnderlyingName(underlying) {
  if (!underlying) return '';
  const basketName = equityBasketDisplayName(
    underlying.id,
    underlying.basketIdentity ?? underlying.basket,
  );
  if (basketName) return basketName;
  return String(underlying.name ?? underlying.id ?? '');
}

function contractName(contract, projection) {
  if (!contract) return '';
  const universe = {
    underlyings:
      projection?.contracts?.underlyings ?? {},
  };
  const derivedName = contractDisplayName(
    contract,
    universe,
  );
  if (contract.basketIdentity && derivedName) {
    return derivedName;
  }
  if (contract.displayName) {
    return contract.displayName;
  }
  const underlying =
    universe.underlyings[contract.underlyingId];
  const baseName =
    playerFacingUnderlyingName(underlying) ||
    (contract.type === 'future' ? '指数期货' : '指数期权');
  const days = daysToExpiry(contract, projection?.nowMs ?? 0);
  if (contract.type === 'future') {
    return `${baseName} · ${days}日到期`;
  }
  return [
    `${baseName} · ${days}日`,
    contract.kind === 'call' ? '看涨' : '看跌',
    `行权 ${quotePrice(contract.strikeTicks)}`,
  ].join(' · ');
}

function qualificationCopy(projection) {
  const qualification = projection.access.qualification;
  if (qualification.status === 'QUALIFIED') {
    return '开户条件已满足，开通后长期有效。';
  }
  if (qualification.aboveThresholdSinceMs !== null) {
    return '资产条件已满足；世界运行满 24 小时后可以开通。';
  }
  return '净资产曾达到 50 万元，并且世界运行满 24 小时后可以开通。';
}

function permissionPanel(projection, permission, label) {
  const mode =
    projection.access.permissionModes[permission];
  if (mode === 'OPEN') {
    return `<span class="derivative-access is-open">${escapeHtml(
      label,
    )}已开通</span>`;
  }
  const qualified =
    projection.access.qualification.status === 'QUALIFIED';
  return `
    <button class="derivative-access ${qualified ? 'can-open' : ''}"
      type="button" data-action="derivatives-enable"
      data-derivatives-permission="${escapeHtml(permission)}"
      ${qualified ? '' : 'disabled'}>
      ${qualified ? `开通${escapeHtml(label)}` : `${escapeHtml(label)}未开放`}
    </button>
  `;
}

function contractRows(contracts, projection, selectedId) {
  return contracts
    .map((contract) => {
      const book = projection.books[contract.id] ?? {
        bids: [],
        asks: [],
      };
      const bid = book.bids?.[0]?.priceTicks;
      const ask = book.asks?.[0]?.priceTicks;
      const last =
        projection.lastTradePriceTicks[contract.id] ??
        projection.settlementPriceTicks[contract.id] ??
        null;
      return `
        <button type="button"
          class="derivative-contract-row ${
            contract.id === selectedId ? 'is-selected' : ''
          }"
          data-action="derivatives-contract"
          data-derivatives-contract="${escapeHtml(contract.id)}"
          aria-current="${
            contract.id === selectedId ? 'true' : 'false'
          }">
          <span>
            <strong>${escapeHtml(
              contractName(contract, projection),
            )}</strong>
            <small>${contract.type === 'future' ? '现金交割' : '欧式现金结算'}</small>
          </span>
          <span class="derivative-contract-quotes">
            <small>买 ${bid ? quotePrice(bid) : '—'}</small>
            <strong>${last ? quotePrice(last) : '—'}</strong>
            <small>卖 ${ask ? quotePrice(ask) : '—'}</small>
          </span>
        </button>
      `;
    })
    .join('');
}

function marketKindSwitch(section) {
  return `
    <nav class="derivative-market-kind-switch"
      aria-label="交易市场">
      <button type="button" data-market-kind="stocks"
        data-stage-market-kind="stocks"
        data-action="route" data-route="market"
        aria-pressed="false">股票</button>
      <button type="button" data-market-kind="futures"
        data-stage-market-kind="futures"
        data-action="derivatives-section"
        data-derivatives-section="futures"
        aria-pressed="${
          section === 'futures' ? 'true' : 'false'
        }">期货</button>
      <button type="button" data-market-kind="options"
        data-stage-market-kind="options"
        data-action="derivatives-section"
        data-derivatives-section="options"
        aria-pressed="${
          section === 'options' ? 'true' : 'false'
        }">期权</button>
    </nav>
  `;
}

function underlyingSwitch(
  contracts,
  projection,
  selectedUnderlyingId,
) {
  const groups = new Map();
  for (const contract of contracts) {
    if (!groups.has(contract.underlyingId)) {
      groups.set(contract.underlyingId, []);
    }
    groups.get(contract.underlyingId).push(contract);
  }
  return `
    <nav class="derivative-underlying-switch"
      aria-label="选择标的">
      ${[...groups.entries()]
        .map(([underlyingId, group]) => {
          const underlying =
            projection.contracts.underlyings[
              underlyingId
            ];
          const defaultContract =
            group.find(
              (contract) =>
                contract.status === 'active',
            ) ?? group[0];
          return `
            <button type="button"
              data-action="derivatives-underlying"
              data-derivatives-underlying="${escapeHtml(
                underlyingId,
              )}"
              data-derivatives-default-contract="${escapeHtml(
                defaultContract.id,
              )}"
              aria-pressed="${
                selectedUnderlyingId === underlyingId
                  ? 'true'
                  : 'false'
              }">${escapeHtml(
                playerFacingUnderlyingName(underlying) ||
                  underlyingId,
              )}</button>
          `;
        })
        .join('')}
    </nav>
  `;
}

function depthRows(book) {
  const bids = book?.bids ?? [];
  const asks = book?.asks ?? [];
  const count = Math.max(5, bids.length, asks.length);
  return Array.from({ length: count }, (_, index) => {
    const bid = bids[index];
    const ask = asks[index];
    return `
      <tr>
        <td class="market-up">${bid ? quotePrice(bid.priceTicks) : '—'}</td>
        <td>${bid ? integer(bid.quantity) : '—'}</td>
        <td class="market-down">${ask ? quotePrice(ask.priceTicks) : '—'}</td>
        <td>${ask ? integer(ask.quantity) : '—'}</td>
      </tr>
    `;
  }).join('');
}

function optionGreeksPanel(contract, projection) {
  if (contract?.type !== 'option') return '';
  const diagnostic =
    projection.optionDiagnostics?.[contract.id];
  if (!diagnostic) return '';
  const exposure =
    projection.player.optionGreekExposures?.[contract.id];
  return `
    <section class="derivative-greeks"
      data-derivatives-live-key="option-greeks"
      aria-label="期权敏感度"
      data-derivatives-delta-ppm="${diagnostic.deltaPpm}">
      <header>
        <strong>期权敏感度</strong>
        <small>${
          diagnostic.volatilitySource ===
          'matched_trade_implied'
            ? '成交隐含波动率'
            : '模型波动率参考'
        } ${(
          diagnostic.volatilityPpm / 10_000
        ).toFixed(2)}%</small>
      </header>
      <div class="derivative-greek-grid">
        <span><small>Delta</small><strong>${signedNumber(
          diagnostic.deltaPpm / 1_000_000,
          3,
        )}</strong></span>
        <span><small>Gamma / 0.01</small><strong>${signedNumber(
          diagnostic.gammaPpmPerTick / 1_000_000,
          4,
        )}</strong></span>
        <span><small>Vega / 波动点</small><strong>${signedNumber(
          diagnostic.vegaTicksPerVolPoint / 100,
          2,
        )}</strong></span>
        <span><small>Theta / 日</small><strong>${signedNumber(
          diagnostic.thetaTicksPerDay / 100,
          2,
        )}</strong></span>
        <span><small>Rho / 利率点</small><strong>${signedNumber(
          diagnostic.rhoTicksPerRatePoint / 100,
          2,
        )}</strong></span>
      </div>
      <div class="derivative-option-value-grid"
        data-derivatives-option-diagnostic-at-ms="${
          diagnostic.asOfMs ?? ''
        }"
        data-derivatives-option-model-price-ticks="${
          diagnostic.priceTicks ?? ''
        }">
        <span><small>模型参考</small><strong>${finiteQuote(
          diagnostic.priceTicks,
        )}</strong></span>
        <span><small>内在价值</small><strong>${finiteQuote(
          diagnostic.intrinsicTicks,
        )}</strong></span>
        <span><small>时间价值</small><strong>${finiteQuote(
          diagnostic.timeValueTicks,
        )}</strong></span>
        <span><small>诊断时间</small><strong>${integer(
          diagnostic.asOfMs,
        )} ms</strong></span>
      </div>
      ${
        exposure
          ? `
            <div class="derivative-position-greeks"
              data-derivatives-delta-exposure-ppm-units="${
                exposure.deltaPpmUnits
              }">
              <small>持仓 Delta</small>
              <strong>${signedNumber(
                exposure.deltaPpmUnits / 1_000_000,
                2,
              )} ${escapeHtml(exposure.multiplierUnit)}</strong>
              <small>Gamma</small>
              <strong>${signedNumber(
                exposure.gammaPpmUnitsPerTick / 1_000_000,
                3,
              )} / 0.01</strong>
              <small>Vega</small>
              <strong>${signedYuanFromCents(
                exposure.vegaCentsPerVolPoint,
              )} / 波动点</strong>
              <small>Theta</small>
              <strong>${signedYuanFromCents(
                exposure.thetaCentsPerDay,
              )} / 日</strong>
            </div>
          `
          : ''
      }
    </section>
  `;
}

function finiteQuote(value) {
  return value !== null &&
    value !== undefined &&
    value !== '' &&
    Number.isSafeInteger(Number(value))
    ? quotePrice(value)
    : '—';
}

function derivativeSeriesPanel(
  contract,
  projection,
  timeframe = 'intraday',
) {
  const safeTimeframe = ['intraday', '1m', '1d'].includes(
    timeframe,
  )
    ? timeframe
    : 'intraday';
  const series = projection.seriesByContract?.[contract.id] ?? {
    priceAuthority: 'matched_order_fills_only',
    tradePoints: [],
    minuteBars: [],
    dailyBars: [],
  };
  const authorities =
    projection.priceAuthoritiesByContract?.[contract.id] ?? {};
  const source =
    safeTimeframe === 'intraday'
      ? series.tradePoints ?? []
      : safeTimeframe === '1m'
        ? series.minuteBars ?? []
        : series.dailyBars ?? [];
  const points = source.map((item) => ({
    atMs: item.atMs ?? item.startMs,
    openTicks: item.openTicks ?? item.priceTicks,
    highTicks: item.highTicks ?? item.priceTicks,
    lowTicks: item.lowTicks ?? item.priceTicks,
    closeTicks: item.closeTicks ?? item.priceTicks,
    volume: item.volume ?? item.quantity,
    turnoverTicks:
      item.turnoverTicks ??
      item.priceTicks * item.quantity,
  }));
  const values = points.flatMap((point) => [
    point.lowTicks,
    point.highTicks,
  ]);
  const minimum = values.length > 0
    ? Math.min(...values)
    : 0;
  const maximum = values.length > 0
    ? Math.max(...values)
    : 1;
  const span = Math.max(1, maximum - minimum);
  const chartLeft = 28;
  const chartRight = 572;
  const chartTop = 18;
  const chartBottom = 174;
  const xFor = (index) =>
    points.length <= 1
      ? (chartLeft + chartRight) / 2
      : chartLeft +
        index *
          (chartRight - chartLeft) /
          (points.length - 1);
  const yFor = (ticks) =>
    chartBottom -
    (ticks - minimum) /
      span *
      (chartBottom - chartTop);
  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(
          2,
        )} ${yFor(point.closeTicks).toFixed(2)}`,
    )
    .join(' ');
  const candles =
    safeTimeframe === 'intraday'
      ? ''
      : points
          .map((point, index) => {
            const x = xFor(index);
            const bodyTop = yFor(
              Math.max(point.openTicks, point.closeTicks),
            );
            const bodyBottom = yFor(
              Math.min(point.openTicks, point.closeTicks),
            );
            const direction =
              point.closeTicks >= point.openTicks
                ? 'up'
                : 'down';
            return `<g class="derivative-series-candle derivative-series-candle--${direction}">
              <line x1="${x.toFixed(2)}" y1="${yFor(
                point.highTicks,
              ).toFixed(2)}" x2="${x.toFixed(2)}" y2="${yFor(
                point.lowTicks,
              ).toFixed(2)}"></line>
              <rect x="${(x - 3).toFixed(2)}" y="${bodyTop.toFixed(
                2,
              )}" width="6" height="${Math.max(
                1,
                bodyBottom - bodyTop,
              ).toFixed(2)}"></rect>
            </g>`;
          })
          .join('');
  const totalVolume = points.reduce(
    (sum, point) => sum + point.volume,
    0,
  );
  const totalTurnoverTicks = points.reduce(
    (sum, point) => sum + point.turnoverTicks,
    0,
  );
  const vwapTicks =
    totalVolume > 0
      ? Math.round(totalTurnoverTicks / totalVolume)
      : null;
  const timeframeButtons = [
    ['intraday', '分时'],
    ['1m', '1分K线'],
    ['1d', '日K线'],
  ]
    .map(
      ([value, label]) => `
        <button type="button"
          data-action="derivatives-series-timeframe"
          data-derivatives-series-timeframe="${value}"
          aria-pressed="${safeTimeframe === value ? 'true' : 'false'}">
          ${label}
        </button>`,
    )
    .join('');
  return `
    <section class="derivative-series-card"
      data-derivatives-live-key="selected-market-series"
      data-derivatives-series-contract="${escapeHtml(contract.id)}"
      data-derivatives-series-authority="${escapeHtml(
        series.priceAuthority ?? 'matched_order_fills_only',
      )}">
      <header>
        <span><small>权威成交序列</small><strong>分时与 K 线</strong></span>
      </header>
      <div class="derivative-price-authorities">
        <span><small>成交价</small><strong>${finiteQuote(
          authorities.lastTrade?.priceTicks,
        )}</strong></span>
        <span><small>结算价</small><strong>${finiteQuote(
          authorities.settlement?.priceTicks,
        )}</strong></span>
        <span><small>盯市价</small><strong>${finiteQuote(
          authorities.mark?.priceTicks,
        )}</strong></span>
        <span><small>理论价</small><strong>${finiteQuote(
          authorities.theoretical?.priceTicks,
        )}</strong></span>
      </div>
      <nav class="derivative-series-timeframes" aria-label="衍生品图表周期">
        ${timeframeButtons}
      </nav>
      <svg class="derivative-series-chart" viewBox="0 0 600 210"
        role="img" aria-label="${safeTimeframe === 'intraday' ? '分时成交线' : 'K线'}"
        data-derivatives-series-point-count="${points.length}">
        <line class="derivative-series-axis" x1="${chartLeft}" y1="${chartBottom}" x2="${chartRight}" y2="${chartBottom}"></line>
        ${
          points.length === 0
            ? `<text x="${chartLeft}" y="96">尚无真实成交，不用模型价冒充行情</text>`
            : safeTimeframe === 'intraday'
              ? `<path class="derivative-series-line" d="${linePath}"></path>`
              : candles
        }
      </svg>
      <div class="derivative-series-summary">
        <span><small>成交量</small><strong>${integer(
          totalVolume,
        )}</strong></span>
        <span><small>成交额（点·数量）</small><strong>${integer(
          totalTurnoverTicks,
        )}</strong></span>
        <span><small>VWAP</small><strong>${finiteQuote(
          vwapTicks,
        )}</strong></span>
        <span><small>价格来源</small><strong>仅限真实撮合成交</strong></span>
      </div>
    </section>
  `;
}

function selectedMarketPanel(
  contract,
  projection,
  timeframe = 'intraday',
) {
  if (!contract) {
    return `
      <section class="derivative-market-card derivative-empty">
        当前没有可观察的合约。
      </section>
    `;
  }
  const authority =
    derivativeAuthorityFields(projection);
  const book = projection.books[contract.id] ?? {
    bids: [],
    asks: [],
  };
  const underlying =
    projection.contracts.underlyings[
      contract.underlyingId
    ];
  const lastTrade =
    projection.lastTradePriceTicks[contract.id] ??
    null;
  const settlement =
    projection.settlementPriceTicks[contract.id] ??
    null;
  const mark = lastTrade ?? settlement;
  const spot = Number.isSafeInteger(
    Number(underlying?.spotTicks),
  )
    ? Number(underlying.spotTicks)
    : null;
  const basis =
    Number.isSafeInteger(Number(mark)) &&
    Number.isSafeInteger(Number(spot))
      ? Number(mark) - Number(spot)
      : null;
  const priceBand =
    projection.priceBands?.[contract.id] ?? null;
  const quantityUnit =
    contract.quantityUnit ??
    (contract.type === 'future' ? '手' : '张');
  const multiplierText =
    `1${quantityUnit}=${integer(
      contract.contractMultiplier,
    )}${contract.multiplierUnit ?? ''}`;
  const minimumTickValue = yuanFromCents(
    contract.tickSize *
      contract.tickValueCents,
  );
  const initialMargin =
    contract.type === 'future'
      ? `${(contract.initialMarginBps / 100).toFixed(0)}%`
      : '买方支付权利金';
  return `
    <section class="derivative-market-card"
      data-derivatives-live-key="selected-market-projection"
      data-derivatives-contract-id="${escapeHtml(contract.id)}"
      data-derivatives-authority-now-ms="${authority.authorityNowMs}"
      data-derivatives-authority-commit-seq="${authority.authorityCommitSeq}"
      data-derivatives-commit-seq="${authority.derivativeCommitSeq}"
      data-derivatives-last-trade-ticks="${lastTrade ?? ''}"
      data-derivatives-settlement-ticks="${settlement ?? ''}"
      data-derivatives-underlying-spot-ticks="${spot ?? ''}"
      data-derivatives-underlying-observation-at-ms="${
        underlying?.observationAtMs ?? ''
      }"
      data-derivatives-basis-ticks="${basis ?? ''}"
      data-derivatives-premium-ticks="${
        contract.type === 'option' ? mark ?? '' : ''
      }"
      data-derivatives-expiry-ms="${contract.expiryMs}"
      data-derivatives-mark-source="${
        lastTrade !== null
          ? 'matched_trade'
          : 'settlement_reference'
      }">
      <header class="derivative-market-card__header"
        data-derivatives-live-key="trade-header">
        <span>
          <small>${
            contract.type === 'future'
              ? '期货实时行情'
              : '期权实时行情'
          }</small>
          <strong>${escapeHtml(
            contractName(contract, projection),
          )}</strong>
        </span>
        <span class="derivative-expiry">
          ${daysToExpiry(contract, projection.nowMs)} 日
        </span>
      </header>
      <div class="derivative-live-quote-grid">
        <span><small>${
          contract.type === 'option'
            ? '最新权利金'
            : '最新'
        }</small><strong>${finiteQuote(
          lastTrade,
        )}</strong></span>
        <span><small>${
          contract.type === 'option'
            ? '结算权利金'
            : '结算'
        }</small><strong>${finiteQuote(
          settlement,
        )}</strong></span>
        <span><small>标的</small><strong>${finiteQuote(
          spot,
        )}</strong></span>
        <span><small>${
          contract.type === 'future'
            ? '基差'
            : '权利金'
        }</small><strong>${
          contract.type === 'future'
            ? finiteQuote(basis)
            : finiteQuote(mark)
        }</strong></span>
      </div>
      <p class="derivative-observation-freshness">
        合约行情提交 ${integer(
          authority.authorityCommitSeq,
        )} · 市场时间 ${integer(
          authority.authorityNowMs,
        )} ms · 标的观察 ${integer(
          underlying?.observationAtMs,
        )} ms
      </p>
      <div class="derivative-contract-facts"
        data-derivatives-live-key="contract-facts">
        <span><small>最小变动</small><strong>${quotePrice(
          contract.tickSize,
        )} ${escapeHtml(contract.quoteUnit ?? '')}</strong></span>
        <span><small>合约单位</small><strong>${escapeHtml(
          multiplierText,
        )}</strong></span>
        <span><small>每最小变动</small><strong>${minimumTickValue}</strong></span>
        <span><small>保证金</small><strong>${initialMargin}</strong></span>
        <span><small>到期</small><strong>${integer(
          contract.expiryMs,
        )} ms</strong></span>
        ${
          priceBand
            ? `<span data-derivatives-limit-down-ticks="${priceBand.lowerTicks}"
                data-derivatives-limit-up-ticks="${priceBand.upperTicks}">
                <small>当日价格范围</small>
                <strong>${quotePrice(
                  priceBand.lowerTicks,
                )}–${quotePrice(
                  priceBand.upperTicks,
                )}</strong>
              </span>`
            : ''
        }
      </div>
      ${derivativeSeriesPanel(
        contract,
        projection,
        timeframe,
      )}
      ${optionGreeksPanel(contract, projection)}
      <section class="derivative-depth-card">
        <header>
          <strong>盘口</strong>
          <small>价格时间优先 · ${escapeHtml(
            quantityUnit,
          )}</small>
        </header>
        <div class="derivative-depth">
          <table>
            <thead><tr><th>买价</th><th>${escapeHtml(
              quantityUnit,
            )}</th><th>卖价</th><th>${escapeHtml(
              quantityUnit,
            )}</th></tr></thead>
            <tbody data-derivatives-live-key="order-depth">${depthRows(book)}</tbody>
          </table>
        </div>
      </section>
    </section>
  `;
}

function orderPanel(contract, projection, permission) {
  if (!contract) return '';
  const book = projection.books[contract.id] ?? {
    bids: [],
    asks: [],
  };
  const reference =
    book.asks?.[0]?.priceTicks ??
    book.bids?.[0]?.priceTicks ??
    projection.lastTradePriceTicks[contract.id] ??
    projection.settlementPriceTicks[contract.id] ??
    contract.strikeTicks ??
    1;
  const open =
    projection.access.permissionModes[permission] === 'OPEN';
  const priceBand =
    projection.priceBands?.[contract.id] ?? null;
  const quantityUnit =
    contract.quantityUnit ??
    (contract.type === 'future' ? '手' : '张');
  const referencePremium = yuanFromCents(
    reference * contract.tickValueCents,
  );
  const previewLabel =
    contract.type === 'option'
      ? '参考总权利金'
      : '参考名义金额';
  const existingOptionQuantity =
    contract.type === 'option'
      ? Math.max(
          0,
          Number(
            projection.player.positions?.[
              contract.id
            ]?.quantity,
          ) || 0,
        )
      : 0;
  const optionSellDisabled =
    contract.type === 'option' &&
    existingOptionQuantity <= 0;
  return `
    <section class="derivative-trade-card"
      data-derivatives-task-form="contract-order">
      <header>
        <span>
          <small>交易</small>
          <strong>${escapeHtml(
            contractName(contract, projection),
          )}</strong>
        </span>
        ${permissionPanel(
          projection,
          permission,
          contract.type === 'option' ? '期权' : '期货',
        )}
      </header>
      <form id="derivatives-order-form" class="derivative-ticket"
        data-derivatives-contract-type="${escapeHtml(contract.type)}"
        data-derivatives-tick-value-cents="${contract.tickValueCents}"
        data-derivatives-quantity-unit="${escapeHtml(quantityUnit)}"
        data-option-sellable-quantity="${existingOptionQuantity}">
        <input type="hidden" name="contractId"
          value="${escapeHtml(contract.id)}" />
        <div class="derivative-side">
          <label><input type="radio" name="side" value="buy" checked />
            <span>买入</span></label>
          <label ${
            contract.type === 'option'
              ? 'data-option-sell-existing'
              : ''
          }><input type="radio" name="side" value="sell"
            ${optionSellDisabled ? 'disabled' : ''} />
            <span>${
              contract.type === 'option'
                ? '卖出已有'
                : '卖出'
            }</span></label>
        </div>
        <label>委托方式
          <select name="orderType">
            <option value="market">市价</option>
            <option value="limit">限价</option>
          </select>
        </label>
        <label>价格
          <input name="limitPrice" type="number"
            min="${quotePrice(
              priceBand?.lowerTicks ??
                contract.tickSize,
            )}"
            ${
              priceBand
                ? `max="${quotePrice(
                    priceBand.upperTicks,
                  )}"`
                : ''
            }
            step="${quotePrice(contract.tickSize)}"
            value="${quotePrice(reference)}" />
        </label>
        <label>数量（${escapeHtml(quantityUnit)}）
          <input name="quantity" type="number" min="1" step="1"
            value="1" required />
        </label>
        <output class="derivative-order-preview"
          data-derivatives-order-preview aria-live="polite">
          <small>${previewLabel}${
            contract.type === 'option'
              ? ` · 报价 ${escapeHtml(
                contract.premiumQuoteUnit ?? contract.quoteUnit ?? '',
              )}`
              : ''
          }</small>
          <strong>${referencePremium}</strong>
        </output>
        <button type="submit" ${open ? '' : 'disabled'}>下单</button>
      </form>
    </section>
  `;
}

function positionsPanel(projection) {
  const positions = Object.values(
    projection.player.positions ?? {},
  ).filter((position) => position.quantity !== 0);
  const orders = projection.player.openOrders ?? [];
  if (positions.length === 0 && orders.length === 0) {
    return `
      <section class="derivative-account-list"
        data-derivatives-live-key="positions-orders">
        <header><strong>持仓与委托</strong></header>
        <p class="derivative-empty">当前没有衍生品持仓或待成交委托。</p>
      </section>
    `;
  }
  return `
    <section class="derivative-account-list"
      data-derivatives-live-key="positions-orders">
      <header><strong>持仓与委托</strong></header>
      ${
        positions.length
          ? `<div class="derivative-position-rows">${positions
              .map((position) => {
                const contract =
                  projection.contracts.futures[
                    position.contractId
                  ] ??
                  projection.contracts.options[
                    position.contractId
                  ];
                const mark =
                  projection.player.positionMarks?.[
                    position.contractId
                  ];
                const markTone =
                  (mark?.unrealizedPnLCents ?? 0) > 0
                    ? 'market-up'
                    : (mark?.unrealizedPnLCents ?? 0) < 0
                      ? 'market-down'
                      : '';
                return `
                  <div class="derivative-account-row"
                    ${
                      mark
                        ? `data-derivatives-unrealized-pnl-cents="${mark.unrealizedPnLCents}"`
                        : ''
                    }>
                    <span><strong>${escapeHtml(
                      contractName(contract, projection),
                    )}</strong><small>${
                      position.quantity > 0 ? '多头' : '空头'
                    } ${integer(Math.abs(position.quantity))} ${escapeHtml(
                      contract?.quantityUnit ?? '张',
                    )} · 成本 ${quotePrice(
                      position.averageOpenPriceTicks,
                    )}</small>${
                      mark
                        ? `<small class="${markTone}">现价 ${quotePrice(
                            mark.markPriceTicks,
                          )} · 浮动盈亏 ${signedYuanFromCents(
                            mark.unrealizedPnLCents,
                          )}${
                            mark.realizedPnLCents !== 0
                              ? ` · 已实现 ${signedYuanFromCents(
                                  mark.realizedPnLCents,
                                )}`
                              : ''
                          }</small>`
                        : ''
                    }</span>
                    <button type="button" data-action="derivatives-close"
                      data-derivatives-contract="${escapeHtml(position.contractId)}"
                      data-derivatives-side="${
                        position.quantity > 0 ? 'sell' : 'buy'
                      }"
                      data-derivatives-quantity="${Math.abs(position.quantity)}">
                      平仓
                    </button>
                  </div>
                `;
              })
              .join('')}</div>`
          : ''
      }
      ${
        orders.length
          ? `<div class="derivative-order-rows">${orders
              .map((order) => {
                const contract =
                  projection.contracts.futures[
                    order.contractId
                  ] ??
                  projection.contracts.options[
                    order.contractId
                  ];
                return `
                  <div class="derivative-account-row">
                    <span><strong>${escapeHtml(
                      contractName(contract, projection),
                    )}</strong><small>${
                      order.side === 'buy' ? '买入' : '卖出'
                    } ${integer(order.remainingQty)} ${escapeHtml(
                      contract?.quantityUnit ?? '张',
                    )} · ${
                      order.priceTicks
                        ? quotePrice(order.priceTicks)
                        : '市价'
                    }</small></span>
                    <button type="button" data-action="derivatives-cancel"
                      data-derivatives-contract="${escapeHtml(order.contractId)}"
                      data-derivatives-order="${escapeHtml(order.id)}">撤单</button>
                  </div>
                `;
              })
              .join('')}</div>`
          : ''
      }
    </section>
  `;
}

function riskPanel(projection) {
  const risk = projection.player.risk ?? {};
  const status = riskStatusCopy(
    projection.player.riskStatus ??
      risk.facilityAggregate?.status,
  );
  const scenarioLosses =
    risk.optionScenarioLossesCents ?? [];
  const worstLoss = Math.max(
    0,
    ...scenarioLosses.map((value) => Number(value) || 0),
  );
  return `
    <section class="derivative-risk"
      data-derivatives-live-key="account-risk">
      <header><strong>账户风险</strong><small
        class="derivative-risk-status is-${status.tone}">${status.label}</small></header>
      <div>
        <span><small>账户权益</small><strong>${yuanFromCents(
          risk.equityCents,
        )}</strong></span>
        <span><small>初始保证金</small><strong>${yuanFromCents(
          risk.initialMarginCents,
        )}</strong></span>
        <span><small>维持保证金</small><strong>${yuanFromCents(
          risk.maintenanceMarginCents,
        )}</strong></span>
        <span><small>可用保证金</small><strong>${yuanFromCents(
          risk.availableInitialMarginCents,
        )}</strong></span>
        <span><small>压力情景最大损失</small><strong>${yuanFromCents(
          worstLoss,
        )}</strong></span>
      </div>
      ${
        status.detail
          ? `<p class="derivative-risk-guidance">${status.detail}</p>`
          : ''
      }
    </section>
  `;
}

function receiptLabel(receipt) {
  const labels = {
    SUBMIT_ORDER: '委托回执',
    CANCEL_ORDER: '撤单回执',
    ENABLE_PERMISSION: '权限回执',
    DRAW_MARGIN_CREDIT: '融资回执',
    REPAY_MARGIN_CREDIT: '还款回执',
    BORROW_SECURITY: '借券回执',
    RETURN_SECURITY: '还券回执',
  };
  return labels[receipt?.type] ?? '市场处理';
}

function receiptStatusLabel(receipt) {
  if (receipt?.status === 'applied') return '已处理';
  if (receipt?.status === 'partial') return '部分处理';
  if (receipt?.status === 'rejected') return '未受理';
  return '已记录';
}

function receiptsPanel(projection) {
  const authority =
    derivativeAuthorityFields(projection);
  const receipts = (
    projection.recentReceipts ?? []
  ).slice(-4).reverse();
  return `
    <section class="derivative-account-list derivative-receipts"
      data-derivatives-live-key="recent-receipts"
      data-derivatives-authority-now-ms="${authority.authorityNowMs}"
      data-derivatives-authority-commit-seq="${authority.authorityCommitSeq}">
      <header><strong>处理回执</strong><small>权威提交 ${integer(
        authority.authorityCommitSeq,
      )}</small></header>
      ${
        receipts.length > 0
          ? `<div class="derivative-receipt-rows">${receipts
              .map(
                (receipt) => `
                  <div class="derivative-receipt-row"
                    data-derivatives-receipt-type="${escapeHtml(
                      receipt.type,
                    )}"
                    data-derivatives-receipt-commit-seq="${
                      receipt.commitSeq ?? ''
                    }">
                    <span><strong>${receiptLabel(
                      receipt,
                    )}</strong><small>${integer(
                      receipt.atMs,
                    )} ms</small></span>
                    <span>${receiptStatusLabel(
                      receipt,
                    )}</span>
                  </div>
                `,
              )
              .join('')}</div>`
          : '<p class="derivative-empty">当前没有处理回执。</p>'
      }
    </section>
  `;
}

function resolveFinancingSelection(
  projection,
  selectedId,
) {
  const facility = projection.financingFacility ?? {};
  const instruments = Object.values(
    projection.securitiesLending?.instruments ??
      {},
  );
  const marginKey =
    `margin:${facility.providerId ?? 'facility'}`;
  const requested = String(selectedId ?? '');
  const lendingSecurityId =
    requested.startsWith('lending:')
      ? requested.slice('lending:'.length)
      : null;
  const lendingInstrument = instruments.find(
    (instrument) =>
      instrument.securityId === lendingSecurityId,
  );
  if (lendingInstrument) {
    return {
      kind: 'lending',
      key: `lending:${lendingInstrument.securityId}`,
      facility,
      instruments,
      instrument: lendingInstrument,
      marginKey,
    };
  }
  return {
    kind: 'margin',
    key: marginKey,
    facility,
    instruments,
    instrument:
      instruments.find(
        (instrument) =>
          instrument.playerAvailableQuantity > 0,
      ) ??
      instruments[0] ??
      null,
    marginKey,
  };
}

function financingSelectionPanel(
  projection,
  selection,
) {
  const availableSecurityCount =
    selection.instruments.filter(
      (instrument) =>
        instrument.playerAvailableQuantity > 0,
    ).length;
  return `
    <section class="derivative-financing-entity-group">
      <header><strong>融资额度</strong><small>有限信用池</small></header>
      <button type="button"
        class="derivative-financing-entity ${
          selection.kind === 'margin'
            ? 'is-selected'
            : ''
        }"
        data-action="derivatives-contract"
        data-derivatives-contract="${escapeHtml(selection.marginKey)}"
        data-derivatives-financing-entity="${escapeHtml(selection.marginKey)}"
        data-derivatives-live-key="financing-facility-entity"
        data-financing-available-cents="${
          selection.facility.playerAvailableCreditCents ?? 0
        }"
        aria-current="${
          selection.kind === 'margin' ? 'true' : 'false'
        }">
        <span><strong>${escapeHtml(
          selection.facility.providerName ??
            '融资信用设施',
        )}</strong><small>可用 ${yuanFromCents(
          selection.facility.playerAvailableCreditCents,
        )}</small></span>
        <small>${percentFromBps(
          selection.facility.annualRateBps,
        )}</small>
      </button>
    </section>
    <section class="derivative-financing-entity-group">
      <header data-derivatives-live-key="lending-resource-count"
        data-lending-security-count="${availableSecurityCount}">
        <strong>融券券源</strong>
        <small>可借证券 ${integer(
          availableSecurityCount,
        )} 只</small>
      </header>
      <div class="derivative-financing-entity-list">
        ${
          selection.instruments.length > 0
            ? selection.instruments
                .map((instrument) => {
                  const key =
                    `lending:${instrument.securityId}`;
                  return `
                    <button type="button"
                      class="derivative-financing-entity ${
                        selection.key === key
                          ? 'is-selected'
                          : ''
                      }"
                      data-action="derivatives-contract"
                      data-derivatives-contract="${escapeHtml(key)}"
                      data-derivatives-financing-entity="${escapeHtml(key)}"
                      data-derivatives-live-key="financing-entity-${escapeHtml(
                        instrument.securityId,
                      )}"
                      data-lending-security="${escapeHtml(
                        instrument.securityId,
                      )}"
                      data-lending-available-quantity="${
                        instrument.playerAvailableQuantity ?? 0
                      }"
                      data-lending-annual-fee-bps="${
                        instrument.annualFeeBps
                      }"
                      aria-current="${
                        selection.key === key
                          ? 'true'
                          : 'false'
                      }">
                      <span><strong>${escapeHtml(
                        instrument.name ??
                          instrument.securityId,
                      )}</strong><small>${escapeHtml(
                        instrument.securityId,
                      )} · 可借 ${integer(
                        instrument.playerAvailableQuantity,
                      )} 股</small></span>
                      <small>${percentFromBps(
                        instrument.annualFeeBps,
                      )}</small>
                    </button>
                  `;
                })
                .join('')
            : '<p class="derivative-empty">当前没有可借券源。</p>'
        }
      </div>
    </section>
  `;
}

function selectedFinancingPanel(
  projection,
  selection,
) {
  const authority =
    derivativeAuthorityFields(projection);
  const financing = projection.player.financing ?? {};
  const financingRisk =
    projection.player.risk?.financing ?? {};
  if (selection.kind === 'lending') {
    const instrument = selection.instrument;
    const loan =
      projection.player.borrowedSecurities?.[
        instrument.securityId
      ];
    const lendingRisk =
      projection.player.risk?.securitiesLending ??
      {};
    return `
      <section class="derivative-market-card derivative-resource-market"
        data-derivatives-live-key="selected-financing-projection"
        data-derivatives-selected-financing-entity="${escapeHtml(
          selection.key,
        )}"
        data-derivatives-authority-now-ms="${authority.authorityNowMs}"
        data-derivatives-authority-commit-seq="${authority.authorityCommitSeq}"
        data-lending-security="${escapeHtml(
          instrument.securityId,
        )}"
        data-lending-available-quantity="${
          instrument.playerAvailableQuantity ?? 0
        }"
        data-lending-pool-available-quantity="${
          instrument.availableQuantity ?? 0
        }"
        data-lending-annual-fee-bps="${
          instrument.annualFeeBps
        }">
        <header class="derivative-market-card__header">
          <span><small>实时融券条件</small><strong>${escapeHtml(
            instrument.name ??
              instrument.securityId,
          )}</strong></span>
          <span class="derivative-expiry">${escapeHtml(
            instrument.securityId,
          )}</span>
        </header>
        <div class="derivative-financing-metrics"
          data-derivatives-live-key="selected-lending-metrics">
          <span><small>玩家可借</small><strong>${integer(
            instrument.playerAvailableQuantity,
          )} 股</strong></span>
          <span><small>券源池剩余</small><strong>${integer(
            instrument.availableQuantity,
          )} 股</strong></span>
          <span><small>借券费率</small><strong>${percentFromBps(
            instrument.annualFeeBps,
          )}</strong></span>
          <span><small>参考价</small><strong>${finiteQuote(
            instrument.referencePriceTicks,
          )}</strong></span>
          <span><small>当前借入</small><strong>${integer(
            loan?.quantity ??
              instrument.playerBorrowedQuantity,
          )} 股</strong></span>
          <span><small>融券担保比例</small><strong>${percentFromBps(
            lendingRisk.collateralRatioBps,
            loan ? '待结算' : '未借入',
          )}</strong></span>
        </div>
        <section class="derivative-resource-depth">
          <header><strong>券源深度</strong><small>权威提交 ${integer(
            authority.authorityCommitSeq,
          )}</small></header>
          <div>
            <span><small>初始券源</small><strong>${integer(
              instrument.initialQuantity,
            )}</strong></span>
            <span><small>机构已借</small><strong>${integer(
              instrument.institutionalBorrowedQuantity,
            )}</strong></span>
            <span><small>全池已借</small><strong>${integer(
              instrument.borrowedQuantity,
            )}</strong></span>
            <span><small>利用率</small><strong>${percentFromBps(
              instrument.utilizationBps,
            )}</strong></span>
            <span><small>自有持股</small><strong>${integer(
              instrument.playerHoldingQuantity,
            )}</strong></span>
          </div>
        </section>
        <p class="derivative-observation-freshness">
          市场时间 ${integer(
            authority.authorityNowMs,
          )} ms · 券源、费率和参考价来自同一衍生品公开投影；股票买卖深度以股票订单簿为准。
        </p>
      </section>
    `;
  }
  const facility = selection.facility;
  return `
    <section class="derivative-market-card derivative-resource-market"
      data-derivatives-live-key="selected-financing-projection"
      data-derivatives-selected-financing-entity="${escapeHtml(
        selection.key,
      )}"
      data-derivatives-authority-now-ms="${authority.authorityNowMs}"
      data-derivatives-authority-commit-seq="${authority.authorityCommitSeq}"
      data-financing-available-cents="${
        facility.playerAvailableCreditCents ?? 0
      }">
      <header class="derivative-market-card__header">
        <span><small>实时融资条件</small><strong>${escapeHtml(
          facility.providerName ??
            '融资信用设施',
        )}</strong></span>
        <span class="derivative-expiry">${percentFromBps(
          facility.annualRateBps,
        )}</span>
      </header>
      <div class="derivative-financing-metrics"
        data-derivatives-live-key="financing-metrics"
        data-financing-available-cents="${
          facility.playerAvailableCreditCents ?? 0
        }">
        <span><small>可用融资额度</small><strong>${yuanFromCents(
          facility.playerAvailableCreditCents,
        )}</strong></span>
        <span><small>授信池剩余</small><strong>${yuanFromCents(
          facility.availableCreditCents,
        )}</strong></span>
        <span><small>授信池已用</small><strong>${yuanFromCents(
          facility.outstandingCreditCents,
        )}</strong></span>
        <span><small>融资余额</small><strong>${yuanFromCents(
          financing.cashDebtCents,
        )}</strong></span>
        <span><small>融资年利率</small><strong>${percentFromBps(
          financing.annualRateBps ??
            facility.annualRateBps,
        )}</strong></span>
        <span><small>融资担保比例</small><strong>${percentFromBps(
          financingRisk.collateralRatioBps,
          financing.cashDebtCents > 0
            ? '待结算'
            : '未融资',
        )}</strong></span>
      </div>
      <section class="derivative-resource-depth">
        <header><strong>额度深度</strong><small>权威提交 ${integer(
          authority.authorityCommitSeq,
        )}</small></header>
        <div>
          <span><small>总容量</small><strong>${yuanFromCents(
            facility.capacityCents,
          )}</strong></span>
          <span><small>流动性保留</small><strong>${yuanFromCents(
            facility.minimumLiquidityReserveCents,
          )}</strong></span>
          <span><small>玩家合格担保品</small><strong>${yuanFromCents(
            facility.playerFacilityEligibleCollateralCents,
          )}</strong></span>
          <span><small>利用率</small><strong>${percentFromBps(
            facility.utilizationBps,
          )}</strong></span>
          <span><small>维持担保线</small><strong>${percentFromBps(
            financingRisk.maintenanceRatioBps,
          )}</strong></span>
          <span><small>强制处理线</small><strong>${percentFromBps(
            financingRisk.liquidationRatioBps,
          )}</strong></span>
        </div>
      </section>
      <p class="derivative-observation-freshness">
        市场时间 ${integer(
          authority.authorityNowMs,
        )} ms · 最近计息 ${integer(
          financing.lastAccruedAtMs,
        )} ms
      </p>
    </section>
  `;
}

function securitiesLendingPanel(
  projection,
  selectedInstrument,
) {
  const mode =
    projection.access.permissionModes
      .securities_lending;
  const open = mode === 'OPEN';
  const borrowed =
    projection.player.borrowedSecurities ?? {};
  const instruments = Object.values(
    projection.securitiesLending?.instruments ??
      {},
  );
  const firstInstrument = instruments[0] ?? null;
  const activeInstrument =
    instruments.find(
      (instrument) =>
        instrument.securityId ===
        selectedInstrument?.securityId,
    ) ??
    instruments.find(
      (instrument) =>
        borrowed[instrument.securityId]?.quantity > 0,
    ) ??
    instruments.find(
      (instrument) =>
        instrument.playerAvailableQuantity > 0,
    ) ??
    instruments[0];
  const borrowedSecurityCount = Object.values(
    borrowed,
  ).filter((loan) => loan.quantity > 0).length;
  const availableSecurityCount = instruments.filter(
    (instrument) =>
      instrument.playerAvailableQuantity > 0,
  ).length;
  const lendingRisk =
    projection.player.risk?.securitiesLending ?? {};
  const lendingGuidance =
    lendingRisk.status === 'LIQUIDATE'
      ? '融券已触发强制处理，请买回归还；缺少对手盘时未完成数量仍会保留。'
      : lendingRisk.status === 'MARGIN_CALL'
        ? '融券担保品接近风险线，可补充资金或买回归还。'
        : '';
  return `
    <section class="derivative-financing-card derivative-lending-card"
      data-derivatives-task-form="lending"
      ${
        firstInstrument
          ? `data-lending-available-quantity="${firstInstrument.playerAvailableQuantity ?? 0}"`
          : ''
      }
      data-lending-security-count="${availableSecurityCount}"
      data-lending-loan-security-count="${borrowedSecurityCount}">
      <header data-derivatives-live-key="lending-access">
        <span><small>证券账户</small><strong>融券</strong></span>
        ${permissionPanel(
          projection,
          'securities_lending',
          '融券',
        )}
      </header>
      <div class="derivative-financing-metrics"
        data-derivatives-live-key="lending-metrics"
        data-lending-security-count="${availableSecurityCount}"
        data-lending-loan-security-count="${borrowedSecurityCount}">
        <span><small>融券可借 · 可借证券</small><strong>${integer(
          availableSecurityCount,
        )} 只</strong></span>
        <span><small>融券负债</small><strong>${yuanFromCents(
          lendingRisk.liabilityCents,
        )}</strong></span>
        <span><small>当前融券</small><strong>${integer(
          borrowedSecurityCount,
        )} 只</strong></span>
        <span><small>借券费率</small><strong>${percentFromBps(
          activeInstrument?.annualFeeBps,
        )}</strong></span>
        <span><small>融券担保比例</small><strong>${percentFromBps(
          lendingRisk.collateralRatioBps,
          borrowedSecurityCount > 0 ? '待结算' : '未借入',
        )}</strong></span>
      </div>
      <div class="derivative-loan-rows"
        data-derivatives-live-key="lending-resources"
        aria-label="逐股券源与费率">
        ${
          instruments.length > 0
            ? `
              ${instruments
                .map(
                  (instrument) => `<span
                    data-lending-security="${escapeHtml(
                      instrument.securityId,
                    )}"
                    data-lending-available-quantity="${
                      instrument.playerAvailableQuantity ?? 0
                    }"
                    data-lending-pool-available-quantity="${
                      instrument.availableQuantity
                    }"
                    data-lending-annual-fee-bps="${
                      instrument.annualFeeBps
                    }">
                    <strong>${escapeHtml(
                      instrument.name ??
                        instrument.securityId,
                    )}</strong>
                    <small>逐股可借 ${integer(
                      instrument.playerAvailableQuantity ?? 0,
                    )} 股 · 券源池 ${integer(
                      instrument.availableQuantity,
                    )} 股 · 借券费率 ${percentFromBps(
                      instrument.annualFeeBps,
                    )}</small>
                  </span>`,
                )
                .join('')}
            `
            : '<span><small>当前没有可借券源。</small></span>'
        }
      </div>
      <div class="derivative-loan-rows"
        data-derivatives-live-key="lending-loans">
        ${
          borrowedSecurityCount > 0
            ? `
              ${Object.values(borrowed)
                .map((loan) => {
                  const instrument =
                    projection.securitiesLending
                      .instruments[loan.securityId];
                  return `<span>
                    <strong>${escapeHtml(
                      instrument?.name ??
                        loan.securityId,
                    )}</strong>
                    <small>${integer(
                      loan.quantity,
                    )} 股 · 参考价 ${quotePrice(
                      loan.referencePriceTicks,
                    )} · 借券费率 ${percentFromBps(
                      loan.annualFeeBps ??
                        instrument?.annualFeeBps,
                    )}</small>
                  </span>`;
                })
                .join('')}
            `
            : '<span><small>当前没有融券负债。</small></span>'
        }
      </div>
      <form id="derivatives-lending-form">
        <label>股票
          <select name="securityId">
            ${instruments
              .map(
                (instrument) => `
                  <option value="${escapeHtml(
                    instrument.securityId,
                  )}"
                    data-lending-available-quantity="${
                      instrument.playerAvailableQuantity ?? 0
                    }"
                    data-lending-pool-available-quantity="${
                      instrument.availableQuantity
                    }"
                    data-lending-annual-fee-bps="${
                      instrument.annualFeeBps
                    }" ${
                    instrument.securityId ===
                    activeInstrument?.securityId
                      ? 'selected'
                      : ''
                  }>
                    ${escapeHtml(
                      instrument.name,
                    )} · 逐股可借 ${integer(
                      instrument.playerAvailableQuantity ?? 0,
                    )} 股
                  </option>
                `,
              )
              .join('')}
          </select>
        </label>
        <label>数量（股）
          <input name="quantity" type="number"
            min="1" step="1" value="100" required />
        </label>
        <button type="submit" name="lendingAction"
          value="borrow" ${
            open &&
            (activeInstrument?.playerAvailableQuantity ?? 0) >
              0
              ? ''
              : 'disabled'
          }>借入</button>
        <button type="submit" name="lendingAction"
          value="return" ${
            open && borrowedSecurityCount > 0 ? '' : 'disabled'
          }>归还</button>
      </form>
      <p data-derivatives-live-key="lending-guidance">${lendingGuidance
        ? `${lendingGuidance} `
        : ''}借入股票进入同一证券账户，可在股票行情中交易；当前参考年费率 ${percentFromBps(
          activeInstrument?.annualFeeBps,
        )}，实际借券费率随逐股券源与风险变化，归还前需持有足够可用股份。</p>
    </section>
  `;
}

function marginActionPanel(projection) {
  const mode =
    projection.access.permissionModes.margin_financing;
  const open = mode === 'OPEN';
  const financing =
    projection.player.financing ?? {};
  const facility = projection.financingFacility ?? {};
  const financingRisk =
    projection.player.risk?.financing ?? {};
  return `
    <section class="derivative-financing-card"
      data-derivatives-task-form="margin"
      data-financing-available-cents="${
        facility.playerAvailableCreditCents ?? 0
      }">
      <header data-derivatives-live-key="financing-access">
        <span><small>证券账户</small><strong>融资</strong></span>
        ${permissionPanel(
          projection,
          'margin_financing',
          '融资',
        )}
      </header>
      <div class="derivative-financing-metrics"
        data-derivatives-live-key="financing-account-metrics"
        data-financing-available-cents="${
          facility.playerAvailableCreditCents ?? 0
        }">
        <span><small>可用融资额度</small><strong>${yuanFromCents(
          facility.playerAvailableCreditCents,
        )}</strong></span>
        <span><small>授信池剩余</small><strong>${yuanFromCents(
          facility.availableCreditCents,
        )}</strong></span>
        <span><small>授信池已用</small><strong>${yuanFromCents(
          facility.outstandingCreditCents,
        )}</strong></span>
        <span><small>融资余额</small><strong>${yuanFromCents(
          financing.cashDebtCents,
        )}</strong></span>
        <span><small>融资年利率</small><strong>${percentFromBps(
          financing.annualRateBps,
        )}</strong></span>
        <span><small>融资担保比例</small><strong>${percentFromBps(
          financingRisk.collateralRatioBps,
          financing.cashDebtCents > 0
            ? '待结算'
            : '未融资',
        )}</strong></span>
        <span><small>可用现金</small><strong>${yuanFromCents(
          projection.player.availableCashCents,
        )}</strong></span>
      </div>
      <form id="derivatives-financing-form">
        <label>金额
          <input name="amount" type="number" min="100" step="100"
            value="10000" required />
        </label>
        <button type="submit" name="financingAction" value="draw"
          ${
            open &&
            (facility.playerAvailableCreditCents ?? 0) > 0
              ? ''
              : 'disabled'
          }>融资</button>
        <button type="submit" name="financingAction" value="repay"
          ${open && financing.cashDebtCents > 0 ? '' : 'disabled'}>归还</button>
      </form>
      <p data-derivatives-live-key="financing-guidance">融资款进入同一账户；利息与负债按日结算。</p>
    </section>
  `;
}

function shortSalePanel(projection, instrument) {
  if (!instrument) return '';
  const borrowed =
    projection.player.borrowedSecurities?.[
      instrument.securityId
    ];
  const referenceTicks =
    instrument.referencePriceTicks ?? 1;
  return `
    <section class="derivative-financing-card derivative-short-sale-card"
      data-derivatives-task-form="short-sale"
      data-derivatives-selected-financing-entity="lending:${escapeHtml(
        instrument.securityId,
      )}"
      data-lending-security="${escapeHtml(
        instrument.securityId,
      )}">
      <header>
        <span><small>同一股票订单簿</small><strong>卖出 / 买回</strong></span>
        <small>${escapeHtml(
          instrument.name ??
            instrument.securityId,
        )}</small>
      </header>
      <form id="order-form" class="derivative-ticket derivative-short-sale-ticket"
        data-testid="order-form">
        <input id="order-symbol" type="hidden" name="symbol"
          value="${escapeHtml(instrument.securityId)}" />
        <div class="derivative-side">
          <label><input type="radio" name="side" value="sell" checked />
            <span>卖出</span></label>
          <label><input type="radio" name="side" value="buy" />
            <span>买回</span></label>
        </div>
        <label>委托方式
          <select id="order-type" name="orderType">
            <option value="market">市价</option>
            <option value="limit">限价</option>
          </select>
        </label>
        <label>价格
          <input id="order-limit" name="limitPrice" type="number"
            min="0.01" step="0.01"
            value="${quotePrice(referenceTicks)}"
            disabled />
        </label>
        <label>数量（股）
          <input id="order-quantity" name="quantity" type="number"
            min="1" step="1"
            value="${Math.max(
              100,
              Math.min(
                1_000,
                Number(borrowed?.quantity) || 100,
              ),
            )}" required />
        </label>
        <output id="order-preview" class="derivative-order-preview"
          data-testid="order-preview" aria-live="polite">
          <small>股票订单簿实时结算</small>
          <strong>${finiteQuote(referenceTicks)}</strong>
        </output>
        <button type="submit" data-testid="submit-order">
          提交市价订单
        </button>
      </form>
      <p>卖出与买回进入同一股票订单簿；买回成交后仍需在上方融券表单归还，未成交不能视为已归还。</p>
    </section>
  `;
}

function financingActionsPanel(
  projection,
  selection,
) {
  return `
    ${marginActionPanel(projection)}
    ${securitiesLendingPanel(
      projection,
      selection.instrument,
    )}
    ${shortSalePanel(
      projection,
      selection.instrument,
    )}
    ${receiptsPanel(projection)}
    ${riskPanel(projection)}
  `;
}

function derivativeResourcePanel(
  contract,
  projection,
) {
  if (!contract) return '';
  const risk = projection.player.risk ?? {};
  if (contract.type === 'future') {
    return `
      <section class="derivative-financing-card derivative-lawful-resource"
        data-derivatives-live-key="lawful-contract-resource"
        data-derivatives-resource-model="futures_margin_daily_mark">
        <header>
          <span><small>期货资源</small><strong>保证金与逐日盯市</strong></span>
        </header>
        <div class="derivative-financing-metrics">
          <span><small>合约初始保证金率</small><strong>${percentFromBps(
            contract.initialMarginBps,
          )}</strong></span>
          <span><small>已占初始保证金</small><strong>${yuanFromCents(
            risk.initialMarginCents,
          )}</strong></span>
          <span><small>维持保证金</small><strong>${yuanFromCents(
            risk.maintenanceMarginCents,
          )}</strong></span>
          <span><small>可用保证金</small><strong>${yuanFromCents(
            risk.availableInitialMarginCents,
          )}</strong></span>
        </div>
        <p>期货以保证金交易并按结算结果逐日盯市；这里不提供融资或融券操作。</p>
      </section>
    `;
  }
  return `
    <section class="derivative-financing-card derivative-lawful-resource"
      data-derivatives-live-key="lawful-contract-resource"
      data-derivatives-resource-model="option_premium_existing_position_only">
      <header>
        <span><small>期权资源</small><strong>权利金与已有持仓</strong></span>
      </header>
      <div class="derivative-financing-metrics">
        <span><small>买方可用现金</small><strong>${yuanFromCents(
          projection.player.availableCashCents,
        )}</strong></span>
        <span><small>卖出范围</small><strong>仅限已有期权持仓</strong></span>
        <span><small>写方开仓</small><strong>尚未开放</strong></span>
        <span><small>当前能力</small><strong>当前仅支持买方/卖出已有持仓</strong></span>
      </div>
      <p>期权买方支付权利金；空仓不能卖出，卖方开仓与备兑开仓尚未开放，也不以融资融券替代。</p>
    </section>
  `;
}

export function renderDerivativeTerminalTask(
  projection,
  {
    section = 'futures',
    selectedContractId = null,
    seriesTimeframe = 'intraday',
  } = {},
) {
  const safeSection =
    section === 'options' ? 'options' : 'futures';
  const allContracts = Object.values(
    safeSection === 'options'
      ? projection.contracts.options
      : projection.contracts.futures,
  );
  const selected =
    allContracts.find(
      (contract) =>
        contract.id === selectedContractId &&
        contract.status === 'active',
    ) ??
    allContracts.find(
      (contract) => contract.status === 'active',
    ) ??
    allContracts[0] ??
    null;
  const selectedUnderlyingId =
    selected?.underlyingId ?? null;
  const contracts = allContracts.filter(
    (contract) =>
      contract.underlyingId ===
      selectedUnderlyingId,
  );
  const permission =
    safeSection === 'options'
      ? 'option_buyer'
      : 'futures_trading';
  const authority =
    derivativeAuthorityFields(projection);
  return {
    section: safeSection,
    selectedEntityId: selected?.id ?? '',
    authorityNowMs: authority.authorityNowMs,
    authorityCommitSeq:
      authority.authorityCommitSeq,
    selectionHtml: `
      ${marketKindSwitch(safeSection)}
      ${underlyingSwitch(
        allContracts,
        projection,
        selectedUnderlyingId,
      )}
      <div class="derivative-contract-list"
        data-derivatives-live-key="contract-list">
        ${contractRows(
          contracts,
          projection,
          selected?.id,
        )}
      </div>
    `,
    marketHtml: selectedMarketPanel(
      selected,
      projection,
      seriesTimeframe,
    ),
    actionHtml: `
      ${orderPanel(
        selected,
        projection,
        permission,
      )}
      ${derivativeResourcePanel(
        selected,
        projection,
      )}
      ${positionsPanel(projection)}
      ${receiptsPanel(projection)}
      ${riskPanel(projection)}
    `,
  };
}

export function renderStockFinancingPanel(
  projection,
  symbol,
) {
  const authority =
    derivativeAuthorityFields(projection);
  const instrument =
    projection.securitiesLending?.instruments?.[
      symbol
    ] ?? null;
  const facility =
    projection.financingFacility ?? {};
  const financing =
    projection.player.financing ?? {};
  const financingRisk =
    projection.player.risk?.financing ?? {};
  const lendingRisk =
    projection.player.risk?.securitiesLending ??
    {};
  const borrowed =
    projection.player.borrowedSecurities?.[
      symbol
    ] ?? null;
  const marginOpen =
    projection.access.permissionModes
      .margin_financing === 'OPEN';
  const lendingOpen =
    projection.access.permissionModes
      .securities_lending === 'OPEN';
  const availableQuantity =
    instrument?.playerAvailableQuantity ?? 0;
  const borrowedQuantity =
    borrowed?.quantity ??
    instrument?.playerBorrowedQuantity ??
    0;
  return `
    <section class="derivative-financing-card lzy-stage__stock-financing"
      data-stock-financing-symbol="${escapeHtml(symbol)}"
      data-lending-security="${escapeHtml(symbol)}"
      data-lending-available-quantity="${availableQuantity}"
      data-lending-annual-fee-bps="${
        instrument?.annualFeeBps ?? ''
      }"
      data-authority-now-ms="${authority.authorityNowMs}"
      data-authority-commit-seq="${authority.authorityCommitSeq}">
      <header data-stock-financing-live-key="header">
        <span><small>当前股票信用交易</small><strong>${escapeHtml(
          instrument?.name ?? symbol,
        )}</strong></span>
        <small>${escapeHtml(symbol)}</small>
      </header>
      <div class="derivative-financing-metrics"
        data-stock-financing-live-key="metrics">
        <span><small>可用融资额度</small><strong>${yuanFromCents(
          facility.playerAvailableCreditCents,
        )}</strong></span>
        <span><small>融资余额</small><strong>${yuanFromCents(
          financing.cashDebtCents,
        )}</strong></span>
        <span><small>融资年利率</small><strong>${percentFromBps(
          financing.annualRateBps ??
            facility.annualRateBps,
        )}</strong></span>
        <span><small>融资担保比例</small><strong>${percentFromBps(
          financingRisk.collateralRatioBps,
        )}</strong></span>
        <span><small>当前券源</small><strong>${integer(
          availableQuantity,
        )} 股</strong></span>
        <span><small>借券年费率</small><strong>${percentFromBps(
          instrument?.annualFeeBps,
        )}</strong></span>
        <span><small>已借证券</small><strong>${integer(
          borrowedQuantity,
        )} 股</strong></span>
        <span><small>融券担保比例</small><strong>${percentFromBps(
          lendingRisk.collateralRatioBps,
          borrowedQuantity > 0
            ? '待结算'
            : '未借券',
        )}</strong></span>
      </div>
      <section class="lzy-stage__stock-credit-action">
        <header data-stock-financing-live-key="margin-access">
          <strong>融资 / 还款</strong>
          ${permissionPanel(
            projection,
            'margin_financing',
            '融资',
          )}
        </header>
        <form id="derivatives-financing-form"
          data-symbol-confirmation-required="false">
          <label>金额
            <input name="amount" type="number"
              min="100" step="100"
              value="10000" required />
          </label>
          <button type="submit"
            name="financingAction" value="draw"
            ${
              marginOpen &&
              (facility.playerAvailableCreditCents ??
                0) > 0
                ? ''
                : 'disabled'
            }>融资</button>
          <button type="submit"
            name="financingAction" value="repay"
            ${
              marginOpen &&
              (financing.cashDebtCents ?? 0) > 0
                ? ''
                : 'disabled'
            }>还款</button>
        </form>
      </section>
      <section class="lzy-stage__stock-credit-action">
        <header data-stock-financing-live-key="lending-access">
          <strong>借券 / 归还</strong>
          ${permissionPanel(
            projection,
            'securities_lending',
            '融券',
          )}
        </header>
        <form id="derivatives-lending-form"
          data-symbol-confirmation-required="false">
          <input type="hidden" name="securityId"
            value="${escapeHtml(symbol)}" />
          <label>数量（股）
            <input name="quantity" type="number"
              min="1" step="1" value="100"
              required />
          </label>
          <button type="submit"
            name="lendingAction" value="borrow"
            ${
              lendingOpen &&
              availableQuantity > 0
                ? ''
                : 'disabled'
            }>借券</button>
          <button type="submit"
            name="lendingAction" value="return"
            ${
              lendingOpen &&
              borrowedQuantity > 0
                ? ''
                : 'disabled'
            }>归还</button>
        </form>
      </section>
      <p data-stock-financing-live-key="guidance">
        融资买入、借券卖出、买回与归还都绑定当前股票；卖出和买回继续使用上方同一股票订单票据。
      </p>
    </section>
  `;
}

export function patchStockFinancingPanel(
  root,
  projection,
  symbol,
) {
  const current = root?.matches?.(
    '[data-stock-financing-symbol]',
  )
    ? root
    : root?.querySelector?.(
        '[data-stock-financing-symbol]',
      );
  if (!current) return false;
  const template =
    current.ownerDocument.createElement('template');
  template.innerHTML =
    renderStockFinancingPanel(
      projection,
      symbol,
    );
  const next = template.content.querySelector(
    '[data-stock-financing-symbol]',
  );
  if (!next) return false;
  synchronizeAttributes(current, next);
  const currentLive = new Map(
    [...current.querySelectorAll(
      '[data-stock-financing-live-key]',
    )].map((node) => [
      node.dataset.stockFinancingLiveKey,
      node,
    ]),
  );
  for (const nextNode of next.querySelectorAll(
    '[data-stock-financing-live-key]',
  )) {
    const currentNode = currentLive.get(
      nextNode.dataset.stockFinancingLiveKey,
    );
    if (!currentNode) continue;
    synchronizeAttributes(
      currentNode,
      nextNode,
    );
    currentNode.replaceChildren(
      ...[...nextNode.childNodes].map(
        (node) => node.cloneNode(true),
      ),
    );
  }
  const securityInput = current.querySelector(
    '#derivatives-lending-form [name="securityId"]',
  );
  const nextSecurityInput = next.querySelector(
    '#derivatives-lending-form [name="securityId"]',
  );
  if (securityInput && nextSecurityInput) {
    securityInput.value =
      nextSecurityInput.value;
  }
  for (const selector of [
    '#derivatives-financing-form button[value="draw"]',
    '#derivatives-financing-form button[value="repay"]',
    '#derivatives-lending-form button[value="borrow"]',
    '#derivatives-lending-form button[value="return"]',
  ]) {
    const button = current.querySelector(selector);
    const nextButton = next.querySelector(selector);
    if (button && nextButton) {
      button.disabled = nextButton.disabled;
    }
  }
  return true;
}

export function renderDerivativesView(
  projection,
  {
    section = 'futures',
    selectedContractId = null,
  } = {},
) {
  const safeSection = [
    'futures',
    'options',
    'financing',
  ].includes(section)
    ? section
    : 'futures';
  const allSectionContracts =
    safeSection === 'options'
      ? Object.values(projection.contracts.options)
      : safeSection === 'futures'
        ? Object.values(projection.contracts.futures)
        : [];
  const selected =
    allSectionContracts.find(
      (contract) => contract.id === selectedContractId,
    ) ??
    allSectionContracts.find(
      (contract) => contract.status === 'active',
    ) ??
    allSectionContracts[0] ??
    null;
  const financingSelection =
    safeSection === 'financing'
      ? resolveFinancingSelection(
          projection,
          selectedContractId,
        )
      : null;
  const selectedEntityId =
    financingSelection?.key ??
    selected?.id ??
    '';
  const selectedUnderlyingId =
    selected?.underlyingId ?? null;
  const contracts = allSectionContracts.filter(
    (contract) =>
      contract.underlyingId === selectedUnderlyingId,
  );
  const permission =
    safeSection === 'options'
      ? 'option_buyer'
      : 'futures_trading';
  const permissionLabel =
    safeSection === 'options' ? '期权' : '期货';
  const authority =
    derivativeAuthorityFields(projection);

  return `
    <section class="derivatives-shell" data-testid="derivatives-view"
      data-derivatives-section="${safeSection}"
      data-derivatives-selected-contract="${escapeHtml(
        selectedEntityId,
      )}"
      data-derivatives-authority-now-ms="${authority.authorityNowMs}"
      data-derivatives-authority-commit-seq="${authority.authorityCommitSeq}"
      data-derivatives-commit-seq="${authority.derivativeCommitSeq}"
      data-derivatives-decision-count="${authority.decisionCount}"
      data-derivatives-last-decision-at-ms="${
        authority.lastDecisionAtMs ?? ''
      }">
      <header class="derivatives-head">
        <span>
          <small>历择衍生品市场</small>
          <strong>${
            safeSection === 'financing'
              ? '融资融券'
              : '期货与期权'
          }</strong>
        </span>
        <div class="derivatives-head__actions"
          data-derivatives-live-key="head-actions">
          <button class="derivative-financing-entry" type="button"
            data-action="derivatives-section"
            data-derivatives-section="financing"
            aria-pressed="${
              safeSection === 'financing' ? 'true' : 'false'
            }">融资融券</button>
          ${
            safeSection === 'financing'
              ? ''
              : permissionPanel(
                projection,
                permission,
                permissionLabel,
              )
          }
        </div>
      </header>
      ${derivativeAuthorityStatus(projection)}
      <p class="derivative-qualification"
        data-derivatives-live-key="qualification">${escapeHtml(
        qualificationCopy(projection),
      )}</p>
      <div class="derivatives-layout">
        <aside class="derivative-market-rail derivative-task-column derivative-selection-column"
          data-derivatives-task-column="selection"
          data-derivatives-authority-now-ms="${authority.authorityNowMs}"
          data-derivatives-authority-commit-seq="${authority.authorityCommitSeq}">
          ${marketKindSwitch(safeSection)}
          ${
            safeSection === 'financing'
              ? financingSelectionPanel(
                  projection,
                  financingSelection,
                )
              : `
              ${underlyingSwitch(
                allSectionContracts,
                projection,
                selectedUnderlyingId,
              )}
              <div class="derivative-contract-list"
                data-derivatives-live-key="contract-list">
                ${contractRows(
                  contracts,
                  projection,
                  selected?.id,
                )}
              </div>
            `
          }
        </aside>
        <main class="derivative-task-column derivative-market-column"
          data-derivatives-task-column="market"
          data-derivatives-authority-now-ms="${authority.authorityNowMs}"
          data-derivatives-authority-commit-seq="${authority.authorityCommitSeq}">
          ${
            safeSection === 'financing'
              ? selectedFinancingPanel(
                  projection,
                  financingSelection,
                )
              : selectedMarketPanel(
                  selected,
                  projection,
                )
          }
        </main>
        <aside class="derivative-main derivative-task-column derivative-action-column"
          data-derivatives-task-column="action"
          data-derivatives-authority-now-ms="${authority.authorityNowMs}"
          data-derivatives-authority-commit-seq="${authority.authorityCommitSeq}">
          ${
            safeSection === 'financing'
              ? financingActionsPanel(
                  projection,
                  financingSelection,
                )
              : `
                ${orderPanel(
                  selected,
                  projection,
                  permission,
                )}
                ${positionsPanel(projection)}
                ${receiptsPanel(projection)}
                ${riskPanel(projection)}
              `
          }
        </aside>
      </div>
    </section>
  `;
}

function synchronizeAttributes(target, source) {
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

function liveNodeMap(root) {
  return new Map(
    [...root.querySelectorAll(
      '[data-derivatives-live-key]',
    )].map((node) => [
      node.dataset.derivativesLiveKey,
      node,
    ]),
  );
}

export function patchDerivativesView(
  root,
  projection,
  options = {},
) {
  const current =
    root?.matches?.('[data-testid="derivatives-view"]')
      ? root
      : root?.querySelector?.(
          '[data-testid="derivatives-view"]',
        );
  if (
    !current ||
    !isPublishedDerivativesProjection(projection)
  ) {
    return false;
  }
  const documentTarget = current.ownerDocument;
  const template =
    documentTarget.createElement('template');
  template.innerHTML = renderDerivativesView(
    projection,
    options,
  );
  const next = template.content.querySelector(
    '[data-testid="derivatives-view"]',
  );
  if (
    !next ||
    current.dataset.derivativesSection !==
      next.dataset.derivativesSection ||
    current.dataset.derivativesSelectedContract !==
      next.dataset.derivativesSelectedContract
  ) {
    return false;
  }

  for (const name of [
    'derivativesAuthorityNowMs',
    'derivativesAuthorityCommitSeq',
    'derivativesCommitSeq',
    'derivativesDecisionCount',
    'derivativesLastDecisionAtMs',
  ]) {
    current.dataset[name] = next.dataset[name] ?? '';
  }

  for (const columnName of [
    'selection',
    'market',
    'action',
  ]) {
    const currentColumn = current.querySelector(
      `[data-derivatives-task-column="${columnName}"]`,
    );
    const nextColumn = next.querySelector(
      `[data-derivatives-task-column="${columnName}"]`,
    );
    if (!currentColumn || !nextColumn) continue;
    currentColumn.dataset.derivativesAuthorityNowMs =
      nextColumn.dataset.derivativesAuthorityNowMs ??
      '';
    currentColumn.dataset
      .derivativesAuthorityCommitSeq =
      nextColumn.dataset
        .derivativesAuthorityCommitSeq ??
      '';
  }

  const currentNodes = liveNodeMap(current);
  const nextNodes = liveNodeMap(next);
  for (const [key, nextNode] of nextNodes) {
    const currentNode = currentNodes.get(key);
    if (!currentNode) continue;
    synchronizeAttributes(
      currentNode,
      nextNode,
    );
    currentNode.replaceChildren(
      ...[...nextNode.childNodes].map((node) =>
        node.cloneNode(true),
      ),
    );
  }
  return true;
}

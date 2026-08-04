import {
  PLAYER_WEALTH_PROJECTION_VERSION,
} from './player-wealth.js?v=f34a1d70e1a7aaed';

const VARIANTS = new Set(['home', 'funds']);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function moneyFromCents(value) {
  if (!Number.isSafeInteger(value)) return '无法估值';
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function priceFromTicks(value) {
  if (!Number.isFinite(value)) return '暂无报价';
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function percentageFromBps(value) {
  if (!Number.isSafeInteger(value)) return '';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${(Math.abs(value) / 100).toFixed(2)}%`;
}

function tone(value) {
  if (!Number.isSafeInteger(value)) return 'unknown';
  if (value > 0) return 'gain';
  if (value < 0) return 'loss';
  return 'flat';
}

function resultText(scope, value, returnBps) {
  if (!Number.isSafeInteger(value)) {
    return `${scope}无法估值`;
  }
  const percentage = percentageFromBps(returnBps);
  const suffix = percentage ? `（${percentage}）` : '';
  if (value > 0) {
    return `${scope}盈利 +${moneyFromCents(value)}${suffix}`;
  }
  if (value < 0) {
    return `${scope}亏损 -${moneyFromCents(
      Math.abs(value),
    )}${suffix}`;
  }
  return `${scope}持平 ${moneyFromCents(0)}${
    percentage ? `（${percentage}）` : ''
  }`;
}

function resultMarkup(scope, value, returnBps) {
  const text = resultText(scope, value, returnBps);
  return `
    <span class="player-wealth-result"
      data-tone="${tone(value)}"
      aria-label="${escapeHtml(text)}">
      ${escapeHtml(text)}
    </span>
  `;
}

function freshnessText(projection) {
  const virtualMs = projection.asOf?.virtualMs;
  const worldTick = projection.asOf?.worldTick;
  if (Number.isSafeInteger(virtualMs)) {
    const seconds = Math.floor(virtualMs / 1_000);
    return `市场时点 ${seconds} 秒`;
  }
  if (Number.isSafeInteger(worldTick)) {
    return `世界第 ${worldTick + 1} 日`;
  }
  return '最新可用快照';
}

function warningMarkup(projection) {
  if (projection.valuationStatus === 'complete') return '';
  const symbols = projection.missingQuoteSymbols
    .map(escapeHtml)
    .join('、');
  return `
    <p class="player-wealth-warning" role="status">
      报价缺失：${symbols || '未知证券'}。总财富与盈亏无法估值，
      未将缺失持仓按零计算。
    </p>
  `;
}

function cashMarkup(projection) {
  return `
    <dl class="player-wealth-cash" aria-label="现金构成">
      <div>
        <dt>现金总额</dt>
        <dd>${moneyFromCents(projection.cash.totalCents)}</dd>
      </div>
      <div>
        <dt>可用现金</dt>
        <dd>${moneyFromCents(projection.cash.availableCents)}</dd>
      </div>
      <div>
        <dt>冻结</dt>
        <dd>${moneyFromCents(projection.cash.frozenCents)}</dd>
      </div>
      <div>
        <dt>股票市值</dt>
        <dd>${moneyFromCents(
          projection.totalMarketValueCents,
        )}</dd>
      </div>
      <div>
        <dt>衍生品与融券净值</dt>
        <dd>${moneyFromCents(
          projection.derivativePositionValueCents,
        )}</dd>
      </div>
      ${
        projection.securitiesLoanLiabilityCents > 0
          ? `<div>
              <dt>其中融券负债</dt>
              <dd>−${moneyFromCents(
                projection.securitiesLoanLiabilityCents,
              )}</dd>
            </div>`
          : ''
      }
      <div>
        <dt>其他资产</dt>
        <dd>${moneyFromCents(
          projection.otherAssetsCents,
        )}</dd>
      </div>
      <div>
        <dt>负债</dt>
        <dd>${moneyFromCents(
          projection.liabilitiesCents,
        )}</dd>
      </div>
    </dl>
  `;
}

function positionQuantity(position) {
  const shortText = position.side === 'short' ? ' · 空头' : '';
  const frozenText =
    position.frozenQuantity > 0
      ? `<small>冻结 ${position.frozenQuantity} 股</small>`
      : '';
  return `
    <span>${position.quantity} 股${shortText}</span>
    ${frozenText}
  `;
}

function positionRow(position) {
  const pnlText = resultText(
    '持仓',
    position.holdingPnlCents,
    position.returnBps,
  );
  return `
    <tr>
      <th scope="row">
        <strong>${escapeHtml(position.name)}</strong>
        <small>${escapeHtml(position.symbol)}</small>
      </th>
      <td class="player-wealth-number">
        ${positionQuantity(position)}
      </td>
      <td class="player-wealth-number">
        ${priceFromTicks(position.averageCostTicks)}
      </td>
      <td class="player-wealth-number">
        ${priceFromTicks(position.priceTicks)}
      </td>
      <td class="player-wealth-number">
        ${moneyFromCents(position.marketValueCents)}
      </td>
      <td class="player-wealth-number"
        data-tone="${tone(position.holdingPnlCents)}">
        ${escapeHtml(pnlText)}
      </td>
    </tr>
  `;
}

function positionsMarkup(projection) {
  if (projection.positions.length === 0) {
    return `
      <p class="player-wealth-empty">
        当前没有股票持仓；总等价现金仅由账户现金构成。
      </p>
    `;
  }
  return `
    <div class="player-wealth-table-wrap">
      <table aria-label="持仓股票、数量、成本、现价与盈亏">
        <thead>
          <tr>
            <th scope="col">持仓股票</th>
            <th scope="col">数量</th>
            <th scope="col">成本价</th>
            <th scope="col">现价</th>
            <th scope="col">市值</th>
            <th scope="col">持仓盈亏</th>
          </tr>
        </thead>
        <tbody>
          ${projection.positions.map(positionRow).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function commonHeader(projection, variant) {
  const titleId = `player-wealth-title-${variant}`;
  return `
    <header class="player-wealth-head">
      <div>
        <small>${escapeHtml(freshnessText(projection))}</small>
        <h2 id="${titleId}">
          ${variant === 'home' ? '实时总财富' : '资金与持仓'}
        </h2>
      </div>
      <span>${escapeHtml(projection.identity.label)}</span>
    </header>
  `;
}

function heroMarkup(projection) {
  return `
    <div class="player-wealth-hero" aria-live="polite">
      <div>
        <span>总等价现金</span>
        <strong>${moneyFromCents(
          projection.totalEquivalentCents,
        )}</strong>
      </div>
      <div class="player-wealth-results">
        ${resultMarkup(
          '总',
          projection.totalPnlCents,
          projection.totalReturnBps,
        )}
        ${resultMarkup(
          '今日',
          projection.dayPnlCents,
          projection.dayReturnBps,
        )}
      </div>
    </div>
  `;
}

function homeMarkup(projection) {
  return `
    ${commonHeader(projection, 'home')}
    ${heroMarkup(projection)}
    ${warningMarkup(projection)}
    ${cashMarkup(projection)}
    <div class="player-wealth-position-summary">
      <span>持仓 <b>${projection.positionCount}</b> 只</span>
      <span>多头 <b>${projection.longPositionCount}</b></span>
      <span>空头 <b>${projection.shortPositionCount}</b></span>
    </div>
  `;
}

function fundsMarkup(projection) {
  return `
    ${commonHeader(projection, 'funds')}
    ${heroMarkup(projection)}
    ${warningMarkup(projection)}
    <div class="player-wealth-funds-grid">
      ${cashMarkup(projection)}
      <dl class="player-wealth-baseline">
        <div>
          <dt>初始等价资本</dt>
          <dd>${moneyFromCents(
            projection.baseline.equivalentCapitalCents,
          )}</dd>
        </div>
        <div>
          <dt>今日起点</dt>
          <dd>${moneyFromCents(
            projection.dayStartEquivalentCents,
          )}</dd>
        </div>
      </dl>
    </div>
    ${positionsMarkup(projection)}
  `;
}

/**
 * Renders the same semantic projection for either the compact homepage card
 * or the detailed funds surface. It does not read or write world state.
 */
export function renderPlayerWealth(
  projection,
  { variant = 'home' } = {},
) {
  if (
    projection?.projectionVersion !==
    PLAYER_WEALTH_PROJECTION_VERSION
  ) {
    throw new TypeError('A player wealth projection is required.');
  }
  if (!VARIANTS.has(variant)) {
    throw new RangeError(
      'player wealth variant must be "home" or "funds".',
    );
  }
  return `
    <section class="player-wealth player-wealth--${variant}"
      data-testid="player-wealth"
      data-variant="${variant}"
      aria-labelledby="player-wealth-title-${variant}">
      ${
        variant === 'home'
          ? homeMarkup(projection)
          : fundsMarkup(projection)
      }
    </section>
  `;
}

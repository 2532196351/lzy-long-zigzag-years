import {
  getMarketIntelligencePage,
  projectMarketIntelligence,
  queryMarketIntelligence,
} from './market-intelligence.js?v=20260801-01';

const PAGE_LABELS = Object.freeze({
  overview: '行情总览',
  industries: '行业脉络',
  companies: '公司档案',
  signals: '公告与线索',
});

const KNOWLEDGE_LABELS = Object.freeze({
  fact: '公开记录',
  clue: '经营线索',
  rumor: '传闻',
  interpretation: '市场解读',
  company: '公司',
  industry: '行业',
  market: '行情',
  financial: '财务',
  shareholder: '持有人',
  reference: '产业档案',
});

function escapeText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integer(value) {
  const number = finite(value);
  return number === null ? null : Math.trunc(number);
}

function formatNumber(value, digits = 0) {
  const number = finite(value);
  if (number === null) return '—';
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number);
}

function formatPrice(ticks) {
  const value = finite(ticks);
  return value === null ? '—' : formatNumber(value / 100, 2);
}

function formatMoneyCents(cents) {
  const value = finite(cents);
  if (value === null) return '—';
  const currency = value / 100;
  if (Math.abs(currency) >= 100_000_000) {
    return `${formatNumber(currency / 100_000_000, 2)} 亿`;
  }
  if (Math.abs(currency) >= 10_000) {
    return `${formatNumber(currency / 10_000, 2)} 万`;
  }
  return formatNumber(currency, 2);
}

function formatCurrency(value) {
  const number = finite(value);
  if (number === null) return '—';
  if (Math.abs(number) >= 100_000_000) {
    return `${formatNumber(number / 100_000_000, 2)} 亿`;
  }
  if (Math.abs(number) >= 10_000) {
    return `${formatNumber(number / 10_000, 2)} 万`;
  }
  return formatNumber(number, 2);
}

function formatBps(value, digits = 2) {
  const number = finite(value);
  return number === null ? '—' : `${formatNumber(number / 100, digits)}%`;
}

function signedBps(value) {
  const number = finite(value);
  if (number === null) return '—';
  const sign = number > 0 ? '+' : '';
  return `${sign}${formatNumber(number / 100, 2)}%`;
}

function directionClass(direction) {
  return direction === 'up'
    ? 'is-up'
    : direction === 'down'
      ? 'is-down'
      : 'is-flat';
}

function formatMetric(metric) {
  if (!metric) return '—';
  const value = metric.value;
  if (value === null || value === undefined) return '—';
  if (metric.unit === 'currency') return formatCurrency(value);
  if (metric.unit === 'cents') return formatMoneyCents(value);
  if (metric.unit === 'ticks') return formatPrice(value);
  if (metric.unit === 'bps') return formatBps(value);
  if (metric.unit === 'ratio') return formatNumber(value, 2);
  if (metric.unit === 'multiple') return `${formatNumber(value, 2)}×`;
  if (metric.unit === 'per_share') return formatNumber(value, 2);
  if (metric.unit === 'shares') return formatNumber(value);
  if (metric.unit === 'tick_range') {
    return value?.low && value?.high
      ? `${formatPrice(value.low)}–${formatPrice(value.high)}`
      : '—';
  }
  return formatNumber(value, 2);
}

function asOfLabel(observedAt, freshness) {
  const tick = integer(observedAt?.worldTick);
  const prefix = tick === null ? '时点未定' : `第 ${tick + 1} 日`;
  return freshness?.label ? `${prefix} · ${freshness.label}` : prefix;
}

function sourceMeta(record) {
  return `
    <span class="mi-source" data-mi-source-label>${escapeText(
      record.source?.label ?? '来源未标明',
    )}</span>
    <span>${escapeText(asOfLabel(record.observedAt, record.freshness))}</span>
    <span>${escapeText(record.source?.qualityLabel ?? '')}</span>
    <span>${escapeText(record.access?.label ?? '')}</span>
  `;
}

function knowledgeBadge(kind) {
  return `<span class="mi-knowledge mi-knowledge--${escapeText(
    kind,
  )}">${escapeText(KNOWLEDGE_LABELS[kind] ?? '记录')}</span>`;
}

function marketMetric(label, value, extra = '') {
  return `
    <div class="mi-metric">
      <dt>${escapeText(label)}</dt>
      <dd>${escapeText(value)}</dd>
      ${extra ? `<small>${escapeText(extra)}</small>` : ''}
    </div>
  `;
}

function quoteCard(company, { compact = false } = {}) {
  const quote = company.quote;
  const valuation = company.valuation;
  const range =
    valuation.rangeTicks?.low && valuation.rangeTicks?.high
      ? `${formatPrice(valuation.rangeTicks.low)}–${formatPrice(
          valuation.rangeTicks.high,
        )}`
      : '—';
  const ratio =
    quote.volumeRatio === null
      ? '—'
      : formatNumber(quote.volumeRatio, 2);
  return `
    <article class="mi-quote-card ${compact ? 'is-compact' : ''}"
      data-mi-company-quote="${escapeText(company.symbol)}">
      <button class="mi-card-link" type="button"
        data-mi-open-company="${escapeText(company.id)}"
        aria-label="打开 ${escapeText(company.name)} 公司档案">
        <span>
          <strong>${escapeText(company.name)}</strong>
          <small>${escapeText(company.symbol)} · ${escapeText(
            company.industryLabel,
          )}</small>
        </span>
        <span class="mi-open-mark" aria-hidden="true">↗</span>
      </button>
      <div class="mi-quote-primary">
        <span>最近成交价</span>
        <strong class="${directionClass(quote.direction)}">${formatPrice(
          quote.lastPriceTicks,
        )}</strong>
        <em class="${directionClass(quote.direction)}">${signedBps(
          quote.changeBps,
        )}</em>
      </div>
      <dl class="mi-key-metrics">
        ${marketMetric('量比', ratio)}
        ${marketMetric(
          '总市值',
          formatMoneyCents(quote.totalMarketCapCents),
        )}
        ${marketMetric(
          '流通市值',
          formatMoneyCents(quote.floatMarketCapCents),
        )}
        ${marketMetric('换手率', formatBps(quote.turnoverBps))}
      </dl>
      <details data-mi-progressive>
        <summary>估值与每股数据</summary>
        <dl class="mi-detail-metrics">
          ${marketMetric(
            '市盈率',
            valuation.priceEarnings === null
              ? '亏损或缺数据'
              : `${formatNumber(valuation.priceEarnings, 2)}×`,
          )}
          ${marketMetric(
            '市净率',
            valuation.priceBook === null
              ? '—'
              : `${formatNumber(valuation.priceBook, 2)}×`,
          )}
          ${marketMetric(
            '每股收益',
            formatNumber(valuation.earningsPerShare, 2),
          )}
          ${marketMetric('估值区间', range)}
        </dl>
        <p class="mi-basis">估值区间来自公开财务，不是成交价格。</p>
      </details>
    </article>
  `;
}

function overviewPage(model) {
  const overview = model.overview;
  return `
    <div class="mi-page" data-mi-page="overview">
      <section class="mi-section mi-section--quotes"
        data-mi-section="quote-board" aria-labelledby="mi-overview-quotes">
        <header class="mi-section-heading">
          <div>
            <span class="mi-eyebrow">实时行情</span>
            <h3 id="mi-overview-quotes">上市公司</h3>
          </div>
          <p>最近成交、估值与成交活跃度。</p>
        </header>
        <div class="mi-quote-grid">
          ${model.companies.map((company) => quoteCard(company)).join('')}
        </div>
      </section>
      <section class="mi-section" data-mi-section="market-overview">
        <header class="mi-section-heading">
          <div>
            <span class="mi-eyebrow">市场截面</span>
            <h3>历择交易所</h3>
          </div>
          <p>${escapeText(asOfLabel(overview.observedAt))}</p>
        </header>
        <dl class="mi-overview-metrics">
          ${marketMetric('上市公司', formatNumber(overview.symbolCount))}
          ${marketMetric(
            '涨 / 跌 / 平',
            `${overview.advanceCount} / ${overview.declineCount} / ${overview.flatCount}`,
          )}
          ${marketMetric(
            '总市值',
            formatMoneyCents(overview.totalMarketCapCents),
          )}
          ${marketMetric(
            '流通市值',
            formatMoneyCents(overview.floatMarketCapCents),
          )}
          ${marketMetric(
            '当日成交量',
            overview.sessionVolumeShares === null
              ? '—'
              : `${formatNumber(overview.sessionVolumeShares)} 股`,
          )}
          ${marketMetric(
            '市值加权变化',
            signedBps(overview.capitalizationWeightedChangeBps),
          )}
        </dl>
      </section>
      <section class="mi-section" data-mi-section="industry-pulse">
        <header class="mi-section-heading">
          <div>
            <span class="mi-eyebrow">产业链</span>
            <h3>行业脉络</h3>
          </div>
          <button class="mi-quiet-button" type="button"
            data-mi-go-page="industries">展开全部</button>
        </header>
        <div class="mi-industry-strip">
          ${model.industries
            .map(
              (industry) => `
                <button class="mi-industry-chip" type="button"
                  data-mi-open-industry="${escapeText(industry.id)}">
                  <span>${escapeText(industry.label)}</span>
                  <strong>${signedBps(industry.changeBps)}</strong>
                  <small>${industry.publicFactCount} 条公开记录 · ${
                    industry.clueCount
                  } 条线索</small>
                </button>
              `,
            )
            .join('')}
        </div>
      </section>
      <section class="mi-section" data-mi-section="latest-signals">
        <header class="mi-section-heading">
          <div>
            <span class="mi-eyebrow">公开记录</span>
            <h3>最近更新</h3>
          </div>
          <button class="mi-quiet-button" type="button"
            data-mi-go-page="signals">查看全部</button>
        </header>
        <div class="mi-signal-list">
          ${model.signals.slice(0, 5).map(signalCard).join('')}
        </div>
      </section>
    </div>
  `;
}

function industryCard(industry, companies) {
  const members = companies.filter((company) =>
    industry.companyIds.includes(company.id),
  );
  return `
    <article class="mi-industry-card">
      <button class="mi-card-link" type="button"
        data-mi-open-industry="${escapeText(industry.id)}">
        <span>
          <small>${escapeText(industry.chainPosition)}</small>
          <strong>${escapeText(industry.label)}</strong>
        </span>
        <span class="mi-open-mark" aria-hidden="true">↗</span>
      </button>
      <p>${escapeText(industry.summary)}</p>
      <dl class="mi-industry-numbers">
        ${marketMetric('公司', formatNumber(industry.symbolCount))}
        ${marketMetric('行情变化', signedBps(industry.changeBps))}
        ${marketMetric('公开记录', formatNumber(industry.publicFactCount))}
        ${marketMetric('线索', formatNumber(industry.clueCount))}
      </dl>
      <div class="mi-member-row">
        ${members
          .map(
            (company) => `
              <button type="button"
                data-mi-open-company="${escapeText(company.id)}">
                ${escapeText(company.shortName)}
                <span class="${directionClass(company.quote.direction)}">
                  ${signedBps(company.quote.changeBps)}
                </span>
              </button>
            `,
          )
          .join('')}
      </div>
    </article>
  `;
}

function industriesPage(model) {
  return `
    <div class="mi-page" data-mi-page="industries">
      <section class="mi-section" data-mi-section="industry-network">
        <header class="mi-section-heading">
          <div>
            <span class="mi-eyebrow">产业链截面</span>
            <h3>行业脉络</h3>
          </div>
          <p>行业、公司与公开经营记录可以相互进入。</p>
        </header>
        <div class="mi-industry-grid">
          ${model.industries
            .map((industry) => industryCard(industry, model.companies))
            .join('')}
        </div>
      </section>
    </div>
  `;
}

function industryPage(model) {
  const industry = model.industry;
  return `
    <div class="mi-page" data-mi-page="industry">
      <section class="mi-section mi-industry-hero"
        data-mi-section="industry-profile">
        <button class="mi-back-button" type="button"
          data-mi-go-page="industries">← 行业脉络</button>
        <span class="mi-eyebrow">${escapeText(industry.chainPosition)}</span>
        <h3>${escapeText(industry.label)}</h3>
        <p>${escapeText(industry.summary)}</p>
        <dl class="mi-overview-metrics">
          ${marketMetric('公司', formatNumber(industry.symbolCount))}
          ${marketMetric('行情变化', signedBps(industry.changeBps))}
          ${marketMetric(
            '总市值',
            formatMoneyCents(industry.totalMarketCapCents),
          )}
          ${marketMetric('公开记录', formatNumber(industry.publicFactCount))}
        </dl>
      </section>
      <section class="mi-section" data-mi-section="industry-companies">
        <header class="mi-section-heading">
          <div><span class="mi-eyebrow">公司</span><h3>行业成员</h3></div>
        </header>
        <div class="mi-quote-grid">
          ${model.companies
            .map((company) => quoteCard(company, { compact: true }))
            .join('')}
        </div>
      </section>
      <section class="mi-section" data-mi-section="industry-supply-demand">
        <header class="mi-section-heading">
          <div><span class="mi-eyebrow">产业档案</span><h3>供需结构</h3></div>
        </header>
        <div class="mi-facet-grid">
          ${facetGroup('需求侧', industry.demandFacets)}
          ${facetGroup('供给侧', industry.supplyFacets)}
          ${facetGroup('经营口径', industry.operatingFacets)}
        </div>
      </section>
      <section class="mi-section" data-mi-section="industry-signals">
        <header class="mi-section-heading">
          <div><span class="mi-eyebrow">公开记录</span><h3>本行业更新</h3></div>
        </header>
        <div class="mi-signal-list">
          ${
            model.signals.length
              ? model.signals.map(signalCard).join('')
              : '<p class="mi-empty">当前没有新的公开记录。</p>'
          }
        </div>
      </section>
    </div>
  `;
}

function companyDirectoryCard(company) {
  return `
    <article class="mi-company-card">
      <button class="mi-card-link" type="button"
        data-mi-open-company="${escapeText(company.id)}">
        <span>
          <strong>${escapeText(company.name)}</strong>
          <small>${escapeText(company.symbol)} · ${escapeText(
            company.industryLabel,
          )}</small>
        </span>
        <span class="mi-open-mark" aria-hidden="true">↗</span>
      </button>
      <p>${escapeText(company.description)}</p>
      <dl class="mi-company-card-metrics">
        ${marketMetric('最近成交价', formatPrice(company.quote.lastPriceTicks))}
        ${marketMetric('涨跌幅', signedBps(company.quote.changeBps))}
        ${marketMetric(
          '市盈率',
          company.valuation.priceEarnings === null
            ? '—'
            : `${formatNumber(company.valuation.priceEarnings, 2)}×`,
        )}
      </dl>
    </article>
  `;
}

function companiesPage(model) {
  return `
    <div class="mi-page" data-mi-page="companies">
      <section class="mi-section" data-mi-section="company-directory">
        <header class="mi-section-heading">
          <div><span class="mi-eyebrow">上市公司</span><h3>公司档案</h3></div>
          <p>报价、财务、股东、经营变化和线索在同一公司页分层展开。</p>
        </header>
        <div class="mi-company-grid">
          ${model.companies.map(companyDirectoryCard).join('')}
        </div>
      </section>
    </div>
  `;
}

function facetGroup(title, items) {
  return `
    <article class="mi-facet-card">
      <h4>${escapeText(title)}</h4>
      <ul>
        ${items.map((item) => `<li>${escapeText(item)}</li>`).join('')}
      </ul>
    </article>
  `;
}

function financialMetric(metric) {
  return `
    <div class="mi-financial-row">
      <dt>${escapeText(metric.label)}</dt>
      <dd>${escapeText(formatMetric(metric))}</dd>
    </div>
  `;
}

function holderRow(holder) {
  return `
    <tr>
      <td>${formatNumber(holder.rank)}</td>
      <th scope="row">${escapeText(holder.name)}</th>
      <td>${formatNumber(holder.quantity)}</td>
      <td>${
        holder.ownershipBps === null
          ? '—'
          : formatBps(holder.ownershipBps)
      }</td>
    </tr>
  `;
}

function signalCard(signal) {
  const kind = signal.knowledgeKind;
  const missing = signal.missing
    ? `<p class="mi-missing">仍缺：${escapeText(signal.missing)}</p>`
    : '';
  const status =
    signal.statusLabel || signal.verdict
      ? `<span>${escapeText(
          signal.statusLabel ??
            (signal.verdict === 'supported' ? '相符' : '不相符'),
        )}</span>`
      : '';
  return `
    <article class="mi-signal-card mi-signal-card--${escapeText(kind)}"
      data-mi-knowledge-kind="${escapeText(kind)}">
      <header>
        ${knowledgeBadge(kind)}
        ${status}
      </header>
      <h4>${escapeText(signal.title)}</h4>
      <p>${escapeText(signal.summary)}</p>
      ${missing}
      <footer>${sourceMeta(signal)}</footer>
    </article>
  `;
}

function reportedOperatingMetrics(supplyDemand) {
  const rows = Object.entries(supplyDemand.reported ?? {});
  if (!rows.length) {
    return '<p class="mi-empty">当前只有固定产业档案，没有新增公开经营结算。</p>';
  }
  return `
    <dl class="mi-operating-metrics">
      ${rows
        .map(([, metric]) =>
          marketMetric(metric.label, formatNumber(metric.value)),
        )
        .join('')}
    </dl>
  `;
}

function companyConnectionGroup(label, companies) {
  return `
    <section class="mi-company-connections">
      <header>
        <strong>${escapeText(label)}</strong>
        <span>${companies.length} 家</span>
      </header>
      <div>
        ${
          companies.length > 0
            ? companies
                .map(
                  (company) => `
                    <button type="button"
                      data-mi-open-company="${escapeText(company.id)}">
                      <span>
                        <strong>${escapeText(company.name)}</strong>
                        <small>${escapeText(company.symbol)} · ${escapeText(
                          company.industry,
                        )}</small>
                      </span>
                      <em>${escapeText(company.lifecycle)}</em>
                    </button>
                  `,
                )
                .join('')
            : '<p class="mi-empty">当前没有公开关联公司。</p>'
        }
      </div>
    </section>
  `;
}

function companyPage(model) {
  const company = model.company;
  const quote = company.quote;
  const valuation = company.valuation;
  const range =
    valuation.rangeTicks?.low && valuation.rangeTicks?.high
      ? `${formatPrice(valuation.rangeTicks.low)}–${formatPrice(
          valuation.rangeTicks.high,
        )}`
      : '—';
  return `
    <div class="mi-page" data-mi-page="company">
      <section class="mi-section mi-company-hero"
        data-mi-section="company-quote">
        <button class="mi-back-button" type="button"
          data-mi-go-page="companies">← 公司档案</button>
        <div class="mi-company-heading">
          <div>
            <span class="mi-eyebrow">${escapeText(
              company.industryLabel,
            )} · ${escapeText(company.lifecycle)}</span>
            <h3 data-mi-company-title>${escapeText(company.name)}
              <small>${escapeText(company.symbol)}</small>
            </h3>
            <p>${escapeText(company.description)}</p>
          </div>
          <div class="mi-company-price">
            <span>最近成交价</span>
            <strong class="${directionClass(quote.direction)}"
              data-mi-company-hero-price>${formatPrice(
                quote.lastPriceTicks,
              )}</strong>
            <em class="${directionClass(quote.direction)}">${signedBps(
              quote.changeBps,
            )}</em>
          </div>
        </div>
        <dl class="mi-company-quote-metrics">
          ${marketMetric(
            '量比',
            quote.volumeRatio === null
              ? '—'
              : formatNumber(quote.volumeRatio, 2),
            quote.basis.volumeRatio,
          )}
          ${marketMetric(
            '总市值',
            formatMoneyCents(quote.totalMarketCapCents),
            quote.basis.marketCapitalization,
          )}
          ${marketMetric(
            '流通市值',
            formatMoneyCents(quote.floatMarketCapCents),
            quote.basis.floatMarketCapitalization,
          )}
          ${marketMetric(
            '换手率',
            formatBps(quote.turnoverBps),
            quote.basis.turnover,
          )}
          ${marketMetric(
            '市盈率',
            valuation.priceEarnings === null
              ? '亏损或缺数据'
              : `${formatNumber(valuation.priceEarnings, 2)}×`,
          )}
          ${marketMetric(
            '市净率',
            valuation.priceBook === null
              ? '—'
              : `${formatNumber(valuation.priceBook, 2)}×`,
          )}
          ${marketMetric(
            '每股收益',
            formatNumber(valuation.earningsPerShare, 2),
          )}
          ${marketMetric('估值区间', range, '按已披露财务估算')}
        </dl>
      </section>
      <section class="mi-progressive-stack" aria-label="公司详细信息">
        <details data-mi-progressive data-mi-section="financials">
          <summary>
            <span><strong>财务与估值</strong><small>${escapeText(
              asOfLabel(valuation.observedAt, valuation.freshness),
            )}</small></span>
            <span aria-hidden="true">＋</span>
          </summary>
          <div class="mi-details-body">
            <dl class="mi-financial-grid">
              ${company.financials.map(financialMetric).join('')}
            </dl>
          </div>
        </details>
        <details data-mi-progressive data-mi-section="company-network">
          <summary>
            <span><strong>产业链关系</strong><small>${
              company.connections.suppliers.length +
              company.connections.customers.length
            } 家公开关联公司</small></span>
            <span aria-hidden="true">＋</span>
          </summary>
          <div class="mi-details-body mi-company-network">
            ${companyConnectionGroup(
              '供应方',
              company.connections.suppliers,
            )}
            ${companyConnectionGroup(
              '客户方',
              company.connections.customers,
            )}
          </div>
        </details>
        <details data-mi-progressive data-mi-section="management">
          <summary>
            <span><strong>经营团队</strong><small>${escapeText(
              company.management.operatingStyle,
            )}</small></span>
            <span aria-hidden="true">＋</span>
          </summary>
          <div class="mi-details-body">
            <div class="mi-management-grid">
              ${company.management.people
                .map(
                  (person) => `
                    <article>
                      <span>${escapeText(person.role)}</span>
                      <strong>${escapeText(person.name)}</strong>
                      <p>${escapeText(person.incentive)}</p>
                    </article>
                  `,
                )
                .join('')}
            </div>
          </div>
        </details>
        <details data-mi-progressive data-mi-section="shareholders">
          <summary>
            <span><strong>股东与持有人</strong><small>${
              company.shareholders.length
            } 条公开名册记录</small></span>
            <span aria-hidden="true">＋</span>
          </summary>
          <div class="mi-details-body mi-table-wrap" tabindex="0">
            ${
              company.shareholders.length
                ? `
                  <table>
                    <thead><tr><th>序</th><th>持有人</th><th>数量</th><th>占比</th></tr></thead>
                    <tbody>${company.shareholders.map(holderRow).join('')}</tbody>
                  </table>
                `
                : '<p class="mi-empty">当前没有公开持有人名册。</p>'
            }
          </div>
        </details>
        <details data-mi-progressive data-mi-section="supply-demand">
          <summary>
            <span><strong>供需与经营变化</strong><small>${escapeText(
              asOfLabel(company.supplyDemand.observedAt),
            )}</small></span>
            <span aria-hidden="true">＋</span>
          </summary>
          <div class="mi-details-body">
            ${reportedOperatingMetrics(company.supplyDemand)}
            <div class="mi-facet-grid">
              ${facetGroup('需求侧', company.supplyDemand.demandFacets)}
              ${facetGroup('供给侧', company.supplyDemand.supplyFacets)}
              ${facetGroup(
                '经营口径',
                company.supplyDemand.operatingFacets,
              )}
            </div>
          </div>
        </details>
        <details data-mi-progressive data-mi-section="disclosures">
          <summary>
            <span><strong>公告与公开记录</strong><small>${
              company.disclosures.length
            } 条</small></span>
            <span aria-hidden="true">＋</span>
          </summary>
          <div class="mi-details-body mi-signal-list">
            ${
              company.disclosures.length
                ? company.disclosures.map(signalCard).join('')
                : '<p class="mi-empty">当前没有公开记录。</p>'
            }
          </div>
        </details>
        <details data-mi-progressive data-mi-section="clues">
          <summary>
            <span><strong>新闻与经营线索</strong><small>${
              company.clues.length + company.interpretations.length
            } 条</small></span>
            <span aria-hidden="true">＋</span>
          </summary>
          <div class="mi-details-body mi-signal-list">
            ${
              company.clues.length || company.interpretations.length
                ? [...company.clues, ...company.interpretations]
                    .map(signalCard)
                    .join('')
                : '<p class="mi-empty">当前没有公开线索。</p>'
            }
          </div>
        </details>
      </section>
    </div>
  `;
}

function signalsPage(model) {
  const groups = {
    fact: model.signals.filter((item) => item.knowledgeKind === 'fact'),
    clue: model.signals.filter((item) => item.knowledgeKind === 'clue'),
    rumor: model.signals.filter((item) => item.knowledgeKind === 'rumor'),
    interpretation: model.signals.filter(
      (item) => item.knowledgeKind === 'interpretation',
    ),
  };
  return `
    <div class="mi-page" data-mi-page="signals">
      <section class="mi-section" data-mi-section="signal-network">
        <header class="mi-section-heading">
          <div>
            <span class="mi-eyebrow">公开信息</span>
            <h3>公告与线索</h3>
          </div>
          <p>公司公告、行业消息、市场传闻与各方观点。</p>
        </header>
        <div class="mi-signal-columns">
          ${signalGroup('公开记录', groups.fact)}
          ${signalGroup('经营线索', groups.clue)}
          ${signalGroup('传闻', groups.rumor)}
          ${signalGroup('市场解读', groups.interpretation)}
        </div>
      </section>
    </div>
  `;
}

function signalGroup(title, signals) {
  return `
    <section class="mi-signal-group">
      <header><h4>${escapeText(title)}</h4><span>${signals.length}</span></header>
      <div class="mi-signal-list">
        ${
          signals.length
            ? signals.map(signalCard).join('')
            : '<p class="mi-empty">当前没有记录。</p>'
        }
      </div>
    </section>
  `;
}

function renderPage(model) {
  if (model.page === 'industries') return industriesPage(model);
  if (model.page === 'industry') return industryPage(model);
  if (model.page === 'companies') return companiesPage(model);
  if (model.page === 'company') return companyPage(model);
  if (model.page === 'signals') return signalsPage(model);
  return overviewPage(model);
}

function topLevelPage(route) {
  if (route.page === 'company') return 'companies';
  if (route.page === 'industry') return 'industries';
  return Object.hasOwn(PAGE_LABELS, route.page) ? route.page : 'overview';
}

function searchResult(record) {
  return `
    <button type="button" class="mi-search-result"
      data-mi-search-result
      data-mi-result-page="${escapeText(record.route?.page ?? 'overview')}"
      data-mi-result-company="${escapeText(record.route?.companyId ?? '')}"
      data-mi-result-industry="${escapeText(record.route?.industryId ?? '')}"
      data-mi-result-section="${escapeText(record.route?.section ?? '')}">
      <span>
        ${knowledgeBadge(record.knowledgeKind)}
        <strong>${escapeText(record.title)}</strong>
        <small>${escapeText(record.summary)}</small>
      </span>
      <span class="mi-search-source">
        <em data-mi-source-label>${escapeText(record.source?.label ?? '')}</em>
        <small>${escapeText(
          asOfLabel(record.observedAt, record.freshness),
        )}</small>
      </span>
    </button>
  `;
}

function shell(network) {
  return `
    <section class="lzy-market-intelligence"
      aria-label="行情与公司信息网络">
      <header class="mi-topbar">
        <div class="mi-title">
          <span class="mi-eyebrow">历择交易所 · 行情情报</span>
          <h2>市场与公司</h2>
          <p data-mi-asof></p>
        </div>
        <div class="mi-search">
          <label for="mi-search-field">搜索公司、行业、公告或线索</label>
          <div class="mi-search-controls">
            <input id="mi-search-field" type="search"
              autocomplete="off" spellcheck="false"
              placeholder="输入公司、行业或公开记录"
              data-mi-search-input />
            <select aria-label="搜索类型" data-mi-search-kind>
              <option value="">全部类型</option>
              <option value="company">公司</option>
              <option value="industry">行业</option>
              <option value="fact">公开记录</option>
              <option value="clue">经营线索</option>
              <option value="rumor">传闻</option>
              <option value="interpretation">市场解读</option>
              <option value="financial">财务</option>
              <option value="shareholder">持有人</option>
            </select>
          </div>
          <div class="mi-search-results" data-mi-search-results hidden
            aria-live="polite"></div>
        </div>
      </header>
      <nav class="mi-navigation" aria-label="行情情报页面">
        ${network.navigation
          .map(
            (item) => `
              <button type="button" data-mi-nav-page="${escapeText(
                item.page,
              )}">${escapeText(item.label)}</button>
            `,
          )
          .join('')}
      </nav>
      <div class="mi-page-host" data-mi-page-host></div>
    </section>
  `;
}

function payloadParts(payload, fallbackWorld) {
  if (
    payload &&
    typeof payload === 'object' &&
    (payload.world || payload.marketSnapshot)
  ) {
    return {
      world: payload.world ?? fallbackWorld,
      marketSnapshot: payload.marketSnapshot ?? null,
    };
  }
  return { world: fallbackWorld, marketSnapshot: payload ?? null };
}

/**
 * Mounts the read-only intelligence browser. The returned object owns only its
 * DOM subtree and listeners; update accepts newer snapshots, and destroy never
 * touches the market client or authoritative world.
 */
export function mountMarketIntelligence(
  root,
  {
    world,
    marketSnapshot = null,
    initialRoute = { page: 'overview' },
    onRouteChange = () => {},
  } = {},
) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError(
      'mountMarketIntelligence requires a DOM root element.',
    );
  }
  if (root.dataset.miMounted === 'true') {
    throw new Error('A market intelligence view is already mounted here.');
  }
  if (typeof onRouteChange !== 'function') {
    throw new TypeError('onRouteChange must be a function.');
  }
  const state = {
    world,
    marketSnapshot,
    network: projectMarketIntelligence(world, marketSnapshot),
    route:
      initialRoute && typeof initialRoute === 'object'
        ? { ...initialRoute }
        : { page: 'overview' },
    query: '',
    kind: '',
    destroyed: false,
  };

  root.innerHTML = shell(state.network);
  root.dataset.miMounted = 'true';
  const nodes = {
    shell: root.querySelector('.lzy-market-intelligence'),
    pageHost: root.querySelector('[data-mi-page-host]'),
    asOf: root.querySelector('[data-mi-asof]'),
    searchInput: root.querySelector('[data-mi-search-input]'),
    searchKind: root.querySelector('[data-mi-search-kind]'),
    searchResults: root.querySelector('[data-mi-search-results]'),
  };

  function routeExists(route) {
    if (route.page === 'company') {
      return state.network.companies.some(
        (company) => company.id === route.companyId,
      );
    }
    if (route.page === 'industry') {
      return state.network.industries.some(
        (industry) => industry.id === route.industryId,
      );
    }
    return (
      route.page === 'overview' ||
      route.page === 'industries' ||
      route.page === 'companies' ||
      route.page === 'signals'
    );
  }

  function updateAsOf() {
    const asOf = state.network.asOf;
    nodes.asOf.textContent = `第 ${asOf.calendar.year} 年 · 第 ${
      asOf.calendar.day
    } 日`;
  }

  function updateNavigation() {
    const current = topLevelPage(state.route);
    for (const button of root.querySelectorAll(
      '.mi-navigation [data-mi-nav-page]',
    )) {
      const selected = button.dataset.miNavPage === current;
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  }

  function revealRequestedSection() {
    if (!state.route.section) return;
    const detail = nodes.pageHost.querySelector(
      `details[data-mi-section="${CSS.escape(state.route.section)}"]`,
    );
    if (detail) detail.open = true;
  }

  function renderContent() {
    const model = getMarketIntelligencePage(
      state.network,
      state.route,
    );
    if (model.page === 'overview' && state.route.page !== 'overview') {
      state.route = { page: 'overview' };
    }
    nodes.pageHost.innerHTML = renderPage(model);
    updateAsOf();
    updateNavigation();
    revealRequestedSection();
  }

  function renderSearchResults() {
    state.query = nodes.searchInput.value.trim();
    state.kind = nodes.searchKind.value;
    if (!state.query) {
      nodes.searchResults.hidden = true;
      nodes.searchResults.innerHTML = '';
      return;
    }
    const result = queryMarketIntelligence(state.network, {
      query: state.query,
      kinds: state.kind ? [state.kind] : [],
      limit: 12,
    });
    nodes.searchResults.hidden = false;
    nodes.searchResults.innerHTML = result.total
      ? `
          <div class="mi-search-summary">${result.total} 条匹配</div>
          ${result.items.map(searchResult).join('')}
        `
      : '<p class="mi-empty">没有匹配的公开记录。</p>';
  }

  function navigate(route) {
    if (!routeExists(route)) return false;
    state.route = { ...route };
    renderContent();
    nodes.pageHost.scrollIntoView?.({
      block: 'start',
      behavior: 'instant',
    });
    onRouteChange({ ...state.route });
    return true;
  }

  function handleClick(event) {
    const target = event.target.closest('button');
    if (!target || !root.contains(target)) return;
    if (target.dataset.miSearchResult !== undefined) {
      const route = {
        page: target.dataset.miResultPage || 'overview',
        ...(target.dataset.miResultCompany
          ? { companyId: target.dataset.miResultCompany }
          : {}),
        ...(target.dataset.miResultIndustry
          ? { industryId: target.dataset.miResultIndustry }
          : {}),
        ...(target.dataset.miResultSection
          ? { section: target.dataset.miResultSection }
          : {}),
      };
      navigate(route);
      nodes.searchResults.hidden = true;
      return;
    }
    if (target.dataset.miOpenCompany) {
      navigate({
        page: 'company',
        companyId: target.dataset.miOpenCompany,
      });
      return;
    }
    if (target.dataset.miOpenIndustry) {
      navigate({
        page: 'industry',
        industryId: target.dataset.miOpenIndustry,
      });
      return;
    }
    if (target.dataset.miGoPage) {
      navigate({ page: target.dataset.miGoPage });
      return;
    }
    if (target.dataset.miNavPage) {
      navigate({ page: target.dataset.miNavPage });
    }
  }

  function handleInput(event) {
    if (event.target === nodes.searchInput) renderSearchResults();
  }

  function handleChange(event) {
    if (event.target === nodes.searchKind) renderSearchResults();
  }

  root.addEventListener('click', handleClick);
  root.addEventListener('input', handleInput);
  root.addEventListener('change', handleChange);
  renderContent();
  renderSearchResults();

  function update(payload, optionalWorld = null) {
    if (state.destroyed) return false;
    const parts = payloadParts(payload, optionalWorld ?? state.world);
    if (!parts.world?.world?.id) return false;
    const nextCommit = integer(parts.marketSnapshot?.commitSeq) ?? 0;
    const currentCommit = integer(state.network.asOf.commitSeq) ?? 0;
    const nextTime = integer(parts.marketSnapshot?.nowMs) ?? 0;
    const currentTime = integer(state.network.asOf.virtualMs) ?? 0;
    if (
      nextCommit < currentCommit ||
      (nextCommit === currentCommit && nextTime < currentTime)
    ) {
      return false;
    }
    const nextNetwork = projectMarketIntelligence(
      parts.world,
      parts.marketSnapshot,
    );
    state.world = parts.world;
    state.marketSnapshot = parts.marketSnapshot;
    state.network = nextNetwork;
    if (!routeExists(state.route)) state.route = { page: 'overview' };
    renderContent();
    renderSearchResults();
    return true;
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    root.removeEventListener('click', handleClick);
    root.removeEventListener('input', handleInput);
    root.removeEventListener('change', handleChange);
    root.replaceChildren();
    delete root.dataset.miMounted;
  }

  return Object.freeze({ update, destroy });
}

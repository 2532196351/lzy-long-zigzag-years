/**
 * Deterministic, read-only market intelligence projection.
 *
 * The projector consumes public world facts and a player-facing market
 * snapshot. It never queues a command, mutates the world, reveals undisclosed
 * company state, or turns a clue into a fact. All quote-derived fields carry
 * their calculation basis so the view can distinguish a live derivation from
 * unavailable data.
 */

export const MARKET_INTELLIGENCE_SCHEMA =
  'lzy_market_intelligence_projection_v1';

const WORLD_DAY_MS = 86_400_000;
const BPS_SCALE = 10_000;
const DEFAULT_QUERY_LIMIT = 120;
const MAX_QUERY_LIMIT = 500;

const INDUSTRY_ARCHETYPES = Object.freeze([
  Object.freeze({
    id: 'industry_upstream_materials',
    roles: Object.freeze(['上游材料', '材料', '原料']),
    label: '上游材料',
    chainPosition: '产业链上游',
    summary: '原料、加工与交付周期共同形成制造环节的成本和供给边界。',
    demandFacets: Object.freeze([
      '制造端采购',
      '扩产备货',
      '替换与维护',
      '交付安全库存',
    ]),
    supplyFacets: Object.freeze([
      '原料到货',
      '加工产能',
      '库存周转',
      '回款周期',
    ]),
    operatingFacets: Object.freeze([
      '销量与库存',
      '应收与回款',
      '单位成本',
      '产能利用',
    ]),
    upstream: Object.freeze([]),
    downstream: Object.freeze(['industry_storage_manufacturing']),
  }),
  Object.freeze({
    id: 'industry_storage_manufacturing',
    roles: Object.freeze(['储能制造', '设备制造', '制造']),
    label: '储能制造',
    chainPosition: '产业链中游',
    summary: '材料被转化为设备与模块，订单兑现、产能利用和现金占用同时变化。',
    demandFacets: Object.freeze([
      '系统集成订单',
      '工商业改造',
      '设备更新',
      '渠道补库',
    ]),
    supplyFacets: Object.freeze([
      '材料交付',
      '产线节拍',
      '在制品库存',
      '质量与返工',
    ]),
    operatingFacets: Object.freeze([
      '产销差',
      '扩产投入',
      '自由现金流',
      '应付与应收',
    ]),
    upstream: Object.freeze(['industry_upstream_materials']),
    downstream: Object.freeze(['industry_system_integration']),
  }),
  Object.freeze({
    id: 'industry_system_integration',
    roles: Object.freeze(['系统集成', '集成', '工程服务']),
    label: '系统集成',
    chainPosition: '产业链下游',
    summary: '项目获取、交付验收和客户回款决定收入兑现节奏与资金占用。',
    demandFacets: Object.freeze([
      '园区项目',
      '电网侧改造',
      '工商业储能',
      '长期运维',
    ]),
    supplyFacets: Object.freeze([
      '设备齐套',
      '工程交付',
      '并网验收',
      '售后能力',
    ]),
    operatingFacets: Object.freeze([
      '签约与交付',
      '项目回款',
      '客户集中度',
      '履约现金流',
    ]),
    upstream: Object.freeze(['industry_storage_manufacturing']),
    downstream: Object.freeze([]),
  }),
  Object.freeze({
    id: 'industry_frontier_technology',
    roles: Object.freeze([
      '算力基础设施',
      '先进半导体',
      '工业软件',
      '智能机器人',
      '生命科学',
    ]),
    label: '前沿科技',
    chainPosition: '研发、平台与应用',
    summary: '研发里程碑、客户验证、续费或商业化进度通过公开事实改变分歧。',
    demandFacets: Object.freeze(['客户验证', '技术预算', '续费与复购', '商业化']),
    supplyFacets: Object.freeze(['研发人才', '关键部件', '算力资源', '现金跑道']),
    operatingFacets: Object.freeze(['研发投入', '里程碑', '客户集中度', '现金消耗']),
    upstream: Object.freeze([]),
    downstream: Object.freeze(['industry_system_integration']),
  }),
  Object.freeze({
    id: 'industry_commercial_bank',
    roles: Object.freeze(['全国性银行', '银行']),
    label: '银行',
    chainPosition: '金融中介',
    summary: '存贷款、净息差、信用成本、资本和流动性共同约束银行收益。',
    demandFacets: Object.freeze(['贷款需求', '存款稳定性', '手续费业务']),
    supplyFacets: Object.freeze(['资本充足', '流动性覆盖', '信用额度']),
    operatingFacets: Object.freeze(['净息差', '不良贷款率', '信用成本', '资本充足率']),
    upstream: Object.freeze([]),
    downstream: Object.freeze([]),
  }),
  Object.freeze({
    id: 'industry_insurance',
    roles: Object.freeze(['综合保险', '保险']),
    label: '保险',
    chainPosition: '风险承保与长期资产配置',
    summary: '保费质量、赔付、准备金、投资收益和偿付能力共同约束保险利润。',
    demandFacets: Object.freeze(['新单保费', '续期质量', '保障需求']),
    supplyFacets: Object.freeze(['准备金', '再保险', '偿付能力']),
    operatingFacets: Object.freeze(['赔付率', '投资收益率', '久期匹配', '偿付能力']),
    upstream: Object.freeze([]),
    downstream: Object.freeze([]),
  }),
  Object.freeze({
    id: 'industry_defensive_services',
    roles: Object.freeze(['公用事业', '大众消费', '综合物流']),
    label: '稳定运营与服务',
    chainPosition: '基础服务与终端需求',
    summary: '利用率、周转、监管或终端需求决定稳定业务的现金回收。',
    demandFacets: Object.freeze(['终端需求', '利用率', '续约与周转']),
    supplyFacets: Object.freeze(['资产可用性', '网络容量', '营运资金']),
    operatingFacets: Object.freeze(['现金流', '负债期限', '周转效率', '资本开支']),
    upstream: Object.freeze([]),
    downstream: Object.freeze([]),
  }),
]);

const FINANCIAL_METRICS = Object.freeze([
  Object.freeze({
    key: 'trailingRevenue',
    label: '滚动收入',
    unit: 'currency',
  }),
  Object.freeze({
    key: 'trailingNetIncome',
    label: '滚动净利润',
    unit: 'currency',
  }),
  Object.freeze({
    key: 'trailingFreeCashFlow',
    label: '滚动自由现金流',
    unit: 'currency',
  }),
  Object.freeze({
    key: 'bookEquity',
    label: '账面权益',
    unit: 'currency',
  }),
  Object.freeze({ key: 'cash', label: '公开现金', unit: 'currency' }),
  Object.freeze({ key: 'debt', label: '公开债务', unit: 'currency' }),
  Object.freeze({ key: 'netDebt', label: '净债务', unit: 'currency' }),
  Object.freeze({
    key: 'earningsPerShare',
    label: '每股收益',
    unit: 'per_share',
  }),
  Object.freeze({
    key: 'bookValuePerShare',
    label: '每股净资产',
    unit: 'per_share',
  }),
  Object.freeze({
    key: 'freeCashFlowPerShare',
    label: '每股自由现金流',
    unit: 'per_share',
  }),
  Object.freeze({
    key: 'revenueGrowthBps',
    label: '收入变化',
    unit: 'bps',
  }),
  Object.freeze({
    key: 'earningsGrowthBps',
    label: '利润变化',
    unit: 'bps',
  }),
  Object.freeze({
    key: 'expectedGrowthBps',
    label: '公开长期增长口径',
    unit: 'bps',
  }),
  Object.freeze({ key: 'capacity', label: '披露产能', unit: 'number' }),
  Object.freeze({
    key: 'marketShare',
    label: '披露市场份额',
    unit: 'ratio',
  }),
]);
const BANK_FINANCIAL_METRICS = Object.freeze([
  Object.freeze({ key: 'loans', label: '贷款余额', unit: 'currency' }),
  Object.freeze({ key: 'deposits', label: '存款余额', unit: 'currency' }),
  Object.freeze({ key: 'netInterestMarginBps', label: '净息差', unit: 'bps' }),
  Object.freeze({ key: 'nonPerformingLoanBps', label: '不良贷款率', unit: 'bps' }),
  Object.freeze({ key: 'creditCostBps', label: '信用成本', unit: 'bps' }),
  Object.freeze({ key: 'capitalAdequacyBps', label: '资本充足率', unit: 'bps' }),
  Object.freeze({ key: 'liquidityCoverageBps', label: '流动性覆盖率', unit: 'bps' }),
]);
const INSURANCE_FINANCIAL_METRICS = Object.freeze([
  Object.freeze({ key: 'premiumIncome', label: '保费收入', unit: 'currency' }),
  Object.freeze({ key: 'insuranceReserves', label: '保险准备金', unit: 'currency' }),
  Object.freeze({ key: 'investedAssets', label: '投资资产', unit: 'currency' }),
  Object.freeze({ key: 'claimsRatioBps', label: '赔付率', unit: 'bps' }),
  Object.freeze({ key: 'investmentYieldBps', label: '投资收益率', unit: 'bps' }),
  Object.freeze({ key: 'solvencyRatioBps', label: '偿付能力充足率', unit: 'bps' }),
]);

function financialMetricsForCompany(company) {
  const kind = object(company.businessModel).kind;
  if (kind === 'commercial_bank') {
    return [
      ...FINANCIAL_METRICS.filter(
        (metric) => !['capacity', 'marketShare'].includes(metric.key),
      ),
      ...BANK_FINANCIAL_METRICS,
    ];
  }
  if (kind === 'insurance_group') {
    return [
      ...FINANCIAL_METRICS.filter(
        (metric) => !['capacity', 'marketShare'].includes(metric.key),
      ),
      ...INSURANCE_FINANCIAL_METRICS,
    ];
  }
  return FINANCIAL_METRICS;
}

const SOURCE_LABELS = Object.freeze({
  exchange_quote: '合成交易所行情',
  trade_bars: '成交与行情归档',
  published_financial: '公开财务报告',
  holder_register: '公开持有人名册',
  company_disclosure: '企业公开披露',
  world_fact: '公开事实记录',
  operational_sample: '经营抽样',
  industry_interview: '产业访谈',
  rumor: '未核实转述',
  interpretation: '市场解读',
  industry_reference: '产业档案',
});

const QUALITY_LABELS = Object.freeze({
  authoritative: '公开原始记录',
  high: '多项依据',
  medium: '有限交叉印证',
  low: '单一未核来源',
  reference: '固定档案',
  unknown: '来源质量未定',
});

function finite(value, fallback = null) {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    typeof value === 'boolean'
  ) {
    return fallback;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = null) {
  const number = finite(value);
  if (number === null) return fallback;
  const rounded = Math.trunc(number);
  return Number.isSafeInteger(rounded) ? rounded : fallback;
}

function nonNegativeInteger(value, fallback = null) {
  const number = integer(value);
  return number !== null && number >= 0 ? number : fallback;
}

function positiveInteger(value, fallback = null) {
  const number = integer(value);
  return number !== null && number > 0 ? number : fallback;
}

function rounded(value, digits = 2) {
  const number = finite(value);
  if (number === null) return null;
  const scale = 10 ** digits;
  return Math.round((number + Number.EPSILON) * scale) / scale;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function string(value, fallback = '') {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : fallback;
}

function hash32(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function safeProduct(left, right) {
  const first = nonNegativeInteger(left);
  const second = nonNegativeInteger(right);
  if (first === null || second === null) return null;
  const product = first * second;
  return Number.isSafeInteger(product) ? product : null;
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => string(value)).filter(Boolean))];
}

function observedAt({
  worldTick = 0,
  virtualMs = null,
  calendar = null,
} = {}) {
  return {
    worldTick: Math.max(0, integer(worldTick, 0)),
    virtualMs: integer(virtualMs),
    calendar:
      calendar && typeof calendar === 'object'
        ? {
            year: positiveInteger(calendar.year),
            day: positiveInteger(calendar.day),
          }
        : null,
  };
}

function freshness(currentTick, sourceTick) {
  const ageTicks = Math.max(
    0,
    integer(currentTick, 0) - Math.max(0, integer(sourceTick, 0)),
  );
  const state =
    ageTicks === 0
      ? 'live'
      : ageTicks <= 5
        ? 'recent'
        : ageTicks <= 20
          ? 'settled'
          : 'archive';
  const label =
    state === 'live'
      ? '当前'
      : state === 'recent'
        ? '近期'
        : state === 'settled'
          ? '已结算'
          : '历史档案';
  return { state, label, ageTicks };
}

function sourceDescriptor(category, label = '', quality = 'unknown') {
  const normalizedCategory = Object.hasOwn(SOURCE_LABELS, category)
    ? category
    : 'world_fact';
  const normalizedQuality = Object.hasOwn(QUALITY_LABELS, quality)
    ? quality
    : 'unknown';
  return {
    category: normalizedCategory,
    label: string(label, SOURCE_LABELS[normalizedCategory]),
    quality: normalizedQuality,
    qualityLabel: QUALITY_LABELS[normalizedQuality],
  };
}

function publicAccess() {
  return { scope: 'public', label: '公开可见' };
}

function priceTicks(security, marketView) {
  return (
    positiveInteger(marketView.lastPriceTicks) ??
    positiveInteger(security.lastPriceTicks) ??
    (
      finite(security.lastPrice) !== null
        ? Math.max(1, Math.round(finite(security.lastPrice) * 100))
        : null
    ) ??
    (
      finite(security.referenceValue) !== null
        ? Math.max(1, Math.round(finite(security.referenceValue) * 100))
        : null
    )
  );
}

function previousCloseTicks(security, marketView, lastTicks) {
  return (
    positiveInteger(marketView.previousCloseTicks) ??
    positiveInteger(security.previousCloseTicks) ??
    lastTicks
  );
}

function barStart(bar) {
  return (
    nonNegativeInteger(bar.startMs) ??
    nonNegativeInteger(bar.frameStartMs)
  );
}

function barEnd(bar) {
  return (
    nonNegativeInteger(bar.endMs) ??
    nonNegativeInteger(bar.frameEndMs)
  );
}

function barVolume(bar) {
  return (
    nonNegativeInteger(bar.volume) ??
    nonNegativeInteger(bar.volumeShares)
  );
}

function currentDayBars(marketView, nowMs) {
  const candidates = array(marketView.intradayBars).length
    ? array(marketView.intradayBars)
    : array(marketView.minuteBars);
  if (!candidates.length) return null;
  const dayStart = Math.floor(nowMs / WORLD_DAY_MS) * WORLD_DAY_MS;
  const current = candidates.filter((bar) => {
    const start = barStart(object(bar));
    const end = barEnd(object(bar));
    return (
      start !== null &&
      end !== null &&
      start >= dayStart &&
      start <= nowMs &&
      end > dayStart
    );
  });
  return current.length ? current : null;
}

function archivedDailyBars(marketView, marketSnapshot, symbol, dayStart) {
  const direct = array(marketView.dailyBars);
  const archive = object(
    object(object(marketSnapshot.barArchives).bySymbol)[symbol],
  );
  const candidates = direct.length ? direct : array(archive.dailyBars);
  return candidates.filter((bar) => {
    const end = barEnd(object(bar));
    const volume = barVolume(object(bar));
    return end !== null && end <= dayStart && volume !== null;
  });
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function publicShareCount(security, marketView) {
  const shareholders = object(marketView.shareholders);
  const outstandingUnits =
    positiveInteger(security.outstandingUnits) ??
    positiveInteger(shareholders.outstandingUnits);
  const floatUnits =
    positiveInteger(security.floatUnits) ??
    positiveInteger(security.circulatingUnits) ??
    positiveInteger(security.freeFloatUnits) ??
    positiveInteger(shareholders.accountedUnits) ??
    outstandingUnits;
  return { outstandingUnits, floatUnits };
}

function quoteProjection(
  security,
  marketView,
  marketSnapshot,
  symbol,
  currentTick,
) {
  const nowMs = Math.max(0, nonNegativeInteger(marketSnapshot.nowMs, 0));
  const dayStart = Math.floor(nowMs / WORLD_DAY_MS) * WORLD_DAY_MS;
  const bars = currentDayBars(marketView, nowMs);
  const currentVolumes = bars?.map((bar) => barVolume(object(bar)));
  const completeCurrentVolumes =
    currentVolumes && currentVolumes.every((value) => value !== null)
      ? currentVolumes
      : null;
  const sessionVolumeShares = completeCurrentVolumes
    ? completeCurrentVolumes.reduce((sum, value) => sum + value, 0)
    : null;
  const sessionTurnoverCents = bars
    ? bars.reduce((sum, rawBar) => {
        const bar = object(rawBar);
        const turnover =
          nonNegativeInteger(bar.turnoverCents) ??
          nonNegativeInteger(bar.turnoverTicks);
        return turnover === null || sum === null ? null : sum + turnover;
      }, 0)
    : null;
  const dailyBars = archivedDailyBars(
    marketView,
    marketSnapshot,
    symbol,
    dayStart,
  );
  const dailyVolumes = dailyBars
    .slice(-20)
    .map((bar) => barVolume(object(bar)))
    .filter((value) => value !== null);
  const averageDailyVolumeShares =
    dailyVolumes.length === dailyBars.slice(-20).length
      ? rounded(average(dailyVolumes), 2)
      : null;
  const elapsedFraction = (nowMs - dayStart) / WORLD_DAY_MS;
  const comparableVolume =
    averageDailyVolumeShares !== null && elapsedFraction > 0
      ? averageDailyVolumeShares * elapsedFraction
      : null;
  const volumeRatio =
    sessionVolumeShares !== null &&
    comparableVolume !== null &&
    comparableVolume > 0
      ? rounded(sessionVolumeShares / comparableVolume, 2)
      : null;
  const lastPriceTicks = priceTicks(security, marketView);
  const previousTicks = previousCloseTicks(
    security,
    marketView,
    lastPriceTicks,
  );
  const changeTicks =
    integer(marketView.changeTicks) ??
    (
      lastPriceTicks !== null && previousTicks !== null
        ? lastPriceTicks - previousTicks
        : null
    );
  const changeBps =
    integer(marketView.changeBps) ??
    (
      changeTicks !== null && previousTicks
        ? Math.round(changeTicks * BPS_SCALE / previousTicks)
        : null
    );
  const shares = publicShareCount(security, marketView);
  const totalMarketCapCents =
    lastPriceTicks === null
      ? null
      : safeProduct(lastPriceTicks, shares.outstandingUnits);
  const floatMarketCapCents =
    lastPriceTicks === null
      ? null
      : safeProduct(lastPriceTicks, shares.floatUnits);
  const turnoverBps =
    sessionVolumeShares !== null && shares.floatUnits
      ? Math.round(sessionVolumeShares * BPS_SCALE / shares.floatUnits)
      : null;
  return {
    lastPriceTicks,
    previousCloseTicks: previousTicks,
    changeTicks,
    changeBps,
    direction:
      changeTicks > 0 ? 'up' : changeTicks < 0 ? 'down' : 'flat',
    sessionVolumeShares,
    sessionTurnoverCents,
    averageDailyVolumeShares,
    comparableHistoricalVolumeShares:
      comparableVolume === null ? null : rounded(comparableVolume, 2),
    volumeRatio,
    outstandingUnits: shares.outstandingUnits,
    floatUnits: shares.floatUnits,
    totalMarketCapCents,
    floatMarketCapCents,
    turnoverBps,
    observedAt: observedAt({
      worldTick: currentTick,
      virtualMs: nowMs,
      calendar: marketSnapshot.calendar,
    }),
    source: sourceDescriptor(
      'exchange_quote',
      SOURCE_LABELS.exchange_quote,
      'authoritative',
    ),
    availability: {
      price: lastPriceTicks === null ? 'unavailable' : 'available',
      volume: sessionVolumeShares === null ? 'unavailable' : 'available',
      volumeRatio: volumeRatio === null ? 'unavailable' : 'available',
      marketCapitalization:
        totalMarketCapCents === null ? 'unavailable' : 'available',
      floatMarketCapitalization:
        floatMarketCapCents === null ? 'unavailable' : 'available',
      turnover: turnoverBps === null ? 'unavailable' : 'available',
      valuationRange: 'unavailable',
    },
    basis: {
      volumeRatio: '同时段近 20 日均量',
      marketCapitalization: '最近成交价 × 股本',
      floatMarketCapitalization: '最近成交价 × 流通股本',
      turnover: '当日成交量 ÷ 流通股本',
    },
  };
}

function publishedFinancial(company) {
  const snapshot = object(company.publishedFinancialSnapshot);
  const value = object(snapshot.value);
  return {
    asOfTick: nonNegativeInteger(snapshot.asOfTick, 0),
    publishedAtMs: integer(snapshot.publishedAtMs),
    sourceFactId: string(snapshot.sourceFactId),
    value,
  };
}

function ratio(lastTicks, perShare) {
  const price = lastTicks === null ? null : lastTicks / 100;
  const denominator = finite(perShare);
  return price !== null && denominator !== null && denominator > 0
    ? rounded(price / denominator, 2)
    : null;
}

function valuationProjection(company, marketView, quote, currentTick) {
  const published = publishedFinancial(company);
  const valuation = object(marketView.valuation);
  const metrics = object(valuation.metrics);
  const ratios = object(valuation.marketRatios);
  const shares =
    positiveInteger(valuation.sharesOutstanding) ??
    positiveInteger(published.value.sharesOutstanding) ??
    quote.outstandingUnits;
  const earningsPerShare =
    finite(metrics.earningsPerShare) ??
    (
      shares && finite(published.value.trailingNetIncome) !== null
        ? published.value.trailingNetIncome / shares
        : null
    );
  const bookValuePerShare =
    finite(metrics.bookValuePerShare) ??
    (
      shares && finite(published.value.bookEquity) !== null
        ? published.value.bookEquity / shares
        : null
    );
  const freeCashFlowPerShare =
    finite(metrics.freeCashFlowPerShare) ??
    (
      shares && finite(published.value.trailingFreeCashFlow) !== null
        ? published.value.trailingFreeCashFlow / shares
        : null
    );
  const financialValues = {
    trailingRevenue:
      finite(metrics.trailingRevenue) ??
      finite(published.value.trailingRevenue),
    trailingNetIncome:
      finite(metrics.trailingNetIncome) ??
      finite(published.value.trailingNetIncome),
    trailingFreeCashFlow:
      finite(metrics.trailingFreeCashFlow) ??
      finite(published.value.trailingFreeCashFlow),
    bookEquity:
      finite(metrics.bookEquity) ?? finite(published.value.bookEquity),
    cash: finite(metrics.cash) ?? finite(published.value.cash),
    debt: finite(metrics.debt) ?? finite(published.value.debt),
    netDebt: finite(metrics.netDebt) ?? finite(published.value.netDebt),
    earningsPerShare: rounded(earningsPerShare, 6),
    bookValuePerShare: rounded(bookValuePerShare, 6),
    freeCashFlowPerShare: rounded(freeCashFlowPerShare, 6),
    revenueGrowthBps: integer(metrics.revenueGrowthBps),
    earningsGrowthBps: integer(metrics.earningsGrowthBps),
    expectedGrowthBps:
      integer(metrics.expectedGrowthBps) ??
      integer(published.value.expectedGrowthBps),
    capacity:
      finite(metrics.capacity) ?? finite(published.value.capacity),
    marketShare:
      finite(metrics.marketShare) ?? finite(published.value.marketShare),
    ...Object.fromEntries(
      [
        'loans',
        'deposits',
        'netInterestMarginBps',
        'nonPerformingLoanBps',
        'creditCostBps',
        'capitalAdequacyBps',
        'liquidityCoverageBps',
        'premiumIncome',
        'insuranceReserves',
        'investedAssets',
        'claimsRatioBps',
        'investmentYieldBps',
        'solvencyRatioBps',
      ].map((key) => [
        key,
        finite(
          object(published.value.financialInstitution)[key],
        ),
      ]),
    ),
  };
  const asOfTick =
    nonNegativeInteger(valuation.asOfTick) ?? published.asOfTick;
  const valuationRange =
    positiveInteger(valuation.lowTicks) &&
    positiveInteger(valuation.highTicks)
      ? {
          low: positiveInteger(valuation.lowTicks),
          midpoint: positiveInteger(valuation.midpointTicks),
          high: positiveInteger(valuation.highTicks),
        }
      : null;
  const result = {
    priceEarnings:
      finite(ratios.priceEarnings) ??
      ratio(quote.lastPriceTicks, earningsPerShare),
    priceBook:
      finite(ratios.priceBook) ??
      ratio(quote.lastPriceTicks, bookValuePerShare),
    priceFreeCashFlow:
      finite(ratios.priceFreeCashFlow) ??
      ratio(quote.lastPriceTicks, freeCashFlowPerShare),
    earningsPerShare: financialValues.earningsPerShare,
    bookValuePerShare: financialValues.bookValuePerShare,
    freeCashFlowPerShare: financialValues.freeCashFlowPerShare,
    rangeTicks: valuationRange,
    uncertaintyBps: nonNegativeInteger(valuation.uncertaintyBps),
    confidenceBps: nonNegativeInteger(valuation.confidenceBps),
    observedAt: observedAt({
      worldTick: asOfTick,
      virtualMs:
        integer(valuation.publishedAtMs) ?? published.publishedAtMs,
    }),
    freshness: freshness(currentTick, asOfTick),
    source: sourceDescriptor(
      'published_financial',
      SOURCE_LABELS.published_financial,
      'authoritative',
    ),
    sourceRecordId:
      string(valuation.sourceFinancialFactId) ||
      published.sourceFactId ||
      null,
    financialValues,
  };
  quote.availability.valuationRange = valuationRange
    ? 'available'
    : 'unavailable';
  return result;
}

function industryForCompany(company) {
  const role = string(company.role, '未分类产业');
  const declaredIndustry = string(company.industry);
  const normalized = normalizeSearchText(role);
  const archetype = INDUSTRY_ARCHETYPES.find((candidate) =>
    candidate.roles.some((item) =>
      normalized.includes(normalizeSearchText(item)),
    ),
  );
  if (declaredIndustry) {
    const base = archetype ?? {
      chainPosition: '合成产业',
      demandFacets: Object.freeze([
        '终端需求',
        '更新需求',
        '客户结构',
      ]),
      supplyFacets: Object.freeze([
        '交付能力',
        '产能边界',
        '库存变化',
      ]),
      operatingFacets: Object.freeze([
        '收入',
        '现金流',
        '资产负债',
      ]),
      upstream: Object.freeze([]),
      downstream: Object.freeze([]),
    };
    return Object.freeze({
      ...base,
      id:
        archetype?.id ??
        `industry_${hash32(declaredIndustry)
          .toString(16)
          .padStart(8, '0')}`,
      roles: Object.freeze([role]),
      label: declaredIndustry,
      summary: `${declaredIndustry}公司的公开经营、行情与产业链记录。`,
    });
  }
  if (archetype) return archetype;
  return Object.freeze({
    id: `industry_${hash32(role).toString(16).padStart(8, '0')}`,
    roles: Object.freeze([role]),
    label: role,
    chainPosition: '合成产业',
    summary: `${role} 的公开公司、行情和经营记录。`,
    demandFacets: Object.freeze(['终端需求', '更新需求', '客户结构']),
    supplyFacets: Object.freeze(['交付能力', '产能边界', '库存变化']),
    operatingFacets: Object.freeze(['收入', '现金流', '资产负债']),
    upstream: Object.freeze([]),
    downstream: Object.freeze([]),
  });
}

function companyConnections(company, companiesById) {
  const project = (relatedId) => {
    const related = companiesById.get(relatedId);
    if (!related) return null;
    return {
      id: related.id,
      symbol: string(related.symbol),
      name: string(
        related.shortName,
        related.name,
      ),
      industry: string(
        related.industry,
        related.role,
      ),
      lifecycle: string(related.lifecycle),
    };
  };
  return {
    suppliers: uniqueStrings(
      array(company.supplierCompanyIds),
    )
      .map(project)
      .filter(Boolean),
    customers: uniqueStrings(
      array(company.customerCompanyIds),
    )
      .map(project)
      .filter(Boolean),
    financialCounterparties: uniqueStrings(
      array(company.financialCounterpartyCompanyIds),
    )
      .map(project)
      .filter(Boolean),
    investmentExposures: uniqueStrings(
      array(company.investmentExposureCompanyIds),
    )
      .map(project)
      .filter(Boolean),
  };
}

function managementProjection(company) {
  const management = object(company.management);
  const people = [
    ['chiefExecutive', '负责人'],
    ['financeLead', '财务负责人'],
    ['investorRelations', '投资者关系'],
  ]
    .map(([key, role]) => {
      const person = object(management[key]);
      const name = string(person.name);
      return name
        ? {
            role,
            name,
            incentive: string(
              person.incentive,
              '履行岗位职责',
            ),
          }
        : null;
    })
    .filter(Boolean);
  return {
    operatingStyle: string(
      management.operatingStyle,
      '稳健经营',
    ),
    confidenceBps:
      nonNegativeInteger(
        management.confidenceBps,
      ) ?? null,
    people,
  };
}

function factCategory(type) {
  const value = string(type).toLowerCase();
  if (value === 'company_financial_report') return '定期财务';
  if (value.includes('operating')) return '经营变化';
  if (value.includes('inventory')) return '库存与供给';
  if (value.includes('order') || value.includes('demand')) {
    return '订单与需求';
  }
  if (value.includes('receivable') || value.includes('cash')) {
    return '资金与回款';
  }
  if (
    value.includes('share') ||
    value.includes('capital') ||
    value.includes('buyback')
  ) {
    return '股本与资本安排';
  }
  if (value.includes('debt') || value.includes('default')) {
    return '债务变化';
  }
  return '公开记录';
}

function publicFacts(world, currentTick) {
  return array(world.facts)
    .filter((fact) => {
      const item = object(fact);
      return (
        item.authority === 'world_fact' &&
        item.visibility === 'public' &&
        item.type !== 'realtime_market_fill' &&
        finite(item.confidence, 0) > 0 &&
        nonNegativeInteger(item.tick) !== null &&
        item.tick <= currentTick &&
        string(item.id) &&
        string(item.entityId)
      );
    })
    .sort(
      (left, right) =>
        left.tick - right.tick ||
        string(left.id).localeCompare(string(right.id), 'zh-CN'),
    );
}

function factRecord(fact, company, industryId, currentTick) {
  const category = factCategory(fact.type);
  const asOf = observedAt({
    worldTick: fact.tick,
    virtualMs: integer(fact.publishedAtMs),
  });
  return {
    id: `fact:${fact.id}`,
    sourceId: fact.id,
    recordType: 'disclosure',
    knowledgeKind: 'fact',
    companyId: company.id,
    industryId,
    title: `${company.shortName ?? company.name} · ${category}`,
    summary: string(fact.summary, '公开记录已更新。'),
    category,
    observedAt: asOf,
    freshness: freshness(currentTick, asOf.worldTick),
    source: sourceDescriptor(
      fact.type === 'company_financial_report'
        ? 'published_financial'
        : 'world_fact',
      fact.type === 'company_financial_report'
        ? SOURCE_LABELS.published_financial
        : SOURCE_LABELS.world_fact,
      'authoritative',
    ),
    access: publicAccess(),
    route: { page: 'company', companyId: company.id, section: 'disclosures' },
    keywords: uniqueStrings([
      company.name,
      company.shortName,
      company.symbol,
      category,
      fact.type,
    ]),
  };
}

function clueSource(clue, rumor) {
  const type = string(clue.sourceType).toLowerCase();
  if (rumor) return 'rumor';
  if (type.includes('company_disclosure')) return 'company_disclosure';
  if (type.includes('operational')) return 'operational_sample';
  if (type.includes('interview') || type.includes('periodic_source')) {
    return 'industry_interview';
  }
  return 'world_fact';
}

function clueRecord(
  clue,
  company,
  industryId,
  currentTick,
  publicFactIds,
) {
  const title = string(clue.title, '未命名线索');
  const sourceType = string(clue.sourceType).toLowerCase();
  const rumor =
    sourceType === 'rumor' ||
    /传闻|传言|匿名/.test(`${title}${string(clue.source)}`);
  const status =
    clue.status === 'verified' ? 'verified' : 'unverified';
  const quality = ['high', 'medium', 'low'].includes(clue.quality)
    ? clue.quality
    : 'unknown';
  const asOf = observedAt({
    worldTick: nonNegativeInteger(clue.publishedTick, 0),
  });
  const linkedFactId =
    string(clue.factId) && publicFactIds.has(clue.factId)
      ? `fact:${clue.factId}`
      : null;
  return {
    id: string(clue.id, `clue_${hash32(title).toString(16)}`),
    sourceId: string(clue.id) || null,
    recordType: 'clue',
    knowledgeKind: rumor ? 'rumor' : 'clue',
    companyId: company.id,
    industryId,
    title,
    summary: string(clue.summary, '这条线索尚无更多公开内容。'),
    missing: string(clue.missing) || null,
    status,
    statusLabel: status === 'verified' ? '已核对' : '尚未核对',
    verdict:
      status === 'verified' && ['supported', 'refuted'].includes(clue.verdict)
        ? clue.verdict
        : null,
    linkedFactId,
    observedAt: asOf,
    freshness: freshness(currentTick, asOf.worldTick),
    quality,
    source: sourceDescriptor(
      clueSource(clue, rumor),
      string(clue.source),
      quality,
    ),
    access: publicAccess(),
    route: { page: 'company', companyId: company.id, section: 'clues' },
    keywords: uniqueStrings([
      company.name,
      company.shortName,
      company.symbol,
      clue.source,
      clue.sourceType,
      rumor ? '传闻' : '线索',
      clue.missing,
    ]),
  };
}

function interpretationRecords(
  world,
  factsById,
  companiesById,
  industryByCompany,
  currentTick,
) {
  return array(world.narratives)
    .filter((narrative) => {
      const item = object(narrative);
      return (
        item.authority === 'interpretation' &&
        (item.visibility === undefined || item.visibility === 'public') &&
        factsById.has(item.factId) &&
        nonNegativeInteger(item.tick, 0) <= currentTick
      );
    })
    .map((narrative) => {
      const fact = factsById.get(narrative.factId);
      const company = companiesById.get(fact.entityId);
      if (!company) return null;
      const text = string(narrative.text, '市场存在不同解释。');
      const asOf = observedAt({ worldTick: narrative.tick });
      return {
        id: `interpretation:${string(
          narrative.id,
          hash32(text).toString(16),
        )}`,
        sourceId: string(narrative.id) || null,
        recordType: 'interpretation',
        knowledgeKind: 'interpretation',
        companyId: company.id,
        industryId: industryByCompany.get(company.id),
        title: text,
        summary: text,
        perspective: string(narrative.perspective),
        observedAt: asOf,
        freshness: freshness(currentTick, asOf.worldTick),
        source: sourceDescriptor(
          'interpretation',
          SOURCE_LABELS.interpretation,
          'medium',
        ),
        access: publicAccess(),
        linkedFactId: `fact:${fact.id}`,
        route: {
          page: 'company',
          companyId: company.id,
          section: 'clues',
        },
        keywords: uniqueStrings([
          company.name,
          company.shortName,
          company.symbol,
          text,
          '市场解读',
        ]),
      };
    })
    .filter(Boolean);
}

function shareholderProjection(marketView, company, industryId, currentTick) {
  const projection = object(marketView.shareholders);
  const observed = observedAt({ worldTick: currentTick });
  return array(projection.top)
    .filter(
      (holder) =>
        string(holder?.name) &&
        nonNegativeInteger(holder?.quantity) !== null,
    )
    .map((holder, index) => ({
      id: `holder:${company.symbol}:${hash32(
        `${holder.name}:${holder.kind}:${index}`,
      ).toString(16)}`,
      recordType: 'shareholder',
      knowledgeKind: 'shareholder',
      companyId: company.id,
      industryId,
      rank: positiveInteger(holder.rank, index + 1),
      name: holder.name,
      kind: string(holder.kind, 'holder'),
      quantity: nonNegativeInteger(holder.quantity, 0),
      ownershipBps: nonNegativeInteger(holder.ownershipBps),
      isPlayer: Boolean(holder.isPlayer),
      title: `${company.shortName ?? company.name} · ${holder.name}`,
      summary:
        nonNegativeInteger(holder.ownershipBps) !== null
          ? `持有 ${holder.quantity} 股，占 ${rounded(
              holder.ownershipBps / 100,
              2,
            )}%`
          : `持有 ${holder.quantity} 股`,
      observedAt: observed,
      freshness: freshness(currentTick, currentTick),
      source: sourceDescriptor(
        'holder_register',
        SOURCE_LABELS.holder_register,
        'authoritative',
      ),
      access: publicAccess(),
      route: {
        page: 'company',
        companyId: company.id,
        section: 'shareholders',
      },
      keywords: uniqueStrings([
        company.name,
        company.shortName,
        company.symbol,
        holder.name,
        holder.kind,
        '股东',
        '持有人',
      ]),
    }))
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.name.localeCompare(right.name, 'zh-CN'),
    );
}

function supplyDemandProjection(
  company,
  industry,
  factRecords,
  clueRecords,
  currentTick,
) {
  const businessKind = object(company.businessModel).kind;
  if (
    businessKind === 'commercial_bank' ||
    businessKind === 'insurance_group'
  ) {
    const matchingType =
      businessKind === 'commercial_bank'
        ? 'bank_financial_result'
        : 'insurance_financial_result';
    const latest = factRecords
      .filter(
        (record) => record.rawFact?.type === matchingType,
      )
      .at(-1);
    const value = object(latest?.rawFact?.value);
    const definitions =
      businessKind === 'commercial_bank'
        ? [
            ['netInterestIncome', '本期净利息收入'],
            ['creditLoss', '本期信用减值'],
            ['netInterestMarginBps', '净息差'],
            ['capitalAdequacyBps', '资本充足率'],
            ['liquidityCoverageBps', '流动性覆盖率'],
          ]
        : [
            ['premiumEarned', '本期已赚保费'],
            ['claims', '本期赔付'],
            ['investmentIncome', '本期投资收益'],
            ['claimsRatioBps', '赔付率'],
            ['solvencyRatioBps', '偿付能力充足率'],
          ];
    return {
      status: latest ? 'reported' : 'reference_only',
      observedAt:
        latest?.observedAt ?? observedAt({ worldTick: currentTick }),
      source:
        latest?.source ??
        sourceDescriptor(
          'industry_reference',
          SOURCE_LABELS.industry_reference,
          'reference',
        ),
      reported: Object.fromEntries(
        definitions
          .map(([key, label]) => {
            const metricValue = finite(value[key]);
            return metricValue === null
              ? null
              : [key, { label, value: metricValue }];
          })
          .filter(Boolean),
      ),
      demandFacets:
        businessKind === 'commercial_bank'
          ? ['贷款需求', '存款稳定性', '手续费业务']
          : ['新单保费', '续期质量', '保障需求'],
      supplyFacets:
        businessKind === 'commercial_bank'
          ? ['资本充足', '流动性覆盖', '信用成本']
          : ['准备金', '偿付能力', '再保险容量'],
      operatingFacets:
        businessKind === 'commercial_bank'
          ? ['净息差', '不良贷款率', '拨备与资本']
          : ['赔付率', '投资收益率', '久期匹配'],
      factRecordIds: latest ? [latest.id] : [],
      clueRecordIds: clueRecords.map((record) => record.id),
      companyId: company.id,
    };
  }
  const operatingFacts = factRecords.filter((record) =>
    [
      '经营变化',
      '库存与供给',
      '订单与需求',
      '资金与回款',
    ].includes(record.category),
  );
  const latestFact = operatingFacts.at(-1);
  const latestValue = object(latestFact?.rawFact?.value);
  const reported = Object.fromEntries(
    [
      ['produced', '本期产量'],
      ['sold', '本期销量'],
      ['inventory', '期末库存'],
      ['revenue', '本期收入'],
      ['netIncome', '本期净利润'],
      ['freeCashFlow', '本期自由现金流'],
      ['receivables', '应收账款'],
      ['payables', '应付账款'],
    ]
      .map(([key, label]) => {
        const value = finite(latestValue[key]);
        return value === null ? null : [key, { label, value }];
      })
      .filter(Boolean),
  );
  return {
    status: latestFact ? 'reported' : 'reference_only',
    observedAt:
      latestFact?.observedAt ?? observedAt({ worldTick: currentTick }),
    source:
      latestFact?.source ??
      sourceDescriptor(
        'industry_reference',
        SOURCE_LABELS.industry_reference,
        'reference',
      ),
    reported,
    demandFacets: [...industry.demandFacets],
    supplyFacets: [...industry.supplyFacets],
    operatingFacets: [...industry.operatingFacets],
    factRecordIds: operatingFacts.map((record) => record.id),
    clueRecordIds: clueRecords.map((record) => record.id),
    companyId: company.id,
  };
}

function searchRecord(record) {
  const keywords = uniqueStrings(record.keywords ?? []);
  const searchText = normalizeSearchText(
    [
      record.title,
      record.summary,
      record.category,
      record.companyId,
      record.industryId,
      record.source?.label,
      record.source?.category,
      ...keywords,
    ].join(' '),
  );
  return { ...record, keywords, searchText };
}

function metricRecord({
  company,
  industryId,
  id,
  label,
  value,
  unit,
  summary,
  knowledgeKind,
  observed,
  source,
  section,
  freshnessValue,
}) {
  return searchRecord({
    id: `${knowledgeKind}:${company.symbol}:${id}`,
    recordType: 'metric',
    knowledgeKind,
    companyId: company.id,
    industryId,
    title: `${company.shortName ?? company.name} · ${label}`,
    summary,
    metric: { id, label, value, unit },
    observedAt: observed,
    freshness: freshnessValue,
    source,
    access: publicAccess(),
    route: { page: 'company', companyId: company.id, section },
    keywords: [company.name, company.shortName, company.symbol, label],
  });
}

function quoteRecords(company, industryId, quote, valuation, currentTick) {
  const fresh = freshness(currentTick, quote.observedAt.worldTick);
  const marketMetrics = [
    ['last_price', '最近成交价', quote.lastPriceTicks, 'ticks'],
    ['change', '涨跌幅', quote.changeBps, 'bps'],
    ['session_volume', '当日成交量', quote.sessionVolumeShares, 'shares'],
    ['volume_ratio', '量比', quote.volumeRatio, 'ratio'],
    ['total_market_cap', '总市值', quote.totalMarketCapCents, 'cents'],
    ['float_market_cap', '流通市值', quote.floatMarketCapCents, 'cents'],
    ['turnover', '换手率', quote.turnoverBps, 'bps'],
  ];
  const valuationMetrics = [
    ['pe', '市盈率', valuation.priceEarnings, 'multiple'],
    ['pb', '市净率', valuation.priceBook, 'multiple'],
    ['eps', '每股收益', valuation.earningsPerShare, 'per_share'],
    [
      'valuation_range',
      '估值区间',
      valuation.rangeTicks,
      'tick_range',
    ],
  ];
  return [
    ...marketMetrics.map(([id, label, value, unit]) =>
      metricRecord({
        company,
        industryId,
        id,
        label,
        value,
        unit,
        summary:
          value === null
            ? `${label}当前没有完整成交口径。`
            : `${label}由当前公开行情投影。`,
        knowledgeKind: 'market',
        observed: quote.observedAt,
        source: quote.source,
        section: 'quote',
        freshnessValue: fresh,
      }),
    ),
    ...valuationMetrics.map(([id, label, value, unit]) =>
      metricRecord({
        company,
        industryId,
        id,
        label,
        value,
        unit,
        summary:
          value === null
            ? `${label}当前没有完整公开依据。`
            : `${label}按已披露财务和最近成交价计算。`,
        knowledgeKind: 'financial',
        observed: valuation.observedAt,
        source: valuation.source,
        section: 'financials',
        freshnessValue: valuation.freshness,
      }),
    ),
  ];
}

function financialRecords(
  company,
  industryId,
  valuation,
  currentTick,
) {
  return financialMetricsForCompany(company).map((definition) => {
    const value = valuation.financialValues[definition.key];
    return metricRecord({
      company,
      industryId,
      id: definition.key,
      label: definition.label,
      value,
      unit: definition.unit,
      summary:
        value === null
          ? `${definition.label}尚无公开口径。`
          : `${definition.label}来自最近一期公开财务报告。`,
      knowledgeKind: 'financial',
      observed: valuation.observedAt,
      source: valuation.source,
      section: 'financials',
      freshnessValue: freshness(
        currentTick,
        valuation.observedAt.worldTick,
      ),
    });
  });
}

function industryReferenceRecords(industry, currentTick) {
  const route = { page: 'industry', industryId: industry.id };
  const common = {
    recordType: 'industry_reference',
    knowledgeKind: 'reference',
    companyId: null,
    industryId: industry.id,
    observedAt: observedAt({ worldTick: 0 }),
    freshness: freshness(currentTick, 0),
    source: sourceDescriptor(
      'industry_reference',
      SOURCE_LABELS.industry_reference,
      'reference',
    ),
    access: publicAccess(),
    route,
  };
  const records = [
    {
      id: `reference:${industry.id}:position`,
      title: `${industry.label} · ${industry.chainPosition}`,
      summary: industry.summary,
      keywords: [industry.label, industry.chainPosition],
    },
    ...industry.demandFacets.map((label, index) => ({
      id: `reference:${industry.id}:demand:${index}`,
      title: `${industry.label} · 需求侧`,
      summary: label,
      keywords: [industry.label, '需求', label],
    })),
    ...industry.supplyFacets.map((label, index) => ({
      id: `reference:${industry.id}:supply:${index}`,
      title: `${industry.label} · 供给侧`,
      summary: label,
      keywords: [industry.label, '供给', label],
    })),
    ...industry.operatingFacets.map((label, index) => ({
      id: `reference:${industry.id}:operation:${index}`,
      title: `${industry.label} · 经营口径`,
      summary: label,
      keywords: [industry.label, '经营', label],
    })),
  ];
  return records.map((record) => searchRecord({ ...common, ...record }));
}

function aggregateIndustry(
  industry,
  companies,
  factRecords,
  clueRecords,
  currentTick,
) {
  const companyIds = new Set(companies.map((company) => company.id));
  const quotes = companies.map((company) => company.quote);
  const priced = quotes.filter(
    (quote) => quote.totalMarketCapCents !== null,
  );
  const previousCapital = quotes.reduce((sum, quote) => {
    if (!quote.previousCloseTicks || !quote.outstandingUnits) return sum;
    const capital = safeProduct(
      quote.previousCloseTicks,
      quote.outstandingUnits,
    );
    return capital === null ? sum : sum + capital;
  }, 0);
  const currentCapital = priced.reduce(
    (sum, quote) => sum + quote.totalMarketCapCents,
    0,
  );
  const changeBps =
    currentCapital > 0 && previousCapital > 0
      ? Math.round(
          (currentCapital - previousCapital) *
            BPS_SCALE /
            previousCapital,
        )
      : null;
  return {
    id: industry.id,
    label: industry.label,
    chainPosition: industry.chainPosition,
    summary: industry.summary,
    demandFacets: [...industry.demandFacets],
    supplyFacets: [...industry.supplyFacets],
    operatingFacets: [...industry.operatingFacets],
    upstream: [...industry.upstream],
    downstream: [...industry.downstream],
    companyIds: companies.map((company) => company.id),
    symbolCount: companies.length,
    advanceCount: quotes.filter((quote) => quote.changeBps > 0).length,
    declineCount: quotes.filter((quote) => quote.changeBps < 0).length,
    flatCount: quotes.filter((quote) => quote.changeBps === 0).length,
    totalMarketCapCents: priced.length ? currentCapital : null,
    changeBps,
    publicFactCount: factRecords.filter((record) =>
      companyIds.has(record.companyId),
    ).length,
    clueCount: clueRecords.filter((record) =>
      companyIds.has(record.companyId),
    ).length,
    observedAt: observedAt({ worldTick: currentTick }),
  };
}

function overviewProjection(companies, currentTick, marketSnapshot) {
  const quotes = companies.map((company) => company.quote);
  const priced = quotes.filter(
    (quote) => quote.totalMarketCapCents !== null,
  );
  const floated = quotes.filter(
    (quote) => quote.floatMarketCapCents !== null,
  );
  const volumes = quotes.filter(
    (quote) => quote.sessionVolumeShares !== null,
  );
  const previousCapital = quotes.reduce((sum, quote) => {
    const value = safeProduct(
      quote.previousCloseTicks,
      quote.outstandingUnits,
    );
    return value === null ? sum : sum + value;
  }, 0);
  const currentCapital = priced.reduce(
    (sum, quote) => sum + quote.totalMarketCapCents,
    0,
  );
  return {
    venue: '历择交易所',
    symbolCount: companies.length,
    advanceCount: quotes.filter((quote) => quote.changeBps > 0).length,
    declineCount: quotes.filter((quote) => quote.changeBps < 0).length,
    flatCount: quotes.filter((quote) => quote.changeBps === 0).length,
    totalMarketCapCents: priced.length ? currentCapital : null,
    floatMarketCapCents: floated.length
      ? floated.reduce(
          (sum, quote) => sum + quote.floatMarketCapCents,
          0,
        )
      : null,
    sessionVolumeShares: volumes.length
      ? volumes.reduce(
          (sum, quote) => sum + quote.sessionVolumeShares,
          0,
        )
      : null,
    capitalizationWeightedChangeBps:
      currentCapital > 0 && previousCapital > 0
        ? Math.round(
            (currentCapital - previousCapital) *
              BPS_SCALE /
              previousCapital,
          )
        : null,
    observedAt: observedAt({
      worldTick: currentTick,
      virtualMs: marketSnapshot.nowMs,
      calendar: marketSnapshot.calendar,
    }),
    source: sourceDescriptor(
      'exchange_quote',
      SOURCE_LABELS.exchange_quote,
      'authoritative',
    ),
  };
}

function companySearchRecord(company, currentTick) {
  return searchRecord({
    id: `company:${company.id}`,
    recordType: 'company',
    knowledgeKind: 'company',
    companyId: company.id,
    industryId: company.industryId,
    title: `${company.name} ${company.symbol}`,
    summary: company.description,
    observedAt: observedAt({ worldTick: currentTick }),
    freshness: freshness(currentTick, currentTick),
    source: sourceDescriptor(
      'company_disclosure',
      '上市公司公开档案',
      'authoritative',
    ),
    access: publicAccess(),
    route: { page: 'company', companyId: company.id },
    keywords: [
      company.name,
      company.shortName,
      company.symbol,
      company.role,
      company.industryLabel,
      company.description,
    ],
  });
}

function industrySearchRecord(industry, currentTick) {
  return searchRecord({
    id: `industry:${industry.id}`,
    recordType: 'industry',
    knowledgeKind: 'industry',
    companyId: null,
    industryId: industry.id,
    title: `${industry.label} · ${industry.chainPosition}`,
    summary: industry.summary,
    observedAt: observedAt({ worldTick: currentTick }),
    freshness: freshness(currentTick, currentTick),
    source: sourceDescriptor(
      'industry_reference',
      SOURCE_LABELS.industry_reference,
      'reference',
    ),
    access: publicAccess(),
    route: { page: 'industry', industryId: industry.id },
    keywords: [
      industry.label,
      industry.chainPosition,
      ...industry.demandFacets,
      ...industry.supplyFacets,
      ...industry.operatingFacets,
    ],
  });
}

/**
 * Builds a stable player-facing network from a read-only world and market
 * snapshot. Only public facts and already-public market projections are read.
 */
export function projectMarketIntelligence(
  world,
  marketSnapshot = null,
  options = {},
) {
  if (
    !world?.world?.id ||
    !world?.market?.securities ||
    !world?.entities?.companies
  ) {
    throw new TypeError(
      'A world with identity, listed securities and companies is required.',
    );
  }
  const market = object(marketSnapshot);
  const currentTick = Math.max(
    0,
    nonNegativeInteger(market.worldTick) ??
      nonNegativeInteger(world.world.tick, 0),
  );
  const companiesById = new Map(
    Object.entries(world.entities.companies).map(([id, company]) => [
      id,
      company,
    ]),
  );
  const companyIndustryArchetypes = new Map();
  for (const [id, company] of companiesById) {
    companyIndustryArchetypes.set(id, industryForCompany(company));
  }
  const industryArchetypes = [
    ...new Map(
      [...companyIndustryArchetypes.values()].map((industry) => [
        industry.id,
        industry,
      ]),
    ).values(),
  ].sort((left, right) =>
    left.id.localeCompare(right.id, 'zh-CN'),
  );
  const industryByCompany = new Map(
    [...companyIndustryArchetypes].map(([companyId, industry]) => [
      companyId,
      industry.id,
    ]),
  );
  const authoritativeFacts = publicFacts(world, currentTick);
  const factsById = new Map(
    authoritativeFacts.map((fact) => [fact.id, fact]),
  );
  const publicFactIds = new Set(factsById.keys());
  const allFactRecords = authoritativeFacts
    .map((fact) => {
      const company = companiesById.get(fact.entityId);
      return company
        ? {
            ...factRecord(
              fact,
              company,
              industryByCompany.get(company.id),
              currentTick,
            ),
            rawFact: fact,
          }
        : null;
    })
    .filter(Boolean);
  const allClueRecords = array(world.clues)
    .filter((clue) => {
      const item = object(clue);
      return (
        (item.visibility === undefined || item.visibility === 'public') &&
        nonNegativeInteger(item.publishedTick, 0) <= currentTick &&
        companiesById.has(item.companyId)
      );
    })
    .map((clue) => {
      const company = companiesById.get(clue.companyId);
      return clueRecord(
        clue,
        company,
        industryByCompany.get(company.id),
        currentTick,
        publicFactIds,
      );
    })
    .sort(
      (left, right) =>
        left.observedAt.worldTick - right.observedAt.worldTick ||
        left.id.localeCompare(right.id, 'zh-CN'),
    );
  const interpretations = interpretationRecords(
    world,
    factsById,
    companiesById,
    industryByCompany,
    currentTick,
  );

  const companies = Object.entries(world.market.securities)
    .sort(([left], [right]) => left.localeCompare(right, 'zh-CN'))
    .map(([symbol, security]) => {
      const company = companiesById.get(security.issuerId);
      if (!company) return null;
      const industry = companyIndustryArchetypes.get(company.id);
      const marketView = object(object(market.symbols)[symbol]);
      const quote = quoteProjection(
        security,
        marketView,
        market,
        symbol,
        currentTick,
      );
      const valuation = valuationProjection(
        company,
        marketView,
        quote,
        currentTick,
      );
      const facts = allFactRecords
        .filter((record) => record.companyId === company.id)
        .map(({ rawFact: _rawFact, ...record }) => record);
      const factsWithRaw = allFactRecords.filter(
        (record) => record.companyId === company.id,
      );
      const clues = allClueRecords.filter(
        (record) => record.companyId === company.id,
      );
      const companyInterpretations = interpretations.filter(
        (record) => record.companyId === company.id,
      );
      const shareholders = shareholderProjection(
        marketView,
        {
          id: company.id,
          name: company.name,
          shortName: company.shortName,
          symbol,
        },
        industry.id,
        currentTick,
      );
      const financials = financialMetricsForCompany(company).map((definition) => ({
        id: definition.key,
        label: definition.label,
        unit: definition.unit,
        value: valuation.financialValues[definition.key],
        observedAt: valuation.observedAt,
        source: valuation.source,
      }));
      return {
        id: company.id,
        symbol,
        name: string(company.name, security.name ?? symbol),
        shortName: string(company.shortName, company.name ?? symbol),
        role: string(company.role, '合成产业'),
        lifecycle: string(
          company.lifecycle,
          '稳定经营',
        ),
        management: managementProjection(company),
        description: string(
          company.description,
          `${string(company.name, symbol)} 的公开公司档案。`,
        ),
        board: string(security.board, 'synthetic'),
        industryId: industry.id,
        industryLabel: industry.label,
        quote,
        valuation,
        financials,
        shareholders,
        disclosures: facts,
        clues,
        interpretations: companyInterpretations,
        supplyDemand: supplyDemandProjection(
          company,
          industry,
          factsWithRaw,
          clues,
          currentTick,
        ),
        connections: {
          upstreamIndustryIds: [...industry.upstream],
          downstreamIndustryIds: [...industry.downstream],
          ...companyConnections(company, companiesById),
        },
      };
    })
    .filter(Boolean);

  const industries = industryArchetypes.map((industry) =>
    aggregateIndustry(
      industry,
      companies.filter(
        (company) => company.industryId === industry.id,
      ),
      allFactRecords,
      allClueRecords,
      currentTick,
    ),
  );

  const records = [];
  for (const company of companies) {
    records.push(companySearchRecord(company, currentTick));
    records.push(
      ...quoteRecords(
        company,
        company.industryId,
        company.quote,
        company.valuation,
        currentTick,
      ),
      ...financialRecords(
        company,
        company.industryId,
        company.valuation,
        currentTick,
      ),
      ...company.shareholders.map(searchRecord),
      ...company.disclosures.map(searchRecord),
      ...company.clues.map(searchRecord),
      ...company.interpretations.map(searchRecord),
    );
  }
  for (const industry of industries) {
    records.push(
      industrySearchRecord(industry, currentTick),
      ...industryReferenceRecords(industry, currentTick),
    );
  }
  records.sort((left, right) => left.id.localeCompare(right.id, 'zh-CN'));

  const asOf = {
    worldId: world.world.id,
    worldTick: currentTick,
    virtualMs: Math.max(0, nonNegativeInteger(market.nowMs, 0)),
    commitSeq: Math.max(0, nonNegativeInteger(market.commitSeq, 0)),
    calendar: {
      year:
        positiveInteger(market.calendar?.year) ??
        positiveInteger(world.world.calendar?.year, 1),
      day:
        positiveInteger(market.calendar?.day) ??
        positiveInteger(world.world.calendar?.day, 1),
    },
  };
  const maximumRecords = Math.max(
    1,
    Math.min(
      MAX_QUERY_LIMIT * 4,
      positiveInteger(options.maximumRecords, records.length),
    ),
  );
  return {
    schemaVersion: MARKET_INTELLIGENCE_SCHEMA,
    asOf,
    navigation: [
      { page: 'overview', label: '行情总览' },
      { page: 'industries', label: '行业脉络' },
      { page: 'companies', label: '公司档案' },
      { page: 'signals', label: '公告与线索' },
    ],
    overview: overviewProjection(companies, currentTick, market),
    industries,
    companies,
    signals: [...allFactRecords, ...allClueRecords, ...interpretations]
      .map(({ rawFact: _rawFact, ...record }) => record)
      .sort(
        (left, right) =>
          right.observedAt.worldTick - left.observedAt.worldTick ||
          left.id.localeCompare(right.id, 'zh-CN'),
      ),
    records: records.slice(0, maximumRecords),
  };
}

function recordMatchesFilter(record, filters) {
  if (
    filters.kinds.size &&
    !filters.kinds.has(record.knowledgeKind)
  ) {
    return false;
  }
  if (filters.companyId && record.companyId !== filters.companyId) {
    return false;
  }
  if (filters.industryId && record.industryId !== filters.industryId) {
    return false;
  }
  if (
    filters.sources.size &&
    !filters.sources.has(record.source?.category)
  ) {
    return false;
  }
  if (
    filters.freshness.size &&
    !filters.freshness.has(record.freshness?.state)
  ) {
    return false;
  }
  return true;
}

function recordScore(record, query, terms) {
  if (!query) return 0;
  const title = normalizeSearchText(record.title);
  const summary = normalizeSearchText(record.summary);
  let score = 0;
  if (title === query) score += 120;
  if (title.startsWith(query)) score += 70;
  if (title.includes(query)) score += 50;
  if (summary.includes(query)) score += 30;
  if (record.searchText.includes(query)) score += 20;
  for (const term of terms) {
    if (title.includes(term)) score += 12;
    if (summary.includes(term)) score += 7;
    if (record.searchText.includes(term)) score += 3;
  }
  return score;
}

/**
 * Searches the actual projected network. Filters never mutate or enrich the
 * network; they only select existing player-facing records.
 */
export function queryMarketIntelligence(network, options = {}) {
  if (
    network?.schemaVersion !== MARKET_INTELLIGENCE_SCHEMA ||
    !Array.isArray(network.records)
  ) {
    throw new TypeError('A market intelligence projection is required.');
  }
  const query = normalizeSearchText(options.query);
  const terms = query.split(' ').filter(Boolean);
  const filters = {
    kinds: new Set(array(options.kinds).map(String)),
    sources: new Set(array(options.sourceCategories).map(String)),
    freshness: new Set(array(options.freshness).map(String)),
    companyId: string(options.companyId) || null,
    industryId: string(options.industryId) || null,
  };
  const limit = Math.min(
    MAX_QUERY_LIMIT,
    positiveInteger(options.limit, DEFAULT_QUERY_LIMIT),
  );
  const matches = network.records
    .filter((record) => recordMatchesFilter(record, filters))
    .map((record) => ({
      record,
      score: recordScore(record, query, terms),
    }))
    .filter((entry) => !query || entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.record.observedAt.worldTick -
          left.record.observedAt.worldTick ||
        left.record.title.localeCompare(right.record.title, 'zh-CN') ||
        left.record.id.localeCompare(right.record.id, 'zh-CN'),
    );
  const groups = Object.fromEntries(
    [...new Set(matches.map((entry) => entry.record.knowledgeKind))]
      .sort((left, right) => left.localeCompare(right, 'zh-CN'))
      .map((kind) => [
        kind,
        matches.filter((entry) => entry.record.knowledgeKind === kind)
          .length,
      ]),
  );
  return {
    query,
    filters: {
      kinds: [...filters.kinds],
      sourceCategories: [...filters.sources],
      freshness: [...filters.freshness],
      companyId: filters.companyId,
      industryId: filters.industryId,
    },
    total: matches.length,
    groups,
    items: matches.slice(0, limit).map((entry) => entry.record),
  };
}

function overviewPage(network) {
  return {
    page: 'overview',
    title: '行情总览',
    overview: network.overview,
    companies: network.companies,
    industries: network.industries,
    signals: network.signals.slice(0, 8),
  };
}

/**
 * Resolves a stable drill route into a page model. Missing targets fail back to
 * the overview instead of inventing a company or industry.
 */
export function getMarketIntelligencePage(network, route = {}) {
  if (network?.schemaVersion !== MARKET_INTELLIGENCE_SCHEMA) {
    throw new TypeError('A market intelligence projection is required.');
  }
  const page = string(route.page, 'overview');
  if (page === 'company') {
    const company = network.companies.find(
      (candidate) => candidate.id === route.companyId,
    );
    return company
      ? {
          page: 'company',
          title: `${company.name} ${company.symbol}`,
          company,
          section: string(route.section) || null,
        }
      : overviewPage(network);
  }
  if (page === 'industry') {
    const industry = network.industries.find(
      (candidate) => candidate.id === route.industryId,
    );
    return industry
      ? {
          page: 'industry',
          title: industry.label,
          industry,
          companies: network.companies.filter((company) =>
            industry.companyIds.includes(company.id),
          ),
          signals: network.signals.filter(
            (signal) => signal.industryId === industry.id,
          ),
        }
      : overviewPage(network);
  }
  if (page === 'industries') {
    return {
      page: 'industries',
      title: '行业脉络',
      industries: network.industries,
      companies: network.companies,
    };
  }
  if (page === 'companies') {
    return {
      page: 'companies',
      title: '公司档案',
      companies: network.companies,
      industries: network.industries,
    };
  }
  if (page === 'signals') {
    return {
      page: 'signals',
      title: '公告与线索',
      signals: network.signals,
    };
  }
  return overviewPage(network);
}

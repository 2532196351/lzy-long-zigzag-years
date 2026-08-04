import { JIANGWAN_OPEN_WORLD_CONTENT } from '../world2d/open-world-city-content.js?v=20260804-01';

const PLACE_BY_ID = new Map(
  JIANGWAN_OPEN_WORLD_CONTENT.places.map((entry) => [
    entry.placeId,
    entry,
  ]),
);

const SUBJECT_LABELS = Object.freeze({
  morning_tide_hot_breakfast: '晨间热早餐',
  family_groceries: '家庭日用补给',
  old_port_seasonal_food_lot: '当季食材',
  clinic_consultation: '社区门诊服务',
  home_maintenance_review: '住宅维护评估',
});

const ACTIVITY_LABELS = Object.freeze({
  'activity-riverside-guided-walk': '沿河慢走',
  'activity-community-evening-game': '社区球局',
  'activity-library-evening-reading': '傍晚共读',
});

const PERSON_ACTIVITY_LABELS = Object.freeze({
  preparing_food: '准备餐食',
  serving_customer: '接待顾客',
  organizing_reading: '整理阅览区',
  triage_service: '接诊分流',
  maintaining_station: '维护工位',
  boarding_service: '引导登船',
  handling_request: '受理住户需求',
  dining: '用餐',
  shopping: '采买',
  walking: '散步',
  reading: '阅读',
});

const TRAFFIC_LABELS = Object.freeze({
  quiet: '通行顺畅',
  light: '通行顺畅',
  moderate: '交通正常',
  busy: '车流较多',
  heavy: '交通繁忙',
});

const FOOTFALL_LABELS = Object.freeze({
  quiet: '人流稀少',
  waking: '人流渐旺',
  ordinary: '人流平稳',
  moderate: '人流平稳',
  busy: '人流较多',
  crowded: '人流密集',
});

const EVENT_LABELS = Object.freeze({
  OfferSettled: '已确认购买',
  OfferConsumed: '购买已完成',
  InventoryCustodyTransferred: '物品已归你保管',
  ServiceCompleted: '服务已完成',
  ActivityStarted: '活动已开始',
  ActivityCompleted: '活动已完成',
  TransitBoarded: '已经登乘',
  TravelLegCompleted: '已经到达',
  AssetUseStarted: '开始使用设施',
  AssetUseCompleted: '设施使用已完成',
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(cents) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 2,
  }).format(Number(cents ?? 0) / 100);
}

function duration(minutes) {
  const value = Math.max(1, Math.round(Number(minutes) / 60_000));
  return `${value}分钟`;
}

function environmentLabel(environment) {
  const phases = {
    dawn: '清晨',
    day: '白天',
    dusk: '傍晚',
    night: '夜间',
  };
  const weather = {
    clear: '晴朗',
    overcast: '阴天',
    rain: '下雨',
    light_rain: '小雨',
  };
  return `${phases[environment?.dayPhase] ?? '当前时段'} · ${
    weather[environment?.weather] ?? '当前天气'
  }`;
}

function placeStateLabel(state) {
  return {
    open: '营业中',
    limited: '接近满员',
    closed: '已结束营业',
    under_work: '正在整备',
  }[state?.openState] ?? '状态待确认';
}

function peopleRows(city) {
  const actors = (city.visibleActors ?? []).map(
    (entry) => `
      <li><strong>${escapeHtml(entry.labelZh)}</strong><span>${escapeHtml(
        PERSON_ACTIVITY_LABELS[entry.activityKind] ?? '正在忙碌',
      )}</span></li>`,
  );
  const cohorts = (city.visibleCohorts ?? []).map(
    (entry) => `
      <li><strong>${escapeHtml(entry.labelZh)}</strong><span>${escapeHtml(
        entry.count,
      )}人</span></li>`,
  );
  return [...actors, ...cohorts].join('');
}

function recentConsequenceLabel(reference) {
  const cashDebit = /^cash:debit:(\d+)$/.exec(reference);
  if (cashDebit) return `已支付${money(Number(cashDebit[1]))}`;
  if (reference.startsWith('experience:')) return '权益已经兑现';
  if (
    reference.startsWith('commitment:') &&
    reference.endsWith(':completed')
  ) {
    return '安排已经完成';
  }
  if (reference.startsWith('commitment:')) return '安排已经确认';
  return null;
}

function offerAction(entry) {
  return {
    priority: 1,
    html: `
      <button type="button" class="open-world-city-action is-primary"
        data-action="open-world-city-intent"
        data-open-world-kind="accept_offer"
        data-open-world-offer="${escapeHtml(entry.offerId)}"
        data-open-world-version="${escapeHtml(entry.offerVersion)}"
        data-open-world-quantity="1">
        <span>${escapeHtml(
          SUBJECT_LABELS[entry.subjectId] ?? '当地商品',
        )}</span>
        <small>${escapeHtml(money(entry.unitPriceCents))} · ${escapeHtml(
          duration(entry.minimumDurationMs),
        )}</small>
      </button>`,
  };
}

function activityAction(entry) {
  return {
    priority: 2,
    html: `
      <button type="button" class="open-world-city-action is-primary"
        data-action="open-world-city-intent"
        data-open-world-kind="join_activity"
        data-open-world-activity="${escapeHtml(entry.activityId)}"
        data-open-world-version="${escapeHtml(entry.activityVersion)}">
        <span>${escapeHtml(
          ACTIVITY_LABELS[entry.activityId] ?? '当地活动',
        )}</span>
        <small>${escapeHtml(duration(entry.minimumDurationMs))} · 余位${escapeHtml(
          entry.availableCapacity,
        )}</small>
      </button>`,
  };
}

function transitAction(entry) {
  const destination = PLACE_BY_ID.get(entry.toPlaceId);
  return {
    priority: 3,
    html: `
      <button type="button" class="open-world-city-action is-primary"
        data-action="open-world-city-intent"
        data-open-world-kind="board_transit"
        data-open-world-run="${escapeHtml(entry.runId)}"
        data-open-world-version="${escapeHtml(entry.runVersion)}"
        data-open-world-seats="1">
        <span>乘车前往${escapeHtml(destination?.labelZh ?? '下一站')}</span>
        <small>${escapeHtml(money(entry.fareCents))} · 余位${escapeHtml(
          entry.availableSeats,
        )}</small>
      </button>`,
  };
}

function routeAction(entry) {
  const destination = PLACE_BY_ID.get(entry.toPlaceId);
  return {
    priority: 4,
    html: `
      <button type="button" class="open-world-city-action is-route"
        data-action="open-world-city-intent"
        data-open-world-kind="move_to"
        data-open-world-route="${escapeHtml(entry.routeId)}"
        data-open-world-version="${escapeHtml(entry.routeVersion)}"
        data-open-world-place="${escapeHtml(entry.toPlaceId)}">
        <span>前往${escapeHtml(destination?.labelZh ?? '相邻地点')}</span>
        <small>步行约${escapeHtml(duration(entry.minimumDurationMs))}</small>
      </button>`,
  };
}

function actionButtons(city) {
  const actions = [
    ...(city.executableOffers ?? []).map(offerAction),
    ...(city.activityOptions ?? []).map(activityAction),
    ...(city.transitRuns ?? []).map(transitAction),
    ...(city.routeOptions ?? []).map(routeAction),
  ]
    .sort((left, right) => left.priority - right.priority)
    .slice(0, 2);
  return actions.map((entry) => entry.html).join('');
}

export function renderOpenWorldCityPanel(city, options = {}) {
  const currentPlaceId = city?.actor?.currentPlaceId;
  const place = PLACE_BY_ID.get(currentPlaceId);
  if (!place) {
    return `
      <section class="open-world-city-panel is-between"
        data-testid="open-world-city-panel">
        <header><span class="eyebrow">江湾里此刻</span><h2>正在地点之间</h2></header>
        <p>走近一处地点后，这里会显示当前营业、人群、交通与真实可做的事。</p>
      </section>`;
  }
  const state = (city.placeStates ?? []).find(
    (entry) => entry.placeId === currentPlaceId,
  );
  const people = peopleRows(city);
  const actions =
    options.actionsVisible === false ? '' : actionButtons(city);
  const recent = (city.settledConsequences ?? [])
    .slice(-2)
    .map((entry) => {
      const details = entry.consequenceRefs
        .map(recentConsequenceLabel)
        .filter(Boolean)
        .join(' · ');
      return `<li>${escapeHtml(
        EVENT_LABELS[entry.eventKind] ?? '生活记录已更新',
      )}${details ? `<span>${escapeHtml(details)}</span>` : ''}</li>`;
    })
    .join('');
  return `
    <section class="open-world-city-panel"
      data-testid="open-world-city-panel"
      data-current-place="${escapeHtml(currentPlaceId)}">
      <header class="open-world-city-header">
        <div><span class="eyebrow">江湾里此刻</span><h2>${escapeHtml(
          place.labelZh,
        )}</h2></div>
        <span class="open-world-city-state is-${escapeHtml(
          state?.openState ?? 'unknown',
        )}">${escapeHtml(placeStateLabel(state))}</span>
      </header>
      <div class="open-world-city-facts" aria-label="当前地点事实">
        <span>${escapeHtml(environmentLabel(city.environment))}</span>
        <span>在场 ${escapeHtml(state?.occupancy ?? 0)} / ${escapeHtml(
          state?.capacity ?? 0,
        )}</span>
        <span>${escapeHtml(
          FOOTFALL_LABELS[city.environment?.footfallBand] ?? '人流平稳',
        )}</span>
        <span>${escapeHtml(
          TRAFFIC_LABELS[city.environment?.trafficBand] ?? '交通正常',
        )}</span>
      </div>
      <div class="open-world-city-columns">
        <section><h3>身边的人</h3>${
          people
            ? `<ul class="open-world-city-people">${people}</ul>`
            : '<p>此刻没有可确认的在场人物。</p>'
        }
        </section>
        <section><h3>现在可做</h3>${
          actions
            ? `<div class="open-world-city-actions">${actions}</div>`
            : options.actionsVisible === false
              ? '<p>当前操作由此地点的既有生活系统提供。</p>'
              : '<p>当前没有符合时间、余量和权限的操作。</p>'
        }
        </section>
      </div>
      ${recent ? `<details class="open-world-city-recent"><summary>最近发生</summary><ul>${recent}</ul></details>` : ''}
    </section>`;
}

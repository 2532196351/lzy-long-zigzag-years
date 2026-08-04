import {
  capitalCentsFromSliderPosition,
  capitalSliderPositionFromCents,
  createWorld,
  getCompanyCatalog,
  getLifeCatalog,
  getLifeProjection,
  getRoleCatalog,
  getSocialCareerProjection,
  getDerivativesProjection,
} from './engine.js?v=20260804-01';
import {
  clearSavedWorld,
  exportSavedGameArchive,
  getSaveMeta,
  hasSavedWorld,
  hasStoredSaveArchive,
  importSavedGameArchive,
  loadGameState,
  saveGameState,
  saveGameStateAsync,
} from './storage.js?v=20260804-01';
import {
  createMarketClient,
  createVisibleFramePublicationGate,
} from './market/client.js?v=20260804-01';
import { mountMarketStage } from './market/stage.js?v=20260804-01';
import { MARKET_CLOCK_ORIGIN_OFFSET_MS } from './market/chart-domain.js?v=20260804-01';
import {
  QUANT_STRATEGY_CATALOG,
  playerStrategyTemplate,
  quantStrategyDefinition,
  quantStrategyUpgradeCost,
} from './role-strategies.js?v=20260804-01';
import {
  mergeWorldAuthorityPublication,
} from './market/world-publication.js?v=20260804-01';
import { projectWorldExperience } from './experience/world-experience.js?v=20260804-01';
import {
  renderWorldlinePanel,
} from './experience/worldline-view.js?v=20260804-01';
import { projectPlayerWealth } from './experience/player-wealth.js?v=20260804-01';
import { renderPlayerWealth } from './experience/player-wealth-view.js?v=20260804-01';
import {
  mountMarketIntelligence,
} from './experience/market-intelligence-view.js?v=20260804-01';
import {
  renderCityAssetActions,
  renderCityPlaceGrid,
  renderCityResponsibilityPanel,
  renderCityServicePanel,
} from './experience/city-life-view.js?v=20260804-01';
import {
  renderOpenWorldCityPanel,
} from './experience/open-world-city-view.js?v=20260804-01';
import {
  renderSocialCareerView,
  socialCareerActionFromDataset,
} from './experience/social-career-view.js?v=20260804-01';
import {
  isPublishedDerivativesProjection,
  mergePublishedDerivativesProjection,
} from './experience/derivatives-view.js?v=20260804-01';
import { mountWorld2DRuntime } from './game2d/runtime.js?v=20260804-01';

const root = document.querySelector('#app');
const ROLE_CATALOG = getRoleCatalog();
const INSTITUTIONAL_PLAYER_ROLES = new Set([
  'institution',
  'quant_institution',
  'stabilization_fund',
]);

function institutionalPlayerRole(roleType) {
  return INSTITUTIONAL_PLAYER_ROLES.has(roleType);
}

function lifeEligibilityRole(roleType) {
  if (institutionalPlayerRole(roleType)) return 'institution';
  if (roleType === 'private_whale') return 'household';
  return roleType;
}
const COMPANY_CATALOG = getCompanyCatalog();
const COMPANY_BY_ID = Object.fromEntries(
  COMPANY_CATALOG.map((company) => [company.id, company]),
);
const LIFE_CATALOG = getLifeCatalog();
const LIFE_ITEM_BY_ID = Object.fromEntries(
  LIFE_CATALOG.map((item) => [item.id, item]),
);
const LIFE_CATEGORY_LABELS = Object.freeze({
  vehicle: '出行',
  housing: '住房',
  phone: '手机',
  computer: '电脑',
  home: '家居家电',
  clothing: '服饰',
  food: '饮食',
  health: '健康医疗',
  communication: '通信订阅',
  entertainment: '休闲娱乐',
  education: '教育技能',
  service: '城市服务',
});
const LIFE_CATEGORY_ORDER = Object.freeze([
  'vehicle',
  'housing',
  'phone',
  'computer',
  'home',
  'clothing',
  'food',
  'health',
  'communication',
  'entertainment',
  'education',
  'service',
]);
const LIFE_TIER_LABELS = Object.freeze({
  basic: '实用',
  mid: '进阶',
  high: '高配',
});
const PRIMARY_ROUTES = new Set(['today', 'market', 'life', 'decision']);
const WORK_SECTIONS = new Set(['desk', 'network', 'profile']);
const ROUTES = new Set([
  ...PRIMARY_ROUTES,
  'information',
  'history',
]);
const VISIBLE_FRAME_INTERVAL_MS = 9_000;
const visibleFramePublicationGate =
  createVisibleFramePublicationGate({
    intervalMs: VISIBLE_FRAME_INTERVAL_MS,
  });
const HISTORY_TIMELINE_LIMIT = 5;
const HISTORY_LAYERS = new Set(['facts', 'memories', 'narratives']);

const QUALITY_LABELS = {
  high: '多方证实',
  medium: '两方消息',
  low: '传闻',
};

const VERDICT_LABELS = {
  supported: '属实',
  refuted: '不实',
  inconclusive: '待定',
};

const REJECTION_LABELS = {
  CLUE_NOT_FOUND: '线索不存在或已经离开当前世界。',
  ALREADY_VERIFIED: '这条消息已经查过了。',
  INSUFFICIENT_RESEARCH: '调查精力不足。',
  INVALID_SIDE: '请选择买入或卖出。',
  UNKNOWN_SECURITY: '没有找到这只合成证券。',
  INVALID_QUANTITY: '数量必须是大于零的整数。',
  INVALID_LIMIT_PRICE: '限价必须大于零。',
  INSUFFICIENT_HOLDINGS: '当前持仓不足，无法完成这笔卖出。',
  NO_MARKET_AT_LIMIT: '当前限价没有可撮合对手盘；可以调整限价或等待盘口变化。',
  INSUFFICIENT_CASH: '可用现金不足以覆盖成交与费用。',
  NO_LIQUIDITY: '当前盘口没有足够流动性。',
  COUNTERPARTY_CASH_SHORTFALL: '对手方清算现金暂时不足。',
  ROLE_NOT_AUTHORIZED: '当前身份不能进行这项操作。',
  INVALID_RESERVE: '储备边界必须在零与当前可用现金之间。',
  INVALID_PRODUCTION_UNITS: '排产数量必须是大于零的整数。',
  COMPANY_CASH_CONSTRAINED: '企业可用经营现金不足以锁定这次排产。',
  NO_CONTROL_AUTHORITY: '当前身份不能安排这家企业。',
  AUTHORITY_CAPACITY_LIMIT: '新增排产超过本期可安排的产能。',
  INVALID_LIQUIDITY_BUFFER: '流动性缓冲目标必须在 10% 至 65% 之间。',
  LIFE_ITEM_NOT_FOUND: '这件商品已经下架。',
  LIFE_ITEM_OUT_OF_STOCK: '这件商品暂时售罄，补货后再来看看。',
  LIFE_ITEM_NOT_OWNED: '随身物品中没有这件商品。',
  LIFE_ASSET_NOT_OWNED: '没有找到这件物品。',
  LIFE_ASSET_NOT_ACTIVATABLE: '这件物品不需要设为常用。',
  LIFE_ASSET_BROKEN: '这件物品需要先养护。',
  LIFE_ASSET_DOES_NOT_NEED_MAINTENANCE: '这件物品目前不需要养护。',
  LIFE_ASSET_NOT_PLACED: '请先把这件物品摆入当前场所。',
  LIFE_ASSET_NOT_CURRENT_LOCATION: '请先启用并到达这件物品所在的场所。',
  LIFE_HOME_NOT_ACTIVE: '请先启用主要场所。',
  LIFE_SPACE_FULL: '主要场所或库位已经放满，请先收起其他物品。',
  LIFE_PARKING_FULL: '当前场所没有可用车位。',
  LIFE_WORK_ALREADY_DONE: '今天这一班已经完成了。',
  LIFE_WORK_TOO_TIRED: '精力、饱腹或健康状态不足，先补给并休整。',
  LIFE_WORK_COUNTERPARTY_SHORTFALL: '这班工作暂时无法结算。',
  LIFE_ROLE_NOT_ELIGIBLE: '当前身份无法以这个用途签约或持有。',
  LIFE_STORAGE_FULL: '库位已经占满，请先摆放、使用或出售其他物品。',
  LIFE_OBLIGATION_SHORTFALL: '现金不足，本期待结；可以工作、出售资产或取消服务。',
  LIFE_ACTIVE_SITE_CANNOT_BE_SOLD: '当前使用中的主要场所不能直接出售，请先启用另一处场所。',
  LIFE_RESALE_COUNTERPARTY_SHORTFALL: '二手回收方暂时无法结算这件资产。',
  LIFE_SERVICE_NOT_AVAILABLE: '这项预约已用完或已经到期。',
  LIFE_SERVICE_NOT_ACTIVE: '没有找到仍在生效的服务。',
  UNKNOWN_LIFE_ACTION: '这个日常操作暂时不可用。',
  SOCIAL_ACTOR_NOT_FOUND: '这个人现在不在可联系范围内。',
  SOCIAL_LOCATION_NOT_FOUND: '这个地点现在去不了。',
  SOCIAL_TARGET_NOT_PRESENT: '先到对方所在的地方再谈。',
  SOCIAL_TARGET_BUSY: '对方眼下有安排，晚些时候再联系。',
  SOCIAL_REMOTE_CONTACT_UNAVAILABLE:
    '异地联络需要一部完好并设为常用的手机。',
  SOCIAL_ATTENTION_REQUIRED: '今天能分给这件事的注意力不够。',
  SOCIAL_CASH_REQUIRED: '当前可用现金不足。',
  INTERACTION_TOO_FAR: '还没有走到这个地点。',
  UNKNOWN_INTERACTABLE: '这个地点现在不可用。',
  PORTAL_NOT_AVAILABLE: '这条通路现在没有开放。',
  PORTAL_DESTINATION_INVALID: '目的地暂时无法安全到达。',
  INTERACTION_NOT_SETTLEABLE: '这个互动暂时不能结算。',
  STALE_ENTERTAINMENT_PROJECTION: '地点里的活动刚刚发生变化，请按最新内容再试一次。',
  ACTIVITY_ALREADY_COMPLETED_TODAY: '今天已经完成过这项活动，明天再来会有新的体验。',
  NO_AVAILABLE_ACTIVITY: '这项活动当前没有开放。',
  NO_EXECUTABLE_COUNTERPARTY: '当前没有可以真实结算的服务方。',
  STALE_ACTIVITY_REFERENCE: '活动安排已经更新，请按最新安排再试。',
  STALE_OFFER_REFERENCE: '这份报价已经更新，请按最新报价再试。',
  SOCIAL_OFFER_REFUSED: '这个条件对方没有接受。',
  SOCIAL_GIFT_REFUSED: '对方没有收下这份心意。',
  SOCIAL_TARGET_COMMITTED: '对方已有不能随意放下的工作约定。',
  SOCIAL_HIRE_REFUSED: '对方没有接受这份工作条件。',
  SOCIAL_ORGANIZATION_AT_CAPACITY: '当前事业已经没有空余岗位。',
  SOCIAL_CAPABILITY_TERMS_INVALID: '这笔能力建设暂时无法安排。',
  SOCIAL_DEBT_LIMIT: '这笔借款超过了当前可承担的边界。',
  SOCIAL_LENDER_SHORTFALL: '出借方当前无法结算这笔借款。',
  SOCIAL_REPAYMENT_INVALID: '当前现金或债务不足以这样归还。',
  SOCIAL_OPPORTUNITY_NOT_OPEN: '这件机会已经被接走或到期。',
  SOCIAL_BID_REFUSED: '对方没有接受这次报价。',
  UNKNOWN_SOCIAL_ACTION: '这次来往暂时无法进行。',
  ACCESS_NOT_QUALIFIED: '世界运行时间或资产条件尚未满足。',
  FUTURES_ACCESS_REQUIRED: '请先开通期货交易。',
  OPTION_BUYER_ACCESS_REQUIRED: '请先开通期权交易。',
  MARGIN_FINANCING_ACCESS_REQUIRED: '请先开通融资。',
  PLAYER_OPTION_WRITING_NOT_ENABLED: '当前仅支持买入期权和卖出已有持仓。',
  INSUFFICIENT_OPTION_PREMIUM_CASH: '现金不足以支付期权权利金。',
  INSUFFICIENT_INITIAL_MARGIN: '可用保证金不足。',
  OPTION_PRICE_ABOVE_NO_ARBITRAGE_BOUND: '委托价格超出当前可接受范围。',
  CREDIT_POOL_CAPACITY_EXHAUSTED: '当前融资额度不足。',
  INSUFFICIENT_FINANCING_COLLATERAL: '担保资产不足以支持这笔融资。',
  INVALID_REPAYMENT_AMOUNT: '归还金额超过融资余额或可用现金。',
  UNKNOWN_CONTRACT: '这份合约已经不存在。',
  CONTRACT_NOT_ACTIVE: '这份合约已经到期。',
  INVALID_PRICE_TICKS: '委托价格不符合最小变动单位。',
  DERIVATIVE_COUNTERPARTY_CASH_SHORTFALL: '清算资金暂时不足。',
  UNKNOWN_DERIVATIVE_ACTION: '这项衍生品操作暂时不可用。',
  UNKNOWN_ACTION: '这项操作暂时不可用。',
};

let world = null;
let screen = 'welcome';
let activeRoute = 'today';
let selectedSymbol = COMPANY_CATALOG[1]?.symbol ?? COMPANY_CATALOG[0].symbol;
let interfaceMode = 'novice';
let saveState = 'idle';
let notice = '';
let errorMessage = '';
let marketClient = null;
let marketStage = null;
let marketIntelligenceView = null;
let world2dRuntime = null;
let world2dControlTail = Promise.resolve();
let world2dCommandOrdinal = 0;
let pendingWorld2DInteraction = null;
let intelligenceInitialRoute = { page: 'overview' };
let marketSnapshot = null;
let marketCheckpoint = null;
let latestMarketReceipt = null;
let confirmedBarrier = null;
let confirmedCommitSeq = -1;
let authorityGeneration = 0;
let barrierTail = Promise.resolve(null);
let barrierScheduled = false;
let autoBarrierTimerId = null;
let autoBarrierInFlight = false;
let autoBarrierDirty = false;
let scheduledBarrierReason = 'auto';
let lastSavedAt = null;
let frameAutoSaveSuppression = 0;
let lastFrameAutoSaveTick = -1;
let playbackState = 'running';
let playbackSpeed = 1;
const MARKET_PLAYBACK_STOPPED_MESSAGE =
  '市场推进已停止，当前订单和时间不会继续处理，请保留现场后重新载入。';
let lifeSection = 'home';
let lifeShopCategory = 'food';
let workSection = 'desk';
let marketMode = 'stocks';
let derivativesSection = 'futures';
let selectedDerivativeContractId = null;
let derivativesProjection = null;
let historyLayer = 'facts';
let saveRecoveryAvailable = false;
// Persist a canonical barrier after a short quiet window. Building the exact
// checkpoint is intentionally heavier than an order acknowledgement; firing
// it 1.2s after opening Level-2 routinely put that barrier immediately ahead
// of the player's first order in the same Worker queue. Five seconds still
// coalesces ordinary play promptly while keeping active ticket interaction out
// of the save critical section.
const AUTO_SAVE_DEBOUNCE_MS = 5_000;

function cloneValue(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function number(value, digits = 0) {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Number(value) || 0);
}

function percent(value, digits = 1) {
  return `${number((Number(value) || 0) * 100, digits)}%`;
}

function marketDirectionClass(value) {
  const amount = Number(value) || 0;
  return amount > 0
    ? 'market-up'
    : amount < 0
      ? 'market-down'
      : 'market-flat';
}

function savedTime(value) {
  if (!value) return '尚未保存';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '已保存';
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function currentCompany(symbol = selectedSymbol) {
  const security = world?.market.securities[symbol];
  return security ? world.entities.companies[security.issuerId] : null;
}

function routeIs(route) {
  return activeRoute === route ? 'page' : 'false';
}

function normalizeRoute(route) {
  if (route === 'review') return 'history';
  if (route === 'derivatives') return 'market';
  return ROUTES.has(route) ? route : 'today';
}

function normalizeMarketTerminalMetadata(
  metadata = {},
) {
  const value =
    metadata && typeof metadata === 'object'
      ? metadata
      : {};
  const legacyDerivativeRoute =
    value.activeRoute === 'derivatives';
  const legacySection =
    value.derivativesSection;
  const candidateMode =
    ['stocks', 'futures', 'options'].includes(
      value.marketMode,
    )
      ? value.marketMode
      : legacyDerivativeRoute &&
          ['futures', 'options'].includes(
            legacySection,
          )
        ? legacySection
        : 'stocks';
  return {
    activeRoute: normalizeRoute(
      value.activeRoute,
    ),
    marketMode:
      legacyDerivativeRoute &&
      legacySection === 'financing'
        ? 'stocks'
        : candidateMode,
    selectedSymbol:
      typeof value.selectedSymbol === 'string'
        ? value.selectedSymbol
        : null,
  };
}

function worldDate(snapshot = marketSnapshot) {
  const calendar = snapshot?.calendar ?? world.world.calendar;
  return `第 ${calendar.year} 年 · 第 ${calendar.day} 日`;
}

function viewTitle() {
  return {
    today: ['世界', ''],
    decision: ['工作', ''],
    life: ['生活', ''],
    market: ['市场', ''],
    information: ['行情资料', ''],
    history: ['记录', ''],
  }[activeRoute];
}

function render() {
  destroyMarketStage();
  destroyMarketIntelligence();
  if (screen === 'game' && world && world2dRuntime) {
    world2dRuntime.suspend();
  } else {
    destroyWorld2DRuntime();
  }
  root.setAttribute('aria-busy', 'false');
  if (screen === 'create') {
    root.innerHTML = renderCreateScreen();
  } else if (screen === 'game' && world) {
    root.innerHTML = renderGameScreen();
  } else {
    root.innerHTML = renderWelcomeScreen();
  }
  mountCurrentMarketStage();
  mountCurrentMarketIntelligence();
  mountCurrentWorld2DRuntime();
}

function renderWelcomeScreen() {
  const meta = getSaveMeta();
  const resumable = hasSavedWorld();
  const archivePresent = hasStoredSaveArchive();
  const previewNodes = COMPANY_CATALOG.map(
    (company, index) => `
      <div class="welcome-company welcome-company-${index + 1}">
        <span class="welcome-company-pulse" aria-hidden="true"></span>
        <strong>${escapeHtml(company.shortName)}</strong>
        <span>${escapeHtml(company.symbol)}</span>
        <small>${money(company.openingPrice)}</small>
      </div>
    `,
  ).join('');
  return `
    <main class="welcome-screen" data-testid="welcome-screen">
      <div class="welcome-stage">
        <section class="welcome-world-preview" data-testid="welcome-world-preview"
          aria-labelledby="welcome-title"
          aria-label="由多家合成企业、资本和关系构成的本地世界预览">
          <header class="welcome-mark">
            <p class="eyebrow">LZY / 历·择·衍</p>
            <h1 id="welcome-title">历·择·衍</h1>
          </header>
          <svg class="welcome-flow" viewBox="0 0 100 100"
            aria-hidden="true" focusable="false">
            <path d="M18 28 C34 10 66 10 82 30" />
            <path d="M82 30 C74 60 65 76 50 82" />
            <path d="M50 82 C35 72 24 57 18 28" />
            <circle cx="50" cy="50" r="21" />
          </svg>
          <div class="welcome-capital" aria-hidden="true">
            <span></span><span></span><span></span>
          </div>
          <div class="welcome-company-field" data-testid="welcome-company-field">
            ${previewNodes}
          </div>
          <div class="welcome-world-state">
            <span class="world-running-dot" aria-hidden="true"></span>
            <strong>${resumable ? '本地世界可继续' : '新世界尚未开始'}</strong>
            <span>合成 · 离线 · 7×24</span>
          </div>
        </section>
        <section class="welcome-entry action-stack" aria-label="世界入口">
          ${
            resumable
              ? `
                <div class="save-summary" data-testid="save-summary">
                  <strong>${escapeHtml(meta?.worldName ?? '本地世界')}</strong>
                  <span>${escapeHtml(meta?.roleLabel ?? '已有身份')} · ${
                    meta ? `第 ${meta.year} 年第 ${meta.day} 日` : '可继续'
                  }</span>
                  <small>${escapeHtml(savedTime(meta?.savedAt))}</small>
                </div>
                <button class="button button-primary button-wide" type="button"
                  data-action="continue" data-testid="continue-game">
                  继续
                </button>
              `
              : ''
          }
          <button class="button ${resumable ? 'button-quiet' : 'button-primary'} button-wide"
            type="button" data-action="new-world" data-testid="new-game">
            ${resumable ? '新建另一世界' : '进入新世界'}
          </button>
          <label class="button button-quiet button-wide" data-testid="import-save">
            导入存档副本
            <input type="file" accept="application/json,.json"
              data-testid="import-save-input" hidden>
          </label>
          ${
            archivePresent && (!resumable || saveRecoveryAvailable)
              ? `
                <div class="save-recovery" data-testid="save-recovery">
                  <strong>存档未被改写</strong>
                  <span>可先下载原始副本，再决定如何处理。</span>
                  <button class="button button-quiet" type="button"
                    data-action="download-save" data-testid="download-save">
                    下载存档副本
                  </button>
                </div>
              `
              : ''
          }
          <small class="welcome-risk">本地合成世界 · 不连接现实账户 · 非投资建议</small>
          <div class="error-summary" role="alert">${escapeHtml(errorMessage)}</div>
        </section>
      </div>
    </main>
  `;
}

function renderCreateScreen() {
  const roleCards = Object.entries(ROLE_CATALOG)
    .map(
      ([roleType, role], index) => `
        <label class="create-role-choice">
          <input type="radio" name="roleType" value="${roleType}"
            ${index === 0 ? 'checked' : ''}
            data-testid="role-${roleType}" />
          <span class="create-role-index" aria-hidden="true">${index + 1}</span>
          <strong>${escapeHtml(role.label)}</strong>
          <small>${money(
            role.capitalContract.minimumCents / 100,
          )}—${money(
            role.capitalContract.maximumCents / 100,
          )}</small>
        </label>
      `,
    )
    .join('');

  return `
    <main class="create-screen panel-enter" data-testid="create-world-screen">
      <form id="create-world-form" class="create-console"
        data-testid="create-console">
        <header class="create-console-head">
          <div>
            <span class="eyebrow">LZY / 新世界</span>
            <h1>建立身份</h1>
          </div>
          <button class="button button-quiet" type="button"
            data-action="back-welcome">返回</button>
        </header>

        <fieldset class="create-block create-role-block">
          <legend>身份</legend>
          <div class="create-role-grid" data-testid="create-role-grid">
            ${roleCards}
          </div>
        </fieldset>

        <div class="create-control-grid">
          <fieldset class="create-block create-capital-block">
            <legend>可控资本</legend>
            <div class="create-capital-control">
              <input id="capital-slider" class="range" type="range"
                min="0" max="1000" step="1"
                value="${capitalSliderPositionFromCents(
                  'household',
                  ROLE_CATALOG.household.capitalContract.defaultCents,
                )}"
                data-testid="capital-slider" />
              <label for="capital-input">精确金额（元）</label>
              <input id="capital-input" class="input data-number create-capital-input"
                type="number" name="startingCapitalYuan" step="1"
                min="${ROLE_CATALOG.household.capitalContract.minimumCents / 100}"
                max="${ROLE_CATALOG.household.capitalContract.maximumCents / 100}"
                value="${capitalCentsFromSliderPosition(
                  'household',
                  capitalSliderPositionFromCents(
                    'household',
                    ROLE_CATALOG.household.capitalContract.defaultCents,
                  ),
                ) / 100}"
                inputmode="numeric" required data-testid="capital-input" />
              <div class="create-capital-bounds">
                <small data-testid="capital-minimum">最低 ${money(
                  ROLE_CATALOG.household.capitalContract.minimumCents / 100,
                )}</small>
                <small data-testid="capital-maximum">最高 ${money(
                  ROLE_CATALOG.household.capitalContract.maximumCents / 100,
                )}</small>
              </div>
              <small id="capital-validation" class="capital-validation"
                role="status" aria-live="polite"></small>
            </div>
          </fieldset>

          <fieldset class="create-block create-allocation-block">
            <legend>现金</legend>
            <div class="create-range">
              <label for="cash-allocation">现金比例</label>
              <input id="cash-allocation" class="range" type="range" min="20" max="90"
                step="5" value="65" data-testid="allocation-cash" />
              <output id="cash-allocation-output" class="allocation-summary"
                for="cash-allocation" data-testid="allocation-summary">
                现金 65% · 股票 35%
              </output>
            </div>
          </fieldset>

          <fieldset class="create-block create-seed-block">
            <legend>种子</legend>
            <label class="visually-hidden" for="world-seed">世界种子</label>
            <input id="world-seed" class="input data-number" name="seed" type="text"
              maxlength="64" value="LZY-试玩-001" required autocomplete="off"
              data-testid="seed-input" />
          </fieldset>
        </div>

        <div id="profile-preview" class="create-vitals"
          data-testid="create-vitals">
          ${renderProfilePreview(
            'household',
            ROLE_CATALOG.household.capitalContract.defaultCents,
          )}
        </div>

        <div class="create-actions">
          <small>离线合成 · 非投资建议</small>
          <button class="button button-primary" type="button"
            data-action="create-world" data-testid="create-world-submit">
            进入世界
          </button>
        </div>
        <div class="error-summary" id="create-error" role="alert">${escapeHtml(errorMessage)}</div>
      </form>
    </main>
  `;
}

function renderProfilePreview(
  roleType,
  startingCapitalCents,
) {
  const role = ROLE_CATALOG[roleType];
  const profile = role.low;
  const roleDetail = {
    household: ['生活储备', money(profile.cashReserve)],
    professional: ['回撤边界', percent(
      profile.drawdownLimit,
      0,
    )],
    operator: ['经营权限', percent(
      profile.operatingAuthority,
      0,
    )],
    institution: ['流动性', percent(
      profile.liquidityBufferRatio,
      0,
    )],
    quant_institution: ['策略容量', percent(
      profile.strategyCapacity,
      0,
    )],
    stabilization_fund: ['授权主体', `${profile.mandateLegs} 组`],
    private_whale: ['实际受益人暴露', percent(
      profile.beneficialOwnerExposure,
      0,
    )],
  }[roleType];

  return `
    <span class="create-vital-name">
      <small>${escapeHtml(role.label)}</small>
      <strong>${escapeHtml(profile.name)}</strong>
    </span>
    <span><small>可控资本</small><strong>${money(
      startingCapitalCents / 100,
    )}</strong></span>
    <span><small>负债</small><strong>${money(profile.liabilities)}</strong></span>
    <span><small>${escapeHtml(roleDetail[0])}</small><strong>${escapeHtml(
      roleDetail[1],
    )}</strong></span>
    <span><small>研究</small><strong>${profile.research}</strong></span>
  `;
}

function renderGameScreen() {
  const [title, summary] = viewTitle();
  const mode = interfaceMode === 'expert' ? 'detail' : 'compact';
  const saveLabel =
    saveState === 'error'
      ? '保存失败'
      : saveState === 'saving'
        ? '正在保存'
        : lastSavedAt
          ? '已保存'
          : '未保存';
  const marketRoute =
    activeRoute === 'market';
  const virtualMs = Math.max(0, Number(marketSnapshot?.nowMs) || 0);
  const virtualClock = virtualClockText(
    virtualMs,
    marketSnapshot?.marketClockOffsetMs,
  );
  const running = playbackState === 'running';

  return `
    <div class="world-shell mode-${mode} ${marketRoute ? 'market-mode' : ''}"
      data-testid="game-screen">
      <header class="world-status">
        <div class="world-status-inner">
          <div class="brand-lockup">
            <strong>LZY / 历·择·衍</strong>
            <span>本地市场</span>
          </div>
          <div class="world-meta" aria-label="世界当前状态">
            <span class="world-running-dot ${running ? '' : 'is-paused'}"
              aria-hidden="true"></span>
            <strong data-testid="world-day" data-world-bind="date">${escapeHtml(
              worldDate(),
            )}</strong>
            <span class="world-role-meta" data-testid="world-identity">${escapeHtml(
              world.player.roleLabel,
            )}</span>
            <span class="world-virtual-clock" data-world-bind="clock">${virtualClock}</span>
          </div>
          <div class="world-controls">
            <button class="world-run-toggle" type="button"
              data-action="world-toggle" data-testid="world-toggle"
              aria-pressed="${running ? 'true' : 'false'}"
              aria-label="${running ? '暂停世界' : '继续世界'}">
              <span aria-hidden="true">${running ? 'Ⅱ' : '▶'}</span>
              <span>${running ? '运行' : '暂停'}</span>
            </button>
            <label class="world-speed" for="world-speed">
              <span class="visually-hidden">世界倍速</span>
              <select id="world-speed" data-testid="world-speed"
                aria-label="世界倍速">
                ${[1, 4, 16]
                  .map(
                    (speed) =>
                      `<option value="${speed}" ${
                        playbackSpeed === speed ? 'selected' : ''
                      }>${speed}×</option>`,
                  )
                  .join('')}
              </select>
            </label>
            <span class="save-state" data-state="${saveState}" data-testid="save-status"
              aria-live="polite">${saveLabel}</span>
            <details class="world-menu">
              <summary aria-label="世界菜单">•••</summary>
              <div>
                <button class="button button-quiet" type="button"
                  data-action="set-mode"
                  data-mode="${interfaceMode === 'expert' ? 'novice' : 'expert'}">
                  ${interfaceMode === 'expert' ? '简洁显示' : '详细数据'}
                </button>
                <button class="button button-quiet" type="button"
                  data-action="route" data-route="history">
                  世界记录
                </button>
                <button class="button button-quiet" type="button" data-action="save"
                  data-testid="save-world">保存世界</button>
                <button class="button button-quiet" type="button" data-action="restart-open"
                  data-testid="restart-game">重新开始</button>
              </div>
            </details>
          </div>
        </div>
      </header>

      <nav class="primary-nav" aria-label="主要导航">
        <div class="primary-nav-inner">
          <button class="nav-button" type="button" data-action="route" data-route="today"
            aria-current="${routeIs('today')}"
            aria-label="城市与当前地点" data-testid="nav-city">城市</button>
          <button class="nav-button" type="button" data-action="route"
            data-route="information" aria-current="${routeIs('information')}"
            aria-label="手机与城市信息" data-testid="nav-phone">手机</button>
          <button class="nav-button" type="button" data-action="life-place"
            data-life-section="bag"
            aria-current="${
              activeRoute === 'life' && lifeSection === 'bag'
                ? 'page'
                : 'false'
            }"
            aria-label="随身物品" data-testid="nav-bag">随身</button>
          <button class="nav-button" type="button" data-action="route" data-route="decision"
            aria-current="${routeIs('decision')}"
            aria-label="角色、工作与关系" data-testid="nav-self">我</button>
        </div>
      </nav>

      <div class="world-grid ${marketRoute ? 'world-grid-market' : ''}">
        <main id="current-decision" class="main-workspace ${
          marketRoute ? 'market-workspace' : ''
        }" tabindex="-1">
          ${
            marketRoute ||
            activeRoute === 'today' ||
            activeRoute === 'information'
              ? ''
              : `<header class="lens-header panel-enter">
                  <h1>${escapeHtml(title)}</h1>
                  <span>${escapeHtml(summary)}</span>
                </header>`
          }
          ${renderActiveRoute()}
        </main>
      </div>

      <footer class="footer-note">
        虚构市场 · 本地运行 · 非投资建议
      </footer>

      <div class="live-region" role="status" aria-live="polite"
        aria-atomic="true" data-testid="live-status">${escapeHtml(notice)}</div>

      <dialog id="restart-dialog" data-testid="restart-dialog"
        aria-labelledby="restart-title">
        <div class="dialog-content">
          <p class="eyebrow">本地存档操作</p>
          <h2 id="restart-title">确定重新开始？</h2>
          <p>当前浏览器里的这个世界将被清除。</p>
          <div class="inline-actions">
            <button class="button button-quiet" type="button" data-action="restart-cancel">
              继续当前世界
            </button>
            <button class="button button-danger" type="button" data-action="restart-confirm"
              data-testid="confirm-restart">
              确认清除并重新开始
            </button>
          </div>
        </div>
      </dialog>
    </div>
  `;
}

function renderActiveRoute() {
  switch (activeRoute) {
    case 'decision':
      return renderDecisionView();
    case 'market':
      return renderMarketView();
    case 'life':
      return renderLifeView();
    case 'information':
      return renderInformationView();
    case 'history':
      return renderHistoryView();
    case 'today':
    default:
      return renderTodayView();
  }
}

function renderRoleCard() {
  const state = world.player.roleState;
  const { familyLiquidity, controlledCompanyId } = state;
  const institutionalDetail = `
    <div class="metric"><span>管理资产</span><strong>${money(
      state.assetsUnderManagement,
    )}</strong></div>
    <div class="metric"><span>产品负债</span><strong>${money(
      state.productLiability,
    )}</strong></div>
    <div class="metric"><span>缓冲目标</span><strong>${percent(
      state.liquidityBufferRatio,
      0,
    )}</strong></div>
    <div class="metric"><span>赎回压力</span><strong>${percent(
      state.redemptionPressure,
    )}</strong></div>
    <div class="metric"><span>市场关注</span><strong>${number(
      state.marketAttention,
      2,
    )}</strong></div>
    <div class="metric"><span>组合集中度</span><strong>${percent(
      state.concentration,
    )}</strong></div>
  `;
  const detail = {
    household: `
      <div class="metric"><span>现金储备边界</span><strong>${money(
        state.cashReserve,
      )}</strong></div>
      <div class="metric"><span>每 20 日生活支出</span><strong>${money(
        state.livingExpense,
      )}</strong></div>
      <div class="metric metric-wide"><span>家庭流动性</span><strong>${escapeHtml(
        familyLiquidityLabel(familyLiquidity),
      )}</strong></div>
    `,
    professional: `
      <div class="metric"><span>受托规模</span><strong>${money(
        state.mandateCapital,
      )}</strong></div>
      <div class="metric"><span>回撤边界</span><strong>${percent(
        state.drawdownLimit,
        0,
      )}</strong></div>
      <div class="metric"><span>考核剩余</span><strong>${number(
        state.evaluationHorizon,
      )} 日</strong></div>
      <div class="metric"><span>职业声誉</span><strong>${number(
        state.reputation,
        1,
      )}</strong></div>
    `,
    operator: `
      <div class="metric"><span>控制企业</span><strong>${escapeHtml(
        companyDisplayName(controlledCompanyId),
      )}</strong></div>
      <div class="metric"><span>经营权限</span><strong>${percent(
        state.operatingAuthority,
        0,
      )}</strong></div>
      <div class="metric metric-wide"><span>扩张信用</span><strong>${money(
        state.expansionCredit,
      )}</strong></div>
    `,
    institution: institutionalDetail,
    quant_institution: `${institutionalDetail}
      <div class="metric"><span>技术预算</span><strong>${money(
        state.technologyBudget,
      )}</strong></div>
      <div class="metric"><span>策略容量</span><strong>${percent(
        state.strategyCapacity,
      )}</strong></div>
    `,
    stabilization_fund: `${institutionalDetail}
      <div class="metric"><span>机制授权</span><strong>稳定市场功能</strong></div>
      <div class="metric"><span>独立账簿</span><strong>${number(
        state.mandateLegs,
      )} 组</strong></div>
    `,
    private_whale: `
      <div class="metric"><span>私人储备边界</span><strong>${money(
        state.cashReserve,
      )}</strong></div>
      <div class="metric"><span>受益所有人暴露</span><strong>${percent(
        state.beneficialOwnerExposure,
      )}</strong></div>
      <div class="metric"><span>披露关注</span><strong>${number(
        state.disclosureAttention,
        2,
      )}</strong></div>
      <div class="metric"><span>家族办公室</span><strong>运行中</strong></div>
    `,
  }[world.player.roleType];

  return `
    <section class="panel">
      <p class="eyebrow">身份明细</p>
      <h2>${escapeHtml(world.player.roleLabel)}</h2>
      <p class="muted">${escapeHtml(world.player.identity)}</p>
      <div class="metric-grid">${detail}</div>
    </section>
  `;
}

function familyLiquidityLabel(value) {
  return {
    stable: '宽裕',
    watch: '偏紧',
    strained: '紧张',
    critical: '吃紧',
  }[String(value ?? '').toLowerCase()] ?? '正常';
}

function companyDisplayName(companyId) {
  return COMPANY_BY_ID[companyId]?.shortName ?? '当前企业';
}

function portfolioValue() {
  return Object.entries(world.player.holdings).reduce(
    (sum, [symbol, quantity]) =>
      sum + quantity * (world.market.securities[symbol]?.lastPrice ?? 0),
    0,
  );
}

function availableTradingCashView() {
  if (
    world.player.roleType === 'household' ||
    world.player.roleType === 'private_whale'
  ) {
    return Math.max(
      0,
      world.player.cash - world.player.roleState.cashReserve,
    );
  }
  if (institutionalPlayerRole(world.player.roleType)) {
    return Math.max(
      0,
      world.player.cash -
        world.player.roleState.liquidityReserveFloor,
    );
  }
  return world.player.cash;
}

function renderAccountCard() {
  const positionValue = portfolioValue();
  const netAssets =
    world.player.cash +
    positionValue +
    world.player.otherAssets -
    world.player.liabilities;
  const holdings = Object.entries(world.player.holdings)
    .map(([symbol, quantity]) => {
      const security = world.market.securities[symbol];
      return `
        <tr>
          <td>${escapeHtml(symbol)}</td>
          <td class="data-number">${number(quantity)}</td>
          <td class="data-number">${money(quantity * security.lastPrice)}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <section class="panel" data-testid="account-card">
      <div class="section-heading">
        <div>
          <p class="eyebrow">资产与可用资源</p>
          <h2>当前账户</h2>
        </div>
      </div>
      <div class="metric-grid">
        <div class="metric"><span>账户现金</span><strong data-testid="player-cash">${money(
          world.player.cash,
        )}</strong></div>
        <div class="metric"><span>可交易现金</span><strong>${money(
          availableTradingCashView(),
        )}</strong></div>
        <div class="metric"><span>股票市值</span><strong>${money(
          positionValue,
        )}</strong></div>
        <div class="metric"><span>负债／责任</span><strong>${money(
          world.player.liabilities,
        )}</strong></div>
        <div class="metric"><span>调查精力</span><strong data-testid="research-points">${
          world.player.resources.research
        }</strong></div>
        <div class="metric metric-wide"><span>估算净资产</span><strong>${money(
          netAssets,
        )}</strong></div>
      </div>
      <details class="expert-only">
        <summary>查看全部持仓</summary>
        <div class="table-wrap" tabindex="0">
          <table>
            <caption>估值基准：最近成交价</caption>
            <thead><tr><th>证券</th><th>股数</th><th>参考市值</th></tr></thead>
            <tbody>${holdings}</tbody>
          </table>
        </div>
      </details>
    </section>
  `;
}

function actorKindLabel(kind) {
  return {
    liquidity_provider: '流动性',
    market_maker: '流动性',
    institution: '机构',
    broker: '交易台',
    retail: '交易者',
  }[kind] ?? '市场主体';
}

function renderObservableActorNodes(nodes) {
  return nodes
    .filter((node) => node.kind === 'actor')
    .map(
      (node) => `
        <button class="world-node world-node-actor" type="button"
          style="--node-x:${node.x}%;--node-y:${node.y}%;--node-weight:${node.weight};--node-tension:${node.tension}"
          data-action="route" data-route="market"
          aria-label="${escapeHtml(node.label)}，最近公开活动 ${
            node.activityCount
          } 次">
          <span class="actor-pulse" aria-hidden="true"></span>
          <small>${escapeHtml(actorKindLabel(node.actorKind))}</small>
          <strong>${escapeHtml(node.label)}</strong>
          <span><b>${node.activityCount}</b> 次活动</span>
        </button>
      `,
    )
    .join('');
}

function compactMoney(value) {
  const amount = Number(value) || 0;
  if (Math.abs(amount) >= 100_000_000_000) {
    return `${number(amount / 100_000_000_000, 2)} 千亿`;
  }
  if (Math.abs(amount) >= 100_000_000) {
    return `${number(amount / 100_000_000, 2)} 亿`;
  }
  if (Math.abs(amount) >= 10_000) {
    return `${number(amount / 10_000, 1)} 万`;
  }
  return money(amount);
}

function renderWorldMarketPulse(market, actorNodes) {
  const movers = market.topMovers
    .map(
      (company) => `
        <div class="world-market-row">
          <button type="button" class="world-market-row__quote"
            data-action="choose-security"
            data-symbol="${escapeHtml(company.symbol)}"
            aria-label="打开 ${escapeHtml(company.companyName)} 股票行情">
            <span>
              <strong>${escapeHtml(company.companyName)}</strong>
              <small>${escapeHtml(company.displayCode)} · ${escapeHtml(
                company.boardLabel,
              )}${
                company.riskLabel
                  ? ` · ${escapeHtml(company.riskLabel)}`
                  : ''
              }</small>
            </span>
            <span class="data-number">
              <strong>${money(company.lastPriceTicks / 100)}</strong>
              <small class="${marketDirectionClass(company.deltaBps)}">${
                company.deltaBps >= 0 ? '+' : ''
              }${number(company.deltaBps / 100, 2)}%</small>
            </span>
          </button>
          <button type="button" class="world-inline-link"
            data-action="open-company-information"
            data-company-id="${escapeHtml(company.companyId)}"
            data-section="quote">档案 ↗</button>
        </div>
      `,
    )
    .join('');
  const actors = actorNodes.length
    ? actorNodes
        .slice(0, 3)
        .map(
          (actor) => `
            <button type="button" data-action="open-market-mode"
              data-market-mode="stocks">
              <span>${escapeHtml(actor.label)}</span>
              <strong>${number(actor.activityCount)} 次公开活动</strong>
            </button>
          `,
        )
        .join('')
    : '<span>当前公开席位活动尚未形成可披露聚合。</span>';
  return `
    <section class="world-overview-card world-market-pulse"
      data-testid="world-market-pulse">
      <header class="world-card-heading">
        <div><small>股票市场</small><h2>全市场脉搏</h2></div>
        <button type="button" data-action="open-market-mode"
          data-market-mode="stocks">进入股票行情 ↗</button>
      </header>
      <div class="world-pulse-metrics">
        <span><small>上涨</small><strong class="market-up">${number(
          market.advancers,
        )}</strong></span>
        <span><small>下跌</small><strong class="market-down">${number(
          market.decliners,
        )}</strong></span>
        <span><small>平盘</small><strong>${number(market.unchanged)}</strong></span>
        <span><small>涨停 / 跌停</small><strong>${number(
          market.limitUpCount,
        )} / ${number(market.limitDownCount)}</strong></span>
        <span><small>全场成交额</small><strong>${compactMoney(
          market.totalTurnoverCents / 100,
        )}</strong></span>
      </div>
      <div class="world-market-list">${movers}</div>
      <div class="world-actor-activity" data-testid="world-actor-layer"
        aria-label="公开市场主体活动">
        ${actors}
      </div>
    </section>
  `;
}

function renderWorldEconomyNetwork(economy, network) {
  const relationshipLabels = {
    supplier: '供应交付',
    customer: '客户需求',
    credit: '信用融资',
    investment: '投资敞口',
  };
  const pressures = network.pressures.length
    ? network.pressures
        .map(
          (pressure) => `
            <button type="button" class="world-network-row"
              data-action="open-company-information"
              data-company-id="${escapeHtml(pressure.companyId)}"
              data-section="supply-demand">
              <span>
                <strong>${escapeHtml(pressure.companyName)}</strong>
                <small>${escapeHtml(
                  pressure.counterpartyName
                    ? `${pressure.counterpartyName} · ${
                        relationshipLabels[pressure.relationship] || '经营关联'
                      }`
                    : '综合经营传导',
                )}</small>
              </span>
              <em>${number(pressure.deviationBps / 100, 2)}%</em>
            </button>
          `,
        )
        .join('')
    : '<p class="world-card-empty">当前产业链传导接近中性；点击查看完整关联网络。</p>';
  return `
    <section class="world-overview-card world-economy-network"
      data-testid="world-economy-network">
      <header class="world-card-heading">
        <div><small>实体经济</small><h2>${escapeHtml(economy.regime)}</h2></div>
        <button type="button" data-action="route"
          data-route="information">产业与公司网络 ↗</button>
      </header>
      <div class="world-economy-metrics">
        <span><small>工业周期</small><strong>${number(
          economy.industrialCycle,
          3,
        )}</strong></span>
        <span><small>发展指数</small><strong>${number(
          economy.developmentIndex,
          3,
        )}</strong></span>
        <span><small>技术前沿</small><strong>${number(
          economy.technologyFrontier,
          3,
        )}</strong></span>
        <span><small>需求潜力</small><strong>${number(
          economy.potentialDemandIndex,
          3,
        )}</strong></span>
        <span><small>无风险利率</small><strong>${number(
          economy.riskFreeRateBps / 100,
          2,
        )}%</strong></span>
        <span><small>信用利差</small><strong>${number(
          economy.creditSpreadBps / 100,
          2,
        )}%</strong></span>
      </div>
      <div class="world-network-summary">
        <div><strong>经营传导</strong><small>${number(
          network.edgeCount,
        )} 条有类型关系 · 第 ${number(
          network.lastSettledTick,
        )} 日结算</small></div>
        ${pressures}
      </div>
    </section>
  `;
}

function renderWorldDerivativesPulse(derivatives) {
  return `
    <section class="world-overview-card world-derivatives-pulse"
      data-testid="world-derivatives-pulse">
      <header class="world-card-heading">
        <div><small>跨资产市场</small><h2>期货与期权</h2></div>
        <span>${number(derivatives.tradeCount)} 笔真实成交</span>
      </header>
      <div class="world-derivative-metrics">
        <span><small>期货合约</small><strong>${number(
          derivatives.futuresCount,
        )}</strong></span>
        <span><small>期权合约</small><strong>${number(
          derivatives.optionsCount,
        )}</strong></span>
        <span><small>有限市场主体</small><strong>${number(
          derivatives.actorCount,
        )}</strong></span>
        <span><small>实时订单簿</small><strong>${number(
          derivatives.liveBookCount,
        )}</strong></span>
        <span><small>跳跃风险</small><strong>${number(
          derivatives.jumpRiskBps / 100,
          2,
        )}%</strong></span>
        <span><small>流动性风险</small><strong>${number(
          derivatives.liquidityRiskBps / 100,
          2,
        )}%</strong></span>
      </div>
      <div class="world-card-actions">
        <button type="button" data-action="open-market-mode"
          data-market-mode="futures">期货行情与交易 ↗</button>
        <button type="button" data-action="open-market-mode"
          data-market-mode="options">期权行情与交易 ↗</button>
      </div>
    </section>
  `;
}

function renderWorldBriefing(briefing) {
  return `
    <section class="world-overview-card world-public-briefing"
      data-testid="world-public-briefing">
      <header class="world-card-heading">
        <div><small>事实优先</small><h2>公开简报</h2></div>
        <button type="button" data-action="route"
          data-route="history">全部世界记录 ↗</button>
      </header>
      <div class="world-briefing-list">
        ${briefing
          .map(
            (item) => `
              <button type="button"
                data-action="open-company-information"
                ${
                  item.companyId
                    ? `data-company-id="${escapeHtml(item.companyId)}"`
                    : ''
                }
                data-section="${escapeHtml(item.route.section || 'disclosures')}">
                <span>${escapeHtml(item.category)}</span>
                <strong>${escapeHtml(item.title)}</strong>
                <small>第 ${number(item.tick)} 日 · ${escapeHtml(
                  item.sourceLabel,
                )}</small>
              </button>
            `,
          )
          .join('')}
      </div>
    </section>
  `;
}

function renderWorldCompanyUniverse(companies) {
  return `
    <details class="world-company-universe" open
      data-testid="world-company-universe">
      <summary>
        <span><small>完整上市公司体系</small><strong>${number(
          companies.length,
        )} 家公司 · 四个板块 · 经营关系实时结算</strong></span>
        <span>展开 / 收起</span>
      </summary>
      <div class="world-company-table" tabindex="0">
        <table>
          <thead><tr><th>公司</th><th>板块</th><th>行业</th><th>现价</th><th>涨跌</th><th>市值</th><th>产业传导</th><th>入口</th></tr></thead>
          <tbody>
            ${companies
              .map(
                (company) => `
                  <tr>
                    <th scope="row">
                      <strong>${escapeHtml(company.companyName)}</strong>
                      <small>${escapeHtml(company.displayCode)}${
                        company.riskLabel
                          ? ` · ${escapeHtml(company.riskLabel)}`
                          : ''
                      }</small>
                    </th>
                    <td>${escapeHtml(company.boardLabel)}</td>
                    <td>${escapeHtml(company.industry)}</td>
                    <td class="data-number">${money(
                      company.lastPriceTicks / 100,
                    )}</td>
                    <td class="data-number ${marketDirectionClass(
                      company.deltaBps,
                    )}">${company.deltaBps >= 0 ? '+' : ''}${number(
                      company.deltaBps / 100,
                      2,
                    )}%</td>
                    <td class="data-number">${compactMoney(
                      company.marketCapCents / 100,
                    )}</td>
                    <td>${
                      company.networkDeviationBps > 0
                        ? `${number(
                            company.networkDeviationBps / 100,
                            2,
                          )}% · ${number(company.networkCauseCount)} 项`
                        : '中性'
                    }</td>
                    <td><span class="world-company-actions">
                      <button type="button" data-action="choose-security"
                        data-symbol="${escapeHtml(company.symbol)}">交易</button>
                      <button type="button" data-action="open-company-information"
                        data-company-id="${escapeHtml(company.companyId)}">档案</button>
                    </span></td>
                  </tr>
                `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </details>
  `;
}

function currentWorld2DProjection() {
  return world?.experience?.world2d ?? null;
}

function currentEntertainmentProjection() {
  return world?.experience?.entertainment ?? null;
}

function currentOpenWorldCityProjection() {
  return world?.experience?.openWorldCity ?? null;
}

function compileOpenWorldCityRequestFromDataset(dataset) {
  const kind = dataset.openWorldKind;
  const version = Number(dataset.openWorldVersion);
  if (
    ![
      'move_to',
      'accept_offer',
      'join_activity',
      'board_transit',
      'use_asset',
    ].includes(kind) ||
    !Number.isSafeInteger(version)
  ) {
    return null;
  }
  if (kind === 'move_to') {
    if (!dataset.openWorldRoute || !dataset.openWorldPlace) return null;
    return {
      kind,
      routeId: dataset.openWorldRoute,
      routeVersion: version,
      toPlaceId: dataset.openWorldPlace,
    };
  }
  if (kind === 'accept_offer') {
    const quantity = Number(dataset.openWorldQuantity);
    if (
      !dataset.openWorldOffer ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    ) {
      return null;
    }
    return {
      kind,
      offerId: dataset.openWorldOffer,
      offerVersion: version,
      quantity,
    };
  }
  if (kind === 'join_activity') {
    if (!dataset.openWorldActivity) return null;
    return {
      kind,
      activityId: dataset.openWorldActivity,
      activityVersion: version,
    };
  }
  if (kind === 'board_transit') {
    const seats = Number(dataset.openWorldSeats);
    if (
      !dataset.openWorldRun ||
      !Number.isSafeInteger(seats) ||
      seats <= 0
    ) {
      return null;
    }
    return {
      kind,
      runId: dataset.openWorldRun,
      runVersion: version,
      seats,
    };
  }
  if (!dataset.openWorldAsset || !dataset.openWorldAffordance) return null;
  return {
    kind,
    assetId: dataset.openWorldAsset,
    assetVersion: version,
    affordanceId: dataset.openWorldAffordance,
  };
}

function world2dWeatherLabel(environmentState) {
  const weather = {
    light_rain: '小雨',
    rain: '雨',
    clear: '晴',
    cloudy: '多云',
    overcast: '阴',
  }[environmentState?.weather] ?? '天气变化中';
  const light = {
    morning: '清晨',
    day: '白天',
    evening: '傍晚',
    night: '夜间',
  }[environmentState?.light] ?? '';
  return `${light} · ${weather}`;
}

function renderWorld2DEntertainment(entertainment) {
  if (!entertainment?.schema) return '';
  const offers = (entertainment.executableOffers ?? [])
    .map(
      (offer) => `
        <button type="button" class="world2d-entertainment-action"
          data-action="entertainment-intent"
          data-entertainment-kind="accept_offer"
          data-entertainment-id="${escapeHtml(offer.offerId)}"
          data-entertainment-version="${offer.offerVersion}"
          data-testid="entertainment-offer-${escapeHtml(offer.offerId)}">
          <span><small>本地消费 · 余 ${number(
            offer.availableQuantity,
          )} 份</small><strong>${escapeHtml(offer.labelZh)}</strong></span>
          <span><b>${money(offer.unitPriceCents / 100)}</b><em>付款体验 ↗</em></span>
          <p>${escapeHtml(offer.descriptionZh)}</p>
        </button>
      `,
    )
    .join('');
  const activities = (entertainment.activityOptions ?? [])
    .map(
      (activity) => `
        <button type="button" class="world2d-entertainment-action"
          data-action="entertainment-intent"
          data-entertainment-kind="join_activity"
          data-entertainment-id="${escapeHtml(activity.activityId)}"
          data-entertainment-version="${activity.activityVersion}"
          data-testid="entertainment-activity-${escapeHtml(
            activity.activityId,
          )}">
          <span><small>现场活动 · ${number(
            activity.durationMs / 60_000,
          )} 分钟</small><strong>${escapeHtml(activity.labelZh)}</strong></span>
          <span><b>免费</b><em>参加活动 ↗</em></span>
          <p>${escapeHtml(activity.descriptionZh)}</p>
        </button>
      `,
    )
    .join('');
  const recent = (entertainment.recentOutcomes ?? [])
    .slice(-3)
    .reverse()
    .map(
      (outcome) => `
        <li>${
          outcome.outcomeKind === 'activity_completed'
            ? `完成${escapeHtml(outcome.labelZh)}。`
            : `已享用${escapeHtml(outcome.labelZh)}。`
        }</li>
      `,
    )
    .join('');
  const hasLocalActions = Boolean(offers || activities);
  return `
    <section class="world2d-entertainment"
      data-testid="world2d-entertainment">
      <header>
        <div><span class="eyebrow">开放世界生活</span>
          <strong>${hasLocalActions ? '此刻可以享受' : '走进城市，才会发生'}</strong></div>
        <span>${entertainment.currentPlaceId ? '已到达' : '移动中'}</span>
      </header>
      <div class="world2d-entertainment-metrics">
        <span data-testid="entertainment-metric-wellbeing"
          data-value="${entertainment.metrics.wellbeing}"><small>愉悦</small><strong>${number(
            entertainment.metrics.wellbeing,
          )}</strong></span>
        <span><small>熟悉度</small><strong>${number(
          entertainment.metrics.cityFamiliarity,
        )}</strong></span>
        <span><small>社交活力</small><strong>${number(
          entertainment.metrics.socialEnergy,
        )}</strong></span>
      </div>
      <div class="world2d-entertainment-actions">
        ${
          hasLocalActions
            ? `${activities}${offers}`
            : '<p>走到河岸、球场、早餐店或公交站，现场内容才会出现。</p>'
        }
      </div>
      ${recent ? `<ul class="world2d-entertainment-recent">${recent}</ul>` : ''}
    </section>
  `;
}

function renderTodayView() {
  const spatial = currentWorld2DProjection();
  if (!spatial?.scene || !spatial?.playerPose) {
    return `
      <section class="panel panel-enter" data-testid="world2d-stage">
        <div class="empty-state">
          <strong>正在连接当前地点</strong>
          <span>世界权威状态尚未送达。</span>
        </div>
      </section>
    `;
  }
  const view = projectWorldExperience(world, marketSnapshot, {
    includeSignals: false,
  });
  const wealth = projectPlayerWealth(world, marketSnapshot);
  const wealthMarkup = renderPlayerWealth(wealth, {
    variant: 'home',
  });
  const life = getLifeProjection(world);
  const entertainment = currentEntertainmentProjection();
  const openWorldCity = currentOpenWorldCityProjection();
  const outdoor = spatial.scene.id === 'jiangwan_outdoor';
  const legacyEntertainmentOwnsLocalActions = Boolean(
    entertainment?.executableOffers?.length ||
      entertainment?.activityOptions?.length,
  );
  const clockText = virtualClockText(
    marketSnapshot?.nowMs,
    marketSnapshot?.marketClockOffsetMs,
  );
  const semanticObjects = spatial.interactables
    .map(
      (entry) => `
        <li>
          <strong>${escapeHtml(entry.labelZh)}</strong>
          <span>${escapeHtml(entry.hintZh)}</span>
        </li>
      `,
    )
    .join('');
  const actionButtons = spatial.interactables
    .map((entry) => {
      const nearby = entry.distanceQ <= entry.maxDistanceQ;
      const distance = number(
        entry.distanceQ / spatial.scene.coordinateScale,
        1,
      );
      return `
        <button class="world2d-interaction ${nearby ? 'is-nearby' : ''}"
          type="button" data-action="world2d-interaction"
          data-entity-id="${escapeHtml(entry.entityId)}"
          data-target-anchor="${escapeHtml(entry.standAnchorId)}"
          data-testid="world2d-action-${escapeHtml(entry.entityId)}"
          ${entry.available ? '' : 'disabled'}>
          <span class="world2d-object-verb">${escapeHtml(entry.verbZh)}</span>
          <strong>${escapeHtml(entry.labelZh)}</strong>
          <span class="world2d-object-hint" data-world2d-distance="${escapeHtml(
            entry.entityId,
          )}">${
            entry.available
              ? nearby
                ? '就在身边 · 点击互动'
                : `相距 ${distance} 米 · 点击走过去`
              : escapeHtml(entry.unavailableReason)
          }</span>
        </button>
      `;
    })
    .join('');

  return `
    <section class="world2d-stage panel-enter" data-testid="world2d-stage"
      data-scene-id="${escapeHtml(spatial.scene.id)}"
      aria-labelledby="world2d-location-title">
      <header class="world2d-hud">
        <div>
          <span class="world-running-dot ${
            playbackState === 'running' ? '' : 'is-paused'
          }" aria-hidden="true"></span>
          <span class="eyebrow">${escapeHtml(spatial.scene.districtZh)}</span>
          <h1 id="world2d-location-title">${escapeHtml(spatial.scene.nameZh)}</h1>
          <span>${escapeHtml(
            world2dWeatherLabel(spatial.scene.environmentState),
          )} · <span data-world-bind="scene-clock">${clockText}</span></span>
        </div>
        <div class="world2d-vitals" aria-label="当前生活状态">
          <span><small>现金</small><strong data-world-bind="cash">${money(
            wealth.cash.totalCents / 100,
          )}</strong></span>
          <span><small>${life.kind === 'organization' ? '人员状态' : '精力'}</small><strong>${number(
            life.energy,
          )}</strong></span>
          <span><small>身份</small><strong>${escapeHtml(world.player.roleLabel)}</strong></span>
        </div>
      </header>

      <div class="world2d-layout">
        <div class="world2d-canvas-shell">
          <canvas class="world2d-canvas" tabindex="0"
            data-testid="world2d-canvas"
            data-authority-x="${spatial.playerPose.positionQ.x}"
            data-authority-y="${spatial.playerPose.positionQ.y}"
            aria-label="${escapeHtml(spatial.scene.nameZh)}可移动场景。使用方向键或 WASD 行走，点击场景内目标前往。"></canvas>
          <div class="world2d-controls-hint" aria-hidden="true">
            <span>方向键 / WASD 行走</span>
            <span>点击目标前往</span>
          </div>
          <div class="world2d-place-strip">
            ${
              outdoor
                ? `
                  <span><strong>街区</strong> 道路、步道与建筑形成真实碰撞空间</span>
                  <span><strong>地点</strong> ${number(
                    spatial.scene.places?.length ?? 0,
                  )} 个可达生活、娱乐与交通节点</span>
                  <span><strong>世界</strong> 天气、人流与营业状态服从同一世界时间</span>
                `
                : `
                  <span><strong>窗外</strong> 江湾里街区正在下小雨</span>
                  <span><strong>室内</strong> 家具会影响可行走空间</span>
                  <span><strong>世界</strong> 离开终端后时间仍继续</span>
                `
            }
          </div>
        </div>

        <aside class="world2d-side" aria-label="地点互动与状态">
          ${
            outdoor
              ? renderOpenWorldCityPanel(openWorldCity, {
                  actionsVisible: !legacyEntertainmentOwnsLocalActions,
                })
              : ''
          }
          ${renderWorldlinePanel(view.worldline, {
            variant: 'today',
          })}
          <section class="world2d-nearby" data-testid="world2d-nearby-actions">
            <header>
              <span class="eyebrow">当前地点</span>
              <strong>可以做什么</strong>
            </header>
            <div class="world2d-action-grid">${actionButtons}</div>
          </section>
          ${renderWorld2DEntertainment(entertainment)}
          <details class="world2d-semantic-scene"
            data-testid="world2d-semantic-scene">
            <summary>这里有什么</summary>
            <ul>${semanticObjects}</ul>
          </details>
          <section class="world2d-life-glance">
            <header><strong>今天的生活</strong></header>
            <div>
              <span><small>住房</small><strong>${escapeHtml(life.homeLabel)}</strong></span>
              <span><small>已拥有</small><strong>${number(life.possessions?.length ?? 0)} 件</strong></span>
              <span><small>应办事项</small><strong>${number(life.pendingObligations?.length ?? 0)} 项</strong></span>
            </div>
          </section>
          <div class="world2d-wealth" data-testid="player-wealth-home-live">
            ${wealthMarkup}
          </div>
        </aside>
      </div>

      <div class="world2d-authority-note" role="status" aria-live="polite">
        <span data-testid="world2d-position">位置 ${spatial.playerPose.positionQ.x}, ${spatial.playerPose.positionQ.y}</span>
        <span>移动、碰撞与互动结果由同一个世界保存</span>
      </div>
    </section>
  `;
}

function renderClueCards(clues) {
  if (!clues.length) {
    return `
      <div class="empty-state">
        <strong>暂时没有新消息</strong>
      </div>
    `;
  }
  return clues
    .map((clue) => {
      const company = COMPANY_BY_ID[clue.companyId];
      const verified = clue.status === 'verified';
      return `
        <article class="card clue-card" data-quality="${escapeHtml(clue.quality)}"
          data-testid="clue-card">
          <div class="tag-row">
            <span class="tag ${verified ? 'tag-verified' : 'tag-claim'}">
              ${verified ? '已查明' : '待查'}
            </span>
            <span class="tag">${escapeHtml(
              QUALITY_LABELS[clue.quality] ?? '来源待核对',
            )}</span>
            <span class="tag">${escapeHtml(company?.shortName ?? '相关企业')}</span>
          </div>
          <h3>${escapeHtml(clue.title)}</h3>
          <p>${escapeHtml(clue.summary)}</p>
          <div class="clue-meta">
            <span>消息来自：${escapeHtml(clue.source)}</span>
            <span>时间：第 ${clue.publishedTick} 日</span>
            <span>还不知道：${escapeHtml(clue.missing)}</span>
            <span>调查需要：${clue.verificationCost} 点精力</span>
          </div>
          ${
            verified
              ? `
                <p class="tag tag-verified">
                  调查结果：${escapeHtml(
                    VERDICT_LABELS[clue.verdict] ?? '仍需观察',
                  )}
                </p>
              `
              : `
                <button class="button" type="button" data-action="verify-clue"
                  data-clue-id="${escapeHtml(clue.id)}" data-testid="verify-clue"
                  ${world.player.resources.research < clue.verificationCost ? 'disabled' : ''}>
                  花费 ${clue.verificationCost} 点精力调查
                </button>
              `
          }
        </article>
      `;
    })
    .join('');
}

function roleStatusMetrics() {
  const state = world.player.roleState;
  if (
    world.player.roleType === 'household' ||
    world.player.roleType === 'private_whale'
  ) {
    return [
      ['储备边界', money(state.cashReserve)],
      ['可交易现金', money(availableTradingCashView())],
      [
        world.player.roleType === 'private_whale'
          ? '受益所有人暴露'
          : '周期收入',
        world.player.roleType === 'private_whale'
          ? percent(state.beneficialOwnerExposure)
          : money(state.monthlyIncome),
      ],
      [
        world.player.roleType === 'private_whale'
          ? '披露关注'
          : '周期支出',
        world.player.roleType === 'private_whale'
          ? number(state.disclosureAttention, 2)
          : money(state.livingExpense),
      ],
    ];
  }
  if (world.player.roleType === 'professional') {
    return [
      ['受托规模', money(state.mandateCapital)],
      ['回撤边界', percent(state.drawdownLimit, 0)],
      ['考核周期', `${number(state.evaluationHorizon)} 日`],
      ['职业声誉', number(state.reputation, 1)],
    ];
  }
  if (world.player.roleType === 'operator') {
    const company = world.entities.companies[state.controlledCompanyId];
    return [
      ['控制企业', company?.shortName ?? '当前企业'],
      ['经营权限', percent(state.operatingAuthority, 0)],
      ['扩张信用', money(state.expansionCredit)],
      [
        '经营现金',
        money(
          Math.max(
            0,
            Number(company?.cash ?? 0) -
              Number(company?.operations?.reservedCash ?? 0),
          ),
        ),
      ],
    ];
  }
  return [
    ['管理资产', money(state.assetsUnderManagement)],
    ['流动性缓冲', percent(state.liquidityBufferRatio, 0)],
    ['赎回压力', percent(state.redemptionPressure)],
    ['组合集中度', percent(state.concentration)],
  ];
}

function lifePresentation(item, organization) {
  if (!organization) return item;
  return {
    meal_box: {
      ...item,
      label: '团队餐食',
      description: '补充当班餐食。',
    },
    coffee: {
      ...item,
      label: '工作补给',
      description: '缓解短时工作负荷。',
    },
    transit_card: {
      ...item,
      label: '差旅额度',
      description: '补充外勤与差旅安排。',
    },
    home_goods: {
      ...item,
      label: '办公耗材',
      description: '改善工作环境。',
    },
  }[item.id] ?? item;
}

function lifeImage(item, alt, className = '') {
  return `
    <img class="${escapeHtml(className)}"
      src="${escapeHtml(item.image)}"
      alt="${escapeHtml(alt)}"
      width="768" height="768"
      loading="lazy" decoding="async" />
  `;
}

function lifeUseValueText(item) {
  const entries = [];
  const values = item.useValue ?? {};
  if (values.energy) entries.push(`精力 +${number(values.energy)}`);
  if (values.satiety) entries.push(`饱腹 +${number(values.satiety)}`);
  if (values.comfort) entries.push(`舒适 +${number(values.comfort)}`);
  if (values.mobility) entries.push(`出行 +${number(values.mobility)}`);
  if (values.health) entries.push(`健康 +${number(values.health)}`);
  if (values.restBonus) entries.push('休息更充分');
  if (values.workBonus) entries.push('工作更顺手');
  if (values.satietyDecayReduction) entries.push('食物更耐用');
  if (values.energyDecayReduction) entries.push('出门更省力');
  if (values.mobilityDecayReduction) entries.push('通勤更轻松');
  if (values.healthDecayReduction) entries.push('恢复更稳定');
  return entries.slice(0, 2).join(' · ') || '满足日常所需';
}

function lifeProductDetails(item) {
  if (item.assetType === 'service') {
    return `${number(item.termWorldDays)} 日 · ${number(
      item.serviceUses,
    )} 次 · ${lifeUseValueText(item)}`;
  }
  if (item.assetType === 'subscription') {
    return `${number(item.termWorldDays)} 日 · ${lifeUseValueText(item)}`;
  }
  if (item.assetType === 'consumable') {
    return `${item.space > 0 ? `占 ${number(item.space)} 格 · ` : ''}${lifeUseValueText(item)}`;
  }
  const details = [
    `耐用 ${number(item.durability)}`,
    item.space > 0 ? `占 ${number(item.space)} 格` : null,
    item.parking > 0 ? `车位 ${number(item.parking)}` : null,
    item.capacity > 0 ? `空间 ${number(item.capacity)} 格` : null,
    item.upkeepPerCycle > 0
      ? `每十日约 ${money(item.upkeepPerCycle)}`
      : null,
  ].filter(Boolean);
  return details.join(' · ');
}

function lifeOwnedCount(life, item) {
  if (item.assetType === 'durable') {
    return life.possessions.filter(
      (possession) => possession.itemId === item.id,
    ).length;
  }
  if (item.assetType === 'subscription') {
    return life.subscriptions[item.id] ? 1 : 0;
  }
  if (item.assetType === 'service') {
    return life.serviceContracts[item.id]?.usesRemaining ?? 0;
  }
  return life.inventory[item.id] ?? 0;
}

function activeLifeAssetId(life, category) {
  const key = {
    housing: 'homeId',
    vehicle: 'vehicleId',
    phone: 'phoneId',
    computer: 'computerId',
    clothing: 'clothingId',
  }[category];
  return key ? life.active[key] : null;
}

function organizationOperationLabel(roleType) {
  return roleType === 'operator' ? '企业运营' : '机构运营';
}

function renderLifePossessionCard(life, possession) {
  const item = lifePresentation(
    LIFE_ITEM_BY_ID[possession.itemId],
    life.kind === 'organization',
  );
  const isPlaced =
    item.space > 0 &&
    possession.placedHomeId === life.active.homeId;
  const isActive =
    activeLifeAssetId(life, possession.category) ===
    possession.instanceId;
  const requiresPlacement =
    item.assetType === 'durable' &&
    item.category !== 'housing' &&
    item.category !== 'clothing' &&
    Number(item.space) > 0;
  const canActivate = [
    'housing',
    'vehicle',
    'phone',
    'computer',
    'clothing',
  ].includes(possession.category) &&
    (!requiresPlacement || isPlaced);
  const canUse =
    (!requiresPlacement || isPlaced) &&
    ['energy', 'satiety', 'comfort', 'mobility', 'health'].some(
      (metric) => Number(item.useValue?.[metric] ?? 0) !== 0,
    );
  const stateLabel = isPlaced
    ? '已摆放'
    : isActive
      ? '常用中'
      : possession.locationId === life.role.storagePlaceId
        ? '在库位'
        : possession.locationId === life.role.parkingPlaceId
          ? '在车位'
          : '已持有';
  return `
    <article class="life-owned-card"
      data-life-possession-item="${escapeHtml(item.id)}"
      data-life-owned-category="${escapeHtml(item.category)}">
      <div class="life-owned-image">
        ${lifeImage(item, item.label)}
        <span>${escapeHtml(
          LIFE_CATEGORY_LABELS[item.category] ?? '物品',
        )}</span>
      </div>
      <div class="life-owned-copy">
        <div>
          <strong>${escapeHtml(item.label)}</strong>
          <small>${stateLabel} · 状态 ${number(possession.condition)}${
            Number(possession.carryingValue) > 0
              ? ` · 账面 ${money(possession.carryingValue)}`
              : ''
          }</small>
        </div>
        <p>${escapeHtml(lifeUseValueText(item))}</p>
        ${renderCityAssetActions({
          possession,
          item,
          placed: isPlaced,
          active: isActive,
          canActivate,
          canUse,
        })}
      </div>
    </article>
  `;
}

function renderLifeRoomScene(life, organization) {
  const activeHome = life.possessions.find(
    (possession) => possession.instanceId === life.active.homeId,
  );
  const homeItem =
    LIFE_ITEM_BY_ID[activeHome?.itemId] ??
    LIFE_CATALOG.find((item) => item.category === 'housing');
  const featured = ['housing', 'vehicle', 'phone', 'computer']
    .map((category) => {
      const activeId = activeLifeAssetId(life, category);
      return (
        life.possessions.find(
          (possession) => possession.instanceId === activeId,
        ) ??
        life.possessions.find(
          (possession) => possession.category === category,
        )
      );
    })
    .filter(Boolean);
  return `
    <section class="life-room-scene" data-testid="life-room-scene">
      <figure class="life-room-backdrop">
        ${lifeImage(
          homeItem,
          organization ? '当前运营空间' : '当前住处',
          'life-room-image',
        )}
        <figcaption>
          <span>${escapeHtml(homeItem.label)}</span>
          <b>${number(life.space.used)} / ${number(
            life.space.capacity,
          )} 格</b>
        </figcaption>
      </figure>
      <div class="life-scene-assets" aria-label="当前常用物品">
        ${featured
          .map((possession) => {
            const item = LIFE_ITEM_BY_ID[possession.itemId];
            return `
              <div class="life-scene-token"
                data-life-owned-category="${escapeHtml(possession.category)}">
                ${lifeImage(item, '')}
                <span>${escapeHtml(item.label)}</span>
                <b>${number(possession.condition)}</b>
              </div>
            `;
          })
          .join('')}
      </div>
    </section>
  `;
}

function renderLifeShop(life, organization) {
  const category = LIFE_CATEGORY_LABELS[lifeShopCategory]
    ? lifeShopCategory
    : 'food';
  const products = LIFE_CATALOG
    .filter(
      (item) =>
        item.category === category &&
        item.eligibleRoles.includes(
          lifeEligibilityRole(world.player.roleType),
        ),
    )
    .map((item) => lifePresentation(item, organization));
  const hero = products[0];
  return `
    <section class="life-card life-shop" data-testid="life-shop">
      <div class="life-card-head">
        <div>
          <small>${organization ? '城市供给' : '街区商店'}</small>
          <strong>商店</strong>
        </div>
        <span>现金 ${money(world.player.cash)}</span>
      </div>
      <nav class="life-category-rail" aria-label="商品分类">
        ${LIFE_CATEGORY_ORDER.map(
          (key) => `
            <button type="button" data-action="life-category"
              data-life-category="${key}"
              aria-pressed="${category === key ? 'true' : 'false'}">
              ${LIFE_CATEGORY_LABELS[key]}
            </button>
          `,
        ).join('')}
      </nav>
      <div class="life-shop-hero">
        ${lifeImage(hero, `${LIFE_CATEGORY_LABELS[category]}陈列`)}
        <div>
          <small>${LIFE_CATEGORY_LABELS[category]}</small>
          <strong>${escapeHtml(hero.label)}</strong>
          <span>${escapeHtml(lifeUseValueText(hero))}</span>
        </div>
      </div>
      <div class="life-product-grid">
        ${products
          .map((item) => {
            const quantity = lifeOwnedCount(life, item);
            const stock = life.shopStock[item.id] ?? 0;
            const currentPrice = life.prices[item.id] ?? item.price;
            const ownedText =
              item.assetType === 'durable'
                ? `已有 ${number(quantity)}`
                : item.assetType === 'subscription'
                  ? quantity > 0
                    ? `有效至第 ${number(
                        life.subscriptions[item.id].expiresAtTick,
                    )} 日`
                    : '尚未开通'
                  : item.assetType === 'service'
                    ? quantity > 0
                      ? `剩余 ${number(quantity)} 次`
                      : '尚未预约'
                  : `随身 ${number(quantity)}`;
            return `
              <article class="life-product-card"
                data-life-product="${escapeHtml(item.id)}">
                <div class="life-product-image">
                  ${lifeImage(item, item.label)}
                  <span>${LIFE_TIER_LABELS[item.tier] ?? '日用'}</span>
                </div>
                <div class="life-product-copy">
                  <strong>${escapeHtml(item.label)}</strong>
                  <p>${escapeHtml(item.description)}</p>
                  <small>${escapeHtml(lifeProductDetails(item))}</small>
                  <em>库存 ${number(stock)} · ${ownedText}</em>
                </div>
                <button class="life-buy-button" type="button"
                  data-action="life-action"
                  data-life-command="buy_item"
                  data-life-item="${escapeHtml(item.id)}"
                  ${stock <= 0 || world.player.cash < currentPrice ? 'disabled' : ''}>
                  ${money(currentPrice)}
                </button>
              </article>
            `;
          })
          .join('')}
      </div>
    </section>
  `;
}

function renderLifeInventory(life, organization) {
  const consumables = LIFE_CATALOG.filter(
    (item) => item.assetType === 'consumable',
  ).map((item) => ({
    ...lifePresentation(item, organization),
    quantity: life.inventory[item.id] ?? 0,
  }));
  return `
    <section class="life-card" data-testid="life-inventory">
      <div class="life-card-head">
        <div><small>随身</small><strong>补给与服务</strong></div>
        <span>${number(
          consumables.reduce(
            (sum, item) => sum + item.quantity,
            0,
          ),
        )} 件</span>
      </div>
      <div class="life-item-grid">
        ${consumables
          .map(
            (item) => `
              <article class="life-item">
                <div>
                  <strong>${escapeHtml(item.label)}</strong>
                  <span>${escapeHtml(lifeUseValueText(item))}</span>
                  <small>数量 ${number(item.quantity)}</small>
                </div>
                <button type="button" data-action="life-action"
                  data-life-command="use_item"
                  data-life-item="${escapeHtml(item.id)}"
                  ${item.quantity <= 0 ? 'disabled' : ''}>
                  使用
                </button>
              </article>
            `,
          )
          .join('')}
      </div>
      ${renderCityServicePanel(life, LIFE_CATALOG)}
    </section>
  `;
}

function renderLifeView() {
  const life = getLifeProjection(world);
  const organization = life.kind === 'organization';
  const organizationLabel = organizationOperationLabel(
    world.player.roleType,
  );
  const metrics = [
    [organization ? '人员' : '精力', life.energy, 'energy'],
    [organization ? '服务' : '饱腹', life.satiety, 'satiety'],
    [organization ? '设施' : '舒适', life.comfort, 'comfort'],
    [organization ? '调度' : '出行', life.mobility, 'mobility'],
    [organization ? '韧性' : '健康', life.health, 'health'],
  ];
  const metricMarkup = metrics
    .map(
      ([label, value, key]) => `
        <div class="life-meter" data-life-meter="${key}">
          <span>${label}</span>
          <strong>${number(value)}</strong>
          <i aria-hidden="true"><b style="width:${Math.max(
            0,
            Math.min(100, value),
          )}%"></b></i>
        </div>
      `,
    )
    .join('');
  let content;
  if (lifeSection === 'shop') {
    content = renderLifeShop(life, organization);
  } else if (lifeSection === 'bag') {
    content = renderLifeInventory(life, organization);
  } else {
    content = `
      <section class="life-card life-home" data-testid="life-home">
        <div class="life-card-head">
          <div>
            <small>${organization ? organizationLabel : '住处'}</small>
            <strong>${escapeHtml(life.homeLabel)}</strong>
          </div>
          <span>每十日约 ${money(
            life.responsibility.upkeepPerCycle,
          )}</span>
        </div>
        ${renderCityPlaceGrid(life)}
        ${renderLifeRoomScene(life, organization)}
        ${renderCityResponsibilityPanel(life)}
        <div class="life-owned-grid">
          ${life.possessions
            .map((possession) =>
              renderLifePossessionCard(life, possession),
            )
            .join('')}
        </div>
        ${renderCityServicePanel(life, LIFE_CATALOG)}
        <div class="life-home-action">
          <p>${
            organization
              ? '安排休整会恢复当班能力，也会消耗团队补给。'
              : '休息会恢复精力，也会消耗一些饱腹。'
          }</p>
          <button type="button" data-action="life-action"
            data-life-command="rest">
            ${organization ? '安排休整' : '休息'}
          </button>
        </div>
      </section>
    `;
  }
  return `
    <section class="life-studio panel-enter" data-testid="life-view">
      <header class="life-summary">
        <div>
          <small>${organization ? organizationLabel : '生活'}</small>
          <strong>${escapeHtml(world.player.profileName)}</strong>
        </div>
        <div class="life-meters">${metricMarkup}</div>
      </header>
      <nav class="life-tabs" aria-label="${organization ? '运营地点' : '生活地点'}">
        ${[
          ['home', organization ? '运营' : '住处'],
          ['shop', '商店'],
          ['bag', organization ? '资源' : '随身'],
        ]
          .map(
            ([section, label]) => `
              <button type="button" data-action="life-section"
                data-life-section="${section}"
                aria-pressed="${lifeSection === section ? 'true' : 'false'}">
                ${label}
              </button>
            `,
          )
          .join('')}
      </nav>
      ${content}
    </section>
    <div class="error-summary" role="alert">${escapeHtml(errorMessage)}</div>
  `;
}

function renderDecisionView() {
  const life = getLifeProjection(world);
  const socialCareer = getSocialCareerProjection(world);
  const work = {
    household: {
      place: '家中',
      title: '家庭账簿',
      shift: '完成一班日常事务',
    },
    professional: {
      place: '工作地点',
      title: '资管办公室',
      shift: '完成一班投研工作',
    },
    operator: {
      place: '工作地点',
      title: '企业现场',
      shift: '完成一班现场经营',
    },
    institution: {
      place: '工作地点',
      title: '机构总部',
      shift: '完成一班机构值守',
    },
    quant_institution: {
      place: '工作地点',
      title: '量化交易总部',
      shift: '完成一班研究、交易与风控协同',
    },
    stabilization_fund: {
      place: '工作地点',
      title: '稳定机制联席台',
      shift: '完成一班授权核验与市场值守',
    },
    private_whale: {
      place: '家族办公室',
      title: '私人资本总账',
      shift: '完成一班家族资本治理',
    },
  }[world.player.roleType];
  const workedToday = life.work.lastShiftTick === world.world.tick;
  const activeComputer = life.possessions.find(
    (possession) =>
      possession.instanceId === life.active.computerId,
  );
  const activePhone = life.possessions.find(
    (possession) => possession.instanceId === life.active.phoneId,
  );
  const statusMetrics = roleStatusMetrics()
    .map(
      ([label, value]) => `
        <div class="identity-status-item">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `,
    )
    .join('');
  const workTabs = `
    <nav class="life-tabs work-tabs" aria-label="工作页面">
      ${[
        ['desk', '工作台'],
        ['network', '人脉'],
        ['profile', '身份'],
      ]
        .map(
          ([section, label]) => `
            <button type="button" data-action="work-section"
              data-work-section="${section}"
              aria-pressed="${workSection === section ? 'true' : 'false'}">
              ${label}
            </button>
          `,
        )
        .join('')}
    </nav>
  `;
  const identitySurface = `
    <section class="identity-command-surface"
      data-testid="identity-command-surface">
      <header class="identity-command-head">
        <div>
          <small>${escapeHtml(world.player.profileName)}</small>
          <strong>${escapeHtml(world.player.roleLabel)}</strong>
        </div>
        <span>${money(
          world.player.capitalProfile.controlledCapitalCents / 100,
        )}</span>
      </header>
      <div class="identity-status-grid" data-testid="identity-status-grid">
        ${statusMetrics}
      </div>
      <div class="identity-resource-strip" data-testid="identity-resource-strip">
        <span>现金 <b>${money(world.player.cash)}</b></span>
        <span>可用 <b>${money(availableTradingCashView())}</b></span>
        <span>研究 <b>${number(world.player.resources.research)}</b></span>
        <span>注意力 <b>${number(world.player.resources.attention)}</b></span>
      </div>
    </section>
  `;
  const deskSurface = `
    <div class="panel identity-action">
      <div class="section-heading">
        <div>
          <p class="eyebrow">${work.place}</p>
          <h2>${work.title}</h2>
        </div>
      </div>
      ${renderRoleActionForm()}
    </div>
    <section class="panel life-work-panel" data-testid="life-work-panel">
      <div class="life-work-visual">
        ${lifeImage(
          LIFE_ITEM_BY_ID[activeComputer?.itemId] ??
            LIFE_ITEM_BY_ID.used_laptop,
          '当前工作设备',
        )}
        <div>
          <small>${escapeHtml(work.place)}</small>
          <strong>${escapeHtml(work.shift)}</strong>
          <span>起薪 ${money(life.work.baseIncome)}</span>
        </div>
      </div>
      <div class="life-work-resources">
        <span>精力 <b>${number(life.energy)}</b></span>
        <span>饱腹 <b>${number(life.satiety)}</b></span>
        <span>设备 <b>${number(
          activeComputer?.condition ?? 0,
        )}</b></span>
        <span>手机 <b>${number(
          activePhone?.condition ?? 0,
        )}</b></span>
      </div>
      <div class="life-work-settlement">
        <div>
          <small>已完成 ${number(life.work.shiftsCompleted)} 班</small>
          <strong data-testid="life-work-cash">${money(
            world.player.cash,
          )}</strong>
        </div>
        <button type="button" data-action="life-action"
          data-life-command="work_shift"
          data-life-route="decision"
          data-testid="life-work-shift"
          ${
            workedToday ||
            life.energy < 18 ||
            life.satiety < 12 ||
            life.health < 15
              ? 'disabled'
              : ''
          }>
          ${workedToday ? '今日已完成' : '开始这一班'}
        </button>
      </div>
    </section>
  `;
  const profileSurface =
    workSection === 'profile'
      ? `
          ${identitySurface}
          <div class="identity-profile-layout">
            ${renderRoleCard()}
            ${renderAccountCard()}
          </div>
        `
      : '';
  return `
    <section class="identity-studio panel-enter">
      ${workTabs}
      ${workSection === 'desk' ? deskSurface : profileSurface}
    </section>
    ${
      workSection === 'network'
        ? renderSocialCareerView(socialCareer)
        : ''
    }
    <div class="error-summary" id="action-error" role="alert">${escapeHtml(errorMessage)}</div>
  `;
}

function bestLimit(symbol, side = 'buy') {
  const book = world.market.orderBooks[symbol];
  const levels = side === 'buy' ? book?.asks : book?.bids;
  return levels?.[0]?.price ?? world.market.securities[symbol]?.lastPrice ?? 1;
}

function renderOrderWorkspace() {
  const symbol = world.market.securities[selectedSymbol]
    ? selectedSymbol
    : Object.keys(world.market.securities)[0];
  selectedSymbol = symbol;
  const security = world.market.securities[symbol];
  const company = currentCompany(symbol);
  const limit = bestLimit(symbol, 'buy');
  const securityOptions = Object.values(world.market.securities)
    .map(
      (item) => `
        <option value="${escapeHtml(item.symbol)}" ${
          item.symbol === symbol ? 'selected' : ''
        }>${escapeHtml(item.symbol)} · ${escapeHtml(item.name)}</option>
      `,
    )
    .join('');

  return `
    <div class="order-layout">
      <form id="order-form" class="order-form" data-testid="order-form">
        <div class="field">
          <label for="order-symbol">合成证券</label>
          <select id="order-symbol" class="select" name="symbol"
            data-testid="order-symbol">${securityOptions}</select>
          <span class="field-hint">${escapeHtml(company.description)}</span>
        </div>
        <fieldset class="form-section">
          <legend class="field-label">行动方向</legend>
          <div class="radio-row">
            <label class="radio-pill">
              <input type="radio" name="side" value="buy" checked
                data-testid="order-side-buy" />
              买入
            </label>
            <label class="radio-pill">
              <input type="radio" name="side" value="sell"
                data-testid="order-side-sell" />
              卖出
            </label>
          </div>
        </fieldset>
        <div class="form-grid">
          <div class="field">
            <label for="order-type">订单类型</label>
            <select id="order-type" class="select" name="orderType">
              <option value="limit">限价</option>
              <option value="market">市价</option>
            </select>
          </div>
          <div class="field">
            <label for="order-quantity">数量（股）</label>
            <input id="order-quantity" class="input data-number" name="quantity"
              type="number" min="1" step="1" value="5" required
              data-testid="order-quantity" />
          </div>
          <div class="field">
            <label for="order-limit">限价（最近成交 ${money(
              security.lastPrice,
            )}）</label>
            <input id="order-limit" class="input data-number" name="limitPrice"
              type="number" min="0.01" step="0.01" value="${limit}" required
              data-testid="order-limit" />
          </div>
        </div>
        <div id="order-preview" class="order-preview" data-testid="order-preview">
          ${orderPreviewHtml(symbol, 'buy', 5, limit)}
        </div>
        <button class="button button-primary" type="submit" data-testid="submit-order">
          提交限价订单
        </button>
      </form>

      <div>
        ${renderOrderBook(symbol)}
        <div class="expert-only">
          ${renderPriceHistory(symbol)}
        </div>
      </div>
    </div>
  `;
}

function orderPreviewHtml(
  symbol,
  side,
  quantity,
  limitPrice,
  orderType = 'limit',
) {
  const book = world.market.orderBooks[symbol];
  const levels = side === 'buy' ? book?.asks ?? [] : book?.bids ?? [];
  const marketOrder = orderType === 'market';
  const eligible = marketOrder
    ? levels
    : levels.filter((level) =>
        side === 'buy'
          ? level.price <= limitPrice
          : level.price >= limitPrice,
      );
  let remaining = Math.max(0, Math.floor(quantity));
  let gross = 0;
  let filled = 0;
  let levelsUsed = 0;
  for (const level of eligible) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, level.quantity);
    if (amount > 0) {
      filled += amount;
      gross += amount * level.price;
      remaining -= amount;
      levelsUsed += 1;
    }
  }
  const totalDepth = levels.reduce((sum, level) => sum + level.quantity, 0);
  const impact = filled > 0 ? filled / Math.max(1, totalDepth) : 0;
  const highImpact = levelsUsed > 1 || impact >= 0.25 || quantity >= 25;
  const feeEstimate = Math.max(0.05, gross * 0.0005);
  const holding = world.player.holdings[symbol] ?? 0;
  const boundary =
    side === 'buy'
      ? `可交易现金 ${money(availableTradingCashView())}`
      : `可卖持仓 ${number(holding)} 股`;
  return `
    <div class="tag-row">
      <span class="tag ${highImpact ? 'tag-impact' : ''}">
        ${highImpact ? '高可见影响' : marketOrder ? '市价即时撮合' : '普通盘口行动'}
      </span>
      <span class="tag">预计撮合 ${filled}/${Math.floor(quantity)} 股</span>
    </div>
    <p>
      预计金额 <strong class="data-number">${money(gross)}</strong>，
      费用约 <strong class="data-number">${money(feeEstimate)}</strong>；
      ${escapeHtml(boundary)}。
    </p>
    <p class="muted">
      ${
        highImpact
          ? '订单可能消耗多档流动性并提高市场关注；系统允许执行，长期后果由盘口、委托与后续经营共同形成。'
          : marketOrder
            ? '市价单立即吃当前对手盘；未成交余量自动撤销，实际成交以提交时盘口为准。'
            : '预计在当前盘口内完成；实际成交以提交时仍可用的对手盘为准。'
      }
    </p>
  `;
}

function renderOrderBook(symbol) {
  const book = world.market.orderBooks[symbol];
  const levelRows = (levels, side) =>
    levels
      .map(
        (level, index) => `
          <div class="book-level">
            <span>${side === 'ask' ? `卖 ${index + 1}` : `买 ${index + 1}`}</span>
            <span>${number(level.price, 2)} × ${number(level.quantity)}</span>
          </div>
        `,
      )
      .join('');
  return `
    <section aria-labelledby="book-title">
      <div class="section-heading">
        <div>
          <h3 id="book-title">${escapeHtml(symbol)} 真实盘口</h3>
          <p>最近成交价 ${money(world.market.securities[symbol].lastPrice)}</p>
        </div>
        <span class="tag">第 ${book.lastUpdatedTick} 日更新</span>
      </div>
      <div class="book-grid" data-testid="order-book">
        <div class="book-side">
          <h3 class="negative">卖方报价 ↓</h3>
          ${levelRows(book.asks, 'ask') || '<p class="muted">卖盘暂时为空</p>'}
        </div>
        <div class="book-side">
          <h3 class="positive">买方报价 ↑</h3>
          ${levelRows(book.bids, 'bid') || '<p class="muted">买盘暂时为空</p>'}
        </div>
      </div>
    </section>
  `;
}

function renderPriceHistory(symbol) {
  const history = world.market.securities[symbol].priceHistory.slice(-18);
  const prices = history.map((item) => item.price);
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  const span = Math.max(0.01, maximum - minimum);
  const bars = history
    .map((item) => {
      const height = 22 + ((item.price - minimum) / span) * 78;
      return `<span class="price-bar" style="--bar-height:${height.toFixed(
        1,
      )}%" title="第 ${item.tick} 日 ${number(item.price, 2)}"></span>`;
    })
    .join('');
  const first = history[0]?.price ?? 0;
  const last = history.at(-1)?.price ?? 0;
  const change = first ? last / first - 1 : 0;
  return `
    <div class="price-history" role="img"
      aria-label="${escapeHtml(symbol)} 最近 ${history.length} 个成交记录，从 ${number(
        first,
        2,
      )} 变为 ${number(last, 2)}，变化 ${percent(change)}">
      ${bars}
    </div>
    <p class="muted">
      文本等价：最近 ${history.length} 个成交记录，
      ${number(first, 2)} → ${number(last, 2)}，
      <span class="${change >= 0 ? 'positive' : 'negative'}">${
        change >= 0 ? '上' : '下'
      } ${percent(Math.abs(change))}</span>。
    </p>
  `;
}

function renderQuantStrategyLab() {
  const lab = world.player.roleState.strategyLab;
  const definitions = [
    ...QUANT_STRATEGY_CATALOG,
    ...(lab.customStrategies ?? []),
  ];
  const strategyCards = definitions.map((definition) => {
    const strategyId = definition.id;
    const strategyState = lab.strategies[strategyId] ?? definition;
    const unlocked = strategyState.unlocked === true;
    const selected = lab.selectedStrategyIds.includes(strategyId);
    const upgrade = unlocked
      ? quantStrategyUpgradeCost(lab, strategyId)
      : null;
    const label = definition.label ?? definition.name ?? strategyId;
    const custom = definition.source === 'player_declarative_file';
    const researchRequired = definition.researchRequired ?? 0;
    return `
      <article class="quant-strategy-card"
        data-strategy-state="${unlocked ? 'unlocked' : 'locked'}">
        <div class="quant-strategy-card__heading">
          <label>
            <input type="checkbox" name="strategyId"
              value="${escapeHtml(strategyId)}" data-quant-strategy-select
              ${selected ? 'checked' : ''} ${unlocked ? '' : 'disabled'} />
            <span>${escapeHtml(label)}</span>
          </label>
          <span class="tag">${custom ? '玩家策略' : `等级 ${number(strategyState.level ?? 1)}`}</span>
        </div>
        <p>${escapeHtml(definition.description ?? '基于公开、可审计的市场因子运行。')}</p>
        <label class="quant-strategy-weight">
          <span>组合权重（基点）</span>
          <input class="input data-number" type="number"
            name="strategyWeight_${escapeHtml(strategyId)}"
            min="0" max="10000" step="100"
            value="${lab.strategyWeightsBps[strategyId] ?? 0}"
            ${unlocked ? '' : 'disabled'} />
        </label>
        <div class="quant-strategy-card__actions">
          ${
            !unlocked
              ? `<button class="button" type="button"
                  data-action="research-quant-strategy"
                  data-strategy-id="${escapeHtml(strategyId)}">
                  研究解锁 · ${number(researchRequired)} 研究点
                </button>`
              : upgrade
                ? `<button class="button" type="button"
                    data-action="upgrade-quant-strategy"
                    data-strategy-id="${escapeHtml(strategyId)}">
                    升级至 ${number(upgrade.nextLevel)} 级 · ${money(upgrade.cashCost)}
                  </button>`
                : '<span class="muted">当前已到最高等级</span>'
          }
          ${
            custom
              ? `<button class="button button-quiet" type="button"
                  data-action="remove-quant-strategy"
                  data-strategy-id="${escapeHtml(strategyId)}">移除文件策略</button>`
              : ''
          }
        </div>
      </article>
    `;
  }).join('');
  return `
    <section class="quant-strategy-lab" data-testid="quant-strategy-lab">
      <div class="role-specialized-heading">
        <div>
          <span class="eyebrow">量化机构专属</span>
          <h3>策略研究与自动交易实验室</h3>
        </div>
        <span class="tag">版本 ${number(lab.revision)}</span>
      </div>
      <div class="role-risk-band">
        <span>研究资源 <b>${number(world.player.resources.research)}</b></span>
        <span>技术预算 <b>${money(lab.technologyBudgetRemaining)}</b></span>
        <span>已选策略 <b>${number(lab.selectedStrategyIds.length)}</b></span>
        <span>自动交易 <b>${lab.automationEnabled ? '运行' : '暂停'}</b></span>
      </div>
      <form id="quant-automation-form" class="role-action-form">
        <div class="quant-lab-controls">
          <label class="role-toggle-control">
            <input type="checkbox" name="automationEnabled"
              ${lab.automationEnabled ? 'checked' : ''} />
            <span>允许策略组合按真实盘口自动下单</span>
          </label>
          <label class="field">
            <span>组合风险模式</span>
            <select class="input" name="riskMode">
              ${[
                ['conservative', '保守'],
                ['balanced', '均衡'],
                ['aggressive', '进取'],
              ].map(([value, label]) =>
                `<option value="${value}" ${lab.riskMode === value ? 'selected' : ''}>${label}</option>`,
              ).join('')}
            </select>
          </label>
        </div>
        <div class="quant-strategy-grid">${strategyCards}</div>
        <button class="button button-impact" type="submit">
          应用策略组合与权重
        </button>
      </form>
      <section class="quant-file-bench" aria-label="玩家策略文件">
        <div>
          <h4>玩家策略文件</h4>
          <p>仅接受不超过 64 KiB 的声明式 JSON；只能读取公开因子与受限执行参数，不运行脚本。</p>
        </div>
        <div class="quant-file-bench__actions">
          <label class="button" for="quant-strategy-file">导入策略 JSON</label>
          <input id="quant-strategy-file" type="file"
            data-testid="quant-strategy-file"
            accept="application/json,.json" />
          <button class="button button-quiet" type="button"
            data-action="download-quant-strategy-template">
            下载策略模板
          </button>
        </div>
      </section>
      <p class="role-model-boundary">
        升级提高研究精度、执行容量与控制边界，但不保证收益；所有信号最终都要通过资金、持仓、涨跌停和真实订单簿校验。
      </p>
    </section>
  `;
}

function renderStabilizationControlDesk() {
  const desk = world.player.roleState.stabilityDesk;
  return `
    <section class="stabilization-control-desk"
      data-testid="stabilization-control-desk">
      <div class="role-specialized-heading">
        <div>
          <span class="eyebrow">稳定力量专属</span>
          <h3>市场稳定协议控制台</h3>
        </div>
        <span class="tag">版本 ${number(desk.revision)}</span>
      </div>
      <div class="role-risk-band">
        <span>自动协议 <b>${desk.automationEnabled ? '运行' : '暂停'}</b></span>
        <span>目标 <b>${escapeHtml({ balanced: '均衡', systemic: '系统性', liquidity: '流动性' }[desk.targetMode] ?? desk.targetMode)}</b></span>
        <span>执行强度 <b>${number(desk.intensityBps / 100, 1)}%</b></span>
        <span>手动权限 <b>${desk.manualAccess ? '开放' : '关闭'}</b></span>
      </div>
      <form id="stabilization-automation-form" class="role-action-form"
        data-command="configure_stabilization_automation">
        <label class="role-toggle-control">
          <input type="checkbox" name="automationEnabled"
            ${desk.automationEnabled ? 'checked' : ''} />
          <span>按市场广度、整体跌幅与流动性压力自动稳定市场</span>
        </label>
        <div class="stabilization-parameter-grid">
          <label class="field">
            <span>稳定目标</span>
            <select class="input" name="targetMode">
              <option value="balanced" ${desk.targetMode === 'balanced' ? 'selected' : ''}>均衡</option>
              <option value="systemic" ${desk.targetMode === 'systemic' ? 'selected' : ''}>系统性风险</option>
              <option value="liquidity" ${desk.targetMode === 'liquidity' ? 'selected' : ''}>流动性修复</option>
            </select>
          </label>
          <label class="field">
            <span>执行强度（%）</span>
            <input class="input data-number" name="intensityPercent" type="number"
              min="10" max="100" step="1" value="${desk.intensityBps / 100}" />
          </label>
          <label class="field">
            <span>下跌家数触发（%）</span>
            <input class="input data-number" name="breadthTriggerPercent" type="number"
              min="-80" max="-5" step="1" value="${desk.breadthTriggerBps / 100}" />
          </label>
          <label class="field">
            <span>整体跌幅触发（%）</span>
            <input class="input data-number" name="weightedReturnTriggerPercent" type="number"
              min="-80" max="-5" step="1" value="${desk.weightedReturnTriggerBps / 100}" />
          </label>
          <label class="field">
            <span>流动性压力触发（%）</span>
            <input class="input data-number" name="liquidityStressPercent" type="number"
              min="10" max="100" step="1" value="${desk.liquidityStressTriggerBps / 100}" />
          </label>
        </div>
        <button class="button button-impact" type="submit">应用自动稳定协议</button>
      </form>
      <div class="stabilization-manual-entry">
        <div>
          <h4>人工干预席</h4>
          <p>自动协议之外仍可手动选择标的、限价、数量和时点；人工订单与自动订单共用同一账户、库存和真实盘口。</p>
        </div>
        <button class="button" type="button" data-action="open-market-mode"
          data-market-mode="stocks" data-testid="stabilization-manual-entry">
          手动进场
        </button>
      </div>
    </section>
  `;
}

function renderRoleActionForm() {
  const role = world.player.roleType;
  const state = world.player.roleState;
  if (role === 'quant_institution') return renderQuantStrategyLab();
  if (role === 'stabilization_fund') {
    return renderStabilizationControlDesk();
  }
  if (role === 'household' || role === 'private_whale') {
    return `
      <form id="role-action-form" class="role-action-form" data-command="set_reserve"
        data-testid="role-action-form">
        <div class="field">
          <label for="reserve-amount">现金储备边界</label>
          <input id="reserve-amount" class="input data-number" name="amount" type="number"
            min="0" max="${world.player.cash}" step="1000" value="${state.cashReserve}"
            required data-testid="role-action-value" />
          <span class="field-hint">
            账户现金 ${money(world.player.cash)}；当前可交易 ${money(
              availableTradingCashView(),
            )}。
          </span>
        </div>
        <button class="button" type="submit" data-testid="submit-role-action">
          ${role === 'private_whale' ? '更新私人流动性储备' : '更新家庭储备边界'}
        </button>
      </form>
    `;
  }

  if (role === 'professional') {
    return `
      <div class="role-risk-band">
        <span>受托资金 <b>${money(state.mandateCapital)}</b></span>
        <span>最大回撤 <b>${percent(state.drawdownLimit, 0)}</b></span>
        <span>考核剩余 <b>${number(state.evaluationHorizon)} 日</b></span>
      </div>
      <div class="role-command-grid" data-testid="role-action-menu">
        <button class="button button-impact" type="button"
          data-action="route" data-route="market">进入市场配置仓位</button>
        <button class="button" type="button"
          data-action="route" data-route="information">打开行情资料</button>
      </div>
    `;
  }

  if (role === 'operator') {
    const company = world.entities.companies[state.controlledCompanyId];
    const available = company.cash - company.operations.reservedCash;
    const maximumAdditional = Math.max(
      0,
      Math.min(
        Math.floor(
          company.capacity * (0.45 + state.operatingAuthority),
        ),
        company.capacity - company.operations.plannedProduction,
      ),
    );
    return `
      <form id="role-action-form" class="role-action-form"
        data-command="schedule_production" data-company-id="${escapeHtml(company.id)}"
        data-testid="role-action-form">
        <div class="field">
          <label for="production-units">新增排产单位</label>
          <input id="production-units" class="input data-number" name="units" type="number"
            min="1" max="${maximumAdditional}" step="1"
            value="${Math.max(1, Math.min(10, maximumAdditional))}" required
            data-testid="role-action-value" ${maximumAdditional === 0 ? 'disabled' : ''} />
          <span class="field-hint">
            ${escapeHtml(company.name)}当前计划 ${number(
              company.operations.plannedProduction,
            )}；可用经营现金 ${money(available)}；
            本期最多可再排 ${number(maximumAdditional)} 单位；
            每单位先锁定约 ${money(company.operations.unitCost * 0.32)}。
          </span>
        </div>
        <button class="button button-impact" type="submit"
          data-testid="submit-role-action" ${maximumAdditional === 0 ? 'disabled' : ''}>
          追加排产并锁定现金
        </button>
      </form>
    `;
  }

  return `
    <form id="role-action-form" class="role-action-form"
      data-command="set_liquidity_buffer" data-testid="role-action-form">
      <div class="field">
        <label for="liquidity-buffer">流动性缓冲目标（%）</label>
        <input id="liquidity-buffer" class="input data-number" name="ratioPercent"
          type="number" min="10" max="65" step="1"
          value="${Math.round(state.liquidityBufferRatio * 100)}" required
          data-testid="role-action-value" />
        <span class="field-hint">
          当前赎回压力 ${percent(state.redemptionPressure)}；管理资产 ${money(
            state.assetsUnderManagement,
          )}；固定现金缓冲底线 ${money(state.liquidityReserveFloor)}。
        </span>
      </div>
      <button class="button button-impact" type="submit"
        data-testid="submit-role-action">调整机构缓冲目标</button>
    </form>
  `;
}

function renderMarketAppBar() {
  const life = getLifeProjection(world);
  const homeLabel =
    life.kind === 'organization' ? '运营' : life.homeLabel;
  return `
    <nav class="market-app-bar" aria-label="市场外层导航">
      <div class="market-place-links">
        <button type="button" data-action="route" data-route="today"
          data-testid="market-back-world" aria-label="返回世界">‹ 世界</button>
        <button type="button" data-action="life-place"
          data-life-section="home">${escapeHtml(homeLabel)}</button>
        <button type="button" data-action="life-place"
          data-life-section="shop">商店</button>
        <button type="button" data-action="route"
          data-route="decision">工作</button>
      </div>
      <button class="market-information-link" type="button"
        data-action="route" data-route="information"
        aria-label="打开行情信息">行情</button>
      <details class="market-menu">
        <summary aria-label="市场菜单">•••</summary>
        <div>
          <button type="button" data-action="save"
            data-testid="market-compact-save">保存当前世界</button>
        </div>
      </details>
    </nav>
  `;
}

function renderMarketView() {
  return `
    ${renderMarketAppBar()}
    <section class="market-stage-host panel-enter" data-testid="market-stage-host">
      <div id="market-stage-root"></div>
    </section>
  `;
}

function currentDerivativesProjection() {
  if (
    isPublishedDerivativesProjection(
      derivativesProjection,
    )
  ) {
    return derivativesProjection;
  }
  if (
    isPublishedDerivativesProjection(
      world?.derivatives,
    )
  ) {
    derivativesProjection = world.derivatives;
    return derivativesProjection;
  }
  derivativesProjection =
    getDerivativesProjection(world);
  return derivativesProjection;
}

function renderInformationView() {
  return `
    <section class="market-intelligence-route panel-enter">
      <nav class="market-intelligence-route__bar"
        aria-label="行情资料外层导航">
        <button type="button" data-action="route" data-route="market">
          ‹ 返回行情
        </button>
        <button type="button" data-action="route" data-route="today">
          世界
        </button>
      </nav>
      <div id="market-intelligence-root"
        data-testid="market-intelligence-root"></div>
    </section>
  `;
}

function publicAccountLabel(account) {
  if (
    [
      '账户现金',
      '个人账户',
      '企业往来',
      '交易服务',
      '商业往来',
      '市场流动性',
      '市场参与者',
      '其他往来',
    ].includes(account)
  ) {
    return account;
  }
  const value = String(account ?? '').toLowerCase();
  if (value.includes('player') && value.includes('cash')) return '账户现金';
  if (value.includes('player')) return '个人账户';
  if (value.includes('company')) return '企业往来';
  if (value.includes('exchange')) return '交易服务';
  if (value.includes('economy')) return '商业往来';
  if (value.includes('maker') || value.includes('liquidity')) {
    return '市场流动性';
  }
  if (value.includes('npc') || value.includes('investor')) {
    return '市场参与者';
  }
  return '其他往来';
}

function publicLedgerRows(journals) {
  return journals.flatMap((journal) =>
    journal.postings.map((posting) => ({
      tick: journal.tick,
      account: publicAccountLabel(posting.account),
      debit: posting.debit,
      credit: posting.credit,
    })),
  );
}

function publicRecordText(value) {
  return String(value ?? '')
    .replace(
      /\b(\d+)\s+priceTicks\b/g,
      (_, ticks) => `${(Number(ticks) / 100).toFixed(2)} 元`,
    )
    .replace(
      /\b(?:rt|npc|maker|event|fact|journal|order|trade|world|role|receipt|company|player|broker|account|actor|clue|replay|ledger)_[a-z0-9_:-]+\b/gi,
      '相关记录',
    )
    .replace(
      /\b(?:(?:schema|contract)Version|(?:owner|payer)(?:Kind|Account))\b\s*[:=]?\s*/gi,
      '',
    )
    .replace(/\b(?:status|reason|error|message)\s*[:=]\s*/gi, '')
    .replace(
      /\b(?:accepted|rejected|pending|resting|filled|partially_filled|cancelled)\b/gi,
      '已更新',
    )
    .replace(
      /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+(?:\:[A-Z0-9]+)?\b/g,
      '市场提示',
    );
}

function renderHistoryView() {
  const events = [...world.eventLog].reverse();
  const journals = [...world.ledger].reverse();
  const historyWorldline = projectWorldExperience(
    world,
    marketSnapshot,
    { includeSignals: false },
  ).worldline;
  const layerConfig = {
    facts: {
      label: '公告',
      items: world.facts,
      tick: (item) => item.tick,
      text: (item) => item.summary,
      meta: () => '公开记录',
    },
    memories: {
      label: '印象',
      items: world.memories,
      tick: (item) => item.createdTick,
      text: (item) => item.content,
      meta: () => '市场参与者',
    },
    narratives: {
      label: '笔记',
      items: world.narratives,
      tick: (item) => item.tick,
      text: (item) => item.text,
      meta: () => '个人记录',
    },
  }[historyLayer];
  const timelineItems = [...layerConfig.items]
    .sort(
      (left, right) =>
        Number(layerConfig.tick(right) ?? 0) -
          Number(layerConfig.tick(left) ?? 0) ||
        String(right.id ?? '').localeCompare(String(left.id ?? '')),
    )
    .slice(0, HISTORY_TIMELINE_LIMIT);
  const timelineMarkup = timelineItems.length
    ? timelineItems
        .map(
          (item) => `
            <li>
              <span>第 ${number(layerConfig.tick(item) ?? 0)} 日</span>
              <strong>${escapeHtml(
                publicRecordText(layerConfig.text(item) ?? '记录已保留'),
              )}</strong>
              <small>${escapeHtml(layerConfig.meta(item))}</small>
            </li>
          `,
        )
        .join('')
    : '<li class="history-empty"><strong>这一层尚无记录</strong></li>';
  return `
    ${renderWorldlinePanel(historyWorldline, {
      variant: 'history',
    })}
    <section class="panel panel-enter history-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">世界</p>
          <h2>最近 ${layerConfig.label}</h2>
        </div>
        <span class="tag">${number(layerConfig.items.length)} 条</span>
      </div>
      <nav class="history-filter" aria-label="记录分类">
        <button type="button" data-action="history-filter"
          data-history-layer="facts"
          aria-pressed="${historyLayer === 'facts' ? 'true' : 'false'}">公告</button>
        <button type="button" data-action="history-filter"
          data-history-layer="memories"
          aria-pressed="${historyLayer === 'memories' ? 'true' : 'false'}">印象</button>
        <button type="button" data-action="history-filter"
          data-history-layer="narratives"
          aria-pressed="${historyLayer === 'narratives' ? 'true' : 'false'}">笔记</button>
      </nav>
      <ol class="history-timeline" data-testid="history-timeline"
        data-history-layer="${historyLayer}">
        ${timelineMarkup}
      </ol>
    </section>
    <section class="panel panel-enter expert-only">
      <div class="section-heading">
        <div>
          <h2>世界流水</h2>
        </div>
        <span class="tag">${events.length} 条</span>
      </div>
      <ol class="event-log">
        ${events
          .map(
            (event) => `
              <li>
                <strong>${escapeHtml(publicRecordText(event.summary))}</strong>
                <span>第 ${event.tick} 日</span>
              </li>
            `,
          )
          .join('')}
      </ol>
    </section>
    <section class="panel panel-enter expert-only">
      <div class="section-heading">
        <div>
          <h2>会计账本</h2>
        </div>
        <span class="tag">${journals.length} 批</span>
      </div>
      <div class="table-wrap" tabindex="0">
        <table data-testid="ledger-table">
          <caption>最近收支 · 人民币</caption>
          <thead><tr><th>账户</th><th>第几日</th><th>流入</th><th>流出</th></tr></thead>
          <tbody>
            ${publicLedgerRows(journals)
              .map(
                (row) => `
                    <tr>
                      <td>${escapeHtml(row.account)}</td>
                      <td>${row.tick}</td>
                      <td class="data-number">${money(row.debit)}</td>
                      <td class="data-number">${money(row.credit)}</td>
                    </tr>
                  `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function destroyMarketStage() {
  marketStage?.destroy();
  marketStage = null;
}

function destroyMarketIntelligence() {
  marketIntelligenceView?.destroy();
  marketIntelligenceView = null;
}

function destroyWorld2DRuntime() {
  world2dRuntime?.destroy();
  world2dRuntime = null;
}

function updateLiveStatusDom() {
  const live = document.querySelector('[data-testid="live-status"]');
  if (live) live.textContent = notice;
}

function updateWorld2DSemanticDom(spatial) {
  if (!spatial?.playerPose) return;
  const canvas = document.querySelector(
    '[data-testid="world2d-canvas"]',
  );
  if (canvas) {
    canvas.dataset.authorityX = String(
      spatial.playerPose.positionQ.x,
    );
    canvas.dataset.authorityY = String(
      spatial.playerPose.positionQ.y,
    );
    canvas.dataset.authorityCommitSeq = String(
      spatial.authorityCommitSeq ?? '',
    );
    canvas.dataset.intentKind = spatial.playerPose.intentKind;
  }
  const position = document.querySelector(
    '[data-testid="world2d-position"]',
  );
  if (position) {
    position.textContent = `位置 ${spatial.playerPose.positionQ.x}, ${spatial.playerPose.positionQ.y}`;
  }
  for (const entry of spatial.interactables ?? []) {
    const button = document.querySelector(
      `[data-testid="world2d-action-${entry.entityId}"]`,
    );
    if (!button) continue;
    const nearby = entry.distanceQ <= entry.maxDistanceQ;
    button.classList.toggle('is-nearby', nearby);
    button.dataset.nearby = nearby ? 'true' : 'false';
    const distanceNode = button.querySelector(
      '[data-world2d-distance]',
    );
    if (distanceNode && entry.available) {
      distanceNode.textContent = nearby
        ? '就在身边 · 点击互动'
        : `相距 ${number(
            entry.distanceQ / spatial.scene.coordinateScale,
            1,
          )} 米 · 点击走过去`;
    }
  }
}

async function activateWorld2DInteraction(entry) {
  if (!entry?.available) {
    notice = entry?.unavailableReason ?? '当前还不能这样做。';
    updateLiveStatusDom();
    return;
  }
  if (entry.entityId === 'home_computer') {
    activeRoute = 'market';
    errorMessage = '';
    notice = '已打开家用电脑里的同一市场终端。';
    render();
    return;
  }
  if (entry.entityId === 'home_bed') {
    void performAction(
      { type: 'life_action', command: 'rest' },
      'today',
    );
    return;
  }
  if (entry.entityId === 'home_door') {
    const receipt = await sendWorld2DControl({
      kind: 'activate_interactable',
      entityId: entry.entityId,
    });
    if (receipt?.status === 'accepted') {
      notice = '你走出家门，来到仍在运行的江湾里街区。';
      render();
    }
    return;
  }
  if (entry.entityId === 'home_window') {
    notice = `窗外是${world2dWeatherLabel(
      currentWorld2DProjection()?.scene?.environmentState,
    )}，街区仍按世界时间运转。`;
    updateLiveStatusDom();
    return;
  }
  if (entry.interactionKind === 'scene_transition') {
    const receipt = await sendWorld2DControl({
      kind: 'activate_interactable',
      entityId: entry.entityId,
    });
    if (receipt?.status === 'accepted') {
      notice = receipt.toSceneId === 'jiangwan_home'
        ? '你回到了江湾里的家。'
        : `你进入了${entry.labelZh}。`;
      render();
    }
    return;
  }
  if (entry.interactionKind === 'place_visit') {
    const receipt = await sendWorld2DControl({
      kind: 'activate_interactable',
      entityId: entry.entityId,
    });
    if (receipt?.status !== 'accepted') return;
    if (entry.entityId === 'street_daily_store') {
      lifeSection = 'shop';
      activeRoute = 'life';
      notice = `你已到达${entry.labelZh}，这里的操作会在同一世界中结算。`;
      render();
      return;
    }
    notice = `你已到达${entry.labelZh}；当地活动与报价已经按当前世界开放。`;
    render();
  }
}

function maybeCompleteWorld2DInteraction(spatial) {
  if (!pendingWorld2DInteraction) return;
  const entry = spatial?.interactables?.find(
    (candidate) =>
      candidate.entityId === pendingWorld2DInteraction,
  );
  if (!entry || entry.distanceQ > entry.maxDistanceQ) return;
  pendingWorld2DInteraction = null;
  void activateWorld2DInteraction(entry);
}

function sendWorld2DControl(control) {
  const run = async () => {
    const spatial = currentWorld2DProjection();
    if (!marketClient || !spatial?.scene || !spatial?.playerPose) {
      throw new Error('当前地点尚未连接。');
    }
    const controlSeq = spatial.playerPose.controlSeq + 1;
    const commandId = `${spatial.worldId}:player-control:${controlSeq}:${
      ++world2dCommandOrdinal
    }`;
    const receipt = await marketClient.worldCommand({
      type: 'player_control',
      actorId: 'player',
      commandId,
      baseCommitSeq: spatial.authorityCommitSeq,
      sceneId: spatial.scene.id,
      geometryRevision: spatial.scene.geometryRevision,
      controlSeq,
      control,
    });
    applyAuthorityPublication(receipt);
    const nextSpatial = currentWorld2DProjection();
    world2dRuntime?.update(
      nextSpatial,
      currentOpenWorldCityProjection(),
    );
    updateWorld2DSemanticDom(nextSpatial);
    if (receipt.status === 'rejected') {
      pendingWorld2DInteraction = null;
      notice = REJECTION_LABELS[receipt.reason] ?? '移动没有被当前世界接受。';
      updateLiveStatusDom();
    }
    return receipt;
  };
  const pendingControl = world2dControlTail.then(run, run);
  world2dControlTail = pendingControl.catch(() => null);
  return pendingControl.catch((error) => {
    pendingWorld2DInteraction = null;
    console.error('WORLD2D_CONTROL_FAILED', error);
    notice = '移动暂时没有完成，请重试。';
    updateLiveStatusDom();
    return null;
  });
}

function mountCurrentWorld2DRuntime() {
  if (
    screen !== 'game' ||
    activeRoute !== 'today' ||
    !world
  ) {
    return;
  }
  const host = document.querySelector(
    '[data-testid="world2d-stage"]',
  );
  const spatial = currentWorld2DProjection();
  if (!host || !spatial?.scene) return;
  if (world2dRuntime) {
    world2dRuntime.rehost(host);
    world2dRuntime.update(spatial, currentOpenWorldCityProjection());
    world2dRuntime.resume();
    updateWorld2DSemanticDom(spatial);
    return;
  }
  world2dRuntime = mountWorld2DRuntime(host, {
    projection: spatial,
    cityLifeProjection: currentOpenWorldCityProjection(),
    sendControl: sendWorld2DControl,
  });
  updateWorld2DSemanticDom(spatial);
}

function updateSaveStateDom() {
  const node = document.querySelector('[data-testid="save-status"]');
  if (!node) return;
  node.dataset.state = saveState;
  node.textContent =
    saveState === 'error'
      ? '保存失败'
      : saveState === 'saving'
        ? '正在保存'
        : lastSavedAt
          ? '已保存'
      : '未保存';
}

function virtualClockText(
  virtualMs,
  offsetMs = MARKET_CLOCK_ORIGIN_OFFSET_MS,
) {
  const seconds = Math.floor(
    (
      Math.max(0, Number(virtualMs) || 0) +
      Math.max(
        0,
        Number.isSafeInteger(Number(offsetMs))
          ? Number(offsetMs)
          : MARKET_CLOCK_ORIGIN_OFFSET_MS,
      )
    ) %
      86_400_000 /
      1_000,
  );
  return [
    String(Math.floor(seconds / 3_600)).padStart(2, '0'),
    String(Math.floor(seconds % 3_600 / 60)).padStart(2, '0'),
    String(seconds % 60).padStart(2, '0'),
  ].join(':');
}

function setNodeText(selector, value) {
  const node = document.querySelector(selector);
  if (node && node.textContent !== String(value)) {
    node.textContent = String(value);
  }
}

function renderPlaybackDom() {
  const running = playbackState === 'running';
  for (const toggle of document.querySelectorAll(
    '[data-testid="world-toggle"]',
  )) {
    toggle.setAttribute('aria-pressed', running ? 'true' : 'false');
    toggle.setAttribute('aria-label', running ? '暂停世界' : '继续世界');
    const parts = toggle.querySelectorAll('span');
    if (parts[0]) parts[0].textContent = running ? 'Ⅱ' : '▶';
    if (parts[1]) parts[1].textContent = running ? '运行' : '暂停';
  }
  for (const dot of document.querySelectorAll('.world-running-dot')) {
    dot.classList.toggle('is-paused', !running);
  }
  const speed = document.querySelector('[data-testid="world-speed"]');
  if (speed) speed.value = String(playbackSpeed);
}

function refreshWorldExperienceDom() {
  if (!world || screen !== 'game') return;
  const view = projectWorldExperience(world, marketSnapshot, {
    includeSignals: false,
  });
  setNodeText('[data-world-bind="date"]', worldDate());
  setNodeText(
    '[data-world-bind="clock"]',
    virtualClockText(
      view.clock.virtualMs,
      marketSnapshot?.marketClockOffsetMs,
    ),
  );
  setNodeText('[data-world-bind="scene-date"]', worldDate());
  setNodeText(
    '[data-world-bind="scene-clock"]',
    virtualClockText(
      view.clock.virtualMs,
      marketSnapshot?.marketClockOffsetMs,
    ),
  );
  setNodeText('[data-world-bind="capital"]', money(view.capital.netAssets));
  setNodeText('[data-world-bind="cash"]', money(view.capital.cash));

  for (const company of view.nodes.filter(
    (node) => node.kind === 'company',
  )) {
    const node = document.querySelector(
      `[data-world-node="${CSS.escape(company.symbol)}"]`,
    );
    if (!node) continue;
    node.style.setProperty('--node-tension', String(company.tension));
    const price = node.querySelector('[data-world-node-price]');
    const change = node.querySelector('[data-world-node-change]');
    if (price) price.textContent = money(company.lastPriceTicks / 100);
    if (change) {
      change.textContent = `${company.deltaBps >= 0 ? '+' : ''}${number(
        company.deltaBps / 100,
        1,
      )}%`;
      change.classList.remove('market-up', 'market-down', 'market-flat');
      change.classList.add(marketDirectionClass(company.deltaBps));
    }
  }
  const actorLayer = document.querySelector(
    '[data-testid="world-actor-layer"]',
  );
  if (actorLayer) {
    actorLayer.innerHTML = renderObservableActorNodes(view.nodes);
  }
  const wealthHome = document.querySelector(
    '[data-testid="player-wealth-home-live"]',
  );
  if (wealthHome) {
    wealthHome.innerHTML = renderPlayerWealth(
      projectPlayerWealth(world, marketSnapshot),
      { variant: 'home' },
    );
  }
  marketIntelligenceView?.update({
    world,
    marketSnapshot,
  });
  renderPlaybackDom();
}

function shouldPublishVisibleFrame(snapshot) {
  return visibleFramePublicationGate.shouldPublish(
    snapshot,
    { speed: playbackSpeed },
  );
}

function acceptDerivativesPublication(
  publication,
  authority = {},
) {
  if (
    publication?.publication !==
    'lzy_derivatives_public_v1'
  ) {
    return false;
  }
  if (
    publication.publicationMode ===
    'cadence_patch'
  ) {
    const merged =
      mergePublishedDerivativesProjection(
        derivativesProjection,
        publication,
        authority,
      );
    if (merged === derivativesProjection) {
      return false;
    }
    derivativesProjection = merged;
    return true;
  }
  if (
    !isPublishedDerivativesProjection(
      publication,
    )
  ) {
    return false;
  }
  const previousHasStreamAuthority =
    Number.isSafeInteger(
      Number(
        derivativesProjection
          ?.authorityNowMs,
      ),
    ) &&
    Number.isSafeInteger(
      Number(
        derivativesProjection
          ?.authorityCommitSeq,
      ),
    );
  const nextHasStreamAuthority =
    Number.isSafeInteger(
      Number(publication.authorityNowMs),
    ) &&
    Number.isSafeInteger(
      Number(
        publication.authorityCommitSeq,
      ),
    );
  const previousNowMs = Number(
    derivativesProjection?.authorityNowMs ??
      derivativesProjection?.nowMs,
  );
  const previousCommitSeq = Number(
    derivativesProjection?.authorityCommitSeq ??
      derivativesProjection?.commitSeq,
  );
  const nextNowMs = Number(
    publication.authorityNowMs ??
      publication.nowMs,
  );
  const nextCommitSeq = Number(
    publication.authorityCommitSeq ??
      publication.commitSeq,
  );
  if (
    (
      previousHasStreamAuthority &&
      !nextHasStreamAuthority
    ) ||
    (
      previousHasStreamAuthority &&
      nextHasStreamAuthority &&
      Number.isSafeInteger(previousNowMs) &&
      Number.isSafeInteger(nextNowMs) &&
      nextNowMs < previousNowMs
    ) ||
    (
      previousHasStreamAuthority &&
      nextHasStreamAuthority &&
      Number.isSafeInteger(previousCommitSeq) &&
      Number.isSafeInteger(nextCommitSeq) &&
      nextCommitSeq < previousCommitSeq
    )
  ) {
    return false;
  }
  derivativesProjection = publication;
  return true;
}

function applyAuthorityPublication(value) {
  if (!value || typeof value !== 'object') return;
  let worldEnvelope =
    value.worldProjection?.state
      ? value.worldProjection
      : value.world?.state
      ? value.world
      : value.worldSnapshot
        ? {
            publication:
              value.world?.publication ??
              (value.worldSnapshot?.experience?.publication
                ? 'lzy_world_public_v1'
                : undefined),
            state: value.worldSnapshot,
          }
        : value.world?.world
          ? { state: value.world }
          : null;
  const publishedDerivatives =
    worldEnvelope?.state?.derivatives;
  if (
    isPublishedDerivativesProjection(
      publishedDerivatives,
    )
  ) {
    acceptDerivativesPublication(
      publishedDerivatives,
    );
    const {
      derivatives: _publishedDerivatives,
      ...worldState
    } = worldEnvelope.state;
    worldEnvelope = {
      ...worldEnvelope,
      state: worldState,
    };
  }
  if (worldEnvelope?.state?.world?.id) {
    world = mergeWorldAuthorityPublication(world, worldEnvelope);
  }
  const nextMarket = value.market ?? value.marketSnapshot ?? value.snapshot;
  if (nextMarket?.symbols && nextMarket?.accounts) {
    marketSnapshot = nextMarket;
  }
  acceptDerivativesPublication(
    value.derivativesPatch,
    {
      commitSeq:
        value.commitSeq ??
        nextMarket?.commitSeq ??
        null,
      nowMs:
        nextMarket?.nowMs ?? null,
    },
  );
  if (value.checkpoint) marketCheckpoint = value.checkpoint;
}

function marketReceiptCore(receipt) {
  if (!receipt || typeof receipt !== 'object') return receipt;
  const {
    marketSnapshot: _marketSnapshot,
    worldSnapshot: _worldSnapshot,
    world: _world,
    nextWorld: _nextWorld,
    snapshot: _snapshot,
    checkpoint: _checkpoint,
    ...core
  } = receipt;
  return core;
}

function saveBarrierMetadata(reason) {
  return {
    activeRoute,
    marketMode,
    selectedSymbol,
    lifeSection,
    lifeShopCategory,
    workSection,
    selectedDerivativeContractId,
    interfaceMode,
    playbackSpeed,
    reason,
  };
}

async function storeConfirmedBarrier(barrier, reason) {
  applyAuthorityPublication(barrier);
  marketCheckpoint = barrier.checkpoint;
  const checkpointMarketReceipt = [...(barrier.checkpoint?.receipts ?? [])]
    .reverse()
    .find(
      (receipt) =>
        receipt?.actorId === 'player' && isMarketReceipt(receipt),
    );
  if (checkpointMarketReceipt) {
    latestMarketReceipt = marketReceiptCore(checkpointMarketReceipt);
  }
  confirmedCommitSeq = barrier.commitSeq;
  lastFrameAutoSaveTick = Math.max(
    lastFrameAutoSaveTick,
    Number(barrier.checkpoint?.world?.world?.tick) || 0,
  );
  confirmedBarrier = {
    world: barrier.world,
    checkpoint: barrier.checkpoint,
    commitSeq: barrier.commitSeq,
    metadata: saveBarrierMetadata(reason),
  };
  const saved = await saveGameStateAsync(confirmedBarrier, reason);
  lastSavedAt = saved.world.ui.savedAt;
  saveState = 'saved';
  updateSaveStateDom();
  refreshWorldExperienceDom();
  return barrier;
}

function requestSaveBarrier(reason = 'auto') {
  if (barrierScheduled && autoBarrierTimerId !== null) {
    clearTimeout(autoBarrierTimerId);
    autoBarrierTimerId = null;
    barrierScheduled = false;
    autoBarrierDirty = false;
  }
  const generation = authorityGeneration;
  const client = marketClient;
  if (!client) return Promise.reject(new Error('实时世界尚未连接。'));
  saveState = 'saving';
  updateSaveStateDom();
  const operation = barrierTail
    .catch(() => null)
    .then(async () => {
      if (generation !== authorityGeneration || client !== marketClient) {
        return null;
      }
      const barrier = await client.saveBarrier();
      if (generation !== authorityGeneration || client !== marketClient) {
        return null;
      }
      return storeConfirmedBarrier(barrier, reason);
    })
    .catch((error) => {
      console.error('SAVE_BARRIER_FAILED', error);
      if (generation === authorityGeneration && client === marketClient) {
        saveState = 'error';
        errorMessage = '本次保存没有完成，请稍后重试。';
        updateSaveStateDom();
      }
      throw error;
    });
  barrierTail = operation;
  return operation;
}

function scheduleSaveBarrier(reason = 'auto') {
  scheduledBarrierReason = reason;
  autoBarrierDirty = true;
  if (autoBarrierInFlight) return;
  if (autoBarrierTimerId !== null) {
    clearTimeout(autoBarrierTimerId);
  }
  barrierScheduled = true;
  const generation = authorityGeneration;
  autoBarrierTimerId = setTimeout(async () => {
    autoBarrierTimerId = null;
    barrierScheduled = false;
    if (generation !== authorityGeneration || !marketClient) return;
    autoBarrierInFlight = true;
    autoBarrierDirty = false;
    const nextReason = scheduledBarrierReason;
    scheduledBarrierReason = 'auto';
    try {
      await requestSaveBarrier(nextReason);
    } catch {
      // requestSaveBarrier already publishes the save failure state.
    } finally {
      autoBarrierInFlight = false;
      if (
        autoBarrierDirty &&
        generation === authorityGeneration &&
        marketClient
      ) {
        scheduleSaveBarrier(scheduledBarrierReason);
      }
    }
  }, AUTO_SAVE_DEBOUNCE_MS);
}

function crossedUnsavedWorldDay(snapshot) {
  if (!snapshot || frameAutoSaveSuppression > 0) return false;
  const tick = Number(snapshot.worldTick);
  if (!Number.isSafeInteger(tick) || tick <= lastFrameAutoSaveTick) {
    return false;
  }
  lastFrameAutoSaveTick = tick;
  return true;
}

function initialMarketReady(snapshot) {
  const symbols = Object.entries(snapshot?.symbols ?? {});
  if (symbols.length === 0) return false;
  return symbols.every(
    ([, security]) => {
      const bestBid = security.bids?.[0];
      const bestAsk = security.asks?.[0];
      return Boolean(
        Number.isSafeInteger(security.lastPriceTicks) &&
          Number.isSafeInteger(security.limitDownTicks) &&
          Number.isSafeInteger(security.limitUpTicks) &&
          Number.isSafeInteger(bestBid?.priceTicks) &&
          Number.isSafeInteger(bestBid?.quantity) &&
          Number.isSafeInteger(bestBid?.orderCount) &&
          bestBid.quantity > 0 &&
          bestBid.orderCount > 0 &&
          Number.isSafeInteger(bestAsk?.priceTicks) &&
          Number.isSafeInteger(bestAsk?.quantity) &&
          Number.isSafeInteger(bestAsk?.orderCount) &&
          bestAsk.quantity > 0 &&
          bestAsk.orderCount > 0 &&
          bestBid.priceTicks < bestAsk.priceTicks &&
          bestBid.priceTicks >= security.limitDownTicks &&
          bestAsk.priceTicks <= security.limitUpTicks
      );
    },
  );
}

function requireInitialMarket(snapshot) {
  if (!initialMarketReady(snapshot)) {
    throw new Error(
      '初始市场盘口尚未就绪，请重新进入当前世界。',
    );
  }
  return snapshot;
}

function marketStagePayload(
  snapshot = marketSnapshot,
) {
  if (!snapshot) return null;
  return {
    ...snapshot,
    derivativesProjection:
      currentDerivativesProjection(),
  };
}

function refreshCurrentDerivativesDom() {
  if (
    screen !== 'game' ||
    activeRoute !== 'market' ||
    !marketStage ||
    !isPublishedDerivativesProjection(
      derivativesProjection,
    )
  ) {
    return false;
  }
  const accepted = marketStage.update(
    marketStagePayload(),
  );
  const host = document.querySelector(
    '[data-testid="market-stage-host"]',
  );
  if (host) {
    host.dataset.derivativesAuthorityNowMs =
      String(
        derivativesProjection.authorityNowMs ??
          derivativesProjection.nowMs ??
          0,
      );
    host.dataset.derivativesAuthorityCommitSeq =
      String(
        derivativesProjection
          .authorityCommitSeq ??
          derivativesProjection.commitSeq ??
          0,
      );
    host.dataset.derivativesRefreshAccepted =
      accepted ? 'true' : 'false';
  }
  return accepted;
}

function observeMarketFrame(
  frame,
  snapshot,
  derivativesPatch,
  generation,
) {
  if (generation !== authorityGeneration) return;
  marketSnapshot = snapshot;
  const stageHost = document.querySelector(
    '[data-testid="market-stage-host"]',
  );
  if (stageHost) {
    stageHost.dataset.observedFrameNowMs =
      String(snapshot?.nowMs ?? 0);
    stageHost.dataset.observedFrameCommitSeq =
      String(snapshot?.commitSeq ?? 0);
    stageHost.dataset.observedFrameDerivativesNowMs =
      String(
        snapshot?.derivatives
          ?.authorityNowMs ??
          snapshot?.derivatives?.nowMs ??
          0,
      );
    stageHost.dataset.cachedDerivativesNowMs =
      String(
        derivativesProjection
          ?.authorityNowMs ??
          derivativesProjection?.nowMs ??
          0,
      );
  }
  let derivativeChanged = false;
  try {
    derivativeChanged =
      acceptDerivativesPublication(
        snapshot?.derivatives ??
          derivativesPatch,
        {
          commitSeq: snapshot?.commitSeq,
          nowMs: snapshot?.nowMs,
        },
      );
    if (derivativeChanged) {
      refreshCurrentDerivativesDom();
    }
  } catch (error) {
    if (stageHost) {
      stageHost.dataset.derivativesPublicationError =
        error instanceof Error
          ? [error.name, error.message].join(':')
          : String(error);
    }
    throw error;
  }
  if (stageHost) {
    stageHost.dataset.derivativesPublicationChanged =
      derivativeChanged ? 'true' : 'false';
  }
  if (shouldPublishVisibleFrame(snapshot)) {
    const stageStartedAt = performance.now();
    marketStage?.update(marketStagePayload(snapshot));
    if (stageHost) {
      stageHost.dataset.marketFrameUpdateMs = String(
        performance.now() - stageStartedAt,
      );
    }
    refreshWorldExperienceDom();
  }
  if (crossedUnsavedWorldDay(snapshot)) {
    scheduleSaveBarrier('auto-world-day');
  }
}

function observeMarketRealtime(update, snapshot, generation) {
  if (generation !== authorityGeneration) return;
  marketSnapshot = snapshot;
  const stageHost = document.querySelector(
    '[data-testid="market-stage-host"]',
  );
  if (stageHost) {
    stageHost.dataset.observedRealtimeNowMs =
      String(snapshot?.nowMs ?? 0);
    stageHost.dataset.observedRealtimeCommitSeq =
      String(snapshot?.commitSeq ?? 0);
  }
  const stageStartedAt = performance.now();
  marketStage?.updateRealtime({
    ...marketStagePayload(snapshot),
    realtimeUpdate: update,
  });
  if (stageHost) {
    stageHost.dataset.marketRealtimeUpdateMs = String(
      performance.now() - stageStartedAt,
    );
  }
}

function observeWorld2D(nextWorld, _message, generation) {
  if (
    generation !== authorityGeneration ||
    !nextWorld?.world?.id
  ) {
    return;
  }
  applyAuthorityPublication({
    world: {
      publication: 'lzy_world_public_v1',
      commitSeq:
        nextWorld.experience?.world2d?.authorityCommitSeq ?? null,
      state: nextWorld,
    },
  });
  const spatial = currentWorld2DProjection();
  world2dRuntime?.update(spatial, currentOpenWorldCityProjection());
  updateWorld2DSemanticDom(spatial);
  maybeCompleteWorld2DInteraction(spatial);
}

function observeMarketReceipt(receipt, generation) {
  if (generation !== authorityGeneration) return;
  if (isMarketReceipt(receipt)) {
    latestMarketReceipt = marketReceiptCore(receipt);
  }
  applyAuthorityPublication(receipt);
  if (receipt?.marketSnapshot) {
    marketStage?.updateCommand(
      marketStagePayload(
        receipt.marketSnapshot,
      ),
    );
    marketStage?.receipt(
      marketReceiptCore(receipt),
    );
  }
  scheduleSaveBarrier('auto-action');
}

function isMarketReceipt(receipt) {
  return (
    receipt?.type === 'submit_order' ||
    receipt?.type === 'cancel_order'
  );
}

async function stopAuthority() {
  authorityGeneration += 1;
  if (autoBarrierTimerId !== null) {
    clearTimeout(autoBarrierTimerId);
    autoBarrierTimerId = null;
  }
  barrierScheduled = false;
  autoBarrierInFlight = false;
  autoBarrierDirty = false;
  scheduledBarrierReason = 'auto';
  destroyMarketStage();
  destroyMarketIntelligence();
  destroyWorld2DRuntime();
  const client = marketClient;
  marketClient = null;
  marketSnapshot = null;
  marketCheckpoint = null;
  derivativesProjection = null;
  latestMarketReceipt = null;
  world2dControlTail = Promise.resolve();
  world2dCommandOrdinal = 0;
  pendingWorld2DInteraction = null;
  confirmedBarrier = null;
  confirmedCommitSeq = -1;
  frameAutoSaveSuppression = 0;
  lastFrameAutoSaveTick = -1;
  visibleFramePublicationGate.reset();
  if (client) await client.destroy();
  await barrierTail.catch(() => null);
  barrierTail = Promise.resolve(null);
}

async function initializeAuthority({
  initialWorld,
  checkpoint = null,
  reason,
}) {
  await stopAuthority();
  world = cloneValue(initialWorld);
  derivativesProjection =
    isPublishedDerivativesProjection(
      world?.derivatives,
    )
      ? world.derivatives
      : getDerivativesProjection(world);
  lastFrameAutoSaveTick = Number(world.world?.tick) || 0;
  const generation = authorityGeneration;
  const client = createMarketClient({
    world,
    savedState: checkpoint,
    testingAccessOpen: true,
    onFrame: (
      frame,
      snapshot,
      derivativesPatch,
    ) =>
      observeMarketFrame(
        frame,
        snapshot,
        derivativesPatch,
        generation,
      ),
    onRealtime: (update, snapshot) =>
      observeMarketRealtime(update, snapshot, generation),
    onWorld2D: (nextWorld, message) =>
      observeWorld2D(nextWorld, message, generation),
    onReceipt: (receipt) => observeMarketReceipt(receipt, generation),
    onPlaybackState: (nextPlayback) => {
      if (
        generation !== authorityGeneration ||
        nextPlayback?.playing !== false
      ) {
        return;
      }
      playbackState = 'paused';
      renderPlaybackDom();
      marketStage?.authorityFailure(
        MARKET_PLAYBACK_STOPPED_MESSAGE,
      );
      errorMessage = MARKET_PLAYBACK_STOPPED_MESSAGE;
      notice = errorMessage;
      updateLiveStatusDom();
    },
    onError: (error) => {
      if (generation !== authorityGeneration) return;
      errorMessage =
        error?.response?.requestType === 'PLAY'
          ? MARKET_PLAYBACK_STOPPED_MESSAGE
          : '市场暂时没有连接，请稍后重试。';
      notice = errorMessage;
      updateLiveStatusDom();
    },
  });
  marketClient = client;
  const ready = await client.ready;
  if (generation !== authorityGeneration || client !== marketClient) {
    await client.destroy();
    throw new Error('实时世界初始化已被新的会话替代。');
  }
  applyAuthorityPublication(ready);
  requireInitialMarket(marketSnapshot);
  await requestSaveBarrier(reason);
  if (playbackSpeed !== 1) await client.setSpeed(playbackSpeed);
  visibleFramePublicationGate.setBaseline(marketSnapshot);
  await client.play();
  playbackState = 'running';
  return ready;
}

function marketStageClient(client) {
  return {
    async play() {
      const result = await client.play();
      playbackState = 'running';
      renderPlaybackDom();
      return result;
    },
    async pause() {
      const result = await client.pause();
      playbackState = 'paused';
      renderPlaybackDom();
      return result;
    },
    async stepFrame() {
      visibleFramePublicationGate.reset();
      const result = await client.stepFrame();
      playbackState = 'paused';
      renderPlaybackDom();
      return result;
    },
    async setSpeed(speed) {
      const result = await client.setSpeed(speed);
      playbackSpeed = Number(speed);
      visibleFramePublicationGate.setBaseline(marketSnapshot);
      renderPlaybackDom();
      return result;
    },
    worldCommand(command) {
      return client.worldCommand(command);
    },
  };
}

function mountCurrentMarketStage() {
  if (
    screen !== 'game' ||
    activeRoute !== 'market' ||
    !world ||
    !marketClient
  ) {
    return;
  }
  const host = document.querySelector('#market-stage-root');
  if (!host) return;
  const generation = authorityGeneration;
  marketStage = mountMarketStage(host, {
    world,
    client: marketStageClient(marketClient),
    symbol: selectedSymbol,
    marketKind: marketMode,
    derivativesProjection:
      currentDerivativesProjection(),
    selectedDerivativeContractId,
    onWorldChange: (nextWorld) => {
      if (generation !== authorityGeneration || !nextWorld?.world?.id) return;
      applyAuthorityPublication({ worldSnapshot: nextWorld });
    },
    onSymbolChange: (symbol) => {
      if (generation !== authorityGeneration) return;
      selectedSymbol = symbol;
    },
    onMarketKindChange: (
      kind,
      selectedEntityId,
    ) => {
      if (
        generation !== authorityGeneration ||
        ![
          'stocks',
          'futures',
          'options',
        ].includes(kind)
      ) {
        return;
      }
      marketMode = kind;
      if (kind !== 'stocks') {
        derivativesSection = kind;
        selectedDerivativeContractId =
          selectedEntityId ?? null;
      }
      errorMessage = '';
    },
    onDerivativeContractChange: (
      contractId,
      kind,
    ) => {
      if (
        generation !== authorityGeneration ||
        !['futures', 'options'].includes(
          kind,
        )
      ) {
        return;
      }
      marketMode = kind;
      derivativesSection = kind;
      selectedDerivativeContractId =
        contractId ?? null;
    },
    onRoleConsoleOpen: () => {
      if (generation !== authorityGeneration) return;
      activeRoute = 'decision';
      workSection = 'desk';
      errorMessage = '';
      render();
    },
  });
  if (marketSnapshot) {
    marketStage.update({
      ...marketStagePayload(marketSnapshot),
      playing: playbackState === 'running',
      speed: playbackSpeed,
    });
  }
  if (latestMarketReceipt) marketStage.receipt(latestMarketReceipt);
}

function mountCurrentMarketIntelligence() {
  if (
    screen !== 'game' ||
    activeRoute !== 'information' ||
    !world
  ) {
    return;
  }
  const host = document.querySelector('#market-intelligence-root');
  if (!host) return;
  marketIntelligenceView = mountMarketIntelligence(host, {
    world,
    marketSnapshot,
    initialRoute: intelligenceInitialRoute,
    onRouteChange(route) {
      intelligenceInitialRoute = route;
    },
  });
}

async function persist(reason = 'manual') {
  try {
    const barrier = await requestSaveBarrier(reason);
    return Boolean(barrier);
  } catch {
    return false;
  }
}

function rejectedReceiptMessage(receipt) {
  return (
    REJECTION_LABELS[receipt.reason] ??
    '这次操作没有成功，请稍后再试。'
  );
}

function receiptFeedback(receipt, fallback) {
  const text =
    typeof receipt?.shortFeedback === 'string'
      ? publicRecordText(receipt.shortFeedback).trim()
      : '';
  return text || fallback;
}

async function performAction(action, routeAfter = null) {
  errorMessage = '';
  try {
    const receipt = await marketClient.worldCommand({
      type: 'world_action',
      actorId: 'player',
      action,
    });
    applyAuthorityPublication(receipt);
    if (receipt.status === 'rejected') {
      errorMessage = rejectedReceiptMessage(receipt);
      notice = errorMessage;
    } else {
      if (routeAfter) activeRoute = routeAfter;
      notice = receiptFeedback(receipt, '操作已完成。');
    }
    await requestSaveBarrier('auto-action');
    render();
  } catch (error) {
    console.error('WORLD_ACTION_FAILED', error);
    errorMessage = '这次操作没有完成，请稍后再试。';
    notice = errorMessage;
    render();
  }
}

async function performOrder(command, routeAfter = null) {
  errorMessage = '';
  try {
    const receipt = await marketClient.worldCommand({
      type: 'submit_order',
      actorId: 'player',
      brokerId: 'broker_lzy',
      symbol: command.symbol,
      side: command.side,
      ...(command.orderType === 'market'
        ? { orderType: 'market' }
        : { priceTicks: command.priceTicks }),
      quantity: command.quantity,
      tif: command.orderType === 'market' ? 'IOC' : command.tif ?? 'GTC',
    });
    applyAuthorityPublication(receipt);
    if (receipt.status === 'rejected') {
      errorMessage = rejectedReceiptMessage(receipt);
      notice = errorMessage;
    } else {
      notice = receiptFeedback(receipt, '订单已提交。');
    }
    if (routeAfter) activeRoute = routeAfter;
    scheduleSaveBarrier('auto-order');
    render();
  } catch {
    errorMessage = '这次下单没有成功，请检查价格、数量或稍后再试。';
    notice = errorMessage;
    render();
  }
}

function updateProfilePreview() {
  const form = document.querySelector('#create-world-form');
  const preview = document.querySelector('#profile-preview');
  if (!form || !preview) return;
  const data = new FormData(form);
  const roleType = data.get('roleType') ?? 'household';
  const startingCapitalYuan = Number(
    data.get('startingCapitalYuan'),
  );
  const startingCapitalCents =
    Number.isSafeInteger(startingCapitalYuan) &&
    Number.isSafeInteger(startingCapitalYuan * 100)
      ? startingCapitalYuan * 100
      : ROLE_CATALOG[roleType]
          .capitalContract.defaultCents;
  preview.innerHTML = renderProfilePreview(
    roleType,
    startingCapitalCents,
  );
}

function setCapitalValidation(message = '') {
  const input = document.querySelector('#capital-input');
  const validation = document.querySelector(
    '#capital-validation',
  );
  if (input) {
    input.setAttribute(
      'aria-invalid',
      message ? 'true' : 'false',
    );
  }
  if (validation) validation.textContent = message;
}

function setCapitalControlsForRole(roleType) {
  const role = ROLE_CATALOG[roleType] ??
    ROLE_CATALOG.household;
  const contract = role.capitalContract;
  const slider = document.querySelector(
    '#capital-slider',
  );
  const input = document.querySelector('#capital-input');
  const minimum = document.querySelector(
    '[data-testid="capital-minimum"]',
  );
  const maximum = document.querySelector(
    '[data-testid="capital-maximum"]',
  );
  if (input) {
    input.min = String(contract.minimumCents / 100);
    input.max = String(contract.maximumCents / 100);
    input.value = String(contract.defaultCents / 100);
  }
  if (slider) {
    slider.value = String(
      capitalSliderPositionFromCents(
        roleType,
        contract.defaultCents,
      ),
    );
  }
  if (minimum) {
    minimum.textContent =
      `最低 ${money(contract.minimumCents / 100)}`;
  }
  if (maximum) {
    maximum.textContent =
      `最高 ${money(contract.maximumCents / 100)}`;
  }
  setCapitalValidation('');
  updateProfilePreview();
}

function updateCapitalFromSlider(position) {
  const form = document.querySelector('#create-world-form');
  const input = document.querySelector('#capital-input');
  if (!form || !input) return;
  const roleType =
    new FormData(form).get('roleType') ?? 'household';
  const cents = capitalCentsFromSliderPosition(
    roleType,
    position,
  );
  input.value = String(cents / 100);
  setCapitalValidation('');
  updateProfilePreview();
}

function updateCapitalFromExactInput(value) {
  const form = document.querySelector('#create-world-form');
  const slider = document.querySelector('#capital-slider');
  if (!form || !slider) return;
  const roleType =
    new FormData(form).get('roleType') ?? 'household';
  const contract = ROLE_CATALOG[roleType].capitalContract;
  const yuan = Number(value);
  const cents = yuan * 100;
  if (
    !Number.isSafeInteger(yuan) ||
    !Number.isSafeInteger(cents) ||
    cents < contract.minimumCents ||
    cents > contract.maximumCents
  ) {
    setCapitalValidation(
      `请输入 ${money(contract.minimumCents / 100)} 至 ${money(
        contract.maximumCents / 100,
      )} 的整数元金额。`,
    );
    return;
  }
  slider.value = String(
    capitalSliderPositionFromCents(roleType, cents),
  );
  setCapitalValidation('');
  updateProfilePreview();
}

function setAllocation(value) {
  const safe = Math.min(90, Math.max(20, Number(value) || 65));
  const range = document.querySelector('#cash-allocation');
  const output = document.querySelector('#cash-allocation-output');
  if (range) range.value = String(safe);
  if (output) output.textContent = `现金 ${safe}% · 股票 ${100 - safe}%`;
}

function updateLimitForSelection() {
  const form = document.querySelector('#order-form');
  if (!form) return;
  const data = new FormData(form);
  const symbol = data.get('symbol');
  const side = data.get('side');
  const limit = document.querySelector('#order-limit');
  if (limit) limit.value = String(bestLimit(symbol, side));
  updateOrderPreview();
}

function updateOrderPreview() {
  const form = document.querySelector('#order-form');
  const preview = document.querySelector('#order-preview');
  if (!form || !preview) return;
  const data = new FormData(form);
  const symbol = data.get('symbol');
  const side = data.get('side');
  const quantity = Number(data.get('quantity'));
  const limitPrice = Number(data.get('limitPrice'));
  const orderType = data.get('orderType') === 'market' ? 'market' : 'limit';
  const markup = orderPreviewHtml(
    symbol,
    side,
    quantity,
    limitPrice,
    orderType,
  );
  preview.innerHTML = markup;
  const highImpact = markup.includes('高可见影响');
  preview.dataset.impact = highImpact ? 'high' : 'normal';
}

function updateDerivativeOrderPreview(form) {
  const preview = form?.querySelector(
    '[data-derivatives-order-preview]',
  );
  if (!preview) return;
  const data = new FormData(form);
  const priceTicks = Math.round(
    Number(data.get('limitPrice')) * 100,
  );
  const tickValueCents = Number(
    form.dataset.derivativesTickValueCents,
  );
  const quantity = Number(data.get('quantity'));
  if (
    !Number.isSafeInteger(priceTicks) ||
    priceTicks <= 0 ||
    !Number.isSafeInteger(tickValueCents) ||
    tickValueCents <= 0 ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0
  ) {
    preview.innerHTML =
      '<small>委托金额</small><strong>请填写价格和数量</strong>';
    return;
  }
  const totalCents =
    priceTicks * tickValueCents * quantity;
  const option =
    form.dataset.derivativesContractType === 'option';
  const limit = data.get('orderType') === 'limit';
  const label = option
    ? `${limit ? '限价' : '参考'}总权利金`
    : `${limit ? '限价' : '参考'}名义金额`;
  const quantityUnit =
    form.dataset.derivativesQuantityUnit ??
    (option ? '张' : '手');
  preview.innerHTML = `<small>${label} · ${number(
    quantity,
  )}${escapeHtml(quantityUnit)}</small><strong>${money(
    totalCents / 100,
  )}</strong>`;
}

function updateOrderTypeControls() {
  const form = document.querySelector('#order-form');
  if (!form) return;
  const data = new FormData(form);
  const marketOrder = data.get('orderType') === 'market';
  const limit = form.querySelector('#order-limit');
  const submit = form.querySelector('[data-testid="submit-order"]');
  if (limit) limit.disabled = marketOrder;
  if (submit) {
    submit.textContent = marketOrder
      ? '提交市价订单'
      : '提交限价订单';
  }
  updateOrderPreview();
}

async function createConfiguredWorld(form) {
  errorMessage = '';
  try {
    const data = new FormData(form);
    const cashPercent = Number(
      document.querySelector('#cash-allocation')?.value ?? 65,
    );
    const startingCapitalYuan = Number(
      data.get('startingCapitalYuan'),
    );
    if (!Number.isSafeInteger(startingCapitalYuan)) {
      setCapitalValidation('可控资本必须填写整数元金额。');
      throw new RangeError('Invalid starting capital.');
    }
    const configuredWorld = createWorld({
      roleType: data.get('roleType'),
      startingCapitalCents: startingCapitalYuan * 100,
      seed: data.get('seed'),
      interfaceMode: 'novice',
      tradingAccessMode: 'testing_open',
      allocation: {
        cash: cashPercent / 100,
        equity: (100 - cashPercent) / 100,
      },
    });
    activeRoute = 'today';
    interfaceMode = 'novice';
    playbackState = 'running';
    playbackSpeed = 1;
    lifeSection = 'home';
    lifeShopCategory = 'food';
    workSection = 'desk';
    marketMode = 'stocks';
    derivativesSection = 'futures';
    selectedDerivativeContractId = null;
    saveRecoveryAvailable = false;
    selectedSymbol =
      Object.keys(configuredWorld.market.securities)[1] ??
      Object.keys(configuredWorld.market.securities)[0];
    saveState = 'saving';
    notice = '正在进入新世界…';
    await initializeAuthority({
      initialWorld: configuredWorld,
      checkpoint: null,
      reason: 'world-created',
    });
    screen = 'game';
    notice = '';
    render();
  } catch (error) {
    console.error('CREATE_WORLD_FAILED', error);
    await stopAuthority();
    errorMessage = '新世界暂时没有打开，请重试。';
    screen = 'create';
    render();
  }
}

root.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  if (
    target.closest(
      '[data-testid="market-stage"]',
    )
  ) {
    return;
  }
  const action = target.dataset.action;

  if (action === 'new-world') {
    errorMessage = '';
    screen = 'create';
    render();
  } else if (action === 'create-world') {
    const form = document.querySelector('#create-world-form');
    if (form) {
      await createConfiguredWorld(form);
    } else {
      errorMessage = '无法创建世界：配置表单不可用。';
      render();
    }
  } else if (action === 'back-welcome') {
    errorMessage = '';
    screen = 'welcome';
    render();
  } else if (action === 'continue') {
    try {
      const loaded = loadGameState();
      if (!loaded?.world) throw new Error('没有找到可用存档。');
      const metadata = getSaveMeta() ?? {};
      const marketMetadata =
        normalizeMarketTerminalMetadata(metadata);
      activeRoute =
        marketMetadata.activeRoute;
      marketMode =
        marketMetadata.marketMode;
      selectedSymbol =
        marketMetadata.selectedSymbol &&
        loaded.world.market.securities[
          marketMetadata.selectedSymbol
        ]
          ? marketMetadata.selectedSymbol
          : Object.keys(loaded.world.market.securities)[0];
      interfaceMode =
        metadata.interfaceMode === 'expert' ? 'expert' : 'novice';
      lifeSection = ['home', 'shop', 'bag'].includes(metadata.lifeSection)
        ? metadata.lifeSection
        : 'home';
      lifeShopCategory = LIFE_CATEGORY_LABELS[metadata.lifeShopCategory]
        ? metadata.lifeShopCategory
        : 'food';
      workSection = WORK_SECTIONS.has(metadata.workSection)
        ? metadata.workSection
        : 'desk';
      derivativesSection =
        marketMode === 'options'
          ? 'options'
          : 'futures';
      selectedDerivativeContractId =
        typeof metadata.selectedDerivativeContractId ===
        'string'
          ? metadata.selectedDerivativeContractId
          : null;
      playbackSpeed = [1, 4, 16].includes(Number(metadata.playbackSpeed))
        ? Number(metadata.playbackSpeed)
        : 1;
      playbackState = 'running';
      lastSavedAt = metadata.savedAt ?? null;
      saveState = 'saving';
      await initializeAuthority({
        initialWorld: loaded.world,
        checkpoint: loaded.checkpoint,
        reason: loaded.checkpoint ? 'continue' : 'legacy-realtime-migration',
      });
      saveState = 'saved';
      notice = loaded.migration ? '存档已恢复。' : '';
      errorMessage = '';
      saveRecoveryAvailable = false;
      screen = 'game';
      render();
    } catch {
      await stopAuthority();
      errorMessage = '这个存档暂时无法打开，原存档仍保留。';
      saveRecoveryAvailable = true;
      render();
    }
  } else if (action === 'history-filter') {
    const layer = target.dataset.historyLayer;
    if (HISTORY_LAYERS.has(layer)) {
      historyLayer = layer;
      render();
    }
  } else if (action === 'world2d-interaction') {
    const spatial = currentWorld2DProjection();
    const entry = spatial?.interactables?.find(
      (candidate) =>
        candidate.entityId === target.dataset.entityId,
    );
    if (!entry) return;
    if (!entry.available) {
      notice = entry.unavailableReason ?? '当前还不能这样做。';
      updateLiveStatusDom();
      return;
    }
    if (entry.distanceQ <= entry.maxDistanceQ) {
      pendingWorld2DInteraction = null;
      await activateWorld2DInteraction(entry);
      return;
    }
    if (playbackState !== 'running') {
      pendingWorld2DInteraction = null;
      notice = `世界已暂停；继续运行后才能走向${entry.labelZh}。`;
      updateLiveStatusDom();
      return;
    }
    pendingWorld2DInteraction = entry.entityId;
    notice = `正在走向${entry.labelZh}…`;
    updateLiveStatusDom();
    await sendWorld2DControl({
      kind: 'move_to',
      targetAnchorId: entry.standAnchorId,
    });
  } else if (action === 'open-world-city-intent') {
    const city = currentOpenWorldCityProjection();
    const request = compileOpenWorldCityRequestFromDataset(
      target.dataset,
    );
    if (!city || !request) return;
    if (request.kind === 'move_to') {
      const spatial = currentWorld2DProjection();
      const entry = spatial?.interactables?.find(
        (candidate) =>
          candidate.placeId === request.toPlaceId,
      );
      if (!entry) {
        notice = '这处地点尚未进入当前可步行场景。';
        updateLiveStatusDom();
        return;
      }
      if (entry.distanceQ <= entry.maxDistanceQ) {
        pendingWorld2DInteraction = null;
        await activateWorld2DInteraction(entry);
        return;
      }
      if (playbackState !== 'running') {
        notice = `世界已暂停；继续运行后才能走向${entry.labelZh}。`;
        updateLiveStatusDom();
        return;
      }
      pendingWorld2DInteraction = entry.entityId;
      notice = `正在走向${entry.labelZh}…`;
      updateLiveStatusDom();
      await sendWorld2DControl({
        kind: 'move_to',
        targetAnchorId: entry.standAnchorId,
      });
      return;
    }
    target.disabled = true;
    target.dataset.pending = 'true';
    await performAction(
      {
        type: 'open_world_city_action',
        baseCommitSeq: city.authorityCommitSeq,
        request,
      },
      'today',
    );
  } else if (action === 'entertainment-intent') {
    const entertainment = currentEntertainmentProjection();
    const kind = target.dataset.entertainmentKind;
    const id = target.dataset.entertainmentId;
    const version = Number(target.dataset.entertainmentVersion);
    if (
      !entertainment ||
      !['accept_offer', 'join_activity'].includes(kind) ||
      !id ||
      !Number.isSafeInteger(version)
    ) {
      return;
    }
    const request = kind === 'accept_offer'
      ? {
          kind,
          offerId: id,
          offerVersion: version,
          quantity: 1,
        }
      : {
          kind,
          activityId: id,
          activityVersion: version,
        };
    target.disabled = true;
    target.dataset.pending = 'true';
    await performAction(
      {
        type: 'entertainment_action',
        baseCommitSeq: entertainment.authorityCommitSeq,
        request,
      },
      'today',
    );
  } else if (action === 'route') {
    const route = target.dataset.route;
    if (ROUTES.has(route)) {
      if (route === 'information') {
        intelligenceInitialRoute = { page: 'overview' };
      }
      activeRoute = route;
      errorMessage = '';
      render();
    }
  } else if (action === 'life-place') {
    lifeSection = ['home', 'shop', 'bag'].includes(
      target.dataset.lifeSection,
    )
      ? target.dataset.lifeSection
      : 'home';
    activeRoute = 'life';
    errorMessage = '';
    render();
  } else if (action === 'life-section') {
    const section = target.dataset.lifeSection;
    if (['home', 'shop', 'bag'].includes(section)) {
      lifeSection = section;
      errorMessage = '';
      render();
    }
  } else if (action === 'work-section') {
    const section = target.dataset.workSection;
    if (WORK_SECTIONS.has(section)) {
      workSection = section;
      errorMessage = '';
      render();
    }
  } else if (
    action === 'research-quant-strategy' ||
    action === 'upgrade-quant-strategy' ||
    action === 'remove-quant-strategy'
  ) {
    const strategyId = target.dataset.strategyId;
    if (!strategyId) return;
    target.disabled = true;
    const command = {
      'research-quant-strategy': 'research_quant_strategy',
      'upgrade-quant-strategy': 'upgrade_quant_strategy',
      'remove-quant-strategy': 'remove_quant_strategy',
    }[action];
    await performAction(
      { type: 'role_action', command, strategyId },
      'decision',
    );
  } else if (action === 'download-quant-strategy-template') {
    const blob = new Blob(
      [JSON.stringify(playerStrategyTemplate(), null, 2)],
      { type: 'application/json' },
    );
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'lzy-quant-strategy-template.json';
    link.click();
    URL.revokeObjectURL(link.href);
  } else if (action === 'life-category') {
    const category = target.dataset.lifeCategory;
    if (LIFE_CATEGORY_LABELS[category]) {
      lifeShopCategory = category;
      errorMessage = '';
      render();
    }
  } else if (action === 'derivatives-section') {
    const section = target.dataset.derivativesSection;
    if (
      ['futures', 'options', 'financing'].includes(
        section,
      )
    ) {
      marketMode =
        section === 'financing'
          ? 'stocks'
          : section;
      derivativesSection =
        marketMode === 'options'
          ? 'options'
          : 'futures';
      selectedDerivativeContractId = null;
      errorMessage = '';
    }
  } else if (action === 'derivatives-contract') {
    selectedDerivativeContractId =
      target.dataset.derivativesContract ?? null;
    errorMessage = '';
  } else if (action === 'derivatives-underlying') {
    selectedDerivativeContractId =
      target.dataset.derivativesDefaultContract ??
      null;
    errorMessage = '';
  } else if (action === 'derivatives-enable') {
    const permission =
      target.dataset.derivativesPermission;
    if (
      ![
        'margin_financing',
        'securities_lending',
        'option_buyer',
        'futures_trading',
      ].includes(permission)
    ) {
      return;
    }
    target.disabled = true;
    await performAction(
      {
        type: 'derivatives_action',
        command: {
          type: 'ENABLE_PERMISSION',
          permission,
        },
      },
      'market',
    );
  } else if (action === 'derivatives-close') {
    const quantity = Number(
      target.dataset.derivativesQuantity,
    );
    const side = target.dataset.derivativesSide;
    const contractId =
      target.dataset.derivativesContract;
    if (
      !contractId ||
      !['buy', 'sell'].includes(side) ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    ) {
      return;
    }
    target.disabled = true;
    await performAction(
      {
        type: 'derivatives_action',
        command: {
          type: 'SUBMIT_ORDER',
          contractId,
          side,
          orderType: 'market',
          quantity,
        },
      },
      'market',
    );
  } else if (action === 'derivatives-cancel') {
    const contractId =
      target.dataset.derivativesContract;
    const orderId = target.dataset.derivativesOrder;
    if (!contractId || !orderId) return;
    target.disabled = true;
    await performAction(
      {
        type: 'derivatives_action',
        command: {
          type: 'CANCEL_ORDER',
          contractId,
          orderId,
        },
      },
      'market',
    );
  } else if (action === 'life-action') {
    const command = target.dataset.lifeCommand;
    const itemId = target.dataset.lifeItem;
    const instanceId = target.dataset.lifeInstance;
    const mode = target.dataset.lifeMode;
    if (
      ![
        'buy_item',
        'use_item',
        'rest',
        'place_asset',
        'activate_asset',
        'work_shift',
        'repair_asset',
        'sell_asset',
        'use_service',
        'cancel_service',
        'settle_obligations',
      ].includes(command) ||
      (
        ![
          'rest',
          'work_shift',
          'place_asset',
          'activate_asset',
          'repair_asset',
          'sell_asset',
          'settle_obligations',
        ].includes(command) &&
        mode !== 'maintain_asset' &&
        !LIFE_ITEM_BY_ID[itemId]
      )
    ) {
      return;
    }
    target.disabled = true;
    target.dataset.pending = 'true';
    await performAction(
      {
        type: 'life_action',
        command,
        ...(itemId ? { itemId } : {}),
        ...(instanceId ? { instanceId } : {}),
        ...(mode ? { mode } : {}),
      },
      target.dataset.lifeRoute === 'decision' ? 'decision' : 'life',
    );
  } else if (action === 'social-career-action') {
    const socialAction = socialCareerActionFromDataset(
      target.dataset,
    );
    if (!socialAction) return;
    target.disabled = true;
    target.dataset.pending = 'true';
    await performAction(
      {
        ...socialAction,
        availableCashCents: Math.max(
          0,
          Math.floor(availableTradingCashView() * 100),
        ),
      },
      'decision',
    );
  } else if (action === 'verify-clue') {
    await performAction(
      { type: 'verify_clue', clueId: target.dataset.clueId },
      activeRoute,
    );
  } else if (action === 'open-company-information') {
    const companyId = target.dataset.companyId;
    intelligenceInitialRoute = companyId
      ? {
          page: 'company',
          companyId,
          ...(target.dataset.section
            ? { section: target.dataset.section }
            : {}),
        }
      : { page: 'overview' };
    activeRoute = 'information';
    errorMessage = '';
    render();
  } else if (action === 'open-market-mode') {
    const requestedMode = target.dataset.marketMode;
    marketMode = ['stocks', 'futures', 'options'].includes(
      requestedMode,
    )
      ? requestedMode
      : 'stocks';
    derivativesSection =
      marketMode === 'options' ? 'options' : 'futures';
    activeRoute = 'market';
    errorMessage = '';
    render();
  } else if (action === 'choose-security') {
    selectedSymbol = target.dataset.symbol;
    activeRoute = 'market';
    marketMode = 'stocks';
    render();
  } else if (action === 'world-toggle') {
    try {
      if (playbackState === 'running') {
        await marketClient?.pause();
        playbackState = 'paused';
      } else {
        await marketClient?.play();
        playbackState = 'running';
      }
      renderPlaybackDom();
    } catch {
      errorMessage = '时间控制暂时没有响应。';
      notice = errorMessage;
      renderPlaybackDom();
    }
  } else if (action === 'save') {
    const saved = await persist('manual');
    notice = saved ? `已手动保存：${worldDate()}。` : errorMessage;
    const live = document.querySelector('[data-testid="live-status"]');
    if (live) live.textContent = notice;
  } else if (action === 'set-mode') {
    interfaceMode = target.dataset.mode === 'expert' ? 'expert' : 'novice';
    notice = '';
    render();
  } else if (action === 'download-save') {
    try {
      const archive = await exportSavedGameArchive();
      const blob = new Blob([archive], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `lzy-save-${new Date().toISOString().replaceAll(':', '-')}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      errorMessage = '';
    } catch {
      errorMessage = '存档副本暂时无法下载。';
      render();
    }
  } else if (action === 'restart-open') {
    const dialog = document.querySelector('#restart-dialog');
    if (typeof dialog?.showModal === 'function') dialog.showModal();
    else dialog?.setAttribute('open', '');
  } else if (action === 'restart-cancel') {
    const dialog = document.querySelector('#restart-dialog');
    if (typeof dialog?.close === 'function') dialog.close();
    else dialog?.removeAttribute('open');
  } else if (action === 'restart-confirm') {
    try {
      await stopAuthority();
      clearSavedWorld();
      world = null;
      screen = 'create';
      activeRoute = 'today';
      interfaceMode = 'novice';
      playbackState = 'running';
      playbackSpeed = 1;
      lifeSection = 'home';
      lifeShopCategory = 'food';
      workSection = 'desk';
      marketMode = 'stocks';
      derivativesSection = 'futures';
      selectedDerivativeContractId = null;
      saveRecoveryAvailable = false;
      saveState = 'idle';
      lastSavedAt = null;
      notice = '';
      errorMessage = '';
      render();
    } catch {
      errorMessage = '没有成功重新开始，当前存档仍保留。';
      notice = errorMessage;
      render();
    }
  }
});

root.addEventListener('change', async (event) => {
  const strategyInput = event.target.closest?.(
    '[data-testid="quant-strategy-file"]',
  );
  if (strategyInput) {
    const file = strategyInput.files?.[0];
    strategyInput.value = '';
    if (!file) return;
    if (file.size > 64 * 1024) {
      errorMessage = '策略文件超过 64 KiB 上限。';
      notice = errorMessage;
      render();
      return;
    }
    try {
      const manifest = JSON.parse(await file.text());
      await performAction(
        {
          type: 'role_action',
          command: 'import_quant_strategy',
          manifest,
        },
        'decision',
      );
    } catch {
      errorMessage = '策略文件不是有效且合规的声明式 JSON。';
      notice = errorMessage;
      render();
    }
    return;
  }
  const input = event.target.closest(
    '[data-testid="import-save-input"]',
  );
  if (!input) return;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    await importSavedGameArchive(await file.text());
    errorMessage = '';
    notice = '存档副本已导入，可以继续进入原世界。';
    saveRecoveryAvailable = false;
    screen = 'welcome';
    render();
  } catch {
    errorMessage = '这个存档副本无法导入，当前存档仍保留。';
    saveRecoveryAvailable = true;
    render();
  }
});

root.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  if (
    form.closest?.(
      '[data-testid="market-stage"]',
    )
  ) {
    return;
  }

  if (form.id === 'create-world-form') {
    await createConfiguredWorld(form);
    return;
  }

  const data = new FormData(form);

  if (form.id === 'quant-automation-form') {
    const selectedStrategyIds = data
      .getAll('strategyId')
      .map(String);
    if (selectedStrategyIds.length === 0) {
      errorMessage = '至少选择一个已经解锁的量化策略。';
      notice = errorMessage;
      render();
      return;
    }
    const strategyWeightsBps = Object.fromEntries(
      selectedStrategyIds.map((strategyId) => [
        strategyId,
        Math.max(
          0,
          Math.round(
            Number(data.get(`strategyWeight_${strategyId}`)) || 0,
          ),
        ),
      ]),
    );
    await performAction(
      {
        type: 'role_action',
        command: 'configure_quant_automation',
        automationEnabled: data.get('automationEnabled') === 'on',
        riskMode: String(data.get('riskMode') ?? 'balanced'),
        selectedStrategyIds,
        strategyWeightsBps,
      },
      'decision',
    );
    return;
  }

  if (form.id === 'stabilization-automation-form') {
    const numberBps = (name) =>
      Math.round(Number(data.get(name)) * 100);
    await performAction(
      {
        type: 'role_action',
        command: 'configure_stabilization_automation',
        automationEnabled: data.get('automationEnabled') === 'on',
        targetMode: String(data.get('targetMode') ?? 'balanced'),
        intensityBps: numberBps('intensityPercent'),
        breadthTriggerBps: numberBps('breadthTriggerPercent'),
        weightedReturnTriggerBps: numberBps(
          'weightedReturnTriggerPercent',
        ),
        liquidityStressTriggerBps: numberBps(
          'liquidityStressPercent',
        ),
      },
      'decision',
    );
    return;
  }

  if (form.id === 'order-form') {
    selectedSymbol = String(data.get('symbol'));
    const orderType =
      data.get('orderType') === 'market' ? 'market' : 'limit';
    await performOrder(
      {
        side: data.get('side'),
        symbol: selectedSymbol,
        quantity: Number(data.get('quantity')),
        orderType,
        ...(orderType === 'limit'
          ? {
              priceTicks:
                Math.round(Number(data.get('limitPrice')) * 100),
              tif: 'GTC',
            }
          : { tif: 'IOC' }),
      },
      activeRoute,
    );
    return;
  }

  if (form.id === 'derivatives-order-form') {
    const contractId = String(
      data.get('contractId') ?? '',
    );
    const side = data.get('side');
    const orderType =
      data.get('orderType') === 'limit'
        ? 'limit'
        : 'market';
    const quantity = Number(data.get('quantity'));
    const limitPrice = Number(data.get('limitPrice'));
    if (
      !contractId ||
      !['buy', 'sell'].includes(side) ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      (
        orderType === 'limit' &&
        (!Number.isFinite(limitPrice) || limitPrice <= 0)
      )
    ) {
      errorMessage = '请检查价格和数量。';
      notice = errorMessage;
      render();
      return;
    }
    selectedDerivativeContractId = contractId;
    await performAction(
      {
        type: 'derivatives_action',
        command: {
          type: 'SUBMIT_ORDER',
          contractId,
          side,
          orderType,
          quantity,
          ...(orderType === 'limit'
            ? {
                priceTicks: Math.round(
                  limitPrice * 100,
                ),
                tif: 'GTC',
              }
            : {}),
        },
      },
      'market',
    );
    return;
  }

  if (form.id === 'derivatives-financing-form') {
    const amount = Number(data.get('amount'));
    const financingAction =
      event.submitter?.value === 'repay'
        ? 'REPAY_MARGIN_CREDIT'
        : 'DRAW_MARGIN_CREDIT';
    if (!Number.isFinite(amount) || amount <= 0) {
      errorMessage = '请输入有效金额。';
      notice = errorMessage;
      render();
      return;
    }
    await performAction(
      {
        type: 'derivatives_action',
        command: {
          type: financingAction,
          amountCents: Math.round(amount * 100),
        },
      },
      'market',
    );
    return;
  }

  if (form.id === 'derivatives-lending-form') {
    const securityId = String(
      data.get('securityId') ?? '',
    );
    const quantity = Number(data.get('quantity'));
    const commandType =
      event.submitter?.value === 'return'
        ? 'RETURN_SECURITY'
        : 'BORROW_SECURITY';
    if (
      !securityId ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    ) {
      errorMessage = '请检查股票和数量。';
      notice = errorMessage;
      render();
      return;
    }
    await performAction(
      {
        type: 'derivatives_action',
        command: {
          type: commandType,
          securityId,
          quantity,
        },
      },
      'market',
    );
    return;
  }

  if (form.id === 'role-action-form') {
    const command = form.dataset.command;
    const action = { type: 'role_action', command };
    if (command === 'set_reserve') {
      action.amount = Number(data.get('amount'));
    } else if (command === 'schedule_production') {
      action.companyId = form.dataset.companyId;
      action.units = Number(data.get('units'));
    } else if (command === 'set_liquidity_buffer') {
      action.ratio = Number(data.get('ratioPercent')) / 100;
    }
    await performAction(action, activeRoute);
    return;
  }
});

root.addEventListener('change', async (event) => {
  if (event.target.matches('#world-speed')) {
    const speed = Number(event.target.value);
    if (![1, 4, 16].includes(speed)) return;
    try {
      await marketClient?.setSpeed(speed);
      playbackSpeed = speed;
      visibleFramePublicationGate.setBaseline(marketSnapshot);
      renderPlaybackDom();
    } catch {
      errorMessage = '倍速暂时没有切换。';
      notice = errorMessage;
      renderPlaybackDom();
    }
    return;
  }
  if (event.target.matches('[name="roleType"]')) {
    setCapitalControlsForRole(event.target.value);
  }
  if (event.target.matches('#order-symbol')) {
    selectedSymbol = event.target.value;
    updateLimitForSelection();
  }
  if (event.target.matches('[name="side"]')) {
    updateLimitForSelection();
  }
  if (event.target.matches('#order-type')) {
    updateOrderTypeControls();
  }
  const derivativeOrderForm = event.target.closest?.(
    '#derivatives-order-form',
  );
  if (derivativeOrderForm) {
    updateDerivativeOrderPreview(derivativeOrderForm);
  }
});

root.addEventListener('input', (event) => {
  if (event.target.matches('#capital-slider')) {
    updateCapitalFromSlider(event.target.value);
  }
  if (event.target.matches('#capital-input')) {
    updateCapitalFromExactInput(event.target.value);
  }
  if (event.target.matches('#cash-allocation')) {
    setAllocation(event.target.value);
  }
  if (event.target.matches('#order-quantity, #order-limit')) {
    updateOrderPreview();
  }
  const derivativeOrderForm = event.target.closest?.(
    '#derivatives-order-form',
  );
  if (derivativeOrderForm) {
    updateDerivativeOrderPreview(derivativeOrderForm);
  }
});

document.addEventListener('keydown', (event) => {
  if (
    (event.key === 'Enter' || event.key === ' ') &&
    event.target?.matches?.('button[data-action]')
  ) {
    event.preventDefault();
    event.target.click();
    return;
  }

  if (event.key === 'Escape') {
    const dialog = document.querySelector('#restart-dialog');
    if (dialog?.open && typeof dialog.close === 'function') dialog.close();
  }
});

window.addEventListener('beforeunload', () => {
  if (confirmedBarrier && world && screen === 'game') {
    try {
      saveGameState(
        {
          ...cloneValue(confirmedBarrier),
          metadata: saveBarrierMetadata('beforeunload'),
        },
        'beforeunload',
      );
    } catch {
      // Only the most recently confirmed Worker barrier is safe to rewrite here.
    }
  }
});

globalThis.__LZY__ = {
  getState: () => world,
  getMarketTerminalState: () => ({
    activeRoute,
    marketMode,
    selectedSymbol,
    selectedDerivativeContractId,
  }),
  normalizeMarketTerminalMetadata,
  getMarketSnapshot: () => marketSnapshot,
  getDerivativesProjection: () =>
    derivativesProjection,
  getCheckpoint: () => marketCheckpoint,
  getPlaybackState: () => ({
    state: playbackState,
    speed: playbackSpeed,
  }),
  getWorldExperience: () =>
    world
      ? projectWorldExperience(world, marketSnapshot, {
          includeSignals: false,
        })
      : null,
  hasSavedWorld,
  loadGameState,
};

render();

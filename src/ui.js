import {
  createWorld,
  getCompanyCatalog,
  getLifeCatalog,
  getLifeProjection,
  getRoleCatalog,
  getSocialCareerProjection,
  getDerivativesProjection,
} from './engine.js?v=20260801-01';
import {
  clearSavedWorld,
  exportSavedGameArchive,
  getSaveMeta,
  hasSavedWorld,
  hasStoredSaveArchive,
  loadGameState,
  saveGameState,
  saveGameStateAsync,
} from './storage.js?v=20260801-01';
import {
  createMarketClient,
  createVisibleFramePublicationGate,
} from './market/client.js?v=20260801-01';
import { mountMarketStage } from './market/stage.js?v=20260801-01';
import { MARKET_CLOCK_ORIGIN_OFFSET_MS } from './market/chart-domain.js?v=20260801-01';
import {
  mergeWorldAuthorityPublication,
} from './market/world-publication.js?v=20260801-01';
import { projectWorldExperience } from './experience/world-experience.js?v=20260801-01';
import {
  renderWorldlinePanel,
} from './experience/worldline-view.js?v=20260801-01';
import { projectPlayerWealth } from './experience/player-wealth.js?v=20260801-01';
import { renderPlayerWealth } from './experience/player-wealth-view.js?v=20260801-01';
import {
  mountMarketIntelligence,
} from './experience/market-intelligence-view.js?v=20260801-01';
import {
  renderCityAssetActions,
  renderCityPlaceGrid,
  renderCityResponsibilityPanel,
  renderCityServicePanel,
} from './experience/city-life-view.js?v=20260801-01';
import {
  renderSocialCareerView,
  socialCareerActionFromDataset,
} from './experience/social-career-view.js?v=20260801-01';
import {
  isPublishedDerivativesProjection,
  mergePublishedDerivativesProjection,
} from './experience/derivatives-view.js?v=20260801-01';

const root = document.querySelector('#app');
const ROLE_CATALOG = getRoleCatalog();
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
const INITIAL_LIQUIDITY_FRAME_MS = 3_000;
const INITIAL_LIQUIDITY_CHUNK_MS = 15_000;
const INITIAL_LIQUIDITY_MAX_MS = 300_000;
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
let lifeSection = 'home';
let lifeShopCategory = 'food';
let workSection = 'desk';
let marketMode = 'stocks';
let derivativesSection = 'futures';
let selectedDerivativeContractId = null;
let derivativesProjection = null;
let historyLayer = 'facts';
let saveRecoveryAvailable = false;
const AUTO_SAVE_DEBOUNCE_MS = 1_200;

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
          <small>${money(role.low.capital)} 起</small>
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
          <fieldset class="create-block create-strength-block">
            <legend>实力</legend>
            <div class="create-strength-toggle">
              <label>
                <input type="radio" name="strengthTier" value="low" checked
                  data-testid="strength-low" />
                <span>低档</span>
              </label>
              <label>
                <input type="radio" name="strengthTier" value="high"
                  data-testid="strength-high" />
                <span>高档</span>
              </label>
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
          ${renderProfilePreview('household', 'low')}
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

function renderProfilePreview(roleType, strengthTier) {
  const role = ROLE_CATALOG[roleType];
  const profile = role[strengthTier];
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
  }[roleType];

  return `
    <span class="create-vital-name">
      <small>${escapeHtml(role.label)}</small>
      <strong>${escapeHtml(profile.name)}</strong>
    </span>
    <span><small>资本</small><strong>${money(profile.capital)}</strong></span>
    <span><small>负债</small><strong>${money(profile.liabilities)}</strong></span>
    <span><small>${escapeHtml(roleDetail[0])}</small><strong>${escapeHtml(
      roleDetail[1],
    )}</strong></span>
    <span><small>研究</small><strong>${profile.research}</strong></span>
  `;
}

function renderGameScreen() {
  const [title, summary] = viewTitle();
  const life = getLifeProjection(world);
  const homeNavLabel =
    life.kind === 'organization' ? '运营' : life.homeLabel;
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
            aria-label="世界场景" data-testid="nav-today">世界</button>
          <button class="nav-button" type="button" data-action="route" data-route="market"
            aria-current="${routeIs('market')}"
            aria-label="实时市场终端" data-testid="nav-market">市场</button>
          <button class="nav-button" type="button" data-action="life-place"
            data-life-section="home"
            aria-current="${
              activeRoute === 'life' && lifeSection === 'home'
                ? 'page'
                : 'false'
            }"
            aria-label="${escapeHtml(homeNavLabel)}"
            data-testid="nav-home">${escapeHtml(homeNavLabel)}</button>
          <button class="nav-button" type="button" data-action="life-place"
            data-life-section="shop"
            aria-current="${
              activeRoute === 'life' && lifeSection === 'shop'
                ? 'page'
                : 'false'
            }"
            aria-label="商店" data-testid="nav-shop">商店</button>
          <button class="nav-button" type="button" data-action="route" data-route="decision"
            aria-current="${routeIs('decision')}"
            aria-label="工作" data-testid="nav-decision">工作</button>
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
    institution: `
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
  if (world.player.roleType === 'household') {
    return Math.max(
      0,
      world.player.cash - world.player.roleState.cashReserve,
    );
  }
  if (world.player.roleType === 'institution') {
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

function renderTodayView() {
  const view = projectWorldExperience(world, marketSnapshot, {
    includeSignals: false,
  });
  const wealthMarkup = renderPlayerWealth(
    projectPlayerWealth(world, marketSnapshot),
    { variant: 'home' },
  );
  const life = getLifeProjection(world);
  const playerNode = view.nodes.find((node) => node.kind === 'player');
  const companyNodes = view.nodes.filter((node) => node.kind === 'company');
  const actorNodes = view.nodes.filter((node) => node.kind === 'actor');
  const clockText = virtualClockText(
    view.clock.virtualMs,
    marketSnapshot?.marketClockOffsetMs,
  );
  const nodesMarkup = companyNodes
    .map(
      (node) => `
        <button class="world-node world-node-company" type="button"
          style="--node-x:${node.x}%;--node-y:${node.y}%;--node-weight:${node.weight};--node-tension:${node.tension}"
          data-action="choose-security" data-symbol="${escapeHtml(node.symbol)}"
          data-world-node="${escapeHtml(node.symbol)}"
          aria-label="${escapeHtml(node.label)}，持仓 ${number(
            node.holdingUnits,
          )} 股，价格 ${money(node.lastPriceTicks / 100)}">
          <span class="world-node-aura" aria-hidden="true"></span>
          <strong>${escapeHtml(node.label)}</strong>
          <span>${escapeHtml(node.symbol)}</span>
          <small data-world-node-price>${money(node.lastPriceTicks / 100)}</small>
          <small class="${marketDirectionClass(node.deltaBps)}"
            data-world-node-change>${node.deltaBps >= 0 ? '+' : ''}${number(
              node.deltaBps / 100,
              1,
            )}%</small>
        </button>
      `,
    )
    .join('');
  const workPlace = {
    household: '街区',
    professional: '办公室',
    operator: '企业现场',
    institution: '机构总部',
  }[world.player.roleType];
  const homePlace =
    life.kind === 'organization'
      ? organizationOperationLabel(world.player.roleType)
      : life.homeLabel;
  const shopPlace =
    world.player.roleType === 'operator'
      ? '企业采购'
      : life.kind === 'organization'
        ? '机构服务'
        : '街区商店';
  return `
    <section class="world-scene panel-enter" data-testid="world-scene">
      <header class="world-scene-head">
        <div>
          <span class="world-running-dot ${
            playbackState === 'running' ? '' : 'is-paused'
          }" aria-hidden="true"></span>
          <strong data-world-bind="scene-date">${escapeHtml(worldDate())}</strong>
          <span data-world-bind="scene-clock">${clockText}</span>
        </div>
        <div>
          <small>净资产</small>
          <strong data-testid="world-capital" data-world-bind="capital">${money(
            view.capital.netAssets,
          )}</strong>
        </div>
        <div>
          <small>现金</small>
          <strong data-world-bind="cash">${money(view.capital.cash)}</strong>
        </div>
      </header>

      ${renderWorldlinePanel(view.worldline, {
        variant: 'today',
      })}

      <div data-testid="player-wealth-home-live">
        ${wealthMarkup}
      </div>

      <div class="world-map" aria-label="本人、持仓企业与资金关系">
        <svg class="world-map-lines" viewBox="0 0 100 100"
          aria-hidden="true" focusable="false">
          <path d="M50 50 C40 38 29 29 19 24" />
          <path d="M50 50 C61 39 72 31 81 28" />
          <path d="M50 50 C52 61 53 72 54 82" />
          <path class="world-supply-line" d="M19 24 C42 8 67 11 81 28 C75 55 66 72 54 82 C35 70 24 49 19 24" />
        </svg>
        <div class="world-node world-node-player"
          style="--node-x:${playerNode.x}%;--node-y:${playerNode.y}%">
          <span class="player-orbit" aria-hidden="true"></span>
          <small>${escapeHtml(view.identity.profile)}</small>
          <strong>${escapeHtml(view.identity.label)}</strong>
          <span>现金 ${money(view.capital.cash)}</span>
        </div>
        ${nodesMarkup}
        <div class="world-actor-layer" data-testid="world-actor-layer"
          aria-label="正在发生公开活动的市场主体">
          ${renderObservableActorNodes(actorNodes)}
        </div>
      </div>

      <section class="world-places" data-testid="world-places"
        aria-label="常去地点">
        <header><strong>常去地点</strong></header>
        <div>
          <button class="world-place" type="button" data-action="life-place"
            data-life-section="home">
            <small>${life.kind === 'organization' ? '日常运营' : '日常'}</small>
            <strong>${escapeHtml(homePlace)}</strong>
            <span>${life.kind === 'organization' ? '人员' : '精力'} ${number(
              life.energy,
            )}</span>
          </button>
          <button class="world-place" type="button" data-action="life-place"
            data-life-section="shop">
            <small>消费</small>
            <strong>${escapeHtml(shopPlace)}</strong>
            <span>现金 ${money(view.capital.cash)}</span>
          </button>
          <button class="world-place" type="button" data-action="route"
            data-route="market">
            <small>交易</small>
            <strong>证券市场</strong>
            <span>${companyNodes.length} 只证券</span>
          </button>
          <button class="world-place" type="button" data-action="route"
            data-route="decision">
            <small>工作</small>
            <strong>${escapeHtml(workPlace)}</strong>
            <span>${escapeHtml(world.player.roleLabel)}</span>
          </button>
        </div>
      </section>
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
  if (world.player.roleType === 'household') {
    return [
      ['储备边界', money(state.cashReserve)],
      ['可交易现金', money(availableTradingCashView())],
      ['周期收入', money(state.monthlyIncome)],
      ['周期支出', money(state.livingExpense)],
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
        item.eligibleRoles.includes(world.player.roleType),
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
        <span>${escapeHtml(world.player.strengthTier === 'high' ? '高实力' : '基础实力')}</span>
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

function renderRoleActionForm() {
  const role = world.player.roleType;
  const state = world.player.roleState;
  if (role === 'household') {
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
          更新家庭储备边界
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
          data-testid="market-back-dashboard" aria-label="返回世界">‹ 世界</button>
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
    value.world?.state
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

function initialLiquidityReady(snapshot) {
  const symbols = Object.entries(snapshot?.symbols ?? {});
  if (symbols.length === 0) return false;
  const printedSymbols = new Set(
    (snapshot.trades ?? [])
      .filter(
        (trade) =>
          trade.source === 'realtime_order_book' &&
          Number.isSafeInteger(trade.virtualMs) &&
          Number.isSafeInteger(trade.quantity) &&
          trade.quantity > 0,
      )
      .map((trade) => trade.symbol),
  );
  return symbols.every(
    ([symbol, security]) =>
      printedSymbols.has(symbol) &&
      [security.intradayBars, security.minuteBars].some(
        (bars) =>
          Array.isArray(bars) &&
          bars.some((bar) => bar.volume > 0),
      ),
  );
}

async function warmInitialLiquidity(client, snapshot) {
  const startsEmpty =
    Number(snapshot?.nowMs) === 0 &&
    (snapshot?.quoteFrames?.length ?? 0) === 0;
  if (!startsEmpty || initialLiquidityReady(snapshot)) return snapshot;

  const startMs = Number(snapshot.nowMs) || 0;
  let elapsedMs = 0;
  let current = snapshot;
  while (
    !initialLiquidityReady(current) &&
    elapsedMs < INITIAL_LIQUIDITY_MAX_MS
  ) {
    const durationMs = Math.min(
      INITIAL_LIQUIDITY_CHUNK_MS,
      INITIAL_LIQUIDITY_MAX_MS - elapsedMs,
    );
    const result = await client.advanceVirtualTime(durationMs);
    applyAuthorityPublication(result);
    current = result.market ?? marketSnapshot;
    elapsedMs = Math.max(0, Number(current?.nowMs) - startMs);
  }

  if (!initialLiquidityReady(current)) {
    throw new Error(
      '初始市场尚未形成完整成交行情，请重新进入当前世界。',
    );
  }
  if (Number(current.nowMs) % INITIAL_LIQUIDITY_FRAME_MS !== 0) {
    throw new Error('行情尚未完成三秒刷新，请稍后再试。');
  }
  return current;
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
    marketStage?.update(
      marketStagePayload(snapshot),
    );
    refreshWorldExperienceDom();
  }
  if (crossedUnsavedWorldDay(snapshot)) {
    scheduleSaveBarrier('auto-world-day');
  }
}

function observeMarketRealtime(_update, snapshot, generation) {
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
  marketStage?.updateRealtime(
    marketStagePayload(snapshot),
  );
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
  const client = marketClient;
  marketClient = null;
  marketSnapshot = null;
  marketCheckpoint = null;
  derivativesProjection = null;
  latestMarketReceipt = null;
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
    onReceipt: (receipt) => observeMarketReceipt(receipt, generation),
    onError: () => {
      if (generation !== authorityGeneration) return;
      errorMessage = '市场暂时没有连接，请稍后重试。';
      notice = errorMessage;
    },
  });
  marketClient = client;
  const ready = await client.ready;
  if (generation !== authorityGeneration || client !== marketClient) {
    await client.destroy();
    throw new Error('实时世界初始化已被新的会话替代。');
  }
  applyAuthorityPublication(ready);
  await warmInitialLiquidity(client, marketSnapshot);
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
  const strengthTier = data.get('strengthTier') ?? 'low';
  preview.innerHTML = renderProfilePreview(roleType, strengthTier);
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
    const configuredWorld = createWorld({
      roleType: data.get('roleType'),
      strengthTier: data.get('strengthTier'),
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
  } else if (action === 'route') {
    const route = target.dataset.route;
    if (ROUTES.has(route)) {
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
      const archive = exportSavedGameArchive();
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
  if (event.target.matches('[name="roleType"], [name="strengthTier"]')) {
    updateProfilePreview();
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

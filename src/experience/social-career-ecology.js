const SCHEMA_VERSION = 'lzy-social-career-v1';
const MAX_LIVE_FACTS = 224;
const MAX_MEMORIES_PER_ACTOR = 12;
const MAX_MARKET_ACTIONS = 32;
const MAX_RECENT_DECISIONS = 24;
const MAX_CONTRACTS = 88;
const MAX_OPPORTUNITIES = 48;
const RESEARCH_NETWORK_VERSION =
  'lzy-research-access-v1';
const RESEARCH_COVERAGE_SYMBOLS = Object.freeze([
  'LZA001',
  'LZA002',
  'LZA003',
  'LZB101',
  'LZC201',
  'LZD301',
  'LZE401',
  'LZF501',
  'LZG601',
  'LZH701',
  'LZI801',
  'LZJ901',
  'LZK011',
  'LZL121',
]);

const LOCATION_TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'place_riverside_block',
    name: '河湾街区',
    kind: 'neighborhood',
    affordances: ['visit', 'rest', 'contact', 'trade'],
  }),
  Object.freeze({
    id: 'place_shared_office',
    name: '合创楼',
    kind: 'office',
    affordances: ['work', 'negotiate', 'hire', 'cooperate'],
  }),
  Object.freeze({
    id: 'place_service_lane',
    name: '长青服务巷',
    kind: 'workshop',
    affordances: ['work', 'repair', 'trade', 'hire'],
  }),
  Object.freeze({
    id: 'place_logistics_yard',
    name: '环宇货场',
    kind: 'yard',
    affordances: ['work', 'deliver', 'negotiate'],
  }),
  Object.freeze({
    id: 'place_teahouse',
    name: '拾光茶社',
    kind: 'social',
    affordances: ['visit', 'contact', 'negotiate', 'cooperate'],
  }),
  Object.freeze({
    id: 'place_civic_hall',
    name: '民生会馆',
    kind: 'public_service',
    affordances: ['visit', 'learn', 'contact', 'mediate'],
  }),
]);

const ACTOR_TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'person_lin_rong',
    name: '林蓉',
    identity: '照看家庭，也替街坊理账',
    occupation: '社区账房',
    wealthBand: '稳健',
    cash: 28_000,
    locationId: 'place_riverside_block',
    employerOrgId: null,
    skills: { finance: 0.66, craft: 0.24, sales: 0.48, operations: 0.58 },
    traits: {
      ambition: 0.42,
      reliability: 0.88,
      reciprocity: 0.8,
      risk: 0.22,
      sociability: 0.64,
      patience: 0.84,
    },
    preferences: {
      security: 0.9,
      wealth: 0.44,
      autonomy: 0.48,
      belonging: 0.82,
      status: 0.26,
      craft: 0.55,
    },
    obligations: ['每五日替三户街坊核账', '傍晚照看家人'],
  }),
  Object.freeze({
    id: 'person_xu_zheng',
    name: '许峥',
    identity: '修东西很快，不爱空口许诺',
    occupation: '维修店主',
    wealthBand: '宽裕',
    cash: 74_000,
    locationId: 'place_service_lane',
    employerOrgId: 'org_qingsong_service',
    skills: { finance: 0.36, craft: 0.9, sales: 0.55, operations: 0.72 },
    traits: {
      ambition: 0.62,
      reliability: 0.82,
      reciprocity: 0.48,
      risk: 0.38,
      sociability: 0.4,
      patience: 0.57,
    },
    preferences: {
      security: 0.6,
      wealth: 0.66,
      autonomy: 0.86,
      belonging: 0.38,
      status: 0.43,
      craft: 0.94,
    },
    obligations: ['按期交付已收定金的维修单'],
  }),
  Object.freeze({
    id: 'person_gu_lan',
    name: '顾岚',
    identity: '先找证据，再决定站哪边',
    occupation: '产业研究员',
    wealthBand: '稳健',
    cash: 51_000,
    locationId: 'place_shared_office',
    employerOrgId: 'org_xinghe_research',
    skills: { finance: 0.88, craft: 0.54, sales: 0.42, operations: 0.58 },
    traits: {
      ambition: 0.69,
      reliability: 0.78,
      reciprocity: 0.58,
      risk: 0.3,
      sociability: 0.35,
      patience: 0.76,
    },
    preferences: {
      security: 0.56,
      wealth: 0.61,
      autonomy: 0.68,
      belonging: 0.34,
      status: 0.72,
      craft: 0.86,
    },
    obligations: ['不为未核实的结论背书'],
  }),
  Object.freeze({
    id: 'person_peng_suqin',
    name: '彭素琴',
    identity: '认得街坊，也记得谁总赊账',
    occupation: '社区商户',
    wealthBand: '宽裕',
    cash: 96_000,
    locationId: 'place_riverside_block',
    employerOrgId: 'org_riverside_shop',
    skills: { finance: 0.54, craft: 0.35, sales: 0.88, operations: 0.74 },
    traits: {
      ambition: 0.51,
      reliability: 0.75,
      reciprocity: 0.67,
      risk: 0.36,
      sociability: 0.88,
      patience: 0.61,
    },
    preferences: {
      security: 0.7,
      wealth: 0.64,
      autonomy: 0.76,
      belonging: 0.8,
      status: 0.38,
      craft: 0.48,
    },
    obligations: ['老客赊账不能超过约定额度'],
  }),
  Object.freeze({
    id: 'person_song_yichuan',
    name: '宋一川',
    identity: '先保交付，再谈漂亮数字',
    occupation: '物流主管',
    wealthBand: '普通',
    cash: 32_000,
    locationId: 'place_logistics_yard',
    employerOrgId: 'org_huanyu_logistics',
    skills: { finance: 0.48, craft: 0.6, sales: 0.45, operations: 0.92 },
    traits: {
      ambition: 0.58,
      reliability: 0.9,
      reciprocity: 0.52,
      risk: 0.28,
      sociability: 0.46,
      patience: 0.7,
    },
    preferences: {
      security: 0.72,
      wealth: 0.58,
      autonomy: 0.56,
      belonging: 0.5,
      status: 0.42,
      craft: 0.78,
    },
    obligations: ['当日排车必须留出应急余量'],
  }),
  Object.freeze({
    id: 'person_tang_yanan',
    name: '唐亚楠',
    identity: '会听人说完，也会替雇主压价',
    occupation: '人才顾问',
    wealthBand: '普通',
    cash: 24_000,
    locationId: 'place_teahouse',
    employerOrgId: null,
    skills: { finance: 0.44, craft: 0.32, sales: 0.82, operations: 0.68 },
    traits: {
      ambition: 0.76,
      reliability: 0.64,
      reciprocity: 0.46,
      risk: 0.52,
      sociability: 0.92,
      patience: 0.54,
    },
    preferences: {
      security: 0.42,
      wealth: 0.78,
      autonomy: 0.72,
      belonging: 0.56,
      status: 0.68,
      craft: 0.4,
    },
    obligations: ['候选人的底价不向雇主泄露'],
  }),
  Object.freeze({
    id: 'person_wei_wen',
    name: '魏闻',
    identity: '喜欢抢先，但不会永远守约',
    occupation: '创业者',
    wealthBand: '紧张',
    cash: 8_500,
    locationId: 'place_shared_office',
    employerOrgId: null,
    skills: { finance: 0.52, craft: 0.58, sales: 0.78, operations: 0.46 },
    traits: {
      ambition: 0.96,
      reliability: 0.38,
      reciprocity: 0.34,
      risk: 0.9,
      sociability: 0.7,
      patience: 0.24,
    },
    preferences: {
      security: 0.18,
      wealth: 0.94,
      autonomy: 0.92,
      belonging: 0.26,
      status: 0.86,
      craft: 0.52,
    },
    obligations: ['十日内找到下一笔回款'],
  }),
  Object.freeze({
    id: 'person_zhao_zhen',
    name: '赵蓁',
    identity: '重视体面，也盯着责任边界',
    occupation: '客户经理',
    wealthBand: '宽裕',
    cash: 112_000,
    locationId: 'place_shared_office',
    employerOrgId: 'org_xinghe_research',
    skills: { finance: 0.76, craft: 0.38, sales: 0.9, operations: 0.62 },
    traits: {
      ambition: 0.74,
      reliability: 0.73,
      reciprocity: 0.52,
      risk: 0.44,
      sociability: 0.82,
      patience: 0.56,
    },
    preferences: {
      security: 0.56,
      wealth: 0.74,
      autonomy: 0.52,
      belonging: 0.48,
      status: 0.9,
      craft: 0.46,
    },
    obligations: ['客户承诺必须留下书面边界'],
  }),
  Object.freeze({
    id: 'person_zhou_qian',
    name: '周谦',
    identity: '不抢话，但会记住账上每个缺口',
    occupation: '独立会计',
    wealthBand: '普通',
    cash: 39_000,
    locationId: 'place_civic_hall',
    employerOrgId: null,
    skills: { finance: 0.94, craft: 0.46, sales: 0.38, operations: 0.7 },
    traits: {
      ambition: 0.48,
      reliability: 0.94,
      reciprocity: 0.68,
      risk: 0.18,
      sociability: 0.34,
      patience: 0.9,
    },
    preferences: {
      security: 0.82,
      wealth: 0.54,
      autonomy: 0.78,
      belonging: 0.46,
      status: 0.38,
      craft: 0.92,
    },
    obligations: ['不替明显不平的账目签字'],
  }),
  Object.freeze({
    id: 'person_luo_xinyi',
    name: '罗心怡',
    identity: '看重作品，也会为了现金接急单',
    occupation: '自由设计师',
    wealthBand: '紧张',
    cash: 6_800,
    locationId: 'place_teahouse',
    employerOrgId: null,
    skills: { finance: 0.3, craft: 0.86, sales: 0.58, operations: 0.4 },
    traits: {
      ambition: 0.7,
      reliability: 0.68,
      reciprocity: 0.76,
      risk: 0.58,
      sociability: 0.68,
      patience: 0.52,
    },
    preferences: {
      security: 0.4,
      wealth: 0.7,
      autonomy: 0.94,
      belonging: 0.58,
      status: 0.5,
      craft: 0.94,
    },
    obligations: ['已收定金的稿件优先交付'],
  }),
]);

const ORGANIZATION_TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'org_qingsong_service',
    name: '青松维修',
    kind: 'service_business',
    locationId: 'place_service_lane',
    cash: 182_000,
    debtPrincipal: 38_000,
    decisionWriter: 'person_xu_zheng',
    objective: 'reliability',
    capacity: 5,
    capabilities: { craft: 0.82, research: 0.2, delivery: 0.55, sales: 0.48 },
    staffIds: ['person_xu_zheng'],
  }),
  Object.freeze({
    id: 'org_xinghe_research',
    name: '星河研究社',
    kind: 'professional_firm',
    locationId: 'place_shared_office',
    cash: 264_000,
    debtPrincipal: 0,
    decisionWriter: 'person_zhao_zhen',
    objective: 'profit',
    capacity: 7,
    capabilities: { craft: 0.46, research: 0.88, delivery: 0.6, sales: 0.76 },
    staffIds: ['person_gu_lan', 'person_zhao_zhen'],
  }),
  Object.freeze({
    id: 'org_huanyu_logistics',
    name: '环宇配送',
    kind: 'operating_business',
    locationId: 'place_logistics_yard',
    cash: 316_000,
    debtPrincipal: 94_000,
    decisionWriter: 'person_song_yichuan',
    objective: 'market_share',
    capacity: 10,
    capabilities: { craft: 0.58, research: 0.24, delivery: 0.92, sales: 0.56 },
    staffIds: ['person_song_yichuan'],
  }),
  Object.freeze({
    id: 'org_riverside_shop',
    name: '河湾杂货',
    kind: 'retail_business',
    locationId: 'place_riverside_block',
    cash: 138_000,
    debtPrincipal: 12_000,
    decisionWriter: 'person_peng_suqin',
    objective: 'stability',
    capacity: 4,
    capabilities: { craft: 0.24, research: 0.16, delivery: 0.5, sales: 0.9 },
    staffIds: ['person_peng_suqin'],
  }),
]);

const OPENING_RELATIONSHIPS = Object.freeze([
  ['player', 'person_lin_rong', 54, 42, 58, 4],
  ['player', 'person_gu_lan', 46, 34, 64, 3],
  ['player', 'person_xu_zheng', 43, 28, 55, 7],
  ['person_gu_lan', 'person_zhao_zhen', 62, 68, 66, 12],
  ['person_xu_zheng', 'person_song_yichuan', 58, 48, 70, 8],
  ['person_peng_suqin', 'person_lin_rong', 72, 82, 64, 3],
  ['person_tang_yanan', 'person_wei_wen', 38, 56, 44, 26],
  ['person_luo_xinyi', 'person_wei_wen', 41, 52, 39, 22],
  ['person_zhou_qian', 'person_peng_suqin', 67, 58, 73, 2],
]);

const OPPORTUNITY_TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'opportunity_equipment_round',
    clientOrgId: 'org_huanyu_logistics',
    locationId: 'place_service_lane',
    need: 'craft',
    reward: 18_000,
    difficulty: 0.58,
    durationDays: 4,
  }),
  Object.freeze({
    id: 'opportunity_channel_review',
    clientOrgId: 'org_riverside_shop',
    locationId: 'place_shared_office',
    need: 'research',
    reward: 13_500,
    difficulty: 0.62,
    durationDays: 3,
  }),
  Object.freeze({
    id: 'opportunity_neighborhood_delivery',
    clientOrgId: 'org_riverside_shop',
    locationId: 'place_logistics_yard',
    need: 'delivery',
    reward: 9_600,
    difficulty: 0.44,
    durationDays: 2,
  }),
  Object.freeze({
    id: 'opportunity_service_refresh',
    clientOrgId: 'org_qingsong_service',
    locationId: 'place_teahouse',
    need: 'sales',
    reward: 7_800,
    difficulty: 0.48,
    durationDays: 3,
  }),
]);

function clone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function scheduleForOccupation(occupation) {
  const workDays = {
    社区账房: [1, 2, 3, 4, 5],
    维修店主: [2, 3, 4, 5, 6, 7],
    产业研究员: [1, 2, 3, 4, 5],
    社区商户: [2, 3, 4, 5, 6, 7],
    物流主管: [1, 2, 3, 4, 5, 6],
    人才顾问: [1, 2, 3, 4, 5],
    创业者: [1, 2, 3, 4, 5, 6],
    客户经理: [1, 2, 3, 4, 5],
    独立会计: [1, 2, 3, 4, 5],
    自由设计师: [1, 2, 3, 4, 5, 6],
  }[occupation] ?? [1, 2, 3, 4, 5];
  return {
    timezone: 'world_local',
    workDays,
    shiftStartHour: 9,
    shiftEndHour: 18,
    maximumConsecutiveShifts: 6,
  };
}

function createResearchNetwork(roleType) {
  const active = [
    'professional',
    'institution',
  ].includes(roleType);
  return {
    version: RESEARCH_NETWORK_VERSION,
    services: {
      playerCoverage: {
        id: 'research_service_player_coverage',
        active,
        clientOrgId: 'org_player_venture',
        providerOrgId: 'org_xinghe_research',
        leadActorId: 'person_gu_lan',
        substituteActorId: 'person_zhou_qian',
        coverageSymbols: [
          ...RESEARCH_COVERAGE_SYMBOLS,
        ],
        leadBatchSize: 3,
        leadFeePerReport: 160,
        substituteCadenceDays: 3,
        substituteFeePerReport: 550,
        reportFreshnessDays: 3,
        nextCoverageIndex: 0,
        reportsBySymbol: {},
        availability: {
          asOfTick: 0,
          leadStatus: active
            ? 'not_started'
            : 'not_contracting',
          serviceStatus: active
            ? 'awaiting_shift'
            : 'public_only',
          leadAvailable: false,
          substituteUsed: false,
          reasonCodes: active
            ? ['awaiting_research_shift']
            : ['no_internal_research_contract'],
        },
        publicDataAvailable: true,
        marketDataIndependent: true,
      },
    },
  };
}

function relationKey(leftId, rightId) {
  return [String(leftId), String(rightId)].sort().join('::');
}

function createActors() {
  return Object.fromEntries(
    ACTOR_TEMPLATES.map((template, index) => [
      template.id,
      {
        ...clone(template),
        energy: 68 + (index % 4) * 6,
        reputation: 42 + Math.round(template.traits.reliability * 35),
        currentActivity:
          template.employerOrgId === null ? '在找下一件值得做的事' : '正在处理手上的工作',
        mood: Number(
          (
            (template.traits.reliability - 0.5) *
            0.2
          ).toFixed(4),
        ),
        schedule: scheduleForOccupation(
          template.occupation,
        ),
        availability: {
          asOfTick: 0,
          status: 'available',
          scheduledToWork: false,
          reasonCodes: ['world_opened'],
        },
        lastActionTick: 0,
        actionSequence: 0,
        commitmentLock: null,
        cooldowns: {},
        knownFactIds: [],
        memories: [],
      },
    ]),
  );
}

function createOrganizations(roleType, strengthTier) {
  const organizations = Object.fromEntries(
    ORGANIZATION_TEMPLATES.map((template) => [
      template.id,
      {
        ...clone(template),
        revenue: 0,
        costs: 0,
        completedContracts: 0,
        missedCommitments: 0,
        wagePerShift: money(
          680 +
            template.capacity * 34 +
            (template.objective === 'profit' ? 80 : 0),
        ),
        debtLimit: money(template.cash * 0.9),
        lastDecisionTick: 0,
        policyRevision: 0,
      },
    ]),
  );
  const playerOrganization = {
    id: 'org_player_venture',
    name:
      roleType === 'institution'
        ? '受托经营部'
        : roleType === 'operator'
          ? '你的经营部'
          : roleType === 'professional'
            ? '你的工作室'
            : '你的小事业',
    kind: 'player_venture',
    locationId:
      roleType === 'household'
        ? 'place_riverside_block'
        : 'place_shared_office',
    cash:
      roleType === 'operator'
        ? strengthTier === 'high'
          ? 320_000
          : 96_000
        : roleType === 'institution'
          ? strengthTier === 'high'
            ? 520_000
            : 180_000
          : roleType === 'professional'
            ? strengthTier === 'high'
              ? 120_000
              : 42_000
            : strengthTier === 'high'
              ? 64_000
              : 18_000,
    debtPrincipal: 0,
    decisionWriter: 'player',
    objective: 'stability',
    capacity: roleType === 'institution' ? 8 : roleType === 'operator' ? 6 : 3,
    capabilities: {
      craft: roleType === 'operator' ? 0.64 : 0.36,
      research:
        roleType === 'professional' || roleType === 'institution' ? 0.68 : 0.3,
      delivery: roleType === 'operator' ? 0.68 : 0.42,
      sales: roleType === 'household' ? 0.58 : 0.5,
    },
    staffIds: [],
    revenue: 0,
    costs: 0,
    completedContracts: 0,
    missedCommitments: 0,
    wagePerShift: roleType === 'institution' ? 1_680 : 920,
    debtLimit:
      roleType === 'institution'
        ? 360_000
        : roleType === 'operator'
          ? 220_000
          : 80_000,
    lastDecisionTick: 0,
    policyRevision: 0,
  };
  organizations[playerOrganization.id] = playerOrganization;
  return organizations;
}

function createRelationships() {
  return Object.fromEntries(
    OPENING_RELATIONSHIPS.map(
      ([leftId, rightId, trust, familiarity, respect, conflict]) => [
        relationKey(leftId, rightId),
        {
          id: `relationship_${hashString(relationKey(leftId, rightId)).toString(16)}`,
          leftId,
          rightId,
          trust,
          familiarity,
          respect,
          conflict,
          obligation: 0,
          lastInteractionTick: 0,
          interactionCount: 0,
        },
      ],
    ),
  );
}

function createContracts(actors, organizations) {
  const contracts = {};
  let index = 0;
  for (const actor of Object.values(actors)) {
    if (!actor.employerOrgId) continue;
    const organization = organizations[actor.employerOrgId];
    index += 1;
    contracts[`contract_opening_employment_${index}`] = {
      id: `contract_opening_employment_${index}`,
      kind: 'employment',
      status: 'active',
      employerOrgId: organization.id,
      workerId: actor.id,
      clientOrgId: null,
      providerOrgId: null,
      opportunityId: null,
      signedTick: 0,
      dueTick: null,
      completedTick: null,
      amount: organization.wagePerShift,
      progress: 0,
      commitmentLock: true,
    };
  }
  return contracts;
}

function createOpportunities() {
  return Object.fromEntries(
    OPPORTUNITY_TEMPLATES.map((template, index) => [
      template.id,
      {
        ...clone(template),
        status: 'open',
        createdTick: 0,
        expiresTick: 8 + index * 2,
        awardedProviderOrgId: null,
        sourceFactId: 'social_fact_genesis',
      },
    ]),
  );
}

function createOpeningFact(roleType) {
  return {
    id: 'social_fact_genesis',
    type: 'ecology_opened',
    tick: 0,
    actorIds: ['player'],
    organizationIds: ['org_player_venture'],
    locationId: 'place_riverside_block',
    contractId: null,
    opportunityId: null,
    reasonCodes: [`player_role:${roleType}`, 'persistent_world'],
    resourceDelta: {},
    relationshipDelta: {},
    visibility: 'public',
    salience: 0.8,
  };
}

export function createSocialCareerEcology({
  seed = 'LZY-DEFAULT-WORLD',
  roleType = 'household',
  strengthTier = 'low',
  worldTick = 0,
} = {}) {
  const actors = createActors();
  const organizations = createOrganizations(roleType, strengthTier);
  const openingFact = createOpeningFact(roleType);
  const normalizedTick = Math.max(0, Math.trunc(Number(worldTick) || 0));
  openingFact.tick = normalizedTick;
  const ecology = {
    schemaVersion: SCHEMA_VERSION,
    seed: String(seed),
    rngSalt: hashString(`${seed}:social-career`),
    sequence: 1,
    lastSettledTick: normalizedTick,
    actors,
    organizations,
    relationships: createRelationships(),
    contracts: createContracts(actors, organizations),
    opportunities: createOpportunities(),
    locations: Object.fromEntries(
      LOCATION_TEMPLATES.map((location) => [location.id, clone(location)]),
    ),
    player: {
      roleType,
      strengthTier,
      locationId:
        roleType === 'household'
          ? 'place_riverside_block'
          : 'place_shared_office',
      currentActivity: '正在安排今天的事',
      reputation:
        strengthTier === 'high' ? 68 : 48,
      knownOpportunityIds: [],
      visitCount: 0,
    },
    researchNetwork: createResearchNetwork(roleType),
    facts: [openingFact],
    recentDecisions: [],
    marketActionOutbox: [],
    archive: {
      factCount: 0,
      decisionCount: 0,
      marketActionCount: 0,
      contractCount: 0,
      opportunityCount: 0,
      factDigest: '00000000',
      decisionDigest: '00000000',
      marketActionDigest: '00000000',
      contractDigest: '00000000',
      opportunityDigest: '00000000',
      factReferenceIndex: {},
    },
    metrics: {
      autonomousActions: 0,
      playerActions: 0,
      acceptedNegotiations: 0,
      rejectedNegotiations: 0,
      completedContracts: 0,
      brokenCommitments: 0,
    },
  };
  for (const actor of Object.values(ecology.actors)) {
    actor.knownFactIds.push(openingFact.id);
    actor.memories.push({
      factId: openingFact.id,
      salience: 0.4,
      confidence: 1,
      valence: 0,
      createdTick: normalizedTick,
      lastRecalledTick: normalizedTick,
    });
  }
  return ecology;
}

function ensureResearchNetwork(
  ecology,
  {
    roleType =
      ecology?.player?.roleType ?? 'household',
    strengthTier =
      ecology?.player?.strengthTier ?? 'low',
  } = {},
) {
  ecology.player ??= {};
  ecology.player.roleType ??= roleType;
  ecology.player.strengthTier ??= strengthTier;
  ecology.researchNetwork ??=
    createResearchNetwork(ecology.player.roleType);
  const service =
    ecology.researchNetwork.services?.playerCoverage;
  if (!service) {
    ecology.researchNetwork =
      createResearchNetwork(ecology.player.roleType);
  } else {
    service.coverageSymbols = [
      ...RESEARCH_COVERAGE_SYMBOLS,
    ];
    service.reportsBySymbol ??= {};
    service.nextCoverageIndex ??= 0;
    service.publicDataAvailable = true;
    service.marketDataIndependent = true;
    service.availability ??= {
      asOfTick: ecology.lastSettledTick ?? 0,
      leadStatus: 'not_started',
      serviceStatus: service.active
        ? 'awaiting_shift'
        : 'public_only',
      leadAvailable: false,
      substituteUsed: false,
      reasonCodes: [],
    };
  }
  for (const actor of Object.values(
    ecology.actors ?? {},
  )) {
    actor.schedule ??= scheduleForOccupation(
      actor.occupation,
    );
    actor.mood ??= 0;
    actor.availability ??= {
      asOfTick: ecology.lastSettledTick ?? 0,
      status: 'available',
      scheduledToWork: false,
      reasonCodes: ['legacy_state_normalized'],
    };
  }
  return ecology;
}

export function normalizeSocialCareerEcology(
  ecology,
  options = {},
) {
  const normalized = clone(ecology);
  return ensureResearchNetwork(normalized, options);
}

function relationshipToPlayer(ecology, actorId) {
  const relationship =
    ecology.relationships[relationKey('player', actorId)];
  return relationship ?? {
    id: null,
    trust: 30,
    familiarity: 10,
    respect: 35,
    conflict: 0,
    obligation: 0,
    interactionCount: 0,
  };
}

function organizationLabel(ecology, organizationId) {
  return ecology.organizations[organizationId]?.name ?? '独立工作';
}

function roleOfActor(ecology, actor) {
  const employment = Object.values(ecology.contracts).find(
    (contract) =>
      contract.kind === 'employment' &&
      contract.status === 'active' &&
      contract.workerId === actor.id,
  );
  return employment
    ? organizationLabel(ecology, employment.employerOrgId)
    : '独立接活';
}

function narrativeForFact(ecology, fact) {
  const actorNames = fact.actorIds
    .map((actorId) =>
      actorId === 'player'
        ? '你'
        : ecology.actors[actorId]?.name,
    )
    .filter(Boolean);
  const organizationNames = fact.organizationIds
    .map((organizationId) => ecology.organizations[organizationId]?.name)
    .filter(Boolean);
  const actorText = actorNames.join('、') || '有人';
  const organizationText = organizationNames.join('、') || '一处事业';
  const narratives = {
    ecology_opened: '街区今天照常营业。',
    contact: `${actorText}聊了几句，彼此都记住了这次来往。`,
    visit: `${actorText}到了${ecology.locations[fact.locationId]?.name ?? '附近'}。`,
    work_completed: `${actorText}完成了${organizationText}的一班工作。`,
    employment_started: `${actorText}接受了${organizationText}的工作约定。`,
    employment_ended: `${actorText}离开了${organizationText}。`,
    negotiation_rejected: `${actorText}没有谈拢。`,
    cooperation: `${actorText}决定先合做一件事。`,
    conflict: `${actorText}在利益上正面碰了一次。`,
    transfer: `${actorText}完成了一次有对价的交换。`,
    gift: `${actorText}收下了一份心意，但这不代表任何承诺。`,
    contract_signed: `${organizationText}签下了一份新约定。`,
    contract_completed: `${organizationText}交付了约定的成果。`,
    contract_defaulted: `${organizationText}没能按时交付。`,
    capability_built: `${organizationText}把一笔钱用在了能力建设上。`,
    debt_borrowed: `${organizationText}增加了债务，也拿到了周转现金。`,
    debt_repaid: `${organizationText}归还了一部分债务。`,
    opportunity_opened: `${organizationText}放出了一件可谈的生意。`,
    opportunity_awarded: `${organizationText}把机会交给了新的合作方。`,
    rest: `${actorText}暂时收了手，先恢复状态。`,
    research_model_updated: `${actorText}完成了一轮公司资料整理。`,
  };
  return narratives[fact.type] ?? `${actorText}做出了新的选择。`;
}

export function projectSocialCareerEcology(
  ecology,
  { playerRoleType = 'household', maximumHistory = 8 } = {},
) {
  if (!ecology || ecology.schemaVersion !== SCHEMA_VERSION) {
    throw new TypeError('A compatible social-career ecology is required.');
  }
  ecology = ensureResearchNetwork(clone(ecology), {
    roleType: playerRoleType,
  });
  const people = Object.values(ecology.actors)
    .map((actor) => {
      const relationship = relationshipToPlayer(ecology, actor.id);
      return {
        id: actor.id,
        name: actor.name,
        identity: actor.identity,
        occupation: actor.occupation,
        wealthBand: actor.wealthBand,
        locationId: actor.locationId,
        location: ecology.locations[actor.locationId]?.name ?? '附近',
        currentActivity: actor.currentActivity,
        workplace: roleOfActor(ecology, actor),
        relation: {
          trust: relationship.trust,
          familiarity: relationship.familiarity,
          respect: relationship.respect,
          conflict: relationship.conflict,
          obligation: relationship.obligation,
          interactions: relationship.interactionCount,
        },
        available: actor.commitmentLock === null,
        mood: actor.mood,
        availability: clone(actor.availability),
        schedule: clone(actor.schedule),
      };
    })
    .sort(
      (left, right) =>
        right.relation.familiarity - left.relation.familiarity ||
        left.name.localeCompare(right.name, 'zh-CN'),
    );
  const places = Object.values(ecology.locations).map((location) => {
    const present = people.filter((person) => person.locationId === location.id);
    return {
      id: location.id,
      name: location.name,
      kind: location.kind,
      people: present.map((person) => person.id),
      peopleNames: present.map((person) => person.name),
      activityCount: present.length,
    };
  });
  const organizations = Object.values(ecology.organizations).map(
    (organization) => ({
      id: organization.id,
      name: organization.name,
      kind: organization.kind,
      locationId: organization.locationId,
      location: ecology.locations[organization.locationId]?.name ?? '附近',
      decisionWriter:
        organization.decisionWriter === 'player'
          ? '你'
          : ecology.actors[organization.decisionWriter]?.name ?? '待定',
      objective: {
        reliability: '稳交付',
        profit: '看利润',
        market_share: '抢份额',
        stability: '保周转',
      }[organization.objective] ?? '稳步经营',
      cash: organization.cash,
      debtPrincipal: organization.debtPrincipal,
      staffCount: organization.staffIds.length,
      capacity: organization.capacity,
      revenue: organization.revenue,
      costs: organization.costs,
      completedContracts: organization.completedContracts,
      controlled: organization.decisionWriter === 'player',
      capabilities: clone(organization.capabilities),
    }),
  );
  const history = ecology.facts
    .slice(-Math.max(0, Math.trunc(maximumHistory)))
    .reverse()
    .map((fact) => ({
      id: fact.id,
      factId: fact.id,
      type: fact.type,
      tick: fact.tick,
      salience: fact.salience,
      text: narrativeForFact(ecology, fact),
    }));
  const researchService =
    ecology.researchNetwork.services.playerCoverage;
  const configuredLead =
    ecology.actors[researchService.leadActorId];
  const lead =
    ecology.actors[
      researchService.availability
        .processingActorId
    ] ?? configuredLead;
  const coverage = researchService.coverageSymbols.map(
    (symbol) => {
      const report =
        researchService.reportsBySymbol[symbol] ?? null;
      const ageDays = report
        ? Math.max(
            0,
            ecology.lastSettledTick -
              report.processedTick,
          )
        : null;
      return {
        symbol,
        status:
          !report
            ? 'public_only'
            : ageDays <=
                researchService.reportFreshnessDays
              ? 'fresh'
              : 'stale',
        source: report?.processingMode ?? 'public_data',
        processedTick: report?.processedTick ?? null,
        ageDays,
        qualityBps: report?.qualityBps ?? null,
        analystId: report?.analystId ?? null,
        analystName:
          ecology.actors[report?.analystId]?.name ?? null,
        errorBandBps: report?.errorBandBps ?? null,
      };
    },
  );
  return {
    schemaVersion: 'lzy-social-career-public-v1',
    asOfTick: ecology.lastSettledTick,
    playerRoleType,
    player: clone(ecology.player),
    research: {
      active: researchService.active,
      status:
        researchService.availability.serviceStatus,
      publicDataAvailable:
        researchService.publicDataAvailable,
      marketDataIndependent:
        researchService.marketDataIndependent,
      lead: {
        id: lead?.id ?? null,
        name: lead?.name ?? '暂无覆盖人员',
        available:
          researchService.availability.leadAvailable,
        status:
          researchService.availability.leadStatus,
        activity: lead?.currentActivity ?? '',
      },
      coverage,
    },
    people,
    places,
    organizations,
    playerOrganization:
      organizations.find((organization) => organization.controlled) ?? null,
    opportunities: Object.values(ecology.opportunities)
      .filter((opportunity) => opportunity.status === 'open')
      .map((opportunity) => ({
        id: opportunity.id,
        client: organizationLabel(ecology, opportunity.clientOrgId),
        clientOrgId: opportunity.clientOrgId,
        location: ecology.locations[opportunity.locationId]?.name ?? '附近',
        locationId: opportunity.locationId,
        need: {
          craft: '动手能力',
          research: '调查判断',
          delivery: '组织交付',
          sales: '客户沟通',
        }[opportunity.need],
        reward: opportunity.reward,
        difficulty: opportunity.difficulty,
        expiresTick: opportunity.expiresTick,
      })),
    contracts: Object.values(ecology.contracts)
      .filter(
        (contract) =>
          contract.status === 'active' &&
          (contract.providerOrgId === 'org_player_venture' ||
            contract.employerOrgId === 'org_player_venture' ||
            contract.workerId === 'player'),
      )
      .map((contract) => ({
        id: contract.id,
        kind: contract.kind,
        amount: contract.amount,
        dueTick: contract.dueTick,
        progress: contract.progress,
        counterparty:
          organizationLabel(
            ecology,
            contract.clientOrgId ?? contract.employerOrgId,
          ),
      })),
    history,
    metrics: clone(ecology.metrics),
  };
}

function duplicateIds(items) {
  const ids = items.map((item) => item.id);
  return ids.filter((id, index) => ids.indexOf(id) !== index);
}

export function auditSocialCareerEcology(ecology) {
  const errors = [];
  if (!ecology || ecology.schemaVersion !== SCHEMA_VERSION) {
    return ['INVALID_SOCIAL_CAREER_SCHEMA'];
  }
  const actorIds = new Set(Object.keys(ecology.actors ?? {}));
  const organizationIds = new Set(
    Object.keys(ecology.organizations ?? {}),
  );
  const locationIds = new Set(Object.keys(ecology.locations ?? {}));
  const factIds = new Set((ecology.facts ?? []).map((fact) => fact.id));
  const archivedFactIds = ecology.archive?.factReferenceIndex ?? {};
  const researchService =
    ecology.researchNetwork?.services?.playerCoverage;
  if (
    ecology.researchNetwork?.version !==
      RESEARCH_NETWORK_VERSION ||
    !researchService ||
    researchService.publicDataAvailable !== true ||
    researchService.marketDataIndependent !== true ||
    !Array.isArray(researchService.coverageSymbols) ||
    new Set(researchService.coverageSymbols).size !==
      researchService.coverageSymbols.length ||
    !researchService.coverageSymbols.every(
      (symbol) =>
        RESEARCH_COVERAGE_SYMBOLS.includes(symbol),
    )
  ) {
    errors.push('INVALID_RESEARCH_ACCESS_NETWORK');
  }
  if (duplicateIds(Object.values(ecology.actors ?? {})).length > 0) {
    errors.push('DUPLICATE_SOCIAL_ACTOR_ID');
  }
  if (
    duplicateIds(Object.values(ecology.organizations ?? {})).length > 0
  ) {
    errors.push('DUPLICATE_SOCIAL_ORGANIZATION_ID');
  }
  if (duplicateIds(ecology.facts ?? []).length > 0) {
    errors.push('DUPLICATE_SOCIAL_FACT_ID');
  }
  if (
    !ecology.player ||
    !locationIds.has(ecology.player.locationId) ||
    !Array.isArray(ecology.player.knownOpportunityIds)
  ) {
    errors.push('INVALID_SOCIAL_PLAYER_STATE');
  }
  for (const actor of Object.values(ecology.actors ?? {})) {
    if (!locationIds.has(actor.locationId)) {
      errors.push(`SOCIAL_ACTOR_WITHOUT_LOCATION:${actor.id}`);
    }
    if (!Number.isFinite(actor.cash) || actor.cash < 0) {
      errors.push(`INVALID_SOCIAL_ACTOR_CASH:${actor.id}`);
    }
    if (
      !Number.isFinite(actor.energy) ||
      actor.energy < 0 ||
      actor.energy > 100
    ) {
      errors.push(`INVALID_SOCIAL_ACTOR_ENERGY:${actor.id}`);
    }
    if (
      !Number.isFinite(actor.mood) ||
      actor.mood < -1 ||
      actor.mood > 1 ||
      !Array.isArray(actor.schedule?.workDays) ||
      actor.schedule.workDays.some(
        (day) =>
          !Number.isSafeInteger(day) ||
          day < 1 ||
          day > 7,
      ) ||
      !actor.availability ||
      !Number.isSafeInteger(
        actor.availability.asOfTick,
      )
    ) {
      errors.push(
        `INVALID_SOCIAL_ACTOR_AVAILABILITY:${actor.id}`,
      );
    }
    if ((actor.memories ?? []).length > MAX_MEMORIES_PER_ACTOR) {
      errors.push(`UNBOUNDED_SOCIAL_MEMORY:${actor.id}`);
    }
    for (const memory of actor.memories ?? []) {
      if (
        !factIds.has(memory.factId) &&
        !archivedFactIds[memory.factId]
      ) {
        errors.push(
          `SOCIAL_MEMORY_WITHOUT_FACT:${actor.id}:${memory.factId}`,
        );
      }
    }
  }
  if (researchService) {
    for (const [
      symbol,
      report,
    ] of Object.entries(
      researchService.reportsBySymbol ?? {},
    )) {
      if (
        !researchService.coverageSymbols.includes(symbol) ||
        !actorIds.has(report.analystId) ||
        !Number.isSafeInteger(report.processedTick) ||
        report.processedTick < 0 ||
        report.processedTick >
          ecology.lastSettledTick ||
        ![
          'lead_researcher',
          'internal_researcher',
          'substitute',
        ].includes(report.processingMode) ||
        (
          report.providerOrgId !== undefined &&
          report.providerOrgId !== null &&
          !organizationIds.has(report.providerOrgId)
        ) ||
        !Number.isSafeInteger(report.qualityBps) ||
        report.qualityBps < 0 ||
        report.qualityBps > 10_000
      ) {
        errors.push(
          `INVALID_RESEARCH_REPORT:${symbol}`,
        );
      }
    }
  }
  for (const organization of Object.values(
    ecology.organizations ?? {},
  )) {
    if (
      organization.decisionWriter !== 'player' &&
      !actorIds.has(organization.decisionWriter)
    ) {
      errors.push(
        `SOCIAL_ORGANIZATION_WITHOUT_WRITER:${organization.id}`,
      );
    }
    if (!locationIds.has(organization.locationId)) {
      errors.push(
        `SOCIAL_ORGANIZATION_WITHOUT_LOCATION:${organization.id}`,
      );
    }
    if (!Number.isFinite(organization.cash) || organization.cash < 0) {
      errors.push(`INVALID_SOCIAL_ORGANIZATION_CASH:${organization.id}`);
    }
    if (
      !Number.isFinite(organization.debtPrincipal) ||
      organization.debtPrincipal < 0
    ) {
      errors.push(`INVALID_SOCIAL_ORGANIZATION_DEBT:${organization.id}`);
    }
    if (
      organization.staffIds.some((actorId) => !actorIds.has(actorId))
    ) {
      errors.push(`SOCIAL_ORGANIZATION_WITHOUT_STAFF:${organization.id}`);
    }
  }
  for (const relationship of Object.values(
    ecology.relationships ?? {},
  )) {
    for (const partyId of [
      relationship.leftId,
      relationship.rightId,
    ]) {
      if (partyId !== 'player' && !actorIds.has(partyId)) {
        errors.push(
          `SOCIAL_RELATIONSHIP_WITHOUT_PARTY:${relationship.id}`,
        );
      }
    }
    for (const field of [
      'trust',
      'familiarity',
      'respect',
      'conflict',
      'obligation',
    ]) {
      if (
        !Number.isFinite(relationship[field]) ||
        relationship[field] < 0 ||
        relationship[field] > 100
      ) {
        errors.push(
          `INVALID_SOCIAL_RELATIONSHIP:${relationship.id}:${field}`,
        );
      }
    }
  }
  for (const contract of Object.values(ecology.contracts ?? {})) {
    for (const organizationId of [
      contract.employerOrgId,
      contract.clientOrgId,
      contract.providerOrgId,
    ].filter(Boolean)) {
      if (!organizationIds.has(organizationId)) {
        errors.push(
          `SOCIAL_CONTRACT_WITHOUT_ORGANIZATION:${contract.id}`,
        );
      }
    }
    if (
      contract.workerId &&
      contract.workerId !== 'player' &&
      !actorIds.has(contract.workerId)
    ) {
      errors.push(`SOCIAL_CONTRACT_WITHOUT_WORKER:${contract.id}`);
    }
  }
  for (const fact of ecology.facts ?? []) {
    if (
      Object.hasOwn(fact, 'summary') ||
      Object.hasOwn(fact, 'text') ||
      Object.hasOwn(fact, 'narrative')
    ) {
      errors.push(`SOCIAL_FACT_CONTAINS_NARRATIVE:${fact.id}`);
    }
    if (!Number.isSafeInteger(fact.tick) || fact.tick < 0) {
      errors.push(`INVALID_SOCIAL_FACT_TICK:${fact.id}`);
    }
  }
  if ((ecology.facts ?? []).length > MAX_LIVE_FACTS) {
    errors.push('UNBOUNDED_SOCIAL_FACTS');
  }
  if (
    (ecology.marketActionOutbox ?? []).length > MAX_MARKET_ACTIONS
  ) {
    errors.push('UNBOUNDED_SOCIAL_MARKET_ACTIONS');
  }
  for (const action of
    ecology.marketActionOutbox ?? []) {
    const pending = action.status === 'pending_adapter';
    const acknowledged =
      action.status === 'acknowledged' &&
      typeof action.adapterVersion === 'string' &&
      Number.isSafeInteger(action.acknowledgedTick) &&
      action.acknowledgedTick >= action.tick &&
      typeof action.acknowledgementEventId === 'string' &&
      Array.isArray(action.worldFactIds) &&
      action.worldFactIds.length > 0 &&
      action.worldFactIds.every(
        (factId) =>
          typeof factId === 'string' &&
          factId.length > 0,
      );
    if (
      action.schemaVersion !==
        'lzy-social-business-action-v1' ||
      typeof action.id !== 'string' ||
      typeof action.factId !== 'string' ||
      !Number.isSafeInteger(action.tick) ||
      action.tick < 0 ||
      (!pending && !acknowledged)
    ) {
      errors.push(
        `INVALID_SOCIAL_MARKET_ACTION:${action.id ?? 'unknown'}`,
      );
    }
  }
  if (
    (ecology.recentDecisions ?? []).length > MAX_RECENT_DECISIONS
  ) {
    errors.push('UNBOUNDED_SOCIAL_DECISIONS');
  }
  if (
    Object.keys(ecology.contracts ?? {}).length > MAX_CONTRACTS
  ) {
    errors.push('UNBOUNDED_SOCIAL_CONTRACTS');
  }
  if (
    Object.keys(ecology.opportunities ?? {}).length >
    MAX_OPPORTUNITIES
  ) {
    errors.push('UNBOUNDED_SOCIAL_OPPORTUNITIES');
  }
  return errors;
}

export function socialCareerCashTotal(ecology) {
  if (!ecology || ecology.schemaVersion !== SCHEMA_VERSION) return 0;
  return money(
    Object.values(ecology.actors).reduce(
      (sum, actor) => sum + actor.cash,
      0,
    ) +
      Object.values(ecology.organizations).reduce(
        (sum, organization) => sum + organization.cash,
        0,
      ),
  );
}

export function socialCareerSchemaVersion() {
  return SCHEMA_VERSION;
}

export {
  advanceSocialCareerEcology,
  applySocialCareerAction,
} from './social-career-rules.js?v=f34a1d70e1a7aaed';

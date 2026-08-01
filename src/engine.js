/**
 * LZY deterministic simulation kernel.
 *
 * The engine is deliberately UI-free and pure at its public action boundary:
 * every action returns a cloned next state plus a structured receipt. Facts are
 * authoritative; memories and narratives may only reference facts.
 */

import { createValuationSnapshot } from './market/valuation.js?v=20260801-01';
import {
  LIFE_PRODUCT_BY_ID as LIFE_ITEM_BY_ID,
  auditLifeState,
  createLifeState,
  getLifeCatalog as getLifeProductCatalog,
  getLifeProjection as projectLifeState,
  lifeProductHasDirectUse,
  lifeProductRequiresPlacement,
  normalizeLifeState,
} from './experience/life-economy.js?v=20260801-01';
import {
  CITY_LIFE_CONTRACT_VERSION,
  accrueCityObligation,
  advanceCityLifeState,
  auditCityLifeState,
  cityObligationAmount,
  cityOpenObligations,
  createCityLifeState,
  normalizeCityLifeState,
  projectCityLifeState,
  projectPhysicalLocations,
  quoteCityProduct,
  recordCityAssetBuyback,
  recordCityRetailSale,
  settleCityObligations,
  synchronizeLifeLocations,
} from './experience/city-life-ecology.js?v=20260801-01';
import {
  advanceSocialCareerEcology,
  applySocialCareerAction,
  auditSocialCareerEcology,
  createSocialCareerEcology,
  normalizeSocialCareerEcology,
  projectSocialCareerEcology,
  socialCareerCashTotal,
  socialCareerSchemaVersion,
} from './experience/social-career-ecology.js?v=20260801-01';
import {
  DERIVATIVE_EQUITY_BASKETS,
  DERIVATIVE_EQUITY_BASKET_VERSIONS,
  DERIVATIVE_PERMISSIONS,
  FINANCING_INITIAL_RATIO_BPS,
  TESTING_ACCESS_POLICY,
  auditDerivativesState,
  buildEquityBasketSettlementReferences,
  createDerivativesState,
  derivePermissionMode,
  reduceDerivatives,
  restoreDerivatives,
  sameEquityBasketIdentity,
  securitiesLendingRiskState,
  snapshotDerivatives,
} from './derivatives/index.js?v=20260801-01';
import {
  advanceWorldlineState,
  archiveWorldlineSourceEvidence,
  auditWorldlineState,
  createWorldlineState,
  normalizeWorldlineState,
} from './worldline.js?v=20260801-01';

export const ROLE_TYPES = Object.freeze([
  'household',
  'professional',
  'operator',
  'institution',
]);

export const STRENGTH_TIERS = Object.freeze(['low', 'high']);

export const ROLE_ACTIONS = Object.freeze({
  household: 'set_reserve',
  professional: 'record_dissent',
  operator: 'schedule_production',
  institution: 'set_liquidity_buffer',
});

export const RULE_VERSION = 'lzy-mvp-0.4.0';

const SYNTHETIC_WORLD_DAY_MS = 86_400_000;
const DERIVATIVE_COMMODITY_TEMPLATES = Object.freeze({
  LZYAU: Object.freeze({
    openingSpotTicks: 78_000,
    supplyVolatility: 0.002,
    demandCycleWeight: 0.08,
    inventoryMeanReversion: 0.018,
    seasonalPeriod: 120,
    seasonalPhase: 12,
    rateSensitivity: -0.16,
    baseCarrySpreadBps: -100,
  }),
  LZYAG: Object.freeze({
    openingSpotTicks: 980_000,
    supplyVolatility: 0.0038,
    demandCycleWeight: 0.2,
    inventoryMeanReversion: 0.024,
    seasonalPeriod: 72,
    seasonalPhase: 20,
    rateSensitivity: -0.08,
    baseCarrySpreadBps: -70,
  }),
  LZYA: Object.freeze({
    openingSpotTicks: 460_000,
    supplyVolatility: 0.006,
    demandCycleWeight: 0.1,
    inventoryMeanReversion: 0.035,
    seasonalPeriod: 48,
    seasonalPhase: 7,
    rateSensitivity: 0,
    baseCarrySpreadBps: 40,
  }),
  LZYCU: Object.freeze({
    openingSpotTicks: 8_500_000,
    supplyVolatility: 0.003,
    demandCycleWeight: 0.32,
    inventoryMeanReversion: 0.028,
    seasonalPeriod: 80,
    seasonalPhase: 4,
    rateSensitivity: -0.04,
    baseCarrySpreadBps: -20,
  }),
  LZYSC: Object.freeze({
    openingSpotTicks: 62_000,
    supplyVolatility: 0.0075,
    demandCycleWeight: 0.28,
    inventoryMeanReversion: 0.04,
    seasonalPeriod: 64,
    seasonalPhase: 16,
    rateSensitivity: -0.02,
    baseCarrySpreadBps: 140,
  }),
});
const BPS_SCALE = 10_000;
const WORLD_HISTORY_LIMITS = Object.freeze({
  clues: 48,
  memories: 120,
  narratives: 80,
  replay: 120,
  commitments: 80,
  dissent: 80,
  facts: 256,
  events: 320,
  ledger: 256,
  trades: 256,
  orders: 520,
  securityPricePoints: 120,
});
const LEVEL2_DEPTH_PRODUCT_ID = 'L2_DEPTH_100';
export const STOCK_UNIVERSE_VERSION =
  'lzy_stock_universe_14_v1';
const MARKET_DATA_PRODUCTS = Object.freeze({
  [LEVEL2_DEPTH_PRODUCT_ID]: Object.freeze({
    id: LEVEL2_DEPTH_PRODUCT_ID,
    name: '百档行情',
    costCents: 8_800,
    termWorldDays: 30,
    depthLevels: 100,
    synthetic: true,
  }),
});
const COMPANY_TEMPLATES = Object.freeze([
  {
    id: 'company_aurora_materials',
    symbol: 'LZA001',
    name: '曙原材料',
    shortName: '曙原',
    role: '上游材料',
    description: '为储能制造商提供合成电极材料，订单稳定但回款较慢。',
    board: 'main',
    dailyLimitBps: 1_000,
    openingPrice: 18.4,
    cash: 320_000_000,
    debt: 160_000_000,
    inventory: 4_200,
    capacity: 950,
    unitCost: 62,
    productPrice: 84,
    baseDemand: 580,
    sharesOutstanding: 50_000_000,
    floatRatioBps: 6_500,
    targetBookEquity: 520_000_000,
    industry: '先进材料',
    lifecycle: '成熟扩张',
    informationTransparencyBps: 7_200,
    management: {
      confidenceBps: 6_800,
      operatingStyle: '稳产、缩短账期',
      chiefExecutive: {
        name: '沈砚',
        incentive: '产能利用与回款',
      },
      financeLead: {
        name: '安冬',
        incentive: '现金转换与债务成本',
      },
      investorRelations: {
        name: '宋栩',
        incentive: '披露及时与口径一致',
      },
    },
    macroExposures: ['工业投资', '铜价', '信用周期'],
    supplierCompanyIds: ['company_northern_logistics'],
    customerCompanyIds: ['company_river_equipment'],
    financialBaseline: {
      trailingRevenue: 800_000_000,
      trailingNetIncome: 55_000_000,
      trailingFreeCashFlow: 42_000_000,
      operatingExpenseRatio: 0.175,
      maintenanceCapexRatio: 0.018,
      annualInterestRateBps: 580,
      valuationPolicy: {
        earningsMultiple: 16.7,
        bookMultiple: 1.77,
        freeCashFlowMultiple: 21.9,
        earningsWeightBps: 4_500,
        bookWeightBps: 2_500,
        freeCashFlowWeightBps: 3_000,
        baseUncertaintyBps: 1_250,
      },
    },
  },
  {
    id: 'company_river_equipment',
    symbol: 'LZA002',
    name: '澄川装备',
    shortName: '澄川',
    role: '储能制造',
    description: '把材料加工为模块，正在权衡扩产和现金流。',
    board: 'star',
    dailyLimitBps: 2_000,
    openingPrice: 31.2,
    cash: 35_000_000_000,
    debt: 55_000_000_000,
    inventory: 28_000,
    capacity: 8_200,
    unitCost: 118,
    productPrice: 159,
    baseDemand: 5_100,
    sharesOutstanding: 10_000_000_000,
    floatRatioBps: 7_200,
    targetBookEquity: 100_000_000_000,
    industry: '储能装备',
    lifecycle: '规模成长',
    informationTransparencyBps: 7_800,
    management: {
      confidenceBps: 7_400,
      operatingStyle: '扩产与订单兑现并重',
      chiefExecutive: {
        name: '乔川',
        incentive: '市场份额与交付',
      },
      financeLead: {
        name: '方霁',
        incentive: '扩产融资与自由现金流',
      },
      investorRelations: {
        name: '韩若',
        incentive: '订单披露与预期差管理',
      },
    },
    macroExposures: ['新能源装机', '制造业投资', '融资成本'],
    supplierCompanyIds: [
      'company_aurora_materials',
      'company_northern_logistics',
    ],
    customerCompanyIds: [
      'company_horizon_systems',
      'company_anlan_grid',
    ],
    financialBaseline: {
      trailingRevenue: 180_000_000_000,
      trailingNetIncome: 15_600_000_000,
      trailingFreeCashFlow: 12_500_000_000,
      operatingExpenseRatio: 0.168,
      maintenanceCapexRatio: 0.022,
      annualInterestRateBps: 620,
      valuationPolicy: {
        earningsMultiple: 20,
        bookMultiple: 3.12,
        freeCashFlowMultiple: 24.96,
        earningsWeightBps: 4_600,
        bookWeightBps: 2_000,
        freeCashFlowWeightBps: 3_400,
        baseUncertaintyBps: 1_400,
      },
    },
  },
  {
    id: 'company_horizon_systems',
    symbol: 'LZA003',
    name: '岚序系统',
    shortName: '岚序',
    role: '系统集成',
    description: '面向园区客户交付储能系统，项目波动大、信息分歧多。',
    board: 'chinext',
    dailyLimitBps: 2_000,
    openingPrice: 46.8,
    cash: 180_000_000_000,
    debt: 120_000_000_000,
    inventory: 16_500,
    capacity: 6_400,
    unitCost: 205,
    productPrice: 286,
    baseDemand: 3_800,
    sharesOutstanding: 42_000_000_000,
    floatRatioBps: 7_800,
    targetBookEquity: 420_000_000_000,
    industry: '能源系统',
    lifecycle: '平台成熟',
    informationTransparencyBps: 8_300,
    management: {
      confidenceBps: 8_100,
      operatingStyle: '平台交付与客户回款',
      chiefExecutive: {
        name: '俞岚',
        incentive: '项目毛利与续约',
      },
      financeLead: {
        name: '贺清',
        incentive: '回款与海外风险',
      },
      investorRelations: {
        name: '吴昭',
        incentive: '项目节点披露',
      },
    },
    macroExposures: ['电力投资', '数据中心负荷', '海外订单'],
    supplierCompanyIds: [
      'company_river_equipment',
      'company_yuncen_compute',
    ],
    customerCompanyIds: ['company_anlan_grid'],
    financialBaseline: {
      trailingRevenue: 650_000_000_000,
      trailingNetIncome: 75_000_000_000,
      trailingFreeCashFlow: 62_000_000_000,
      operatingExpenseRatio: 0.195,
      maintenanceCapexRatio: 0.028,
      annualInterestRateBps: 650,
      valuationPolicy: {
        earningsMultiple: 26.2,
        bookMultiple: 4.68,
        freeCashFlowMultiple: 31.7,
        earningsWeightBps: 4_800,
        bookWeightBps: 1_700,
        freeCashFlowWeightBps: 3_500,
        baseUncertaintyBps: 1_650,
      },
    },
  },
  {
    id: 'company_anlan_grid',
    symbol: 'LZB101',
    name: '安澜电网',
    shortName: '安澜',
    role: '公用事业',
    description: '运营跨区输配电和调峰资产，现金流稳健但资本开支密集。',
    board: 'main',
    dailyLimitBps: 1_000,
    openingPrice: 12.6,
    cash: 48_000_000_000,
    debt: 190_000_000_000,
    inventory: 1_800,
    capacity: 21_000,
    unitCost: 42,
    productPrice: 58,
    baseDemand: 18_000,
    sharesOutstanding: 40_000_000_000,
    floatRatioBps: 6_500,
    targetBookEquity: 180_000_000_000,
    industry: '电力公用事业',
    lifecycle: '稳定成熟',
    informationTransparencyBps: 8_800,
    management: {
      confidenceBps: 8_500,
      operatingStyle: '稳健资本开支',
      chiefExecutive: {
        name: '周衡',
        incentive: '供电可靠与资产回报',
      },
      financeLead: {
        name: '黎榕',
        incentive: '债务期限与分红能力',
      },
      investorRelations: {
        name: '梁宁',
        incentive: '监管信息完整披露',
      },
    },
    macroExposures: ['利率', '全社会用电量', '监管电价'],
    supplierCompanyIds: [
      'company_horizon_systems',
      'company_river_equipment',
    ],
    customerCompanyIds: [],
    financialBaseline: {
      trailingRevenue: 260_000_000_000,
      trailingNetIncome: 28_000_000_000,
      trailingFreeCashFlow: 25_000_000_000,
      operatingExpenseRatio: 0.142,
      maintenanceCapexRatio: 0.085,
      annualInterestRateBps: 440,
      valuationPolicy: {
        earningsMultiple: 18,
        bookMultiple: 2.8,
        freeCashFlowMultiple: 20.16,
        earningsWeightBps: 4_200,
        bookWeightBps: 3_300,
        freeCashFlowWeightBps: 2_500,
        baseUncertaintyBps: 900,
      },
    },
  },
  {
    id: 'company_yuncen_compute',
    symbol: 'LZC201',
    name: '云岑算力',
    shortName: '云岑',
    role: '算力基础设施',
    description: '提供训练集群和工业边缘算力，订单增长快且设备折旧压力高。',
    board: 'star',
    dailyLimitBps: 2_000,
    openingPrice: 72,
    cash: 18_000_000_000,
    debt: 22_000_000_000,
    inventory: 6_400,
    capacity: 3_200,
    unitCost: 330,
    productPrice: 510,
    baseDemand: 2_100,
    sharesOutstanding: 2_500_000_000,
    floatRatioBps: 6_200,
    targetBookEquity: 30_000_000_000,
    industry: '数字基础设施',
    lifecycle: '高速成长',
    informationTransparencyBps: 6_200,
    management: {
      confidenceBps: 6_300,
      operatingStyle: '技术投入换取规模',
      chiefExecutive: {
        name: '程砺',
        incentive: '集群上架与订单增长',
      },
      financeLead: {
        name: '夏庭',
        incentive: '折旧回收与电力成本',
      },
      investorRelations: {
        name: '罗嘉',
        incentive: '利用率与订单透明',
      },
    },
    macroExposures: ['算力投资', '芯片供给', '电价'],
    supplierCompanyIds: [
      'company_aurora_materials',
      'company_anlan_grid',
    ],
    customerCompanyIds: [
      'company_horizon_systems',
      'company_qinghe_biotech',
    ],
    financialBaseline: {
      trailingRevenue: 45_000_000_000,
      trailingNetIncome: 4_000_000_000,
      trailingFreeCashFlow: 3_200_000_000,
      operatingExpenseRatio: 0.245,
      maintenanceCapexRatio: 0.09,
      annualInterestRateBps: 610,
      valuationPolicy: {
        earningsMultiple: 45,
        bookMultiple: 6,
        freeCashFlowMultiple: 56.25,
        earningsWeightBps: 4_800,
        bookWeightBps: 1_600,
        freeCashFlowWeightBps: 3_600,
        baseUncertaintyBps: 2_250,
      },
    },
  },
  {
    id: 'company_haiyue_consumer',
    symbol: 'LZD301',
    name: '海岳消费',
    shortName: '海岳',
    role: '大众消费',
    description: '经营区域食品与日用品品牌，渠道广、增长温和并持续分红。',
    board: 'main',
    dailyLimitBps: 1_000,
    openingPrice: 25,
    cash: 12_000_000_000,
    debt: 8_000_000_000,
    inventory: 24_000,
    capacity: 12_000,
    unitCost: 36,
    productPrice: 57,
    baseDemand: 10_500,
    sharesOutstanding: 4_000_000_000,
    floatRatioBps: 7_000,
    targetBookEquity: 40_000_000_000,
    industry: '必选消费',
    lifecycle: '稳定成熟',
    informationTransparencyBps: 8_000,
    management: {
      confidenceBps: 7_900,
      operatingStyle: '渠道周转与持续分红',
      chiefExecutive: {
        name: '江越',
        incentive: '同店增长与品牌份额',
      },
      financeLead: {
        name: '苏禾',
        incentive: '库存周转与分红现金',
      },
      investorRelations: {
        name: '杜晴',
        incentive: '渠道库存透明',
      },
    },
    macroExposures: ['居民收入', '原料价格', '渠道库存'],
    supplierCompanyIds: ['company_northern_logistics'],
    customerCompanyIds: [],
    financialBaseline: {
      trailingRevenue: 70_000_000_000,
      trailingNetIncome: 6_250_000_000,
      trailingFreeCashFlow: 5_500_000_000,
      operatingExpenseRatio: 0.19,
      maintenanceCapexRatio: 0.025,
      annualInterestRateBps: 490,
      valuationPolicy: {
        earningsMultiple: 16,
        bookMultiple: 2.5,
        freeCashFlowMultiple: 18.18,
        earningsWeightBps: 4_400,
        bookWeightBps: 2_700,
        freeCashFlowWeightBps: 2_900,
        baseUncertaintyBps: 1_050,
      },
    },
  },
  {
    id: 'company_northern_logistics',
    symbol: 'LZE401',
    name: '北陆物流',
    shortName: '北陆',
    role: '综合物流',
    description: '连接港口、铁路和仓储网络，盈利随贸易量与燃料成本波动。',
    board: 'main',
    dailyLimitBps: 1_000,
    openingPrice: 16,
    cash: 5_000_000_000,
    debt: 12_000_000_000,
    inventory: 8_000,
    capacity: 18_000,
    unitCost: 28,
    productPrice: 39,
    baseDemand: 14_000,
    sharesOutstanding: 1_750_000_000,
    floatRatioBps: 7_500,
    targetBookEquity: 18_700_000_000,
    industry: '交通物流',
    lifecycle: '周期成熟',
    informationTransparencyBps: 7_400,
    management: {
      confidenceBps: 6_600,
      operatingStyle: '周转优先、控制燃料成本',
      chiefExecutive: {
        name: '邵闻',
        incentive: '货量与准点率',
      },
      financeLead: {
        name: '白恪',
        incentive: '负债与车队回报',
      },
      investorRelations: {
        name: '段宁',
        incentive: '运价与货量披露',
      },
    },
    macroExposures: ['贸易量', '油价', '制造业库存'],
    supplierCompanyIds: [],
    customerCompanyIds: [
      'company_aurora_materials',
      'company_river_equipment',
      'company_haiyue_consumer',
    ],
    financialBaseline: {
      trailingRevenue: 55_000_000_000,
      trailingNetIncome: 1_400_000_000,
      trailingFreeCashFlow: 1_000_000_000,
      operatingExpenseRatio: 0.225,
      maintenanceCapexRatio: 0.075,
      annualInterestRateBps: 670,
      valuationPolicy: {
        earningsMultiple: 20,
        bookMultiple: 1.5,
        freeCashFlowMultiple: 28,
        earningsWeightBps: 4_200,
        bookWeightBps: 3_300,
        freeCashFlowWeightBps: 2_500,
        baseUncertaintyBps: 1_850,
      },
    },
  },
  {
    id: 'company_qinghe_biotech',
    symbol: 'LZF501',
    name: '清禾生科',
    shortName: '清禾',
    role: '生命科学',
    description: '开发合成诊断和生物工艺平台，研发成功率与商业化节奏决定价值。',
    board: 'chinext',
    dailyLimitBps: 2_000,
    openingPrice: 30,
    cash: 6_500_000_000,
    debt: 2_800_000_000,
    inventory: 1_200,
    capacity: 1_400,
    unitCost: 190,
    productPrice: 420,
    baseDemand: 780,
    sharesOutstanding: 1_500_000_000,
    floatRatioBps: 6_000,
    targetBookEquity: 8_000_000_000,
    industry: '生命科学',
    lifecycle: '研发转商业化',
    informationTransparencyBps: 5_400,
    management: {
      confidenceBps: 5_800,
      operatingStyle: '研发里程碑驱动',
      chiefExecutive: {
        name: '叶澄',
        incentive: '研发成功与商业化',
      },
      financeLead: {
        name: '季维',
        incentive: '现金跑道与融资成本',
      },
      investorRelations: {
        name: '陈辛',
        incentive: '试验进展如实披露',
      },
    },
    macroExposures: ['研发审批', '医疗支出', '融资环境'],
    supplierCompanyIds: ['company_yuncen_compute'],
    customerCompanyIds: [],
    financialBaseline: {
      trailingRevenue: 9_000_000_000,
      trailingNetIncome: 1_000_000_000,
      trailingFreeCashFlow: 600_000_000,
      operatingExpenseRatio: 0.34,
      maintenanceCapexRatio: 0.045,
      annualInterestRateBps: 720,
      valuationPolicy: {
        earningsMultiple: 45,
        bookMultiple: 5.625,
        freeCashFlowMultiple: 75,
        earningsWeightBps: 5_000,
        bookWeightBps: 1_500,
        freeCashFlowWeightBps: 3_500,
        baseUncertaintyBps: 2_900,
      },
    },
  },
  {
    id: 'company_frontier_semiconductor',
    symbol: 'LZG601',
    name: '微澜芯源',
    shortName: '微澜',
    role: '先进半导体',
    description: '研发高带宽互连芯片，尚处验证期，研发里程碑和现金跑道决定生存。',
    businessModel: { kind: 'research_platform', revenueDriver: '研发授权与芯片出货' },
    board: 'star',
    dailyLimitBps: 2_000,
    openingPrice: 22,
    cash: 4_800_000_000,
    debt: 900_000_000,
    inventory: 320,
    capacity: 420,
    unitCost: 760,
    productPrice: 1_180,
    baseDemand: 95,
    sharesOutstanding: 800_000_000,
    floatRatioBps: 5_200,
    targetBookEquity: 5_900_000_000,
    industry: '半导体',
    lifecycle: '早期研发',
    informationTransparencyBps: 4_600,
    management: {
      confidenceBps: 5_200,
      operatingStyle: '技术验证与现金跑道优先',
      chiefExecutive: { name: '顾微', incentive: '流片成功与客户导入' },
      financeLead: { name: '林霁', incentive: '研发预算与融资期限' },
      investorRelations: { name: '许辰', incentive: '里程碑如实披露' },
    },
    macroExposures: ['算力投资', '先进制程供给', '股权融资'],
    supplierCompanyIds: ['company_yuncen_compute'],
    customerCompanyIds: ['company_horizon_systems'],
    financialBaseline: {
      trailingRevenue: 1_200_000_000,
      trailingNetIncome: -1_050_000_000,
      trailingFreeCashFlow: -1_380_000_000,
      operatingExpenseRatio: 1.05,
      maintenanceCapexRatio: 0.16,
      annualInterestRateBps: 760,
      valuationPolicy: {
        earningsMultiple: 0,
        bookMultiple: 2.98,
        freeCashFlowMultiple: 0,
        earningsWeightBps: 0,
        bookWeightBps: 10_000,
        freeCashFlowWeightBps: 0,
        baseUncertaintyBps: 4_200,
      },
    },
  },
  {
    id: 'company_horizon_software',
    symbol: 'LZH701',
    name: '长镜智软',
    shortName: '长镜',
    role: '工业软件',
    description: '销售工业数字孪生订阅，续费率较高但增长依赖企业技术预算。',
    businessModel: { kind: 'subscription_software', revenueDriver: '订阅席位与续费' },
    board: 'chinext',
    dailyLimitBps: 2_000,
    openingPrice: 38,
    cash: 7_200_000_000,
    debt: 1_600_000_000,
    inventory: 80,
    capacity: 2_600,
    unitCost: 28,
    productPrice: 96,
    baseDemand: 1_450,
    sharesOutstanding: 1_200_000_000,
    floatRatioBps: 6_800,
    targetBookEquity: 9_500_000_000,
    industry: '工业软件',
    lifecycle: '规模成长',
    informationTransparencyBps: 6_700,
    management: {
      confidenceBps: 7_000,
      operatingStyle: '续费与产品研发并重',
      chiefExecutive: { name: '陆镜', incentive: '续费率与客户扩张' },
      financeLead: { name: '陶简', incentive: '获客成本与现金回收' },
      investorRelations: { name: '温序', incentive: '合同负债披露' },
    },
    macroExposures: ['企业软件预算', '制造业升级', '人才成本'],
    supplierCompanyIds: ['company_yuncen_compute'],
    customerCompanyIds: ['company_river_equipment', 'company_northern_logistics'],
    financialBaseline: {
      trailingRevenue: 12_000_000_000,
      trailingNetIncome: 1_350_000_000,
      trailingFreeCashFlow: 1_700_000_000,
      operatingExpenseRatio: 0.53,
      maintenanceCapexRatio: 0.018,
      annualInterestRateBps: 560,
      valuationPolicy: {
        earningsMultiple: 33.8,
        bookMultiple: 4.8,
        freeCashFlowMultiple: 26.8,
        earningsWeightBps: 4_500,
        bookWeightBps: 1_500,
        freeCashFlowWeightBps: 4_000,
        baseUncertaintyBps: 2_250,
      },
    },
  },
  {
    id: 'company_heyuan_bank',
    symbol: 'LZI801',
    name: '和源银行',
    shortName: '和源',
    role: '全国性银行',
    description: '以公司与零售存贷款为主，收益取决于净息差、资产质量和资本约束。',
    businessModel: { kind: 'commercial_bank', revenueDriver: '净利息与手续费收入' },
    financialInstitution: {
      loans: 7_600_000_000_000,
      loansCents: 760_000_000_000_000,
      deposits: 9_100_000_000_000,
      depositsCents: 910_000_000_000_000,
      securitiesAssetsCents: 240_000_000_000_000,
      loanYieldBps: 368,
      depositCostBps: 180,
      netInterestMarginBps: 176,
      nonPerformingLoanBps: 128,
      creditCostBps: 92,
      capitalAdequacyBps: 1_360,
      liquidityCoverageBps: 13_800,
    },
    board: 'main',
    dailyLimitBps: 1_000,
    openingPrice: 12,
    cash: 920_000_000_000,
    debt: 1_400_000_000_000,
    inventory: 0,
    capacity: 1,
    unitCost: 1,
    productPrice: 1,
    baseDemand: 1,
    sharesOutstanding: 120_000_000_000,
    floatRatioBps: 7_600,
    targetBookEquity: 980_000_000_000,
    industry: '银行',
    lifecycle: '超大盘成熟',
    informationTransparencyBps: 9_000,
    management: {
      confidenceBps: 8_300,
      operatingStyle: '资本充足与资产质量优先',
      chiefExecutive: { name: '程和', incentive: '风险调整后收益' },
      financeLead: { name: '谢源', incentive: '净息差与资本补充' },
      investorRelations: { name: '彭衡', incentive: '资产质量透明' },
    },
    macroExposures: ['利率曲线', '信用周期', '房地产质量'],
    supplierCompanyIds: [],
    customerCompanyIds: [],
    financialCounterpartyCompanyIds: [
      'company_river_equipment',
      'company_anlan_grid',
      'company_haiyue_consumer',
    ],
    financialBaseline: {
      trailingRevenue: 510_000_000_000,
      trailingNetIncome: 185_000_000_000,
      trailingFreeCashFlow: 162_000_000_000,
      operatingExpenseRatio: 0.31,
      maintenanceCapexRatio: 0.006,
      annualInterestRateBps: 220,
      valuationPolicy: {
        earningsMultiple: 7.78,
        bookMultiple: 1.47,
        freeCashFlowMultiple: 8.89,
        earningsWeightBps: 4_000,
        bookWeightBps: 4_500,
        freeCashFlowWeightBps: 1_500,
        baseUncertaintyBps: 850,
      },
    },
  },
  {
    id: 'company_sihai_insurance',
    symbol: 'LZJ901',
    name: '四海保险',
    shortName: '四海',
    role: '综合保险',
    description: '经营寿险与财险，利润受保费质量、准备金、投资收益和偿付能力约束。',
    businessModel: { kind: 'insurance_group', revenueDriver: '保费与投资收益' },
    financialInstitution: {
      premiumIncome: 620_000_000_000,
      writtenPremiumCents: 62_000_000_000_000,
      earnedPremiumCents: 60_000_000_000_000,
      claimsCents: 37_800_000_000_000,
      expenseCents: 9_600_000_000_000,
      insuranceReserves: 3_900_000_000_000,
      insuranceReserveCents: 390_000_000_000_000,
      investedAssets: 4_600_000_000_000,
      investedAssetsCents: 460_000_000_000_000,
      investmentReturnCents: 16_790_000_000_000,
      claimsRatioBps: 6_300,
      investmentYieldBps: 365,
      solvencyRatioBps: 18_600,
      durationGapBps: 140,
    },
    board: 'main',
    dailyLimitBps: 1_000,
    openingPrice: 18,
    cash: 410_000_000_000,
    debt: 520_000_000_000,
    inventory: 0,
    capacity: 1,
    unitCost: 1,
    productPrice: 1,
    baseDemand: 1,
    sharesOutstanding: 50_000_000_000,
    floatRatioBps: 6_900,
    targetBookEquity: 860_000_000_000,
    industry: '保险',
    lifecycle: '超大盘成熟',
    informationTransparencyBps: 8_600,
    management: {
      confidenceBps: 8_000,
      operatingStyle: '承保质量与久期匹配',
      chiefExecutive: { name: '闻海', incentive: '新业务价值与综合成本率' },
      financeLead: { name: '顾澜', incentive: '偿付能力与久期缺口' },
      investorRelations: { name: '叶舟', incentive: '准备金与投资披露' },
    },
    macroExposures: ['长端利率', '权益市场', '灾害损失'],
    supplierCompanyIds: [],
    customerCompanyIds: [],
    financialCounterpartyCompanyIds: [
      'company_heyuan_bank',
      'company_haiyue_consumer',
      'company_northern_logistics',
    ],
    investmentExposureCompanyIds: [
      'company_anlan_grid',
      'company_horizon_systems',
    ],
    financialBaseline: {
      trailingRevenue: 720_000_000_000,
      trailingNetIncome: 82_000_000_000,
      trailingFreeCashFlow: 71_000_000_000,
      operatingExpenseRatio: 0.16,
      maintenanceCapexRatio: 0.004,
      annualInterestRateBps: 310,
      valuationPolicy: {
        earningsMultiple: 10.98,
        bookMultiple: 1.05,
        freeCashFlowMultiple: 12.68,
        earningsWeightBps: 4_200,
        bookWeightBps: 4_000,
        freeCashFlowWeightBps: 1_800,
        baseUncertaintyBps: 1_050,
      },
    },
  },
  {
    id: 'company_henglu_chemical',
    symbol: 'LZK011',
    name: '衡陆化工',
    shortName: '衡陆',
    role: '周期化工',
    description: '老产线改造中的周期企业，利润受价差、负债和环保资本开支共同影响。',
    businessModel: { kind: 'industrial_operator', revenueDriver: '产品价差与产能利用' },
    board: 'main',
    dailyLimitBps: 1_000,
    openingPrice: 12.8,
    cash: 3_200_000_000,
    debt: 18_500_000_000,
    inventory: 31_000,
    capacity: 26_000,
    unitCost: 51,
    productPrice: 58,
    baseDemand: 17_000,
    sharesOutstanding: 2_800_000_000,
    floatRatioBps: 7_900,
    targetBookEquity: 14_000_000_000,
    industry: '基础化工',
    lifecycle: '转型困境',
    informationTransparencyBps: 5_800,
    management: {
      confidenceBps: 5_400,
      operatingStyle: '降杠杆与产线改造',
      chiefExecutive: { name: '郁衡', incentive: '价差与安全生产' },
      financeLead: { name: '周陆', incentive: '债务展期与现金流' },
      investorRelations: { name: '乔岑', incentive: '改造进度透明' },
    },
    macroExposures: ['原油价格', '工业需求', '信用利差'],
    supplierCompanyIds: ['company_northern_logistics'],
    customerCompanyIds: ['company_aurora_materials'],
    financialBaseline: {
      trailingRevenue: 38_000_000_000,
      trailingNetIncome: -620_000_000,
      trailingFreeCashFlow: -1_100_000_000,
      operatingExpenseRatio: 0.18,
      maintenanceCapexRatio: 0.095,
      annualInterestRateBps: 840,
      valuationPolicy: {
        earningsMultiple: 0,
        bookMultiple: 2.56,
        freeCashFlowMultiple: 0,
        earningsWeightBps: 0,
        bookWeightBps: 10_000,
        freeCashFlowWeightBps: 0,
        baseUncertaintyBps: 3_200,
      },
    },
  },
  {
    id: 'company_qiming_robotics',
    symbol: 'LZL121',
    name: '启明机器人',
    shortName: '启明',
    role: '智能机器人',
    description: '向中小工厂交付柔性机器人，订单快增但客户集中度和交付波动较高。',
    businessModel: { kind: 'advanced_manufacturing', revenueDriver: '机器人交付与服务' },
    board: 'star',
    dailyLimitBps: 2_000,
    openingPrice: 54,
    cash: 5_600_000_000,
    debt: 3_900_000_000,
    inventory: 2_800,
    capacity: 1_900,
    unitCost: 165,
    productPrice: 310,
    baseDemand: 820,
    sharesOutstanding: 620_000_000,
    floatRatioBps: 5_800,
    targetBookEquity: 7_200_000_000,
    industry: '智能装备',
    lifecycle: '早期成长',
    informationTransparencyBps: 5_100,
    management: {
      confidenceBps: 6_100,
      operatingStyle: '迭代与交付并重',
      chiefExecutive: { name: '齐明', incentive: '产品迭代与复购' },
      financeLead: { name: '骆青', incentive: '营运资本与供应保障' },
      investorRelations: { name: '孟启', incentive: '客户集中度披露' },
    },
    macroExposures: ['制造业自动化', '核心零部件', '中小企业信用'],
    supplierCompanyIds: ['company_aurora_materials', 'company_yuncen_compute'],
    customerCompanyIds: ['company_river_equipment'],
    financialBaseline: {
      trailingRevenue: 6_800_000_000,
      trailingNetIncome: 180_000_000,
      trailingFreeCashFlow: -260_000_000,
      operatingExpenseRatio: 0.36,
      maintenanceCapexRatio: 0.055,
      annualInterestRateBps: 690,
      valuationPolicy: {
        earningsMultiple: 186,
        bookMultiple: 4.65,
        freeCashFlowMultiple: 0,
        earningsWeightBps: 5_500,
        bookWeightBps: 4_500,
        freeCashFlowWeightBps: 0,
        baseUncertaintyBps: 3_350,
      },
    },
  },
].map((template) => Object.freeze(enrichCompanyTemplate(template))));

function enrichCompanyTemplate(template) {
  const marketCap = template.openingPrice * template.sharesOutstanding;
  const size =
    marketCap >= 500_000_000_000
      ? 'mega'
      : marketCap >= 100_000_000_000
        ? 'large'
        : marketCap >= 20_000_000_000
          ? 'mid'
          : 'small';
  const kind = template.businessModel?.kind ?? 'industrial_operator';
  const balanceSheetModel =
    kind === 'commercial_bank'
      ? 'banking_book'
      : kind === 'insurance_group'
        ? 'insurance_reserve_book'
        : kind === 'subscription_software' ||
            kind === 'research_platform'
          ? 'asset_light_operating'
          : 'operating_working_capital';
  const informationQuality =
    template.informationTransparencyBps >= 8_000
      ? 'high'
      : template.informationTransparencyBps >= 6_000
        ? 'medium'
        : 'low';
  return {
    ...template,
    businessModel: template.businessModel ?? {
      kind,
      revenueDriver: '产销与服务',
    },
    sector: template.industry,
    size,
    balanceSheetModel,
    informationQuality,
    macroExposure: clone(template.macroExposures),
    financialCounterpartyCompanyIds:
      clone(template.financialCounterpartyCompanyIds ?? []),
    investmentExposureCompanyIds:
      clone(template.investmentExposureCompanyIds ?? []),
  };
}
const LISTING_LIQUIDITY_PROFILES = Object.freeze({
  LZA001: Object.freeze({
    expectedDailyTurnoverBps: 220,
    normalHalfSpreadTicks: 2,
    // A routine 10k-share child order is only about 1.4% of this listing's
    // synthetic ADV. Keep the book finite, but do not make that ordinary
    // participation consume a sixth of all maker inventory.
    makerInventoryCapacityUnits: 90_000,
    depthClass: 'small_cap_active',
  }),
  LZA002: Object.freeze({
    expectedDailyTurnoverBps: 80,
    normalHalfSpreadTicks: 1,
    makerInventoryCapacityUnits: 1_000_000,
    depthClass: 'large_cap_growth',
  }),
  LZA003: Object.freeze({
    expectedDailyTurnoverBps: 45,
    normalHalfSpreadTicks: 1,
    makerInventoryCapacityUnits: 2_000_000,
    depthClass: 'mega_cap_core',
  }),
  LZB101: Object.freeze({
    expectedDailyTurnoverBps: 25,
    normalHalfSpreadTicks: 1,
    makerInventoryCapacityUnits: 1_600_000,
    depthClass: 'mega_cap_defensive',
  }),
  LZC201: Object.freeze({
    expectedDailyTurnoverBps: 180,
    normalHalfSpreadTicks: 1,
    makerInventoryCapacityUnits: 450_000,
    depthClass: 'growth_high_turnover',
  }),
  LZD301: Object.freeze({
    expectedDailyTurnoverBps: 55,
    normalHalfSpreadTicks: 1,
    makerInventoryCapacityUnits: 500_000,
    depthClass: 'large_cap_defensive',
  }),
  LZE401: Object.freeze({
    expectedDailyTurnoverBps: 100,
    normalHalfSpreadTicks: 1,
    makerInventoryCapacityUnits: 450_000,
    depthClass: 'mid_cap_cyclical',
  }),
  LZF501: Object.freeze({
    expectedDailyTurnoverBps: 240,
    normalHalfSpreadTicks: 2,
    makerInventoryCapacityUnits: 300_000,
    depthClass: 'event_driven_growth',
  }),
  LZG601: Object.freeze({
    expectedDailyTurnoverBps: 360,
    normalHalfSpreadTicks: 3,
    makerInventoryCapacityUnits: 140_000,
    depthClass: 'early_research_high_dispersion',
  }),
  LZH701: Object.freeze({
    expectedDailyTurnoverBps: 210,
    normalHalfSpreadTicks: 2,
    makerInventoryCapacityUnits: 360_000,
    depthClass: 'growth_software',
  }),
  LZI801: Object.freeze({
    expectedDailyTurnoverBps: 18,
    normalHalfSpreadTicks: 1,
    makerInventoryCapacityUnits: 4_500_000,
    depthClass: 'mega_bank_stable',
  }),
  LZJ901: Object.freeze({
    expectedDailyTurnoverBps: 24,
    normalHalfSpreadTicks: 1,
    makerInventoryCapacityUnits: 3_100_000,
    depthClass: 'mega_insurance_stable',
  }),
  LZK011: Object.freeze({
    expectedDailyTurnoverBps: 155,
    normalHalfSpreadTicks: 2,
    makerInventoryCapacityUnits: 260_000,
    depthClass: 'leveraged_turnaround',
  }),
  LZL121: Object.freeze({
    expectedDailyTurnoverBps: 290,
    normalHalfSpreadTicks: 3,
    makerInventoryCapacityUnits: 180_000,
    depthClass: 'small_cap_frontier',
  }),
});

const PROFILE_TEMPLATES = Object.freeze({
  household: {
    label: '个人／家庭投资者',
    identity: '个人资产、负债、生活储备与证券账户。',
    low: {
      name: '稳步起家',
      capital: 160_000,
      otherAssets: 260_000,
      liabilities: 86_000,
      research: 5,
      cashReserve: 48_000,
      monthlyIncome: 14_000,
      livingExpense: 8_600,
    },
    high: {
      name: '宽裕家庭',
      capital: 980_000,
      otherAssets: 1_850_000,
      liabilities: 430_000,
      research: 8,
      cashReserve: 240_000,
      monthlyIncome: 38_000,
      livingExpense: 21_000,
    },
  },
  professional: {
    label: '职业投资者',
    identity: '受托账户，受授权、回撤与考核周期约束。',
    low: {
      name: '小型资管研究员',
      capital: 720_000,
      otherAssets: 180_000,
      liabilities: 0,
      research: 12,
      mandateCapital: 1_100_000,
      drawdownLimit: 0.12,
      evaluationHorizon: 24,
    },
    high: {
      name: '成熟组合负责人',
      capital: 4_800_000,
      otherAssets: 760_000,
      liabilities: 0,
      research: 18,
      mandateCapital: 8_000_000,
      drawdownLimit: 0.09,
      evaluationHorizon: 48,
    },
  },
  operator: {
    label: '企业经营者',
    identity: '企业现金、库存、产能、债务与证券账户联动。',
    low: {
      name: '创业经营者',
      capital: 420_000,
      otherAssets: 560_000,
      liabilities: 210_000,
      research: 7,
      controlledCompanyId: 'company_river_equipment',
      operatingAuthority: 0.52,
      expansionCredit: 2_000_000,
    },
    high: {
      name: '产业控制人',
      capital: 2_600_000,
      otherAssets: 8_200_000,
      liabilities: 3_400_000,
      research: 10,
      controlledCompanyId: 'company_river_equipment',
      operatingAuthority: 0.78,
      expansionCredit: 12_000_000,
    },
  },
  institution: {
    label: '投资机构',
    identity: '自有资本与受托资产并行，受赎回和流动性约束。',
    low: {
      name: '区域投资机构',
      capital: 3_200_000,
      otherAssets: 1_400_000,
      liabilities: 2_100_000,
      research: 14,
      assetsUnderManagement: 14_000_000,
      liquidityBufferRatio: 0.3,
      redemptionPressure: 0.05,
    },
    high: {
      name: '大型综合机构',
      capital: 24_000_000,
      otherAssets: 11_000_000,
      liabilities: 18_000_000,
      research: 22,
      assetsUnderManagement: 120_000_000,
      liquidityBufferRatio: 0.24,
      redemptionPressure: 0.08,
    },
  },
});

const NPC_INVESTOR_TEMPLATES = Object.freeze([
  {
    id: 'npc_value_fund',
    name: '远衡价值基金',
    strategy: 'valuation',
    cash: 15_000_000_000,
    floatHoldingBps: 120,
    tradingEnabled: true,
  },
  {
    id: 'npc_trend_fund',
    name: '折线趋势组合',
    strategy: 'trend',
    cash: 12_000_000_000,
    floatHoldingBps: 80,
    tradingEnabled: true,
  },
  {
    id: 'npc_industry_fund',
    name: '积流产业资本',
    strategy: 'industry',
    cash: 18_000_000_000,
    floatHoldingBps: 150,
    tradingEnabled: true,
  },
  {
    id: 'holder_public_custody',
    name: '社会公众托管汇总',
    strategy: 'passive_custody',
    cash: 0,
    floatHoldingBps: 8_800,
    tradingEnabled: false,
    holderKind: 'public_float',
  },
  ...COMPANY_TEMPLATES.map((company) => ({
    id: `holder_${company.symbol.toLowerCase()}_controller`,
    name: `${company.shortName}产业控股`,
    strategy: 'strategic_control',
    cash: 0,
    strategicIssuerId: company.id,
    tradingEnabled: false,
    holderKind: 'controlling_shareholder',
  })),
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function money(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function moneyToCents(value, label = 'money') {
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`Invalid ${label} cents.`);
  }
  return cents;
}

function centsToMoney(value, label = 'money') {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Invalid ${label} cents.`);
  }
  return money(value / 100);
}

function roundedIntegerRatio(
  value,
  numerator,
  denominator,
  label = 'integer ratio',
) {
  if (
    !Number.isSafeInteger(value) ||
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    denominator <= 0
  ) {
    throw new Error(`Invalid ${label}.`);
  }
  const negative = (value < 0) !== (numerator < 0);
  const product =
    BigInt(Math.abs(value)) *
    BigInt(Math.abs(numerator));
  const divisor = BigInt(denominator);
  const rounded = Number(
    (product + divisor / 2n) / divisor,
  );
  if (!Number.isSafeInteger(rounded)) {
    throw new Error(`Unsafe ${label}.`);
  }
  return negative ? -rounded : rounded;
}

function writeDownLifeAsset(state, possession, percentagePoints) {
  const previousValue = money(
    Math.max(0, Number(possession.carryingValue) || 0),
  );
  if (previousValue <= 0 || percentagePoints <= 0) {
    possession.carryingValue = previousValue;
    return 0;
  }
  const reduction = money(
    Math.min(
      previousValue,
      Math.max(0, Number(possession.acquiredPrice) || 0) *
        percentagePoints /
        100,
    ),
  );
  possession.carryingValue = money(previousValue - reduction);
  state.player.otherAssets = money(
    Math.max(0, Number(state.player.otherAssets) - reduction),
  );
  return reduction;
}

function price(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function hashString(input) {
  let hash = 2166136261;
  const text = String(input);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

function nextRandom(state) {
  state.world.rngState =
    (Math.imul(state.world.rngState, 1664525) + 1013904223) >>> 0;
  return state.world.rngState / 4294967296;
}

function nextId(state, prefix) {
  state.world.sequence += 1;
  return `${prefix}_${String(state.world.sequence).padStart(6, '0')}`;
}

function normalizeAllocation(allocation = {}) {
  const requestedCash = Number(allocation.cash);
  const requestedEquity = Number(allocation.equity);
  const safeCash = Number.isFinite(requestedCash)
    ? clamp(requestedCash, 0.2, 0.9)
    : 0.65;
  const safeEquity = Number.isFinite(requestedEquity)
    ? clamp(requestedEquity, 0.1, 0.8)
    : 1 - safeCash;
  const total = safeCash + safeEquity;
  return {
    cash: safeCash / total,
    equity: safeEquity / total,
  };
}

function createRoleState(roleType, profile, openingCash) {
  switch (roleType) {
    case 'household':
      return {
        cashReserve: profile.cashReserve,
        monthlyIncome: profile.monthlyIncome,
        livingExpense: profile.livingExpense,
        familyLiquidity: 'stable',
      };
    case 'professional':
      return {
        mandateCapital: profile.mandateCapital,
        drawdownLimit: profile.drawdownLimit,
        evaluationHorizon: profile.evaluationHorizon,
        reputation: 50,
        dissentLog: [],
      };
    case 'operator':
      return {
        controlledCompanyId: profile.controlledCompanyId,
        operatingAuthority: profile.operatingAuthority,
        expansionCredit: profile.expansionCredit,
        operatingStance: 'balanced',
      };
    case 'institution':
      return {
        assetsUnderManagement: profile.assetsUnderManagement,
        productLiability: profile.assetsUnderManagement,
        liquidityBufferRatio: profile.liquidityBufferRatio,
        liquidityBaseCash: openingCash,
        liquidityReserveFloor: money(
          openingCash * profile.liquidityBufferRatio,
        ),
        redemptionPressure: profile.redemptionPressure,
        marketAttention: 0,
        concentration: 0,
      };
    default:
      throw new Error(`Unsupported role: ${roleType}`);
  }
}

function normalizedLifeState(state) {
  return normalizeLifeState(state);
}

function ensureLifeState(state) {
  state.player.life = normalizedLifeState(state);
  state.cityLife = normalizeCityLifeState(
    state,
    getLifeProductCatalog(),
  );
  synchronizeLifeLocations(
    state.player.life,
    state.cityLife,
    LIFE_ITEM_BY_ID,
  );
  return state.player.life;
}

export function getLifeCatalog() {
  return getLifeProductCatalog();
}

export function getLifeProjection(state) {
  if (
    state?.experience?.publication ===
      'lzy_world_experience_public_v1' &&
    state.experience.life
  ) {
    return clone(state.experience.life);
  }
  const life = normalizedLifeState(state);
  const draft = {
    ...state,
    player: {
      ...state.player,
      life,
    },
  };
  const city = normalizeCityLifeState(
    draft,
    getLifeProductCatalog(),
  );
  synchronizeLifeLocations(life, city, LIFE_ITEM_BY_ID);
  draft.cityLife = city;
  const base = projectLifeState(draft);
  const cityProjection = projectCityLifeState(
    city,
    getLifeProductCatalog(),
  );
  const locations = projectPhysicalLocations(
    city,
    life,
    LIFE_ITEM_BY_ID,
  );
  const due = cityObligationAmount(city);
  return {
    ...base,
    ...cityProjection,
    homeLabel: city.role.primaryLabel,
    nextRestockTick: city.nextRestockTick,
    lastUpkeepTick: city.lastObligationTick,
    prices: cityProjection.prices,
    shopStock: cityProjection.shopStock,
    locations,
    space: {
      used: locations.primary.used,
      capacity: locations.primary.capacity,
      parkingUsed: locations.parking.used,
      parkingCapacity: locations.parking.capacity,
    },
    responsibility: {
      ...base.responsibility,
      amountDue: due,
      obligations: cityOpenObligations(city),
      nextDueTick: city.lastObligationTick + 10,
      recoveryActions:
        due > 0
          ? [
              'work_shift',
              'sell_asset',
              'cancel_service',
              'settle_obligations',
            ]
          : [],
    },
  };
}

function synchronizeSocialCareerProjection(state) {
  state.economy.socialCareerPublic = projectSocialCareerEcology(
    state.socialCareer,
    {
      playerRoleType: state.player.roleType,
    },
  );
  return state.economy.socialCareerPublic;
}

const SOCIAL_BUSINESS_ADAPTER_VERSION =
  'lzy-social-business-adapter-v1';
const SOCIAL_OPPORTUNITY_PUBLIC_LINKS = Object.freeze({
  opportunity_equipment_round: Object.freeze({
    companyId: 'company_river_equipment',
    industry: '工业装备',
  }),
  opportunity_channel_review: Object.freeze({
    companyId: 'company_haiyue_consumer',
    industry: '必选消费',
  }),
  opportunity_neighborhood_delivery: Object.freeze({
    companyId: 'company_northern_logistics',
    industry: '交通物流',
  }),
  opportunity_service_refresh: Object.freeze({
    companyId: 'company_haiyue_consumer',
    industry: '必选消费',
  }),
});

function socialBusinessActionOpportunity(
  socialCareer,
  action,
) {
  const contractId = action.payload?.contractId;
  const contract =
    contractId && socialCareer.contracts?.[contractId];
  return contract?.opportunityId
    ? socialCareer.opportunities?.[
        contract.opportunityId
      ]
    : null;
}

function consumeSocialBusinessActions(state) {
  const socialCareer = state.socialCareer;
  if (!socialCareer?.marketActionOutbox) return [];
  const acknowledgements = [];
  for (const action of socialCareer.marketActionOutbox) {
    if (action.status !== 'pending_adapter') continue;
    const organization =
      socialCareer.organizations?.[
        action.organizationId
      ];
    const opportunity =
      socialBusinessActionOpportunity(
        socialCareer,
        action,
      );
    const publicLink =
      opportunity &&
      SOCIAL_OPPORTUNITY_PUBLIC_LINKS[
        opportunity.id
      ];
    const event = addEvent(state, {
      type: 'social_business_action_acknowledged',
      actorId: action.organizationId,
      authority: SOCIAL_BUSINESS_ADAPTER_VERSION,
      affectedEntities: [
        action.organizationId,
        publicLink?.companyId,
      ].filter(Boolean),
      preconditions: [action.factId],
      summary: `${organization?.name ?? '本地经营主体'}的经营变化已经进入公开经营记录。`,
    });
    const worldFactIds = [];
    const localFact = addFact(state, {
      type: 'local_business_activity',
      entityId: action.organizationId,
      eventId: event.id,
      publishedAtMs:
        state.world.tick *
        SYNTHETIC_WORLD_DAY_MS,
      summary: `${organization?.name ?? '本地经营主体'}更新了一项经营状态。`,
      value: {
        sourceActionId: action.id,
        sourceSocialFactId: action.factId,
        actionType: action.type,
        opportunityId: opportunity?.id ?? null,
        payload: clone(action.payload ?? {}),
      },
    });
    worldFactIds.push(localFact.id);
    if (
      publicLink &&
      [
        'business_contract_signed',
        'business_contract_completed',
      ].includes(action.type)
    ) {
      const signalTicks =
        action.type ===
        'business_contract_completed'
          ? 4
          : 2;
      const company =
        state.entities.companies[
          publicLink.companyId
        ];
      const companyFact = addFact(state, {
        type: 'company_supply_chain_signal',
        entityId: publicLink.companyId,
        eventId: event.id,
        publishedAtMs:
          state.world.tick *
          SYNTHETIC_WORLD_DAY_MS,
        summary:
          action.type ===
          'business_contract_completed'
            ? `${company.name}所在供应链出现一笔已交付的本地业务。`
            : `${company.name}所在供应链新增一笔待履行的本地业务。`,
        value: {
          sourceActionId: action.id,
          sourceSocialFactId: action.factId,
          opportunityId: opportunity.id,
          industry: publicLink.industry,
          stage:
            action.type ===
            'business_contract_completed'
              ? 'completed'
              : 'signed',
          signalTicks,
          contractAmount:
            Number(action.payload?.amount) ||
            Number(
              socialCareer.contracts?.[
                action.payload?.contractId
              ]?.amount,
            ) ||
            0,
        },
      });
      worldFactIds.push(companyFact.id);
    }
    action.status = 'acknowledged';
    action.adapterVersion =
      SOCIAL_BUSINESS_ADAPTER_VERSION;
    action.acknowledgedTick =
      state.world.tick;
    action.acknowledgementEventId = event.id;
    action.worldFactIds = worldFactIds;
    acknowledgements.push({
      actionId: action.id,
      eventId: event.id,
      worldFactIds,
    });
  }
  return acknowledgements;
}

export function getSocialCareerProjection(state) {
  if (
    state?.socialCareer?.schemaVersion ===
    socialCareerSchemaVersion()
  ) {
    return projectSocialCareerEcology(state.socialCareer, {
      playerRoleType: state.player?.roleType,
    });
  }
  if (
    state?.economy?.socialCareerPublic?.schemaVersion ===
    'lzy-social-career-public-v1'
  ) {
    return clone(state.economy.socialCareerPublic);
  }
  return null;
}

function createNpcInvestors(securities) {
  return Object.fromEntries(
    NPC_INVESTOR_TEMPLATES.map((template) => [
      template.id,
      {
        id: template.id,
        name: template.name,
        strategy: template.strategy,
        cash: template.cash,
        holdings: Object.fromEntries(
          Object.keys(securities).map((symbol) => [
            symbol,
            investorTemplateHolding(
              template,
              securities[symbol],
            ),
          ]),
        ),
        tradingEnabled: template.tradingEnabled !== false,
        holderKind: template.holderKind ?? 'active_investor',
        memory: {
          lastTradeTick: null,
          visibleImpact: 0,
        },
      },
    ]),
  );
}

function investorTemplateHolding(template, security) {
  if (template.strategicIssuerId === security.issuerId) {
    return security.outstandingUnits - security.floatUnits;
  }
  if (Number.isSafeInteger(template.floatHoldingBps)) {
    return Math.floor(
      security.floatUnits *
        template.floatHoldingBps /
        BPS_SCALE,
    );
  }
  return 0;
}

function createFinancialState(template) {
  const baseline = template.financialBaseline;
  const bucketCount = 24;
  const bucketDays = 10;
  const reportingBuckets = Array.from(
    { length: bucketCount },
    () => ({
      revenue: money(baseline.trailingRevenue / bucketCount),
      netIncome: money(baseline.trailingNetIncome / bucketCount),
      freeCashFlow: money(
        baseline.trailingFreeCashFlow / bucketCount,
      ),
    }),
  );
  for (const field of [
    'revenue',
    'netIncome',
    'freeCashFlow',
  ]) {
    const baselineField =
      field === 'revenue'
        ? baseline.trailingRevenue
        : field === 'netIncome'
          ? baseline.trailingNetIncome
          : baseline.trailingFreeCashFlow;
    const priorTotal = reportingBuckets
      .slice(0, -1)
      .reduce((sum, bucket) => sum + bucket[field], 0);
    reportingBuckets.at(-1)[field] = money(
      baselineField - priorTotal,
    );
  }
  return {
    accountingStandard: 'lzy-synthetic-accrual-v1',
    annualTradingDays: bucketCount * bucketDays,
    bucketDays,
    reportingBuckets,
    currentBucketIndex: null,
    trailingRevenue: baseline.trailingRevenue,
    trailingNetIncome: baseline.trailingNetIncome,
    trailingFreeCashFlow: baseline.trailingFreeCashFlow,
    priorTrailingRevenue: money(baseline.trailingRevenue * 0.95),
    priorTrailingNetIncome: money(
      baseline.trailingNetIncome * 0.9,
    ),
    lastRevenue: 0,
    lastNetIncome: 0,
    lastFreeCashFlow: 0,
    distributions: 0,
    buybackUnits: 0,
    issuedUnits: 0,
    operatingExpenseRatio: baseline.operatingExpenseRatio,
    maintenanceCapexRatio: baseline.maintenanceCapexRatio,
    annualInterestRateBps: baseline.annualInterestRateBps,
    economicUnitScale: Number(
      (
        baseline.trailingRevenue /
        Math.max(
          1,
          template.baseDemand *
            template.productPrice *
            bucketCount *
            bucketDays,
        )
      ).toFixed(8),
    ),
    valuationPolicy: clone(baseline.valuationPolicy),
  };
}

function authoritativeCents(
  value,
  legacyMoney,
  fallbackValue,
  label,
) {
  if (Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (Number.isFinite(legacyMoney) && legacyMoney >= 0) {
    return moneyToCents(legacyMoney, label);
  }
  if (
    Number.isSafeInteger(fallbackValue) &&
    fallbackValue >= 0
  ) {
    return fallbackValue;
  }
  throw new Error(`Missing authoritative ${label}.`);
}

function normalizeFinancialInstitutionState(
  model,
  source,
  fallback,
) {
  const current = source && typeof source === 'object'
    ? clone(source)
    : {};
  const baseline = fallback && typeof fallback === 'object'
    ? fallback
    : {};
  if (model === 'commercial_bank') {
    const loansCents = authoritativeCents(
      current.loansCents,
      current.loans,
      baseline.loansCents,
      'bank loans',
    );
    const depositsCents = authoritativeCents(
      current.depositsCents,
      current.deposits,
      baseline.depositsCents,
      'bank deposits',
    );
    const securitiesAssetsCents =
      authoritativeCents(
        current.securitiesAssetsCents,
        current.securitiesAssets,
        baseline.securitiesAssetsCents,
        'bank securities assets',
      );
    return {
      ...current,
      loansCents,
      depositsCents,
      securitiesAssetsCents,
      loans: centsToMoney(loansCents, 'bank loans'),
      deposits: centsToMoney(
        depositsCents,
        'bank deposits',
      ),
      securitiesAssets: centsToMoney(
        securitiesAssetsCents,
        'bank securities assets',
      ),
      loanYieldBps:
        current.loanYieldBps ??
        baseline.loanYieldBps,
      depositCostBps:
        current.depositCostBps ??
        baseline.depositCostBps,
      netInterestMarginBps:
        current.netInterestMarginBps ??
        baseline.netInterestMarginBps,
      nonPerformingLoanBps:
        current.nonPerformingLoanBps ??
        baseline.nonPerformingLoanBps,
      creditCostBps:
        current.creditCostBps ??
        baseline.creditCostBps,
      capitalAdequacyBps:
        current.capitalAdequacyBps ??
        baseline.capitalAdequacyBps,
      liquidityCoverageBps:
        current.liquidityCoverageBps ??
        baseline.liquidityCoverageBps,
      lastLoanInterestIncomeCents:
        current.lastLoanInterestIncomeCents ?? 0,
      lastDepositInterestExpenseCents:
        current.lastDepositInterestExpenseCents ?? 0,
      lastSecuritiesIncomeCents:
        current.lastSecuritiesIncomeCents ?? 0,
      lastFeeIncomeCents:
        current.lastFeeIncomeCents ?? 0,
      lastCreditLossCents:
        current.lastCreditLossCents ?? 0,
      lastOperatingExpenseCents:
        current.lastOperatingExpenseCents ?? 0,
      lastNetIncomeCents:
        current.lastNetIncomeCents ?? 0,
    };
  }
  if (model === 'insurance_group') {
    const writtenPremiumCents =
      authoritativeCents(
        current.writtenPremiumCents,
        current.premiumIncome,
        baseline.writtenPremiumCents,
        'written premium',
      );
    const earnedPremiumCents =
      authoritativeCents(
        current.earnedPremiumCents,
        current.earnedPremium,
        baseline.earnedPremiumCents,
        'earned premium',
      );
    const claimsCents = authoritativeCents(
      current.claimsCents,
      current.claims,
      baseline.claimsCents,
      'insurance claims',
    );
    const expenseCents = authoritativeCents(
      current.expenseCents,
      current.expense,
      baseline.expenseCents,
      'insurance expense',
    );
    const insuranceReserveCents =
      authoritativeCents(
        current.insuranceReserveCents,
        current.insuranceReserves,
        baseline.insuranceReserveCents,
        'insurance reserve',
      );
    const investedAssetsCents =
      authoritativeCents(
        current.investedAssetsCents,
        current.investedAssets,
        baseline.investedAssetsCents,
        'insurance invested assets',
      );
    const investmentReturnCents =
      authoritativeCents(
        current.investmentReturnCents,
        current.investmentReturn,
        baseline.investmentReturnCents,
        'insurance investment return',
      );
    return {
      ...current,
      writtenPremiumCents,
      earnedPremiumCents,
      claimsCents,
      expenseCents,
      insuranceReserveCents,
      investedAssetsCents,
      investmentReturnCents,
      premiumIncome: centsToMoney(
        writtenPremiumCents,
        'written premium',
      ),
      earnedPremium: centsToMoney(
        earnedPremiumCents,
        'earned premium',
      ),
      claims: centsToMoney(
        claimsCents,
        'insurance claims',
      ),
      expense: centsToMoney(
        expenseCents,
        'insurance expense',
      ),
      insuranceReserves: centsToMoney(
        insuranceReserveCents,
        'insurance reserve',
      ),
      investedAssets: centsToMoney(
        investedAssetsCents,
        'insurance invested assets',
      ),
      investmentReturn: centsToMoney(
        investmentReturnCents,
        'insurance investment return',
      ),
      claimsRatioBps:
        current.claimsRatioBps ??
        baseline.claimsRatioBps,
      investmentYieldBps:
        current.investmentYieldBps ??
        baseline.investmentYieldBps,
      solvencyRatioBps:
        current.solvencyRatioBps ??
        baseline.solvencyRatioBps,
      durationGapBps:
        current.durationGapBps ??
        baseline.durationGapBps,
      lastWrittenPremiumCents:
        current.lastWrittenPremiumCents ?? 0,
      lastEarnedPremiumCents:
        current.lastEarnedPremiumCents ?? 0,
      lastClaimsCents:
        current.lastClaimsCents ?? 0,
      lastReserveChangeCents:
        current.lastReserveChangeCents ?? 0,
      lastInvestmentReturnCents:
        current.lastInvestmentReturnCents ?? 0,
      lastExpenseCents:
        current.lastExpenseCents ?? 0,
      lastNetIncomeCents:
        current.lastNetIncomeCents ?? 0,
    };
  }
  return current;
}

function reconcileFinancialInstitutionBalanceSheet(
  company,
) {
  const institution = company.financialInstitution;
  const model = company.operations?.model ??
    company.businessModel?.kind;
  const equityCents = moneyToCents(
    company.equity,
    `${company.id} equity`,
  );
  const cashCents = moneyToCents(
    company.cash,
    `${company.id} cash`,
  );
  const debtCents = moneyToCents(
    company.debt,
    `${company.id} debt`,
  );
  const primaryAssetCents =
    model === 'commercial_bank'
      ? institution.loansCents +
        institution.securitiesAssetsCents
      : institution.investedAssetsCents;
  const primaryLiabilityCents =
    model === 'commercial_bank'
      ? institution.depositsCents
      : institution.insuranceReserveCents;
  const otherAssetsCents = Math.max(
    0,
    equityCents +
      primaryLiabilityCents +
      debtCents -
      cashCents -
      primaryAssetCents,
  );
  if (!Number.isSafeInteger(otherAssetsCents)) {
    throw new Error(
      `Unsafe financial-institution balance sheet: ${company.id}`,
    );
  }
  institution.otherAssetsCents = otherAssetsCents;
  institution.otherAssets = centsToMoney(
    otherAssetsCents,
    `${company.id} other assets`,
  );
}

function validFinancialInstitutionState(company) {
  const institution = company.financialInstitution;
  const model = company.operations?.model;
  if (
    !institution ||
    typeof institution !== 'object' ||
    company.inventory !== null ||
    company.capacity !== null ||
    company.operations.plannedProduction !== null ||
    company.operations.lastProduced !== null ||
    company.operations.lastSold !== null
  ) {
    return false;
  }
  const bankFields = [
    'loansCents',
    'depositsCents',
    'securitiesAssetsCents',
    'loanYieldBps',
    'depositCostBps',
    'netInterestMarginBps',
    'nonPerformingLoanBps',
    'creditCostBps',
    'capitalAdequacyBps',
    'liquidityCoverageBps',
    'otherAssetsCents',
  ];
  const insuranceFields = [
    'writtenPremiumCents',
    'earnedPremiumCents',
    'claimsCents',
    'expenseCents',
    'insuranceReserveCents',
    'investedAssetsCents',
    'investmentReturnCents',
    'solvencyRatioBps',
    'durationGapBps',
    'otherAssetsCents',
  ];
  const fields =
    model === 'commercial_bank'
      ? bankFields
      : model === 'insurance_group'
        ? insuranceFields
        : null;
  if (
    !fields ||
    fields.some(
      (field) =>
        !Number.isSafeInteger(institution[field]),
    )
  ) {
    return false;
  }
  if (
    fields
      .filter((field) => field !== 'durationGapBps')
      .some((field) => institution[field] < 0)
  ) {
    return false;
  }
  if (model === 'commercial_bank') {
    return (
      institution.loanYieldBps >
        institution.depositCostBps &&
      institution.loans ===
        centsToMoney(institution.loansCents) &&
      institution.deposits ===
        centsToMoney(institution.depositsCents) &&
      institution.securitiesAssets ===
        centsToMoney(
          institution.securitiesAssetsCents,
        ) &&
      institution.otherAssets ===
        centsToMoney(institution.otherAssetsCents)
    );
  }
  return (
    institution.premiumIncome ===
      centsToMoney(
        institution.writtenPremiumCents,
      ) &&
    institution.earnedPremium ===
      centsToMoney(
        institution.earnedPremiumCents,
      ) &&
    institution.claims ===
      centsToMoney(institution.claimsCents) &&
    institution.expense ===
      centsToMoney(institution.expenseCents) &&
    institution.insuranceReserves ===
      centsToMoney(
        institution.insuranceReserveCents,
      ) &&
    institution.investedAssets ===
      centsToMoney(
        institution.investedAssetsCents,
      ) &&
    institution.investmentReturn ===
      centsToMoney(
        institution.investmentReturnCents,
      ) &&
    institution.otherAssets ===
      centsToMoney(institution.otherAssetsCents)
  );
}

function createFinancialInstitutionCompany(template, index, financials) {
  const model = template.businessModel.kind;
  const institution =
    normalizeFinancialInstitutionState(
      model,
      template.financialInstitution,
      template.financialInstitution,
    );
  institution.otherAssetsCents = 0;
  institution.otherAssets = 0;
  institution.lastNetInterestIncome = 0;
  institution.lastCreditLoss = 0;
  institution.lastPremiumEarned = 0;
  institution.lastClaims = 0;
  institution.lastInvestmentIncome = 0;
  const debtCeiling = money(
    template.debt +
      Math.max(
        template.cash * 0.25,
        template.financialBaseline.trailingRevenue * 0.04,
      ),
  );
  const company = {
    id: template.id,
    symbol: template.symbol,
    name: template.name,
    shortName: template.shortName,
    role: template.role,
    description: template.description,
    industry: template.industry,
    lifecycle: template.lifecycle,
    sector: template.sector,
    size: template.size,
    balanceSheetModel: template.balanceSheetModel,
    businessModel: clone(template.businessModel),
    informationTransparencyBps:
      template.informationTransparencyBps,
    management: clone(template.management),
    macroExposures: clone(template.macroExposures),
    supplierCompanyIds: clone(template.supplierCompanyIds),
    customerCompanyIds: clone(template.customerCompanyIds),
    financialCounterpartyCompanyIds:
      clone(template.financialCounterpartyCompanyIds),
    investmentExposureCompanyIds:
      clone(template.investmentExposureCompanyIds),
    cash: template.cash,
    debt: template.debt,
    inventory: null,
    inventoryBookValue: 0,
    capacity: null,
    initialPropertyPlantEquipment: 0,
    propertyPlantEquipment: 0,
    receivables: 0,
    payables: 0,
    equity: template.targetBookEquity,
    financialInstitution: institution,
    funding: {
      debtCeiling,
      unpaidObligations: 0,
      consecutiveMissedPayments: 0,
      defaultStatus: 'current',
      lastBorrowed: 0,
      lastUnpaid: 0,
    },
    operations: {
      model,
      initialUnitCost: null,
      initialProductPrice: null,
      initialBaseDemand: null,
      initialCapacity: null,
      unitCost: null,
      productPrice: null,
      baseDemand: null,
      productivity: 1,
      technology: 1,
      marketShare: Number((0.31 + index * 0.025).toFixed(6)),
      pricingPower: 0,
      reinvestmentRate: 0,
      capacityPipeline: 0,
      capacityCapexPerUnit: 0,
      requestedExpansionUnits: 0,
      cumulativeExpansionCapex: 0,
      lastExpansionCapex: 0,
      structuralExpectedGrowthBps: 180,
      cumulativeReinvestment: 0,
      plannedProduction: null,
      reservedCash: 0,
      lastProduced: null,
      lastSold: null,
      lastProfit: 0,
      utilization: null,
    },
    governance: {
      managementConfidence:
        template.management.confidenceBps / BPS_SCALE,
      disclosureQuality:
        template.informationTransparencyBps / BPS_SCALE,
    },
    initialValuationPolicy: clone(financials.valuationPolicy),
    publishedFinancialSnapshot: null,
    financials,
  };
  reconcileFinancialInstitutionBalanceSheet(company);
  return company;
}

function createCompany(template, index) {
  const financials = createFinancialState(template);
  if (
    template.businessModel.kind === 'commercial_bank' ||
    template.businessModel.kind === 'insurance_group'
  ) {
    return createFinancialInstitutionCompany(
      template,
      index,
      financials,
    );
  }
  const receivables = Math.round(template.cash * 0.08);
  const payables = Math.round(template.cash * 0.05);
  const inventoryBookValue = money(
    template.inventory *
      template.unitCost *
      financials.economicUnitScale,
  );
  const equityBeforeProperty =
    template.cash +
    inventoryBookValue +
    receivables -
    payables -
    template.debt;
  const propertyPlantEquipment = money(
    Math.max(
      0,
      template.targetBookEquity - equityBeforeProperty,
    ),
  );
  const capacityCapexPerUnit = money(
    template.financialBaseline.trailingRevenue /
      Math.max(1, template.capacity) *
      0.35,
  );
  const debtCeiling = money(
    template.debt +
      Math.max(
        template.cash * 0.5,
        template.financialBaseline.trailingRevenue * 0.08,
      ),
  );
  return {
    id: template.id,
    symbol: template.symbol,
    name: template.name,
    shortName: template.shortName,
    role: template.role,
    description: template.description,
    industry: template.industry,
    lifecycle: template.lifecycle,
    sector: template.sector,
    size: template.size,
    balanceSheetModel: template.balanceSheetModel,
    businessModel: clone(template.businessModel),
    financialInstitution: template.financialInstitution
      ? clone(template.financialInstitution)
      : null,
    informationTransparencyBps:
      template.informationTransparencyBps,
    management: clone(template.management),
    macroExposures: clone(template.macroExposures),
    supplierCompanyIds: clone(template.supplierCompanyIds),
    customerCompanyIds: clone(template.customerCompanyIds),
    financialCounterpartyCompanyIds:
      clone(template.financialCounterpartyCompanyIds),
    investmentExposureCompanyIds:
      clone(template.investmentExposureCompanyIds),
    cash: template.cash,
    debt: template.debt,
    inventory: template.inventory,
    inventoryBookValue,
    capacity: template.capacity,
    initialPropertyPlantEquipment: propertyPlantEquipment,
    propertyPlantEquipment,
    receivables,
    payables,
    equity: money(
      template.cash +
        inventoryBookValue +
        receivables -
        payables -
        template.debt +
        propertyPlantEquipment,
    ),
    funding: {
      debtCeiling,
      unpaidObligations: 0,
      consecutiveMissedPayments: 0,
      defaultStatus: 'current',
      lastBorrowed: 0,
      lastUnpaid: 0,
    },
    operations: {
      model: template.businessModel.kind,
      initialUnitCost: template.unitCost,
      initialProductPrice: template.productPrice,
      initialBaseDemand: template.baseDemand,
      initialCapacity: template.capacity,
      unitCost: template.unitCost,
      productPrice: template.productPrice,
      baseDemand: template.baseDemand,
      productivity: 1,
      technology: 1,
      marketShare: Number((0.31 + index * 0.025).toFixed(6)),
      pricingPower: Number((0.02 + index * 0.006).toFixed(6)),
      reinvestmentRate: Number((0.09 + index * 0.012).toFixed(6)),
      capacityPipeline: 0,
      capacityCapexPerUnit,
      requestedExpansionUnits: 0,
      cumulativeExpansionCapex: 0,
      lastExpansionCapex: 0,
      structuralExpectedGrowthBps: 320 + index * 90,
      cumulativeReinvestment: 0,
      plannedProduction: Math.round(template.capacity * 0.6),
      reservedCash: 0,
      lastProduced: 0,
      lastSold: 0,
      lastProfit: 0,
      utilization: 0.6,
    },
    governance: {
      managementConfidence:
        template.management.confidenceBps /
        BPS_SCALE,
      disclosureQuality:
        template.informationTransparencyBps / BPS_SCALE,
    },
    initialValuationPolicy: clone(financials.valuationPolicy),
    publishedFinancialSnapshot: null,
    financials,
  };
}

function createDerivativeCommodityBalances() {
  return Object.fromEntries(
    Object.entries(
      DERIVATIVE_COMMODITY_TEMPLATES,
    ).map(([underlyingId, template]) => [
      underlyingId,
      {
        underlyingId,
        openingSpotTicks: template.openingSpotTicks,
        spotTicks: template.openingSpotTicks,
        productionIndex: 1,
        consumptionIndex: 1,
        inventoryIndex: 1,
        seasonality: 0,
        eventRisk: 0,
        carryBps: 0,
        lastUpdatedTick: 0,
        authority: 'world_synthetic_commodity_balance',
      },
    ]),
  );
}

function ensureDerivativeCommodityBalances(economy) {
  economy.commodityBalances ??=
    createDerivativeCommodityBalances();
  for (const [
    underlyingId,
    template,
  ] of Object.entries(DERIVATIVE_COMMODITY_TEMPLATES)) {
    economy.commodityBalances[underlyingId] ??= {
      ...createDerivativeCommodityBalances()[
        underlyingId
      ],
      openingSpotTicks: template.openingSpotTicks,
      spotTicks: template.openingSpotTicks,
    };
  }
  return economy.commodityBalances;
}

function createEconomyState() {
  return {
    currency: 'LZY-CNY',
    cashPool: 80_000_000_000,
    householdDemandIndex: 1,
    industrialCycle: 0,
    developmentIndex: 1,
    technologyFrontier: 1,
    potentialDemandIndex: 1,
    priceLevel: 1,
    riskFreeRateBps: 280,
    creditSpreadBps: 260,
    structuralGrowthBps: 360,
    regime: 'balanced_expansion',
    commodityBalances:
      createDerivativeCommodityBalances(),
  };
}

function createPublishedFinancialValue(
  company,
  security,
  economy,
) {
  return {
    accountingStandard: company.financials.accountingStandard,
    businessModel: clone(company.businessModel),
    balanceSheetModel: company.balanceSheetModel,
    financialInstitution: company.financialInstitution
      ? clone(company.financialInstitution)
      : null,
    trailingRevenue: company.financials.trailingRevenue,
    trailingNetIncome: company.financials.trailingNetIncome,
    trailingFreeCashFlow:
      company.financials.trailingFreeCashFlow,
    priorTrailingRevenue:
      company.financials.priorTrailingRevenue,
    priorTrailingNetIncome:
      company.financials.priorTrailingNetIncome,
    bookEquity: company.equity,
    cash: company.cash,
    debt: company.debt,
    netDebt: Math.max(0, money(company.debt - company.cash)),
    receivables: company.receivables,
    payables: company.payables,
    inventoryBookValue: company.inventoryBookValue,
    propertyPlantEquipment: company.propertyPlantEquipment,
    sharesOutstanding: security.outstandingUnits,
    floatShares: security.floatUnits,
    distributions: company.financials.distributions,
    buybackUnits: company.financials.buybackUnits,
    issuedUnits: company.financials.issuedUnits,
    capacity: company.capacity,
    expansionCapex: company.operations.lastExpansionCapex,
    cumulativeExpansionCapex:
      company.operations.cumulativeExpansionCapex,
    debtCeiling: company.funding.debtCeiling,
    unpaidObligations: company.funding.unpaidObligations,
    defaultStatus: company.funding.defaultStatus,
    productivity: company.operations.productivity,
    technology: company.operations.technology,
    marketShare: company.operations.marketShare,
    expectedGrowthBps:
      company.operations.structuralExpectedGrowthBps,
    developmentIndex: economy.developmentIndex,
    potentialDemandIndex: economy.potentialDemandIndex,
    priceLevel: economy.priceLevel,
    riskFreeRateBps: economy.riskFreeRateBps,
    creditSpreadBps: economy.creditSpreadBps,
    disclosureQualityBps: Math.round(
      clamp(company.governance.disclosureQuality, 0, 1) *
        BPS_SCALE,
    ),
    valuationPolicy: clone(company.initialValuationPolicy),
  };
}

function makeOrderBook(openingPrice, offset) {
  const asks = [
    { price: price(openingPrice * 1.002), quantity: 6 + offset },
    { price: price(openingPrice * 1.008), quantity: 10 + offset * 2 },
    { price: price(openingPrice * 1.018), quantity: 17 + offset * 3 },
    { price: price(openingPrice * 1.035), quantity: 30 + offset * 4 },
  ];
  const bids = [
    { price: price(openingPrice * 0.998), quantity: 7 + offset },
    { price: price(openingPrice * 0.991), quantity: 12 + offset * 2 },
    { price: price(openingPrice * 0.981), quantity: 20 + offset * 3 },
    { price: price(openingPrice * 0.964), quantity: 32 + offset * 4 },
  ];
  return { asks, bids, lastUpdatedTick: 0 };
}

function deriveVolatilityProfile(template) {
  const financialInstitution =
    template.businessModel?.kind === 'commercial_bank' ||
    template.businessModel?.kind === 'insurance_group';
  const early =
    template.lifecycle.includes('早期') ||
    template.lifecycle.includes('研发');
  const distressed =
    template.lifecycle.includes('困境') ||
    template.financialBaseline.trailingNetIncome < 0;
  const mega = template.size === 'mega';
  const ordinaryBps = financialInstitution
    ? 55
    : mega
      ? 75
      : early || distressed
        ? 210
        : template.size === 'small'
          ? 170
          : 115;
  return {
    calibration: 'synthetic_cross_section_v1',
    calmBps: Math.max(24, Math.round(ordinaryBps * 0.55)),
    ordinaryBps,
    eventBps: Math.round(ordinaryBps * (early || distressed ? 2.35 : 1.85)),
    stressBps: Math.min(
      template.dailyLimitBps,
      Math.round(ordinaryBps * (financialInstitution ? 3.2 : 4.1)),
    ),
    beliefDispersionBps: Math.round(
      ordinaryBps *
        (10_000 - template.informationTransparencyBps) /
        5_000 +
        ordinaryBps * 0.45,
    ),
    stabilizerBps: financialInstitution || mega ? 7_600 : 4_800,
    mechanismDrivers: [
      template.lifecycle,
      template.size,
      template.balanceSheetModel,
      template.informationQuality,
      ...template.macroExposure,
    ],
  };
}

function deriveDepthProfile(template, liquidityProfile) {
  const stable =
    template.size === 'mega' ||
    template.businessModel?.kind === 'commercial_bank' ||
    template.businessModel?.kind === 'insurance_group';
  return {
    baseDepthUnits: liquidityProfile.makerInventoryCapacityUnits,
    calmMultiplierBps: stable ? 12_000 : 11_000,
    ordinaryMultiplierBps: 10_000,
    eventMultiplierBps: stable ? 8_200 : 6_600,
    stressMultiplierBps: stable ? 6_800 : 4_200,
    replenishment: 'finite_inventory_incremental',
  };
}

function deriveCatalystProfile(template) {
  const opacityBps = 10_000 - template.informationTransparencyBps;
  const early =
    template.lifecycle.includes('早期') ||
    template.lifecycle.includes('研发') ||
    template.lifecycle.includes('困境');
  return {
    sensitivityBps: Math.round(
      4_000 + opacityBps * 0.45 + (early ? 1_800 : 0),
    ),
    eventThresholdBps: early ? 55 : 90,
    stressThresholdBps: early ? 170 : 240,
    sources: ['company_facts', 'macro_facts', 'belief_dispersion'],
  };
}

function createListedSecurity(template) {
  const liquidityProfile = clone(
    LISTING_LIQUIDITY_PROFILES[template.symbol],
  );
  const advUnits = Math.max(
    1,
    Math.floor(
      template.sharesOutstanding *
        template.floatRatioBps /
        BPS_SCALE *
        liquidityProfile.expectedDailyTurnoverBps /
        BPS_SCALE,
    ),
  );
  return {
    symbol: template.symbol,
    issuerId: template.id,
    name: template.name,
    board: template.board,
    dailyLimitBps: template.dailyLimitBps,
    previousCloseTicks: Math.round(
      template.openingPrice * 100,
    ),
    outstandingUnits: template.sharesOutstanding,
    floatUnits: Math.floor(
      template.sharesOutstanding *
        template.floatRatioBps /
        BPS_SCALE,
    ),
    industry: template.industry,
    sector: template.sector,
    lifecycle: template.lifecycle,
    size: template.size,
    balanceSheetModel: template.balanceSheetModel,
    informationQuality: template.informationQuality,
    macroExposure: clone(template.macroExposure),
    businessModel: clone(template.businessModel),
    priceLimitBps: template.dailyLimitBps,
    floatShares: Math.floor(
      template.sharesOutstanding *
        template.floatRatioBps /
        BPS_SCALE,
    ),
    advUnits,
    liquidityProfile,
    depthProfile: deriveDepthProfile(template, liquidityProfile),
    volatilityProfile: deriveVolatilityProfile(template),
    catalystProfile: deriveCatalystProfile(template),
    lastPrice: template.openingPrice,
    referenceValue: template.openingPrice,
    derivativeBasketOpeningPriceTicks: Math.round(
      template.openingPrice * 100,
    ),
    priceHistory: [
      { tick: 0, price: template.openingPrice },
    ],
  };
}

function genesisJournal(state, totalCash) {
  return {
    id: nextId(state, 'journal'),
    tick: 0,
    eventId: 'event_genesis',
    type: 'genesis_opening',
    description: '创世开账：所有现金存量进入同一清算边界。',
    postings: [
      {
        account: 'world.opening_assets',
        debit: totalCash,
        credit: 0,
      },
      {
        account: 'world.opening_equity',
        debit: 0,
        credit: totalCash,
      },
    ],
    securityTransfers: [],
  };
}

function createGenesisClues() {
  return [
    {
      id: 'clue_supplier_log',
      companyId: 'company_river_equipment',
      title: '供应商交付记录提前',
      summary: '两家材料供应商的交付日比上周期提前，但尚不清楚是否来自抢跑备货。',
      source: '供应链抽样记录',
      sourceType: 'operational_sample',
      quality: 'medium',
      publishedTick: 0,
      status: 'unverified',
      verificationCost: 2,
      truthState: 'supported',
      factId: 'fact_genesis_inventory',
      missing: '终端回款尚未出现',
    },
    {
      id: 'clue_channel_rumor',
      companyId: 'company_horizon_systems',
      title: '渠道传言：园区订单翻倍',
      summary: '匿名渠道声称岚序将拿到大额项目，无法确认口径和交付期限。',
      source: '匿名行业群转述',
      sourceType: 'rumor',
      quality: 'low',
      publishedTick: 0,
      status: 'unverified',
      verificationCost: 1,
      truthState: 'refuted',
      factId: 'fact_genesis_demand',
      missing: '没有合同与付款节点',
    },
    {
      id: 'clue_receivables_note',
      companyId: 'company_aurora_materials',
      title: '应收账款增速快于收入',
      summary: '公开经营简报显示应收上升，可能是扩张，也可能是回款压力。',
      source: '企业经营简报',
      sourceType: 'company_disclosure',
      quality: 'high',
      publishedTick: 0,
      status: 'verified',
      verificationCost: 0,
      verdict: 'supported',
      truthState: 'supported',
      factId: 'fact_genesis_receivables',
      missing: '客户集中度未披露',
    },
  ];
}

function addEvent(state, event) {
  const completed = {
    id: nextId(state, 'event'),
    tick: state.world.tick,
    effectiveAt: state.world.tick,
    actorId: event.actorId ?? 'world_system',
    authority: event.authority ?? 'rule_engine',
    affectedEntities: event.affectedEntities ?? [],
    preconditions: event.preconditions ?? [],
    ruleVersion: RULE_VERSION,
    seedRef: `${state.world.seed}:${state.world.rngState}`,
    parentIds: event.parentIds ?? [],
    ledgerEntryIds: event.ledgerEntryIds ?? [],
    visibility: event.visibility ?? 'public',
    status: 'settled',
    correctionRef: null,
    ...event,
  };
  const suppliedFactIds = [
    ...(Array.isArray(completed.factIds)
      ? completed.factIds
      : []),
    completed.factId,
  ].filter(
    (factId, index, values) =>
      typeof factId === 'string' &&
      factId.length > 0 &&
      values.indexOf(factId) === index,
  );
  if (
    completed.worldlineEligible !== false &&
    suppliedFactIds.length === 0
  ) {
    // A settled event is itself immutable outcome evidence. Keep that compact
    // evidence attached to the event instead of manufacturing a second public
    // fact, which would change epistemic projections and grow the hot fact
    // history for every market or social settlement.
    completed.factIds = [`settled:${completed.id}`];
  } else {
    completed.factIds = suppliedFactIds;
  }
  state.eventLog.push(completed);
  state.worldline ??= createWorldlineState({
    worldId: state.world.id,
    worldSeed: state.world.seed,
  });
  state.worldline = advanceWorldlineState(
    state.worldline,
    completed,
    { mutate: true },
  );
  return completed;
}

function addFact(state, fact) {
  const completed = {
    id: nextId(state, 'fact'),
    tick: state.world.tick,
    authority: 'world_fact',
    confidence: 1,
    visibility: 'public',
    ...fact,
  };
  state.facts.push(completed);
  return completed;
}

function addMemory(state, fact, memory = {}) {
  const completed = {
    id: nextId(state, 'memory'),
    factId: fact.id,
    ownerId: memory.ownerId ?? 'public_market',
    content: memory.content ?? fact.summary,
    salience: memory.salience ?? 0.5,
    accuracyState: memory.accuracyState ?? 'anchored',
    createdTick: state.world.tick,
    lastRecalledTick: state.world.tick,
    decay: memory.decay ?? 0.015,
    visibility: memory.visibility ?? 'public',
  };
  state.memories.push(completed);
  return completed;
}

function addJournal(state, journal) {
  const completed = {
    id: nextId(state, 'journal'),
    tick: state.world.tick,
    eventId: journal.eventId ?? null,
    type: journal.type,
    description: journal.description,
    postings: journal.postings,
    securityTransfers: journal.securityTransfers ?? [],
  };
  if (Number.isFinite(journal.amount)) {
    completed.amount = money(journal.amount);
  }
  if (Array.isArray(journal.assetInstanceIds)) {
    completed.assetInstanceIds = [
      ...new Set(journal.assetInstanceIds.map(String)),
    ];
  }
  if (Number.isFinite(journal.carryingValue)) {
    completed.carryingValue = money(
      journal.carryingValue,
    );
  }
  if (Number.isFinite(journal.realizedGainLoss)) {
    completed.realizedGainLoss = money(
      journal.realizedGainLoss,
    );
  }
  state.ledger.push(completed);
  return completed;
}

function initializeHoldings(state, equityBudget) {
  const holdings = {};
  const establishedSymbols = new Set(
    COMPANY_TEMPLATES.slice(0, 8).map(
      (template) => template.symbol,
    ),
  );
  const establishedBudget =
    COMPANY_TEMPLATES.length > establishedSymbols.size
      ? equityBudget * 0.9
      : equityBudget;
  const expansionBudget =
    equityBudget - establishedBudget;
  for (const template of COMPANY_TEMPLATES) {
    const symbolBudget = establishedSymbols.has(template.symbol)
      ? establishedBudget / establishedSymbols.size
      : expansionBudget /
        Math.max(
          1,
          COMPANY_TEMPLATES.length - establishedSymbols.size,
        );
    const units = Math.floor(
      symbolBudget / template.openingPrice,
    );
    holdings[template.symbol] = units;
    state.market.maker.holdings[template.symbol] -= units;
  }
  return holdings;
}

function synchronizeWorldValuations(state) {
  const snapshot = createValuationSnapshot(state);
  for (const [symbol, valuation] of Object.entries(snapshot.symbols)) {
    const security = state.market.securities[symbol];
    security.valuation = valuation;
    security.referenceValue = price(valuation.midpointTicks / 100);
  }
  state.market.valuation = {
    ruleVersion: snapshot.ruleVersion,
    asOfTick: snapshot.asOfTick,
  };
  return snapshot;
}

function corporateActionScaledUnits(
  quantity,
  splitNumerator,
  splitDenominator,
) {
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 0
  ) {
    return null;
  }
  const numerator =
    BigInt(quantity) *
    BigInt(splitNumerator);
  const denominator =
    BigInt(splitDenominator);
  if (numerator % denominator !== 0n) {
    return null;
  }
  const adjusted = numerator / denominator;
  if (
    adjusted >
    BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return null;
  }
  return Number(adjusted);
}

function corporateActionAdjustedPriceTicks(
  priceTicks,
  splitNumerator,
  splitDenominator,
) {
  if (
    !Number.isFinite(priceTicks) ||
    priceTicks <= 0
  ) {
    return null;
  }
  return Math.max(
    1,
    Math.round(
      priceTicks *
        splitDenominator /
        splitNumerator,
    ),
  );
}

/**
 * Applies a zero-cash integer stock split to the complete world authority.
 * Custody, issuance, derivative lending references and the public financial
 * denominator move in one cloned transaction; genesis issuance stays fixed.
 */
export function applyCanonicalSecurityCorporateAction(
  state,
  action = {},
) {
  const reject = (reason) => ({
    state,
    receipt: {
      type: 'security_corporate_action',
      status: 'rejected',
      reason,
      actionId: action.actionId ?? null,
      securityId: action.securityId ?? null,
    },
  });
  if (!state?.world || !state?.market) {
    return reject('INVALID_WORLD_AUTHORITY');
  }
  if (
    typeof action.actionId !== 'string' ||
    action.actionId.length === 0
  ) {
    return reject('INVALID_CORPORATE_ACTION_ID');
  }
  if (
    typeof action.securityId !== 'string' ||
    !state.market.securities?.[
      action.securityId
    ]
  ) {
    return reject('UNKNOWN_CORPORATE_ACTION_SECURITY');
  }
  if (
    !Number.isSafeInteger(
      action.splitNumerator,
    ) ||
    action.splitNumerator <= 0 ||
    !Number.isSafeInteger(
      action.splitDenominator,
    ) ||
    action.splitDenominator <= 0
  ) {
    return reject('INVALID_CORPORATE_ACTION_RATIO');
  }
  if (
    action.cashDividendCentsPerShare !== 0
  ) {
    return reject(
      'CASH_DIVIDEND_AUTHORITY_NOT_IMPLEMENTED',
    );
  }
  const next = clone(state);
  migrateSecurityIssuanceAccounting(next);
  const issuanceDuplicate =
    next.accounting.securityIssuanceLedger.some(
      (entry) =>
        entry.actionId === action.actionId,
    );
  const derivativeDuplicate = Boolean(
    next.derivatives?.clearing
      ?.appliedSecurityCorporateActions?.[
        action.actionId
      ],
  );
  if (issuanceDuplicate && derivativeDuplicate) {
    return reject(
      'CORPORATE_ACTION_ALREADY_APPLIED',
    );
  }
  if (
    issuanceDuplicate !== derivativeDuplicate
  ) {
    return reject(
      'CORPORATE_ACTION_AUTHORITY_MISMATCH',
    );
  }

  const symbol = action.securityId;
  const security =
    next.market.securities[symbol];
  const currentUnits =
    next.accounting.currentSecurityUnits[
      symbol
    ];
  const holders = [
    next.player,
    next.market.maker,
    ...Object.values(
      next.entities?.investors ?? {},
    ),
  ];
  const holderAdjustments = holders.map(
    (holder) => {
      const before =
        holder.holdings?.[symbol];
      return {
        holder,
        before,
        after: corporateActionScaledUnits(
          before,
          action.splitNumerator,
          action.splitDenominator,
        ),
      };
    },
  );
  const quantityFields = [
    ['outstandingUnits', security.outstandingUnits],
    ['floatUnits', security.floatUnits],
    ['floatShares', security.floatShares],
    ['advUnits', security.advUnits],
    [
      'makerInventoryCapacityUnits',
      security.liquidityProfile
        ?.makerInventoryCapacityUnits,
    ],
    [
      'baseDepthUnits',
      security.depthProfile?.baseDepthUnits,
    ],
  ].map(([field, before]) => ({
    field,
    before,
    after: corporateActionScaledUnits(
      before,
      action.splitNumerator,
      action.splitDenominator,
    ),
  }));
  const adjustedCurrentUnits =
    corporateActionScaledUnits(
      currentUnits,
      action.splitNumerator,
      action.splitDenominator,
    );
  const lastPriceTicks =
    corporateActionAdjustedPriceTicks(
      Number(security.lastPrice) * 100,
      action.splitNumerator,
      action.splitDenominator,
    );
  const previousCloseTicks =
    corporateActionAdjustedPriceTicks(
      security.previousCloseTicks,
      action.splitNumerator,
      action.splitDenominator,
    );
  const basketOpeningPriceTicks =
    corporateActionAdjustedPriceTicks(
      openingSecurityPriceTicks(security),
      action.splitNumerator,
      action.splitDenominator,
    );
  const heldBefore = holderAdjustments.reduce(
    (sum, adjustment) =>
      sum + adjustment.before,
    0,
  );
  if (
    !Number.isSafeInteger(currentUnits) ||
    currentUnits <= 0 ||
    security.outstandingUnits !==
      currentUnits ||
    heldBefore !== currentUnits ||
    adjustedCurrentUnits === null ||
    holderAdjustments.some(
      (adjustment) =>
        adjustment.after === null,
    ) ||
    quantityFields.some(
      (adjustment) =>
        adjustment.after === null,
    ) ||
    lastPriceTicks === null ||
    previousCloseTicks === null ||
    basketOpeningPriceTicks === null
  ) {
    return reject(
      'NON_INTEGER_CORPORATE_ACTION_AUTHORITY',
    );
  }

  const derivativeResult =
    reduceDerivatives(
      next.derivatives,
      {
        type:
          'APPLY_SECURITY_CORPORATE_ACTION',
        atMs: derivativeAuthorityTimeMs(
          next,
          action.authorityAtMs,
        ),
        actorId:
          'issuer_corporate_registry',
        source:
          'canonical_world_corporate_action',
        actionId: action.actionId,
        securityId: symbol,
        splitNumerator:
          action.splitNumerator,
        splitDenominator:
          action.splitDenominator,
        cashDividendCentsPerShare: 0,
      },
    );
  if (
    derivativeResult.receipt.status !==
      'applied'
  ) {
    return reject(
      derivativeResult.receipt.reason,
    );
  }

  for (const adjustment of holderAdjustments) {
    adjustment.holder.holdings[symbol] =
      adjustment.after;
  }
  for (const adjustment of quantityFields) {
    if (
      adjustment.field ===
      'makerInventoryCapacityUnits'
    ) {
      security.liquidityProfile[
        adjustment.field
      ] = adjustment.after;
    } else if (
      adjustment.field === 'baseDepthUnits'
    ) {
      security.depthProfile[
        adjustment.field
      ] = adjustment.after;
    } else {
      security[adjustment.field] =
        adjustment.after;
    }
  }
  security.lastPrice =
    price(lastPriceTicks / 100);
  security.previousCloseTicks =
    previousCloseTicks;
  security.derivativeBasketOpeningPriceTicks =
    basketOpeningPriceTicks;
  security.priceHistory.push({
    tick: next.world.tick,
    price: security.lastPrice,
    source: 'security_corporate_action',
    actionId: action.actionId,
  });
  next.derivatives =
    derivativeResult.state;
  next.accounting.currentSecurityUnits[
    symbol
  ] = adjustedCurrentUnits;

  const securityTransfers =
    holderAdjustments
      .filter(
        (adjustment) =>
          adjustment.after !==
          adjustment.before,
      )
      .map((adjustment) => ({
        symbol,
        from:
          'issuer_corporate_action_account',
        to: adjustment.holder.id,
        quantity:
          adjustment.after -
          adjustment.before,
      }));
  const journal = addJournal(next, {
    type:
      'security_corporate_action',
    description:
      `${symbol} ${action.splitNumerator}:${action.splitDenominator} 拆股托管调整`,
    postings: [],
    securityTransfers,
  });
  const event = addEvent(next, {
    type: 'security_corporate_action',
    actorId:
      'issuer_corporate_registry',
    authority:
      'canonical_security_corporate_action_v1',
    affectedEntities: [
      security.issuerId,
      symbol,
      'derivative_market',
    ],
    ledgerEntryIds: [journal.id],
    visibility: 'public',
    summary:
      `${security.name}完成拆股，股权托管与衍生品参考同步调整。`,
  });
  journal.eventId = event.id;
  const company =
    next.entities.companies[
      security.issuerId
    ];
  const publishedValue =
    createPublishedFinancialValue(
      company,
      security,
      next.economy,
    );
  const fact = addFact(next, {
    type: 'company_financial_report',
    entityId: company.id,
    eventId: event.id,
    summary:
      `${company.name}因拆股重述每股口径。`,
    publishedAtMs:
      derivativeAuthorityTimeMs(
        next,
        action.authorityAtMs,
      ),
    value: publishedValue,
    visibility: 'public',
  });
  company.publishedFinancialSnapshot = {
    asOfTick: next.world.tick,
    publishedAtMs: fact.publishedAtMs,
    sourceFactId: fact.id,
    value: clone(publishedValue),
  };
  const issuanceRecord = {
    actionId: action.actionId,
    symbol,
    splitNumerator:
      action.splitNumerator,
    splitDenominator:
      action.splitDenominator,
    cashDividendCentsPerShare: 0,
    beforeUnits: currentUnits,
    afterUnits: adjustedCurrentUnits,
    atMs: fact.publishedAtMs,
    eventId: event.id,
    factId: fact.id,
    journalId: journal.id,
  };
  next.accounting.securityIssuanceLedger.push(
    issuanceRecord,
  );
  synchronizeWorldValuations(next);
  syncEmbeddedDerivatives(next, {
    atMs: fact.publishedAtMs,
    source:
      'corporate_action_post_split_sync',
  });
  const receipt = {
    type: 'security_corporate_action',
    status: 'applied',
    reason: null,
    actionId: action.actionId,
    securityId: symbol,
    splitNumerator:
      action.splitNumerator,
    splitDenominator:
      action.splitDenominator,
    beforeUnits: currentUnits,
    afterUnits: adjustedCurrentUnits,
    eventId: event.id,
    factId: fact.id,
    journalId: journal.id,
    derivativeReceipt:
      derivativeResult.receipt,
  };
  next.ui.lastReceipt = receipt;
  return { state: next, receipt };
}

function bindResearchReportSnapshots(
  state,
  {
    snapshotOrigin = 'delivery',
  } = {},
) {
  const service =
    state.socialCareer?.researchNetwork?.services
      ?.playerCoverage;
  if (!service?.reportsBySymbol) return 0;
  let bound = 0;
  for (const [symbol, report] of Object.entries(
    service.reportsBySymbol,
  )) {
    if (
      report?.model &&
      Number.isSafeInteger(report.model.lowTicks) &&
      Number.isSafeInteger(report.model.midpointTicks) &&
      Number.isSafeInteger(report.model.highTicks)
    ) {
      continue;
    }
    const security = state.market?.securities?.[symbol];
    const valuation = security?.valuation;
    const company =
      state.entities?.companies?.[security?.issuerId];
    if (
      !valuation ||
      !Number.isSafeInteger(valuation.lowTicks) ||
      valuation.lowTicks <= 0 ||
      !Number.isSafeInteger(valuation.midpointTicks) ||
      !Number.isSafeInteger(valuation.highTicks) ||
      valuation.highTicks <= valuation.lowTicks
    ) {
      continue;
    }
    report.model = {
      lowTicks: valuation.lowTicks,
      midpointTicks: valuation.midpointTicks,
      highTicks: valuation.highTicks,
      modelRevision: report.modelRevision,
      inputAuthority: report.inputAuthority,
      valuationRuleVersion: valuation.ruleVersion,
      valuationAsOfTick: valuation.asOfTick,
      snapshotOrigin,
    };
    report.publicFactIds = [
      ...new Set(
        Array.isArray(valuation.sourceFactIds)
          ? valuation.sourceFactIds.map(String)
          : [],
      ),
    ];
    report.drivers = Array.isArray(company?.macroExposures)
      ? company.macroExposures.slice(0, 4)
      : [
          company?.industry,
          company?.lifecycle,
        ].filter(Boolean);
    bound += 1;
  }
  return bound;
}

function createMarketDataEntitlements(roleType) {
  const startsActive = roleType === 'institution';
  return {
    [LEVEL2_DEPTH_PRODUCT_ID]: {
      status: startsActive ? 'active' : 'locked',
      eligible: true,
      activatedAtTick: startsActive ? 0 : null,
      expiresAtTick:
        startsActive
          ? MARKET_DATA_PRODUCTS[LEVEL2_DEPTH_PRODUCT_ID].termWorldDays
          : null,
      source: startsActive ? 'institution_role_bundle' : null,
    },
  };
}

export function getMarketDataEntitlement(
  state,
  productId = LEVEL2_DEPTH_PRODUCT_ID,
) {
  const entitlement =
    state?.player?.marketDataEntitlements?.[productId];
  if (!entitlement) return null;
  const expired =
    entitlement.status === 'active' &&
    Number.isSafeInteger(entitlement.expiresAtTick) &&
    state.world.tick >= entitlement.expiresAtTick;
  return {
    ...clone(entitlement),
    status: expired ? 'expired' : entitlement.status,
  };
}

export function getMarketDataProjection(state) {
  const entitlements = Object.fromEntries(
    Object.keys(state.market.marketDataProducts ?? {}).map((productId) => [
      productId,
      getMarketDataEntitlement(state, productId),
    ]),
  );
  const primary =
    entitlements[LEVEL2_DEPTH_PRODUCT_ID] ?? {
      status: 'locked',
      eligible: false,
      activatedAtTick: null,
      expiresAtTick: null,
      source: null,
    };
  return {
    products: clone(state.market.marketDataProducts ?? {}),
    viewer: {
      accountId: 'player',
      entitlement: primary.status,
      eligible: primary.eligible,
      expiresAtTick: primary.expiresAtTick,
      entitlements,
    },
  };
}

function derivativeWorldTimeMs(state) {
  return Math.max(
    0,
    Math.floor(Number(state.world?.tick) || 0) *
      SYNTHETIC_WORLD_DAY_MS,
  );
}

function derivativeAuthorityTimeMs(
  state,
  requestedAtMs = null,
) {
  const requested =
    Number.isSafeInteger(requestedAtMs) &&
    requestedAtMs >= 0
      ? requestedAtMs
      : 0;
  return Math.max(
    derivativeWorldTimeMs(state),
    state.derivatives?.nowMs ?? 0,
    requested,
  );
}

function openingSecurityPriceTicks(security) {
  if (
    Number.isSafeInteger(
      security?.derivativeBasketOpeningPriceTicks,
    ) &&
    security.derivativeBasketOpeningPriceTicks > 0
  ) {
    return security.derivativeBasketOpeningPriceTicks;
  }
  const opening = Array.isArray(security?.priceHistory)
    ? security.priceHistory.find(
        (point) =>
          Number(point?.tick) === 0 &&
          Number(point?.price) > 0,
      )
    : null;
  const openingTicks = Math.round(
    Number(opening?.price) * 100,
  );
  if (
    Number.isSafeInteger(openingTicks) &&
    openingTicks > 0
  ) {
    return openingTicks;
  }
  return Math.max(
    1,
    Math.round(Number(security?.previousCloseTicks) || 1),
  );
}

function floatWeightedBasketTicks(
  securities,
  basket,
) {
  const missingSymbols =
    basket.constituentSymbols.filter(
      (symbol) => securities[symbol] === undefined,
    );
  if (missingSymbols.length > 0) {
    throw new Error(
      `Derivative basket is missing listed constituents: ${missingSymbols.join(', ')}`,
    );
  }
  const constituents =
    basket.constituentSymbols
      .map((symbol) => securities[symbol]);
  let openingFloatValue = 0;
  let currentFloatValue = 0;
  for (const security of constituents) {
    const floatUnits = Math.max(
      0,
      Math.floor(Number(security.floatUnits) || 0),
    );
    const currentTicks = Math.max(
      1,
      Math.round(Number(security.lastPrice) * 100),
    );
    openingFloatValue +=
      floatUnits * openingSecurityPriceTicks(security);
    currentFloatValue += floatUnits * currentTicks;
  }
  if (
    openingFloatValue <= 0 ||
    currentFloatValue <= 0
  ) {
    return basket.baseLevelTicks;
  }
  return Math.max(
    1,
    Math.round(
      basket.baseLevelTicks *
        currentFloatValue /
        openingFloatValue,
    ),
  );
}

function derivativeUnderlyingSpots(state) {
  const securities = state.market?.securities ?? {};
  const stockTicks = Math.max(
    1,
    Math.round(
      Number(securities.LZA003?.lastPrice ?? 46.8) *
        100,
    ),
  );
  const balances = ensureDerivativeCommodityBalances(
    state.economy,
  );
  return {
    SYNTH300: floatWeightedBasketTicks(
      securities,
      DERIVATIVE_EQUITY_BASKETS.SYNTH300,
    ),
    LZETF50: floatWeightedBasketTicks(
      securities,
      DERIVATIVE_EQUITY_BASKETS.LZETF50,
    ),
    LZA003: stockTicks,
    ...Object.fromEntries(
      Object.entries(balances).map(
        ([underlyingId, balance]) => [
          underlyingId,
          Math.max(1, Math.round(balance.spotTicks)),
        ],
      ),
    ),
  };
}

function derivativeUnderlyingBasketReferences(state) {
  const securities = state.market?.securities ?? {};
  const universe =
    state.derivatives?.universe ?? {
      equityBasketVersions:
        DERIVATIVE_EQUITY_BASKET_VERSIONS,
    };
  const spotTicksByUnderlyingVersion =
    Object.fromEntries(
      Object.entries(
        DERIVATIVE_EQUITY_BASKET_VERSIONS,
      ).map(([underlyingId, versions]) => {
        const registeredReferences =
          universe.equityBasketReferences?.[
            underlyingId
          ];
        const measuredVersions = registeredReferences
          ? Object.keys(registeredReferences)
          : [
              DERIVATIVE_EQUITY_BASKETS[
                underlyingId
              ].constituentSetVersion,
            ];
        return [
          underlyingId,
          Object.fromEntries(
            measuredVersions.map(
              (constituentSetVersion) => {
                const basket =
                  versions[constituentSetVersion];
                if (!basket) {
                  throw new Error(
                    `Unknown basket version: ${underlyingId}:${constituentSetVersion}`,
                  );
                }
                return [
                  constituentSetVersion,
                  floatWeightedBasketTicks(
                    securities,
                    basket,
                  ),
                ];
              },
            ),
          ),
        ];
      }),
    );
  return buildEquityBasketSettlementReferences(
    universe,
    spotTicksByUnderlyingVersion,
  );
}

function derivativeUnderlyingCarryRateBps(state) {
  const balances = ensureDerivativeCommodityBalances(
    state.economy,
  );
  const riskFreeRateBps = Math.round(
    Number(state.economy?.riskFreeRateBps) || 0,
  );
  return {
    SYNTH300: Math.round(
      clamp(
        riskFreeRateBps - 180,
        -5_000,
        5_000,
      ),
    ),
    LZETF50: Math.round(
      clamp(
        riskFreeRateBps - 220,
        -5_000,
        5_000,
      ),
    ),
    LZA003: Math.round(
      clamp(
        riskFreeRateBps,
        -5_000,
        5_000,
      ),
    ),
    ...Object.fromEntries(
      Object.entries(balances).map(
        ([underlyingId, balance]) => [
          underlyingId,
          Math.round(
            clamp(
              Number(balance.carryBps) || 0,
              -5_000,
              5_000,
            ),
          ),
        ],
      ),
    ),
  };
}

function derivativeUnderlyingRiskFreeRateBps(state) {
  const riskFreeRateBps = Math.round(
    clamp(
      Number(state.economy?.riskFreeRateBps) || 0,
      -5_000,
      5_000,
    ),
  );
  return Object.fromEntries(
    Object.keys(derivativeUnderlyingSpots(state)).map(
      (underlyingId) => [
        underlyingId,
        riskFreeRateBps,
      ],
    ),
  );
}

function derivativeExternalCollateralCents(state) {
  const securityValue = Object.entries(
    state.player?.holdings ?? {},
  ).reduce(
    (sum, [symbol, quantity]) =>
      sum +
      Math.max(0, Math.floor(Number(quantity) || 0)) *
        Math.round(
          Number(
            state.market?.securities?.[symbol]?.lastPrice,
          ) * 100,
        ),
    0,
  );
  const derivativeDebtCents = Math.max(
    0,
    Number(
      state.derivatives?.accounts?.player?.financing
        ?.cashDebtCents,
    ) || 0,
  );
  const liabilitiesCents = Math.max(
    0,
    Math.round(
      Number(state.player?.liabilities) * 100,
    ),
  );
  const nonDerivativeLiabilitiesCents = Math.max(
    0,
    liabilitiesCents - derivativeDebtCents,
  );
  return Math.max(
    0,
    Math.round(Number(state.player?.otherAssets) * 100) +
      securityValue -
      nonDerivativeLiabilitiesCents,
  );
}

function playerSecuritiesLendingRisk(account) {
  return securitiesLendingRiskState({
    collateralValueCents: 0,
    borrowedSecurities:
      account?.borrowedSecurities ?? {},
  });
}

const PLAYER_FACILITY_COLLATERAL_SHAPE_VERSION =
  'lzy-two-finance-collateral-shape-v1';

function playerBorrowedSecurityQuantities(account) {
  return Object.fromEntries(
    Object.entries(
      account?.borrowedSecurities ?? {},
    ).map(([securityId, loan]) => [
      securityId,
      Math.max(
        0,
        Math.floor(Number(loan?.quantity) || 0),
      ),
    ]),
  );
}

function maximumMarketTradeCommitSeq(state) {
  return (state.market?.trades ?? []).reduce(
    (maximum, trade) =>
      Number.isSafeInteger(trade?.commitSeq)
        ? Math.max(maximum, trade.commitSeq)
        : maximum,
    0,
  );
}

function initialPlayerFacilityCollateralTracker(
  state,
  account,
) {
  const observedBorrowedQuantities =
    playerBorrowedSecurityQuantities(account);
  const lastProcessedMarketCommitSeq =
    maximumMarketTradeCommitSeq(state);
  return {
    schemaVersion:
      PLAYER_FACILITY_COLLATERAL_SHAPE_VERSION,
    classificationStatus:
      Object.values(observedBorrowedQuantities).some(
        (quantity) => quantity > 0,
      )
        ? 'legacy_unresolved'
        : 'authoritative',
    lastProcessedMarketCommitSeq,
    lastProcessedTradeIdsAtCommitSeq: (
      state.market?.trades ?? []
    )
      .filter(
        (trade) =>
          trade?.commitSeq ===
          lastProcessedMarketCommitSeq,
      )
      .map((trade) => trade.id)
      .filter(
        (tradeId) => typeof tradeId === 'string',
      )
      .sort(),
    securities: Object.fromEntries(
      Object.entries(
        observedBorrowedQuantities,
      ).map(([securityId, quantity]) => [
        securityId,
        {
          observedBorrowedQuantity: quantity,
          borrowedCustodyQuantity: 0,
          restrictedShortSaleProceedsCents: 0,
        },
      ]),
    ),
  };
}

function validPlayerFacilityCollateralTracker(
  tracker,
) {
  return (
    tracker?.schemaVersion ===
      PLAYER_FACILITY_COLLATERAL_SHAPE_VERSION &&
    Number.isSafeInteger(
      tracker.lastProcessedMarketCommitSeq,
    ) &&
    tracker.lastProcessedMarketCommitSeq >= 0 &&
    Array.isArray(
      tracker.lastProcessedTradeIdsAtCommitSeq,
    ) &&
    tracker.securities &&
    typeof tracker.securities === 'object' &&
    !Array.isArray(tracker.securities)
  );
}

function ensureCollateralSecurityTracker(
  tracker,
  securityId,
) {
  tracker.securities[securityId] ??= {
    observedBorrowedQuantity: 0,
    borrowedCustodyQuantity: 0,
    restrictedShortSaleProceedsCents: 0,
  };
  return tracker.securities[securityId];
}

function proportionalTradeFeeCents(
  trade,
  allocatedQuantity,
) {
  if (
    allocatedQuantity <= 0 ||
    !Number.isSafeInteger(trade?.feeCents) ||
    trade.feeCents <= 0
  ) {
    return 0;
  }
  return Math.round(
    trade.feeCents *
      allocatedQuantity /
      Math.max(1, trade.quantity),
  );
}

function buildPlayerFacilityCollateralShape(
  state,
  account,
  tracker,
  authorityAtMs = derivativeAuthorityTimeMs(state),
) {
  const securities = {};
  let ownedSecuritiesCents = 0;
  let borrowedSecuritiesInCustodyCents = 0;
  let totalSecuritiesCents = 0;
  let restrictedShortSaleProceedsCents = 0;
  const securityIds = new Set([
    ...Object.keys(state.market?.securities ?? {}),
    ...Object.keys(state.player?.holdings ?? {}),
    ...Object.keys(account?.borrowedSecurities ?? {}),
    ...Object.keys(tracker.securities ?? {}),
  ]);
  for (const securityId of [...securityIds].sort()) {
    const securityTracker =
      ensureCollateralSecurityTracker(
        tracker,
        securityId,
      );
    const borrowedQuantity = Math.max(
      0,
      Math.floor(
        Number(
          account?.borrowedSecurities?.[securityId]
            ?.quantity,
        ) || 0,
      ),
    );
    const holdingQuantity = Math.max(
      0,
      Math.floor(
        Number(
          state.player?.holdings?.[securityId],
        ) || 0,
      ),
    );
    const borrowedCustodyQuantity = Math.min(
      borrowedQuantity,
      holdingQuantity,
      Math.max(
        0,
        Math.floor(
          Number(
            securityTracker
              .borrowedCustodyQuantity,
          ) || 0,
        ),
      ),
    );
    securityTracker.borrowedCustodyQuantity =
      borrowedCustodyQuantity;
    const ownedQuantity = Math.max(
      0,
      holdingQuantity -
        borrowedCustodyQuantity,
    );
    const shortQuantity = Math.max(
      0,
      borrowedQuantity -
        borrowedCustodyQuantity,
    );
    const referencePriceTicks = Math.max(
      1,
      Math.round(
        Number(
          state.market?.securities?.[securityId]
            ?.lastPrice,
        ) * 100,
      ) || 1,
    );
    const restrictedProceedsCents = Math.max(
      0,
      Math.round(
        Number(
          securityTracker
            .restrictedShortSaleProceedsCents,
        ) || 0,
      ),
    );
    securityTracker
      .restrictedShortSaleProceedsCents =
      restrictedProceedsCents;
    const ownedValueCents =
      ownedQuantity * referencePriceTicks;
    const borrowedCustodyValueCents =
      borrowedCustodyQuantity *
      referencePriceTicks;
    ownedSecuritiesCents += ownedValueCents;
    borrowedSecuritiesInCustodyCents +=
      borrowedCustodyValueCents;
    totalSecuritiesCents +=
      holdingQuantity * referencePriceTicks;
    restrictedShortSaleProceedsCents +=
      restrictedProceedsCents;
    securities[securityId] = {
      ownedQuantity,
      borrowedQuantity,
      borrowedCustodyQuantity,
      shortQuantity,
      referencePriceTicks,
      ownedValueCents,
      borrowedCustodyValueCents,
      restrictedShortSaleProceedsCents:
        restrictedProceedsCents,
    };
  }
  const playerCashCents = Math.max(
    0,
    Math.round(Number(state.player?.cash) * 100),
  );
  const ownCashCents =
    playerCashCents -
    restrictedShortSaleProceedsCents;
  const pledgeableOwnCashCents = Math.max(
    0,
    ownCashCents,
  );
  const restrictedProceedsFundingDeficitCents =
    Math.max(0, -ownCashCents);
  const otherEligibleAssetsCents = Math.max(
    0,
    Math.round(
      Number(state.player?.otherAssets) * 100,
    ),
  );
  const financingDebtCents = Math.max(
    0,
    Math.round(
      Number(account?.financing?.cashDebtCents) || 0,
    ),
  );
  const totalLiabilitiesCents = Math.max(
    0,
    Math.round(
      Number(state.player?.liabilities) * 100,
    ),
  );
  const nonDerivativeLiabilitiesCents = Math.max(
    0,
    totalLiabilitiesCents -
      financingDebtCents,
  );
  const externalCollateralCents = Math.max(
    0,
    otherEligibleAssetsCents +
      totalSecuritiesCents -
      nonDerivativeLiabilitiesCents,
  );
  const nonDerivativeLiabilityShortfallCents =
    Math.max(
      0,
      nonDerivativeLiabilitiesCents -
        otherEligibleAssetsCents -
        totalSecuritiesCents,
    );
  const borrowedSecuritiesLiabilityCents =
    playerSecuritiesLendingRisk(account)
      .liabilityCents;
  const eligibleCollateralCents = Math.max(
    0,
    playerCashCents +
      externalCollateralCents -
      nonDerivativeLiabilityShortfallCents -
      financingDebtCents -
      borrowedSecuritiesLiabilityCents,
  );
  return {
    schemaVersion:
      PLAYER_FACILITY_COLLATERAL_SHAPE_VERSION,
    classificationStatus:
      tracker.classificationStatus,
    authorityAtMs,
    processedThroughMarketCommitSeq:
      tracker.lastProcessedMarketCommitSeq,
    playerCashCents,
    pledgeableOwnCashCents,
    restrictedShortSaleProceedsCents,
    restrictedProceedsFundingDeficitCents,
    ownedSecuritiesCents,
    borrowedSecuritiesInCustodyCents,
    totalSecuritiesCents,
    otherEligibleAssetsCents,
    nonDerivativeLiabilitiesCents,
    nonDerivativeLiabilityShortfallCents,
    externalCollateralCents,
    financingDebtCents,
    borrowedSecuritiesLiabilityCents,
    eligibleCollateralCents,
    securities,
  };
}

function samePlayerFacilityCollateralTracker(
  left,
  right,
) {
  if (
    !validPlayerFacilityCollateralTracker(left) ||
    !validPlayerFacilityCollateralTracker(right) ||
    left.schemaVersion !== right.schemaVersion ||
    left.classificationStatus !==
      right.classificationStatus ||
    left.lastProcessedMarketCommitSeq !==
      right.lastProcessedMarketCommitSeq ||
    left.lastProcessedTradeIdsAtCommitSeq.length !==
      right.lastProcessedTradeIdsAtCommitSeq.length ||
    left.lastProcessedTradeIdsAtCommitSeq.some(
      (tradeId, index) =>
        tradeId !==
        right.lastProcessedTradeIdsAtCommitSeq[index],
    )
  ) {
    return false;
  }
  const leftSecurityIds = Object.keys(
    left.securities,
  ).sort();
  const rightSecurityIds = Object.keys(
    right.securities,
  ).sort();
  return (
    leftSecurityIds.length === rightSecurityIds.length &&
    leftSecurityIds.every(
      (securityId, index) => {
        if (
          securityId !== rightSecurityIds[index]
        ) {
          return false;
        }
        const leftSecurity =
          left.securities[securityId];
        const rightSecurity =
          right.securities[securityId];
        return (
          leftSecurity.observedBorrowedQuantity ===
            rightSecurity.observedBorrowedQuantity &&
          leftSecurity.borrowedCustodyQuantity ===
            rightSecurity.borrowedCustodyQuantity &&
          leftSecurity
            .restrictedShortSaleProceedsCents ===
            rightSecurity
              .restrictedShortSaleProceedsCents
        );
      },
    )
  );
}

function derivePlayerFacilityCollateralAuthority(
  state,
  accountOverride = null,
  authorityAtMs = derivativeAuthorityTimeMs(state),
) {
  const sourceAccount =
    accountOverride ??
    state.derivatives?.accounts?.player;
  if (!sourceAccount) return null;
  const account = {
    ...sourceAccount,
    borrowedSecurities: Object.fromEntries(
      Object.entries(
        sourceAccount.borrowedSecurities ?? {},
      ).map(([securityId, loan]) => {
        const currentReferencePriceTicks =
          Math.round(
            Number(
              state.market?.securities?.[securityId]
                ?.lastPrice,
            ) * 100,
          );
        return [
          securityId,
          {
            ...loan,
            referencePriceTicks:
              Number.isSafeInteger(
                currentReferencePriceTicks,
              ) &&
              currentReferencePriceTicks > 0
                ? currentReferencePriceTicks
                : loan.referencePriceTicks,
          },
        ];
      }),
    ),
  };
  const previousTracker =
    sourceAccount.facilityCollateralShapeTracker;
  let tracker =
    validPlayerFacilityCollateralTracker(
      previousTracker,
    )
      ? clone(previousTracker)
      : null;
  if (
    !validPlayerFacilityCollateralTracker(
      tracker,
    )
  ) {
    tracker =
      initialPlayerFacilityCollateralTracker(
        state,
        account,
      );
  }
  const borrowedQuantities =
    playerBorrowedSecurityQuantities(account);
  const securityIds = new Set([
    ...Object.keys(tracker.securities),
    ...Object.keys(borrowedQuantities),
  ]);
  for (const securityId of securityIds) {
    const securityTracker =
      ensureCollateralSecurityTracker(
        tracker,
        securityId,
      );
    const observedBorrowedQuantity = Math.max(
      0,
      Math.floor(
        Number(
          securityTracker
            .observedBorrowedQuantity,
        ) || 0,
      ),
    );
    const borrowedQuantity =
      borrowedQuantities[securityId] ?? 0;
    if (
      borrowedQuantity >
      observedBorrowedQuantity
    ) {
      securityTracker.borrowedCustodyQuantity =
        Math.max(
          0,
          Math.floor(
            Number(
              securityTracker
                .borrowedCustodyQuantity,
            ) || 0,
          ),
        ) +
        (
          borrowedQuantity -
          observedBorrowedQuantity
        );
      tracker.classificationStatus =
        'authoritative';
    }
  }

  const processedAtAnchor = new Set(
    tracker.lastProcessedTradeIdsAtCommitSeq,
  );
  const unprocessedTrades = (
    state.market?.trades ?? []
  )
    .filter(
      (trade) =>
        Number.isSafeInteger(trade?.commitSeq) &&
        (
          trade.commitSeq >
            tracker.lastProcessedMarketCommitSeq ||
          (
            trade.commitSeq ===
              tracker.lastProcessedMarketCommitSeq &&
            !processedAtAnchor.has(trade.id)
          )
        ),
    )
    .sort(
      (left, right) =>
        left.commitSeq - right.commitSeq ||
        String(left.id).localeCompare(
          String(right.id),
        ),
    );
  for (const trade of unprocessedTrades) {
    if (
      trade.buyerId !== 'player' &&
      trade.sellerId !== 'player'
    ) {
      continue;
    }
    const securityTracker =
      ensureCollateralSecurityTracker(
        tracker,
        trade.symbol,
      );
    const borrowedQuantity =
      borrowedQuantities[trade.symbol] ?? 0;
    if (
      trade.sellerId === 'player' &&
      trade.custodySource !==
        'owned_collateral'
    ) {
      const borrowedSoldQuantity = Math.min(
        Math.max(
          0,
          securityTracker
            .borrowedCustodyQuantity,
        ),
        Math.max(
          0,
          Math.floor(Number(trade.quantity) || 0),
        ),
      );
      securityTracker.borrowedCustodyQuantity -=
        borrowedSoldQuantity;
      securityTracker
        .restrictedShortSaleProceedsCents +=
        borrowedSoldQuantity *
        Math.max(
          1,
          Math.floor(Number(trade.priceTicks) || 0),
        );
    }
    if (trade.buyerId === 'player') {
      const missingBorrowedCustody = Math.max(
        0,
        borrowedQuantity -
          securityTracker
            .borrowedCustodyQuantity,
      );
      const coveredQuantity = Math.min(
        missingBorrowedCustody,
        Math.max(
          0,
          Math.floor(Number(trade.quantity) || 0),
        ),
      );
      const coverCostCents =
        coveredQuantity *
          Math.max(
            1,
            Math.floor(
              Number(trade.priceTicks) || 0,
            ),
          ) +
        proportionalTradeFeeCents(
          trade,
          coveredQuantity,
        );
      securityTracker.borrowedCustodyQuantity +=
        coveredQuantity;
      securityTracker
        .restrictedShortSaleProceedsCents =
        Math.max(
          0,
          securityTracker
            .restrictedShortSaleProceedsCents -
            coverCostCents,
        );
    }
  }
  const maximumProcessedCommitSeq =
    unprocessedTrades.reduce(
      (maximum, trade) =>
        Math.max(maximum, trade.commitSeq),
      tracker.lastProcessedMarketCommitSeq,
    );
  if (
    maximumProcessedCommitSeq >
    tracker.lastProcessedMarketCommitSeq
  ) {
    tracker.lastProcessedMarketCommitSeq =
      maximumProcessedCommitSeq;
    tracker.lastProcessedTradeIdsAtCommitSeq =
      unprocessedTrades
        .filter(
          (trade) =>
            trade.commitSeq ===
            maximumProcessedCommitSeq,
        )
        .map((trade) => trade.id)
        .sort();
  } else if (unprocessedTrades.length > 0) {
    tracker.lastProcessedTradeIdsAtCommitSeq = [
      ...new Set([
        ...tracker
          .lastProcessedTradeIdsAtCommitSeq,
        ...unprocessedTrades.map(
          (trade) => trade.id,
        ),
      ]),
    ].sort();
  }

  for (const securityId of securityIds) {
    const securityTracker =
      ensureCollateralSecurityTracker(
        tracker,
        securityId,
      );
    const observedBorrowedQuantity = Math.max(
      0,
      Math.floor(
        Number(
          securityTracker
            .observedBorrowedQuantity,
        ) || 0,
      ),
    );
    const borrowedQuantity =
      borrowedQuantities[securityId] ?? 0;
    if (
      borrowedQuantity <
      observedBorrowedQuantity
    ) {
      const returnedQuantity =
        observedBorrowedQuantity -
        borrowedQuantity;
      securityTracker.borrowedCustodyQuantity =
        Math.max(
          0,
          securityTracker
            .borrowedCustodyQuantity -
            returnedQuantity,
        );
      if (borrowedQuantity === 0) {
        securityTracker
          .restrictedShortSaleProceedsCents = 0;
      } else {
        securityTracker
          .restrictedShortSaleProceedsCents =
          Math.max(
            0,
            Math.round(
              securityTracker
                .restrictedShortSaleProceedsCents *
                borrowedQuantity /
                Math.max(
                  1,
                  observedBorrowedQuantity,
                ),
            ),
          );
      }
    }
    securityTracker.observedBorrowedQuantity =
      borrowedQuantity;
  }
  const shape =
    buildPlayerFacilityCollateralShape(
      state,
      account,
      tracker,
      authorityAtMs,
    );
  return {
    tracker:
      validPlayerFacilityCollateralTracker(
        previousTracker,
      ) &&
      samePlayerFacilityCollateralTracker(
        previousTracker,
        tracker,
      )
        ? previousTracker
        : tracker,
    shape,
  };
}

function playerFacilityEligibleCollateralFromAccount(
  account,
) {
  if (!account) return 0;
  if (
    Number.isSafeInteger(
      account.facilityEligibleCollateralCents,
    ) &&
    account.facilityEligibleCollateralCents >= 0
  ) {
    return account.facilityEligibleCollateralCents;
  }
  return Math.max(
    0,
    account.cashCents +
      account.externalCollateralCents -
      account.financing.cashDebtCents -
      playerSecuritiesLendingRisk(account)
        .liabilityCents,
  );
}

function derivativeFacilityEligibleCollateralCents(
  state,
) {
  const account =
    state.derivatives?.accounts?.player;
  const shapedCollateralCents =
    account?.facilityCollateralShape
      ?.eligibleCollateralCents;
  if (
    Number.isSafeInteger(shapedCollateralCents) &&
    shapedCollateralCents >= 0
  ) {
    return shapedCollateralCents;
  }
  const cashCents = Math.max(
    0,
    Math.round(Number(state.player?.cash) * 100),
  );
  const financingDebtCents = Math.max(
    0,
    Number(account?.financing?.cashDebtCents) || 0,
  );
  const lendingLiabilityCents = account
    ? playerSecuritiesLendingRisk(account)
        .liabilityCents
    : 0;
  return Math.max(
    0,
    cashCents +
      derivativeExternalCollateralCents(state) -
      financingDebtCents -
      lendingLiabilityCents,
  );
}

function ceilFacilityBasisPoints(value, basisPoints) {
  const numerator =
    BigInt(value) * BigInt(basisPoints);
  return Number(
    (numerator + 9_999n) / 10_000n,
  );
}

function playerFacilityInitialRequirementCents(
  account,
  {
    additionalFinancingCents = 0,
    securityId = null,
    additionalSecurityQuantity = 0,
    securityReferencePriceTicks = null,
  } = {},
) {
  const borrowedSecurities = clone(
    account.borrowedSecurities ?? {},
  );
  if (additionalSecurityQuantity > 0) {
    const current = borrowedSecurities[securityId] ?? {
      securityId,
      quantity: 0,
      referencePriceTicks:
        securityReferencePriceTicks,
      accruedFeeCents: 0,
    };
    current.quantity += additionalSecurityQuantity;
    current.referencePriceTicks =
      securityReferencePriceTicks;
    borrowedSecurities[securityId] = current;
  }
  const securitiesLending =
    securitiesLendingRiskState({
      collateralValueCents: 0,
      borrowedSecurities,
    });
  return (
    ceilFacilityBasisPoints(
      account.financing.cashDebtCents +
        additionalFinancingCents,
      FINANCING_INITIAL_RATIO_BPS,
    ) +
    securitiesLending.initialRequiredCollateralCents
  );
}

function maximumPlayerFacilityAmount(
  account,
  requestedAmountCents,
  requirementOptions,
) {
  const eligibleCollateralCents =
    playerFacilityEligibleCollateralFromAccount(
      account,
    );
  let low = 0;
  let high = requestedAmountCents;
  while (low < high) {
    const candidate =
      low + Math.ceil((high - low) / 2);
    if (
      playerFacilityInitialRequirementCents(
        account,
        requirementOptions(candidate),
      ) <= eligibleCollateralCents
    ) {
      low = candidate;
    } else {
      high = candidate - 1;
    }
  }
  return low;
}

function maximumPlayerFinancingAmountCents(
  account,
  requestedAmountCents,
) {
  return maximumPlayerFacilityAmount(
    account,
    requestedAmountCents,
    (additionalFinancingCents) => ({
      additionalFinancingCents,
    }),
  );
}

function maximumPlayerSecurityBorrowQuantity(
  account,
  securityId,
  referencePriceTicks,
  requestedQuantity,
) {
  return maximumPlayerFacilityAmount(
    account,
    requestedQuantity,
    (additionalSecurityQuantity) => ({
      securityId,
      additionalSecurityQuantity,
      securityReferencePriceTicks:
        referencePriceTicks,
    }),
  );
}

function playerMarkedNetWorthCents(state) {
  const derivativeAccount = state.derivatives?.accounts?.player;
  const derivativeDebtCents = Math.max(
    0,
    Number(
      derivativeAccount?.financing?.cashDebtCents,
    ) || 0,
  );
  const derivativePositionValueCents =
    derivativeAccount?.risk &&
    Number.isSafeInteger(derivativeAccount.risk.equityCents) &&
    Number.isSafeInteger(derivativeAccount.cashCents) &&
    Number.isSafeInteger(
      derivativeAccount.externalCollateralCents,
    )
      ? derivativeAccount.risk.equityCents -
        derivativeAccount.cashCents -
        derivativeAccount.externalCollateralCents +
        derivativeDebtCents
      : 0;
  return (
    Math.round(Number(state.player?.cash) * 100) +
      derivativeExternalCollateralCents(state) -
      derivativeDebtCents +
      derivativePositionValueCents
  );
}

function derivativeNetWorthCents(state) {
  return Math.max(0, playerMarkedNetWorthCents(state));
}

function createEmbeddedDerivatives(state) {
  const underlyingSpots =
    derivativeUnderlyingSpots(state);
  const playerCashCents = Math.max(
    0,
    Math.round(Number(state.player.cash) * 100),
  );
  const playerFacilityCollateralAuthority =
    derivePlayerFacilityCollateralAuthority(
      state,
      {
        cashCents: playerCashCents,
        financing: { cashDebtCents: 0 },
        borrowedSecurities: {},
        facilityCollateralShapeTracker: null,
      },
    );
  return createDerivativesState({
    worldId: state.world.id,
    worldSeed: state.world.seed,
    worldStartedAtMs: 0,
    nowMs: derivativeWorldTimeMs(state),
    spotTicks: underlyingSpots.SYNTH300,
    underlyingSpots,
    underlyingBasketSpots:
      derivativeUnderlyingBasketReferences(state),
    playerCashCents,
    playerExternalReservedCashCents:
      playerStockReservedCashCents(state),
    playerExternalCollateralCents:
      derivativeExternalCollateralCents(state),
    playerFacilityEligibleCollateralCents:
      playerFacilityCollateralAuthority.shape
        .eligibleCollateralCents,
    playerFacilityCollateralAuthority,
    testingAccessOpen:
      state.world.tradingAccessMode === 'testing_open',
    securityLendingInventory: Object.fromEntries(
      Object.entries(state.market.securities).map(
        ([symbol, security]) => [
          symbol,
          Math.max(
            10_000,
            Math.floor(
              Number(
                security.floatUnits ??
                  security.outstandingUnits,
              ) / 1_000,
            ),
          ),
        ],
      ),
    ),
  });
}

function ensureEmbeddedDerivatives(state) {
  if (!state.derivatives) {
    state.derivatives = createEmbeddedDerivatives(state);
  }
  return state.derivatives;
}

function ensureCanonicalEmbeddedDerivatives(state) {
  let current = ensureEmbeddedDerivatives(state);
  if (
    !current.universe.equityBasketVersions ||
    !current.universe.underlyings.SYNTH300?.basket ||
    !current.universe.underlyings.LZETF50?.basket
  ) {
    state.derivatives = restoreDerivatives(
      current,
      { worldId: state.world.id },
    );
    current = state.derivatives;
  }
  return current;
}

function embeddedDerivativesWorldCommand(
  state,
  {
    type = 'SYNC_WORLD',
    atMs = derivativeAuthorityTimeMs(state),
    source = 'world_settlement',
    testingAccessOpen = false,
  } = {},
) {
  const playerFacilityCollateralAuthority =
    derivePlayerFacilityCollateralAuthority(
      state,
      null,
      atMs,
    );
  const command = {
    type,
    atMs,
    totalEquivalentAssetCents:
      derivativeNetWorthCents(state),
    underlyingSpots:
      derivativeUnderlyingSpots(state),
    underlyingBasketSpots:
      derivativeUnderlyingBasketReferences(state),
    underlyingCarryRateBps:
      derivativeUnderlyingCarryRateBps(state),
    underlyingRiskFreeRateBps:
      derivativeUnderlyingRiskFreeRateBps(state),
    securityReferencePrices: Object.fromEntries(
      Object.entries(state.market.securities).map(
        ([symbol, security]) => [
          symbol,
          Math.max(
            1,
            Math.round(Number(security.lastPrice) * 100),
          ),
        ],
      ),
    ),
    playerCashCents: Math.max(
      0,
      Math.round(Number(state.player.cash) * 100),
    ),
    playerExternalReservedCashCents:
      playerStockReservedCashCents(state),
    playerExternalCollateralCents:
      derivativeExternalCollateralCents(state),
    playerFacilityEligibleCollateralCents:
      playerFacilityCollateralAuthority.shape
        .eligibleCollateralCents,
    playerFacilityCollateralAuthority,
    regimeSignalBps: Math.round(
      Number(state.economy?.industrialCycle ?? 0) *
        1_000,
    ),
    jumpRiskBps: Math.max(
      100,
      Math.round(
        Math.abs(
          Number(state.economy?.industrialCycle ?? 0),
        ) * 1_500,
      ),
    ),
    liquidityRiskBps: 100,
    source,
  };
  if (testingAccessOpen) {
    command.testingAccessOpen = true;
  }
  return command;
}

function syncEmbeddedDerivatives(
  state,
  {
    atMs = derivativeAuthorityTimeMs(state),
    source = 'world_settlement',
    testingAccessOpen = false,
  } = {},
) {
  const current = ensureEmbeddedDerivatives(state);
  const result = reduceDerivatives(
    current,
    embeddedDerivativesWorldCommand(state, {
      atMs,
      source,
      testingAccessOpen,
    }),
  );
  if (result.receipt.status !== 'applied') {
    throw new Error(
      `Derivative world synchronization failed: ${result.receipt.reason}`,
    );
  }
  state.derivatives = result.state;
  return result.receipt;
}

export function openTestingTradingAccess(
  state,
  {
    atMs = derivativeAuthorityTimeMs(state),
    source =
      'explicit_testing_worker_initialization',
  } = {},
) {
  const current =
    ensureCanonicalEmbeddedDerivatives(state);
  const alreadyOpen =
    state.world.tradingAccessMode ===
      'testing_open' &&
    current.access.qualificationPolicy ===
      TESTING_ACCESS_POLICY &&
    DERIVATIVE_PERMISSIONS.every(
      (permission) =>
        derivePermissionMode(
          current.access,
          permission,
        ) === 'OPEN',
    );
  if (alreadyOpen) {
    return {
      changed: false,
      receipt: null,
    };
  }
  const receipt = syncEmbeddedDerivatives(state, {
    atMs,
    source,
    testingAccessOpen: true,
  });
  state.world.tradingAccessMode =
    'testing_open';
  return {
    changed: true,
    receipt,
  };
}

export function synchronizeEmbeddedDerivatives(state) {
  const current =
    ensureCanonicalEmbeddedDerivatives(state);
  const underlyingSpots =
    derivativeUnderlyingSpots(state);
  const underlyingBasketSpots =
    derivativeUnderlyingBasketReferences(state);
  const underlyingCarryRateBps =
    derivativeUnderlyingCarryRateBps(state);
  const playerCashCents = Math.max(
    0,
    Math.round(Number(state.player.cash) * 100),
  );
  const playerExternalCollateralCents =
    derivativeExternalCollateralCents(state);
  const playerExternalReservedCashCents =
    playerStockReservedCashCents(state);
  const totalEquivalentAssetCents =
    derivativeNetWorthCents(state);
  const authorityAtMs =
    derivativeAuthorityTimeMs(state);
  const alreadySynchronized =
    current.nowMs === authorityAtMs &&
    current.accounts.player.cashCents ===
      playerCashCents &&
    current.accounts.player.externalCollateralCents ===
      playerExternalCollateralCents &&
    (
      current.accounts.player
        .externalReservedCashCents ?? 0
    ) === playerExternalReservedCashCents &&
    current.access.lastTotalEquivalentAssetCents ===
      totalEquivalentAssetCents &&
    Object.entries(underlyingSpots).every(
      ([underlyingId, spotTicks]) =>
        current.universe.underlyings[underlyingId]
          ?.spotTicks === spotTicks,
    ) &&
    Object.entries(underlyingBasketSpots).every(
      ([underlyingId, versionedReferences]) =>
        Object.entries(versionedReferences).every(
          ([constituentSetVersion, reference]) => {
            const currentReference =
              current.universe.equityBasketReferences?.[
                underlyingId
              ]?.[constituentSetVersion];
            return (
              currentReference?.spotTicks ===
                reference.spotTicks &&
              sameEquityBasketIdentity(
                currentReference?.basketIdentity,
                reference.basketIdentity,
              )
            );
          },
        ),
    ) &&
    Object.entries(underlyingCarryRateBps).every(
      ([underlyingId, carryRateBps]) =>
        current.universe.underlyings[underlyingId]
          ?.carryRateBps === carryRateBps,
    );
  if (alreadySynchronized) {
    return {
      status: 'unchanged',
      atMs: current.nowMs,
    };
  }
  return syncEmbeddedDerivatives(state, {
    atMs: authorityAtMs,
  });
}

function reconcileDerivativePlayerAccount(
  state,
  beforeAccount,
  afterAccount,
) {
  const cashDeltaCents =
    afterAccount.cashCents - beforeAccount.cashCents;
  const debtDeltaCents =
    afterAccount.financing.cashDebtCents -
    beforeAccount.financing.cashDebtCents;
  if (
    cashDeltaCents > 0 &&
    Math.round(state.economy.cashPool * 100) <
      cashDeltaCents
  ) {
    return {
      ok: false,
      reason: 'DERIVATIVE_COUNTERPARTY_CASH_SHORTFALL',
    };
  }
  state.player.cash = money(
    state.player.cash + cashDeltaCents / 100,
  );
  state.economy.cashPool = money(
    state.economy.cashPool - cashDeltaCents / 100,
  );
  state.player.liabilities = money(
    state.player.liabilities + debtDeltaCents / 100,
  );
  return {
    ok: true,
    cashDeltaCents,
    debtDeltaCents,
  };
}

function recordDerivativeCashSettlement(
  state,
  cashDeltaCents,
  summary,
  securityTransfers = [],
) {
  const amount = money(Math.abs(cashDeltaCents) / 100);
  const journal =
    amount > 0 || securityTransfers.length > 0
      ? addJournal(state, {
          type:
            securityTransfers.length > 0
              ? 'derivative_security_lending_settlement'
              : 'derivative_cash_settlement',
          description: summary,
          postings:
            cashDeltaCents > 0
              ? [
                  {
                    account: 'player.cash',
                    debit: amount,
                    credit: 0,
                  },
                  {
                    account: 'derivatives.clearing',
                    debit: 0,
                    credit: amount,
                  },
                ]
              : [
                  {
                    account: 'derivatives.clearing',
                    debit: amount,
                    credit: 0,
                  },
                  {
                    account: 'player.cash',
                    debit: 0,
                    credit: amount,
                  },
                ],
          securityTransfers,
        })
      : null;
  const fact = addFact(state, {
    type: 'derivative_settlement_fact',
    entityId: 'derivative_market',
    eventId: null,
    summary,
    value: {
      cashDeltaCents,
      securityTransfers: clone(securityTransfers),
    },
    visibility: 'player',
  });
  const event = addEvent(state, {
    type: 'derivative_settlement',
    actorId: 'player',
    authority: 'derivative_clearing',
    affectedEntities: ['player', 'derivative_market'],
    ledgerEntryIds: journal ? [journal.id] : [],
    factIds: [fact.id],
    visibility: 'player',
    summary,
  });
  fact.eventId = event.id;
  if (journal) journal.eventId = event.id;
  return event;
}

export function advanceEmbeddedDerivativesMarket(
  state,
  { atMs } = {},
) {
  if (!state?.world || !state?.market) {
    throw new TypeError(
      'A complete authoritative world is required',
    );
  }
  if (!Number.isSafeInteger(atMs) || atMs < 0) {
    throw new RangeError(
      'Derivative market authority time must be a non-negative integer',
    );
  }
  const current =
    ensureCanonicalEmbeddedDerivatives(state);
  const minimumAtMs = current.nowMs;
  if (atMs < minimumAtMs) {
    throw new RangeError(
      'Derivative market authority time cannot rewind',
    );
  }
  const beforeLendable = clone(
    current.clearing.lendableSecurities,
  );
  const result = reduceDerivatives(
    current,
    embeddedDerivativesWorldCommand(state, {
      type: 'ADVANCE_MARKET_CADENCE',
      atMs,
      source: 'realtime_quote_frame',
    }),
  );
  if (result.receipt.status !== 'applied') {
    throw new Error(
      `Derivative market cadence failed: ${result.receipt.reason}`,
    );
  }
  const beforeAccount = {
    cashCents:
      result.receipt.playerCashCentsBeforeActor,
    financing: {
      cashDebtCents:
        result.receipt.playerDebtCentsBeforeActor,
    },
  };
  const reconciliation =
    reconcileDerivativePlayerAccount(
      state,
      beforeAccount,
      result.state.accounts.player,
    );
  if (!reconciliation.ok) {
    throw new Error(reconciliation.reason);
  }
  state.derivatives = result.state;
  const settlementEvent =
    reconciliation.cashDeltaCents !== 0 ||
    reconciliation.debtDeltaCents !== 0
      ? recordDerivativeCashSettlement(
          state,
          reconciliation.cashDeltaCents,
          '盘中衍生品委托通过真实盘口成交。',
        )
      : null;
  const securitiesLendingDeltas =
    Object.fromEntries(
      Object.keys(
        result.state.clearing
          .lendableSecurities,
      )
        .sort()
        .map((securityId) => [
          securityId,
          (
            result.state.clearing
              .lendableSecurities[securityId] ?? 0
          ) - (beforeLendable[securityId] ?? 0),
        ])
        .filter(([, delta]) => delta !== 0),
    );
  const institutionalSecuritiesTransfers =
    (result.receipt.facilityActions ?? [])
      .filter(
        (action) =>
          action.status === 'applied' &&
          (
            action.type === 'BORROW_SECURITY' ||
            action.type === 'RETURN_SECURITY'
          ),
      )
      .map((action) => {
        const borrowing =
          action.type === 'BORROW_SECURITY';
        const custodyAccountId =
          `derivative_lending_custody_${action.actorId}`;
        const fromAccountId = borrowing
          ? 'securities_lending_pool'
          : custodyAccountId;
        const toAccountId = borrowing
          ? custodyAccountId
          : 'securities_lending_pool';
        return {
          securityId: action.securityId,
          quantity: action.quantity,
          from: fromAccountId,
          to: toAccountId,
          fromAccountId,
          toAccountId,
          custodyAccountId,
          borrowerId: action.actorId,
          direction: borrowing
            ? 'borrow'
            : 'return',
          atMs,
          derivativeCommitSeq:
            result.state.commitSeq,
          poolQuantityBefore:
            beforeLendable[action.securityId] ?? 0,
          poolQuantityAfter:
            result.state.clearing
              .lendableSecurities[
                action.securityId
              ] ?? 0,
          borrowerCustodyQuantityAfter:
            result.state.accounts[
              action.actorId
            ]?.borrowedSecurityCustody?.[
              action.securityId
            ] ?? 0,
        };
      });
  return {
    receipt: result.receipt,
    cashDeltaCents:
      reconciliation.cashDeltaCents,
    debtDeltaCents:
      reconciliation.debtDeltaCents,
    settlementEvent,
    securitiesLendingDeltas,
    institutionalSecuritiesTransfers,
  };
}

export function getDerivativesProjection(state) {
  if (!state?.derivatives) {
    throw new Error('当前世界没有可用的衍生品市场。');
  }
  const projection = snapshotDerivatives(
    state.derivatives,
    5,
  );
  const playerDerivativeAccount =
    state.derivatives.accounts.player;
  projection.financingFacility
    .playerFacilityEligibleCollateralCents =
    playerFacilityEligibleCollateralFromAccount(
      playerDerivativeAccount,
    );
  projection.financingFacility.collateralShape =
    clone(
      playerDerivativeAccount
        .facilityCollateralShape,
    );
  projection.financingFacility
    .playerAvailableCreditCents =
    Math.min(
      projection.financingFacility
        .playerAvailableCreditCents,
      maximumPlayerFinancingAmountCents(
        playerDerivativeAccount,
        projection.financingFacility
          .availableCreditCents,
      ),
    );
  for (const instrument of Object.values(
    projection.securitiesLending.instruments,
  )) {
    const security =
      state.market.securities[instrument.securityId];
    instrument.name =
      security?.name ?? instrument.securityId;
    instrument.referencePriceTicks = Math.max(
      1,
      Math.round(
        Number(security?.lastPrice) * 100,
      ),
    );
    instrument.playerAvailableQuantity = Math.min(
      instrument.playerAvailableQuantity,
      maximumPlayerSecurityBorrowQuantity(
        playerDerivativeAccount,
        instrument.securityId,
        instrument.referencePriceTicks,
        instrument.availableQuantity,
      ),
    );
    instrument.playerHoldingQuantity =
      state.player.holdings[
        instrument.securityId
      ] ?? 0;
  }
  return projection;
}

const PLAYER_DERIVATIVE_COMMANDS = new Set([
  'ENABLE_PERMISSION',
  'SUBMIT_ORDER',
  'CANCEL_ORDER',
  'DRAW_MARGIN_CREDIT',
  'REPAY_MARGIN_CREDIT',
  'BORROW_SECURITY',
  'RETURN_SECURITY',
]);

function routedSecurityCommand(type) {
  return (
    type === 'BORROW_SECURITY' ||
    type === 'RETURN_SECURITY'
  );
}

function playerStockReservedCashCents(state) {
  return (state.market?.orders ?? []).reduce(
    (sum, order) =>
      order?.ownerId === 'player' &&
      order?.side === 'buy' &&
      ['accepted', 'partially_filled'].includes(
        order?.status,
      ) &&
      Number.isSafeInteger(order?.reservedCashCents)
        ? sum + order.reservedCashCents
        : sum,
    0,
  );
}

function playerDerivativeReservedCashCents(state) {
  const account =
    state.derivatives?.accounts?.player;
  return [
    account?.reservedInitialMarginCents,
    account?.reservedTransactionFeesCents,
  ].reduce(
    (sum, reserved) =>
      Number.isSafeInteger(reserved) && reserved > 0
        ? sum + reserved
        : sum,
    0,
  );
}

function derivativeAction(state, action) {
  const command = action.command;
  if (
    !command ||
    !PLAYER_DERIVATIVE_COMMANDS.has(command.type)
  ) {
    return rejected(state, 'UNKNOWN_DERIVATIVE_ACTION');
  }
  if (
    command.type === 'ENABLE_PERMISSION' &&
    ![
      'margin_financing',
      'securities_lending',
      'option_buyer',
      'futures_trading',
    ].includes(command.permission)
  ) {
    return rejected(state, 'UNKNOWN_DERIVATIVE_PERMISSION');
  }
  const next = clone(state);
  const authorityAtMs =
    derivativeAuthorityTimeMs(
      next,
      action.authorityVirtualMs,
    );
  try {
    syncEmbeddedDerivatives(next, {
      atMs: authorityAtMs,
      source: 'player_world_action_sync',
    });
  } catch {
    return rejected(
      state,
      'DERIVATIVE_SYNCHRONIZATION_FAILED',
    );
  }
  let securityTransfer = null;
  let requestedSecurityQuantity = null;
  let custodyAvailableQuantity = null;
  let facilityAvailableSecurityQuantity = null;
  let requestedFinancingAmountCents = null;
  let facilityAvailableFinancingCents = null;
  if (
    routedSecurityCommand(command.type)
  ) {
    const security =
      next.market.securities[command.securityId];
    const quantity = Number(command.quantity);
    requestedSecurityQuantity = quantity;
    if (
      !security ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    ) {
      return rejected(
        state,
        'INVALID_SECURITY_LENDING_ACTION',
      );
    }
    const playerAvailable =
      action.availableHoldings?.[command.securityId] ??
      next.player.holdings[command.securityId] ??
      0;
    if (
      command.type === 'RETURN_SECURITY' &&
      playerAvailable < quantity
    ) {
      return rejected(
        state,
        'INSUFFICIENT_SHARES_TO_RETURN',
      );
    }
    if (
      command.type === 'BORROW_SECURITY' &&
      (
        next.market.maker.holdings[
          command.securityId
        ] ?? 0
      ) <= 0
    ) {
      return rejected(
        state,
        'LENDING_SHARE_CUSTODY_EXHAUSTED',
      );
    }
    if (command.type === 'BORROW_SECURITY') {
      custodyAvailableQuantity = Math.max(
        0,
        next.market.maker.holdings[
          command.securityId
        ] ?? 0,
      );
    }
  }
  const beforeAccount = clone(
    next.derivatives.accounts.player,
  );
  const routedCommand = {
    ...clone(command),
    atMs: authorityAtMs,
    actorId: 'player',
    source: 'player_world_action',
  };
  if (routedCommand.type === 'BORROW_SECURITY') {
    routedCommand.quantity = Math.min(
      routedCommand.quantity,
      custodyAvailableQuantity,
    );
    routedCommand.referencePriceTicks = Math.max(
      1,
      Math.round(
        Number(
          next.market.securities[
            routedCommand.securityId
          ].lastPrice,
        ) * 100,
      ),
    );
    if (
      derivePermissionMode(
        next.derivatives.access,
        'securities_lending',
      ) === 'OPEN'
    ) {
      facilityAvailableSecurityQuantity =
        maximumPlayerSecurityBorrowQuantity(
          next.derivatives.accounts.player,
          routedCommand.securityId,
          routedCommand.referencePriceTicks,
          routedCommand.quantity,
        );
      if (facilityAvailableSecurityQuantity <= 0) {
        return rejected(
          state,
          'INSUFFICIENT_LENDING_COLLATERAL',
        );
      }
      routedCommand.quantity = Math.min(
        routedCommand.quantity,
        facilityAvailableSecurityQuantity,
      );
    }
  }
  if (
    routedCommand.type === 'DRAW_MARGIN_CREDIT' &&
    Number.isSafeInteger(routedCommand.amountCents) &&
    routedCommand.amountCents > 0
  ) {
    requestedFinancingAmountCents =
      routedCommand.amountCents;
    if (
      derivePermissionMode(
        next.derivatives.access,
        'margin_financing',
      ) === 'OPEN'
    ) {
      facilityAvailableFinancingCents =
        maximumPlayerFinancingAmountCents(
          next.derivatives.accounts.player,
          routedCommand.amountCents,
        );
      if (facilityAvailableFinancingCents <= 0) {
        return rejected(
          state,
          'INSUFFICIENT_FINANCING_COLLATERAL',
        );
      }
      routedCommand.amountCents = Math.min(
        routedCommand.amountCents,
        facilityAvailableFinancingCents,
      );
    }
  }
  if (routedCommand.type === 'SUBMIT_ORDER') {
    routedCommand.tif =
      routedCommand.orderType === 'market'
        ? 'IOC'
        : routedCommand.tif ?? 'GTC';
    routedCommand.priceTicks =
      routedCommand.orderType === 'market'
        ? null
        : routedCommand.priceTicks;
  }
  let result;
  try {
    result = reduceDerivatives(
      next.derivatives,
      routedCommand,
    );
  } catch {
    return rejected(state, 'INVALID_DERIVATIVE_ACTION');
  }
  if (result.receipt.status !== 'applied') {
    return rejected(state, result.receipt.reason, {
      type: 'derivatives_action',
    });
  }
  next.derivatives = result.state;
  const afterAccount =
    next.derivatives.accounts.player;
  if (
    afterAccount.cashCents -
      afterAccount.reservedInitialMarginCents -
      afterAccount.reservedTransactionFeesCents <
    playerStockReservedCashCents(next)
  ) {
    return rejected(
      state,
      'INSUFFICIENT_SHARED_CASH',
    );
  }
  const reconciliation =
    reconcileDerivativePlayerAccount(
      next,
      beforeAccount,
      afterAccount,
    );
  if (!reconciliation.ok) {
    return rejected(state, reconciliation.reason);
  }
  if (
    routedSecurityCommand(routedCommand.type)
  ) {
    const quantity =
      routedCommand.type === 'BORROW_SECURITY'
        ? result.receipt.grantedQuantity ??
          result.receipt.quantity
        : result.receipt.quantity;
    const symbol = routedCommand.securityId;
    const borrowing =
      routedCommand.type === 'BORROW_SECURITY';
    next.player.holdings[symbol] =
      (next.player.holdings[symbol] ?? 0) +
      (borrowing ? quantity : -quantity);
    next.market.maker.holdings[symbol] =
      (next.market.maker.holdings[symbol] ?? 0) +
      (borrowing ? -quantity : quantity);
    securityTransfer = {
      symbol,
      from: borrowing
        ? next.market.maker.id
        : 'player',
      to: borrowing
        ? 'player'
        : next.market.maker.id,
      quantity,
    };
  }
  try {
    syncEmbeddedDerivatives(next, {
      atMs: authorityAtMs,
      source: routedSecurityCommand(
        routedCommand.type,
      )
        ? 'player_security_lending_custody_sync'
        : 'player_derivative_collateral_sync',
    });
  } catch {
    return rejected(
      state,
      'DERIVATIVE_SYNCHRONIZATION_FAILED',
    );
  }
  const positionQuantity =
    afterAccount.positions[
      routedCommand.contractId
    ]?.quantity ?? 0;
  const filledQuantity = (
    result.receipt.fills ?? []
  ).reduce((sum, fill) => sum + fill.quantity, 0);
  const derivativeContract =
    next.derivatives.universe.futures[
      routedCommand.contractId
    ] ??
    next.derivatives.universe.options[
      routedCommand.contractId
    ];
  const quantityUnit =
    result.receipt.quantityUnit ??
    derivativeContract?.quantityUnit ??
    null;
  const requestedQuantity =
    result.receipt.requestedQuantity ?? null;
  const remainingQuantity =
    result.receipt.remainingQuantity ?? 0;
  const effectiveRequestedAmountCents =
    requestedFinancingAmountCents ??
    result.receipt.requestedAmountCents ??
    null;
  const effectiveGrantedAmountCents =
    result.receipt.grantedAmountCents ?? null;
  const effectiveRemainingAmountCents =
    effectiveRequestedAmountCents === null ||
    effectiveGrantedAmountCents === null
      ? result.receipt.remainingAmountCents ?? null
      : effectiveRequestedAmountCents -
        effectiveGrantedAmountCents;
  const effectiveFinancingPartialReason =
    result.receipt.partialReason ??
    (
      routedCommand.type === 'DRAW_MARGIN_CREDIT' &&
      facilityAvailableFinancingCents !== null &&
      requestedFinancingAmountCents >
        facilityAvailableFinancingCents
        ? 'FINANCING_COLLATERAL_LIMIT'
        : null
    );
  const submitFeedback =
    remainingQuantity === 0
      ? `成交 ${filledQuantity} ${quantityUnit}。`
      : result.receipt.remainingReason ===
          'RESTING_IN_BOOK'
        ? filledQuantity > 0
          ? `成交 ${filledQuantity} ${quantityUnit}，剩余 ${remainingQuantity} ${quantityUnit} 已挂单。`
          : `委托已进入市场，待成交 ${remainingQuantity} ${quantityUnit}。`
        : filledQuantity > 0
          ? `成交 ${filledQuantity} ${quantityUnit}，剩余 ${remainingQuantity} ${quantityUnit} 因可成交对手盘不足已撤销。`
          : `未成交；当前可成交对手盘不足，剩余 ${remainingQuantity} ${quantityUnit} 已撤销。`;
  const feedback =
    routedCommand.type === 'ENABLE_PERMISSION'
      ? '交易权限已开通。'
      : routedCommand.type === 'DRAW_MARGIN_CREDIT'
        ? effectiveRemainingAmountCents > 0
          ? `融资到账 ${money(
              result.receipt.grantedAmountCents / 100,
            )} 元，剩余申请受授信或担保额度限制。`
          : '融资款已到账。'
      : routedCommand.type === 'REPAY_MARGIN_CREDIT'
          ? '融资款已归还。'
          : routedCommand.type === 'BORROW_SECURITY'
            ? `借入 ${result.receipt.grantedQuantity ?? result.receipt.quantity} 股已到账。`
            : routedCommand.type === 'RETURN_SECURITY'
              ? `归还 ${result.receipt.quantity} 股已完成。`
          : routedCommand.type === 'CANCEL_ORDER'
            ? '委托已撤销。'
            : submitFeedback;
  const event = recordDerivativeCashSettlement(
    next,
    reconciliation.cashDeltaCents,
    feedback,
    securityTransfer ? [securityTransfer] : [],
  );
  const receipt = {
    id: event.id,
    tick: next.world.tick,
    status: 'accepted',
    type: 'derivatives_action',
    commandType: routedCommand.type,
    contractId: routedCommand.contractId ?? null,
    orderId: result.receipt.orderId ?? null,
    filledQuantity,
    requestedQuantity:
      routedSecurityCommand(routedCommand.type)
        ? requestedSecurityQuantity
        : requestedQuantity,
    remainingQuantity:
      routedSecurityCommand(routedCommand.type)
        ? requestedSecurityQuantity -
          result.receipt.quantity
        : remainingQuantity,
    quantityUnit:
      routedSecurityCommand(routedCommand.type)
        ? '股'
        : quantityUnit,
    remainingReason:
      result.receipt.remainingReason ??
      result.receipt.partialReason ??
      (
        routedCommand.type === 'BORROW_SECURITY' &&
        facilityAvailableSecurityQuantity !== null &&
        requestedSecurityQuantity >
          facilityAvailableSecurityQuantity
          ? 'LENDING_COLLATERAL_LIMIT'
          :
        routedCommand.type === 'BORROW_SECURITY' &&
        requestedSecurityQuantity >
          custodyAvailableQuantity
          ? 'LENDING_SHARE_CUSTODY_LIMIT'
          : null
      ),
    positionQuantity,
    cashDeltaCents: reconciliation.cashDeltaCents,
    debtDeltaCents: reconciliation.debtDeltaCents,
    requestedAmountCents:
      effectiveRequestedAmountCents,
    grantedAmountCents:
      effectiveGrantedAmountCents,
    remainingAmountCents:
      effectiveRemainingAmountCents,
    partialReason:
      effectiveFinancingPartialReason,
    shortFeedback: feedback,
  };
  next.ui.lastReceipt = receipt;
  return { state: next, receipt };
}

export function createWorld(config = {}) {
  const roleType = ROLE_TYPES.includes(config.roleType)
    ? config.roleType
    : 'household';
  const strengthTier = STRENGTH_TIERS.includes(config.strengthTier)
    ? config.strengthTier
    : 'low';
  const seed = String(config.seed || 'LZY-DEFAULT-WORLD').trim() || 'LZY-DEFAULT-WORLD';
  const profile = PROFILE_TEMPLATES[roleType][strengthTier];
  const allocation = normalizeAllocation(config.allocation);
  const openingPlayerCash = money(profile.capital * allocation.cash);

  const companies = Object.fromEntries(
    COMPANY_TEMPLATES.map((template, index) => [
      template.id,
      createCompany(template, index),
    ]),
  );
  const securities = Object.fromEntries(
    COMPANY_TEMPLATES.map((template) => [
      template.symbol,
      createListedSecurity(template),
    ]),
  );
  const orderBooks = Object.fromEntries(
    COMPANY_TEMPLATES.map((template, index) => [
      template.symbol,
      makeOrderBook(template.openingPrice, index),
    ]),
  );
  const investors = createNpcInvestors(securities);
  const investorUnitsBySymbol = Object.fromEntries(
    Object.keys(securities).map((symbol) => [
      symbol,
      Object.values(investors).reduce(
        (sum, investor) =>
          sum + (investor.holdings[symbol] ?? 0),
        0,
      ),
    ]),
  );
  const economy = createEconomyState();
  for (const template of COMPANY_TEMPLATES) {
    const company = companies[template.id];
    const factId =
      `fact_genesis_financial_${template.symbol.toLowerCase()}`;
    company.publishedFinancialSnapshot = {
      asOfTick: 0,
      publishedAtMs: -SYNTHETIC_WORLD_DAY_MS,
      sourceFactId: factId,
      value: createPublishedFinancialValue(
        company,
        securities[template.symbol],
        economy,
      ),
    };
  }
  const socialCareer = createSocialCareerEcology({
    seed,
    roleType,
    strengthTier,
    worldTick: 0,
  });
  economy.cashPool = money(
    economy.cashPool - socialCareerCashTotal(socialCareer),
  );
  const playerLife = createLifeState(roleType, strengthTier);

  const state = {
    world: {
      id: `world_${hashString(`${seed}:${roleType}:${strengthTier}`).toString(16)}`,
      name: `历择衍 · ${seed.slice(0, 18)}`,
      seed,
      tick: 0,
      status: 'running',
      ruleVersion: RULE_VERSION,
      rngState: hashString(seed),
      sequence: 0,
      calendar: {
        year: 1,
        day: 1,
      },
      interfaceMode: ['novice', 'standard', 'expert'].includes(config.interfaceMode)
        ? config.interfaceMode
        : 'standard',
      tradingAccessMode:
        config.tradingAccessMode === 'testing_open'
          ? 'testing_open'
          : 'standard',
    },
    player: {
      id: 'player',
      profileId: `${roleType}_${strengthTier}`,
      roleType,
      roleLabel: PROFILE_TEMPLATES[roleType].label,
      profileName: profile.name,
      identity: PROFILE_TEMPLATES[roleType].identity,
      strengthTier,
      cash: openingPlayerCash,
      otherAssets: profile.otherAssets,
      liabilities: profile.liabilities,
      holdings: {},
      resources: {
        research: profile.research,
        researchMax: profile.research,
        attention: strengthTier === 'high' ? 8 : 5,
      },
      marketDataEntitlements: createMarketDataEntitlements(roleType),
      roleState: createRoleState(roleType, profile, openingPlayerCash),
      life: playerLife,
      commitments: [],
    },
    cityLife: createCityLifeState(
      roleType,
      strengthTier,
      0,
      getLifeProductCatalog(),
      {},
      playerLife.possessions,
    ),
    socialCareer,
    entities: {
      companies,
      investors,
    },
    economy,
    market: {
      venue: '历择交易所',
      stockUniverseVersion: STOCK_UNIVERSE_VERSION,
      securities,
      orderBooks,
      orders: [],
      trades: [],
      maker: {
        id: 'npc_liquidity_pool',
        cash: 50_000_000_000,
        holdings: Object.fromEntries(
          COMPANY_TEMPLATES.map((template) => [
            template.symbol,
            securities[template.symbol].outstandingUnits -
              investorUnitsBySymbol[template.symbol],
          ]),
        ),
      },
      exchangeFeePool: 0,
      marketDataProducts: clone(MARKET_DATA_PRODUCTS),
    },
    clues: createGenesisClues(),
    facts: [
      ...COMPANY_TEMPLATES.map((template) => {
        const company = companies[template.id];
        return {
          id: `fact_genesis_financial_${template.symbol.toLowerCase()}`,
          tick: 0,
          publishedAtMs: -SYNTHETIC_WORLD_DAY_MS,
          authority: 'world_fact',
          type: 'company_financial_report',
          entityId: template.id,
        summary: `${template.name} 发布上一期财务数据。`,
          value: clone(
            company.publishedFinancialSnapshot.value,
          ),
          visibility: 'public',
          confidence: 1,
        };
      }),
      {
        id: 'fact_genesis_inventory',
        tick: 0,
        authority: 'world_fact',
        type: 'company_inventory',
        entityId: 'company_river_equipment',
        summary: '澄川装备开局库存为 280 单位。',
        value: 280,
        visibility: 'public',
        confidence: 1,
      },
      {
        id: 'fact_genesis_demand',
        tick: 0,
        authority: 'world_fact',
        type: 'signed_orders',
        entityId: 'company_horizon_systems',
        summary: '岚序系统已签订单没有翻倍，仍处正常区间。',
        value: 38,
        visibility: 'restricted_until_verified',
        confidence: 1,
      },
      {
        id: 'fact_genesis_receivables',
        tick: 0,
        authority: 'world_fact',
        type: 'company_receivables',
        entityId: 'company_aurora_materials',
        summary: '曙原材料应收账款高于上个经营周期。',
        value: companies.company_aurora_materials.receivables,
        visibility: 'public',
        confidence: 1,
      },
    ],
    memories: [],
    narratives: [
      {
        id: 'narrative_genesis',
        factId: 'fact_genesis_receivables',
        tick: 0,
        authority: 'interpretation',
        perspective: 'market_commentator',
        text: '曙原应收上升引发市场分歧：扩张预期与回款担忧并存。',
      },
    ],
    ledger: [],
    eventLog: [
      {
        id: 'event_genesis',
        type: 'world_created',
        tick: 0,
        effectiveAt: 0,
        actorId: 'world_system',
        authority: 'rule_engine',
        affectedEntities: ['player', ...Object.keys(companies)],
        preconditions: [],
        ruleVersion: RULE_VERSION,
        seedRef: `${seed}:${hashString(seed)}`,
        parentIds: [],
        ledgerEntryIds: [],
        visibility: 'public',
        status: 'settled',
        correctionRef: null,
        summary: '临江市证券市场今日开市。',
      },
    ],
    replay: [],
    historyArchive: {
      format: 'rolling-digest-v1',
      blocks: [],
      totalArchived: 0,
      referenceIndex: {},
    },
    accounting: {
      initialTotalCash: 0,
      initialSecurityUnits: Object.fromEntries(
        COMPANY_TEMPLATES.map((template) => [
          template.symbol,
          securities[template.symbol].outstandingUnits,
        ]),
      ),
      currentSecurityUnits: Object.fromEntries(
        COMPANY_TEMPLATES.map((template) => [
          template.symbol,
          securities[template.symbol].outstandingUnits,
        ]),
      ),
      securityIssuanceLedger: [],
    },
    ui: {
      activeView: 'today',
      lastReceipt: null,
      savedAt: null,
    },
  };

  state.eventLog[0].factIds = state.facts.map(
    (fact) => fact.id,
  );

  state.worldline = advanceWorldlineState(
    createWorldlineState({
      worldId: state.world.id,
      worldSeed: state.world.seed,
    }),
    state.eventLog[0],
    { mutate: true },
  );

  synchronizeLifeLocations(
    state.player.life,
    state.cityLife,
    LIFE_ITEM_BY_ID,
  );
  synchronizeSocialCareerProjection(state);
  const equityBudget = profile.capital * allocation.equity;
  state.player.holdings = initializeHoldings(state, equityBudget);
  state.accounting.playerInitialEquivalentCapitalCents =
    Math.round(
      (
        state.player.cash +
        state.player.otherAssets -
        state.player.liabilities
      ) * 100,
    ) +
    Object.entries(state.player.holdings).reduce(
      (sum, [symbol, quantity]) =>
        sum +
        quantity *
          Math.round(
            Number(
              state.market.securities[symbol].lastPrice,
            ) * 100,
          ),
      0,
    );
  state.accounting.playerDayStartEquivalentCapitalCents =
    state.accounting.playerInitialEquivalentCapitalCents;
  state.accounting.playerDayStartTick = 0;
  state.derivatives = createEmbeddedDerivatives(state);
  syncEmbeddedDerivatives(state);
  if (roleType === 'institution') {
    state.player.roleState.concentration =
      calculateInstitutionConcentration(state);
  }
  const totalCash =
    state.player.cash +
    state.market.maker.cash +
    state.market.exchangeFeePool +
    state.economy.cashPool +
    socialCareerCashTotal(state.socialCareer) +
    Object.values(state.entities.investors).reduce(
      (sum, investor) => sum + investor.cash,
      0,
    ) +
    Object.values(state.entities.companies).reduce(
      (sum, company) => sum + company.cash,
      0,
  );
  state.accounting.initialTotalCash = money(totalCash);
  const openingJournal = genesisJournal(
    state,
    state.accounting.initialTotalCash,
  );
  openingJournal.securityTransfers = Object.keys(securities).flatMap(
    (symbol) => [
      {
        symbol,
        from: 'world_opening_security_account',
        to: state.market.maker.id,
        quantity: state.market.maker.holdings[symbol],
      },
      ...Object.values(state.entities.investors).map((investor) => ({
        symbol,
        from: 'world_opening_security_account',
        to: investor.id,
        quantity: investor.holdings[symbol],
      })),
      {
        symbol,
        from: 'world_opening_security_account',
        to: 'player',
        quantity: state.player.holdings[symbol],
      },
    ],
  );
  state.ledger.push(openingJournal);
  state.eventLog[0].ledgerEntryIds = [openingJournal.id];
  state.memories = [
    {
      id: 'memory_genesis_market',
      factId: 'fact_genesis_receivables',
      ownerId: 'public_market',
      content: '曙原回款争议仍在市场流传。',
      salience: 0.55,
      accuracyState: 'anchored',
      createdTick: 0,
      lastRecalledTick: 0,
      decay: 0.015,
      visibility: 'public',
    },
  ];
  synchronizeWorldValuations(state);
  return state;
}

function rejected(state, reason, details = {}) {
  return {
    state,
    receipt: {
      id: null,
      tick: state.world.tick,
      status: 'rejected',
      reason,
      ...details,
    },
  };
}

function playerOrderIdFromRealtimeTrade(trade) {
  if (
    trade?.source !== 'realtime_order_book' ||
    !Array.isArray(trade.orderIds) ||
    trade.orderIds.length < 2
  ) {
    return null;
  }
  if (trade.buyerId === 'player') return trade.orderIds[0] ?? null;
  if (trade.sellerId === 'player') return trade.orderIds[1] ?? null;
  return null;
}

function recordOrderCommitment(state, action) {
  const orderId = String(action.orderId ?? '').trim();
  if (!orderId) return rejected(state, 'ORDER_ID_REQUIRED');
  const order = (state.market.orders ?? []).find(
    (candidate) => candidate.id === orderId,
  );
  const matchingPlayerTrades = (state.market.trades ?? []).filter(
    (trade) => playerOrderIdFromRealtimeTrade(trade) === orderId,
  );
  if (!order && matchingPlayerTrades.length === 0) {
    const knownAsCounterpartyOrder = (state.market.trades ?? []).some(
      (trade) =>
        trade?.source === 'realtime_order_book' &&
        Array.isArray(trade.orderIds) &&
        trade.orderIds.includes(orderId),
    );
    if (knownAsCounterpartyOrder) {
      return rejected(state, 'ORDER_NOT_OWNED', { orderId });
    }
    return rejected(state, 'ORDER_NOT_FOUND', { orderId });
  }
  if (
    order &&
    order.ownerId !== 'player' &&
    order.actorId !== 'player'
  ) {
    return rejected(state, 'ORDER_NOT_OWNED', { orderId });
  }
  const requestedTradeIds =
    action.tradeIds === undefined
      ? matchingPlayerTrades.map((trade) => trade.id)
      : action.tradeIds;
  if (
    !Array.isArray(requestedTradeIds) ||
    requestedTradeIds.some(
      (tradeId) => typeof tradeId !== 'string' || !tradeId.trim(),
    )
  ) {
    return rejected(state, 'INVALID_TRADE_IDS', { orderId });
  }
  const tradeById = new Map(
    (state.market.trades ?? []).map((trade) => [trade.id, trade]),
  );
  const anchoredTrades = [];
  for (const tradeId of requestedTradeIds) {
    const trade = tradeById.get(tradeId);
    if (!trade) {
      return rejected(state, 'TRADE_NOT_FOUND', { orderId, tradeId });
    }
    if (playerOrderIdFromRealtimeTrade(trade) !== orderId) {
      return rejected(state, 'TRADE_ORDER_MISMATCH', {
        orderId,
        tradeId,
      });
    }
    anchoredTrades.push(trade);
  }
  const eventById = new Map(
    (state.eventLog ?? []).map((event) => [event.id, event]),
  );
  const factById = new Map(
    (state.facts ?? []).map((fact) => [fact.id, fact]),
  );
  for (const trade of anchoredTrades) {
    const tradeEvent = eventById.get(trade.eventId);
    const tradeFact = factById.get(trade.factId);
    if (
      !tradeEvent ||
      tradeEvent.type !== 'realtime_market_trade' ||
      tradeEvent.status !== 'settled' ||
      !tradeFact ||
      tradeFact.type !== 'realtime_market_fill'
    ) {
      return rejected(state, 'TRADE_ANCHOR_INCOMPLETE', {
        orderId,
        tradeId: trade.id,
      });
    }
    if (tradeFact.eventId !== tradeEvent.id) {
      return rejected(state, 'TRADE_ANCHOR_MISMATCH', {
        orderId,
        tradeId: trade.id,
      });
    }
  }
  const tradeIds = [...new Set(anchoredTrades.map((trade) => trade.id))];
  const anchorEventIds = [
    ...new Set(anchoredTrades.map((trade) => trade.eventId).filter(Boolean)),
  ];
  const factIds = [
    ...new Set(anchoredTrades.map((trade) => trade.factId).filter(Boolean)),
  ];
  const evidenceClueId = String(action.evidenceClueId ?? '').trim() || null;
  if (
    evidenceClueId &&
    !state.clues.some((clue) => clue.id === evidenceClueId)
  ) {
    return rejected(state, 'CLUE_NOT_FOUND', {
      orderId,
      evidenceClueId,
    });
  }

  const next = clone(state);
  const symbol = order?.symbol ?? anchoredTrades[0]?.symbol;
  const judgment = String(action.judgment ?? '').trim().slice(0, 240);
  const updateCondition = String(action.updateCondition ?? '')
    .trim()
    .slice(0, 240);
  const event = addEvent(next, {
    type: 'order_commitment_recorded',
    actorId: 'player',
    authority: 'player_decision_record',
    affectedEntities: [
      'player',
      next.market.securities[symbol]?.issuerId,
    ].filter(Boolean),
    preconditions: [orderId, ...tradeIds],
    parentIds: anchorEventIds,
    visibility: 'player',
    summary:
      tradeIds.length > 0
        ? `订单 ${orderId} 的交易备忘已归档，关联 ${tradeIds.length} 笔成交。`
        : `订单 ${orderId} 的交易备忘已归档，暂无成交。`,
  });
  const commitment = {
    id: nextId(next, 'commitment'),
    tick: next.world.tick,
    orderId,
    tradeIds,
    anchorEventIds,
    factIds,
    actionEventId: event.id,
    judgment,
    evidenceClueId,
    updateCondition,
    status: 'recorded',
  };
  next.player.commitments.push(commitment);
  const receipt = {
    id: event.id,
    tick: next.world.tick,
    status: 'accepted',
    type: 'order_commitment_recorded',
    commitmentId: commitment.id,
    orderId,
    tradeIds,
    anchorEventIds,
    factIds,
    shortFeedback: '交易备忘已归档。',
    longFeedback: '订单、成交和账户状态未变。',
  };
  next.replay.push({
    id: nextId(next, 'replay'),
    tick: next.world.tick,
    actionEventId: event.id,
    factId: factIds[0] ?? null,
    factIds,
    orderId,
    tradeIds,
    process: {
      type: 'record_order_commitment',
      judgment,
      evidenceClueId,
      updateCondition,
    },
    result: receipt.shortFeedback,
    unknown:
      tradeIds.length > 0
        ? '关联成交已经结算。'
        : '该订单暂无成交。',
  });
  next.ui.lastReceipt = receipt;
  return { state: next, receipt };
}

function verifyClue(state, action) {
  const index = state.clues.findIndex((clue) => clue.id === action.clueId);
  if (index < 0) return rejected(state, 'CLUE_NOT_FOUND');
  const clue = state.clues[index];
  if (clue.status === 'verified') return rejected(state, 'ALREADY_VERIFIED');
  if (state.player.resources.research < clue.verificationCost) {
    return rejected(state, 'INSUFFICIENT_RESEARCH');
  }
  const next = clone(state);
  next.player.resources.research -= clue.verificationCost;
  next.clues[index] = {
    ...next.clues[index],
    status: 'verified',
    verdict: clue.truthState,
    verifiedTick: next.world.tick,
  };
  const event = addEvent(next, {
    type: 'clue_verified',
    actorId: 'player',
    authority: 'player_research',
    affectedEntities: [clue.companyId],
    visibility: 'player',
    summary: `调查完成：${clue.title}`,
  });
  const receipt = {
    id: event.id,
    tick: next.world.tick,
    status: 'accepted',
    type: 'clue_verified',
    clueId: clue.id,
    verdict: clue.truthState,
    researchSpent: clue.verificationCost,
    shortFeedback: `调查结果：${verdictLabel(clue.truthState)}。`,
    longFeedback: '线索状态已更新；账户和行情未变。',
  };
  next.ui.lastReceipt = receipt;
  return { state: next, receipt };
}

function verdictLabel(verdict) {
  return {
    supported: '属实',
    refuted: '不实',
    inconclusive: '待定',
  }[verdict] ?? verdict;
}

function tradeFee(gross) {
  return money(Math.max(0.05, gross * 0.0005));
}

function calculateInstitutionConcentration(state) {
  if (state.player.roleType !== 'institution') return 0;
  const denominator = Math.max(
    1,
    state.player.roleState.assetsUnderManagement,
  );
  const positionValues = Object.entries(state.player.holdings).map(
    ([symbol, units]) =>
      units * (state.market.securities[symbol]?.lastPrice ?? 0),
  );
  return Number(
    clamp(Math.max(0, ...positionValues) / denominator, 0, 1).toFixed(6),
  );
}

function availableTradingCash(state) {
  if (state.player.roleType === 'household') {
    return Math.max(
      0,
      state.player.cash - state.player.roleState.cashReserve,
    );
  }
  if (state.player.roleType === 'institution') {
    return Math.max(
      0,
      state.player.cash - state.player.roleState.liquidityReserveFloor,
    );
  }
  return state.player.cash;
}

function placeOrder(state, action) {
  const side = action.side;
  const symbol = action.symbol;
  const quantity = Math.floor(Number(action.quantity));
  const limitPrice = Number(action.limitPrice);
  if (!['buy', 'sell'].includes(side)) return rejected(state, 'INVALID_SIDE');
  if (!state.market.orderBooks[symbol]) return rejected(state, 'UNKNOWN_SECURITY');
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return rejected(state, 'INVALID_QUANTITY');
  }
  if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
    return rejected(state, 'INVALID_LIMIT_PRICE');
  }
  if (side === 'sell' && (state.player.holdings[symbol] ?? 0) < quantity) {
    return rejected(state, 'INSUFFICIENT_HOLDINGS');
  }

  const sourceLevels =
    side === 'buy'
      ? state.market.orderBooks[symbol].asks
      : state.market.orderBooks[symbol].bids;
  const eligible = sourceLevels.filter((level) =>
    side === 'buy' ? level.price <= limitPrice : level.price >= limitPrice,
  );
  if (eligible.length === 0) return rejected(state, 'NO_MARKET_AT_LIMIT');

  const tradingCash = availableTradingCash(state);
  const maximumGross =
    side === 'buy'
      ? Math.max(0, (tradingCash - 0.05) / 1.0005)
      : Number.POSITIVE_INFINITY;
  if (side === 'buy' && maximumGross <= 0) {
    return rejected(state, 'INSUFFICIENT_CASH');
  }

  let remaining = quantity;
  let plannedGross = 0;
  const fills = [];
  for (const level of eligible) {
    if (remaining <= 0) break;
    const cashLimitedQuantity =
      side === 'buy'
        ? Math.max(
            0,
            Math.floor((maximumGross - plannedGross) / level.price),
          )
        : remaining;
    const filled = Math.min(
      remaining,
      level.quantity,
      cashLimitedQuantity,
    );
    if (filled > 0) {
      fills.push({ price: level.price, quantity: filled });
      remaining -= filled;
      plannedGross += filled * level.price;
    }
  }
  const filledQuantity = fills.reduce((sum, fill) => sum + fill.quantity, 0);
  if (filledQuantity === 0) return rejected(state, 'NO_LIQUIDITY');

  const next = clone(state);
  const bookSide =
    side === 'buy'
      ? next.market.orderBooks[symbol].asks
      : next.market.orderBooks[symbol].bids;
  let toConsume = filledQuantity;
  for (let index = 0; index < bookSide.length && toConsume > 0; ) {
    const consumed = Math.min(toConsume, bookSide[index].quantity);
    bookSide[index].quantity -= consumed;
    toConsume -= consumed;
    if (bookSide[index].quantity === 0) bookSide.splice(index, 1);
    else index += 1;
  }

  const grossAmount = money(
    fills.reduce((sum, fill) => sum + fill.price * fill.quantity, 0),
  );
  const fee = tradeFee(grossAmount);
  const averagePrice = price(grossAmount / filledQuantity);
  const bestPrice = eligible[0].price;
  const consumedLevels = fills.length;
  const marketImpactBps = Math.round(
    Math.abs(averagePrice / bestPrice - 1) * 10_000 +
      Math.max(0, consumedLevels - 1) * 4 +
      filledQuantity * 0.12,
  );

  if (side === 'buy') {
    next.player.cash = money(next.player.cash - grossAmount - fee);
    next.market.maker.cash = money(next.market.maker.cash + grossAmount);
    next.market.exchangeFeePool = money(next.market.exchangeFeePool + fee);
    next.player.holdings[symbol] =
      (next.player.holdings[symbol] ?? 0) + filledQuantity;
    next.market.maker.holdings[symbol] -= filledQuantity;
  } else {
    if (next.market.maker.cash < grossAmount) {
      return rejected(state, 'COUNTERPARTY_CASH_SHORTFALL');
    }
    next.player.cash = money(next.player.cash + grossAmount - fee);
    next.market.maker.cash = money(next.market.maker.cash - grossAmount);
    next.market.exchangeFeePool = money(next.market.exchangeFeePool + fee);
    next.player.holdings[symbol] -= filledQuantity;
    next.market.maker.holdings[symbol] += filledQuantity;
  }

  const security = next.market.securities[symbol];
  security.lastPrice = fills.at(-1).price;
  security.priceHistory.push({
    tick: next.world.tick,
    price: security.lastPrice,
    source: 'matched_player_order',
  });
  const trades = fills.map((fill) => {
    const trade = {
      id: nextId(next, 'trade'),
      tick: next.world.tick,
      symbol,
      side,
      buyerId: side === 'buy' ? 'player' : next.market.maker.id,
      sellerId: side === 'sell' ? 'player' : next.market.maker.id,
      price: fill.price,
      quantity: fill.quantity,
      source: 'matched_orders',
    };
    next.market.trades.push(trade);
    return trade;
  });

  const journal = addJournal(next, {
    type: 'secondary_trade_settlement',
    description: `${side === 'buy' ? '买入' : '卖出'} ${symbol} 结算`,
    postings:
      side === 'buy'
        ? [
            {
              account: 'player.cash',
              debit: 0,
              credit: money(grossAmount + fee),
            },
            {
              account: 'market_maker.cash',
              debit: grossAmount,
              credit: 0,
            },
            {
              account: 'exchange.fee_pool',
              debit: fee,
              credit: 0,
            },
          ]
        : [
            {
              account: 'player.cash',
              debit: money(grossAmount - fee),
              credit: 0,
            },
            {
              account: 'exchange.fee_pool',
              debit: fee,
              credit: 0,
            },
            {
              account: 'market_maker.cash',
              debit: 0,
              credit: grossAmount,
            },
          ],
    securityTransfers: [
      {
        symbol,
        from: side === 'buy' ? next.market.maker.id : 'player',
        to: side === 'buy' ? 'player' : next.market.maker.id,
        quantity: filledQuantity,
      },
    ],
  });
  const event = addEvent(next, {
    type: 'market_trade',
    actorId: 'player',
    authority: 'market_matching',
    affectedEntities: [security.issuerId, 'player', next.market.maker.id],
    ledgerEntryIds: [journal.id],
    summary: `${symbol} ${filledQuantity} 股以均价 ${averagePrice} 完成结算。`,
  });
  journal.eventId = event.id;
  for (const trade of trades) {
    trade.eventId = event.id;
  }
  const fact = addFact(next, {
    type: 'matched_trade',
    entityId: security.issuerId,
    eventId: event.id,
    summary: `${symbol} 出现有效撮合：${filledQuantity} 股，均价 ${averagePrice}。`,
    value: {
      symbol,
      side,
      quantity: filledQuantity,
      averagePrice,
    },
  });
  addMemory(next, fact, {
    ownerId: 'public_market',
    content:
      filledQuantity > 20
        ? `市场参与者记住了 ${symbol} 的大额成交与盘口消耗。`
        : `市场参与者注意到 ${symbol} 的一笔普通成交。`,
    salience: clamp(0.35 + marketImpactBps / 200, 0.35, 0.95),
  });

  if (action.commit && typeof action.commit === 'object') {
    next.player.commitments.push({
      id: nextId(next, 'commitment'),
      tick: next.world.tick,
      actionEventId: event.id,
      ...clone(action.commit),
    });
  }

  if (next.player.roleType === 'institution') {
    const totalDepth = sourceLevels.reduce(
      (sum, level) => sum + level.quantity,
      0,
    );
    const depthShare = filledQuantity / Math.max(1, totalDepth);
    next.player.roleState.marketAttention = Number(
      (
        next.player.roleState.marketAttention +
        depthShare * 10 +
        marketImpactBps / 100
      ).toFixed(4),
    );
    next.player.roleState.concentration =
      calculateInstitutionConcentration(next);
  }

  const requestedRemainder = quantity - filledQuantity;
  const status = requestedRemainder === 0 ? 'filled' : 'partial';
  const receipt = {
    id: event.id,
    tick: next.world.tick,
    status,
    type: 'trade',
    side,
    symbol,
    requestedQuantity: quantity,
    filledQuantity,
    remainingQuantity: requestedRemainder,
    grossAmount,
    fee,
    averagePrice,
    marketImpactBps,
    trades,
    factId: fact.id,
    shortFeedback: `${side === 'buy' ? '买入' : '卖出'}成交 ${filledQuantity}/${quantity} 股，均价 ${averagePrice}。`,
    longFeedback:
      marketImpactBps >= 15
        ? '订单消耗了多档流动性，市场会记住这次可见冲击。'
        : '订单已按当前盘口结算。',
  };
  next.replay.push({
    id: nextId(next, 'replay'),
    tick: next.world.tick,
    actionEventId: event.id,
    factId: fact.id,
    process: action.commit ?? null,
    result: receipt.shortFeedback,
    unknown: '关联成交已经结算。',
  });
  next.ui.lastReceipt = receipt;
  return { state: next, receipt };
}

function roleAction(state, action) {
  const expected = ROLE_ACTIONS[state.player.roleType];
  if (action.command !== expected) {
    return rejected(state, 'ROLE_NOT_AUTHORIZED', {
      expectedCommand: expected,
    });
  }
  const next = clone(state);
  let summary = '';
  let extra = {};

  if (action.command === 'set_reserve') {
    const amount = money(Number(action.amount));
    if (!Number.isFinite(amount) || amount < 0 || amount > next.player.cash) {
      return rejected(state, 'INVALID_RESERVE');
    }
    next.player.roleState.cashReserve = amount;
    summary = `家庭现金储备边界调整为 ${amount}。`;
  }

  if (action.command === 'record_dissent') {
    if (!state.clues.some((clue) => clue.id === action.clueId)) {
      return rejected(state, 'CLUE_NOT_FOUND');
    }
    const thesis = String(action.thesis || '').trim();
    const updateCondition = String(action.updateCondition || '').trim();
    if (!thesis || !updateCondition) {
      return rejected(state, 'DISSENT_REQUIRES_THESIS_AND_UPDATE_CONDITION');
    }
    const entry = {
      id: nextId(next, 'dissent'),
      tick: next.world.tick,
      clueId: action.clueId,
      thesis: thesis.slice(0, 240),
      updateCondition: updateCondition.slice(0, 240),
      status: 'preserved',
    };
    next.player.roleState.dissentLog.push(entry);
    summary = '异议与更新条件已作为职业记录保留。';
    extra = { dissent: entry };
  }

  if (action.command === 'schedule_production') {
    const companyId = next.player.roleState.controlledCompanyId;
    if (action.companyId && action.companyId !== companyId) {
      return rejected(state, 'NO_CONTROL_AUTHORITY');
    }
    const units = Math.floor(Number(action.units));
    if (!Number.isFinite(units) || units <= 0) {
      return rejected(state, 'INVALID_PRODUCTION_UNITS');
    }
    const company = next.entities.companies[companyId];
    const authorityLimit = Math.max(
      1,
      Math.floor(
        company.capacity *
          (0.45 + next.player.roleState.operatingAuthority),
      ),
    );
    const maximumAdditional = Math.max(
      0,
      Math.min(
        authorityLimit,
        company.capacity - company.operations.plannedProduction,
      ),
    );
    if (units > maximumAdditional) {
      return rejected(state, 'AUTHORITY_CAPACITY_LIMIT', {
        maximumUnits: maximumAdditional,
      });
    }
    const reservedCash = money(
      units *
        company.operations.unitCost *
        company.financials.economicUnitScale,
    );
    const availableCash = company.cash - company.operations.reservedCash;
    if (reservedCash > availableCash) {
      return rejected(state, 'COMPANY_CASH_CONSTRAINED');
    }
    company.operations.plannedProduction += units;
    company.operations.reservedCash = money(
      company.operations.reservedCash + reservedCash,
    );
    summary = `已排产 ${units} 单位，并锁定经营现金 ${reservedCash}。`;
    extra = { companyId, units, reservedCash };
  }

  if (action.command === 'set_liquidity_buffer') {
    const ratio = Number(action.ratio);
    if (!Number.isFinite(ratio) || ratio < 0.1 || ratio > 0.65) {
      return rejected(state, 'INVALID_LIQUIDITY_BUFFER');
    }
    next.player.roleState.liquidityBufferRatio = Number(ratio.toFixed(4));
    next.player.roleState.liquidityReserveFloor = money(
      next.player.roleState.liquidityBaseCash * ratio,
    );
    summary = `机构流动性缓冲目标调整为 ${(ratio * 100).toFixed(0)}%。`;
  }

  const event = addEvent(next, {
    type: `role_${action.command}`,
    actorId: 'player',
    authority: `${state.player.roleType}_role_contract`,
    affectedEntities:
      action.command === 'schedule_production'
        ? [next.player.roleState.controlledCompanyId]
        : ['player'],
    visibility: action.command === 'record_dissent' ? 'private' : 'public',
    summary,
  });
  const fact = addFact(next, {
    type: `role_action_${action.command}`,
    eventId: event.id,
    entityId:
      action.command === 'schedule_production'
        ? next.player.roleState.controlledCompanyId
        : 'player',
    summary,
    visibility: action.command === 'record_dissent' ? 'private' : 'public',
  });
  addMemory(next, fact, {
    ownerId:
      action.command === 'record_dissent'
        ? 'player_professional_record'
        : 'affected_network',
    visibility: fact.visibility,
    salience: 0.58,
  });
  const receipt = {
    id: event.id,
    tick: next.world.tick,
    status: 'accepted',
    type: 'role_action',
    command: action.command,
    factId: fact.id,
    shortFeedback: summary,
    longFeedback: roleLongFeedback(action.command),
    ...extra,
  };
  next.ui.lastReceipt = receipt;
  next.replay.push({
    id: nextId(next, 'replay'),
    tick: next.world.tick,
    actionEventId: event.id,
    factId: fact.id,
    process: { command: action.command },
    result: summary,
    unknown: roleLongFeedback(action.command),
  });
  return { state: next, receipt };
}

function roleLongFeedback(command) {
  return {
    set_reserve: '储备边界与可交易现金已同步。',
    record_dissent: '职业备忘已归档。',
    schedule_production: '新增排产与锁定现金已写入企业账簿。',
    set_liquidity_buffer: '缓冲目标与可配置现金已同步。',
  }[command];
}

function addNarrative(state, action) {
  const fact = state.facts.find((candidate) => candidate.id === action.factId);
  if (!fact) return rejected(state, 'FACT_NOT_FOUND');
  const next = clone(state);
  const narrative = {
    id: nextId(next, 'narrative'),
    factId: fact.id,
    tick: next.world.tick,
    authority: 'interpretation',
    perspective: String(action.perspective || 'player'),
    text: String(action.text || '').slice(0, 500),
  };
  next.narratives.push(narrative);
  const event = addEvent(next, {
    type: 'narrative_added',
    actorId: 'player',
    authority: 'interpretive_layer',
    affectedEntities: [fact.entityId ?? 'world'],
    parentIds: [fact.eventId].filter(Boolean),
    worldlineEligible: false,
    visibility: 'player',
    summary: '一条市场观察已保存。',
  });
  const receipt = {
    id: event.id,
    tick: next.world.tick,
    status: 'accepted',
    type: 'narrative_added',
    narrativeId: narrative.id,
    factId: fact.id,
    shortFeedback: '档案说明已保存。',
    longFeedback: '事件、成交和账户状态未变。',
  };
  next.ui.lastReceipt = receipt;
  return { state: next, receipt };
}

function holdAction(state, action) {
  const next = clone(state);
  const event = addEvent(next, {
    type: 'player_hold',
    actorId: 'player',
    authority: 'player_decision',
    affectedEntities: ['player'],
    visibility: 'player',
    summary: String(action.thesis || '玩家选择暂不行动。').slice(0, 240),
  });
  const receipt = {
    id: event.id,
    tick: next.world.tick,
    status: 'accepted',
    type: 'hold',
    shortFeedback: '暂不行动。',
    longFeedback: '现金与持仓未变。',
  };
  next.ui.lastReceipt = receipt;
  next.replay.push({
    id: nextId(next, 'replay'),
    tick: next.world.tick,
    actionEventId: event.id,
    factId: null,
    process: { thesis: action.thesis ?? null },
    result: receipt.shortFeedback,
    unknown: '稍后仍可改变决定。',
  });
  return { state: next, receipt };
}

function activateMarketData(state, action) {
  const actorId = action.actorId ?? 'player';
  if (actorId !== 'player') {
    return rejected(state, 'ACTOR_NOT_AUTHORIZED', { actorId });
  }
  const productId = String(action.productId ?? '');
  const product = state.market.marketDataProducts?.[productId];
  if (!product) {
    return rejected(state, 'MARKET_DATA_PRODUCT_NOT_FOUND', {
      productId,
    });
  }
  const entitlement = getMarketDataEntitlement(state, productId);
  if (!entitlement?.eligible) {
    return rejected(state, 'MARKET_DATA_NOT_ELIGIBLE', {
      productId,
    });
  }
  if (entitlement.status === 'active') {
    return rejected(state, 'MARKET_DATA_ALREADY_ACTIVE', {
      productId,
      expiresAtTick: entitlement.expiresAtTick,
    });
  }
  const cost = money(product.costCents / 100);
  const totalCashCents = Math.round(state.player.cash * 100);
  const availableCashCents =
    Number.isSafeInteger(action.availableCashCents) &&
    action.availableCashCents >= 0
      ? Math.min(totalCashCents, action.availableCashCents)
      : Math.max(
          0,
          totalCashCents -
            playerDerivativeReservedCashCents(state),
        );
  if (availableCashCents < product.costCents) {
    return rejected(state, 'INSUFFICIENT_CASH', {
      productId,
      requiredCents: product.costCents,
      availableCents: availableCashCents,
    });
  }

  const next = clone(state);
  const activatedAtTick = next.world.tick;
  const expiresAtTick =
    activatedAtTick + product.termWorldDays;
  next.player.cash = money(next.player.cash - cost);
  next.market.exchangeFeePool = money(
    next.market.exchangeFeePool + cost,
  );
  next.player.marketDataEntitlements[productId] = {
    status: 'active',
    eligible: true,
    activatedAtTick,
    expiresAtTick,
    source: 'player_purchase',
  };
  const journal = addJournal(next, {
    type: 'market_data_subscription',
    description: `${product.name} 开通结算`,
    postings: [
      {
        account: 'exchange.data_service_pool',
        debit: cost,
        credit: 0,
      },
      {
        account: 'player.cash',
        debit: 0,
        credit: cost,
      },
    ],
  });
  const event = addEvent(next, {
    type: 'market_data_activated',
    actorId: 'player',
    authority: 'exchange_market_data_service',
    affectedEntities: ['player', next.market.venue],
    preconditions: [productId],
    ledgerEntryIds: [journal.id],
    visibility: 'player',
    summary: `${product.name} 已开通至世界日 ${expiresAtTick}。`,
  });
  journal.eventId = event.id;
  const receipt = {
    id: event.id,
    tick: next.world.tick,
    status: 'accepted',
    type: 'market_data_activated',
    productId,
    costCents: product.costCents,
    activatedAtTick,
    expiresAtTick,
    shortFeedback: `${product.name} 已开通。`,
    longFeedback: `可查看百档买卖盘，有效至世界日 ${expiresAtTick}。`,
  };
  next.replay.push({
    id: nextId(next, 'replay'),
    tick: next.world.tick,
    actionEventId: event.id,
    factId: null,
    process: {
      type: 'activate_market_data',
      productId,
      costCents: product.costCents,
      activatedAtTick,
      expiresAtTick,
    },
    result: receipt.shortFeedback,
    unknown: '可查看当时仍有效的百档委托。',
  });
  next.ui.lastReceipt = receipt;
  return { state: next, receipt };
}

function lifeAction(state, action) {
  const command = String(action.command ?? '');
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
    ].includes(command)
  ) {
    return rejected(state, 'UNKNOWN_LIFE_ACTION');
  }

  const next = clone(state);
  const life = ensureLifeState(next);
  const city = next.cityLife;
  const mode = String(action.mode ?? '');
  const possession = life.possessions.find(
    (candidate) =>
      candidate.instanceId === String(action.instanceId ?? ''),
  );
  const item =
    possession
      ? LIFE_ITEM_BY_ID[possession.itemId]
      : LIFE_ITEM_BY_ID[String(action.itemId ?? '')];
  if (
    !['rest', 'work_shift', 'settle_obligations'].includes(command) &&
    !item &&
    !(command === 'buy_item' && mode === 'settle_upkeep')
  ) {
    return rejected(state, 'LIFE_ITEM_NOT_FOUND');
  }
  let event;
  let summary;
  let journal = null;
  let cost = 0;
  let income = 0;
  let instanceId = possession?.instanceId ?? null;

  const availableCash =
    Number.isSafeInteger(action.availableCashCents) &&
    action.availableCashCents >= 0
      ? Math.min(
          next.player.cash,
          action.availableCashCents / 100,
        )
      : Math.max(
          0,
          next.player.cash -
            playerDerivativeReservedCashCents(next) / 100,
        );
  const settlePurchase = (amount, type, description) => {
    next.player.cash = money(next.player.cash - amount);
    next.economy.cashPool = money(
      next.economy.cashPool + amount,
    );
    return addJournal(next, {
      type,
      description,
      postings: [
        {
          account: 'economy.local_retail_pool',
          debit: amount,
          credit: 0,
        },
        {
          account: city.role.payerAccount,
          debit: 0,
          credit: amount,
        },
      ],
    });
  };

  if (
    command === 'buy_item' ||
    command === 'settle_obligations' ||
    command === 'repair_asset'
  ) {
    if (
      command === 'settle_obligations' ||
      mode === 'settle_upkeep'
    ) {
      const due = cityObligationAmount(city);
      if (due <= 0) {
        return rejected(state, 'LIFE_UPKEEP_NOT_DUE');
      }
      if (availableCash + 0.000001 < due) {
        return rejected(state, 'LIFE_OBLIGATION_SHORTFALL', {
          required: due,
          available: money(availableCash),
          recoverable: true,
          recoveryActions: [
            'work_shift',
            'sell_asset',
            'cancel_service',
          ],
        });
      }
      cost = due;
      journal = settlePurchase(
        cost,
        'life_upkeep_settlement',
        '结清生活责任费用',
      );
      settleCityObligations(city, next.world.tick);
      life.upkeepDue = 0;
      summary = `已结清 ${cost.toFixed(2)} 元。`;
      event = addEvent(next, {
        type: 'life_upkeep_settled',
        actorId: 'player',
        authority: 'local_services_settlement',
        affectedEntities: ['player', 'local_services'],
        ledgerEntryIds: [journal.id],
        visibility: 'player',
        summary,
      });
      journal.eventId = event.id;
    } else if (
      command === 'repair_asset' ||
      mode === 'maintain_asset'
    ) {
      if (!possession || item.assetType !== 'durable') {
        return rejected(state, 'LIFE_ASSET_NOT_OWNED');
      }
      if (possession.condition >= 99.999) {
        return rejected(
          state,
          'LIFE_ASSET_DOES_NOT_NEED_MAINTENANCE',
        );
      }
      cost = money(
        Math.max(
          1,
          item.maintenanceCost *
            ((100 - possession.condition) / 100),
        ),
      );
      if (availableCash + 0.000001 < cost) {
        return rejected(state, 'INSUFFICIENT_CASH', {
          required: cost,
          available: money(availableCash),
        });
      }
      journal = settlePurchase(
        cost,
        'life_asset_maintenance',
        `养护${item.label}`,
      );
      possession.condition = 100;
      summary = `${item.label}已养护如新。`;
      event = addEvent(next, {
        type: 'life_asset_maintained',
        actorId: 'player',
        authority: 'local_maintenance_settlement',
        affectedEntities: ['player', possession.instanceId],
        ledgerEntryIds: [journal.id],
        visibility: 'player',
        summary,
      });
      journal.eventId = event.id;
    } else {
      if (!item.eligibleRoles.includes(next.player.roleType)) {
        return rejected(state, 'LIFE_ROLE_NOT_ELIGIBLE');
      }
      const supplyEntry = city.supply.entries[item.id];
      const stock = Number(supplyEntry?.stock ?? 0);
      if (stock <= 0) {
        return rejected(state, 'LIFE_ITEM_OUT_OF_STOCK');
      }
      cost = quoteCityProduct(city, item, next.world.tick);
      if (availableCash + 0.000001 < cost) {
        return rejected(state, 'INSUFFICIENT_CASH', {
          required: cost,
          available: money(availableCash),
        });
      }
      const projection = getLifeProjection(next);
      if (
        (
          item.assetType === 'consumable' ||
          (
            item.assetType === 'durable' &&
            lifeProductRequiresPlacement(item)
          )
        ) &&
        item.space > 0
      ) {
        if (
          projection.locations.storage.used + item.space >
          projection.locations.storage.capacity
        ) {
          return rejected(state, 'LIFE_SPACE_FULL', {
            required: item.space,
            available: Math.max(
              0,
              projection.locations.storage.capacity -
                projection.locations.storage.used,
            ),
          });
        }
      }
      if (
        item.assetType === 'durable' &&
        item.category === 'vehicle' &&
        projection.locations.parking.used + Number(item.parking ?? 0) >
          projection.locations.parking.capacity
      ) {
        return rejected(state, 'LIFE_PARKING_FULL', {
          required: Number(item.parking ?? 0),
          available: Math.max(
            0,
            projection.locations.parking.capacity -
              projection.locations.parking.used,
          ),
        });
      }
      journal = settlePurchase(
        cost,
        'life_shop_purchase',
        `购买${item.label}`,
      );
      recordCityRetailSale(
        city,
        item,
        next.world.tick,
        cost,
        city.role.ownerId,
      );
      life.shopStock[item.id] = city.supply.entries[item.id].stock;
      if (item.assetType === 'durable') {
        instanceId = nextId(next, 'life_asset');
        const locationId =
          item.category === 'vehicle'
            ? city.role.parkingPlaceId
            : item.category === 'phone' ||
                item.category === 'clothing'
              ? city.role.carriedPlaceId
              : item.category === 'housing'
                ? city.role.primaryPlaceId
                : lifeProductRequiresPlacement(item)
                  ? city.role.storagePlaceId
                  : city.role.primaryPlaceId;
        life.possessions.push({
          instanceId,
          itemId: item.id,
          category: item.category,
          condition: 100,
          acquiredAtTick: next.world.tick,
          acquiredPrice: cost,
          carryingValue: cost,
          usageCount: 0,
          placedHomeId: null,
          locationId,
          order: life.possessions.length,
        });
        next.player.otherAssets = money(
          next.player.otherAssets + cost,
        );
      } else if (item.assetType === 'subscription') {
        const currentExpiry = Math.max(
          next.world.tick,
          Number(life.subscriptions[item.id]?.expiresAtTick) ||
            next.world.tick,
        );
        life.subscriptions[item.id] = {
          startedAtTick: next.world.tick,
          expiresAtTick:
            currentExpiry + Number(item.termWorldDays || 0),
          pricePaid: cost,
          termWorldDays: Number(item.termWorldDays || 0),
        };
      } else if (item.assetType === 'service') {
        const existing = life.serviceContracts[item.id];
        const addedTerm = Number(item.termWorldDays || 0);
        life.serviceContracts[item.id] = {
          startedAtTick:
            existing?.startedAtTick ?? next.world.tick,
          expiresAtTick:
            Math.max(
              next.world.tick,
              Number(existing?.expiresAtTick) || next.world.tick,
            ) + addedTerm,
          usesRemaining:
            Number(existing?.usesRemaining || 0) +
            Number(item.serviceUses || 1),
          pricePaid: money(
            Number(existing?.pricePaid || 0) + cost,
          ),
          termWorldDays:
            Number(existing?.termWorldDays || 0) + addedTerm,
        };
      } else {
        life.inventory[item.id] =
          (life.inventory[item.id] ?? 0) + 1;
      }
      summary = `已购买${item.label}。`;
      event = addEvent(next, {
        type: 'life_shop_purchase',
        actorId: 'player',
        authority: 'local_retail_settlement',
        affectedEntities: ['player', 'local_shop'],
        ledgerEntryIds: [journal.id],
        visibility: 'player',
        summary,
      });
      journal.eventId = event.id;
    }
  } else if (command === 'place_asset') {
    if (!possession || !lifeProductRequiresPlacement(item)) {
      return rejected(state, 'LIFE_ASSET_NOT_OWNED');
    }
    if (!life.active.homeId) {
      return rejected(state, 'LIFE_HOME_NOT_ACTIVE');
    }
    const currentlyPlaced =
      possession.placedHomeId === life.active.homeId;
    if (currentlyPlaced) {
      const projection = getLifeProjection(next);
      if (
        projection.locations.storage.used + item.space >
        projection.locations.storage.capacity
      ) {
        return rejected(state, 'LIFE_STORAGE_FULL', {
          required: item.space,
          available: Math.max(
            0,
            projection.locations.storage.capacity -
              projection.locations.storage.used,
          ),
        });
      }
      possession.placedHomeId = null;
      possession.locationId = city.role.storagePlaceId;
      const activeKey = {
        computer: 'computerId',
      }[item.category];
      if (
        activeKey &&
        life.active[activeKey] === possession.instanceId
      ) {
        life.active[activeKey] =
          life.possessions.find(
            (candidate) =>
              candidate.instanceId !== possession.instanceId &&
              candidate.category === item.category &&
              candidate.condition > 0 &&
              candidate.placedHomeId === life.active.homeId,
          )?.instanceId ?? null;
      }
      summary = `${item.label}已收好。`;
    } else {
      const projection = getLifeProjection(next);
      if (
        projection.space.used + item.space >
        projection.space.capacity
      ) {
        return rejected(state, 'LIFE_SPACE_FULL', {
          required: item.space,
          available: Math.max(
            0,
            projection.space.capacity - projection.space.used,
          ),
        });
      }
      possession.placedHomeId = life.active.homeId;
      possession.locationId = city.role.primaryPlaceId;
      summary = `${item.label}已摆进${city.role.primaryLabel}。`;
    }
    event = addEvent(next, {
      type: currentlyPlaced
        ? 'life_asset_stored'
        : 'life_asset_placed',
      actorId: 'player',
      authority: 'player_life',
      affectedEntities: [
        'player',
        possession.instanceId,
        life.active.homeId,
      ],
      visibility: 'player',
      summary,
    });
  } else if (command === 'activate_asset') {
    if (!possession || item.assetType !== 'durable') {
      return rejected(state, 'LIFE_ASSET_NOT_OWNED');
    }
    const activeKey = {
      housing: 'homeId',
      vehicle: 'vehicleId',
      phone: 'phoneId',
      computer: 'computerId',
      clothing: 'clothingId',
    }[item.category];
    if (!activeKey) {
      return rejected(state, 'LIFE_ASSET_NOT_ACTIVATABLE');
    }
    if (
      lifeProductRequiresPlacement(item) &&
      item.category !== 'housing' &&
      possession.placedHomeId !== life.active.homeId
    ) {
      return rejected(state, 'LIFE_ASSET_NOT_PLACED');
    }
    if (item.category === 'housing') {
      const candidateHome = item;
      const previousHomeId = life.active.homeId;
      const activeVehicle = life.possessions.find(
        (candidate) =>
          candidate.instanceId === life.active.vehicleId,
      );
      const vehicleProduct = LIFE_ITEM_BY_ID[activeVehicle?.itemId];
      if (
        Number(vehicleProduct?.parking ?? 0) >
        Math.max(
          Number(candidateHome.parking ?? 0),
          Number(city.role.fleetSlots ?? 0),
        )
      ) {
        return rejected(state, 'LIFE_PARKING_FULL', {
          required: Number(vehicleProduct?.parking ?? 0),
          available: Math.max(
            Number(candidateHome.parking ?? 0),
            Number(city.role.fleetSlots ?? 0),
          ),
        });
      }
      const movingPlacements = life.possessions.filter(
        (candidate) =>
          candidate.instanceId !== possession.instanceId &&
          lifeProductRequiresPlacement(
            LIFE_ITEM_BY_ID[candidate.itemId],
          ) &&
          (
            candidate.placedHomeId === previousHomeId ||
            candidate.placedHomeId === possession.instanceId
          ),
      );
      const requiredSpace = movingPlacements.reduce(
        (sum, candidate) =>
          sum + Number(LIFE_ITEM_BY_ID[candidate.itemId]?.space ?? 0),
        0,
      );
      if (requiredSpace > Number(candidateHome.capacity ?? 0)) {
        return rejected(state, 'LIFE_SPACE_FULL', {
          required: requiredSpace,
          available: Number(candidateHome.capacity ?? 0),
        });
      }
      for (const candidate of movingPlacements) {
        candidate.placedHomeId = possession.instanceId;
        candidate.locationId = city.role.primaryPlaceId;
      }
    } else if (item.category === 'vehicle' && item.parking > 0) {
      const projection = getLifeProjection(next);
      if (item.parking > projection.space.parkingCapacity) {
        return rejected(state, 'LIFE_PARKING_FULL', {
          required: item.parking,
          available: projection.space.parkingCapacity,
        });
      }
    }
    life.active[activeKey] = possession.instanceId;
    summary = `${item.label}已设为常用。`;
    event = addEvent(next, {
      type: 'life_asset_activated',
      actorId: 'player',
      authority: 'player_life',
      affectedEntities: ['player', possession.instanceId],
      visibility: 'player',
      summary,
    });
  } else if (command === 'sell_asset') {
    if (!possession || item.assetType !== 'durable') {
      return rejected(state, 'LIFE_ASSET_NOT_OWNED');
    }
    if (possession.instanceId === life.active.homeId) {
      return rejected(state, 'LIFE_ACTIVE_SITE_CANNOT_BE_SOLD');
    }
    const ageDays = Math.max(
      0,
      next.world.tick - possession.acquiredAtTick,
    );
    const conditionRatio = clamp(possession.condition / 100, 0, 1);
    const ageRatio = Math.max(
      0.35,
      1 - Number(item.depreciationPerDay ?? 0) * ageDays / 100,
    );
    income = money(
      quoteCityProduct(city, item, next.world.tick) *
        0.72 *
        conditionRatio *
        ageRatio,
    );
    if (next.economy.cashPool + 0.000001 < income) {
      return rejected(state, 'LIFE_RESALE_COUNTERPARTY_SHORTFALL');
    }
    next.player.cash = money(next.player.cash + income);
    next.economy.cashPool = money(next.economy.cashPool - income);
    const disposedCarryingValue = money(
      Math.max(0, Number(possession.carryingValue) || 0),
    );
    next.player.otherAssets = money(
      Math.max(
        0,
        next.player.otherAssets - disposedCarryingValue,
      ),
    );
    const activeKey = {
      vehicle: 'vehicleId',
      phone: 'phoneId',
      computer: 'computerId',
      clothing: 'clothingId',
    }[item.category];
    life.possessions = life.possessions.filter(
      (candidate) => candidate.instanceId !== possession.instanceId,
    );
    if (activeKey && life.active[activeKey] === possession.instanceId) {
      life.active[activeKey] =
        life.possessions.find(
          (candidate) =>
            candidate.category === item.category &&
            candidate.condition > 0 &&
            (
              !lifeProductRequiresPlacement(
                LIFE_ITEM_BY_ID[candidate.itemId],
              ) ||
              candidate.placedHomeId === life.active.homeId
            ),
        )?.instanceId ?? null;
    }
    recordCityAssetBuyback(
      city,
      item,
      next.world.tick,
      income,
      city.role.ownerId,
    );
    life.shopStock[item.id] = city.supply.entries[item.id].stock;
    journal = addJournal(next, {
      type: 'life_asset_resale',
      description: `出售${item.label}`,
      carryingValue: disposedCarryingValue,
      realizedGainLoss: money(income - disposedCarryingValue),
      postings: [
        {
          account: city.role.payerAccount,
          debit: income,
          credit: 0,
        },
        {
          account: 'economy.city_secondhand_pool',
          debit: 0,
          credit: income,
        },
      ],
    });
    summary = `${item.label}已出售，回收 ${income.toFixed(2)} 元。`;
    event = addEvent(next, {
      type: 'life_asset_resold',
      actorId: 'player',
      authority: 'city_secondhand_settlement',
      affectedEntities: [
        'player',
        possession.instanceId,
        'city_secondhand_cooperative',
      ],
      ledgerEntryIds: [journal.id],
      visibility: 'player',
      summary,
    });
    journal.eventId = event.id;
  } else if (command === 'use_service') {
    const contract = life.serviceContracts[item.id];
    if (
      item.assetType !== 'service' ||
      !contract ||
      contract.expiresAtTick <= next.world.tick ||
      contract.usesRemaining <= 0
    ) {
      return rejected(state, 'LIFE_SERVICE_NOT_AVAILABLE');
    }
    for (const [metric, amount] of Object.entries(item.effects ?? {})) {
      if (
        ['energy', 'satiety', 'comfort', 'mobility', 'health'].includes(
          metric,
        )
      ) {
        life[metric] = clamp(
          Number(life[metric] ?? 0) + Number(amount),
          0,
          100,
        );
      }
    }
    contract.usesRemaining -= 1;
    if (contract.usesRemaining <= 0) {
      delete life.serviceContracts[item.id];
    }
    summary = `已使用${item.label}。`;
    event = addEvent(next, {
      type: 'life_service_used',
      actorId: 'player',
      authority: 'city_service_contract',
      affectedEntities: ['player', item.supplierId],
      visibility: 'player',
      summary,
    });
  } else if (command === 'cancel_service') {
    const subscription = life.subscriptions[item.id];
    const contract = life.serviceContracts[item.id];
    const entitlement = subscription ?? contract;
    if (
      !entitlement ||
      !['subscription', 'service'].includes(item.assetType)
    ) {
      return rejected(state, 'LIFE_SERVICE_NOT_ACTIVE');
    }
    const term = Math.max(
      1,
      Number(entitlement.termWorldDays ?? item.termWorldDays ?? 1),
    );
    const remaining = clamp(
      (entitlement.expiresAtTick - next.world.tick) / term,
      0,
      1,
    );
    income = money(
      Math.min(
        next.economy.cashPool,
        Number(entitlement.pricePaid ?? 0) * remaining * 0.5,
      ),
    );
    if (subscription) delete life.subscriptions[item.id];
    if (contract) delete life.serviceContracts[item.id];
    if (income > 0) {
      next.player.cash = money(next.player.cash + income);
      next.economy.cashPool = money(next.economy.cashPool - income);
      journal = addJournal(next, {
        type: 'life_service_cancellation',
        description: `取消${item.label}`,
        postings: [
          {
            account: city.role.payerAccount,
            debit: income,
            credit: 0,
          },
          {
            account: 'economy.city_service_pool',
            debit: 0,
            credit: income,
          },
        ],
      });
    }
    summary =
      income > 0
        ? `${item.label}已取消，退回 ${income.toFixed(2)} 元。`
        : `${item.label}已取消。`;
    event = addEvent(next, {
      type: 'life_service_cancelled',
      actorId: 'player',
      authority: 'city_service_contract',
      affectedEntities: ['player', item.supplierId],
      ledgerEntryIds: journal ? [journal.id] : [],
      visibility: 'player',
      summary,
    });
    if (journal) journal.eventId = event.id;
  } else if (command === 'use_item') {
    if (item.assetType === 'consumable') {
      const quantity = life.inventory[item.id] ?? 0;
      if (quantity <= 0) {
        return rejected(state, 'LIFE_ITEM_NOT_OWNED');
      }
      if (quantity === 1) delete life.inventory[item.id];
      else life.inventory[item.id] = quantity - 1;
      for (const [metric, amount] of Object.entries(
        item.effects ?? {},
      )) {
        life[metric] = clamp(
          Number(life[metric] ?? 0) + Number(amount),
          0,
          100,
        );
      }
    } else {
      if (!possession || item.assetType !== 'durable') {
        return rejected(state, 'LIFE_ASSET_NOT_OWNED');
      }
      if (possession.condition <= 0) {
        return rejected(state, 'LIFE_ASSET_BROKEN');
      }
      if (!lifeProductHasDirectUse(item)) {
        return rejected(state, 'LIFE_ITEM_HAS_NO_DIRECT_USE');
      }
      if (
        (
          item.category === 'housing' &&
          possession.instanceId !==
            life.active.homeId
        ) ||
        (
          item.category === 'vehicle' &&
          possession.instanceId !==
            life.active.vehicleId
        )
      ) {
        return rejected(
          state,
          'LIFE_ASSET_NOT_CURRENT_LOCATION',
        );
      }
      if (
        lifeProductRequiresPlacement(item) &&
        possession.placedHomeId !== life.active.homeId
      ) {
        return rejected(state, 'LIFE_ASSET_NOT_PLACED');
      }
      for (const [metric, amount] of Object.entries(
        item.useValue ?? {},
      )) {
        if (
          ['energy', 'satiety', 'comfort', 'mobility', 'health'].includes(
            metric,
          )
        ) {
          life[metric] = clamp(
            Number(life[metric] ?? 0) + Number(amount),
            0,
            100,
          );
        }
      }
      possession.condition = Number(
        Math.max(
          0,
          possession.condition -
            Math.max(
              1,
              Math.ceil(item.depreciationPerDay * 4),
            ),
        ).toFixed(2),
      );
      writeDownLifeAsset(
        next,
        possession,
        Math.max(
          1,
          Math.ceil(item.depreciationPerDay * 4),
        ),
      );
      possession.usageCount += 1;
    }
    summary = `已使用${item.label}。`;
    event = addEvent(next, {
      type: 'life_item_used',
      actorId: 'player',
      authority: 'player_life',
      affectedEntities: [
        'player',
        ...(possession ? [possession.instanceId] : []),
      ],
      visibility: 'player',
      summary,
    });
  } else if (command === 'work_shift') {
    if (life.work.lastShiftTick === next.world.tick) {
      return rejected(state, 'LIFE_WORK_ALREADY_DONE');
    }
    if (life.energy < 18 || life.satiety < 12 || life.health < 15) {
      return rejected(state, 'LIFE_WORK_TOO_TIRED');
    }
    const activeIds = new Set(
      Object.values(life.active).filter(Boolean),
    );
    const assetBonus = life.possessions
      .filter(
        (candidate) =>
          activeIds.has(candidate.instanceId) &&
          candidate.condition > 0 &&
          (
            !lifeProductRequiresPlacement(
              LIFE_ITEM_BY_ID[candidate.itemId],
            ) ||
            candidate.placedHomeId === life.active.homeId
          ),
      )
      .reduce((sum, candidate) => {
        const product = LIFE_ITEM_BY_ID[candidate.itemId];
        return (
          sum +
          Number(product?.useValue?.workBonus ?? 0) *
            (candidate.condition / 100)
        );
      }, 0);
    const subscriptionBonus = Object.entries(
      life.subscriptions,
    ).reduce((sum, [itemId, subscription]) => {
      if (subscription.expiresAtTick <= next.world.tick) return sum;
      return (
        sum +
        Number(
          LIFE_ITEM_BY_ID[itemId]?.useValue?.workBonus ?? 0,
        )
      );
    }, 0);
    const serviceBonus = Object.entries(
      life.serviceContracts,
    ).reduce((sum, [itemId, contract]) => {
      if (contract.expiresAtTick <= next.world.tick) return sum;
      return (
        sum +
        Number(
          LIFE_ITEM_BY_ID[itemId]?.useValue?.workBonus ?? 0,
        )
      );
    }, 0);
    income = money(
      life.work.baseIncome *
        (
          1 +
          Math.min(
            0.35,
            assetBonus + subscriptionBonus + serviceBonus,
          )
        ),
    );
    if (next.economy.cashPool + 0.000001 < income) {
      return rejected(state, 'LIFE_WORK_COUNTERPARTY_SHORTFALL');
    }
    next.player.cash = money(next.player.cash + income);
    next.economy.cashPool = money(
      next.economy.cashPool - income,
    );
    life.energy = clamp(life.energy - 18, 0, 100);
    life.satiety = clamp(life.satiety - 12, 0, 100);
    life.comfort = clamp(life.comfort - 2, 0, 100);
    life.mobility = clamp(life.mobility - 4, 0, 100);
    life.work.shiftsCompleted += 1;
    life.work.totalEarned = money(
      life.work.totalEarned + income,
    );
    life.work.lastShiftTick = next.world.tick;
    journal = addJournal(next, {
      type: 'life_work_income',
      description: '完成一班工作',
      postings: [
        {
          account: city.role.payerAccount,
          debit: income,
          credit: 0,
        },
        {
          account: 'economy.local_employment_pool',
          debit: 0,
          credit: income,
        },
      ],
    });
    summary = `这班收入 ${income.toFixed(2)} 元。`;
    event = addEvent(next, {
      type: 'life_work_income',
      actorId: 'player',
      authority: 'local_employment_settlement',
      affectedEntities: ['player', 'local_work'],
      ledgerEntryIds: [journal.id],
      visibility: 'player',
      summary,
    });
    journal.eventId = event.id;
  } else {
    const projection = getLifeProjection(next);
    const activeAssets = new Set(
      Object.values(life.active).filter(Boolean),
    );
    const restBonus = life.possessions
      .filter(
        (candidate) =>
          activeAssets.has(candidate.instanceId) ||
          candidate.placedHomeId === life.active.homeId,
      )
      .reduce(
        (sum, candidate) =>
          sum +
          Number(
            LIFE_ITEM_BY_ID[candidate.itemId]?.useValue
              ?.restBonus ?? 0,
          ),
        0,
      );
    life.energy = clamp(
      life.energy + 22 + Math.min(12, restBonus),
      0,
      100,
    );
    life.satiety = clamp(life.satiety - 6, 0, 100);
    life.comfort = clamp(
      life.comfort +
        Math.min(5, projection.space.capacity / 4),
      0,
      100,
    );
    summary = '休息结束。';
    event = addEvent(next, {
      type: 'life_rest',
      actorId: 'player',
      authority: 'player_life',
      affectedEntities: ['player'],
      visibility: 'player',
      summary,
    });
  }

  life.actionCount += 1;
  const receipt = {
    id: event.id,
    tick: next.world.tick,
    status: 'accepted',
    type: 'life_action',
    command,
    mode: mode || null,
    itemId: item?.id ?? null,
    instanceId,
    cost,
    income,
    placed:
      command === 'place_asset'
        ? possession.placedHomeId === life.active.homeId
        : undefined,
    shortFeedback: summary,
  };
  next.ui.lastReceipt = receipt;
  return { state: next, receipt };
}

function socialCareerAction(state, action) {
  if (
    action.actorId !== undefined &&
    action.actorId !== 'player'
  ) {
    return rejected(state, 'ACTOR_NOT_AUTHORIZED', {
      actorId: action.actorId,
    });
  }
  const availableCash =
    Number.isSafeInteger(action.availableCashCents) &&
    action.availableCashCents >= 0
      ? Math.min(
          state.player.cash,
          action.availableCashCents / 100,
        )
      : ['exchange', 'gift'].includes(action.command)
        ? 0
        : Math.max(
            0,
            state.player.cash -
              playerDerivativeReservedCashCents(state) /
                100,
          );
  const activePhoneId =
    state.player.life.active.phoneId;
  const activePhone =
    typeof activePhoneId === 'string'
      ? state.player.life.possessions.find(
          (possession) =>
            possession.instanceId === activePhoneId,
        )
      : null;
  const activePhoneProduct = activePhone
    ? LIFE_ITEM_BY_ID[activePhone.itemId]
    : null;
  const remoteContactAccess =
    activePhone &&
    activePhone.category === 'phone' &&
    activePhone.condition > 0 &&
    activePhoneProduct?.category === 'phone' &&
    activePhoneProduct.capabilities.includes(
      'remote_social_contact',
    )
      ? {
          assetId: activePhone.instanceId,
          itemId: activePhone.itemId,
        }
      : null;
  const result = applySocialCareerAction(
    state.socialCareer,
    action,
    {
      worldTick: state.world.tick,
      playerAttentionAvailable:
        state.player.resources.attention,
      playerCashAvailable: availableCash,
      economyCashAvailable: state.economy.cashPool,
      remoteContactAccess,
    },
  );
  if (result.receipt.status !== 'accepted') {
    return rejected(
      state,
      result.receipt.reason ?? 'SOCIAL_ACTION_REJECTED',
      Object.fromEntries(
        Object.entries(result.receipt).filter(
          ([key]) =>
            !['id', 'status', 'reason', 'tick'].includes(key),
        ),
      ),
    );
  }
  if (
    result.receipt.interactionMode === 'remote_phone' &&
    (
      remoteContactAccess === null ||
      result.receipt.communicationAssetId !==
        remoteContactAccess.assetId ||
      state.player.life.active.phoneId !==
        remoteContactAccess.assetId
    )
  ) {
    return rejected(
      state,
      'SOCIAL_REMOTE_CONTACT_UNAVAILABLE',
    );
  }

  const next = clone(state);
  next.socialCareer = result.ecology;
  if (result.receipt.interactionMode === 'remote_phone') {
    const communicationAsset =
      next.player.life.possessions.find(
        (possession) =>
          possession.instanceId ===
          result.receipt.communicationAssetId,
      );
    const product = communicationAsset
      ? LIFE_ITEM_BY_ID[communicationAsset.itemId]
      : null;
    if (
      !communicationAsset ||
      communicationAsset.instanceId !==
        next.player.life.active.phoneId ||
      communicationAsset.category !== 'phone' ||
      communicationAsset.condition <= 0 ||
      !product?.capabilities.includes(
        'remote_social_contact',
      )
    ) {
      return rejected(
        state,
        'SOCIAL_REMOTE_CONTACT_UNAVAILABLE',
      );
    }
    communicationAsset.usageCount += 1;
  }
  next.player.cash = money(
    next.player.cash + result.playerCashDelta,
  );
  next.economy.cashPool = money(
    next.economy.cashPool + result.economyCashDelta,
  );
  next.player.resources.attention = clamp(
    next.player.resources.attention +
      result.playerAttentionDelta,
    0,
    next.player.strengthTier === 'high' ? 8 : 5,
  );
  if (
    next.player.cash < -0.001 ||
    next.economy.cashPool < -0.001
  ) {
    return rejected(state, 'SOCIAL_SETTLEMENT_SHORTFALL');
  }
  const journals = result.journals.map((entry) =>
    addJournal(next, entry),
  );
  const event = addEvent(next, {
    type: `social_${result.receipt.command}`,
    actorId: 'player',
    authority: 'social_career_rules',
    affectedEntities: [
      'player',
      ...(result.receipt.targetActorId
        ? [result.receipt.targetActorId]
        : []),
      ...(result.receipt.contractId
        ? [result.receipt.contractId]
        : []),
      ...(result.receipt.communicationAssetId
        ? [result.receipt.communicationAssetId]
        : []),
    ],
    preconditions: [
      ...(result.receipt.communicationAssetId
        ? [result.receipt.communicationAssetId]
        : []),
    ],
    ledgerEntryIds: journals.map((entry) => entry.id),
    visibility: 'player',
    summary:
      result.receipt.shortFeedback ?? '这次来往已经结算。',
  });
  for (const entry of journals) entry.eventId = event.id;
  const fact = addFact(next, {
    type: 'social_career_action',
    entityId:
      result.receipt.targetActorId ??
      'org_player_venture',
    eventId: event.id,
    visibility: 'player',
    summary: event.summary,
    value: {
      socialFactId: result.receipt.factId,
      command: result.receipt.command,
      outcome: result.receipt.outcome ?? null,
      contractId: result.receipt.contractId ?? null,
      interactionMode:
        result.receipt.interactionMode ?? null,
      communicationAssetId:
        result.receipt.communicationAssetId ?? null,
      originLocationId:
        result.receipt.originLocationId ?? null,
      destinationLocationId:
        result.receipt.destinationLocationId ?? null,
    },
  });
  const receipt = {
    ...result.receipt,
    id: event.id,
    engineFactId: fact.id,
    socialFactId: result.receipt.factId,
    tick: next.world.tick,
    type: 'social_action',
  };
  next.replay.push({
    id: nextId(next, 'replay'),
    tick: next.world.tick,
    actionEventId: event.id,
    factId: fact.id,
    process: {
      type: 'social_action',
      command: result.receipt.command,
      targetActorId:
        result.receipt.targetActorId ?? null,
      interactionMode:
        result.receipt.interactionMode ?? null,
      communicationAssetId:
        result.receipt.communicationAssetId ?? null,
      originLocationId:
        result.receipt.originLocationId ?? null,
      destinationLocationId:
        result.receipt.destinationLocationId ?? null,
    },
    result: receipt.shortFeedback,
    unknown: '对方之后仍会按自己的处境继续行动。',
  });
  consumeSocialBusinessActions(next);
  synchronizeSocialCareerProjection(next);
  next.ui.lastReceipt = receipt;
  return { state: next, receipt };
}

const ACTIONS_REQUIRING_DERIVATIVE_ACCOUNT_SYNC = new Set([
  'place_order',
  'activate_market_data',
  'life_action',
  'social_action',
]);

export function applyAction(state, action = {}) {
  if (!state || state.world?.status !== 'running') {
    throw new Error('A running LZY world is required.');
  }
  let result;
  switch (action.type) {
    case 'verify_clue':
      result = verifyClue(state, action);
      break;
    case 'place_order':
      result = placeOrder(state, action);
      break;
    case 'record_order_commitment':
      result = recordOrderCommitment(state, action);
      break;
    case 'role_action':
      result = roleAction(state, action);
      break;
    case 'add_narrative':
      result = addNarrative(state, action);
      break;
    case 'hold':
      result = holdAction(state, action);
      break;
    case 'activate_market_data':
      result = activateMarketData(state, action);
      break;
    case 'life_action':
      result = lifeAction(state, action);
      break;
    case 'social_action':
      result = socialCareerAction(state, action);
      break;
    case 'derivatives_action':
      result = derivativeAction(state, action);
      break;
    default:
      result = rejected(state, 'UNKNOWN_ACTION');
      break;
  }
  if (
    result.receipt.status === 'accepted' &&
    ACTIONS_REQUIRING_DERIVATIVE_ACCOUNT_SYNC.has(
      action.type,
    )
  ) {
    try {
      syncEmbeddedDerivatives(result.state);
    } catch {
      return rejected(
        state,
        'DERIVATIVE_SYNCHRONIZATION_FAILED',
      );
    }
  }
  return result;
}

function rebuildBook(state, symbol, reference, offset) {
  const randomDepth = 0.8 + nextRandom(state) * 0.5;
  const base = makeOrderBook(reference, offset);
  for (const side of ['asks', 'bids']) {
    for (const level of base[side]) {
      level.quantity = Math.max(2, Math.round(level.quantity * randomDepth));
    }
  }
  base.lastUpdatedTick = state.world.tick;
  state.market.orderBooks[symbol] = base;
}

function settleNpcOrders(state, company, index, operatingSignal) {
  const security = state.market.securities[company.symbol];
  const valuationGap =
    (security.referenceValue - security.lastPrice) /
    Math.max(1, security.lastPrice);
  const discoverySignal = clamp(
    operatingSignal + valuationGap * 0.08,
    -0.035,
    0.035,
  );
  const investorIds = Object.values(state.entities.investors)
    .filter((investor) => investor.tradingEnabled !== false)
    .map((investor) => investor.id);
  const buyerId =
    investorIds[(state.world.tick + index) % investorIds.length];
  const sellerId =
    investorIds[(state.world.tick + index + 1) % investorIds.length];
  const buyer = state.entities.investors[buyerId];
  const seller = state.entities.investors[sellerId];
  const bidNoise = (nextRandom(state) - 0.5) * 0.004;
  const askNoise = (nextRandom(state) - 0.5) * 0.004;
  const bidPrice = price(
    Math.max(
      1,
      security.lastPrice * (1 + discoverySignal + 0.004 + bidNoise),
    ),
  );
  const askPrice = price(
    Math.max(
      1,
      security.lastPrice * (1 + discoverySignal - 0.004 + askNoise),
    ),
  );
  const desiredQuantity = 5 + Math.floor(nextRandom(state) * 10);
  const quantity = Math.max(
    0,
    Math.min(
      desiredQuantity,
      seller.holdings[company.symbol] ?? 0,
      Math.floor(buyer.cash / Math.max(askPrice, 1)),
    ),
  );
  const buyOrder = {
    id: nextId(state, 'order'),
    tick: state.world.tick,
    actorId: buyerId,
    symbol: company.symbol,
    side: 'buy',
    price: bidPrice,
    quantity,
    remainingQuantity: quantity,
    status: 'open',
    source: 'npc_strategy',
    observedValuation: security.referenceValue,
    valuationSignal: discoverySignal,
  };
  const sellOrder = {
    id: nextId(state, 'order'),
    tick: state.world.tick,
    actorId: sellerId,
    symbol: company.symbol,
    side: 'sell',
    price: askPrice,
    quantity,
    remainingQuantity: quantity,
    status: 'open',
    source: 'npc_strategy',
    observedValuation: security.referenceValue,
    valuationSignal: discoverySignal,
  };
  state.market.orders.push(buyOrder, sellOrder);

  if (quantity <= 0 || bidPrice < askPrice) {
    buyOrder.status = quantity <= 0 ? 'resource_rejected' : 'expired_no_cross';
    sellOrder.status = quantity <= 0 ? 'resource_rejected' : 'expired_no_cross';
    rebuildBook(state, company.symbol, security.lastPrice, index);
    return null;
  }

  const executionPrice = price((bidPrice + askPrice) / 2);
  const gross = money(executionPrice * quantity);
  buyer.cash = money(buyer.cash - gross);
  seller.cash = money(seller.cash + gross);
  buyer.holdings[company.symbol] =
    (buyer.holdings[company.symbol] ?? 0) + quantity;
  seller.holdings[company.symbol] -= quantity;
  buyer.memory.lastTradeTick = state.world.tick;
  seller.memory.lastTradeTick = state.world.tick;

  const journal = addJournal(state, {
    type: 'npc_secondary_trade_settlement',
    description: `${buyer.name} 与 ${seller.name} 的 ${company.symbol} 二级成交`,
    postings: [
      { account: `${sellerId}.cash`, debit: gross, credit: 0 },
      { account: `${buyerId}.cash`, debit: 0, credit: gross },
    ],
    securityTransfers: [
      {
        symbol: company.symbol,
        from: sellerId,
        to: buyerId,
        quantity,
      },
    ],
  });
  const event = addEvent(state, {
    type: 'npc_market_trade',
    actorId: buyerId,
    authority: 'market_matching',
    affectedEntities: [buyerId, sellerId, company.id],
    parentIds: [],
    ledgerEntryIds: [journal.id],
    summary: `${company.symbol} 两张独立有效委托以 ${executionPrice} 撮合 ${quantity} 股。`,
  });
  journal.eventId = event.id;
  const trade = {
    id: nextId(state, 'trade'),
    eventId: event.id,
    tick: state.world.tick,
    symbol: company.symbol,
    side: 'npc_cross',
    buyerId,
    sellerId,
    price: executionPrice,
    quantity,
    source: 'matched_npc_orders',
    orderIds: [buyOrder.id, sellOrder.id],
    orders: [
      {
        id: buyOrder.id,
        actorId: buyerId,
        side: 'buy',
        price: bidPrice,
        quantity,
      },
      {
        id: sellOrder.id,
        actorId: sellerId,
        side: 'sell',
        price: askPrice,
        quantity,
      },
    ],
  };
  buyOrder.status = 'filled';
  buyOrder.remainingQuantity = 0;
  buyOrder.tradeId = trade.id;
  sellOrder.status = 'filled';
  sellOrder.remainingQuantity = 0;
  sellOrder.tradeId = trade.id;
  state.market.trades.push(trade);
  security.lastPrice = executionPrice;
  security.priceHistory.push({
    tick: state.world.tick,
    price: executionPrice,
    source: 'matched_npc_orders',
    tradeId: trade.id,
  });
  rebuildBook(state, company.symbol, executionPrice, index);
  return trade;
}

function recordFinancialPeriod(
  company,
  tick,
  { revenue, netIncome, freeCashFlow },
) {
  const financials = company.financials;
  const buckets = financials.reportingBuckets;
  const bucketIndex =
    Math.floor((Math.max(1, tick) - 1) / financials.bucketDays) %
    buckets.length;
  if (financials.currentBucketIndex !== bucketIndex) {
    buckets[bucketIndex] = {
      revenue: 0,
      netIncome: 0,
      freeCashFlow: 0,
    };
    financials.currentBucketIndex = bucketIndex;
  }
  const bucket = buckets[bucketIndex];
  bucket.revenue = money(bucket.revenue + revenue);
  bucket.netIncome = money(bucket.netIncome + netIncome);
  bucket.freeCashFlow = money(
    bucket.freeCashFlow + freeCashFlow,
  );
  financials.priorTrailingRevenue = financials.trailingRevenue;
  financials.priorTrailingNetIncome =
    financials.trailingNetIncome;
  financials.trailingRevenue = money(
    buckets.reduce((sum, item) => sum + item.revenue, 0),
  );
  financials.trailingNetIncome = money(
    buckets.reduce((sum, item) => sum + item.netIncome, 0),
  );
  financials.trailingFreeCashFlow = money(
    buckets.reduce((sum, item) => sum + item.freeCashFlow, 0),
  );
  financials.lastRevenue = revenue;
  financials.lastNetIncome = netIncome;
  financials.lastFreeCashFlow = freeCashFlow;
}

function evolveEconomicStructure(state) {
  const economy = state.economy;
  const tick = state.world.tick;
  const slowCycle = Math.sin(tick / 72) * 0.00011;
  const demandShock = (nextRandom(state) - 0.5) * 0.00018;
  const technologyShock = (nextRandom(state) - 0.5) * 0.00008;
  const inflationShock = (nextRandom(state) - 0.5) * 0.00005;
  const developmentDrift = 0.00012 + slowCycle + demandShock * 0.35;
  const demandDrift = 0.00014 + slowCycle * 1.25 + demandShock;
  const technologyDrift = 0.00016 + technologyShock;
  const inflationDrift = 0.000055 + inflationShock;

  economy.developmentIndex = Number(
    clamp(
      economy.developmentIndex * (1 + developmentDrift),
      0.55,
      4.5,
    ).toFixed(8),
  );
  economy.potentialDemandIndex = Number(
    clamp(
      economy.potentialDemandIndex * (1 + demandDrift),
      0.5,
      5,
    ).toFixed(8),
  );
  economy.technologyFrontier = Number(
    clamp(
      economy.technologyFrontier * (1 + technologyDrift),
      0.7,
      4,
    ).toFixed(8),
  );
  economy.priceLevel = Number(
    clamp(
      economy.priceLevel * (1 + inflationDrift),
      0.75,
      3.5,
    ).toFixed(8),
  );

  const rateTarget =
    280 +
    Math.round(Math.sin(tick / 44) * 85) +
    Math.round((economy.priceLevel - 1) * 700);
  economy.riskFreeRateBps = Math.round(
    clamp(
      economy.riskFreeRateBps * 0.94 +
        rateTarget * 0.06 +
        (nextRandom(state) - 0.5) * 12,
      40,
      1_400,
    ),
  );
  const stressTarget =
    245 -
    economy.industrialCycle * 95 +
    Math.max(0, 1 - economy.developmentIndex) * 500;
  economy.creditSpreadBps = Math.round(
    clamp(
      economy.creditSpreadBps * 0.92 +
        stressTarget * 0.08 +
        (nextRandom(state) - 0.5) * 18,
      70,
      1_800,
    ),
  );
  economy.structuralGrowthBps = Math.round(
    clamp(
      320 +
        developmentDrift * 1_000_000 +
        demandDrift * 650_000 +
        technologyDrift * 500_000,
      -1_500,
      1_800,
    ),
  );
  economy.regime =
    economy.structuralGrowthBps < 0
      ? 'contraction'
      : economy.creditSpreadBps > 520
        ? 'funding_stress'
        : economy.structuralGrowthBps > 620
          ? 'accelerating_expansion'
          : 'balanced_expansion';
}

function deterministicCommodityUnit(
  state,
  underlyingId,
  channel,
) {
  return (
    hashString(
      `${state.world.seed}:${state.world.tick}:` +
        `${underlyingId}:${channel}`,
    ) /
      0xffffffff *
      2 -
    1
  );
}

function evolveDerivativeCommodityBalances(state) {
  const balances =
    ensureDerivativeCommodityBalances(state.economy);
  const tick = state.world.tick;
  for (const [
    underlyingId,
    template,
  ] of Object.entries(DERIVATIVE_COMMODITY_TEMPLATES)) {
    const balance = balances[underlyingId];
    const seasonality = Math.sin(
      (
        tick + template.seasonalPhase
      ) *
        Math.PI *
        2 /
        template.seasonalPeriod,
    );
    const supplyShock =
      deterministicCommodityUnit(
        state,
        underlyingId,
        'supply',
      ) * template.supplyVolatility;
    const demandShock =
      deterministicCommodityUnit(
        state,
        underlyingId,
        'demand',
      ) *
      template.supplyVolatility *
      0.8;
    const productionTarget = clamp(
      1 +
        supplyShock -
        seasonality *
          (
            underlyingId === 'LZYA' ? 0.055 : 0.012
          ),
      0.7,
      1.3,
    );
    const consumptionTarget = clamp(
      1 +
        state.economy.industrialCycle *
          template.demandCycleWeight +
        (
          state.economy.potentialDemandIndex - 1
        ) *
          0.08 +
        demandShock +
        seasonality *
          (
            underlyingId === 'LZYA' ? 0.035 : 0.01
          ),
      0.65,
      1.45,
    );
    balance.productionIndex = Number(
      (
        balance.productionIndex * 0.82 +
        productionTarget * 0.18
      ).toFixed(8),
    );
    balance.consumptionIndex = Number(
      (
        balance.consumptionIndex * 0.8 +
        consumptionTarget * 0.2
      ).toFixed(8),
    );
    balance.inventoryIndex = Number(
      clamp(
        balance.inventoryIndex +
          (
            balance.productionIndex -
            balance.consumptionIndex
          ) *
            0.045 -
          (
            balance.inventoryIndex - 1
          ) *
            template.inventoryMeanReversion,
        0.45,
        1.8,
      ).toFixed(8),
    );
    const eventPulse =
      hashString(
        `${state.world.seed}:${tick}:${underlyingId}:event`,
      ) %
        97 ===
      0
        ? 1
        : 0;
    balance.eventRisk = Number(
      clamp(
        balance.eventRisk * 0.72 +
          eventPulse *
            (
              underlyingId === 'LZYSC'
                ? 0.22
                : underlyingId === 'LZYAU'
                  ? 0.1
                  : 0.045
            ),
        0,
        0.35,
      ).toFixed(8),
    );
    balance.seasonality = Number(
      seasonality.toFixed(8),
    );
    const realRateGap =
      (
        state.economy.riskFreeRateBps - 280
      ) /
      10_000;
    const scarcity =
      (
        balance.consumptionIndex -
        balance.productionIndex
      ) *
        0.7 +
      (
        1 - balance.inventoryIndex
      ) *
        0.55 +
      balance.eventRisk +
      realRateGap * template.rateSensitivity;
    const targetSpotTicks =
      template.openingSpotTicks *
      state.economy.priceLevel *
      clamp(1 + scarcity, 0.45, 2.4);
    balance.spotTicks = Math.max(
      1,
      Math.round(
        clamp(
          balance.spotTicks * 0.86 +
            targetSpotTicks * 0.14,
          template.openingSpotTicks * 0.35,
          template.openingSpotTicks * 3,
        ),
      ),
    );
    balance.carryBps = Math.round(
      clamp(
        (
          balance.inventoryIndex - 1
        ) *
          1_200 +
          state.economy.riskFreeRateBps +
          template.baseCarrySpreadBps -
          balance.eventRisk * 800 +
          (
            underlyingId === 'LZYA'
              ? Math.max(0, seasonality) * 180
              : 0
          ),
        -900,
        2_200,
      ),
    );
    balance.lastUpdatedTick = tick;
  }
}

function evolveCompanyStructure(state, company, index) {
  const operations = company.operations;
  const economy = state.economy;
  if (
    operations.model === 'commercial_bank' ||
    operations.model === 'insurance_group'
  ) {
    const macroDrag =
      Math.max(0, economy.creditSpreadBps - 320) * 0.42;
    const rateSupport =
      operations.model === 'commercial_bank'
        ? (economy.riskFreeRateBps - 250) * 0.18
        : (economy.riskFreeRateBps - 250) * 0.1;
    operations.structuralExpectedGrowthBps = Math.round(
      clamp(
        economy.structuralGrowthBps * 0.48 +
          rateSupport -
          macroDrag,
        -900,
        900,
      ),
    );
    operations.lastProduced = null;
    operations.lastSold = null;
    operations.plannedProduction = null;
    operations.utilization = null;
    return;
  }
  const idiosyncratic = (nextRandom(state) - 0.5) * 0.00024;
  const priorProductivity = operations.productivity;
  const priorMarketShare = operations.marketShare;
  const frontierPull =
    (economy.technologyFrontier - operations.technology) * 0.0025;
  const reinvestmentSignal = clamp(
    Math.max(0, company.financials.lastFreeCashFlow) /
      Math.max(1, company.financials.trailingRevenue),
    0,
    0.08,
  );
  const technologyGrowth =
    0.00006 +
    frontierPull +
    reinvestmentSignal * operations.reinvestmentRate * 0.04 +
    idiosyncratic;
  operations.technology = Number(
    clamp(
      operations.technology * (1 + technologyGrowth),
      0.55,
      economy.technologyFrontier * 1.18,
    ).toFixed(8),
  );
  operations.productivity = Number(
    clamp(
      operations.productivity *
        (
          1 +
          technologyGrowth * 0.72 +
          (economy.technologyFrontier -
            operations.productivity) *
            0.00035
        ),
      0.55,
      4,
    ).toFixed(8),
  );

  const qualityEdge =
    operations.productivity / Math.max(0.1, economy.technologyFrontier) -
    1;
  operations.marketShare = Number(
    clamp(
      operations.marketShare +
        qualityEdge * 0.00065 +
        (nextRandom(state) - 0.5) * 0.00018,
      0.08,
      0.7,
    ).toFixed(8),
  );
  operations.pricingPower = Number(
    clamp(
      0.015 +
        (operations.marketShare - 1 / 3) * 0.12 +
        qualityEdge * 0.025,
      -0.035,
      0.09,
    ).toFixed(8),
  );
  const capacityPressure =
    operations.utilization - 0.68 +
    reinvestmentSignal * 3.5 -
    Math.max(0, economy.creditSpreadBps - 450) / 4_000;
  operations.requestedExpansionUnits = Number(
    Math.max(
      0,
      0.006 +
        Math.max(0, economy.potentialDemandIndex - 1) *
          0.035 +
        clamp(capacityPressure * 0.045, -0.055, 0.14),
    ).toFixed(8),
  );
  const effectiveCost =
    operations.initialUnitCost *
    economy.priceLevel /
    Math.max(0.35, operations.productivity);
  operations.unitCost = Number(
    clamp(
      effectiveCost,
      operations.initialUnitCost * 0.35,
      operations.initialUnitCost * 3,
    ).toFixed(4),
  );
  operations.productPrice = Number(
    clamp(
      operations.initialProductPrice *
        economy.priceLevel *
        (1 + operations.pricingPower),
      operations.initialProductPrice * 0.45,
      operations.initialProductPrice * 4,
    ).toFixed(4),
  );
  operations.baseDemand = Number(
    Math.max(
      6,
      operations.initialBaseDemand *
        economy.potentialDemandIndex *
        (operations.marketShare / (0.31 + index * 0.025)),
    ).toFixed(4),
  );
  const productivityGrowthBps = Math.round(
    (
      operations.productivity /
        Math.max(0.000001, priorProductivity) -
      1
    ) * BPS_SCALE * 240,
  );
  const shareGrowthBps = Math.round(
    (
      operations.marketShare /
        Math.max(0.000001, priorMarketShare) -
      1
    ) * BPS_SCALE * 120,
  );
  operations.structuralExpectedGrowthBps = Math.round(
    clamp(
      economy.structuralGrowthBps * 0.55 +
        productivityGrowthBps * 0.3 +
        shareGrowthBps * 0.15,
      -2_000,
      2_000,
    ),
  );
}

function transferInstitutionFreeCashFlow(
  state,
  company,
  requestedFreeCashFlow,
) {
  if (requestedFreeCashFlow >= 0) {
    const transferred = money(
      Math.min(requestedFreeCashFlow, state.economy.cashPool),
    );
    company.cash = money(company.cash + transferred);
    state.economy.cashPool = money(
      state.economy.cashPool - transferred,
    );
    return transferred;
  }
  const transferred = money(
    Math.min(-requestedFreeCashFlow, company.cash),
  );
  company.cash = money(company.cash - transferred);
  state.economy.cashPool = money(
    state.economy.cashPool + transferred,
  );
  return money(-transferred);
}

function settleFinancialInstitutionCycle(
  state,
  company,
  index,
  options,
) {
  const model = company.operations.model;
  const institution = company.financialInstitution;
  const annualDays = company.financials.annualTradingDays;
  let revenue;
  let netIncome;
  let requestedFreeCashFlow;
  let resultType;
  let resultSummary;
  let resultValue;

  if (model === 'commercial_bank') {
    const macroCreditMultiplierPpm = Math.round(
      clamp(
        1 +
          (state.economy.creditSpreadBps - 260) /
            2_400,
        0.65,
        1.8,
      ) * 1_000_000,
    );
    const loanInterestIncomeCents =
      roundedIntegerRatio(
        institution.loansCents,
        institution.loanYieldBps,
        BPS_SCALE * annualDays,
        'bank loan interest income',
      );
    const depositInterestExpenseCents =
      roundedIntegerRatio(
        institution.depositsCents,
        institution.depositCostBps,
        BPS_SCALE * annualDays,
        'bank deposit interest expense',
      );
    const securitiesYieldBps = Math.round(
      clamp(
        state.economy.riskFreeRateBps + 40,
        120,
        620,
      ),
    );
    const securitiesIncomeCents =
      roundedIntegerRatio(
        institution.securitiesAssetsCents,
        securitiesYieldBps,
        BPS_SCALE * annualDays,
        'bank securities income',
      );
    const netInterestIncomeCents =
      loanInterestIncomeCents +
      securitiesIncomeCents -
      depositInterestExpenseCents;
    const trailingRevenueCents = moneyToCents(
      company.financials.trailingRevenue,
      'bank trailing revenue',
    );
    const feeIncomeCents = Math.max(
      roundedIntegerRatio(
        trailingRevenueCents,
        1_600,
        BPS_SCALE * annualDays,
        'bank fee income',
      ),
      roundedIntegerRatio(
        Math.max(0, netInterestIncomeCents),
        1_000,
        BPS_SCALE,
        'bank minimum fee income',
      ),
    );
    const creditLossCents = roundedIntegerRatio(
      institution.loansCents,
      institution.creditCostBps *
        macroCreditMultiplierPpm,
      BPS_SCALE * annualDays * 1_000_000,
      'bank credit loss',
    );
    const netOperatingRevenueCents =
      Math.max(
        0,
        netInterestIncomeCents + feeIncomeCents,
      );
    const operatingExpenseCents =
      roundedIntegerRatio(
        netOperatingRevenueCents,
        Math.round(
          company.financials
            .operatingExpenseRatio *
            BPS_SCALE,
        ),
        BPS_SCALE,
        'bank operating expense',
      );
    const netIncomeCents =
      netInterestIncomeCents +
      feeIncomeCents -
      creditLossCents -
      operatingExpenseCents;
    const revenueCents =
      loanInterestIncomeCents +
      securitiesIncomeCents +
      feeIncomeCents;
    const requestedFreeCashFlowCents =
      roundedIntegerRatio(
        netIncomeCents,
        8_600,
        BPS_SCALE,
        'bank free cash flow',
      );
    revenue = centsToMoney(
      revenueCents,
      'bank revenue',
    );
    netIncome = centsToMoney(
      netIncomeCents,
      'bank net income',
    );
    requestedFreeCashFlow = centsToMoney(
      requestedFreeCashFlowCents,
      'bank free cash flow',
    );
    institution.lastLoanInterestIncomeCents =
      loanInterestIncomeCents;
    institution.lastDepositInterestExpenseCents =
      depositInterestExpenseCents;
    institution.lastSecuritiesIncomeCents =
      securitiesIncomeCents;
    institution.lastFeeIncomeCents =
      feeIncomeCents;
    institution.lastCreditLossCents =
      creditLossCents;
    institution.lastOperatingExpenseCents =
      operatingExpenseCents;
    institution.lastNetIncomeCents =
      netIncomeCents;
    institution.lastNetInterestIncome =
      centsToMoney(
        netInterestIncomeCents,
        'bank net interest income',
      );
    institution.lastCreditLoss = centsToMoney(
      creditLossCents,
      'bank credit loss',
    );
    institution.nonPerformingLoanBps = Math.round(
      clamp(
        institution.nonPerformingLoanBps +
          (
            macroCreditMultiplierPpm /
              1_000_000 -
            1
          ) *
            1.8 +
          (nextRandom(state) - 0.5) * 0.8,
        55,
        520,
      ),
    );
    institution.capitalAdequacyBps = Math.round(
      clamp(
        institution.capitalAdequacyBps * 0.98 +
          moneyToCents(company.equity) /
            Math.max(
              1,
              institution.loansCents * 0.75,
            ) *
            BPS_SCALE *
            0.02,
        900,
        2_400,
      ),
    );
    institution.liquidityCoverageBps = Math.round(
      clamp(
        institution.liquidityCoverageBps * 0.98 +
          moneyToCents(company.cash) /
            Math.max(
              1,
              institution.depositsCents * 0.06,
            ) *
            BPS_SCALE *
            0.02,
        8_000,
        25_000,
      ),
    );
    institution.netInterestMarginBps =
      roundedIntegerRatio(
        netInterestIncomeCents * annualDays,
        BPS_SCALE,
        institution.loansCents +
          institution.securitiesAssetsCents,
        'bank net interest margin',
      );
    resultType = 'bank_financial_result';
    resultSummary =
      `${company.name} 本期净利息收入 ` +
      `${centsToMoney(netInterestIncomeCents)}，` +
      `信用减值 ${centsToMoney(creditLossCents)}，资本充足率 ` +
      `${(institution.capitalAdequacyBps / 100).toFixed(2)}%。`;
    resultValue = {
      loanInterestIncomeCents,
      depositInterestExpenseCents,
      securitiesIncomeCents,
      feeIncomeCents,
      creditLossCents,
      operatingExpenseCents,
      netIncomeCents,
      netInterestIncome:
        centsToMoney(netInterestIncomeCents),
      feeIncome: centsToMoney(feeIncomeCents),
      creditLoss: centsToMoney(creditLossCents),
      netInterestMarginBps: institution.netInterestMarginBps,
      nonPerformingLoanBps: institution.nonPerformingLoanBps,
      creditCostBps: institution.creditCostBps,
      capitalAdequacyBps: institution.capitalAdequacyBps,
      liquidityCoverageBps: institution.liquidityCoverageBps,
    };
  } else {
    const writtenPremiumCents =
      roundedIntegerRatio(
        institution.writtenPremiumCents,
        1,
        annualDays,
        'written premium',
      );
    const earnedPremiumCents =
      roundedIntegerRatio(
        institution.earnedPremiumCents,
        1,
        annualDays,
        'earned premium',
      );
    const catastrophePressurePpm = Math.round(
      clamp(
        1 +
          Math.max(
            0,
            -state.economy.industrialCycle,
          ) *
            0.16,
        0.9,
        1.35,
      ) * 1_000_000,
    );
    const claimsCents = roundedIntegerRatio(
      earnedPremiumCents,
      institution.claimsRatioBps *
        catastrophePressurePpm,
      BPS_SCALE * 1_000_000,
      'insurance claims',
    );
    const reserveChangeCents =
      roundedIntegerRatio(
        earnedPremiumCents,
        1_700,
        BPS_SCALE,
        'insurance reserve change',
      );
    const investmentPressurePpm = Math.round(
      clamp(
        1 +
          (state.economy.riskFreeRateBps - 280) /
            2_000,
        0.72,
        1.28,
      ) * 1_000_000,
    );
    const investmentReturnCents =
      roundedIntegerRatio(
        institution.investedAssetsCents,
        institution.investmentYieldBps *
          investmentPressurePpm,
        BPS_SCALE * annualDays * 1_000_000,
        'insurance investment return',
      );
    const revenueCents =
      earnedPremiumCents +
      investmentReturnCents;
    const expenseCents = roundedIntegerRatio(
      revenueCents,
      Math.round(
        company.financials
          .operatingExpenseRatio *
          BPS_SCALE,
      ),
      BPS_SCALE,
      'insurance expense',
    );
    const netIncomeCents =
      revenueCents -
      claimsCents -
      reserveChangeCents -
      expenseCents;
    const requestedFreeCashFlowCents =
      roundedIntegerRatio(
        netIncomeCents,
        8_200,
        BPS_SCALE,
        'insurance free cash flow',
      );
    revenue = centsToMoney(
      revenueCents,
      'insurance revenue',
    );
    netIncome = centsToMoney(
      netIncomeCents,
      'insurance net income',
    );
    requestedFreeCashFlow = centsToMoney(
      requestedFreeCashFlowCents,
      'insurance free cash flow',
    );
    institution.lastWrittenPremiumCents =
      writtenPremiumCents;
    institution.lastEarnedPremiumCents =
      earnedPremiumCents;
    institution.lastClaimsCents = claimsCents;
    institution.lastReserveChangeCents =
      reserveChangeCents;
    institution.lastInvestmentReturnCents =
      investmentReturnCents;
    institution.lastExpenseCents = expenseCents;
    institution.lastNetIncomeCents =
      netIncomeCents;
    institution.lastPremiumEarned =
      centsToMoney(earnedPremiumCents);
    institution.lastClaims =
      centsToMoney(claimsCents);
    institution.lastInvestmentIncome =
      centsToMoney(investmentReturnCents);
    institution.solvencyRatioBps = Math.round(
      clamp(
        institution.solvencyRatioBps * 0.985 +
          moneyToCents(company.equity) /
            Math.max(
              1,
              institution.insuranceReserveCents *
                0.1,
            ) *
            BPS_SCALE *
            0.015,
        10_000,
        35_000,
      ),
    );
    institution.durationGapBps = Math.round(
      clamp(
        institution.durationGapBps * 0.985 +
          (state.economy.riskFreeRateBps - 280) *
            0.015,
        -2_000,
        2_000,
      ),
    );
    resultType = 'insurance_financial_result';
    resultSummary =
      `${company.name} 本期已赚保费 ` +
      `${centsToMoney(earnedPremiumCents)}，赔付 ` +
      `${centsToMoney(claimsCents)}，偿付能力充足率 ` +
      `${(institution.solvencyRatioBps / 100).toFixed(2)}%。`;
    resultValue = {
      writtenPremiumCents,
      earnedPremiumCents,
      claimsCents,
      reserveChangeCents,
      investmentReturnCents,
      expenseCents,
      netIncomeCents,
      durationGapBps: institution.durationGapBps,
      premiumEarned:
        centsToMoney(earnedPremiumCents),
      claims: centsToMoney(claimsCents),
      reserveChange:
        centsToMoney(reserveChangeCents),
      investmentIncome:
        centsToMoney(investmentReturnCents),
      claimsRatioBps: institution.claimsRatioBps,
      investmentYieldBps: institution.investmentYieldBps,
      solvencyRatioBps: institution.solvencyRatioBps,
    };
  }

  const netCash = transferInstitutionFreeCashFlow(
    state,
    company,
    requestedFreeCashFlow,
  );
  company.operations.lastProfit = netIncome;
  company.operations.lastProduced = null;
  company.operations.lastSold = null;
  company.operations.plannedProduction = null;
  company.operations.utilization = null;
  company.equity = money(company.equity + netIncome);
  reconcileFinancialInstitutionBalanceSheet(company);
  recordFinancialPeriod(company, state.world.tick, {
    revenue,
    netIncome,
    freeCashFlow: netCash,
  });

  const cashTransfer = Math.abs(netCash);
  const journal = addJournal(state, {
    type: `${model}_cycle`,
    description: `${company.name} 第 ${state.world.tick} 日金融业务净现金结算`,
    postings:
      netCash >= 0
        ? [
            {
              account: `${company.id}.cash`,
              debit: cashTransfer,
              credit: 0,
            },
            {
              account: 'economy.cash_pool',
              debit: 0,
              credit: cashTransfer,
            },
          ]
        : [
            {
              account: 'economy.cash_pool',
              debit: cashTransfer,
              credit: 0,
            },
            {
              account: `${company.id}.cash`,
              debit: 0,
              credit: cashTransfer,
            },
          ],
    securityTransfers: [],
  });
  const event = addEvent(state, {
    type: 'financial_institution_cycle_settled',
    actorId: company.id,
    authority: 'financial_institution_rules',
    affectedEntities: [company.id, 'economy'],
    ledgerEntryIds: [journal.id],
    summary: resultSummary,
  });
  journal.eventId = event.id;
  const fact = addFact(state, {
    type: resultType,
    entityId: company.id,
    eventId: event.id,
    summary: resultSummary,
    value: {
      ...resultValue,
      revenue,
      netIncome,
      freeCashFlow: netCash,
      businessModel: model,
    },
  });
  const publishedValue = createPublishedFinancialValue(
    company,
    state.market.securities[company.symbol],
    state.economy,
  );
  const publishedAtMs =
    state.world.tick * SYNTHETIC_WORLD_DAY_MS;
  const financialFact = addFact(state, {
    type: 'company_financial_report',
    entityId: company.id,
    eventId: event.id,
    summary: `${company.name} 发布金融机构财务报告：收入 ${company.financials.trailingRevenue}，净利润 ${company.financials.trailingNetIncome}。`,
    publishedAtMs,
    value: publishedValue,
  });
  company.publishedFinancialSnapshot = {
    asOfTick: state.world.tick,
    publishedAtMs,
    sourceFactId: financialFact.id,
    value: clone(publishedValue),
  };
  addMemory(state, fact, {
    ownerId: 'public_market',
    content:
      model === 'commercial_bank'
        ? `${company.shortName} 的净息差、资产质量与资本约束受到市场关注。`
        : `${company.shortName} 的承保质量、准备金与投资收益受到市场关注。`,
    salience: clamp(
      0.38 + Math.abs(netIncome) / Math.max(1, company.equity) * 2,
      0.38,
      0.82,
    ),
  });
  synchronizeWorldValuations(state);
  const npcTrade = options.realtimeMarketAuthority
    ? null
    : settleNpcOrders(
        state,
        company,
        index,
        clamp(
          netIncome / Math.max(1, company.equity) * 0.18,
          -0.035,
          0.035,
        ),
      );
  return {
    event,
    fact,
    financialFact,
    netCash,
    netIncome,
    freeCashFlow: netCash,
    npcTrade,
  };
}

function settleCompanyCycle(state, company, index, options = {}) {
  if (
    company.operations.model === 'commercial_bank' ||
    company.operations.model === 'insurance_group'
  ) {
    return settleFinancialInstitutionCycle(
      state,
      company,
      index,
      options,
    );
  }
  const demandNoise = 0.82 + nextRandom(state) * 0.38;
  const cycleInfluence = 1 + state.economy.industrialCycle * 0.08;
  const demand = Math.max(
    8,
    Math.round(company.operations.baseDemand * demandNoise * cycleInfluence),
  );
  const planned = Math.max(0, company.operations.plannedProduction);
  const unitScale = company.financials.economicUnitScale;
  const unitProductionCost = Math.max(
    0.01,
    company.operations.unitCost * unitScale,
  );
  const availableDebtCapacity = Math.min(
    Math.max(0, company.funding.debtCeiling - company.debt),
    state.economy.cashPool,
  );
  const productionLiquidity =
    company.cash + availableDebtCapacity;
  const liquidityLimitedProduction = Math.max(
    0,
    Math.floor(productionLiquidity / unitProductionCost),
  );
  const produced = Math.min(
    company.capacity,
    planned,
    liquidityLimitedProduction,
  );
  const productionCost = money(
    produced * unitProductionCost,
  );
  const openingInventoryBookValue =
    company.inventoryBookValue;
  const availableInventory = company.inventory + produced;
  const availableInventoryBookValue = money(
    openingInventoryBookValue + productionCost,
  );
  const sold = Math.min(availableInventory, demand);
  const revenue = money(
    sold * company.operations.productPrice * unitScale,
  );
  const costOfGoodsSold =
    availableInventory > 0
      ? money(
          availableInventoryBookValue *
            sold /
            availableInventory,
        )
      : 0;
  const closingInventoryBookValue = money(
    Math.max(
      0,
      availableInventoryBookValue - costOfGoodsSold,
    ),
  );
  const operatingExpense = money(
    revenue * company.financials.operatingExpenseRatio,
  );
  const interestExpense = money(
    company.debt *
      company.financials.annualInterestRateBps /
      10_000 /
      company.financials.annualTradingDays,
  );
  const maintenanceCapex = money(
    revenue * company.financials.maintenanceCapexRatio,
  );
  const netIncome = money(
    revenue -
      costOfGoodsSold -
      operatingExpense -
      interestExpense,
  );
  const openingReceivables = company.receivables;
  const openingPayables = company.payables;
  const creditSalesRatio = clamp(
    0.18 +
      (1 - company.governance.disclosureQuality) * 0.08 +
      (nextRandom(state) - 0.5) * 0.025,
    0.08,
    0.38,
  );
  const receivableCollectionRate = clamp(
    0.16 +
      company.governance.managementConfidence * 0.08 +
      (nextRandom(state) - 0.5) * 0.025,
    0.1,
    0.32,
  );
  const supplierCreditRatio = clamp(
    0.12 +
      company.operations.marketShare * 0.08 +
      (nextRandom(state) - 0.5) * 0.02,
    0.06,
    0.24,
  );
  const payablePaymentRate = clamp(
    0.18 +
      company.governance.managementConfidence * 0.06 +
      (nextRandom(state) - 0.5) * 0.02,
    0.12,
    0.3,
  );
  let closingReceivables = money(
    Math.max(
      0,
      openingReceivables * (1 - receivableCollectionRate) +
        revenue * creditSalesRatio,
    ),
  );
  let closingPayables = money(
    Math.max(
      0,
      openingPayables * (1 - payablePaymentRate) +
        productionCost * supplierCreditRatio,
    ),
  );
  const cashCollections = money(
    Math.max(
      0,
      revenue + openingReceivables - closingReceivables,
    ),
  );
  const productionCashPayments = money(
    Math.max(
      0,
      productionCost + openingPayables - closingPayables,
    ),
  );
  const essentialFreeCashFlow = money(
    cashCollections -
      productionCashPayments -
      operatingExpense -
      interestExpense -
      maintenanceCapex,
  );
  const desiredExpansionCapex = money(
    company.operations.requestedExpansionUnits *
      company.operations.capacityCapexPerUnit,
  );
  const expansionCapacity = Math.max(
    0,
    company.cash +
      essentialFreeCashFlow +
      availableDebtCapacity,
  );
  const expansionCapex = money(
    Math.min(desiredExpansionCapex, expansionCapacity),
  );
  const accrualFreeCashFlow = money(
    essentialFreeCashFlow - expansionCapex,
  );
  const fundingNeed = money(
    Math.max(0, -(company.cash + accrualFreeCashFlow)),
  );
  const borrowed = money(
    Math.min(
      fundingNeed,
      Math.max(0, company.funding.debtCeiling - company.debt),
      state.economy.cashPool,
    ),
  );
  if (borrowed > 0) {
    company.cash = money(company.cash + borrowed);
    company.debt = money(company.debt + borrowed);
    state.economy.cashPool = money(
      state.economy.cashPool - borrowed,
    );
  }
  const unpaidCashShortfall = money(
    Math.max(
      0,
      -(company.cash + accrualFreeCashFlow),
    ),
  );
  closingPayables = money(
    closingPayables + unpaidCashShortfall,
  );
  const priorUnpaid = company.funding.unpaidObligations;
  const overduePaid = Math.min(
    priorUnpaid,
    money(openingPayables * payablePaymentRate),
  );
  company.funding.unpaidObligations = money(
    Math.max(0, priorUnpaid - overduePaid) +
      unpaidCashShortfall,
  );
  company.funding.consecutiveMissedPayments =
    company.funding.unpaidObligations > 0
      ? company.funding.consecutiveMissedPayments + 1
      : 0;
  company.funding.defaultStatus =
    company.funding.consecutiveMissedPayments >= 5
      ? 'default'
      : company.funding.unpaidObligations > 0
        ? 'delinquent'
        : 'current';
  company.funding.lastBorrowed = borrowed;
  company.funding.lastUnpaid = unpaidCashShortfall;

  let freeCashFlow = money(
    accrualFreeCashFlow + unpaidCashShortfall,
  );
  let cashTransfer;
  if (freeCashFlow >= 0) {
    cashTransfer = Math.min(
      freeCashFlow,
      state.economy.cashPool,
    );
    const uncollected = money(freeCashFlow - cashTransfer);
    if (uncollected > 0) {
      closingReceivables = money(
        closingReceivables + uncollected,
      );
      freeCashFlow = money(cashTransfer);
    }
    company.cash = money(company.cash + cashTransfer);
    state.economy.cashPool = money(state.economy.cashPool - cashTransfer);
  } else {
    cashTransfer = Math.min(-freeCashFlow, company.cash);
    company.cash = money(company.cash - cashTransfer);
    state.economy.cashPool = money(state.economy.cashPool + cashTransfer);
    freeCashFlow = money(-cashTransfer);
  }
  const netCash = freeCashFlow;

  company.propertyPlantEquipment = money(
    company.propertyPlantEquipment + expansionCapex,
  );
  company.operations.cumulativeExpansionCapex = money(
    company.operations.cumulativeExpansionCapex +
      expansionCapex,
  );
  company.operations.cumulativeReinvestment = money(
    company.operations.cumulativeReinvestment +
      expansionCapex,
  );
  company.operations.lastExpansionCapex = expansionCapex;
  company.operations.capacityPipeline = Number(
    (
      company.operations.capacityPipeline +
      expansionCapex /
        Math.max(
          0.01,
          company.operations.capacityCapexPerUnit,
        )
    ).toFixed(8),
  );
  if (company.operations.capacityPipeline >= 1) {
    const completedUnits = Math.floor(
      company.operations.capacityPipeline + 1e-8,
    );
    company.capacity += completedUnits;
    company.operations.capacityPipeline = Number(
      (
        company.operations.capacityPipeline -
        completedUnits
      ).toFixed(8),
    );
  }
  company.inventory = availableInventory - sold;
  company.inventoryBookValue = closingInventoryBookValue;
  company.operations.lastProduced = produced;
  company.operations.lastSold = sold;
  company.operations.lastProfit = netIncome;
  company.operations.utilization = Number(
    (produced / Math.max(1, company.capacity)).toFixed(4),
  );
  company.operations.plannedProduction = Math.max(
    8,
    Math.round(company.capacity * (0.52 + nextRandom(state) * 0.24)),
  );
  company.operations.reservedCash = 0;
  company.receivables = closingReceivables;
  company.payables = closingPayables;
  company.equity = money(
    company.cash +
      company.inventoryBookValue +
      company.propertyPlantEquipment +
      company.receivables -
      company.payables -
      company.debt,
  );
  recordFinancialPeriod(company, state.world.tick, {
    revenue,
    netIncome,
    freeCashFlow,
  });

  const postings = [];
  if (borrowed > 0) {
    postings.push(
      {
        account: `${company.id}.cash`,
        debit: borrowed,
        credit: 0,
      },
      {
        account: 'economy.cash_pool',
        debit: 0,
        credit: borrowed,
      },
    );
  }
  if (netCash >= 0) {
    postings.push(
      {
        account: `${company.id}.cash`,
        debit: cashTransfer,
        credit: 0,
      },
      {
        account: 'economy.cash_pool',
        debit: 0,
        credit: cashTransfer,
      },
    );
  } else {
    postings.push(
      {
        account: 'economy.cash_pool',
        debit: cashTransfer,
        credit: 0,
      },
      {
        account: `${company.id}.cash`,
        debit: 0,
        credit: cashTransfer,
      },
    );
  }
  const journal = addJournal(state, {
    type: 'company_operating_cycle',
    description: `${company.name} 第 ${state.world.tick} 日经营净现金结算`,
    postings,
    securityTransfers: [],
  });
  const event = addEvent(state, {
    type: 'company_cycle_settled',
    actorId: company.id,
    authority: 'operating_rules',
    affectedEntities: [company.id, 'economy'],
    ledgerEntryIds: [journal.id],
    summary: `${company.name} 生产 ${produced}、售出 ${sold}，经营净现金 ${netCash}。`,
  });
  journal.eventId = event.id;
  const fact = addFact(state, {
    type: 'company_operating_result',
    entityId: company.id,
    eventId: event.id,
    summary: `${company.name} 本期生产 ${produced}、售出 ${sold}，库存 ${company.inventory}。`,
    value: {
      produced,
      sold,
      inventory: company.inventory,
      inventoryBookValue: company.inventoryBookValue,
      netCash,
      revenue,
      netIncome,
      freeCashFlow,
      accrualFreeCashFlow,
      expansionCapex,
      propertyPlantEquipment:
        company.propertyPlantEquipment,
      borrowed,
      unpaidCashShortfall,
      defaultStatus: company.funding.defaultStatus,
      cashCollections,
      productionCashPayments,
      receivables: company.receivables,
      payables: company.payables,
    },
  });
  const publishedValue = createPublishedFinancialValue(
    company,
    state.market.securities[company.symbol],
    state.economy,
  );
  const publishedAtMs =
    state.world.tick * SYNTHETIC_WORLD_DAY_MS;
  const financialFact = addFact(state, {
    type: 'company_financial_report',
    entityId: company.id,
    eventId: event.id,
    summary: `${company.name} 发布本期财务：营业收入 ${company.financials.trailingRevenue}，净利润 ${company.financials.trailingNetIncome}，自由现金流 ${company.financials.trailingFreeCashFlow}。`,
    publishedAtMs,
    value: publishedValue,
  });
  company.publishedFinancialSnapshot = {
    asOfTick: state.world.tick,
    publishedAtMs,
    sourceFactId: financialFact.id,
    value: clone(publishedValue),
  };
  addMemory(state, fact, {
    ownerId: index === 1 ? 'supplier_network' : 'public_market',
    content: `${company.shortName} 本期交付和库存变化受到供应商与交易者关注。`,
    salience: clamp(0.38 + Math.abs(netCash) / 50_000, 0.38, 0.82),
  });

  const operatingSignal = clamp(
    netIncome / Math.max(1, company.equity) * 0.18 +
      (sold - company.operations.baseDemand) /
        Math.max(1, company.operations.baseDemand) *
        0.025,
    -0.035,
    0.035,
  );
  synchronizeWorldValuations(state);
  const npcTrade = options.realtimeMarketAuthority
    ? null
    : settleNpcOrders(state, company, index, operatingSignal);

  return {
    event,
    fact,
    financialFact,
    netCash,
    netIncome,
    freeCashFlow,
    npcTrade,
  };
}

function applyRoleObligations(state) {
  const role = state.player.roleType;
  if (role === 'household' && state.world.tick % 20 === 0) {
    const income = Math.min(
      state.economy.cashPool,
      money(state.player.roleState.monthlyIncome),
    );
    state.player.cash = money(state.player.cash + income);
    state.economy.cashPool = money(state.economy.cashPool - income);
    const incomeJournal = addJournal(state, {
      type: 'household_income_settlement',
      description: '家庭劳动与经营收入结算',
      postings: [
        { account: 'player.cash', debit: income, credit: 0 },
        { account: 'economy.cash_pool', debit: 0, credit: income },
      ],
    });
    const incomeEvent = addEvent(state, {
      type: 'household_income_settled',
      actorId: 'economy',
      authority: 'household_income_contract',
      affectedEntities: ['player', 'economy'],
      ledgerEntryIds: [incomeJournal.id],
      summary: `家庭收入 ${income} 已结算。`,
    });
    incomeJournal.eventId = incomeEvent.id;

    const expense = Math.min(
      state.player.cash,
      money(state.player.roleState.livingExpense),
    );
    state.player.cash = money(state.player.cash - expense);
    state.economy.cashPool = money(state.economy.cashPool + expense);
    const journal = addJournal(state, {
      type: 'household_living_expense',
      description: '家庭生活支出结算',
      postings: [
        { account: 'economy.cash_pool', debit: expense, credit: 0 },
        { account: 'player.cash', debit: 0, credit: expense },
      ],
    });
    const expenseEvent = addEvent(state, {
      type: 'household_obligation_settled',
      actorId: 'player',
      authority: 'household_budget',
      affectedEntities: ['player', 'economy'],
      ledgerEntryIds: [journal.id],
      summary: `家庭生活支出 ${expense} 已结算。`,
    });
    journal.eventId = expenseEvent.id;
  }

  if (role === 'professional') {
    const prices = Object.values(state.market.securities);
    const dispersion =
      Math.max(...prices.map((item) => item.lastPrice / item.referenceValue)) -
      Math.min(...prices.map((item) => item.lastPrice / item.referenceValue));
    const recentDissent = state.player.roleState.dissentLog.some(
      (entry) => state.world.tick - entry.tick <= 5,
    );
    state.player.roleState.reputation = Number(
      clamp(
        state.player.roleState.reputation +
          (recentDissent ? 0.02 : -0.005) -
          dispersion * 0.03,
        0,
        100,
      ).toFixed(4),
    );
  }

  if (state.world.tick % 10 === 0) {
    state.player.resources.research = Math.min(
      state.player.resources.researchMax,
      state.player.resources.research + 1,
    );
    state.player.resources.attention = Math.min(
      state.player.strengthTier === 'high' ? 8 : 5,
      state.player.resources.attention + 1,
    );
  }

  if (role === 'institution') {
    const attention = state.player.roleState.marketAttention;
    const buffer = state.player.roleState.liquidityBufferRatio;
    const pressureDelta = Math.max(
      0,
      attention * 0.008 +
        state.player.roleState.concentration * 0.3 -
        buffer * 0.012,
    );
    state.player.roleState.redemptionPressure = Number(
      clamp(
        state.player.roleState.redemptionPressure + pressureDelta,
        0,
        1,
      ).toFixed(6),
    );
    if (attention >= 1) {
      const event = addEvent(state, {
        type: 'institution_redemption_feedback',
        actorId: 'npc_clients',
        authority: 'entrusted_product_contract',
        affectedEntities: ['player'],
        summary: `大额可见行动提高了客户关注，赎回压力升至 ${(
          state.player.roleState.redemptionPressure * 100
        ).toFixed(1)}%。`,
      });
      const fact = addFact(state, {
        type: 'institution_redemption_pressure',
        entityId: 'player',
        eventId: event.id,
        summary: event.summary,
        value: state.player.roleState.redemptionPressure,
        visibility: 'player',
      });
      addMemory(state, fact, {
        ownerId: 'institution_clients',
        visibility: 'player',
        content: '部分委托客户记住了机构的集中交易与流动性暴露。',
        salience: clamp(0.5 + attention / 20, 0.5, 0.95),
      });

      const redemptionCash = money(
        Math.min(
          state.player.cash * 0.006,
          state.player.roleState.assetsUnderManagement *
            state.player.roleState.redemptionPressure *
            0.0003,
        ),
      );
      if (redemptionCash > 0) {
        state.player.cash = money(state.player.cash - redemptionCash);
        state.economy.cashPool = money(
          state.economy.cashPool + redemptionCash,
        );
        state.player.roleState.productLiability = money(
          Math.max(
            0,
            state.player.roleState.productLiability - redemptionCash,
          ),
        );
        state.player.roleState.assetsUnderManagement = money(
          Math.max(
            0,
            state.player.roleState.assetsUnderManagement - redemptionCash,
          ),
        );
        const redemptionJournal = addJournal(state, {
          type: 'institution_redemption_settlement',
          description: '机构产品赎回以真实现金结算',
          postings: [
            {
              account: 'economy.client_cash',
              debit: redemptionCash,
              credit: 0,
            },
            {
              account: 'player.institution_cash',
              debit: 0,
              credit: redemptionCash,
            },
          ],
        });
        const redemptionEvent = addEvent(state, {
          type: 'institution_redemption_settlement',
          actorId: 'npc_clients',
          authority: 'entrusted_product_contract',
          affectedEntities: ['player', 'economy'],
          parentIds: [event.id],
          ledgerEntryIds: [redemptionJournal.id],
          visibility: 'player',
          summary: `客户赎回 ${redemptionCash} 已从机构现金真实支付。`,
        });
        redemptionJournal.eventId = redemptionEvent.id;
        const settlementFact = addFact(state, {
          type: 'institution_redemption_cashflow',
          entityId: 'player',
          eventId: redemptionEvent.id,
          summary: redemptionEvent.summary,
          value: redemptionCash,
          visibility: 'player',
        });
        addMemory(state, settlementFact, {
          ownerId: 'institution_clients',
          visibility: 'player',
          content: '客户确认赎回款已经到账。',
          salience: 0.72,
        });
      }
    }
    state.player.roleState.marketAttention = Number(
      Math.max(0, attention * 0.94).toFixed(5),
    );
  }
}

function createPeriodicClue(state) {
  const company = COMPANY_TEMPLATES[state.world.tick % COMPANY_TEMPLATES.length];
  const qualityCycle = ['low', 'medium', 'high'];
  const quality = qualityCycle[state.world.tick % qualityCycle.length];
  const truthCycle = ['inconclusive', 'supported', 'refuted'];
  const truthState = truthCycle[
    Math.floor(nextRandom(state) * truthCycle.length)
  ];
  let linkedFact = null;
  for (let index = state.facts.length - 1; index >= 0; index -= 1) {
    if (state.facts[index].entityId === company.id) {
      linkedFact = state.facts[index];
      break;
    }
  }
  state.clues.push({
    id: nextId(state, 'clue'),
    companyId: company.id,
    title: `${company.shortName} 的第 ${state.world.tick} 日渠道观察`,
    summary:
      quality === 'low'
        ? '来源只描述了一个局部现象，尚不能外推整体经营。'
        : '多个局部记录出现同向变化，但仍需与结算事实核对。',
    source:
      quality === 'high'
        ? '经营记录抽样'
        : quality === 'medium'
          ? '产业访谈汇总'
          : '匿名渠道转述',
    sourceType: `${quality}_periodic_source`,
    quality,
    publishedTick: state.world.tick,
    status: 'unverified',
    verificationCost: quality === 'high' ? 2 : 1,
    truthState,
    factId: linkedFact?.id ?? null,
    missing: '下一经营周期尚未结算',
  });
}

function archiveItems(state, category, items) {
  if (items.length === 0) return;
  for (const item of items) {
    const tick = Number(item.tick ?? item.publishedTick ?? 0);
    const period = Math.floor(tick / 20);
    let block = state.historyArchive.blocks.find(
      (candidate) => candidate.period === period,
    );
    if (!block) {
      block = {
        id: `archive_${String(period).padStart(6, '0')}`,
        period,
        fromTick: period * 20,
        toTick: period * 20 + 19,
        counts: {},
        digest: '0',
      };
      state.historyArchive.blocks.push(block);
      state.historyArchive.blocks.sort((left, right) => left.period - right.period);
    }
    block.counts[category] = (block.counts[category] ?? 0) + 1;
    block.digest = hashString(
      `${block.digest}|${category}|${item.id ?? 'no_id'}|${tick}|${
        item.type ?? item.status ?? ''
      }|${item.summary ?? item.description ?? ''}`,
    ).toString(16);
    if (
      item.id &&
      (category === 'events' ||
        category === 'ledger' ||
        category === 'facts')
    ) {
      state.historyArchive.referenceIndex[item.id] = block.id;
    }
    state.historyArchive.totalArchived += 1;
  }
  if (category === 'events') {
    archiveWorldlineSourceEvidence(state.worldline, {
      eventIds: items.map((item) => item.id).filter(Boolean),
    });
  } else if (category === 'facts') {
    archiveWorldlineSourceEvidence(state.worldline, {
      factIds: items.map((item) => item.id).filter(Boolean),
    });
  }
}

/**
 * Converts the terminal order/trade records produced by the legacy daily
 * market into the world's existing digest archive before realtime books
 * become authoritative. The input is never mutated and active or unknown
 * orders fail closed because their reservations cannot be reconstructed.
 */
export function migrateLegacyMarketHistoryForRealtime(state) {
  const next = clone(state);
  ensureDerivativeCommodityBalances(next.economy);
  if (next.derivatives) {
    next.derivatives = restoreDerivatives(
      next.derivatives,
      { worldId: next.world.id },
    );
  }
  const orders = next.market?.orders ?? [];
  const trades = next.market?.trades ?? [];
  const legacyTrades = trades.filter(
    (trade) => trade.source === 'matched_npc_orders',
  );
  const referencedOrderIds = new Set(
    legacyTrades.flatMap((trade) => trade.orderIds ?? []),
  );
  const legacyOrders = orders.filter(
    (order) =>
      order.source === 'npc_strategy' ||
      referencedOrderIds.has(order.id),
  );
  if (legacyTrades.length === 0 && legacyOrders.length === 0) {
    return {
      state: next,
      migration: {
        applied: false,
        archivedTradeCount: 0,
        archivedOrderCount: 0,
        archiveBlockIds: [],
        archiveDigest: null,
      },
    };
  }
  if (
    !next.historyArchive ||
    !Array.isArray(next.historyArchive.blocks) ||
    !Number.isSafeInteger(next.historyArchive.totalArchived) ||
    !next.historyArchive.referenceIndex
  ) {
    throw new Error(
      'Invalid legacy market history archive.',
    );
  }

  const orderIds = new Set(orders.map((order) => order.id));
  for (const trade of legacyTrades) {
    if (
      !Array.isArray(trade.orderIds) ||
      trade.orderIds.length !== 2 ||
      trade.orderIds.some((orderId) => !orderIds.has(orderId))
    ) {
      throw new Error(
        `Invalid legacy NPC trade history: ${trade.id}`,
      );
    }
  }
  const legacyOrderIds = new Set(
    legacyOrders.map((order) => order.id),
  );
  const unsupportedOrders = orders.filter(
    (order) => !legacyOrderIds.has(order.id),
  );
  if (unsupportedOrders.length > 0) {
    throw new Error(
      'Legacy market contains orders that require a realtime checkpoint.',
    );
  }
  const terminalLegacyStatuses = new Set([
    'filled',
    'resource_rejected',
    'expired_no_cross',
  ]);
  const unarchivableLegacyOrder = legacyOrders.find(
    (order) =>
      !Number.isSafeInteger(order.remainingQuantity) ||
      order.remainingQuantity < 0 ||
      !terminalLegacyStatuses.has(order.status),
  );
  if (unarchivableLegacyOrder) {
    throw new Error(
      `Legacy market contains an active or unknown order without a realtime checkpoint: ${unarchivableLegacyOrder.id}`,
    );
  }

  const touchedPeriods = new Set(
    [...legacyTrades, ...legacyOrders].map((item) =>
      Math.floor(
        Number(item.tick ?? item.publishedTick ?? 0) / 20,
      ),
    ),
  );
  archiveItems(next, 'trades', legacyTrades);
  archiveItems(next, 'orders', legacyOrders);
  const legacyTradeIds = new Set(
    legacyTrades.map((trade) => trade.id),
  );
  next.market.trades = trades.filter(
    (trade) => !legacyTradeIds.has(trade.id),
  );
  next.market.orders = orders.filter(
    (order) => !legacyOrderIds.has(order.id),
  );
  const archiveBlocks = next.historyArchive.blocks.filter(
    (block) => touchedPeriods.has(block.period),
  );
  return {
    state: next,
    migration: {
      applied: true,
      archivedTradeCount: legacyTrades.length,
      archivedOrderCount: legacyOrders.length,
      archiveBlockIds: archiveBlocks.map((block) => block.id),
      archiveDigest: hashString(
        archiveBlocks
          .map((block) => `${block.id}:${block.digest}`)
          .join('|'),
      ).toString(16),
    },
  };
}

function trimCollection(state, category, collection, maximum, preserve) {
  if (collection.length <= maximum) return collection;
  let removalsNeeded = collection.length - maximum;
  const kept = [];
  const removed = [];
  for (const item of collection) {
    if (removalsNeeded > 0 && !(preserve?.(item) ?? false)) {
      removed.push(item);
      removalsNeeded -= 1;
    } else {
      kept.push(item);
    }
  }
  archiveItems(state, category, removed);
  return kept;
}

function detachRealtimeAuditHistory(state) {
  const facts = state.facts.filter(
    (fact) =>
      fact.type === 'realtime_market_fill' ||
      fact.id?.startsWith('rt_fact_'),
  );
  const factIds = new Set(facts.map((fact) => fact.id));
  const detached = {
    memories: state.memories.filter(
      (memory) =>
        memory.id?.startsWith('rt_memory_') ||
        factIds.has(memory.factId),
    ),
    facts,
    events: state.eventLog.filter(
      (event) =>
        event.type === 'realtime_market_trade' ||
        event.id?.startsWith('rt_event_'),
    ),
    ledger: state.ledger.filter(
      (journal) =>
        journal.type === 'realtime_secondary_trade_settlement' ||
        journal.id?.startsWith('rt_journal_'),
    ),
    trades: state.market.trades.filter(
      (trade) =>
        trade.source === 'realtime_order_book' ||
        trade.id?.startsWith('rt_trade_'),
    ),
  };
  const detachedIds = {
    memories: new Set(detached.memories.map((item) => item.id)),
    facts: new Set(detached.facts.map((item) => item.id)),
    events: new Set(detached.events.map((item) => item.id)),
    ledger: new Set(detached.ledger.map((item) => item.id)),
    trades: new Set(detached.trades.map((item) => item.id)),
  };
  state.memories = state.memories.filter(
    (item) => !detachedIds.memories.has(item.id),
  );
  state.facts = state.facts.filter(
    (item) => !detachedIds.facts.has(item.id),
  );
  state.eventLog = state.eventLog.filter(
    (item) => !detachedIds.events.has(item.id),
  );
  state.ledger = state.ledger.filter(
    (item) => !detachedIds.ledger.has(item.id),
  );
  state.market.trades = state.market.trades.filter(
    (item) => !detachedIds.trades.has(item.id),
  );
  return detached;
}

function restoreRealtimeAuditHistory(state, detached) {
  if (!detached) return;
  state.memories.push(...detached.memories);
  state.facts.push(...detached.facts);
  state.eventLog.push(...detached.events);
  state.ledger.push(...detached.ledger);
  state.market.trades.push(...detached.trades);
}

function compactHistory(state, options = {}) {
  const realtimeAuditHistory = options.preserveRealtimeAuditChains
    ? detachRealtimeAuditHistory(state)
    : null;
  state.clues = trimCollection(
    state,
    'clues',
    state.clues,
    WORLD_HISTORY_LIMITS.clues,
    (clue) =>
      clue.id === 'clue_supplier_log' ||
      clue.id === 'clue_channel_rumor' ||
      clue.id === 'clue_receivables_note',
  );
  state.memories = trimCollection(
    state,
    'memories',
    state.memories,
    WORLD_HISTORY_LIMITS.memories,
  );
  state.narratives = trimCollection(
    state,
    'narratives',
    state.narratives,
    WORLD_HISTORY_LIMITS.narratives,
  );
  state.replay = trimCollection(
    state,
    'replay',
    state.replay,
    WORLD_HISTORY_LIMITS.replay,
  );
  state.player.commitments = trimCollection(
    state,
    'commitments',
    state.player.commitments,
    WORLD_HISTORY_LIMITS.commitments,
  );
  if (state.player.roleState.dissentLog) {
    state.player.roleState.dissentLog = trimCollection(
      state,
      'dissent',
      state.player.roleState.dissentLog,
      WORLD_HISTORY_LIMITS.dissent,
    );
  }

  const acknowledgedSocialActions =
    state.socialCareer?.marketActionOutbox?.filter(
      (action) => action.status === 'acknowledged',
    ) ?? [];
  const protectedSocialFactIds = new Set(
    acknowledgedSocialActions.flatMap(
      (action) => action.worldFactIds ?? [],
    ),
  );
  const protectedSocialEventIds = new Set(
    acknowledgedSocialActions
      .map((action) => action.acknowledgementEventId)
      .filter(Boolean),
  );
  const protectedFactIds = new Set([
    ...state.clues.map((item) => item.factId).filter(Boolean),
    ...state.memories.map((item) => item.factId).filter(Boolean),
    ...state.narratives.map((item) => item.factId).filter(Boolean),
    ...state.replay.map((item) => item.factId).filter(Boolean),
    ...protectedSocialFactIds,
    ...Object.values(state.entities?.companies ?? {})
      .map(
        (company) =>
          company.publishedFinancialSnapshot?.sourceFactId,
      )
      .filter(Boolean),
    ...Object.values(state.market?.securities ?? {}).flatMap(
      (security) => [
        security.valuation?.sourceFinancialFactId,
        ...(security.valuation?.sourceFactIds ?? []),
      ],
    ).filter(Boolean),
  ]);
  state.facts = trimCollection(
    state,
    'facts',
    state.facts,
    WORLD_HISTORY_LIMITS.facts,
    (fact) =>
      fact.id.startsWith('fact_genesis_') || protectedFactIds.has(fact.id),
  );
  state.eventLog = trimCollection(
    state,
    'events',
    state.eventLog,
    WORLD_HISTORY_LIMITS.events,
    (event) =>
      event.id === 'event_genesis' ||
      protectedSocialEventIds.has(event.id),
  );
  state.ledger = trimCollection(
    state,
    'ledger',
    state.ledger,
    WORLD_HISTORY_LIMITS.ledger,
    (journal) => journal.type === 'genesis_opening',
  );
  state.market.trades = trimCollection(
    state,
    'trades',
    state.market.trades,
    WORLD_HISTORY_LIMITS.trades,
  );
  const liveTradeOrderIds = new Set(
    state.market.trades.flatMap(
      (trade) => trade.orderIds ?? [],
    ),
  );
  state.market.orders = trimCollection(
    state,
    'orders',
    state.market.orders,
    WORLD_HISTORY_LIMITS.orders,
    (order) => liveTradeOrderIds.has(order.id),
  );
  for (const security of Object.values(state.market.securities)) {
    security.priceHistory = trimCollection(
      state,
      `prices_${security.symbol}`,
      security.priceHistory,
      WORLD_HISTORY_LIMITS.securityPricePoints,
      (point) => point.tick === 0,
    );
  }
  const requiredArchivedReferences = new Set([
    ...state.eventLog.flatMap((event) => event.ledgerEntryIds ?? []),
    ...state.ledger.map((journal) => journal.eventId).filter(Boolean),
    ...state.market.trades.map((trade) => trade.eventId).filter(Boolean),
  ]);
  for (const archivedId of Object.keys(
    state.historyArchive.referenceIndex,
  )) {
    if (!requiredArchivedReferences.has(archivedId)) {
      delete state.historyArchive.referenceIndex[archivedId];
    }
  }
  if (state.historyArchive.blocks.length > 600) {
    const overflow = state.historyArchive.blocks.splice(
      0,
      state.historyArchive.blocks.length - 600,
    );
    const folded = {
      id: 'archive_folded_history',
      period: -1,
      fromTick: overflow[0].fromTick,
      toTick: overflow.at(-1).toTick,
      counts: {},
      digest: '0',
    };
    for (const block of overflow) {
      for (const [category, count] of Object.entries(block.counts)) {
        folded.counts[category] =
          (folded.counts[category] ?? 0) + count;
      }
      folded.digest = hashString(
        `${folded.digest}|${block.id}|${block.digest}`,
      ).toString(16);
    }
    state.historyArchive.blocks.unshift(folded);
  }
  restoreRealtimeAuditHistory(state, realtimeAuditHistory);
}

function settleLifeDay(state) {
  const life = ensureLifeState(state);
  const city = state.cityLife;
  if (life.lastSettledTick >= state.world.tick) return;
  const days = state.world.tick - life.lastSettledTick;
  const activeIds = new Set(
    Object.values(life.active).filter(Boolean),
  );
  const usefulPossessions = life.possessions.filter(
    (possession) =>
      possession.condition > 0 &&
      (
        (
          activeIds.has(possession.instanceId) &&
          (
            !lifeProductRequiresPlacement(
              LIFE_ITEM_BY_ID[possession.itemId],
            ) ||
            possession.placedHomeId === life.active.homeId
          )
        ) ||
        possession.placedHomeId === life.active.homeId
      ),
  );
  const combinedUseValue = usefulPossessions.reduce(
    (combined, possession) => {
      const values =
        LIFE_ITEM_BY_ID[possession.itemId]?.useValue ?? {};
      for (const [key, value] of Object.entries(values)) {
        combined[key] =
          Number(combined[key] ?? 0) + Number(value);
      }
      return combined;
    },
    {},
  );
  for (const [itemId, subscription] of Object.entries(
    life.subscriptions,
  )) {
    if (subscription.expiresAtTick <= state.world.tick) continue;
    const values = LIFE_ITEM_BY_ID[itemId]?.useValue ?? {};
    for (const [key, value] of Object.entries(values)) {
      combinedUseValue[key] =
        Number(combinedUseValue[key] ?? 0) + Number(value);
    }
  }
  for (const [itemId, contract] of Object.entries(
    life.serviceContracts,
  )) {
    if (contract.expiresAtTick <= state.world.tick) continue;
    const values = LIFE_ITEM_BY_ID[itemId]?.useValue ?? {};
    for (const [key, value] of Object.entries(values)) {
      combinedUseValue[key] =
        Number(combinedUseValue[key] ?? 0) + Number(value);
    }
  }
  life.energy = clamp(
    life.energy -
      days *
        Math.max(
          3,
          8 -
            Number(
              combinedUseValue.energyDecayReduction ?? 0,
            ),
        ),
    0,
    100,
  );
  life.satiety = clamp(
    life.satiety -
      days *
        Math.max(
          5,
          12 -
            Number(
              combinedUseValue.satietyDecayReduction ?? 0,
            ),
        ),
    0,
    100,
  );
  life.comfort = clamp(life.comfort - days * 2, 0, 100);
  life.mobility = clamp(
    life.mobility -
      days *
        Math.max(
          1,
          3 -
            Number(
              combinedUseValue.mobilityDecayReduction ?? 0,
            ),
        ),
    0,
    100,
  );
  life.health = clamp(
    life.health -
      days *
        Math.max(
          0.5,
          1.5 -
            Number(
              combinedUseValue.healthDecayReduction ?? 0,
            ),
        ),
    0,
    100,
  );
  const depreciatedAssetInstanceIds = [];
  let totalLifeAssetDepreciation = 0;
  for (const possession of life.possessions) {
    const product = LIFE_ITEM_BY_ID[possession.itemId];
    const depreciationPerDay =
      Number(product?.depreciationPerDay ?? 0);
    possession.condition = Number(
      Math.max(
        0,
        possession.condition -
          depreciationPerDay * days,
      ).toFixed(2),
    );
    const writtenDown = writeDownLifeAsset(
      state,
      possession,
      depreciationPerDay * days,
    );
    if (writtenDown > 0) {
      depreciatedAssetInstanceIds.push(
        possession.instanceId,
      );
      totalLifeAssetDepreciation = money(
        totalLifeAssetDepreciation + writtenDown,
      );
    }
  }
  if (totalLifeAssetDepreciation > 0) {
    const journal = addJournal(state, {
      type: 'life_asset_depreciation',
      description: '持有资产日常折旧',
      amount: totalLifeAssetDepreciation,
      assetInstanceIds: depreciatedAssetInstanceIds,
      postings: [
        {
          account: 'player.life_asset_depreciation_expense',
          debit: totalLifeAssetDepreciation,
          credit: 0,
        },
        {
          account: 'player.life_durable_assets',
          debit: 0,
          credit: totalLifeAssetDepreciation,
        },
      ],
    });
    const event = addEvent(state, {
      type: 'life_asset_depreciation',
      actorId: 'city_asset_registry',
      authority: 'life_asset_accounting',
      affectedEntities: [
        'player',
        ...depreciatedAssetInstanceIds,
      ],
      ledgerEntryIds: [journal.id],
      visibility: 'player',
      summary: `${depreciatedAssetInstanceIds.length} 件持有资产本日折旧 ${totalLifeAssetDepreciation.toFixed(2)} 元。`,
    });
    journal.eventId = event.id;
  }
  while (city.lastObligationTick + 10 <= state.world.tick) {
    const cycleCost = money(
      getLifeProjection(state).responsibility.upkeepPerCycle,
    );
    city.lastObligationTick += 10;
    life.lastUpkeepTick = city.lastObligationTick;
    if (cycleCost <= 0) continue;
    const sourceIds = life.possessions
      .filter((possession) => {
        const product = LIFE_ITEM_BY_ID[possession.itemId];
        return (
          Number(product?.upkeepPerCycle ?? 0) > 0 &&
          (
            possession.locationId === city.role.primaryPlaceId ||
            possession.locationId === city.role.parkingPlaceId
          )
        );
      })
      .map((possession) => possession.instanceId);
    accrueCityObligation(
      city,
      city.lastObligationTick,
      cycleCost,
      sourceIds,
      state.player.roleType,
    );
    life.upkeepDue = cityObligationAmount(city);
    const journal = addJournal(state, {
      type: 'life_upkeep_accrual',
      description: '生活责任费用到期',
      postings: [
        {
          account: 'player.life_expense',
          debit: cycleCost,
          credit: 0,
        },
        {
          account: 'player.life_upkeep_payable',
          debit: 0,
          credit: cycleCost,
        },
      ],
    });
    const event = addEvent(state, {
      type: 'life_upkeep_due',
      actorId: 'local_services',
      authority: 'local_services_cycle',
      affectedEntities: ['player', 'local_services'],
      ledgerEntryIds: [journal.id],
      visibility: 'player',
      summary: `本期责任费用 ${cycleCost.toFixed(2)} 元待结。`,
    });
    journal.eventId = event.id;
  }
  const restockBatches = advanceCityLifeState(
    city,
    state.world.tick,
    getLifeProductCatalog(),
  );
  for (const item of Object.values(LIFE_ITEM_BY_ID)) {
    life.shopStock[item.id] =
      city.supply.entries[item.id]?.stock ?? 0;
  }
  life.nextRestockTick = city.nextRestockTick;
  for (const batch of restockBatches) {
    if (batch.transfers.length === 0) continue;
    addEvent(state, {
      type: 'city_supply_restocked',
      actorId: 'city_suppliers',
      authority: 'city_supply_contract',
      affectedEntities: [
        'city_retail_cooperative',
        ...new Set(
          batch.transfers.map(
            (transfer) =>
              LIFE_ITEM_BY_ID[transfer.itemId]?.supplierId,
          ),
        ),
      ].filter(Boolean),
      visibility: 'player',
      summary: `${batch.transfers.length} 类城市供给完成补货。`,
    });
  }
  for (const [itemId, subscription] of Object.entries(
    life.subscriptions,
  )) {
    if (subscription.expiresAtTick <= state.world.tick) {
      delete life.subscriptions[itemId];
    }
  }
  for (const [itemId, contract] of Object.entries(
    life.serviceContracts,
  )) {
    if (contract.expiresAtTick <= state.world.tick) {
      delete life.serviceContracts[itemId];
    }
  }
  life.lastSettledTick = state.world.tick;
}

function settleEmbeddedDerivativesDay(
  state,
  options = {},
) {
  const atMs = derivativeWorldTimeMs(state);
  syncEmbeddedDerivatives(state, {
    atMs,
    source: 'world_daily_cycle',
  });
  const beforeAccount = clone(
    state.derivatives.accounts.player,
  );
  const commands = [
    {
      type: 'SETTLE_DAY',
      atMs,
      source: 'world_daily_cycle',
    },
    {
      type: 'EXPIRE_CONTRACTS',
      atMs,
      underlyingSettlementTicks:
        derivativeUnderlyingSpots(state),
      underlyingSettlementReferences:
        derivativeUnderlyingBasketReferences(state),
      source: 'world_daily_cycle',
    },
    {
      type: 'MAINTAIN_CONTRACTS',
      atMs,
      source: 'world_daily_cycle',
    },
  ];
  if (!options.realtimeMarketAuthority) {
    commands.push({
      type: 'RUN_ACTOR_CYCLE',
      atMs,
      source: 'world_daily_cycle',
    });
  }
  let settlementReceipt = null;
  for (const command of commands) {
    const result = reduceDerivatives(
      state.derivatives,
      command,
    );
    if (result.receipt.status !== 'applied') {
      throw new Error(
        `Derivative daily settlement failed: ${result.receipt.reason}`,
      );
    }
    state.derivatives = result.state;
    if (command.type === 'SETTLE_DAY') {
      settlementReceipt = result.receipt;
    }
  }
  const reconciliation =
    reconcileDerivativePlayerAccount(
      state,
      beforeAccount,
      state.derivatives.accounts.player,
    );
  if (!reconciliation.ok) {
    throw new Error(reconciliation.reason);
  }
  syncEmbeddedDerivatives(state, {
    atMs,
    source: 'world_daily_collateral_sync',
  });
  const event = recordDerivativeCashSettlement(
    state,
    reconciliation.cashDeltaCents,
    reconciliation.cashDeltaCents === 0
      ? '衍生品市场完成当日结算。'
      : '衍生品持仓完成当日结算。',
  );
  return {
    event,
    financingCashLiquidations:
      settlementReceipt
        ?.financingCashLiquidations ?? [],
    financingActions:
      settlementReceipt?.financingActions ?? [],
    securitiesLendingActions:
      settlementReceipt
        ?.securitiesLendingActions ?? [],
  };
}

function advanceOneTick(
  state,
  options = {},
  { reuseDraft = false } = {},
) {
  const next = reuseDraft ? state : clone(state);
  next.accounting.playerDayStartEquivalentCapitalCents =
    playerMarkedNetWorthCents(next);
  next.accounting.playerDayStartTick =
    next.world.tick + 1;
  next.world.tick += 1;
  next.world.calendar.day += 1;
  if (next.world.calendar.day > 240) {
    next.world.calendar.year += 1;
    next.world.calendar.day = 1;
  }
  next.economy.industrialCycle = Number(
    (
      Math.sin(next.world.tick / 9) * 0.55 +
      (nextRandom(next) - 0.5) * 0.15
    ).toFixed(5),
  );
  evolveEconomicStructure(next);
  evolveDerivativeCommodityBalances(next);
  Object.values(next.entities.companies).forEach(
    (company, index) =>
      evolveCompanyStructure(next, company, index),
  );
  const companyReceipts = Object.values(next.entities.companies).map(
    (company, index) => settleCompanyCycle(next, company, index, options),
  );
  applyRoleObligations(next);
  settleLifeDay(next);
  const socialResult = advanceSocialCareerEcology(
    next.socialCareer,
    {
      worldTick: next.world.tick,
      economyCashAvailable: next.economy.cashPool,
    },
  );
  next.socialCareer = socialResult.ecology;
  bindResearchReportSnapshots(next);
  next.player.cash = money(
    next.player.cash + socialResult.playerCashDelta,
  );
  next.economy.cashPool = money(
    next.economy.cashPool +
      socialResult.economyCashDelta,
  );
  next.player.resources.attention = clamp(
    next.player.resources.attention +
      socialResult.playerAttentionDelta,
    0,
    next.player.strengthTier === 'high' ? 8 : 5,
  );
  const socialJournals = socialResult.journals.map((entry) =>
    addJournal(next, entry),
  );
  const socialEvent = addEvent(next, {
    type: 'social_career_day_settled',
    actorId: 'social_world',
    authority: 'social_career_rules',
    affectedEntities: [
      ...Object.keys(next.socialCareer.actors),
      ...Object.keys(next.socialCareer.organizations),
    ],
    ledgerEntryIds: socialJournals.map((entry) => entry.id),
    summary: '街区人物、关系、工作与经营继续向前走了一日。',
  });
  for (const entry of socialJournals) {
    entry.eventId = socialEvent.id;
  }
  consumeSocialBusinessActions(next);
  const derivativesSettlement =
    settleEmbeddedDerivativesDay(next, options);
  synchronizeSocialCareerProjection(next);
  if (next.world.tick % 2 === 0) createPeriodicClue(next);
  for (const memory of next.memories) {
    if (memory.lastRecalledTick !== next.world.tick) {
      memory.salience = Number(
        Math.max(0.05, memory.salience * (1 - memory.decay)).toFixed(6),
      );
    }
  }
  const worldEvent = addEvent(next, {
    type: 'world_tick_completed',
    actorId: 'world_system',
    authority: 'deterministic_clock',
    affectedEntities: Object.keys(next.entities.companies),
    parentIds: [
      ...companyReceipts.map((item) => item.event.id),
      socialEvent.id,
      derivativesSettlement.event.id,
    ],
    summary: `世界推进到第 ${next.world.calendar.year} 年第 ${next.world.calendar.day} 日。`,
  });
  const receipt = {
    id: worldEvent.id,
    tick: next.world.tick,
    status: 'accepted',
    type: 'world_advanced',
    shortFeedback: `世界推进 1 日；企业、盘口、信息与角色义务已结算。`,
    longFeedback: '下一日从当前世界状态继续演化。',
    companyResults: companyReceipts.map((item) => ({
      companyId: item.fact.entityId,
      factId: item.fact.id,
      netCash: item.netCash,
      tradeId: item.npcTrade?.id ?? null,
    })),
    derivativeFinancingActions:
      derivativesSettlement.financingActions,
    derivativeFinancingCashLiquidations:
      derivativesSettlement
        .financingCashLiquidations,
    derivativeSecuritiesLendingActions:
      derivativesSettlement
        .securitiesLendingActions,
  };
  next.ui.lastReceipt = receipt;
  compactHistory(next, options);
  return { state: next, receipt };
}

export function advanceWorld(state, ticks = 1, options = {}) {
  if (!state || state.world?.status !== 'running') {
    throw new Error('A running LZY world is required.');
  }
  const count = Math.max(0, Math.floor(Number(ticks)));
  let current = count > 0 ? clone(state) : state;
  const receipts = [];
  for (let index = 0; index < count; index += 1) {
    const result = advanceOneTick(current, options, {
      reuseDraft: true,
    });
    current = result.state;
    receipts.push(result.receipt);
  }
  return { state: current, receipts };
}

function sumCash(state) {
  return money(
    state.player.cash +
      state.market.maker.cash +
      state.market.exchangeFeePool +
      state.economy.cashPool +
      socialCareerCashTotal(state.socialCareer) +
      Object.values(state.entities.investors ?? {}).reduce(
        (sum, investor) => sum + investor.cash,
        0,
      ) +
      Object.values(state.entities.companies).reduce(
        (sum, company) => sum + company.cash,
        0,
      ),
  );
}

function securityTotals(state) {
  return Object.fromEntries(
    Object.keys(state.market.securities).map((symbol) => [
      symbol,
      (state.player.holdings[symbol] ?? 0) +
        (state.market.maker.holdings[symbol] ?? 0) +
        Object.values(state.entities.investors ?? {}).reduce(
          (sum, investor) => sum + (investor.holdings[symbol] ?? 0),
          0,
        ),
    ]),
  );
}

export function auditWorld(state) {
  const errors = [];
  const worldlineAudit = auditWorldlineState(
    state.worldline,
    {
      availableEventIds: new Set(
        (state.eventLog ?? []).map((event) => event.id),
      ),
      availableFactIds: new Set(
        (state.facts ?? []).map((fact) => fact.id),
      ),
    },
  );
  errors.push(
    ...worldlineAudit.errors.map(
      (error) => `WORLDLINE:${error}`,
    ),
  );
  const totalCash = sumCash(state);
  if (Math.abs(totalCash - state.accounting.initialTotalCash) > 0.02) {
    errors.push(
      `CASH_NOT_CONSERVED: expected ${state.accounting.initialTotalCash}, received ${totalCash}`,
    );
  }
  const requiredStockSymbols =
    COMPANY_TEMPLATES.map(
      (template) => template.symbol,
    );
  const listedSymbols = Object.keys(
    state.market?.securities ?? {},
  );
  const companySymbols = Object.values(
    state.entities?.companies ?? {},
  ).map((company) => company.symbol);
  const accountingSymbols = Object.keys(
    state.accounting?.initialSecurityUnits ?? {},
  );
  const currentAccountingSymbols = Object.keys(
    state.accounting?.currentSecurityUnits ?? {},
  );
  const orderBookSymbols = Object.keys(
    state.market?.orderBooks ?? {},
  );
  const stockCatalogAligned =
    state.market?.stockUniverseVersion ===
      STOCK_UNIVERSE_VERSION &&
    sameSortedValues(
      listedSymbols,
      requiredStockSymbols,
    ) &&
    sameSortedValues(
      companySymbols,
      requiredStockSymbols,
    ) &&
    sameSortedValues(
      accountingSymbols,
      requiredStockSymbols,
    ) &&
    sameSortedValues(
      currentAccountingSymbols,
      requiredStockSymbols,
    ) &&
    sameSortedValues(
      orderBookSymbols,
      requiredStockSymbols,
    );
  if (!stockCatalogAligned) {
    errors.push(
      'INCOMPLETE_STOCK_UNIVERSE',
    );
  }
  for (const template of COMPANY_TEMPLATES) {
    const security =
      state.market?.securities?.[
        template.symbol
      ];
    const company =
      state.entities?.companies?.[
        template.id
      ];
    if (
      !security ||
      security.issuerId !== template.id ||
      company?.symbol !== template.symbol
    ) {
      errors.push(
        `INVALID_STOCK_CATALOG ${template.symbol}`,
      );
    }
  }
  for (const owner of [
    state.player,
    state.market?.maker,
    ...Object.values(
      state.entities?.investors ?? {},
    ),
  ]) {
    if (
      !owner?.holdings ||
      requiredStockSymbols.some(
        (symbol) =>
          !Number.isSafeInteger(
            owner.holdings[symbol],
          ) ||
          owner.holdings[symbol] < 0,
      )
    ) {
      errors.push(
        `INCOMPLETE_STOCK_HOLDINGS ${owner?.id ?? 'unknown'}`,
      );
    }
  }
  const commodityBalances =
    state.economy?.commodityBalances;
  for (const underlyingId of Object.keys(
    DERIVATIVE_COMMODITY_TEMPLATES,
  )) {
    const balance = commodityBalances?.[underlyingId];
    if (
      !balance ||
      balance.underlyingId !== underlyingId ||
      !Number.isSafeInteger(balance.spotTicks) ||
      balance.spotTicks <= 0 ||
      ![
        'productionIndex',
        'consumptionIndex',
        'inventoryIndex',
        'seasonality',
        'eventRisk',
      ].every((field) =>
        Number.isFinite(balance[field]),
      ) ||
      !Number.isSafeInteger(balance.carryBps) ||
      !Number.isSafeInteger(balance.lastUpdatedTick) ||
      balance.lastUpdatedTick > state.world.tick ||
      balance.authority !==
        'world_synthetic_commodity_balance'
    ) {
      errors.push(
        `INVALID_COMMODITY_BALANCE ${underlyingId}`,
      );
    }
  }
  const level2Product =
    state.market.marketDataProducts?.[LEVEL2_DEPTH_PRODUCT_ID];
  if (
    level2Product?.id !== LEVEL2_DEPTH_PRODUCT_ID ||
    !Number.isSafeInteger(level2Product.costCents) ||
    level2Product.costCents < 0 ||
    !Number.isSafeInteger(level2Product.termWorldDays) ||
    level2Product.termWorldDays <= 0 ||
    level2Product.depthLevels !== 100
  ) {
    errors.push('INVALID_MARKET_DATA_PRODUCT L2_DEPTH_100');
  }
  const level2Entitlement =
    state.player.marketDataEntitlements?.[LEVEL2_DEPTH_PRODUCT_ID];
  if (
    !level2Entitlement ||
    !['locked', 'active', 'expired'].includes(
      level2Entitlement.status,
    ) ||
    typeof level2Entitlement.eligible !== 'boolean' ||
    (
      level2Entitlement.status === 'active' &&
      (
        !Number.isSafeInteger(level2Entitlement.activatedAtTick) ||
        !Number.isSafeInteger(level2Entitlement.expiresAtTick) ||
        level2Entitlement.expiresAtTick <=
          level2Entitlement.activatedAtTick
      )
    )
  ) {
    errors.push('INVALID_MARKET_DATA_ENTITLEMENT L2_DEPTH_100');
  }
  const units = securityTotals(state);
  const issuanceLedger =
    state.accounting?.securityIssuanceLedger;
  const replayedSecurityUnits = {
    ...(state.accounting?.initialSecurityUnits ?? {}),
  };
  const appliedCorporateActionIds = new Set();
  if (!Array.isArray(issuanceLedger)) {
    errors.push('INVALID_SECURITY_ISSUANCE_LEDGER');
  } else {
    for (const [index, entry] of issuanceLedger.entries()) {
      const beforeUnits =
        replayedSecurityUnits[entry?.symbol];
      const validIdentity =
        entry &&
        typeof entry.actionId === 'string' &&
        entry.actionId.length > 0 &&
        typeof entry.symbol === 'string' &&
        Number.isSafeInteger(
          entry.splitNumerator,
        ) &&
        entry.splitNumerator > 0 &&
        Number.isSafeInteger(
          entry.splitDenominator,
        ) &&
        entry.splitDenominator > 0 &&
        entry.cashDividendCentsPerShare === 0 &&
        Number.isSafeInteger(entry.beforeUnits) &&
        Number.isSafeInteger(entry.afterUnits) &&
        Number.isSafeInteger(beforeUnits) &&
        entry.beforeUnits === beforeUnits;
      if (
        !validIdentity ||
        appliedCorporateActionIds.has(
          entry?.actionId,
        )
      ) {
        errors.push(
          `INVALID_SECURITY_ISSUANCE_ENTRY:${index}`,
        );
        continue;
      }
      const scaledNumerator =
        BigInt(beforeUnits) *
        BigInt(entry.splitNumerator);
      const scaledDenominator =
        BigInt(entry.splitDenominator);
      if (
        scaledNumerator %
          scaledDenominator !==
          0n ||
        scaledNumerator /
          scaledDenominator >
          BigInt(Number.MAX_SAFE_INTEGER) ||
        entry.afterUnits !==
          Number(
            scaledNumerator /
              scaledDenominator,
          )
      ) {
        errors.push(
          `INVALID_SECURITY_ISSUANCE_ROLL_FORWARD:${index}`,
        );
        continue;
      }
      appliedCorporateActionIds.add(
        entry.actionId,
      );
      replayedSecurityUnits[entry.symbol] =
        entry.afterUnits;
    }
  }
  for (const symbol of requiredStockSymbols) {
    if (
      replayedSecurityUnits[symbol] !==
      state.accounting?.currentSecurityUnits?.[
        symbol
      ]
    ) {
      errors.push(
        `SECURITY_ISSUANCE_ROLL_FORWARD_MISMATCH:${symbol}`,
      );
    }
  }
  let expectedValuations = { symbols: {} };
  try {
    expectedValuations =
      createValuationSnapshot(state);
  } catch (error) {
    errors.push(
      `INVALID_VALUATION_UNIVERSE ${error.message}`,
    );
  }
  for (const [symbol, expected] of Object.entries(
    state.accounting.currentSecurityUnits ?? {},
  )) {
    if (units[symbol] !== expected) {
      errors.push(
        `SECURITY_NOT_CONSERVED ${symbol}: expected ${expected}, received ${units[symbol]}`,
      );
    }
    if ((state.market.maker.holdings[symbol] ?? 0) < 0) {
      errors.push(`NEGATIVE_MARKET_MAKER_HOLDINGS ${symbol}`);
    }
    const security = state.market.securities[symbol];
    if (security?.outstandingUnits !== expected) {
      errors.push(
        `SECURITY_OUTSTANDING_UNITS_MISMATCH ${symbol}`,
      );
    }
    const expectedValuation = expectedValuations.symbols[symbol];
    if (!security || !expectedValuation) {
      errors.push(
        `MISSING_SECURITY_VALUATION ${symbol}`,
      );
      continue;
    }
    const storedValuation = security.valuation ?? {};
    const anchorFields = (valuation) => ({
      ruleVersion: valuation.ruleVersion,
      symbol: valuation.symbol,
      issuerId: valuation.issuerId,
      asOfTick: valuation.asOfTick,
      publishedAtMs: valuation.publishedAtMs,
      sourceFinancialFactId: valuation.sourceFinancialFactId,
      sharesOutstanding: valuation.sharesOutstanding,
      metrics: valuation.metrics,
      methods: valuation.methods,
      dynamicMultipleFactorBps:
        valuation.dynamicMultipleFactorBps,
      methodWeightsBps: valuation.methodWeightsBps,
      netDebtDiscountBps: valuation.netDebtDiscountBps,
      uncertaintyBps: valuation.uncertaintyBps,
      confidenceBps: valuation.confidenceBps,
      lowTicks: valuation.lowTicks,
      midpointTicks: valuation.midpointTicks,
      highTicks: valuation.highTicks,
      sourceFactIds: valuation.sourceFactIds,
    });
    if (
      JSON.stringify(anchorFields(storedValuation)) !==
      JSON.stringify(anchorFields(expectedValuation))
    ) {
      errors.push(`VALUATION_NOT_DERIVED ${symbol}`);
    }
    if (
      Math.abs(
        Number(security.referenceValue) -
          expectedValuation.midpointTicks / 100,
      ) > 0.000001
    ) {
      errors.push(`REFERENCE_NOT_VALUATION ${symbol}`);
    }
    const company =
      state.entities.companies[security.issuerId];
    const latestReport = state.facts
      .filter(
        (fact) =>
          fact.entityId === company.id &&
          fact.type === 'company_financial_report' &&
          fact.authority === 'world_fact' &&
          fact.visibility === 'public' &&
          fact.confidence > 0 &&
          fact.tick <= state.world.tick,
      )
      .sort(
        (left, right) =>
          left.tick - right.tick ||
          String(left.id).localeCompare(String(right.id)),
      )
      .at(-1);
    const publishedSnapshot =
      company.publishedFinancialSnapshot;
    const reportFields = [
      'trailingRevenue',
      'trailingNetIncome',
      'trailingFreeCashFlow',
      'priorTrailingRevenue',
      'priorTrailingNetIncome',
      'bookEquity',
      'cash',
      'debt',
      'netDebt',
      'receivables',
      'payables',
      'inventoryBookValue',
      'propertyPlantEquipment',
      'sharesOutstanding',
      'floatShares',
      'capacity',
      'expansionCapex',
      'cumulativeExpansionCapex',
      'debtCeiling',
      'unpaidObligations',
      'defaultStatus',
      'productivity',
      'technology',
      'marketShare',
      'expectedGrowthBps',
      'developmentIndex',
      'potentialDemandIndex',
      'priceLevel',
      'riskFreeRateBps',
      'creditSpreadBps',
      'disclosureQualityBps',
    ];
    if (
      !latestReport ||
      !publishedSnapshot ||
      latestReport.tick !== publishedSnapshot.asOfTick ||
      latestReport.publishedAtMs !==
        publishedSnapshot.publishedAtMs ||
      latestReport.id !== publishedSnapshot.sourceFactId ||
      reportFields.some(
        (field) =>
          JSON.stringify(latestReport.value?.[field]) !==
            JSON.stringify(
              publishedSnapshot.value?.[field],
            ),
      )
    ) {
      errors.push(`LATEST_REPORT_MISMATCH ${symbol}`);
    }
    const bucketRevenue = money(
      company.financials.reportingBuckets.reduce(
        (sum, bucket) => sum + bucket.revenue,
        0,
      ),
    );
    const bucketIncome = money(
      company.financials.reportingBuckets.reduce(
        (sum, bucket) => sum + bucket.netIncome,
        0,
      ),
    );
    const bucketFreeCashFlow = money(
      company.financials.reportingBuckets.reduce(
        (sum, bucket) => sum + bucket.freeCashFlow,
        0,
      ),
    );
    if (
      bucketRevenue !== company.financials.trailingRevenue ||
      bucketIncome !== company.financials.trailingNetIncome ||
      bucketFreeCashFlow !==
        company.financials.trailingFreeCashFlow
    ) {
      errors.push(`FINANCIAL_BUCKET_MISMATCH ${symbol}`);
    }
    if (
      (
        company.operations.model === 'commercial_bank' ||
        company.operations.model === 'insurance_group'
      ) &&
      !validFinancialInstitutionState(company)
    ) {
      errors.push(
        `INVALID_FINANCIAL_INSTITUTION_STATE ${symbol}`,
      );
    }
    const expectedEquity =
      company.operations.model === 'commercial_bank'
        ? centsToMoney(
            moneyToCents(company.cash) +
              company.financialInstitution.loansCents +
              company.financialInstitution
                .securitiesAssetsCents +
              company.financialInstitution
                .otherAssetsCents -
              company.financialInstitution
                .depositsCents -
              moneyToCents(company.debt),
          )
        : company.operations.model === 'insurance_group'
          ? centsToMoney(
              moneyToCents(company.cash) +
                company.financialInstitution
                  .investedAssetsCents +
                company.financialInstitution
                  .otherAssetsCents -
                company.financialInstitution
                  .insuranceReserveCents -
                moneyToCents(company.debt),
            )
          : money(
              company.cash +
                company.inventoryBookValue +
                company.propertyPlantEquipment +
                company.receivables -
                company.payables -
                company.debt,
            );
    if (Math.abs(company.equity - expectedEquity) > 0.02) {
      errors.push(`BALANCE_SHEET_MISMATCH ${symbol}`);
    }
    if (
      !Number.isFinite(company.inventoryBookValue) ||
      company.inventoryBookValue < 0 ||
      !Number.isFinite(company.initialPropertyPlantEquipment) ||
      company.initialPropertyPlantEquipment < 0 ||
      !Number.isFinite(company.propertyPlantEquipment) ||
      company.propertyPlantEquipment < 0
    ) {
      errors.push(`INVALID_ASSET_COST_BASIS ${symbol}`);
    }
    if (
      Math.abs(
        company.propertyPlantEquipment -
          company.initialPropertyPlantEquipment -
          company.operations.cumulativeExpansionCapex,
      ) > 0.02
    ) {
      errors.push(`CAPEX_ASSET_ROLL_FORWARD_MISMATCH ${symbol}`);
    }
    const maximumFundedCapacity =
      company.operations.initialCapacity +
      Math.floor(
        company.operations.cumulativeExpansionCapex /
          Math.max(
            0.01,
            company.operations.capacityCapexPerUnit,
          ) +
          1e-8,
      );
    if (company.capacity > maximumFundedCapacity) {
      errors.push(`UNFUNDED_CAPACITY ${symbol}`);
    }
    if (
      !Number.isFinite(company.funding?.debtCeiling) ||
      company.funding.debtCeiling < 0 ||
      !Number.isFinite(company.funding?.unpaidObligations) ||
      company.funding.unpaidObligations < 0 ||
      !['current', 'delinquent', 'default'].includes(
        company.funding?.defaultStatus,
      )
    ) {
      errors.push(`INVALID_FUNDING_STATE ${symbol}`);
    }
  }
  const openingJournal = state.ledger.find(
    (journal) => journal.type === 'genesis_opening',
  );
  if (openingJournal) {
    const openingSecurityJournals =
      state.ledger.filter((journal) =>
        [
          'genesis_opening',
          'stock_universe_migration',
        ].includes(journal.type),
      );
    for (const [symbol, expected] of Object.entries(
      state.accounting.initialSecurityUnits,
    )) {
      const openedUnits =
        openingSecurityJournals
          .flatMap(
            (journal) =>
              journal.securityTransfers ?? [],
          )
          .filter(
            (transfer) =>
              transfer.symbol === symbol,
          )
          .reduce(
            (sum, transfer) =>
              sum + transfer.quantity,
            0,
          );
      if (openedUnits !== expected) {
        errors.push(
          `GENESIS_SECURITY_NOT_TRACEABLE ${symbol}: expected ${expected}, received ${openedUnits}`,
        );
      }
    }
  } else {
    errors.push('MISSING_GENESIS_JOURNAL');
  }
  for (const journal of state.ledger) {
    const debits = money(
      journal.postings.reduce(
        (sum, posting) => sum + Number(posting.debit || 0),
        0,
      ),
    );
    const credits = money(
      journal.postings.reduce(
        (sum, posting) => sum + Number(posting.credit || 0),
        0,
      ),
    );
    if (Math.abs(debits - credits) > 0.02) {
      errors.push(
        `UNBALANCED_JOURNAL ${journal.id}: debit ${debits}, credit ${credits}`,
      );
    }
    if (journal.type === 'life_asset_depreciation') {
      const assetInstanceIds = Array.isArray(
        journal.assetInstanceIds,
      )
        ? journal.assetInstanceIds
        : [];
      const uniqueAssetIds = new Set(assetInstanceIds);
      const amount = Number(journal.amount);
      const expenseDebit = money(
        journal.postings
          .filter(
            (posting) =>
              posting.account ===
              'player.life_asset_depreciation_expense',
          )
          .reduce(
            (sum, posting) =>
              sum + Number(posting.debit || 0),
            0,
          ),
      );
      const durableAssetCredit = money(
        journal.postings
          .filter(
            (posting) =>
              posting.account === 'player.life_durable_assets',
          )
          .reduce(
            (sum, posting) =>
              sum + Number(posting.credit || 0),
            0,
          ),
      );
      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        assetInstanceIds.length === 0 ||
        uniqueAssetIds.size !== assetInstanceIds.length ||
        assetInstanceIds.some(
          (instanceId) =>
            typeof instanceId !== 'string' ||
            instanceId.length === 0,
        ) ||
        Math.abs(money(amount) - expenseDebit) > 0.02 ||
        Math.abs(money(amount) - durableAssetCredit) > 0.02
      ) {
        errors.push(
          `INVALID_LIFE_ASSET_DEPRECIATION_JOURNAL ${journal.id}`,
        );
      }
    }
  }
  const liveOrderIds = new Set(
    (state.market.orders ?? []).map((order) => order.id),
  );
  for (const trade of state.market.trades) {
    if (trade.source !== 'matched_npc_orders') continue;
    if (
      !state.entities.investors?.[trade.buyerId] ||
      !state.entities.investors?.[trade.sellerId] ||
      trade.buyerId === trade.sellerId
    ) {
      errors.push(`NPC_TRADE_WITHOUT_ENTITIES ${trade.id}`);
    }
    if (
      !Array.isArray(trade.orderIds) ||
      trade.orderIds.length !== 2 ||
      trade.orderIds.some((orderId) => !liveOrderIds.has(orderId))
    ) {
      errors.push(`NPC_TRADE_WITHOUT_LIVE_ORDERS ${trade.id}`);
    }
  }
  const liveJournalIds = new Set(state.ledger.map((journal) => journal.id));
  const liveEventIds = new Set(state.eventLog.map((event) => event.id));
  const archivedReferences = state.historyArchive?.referenceIndex ?? {};
  for (const event of state.eventLog) {
    for (const journalId of event.ledgerEntryIds ?? []) {
      if (!liveJournalIds.has(journalId) && !archivedReferences[journalId]) {
        errors.push(
          `EVENT_WITHOUT_JOURNAL ${event.id}: missing ${journalId}`,
        );
      }
    }
  }
  for (const journal of state.ledger) {
    if (
      !journal.eventId ||
      (!liveEventIds.has(journal.eventId) &&
        !archivedReferences[journal.eventId])
    ) {
      errors.push(
        `JOURNAL_WITHOUT_EVENT ${journal.id}: missing ${
          journal.eventId ?? 'null'
        }`,
      );
    }
  }
  for (const trade of state.market.trades) {
    if (
      trade.eventId &&
      !liveEventIds.has(trade.eventId) &&
      !archivedReferences[trade.eventId]
    ) {
      errors.push(
        `TRADE_WITHOUT_EVENT ${trade.id}: missing ${trade.eventId}`,
      );
    }
  }
  const factIds = new Set(state.facts.map((fact) => fact.id));
  for (const memory of state.memories) {
    if (!factIds.has(memory.factId)) {
      errors.push(`MEMORY_WITHOUT_FACT ${memory.id}`);
    }
  }
  for (const narrative of state.narratives) {
    if (!factIds.has(narrative.factId)) {
      errors.push(`NARRATIVE_WITHOUT_FACT ${narrative.id}`);
    }
  }
  const finiteCashHolders = [
    ['player', state.player.cash],
    ['market_maker', state.market.maker.cash],
    ['fee_pool', state.market.exchangeFeePool],
    ['economy', state.economy.cashPool],
    ...Object.values(state.entities.investors ?? {}).map((investor) => [
      investor.id,
      investor.cash,
    ]),
    ...Object.values(state.entities.companies).map((company) => [
      company.id,
      company.cash,
    ]),
    ...Object.values(state.socialCareer?.actors ?? {}).map(
      (actor) => [actor.id, actor.cash],
    ),
    ...Object.values(
      state.socialCareer?.organizations ?? {},
    ).map((organization) => [
      organization.id,
      organization.cash,
    ]),
  ];
  for (const [holder, value] of finiteCashHolders) {
    if (!Number.isFinite(value) || value < -0.001) {
      errors.push(`INVALID_CASH ${holder}: ${value}`);
    }
  }
  if (state.player.life !== undefined) {
    const lifeErrors = auditLifeState(
      state.player.life,
      state.world.tick,
    );
    if (lifeErrors.length > 0) {
      errors.push(
        `INVALID_PLAYER_LIFE_STATE: ${lifeErrors.join(', ')}`,
      );
    }
    const explicitLifeAssetValue =
      state.player.life.possessions.reduce(
        (sum, possession) =>
          sum + (Number(possession.carryingValue) || 0),
        0,
      );
    if (
      !Number.isFinite(state.player.otherAssets) ||
      state.player.otherAssets < -0.001 ||
      explicitLifeAssetValue >
        state.player.otherAssets + 0.001
    ) {
      errors.push(
        'INVALID_PLAYER_OTHER_ASSETS: explicit life assets exceed balance',
      );
    }
  }
  if (state.cityLife === undefined) {
    errors.push('MISSING_CITY_LIFE_STATE');
  } else {
    const cityLifeErrors = auditCityLifeState(
      state.cityLife,
      getLifeProductCatalog(),
      state.player.life,
      {
        worldTick: state.world.tick,
        roleType: state.player.roleType,
      },
    );
    if (cityLifeErrors.length > 0) {
      errors.push(
        `INVALID_CITY_LIFE_STATE: ${cityLifeErrors.join(', ')}`,
      );
    }
  }
  if (state.socialCareer === undefined) {
    errors.push('MISSING_SOCIAL_CAREER_STATE');
  } else {
    const socialErrors = auditSocialCareerEcology(
      state.socialCareer,
    );
    if (socialErrors.length > 0) {
      errors.push(
        `INVALID_SOCIAL_CAREER_STATE: ${socialErrors.join(', ')}`,
      );
    }
    const expectedProjection = projectSocialCareerEcology(
      state.socialCareer,
      {
        playerRoleType: state.player.roleType,
      },
    );
    if (
      JSON.stringify(state.economy.socialCareerPublic) !==
      JSON.stringify(expectedProjection)
    ) {
      errors.push('STALE_SOCIAL_CAREER_PROJECTION');
    }
    for (const action of
      state.socialCareer.marketActionOutbox ?? []) {
      if (action.status === 'pending_adapter') continue;
      if (
        action.status !== 'acknowledged' ||
        action.adapterVersion !==
          SOCIAL_BUSINESS_ADAPTER_VERSION ||
        !Number.isSafeInteger(
          action.acknowledgedTick,
        ) ||
        action.acknowledgedTick < action.tick ||
        (
          !liveEventIds.has(
            action.acknowledgementEventId,
          ) &&
          !archivedReferences[
            action.acknowledgementEventId
          ]
        ) ||
        !Array.isArray(action.worldFactIds) ||
        action.worldFactIds.length === 0 ||
        action.worldFactIds.some(
          (factId) =>
            (
              !factIds.has(factId) &&
              !archivedReferences[factId]
            ) ||
            (
              factIds.has(factId) &&
              state.facts.find(
                (fact) => fact.id === factId,
              )?.value?.sourceActionId !==
                action.id
            ),
        )
      ) {
        errors.push(
          `INVALID_SOCIAL_BUSINESS_ACKNOWLEDGEMENT ${action.id}`,
        );
      }
    }
  }
  if (state.derivatives === undefined) {
    errors.push('MISSING_DERIVATIVES_STATE');
  } else {
    const derivativeAudit =
      auditDerivativesState(state.derivatives);
    if (!derivativeAudit.ok) {
      errors.push(
        `INVALID_DERIVATIVES_STATE: ${derivativeAudit.errors.join(', ')}`,
      );
    }
    if (state.derivatives.worldId !== state.world.id) {
      errors.push('DERIVATIVES_WORLD_MISMATCH');
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    totals: {
      cash: totalCash,
      securityUnits: units,
    },
  };
}

export function serializeWorld(state) {
  return JSON.stringify(state);
}

function migrateLegacyLifeState(state) {
  const hadLifeState = Boolean(
    state.player.life && typeof state.player.life === 'object',
  );
  const hadCityLife = Boolean(
    state.cityLife && typeof state.cityLife === 'object',
  );
  const legacyDue =
    Number.isFinite(state.player.life?.upkeepDue) &&
    state.player.life.upkeepDue > 0
      ? money(state.player.life.upkeepDue)
      : 0;
  state.player.life = normalizeLifeState(state);
  if (!hadLifeState) state.cityLife = undefined;
  if (!hadCityLife || !hadLifeState) {
    state.player.life.lastSettledTick = state.world.tick;
    state.player.life.lastUpkeepTick = state.world.tick;
    state.player.life.nextRestockTick =
      Math.floor(state.world.tick / 5) * 5 + 5;
  }
  state.cityLife = normalizeCityLifeState(
    state,
    getLifeProductCatalog(),
  );
  const life = state.player.life;
  if (
    legacyDue > 0 &&
    cityObligationAmount(state.cityLife) <= 0
  ) {
    accrueCityObligation(
      state.cityLife,
      state.world.tick,
      legacyDue,
      [],
      state.player.roleType,
    );
  }
  life.lastUpkeepTick = state.cityLife.lastObligationTick;
  life.nextRestockTick = state.cityLife.nextRestockTick;
  life.upkeepDue = cityObligationAmount(state.cityLife);
  synchronizeLifeLocations(life, state.cityLife, LIFE_ITEM_BY_ID);
  const activeHomeId = life.active.homeId;
  if (!activeHomeId) return;
  for (const instanceId of Object.values(life.active)) {
    const possession = life.possessions.find(
      (candidate) => candidate.instanceId === instanceId,
    );
    if (
      possession &&
      lifeProductRequiresPlacement(
        LIFE_ITEM_BY_ID[possession.itemId],
      )
    ) {
      possession.placedHomeId = activeHomeId;
      possession.locationId = state.cityLife.role.primaryPlaceId;
    }
  }
}

function migrateLegacySocialCareerState(state) {
  if (state.socialCareer !== undefined) {
    if (
      state.socialCareer?.schemaVersion !==
      socialCareerSchemaVersion()
    ) {
      throw new Error(
        'Invalid or incompatible LZY social-career save.',
      );
    }
    state.socialCareer =
      normalizeSocialCareerEcology(
        state.socialCareer,
        {
          roleType: state.player.roleType,
          strengthTier:
            state.player.strengthTier,
        },
      );
    synchronizeSocialCareerProjection(state);
    return;
  }
  const ecology = createSocialCareerEcology({
    seed: state.world.seed,
    roleType: state.player.roleType,
    strengthTier: state.player.strengthTier,
    worldTick: state.world.tick,
  });
  const openingCash = socialCareerCashTotal(ecology);
  if (state.economy.cashPool + 0.000001 < openingCash) {
    throw new Error(
      'Invalid or incompatible LZY social-career save.',
    );
  }
  state.economy.cashPool = money(
    state.economy.cashPool - openingCash,
  );
  state.socialCareer = ecology;
  synchronizeSocialCareerProjection(state);
}

const LEGACY_THREE_STOCK_SYMBOLS = Object.freeze([
  'LZA001',
  'LZA002',
  'LZA003',
]);
const LEGACY_EIGHT_STOCK_SYMBOLS = Object.freeze([
  ...LEGACY_THREE_STOCK_SYMBOLS,
  'LZB101',
  'LZC201',
  'LZD301',
  'LZE401',
  'LZF501',
]);

function sameSortedValues(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    return false;
  }
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  return sortedActual.every(
    (value, index) => value === sortedExpected[index],
  );
}

function migrateSecurityIssuanceAccounting(state) {
  state.accounting ??= {};
  const initial =
    state.accounting.initialSecurityUnits ?? {};
  if (
    !state.accounting.currentSecurityUnits ||
    typeof state.accounting.currentSecurityUnits !==
      'object' ||
    Array.isArray(
      state.accounting.currentSecurityUnits,
    )
  ) {
    state.accounting.currentSecurityUnits =
      clone(initial);
  }
  if (
    !Array.isArray(
      state.accounting.securityIssuanceLedger,
    )
  ) {
    state.accounting.securityIssuanceLedger = [];
  }
  for (const [symbol, units] of Object.entries(
    initial,
  )) {
    state.accounting.currentSecurityUnits[
      symbol
    ] ??= units;
  }
}

function migrateLegacyStockUniverseState(state) {
  migrateSecurityIssuanceAccounting(state);
  const currentSymbols = COMPANY_TEMPLATES.map(
    (template) => template.symbol,
  );
  const actualSymbols = Object.keys(
    state.market?.securities ?? {},
  );
  state.market.stockUniverseVersion =
    STOCK_UNIVERSE_VERSION;
  const knownLegacyUniverse =
    sameSortedValues(
      actualSymbols,
      LEGACY_THREE_STOCK_SYMBOLS,
    ) ||
    sameSortedValues(
      actualSymbols,
      LEGACY_EIGHT_STOCK_SYMBOLS,
    );
  if (
    !sameSortedValues(actualSymbols, currentSymbols) &&
    !knownLegacyUniverse
  ) {
    throw new Error(
      'Invalid or incompatible LZY stock-universe save.',
    );
  }
  for (const template of COMPANY_TEMPLATES) {
    const company =
      state.entities?.companies?.[template.id];
    const security =
      state.market?.securities?.[template.symbol];
    if (company) {
      company.sector ??= template.sector;
      company.size ??= template.size;
      company.balanceSheetModel ??=
        template.balanceSheetModel;
      company.businessModel ??=
        clone(template.businessModel);
      company.operations.model ??=
        template.businessModel.kind;
      if (template.financialInstitution) {
        company.financialInstitution =
          normalizeFinancialInstitutionState(
            company.operations.model,
            company.financialInstitution,
            template.financialInstitution,
          );
        reconcileFinancialInstitutionBalanceSheet(
          company,
        );
      } else {
        company.financialInstitution ??= null;
      }
    }
    if (security) {
      const canonical = createListedSecurity(template);
      security.derivativeBasketOpeningPriceTicks ??=
        openingSecurityPriceTicks(security);
      const hasIssuanceAdjustment =
        state.accounting
          .currentSecurityUnits?.[
            template.symbol
          ] !==
        state.accounting
          .initialSecurityUnits?.[
            template.symbol
          ];
      const issuanceAdjustedFields =
        new Set([
          'floatShares',
          'advUnits',
          'liquidityProfile',
          'depthProfile',
        ]);
      for (const field of [
        'board',
        'dailyLimitBps',
        'industry',
        'sector',
        'lifecycle',
        'size',
        'balanceSheetModel',
        'informationQuality',
        'macroExposure',
        'businessModel',
        'priceLimitBps',
        'floatShares',
        'advUnits',
        'liquidityProfile',
        'depthProfile',
        'volatilityProfile',
        'catalystProfile',
      ]) {
        if (
          hasIssuanceAdjustment &&
          issuanceAdjustedFields.has(field)
        ) {
          continue;
        }
        security[field] = clone(canonical[field]);
      }
    }
  }
  if (sameSortedValues(actualSymbols, currentSymbols)) {
    return {
      migrated: false,
      addedSymbols: [],
    };
  }
  const legacyCompanySymbols = Object.values(
    state.entities?.companies ?? {},
  ).map((company) => company.symbol);
  const legacyAccountingSymbols = Object.keys(
    state.accounting?.initialSecurityUnits ?? {},
  );
  if (
    !sameSortedValues(
      legacyCompanySymbols,
      actualSymbols,
    ) ||
    !sameSortedValues(
      legacyAccountingSymbols,
      actualSymbols,
    ) ||
    !state.market?.maker?.holdings ||
    !state.market?.orderBooks ||
    !state.entities?.investors
  ) {
    throw new Error(
      'Invalid or inconsistent LZY legacy stock-universe save.',
    );
  }
  const persistentInvestorTemplates =
    NPC_INVESTOR_TEMPLATES.filter(
      (template) => !template.strategicIssuerId,
    );
  if (
    persistentInvestorTemplates.some(
      (template) =>
        !state.entities.investors[template.id],
    )
  ) {
    throw new Error(
      'Invalid or inconsistent LZY legacy investor ledger.',
    );
  }

  const missingTemplates = COMPANY_TEMPLATES.filter(
    (template) =>
      !actualSymbols.includes(
        template.symbol,
      ),
  );
  const addedCompanyIds = [];
  let recognizedCash = 0;
  for (const template of missingTemplates) {
    const templateIndex = COMPANY_TEMPLATES.findIndex(
      (candidate) => candidate.symbol === template.symbol,
    );
    const company = createCompany(
      template,
      templateIndex,
    );
    const security = createListedSecurity(template);
    state.entities.companies[company.id] = company;
    state.market.securities[security.symbol] = security;
    state.market.orderBooks[security.symbol] =
      makeOrderBook(
        template.openingPrice,
        templateIndex,
      );
    state.accounting.initialSecurityUnits[
      security.symbol
    ] = security.outstandingUnits;
    state.accounting.currentSecurityUnits[
      security.symbol
    ] = security.outstandingUnits;
    state.player.holdings[security.symbol] = 0;
    recognizedCash = money(
      recognizedCash + company.cash,
    );
    addedCompanyIds.push(company.id);
  }

  for (const template of NPC_INVESTOR_TEMPLATES) {
    let investor =
      state.entities.investors[template.id];
    if (!investor) {
      if (!template.strategicIssuerId) {
        throw new Error(
          `Missing persistent investor ${template.id}.`,
        );
      }
      investor = {
        id: template.id,
        name: template.name,
        strategy: template.strategy,
        cash: template.cash,
        holdings: {},
        tradingEnabled:
          template.tradingEnabled !== false,
        holderKind:
          template.holderKind ?? 'active_investor',
        memory: {
          lastTradeTick: null,
          visibleImpact: 0,
        },
      };
      state.entities.investors[template.id] =
        investor;
    }
    investor.holdings ??= {};
    for (const symbol of currentSymbols) {
      if (
        Object.hasOwn(
          investor.holdings,
          symbol,
        )
      ) {
        continue;
      }
      investor.holdings[symbol] =
        investorTemplateHolding(
          template,
          state.market.securities[symbol],
        );
    }
  }

  const securityTransfers = [];
  for (const template of missingTemplates) {
    const security =
      state.market.securities[template.symbol];
    const investorTotal = Object.values(
      state.entities.investors,
    ).reduce(
      (sum, investor) =>
        sum +
        Number(
          investor.holdings[template.symbol] ?? 0,
        ),
      0,
    );
    const playerUnits =
      state.player.holdings[template.symbol] ?? 0;
    const makerUnits =
      security.outstandingUnits -
      investorTotal -
      playerUnits;
    if (
      !Number.isSafeInteger(makerUnits) ||
      makerUnits < 0
    ) {
      throw new Error(
        `Invalid migrated share allocation for ${template.symbol}.`,
      );
    }
    state.market.maker.holdings[
      template.symbol
    ] = makerUnits;
    securityTransfers.push(
      {
        symbol: template.symbol,
        from:
          'stock_universe_migration_security_account',
        to: state.market.maker.id,
        quantity: makerUnits,
      },
      ...Object.values(
        state.entities.investors,
      ).map((investor) => ({
        symbol: template.symbol,
        from:
          'stock_universe_migration_security_account',
        to: investor.id,
        quantity:
          investor.holdings[
            template.symbol
          ] ?? 0,
      })),
      {
        symbol: template.symbol,
        from:
          'stock_universe_migration_security_account',
        to: 'player',
        quantity: playerUnits,
      },
    );
  }

  state.accounting.initialTotalCash = money(
    Number(state.accounting.initialTotalCash) +
      recognizedCash,
  );
  const migrationJournal = addJournal(state, {
    type: 'stock_universe_migration',
    description:
      `旧版${actualSymbols.length}股世界扩展为完整上市公司网络`,
    postings: [
      {
        account:
          'world.stock_universe_migration_assets',
        debit: recognizedCash,
        credit: 0,
      },
      {
        account:
          'world.stock_universe_migration_equity',
        debit: 0,
        credit: recognizedCash,
      },
    ],
    securityTransfers,
  });
  const migrationEvent = addEvent(state, {
    type: 'stock_universe_migrated',
    actorId: 'world_system',
    authority:
      'stock_universe_schema_migration_v1',
    affectedEntities: [
      ...addedCompanyIds,
      ...missingTemplates.map(
        (template) => template.symbol,
      ),
    ],
    ledgerEntryIds: [migrationJournal.id],
    visibility: 'public',
    summary:
      '交易所补齐了新版世界中的上市公司与股权托管记录。',
  });
  migrationJournal.eventId = migrationEvent.id;

  const publishedAtMs =
    state.world.tick * SYNTHETIC_WORLD_DAY_MS;
  for (const template of missingTemplates) {
    const company =
      state.entities.companies[template.id];
    const security =
      state.market.securities[template.symbol];
    const publishedValue =
      createPublishedFinancialValue(
        company,
        security,
        state.economy,
      );
    const fact = addFact(state, {
      type: 'company_financial_report',
      entityId: company.id,
      eventId: migrationEvent.id,
      summary: `${company.name}的公开财务档案已接入交易所。`,
      publishedAtMs,
      value: publishedValue,
      visibility: 'public',
    });
    company.publishedFinancialSnapshot = {
      asOfTick: state.world.tick,
      publishedAtMs,
      sourceFactId: fact.id,
      value: clone(publishedValue),
    };
  }
  synchronizeWorldValuations(state);
  if (state.player.roleType === 'institution') {
    state.player.roleState.concentration =
      calculateInstitutionConcentration(state);
  }
  return {
    migrated: true,
    addedSymbols: missingTemplates.map(
      (template) => template.symbol,
    ),
  };
}

function migrateLegacyDerivativesState(state) {
  if (state.derivatives === undefined) {
    state.derivatives = createEmbeddedDerivatives(state);
    syncEmbeddedDerivatives(state);
    return;
  }
  state.derivatives = restoreDerivatives(
    state.derivatives,
    { worldId: state.world.id },
  );
}

export function migrateEmbeddedWorldStateForRestore(state) {
  if (
    !state.player.life ||
    state.player.life.schemaVersion !== 'lzy-life-v2' ||
    !state.cityLife ||
    state.cityLife.contractVersion !==
      CITY_LIFE_CONTRACT_VERSION ||
    (
      state.player.life.lastUpkeepTick === undefined &&
      state.player.life.upkeepDue === undefined
    ) ||
    state.player.life.assetAccountingVersion !==
      'lzy-life-assets-v1' ||
    state.player.life.possessions?.some(
      (possession) =>
        possession.carryingValue === undefined,
    )
  ) {
    migrateLegacyLifeState(state);
  }
  const stockUniverseMigration =
    migrateLegacyStockUniverseState(state);
  bindResearchReportSnapshots(state, {
    snapshotOrigin: 'legacy_restore',
  });
  const derivativesWereMissing =
    state.derivatives === undefined;
  migrateLegacyDerivativesState(state);
  if (
    !derivativesWereMissing &&
    stockUniverseMigration.migrated
  ) {
    synchronizeEmbeddedDerivatives(state);
  }
  normalizeWorldlineState(state);
  return state;
}

export function deserializeWorld(payload) {
  const state = JSON.parse(payload);
  if (
    !state ||
    state.world?.ruleVersion !== RULE_VERSION ||
    !ROLE_TYPES.includes(state.player?.roleType)
  ) {
    throw new Error('Invalid or incompatible LZY save.');
  }
  if (state.player.life) {
    const legacyVersion = state.player.life.schemaVersion;
    if (
      legacyVersion !== 'lzy-life-v2' &&
      legacyVersion !== undefined &&
      legacyVersion !== null &&
      legacyVersion !== 'lzy-life-v1'
    ) {
      throw new Error('Invalid or incompatible LZY life save.');
    }
  }
  if (
    state.cityLife &&
    ![
      CITY_LIFE_CONTRACT_VERSION,
      'lzy-city-life-v1',
    ].includes(state.cityLife.contractVersion)
  ) {
    throw new Error('Invalid or incompatible LZY city-life save.');
  }
  if (
    !state.player.life ||
    state.player.life.schemaVersion !== 'lzy-life-v2' ||
    !state.cityLife ||
    state.cityLife.contractVersion !== CITY_LIFE_CONTRACT_VERSION ||
    (
      state.player.life.lastUpkeepTick === undefined &&
      state.player.life.upkeepDue === undefined
    ) ||
    state.player.life.assetAccountingVersion !==
      'lzy-life-assets-v1' ||
    state.player.life.possessions?.some(
      (possession) =>
        possession.carryingValue === undefined,
    )
  ) {
  migrateLegacyLifeState(state);
  }
  migrateLegacySocialCareerState(state);
  migrateLegacyStockUniverseState(state);
  bindResearchReportSnapshots(state, {
    snapshotOrigin: 'legacy_restore',
  });
  migrateLegacyDerivativesState(state);
  normalizeWorldlineState(state);
  state.accounting ??= {};
  if (
    !Number.isSafeInteger(
      state.accounting
        .playerDayStartEquivalentCapitalCents,
    ) ||
    !Number.isSafeInteger(
      state.accounting.playerDayStartTick,
    )
  ) {
    state.accounting
      .playerDayStartEquivalentCapitalCents =
      playerMarkedNetWorthCents(state);
    state.accounting.playerDayStartTick =
      state.world.tick;
  }
  const audit = auditWorld(state);
  if (!audit.ok) {
    throw new Error(
      `Invalid or inconsistent LZY save: ${audit.errors.join('; ')}`,
    );
  }
  return state;
}

export function getRoleCatalog() {
  return clone(PROFILE_TEMPLATES);
}

export function getCompanyCatalog() {
  return clone(COMPANY_TEMPLATES);
}

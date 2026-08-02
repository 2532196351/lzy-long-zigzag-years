function productImage(itemId) {
  return `./assets/life/products/${itemId}-v1.jpg`;
}

const PRODUCT_INTERACTIONS = Object.freeze({
  city_bicycle: Object.freeze({
    destination: '停车与车库',
    actionLabel: '骑车通勤',
    outcome: '补足出行状态，累计使用并产生车况损耗。',
  }),
  commuter_scooter: Object.freeze({
    destination: '停车与车库',
    actionLabel: '骑行通勤',
    outcome: '扩大通勤半径，累计使用并产生车况损耗。',
  }),
  city_sedan: Object.freeze({
    destination: '停车与车库',
    actionLabel: '驾驶出行',
    outcome: '补足长距离出行，累计里程感知的使用与车况损耗。',
  }),
  compact_studio: Object.freeze({
    destination: '住处',
    actionLabel: '回到单间',
    outcome: '成为可切换住处，提供起居空间、休息恢复与维护责任。',
  }),
  city_apartment: Object.freeze({
    destination: '住处',
    actionLabel: '回家起居',
    outcome: '成为可切换住处，增加摆放和车位容量并承担维护责任。',
  }),
  family_home: Object.freeze({
    destination: '住处',
    actionLabel: '家庭起居',
    outcome: '成为可切换住处，提供更大空间、车位与休息恢复。',
  }),
  operator_workshop: Object.freeze({
    destination: '经营现场',
    actionLabel: '开展经营',
    outcome: '成为企业主要场所，承载设备、车队和经营效率。',
  }),
  institution_headquarters: Object.freeze({
    destination: '机构总部',
    actionLabel: '组织办公',
    outcome: '成为机构主要场所，承载团队设备、车位和运营效率。',
  }),
  pocket_phone: Object.freeze({
    destination: '随身与常用',
    actionLabel: '处理联络',
    outcome: '设为常用后支持异地联络，使用会恢复少量精力并产生损耗。',
  }),
  daily_phone: Object.freeze({
    destination: '随身与常用',
    actionLabel: '移动办事',
    outcome: '设为常用后支持异地联络，并提高移动事务与工作结算效率。',
  }),
  studio_phone: Object.freeze({
    destination: '随身与常用',
    actionLabel: '处理多项事务',
    outcome: '设为常用后支持异地联络，并强化移动处理与工作结算效率。',
  }),
  used_laptop: Object.freeze({
    destination: '库位，摆放后进入当前场所',
    actionLabel: '处理基础工作',
    outcome: '摆放并设为常用后提高工作收入，使用会消耗精力与耐久。',
  }),
  daily_laptop: Object.freeze({
    destination: '库位，摆放后进入当前场所',
    actionLabel: '移动办公',
    outcome: '摆放并设为常用后提高工作收入，使用会消耗精力与耐久。',
  }),
  desk_workstation: Object.freeze({
    destination: '库位，摆放后进入当前场所',
    actionLabel: '运行工作任务',
    outcome: '占用固定空间并提高工作收入，使用会消耗精力与耐久。',
  }),
  home_goods: Object.freeze({
    destination: '库位，摆放后进入当前场所',
    actionLabel: '展开桌椅',
    outcome: '摆放后改善起居与工作条件，使用会产生耐久损耗。',
  }),
  refrigerator: Object.freeze({
    destination: '库位，摆放后进入当前场所',
    actionLabel: '取用冷藏补给',
    outcome: '摆放后减缓补给消耗，使用会改善舒适并产生损耗。',
  }),
  reading_sofa: Object.freeze({
    destination: '库位，摆放后进入当前场所',
    actionLabel: '坐下阅读',
    outcome: '摆放后改善休息恢复，使用会增加舒适并产生损耗。',
  }),
  daily_clothes: Object.freeze({
    destination: '随身与常用',
    actionLabel: '换上通勤',
    outcome: '设为常用后支持工作，穿用会改善出行并产生损耗。',
  }),
  weather_coat: Object.freeze({
    destination: '随身与常用',
    actionLabel: '穿上外套',
    outcome: '设为常用后减轻日常消耗，穿用会改善出行并产生损耗。',
  }),
  tailored_workwear: Object.freeze({
    destination: '随身与常用',
    actionLabel: '换上作业服',
    outcome: '设为常用后提高工作收入，穿用会改善出行并产生损耗。',
  }),
  meal_box: Object.freeze({
    destination: '补给库存',
    actionLabel: '吃便当',
    outcome: '从库存消耗一份，恢复饱腹与精力。',
  }),
  coffee: Object.freeze({
    destination: '补给库存',
    actionLabel: '喝咖啡',
    outcome: '从库存消耗一杯，短时恢复精力。',
  }),
  family_groceries: Object.freeze({
    destination: '补给库存',
    actionLabel: '烹饪食材',
    outcome: '从库存消耗一份，恢复饱腹并改善舒适。',
  }),
  transit_card: Object.freeze({
    destination: '补给库存',
    actionLabel: '刷卡通勤',
    outcome: '从库存消耗一次，补足公共出行状态。',
  }),
  cloud_subscription: Object.freeze({
    destination: '有效服务',
    actionLabel: '开通或续期',
    outcome: '按购买次数延长有效期，在期限内提高工作收入。',
  }),
  mobility_subscription: Object.freeze({
    destination: '有效服务',
    actionLabel: '开通或续期',
    outcome: '按购买次数延长有效期，减轻每日出行消耗。',
  }),
  clinic_consultation: Object.freeze({
    destination: '预约服务',
    actionLabel: '前往就诊',
    outcome: '消耗一次预约，恢复健康并改善舒适。',
  }),
  recovery_program: Object.freeze({
    destination: '预约服务',
    actionLabel: '完成一次训练',
    outcome: '消耗一次训练名额，恢复健康与精力。',
  }),
  mobile_data_plan: Object.freeze({
    destination: '有效服务',
    actionLabel: '开通或续期',
    outcome: '按购买次数延长有效期，减轻出行消耗并提高工作收入。',
  }),
  fiber_connection: Object.freeze({
    destination: '有效服务',
    actionLabel: '开通或续期',
    outcome: '按购买次数延长有效期，在期限内提高工作收入。',
  }),
  cinema_evening: Object.freeze({
    destination: '预约服务',
    actionLabel: '入场观影',
    outcome: '消耗一次场次席位，恢复舒适与少量精力。',
  }),
  fitness_membership: Object.freeze({
    destination: '有效服务',
    actionLabel: '开通或续期',
    outcome: '按购买次数延长有效期，减轻每日健康与精力消耗。',
  }),
  evening_course: Object.freeze({
    destination: '预约服务',
    actionLabel: '参加课程',
    outcome: '消耗一次课程席位，并在有效期内提高工作收入。',
  }),
  vocational_lab: Object.freeze({
    destination: '有效服务',
    actionLabel: '开通或续期',
    outcome: '按购买次数延长有效期，在期限内提高工作收入。',
  }),
});

const products = [
  {
    id: 'city_bicycle',
    category: 'vehicle',
    tier: 'basic',
    assetType: 'durable',
    label: '城市单车',
    description: '不占车位，日常通勤轻便。',
    price: 980,
    space: 0,
    parking: 0,
    durability: 65,
    depreciationPerDay: 0.35,
    maintenanceCost: 80,
    upkeepPerCycle: 12,
    useValue: { mobility: 16, workBonus: 0.02 },
    stockCap: 5,
    image: productImage('city_bicycle'),
  },
  {
    id: 'commuter_scooter',
    category: 'vehicle',
    tier: 'mid',
    assetType: 'durable',
    label: '通勤踏板车',
    description: '覆盖更远的工作与生活半径。',
    price: 6_800,
    space: 0,
    parking: 0,
    durability: 75,
    depreciationPerDay: 0.25,
    maintenanceCost: 320,
    upkeepPerCycle: 48,
    useValue: { mobility: 26, workBonus: 0.035 },
    stockCap: 4,
    image: productImage('commuter_scooter'),
  },
  {
    id: 'city_sedan',
    category: 'vehicle',
    tier: 'high',
    assetType: 'durable',
    label: '城市轿车',
    description: '出行范围更大，也需要车位与养护。',
    price: 94_800,
    space: 0,
    parking: 1,
    durability: 88,
    depreciationPerDay: 0.12,
    maintenanceCost: 2_400,
    upkeepPerCycle: 380,
    useValue: { mobility: 42, workBonus: 0.045 },
    stockCap: 2,
    image: productImage('city_sedan'),
  },
  {
    id: 'compact_studio',
    category: 'housing',
    tier: 'basic',
    assetType: 'durable',
    label: '紧凑单间',
    description: '空间不大，足够安置基本生活。',
    price: 36_000,
    space: 0,
    capacity: 8,
    parking: 0,
    durability: 80,
    depreciationPerDay: 0.03,
    maintenanceCost: 2_200,
    upkeepPerCycle: 520,
    useValue: { comfort: 8, restBonus: 6 },
    stockCap: 3,
    image: productImage('compact_studio'),
    eligibleRoles: ['household', 'professional'],
  },
  {
    id: 'city_apartment',
    category: 'housing',
    tier: 'mid',
    assetType: 'durable',
    label: '城市两居',
    description: '能容纳完整起居与一个车位。',
    price: 180_000,
    space: 0,
    capacity: 16,
    parking: 1,
    durability: 90,
    depreciationPerDay: 0.025,
    maintenanceCost: 6_800,
    upkeepPerCycle: 1_800,
    useValue: { comfort: 14, restBonus: 12 },
    stockCap: 2,
    image: productImage('city_apartment'),
    eligibleRoles: ['household', 'professional'],
  },
  {
    id: 'family_home',
    category: 'housing',
    tier: 'high',
    assetType: 'durable',
    label: '宽敞住宅',
    description: '空间充足，长期责任也更高。',
    price: 620_000,
    space: 0,
    capacity: 26,
    parking: 2,
    durability: 95,
    depreciationPerDay: 0.02,
    maintenanceCost: 15_000,
    upkeepPerCycle: 5_200,
    useValue: { comfort: 20, restBonus: 18 },
    stockCap: 2,
    image: productImage('family_home'),
    eligibleRoles: ['household', 'professional'],
  },
  {
    id: 'operator_workshop',
    category: 'housing',
    tier: 'mid',
    assetType: 'durable',
    label: '经营作业场',
    description: '承载设备、团队与车队的企业经营场所。',
    price: 260_000,
    space: 0,
    capacity: 24,
    parking: 3,
    durability: 90,
    depreciationPerDay: 0.04,
    maintenanceCost: 9_600,
    upkeepPerCycle: 2_900,
    useValue: { comfort: 12, restBonus: 8, workBonus: 0.04 },
    stockCap: 2,
    eligibleRoles: ['operator'],
    placeKind: 'operations_site',
    image: productImage('operator_workshop'),
  },
  {
    id: 'institution_headquarters',
    category: 'housing',
    tier: 'high',
    assetType: 'durable',
    label: '机构总部单元',
    description: '分开容纳投研、交易、风控、档案与客户服务。',
    price: 880_000,
    space: 0,
    capacity: 30,
    parking: 4,
    durability: 94,
    depreciationPerDay: 0.025,
    maintenanceCost: 22_000,
    upkeepPerCycle: 7_600,
    useValue: { comfort: 18, restBonus: 10, workBonus: 0.06 },
    stockCap: 2,
    eligibleRoles: ['institution'],
    placeKind: 'headquarters',
    image: productImage('institution_headquarters'),
  },
  {
    id: 'pocket_phone',
    category: 'phone',
    tier: 'basic',
    assetType: 'durable',
    label: '基础手机',
    description: '通信可靠，处理复杂事务较慢。',
    price: 899,
    space: 0,
    durability: 65,
    depreciationPerDay: 0.25,
    maintenanceCost: 120,
    upkeepPerCycle: 0,
    useValue: { energy: 1, workBonus: 0.01 },
    capabilities: ['remote_social_contact'],
    stockCap: 6,
    image: productImage('pocket_phone'),
  },
  {
    id: 'daily_phone',
    category: 'phone',
    tier: 'mid',
    assetType: 'durable',
    label: '日用智能手机',
    description: '日程、联络与移动处理更顺手。',
    price: 3_299,
    space: 0,
    durability: 80,
    depreciationPerDay: 0.18,
    maintenanceCost: 360,
    upkeepPerCycle: 0,
    useValue: { energy: 2, workBonus: 0.025 },
    capabilities: ['remote_social_contact'],
    stockCap: 5,
    image: productImage('daily_phone'),
  },
  {
    id: 'studio_phone',
    category: 'phone',
    tier: 'high',
    assetType: 'durable',
    label: '高效移动终端',
    description: '多任务更快，维修成本也更高。',
    price: 6_999,
    space: 0,
    durability: 88,
    depreciationPerDay: 0.12,
    maintenanceCost: 680,
    upkeepPerCycle: 0,
    useValue: { energy: 3, workBonus: 0.04 },
    capabilities: ['remote_social_contact'],
    stockCap: 3,
    image: productImage('studio_phone'),
  },
  {
    id: 'used_laptop',
    category: 'computer',
    tier: 'basic',
    assetType: 'durable',
    label: '旧款笔记本',
    description: '能完成基本工作，损耗较快。',
    price: 2_499,
    space: 1,
    durability: 58,
    depreciationPerDay: 0.35,
    maintenanceCost: 420,
    upkeepPerCycle: 0,
    useValue: { comfort: 1, workBonus: 0.03 },
    stockCap: 5,
    image: productImage('used_laptop'),
  },
  {
    id: 'daily_laptop',
    category: 'computer',
    tier: 'mid',
    assetType: 'durable',
    label: '轻薄电脑',
    description: '兼顾移动办公与日常使用。',
    price: 5_799,
    space: 1,
    durability: 78,
    depreciationPerDay: 0.24,
    maintenanceCost: 780,
    upkeepPerCycle: 0,
    useValue: { comfort: 2, workBonus: 0.055 },
    stockCap: 4,
    image: productImage('daily_laptop'),
  },
  {
    id: 'desk_workstation',
    category: 'computer',
    tier: 'high',
    assetType: 'durable',
    label: '桌面工作站',
    description: '处理效率高，需要固定空间。',
    price: 12_999,
    space: 2,
    durability: 90,
    depreciationPerDay: 0.16,
    maintenanceCost: 1_400,
    upkeepPerCycle: 0,
    useValue: { comfort: 3, workBonus: 0.085 },
    stockCap: 2,
    image: productImage('desk_workstation'),
  },
  {
    id: 'home_goods',
    category: 'home',
    tier: 'basic',
    assetType: 'durable',
    label: '折叠桌椅',
    description: '占地少，提供基本起居位置。',
    price: 180,
    space: 1,
    durability: 45,
    depreciationPerDay: 0.5,
    maintenanceCost: 30,
    upkeepPerCycle: 0,
    useValue: { comfort: 8, workBonus: 0.005 },
    stockCap: 8,
    image: productImage('home_goods'),
  },
  {
    id: 'refrigerator',
    category: 'home',
    tier: 'mid',
    assetType: 'durable',
    label: '节能冰箱',
    description: '占用两格，减轻饮食补给压力。',
    price: 2_799,
    space: 2,
    durability: 82,
    depreciationPerDay: 0.12,
    maintenanceCost: 350,
    upkeepPerCycle: 60,
    useValue: { comfort: 10, satietyDecayReduction: 2 },
    stockCap: 4,
    image: productImage('refrigerator'),
  },
  {
    id: 'reading_sofa',
    category: 'home',
    tier: 'high',
    assetType: 'durable',
    label: '阅读沙发',
    description: '占用三格，休息恢复更充分。',
    price: 5_200,
    space: 3,
    durability: 88,
    depreciationPerDay: 0.1,
    maintenanceCost: 520,
    upkeepPerCycle: 60,
    useValue: { comfort: 15, restBonus: 3 },
    stockCap: 3,
    image: productImage('reading_sofa'),
  },
  {
    id: 'daily_clothes',
    category: 'clothing',
    tier: 'basic',
    assetType: 'durable',
    label: '日常衣装',
    description: '简单耐穿，适合普通通勤。',
    price: 299,
    space: 1,
    durability: 40,
    depreciationPerDay: 0.6,
    maintenanceCost: 80,
    upkeepPerCycle: 0,
    useValue: { mobility: 4, workBonus: 0.008 },
    stockCap: 8,
    image: productImage('daily_clothes'),
  },
  {
    id: 'weather_coat',
    category: 'clothing',
    tier: 'mid',
    assetType: 'durable',
    label: '四季外套',
    description: '应对天气变化，减少出行消耗。',
    price: 980,
    space: 1,
    durability: 68,
    depreciationPerDay: 0.35,
    maintenanceCost: 160,
    upkeepPerCycle: 0,
    useValue: { mobility: 8, energyDecayReduction: 1 },
    stockCap: 6,
    image: productImage('weather_coat'),
  },
  {
    id: 'tailored_workwear',
    category: 'clothing',
    tier: 'high',
    assetType: 'durable',
    label: '定制作业服',
    description: '长时间工作更舒适，养护费用更高。',
    price: 2_800,
    space: 1,
    durability: 82,
    depreciationPerDay: 0.25,
    maintenanceCost: 320,
    upkeepPerCycle: 0,
    useValue: { mobility: 10, workBonus: 0.035 },
    stockCap: 4,
    image: productImage('tailored_workwear'),
  },
  {
    id: 'meal_box',
    category: 'food',
    tier: 'basic',
    assetType: 'consumable',
    label: '便当',
    description: '一份热食，补充当日体力。',
    price: 42,
    space: 1,
    durability: 1,
    depreciationPerDay: 0,
    maintenanceCost: 0,
    upkeepPerCycle: 0,
    useValue: { satiety: 34, energy: 4 },
    effects: { satiety: 34, energy: 4 },
    stockCap: 12,
    image: productImage('meal_box'),
  },
  {
    id: 'coffee',
    category: 'food',
    tier: 'mid',
    assetType: 'consumable',
    label: '咖啡',
    description: '短时提神，不能代替休息。',
    price: 24,
    space: 1,
    durability: 1,
    depreciationPerDay: 0,
    maintenanceCost: 0,
    upkeepPerCycle: 0,
    useValue: { energy: 18 },
    effects: { energy: 18 },
    stockCap: 16,
    image: productImage('coffee'),
  },
  {
    id: 'family_groceries',
    category: 'food',
    tier: 'high',
    assetType: 'consumable',
    label: '家庭食材',
    description: '一次完整补给，饱腹更持久。',
    price: 168,
    space: 2,
    durability: 1,
    depreciationPerDay: 0,
    maintenanceCost: 0,
    upkeepPerCycle: 0,
    useValue: { satiety: 72, comfort: 3 },
    effects: { satiety: 72, comfort: 3 },
    stockCap: 8,
    image: productImage('family_groceries'),
  },
  {
    id: 'transit_card',
    category: 'service',
    tier: 'basic',
    assetType: 'consumable',
    label: '通勤卡',
    description: '补充日常公共出行额度。',
    price: 120,
    space: 0,
    durability: 1,
    depreciationPerDay: 0,
    maintenanceCost: 0,
    upkeepPerCycle: 0,
    useValue: { mobility: 28 },
    effects: { mobility: 28 },
    stockCap: 10,
    image: productImage('transit_card'),
  },
  {
    id: 'cloud_subscription',
    category: 'service',
    tier: 'mid',
    assetType: 'subscription',
    label: '资料同步服务',
    description: '三十日有效，工作资料可随时取用。',
    price: 68,
    space: 0,
    durability: 30,
    depreciationPerDay: 0,
    maintenanceCost: 0,
    upkeepPerCycle: 0,
    termWorldDays: 30,
    useValue: { workBonus: 0.02 },
    stockCap: 99,
    image: productImage('cloud_subscription'),
  },
  {
    id: 'mobility_subscription',
    category: 'service',
    tier: 'high',
    assetType: 'subscription',
    label: '城市出行月票',
    description: '三十日内降低日常出行消耗。',
    price: 420,
    space: 0,
    durability: 30,
    depreciationPerDay: 0,
    maintenanceCost: 0,
    upkeepPerCycle: 0,
    termWorldDays: 30,
    useValue: { mobilityDecayReduction: 2, workBonus: 0.015 },
    stockCap: 99,
    image: productImage('mobility_subscription'),
  },
  {
    id: 'clinic_consultation',
    category: 'health',
    tier: 'basic',
    assetType: 'service',
    label: '社区门诊预约',
    description: '五日内可使用一次基础诊疗席位。',
    price: 160,
    space: 0,
    durability: 1,
    depreciationPerDay: 0,
    maintenanceCost: 0,
    upkeepPerCycle: 0,
    termWorldDays: 5,
    serviceUses: 1,
    useValue: { health: 18, comfort: 2 },
    effects: { health: 18, comfort: 2 },
    stockCap: 10,
    image: productImage('clinic_consultation'),
  },
  {
    id: 'recovery_program',
    category: 'health',
    tier: 'mid',
    assetType: 'service',
    label: '恢复训练计划',
    description: '十四日内安排三次恢复服务。',
    price: 680,
    space: 0,
    durability: 3,
    depreciationPerDay: 0,
    maintenanceCost: 0,
    upkeepPerCycle: 0,
    termWorldDays: 14,
    serviceUses: 3,
    useValue: { health: 9, energy: 7 },
    effects: { health: 9, energy: 7 },
    stockCap: 6,
    image: productImage('recovery_program'),
  },
  {
    id: 'mobile_data_plan',
    category: 'communication',
    tier: 'basic',
    assetType: 'subscription',
    label: '移动通信月包',
    description: '三十日通信额度，支持日常联络与移动事务。',
    price: 58,
    space: 0,
    durability: 30,
    depreciationPerDay: 0,
    maintenanceCost: 0,
    upkeepPerCycle: 0,
    termWorldDays: 30,
    useValue: { mobilityDecayReduction: 1, workBonus: 0.01 },
    stockCap: 24,
    image: productImage('mobile_data_plan'),
  },
  {
    id: 'fiber_connection',
    category: 'communication',
    tier: 'mid',
    assetType: 'subscription',
    label: '固定网络服务',
    description: '三十日稳定接入，适合固定场所持续使用。',
    price: 128,
    space: 0,
    durability: 30,
    depreciationPerDay: 0,
    maintenanceCost: 0,
    upkeepPerCycle: 0,
    termWorldDays: 30,
    useValue: { workBonus: 0.03 },
    stockCap: 18,
    image: productImage('fiber_connection'),
  },
  {
    id: 'cinema_evening',
    category: 'entertainment',
    tier: 'basic',
    assetType: 'service',
    label: '城市放映场次',
    description: '五日内可使用一次当期放映席位。',
    price: 68,
    space: 0,
    durability: 1,
    depreciationPerDay: 0,
    maintenanceCost: 0,
    upkeepPerCycle: 0,
    termWorldDays: 5,
    serviceUses: 1,
    useValue: { comfort: 20, energy: 3 },
    effects: { comfort: 20, energy: 3 },
    stockCap: 12,
    image: productImage('cinema_evening'),
  },
  {
    id: 'fitness_membership',
    category: 'entertainment',
    tier: 'mid',
    assetType: 'subscription',
    label: '运动空间月卡',
    description: '三十日开放时段，持续改善恢复条件。',
    price: 320,
    space: 0,
    durability: 30,
    depreciationPerDay: 0,
    maintenanceCost: 0,
    upkeepPerCycle: 0,
    termWorldDays: 30,
    useValue: { healthDecayReduction: 1, energyDecayReduction: 1 },
    stockCap: 10,
    image: productImage('fitness_membership'),
  },
  {
    id: 'evening_course',
    category: 'education',
    tier: 'basic',
    assetType: 'service',
    label: '城市夜校课程',
    description: '二十日内完成四次课程席位。',
    price: 760,
    space: 0,
    durability: 4,
    depreciationPerDay: 0,
    maintenanceCost: 0,
    upkeepPerCycle: 0,
    termWorldDays: 20,
    serviceUses: 4,
    useValue: { comfort: 3, workBonus: 0.025 },
    effects: { comfort: 3 },
    stockCap: 8,
    image: productImage('evening_course'),
  },
  {
    id: 'vocational_lab',
    category: 'education',
    tier: 'high',
    assetType: 'subscription',
    label: '专业实训席位',
    description: '三十日实训资源，持续改善工作设备利用率。',
    price: 2_400,
    space: 0,
    durability: 30,
    depreciationPerDay: 0,
    maintenanceCost: 0,
    upkeepPerCycle: 0,
    termWorldDays: 30,
    useValue: { workBonus: 0.055 },
    stockCap: 5,
    image: productImage('vocational_lab'),
  },
];

export const LIFE_PRODUCT_CATALOG = Object.freeze(
  products.map((product) =>
    Object.freeze({
      ...product,
      supplierId:
        product.supplierId ?? `city_supplier_${product.category}`,
      restockEveryDays: product.restockEveryDays ?? 5,
      restockUnits:
        product.restockUnits ??
        Math.max(1, Math.ceil(product.stockCap * 0.35)),
      priceFloorRatio: product.priceFloorRatio ?? 0.72,
      priceCeilingRatio: product.priceCeilingRatio ?? 1.48,
      eligibleRoles: Object.freeze(
        product.eligibleRoles
          ? [...product.eligibleRoles]
          : [
              'household',
              'professional',
              'operator',
              'institution',
            ],
      ),
      interaction: Object.freeze({
        ...PRODUCT_INTERACTIONS[product.id],
      }),
      capabilities: Object.freeze([
        ...(product.capabilities ?? []),
      ]),
      effects: product.effects ? Object.freeze({ ...product.effects }) : undefined,
      useValue: Object.freeze({ ...product.useValue }),
    }),
  ),
);

export const LIFE_PRODUCT_BY_ID = Object.freeze(
  Object.fromEntries(
    LIFE_PRODUCT_CATALOG.map((product) => [product.id, product]),
  ),
);

const STARTING_PRODUCTS = Object.freeze({
  household: Object.freeze({
    low: Object.freeze([
      'compact_studio',
      'city_bicycle',
      'pocket_phone',
      'used_laptop',
      'home_goods',
      'daily_clothes',
    ]),
    high: Object.freeze([
      'family_home',
      'city_sedan',
      'daily_phone',
      'daily_laptop',
      'refrigerator',
      'reading_sofa',
      'tailored_workwear',
    ]),
  }),
  professional: Object.freeze({
    low: Object.freeze([
      'compact_studio',
      'commuter_scooter',
      'daily_phone',
      'daily_laptop',
      'reading_sofa',
      'weather_coat',
    ]),
    high: Object.freeze([
      'city_apartment',
      'city_sedan',
      'studio_phone',
      'desk_workstation',
      'refrigerator',
      'reading_sofa',
      'tailored_workwear',
    ]),
  }),
  operator: Object.freeze({
    low: Object.freeze([
      'operator_workshop',
      'commuter_scooter',
      'daily_phone',
      'desk_workstation',
      'refrigerator',
      'tailored_workwear',
    ]),
    high: Object.freeze([
      'operator_workshop',
      'city_sedan',
      'studio_phone',
      'desk_workstation',
      'refrigerator',
      'reading_sofa',
      'tailored_workwear',
    ]),
  }),
  institution: Object.freeze({
    low: Object.freeze([
      'institution_headquarters',
      'city_sedan',
      'studio_phone',
      'desk_workstation',
      'home_goods',
      'tailored_workwear',
    ]),
    high: Object.freeze([
      'institution_headquarters',
      'city_sedan',
      'studio_phone',
      'desk_workstation',
      'refrigerator',
      'reading_sofa',
      'tailored_workwear',
    ]),
  }),
});

const BASE_SHIFT_INCOME = Object.freeze({
  household: Object.freeze({ low: 650, high: 1_100 }),
  professional: Object.freeze({ low: 900, high: 1_600 }),
  operator: Object.freeze({ low: 1_100, high: 2_100 }),
  institution: Object.freeze({ low: 1_250, high: 2_500 }),
});

function lifeRoleFamily(roleType) {
  if (
    [
      'institution',
      'quant_institution',
      'stabilization_fund',
    ].includes(roleType)
  ) {
    return 'institution';
  }
  if (roleType === 'private_whale') return 'household';
  return roleType;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function initialStock() {
  return Object.fromEntries(
    LIFE_PRODUCT_CATALOG.map((product) => [product.id, product.stockCap]),
  );
}

export function lifeProductRequiresPlacement(product) {
  return Boolean(
    product?.assetType === 'durable' &&
      product.category !== 'housing' &&
      product.category !== 'clothing' &&
      Number(product.space) > 0,
  );
}

export function lifeProductHasDirectUse(product) {
  return ['energy', 'satiety', 'comfort', 'mobility'].some(
    (metric) => Number(product?.useValue?.[metric] ?? 0) !== 0,
  );
}

function startingPossessions(roleType, strengthTier) {
  const high = strengthTier === 'high';
  const roleFamily = lifeRoleFamily(roleType);
  const ids =
    STARTING_PRODUCTS[roleFamily]?.[high ? 'high' : 'low'] ??
    STARTING_PRODUCTS.household[high ? 'high' : 'low'];
  const homeId = `life_asset_start_${ids[0]}`;
  return ids.map((itemId, index) => {
    const product = LIFE_PRODUCT_BY_ID[itemId];
    return {
      instanceId: `life_asset_start_${itemId}`,
      itemId,
      category: product.category,
      condition: high ? Math.max(84, product.durability) : product.durability,
      acquiredAtTick: 0,
      acquiredPrice: 0,
      carryingValue: 0,
      usageCount: 0,
      placedHomeId:
        lifeProductRequiresPlacement(product) ? homeId : null,
      order: index,
    };
  });
}

function activeFromPossessions(possessions) {
  const first = (category) =>
    possessions.find((possession) => possession.category === category)
      ?.instanceId ?? null;
  return {
    homeId: first('housing'),
    vehicleId: first('vehicle'),
    phoneId: first('phone'),
    computerId: first('computer'),
    clothingId: first('clothing'),
  };
}

export function createLifeState(roleType, strengthTier) {
  const stronger = strengthTier === 'high';
  const roleFamily = lifeRoleFamily(roleType);
  const possessions = startingPossessions(roleType, strengthTier);
  return {
    schemaVersion: 'lzy-life-v2',
    assetAccountingVersion: 'lzy-life-assets-v1',
    status: 'active',
    kind:
      roleFamily === 'operator' || roleFamily === 'institution'
        ? 'organization'
        : 'personal',
    homeLabel:
      roleFamily === 'operator'
        ? '经营现场'
        : roleFamily === 'institution'
          ? '机构总部'
          : '住处',
    energy: stronger ? 82 : 74,
    satiety: stronger ? 78 : 72,
    comfort: stronger ? 76 : 66,
    mobility: stronger ? 74 : 64,
    health: stronger ? 84 : 76,
    inventory: {},
    possessions,
    active: activeFromPossessions(possessions),
    subscriptions: {},
    serviceContracts: {},
    shopStock: initialStock(),
    nextRestockTick: 5,
    work: {
      baseIncome:
        BASE_SHIFT_INCOME[roleFamily]?.[stronger ? 'high' : 'low'] ??
        650,
      shiftsCompleted: 0,
      totalEarned: 0,
      lastShiftTick: null,
    },
    actionCount: 0,
    lastSettledTick: 0,
    lastUpkeepTick: 0,
    upkeepDue: 0,
  };
}

function validPossessions(source, defaults) {
  if (!Array.isArray(source.possessions) || source.possessions.length === 0) {
    return defaults.possessions;
  }
  const seen = new Set();
  const possessions = [];
  for (const raw of source.possessions) {
    const product = LIFE_PRODUCT_BY_ID[String(raw?.itemId ?? '')];
    const instanceId = String(raw?.instanceId ?? '');
    if (
      !product ||
      product.assetType !== 'durable' ||
      !instanceId ||
      seen.has(instanceId)
    ) {
      continue;
    }
    seen.add(instanceId);
    possessions.push({
      instanceId,
      itemId: product.id,
      category: product.category,
      condition: clamp(
        Number(raw.condition ?? product.durability),
        0,
        100,
      ),
      acquiredAtTick: Math.max(
        0,
        Math.floor(Number(raw.acquiredAtTick) || 0),
      ),
      acquiredPrice: Math.max(0, Number(raw.acquiredPrice) || 0),
      carryingValue: Math.min(
        Math.max(0, Number(raw.carryingValue) || 0),
        Math.max(0, Number(raw.acquiredPrice) || 0),
      ),
      usageCount: Math.max(0, Math.floor(Number(raw.usageCount) || 0)),
      placedHomeId:
        typeof raw.placedHomeId === 'string' ? raw.placedHomeId : null,
      locationId:
        typeof raw.locationId === 'string' && raw.locationId
          ? raw.locationId
          : null,
      order: Math.max(0, Math.floor(Number(raw.order) || possessions.length)),
    });
  }
  return possessions.length > 0 ? possessions : defaults.possessions;
}

function validActive(source, possessions, defaults) {
  const byId = new Map(
    possessions.map((possession) => [possession.instanceId, possession]),
  );
  const categoryByKey = {
    homeId: 'housing',
    vehicleId: 'vehicle',
    phoneId: 'phone',
    computerId: 'computer',
    clothingId: 'clothing',
  };
  return Object.fromEntries(
    Object.entries(categoryByKey).map(([key, category]) => {
      const hasExplicitSelection =
        source.active &&
        typeof source.active === 'object' &&
        Object.hasOwn(source.active, key);
      if (hasExplicitSelection) {
        const candidate = String(source.active[key] ?? '');
        return [
          key,
          byId.get(candidate)?.category === category
            ? candidate
            : null,
        ];
      }
      const fallback = String(defaults.active[key] ?? '');
      if (byId.get(fallback)?.category === category) return [key, fallback];
      return [
        key,
        possessions.find((possession) => possession.category === category)
          ?.instanceId ?? null,
      ];
    }),
  );
}

export function normalizeLifeState(state) {
  const currentTick = Math.max(
    0,
    Math.floor(Number(state?.world?.tick) || 0),
  );
  const nextBoundary = (step) =>
    Math.floor(currentTick / step) * step + step;
  const defaults = createLifeState(
    state?.player?.roleType ?? 'household',
    state?.player?.strengthTier ?? 'low',
  );
  const source =
    state?.player?.life && typeof state.player.life === 'object'
      ? state.player.life
      : {};
  const inventory =
    source.inventory && typeof source.inventory === 'object'
      ? Object.fromEntries(
          Object.entries(source.inventory).filter(
            ([itemId, quantity]) =>
              LIFE_PRODUCT_BY_ID[itemId]?.assetType === 'consumable' &&
              Number.isSafeInteger(quantity) &&
              quantity > 0,
          ),
        )
      : {};
  const possessions = validPossessions(source, defaults);
  const active = validActive(source, possessions, defaults);
  const shopStock = Object.fromEntries(
    LIFE_PRODUCT_CATALOG.map((product) => {
      const quantity = Number(source.shopStock?.[product.id]);
      return [
        product.id,
        Number.isSafeInteger(quantity) && quantity >= 0
          ? Math.min(quantity, product.stockCap)
          : defaults.shopStock[product.id],
      ];
    }),
  );
  const subscriptions =
    source.subscriptions && typeof source.subscriptions === 'object'
      ? Object.fromEntries(
          Object.entries(source.subscriptions)
            .filter(([itemId, value]) => {
              const product = LIFE_PRODUCT_BY_ID[itemId];
              return (
                product?.assetType === 'subscription' &&
                Number.isSafeInteger(value?.startedAtTick) &&
                Number.isSafeInteger(value?.expiresAtTick) &&
                value.expiresAtTick >= value.startedAtTick
              );
            })
            .map(([itemId, value]) => [itemId, { ...value }]),
        )
      : {};
  const serviceContracts =
    source.serviceContracts &&
    typeof source.serviceContracts === 'object'
      ? Object.fromEntries(
          Object.entries(source.serviceContracts)
            .filter(([itemId, value]) => {
              const product = LIFE_PRODUCT_BY_ID[itemId];
              return (
                product?.assetType === 'service' &&
                Number.isSafeInteger(value?.startedAtTick) &&
                Number.isSafeInteger(value?.expiresAtTick) &&
                value.expiresAtTick >= value.startedAtTick &&
                Number.isSafeInteger(value?.usesRemaining) &&
                value.usesRemaining > 0
              );
            })
            .map(([itemId, value]) => [itemId, { ...value }]),
        )
      : {};
  return {
    ...defaults,
    ...source,
    schemaVersion: 'lzy-life-v2',
    assetAccountingVersion: 'lzy-life-assets-v1',
    status: 'active',
    energy: clamp(Number(source.energy ?? defaults.energy), 0, 100),
    satiety: clamp(Number(source.satiety ?? defaults.satiety), 0, 100),
    comfort: clamp(Number(source.comfort ?? defaults.comfort), 0, 100),
    mobility: clamp(Number(source.mobility ?? defaults.mobility), 0, 100),
    health: clamp(Number(source.health ?? defaults.health), 0, 100),
    inventory,
    possessions,
    active,
    subscriptions,
    serviceContracts,
    shopStock,
    nextRestockTick: Math.max(
      1,
      Number.isSafeInteger(source.nextRestockTick) &&
        source.nextRestockTick > 0
        ? source.nextRestockTick
        : nextBoundary(5),
    ),
    work: {
      baseIncome: Math.max(
        0,
        Number(source.work?.baseIncome) ||
          defaults.work.baseIncome,
      ),
      shiftsCompleted: Math.max(
        0,
        Math.floor(Number(source.work?.shiftsCompleted) || 0),
      ),
      totalEarned: Math.max(0, Number(source.work?.totalEarned) || 0),
      lastShiftTick: Number.isSafeInteger(source.work?.lastShiftTick)
        ? source.work.lastShiftTick
        : null,
    },
    actionCount: Math.max(
      0,
      Math.floor(Number(source.actionCount) || 0),
    ),
    lastSettledTick: Math.max(
      0,
      Number.isSafeInteger(source.lastSettledTick) &&
        source.lastSettledTick >= 0
        ? source.lastSettledTick
        : currentTick,
    ),
    lastUpkeepTick: Math.max(
      0,
      Number.isSafeInteger(source.lastUpkeepTick) &&
        source.lastUpkeepTick >= 0
        ? source.lastUpkeepTick
        : currentTick,
    ),
    upkeepDue:
      Number.isFinite(source.upkeepDue) && source.upkeepDue >= 0
        ? Number(source.upkeepDue.toFixed(2))
        : 0,
  };
}

function possessionProduct(possession) {
  return LIFE_PRODUCT_BY_ID[possession.itemId];
}

function lifeDerivedState(life) {
  const byId = new Map(
    life.possessions.map((possession) => [possession.instanceId, possession]),
  );
  const activeHome = byId.get(life.active.homeId) ?? null;
  const homeProduct = activeHome ? possessionProduct(activeHome) : null;
  const placedUsed = life.possessions
    .filter(
      (possession) =>
        possession.placedHomeId === life.active.homeId,
    )
    .reduce(
      (sum, possession) => sum + possessionProduct(possession).space,
      0,
    );
  const used = placedUsed;
  const activeIds = new Set(Object.values(life.active).filter(Boolean));
  const responsibilityIds = new Set([
    ...activeIds,
    ...life.possessions
      .filter(
        (possession) =>
          possession.category === 'home' &&
          possession.placedHomeId === life.active.homeId,
      )
      .map((possession) => possession.instanceId),
  ]);
  const upkeepPerCycle = life.possessions
    .filter((possession) => responsibilityIds.has(possession.instanceId))
    .reduce(
      (sum, possession) =>
        sum + possessionProduct(possession).upkeepPerCycle,
      0,
    );
  return {
    space: {
      used,
      capacity: homeProduct?.capacity ?? 0,
      parkingUsed:
        possessionProduct(byId.get(life.active.vehicleId) ?? {})?.parking ?? 0,
      parkingCapacity: homeProduct?.parking ?? 0,
    },
    responsibility: {
      upkeepPerCycle,
      amountDue: life.upkeepDue,
      cycleDays: 10,
      nextDueTick: life.lastUpkeepTick + 10,
    },
  };
}

export function getLifeCatalog() {
  return clone(LIFE_PRODUCT_CATALOG);
}

export function getLifeProjection(state) {
  const life = normalizeLifeState(state);
  return clone({
    ...life,
    ...lifeDerivedState(life),
  });
}

export function auditLifeState(life, worldTick = null) {
  const errors = [];
  const fail = (reason) => {
    if (!errors.includes(reason)) errors.push(reason);
  };
  if (
    !life ||
    typeof life !== 'object' ||
    life.status !== 'active'
  ) {
    return ['life root is not active'];
  }
  for (const metric of [
    'energy',
    'satiety',
    'comfort',
    'mobility',
    'health',
  ]) {
    if (
      !Number.isFinite(life[metric]) ||
      life[metric] < 0 ||
      life[metric] > 100
    ) {
      fail(`invalid ${metric}`);
    }
  }
  if (!life.inventory || typeof life.inventory !== 'object') {
    fail('invalid inventory');
  } else {
    for (const [itemId, quantity] of Object.entries(
      life.inventory,
    )) {
      if (
        LIFE_PRODUCT_BY_ID[itemId]?.assetType !== 'consumable' ||
        !Number.isSafeInteger(quantity) ||
        quantity <= 0
      ) {
        fail('invalid inventory entry');
      }
    }
  }
  if (!Array.isArray(life.possessions)) {
    fail('invalid possessions');
    return errors;
  }
  const instanceIds = new Set();
  const possessionsById = new Map();
  for (const possession of life.possessions) {
    const product =
      LIFE_PRODUCT_BY_ID[String(possession?.itemId ?? '')];
    const instanceId = String(possession?.instanceId ?? '');
    if (
      !product ||
      product.assetType !== 'durable' ||
      !instanceId ||
      instanceIds.has(instanceId) ||
      possession.category !== product.category ||
      !Number.isFinite(possession.condition) ||
      possession.condition < 0 ||
      possession.condition > 100 ||
      !Number.isFinite(possession.acquiredPrice) ||
      possession.acquiredPrice < 0 ||
      !Number.isFinite(possession.carryingValue) ||
      possession.carryingValue < 0 ||
      possession.carryingValue >
        possession.acquiredPrice + 0.000001 ||
      !Number.isSafeInteger(possession.acquiredAtTick) ||
      possession.acquiredAtTick < 0 ||
      (
        Number.isSafeInteger(worldTick) &&
        possession.acquiredAtTick > worldTick
      ) ||
      !Number.isSafeInteger(possession.usageCount) ||
      possession.usageCount < 0 ||
      !(
        possession.placedHomeId === null ||
        typeof possession.placedHomeId === 'string'
      )
    ) {
      fail('invalid durable possession');
      continue;
    }
    instanceIds.add(instanceId);
    possessionsById.set(instanceId, possession);
  }
  const activeCategories = {
    homeId: 'housing',
    vehicleId: 'vehicle',
    phoneId: 'phone',
    computerId: 'computer',
    clothingId: 'clothing',
  };
  if (!life.active || typeof life.active !== 'object') {
    fail('invalid active possessions');
  } else {
    for (const [key, category] of Object.entries(
      activeCategories,
    )) {
      const instanceId = life.active[key];
      if (
        instanceId !== null &&
        possessionsById.get(instanceId)?.category !== category
      ) {
        fail('invalid active possession');
      }
    }
  }
  for (const possession of possessionsById.values()) {
    const product = LIFE_PRODUCT_BY_ID[possession.itemId];
    if (
      possession.placedHomeId !== null &&
      (
        possessionsById.get(possession.placedHomeId)?.category !==
          'housing' ||
        !lifeProductRequiresPlacement(product)
      )
    ) {
      fail('invalid placed home');
    }
  }
  for (const home of possessionsById.values()) {
    if (home.category !== 'housing') continue;
    const capacity = Number(
      LIFE_PRODUCT_BY_ID[home.itemId]?.capacity ?? 0,
    );
    const used = [...possessionsById.values()]
      .filter(
        (possession) => possession.placedHomeId === home.instanceId,
      )
      .reduce(
        (sum, possession) =>
          sum + Number(LIFE_PRODUCT_BY_ID[possession.itemId]?.space ?? 0),
        0,
      );
    if (used > capacity) fail('life physical capacity exceeded');
  }
  for (const instanceId of Object.values(life.active ?? {})) {
    const possession = possessionsById.get(instanceId);
    const product = LIFE_PRODUCT_BY_ID[possession?.itemId];
    if (
      possession &&
      lifeProductRequiresPlacement(product) &&
      possession.placedHomeId !== life.active.homeId
    ) {
      fail('active life asset is not placed in active home');
    }
  }
  if (!life.shopStock || typeof life.shopStock !== 'object') {
    fail('invalid shop stock');
  } else {
    for (const product of LIFE_PRODUCT_CATALOG) {
      const stock = life.shopStock[product.id];
      if (
        !Number.isSafeInteger(stock) ||
        stock < 0 ||
        stock > product.stockCap
      ) {
        fail('invalid shop stock entry');
      }
    }
  }
  if (
    !life.subscriptions ||
    typeof life.subscriptions !== 'object'
  ) {
    fail('invalid subscriptions');
  } else {
    for (const [itemId, subscription] of Object.entries(
      life.subscriptions,
    )) {
      if (
        LIFE_PRODUCT_BY_ID[itemId]?.assetType !== 'subscription' ||
        !Number.isSafeInteger(subscription?.startedAtTick) ||
        !Number.isSafeInteger(subscription?.expiresAtTick) ||
        subscription.expiresAtTick < subscription.startedAtTick ||
        (
          Number.isSafeInteger(worldTick) &&
          subscription.startedAtTick > worldTick
        )
      ) {
        fail('invalid subscription');
      }
    }
  }
  if (
    !life.serviceContracts ||
    typeof life.serviceContracts !== 'object'
  ) {
    fail('invalid service contracts');
  } else {
    for (const [itemId, contract] of Object.entries(
      life.serviceContracts,
    )) {
      if (
        LIFE_PRODUCT_BY_ID[itemId]?.assetType !== 'service' ||
        !Number.isSafeInteger(contract?.startedAtTick) ||
        !Number.isSafeInteger(contract?.expiresAtTick) ||
        contract.expiresAtTick < contract.startedAtTick ||
        (
          Number.isSafeInteger(worldTick) &&
          contract.startedAtTick > worldTick
        ) ||
        !Number.isSafeInteger(contract?.usesRemaining) ||
        contract.usesRemaining <= 0
      ) {
        fail('invalid service contract');
      }
    }
  }
  if (
    !Number.isSafeInteger(life.nextRestockTick) ||
    life.nextRestockTick <= 0 ||
    !Number.isSafeInteger(life.actionCount) ||
    life.actionCount < 0 ||
    !Number.isSafeInteger(life.lastSettledTick) ||
    life.lastSettledTick < 0 ||
    !Number.isSafeInteger(life.lastUpkeepTick) ||
    life.lastUpkeepTick < 0 ||
    (
      Number.isSafeInteger(worldTick) &&
      (
        life.lastSettledTick > worldTick ||
        life.lastUpkeepTick > worldTick ||
        life.nextRestockTick <= worldTick ||
        life.nextRestockTick > worldTick + 5
      )
    ) ||
    !Number.isFinite(life.upkeepDue) ||
    life.upkeepDue < 0 ||
    !life.work ||
    !Number.isFinite(life.work.baseIncome) ||
    life.work.baseIncome < 0 ||
    !Number.isSafeInteger(life.work.shiftsCompleted) ||
    life.work.shiftsCompleted < 0 ||
    !Number.isFinite(life.work.totalEarned) ||
    life.work.totalEarned < 0 ||
    !(
      life.work.lastShiftTick === null ||
      (
        Number.isSafeInteger(life.work.lastShiftTick) &&
        life.work.lastShiftTick >= 0 &&
        (
          !Number.isSafeInteger(worldTick) ||
          life.work.lastShiftTick <= worldTick
        )
      )
    )
  ) {
    fail('invalid life counters');
  }
  return errors;
}

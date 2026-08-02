/**
 * City-life authority contract.
 *
 * `player.life` owns the player's needs, contracts and physical possessions.
 * This module owns the surrounding city's places, finite supply, physical
 * transfer ledger and responsibility claims. The engine remains the only
 * writer and calls these deterministic helpers on its cloned draft.
 */

export const CITY_LIFE_CONTRACT_VERSION = 'lzy-city-life-v2';

export const CITY_LIFE_REQUIRED_CATEGORIES = Object.freeze([
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

const MAX_LIVE_SUPPLY_RECORDS = 256;
const MAX_LIVE_OBLIGATIONS = 64;
const SUPPLY_RECORD_FIELD_BY_TYPE = Object.freeze({
  genesis_stock: 'genesisUnits',
  opening_allocation: 'openingAllocatedUnits',
  legacy_opening_allocation: 'openingAllocatedUnits',
  legacy_retail_sale: 'soldUnits',
  retail_sale: 'soldUnits',
  supplier_restock: 'producedUnits',
  asset_buyback: 'boughtBackUnits',
  asset_retired: 'retiredUnits',
});
const SUPPLY_TOTAL_FIELDS = Object.freeze([
  'genesisUnits',
  'openingAllocatedUnits',
  'producedUnits',
  'soldUnits',
  'boughtBackUnits',
  'retiredUnits',
]);

function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function supplyArchiveFor(catalog) {
  return {
    schemaVersion: 'lzy-city-supply-archive-v1',
    recordCount: 0,
    throughSequence: 0,
    fromTick: null,
    toTick: null,
    digest: '00000000',
    totalsByItem: Object.fromEntries(
      catalog.map((product) => [
        product.id,
        Object.fromEntries(
          SUPPLY_TOTAL_FIELDS.map((field) => [field, 0]),
        ),
      ]),
    ),
  };
}

function obligationArchive() {
  return {
    schemaVersion: 'lzy-city-obligation-archive-v1',
    recordCount: 0,
    fromTick: null,
    toTick: null,
    amountTotal: 0,
    openAmount: 0,
    settledAmount: 0,
    lastSettlementTick: null,
    digest: '00000000',
  };
}

function compactSupplyLedger(city) {
  const archive = city.supply.archive;
  while (city.supply.ledger.length > MAX_LIVE_SUPPLY_RECORDS) {
    const record = city.supply.ledger.shift();
    const totalField =
      SUPPLY_RECORD_FIELD_BY_TYPE[record.type];
    archive.recordCount += 1;
    archive.throughSequence = record.sequence;
    archive.fromTick =
      archive.fromTick === null
        ? record.tick
        : Math.min(archive.fromTick, record.tick);
    archive.toTick =
      archive.toTick === null
        ? record.tick
        : Math.max(archive.toTick, record.tick);
    archive.totalsByItem[record.itemId][totalField] +=
      record.quantity;
    archive.digest = hashString(
      `${archive.digest}|${record.sequence}|${record.tick}|${record.type}|${record.itemId}|${record.quantity}|${record.fromOwnerId}|${record.toOwnerId}|${record.unitPrice}`,
    ).toString(16).padStart(8, '0');
  }
}

function archiveObligationRecord(city, obligation) {
  const archive = city.obligationArchive;
  archive.recordCount += 1;
  archive.fromTick =
    archive.fromTick === null
      ? obligation.accruedAtTick
      : Math.min(
          archive.fromTick,
          obligation.accruedAtTick,
        );
  archive.toTick =
    archive.toTick === null
      ? obligation.accruedAtTick
      : Math.max(
          archive.toTick,
          obligation.accruedAtTick,
        );
  archive.amountTotal = money(
    archive.amountTotal + obligation.amount,
  );
  if (obligation.status === 'settled') {
    archive.settledAmount = money(
      archive.settledAmount + obligation.amount,
    );
    archive.lastSettlementTick = Math.max(
      Number(archive.lastSettlementTick) || 0,
      Number(obligation.settledAtTick) || 0,
    );
  } else {
    archive.openAmount = money(
      archive.openAmount + obligation.amount,
    );
  }
  archive.digest = hashString(
    `${archive.digest}|${obligation.id}|${obligation.type}|${obligation.amount}|${obligation.accruedAtTick}|${obligation.dueTick}|${obligation.status}|${obligation.settledAtTick ?? ''}|${(obligation.sourceIds ?? []).join(',')}`,
  ).toString(16).padStart(8, '0');
}

function compactObligations(city) {
  while (city.obligations.length > MAX_LIVE_OBLIGATIONS) {
    archiveObligationRecord(
      city,
      city.obligations.shift(),
    );
  }
}

const LIFE_IMAGES = Object.freeze({
  residence: './assets/life/home-apartment-evening-v1.jpg',
  retail: './assets/life/shop-everyday-goods-v1.jpg',
  mobility: './assets/life/shop-vehicle-city-sedan-v1.jpg',
  digital: './assets/life/shop-digital-devices-v1.jpg',
  service: './assets/life/shop-service-v1.jpg',
  work: './assets/life/shop-computer-v1.jpg',
  home: './assets/life/shop-home-v1.jpg',
});

function cityPlaceImage(placeId) {
  return `./assets/life/places/${placeId}-v1.jpg`;
}

const roleModels = {
  household: {
    ownerKind: 'household',
    ownerId: 'player_household',
    payerAccount: 'player.cash',
    primaryPlaceId: 'player_household_residence',
    primaryPlaceKind: 'residence',
    primaryLabel: '住处',
    storagePlaceId: 'player_household_storage',
    parkingPlaceId: 'player_household_parking',
    carriedPlaceId: 'player_household_carried',
    storageCapacity: 12,
    fleetSlots: 1,
    resources: ['household_budget', 'living_space', 'shared_time'],
    responsibilities: [
      'housing_cost',
      'daily_supply',
      'mobility_cost',
      'health_access',
    ],
    actions: [
      'live',
      'consume',
      'maintain',
      'sell',
      'replace',
      'subscribe',
    ],
  },
  professional: {
    ownerKind: 'natural_person',
    ownerId: 'player_professional',
    payerAccount: 'player.cash',
    primaryPlaceId: 'player_professional_residence',
    primaryPlaceKind: 'residence',
    primaryLabel: '住所',
    storagePlaceId: 'player_professional_storage',
    parkingPlaceId: 'player_professional_parking',
    carriedPlaceId: 'player_professional_carried',
    storageCapacity: 8,
    fleetSlots: 1,
    resources: [
      'personal_budget',
      'credentials',
      'client_time',
      'workplace_access',
    ],
    responsibilities: [
      'personal_living_cost',
      'appointment_duty',
      'credential_term',
      'commute_reliability',
    ],
    actions: [
      'live',
      'serve_clients',
      'study',
      'maintain',
      'sell',
      'subscribe',
    ],
  },
  operator: {
    ownerKind: 'enterprise',
    ownerId: 'player_operating_enterprise',
    payerAccount: 'enterprise.operating_cash',
    primaryPlaceId: 'player_operator_site',
    primaryPlaceKind: 'operations_site',
    primaryLabel: '经营现场',
    storagePlaceId: 'player_operator_warehouse',
    parkingPlaceId: 'player_operator_fleet_yard',
    carriedPlaceId: 'player_operator_staff_issue',
    storageCapacity: 24,
    fleetSlots: 3,
    resources: [
      'operating_site',
      'warehouse_capacity',
      'staff_readiness',
      'fleet_capacity',
    ],
    responsibilities: [
      'business_continuity',
      'staff_service',
      'site_maintenance',
      'fleet_liability',
    ],
    actions: [
      'operate_site',
      'procure',
      'issue_equipment',
      'maintain',
      'dispose_asset',
      'contract_service',
    ],
  },
  institution: {
    ownerKind: 'institution',
    ownerId: 'player_institution',
    payerAccount: 'institution.operating_cash',
    primaryPlaceId: 'player_institution_headquarters',
    primaryPlaceKind: 'headquarters',
    primaryLabel: '机构总部',
    storagePlaceId: 'player_institution_archive',
    parkingPlaceId: 'player_institution_fleet_bay',
    carriedPlaceId: 'player_institution_staff_issue',
    storageCapacity: 30,
    fleetSlots: 4,
    resources: [
      'client_assets',
      'governance_records',
      'dealing_capacity',
      'service_capacity',
    ],
    responsibilities: [
      'client_asset_segregation',
      'governance_archive',
      'service_continuity',
      'operational_resilience',
    ],
    actions: [
      'govern',
      'serve_clients',
      'provision_teams',
      'maintain',
      'dispose_asset',
      'contract_service',
    ],
  },
};

function freezeRoleModel(model) {
  return Object.freeze({
    ...model,
    resources: Object.freeze([...model.resources]),
    responsibilities: Object.freeze([...model.responsibilities]),
    actions: Object.freeze([...model.actions]),
  });
}

export const CITY_ROLE_MODELS = Object.freeze(
  Object.fromEntries(
    Object.entries(roleModels).map(([key, model]) => [
      key,
      freezeRoleModel(model),
    ]),
  ),
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function nextBoundary(currentTick, interval) {
  return Math.floor(currentTick / interval) * interval + interval;
}

function cityRoleFamily(roleType) {
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

function roleModel(roleType) {
  return CITY_ROLE_MODELS[cityRoleFamily(roleType)] ??
    CITY_ROLE_MODELS.household;
}

function rolePlaces(roleType) {
  const role = roleModel(roleType);
  const roleFamily = cityRoleFamily(roleType);
  const common = [
    {
      id: 'city_retail_arcade',
      kind: 'retail_district',
      label: '街区商店',
      description: '日用品、设备与二手回收在这里交割。',
      ownerId: 'city_retail_cooperative',
      image: cityPlaceImage('city_retail_arcade'),
      services: ['retail', 'resale', 'trade_in'],
    },
    {
      id: 'city_health_center',
      kind: 'health_service',
      label: '社区健康中心',
      description: '预约、检查与持续健康服务都有明确期限。',
      ownerId: 'city_health_network',
      image: cityPlaceImage('city_health_center'),
      services: ['health'],
    },
    {
      id: 'city_learning_center',
      kind: 'education_service',
      label: '城市学习中心',
      description: '课程、实训与资格服务按席位和期限供应。',
      ownerId: 'city_learning_network',
      image: cityPlaceImage('city_learning_center'),
      services: ['education'],
    },
    {
      id: 'city_leisure_quarter',
      kind: 'entertainment_service',
      label: '休闲街区',
      description: '运动、放映与文化活动持续轮换。',
      ownerId: 'city_leisure_network',
      image: cityPlaceImage('city_leisure_quarter'),
      services: ['entertainment'],
    },
    {
      id: 'city_mobility_hub',
      kind: 'mobility_service',
      label: '交通与养护站',
      description: '公交接驳、停车和车辆养护都在这里办理。',
      ownerId: 'city_mobility_network',
      image: cityPlaceImage('city_mobility_hub'),
      services: ['mobility', 'maintenance'],
    },
  ];

  if (roleFamily === 'operator') {
    return [
      {
        id: role.primaryPlaceId,
        kind: 'operations_site',
        label: '经营现场',
        description: '设备、人员和日常经营集中在这里。',
        ownerId: role.ownerId,
        image: LIFE_IMAGES.work,
        services: ['operations', 'staff'],
      },
      {
        id: role.storagePlaceId,
        kind: 'warehouse',
        label: '企业仓库',
        description: '采购物资和待用设备存放在这里。',
        ownerId: role.ownerId,
        image: LIFE_IMAGES.retail,
        capacity: role.storageCapacity,
        services: ['storage'],
      },
      {
        id: role.parkingPlaceId,
        kind: 'fleet_yard',
        label: '车队场地',
        description: '每辆需要车位的交通工具都占用场地。',
        ownerId: role.ownerId,
        image: LIFE_IMAGES.mobility,
        parkingCapacity: role.fleetSlots,
        services: ['parking'],
      },
      {
        id: role.carriedPlaceId,
        kind: 'staff_issue',
        label: '员工领用',
        description: '手机、服饰与便携设备由当班人员领用。',
        ownerId: role.ownerId,
        image: LIFE_IMAGES.digital,
        services: ['issue'],
      },
      ...common,
    ];
  }

  if (roleFamily === 'institution') {
    return [
      {
        id: role.primaryPlaceId,
        kind: 'headquarters',
        label: '机构总部',
        description: '投研、交易、风控和服务能力在这里并行运行。',
        ownerId: role.ownerId,
        image: LIFE_IMAGES.work,
        services: ['dealing', 'risk', 'client_service'],
      },
      {
        id: role.storagePlaceId,
        kind: 'governance_archive',
        label: '治理与档案库',
        description: '设备、档案和办公物资存放在这里。',
        ownerId: role.ownerId,
        image: LIFE_IMAGES.digital,
        capacity: role.storageCapacity,
        services: ['archive', 'storage'],
      },
      {
        id: role.parkingPlaceId,
        kind: 'fleet_bay',
        label: '机构车位',
        description: '公务车辆逐辆停放。',
        ownerId: role.ownerId,
        image: LIFE_IMAGES.mobility,
        parkingCapacity: role.fleetSlots,
        services: ['parking'],
      },
      {
        id: role.carriedPlaceId,
        kind: 'staff_issue',
        label: '团队领用',
        description: '终端和服饰按团队使用状态登记。',
        ownerId: role.ownerId,
        image: LIFE_IMAGES.digital,
        services: ['issue'],
      },
      {
        id: 'player_institution_client_hall',
        kind: 'client_service_hall',
        label: '客户服务厅',
        description: '客户服务与机构自用空间明确分开。',
        ownerId: role.ownerId,
        image: LIFE_IMAGES.service,
        services: ['client_service'],
      },
      ...common,
    ];
  }

  return [
    {
      id: role.primaryPlaceId,
      kind: 'residence',
      label: roleType === 'professional' ? '个人住所' : '家庭住处',
      description: '摆放、使用和维护中的物品都能在这里看到。',
      ownerId: role.ownerId,
      image: LIFE_IMAGES.residence,
      services: ['living'],
    },
    {
      id: role.storagePlaceId,
      kind: 'storage',
      label: roleType === 'professional' ? '个人储物间' : '家庭储物间',
      description: '待摆放物品和日常用品存放在这里。',
      ownerId: role.ownerId,
      image: LIFE_IMAGES.home,
      capacity: role.storageCapacity,
      services: ['storage'],
    },
    {
      id: role.parkingPlaceId,
      kind: 'parking',
      label: '停车与车库',
      description: '需要车位的交通工具逐辆占位。',
      ownerId: role.ownerId,
      image: LIFE_IMAGES.mobility,
      parkingCapacity: role.fleetSlots,
      services: ['parking'],
    },
    {
      id: role.carriedPlaceId,
      kind: 'carried',
      label: '随身与常用',
      description: '手机、服饰与便携设备随身携带。',
      ownerId: role.ownerId,
      image: LIFE_IMAGES.digital,
      services: ['carried'],
    },
    ...(roleType === 'professional'
      ? [
          {
            id: 'player_professional_workplace',
            kind: 'professional_workplace',
            label: '专业工作地点',
            description: '客户责任、资格期限与工作设备在此生效。',
            ownerId: 'city_professional_workspace',
            image: LIFE_IMAGES.work,
            services: ['professional_work', 'client_appointments'],
          },
        ]
      : []),
    ...common,
  ];
}

function productSupplyEntry(product) {
  const genesisUnits = Math.max(0, Math.floor(product.stockCap));
  return {
    itemId: product.id,
    supplierId: product.supplierId,
    stock: genesisUnits,
    genesisUnits,
    openingAllocatedUnits: 0,
    producedUnits: 0,
    soldUnits: 0,
    boughtBackUnits: 0,
    retiredUnits: 0,
    inputUnits: Math.max(genesisUnits * 48, 96),
    soldSinceRestock: 0,
    lastTransferTick: 0,
    lastPrice: money(product.price),
  };
}

function genesisLedger(catalog) {
  return catalog.map((product, index) => ({
    sequence: index + 1,
    tick: 0,
    type: 'genesis_stock',
    itemId: product.id,
    quantity: product.stockCap,
    fromOwnerId: product.supplierId,
    toOwnerId: 'city_retail_cooperative',
    unitPrice: money(product.price),
  }));
}

export function createCityLifeState(
  roleType,
  strengthTier,
  currentTick,
  catalog,
  legacyStock = {},
  openingPossessions = [],
) {
  const tick = Math.max(0, Math.floor(Number(currentTick) || 0));
  const role = roleModel(roleType);
  const openingCounts = (openingPossessions ?? [])
    .filter(
      (possession) =>
        possession?.acquiredAtTick === 0 &&
        Number(possession?.acquiredPrice) === 0,
    )
    .reduce((counts, possession) => {
      const itemId = String(possession.itemId ?? '');
      counts[itemId] = (counts[itemId] ?? 0) + 1;
      return counts;
    }, {});
  const entries = Object.fromEntries(
    catalog.map((product) => {
      const entry = productSupplyEntry(product);
      entry.openingAllocatedUnits = Math.min(
        entry.genesisUnits,
        Math.max(
          0,
          Math.floor(Number(openingCounts[product.id]) || 0),
        ),
      );
      const availableAfterOpening =
        entry.genesisUnits - entry.openingAllocatedUnits;
      const quantity = Number(legacyStock?.[product.id]);
      if (Number.isSafeInteger(quantity) && quantity >= 0) {
        const clamped = Math.min(quantity, availableAfterOpening);
        entry.stock = clamped;
        entry.soldUnits = availableAfterOpening - clamped;
        entry.soldSinceRestock = entry.soldUnits;
      } else {
        entry.stock = availableAfterOpening;
      }
      entry.lastTransferTick = tick;
      return [product.id, entry];
    }),
  );
  const ledger = genesisLedger(catalog).map((record) => ({
    ...record,
    tick,
  }));
  for (const product of catalog) {
    const allocated = entries[product.id].openingAllocatedUnits;
    if (allocated <= 0) continue;
    ledger.push({
      sequence: ledger.length + 1,
      tick,
      type: 'opening_allocation',
      itemId: product.id,
      quantity: allocated,
      fromOwnerId: product.supplierId,
      toOwnerId: role.ownerId,
      unitPrice: 0,
    });
  }
  for (const product of catalog) {
    const sold = entries[product.id].soldUnits;
    if (sold <= 0) continue;
    ledger.push({
      sequence: ledger.length + 1,
      tick,
      type: 'legacy_retail_sale',
      itemId: product.id,
      quantity: sold,
      fromOwnerId: 'city_retail_cooperative',
      toOwnerId: role.ownerId,
      unitPrice: money(product.price),
    });
  }
  return {
    contractVersion: CITY_LIFE_CONTRACT_VERSION,
    status: 'running',
    roleType,
    strengthTier,
    role: clone(role),
    places: rolePlaces(roleType),
    lastSettledTick: tick,
    lastObligationTick: tick,
    nextRestockTick: nextBoundary(tick, 5),
    supply: {
      entries,
      ledger,
      nextSequence: ledger.length + 1,
      archive: supplyArchiveFor(catalog),
    },
    obligations: [],
    obligationArchive: obligationArchive(),
    nextObligationSequence: 1,
    feedback: {
      lastRestockTick: null,
      lastPriceMovementTick: tick,
    },
  };
}

export function normalizeCityLifeState(state, catalog) {
  const currentTick = Math.max(
    0,
    Math.floor(Number(state?.world?.tick) || 0),
  );
  const roleType = state?.player?.roleType ?? 'household';
  const strengthTier = state?.player?.strengthTier ?? 'low';
  const source =
    state?.cityLife && typeof state.cityLife === 'object'
      ? state.cityLife
      : null;
  if (!source) {
    return createCityLifeState(
      roleType,
      strengthTier,
      currentTick,
      catalog,
      state?.player?.life?.shopStock,
      state?.player?.life?.possessions,
    );
  }

  const defaults = createCityLifeState(
    roleType,
    strengthTier,
    currentTick,
    catalog,
    {},
    state?.player?.life?.possessions,
  );
  const openingCounts = (state?.player?.life?.possessions ?? [])
    .filter(
      (possession) =>
        possession?.acquiredAtTick === 0 &&
        Number(possession?.acquiredPrice) === 0,
    )
    .reduce((counts, possession) => {
      const itemId = String(possession.itemId ?? '');
      counts[itemId] = (counts[itemId] ?? 0) + 1;
      return counts;
    }, {});
  const entries = Object.fromEntries(
    catalog.map((product) => {
      const fallback = defaults.supply.entries[product.id];
      const raw = source.supply?.entries?.[product.id];
      if (!raw || typeof raw !== 'object') return [product.id, fallback];
      const hasOpeningAllocation = Number.isSafeInteger(
        raw.openingAllocatedUnits,
      );
      const openingAllocatedUnits = hasOpeningAllocation
        ? Math.max(0, raw.openingAllocatedUnits)
        : Math.min(
            Math.max(
              0,
              Math.floor(Number(raw.genesisUnits) || 0),
            ),
            Math.max(
              0,
              Math.floor(Number(openingCounts[product.id]) || 0),
            ),
          );
      return [
        product.id,
        {
          itemId: product.id,
          supplierId: product.supplierId,
          stock: Math.max(
            0,
            Math.floor(Number(raw.stock) || 0) -
              (hasOpeningAllocation ? 0 : openingAllocatedUnits),
          ),
          genesisUnits: Math.max(
            0,
            Math.floor(Number(raw.genesisUnits) || 0),
          ),
          openingAllocatedUnits,
          producedUnits: Math.max(
            0,
            Math.floor(Number(raw.producedUnits) || 0),
          ),
          soldUnits: Math.max(
            0,
            Math.floor(Number(raw.soldUnits) || 0),
          ),
          boughtBackUnits: Math.max(
            0,
            Math.floor(Number(raw.boughtBackUnits) || 0),
          ),
          retiredUnits: Math.max(
            0,
            Math.floor(Number(raw.retiredUnits) || 0),
          ),
          inputUnits: Math.max(
            0,
            Math.floor(Number(raw.inputUnits) || 0),
          ),
          soldSinceRestock: Math.max(
            0,
            Math.floor(Number(raw.soldSinceRestock) || 0),
          ),
          lastTransferTick: Math.max(
            0,
            Math.floor(Number(raw.lastTransferTick) || 0),
          ),
          lastPrice: money(raw.lastPrice || product.price),
        },
      ];
    }),
  );
  const ledger = Array.isArray(source.supply?.ledger)
    ? source.supply.ledger.map((record) => ({ ...record }))
    : defaults.supply.ledger;
  const rawSupplyArchive = source.supply?.archive;
  const supplyArchive = supplyArchiveFor(catalog);
  if (
    rawSupplyArchive?.schemaVersion ===
    supplyArchive.schemaVersion
  ) {
    supplyArchive.recordCount =
      rawSupplyArchive.recordCount;
    supplyArchive.throughSequence =
      rawSupplyArchive.throughSequence;
    supplyArchive.fromTick = rawSupplyArchive.fromTick;
    supplyArchive.toTick = rawSupplyArchive.toTick;
    supplyArchive.digest = rawSupplyArchive.digest;
    for (const product of catalog) {
      for (const field of SUPPLY_TOTAL_FIELDS) {
        supplyArchive.totalsByItem[product.id][field] =
          rawSupplyArchive.totalsByItem?.[product.id]?.[
            field
          ];
      }
    }
  }
  for (const product of catalog) {
    const allocated = entries[product.id].openingAllocatedUnits;
    const recorded =
      Number(
        supplyArchive.totalsByItem?.[product.id]
          ?.openingAllocatedUnits,
      ) +
      ledger
        .filter(
          (record) =>
            [
              'opening_allocation',
              'legacy_opening_allocation',
            ].includes(record.type) &&
            record.itemId === product.id,
        )
        .reduce(
          (sum, record) => sum + Number(record.quantity || 0),
          0,
        );
    if (allocated <= recorded) continue;
    ledger.push({
      sequence:
        Math.max(
          Number(supplyArchive.throughSequence) || 0,
          ledger.reduce(
            (maximum, record) =>
              Math.max(maximum, Number(record.sequence) || 0),
            0,
          ),
        ) + 1,
      tick: currentTick,
      type: 'legacy_opening_allocation',
      itemId: product.id,
      quantity: allocated - recorded,
      fromOwnerId: product.supplierId,
      toOwnerId: roleModel(roleType).ownerId,
      unitPrice: 0,
    });
  }
  ledger.sort((left, right) => left.sequence - right.sequence);
  const obligations = Array.isArray(source.obligations)
    ? source.obligations.map((obligation) => ({ ...obligation }))
    : [];
  const rawObligationArchive = source.obligationArchive;
  const normalizedObligationArchive =
    obligationArchive();
  if (
    rawObligationArchive?.schemaVersion ===
    normalizedObligationArchive.schemaVersion
  ) {
    Object.assign(
      normalizedObligationArchive,
      rawObligationArchive,
    );
  }
  const normalized = {
    ...defaults,
    ...source,
    contractVersion: CITY_LIFE_CONTRACT_VERSION,
    status: 'running',
    roleType,
    strengthTier,
    role: clone(roleModel(roleType)),
    places: rolePlaces(roleType),
    lastSettledTick: Math.max(
      0,
      Number.isSafeInteger(source.lastSettledTick)
        ? source.lastSettledTick
        : currentTick,
    ),
    lastObligationTick: Math.max(
      0,
      Number.isSafeInteger(source.lastObligationTick)
        ? source.lastObligationTick
        : currentTick,
    ),
    nextRestockTick:
      Number.isSafeInteger(source.nextRestockTick) &&
      source.nextRestockTick > 0
        ? source.nextRestockTick
        : nextBoundary(currentTick, 5),
    supply: {
      entries,
      ledger,
      nextSequence: Math.max(
        Number(supplyArchive.throughSequence) + 1,
        ledger.reduce(
          (maximum, record) =>
            Math.max(maximum, Number(record.sequence) || 0),
          0,
        ) + 1,
        Number(source.supply?.nextSequence) || 1,
      ),
      archive: supplyArchive,
    },
    obligations,
    obligationArchive: normalizedObligationArchive,
    nextObligationSequence: Math.max(
      Number(normalizedObligationArchive.recordCount) +
        obligations.length +
        1,
      Number(source.nextObligationSequence) || 1,
    ),
    feedback: {
      ...defaults.feedback,
      ...(source.feedback ?? {}),
    },
  };
  compactSupplyLedger(normalized);
  compactObligations(normalized);
  return normalized;
}

export function quoteCityProduct(city, product, tick) {
  const entry = city?.supply?.entries?.[product.id];
  if (!entry) return money(product.price);
  const capacity = Math.max(1, Number(product.stockCap) || 1);
  const scarcity = clamp(1 - entry.stock / capacity, 0, 1);
  const demand = clamp(
    entry.soldSinceRestock / Math.max(1, capacity * 2),
    0,
    1,
  );
  const pressureRatio = scarcity * 0.18 + demand * 0.12;
  const raw = Number(product.price) * (1 + pressureRatio);
  const minimum = Number(product.price) * product.priceFloorRatio;
  const maximum = Number(product.price) * product.priceCeilingRatio;
  return money(clamp(raw, minimum, maximum));
}

function appendSupplyRecord(
  city,
  { tick, type, itemId, quantity, fromOwnerId, toOwnerId, unitPrice },
) {
  const record = {
    sequence: city.supply.nextSequence,
    tick,
    type,
    itemId,
    quantity,
    fromOwnerId,
    toOwnerId,
    unitPrice: money(unitPrice),
  };
  city.supply.nextSequence += 1;
  city.supply.ledger.push(record);
  compactSupplyLedger(city);
  return record;
}

export function recordCityRetailSale(
  city,
  product,
  tick,
  unitPrice,
  toOwnerId,
) {
  const entry = city.supply.entries[product.id];
  if (!entry || entry.stock <= 0) return null;
  entry.stock -= 1;
  entry.soldUnits += 1;
  entry.soldSinceRestock += 1;
  entry.lastTransferTick = tick;
  entry.lastPrice = money(unitPrice);
  city.feedback.lastPriceMovementTick = tick;
  return appendSupplyRecord(city, {
    tick,
    type: 'retail_sale',
    itemId: product.id,
    quantity: 1,
    fromOwnerId: 'city_retail_cooperative',
    toOwnerId,
    unitPrice,
  });
}

export function recordCityAssetBuyback(
  city,
  product,
  tick,
  unitPrice,
  fromOwnerId,
) {
  const entry = city.supply.entries[product.id];
  if (!entry) return null;
  entry.boughtBackUnits += 1;
  entry.lastTransferTick = tick;
  const canRestock = entry.stock < product.stockCap;
  if (canRestock) {
    entry.stock += 1;
  } else {
    entry.retiredUnits += 1;
  }
  const record = appendSupplyRecord(city, {
    tick,
    type: 'asset_buyback',
    itemId: product.id,
    quantity: 1,
    fromOwnerId,
    toOwnerId: 'city_secondhand_cooperative',
    unitPrice,
  });
  if (!canRestock) {
    appendSupplyRecord(city, {
      tick,
      type: 'asset_retired',
      itemId: product.id,
      quantity: 1,
      fromOwnerId: 'city_secondhand_cooperative',
      toOwnerId: product.supplierId,
      unitPrice: 0,
    });
  }
  return record;
}

export function advanceCityLifeState(city, targetTick, catalog) {
  const tick = Math.max(0, Math.floor(Number(targetTick) || 0));
  const restockBatches = [];
  while (city.nextRestockTick <= tick) {
    const batchTick = city.nextRestockTick;
    const batch = [];
    for (const product of catalog) {
      const entry = city.supply.entries[product.id];
      const missing = Math.max(0, product.stockCap - entry.stock);
      const quantity = Math.min(
        missing,
        product.restockUnits,
        entry.inputUnits,
      );
      if (quantity <= 0) {
        entry.soldSinceRestock = Math.floor(
          entry.soldSinceRestock * 0.35,
        );
        continue;
      }
      entry.stock += quantity;
      entry.producedUnits += quantity;
      entry.inputUnits -= quantity;
      entry.soldSinceRestock = Math.floor(
        entry.soldSinceRestock * 0.35,
      );
      entry.lastTransferTick = batchTick;
      const quoted = quoteCityProduct(city, product, batchTick);
      entry.lastPrice = quoted;
      const record = appendSupplyRecord(city, {
        tick: batchTick,
        type: 'supplier_restock',
        itemId: product.id,
        quantity,
        fromOwnerId: product.supplierId,
        toOwnerId: 'city_retail_cooperative',
        unitPrice: money(product.price * 0.62),
      });
      batch.push(record);
    }
    restockBatches.push({ tick: batchTick, transfers: batch });
    city.feedback.lastRestockTick = batchTick;
    city.nextRestockTick += 5;
  }
  city.lastSettledTick = tick;
  return restockBatches;
}

export function accrueCityObligation(
  city,
  tick,
  amount,
  sourceIds,
  roleType,
) {
  const value = money(amount);
  if (value <= 0) return null;
  const sequence = city.nextObligationSequence;
  city.nextObligationSequence += 1;
  const obligation = {
    id: `city_obligation_${sequence}`,
    type:
      cityRoleFamily(roleType) === 'operator'
        ? 'operating_responsibility'
        : cityRoleFamily(roleType) === 'institution'
          ? 'institutional_operations'
          : 'life_responsibility',
    creditorId: 'city_services_clearing',
    amount: value,
    accruedAtTick: tick,
    dueTick: tick,
    status: 'due',
    sourceIds: [...new Set(sourceIds.filter(Boolean))],
  };
  city.obligations.push(obligation);
  compactObligations(city);
  return obligation;
}

export function cityObligationAmount(city) {
  return money(
    Number(city?.obligationArchive?.openAmount ?? 0) +
    (city?.obligations ?? [])
      .filter((obligation) => obligation.status !== 'settled')
      .reduce((sum, obligation) => sum + obligation.amount, 0),
  );
}

export function cityOpenObligations(city) {
  const archivedAmount = money(
    city?.obligationArchive?.openAmount ?? 0,
  );
  return [
    ...(archivedAmount > 0
      ? [
          {
            id: 'city_obligation_archive_rollup',
            type: 'archived_responsibility_rollup',
            creditorId: 'city_services_clearing',
            amount: archivedAmount,
            accruedAtTick:
              city.obligationArchive.fromTick ?? 0,
            dueTick:
              city.obligationArchive.toTick ?? 0,
            status: 'due',
            sourceIds: [],
            rolledRecordCount:
              city.obligationArchive.recordCount,
          },
        ]
      : []),
    ...(city?.obligations ?? [])
      .filter(
        (obligation) => obligation.status !== 'settled',
      )
      .map((obligation) => clone(obligation)),
  ];
}

export function settleCityObligations(city, tick) {
  const settled = [];
  const archive = city.obligationArchive;
  if (Number(archive?.openAmount) > 0) {
    const amount = money(archive.openAmount);
    archive.openAmount = 0;
    archive.settledAmount = money(
      archive.settledAmount + amount,
    );
    archive.lastSettlementTick = tick;
    archive.digest = hashString(
      `${archive.digest}|settled|${tick}|${amount}`,
    ).toString(16).padStart(8, '0');
    settled.push('city_obligation_archive_rollup');
  }
  for (const obligation of city.obligations) {
    if (obligation.status === 'settled') continue;
    obligation.status = 'settled';
    obligation.settledAtTick = tick;
    settled.push(obligation.id);
  }
  compactObligations(city);
  return settled;
}

export function synchronizeLifeLocations(life, city, catalogById) {
  const role = city.role;
  const activeHomeId = life.active?.homeId ?? null;
  for (const possession of life.possessions ?? []) {
    const product = catalogById[possession.itemId];
    if (!product) continue;
    if (
      typeof possession.locationId === 'string' &&
      possession.locationId
    ) {
      continue;
    }
    if (product.category === 'vehicle') {
      possession.locationId = role.parkingPlaceId;
    } else if (
      product.category === 'phone' ||
      product.category === 'clothing'
    ) {
      possession.locationId = role.carriedPlaceId;
    } else if (product.category === 'housing') {
      possession.locationId = role.primaryPlaceId;
    } else if (
      product.space > 0 &&
      possession.placedHomeId !== activeHomeId
    ) {
      possession.locationId = role.storagePlaceId;
    } else {
      possession.locationId = role.primaryPlaceId;
    }
  }
}

export function projectPhysicalLocations(city, life, catalogById) {
  const role = city.role;
  const activeHome = (life.possessions ?? []).find(
    (possession) => possession.instanceId === life.active?.homeId,
  );
  const homeProduct = catalogById[activeHome?.itemId];
  const primaryUsed = (life.possessions ?? [])
    .filter(
      (possession) =>
        possession.locationId === role.primaryPlaceId &&
        possession.category !== 'housing',
    )
    .reduce(
      (sum, possession) =>
        sum + Number(catalogById[possession.itemId]?.space ?? 0),
      0,
    );
  const inventoryUsed = Object.entries(life.inventory ?? {}).reduce(
    (sum, [itemId, quantity]) =>
      sum + Number(catalogById[itemId]?.space ?? 0) * Number(quantity),
    0,
  );
  const storageUsed =
    inventoryUsed +
    (life.possessions ?? [])
      .filter(
        (possession) =>
          possession.locationId === role.storagePlaceId,
      )
      .reduce(
        (sum, possession) =>
          sum + Number(catalogById[possession.itemId]?.space ?? 0),
        0,
      );
  const parkingUsed = (life.possessions ?? [])
    .filter(
      (possession) =>
        possession.locationId === role.parkingPlaceId,
    )
    .reduce(
      (sum, possession) =>
        sum + Number(catalogById[possession.itemId]?.parking ?? 0),
      0,
    );
  const homeParking = Number(homeProduct?.parking ?? 0);
  return {
    primary: {
      id: role.primaryPlaceId,
      used: primaryUsed,
      capacity: Number(homeProduct?.capacity ?? 0),
    },
    storage: {
      id: role.storagePlaceId,
      used: storageUsed,
      capacity: Number(role.storageCapacity ?? 0),
    },
    parking: {
      id: role.parkingPlaceId,
      used: parkingUsed,
      capacity: Math.max(
        homeParking,
        Number(role.fleetSlots ?? 0),
      ),
    },
    carried: {
      id: role.carriedPlaceId,
      count: (life.possessions ?? []).filter(
        (possession) =>
          possession.locationId === role.carriedPlaceId,
      ).length,
    },
  };
}

export function projectCityLifeState(city, catalog) {
  const prices = Object.fromEntries(
    catalog.map((product) => [
      product.id,
      quoteCityProduct(city, product, city.lastSettledTick),
    ]),
  );
  const shopStock = Object.fromEntries(
    catalog.map((product) => [
      product.id,
      city.supply.entries[product.id]?.stock ?? 0,
    ]),
  );
  return {
    city: clone(city),
    role: clone(city.role),
    places: clone(city.places),
    prices,
    shopStock,
  };
}

export function auditCityLifeState(
  city,
  catalog,
  life,
  context = {},
) {
  const errors = [];
  const fail = (reason) => {
    if (!errors.includes(reason)) errors.push(reason);
  };
  const worldTick = Number.isSafeInteger(context.worldTick)
    ? context.worldTick
    : null;
  if (
    !city ||
    city.contractVersion !== CITY_LIFE_CONTRACT_VERSION ||
    city.status !== 'running'
  ) {
    return ['invalid city life root'];
  }
  const expectedRole = roleModel(city.roleType);
  if (
    context.roleType !== undefined &&
    city.roleType !== context.roleType
  ) {
    fail('city life role differs from player role');
  }
  if (
    city.role?.ownerKind !== expectedRole.ownerKind ||
    city.role?.payerAccount !== expectedRole.payerAccount ||
    city.role?.primaryPlaceId !== expectedRole.primaryPlaceId
  ) {
    fail('invalid city life role contract');
  }
  const placeIds = new Set((city.places ?? []).map((place) => place.id));
  if (
    placeIds.size !== (city.places ?? []).length ||
    !placeIds.has(expectedRole.primaryPlaceId) ||
    !placeIds.has(expectedRole.storagePlaceId) ||
    !placeIds.has(expectedRole.parkingPlaceId) ||
    !placeIds.has(expectedRole.carriedPlaceId)
  ) {
    fail('invalid city life places');
  }
  if (
    ['operator', 'institution'].includes(
      cityRoleFamily(city.roleType),
    ) &&
    city.places.some((place) => place.kind === 'residence')
  ) {
    fail('organization cannot use a personal residence');
  }
  if (
    !Number.isSafeInteger(city.lastSettledTick) ||
    city.lastSettledTick < 0 ||
    !Number.isSafeInteger(city.lastObligationTick) ||
    city.lastObligationTick < 0 ||
    !Number.isSafeInteger(city.nextRestockTick) ||
    city.nextRestockTick <= 0 ||
    (
      worldTick !== null &&
      (
        city.lastSettledTick > worldTick ||
        city.lastObligationTick > worldTick ||
        city.nextRestockTick <= worldTick ||
        city.nextRestockTick > worldTick + 5
      )
    )
  ) {
    fail('invalid city life schedule');
  }

  const catalogById = Object.fromEntries(
    catalog.map((product) => [product.id, product]),
  );
  for (const product of catalog) {
    const entry = city.supply?.entries?.[product.id];
    if (
      !entry ||
      entry.itemId !== product.id ||
      entry.supplierId !== product.supplierId
    ) {
      fail('invalid city supply entry');
      continue;
    }
    for (const field of [
      'stock',
      'genesisUnits',
      'openingAllocatedUnits',
      'producedUnits',
      'soldUnits',
      'boughtBackUnits',
      'retiredUnits',
      'inputUnits',
      'soldSinceRestock',
    ]) {
      if (!Number.isSafeInteger(entry[field]) || entry[field] < 0) {
        fail('invalid city supply quantity');
      }
    }
    const expectedStock =
      entry.genesisUnits +
      entry.producedUnits +
      entry.boughtBackUnits -
      entry.openingAllocatedUnits -
      entry.soldUnits -
      entry.retiredUnits;
    if (entry.stock !== expectedStock || entry.stock > product.stockCap) {
      fail('city supply conservation mismatch');
    }
  }
  const ledgerTotals = Object.fromEntries(
    catalog.map((product) => [
      product.id,
      {
        genesisUnits: 0,
        openingAllocatedUnits: 0,
        producedUnits: 0,
        soldUnits: 0,
        boughtBackUnits: 0,
        retiredUnits: 0,
      },
    ]),
  );
  const supplyArchive = city.supply?.archive;
  const supplyArchiveValid =
    supplyArchive?.schemaVersion ===
      'lzy-city-supply-archive-v1' &&
    Number.isSafeInteger(supplyArchive.recordCount) &&
    supplyArchive.recordCount >= 0 &&
    supplyArchive.throughSequence ===
      supplyArchive.recordCount &&
    typeof supplyArchive.digest === 'string' &&
    /^[0-9a-f]{8}$/u.test(supplyArchive.digest) &&
    (
      supplyArchive.recordCount === 0
        ? supplyArchive.fromTick === null &&
          supplyArchive.toTick === null
        : Number.isSafeInteger(supplyArchive.fromTick) &&
          Number.isSafeInteger(supplyArchive.toTick) &&
          supplyArchive.fromTick >= 0 &&
          supplyArchive.toTick >=
            supplyArchive.fromTick &&
          (
            worldTick === null ||
            supplyArchive.toTick <= worldTick
          )
    );
  if (!supplyArchiveValid) {
    fail('invalid city supply archive');
  } else {
    for (const product of catalog) {
      const archivedTotals =
        supplyArchive.totalsByItem?.[product.id];
      if (
        !archivedTotals ||
        SUPPLY_TOTAL_FIELDS.some(
          (field) =>
            !Number.isSafeInteger(
              archivedTotals[field],
            ) ||
            archivedTotals[field] < 0,
        )
      ) {
        fail('invalid city supply archive');
        continue;
      }
      for (const field of SUPPLY_TOTAL_FIELDS) {
        ledgerTotals[product.id][field] =
          archivedTotals[field];
      }
    }
  }
  const ledger = city.supply?.ledger;
  if (
    !Array.isArray(ledger) ||
    ledger.length > MAX_LIVE_SUPPLY_RECORDS
  ) {
    fail('invalid city supply ledger');
  }
  const sequences = new Set();
  for (const [index, record] of (ledger ?? []).entries()) {
    const totalField =
      SUPPLY_RECORD_FIELD_BY_TYPE[record.type];
    if (
      !Number.isSafeInteger(record.sequence) ||
      record.sequence !==
        Number(supplyArchive?.throughSequence) +
          index +
          1 ||
      sequences.has(record.sequence) ||
      !catalogById[record.itemId] ||
      !totalField ||
      !Number.isSafeInteger(record.quantity) ||
      record.quantity <= 0 ||
      !Number.isSafeInteger(record.tick) ||
      record.tick < 0 ||
      (
        index > 0 &&
        record.tick < ledger[index - 1].tick
      ) ||
      (
        index === 0 &&
        supplyArchive?.toTick !== null &&
        record.tick < supplyArchive.toTick
      ) ||
      (worldTick !== null && record.tick > worldTick) ||
      typeof record.fromOwnerId !== 'string' ||
      !record.fromOwnerId ||
      typeof record.toOwnerId !== 'string' ||
      !record.toOwnerId ||
      !Number.isFinite(record.unitPrice) ||
      record.unitPrice < 0
    ) {
      fail('invalid city supply ledger');
    } else {
      ledgerTotals[record.itemId][totalField] += record.quantity;
    }
    sequences.add(record.sequence);
  }
  if (
    !Number.isSafeInteger(city.supply?.nextSequence) ||
    city.supply.nextSequence !==
      Number(supplyArchive?.recordCount) +
        (ledger?.length ?? 0) +
        1
  ) {
    fail('invalid city supply ledger sequence');
  }
  for (const product of catalog) {
    const entry = city.supply?.entries?.[product.id];
    const totals = ledgerTotals[product.id];
    if (
      !entry ||
      !totals ||
      [
        'genesisUnits',
        'openingAllocatedUnits',
        'producedUnits',
        'soldUnits',
        'boughtBackUnits',
        'retiredUnits',
      ].some((field) => entry[field] !== totals[field])
    ) {
      fail('city supply ledger does not reconcile');
    }
  }

  const archivedObligations = city.obligationArchive;
  const obligationArchiveValid =
    archivedObligations?.schemaVersion ===
      'lzy-city-obligation-archive-v1' &&
    Number.isSafeInteger(
      archivedObligations.recordCount,
    ) &&
    archivedObligations.recordCount >= 0 &&
    typeof archivedObligations.digest === 'string' &&
    /^[0-9a-f]{8}$/u.test(
      archivedObligations.digest,
    ) &&
    [
      archivedObligations.amountTotal,
      archivedObligations.openAmount,
      archivedObligations.settledAmount,
    ].every(
      (amount) =>
        Number.isFinite(amount) && amount >= 0,
    ) &&
    money(
      archivedObligations.openAmount +
        archivedObligations.settledAmount,
    ) === money(archivedObligations.amountTotal) &&
    (
      archivedObligations.recordCount === 0
        ? archivedObligations.fromTick === null &&
          archivedObligations.toTick === null &&
          archivedObligations.amountTotal === 0
        : Number.isSafeInteger(
            archivedObligations.fromTick,
          ) &&
          Number.isSafeInteger(
            archivedObligations.toTick,
          ) &&
          archivedObligations.fromTick >= 0 &&
          archivedObligations.toTick >=
            archivedObligations.fromTick &&
          (
            worldTick === null ||
            archivedObligations.toTick <= worldTick
          )
    ) &&
    (
      archivedObligations.lastSettlementTick === null ||
      (
        Number.isSafeInteger(
          archivedObligations.lastSettlementTick,
        ) &&
        archivedObligations.lastSettlementTick >= 0 &&
        (
          worldTick === null ||
          archivedObligations.lastSettlementTick <=
            worldTick
        )
      )
    );
  if (!obligationArchiveValid) {
    fail('invalid city obligation archive');
  }
  if (
    !Array.isArray(city.obligations) ||
    city.obligations.length > MAX_LIVE_OBLIGATIONS
  ) {
    fail('invalid city obligation');
  }
  const obligationIds = new Set();
  for (const obligation of city.obligations ?? []) {
    if (
      !obligation.id ||
      obligationIds.has(obligation.id) ||
      !Number.isFinite(obligation.amount) ||
      obligation.amount <= 0 ||
      !['due', 'settled', 'delinquent'].includes(obligation.status) ||
      !Number.isSafeInteger(obligation.dueTick) ||
      obligation.dueTick < 0 ||
      !Number.isSafeInteger(obligation.accruedAtTick) ||
      obligation.accruedAtTick < 0 ||
      (
        worldTick !== null &&
        (
          obligation.dueTick > worldTick ||
          obligation.accruedAtTick > worldTick ||
          (
            obligation.settledAtTick !== undefined &&
            (
              !Number.isSafeInteger(obligation.settledAtTick) ||
              obligation.settledAtTick > worldTick
            )
          )
        )
      )
    ) {
      fail('invalid city obligation');
    }
    obligationIds.add(obligation.id);
  }
  if (
    !Number.isSafeInteger(
      city.nextObligationSequence,
    ) ||
    city.nextObligationSequence !==
      Number(
        archivedObligations?.recordCount,
      ) +
        (city.obligations?.length ?? 0) +
        1
  ) {
    fail('invalid city obligation sequence');
  }

  if (life) {
    if (
      money(life.upkeepDue) !== cityObligationAmount(city)
    ) {
      fail('life obligation mirror differs from city authority');
    }
    const locations = projectPhysicalLocations(city, life, catalogById);
    if (locations.primary.used > locations.primary.capacity) {
      fail('city primary place capacity exceeded');
    }
    if (locations.storage.used > locations.storage.capacity) {
      fail('city storage capacity exceeded');
    }
    if (locations.parking.used > locations.parking.capacity) {
      fail('city parking capacity exceeded');
    }
    for (const possession of life.possessions ?? []) {
      const product = catalogById[possession.itemId];
      if (!product || !placeIds.has(possession.locationId)) {
        fail('owned asset has no physical location');
        continue;
      }
      if (
        product.category === 'vehicle' &&
        possession.locationId !== expectedRole.parkingPlaceId
      ) {
        fail('vehicle is outside audited parking');
      }
      const requiresCapacityPlacement =
        product.assetType === 'durable' &&
        product.category !== 'housing' &&
        product.category !== 'clothing' &&
        Number(product.space) > 0;
      if (
        requiresCapacityPlacement &&
        ![
          expectedRole.primaryPlaceId,
          expectedRole.storagePlaceId,
        ].includes(possession.locationId)
      ) {
        fail('space-using asset has no capacity location');
      }
      if (
        requiresCapacityPlacement &&
        (
          possession.locationId === expectedRole.primaryPlaceId
        ) !==
          (
            possession.placedHomeId === life.active?.homeId
          )
      ) {
        fail('asset placement and location disagree');
      }
    }
  }
  return errors;
}

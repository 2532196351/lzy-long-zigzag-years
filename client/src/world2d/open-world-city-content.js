export const OPEN_WORLD_CONTENT_SCHEMA = 'lzy-open-world-content-v1';

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function affordance(
  affordanceId,
  labelZh,
  intentKind,
  minimumDurationMs,
  resourceBoardRef,
  settledEventKinds,
) {
  return {
    affordanceId,
    labelZh,
    intentKind,
    minimumDurationMs,
    resourceBoardRef,
    requiresAuthoritySettlement: true,
    settledEventKinds,
  };
}

function place(placeId, labelZh, kind, useClasses, primaryAffordances) {
  return { placeId, labelZh, kind, useClasses, primaryAffordances };
}

function link(routeId, fromPlaceId, toPlaceId, minimumDurationMs) {
  return {
    routeId,
    routeVersion: 1,
    fromPlaceId,
    toPlaceId,
    supportedModes: ['on_foot'],
    minimumDurationMs,
    requiresAuthoritySettlement: true,
  };
}

export const JIANGWAN_OPEN_WORLD_CONTENT = deepFreeze({
  schema: OPEN_WORLD_CONTENT_SCHEMA,
  contentVersion: 'jiangwan-life-content-v1',
  cityId: 'linlan',
  districtId: 'jiangwan',
  entryPlaceId: 'jiangwan_home_gate',
  runtimeContract: {
    authorityWriter: 'worker_controller',
    progressionBoundary: 'processNextEvent',
    elapsedHistoryReadsPerProjection: 0,
    maximumContextActionsPerFocus: 2,
  },
  places: [
    place(
      'jiangwan_home_gate',
      '江湾住区门厅',
      'residential_entry',
      ['home', 'portal'],
      [
        affordance(
          'enter_jiangwan_home',
          '回家',
          'enter_place',
          20_000,
          'access:jiangwan_home',
          ['PortalTraversed'],
        ),
      ],
    ),
    place(
      'morning_tide_breakfast',
      '潮生早餐铺',
      'business',
      ['food', 'retail', 'social'],
      [
        affordance(
          'buy_breakfast',
          '买早餐',
          'accept_offer',
          8 * 60_000,
          'offers:morning_tide_breakfast',
          ['OfferSettled', 'MealConsumed'],
        ),
        affordance(
          'enter_breakfast_shop',
          '进店',
          'enter_place',
          20_000,
          'access:morning_tide_breakfast',
          ['PortalTraversed'],
        ),
      ],
    ),
    place(
      'harbor_daily_store',
      '海角日用店',
      'business',
      ['retail', 'household', 'business'],
      [
        affordance(
          'buy_daily_goods',
          '选购日用品',
          'accept_offer',
          10 * 60_000,
          'offers:harbor_daily_store',
          ['OfferSettled', 'InventoryCustodyTransferred'],
        ),
      ],
    ),
    place(
      'riverside_walk',
      '江湾河畔步道',
      'outdoor',
      ['entertainment', 'walking', 'social'],
      [
        affordance(
          'join_riverside_walk',
          '沿河慢走',
          'join_activity',
          30 * 60_000,
          'activities:riverside_walk',
          ['ActivityStarted', 'ActivityCompleted'],
        ),
      ],
    ),
    place(
      'community_court',
      '江湾社区球场',
      'outdoor',
      ['entertainment', 'sport', 'social'],
      [
        affordance(
          'join_community_game',
          '参加球局',
          'join_activity',
          60 * 60_000,
          'activities:community_court',
          ['ActivityStarted', 'ActivityCompleted'],
        ),
      ],
    ),
    place(
      'jiangwan_bus_stop',
      '江湾里公交站',
      'transit_stop',
      ['transit', 'waiting'],
      [
        affordance(
          'board_jiangwan_bus',
          '乘公交',
          'board_transit',
          12 * 60_000,
          'transit:jiangwan_bus_stop',
          ['TransitBoarded', 'TravelLegCompleted'],
        ),
      ],
    ),
    place(
      'jiangwan_clinic',
      '江湾社区门诊',
      'service',
      ['health_service', 'appointment'],
      [
        affordance(
          'attend_clinic_service',
          '接受服务',
          'accept_offer',
          30 * 60_000,
          'services:jiangwan_clinic',
          ['ServiceAppointmentSettled', 'ServiceCompleted'],
        ),
      ],
    ),
    place(
      'jiangwan_library',
      '江湾图书馆',
      'public_interior',
      ['culture', 'entertainment', 'learning'],
      [
        affordance(
          'join_library_reading',
          '参加共读',
          'join_activity',
          45 * 60_000,
          'activities:jiangwan_library',
          ['ActivityStarted', 'ActivityCompleted'],
        ),
      ],
    ),
    place(
      'old_port_market',
      '旧港生活集市',
      'market',
      ['retail', 'food', 'business', 'social'],
      [
        affordance(
          'buy_market_goods',
          '逛集市',
          'accept_offer',
          15 * 60_000,
          'offers:old_port_market',
          ['OfferSettled', 'InventoryCustodyTransferred'],
        ),
      ],
    ),
    place(
      'riverside_ferry_pier',
      '江湾渡口',
      'transit_stop',
      ['transit', 'entertainment', 'waterfront'],
      [
        affordance(
          'board_riverside_ferry',
          '乘渡船',
          'board_transit',
          18 * 60_000,
          'transit:riverside_ferry_pier',
          ['TransitBoarded', 'TravelLegCompleted'],
        ),
      ],
    ),
    place(
      'jiangwan_workshop',
      '江湾共作间',
      'business_workspace',
      ['work', 'business', 'craft'],
      [
        affordance(
          'use_workshop_station',
          '使用工位',
          'use_asset',
          40 * 60_000,
          'assets:jiangwan_workshop_stations',
          ['AssetUseStarted', 'WorkSessionCompleted'],
        ),
      ],
    ),
    place(
      'jiangwan_property_office',
      '江湾住区服务处',
      'service',
      ['housing', 'maintenance', 'business'],
      [
        affordance(
          'book_property_service',
          '预约住区服务',
          'accept_offer',
          12 * 60_000,
          'services:jiangwan_property_office',
          ['ServiceAppointmentSettled'],
        ),
      ],
    ),
  ],
  routeLinks: [
    link('walk_home_breakfast', 'jiangwan_home_gate', 'morning_tide_breakfast', 4 * 60_000),
    link('walk_breakfast_daily', 'morning_tide_breakfast', 'harbor_daily_store', 2 * 60_000),
    link('walk_daily_bus', 'harbor_daily_store', 'jiangwan_bus_stop', 5 * 60_000),
    link('walk_bus_clinic', 'jiangwan_bus_stop', 'jiangwan_clinic', 3 * 60_000),
    link('walk_clinic_property', 'jiangwan_clinic', 'jiangwan_property_office', 2 * 60_000),
    link('walk_daily_old_port', 'harbor_daily_store', 'old_port_market', 6 * 60_000),
    link('walk_old_port_workshop', 'old_port_market', 'jiangwan_workshop', 3 * 60_000),
    link('walk_old_port_library', 'old_port_market', 'jiangwan_library', 5 * 60_000),
    link('walk_library_riverside', 'jiangwan_library', 'riverside_walk', 4 * 60_000),
    link('walk_riverside_court', 'riverside_walk', 'community_court', 5 * 60_000),
    link('walk_court_ferry', 'community_court', 'riverside_ferry_pier', 6 * 60_000),
    link('walk_ferry_bus', 'riverside_ferry_pier', 'jiangwan_bus_stop', 7 * 60_000),
  ],
});

function neighbors(content, placeId) {
  const result = [];
  for (const route of content.routeLinks) {
    if (route.fromPlaceId === placeId) {
      result.push({ route, nextPlaceId: route.toPlaceId, direction: 'forward' });
    } else if (route.toPlaceId === placeId) {
      result.push({ route, nextPlaceId: route.fromPlaceId, direction: 'reverse' });
    }
  }
  return result.sort(
    (left, right) =>
      left.route.routeId.localeCompare(right.route.routeId) ||
      left.nextPlaceId.localeCompare(right.nextPlaceId),
  );
}

export function findOpenWorldPlaceRoute(
  fromPlaceId,
  toPlaceId,
  content = JIANGWAN_OPEN_WORLD_CONTENT,
) {
  const placeIds = new Set(content.places.map((entry) => entry.placeId));
  if (!placeIds.has(fromPlaceId) || !placeIds.has(toPlaceId)) return null;
  if (fromPlaceId === toPlaceId) {
    return deepFreeze({
      fromPlaceId,
      toPlaceId,
      minimumDurationMs: 0,
      steps: [],
    });
  }
  const queue = [fromPlaceId];
  const visited = new Set(queue);
  const previous = new Map();
  while (queue.length > 0) {
    const current = queue.shift();
    for (const edge of neighbors(content, current)) {
      if (visited.has(edge.nextPlaceId)) continue;
      visited.add(edge.nextPlaceId);
      previous.set(edge.nextPlaceId, { from: current, ...edge });
      if (edge.nextPlaceId === toPlaceId) queue.length = 0;
      else queue.push(edge.nextPlaceId);
    }
  }
  if (!previous.has(toPlaceId)) return null;
  const steps = [];
  let cursor = toPlaceId;
  while (cursor !== fromPlaceId) {
    const edge = previous.get(cursor);
    if (!edge) return null;
    steps.push({
      routeId: edge.route.routeId,
      routeVersion: edge.route.routeVersion,
      fromPlaceId: edge.from,
      toPlaceId: cursor,
      direction: edge.direction,
      supportedModes: [...edge.route.supportedModes],
      minimumDurationMs: edge.route.minimumDurationMs,
      requiresAuthoritySettlement:
        edge.route.requiresAuthoritySettlement,
    });
    cursor = edge.from;
  }
  steps.reverse();
  return deepFreeze({
    fromPlaceId,
    toPlaceId,
    minimumDurationMs: steps.reduce(
      (sum, step) => sum + step.minimumDurationMs,
      0,
    ),
    steps,
  });
}

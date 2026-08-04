import { JIANGWAN_OUTDOOR_CITY_PACK } from './city-pack.js?v=f34a1d70e1a7aaed';

export const WORLD2D_SCHEMA_VERSION = 'lzy-world2d-v1';
export const WORLD2D_PUBLIC_SCHEMA = 'lzy-world2d-public-v1';
export const WORLD2D_SCENE_ID = 'jiangwan_home';
export const WORLD2D_GEOMETRY_REVISION = 'jiangwan-home-v1';
export const WORLD2D_OUTDOOR_SCENE_ID = 'jiangwan_outdoor';
export const WORLD2D_OUTDOOR_GEOMETRY_REVISION =
  'jiangwan-outdoor-v2';
export const WORLD2D_MOTION_STEP_MS = 50;
export const WORLD2D_MOTION_STEP_Q = 256;
export const WORLD2D_PLAYER_RADIUS_Q = 256;
export const WORLD2D_GRID_Q = 512;

const rect = (id, x, y, width, height, kind, labelZh) =>
  Object.freeze({ id, x, y, width, height, kind, labelZh });

export const JIANGWAN_HOME_SCENE = Object.freeze({
  id: WORLD2D_SCENE_ID,
  nameZh: '江湾里 · 家',
  districtZh: '江湾里',
  packVersion: 'jiangwan-home-pack-v1',
  geometryRevision: WORLD2D_GEOMETRY_REVISION,
  coordinateScale: 1024,
  bounds: Object.freeze({ x: 0, y: 0, width: 12_288, height: 8_192 }),
  walkBounds: Object.freeze({
    minX: 1_280,
    minY: 1_280,
    maxX: 11_008,
    maxY: 6_912,
  }),
  colliders: Object.freeze([
    rect('bed_body', 2_048, 1_280, 2_048, 1_024, 'bed', '床'),
    rect('computer_desk', 8_192, 1_280, 1_536, 1_024, 'computer', '电脑桌'),
    rect('reading_sofa', 5_120, 2_048, 2_048, 1_024, 'sofa', '沙发'),
    rect('dining_table', 4_608, 4_096, 2_048, 1_024, 'table', '餐桌'),
    rect('storage_wall', 9_728, 4_096, 1_024, 1_536, 'storage', '收纳柜'),
  ]),
  anchors: Object.freeze({
    home_entry: Object.freeze({ x: 2_048, y: 6_656 }),
    door_stand: Object.freeze({ x: 2_048, y: 6_656 }),
    bed_stand: Object.freeze({ x: 3_072, y: 2_560 }),
    computer_stand: Object.freeze({ x: 8_704, y: 2_560 }),
    window_stand: Object.freeze({ x: 6_144, y: 1_536 }),
  }),
  interactables: Object.freeze([
    Object.freeze({
      entityId: 'home_bed',
      kind: 'bed',
      labelZh: '床',
      verbZh: '休息',
      standAnchorId: 'bed_stand',
      maxDistanceQ: 768,
      hintZh: '靠近后休息，恢复精力并推进真实生活状态',
    }),
    Object.freeze({
      entityId: 'home_computer',
      kind: 'computer',
      labelZh: '家用电脑',
      verbZh: '打开终端',
      standAnchorId: 'computer_stand',
      maxDistanceQ: 896,
      hintZh: '进入同一个股票、期货、期权三列终端',
    }),
    Object.freeze({
      entityId: 'home_door',
      kind: 'portal',
      labelZh: '江湾里街区出口',
      verbZh: '出门',
      standAnchorId: 'door_stand',
      maxDistanceQ: 768,
      hintZh: '通往街区、商店、交通与工作地点',
      interactionKind: 'scene_transition',
      portalId: 'home_to_jiangwan_street',
    }),
    Object.freeze({
      entityId: 'home_window',
      kind: 'window',
      labelZh: '临街窗',
      verbZh: '观察天气',
      standAnchorId: 'window_stand',
      maxDistanceQ: 896,
      hintZh: '查看江湾里的天气、时段与街区动静',
    }),
  ]),
});

const OUTDOOR_INTERACTABLES = Object.freeze([
  Object.freeze({
    entityId: 'street_home_gate',
    kind: 'portal',
    labelZh: '江湾住区门厅',
    verbZh: '回家',
    standAnchorId: 'home_arrival',
    maxDistanceQ: 768,
    hintZh: '回到你在江湾里的住处',
    interactionKind: 'scene_transition',
    portalId: 'jiangwan_street_to_home',
    placeId: 'jiangwan_home_gate',
  }),
  Object.freeze({
    entityId: 'street_breakfast_shop',
    kind: 'business',
    labelZh: '潮生早餐铺',
    verbZh: '进店',
    standAnchorId: 'breakfast_door',
    maxDistanceQ: 896,
    hintZh: '查看此刻真实营业与可购买内容',
    interactionKind: 'place_visit',
    placeId: 'morning_tide_breakfast',
  }),
  Object.freeze({
    entityId: 'street_daily_store',
    kind: 'business',
    labelZh: '海角日用店',
    verbZh: '进店',
    standAnchorId: 'daily_store_door',
    maxDistanceQ: 896,
    hintZh: '进入街区日用消费地点',
    interactionKind: 'place_visit',
    placeId: 'harbor_daily_store',
  }),
  Object.freeze({
    entityId: 'street_riverside_walk',
    kind: 'leisure',
    labelZh: '江湾河畔步道',
    verbZh: '停留',
    standAnchorId: 'riverside_entry',
    maxDistanceQ: 896,
    hintZh: '沿河散步、休息或观察街区',
    interactionKind: 'place_visit',
    placeId: 'riverside_walk',
  }),
  Object.freeze({
    entityId: 'street_community_court',
    kind: 'leisure',
    labelZh: '江湾社区球场',
    verbZh: '到场',
    standAnchorId: 'court_entry',
    maxDistanceQ: 896,
    hintZh: '到场后查看可参加的运动与社交活动',
    interactionKind: 'place_visit',
    placeId: 'community_court',
  }),
  Object.freeze({
    entityId: 'street_bus_stop',
    kind: 'transit',
    labelZh: '江湾里公交站',
    verbZh: '候车',
    standAnchorId: 'bus_stop_wait',
    maxDistanceQ: 896,
    hintZh: '到站后查看世界时间下的真实班次',
    interactionKind: 'place_visit',
    placeId: 'jiangwan_bus_stop',
  }),
  Object.freeze({
    entityId: 'street_jiangwan_clinic',
    kind: 'service',
    labelZh: '江湾社区门诊',
    verbZh: '就诊',
    standAnchorId: 'clinic_entry',
    maxDistanceQ: 896,
    hintZh: '到达后查看当前服务、候诊与费用',
    interactionKind: 'place_visit',
    placeId: 'jiangwan_clinic',
  }),
  Object.freeze({
    entityId: 'street_jiangwan_library',
    kind: 'culture',
    labelZh: '江湾图书馆',
    verbZh: '进馆',
    standAnchorId: 'library_entry',
    maxDistanceQ: 896,
    hintZh: '进入阅读、学习与社区活动地点',
    interactionKind: 'place_visit',
    placeId: 'jiangwan_library',
  }),
  Object.freeze({
    entityId: 'street_old_port_market',
    kind: 'market',
    labelZh: '旧港生活集市',
    verbZh: '逛集',
    standAnchorId: 'old_port_entry',
    maxDistanceQ: 896,
    hintZh: '查看当前摊位、供给、人流与可成交商品',
    interactionKind: 'place_visit',
    placeId: 'old_port_market',
  }),
  Object.freeze({
    entityId: 'street_riverside_ferry',
    kind: 'transit',
    labelZh: '江湾渡口',
    verbZh: '候船',
    standAnchorId: 'ferry_wait',
    maxDistanceQ: 896,
    hintZh: '到达后查看当前船班、余位和江面状态',
    interactionKind: 'place_visit',
    placeId: 'riverside_ferry_pier',
  }),
  Object.freeze({
    entityId: 'street_jiangwan_workshop',
    kind: 'workspace',
    labelZh: '江湾共作间',
    verbZh: '进场',
    standAnchorId: 'workshop_entry',
    maxDistanceQ: 896,
    hintZh: '使用可控工位、设备与真实工作时段',
    interactionKind: 'place_visit',
    placeId: 'jiangwan_workshop',
  }),
  Object.freeze({
    entityId: 'street_property_office',
    kind: 'service',
    labelZh: '江湾住区服务处',
    verbZh: '办理',
    standAnchorId: 'property_office_entry',
    maxDistanceQ: 896,
    hintZh: '查看住房、维修、物业与生活服务',
    interactionKind: 'place_visit',
    placeId: 'jiangwan_property_office',
  }),
]);

export const JIANGWAN_OUTDOOR_SCENE = Object.freeze({
  id: WORLD2D_OUTDOOR_SCENE_ID,
  nameZh: '江湾里 · 街区',
  districtZh: '江湾里',
  packVersion:
    JIANGWAN_OUTDOOR_CITY_PACK.saveCompatibility.packVersion,
  geometryRevision: WORLD2D_OUTDOOR_GEOMETRY_REVISION,
  compatibleGeometryRevisions:
    JIANGWAN_OUTDOOR_CITY_PACK.saveCompatibility
      .compatibleGeometryRevisions,
  coordinateScale: JIANGWAN_OUTDOOR_CITY_PACK.coordinateScale,
  bounds: JIANGWAN_OUTDOOR_CITY_PACK.bounds,
  walkBounds: JIANGWAN_OUTDOOR_CITY_PACK.walkBounds,
  roads: JIANGWAN_OUTDOOR_CITY_PACK.roads,
  walkableRegions: JIANGWAN_OUTDOOR_CITY_PACK.walkableRegions,
  colliders: Object.freeze(
    JIANGWAN_OUTDOOR_CITY_PACK.colliders.map((collider) =>
      Object.freeze({
        id: collider.colliderId,
        x: collider.x,
        y: collider.y,
        width: collider.width,
        height: collider.height,
        kind: 'building',
        labelZh: collider.colliderId,
      }),
    ),
  ),
  anchors: JIANGWAN_OUTDOOR_CITY_PACK.anchors,
  interactables: OUTDOOR_INTERACTABLES,
  places: JIANGWAN_OUTDOOR_CITY_PACK.places,
  landmarks: JIANGWAN_OUTDOOR_CITY_PACK.accessibility.landmarks,
  environmentCapabilities:
    JIANGWAN_OUTDOOR_CITY_PACK.environmentCapabilities,
});

export const WORLD2D_SCENES = Object.freeze({
  [WORLD2D_SCENE_ID]: JIANGWAN_HOME_SCENE,
  [WORLD2D_OUTDOOR_SCENE_ID]: JIANGWAN_OUTDOOR_SCENE,
});

const WORLD2D_PORTALS = Object.freeze(
  Object.fromEntries(
    JIANGWAN_OUTDOOR_CITY_PACK.portals.map((portal) => [
      portal.portalId,
      portal,
    ]),
  ),
);

export function world2dScene(sceneId = WORLD2D_SCENE_ID) {
  return WORLD2D_SCENES[sceneId] ?? null;
}

export function world2dAnchor(sceneId, anchorId) {
  return world2dScene(sceneId)?.anchors?.[anchorId] ?? null;
}

export function world2dPortal(portalId) {
  return WORLD2D_PORTALS[portalId] ?? null;
}

export function world2dInteractable(sceneId, entityId) {
  return (
    world2dScene(sceneId)?.interactables.find(
      (entry) => entry.entityId === entityId,
    ) ?? null
  );
}

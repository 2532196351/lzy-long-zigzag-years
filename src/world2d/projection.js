import {
  WORLD2D_PUBLIC_SCHEMA,
  world2dAnchor,
  world2dScene,
} from './scene.js?v=20260803-02';

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function activeComputer(world) {
  const instanceId = world.player?.life?.active?.computerId;
  return world.player?.life?.possessions?.find(
    (possession) => possession.instanceId === instanceId,
  );
}

function availability(world, entry) {
  if (entry.kind !== 'computer') {
    return { available: true, unavailableReason: null };
  }
  const computer = activeComputer(world);
  if (!computer) {
    return { available: false, unavailableReason: '你还没有可用电脑。' };
  }
  if (Number(computer.condition) <= 0) {
    return { available: false, unavailableReason: '电脑需要维修。' };
  }
  return { available: true, unavailableReason: null };
}

export function projectWorld2D(world, { authorityCommitSeq = null } = {}) {
  const spatial = world?.spatial;
  const scene = world2dScene(spatial?.activeSceneId);
  if (!spatial || !scene) return null;
  const player = spatial.player;
  const interactables = scene.interactables.map((entry) => {
    const anchor = world2dAnchor(scene.id, entry.standAnchorId);
    const state = availability(world, entry);
    return {
      entityId: entry.entityId,
      kind: entry.kind,
      labelZh: entry.labelZh,
      verbZh: entry.verbZh,
      hintZh: entry.hintZh,
      standAnchorId: entry.standAnchorId,
      standPositionQ: clone(anchor),
      maxDistanceQ: entry.maxDistanceQ,
      interactionKind: entry.interactionKind ?? null,
      portalId: entry.portalId ?? null,
      placeId: entry.placeId ?? null,
      distanceQ: Math.round(
        Math.hypot(
          anchor.x - player.positionQ.x,
          anchor.y - player.positionQ.y,
        ),
      ),
      ...state,
    };
  });
  return clone({
    schema: WORLD2D_PUBLIC_SCHEMA,
    worldId: world.world.id,
    authorityCommitSeq:
      Number.isSafeInteger(authorityCommitSeq)
        ? authorityCommitSeq
        : player.authorityCommitSeq,
    authorityVirtualMs: player.authorityVirtualMs,
    projectionSeq: spatial.projectionSeq,
    scene: {
      id: scene.id,
      nameZh: scene.nameZh,
      districtZh: scene.districtZh,
      packVersion: scene.packVersion,
      geometryRevision: scene.geometryRevision,
      coordinateScale: scene.coordinateScale,
      bounds: scene.bounds,
      walkBounds: scene.walkBounds,
      colliders: scene.colliders,
      roads: scene.roads ?? [],
      walkableRegions: scene.walkableRegions ?? [],
      landmarks: scene.landmarks ?? [],
      places: scene.places ?? [],
      environmentState: spatial.sceneStates[scene.id].environmentState,
    },
    playerPose: {
      sceneId: player.sceneId,
      positionQ: player.positionQ,
      facing: player.facing,
      locomotionMode: player.locomotionMode,
      intentKind: player.currentIntent.kind,
      controlSeq: player.controlSeq,
      routeId: player.routeId,
      occupancyAnchorId: player.occupancyAnchorId,
      currentPlaceId: player.currentPlaceId,
      authorityCommitSeq: player.authorityCommitSeq,
    },
    visibleActors: [],
    visibleAssets: scene.colliders.map((collider) => ({
      entityId: collider.id,
      kind: collider.kind,
    })),
    interactables,
    portalStates: scene.interactables
      .filter((entry) => entry.kind === 'portal' && entry.portalId)
      .map((entry) => ({
        portalId: entry.portalId,
        entityId: entry.entityId,
        status: spatial.unlockedPortals.includes(entry.portalId)
          ? 'open'
          : 'locked',
        labelZh: entry.labelZh,
      })),
    nearbyAudioFacts:
      scene.id === 'jiangwan_home'
        ? [{ zoneId: 'home_rain_window', kind: 'rain', active: true }]
        : [{ zoneId: 'jiangwan_rain', kind: 'rain', active: true }],
  });
}

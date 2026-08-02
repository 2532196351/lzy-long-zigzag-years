import { JIANGWAN_ART_PACK_V1 } from '../world2d/jiangwan-art-pack.js?v=20260803-02';

const ART_FRAME_SCHEMA = 'lzy-game2d-art-frame-v1';
const WORLD2D_SCHEMA = 'lzy-world2d-public-v1';
const CITY_LIFE_SCHEMA = 'lzy-open-world-city-life-v1';

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function text(value) {
  return typeof value === 'string' && value.length > 0;
}

function commitSeq(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function finiteCoordinate(value) {
  return Number.isSafeInteger(value);
}

function position(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    finiteCoordinate(value.x) &&
    finiteCoordinate(value.y) &&
    (value.elevationQ === undefined || finiteCoordinate(value.elevationQ))
  );
}

function normalizedPosition(value) {
  return {
    x: value.x,
    y: value.y,
    elevationQ: value.elevationQ ?? 0,
  };
}

function assertWorldProjection(projection) {
  if (
    projection?.schema !== WORLD2D_SCHEMA ||
    !text(projection.worldId) ||
    !commitSeq(projection.authorityCommitSeq) ||
    projection?.scene?.id !== JIANGWAN_ART_PACK_V1.sceneId ||
    projection.scene.geometryRevision !==
      JIANGWAN_ART_PACK_V1.geometryRevision ||
    projection?.playerPose?.sceneId !== JIANGWAN_ART_PACK_V1.sceneId ||
    !position(projection.playerPose.positionQ) ||
    projection.playerPose.authorityCommitSeq !==
      projection.authorityCommitSeq
  ) {
    throw new TypeError('JIANGWAN_ART_FRAME_INVALID_WORLD2D_PROJECTION');
  }
}

function assertCityProjection(city, world) {
  if (city === null || city === undefined) return;
  if (
    city.schema !== CITY_LIFE_SCHEMA ||
    city.worldId !== world.worldId ||
    city.authorityCommitSeq !== world.authorityCommitSeq
  ) {
    throw new TypeError('JIANGWAN_ART_FRAME_CANONICAL_COMMIT_MISMATCH');
  }
}

function assertPreviousProjection(previous, world) {
  if (previous === null || previous === undefined) return;
  if (
    previous.schema !== WORLD2D_SCHEMA ||
    previous.worldId !== world.worldId ||
    previous?.scene?.id !== world.scene.id ||
    previous.scene.geometryRevision !== world.scene.geometryRevision ||
    !commitSeq(previous.authorityCommitSeq) ||
    previous.authorityCommitSeq > world.authorityCommitSeq ||
    previous?.playerPose?.authorityCommitSeq !==
      previous.authorityCommitSeq ||
    !position(previous?.playerPose?.positionQ)
  ) {
    throw new TypeError('JIANGWAN_ART_FRAME_INVALID_PREVIOUS_PROJECTION');
  }
}

function resolveAlias(value, aliases, errorCode) {
  const resolved = aliases[value];
  if (!resolved) throw new TypeError(errorCode);
  return resolved;
}

function environmentFrom(world) {
  const state = world.scene.environmentState;
  if (state === null || typeof state !== 'object') {
    throw new TypeError('JIANGWAN_ART_FRAME_INVALID_ENVIRONMENT');
  }
  const dayPhase = resolveAlias(
    state.dayPhase ?? state.light,
    JIANGWAN_ART_PACK_V1.environmentBindings.lightAliases,
    'JIANGWAN_ART_FRAME_UNSUPPORTED_DAY_PHASE',
  );
  const weather = resolveAlias(
    state.weather,
    JIANGWAN_ART_PACK_V1.environmentBindings.weatherAliases,
    'JIANGWAN_ART_FRAME_UNSUPPORTED_WEATHER',
  );
  return {
    dayPhase,
    weather,
    traffic: state.traffic ?? state.trafficBand ?? 'unobserved',
    footfall: state.footfall ?? state.footfallBand ?? 'unobserved',
    source: 'world2d_authority_projection',
  };
}

function interpolatePosition(current, previous, alpha) {
  const currentQ = normalizedPosition(current);
  if (!previous) return currentQ;
  const previousQ = normalizedPosition(previous);
  return {
    x: Math.round(previousQ.x + (currentQ.x - previousQ.x) * alpha),
    y: Math.round(previousQ.y + (currentQ.y - previousQ.y) * alpha),
    elevationQ: Math.round(
      previousQ.elevationQ +
        (currentQ.elevationQ - previousQ.elevationQ) * alpha,
    ),
  };
}

function projectToScreenQ(worldPositionQ) {
  return {
    x: worldPositionQ.x - worldPositionQ.y,
    y: Math.round(
      (worldPositionQ.x + worldPositionQ.y) / 2 -
        worldPositionQ.elevationQ,
    ),
  };
}

function assetById(assetId) {
  const entry = JIANGWAN_ART_PACK_V1.assets.find(
    (candidate) => candidate.assetId === assetId,
  );
  if (!entry) throw new TypeError('JIANGWAN_ART_FRAME_ASSET_REFERENCE_MISSING');
  return entry;
}

function assetByCategory(category) {
  const entry = JIANGWAN_ART_PACK_V1.assets.find(
    (candidate) => candidate.category === category,
  );
  if (!entry) throw new TypeError('JIANGWAN_ART_FRAME_ASSET_CATEGORY_MISSING');
  return entry;
}

function layerById(layerId) {
  const layer = JIANGWAN_ART_PACK_V1.layers.find(
    (candidate) => candidate.layerId === layerId,
  );
  if (!layer) throw new TypeError('JIANGWAN_ART_FRAME_LAYER_REFERENCE_MISSING');
  return layer;
}

function drawableBase({
  renderId,
  entityId = null,
  sourceKind,
  asset,
  worldPositionQ,
  positionSource,
  placeId = null,
  presentationState,
  motionClipId = null,
  scaleMilli = 1_000,
}) {
  const screenPositionQ = projectToScreenQ(worldPositionQ);
  const layer = layerById(asset.layerId);
  return {
    renderId,
    entityId,
    sourceKind,
    category: asset.category,
    assetId: asset.assetId,
    sourcePath: asset.sourcePath,
    footprintQ: asset.footprintQ,
    heightQ: asset.heightQ,
    pivotQ: asset.pivotQ,
    scaleMilli,
    layerId: asset.layerId,
    worldPositionQ,
    screenPositionQ,
    depthKey: [layer.depthBand, screenPositionQ.y, renderId],
    positionSource,
    placeId,
    presentationState,
    motionClipId,
    contactShadow: asset.contactShadow,
    interactionAnchors: asset.interactionAnchors,
  };
}

function placeStateMap(city) {
  if (!city) return new Map();
  return new Map(
    (Array.isArray(city.placeStates) ? city.placeStates : [])
      .filter(
        (entry) =>
          text(entry?.placeId) &&
          ['open', 'closed', 'limited', 'under_work'].includes(
            entry.openState,
          ),
      )
      .map((entry) => [entry.placeId, entry]),
  );
}

function staticPresentationState(instance, asset, places, environment) {
  if (instance.stateSource === 'city_place_projection') {
    const state = places.get(instance.placeId);
    if (!state) return 'unknown';
    if (asset.category === 'interior') {
      return state.occupancy > 0
        ? 'occupied_authority_required'
        : 'unoccupied';
    }
    return state.openState;
  }
  if (instance.stateSource === 'environment_projection') {
    return environment.dayPhase;
  }
  if (asset.category === 'road') {
    return ['rain', 'light_rain'].includes(environment.weather) ? 'wet' : 'dry';
  }
  return 'static_content';
}

function staticDrawables(places, environment) {
  return JIANGWAN_ART_PACK_V1.sceneInstances.map((instance) => {
    const asset = assetById(instance.assetId);
    const worldPositionQ = normalizedPosition(instance.positionQ);
    return drawableBase({
      renderId: `static:${instance.instanceId}`,
      sourceKind: 'art_pack_static',
      asset,
      worldPositionQ,
      positionSource: 'art_pack_scene_anchor',
      placeId: instance.placeId,
      presentationState: staticPresentationState(
        instance,
        asset,
        places,
        environment,
      ),
      scaleMilli: instance.scaleMilli,
    });
  });
}

const FACING_ANGLE = Object.freeze({
  north: 0,
  east: 90,
  south: 180,
  west: 270,
});

const INTERACTION_CLIPS = new Set(['interact_reach', 'interact_carry']);

function movingIntent(pose) {
  return ['vector', 'route', 'move', 'walk'].includes(pose?.intentKind);
}

function positionChanged(current, previous) {
  if (!previous) return false;
  const currentQ = normalizedPosition(current);
  const previousQ = normalizedPosition(previous);
  return (
    currentQ.x !== previousQ.x ||
    currentQ.y !== previousQ.y ||
    currentQ.elevationQ !== previousQ.elevationQ
  );
}

function facingDelta(current, previous) {
  if (!previous || !(current in FACING_ANGLE) || !(previous in FACING_ANGLE)) {
    return 0;
  }
  const raw = Math.abs(FACING_ANGLE[current] - FACING_ANGLE[previous]);
  return Math.min(raw, 360 - raw);
}

function motionClip(current, previous) {
  if (current.animationSemantic !== undefined) {
    if (!INTERACTION_CLIPS.has(current.animationSemantic)) {
      throw new TypeError(
        'JIANGWAN_ART_FRAME_UNSUPPORTED_ANIMATION_SEMANTIC',
      );
    }
    return current.animationSemantic;
  }
  const changed = positionChanged(current.positionQ, previous?.positionQ);
  if (changed) {
    return previous && !movingIntent(previous) && movingIntent(current)
      ? 'walk_start'
      : 'walk_loop';
  }
  if (previous && movingIntent(previous) && !movingIntent(current)) {
    return 'walk_stop';
  }
  const rotation = facingDelta(current.facing, previous?.facing);
  if (rotation === 180) return 'turn_180';
  if (rotation === 90) return 'turn_90';
  return movingIntent(current) ? 'walk_loop' : 'idle';
}

function entityMap(entries) {
  return new Map(
    (Array.isArray(entries) ? entries : [])
      .filter((entry) => text(entry?.entityId))
      .map((entry) => [entry.entityId, entry]),
  );
}

function assertVisibleEntries(entries, code) {
  if (entries === undefined) return;
  if (
    !Array.isArray(entries) ||
    entries.some(
      (entry) =>
        !text(entry?.entityId) ||
        !position(entry.positionQ) ||
        !text(entry.facing),
    )
  ) {
    throw new TypeError(code);
  }
  if (new Set(entries.map((entry) => entry.entityId)).size !== entries.length) {
    throw new TypeError(code);
  }
}

function dynamicDrawable({
  entry,
  previous,
  asset,
  interpolationAlpha,
  motionEnabled,
  reducedMotion,
}) {
  const previousPosition = previous?.positionQ;
  const worldPositionQ = interpolatePosition(
    entry.positionQ,
    previousPosition,
    interpolationAlpha,
  );
  const clip = motionEnabled ? motionClip(entry, previous) : null;
  return {
    ...drawableBase({
      renderId: `${asset.category}:${entry.entityId}`,
      entityId: entry.entityId,
      sourceKind: 'authority_visible_entity',
      asset,
      worldPositionQ,
      positionSource: previousPosition
        ? 'interpolated_authority_poses'
        : 'current_authority_pose',
      presentationState:
        entry.stateVariant ?? 'authority_state_unspecified',
      motionClipId: clip,
    }),
    facing: entry.facing,
    motionSamplePolicy: reducedMotion
      ? 'reduced_motion_key_pose'
      : 'continuous_clip_sample',
  };
}

function dynamicDrawables(world, previous, interpolationAlpha, reducedMotion) {
  assertVisibleEntries(
    world.visibleActors,
    'JIANGWAN_ART_FRAME_INVALID_VISIBLE_ACTOR',
  );
  assertVisibleEntries(
    world.visibleVehicles,
    'JIANGWAN_ART_FRAME_INVALID_VISIBLE_VEHICLE',
  );
  const previousActors = entityMap(previous?.visibleActors);
  const previousVehicles = entityMap(previous?.visibleVehicles);
  const character = assetByCategory('character');
  const vehicle = assetByCategory('vehicle');
  const player = dynamicDrawable({
    entry: {
      ...world.playerPose,
      entityId: 'player',
    },
    previous: previous
      ? { ...previous.playerPose, entityId: 'player' }
      : null,
    asset: character,
    interpolationAlpha,
    motionEnabled: true,
    reducedMotion,
  });
  const actors = (world.visibleActors ?? []).map((entry) =>
    dynamicDrawable({
      entry,
      previous: previousActors.get(entry.entityId),
      asset: character,
      interpolationAlpha,
      motionEnabled: true,
      reducedMotion,
    }),
  );
  const vehicles = (world.visibleVehicles ?? []).map((entry) =>
    dynamicDrawable({
      entry,
      previous: previousVehicles.get(entry.entityId),
      asset: vehicle,
      interpolationAlpha,
      motionEnabled: false,
      reducedMotion,
    }),
  );
  return [player, ...actors, ...vehicles];
}

function weatherDrawable(environment) {
  const asset = assetByCategory('weather');
  return drawableBase({
    renderId: 'environment:weather',
    sourceKind: 'authority_environment_effect',
    asset,
    worldPositionQ: { x: 16_384, y: 16_384, elevationQ: 4_096 },
    positionSource: 'art_pack_scene_anchor',
    presentationState: environment.weather,
  });
}

function compareDrawables(left, right) {
  if (left.depthKey[0] !== right.depthKey[0]) {
    return left.depthKey[0] - right.depthKey[0];
  }
  if (left.depthKey[1] !== right.depthKey[1]) {
    return left.depthKey[1] - right.depthKey[1];
  }
  return left.depthKey[2].localeCompare(right.depthKey[2]);
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const left = polygon[current];
    const right = polygon[previous];
    const crosses =
      left.y > point.y !== right.y > point.y &&
      point.x <
        ((right.x - left.x) * (point.y - left.y)) / (right.y - left.y) +
          left.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function occlusionProjection(drawables) {
  const entries = drawables
    .filter(({ sourceKind }) => sourceKind === 'authority_visible_entity')
    .map((drawable) => ({
      entityId: drawable.entityId,
      occluderIds: JIANGWAN_ART_PACK_V1.occluders
        .filter(({ polygonQ }) =>
          pointInPolygon(drawable.worldPositionQ, polygonQ),
        )
        .map(({ occluderId }) => occluderId)
        .sort(),
    }))
    .filter(({ occluderIds }) => occluderIds.length > 0)
    .map(({ entityId, occluderIds }) => ({
      entityId,
      occluderIds,
      mode: 'fade_foreground_presentation_only',
    }))
    .sort((left, right) => left.entityId.localeCompare(right.entityId));
  return {
    entries,
    collisionMutationAllowed: false,
    source: 'art_pack_presentation_metadata',
  };
}

function performanceProjection(drawables, occlusion) {
  const budget = JIANGWAN_ART_PACK_V1.runtimeBudget;
  const visibleEntities = drawables.filter(
    ({ sourceKind }) => sourceKind === 'authority_visible_entity',
  ).length;
  const drawCommandsPerFrame = drawables.length;
  const occlusionMasks = occlusion.entries.reduce(
    (count, entry) => count + entry.occluderIds.length,
    0,
  );
  const dynamicLights = drawables.filter(
    ({ category }) => category === 'lighting',
  ).length;
  const weatherLayers = drawables.filter(
    ({ category }) => category === 'weather',
  ).length;
  const violations = [];
  if (visibleEntities > budget.maximumVisibleEntities) {
    violations.push('MAXIMUM_VISIBLE_ENTITIES');
  }
  if (drawCommandsPerFrame > budget.maximumDrawCommandsPerFrame) {
    violations.push('MAXIMUM_DRAW_COMMANDS_PER_FRAME');
  }
  if (occlusionMasks > budget.maximumOcclusionMasks) {
    violations.push('MAXIMUM_OCCLUSION_MASKS');
  }
  if (dynamicLights > budget.maximumDynamicLights) {
    violations.push('MAXIMUM_DYNAMIC_LIGHTS');
  }
  if (weatherLayers > budget.maximumWeatherLayers) {
    violations.push('MAXIMUM_WEATHER_LAYERS');
  }
  return {
    status: violations.length === 0 ? 'WITHIN_STATIC_BUDGET' : 'OVER_BUDGET',
    measurements: {
      visibleEntities,
      drawCommandsPerFrame,
      occlusionMasks,
      dynamicLights,
      weatherLayers,
      atlasPages: 1,
    },
    limits: {
      visibleEntities: budget.maximumVisibleEntities,
      drawCommandsPerFrame: budget.maximumDrawCommandsPerFrame,
      occlusionMasks: budget.maximumOcclusionMasks,
      dynamicLights: budget.maximumDynamicLights,
      weatherLayers: budget.maximumWeatherLayers,
      atlasPages: budget.maximumAtlasPages,
    },
    violations,
    authoritativeEntitiesDropped: 0,
    elapsedHistoryReads: 0,
    frameTimingEvidence: 'UNVERIFIED',
  };
}

export function projectJiangwanArtFrame({
  world2dProjection,
  cityLifeProjection = null,
  previousWorld2dProjection = null,
  interpolationAlpha = 1,
  reducedMotion = false,
} = {}) {
  assertWorldProjection(world2dProjection);
  assertCityProjection(cityLifeProjection, world2dProjection);
  assertPreviousProjection(previousWorld2dProjection, world2dProjection);
  if (
    !Number.isFinite(interpolationAlpha) ||
    interpolationAlpha < 0 ||
    interpolationAlpha > 1 ||
    typeof reducedMotion !== 'boolean'
  ) {
    throw new TypeError('JIANGWAN_ART_FRAME_INVALID_RENDER_OPTIONS');
  }

  const environment = environmentFrom(world2dProjection);
  const places = placeStateMap(cityLifeProjection);
  const drawables = [
    ...staticDrawables(places, environment),
    ...dynamicDrawables(
      world2dProjection,
      previousWorld2dProjection,
      interpolationAlpha,
      reducedMotion,
    ),
    weatherDrawable(environment),
  ].sort(compareDrawables);
  const occlusion = occlusionProjection(drawables);
  const performance = performanceProjection(drawables, occlusion);

  return deepFreeze({
    schema: ART_FRAME_SCHEMA,
    packId: JIANGWAN_ART_PACK_V1.packId,
    worldId: world2dProjection.worldId,
    authorityCommitSeq: world2dProjection.authorityCommitSeq,
    source: {
      sceneId: world2dProjection.scene.id,
      geometryRevision: world2dProjection.scene.geometryRevision,
      projectionSeq: world2dProjection.projectionSeq,
      authorityVirtualMs: world2dProjection.authorityVirtualMs,
    },
    authorityContract: {
      readOnlyProjection: true,
      authorityWriter: 'worker_controller',
      progressionBoundary: 'processNextEvent',
      saveBarrierCommitSeqRequired: true,
      authorityMutationAllowed: false,
      elapsedHistoryReads: 0,
    },
    integrationStatus: 'PLAYER_REACHABLE_TECHNICAL_SLICE_UNBENCHMARKED',
    environment,
    drawables,
    occlusion,
    performance,
    claimBoundary: {
      sourceAssetsFinalArt: false,
      runtimeBenchmarked: false,
      blindRealtimeTestVerified: false,
      professionalArtSignoffVerified: false,
      playerReachable: true,
      productionIntegrated: true,
      releaseQualityVerified: false,
      comparativeSuperiorityVerified: false,
    },
  });
}

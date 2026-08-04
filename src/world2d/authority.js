import {
  JIANGWAN_HOME_SCENE,
  WORLD2D_SCENES,
  WORLD2D_GEOMETRY_REVISION,
  WORLD2D_GRID_Q,
  WORLD2D_MOTION_STEP_MS,
  WORLD2D_MOTION_STEP_Q,
  WORLD2D_PLAYER_RADIUS_Q,
  WORLD2D_SCENE_ID,
  WORLD2D_SCHEMA_VERSION,
  world2dAnchor,
  world2dPortal,
  world2dScene,
} from './scene.js?v=20260804-01';

const MAX_RECENT_CONTROL_COMMANDS = 32;
const MAX_PATH_EXPANSIONS = 2_048;

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function point(x, y) {
  return { x, y };
}

function safePoint(value) {
  return Boolean(
    value &&
      Number.isSafeInteger(value.x) &&
      Number.isSafeInteger(value.y),
  );
}

function samePoint(left, right) {
  return left?.x === right?.x && left?.y === right?.y;
}

function pointInsideInflatedRect(position, collider, radius) {
  return (
    position.x > collider.x - radius &&
    position.x < collider.x + collider.width + radius &&
    position.y > collider.y - radius &&
    position.y < collider.y + collider.height + radius
  );
}

export function positionIsWalkable(
  scene,
  position,
  radius = WORLD2D_PLAYER_RADIUS_Q,
) {
  if (!scene || !safePoint(position)) return false;
  const bounds = scene.walkBounds;
  if (
    position.x < bounds.minX ||
    position.x > bounds.maxX ||
    position.y < bounds.minY ||
    position.y > bounds.maxY
  ) {
    return false;
  }
  return !scene.colliders.some((collider) =>
    pointInsideInflatedRect(position, collider, radius),
  );
}

function idleIntent() {
  return { kind: 'idle' };
}

function createSceneState(scene) {
  const outdoor = scene.id === 'jiangwan_outdoor';
  return {
    sceneId: scene.id,
    packVersion: scene.packVersion,
    geometryRevision: scene.geometryRevision,
    interactableIds: scene.interactables.map(
      (entry) => entry.entityId,
    ),
    environmentState: {
      weather: outdoor ? 'rain' : 'light_rain',
      light: 'morning',
      ...(outdoor
        ? { traffic: 'moderate', footfall: 'waking' }
        : { windowOpen: false }),
    },
    mutations: [],
  };
}

function sceneGeometryIsCompatible(scene, geometryRevision) {
  return (
    geometryRevision === scene.geometryRevision ||
    scene.compatibleGeometryRevisions?.includes(geometryRevision)
  );
}

function nearestSafeAnchor(scene, position) {
  return Object.entries(scene.anchors ?? {})
    .filter(([, anchor]) => positionIsWalkable(scene, anchor))
    .sort(
      (left, right) =>
        Math.hypot(
          left[1].x - position.x,
          left[1].y - position.y,
        ) -
          Math.hypot(
            right[1].x - position.x,
            right[1].y - position.y,
          ) ||
        left[0].localeCompare(right[0]),
    )[0] ?? null;
}

function migrateSceneState(existing, scene) {
  if (
    existing.geometryRevision !== scene.geometryRevision &&
    !sceneGeometryIsCompatible(scene, existing.geometryRevision)
  ) {
    throw new Error('Invalid or incompatible LZY spatial geometry.');
  }
  const geometryMigrated =
    existing.geometryRevision !== scene.geometryRevision;
  existing.sceneId = scene.id;
  existing.packVersion = scene.packVersion;
  existing.geometryRevision = scene.geometryRevision;
  existing.interactableIds = scene.interactables.map(
    (entry) => entry.entityId,
  );
  existing.environmentState ??= createSceneState(scene).environmentState;
  existing.mutations ??= [];
  return geometryMigrated;
}

export function createWorldSpatialState() {
  const entry = JIANGWAN_HOME_SCENE.anchors.home_entry;
  return {
    schemaVersion: WORLD2D_SCHEMA_VERSION,
    activeSceneId: WORLD2D_SCENE_ID,
    geometryRevision: WORLD2D_GEOMETRY_REVISION,
    player: {
      sceneId: WORLD2D_SCENE_ID,
      positionQ: clone(entry),
      facing: 'north',
      locomotionMode: 'on_foot',
      currentIntent: idleIntent(),
      controlSeq: 0,
      routeId: null,
      occupancyAnchorId: null,
      currentPlaceId: 'jiangwan_home',
      lastSafeAnchorId: 'home_entry',
      lastMotionEventSeq: 0,
      authorityCommitSeq: 0,
      authorityVirtualMs: 0,
    },
    sceneStates: Object.fromEntries(
      Object.values(WORLD2D_SCENES).map((scene) => [
        scene.id,
        createSceneState(scene),
      ]),
    ),
    npcSpatial: {},
    occupancy: {},
    unlockedPortals: [
      'home_to_jiangwan_street',
      'jiangwan_street_to_home',
    ],
    nextSpatialEventSeq: 1,
    recentControlCommands: [],
    projectionSeq: 0,
  };
}

export function normalizeWorldSpatialState(world) {
  if (!world || typeof world !== 'object') {
    throw new TypeError('A world object is required.');
  }
  if (world.spatial === undefined || world.spatial === null) {
    world.spatial = createWorldSpatialState();
    return { migrated: true, geometryMigrated: false };
  }
  if (world.spatial.schemaVersion !== WORLD2D_SCHEMA_VERSION) {
    throw new Error('Invalid or incompatible LZY spatial save.');
  }
  let migrated = false;
  let geometryMigrated = false;
  world.spatial.recentControlCommands ??= [];
  world.spatial.projectionSeq ??= 0;
  world.spatial.npcSpatial ??= {};
  world.spatial.occupancy ??= {};
  world.spatial.unlockedPortals ??= [];
  for (const portalId of [
    'home_to_jiangwan_street',
    'jiangwan_street_to_home',
  ]) {
    if (!world.spatial.unlockedPortals.includes(portalId)) {
      world.spatial.unlockedPortals.push(portalId);
    }
  }
  world.spatial.nextSpatialEventSeq ??= 1;
  world.spatial.player.currentIntent ??= idleIntent();
  world.spatial.player.routeId ??= null;
  world.spatial.player.occupancyAnchorId ??= null;
  world.spatial.player.currentPlaceId ??=
    world.spatial.activeSceneId === WORLD2D_SCENE_ID
      ? 'jiangwan_home'
      : world.spatial.activeSceneId;
  world.spatial.player.lastSafeAnchorId ??= 'home_entry';
  world.spatial.player.lastMotionEventSeq ??= 0;
  world.spatial.player.authorityCommitSeq ??= 0;
  world.spatial.player.authorityVirtualMs ??= 0;
  world.spatial.sceneStates ??= {};
  for (const scene of Object.values(WORLD2D_SCENES)) {
    if (!world.spatial.sceneStates[scene.id]) {
      world.spatial.sceneStates[scene.id] = createSceneState(scene);
      migrated = true;
      continue;
    }
    const sceneMigrated = migrateSceneState(
      world.spatial.sceneStates[scene.id],
      scene,
    );
    migrated ||= sceneMigrated;
    geometryMigrated ||= sceneMigrated;
  }
  const activeScene = world2dScene(world.spatial.activeSceneId);
  if (!activeScene) {
    throw new Error('Invalid or incompatible LZY spatial scene.');
  }
  if (
    world.spatial.geometryRevision !== activeScene.geometryRevision
  ) {
    if (
      !sceneGeometryIsCompatible(
        activeScene,
        world.spatial.geometryRevision,
      )
    ) {
      throw new Error('Invalid or incompatible LZY spatial geometry.');
    }
    world.spatial.geometryRevision = activeScene.geometryRevision;
    migrated = true;
    geometryMigrated = true;
  }
  if (
    geometryMigrated &&
    !positionIsWalkable(
      activeScene,
      world.spatial.player.positionQ,
    )
  ) {
    const safe = nearestSafeAnchor(
      activeScene,
      world.spatial.player.positionQ,
    );
    if (!safe) {
      throw new Error('No safe spatial migration anchor is available.');
    }
    world.spatial.player.positionQ = clone(safe[1]);
    world.spatial.player.currentIntent = idleIntent();
    world.spatial.player.routeId = null;
    world.spatial.player.occupancyAnchorId = null;
    world.spatial.player.currentPlaceId = activeScene.id;
    world.spatial.player.lastSafeAnchorId = safe[0];
  }
  return { migrated, geometryMigrated };
}

function keyForNode(node) {
  return `${node.x}:${node.y}`;
}

function nearestWalkableGridPoint(scene, position) {
  const axisCandidates = (value) => [
    Math.round(value / WORLD2D_GRID_Q) * WORLD2D_GRID_Q,
    Math.floor(value / WORLD2D_GRID_Q) * WORLD2D_GRID_Q,
    Math.ceil(value / WORLD2D_GRID_Q) * WORLD2D_GRID_Q,
  ];
  const candidates = new Map();
  for (const x of axisCandidates(position.x)) {
    for (const y of axisCandidates(position.y)) {
      const candidate = point(x, y);
      if (positionIsWalkable(scene, candidate)) {
        candidates.set(keyForNode(candidate), candidate);
      }
    }
  }
  return [...candidates.values()].sort(
    (left, right) =>
      Math.hypot(left.x - position.x, left.y - position.y) -
        Math.hypot(right.x - position.x, right.y - position.y) ||
      left.y - right.y ||
      left.x - right.x,
  )[0] ?? null;
}

function nodeOrder(left, right) {
  return (
    left.f - right.f ||
    left.h - right.h ||
    left.y - right.y ||
    left.x - right.x
  );
}

function reconstructPath(cameFrom, currentKey, nodes) {
  const result = [nodes.get(currentKey)];
  while (cameFrom.has(currentKey)) {
    currentKey = cameFrom.get(currentKey);
    result.push(nodes.get(currentKey));
  }
  return result.reverse();
}

export function findWorld2DPath(scene, from, to) {
  if (!scene || !safePoint(from) || !safePoint(to)) return null;
  const start = nearestWalkableGridPoint(scene, from);
  const goal = nearestWalkableGridPoint(scene, to);
  if (
    !start ||
    !goal
  ) {
    return null;
  }
  const startKey = keyForNode(start);
  const goalKey = keyForNode(goal);
  const open = [];
  const openKeys = new Set([startKey]);
  const closed = new Set();
  const cameFrom = new Map();
  const gScore = new Map([[startKey, 0]]);
  const nodes = new Map([[startKey, start], [goalKey, goal]]);
  const heuristic = (node) =>
    Math.abs(node.x - goal.x) + Math.abs(node.y - goal.y);
  open.push({ ...start, h: heuristic(start), f: heuristic(start) });
  let expansions = 0;

  while (open.length > 0 && expansions < MAX_PATH_EXPANSIONS) {
    open.sort(nodeOrder);
    const current = open.shift();
    const currentKey = keyForNode(current);
    openKeys.delete(currentKey);
    if (currentKey === goalKey) {
      const path = reconstructPath(cameFrom, currentKey, nodes);
      return samePoint(from, start) ? path.slice(1) : path;
    }
    closed.add(currentKey);
    expansions += 1;
    for (const [dx, dy] of [
      [0, -WORLD2D_GRID_Q],
      [-WORLD2D_GRID_Q, 0],
      [WORLD2D_GRID_Q, 0],
      [0, WORLD2D_GRID_Q],
    ]) {
      const neighbor = point(current.x + dx, current.y + dy);
      const neighborKey = keyForNode(neighbor);
      if (
        closed.has(neighborKey) ||
        !positionIsWalkable(scene, neighbor)
      ) {
        continue;
      }
      const tentative = (gScore.get(currentKey) ?? Infinity) + WORLD2D_GRID_Q;
      if (tentative >= (gScore.get(neighborKey) ?? Infinity)) continue;
      cameFrom.set(neighborKey, currentKey);
      gScore.set(neighborKey, tentative);
      nodes.set(neighborKey, neighbor);
      const h = heuristic(neighbor);
      if (!openKeys.has(neighborKey)) {
        open.push({ ...neighbor, h, f: tentative + h });
        openKeys.add(neighborKey);
      } else {
        const existing = open.find((entry) => keyForNode(entry) === neighborKey);
        if (existing) {
          existing.h = h;
          existing.f = tentative + h;
        }
      }
    }
  }
  return null;
}

function facingFromVector(dx, dy, fallback) {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'east' : 'west';
  if (dy !== 0) return dy > 0 ? 'south' : 'north';
  return fallback;
}

function quantizedStep(vectorQ) {
  const sx = Math.sign(Number(vectorQ?.x) || 0);
  const sy = Math.sign(Number(vectorQ?.y) || 0);
  if (sx === 0 && sy === 0) return point(0, 0);
  if (sx !== 0 && sy !== 0) {
    return point(sx * 181, sy * 181);
  }
  return point(sx * WORLD2D_MOTION_STEP_Q, sy * WORLD2D_MOTION_STEP_Q);
}

function moveWithCollision(scene, from, delta) {
  let position = point(from.x, from.y);
  const xCandidate = point(from.x + delta.x, from.y);
  if (positionIsWalkable(scene, xCandidate)) position = xCandidate;
  const yCandidate = point(position.x, position.y + delta.y);
  if (positionIsWalkable(scene, yCandidate)) position = yCandidate;
  return position;
}

function moveToward(scene, from, target) {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  if (dx === 0 && dy === 0) return { position: from, arrived: true };
  const distance = Math.hypot(dx, dy);
  const delta =
    distance <= WORLD2D_MOTION_STEP_Q
      ? point(dx, dy)
      : point(
          Math.round((dx / distance) * WORLD2D_MOTION_STEP_Q),
          Math.round((dy / distance) * WORLD2D_MOTION_STEP_Q),
        );
  const position = moveWithCollision(scene, from, delta);
  return {
    position,
    arrived: samePoint(position, target),
    blocked: samePoint(position, from),
  };
}

function rememberControl(spatial, commandId, controlSeq, receipt) {
  spatial.recentControlCommands.push({
    commandId,
    controlSeq,
    receipt: clone(receipt),
  });
  if (spatial.recentControlCommands.length > MAX_RECENT_CONTROL_COMMANDS) {
    spatial.recentControlCommands.splice(
      0,
      spatial.recentControlCommands.length - MAX_RECENT_CONTROL_COMMANDS,
    );
  }
}

export function priorSpatialControlReceipt(spatial, commandId) {
  return spatial?.recentControlCommands?.find(
    (entry) => entry.commandId === commandId,
  )?.receipt ?? null;
}

export function acceptWorld2DControl(
  world,
  command,
  { authorityCommitSeq, authorityVirtualMs },
) {
  const spatial = world?.spatial;
  const player = spatial?.player;
  const reject = (reason) => ({ status: 'rejected', reason });
  if (!spatial || !player) return reject('SPATIAL_NOT_READY');
  if (command.sceneId !== spatial.activeSceneId) return reject('STALE_SCENE');
  if (command.geometryRevision !== spatial.geometryRevision) {
    return reject('STALE_GEOMETRY');
  }
  const lastAcceptedControlCommitSeq = Number(
    spatial.recentControlCommands.at(-1)?.receipt?.commitSeq ?? 0,
  );
  if (
    !Number.isSafeInteger(command.baseCommitSeq) ||
    !Number.isSafeInteger(lastAcceptedControlCommitSeq) ||
    command.baseCommitSeq < lastAcceptedControlCommitSeq ||
    command.baseCommitSeq > authorityCommitSeq
  ) {
    return reject('STALE_SPATIAL_AUTHORITY');
  }
  if (
    !Number.isSafeInteger(command.controlSeq) ||
    command.controlSeq !== player.controlSeq + 1
  ) {
    return reject('STALE_CONTROL');
  }
  const control = command.control;
  if (!control || typeof control !== 'object' || Array.isArray(control)) {
    return reject('INVALID_PLAYER_CONTROL');
  }
  const scene = world2dScene(spatial.activeSceneId);
  if (!scene) return reject('UNKNOWN_SCENE');
  let interactionReceipt = {};

  if (control.kind === 'set_move_intent') {
    if (
      !safePoint(control.vectorQ) ||
      (control.vectorQ.x === 0 && control.vectorQ.y === 0) ||
      Math.abs(control.vectorQ.x) > 1024 ||
      Math.abs(control.vectorQ.y) > 1024
    ) {
      return reject('INVALID_MOVE_VECTOR');
    }
    player.currentIntent = {
      kind: 'vector',
      vectorQ: clone(control.vectorQ),
    };
    player.routeId = null;
    player.occupancyAnchorId = null;
    player.currentPlaceId = spatial.activeSceneId;
  } else if (control.kind === 'move_to') {
    const target = world2dAnchor(spatial.activeSceneId, control.targetAnchorId);
    if (!target) return reject('UNKNOWN_TARGET_ANCHOR');
    const waypoints = findWorld2DPath(scene, player.positionQ, target);
    if (!waypoints) return reject('ROUTE_BLOCKED');
    const routeId = `spatial_route_${spatial.nextSpatialEventSeq++}`;
    player.currentIntent = {
      kind: 'route',
      targetAnchorId: control.targetAnchorId,
      waypoints,
      waypointIndex: 0,
    };
    player.routeId = routeId;
    player.occupancyAnchorId = null;
    player.currentPlaceId = spatial.activeSceneId;
  } else if (control.kind === 'activate_interactable') {
    const entry = scene.interactables.find(
      (candidate) => candidate.entityId === control.entityId,
    );
    if (!entry) return reject('UNKNOWN_INTERACTABLE');
    const anchor = world2dAnchor(scene.id, entry.standAnchorId);
    if (!anchor) return reject('UNKNOWN_TARGET_ANCHOR');
    const distanceQ = Math.round(
      Math.hypot(
        anchor.x - player.positionQ.x,
        anchor.y - player.positionQ.y,
      ),
    );
    if (distanceQ > entry.maxDistanceQ) {
      return reject('INTERACTION_TOO_FAR');
    }
    player.currentIntent = idleIntent();
    player.routeId = null;
    if (entry.interactionKind === 'scene_transition') {
      const portal = world2dPortal(entry.portalId);
      if (
        !portal ||
        portal.from.sceneId !== scene.id ||
        !spatial.unlockedPortals.includes(portal.portalId)
      ) {
        return reject('PORTAL_NOT_AVAILABLE');
      }
      const destinationScene = world2dScene(portal.to.sceneId);
      const destination = world2dAnchor(
        portal.to.sceneId,
        portal.to.anchorId,
      );
      if (
        !destinationScene ||
        !destination ||
        !positionIsWalkable(destinationScene, destination)
      ) {
        return reject('PORTAL_DESTINATION_INVALID');
      }
      const fromSceneId = scene.id;
      spatial.activeSceneId = destinationScene.id;
      spatial.geometryRevision = destinationScene.geometryRevision;
      player.sceneId = destinationScene.id;
      player.positionQ = clone(destination);
      player.occupancyAnchorId = null;
      player.currentPlaceId =
        destinationScene.id === WORLD2D_SCENE_ID
          ? 'jiangwan_home'
          : destinationScene.id;
      player.lastSafeAnchorId = portal.to.anchorId;
      interactionReceipt = {
        interactionKind: 'scene_transition',
        portalId: portal.portalId,
        fromSceneId,
        toSceneId: destinationScene.id,
      };
    } else if (entry.interactionKind === 'place_visit') {
      player.occupancyAnchorId = entry.standAnchorId;
      player.currentPlaceId = entry.placeId;
      player.lastSafeAnchorId = entry.standAnchorId;
      interactionReceipt = {
        interactionKind: 'place_visit',
        entityId: entry.entityId,
        placeId: entry.placeId,
      };
    } else {
      return reject('INTERACTION_NOT_SETTLEABLE');
    }
  } else if (control.kind === 'stop' || control.kind === 'cancel_route') {
    player.currentIntent = idleIntent();
    player.routeId = null;
  } else {
    return reject('INVALID_PLAYER_CONTROL');
  }

  player.controlSeq = command.controlSeq;
  player.authorityCommitSeq = authorityCommitSeq + 1;
  player.authorityVirtualMs = authorityVirtualMs;
  spatial.projectionSeq += 1;
  const receipt = {
    status: 'accepted',
    type: 'player_control',
    reason: null,
    commandId: command.commandId,
    commitSeq: authorityCommitSeq + 1,
    controlSeq: command.controlSeq,
    sceneId: spatial.activeSceneId,
    geometryRevision: spatial.geometryRevision,
    positionQ: clone(player.positionQ),
    intentKind: player.currentIntent.kind,
    ...interactionReceipt,
  };
  rememberControl(spatial, command.commandId, command.controlSeq, receipt);
  return {
    ...receipt,
    shouldSchedule: player.currentIntent.kind !== 'idle',
  };
}

export function stepWorld2DMotion(
  world,
  { authorityCommitSeq, authorityVirtualMs, eventSequence },
) {
  const spatial = world.spatial;
  const player = spatial.player;
  const scene = world2dScene(spatial.activeSceneId);
  const intent = player.currentIntent;
  const before = clone(player.positionQ);
  let next = before;
  let arrived = false;
  let blocked = false;

  if (intent.kind === 'vector') {
    const delta = quantizedStep(intent.vectorQ);
    next = moveWithCollision(scene, before, delta);
    blocked = samePoint(next, before);
    player.facing = facingFromVector(delta.x, delta.y, player.facing);
  } else if (intent.kind === 'route') {
    const waypoint = intent.waypoints[intent.waypointIndex];
    if (!waypoint) {
      arrived = true;
    } else {
      const movement = moveToward(scene, before, waypoint);
      next = movement.position;
      blocked = movement.blocked;
      player.facing = facingFromVector(
        next.x - before.x,
        next.y - before.y,
        player.facing,
      );
      if (movement.arrived) {
        intent.waypointIndex += 1;
        if (intent.waypointIndex >= intent.waypoints.length) arrived = true;
      }
    }
  } else {
    return {
      changed: false,
      shouldSchedule: false,
      status: 'stopped',
      positionQ: clone(player.positionQ),
    };
  }

  if (!samePoint(next, before)) {
    player.positionQ = next;
    player.authorityCommitSeq = authorityCommitSeq + 1;
    player.authorityVirtualMs = authorityVirtualMs;
    player.lastMotionEventSeq = eventSequence;
    spatial.projectionSeq += 1;
  }
  if (arrived || (blocked && intent.kind === 'route')) {
    player.currentIntent = idleIntent();
    player.routeId = null;
  }
  return {
    changed: !samePoint(next, before),
    shouldSchedule:
      player.currentIntent.kind !== 'idle',
    status: arrived ? 'arrived' : blocked ? 'blocked' : 'moving',
    positionQ: clone(player.positionQ),
    authorityCommitSeq: player.authorityCommitSeq,
  };
}

export function world2dMotionEventDescriptor(world, scheduledMs) {
  return {
    type: 'player_motion_step',
    scheduledMs,
    actorId: 'player',
    payload: {
      sceneId: world.spatial.activeSceneId,
      geometryRevision: world.spatial.geometryRevision,
      controlSeq: world.spatial.player.controlSeq,
    },
  };
}

export function auditWorldSpatialState(world) {
  const errors = [];
  const spatial = world?.spatial;
  const scene = world2dScene(spatial?.activeSceneId);
  const player = spatial?.player;
  if (spatial?.schemaVersion !== WORLD2D_SCHEMA_VERSION) {
    return { ok: false, errors: ['INVALID_SPATIAL_SCHEMA'] };
  }
  if (
    !scene ||
    spatial.geometryRevision !== scene.geometryRevision ||
    player?.sceneId !== spatial.activeSceneId
  ) {
    errors.push('INVALID_SPATIAL_SCENE');
  }
  if (!safePoint(player?.positionQ) || !positionIsWalkable(scene, player.positionQ)) {
    errors.push('INVALID_PLAYER_SPATIAL_POSITION');
  }
  if (
    !['north', 'east', 'south', 'west'].includes(player?.facing) ||
    player?.locomotionMode !== 'on_foot' ||
    !Number.isSafeInteger(player?.controlSeq) ||
    player.controlSeq < 0 ||
    !Number.isSafeInteger(player?.lastMotionEventSeq) ||
    !Number.isSafeInteger(player?.authorityCommitSeq) ||
    !Number.isSafeInteger(player?.authorityVirtualMs)
  ) {
    errors.push('INVALID_PLAYER_SPATIAL_STATE');
  }
  if (
    typeof player?.currentPlaceId !== 'string' ||
    player.currentPlaceId.length === 0 ||
    (
      player?.occupancyAnchorId !== null &&
      !world2dAnchor(
        spatial.activeSceneId,
        player.occupancyAnchorId,
      )
    )
  ) {
    errors.push('INVALID_PLAYER_SPATIAL_PLACE');
  }
  if (
    !player?.currentIntent ||
    !['idle', 'vector', 'route'].includes(player.currentIntent.kind)
  ) {
    errors.push('INVALID_PLAYER_SPATIAL_INTENT');
  }
  const sceneState = spatial.sceneStates?.[spatial.activeSceneId];
  if (
    !sceneState ||
    sceneState.geometryRevision !== scene.geometryRevision ||
    JSON.stringify(sceneState.interactableIds) !==
      JSON.stringify(scene.interactables.map((entry) => entry.entityId))
  ) {
    errors.push('INVALID_SPATIAL_SCENE_STATE');
  }
  if (
    !Array.isArray(spatial.recentControlCommands) ||
    spatial.recentControlCommands.length > MAX_RECENT_CONTROL_COMMANDS ||
    !Number.isSafeInteger(spatial.projectionSeq) ||
    spatial.projectionSeq < 0
  ) {
    errors.push('INVALID_SPATIAL_HOT_STATE');
  }
  return { ok: errors.length === 0, errors };
}

export const WORLD2D_AUTHORITY_CONSTANTS = Object.freeze({
  motionStepMs: WORLD2D_MOTION_STEP_MS,
  motionStepQ: WORLD2D_MOTION_STEP_Q,
  playerRadiusQ: WORLD2D_PLAYER_RADIUS_Q,
});

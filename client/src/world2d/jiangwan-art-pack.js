export const JIANGWAN_ART_PACK_SCHEMA = 'lzy-world2d-art-pack-v1';

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const layers = [
  ['ground', 0, 'opaque'],
  ['road_marking', 10, 'alpha'],
  ['building_back', 20, 'opaque'],
  ['interior', 30, 'opaque'],
  ['contact_shadow', 40, 'multiply'],
  ['dynamic_character', 50, 'alpha'],
  ['dynamic_vehicle', 55, 'alpha'],
  ['vegetation', 60, 'alpha'],
  ['foreground_occluder', 70, 'alpha'],
  ['lighting', 80, 'additive_limited'],
  ['weather', 90, 'alpha'],
  ['interaction', 100, 'alpha'],
].map(([layerId, depthBand, blendMode]) => ({
  layerId,
  depthBand,
  blendMode,
}));

const material = (materialId, paletteToken, blendMode = 'opaque') => ({
  materialId,
  paletteToken,
  blendMode,
  lightDirection: 'north_west_down_35deg',
  authoredWearFollowsUseZones: true,
});

const anchor = (anchorId, kind, x, y, elevationQ = 0) => ({
  anchorId,
  kind,
  positionQ: { x, y, elevationQ },
});

const asset = ({
  assetId,
  category,
  sourcePath,
  materialId,
  layerId,
  widthQ,
  depthQ,
  heightQ,
  pivotQ,
  interactionAnchors = [],
  contactShadowRequired = false,
  stateVariants = ['default'],
}) => ({
  assetId,
  category,
  sourcePath,
  materialId,
  layerId,
  footprintQ: { widthQ, depthQ },
  heightQ,
  pivotQ,
  interactionAnchors,
  contactShadow: {
    required: contactShadowRequired,
    receiver: 'ground_plane',
    shape: contactShadowRequired ? 'contact_ellipse' : 'none',
  },
  stateVariants,
});

const assets = [
  asset({
    assetId: 'fixture-jiangwan-road-001',
    category: 'road',
    sourcePath: 'assets/world2d/jiangwan/road-kit-v1.svg',
    materialId: 'mat_jiangwan_asphalt_v1',
    layerId: 'ground',
    widthQ: 4_096,
    depthQ: 1_024,
    heightQ: 32,
    pivotQ: { x: 0, y: 512, elevationQ: 0 },
    stateVariants: ['dry', 'wet'],
  }),
  asset({
    assetId: 'building-jiangwan-mixeduse-001',
    category: 'building',
    sourcePath: 'assets/world2d/jiangwan/building-kit-v1.svg',
    materialId: 'mat_jiangwan_facade_v1',
    layerId: 'building_back',
    widthQ: 4_096,
    depthQ: 2_048,
    heightQ: 5_120,
    pivotQ: { x: 2_048, y: 2_048, elevationQ: 0 },
    interactionAnchors: [anchor('building-door', 'door', 2_048, 2_048)],
    stateVariants: ['unknown', 'open', 'closed', 'under_work'],
  }),
  asset({
    assetId: 'fixture-jiangwan-interior-001',
    category: 'interior',
    sourcePath: 'assets/world2d/jiangwan/interior-kit-v1.svg',
    materialId: 'mat_jiangwan_interior_v1',
    layerId: 'interior',
    widthQ: 3_072,
    depthQ: 2_048,
    heightQ: 2_304,
    pivotQ: { x: 1_536, y: 1_792, elevationQ: 0 },
    interactionAnchors: [anchor('interior-seat', 'seat', 2_048, 1_536)],
    stateVariants: ['unoccupied', 'occupied_authority_required'],
  }),
  asset({
    assetId: 'character-jiangwan-resident-001',
    category: 'character',
    sourcePath: 'assets/world2d/jiangwan/character-resident-v1.svg',
    materialId: 'mat_jiangwan_character_v1',
    layerId: 'dynamic_character',
    widthQ: 640,
    depthQ: 384,
    heightQ: 1_792,
    pivotQ: { x: 320, y: 1_792, elevationQ: 0 },
    interactionAnchors: [
      anchor('character-feet', 'feet', 320, 1_792),
      anchor('character-left-hand', 'left_hand', 148, 930, 920),
      anchor('character-right-hand', 'right_hand', 492, 930, 920),
    ],
    contactShadowRequired: true,
    stateVariants: [
      'idle',
      'walk_start',
      'walk_loop',
      'walk_stop',
      'turn_90',
      'turn_180',
      'interact_reach',
      'interact_carry',
    ],
  }),
  asset({
    assetId: 'vehicle-jiangwan-citybus-001',
    category: 'vehicle',
    sourcePath: 'assets/world2d/jiangwan/vehicle-city-bus-v1.svg',
    materialId: 'mat_jiangwan_vehicle_v1',
    layerId: 'dynamic_vehicle',
    widthQ: 3_584,
    depthQ: 1_536,
    heightQ: 2_560,
    pivotQ: { x: 1_792, y: 1_280, elevationQ: 0 },
    interactionAnchors: [
      anchor('vehicle-seat', 'seat', 2_560, 768, 512),
      anchor('vehicle-cargo', 'cargo', 512, 768, 384),
      anchor('vehicle-front-wheel', 'wheel', 2_688, 1_280, 320),
    ],
    contactShadowRequired: true,
    stateVariants: ['parked', 'moving', 'doors_open', 'out_of_service'],
  }),
  asset({
    assetId: 'prop-jiangwan-rain-tree-001',
    category: 'vegetation',
    sourcePath: 'assets/world2d/jiangwan/vegetation-rain-tree-v1.svg',
    materialId: 'mat_jiangwan_vegetation_v1',
    layerId: 'vegetation',
    widthQ: 2_048,
    depthQ: 1_280,
    heightQ: 4_096,
    pivotQ: { x: 1_024, y: 1_152, elevationQ: 0 },
    contactShadowRequired: true,
    stateVariants: ['calm', 'wind_low', 'wind_high'],
  }),
  asset({
    assetId: 'effect-jiangwan-lighting-001',
    category: 'lighting',
    sourcePath: 'assets/world2d/jiangwan/lighting-kit-v1.svg',
    materialId: 'mat_jiangwan_lighting_v1',
    layerId: 'lighting',
    widthQ: 2_048,
    depthQ: 2_048,
    heightQ: 3_072,
    pivotQ: { x: 1_024, y: 1_024, elevationQ: 0 },
    stateVariants: ['dawn', 'day', 'dusk', 'night'],
  }),
  asset({
    assetId: 'effect-jiangwan-weather-001',
    category: 'weather',
    sourcePath: 'assets/world2d/jiangwan/weather-kit-v1.svg',
    materialId: 'mat_jiangwan_weather_v1',
    layerId: 'weather',
    widthQ: 4_096,
    depthQ: 4_096,
    heightQ: 4_096,
    pivotQ: { x: 2_048, y: 2_048, elevationQ: 0 },
    stateVariants: ['clear', 'overcast', 'rain', 'light_rain'],
  }),
];

const sceneInstance = (
  instanceId,
  assetId,
  category,
  x,
  y,
  {
    elevationQ = 0,
    scaleMilli = 1_000,
    placeId = null,
    stateSource = 'static_content',
  } = {},
) => ({
  instanceId,
  assetId,
  category,
  positionQ: { x, y, elevationQ },
  scaleMilli,
  placeId,
  stateSource,
});

export const JIANGWAN_ART_PACK_V1 = deepFreeze({
  schema: JIANGWAN_ART_PACK_SCHEMA,
  packId: 'jiangwan-outdoor-art-pack-v1',
  sceneId: 'jiangwan_outdoor',
  geometryRevision: 'jiangwan-outdoor-v2',
  provenanceManifestPath:
    'assets/world2d/jiangwan/art-pack-manifest-v1.json',
  authorityContract: {
    authorityWriter: 'worker_controller',
    sourceOfFacts: 'worker_controller_projection',
    progressionBoundary: 'processNextEvent',
    saveBarrierCommitSeqRequired: true,
    authorityMutationAllowed: false,
    elapsedHistoryReadsPerFrame: 0,
    productionStatus: 'player_reachable_technical_slice_unbenchmarked',
  },
  visualGrammar: {
    artBibleSchema: 'lzy-chinese-city-art-bible-v1',
    projection: 'oblique_2_to_1',
    worldUnitsPerMeter: 1_024,
    projectionBasisQ: {
      screenX: { worldX: 1, worldY: -1, elevation: 0 },
      screenY: { worldX: 0.5, worldY: 0.5, elevation: -1 },
    },
    camera: {
      fixedYawDegrees: 45,
      fixedPitchDegrees: 35,
      rotationAllowed: false,
      zoomMilli: { minimum: 750, default: 1_000, maximum: 1_500 },
    },
    silhouette: {
      characterOutlineQ: 24,
      interactableOutlineQ: 32,
      colorOnlyMeaningForbidden: true,
    },
    palette: {
      road: ['#3F4645', '#A8A49A', '#D4B56A'],
      building: ['#765E4E', '#E7E0D2', '#596866'],
      interior: ['#C5B89C', '#76593E', '#3F725F'],
      character: ['#26312F', '#F0E9DA', '#D47A57'],
      vehicle: ['#3F725F', '#E7E0D2', '#D4B56A'],
      vegetation: ['#41694C', '#6F8066', '#6C543F'],
      lighting: ['#F0D38B', '#D47A57', '#8CB6C2'],
      weather: ['#6F858A', '#385F68', '#254B54'],
    },
    texel: {
      basePixelsPerMeter: 128,
      sourceScaleVariants: [1, 2],
      atlasPaddingPx: 4,
      atlasExtrudePx: 2,
    },
    naming: {
      assetPattern:
        '^(character|vehicle|prop|building|fixture|effect)-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9]{3}$',
      materialPattern: '^mat_[a-z0-9_]+_v[0-9]+$',
    },
  },
  layers,
  materials: [
    material('mat_jiangwan_asphalt_v1', 'road'),
    material('mat_jiangwan_facade_v1', 'building'),
    material('mat_jiangwan_interior_v1', 'interior'),
    material('mat_jiangwan_character_v1', 'character', 'alpha'),
    material('mat_jiangwan_vehicle_v1', 'vehicle', 'alpha'),
    material('mat_jiangwan_vegetation_v1', 'vegetation', 'alpha'),
    material('mat_jiangwan_lighting_v1', 'lighting', 'additive_limited'),
    material('mat_jiangwan_weather_v1', 'weather', 'alpha'),
  ],
  assets,
  atlasUvs: assets.map((entry, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    return {
      assetId: entry.assetId,
      pageId: 'jiangwan-vector-atlas-001',
      u0: column * 0.25,
      v0: row * 0.5,
      u1: (column + 1) * 0.25,
      v1: (row + 1) * 0.5,
    };
  }),
  characterRig: {
    rigId: 'jiangwan-resident-rig-v1',
    bones: [
      { boneId: 'root', parentId: null, bindQ: { x: 0, y: 0 } },
      { boneId: 'pelvis', parentId: 'root', bindQ: { x: 0, y: -640 } },
      { boneId: 'torso', parentId: 'pelvis', bindQ: { x: 0, y: -448 } },
      { boneId: 'head', parentId: 'torso', bindQ: { x: 0, y: -448 } },
      { boneId: 'left_hand', parentId: 'torso', bindQ: { x: -256, y: -192 } },
      { boneId: 'right_hand', parentId: 'torso', bindQ: { x: 256, y: -192 } },
      { boneId: 'left_foot', parentId: 'pelvis', bindQ: { x: -128, y: 640 } },
      { boneId: 'right_foot', parentId: 'pelvis', bindQ: { x: 128, y: 640 } },
    ],
  },
  motion: {
    clips: [
      ['idle', 1_000, 8],
      ['walk_start', 240, 4],
      ['walk_loop', 640, 8],
      ['walk_stop', 240, 4],
      ['turn_90', 280, 5],
      ['turn_180', 420, 7],
      ['interact_reach', 520, 7],
      ['interact_carry', 680, 8],
    ].map(([clipId, durationMs, keyframes]) => ({
      clipId,
      durationMs,
      keyframes,
      rootDiscontinuityQ: 0,
      contactBreakFrames: 0,
      authorityNeutral: true,
    })),
    requiredTransitions: [
      'idle->walk_start',
      'walk_start->walk_loop',
      'walk_loop->walk_stop',
      'walk_stop->idle',
      'idle->turn_90',
      'idle->turn_180',
      'idle->interact_reach',
      'idle->interact_carry',
    ],
    feetContactPolicy: 'one_or_both_feet_grounded_every_frame',
    locomotionDistanceSource: 'authority_pose_delta_only',
    wallClockMayChangeAuthorityPose: false,
  },
  sceneInstances: [
    sceneInstance('road-jiangwan-lane', 'fixture-jiangwan-road-001', 'road', 16_384, 18_432, {
      scaleMilli: 7_500,
    }),
    sceneInstance('road-riverside', 'fixture-jiangwan-road-001', 'road', 13_312, 9_216, {
      scaleMilli: 6_000,
    }),
    sceneInstance('building-home-shell', 'building-jiangwan-mixeduse-001', 'building', 5_120, 23_552, {
      scaleMilli: 2_000,
      placeId: 'jiangwan_home_gate',
      stateSource: 'city_place_projection',
    }),
    sceneInstance('building-breakfast-shell', 'building-jiangwan-mixeduse-001', 'building', 13_824, 22_528, {
      scaleMilli: 1_250,
      placeId: 'morning_tide_breakfast',
      stateSource: 'city_place_projection',
    }),
    sceneInstance('building-daily-shell', 'building-jiangwan-mixeduse-001', 'building', 19_968, 22_528, {
      scaleMilli: 1_250,
      placeId: 'harbor_daily_store',
      stateSource: 'city_place_projection',
    }),
    sceneInstance('interior-breakfast-window', 'fixture-jiangwan-interior-001', 'interior', 13_824, 20_480, {
      placeId: 'morning_tide_breakfast',
      stateSource: 'city_place_projection',
    }),
    sceneInstance('tree-riverside-west', 'prop-jiangwan-rain-tree-001', 'vegetation', 7_168, 6_144),
    sceneInstance('tree-riverside-east', 'prop-jiangwan-rain-tree-001', 'vegetation', 22_528, 6_144),
    sceneInstance('light-breakfast-door', 'effect-jiangwan-lighting-001', 'lighting', 13_824, 17_408, {
      stateSource: 'environment_projection',
    }),
    sceneInstance('light-bus-stop', 'effect-jiangwan-lighting-001', 'lighting', 28_672, 15_360, {
      stateSource: 'environment_projection',
    }),
  ],
  occluders: [
    {
      occluderId: 'home-eave',
      sourceInstanceId: 'building-home-shell',
      polygonQ: [
        { x: 1_024, y: 21_504 },
        { x: 9_216, y: 21_504 },
        { x: 9_216, y: 23_552 },
        { x: 1_024, y: 23_552 },
      ],
      presentationOnly: true,
      policy: 'fade_or_clip_without_collision_change',
    },
    {
      occluderId: 'breakfast-awning',
      sourceInstanceId: 'building-breakfast-shell',
      polygonQ: [
        { x: 11_264, y: 17_408 },
        { x: 16_384, y: 17_408 },
        { x: 16_384, y: 19_200 },
        { x: 11_264, y: 19_200 },
      ],
      presentationOnly: true,
      policy: 'fade_or_clip_without_collision_change',
    },
    {
      occluderId: 'riverside-tree-canopy',
      sourceInstanceId: 'tree-riverside-west',
      polygonQ: [
        { x: 5_888, y: 4_736 },
        { x: 8_448, y: 4_736 },
        { x: 8_448, y: 6_720 },
        { x: 5_888, y: 6_720 },
      ],
      presentationOnly: true,
      policy: 'fade_or_clip_without_collision_change',
    },
  ],
  environmentBindings: {
    dayPhasePaths: ['scene.environmentState.dayPhase', 'scene.environmentState.light'],
    weatherPaths: ['scene.environmentState.weather'],
    lightAliases: {
      morning: 'dawn',
      dawn: 'dawn',
      day: 'day',
      dusk: 'dusk',
      evening: 'dusk',
      night: 'night',
    },
    weatherAliases: {
      clear: 'clear',
      overcast: 'overcast',
      rain: 'rain',
      light_rain: 'light_rain',
    },
  },
  runtimeBudget: {
    maximumVisibleEntities: 96,
    maximumDrawCommandsPerFrame: 160,
    maximumOcclusionMasks: 64,
    maximumAtlasPages: 2,
    maximumDynamicLights: 12,
    maximumWeatherLayers: 2,
    crowdedSceneContract: {
      minimumActors: 32,
      minimumVehicles: 12,
      requiredWeather: 'rain',
      requiredDayPhase: 'night',
      minimumFrameSamples: 600,
      frameTimeP95MaximumMs: 16.7,
      frameTimeP99MaximumMs: 25,
      frameTimeMaximumMs: 50,
    },
  },
  releaseClaim: {
    status: 'UNVERIFIED',
    finalArt: false,
    comparativeSuperiority: false,
    staticScreenshotSufficient: false,
    requiresExternalEvidence: [
      'blindRealtimeTest',
      'professionalArtSignoff',
    ],
  },
});

function text(value) {
  return typeof value === 'string' && value.length > 0;
}

function validHash(value) {
  return /^[a-f0-9]{64}$/.test(value ?? '');
}

function overlaps(left, right) {
  return (
    left.u0 < right.u1 &&
    right.u0 < left.u1 &&
    left.v0 < right.v1 &&
    right.v0 < left.v1
  );
}

function generatedRevisionFailures(entry) {
  if (entry?.sourceKind !== 'generated_assisted') return [];
  const failures = [];
  const requirements = {
    retopology: 'GENERATED_ASSET_MISSING_HUMAN_RETOPOLOGY',
    uvRemediation: 'GENERATED_ASSET_MISSING_HUMAN_UV_REMEDIATION',
    materialAuthoring: 'GENERATED_ASSET_MISSING_HUMAN_MATERIAL_AUTHORING',
    motionCorrection: 'GENERATED_ASSET_MISSING_HUMAN_MOTION_CORRECTION',
  };
  for (const [key, failure] of Object.entries(requirements)) {
    const evidence = entry?.humanRevisionEvidence?.[key];
    if (
      evidence?.status !== 'completed' ||
      !text(evidence.reviewerId) ||
      !text(evidence.evidenceRef)
    ) {
      failures.push(failure);
    }
  }
  return failures;
}

function packStructureFailures(pack) {
  const failures = [];
  if (pack?.schema !== JIANGWAN_ART_PACK_SCHEMA) {
    failures.push('INVALID_JIANGWAN_ART_PACK_SCHEMA');
  }
  if (
    pack?.sceneId !== 'jiangwan_outdoor' ||
    pack?.geometryRevision !== 'jiangwan-outdoor-v2'
  ) {
    failures.push('ART_PACK_SCENE_IDENTITY_MISMATCH');
  }
  if (
    pack?.authorityContract?.authorityMutationAllowed !== false ||
    pack?.authorityContract?.productionStatus !==
      'player_reachable_technical_slice_unbenchmarked'
  ) {
    failures.push('ART_PACK_AUTHORITY_OR_INTEGRATION_CLAIM_INVALID');
  }
  const requiredCategories = [
    'road',
    'building',
    'interior',
    'character',
    'vehicle',
    'vegetation',
    'lighting',
    'weather',
  ];
  const categories = new Set(pack?.assets?.map((entry) => entry.category));
  if (requiredCategories.some((category) => !categories.has(category))) {
    failures.push('ART_PACK_SEMANTIC_CATEGORY_MISSING');
  }
  const assetIds = new Set(pack?.assets?.map((entry) => entry.assetId));
  if (assetIds.size !== pack?.assets?.length) {
    failures.push('ART_PACK_DUPLICATE_ASSET_ID');
  }
  const materialIds = new Set(
    pack?.materials?.map((entry) => entry.materialId),
  );
  if (pack?.assets?.some((entry) => !materialIds.has(entry.materialId))) {
    failures.push('ART_PACK_MATERIAL_REFERENCE_MISSING');
  }
  if (
    pack?.materials?.some(
      (entry) => !pack.visualGrammar?.palette?.[entry.paletteToken],
    )
  ) {
    failures.push('ART_PACK_PALETTE_TOKEN_MISSING');
  }
  const uvs = pack?.atlasUvs ?? [];
  if (
    uvs.some(
      (entry) =>
        ![entry.u0, entry.v0, entry.u1, entry.v1].every(
          (value) => Number.isFinite(value) && value >= 0 && value <= 1,
        ) ||
        entry.u0 >= entry.u1 ||
        entry.v0 >= entry.v1,
    )
  ) {
    failures.push('ART_PACK_UV_OUT_OF_BOUNDS');
  }
  for (let left = 0; left < uvs.length; left += 1) {
    for (let right = left + 1; right < uvs.length; right += 1) {
      if (uvs[left].pageId === uvs[right].pageId && overlaps(uvs[left], uvs[right])) {
        failures.push('ART_PACK_UV_OVERLAP');
      }
    }
  }
  const bones = pack?.characterRig?.bones ?? [];
  if (bones.filter((entry) => entry.parentId === null).length !== 1) {
    failures.push('ART_PACK_RIG_ROOT_INVALID');
  }
  const boneIds = new Set(bones.map((entry) => entry.boneId));
  if (
    bones.some(
      (entry) => entry.parentId !== null && !boneIds.has(entry.parentId),
    )
  ) {
    failures.push('ART_PACK_RIG_PARENT_MISSING');
  }
  const requiredClips = [
    'idle',
    'walk_start',
    'walk_loop',
    'walk_stop',
    'turn_90',
    'turn_180',
    'interact_reach',
    'interact_carry',
  ];
  const clips = new Map(pack?.motion?.clips?.map((entry) => [entry.clipId, entry]));
  if (requiredClips.some((clipId) => !clips.has(clipId))) {
    failures.push('ART_PACK_REQUIRED_MOTION_CLIP_MISSING');
  }
  if (
    [...clips.values()].some(
      (entry) => entry.rootDiscontinuityQ !== 0 || entry.contactBreakFrames !== 0,
    )
  ) {
    failures.push('ART_PACK_MOTION_CONTINUITY_INVALID');
  }
  if (
    !Array.isArray(pack?.occluders) ||
    pack.occluders.some(
      (entry) =>
        entry.presentationOnly !== true ||
        !Array.isArray(entry.polygonQ) ||
        entry.polygonQ.length < 3,
    )
  ) {
    failures.push('ART_PACK_OCCLUSION_METADATA_INVALID');
  }
  if (
    pack?.assets?.some(
      (entry) =>
        ['character', 'vehicle', 'vegetation'].includes(entry.category) &&
        entry.contactShadow?.required !== true,
    )
  ) {
    failures.push('ART_PACK_CONTACT_SHADOW_CONTRACT_MISSING');
  }
  return failures;
}

function manifestFailures(manifest, sourceHashes) {
  const failures = [];
  if (manifest?.schema !== 'lzy-world2d-art-provenance-manifest-v1') {
    failures.push('INVALID_ART_PROVENANCE_MANIFEST_SCHEMA');
  }
  if (
    manifest?.packId !== JIANGWAN_ART_PACK_V1.packId ||
    manifest?.sceneId !== JIANGWAN_ART_PACK_V1.sceneId ||
    manifest?.geometryRevision !== JIANGWAN_ART_PACK_V1.geometryRevision
  ) {
    failures.push('ART_PROVENANCE_PACK_IDENTITY_MISMATCH');
  }
  if (
    !Array.isArray(manifest?.assets) ||
    manifest.assets.length !== JIANGWAN_ART_PACK_V1.assets.length
  ) {
    failures.push('ART_PROVENANCE_ASSET_SET_MISMATCH');
    return failures;
  }
  const manifestIds = new Set(manifest.assets.map((entry) => entry.assetId));
  for (const packAsset of JIANGWAN_ART_PACK_V1.assets) {
    if (!manifestIds.has(packAsset.assetId)) {
      failures.push('ART_PROVENANCE_ASSET_SET_MISMATCH');
      break;
    }
  }
  for (const entry of manifest.assets) {
    if (
      !text(entry.assetId) ||
      !text(entry.sourcePath) ||
      !validHash(entry.contentHashSha256) ||
      !text(entry.creatorOrLicensor) ||
      !text(entry.licenseRef) ||
      !text(entry.generatedToolDisclosure)
    ) {
      failures.push('ART_PROVENANCE_RECORD_INVALID');
    }
    if (sourceHashes?.[entry.assetId] !== entry.contentHashSha256) {
      failures.push('ART_SOURCE_HASH_MISMATCH');
    }
    failures.push(...generatedRevisionFailures(entry));
  }
  return failures;
}

function externalEvidenceVerified(entry, manifest, role = null) {
  return Boolean(
    entry?.status === 'verified' &&
      text(entry.evidenceId) &&
      entry.releaseCandidateId === manifest?.releaseCandidateId &&
      validHash(entry.evidenceHashSha256) &&
      (role === null || entry.reviewerRole === role),
  );
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function finiteNonnegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function automatedEvidenceAudit(evidence, manifest, pack) {
  if (evidence === null || evidence === undefined) {
    return {
      status: 'UNVERIFIED',
      failures: ['ART_PACK_AUTOMATED_EVIDENCE_UNVERIFIED'],
    };
  }
  const failures = [];
  if (
    evidence.schema !== 'lzy-world2d-art-pack-automated-evidence-v1' ||
    !text(evidence.evidenceId) ||
    !validHash(evidence.evidenceHashSha256) ||
    evidence.releaseCandidateId !== manifest?.releaseCandidateId
  ) {
    failures.push('ART_PACK_AUTOMATED_EVIDENCE_IDENTITY_MISMATCH');
  }

  const style = evidence.artBibleConsistency;
  const styleMeasurements = [
    style?.scaleViolationCount,
    style?.paletteViolationCount,
    style?.materialViolationCount,
    style?.namingViolationCount,
  ];
  if (!styleMeasurements.every(nonnegativeInteger)) {
    failures.push('ART_PACK_STYLE_MEASUREMENTS_INVALID');
  } else if (styleMeasurements.some((value) => value !== 0)) {
    failures.push('ART_PACK_STYLE_CONSISTENCY_VIOLATION');
  }

  const scene = evidence.scene;
  const sceneMeasurements = [
    scene?.penetrationCount,
    scene?.depthSortMismatchCount,
    scene?.contactShadowMissingCount,
    scene?.interactionAnchorMismatchCount,
  ];
  if (!sceneMeasurements.every(nonnegativeInteger)) {
    failures.push('ART_PACK_SCENE_MEASUREMENTS_INVALID');
  } else {
    if (scene.penetrationCount !== 0) {
      failures.push('ART_PACK_SCENE_PENETRATION');
    }
    if (scene.depthSortMismatchCount !== 0) {
      failures.push('ART_PACK_DEPTH_SORT_MISMATCH');
    }
    if (scene.contactShadowMissingCount !== 0) {
      failures.push('ART_PACK_CONTACT_SHADOW_MISSING');
    }
    if (scene.interactionAnchorMismatchCount !== 0) {
      failures.push('ART_PACK_INTERACTION_ANCHOR_MISMATCH');
    }
  }

  const motion = evidence.motion;
  if (
    !nonnegativeInteger(motion?.requiredTransitionsSampled) ||
    !nonnegativeInteger(motion?.rootDiscontinuityCount) ||
    !nonnegativeInteger(motion?.contactBreakFrameCount)
  ) {
    failures.push('ART_PACK_MOTION_MEASUREMENTS_INVALID');
  } else {
    if (
      motion.requiredTransitionsSampled <
      pack.motion.requiredTransitions.length
    ) {
      failures.push('ART_PACK_MOTION_TRANSITIONS_UNDERSAMPLED');
    }
    if (motion.rootDiscontinuityCount !== 0) {
      failures.push('ART_PACK_ROOT_MOTION_DISCONTINUITY');
    }
    if (motion.contactBreakFrameCount !== 0) {
      failures.push('ART_PACK_FOOT_CONTACT_BREAK');
    }
  }

  const runtime = evidence.crowdedRuntime;
  const crowded = pack.runtimeBudget.crowdedSceneContract;
  if (
    runtime?.scenarioId !== 'jiangwan_crowded_rain_night' ||
    runtime?.weather !== crowded.requiredWeather ||
    runtime?.dayPhase !== crowded.requiredDayPhase ||
    !nonnegativeInteger(runtime?.actorCount) ||
    !nonnegativeInteger(runtime?.vehicleCount) ||
    !nonnegativeInteger(runtime?.frameSamples) ||
    !finiteNonnegative(runtime?.frameTimeP95Ms) ||
    !finiteNonnegative(runtime?.frameTimeP99Ms) ||
    !finiteNonnegative(runtime?.frameTimeMaximumMs) ||
    !nonnegativeInteger(runtime?.elapsedHistoryReads)
  ) {
    failures.push('ART_PACK_CROWDED_RUNTIME_MEASUREMENTS_INVALID');
  } else {
    if (
      runtime.actorCount < crowded.minimumActors ||
      runtime.vehicleCount < crowded.minimumVehicles
    ) {
      failures.push('ART_PACK_CROWDED_SCENE_UNDERSAMPLED');
    }
    if (runtime.frameSamples < crowded.minimumFrameSamples) {
      failures.push('ART_PACK_FRAME_SAMPLES_INSUFFICIENT');
    }
    if (runtime.frameTimeP95Ms > crowded.frameTimeP95MaximumMs) {
      failures.push('ART_PACK_FRAME_TIME_P95_EXCEEDED');
    }
    if (runtime.frameTimeP99Ms > crowded.frameTimeP99MaximumMs) {
      failures.push('ART_PACK_FRAME_TIME_P99_EXCEEDED');
    }
    if (runtime.frameTimeMaximumMs > crowded.frameTimeMaximumMs) {
      failures.push('ART_PACK_FRAME_TIME_MAXIMUM_EXCEEDED');
    }
    if (
      runtime.frameTimeP95Ms > runtime.frameTimeP99Ms ||
      runtime.frameTimeP99Ms > runtime.frameTimeMaximumMs
    ) {
      failures.push('ART_PACK_FRAME_TIME_DISTRIBUTION_INVALID');
    }
    if (runtime.elapsedHistoryReads !== 0) {
      failures.push('ART_PACK_ELAPSED_HISTORY_READ');
    }
  }
  return {
    status: failures.length === 0 ? 'PASS' : 'BLOCKED',
    failures,
  };
}

export function auditJiangwanArtPackRelease({
  pack = JIANGWAN_ART_PACK_V1,
  manifest,
  sourceHashes = {},
  automatedEvidence = null,
  externalEvidence = {},
} = {}) {
  const technicalFailures = [
    ...packStructureFailures(pack),
    ...manifestFailures(manifest, sourceHashes),
  ];
  const automated = automatedEvidenceAudit(
    automatedEvidence,
    manifest,
    pack,
  );
  const blindVerified = externalEvidenceVerified(
    externalEvidence.blindRealtimeTest,
    manifest,
  );
  const artVerified = externalEvidenceVerified(
    externalEvidence.professionalArtSignoff,
    manifest,
    'professional_art_director',
  );
  const failures = [
    ...new Set([...technicalFailures, ...automated.failures]),
  ];
  if (!blindVerified) {
    failures.push('EXTERNAL_BLIND_REALTIME_TEST_UNVERIFIED');
  }
  if (!artVerified) {
    failures.push('PROFESSIONAL_ART_SIGNOFF_UNVERIFIED');
  }
  const technicalStatus = technicalFailures.length === 0 ? 'PASS' : 'BLOCKED';
  const status =
    technicalStatus === 'BLOCKED' || automated.status === 'BLOCKED'
      ? 'BLOCKED_AUTOMATED'
      : automated.status === 'PASS' && blindVerified && artVerified
        ? 'RELEASE_GATE_SATISFIED'
        : 'UNVERIFIED';
  return deepFreeze({
    schema: 'lzy-world2d-art-pack-release-audit-v1',
    packId: pack?.packId ?? null,
    releaseCandidateId: manifest?.releaseCandidateId ?? null,
    technicalStatus,
    automatedOracleStatus: automated.status,
    status,
    releaseEligible: status === 'RELEASE_GATE_SATISFIED',
    externalEvidence: {
      blindRealtimeTest: blindVerified ? 'VERIFIED' : 'UNVERIFIED',
      professionalArtSignoff: artVerified ? 'VERIFIED' : 'UNVERIFIED',
    },
    failures,
    claimBoundary: {
      productionIntegrated: true,
      technicalSliceIntegrated: true,
      releaseQualityVerified: false,
      visualTasteVerified: false,
      comparativeSuperiorityVerified: false,
    },
  });
}

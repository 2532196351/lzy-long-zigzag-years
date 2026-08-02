export const OPEN_WORLD_ART_QUALITY_SCHEMA =
  'lzy-open-world-art-quality-v1';

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const CHINESE_CITY_ART_BIBLE_V1 = deepFreeze({
  schema: 'lzy-chinese-city-art-bible-v1',
  scope: 'fictional_linlan_realtime_open_world',
  scale: {
    worldUnitsPerMeter: 1024,
    referenceCharacterHeightQ: 1_792,
    doorClearanceHeightQ: 2_304,
    vehicleLaneWidthQ: 3_584,
  },
  camera: {
    projection: 'top_down_oblique_2d',
    basePixelsPerMeterAt1x: 64,
    minimumZoom: 0.75,
    maximumZoom: 1.5,
    lookAheadRule: 'velocity_bounded_without_authority_position_change',
    reducedMotionRule: 'disable_camera_impulse_and_rapid_zoom',
  },
  silhouette: {
    minimumCharacterSeparationPxAt1x: 3,
    interactionPropReadabilityPxAt1x: 12,
    requiredStateSilhouettes: [
      'idle',
      'walking',
      'carrying',
      'interacting',
      'seated',
    ],
    colorOnlyMeaningForbidden: true,
  },
  palette: {
    cityNeutrals: ['#E7E0D2', '#A8A49A', '#596866', '#26312F'],
    publicService: ['#3F725F', '#D4B56A'],
    weather: ['#6F858A', '#385F68', '#254B54'],
    nightLights: ['#F0D38B', '#D47A57', '#8CB6C2'],
    maximumSimultaneousAccentFamilies: 3,
  },
  materials: {
    allowedShaderFamilies: [
      'opaque_lit',
      'cutout_lit',
      'transparent_weather',
      'emissive_signage',
    ],
    requiredTextureRoles: [
      'base_color',
      'normal',
      'roughness',
      'ambient_occlusion',
    ],
    authoredWearMustFollowUseZones: true,
    generatedMaterialWithoutHumanPassForbidden: true,
  },
  lighting: {
    authorityBindings: ['dayPhase', 'weather', 'powerState'],
    requiredPhases: ['day', 'night'],
    requiredWeatherProfiles: ['clear', 'rain'],
    contactShadowRequiredForGroundedDynamicObjects: true,
    fixtureEmissiveCannotCreateAuthorityState: true,
  },
  texelDensity: {
    heroPixelsPerMeter: 256,
    standardPixelsPerMeter: 128,
    backgroundPixelsPerMeter: 64,
    maximumDeviationRatio: 0.15,
    uvOverlapMaximumRatio: 0.005,
  },
  naming: {
    assetIdPattern:
      '^(character|vehicle|prop|building|fixture|effect)-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9]{3}$',
    clipNamePattern:
      '^(idle|walk_start|walk_loop|walk_stop|turn_90|turn_180|interact_reach|interact_carry)$',
    materialNamePattern: '^mat_[a-z0-9_]+_v[0-9]+$',
    textureNamePattern:
      '^tex_[a-z0-9_]+_(base_color|normal|roughness|ambient_occlusion)_v[0-9]+$',
  },
  animationContinuity: {
    requiredClipNames: [
      'idle',
      'walk_start',
      'walk_loop',
      'walk_stop',
      'turn_90',
      'turn_180',
      'interact_reach',
      'interact_carry',
    ],
    locomotionCyclePositionErrorMaximumMm: 5,
    footSlideMaximumMm: 15,
    contactBreakFrameMaximum: 0,
    jointVelocityDiscontinuityMaximum: 0,
    turnRootYawErrorMaximumDegrees: 2,
    startStopSpeedDiscontinuityMaximumMps: 0.15,
  },
  occlusionAndDepth: {
    sortKey: 'layer_band_then_feet_y_then_stable_entity_id',
    penetrationCountMaximum: 0,
    depthOrderViolationCountMaximum: 0,
    occlusionContractViolationCountMaximum: 0,
    missingContactShadowCountMaximum: 0,
    minimumSceneSamples: 300,
  },
  runtimeBenchmark: {
    crowdedRainNight: {
      visibleActors: 32,
      visibleVehicles: 12,
      dynamicLights: 16,
      weather: 'rain',
      lightingPhase: 'night',
    },
    minimumFrameSamples: 600,
    frameTimeP95MaximumMs: 16.7,
    frameTimeP99MaximumMs: 25,
    frameTimeMaximumMs: 50,
  },
  generatedAssetPolicy: {
    releaseWithoutHumanRevisionForbidden: true,
    requiredHumanPasses: [
      'retopology',
      'uvRemediation',
      'materialAuthoring',
      'motionCorrection',
    ],
    externalEvidenceRequired: [
      'blindRealtimeTest',
      'professionalArtSignoff',
    ],
  },
  claimBoundary: {
    automatedOraclesCannotProveTasteOrComparativeVisualSuperiority: true,
    staticScreenshotCannotSatisfyRealtimeQualityGate: true,
    missingExternalEvidenceStatus: 'UNVERIFIED',
  },
});

export const OPEN_WORLD_ASSET_MANIFEST_JSON_SCHEMA = deepFreeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'lzy-open-world-asset-manifest-v1',
  type: 'object',
  required: [
    'schema',
    'assetId',
    'assetType',
    'releaseCandidateId',
    'contentHashSha256',
    'sceneBuildHashSha256',
    'sourceKind',
    'sourceRecords',
    'deliverables',
  ],
  properties: {
    schema: { const: 'lzy-open-world-asset-manifest-v1' },
    assetId: { type: 'string', minLength: 1 },
    assetType: {
      enum: ['character', 'vehicle', 'prop', 'building', 'fixture', 'effect'],
    },
    releaseCandidateId: { type: 'string', minLength: 1 },
    contentHashSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    sceneBuildHashSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    sourceKind: {
      enum: [
        'human_authored',
        'licensed_external',
        'photogrammetry',
        'generated_assisted',
      ],
    },
    sourceRecords: { type: 'array', minItems: 1 },
    humanRevisionEvidence: { type: 'object' },
    deliverables: { type: 'object' },
  },
  additionalProperties: false,
});

const SHA256 = /^[a-f0-9]{64}$/;
const ASSET_TYPES = new Set(
  OPEN_WORLD_ASSET_MANIFEST_JSON_SCHEMA.properties.assetType.enum,
);
const SOURCE_KINDS = new Set(
  OPEN_WORLD_ASSET_MANIFEST_JSON_SCHEMA.properties.sourceKind.enum,
);

function text(value) {
  return typeof value === 'string' && value.length > 0;
}

function integer(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function finite(value, minimum = 0) {
  return Number.isFinite(value) && value >= minimum;
}

function validIso(value) {
  return text(value) && Number.isFinite(Date.parse(value));
}

function validateManifest(manifest) {
  const failures = [];
  if (manifest?.schema !== 'lzy-open-world-asset-manifest-v1') {
    failures.push('INVALID_ASSET_MANIFEST_SCHEMA');
  }
  if (!text(manifest?.assetId)) failures.push('ASSET_ID_REQUIRED');
  if (
    text(manifest?.assetId) &&
    !new RegExp(CHINESE_CITY_ART_BIBLE_V1.naming.assetIdPattern).test(
      manifest.assetId,
    )
  ) {
    failures.push('ASSET_ID_NAMING_CONTRACT_VIOLATION');
  }
  if (!ASSET_TYPES.has(manifest?.assetType)) {
    failures.push('ASSET_TYPE_INVALID');
  }
  if (!text(manifest?.releaseCandidateId)) {
    failures.push('RELEASE_CANDIDATE_ID_REQUIRED');
  }
  if (!SHA256.test(manifest?.contentHashSha256 ?? '')) {
    failures.push('ASSET_CONTENT_HASH_INVALID');
  }
  if (!SHA256.test(manifest?.sceneBuildHashSha256 ?? '')) {
    failures.push('SCENE_BUILD_HASH_INVALID');
  }
  if (!SOURCE_KINDS.has(manifest?.sourceKind)) {
    failures.push('ASSET_SOURCE_KIND_INVALID');
  }
  if (
    !Array.isArray(manifest?.sourceRecords) ||
    manifest.sourceRecords.length === 0
  ) {
    failures.push('ASSET_PROVENANCE_REQUIRED');
  } else {
    for (const record of manifest.sourceRecords) {
      if (
        !text(record?.sourceId) ||
        !text(record.creatorOrLicensor) ||
        !text(record.licenseRef) ||
        !SHA256.test(record.sourceHashSha256 ?? '') ||
        !validIso(record.acquiredAtIso) ||
        !text(record.usageScope)
      ) {
        failures.push('ASSET_PROVENANCE_RECORD_INVALID');
        break;
      }
    }
  }
  const deliverables = manifest?.deliverables;
  const requiredDeliverables =
    manifest?.assetType === 'character'
      ? ['geometry', 'rig', 'uv', 'materials', 'animations']
      : ['geometry', 'uv', 'materials'];
  if (
    !deliverables ||
    requiredDeliverables.some((key) => deliverables[key] !== true)
  ) {
    failures.push('ASSET_REQUIRED_DELIVERABLE_MISSING');
  }
  return { ok: failures.length === 0, failures };
}

const HUMAN_PASS_FAILURES = Object.freeze({
  retopology: 'GENERATED_ASSET_MISSING_HUMAN_RETOPOLOGY',
  uvRemediation: 'GENERATED_ASSET_MISSING_HUMAN_UV_REMEDIATION',
  materialAuthoring: 'GENERATED_ASSET_MISSING_HUMAN_MATERIAL_AUTHORING',
  motionCorrection: 'GENERATED_ASSET_MISSING_HUMAN_MOTION_CORRECTION',
});

function validHumanPass(entry) {
  return (
    entry?.status === 'completed' &&
    text(entry.kind) &&
    text(entry.reviewerId) &&
    text(entry.evidenceRef) &&
    validIso(entry.completedAtIso)
  );
}

function validateGeneratedAssetHumanRevision(manifest) {
  const required = manifest?.sourceKind === 'generated_assisted';
  const failures = [];
  if (required) {
    for (const pass of CHINESE_CITY_ART_BIBLE_V1.generatedAssetPolicy
      .requiredHumanPasses) {
      if (!validHumanPass(manifest?.humanRevisionEvidence?.[pass])) {
        failures.push(HUMAN_PASS_FAILURES[pass]);
      }
    }
  }
  return { required, ok: failures.length === 0, failures };
}

function measurementIdentityFailures(manifest, measurements) {
  const failures = [];
  if (measurements?.schema !== 'lzy-open-world-asset-measurements-v1') {
    failures.push('INVALID_ASSET_MEASUREMENTS_SCHEMA');
  }
  if (
    measurements?.assetId !== manifest?.assetId ||
    measurements?.contentHashSha256 !== manifest?.contentHashSha256 ||
    measurements?.measuredBuildHashSha256 !== manifest?.sceneBuildHashSha256
  ) {
    failures.push('MEASUREMENTS_IDENTITY_MISMATCH');
  }
  return failures;
}

function checkGeometry(measurements) {
  const value = measurements?.geometry;
  const failures = [];
  if (!integer(value?.triangleCount, 1) || value.triangleCount > 80_000) {
    failures.push('GEOMETRY_TRIANGLE_BUDGET_INVALID');
  }
  if (value?.degenerateTriangleCount !== 0) {
    failures.push('GEOMETRY_DEGENERATE_TRIANGLE_DETECTED');
  }
  if (value?.nonManifoldEdgeCount !== 0) {
    failures.push('GEOMETRY_NON_MANIFOLD_EDGE_DETECTED');
  }
  if (value?.invertedNormalCount !== 0) {
    failures.push('GEOMETRY_INVERTED_NORMAL_DETECTED');
  }
  return failures;
}

function checkRig(manifest, measurements) {
  if (manifest?.assetType !== 'character') return [];
  const value = measurements?.rig;
  const failures = [];
  if (!integer(value?.boneCount, 1) || value.boneCount > 160) {
    failures.push('RIG_BONE_BUDGET_INVALID');
  }
  if (
    !integer(value?.maxInfluencesPerVertex, 1) ||
    value.maxInfluencesPerVertex > 4
  ) {
    failures.push('RIG_VERTEX_INFLUENCE_BUDGET_INVALID');
  }
  if (value?.unweightedVertexCount !== 0) {
    failures.push('RIG_UNWEIGHTED_VERTEX_DETECTED');
  }
  if (value?.normalizedWeightViolationCount !== 0) {
    failures.push('RIG_WEIGHT_NORMALIZATION_VIOLATION');
  }
  if (value?.bindPoseErrorCount !== 0) {
    failures.push('RIG_BIND_POSE_ERROR');
  }
  return failures;
}

function checkUvMaterial(measurements) {
  const value = measurements?.uvMaterial;
  const bible = CHINESE_CITY_ART_BIBLE_V1.texelDensity;
  const failures = [];
  if (value?.uvOutOfBoundsCount !== 0) {
    failures.push('UV_OUT_OF_BOUNDS_DETECTED');
  }
  if (
    !finite(value?.overlappingUvRatio) ||
    value.overlappingUvRatio > bible.uvOverlapMaximumRatio
  ) {
    failures.push('UV_OVERLAP_EXCEEDS_BUDGET');
  }
  if (
    !finite(value?.texelDensityDeviationRatio) ||
    value.texelDensityDeviationRatio > bible.maximumDeviationRatio
  ) {
    failures.push('TEXEL_DENSITY_DEVIATION_EXCEEDS_BUDGET');
  }
  if (value?.missingTextureRefCount !== 0) {
    failures.push('MATERIAL_TEXTURE_REFERENCE_MISSING');
  }
  if (value?.unsupportedMaterialCount !== 0) {
    failures.push('MATERIAL_SHADER_UNSUPPORTED');
  }
  return failures;
}

function checkAnimation(manifest, measurements) {
  if (manifest?.assetType !== 'character') return [];
  const value = measurements?.animation;
  const bible = CHINESE_CITY_ART_BIBLE_V1.animationContinuity;
  const failures = [];
  if (
    !Array.isArray(value?.clipNames) ||
    bible.requiredClipNames.some((name) => !value.clipNames.includes(name))
  ) {
    failures.push('ANIMATION_REQUIRED_CLIP_MISSING');
  }
  if (
    !finite(value?.locomotionCyclePositionErrorMm) ||
    value.locomotionCyclePositionErrorMm >
      bible.locomotionCyclePositionErrorMaximumMm
  ) {
    failures.push('ANIMATION_LOCOMOTION_CYCLE_ERROR');
  }
  if (
    !finite(value?.footSlideMaxMm) ||
    value.footSlideMaxMm > bible.footSlideMaximumMm
  ) {
    failures.push('ANIMATION_FOOT_SLIDE_EXCEEDS_BUDGET');
  }
  if (value?.contactBreakFrameCount !== bible.contactBreakFrameMaximum) {
    failures.push('ANIMATION_CONTACT_BREAK_DETECTED');
  }
  if (
    value?.jointVelocityDiscontinuityCount !==
    bible.jointVelocityDiscontinuityMaximum
  ) {
    failures.push('ANIMATION_JOINT_VELOCITY_DISCONTINUITY');
  }
  if (
    !finite(value?.turnRootYawErrorDegrees) ||
    value.turnRootYawErrorDegrees > bible.turnRootYawErrorMaximumDegrees
  ) {
    failures.push('ANIMATION_TURN_ROOT_ERROR');
  }
  if (
    !finite(value?.startStopSpeedDiscontinuityMps) ||
    value.startStopSpeedDiscontinuityMps >
      bible.startStopSpeedDiscontinuityMaximumMps
  ) {
    failures.push('ANIMATION_START_STOP_DISCONTINUITY');
  }
  return failures;
}

function checkScene(measurements) {
  const value = measurements?.scene;
  const bible = CHINESE_CITY_ART_BIBLE_V1.occlusionAndDepth;
  const failures = [];
  if (!integer(value?.sampleCount, bible.minimumSceneSamples)) {
    failures.push('SCENE_SAMPLE_COUNT_INSUFFICIENT');
  }
  if (value?.penetrationCount !== bible.penetrationCountMaximum) {
    failures.push('SCENE_PENETRATION_DETECTED');
  }
  if (
    value?.depthOrderViolationCount !==
    bible.depthOrderViolationCountMaximum
  ) {
    failures.push('SCENE_DEPTH_ORDER_VIOLATION');
  }
  if (
    value?.occlusionContractViolationCount !==
    bible.occlusionContractViolationCountMaximum
  ) {
    failures.push('SCENE_OCCLUSION_CONTRACT_VIOLATION');
  }
  if (
    value?.missingContactShadowCount !==
    bible.missingContactShadowCountMaximum
  ) {
    failures.push('SCENE_CONTACT_SHADOW_MISSING');
  }
  return failures;
}

function checkPerformance(measurements) {
  const value = measurements?.performance;
  const bible = CHINESE_CITY_ART_BIBLE_V1.runtimeBenchmark;
  const crowd = bible.crowdedRainNight;
  const failures = [];
  if (!integer(value?.frameSampleCount, bible.minimumFrameSamples)) {
    failures.push('CROWDED_FRAME_SAMPLE_COUNT_INSUFFICIENT');
  }
  if (
    !finite(value?.frameTimeP95Ms) ||
    value.frameTimeP95Ms > bible.frameTimeP95MaximumMs
  ) {
    failures.push('CROWDED_FRAME_TIME_P95_EXCEEDS_BUDGET');
  }
  if (
    !finite(value?.frameTimeP99Ms) ||
    value.frameTimeP99Ms > bible.frameTimeP99MaximumMs
  ) {
    failures.push('CROWDED_FRAME_TIME_P99_EXCEEDS_BUDGET');
  }
  if (
    !finite(value?.frameTimeMaxMs) ||
    value.frameTimeMaxMs > bible.frameTimeMaximumMs
  ) {
    failures.push('CROWDED_FRAME_TIME_MAX_EXCEEDS_BUDGET');
  }
  if (!integer(value?.visibleActors, crowd.visibleActors)) {
    failures.push('CROWDED_ACTOR_COUNT_INSUFFICIENT');
  }
  if (!integer(value?.visibleVehicles, crowd.visibleVehicles)) {
    failures.push('CROWDED_VEHICLE_COUNT_INSUFFICIENT');
  }
  if (!integer(value?.dynamicLights, crowd.dynamicLights)) {
    failures.push('DYNAMIC_LIGHT_COUNT_INSUFFICIENT');
  }
  if (
    !Array.isArray(value?.weatherProfilesTested) ||
    !CHINESE_CITY_ART_BIBLE_V1.lighting.requiredWeatherProfiles.every(
      (profile) => value.weatherProfilesTested.includes(profile),
    )
  ) {
    failures.push('DYNAMIC_WEATHER_COVERAGE_INCOMPLETE');
  }
  if (
    !Array.isArray(value?.lightingPhasesTested) ||
    !CHINESE_CITY_ART_BIBLE_V1.lighting.requiredPhases.every((phase) =>
      value.lightingPhasesTested.includes(phase),
    )
  ) {
    failures.push('DYNAMIC_LIGHTING_COVERAGE_INCOMPLETE');
  }
  return failures;
}

function automatedChecks(manifest, measurements) {
  const groups = {
    identity: measurementIdentityFailures(manifest, measurements),
    geometry: checkGeometry(measurements),
    rig: checkRig(manifest, measurements),
    uvMaterial: checkUvMaterial(measurements),
    animationContinuity: checkAnimation(manifest, measurements),
    sceneOcclusionDepth: checkScene(measurements),
    crowdedFrameTime: checkPerformance(measurements),
  };
  const failures = Object.values(groups).flat();
  return {
    ok: failures.length === 0,
    checks: Object.fromEntries(
      Object.entries(groups).map(([key, value]) => [
        key,
        value.length === 0 ? 'PASS' : 'FAIL',
      ]),
    ),
    failures,
  };
}

function validExternalEvidence(entry, manifest, { artSignoff = false } = {}) {
  if (
    entry?.status !== 'verified' ||
    !text(entry.evidenceId) ||
    entry.releaseCandidateId !== manifest?.releaseCandidateId ||
    entry.sceneBuildHashSha256 !== manifest?.sceneBuildHashSha256 ||
    !SHA256.test(entry.evidenceHashSha256 ?? '')
  ) {
    return false;
  }
  if (
    artSignoff &&
    (!text(entry.reviewerId) ||
      entry.reviewerRole !== 'professional_art_director')
  ) {
    return false;
  }
  return true;
}

export function evaluateOpenWorldAssetRelease({
  manifest,
  measurements,
  externalEvidence = {},
} = {}) {
  const manifestGate = validateManifest(manifest);
  const generatedAssetHumanRevisionGate =
    validateGeneratedAssetHumanRevision(manifest);
  const automated = automatedChecks(manifest, measurements);
  const blindVerified = validExternalEvidence(
    externalEvidence.blindRealtimeTest,
    manifest,
  );
  const artVerified = validExternalEvidence(
    externalEvidence.professionalArtSignoff,
    manifest,
    { artSignoff: true },
  );
  const failures = [
    ...manifestGate.failures,
    ...generatedAssetHumanRevisionGate.failures,
    ...automated.failures,
  ];
  if (!blindVerified) {
    failures.push('EXTERNAL_BLIND_REALTIME_TEST_UNVERIFIED');
  }
  if (!artVerified) {
    failures.push('PROFESSIONAL_ART_SIGNOFF_UNVERIFIED');
  }
  const technicalOk =
    manifestGate.ok &&
    generatedAssetHumanRevisionGate.ok &&
    automated.ok;
  const externalOk = blindVerified && artVerified;
  const status = !technicalOk
    ? 'BLOCKED_AUTOMATED'
    : !externalOk
      ? 'UNVERIFIED'
      : 'RELEASE_GATE_SATISFIED';

  return deepFreeze({
    schema: OPEN_WORLD_ART_QUALITY_SCHEMA,
    assetId: manifest?.assetId ?? null,
    releaseCandidateId: manifest?.releaseCandidateId ?? null,
    status,
    releaseEligible: status === 'RELEASE_GATE_SATISFIED',
    manifest: manifestGate,
    generatedAssetHumanRevisionGate,
    automated,
    externalEvidence: {
      blindRealtimeTest: blindVerified ? 'VERIFIED' : 'UNVERIFIED',
      professionalArtSignoff: artVerified ? 'VERIFIED' : 'UNVERIFIED',
    },
    externalEvidenceScope:
      'referenced_artifacts_require_independent_storage_and_signature_verification',
    failures,
  });
}

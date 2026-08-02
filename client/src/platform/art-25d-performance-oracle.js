export const ART_25D_DAY_SET = Object.freeze([
  1,
  7,
  30,
  100,
  365,
  1_000,
]);

const MIB = 1024 * 1024;

function deepFreeze(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Object.isFrozen(value)
  ) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const ART_25D_RUNTIME_BUDGETS = deepFreeze({
  web_mobile: {
    drawCommandsPerPaint: 512,
    residentTextureBytes: 96 * MIB,
    visibleEntities: 96,
  },
  web_desktop: {
    drawCommandsPerPaint: 1_024,
    residentTextureBytes: 192 * MIB,
    visibleEntities: 160,
  },
  native_mobile: {
    drawCommandsPerPaint: 768,
    residentTextureBytes: 128 * MIB,
    visibleEntities: 128,
  },
  steam_desktop: {
    drawCommandsPerPaint: 1_536,
    residentTextureBytes: 256 * MIB,
    visibleEntities: 192,
  },
});

const ACTIVE_COMPLEXITY_KEYS = Object.freeze([
  'atlasPages',
  'drawCommandsPerPaint',
  'liveRenderHandles',
  'residentTextureBytes',
  'residentTextures',
  'visibleEntities',
]);

const ELAPSED_HISTORY_SURFACES = Object.freeze([
  'cadence',
  'publication',
  'paint',
  'liveWorkingSet',
]);

function safeInteger(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function uniqueSorted(values) {
  return [
    ...new Set(values.filter((value) => typeof value === 'string')),
  ].sort((left, right) => left.localeCompare(right));
}

function sameActiveComplexity(left, right) {
  return ACTIVE_COMPLEXITY_KEYS.every(
    (key) => left?.[key] === right?.[key],
  );
}

function validActiveComplexity(value) {
  return ACTIVE_COMPLEXITY_KEYS.every((key) =>
    safeInteger(value?.[key]),
  );
}

function assessLifecycle(lifecycle, reasons) {
  if (!safeInteger(lifecycle?.visibilityCycles, 128)) {
    reasons.push('INSUFFICIENT_VISIBILITY_CYCLES');
  }
  if (
    !safeInteger(lifecycle?.peakOutstandingRaf) ||
    lifecycle.peakOutstandingRaf > 1
  ) {
    reasons.push('RAF_INSTANCE_MULTIPLICATION');
  }
  if (
    !safeInteger(
      lifecycle?.peakObservedCanvasTargetsPerObserver,
    ) ||
    lifecycle.peakObservedCanvasTargetsPerObserver > 1
  ) {
    reasons.push('OBSERVER_TARGET_MULTIPLICATION');
  }

  const created = lifecycle?.observerInstancesCreated;
  if (
    !safeInteger(created?.resize) ||
    !safeInteger(created?.intersection) ||
    created.resize > 1 ||
    created.intersection > 1
  ) {
    reasons.push('OBSERVER_INSTANCE_MULTIPLICATION');
  }

  if (lifecycle?.hidden?.outstandingRaf !== 0) {
    reasons.push('HIDDEN_RAF_LEAK');
  }
  if (lifecycle?.hidden?.observedCanvasTargets !== 0) {
    reasons.push('HIDDEN_OBSERVER_TARGET_LEAK');
  }
  if (lifecycle?.resumed?.outstandingRaf !== 1) {
    reasons.push('RESUME_RAF_MULTIPLICATION');
  }

  const createdObserverCount =
    (safeInteger(created?.resize) ? created.resize : 0) +
    (safeInteger(created?.intersection) ? created.intersection : 0);
  if (
    lifecycle?.resumed?.observedCanvasTargets !==
    createdObserverCount
  ) {
    reasons.push('RESUME_OBSERVER_TARGET_MISMATCH');
  }
  if (
    lifecycle?.hidden?.liveResizeObservers !== created?.resize ||
    lifecycle?.hidden?.liveIntersectionObservers !==
      created?.intersection ||
    lifecycle?.resumed?.liveResizeObservers !== created?.resize ||
    lifecycle?.resumed?.liveIntersectionObservers !==
      created?.intersection
  ) {
    reasons.push('OBSERVER_LIFETIME_DRIFT');
  }

  for (const key of [
    'outstandingRaf',
    'observedCanvasTargets',
    'liveResizeObservers',
    'liveIntersectionObservers',
  ]) {
    if (lifecycle?.destroyed?.[key] !== 0) {
      reasons.push(`DESTROYED_HANDLE_LEAK:${key}`);
    }
  }
}

export function assessArt25dPerformanceReceipt(receipt) {
  const reasons = [];
  if (receipt?.schema !== 'lzy_art_25d_performance_receipt_v1') {
    reasons.push('INVALID_ART_25D_RECEIPT');
  }
  if (
    receipt?.integration?.productionStatus !==
      'independent_contract_not_integrated' ||
    receipt?.integration?.authorityMutationAllowed !== false ||
    receipt?.integration?.sourceOfSettledFacts !==
      'worker_controller_projection'
  ) {
    reasons.push('INVALID_INTEGRATION_CLAIM');
  }
  if (
    receipt?.measurementContract?.drawCommandDefinition !==
      'render_submission_equivalent_per_paint' ||
    receipt?.measurementContract?.textureResidencyDefinition !==
      'decoded_resident_bytes' ||
    receipt?.measurementContract?.visibleEntityDefinition !==
      'post_cull_renderable_entity'
  ) {
    reasons.push('INVALID_MEASUREMENT_CONTRACT');
  }

  const budget = ART_25D_RUNTIME_BUDGETS[receipt?.profile];
  if (!budget) reasons.push('UNKNOWN_ART_RUNTIME_PROFILE');
  const samples = Array.isArray(receipt?.daySamples)
    ? receipt.daySamples
    : [];
  if (
    samples.length !== ART_25D_DAY_SET.length ||
    samples.some(
      (sample, index) =>
        sample?.dayIndex !== ART_25D_DAY_SET[index],
    )
  ) {
    reasons.push('ART_WORLD_AGE_SET_MISMATCH');
  }

  const baseline = samples[0]?.activeComplexity;
  for (const sample of samples) {
    const day = sample?.dayIndex ?? 'unknown';
    const active = sample?.activeComplexity;
    if (
      !validActiveComplexity(active) ||
      !sameActiveComplexity(active, baseline)
    ) {
      reasons.push(`ACTIVE_RENDER_COMPLEXITY_DRIFT:day${day}`);
    }
    if (
      budget &&
      (!safeInteger(active?.drawCommandsPerPaint) ||
        active.drawCommandsPerPaint > budget.drawCommandsPerPaint)
    ) {
      reasons.push(`DRAW_COMMAND_BUDGET_EXCEEDED:day${day}`);
    }
    if (
      budget &&
      (!safeInteger(active?.visibleEntities) ||
        active.visibleEntities > budget.visibleEntities)
    ) {
      reasons.push(`VISIBLE_ENTITY_BUDGET_EXCEEDED:day${day}`);
    }
    if (
      budget &&
      (!safeInteger(active?.residentTextureBytes) ||
        active.residentTextureBytes > budget.residentTextureBytes)
    ) {
      reasons.push(`TEXTURE_RESIDENCY_BUDGET_EXCEEDED:day${day}`);
    }
    for (const surface of ELAPSED_HISTORY_SURFACES) {
      if (sample?.elapsedHistoryReads?.[surface] !== 0) {
        reasons.push(`ELAPSED_HISTORY_READ:${surface}:day${day}`);
      }
    }
  }

  assessLifecycle(receipt?.lifecycle, reasons);
  const reasonCodes = uniqueSorted(reasons);
  return deepFreeze({
    schema: 'lzy_art_25d_performance_assessment_v1',
    status: reasonCodes.length === 0 ? 'accepted' : 'rejected',
    reasonCodes,
    claims: {
      independentContractVerified: reasonCodes.length === 0,
      nativeRuntimeVerified: false,
      productionIntegrated: false,
      visualTasteVerified: false,
    },
  });
}

function observerFactory(factory, label) {
  if (factory === undefined || factory === null) return null;
  if (typeof factory !== 'function') {
    throw new TypeError(`${label} must be a function when supplied.`);
  }
  const observer = factory();
  for (const method of ['observe', 'unobserve', 'disconnect']) {
    if (typeof observer?.[method] !== 'function') {
      throw new TypeError(`${label} returned an invalid observer.`);
    }
  }
  return observer;
}

export function createBoundedCanvasLifecycleProbe({
  canvas,
  createIntersectionObserver,
  createResizeObserver,
  scheduler,
  onPaint = () => {},
}) {
  if (canvas === null || typeof canvas !== 'object') {
    throw new TypeError('canvas is required.');
  }
  if (
    typeof scheduler?.requestAnimationFrame !== 'function' ||
    typeof scheduler?.cancelAnimationFrame !== 'function'
  ) {
    throw new TypeError('a request/cancel animation-frame scheduler is required.');
  }
  if (typeof onPaint !== 'function') {
    throw new TypeError('onPaint must be a function.');
  }

  let destroyed = false;
  let hidden = true;
  let mounted = false;
  let frameHandle = null;
  let resizeObserver = null;
  let intersectionObserver = null;
  let observing = false;
  let visibilityCycles = 0;

  function schedule() {
    if (destroyed || hidden || frameHandle !== null) return;
    frameHandle = scheduler.requestAnimationFrame((time) => {
      frameHandle = null;
      if (destroyed || hidden) return;
      onPaint(time);
      schedule();
    });
  }

  function startObserving() {
    if (observing) return;
    resizeObserver?.observe(canvas);
    intersectionObserver?.observe(canvas);
    observing = true;
  }

  function stopObserving() {
    if (!observing) return;
    resizeObserver?.unobserve(canvas);
    intersectionObserver?.unobserve(canvas);
    observing = false;
  }

  function cancelFrame() {
    if (frameHandle === null) return;
    scheduler.cancelAnimationFrame(frameHandle);
    frameHandle = null;
  }

  function snapshot() {
    return {
      destroyed,
      hidden,
      mounted,
      observerInstancesCreated: {
        intersection: intersectionObserver === null ? 0 : 1,
        resize: resizeObserver === null ? 0 : 1,
      },
      observedCanvasTargets:
        observing
          ? Number(resizeObserver !== null) +
            Number(intersectionObserver !== null)
          : 0,
      outstandingRaf: frameHandle === null ? 0 : 1,
      visibilityCycles,
    };
  }

  return Object.freeze({
    destroy() {
      if (destroyed) return;
      hidden = true;
      cancelFrame();
      stopObserving();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      destroyed = true;
    },
    hide() {
      if (destroyed || hidden) return;
      hidden = true;
      visibilityCycles += 1;
      cancelFrame();
      stopObserving();
    },
    mount() {
      if (destroyed || mounted) return;
      resizeObserver = observerFactory(
        createResizeObserver,
        'createResizeObserver',
      );
      intersectionObserver = observerFactory(
        createIntersectionObserver,
        'createIntersectionObserver',
      );
      mounted = true;
      hidden = false;
      startObserving();
      schedule();
    },
    resume() {
      if (destroyed || !mounted || !hidden) return;
      hidden = false;
      startObserving();
      schedule();
    },
    snapshot,
  });
}

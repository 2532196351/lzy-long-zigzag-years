export const EMERGENT_WORLDLINE_V2_SCHEMA =
  'lzy_emergent_worldline_v2';

const TRANSITION_PLAN_SCHEMA =
  'lzy_worldline_transition_plan_v1';
const DAY_MS = 86_400_000;
const DEFAULT_BUDGETS = Object.freeze({
  maxActiveArcs: 32,
  maxTerminalArcs: 8,
  maxRecentTransitions: 32,
});
const ALLOWED_DOMAINS = new Set([
  'life',
  'career',
  'business',
  'company',
  'city',
  'policy',
  'technology',
  'market',
  'derivatives',
  'relationship',
  'legacy',
]);

function strings(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .filter((value) => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, stable(value[key])]),
  );
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function cloneKnown(value) {
  if (Array.isArray(value)) return value.map(cloneKnown);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      cloneKnown(entry),
    ]),
  );
}

function canonicalWorldline(worldline) {
  return {
    schema: worldline.schema,
    worldId: worldline.worldId,
    worldSeedRef: worldline.worldSeedRef,
    status: worldline.status,
    terminalReason: worldline.terminalReason,
    anchors: cloneKnown(worldline.anchors),
    totalSettledEvents: worldline.totalSettledEvents,
    totalSettledFacts: worldline.totalSettledFacts,
    lastSettledEventId: worldline.lastSettledEventId,
    lastCommitSeq: worldline.lastCommitSeq,
    nextArcSequence: worldline.nextArcSequence,
    arcs: cloneKnown(worldline.arcs),
    activeArcIds: [...worldline.activeArcIds],
    terminalArcIds: [...worldline.terminalArcIds],
    recentTransitions: cloneKnown(worldline.recentTransitions),
    eventArcIndex: cloneKnown(worldline.eventArcIndex),
    factArcIndex: cloneKnown(worldline.factArcIndex),
    archive: cloneKnown(worldline.archive),
  };
}

function initialAnchors(sessionId) {
  return {
    moment: {
      sequence: 0,
      eventId: null,
      eventType: null,
      atMs: 0,
      commitSeq: 0,
    },
    session: {
      id: sessionId,
      sequence: 0,
    },
    day: { index: 1 },
    week: { index: 1 },
    quarter: { index: 1 },
    era: { index: 1 },
  };
}

export function createEmergentWorldlineV2({
  worldId,
  worldSeedRef = '',
  sessionId = 'session-unset',
} = {}) {
  if (typeof worldId !== 'string' || !worldId.trim()) {
    throw new TypeError('worldId is required');
  }
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new TypeError('sessionId is required');
  }
  return {
    schema: EMERGENT_WORLDLINE_V2_SCHEMA,
    worldId: worldId.trim(),
    worldSeedRef:
      typeof worldSeedRef === 'string' ? worldSeedRef : '',
    status: 'running',
    terminalReason: null,
    anchors: initialAnchors(sessionId.trim()),
    totalSettledEvents: 0,
    totalSettledFacts: 0,
    lastSettledEventId: null,
    lastCommitSeq: 0,
    nextArcSequence: 1,
    arcs: {},
    activeArcIds: [],
    terminalArcIds: [],
    recentTransitions: [],
    eventArcIndex: {},
    factArcIndex: {},
    archive: {
      terminalArcCount: 0,
      transitionCount: 0,
      digest: '00000000',
    },
  };
}

export function emergentWorldlineStructuralFingerprint(
  worldline,
) {
  return JSON.stringify(stable(canonicalWorldline(worldline)));
}

function normalizeBudgets(budgets = {}) {
  const normalized = {};
  for (const key of Object.keys(DEFAULT_BUDGETS)) {
    const candidate = budgets[key];
    normalized[key] =
      Number.isSafeInteger(candidate) && candidate > 0
        ? candidate
        : DEFAULT_BUDGETS[key];
  }
  return normalized;
}

function timeAnchors(prior, bundle) {
  const atMs = bundle.event.effectiveAtMs;
  const dayIndex = Math.floor(atMs / DAY_MS) + 1;
  const sessionId =
    typeof bundle.sessionId === 'string' &&
    bundle.sessionId.trim()
      ? bundle.sessionId.trim()
      : prior.anchors.session.id;
  return {
    moment: {
      sequence: prior.totalSettledEvents + 1,
      eventId: bundle.event.id,
      eventType: bundle.event.type,
      atMs,
      commitSeq: bundle.commitSeq,
    },
    session: {
      id: sessionId,
      sequence:
        sessionId === prior.anchors.session.id
          ? prior.anchors.session.sequence + 1
          : 1,
    },
    day: { index: dayIndex },
    week: {
      index: Math.floor((dayIndex - 1) / 7) + 1,
    },
    quarter: {
      index: Math.floor((dayIndex - 1) / 90) + 1,
    },
    era: {
      index: Math.floor((dayIndex - 1) / 365) + 1,
    },
  };
}

function knownDates(values) {
  const unique = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    if (
      !Number.isSafeInteger(value?.atMs) ||
      value.atMs < 0 ||
      typeof value.kind !== 'string' ||
      !value.kind.trim()
    ) {
      continue;
    }
    const entry = {
      atMs: value.atMs,
      kind: value.kind.trim(),
    };
    unique.set(`${entry.atMs}:${entry.kind}`, entry);
  }
  return [...unique.values()].sort(
    (left, right) =>
      left.atMs - right.atMs ||
      left.kind.localeCompare(right.kind),
  );
}

function rejectionPlan(prior, bundle, reasonCodes) {
  return {
    schema: TRANSITION_PLAN_SCHEMA,
    status: 'rejected',
    reasonCodes: strings(reasonCodes),
    baseFingerprint:
      emergentWorldlineStructuralFingerprint(prior),
    bundleId:
      typeof bundle?.bundleId === 'string'
        ? bundle.bundleId
        : null,
    eventId:
      typeof bundle?.event?.id === 'string'
        ? bundle.event.id
        : null,
    commitSeq: Number.isSafeInteger(bundle?.commitSeq)
      ? bundle.commitSeq
      : null,
    anchors: null,
    factIds: [],
    candidates: [],
    budgets: null,
  };
}

function duplicatePlan(prior, bundle) {
  return {
    ...rejectionPlan(prior, bundle, []),
    status: 'duplicate',
  };
}

function activeArc(prior, arcId) {
  return (
    prior.activeArcIds.includes(arcId) &&
    prior.arcs[arcId]?.phase !== 'terminated'
  );
}

function normalizeCandidate(hint) {
  return {
    kind: hint.kind,
    domain:
      typeof hint.domain === 'string'
        ? hint.domain.trim()
        : '',
    triggerFactIds: strings(hint.triggerFactIds),
    materialEntityIds: strings(hint.materialEntityIds),
    parentArcIds: strings(hint.parentArcIds),
    targetArcIds: strings(hint.targetArcIds),
    unresolvedTensions: strings(hint.unresolvedTensions),
    resolvedTensions: strings(hint.resolvedTensions),
    resourceConstraints: strings(hint.resourceConstraints),
    resolvedResourceConstraints: strings(
      hint.resolvedResourceConstraints,
    ),
    branchingConditions: strings(hint.branchingConditions),
    requiredBranchConditions: strings(
      hint.requiredBranchConditions,
    ),
    nextKnownDates: knownDates(hint.nextKnownDates),
    reasonCode:
      typeof hint.reasonCode === 'string'
        ? hint.reasonCode.trim()
        : '',
  };
}

export function deriveWorldlineCandidates(
  prior,
  bundle,
  budgets = {},
) {
  if (auditEmergentWorldlineV2(prior).ok === false) {
    return rejectionPlan(prior, bundle, [
      'INVALID_PRIOR_WORLDLINE',
    ]);
  }
  const eventId = bundle?.event?.id;
  if (
    typeof eventId === 'string' &&
    Object.prototype.hasOwnProperty.call(
      prior.eventArcIndex,
      eventId,
    )
  ) {
    return duplicatePlan(prior, bundle);
  }

  const errors = [];
  if (bundle?.schema !== 'lzy_settlement_bundle_v1') {
    errors.push('INVALID_SETTLEMENT_BUNDLE');
  }
  if (bundle?.event?.status !== 'settled') {
    errors.push('EVENT_NOT_SETTLED');
  }
  if (
    typeof eventId !== 'string' ||
    !eventId.trim() ||
    typeof bundle?.event?.type !== 'string' ||
    !bundle.event.type.trim() ||
    !Number.isSafeInteger(bundle?.event?.effectiveAtMs) ||
    bundle.event.effectiveAtMs < 0
  ) {
    errors.push('INVALID_SETTLED_EVENT');
  }
  if (
    typeof bundle?.bundleId !== 'string' ||
    !bundle.bundleId.trim()
  ) {
    errors.push('INVALID_BUNDLE_ID');
  }
  if (
    !Number.isSafeInteger(bundle?.commitSeq) ||
    bundle.commitSeq <= prior.lastCommitSeq
  ) {
    errors.push('NON_MONOTONIC_COMMIT');
  }
  if (prior.status !== 'running') {
    errors.push('WORLDLINE_NOT_RUNNING');
  }

  const facts = Array.isArray(bundle?.facts)
    ? bundle.facts
    : [];
  const factIds = strings(facts.map((fact) => fact?.id));
  if (
    factIds.length === 0 ||
    facts.some(
      (fact) =>
        !fact ||
        typeof fact.id !== 'string' ||
        !fact.id.trim(),
    )
  ) {
    errors.push('NO_SETTLED_FACTS');
  }

  const hints = Array.isArray(bundle?.worldlineHints)
    ? bundle.worldlineHints
    : [];
  if (hints.length === 0) {
    errors.push('NO_WORLDLINE_CANDIDATE');
  }
  const factSet = new Set(factIds);
  const normalized = hints.map(normalizeCandidate);
  const declaredConditions = new Set(
    prior.activeArcIds.flatMap(
      (arcId) => prior.arcs[arcId]?.branchingConditions ?? [],
    ),
  );

  for (const candidate of normalized) {
    if (!['open', 'branch', 'terminate'].includes(candidate.kind)) {
      errors.push('INVALID_CANDIDATE_KIND');
    }
    if (!ALLOWED_DOMAINS.has(candidate.domain)) {
      errors.push('INVALID_WORLDLINE_DOMAIN');
    }
    if (
      candidate.triggerFactIds.length === 0 ||
      candidate.triggerFactIds.some(
        (factId) => !factSet.has(factId),
      )
    ) {
      errors.push('UNBOUND_TRIGGER_FACT');
    }
    if (candidate.kind === 'branch') {
      if (
        candidate.parentArcIds.length === 0 ||
        candidate.parentArcIds.some(
          (arcId) => !activeArc(prior, arcId),
        )
      ) {
        errors.push('BRANCH_PARENT_NOT_ACTIVE');
      }
      if (candidate.requiredBranchConditions.length === 0) {
        errors.push('BRANCH_CONDITION_REQUIRED');
      }
      if (
        candidate.requiredBranchConditions.some(
          (condition) => !declaredConditions.has(condition),
        )
      ) {
        errors.push('BRANCH_CONDITION_NOT_DECLARED');
      }
    }
    if (candidate.kind === 'terminate') {
      if (!candidate.reasonCode) {
        errors.push('TERMINATION_REASON_REQUIRED');
      }
      if (
        candidate.targetArcIds.length === 0 ||
        candidate.targetArcIds.some(
          (arcId) => !activeArc(prior, arcId),
        )
      ) {
        errors.push('TERMINATION_TARGET_NOT_ACTIVE');
      }
    }
  }

  const normalizedBudgets = normalizeBudgets(budgets);
  const newArcCount = normalized.filter(
    (candidate) =>
      candidate.kind === 'open' || candidate.kind === 'branch',
  ).length;
  const terminatedNow = new Set(
    normalized.flatMap((candidate) =>
      candidate.kind === 'terminate'
        ? candidate.targetArcIds
        : [],
    ),
  ).size;
  if (
    prior.activeArcIds.length + newArcCount - terminatedNow >
    normalizedBudgets.maxActiveArcs
  ) {
    errors.push('ACTIVE_ARC_BUDGET_EXCEEDED');
  }

  if (errors.length > 0) {
    return rejectionPlan(prior, bundle, errors);
  }
  return {
    schema: TRANSITION_PLAN_SCHEMA,
    status: 'accepted',
    reasonCodes: [],
    baseFingerprint:
      emergentWorldlineStructuralFingerprint(prior),
    bundleId: bundle.bundleId.trim(),
    eventId: eventId.trim(),
    eventType: bundle.event.type.trim(),
    commitSeq: bundle.commitSeq,
    anchors: timeAnchors(prior, bundle),
    factIds,
    candidates: normalized,
    budgets: normalizedBudgets,
  };
}

function addToIndex(index, key, values) {
  index[key] = strings([...(index[key] ?? []), ...values]);
}

function newArc(state, plan, candidate) {
  const arcId = `worldline_arc_${String(
    state.nextArcSequence,
  ).padStart(6, '0')}`;
  state.nextArcSequence += 1;
  const arc = {
    id: arcId,
    domain: candidate.domain,
    phase: 'active',
    originEventIds: [plan.eventId],
    latestMaterialEventId: plan.eventId,
    settledFactIds: [...candidate.triggerFactIds],
    materialEntityIds: [...candidate.materialEntityIds],
    parentArcIds: [...candidate.parentArcIds],
    childArcIds: [],
    unresolvedTensions: [...candidate.unresolvedTensions],
    resourceConstraints: [...candidate.resourceConstraints],
    branchingConditions: [...candidate.branchingConditions],
    nextKnownDates: cloneKnown(candidate.nextKnownDates),
    startedAtMs: plan.anchors.moment.atMs,
    lastChangedAtMs: plan.anchors.moment.atMs,
    endedAtMs: null,
    terminalReason: null,
    evidenceDigest: hashText(
      JSON.stringify(
        stable({
          eventId: plan.eventId,
          factIds: candidate.triggerFactIds,
          domain: candidate.domain,
          parentArcIds: candidate.parentArcIds,
        }),
      ),
    ),
  };
  state.arcs[arcId] = arc;
  state.activeArcIds.push(arcId);
  for (const parentArcId of candidate.parentArcIds) {
    const parent = state.arcs[parentArcId];
    parent.childArcIds = strings([
      ...parent.childArcIds,
      arcId,
    ]);
    parent.lastChangedAtMs = plan.anchors.moment.atMs;
  }
  for (const factId of candidate.triggerFactIds) {
    addToIndex(state.factArcIndex, factId, [arcId]);
  }
  return arc;
}

function terminateArc(state, plan, candidate, arcId) {
  const arc = state.arcs[arcId];
  arc.phase = 'terminated';
  arc.terminalReason = candidate.reasonCode;
  arc.endedAtMs = plan.anchors.moment.atMs;
  arc.lastChangedAtMs = plan.anchors.moment.atMs;
  arc.latestMaterialEventId = plan.eventId;
  arc.settledFactIds = strings([
    ...arc.settledFactIds,
    ...candidate.triggerFactIds,
  ]);
  arc.unresolvedTensions = strings(
    arc.unresolvedTensions.filter(
      (tension) =>
        !candidate.resolvedTensions.includes(tension),
    ),
  );
  arc.resourceConstraints = strings(
    arc.resourceConstraints.filter(
      (constraint) =>
        !candidate.resolvedResourceConstraints.includes(
          constraint,
        ),
    ),
  );
  state.activeArcIds = state.activeArcIds.filter(
    (candidateArcId) => candidateArcId !== arcId,
  );
  state.terminalArcIds = strings([
    ...state.terminalArcIds,
    arcId,
  ]);
  for (const factId of candidate.triggerFactIds) {
    addToIndex(state.factArcIndex, factId, [arcId]);
  }
}

function compactTerminalArcs(state, maximum) {
  while (state.terminalArcIds.length > maximum) {
    const arcId = state.terminalArcIds.shift();
    const arc = state.arcs[arcId];
    if (!arc) continue;
    state.archive.terminalArcCount += 1;
    state.archive.digest = hashText(
      `${state.archive.digest}|${arc.id}|${arc.evidenceDigest}`,
    );
    delete state.arcs[arcId];
    for (const [eventId, arcIds] of Object.entries(
      state.eventArcIndex,
    )) {
      state.eventArcIndex[eventId] = arcIds.filter(
        (candidateArcId) => candidateArcId !== arcId,
      );
      if (state.eventArcIndex[eventId].length === 0) {
        delete state.eventArcIndex[eventId];
      }
    }
    for (const [factId, arcIds] of Object.entries(
      state.factArcIndex,
    )) {
      state.factArcIndex[factId] = arcIds.filter(
        (candidateArcId) => candidateArcId !== arcId,
      );
      if (state.factArcIndex[factId].length === 0) {
        delete state.factArcIndex[factId];
      }
    }
  }
}

export function applyWorldlineTransition(prior, plan) {
  if (plan?.status !== 'accepted') return prior;
  if (
    plan.schema !== TRANSITION_PLAN_SCHEMA ||
    plan.baseFingerprint !==
      emergentWorldlineStructuralFingerprint(prior)
  ) {
    const error = new Error(
      'Worldline transition plan does not match its base state.',
    );
    error.code = 'STALE_WORLDLINE_PLAN';
    throw error;
  }

  const state = canonicalWorldline(prior);
  state.anchors = cloneKnown(plan.anchors);
  state.totalSettledEvents += 1;
  state.totalSettledFacts += plan.factIds.length;
  state.lastSettledEventId = plan.eventId;
  state.lastCommitSeq = plan.commitSeq;
  const affectedArcIds = [];

  for (const candidate of plan.candidates) {
    if (candidate.kind === 'open' || candidate.kind === 'branch') {
      const arc = newArc(state, plan, candidate);
      affectedArcIds.push(arc.id);
      continue;
    }
    for (const arcId of candidate.targetArcIds) {
      terminateArc(state, plan, candidate, arcId);
      affectedArcIds.push(arcId);
    }
  }
  state.eventArcIndex[plan.eventId] = strings(affectedArcIds);
  state.recentTransitions.push({
    bundleId: plan.bundleId,
    eventId: plan.eventId,
    eventType: plan.eventType,
    commitSeq: plan.commitSeq,
    atMs: plan.anchors.moment.atMs,
    kinds: strings(plan.candidates.map((candidate) => candidate.kind)),
    arcIds: strings(affectedArcIds),
    factIds: [...plan.factIds],
    evidenceDigest: hashText(
      JSON.stringify(
        stable({
          eventId: plan.eventId,
          factIds: plan.factIds,
          candidates: plan.candidates,
        }),
      ),
    ),
  });
  if (
    state.recentTransitions.length >
    plan.budgets.maxRecentTransitions
  ) {
    const removed = state.recentTransitions.splice(
      0,
      state.recentTransitions.length -
        plan.budgets.maxRecentTransitions,
    );
    for (const transition of removed) {
      state.archive.transitionCount += 1;
      state.archive.digest = hashText(
        `${state.archive.digest}|${transition.evidenceDigest}`,
      );
    }
  }
  compactTerminalArcs(
    state,
    plan.budgets.maxTerminalArcs,
  );
  return state;
}

function validStringArray(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) => typeof entry === 'string' && entry.length > 0,
    ) &&
    new Set(value).size === value.length
  );
}

export function auditEmergentWorldlineV2(worldline) {
  const errors = [];
  if (
    !worldline ||
    worldline.schema !== EMERGENT_WORLDLINE_V2_SCHEMA ||
    typeof worldline.worldId !== 'string' ||
    !['running', 'terminal'].includes(worldline.status) ||
    !Number.isSafeInteger(worldline.totalSettledEvents) ||
    worldline.totalSettledEvents < 0 ||
    !Number.isSafeInteger(worldline.totalSettledFacts) ||
    worldline.totalSettledFacts < worldline.totalSettledEvents ||
    !Number.isSafeInteger(worldline.lastCommitSeq) ||
    worldline.lastCommitSeq < 0 ||
    !Number.isSafeInteger(worldline.nextArcSequence) ||
    worldline.nextArcSequence < 1 ||
    !worldline.arcs ||
    Array.isArray(worldline.arcs)
  ) {
    return {
      ok: false,
      errors: ['INVALID_EMERGENT_WORLDLINE_V2'],
    };
  }
  if (
    !validStringArray(worldline.activeArcIds) ||
    !validStringArray(worldline.terminalArcIds) ||
    worldline.activeArcIds.some((arcId) =>
      worldline.terminalArcIds.includes(arcId),
    )
  ) {
    errors.push('INVALID_ARC_INDEX');
  }
  for (const [arcId, arc] of Object.entries(worldline.arcs)) {
    if (
      arc?.id !== arcId ||
      !ALLOWED_DOMAINS.has(arc.domain) ||
      !['active', 'terminated'].includes(arc.phase) ||
      !validStringArray(arc.originEventIds) ||
      !validStringArray(arc.settledFactIds) ||
      !validStringArray(arc.materialEntityIds) ||
      !validStringArray(arc.parentArcIds) ||
      !validStringArray(arc.childArcIds) ||
      !validStringArray(arc.unresolvedTensions) ||
      !validStringArray(arc.resourceConstraints) ||
      !validStringArray(arc.branchingConditions) ||
      !Array.isArray(arc.nextKnownDates) ||
      typeof arc.evidenceDigest !== 'string' ||
      (arc.phase === 'active' &&
        !worldline.activeArcIds.includes(arcId)) ||
      (arc.phase === 'terminated' &&
        !worldline.terminalArcIds.includes(arcId))
    ) {
      errors.push(`INVALID_ARC:${arcId}`);
    }
  }
  const anchors = worldline.anchors;
  if (
    !Number.isSafeInteger(anchors?.moment?.atMs) ||
    !Number.isSafeInteger(anchors?.moment?.sequence) ||
    typeof anchors?.session?.id !== 'string' ||
    !Number.isSafeInteger(anchors?.session?.sequence) ||
    !['day', 'week', 'quarter', 'era'].every((key) =>
      Number.isSafeInteger(anchors?.[key]?.index),
    )
  ) {
    errors.push('INVALID_TIME_ANCHORS');
  }
  if (!Array.isArray(worldline.recentTransitions)) {
    errors.push('INVALID_RECENT_TRANSITIONS');
  }
  for (const arcIds of Object.values(
    worldline.eventArcIndex ?? {},
  )) {
    if (
      !validStringArray(arcIds) ||
      arcIds.some((arcId) => !worldline.arcs[arcId])
    ) {
      errors.push('INVALID_EVENT_ARC_INDEX');
    }
  }
  for (const arcIds of Object.values(
    worldline.factArcIndex ?? {},
  )) {
    if (
      !validStringArray(arcIds) ||
      arcIds.some((arcId) => !worldline.arcs[arcId])
    ) {
      errors.push('INVALID_FACT_ARC_INDEX');
    }
  }
  const uniqueErrors = [...new Set(errors)];
  return {
    ok: uniqueErrors.length === 0,
    errors: uniqueErrors,
  };
}

export const WORLDLINE_SCHEMA =
  'lzy_worldline_state_v2';

const LEGACY_WORLDLINE_SCHEMA =
  'lzy_worldline_state_v1';
const DAY_MS = 86_400_000;
const ARC_INACTIVITY_MS = 90 * DAY_MS;
const MAX_ACTIVE_ARCS = 32;
const MAX_TERMINAL_ARCS = 8;
const MAX_DOMINANT_ARCS = 3;
const MAX_RECENT_TRANSITIONS = 32;
const MAX_EVENT_ARC_INDEX = 64;
const MAX_ARC_EVENT_TYPES = 16;
const MAX_ARC_ENTITIES = 24;
const MAX_ARC_FACTS = 48;
const MAX_ARC_ORIGIN_EVENTS = 24;
const MAX_ARC_TENSIONS = 16;
const MAX_ARC_CONSTRAINTS = 16;
const MAX_ARC_BRANCHING_CONDITIONS = 16;
const MAX_ARC_KNOWN_DATES = 16;

function clone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function strings(values, maximum = Infinity) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .filter((value) => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, maximum);
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

function eventAtMs(event) {
  for (const candidate of [
    event.effectiveAtMs,
    event.virtualMs,
    event.publishedAtMs,
  ]) {
    if (Number.isSafeInteger(candidate) && candidate >= 0) {
      return candidate;
    }
  }
  const tick = Number(event.tick ?? event.effectiveAt);
  return Number.isSafeInteger(tick) && tick >= 0
    ? tick * DAY_MS
    : 0;
}

function sessionPhase(atMs) {
  const withinDay = atMs % DAY_MS;
  const hour = Math.floor(withinDay / 3_600_000);
  if (hour < 9) return 'before_open';
  if (hour < 12) return 'morning';
  if (hour < 13) return 'midday';
  if (hour < 16) return 'afternoon';
  return 'after_close';
}

function anchorsForEvent(event, sequence) {
  const atMs = eventAtMs(event);
  const dayIndex = Math.floor(atMs / DAY_MS) + 1;
  return {
    moment: {
      sequence,
      eventId: event.id,
      eventType: event.type,
      atMs,
      tick:
        Number.isSafeInteger(event.tick) && event.tick >= 0
          ? event.tick
          : Math.floor(atMs / DAY_MS),
    },
    session: {
      key: `day-${dayIndex}:${sessionPhase(atMs)}`,
      dayIndex,
      phase: sessionPhase(atMs),
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

function initialAnchors() {
  return {
    moment: {
      sequence: 0,
      eventId: null,
      eventType: null,
      atMs: 0,
      tick: 0,
    },
    session: {
      key: 'day-1:before_open',
      dayIndex: 1,
      phase: 'before_open',
    },
    day: { index: 1 },
    week: { index: 1 },
    quarter: { index: 1 },
    era: { index: 1 },
  };
}

export function createWorldlineState({
  worldId,
  worldSeed,
} = {}) {
  if (typeof worldId !== 'string' || !worldId) {
    throw new TypeError('worldId is required');
  }
  return {
    schema: WORLDLINE_SCHEMA,
    worldId,
    seedRef:
      typeof worldSeed === 'string' ? worldSeed : '',
    status: 'emergent',
    terminalReasonCode: null,
    anchors: initialAnchors(),
    totalSettledEvents: 0,
    totalSettledFacts: 0,
    lastSettledEventId: null,
    nextArcSequence: 1,
    arcs: {},
    activeArcIds: [],
    terminalArcIds: [],
    dominantArcIds: [],
    recentTransitions: [],
    eventArcIndex: {},
    sourceEvidenceIndex: {},
    archive: {
      transitionCount: 0,
      arcCount: 0,
      settledFactCount: 0,
      digest: '00000000',
    },
  };
}

function eventEntities(event) {
  return strings([
    ...(event.affectedEntities ?? []),
    event.entityId,
    event.symbol,
    event.actorId,
  ]);
}

function eventFacts(event) {
  return strings([
    ...(event.factIds ?? []),
    event.factId,
  ]);
}

function eventDomain(event) {
  const type = String(event.type ?? '').toLowerCase();
  if (
    /derivative|future|option|margin|lending|clearing/.test(
      type,
    )
  ) {
    return 'derivatives';
  }
  if (/market|trade|order|quote|liquidity/.test(type)) {
    return 'market';
  }
  if (
    /company|corporate|inventory|supply|operating|production/.test(
      type,
    )
  ) {
    return 'company';
  }
  if (/social|career|relationship|business/.test(type)) {
    return 'social';
  }
  if (/life|home|service|upkeep|work_income|rest/.test(type)) {
    return 'life';
  }
  if (/clue|research|information|disclosure/.test(type)) {
    return 'information';
  }
  if (/role|commitment|player_hold/.test(type)) {
    return 'player';
  }
  return 'world';
}

const DEFAULT_DOMAIN_STRUCTURE = Object.freeze({
  derivatives: Object.freeze({
    tensions: ['margin_and_settlement_exposure'],
    constraints: ['finite_margin_and_counterparty'],
    branching: ['next_clearing_outcome'],
    nextKind: 'derivative_clearing',
  }),
  market: Object.freeze({
    tensions: ['liquidity_and_position_balance'],
    constraints: ['finite_cash_and_inventory'],
    branching: ['next_settled_order_flow'],
    nextKind: 'market_day_settlement',
  }),
  company: Object.freeze({
    tensions: ['operating_execution'],
    constraints: ['finite_operating_resources'],
    branching: ['next_operating_settlement'],
    nextKind: 'company_report',
  }),
  social: Object.freeze({
    tensions: ['relationship_and_obligation'],
    constraints: ['finite_time_and_trust'],
    branching: ['next_social_settlement'],
    nextKind: 'social_settlement',
  }),
  life: Object.freeze({
    tensions: ['household_obligation'],
    constraints: ['finite_household_resources'],
    branching: ['next_household_settlement'],
    nextKind: 'household_settlement',
  }),
  information: Object.freeze({
    tensions: ['unverified_information'],
    constraints: ['finite_research_capacity'],
    branching: ['next_verification_result'],
    nextKind: 'information_update',
  }),
  player: Object.freeze({
    tensions: ['decision_consequence'],
    constraints: ['finite_player_resources'],
    branching: ['next_settled_consequence'],
    nextKind: 'decision_review',
  }),
  world: Object.freeze({
    tensions: ['world_path_unresolved'],
    constraints: ['finite_world_resources'],
    branching: ['next_settled_world_change'],
    nextKind: 'world_day_settlement',
  }),
});

function knownDates(values, maximum = MAX_ARC_KNOWN_DATES) {
  const unique = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    if (
      !value ||
      !Number.isSafeInteger(value.atMs) ||
      value.atMs < 0 ||
      typeof value.kind !== 'string' ||
      !value.kind.trim()
    ) {
      continue;
    }
    const normalized = {
      atMs: value.atMs,
      kind: value.kind.trim(),
    };
    unique.set(
      `${normalized.atMs}:${normalized.kind}`,
      normalized,
    );
  }
  return [...unique.values()]
    .sort(
      (left, right) =>
        left.atMs - right.atMs ||
        left.kind.localeCompare(right.kind),
    )
    .slice(0, maximum);
}

function normalizedEffect(event) {
  const raw =
    event.worldlineEffect &&
    typeof event.worldlineEffect === 'object'
      ? event.worldlineEffect
      : {};
  const domain =
    typeof raw.domain === 'string' && raw.domain
      ? raw.domain
      : eventDomain(event);
  const defaults =
    DEFAULT_DOMAIN_STRUCTURE[domain] ??
    DEFAULT_DOMAIN_STRUCTURE.world;
  const atMs = eventAtMs(event);
  const nextDayAtMs =
    (Math.floor(atMs / DAY_MS) + 1) * DAY_MS;
  const unresolvedTensions = strings([
    ...(raw.unresolvedTensions ?? []),
    ...(event.unresolvedTensions ?? []),
  ]);
  const resourceConstraints = strings([
    ...(raw.resourceConstraints ?? []),
    ...(event.resourceConstraints ?? []),
  ]);
  const branchingConditions = strings([
    ...(raw.branchingConditions ?? []),
    ...(event.branchingConditions ?? []),
  ]);
  const explicitKnownDates = knownDates([
    ...(raw.nextKnownDates ?? []),
    ...(event.nextKnownDates ?? []),
  ]);
  return {
    kind: [
      'branch',
      'merge',
      'terminate',
      'continue',
    ].includes(raw.kind)
      ? raw.kind
      : 'continue',
    scope:
      raw.scope === 'world' ? 'world' : 'arc',
    domain,
    reasonCode:
      typeof raw.reasonCode === 'string' && raw.reasonCode
        ? raw.reasonCode
        : 'settled_terminal_outcome',
    parentEventIds: strings([
      ...(raw.parentEventIds ?? []),
      ...(event.parentEventIds ?? []),
    ]),
    constraintCodes: strings([
      ...(raw.constraintCodes ?? []),
      ...(event.constraintCodes ?? []),
    ]),
    resourceEntityIds: strings([
      ...(raw.resourceEntityIds ?? []),
      ...(event.resourceEntityIds ?? []),
    ]),
    unresolvedTensions: strings([
      ...(unresolvedTensions.length > 0
        ? unresolvedTensions
        : defaults.tensions),
    ]),
    resolvedTensions: strings([
      ...(raw.resolvedTensions ?? []),
      ...(event.resolvedTensions ?? []),
    ]),
    resourceConstraints: strings([
      ...(resourceConstraints.length > 0
        ? resourceConstraints
        : defaults.constraints),
    ]),
    resolvedResourceConstraints: strings([
      ...(raw.resolvedResourceConstraints ?? []),
      ...(event.resolvedResourceConstraints ?? []),
    ]),
    branchingConditions: strings([
      ...(branchingConditions.length > 0
        ? branchingConditions
        : defaults.branching),
    ]),
    resolvedBranchingConditions: strings([
      ...(raw.resolvedBranchingConditions ?? []),
      ...(event.resolvedBranchingConditions ?? []),
    ]),
    nextKnownDates: knownDates([
      ...(explicitKnownDates.length > 0
        ? explicitKnownDates
        : [
            {
              atMs: nextDayAtMs,
              kind: defaults.nextKind,
            },
          ]),
    ]),
  };
}

function eventEvidenceDigest(event, factIds) {
  return hashText(
    JSON.stringify(
      stable({
        id: event.id,
        type: event.type,
        authority: event.authority ?? null,
        actorId: event.actorId ?? null,
        affectedEntities: eventEntities(event),
        factIds,
        ledgerEntryIds: strings(event.ledgerEntryIds),
        parentIds: strings(event.parentIds),
        preconditions: strings(event.preconditions),
        ruleVersion: event.ruleVersion ?? null,
        seedRef: event.seedRef ?? null,
        atMs: eventAtMs(event),
      }),
    ),
  );
}

function newArc(worldline, event, parentArcIds, effect) {
  if (worldline.activeArcIds.length >= MAX_ACTIVE_ARCS) {
    const leastDominant = [...worldline.activeArcIds]
      .map((arcId) => worldline.arcs[arcId])
      .filter(Boolean)
      .sort(
        (left, right) =>
          left.dominanceScore - right.dominanceScore ||
          left.lastChangedAtMs - right.lastChangedAtMs ||
          left.id.localeCompare(right.id),
      )[0];
    terminateArc(
      worldline,
      leastDominant,
      'active_arc_capacity_archived',
    );
  }
  const arcId = `worldline_arc_${String(
    worldline.nextArcSequence,
  ).padStart(6, '0')}`;
  worldline.nextArcSequence += 1;
  const anchor = worldline.anchors.moment;
  worldline.arcs[arcId] = {
    id: arcId,
    domain: effect.domain,
    status: 'active',
    originEventId: event.id,
    originEventIds: [event.id],
    latestEventId: event.id,
    latestEventType: event.type,
    settledEventCount: 0,
    settledFactCount: 0,
    startedAtMs: anchor.atMs,
    lastChangedAtMs: anchor.atMs,
    endedAtMs: null,
    focusEntityIds: [],
    eventTypes: [],
    factIds: [],
    settledFactIds: [],
    constraintCodes: [],
    resourceEntityIds: [],
    unresolvedTensions: [],
    resourceConstraints: [],
    branchingConditions: [],
    nextKnownDates: [],
    parentArcIds: strings(parentArcIds),
    childArcIds: [],
    terminalReasonCode: null,
    evidenceDigest: '00000000',
    dominanceScore: 0,
  };
  worldline.activeArcIds.push(arcId);
  for (const parentArcId of parentArcIds) {
    const parent = worldline.arcs[parentArcId];
    if (!parent) continue;
    parent.childArcIds = strings([
      ...parent.childArcIds,
      arcId,
    ]);
  }
  return worldline.arcs[arcId];
}

function parentArcIdsFor(worldline, event, effect) {
  return strings([
    ...(event.parentIds ?? []).map(
      (eventId) => worldline.eventArcIndex[eventId],
    ),
    ...effect.parentEventIds.map(
      (eventId) => worldline.eventArcIndex[eventId],
    ),
  ]).filter((arcId) => worldline.arcs[arcId]);
}

const GENERIC_FOCUS_ENTITIES = new Set([
  'player',
  'world_system',
  'public_market',
  'derivative_market',
  'economy',
]);

function overlapEntities(entities) {
  const specific = entities.filter(
    (entityId) => !GENERIC_FOCUS_ENTITIES.has(entityId),
  );
  return specific.length > 0 ? specific : entities;
}

function overlappingActiveArc(
  worldline,
  entities,
  domain,
) {
  let winner = null;
  let winnerOverlap = 0;
  const comparableEntities = overlapEntities(entities);
  for (const arcId of worldline.activeArcIds) {
    const arc = worldline.arcs[arcId];
    if (
      !arc ||
      arc.status !== 'active' ||
      arc.domain !== domain
    ) {
      continue;
    }
    const focus = new Set(overlapEntities(arc.focusEntityIds));
    const overlap = comparableEntities.reduce(
      (count, entityId) =>
        count + (focus.has(entityId) ? 1 : 0),
      0,
    );
    if (
      overlap > winnerOverlap ||
      (
        overlap === winnerOverlap &&
        overlap > 0 &&
        arc.lastChangedAtMs >
          (winner?.lastChangedAtMs ?? -1)
      )
    ) {
      winner = arc;
      winnerOverlap = overlap;
    }
  }
  return winnerOverlap > 0 ? winner : null;
}

function without(values, removedValues) {
  const removed = new Set(removedValues);
  return values.filter((value) => !removed.has(value));
}

function applyEventToArc(
  arc,
  event,
  effect,
  anchors,
  factIds,
) {
  arc.latestEventId = event.id;
  arc.latestEventType = event.type;
  arc.settledEventCount += 1;
  arc.settledFactCount += factIds.length;
  arc.lastChangedAtMs = anchors.moment.atMs;
  arc.focusEntityIds = strings(
    [...arc.focusEntityIds, ...eventEntities(event)],
    MAX_ARC_ENTITIES,
  );
  arc.eventTypes = strings(
    [...arc.eventTypes, event.type],
    MAX_ARC_EVENT_TYPES,
  );
  arc.factIds = strings(
    [...arc.factIds, ...factIds],
    MAX_ARC_FACTS,
  );
  arc.settledFactIds = strings(
    [...arc.settledFactIds, ...factIds],
    MAX_ARC_FACTS,
  );
  arc.constraintCodes = strings([
    ...arc.constraintCodes,
    ...effect.constraintCodes,
  ]);
  arc.resourceEntityIds = strings([
    ...arc.resourceEntityIds,
    ...effect.resourceEntityIds,
  ]);
  arc.unresolvedTensions = strings(
    [
      ...without(
        arc.unresolvedTensions,
        effect.resolvedTensions,
      ),
      ...effect.unresolvedTensions,
    ],
    MAX_ARC_TENSIONS,
  );
  arc.resourceConstraints = strings(
    [
      ...without(
        arc.resourceConstraints,
        effect.resolvedResourceConstraints,
      ),
      ...effect.resourceConstraints,
    ],
    MAX_ARC_CONSTRAINTS,
  );
  arc.branchingConditions = strings(
    [
      ...without(
        arc.branchingConditions,
        effect.resolvedBranchingConditions,
      ),
      ...effect.branchingConditions,
    ],
    MAX_ARC_BRANCHING_CONDITIONS,
  );
  arc.nextKnownDates = knownDates([
    ...arc.nextKnownDates.filter(
      (entry) => entry.atMs >= anchors.moment.atMs,
    ),
    ...effect.nextKnownDates,
  ]);
  arc.evidenceDigest = hashText(
    `${arc.evidenceDigest}|${eventEvidenceDigest(
      event,
      factIds,
    )}`,
  );
}

function archiveTransition(worldline, transition) {
  worldline.archive.transitionCount += 1;
  worldline.archive.settledFactCount +=
    transition.factIds.length;
  worldline.archive.digest = hashText(
    `${worldline.archive.digest}|${transition.eventId}|${transition.kind}|${transition.atMs}|${transition.evidenceDigest}`,
  );
}

function terminateArc(worldline, arc, reasonCode) {
  if (!arc || arc.status !== 'active') return;
  arc.status = 'terminal';
  arc.endedAtMs = worldline.anchors.moment.atMs;
  arc.terminalReasonCode = reasonCode;
  worldline.activeArcIds =
    worldline.activeArcIds.filter(
      (arcId) => arcId !== arc.id,
    );
  worldline.terminalArcIds = strings([
    ...worldline.terminalArcIds,
    arc.id,
  ]);
}

function decayInactiveArcs(
  worldline,
  atMs,
  protectedArcIds,
) {
  const protectedIds = new Set(protectedArcIds);
  const decayed = [];
  for (const arcId of [...worldline.activeArcIds]) {
    const arc = worldline.arcs[arcId];
    if (
      !arc ||
      protectedIds.has(arcId) ||
      atMs - arc.lastChangedAtMs < ARC_INACTIVITY_MS
    ) {
      continue;
    }
    terminateArc(
      worldline,
      arc,
      'settled_inactivity',
    );
    decayed.push(arcId);
  }
  return decayed;
}

function recomputeDominance(worldline) {
  const nowMs = worldline.anchors.moment.atMs;
  const ranked = worldline.activeArcIds
    .map((arcId) => worldline.arcs[arcId])
    .filter(Boolean)
    .map((arc) => {
      const durationDays = Math.max(
        0,
        Math.floor((nowMs - arc.startedAtMs) / DAY_MS),
      );
      arc.dominanceScore =
        Math.min(16, arc.settledEventCount) * 4 +
        Math.min(24, arc.settledFactCount) * 2 +
        Math.min(12, arc.focusEntityIds.length) * 3 +
        Math.min(8, arc.unresolvedTensions.length) * 6 +
        Math.min(8, arc.resourceConstraints.length) * 4 +
        Math.min(8, arc.resourceEntityIds.length) * 3 +
        Math.min(8, arc.childArcIds.length) * 2 +
        Math.min(30, durationDays);
      return arc;
    })
    .sort(
      (left, right) =>
        right.dominanceScore - left.dominanceScore ||
        right.lastChangedAtMs - left.lastChangedAtMs ||
        left.id.localeCompare(right.id),
    );
  worldline.dominantArcIds = ranked
    .slice(0, MAX_DOMINANT_ARCS)
    .map((arc) => arc.id);
}

function compactWorldline(worldline) {
  if (
    worldline.recentTransitions.length >
    MAX_RECENT_TRANSITIONS
  ) {
    const removed = worldline.recentTransitions.splice(
      0,
      worldline.recentTransitions.length -
        MAX_RECENT_TRANSITIONS,
    );
    for (const transition of removed) {
      archiveTransition(worldline, transition);
    }
  }
  const indexedEventIds = Object.keys(
    worldline.eventArcIndex,
  );
  if (indexedEventIds.length > MAX_EVENT_ARC_INDEX) {
    for (const eventId of indexedEventIds.slice(
      0,
      indexedEventIds.length - MAX_EVENT_ARC_INDEX,
    )) {
      delete worldline.eventArcIndex[eventId];
      delete worldline.sourceEvidenceIndex[eventId];
    }
  }
  while (
    worldline.terminalArcIds.length >
    MAX_TERMINAL_ARCS
  ) {
    const arcId = worldline.terminalArcIds.shift();
    const arc = worldline.arcs[arcId];
    if (!arc) continue;
    worldline.archive.arcCount += 1;
    worldline.archive.settledFactCount +=
      arc.settledFactCount;
    worldline.archive.digest = hashText(
      `${worldline.archive.digest}|${arc.id}|${arc.latestEventId}|${arc.settledEventCount}|${arc.evidenceDigest}`,
    );
    for (const candidate of Object.values(worldline.arcs)) {
      candidate.parentArcIds = candidate.parentArcIds.filter(
        (candidateId) => candidateId !== arcId,
      );
      candidate.childArcIds = candidate.childArcIds.filter(
        (candidateId) => candidateId !== arcId,
      );
    }
    for (const [eventId, indexedArcId] of Object.entries(
      worldline.eventArcIndex,
    )) {
      if (indexedArcId === arcId) {
        delete worldline.eventArcIndex[eventId];
        delete worldline.sourceEvidenceIndex[eventId];
      }
    }
    delete worldline.arcs[arcId];
  }
}

export function advanceWorldlineState(
  current,
  event,
  { mutate = false } = {},
) {
  const factIds = eventFacts(event ?? {});
  if (
    !event ||
    event.status !== 'settled' ||
    event.worldlineEligible === false ||
    typeof event.id !== 'string' ||
    typeof event.type !== 'string' ||
    factIds.length === 0 ||
    current.status === 'terminal'
  ) {
    return current;
  }
  if (current.eventArcIndex[event.id]) return current;
  // The standalone API remains persistent by default. The authoritative
  // engine already owns an isolated draft (or is advancing its sole Worker
  // state), so it can update the bounded worldline in place. Avoiding a full
  // structured clone for every settled tape print is material at 16× and
  // does not weaken rollback at external command boundaries.
  const worldline = mutate ? current : clone(current);
  const sequence = worldline.totalSettledEvents + 1;
  worldline.anchors = anchorsForEvent(event, sequence);
  worldline.totalSettledEvents = sequence;
  worldline.totalSettledFacts += factIds.length;
  worldline.lastSettledEventId = event.id;
  const effect = normalizedEffect(event);
  const entities = eventEntities(event);
  const parentArcIds = parentArcIdsFor(
    worldline,
    event,
    effect,
  );
  const activeParentArcIds = parentArcIds.filter(
    (arcId) =>
      worldline.arcs[arcId]?.status === 'active',
  );
  const decayedArcIds = decayInactiveArcs(
    worldline,
    worldline.anchors.moment.atMs,
    activeParentArcIds,
  );
  const implicitMerge =
    event.type === 'world_tick_completed' &&
    activeParentArcIds.length > 1;
  const implicitBranch =
    activeParentArcIds.length === 1 &&
    worldline.arcs[activeParentArcIds[0]]?.domain !==
      effect.domain;
  let arc;
  let transitionKind = 'advanced';

  if (effect.kind === 'merge' || implicitMerge) {
    arc = newArc(
      worldline,
      event,
      activeParentArcIds,
      effect,
    );
    arc.originEventIds = [
      ...strings(
        activeParentArcIds.flatMap(
          (arcId) =>
            worldline.arcs[arcId]?.originEventIds ?? [],
        ),
        MAX_ARC_ORIGIN_EVENTS - 1,
      ).filter((eventId) => eventId !== event.id),
      event.id,
    ].sort((left, right) => left.localeCompare(right));
    applyEventToArc(
      arc,
      event,
      effect,
      worldline.anchors,
      factIds,
    );
    for (const parentArcId of activeParentArcIds) {
      terminateArc(
        worldline,
        worldline.arcs[parentArcId],
        'merged_into_settled_successor',
      );
    }
    transitionKind = 'merged';
  } else if (effect.kind === 'branch' || implicitBranch) {
    arc = newArc(
      worldline,
      event,
      activeParentArcIds,
      effect,
    );
    applyEventToArc(
      arc,
      event,
      effect,
      worldline.anchors,
      factIds,
    );
    transitionKind = 'branched';
  } else {
    arc =
      activeParentArcIds
        .map((arcId) => worldline.arcs[arcId])
        .find(
          (candidate) => candidate?.status === 'active',
        ) ??
      overlappingActiveArc(
        worldline,
        entities,
        effect.domain,
      );
    if (!arc) {
      arc = newArc(
        worldline,
        event,
        activeParentArcIds,
        effect,
      );
      transitionKind = 'opened';
    }
    applyEventToArc(
      arc,
      event,
      effect,
      worldline.anchors,
      factIds,
    );
  }

  worldline.eventArcIndex[event.id] = arc.id;
  if (effect.kind === 'terminate') {
    transitionKind = 'terminated';
    if (effect.scope === 'world') {
      for (const arcId of [...worldline.activeArcIds]) {
        terminateArc(
          worldline,
          worldline.arcs[arcId],
          effect.reasonCode,
        );
      }
      worldline.status = 'terminal';
      worldline.terminalReasonCode = effect.reasonCode;
    } else {
      terminateArc(worldline, arc, effect.reasonCode);
    }
  }
  const evidenceDigest = eventEvidenceDigest(event, factIds);
  worldline.sourceEvidenceIndex[event.id] = {
    eventState: 'live',
    factStates: Object.fromEntries(
      factIds.map((factId) => [
        factId,
        factId === `settled:${event.id}`
          ? 'event'
          : 'live',
      ]),
    ),
    evidenceDigest,
  };
  worldline.recentTransitions.push({
    eventId: event.id,
    eventType: event.type,
    kind: transitionKind,
    arcIds: [arc.id],
    decayedArcIds,
    factIds,
    atMs: worldline.anchors.moment.atMs,
    sequence,
    status: 'settled',
    evidenceDigest,
  });
  compactWorldline(worldline);
  recomputeDominance(worldline);
  return worldline;
}

export function worldlineStructuralFingerprint(worldline) {
  return JSON.stringify(stable(worldline));
}

export function archiveWorldlineSourceEvidence(
  worldline,
  { eventIds = [], factIds = [] } = {},
) {
  if (
    !worldline ||
    worldline.schema !== WORLDLINE_SCHEMA ||
    !worldline.sourceEvidenceIndex
  ) {
    return;
  }
  const archivedEventIds = new Set(eventIds);
  const archivedFactIds = new Set(factIds);
  for (const [eventId, source] of Object.entries(
    worldline.sourceEvidenceIndex,
  )) {
    if (archivedEventIds.has(eventId)) {
      source.eventState = 'archived';
    }
    for (const factId of Object.keys(source.factStates ?? {})) {
      if (archivedFactIds.has(factId)) {
        source.factStates[factId] = 'archived';
      }
    }
  }
}

function validStringArray(value, maximum = Infinity) {
  return (
    Array.isArray(value) &&
    value.length <= maximum &&
    value.every(
      (entry) => typeof entry === 'string' && entry.length > 0,
    )
  );
}

export function auditWorldlineState(
  worldline,
  {
    availableEventIds = null,
    availableFactIds = null,
  } = {},
) {
  const errors = [];
  if (
    !worldline ||
    worldline.schema !== WORLDLINE_SCHEMA ||
    typeof worldline.worldId !== 'string' ||
    !['emergent', 'terminal'].includes(worldline.status) ||
    !Number.isSafeInteger(worldline.totalSettledEvents) ||
    worldline.totalSettledEvents < 0 ||
    !Number.isSafeInteger(worldline.totalSettledFacts) ||
    worldline.totalSettledFacts <
      worldline.totalSettledEvents ||
    !Number.isSafeInteger(worldline.nextArcSequence) ||
    worldline.nextArcSequence < 1 ||
    !worldline.arcs ||
    Array.isArray(worldline.arcs) ||
    !worldline.sourceEvidenceIndex ||
    Array.isArray(worldline.sourceEvidenceIndex)
  ) {
    return {
      ok: false,
      errors: ['INVALID_WORLDLINE_STATE'],
    };
  }
  const active = new Set(worldline.activeArcIds ?? []);
  const terminal = new Set(worldline.terminalArcIds ?? []);
  const dominant = new Set(worldline.dominantArcIds ?? []);
  if (
    active.size !== (worldline.activeArcIds ?? []).length ||
    terminal.size !== (worldline.terminalArcIds ?? []).length ||
    dominant.size !==
      (worldline.dominantArcIds ?? []).length ||
    [...active].some((arcId) => terminal.has(arcId)) ||
    [...dominant].some((arcId) => !active.has(arcId)) ||
    worldline.activeArcIds.length > MAX_ACTIVE_ARCS ||
    worldline.terminalArcIds.length > MAX_TERMINAL_ARCS ||
    worldline.dominantArcIds.length > MAX_DOMINANT_ARCS ||
    (
      worldline.status === 'terminal' &&
      worldline.activeArcIds.length > 0
    )
  ) {
    errors.push('INVALID_WORLDLINE_ARC_INDEX');
  }
  for (const [arcId, arc] of Object.entries(worldline.arcs)) {
    if (
      arc?.id !== arcId ||
      typeof arc.domain !== 'string' ||
      !['active', 'terminal'].includes(arc.status) ||
      !Number.isSafeInteger(arc.settledEventCount) ||
      arc.settledEventCount < 1 ||
      !Number.isSafeInteger(arc.settledFactCount) ||
      arc.settledFactCount < arc.settledEventCount ||
      typeof arc.originEventId !== 'string' ||
      !validStringArray(
        arc.originEventIds,
        MAX_ARC_ORIGIN_EVENTS,
      ) ||
      !arc.originEventIds.includes(arc.originEventId) ||
      typeof arc.latestEventId !== 'string' ||
      typeof arc.latestEventType !== 'string' ||
      !validStringArray(
        arc.focusEntityIds,
        MAX_ARC_ENTITIES,
      ) ||
      !validStringArray(
        arc.eventTypes,
        MAX_ARC_EVENT_TYPES,
      ) ||
      !validStringArray(arc.factIds, MAX_ARC_FACTS) ||
      !validStringArray(
        arc.settledFactIds,
        MAX_ARC_FACTS,
      ) ||
      !validStringArray(arc.parentArcIds) ||
      !validStringArray(arc.childArcIds) ||
      !validStringArray(
        arc.unresolvedTensions,
        MAX_ARC_TENSIONS,
      ) ||
      !validStringArray(
        arc.resourceConstraints,
        MAX_ARC_CONSTRAINTS,
      ) ||
      !validStringArray(
        arc.branchingConditions,
        MAX_ARC_BRANCHING_CONDITIONS,
      ) ||
      !Array.isArray(arc.nextKnownDates) ||
      arc.nextKnownDates.length > MAX_ARC_KNOWN_DATES ||
      arc.nextKnownDates.some(
        (entry) =>
          !Number.isSafeInteger(entry?.atMs) ||
          entry.atMs < 0 ||
          typeof entry.kind !== 'string',
      ) ||
      typeof arc.evidenceDigest !== 'string' ||
      !Number.isSafeInteger(arc.dominanceScore) ||
      (
        arc.status === 'active' &&
        !active.has(arcId)
      ) ||
      (
        arc.status === 'terminal' &&
        !terminal.has(arcId)
      )
    ) {
      errors.push(`INVALID_WORLDLINE_ARC:${arcId}`);
    }
  }
  const expectedAnchorNames = [
    'moment',
    'session',
    'day',
    'week',
    'quarter',
    'era',
  ];
  for (const name of expectedAnchorNames) {
    const anchor = worldline.anchors?.[name];
    if (
      !anchor ||
      (
        name === 'moment'
          ? !Number.isSafeInteger(anchor.atMs) ||
            !Number.isSafeInteger(anchor.sequence)
          : !Number.isSafeInteger(
              anchor.index ?? anchor.dayIndex,
            )
      )
    ) {
      errors.push(`INVALID_WORLDLINE_ANCHOR:${name}`);
    }
  }
  if (
    !Array.isArray(worldline.recentTransitions) ||
    worldline.recentTransitions.length >
      MAX_RECENT_TRANSITIONS ||
    worldline.recentTransitions.some(
      (transition, index) =>
        transition?.status !== 'settled' ||
        typeof transition.eventId !== 'string' ||
        !Number.isSafeInteger(transition.sequence) ||
        !validStringArray(transition.factIds) ||
        transition.factIds.length === 0 ||
        typeof transition.evidenceDigest !== 'string' ||
        (
          index > 0 &&
          transition.sequence <=
            worldline.recentTransitions[index - 1].sequence
        ),
    )
  ) {
    errors.push('INVALID_WORLDLINE_TRANSITIONS');
  }
  for (const [eventId, arcId] of Object.entries(
    worldline.eventArcIndex ?? {},
  )) {
    const source =
      worldline.sourceEvidenceIndex[eventId];
    if (
      !worldline.arcs[arcId] ||
      !source ||
      !['live', 'archived'].includes(
        source.eventState,
      ) ||
      !source.factStates ||
      Object.keys(source.factStates).length === 0 ||
      Object.values(source.factStates).some(
        (state) =>
          !['live', 'archived', 'event'].includes(state),
      ) ||
      Object.entries(source.factStates).some(
        ([factId, state]) =>
          state === 'event' &&
          factId !== `settled:${eventId}`,
      ) ||
      typeof source.evidenceDigest !== 'string'
    ) {
      errors.push(
        `INVALID_WORLDLINE_EVENT_INDEX:${eventId}`,
      );
    }
  }
  const archive = worldline.archive;
  if (
    !archive ||
    !Number.isSafeInteger(archive.transitionCount) ||
    archive.transitionCount < 0 ||
    !Number.isSafeInteger(archive.arcCount) ||
    archive.arcCount < 0 ||
    !Number.isSafeInteger(archive.settledFactCount) ||
    archive.settledFactCount < 0 ||
    typeof archive.digest !== 'string'
  ) {
    errors.push('INVALID_WORLDLINE_ARCHIVE');
  }
  if (availableEventIds instanceof Set) {
    for (const [eventId, source] of Object.entries(
      worldline.sourceEvidenceIndex,
    )) {
      if (
        source.eventState === 'live' &&
        !availableEventIds.has(eventId)
      ) {
        errors.push(
          `WORLDLINE_SOURCE_MISMATCH:${eventId}`,
        );
      }
    }
  }
  if (availableFactIds instanceof Set) {
    for (const source of Object.values(
      worldline.sourceEvidenceIndex,
    )) {
      for (const [factId, state] of Object.entries(
        source.factStates ?? {},
      )) {
        if (
          state === 'live' &&
          !factId.startsWith('settled:') &&
          !availableFactIds.has(factId)
        ) {
          errors.push(
            `WORLDLINE_FACT_SOURCE_MISMATCH:${factId}`,
          );
        }
      }
    }
  }
  const uniqueErrors = [...new Set(errors)];
  return {
    ok: uniqueErrors.length === 0,
    errors: uniqueErrors,
  };
}

function upgradeLegacyWorldline(worldline, context) {
  const upgraded = clone(worldline);
  upgraded.schema = WORLDLINE_SCHEMA;
  upgraded.totalSettledFacts = Math.max(
    upgraded.totalSettledEvents ?? 0,
    (upgraded.recentTransitions ?? []).reduce(
      (sum, transition) =>
        sum + Math.max(1, transition.factIds?.length ?? 0),
      upgraded.archive?.transitionCount ?? 0,
    ),
  );
  upgraded.dominantArcIds = [];
  upgraded.sourceEvidenceIndex = {};
  upgraded.archive ??= {};
  upgraded.archive.settledFactCount ??= 0;
  for (const arc of Object.values(upgraded.arcs ?? {})) {
    const fallbackFactId = `settled:${arc.latestEventId}`;
    arc.domain ??= eventDomain({
      type: arc.latestEventType,
    });
    arc.originEventIds = strings([
      ...(arc.originEventIds ?? []),
      arc.originEventId,
    ]);
    arc.settledFactIds = strings([
      ...(arc.settledFactIds ?? []),
      ...(arc.factIds ?? []),
      ...((arc.factIds ?? []).length === 0
        ? [fallbackFactId]
        : []),
    ]);
    arc.factIds = [...arc.settledFactIds];
    arc.settledFactCount = Math.max(
      arc.settledEventCount,
      arc.settledFactIds.length,
    );
    arc.unresolvedTensions ??= [];
    arc.resourceConstraints ??= [];
    arc.branchingConditions ??= [];
    arc.nextKnownDates ??= [];
    arc.evidenceDigest ??= hashText(
      `${arc.originEventId}|${arc.latestEventId}|${arc.settledEventCount}`,
    );
    arc.dominanceScore ??= 0;
  }
  for (const transition of upgraded.recentTransitions ?? []) {
    if (!Array.isArray(transition.factIds)) {
      transition.factIds = [];
    }
    if (transition.factIds.length === 0) {
      transition.factIds = [
        `settled:${transition.eventId}`,
      ];
    }
    transition.decayedArcIds ??= [];
    transition.evidenceDigest ??= hashText(
      `${transition.eventId}|${transition.eventType}|${transition.atMs}`,
    );
    upgraded.sourceEvidenceIndex[transition.eventId] = {
      eventState: context.availableEventIds.has(
        transition.eventId,
      )
        ? 'live'
        : 'archived',
      factStates: Object.fromEntries(
        transition.factIds.map((factId) => [
          factId,
          factId === `settled:${transition.eventId}`
            ? 'event'
            : factId.startsWith('settled:') ||
          !context.availableFactIds.has(factId)
            ? 'archived'
            : 'live',
        ]),
      ),
      evidenceDigest: transition.evidenceDigest,
    };
  }
  for (const eventId of Object.keys(
    upgraded.eventArcIndex ?? {},
  )) {
    upgraded.sourceEvidenceIndex[eventId] ??= {
      eventState: context.availableEventIds.has(eventId)
        ? 'live'
        : 'archived',
      factStates: {
        [`settled:${eventId}`]: 'event',
      },
      evidenceDigest: hashText(eventId),
    };
  }
  recomputeDominance(upgraded);
  return upgraded;
}

function sourceContext(worldState) {
  return {
    availableEventIds: new Set(
      (worldState.eventLog ?? []).map((event) => event.id),
    ),
    availableFactIds: new Set(
      (worldState.facts ?? []).map((fact) => fact.id),
    ),
  };
}

export function normalizeWorldlineState(worldState) {
  if (!worldState?.world?.id) {
    throw new TypeError(
      'A complete authoritative world is required',
    );
  }
  const context = sourceContext(worldState);
  if (worldState.worldline?.schema === WORLDLINE_SCHEMA) {
    const audit = auditWorldlineState(
      worldState.worldline,
      context,
    );
    if (audit.ok) return worldState.worldline;
    throw new Error(audit.errors.join(';'));
  }
  if (
    worldState.worldline?.schema ===
    LEGACY_WORLDLINE_SCHEMA
  ) {
    const upgraded = upgradeLegacyWorldline(
      worldState.worldline,
      context,
    );
    const audit = auditWorldlineState(upgraded, context);
    if (!audit.ok) {
      throw new Error(audit.errors.join(';'));
    }
    worldState.worldline = upgraded;
    return upgraded;
  }
  const factsByEventId = new Map();
  for (const fact of worldState.facts ?? []) {
    if (typeof fact.eventId !== 'string') continue;
    const factIds = factsByEventId.get(fact.eventId) ?? [];
    factIds.push(fact.id);
    factsByEventId.set(fact.eventId, factIds);
  }
  let rebuilt = createWorldlineState({
    worldId: worldState.world.id,
    worldSeed: worldState.world.seed,
  });
  for (const event of [...(worldState.eventLog ?? [])].sort(
    (left, right) =>
      eventAtMs(left) - eventAtMs(right) ||
      String(left.id).localeCompare(String(right.id)),
  )) {
    const linkedFacts = strings([
      ...eventFacts(event),
      ...(factsByEventId.get(event.id) ?? []),
    ]);
    rebuilt = advanceWorldlineState(rebuilt, {
      ...event,
      factIds:
        linkedFacts.length > 0
          ? linkedFacts
          : [`settled:${event.id}`],
    });
  }
  worldState.worldline = rebuilt;
  return rebuilt;
}

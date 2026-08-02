export const OPEN_WORLD_CITY_SCHEMA = 'lzy-open-world-city-life-v1';
export const OPEN_WORLD_INTENT_SCHEMA = 'lzy-open-world-intent-v1';

export const OPEN_WORLD_CITY_LIMITS = Object.freeze({
  placeStates: 16,
  visibleActors: 32,
  visibleCohorts: 12,
  routeOptions: 24,
  entryOptions: 16,
  executableOffers: 24,
  activityOptions: 24,
  transitRuns: 12,
  assetAffordances: 32,
  commitments: 32,
  settledConsequences: 32,
});

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function boundedEntries(value, limit) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function boundedEntryCount(value, limit) {
  return Array.isArray(value) ? Math.min(value.length, limit) : 0;
}

function text(value) {
  return typeof value === 'string' && value.length > 0;
}

function integer(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function observable(entry, recipientId) {
  return (
    Array.isArray(entry?.observableBy) &&
    entry.observableBy.includes(recipientId)
  );
}

function validAuthoritySnapshot(observation) {
  return (
    observation !== null &&
    typeof observation === 'object' &&
    text(observation.worldId) &&
    text(observation.worldEpoch) &&
    integer(observation.authorityCommitSeq) &&
    integer(observation.virtualTime) &&
    text(observation.recipientId)
  );
}

function projectPlaceState(entry) {
  if (
    !text(entry?.placeId) ||
    !integer(entry.stateVersion, 1) ||
    !text(entry.operatorId) ||
    !['open', 'closed', 'limited', 'under_work'].includes(entry.openState) ||
    !integer(entry.occupancy) ||
    !integer(entry.capacity, 1) ||
    entry.occupancy > entry.capacity ||
    !integer(entry.nextChangeAtVirtualTime)
  ) {
    return null;
  }
  return {
    placeId: entry.placeId,
    stateVersion: entry.stateVersion,
    operatorId: entry.operatorId,
    openState: entry.openState,
    occupancy: entry.occupancy,
    capacity: entry.capacity,
    nextChangeAtVirtualTime: entry.nextChangeAtVirtualTime,
  };
}

function projectVisibleActor(entry, recipientId) {
  if (
    !observable(entry, recipientId) ||
    !text(entry.actorId) ||
    !integer(entry.actorVersion, 1) ||
    !text(entry.labelZh) ||
    !text(entry.placeId) ||
    !text(entry.activityKind)
  ) {
    return null;
  }
  return {
    actorId: entry.actorId,
    actorVersion: entry.actorVersion,
    labelZh: entry.labelZh,
    placeId: entry.placeId,
    activityKind: entry.activityKind,
  };
}

function projectVisibleCohort(entry, recipientId) {
  if (
    !observable(entry, recipientId) ||
    !text(entry.cohortId) ||
    !integer(entry.cohortVersion, 1) ||
    !text(entry.labelZh) ||
    !text(entry.placeId) ||
    !text(entry.activityKind) ||
    !integer(entry.count, 1)
  ) {
    return null;
  }
  return {
    cohortId: entry.cohortId,
    cohortVersion: entry.cohortVersion,
    labelZh: entry.labelZh,
    placeId: entry.placeId,
    activityKind: entry.activityKind,
    count: entry.count,
  };
}

function projectRoute(entry) {
  if (
    !text(entry?.routeId) ||
    !integer(entry.routeVersion, 1) ||
    !text(entry.fromPlaceId) ||
    !text(entry.toPlaceId) ||
    !text(entry.travelMode) ||
    !integer(entry.minimumDurationMs, 1) ||
    entry.availability !== 'available'
  ) {
    return null;
  }
  return {
    routeId: entry.routeId,
    routeVersion: entry.routeVersion,
    fromPlaceId: entry.fromPlaceId,
    toPlaceId: entry.toPlaceId,
    travelMode: entry.travelMode,
    minimumDurationMs: entry.minimumDurationMs,
    availability: entry.availability,
  };
}

function projectEntryOption(entry) {
  if (
    !text(entry?.portalId) ||
    !integer(entry.portalVersion, 1) ||
    !text(entry.fromPlaceId) ||
    !text(entry.toPlaceId) ||
    entry.availability !== 'open' ||
    entry.accessState !== 'granted' ||
    !integer(entry.minimumDurationMs, 1)
  ) {
    return null;
  }
  return {
    portalId: entry.portalId,
    portalVersion: entry.portalVersion,
    fromPlaceId: entry.fromPlaceId,
    toPlaceId: entry.toPlaceId,
    availability: entry.availability,
    accessState: entry.accessState,
    minimumDurationMs: entry.minimumDurationMs,
  };
}

function projectOffer(entry, virtualTime) {
  if (
    !text(entry?.offerId) ||
    !integer(entry.offerVersion, 1) ||
    !text(entry.offerBookId) ||
    !text(entry.makerId) ||
    !text(entry.placeId) ||
    !text(entry.subjectId) ||
    !integer(entry.unitPriceCents) ||
    !integer(entry.availableQuantity, 1) ||
    !integer(entry.minimumDurationMs, 1) ||
    !integer(entry.expiresAtVirtualTime) ||
    entry.expiresAtVirtualTime <= virtualTime ||
    !Array.isArray(entry.rightsOffered) ||
    entry.rightsOffered.length === 0 ||
    !entry.rightsOffered.every(text)
  ) {
    return null;
  }
  return {
    offerId: entry.offerId,
    offerVersion: entry.offerVersion,
    offerBookId: entry.offerBookId,
    makerId: entry.makerId,
    placeId: entry.placeId,
    subjectId: entry.subjectId,
    unitPriceCents: entry.unitPriceCents,
    availableQuantity: entry.availableQuantity,
    minimumDurationMs: entry.minimumDurationMs,
    expiresAtVirtualTime: entry.expiresAtVirtualTime,
    rightsOffered: [...entry.rightsOffered],
  };
}

function projectActivity(entry, virtualTime) {
  if (
    !text(entry?.activityId) ||
    !integer(entry.activityVersion, 1) ||
    !text(entry.organizerId) ||
    !text(entry.placeId) ||
    !integer(entry.startsAtVirtualTime, virtualTime) ||
    !integer(entry.endsAtVirtualTime) ||
    entry.endsAtVirtualTime <= entry.startsAtVirtualTime ||
    !integer(entry.availableCapacity, 1) ||
    !integer(entry.minimumDurationMs, 1) ||
    !Array.isArray(entry.requiredAssetIds) ||
    !entry.requiredAssetIds.every(text)
  ) {
    return null;
  }
  return {
    activityId: entry.activityId,
    activityVersion: entry.activityVersion,
    organizerId: entry.organizerId,
    placeId: entry.placeId,
    startsAtVirtualTime: entry.startsAtVirtualTime,
    endsAtVirtualTime: entry.endsAtVirtualTime,
    availableCapacity: entry.availableCapacity,
    minimumDurationMs: entry.minimumDurationMs,
    requiredAssetIds: [...entry.requiredAssetIds],
  };
}

function projectTransitRun(entry, virtualTime) {
  if (
    !text(entry?.runId) ||
    !integer(entry.runVersion, 1) ||
    !text(entry.operatorId) ||
    !text(entry.fromPlaceId) ||
    !text(entry.toPlaceId) ||
    !integer(entry.departsAtVirtualTime, virtualTime) ||
    !integer(entry.arrivesAtVirtualTime) ||
    entry.arrivesAtVirtualTime <= entry.departsAtVirtualTime ||
    !integer(entry.availableSeats, 1) ||
    !integer(entry.fareCents)
  ) {
    return null;
  }
  return {
    runId: entry.runId,
    runVersion: entry.runVersion,
    operatorId: entry.operatorId,
    fromPlaceId: entry.fromPlaceId,
    toPlaceId: entry.toPlaceId,
    departsAtVirtualTime: entry.departsAtVirtualTime,
    arrivesAtVirtualTime: entry.arrivesAtVirtualTime,
    availableSeats: entry.availableSeats,
    fareCents: entry.fareCents,
  };
}

function projectAsset(entry, actorId) {
  if (
    !text(entry?.assetId) ||
    !integer(entry.assetVersion, 1) ||
    !text(entry.definitionId) ||
    !text(entry.ownerId) ||
    !Array.isArray(entry.controllerIds) ||
    !entry.controllerIds.includes(actorId) ||
    !entry.controllerIds.every(text) ||
    !text(entry.custodyId) ||
    !text(entry.placeId) ||
    !Array.isArray(entry.affordances) ||
    entry.affordances.length === 0
  ) {
    return null;
  }
  const affordances = entry.affordances
    .filter(
      (affordance) =>
        text(affordance?.affordanceId) &&
        integer(affordance.minimumDurationMs, 1),
    )
    .map((affordance) => ({
      affordanceId: affordance.affordanceId,
      minimumDurationMs: affordance.minimumDurationMs,
    }));
  if (affordances.length === 0) return null;
  return {
    assetId: entry.assetId,
    assetVersion: entry.assetVersion,
    definitionId: entry.definitionId,
    ownerId: entry.ownerId,
    controllerIds: [...entry.controllerIds],
    custodyId: entry.custodyId,
    placeId: entry.placeId,
    affordances,
  };
}

function projectCommitment(entry, actorId, virtualTime) {
  if (
    entry?.actorId !== actorId ||
    !text(entry.commitmentId) ||
    !integer(entry.commitmentVersion, 1) ||
    !text(entry.placeId) ||
    !integer(entry.startsAtVirtualTime) ||
    !integer(entry.endsAtVirtualTime) ||
    entry.endsAtVirtualTime <= virtualTime ||
    entry.endsAtVirtualTime <= entry.startsAtVirtualTime
  ) {
    return null;
  }
  return {
    commitmentId: entry.commitmentId,
    commitmentVersion: entry.commitmentVersion,
    placeId: entry.placeId,
    startsAtVirtualTime: entry.startsAtVirtualTime,
    endsAtVirtualTime: entry.endsAtVirtualTime,
  };
}

function projectSettledConsequence(entry, observation) {
  if (
    entry?.status !== 'settled' ||
    !observable(entry, observation.recipientId) ||
    !text(entry.eventId) ||
    !integer(entry.commitSeq) ||
    entry.commitSeq > observation.authorityCommitSeq ||
    !text(entry.eventKind) ||
    !text(entry.actorId) ||
    !text(entry.placeId) ||
    !integer(entry.occurredAtVirtualTime) ||
    entry.occurredAtVirtualTime > observation.virtualTime ||
    !Array.isArray(entry.consequenceRefs) ||
    entry.consequenceRefs.length === 0 ||
    !entry.consequenceRefs.every(text)
  ) {
    return null;
  }
  return {
    eventId: entry.eventId,
    commitSeq: entry.commitSeq,
    eventKind: entry.eventKind,
    actorId: entry.actorId,
    placeId: entry.placeId,
    occurredAtVirtualTime: entry.occurredAtVirtualTime,
    consequenceRefs: [...entry.consequenceRefs],
  };
}

function compact(entries) {
  return entries.filter((entry) => entry !== null);
}

export function projectOpenWorldCityLife(observation) {
  if (!validAuthoritySnapshot(observation)) {
    throw new TypeError('OPEN_WORLD_CITY_INVALID_AUTHORITY_SNAPSHOT');
  }
  const actor = observation.actor;
  if (
    actor === null ||
    typeof actor !== 'object' ||
    !text(actor.actorId) ||
    actor.actorId !== observation.recipientId ||
    !text(actor.currentPlaceId) ||
    !text(actor.cashAccountId) ||
    !integer(actor.availableCashCents)
  ) {
    throw new TypeError('OPEN_WORLD_CITY_INVALID_RECIPIENT_ACTOR');
  }
  const environment = observation.environment;
  if (
    environment === null ||
    typeof environment !== 'object' ||
    !integer(environment.environmentVersion, 1) ||
    !text(environment.dayPhase) ||
    !text(environment.weather) ||
    !text(environment.trafficBand) ||
    !text(environment.footfallBand)
  ) {
    throw new TypeError('OPEN_WORLD_CITY_INVALID_ENVIRONMENT_FACTS');
  }

  const placeStates = compact(
    boundedEntries(observation.placeStates, OPEN_WORLD_CITY_LIMITS.placeStates)
      .map(projectPlaceState),
  );
  const visibleActors = compact(
    boundedEntries(
      observation.visibleActors,
      OPEN_WORLD_CITY_LIMITS.visibleActors,
    ).map((entry) => projectVisibleActor(entry, observation.recipientId)),
  );
  const visibleCohorts = compact(
    boundedEntries(
      observation.visibleCohorts,
      OPEN_WORLD_CITY_LIMITS.visibleCohorts,
    ).map((entry) => projectVisibleCohort(entry, observation.recipientId)),
  );
  const routeOptions = compact(
    boundedEntries(observation.routeOptions, OPEN_WORLD_CITY_LIMITS.routeOptions)
      .map(projectRoute),
  );
  const entryOptions = compact(
    boundedEntries(observation.entryOptions, OPEN_WORLD_CITY_LIMITS.entryOptions)
      .map(projectEntryOption),
  );
  const executableOffers = compact(
    boundedEntries(
      observation.executableOffers,
      OPEN_WORLD_CITY_LIMITS.executableOffers,
    ).map((entry) => projectOffer(entry, observation.virtualTime)),
  );
  const activityOptions = compact(
    boundedEntries(observation.activities, OPEN_WORLD_CITY_LIMITS.activityOptions)
      .map((entry) => projectActivity(entry, observation.virtualTime)),
  );
  const transitRuns = compact(
    boundedEntries(observation.transitRuns, OPEN_WORLD_CITY_LIMITS.transitRuns)
      .map((entry) => projectTransitRun(entry, observation.virtualTime)),
  );
  const assetAffordances = compact(
    boundedEntries(observation.assets, OPEN_WORLD_CITY_LIMITS.assetAffordances)
      .map((entry) => projectAsset(entry, actor.actorId)),
  );
  const commitments = compact(
    boundedEntries(observation.commitments, OPEN_WORLD_CITY_LIMITS.commitments)
      .map((entry) =>
        projectCommitment(entry, actor.actorId, observation.virtualTime),
      ),
  );
  const settledConsequences = compact(
    boundedEntries(
      observation.settledResults,
      OPEN_WORLD_CITY_LIMITS.settledConsequences,
    ).map((entry) => projectSettledConsequence(entry, observation)),
  );
  const activeEntriesRead =
    1 +
    boundedEntryCount(
      observation.placeStates,
      OPEN_WORLD_CITY_LIMITS.placeStates,
    ) +
    boundedEntryCount(
      observation.visibleActors,
      OPEN_WORLD_CITY_LIMITS.visibleActors,
    ) +
    boundedEntryCount(
      observation.visibleCohorts,
      OPEN_WORLD_CITY_LIMITS.visibleCohorts,
    ) +
    boundedEntryCount(
      observation.routeOptions,
      OPEN_WORLD_CITY_LIMITS.routeOptions,
    ) +
    boundedEntryCount(
      observation.entryOptions,
      OPEN_WORLD_CITY_LIMITS.entryOptions,
    ) +
    boundedEntryCount(
      observation.executableOffers,
      OPEN_WORLD_CITY_LIMITS.executableOffers,
    ) +
    boundedEntryCount(
      observation.activities,
      OPEN_WORLD_CITY_LIMITS.activityOptions,
    ) +
    boundedEntryCount(
      observation.transitRuns,
      OPEN_WORLD_CITY_LIMITS.transitRuns,
    ) +
    boundedEntryCount(
      observation.assets,
      OPEN_WORLD_CITY_LIMITS.assetAffordances,
    ) +
    boundedEntryCount(
      observation.commitments,
      OPEN_WORLD_CITY_LIMITS.commitments,
    ) +
    boundedEntryCount(
      observation.settledResults,
      OPEN_WORLD_CITY_LIMITS.settledConsequences,
    );

  return deepFreeze({
    schema: OPEN_WORLD_CITY_SCHEMA,
    worldId: observation.worldId,
    worldEpoch: observation.worldEpoch,
    authorityCommitSeq: observation.authorityCommitSeq,
    virtualTime: observation.virtualTime,
    recipientId: observation.recipientId,
    actor: {
      actorId: actor.actorId,
      currentPlaceId: actor.currentPlaceId,
      cashAccountId: actor.cashAccountId,
      availableCashCents: actor.availableCashCents,
    },
    environment: {
      environmentVersion: environment.environmentVersion,
      dayPhase: environment.dayPhase,
      weather: environment.weather,
      trafficBand: environment.trafficBand,
      footfallBand: environment.footfallBand,
    },
    placeStates,
    visibleActors,
    visibleCohorts,
    routeOptions,
    entryOptions,
    executableOffers,
    activityOptions,
    transitRuns,
    assetAffordances,
    commitments,
    settledConsequences,
    hotPathTrace: {
      coldHistoryReads: 0,
      activeEntriesRead,
    },
  });
}

function blockedIntent(projection, actorId, code, details = {}) {
  return deepFreeze({
    schema: OPEN_WORLD_INTENT_SCHEMA,
    status: 'blocked',
    authorityTarget: 'worker_controller',
    worldId: projection.worldId,
    worldEpoch: projection.worldEpoch,
    recipientId: projection.recipientId,
    actorId,
    baseCommitSeq: projection.authorityCommitSeq,
    issuedAtVirtualTime: projection.virtualTime,
    code,
    ...details,
  });
}

function candidateIntent(projection, actorId, intent) {
  return deepFreeze({
    schema: OPEN_WORLD_INTENT_SCHEMA,
    status: 'candidate',
    authorityTarget: 'worker_controller',
    requiresAuthoritySettlement: true,
    worldId: projection.worldId,
    worldEpoch: projection.worldEpoch,
    recipientId: projection.recipientId,
    actorId,
    baseCommitSeq: projection.authorityCommitSeq,
    issuedAtVirtualTime: projection.virtualTime,
    intent,
  });
}

function actorMismatch(projection, request) {
  return request.actorId !== projection.actor.actorId;
}

function overlappingCommitments(projection, startsAt, endsAt) {
  return projection.commitments.filter(
    (commitment) =>
      startsAt < commitment.endsAtVirtualTime &&
      commitment.startsAtVirtualTime < endsAt,
  );
}

export function compileOpenWorldCityIntent(projection, request) {
  if (request === null || typeof request !== 'object') {
    return blockedIntent(
      projection,
      projection.actor.actorId,
      'INVALID_INTENT_REQUEST',
    );
  }
  const supported = [
    'move_to',
    'enter_place',
    'accept_offer',
    'join_activity',
    'board_transit',
    'use_asset',
  ];
  if (!supported.includes(request.kind)) {
    return blockedIntent(
      projection,
      request.actorId,
      'UNSUPPORTED_INTENT',
    );
  }
  if (actorMismatch(projection, request)) {
    return blockedIntent(
      projection,
      request.actorId,
      'RECIPIENT_ACTOR_MISMATCH',
    );
  }

  if (request.kind === 'move_to') {
    const route = projection.routeOptions.find(
      (entry) => entry.routeId === request.routeId,
    );
    if (!route) {
      return blockedIntent(
        projection,
        request.actorId,
        'NO_AVAILABLE_ROUTE',
      );
    }
    if (route.routeVersion !== request.routeVersion) {
      return blockedIntent(
        projection,
        request.actorId,
        'STALE_ROUTE_REFERENCE',
      );
    }
    if (
      route.fromPlaceId !== projection.actor.currentPlaceId ||
      route.toPlaceId !== request.toPlaceId
    ) {
      return blockedIntent(
        projection,
        request.actorId,
        'ROUTE_NOT_FROM_ACTOR_PLACE',
      );
    }
    return candidateIntent(projection, request.actorId, {
      kind: 'move_to',
      routeRef: {
        routeId: route.routeId,
        routeVersion: route.routeVersion,
        fromPlaceId: route.fromPlaceId,
        toPlaceId: route.toPlaceId,
        travelMode: route.travelMode,
      },
      minimumDurationMs: route.minimumDurationMs,
      expectedSettledEventKinds: ['ActorArrived'],
    });
  }

  if (request.kind === 'enter_place') {
    const portal = projection.entryOptions.find(
      (entry) => entry.portalId === request.portalId,
    );
    if (!portal) {
      return blockedIntent(
        projection,
        request.actorId,
        'NO_AVAILABLE_ENTRY',
      );
    }
    if (portal.portalVersion !== request.portalVersion) {
      return blockedIntent(
        projection,
        request.actorId,
        'STALE_PORTAL_REFERENCE',
      );
    }
    if (
      portal.fromPlaceId !== projection.actor.currentPlaceId ||
      portal.toPlaceId !== request.toPlaceId
    ) {
      return blockedIntent(
        projection,
        request.actorId,
        'ENTRY_NOT_FROM_ACTOR_PLACE',
      );
    }
    return candidateIntent(projection, request.actorId, {
      kind: 'enter_place',
      portalRef: {
        portalId: portal.portalId,
        portalVersion: portal.portalVersion,
        fromPlaceId: portal.fromPlaceId,
        toPlaceId: portal.toPlaceId,
        availability: portal.availability,
        accessState: portal.accessState,
      },
      minimumDurationMs: portal.minimumDurationMs,
      expectedSettledEventKinds: ['PortalTraversed'],
    });
  }

  if (request.kind === 'accept_offer') {
    const offer = projection.executableOffers.find(
      (entry) => entry.offerId === request.offerId,
    );
    if (!offer) {
      return blockedIntent(
        projection,
        request.actorId,
        'NO_EXECUTABLE_COUNTERPARTY',
      );
    }
    if (offer.offerVersion !== request.offerVersion) {
      return blockedIntent(
        projection,
        request.actorId,
        'STALE_OFFER_REFERENCE',
      );
    }
    if (offer.placeId !== projection.actor.currentPlaceId) {
      return blockedIntent(
        projection,
        request.actorId,
        'ACTOR_NOT_AT_OFFER_PLACE',
      );
    }
    if (!integer(request.quantity, 1)) {
      return blockedIntent(
        projection,
        request.actorId,
        'INVALID_QUANTITY',
      );
    }
    if (request.quantity > offer.availableQuantity) {
      return blockedIntent(
        projection,
        request.actorId,
        'INSUFFICIENT_OFFER_QUANTITY',
      );
    }
    const maximumDebitCents = offer.unitPriceCents * request.quantity;
    if (!Number.isSafeInteger(maximumDebitCents)) {
      return blockedIntent(
        projection,
        request.actorId,
        'UNSAFE_DEBIT_LIMIT',
      );
    }
    if (maximumDebitCents > projection.actor.availableCashCents) {
      return blockedIntent(
        projection,
        request.actorId,
        'INSUFFICIENT_VISIBLE_FUNDS',
      );
    }
    return candidateIntent(projection, request.actorId, {
      kind: 'accept_offer',
      offerRef: {
        offerId: offer.offerId,
        offerVersion: offer.offerVersion,
        offerBookId: offer.offerBookId,
        makerId: offer.makerId,
        placeId: offer.placeId,
        subjectId: offer.subjectId,
        unitPriceCents: offer.unitPriceCents,
        expiresAtVirtualTime: offer.expiresAtVirtualTime,
      },
      quantity: request.quantity,
      payerAccountId: projection.actor.cashAccountId,
      maximumDebitCents,
      requestedRights: [...offer.rightsOffered],
      minimumDurationMs: offer.minimumDurationMs,
      expectedSettledEventKinds: ['OfferSettled'],
    });
  }

  if (request.kind === 'join_activity') {
    const activity = projection.activityOptions.find(
      (entry) => entry.activityId === request.activityId,
    );
    if (!activity) {
      return blockedIntent(
        projection,
        request.actorId,
        'NO_AVAILABLE_ACTIVITY',
      );
    }
    if (activity.activityVersion !== request.activityVersion) {
      return blockedIntent(
        projection,
        request.actorId,
        'STALE_ACTIVITY_REFERENCE',
      );
    }
    if (activity.placeId !== projection.actor.currentPlaceId) {
      return blockedIntent(
        projection,
        request.actorId,
        'ACTOR_NOT_AT_ACTIVITY_PLACE',
      );
    }
    const conflicts = overlappingCommitments(
      projection,
      activity.startsAtVirtualTime,
      activity.endsAtVirtualTime,
    );
    if (conflicts.length > 0) {
      return blockedIntent(projection, request.actorId, 'TIME_CONFLICT', {
        blockingRefs: conflicts.map((entry) => entry.commitmentId),
      });
    }
    const availableAssetIds = new Set(
      projection.assetAffordances
        .filter((asset) => asset.placeId === projection.actor.currentPlaceId)
        .map((asset) => asset.assetId),
    );
    if (
      activity.requiredAssetIds.some(
        (assetId) => !availableAssetIds.has(assetId),
      )
    ) {
      return blockedIntent(
        projection,
        request.actorId,
        'REQUIRED_ASSET_UNAVAILABLE',
      );
    }
    return candidateIntent(projection, request.actorId, {
      kind: 'join_activity',
      activityRef: {
        activityId: activity.activityId,
        activityVersion: activity.activityVersion,
        organizerId: activity.organizerId,
        placeId: activity.placeId,
        startsAtVirtualTime: activity.startsAtVirtualTime,
        endsAtVirtualTime: activity.endsAtVirtualTime,
        availableCapacity: activity.availableCapacity,
      },
      requiredAssetIds: [...activity.requiredAssetIds],
      minimumDurationMs: activity.minimumDurationMs,
      expectedSettledEventKinds: ['ActivityStarted'],
    });
  }

  if (request.kind === 'board_transit') {
    const run = projection.transitRuns.find(
      (entry) => entry.runId === request.runId,
    );
    if (!run) {
      return blockedIntent(
        projection,
        request.actorId,
        'NO_AVAILABLE_TRANSIT_RUN',
      );
    }
    if (run.runVersion !== request.runVersion) {
      return blockedIntent(
        projection,
        request.actorId,
        'STALE_TRANSIT_REFERENCE',
      );
    }
    if (run.fromPlaceId !== projection.actor.currentPlaceId) {
      return blockedIntent(
        projection,
        request.actorId,
        'ACTOR_NOT_AT_TRANSIT_STOP',
      );
    }
    if (!integer(request.seats, 1)) {
      return blockedIntent(
        projection,
        request.actorId,
        'INVALID_SEAT_QUANTITY',
      );
    }
    if (request.seats > run.availableSeats) {
      return blockedIntent(
        projection,
        request.actorId,
        'INSUFFICIENT_TRANSIT_CAPACITY',
      );
    }
    const maximumDebitCents = run.fareCents * request.seats;
    if (!Number.isSafeInteger(maximumDebitCents)) {
      return blockedIntent(
        projection,
        request.actorId,
        'UNSAFE_DEBIT_LIMIT',
      );
    }
    if (maximumDebitCents > projection.actor.availableCashCents) {
      return blockedIntent(
        projection,
        request.actorId,
        'INSUFFICIENT_VISIBLE_FUNDS',
      );
    }
    return candidateIntent(projection, request.actorId, {
      kind: 'board_transit',
      runRef: {
        runId: run.runId,
        runVersion: run.runVersion,
        operatorId: run.operatorId,
        fromPlaceId: run.fromPlaceId,
        toPlaceId: run.toPlaceId,
        departsAtVirtualTime: run.departsAtVirtualTime,
        arrivesAtVirtualTime: run.arrivesAtVirtualTime,
        availableSeats: run.availableSeats,
        fareCents: run.fareCents,
      },
      seats: request.seats,
      payerAccountId: projection.actor.cashAccountId,
      maximumDebitCents,
      minimumDurationMs:
        run.arrivesAtVirtualTime - run.departsAtVirtualTime,
      expectedSettledEventKinds: ['TransitBoarded', 'TravelLegCompleted'],
    });
  }

  const asset = projection.assetAffordances.find(
    (entry) => entry.assetId === request.assetId,
  );
  if (!asset) {
    return blockedIntent(
      projection,
      request.actorId,
      'NO_CONTROLLABLE_ASSET',
    );
  }
  if (asset.assetVersion !== request.assetVersion) {
    return blockedIntent(
      projection,
      request.actorId,
      'STALE_ASSET_REFERENCE',
    );
  }
  if (asset.placeId !== projection.actor.currentPlaceId) {
    return blockedIntent(
      projection,
      request.actorId,
      'ASSET_NOT_AT_ACTOR_PLACE',
    );
  }
  const affordance = asset.affordances.find(
    (entry) => entry.affordanceId === request.affordanceId,
  );
  if (!affordance) {
    return blockedIntent(
      projection,
      request.actorId,
      'AFFORDANCE_NOT_GRANTED',
    );
  }
  return candidateIntent(projection, request.actorId, {
    kind: 'use_asset',
    assetRef: {
      assetId: asset.assetId,
      assetVersion: asset.assetVersion,
      definitionId: asset.definitionId,
      ownerId: asset.ownerId,
      custodyId: asset.custodyId,
      placeId: asset.placeId,
    },
    affordanceId: affordance.affordanceId,
    minimumDurationMs: affordance.minimumDurationMs,
    expectedSettledEventKinds: ['AssetUseStarted'],
  });
}

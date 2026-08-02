export const ENTERTAINMENT_AGENCY_SCHEMA = 'lzy-entertainment-agency-v1';
export const ENTERTAINMENT_INTENT_SCHEMA = 'lzy-entertainment-intent-v1';
export const ENTERTAINMENT_AGENCY_LIMITS = Object.freeze({
  executableOffers: 24,
  assetAffordances: 32,
  activityOptions: 24,
  commitments: 32,
});

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isSafeIntegerAtLeast(value, minimum) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function boundedEntries(entries, limit) {
  return Array.isArray(entries) ? entries.slice(0, limit) : [];
}

function isExecutableOffer(offer, virtualTime) {
  return (
    offer !== null &&
    typeof offer === 'object' &&
    isNonEmptyString(offer.offerId) &&
    isSafeIntegerAtLeast(offer.offerVersion, 1) &&
    isNonEmptyString(offer.kind) &&
    isNonEmptyString(offer.makerId) &&
    isNonEmptyString(offer.placeId) &&
    isNonEmptyString(offer.subjectId) &&
    isSafeIntegerAtLeast(offer.unitPriceCents, 0) &&
    isSafeIntegerAtLeast(offer.availableQuantity, 1) &&
    isSafeIntegerAtLeast(offer.expiresAtVirtualTime, 0) &&
    offer.expiresAtVirtualTime > virtualTime &&
    Array.isArray(offer.rightsOffered) &&
    offer.rightsOffered.every(isNonEmptyString)
  );
}

function projectOffer(offer) {
  return {
    offerId: offer.offerId,
    offerVersion: offer.offerVersion,
    kind: offer.kind,
    makerId: offer.makerId,
    placeId: offer.placeId,
    subjectId: offer.subjectId,
    unitPriceCents: offer.unitPriceCents,
    availableQuantity: offer.availableQuantity,
    expiresAtVirtualTime: offer.expiresAtVirtualTime,
    rightsOffered: [...offer.rightsOffered],
  };
}

function isControllableAsset(asset, actorId) {
  return (
    asset !== null &&
    typeof asset === 'object' &&
    isNonEmptyString(asset.assetId) &&
    isSafeIntegerAtLeast(asset.assetVersion, 1) &&
    isNonEmptyString(asset.definitionId) &&
    isNonEmptyString(asset.ownerId) &&
    Array.isArray(asset.controllerIds) &&
    asset.controllerIds.includes(actorId) &&
    asset.controllerIds.every(isNonEmptyString) &&
    isNonEmptyString(asset.custodyId) &&
    isNonEmptyString(asset.placeId) &&
    Array.isArray(asset.affordanceIds) &&
    asset.affordanceIds.length > 0 &&
    asset.affordanceIds.every(isNonEmptyString)
  );
}

function projectAssetAffordance(asset) {
  return {
    assetId: asset.assetId,
    assetVersion: asset.assetVersion,
    definitionId: asset.definitionId,
    ownerId: asset.ownerId,
    controllerIds: [...asset.controllerIds],
    custodyId: asset.custodyId,
    placeId: asset.placeId,
    affordanceIds: [...asset.affordanceIds],
  };
}

function isActivityOption(activity, virtualTime) {
  return (
    activity !== null &&
    typeof activity === 'object' &&
    isNonEmptyString(activity.activityId) &&
    isSafeIntegerAtLeast(activity.activityVersion, 1) &&
    isNonEmptyString(activity.organizerId) &&
    isNonEmptyString(activity.placeId) &&
    isSafeIntegerAtLeast(activity.startsAtVirtualTime, virtualTime) &&
    isSafeIntegerAtLeast(activity.endsAtVirtualTime, 0) &&
    activity.endsAtVirtualTime > activity.startsAtVirtualTime &&
    isNonEmptyString(activity.participationKind) &&
    Array.isArray(activity.requiredAssetIds) &&
    activity.requiredAssetIds.every(isNonEmptyString)
  );
}

function projectActivityOption(activity) {
  return {
    activityId: activity.activityId,
    activityVersion: activity.activityVersion,
    organizerId: activity.organizerId,
    placeId: activity.placeId,
    startsAtVirtualTime: activity.startsAtVirtualTime,
    endsAtVirtualTime: activity.endsAtVirtualTime,
    participationKind: activity.participationKind,
    requiredAssetIds: [...activity.requiredAssetIds],
  };
}

function isActorCommitment(commitment, actorId, virtualTime) {
  return (
    commitment !== null &&
    typeof commitment === 'object' &&
    isNonEmptyString(commitment.commitmentId) &&
    isSafeIntegerAtLeast(commitment.commitmentVersion, 1) &&
    commitment.actorId === actorId &&
    isNonEmptyString(commitment.kind) &&
    isNonEmptyString(commitment.placeId) &&
    isSafeIntegerAtLeast(commitment.startsAtVirtualTime, 0) &&
    isSafeIntegerAtLeast(commitment.endsAtVirtualTime, 0) &&
    commitment.endsAtVirtualTime > virtualTime &&
    commitment.endsAtVirtualTime > commitment.startsAtVirtualTime
  );
}

function projectCommitment(commitment) {
  return {
    commitmentId: commitment.commitmentId,
    commitmentVersion: commitment.commitmentVersion,
    kind: commitment.kind,
    placeId: commitment.placeId,
    startsAtVirtualTime: commitment.startsAtVirtualTime,
    endsAtVirtualTime: commitment.endsAtVirtualTime,
  };
}

export function projectEntertainmentAgency(observation) {
  if (
    observation === null ||
    typeof observation !== 'object' ||
    !isNonEmptyString(observation.worldId) ||
    !isNonEmptyString(observation.worldEpoch) ||
    !isSafeIntegerAtLeast(observation.authorityCommitSeq, 0) ||
    !isSafeIntegerAtLeast(observation.virtualTime, 0) ||
    !isNonEmptyString(observation.recipientId)
  ) {
    throw new TypeError('ENTERTAINMENT_AGENCY_INVALID_AUTHORITY_SNAPSHOT');
  }
  const actor = observation.actor;
  if (
    actor === null ||
    typeof actor !== 'object' ||
    !isNonEmptyString(actor.actorId) ||
    !isNonEmptyString(actor.currentPlaceId) ||
    !isNonEmptyString(actor.cashAccountId) ||
    !isSafeIntegerAtLeast(actor.availableCashCents, 0)
  ) {
    throw new TypeError('ENTERTAINMENT_AGENCY_INVALID_ACTOR_FACTS');
  }
  if (observation.recipientId !== actor.actorId) {
    throw new TypeError('ENTERTAINMENT_AGENCY_RECIPIENT_ACTOR_MISMATCH');
  }
  return deepFreeze({
    schema: ENTERTAINMENT_AGENCY_SCHEMA,
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
    executableOffers: boundedEntries(
      observation.executableOffers,
      ENTERTAINMENT_AGENCY_LIMITS.executableOffers,
    )
      .filter((offer) => isExecutableOffer(offer, observation.virtualTime))
      .map(projectOffer),
    assetAffordances: boundedEntries(
      observation.assets,
      ENTERTAINMENT_AGENCY_LIMITS.assetAffordances,
    )
      .filter((asset) => isControllableAsset(asset, actor.actorId))
      .map(projectAssetAffordance),
    activityOptions: boundedEntries(
      observation.activities,
      ENTERTAINMENT_AGENCY_LIMITS.activityOptions,
    )
      .filter((activity) =>
        isActivityOption(activity, observation.virtualTime),
      )
      .map(projectActivityOption),
    commitments: boundedEntries(
      observation.commitments,
      ENTERTAINMENT_AGENCY_LIMITS.commitments,
    )
      .filter((commitment) =>
        isActorCommitment(
          commitment,
          actor.actorId,
          observation.virtualTime,
        ),
      )
      .map(projectCommitment),
  });
}

function blockedIntent(projection, actorId, code, details = {}) {
  return deepFreeze({
    schema: ENTERTAINMENT_INTENT_SCHEMA,
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

export function compileEntertainmentIntent(projection, request) {
  if (request === null || typeof request !== 'object') {
    return blockedIntent(
      projection,
      projection.actor.actorId,
      'INVALID_INTENT_REQUEST',
    );
  }
  if (
    request.kind !== 'accept_offer' &&
    request.kind !== 'use_asset' &&
    request.kind !== 'join_activity'
  ) {
    return blockedIntent(projection, request.actorId, 'UNSUPPORTED_INTENT');
  }
  if (request.actorId !== projection.actor.actorId) {
    return blockedIntent(
      projection,
      request.actorId,
      'RECIPIENT_ACTOR_MISMATCH',
    );
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
    if (activity.participationKind !== 'open') {
      return blockedIntent(
        projection,
        request.actorId,
        'CAPACITY_SETTLEMENT_REQUIRED',
      );
    }
    const conflictingCommitments = projection.commitments.filter(
      (commitment) =>
        activity.startsAtVirtualTime < commitment.endsAtVirtualTime &&
        commitment.startsAtVirtualTime < activity.endsAtVirtualTime,
    );
    if (conflictingCommitments.length > 0) {
      return blockedIntent(projection, request.actorId, 'TIME_CONFLICT', {
        blockingRefs: conflictingCommitments.map(
          (commitment) => commitment.commitmentId,
        ),
      });
    }
    const availableAssetIds = new Set(
      projection.assetAffordances.map((asset) => asset.assetId),
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
    return deepFreeze({
      schema: ENTERTAINMENT_INTENT_SCHEMA,
      status: 'candidate',
      authorityTarget: 'worker_controller',
      requiresAuthoritySettlement: true,
      worldId: projection.worldId,
      worldEpoch: projection.worldEpoch,
      recipientId: projection.recipientId,
      actorId: request.actorId,
      baseCommitSeq: projection.authorityCommitSeq,
      issuedAtVirtualTime: projection.virtualTime,
      intent: {
        kind: 'join_activity',
        activityRef: {
          activityId: activity.activityId,
          activityVersion: activity.activityVersion,
          organizerId: activity.organizerId,
          placeId: activity.placeId,
          startsAtVirtualTime: activity.startsAtVirtualTime,
          endsAtVirtualTime: activity.endsAtVirtualTime,
          participationKind: activity.participationKind,
        },
        requiredAssetIds: [...activity.requiredAssetIds],
      },
    });
  }
  if (request.kind === 'use_asset') {
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
    if (!asset.affordanceIds.includes(request.affordanceId)) {
      return blockedIntent(
        projection,
        request.actorId,
        'AFFORDANCE_NOT_GRANTED',
      );
    }
    if (asset.placeId !== projection.actor.currentPlaceId) {
      return blockedIntent(
        projection,
        request.actorId,
        'ASSET_NOT_AT_ACTOR_PLACE',
      );
    }
    return deepFreeze({
      schema: ENTERTAINMENT_INTENT_SCHEMA,
      status: 'candidate',
      authorityTarget: 'worker_controller',
      requiresAuthoritySettlement: true,
      worldId: projection.worldId,
      worldEpoch: projection.worldEpoch,
      recipientId: projection.recipientId,
      actorId: request.actorId,
      baseCommitSeq: projection.authorityCommitSeq,
      issuedAtVirtualTime: projection.virtualTime,
      intent: {
        kind: 'use_asset',
        assetRef: {
          assetId: asset.assetId,
          assetVersion: asset.assetVersion,
          definitionId: asset.definitionId,
          ownerId: asset.ownerId,
          custodyId: asset.custodyId,
          placeId: asset.placeId,
        },
        affordanceId: request.affordanceId,
      },
    });
  }
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
  const quantity = request.quantity;
  if (!isSafeIntegerAtLeast(quantity, 1)) {
    return blockedIntent(projection, request.actorId, 'INVALID_QUANTITY');
  }
  if (projection.actor.currentPlaceId !== offer.placeId) {
    return blockedIntent(
      projection,
      request.actorId,
      'ACTOR_NOT_AT_OFFER_PLACE',
    );
  }
  if (quantity > offer.availableQuantity) {
    return blockedIntent(
      projection,
      request.actorId,
      'INSUFFICIENT_OFFER_QUANTITY',
    );
  }
  const maximumDebitCents = offer.unitPriceCents * quantity;
  if (!Number.isSafeInteger(maximumDebitCents)) {
    return blockedIntent(projection, request.actorId, 'UNSAFE_DEBIT_LIMIT');
  }
  if (maximumDebitCents > projection.actor.availableCashCents) {
    return blockedIntent(
      projection,
      request.actorId,
      'INSUFFICIENT_VISIBLE_FUNDS',
    );
  }

  return deepFreeze({
    schema: ENTERTAINMENT_INTENT_SCHEMA,
    status: 'candidate',
    authorityTarget: 'worker_controller',
    requiresAuthoritySettlement: true,
    worldId: projection.worldId,
    worldEpoch: projection.worldEpoch,
    recipientId: projection.recipientId,
    actorId: request.actorId,
    baseCommitSeq: projection.authorityCommitSeq,
    issuedAtVirtualTime: projection.virtualTime,
    intent: {
      kind: 'accept_offer',
      offerRef: {
        offerId: offer.offerId,
        offerVersion: offer.offerVersion,
        makerId: offer.makerId,
        placeId: offer.placeId,
        subjectId: offer.subjectId,
        unitPriceCents: offer.unitPriceCents,
        expiresAtVirtualTime: offer.expiresAtVirtualTime,
      },
      quantity,
      payerAccountId: projection.actor.cashAccountId,
      maximumDebitCents,
      requestedRights: [...offer.rightsOffered],
    },
  });
}

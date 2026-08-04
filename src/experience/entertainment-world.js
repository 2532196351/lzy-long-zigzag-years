import {
  compileEntertainmentIntent,
  projectEntertainmentAgency,
} from './entertainment-agency.js?v=20260804-01';

export const ENTERTAINMENT_WORLD_SCHEMA =
  'lzy-entertainment-world-v1';
export const ENTERTAINMENT_PUBLIC_SCHEMA =
  'lzy-entertainment-public-v1';

const MAX_RECENT_OUTCOMES = 32;
const MAX_METRIC = 100;
const WORLD_DAY_MS = 86_400_000;

const OFFERS = Object.freeze([
  Object.freeze({
    offerId: 'offer_morning_tide_hot_breakfast',
    offerVersion: 1,
    kind: 'prepared_food_service',
    makerId: 'business_morning_tide_breakfast',
    placeId: 'morning_tide_breakfast',
    subjectId: 'morning_tide_hot_breakfast',
    labelZh: '晨潮热早餐',
    descriptionZh: '现做热食与豆浆，付款后当场用餐。',
    unitPriceCents: 1_800,
    dailyCapacity: 36,
    rightsOffered: Object.freeze([
      'fresh_meal_delivery',
      'onsite_dining',
    ]),
    lifeEffects: Object.freeze({
      satiety: 24,
      energy: 5,
      comfort: 3,
    }),
    metricEffects: Object.freeze({
      wellbeing: 3,
      cityFamiliarity: 1,
      socialEnergy: 1,
    }),
  }),
  Object.freeze({
    offerId: 'offer_jiangwan_bus_city_loop',
    offerVersion: 1,
    kind: 'public_transit_service',
    makerId: 'jiangwan_public_transit_operator',
    placeId: 'jiangwan_bus_stop',
    subjectId: 'jiangwan_city_loop_ticket',
    labelZh: '江湾环线车票',
    descriptionZh: '乘坐一圈江湾环线，沿途认识城市节点。',
    unitPriceCents: 300,
    dailyCapacity: 120,
    rightsOffered: Object.freeze([
      'one_city_loop_ride',
    ]),
    lifeEffects: Object.freeze({ mobility: 6, comfort: 1 }),
    metricEffects: Object.freeze({
      wellbeing: 1,
      cityFamiliarity: 3,
      socialEnergy: 1,
    }),
  }),
]);

const ACTIVITIES = Object.freeze([
  Object.freeze({
    activityId: 'activity_riverside_slow_walk',
    activityVersion: 1,
    organizerId: 'jiangwan_riverside_service',
    placeId: 'riverside_walk',
    labelZh: '滨河慢走与观景',
    descriptionZh: '沿河完成一段慢走，观察天气、行人和城市变化。',
    durationMs: 30 * 60 * 1_000,
    participationKind: 'open',
    requiredAssetIds: Object.freeze([]),
    lifeEffects: Object.freeze({
      energy: -4,
      health: 3,
      comfort: 5,
    }),
    metricEffects: Object.freeze({
      wellbeing: 5,
      cityFamiliarity: 2,
      socialEnergy: 1,
    }),
  }),
  Object.freeze({
    activityId: 'activity_community_pickup_game',
    activityVersion: 1,
    organizerId: 'jiangwan_community_sports_group',
    placeId: 'community_court',
    labelZh: '社区临场球局',
    descriptionZh: '加入一场开放球局；体力会下降，健康与熟人度会上升。',
    durationMs: 60 * 60 * 1_000,
    participationKind: 'open',
    requiredAssetIds: Object.freeze([]),
    lifeEffects: Object.freeze({
      energy: -12,
      satiety: -5,
      health: 5,
      comfort: 4,
    }),
    metricEffects: Object.freeze({
      wellbeing: 6,
      cityFamiliarity: 2,
      socialEnergy: 5,
    }),
  }),
]);

const OFFER_BY_ID = new Map(
  OFFERS.map((entry) => [entry.offerId, entry]),
);
const ACTIVITY_BY_ID = new Map(
  ACTIVITIES.map((entry) => [entry.activityId, entry]),
);

function clone(value) {
  return structuredClone(value);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function boundedMetric(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? clamp(Math.round(number), 0, MAX_METRIC)
    : 0;
}

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function dayIndex(world) {
  return Math.max(1, Number(world?.world?.tick ?? 0) + 1);
}

function currentPlaceId(world) {
  const placeId = world?.spatial?.player?.currentPlaceId;
  return typeof placeId === 'string' && placeId.length > 0
    ? placeId
    : null;
}

function emptyDaily(day) {
  return {
    dayIndex: day,
    offerPurchases: {},
    completedActivities: {},
  };
}

export function createEntertainmentWorldState() {
  return {
    schemaVersion: ENTERTAINMENT_WORLD_SCHEMA,
    metrics: {
      wellbeing: 0,
      cityFamiliarity: 0,
      socialEnergy: 0,
      achievement: 0,
    },
    daily: emptyDaily(1),
    totalSpendCents: 0,
    completedActivityCount: 0,
    projectionRevision: 1,
    nextOutcomeSequence: 1,
    recentOutcomes: [],
    archive: {
      outcomeCount: 0,
      digest: '00000000',
    },
  };
}

export function normalizeEntertainmentWorldState(world) {
  if (!world || typeof world !== 'object') {
    throw new TypeError('A world is required.');
  }
  if (world.entertainment === undefined) {
    world.entertainment = createEntertainmentWorldState();
    world.entertainment.daily = emptyDaily(dayIndex(world));
    return world.entertainment;
  }
  if (
    world.entertainment?.schemaVersion !==
    ENTERTAINMENT_WORLD_SCHEMA
  ) {
    throw new Error('Invalid or incompatible entertainment save.');
  }
  const state = world.entertainment;
  state.metrics ??= {};
  for (const key of [
    'wellbeing',
    'cityFamiliarity',
    'socialEnergy',
    'achievement',
  ]) {
    state.metrics[key] = boundedMetric(state.metrics[key]);
  }
  if (
    !state.daily ||
    !Number.isSafeInteger(state.daily.dayIndex) ||
    !state.daily.offerPurchases ||
    !state.daily.completedActivities
  ) {
    state.daily = emptyDaily(dayIndex(world));
  }
  state.totalSpendCents = Number.isSafeInteger(state.totalSpendCents)
    ? Math.max(0, state.totalSpendCents)
    : 0;
  state.completedActivityCount = Number.isSafeInteger(
    state.completedActivityCount,
  )
    ? Math.max(0, state.completedActivityCount)
    : 0;
  state.projectionRevision = Number.isSafeInteger(
    state.projectionRevision,
  ) && state.projectionRevision > 0
    ? state.projectionRevision
    : 1;
  state.nextOutcomeSequence = Number.isSafeInteger(
    state.nextOutcomeSequence,
  ) && state.nextOutcomeSequence > 0
    ? state.nextOutcomeSequence
    : 1;
  state.recentOutcomes = Array.isArray(state.recentOutcomes)
    ? state.recentOutcomes.slice(-MAX_RECENT_OUTCOMES)
    : [];
  state.archive ??= { outcomeCount: 0, digest: '00000000' };
  state.archive.outcomeCount = Number.isSafeInteger(
    state.archive.outcomeCount,
  )
    ? Math.max(0, state.archive.outcomeCount)
    : 0;
  state.archive.digest =
    typeof state.archive.digest === 'string'
      ? state.archive.digest
      : '00000000';
  return state;
}

function effectiveDaily(world) {
  const state = world.entertainment;
  return state.daily.dayIndex === dayIndex(world)
    ? state.daily
    : emptyDaily(dayIndex(world));
}

function authorityContext(world, context = {}) {
  const authorityCommitSeq =
    world.entertainment.projectionRevision;
  const virtualTime = Number.isSafeInteger(context.virtualTime)
    ? context.virtualTime
    : Math.max(0, Number(world.world?.tick ?? 0) * WORLD_DAY_MS);
  const worldEpoch =
    typeof context.worldEpoch === 'string' && context.worldEpoch
      ? context.worldEpoch
      : `${world.world.seed}:${world.world.ruleVersion}`;
  return { authorityCommitSeq, virtualTime, worldEpoch };
}

function agencyObservation(world, context = {}) {
  normalizeEntertainmentWorldState(world);
  const authority = authorityContext(world, context);
  const placeId = currentPlaceId(world);
  const daily = effectiveDaily(world);
  const executableOffers = OFFERS
    .filter((offer) => offer.placeId === placeId)
    .map((offer) => ({
      offerId: offer.offerId,
      offerVersion: offer.offerVersion + dayIndex(world) - 1,
      kind: offer.kind,
      makerId: offer.makerId,
      placeId: offer.placeId,
      subjectId: offer.subjectId,
      unitPriceCents: offer.unitPriceCents,
      availableQuantity: Math.max(
        0,
        offer.dailyCapacity -
          Number(daily.offerPurchases[offer.offerId] ?? 0),
      ),
      expiresAtVirtualTime: authority.virtualTime + WORLD_DAY_MS,
      rightsOffered: [...offer.rightsOffered],
    }))
    .filter((offer) => offer.availableQuantity > 0);
  const activities = ACTIVITIES
    .filter((activity) => activity.placeId === placeId)
    .filter(
      (activity) =>
        Number(daily.completedActivities[activity.activityId] ?? 0) === 0,
    )
    .map((activity) => ({
      activityId: activity.activityId,
      activityVersion:
        activity.activityVersion + dayIndex(world) - 1,
      organizerId: activity.organizerId,
      placeId: activity.placeId,
      startsAtVirtualTime: authority.virtualTime,
      endsAtVirtualTime:
        authority.virtualTime + activity.durationMs,
      participationKind: activity.participationKind,
      requiredAssetIds: [...activity.requiredAssetIds],
    }));
  return {
    observation: {
      worldId: world.world.id,
      worldEpoch: authority.worldEpoch,
      authorityCommitSeq: authority.authorityCommitSeq,
      virtualTime: authority.virtualTime,
      recipientId: 'player',
      actor: {
        actorId: 'player',
        currentPlaceId: placeId ?? 'between_places',
        cashAccountId: 'player_cash',
        availableCashCents: Math.max(
          0,
          Number.isSafeInteger(context.availableCashCents)
            ? context.availableCashCents
            : Math.round(Number(world.player.cash ?? 0) * 100),
        ),
      },
      executableOffers,
      assets: [],
      activities,
      commitments: [],
    },
    authority,
    placeId,
  };
}

export function projectEntertainmentWorld(world, context = {}) {
  const { observation, placeId } = agencyObservation(world, context);
  const agency = projectEntertainmentAgency(observation);
  return {
    schema: ENTERTAINMENT_PUBLIC_SCHEMA,
    authorityCommitSeq: agency.authorityCommitSeq,
    sourceCommitSeq: Number.isSafeInteger(context.authorityCommitSeq)
      ? context.authorityCommitSeq
      : null,
    virtualTime: agency.virtualTime,
    currentPlaceId: placeId,
    metrics: clone(world.entertainment.metrics),
    executableOffers: agency.executableOffers.map((entry) => {
      const definition = OFFER_BY_ID.get(entry.offerId);
      return {
        ...entry,
        labelZh: definition?.labelZh ?? '本地服务',
        descriptionZh: definition?.descriptionZh ?? '',
      };
    }),
    activityOptions: agency.activityOptions.map((entry) => {
      const definition = ACTIVITY_BY_ID.get(entry.activityId);
      return {
        ...entry,
        labelZh: definition?.labelZh ?? '本地活动',
        descriptionZh: definition?.descriptionZh ?? '',
        durationMs: definition?.durationMs ?? 0,
      };
    }),
    recentOutcomes: world.entertainment.recentOutcomes.map(
      (outcome) => ({
        outcomeKind: outcome.outcomeKind,
        labelZh: outcome.labelZh,
        placeId: outcome.placeId,
        dayIndex: outcome.dayIndex,
        costCents: outcome.costCents,
      }),
    ),
    totals: {
      spendCents: world.entertainment.totalSpendCents,
      completedActivities:
        world.entertainment.completedActivityCount,
      archivedOutcomes:
        world.entertainment.archive.outcomeCount,
    },
    hotPathTrace: {
      coldHistoryReads: 0,
      activeDefinitionReads:
        agency.executableOffers.length +
        agency.activityOptions.length,
      retainedOutcomeReads:
        world.entertainment.recentOutcomes.length,
    },
  };
}

function rejected(reason, details = {}) {
  return { status: 'rejected', reason, ...details };
}

export function deriveEntertainmentSettlement(world, action = {}) {
  normalizeEntertainmentWorldState(world);
  const authorityCommitSeq = action.authorityCommitSeq;
  if (
    !Number.isSafeInteger(authorityCommitSeq) ||
    action.baseCommitSeq !== authorityCommitSeq
  ) {
    return rejected('STALE_ENTERTAINMENT_PROJECTION');
  }
  if (
    action.request?.kind === 'join_activity' &&
    typeof action.request.activityId === 'string' &&
    Number(
      effectiveDaily(world).completedActivities[
        action.request.activityId
      ] ?? 0,
    ) > 0
  ) {
    return rejected('ACTIVITY_ALREADY_COMPLETED_TODAY');
  }
  const { observation, placeId } = agencyObservation(world, {
    authorityCommitSeq,
    virtualTime: action.virtualTime,
    worldEpoch: action.worldEpoch,
    availableCashCents: action.availableCashCents,
  });
  const agency = projectEntertainmentAgency(observation);
  const candidate = compileEntertainmentIntent(
    agency,
    action.request,
  );
  if (candidate.status !== 'candidate') {
    return rejected(candidate.code ?? 'ENTERTAINMENT_INTENT_BLOCKED');
  }
  if (candidate.intent.kind === 'join_activity') {
    const definition = ACTIVITY_BY_ID.get(
      candidate.intent.activityRef.activityId,
    );
    if (!definition || definition.placeId !== placeId) {
      return rejected('NO_AVAILABLE_ACTIVITY');
    }
    const daily = effectiveDaily(world);
    if (
      Number(
        daily.completedActivities[definition.activityId] ?? 0,
      ) > 0
    ) {
      return rejected('ACTIVITY_ALREADY_COMPLETED_TODAY');
    }
    return {
      status: 'accepted',
      outcomeKind: 'activity_completed',
      labelZh: definition.labelZh,
      summaryZh: `完成${definition.labelZh}。`,
      placeId: definition.placeId,
      activityId: definition.activityId,
      costCents: 0,
      quantity: 1,
      counterpartyId: definition.organizerId,
      lifeEffects: clone(definition.lifeEffects),
      metricEffects: clone(definition.metricEffects),
      authorityCommitSeq,
    };
  }
  if (candidate.intent.kind === 'accept_offer') {
    const definition = OFFER_BY_ID.get(
      candidate.intent.offerRef.offerId,
    );
    if (!definition || definition.placeId !== placeId) {
      return rejected('NO_EXECUTABLE_COUNTERPARTY');
    }
    const quantity = candidate.intent.quantity;
    return {
      status: 'accepted',
      outcomeKind: 'offer_settled',
      labelZh: definition.labelZh,
      summaryZh: `已享用${definition.labelZh}。`,
      placeId: definition.placeId,
      offerId: definition.offerId,
      costCents: definition.unitPriceCents * quantity,
      quantity,
      counterpartyId: definition.makerId,
      lifeEffects: Object.fromEntries(
        Object.entries(definition.lifeEffects).map(([key, value]) => [
          key,
          value * quantity,
        ]),
      ),
      metricEffects: Object.fromEntries(
        Object.entries(definition.metricEffects).map(([key, value]) => [
          key,
          value * quantity,
        ]),
      ),
      authorityCommitSeq,
    };
  }
  return rejected('ENTERTAINMENT_INTENT_BLOCKED');
}

function appendOutcome(state, outcome) {
  state.recentOutcomes.push(outcome);
  while (state.recentOutcomes.length > MAX_RECENT_OUTCOMES) {
    const removed = state.recentOutcomes.shift();
    state.archive.outcomeCount += 1;
    state.archive.digest = hashText(
      `${state.archive.digest}|${removed.sequence}|${removed.outcomeKind}|${removed.dayIndex}`,
    );
  }
}

export function applyEntertainmentSettlement(world, settlement) {
  if (settlement?.status !== 'accepted') return world.entertainment;
  const state = normalizeEntertainmentWorldState(world);
  if (state.daily.dayIndex !== dayIndex(world)) {
    state.daily = emptyDaily(dayIndex(world));
  }
  if (settlement.activityId) {
    state.daily.completedActivities[settlement.activityId] = 1;
    state.completedActivityCount += 1;
  }
  if (settlement.offerId) {
    state.daily.offerPurchases[settlement.offerId] =
      Number(state.daily.offerPurchases[settlement.offerId] ?? 0) +
      settlement.quantity;
    state.totalSpendCents += settlement.costCents;
  }
  for (const [key, delta] of Object.entries(
    settlement.metricEffects,
  )) {
    state.metrics[key] = boundedMetric(
      Number(state.metrics[key] ?? 0) + Number(delta),
    );
  }
  for (const [key, delta] of Object.entries(
    settlement.lifeEffects,
  )) {
    if (!Object.hasOwn(world.player.life, key)) continue;
    world.player.life[key] = clamp(
      Number(world.player.life[key] ?? 0) + Number(delta),
      0,
      100,
    );
  }
  const sequence = state.nextOutcomeSequence;
  state.nextOutcomeSequence += 1;
  appendOutcome(state, {
    sequence,
    outcomeKind: settlement.outcomeKind,
    labelZh: settlement.labelZh,
    placeId: settlement.placeId,
    dayIndex: dayIndex(world),
    costCents: settlement.costCents,
  });
  state.projectionRevision += 1;
  return state;
}

export function markEntertainmentProjectionChanged(world) {
  const state = normalizeEntertainmentWorldState(world);
  state.projectionRevision += 1;
  return state.projectionRevision;
}

export function auditEntertainmentWorld(world) {
  const state = world?.entertainment;
  const errors = [];
  if (
    !state ||
    state.schemaVersion !== ENTERTAINMENT_WORLD_SCHEMA ||
    !state.metrics ||
    !state.daily ||
    !Array.isArray(state.recentOutcomes) ||
    state.recentOutcomes.length > MAX_RECENT_OUTCOMES ||
    !Number.isSafeInteger(state.totalSpendCents) ||
    state.totalSpendCents < 0 ||
    !Number.isSafeInteger(state.completedActivityCount) ||
    state.completedActivityCount < 0 ||
    !Number.isSafeInteger(state.projectionRevision) ||
    state.projectionRevision < 1 ||
    !Number.isSafeInteger(state.nextOutcomeSequence) ||
    state.nextOutcomeSequence < 1
  ) {
    return { ok: false, errors: ['INVALID_ENTERTAINMENT_WORLD'] };
  }
  for (const key of [
    'wellbeing',
    'cityFamiliarity',
    'socialEnergy',
    'achievement',
  ]) {
    if (
      !Number.isSafeInteger(state.metrics[key]) ||
      state.metrics[key] < 0 ||
      state.metrics[key] > MAX_METRIC
    ) {
      errors.push(`INVALID_ENTERTAINMENT_METRIC:${key}`);
    }
  }
  if (
    !Number.isSafeInteger(state.daily.dayIndex) ||
    state.daily.dayIndex < 1 ||
    !state.daily.offerPurchases ||
    !state.daily.completedActivities
  ) {
    errors.push('INVALID_ENTERTAINMENT_DAILY_STATE');
  }
  return { ok: errors.length === 0, errors };
}

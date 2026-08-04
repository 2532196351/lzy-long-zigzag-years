import {
  OPEN_WORLD_CITY_LIMITS,
  compileOpenWorldCityIntent,
  projectOpenWorldCityLife,
} from './open-world-city-life.js?v=20260804-01';
import { JIANGWAN_OUTDOOR_CITY_PACK } from '../world2d/city-pack.js?v=20260804-01';
import { JIANGWAN_OPEN_WORLD_CONTENT } from '../world2d/open-world-city-content.js?v=20260804-01';

export const OPEN_WORLD_CITY_AUTHORITY_SCHEMA =
  'lzy-open-world-city-authority-v1';

const WORLD_DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const MAX_SETTLED_RESULTS =
  OPEN_WORLD_CITY_LIMITS.settledConsequences;

const PLACE_AUTHORITY = Object.freeze({
  jiangwan_home_gate: Object.freeze({
    operatorId: 'org-jiangwan-residence',
    capacity: 48,
    occupancy: 6,
    openMinute: 0,
    closeMinute: 1_440,
  }),
  morning_tide_breakfast: Object.freeze({
    operatorId: 'business-morning-tide-breakfast',
    capacity: 24,
    occupancy: 9,
    openMinute: 330,
    closeMinute: 660,
  }),
  harbor_daily_store: Object.freeze({
    operatorId: 'business-harbor-daily-store',
    capacity: 30,
    occupancy: 7,
    openMinute: 480,
    closeMinute: 1_320,
  }),
  riverside_walk: Object.freeze({
    operatorId: 'org-jiangwan-riverside-service',
    capacity: 96,
    occupancy: 18,
    openMinute: 0,
    closeMinute: 1_440,
  }),
  community_court: Object.freeze({
    operatorId: 'org-jiangwan-community-sports',
    capacity: 28,
    occupancy: 10,
    openMinute: 360,
    closeMinute: 1_320,
  }),
  jiangwan_bus_stop: Object.freeze({
    operatorId: 'org-jiangwan-public-transit',
    capacity: 72,
    occupancy: 12,
    openMinute: 300,
    closeMinute: 1_380,
  }),
  jiangwan_clinic: Object.freeze({
    operatorId: 'org-jiangwan-community-clinic',
    capacity: 36,
    occupancy: 14,
    openMinute: 480,
    closeMinute: 1_200,
  }),
  jiangwan_library: Object.freeze({
    operatorId: 'org-jiangwan-library',
    capacity: 80,
    occupancy: 31,
    openMinute: 480,
    closeMinute: 1_260,
  }),
  old_port_market: Object.freeze({
    operatorId: 'org-old-port-market',
    capacity: 88,
    occupancy: 34,
    openMinute: 420,
    closeMinute: 1_320,
  }),
  riverside_ferry_pier: Object.freeze({
    operatorId: 'org-jiangwan-ferry',
    capacity: 64,
    occupancy: 11,
    openMinute: 360,
    closeMinute: 1_320,
  }),
  jiangwan_workshop: Object.freeze({
    operatorId: 'org-jiangwan-workshop',
    capacity: 26,
    occupancy: 8,
    openMinute: 480,
    closeMinute: 1_320,
  }),
  jiangwan_property_office: Object.freeze({
    operatorId: 'org-jiangwan-property-service',
    capacity: 22,
    occupancy: 5,
    openMinute: 480,
    closeMinute: 1_140,
  }),
});

const GENESIS_ACTORS = Object.freeze([
  Object.freeze({
    actorId: 'actor-morning-tide-host',
    actorVersion: 1,
    labelZh: '潮生早餐店主',
    placeId: 'morning_tide_breakfast',
    activityKind: 'preparing_food',
  }),
  Object.freeze({
    actorId: 'actor-old-port-vendor',
    actorVersion: 1,
    labelZh: '旧港摊主',
    placeId: 'old_port_market',
    activityKind: 'serving_customer',
  }),
  Object.freeze({
    actorId: 'actor-jiangwan-librarian',
    actorVersion: 1,
    labelZh: '江湾馆员',
    placeId: 'jiangwan_library',
    activityKind: 'organizing_reading',
  }),
  Object.freeze({
    actorId: 'actor-jiangwan-clinic-nurse',
    actorVersion: 1,
    labelZh: '社区护士',
    placeId: 'jiangwan_clinic',
    activityKind: 'triage_service',
  }),
  Object.freeze({
    actorId: 'actor-jiangwan-workshop-host',
    actorVersion: 1,
    labelZh: '共作间值守人',
    placeId: 'jiangwan_workshop',
    activityKind: 'maintaining_station',
  }),
  Object.freeze({
    actorId: 'actor-jiangwan-ferry-attendant',
    actorVersion: 1,
    labelZh: '渡口值守员',
    placeId: 'riverside_ferry_pier',
    activityKind: 'boarding_service',
  }),
  Object.freeze({
    actorId: 'actor-property-service-manager',
    actorVersion: 1,
    labelZh: '住区服务员',
    placeId: 'jiangwan_property_office',
    activityKind: 'handling_request',
  }),
]);

const GENESIS_COHORTS = Object.freeze([
  Object.freeze({
    cohortId: 'cohort-breakfast-neighbors',
    cohortVersion: 1,
    labelZh: '早餐时段的附近居民',
    placeId: 'morning_tide_breakfast',
    activityKind: 'dining',
    count: 8,
  }),
  Object.freeze({
    cohortId: 'cohort-old-port-shoppers',
    cohortVersion: 1,
    labelZh: '正在逛集的居民',
    placeId: 'old_port_market',
    activityKind: 'shopping',
    count: 18,
  }),
  Object.freeze({
    cohortId: 'cohort-riverside-walkers',
    cohortVersion: 1,
    labelZh: '沿河慢走的人群',
    placeId: 'riverside_walk',
    activityKind: 'walking',
    count: 12,
  }),
  Object.freeze({
    cohortId: 'cohort-library-readers',
    cohortVersion: 1,
    labelZh: '阅读区读者',
    placeId: 'jiangwan_library',
    activityKind: 'reading',
    count: 16,
  }),
]);

const OFFER_DEFINITIONS = Object.freeze([
  Object.freeze({
    offerId: 'offer-morning-tide-breakfast',
    offerVersion: 1,
    offerBookId: 'offers:morning_tide_breakfast',
    makerId: 'actor-morning-tide-host',
    placeId: 'morning_tide_breakfast',
    subjectId: 'morning_tide_hot_breakfast',
    unitPriceCents: 1_800,
    availableQuantity: 36,
    minimumDurationMs: 8 * MINUTE_MS,
    rightsOffered: Object.freeze(['consume', 'onsite_dining']),
  }),
  Object.freeze({
    offerId: 'offer-harbor-daily-goods',
    offerVersion: 1,
    offerBookId: 'offers:harbor_daily_store',
    makerId: 'business-harbor-daily-store',
    placeId: 'harbor_daily_store',
    subjectId: 'family_groceries',
    unitPriceCents: 8_600,
    availableQuantity: 24,
    minimumDurationMs: 10 * MINUTE_MS,
    rightsOffered: Object.freeze(['own', 'consume']),
  }),
  Object.freeze({
    offerId: 'offer-old-port-seasonal-goods',
    offerVersion: 1,
    offerBookId: 'offers:old_port_market',
    makerId: 'actor-old-port-vendor',
    placeId: 'old_port_market',
    subjectId: 'old_port_seasonal_food_lot',
    unitPriceCents: 1_200,
    availableQuantity: 28,
    minimumDurationMs: 15 * MINUTE_MS,
    rightsOffered: Object.freeze(['own', 'consume']),
  }),
  Object.freeze({
    offerId: 'offer-jiangwan-clinic-consultation',
    offerVersion: 1,
    offerBookId: 'services:jiangwan_clinic',
    makerId: 'org-jiangwan-community-clinic',
    placeId: 'jiangwan_clinic',
    subjectId: 'clinic_consultation',
    unitPriceCents: 12_000,
    availableQuantity: 12,
    minimumDurationMs: 30 * MINUTE_MS,
    rightsOffered: Object.freeze(['receive_health_service']),
  }),
  Object.freeze({
    offerId: 'offer-property-maintenance-review',
    offerVersion: 1,
    offerBookId: 'services:jiangwan_property_office',
    makerId: 'org-jiangwan-property-service',
    placeId: 'jiangwan_property_office',
    subjectId: 'home_maintenance_review',
    unitPriceCents: 6_000,
    availableQuantity: 10,
    minimumDurationMs: 12 * MINUTE_MS,
    rightsOffered: Object.freeze(['receive_property_service']),
  }),
]);

const ACTIVITY_DEFINITIONS = Object.freeze([
  Object.freeze({
    activityId: 'activity-riverside-guided-walk',
    activityVersion: 1,
    organizerId: 'org-jiangwan-riverside-service',
    placeId: 'riverside_walk',
    startMinute: 1_080,
    durationMs: 30 * MINUTE_MS,
    availableCapacity: 20,
    requiredAssetIds: Object.freeze([]),
  }),
  Object.freeze({
    activityId: 'activity-community-evening-game',
    activityVersion: 1,
    organizerId: 'org-jiangwan-community-sports',
    placeId: 'community_court',
    startMinute: 1_140,
    durationMs: 60 * MINUTE_MS,
    availableCapacity: 8,
    requiredAssetIds: Object.freeze([]),
  }),
  Object.freeze({
    activityId: 'activity-library-evening-reading',
    activityVersion: 1,
    organizerId: 'org-jiangwan-library',
    placeId: 'jiangwan_library',
    startMinute: 1_170,
    durationMs: 45 * MINUTE_MS,
    availableCapacity: 16,
    requiredAssetIds: Object.freeze([]),
  }),
]);

const TRANSIT_DEFINITIONS = Object.freeze([
  Object.freeze({
    runPrefix: 'run-jiangwan-bus-loop',
    operatorId: 'org-jiangwan-public-transit',
    fromPlaceId: 'jiangwan_bus_stop',
    toPlaceId: 'old_port_market',
    intervalMs: 15 * MINUTE_MS,
    travelMs: 12 * MINUTE_MS,
    availableSeats: 26,
    fareCents: 300,
  }),
  Object.freeze({
    runPrefix: 'run-jiangwan-ferry-crossing',
    operatorId: 'org-jiangwan-ferry',
    fromPlaceId: 'riverside_ferry_pier',
    toPlaceId: 'jiangwan_bus_stop',
    intervalMs: 20 * MINUTE_MS,
    travelMs: 18 * MINUTE_MS,
    availableSeats: 32,
    fareCents: 500,
  }),
]);

const OFFER_OUTCOMES = Object.freeze({
  'offer-morning-tide-breakfast': Object.freeze({
    labelZh: '晨间热早餐',
    completionEventKind: 'OfferConsumed',
    lifeEffects: Object.freeze({ satiety: 24, energy: 5, comfort: 3 }),
  }),
  'offer-harbor-daily-goods': Object.freeze({
    labelZh: '家庭日用补给',
    completionEventKind: 'InventoryCustodyTransferred',
    lifeEffects: Object.freeze({ satiety: 8, comfort: 4 }),
  }),
  'offer-old-port-seasonal-goods': Object.freeze({
    labelZh: '当季食材',
    completionEventKind: 'OfferConsumed',
    lifeEffects: Object.freeze({ satiety: 10, comfort: 2 }),
  }),
  'offer-jiangwan-clinic-consultation': Object.freeze({
    labelZh: '社区门诊服务',
    completionEventKind: 'ServiceCompleted',
    lifeEffects: Object.freeze({ health: 8, energy: -2, comfort: 2 }),
  }),
  'offer-property-maintenance-review': Object.freeze({
    labelZh: '住宅维护评估',
    completionEventKind: 'ServiceCompleted',
    lifeEffects: Object.freeze({ comfort: 6 }),
  }),
});

const ACTIVITY_OUTCOMES = Object.freeze({
  'activity-riverside-guided-walk': Object.freeze({
    labelZh: '沿河慢走',
    lifeEffects: Object.freeze({ energy: -4, health: 3, comfort: 5 }),
  }),
  'activity-community-evening-game': Object.freeze({
    labelZh: '社区球局',
    lifeEffects: Object.freeze({ energy: -12, satiety: -5, health: 5 }),
  }),
  'activity-library-evening-reading': Object.freeze({
    labelZh: '傍晚共读',
    lifeEffects: Object.freeze({ energy: -2, comfort: 6 }),
  }),
});

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function dayIndex(virtualTime) {
  return Math.floor(Math.max(0, virtualTime) / WORLD_DAY_MS);
}

function minuteOfDay(virtualTime) {
  return Math.floor(
    (Math.max(0, virtualTime) % WORLD_DAY_MS) / MINUTE_MS,
  );
}

function scheduledPlaceState(entry, virtualTime) {
  const minute = minuteOfDay(virtualTime);
  const alwaysOpen =
    entry.openMinute === 0 && entry.closeMinute === 1_440;
  const open =
    alwaysOpen ||
    (minute >= entry.openMinute && minute < entry.closeMinute);
  const dayStart = Math.floor(virtualTime / WORLD_DAY_MS) * WORLD_DAY_MS;
  let nextChangeAtVirtualTime;
  if (alwaysOpen) {
    nextChangeAtVirtualTime = dayStart + WORLD_DAY_MS;
  } else if (minute < entry.openMinute) {
    nextChangeAtVirtualTime =
      dayStart + entry.openMinute * MINUTE_MS;
  } else if (minute < entry.closeMinute) {
    nextChangeAtVirtualTime =
      dayStart + entry.closeMinute * MINUTE_MS;
  } else {
    nextChangeAtVirtualTime =
      dayStart + WORLD_DAY_MS + entry.openMinute * MINUTE_MS;
  }
  return {
    openState: open
      ? entry.occupancy * 10 >= entry.capacity * 9
        ? 'limited'
        : 'open'
      : 'closed',
    occupancy: open ? entry.occupancy : 0,
    nextChangeAtVirtualTime,
  };
}

function dayPhase(virtualTime) {
  const minute = minuteOfDay(virtualTime);
  if (minute >= 300 && minute < 480) return 'dawn';
  if (minute >= 480 && minute < 1_020) return 'day';
  if (minute >= 1_020 && minute < 1_200) return 'dusk';
  return 'night';
}

function nextDailyWindow(startMinute, durationMs, virtualTime) {
  const todayStart =
    Math.floor(virtualTime / WORLD_DAY_MS) * WORLD_DAY_MS +
    startMinute * MINUTE_MS;
  const startsAtVirtualTime =
    todayStart >= virtualTime ? todayStart : todayStart + WORLD_DAY_MS;
  return {
    startsAtVirtualTime,
    endsAtVirtualTime: startsAtVirtualTime + durationMs,
  };
}

function nextTransitRun(definition, virtualTime) {
  const slot = Math.floor(virtualTime / definition.intervalMs) + 1;
  const departsAtVirtualTime = slot * definition.intervalMs;
  return {
    runId: `${definition.runPrefix}-${slot}`,
    runVersion: slot + 1,
    operatorId: definition.operatorId,
    fromPlaceId: definition.fromPlaceId,
    toPlaceId: definition.toPlaceId,
    departsAtVirtualTime,
    arrivesAtVirtualTime:
      departsAtVirtualTime + definition.travelMs,
    availableSeats: definition.availableSeats,
    fareCents: definition.fareCents,
  };
}

function routeOptions(currentPlaceId) {
  const result = [];
  for (const route of JIANGWAN_OPEN_WORLD_CONTENT.routeLinks) {
    if (route.fromPlaceId === currentPlaceId) {
      result.push({
        routeId: route.routeId,
        routeVersion: route.routeVersion,
        fromPlaceId: currentPlaceId,
        toPlaceId: route.toPlaceId,
        travelMode: 'on_foot',
        minimumDurationMs: route.minimumDurationMs,
        availability: 'available',
      });
    } else if (route.toPlaceId === currentPlaceId) {
      result.push({
        routeId: `${route.routeId}:reverse`,
        routeVersion: route.routeVersion,
        fromPlaceId: currentPlaceId,
        toPlaceId: route.fromPlaceId,
        travelMode: 'on_foot',
        minimumDurationMs: route.minimumDurationMs,
        availability: 'available',
      });
    }
  }
  return result.sort((left, right) =>
    left.routeId.localeCompare(right.routeId),
  );
}

export function createOpenWorldCityAuthorityState() {
  return {
    schemaVersion: OPEN_WORLD_CITY_AUTHORITY_SCHEMA,
    authorityRevision: 1,
    placeStates: JIANGWAN_OPEN_WORLD_CONTENT.places.map((place) => ({
      placeId: place.placeId,
      stateVersion: 1,
      ...PLACE_AUTHORITY[place.placeId],
    })),
    visibleActors: clone(GENESIS_ACTORS),
    visibleCohorts: clone(GENESIS_COHORTS),
    offers: clone(OFFER_DEFINITIONS),
    activities: clone(ACTIVITY_DEFINITIONS),
    transit: clone(TRANSIT_DEFINITIONS),
    assets: [],
    commitments: [],
    activityReservations: {},
    transitReservations: {},
    settledResults: [],
    nextSettlementSequence: 1,
  };
}

export function normalizeOpenWorldCityAuthorityState(world) {
  if (!world || typeof world !== 'object') {
    throw new TypeError('A world is required.');
  }
  if (world.openWorldCityAuthority === undefined) {
    world.openWorldCityAuthority = createOpenWorldCityAuthorityState();
    return { migrated: true };
  }
  if (
    world.openWorldCityAuthority?.schemaVersion !==
    OPEN_WORLD_CITY_AUTHORITY_SCHEMA
  ) {
    throw new Error('Invalid or incompatible open-world city save.');
  }
  const state = world.openWorldCityAuthority;
  const existingPlaces = new Map(
    (state.placeStates ?? []).map((entry) => [entry.placeId, entry]),
  );
  state.placeStates = JIANGWAN_OPEN_WORLD_CONTENT.places.map((place) => ({
    placeId: place.placeId,
    stateVersion: 1,
    ...PLACE_AUTHORITY[place.placeId],
    ...(existingPlaces.get(place.placeId) ?? {}),
  }));
  state.visibleActors ??= clone(GENESIS_ACTORS);
  state.visibleCohorts ??= clone(GENESIS_COHORTS);
  state.offers ??= clone(OFFER_DEFINITIONS);
  state.activities ??= clone(ACTIVITY_DEFINITIONS);
  state.transit ??= clone(TRANSIT_DEFINITIONS);
  state.assets ??= [];
  state.commitments ??= [];
  state.activityReservations ??= {};
  state.transitReservations ??= {};
  state.settledResults = Array.isArray(state.settledResults)
    ? state.settledResults.slice(-MAX_SETTLED_RESULTS)
    : [];
  state.authorityRevision = Number.isSafeInteger(state.authorityRevision)
    ? Math.max(1, state.authorityRevision)
    : 1;
  state.nextSettlementSequence = Number.isSafeInteger(
    state.nextSettlementSequence,
  )
    ? Math.max(1, state.nextSettlementSequence)
    : 1;
  return { migrated: false };
}

function currentEnvironment(world, virtualTime) {
  const activeSceneId = world.spatial?.activeSceneId;
  const environmentState =
    world.spatial?.sceneStates?.[activeSceneId]?.environmentState ?? {};
  return {
    environmentVersion: Math.max(
      1,
      Number(world.openWorldCityAuthority.authorityRevision),
    ),
    dayPhase: dayPhase(virtualTime),
    weather:
      typeof environmentState.weather === 'string'
        ? environmentState.weather
        : 'clear',
    trafficBand:
      typeof environmentState.traffic === 'string'
        ? environmentState.traffic
        : 'moderate',
    footfallBand:
      typeof environmentState.footfall === 'string'
        ? environmentState.footfall
        : 'ordinary',
  };
}

export function projectOpenWorldCityFromWorld(world, context = {}) {
  const state = world?.openWorldCityAuthority;
  if (
    !state ||
    state.schemaVersion !== OPEN_WORLD_CITY_AUTHORITY_SCHEMA
  ) {
    throw new TypeError('OPEN_WORLD_CITY_AUTHORITY_NOT_NORMALIZED');
  }
  const virtualTime = Number.isSafeInteger(context.virtualTime)
    ? Math.max(0, context.virtualTime)
    : Math.max(0, Number(world.world?.tick ?? 0) * WORLD_DAY_MS);
  const authorityCommitSeq = Number.isSafeInteger(
    context.authorityCommitSeq,
  )
    ? Math.max(0, context.authorityCommitSeq)
    : Math.max(0, Number(state.authorityRevision));
  const currentPlaceId =
    typeof world.spatial?.player?.currentPlaceId === 'string'
      ? world.spatial.player.currentPlaceId
      : 'between_places';
  const currentPlaces = new Set([currentPlaceId]);
  const openPlaceIds = new Set(
    state.placeStates
      .filter(
        (entry) =>
          scheduledPlaceState(entry, virtualTime).openState !== 'closed',
      )
      .map((entry) => entry.placeId),
  );
  const observation = {
    worldId: world.world.id,
    worldEpoch:
      typeof context.worldEpoch === 'string' && context.worldEpoch
        ? context.worldEpoch
        : `${world.world.seed}:${world.world.ruleVersion}`,
    authorityCommitSeq,
    virtualTime,
    recipientId: 'player',
    actor: {
      actorId: 'player',
      currentPlaceId,
      cashAccountId: 'player_cash',
      availableCashCents: Number.isSafeInteger(context.availableCashCents)
        ? Math.max(0, context.availableCashCents)
        : Math.max(0, Math.round(Number(world.player.cash ?? 0) * 100)),
    },
    environment: currentEnvironment(world, virtualTime),
    placeStates: state.placeStates.map((entry) => ({
      placeId: entry.placeId,
      stateVersion: entry.stateVersion + dayIndex(virtualTime),
      operatorId: entry.operatorId,
      capacity: entry.capacity,
      ...scheduledPlaceState(entry, virtualTime),
    })),
    visibleActors: state.visibleActors
      .filter((entry) => currentPlaces.has(entry.placeId))
      .map((entry) => ({ ...entry, observableBy: ['player'] })),
    visibleCohorts: state.visibleCohorts
      .filter((entry) => currentPlaces.has(entry.placeId))
      .map((entry) => ({ ...entry, observableBy: ['player'] })),
    routeOptions: routeOptions(currentPlaceId),
    entryOptions: [],
    executableOffers: state.offers
      .filter(
        (entry) =>
          entry.placeId === currentPlaceId &&
          openPlaceIds.has(entry.placeId),
      )
      .map((entry) => ({
        ...entry,
        offerVersion: entry.offerVersion + dayIndex(virtualTime),
        expiresAtVirtualTime:
          Math.floor(virtualTime / WORLD_DAY_MS) * WORLD_DAY_MS +
          WORLD_DAY_MS,
      })),
    activities: state.activities
      .filter(
        (entry) =>
          entry.placeId === currentPlaceId &&
          openPlaceIds.has(entry.placeId),
      )
      .map((entry) => {
        const window = nextDailyWindow(
          entry.startMinute,
          entry.durationMs,
          virtualTime,
        );
        const reservationKey = `${entry.activityId}:${window.startsAtVirtualTime}`;
        return {
          activityId: entry.activityId,
          activityVersion:
            entry.activityVersion + dayIndex(virtualTime),
          organizerId: entry.organizerId,
          placeId: entry.placeId,
          ...window,
          availableCapacity: Math.max(
            0,
            entry.availableCapacity -
              Number(state.activityReservations[reservationKey] ?? 0),
          ),
          minimumDurationMs: entry.durationMs,
          requiredAssetIds: [...entry.requiredAssetIds],
        };
      })
      .filter((entry) => entry.availableCapacity > 0),
    transitRuns: state.transit
      .filter(
        (entry) =>
          entry.fromPlaceId === currentPlaceId &&
          openPlaceIds.has(entry.fromPlaceId),
      )
      .map((entry) => nextTransitRun(entry, virtualTime))
      .map((entry) => ({
        ...entry,
        availableSeats: Math.max(
          0,
          entry.availableSeats -
            Number(state.transitReservations[entry.runId] ?? 0),
        ),
      }))
      .filter((entry) => entry.availableSeats > 0),
    assets: state.assets.filter(
      (entry) => entry.placeId === currentPlaceId,
    ),
    commitments: state.commitments,
    settledResults: state.settledResults.map((entry) => ({
      ...entry,
      observableBy: ['player'],
    })),
  };
  return projectOpenWorldCityLife(observation);
}

function rejectedAction(reason, details = {}) {
  return { status: 'rejected', reason, ...details };
}

function appendSettledResult(state, result) {
  state.settledResults.push(result);
  if (state.settledResults.length > MAX_SETTLED_RESULTS) {
    state.settledResults.splice(
      0,
      state.settledResults.length - MAX_SETTLED_RESULTS,
    );
  }
}

function placeLabel(placeId) {
  return (
    JIANGWAN_OPEN_WORLD_CONTENT.places.find(
      (entry) => entry.placeId === placeId,
    )?.labelZh ?? '当前地点'
  );
}

function startDetails(candidate) {
  const intent = candidate.intent;
  if (intent.kind === 'accept_offer') {
    const outcome = OFFER_OUTCOMES[intent.offerRef.offerId];
    if (!outcome) return null;
    return {
      kind: intent.kind,
      placeId: intent.offerRef.placeId,
      resourceId: intent.offerRef.offerId,
      resourceVersion: intent.offerRef.offerVersion,
      quantity: intent.quantity,
      costCents: intent.maximumDebitCents,
      startsAtVirtualTime: candidate.issuedAtVirtualTime,
      endsAtVirtualTime:
        candidate.issuedAtVirtualTime + intent.minimumDurationMs,
      startEventKind: 'OfferSettled',
      completionEventKind: outcome.completionEventKind,
      labelZh: outcome.labelZh,
      lifeEffects: clone(outcome.lifeEffects),
    };
  }
  if (intent.kind === 'join_activity') {
    const outcome = ACTIVITY_OUTCOMES[intent.activityRef.activityId];
    if (!outcome) return null;
    return {
      kind: intent.kind,
      placeId: intent.activityRef.placeId,
      resourceId: intent.activityRef.activityId,
      resourceVersion: intent.activityRef.activityVersion,
      quantity: 1,
      costCents: 0,
      startsAtVirtualTime: intent.activityRef.startsAtVirtualTime,
      endsAtVirtualTime: intent.activityRef.endsAtVirtualTime,
      startEventKind: 'ActivityStarted',
      completionEventKind: 'ActivityCompleted',
      labelZh: outcome.labelZh,
      lifeEffects: clone(outcome.lifeEffects),
    };
  }
  if (intent.kind === 'board_transit') {
    return {
      kind: intent.kind,
      placeId: intent.runRef.fromPlaceId,
      destinationPlaceId: intent.runRef.toPlaceId,
      resourceId: intent.runRef.runId,
      resourceVersion: intent.runRef.runVersion,
      quantity: intent.seats,
      costCents: intent.maximumDebitCents,
      startsAtVirtualTime: intent.runRef.departsAtVirtualTime,
      endsAtVirtualTime: intent.runRef.arrivesAtVirtualTime,
      startEventKind: 'TransitBoarded',
      completionEventKind: 'TravelLegCompleted',
      labelZh: `前往${placeLabel(intent.runRef.toPlaceId)}`,
      lifeEffects: { mobility: 4, comfort: 1 },
    };
  }
  if (intent.kind === 'use_asset') {
    return {
      kind: intent.kind,
      placeId: intent.assetRef.placeId,
      resourceId: intent.assetRef.assetId,
      resourceVersion: intent.assetRef.assetVersion,
      quantity: 1,
      costCents: 0,
      startsAtVirtualTime: candidate.issuedAtVirtualTime,
      endsAtVirtualTime:
        candidate.issuedAtVirtualTime + intent.minimumDurationMs,
      startEventKind: 'AssetUseStarted',
      completionEventKind: 'AssetUseCompleted',
      labelZh: '使用场地设备',
      lifeEffects: { energy: -4 },
    };
  }
  return null;
}

export function beginOpenWorldCityAction(world, action = {}) {
  normalizeOpenWorldCityAuthorityState(world);
  if (
    action.actorId !== undefined &&
    action.actorId !== 'player'
  ) {
    return rejectedAction('ACTOR_NOT_AUTHORIZED');
  }
  if (
    !Number.isSafeInteger(action.authorityCommitSeq) ||
    action.baseCommitSeq !== action.authorityCommitSeq
  ) {
    return rejectedAction('STALE_OPEN_WORLD_CITY_PROJECTION');
  }
  const projection = projectOpenWorldCityFromWorld(world, {
    authorityCommitSeq: action.authorityCommitSeq,
    virtualTime: action.virtualTime,
    worldEpoch: action.worldEpoch,
    availableCashCents: action.availableCashCents,
  });
  const candidate = compileOpenWorldCityIntent(projection, {
    ...(action.request ?? {}),
    actorId: 'player',
  });
  if (candidate.status !== 'candidate') {
    return rejectedAction(
      candidate.code ?? 'OPEN_WORLD_CITY_INTENT_BLOCKED',
    );
  }
  if (candidate.intent.kind === 'move_to') {
    return rejectedAction('SPATIAL_ROUTE_REQUIRED');
  }
  const state = world.openWorldCityAuthority;
  if (state.commitments.length >= OPEN_WORLD_CITY_LIMITS.commitments) {
    return rejectedAction('OPEN_WORLD_CITY_COMMITMENT_LIMIT');
  }
  const details = startDetails(candidate);
  if (!details) {
    return rejectedAction('OPEN_WORLD_CITY_RESOURCE_UNAVAILABLE');
  }

  if (details.kind === 'accept_offer') {
    const offer = state.offers.find(
      (entry) => entry.offerId === details.resourceId,
    );
    if (!offer || offer.availableQuantity < details.quantity) {
      return rejectedAction('INSUFFICIENT_OFFER_QUANTITY');
    }
    offer.availableQuantity -= details.quantity;
    offer.offerVersion += 1;
  } else if (details.kind === 'join_activity') {
    const key = `${details.resourceId}:${details.startsAtVirtualTime}`;
    state.activityReservations[key] =
      Number(state.activityReservations[key] ?? 0) + 1;
  } else if (details.kind === 'board_transit') {
    state.transitReservations[details.resourceId] =
      Number(state.transitReservations[details.resourceId] ?? 0) +
      details.quantity;
  }

  const sequence = state.nextSettlementSequence;
  state.nextSettlementSequence += 1;
  const commitmentId = `open-world-commitment-${sequence}`;
  const commitment = {
    commitmentId,
    commitmentVersion: 1,
    actorId: 'player',
    ...details,
  };
  state.commitments.push(commitment);
  state.authorityRevision += 1;
  const startedEventId = `open-world-city-event-${sequence}-started`;
  appendSettledResult(state, {
    status: 'settled',
    eventId: startedEventId,
    commitSeq: action.authorityCommitSeq + 1,
    eventKind: details.startEventKind,
    actorId: 'player',
    placeId: details.placeId,
    occurredAtVirtualTime: Number(action.virtualTime),
    consequenceRefs: [
      `commitment:${commitmentId}`,
      ...(details.costCents > 0
        ? [`cash:debit:${details.costCents}`]
        : []),
    ],
  });
  return {
    status: 'accepted',
    commitment: clone(commitment),
    commitmentId,
    costCents: details.costCents,
    labelZh: details.labelZh,
    placeId: details.placeId,
    completionStatus: 'scheduled',
    completesAtVirtualTime: details.endsAtVirtualTime,
    startedEventId,
  };
}

function applyLifeEffects(world, effects) {
  for (const [key, delta] of Object.entries(effects ?? {})) {
    if (!Object.hasOwn(world.player.life, key)) continue;
    world.player.life[key] = Math.min(
      100,
      Math.max(
        0,
        Math.round(
          Number(world.player.life[key] ?? 0) + Number(delta),
        ),
      ),
    );
  }
  world.player.life.actionCount += 1;
}

function completeTransitPosition(world, destinationPlaceId) {
  const place = JIANGWAN_OUTDOOR_CITY_PACK.places.find(
    (entry) => entry.placeId === destinationPlaceId,
  );
  const anchor = place
    ? JIANGWAN_OUTDOOR_CITY_PACK.anchors[place.anchorId]
    : null;
  if (!place || !anchor) return false;
  const spatial = world.spatial;
  spatial.activeSceneId = JIANGWAN_OUTDOOR_CITY_PACK.sceneId;
  spatial.geometryRevision =
    JIANGWAN_OUTDOOR_CITY_PACK.geometryRevision;
  spatial.player.sceneId = JIANGWAN_OUTDOOR_CITY_PACK.sceneId;
  spatial.player.positionQ = clone(anchor);
  spatial.player.currentIntent = { kind: 'idle' };
  spatial.player.routeId = null;
  spatial.player.occupancyAnchorId = place.anchorId;
  spatial.player.currentPlaceId = destinationPlaceId;
  spatial.player.lastSafeAnchorId = place.anchorId;
  spatial.projectionSeq += 1;
  return true;
}

function transitDestinationAvailable(destinationPlaceId) {
  const place = JIANGWAN_OUTDOOR_CITY_PACK.places.find(
    (entry) => entry.placeId === destinationPlaceId,
  );
  return Boolean(
    place && JIANGWAN_OUTDOOR_CITY_PACK.anchors[place.anchorId],
  );
}

export function completeOpenWorldCityCommitment(
  world,
  commitmentId,
  context = {},
) {
  normalizeOpenWorldCityAuthorityState(world);
  const state = world.openWorldCityAuthority;
  const index = state.commitments.findIndex(
    (entry) => entry.commitmentId === commitmentId,
  );
  if (index < 0) {
    return rejectedAction('OPEN_WORLD_CITY_COMMITMENT_NOT_FOUND');
  }
  const commitment = state.commitments[index];
  if (
    !Number.isSafeInteger(context.virtualTime) ||
    context.virtualTime < commitment.endsAtVirtualTime
  ) {
    return rejectedAction('OPEN_WORLD_CITY_COMMITMENT_NOT_DUE');
  }
  if (
    commitment.kind === 'board_transit' &&
    !transitDestinationAvailable(commitment.destinationPlaceId)
  ) {
    return rejectedAction('OPEN_WORLD_CITY_DESTINATION_UNAVAILABLE');
  }
  state.commitments.splice(index, 1);
  applyLifeEffects(world, commitment.lifeEffects);
  if (commitment.kind === 'board_transit') {
    completeTransitPosition(world, commitment.destinationPlaceId);
  }
  const sequence = state.nextSettlementSequence;
  state.nextSettlementSequence += 1;
  state.authorityRevision += 1;
  const eventId = `open-world-city-event-${sequence}-completed`;
  appendSettledResult(state, {
    status: 'settled',
    eventId,
    commitSeq: Number(context.authorityCommitSeq),
    eventKind: commitment.completionEventKind,
    actorId: 'player',
    placeId:
      commitment.destinationPlaceId ?? commitment.placeId,
    occurredAtVirtualTime: context.virtualTime,
    consequenceRefs: [
      `commitment:${commitmentId}:completed`,
      `experience:${commitment.resourceId}`,
    ],
  });
  return {
    status: 'accepted',
    eventId,
    commitmentId,
    eventKind: commitment.completionEventKind,
    labelZh: commitment.labelZh,
    placeId: commitment.placeId,
    destinationPlaceId: commitment.destinationPlaceId ?? null,
    completedAtVirtualTime: context.virtualTime,
  };
}

function text(value) {
  return typeof value === 'string' && value.length > 0;
}

function integer(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function recordWithIntegerValues(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, count]) => text(key) && integer(count),
    )
  );
}

function uniqueTextField(entries, field) {
  if (!Array.isArray(entries)) return false;
  const values = entries.map((entry) => entry?.[field]);
  return values.every(text) && new Set(values).size === values.length;
}

function validLifeEffects(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, delta]) => text(key) && Number.isFinite(delta),
    )
  );
}

export function auditOpenWorldCityAuthorityState(world) {
  const state = world?.openWorldCityAuthority;
  const errors = [];
  if (
    !state ||
    state.schemaVersion !== OPEN_WORLD_CITY_AUTHORITY_SCHEMA ||
    !Number.isSafeInteger(state.authorityRevision) ||
    state.authorityRevision < 1 ||
    !Number.isSafeInteger(state.nextSettlementSequence) ||
    state.nextSettlementSequence < 1
  ) {
    return { ok: false, errors: ['INVALID_OPEN_WORLD_CITY_AUTHORITY'] };
  }
  const placeIds = state.placeStates?.map((entry) => entry.placeId);
  const expectedPlaceIds = JIANGWAN_OPEN_WORLD_CONTENT.places.map(
    (entry) => entry.placeId,
  );
  const expectedPlaceIdSet = new Set(expectedPlaceIds);
  if (JSON.stringify(placeIds) !== JSON.stringify(expectedPlaceIds)) {
    errors.push('INVALID_OPEN_WORLD_CITY_PLACES');
  }
  if (
    !Array.isArray(state.visibleActors) ||
    state.visibleActors.length > OPEN_WORLD_CITY_LIMITS.visibleActors ||
    !Array.isArray(state.visibleCohorts) ||
    state.visibleCohorts.length > OPEN_WORLD_CITY_LIMITS.visibleCohorts ||
    !Array.isArray(state.offers) ||
    state.offers.length > OPEN_WORLD_CITY_LIMITS.executableOffers ||
    !Array.isArray(state.activities) ||
    state.activities.length > OPEN_WORLD_CITY_LIMITS.activityOptions ||
    !Array.isArray(state.transit) ||
    state.transit.length > OPEN_WORLD_CITY_LIMITS.transitRuns ||
    !Array.isArray(state.commitments) ||
    state.commitments.length > OPEN_WORLD_CITY_LIMITS.commitments ||
    !Array.isArray(state.settledResults) ||
    state.settledResults.length > MAX_SETTLED_RESULTS
  ) {
    errors.push('INVALID_OPEN_WORLD_CITY_HOT_SET');
  }
  if (
    !Array.isArray(state.placeStates) ||
    !state.placeStates.every(
      (entry) =>
        text(entry.operatorId) &&
        integer(entry.stateVersion, 1) &&
        integer(entry.capacity, 1) &&
        integer(entry.occupancy) &&
        entry.occupancy <= entry.capacity &&
        integer(entry.openMinute) &&
        entry.openMinute <= 1_440 &&
        integer(entry.closeMinute, 1) &&
        entry.closeMinute <= 1_440 &&
        entry.closeMinute > entry.openMinute,
    )
  ) {
    errors.push('INVALID_OPEN_WORLD_CITY_PLACE_STATE');
  }
  if (
    !uniqueTextField(state.visibleActors, 'actorId') ||
    !state.visibleActors.every(
      (entry) =>
        integer(entry.actorVersion, 1) &&
        text(entry.labelZh) &&
        expectedPlaceIdSet.has(entry.placeId) &&
        text(entry.activityKind),
    )
  ) {
    errors.push('INVALID_OPEN_WORLD_CITY_ACTORS');
  }
  if (
    !uniqueTextField(state.visibleCohorts, 'cohortId') ||
    !state.visibleCohorts.every(
      (entry) =>
        integer(entry.cohortVersion, 1) &&
        text(entry.labelZh) &&
        expectedPlaceIdSet.has(entry.placeId) &&
        text(entry.activityKind) &&
        integer(entry.count, 1),
    )
  ) {
    errors.push('INVALID_OPEN_WORLD_CITY_COHORTS');
  }
  if (
    !uniqueTextField(state.offers, 'offerId') ||
    !state.offers.every(
      (entry) =>
        integer(entry.offerVersion, 1) &&
        text(entry.offerBookId) &&
        text(entry.makerId) &&
        expectedPlaceIdSet.has(entry.placeId) &&
        text(entry.subjectId) &&
        integer(entry.unitPriceCents) &&
        integer(entry.availableQuantity) &&
        integer(entry.minimumDurationMs, 1) &&
        Array.isArray(entry.rightsOffered) &&
        entry.rightsOffered.length > 0 &&
        entry.rightsOffered.every(text),
    )
  ) {
    errors.push('INVALID_OPEN_WORLD_CITY_OFFERS');
  }
  if (
    !uniqueTextField(state.activities, 'activityId') ||
    !state.activities.every(
      (entry) =>
        integer(entry.activityVersion, 1) &&
        text(entry.organizerId) &&
        expectedPlaceIdSet.has(entry.placeId) &&
        integer(entry.startMinute) &&
        entry.startMinute < 1_440 &&
        integer(entry.durationMs, 1) &&
        integer(entry.availableCapacity, 1) &&
        Array.isArray(entry.requiredAssetIds) &&
        entry.requiredAssetIds.every(text),
    )
  ) {
    errors.push('INVALID_OPEN_WORLD_CITY_ACTIVITIES');
  }
  if (
    !uniqueTextField(state.transit, 'runPrefix') ||
    !state.transit.every(
      (entry) =>
        text(entry.operatorId) &&
        expectedPlaceIdSet.has(entry.fromPlaceId) &&
        expectedPlaceIdSet.has(entry.toPlaceId) &&
        entry.fromPlaceId !== entry.toPlaceId &&
        integer(entry.intervalMs, 1) &&
        integer(entry.travelMs, 1) &&
        integer(entry.availableSeats, 1) &&
        integer(entry.fareCents),
    )
  ) {
    errors.push('INVALID_OPEN_WORLD_CITY_TRANSIT');
  }
  if (
    !recordWithIntegerValues(state.activityReservations) ||
    !recordWithIntegerValues(state.transitReservations)
  ) {
    errors.push('INVALID_OPEN_WORLD_CITY_RESERVATIONS');
  }
  const validCommitmentKinds = new Set([
    'accept_offer',
    'join_activity',
    'board_transit',
    'use_asset',
  ]);
  if (
    !uniqueTextField(state.commitments, 'commitmentId') ||
    !state.commitments.every(
      (entry) =>
        integer(entry.commitmentVersion, 1) &&
        entry.actorId === 'player' &&
        validCommitmentKinds.has(entry.kind) &&
        expectedPlaceIdSet.has(entry.placeId) &&
        (
          entry.destinationPlaceId === undefined ||
          expectedPlaceIdSet.has(entry.destinationPlaceId)
        ) &&
        text(entry.resourceId) &&
        integer(entry.resourceVersion, 1) &&
        integer(entry.quantity, 1) &&
        integer(entry.costCents) &&
        integer(entry.startsAtVirtualTime) &&
        integer(entry.endsAtVirtualTime, 1) &&
        entry.endsAtVirtualTime > entry.startsAtVirtualTime &&
        text(entry.startEventKind) &&
        text(entry.completionEventKind) &&
        text(entry.labelZh) &&
        validLifeEffects(entry.lifeEffects),
    )
  ) {
    errors.push('INVALID_OPEN_WORLD_CITY_COMMITMENTS');
  }
  if (
    !uniqueTextField(state.settledResults, 'eventId') ||
    !state.settledResults.every(
      (entry) =>
        entry.status === 'settled' &&
        integer(entry.commitSeq) &&
        text(entry.eventKind) &&
        entry.actorId === 'player' &&
        expectedPlaceIdSet.has(entry.placeId) &&
        integer(entry.occurredAtVirtualTime) &&
        Array.isArray(entry.consequenceRefs) &&
        entry.consequenceRefs.length > 0 &&
        entry.consequenceRefs.every(text),
    )
  ) {
    errors.push('INVALID_OPEN_WORLD_CITY_SETTLED_RESULTS');
  }
  return { ok: errors.length === 0, errors };
}

const SCHEMA_VERSION = 'lzy-social-career-v1';
const MAX_LIVE_FACTS = 224;
const MAX_MEMORIES_PER_ACTOR = 12;
const MAX_MARKET_ACTIONS = 32;
const MAX_RECENT_DECISIONS = 24;
const MAX_CONTRACTS = 88;
const MAX_OPPORTUNITIES = 48;
const RESEARCH_NETWORK_VERSION =
  'lzy-research-access-v1';
const RESEARCH_COVERAGE_SYMBOLS = Object.freeze([
  'LZA001',
  'LZA002',
  'LZA003',
  'LZB101',
  'LZC201',
  'LZD301',
  'LZE401',
  'LZF501',
  'LZG601',
  'LZH701',
  'LZI801',
  'LZJ901',
  'LZK011',
  'LZL121',
]);

function clone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicUnit(ecology, ...parts) {
  return (
    hashString(
      `${ecology.seed}|${ecology.rngSalt}|${parts.join('|')}`,
    ) / 0xffffffff
  );
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function relationKey(leftId, rightId) {
  return [String(leftId), String(rightId)].sort().join('::');
}

function worldWeekday(tick) {
  return ((Math.max(1, tick) - 1) % 7) + 1;
}

function scheduledToWork(actor, tick) {
  return Boolean(
    actor.schedule?.workDays?.includes(
      worldWeekday(tick),
    ),
  );
}

function ensureResearchNetwork(ecology) {
  ecology.researchNetwork ??= {
    version: RESEARCH_NETWORK_VERSION,
    services: {},
  };
  ecology.researchNetwork.version =
    RESEARCH_NETWORK_VERSION;
  ecology.researchNetwork.services ??= {};
  ecology.researchNetwork.services.playerCoverage ??= {
    id: 'research_service_player_coverage',
    active: [
      'professional',
      'institution',
    ].includes(ecology.player?.roleType),
    clientOrgId: 'org_player_venture',
    providerOrgId: 'org_xinghe_research',
    leadActorId: 'person_gu_lan',
    substituteActorId: 'person_zhou_qian',
    coverageSymbols: [...RESEARCH_COVERAGE_SYMBOLS],
    leadBatchSize: 3,
    leadFeePerReport: 160,
    substituteCadenceDays: 3,
    substituteFeePerReport: 550,
    reportFreshnessDays: 3,
    nextCoverageIndex: 0,
    reportsBySymbol: {},
    availability: {
      asOfTick: ecology.lastSettledTick ?? 0,
      leadStatus: 'not_started',
      serviceStatus: 'awaiting_shift',
      leadAvailable: false,
      substituteUsed: false,
      reasonCodes: ['legacy_state_normalized'],
    },
    publicDataAvailable: true,
    marketDataIndependent: true,
  };
  const service =
    ecology.researchNetwork.services.playerCoverage;
  service.coverageSymbols = [
    ...RESEARCH_COVERAGE_SYMBOLS,
  ];
  service.reportsBySymbol ??= {};
  service.nextCoverageIndex ??= 0;
  service.publicDataAvailable = true;
  service.marketDataIndependent = true;
  return service;
}

function nextRecordId(ecology, prefix) {
  ecology.sequence += 1;
  return `${prefix}_${String(ecology.sequence).padStart(8, '0')}`;
}

function appendDecision(ecology, decision) {
  ecology.recentDecisions.push({
    id: nextRecordId(ecology, 'social_decision'),
    tick: ecology.lastSettledTick,
    ...decision,
  });
  while (ecology.recentDecisions.length > MAX_RECENT_DECISIONS) {
    const removed = ecology.recentDecisions.shift();
    ecology.archive.decisionCount += 1;
    ecology.archive.decisionDigest = hashString(
      `${ecology.archive.decisionDigest}|${removed.id}|${removed.tick}|${removed.actorId}|${removed.activity}`,
    ).toString(16);
  }
}

function rememberFact(ecology, actorId, fact, options = {}) {
  const actor = ecology.actors[actorId];
  if (!actor) return;
  actor.knownFactIds = [
    ...(actor.knownFactIds ?? []).filter((factId) => factId !== fact.id),
    fact.id,
  ].slice(-MAX_MEMORIES_PER_ACTOR);
  actor.memories = [
    ...(actor.memories ?? []).filter(
      (memory) => memory.factId !== fact.id,
    ),
    {
      factId: fact.id,
      salience: clamp(options.salience ?? fact.salience ?? 0.5, 0, 1),
      confidence: clamp(options.confidence ?? 1, 0, 1),
      valence: clamp(options.valence ?? 0, -1, 1),
      createdTick: fact.tick,
      lastRecalledTick: fact.tick,
    },
  ].slice(-MAX_MEMORIES_PER_ACTOR);
}

function appendFact(ecology, fact) {
  const completed = {
    id: nextRecordId(ecology, 'social_fact'),
    type: fact.type,
    tick: ecology.lastSettledTick,
    actorIds: [...new Set(fact.actorIds ?? [])],
    organizationIds: [...new Set(fact.organizationIds ?? [])],
    locationId: fact.locationId ?? null,
    contractId: fact.contractId ?? null,
    opportunityId: fact.opportunityId ?? null,
    reasonCodes: [...new Set(fact.reasonCodes ?? [])],
    resourceDelta: clone(fact.resourceDelta ?? {}),
    relationshipDelta: clone(fact.relationshipDelta ?? {}),
    visibility: fact.visibility ?? 'public',
    salience: clamp(fact.salience ?? 0.5, 0, 1),
  };
  for (const field of [
    'interactionMode',
    'communicationAssetId',
    'originLocationId',
    'destinationLocationId',
  ]) {
    if (Object.hasOwn(fact, field)) {
      completed[field] = fact[field] ?? null;
    }
  }
  ecology.facts.push(completed);
  for (const actorId of completed.actorIds) {
    rememberFact(ecology, actorId, completed, {
      salience: completed.salience,
      valence: fact.valence ?? 0,
    });
  }
  return completed;
}

function appendMarketAction(ecology, fact, action) {
  const completed = {
    id: nextRecordId(ecology, 'social_market_action'),
    schemaVersion: 'lzy-social-business-action-v1',
    tick: fact.tick,
    factId: fact.id,
    type: action.type,
    organizationId: action.organizationId,
    visibility: 'public',
    status: 'pending_adapter',
    payload: clone(action.payload ?? {}),
  };
  ecology.marketActionOutbox.push(completed);
  while (ecology.marketActionOutbox.length > MAX_MARKET_ACTIONS) {
    const removed = ecology.marketActionOutbox.shift();
    ecology.archive.marketActionCount += 1;
    ecology.archive.marketActionDigest = hashString(
      `${ecology.archive.marketActionDigest}|${removed.id}|${removed.factId}|${removed.type}`,
    ).toString(16);
    delete ecology.archive.factReferenceIndex[removed.factId];
  }
  return completed;
}

function compactFacts(ecology) {
  while (ecology.facts.length > MAX_LIVE_FACTS) {
    const remembered = new Set(
      Object.values(ecology.actors).flatMap((actor) =>
        (actor.memories ?? []).map((memory) => memory.factId),
      ),
    );
    const outboxFactIds = new Set(
      ecology.marketActionOutbox.map((action) => action.factId),
    );
    let index = ecology.facts.findIndex(
      (fact) =>
        !remembered.has(fact.id) &&
        !outboxFactIds.has(fact.id),
    );
    if (index < 0) index = 0;
    const [removed] = ecology.facts.splice(index, 1);
    ecology.archive.factCount += 1;
    ecology.archive.factDigest = hashString(
      `${ecology.archive.factDigest}|${removed.id}|${removed.tick}|${removed.type}|${JSON.stringify(removed.resourceDelta)}|${JSON.stringify(removed.relationshipDelta)}`,
    ).toString(16);
    if (remembered.has(removed.id) || outboxFactIds.has(removed.id)) {
      ecology.archive.factReferenceIndex[removed.id] =
        ecology.archive.factDigest;
    }
  }
  const requiredReferences = new Set([
    ...Object.values(ecology.actors).flatMap((actor) =>
      (actor.memories ?? []).map((memory) => memory.factId),
    ),
    ...ecology.marketActionOutbox.map((action) => action.factId),
  ]);
  for (const factId of Object.keys(
    ecology.archive.factReferenceIndex,
  )) {
    if (!requiredReferences.has(factId)) {
      delete ecology.archive.factReferenceIndex[factId];
    }
  }
}

function compactClosedEntities(ecology) {
  const terminalContracts = Object.values(ecology.contracts)
    .filter((contract) => contract.status !== 'active')
    .sort(
      (left, right) =>
        Number(
          left.completedTick ?? left.dueTick ?? left.signedTick ?? 0,
        ) -
          Number(
            right.completedTick ??
              right.dueTick ??
              right.signedTick ??
              0,
          ) ||
        left.id.localeCompare(right.id),
    );
  while (
    Object.keys(ecology.contracts).length > MAX_CONTRACTS &&
    terminalContracts.length > 0
  ) {
    const removed = terminalContracts.shift();
    delete ecology.contracts[removed.id];
    ecology.archive.contractCount =
      Number(ecology.archive.contractCount ?? 0) + 1;
    ecology.archive.contractDigest = hashString(
      `${ecology.archive.contractDigest ?? '00000000'}|${removed.id}|${removed.kind}|${removed.status}|${removed.signedTick}|${removed.completedTick ?? ''}|${removed.amount}`,
    ).toString(16);
  }

  const referencedOpportunityIds = new Set(
    Object.values(ecology.contracts)
      .filter((contract) => contract.status === 'active')
      .map((contract) => contract.opportunityId)
      .filter(Boolean),
  );
  const terminalOpportunities = Object.values(ecology.opportunities)
    .filter(
      (opportunity) =>
        !['open', 'awarded'].includes(opportunity.status) &&
        !referencedOpportunityIds.has(opportunity.id),
    )
    .sort(
      (left, right) =>
        Number(left.expiresTick ?? left.createdTick ?? 0) -
          Number(right.expiresTick ?? right.createdTick ?? 0) ||
        left.id.localeCompare(right.id),
    );
  while (
    Object.keys(ecology.opportunities).length >
      MAX_OPPORTUNITIES &&
    terminalOpportunities.length > 0
  ) {
    const removed = terminalOpportunities.shift();
    delete ecology.opportunities[removed.id];
    ecology.archive.opportunityCount =
      Number(ecology.archive.opportunityCount ?? 0) + 1;
    ecology.archive.opportunityDigest = hashString(
      `${ecology.archive.opportunityDigest ?? '00000000'}|${removed.id}|${removed.status}|${removed.createdTick}|${removed.expiresTick}|${removed.reward}`,
    ).toString(16);
  }
  if (ecology.player?.knownOpportunityIds) {
    ecology.player.knownOpportunityIds =
      ecology.player.knownOpportunityIds
        .filter((opportunityId) =>
          Object.hasOwn(ecology.opportunities, opportunityId),
        )
        .slice(-24);
  }
}

function getRelationship(ecology, leftId, rightId) {
  const key = relationKey(leftId, rightId);
  if (!ecology.relationships[key]) {
    ecology.relationships[key] = {
      id: `relationship_${hashString(key).toString(16)}`,
      leftId,
      rightId,
      trust: 34,
      familiarity: 8,
      respect: 36,
      conflict: 0,
      obligation: 0,
      lastInteractionTick: ecology.lastSettledTick,
      interactionCount: 0,
    };
  }
  return ecology.relationships[key];
}

function adjustRelationship(ecology, leftId, rightId, delta) {
  const relationship = getRelationship(ecology, leftId, rightId);
  for (const field of [
    'trust',
    'familiarity',
    'respect',
    'conflict',
    'obligation',
  ]) {
    relationship[field] = Number(
      clamp(
        relationship[field] + Number(delta[field] ?? 0),
        0,
        100,
      ).toFixed(3),
    );
  }
  relationship.lastInteractionTick = ecology.lastSettledTick;
  relationship.interactionCount += 1;
  return relationship;
}

function employmentForActor(ecology, actorId) {
  return Object.values(ecology.contracts).find(
    (contract) =>
      contract.kind === 'employment' &&
      contract.status === 'active' &&
      contract.workerId === actorId,
  );
}

function managedOrganization(ecology, actorId) {
  return Object.values(ecology.organizations).find(
    (organization) => organization.decisionWriter === actorId,
  );
}

function journal(type, description, debitAccount, creditAccount, amount) {
  const settledAmount = money(amount);
  return {
    type,
    description,
    postings: [
      {
        account: debitAccount,
        debit: settledAmount,
        credit: 0,
      },
      {
        account: creditAccount,
        debit: 0,
        credit: settledAmount,
      },
    ],
  };
}

function choosePartner(ecology, actorId, tick, purpose) {
  const candidates = Object.values(ecology.actors)
    .filter((actor) => actor.id !== actorId)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (candidates.length === 0) return null;
  const index = Math.floor(
    deterministicUnit(ecology, tick, actorId, purpose) *
      candidates.length,
  );
  return candidates[Math.min(candidates.length - 1, index)];
}

function chooseLocation(ecology, actorId, tick) {
  const locations = Object.values(ecology.locations).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const index = Math.floor(
    deterministicUnit(ecology, tick, actorId, 'visit') *
      locations.length,
  );
  return locations[Math.min(locations.length - 1, index)];
}

function skillMatch(actor, organization) {
  return Math.max(
    actor.skills.finance * organization.capabilities.research,
    actor.skills.craft * organization.capabilities.craft,
    actor.skills.sales * organization.capabilities.sales,
    actor.skills.operations * organization.capabilities.delivery,
  );
}

function organizationOpportunityFit(organization, opportunity) {
  return Number(
    clamp(
      organization.capabilities[opportunity.need] ?? 0,
      0,
      1,
    ).toFixed(6),
  );
}

const OPPORTUNITY_SKILL = Object.freeze({
  craft: 'craft',
  research: 'finance',
  delivery: 'operations',
  sales: 'sales',
});

function serviceDeliveryWorkforce(ecology, provider, opportunity) {
  const skill = OPPORTUNITY_SKILL[opportunity.need] ?? opportunity.need;
  const workers = provider.staffIds
    .map((actorId) => ecology.actors[actorId])
    .filter(Boolean)
    .filter((actor) => {
      const employment = employmentForActor(ecology, actor.id);
      return (
        employment?.employerOrgId === provider.id &&
        actor.availability?.asOfTick === ecology.lastSettledTick &&
        actor.availability?.status === 'working'
      );
    })
    .map((actor) => ({
      actorId: actor.id,
      skill: clamp(actor.skills?.[skill] ?? 0, 0, 1),
      energyFactor: clamp(0.55 + actor.energy / 220, 0.55, 1),
    }));

  if (provider.decisionWriter === 'player') {
    workers.push({
      actorId: 'player',
      skill: clamp(provider.capabilities?.[opportunity.need] ?? 0, 0, 1),
      energyFactor: 0.9,
    });
  }

  const activeWorkerIds = workers
    .map((worker) => worker.actorId)
    .sort((left, right) => left.localeCompare(right));
  const averageSkill =
    workers.length === 0
      ? 0
      : workers.reduce(
          (sum, worker) =>
            sum + worker.skill * worker.energyFactor,
          0,
        ) / workers.length;
  const capacityShare = clamp(
    workers.length / Math.max(1, provider.capacity),
    0,
    1,
  );
  const organizationFit = organizationOpportunityFit(
    provider,
    opportunity,
  );
  const effectiveFit =
    workers.length === 0
      ? 0
      : clamp(
          organizationFit * (0.55 + capacityShare * 0.2) +
            averageSkill * 0.35,
          0,
          1,
        );

  return {
    asOfTick: ecology.lastSettledTick,
    skill,
    activeWorkerIds,
    organizationFit: Number(organizationFit.toFixed(6)),
    averageSkill: Number(averageSkill.toFixed(6)),
    capacityShare: Number(capacityShare.toFixed(6)),
    effectiveFit: Number(effectiveFit.toFixed(6)),
    reasonCodes:
      workers.length === 0
        ? ['no_matching_worker_on_shift']
        : provider.decisionWriter === 'player'
          ? ['player_managed_shift', 'matching_skill_available']
          : ['employed_worker_on_shift', 'matching_skill_available'],
  };
}

function candidateScores(ecology, actor, tick) {
  const employment = employmentForActor(ecology, actor.id);
  const managerOf = managedOrganization(ecology, actor.id);
  const cashNeed = clamp(1 - actor.cash / 60_000, 0, 1);
  const energyNeed = clamp(1 - actor.energy / 60, 0, 1);
  const candidates = [
    {
      activity: 'rest',
      score:
        0.12 +
        energyNeed * 1.65 +
        actor.traits.patience * 0.15,
      reasonCodes: ['energy', 'recovery'],
    },
    {
      activity: 'network',
      score:
        0.25 +
        actor.traits.sociability * 0.55 +
        actor.preferences.belonging * 0.35 +
        (1 - cashNeed) * 0.15,
      reasonCodes: ['belonging', 'future_options'],
    },
    {
      activity: 'cooperate',
      score:
        0.2 +
        actor.traits.reciprocity * 0.38 +
        actor.preferences.craft * 0.24 +
        actor.energy / 400,
      reasonCodes: ['reciprocity', 'craft'],
    },
    {
      activity: 'visit',
      score:
        0.22 +
        actor.traits.sociability * 0.25 +
        actor.preferences.autonomy * 0.2,
      reasonCodes: ['place', 'autonomy'],
    },
  ];
  if (employment) {
    const organization = ecology.organizations[employment.employerOrgId];
    const wageAffordable =
      organization?.cash >= money(organization.wagePerShift / 5);
    const onSchedule = scheduledToWork(actor, tick);
    candidates.push({
      activity: wageAffordable ? 'work' : 'quit',
      score:
        0.55 +
        actor.traits.reliability * 0.75 +
        actor.preferences.security * 0.35 +
        cashNeed * 0.5 +
        (wageAffordable ? 0.15 : 0.72) +
        (onSchedule ? 0.24 : -0.82),
      reasonCodes: wageAffordable
        ? [
            'commitment',
            'income',
            onSchedule
              ? 'scheduled_shift'
              : 'scheduled_rest_day',
          ]
        : ['employer_shortfall', 'right_to_leave'],
    });
  } else {
    candidates.push({
      activity: 'seek_work',
      score:
        0.15 +
        cashNeed * 1.4 +
        actor.preferences.security * 0.5 +
        actor.preferences.wealth * 0.25,
      reasonCodes: ['income', 'security'],
    });
  }
  if (
    managerOf &&
    Object.values(ecology.opportunities).some(
      (opportunity) =>
        opportunity.status === 'open' &&
        opportunity.clientOrgId !== managerOf.id,
    )
  ) {
    candidates.push({
      activity: 'bid_opportunity',
      score:
        0.32 +
        actor.traits.ambition * 0.55 +
        actor.preferences.wealth * 0.38 +
        clamp(managerOf.cash / 200_000, 0, 1) * 0.12,
      reasonCodes: ['growth', managerOf.objective],
    });
  }
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: Number(
        (
          candidate.score +
          (deterministicUnit(
            ecology,
            tick,
            actor.id,
            candidate.activity,
            actor.actionSequence,
          ) -
            0.5) *
            0.18
        ).toFixed(6),
      ),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.activity.localeCompare(right.activity),
    );
}

function executeWork(ecology, actor, result) {
  const employment = employmentForActor(ecology, actor.id);
  const organization = employment
    ? ecology.organizations[employment.employerOrgId]
    : null;
  if (!employment || !organization) {
    return executeSeekWork(ecology, actor, result);
  }
  const wage = money(
    Number(employment.amount ?? organization.wagePerShift) / 5,
  );
  if (organization.cash < wage) {
    return executeSeekWork(ecology, actor, result);
  }
  organization.cash = money(organization.cash - wage);
  organization.costs = money(organization.costs + wage);
  actor.cash = money(actor.cash + wage);
  actor.energy = clamp(actor.energy - 9, 0, 100);
  actor.locationId = organization.locationId;
  actor.currentActivity = `在${organization.name}完成了一班工作`;
  actor.reputation = clamp(
    actor.reputation + actor.traits.reliability * 0.08,
    0,
    100,
  );
  employment.progress = Number(
    (Number(employment.progress ?? 0) + 1).toFixed(3),
  );
  const fact = appendFact(ecology, {
    type: 'work_completed',
    actorIds: [actor.id],
    organizationIds: [organization.id],
    locationId: organization.locationId,
    contractId: employment.id,
    reasonCodes: ['employment_commitment', 'wage'],
    resourceDelta: {
      [actor.id]: wage,
      [organization.id]: -wage,
    },
    salience: 0.38,
    valence: 0.2,
  });
  result.journals.push(
    journal(
      'social_employment_wage',
      `${organization.name}支付工作报酬`,
      `social.actor.${actor.id}.cash`,
      `social.organization.${organization.id}.cash`,
      wage,
    ),
  );
  return fact;
}

function executeSeekWork(ecology, actor) {
  const employers = Object.values(ecology.organizations)
    .filter(
      (organization) =>
        organization.decisionWriter !== 'player' &&
        organization.staffIds.length < organization.capacity &&
        organization.cash >= organization.wagePerShift,
    )
    .map((organization) => ({
      organization,
      fit: skillMatch(actor, organization),
    }))
    .sort(
      (left, right) =>
        right.fit - left.fit ||
        left.organization.id.localeCompare(right.organization.id),
    );
  const selected = employers[0];
  const acceptance =
    selected
      ? selected.fit * 0.62 +
        actor.traits.reliability * 0.25 +
        deterministicUnit(
          ecology,
          ecology.lastSettledTick,
          actor.id,
          selected.organization.id,
          'employment',
        ) *
          0.13
      : 0;
  if (!selected || acceptance < 0.48) {
    actor.currentActivity = '问了几处工作，还没有谈妥';
    actor.energy = clamp(actor.energy - 3, 0, 100);
    return appendFact(ecology, {
      type: 'negotiation_rejected',
      actorIds: [actor.id],
      organizationIds: selected ? [selected.organization.id] : [],
      locationId: actor.locationId,
      reasonCodes: selected
        ? ['skill_fit_too_low']
        : ['no_open_position'],
      salience: 0.42,
      valence: -0.3,
    });
  }
  const organization = selected.organization;
  const contractId = nextRecordId(ecology, 'social_contract');
  ecology.contracts[contractId] = {
    id: contractId,
    kind: 'employment',
    status: 'active',
    employerOrgId: organization.id,
    workerId: actor.id,
    clientOrgId: null,
    providerOrgId: null,
    opportunityId: null,
    signedTick: ecology.lastSettledTick,
    dueTick: null,
    completedTick: null,
    amount: organization.wagePerShift,
    progress: 0,
    commitmentLock: true,
  };
  organization.staffIds.push(actor.id);
  actor.employerOrgId = organization.id;
  actor.currentActivity = `刚和${organization.name}谈妥工作`;
  actor.commitmentLock = {
    contractId,
    untilTick: ecology.lastSettledTick + 3,
  };
  ecology.metrics.acceptedNegotiations += 1;
  return appendFact(ecology, {
    type: 'employment_started',
    actorIds: [actor.id, organization.decisionWriter],
    organizationIds: [organization.id],
    locationId: organization.locationId,
    contractId,
    reasonCodes: ['open_position', 'skill_fit', 'mutual_consent'],
    salience: 0.7,
    valence: 0.6,
  });
}

function executeQuit(ecology, actor) {
  const employment = employmentForActor(ecology, actor.id);
  if (!employment) return executeSeekWork(ecology, actor);
  const organization =
    ecology.organizations[employment.employerOrgId];
  employment.status = 'ended';
  employment.completedTick = ecology.lastSettledTick;
  employment.endReason = 'employer_shortfall';
  organization.staffIds = organization.staffIds.filter(
    (actorId) => actorId !== actor.id,
  );
  actor.employerOrgId = null;
  actor.commitmentLock = null;
  actor.locationId = 'place_teahouse';
  actor.currentActivity = `离开了暂时付不起报酬的${organization.name}`;
  const managerId = organization.decisionWriter;
  const delta = {
    trust: -4,
    familiarity: 1,
    respect: -2,
    conflict: 3,
  };
  if (managerId !== actor.id && ecology.actors[managerId]) {
    adjustRelationship(ecology, actor.id, managerId, delta);
  }
  return appendFact(ecology, {
    type: 'employment_ended',
    actorIds: [
      actor.id,
      ...(managerId !== actor.id ? [managerId] : []),
    ],
    organizationIds: [organization.id],
    locationId: organization.locationId,
    contractId: employment.id,
    reasonCodes: ['employer_shortfall', 'worker_withdrew'],
    relationshipDelta:
      managerId !== actor.id
        ? {
            [relationKey(actor.id, managerId)]: delta,
          }
        : {},
    salience: 0.76,
    valence: -0.5,
  });
}

function executeNetwork(ecology, actor) {
  const partner = choosePartner(
    ecology,
    actor.id,
    ecology.lastSettledTick,
    'network',
  );
  if (!partner) return null;
  const reliabilityGap = Math.abs(
    actor.traits.reliability - partner.traits.reliability,
  );
  const trustDelta =
    reliabilityGap < 0.34
      ? 1.5 + actor.traits.reciprocity
      : -0.4;
  const delta = {
    trust: trustDelta,
    familiarity: 3.5,
    respect:
      (actor.skills.finance +
        actor.skills.craft +
        actor.skills.sales +
        actor.skills.operations) /
        8,
    conflict: reliabilityGap > 0.52 ? 0.8 : -0.2,
  };
  adjustRelationship(ecology, actor.id, partner.id, delta);
  actor.locationId = partner.locationId;
  actor.energy = clamp(actor.energy - 2, 0, 100);
  actor.currentActivity = `刚和${partner.name}交换了近况`;
  return appendFact(ecology, {
    type: 'contact',
    actorIds: [actor.id, partner.id],
    organizationIds: [],
    locationId: actor.locationId,
    reasonCodes: ['future_options', 'social_contact'],
    relationshipDelta: {
      [relationKey(actor.id, partner.id)]: delta,
    },
    salience: 0.34,
    valence: trustDelta >= 0 ? 0.2 : -0.15,
  });
}

function executeCooperation(ecology, actor) {
  const partner = choosePartner(
    ecology,
    actor.id,
    ecology.lastSettledTick,
    'cooperate',
  );
  if (!partner) return null;
  const relationship = getRelationship(ecology, actor.id, partner.id);
  const compatible =
    actor.traits.reciprocity +
      partner.traits.reciprocity +
      relationship.trust / 100 >
    1.18;
  const delta = compatible
    ? { trust: 2.2, familiarity: 2, respect: 1.5, conflict: -0.5 }
    : { trust: -0.8, familiarity: 1.5, respect: -0.3, conflict: 1.8 };
  adjustRelationship(ecology, actor.id, partner.id, delta);
  actor.energy = clamp(actor.energy - 4, 0, 100);
  actor.currentActivity = compatible
    ? `和${partner.name}合做一件小事`
    : `和${partner.name}试着合作，但节奏没对上`;
  return appendFact(ecology, {
    type: compatible ? 'cooperation' : 'negotiation_rejected',
    actorIds: [actor.id, partner.id],
    organizationIds: [],
    locationId: actor.locationId,
    reasonCodes: compatible
      ? ['mutual_benefit', 'reciprocity']
      : ['working_style_conflict'],
    relationshipDelta: {
      [relationKey(actor.id, partner.id)]: delta,
    },
    salience: compatible ? 0.5 : 0.46,
    valence: compatible ? 0.35 : -0.3,
  });
}

function executeVisit(ecology, actor) {
  const location = chooseLocation(
    ecology,
    actor.id,
    ecology.lastSettledTick,
  );
  actor.locationId = location.id;
  actor.energy = clamp(actor.energy - 3, 0, 100);
  actor.currentActivity = `去了${location.name}`;
  return appendFact(ecology, {
    type: 'visit',
    actorIds: [actor.id],
    organizationIds: [],
    locationId: location.id,
    reasonCodes: ['place_affordance', 'autonomy'],
    salience: 0.24,
  });
}

function executeRest(ecology, actor) {
  actor.energy = clamp(actor.energy + 23, 0, 100);
  actor.locationId =
    actor.preferences.belonging > 0.66
      ? 'place_riverside_block'
      : 'place_teahouse';
  actor.currentActivity = '暂时歇一歇';
  return appendFact(ecology, {
    type: 'rest',
    actorIds: [actor.id],
    organizationIds: [],
    locationId: actor.locationId,
    reasonCodes: ['recovery', 'energy'],
    salience: 0.2,
  });
}

function executeBidOpportunity(ecology, actor) {
  const organization = managedOrganization(ecology, actor.id);
  if (!organization) {
    return executeSeekWork(ecology, actor);
  }
  const candidates = Object.values(ecology.opportunities)
    .filter(
      (opportunity) =>
        opportunity.status === 'open' &&
        opportunity.clientOrgId !== organization.id,
    )
    .map((opportunity) => ({
      opportunity,
      fit: organizationOpportunityFit(organization, opportunity),
    }))
    .sort(
      (left, right) =>
        right.fit - left.fit ||
        left.opportunity.id.localeCompare(right.opportunity.id),
    );
  const selected = candidates[0];
  if (!selected) {
    return executeNetwork(ecology, actor);
  }
  const opportunity = selected.opportunity;
  const relationship = getRelationship(
    ecology,
    actor.id,
    ecology.organizations[opportunity.clientOrgId].decisionWriter,
  );
  const acceptance =
    selected.fit * 0.7 +
    relationship.trust / 100 * 0.12 +
    actor.reputation / 100 * 0.08 +
    deterministicUnit(
      ecology,
      ecology.lastSettledTick,
      actor.id,
      opportunity.id,
      'bid',
    ) *
      0.1;
  if (acceptance < opportunity.difficulty) {
    actor.currentActivity = '报了价，对方没有接受';
    ecology.metrics.rejectedNegotiations += 1;
    return appendFact(ecology, {
      type: 'negotiation_rejected',
      actorIds: [
        actor.id,
        ecology.organizations[opportunity.clientOrgId].decisionWriter,
      ],
      organizationIds: [organization.id, opportunity.clientOrgId],
      locationId: opportunity.locationId,
      opportunityId: opportunity.id,
      reasonCodes: ['bid_not_competitive', 'client_refusal'],
      salience: 0.48,
      valence: -0.25,
    });
  }
  const contractId = nextRecordId(ecology, 'social_contract');
  ecology.contracts[contractId] = {
    id: contractId,
    kind: 'service',
    status: 'active',
    employerOrgId: null,
    workerId: null,
    clientOrgId: opportunity.clientOrgId,
    providerOrgId: organization.id,
    opportunityId: opportunity.id,
    signedTick: ecology.lastSettledTick,
    dueTick: ecology.lastSettledTick + opportunity.durationDays,
    completedTick: null,
    amount: opportunity.reward,
    progress: 0,
    commitmentLock: true,
  };
  opportunity.status = 'awarded';
  opportunity.awardedProviderOrgId = organization.id;
  organization.lastDecisionTick = ecology.lastSettledTick;
  actor.currentActivity = '刚谈下一份新单';
  ecology.metrics.acceptedNegotiations += 1;
  const fact = appendFact(ecology, {
    type: 'contract_signed',
    actorIds: [
      actor.id,
      ecology.organizations[opportunity.clientOrgId].decisionWriter,
    ],
    organizationIds: [organization.id, opportunity.clientOrgId],
    locationId: opportunity.locationId,
    contractId,
    opportunityId: opportunity.id,
    reasonCodes: ['competitive_bid', 'client_consent', 'capacity_reserved'],
    salience: 0.76,
    valence: 0.55,
  });
  appendMarketAction(ecology, fact, {
    type: 'business_contract_signed',
    organizationId: organization.id,
    payload: {
      contractId,
      clientOrgId: opportunity.clientOrgId,
      amount: opportunity.reward,
      dueTick: ecology.lastSettledTick + opportunity.durationDays,
    },
  });
  return fact;
}

function settleServiceContracts(ecology, result) {
  for (const contract of Object.values(ecology.contracts)
    .filter(
      (candidate) =>
        candidate.kind === 'service' &&
        candidate.status === 'active',
    )
    .sort((left, right) => left.id.localeCompare(right.id))) {
    const provider = ecology.organizations[contract.providerOrgId];
    const client = ecology.organizations[contract.clientOrgId];
    const opportunity = ecology.opportunities[contract.opportunityId];
    if (!provider || !client || !opportunity) continue;
    const workforce = serviceDeliveryWorkforce(
      ecology,
      provider,
      opportunity,
    );
    contract.lastDeliveryWorkforce = workforce;
    const deliveryRate =
      workforce.activeWorkerIds.length === 0
        ? 0
        : clamp(
            (
              workforce.effectiveFit /
              Math.max(0.1, opportunity.difficulty)
            ) *
              (0.75 + workforce.capacityShare * 0.45),
            0.12,
            1.3,
          ) / Math.max(1, opportunity.durationDays);
    contract.progress = Number(
      clamp(
        contract.progress + deliveryRate,
        0,
        1.2,
      ).toFixed(6),
    );
    if (contract.progress >= 1 && client.cash >= contract.amount) {
      client.cash = money(client.cash - contract.amount);
      client.costs = money(client.costs + contract.amount);
      provider.cash = money(provider.cash + contract.amount);
      provider.revenue = money(provider.revenue + contract.amount);
      provider.completedContracts += 1;
      contract.status = 'completed';
      contract.completedTick = ecology.lastSettledTick;
      opportunity.status = 'completed';
      ecology.metrics.completedContracts += 1;
      const fact = appendFact(ecology, {
        type: 'contract_completed',
        actorIds: [
          provider.decisionWriter,
          client.decisionWriter,
        ].filter((actorId) => actorId !== 'player'),
        organizationIds: [provider.id, client.id],
        locationId: opportunity.locationId,
        contractId: contract.id,
        opportunityId: opportunity.id,
        reasonCodes: ['delivery_accepted', 'cash_settled'],
        resourceDelta: {
          [provider.id]: contract.amount,
          [client.id]: -contract.amount,
        },
        salience: 0.82,
        valence: 0.7,
      });
      result.journals.push(
        journal(
          'social_service_contract_settlement',
          `${client.name}结清${provider.name}的服务合同`,
          `social.organization.${provider.id}.cash`,
          `social.organization.${client.id}.cash`,
          contract.amount,
        ),
      );
      appendMarketAction(ecology, fact, {
        type: 'business_contract_completed',
        organizationId: provider.id,
        payload: {
          contractId: contract.id,
          clientOrgId: client.id,
          amount: contract.amount,
          completedTick: ecology.lastSettledTick,
        },
      });
    } else if (ecology.lastSettledTick > contract.dueTick) {
      contract.status = 'defaulted';
      provider.missedCommitments += 1;
      opportunity.status = 'expired';
      ecology.metrics.brokenCommitments += 1;
      appendFact(ecology, {
        type: 'contract_defaulted',
        actorIds: [
          provider.decisionWriter,
          client.decisionWriter,
        ].filter((actorId) => actorId !== 'player'),
        organizationIds: [provider.id, client.id],
        locationId: opportunity.locationId,
        contractId: contract.id,
        opportunityId: opportunity.id,
        reasonCodes: ['deadline_missed', 'capacity_shortfall'],
        salience: 0.88,
        valence: -0.75,
      });
    }
  }
}

function refreshOpportunities(ecology) {
  const openCount = Object.values(ecology.opportunities).filter(
    (opportunity) => opportunity.status === 'open',
  ).length;
  if (openCount >= 2 || ecology.lastSettledTick % 5 !== 0) return;
  const organizations = Object.values(ecology.organizations)
    .filter((organization) => organization.decisionWriter !== 'player')
    .sort((left, right) => left.id.localeCompare(right.id));
  const needs = ['craft', 'research', 'delivery', 'sales'];
  const client =
    organizations[
      Math.floor(
        deterministicUnit(
          ecology,
          ecology.lastSettledTick,
          'new-opportunity-client',
        ) * organizations.length,
      )
    ];
  const need =
    needs[
      Math.floor(
        deterministicUnit(
          ecology,
          ecology.lastSettledTick,
          'new-opportunity-need',
        ) * needs.length,
      )
    ];
  const reward = money(
    6_000 +
      deterministicUnit(
        ecology,
        ecology.lastSettledTick,
        'new-opportunity-reward',
      ) *
        18_000,
  );
  const id = nextRecordId(ecology, 'social_opportunity');
  const locationIds = Object.keys(ecology.locations).sort();
  const locationId =
    locationIds[
      Math.floor(
        deterministicUnit(ecology, id, 'location') *
          locationIds.length,
      )
    ];
  ecology.opportunities[id] = {
    id,
    clientOrgId: client.id,
    locationId,
    need,
    reward,
    difficulty: Number(
      (
        0.42 +
        deterministicUnit(ecology, id, 'difficulty') * 0.28
      ).toFixed(6),
    ),
    durationDays:
      2 + Math.floor(deterministicUnit(ecology, id, 'duration') * 4),
    status: 'open',
    createdTick: ecology.lastSettledTick,
    expiresTick: ecology.lastSettledTick + 8,
    awardedProviderOrgId: null,
    sourceFactId: null,
  };
  const fact = appendFact(ecology, {
    type: 'opportunity_opened',
    actorIds: [client.decisionWriter],
    organizationIds: [client.id],
    locationId,
    opportunityId: id,
    reasonCodes: ['operating_need', need],
    salience: 0.56,
  });
  ecology.opportunities[id].sourceFactId = fact.id;
}

function processResearchReports(
  ecology,
  service,
  {
    analyst,
    processingMode,
    providerOrgId,
    count,
    qualityBps,
    errorBandBps,
  },
  result,
) {
  const client =
    ecology.organizations[service.clientOrgId];
  const provider =
    providerOrgId === null
      ? null
      : ecology.organizations[
          providerOrgId ?? service.providerOrgId
        ];
  const internal =
    processingMode === 'internal_researcher';
  const feePerReport =
    internal
      ? 0
      : processingMode === 'lead_researcher'
      ? service.leadFeePerReport
      : service.substituteFeePerReport;
  const affordableCount = Math.min(
    count,
    internal
      ? count
      : Math.floor(
          Number(client?.cash ?? 0) /
            Math.max(1, feePerReport),
        ),
  );
  if (
    !client ||
    !analyst ||
    affordableCount <= 0
  ) {
    return [];
  }
  const symbols = [];
  for (
    let index = 0;
    index < affordableCount;
    index += 1
  ) {
    const symbol =
      service.coverageSymbols[
        service.nextCoverageIndex %
          service.coverageSymbols.length
      ];
    service.nextCoverageIndex =
      (
        service.nextCoverageIndex + 1
      ) %
      service.coverageSymbols.length;
    service.reportsBySymbol[symbol] = {
      symbol,
      processedTick: ecology.lastSettledTick,
      analystId: analyst.id,
      processingMode,
      qualityBps,
      errorBandBps,
      inputAuthority: 'public_company_facts',
      informationDelayDays:
        [
          'lead_researcher',
          'internal_researcher',
        ].includes(processingMode)
          ? 0
          : 2,
      providerOrgId: provider?.id ?? null,
      modelRevision:
        (
          service.reportsBySymbol[symbol]
            ?.modelRevision ?? 0
        ) + 1,
    };
    symbols.push(symbol);
  }
  const totalFee = money(
    affordableCount * feePerReport,
  );
  if (!internal) {
    client.cash = money(client.cash - totalFee);
  }
  if (processingMode === 'lead_researcher' && provider) {
    provider.cash = money(provider.cash + totalFee);
    provider.revenue = money(
      provider.revenue + totalFee,
    );
  } else if (!internal) {
    analyst.cash = money(analyst.cash + totalFee);
    analyst.energy = clamp(
      analyst.energy - 7,
      0,
      100,
    );
  } else {
    analyst.energy = clamp(
      analyst.energy - 4,
      0,
      100,
    );
  }
  if (!internal) {
    const payeeAccount =
      processingMode === 'lead_researcher'
        ? `social.organization.${provider.id}.cash`
        : `social.actor.${analyst.id}.cash`;
    result.journals.push(
      journal(
        'social_research_service_settlement',
        processingMode === 'lead_researcher'
          ? '机构研究服务结算'
          : '替补资料整理结算',
        payeeAccount,
        `social.organization.${client.id}.cash`,
        totalFee,
      ),
    );
  }
  appendFact(ecology, {
    type: 'research_model_updated',
    actorIds: [analyst.id],
    organizationIds: [
      ...new Set([
        client.id,
        ...(provider ? [provider.id] : []),
      ]),
    ],
    locationId:
      provider?.locationId ?? analyst.locationId,
    reasonCodes: [
      processingMode,
      'public_inputs_processed',
      ...symbols.map((symbol) => `coverage:${symbol}`),
    ],
    resourceDelta: internal
      ? {}
      : {
          [client.id]: -totalFee,
          [processingMode === 'lead_researcher'
            ? provider.id
            : analyst.id]: totalFee,
        },
    visibility: 'client_org',
    salience: 0.52,
  });
  return symbols;
}

function workingResearcherAtOrganization(
  ecology,
  organizationId,
) {
  const organization =
    ecology.organizations[organizationId];
  return (organization?.staffIds ?? [])
    .map((actorId) => ecology.actors[actorId])
    .filter((actor) => {
      const employment = employmentForActor(
        ecology,
        actor?.id,
      );
      return Boolean(
        actor &&
        employment?.employerOrgId === organizationId &&
        actor.employerOrgId === organizationId &&
        actor.availability?.asOfTick ===
          ecology.lastSettledTick &&
        actor.availability.status === 'working' &&
        Number(actor.skills?.finance) > 0,
      );
    })
    .sort(
      (left, right) =>
        Number(right.skills.finance) -
          Number(left.skills.finance) ||
        right.energy - left.energy ||
        left.id.localeCompare(right.id),
    )[0] ?? null;
}

function settleResearchAccess(ecology, result) {
  const service = ensureResearchNetwork(ecology);
  const lead = ecology.actors[service.leadActorId];
  const substitute =
    ecology.actors[service.substituteActorId];
  const employment = employmentForActor(
    ecology,
    service.leadActorId,
  );
  const internalResearcher =
    workingResearcherAtOrganization(
      ecology,
      service.clientOrgId,
    );
  const providerResearcher =
    workingResearcherAtOrganization(
      ecology,
      service.providerOrgId,
    );
  const primaryResearcher =
    internalResearcher ?? providerResearcher;
  const primaryMode = internalResearcher
    ? 'internal_researcher'
    : providerResearcher
      ? 'lead_researcher'
      : null;
  const processingOrgId = internalResearcher
    ? service.clientOrgId
    : providerResearcher
      ? service.providerOrgId
      : null;
  const leadWorking =
    primaryResearcher?.id === lead?.id;
  const leadStatus = !employment
    ? 'between_jobs'
    : leadWorking
      ? 'working'
      : lead.availability?.status ?? 'off_duty';
  service.availability = {
    asOfTick: ecology.lastSettledTick,
    leadStatus,
    serviceStatus: service.active
      ? primaryResearcher
        ? primaryMode === 'internal_researcher'
          ? 'internal_processing'
          : 'lead_processing'
        : 'public_only'
      : 'public_only',
    leadAvailable:
      Boolean(service.active && primaryResearcher),
    processingActorId:
      primaryResearcher?.id ?? null,
    processingOrgId,
    substituteUsed: false,
    reasonCodes: service.active
      ? primaryResearcher
        ? [
            primaryMode === 'internal_researcher'
              ? 'client_researcher_on_shift'
              : 'provider_researcher_on_shift',
          ]
        : ['lead_not_available']
      : ['no_internal_research_contract'],
  };
  if (!service.active) return;
  if (primaryResearcher) {
    const fatigue = Math.max(
      0,
      100 - primaryResearcher.energy,
    );
    const symbols = processResearchReports(
      ecology,
      service,
      {
        analyst: primaryResearcher,
        processingMode: primaryMode,
        providerOrgId: processingOrgId,
        count: service.leadBatchSize,
        qualityBps: Math.round(
          clamp(
            8_100 +
              primaryResearcher.skills.finance * 1_500 -
              fatigue * 5,
            8_000,
            9_600,
          ),
        ),
        errorBandBps: Math.round(
          clamp(
            1_800 -
              primaryResearcher.skills.finance * 850 +
              fatigue * 4,
            700,
            2_200,
          ),
        ),
      },
      result,
    );
    if (symbols.length === 0) {
      service.availability.serviceStatus =
        'public_only';
      service.availability.reasonCodes.push(
        'research_budget_unavailable',
      );
    }
    return;
  }
  if (
    ecology.lastSettledTick %
      service.substituteCadenceDays !==
      0
  ) {
    return;
  }
  const substituteAvailable =
    substitute?.availability?.asOfTick ===
      ecology.lastSettledTick &&
    substitute.availability.status === 'available';
  if (
    !substitute ||
    substitute.energy < 10 ||
    !substituteAvailable
  ) {
    service.availability.reasonCodes.push(
      !substitute
        ? 'substitute_unassigned'
        : substitute.energy < 10
          ? 'substitute_fatigued'
          : 'substitute_not_available',
    );
    return;
  }
  const symbols = processResearchReports(
    ecology,
    service,
    {
      analyst: substitute,
      processingMode: 'substitute',
      providerOrgId: null,
      count: 1,
      qualityBps: Math.round(
        clamp(
          5_600 +
            substitute.skills.finance * 1_300 -
            (100 - substitute.energy) * 4,
          5_000,
          7_400,
        ),
      ),
      errorBandBps: 2_800,
    },
    result,
  );
  if (symbols.length > 0) {
    service.availability.serviceStatus =
      'substitute_processing';
    service.availability.substituteUsed = true;
    service.availability.reasonCodes.push(
      'slower_paid_substitute',
    );
  }
}

function expireOpportunities(ecology) {
  for (const opportunity of Object.values(ecology.opportunities)) {
    if (
      opportunity.status === 'open' &&
      opportunity.expiresTick < ecology.lastSettledTick
    ) {
      opportunity.status = 'expired';
    }
  }
}

function advanceOneDay(ecology, tick, result) {
  ecology.lastSettledTick = tick;
  expireOpportunities(ecology);
  refreshOpportunities(ecology);
  for (const actor of Object.values(ecology.actors).sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    if (
      actor.commitmentLock &&
      actor.commitmentLock.untilTick <= tick
    ) {
      actor.commitmentLock = null;
    }
    actor.energy = clamp(actor.energy - 1.5, 0, 100);
    const candidates = candidateScores(ecology, actor, tick);
    const choice = candidates[0];
    appendDecision(ecology, {
      actorId: actor.id,
      activity: choice.activity,
      score: choice.score,
      reasonCodes: choice.reasonCodes,
      consideredActivities: candidates
        .slice(0, 4)
        .map((candidate) => candidate.activity),
    });
    let settledFact;
    switch (choice.activity) {
      case 'work':
        settledFact = executeWork(
          ecology,
          actor,
          result,
        );
        break;
      case 'seek_work':
        settledFact = executeSeekWork(
          ecology,
          actor,
          result,
        );
        break;
      case 'quit':
        settledFact = executeQuit(ecology, actor);
        break;
      case 'network':
        settledFact = executeNetwork(ecology, actor);
        break;
      case 'cooperate':
        settledFact = executeCooperation(ecology, actor);
        break;
      case 'visit':
        settledFact = executeVisit(ecology, actor);
        break;
      case 'bid_opportunity':
        settledFact = executeBidOpportunity(
          ecology,
          actor,
        );
        break;
      case 'rest':
      default:
        settledFact = executeRest(ecology, actor);
        break;
    }
    const scheduled = scheduledToWork(actor, tick);
    actor.availability = {
      asOfTick: tick,
      status:
        choice.activity === 'work'
          ? 'working'
          : choice.activity === 'rest'
            ? 'resting'
            : choice.activity === 'quit'
              ? 'between_jobs'
              : [
                    'network',
                    'cooperate',
                    'bid_opportunity',
                  ].includes(choice.activity)
                ? 'busy'
                : 'available',
      scheduledToWork: scheduled,
      reasonCodes: [
        choice.activity,
        scheduled
          ? 'scheduled_workday'
          : 'scheduled_rest_day',
      ],
    };
    const moodDelta = {
      work: 0.03,
      rest: 0.12,
      cooperate: 0.06,
      network: 0.04,
      bid_opportunity: 0.02,
      visit: 0.03,
      seek_work: -0.04,
      quit: -0.12,
    }[choice.activity] ?? 0;
    actor.mood = Number(
      clamp(
        Number(actor.mood ?? 0) * 0.82 +
          moodDelta +
          (
            settledFact?.type ===
            'negotiation_rejected'
              ? -0.06
              : 0
          ),
        -1,
        1,
      ).toFixed(6),
    );
    actor.lastActionTick = tick;
    actor.actionSequence += 1;
    ecology.metrics.autonomousActions += 1;
  }
  settleServiceContracts(ecology, result);
  settleResearchAccess(ecology, result);
  compactFacts(ecology);
  compactClosedEntities(ecology);
}

export function advanceSocialCareerEcology(
  ecology,
  {
    worldTick,
    economyCashAvailable = 0,
  } = {},
) {
  if (!ecology || ecology.schemaVersion !== SCHEMA_VERSION) {
    throw new TypeError('A compatible social-career ecology is required.');
  }
  const targetTick = Math.max(
    ecology.lastSettledTick,
    Math.trunc(Number(worldTick) || 0),
  );
  const next = clone(ecology);
  ensureResearchNetwork(next);
  const result = {
    ecology: next,
    journals: [],
    economyCashDelta: 0,
    playerCashDelta: 0,
    playerAttentionDelta: 0,
    availableEconomyCash: Math.max(
      0,
      Number(economyCashAvailable) || 0,
    ),
  };
  for (
    let tick = next.lastSettledTick + 1;
    tick <= targetTick;
    tick += 1
  ) {
    advanceOneDay(next, tick, result);
  }
  return result;
}

function rejectedAction(ecology, command, reason, details = {}) {
  return {
    ecology,
    journals: [],
    economyCashDelta: 0,
    playerCashDelta: 0,
    playerAttentionDelta: 0,
    receipt: {
      id: null,
      status: 'rejected',
      command,
      reason,
      ...details,
    },
  };
}

function ensurePlayerState(ecology) {
  ecology.player ??= {
    locationId: 'place_riverside_block',
    currentActivity: '正在安排今天的事',
    reputation: 48,
    knownOpportunityIds: [],
    visitCount: 0,
  };
  ecology.player.knownOpportunityIds ??= [];
  return ecology.player;
}

function playerInteractionBlock(target, worldTick) {
  const tick = Math.max(
    0,
    Math.trunc(Number(worldTick) || 0),
  );
  if (
    target.commitmentLock &&
    Number(target.commitmentLock.untilTick) > tick
  ) {
    return {
      targetStatus: 'committed',
      availableAfterTick:
        target.commitmentLock.untilTick,
    };
  }
  const availability = target.availability;
  if (
    availability?.asOfTick === tick &&
    ['working', 'busy', 'resting'].includes(
      availability.status,
    )
  ) {
    return {
      targetStatus: availability.status,
      availableAfterTick: tick + 1,
    };
  }
  return null;
}

export function applySocialCareerAction(
  ecology,
  action = {},
  {
    worldTick = ecology?.lastSettledTick ?? 0,
    playerAttentionAvailable = 0,
    playerCashAvailable = 0,
    economyCashAvailable = 0,
    remoteContactAccess = null,
  } = {},
) {
  if (!ecology || ecology.schemaVersion !== SCHEMA_VERSION) {
    throw new TypeError('A compatible social-career ecology is required.');
  }
  const command = String(action.command ?? '');
  if (
    ![
      'contact',
      'exchange',
      'visit',
      'cooperate',
      'challenge',
      'hire',
      'gift',
      'build_capability',
      'borrow',
      'repay',
      'bid_opportunity',
    ].includes(command)
  ) {
    return rejectedAction(ecology, command, 'UNKNOWN_SOCIAL_ACTION');
  }
  if (command === 'visit') {
    const locationId = String(action.locationId ?? '');
    const location = ecology.locations[locationId];
    if (!location) {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_LOCATION_NOT_FOUND',
      );
    }
    if (Number(playerAttentionAvailable) < 1) {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_ATTENTION_REQUIRED',
      );
    }
    const next = clone(ecology);
    next.lastSettledTick = Math.max(
      next.lastSettledTick,
      Math.trunc(Number(worldTick) || 0),
    );
    const player = ensurePlayerState(next);
    player.locationId = locationId;
    player.currentActivity = `到了${location.name}`;
    player.visitCount += 1;
    const fact = appendFact(next, {
      type: 'visit',
      actorIds: ['player'],
      organizationIds: [],
      locationId,
      reasonCodes: ['player_choice', 'place_affordance'],
      salience: 0.42,
    });
    next.metrics.playerActions += 1;
    compactFacts(next);
    return {
      ecology: next,
      journals: [],
      economyCashDelta: 0,
      playerCashDelta: 0,
      playerAttentionDelta: -1,
      receipt: {
        id: fact.id,
        factId: fact.id,
        tick: next.lastSettledTick,
        status: 'accepted',
        command,
        locationId,
        shortFeedback: `你到了${location.name}。`,
      },
    };
  }
  if (
    [
      'build_capability',
      'borrow',
      'repay',
      'bid_opportunity',
    ].includes(command)
  ) {
    const venture = ecology.organizations.org_player_venture;
    if (!venture || venture.decisionWriter !== 'player') {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_NO_BUSINESS_AUTHORITY',
      );
    }
    if (Number(playerAttentionAvailable) < 1) {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_ATTENTION_REQUIRED',
      );
    }
    if (command === 'build_capability') {
      const capability = String(action.capability ?? '');
      const amount = money(action.amount);
      if (
        !['craft', 'research', 'delivery', 'sales'].includes(
          capability,
        ) ||
        amount < 1_000 ||
        amount > 100_000 ||
        venture.cash < amount
      ) {
        return rejectedAction(
          ecology,
          command,
          'SOCIAL_CAPABILITY_TERMS_INVALID',
        );
      }
      const next = clone(ecology);
      next.lastSettledTick = Math.max(
        next.lastSettledTick,
        Math.trunc(Number(worldTick) || 0),
      );
      const nextVenture = next.organizations.org_player_venture;
      nextVenture.cash = money(nextVenture.cash - amount);
      nextVenture.costs = money(nextVenture.costs + amount);
      const improvement = Number(
        Math.min(
          0.12,
          Math.log10(1 + amount / 1_000) * 0.052,
        ).toFixed(6),
      );
      nextVenture.capabilities[capability] = Number(
        clamp(
          nextVenture.capabilities[capability] + improvement,
          0,
          1,
        ).toFixed(6),
      );
      nextVenture.policyRevision += 1;
      nextVenture.lastDecisionTick = next.lastSettledTick;
      ensurePlayerState(next).currentActivity =
        `刚为${nextVenture.name}补了一块能力`;
      const fact = appendFact(next, {
        type: 'capability_built',
        actorIds: ['player'],
        organizationIds: [nextVenture.id],
        locationId: nextVenture.locationId,
        reasonCodes: ['player_policy', capability, 'cash_settled'],
        resourceDelta: {
          [nextVenture.id]: -amount,
          economy: amount,
        },
        salience: 0.78,
        valence: 0.45,
      });
      appendMarketAction(next, fact, {
        type: 'business_capability_built',
        organizationId: nextVenture.id,
        payload: {
          capability,
          investment: amount,
          improvement,
        },
      });
      next.metrics.playerActions += 1;
      compactFacts(next);
      return {
        ecology: next,
        journals: [
          journal(
            'social_capability_investment',
            `${nextVenture.name}完成能力建设`,
            'economy.local_capability_pool',
            `social.organization.${nextVenture.id}.cash`,
            amount,
          ),
        ],
        economyCashDelta: amount,
        playerCashDelta: 0,
        playerAttentionDelta: -1,
        receipt: {
          id: fact.id,
          factId: fact.id,
          tick: next.lastSettledTick,
          status: 'accepted',
          command,
          capability,
          amount,
          improvement,
          shortFeedback: `${nextVenture.name}的这项能力有了提升。`,
        },
      };
    }
    if (command === 'borrow') {
      const amount = money(action.amount);
      if (
        amount < 1_000 ||
        amount > 200_000 ||
        venture.debtPrincipal + amount > venture.debtLimit
      ) {
        return rejectedAction(
          ecology,
          command,
          'SOCIAL_DEBT_LIMIT',
        );
      }
      if (Number(economyCashAvailable) < amount) {
        return rejectedAction(
          ecology,
          command,
          'SOCIAL_LENDER_SHORTFALL',
        );
      }
      const next = clone(ecology);
      next.lastSettledTick = Math.max(
        next.lastSettledTick,
        Math.trunc(Number(worldTick) || 0),
      );
      const nextVenture = next.organizations.org_player_venture;
      nextVenture.cash = money(nextVenture.cash + amount);
      nextVenture.debtPrincipal = money(
        nextVenture.debtPrincipal + amount,
      );
      nextVenture.lastDecisionTick = next.lastSettledTick;
      const fact = appendFact(next, {
        type: 'debt_borrowed',
        actorIds: ['player'],
        organizationIds: [nextVenture.id],
        locationId: nextVenture.locationId,
        reasonCodes: ['player_policy', 'debt_capacity', 'cash_settled'],
        resourceDelta: {
          [nextVenture.id]: amount,
          economy: -amount,
        },
        salience: 0.8,
        valence: 0.05,
      });
      appendMarketAction(next, fact, {
        type: 'business_debt_changed',
        organizationId: nextVenture.id,
        payload: {
          direction: 'borrowed',
          amount,
          debtPrincipal: nextVenture.debtPrincipal,
        },
      });
      next.metrics.playerActions += 1;
      compactFacts(next);
      return {
        ecology: next,
        journals: [
          journal(
            'social_business_borrowing',
            `${nextVenture.name}取得经营借款`,
            `social.organization.${nextVenture.id}.cash`,
            'economy.local_credit_pool',
            amount,
          ),
        ],
        economyCashDelta: -amount,
        playerCashDelta: 0,
        playerAttentionDelta: -1,
        receipt: {
          id: fact.id,
          factId: fact.id,
          tick: next.lastSettledTick,
          status: 'accepted',
          command,
          amount,
          debtPrincipal: nextVenture.debtPrincipal,
          shortFeedback: `${nextVenture.name}拿到了周转借款。`,
        },
      };
    }
    if (command === 'repay') {
      const amount = money(action.amount);
      if (
        amount < 1 ||
        amount > venture.debtPrincipal ||
        amount > venture.cash
      ) {
        return rejectedAction(
          ecology,
          command,
          'SOCIAL_REPAYMENT_INVALID',
        );
      }
      const next = clone(ecology);
      next.lastSettledTick = Math.max(
        next.lastSettledTick,
        Math.trunc(Number(worldTick) || 0),
      );
      const nextVenture = next.organizations.org_player_venture;
      nextVenture.cash = money(nextVenture.cash - amount);
      nextVenture.debtPrincipal = money(
        nextVenture.debtPrincipal - amount,
      );
      nextVenture.lastDecisionTick = next.lastSettledTick;
      const fact = appendFact(next, {
        type: 'debt_repaid',
        actorIds: ['player'],
        organizationIds: [nextVenture.id],
        locationId: nextVenture.locationId,
        reasonCodes: ['player_policy', 'cash_settled'],
        resourceDelta: {
          [nextVenture.id]: -amount,
          economy: amount,
        },
        salience: 0.68,
        valence: 0.3,
      });
      appendMarketAction(next, fact, {
        type: 'business_debt_changed',
        organizationId: nextVenture.id,
        payload: {
          direction: 'repaid',
          amount,
          debtPrincipal: nextVenture.debtPrincipal,
        },
      });
      next.metrics.playerActions += 1;
      compactFacts(next);
      return {
        ecology: next,
        journals: [
          journal(
            'social_business_debt_repayment',
            `${nextVenture.name}归还经营借款`,
            'economy.local_credit_pool',
            `social.organization.${nextVenture.id}.cash`,
            amount,
          ),
        ],
        economyCashDelta: amount,
        playerCashDelta: 0,
        playerAttentionDelta: -1,
        receipt: {
          id: fact.id,
          factId: fact.id,
          tick: next.lastSettledTick,
          status: 'accepted',
          command,
          amount,
          debtPrincipal: nextVenture.debtPrincipal,
          shortFeedback: `${nextVenture.name}归还了一部分借款。`,
        },
      };
    }

    const opportunityId = String(action.opportunityId ?? '');
    const opportunity = ecology.opportunities[opportunityId];
    if (!opportunity || opportunity.status !== 'open') {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_OPPORTUNITY_NOT_OPEN',
      );
    }
    if (opportunity.clientOrgId === venture.id) {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_SELF_CONTRACT_FORBIDDEN',
      );
    }
    const fit = organizationOpportunityFit(venture, opportunity);
    const acceptance =
      fit * 0.75 +
      (ecology.player?.reputation ?? 48) / 100 * 0.15 +
      deterministicUnit(
        ecology,
        worldTick,
        opportunityId,
        'player-bid',
      ) *
        0.1;
    if (acceptance < opportunity.difficulty) {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_BID_REFUSED',
        { observedFit: fit },
      );
    }
    const next = clone(ecology);
    next.lastSettledTick = Math.max(
      next.lastSettledTick,
      Math.trunc(Number(worldTick) || 0),
    );
    const nextVenture = next.organizations.org_player_venture;
    const nextOpportunity = next.opportunities[opportunityId];
    const contractId = nextRecordId(next, 'social_contract');
    next.contracts[contractId] = {
      id: contractId,
      kind: 'service',
      status: 'active',
      employerOrgId: null,
      workerId: null,
      clientOrgId: nextOpportunity.clientOrgId,
      providerOrgId: nextVenture.id,
      opportunityId,
      signedTick: next.lastSettledTick,
      dueTick:
        next.lastSettledTick + nextOpportunity.durationDays,
      completedTick: null,
      amount: nextOpportunity.reward,
      progress: 0,
      commitmentLock: true,
    };
    nextOpportunity.status = 'awarded';
    nextOpportunity.awardedProviderOrgId = nextVenture.id;
    nextVenture.lastDecisionTick = next.lastSettledTick;
    ensurePlayerState(next).currentActivity =
      '刚谈下一份经营合同';
    const fact = appendFact(next, {
      type: 'contract_signed',
      actorIds: [
        'player',
        next.organizations[nextOpportunity.clientOrgId].decisionWriter,
      ],
      organizationIds: [
        nextVenture.id,
        nextOpportunity.clientOrgId,
      ],
      locationId: nextOpportunity.locationId,
      contractId,
      opportunityId,
      reasonCodes: [
        'competitive_bid',
        'client_consent',
        'capacity_reserved',
      ],
      salience: 0.86,
      valence: 0.55,
    });
    appendMarketAction(next, fact, {
      type: 'business_contract_signed',
      organizationId: nextVenture.id,
      payload: {
        contractId,
        clientOrgId: nextOpportunity.clientOrgId,
        amount: nextOpportunity.reward,
        dueTick:
          next.lastSettledTick + nextOpportunity.durationDays,
      },
    });
    next.metrics.acceptedNegotiations += 1;
    next.metrics.playerActions += 1;
    compactFacts(next);
    return {
      ecology: next,
      journals: [],
      economyCashDelta: 0,
      playerCashDelta: 0,
      playerAttentionDelta: -1,
      receipt: {
        id: fact.id,
        factId: fact.id,
        tick: next.lastSettledTick,
        status: 'accepted',
        command,
        outcome: 'awarded',
        opportunityId,
        contractId,
        shortFeedback: '对方接受了报价，合同开始履行。',
      },
    };
  }
  const targetActorId = String(action.targetActorId ?? '');
  const target = ecology.actors[targetActorId];
  if (!target) {
    return rejectedAction(
      ecology,
      command,
      'SOCIAL_ACTOR_NOT_FOUND',
    );
  }
  if (Number(playerAttentionAvailable) < 1) {
    return rejectedAction(
      ecology,
      command,
      'SOCIAL_ATTENTION_REQUIRED',
    );
  }
  const interactionBlock = playerInteractionBlock(
    target,
    worldTick,
  );
  if (interactionBlock) {
    return rejectedAction(
      ecology,
      command,
      'SOCIAL_TARGET_BUSY',
      {
        targetActorId,
        ...interactionBlock,
      },
    );
  }
  const originLocationId =
    typeof ecology.player?.locationId === 'string' &&
    ecology.player.locationId
      ? ecology.player.locationId
      : null;
  const destinationLocationId =
    typeof target.locationId === 'string' &&
    target.locationId
      ? target.locationId
      : null;
  const interactionMode =
    originLocationId !== null &&
    originLocationId === destinationLocationId
      ? 'in_person'
      : 'remote_phone';
  if (
    command === 'contact' &&
    (
      interactionMode === 'remote_phone' &&
      (
        typeof remoteContactAccess?.assetId !== 'string' ||
        remoteContactAccess.assetId.length === 0
      )
    )
  ) {
    return rejectedAction(
      ecology,
      command,
      'SOCIAL_REMOTE_CONTACT_UNAVAILABLE',
      {
        targetActorId,
        originLocationId,
        destinationLocationId,
      },
    );
  }
  if (command === 'gift') {
    const amount = money(action.amount);
    if (
      amount <= 0 ||
      amount > 10_000 ||
      Number(playerCashAvailable) < amount
    ) {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_CASH_REQUIRED',
        { required: amount },
      );
    }
    const existing =
      ecology.relationships[relationKey('player', targetActorId)] ?? {
        familiarity: 8,
        obligation: 0,
      };
    const comfortableAmount =
      200 +
      existing.familiarity * 20 +
      target.traits.risk * 500;
    if (
      amount > comfortableAmount * 2 &&
      target.traits.reliability > 0.7
    ) {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_GIFT_REFUSED',
      );
    }
    const next = clone(ecology);
    next.lastSettledTick = Math.max(
      next.lastSettledTick,
      Math.trunc(Number(worldTick) || 0),
    );
    const nextTarget = next.actors[targetActorId];
    nextTarget.cash = money(nextTarget.cash + amount);
    nextTarget.currentActivity = '刚收下一份心意，仍在考虑怎么回应';
    ensurePlayerState(next).currentActivity =
      `刚给${nextTarget.name}送了一份心意`;
    const obligationGain = Number(
      Math.min(
        12,
        amount / Math.max(60, nextTarget.cash / 500),
      ).toFixed(3),
    );
    const delta = {
      trust: Number(
        (
          0.35 +
          nextTarget.traits.reciprocity * 0.55
        ).toFixed(3),
      ),
      familiarity: 1.5,
      respect:
        amount > comfortableAmount ? -0.4 : 0.3,
      conflict:
        amount > comfortableAmount ? 0.8 : -0.2,
      obligation: obligationGain,
    };
    adjustRelationship(next, 'player', targetActorId, delta);
    const fact = appendFact(next, {
      type: 'gift',
      actorIds: ['player', targetActorId],
      organizationIds: [],
      locationId: nextTarget.locationId,
      reasonCodes: ['voluntary_transfer', 'no_return_promised'],
      resourceDelta: {
        player: -amount,
        [targetActorId]: amount,
      },
      relationshipDelta: {
        [relationKey('player', targetActorId)]: delta,
      },
      salience: 0.62,
      valence: 0.3,
    });
    next.metrics.playerActions += 1;
    compactFacts(next);
    return {
      ecology: next,
      journals: [
        journal(
          'social_player_gift',
          `向${nextTarget.name}赠送一份心意`,
          `social.actor.${targetActorId}.cash`,
          'player.cash',
          amount,
        ),
      ],
      economyCashDelta: 0,
      playerCashDelta: -amount,
      playerAttentionDelta: -1,
      receipt: {
        id: fact.id,
        factId: fact.id,
        tick: next.lastSettledTick,
        status: 'accepted',
        command,
        targetActorId,
        amount,
        shortFeedback: `${nextTarget.name}收下了，但没有许下回报。`,
      },
    };
  }
  if (command === 'hire') {
    if (Number(playerAttentionAvailable) < 2) {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_ATTENTION_REQUIRED',
        { required: 2 },
      );
    }
    const playerLocation =
      ecology.player?.locationId ?? 'place_riverside_block';
    if (playerLocation !== target.locationId) {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_TARGET_NOT_PRESENT',
        { targetLocationId: target.locationId },
      );
    }
    if (employmentForActor(ecology, targetActorId)) {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_TARGET_COMMITTED',
      );
    }
    const venture = ecology.organizations.org_player_venture;
    if (!venture || venture.decisionWriter !== 'player') {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_NO_HIRING_AUTHORITY',
      );
    }
    if (venture.staffIds.length >= venture.capacity) {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_ORGANIZATION_AT_CAPACITY',
      );
    }
    const offeredWage = money(action.offeredWage);
    if (
      offeredWage < 500 ||
      offeredWage > 20_000 ||
      venture.cash < offeredWage
    ) {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_WAGE_TERMS_INVALID',
      );
    }
    const expectedWage = money(
      780 +
        Math.max(...Object.values(target.skills)) * 420 +
        target.preferences.autonomy * 180,
    );
    const relationship =
      ecology.relationships[relationKey('player', targetActorId)] ?? {
        trust: 30,
      };
    const acceptance =
      clamp(offeredWage / expectedWage, 0, 1.2) * 0.35 +
      skillMatch(target, venture) * 0.28 +
      relationship.trust / 100 * 0.18 +
      (ecology.player?.reputation ?? 48) / 100 * 0.1 +
      target.traits.reliability * 0.06 +
      deterministicUnit(
        ecology,
        worldTick,
        targetActorId,
        'player-hire',
      ) *
        0.03;
    if (acceptance < 0.56) {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_HIRE_REFUSED',
        { expectedWage },
      );
    }
    const next = clone(ecology);
    next.lastSettledTick = Math.max(
      next.lastSettledTick,
      Math.trunc(Number(worldTick) || 0),
    );
    const nextPlayer = ensurePlayerState(next);
    const nextVenture = next.organizations.org_player_venture;
    const nextTarget = next.actors[targetActorId];
    const contractId = nextRecordId(next, 'social_contract');
    next.contracts[contractId] = {
      id: contractId,
      kind: 'employment',
      status: 'active',
      employerOrgId: nextVenture.id,
      workerId: targetActorId,
      clientOrgId: null,
      providerOrgId: null,
      opportunityId: null,
      signedTick: next.lastSettledTick,
      dueTick: null,
      completedTick: null,
      amount: offeredWage,
      progress: 0,
      commitmentLock: true,
    };
    nextVenture.staffIds.push(targetActorId);
    nextTarget.employerOrgId = nextVenture.id;
    nextTarget.locationId = nextVenture.locationId;
    nextTarget.currentActivity = `刚接受${nextVenture.name}的工作约定`;
    nextTarget.commitmentLock = {
      contractId,
      untilTick: next.lastSettledTick + 3,
    };
    nextPlayer.currentActivity = `刚和${nextTarget.name}谈妥一份工作`;
    const delta = {
      trust: 2,
      familiarity: 3,
      respect: 1.2,
      conflict: -0.4,
    };
    adjustRelationship(next, 'player', targetActorId, delta);
    const fact = appendFact(next, {
      type: 'employment_started',
      actorIds: ['player', targetActorId],
      organizationIds: [nextVenture.id],
      locationId: playerLocation,
      contractId,
      reasonCodes: [
        'mutual_consent',
        'wage_agreed',
        'single_writer_authority',
      ],
      relationshipDelta: {
        [relationKey('player', targetActorId)]: delta,
      },
      salience: 0.82,
      valence: 0.65,
    });
    next.metrics.acceptedNegotiations += 1;
    next.metrics.playerActions += 1;
    compactFacts(next);
    return {
      ecology: next,
      journals: [],
      economyCashDelta: 0,
      playerCashDelta: 0,
      playerAttentionDelta: -2,
      receipt: {
        id: fact.id,
        factId: fact.id,
        tick: next.lastSettledTick,
        status: 'accepted',
        command,
        targetActorId,
        contractId,
        offeredWage,
        shortFeedback: `${nextTarget.name}接受了这份工作约定。`,
      },
    };
  }
  if (['cooperate', 'challenge'].includes(command)) {
    const playerLocation =
      ecology.player?.locationId ?? 'place_riverside_block';
    if (playerLocation !== target.locationId) {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_TARGET_NOT_PRESENT',
        { targetLocationId: target.locationId },
      );
    }
    const next = clone(ecology);
    next.lastSettledTick = Math.max(
      next.lastSettledTick,
      Math.trunc(Number(worldTick) || 0),
    );
    const player = ensurePlayerState(next);
    const nextTarget = next.actors[targetActorId];
    if (command === 'cooperate') {
      const relationship = getRelationship(
        next,
        'player',
        targetActorId,
      );
      const acceptance =
        relationship.trust / 100 * 0.4 +
        nextTarget.traits.reciprocity * 0.35 +
        player.reputation / 100 * 0.2 +
        deterministicUnit(
          next,
          worldTick,
          targetActorId,
          'player-cooperation',
        ) *
          0.05;
      if (acceptance < 0.36) {
        next.metrics.rejectedNegotiations += 1;
        const fact = appendFact(next, {
          type: 'negotiation_rejected',
          actorIds: ['player', targetActorId],
          organizationIds: [],
          locationId: playerLocation,
          reasonCodes: ['insufficient_trust', 'target_refusal'],
          salience: 0.52,
          valence: -0.2,
        });
        next.metrics.playerActions += 1;
        compactFacts(next);
        return {
          ecology: next,
          journals: [],
          economyCashDelta: 0,
          playerCashDelta: 0,
          playerAttentionDelta: -1,
          receipt: {
            id: fact.id,
            factId: fact.id,
            tick: next.lastSettledTick,
            status: 'accepted',
            outcome: 'refused',
            command,
            reason: 'SOCIAL_COOPERATION_REFUSED',
            targetActorId,
            shortFeedback: `${nextTarget.name}没有答应这次合作。`,
          },
        };
      }
      const contractId = nextRecordId(next, 'social_contract');
      const clientOrgId =
        nextTarget.employerOrgId ?? 'org_player_venture';
      next.contracts[contractId] = {
        id: contractId,
        kind: 'cooperation',
        status: 'active',
        employerOrgId: null,
        workerId: targetActorId,
        clientOrgId,
        providerOrgId: 'org_player_venture',
        opportunityId: null,
        signedTick: next.lastSettledTick,
        dueTick: next.lastSettledTick + 3,
        completedTick: null,
        amount: 0,
        progress: 0,
        commitmentLock: false,
      };
      const delta = {
        trust: 2.4,
        familiarity: 2,
        respect: 1.5,
        conflict: -0.5,
      };
      adjustRelationship(next, 'player', targetActorId, delta);
      nextTarget.currentActivity = '答应和你先合做一件小事';
      player.currentActivity = `正和${nextTarget.name}试着合作`;
      const fact = appendFact(next, {
        type: 'cooperation',
        actorIds: ['player', targetActorId],
        organizationIds: [
          'org_player_venture',
          ...(clientOrgId === 'org_player_venture'
            ? []
            : [clientOrgId]),
        ],
        locationId: playerLocation,
        contractId,
        reasonCodes: ['mutual_consent', 'bounded_commitment'],
        relationshipDelta: {
          [relationKey('player', targetActorId)]: delta,
        },
        salience: 0.68,
        valence: 0.5,
      });
      next.metrics.acceptedNegotiations += 1;
      next.metrics.playerActions += 1;
      compactFacts(next);
      return {
        ecology: next,
        journals: [],
        economyCashDelta: 0,
        playerCashDelta: 0,
        playerAttentionDelta: -1,
        receipt: {
          id: fact.id,
          factId: fact.id,
          tick: next.lastSettledTick,
          status: 'accepted',
          command,
          targetActorId,
          contractId,
          shortFeedback: `${nextTarget.name}答应先和你合做一件小事。`,
        },
      };
    }

    const playerOrganization =
      next.organizations.org_player_venture;
    const targetOrganization =
      nextTarget.employerOrgId
        ? next.organizations[nextTarget.employerOrgId]
        : null;
    const playerStrength = Math.max(
      ...Object.values(playerOrganization.capabilities),
    );
    const targetStrength = targetOrganization
      ? Math.max(...Object.values(targetOrganization.capabilities))
      : Math.max(...Object.values(nextTarget.skills));
    const playerScore =
      playerStrength * 0.66 +
      player.reputation / 100 * 0.2 +
      deterministicUnit(
        next,
        worldTick,
        targetActorId,
        'player-challenge',
      ) *
        0.14;
    const targetScore =
      targetStrength * 0.72 +
      nextTarget.traits.ambition * 0.16 +
      deterministicUnit(
        next,
        worldTick,
        targetActorId,
        'target-challenge',
      ) *
        0.12;
    const outcome = playerScore >= targetScore ? 'won' : 'lost';
    const delta = {
      trust: outcome === 'won' ? -1 : -2,
      familiarity: 2.5,
      respect: outcome === 'won' ? 2.6 : 0.7,
      conflict: 6,
    };
    adjustRelationship(next, 'player', targetActorId, delta);
    player.reputation = clamp(
      player.reputation + (outcome === 'won' ? 0.7 : -0.2),
      0,
      100,
    );
    nextTarget.currentActivity =
      outcome === 'won'
        ? '刚在一次正面竞争里落了下风'
        : '刚守住了自己的优势';
    player.currentActivity =
      outcome === 'won'
        ? `刚在${nextTarget.name}面前抢得先手`
        : `刚在${nextTarget.name}面前吃了亏`;
    const fact = appendFact(next, {
      type: 'conflict',
      actorIds: ['player', targetActorId],
      organizationIds: [
        'org_player_venture',
        ...(targetOrganization ? [targetOrganization.id] : []),
      ],
      locationId: playerLocation,
      reasonCodes: ['competing_interest', `outcome:${outcome}`],
      relationshipDelta: {
        [relationKey('player', targetActorId)]: delta,
      },
      salience: 0.74,
      valence: outcome === 'won' ? 0.25 : -0.35,
    });
    next.metrics.playerActions += 1;
    compactFacts(next);
    return {
      ecology: next,
      journals: [],
      economyCashDelta: 0,
      playerCashDelta: 0,
      playerAttentionDelta: -1,
      receipt: {
        id: fact.id,
        factId: fact.id,
        tick: next.lastSettledTick,
        status: 'accepted',
        command,
        targetActorId,
        outcome,
        shortFeedback:
          outcome === 'won'
            ? '这次正面竞争你占了上风。'
            : '这次正面竞争对方守住了优势。',
      },
    };
  }
  if (command === 'exchange') {
    const offerAmount = money(action.offerAmount);
    if (
      action.requested !== 'opportunity_lead' ||
      offerAmount <= 0 ||
      offerAmount > 50_000
    ) {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_EXCHANGE_TERMS_INVALID',
      );
    }
    if (Number(playerCashAvailable) < offerAmount) {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_CASH_REQUIRED',
        { required: offerAmount },
      );
    }
    const known = new Set(
      ecology.player?.knownOpportunityIds ?? [],
    );
    const opportunities = Object.values(ecology.opportunities)
      .filter(
        (opportunity) =>
          opportunity.status === 'open' &&
          !known.has(opportunity.id),
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    if (opportunities.length === 0) {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_NO_TRADEABLE_LEAD',
      );
    }
    const opportunity =
      opportunities[
        Math.floor(
          deterministicUnit(
            ecology,
            targetActorId,
            worldTick,
            'lead',
          ) * opportunities.length,
        )
      ];
    const reservePrice = money(
      150 +
        opportunity.reward * 0.02 +
        (1 - target.traits.reciprocity) * 120,
    );
    if (offerAmount < reservePrice) {
      return rejectedAction(
        ecology,
        command,
        'SOCIAL_OFFER_REFUSED',
        { minimumObserved: reservePrice },
      );
    }
    const next = clone(ecology);
    next.lastSettledTick = Math.max(
      next.lastSettledTick,
      Math.trunc(Number(worldTick) || 0),
    );
    next.player ??= {
      locationId: next.actors[targetActorId].locationId,
      currentActivity: '正在安排今天的事',
      reputation: 48,
      knownOpportunityIds: [],
      visitCount: 0,
    };
    next.player.knownOpportunityIds = [
      ...new Set([
        ...next.player.knownOpportunityIds,
        opportunity.id,
      ]),
    ];
    next.player.currentActivity = `从${target.name}处换到一条生意线索`;
    next.actors[targetActorId].cash = money(
      next.actors[targetActorId].cash + offerAmount,
    );
    next.actors[targetActorId].currentActivity = '刚完成一笔信息交换';
    const delta = {
      trust: 0.8,
      familiarity: 2,
      respect: 0.4,
      conflict: -0.2,
    };
    adjustRelationship(next, 'player', targetActorId, delta);
    const fact = appendFact(next, {
      type: 'transfer',
      actorIds: ['player', targetActorId],
      organizationIds: [opportunity.clientOrgId],
      locationId: next.actors[targetActorId].locationId,
      opportunityId: opportunity.id,
      reasonCodes: ['mutual_consent', 'priced_information'],
      resourceDelta: {
        player: -offerAmount,
        [targetActorId]: offerAmount,
      },
      relationshipDelta: {
        [relationKey('player', targetActorId)]: delta,
      },
      salience: 0.64,
      valence: 0.25,
    });
    next.metrics.playerActions += 1;
    compactFacts(next);
    return {
      ecology: next,
      journals: [
        journal(
          'social_information_exchange',
          `向${target.name}购买一条经营线索`,
          `social.actor.${targetActorId}.cash`,
          'player.cash',
          offerAmount,
        ),
      ],
      economyCashDelta: 0,
      playerCashDelta: -offerAmount,
      playerAttentionDelta: -1,
      receipt: {
        id: fact.id,
        factId: fact.id,
        tick: next.lastSettledTick,
        status: 'accepted',
        command,
        targetActorId,
        opportunityId: opportunity.id,
        amount: offerAmount,
        shortFeedback: `你从${target.name}处换到一条可核对的生意线索。`,
      },
    };
  }
  const next = clone(ecology);
  next.lastSettledTick = Math.max(
    next.lastSettledTick,
    Math.trunc(Number(worldTick) || 0),
  );
  const nextTarget = next.actors[targetActorId];
  const trustDelta = Number(
    (0.7 + nextTarget.traits.reciprocity * 1.4).toFixed(3),
  );
  const delta = {
    trust: trustDelta,
    familiarity: 4,
    respect: 0.4,
    conflict: -0.3,
  };
  adjustRelationship(next, 'player', targetActorId, delta);
  nextTarget.currentActivity = '刚和你聊过几句';
  const fact = appendFact(next, {
    type: 'contact',
    actorIds: ['player', targetActorId],
    organizationIds: [],
    locationId:
      interactionMode === 'in_person'
        ? originLocationId
        : null,
    interactionMode,
    communicationAssetId:
      interactionMode === 'remote_phone'
        ? remoteContactAccess.assetId
        : null,
    originLocationId,
    destinationLocationId,
    reasonCodes: [
      'player_contact',
      ...(interactionMode === 'remote_phone'
        ? ['remote_phone_contact']
        : ['in_person_contact']),
      'mutual_attention',
    ],
    relationshipDelta: {
      [relationKey('player', targetActorId)]: delta,
    },
    salience: 0.58,
    valence: 0.3,
  });
  next.metrics.playerActions += 1;
  compactFacts(next);
  return {
    ecology: next,
    journals: [],
    economyCashDelta: 0,
    playerCashDelta: 0,
    playerAttentionDelta: -1,
    receipt: {
      id: fact.id,
      factId: fact.id,
      tick: next.lastSettledTick,
      status: 'accepted',
      command,
      targetActorId,
      interactionMode,
      communicationAssetId:
        interactionMode === 'remote_phone'
          ? remoteContactAccess.assetId
          : null,
      originLocationId,
      destinationLocationId,
      shortFeedback:
        interactionMode === 'remote_phone'
          ? `你用常用手机联系了${nextTarget.name}。`
          : `你和${nextTarget.name}当面聊了几句。`,
    },
    playerCashAvailable: Math.max(
      0,
      Number(playerCashAvailable) || 0,
    ),
  };
}

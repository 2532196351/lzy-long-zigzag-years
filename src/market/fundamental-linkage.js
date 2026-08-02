const FRAME_SCHEMA = 'lzy_bounded_settled_fact_frame_v1';
const BATCH_SCHEMA =
  'lzy_fundamental_causal_candidate_batch_v1';
const MAX_COMPANIES = 32;
const MAX_RECENT_FACTS = 96;
const MAX_EDGES = 256;
const MAX_OUTGOING_EDGES = 8;
const MAX_CANDIDATES = 64;
const BASIS_POINTS = 10_000;

export const FUNDAMENTAL_LINKAGE_VERSION =
  'lzy-fundamental-linkage-v1';

const OPERATING_RULES = Object.freeze({
  supplier: Object.freeze({
    sourceMetric: 'deliveryReliabilityBps',
    targetMetric: 'inputAvailabilityBps',
  }),
  customer: Object.freeze({
    sourceMetric: 'demandHealthBps',
    targetMetric: 'demandBps',
  }),
  credit: Object.freeze({
    sourceMetric: 'creditHealthBps',
    targetMetric: 'fundingAvailabilityBps',
  }),
  investment: Object.freeze({
    sourceMetric: 'investmentPerformanceBps',
    targetMetric: 'investmentIncomeBps',
  }),
});

function isRecord(value) {
  return value !== null && typeof value === 'object' &&
    !Array.isArray(value);
}

function isSafeInteger(value, minimum = Number.MIN_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function deterministicId(prefix, parts) {
  return `${prefix}_${fnv1a32(parts.join('\u001f'))}`;
}

function baseBatch(frame) {
  const worldSeed = isNonEmptyString(frame?.worldSeed)
    ? frame.worldSeed
    : 'invalid_world_seed';
  const ruleEpoch = isNonEmptyString(frame?.ruleEpoch)
    ? frame.ruleEpoch
    : 'invalid_rule_epoch';
  const observedCommitSeq = isSafeInteger(
    frame?.observedCommitSeq,
    0,
  )
    ? frame.observedCommitSeq
    : 0;
  const nowDay = isSafeInteger(frame?.nowDay, 0)
    ? frame.nowDay
    : 0;

  return {
    schemaVersion: BATCH_SCHEMA,
    authority: 'advisory_candidate_only',
    integrationStatus: 'not_integrated',
    batchId: deterministicId('fundamental_batch', [
      FUNDAMENTAL_LINKAGE_VERSION,
      worldSeed,
      ruleEpoch,
      String(observedCommitSeq),
      String(nowDay),
    ]),
    observedCommitSeq,
    status: 'blocked',
    candidates: [],
    reasonCodes: [],
  };
}

function withOutcome(batch, status, reasonCodes, candidates = []) {
  return {
    ...batch,
    status,
    candidates,
    reasonCodes: [...reasonCodes],
  };
}

function validateFrame(frame) {
  const reasons = [];
  if (!isRecord(frame) || frame.schemaVersion !== FRAME_SCHEMA) {
    reasons.push('FRAME_SCHEMA_INVALID');
    return reasons;
  }
  if (!isNonEmptyString(frame.worldSeed) ||
      !isNonEmptyString(frame.ruleEpoch) ||
      !isSafeInteger(frame.observedCommitSeq, 0) ||
      !isSafeInteger(frame.nowDay, 0)) {
    reasons.push('FRAME_IDENTITY_INVALID');
  }

  if (!Array.isArray(frame.companies)) {
    reasons.push('COMPANY_SET_INVALID');
  } else if (frame.companies.length > MAX_COMPANIES) {
    reasons.push('COMPANY_LIMIT_EXCEEDED');
  } else {
    const ids = new Set();
    for (const company of frame.companies) {
      if (!isRecord(company) || !isNonEmptyString(company.id) ||
          !isNonEmptyString(company.symbol) || ids.has(company.id)) {
        reasons.push('COMPANY_SET_INVALID');
        break;
      }
      ids.add(company.id);
    }
  }

  if (!Array.isArray(frame.recentSettledFacts)) {
    reasons.push('RECENT_FACT_SET_INVALID');
  } else if (frame.recentSettledFacts.length > MAX_RECENT_FACTS) {
    reasons.push('RECENT_FACT_LIMIT_EXCEEDED');
  } else {
    const ids = new Set();
    for (const fact of frame.recentSettledFacts) {
      if (!isRecord(fact) || !isNonEmptyString(fact.id) ||
          ids.has(fact.id)) {
        reasons.push('RECENT_FACT_SET_INVALID');
        break;
      }
      ids.add(fact.id);
    }
  }

  if (!Array.isArray(frame.edges)) {
    reasons.push('EDGE_SET_INVALID');
  } else if (frame.edges.length > MAX_EDGES) {
    reasons.push('EDGE_LIMIT_EXCEEDED');
  } else {
    const ids = new Set();
    const outgoing = new Map();
    for (const edge of frame.edges) {
      if (!isValidEdge(edge) || ids.has(edge?.id)) {
        reasons.push('EDGE_SET_INVALID');
        break;
      }
      ids.add(edge.id);
      const count = (outgoing.get(edge.fromCompanyId) ?? 0) + 1;
      outgoing.set(edge.fromCompanyId, count);
      if (count > MAX_OUTGOING_EDGES) {
        reasons.push('OUTGOING_EDGE_LIMIT_EXCEEDED');
        break;
      }
    }
  }

  if (!Array.isArray(frame.appliedCandidateIds) ||
      frame.appliedCandidateIds.length > MAX_CANDIDATES ||
      frame.appliedCandidateIds.some(
        (candidateId) => !isNonEmptyString(candidateId),
      )) {
    reasons.push('APPLIED_CANDIDATE_SET_INVALID');
  }
  return [...new Set(reasons)];
}

function isValidEdge(edge) {
  return isRecord(edge) && isNonEmptyString(edge.id) &&
    isNonEmptyString(edge.fromCompanyId) &&
    isNonEmptyString(edge.toCompanyId) &&
    Object.hasOwn(OPERATING_RULES, edge.relationship) &&
    isSafeInteger(edge.weightBps, 0) &&
    edge.weightBps <= BASIS_POINTS &&
    isSafeInteger(edge.maxImpactBps, 0) &&
    isSafeInteger(edge.lagDays, 0) && edge.lagDays <= 365 &&
    isSafeInteger(edge.validFromDay, 0) &&
    isSafeInteger(edge.validToDay, edge.validFromDay);
}

function companyMap(frame) {
  const entries = frame.companies
    .map((company) => [company.id, company])
    .sort(([left], [right]) => compareText(left, right));
  return new Map(entries);
}

function canonicalFacts(frame) {
  return [...frame.recentSettledFacts].sort((left, right) =>
    compareText(left.id, right.id),
  );
}

function canonicalEdges(frame) {
  return [...frame.edges].sort((left, right) =>
    compareText(left.id, right.id),
  );
}

function isEligibleOperatingFact(fact) {
  return fact.status === 'settled' &&
    fact.authority === 'world_company_operating_ledger' &&
    fact.kind === 'operating_metric_change';
}

function isEligibleOwnershipFact(fact) {
  return fact.status === 'settled' &&
    fact.authority ===
      'issuer_register_and_live_custody_ledger' &&
    fact.kind === 'ownership_transfer_settled';
}

function validateOperatingFact(fact, companies) {
  return isNonEmptyString(fact.companyId) &&
    companies.has(fact.companyId) &&
    isNonEmptyString(fact.metric) &&
    isSafeInteger(fact.deltaBps, -BASIS_POINTS) &&
    fact.deltaBps <= BASIS_POINTS &&
    isSafeInteger(fact.settledDay, 0);
}

function deriveOperatingCandidates(frame, fact, companies, edges) {
  if (!validateOperatingFact(fact, companies)) {
    return { error: 'SETTLED_BUSINESS_FACT_INVALID' };
  }
  const candidates = [];
  for (const edge of edges) {
    if (edge.fromCompanyId !== fact.companyId ||
        !companies.has(edge.toCompanyId) ||
        fact.settledDay < edge.validFromDay ||
        fact.settledDay > edge.validToDay) {
      continue;
    }
    const rule = OPERATING_RULES[edge.relationship];
    if (fact.metric !== rule.sourceMetric) continue;
    const rawImpact = Math.round(
      fact.deltaBps * edge.weightBps / BASIS_POINTS,
    );
    const deltaBps = clamp(
      rawImpact,
      -edge.maxImpactBps,
      edge.maxImpactBps,
    );
    if (deltaBps === 0) continue;
    const candidateId = deterministicId('fundamental_candidate', [
      FUNDAMENTAL_LINKAGE_VERSION,
      frame.worldSeed,
      frame.ruleEpoch,
      fact.id,
      edge.id,
      rule.targetMetric,
    ]);
    candidates.push({
      candidateId,
      status: 'candidate_not_settled',
      causalRung: 'interventional_rule_candidate',
      sourceFactIds: [fact.id],
      sourceCompanyId: fact.companyId,
      targetCompanyId: edge.toCompanyId,
      edgeId: edge.id,
      relationship: edge.relationship,
      metric: rule.targetMetric,
      deltaBps,
      earliestApplyDay: fact.settledDay + edge.lagDays,
    });
  }
  return { candidates };
}

function sumHolderUnits(holders) {
  let total = 0;
  for (const holderId of Object.keys(holders).sort(compareText)) {
    const units = holders[holderId];
    if (!isNonEmptyString(holderId) || !isSafeInteger(units, 0)) {
      return null;
    }
    total += units;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

function deriveOwnershipCandidate(frame, fact, companies) {
  const company = companies.get(fact.companyId);
  const ownership = company?.ownership;
  if (!company || !isRecord(ownership) ||
      !isRecord(ownership.holders) ||
      !isNonEmptyString(fact.symbol) ||
      fact.symbol !== company.symbol ||
      !isNonEmptyString(fact.fromHolderId) ||
      !isNonEmptyString(fact.toHolderId) ||
      fact.fromHolderId === fact.toHolderId ||
      !isSafeInteger(fact.quantity, 1) ||
      !isSafeInteger(fact.settledDay, 0) ||
      !isSafeInteger(ownership.issuedUnits, 0) ||
      !isSafeInteger(ownership.registeredUnits, 0) ||
      !isSafeInteger(ownership.floatUnits, 0) ||
      !isSafeInteger(ownership.lockedUnits, 0)) {
    return { error: 'OWNERSHIP_CONSERVATION_FAILED' };
  }
  const holderTotal = sumHolderUnits(ownership.holders);
  const sourceUnits = ownership.holders[fact.fromHolderId];
  const targetUnits = ownership.holders[fact.toHolderId];
  if (holderTotal === null ||
      ownership.issuedUnits !== ownership.registeredUnits ||
      ownership.floatUnits + ownership.lockedUnits !==
        ownership.issuedUnits ||
      holderTotal !== ownership.registeredUnits ||
      !isSafeInteger(sourceUnits, 0) ||
      !isSafeInteger(targetUnits, 0) ||
      sourceUnits < fact.quantity ||
      !Number.isSafeInteger(targetUnits + fact.quantity)) {
    return { error: 'OWNERSHIP_CONSERVATION_FAILED' };
  }

  const candidateId = deterministicId('fundamental_candidate', [
    FUNDAMENTAL_LINKAGE_VERSION,
    frame.worldSeed,
    frame.ruleEpoch,
    fact.id,
    fact.companyId,
    'ownershipRegisterTransferUnits',
  ]);
  return {
    candidate: {
      candidateId,
      status: 'candidate_not_settled',
      causalRung: 'interventional_rule_candidate',
      sourceFactIds: [fact.id],
      sourceCompanyId: fact.companyId,
      targetCompanyId: fact.companyId,
      edgeId: 'issuer_register_conservation_gate',
      relationship: 'ownership_register',
      metric: 'ownershipRegisterTransferUnits',
      deltaBps: 0,
      earliestApplyDay: fact.settledDay,
      ownershipTransfer: {
        symbol: fact.symbol,
        fromHolderId: fact.fromHolderId,
        toHolderId: fact.toHolderId,
        quantity: fact.quantity,
      },
      conservationProof: {
        issuedUnitsBefore: ownership.issuedUnits,
        issuedUnitsAfter: ownership.issuedUnits,
        registeredUnitsBefore: ownership.registeredUnits,
        registeredUnitsAfter: ownership.registeredUnits,
        debitedUnits: fact.quantity,
        creditedUnits: fact.quantity,
        netIssuedUnitsDelta: 0,
      },
    },
  };
}

export function deriveFundamentalCausalCandidates(frame) {
  const batch = baseBatch(frame);
  const reasons = validateFrame(frame);
  if (reasons.length > 0) {
    return withOutcome(batch, 'blocked', reasons);
  }

  const companies = companyMap(frame);
  const facts = canonicalFacts(frame);
  const edges = canonicalEdges(frame);
  const candidates = [];
  let eligibleFactCount = 0;

  for (const fact of facts) {
    if (isEligibleOperatingFact(fact)) {
      eligibleFactCount += 1;
      const result = deriveOperatingCandidates(
        frame,
        fact,
        companies,
        edges,
      );
      if (result.error) {
        return withOutcome(batch, 'blocked', [result.error]);
      }
      candidates.push(...result.candidates);
    } else if (isEligibleOwnershipFact(fact)) {
      eligibleFactCount += 1;
      const result = deriveOwnershipCandidate(
        frame,
        fact,
        companies,
      );
      if (result.error) {
        return withOutcome(batch, 'blocked', [result.error]);
      }
      candidates.push(result.candidate);
    }
    if (candidates.length > MAX_CANDIDATES) {
      return withOutcome(batch, 'blocked', [
        'CAUSAL_CANDIDATE_LIMIT_EXCEEDED',
      ]);
    }
  }

  if (eligibleFactCount === 0) {
    return withOutcome(batch, 'no_action', [
      'NO_ELIGIBLE_SETTLED_BUSINESS_FACTS',
    ]);
  }

  candidates.sort((left, right) =>
    compareText(left.candidateId, right.candidateId),
  );
  const applied = new Set(frame.appliedCandidateIds);
  const unapplied = candidates.filter(
    (candidate) => !applied.has(candidate.candidateId),
  );
  if (candidates.length > 0 && unapplied.length === 0) {
    return withOutcome(batch, 'no_action', [
      'CANDIDATES_ALREADY_APPLIED',
    ]);
  }
  if (unapplied.length === 0) {
    return withOutcome(batch, 'no_action', [
      'NO_PROPAGATION_RULE_MATCH',
    ]);
  }
  return withOutcome(batch, 'ready', [], unapplied);
}

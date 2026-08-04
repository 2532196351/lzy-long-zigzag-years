import {
  deriveFundamentalCausalCandidates,
} from './fundamental-linkage.js?v=20260804-01';

const MAX_COMPANIES = 32;
const MAX_SHAREHOLDER_PROFILES = 64;
const MAX_HOLDERS_PER_COMPANY = 64;
const MAX_RELATIONSHIPS = 256;

export const FUNDAMENTAL_NETWORK_PROJECTION_VERSION =
  'lzy-fundamental-network-projection-v1';

function isRecord(value) {
  return value !== null && typeof value === 'object' &&
    !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function safeInteger(value, minimum = Number.MIN_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function baseProjection(frame) {
  return {
    schemaVersion:
      'lzy_fundamental_relationship_network_projection_v1',
    ruleVersion: FUNDAMENTAL_NETWORK_PROJECTION_VERSION,
    authority: 'read_only_projection',
    integrationStatus: 'not_integrated',
    observedCommitSeq: safeInteger(
      frame?.observedCommitSeq,
      0,
    )
      ? frame.observedCommitSeq
      : null,
    status: 'blocked',
    nodes: [],
    relationships: [],
    causalCandidates: {
      status: 'blocked',
      candidates: [],
      reasonCodes: ['NETWORK_INPUT_BLOCKED'],
    },
    reasonCodes: [],
  };
}

function boundedInputReason(frame) {
  if (!isRecord(frame) || !Array.isArray(frame.companies)) {
    return 'NETWORK_FRAME_INVALID';
  }
  if (frame.companies.length > MAX_COMPANIES) {
    return 'NETWORK_COMPANY_LIMIT_EXCEEDED';
  }
  if (
    !Array.isArray(frame.shareholderProfiles ?? []) ||
    (frame.shareholderProfiles ?? []).length >
      MAX_SHAREHOLDER_PROFILES
  ) {
    return 'NETWORK_SHAREHOLDER_PROFILE_LIMIT_EXCEEDED';
  }
  if (
    !Array.isArray(frame.edges) ||
    frame.edges.length > MAX_RELATIONSHIPS
  ) {
    return 'NETWORK_EDGE_LIMIT_EXCEEDED';
  }
  const companyIds = new Set();
  for (const company of frame.companies) {
    if (
      !isRecord(company) ||
      !nonEmptyString(company.id) ||
      !nonEmptyString(company.symbol) ||
      companyIds.has(company.id) ||
      !isRecord(company.ownership) ||
      !isRecord(company.ownership.holders) ||
      Object.keys(company.ownership.holders).length >
        MAX_HOLDERS_PER_COMPANY
    ) {
      return 'NETWORK_COMPANY_INVALID';
    }
    companyIds.add(company.id);
  }
  const profileIds = new Set();
  for (const profile of frame.shareholderProfiles ?? []) {
    if (
      !isRecord(profile) ||
      !nonEmptyString(profile.holderId) ||
      !nonEmptyString(profile.displayName) ||
      typeof profile.linkEligible !== 'boolean' ||
      profileIds.has(profile.holderId)
    ) {
      return 'NETWORK_SHAREHOLDER_PROFILE_INVALID';
    }
    profileIds.add(profile.holderId);
  }
  return null;
}

function nodesFromFrame(frame) {
  return frame.companies
    .map((company) => ({
      companyId: company.id,
      symbol: company.symbol,
      issuedUnits: company.ownership.issuedUnits,
      registeredUnits: company.ownership.registeredUnits,
      floatUnits: company.ownership.floatUnits,
      lockedUnits: company.ownership.lockedUnits,
      source: 'settled_company_and_share_register',
    }))
    .sort((left, right) =>
      compareText(left.companyId, right.companyId),
    );
}

function declaredBusinessRelationships(frame) {
  return frame.edges.map((edge) => ({
    relationshipId: edge.id,
    relationship: edge.relationship,
    sourceCompanyId: edge.fromCompanyId,
    targetCompanyId: edge.toCompanyId,
    weightBps: edge.weightBps,
    maxImpactBps: edge.maxImpactBps,
    lagDays: edge.lagDays,
    validFromDay: edge.validFromDay,
    validToDay: edge.validToDay,
    causalRung: 'declared_mechanism_requires_settled_fact',
    associationOnly: false,
    source: 'versioned_business_relationship_register',
  }));
}

function sharedOwnerRelationships(frame) {
  const relationships = [];
  for (const profile of frame.shareholderProfiles ?? []) {
    if (!profile.linkEligible) continue;
    const holdings = frame.companies
      .map((company) => ({
        companyId: company.id,
        symbol: company.symbol,
        units:
          company.ownership.holders[profile.holderId] ?? 0,
        issuedUnits: company.ownership.issuedUnits,
      }))
      .filter(
        (holding) =>
          safeInteger(holding.units, 1) &&
          safeInteger(holding.issuedUnits, 1) &&
          holding.units <= holding.issuedUnits,
      )
      .sort((left, right) =>
        compareText(left.companyId, right.companyId),
      );
    if (holdings.length < 2) continue;
    relationships.push({
      relationshipId:
        `shared_owner:${profile.holderId}:` +
        holdings.map((holding) => holding.companyId).join(':'),
      relationship: 'shared_beneficial_owner',
      holderId: profile.holderId,
      holderDisplayName: profile.displayName,
      companyIds: holdings.map(
        (holding) => holding.companyId,
      ),
      holdings: holdings.map((holding) => ({
        companyId: holding.companyId,
        symbol: holding.symbol,
        units: holding.units,
        ownershipBps: Number(
          BigInt(holding.units) * 10_000n /
            BigInt(holding.issuedUnits),
        ),
      })),
      causalRung: 'associational',
      associationOnly: true,
      source: 'settled_share_register',
    });
  }
  return relationships;
}

export function projectFundamentalRelationshipNetwork(frame) {
  const base = baseProjection(frame);
  const reason = boundedInputReason(frame);
  if (reason) {
    return {
      ...base,
      reasonCodes: [reason],
    };
  }
  const relationships = [
    ...declaredBusinessRelationships(frame),
    ...sharedOwnerRelationships(frame),
  ].sort((left, right) =>
    compareText(left.relationshipId, right.relationshipId),
  );
  if (relationships.length > MAX_RELATIONSHIPS) {
    return {
      ...base,
      reasonCodes: ['NETWORK_RELATIONSHIP_LIMIT_EXCEEDED'],
    };
  }
  let causalCandidates;
  try {
    causalCandidates =
      deriveFundamentalCausalCandidates(frame);
  } catch (error) {
    return {
      ...base,
      reasonCodes: [
        `NETWORK_CAUSAL_FRAME_INVALID:${error.message}`,
      ],
    };
  }
  if (causalCandidates.status === 'blocked') {
    return {
      ...base,
      nodes: nodesFromFrame(frame),
      relationships,
      causalCandidates,
      reasonCodes: ['NETWORK_CAUSAL_FRAME_BLOCKED'],
    };
  }
  return {
    ...base,
    status: 'ready',
    nodes: nodesFromFrame(frame),
    relationships,
    causalCandidates,
    reasonCodes: [],
  };
}

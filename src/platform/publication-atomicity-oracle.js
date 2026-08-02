function safeInteger(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

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

export function assessQuotePublicationCapture({
  beforeCommit,
  fieldCommitSeqs,
  latestAuthorityCommit,
  summaryCommit,
} = {}) {
  const reasons = [];
  if (
    !safeInteger(beforeCommit) ||
    !safeInteger(summaryCommit) ||
    summaryCommit <= beforeCommit
  ) {
    reasons.push('QUOTE_PUBLICATION_DID_NOT_ADVANCE');
  }
  if (
    !Array.isArray(fieldCommitSeqs) ||
    fieldCommitSeqs.length === 0 ||
    fieldCommitSeqs.some(
      (commitSeq) =>
        !safeInteger(commitSeq) || commitSeq !== summaryCommit,
    )
  ) {
    reasons.push('QUOTE_FIELD_COMMIT_TEAR');
  }
  if (
    !safeInteger(latestAuthorityCommit) ||
    !safeInteger(summaryCommit) ||
    latestAuthorityCommit < summaryCommit
  ) {
    reasons.push('PAINTED_COMMIT_AHEAD_OF_AUTHORITY');
  }
  const reasonCodes = Object.freeze([...new Set(reasons)].sort());
  return deepFreeze({
    schema: 'lzy_quote_publication_capture_assessment_v1',
    status: reasonCodes.length === 0 ? 'accepted' : 'rejected',
    reasonCodes,
    claims: {
      atomicPublicationVerified: reasonCodes.length === 0,
      authorityAndPaintSameInstantClaimed: false,
    },
  });
}

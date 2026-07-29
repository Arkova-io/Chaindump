// Universal freshness contract for forensic evidence. The same metadata and
// gate can be used by chain, exchange, casino, NFT, and future research rows.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_SCOPES = new Set(['historical_event', 'mechanism', 'current_state', 'terminal_outcome']);
const DATE_KINDS = new Set(['published', 'updated', 'event', 'observed', 'unknown']);
const STATUS_BASES = new Set(['direct_current', 'terminal_event', 'withheld']);

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function validDate(value) {
  return typeof value === 'string' && ISO_DATE.test(value);
}

function validateSource(source, errors) {
  const prefix = `Source ${source?.id || '(unknown)'}`;
  if (!SOURCE_SCOPES.has(source?.evidence_scope)) errors.push(`${prefix} needs a valid evidence_scope`);
  if (!DATE_KINDS.has(source?.source_date_kind)) errors.push(`${prefix} needs a valid source_date_kind`);
  if (source?.source_date_kind === 'unknown') {
    if (source.source_date !== null) errors.push(`${prefix} with unknown date kind needs null source_date`);
  } else if (!validDate(source?.source_date)) {
    errors.push(`${prefix} needs an ISO source_date`);
  }
  if (!validDate(source?.last_verified_at)) errors.push(`${prefix} needs an ISO last_verified_at`);
  if (source?.source_date && source.source_date === source.last_verified_at) {
    errors.push(`${prefix} source_date must differ from last_verified_at`);
  }
  if (source?.evidence_scope === 'current_state') {
    if (!validDate(source?.stale_after)) errors.push(`${prefix} current_state evidence needs stale_after`);
    if (validDate(source?.stale_after) && validDate(source?.last_verified_at)) {
      const expected = source.last_verified_at > source.stale_after;
      if (source.stale !== expected) errors.push(`${prefix} stale flag does not match stale_after`);
    }
  } else if (typeof source?.stale !== 'boolean') {
    errors.push(`${prefix} needs a stale boolean`);
  }
}

function lifecycleEvidence(profile) {
  return Array.isArray(profile?.evidence)
    ? profile.evidence.find((item) => item?.field === 'lifecycle_status')
    : null;
}

function validatePolicy(policy, status, lifecycle, sourceById, errors) {
  if (policy?.schema !== 'forensic-freshness-v1') errors.push('Evidence policy needs forensic-freshness-v1 schema');
  if (!STATUS_BASES.has(policy?.status_basis)) errors.push('Evidence policy needs a valid status_basis');
  for (const field of ['status_as_of', 'last_verified_at', 'next_review_at']) {
    if (!validDate(policy?.[field])) errors.push(`Evidence policy needs ISO ${field}`);
  }
  if (policy?.status_as_of === policy?.last_verified_at) {
    errors.push('Evidence policy status_as_of must differ from last_verified_at');
  }
  if (validDate(policy?.next_review_at) && validDate(policy?.last_verified_at) && policy.next_review_at < policy.last_verified_at) {
    errors.push('Evidence policy next_review_at cannot predate last_verified_at');
  }
  if (typeof policy?.stale !== 'boolean') errors.push('Evidence policy needs a stale boolean');
  if (!lifecycle) {
    errors.push('Freshness-gated profile needs lifecycle_status evidence');
    return;
  }
  if (lifecycle.as_of !== policy.status_as_of) errors.push('Lifecycle as_of must match evidence policy status_as_of');
  if (lifecycle.as_of === policy.last_verified_at) errors.push('Lifecycle as_of must differ from access verification date');

  const lifecycleSources = (lifecycle.source_ids || []).map((id) => sourceById.get(id)).filter(Boolean);
  if (policy.status_basis === 'withheld') {
    if (status !== 'unknown') errors.push('Withheld status evidence must publish status unknown');
    if (!policy.stale) errors.push('Withheld status evidence must be marked stale');
    return;
  }
  if (status === 'unknown') errors.push('Direct or terminal evidence cannot publish status unknown');
  if (policy.stale) errors.push('A stale direct status must be withheld as unknown');
  const requiredScope = policy.status_basis === 'direct_current' ? 'current_state' : 'terminal_outcome';
  if (!lifecycleSources.some((source) => source.evidence_scope === requiredScope && !source.stale)) {
    errors.push(`Lifecycle status needs a non-stale ${requiredScope} source`);
  }
}

export function validateForensicFreshness({ status, profile, sources }) {
  const errors = [];
  const policy = asObject(profile?.evidence_policy);
  if (!policy) return { valid: true, errors: [] };
  const sourceList = Array.isArray(sources) ? sources : [];
  const sourceById = new Map(sourceList.filter((source) => source?.id).map((source) => [source.id, source]));
  for (const source of sourceList) validateSource(source, errors);
  validatePolicy(policy, status, lifecycleEvidence(profile), sourceById, errors);
  return { valid: errors.length === 0, errors };
}

export function forensicFreshness(profile, referenceDate = new Date().toISOString().slice(0, 10)) {
  const policy = asObject(profile?.evidence_policy);
  if (!policy) return null;
  const reviewOverdue = validDate(referenceDate) && validDate(policy.next_review_at) && referenceDate > policy.next_review_at;
  const stale = policy.stale || (policy.status_basis === 'direct_current' && reviewOverdue);
  return {
    statusBasis: policy.status_basis,
    statusAsOf: policy.status_as_of,
    lastVerifiedAt: policy.last_verified_at,
    nextReviewAt: policy.next_review_at,
    stale,
    reviewOverdue,
    statusWithheld: policy.status_basis === 'withheld' || stale,
  };
}

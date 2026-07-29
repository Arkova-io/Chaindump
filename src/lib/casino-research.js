const ENTITY_KINDS = new Set([
  'custodial_operator',
  'onchain_casino',
  'betting_exchange',
  'bankroll_protocol',
  'gaming_infrastructure',
]);

const PRODUCT_SUBTYPES = new Set([
  'casino',
  'sportsbook',
  'casino_and_sportsbook',
  'poker',
  'betting_exchange',
  'prediction_market',
  'bankroll',
  'infrastructure',
]);

const STATUSES = new Set([
  'active',
  'restricted',
  'paused',
  'wind_down_announced',
  'inactive',
  'insolvent',
  'superseded',
  'unknown',
]);

const OUTCOME_LABELS = new Set([
  'successful',
  'middling',
  'declining',
  'failed',
  'recovering',
  'unclassified',
]);

const CUSTODY_MODELS = new Set([
  'custodial',
  'noncustodial',
  'hybrid',
  'not_applicable',
]);

const CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low']);
const SOURCE_TIERS = new Set(['A', 'B', 'C', 'D']);
const SOURCE_ROLES = new Set(['primary', 'independent', 'aggregator']);
const CLAIM_TYPES = new Set([
  'identity', 'status', 'token', 'chain', 'licence', 'metric', 'event', 'risk', 'context',
]);
const SUPPORT_DIRECTIONS = new Set(['supports', 'contradicts', 'context_only']);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const TOKEN_STATUSES = new Set([
  'documented',
  'none_explicit',
  'no_official_token_identified',
  'not_applicable',
  'unknown',
]);

const hasFieldClaim = (claims, field) =>
  claims.some((claim) =>
    claim.field_path
      .split(',')
      .map((part) => part.trim())
      .includes(field),
  );

export function validateCasinoResearch(data) {
  const errors = [];
  const warnings = [];

  if (!data || typeof data !== 'object') {
    return { errors: ['dataset must be a JSON object'], warnings };
  }

  const cases = Array.isArray(data.cases) ? data.cases : [];
  const sources = Array.isArray(data.sources) ? data.sources : [];
  const claims = Array.isArray(data.claims) ? data.claims : [];
  const targetCount = data.cohort?.target_count;

  if (!Number.isInteger(targetCount) || targetCount < 1) {
    errors.push('cohort.target_count must be a positive integer');
  }
  if (cases.length !== targetCount) {
    errors.push(`case count ${cases.length} does not match target_count ${targetCount}`);
  }
  if (data.cohort?.case_count !== cases.length) {
    errors.push(`cohort.case_count ${data.cohort?.case_count} does not match cases.length ${cases.length}`);
  }

  const unique = (items, key, label) => {
    const seen = new Set();
    for (const item of items) {
      const value = item?.[key];
      if (!value) errors.push(`${label} is missing ${key}`);
      else if (seen.has(value)) errors.push(`duplicate ${label} ${value}`);
      else seen.add(value);
    }
    return seen;
  };

  const caseIds = unique(cases, 'case_id', 'case');
  const sourceIds = unique(sources, 'source_id', 'source');
  const claimIds = unique(claims, 'claim_id', 'claim');

  for (const source of sources) {
    if (typeof source.url !== 'string' || !source.url.startsWith('https://')) {
      errors.push(`${source.source_id}: source URL must use https`);
    }
    if (source.role === 'primary' && source.tier !== 'A' && source.tier !== 'B') {
      errors.push(`${source.source_id}: primary source must be tier A or B`);
    }
    if (!SOURCE_TIERS.has(source.tier)) {
      errors.push(`${source.source_id}: invalid source tier ${source.tier}`);
    }
    if (!SOURCE_ROLES.has(source.role)) {
      errors.push(`${source.source_id}: invalid source role ${source.role}`);
    }
    if (!source.title?.trim() || !source.publisher?.trim()) {
      errors.push(`${source.source_id}: title and publisher are required`);
    }
    if (!source.accessed_at) errors.push(`${source.source_id}: accessed_at is required`);
  }

  const claimsByCase = new Map(cases.map((item) => [item.case_id, []]));
  for (const claim of claims) {
    if (!caseIds.has(claim.case_id)) {
      errors.push(`${claim.claim_id}: unknown case_id ${claim.case_id}`);
    } else {
      claimsByCase.get(claim.case_id).push(claim);
    }
    if (!sourceIds.has(claim.source_id)) {
      errors.push(`${claim.claim_id}: unknown source_id ${claim.source_id}`);
    }
    if (!claim.evidence_locator?.trim()) {
      errors.push(`${claim.claim_id}: evidence_locator is required`);
    }
    if (!CLAIM_TYPES.has(claim.claim_type)) {
      errors.push(`${claim.claim_id}: invalid claim_type ${claim.claim_type}`);
    }
    if (!SUPPORT_DIRECTIONS.has(claim.support_direction)) {
      errors.push(`${claim.claim_id}: invalid support_direction ${claim.support_direction}`);
    }
  }

  for (const item of cases) {
    const prefix = item.case_id || '<unknown case>';
    const caseClaims = claimsByCase.get(item.case_id) || [];
    const listedClaimIds = Array.isArray(item.claim_ids) ? item.claim_ids : [];

    if (!ENTITY_KINDS.has(item.entity_kind)) {
      errors.push(`${prefix}: invalid entity_kind ${item.entity_kind}`);
    }
    if (!PRODUCT_SUBTYPES.has(item.product_subtype)) {
      errors.push(`${prefix}: invalid product_subtype ${item.product_subtype}`);
    }
    if (!STATUSES.has(item.status)) {
      errors.push(`${prefix}: invalid status ${item.status}`);
    }
    if (!OUTCOME_LABELS.has(item.outcome_label || 'unclassified')) {
      errors.push(`${prefix}: invalid outcome_label ${item.outcome_label}`);
    }
    if (!CUSTODY_MODELS.has(item.custody_model)) {
      errors.push(`${prefix}: invalid custody_model ${item.custody_model}`);
    }
    if (!Array.isArray(item.chains)) {
      errors.push(`${prefix}: chains must be an array`);
    }
    if (!TOKEN_STATUSES.has(item.token?.status)) {
      errors.push(`${prefix}: invalid token status ${item.token?.status}`);
    }
    if (!item.primary_domain || item.primary_domain.includes('/')) {
      errors.push(`${prefix}: primary_domain must be a bare domain`);
    }
    if (!ISO_DAY.test(item.status_as_of || '')) {
      errors.push(`${prefix}: status_as_of must be an ISO day`);
    }
    if (!hasFieldClaim(caseClaims, 'status')) {
      errors.push(`${prefix}: status has no mapped claim`);
    }
    if (
      !hasFieldClaim(caseClaims, 'identity') &&
      item.quality?.quality_passed
    ) {
      errors.push(`${prefix}: quality-passed identity has no mapped claim`);
    }

    for (const claimId of listedClaimIds) {
      if (!claimIds.has(claimId)) {
        errors.push(`${prefix}: unknown claim_id ${claimId}`);
      }
      const claim = claims.find((candidate) => candidate.claim_id === claimId);
      if (claim && claim.case_id !== item.case_id) {
        errors.push(`${prefix}: claim_id ${claimId} belongs to ${claim.case_id}`);
      }
    }
    for (const claim of caseClaims) {
      if (!listedClaimIds.includes(claim.claim_id)) {
        errors.push(`${prefix}: claim ${claim.claim_id} is not listed in claim_ids`);
      }
    }

    if (item.custody_model === 'noncustodial' && item.chains.length === 0) {
      warnings.push(`${prefix}: noncustodial candidate still needs a canonical chain claim`);
    }
    if (item.token?.status === 'documented') {
      if (!hasFieldClaim(caseClaims, 'token')) {
        errors.push(`${prefix}: documented token has no token claim`);
      }
      const contracts = Array.isArray(item.token.contracts) ? item.token.contracts : [];
      if (!contracts.some((contract) => contract.address)) {
        warnings.push(`${prefix}: documented token lacks a canonical address`);
      }
    }
    if (item.token?.status === 'none_explicit' && !hasFieldClaim(caseClaims, 'token')) {
      errors.push(`${prefix}: none_explicit token status requires an explicit token claim`);
    }

    const completeness = item.quality?.completeness_pct;
    if (typeof completeness !== 'number' || completeness < 0 || completeness > 100) {
      errors.push(`${prefix}: completeness_pct must be between 0 and 100`);
    }

    if (item.quality?.quality_passed) {
      const blockers = item.quality?.blockers || [];
      if (completeness < 75) errors.push(`${prefix}: quality-passed case is below 75% completeness`);
      if (blockers.length) errors.push(`${prefix}: quality-passed case still has blockers`);
      if (item.quality?.human_review_required) {
        errors.push(`${prefix}: quality-passed case still requires human review`);
      }
      if (!item.outcome_rule_id?.trim() || !ISO_DAY.test(item.outcome_as_of || '')) {
        errors.push(`${prefix}: quality-passed case requires an explicit outcome rule and as-of date`);
      }
      if (!CONFIDENCE_LEVELS.has(item.confidence)) {
        errors.push(`${prefix}: quality-passed case requires a valid confidence level`);
      }
      for (const claim of caseClaims) {
        const source = sources.find((candidate) => candidate.source_id === claim.source_id);
        if (!source?.resolving) errors.push(`${prefix}: quality-passed claim uses a non-resolving source`);
        if (!source?.evidence_reviewed) {
          errors.push(`${prefix}: quality-passed claim uses source without editorial evidence review`);
        }
      }
    }
  }

  const passedCount = cases.filter((item) => item.quality?.quality_passed).length;
  if (data.cohort?.quality_passed_count !== passedCount) {
    errors.push(
      `cohort.quality_passed_count ${data.cohort?.quality_passed_count} does not match computed ${passedCount}`,
    );
  }

  return { errors, warnings };
}

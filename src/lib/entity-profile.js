// Canonical, cross-vertical entity profile contract.
//
// This is intentionally stricter than the legacy `profile` JSON blobs. It does
// not guess a name, status, metric meaning, source, or analysis section. Import
// tools may scaffold explicit nulls, but only a cited and current profile can
// pass the publication validator.

export const ENTITY_PROFILE_SCHEMA = 'chaindump-entity-profile';
export const ENTITY_PROFILE_VERSION = 1;

export const ENTITY_TYPES = Object.freeze([
  'blockchain',
  'dex',
  'cex',
  'nft_collection',
  'ordinals_collection',
  'web3_casino',
  'stablecoin',
  'rwa',
  'depin',
  'infrastructure_network',
  'crypto_treasury',
  'miner',
  'etf',
]);

export const ANALYSIS_SECTION_KEYS = Object.freeze([
  'what_it_is',
  'what_happened',
  'why_this_outcome',
  'strategic_choices',
  'operating_model',
  'token_and_value_capture',
  'counterfactual',
  'risks_and_unknowns',
  'lifecycle',
  'outlook_and_watch',
]);

const SHARED_MARKET_METRICS = [
  'token_price', 'token_market_cap', 'token_fdv', 'token_volume',
];

export const METRIC_DIMENSIONS = Object.freeze({
  blockchain: Object.freeze([
    'tvl', 'stablecoin_supply', 'dex_spot_volume', 'derivatives_notional',
    'fees', 'protocol_revenue', 'active_addresses', 'transactions',
    'validator_count', 'staking_ratio', ...SHARED_MARKET_METRICS,
  ]),
  dex: Object.freeze([
    'spot_volume', 'derivatives_notional', 'tvl', 'fees', 'protocol_revenue',
    'market_share', 'volume_to_tvl', 'liquidity_depth', 'active_traders',
    'trader_retention', 'incentives_paid', 'exploit_loss', 'exploit_recovery',
    'downtime_hours', ...SHARED_MARKET_METRICS,
  ]),
  cex: Object.freeze([
    'spot_volume', 'derivatives_notional', 'customer_assets',
    'customer_liabilities', 'reserve_coverage', 'net_flow',
    'withdrawal_latency', 'market_share', 'regulatory_fines',
    'customer_shortfall', 'creditor_recovery', 'active_users',
    ...SHARED_MARKET_METRICS,
  ]),
  nft_collection: Object.freeze([
    'floor_price', 'market_cap', 'secondary_volume', 'mint_raise', 'royalties',
    'holders', 'supply', 'sales', 'unique_buyers', 'unique_sellers',
  ]),
  ordinals_collection: Object.freeze([
    'floor_price', 'market_cap', 'secondary_volume', 'mint_raise', 'royalties',
    'holders', 'supply', 'sales', 'unique_buyers', 'unique_sellers',
    'inscription_count',
  ]),
  web3_casino: Object.freeze([
    'wagers', 'gross_gaming_revenue', 'net_gaming_revenue', 'deposits',
    'withdrawals', 'active_bettors', 'retained_bettors', 'withdrawal_latency',
    'bet_count', 'bankroll', 'liquidity', 'fees', 'protocol_revenue', 'payouts',
    'house_edge', 'return_to_player', 'market_share', 'jurisdiction_count',
    'exploit_loss', 'exploit_recovery', 'downtime_hours',
    ...SHARED_MARKET_METRICS,
  ]),
  stablecoin: Object.freeze([
    'circulating_supply', 'price', 'peg_deviation', 'reserve_assets',
    'reserve_coverage', 'redemption_volume', 'transfer_volume',
    'active_addresses', 'holder_count', 'yield', 'attestation_coverage',
    'tokenized_asset_value', 'nav', 'price_premium_to_initial_unit',
  ]),
  rwa: Object.freeze([
    'tvl', 'aum', 'outstanding_value', 'issuance', 'redemption', 'yield',
    'maturity', 'holders', 'market_cap', 'volume', 'default_rate',
    'collateral_coverage',
  ]),
  depin: Object.freeze([
    'nodes', 'active_nodes', 'capacity', 'utilization', 'revenue',
    'protocol_revenue', 'fees', 'market_cap', 'fdv', 'price', 'volume',
    'token_emissions', 'geographic_coverage', 'active_users', 'unit_revenue',
  ]),
  infrastructure_network: Object.freeze([
    'nodes', 'active_nodes', 'capacity', 'used_capacity', 'utilization',
    'transactions', 'active_addresses', 'fees', 'revenue',
    ...SHARED_MARKET_METRICS,
  ]),
  crypto_treasury: Object.freeze([
    'asset_holdings', 'average_cost_basis', 'market_value', 'market_cap',
    'mnav', 'net_flow', 'share_count', 'debt',
  ]),
  miner: Object.freeze([
    'hashrate', 'monthly_production', 'asset_holdings', 'cost_to_mine',
    'revenue', 'market_cap', 'power_capacity',
  ]),
  etf: Object.freeze([
    'aum', 'net_flow', 'fee_rate', 'asset_holdings', 'market_price', 'nav',
    'premium_discount', 'volume',
  ]),
});

const TOP_LEVEL_KEYS = new Set([
  'schema', 'version', 'identity', 'classification', 'status', 'outcome',
  'analysis', 'metrics', 'events', 'sources', 'claims', 'freshness', 'quality',
  'extensions',
]);
const SOURCE_TIERS = new Set(['A', 'B', 'C', 'D', 'unknown']);
const SOURCE_ROLES = new Set(['primary', 'independent', 'aggregator', 'unknown']);
const SOURCE_ACCESS_STATES = new Set(['unchecked', 'reachable', 'unreachable', 'archived']);
const SUPPORT_DIRECTIONS = new Set(['supports', 'contradicts', 'context_only']);
const CLAIM_REVIEW_STATES = new Set(['pending', 'reviewed', 'rejected']);
const FRESHNESS_STATES = new Set(['current', 'review_due', 'stale', 'unknown']);
const PUBLICATION_STATES = new Set(['draft', 'review', 'published', 'withheld']);
const CONFIDENCE_VALUES = new Set(['high', 'medium', 'low', 'unknown']);
const PLACEHOLDER_NAMES = new Set(['unnamed case', 'unknown', 'tbd', 'n/a']);

function blankSection() {
  return { body: null, as_of: null, claim_ids: [] };
}

export function scaffoldEntityProfile(identity = {}) {
  return {
    schema: ENTITY_PROFILE_SCHEMA,
    version: ENTITY_PROFILE_VERSION,
    identity: {
      id: identity.id ?? null,
      type: identity.type ?? null,
      slug: identity.slug ?? null,
      name: identity.name ?? null,
      aliases: Array.isArray(identity.aliases) ? [...identity.aliases] : [],
    },
    classification: {
      subtype: null,
      tags: [],
      chains: [],
      jurisdictions: [],
    },
    status: {
      operating_state: null,
      as_of: null,
      claim_ids: [],
    },
    outcome: {
      label: null,
      as_of: null,
      rule_id: null,
      confidence: null,
      claim_ids: [],
    },
    analysis: {
      sections: Object.fromEntries(ANALYSIS_SECTION_KEYS.map((key) => [key, blankSection()])),
    },
    metrics: [],
    events: [],
    sources: [],
    claims: [],
    freshness: {
      state: 'unknown',
      last_reviewed_at: null,
      next_review_at: null,
      field_reviews: [],
    },
    quality: {
      publication_state: 'draft',
      completeness_pct: null,
      confidence: null,
      unsourced_fields: [],
    },
    extensions: {},
  };
}

function addError(errors, path, code, message) {
  errors.push({ path, code, message });
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDate(value) {
  if (!isNonEmptyString(value)) return false;
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function validateStringArray(value, path, errors) {
  if (!Array.isArray(value)) {
    addError(errors, path, 'type', 'must be an array');
    return;
  }
  value.forEach((item, index) => {
    if (!isNonEmptyString(item)) addError(errors, `${path}[${index}]`, 'type', 'must be a non-empty string');
  });
}

function validateReferenceSet({
  claimIds,
  path,
  errors,
  claimsById,
  forPublication,
}) {
  if (!Array.isArray(claimIds) || claimIds.length === 0) {
    addError(errors, path, 'citation_required', 'material content requires at least one claim id');
    return;
  }
  const resolved = [];
  claimIds.forEach((claimId, index) => {
    if (!isNonEmptyString(claimId) || !claimsById.has(claimId)) {
      addError(errors, `${path}[${index}]`, 'unknown_claim', 'claim id does not resolve');
      return;
    }
    resolved.push(claimsById.get(claimId));
  });
  if (forPublication && !resolved.some((claim) => (
    claim.support_direction === 'supports'
    && claim.review?.state === 'reviewed'
    && isNonEmptyString(claim.review?.reviewer)
    && isIsoDate(claim.review?.reviewed_at)
  ))) {
    addError(
      errors,
      path,
      'reviewed_support_required',
      'published content requires a human-reviewed supporting claim',
    );
  }
}

function validateSource(source, index, errors, forPublication) {
  const path = `sources[${index}]`;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    addError(errors, path, 'type', 'must be an object');
    return;
  }
  if (!isNonEmptyString(source.id)) addError(errors, `${path}.id`, 'required', 'source id is required');
  if (!isNonEmptyString(source.url) || !source.url.startsWith('https://')) {
    addError(errors, `${path}.url`, 'https_required', 'source URL must use https');
  }
  if (!isNonEmptyString(source.title)) addError(errors, `${path}.title`, 'required', 'source title is required');
  if (!isNonEmptyString(source.publisher)) addError(errors, `${path}.publisher`, 'required', 'source publisher is required');
  if (!SOURCE_TIERS.has(source.tier)) addError(errors, `${path}.tier`, 'enum', 'source tier must be A, B, C, D, or unknown');
  if (!SOURCE_ROLES.has(source.role)) addError(errors, `${path}.role`, 'enum', 'source role is invalid');
  if (!SOURCE_ACCESS_STATES.has(source.access_state)) addError(errors, `${path}.access_state`, 'enum', 'source access state is invalid');
  if (!isIsoDate(source.accessed_at)) addError(errors, `${path}.accessed_at`, 'date', 'accessed_at must be an ISO date or timestamp');
  if (source.checked_at != null && !isIsoDate(source.checked_at)) addError(errors, `${path}.checked_at`, 'date', 'checked_at must be an ISO date or timestamp');
  if (forPublication && !['reachable', 'archived'].includes(source.access_state)) {
    addError(errors, `${path}.access_state`, 'source_unavailable', 'published sources must be reachable or archived');
  }
  if (forPublication && !isIsoDate(source.checked_at)) {
    addError(errors, `${path}.checked_at`, 'source_unchecked', 'published sources require a checked_at timestamp');
  }
}

function validateClaim(claim, index, errors, sourcesById) {
  const path = `claims[${index}]`;
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) {
    addError(errors, path, 'type', 'must be an object');
    return;
  }
  if (!isNonEmptyString(claim.id)) addError(errors, `${path}.id`, 'required', 'claim id is required');
  if (!isNonEmptyString(claim.field_path)) addError(errors, `${path}.field_path`, 'required', 'field path is required');
  if (!Array.isArray(claim.source_ids) || claim.source_ids.length === 0) {
    addError(errors, `${path}.source_ids`, 'source_required', 'claim requires at least one source id');
  } else {
    claim.source_ids.forEach((sourceId, sourceIndex) => {
      if (!sourcesById.has(sourceId)) {
        addError(errors, `${path}.source_ids[${sourceIndex}]`, 'unknown_source', 'source id does not resolve');
      }
    });
  }
  if (!isNonEmptyString(claim.evidence_locator)) addError(errors, `${path}.evidence_locator`, 'required', 'evidence locator is required');
  if (!SUPPORT_DIRECTIONS.has(claim.support_direction)) addError(errors, `${path}.support_direction`, 'enum', 'support direction is invalid');
  if (!CLAIM_REVIEW_STATES.has(claim.review?.state)) addError(errors, `${path}.review.state`, 'enum', 'claim review state is invalid');
  if (claim.review?.state === 'reviewed') {
    if (!isNonEmptyString(claim.review.reviewer)) addError(errors, `${path}.review.reviewer`, 'required', 'reviewer is required');
    if (!isIsoDate(claim.review.reviewed_at)) addError(errors, `${path}.review.reviewed_at`, 'date', 'reviewed_at must be an ISO date or timestamp');
  }
}

export function validateEntityProfile(profile, options = {}) {
  const errors = [];
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const forPublication = Boolean(
    options.forPublication || profile?.quality?.publication_state === 'published',
  );
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return [{ path: '', code: 'type', message: 'profile must be an object' }];
  }

  Object.keys(profile).forEach((key) => {
    if (!TOP_LEVEL_KEYS.has(key)) addError(errors, key, 'unknown_field', 'unknown fields belong under extensions');
  });
  if (profile.schema !== ENTITY_PROFILE_SCHEMA) addError(errors, 'schema', 'schema', `must equal ${ENTITY_PROFILE_SCHEMA}`);
  if (profile.version !== ENTITY_PROFILE_VERSION) addError(errors, 'version', 'version', `must equal ${ENTITY_PROFILE_VERSION}`);

  const identity = profile.identity || {};
  if (!isNonEmptyString(identity.id)) addError(errors, 'identity.id', 'required', 'canonical entity id is required');
  if (!ENTITY_TYPES.includes(identity.type)) addError(errors, 'identity.type', 'enum', 'entity type is unsupported');
  if (!isNonEmptyString(identity.slug)) addError(errors, 'identity.slug', 'required', 'slug is required');
  if (!isNonEmptyString(identity.name)) addError(errors, 'identity.name', 'required', 'display name is required');
  else if (PLACEHOLDER_NAMES.has(identity.name.trim().toLowerCase())) addError(errors, 'identity.name', 'placeholder', 'placeholder names cannot be published as identity');
  if (isNonEmptyString(identity.type) && isNonEmptyString(identity.slug) && isNonEmptyString(identity.id)
      && identity.id !== `${identity.type}:${identity.slug}`) {
    addError(errors, 'identity.id', 'canonical_id', 'entity id must be <type>:<slug>');
  }
  validateStringArray(identity.aliases, 'identity.aliases', errors);

  const classification = profile.classification || {};
  validateStringArray(classification.tags, 'classification.tags', errors);
  validateStringArray(classification.chains, 'classification.chains', errors);
  validateStringArray(classification.jurisdictions, 'classification.jurisdictions', errors);

  const sources = asArray(profile.sources);
  const sourcesById = new Map();
  sources.forEach((source, index) => {
    validateSource(source, index, errors, forPublication);
    if (isNonEmptyString(source?.id)) {
      if (sourcesById.has(source.id)) addError(errors, `sources[${index}].id`, 'duplicate', 'source id must be unique');
      sourcesById.set(source.id, source);
    }
  });

  const claims = asArray(profile.claims);
  const claimsById = new Map();
  claims.forEach((claim, index) => {
    validateClaim(claim, index, errors, sourcesById);
    if (isNonEmptyString(claim?.id)) {
      if (claimsById.has(claim.id)) addError(errors, `claims[${index}].id`, 'duplicate', 'claim id must be unique');
      claimsById.set(claim.id, claim);
    }
  });

  const sections = profile.analysis?.sections;
  if (!sections || typeof sections !== 'object' || Array.isArray(sections)) {
    addError(errors, 'analysis.sections', 'required', 'analysis sections are required');
  } else {
    Object.keys(sections).forEach((key) => {
      if (!ANALYSIS_SECTION_KEYS.includes(key)) addError(errors, `analysis.sections.${key}`, 'unknown_field', 'unknown analysis section');
    });
    ANALYSIS_SECTION_KEYS.forEach((key) => {
      const section = sections[key];
      const path = `analysis.sections.${key}`;
      if (!section || typeof section !== 'object' || Array.isArray(section)) {
        addError(errors, path, 'required', 'section envelope is required');
        return;
      }
      if (section.body == null) return;
      if (!isNonEmptyString(section.body)) {
        addError(errors, `${path}.body`, 'type', 'section body must be non-empty plain prose or null');
        return;
      }
      if (!isIsoDate(section.as_of)) addError(errors, `${path}.as_of`, 'date', 'material prose requires an ISO as_of date');
      validateReferenceSet({
        claimIds: section.claim_ids,
        path: `${path}.claim_ids`,
        errors,
        claimsById,
        forPublication,
      });
    });
  }

  for (const [envelopeName, valueKey] of [['status', 'operating_state'], ['outcome', 'label']]) {
    const envelope = profile[envelopeName] || {};
    if (envelope[valueKey] == null) continue;
    if (!isNonEmptyString(envelope[valueKey])) addError(errors, `${envelopeName}.${valueKey}`, 'type', 'must be a non-empty string or null');
    if (!isIsoDate(envelope.as_of)) addError(errors, `${envelopeName}.as_of`, 'date', 'observed status/outcome requires an ISO as_of date');
    validateReferenceSet({
      claimIds: envelope.claim_ids,
      path: `${envelopeName}.claim_ids`,
      errors,
      claimsById,
      forPublication,
    });
  }

  const metricDimensions = new Set(METRIC_DIMENSIONS[identity.type] || []);
  const metricIds = new Set();
  if (!Array.isArray(profile.metrics)) addError(errors, 'metrics', 'type', 'metrics must be an array');
  asArray(profile.metrics).forEach((metric, index) => {
    const path = `metrics[${index}]`;
    if (!metric || typeof metric !== 'object' || Array.isArray(metric)) {
      addError(errors, path, 'type', 'metric must be an object');
      return;
    }
    if (!isNonEmptyString(metric.id)) addError(errors, `${path}.id`, 'required', 'metric id is required');
    else if (metricIds.has(metric.id)) addError(errors, `${path}.id`, 'duplicate', 'metric id must be unique');
    else metricIds.add(metric.id);
    if (!metricDimensions.has(metric.dimension)) {
      addError(errors, `${path}.dimension`, 'unsupported_metric', 'metric dimension is not valid for this entity type');
    }
    if (!Number.isFinite(metric.value)) addError(errors, `${path}.value`, 'type', 'metric value must be a finite number');
    if (!isNonEmptyString(metric.unit)) addError(errors, `${path}.unit`, 'required', 'metric unit is required');
    if (!isIsoDate(metric.as_of)) addError(errors, `${path}.as_of`, 'date', 'metric as_of must be an ISO date or timestamp');
    if (!isNonEmptyString(metric.window?.definition)) addError(errors, `${path}.window.definition`, 'required', 'metric window definition is required');
    validateReferenceSet({
      claimIds: metric.claim_ids,
      path: `${path}.claim_ids`,
      errors,
      claimsById,
      forPublication,
    });
  });

  if (!Array.isArray(profile.events)) addError(errors, 'events', 'type', 'events must be an array');
  asArray(profile.events).forEach((event, index) => {
    const path = `events[${index}]`;
    if (!isNonEmptyString(event?.id)) addError(errors, `${path}.id`, 'required', 'event id is required');
    if (!isNonEmptyString(event?.type)) addError(errors, `${path}.type`, 'required', 'event type is required');
    if (!isIsoDate(event?.date)) addError(errors, `${path}.date`, 'date', 'event date must be an ISO date or timestamp');
    if (!isNonEmptyString(event?.description)) addError(errors, `${path}.description`, 'required', 'event description is required');
    validateReferenceSet({
      claimIds: event?.claim_ids,
      path: `${path}.claim_ids`,
      errors,
      claimsById,
      forPublication,
    });
  });

  const freshness = profile.freshness || {};
  if (!FRESHNESS_STATES.has(freshness.state)) addError(errors, 'freshness.state', 'enum', 'freshness state is invalid');
  if (freshness.last_reviewed_at != null && !isIsoDate(freshness.last_reviewed_at)) addError(errors, 'freshness.last_reviewed_at', 'date', 'last_reviewed_at must be an ISO date or timestamp');
  if (freshness.next_review_at != null && !isIsoDate(freshness.next_review_at)) addError(errors, 'freshness.next_review_at', 'date', 'next_review_at must be an ISO date or timestamp');
  if (forPublication) {
    if (!isIsoDate(freshness.last_reviewed_at)) addError(errors, 'freshness.last_reviewed_at', 'review_required', 'published profiles require last_reviewed_at');
    if (!isIsoDate(freshness.next_review_at)) addError(errors, 'freshness.next_review_at', 'review_required', 'published profiles require next_review_at');
    else if (Date.parse(freshness.next_review_at) < now.getTime()) addError(errors, 'freshness.next_review_at', 'review_overdue', 'profile review is overdue');
    if (freshness.state !== 'current') addError(errors, 'freshness.state', 'not_current', 'published profiles must be current');
  }

  const quality = profile.quality || {};
  if (!PUBLICATION_STATES.has(quality.publication_state)) addError(errors, 'quality.publication_state', 'enum', 'publication state is invalid');
  if (quality.completeness_pct != null && (!Number.isFinite(quality.completeness_pct) || quality.completeness_pct < 0 || quality.completeness_pct > 100)) {
    addError(errors, 'quality.completeness_pct', 'range', 'completeness_pct must be between 0 and 100');
  }
  if (quality.confidence != null && !CONFIDENCE_VALUES.has(quality.confidence)) addError(errors, 'quality.confidence', 'enum', 'quality confidence is invalid');
  validateStringArray(quality.unsourced_fields, 'quality.unsourced_fields', errors);
  if (forPublication && quality.publication_state !== 'published') addError(errors, 'quality.publication_state', 'not_published', 'publication validation requires published state');
  if (forPublication && quality.completeness_pct == null) addError(errors, 'quality.completeness_pct', 'required', 'published profiles require completeness_pct');
  if (!profile.extensions || typeof profile.extensions !== 'object' || Array.isArray(profile.extensions)) addError(errors, 'extensions', 'type', 'extensions must be an object');

  return errors;
}

export function profileSummary(profile) {
  return {
    schema: profile.schema,
    version: profile.version,
    identity: profile.identity,
    classification: profile.classification,
    status: profile.status,
    outcome: profile.outcome,
    headline_metrics: asArray(profile.metrics).filter((metric) => metric.headline !== false),
    freshness: profile.freshness,
    quality: profile.quality,
  };
}

// Returns an already-normalized profile embedded in a legacy row only when its
// canonical identity matches the route being resolved. Publication freshness is
// intentionally not revalidated here: an overdue report must remain readable
// with its dated freshness envelope instead of silently falling back to a thin
// legacy adapter. Migration and editorial gates perform publication validation.
export function embeddedCanonicalEntityProfile(legacyProfile, identity = {}) {
  let parsed = legacyProfile;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  const candidate = parsed?.canonical_profile;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  if (candidate.schema !== ENTITY_PROFILE_SCHEMA || candidate.version !== ENTITY_PROFILE_VERSION) return null;
  if (candidate.identity?.type !== identity.type || candidate.identity?.slug !== identity.slug) return null;
  if (candidate.identity?.id !== `${identity.type}:${identity.slug}`) return null;
  return candidate;
}

function legacySource(source, index) {
  const value = typeof source === 'string' ? { url: source } : (source || {});
  const rawTier = value.tier || value.source_tier || 'unknown';
  const rawRole = value.role || value.source_role || 'unknown';
  const rawAccess = String(value.access_state || '').toLowerCase();
  const accessState = (() => {
    if (SOURCE_ACCESS_STATES.has(rawAccess)) return rawAccess;
    if (['accessible', 'access_verified', 'resolving'].includes(rawAccess)) return 'reachable';
    if (['archived', 'archive_verified'].includes(rawAccess)) return 'archived';
    if (rawAccess || value.resolving === false || value.reachable === false) return 'unreachable';
    if (value.resolving === true || value.reachable === true) return 'reachable';
    return 'unchecked';
  })();
  return {
    id: value.id || value.source_id || `legacy-source-${index + 1}`,
    title: value.title ?? null,
    url: value.url || value.canonical_url || null,
    publisher: value.publisher ?? null,
    published_at: value.published_at ?? null,
    accessed_at: value.accessed_at || value.access_checked_at
      || value.checked_at || value.last_verified_at || null,
    archive_url: value.archive_url ?? null,
    tier: SOURCE_TIERS.has(rawTier) ? rawTier : 'unknown',
    role: SOURCE_ROLES.has(rawRole) ? rawRole : 'unknown',
    access_state: accessState,
    checked_at: value.checked_at || value.access_checked_at || value.last_verified_at || null,
    content_hash: value.content_hash ?? null,
  };
}

// Transitional adapter used by the read-only profile endpoint. It maps only
// explicit prose strings and typed observations. Objects/arrays are retained
// under extensions.legacy_unmapped; they are never recursively stringified into
// public copy. The returned `review` profile includes validation errors so each
// missing date/citation remains visible during migration.
export function buildLegacyEntityProfile(input = {}) {
  const profile = scaffoldEntityProfile(input.identity || {});
  const classification = input.classification || {};
  profile.classification = {
    subtype: classification.subtype ?? null,
    tags: Array.isArray(classification.tags) ? classification.tags : [],
    chains: Array.isArray(classification.chains) ? classification.chains : [],
    jurisdictions: Array.isArray(classification.jurisdictions)
      ? classification.jurisdictions
      : [],
  };

  const unmappedSections = {};
  for (const key of ANALYSIS_SECTION_KEYS) {
    const value = input.sections?.[key];
    if (value == null || value === '') continue;
    if (typeof value !== 'string') {
      unmappedSections[key] = value;
      continue;
    }
    profile.analysis.sections[key] = {
      body: value,
      as_of: input.section_dates?.[key] || input.as_of || null,
      claim_ids: Array.isArray(input.section_claim_ids?.[key])
        ? input.section_claim_ids[key]
        : [],
    };
  }

  const status = input.status || {};
  profile.status = {
    operating_state: status.operating_state ?? null,
    as_of: status.as_of ?? null,
    claim_ids: Array.isArray(status.claim_ids) ? status.claim_ids : [],
  };
  const outcome = input.outcome || {};
  profile.outcome = {
    label: outcome.label ?? null,
    as_of: outcome.as_of ?? null,
    rule_id: outcome.rule_id ?? null,
    confidence: outcome.confidence ?? null,
    claim_ids: Array.isArray(outcome.claim_ids) ? outcome.claim_ids : [],
  };
  profile.metrics = Array.isArray(input.metrics) ? input.metrics : [];
  profile.events = Array.isArray(input.events) ? input.events : [];
  profile.sources = (Array.isArray(input.sources) ? input.sources : [])
    .map(legacySource);
  profile.claims = Array.isArray(input.claims) ? input.claims : [];
  profile.freshness = {
    state: input.freshness?.state || 'unknown',
    last_reviewed_at: input.freshness?.last_reviewed_at ?? null,
    next_review_at: input.freshness?.next_review_at ?? null,
    field_reviews: Array.isArray(input.freshness?.field_reviews)
      ? input.freshness.field_reviews
      : [],
  };

  const nonNullSections = ANALYSIS_SECTION_KEYS.filter((key) => (
    profile.analysis.sections[key].body != null
  ));
  const missingSections = ANALYSIS_SECTION_KEYS.filter((key) => (
    profile.analysis.sections[key].body == null
  ));
  const uncitedSections = nonNullSections.filter((key) => (
    profile.analysis.sections[key].claim_ids.length === 0
  ));
  profile.quality = {
    publication_state: 'review',
    completeness_pct: Math.round((nonNullSections.length / ANALYSIS_SECTION_KEYS.length) * 100),
    confidence: input.confidence || 'unknown',
    unsourced_fields: [
      ...missingSections.map((key) => `analysis.sections.${key}.body`),
      ...uncitedSections.map((key) => `analysis.sections.${key}.claim_ids`),
    ],
  };
  profile.extensions = {
    ...(input.extensions && typeof input.extensions === 'object' ? input.extensions : {}),
    legacy_unmapped: unmappedSections,
  };
  profile.quality.validation_errors = validateEntityProfile(profile);
  return profile;
}

export function entityProfileContract() {
  return {
    schema: ENTITY_PROFILE_SCHEMA,
    version: ENTITY_PROFILE_VERSION,
    entity_types: ENTITY_TYPES,
    analysis_sections: ANALYSIS_SECTION_KEYS,
    metric_dimensions: METRIC_DIMENSIONS,
    rules: {
      missing_values: 'null',
      analysis_format: 'plain_prose_only',
      status_and_outcome_are_separate: true,
      material_fields_require_claim_ids: true,
      published_claims_require_human_review: true,
      published_profiles_require_current_review: true,
      unknown_fields_belong_under_extensions: true,
    },
  };
}

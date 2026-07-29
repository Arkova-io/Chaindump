const HTTPS_URL = /^https:\/\/\S+$/;
const ISO_REVIEW_TIMESTAMP = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/;

const TIER_RANK = Object.freeze({
  T1: 1,
  T2: 2,
  T3: 3,
  T4: 4,
  unknown: 5,
});

const HIGH_RISK_CLAIM_TYPES = new Set([
  'adverse',
  'causal',
  'legal',
  'lifecycle',
  'loss',
]);
const NFT_NARRATIVE_FIELDS = new Set([
  'business',
  'community_history',
  'community_sentiment',
  'founder_engagement',
  'notable_holders',
  'social',
]);

const AUTHORITY_HOSTS = new Set([
  'cftc.gov',
  'fiod.nl',
  'ftc.gov',
  'justice.gov',
  'om.nl',
  'prosecutionservice.nl',
  'sec.gov',
]);

const TIER_TWO_INDEPENDENT_HOSTS = new Set([
  'apnews.com',
  'bloomberg.com',
  'euronext.com',
  'reuters.com',
]);

const TIER_THREE_INDEPENDENT_HOSTS = new Set([
  'coindesk.com',
  'cointelegraph.com',
  'decrypt.co',
  'pcgamer.com',
  'protos.com',
  'racefans.net',
  'theblock.co',
]);

const DATA_HOSTS = new Set([
  'api.coingecko.com',
  'api.llama.fi',
  'coingecko.com',
  'defillama.com',
]);

const AGGREGATOR_HOSTS = new Set([
  'gate.com',
  'crypto-news-flash.com',
]);

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeHost(url) {
  if (!HTTPS_URL.test(url || '')) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function hostMatches(host, candidates) {
  if (!host) return false;
  return [...candidates].some((candidate) => (
    host === candidate || host.endsWith(`.${candidate}`)
  ));
}

function mapCasinoTier(tier) {
  return {
    A: 'T1',
    B: 'T2',
    C: 'T3',
    D: 'T4',
  }[tier] || null;
}

function explicitTier(source) {
  const tier = source.source_tier || source.tier;
  if (TIER_RANK[tier]) return tier;
  return mapCasinoTier(tier);
}

function explicitRole(source) {
  const role = source.source_role || source.role;
  if (!role) return null;
  if (role === 'regulator' || role === 'regulatory-filing') return 'authority';
  if (role === 'independent-reporting' || role === 'security-research') return 'independent';
  if (role === 'security-database' || role === 'third-party-data') return 'data';
  if (role === 'aggregator') return 'aggregator';
  if (role === 'primary') return 'primary';
  if (role === 'independent') return 'independent';
  return role;
}

function accessState(source) {
  if (String(source.access_state || '').trim()) return String(source.access_state).trim();
  if (source.resolving === true || source.resolving === 1) return 'resolving';
  if (source.resolving === false || source.resolving === 0) return 'not_resolving';
  return 'not_recorded';
}

function resolvingState(source, state) {
  if (source.resolving === true || source.resolving === 1) return true;
  if (source.resolving === false || source.resolving === 0) return false;
  if (state === 'resolving') return true;
  if (state === 'not_resolving') return false;
  return null;
}

function normalizedIndependenceKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ') || null;
}

function independenceHost(host) {
  for (const candidates of [
    AUTHORITY_HOSTS,
    TIER_TWO_INDEPENDENT_HOSTS,
    TIER_THREE_INDEPENDENT_HOSTS,
  ]) {
    const policyRoot = [...candidates].find((candidate) => hostMatches(host, new Set([candidate])));
    if (policyRoot) return policyRoot;
  }
  return host;
}

export function isIsoReviewTimestamp(value) {
  const text = String(value || '').trim();
  return ISO_REVIEW_TIMESTAMP.test(text) && !Number.isNaN(Date.parse(text));
}

function classifyByHost(source, host) {
  if (hostMatches(host, AUTHORITY_HOSTS)) {
    return { tier: 'T1', role: 'authority', basis: 'host_policy' };
  }
  if (hostMatches(host, TIER_TWO_INDEPENDENT_HOSTS)) {
    return { tier: 'T2', role: 'independent', basis: 'host_policy' };
  }
  if (hostMatches(host, TIER_THREE_INDEPENDENT_HOSTS)) {
    return { tier: 'T3', role: 'independent', basis: 'host_policy' };
  }
  if (hostMatches(host, DATA_HOSTS)) {
    return { tier: 'T3', role: 'data', basis: 'host_policy' };
  }
  if (hostMatches(host, AGGREGATOR_HOSTS)) {
    return { tier: 'T4', role: 'aggregator', basis: 'host_policy' };
  }
  if (explicitRole(source) === 'primary') {
    return { tier: 'T2', role: 'primary', basis: 'declared_role' };
  }
  return { tier: 'unknown', role: 'unknown', basis: 'unclassified' };
}

export function normalizePublicationSource(sourceValue) {
  const source = typeof sourceValue === 'string'
    ? { url: sourceValue }
    : asObject(sourceValue);
  const url = source.url || source.canonical_url || null;
  const host = normalizeHost(url);
  const byHost = classifyByHost(source, host);
  const tier = explicitTier(source) || byHost.tier;
  const declaredRole = explicitRole(source);
  const role = byHost.role === 'authority'
    ? 'authority'
    : declaredRole || byHost.role;
  const publisher = source.publisher || host || source.title || null;
  const state = accessState(source);
  const explicitIndependenceGroup = normalizedIndependenceKey(
    source.independence_group
      || source.independence_key
      || source.evidence_origin
      || '',
  );
  const evidenceReviewer = String(source.evidence_reviewer || '').trim() || null;
  const reviewTimestamp = String(source.evidence_reviewed_at || '').trim() || null;
  const evidenceReviewedAt = isIsoReviewTimestamp(reviewTimestamp) ? reviewTimestamp : null;
  const evidenceReviewed = (
    source.evidence_reviewed === true || source.evidence_reviewed === 1
  ) && Boolean(evidenceReviewer && evidenceReviewedAt);
  const resolving = resolvingState(source, state);
  return {
    id: source.id || source.source_id || url,
    url,
    host,
    title: source.title || null,
    publisher,
    tier,
    role,
    independence_key: role === 'independent' || role === 'authority'
      ? (
        explicitIndependenceGroup
        || independenceHost(host)
        || normalizedIndependenceKey(publisher)
      )
      : null,
    independence_group: explicitIndependenceGroup,
    access_state: state,
    resolving,
    evidence_reviewed: evidenceReviewed,
    evidence_reviewer: evidenceReviewer,
    evidence_reviewed_at: evidenceReviewedAt,
    classification_basis: byHost.role === 'authority'
      ? 'host_policy'
      : explicitTier(source) || declaredRole
      ? 'declared_metadata'
      : byHost.basis,
  };
}

function sourceReferenceKey(reference) {
  if (typeof reference === 'string') return reference;
  const item = asObject(reference);
  return item.ref || item.source_id || item.id || item.url || null;
}

function sourceMap(sources) {
  const result = new Map();
  for (const source of sources) {
    const normalized = normalizePublicationSource(source);
    for (const key of [
      normalized.id,
      normalized.url,
      asObject(source).id,
      asObject(source).source_id,
      asObject(source).canonical_url,
    ]) {
      if (key) result.set(key, normalized);
    }
  }
  return result;
}

function collectForensicClaims(analysisValue) {
  const analysis = asObject(analysisValue);
  if (analysis.version !== 'forensic-analysis-v1') return [];
  const claims = [];
  const push = (path, type, section) => {
    const value = asObject(section);
    claims.push({
      path,
      type,
      high_risk: HIGH_RISK_CLAIM_TYPES.has(type),
      source_refs: asArray(value.source_refs || value.refs),
    });
  };
  push('forensic_analysis.outcome', 'lifecycle', analysis.outcome);
  push('forensic_analysis.why', 'causal', analysis.why);
  for (const [index, choice] of asArray(analysis.strategic_choices).entries()) {
    push(`forensic_analysis.strategic_choices[${index}]`, 'causal', choice);
  }
  push('forensic_analysis.counterfactual', 'causal', analysis.counterfactual);
  for (const [index, watch] of asArray(analysis.watch).entries()) {
    push(`forensic_analysis.watch[${index}]`, 'context', watch);
  }
  return claims;
}

function evidenceClaimType(evidence) {
  if (NFT_NARRATIVE_FIELDS.has(String(evidence.field || '').toLowerCase())) return 'causal';
  const text = `${evidence.field || ''} ${evidence.value || ''}`.toLowerCase();
  if (/(legal|licen[cs]e|lawsuit|arrest|convict|charge|regulat)/.test(text)) return 'legal';
  if (/(loss|stolen|seiz|hack|exploit|victim|deposit|recovery)/.test(text)) return 'loss';
  if (/(lifecycle|status|shutdown|closure|closed|dead|failed|declin|wind.down)/.test(text)) {
    return 'lifecycle';
  }
  return 'field';
}

function collectNftEvidenceClaims(profile) {
  return asArray(profile.evidence).map((evidence, index) => {
    const type = evidenceClaimType(evidence);
    return {
      path: `evidence[${index}].${evidence.field || 'unknown'}`,
      type,
      high_risk: HIGH_RISK_CLAIM_TYPES.has(type),
      source_refs: asArray(evidence.source_ids),
    };
  });
}

function casinoClaimType(claim) {
  const text = `${claim.field_path || ''} ${claim.claim_type || ''} `
    + `${claim.evidence_locator || ''} ${claim.analyst_note || ''}`.toLowerCase();
  if (claim.claim_type === 'context' && claim.support_direction === 'context_only') {
    return 'context';
  }
  if (claim.claim_type === 'licence' || /(legal|licen[cs]e|arrest|convict|charge|regulat)/.test(text)) {
    return 'legal';
  }
  if (/(loss|stolen|seiz|hack|exploit|victim|deposit|recovery|insolven)/.test(text)) {
    return 'loss';
  }
  if (claim.claim_type === 'status' || /(^|[._])(status|outcome|failed|inactive)/.test(text)) {
    return 'lifecycle';
  }
  if (claim.claim_type === 'risk' || claim.claim_type === 'event') return 'adverse';
  return claim.claim_type || 'field';
}

function collectCasinoClaims(claims) {
  return claims.map((claim) => {
    const type = casinoClaimType(claim);
    return {
      path: `casino_claims.${claim.claim_id}`,
      type,
      high_risk: HIGH_RISK_CLAIM_TYPES.has(type),
      source_refs: [claim.source_id],
    };
  });
}

function uniqueSources(sources) {
  return [...new Map(sources.map((source) => [
    source.url || source.id,
    source,
  ])).values()];
}

export function evaluatePublicationClaim(claim, registeredSources) {
  const resolved = [];
  const unresolvedRefs = [];
  for (const reference of asArray(claim.source_refs)) {
    const key = sourceReferenceKey(reference);
    const source = registeredSources.get(key);
    if (!source) unresolvedRefs.push(key || '<invalid-reference>');
    else resolved.push(source);
  }
  const unique = uniqueSources(resolved);
  const accessible = unique.filter((source) => (
    source.resolving === true && source.evidence_reviewed
  ));
  const tierOneAuthority = accessible.filter((source) => (
    source.tier === 'T1' && source.role === 'authority'
  ));
  const strongIndependent = accessible.filter((source) => (
    (source.tier === 'T1' || source.tier === 'T2')
    && source.role === 'independent'
  ));
  const tierTwoPrimaryLifecycle = accessible.filter((source) => (
    source.tier === 'T2' && source.role === 'primary'
  ));
  const independentTierThree = new Set(accessible
    .filter((source) => source.tier === 'T3' && source.role === 'independent')
    .map((source) => source.independence_key)
    .filter(Boolean));
  const passes = !claim.high_risk
    || tierOneAuthority.length >= 1
    || strongIndependent.length >= 1
    || independentTierThree.size >= 2;
  const passesWithOperatorLifecycle = passes || (
    claim.type === 'lifecycle' && tierTwoPrimaryLifecycle.length >= 1
  );
  const gaps = [];
  if (unresolvedRefs.length) gaps.push('unregistered_source_reference');
  if (unique.length === 0) gaps.push('no_registered_evidence');
  if (unique.length > 0 && accessible.length === 0) gaps.push('no_resolving_reviewed_evidence');
  if (claim.high_risk && !passesWithOperatorLifecycle) {
    gaps.push('high_risk_evidence_threshold_not_met');
  }
  return {
    ...claim,
    source_count: unique.length,
    resolving_reviewed_source_count: accessible.length,
    t1_authority_source_count: tierOneAuthority.length,
    t1_t2_independent_source_count: strongIndependent.length,
    t2_primary_lifecycle_source_count: tierTwoPrimaryLifecycle.length,
    independent_t3_publisher_count: independentTierThree.size,
    unresolved_refs: unresolvedRefs,
    passes: passesWithOperatorLifecycle,
    gaps: [...new Set(gaps)],
  };
}

function inspectDossier({ vertical, id, name, sources, claims }) {
  const normalizedSources = asArray(sources).map(normalizePublicationSource);
  const registered = sourceMap(asArray(sources));
  const evaluatedClaims = claims.map((claim) => evaluatePublicationClaim(claim, registered));
  const highRisk = evaluatedClaims.filter((claim) => claim.high_risk);
  const unresolvedHighRisk = highRisk.filter((claim) => !claim.passes);
  const unmatchedRefs = [...new Set(evaluatedClaims.flatMap((claim) => claim.unresolved_refs))];
  const sourceAccessCounts = Object.fromEntries(Object.entries(normalizedSources.reduce(
    (counts, source) => {
      counts[source.access_state] = (counts[source.access_state] || 0) + 1;
      return counts;
    },
    {},
  )).sort(([left], [right]) => left.localeCompare(right)));
  const tierCounts = Object.fromEntries(Object.entries(normalizedSources.reduce(
    (counts, source) => {
      counts[source.tier] = (counts[source.tier] || 0) + 1;
      return counts;
    },
    {},
  )).sort(([left], [right]) => (
    (TIER_RANK[left] || 99) - (TIER_RANK[right] || 99) || left.localeCompare(right)
  )));
  const roleCounts = Object.fromEntries(Object.entries(normalizedSources.reduce(
    (counts, source) => {
      counts[source.role] = (counts[source.role] || 0) + 1;
      return counts;
    },
    {},
  )).sort(([left], [right]) => left.localeCompare(right)));
  const riskScore = (
    unresolvedHighRisk.length * 100
    + unmatchedRefs.length * 20
    + normalizedSources.filter((source) => source.resolving === false).length * 4
    + normalizedSources.filter((source) => source.tier === 'unknown').length * 2
  );
  return {
    vertical,
    id,
    name,
    risk_score: riskScore,
    claim_count: evaluatedClaims.length,
    high_risk_claim_count: highRisk.length,
    passing_high_risk_claim_count: highRisk.length - unresolvedHighRisk.length,
    unresolved_high_risk_claim_count: unresolvedHighRisk.length,
    source_count: normalizedSources.length,
    unmatched_source_ref_count: unmatchedRefs.length,
    unmatched_source_refs: unmatchedRefs,
    source_tier_counts: tierCounts,
    source_role_counts: roleCounts,
    source_access_counts: sourceAccessCounts,
    claim_support: evaluatedClaims.map((claim) => ({
      path: claim.path,
      type: claim.type,
      high_risk: claim.high_risk,
      passes: claim.passes,
      gaps: claim.gaps,
    })),
    unresolved_high_risk_claims: unresolvedHighRisk.map((claim) => ({
      path: claim.path,
      type: claim.type,
      source_count: claim.source_count,
      resolving_reviewed_source_count: claim.resolving_reviewed_source_count,
      t1_authority_source_count: claim.t1_authority_source_count,
      t1_t2_independent_source_count: claim.t1_t2_independent_source_count,
      t2_primary_lifecycle_source_count: claim.t2_primary_lifecycle_source_count,
      independent_t3_publisher_count: claim.independent_t3_publisher_count,
      unresolved_refs: claim.unresolved_refs,
      gaps: claim.gaps,
    })),
  };
}

export function assessCasinoPublicationDepth({
  caseId,
  name,
  sources,
  claims,
  forensicAnalysis,
}) {
  const assessment = inspectDossier({
    vertical: 'casino',
    id: caseId,
    name,
    sources: asArray(sources),
    claims: [
      ...collectCasinoClaims(asArray(claims)),
      ...collectForensicClaims(forensicAnalysis),
    ],
  });
  return compactPublicationDepth(assessment, sources);
}

function compactPublicationDepth(assessment, sources) {
  const normalizedSources = asArray(sources).map(normalizePublicationSource);
  return {
    status: assessment.unresolved_high_risk_claim_count > 0
      ? 'claim_support_pending'
      : 'high_risk_support_threshold_met',
    claim_count: assessment.claim_count,
    high_risk_claim_count: assessment.high_risk_claim_count,
    passing_high_risk_claim_count: assessment.passing_high_risk_claim_count,
    unresolved_high_risk_claim_count: assessment.unresolved_high_risk_claim_count,
    unmatched_source_ref_count: assessment.unmatched_source_ref_count,
    unresolved_high_risk_claims: assessment.unresolved_high_risk_claims,
    claim_support: assessment.claim_support,
    registered_source_count: normalizedSources.length,
    reachable_source_count: normalizedSources.filter((source) => source.resolving === true).length,
    reviewed_source_count: normalizedSources.filter((source) => (
      source.resolving === true && source.evidence_reviewed
    )).length,
    policy_note: 'Corpus inclusion measures indexed dossier coverage, not editorial claim support. Unsupported high-risk conclusions remain pending.',
  };
}

export function assessExchangePublicationDepth({
  kind,
  lifecycle,
  slug,
  name,
  sources,
  forensicAnalysis,
}) {
  const assessment = inspectDossier({
    vertical: 'exchange',
    id: `${kind}:${lifecycle}:${slug}`,
    name,
    sources: asArray(sources),
    claims: collectForensicClaims(forensicAnalysis),
  });
  return compactPublicationDepth(assessment, sources);
}

export function assessNftPublicationDepth({
  slug,
  name,
  sources,
  profile,
}) {
  const normalizedProfile = asObject(profile);
  const assessment = inspectDossier({
    vertical: 'nft_ordinals',
    id: slug,
    name,
    sources: asArray(sources),
    claims: [
      ...collectForensicClaims(normalizedProfile.forensic_analysis),
      ...collectNftEvidenceClaims(normalizedProfile),
    ],
  });
  return compactPublicationDepth(assessment, sources);
}

export function summarizePublicationDepth(assessments) {
  const rows = asArray(assessments).filter(Boolean);
  return {
    dossier_count: rows.length,
    claim_count: rows.reduce((sum, row) => sum + row.claim_count, 0),
    high_risk_claim_count: rows.reduce(
      (sum, row) => sum + row.high_risk_claim_count,
      0,
    ),
    passing_high_risk_claim_count: rows.reduce(
      (sum, row) => sum + row.passing_high_risk_claim_count,
      0,
    ),
    unresolved_high_risk_claim_count: rows.reduce(
      (sum, row) => sum + row.unresolved_high_risk_claim_count,
      0,
    ),
    registered_source_count: rows.reduce(
      (sum, row) => sum + row.registered_source_count,
      0,
    ),
    reachable_source_count: rows.reduce(
      (sum, row) => sum + row.reachable_source_count,
      0,
    ),
    reviewed_source_count: rows.reduce(
      (sum, row) => sum + row.reviewed_source_count,
      0,
    ),
    policy_note: 'Corpus inclusion measures indexed dossier coverage, not editorial claim support. Unsupported high-risk conclusions remain pending.',
  };
}

function exchangeRows(database) {
  return database.prepare(`
    SELECT 'successful' AS lifecycle, type AS kind, slug, name, profile, sources
    FROM successful_exchanges
    UNION ALL
    SELECT 'mid', kind, slug, name, profile, sources
    FROM mid_exchanges
    UNION ALL
    SELECT 'dead', kind, slug, name, profile, sources
    FROM dead_exchanges
    ORDER BY kind, lifecycle, slug
  `).all();
}

function casinoRows(database) {
  return database.prepare(`
    SELECT c.case_id, c.brand_name, s.outlook
    FROM casino_cases AS c
    LEFT JOIN casino_syntheses AS s USING (case_id)
    ORDER BY c.case_id
  `).all();
}

function casinoSources(database, caseId) {
  return database.prepare(`
    SELECT DISTINCT
      s.source_id,
      s.canonical_url,
      s.title,
      s.publisher,
      s.source_tier,
      s.source_role,
      s.resolving,
      s.evidence_reviewed,
      s.evidence_reviewed_at,
      s.evidence_reviewer,
      s.accessed_at
    FROM casino_sources AS s
    JOIN casino_claims AS c USING (source_id)
    WHERE c.case_id = ?
    ORDER BY s.source_id
  `).all(caseId);
}

function casinoClaims(database, caseId) {
  return database.prepare(`
    SELECT
      claim_id,
      field_path,
      source_id,
      evidence_locator,
      claim_type,
      support_direction,
      analyst_note
    FROM casino_claims
    WHERE case_id = ?
    ORDER BY claim_id
  `).all(caseId);
}

function inspectExchange(row) {
  const profile = parseJson(row.profile, {});
  return inspectDossier({
    vertical: 'exchange',
    id: `${row.kind}:${row.lifecycle}:${row.slug}`,
    name: row.name,
    sources: parseJson(row.sources, []),
    claims: collectForensicClaims(profile.forensic_analysis),
  });
}

function inspectCasino(database, row) {
  const synthesis = parseJson(row.outlook, {});
  const claims = [
    ...collectCasinoClaims(casinoClaims(database, row.case_id)),
    ...collectForensicClaims(synthesis.forensic_analysis),
  ];
  return inspectDossier({
    vertical: 'casino',
    id: row.case_id,
    name: row.brand_name,
    sources: casinoSources(database, row.case_id),
    claims,
  });
}

function inspectNft(row) {
  const profile = parseJson(row.profile, {});
  return inspectDossier({
    vertical: 'nft_ordinals',
    id: row.slug,
    name: row.name,
    sources: parseJson(row.sources, []),
    claims: [
      ...collectForensicClaims(profile.forensic_analysis),
      ...collectNftEvidenceClaims(profile),
    ],
  });
}

function summarize(dossiers) {
  const byVertical = {};
  for (const vertical of ['exchange', 'casino', 'nft_ordinals']) {
    const rows = dossiers.filter((dossier) => dossier.vertical === vertical);
    byVertical[vertical] = {
      dossier_count: rows.length,
      high_risk_claim_count: rows.reduce(
        (sum, dossier) => sum + dossier.high_risk_claim_count,
        0,
      ),
      passing_high_risk_claim_count: rows.reduce(
        (sum, dossier) => sum + dossier.passing_high_risk_claim_count,
        0,
      ),
      unresolved_high_risk_claim_count: rows.reduce(
        (sum, dossier) => sum + dossier.unresolved_high_risk_claim_count,
        0,
      ),
      dossiers_with_unresolved_high_risk_claims: rows.filter(
        (dossier) => dossier.unresolved_high_risk_claim_count > 0,
      ).length,
      dossiers_with_unmatched_source_refs: rows.filter(
        (dossier) => dossier.unmatched_source_ref_count > 0,
      ).length,
    };
  }
  return {
    dossier_count: dossiers.length,
    high_risk_claim_count: dossiers.reduce(
      (sum, dossier) => sum + dossier.high_risk_claim_count,
      0,
    ),
    passing_high_risk_claim_count: dossiers.reduce(
      (sum, dossier) => sum + dossier.passing_high_risk_claim_count,
      0,
    ),
    unresolved_high_risk_claim_count: dossiers.reduce(
      (sum, dossier) => sum + dossier.unresolved_high_risk_claim_count,
      0,
    ),
    dossiers_with_unresolved_high_risk_claims: dossiers.filter(
      (dossier) => dossier.unresolved_high_risk_claim_count > 0,
    ).length,
    dossiers_with_unmatched_source_refs: dossiers.filter(
      (dossier) => dossier.unmatched_source_ref_count > 0,
    ).length,
    by_vertical: byVertical,
  };
}

export function buildPublicationDepthInventory(database, options = {}) {
  const dossiers = [
    ...exchangeRows(database).map(inspectExchange),
    ...casinoRows(database).map((row) => inspectCasino(database, row)),
    ...database.prepare(`
      SELECT slug, name, profile, sources
      FROM nft_collections
      ORDER BY slug
    `).all().map(inspectNft),
  ].sort((left, right) => (
    right.risk_score - left.risk_score
    || right.unresolved_high_risk_claim_count - left.unresolved_high_risk_claim_count
    || left.vertical.localeCompare(right.vertical)
    || left.id.localeCompare(right.id)
  ));
  return {
    schema: 'chaindump-publication-depth-v1',
    as_of: options.asOf || null,
    policy: {
      high_risk_claim_types: [...HIGH_RISK_CLAIM_TYPES]
        .sort((left, right) => left.localeCompare(right)),
      passing_rule: 'High-risk claims require one reachable/editor-reviewed T1 authority, one reachable/editor-reviewed independent T1 or T2 source, or two reachable/editor-reviewed independent T3 evidence origins. Shared evidence_origin or independence_group values and same-newsroom host roots count once. A primary T1 source does not satisfy the independent threshold. A T2 operator/primary source can pass only a narrow lifecycle/status claim that the operator reports about itself.',
      access_rule: 'Missing resolving/access metadata is reported as not_recorded and never silently treated as accessible.',
      review_rule: 'Access timestamps never imply editorial evidence review; evidence_reviewed requires explicit reviewer identity and an ISO date or timezone-qualified ISO datetime.',
      reference_rule: 'Direct URL references must also exist in the dossier source registry; unmatched refs remain explicit gaps.',
    },
    summary: summarize(dossiers),
    dossiers,
  };
}

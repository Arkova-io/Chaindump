const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ACCESS_VERIFIED_STATES = new Set([
  'accessible',
  'ok',
  'resolved',
  'resolving',
  'success',
  'verified',
]);

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function sources(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function add(counts, value) {
  const key = String(value || 'unknown').toLowerCase();
  counts[key] = (counts[key] || 0) + 1;
}

function sortedCounts(counts) {
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function cappedDistribution(items, limit = 8) {
  const visible = items.slice(0, limit);
  const omitted = items.slice(limit);
  if (!omitted.length) return visible;
  return [
    ...visible,
    {
      key: '__other_exact_chain_labels__',
      count: omitted.reduce((sum, item) => sum + item.count, 0),
      label_count: omitted.length,
    },
  ];
}

function latestDay(days) {
  return days.filter((day) => ISO_DAY.test(day || '')).sort().at(-1) || null;
}

function earliestDay(days) {
  return days.filter((day) => ISO_DAY.test(day || '')).sort().at(0) || null;
}

function reviewState(collection) {
  if (!collection.freshness) return 'legacy';
  if (collection.freshness.statusWithheld) return 'withheld';
  if (collection.freshness.reviewOverdue) return 'review_due';
  return ISO_DAY.test(collection.freshness.nextReviewAt || '') ? 'current' : 'unknown';
}

function sectionReferences(section) {
  return Array.isArray(section?.source_refs) ? section.source_refs : [];
}

function forensicReferences(forensic) {
  return [
    ...sectionReferences(forensic.outcome),
    ...sectionReferences(forensic.why),
    ...sectionReferences(forensic.counterfactual),
    ...(Array.isArray(forensic.strategic_choices) ? forensic.strategic_choices.flatMap(sectionReferences) : []),
    ...(Array.isArray(forensic.watch) ? forensic.watch.flatMap(sectionReferences) : []),
  ];
}

function sourceIdentity(source) {
  return typeof source === 'string' ? source : source?.url;
}

function referenceIdentity(reference) {
  if (typeof reference === 'string') return reference;
  return reference?.id || reference?.ref || reference?.source_id || reference?.url;
}

function outcomeSource(collection) {
  const collectionSources = sources(collection.sources);
  const references = sectionReferences(object(collection.profile?.forensic_analysis).outcome);
  const source = references.map((reference) => {
    const identity = referenceIdentity(reference);
    return collectionSources.find((item) => (
      sourceIdentity(item) === identity
      || (typeof item === 'object' && item.id === identity)
    ));
  }).find(Boolean);
  if (!source) return null;
  const url = sourceIdentity(source);
  let fallbackTitle;
  try {
    fallbackTitle = new URL(url).hostname;
  } catch {
    return null;
  }
  return {
    title: typeof source === 'string' ? fallbackTitle : (source.title || fallbackTitle),
    url,
  };
}

function createAccumulator() {
  return {
    statusCounts: {},
    reviewCounts: {},
    chainCounts: {},
    chainStatus: {},
    coverage: {
      token_model: 0,
      chain_dependence: 0,
      products_and_value_capture: 0,
      founder_engagement: 0,
      community_history: 0,
      benefits: 0,
    },
    outcomeConfidence: {},
    whyConfidence: {},
    outcomeDays: [],
    lifecycleStatusDays: [],
    sourceInspectedDays: [],
    sourceAccessVerifiedDays: [],
    lifecycleReviewedDays: [],
    sourceAccessStates: {},
    distinctSourceUrls: new Set(),
    sourceRecords: 0,
    fieldClaims: 0,
    forensicDossiers: 0,
    strategicChoices: 0,
    unknowns: 0,
    watchSignals: 0,
    forensicReferencesTotal: 0,
    forensicReferencesResolved: 0,
  };
}

function recordCohort(accumulator, collection) {
  add(accumulator.statusCounts, collection.status);
  add(accumulator.reviewCounts, reviewState(collection));
  add(accumulator.chainCounts, collection.chain);
  const chain = String(collection.chain || 'unknown').toLowerCase();
  accumulator.chainStatus[chain] ||= {};
  add(accumulator.chainStatus[chain], collection.status);
}

function recordProfileCoverage(accumulator, collection, profile) {
  for (const field of Object.keys(accumulator.coverage)) {
    if (profile[field] != null && profile[field] !== '') accumulator.coverage[field] += 1;
  }
  const evidence = Array.isArray(profile.evidence) ? profile.evidence : [];
  accumulator.fieldClaims += evidence.length;
  const lifecycleEvidence = evidence.find((item) => item?.field === 'lifecycle_status');
  const lifecycleStatusAsOf = lifecycleEvidence?.as_of || collection.freshness?.statusAsOf;
  if (lifecycleStatusAsOf) accumulator.lifecycleStatusDays.push(lifecycleStatusAsOf);
}

function recordSource(accumulator, source, sourceIndex) {
  const identity = sourceIdentity(source);
  if (!identity) return;
  const structured = typeof source === 'object';
  accumulator.sourceRecords += 1;
  accumulator.distinctSourceUrls.add(identity);
  sourceIndex.add(identity);
  if (structured && source.id) sourceIndex.add(source.id);

  const accessState = structured ? (source.access_state || 'not_recorded') : 'not_recorded';
  add(accumulator.sourceAccessStates, accessState);
  if (structured && source.checked_at) accumulator.sourceInspectedDays.push(source.checked_at);
  if (!ACCESS_VERIFIED_STATES.has(accessState)) return;
  const accessDate = source.access_verified_at || source.last_verified_at || source.checked_at;
  if (accessDate) accumulator.sourceAccessVerifiedDays.push(accessDate);
}

function recordForensic(accumulator, forensic, sourceIndex) {
  const normalized = forensic.version === 'forensic-analysis-v1'
    || forensic.schema === 'forensic-analysis-v1';
  if (!normalized) return;
  accumulator.forensicDossiers += 1;
  accumulator.strategicChoices += Array.isArray(forensic.strategic_choices) ? forensic.strategic_choices.length : 0;
  accumulator.unknowns += Array.isArray(forensic.unknowns) ? forensic.unknowns.length : 0;
  accumulator.watchSignals += Array.isArray(forensic.watch) ? forensic.watch.length : 0;
  add(accumulator.outcomeConfidence, forensic.outcome?.confidence);
  add(accumulator.whyConfidence, forensic.why?.confidence);
  if (forensic.outcome?.as_of) accumulator.outcomeDays.push(forensic.outcome.as_of);

  for (const reference of forensicReferences(forensic)) {
    accumulator.forensicReferencesTotal += 1;
    if (sourceIndex.has(referenceIdentity(reference))) accumulator.forensicReferencesResolved += 1;
  }
}

function recordCollection(accumulator, collection) {
  const profile = object(collection.profile);
  const sourceIndex = new Set();
  recordCohort(accumulator, collection);
  recordProfileCoverage(accumulator, collection, profile);
  for (const source of sources(collection.sources)) recordSource(accumulator, source, sourceIndex);
  recordForensic(accumulator, object(profile.forensic_analysis), sourceIndex);
  const reviewedAt = collection.freshness?.lastVerifiedAt;
  if (reviewedAt) accumulator.lifecycleReviewedDays.push(reviewedAt);
}

function evidenceAnchors(rows, statusCounts) {
  return sortedCounts(statusCounts).flatMap(({ key: status }) => {
    const collection = rows.find((row) => (
      String(row.status || 'unknown').toLowerCase() === status && outcomeSource(row)
    ));
    if (!collection) return [];
    return [{
      slug: collection.slug,
      name: collection.name,
      status,
      source: outcomeSource(collection),
    }];
  });
}

/**
 * Build the aggregate from the exact rows returned by /api/nft.
 *
 * This deliberately reports descriptive coverage and associations only. The
 * curated dossier set is not a random market sample, and the corpus does not
 * yet expose a controlled launched-token field suitable for outcome claims.
 */
export function buildNftLifecycleAnalysis(collections) {
  const rows = Array.isArray(collections) ? collections : [];
  const accumulator = createAccumulator();
  rows.forEach((collection) => recordCollection(accumulator, collection));
  const chainDistribution = sortedCounts(accumulator.chainCounts);
  return {
    schema: 'nft-lifecycle-cohort-v1',
    methodology: {
      unit: 'one published NFT, Ordinals, marketplace, or platform dossier',
      inclusion: 'the curated dossiers returned in this API response',
      classification: 'published lifecycle label after the evidence-freshness gate',
      inference_boundary: 'descriptive cohort counts and documented coverage; no market base rate or causal ranking',
    },
    cohort: {
      total: rows.length,
      statuses: sortedCounts(accumulator.statusCounts),
      review_states: sortedCounts(accumulator.reviewCounts),
      chains: chainDistribution,
      chain_chart: cappedDistribution(chainDistribution),
      chain_status: Object.fromEntries(
        Object.entries(accumulator.chainStatus).map(([chain, counts]) => [chain, sortedCounts(counts)]),
      ),
    },
    coverage: {
      ...accumulator.coverage,
      field_cited: rows.filter((row) => row.citation?.fieldCited).length,
      forensic_dossiers: accumulator.forensicDossiers,
      field_claims: accumulator.fieldClaims,
      source_records: accumulator.sourceRecords,
      distinct_source_urls: accumulator.distinctSourceUrls.size,
      strategic_choices: accumulator.strategicChoices,
      material_unknowns: accumulator.unknowns,
      watch_signals: accumulator.watchSignals,
      forensic_references_total: accumulator.forensicReferencesTotal,
      forensic_references_ledger_matched: accumulator.forensicReferencesResolved,
      source_access_states: sortedCounts(accumulator.sourceAccessStates),
      outcome_confidence: sortedCounts(accumulator.outcomeConfidence),
      why_confidence: sortedCounts(accumulator.whyConfidence),
    },
    evidenceWindow: {
      oldest_lifecycle_status_as_of: earliestDay(accumulator.lifecycleStatusDays),
      newest_lifecycle_status_as_of: latestDay(accumulator.lifecycleStatusDays),
      oldest_forensic_outcome_as_of: earliestDay(accumulator.outcomeDays),
      newest_forensic_outcome_as_of: latestDay(accumulator.outcomeDays),
      lifecycle_reviewed_through: latestDay(accumulator.lifecycleReviewedDays),
      source_inspected_through: latestDay(accumulator.sourceInspectedDays),
      source_access_verified_through: latestDay(accumulator.sourceAccessVerifiedDays),
    },
    evidenceAnchors: evidenceAnchors(rows, accumulator.statusCounts),
    limitations: [
      'The cohort is curated rather than randomly sampled, so lifecycle shares are not market success or failure rates.',
      'Token-model coverage records whether a normalized value-capture field exists; it does not classify token launch, token performance, or NFT-holder value accrual.',
      'Chain-by-status counts are associations. They do not isolate chain choice from launch timing, team quality, product, distribution, or market-cycle effects.',
      'Founder, product, and community field presence measures documentation coverage, not whether the underlying behavior was positive or causal.',
      'Price, liquidity, holder retention, revenue, and profitability remain unknown where a dossier does not cite current measurements.',
    ],
    falsifiers: [
      'A representative sampling frame could materially change the observed lifecycle distribution.',
      'A controlled token-status and outcome field could support or overturn any apparent token association.',
      'Longitudinal floor, volume, holder, revenue, and product-use series could change individual labels and cross-case conclusions.',
      'New current-state evidence can move withheld cases out of unknown or make currently published labels stale.',
    ],
  };
}

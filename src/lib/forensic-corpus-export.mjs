import { createHash } from 'node:crypto';

export const FORENSIC_CORPUS_SCHEMA = 'chaindump-forensic-training-record-v1';

function parseObject(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function sourceArray(value) {
  const parsed = parseObject(value, value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((source) => {
    if (!source) return [];
    if (typeof source === 'string') return [{ url: source }];
    return [{
      id: source.id || source.source_id || null,
      title: source.title || source.url || 'source',
      url: source.url || source.canonical_url || null,
      publisher: source.publisher || null,
      source_tier: source.source_tier || source.tier || null,
      source_role: source.source_role || source.role || null,
      evidence_reviewed: Boolean(source.evidence_reviewed),
      reachable: source.reachable ?? source.resolving ?? null,
    }];
  }).filter((source) => (source.url || '').startsWith('https://'));
}

function safeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function forensicFrom(record) {
  const profile = parseObject(record.profile, {});
  const analysis = parseObject(record.analysis, {});
  const dossier = parseObject(record.dossier, {});
  return parseObject(
    analysis.forensic_analysis
      || profile.forensic_analysis
      || dossier.forensicAnalysis,
    null,
  );
}

function supportedSection(section) {
  if (!section || section.publication_support === 'pending_independent_support') return null;
  if (typeof section === 'string') return safeText(section);
  return safeText(section.summary || section.value || section.text);
}

function supportedChoices(choices) {
  if (!Array.isArray(choices)) return [];
  return choices.flatMap((choice) => {
    if (!choice || choice.publication_support === 'pending_independent_support') return [];
    const decision = safeText(choice.decision);
    const consequence = safeText(choice.consequence);
    if (!decision && !consequence) return [];
    return [{ decision, consequence, confidence: choice.confidence || 'unknown' }];
  });
}

function publicationState(record) {
  const depth = parseObject(record.publication_depth || record.publicationDepth, {});
  return {
    high_risk_claim_count: Number(depth.high_risk_claim_count) || 0,
    passing_high_risk_claim_count: Number(depth.passing_high_risk_claim_count) || 0,
    unresolved_high_risk_claim_count: Number(depth.unresolved_high_risk_claim_count) || 0,
    registered_source_count: Number(depth.registered_source_count) || 0,
    reviewed_source_count: Number(depth.reviewed_source_count) || 0,
  };
}

function stateTagsForForensicRecord(record) {
  const tags = new Set();
  const lifecycle = record?.lifecycle || record?.status || record?.dossierStatus;
  if (lifecycle) tags.add(`outcome_${String(lifecycle).toLowerCase().replaceAll(' ', '_')}`);
  const depth = record?.publication_depth || record?.publicationDepth || {};
  if (Number(depth.unresolved_high_risk_claim_count) > 0) tags.add('support_pending');
  const freshness = record?.freshness || record?.analysis?.freshness || record?.causalFreshness || {};
  const freshnessStatus = freshness.status || freshness.state;
  if (freshnessStatus) tags.add(`review_${String(freshnessStatus).toLowerCase()}`);
  const forensicStatus = record?.forensicStatus || record?.analysis?.forensic_analysis_status || record?.causalStatus;
  if (forensicStatus) tags.add(`causal_${String(forensicStatus).toLowerCase()}`);
  return [...tags].sort((a, b) => a.localeCompare(b));
}

export function normalizeTrainingRecord(record, context = {}) {
  const vertical = context.vertical || record.vertical || record.kind || 'unknown';
  const id = [
    vertical,
    record.kind,
    record.lifecycle,
    record.slug || record.case_id || record.chain || record.name,
  ].filter(Boolean).join(':');
  const forensic = forensicFrom(record);
  const dossier = parseObject(record.dossier, {});
  const sources = sourceArray(record.publication_sources || record.sources || dossier.sources);
  const publication = publicationState(record);
  const profile = parseObject(record.profile, {});
  const analysis = parseObject(record.analysis, {});
  const freshness = parseObject(
    record.freshness || analysis.freshness || record.causalFreshness || {},
  );
  const outcome = forensic?.outcome && forensic.outcome.publication_support !== 'pending_independent_support'
    ? {
      label: forensic.outcome.label || null,
      summary: supportedSection(forensic.outcome),
      confidence: forensic.outcome.confidence || 'unknown',
      as_of: forensic.outcome.as_of || null,
    }
    : null;
  const text = {
    summary: safeText(record.summary || record.why || record.why_stuck || record.why_successful),
    outlook: safeText(record.outlook || profile.outlook),
    why: supportedSection(forensic?.why),
    counterfactual: supportedSection(forensic?.counterfactual),
    watch: Array.isArray(forensic?.watch)
      ? forensic.watch.flatMap((item) => {
        const signal = safeText(item?.signal);
        const implication = safeText(item?.implication);
        return signal || implication ? [{ signal, implication }] : [];
      })
      : [],
    strategic_choices: supportedChoices(forensic?.strategic_choices),
  };
  const unsupported = publication.unresolved_high_risk_claim_count > 0;
  return {
    schema: FORENSIC_CORPUS_SCHEMA,
    id,
    vertical,
    entity: {
      id: record.slug || record.case_id || record.chain || record.name || id,
      name: record.name || record.brand_name || record.chain || record.slug || id,
      kind: record.kind || record.entity_kind || null,
      lifecycle: record.lifecycle || record.status || record.dossierStatus || dossier.dossierStatus || null,
    },
    snapshot: {
      as_of: context.asOf || record.updated_at || record.last_reviewed || null,
      source_endpoint: context.endpoint || null,
      extracted_at: context.extractedAt || null,
    },
    outcome,
    text,
    state_tags: stateTagsForForensicRecord({
      ...record,
      publication_depth: publication,
      freshness,
      analysis,
    }),
    freshness,
    publication,
    sources,
    training_eligible: sources.length > 0 && !unsupported,
    withheld: unsupported,
  };
}

export function buildCorpusManifest(records, context = {}) {
  const jsonl = records.map((record) => JSON.stringify(record)).join('\n');
  return {
    schema: 'chaindump-forensic-corpus-manifest-v1',
    generated_at: context.generatedAt || new Date().toISOString(),
    record_count: records.length,
    training_eligible_count: records.filter((record) => record.training_eligible).length,
    withheld_count: records.filter((record) => record.withheld).length,
    vertical_counts: records.reduce((counts, record) => {
      counts[record.vertical] = (counts[record.vertical] || 0) + 1;
      return counts;
    }, {}),
    sha256: createHash('sha256').update(jsonl).digest('hex'),
    split_policy: 'entity-stable; time-stable evaluation split should be cut before the forecast timestamp',
  };
}

export function toJsonl(records) {
  return records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : '');
}

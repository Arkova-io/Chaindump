#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYSIS_SECTION_KEYS, validateEntityProfile } from '../src/lib/entity-profile.js';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';
import { buildWaveJSpecs } from './chain-causal-wave-j-specs.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(root, 'docs/chain-causal-completion-wave-j-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0098_chain_causal_completion_wave_j.sql');
const AS_OF = '2026-08-03';
const OBSERVED_AT = '2026-08-03T21:32:28.000Z';
const ACCESSED_AT = '2026-08-03T21:32:52.000Z';
const NEXT_REVIEW_AT = '2026-08-10T21:32:52.000Z';
const MAX_D1_STATEMENT_BYTES = 95_000;

function source(slug, key, title, url, publisher, options = {}) {
  return {
    id: `source:${slug}:${key}`,
    title,
    url,
    publisher,
    published_at: options.publishedAt || null,
    accessed_at: ACCESSED_AT,
    archive_url: null,
    tier: options.tier || 'B',
    role: options.role || 'primary',
    access_state: 'reachable',
    checked_at: ACCESSED_AT,
    content_hash: null,
    evidence_locator: options.locator || 'The reviewed page and its dated or versioned content.',
  };
}

function claim(assertion, sourceIds, evidenceLocator, options = {}) {
  return {
    assertion,
    value: options.value ?? assertion,
    source_ids: sourceIds,
    evidence_locator: evidenceLocator,
    confidence: options.confidence || 'high',
    kind: options.kind || 'fact',
    support_direction: 'supports',
    note: options.note || null,
  };
}

const section = (body, claims) => ({ body, claims });
const rolling = (definition) => ({ start: null, end: AS_OF, definition });

function metric(key, dimension, label, value, sourceIds, method, qualityFlags = []) {
  return {
    key,
    dimension,
    label,
    value,
    unit: 'usd',
    currency: 'USD',
    window: rolling(key.includes('30d') ? 'provider-reported rolling 30 days' : 'latest point'),
    as_of: AS_OF,
    method,
    scope: { product: 'blockchain network', chains: [] },
    source_ids: sourceIds,
    evidence_locator: `Provider response replayed during ${OBSERVED_AT}–${ACCESSED_AT}; exact value retained in the artifact.`,
    quality_flags: qualityFlags,
  };
}

const event = (key, type, date, description, sourceIds, evidenceLocator) => (
  { key, type, date, description, source_ids: sourceIds, evidence_locator: evidenceLocator }
);

function buildProfile(spec) {
  const claims = [];
  const sections = {};
  for (const [key, value] of Object.entries(spec.sections)) {
    const claimIds = value.claims.map((entry, index) => {
      const id = `claim:${spec.slug}:section:${key}:${index + 1}`;
      claims.push({
        id,
        field_path: `analysis.sections.${key}.body`,
        assertion: entry.assertion,
        value: entry.value,
        as_of: AS_OF,
        confidence: entry.confidence,
        kind: entry.kind,
        source_ids: entry.source_ids,
        evidence_locator: entry.evidence_locator,
        support_direction: entry.support_direction,
        note: entry.note,
        review: { state: 'pending', reviewer: null, reviewed_at: null },
      });
      return id;
    });
    sections[key] = { body: value.body, as_of: AS_OF, claim_ids: claimIds };
  }

  const statusClaimId = `claim:${spec.slug}:status`;
  const outcomeClaimId = `claim:${spec.slug}:outcome`;
  claims.unshift(
    {
      id: statusClaimId,
      field_path: 'status.operating_state',
      assertion: `${spec.name} was operating at the review date.`,
      value: 'operating',
      as_of: AS_OF,
      confidence: 'high',
      kind: 'fact',
      source_ids: spec.statusSources,
      evidence_locator: spec.statusLocator,
      support_direction: 'supports',
      note: null,
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    },
    {
      id: outcomeClaimId,
      field_path: 'outcome.label',
      assertion: `${spec.name} is classified ${spec.outcome} as of ${AS_OF}.`,
      value: spec.outcome,
      as_of: AS_OF,
      confidence: spec.outcomeConfidence,
      kind: 'inference',
      source_ids: spec.outcomeSources,
      evidence_locator: spec.outcomeLocator,
      support_direction: 'supports',
      note: 'Analyst lifecycle classification; current metrics do not prove a single cause.',
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    },
  );

  const metrics = spec.metrics.map((entry) => {
    const id = `metric:${spec.slug}:${entry.key}:${AS_OF}`;
    const claimId = `claim:${spec.slug}:metric:${entry.key}`;
    claims.push({
      id: claimId,
      field_path: `metrics[${id}].value`,
      assertion: `${entry.label} was ${entry.value} ${entry.unit.toUpperCase()} for the stated window.`,
      value: entry.value,
      as_of: AS_OF,
      confidence: 'high',
      kind: 'fact',
      source_ids: entry.source_ids,
      evidence_locator: entry.evidence_locator,
      support_direction: 'supports',
      note: 'Point-in-time provider observation; providers can revise a same-day point.',
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    });
    return {
      id,
      dimension: entry.dimension,
      label: entry.label,
      value: entry.value,
      unit: entry.unit,
      currency: entry.currency,
      window: entry.window,
      as_of: entry.as_of,
      method: entry.method,
      scope: entry.scope,
      formula: null,
      raw_input_ids: [],
      claim_ids: [claimId],
      quality_flags: entry.quality_flags,
    };
  });

  const events = spec.events.map((entry) => {
    const id = `event:${spec.slug}:${entry.key}`;
    const claimId = `claim:${spec.slug}:event:${entry.key}`;
    claims.push({
      id: claimId,
      field_path: `events[${id}]`,
      assertion: entry.description,
      value: entry.date,
      as_of: entry.date,
      confidence: 'high',
      kind: 'fact',
      source_ids: entry.source_ids,
      evidence_locator: entry.evidence_locator,
      support_direction: 'supports',
      note: null,
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    });
    return { id, type: entry.type, date: entry.date, description: entry.description, claim_ids: [claimId] };
  });

  return {
    schema: 'chaindump-entity-profile',
    version: 1,
    identity: { id: `blockchain:${spec.slug}`, type: 'blockchain', slug: spec.slug, name: spec.name, aliases: spec.aliases || [] },
    classification: spec.classification,
    status: { operating_state: 'operating', as_of: AS_OF, claim_ids: [statusClaimId] },
    outcome: { label: spec.outcome, as_of: AS_OF, rule_id: 'blockchain-lifecycle-v1', confidence: spec.outcomeConfidence, claim_ids: [outcomeClaimId] },
    analysis: { sections },
    metrics,
    events,
    sources: spec.sources,
    claims,
    freshness: { state: 'current', last_reviewed_at: ACCESSED_AT, next_review_at: NEXT_REVIEW_AT, field_reviews: [] },
    quality: { publication_state: 'review', completeness_pct: 100, confidence: spec.qualityConfidence, unsourced_fields: [] },
    extensions: {
      legacy_origin: 'chain_analysis_and_chain_facts',
      observation_window: { started_at: OBSERVED_AT, completed_at: ACCESSED_AT },
      explicit_unknowns: spec.unknowns,
      methodology_notes: [
        'Every material field has atomic pending claims; a person must review those claims before publication.',
        'TVL, stablecoin supply, DEX volume, fees, revenue and token prices answer different questions and must not be treated as interchangeable.',
        'Documented decisions, observed outcomes, analyst inferences and unresolved unknowns are kept separate.',
      ],
    },
  };
}

function buildForensic(spec) {
  return {
    version: 'forensic-analysis-v1',
    observation_snapshot: spec.snapshot,
    outcome: { label: spec.forensicOutcome, summary: spec.forensicSummary, confidence: spec.outcomeConfidence, as_of: AS_OF, source_refs: spec.outcomeSources },
    why: { summary: spec.forensicWhy, confidence: 'medium', source_refs: spec.whySources },
    strategic_choices: spec.choices,
    counterfactual: { summary: spec.forensicCounterfactual, confidence: 'medium', source_refs: spec.counterfactualSources },
    watch: spec.watch,
    unknowns: spec.unknowns.map(([question, resolution_trigger]) => ({ question, resolution_trigger })),
    review: { status: 'current', last_reviewed_at: AS_OF, next_review_at: '2026-08-10', reviewer: 'chaindump-research-desk' },
  };
}

function marketSources(slug, chain, tokenSlug) {
  const encoded = encodeURIComponent(chain).replaceAll('%20', '%20');
  const items = [
    source(slug, 'tvl', `${chain} historical TVL API`, `https://api.llama.fi/v2/historicalChainTvl/${encoded}`, 'DefiLlama', { role: 'independent', locator: 'Latest and maximum points in the returned daily TVL series.' }),
    source(slug, 'volume', `${chain} DEX volume API`, `https://api.llama.fi/overview/dexs/${encoded}?dataType=dailyVolume`, 'DefiLlama', { role: 'independent', locator: 'total30d and change_1m fields.' }),
    source(slug, 'fees', `${chain} fees API`, `https://api.llama.fi/overview/fees/${encoded}?dataType=dailyFees`, 'DefiLlama', { role: 'independent', locator: 'total30d field.' }),
    source(slug, 'revenue', `${chain} revenue API`, `https://api.llama.fi/overview/fees/${encoded}?dataType=dailyRevenue`, 'DefiLlama', { role: 'independent', locator: 'total30d field.' }),
    source(slug, 'stables', 'Stablecoin supply by chain API', 'https://stablecoins.llama.fi/stablecoinchains', 'DefiLlama', { role: 'independent', locator: `${chain} row and peggedUSD field.` }),
  ];
  if (tokenSlug) {
    items.push(source(slug, 'market', `${chain} token market data`, `https://api.coingecko.com/api/v3/coins/${tokenSlug}`, 'CoinGecko', { role: 'aggregator', locator: 'current price, market cap, FDV and all-time-high fields.' }));
  }
  return items;
}

const specs = buildWaveJSpecs({ source, claim, section, metric, event, marketSources, AS_OF, OBSERVED_AT, ACCESSED_AT });
const cases = specs.map((spec) => ({
  chain: spec.chain || spec.name,
  slug: spec.slug,
  sources: spec.sources,
  canonical_profile: buildProfile(spec),
  forensic_analysis: buildForensic(spec),
}));

const document = {
  schema: 'chaindump-chain-causal-completion-v2',
  research_as_of: AS_OF,
  generated_migration: '0098_chain_causal_completion_wave_j.sql',
  methodology: {
    scope: 'Canonical ten-section blockchain profiles for Polygon, Robinhood Chain, Arbitrum, Tron and Avalanche.',
    observation_rule: `Volatile provider fields were fetched between ${OBSERVED_AT} and ${ACCESSED_AT}. Exact values remain point-in-time observations.`,
    evidence_rule: 'Official sources establish documented design and decisions. Independent sources test market outcomes and control assumptions. Aggregate metrics do not prove causality or user retention.',
    claim_rule: 'Each customer section has bounded atomic claims with source references, evidence locators, confidence, fact/inference/unknown labels and pending human review.',
    preservation_rule: 'Migration 0098 preserves legacy facts and analysis fields while adding forensic analysis, review metadata and an embedded canonical profile. Sources merge by URL.',
  },
  cases,
};

for (const entry of cases) {
  const profileErrors = validateEntityProfile(entry.canonical_profile, { now: new Date(ACCESSED_AT) });
  if (profileErrors.length) throw new Error(`${entry.chain}: invalid canonical profile: ${JSON.stringify(profileErrors)}`);
  const sourceById = Object.fromEntries(entry.sources.map((item) => [item.id, item]));
  const forensic = validateForensicAnalysis(entry.forensic_analysis, { resolver: sourceById });
  if (forensic.errors.length || forensic.warnings.length || forensic.withheld_sections.length) {
    throw new Error(`${entry.chain}: invalid forensic profile: ${JSON.stringify(forensic)}`);
  }
  if (Object.keys(entry.canonical_profile.analysis.sections).join('|') !== ANALYSIS_SECTION_KEYS.join('|')) {
    throw new Error(`${entry.chain}: canonical section order drifted`);
  }
  if (new Set(entry.sources.map(({ id }) => id)).size !== entry.sources.length) throw new Error(`${entry.chain}: duplicate source id`);
  if (new Set(entry.sources.map(({ url }) => url)).size !== entry.sources.length) throw new Error(`${entry.chain}: duplicate source URL`);
  if (!entry.sources.some(({ role }) => role === 'primary') || !entry.sources.some(({ role }) => role === 'independent')) {
    throw new Error(`${entry.chain}: primary and independent evidence are required`);
  }
  for (const [key, value] of Object.entries(entry.canonical_profile.analysis.sections)) {
    if (!value.body.trim() || value.claim_ids.length < 2 || value.claim_ids.length > 4) throw new Error(`${entry.chain}:${key}: invalid section depth`);
    for (const id of value.claim_ids) {
      const item = entry.canonical_profile.claims.find((candidate) => candidate.id === id);
      if (!item || item.field_path !== `analysis.sections.${key}.body` || item.assertion.length > 240) {
        throw new Error(`${entry.chain}:${key}:${id}: invalid atomic claim`);
      }
    }
  }
}

const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sqlJson = (value) => sqlText(JSON.stringify(value));

function legacySources(entry) {
  return entry.sources.map((item) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    publisher: item.publisher,
    ...(item.published_at ? { published_at: item.published_at } : {}),
    source_role: item.role === 'primary' ? 'primary' : item.role === 'independent' ? 'independent' : 'aggregator',
    tier: item.tier,
    checked_at: item.checked_at,
    evidence_locator: item.evidence_locator,
  }));
}

function sourceMerge(ownerExpression, incomingExpression) {
  return `(SELECT json_group_array(json(source_json))
      FROM (
        SELECT source_json
        FROM (
          SELECT
            CASE
              WHEN new_source.value IS NULL THEN old_source.value
              ELSE json_patch(old_source.value, new_source.value)
            END AS source_json,
            old_source.key AS position
          FROM json_each(COALESCE(${ownerExpression}, '[]')) AS old_source
          LEFT JOIN json_each(COALESCE(${incomingExpression}, '[]')) AS new_source
            ON json_extract(new_source.value, '$.url') = json_extract(old_source.value, '$.url')
          WHERE json_extract(old_source.value, '$.url') IS NULL
             OR old_source.key = (
               SELECT MIN(candidate.key)
               FROM json_each(COALESCE(${ownerExpression}, '[]')) AS candidate
               WHERE json_extract(candidate.value, '$.url') = json_extract(old_source.value, '$.url')
             )
          UNION ALL
          SELECT new_source.value AS source_json, 10000 + new_source.key AS position
          FROM json_each(COALESCE(${incomingExpression}, '[]')) AS new_source
          WHERE NOT EXISTS (
            SELECT 1 FROM json_each(COALESCE(${ownerExpression}, '[]')) AS existing
            WHERE json_extract(existing.value, '$.url') = json_extract(new_source.value, '$.url')
          )
        )
        ORDER BY position
      ))`;
}

function renderFactsStatement(entry) {
  const payload = { chain: entry.chain, sources: legacySources(entry), forensic_analysis: entry.forensic_analysis };
  const synthesisStatement = `-- canonical-synthesis-start ${entry.chain}
WITH canonical_seed(payload) AS (VALUES (${sqlJson(payload)}))
UPDATE chain_facts AS facts
SET
  data = json_set(
    facts.data,
    '$.forensic_analysis', json(json_extract((SELECT payload FROM canonical_seed), '$.forensic_analysis')),
    '$.canonical_profile_ref', 'chain_analysis.profile.canonical_profile'
  ),
  sources = ${sourceMerge("facts.sources", "json_extract((SELECT payload FROM canonical_seed), '$.sources')")},
  updated_at = '${AS_OF}'
WHERE facts.chain = json_extract((SELECT payload FROM canonical_seed), '$.chain')
  AND facts.dimension = 'synthesis';
-- canonical-synthesis-end ${entry.chain}
`;
  const metaStatement = `-- canonical-meta-start ${entry.chain}
UPDATE chain_facts
SET
  data = json_set(
    data,
    '$.forensic_analysis_version', 'forensic-analysis-v1',
    '$.canonical_profile_schema', 'chaindump-entity-profile',
    '$.canonical_claim_review', json(${sqlJson({
      state: 'pending',
      claims: entry.canonical_profile.claims.length,
      last_assembled_at: ACCESSED_AT,
      human_approval_required: true,
    })}),
    '$.last_reviewed', '${AS_OF}',
    '$.next_review_at', '2026-08-10'
  ),
  updated_at = '${AS_OF}'
WHERE chain = ${sqlText(entry.chain)} AND dimension = '_meta';
-- canonical-meta-end ${entry.chain}
`;
  for (const [label, statement] of [['synthesis', synthesisStatement], ['meta', metaStatement]]) {
    if (Buffer.byteLength(statement, 'utf8') > MAX_D1_STATEMENT_BYTES) throw new Error(`${entry.chain}: ${label} statement exceeds D1 ceiling`);
  }
  return `${synthesisStatement}\n${metaStatement}`;
}

function renderAnalysisStatement(entry) {
  const profileEnvelope = { canonical_profile: entry.canonical_profile };
  const incomingSources = legacySources(entry);
  const take = entry.canonical_profile.analysis.sections.why_this_outcome.body;
  const trend = entry.canonical_profile.analysis.sections.lifecycle.body.slice(0, 500);
  const sentiment = entry.canonical_profile.outcome.label === 'declining' ? 'bearish' : 'mixed';
  const statement = `-- canonical-profile-start ${entry.chain}
INSERT INTO chain_analysis (chain, take, sentiment, trend, updated_at, sources, profile)
VALUES (
  ${sqlText(entry.chain)},
  ${sqlText(take)},
  ${sqlText(sentiment)},
  ${sqlText(trend)},
  '${AS_OF}',
  ${sqlJson(incomingSources)},
  ${sqlJson(profileEnvelope)}
)
ON CONFLICT(chain) DO UPDATE SET
  updated_at = excluded.updated_at,
  sources = ${sourceMerge('chain_analysis.sources', 'excluded.sources')},
  profile = json_set(
    COALESCE(chain_analysis.profile, '{}'),
    '$.canonical_profile', json_extract(excluded.profile, '$.canonical_profile')
  );
-- canonical-profile-end ${entry.chain}
`;
  if (Buffer.byteLength(statement, 'utf8') > MAX_D1_STATEMENT_BYTES) throw new Error(`${entry.chain}: chain_analysis statement exceeds D1 ceiling`);
  return statement;
}

function renderMigration(value = document) {
  const artifactHash = createHash('sha256').update(`${JSON.stringify(value, null, 2)}\n`).digest('hex');
  return `-- Generated by scripts/render-chain-causal-wave-0098.mjs.
-- Adds Wave J review-state canonical profiles without overwriting legacy dossiers.
-- Sources merge by URL; every statement is idempotent and under the D1 statement ceiling.
-- artifact-sha256 ${artifactHash}

${value.cases.flatMap((entry) => [renderFactsStatement(entry), renderAnalysisStatement(entry)]).join('\n')}`;
}

export { document, renderMigration };

function writeOutputs() {
  writeFileSync(artifactPath, `${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(migrationPath, renderMigration(document));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) writeOutputs();

#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';

const ENTITY_TYPES = [
  'blockchain', 'dex', 'cex', 'nft_collection', 'ordinals_collection',
  'web3_casino', 'stablecoin', 'rwa', 'depin', 'infrastructure_network',
  'crypto_treasury', 'miner', 'etf',
];

const RAW_COPY_PATTERN = /\[object Object\]|(?:^|\W)(?:source_ids|source_refs|evidence_locator|publication_support|validation_errors|legacy_unmapped|canonical_profile|citation_schema)(?:\W|$)/i;
const PLACEHOLDER_COPY_PATTERN = /^(?:unknown|unresolved|not (?:yet )?(?:known|published|available)|pending|n\/?a|—)$/i;

function applyMigrations(database) {
  const files = readdirSync(new URL('../migrations/', import.meta.url))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
  for (const file of files) {
    database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
}

function d1Adapter(database) {
  return {
    prepare(sql) {
      let bindings = [];
      return {
        bind(...values) { bindings = values; return this; },
        async all() { return { results: database.prepare(sql).all(...bindings) }; },
        async first() { return database.prepare(sql).get(...bindings) ?? null; },
      };
    },
  };
}

function routeSlug(value) {
  return String(value || '').trim().toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

function queryRows(database, sql) {
  return database.prepare(sql).all();
}

function blockchainUnionSummary(database, assessedRows) {
  const memberships = queryRows(database, `
    SELECT chain, 'chain_facts' AS source FROM chain_facts GROUP BY lower(chain)
    UNION ALL SELECT chain, 'dead_chains' FROM dead_chains
    UNION ALL SELECT chain, 'mid_chains' FROM mid_chains
    UNION ALL SELECT chain, 'chain_analysis' FROM chain_analysis
  `);
  const identities = new Map();
  for (const membership of memberships) {
    const slug = routeSlug(membership.chain);
    if (!identities.has(slug)) identities.set(slug, new Set());
    identities.get(slug).add(membership.source);
  }
  const bySource = Object.fromEntries(
    ['chain_facts', 'dead_chains', 'mid_chains', 'chain_analysis'].map((source) => [
      source,
      [...identities.values()].filter((sources) => sources.has(source)).length,
    ]),
  );
  const membershipPatterns = {};
  for (const sources of identities.values()) {
    const pattern = [...sources].sort().join('+');
    membershipPatterns[pattern] = (membershipPatterns[pattern] || 0) + 1;
  }
  const resolved = assessedRows.filter((row) => row.type === 'blockchain');
  return {
    total: identities.size,
    by_source: bySource,
    overlap_profiles: [...identities.values()].filter((sources) => sources.size > 1).length,
    chain_facts_backed: [...identities.values()].filter((sources) => sources.has('chain_facts')).length,
    legacy_only: [...identities.values()].filter((sources) => !sources.has('chain_facts')).length,
    membership_patterns: Object.fromEntries(Object.entries(membershipPatterns).sort()),
    not_found: [...identities].filter(([slug]) => !resolved.some((row) => (
      row.slug === slug && row.http_status === 200
    ))).length,
    zero_section: [...identities].filter(([slug]) => resolved.some((row) => (
      row.slug === slug && row.section_count === 0
    ))).length,
    dishonest_gaps: [...identities].filter(([slug]) => resolved.some((row) => (
      row.slug === slug && !row.honest_gaps
    ))).length,
  };
}

export function enumerateProfileRoutes(database) {
  const routes = [];
  const add = (type, slug, name, legacyBytes = 0) => {
    if (!ENTITY_TYPES.includes(type) || !slug) return;
    routes.push({ type, slug: routeSlug(slug), name, legacy_bytes: Number(legacyBytes || 0) });
  };

  for (const row of queryRows(database, `
    SELECT chain, MAX(name) AS name, MAX(raw_size) AS raw_size
    FROM (
      SELECT chain, chain AS name, length(COALESCE(profile, '')) AS raw_size FROM dead_chains
      UNION ALL
      SELECT chain, chain, length(COALESCE(profile, '')) FROM mid_chains
      UNION ALL
      SELECT chain, chain,
             length(COALESCE(json_remove(profile, '$.canonical_profile'), ''))
        FROM chain_analysis
      UNION ALL
      SELECT chain, chain,
             SUM(length(COALESCE(data, '')) + length(COALESCE(sources, '')))
        FROM chain_facts GROUP BY chain
    ) GROUP BY lower(chain) ORDER BY lower(chain)
  `)) add('blockchain', row.chain, row.name, row.raw_size);

  for (const row of queryRows(database, `
    SELECT slug, kind AS type, name, length(COALESCE(profile, '')) AS raw_size FROM dead_exchanges
    UNION ALL
    SELECT slug, kind, name, length(COALESCE(profile, '')) FROM mid_exchanges
    UNION ALL
    SELECT slug, type, name, length(COALESCE(profile, '')) FROM successful_exchanges
    ORDER BY type, slug
  `)) add(row.type, row.slug, row.name, row.raw_size);

  for (const row of queryRows(database, `
    SELECT slug, name, chain, length(COALESCE(profile, '')) AS raw_size
    FROM nft_collections ORDER BY slug
  `)) {
    add(String(row.chain || '').toLowerCase().includes('ordinals')
      ? 'ordinals_collection' : 'nft_collection', row.slug, row.name, row.raw_size);
  }

  for (const row of queryRows(database, `
    SELECT c.case_id AS slug, c.brand_name AS name,
           length(COALESCE(s.outlook, '')) + length(COALESCE(s.business_mechanism, ''))
             + length(COALESCE(s.present_situation, '')) AS raw_size
    FROM casino_cases c LEFT JOIN casino_syntheses s USING (case_id)
    WHERE c.quality_passed = 1 ORDER BY c.case_id
  `)) add('web3_casino', row.slug, row.name, row.raw_size);

  for (const row of queryRows(database, `
    SELECT slug, name, length(COALESCE(profile, '')) AS raw_size
    FROM stablecoin_meta ORDER BY slug
  `)) add('stablecoin', row.slug, row.name, row.raw_size);

  for (const row of queryRows(database, `
    SELECT slug, name, category, length(COALESCE(profile, '')) AS raw_size
    FROM rwa_depin ORDER BY slug
  `)) {
    if (String(row.category || '').startsWith('rwa-')) add('rwa', row.slug, row.name, row.raw_size);
    if (String(row.category || '').startsWith('depin-')) add('depin', row.slug, row.name, row.raw_size);
  }

  for (const row of queryRows(database, `
    SELECT slug, name, length(COALESCE(profile, '')) AS raw_size
    FROM infra_chains ORDER BY slug
  `)) add('infrastructure_network', row.slug, row.name, row.raw_size);

  const marketTypes = { treasury: 'crypto_treasury', miner: 'miner', etf: 'etf' };
  for (const row of queryRows(database, `
    SELECT slug, name, type, length(COALESCE(profile, '')) AS raw_size
    FROM market_entities ORDER BY type, slug
  `)) add(marketTypes[row.type], row.slug, row.name, row.raw_size);

  const unique = new Map();
  for (const route of routes) {
    const key = `${route.type}:${route.slug}`;
    const prior = unique.get(key);
    if (!prior || route.legacy_bytes > prior.legacy_bytes) unique.set(key, route);
  }
  return [...unique.values()].sort((a, b) => (
    a.type.localeCompare(b.type) || a.slug.localeCompare(b.slug)
  ));
}

function sectionBucket(count) {
  if (count === 0) return 'sections_0';
  if (count <= 2) return 'sections_1_2';
  if (count < 10) return 'sections_3_9';
  return 'sections_10';
}

function validationDebtClass(error) {
  if (error?.code === 'citation_required') return 'citation_debt';
  if (String(error?.path || '').startsWith('sources[')) return 'source_metadata_debt';
  if (/review|freshness|as_of|checked_at|accessed_at/.test(String(error?.path || ''))
      || ['review_required', 'review_overdue', 'not_current'].includes(error?.code)) {
    return 'freshness_debt';
  }
  return 'structural_contract_error';
}

function profileAssessment(route, status, profile) {
  const sections = profile?.analysis?.sections || {};
  const bodies = Object.entries(sections).filter(([, section]) => (
    typeof section?.body === 'string' && section.body.trim()
    && !PLACEHOLDER_COPY_PATTERN.test(section.body.trim())
  ));
  const sectionCount = bodies.length;
  const errors = Array.isArray(profile?.quality?.validation_errors)
    ? profile.quality.validation_errors : [];
  const unsourced = new Set(Array.isArray(profile?.quality?.unsourced_fields)
    ? profile.quality.unsourced_fields : []);
  const missing = Object.entries(sections)
    .filter(([, section]) => section?.body == null)
    .map(([key]) => `analysis.sections.${key}.body`);
  const rawLeak = bodies.some(([, section]) => RAW_COPY_PATTERN.test(section.body));
  const objectLeak = Object.values(sections).some((section) => (
    section?.body != null && typeof section.body !== 'string'
  ));
  const placeholderCopy = Object.values(sections).some((section) => (
    typeof section?.body === 'string' && PLACEHOLDER_COPY_PATTERN.test(section.body.trim())
  ));
  return {
    ...route,
    http_status: status,
    section_count: sectionCount,
    section_bucket: sectionBucket(sectionCount),
    validation_error_count: errors.length,
    validation_error_codes: errors.reduce((counts, error) => ({
      ...counts,
      [error.code || 'unknown']: (counts[error.code || 'unknown'] || 0) + 1,
    }), {}),
    validation_error_paths: errors.reduce((counts, error) => ({
      ...counts,
      [error.path || '(root)']: (counts[error.path || '(root)'] || 0) + 1,
    }), {}),
    validation_error_classes: errors.reduce((counts, error) => {
      const key = validationDebtClass(error);
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {}),
    raw_object_leak: rawLeak || objectLeak,
    placeholder_copy: placeholderCopy,
    missing_section_count: missing.length,
    honest_gaps: missing.every((path) => unsourced.has(path)),
    publication_state: profile?.quality?.publication_state || null,
    outcome_label: profile?.outcome?.label || null,
    what_it_is: profile?.analysis?.sections?.what_it_is?.body || null,
    what_happened: profile?.analysis?.sections?.what_happened?.body || null,
    legacy_origin: profile?.extensions?.legacy_origin || null,
    embedded_canonical: profile?.extensions?.legacy_origin === 'chain_analysis_and_chain_facts',
  };
}

async function blockchainPrecedenceAssessment(database, env, context, rows) {
  const factExpectations = queryRows(database, `
    SELECT chain,
           json_extract(data, '$.forensic_analysis.outcome.label') AS outcome_label,
           json_extract(data, '$.situation') AS what_happened
      FROM chain_facts
     WHERE dimension = 'synthesis'
       AND json_extract(data, '$.forensic_analysis.outcome.label') IS NOT NULL
     ORDER BY lower(chain)
  `);
  const factMismatches = factExpectations.filter((expected) => {
    const actual = rows.find((row) => (
      row.type === 'blockchain' && row.slug === routeSlug(expected.chain)
    ));
    return !actual
      || actual.outcome_label !== expected.outcome_label
      || (expected.what_happened
        && actual.what_happened !== expected.what_happened
        && !actual.embedded_canonical);
  });

  const sentinel = {
    schema: 'chaindump-entity-profile',
    version: 1,
    identity: {
      id: 'blockchain:ethereum',
      type: 'blockchain',
      slug: 'ethereum',
      name: 'Canonical precedence control',
      aliases: [],
    },
    classification: { subtype: 'control', tags: [], chains: [], jurisdictions: [] },
    status: { operating_state: null, as_of: null, claim_ids: [] },
    outcome: { label: 'canonical_control', as_of: '2026-08-03', rule_id: 'control', confidence: 'high', claim_ids: [] },
    analysis: { sections: {} },
    metrics: [], events: [], sources: [], claims: [],
    freshness: { state: 'current', last_reviewed_at: '2026-08-03', next_review_at: null, field_reviews: [] },
    quality: { publication_state: 'review', completeness_pct: 0, confidence: 'high', unsourced_fields: [], validation_errors: [] },
    extensions: {},
  };
  database.exec('SAVEPOINT canonical_precedence_control');
  let embeddedCanonicalWins = false;
  try {
    const current = database.prepare(`
      SELECT profile FROM chain_analysis WHERE lower(chain) = 'ethereum' LIMIT 1
    `).get();
    const legacy = JSON.parse(current?.profile || '{}');
    legacy.canonical_profile = sentinel;
    database.prepare(`
      UPDATE chain_analysis SET profile = ? WHERE lower(chain) = 'ethereum'
    `).run(JSON.stringify(legacy));
    database.prepare(`
      INSERT OR REPLACE INTO dead_chains
        (chain, launched, why, verdict, profile, updated_at)
      VALUES ('Ethereum', '2015', 'Lower-depth precedence control', 'dead', ?, '2026-08-03')
    `).run(JSON.stringify({ what_it_does: 'Lower-depth precedence control' }));
    const response = await worker.fetch(
      new Request('http://localhost/api/profile/blockchain/ethereum'),
      env,
      context,
    );
    const profile = await response.json();
    embeddedCanonicalWins = response.status === 200
      && profile?.identity?.name === sentinel.identity.name
      && profile?.outcome?.label === sentinel.outcome.label;
  } finally {
    database.exec('ROLLBACK TO canonical_precedence_control');
    database.exec('RELEASE canonical_precedence_control');
  }

  return {
    forensic_fact_profiles: factExpectations.length,
    forensic_fact_mismatches: factMismatches.map((row) => routeSlug(row.chain)),
    embedded_canonical_over_lower_depth_legacy: embeddedCanonicalWins,
  };
}

export async function buildProfileAdapterCensus() {
  const database = new DatabaseSync(':memory:');
  try {
    applyMigrations(database);
    const routes = enumerateProfileRoutes(database);
    const chainFactSlugs = queryRows(database, `
      SELECT DISTINCT chain FROM chain_facts ORDER BY lower(chain)
    `).map((row) => routeSlug(row.chain));
    const env = { DB: d1Adapter(database) };
    const context = { waitUntil() {}, passThroughOnException() {} };
    const rows = [];
    for (const route of routes) {
      const response = await worker.fetch(new Request(
        `http://localhost/api/profile/${route.type}/${encodeURIComponent(route.slug)}`,
      ), env, context);
      const profile = await response.json();
      rows.push(profileAssessment(route, response.status, profile));
    }
    const blockchainUnion = blockchainUnionSummary(database, rows);
    const blockchainPrecedence = await blockchainPrecedenceAssessment(
      database,
      env,
      context,
      rows,
    );
    const byType = Object.fromEntries(ENTITY_TYPES.map((type) => {
      const typed = rows.filter((row) => row.type === type);
      const richest = [...typed].sort((a, b) => b.legacy_bytes - a.legacy_bytes)[0] || null;
      const errorCodes = typed.reduce((counts, row) => {
        for (const [code, count] of Object.entries(row.validation_error_codes)) {
          counts[code] = (counts[code] || 0) + count;
        }
        return counts;
      }, {});
      const errorClasses = typed.reduce((counts, row) => {
        for (const [key, count] of Object.entries(row.validation_error_classes)) {
          counts[key] = (counts[key] || 0) + count;
        }
        return counts;
      }, {});
      return [type, {
        total: typed.length,
        sections_0: typed.filter((row) => row.section_bucket === 'sections_0').length,
        sections_1_2: typed.filter((row) => row.section_bucket === 'sections_1_2').length,
        sections_3_9: typed.filter((row) => row.section_bucket === 'sections_3_9').length,
        sections_10: typed.filter((row) => row.section_bucket === 'sections_10').length,
        validation_error_profiles: typed.filter((row) => row.validation_error_count > 0).length,
        validation_errors: typed.reduce((sum, row) => sum + row.validation_error_count, 0),
        validation_error_codes: errorCodes,
        validation_error_classes: errorClasses,
        raw_object_leaks: typed.filter((row) => row.raw_object_leak).length,
        dishonest_gap_profiles: typed.filter((row) => !row.honest_gaps).length,
        not_found: typed.filter((row) => row.http_status !== 200).length,
        richest_legacy: richest ? {
          slug: richest.slug,
          name: richest.name,
          legacy_bytes: richest.legacy_bytes,
          canonical_sections: richest.section_count,
          validation_errors: richest.validation_error_count,
        } : null,
      }];
    }));
    return {
      generated_at: new Date().toISOString(),
      total: rows.length,
      by_type: byType,
      chain_facts: {
        total: chainFactSlugs.length,
        not_found: chainFactSlugs.filter((slug) => !rows.some((row) => (
          row.type === 'blockchain' && row.slug === slug && row.http_status === 200
        ))).length,
        zero_section: chainFactSlugs.filter((slug) => rows.some((row) => (
          row.type === 'blockchain' && row.slug === slug && row.section_count === 0
        ))).length,
      },
      blockchain_union: blockchainUnion,
      blockchain_precedence: blockchainPrecedence,
      rows,
    };
  } finally {
    database.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const census = await buildProfileAdapterCensus();
  process.stdout.write(`${JSON.stringify(census, null, 2)}\n`);
}

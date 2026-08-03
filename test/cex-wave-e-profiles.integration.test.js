import { Buffer } from 'node:buffer';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { unstable_splitSqlQuery } from 'wrangler';
import { document, renderMigration } from '../scripts/render-cex-wave-e-0095.mjs';
import {
  ANALYSIS_SECTION_KEYS,
  embeddedCanonicalEntityProfile,
  validateEntityProfile,
} from '../src/lib/entity-profile.js';

const artifact = JSON.parse(readFileSync(
  new URL('../docs/cex-wave-e-profiles-2026-08-03.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0095_cex_wave_e_profiles.sql', import.meta.url),
  'utf8',
);
const expected = {
  bitmart: { table: 'dead_exchanges', outcome: 'orderly_wind_down_announced' },
  htx: { table: 'mid_exchanges', outcome: 'operating_regulatory_and_identity_risk' },
  kucoin: { table: 'mid_exchanges', outcome: 'operating_after_us_conviction_with_eu_launch_blocked' },
  bithumb: { table: 'mid_exchanges', outcome: 'operating_domestic_leader_with_control_failure' },
  quadrigacx: { table: 'dead_exchanges', outcome: 'failed_fraud_with_partial_creditor_recovery' },
};

const INTERNAL_COPY = /\[object Object\]|"source_ids"|"evidence_locator"|publication_state|trend_id|claim_ids|field_path|forensic_analysis|canonical_profile|observation_snapshot|quality_flags|review_state/;

function applyMigrations(database, through = Infinity) {
  const files = readdirSync(new URL('../migrations/', import.meta.url))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .filter((file) => Number(file.slice(0, 4)) <= through)
    .sort();
  for (const file of files) {
    database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
}

function typeColumn(table) {
  return table === 'successful_exchanges' ? 'type' : 'kind';
}

function row(database, table, slug) {
  return database.prepare(
    `SELECT * FROM ${table} WHERE ${typeColumn(table)} = 'cex' AND slug = ?`,
  ).get(slug);
}

function profile(database, table, slug) {
  return embeddedCanonicalEntityProfile(row(database, table, slug)?.profile, {
    type: 'cex',
    slug,
  });
}

function d1(database) {
  return {
    prepare(sql) {
      return {
        bindings: [],
        bind(...bindings) {
          this.bindings = bindings;
          return this;
        },
        async all() {
          return { results: database.prepare(sql).all(...this.bindings) };
        },
        async first() {
          return database.prepare(sql).get(...this.bindings) ?? null;
        },
        async run() {
          return database.prepare(sql).run(...this.bindings);
        },
      };
    },
  };
}

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });
let apiDatabase;
let apiWorker;

beforeAll(async () => {
  apiDatabase = new DatabaseSync(':memory:');
  applyMigrations(apiDatabase);
  vi.resetModules();
  apiWorker = (await import('../src/worker.js')).default;
}, 60_000);

afterAll(() => {
  apiDatabase?.close();
  vi.unstubAllGlobals();
});

describe('CEX canonical profile wave E', () => {
  it('keeps the source artifact and D1-safe migration deterministic', () => {
    expect(artifact).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document).toMatchObject({
      schema: 'chaindump-cex-wave-e-v1',
      research_as_of: '2026-08-03',
      generated_migration: '0095_cex_wave_e_profiles.sql',
    });
    expect(document.cases.map(({ slug }) => slug)).toEqual(Object.keys(expected));
    expect(migration).not.toMatch(/\bCREATE\s+TEMP(?:ORARY)?\s+TABLE\b/i);
    const statements = unstable_splitSqlQuery(migration);
    expect(Math.max(...statements.map((statement) => Buffer.byteLength(statement, 'utf8'))))
      .toBeLessThanOrEqual(95_000);
  });

  it('ships the exact ten-section human report with atomic cited claims', () => {
    for (const entry of document.cases) {
      const value = entry.canonical_profile;
      const contract = expected[entry.slug];
      expect(entry.table).toBe(contract.table);
      expect(value.outcome.label).toBe(contract.outcome);
      expect(value.sources.length, `${entry.slug}:sources`).toBeGreaterThanOrEqual(7);
      expect(value.claims.length, `${entry.slug}:claims`).toBeGreaterThanOrEqual(36);
      expect(validateEntityProfile(value), entry.slug).toEqual([]);
      expect(Object.keys(value.analysis.sections)).toEqual(ANALYSIS_SECTION_KEYS);
      expect(value.quality).toMatchObject({ publication_state: 'review', completeness_pct: 100 });
      expect(value.extensions.explicit_unknowns.length, entry.slug).toBeGreaterThanOrEqual(4);

      const sourceIds = new Set(value.sources.map(({ id }) => id));
      expect(value.sources.some(({ role }) => role === 'primary'), entry.slug).toBe(true);
      expect(value.sources.some(({ role }) => role === 'independent'), entry.slug).toBe(true);
      expect(new Set(value.sources.map(({ url }) => url)).size, entry.slug)
        .toBe(value.sources.length);
      for (const source of value.sources) {
        expect(source, `${entry.slug}:${source.id}`).toMatchObject({
          url: expect.stringMatching(/^https:\/\//),
          accessed_at: expect.stringMatching(/^2026-08-03T/),
          checked_at: expect.stringMatching(/^2026-08-03T/),
          access_state: 'reachable',
          evidence_locator: expect.any(String),
        });
      }

      for (const [key, section] of Object.entries(value.analysis.sections)) {
        expect(section.body.trim().length, `${entry.slug}.${key}`).toBeGreaterThan(180);
        expect(section.body, `${entry.slug}.${key}`).not.toMatch(INTERNAL_COPY);
        expect(section.claim_ids.length, `${entry.slug}.${key}:claims`).toBeGreaterThanOrEqual(2);
        expect(section.claim_ids.length, `${entry.slug}.${key}:claims`).toBeLessThanOrEqual(4);
        for (const id of section.claim_ids) {
          const item = value.claims.find((candidate) => candidate.id === id);
          expect(item, id).toBeDefined();
          expect(item.field_path, id).toBe(`analysis.sections.${key}.body`);
          expect(item.assertion.length, id).toBeLessThanOrEqual(240);
        }
      }
      for (const item of value.claims) {
        expect(item, item.id).toMatchObject({
          assertion: expect.any(String),
          value: expect.anything(),
          evidence_locator: expect.any(String),
          source_ids: expect.any(Array),
          review: { state: 'pending', reviewer: null, reviewed_at: null },
        });
        expect(item.source_ids.length, item.id).toBeGreaterThan(0);
        expect(item.source_ids.every((id) => sourceIds.has(id)), item.id).toBe(true);
      }
      expect(value.claims.some(({ kind }) => kind === 'fact'), entry.slug).toBe(true);
      expect(value.claims.some(({ kind }) => kind === 'inference'), entry.slug).toBe(true);
      expect(value.claims.some(({ kind }) => kind === 'unknown'), entry.slug).toBe(true);
    }
  });

  it('keeps venue, parent, token, recovery and legal boundaries explicit', () => {
    const profiles = Object.fromEntries(document.cases.map((entry) => (
      [entry.slug, entry.canonical_profile]
    )));

    expect(profiles.bitmart.status.operating_state).toBe('winding_down');
    expect(profiles.bitmart.analysis.sections.lifecycle.body).toContain('January 31, 2027');
    expect(profiles.bitmart.extensions.identity_boundary)
      .toMatch(/2021.*historical incident|historical incident.*2021/i);
    expect(profiles.bitmart.metrics.find(({ id }) => id.includes('breach-estimate')))
      .toMatchObject({ dimension: 'customer_shortfall', value: 196_000_000,
        quality_flags: expect.arrayContaining(['historical_incident', 'not_current_shortfall']) });

    expect(profiles.htx.extensions.identity_boundary)
      .toMatch(/OFSI|UK authorities.*HTX disputes|HTX disputes/i);
    expect(profiles.htx.analysis.sections.risks_and_unknowns.body)
      .toMatch(/HTX says.*OFSI says|OFSI says.*HTX says/i);
    expect(profiles.htx.metrics.find(({ id }) => id.includes('btc-reserve-ratio')))
      .toMatchObject({ dimension: 'reserve_coverage', value: 103,
        quality_flags: expect.arrayContaining(['snapshot', 'not_financial_statement_audit']) });

    expect(profiles.kucoin.extensions.identity_boundary)
      .toMatch(/Peken Global.*KuCoin EU Exchange GmbH/i);
    expect(profiles.kucoin.analysis.sections.what_happened.body)
      .toMatch(/prohibited.*starting operations|prohibition on starting operations/i);
    expect(profiles.kucoin.metrics.find(({ id }) => id.includes('us-penalties')))
      .toMatchObject({ dimension: 'regulatory_fines', value: 297_400_000,
        quality_flags: expect.arrayContaining(['specific_legal_entity']) });

    expect(profiles.bithumb.extensions.identity_boundary)
      .toMatch(/internal ledger credit.*not evidence|not evidence.*on-chain/i);
    expect(profiles.bithumb.metrics[0]).toMatchObject({ dimension: 'market_share', value: 25,
      quality_flags: expect.arrayContaining(['approximate_midpoint', 'domestic_market_only']) });
    expect(profiles.bithumb.analysis.sections.token_and_value_capture.body)
      .toMatch(/do not identify a live Bithumb venue token/i);

    expect(profiles.quadrigacx.status.operating_state).toBe('closed_bankruptcy_estate');
    expect(profiles.quadrigacx.extensions.identity_boundary)
      .toMatch(/regulatory findings.*not a criminal conviction/i);
    expect(profiles.quadrigacx.metrics.find(({ id }) => id.includes('first-interim-dividend')))
      .toMatchObject({ dimension: 'creditor_recovery', value: 13.094156,
        quality_flags: expect.arrayContaining(['interim_not_final', 'court_fixed_claim_values']) });
    expect(profiles.quadrigacx.extensions.methodology_notes.join(' '))
      .toMatch(/215 million.*46 million.*169 million.*must not be added/i);
  });

  it('preserves legacy rows and source arrays while replaying idempotently', () => {
    const database = new DatabaseSync(':memory:');
    applyMigrations(database, 94);
    const before = new Map(document.cases.map((entry) => (
      [entry.slug, row(database, entry.table, entry.slug)]
    )));

    database.exec(migration);
    for (const entry of document.cases) {
      const prior = before.get(entry.slug);
      const current = row(database, entry.table, entry.slug);
      expect(prior, `${entry.slug}:fixture`).toBeDefined();
      expect(current, entry.slug).toBeDefined();
      for (const [key, value] of Object.entries(prior)) {
        if (key === 'profile') continue;
        expect(current[key], `${entry.slug}:${key}`).toEqual(value);
      }
      const oldProfile = JSON.parse(prior.profile || '{}');
      const newProfile = JSON.parse(current.profile || '{}');
      delete oldProfile.canonical_profile;
      delete newProfile.canonical_profile;
      expect(newProfile, `${entry.slug}:legacy profile`).toEqual(oldProfile);
      expect(profile(database, entry.table, entry.slug), entry.slug)
        .toEqual(entry.canonical_profile);
      expect(current.sources, `${entry.slug}:legacy sources`).toBe(prior.sources);
      expect(database.prepare(`
        SELECT operating_model, product_cohort, metric_type, quality_label
        FROM exchange_case_features
        WHERE kind = 'cex' AND slug = ? AND lifecycle = ?
      `).get(entry.slug, entry.feature.lifecycle)).toEqual({
        operating_model: entry.feature.operating_model,
        product_cohort: entry.feature.product_cohort,
        metric_type: entry.feature.metric_type,
        quality_label: 'verified',
      });
    }

    const once = document.cases.map((entry) => row(database, entry.table, entry.slug));
    const featuresOnce = database.prepare(`
      SELECT * FROM exchange_case_features
      WHERE kind = 'cex' AND slug IN (${document.cases.map(() => '?').join(',')})
      ORDER BY slug, lifecycle
    `).all(...document.cases.map(({ slug }) => slug));
    database.exec(migration);
    expect(document.cases.map((entry) => row(database, entry.table, entry.slug))).toEqual(once);
    expect(database.prepare(`
      SELECT * FROM exchange_case_features
      WHERE kind = 'cex' AND slug IN (${document.cases.map(() => '?').join(',')})
      ORDER BY slug, lifecycle
    `).all(...document.cases.map(({ slug }) => slug))).toEqual(featuresOnce);
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM sqlite_master
      WHERE type = 'table' AND name = '_cex_wave_e_profiles_0095'
    `).get().count).toBe(0);
    database.close();
  });

  it('serves every canonical CEX profile to the shared UI route', async () => {
    for (const entry of document.cases) {
      const response = await apiWorker.fetch(
        new Request(`http://localhost/api/profile/cex/${entry.slug}`),
        { DB: d1(apiDatabase) },
        ctx(),
      );
      expect(response.status, entry.slug).toBe(200);
      expect(await response.json(), entry.slug).toEqual(entry.canonical_profile);

      const indexResponse = await apiWorker.fetch(
        new Request(
          'http://localhost/api/exchange-analysis?kind=cex'
          + `&lifecycle=${entry.feature.lifecycle}&slug=${entry.slug}`,
        ),
        { DB: d1(apiDatabase) },
        ctx(),
      );
      expect(indexResponse.status, `${entry.slug}:index`).toBe(200);
      const indexPayload = await indexResponse.json();
      expect(indexPayload.cases, `${entry.slug}:index cases`).toHaveLength(1);
      const canonicalSourceIds = new Set(entry.canonical_profile.sources.map(({ id }) => id));
      const projectedCanonicalSources = indexPayload.cases[0].sources.filter(({ id }) => (
        canonicalSourceIds.has(id)
      ));
      expect(projectedCanonicalSources.length, `${entry.slug}:canonical sources`).toBeGreaterThan(0);
      expect(projectedCanonicalSources.every(({ resolving }) => resolving), entry.slug).toBe(true);
      expect(indexPayload.cases[0].analysis.canonical_evidence, entry.slug).toMatchObject({
        explanation_complete: true,
        complete_sections: 10,
        total_sections: 10,
      });
    }
    const missing = await apiWorker.fetch(
      new Request('http://localhost/api/profile/cex/does-not-exist'),
      { DB: d1(apiDatabase) },
      ctx(),
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'profile not found' });
  });
});

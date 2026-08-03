import { Buffer } from 'node:buffer';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { unstable_splitSqlQuery } from 'wrangler';
import { document, renderMigration } from '../scripts/render-cex-wave-f-0101.mjs';
import {
  ANALYSIS_SECTION_KEYS,
  embeddedCanonicalEntityProfile,
  validateEntityProfile,
} from '../src/lib/entity-profile.js';

const artifact = JSON.parse(readFileSync(
  new URL('../docs/cex-wave-f-profiles-2026-08-03.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0101_cex_wave_f_profiles.sql', import.meta.url),
  'utf8',
);
const expected = {
  ascendex: { table: 'dead_exchanges', outcome: 'unresolved_wind_down_after_authorization_and_operating_constraints' },
  blockfi: { table: 'dead_exchanges', outcome: 'failed_lender_in_wind_down_with_dollarized_claim_recovery' },
  celsius: { table: 'dead_exchanges', outcome: 'failed_lender_after_fraud_liquidity_and_risk_failures' },
  coinflex: { table: 'dead_exchanges', outcome: 'failed_after_concentrated_counterparty_exposure_and_restructuring' },
  xeggex: { table: 'mid_exchanges', outcome: 'historical_platform_failure_with_unverified_brand_return' },
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

describe('CEX canonical profile wave F', () => {
  it('keeps the source artifact and D1-safe migration deterministic', () => {
    expect(artifact).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document).toMatchObject({
      schema: 'chaindump-cex-wave-f-v1',
      research_as_of: '2026-08-03',
      generated_migration: '0101_cex_wave_f_profiles.sql',
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
          accessed_at: '2026-08-03T22:00:00Z',
          checked_at: '2026-08-03T22:00:00Z',
          access_state: 'reachable',
          resolving: true,
          reachable: true,
          evidence_locator: expect.any(String),
        });
      }

      for (const [key, sectionValue] of Object.entries(value.analysis.sections)) {
        expect(sectionValue.body.trim().length, `${entry.slug}.${key}`).toBeGreaterThan(180);
        expect(sectionValue.body, `${entry.slug}.${key}`).not.toMatch(INTERNAL_COPY);
        expect(sectionValue.claim_ids.length, `${entry.slug}.${key}:claims`).toBe(3);
        for (const id of sectionValue.claim_ids) {
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

  it('preserves the required legal, product, token and recovery boundaries', () => {
    const profiles = Object.fromEntries(document.cases.map((entry) => (
      [entry.slug, entry.canonical_profile]
    )));

    expect(profiles.ascendex.analysis.sections.why_this_outcome.body)
      .toMatch(/financial and operational|broader wind-down/i);
    expect(profiles.ascendex.extensions.methodology_notes.join(' '))
      .toMatch(/\$240 million.*excluded/i);
    expect(profiles.ascendex.extensions.identity_boundary)
      .toMatch(/lack of MiCA authorization.*does not.*prove insolvency/i);

    expect(profiles.blockfi.classification.subtype).toMatch(/lender and broker/i);
    expect(profiles.blockfi.extensions.identity_boundary)
      .toMatch(/not a conventional order-book exchange/i);
    expect(profiles.blockfi.metrics.find(({ id }) => id.includes('allowed-claim')))
      .toMatchObject({ dimension: 'creditor_recovery', value: 100,
        quality_flags: expect.arrayContaining(['allowed_dollar_claims_only', 'not_original_crypto_units']) });

    expect(profiles.celsius.classification.subtype).toMatch(/lender and yield platform/i);
    expect(profiles.celsius.extensions.identity_boundary)
      .toMatch(/not a conventional order-book exchange/i);
    expect(profiles.celsius.extensions.methodology_notes.join(' '))
      .toMatch(/customer-assets figure.*not the same metric.*suspended.*judgment/i);
    expect(profiles.celsius.analysis.sections.token_and_value_capture.body)
      .toMatch(/manipulation tied to executive extraction/i);

    expect(profiles.coinflex.extensions.identity_boundary)
      .toMatch(/\$84 million.*disputed claim.*not an adjudicated/i);
    expect(profiles.coinflex.analysis.sections.token_and_value_capture.body)
      .toMatch(/FLEX.*flexUSD.*rvUSD/i);
    expect(profiles.coinflex.metrics[0].quality_flags)
      .toEqual(expect.arrayContaining(['company_claim_not_adjudicated', 'counterparty_disputed']));

    expect(profiles.xeggex.status.operating_state)
      .toBe('website_online_operator_continuity_unverified');
    expect(profiles.xeggex.extensions.identity_boundary)
      .toMatch(/No primary bankruptcy order.*\$80 million.*12,000-user/i);
    expect(profiles.xeggex.analysis.sections.risks_and_unknowns.body)
      .toMatch(/intentionally excluded/i);
    expect(profiles.xeggex.metrics).toEqual([]);
  });

  it('preserves legacy rows and source arrays while replaying idempotently', () => {
    const database = new DatabaseSync(':memory:');
    applyMigrations(database, 100);
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
    database.exec(migration);
    expect(document.cases.map((entry) => row(database, entry.table, entry.slug))).toEqual(once);
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM sqlite_master
      WHERE type = 'table' AND name = '_cex_wave_f_profiles_0101'
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
  });
});

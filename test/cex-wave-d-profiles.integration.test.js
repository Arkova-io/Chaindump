import { Buffer } from 'node:buffer';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { unstable_splitSqlQuery } from 'wrangler';
import { document, renderMigration } from '../scripts/render-cex-wave-d-0092.mjs';
import {
  ANALYSIS_SECTION_KEYS,
  embeddedCanonicalEntityProfile,
  validateEntityProfile,
} from '../src/lib/entity-profile.js';

const artifact = JSON.parse(readFileSync(
  new URL('../docs/cex-wave-d-profiles-2026-08-03.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0092_cex_wave_d_profiles.sql', import.meta.url),
  'utf8',
);
const expected = {
  bitstamp: { table: 'successful_exchanges', outcome: 'successful_acquired' },
  okx: { table: 'mid_exchanges', outcome: 'operating_regulatory_pivot' },
  wazirx: { table: 'mid_exchanges', outcome: 'recovering_after_custody_failure' },
  fcoin: { table: 'dead_exchanges', outcome: 'failed_insolvent_unresolved' },
  'mt-gox': { table: 'dead_exchanges', outcome: 'failed_closed_partial_recovery' },
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

describe('CEX canonical profile wave D', () => {
  it('keeps the source artifact and D1-safe migration deterministic', () => {
    expect(artifact).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document).toMatchObject({
      schema: 'chaindump-cex-wave-d-v1',
      research_as_of: '2026-08-03',
      generated_migration: '0092_cex_wave_d_profiles.sql',
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

    expect(profiles.bitstamp.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dimension: 'spot_volume',
        value: 22_000_000_000,
        quality_flags: expect.arrayContaining([
          'product_mix_not_disclosed',
          'not_comparable_to_spot_only_volume',
        ]),
      }),
    ]));
    expect(profiles.bitstamp.extensions.identity_boundary).toMatch(/Robinhood App.*separate/i);
    expect(profiles.bitstamp.analysis.sections.token_and_value_capture.body)
      .toMatch(/does not identify a Bitstamp exchange token/i);

    expect(profiles.okx.metrics.find(({ id }) => id.includes('btc-reserve-ratio')))
      .toMatchObject({ dimension: 'reserve_coverage', value: 105,
        quality_flags: expect.arrayContaining(['snapshot']) });
    expect(profiles.okx.extensions.identity_boundary)
      .toMatch(/Aux Cayes.*separate|separate.*Aux Cayes/i);
    expect(profiles.okx.analysis.sections.risks_and_unknowns.body)
      .toMatch(/not a financial-statement audit|does not prove all liabilities/i);

    expect(profiles.wazirx.metrics.find(({ id }) => id.includes('first-distribution')))
      .toMatchObject({ dimension: 'creditor_recovery', value: 85,
        quality_flags: expect.arrayContaining(['reference_price_basis']) });
    expect(profiles.wazirx.extensions.identity_boundary).toMatch(/Zettai.*Zanmai|Zanmai.*Zettai/i);
    expect(profiles.wazirx.analysis.sections.risks_and_unknowns.body)
      .toMatch(/WazirX and Liminal disagree|Liminal and WazirX disagree/i);
    expect(profiles.wazirx.analysis.sections.token_and_value_capture.body)
      .toMatch(/Recovery Tokens.*not WRX|WRX.*Recovery Tokens/i);

    expect(profiles.fcoin.metrics.filter(({ dimension }) => dimension === 'customer_shortfall'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ value: 7_000, quality_flags: expect.arrayContaining(['range_low']) }),
        expect.objectContaining({ value: 13_000, quality_flags: expect.arrayContaining(['range_high']) }),
    ]));
    expect(profiles.fcoin.analysis.sections.risks_and_unknowns.body)
      .toMatch(/range is not a final loss|not a final audited loss/i);
    expect(profiles.fcoin.extensions.identity_boundary).toMatch(/exit scam.*allegation/i);

    expect(profiles['mt-gox'].status.operating_state).toBe('closed_rehabilitation');
    expect(profiles['mt-gox'].analysis.sections.lifecycle.body).toContain('October 31, 2026');
    expect(profiles['mt-gox'].metrics.find(({ id }) => id.includes('doj-alleged-theft')))
      .toMatchObject({ value: 647_000,
        quality_flags: expect.arrayContaining(['allegation_not_conviction', 'not_additive']) });
    expect(profiles['mt-gox'].extensions.methodology_notes.join(' '))
      .toMatch(/850,000.*200,000.*647,000.*must not be added/i);
  });

  it('preserves legacy rows and source arrays while replaying idempotently', () => {
    const database = new DatabaseSync(':memory:');
    applyMigrations(database, 89);
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
      WHERE type = 'table' AND name = '_cex_wave_d_profiles_0092'
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

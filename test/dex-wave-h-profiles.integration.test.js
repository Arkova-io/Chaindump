import { Buffer } from 'node:buffer';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { unstable_splitSqlQuery } from 'wrangler';
import { document, renderMigration } from '../scripts/render-dex-wave-h-0089.mjs';
import {
  ANALYSIS_SECTION_KEYS,
  embeddedCanonicalEntityProfile,
  validateEntityProfile,
} from '../src/lib/entity-profile.js';

const artifact = JSON.parse(readFileSync(
  new URL('../docs/dex-wave-h-profiles-2026-08-03.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0089_dex_wave_h_profiles.sql', import.meta.url),
  'utf8',
);
const expected = {
  spookyswap: { table: 'mid_exchanges', outcome: 'operating_middling' },
  spiritswap: { table: 'mid_exchanges', outcome: 'rescued_declining' },
  'uranium-finance': { table: 'dead_exchanges', outcome: 'failed_after_repeat_exploits' },
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
    `SELECT * FROM ${table} WHERE ${typeColumn(table)} = 'dex' AND slug = ?`,
  ).get(slug);
}

function profile(database, table, slug) {
  return embeddedCanonicalEntityProfile(row(database, table, slug)?.profile, {
    type: 'dex',
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

describe('DEX canonical profile wave H', () => {
  it('keeps the source artifact and D1-safe migration deterministic', () => {
    expect(artifact).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document).toMatchObject({
      schema: 'chaindump-dex-wave-h-v1',
      research_as_of: '2026-08-03',
      generated_migration: '0089_dex_wave_h_profiles.sql',
    });
    expect(document.cases.map(({ slug }) => slug)).toEqual(Object.keys(expected));
    expect(migration).not.toMatch(/\bCREATE\s+TEMP(?:ORARY)?\s+TABLE\b/i);
    const statements = unstable_splitSqlQuery(migration);
    expect(Math.max(...statements.map((statement) => Buffer.byteLength(statement, 'utf8'))))
      .toBeLessThanOrEqual(95_000);
  });

  it('ships ten plain-English sections, atomic claims and mixed outcomes', () => {
    for (const entry of document.cases) {
      const value = entry.canonical_profile;
      const contract = expected[entry.slug];
      expect(entry.table).toBe(contract.table);
      expect(value.outcome.label).toBe(contract.outcome);
      expect(value.sources.length, `${entry.slug}:sources`).toBeGreaterThanOrEqual(10);
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
        expect(section.body.trim(), `${entry.slug}.${key}`).not.toBe('');
        expect(section.body, `${entry.slug}.${key}`).not.toMatch(INTERNAL_COPY);
        expect(section.claim_ids.length, `${entry.slug}.${key} atomic claims`)
          .toBeGreaterThanOrEqual(2);
        expect(section.claim_ids.length, `${entry.slug}.${key} bounded claims`)
          .toBeLessThanOrEqual(4);
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

  it('keeps product, adapter, incident, governance and successor boundaries explicit', () => {
    const profiles = Object.fromEntries(document.cases.map((entry) => (
      [entry.slug, entry.canonical_profile]
    )));

    expect(profiles.spookyswap.metrics.find(({ id }) => id.includes('spot-volume-30d')))
      .toMatchObject({ value: 856_059, dimension: 'spot_volume' });
    expect(profiles.spookyswap.extensions.identity_boundary)
      .toMatch(/launchpad.*bridge.*perpetuals.*separate|perpetuals.*separate/i);
    expect(profiles.spookyswap.analysis.sections.why_this_outcome.body)
      .toMatch(/Fantom.*BOO.*incentive|BOO.*Fantom/i);
    expect(profiles.spookyswap.analysis.sections.risks_and_unknowns.body)
      .toMatch(/frontend.*pool contracts|pool contracts.*frontend/i);

    expect(profiles.spiritswap.metrics.find(({ id }) => id.includes('tvl-latest')))
      .toMatchObject({ value: 229_706, dimension: 'tvl' });
    expect(profiles.spiritswap.events.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'event:spiritswap:shutdown-announced',
      'event:spiritswap:rescue-approved',
    ]));
    expect(profiles.spiritswap.extensions.identity_boundary)
      .toMatch(/Multichain.*external|external.*Multichain/i);
    expect(profiles.spiritswap.analysis.sections.what_happened.body)
      .toMatch(/Power.*200,000|200,000.*Power/i);

    expect(profiles['uranium-finance'].status.operating_state).toBe('closed');
    expect(profiles['uranium-finance'].metrics.find(({ id }) => id.includes('second-exploit-loss-authority')))
      .toMatchObject({ value: 53_300_000, quality_flags: expect.arrayContaining(['indictment_allegation']) });
    expect(profiles['uranium-finance'].metrics.find(({ id }) => id.includes('assets-seized')))
      .toMatchObject({ value: 31_000_000, quality_flags: expect.arrayContaining(['seized_not_distributed']) });
    expect(document.cases.find(({ slug }) => slug === 'uranium-finance')?.feature)
      .toMatchObject({ token_symbol: 'U92', token_launch_timing: 'post_product' });
    expect(profiles['uranium-finance'].extensions.identity_boundary)
      .toMatch(/BNB Chain.*not.*consensus failure|not a BNB Chain consensus failure/i);
    expect(profiles['uranium-finance'].analysis.sections.risks_and_unknowns.body)
      .toMatch(/presumed innocent|only an accusation/i);
  });

  it('preserves legacy rows and sources while replaying idempotently', () => {
    const database = new DatabaseSync(':memory:');
    applyMigrations(database, 88);
    const before = new Map(document.cases.map((entry) => (
      [entry.slug, row(database, entry.table, entry.slug)]
    )));

    database.exec(migration);
    for (const entry of document.cases) {
      const prior = before.get(entry.slug);
      const current = row(database, entry.table, entry.slug);
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
        WHERE kind = 'dex' AND slug = ? AND lifecycle = ?
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
      WHERE kind = 'dex' AND slug IN (${document.cases.map(() => '?').join(',')})
      ORDER BY slug, lifecycle
    `).all(...document.cases.map(({ slug }) => slug));
    database.exec(migration);
    expect(document.cases.map((entry) => row(database, entry.table, entry.slug))).toEqual(once);
    expect(database.prepare(`
      SELECT * FROM exchange_case_features
      WHERE kind = 'dex' AND slug IN (${document.cases.map(() => '?').join(',')})
      ORDER BY slug, lifecycle
    `).all(...document.cases.map(({ slug }) => slug))).toEqual(featuresOnce);
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM sqlite_master
      WHERE type = 'table' AND name = '_dex_wave_h_profiles_0089'
    `).get().count).toBe(0);
    database.close();
  });

  it('serves each canonical DEX profile and a clean not-found response', async () => {
    for (const entry of document.cases) {
      const response = await apiWorker.fetch(
        new Request(`http://localhost/api/profile/dex/${entry.slug}`),
        { DB: d1(apiDatabase) },
        ctx(),
      );
      expect(response.status, entry.slug).toBe(200);
      expect(await response.json(), entry.slug).toEqual(entry.canonical_profile);
    }
    const missing = await apiWorker.fetch(
      new Request('http://localhost/api/profile/dex/does-not-exist'),
      { DB: d1(apiDatabase) },
      ctx(),
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'profile not found' });
  });
});

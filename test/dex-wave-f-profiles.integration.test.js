import { Buffer } from 'node:buffer';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { unstable_splitSqlQuery } from 'wrangler';
import { document, renderMigration } from '../scripts/render-dex-wave-f-0083.mjs';
import {
  ANALYSIS_SECTION_KEYS,
  embeddedCanonicalEntityProfile,
  validateEntityProfile,
} from '../src/lib/entity-profile.js';

const artifact = JSON.parse(readFileSync(
  new URL('../docs/dex-wave-f-profiles-2026-08-03.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0083_dex_wave_f_profiles.sql', import.meta.url),
  'utf8',
);
const expected = {
  hyperliquid: {
    table: 'successful_exchanges', outcome: 'successful_established', sources: 11, claims: 40,
  },
  raydium: {
    table: 'successful_exchanges', outcome: 'successful_cyclical', sources: 11, claims: 39,
  },
  osmosis: {
    table: 'mid_exchanges', outcome: 'operating_middling', sources: 11, claims: 40,
  },
  kyberswap: {
    table: 'dead_exchanges', outcome: 'operating_impaired_after_exploit', sources: 10, claims: 40,
  },
  serum: {
    table: 'dead_exchanges', outcome: 'failed_closed', sources: 10, claims: 40,
  },
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

describe('DEX canonical profile wave F', () => {
  it('keeps the source artifact and D1-safe migration deterministic', () => {
    expect(artifact).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document).toMatchObject({
      schema: 'chaindump-dex-wave-f-v1',
      research_as_of: '2026-08-03',
      generated_migration: '0083_dex_wave_f_profiles.sql',
    });
    expect(document.cases.map(({ slug }) => slug)).toEqual(Object.keys(expected));
    expect(migration).not.toMatch(/\bCREATE\s+TEMP(?:ORARY)?\s+TABLE\b/i);
    const statements = unstable_splitSqlQuery(migration);
    expect(Math.max(...statements.map((statement) => Buffer.byteLength(statement, 'utf8'))))
      .toBeLessThanOrEqual(95_000);
  });

  it('ships ten plain-English sections, atomic claims and current mixed outcomes', () => {
    for (const entry of document.cases) {
      const value = entry.canonical_profile;
      const contract = expected[entry.slug];
      expect(entry.table).toBe(contract.table);
      expect(value.outcome.label).toBe(contract.outcome);
      expect(value.sources).toHaveLength(contract.sources);
      expect(value.claims).toHaveLength(contract.claims);
      expect(validateEntityProfile(value), entry.slug).toEqual([]);
      expect(Object.keys(value.analysis.sections)).toEqual(ANALYSIS_SECTION_KEYS);
      expect(value.quality).toMatchObject({
        publication_state: 'review',
        completeness_pct: 100,
      });
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

  it('keeps venue, chain, token, adapter and recovery boundaries explicit', () => {
    const profiles = Object.fromEntries(document.cases.map((entry) => (
      [entry.slug, entry.canonical_profile]
    )));

    expect(profiles.hyperliquid.identity).toMatchObject({
      id: 'dex:hyperliquid',
      type: 'dex',
      name: 'Hyperliquid DEX',
    });
    expect(profiles.hyperliquid.extensions.identity_boundary).toMatch(
      /DEX running in HyperCore.*L1.*separate blockchain surfaces/i,
    );
    expect(profiles.hyperliquid.metrics.find(({ id }) => id.includes('perp-notional-24h')))
      .toMatchObject({ value: 3_070_990_826, dimension: 'derivatives_notional' });

    expect(profiles.raydium.metrics.some(({ dimension }) => dimension === 'derivatives_notional'))
      .toBe(false);
    expect(profiles.raydium.analysis.sections.token_and_value_capture.body)
      .toMatch(/buyback.*not automatically burned.*not the same as earnings/i);

    expect(profiles.osmosis.metrics.find(({ id }) => id.includes('tvl-latest'))?.value)
      .toBe(11_928_437);
    expect(profiles.osmosis.metrics.find(({ id }) => id.includes('tvl-peak'))?.value)
      .toBe(1_831_730_122);

    expect(profiles.kyberswap.status.operating_state).toBe('operating');
    expect(profiles.kyberswap.outcome.label).toBe('operating_impaired_after_exploit');
    expect(profiles.kyberswap.metrics.find(({ id }) => id.includes('routed-volume-30d')))
      .toMatchObject({
        value: 5_260_170_526,
        quality_flags: ['routed_volume_overlap', 'not_owned_liquidity', 'not_unique_users'],
    });
    expect(profiles.kyberswap.analysis.sections.what_happened.body)
      .toMatch(/grants.*approved applicants.*not a full direct recovery/i);

    expect(profiles.serum.status.operating_state).toBe('closed');
    expect(profiles.serum.metrics.some(({ id }) => id.includes('tvl-latest'))).toBe(false);
    expect(profiles.serum.extensions.identity_boundary).toMatch(/OpenBook.*successor.*not a continuation/i);
    expect(profiles.serum.analysis.sections.why_this_outcome.body)
      .toMatch(/more than 95% of supply/i);
  });

  it('preserves legacy rows and sources while replaying idempotently', () => {
    const database = new DatabaseSync(':memory:');
    applyMigrations(database, 82);
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
      WHERE type = 'table' AND name = '_dex_wave_f_profiles_0083'
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

  it('cannot publish any profile before a person reviews its claims', () => {
    for (const entry of document.cases) {
      const value = structuredClone(entry.canonical_profile);
      value.quality.publication_state = 'published';
      expect(validateEntityProfile(value, {
        forPublication: true,
        now: new Date('2026-08-03T19:00:00Z'),
      }).some(({ code }) => code === 'reviewed_support_required'), entry.slug).toBe(true);
    }
  });
});

import { Buffer } from 'node:buffer';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { document, renderMigration } from '../scripts/render-dex-wave-e-migration.mjs';
import {
  ANALYSIS_SECTION_KEYS,
  embeddedCanonicalEntityProfile,
  validateEntityProfile,
} from '../src/lib/entity-profile.js';

const migrationUrl = new URL('../migrations/0081_dex_wave_e_profiles.sql', import.meta.url);
const migration = readFileSync(migrationUrl, 'utf8');
const artifact = JSON.parse(readFileSync(
  new URL('../docs/dex-wave-e-profiles-2026-08-03.json', import.meta.url),
  'utf8',
));
const expectedCases = [
  ['successful_exchanges', 'aerodrome', 'successful_established'],
  ['mid_exchanges', 'balancer', 'operating_declining_after_exploit'],
  ['mid_exchanges', 'bancor', 'operating_with_unresolved_lp_deficits'],
  ['dead_exchanges', 'gmx-v1', 'sunset_after_exploit_with_distribution'],
  ['dead_exchanges', 'mango-markets', 'closed_after_oracle_manipulation_and_regulatory_winddown'],
];
let database;

function applyMigrationsBefore0081(value) {
  const directory = new URL('../migrations/', import.meta.url);
  const files = readdirSync(directory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file) && file < '0081_')
    .sort();
  for (const file of files) value.exec(readFileSync(new URL(file, directory), 'utf8'));
}

function row(table, slug, value = database) {
  return value.prepare(`SELECT * FROM ${table} WHERE slug = ?`).get(slug);
}

function profile(table, slug, value = database) {
  return embeddedCanonicalEntityProfile(row(table, slug, value)?.profile, {
    type: 'dex',
    slug,
  });
}

function d1(value) {
  return {
    prepare(sql) {
      let bindings = [];
      return {
        bind(...items) {
          bindings = items;
          return this;
        },
        async all() {
          return { results: value.prepare(sql).all(...bindings) };
        },
        async first() {
          if (sql.includes('snapshot_cache')) {
            return { data: '{"chains":[]}', updated_at: Date.now() };
          }
          return value.prepare(sql).get(...bindings) ?? null;
        },
      };
    },
  };
}

beforeEach(() => {
  database = new DatabaseSync(':memory:');
  applyMigrationsBefore0081(database);
  database.exec(migration);
});

afterEach(() => database.close());

describe('DEX Wave E normalized profiles', () => {
  it('keeps the research document, renderer and D1-sized migration deterministic', () => {
    expect(artifact).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document.generated_migration).toBe('0081_dex_wave_e_profiles.sql');
    expect(document.cases.map(({ table, slug, canonical_profile: canonical }) => (
      [table, slug, canonical.outcome.label]
    ))).toEqual(expectedCases);

    let inQuote = false;
    let start = 0;
    const statementBytes = [];
    for (let index = 0; index < migration.length; index += 1) {
      if (migration[index] === "'" && migration[index + 1] === "'") {
        index += 1;
      } else if (migration[index] === "'") {
        inQuote = !inQuote;
      } else if (migration[index] === ';' && !inQuote) {
        statementBytes.push(Buffer.byteLength(migration.slice(start, index + 1)));
        start = index + 1;
      }
    }
    expect(Math.max(...statementBytes)).toBeLessThanOrEqual(95000);
  });

  it('publishes five deep ten-section reports with explicit atomic claims', () => {
    for (const [table, slug] of expectedCases) {
      const canonical = profile(table, slug);
      expect(canonical, slug).not.toBeNull();
      expect(validateEntityProfile(canonical), slug).toEqual([]);
      expect(canonical.quality).toMatchObject({
        publication_state: 'review',
        completeness_pct: 100,
      });
      expect(Object.keys(canonical.analysis.sections)).toEqual(ANALYSIS_SECTION_KEYS);
      expect(canonical.sources.length, `${slug}:sources`).toBeGreaterThanOrEqual(10);
      expect(canonical.sources.some(({ role }) => role === 'primary'), `${slug}:primary`).toBe(true);
      expect(canonical.sources.some(({ role }) => role === 'independent'), `${slug}:independent`).toBe(true);
      expect(new Set(canonical.sources.map(({ url }) => url)).size).toBe(canonical.sources.length);
      const citedSourceIds = new Set(canonical.claims.flatMap(({ source_ids: ids }) => ids));
      expect(canonical.sources.every(({ id }) => citedSourceIds.has(id)), `${slug}:source use`)
        .toBe(true);
      expect(canonical.sources.every(({ checked_at: checkedAt, access_state: state }) => (
        checkedAt === '2026-08-03T18:31:22Z' && state === 'reachable'
      ))).toBe(true);

      const paths = canonical.claims.map(({ field_path: fieldPath }) => fieldPath);
      expect(new Set(paths).size, `${slug}:unique claim paths`).toBe(paths.length);
      expect(canonical.claims.every(({ assertion, review }) => (
        assertion?.trim()
        && review.state === 'pending'
        && review.reviewer === null
        && review.reviewed_at === null
      )), `${slug}:claim contract`).toBe(true);

      for (const [sectionKey, sectionValue] of Object.entries(canonical.analysis.sections)) {
        expect(sectionValue.body.trim(), `${slug}.${sectionKey}:substantive`).not.toMatch(
          /^(unknown|unresolved|pending|not (?:yet )?(?:known|published|available)|n\/?a|—)$/i,
        );
        expect(sectionValue.body, `${slug}.${sectionKey}:public copy`).not.toMatch(
          /\[object Object\]|"source_ids"|"evidence_locator"|"publication_state"|causal map|evidence contract|source registry/i,
        );
        expect(sectionValue.claim_ids.length, `${slug}.${sectionKey}:atomic count`)
          .toBeGreaterThanOrEqual(2);
        expect(sectionValue.claim_ids.length, `${slug}.${sectionKey}:bounded atomic count`)
          .toBeLessThanOrEqual(4);
        for (const claimId of sectionValue.claim_ids) {
          const sectionClaim = canonical.claims.find(({ id }) => id === claimId);
          expect(sectionClaim, claimId).toBeTruthy();
          expect(sectionClaim.assertion.length, `${slug}.${sectionKey}:${claimId}:concise`)
            .toBeLessThanOrEqual(240);
          const match = sectionClaim.field_path.match(
            /^extensions\.atomic_assertions\.([a-z_]+)\.([a-z0-9-]+)$/,
          );
          expect(match, `${slug}:${sectionClaim.field_path}`).not.toBeNull();
          expect(match[1]).toBe(sectionKey);
          expect(canonical.extensions.atomic_assertions[match[1]][match[2]])
            .toBe(sectionClaim.assertion);
        }
      }
    }
  });

  it('keeps current observations comparable without inventing live activity', () => {
    const aerodrome = profile('successful_exchanges', 'aerodrome');
    const balancer = profile('mid_exchanges', 'balancer');
    const bancor = profile('mid_exchanges', 'bancor');
    const gmx = profile('dead_exchanges', 'gmx-v1');
    const mango = profile('dead_exchanges', 'mango-markets');

    expect(aerodrome.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'spot_volume', value: 302291376 }),
      expect.objectContaining({ dimension: 'tvl', value: 266431861 }),
    ]));
    expect(balancer.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'spot_volume', value: 334158136 }),
      expect.objectContaining({ dimension: 'exploit_loss', value: 94800000 }),
    ]));
    expect(bancor.metrics.find(({ dimension }) => dimension === 'tvl')).toMatchObject({
      value: 23998429,
      quality_flags: expect.arrayContaining(['withdrawal_impairment_possible']),
    });
    expect(gmx.metrics.some(({ dimension }) => dimension === 'spot_volume')).toBe(false);
    expect(mango.metrics.some(({ dimension }) => dimension === 'spot_volume')).toBe(false);
    expect(mango.metrics.find(({ dimension }) => dimension === 'tvl')).toMatchObject({
      value: 14943,
      quality_flags: expect.arrayContaining(['not_operating_liquidity']),
    });
  });

  it('never conflates GMX V1 with V2 or Mango closure with full recovery', () => {
    const gmx = profile('dead_exchanges', 'gmx-v1');
    const mango = profile('dead_exchanges', 'mango-markets');
    const gmxText = JSON.stringify(gmx);
    const mangoText = JSON.stringify(mango);
    expect(gmx.identity).toMatchObject({ id: 'dex:gmx-v1', name: 'GMX V1 (GLP)' });
    expect(gmx.status.operating_state).toBe('sunset');
    expect(gmxText).toMatch(/V2 remained operating and unaffected|V2 remained unaffected/i);
    expect(gmxText).toMatch(/does not classify GMX V2|separately/i);
    expect(mango.status.operating_state).toBe('closed');
    expect(mangoText).toMatch(/approximately \$67 million.*returned/i);
    expect(mangoText).toMatch(/about \$47 million.*retained|substantial retained amount/i);
    expect(mangoText).toMatch(/residual.*not.*operating|not customer-ready liquidity/i);
    expect(mangoText).toMatch(/vacated.*commodities convictions.*wire-fraud acquittal/i);
    expect(mangoText).not.toMatch(/current criminal conviction/i);
  });

  it('preserves exact pre-0081 records, leaves neighbors untouched and replays idempotently', () => {
    const value = new DatabaseSync(':memory:');
    try {
      applyMigrationsBefore0081(value);
      const before = expectedCases.map(([table, slug]) => row(table, slug, value));
      const neighbors = [
        row('successful_exchanges', 'pancakeswap', value),
        row('mid_exchanges', 'thorswap', value),
        row('dead_exchanges', 'crema-finance', value),
      ];
      value.exec(migration);
      const after = expectedCases.map(([table, slug]) => row(table, slug, value));
      for (let index = 0; index < after.length; index += 1) {
        const stored = JSON.parse(after[index].profile);
        expect(stored.legacy_preservation.previous_profile)
          .toEqual(JSON.parse(before[index].profile));
        expect(stored.legacy_preservation.previous_sources)
          .toEqual(JSON.parse(before[index].sources));
        expect(stored.legacy_preservation.preserved_at).toBe('2026-08-03');
        expect(stored.canonical_profile.identity.slug).toBe(expectedCases[index][1]);
      }
      expect(row('successful_exchanges', 'pancakeswap', value)).toEqual(neighbors[0]);
      expect(row('mid_exchanges', 'thorswap', value)).toEqual(neighbors[1]);
      expect(row('dead_exchanges', 'crema-finance', value)).toEqual(neighbors[2]);
      value.exec(migration);
      expect(expectedCases.map(([table, slug]) => row(table, slug, value))).toEqual(after);
      expect(value.prepare(`
        SELECT COUNT(*) AS count FROM sqlite_master
        WHERE type = 'table' AND name = '_dex_wave_e_0081'
      `).get().count).toBe(0);
    } finally {
      value.close();
    }
  });

  it('feeds every profile through the public DEX API used by the UI', async () => {
    vi.resetModules();
    const worker = (await import('../src/worker.js')).default;
    for (const [, slug, outcome] of expectedCases) {
      const response = await worker.fetch(
        new Request(`http://localhost/api/profile/dex/${slug}`),
        { DB: d1(database) },
        { waitUntil() {}, passThroughOnException() {} },
      );
      const body = await response.json();
      expect(response.status, slug).toBe(200);
      expect(body).toMatchObject({
        schema: 'chaindump-entity-profile',
        identity: { id: `dex:${slug}`, type: 'dex', slug },
        outcome: { label: outcome },
        freshness: { state: 'current' },
        quality: { publication_state: 'review', completeness_pct: 100 },
      });
      expect(Object.keys(body.analysis.sections)).toEqual(ANALYSIS_SECTION_KEYS);
      expect(body.claims.every(({ review }) => review.state === 'pending')).toBe(true);
      expect(body.extensions.category_data ?? {}).not.toHaveProperty('canonical_profile');
      expect(body.extensions.category_data ?? {}).not.toHaveProperty('legacy_preservation');
    }
  });

  it('blocks publication until a person reviews supporting claims', () => {
    for (const { canonical_profile: sourceProfile, slug } of document.cases) {
      const canonical = structuredClone(sourceProfile);
      canonical.quality.publication_state = 'published';
      const errors = validateEntityProfile(canonical, {
        forPublication: true,
        now: new Date('2026-08-03T19:00:00Z'),
      });
      expect(errors.some(({ code }) => code === 'reviewed_support_required'), slug).toBe(true);
    }
  });
});

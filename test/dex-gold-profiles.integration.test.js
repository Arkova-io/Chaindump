import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { document, renderMigration } from '../scripts/render-dex-gold-wave-migration.mjs';
import {
  ANALYSIS_SECTION_KEYS,
  embeddedCanonicalEntityProfile,
  validateEntityProfile,
} from '../src/lib/entity-profile.js';

const migration = readFileSync(new URL('../migrations/0077_dex_gold_profiles.sql', import.meta.url), 'utf8');
const researchDocument = JSON.parse(readFileSync(
  new URL('../docs/dex-gold-profiles-2026-08-03.json', import.meta.url),
  'utf8',
));

function applyMigrations(database) {
  const files = readdirSync(new URL('../migrations/', import.meta.url))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
  for (const file of files) {
    database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
}

function getRow(database, table, slug) {
  const typeColumn = table === 'successful_exchanges' ? 'type' : 'kind';
  return database.prepare(`
    SELECT slug, name, profile
    FROM ${table}
    WHERE ${typeColumn} = 'dex' AND slug = ?
  `).get(slug);
}

function getProfile(database, table, slug) {
  return embeddedCanonicalEntityProfile(getRow(database, table, slug)?.profile, {
    type: 'dex',
    slug,
  });
}

let database;

beforeEach(() => {
  database = new DatabaseSync(':memory:');
  applyMigrations(database);
});

afterEach(() => database.close());

describe('five contrasting DEX gold profiles', () => {
  it('keeps the research document and generated migration deterministic', () => {
    expect(researchDocument).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document.generated_migration).toBe('0077_dex_gold_profiles.sql');
    expect(document.cases.map(({ slug }) => slug)).toEqual([
      'pancakeswap', 'curve-finance', 'jupiter', 'dydx', 'thorswap',
    ]);
  });

  it('ships ten long-form sections with pending, source-linked claims for every case', () => {
    for (const { table, slug } of document.cases) {
      const profile = getProfile(database, table, slug);
      expect(profile, slug).not.toBeNull();
      expect(validateEntityProfile(profile), slug).toEqual([]);
      expect(profile.quality).toMatchObject({
        publication_state: 'review',
        completeness_pct: 100,
      });
      expect(profile.sources.length, slug).toBeGreaterThanOrEqual(12);
      expect(profile.sources.every((source) => (
        source.url.startsWith('https://')
        && source.access_state === 'reachable'
        && source.checked_at.startsWith('2026-08-03T')
        && ['primary', 'independent'].includes(source.role)
      )), `${slug} source contract`).toBe(true);
      expect(new Set(profile.sources.map(({ url }) => url)).size, `${slug} unique sources`)
        .toBe(profile.sources.length);
      expect(Object.keys(profile.analysis.sections), slug).toEqual(ANALYSIS_SECTION_KEYS);
      expect(profile.claims.every(({ review }) => (
        review.state === 'pending'
        && review.reviewer === null
        && review.reviewed_at === null
      )), slug).toBe(true);

      for (const [key, section] of Object.entries(profile.analysis.sections)) {
        expect(section.body.length, `${slug}.${key}`).toBeGreaterThan(700);
        expect(section.body, `${slug}.${key}`).not.toMatch(
          /\[object Object\]|"source_ids"|"evidence_locator"|"publication_state"/,
        );
        const claim = profile.claims.find(({ id }) => id === section.claim_ids[0]);
        expect(claim, `${slug}.${key} claim`).toMatchObject({
          field_path: `analysis.sections.${key}.body`,
          support_direction: 'supports',
          review: { state: 'pending', reviewer: null, reviewed_at: null },
        });
        expect(claim.source_ids.length, `${slug}.${key} sources`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps observed facts, adapter scope and causal inference inside explicit boundaries', () => {
    const pancake = getProfile(database, 'successful_exchanges', 'pancakeswap');
    const curve = getProfile(database, 'successful_exchanges', 'curve-finance');
    const jupiter = getProfile(database, 'successful_exchanges', 'jupiter');
    const dydx = getProfile(database, 'successful_exchanges', 'dydx');
    const thor = getProfile(database, 'mid_exchanges', 'thorswap');

    expect(pancake.extensions.methodology_notes.join(' ')).toContain(
      'broad PancakeSwap DEX adapter and narrower PancakeSwap AMM adapter',
    );
    expect(curve.analysis.sections.risks_and_unknowns.body).toContain(
      'compiler infrastructure can defeat intended protections',
    );
    expect(jupiter.metrics.find(({ id }) => id.includes('routed-volume-24h'))).toMatchObject({
      quality_flags: ['routed_volume_overlap', 'not_owned_liquidity', 'not_unique_users'],
    });
    expect(dydx.metrics.find(({ dimension }) => dimension === 'derivatives_notional'))
      .toMatchObject({
        method: 'Sum of volume24H across dYdX v4 perpetualMarkets indexer rows',
        quality_flags: ['notional_not_revenue', 'incentive_sensitive', 'not_unique_users'],
      });
    expect(thor.metrics.find(({ dimension }) => dimension === 'tvl')).toMatchObject({
      value: 0,
      quality_flags: ['external_liquidity_excluded', 'tvl_not_market_depth'],
    });
    expect(thor.analysis.sections.what_it_is.body).toContain(
      'not the THORChain blockchain itself',
    );
  });

  it('adds THORSwap as its own middling route without overwriting THORChain', () => {
    const thorswapRow = getRow(database, 'mid_exchanges', 'thorswap');
    const thorchainRow = getRow(database, 'successful_exchanges', 'thorchain');
    expect(thorswapRow.name).toBe('THORSwap');
    expect(thorchainRow.name).toBe('THORChain');
    expect(JSON.parse(thorswapRow.profile).canonical_profile.identity.id).toBe('dex:thorswap');
    expect(JSON.parse(thorchainRow.profile).canonical_profile?.identity?.id).not.toBe('dex:thorswap');
    expect(database.prepare(`
      SELECT lifecycle, product_cohort, metric_type, quality_label
      FROM exchange_case_features
      WHERE kind = 'dex' AND slug = 'thorswap'
    `).get()).toEqual({
      lifecycle: 'mid',
      product_cohort: 'cross_chain_aggregator',
      metric_type: 'aggregator_routed_volume_24h',
      quality_label: 'verified',
    });
  });

  it('replays idempotently while preserving the five canonical identities', () => {
    const before = document.cases.map(({ table, slug }) => getRow(database, table, slug));
    database.exec(migration);
    const after = document.cases.map(({ table, slug }) => getRow(database, table, slug));
    expect(after).toEqual(before);
    expect(database.prepare(`
      SELECT COUNT(*) AS count
      FROM sqlite_master
      WHERE type = 'table' AND name = '_dex_gold_profiles_0077'
    `).get().count).toBe(0);
  });

  it('cannot publish the profiles while their supporting claims await human review', () => {
    for (const { canonical_profile: sourceProfile, slug } of document.cases) {
      const profile = structuredClone(sourceProfile);
      profile.quality.publication_state = 'published';
      const errors = validateEntityProfile(profile, {
        forPublication: true,
        now: new Date('2026-08-03T18:00:00Z'),
      });
      expect(errors.some(({ code }) => code === 'reviewed_support_required'), slug).toBe(true);
    }
  });
});

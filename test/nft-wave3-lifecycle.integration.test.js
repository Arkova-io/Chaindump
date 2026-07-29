import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { validateForensicFreshness } from '../src/lib/evidence-freshness.mjs';
import { validateFieldCitedNft } from '../src/lib/nft-citation.mjs';
import { renderNftMigration } from '../scripts/render-nft-seed-migration.mjs';

const document = JSON.parse(readFileSync(
  new URL('../docs/nft-wave3-2026-07-29.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0037_nft_wave3_lifecycle.sql', import.meta.url),
  'utf8',
);
const expectedSlugs = [
  'cryptopunks',
  'bored-ape-yacht-club',
  'moonbirds',
  'onchainmonkey-genesis',
  'gamestop-nft-marketplace',
];
const previousDeepDossiers = new Set([
  'azuki',
  'quantum-cats',
  'pudgy-penguins',
  'art-blocks-generative-art',
]);

function createFixture() {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE nft_collections (
      slug TEXT PRIMARY KEY,
      name TEXT,
      chain TEXT,
      category TEXT,
      status TEXT,
      profile TEXT,
      sources TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  return database;
}

function snapshot(database) {
  return database.prepare(`
    SELECT slug, name, chain, category, status, profile, sources, updated_at
    FROM nft_collections
    ORDER BY slug
  `).all();
}

function collectSourceIds(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectSourceIds(item, found);
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value.source_ids)) found.push(...value.source_ids);
  for (const child of Object.values(value)) collectSourceIds(child, found);
  return found;
}

let database;

afterEach(() => {
  database?.close();
  database = undefined;
});

describe('NFT and Ordinals Wave-3 lifecycle dossiers', () => {
  it('publishes five new, diverse dossiers through both citation and freshness gates', () => {
    expect(document.schema).toBe('chaindump-nft-field-v1');
    expect(document.research_as_of).toBe('2026-07-29');
    expect(document.dossiers.map(({ slug }) => slug)).toEqual(expectedSlugs);
    expect(new Set(expectedSlugs).size).toBe(5);
    expect(expectedSlugs.some((slug) => previousDeepDossiers.has(slug))).toBe(false);
    expect(document.dossiers.map(({ status }) => status)).toEqual([
      'thriving',
      'thriving',
      'middling',
      'thriving',
      'dead',
    ]);
    expect(document.dossiers.some(({ category }) => category.includes('ordinals'))).toBe(true);
    expect(document.dossiers.some(({ category }) => category.includes('platform'))).toBe(true);

    for (const dossier of document.dossiers) {
      expect(validateFieldCitedNft(dossier.profile, dossier.sources), dossier.slug)
        .toEqual({ valid: true, errors: [] });
      expect(validateForensicFreshness(dossier), dossier.slug)
        .toEqual({ valid: true, errors: [] });
      expect(dossier.profile.evidence_policy.last_verified_at).toBe('2026-07-29');
      expect(dossier.profile.evidence_policy.next_review_at).toMatch(/^202[67]-\d{2}-\d{2}$/);
    }
  });

  it('meets the lifecycle-depth contract and resolves every analytical source reference', () => {
    const requiredKeys = [
      'team',
      'chronology',
      'market_holder_boundaries',
      'products_and_value_capture',
      'why',
      'strategic_choices',
      'counterfactual',
      'risks',
      'unknowns',
      'review',
    ];

    for (const dossier of document.dossiers) {
      for (const key of requiredKeys) {
        expect(dossier.profile[key], `${dossier.slug}.${key}`).toBeTruthy();
      }
      expect(dossier.profile.chronology.length, dossier.slug).toBeGreaterThanOrEqual(3);
      expect(dossier.profile.strategic_choices.length, dossier.slug).toBeGreaterThanOrEqual(3);
      expect(dossier.profile.risks.length, dossier.slug).toBeGreaterThanOrEqual(3);
      expect(dossier.profile.unknowns.length, dossier.slug).toBeGreaterThanOrEqual(3);
      expect(dossier.profile.market_holder_boundaries.market, dossier.slug)
        .toMatch(/No current|No lifetime/);
      expect(dossier.profile.market_holder_boundaries.holders, dossier.slug)
        .toMatch(/No current|not a single NFT collection|not unique wallets/i);

      const sourceIds = new Set(dossier.sources.map(({ id }) => id));
      expect(sourceIds.size, dossier.slug).toBe(dossier.sources.length);
      for (const sourceId of collectSourceIds(dossier.profile)) {
        expect(sourceIds.has(sourceId), `${dossier.slug} references ${sourceId}`).toBe(true);
      }
      for (const source of dossier.sources) {
        expect(source.url, `${dossier.slug}:${source.id}`).toMatch(/^https:\/\//);
        expect(source.last_verified_at, `${dossier.slug}:${source.id}`).toBe('2026-07-29');
      }
    }
  });

  it('keeps mint, market, holder and platform boundaries explicit', () => {
    const bySlug = Object.fromEntries(document.dossiers.map((dossier) => [dossier.slug, dossier]));
    expect(bySlug.cryptopunks.profile.mint_price).toContain('Free to claim');
    expect(bySlug['bored-ape-yacht-club'].profile.mint_price).toContain('0.08 ETH');
    expect(bySlug.moonbirds.profile.mint_price).toContain('Unknown');
    expect(bySlug['onchainmonkey-genesis'].profile.supply).toContain('8,425');
    expect(bySlug['onchainmonkey-genesis'].profile.supply).toContain('not holder counts');
    expect(bySlug['gamestop-nft-marketplace'].profile.supply).toContain('Not applicable');
    expect(bySlug['gamestop-nft-marketplace'].profile.business).toContain('not material');
    expect(bySlug['gamestop-nft-marketplace'].profile.analysis).toContain('single cause');

    for (const dossier of document.dossiers) {
      expect(dossier.profile.analysis, dossier.slug).toMatch(/does not|insufficient|withheld|not establish|not infer/i);
      expect(dossier.profile.evidence.map(({ field }) => field)).toEqual([
        'launch',
        'supply_or_mint',
        'mint_price',
        'lifecycle_status',
        'community_history',
        'founder_engagement',
        'benefits',
        'business',
        'analysis',
      ]);
    }
  });

  it('commits the canonical generator output and replays idempotently', () => {
    expect(migration).toBe(renderNftMigration(document));
    database = createFixture();
    database.exec(`
      INSERT INTO nft_collections
        (slug, name, chain, category, status, profile, sources, updated_at)
      VALUES
        ('untouched-existing', 'Untouched', 'ethereum', 'fixture', 'unknown', '{}', '[]', 'old');
    `);

    database.exec(migration);
    const afterFirstRun = snapshot(database);
    expect(afterFirstRun).toHaveLength(6);
    expect(afterFirstRun.find(({ slug }) => slug === 'untouched-existing')).toMatchObject({
      name: 'Untouched',
      updated_at: 'old',
    });
    for (const dossier of document.dossiers) {
      const row = afterFirstRun.find(({ slug }) => slug === dossier.slug);
      expect(row).toMatchObject({
        name: dossier.name,
        chain: dossier.chain,
        category: dossier.category,
        status: dossier.status,
        updated_at: '2026-07-29',
      });
      expect(JSON.parse(row.profile)).toEqual(dossier.profile);
      expect(JSON.parse(row.sources)).toEqual(dossier.sources);
    }

    database.exec(migration);
    expect(snapshot(database)).toEqual(afterFirstRun);
  });
});

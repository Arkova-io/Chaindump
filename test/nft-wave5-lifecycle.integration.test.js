import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { validateForensicFreshness } from '../src/lib/evidence-freshness.mjs';
import { validateFieldCitedNft } from '../src/lib/nft-citation.mjs';
import { renderNftMigration } from '../scripts/render-nft-seed-migration.mjs';

const document = JSON.parse(readFileSync(
  new URL('../docs/nft-wave5-2026-07-29.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0043_nft_wave5_lifecycle.sql', import.meta.url),
  'utf8',
);
const expectedSlugs = [
  'ethereum-name-service',
  'cryptokitties',
  'the-sandbox-land',
  'pizza-ninjas',
  'nifty-gateway',
];
const previousCases = new Set([
  'art-blocks-generative-art', 'axie-origin-axies', 'azuki', 'bitcoin-frogs',
  'bitcoin-puppets', 'bored-ape-yacht-club', 'clonex', 'cryptopunks', 'degods',
  'doodles', 'f1-delta-time', 'funko-digital-pop', 'gamestop-nft-marketplace',
  'gods-unchained-cards', 'mad-lads', 'metroverse', 'milady-maker', 'moonbirds',
  'nba-top-shot', 'nodemonkes', 'nouns-dao', 'okay-bears',
  'onchainmonkey-genesis', 'ordinal-maxi-biz', 'pudgy-penguins', 'quantum-cats',
  'reddit-collectible-avatars', 'runestone', 'solana-monkey-business',
  'sorare-cards', 'tezzardz', 'twelvefold', 'y00ts', 'autoglyphs', 'meebits',
  'taproot-wizards', 'decentraland-land', 'kraken-nft-marketplace',
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
    FROM nft_collections ORDER BY slug
  `).all();
}

function collectSourceIds(value, found = []) {
  if (Array.isArray(value)) {
    for (const child of value) collectSourceIds(child, found);
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

describe('NFT and Ordinals Wave-5 lifecycle dossiers', () => {
  it('publishes five non-overlapping lifecycle cases through citation and freshness gates', () => {
    expect(document.schema).toBe('chaindump-nft-field-v1');
    expect(document.research_as_of).toBe('2026-07-29');
    expect(document.dossiers.map(({ slug }) => slug)).toEqual(expectedSlugs);
    expect(expectedSlugs.every((slug) => !previousCases.has(slug))).toBe(true);
    expect(document.dossiers.map(({ status }) => status)).toEqual([
      'thriving', 'thriving', 'thriving', 'middling', 'dead',
    ]);
    expect(new Set(document.dossiers.map(({ category }) => category)).size).toBe(5);

    for (const dossier of document.dossiers) {
      expect(validateFieldCitedNft(dossier.profile, dossier.sources), dossier.slug)
        .toEqual({ valid: true, errors: [] });
      expect(validateForensicFreshness(dossier), dossier.slug)
        .toEqual({ valid: true, errors: [] });
      expect(dossier.profile.evidence_policy.last_verified_at).toBe('2026-07-29');
      expect(dossier.sources.every(({ last_verified_at }) => last_verified_at === '2026-07-29'))
        .toBe(true);
    }
  });

  it('enforces full lifecycle depth and resolves every analytical source reference', () => {
    const required = [
      'team', 'chronology', 'market_holder_boundaries', 'products_and_value_capture',
      'why', 'strategic_choices', 'counterfactual', 'risks', 'unknowns', 'review',
    ];

    for (const dossier of document.dossiers) {
      for (const key of required) expect(dossier.profile[key], `${dossier.slug}.${key}`).toBeTruthy();
      expect(dossier.profile.chronology.length, dossier.slug).toBeGreaterThanOrEqual(4);
      expect(dossier.profile.strategic_choices.length, dossier.slug).toBeGreaterThanOrEqual(3);
      expect(dossier.profile.risks.length, dossier.slug).toBeGreaterThanOrEqual(3);
      expect(dossier.profile.unknowns.length, dossier.slug).toBeGreaterThanOrEqual(4);
      expect(dossier.profile.analysis, dossier.slug)
        .toMatch(/does not|not establish|withheld|No current|not a claim/i);

      const sourceIds = new Set(dossier.sources.map(({ id }) => id));
      expect(sourceIds.size, dossier.slug).toBe(dossier.sources.length);
      for (const id of collectSourceIds(dossier.profile)) {
        expect(sourceIds.has(id), `${dossier.slug} references unknown ${id}`).toBe(true);
      }
      for (const source of dossier.sources) {
        expect(source.url, `${dossier.slug}:${source.id}`).toMatch(/^https:\/\//);
      }
    }
  });

  it('preserves supply, mint, lifecycle and scope boundaries', () => {
    const cases = Object.fromEntries(document.dossiers.map((entry) => [entry.slug, entry]));
    expect(cases['ethereum-name-service'].profile.supply).toContain('No fixed collection cap');
    expect(cases['ethereum-name-service'].profile.mint_price).toContain('recurring pricing');
    expect(cases.cryptokitties.profile.supply).toContain('50,000');
    expect(cases.cryptokitties.profile.supply).toContain('Dynamic breedable supply');
    expect(cases['the-sandbox-land'].profile.supply).toContain('166,464');
    expect(cases['the-sandbox-land'].profile.mint_price).toContain('not historical averages');
    expect(cases['pizza-ninjas'].profile.supply).toContain('1,500 V1');
    expect(cases['pizza-ninjas'].profile.supply).toContain('family-wide total');
    expect(cases['nifty-gateway'].profile.supply).toContain('Not applicable');
    expect(cases['nifty-gateway'].profile.analysis).toContain('February 23, 2026');

    for (const dossier of document.dossiers) {
      expect(dossier.profile.evidence.map(({ field }) => field)).toEqual([
        'launch', 'supply_or_mint', 'mint_price', 'lifecycle_status',
        'community_history', 'founder_engagement', 'benefits', 'business', 'analysis',
      ]);
      expect(dossier.profile.market_holder_boundaries.market).toMatch(/^No current/);
      expect(dossier.profile.market_holder_boundaries.holders)
        .toMatch(/^No current|Not a collection/);
    }
  });

  it('commits exact generator output and replays without duplication or collateral changes', () => {
    expect(migration).toBe(renderNftMigration(document));
    database = createFixture();
    database.exec(`
      INSERT INTO nft_collections
        (slug, name, chain, category, status, profile, sources, updated_at)
      VALUES ('existing-control', 'Existing Control', 'ethereum', 'fixture',
        'unknown', '{"preserved":true}', '[]', 'old');
    `);

    database.exec(migration);
    const first = snapshot(database);
    expect(first).toHaveLength(6);
    expect(first.find(({ slug }) => slug === 'existing-control')).toMatchObject({
      name: 'Existing Control',
      profile: '{"preserved":true}',
      updated_at: 'old',
    });

    for (const dossier of document.dossiers) {
      const row = first.find(({ slug }) => slug === dossier.slug);
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
    expect(snapshot(database)).toEqual(first);
  });
});

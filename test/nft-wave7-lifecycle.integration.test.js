import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';
import { validateForensicFreshness } from '../src/lib/evidence-freshness.mjs';
import { validateFieldCitedNft } from '../src/lib/nft-citation.mjs';
import { renderNftMigration } from '../scripts/render-nft-seed-migration.mjs';

const document = JSON.parse(readFileSync(
  new URL('../docs/nft-wave7-2026-07-29.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0053_nft_wave7_lifecycle.sql', import.meta.url),
  'utf8',
);
const expectedSlugs = [
  'magic-eden-marketplace',
  'gamma-ordinals-platform',
  'rarible-marketplace-protocol',
  'metroverse',
  'nouns-dao',
  'quantum-cats',
  'solana-monkey-business',
];
const newSlugs = expectedSlugs.slice(0, 3);
const previousNftMigrations = [
  '0001_init.sql',
  '0016_nft_field_citation_wave.sql',
  '0019_nft_freshness_wave2.sql',
  '0022_nft_art_blocks_wave.sql',
  '0029_nft_pudgy_penguins_wave.sql',
  '0037_nft_wave3_lifecycle.sql',
  '0040_nft_wave4_lifecycle.sql',
  '0043_nft_wave5_lifecycle.sql',
  '0046_nft_wave6_lifecycle.sql',
];

function sourceResolver(dossier) {
  return Object.fromEntries(dossier.sources.map((source) => [source.id, source]));
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

function snapshot(database) {
  return database.prepare(`
    SELECT slug, name, chain, category, status, profile, sources, updated_at
    FROM nft_collections ORDER BY slug
  `).all();
}

let database;

afterEach(() => {
  database?.close();
  database = undefined;
});

describe('NFT and Ordinals Wave-7 lifecycle dossiers', () => {
  it('publishes three new diverse platforms and closes four freshness gaps', () => {
    expect(document.schema).toBe('chaindump-nft-field-v1');
    expect(document.research_as_of).toBe('2026-07-29');
    expect(document.dossiers.map(({ slug }) => slug)).toEqual(expectedSlugs);
    expect(new Set(document.dossiers.slice(0, 3).map(({ category }) => category)).size).toBe(3);
    expect(document.dossiers.slice(0, 3).map(({ status }) => status)).toEqual([
      'declining', 'thriving', 'thriving',
    ]);

    for (const dossier of document.dossiers) {
      expect(dossier.profile.citation_schema, dossier.slug).toBe('field-v1');
      expect(dossier.profile.evidence_policy.schema, dossier.slug)
        .toBe('forensic-freshness-v1');
      expect(validateFieldCitedNft(dossier.profile, dossier.sources), dossier.slug)
        .toEqual({ valid: true, errors: [] });
      expect(validateForensicFreshness(dossier), dossier.slug)
        .toEqual({ valid: true, errors: [] });
      expect(dossier.profile.evidence_policy.last_verified_at, dossier.slug)
        .toBe('2026-07-29');
      expect(dossier.sources.every(({ last_verified_at }) => last_verified_at === '2026-07-29'))
        .toBe(true);
      expect(dossier.sources.every(({ checked_at }) => checked_at === '2026-07-29'))
        .toBe(true);
      expect(dossier.sources.every(({ evidence_scope }) => Boolean(evidence_scope))).toBe(true);
      expect(dossier.sources.every(({ source_date_kind }) => Boolean(source_date_kind))).toBe(true);
      expect(dossier.sources.every(({ stale }) => typeof stale === 'boolean')).toBe(true);
    }
  });

  it('gives each new case a source-resolving causal contract and explicit boundaries', () => {
    const dossiers = Object.fromEntries(document.dossiers.map((entry) => [entry.slug, entry]));
    const required = [
      'team', 'chronology', 'market_holder_boundaries', 'products_and_value_capture',
      'token_model', 'chain_dependence', 'why', 'strategic_choices', 'counterfactual',
      'risks', 'unknowns', 'review', 'forensic_analysis',
    ];

    for (const slug of newSlugs) {
      const dossier = dossiers[slug];
      for (const key of required) expect(dossier.profile[key], `${slug}.${key}`).toBeTruthy();
      expect(dossier.profile.chronology.length, slug).toBeGreaterThanOrEqual(4);
      expect(dossier.profile.strategic_choices.length, slug).toBeGreaterThanOrEqual(3);
      expect(dossier.profile.risks.length, slug).toBeGreaterThanOrEqual(3);
      expect(dossier.profile.unknowns.length, slug).toBeGreaterThanOrEqual(4);
      expect(dossier.profile.analysis, slug)
        .toMatch(/does not establish|not a claim|not establish/i);

      const sourceIds = new Set(dossier.sources.map(({ id }) => id));
      expect(sourceIds.size, slug).toBe(dossier.sources.length);
      for (const id of collectSourceIds(dossier.profile)) {
        expect(sourceIds.has(id), `${slug} references unknown ${id}`).toBe(true);
      }
      expect(validateForensicAnalysis(dossier.profile.forensic_analysis, {
        resolver: sourceResolver(dossier),
      }), slug).toEqual({
        errors: [],
        warnings: [],
        withheld_sections: [],
      });
    }
  });

  it('keeps lifecycle conclusions scoped to the evidence actually refreshed', () => {
    const cases = Object.fromEntries(document.dossiers.map((entry) => [entry.slug, entry]));

    expect(cases.metroverse.profile.evidence_policy).toMatchObject({
      status_basis: 'terminal_event',
      status_as_of: '2023-03-10',
      next_review_at: '2027-03-10',
    });
    expect(cases.metroverse.sources.find(({ id }) => id === 'metroverse-closure'))
      .toMatchObject({ evidence_scope: 'terminal_outcome', source_date: '2023-03-10' });

    expect(cases['nouns-dao'].profile.evidence_policy.status_basis).toBe('direct_current');
    expect(cases['nouns-dao'].profile.analysis).toContain('not on a secondary-market price claim');

    expect(cases['quantum-cats'].status).toBe('middling');
    expect(cases['quantum-cats'].profile.analysis)
      .toContain('not converted into a liquidity or valuation conclusion');

    expect(cases['solana-monkey-business'].status).toBe('middling');
    expect(cases['solana-monkey-business'].profile.analysis)
      .toContain('no current market-cap, floor, liquidity or holder-retention conclusion');

    expect(cases['magic-eden-marketplace'].profile.analysis)
      .toContain('does not establish insolvency');
    expect(cases['gamma-ordinals-platform'].profile.analysis)
      .toContain('not a claim that Gamma leads the market');
    expect(cases['rarible-marketplace-protocol'].profile.analysis)
      .toContain('does not establish market leadership');
  });

  it('commits exact generator output and moves a fresh corpus replay from 48 to 51', () => {
    expect(migration).toBe(renderNftMigration(document));
    database = new DatabaseSync(':memory:');
    for (const filename of previousNftMigrations) {
      database.exec(readFileSync(new URL(`../migrations/${filename}`, import.meta.url), 'utf8'));
    }

    expect(database.prepare('SELECT COUNT(*) AS count FROM nft_collections').get().count).toBe(48);
    const before = snapshot(database);
    database.exec(migration);
    const first = snapshot(database);

    expect(first).toHaveLength(51);
    expect(first.filter(({ slug }) => newSlugs.includes(slug))).toHaveLength(3);
    expect(first.filter(({ slug }) => expectedSlugs.includes(slug))).toHaveLength(7);
    expect(first.filter(({ slug }) => !expectedSlugs.includes(slug)))
      .toEqual(before.filter(({ slug }) => !expectedSlugs.includes(slug)));

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

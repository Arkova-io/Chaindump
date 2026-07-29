import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';
import { validateForensicFreshness } from '../src/lib/evidence-freshness.mjs';
import { validateFieldCitedNft } from '../src/lib/nft-citation.mjs';
import { renderNftMigration } from '../scripts/render-nft-seed-migration.mjs';

const document = JSON.parse(readFileSync(
  new URL('../docs/nft-wave8-legacy-completion-2026-07-29.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0055_nft_legacy_completion.sql', import.meta.url),
  'utf8',
);
const expectedSlugs = [
  'bitcoin-puppets',
  'mad-lads',
  'nodemonkes',
  'okay-bears',
  'ordinal-maxi-biz',
  'runestone',
];
const replayMigrations = [
  '0001_init.sql',
  '0016_nft_field_citation_wave.sql',
  '0019_nft_freshness_wave2.sql',
  '0022_nft_art_blocks_wave.sql',
  '0029_nft_pudgy_penguins_wave.sql',
  '0037_nft_wave3_lifecycle.sql',
  '0040_nft_wave4_lifecycle.sql',
  '0043_nft_wave5_lifecycle.sql',
  '0046_nft_wave6_lifecycle.sql',
  '0053_nft_wave7_lifecycle.sql',
  '0054_nft_legacy_depth_refresh.sql',
];

function profile(row) {
  return JSON.parse(row.profile);
}

function legacyRows(database) {
  return database.prepare('SELECT slug, profile FROM nft_collections ORDER BY slug')
    .all()
    .filter((row) => {
      const parsed = profile(row);
      return parsed.citation_schema !== 'field-v1'
        || parsed.evidence_policy?.schema !== 'forensic-freshness-v1';
    });
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

describe('NFT legacy completion wave', () => {
  it('upgrades the exact final six legacy records through every evidence gate', () => {
    expect(document.schema).toBe('chaindump-nft-field-v1');
    expect(document.research_as_of).toBe('2026-07-29');
    expect(document.dossiers.map(({ slug }) => slug)).toEqual(expectedSlugs);

    for (const dossier of document.dossiers) {
      expect(validateFieldCitedNft(dossier.profile, dossier.sources), dossier.slug)
        .toEqual({ valid: true, errors: [] });
      expect(validateForensicFreshness(dossier), dossier.slug)
        .toEqual({ valid: true, errors: [] });
      expect(validateForensicAnalysis(dossier.profile.forensic_analysis, {
        resolver: Object.fromEntries(dossier.sources.map((source) => [source.id, source])),
      }), dossier.slug).toEqual({
        errors: [],
        warnings: [],
        withheld_sections: [],
      });
      expect(dossier.sources.every(({ checked_at }) => checked_at === '2026-07-29'))
        .toBe(true);
      expect(dossier.sources.every(({ last_verified_at }) => last_verified_at === '2026-07-29'))
        .toBe(true);
    }
  });

  it('preserves narrative depth and exposes causal, token, chain and review boundaries', () => {
    const required = [
      'team', 'chronology', 'market_holder_boundaries', 'products_and_value_capture',
      'token_model', 'chain_dependence', 'why', 'strategic_choices', 'counterfactual',
      'risks', 'watch', 'unknowns', 'review', 'forensic_analysis',
    ];

    for (const dossier of document.dossiers) {
      for (const key of required) expect(dossier.profile[key], `${dossier.slug}.${key}`).toBeTruthy();
      expect(dossier.profile.chronology.length, dossier.slug).toBeGreaterThanOrEqual(4);
      expect(dossier.profile.strategic_choices.length, dossier.slug).toBeGreaterThanOrEqual(3);
      expect(dossier.profile.risks.length, dossier.slug).toBeGreaterThanOrEqual(3);
      expect(dossier.profile.watch.length, dossier.slug).toBeGreaterThanOrEqual(2);
      expect(dossier.profile.unknowns.length, dossier.slug).toBeGreaterThanOrEqual(4);
      expect(dossier.profile.analysis, dossier.slug)
        .toMatch(/does not|not establish|not convert|unverified|withheld|unproven/i);
    }

    const cases = Object.fromEntries(document.dossiers.map((entry) => [entry.slug, entry]));
    expect(cases['ordinal-maxi-biz']).toMatchObject({ status: 'unknown' });
    expect(cases['ordinal-maxi-biz'].profile.evidence_policy).toMatchObject({
      status_basis: 'withheld',
      stale: true,
    });
    expect(cases['ordinal-maxi-biz'].profile.supply)
      .toContain("5,141 core one-of-one OMBs");
    expect(cases['ordinal-maxi-biz'].profile.supply)
      .toContain('9,000 items');
    expect(cases['mad-lads'].profile.analysis)
      .toContain('does not establish current floor');
    expect(cases['okay-bears'].profile.analysis)
      .toContain('does not establish that it restored NFT market success');
  });

  it('commits exact generator output, replays idempotently and leaves zero legacy rows', () => {
    expect(migration).toBe(renderNftMigration(document));
    database = new DatabaseSync(':memory:');
    for (const filename of replayMigrations) {
      database.exec(readFileSync(new URL(`../migrations/${filename}`, import.meta.url), 'utf8'));
    }

    expect(database.prepare('SELECT COUNT(*) AS count FROM nft_collections').get().count).toBe(51);
    expect(legacyRows(database).map(({ slug }) => slug)).toEqual(expectedSlugs);

    database.exec(migration);
    const first = snapshot(database);
    expect(first).toHaveLength(51);
    expect(legacyRows(database)).toEqual([]);

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

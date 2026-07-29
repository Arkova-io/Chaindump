import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';
import { validateForensicFreshness } from '../src/lib/evidence-freshness.mjs';
import { validateFieldCitedNft } from '../src/lib/nft-citation.mjs';
import {
  renderNftLegacyDepthMigration,
} from '../scripts/render-nft-legacy-depth-migration.mjs';

const document = JSON.parse(readFileSync(
  new URL('../docs/nft-legacy-depth-wave-2026-07-29.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0054_nft_legacy_depth_refresh.sql', import.meta.url),
  'utf8',
);
const expectedSlugs = [
  'azuki',
  'clonex',
  'doodles',
  'milady-maker',
  'degods',
  'y00ts',
];
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
  '0053_nft_wave7_lifecycle.sql',
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
  if (Array.isArray(value.source_refs)) found.push(...value.source_refs);
  for (const child of Object.values(value)) collectSourceIds(child, found);
  return found;
}

function applyPreviousNftMigrations(database) {
  for (const filename of previousNftMigrations) {
    database.exec(readFileSync(new URL(`../migrations/${filename}`, import.meta.url), 'utf8'));
  }
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

describe('legacy NFT depth and freshness wave', () => {
  it('publishes the intended six cases with current lifecycle and causal contracts', () => {
    expect(document.schema).toBe('chaindump-nft-patch-v1');
    expect(document.research_as_of).toBe('2026-07-29');
    expect(document.dossiers.map(({ slug }) => slug)).toEqual(expectedSlugs);
    expect(document.dossiers.map(({ status }) => status)).toEqual([
      'middling',
      'dead',
      'middling',
      'thriving',
      'middling',
      'declining',
    ]);

    const required = [
      'team',
      'chronology',
      'market_holder_boundaries',
      'products_and_value_capture',
      'token_model',
      'chain_dependence',
      'why',
      'strategic_choices',
      'counterfactual',
      'risks',
      'unknowns',
      'review',
      'forensic_analysis',
    ];
    for (const dossier of document.dossiers) {
      const profile = dossier.profile_patch;
      for (const key of required) expect(profile[key], `${dossier.slug}.${key}`).toBeTruthy();
      expect(profile.chronology.length, dossier.slug).toBeGreaterThanOrEqual(4);
      expect(profile.strategic_choices.length, dossier.slug).toBeGreaterThanOrEqual(3);
      expect(profile.risks.length, dossier.slug).toBeGreaterThanOrEqual(3);
      expect(profile.unknowns.length, dossier.slug).toBeGreaterThanOrEqual(4);

      const sourceIds = new Set(dossier.sources.map(({ id }) => id));
      expect(sourceIds.size, dossier.slug).toBe(dossier.sources.length);
      for (const id of collectSourceIds(profile)) {
        expect(sourceIds.has(id), `${dossier.slug} references unknown ${id}`).toBe(true);
      }
      expect(validateFieldCitedNft(profile, dossier.sources), dossier.slug)
        .toEqual({ valid: true, errors: [] });
      expect(validateForensicFreshness({
        status: dossier.status,
        profile,
        sources: dossier.sources,
      }), dossier.slug).toEqual({ valid: true, errors: [] });
      expect(validateForensicAnalysis(profile.forensic_analysis, {
        resolver: sourceResolver(dossier),
      }), dossier.slug).toEqual({
        errors: [],
        warnings: [],
        withheld_sections: [],
      });
    }
  });

  it('corrects legacy overclaims instead of blindly carrying them forward', () => {
    const cases = Object.fromEntries(document.dossiers.map((entry) => [entry.slug, entry]));

    expect(cases.azuki.profile_patch.analysis)
      .toContain('shipped TCG');
    expect(cases.clonex.profile_patch.analysis)
      .toContain('not the token contract or art');
    expect(cases.doodles.profile_patch.analysis)
      .toContain('operating-company health from NFT investment performance');
    expect(cases['milady-maker'].profile_patch.analysis)
      .toContain('not that Milady is a safe investment');
    expect(cases.degods.profile_patch.analysis)
      .toContain('DeGods is not dead');
    expect(cases.y00ts.profile_patch.analysis)
      .toContain('legacy dead claim');
    expect(cases.y00ts.profile_patch.benefits)
      .toContain('Dusties raffle tickets');
    expect(cases.y00ts.profile_patch.token_model.token)
      .toContain('irreversibly burned');
  });

  it('commits exact deterministic generator output', () => {
    expect(migration).toBe(renderNftLegacyDepthMigration(document));
  });

  it('preserves unrelated legacy depth, removes stale snapshots, and is idempotent', () => {
    database = new DatabaseSync(':memory:');
    applyPreviousNftMigrations(database);
    const before = snapshot(database);
    const beforeBySlug = Object.fromEntries(before.map((row) => [row.slug, row]));

    database.exec(migration);
    const first = snapshot(database);
    const firstBySlug = Object.fromEntries(first.map((row) => [row.slug, row]));

    expect(first).toHaveLength(51);
    expect(first.filter(({ slug }) => !expectedSlugs.includes(slug)))
      .toEqual(before.filter(({ slug }) => !expectedSlugs.includes(slug)));
    for (const dossier of document.dossiers) {
      const beforeProfile = JSON.parse(beforeBySlug[dossier.slug].profile);
      const row = firstBySlug[dossier.slug];
      const profile = JSON.parse(row.profile);
      expect(row.status).toBe(dossier.status);
      expect(row.updated_at).toBe('2026-07-29');
      expect(profile.name).toBe(beforeProfile.name);
      expect(profile.marketplace_url).toBe(beforeProfile.marketplace_url);
      expect(profile.citation_schema).toBe('field-v1');
      expect(profile.evidence_policy.schema).toBe('forensic-freshness-v1');
      expect(profile).not.toHaveProperty('floor_current');
      expect(profile).not.toHaveProperty('holder_retention_pct');
      expect(profile).not.toHaveProperty('sources');
      expect(JSON.parse(row.sources)).toEqual(dossier.sources);
      expect(validateFieldCitedNft(profile, dossier.sources), dossier.slug)
        .toEqual({ valid: true, errors: [] });
      expect(validateForensicFreshness({
        status: row.status,
        profile,
        sources: dossier.sources,
      }), dossier.slug).toEqual({ valid: true, errors: [] });
    }

    database.exec(migration);
    expect(snapshot(database)).toEqual(first);
    expect(database.prepare(`
      SELECT COUNT(*) AS count
      FROM sqlite_temp_master
      WHERE type = 'table' AND name = 'nft_legacy_depth_0054'
    `).get().count).toBe(0);
  });

  it('moves the replayed 51-row corpus to 45 field-cited and freshness-gated dossiers', () => {
    database = new DatabaseSync(':memory:');
    applyPreviousNftMigrations(database);
    database.exec(migration);

    const counts = database.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(json_extract(profile, '$.citation_schema') = 'field-v1') AS field_cited,
        SUM(json_extract(profile, '$.evidence_policy.schema') = 'forensic-freshness-v1') AS freshness_gated
      FROM nft_collections
    `).get();
    expect(counts).toEqual({
      total: 51,
      field_cited: 45,
      freshness_gated: 45,
    });
  });
});

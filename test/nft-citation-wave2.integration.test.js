import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderNftMigration } from '../scripts/render-nft-seed-migration.mjs';
import { validateFieldCitedNft } from '../src/lib/nft-citation.mjs';
import { validateForensicFreshness } from '../src/lib/evidence-freshness.mjs';

const document = JSON.parse(readFileSync(new URL('../docs/nft-citation-wave-2-2026-07-29.json', import.meta.url), 'utf8'));
const firstWave = JSON.parse(readFileSync(new URL('../docs/nft-citation-wave-2026-07-29.json', import.meta.url), 'utf8'));
const initialMigration = readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');

function initialNftSlugs(sql) {
  return new Set(
    [...sql.matchAll(/INSERT INTO "nft_collections"[^;]*?VALUES \('([^']+)'/g)]
      .map((match) => match[1]),
  );
}

describe('NFT field-citation research wave 2', () => {
  it('stages ten new, valid dossiers across chains and lifecycle outcomes', () => {
    expect(document.dossiers).toHaveLength(10);
    expect(new Set(document.dossiers.map((dossier) => dossier.chain))).toEqual(new Set([
      'ethereum',
      'wax',
      'polygon',
      'flow',
      'solana',
      'bitcoin-ordinals',
      'immutable-zkevm',
      'ronin',
      'tezos',
    ]));
    expect(new Set(document.dossiers.map((dossier) => dossier.status))).toEqual(new Set(['thriving', 'middling', 'dead', 'unknown']));
    for (const dossier of document.dossiers) {
      expect(validateFieldCitedNft(dossier.profile, dossier.sources)).toEqual({ valid: true, errors: [] });
      expect(validateForensicFreshness(dossier)).toEqual({ valid: true, errors: [] });
    }
  });

  it('does not overwrite an existing deep-dive case', () => {
    const existing = initialNftSlugs(initialMigration);
    for (const dossier of firstWave.dossiers) existing.add(dossier.slug);
    for (const dossier of document.dossiers) expect(existing.has(dossier.slug), dossier.slug).toBe(false);
  });

  it('uses dated HTTPS sources and stable source ids', () => {
    for (const dossier of document.dossiers) {
      expect(new Set(dossier.sources.map((source) => source.id)).size).toBe(dossier.sources.length);
      for (const source of dossier.sources) {
        expect(source.url).toMatch(/^https:\/\//);
        expect(source.checked_at).toBe(document.research_as_of);
        expect(source.last_verified_at).toBe(document.research_as_of);
        expect(source.source_date).not.toBe(source.last_verified_at);
        expect(typeof source.stale).toBe('boolean');
      }
    }
  });

  it('withholds current lifecycle labels when evidence is stale or undated', () => {
    const withheld = document.dossiers.filter((dossier) => dossier.profile.evidence_policy.status_basis === 'withheld');
    expect(withheld.map((dossier) => dossier.slug).sort()).toEqual(['bitcoin-frogs', 'tezzardz', 'twelvefold']);
    for (const dossier of withheld) {
      expect(dossier.status).toBe('unknown');
      expect(dossier.profile.evidence_policy.stale).toBe(true);
    }
    for (const dossier of document.dossiers) {
      const lifecycle = dossier.profile.evidence.find((item) => item.field === 'lifecycle_status');
      expect(lifecycle.as_of).not.toBe(dossier.profile.evidence_policy.last_verified_at);
    }
  });

  it('renders an unnumbered, replay-safe migration after validation', () => {
    const migration = renderNftMigration(document);
    expect(migration).toContain('Assign a migration number only after rebasing');
    expect(migration).toContain('INSERT OR REPLACE INTO nft_collections');
    expect(migration).not.toMatch(/\bBEGIN\s+TRANSACTION\b|\bCOMMIT\s*;/i);
    for (const dossier of document.dossiers) expect(migration).toContain(`"slug":"${dossier.slug}"`);
  });
});

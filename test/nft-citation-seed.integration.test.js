import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateFieldCitedNft } from '../src/lib/nft-citation.mjs';

const document = JSON.parse(readFileSync(new URL('../docs/nft-citation-wave-2026-07-29.json', import.meta.url), 'utf8'));
const migration = readFileSync(new URL('../migrations/0016_nft_field_citation_wave.sql', import.meta.url), 'utf8');

describe('NFT field-citation research seed', () => {
  it('has four valid dossiers spanning the requested chains and lifecycle outcomes', () => {
    expect(document.dossiers).toHaveLength(4);
    expect(new Set(document.dossiers.map((d) => d.chain))).toEqual(new Set(['ethereum', 'solana', 'bitcoin-ordinals']));
    expect(new Set(document.dossiers.map((d) => d.status))).toEqual(new Set(['thriving', 'middling', 'dead']));
    for (const dossier of document.dossiers) expect(validateFieldCitedNft(dossier.profile, dossier.sources)).toEqual({ valid: true, errors: [] });
  });

  it('keeps every reviewed dossier and source id in the applied D1 migration', () => {
    for (const dossier of document.dossiers) {
      expect(migration).toContain(`"slug":"${dossier.slug}"`);
      for (const source of dossier.sources) expect(migration).toContain(`"id":"${source.id}"`);
    }
  });
});

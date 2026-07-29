import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateForensicFreshness } from '../src/lib/evidence-freshness.mjs';
import { validateFieldCitedNft } from '../src/lib/nft-citation.mjs';
import { renderNftMigration } from '../scripts/render-nft-seed-migration.mjs';

const document = JSON.parse(readFileSync(
  new URL('../docs/nft-art-blocks-wave-2026-07-29.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0022_nft_art_blocks_wave.sql', import.meta.url),
  'utf8',
);

describe('Art Blocks field-cited lifecycle wave', () => {
  it('keeps the public dossier fully field-cited and freshness-gated', () => {
    expect(document.dossiers).toHaveLength(1);
    const [dossier] = document.dossiers;
    expect(dossier.slug).toBe('art-blocks-generative-art');
    expect(dossier.status).toBe('thriving');
    expect(validateFieldCitedNft(dossier.profile, dossier.sources)).toEqual({ valid: true, errors: [] });
    expect(validateForensicFreshness(dossier)).toEqual({ valid: true, errors: [] });
    expect(dossier.profile.evidence_policy).toMatchObject({
      status_basis: 'direct_current',
      status_as_of: '2026-06-09',
      next_review_at: '2026-10-07',
      stale: false,
    });
    expect(dossier.sources.filter((source) => source.evidence_scope === 'current_state')).toHaveLength(3);
  });

  it('does not smuggle unsupported market claims into the lifecycle label', () => {
    const [dossier] = document.dossiers;
    expect(dossier.profile.analysis).toContain('does not establish market prices, liquidity, revenue');
    expect(dossier.profile.analysis).toContain('aggregate supply, holder retention, or founder economics');
    expect(dossier.profile.evidence.map((item) => item.field)).toEqual([
      'launch', 'supply_or_mint', 'lifecycle_status', 'benefits', 'business', 'analysis',
    ]);
  });

  it('keeps platform-level supply descriptive so the public UI does not imply a numeric collection supply', () => {
    const [dossier] = document.dossiers;
    expect(typeof dossier.profile.supply).toBe('string');
    expect(dossier.profile.supply).toContain('no aggregate supply is asserted');
  });

  it('commits the generated migration rather than a hand-edited SQL variant', () => {
    expect(migration).toBe(renderNftMigration(document));
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { validateForensicFreshness } from '../src/lib/evidence-freshness.mjs';
import { validateFieldCitedNft } from '../src/lib/nft-citation.mjs';
import { renderNftMigration } from '../scripts/render-nft-seed-migration.mjs';

const document = JSON.parse(readFileSync(new URL('../docs/nft-pudgy-penguins-wave-2026-07-29.json', import.meta.url), 'utf8'));
const migration = readFileSync(new URL('../migrations/0029_nft_pudgy_penguins_wave.sql', import.meta.url), 'utf8');

describe('Pudgy Penguins field-cited lifecycle wave', () => {
  it('is public, field-cited, freshness-gated, and explicit about source scope', () => {
    const [dossier] = document.dossiers;
    expect(dossier).toMatchObject({ slug: 'pudgy-penguins', status: 'thriving', chain: 'ethereum' });
    expect(validateFieldCitedNft(dossier.profile, dossier.sources)).toEqual({ valid: true, errors: [] });
    expect(validateForensicFreshness(dossier)).toEqual({ valid: true, errors: [] });
    expect(dossier.profile.evidence_policy).toMatchObject({ status_as_of: '2026-05-31', next_review_at: '2026-08-29', stale: false });
    expect(dossier.profile.evidence.map((item) => item.field)).toEqual([
      'launch', 'supply_or_mint', 'mint_price', 'lifecycle_status', 'community_history', 'founder_engagement', 'benefits', 'business', 'analysis',
    ]);
  });

  it('does not turn operator product evidence into market-performance analysis', () => {
    const [dossier] = document.dossiers;
    expect(dossier.profile.analysis).toContain('operator-reported product telemetry');
    expect(dossier.profile.analysis).toContain('floor, sales volume, royalty revenue, PENGU value');
    expect(dossier.profile.supply).toContain('Lil Pudgys, physical products, PENGU');
  });

  it('commits the generator output verbatim', () => {
    expect(migration).toBe(renderNftMigration(document));
  });

  it('appears through the public NFT Analysis API with evidence and review timing', async () => {
    const [dossier] = document.dossiers;
    vi.resetModules();
    const worker = (await import('../src/worker.js')).default;
    const row = {
      slug: dossier.slug, name: dossier.name, chain: dossier.chain, category: dossier.category, status: dossier.status,
      profile: JSON.stringify(dossier.profile), sources: JSON.stringify(dossier.sources), updated_at: '2026-07-29',
    };
    const env = { DB: { prepare: (sql) => ({ bind() { return this; }, async all() { return { results: sql.includes('FROM nft_collections') ? [row] : [] }; } }) } };
    const response = await worker.fetch(new Request('http://localhost/api/nft'), env, { waitUntil() {}, passThroughOnException() {} });
    const body = await response.json();
    expect(body.collections[0]).toMatchObject({ slug: 'pudgy-penguins', citation: { fieldCited: true } });
    expect(body.collections[0].profile.evidence_policy.next_review_at).toBe('2026-08-29');
    expect(JSON.parse(body.collections[0].sources)).toHaveLength(5);
  });
});

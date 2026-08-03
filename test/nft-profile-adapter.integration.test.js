import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const document = JSON.parse(readFileSync(
  new URL('../docs/nft-legacy-depth-wave-2026-07-29.json', import.meta.url),
  'utf8',
));
const azuki = document.dossiers.find(({ slug }) => slug === 'azuki');

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });

function nftD1(rows) {
  return {
    prepare(sql) {
      let bindings = [];
      return {
        bind(...values) { bindings = values; return this; },
        async all() {
          if (!sql.includes('FROM nft_collections')) return { results: [] };
          const slug = bindings[0];
          return { results: rows.filter((row) => row.slug === slug) };
        },
      };
    },
  };
}

beforeEach(() => vi.resetModules());

describe('NFT canonical profile API adapter', () => {
  it('serves the full Azuki dossier in the shared ten-section contract', async () => {
    const worker = (await import('../src/worker.js')).default;
    const response = await worker.fetch(
      new Request('http://localhost/api/profile/nft_collection/azuki'),
      {
        DB: nftD1([{
          slug: azuki.slug,
          name: 'Azuki',
          chain: 'ethereum',
          category: 'pfp-anime',
          status: azuki.status,
          profile: JSON.stringify(azuki.profile_patch),
          sources: JSON.stringify(azuki.sources),
          updated_at: '2026-07-29 00:00:00',
        }]),
      },
      ctx(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.identity).toMatchObject({
      id: 'nft_collection:azuki', type: 'nft_collection', slug: 'azuki', name: 'Azuki',
    });
    expect(Object.values(body.analysis.sections).every(({ body: prose }) => (
      typeof prose === 'string' && prose.length > 20
    ))).toBe(true);
    expect(body.analysis.sections.what_happened.body).toContain('Elementals');
    expect(body.analysis.sections.why_this_outcome.body).toContain('trust deficit');
    expect(body.analysis.sections.outlook_and_watch.body).toContain('TCG sell-through');
    expect(body.claims).toHaveLength(34);
    expect(body.claims.every(({ review }) => review.state === 'pending')).toBe(true);
    expect(body.quality).toMatchObject({
      publication_state: 'review',
      completeness_pct: 100,
      unsourced_fields: [],
      validation_errors: [],
    });
    expect(body.metrics).toHaveLength(1);
    expect(body.metrics[0]).toMatchObject({
      dimension: 'supply', value: 10000,
      claim_ids: ['nft:azuki:profile-evidence-supply-or-mint'],
    });
    expect(body.extensions.rich_profile_projection).toBe(true);
  });

  it('does not manufacture depth for a sparse Quantum Cats control', async () => {
    const worker = (await import('../src/worker.js')).default;
    const response = await worker.fetch(
      new Request('http://localhost/api/profile/ordinals_collection/quantum-cats'),
      {
        DB: nftD1([{
          slug: 'quantum-cats',
          name: 'Quantum Cats',
          chain: 'Bitcoin Ordinals',
          category: 'ordinals-art',
          status: 'middling',
          profile: JSON.stringify({
            citation_schema: 'field-v1',
            evidence_policy: {
              status_as_of: '2026-07-29',
              last_verified_at: '2026-07-29',
              next_review_at: '2026-10-29',
            },
            evidence: [{
              field: 'launch', value: 'Launched in 2024', as_of: '2024-01-01',
              basis: 'operator', source_ids: ['qc-launch'],
            }],
            why: {
              finding: 'Unverified causal conclusion.',
              source_ids: ['missing-source'],
            },
          }),
          sources: JSON.stringify([{
            id: 'qc-launch', title: 'Quantum Cats launch',
            url: 'https://example.com/quantum-cats', publisher: 'Taproot Wizards',
            checked_at: '2026-07-29', access_state: 'accessible',
          }]),
          updated_at: '2026-07-29 00:00:00',
        }]),
      },
      ctx(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.analysis.sections.what_it_is.body).toBe('Launched in 2024.');
    expect(body.analysis.sections.why_this_outcome.body).toBeNull();
    expect(body.analysis.sections.lifecycle.body).toBeNull();
    expect(JSON.stringify(body)).not.toContain('Unverified causal conclusion');
    expect(JSON.stringify(body.analysis)).not.toMatch(/liquidity|valuation|value capture/i);
    expect(body.status.operating_state).toBeNull();
    expect(body.outcome.label).toBeNull();
    expect(body.extensions.rich_profile_projection).toBe(false);
    expect(body.quality).toMatchObject({
      publication_state: 'review',
      completeness_pct: 10,
    });
    expect(body.quality.unsourced_fields).toContain('analysis.sections.why_this_outcome.body');
  });
});

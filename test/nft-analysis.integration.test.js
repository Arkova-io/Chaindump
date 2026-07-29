import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

async function freshWorker() {
  vi.resetModules();
  return (await import('../src/worker.js')).default;
}
const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });

const citedProfile = {
  citation_schema: 'field-v1',
  evidence: [
    { field: 'launch', value: '2024-01', as_of: '2026-07-29', basis: 'operator', source_ids: ['operator'] },
    { field: 'supply_or_mint', value: '1,000', as_of: '2026-07-29', basis: 'onchain', source_ids: ['operator'] },
    { field: 'lifecycle_status', value: 'middling', as_of: '2026-07-29', basis: 'analyst', source_ids: ['operator'] },
  ],
};
const citedRow = {
  slug: 'citation-test', name: 'Citation Test', chain: 'ethereum', category: 'pfp', status: 'middling',
  profile: JSON.stringify(citedProfile),
  sources: JSON.stringify([{ id: 'operator', title: 'Operator record', url: 'https://example.org/operator' }]),
  updated_at: '2026-07-29',
};

function makeDB(rows) {
  return {
    prepare(sql) {
      return {
        bind() { return this; },
        async all() {
          if (sql.includes('FROM nft_collections')) return { results: rows };
          return { results: [] };
        },
      };
    },
  };
}

describe('NFT / Ordinals citation-ready surface', () => {
  it('returns an explicit citation-coverage count without hiding legacy source lists', async () => {
    const worker = await freshWorker();
    const response = await worker.fetch(new Request('http://localhost/api/nft'), { DB: makeDB([citedRow]) }, ctx());
    const body = await response.json();
    expect(body.citationCoverage).toEqual({ fieldCitedCount: 1, legacyCount: 0 });
    expect(body.collections[0].citation).toEqual({ fieldCited: true, errors: [] });
    expect(body.collections[0].profile.evidence[0].source_ids).toEqual(['operator']);
  });

  it('has a visible field-level evidence renderer and an honest legacy coverage caveat', () => {
    const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    expect(html).toContain('function nftEvidenceHtml');
    expect(html).toContain('function nftFreshnessHtml');
    expect(html).toContain('Evidence freshness');
    expect(html).toContain('source ${esc(sourceDate)} · verified ${esc(verified)}');
    expect(html).toContain('Field-level evidence');
    expect(html).toContain('Evidence coverage:');
    expect(html).toContain('legacy dossier');
  });
});

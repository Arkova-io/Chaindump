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
  sources: JSON.stringify([{
    id: 'operator',
    title: 'Operator record',
    url: 'https://example.org/operator',
    access_state: 'accessible',
    access_checked_at: '2026-07-29',
  }]),
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
    expect(body.analysis).toMatchObject({
      schema: 'nft-lifecycle-cohort-v1',
      cohort: { total: 1 },
      coverage: {
        field_cited: 1,
        field_claims: 3,
        field_claims_access_anchored: 3,
      },
      evidenceWindow: { source_access_checked_through: '2026-07-29' },
    });
  });

  it('has a visible field-level evidence renderer and an honest legacy coverage caveat', () => {
    const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    expect(html).toContain('function nftEvidenceHtml');
    expect(html).toContain('function nftFreshnessHtml');
    expect(html).toContain('Report freshness');
    expect(html).toContain('source ${esc(sourceDate)} · inspected ${esc(inspected)}');
    expect(html).toContain('source.verification_note');
    expect(html).toContain('access ${esc(access)}');
    expect(html).toContain('access checked ${esc(source.access_checked_at)}');
    expect(html).toContain('retrieval note: ${esc(source.access_note)}');
    expect(html).toContain("source.access_state || 'not recorded'");
    expect(html).not.toContain("source.access_state || (verified ? 'verified' : 'not recorded')");
    expect(html).toContain('evidence_scope: source.evidence_scope');
    expect(html).toContain('stale_after: source.stale_after');
    expect(html).toContain("stale: typeof source.stale === 'boolean' ? source.stale : null");
    expect(html).toContain('Field-level evidence');
    expect(html).toContain('reports link evidence to individual facts');
    expect(html).toContain('earlier reports still provide one source list');
    expect(html).toContain('earlier report');
    expect(html).toContain('function nftAggregateAnalysisHtml');
    expect(html).not.toContain('open the live cohort JSON');
    expect(html).toContain('directly open ${accessibleSources} cited sources');
    expect(html).toContain('That is a pattern to investigate—not proof that the chain caused the result.');
    expect(html).toContain('When the sources are too thin for a firm conclusion, the report says so.');
    expect(html).not.toContain('Across 16 notable collections');
  });
});

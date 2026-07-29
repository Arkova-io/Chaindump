import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { checkProduction } from '../scripts/smoke-production.mjs';

const deployWorkflow = readFileSync(
  new URL('../.github/workflows/deploy.yml', import.meta.url),
  'utf8',
);
const smokeScript = readFileSync(
  new URL('../scripts/smoke-production.mjs', import.meta.url),
  'utf8',
);
const releaseSurface = deployWorkflow + smokeScript;

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });

describe('production deployment readiness', () => {
  it('cancels a stale approval-gated run when a newer main revision arrives', () => {
    expect(deployWorkflow).toMatch(
      /group:\s*deploy-production[\s\S]*cancel-in-progress:\s*true/,
    );
  });

  it('deploys an identifiable revision and verifies the Worker plus research UI', () => {
    expect(deployWorkflow).toContain('BUILD_SHA:${GITHUB_SHA}');
    expect(releaseSurface).toContain('/api/health');
    expect(releaseSurface).toContain('/api/chains');
    expect(releaseSurface).toContain('/api/successful-exchanges?kind=dex');
    expect(releaseSurface).toContain('/exchange-analysis');
    expect(releaseSurface).toContain('DEX/CEX Analysis');
  });

  it('reports the deployed build revision from the health route', async () => {
    vi.resetModules();
    const worker = (await import('../src/worker.js')).default;
    const response = await worker.fetch(
      new Request('http://localhost/api/health'),
      { BUILD_SHA: 'release-test-sha' },
      ctx(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      revision: 'release-test-sha',
    });
  });

  it('accepts only a complete production surface for the expected revision', async () => {
    const payloads = new Map([
      ['/api/health', { ok: true, revision: 'expected-sha' }],
      ['/api/chains', { count: 50 }],
      ['/api/successful-exchanges?kind=dex', { exchanges: [{ slug: 'uniswap' }] }],
      ['/api/successful-exchanges?kind=cex', { exchanges: [] }],
      ['/api/mid-exchanges?kind=dex', { exchanges: [] }],
      ['/api/mid-exchanges?kind=cex', { exchanges: [] }],
      ['/api/dead-exchanges?kind=dex', { exchanges: [] }],
      ['/api/dead-exchanges?kind=cex', { exchanges: [] }],
    ]);
    const fetchImpl = vi.fn(async (input) => {
      const url = new URL(input);
      if (url.pathname === '/exchange-analysis') {
        return new Response([
          'Blockchain Analysis',
          'DEX/CEX Analysis',
          'Web3 Casino Analysis',
          'NFT and Ordinals Analysis',
        ].join(' | '), { status: 200 });
      }
      const key = url.pathname + url.search;
      return new Response(JSON.stringify(payloads.get(key)), {
        status: payloads.has(key) ? 200 : 404,
        headers: { 'content-type': 'application/json' },
      });
    });

    await expect(checkProduction({
      baseUrl: 'https://chaindump.xyz',
      expectedRevision: 'expected-sha',
      fetchImpl,
    })).resolves.toMatchObject({
      revision: 'expected-sha',
      chains: 50,
      successfulDex: 1,
    });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

async function freshWorker() {
  vi.resetModules();
  return (await import('../src/worker.js')).default;
}

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });

function makeDB() {
  return {
    prepare(sql) {
      return {
        async all() {
          if (sql.includes('FROM forensic_refresh_runs')) {
            return { results: [{
              run_id: 7, completed_at: '2026-07-29T18:00:00.000Z', status: 'completed',
              due_nft: 2, due_exchange: 3, due_casino: 1, due_chain: 4,
            }] };
          }
          return { results: [] };
        },
      };
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('forensic refresh status route', () => {
  it('exposes six-hour review debt without claiming automated promotion', async () => {
    const worker = await freshWorker();
    const response = await worker.fetch(
      new Request('http://localhost/api/forensics-refresh-status'), { DB: makeDB() }, ctx(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      cadence: 'six_hours', promotion_policy: 'human_review_required',
      refresh: { due_nft: 2, due_exchange: 3, due_casino: 1, due_chain: 4 },
    });
  });
});

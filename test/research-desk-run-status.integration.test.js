import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function freshWorker() {
  vi.resetModules();
  return (await import('../src/worker.js')).default;
}

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });

function fixture() {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE research_desk_runs (
      run_id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL,
      proposals_queued INTEGER NOT NULL DEFAULT 0
    );
  `);
  const DB = {
    prepare(sql) {
      let values = [];
      return {
        bind(...bound) {
          values = bound;
          return this;
        },
        async first() {
          return database.prepare(sql).get(...values) || null;
        },
        async all() {
          return { results: database.prepare(sql).all(...values) };
        },
        async run() {
          const result = database.prepare(sql).run(...values);
          return { meta: { changes: Number(result.changes || 0) } };
        },
      };
    },
  };
  return { database, DB };
}

function statusRequest(body, token = 'proposal-secret') {
  return new Request('http://localhost/api/desk/run-status', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('/api/desk/run-status', () => {
  it('records a proposal-only run and permits one terminal transition', async () => {
    const worker = await freshWorker();
    const { database, DB } = fixture();
    const env = { DB, DESK_PROPOSAL_TOKEN: 'proposal-secret' };
    const run_id = 'github-30491234567-1';

    const started = await worker.fetch(
      statusRequest({ run_id, status: 'running' }),
      env,
      ctx(),
    );
    expect(started.status).toBe(200);

    const completed = await worker.fetch(
      statusRequest({ run_id, status: 'completed', proposals_queued: 3 }),
      env,
      ctx(),
    );
    expect(completed.status).toBe(200);
    expect(database.prepare(`
      SELECT run_id, status, proposals_queued,
             completed_at IS NOT NULL AS has_completed
        FROM research_desk_runs
    `).get()).toEqual({
      run_id,
      status: 'completed',
      proposals_queued: 3,
      has_completed: 1,
    });

    const duplicate = await worker.fetch(
      statusRequest({ run_id, status: 'failed' }),
      env,
      ctx(),
    );
    expect(duplicate.status).toBe(409);
  });

  it('rejects absent or wrong credentials and malformed status records', async () => {
    const worker = await freshWorker();
    const { DB } = fixture();
    const env = { DB, DESK_PROPOSAL_TOKEN: 'proposal-secret' };
    const body = { run_id: 'github-30491234567-1', status: 'running' };

    const missing = await worker.fetch(new Request('http://localhost/api/desk/run-status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }), env, ctx());
    const wrong = await worker.fetch(statusRequest(body, 'review-secret'), env, ctx());
    const invalid = await worker.fetch(
      statusRequest({ run_id: 'bad id', status: 'published', proposals_queued: -1 }),
      env,
      ctx(),
    );

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(invalid.status).toBe(400);
  });
});

import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function freshWorker() {
  vi.resetModules();
  return (await import('../src/worker.js')).default;
}

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });

function makeDB({ refreshCompletedAt = '2026-07-29T18:00:00.000Z', agentCompletedAt = '2026-07-29T18:17:00.000Z' } = {}) {
  return {
    prepare(sql) {
      return {
        async all() {
          if (sql.includes('FROM forensic_refresh_runs')) {
            return { results: [{
              run_id: 7, completed_at: refreshCompletedAt, status: 'completed',
              due_nft: 2, due_exchange: 3, due_casino: 1, due_chain: 4,
            }] };
          }
          if (sql.includes('FROM research_desk_runs')) {
            return { results: [{
              run_id: 'github-3049-1',
              started_at: '2026-07-29T18:05:00.000Z',
              completed_at: agentCompletedAt,
              status: 'completed',
              proposals_queued: 3,
            }] };
          }
          return { results: [] };
        },
      };
    },
  };
}

let database;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  database?.close();
  database = undefined;
});

function d1Adapter(db) {
  return {
    prepare(sql) {
      let values = [];
      return {
        bind(...bound) {
          values = bound;
          return this;
        },
        async first() {
          return db.prepare(sql).get(...values) || null;
        },
        async all() {
          return { results: db.prepare(sql).all(...values) };
        },
        async run() {
          const result = db.prepare(sql).run(...values);
          return { meta: { changes: Number(result.changes || 0) } };
        },
      };
    },
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };
}

function freshnessFixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE forensic_refresh_runs (
      run_id INTEGER PRIMARY KEY AUTOINCREMENT,
      scheduled_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      status TEXT NOT NULL,
      scanned_nft INTEGER NOT NULL,
      due_nft INTEGER NOT NULL,
      scanned_exchange INTEGER NOT NULL,
      due_exchange INTEGER NOT NULL,
      scanned_casino INTEGER NOT NULL,
      due_casino INTEGER NOT NULL,
      scanned_chain INTEGER NOT NULL,
      due_chain INTEGER NOT NULL,
      notes TEXT
    );
    CREATE TABLE nft_collections (profile TEXT, updated_at TEXT);
    CREATE TABLE exchange_case_features (
      kind TEXT, slug TEXT, lifecycle TEXT, next_review_at TEXT
    );
    CREATE TABLE dead_exchanges (slug TEXT, kind TEXT, profile TEXT);
    CREATE TABLE mid_exchanges (slug TEXT, kind TEXT, profile TEXT);
    CREATE TABLE successful_exchanges (slug TEXT, type TEXT, profile TEXT);
    CREATE TABLE casino_cases (
      case_id TEXT, quality_passed INTEGER, last_reviewed TEXT, updated_at TEXT
    );
    CREATE TABLE casino_syntheses (case_id TEXT, outlook TEXT);
    CREATE TABLE chain_facts (
      chain TEXT, dimension TEXT, data TEXT, updated_at TEXT
    );

    INSERT INTO nft_collections VALUES
      ('{"evidence_policy":{"next_review_at":"2026-07-30"}}', '2026-07-29'),
      ('{}', '2026-07-29');

    INSERT INTO exchange_case_features VALUES
      ('cex', 'contract-deadline', 'dead', '2026-08-05'),
      ('dex', 'feature-fallback', 'mid', '2026-07-30');
    INSERT INTO dead_exchanges VALUES
      ('contract-deadline', 'cex', '{"forensic_analysis":{"review":{"next_review_at":"2026-07-30"}}}'),
      ('no-feature-row', 'cex', '{"forensic_analysis":{"review":{"next_review_at":"2026-07-30"}}}');
    INSERT INTO mid_exchanges VALUES ('feature-fallback', 'dex', '{}');

    INSERT INTO casino_cases VALUES
      ('contract-deadline', 1, '2026-07-29', '2026-07-29'),
      ('ninety-day-fallback', 1, '2026-07-29', '2026-07-29');
    INSERT INTO casino_syntheses VALUES
      ('contract-deadline', '{"forensic_analysis":{"review":{"next_review_at":"2026-07-30"}}}');

    INSERT INTO chain_facts VALUES
      ('Explicit', '_meta', '{"last_reviewed":"2026-07-29","next_review_at":"2026-07-30"}', '2026-07-29'),
      ('Fallback', '_meta', '{"last_reviewed":"2026-07-29"}', '2026-07-29');
  `);
  return db;
}

describe('forensic refresh status route', () => {
  it('exposes six-hour review debt without claiming automated promotion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T20:00:00.000Z'));
    const worker = await freshWorker();
    const response = await worker.fetch(
      new Request('http://localhost/api/forensics-refresh-status'), { DB: makeDB() }, ctx(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      cadence: 'six_hours', promotion_policy: 'human_review_required',
      refresh: { due_nft: 2, due_exchange: 3, due_casino: 1, due_chain: 4 },
      proposal_agent: {
        run_id: 'github-3049-1',
        status: 'completed',
        proposals_queued: 3,
      },
      refresh_freshness: {
        state: 'current',
        last_completed_at: '2026-07-29T18:00:00.000Z',
        next_due_at: '2026-07-30T00:00:00.000Z',
        age_seconds: 7200,
      },
      proposal_agent_freshness: {
        state: 'current',
        last_completed_at: '2026-07-29T18:17:00.000Z',
        next_due_at: '2026-07-30T00:17:00.000Z',
        age_seconds: 6180,
      },
    });
  });

  it('labels missed six-hour runs stale instead of presenting an ancient success as current', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T02:00:00.000Z'));
    const worker = await freshWorker();

    const response = await worker.fetch(
      new Request('http://localhost/api/forensics-refresh-status'), { DB: makeDB() }, ctx(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      refresh_freshness: {
        state: 'stale',
        last_completed_at: '2026-07-29T18:00:00.000Z',
        next_due_at: '2026-07-30T00:00:00.000Z',
      },
      proposal_agent_freshness: {
        state: 'stale',
        last_completed_at: '2026-07-29T18:17:00.000Z',
        next_due_at: '2026-07-30T00:17:00.000Z',
      },
    });
  });

  it('reports the fixed minute-17 proposal schedule instead of drifting with run duration', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T20:00:00.000Z'));
    const worker = await freshWorker();

    const response = await worker.fetch(
      new Request('http://localhost/api/forensics-refresh-status'),
      { DB: makeDB({ agentCompletedAt: '2026-07-29T18:30:00.000Z' }) },
      ctx(),
    );

    expect((await response.json()).proposal_agent_freshness).toMatchObject({
      state: 'current',
      last_completed_at: '2026-07-29T18:30:00.000Z',
      next_due_at: '2026-07-30T00:17:00.000Z',
    });
  });

  it('uses run_id as a deterministic tie-breaker for equal start times', async () => {
    database = new DatabaseSync(':memory:');
    database.exec(`
      CREATE TABLE research_desk_runs (
        run_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL,
        proposals_queued INTEGER NOT NULL
      );
      INSERT INTO research_desk_runs VALUES
        ('github-100-1', '2026-07-29 18:00:00', '2026-07-29 18:05:00', 'completed', 1),
        ('github-200-1', '2026-07-29 18:00:00', '2026-07-29 18:06:00', 'completed', 2);
    `);
    const worker = await freshWorker();

    const response = await worker.fetch(
      new Request('http://localhost/api/forensics-refresh-status'),
      { DB: d1Adapter(database) },
      ctx(),
    );

    expect((await response.json()).proposal_agent).toMatchObject({
      run_id: 'github-200-1',
      proposals_queued: 2,
    });
  });

  it('keeps the exact last completed run visible while a newer attempt is running', async () => {
    database = new DatabaseSync(':memory:');
    database.exec(`
      CREATE TABLE research_desk_runs (
        run_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL,
        proposals_queued INTEGER NOT NULL
      );
      INSERT INTO research_desk_runs VALUES
        ('github-complete-1', '2026-07-29 18:00:00', '2026-07-29 18:08:00', 'completed', 2),
        ('github-running-1', '2026-07-29 23:00:00', NULL, 'running', 0);
    `);
    const worker = await freshWorker();

    const response = await worker.fetch(
      new Request('http://localhost/api/forensics-refresh-status'),
      { DB: d1Adapter(database) },
      ctx(),
    );

    expect(await response.json()).toMatchObject({
      proposal_agent: { run_id: 'github-running-1', status: 'running' },
      proposal_agent_last_completed: {
        run_id: 'github-complete-1',
        completed_at: '2026-07-29 18:08:00',
        proposals_queued: 2,
      },
    });
  });

  it('runs immediately, honors dossier deadlines, and recovers missed six-hour boundaries', async () => {
    database = freshnessFixture();
    const DB = d1Adapter(database);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    const worker = await freshWorker();
    const initial = Date.parse('2026-07-30T19:15:00.000Z');

    // This is deliberately not a 00/06/12/18 UTC boundary. A fresh deployment
    // still needs an immediate governance scan.
    await worker.scheduled({ scheduledTime: initial }, { DB }, ctx());
    expect(database.prepare(`
      SELECT scanned_nft, due_nft, scanned_exchange, due_exchange,
             scanned_casino, due_casino, scanned_chain, due_chain
        FROM forensic_refresh_runs
    `).get()).toEqual({
      scanned_nft: 2,
      due_nft: 1,
      scanned_exchange: 3,
      due_exchange: 3,
      scanned_casino: 2,
      due_casino: 1,
      scanned_chain: 2,
      due_chain: 1,
    });

    // Five-minute triggers inside the six-hour window do not duplicate runs.
    await worker.scheduled({ scheduledTime: initial + 5 * 60 * 1000 }, { DB }, ctx());
    expect(database.prepare('SELECT COUNT(*) AS count FROM forensic_refresh_runs').get().count).toBe(1);

    // If the exact six-hour wall-clock boundary was missed, the next trigger
    // records the overdue scan instead of waiting another six hours.
    await worker.scheduled({ scheduledTime: initial + 6 * 60 * 60 * 1000 + 5 * 60 * 1000 }, { DB }, ctx());
    expect(database.prepare('SELECT COUNT(*) AS count FROM forensic_refresh_runs').get().count).toBe(2);
  });
});

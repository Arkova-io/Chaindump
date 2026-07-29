import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CHAIN_DOSSIER_DIMENSIONS,
  validateChainDossierRows,
} from '../src/lib/chain-dossier.js';

const WAVE_TWO = ['Tron', 'Monad', 'Avalanche', 'OP Mainnet', 'Mantle'];
let rows;
let migration;

beforeAll(() => {
  migration = readFileSync(new URL('../migrations/0020_chain_dossiers_wave2.sql', import.meta.url), 'utf8');
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE chain_facts (
    chain TEXT NOT NULL, dimension TEXT NOT NULL, data TEXT NOT NULL,
    sources TEXT, updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (chain, dimension)
  )`);
  db.exec(migration);
  rows = db.prepare('SELECT chain, dimension, data, sources, updated_at FROM chain_facts ORDER BY chain, dimension').all();
  db.close();
});

afterEach(() => vi.unstubAllGlobals());

describe('wave-two chain dossier migration', () => {
  it('publishes five complete, cited, explicitly incomplete dossiers', () => {
    expect(rows).toHaveLength(WAVE_TWO.length * (CHAIN_DOSSIER_DIMENSIONS.length + 1));
    expect(validateChainDossierRows(rows, WAVE_TWO)).toEqual([]);
    for (const chain of WAVE_TWO) {
      const facts = Object.fromEntries(rows.filter((row) => row.chain === chain)
        .map((row) => [row.dimension, JSON.parse(row.data)]));
      expect(facts._meta.dimension_completeness_pct, chain).toBe(100);
      expect(facts._meta.data_completeness_pct, chain).toBeLessThan(100);
      expect(facts._meta.unsourced_fields.length, chain).toBeGreaterThan(0);
      expect(facts.identity.lifecycle.length, chain).toBeGreaterThan(0);
      expect(facts.risk.risks.length, chain).toBeGreaterThan(0);
    }
  });

  it('preserves chain/token distinctions that affect trend analysis', () => {
    const fact = (chain, dimension) => JSON.parse(
      rows.find((row) => row.chain === chain && row.dimension === dimension).data,
    );
    expect(fact('OP Mainnet', 'token')).toMatchObject({ token_symbol: 'OP', gas_token: 'ETH' });
    expect(fact('Tron', 'token')).toMatchObject({ token_symbol: 'TRX', gas_token: 'TRX' });
    expect(fact('Monad', 'token')).toMatchObject({ token_symbol: 'MON', gas_token: 'MON' });
    expect(fact('Mantle', 'token')).toMatchObject({ token_symbol: 'MNT', gas_token: 'MNT' });
  });

  it('is idempotent', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE chain_facts (
      chain TEXT NOT NULL, dimension TEXT NOT NULL, data TEXT NOT NULL,
      sources TEXT, updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (chain, dimension)
    )`);
    db.exec(migration);
    db.exec(migration);
    expect(db.prepare('SELECT count(*) AS count FROM chain_facts').get().count).toBe(45);
    db.close();
  });
});

const json = (body) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

const universe = WAVE_TWO.map((name, index) => ({
  name,
  tvl: 5e9 - index * 1e8,
  tokenSymbol: null,
  gecko_id: null,
  chainId: index + 1,
}));
const overview = {
  protocols: universe.map(({ name }, index) => ({
    name: `Protocol${index}`,
    category: 'Dexs',
    breakdown24h: { [name]: { [`Protocol${index}`]: 1e6 - index } },
  })),
};

function stubFeeds() {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const value = String(url);
    if (value.includes('/v2/chains')) return json(universe);
    if (value.includes('/overview/dexs?') || value.includes('/overview/fees?')) return json(overview);
    if (value.includes('/overview/dexs/') || value.includes('/overview/fees/')) return json({ total24h: 1 });
    return new Response('', { status: 500 });
  }));
}

function makeDB(factRows) {
  const cache = {};
  const statement = (sql) => ({
    sql,
    binds: [],
    bind(...values) { this.binds = values; return this; },
    async run() {
      const match = this.sql.match(/VALUES \('([a-z_]+)'/);
      if (match) cache[match[1]] = this.binds[0];
      return {};
    },
    async first() {
      const match = this.sql.match(/key='([a-z_]+)'/);
      return match && cache[match[1]] ? { data: cache[match[1]], updated_at: 1 } : null;
    },
    async all() {
      if (this.sql.includes('FROM chain_facts')) {
        if (this.sql.includes('SELECT chain, dimension, data, sources FROM chain_facts')) return { results: factRows };
        const wanted = String(this.binds[0] || '');
        return { results: factRows.filter((row) => row.chain.toLowerCase() === wanted.toLowerCase()) };
      }
      const match = this.sql.match(/key='([a-z_]+)'/);
      return { results: match && cache[match[1]] ? [{ data: cache[match[1]] }] : [] };
    },
  });
  return { prepare: (sql) => statement(sql), async batch() { return []; } };
}

describe('wave-two dossiers through the public chain API', () => {
  it('puts each complete dossier on its board card and its route, with field citations', async () => {
    stubFeeds();
    vi.resetModules();
    const worker = (await import('../src/worker.js')).default;
    const env = { DB: makeDB(rows) };
    const context = { waitUntil() {}, passThroughOnException() {} };
    const board = await (await worker.fetch(new Request('http://localhost/api/chains'), env, context)).json();

    for (const chain of WAVE_TWO) {
      const boardRow = board.chains.find((row) => row.name === chain);
      expect(boardRow?.dossier, chain).toMatchObject({ dimensionCount: 8, expectedDimensionCount: 8 });
      expect(boardRow?.dossier?.freshness, chain).toMatchObject({ status: 'current', lastReviewedAt: '2026-07-29', nextReviewAt: '2026-10-27', derived: true });
      const response = await worker.fetch(new Request(`http://localhost/api/chain/${encodeURIComponent(chain)}`), env, context);
      expect(response.status, chain).toBe(200);
      const body = await response.json();
      expect(Object.keys(body.facts).sort(), chain).toEqual([...CHAIN_DOSSIER_DIMENSIONS].sort());
      expect(body.facts._meta, chain).toBeUndefined();
      for (const dimension of CHAIN_DOSSIER_DIMENSIONS) {
        expect(body.facts[dimension].sources[0].url, `${chain}.${dimension}`).toMatch(/^https:\/\//);
      }
    }
  });
});

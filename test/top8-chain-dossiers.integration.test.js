import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CHAIN_DOSSIER_DIMENSIONS,
  validateChainDossierRows,
} from '../src/lib/chain-dossier.js';

const TOP_EIGHT = [
  'Ethereum',
  'Solana',
  'BSC',
  'Base',
  'Robinhood Chain',
  'Hyperliquid L1',
  'Polygon',
  'Arbitrum',
];

let rows;
let migration;

beforeAll(() => {
  migration = readFileSync(new URL('../migrations/0014_top8_chain_dossiers.sql', import.meta.url), 'utf8');
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE chain_facts (
      chain TEXT NOT NULL,
      dimension TEXT NOT NULL,
      data TEXT NOT NULL,
      sources TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (chain, dimension)
    )
  `);
  db.exec(migration);
  rows = db.prepare(
    'SELECT chain, dimension, data, sources, updated_at FROM chain_facts ORDER BY chain, dimension',
  ).all();
  db.close();
});

afterEach(() => vi.unstubAllGlobals());

describe('top-eight chain dossier migration', () => {
  it('seeds a complete, schema-valid and explicitly incomplete dossier for every chain', () => {
    expect(rows).toHaveLength(TOP_EIGHT.length * (CHAIN_DOSSIER_DIMENSIONS.length + 1));
    expect(validateChainDossierRows(rows, TOP_EIGHT)).toEqual([]);

    for (const chain of TOP_EIGHT) {
      const chainRows = rows.filter((row) => row.chain === chain);
      expect(chainRows.map((row) => row.dimension).sort()).toEqual(
        [...CHAIN_DOSSIER_DIMENSIONS, '_meta'].sort(),
      );

      const meta = JSON.parse(chainRows.find((row) => row.dimension === '_meta').data);
      expect(meta.dimension_completeness_pct).toBe(100);
      expect(meta.data_completeness_pct).toBeLessThan(100);
      expect(meta.unsourced_fields.length).toBeGreaterThan(0);
    }
  });

  it('is safe to apply twice without duplicating facts', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE chain_facts (
        chain TEXT NOT NULL,
        dimension TEXT NOT NULL,
        data TEXT NOT NULL,
        sources TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (chain, dimension)
      )
    `);
    db.exec(migration);
    db.exec(migration);
    expect(db.prepare('SELECT count(*) AS count FROM chain_facts').get().count).toBe(72);
    db.close();
  });

  it('does not invent day precision where the primary record only supports a year', () => {
    const fact = (chain, dimension) => JSON.parse(
      rows.find((row) => row.chain === chain && row.dimension === dimension).data,
    );
    expect(fact('Hyperliquid L1', 'identity')).toMatchObject({
      launched: '2023',
      launch_date_precision: 'year',
    });
    expect(fact('BSC', 'token')).toMatchObject({
      launch_date: '2017',
      launch_date_precision: 'year',
    });
  });

  it('rejects an uncited metric or a falsely complete dossier', () => {
    const mutated = rows.map((row) => ({ ...row }));
    const onchain = mutated.find((row) => row.chain === 'Ethereum' && row.dimension === 'onchain');
    const onchainData = JSON.parse(onchain.data);
    delete onchainData.volume_source_url;
    onchain.data = JSON.stringify(onchainData);

    const meta = mutated.find((row) => row.chain === 'Ethereum' && row.dimension === '_meta');
    meta.data = JSON.stringify({ ...JSON.parse(meta.data), data_completeness_pct: 100 });

    expect(validateChainDossierRows(mutated, TOP_EIGHT)).toEqual(expect.arrayContaining([
      'Ethereum.onchain.volume_source_url: volume provenance required',
      'Ethereum._meta.data_completeness_pct: must honestly remain below 100',
    ]));
  });
});

const json = (body) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

const universe = [
  ...TOP_EIGHT.map((name, index) => ({
    name,
    tvl: 8e9 - index * 1e8,
    tokenSymbol: null,
    gecko_id: null,
    chainId: index + 1,
  })),
  ...Array.from({ length: 50 }, (_, index) => ({
    name: `Filler${index}`,
    tvl: 1e8 - index * 1e5,
    tokenSymbol: null,
    gecko_id: null,
    chainId: 900000 + index,
  })),
];
const metric = Object.fromEntries(universe.map(({ name }, index) => [name, 1e6 - index]));
const overview = {
  protocols: Object.entries(metric).map(([chain, value], index) => ({
    name: `Protocol${index}`,
    category: 'Dexs',
    breakdown24h: { [chain]: { [`Protocol${index}`]: value } },
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
    bind(...values) {
      this.binds = values;
      return this;
    },
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
        if (!this.binds.length) return { results: factRows.map(({ chain }) => ({ chain })) };
        const wanted = String(this.binds[0]);
        return {
          results: factRows.filter(({ chain }) => chain.toLowerCase() === wanted.toLowerCase()),
        };
      }
      const match = this.sql.match(/key='([a-z_]+)'/);
      return { results: match && cache[match[1]] ? [{ data: cache[match[1]] }] : [] };
    },
  });
  return { prepare: (sql) => statement(sql), async batch() { return []; } };
}

describe('top-eight dossiers through the production API contract', () => {
  it('serves all eight public dimensions with citations and hides editor metadata', async () => {
    stubFeeds();
    vi.resetModules();
    const worker = (await import('../src/worker.js')).default;
    const env = { DB: makeDB(rows) };
    const context = { waitUntil() {}, passThroughOnException() {} };

    for (const chain of TOP_EIGHT) {
      const response = await worker.fetch(
        new Request(`http://localhost/api/chain/${encodeURIComponent(chain)}`),
        env,
        context,
      );
      expect(response.status, chain).toBe(200);
      const body = await response.json();
      expect(Object.keys(body.facts).sort(), chain).toEqual([...CHAIN_DOSSIER_DIMENSIONS].sort());
      expect(body.facts._meta, chain).toBeUndefined();
      expect(body.facts.identity.data.lifecycle.length, chain).toBeGreaterThan(0);
      expect(body.facts.token.data.launch_status, chain).toMatch(/^(launched|not_launched)$/);
      expect(Array.isArray(body.facts.risk.data.risks), chain).toBe(true);

      for (const dimension of CHAIN_DOSSIER_DIMENSIONS) {
        expect(body.facts[dimension].sources.length, `${chain}.${dimension}`).toBeGreaterThan(0);
        expect(body.facts[dimension].sources[0].url, `${chain}.${dimension}`).toMatch(/^https:\/\//);
      }
    }
  });
});

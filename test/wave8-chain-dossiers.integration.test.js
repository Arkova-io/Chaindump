import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  CHAIN_DOSSIER_DIMENSIONS,
  validateChainDossierRows,
} from '../src/lib/chain-dossier.js';

const WAVE_EIGHT = ['dYdX', 'Mixin', 'Mezo', 'Bittensor', 'XRPL'];
const PREVIOUS_AND_CONCURRENT = new Set([
  'Ethereum', 'Solana', 'BSC', 'Base', 'Arbitrum', 'Polygon', 'Avalanche',
  'Hyperliquid L1', 'OP Mainnet', 'Bitcoin', 'Cardano', 'Near', 'Sui', 'Plasma',
  'TON', 'Aptos', 'Starknet', 'Ink', 'Chainflip', 'Sei', 'Unichain', 'X Layer',
  'Gnosis', 'Stellar', 'Flare', 'Cronos', 'Provenance', 'Stacks', 'Linea',
  'Dexalot', 'THORChain', 'Katana', 'Abstract', 'MegaETH', 'Rootstock',
  'Berachain',
]);
const migration = readFileSync(
  new URL('../migrations/0049_chain_dossiers_wave8.sql', import.meta.url),
  'utf8',
);
const source = JSON.parse(readFileSync(
  new URL('../docs/top50-chain-dossiers-wave8-2026-07-29.json', import.meta.url),
  'utf8',
));

function makeDB() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE chain_facts (
    chain TEXT NOT NULL,
    dimension TEXT NOT NULL,
    data TEXT NOT NULL,
    sources TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (chain, dimension)
  )`);
  return db;
}

describe('wave-eight top-50 chain dossiers', () => {
  it('publishes five complete, field-cited dossiers from the reviewable corpus', () => {
    expect(source.map(({ chain }) => chain)).toEqual(WAVE_EIGHT);
    expect(WAVE_EIGHT.every((chain) => !PREVIOUS_AND_CONCURRENT.has(chain))).toBe(true);
    const db = makeDB();
    db.exec(migration);
    const rows = db.prepare(
      'SELECT chain, dimension, data, sources, updated_at FROM chain_facts ORDER BY chain, dimension',
    ).all();

    expect(rows).toHaveLength(WAVE_EIGHT.length * (CHAIN_DOSSIER_DIMENSIONS.length + 1));
    expect(validateChainDossierRows(rows, WAVE_EIGHT)).toEqual([]);

    for (const chain of WAVE_EIGHT) {
      const facts = Object.fromEntries(rows.filter((row) => row.chain === chain)
        .map((row) => [row.dimension, JSON.parse(row.data)]));
      expect(facts._meta.dimension_completeness_pct, chain).toBe(100);
      expect(facts._meta.data_completeness_pct, chain).toBeLessThan(100);
      expect(facts._meta.unsourced_fields.length, chain).toBeGreaterThan(0);
      expect(facts.synthesis.why, chain).toBeTruthy();
      expect(facts.synthesis.strategic_choices.length, chain).toBeGreaterThanOrEqual(3);
      expect(facts.synthesis.unknowns.length, chain).toBeGreaterThanOrEqual(3);
      expect(rows.filter((row) => row.chain === chain)
        .every((row) => row.updated_at === '2026-07-29'), chain).toBe(true);
    }
    db.close();
  });

  it('preserves current rank, token, recovery, and category boundaries', () => {
    const db = makeDB();
    db.exec(migration);
    const fact = (chain, dimension) => JSON.parse(db.prepare(
      'SELECT data FROM chain_facts WHERE chain = ? AND dimension = ?',
    ).get(chain, dimension).data);

    expect(fact('dYdX', 'identity')).toMatchObject({
      top50_tvl_rank: 26,
      category: 'appchain',
    });
    expect(fact('Mixin', 'onchain')).toMatchObject({
      top50_tvl_rank: 27,
      ranking_tvl_usd: 77135434.9,
      tvl_current_usd: 18811416,
    });
    expect(fact('Mezo', 'token')).toMatchObject({
      token_symbol: 'MEZO',
      gas_token: 'BTC',
    });
    expect(fact('Bittensor', 'token')).toMatchObject({
      token_symbol: 'TAO',
      max_supply: 21000000,
    });
    expect(fact('XRPL', 'identity')).toMatchObject({
      launched: '2012-06',
      category: 'L1',
    });
    expect(fact('XRPL', 'token')).toMatchObject({
      token_symbol: 'XRP',
      max_supply: 100000000000,
    });

    for (const chain of WAVE_EIGHT) {
      expect(fact(chain, 'identity').top50_tvl_rank).toBeLessThanOrEqual(50);
      expect(fact(chain, 'synthesis').why).toBeTruthy();
      expect(fact(chain, 'synthesis').strategic_choices.length).toBeGreaterThanOrEqual(3);
      expect(fact(chain, 'synthesis').unknowns.length).toBeGreaterThanOrEqual(3);
    }
    expect(fact('Mezo', 'identity')).toMatchObject({
      vm: 'EVM',
    });
    db.close();
  });

  it('is idempotent', () => {
    const db = makeDB();
    db.exec(migration);
    db.exec(migration);
    expect(db.prepare('SELECT count(*) AS count FROM chain_facts').get().count).toBe(45);
    db.close();
  });
});

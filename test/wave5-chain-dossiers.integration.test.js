import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  CHAIN_DOSSIER_DIMENSIONS,
  validateChainDossierRows,
} from '../src/lib/chain-dossier.js';

const WAVE_FIVE = ['X Layer', 'Gnosis', 'Stellar', 'Flare', 'Cronos'];
const migration = readFileSync(
  new URL('../migrations/0044_chain_dossiers_wave5.sql', import.meta.url),
  'utf8',
);
const source = JSON.parse(readFileSync(
  new URL('../docs/top50-chain-dossiers-wave5-2026-07-29.json', import.meta.url),
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

describe('wave-five top-50 chain dossiers', () => {
  it('publishes five complete, field-cited dossiers from the reviewable corpus', () => {
    expect(source.map(({ chain }) => chain)).toEqual(WAVE_FIVE);
    const db = makeDB();
    db.exec(migration);
    const rows = db.prepare(
      'SELECT chain, dimension, data, sources, updated_at FROM chain_facts ORDER BY chain, dimension',
    ).all();

    expect(rows).toHaveLength(WAVE_FIVE.length * (CHAIN_DOSSIER_DIMENSIONS.length + 1));
    expect(validateChainDossierRows(rows, WAVE_FIVE)).toEqual([]);

    for (const chain of WAVE_FIVE) {
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

  it('preserves token, rebrand, smart-contract, and multi-chain boundaries', () => {
    const db = makeDB();
    db.exec(migration);
    const fact = (chain, dimension) => JSON.parse(db.prepare(
      'SELECT data FROM chain_facts WHERE chain = ? AND dimension = ?',
    ).get(chain, dimension).data);

    expect(fact('X Layer', 'token')).toMatchObject({
      token_symbol: 'OKB',
      gas_token: 'OKB',
      total_supply: 21000000,
    });
    expect(fact('Gnosis', 'token')).toMatchObject({
      token_symbol: 'GNO',
      gas_token: 'xDAI',
    });
    expect(fact('Stellar', 'identity').lifecycle
      .some(({ type }) => type === 'smart_contract_launch')).toBe(true);
    expect(fact('Flare', 'identity')).toMatchObject({
      launched: '2022-07-14',
      vm: 'EVM',
    });
    expect(fact('Cronos', 'narrative').positioning)
      .toContain('Cronos EVM');
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

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  CHAIN_DOSSIER_DIMENSIONS,
  validateChainDossierRows,
} from '../src/lib/chain-dossier.js';

const WAVE_THREE = ['Near', 'Sui', 'Plasma', 'TON', 'Aptos'];
const migration = readFileSync(
  new URL('../migrations/0031_chain_dossiers_wave3.sql', import.meta.url),
  'utf8',
);
const source = JSON.parse(readFileSync(
  new URL('../docs/top50-chain-dossiers-wave3-2026-07-29.json', import.meta.url),
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

describe('wave-three top-50 chain dossiers', () => {
  it('publishes five complete, field-cited dossiers from the reviewable corpus', () => {
    expect(source.map(({ chain }) => chain)).toEqual(WAVE_THREE);
    const db = makeDB();
    db.exec(migration);
    const rows = db.prepare(
      'SELECT chain, dimension, data, sources, updated_at FROM chain_facts ORDER BY chain, dimension',
    ).all();

    expect(rows).toHaveLength(WAVE_THREE.length * (CHAIN_DOSSIER_DIMENSIONS.length + 1));
    expect(validateChainDossierRows(rows, WAVE_THREE)).toEqual([]);

    for (const chain of WAVE_THREE) {
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

  it('preserves material chain, token, and incident lifecycle boundaries', () => {
    const db = makeDB();
    db.exec(migration);
    const fact = (chain, dimension) => JSON.parse(db.prepare(
      'SELECT data FROM chain_facts WHERE chain = ? AND dimension = ?',
    ).get(chain, dimension).data);

    expect(fact('Near', 'identity').launched).toBe('2020-04-22');
    expect(fact('Sui', 'risk').risks.some(({ type }) => type === 'liveness')).toBe(true);
    expect(fact('Plasma', 'capital')).toMatchObject({
      total_raised_usd: null,
      known_disclosed_raised_usd: 24000000,
    });
    expect(fact('TON', 'token')).toMatchObject({
      token_symbol: 'GRAM',
      historical_symbols: ['TON'],
    });
    expect(fact('Aptos', 'token').initial_supply).toBe(1000000000);
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

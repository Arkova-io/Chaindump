import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  CHAIN_DOSSIER_DIMENSIONS,
  validateChainDossierRows,
} from '../src/lib/chain-dossier.js';

const WAVE_SIX = ['Provenance', 'Stacks', 'Linea', 'Dexalot', 'Thorchain'];
const migration = readFileSync(
  new URL('../migrations/0047_chain_dossiers_wave6.sql', import.meta.url),
  'utf8',
);
const source = JSON.parse(readFileSync(
  new URL('../docs/top50-chain-dossiers-wave6-2026-07-29.json', import.meta.url),
  'utf8',
));

function makeDB() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE chain_facts (
    chain TEXT NOT NULL, dimension TEXT NOT NULL, data TEXT NOT NULL, sources TEXT,
    updated_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (chain, dimension)
  )`);
  return db;
}

describe('wave-six top-50 chain dossiers', () => {
  it('publishes five complete, field-cited dossiers', () => {
    expect(source.map(({ chain }) => chain)).toEqual(WAVE_SIX);
    const db = makeDB();
    db.exec(migration);
    const rows = db.prepare(
      'SELECT chain, dimension, data, sources, updated_at FROM chain_facts ORDER BY chain, dimension',
    ).all();
    expect(rows).toHaveLength(WAVE_SIX.length * (CHAIN_DOSSIER_DIMENSIONS.length + 1));
    expect(validateChainDossierRows(rows, WAVE_SIX)).toEqual([]);
    for (const chain of WAVE_SIX) {
      const facts = Object.fromEntries(rows.filter((row) => row.chain === chain)
        .map((row) => [row.dimension, JSON.parse(row.data)]));
      expect(facts._meta.dimension_completeness_pct, chain).toBe(100);
      expect(facts._meta.data_completeness_pct, chain).toBeLessThan(100);
      expect(facts.synthesis.why, chain).toBeTruthy();
      expect(facts.synthesis.strategic_choices.length, chain).toBeGreaterThanOrEqual(3);
      expect(facts.synthesis.unknowns.length, chain).toBeGreaterThanOrEqual(3);
      expect(rows.filter((row) => row.chain === chain)
        .every((row) => row.updated_at === '2026-07-29'), chain).toBe(true);
    }
    db.close();
  });

  it('preserves network, token, and lifecycle boundaries', () => {
    const db = makeDB();
    db.exec(migration);
    const fact = (chain, dimension) => JSON.parse(db.prepare(
      'SELECT data FROM chain_facts WHERE chain = ? AND dimension = ?',
    ).get(chain, dimension).data);
    expect(fact('Provenance', 'token')).toMatchObject({ token_symbol: 'HASH', gas_token: 'HASH' });
    expect(fact('Stacks', 'identity')).toMatchObject({ launched: '2021-01-14', vm: 'other' });
    expect(fact('Linea', 'token')).toMatchObject({ token_symbol: 'LINEA', gas_token: 'ETH' });
    expect(fact('Dexalot', 'identity').aliases).toContain('Dexalot L1');
    expect(fact('Thorchain', 'identity').lifecycle
      .some(({ type }) => type === 'economic_restructuring')).toBe(true);
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

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  CHAIN_DOSSIER_DIMENSIONS,
  validateChainDossierRows,
} from '../src/lib/chain-dossier.js';

const WAVE_TEN = ['XDC', 'Fluent', 'Algorand', 'ICP', 'Soneium'];
const migration = readFileSync(
  new URL('../migrations/0051_chain_dossiers_wave10.sql', import.meta.url),
  'utf8',
);
const source = JSON.parse(readFileSync(
  new URL('../docs/top50-chain-dossiers-wave10-2026-07-29.json', import.meta.url),
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

describe('wave-ten top-50 chain dossiers', () => {
  it('publishes the final five complete, field-cited top-50 dossiers', () => {
    expect(source.map(({ chain }) => chain)).toEqual(WAVE_TEN);
    const db = makeDB();
    db.exec(migration);
    const rows = db.prepare(
      'SELECT chain, dimension, data, sources, updated_at FROM chain_facts ORDER BY chain, dimension',
    ).all();

    expect(rows).toHaveLength(WAVE_TEN.length * (CHAIN_DOSSIER_DIMENSIONS.length + 1));
    expect(validateChainDossierRows(rows, WAVE_TEN)).toEqual([]);

    for (const chain of WAVE_TEN) {
      const facts = Object.fromEntries(rows.filter((row) => row.chain === chain)
        .map((row) => [row.dimension, JSON.parse(row.data)]));
      expect(facts._meta.dimension_completeness_pct, chain).toBe(100);
      expect(facts._meta.data_completeness_pct, chain).toBeLessThan(100);
      expect(facts._meta.unsourced_fields.length, chain).toBeGreaterThan(0);
      expect(facts.identity.top50_rank, chain).toBeGreaterThanOrEqual(46);
      expect(facts.synthesis.why, chain).toBeTruthy();
      expect(facts.synthesis.strategic_choices.length, chain).toBeGreaterThanOrEqual(3);
      expect(facts.synthesis.unknowns.length, chain).toBeGreaterThanOrEqual(3);
      expect(rows.filter((row) => row.chain === chain)
        .every((row) => row.updated_at === '2026-07-29'), chain).toBe(true);
    }
    db.close();
  });

  it('preserves token, VM, documentation-freshness, and policy boundaries', () => {
    const db = makeDB();
    db.exec(migration);
    const fact = (chain, dimension) => JSON.parse(db.prepare(
      'SELECT data FROM chain_facts WHERE chain = ? AND dimension = ?',
    ).get(chain, dimension).data);

    expect(fact('XDC', 'token')).toMatchObject({ token_symbol: 'XDC', gas_token: 'XDC' });
    expect(fact('Fluent', 'identity')).toMatchObject({
      launched: '2026-04-24',
      vm: 'other',
    });
    expect(fact('Fluent', 'identity').lifecycle
      .some(({ type }) => type === 'documentation_divergence')).toBe(true);
    expect(fact('Algorand', 'identity').lifecycle
      .some(({ type }) => type === 'smart_contract_launch')).toBe(true);
    expect(fact('ICP', 'token')).toMatchObject({ token_symbol: 'ICP', gas_token: 'cycles' });
    expect(fact('Soneium', 'token')).toMatchObject({
      launch_status: 'not_launched',
      token_symbol: null,
      gas_token: 'ETH',
    });
    expect(fact('Soneium', 'risk').extraction_flags).toContain('content_restriction');
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

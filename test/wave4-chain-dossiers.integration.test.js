import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  CHAIN_DOSSIER_DIMENSIONS,
  validateChainDossierRows,
} from '../src/lib/chain-dossier.js';

const WAVE_FOUR = ['Starknet', 'Ink', 'Chainflip', 'Sei', 'Unichain'];
const migration = readFileSync(
  new URL('../migrations/0041_chain_dossiers_wave4.sql', import.meta.url),
  'utf8',
);
const source = JSON.parse(readFileSync(
  new URL('../docs/top50-chain-dossiers-wave4-2026-07-29.json', import.meta.url),
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

describe('wave-four top-50 chain dossiers', () => {
  it('publishes five complete, field-cited dossiers from the reviewable corpus', () => {
    expect(source.map(({ chain }) => chain)).toEqual(WAVE_FOUR);
    const db = makeDB();
    db.exec(migration);
    const rows = db.prepare(
      'SELECT chain, dimension, data, sources, updated_at FROM chain_facts ORDER BY chain, dimension',
    ).all();

    expect(rows).toHaveLength(WAVE_FOUR.length * (CHAIN_DOSSIER_DIMENSIONS.length + 1));
    expect(validateChainDossierRows(rows, WAVE_FOUR)).toEqual([]);

    for (const chain of WAVE_FOUR) {
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

  it('preserves launch, token, custody, and migration boundaries', () => {
    const db = makeDB();
    db.exec(migration);
    const fact = (chain, dimension) => JSON.parse(db.prepare(
      'SELECT data FROM chain_facts WHERE chain = ? AND dimension = ?',
    ).get(chain, dimension).data);

    expect(fact('Starknet', 'identity')).toMatchObject({
      category: 'L2_rollup',
      vm: 'Cairo',
      launched: '2021-11-29',
    });
    expect(fact('Ink', 'token')).toMatchObject({
      launch_status: 'not_launched',
      token_symbol: null,
      announced_symbol: 'INK',
      gas_token: 'ETH',
    });
    expect(fact('Chainflip', 'risk').risks
      .some(({ type }) => type === 'threshold_custody')).toBe(true);
    expect(fact('Sei', 'identity').lifecycle
      .some(({ type }) => type === 'architecture_migration')).toBe(true);
    expect(fact('Unichain', 'token')).toMatchObject({
      launch_status: 'not_launched',
      token_symbol: null,
      gas_token: 'ETH',
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

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { CHAIN_DOSSIER_DIMENSIONS, validateChainDossierRows } from '../src/lib/chain-dossier.js';

const CHAINS = ['Osmosis', 'Celo', 'Hedera', 'Sonic', 'Gala'];
const migration = readFileSync(new URL('../migrations/0050_chain_dossiers_wave9.sql', import.meta.url), 'utf8');
const source = JSON.parse(readFileSync(new URL('../docs/top50-chain-dossiers-wave9-2026-07-29.json', import.meta.url), 'utf8'));
const makeDB = () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE chain_facts(chain TEXT,dimension TEXT,data TEXT NOT NULL,sources TEXT,updated_at TEXT,PRIMARY KEY(chain,dimension))');
  return db;
};

describe('live-snapshot correction chain wave nine', () => {
  it('publishes ranks 41-45 as five complete cited dossiers', () => {
    expect(source.map((item) => item.chain)).toEqual(CHAINS);
    expect(source.map((item) => item.live_rank)).toEqual([41, 42, 43, 44, 45]);
    const db = makeDB(); db.exec(migration);
    const rows = db.prepare('SELECT * FROM chain_facts ORDER BY chain,dimension').all();
    expect(rows).toHaveLength(CHAINS.length * (CHAIN_DOSSIER_DIMENSIONS.length + 1));
    expect(validateChainDossierRows(rows, CHAINS)).toEqual([]);
    for (const chain of CHAINS) {
      const facts = Object.fromEntries(rows.filter((row) => row.chain === chain).map((row) => [row.dimension, JSON.parse(row.data)]));
      expect(facts.synthesis.why, chain).toBeTruthy();
      expect(facts.synthesis.strategic_choices.length, chain).toBeGreaterThanOrEqual(3);
      expect(facts.synthesis.unknowns.length, chain).toBeGreaterThanOrEqual(3);
      expect(facts._meta.dimension_completeness_pct, chain).toBe(100);
      expect(facts._meta.live_snapshot_correction, chain).toBe(true);
    }
  });
  it('preserves lifecycle transitions', () => {
    const db = makeDB(); db.exec(migration);
    const fact = (chain, dimension) => JSON.parse(db.prepare('SELECT data FROM chain_facts WHERE chain=? AND dimension=?').get(chain, dimension).data);
    expect(fact('Celo', 'identity').lifecycle.some((x) => x.type === 'l2_transition')).toBe(true);
    expect(fact('Sonic', 'token')).toMatchObject({ token_symbol: 'S', legacy_token_symbol: 'FTM' });
    expect(fact('Hedera', 'identity').category).toBe('other');
    expect(fact('Gala', 'identity').aliases).toContain('GalaChain');
  });
  it('is idempotent', () => {
    const db = makeDB(); db.exec(migration); db.exec(migration);
    expect(db.prepare('SELECT count(*) count FROM chain_facts').get().count).toBe(45);
  });
});

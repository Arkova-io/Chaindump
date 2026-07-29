import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { CHAIN_DOSSIER_DIMENSIONS, validateChainDossierRows } from '../src/lib/chain-dossier.js';

const migration = readFileSync(new URL('../migrations/0026_bitcoin_chain_dossier.sql', import.meta.url), 'utf8');

function rowsAfterMigration() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE chain_facts (
    chain TEXT NOT NULL, dimension TEXT NOT NULL, data TEXT NOT NULL,
    sources TEXT, updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (chain, dimension)
  )`);
  db.exec(migration);
  const rows = db.prepare('SELECT chain, dimension, data, sources, updated_at FROM chain_facts').all();
  db.close();
  return rows;
}

describe('Bitcoin chain dossier', () => {
  it('publishes the complete public schema with sources and explicit live-data gaps', () => {
    const rows = rowsAfterMigration();
    expect(rows).toHaveLength(CHAIN_DOSSIER_DIMENSIONS.length + 1);
    expect(validateChainDossierRows(rows, ['Bitcoin'])).toEqual([]);
    const facts = Object.fromEntries(rows.map((row) => [row.dimension, JSON.parse(row.data)]));
    expect(facts.token).toMatchObject({ token_symbol: 'BTC', gas_token: 'BTC', max_supply: 21000000 });
    expect(facts.onchain.tvl_current_usd).toBeNull();
    expect(facts.onchain.fees_24h_usd).toBeNull();
    expect(facts._meta.unsourced_fields).toContain('onchain.current_activity_metrics');
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
    expect(db.prepare('SELECT count(*) AS count FROM chain_facts').get().count).toBe(9);
    db.close();
  });
});

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { CHAIN_DOSSIER_DIMENSIONS, validateChainDossierRows } from '../src/lib/chain-dossier.js';

const migration = readFileSync(new URL('../migrations/0028_cardano_chain_dossier.sql', import.meta.url), 'utf8');

describe('Cardano chain dossier', () => {
  it('publishes all eight cited dimensions while keeping unsupported live metrics null', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE chain_facts (chain TEXT NOT NULL, dimension TEXT NOT NULL, data TEXT NOT NULL, sources TEXT, updated_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (chain, dimension))`);
    db.exec(migration);
    const rows = db.prepare('SELECT chain, dimension, data, sources FROM chain_facts').all();
    expect(rows).toHaveLength(CHAIN_DOSSIER_DIMENSIONS.length + 1);
    expect(validateChainDossierRows(rows, ['Cardano'])).toEqual([]);
    const facts = Object.fromEntries(rows.map((row) => [row.dimension, JSON.parse(row.data)]));
    expect(facts.token).toMatchObject({ token_symbol: 'ADA', gas_token: 'ADA', max_supply: 45000000000 });
    expect(facts.token.supply_snapshot).toMatchObject({ evidence_date: '2026-06-13', epoch: 637 });
    expect(facts.onchain.tvl_current_usd).toBeNull();
    expect(facts._meta.unsourced_fields).toContain('onchain.tvl_and_dex_metrics');
    db.close();
  });
});

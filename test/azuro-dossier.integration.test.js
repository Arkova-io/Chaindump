import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const sql = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');

describe('Azuro publication-gated dossier', () => {
  it('publishes cited infrastructure facts while withholding commercial and legal conclusions', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(sql('0014_casino_analysis.sql'));
    db.exec(sql('0017_casino_verified_initial_cohort.sql'));
    db.exec(sql('0025_sx_bet_verified_dossier.sql'));
    db.exec(sql('0027_azuro_verified_dossier.sql'));
    const row = db.prepare(`SELECT c.entity_kind, c.product_subtype, c.status, c.outcome_label, c.custody_model, c.token_symbol, c.token_contracts, c.unsourced_fields,
      (SELECT COUNT(*) FROM casino_claims WHERE case_id = c.case_id) AS claim_count,
      (SELECT COUNT(*) FROM casino_sources s JOIN casino_claims cl ON cl.source_id = s.source_id WHERE cl.case_id = c.case_id AND s.resolving = 1 AND s.evidence_reviewed = 1) AS reviewed_claim_count
      FROM casino_cases c WHERE c.case_id = 'azuro'`).get();
    expect(row).toMatchObject({ entity_kind: 'gaming_infrastructure', product_subtype: 'prediction_market', status: 'active', outcome_label: 'unclassified', custody_model: 'noncustodial', token_symbol: 'AZUR', claim_count: 10, reviewed_claim_count: 10 });
    expect(JSON.parse(row.token_contracts)).toContainEqual(expect.objectContaining({ chain: 'Ethereum', contract_role: 'AZUR ERC-20' }));
    expect(JSON.parse(row.unsourced_fields)).toEqual(expect.arrayContaining(['gaming_licence', 'protocol_wagers', 'protocol_revenue', 'current_liquidity']));
    const metrics = db.prepare(`SELECT metric_dimension, value, quality_flags FROM casino_observations WHERE case_id = 'azuro' ORDER BY metric_dimension`).all();
    expect(metrics).toHaveLength(2);
    expect(JSON.parse(metrics[0].quality_flags)).toContain('not_current_circulating_supply');
    expect(db.prepare(`SELECT quality_passed_count, partial_count FROM casino_coverage WHERE cohort_id = 'web3-casino-initial-2026-07-29'`).get()).toEqual({ quality_passed_count: 4, partial_count: 21 });
    db.close();
  });
});

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const sql = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');

describe('SX Bet publication-gated dossier', () => {
  it('adds a fully cited, outcome-limited betting-exchange case', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(sql('0014_casino_analysis.sql'));
    db.exec(sql('0017_casino_verified_initial_cohort.sql'));
    db.exec(sql('0025_sx_bet_verified_dossier.sql'));
    const row = db.prepare(`SELECT c.status, c.outcome_label, c.custody_model, c.chains, c.token_status, c.token_symbol, c.quality_passed, c.unsourced_fields,
      (SELECT COUNT(*) FROM casino_claims WHERE case_id = c.case_id) AS claim_count,
      (SELECT COUNT(*) FROM casino_sources s JOIN casino_claims cl ON cl.source_id = s.source_id WHERE cl.case_id = c.case_id AND s.resolving = 1 AND s.evidence_reviewed = 1) AS reviewed_claim_count
      FROM casino_cases c WHERE c.case_id = 'sx-bet'`).get();
    expect(row).toMatchObject({ status: 'active', outcome_label: 'unclassified', custody_model: 'noncustodial', token_status: 'documented', token_symbol: 'SX', quality_passed: 1, claim_count: 7, reviewed_claim_count: 7 });
    expect(JSON.parse(row.chains)).toEqual(['SX mainnet (chain ID 4162)']);
    expect(JSON.parse(row.unsourced_fields)).toContain('comparable_operating_metric');
    const metric = db.prepare(`SELECT value, unit, quality_flags FROM casino_observations WHERE case_id = 'sx-bet'`).get();
    expect(metric.value).toBe(0);
    expect(metric.unit).toBe('percent');
    expect(JSON.parse(metric.quality_flags)).toContain('not_an_activity_metric');
    expect(db.prepare(`SELECT quality_passed_count, partial_count FROM casino_coverage WHERE cohort_id = 'web3-casino-initial-2026-07-29'`).get()).toEqual({ quality_passed_count: 3, partial_count: 22 });
    db.close();
  });
});

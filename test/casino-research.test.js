import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateCasinoResearch } from '../src/lib/casino-research.js';

const fixture = JSON.parse(
  readFileSync(
    new URL('../docs/web3-casino-cohort-2026-07-29.json', import.meta.url),
    'utf8',
  ),
);

describe('casino research cohort', () => {
  it('keeps licence observations and evidence-linked synthesis in the database contract', () => {
    const migration = readFileSync(
      new URL('../migrations/0014_casino_analysis.sql', import.meta.url),
      'utf8',
    );

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS casino_licences');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS casino_syntheses');
    expect(migration).toContain('source_claim_ids TEXT NOT NULL');
    expect(migration).toContain('evidence_reviewed INTEGER NOT NULL DEFAULT 0');
    expect(migration).toContain('evidence_reviewed_at TEXT');
    expect(migration).toContain('evidence_reviewer TEXT');
  });

  it('has 25 distinct, citation-mapped candidates and no publishable drafts', () => {
    const result = validateCasinoResearch(fixture);

    expect(result.errors).toEqual([]);
    expect(fixture.cases).toHaveLength(25);
    expect(new Set(fixture.cases.map((item) => item.case_id)).size).toBe(25);
    expect(fixture.cases.every((item) => item.quality.quality_passed === false)).toBe(true);
  });

  it('rejects a status without a mapped evidence claim', () => {
    const altered = structuredClone(fixture);
    altered.claims = altered.claims.filter((claim) => claim.case_id !== 'purebet');
    altered.cases.find((item) => item.case_id === 'purebet').claim_ids = [];

    expect(validateCasinoResearch(altered).errors).toContain(
      'purebet: status has no mapped claim',
    );
  });

  it('rejects publication when blockers remain', () => {
    const altered = structuredClone(fixture);
    const stake = altered.cases.find((item) => item.case_id === 'stake');
    stake.quality.quality_passed = true;
    stake.quality.completeness_pct = 90;
    altered.cohort.quality_passed_count = 1;

    expect(validateCasinoResearch(altered).errors).toContain(
      'stake: quality-passed case still has blockers',
    );
  });

  it('rejects publication when mapped evidence has not received editorial review', () => {
    const altered = structuredClone(fixture);
    const stake = altered.cases.find((item) => item.case_id === 'stake');
    stake.quality = {
      completeness_pct: 90,
      quality_passed: true,
      human_review_required: false,
      blockers: [],
    };
    stake.outcome_label = 'unclassified';
    stake.outcome_as_of = '2026-07-29';
    stake.outcome_rule_id = 'casino-outcome-v1';
    stake.confidence = 'medium';
    altered.cohort.quality_passed_count = 1;

    expect(validateCasinoResearch(altered).errors).toContain(
      'stake: quality-passed claim uses source without editorial evidence review',
    );
  });

  it('rejects an invented outcome label even for a draft candidate', () => {
    const altered = structuredClone(fixture);
    altered.cases.find((item) => item.case_id === 'stake').outcome_label = 'winner';

    expect(validateCasinoResearch(altered).errors).toContain(
      'stake: invalid outcome_label winner',
    );
  });

  it('publishes only the reviewed initial cohort and keeps the remaining candidates withheld', () => {
    const migration = readFileSync(
      new URL('../migrations/0017_casino_verified_initial_cohort.sql', import.meta.url),
      'utf8',
    );

    expect(migration).toContain("'overtime', 'Overtime'");
    expect(migration).toContain("'decentral-games-poker-arcade', 'Decentral Games Poker Arcade'");
    expect(migration).toContain('evidence_reviewed, evidence_reviewed_at, evidence_reviewer');
    expect(migration).toContain("'web3-casino-initial-2026-07-29', '2026-07-29', 25, 2, 23, 0");
    expect(migration).toContain('not_comparable_to_wager_or_revenue');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CASINO_PUBLICATION_CASE_IDS,
  summarizeCasinoPublicationCoverage,
} from '../src/lib/casino-publication-cohort.js';

async function freshWorker() {
  vi.resetModules();
  return (await import('../src/worker.js')).default;
}

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });
const PUBLISHED_CASE = {
  case_id: 'overtime',
  brand_name: 'Overtime',
  entity_kind: 'onchain_casino',
  product_subtype: 'sportsbook',
  primary_domain: 'overtimemarkets.xyz',
  custody_model: 'noncustodial',
  chains: '["Optimism","Arbitrum","Base"]',
  product_scope_note: 'Scoped onchain sports-market protocol dossier.',
  status: 'active',
  status_as_of: '2026-07-29',
  outcome_label: 'unclassified',
  outcome_as_of: '2026-07-29',
  token_status: 'documented',
  token_symbol: 'OVER',
  token_name: 'Overtime token',
  completeness_pct: 82,
  confidence: 'medium',
  unsourced_fields: '["licence","comparable_operating_metric"]',
  last_reviewed: '2026-07-29',
  forensic_review: JSON.stringify({
    status: 'current',
    last_reviewed_at: '2026-07-29',
    next_review_at: '2026-08-05',
  }),
  quality_passed: 1,
  source_count: 3,
  registered_source_count: 5,
  reachable_source_count: 4,
  reviewed_source_count: 3,
};

function makeDB({ published = [PUBLISHED_CASE], missingCoverage = [] } = {}) {
  return {
    prepare(sql) {
      return {
        bind(...binds) {
          this.binds = binds;
          return this;
        },
        async all() {
          if (sql.includes('FROM casino_cases c WHERE c.quality_passed = 1')) {
            return { results: published };
          }
          if (sql.includes('WHERE c.case_id = ? AND c.quality_passed = 1')) {
            const [caseId] = this.binds || [];
            return { results: published.filter((item) => item.case_id === caseId) };
          }
          if (sql.includes('WITH expected(case_id) AS')) {
            return {
              results: CASINO_PUBLICATION_CASE_IDS.map((caseId) => ({
                expected_case_id: caseId,
                present_case_id: missingCoverage.includes(caseId) ? null : caseId,
                quality_passed: missingCoverage.includes(caseId) ? null : 1,
                selection_as_of: missingCoverage.includes(caseId) ? null : '2026-07-29',
                updated_at: missingCoverage.includes(caseId) ? null : '2026-07-29',
              })),
            };
          }
          if (sql.includes('FROM casino_claims')) {
            return {
              results: [{
                case_id: 'overtime',
                claim_id: 'casino:claim:overtime:status',
                field_path: 'status.active',
                evidence_locator: 'Current operator page presents an active protocol.',
                claim_type: 'status',
                support_direction: 'supports',
                analyst_note: 'Operator-reported status only.',
                source_id: 'casino:source:overtime:how',
                title: 'How Overtime Works',
                url: 'https://docs.overtime.io/learn-about-overtime/how-overtime-works',
                publisher: 'Overtime Documentation',
                accessed_at: '2026-07-29',
                source_tier: 'B',
                source_role: 'primary',
                resolving: 1,
                evidence_reviewed: 0,
                evidence_reviewed_at: null,
                evidence_reviewer: null,
              }],
            };
          }
          if (sql.includes('FROM casino_syntheses')) {
            return {
              results: [{
                case_id: 'overtime',
                outlook: JSON.stringify({
                  classification: 'unclassified',
                  forensic_analysis: {
                    version: 'forensic-analysis-v1',
                    review: {
                      status: 'current',
                      last_reviewed_at: '2026-07-29',
                      next_review_at: '2026-08-05',
                    },
                  },
                }),
                lessons_learned: '[]',
                source_claim_ids: '[]',
              }],
            };
          }
          return { results: [] };
        },
      };
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('casino publication routes', () => {
  it('uses an explicit public case projection for dossier detail', async () => {
    const worker = await freshWorker();
    const response = await worker.fetch(new Request('http://localhost/api/casino/overtime'), { DB: makeDB() }, ctx());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.synthesis.forensic_analysis).toMatchObject({
      version: 'forensic-analysis-v1',
      review: {
        status: 'current',
        last_reviewed_at: '2026-07-29',
        next_review_at: '2026-08-05',
      },
    });
    expect(body.case).toMatchObject({
      registered_source_count: 5,
      reachable_source_count: 4,
      reviewed_source_count: 3,
    });
    expect(body.sources).toEqual([expect.objectContaining({
      id: 'casino:source:overtime:how',
      source_tier: 'B',
      source_role: 'primary',
      registered: true,
      resolving: true,
      reachable: true,
      evidence_reviewed: false,
      evidence_reviewed_at: null,
      evidence_reviewer: null,
    })]);
    expect(body.publication_depth).toMatchObject({
      status: 'claim_support_pending',
      unresolved_high_risk_claim_count: expect.any(Number),
    });
    expect(body.publication_depth.unresolved_high_risk_claim_count).toBeGreaterThan(0);
    expect(body.claims[0].publication_support).toBe('pending_independent_support');
  });

  it('lists only quality-passed dossiers with reviewed-source counts', async () => {
    const worker = await freshWorker();
    const response = await worker.fetch(
      new Request('http://localhost/api/casinos?status=active'),
      { DB: makeDB() },
      ctx(),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.count).toBe(1);
    expect(body.cases[0]).toMatchObject({
      case_id: 'overtime',
      source_count: 3,
      registered_source_count: 5,
      reachable_source_count: 4,
      reviewed_source_count: 3,
    });
    expect(body.cases[0].chains).toEqual(['Optimism', 'Arbitrum', 'Base']);
    expect(body.cases[0].unsourced_fields).toEqual(['licence', 'comparable_operating_metric']);
    expect(body.cases[0].forensic_review).toMatchObject({ next_review_at: '2026-08-05' });
    expect(body.cases[0].publication_depth).toMatchObject({
      status: 'claim_support_pending',
      unresolved_high_risk_claim_count: expect.any(Number),
    });
    expect(body.claim_support).toMatchObject({
      high_risk_claim_count: expect.any(Number),
      unresolved_high_risk_claim_count: expect.any(Number),
    });
  });

  it('does not expose an unpublished candidate through the detail route', async () => {
    const worker = await freshWorker();
    const response = await worker.fetch(
      new Request('http://localhost/api/casino/stake'),
      { DB: makeDB() },
      ctx(),
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe('published casino dossier not found');
  });

  it('returns truthful full-corpus coverage separately from the public cases', async () => {
    const worker = await freshWorker();
    const response = await worker.fetch(
      new Request('http://localhost/api/casino-coverage'),
      { DB: makeDB() },
      ctx(),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).coverage).toMatchObject({
      cohort_id: 'web3-casino-full-corpus-2026-07-29',
      target_count: 29,
      quality_passed_count: 29,
      partial_count: 0,
      missing_count: 0,
      missing_case_ids: [],
    });
  });

  it('keeps the 29-case denominator and names a deleted dossier as missing', async () => {
    const missingCaseId = 'zkasino-alleged-platform';
    const worker = await freshWorker();
    const response = await worker.fetch(
      new Request('http://localhost/api/casino-coverage'),
      { DB: makeDB({ missingCoverage: [missingCaseId] }) },
      ctx(),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).coverage).toMatchObject({
      target_count: 29,
      present_count: 28,
      quality_passed_count: 28,
      partial_count: 0,
      missing_count: 1,
      missing_case_ids: [missingCaseId],
    });
  });

  it('summarizes an absent row as missing instead of shrinking the cohort', () => {
    const rows = CASINO_PUBLICATION_CASE_IDS.slice(0, -1).map((caseId) => ({
      expected_case_id: caseId,
      present_case_id: caseId,
      quality_passed: 1,
      updated_at: '2026-07-29',
    }));
    expect(summarizeCasinoPublicationCoverage(rows)).toMatchObject({
      target_count: 29,
      present_count: 28,
      quality_passed_count: 28,
      missing_count: 1,
      missing_case_ids: ['zkasino-alleged-platform'],
    });
  });
});

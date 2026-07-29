import { afterEach, describe, expect, it, vi } from 'vitest';

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
};

function makeDB({ published = [PUBLISHED_CASE] } = {}) {
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
          if (sql.includes('FROM casino_cases c WHERE c.case_id')) {
            const [caseId] = this.binds || [];
            return { results: published.filter((item) => item.case_id === caseId) };
          }
          if (sql.includes("'web3-casino-full-corpus-2026-07-29' AS cohort_id")) {
            return {
              results: [{
                cohort_id: 'web3-casino-full-corpus-2026-07-29',
                universe_as_of: '2026-07-29',
                target_count: 29,
                quality_passed_count: 29,
                partial_count: 0,
                missing_count: 0,
              }],
            };
          }
          if (sql.includes('FROM casino_claims')) {
            return {
              results: [{
                source_id: 'casino:source:overtime:how',
                title: 'How Overtime Works',
                url: 'https://docs.overtime.io/learn-about-overtime/how-overtime-works',
                publisher: 'Overtime Documentation',
                accessed_at: '2026-07-29',
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
    expect(body.cases[0]).toMatchObject({ case_id: 'overtime', source_count: 3 });
    expect(body.cases[0].chains).toEqual(['Optimism', 'Arbitrum', 'Base']);
    expect(body.cases[0].unsourced_fields).toEqual(['licence', 'comparable_operating_metric']);
    expect(body.cases[0].forensic_review).toMatchObject({ next_review_at: '2026-08-05' });
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
    });
  });
});

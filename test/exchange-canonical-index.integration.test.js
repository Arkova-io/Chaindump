import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

function createCorpus() {
  const database = new DatabaseSync(':memory:');
  const files = readdirSync(new URL('../migrations/', import.meta.url))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
  for (const file of files) {
    database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  return database;
}

function d1(database) {
  return {
    prepare(sql) {
      let bindings = [];
      return {
        bind(...values) {
          bindings = values;
          return this;
        },
        async all() {
          return { results: database.prepare(sql).all(...bindings) };
        },
        async first() {
          return database.prepare(sql).get(...bindings) ?? null;
        },
      };
    },
  };
}

async function freshWorker() {
  vi.resetModules();
  return (await import('../src/worker.js')).default;
}

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });
let database;

afterEach(() => {
  database?.close();
  database = undefined;
  vi.unstubAllGlobals();
});

describe('canonical exchange profiles on the exchange index', () => {
  it('projects PancakeSwap outcome, explanation, sources and completeness into its card row', async () => {
    database = createCorpus();
    const worker = await freshWorker();
    const response = await worker.fetch(
      new Request('http://localhost/api/exchange-analysis?kind=dex&slug=pancakeswap'),
      { DB: d1(database) },
      ctx(),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.cases).toHaveLength(1);
    expect(payload.cases[0]).toMatchObject({
      lifecycle: 'successful',
      status: null,
      summary: null,
      outlook: null,
      analysis: {
        forensic_analysis_status: 'support_pending',
        canonical_evidence: {
          outcome_available: true,
          explanation_complete: true,
          complete_sections: 10,
          total_sections: 10,
          quality_completeness_pct: 100,
          source_count: 13,
          publication_state: 'review',
          freshness_state: 'current',
          preview: {
            outcome_label: 'successful_established',
            summary: expect.stringContaining('The strongest supported explanation is a reinforcing combination'),
            outlook: expect.any(String),
          },
        },
      },
    });
    expect(payload.cases[0].sources.length).toBeGreaterThanOrEqual(13);
    expect(payload.cases[0].publication_depth.status).toBe('claim_support_pending');
    expect(payload.cases[0].publication_support.status).toBe('pending_independent_support');
    expect(payload.cases[0].analysis.forensic_analysis.outcome.publication_support)
      .toBe('pending_independent_support');
    expect(payload.summary.trendReadiness.causalDossiers).toBe(1);
  });

  it('does not report zero explained DEX outcomes when complete canonical profiles exist', async () => {
    database = createCorpus();
    const worker = await freshWorker();
    const response = await worker.fetch(
      new Request('http://localhost/api/exchange-analysis?kind=dex'),
      { DB: d1(database) },
      ctx(),
    );
    const payload = await response.json();
    const canonicalRows = payload.cases.filter((row) => (
      row.analysis?.canonical_evidence?.explanation_complete === true
    ));

    expect(canonicalRows.length).toBeGreaterThanOrEqual(5);
    expect(canonicalRows.every((row) => row.analysis.canonical_evidence.publication_state === 'review'))
      .toBe(true);
    expect(payload.summary.trendReadiness.causalDossiers).toBeGreaterThanOrEqual(
      canonicalRows.length,
    );
  });

  it('does not count a 100%-marked canonical profile whose sections are shallow placeholders', async () => {
    database = createCorpus();
    const stored = database.prepare(
      "SELECT profile FROM successful_exchanges WHERE slug = 'pancakeswap'",
    ).get();
    const profile = JSON.parse(stored.profile);
    const sections = profile.canonical_profile.analysis.sections;
    Object.keys(sections).forEach((key, index) => {
      sections[key].body = index % 2 === 0
        ? 'Unknown / not published for this report.'
        : 'Brief.';
    });
    profile.canonical_profile.quality.completeness_pct = 100;
    database.prepare(
      "UPDATE successful_exchanges SET profile = ? WHERE slug = 'pancakeswap'",
    ).run(JSON.stringify(profile));

    const worker = await freshWorker();
    const response = await worker.fetch(
      new Request('http://localhost/api/exchange-analysis?kind=dex&slug=pancakeswap'),
      { DB: d1(database) },
      ctx(),
    );
    const payload = await response.json();

    expect(payload.cases[0].analysis.canonical_evidence).toMatchObject({
      outcome_available: true,
      explanation_complete: false,
      complete_sections: 0,
      total_sections: 10,
      quality_completeness_pct: 100,
      preview: null,
    });
    expect(payload.cases[0].analysis.forensic_analysis_status).toBe('support_pending');
    expect(payload.summary.trendReadiness.causalDossiers).toBe(0);
  });

  it('does not count ten substantive sections when canonical completeness is below 100%', async () => {
    database = createCorpus();
    const stored = database.prepare(
      "SELECT profile FROM successful_exchanges WHERE slug = 'pancakeswap'",
    ).get();
    const profile = JSON.parse(stored.profile);
    profile.canonical_profile.quality.completeness_pct = 99;
    database.prepare(
      "UPDATE successful_exchanges SET profile = ? WHERE slug = 'pancakeswap'",
    ).run(JSON.stringify(profile));

    const worker = await freshWorker();
    const response = await worker.fetch(
      new Request('http://localhost/api/exchange-analysis?kind=dex&slug=pancakeswap'),
      { DB: d1(database) },
      ctx(),
    );
    const payload = await response.json();

    expect(payload.cases[0].analysis.canonical_evidence).toMatchObject({
      explanation_complete: false,
      complete_sections: 10,
      total_sections: 10,
      quality_completeness_pct: 99,
      preview: null,
    });
    expect(payload.summary.trendReadiness.causalDossiers).toBe(0);
  });
});

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const document = JSON.parse(readFileSync(
  new URL('../docs/casino-forensic-completion-2026-07-29.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0056_casino_forensic_completion.sql', import.meta.url),
  'utf8',
);
const expectedIds = [
  'azuro',
  'overtime',
  'sx-bet',
  'decentral-games-poker-arcade',
];

function migrationDocument() {
  const match = migration.match(
    /-- canonical-payload-start[\s\S]*?VALUES \('([\s\S]*?)'\)\n\)\nINSERT OR REPLACE/,
  );
  if (!match) throw new Error('0056 canonical payload not found');
  return JSON.parse(match[1].replaceAll("''", "'"));
}

function applyCorpusMigrations(database) {
  const directory = new URL('../migrations/', import.meta.url);
  const files = readdirSync(directory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .filter((file) => Number(file.slice(0, 4)) <= 56)
    .sort();

  for (const file of files) {
    database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
}

function createCorpus() {
  const database = new DatabaseSync(':memory:');
  applyCorpusMigrations(database);
  return database;
}

function d1Adapter(database) {
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
      };
    },
  };
}

function evidenceReferences(analysis) {
  return [
    ...analysis.outcome.source_refs,
    ...analysis.why.source_refs,
    ...analysis.strategic_choices.flatMap((choice) => choice.source_refs),
    ...analysis.counterfactual.source_refs,
    ...analysis.watch.flatMap((watch) => watch.source_refs),
  ];
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

describe('casino forensic completion', () => {
  it('keeps the generated migration identical to the cited completion manifest', () => {
    expect(migrationDocument()).toEqual(document);
    expect(document.schema).toBe('forensic-analysis-v1');
    expect(document.generated_migration).toBe('0056_casino_forensic_completion.sql');
    expect(document.cases.map(({ case_id: caseId }) => caseId)).toEqual(expectedIds);
  });

  it('publishes supported causal sections and explicit weekly freshness', () => {
    for (const entry of document.cases) {
      expect(validateForensicAnalysis(entry.forensic_analysis), entry.case_id).toEqual({
        errors: [],
        warnings: [],
        withheld_sections: [],
      });
      expect(entry.forensic_analysis.outcome.label).toBe('unclassified');
      expect(entry.forensic_analysis.why.summary.length).toBeGreaterThan(300);
      expect(entry.forensic_analysis.strategic_choices.length).toBeGreaterThanOrEqual(4);
      expect(entry.forensic_analysis.watch.length).toBeGreaterThanOrEqual(3);
      expect(entry.forensic_analysis.unknowns.length).toBeGreaterThanOrEqual(4);
      expect(entry.forensic_analysis.review).toEqual({
        status: 'current',
        last_reviewed_at: '2026-07-29',
        next_review_at: '2026-08-05',
        reviewer: 'chaindump-research-desk',
      });

      const citedUrls = new Set(entry.source_urls);
      for (const reference of evidenceReferences(entry.forensic_analysis)) {
        expect(citedUrls.has(reference), `${entry.case_id}: ${reference}`).toBe(true);
      }
    }
  });

  it('closes the causal-map gap for all 29 published casino cases and is idempotent', () => {
    database = createCorpus();

    const rows = database.prepare(`
      SELECT c.case_id, c.outcome_label, s.outlook
      FROM casino_cases AS c
      JOIN casino_syntheses AS s USING (case_id)
      WHERE c.quality_passed = 1
      ORDER BY c.case_id
    `).all();
    expect(rows).toHaveLength(29);

    for (const row of rows) {
      const analysis = JSON.parse(row.outlook || '{}').forensic_analysis;
      expect(analysis?.version, row.case_id).toBe('forensic-analysis-v1');
      expect(validateForensicAnalysis(analysis), row.case_id).toEqual({
        errors: [],
        warnings: [],
        withheld_sections: [],
      });
    }

    for (const entry of document.cases) {
      const row = rows.find(({ case_id: caseId }) => caseId === entry.case_id);
      expect(JSON.parse(row.outlook).forensic_analysis).toEqual(entry.forensic_analysis);
      const databaseSources = new Set(database.prepare(`
        SELECT DISTINCT s.canonical_url
        FROM casino_claims AS c
        JOIN casino_sources AS s USING (source_id)
        WHERE c.case_id = ? AND s.resolving = 1 AND s.evidence_reviewed = 1
      `).all(entry.case_id).map(({ canonical_url: url }) => url));
      for (const reference of evidenceReferences(entry.forensic_analysis)) {
        expect(databaseSources.has(reference), `${entry.case_id}: ${reference}`).toBe(true);
      }
    }

    const before = Object.fromEntries(rows.map((row) => [row.case_id, row.outlook]));
    database.exec(migration);
    for (const row of database.prepare(`
      SELECT case_id, outlook FROM casino_syntheses ORDER BY case_id
    `).all()) {
      expect(row.outlook).toBe(before[row.case_id]);
    }
    expect(database.prepare(`
      SELECT COUNT(*) AS count
      FROM sqlite_temp_master
      WHERE type = 'table' AND name = 'casino_forensic_completion_0056'
    `).get().count).toBe(0);
  });

  it('renders every published analysis through the public list and detail APIs', async () => {
    database = createCorpus();
    const worker = await freshWorker();
    const env = { DB: d1Adapter(database) };

    const listResponse = await worker.fetch(
      new Request('http://localhost/api/casinos?sort=name'),
      env,
      ctx(),
    );
    expect(listResponse.status).toBe(200);
    const list = await listResponse.json();
    expect(list.count).toBe(29);
    expect(list.cases).toHaveLength(29);
    expect(list.cases.every((entry) => entry.forensic_review?.next_review_at)).toBe(true);

    for (const listed of list.cases) {
      const response = await worker.fetch(
        new Request(`http://localhost/api/casino/${listed.case_id}`),
        env,
        ctx(),
      );
      expect(response.status, listed.case_id).toBe(200);
      const dossier = await response.json();
      expect(dossier.case.case_id).toBe(listed.case_id);
      expect(dossier.sources.length, listed.case_id).toBeGreaterThan(0);
      const forensicGaps = dossier.publication_depth.unresolved_high_risk_claims
        .filter(({ path }) => path.startsWith('forensic_analysis.'));
      if (!forensicGaps.length) {
        expect(validateForensicAnalysis(dossier.synthesis.forensic_analysis), listed.case_id)
          .toEqual({
            errors: [],
            warnings: [],
            withheld_sections: [],
          });
        continue;
      }
      for (const { path } of forensicGaps) {
        const choiceMatch = /^forensic_analysis\.strategic_choices\[(\d+)\]$/.exec(path);
        const section = choiceMatch
          ? dossier.synthesis.forensic_analysis.strategic_choices[Number(choiceMatch[1])]
          : dossier.synthesis.forensic_analysis[path.replace('forensic_analysis.', '')];
        expect(section, `${listed.case_id}: ${path}`).toMatchObject({
          publication_support: 'pending_independent_support',
        });
      }
    }
  });
});

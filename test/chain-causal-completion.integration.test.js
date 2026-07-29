import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const expectedChains = [
  'Arbitrum',
  'Avalanche',
  'BSC',
  'Base',
  'Bitcoin',
  'Cardano',
  'Ethereum',
  'Hyperliquid L1',
  'Mantle',
  'Monad',
  'OP Mainnet',
  'Polygon',
  'Robinhood Chain',
  'Solana',
  'Tron',
];
const manifestUrl = new URL(
  '../docs/chain-causal-completion-2026-07-29.json',
  import.meta.url,
);
const migrationUrl = new URL(
  '../migrations/0062_chain_causal_completion.sql',
  import.meta.url,
);

function loadArtifacts() {
  return {
    document: JSON.parse(readFileSync(manifestUrl, 'utf8')),
    migration: readFileSync(migrationUrl, 'utf8'),
  };
}

function migrationDocument(migration) {
  const match = migration.match(
    /-- canonical-payload-start[\s\S]*?VALUES \('([\s\S]*?)'\)\n\)/,
  );
  if (!match) throw new Error('0062 canonical payload not found');
  return JSON.parse(match[1].replaceAll("''", "'"));
}

function applyMigrations(database, through = 62) {
  const migrationDirectory = new URL('../migrations/', import.meta.url);
  const files = readdirSync(migrationDirectory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .filter((file) => Number(file.slice(0, 4)) <= through)
    .sort();
  for (const file of files) {
    database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
}

function d1(database) {
  return {
    prepare(sql) {
      return {
        bindings: [],
        bind(...bindings) {
          this.bindings = bindings;
          return this;
        },
        async all() {
          return { results: database.prepare(sql).all(...this.bindings) };
        },
        async first() {
          return database.prepare(sql).get(...this.bindings) ?? null;
        },
        async run() {
          return database.prepare(sql).run(...this.bindings);
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

describe('chain causal completion migration 0062', () => {
  it('keeps generated SQL identical to the checked research manifest', () => {
    const { document, migration } = loadArtifacts();
    expect(migrationDocument(migration)).toEqual(document);
    expect(migration).not.toMatch(/\bCREATE\s+TEMP(?:ORARY)?\s+TABLE\b/i);
    expect(document.schema).toBe('chaindump-chain-causal-completion-v1');
    expect(document.research_as_of).toBe('2026-07-29');
    expect(document.cases.map(({ chain }) => chain).sort()).toEqual(expectedChains);
  });

  it('publishes deep, evidence-resolving causal contracts instead of boilerplate', () => {
    const { document } = loadArtifacts();
    for (const entry of document.cases) {
      const sourceById = Object.fromEntries(entry.sources.map((source) => [source.id, source]));
      expect(new Set(entry.sources.map(({ id }) => id)).size, entry.chain)
        .toBe(entry.sources.length);
      for (const source of entry.sources) {
        expect(source.checked_at, `${entry.chain}:${source.id}`).toBe('2026-07-29');
        expect(source.url, `${entry.chain}:${source.id}`).toMatch(/^https:\/\//);
        expect(source.source_role, `${entry.chain}:${source.id}`).toBeTruthy();
      }
      expect(
        validateForensicAnalysis(entry.forensic_analysis, { resolver: sourceById }),
        entry.chain,
      ).toEqual({ errors: [], warnings: [], withheld_sections: [] });
      expect(entry.forensic_analysis.why.summary.length, entry.chain).toBeGreaterThanOrEqual(350);
      expect(entry.forensic_analysis.strategic_choices.length, entry.chain)
        .toBeGreaterThanOrEqual(4);
      expect(entry.forensic_analysis.watch.length, entry.chain).toBeGreaterThanOrEqual(3);
      expect(entry.forensic_analysis.unknowns.length, entry.chain).toBeGreaterThanOrEqual(4);
      expect(entry.forensic_analysis.review).toMatchObject({
        status: 'current',
        last_reviewed_at: '2026-07-29',
        reviewer: 'chaindump-research-desk',
      });
    }
  });

  it('patches only synthesis and review metadata, stays idempotent, and preserves every source', () => {
    const { document, migration } = loadArtifacts();
    database = new DatabaseSync(':memory:');
    applyMigrations(database, 60);
    const before = Object.fromEntries(document.cases.map(({ chain }) => [
      chain,
      database.prepare(`
        SELECT dimension, data, sources, updated_at
        FROM chain_facts WHERE chain = ? ORDER BY dimension
      `).all(chain),
    ]));

    database.exec(migration);
    for (const entry of document.cases) {
      const rows = database.prepare(`
        SELECT dimension, data, sources, updated_at
        FROM chain_facts WHERE chain = ? ORDER BY dimension
      `).all(entry.chain);
      expect(rows).toHaveLength(before[entry.chain].length);
      const priorByDimension = Object.fromEntries(
        before[entry.chain].map((row) => [row.dimension, row]),
      );
      for (const row of rows.filter(({ dimension }) => (
        dimension !== 'synthesis' && dimension !== '_meta'
      ))) {
        expect(row, `${entry.chain}:${row.dimension}`).toEqual(priorByDimension[row.dimension]);
      }

      const synthesis = rows.find(({ dimension }) => dimension === 'synthesis');
      expect(JSON.parse(synthesis.data).forensic_analysis).toEqual(entry.forensic_analysis);
      const beforeSourceUrls = JSON.parse(priorByDimension.synthesis.sources)
        .map(({ url }) => url);
      const afterSourceUrls = JSON.parse(synthesis.sources).map(({ url }) => url);
      expect(afterSourceUrls, entry.chain).toEqual(expect.arrayContaining(beforeSourceUrls));
      expect(new Set(afterSourceUrls).size, entry.chain).toBe(afterSourceUrls.length);

      const meta = JSON.parse(rows.find(({ dimension }) => dimension === '_meta').data);
      expect(meta).toMatchObject({
        forensic_analysis_version: 'forensic-analysis-v1',
        last_reviewed: '2026-07-29',
        next_review_at: entry.forensic_analysis.review.next_review_at,
      });
    }

    const first = database.prepare(`
      SELECT chain, dimension, data, sources, updated_at
      FROM chain_facts
      WHERE chain IN (${expectedChains.map(() => '?').join(',')})
      ORDER BY chain, dimension
    `).all(...expectedChains);
    database.exec(migration);
    expect(database.prepare(`
      SELECT chain, dimension, data, sources, updated_at
      FROM chain_facts
      WHERE chain IN (${expectedChains.map(() => '?').join(',')})
      ORDER BY chain, dimension
    `).all(...expectedChains)).toEqual(first);
  });

  it('serves each causal dossier through the chain API and has a visible chain UI section', async () => {
    const { document } = loadArtifacts();
    database = new DatabaseSync(':memory:');
    applyMigrations(database);
    const worker = await freshWorker();
    for (const entry of document.cases) {
      const response = await worker.fetch(
        new Request(`http://localhost/api/chain/${encodeURIComponent(entry.chain)}`),
        { DB: d1(database) },
        ctx(),
      );
      expect(response.status, entry.chain).toBe(200);
      const body = await response.json();
      expect(body.facts.synthesis.data.forensic_analysis, entry.chain)
        .toEqual(entry.forensic_analysis);
    }

    const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    expect(html).toContain('forensicAnalysisHtml(d.forensic_analysis');
    expect(html).toContain('Why this outcome');
    expect(html).toContain('Strategic choices');
    expect(html).toContain('What could have been different');
    expect(html).toContain('What would change our mind');
    expect(html).toContain('Material unknowns');
  }, 20_000);
});

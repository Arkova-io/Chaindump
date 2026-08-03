import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { unstable_splitSqlQuery } from 'wrangler';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const expectedChains = ['Algorand', 'Aptos', 'Near', 'Stellar', 'Sui'];
const expectedOutcomes = {
  Algorand: 'declining',
  Aptos: 'middling',
  Near: 'middling',
  Stellar: 'successful',
  Sui: 'middling',
};
const expectedTvlObservations = {
  Algorand: { latest: 29_602_811, peak: 319_103_080, drawdown: 90.72 },
  Aptos: { latest: 62_216_305, peak: 1_305_084_571, drawdown: 95.23 },
  Near: { latest: 60_116_428, peak: 481_722_005, drawdown: 87.52 },
  Stellar: { latest: 214_161_726, peak: 243_985_238, drawdown: 12.22 },
  Sui: { latest: 417_197_859, peak: 2_636_094_260, drawdown: 84.17 },
};
const observationTimestamp = '2026-08-03T17:15:40.082Z';
const manifestUrl = new URL(
  '../docs/chain-causal-completion-2026-08-03.json',
  import.meta.url,
);
const migrationUrl = new URL(
  '../migrations/0073_chain_causal_completion_wave_b.sql',
  import.meta.url,
);
const maxD1StatementBytes = 95_000;

function loadArtifacts() {
  const manifest = readFileSync(manifestUrl, 'utf8');
  return {
    document: JSON.parse(manifest),
    manifest,
    migration: readFileSync(migrationUrl, 'utf8'),
  };
}

function migrationCases(migration) {
  const matches = [...migration.matchAll(
    /-- canonical-case-start ([^\n]+)\nWITH causal_seed\(payload\) AS \(\n {2}VALUES \('([\s\S]*?)'\)\n\)\nUPDATE chain_facts AS facts/g,
  )];
  return matches.map(([, marker, payload]) => {
    const entry = JSON.parse(payload.replaceAll("''", "'"));
    if (marker !== entry.chain) throw new Error(`0073 marker mismatch for ${entry.chain}`);
    return entry;
  });
}

function caseStatementByteLengths(migration) {
  return [...migration.matchAll(
    /-- canonical-case-start [\s\S]*?\n {2}AND facts\.dimension IN \('synthesis', '_meta'\);/g,
  )].map(([statement]) => Buffer.byteLength(statement, 'utf8'));
}

function collectSourceRefs(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectSourceRefs(item, found);
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value.source_refs)) found.push(...value.source_refs);
  for (const child of Object.values(value)) collectSourceRefs(child, found);
  return found;
}

function applyMigrations(database, through = Infinity) {
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

function stubChainFeeds() {
  const universe = expectedChains.map((name, index) => ({
    name,
    tvl: 500_000_000 - (index * 1_000_000),
    tokenSymbol: null,
    gecko_id: null,
    chainId: index + 1,
  }));
  const overview = {
    protocols: universe.map(({ name }, index) => ({
      name: `Protocol${index}`,
      category: 'Dexs',
      breakdown24h: { [name]: { [`Protocol${index}`]: 1_000_000 - index } },
    })),
  };
  const json = (value) => new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
  });
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const value = String(url);
    if (value.includes('/v2/chains')) return json(universe);
    if (value.includes('/overview/dexs?') || value.includes('/overview/fees?')) {
      return json(overview);
    }
    if (value.includes('/overview/dexs/') || value.includes('/overview/fees/')) {
      return json({ total24h: 1 });
    }
    if (value.includes('/v2/historicalChainTvl/')) return json([]);
    if (value.includes('/stablecoinchains')) return json([]);
    return new Response('', { status: 503 });
  }));
}

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });
let database;
let apiDatabase;
let apiWorker;

afterEach(() => {
  database?.close();
  database = undefined;
  vi.unstubAllGlobals();
});

describe('chain causal completion wave migration 0073', () => {
  beforeAll(async () => {
    apiDatabase = new DatabaseSync(':memory:');
    applyMigrations(apiDatabase);
    apiWorker = await freshWorker();
  });

  afterAll(() => {
    apiDatabase?.close();
    apiDatabase = undefined;
  });

  it('keeps the generated migration identical to the checked research manifest', () => {
    const { document, manifest, migration } = loadArtifacts();
    expect(document).toMatchObject({
      schema: 'chaindump-chain-causal-completion-v1',
      research_as_of: '2026-08-03',
    });
    expect(document.cases.map(({ chain }) => chain).sort()).toEqual(expectedChains);
    expect(migrationCases(migration)).toEqual(document.cases);
    expect(migration).toContain(
      `canonical-manifest-sha256 ${createHash('sha256').update(manifest).digest('hex')}`,
    );
    expect(migration).not.toMatch(/\bCREATE\s+TEMP(?:ORARY)?\s+TABLE\b/i);
    const statementBytes = caseStatementByteLengths(migration);
    expect(statementBytes).toHaveLength(expectedChains.length);
    expect(Math.max(...statementBytes)).toBeLessThanOrEqual(maxD1StatementBytes);
    const wranglerStatements = unstable_splitSqlQuery(migration);
    expect(wranglerStatements).toHaveLength(expectedChains.length);
    expect(Math.max(...wranglerStatements.map(
      (statement) => Buffer.byteLength(statement, 'utf8'),
    ))).toBeLessThanOrEqual(maxD1StatementBytes);
  });

  it('publishes deep, evidence-resolving contracts with honest unknowns', () => {
    const { document } = loadArtifacts();
    expect(document.cases.reduce((sum, entry) => sum + entry.sources.length, 0)).toBe(54);
    for (const entry of document.cases) {
      const sourceById = Object.fromEntries(entry.sources.map((source) => [source.id, source]));
      expect(new Set(entry.sources.map(({ id }) => id)).size, entry.chain)
        .toBe(entry.sources.length);
      expect(new Set(entry.sources.map(({ url }) => url)).size, entry.chain)
        .toBe(entry.sources.length);
      expect(entry.sources.some(({ source_role: role }) => role === 'independent-data'), entry.chain)
        .toBe(true);
      for (const source of entry.sources) {
        expect(source, `${entry.chain}:${source.id}`).toMatchObject({
          id: expect.any(String),
          title: expect.any(String),
          publisher: expect.any(String),
          url: expect.stringMatching(/^https:\/\//),
          source_role: expect.any(String),
          checked_at: '2026-08-03',
        });
      }
      expect(
        validateForensicAnalysis(entry.forensic_analysis, { resolver: sourceById }),
        entry.chain,
      ).toEqual({ errors: [], warnings: [], withheld_sections: [] });
      expect(entry.forensic_analysis.outcome.label, entry.chain)
        .toBe(expectedOutcomes[entry.chain]);
      const observation = entry.forensic_analysis.observation_snapshot;
      const expectedTvl = expectedTvlObservations[entry.chain];
      expect(observation, entry.chain).toMatchObject({
        observed_at: observationTimestamp,
        provider: 'DefiLlama',
        historical_tvl_point_date: '2026-08-03',
        latest_tvl_usd: expectedTvl.latest,
        peak_tvl_usd: expectedTvl.peak,
        tvl_drawdown_pct: expectedTvl.drawdown,
        dex_volume_30d_usd: expect.any(Number),
        fees_30d_usd: expect.any(Number),
        revenue_30d_usd: expect.any(Number),
      });
      expect(observation.method, entry.chain).toContain('can be revised');
      expect(
        Number(((1 - (expectedTvl.latest / expectedTvl.peak)) * 100).toFixed(2)),
        entry.chain,
      ).toBe(expectedTvl.drawdown);
      expect(entry.forensic_analysis.outcome.summary, entry.chain)
        .toContain(observationTimestamp);
      expect(entry.forensic_analysis.outcome.summary, entry.chain)
        .toContain('Same-day provider values may revise');
      expect(entry.forensic_analysis.why.summary.length, entry.chain).toBeGreaterThanOrEqual(350);
      expect(entry.forensic_analysis.strategic_choices.length, entry.chain)
        .toBeGreaterThanOrEqual(4);
      expect(entry.forensic_analysis.watch.length, entry.chain).toBeGreaterThanOrEqual(3);
      expect(entry.forensic_analysis.unknowns.length, entry.chain).toBeGreaterThanOrEqual(4);
      expect(entry.forensic_analysis.review).toEqual({
        status: 'current',
        last_reviewed_at: '2026-08-03',
        next_review_at: '2026-08-10',
        reviewer: 'chaindump-research-desk',
      });
      for (const sourceRef of collectSourceRefs(entry.forensic_analysis)) {
        expect(sourceById[sourceRef], `${entry.chain}:${sourceRef}`).toBeTruthy();
      }
    }
  });

  it('patches only synthesis and review metadata, preserves sources, and stays idempotent', () => {
    const { document, migration } = loadArtifacts();
    database = new DatabaseSync(':memory:');
    applyMigrations(database, 71);
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
      const priorByDimension = Object.fromEntries(
        before[entry.chain].map((row) => [row.dimension, row]),
      );
      expect(rows).toHaveLength(before[entry.chain].length);
      for (const row of rows.filter(({ dimension }) => (
        dimension !== 'synthesis' && dimension !== '_meta'
      ))) {
        expect(row, `${entry.chain}:${row.dimension}`).toEqual(priorByDimension[row.dimension]);
      }

      const synthesis = rows.find(({ dimension }) => dimension === 'synthesis');
      expect(JSON.parse(synthesis.data).forensic_analysis).toEqual(entry.forensic_analysis);
      const beforeSources = JSON.parse(priorByDimension.synthesis.sources);
      const afterSources = JSON.parse(synthesis.sources);
      const beforeUrls = beforeSources.map(({ url }) => url);
      const afterUrls = afterSources.map(({ url }) => url);
      expect(afterUrls, entry.chain).toEqual(expect.arrayContaining(beforeUrls));
      expect(new Set(afterUrls).size, entry.chain).toBe(afterUrls.length);
      for (const oldSource of beforeSources) {
        const merged = afterSources.find(({ url }) => url === oldSource.url);
        expect(merged, `${entry.chain}:${oldSource.url}`).toBeTruthy();
        for (const [key, value] of Object.entries(oldSource)) {
          if (['id', 'title', 'publisher', 'source_role', 'checked_at'].includes(key)) continue;
          expect(merged[key], `${entry.chain}:${oldSource.url}:${key}`).toEqual(value);
        }
      }
      for (const expectedSource of entry.sources) {
        expect(
          afterSources.find(({ url }) => url === expectedSource.url),
          `${entry.chain}:${expectedSource.id}`,
        ).toMatchObject(expectedSource);
      }

      const meta = JSON.parse(rows.find(({ dimension }) => dimension === '_meta').data);
      expect(meta).toMatchObject({
        forensic_analysis_version: 'forensic-analysis-v1',
        last_reviewed: '2026-08-03',
        next_review_at: '2026-08-10',
      });
    }

    const once = database.prepare(`
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
    `).all(...expectedChains)).toEqual(once);
  });

  it('serves forensic fields through the normalized chain API and maps the UI sections', async () => {
    const { document } = loadArtifacts();
    stubChainFeeds();
    for (const entry of document.cases) {
      const response = await apiWorker.fetch(
        new Request(`http://localhost/api/chain/${encodeURIComponent(entry.chain)}`),
        { DB: d1(apiDatabase) },
        ctx(),
      );
      expect(response.status, entry.chain).toBe(200);
      const body = await response.json();
      expect(body.facts.synthesis.data.forensic_analysis, entry.chain)
        .toEqual(entry.forensic_analysis);
      expect(body.normalized_dossier, entry.chain).toMatchObject({
        category: 'Blockchain',
        name: entry.chain,
        status: entry.forensic_analysis.outcome.label,
        as_of: '2026-08-03',
      });
      expect(body.normalized_dossier.sections, entry.chain).toMatchObject({
        why: entry.forensic_analysis.why,
        strategic_choices: entry.forensic_analysis.strategic_choices,
        counterfactual: entry.forensic_analysis.counterfactual,
        risks_unknowns: entry.forensic_analysis.unknowns,
        outlook_watch: entry.forensic_analysis.watch,
        review_metadata: entry.forensic_analysis.review,
      });
      expect(body.normalized_dossier.sources, entry.chain)
        .toEqual(body.facts.synthesis.sources);
    }

    const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    expect(html).toContain('const forensic = synthesis.forensic_analysis || {};');
    expect(html).toContain('why: forensic.why || synthesis.why');
    expect(html).toContain('strategicChoices: forensic.strategic_choices || synthesis.strategic_choices');
    expect(html).toContain('counterfactual: forensic.counterfactual || synthesis.could_differ');
    expect(html).toContain('risksUnknowns: forensic.unknowns || synthesis.unknowns');
    expect(html).toContain('outlookWatch: forensic.watch || synthesis.outlook');
    expect(html).toContain('reviewMetadata: forensic.review || synthesis.review');
  }, 20_000);
});

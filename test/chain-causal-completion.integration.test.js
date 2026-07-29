import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { unstable_splitSqlQuery } from 'wrangler';
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
const migrationTouchedChains = [...expectedChains, 'Osmosis', 'XDC'];
const manifestUrl = new URL(
  '../docs/chain-causal-completion-2026-07-29.json',
  import.meta.url,
);
const migrationUrl = new URL(
  '../migrations/0062_chain_causal_completion.sql',
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
    if (marker !== entry.chain) throw new Error(`0062 marker mismatch for ${entry.chain}`);
    return entry;
  });
}

function migrationCorrections(migration) {
  const matches = [...migration.matchAll(
    /-- canonical-correction-start ([^\n]+)\nWITH correction_seed\(payload\) AS \(\n {2}VALUES \('([\s\S]*?)'\)\n\)\nUPDATE chain_facts AS facts/g,
  )];
  return matches.map(([, marker, payload]) => {
    const correction = JSON.parse(payload.replaceAll("''", "'"));
    if (marker !== correction.id) {
      throw new Error(`0062 correction marker mismatch for ${correction.id}`);
    }
    return correction;
  });
}

function caseStatementByteLengths(migration) {
  return [...migration.matchAll(
    /-- canonical-case-start [\s\S]*?\n {2}AND facts\.dimension IN \('synthesis', '_meta'\);/g,
  )].map(([statement]) => Buffer.byteLength(statement, 'utf8'));
}

function correctionStatementByteLengths(migration) {
  return [...migration.matchAll(
    /-- canonical-correction-start [\s\S]*?\n {2}\);\n-- canonical-correction-end/g,
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

function collectNestedSourceUrls(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectNestedSourceUrls(item, found);
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value)) {
    if (key.endsWith('source_url') && typeof child === 'string') found.push(child);
    collectNestedSourceUrls(child, found);
  }
  return found;
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

function stubChainFeeds() {
  const universe = migrationTouchedChains.map((name, index) => ({
    name,
    tvl: 1_000_000_000 - (index * 1_000_000),
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

afterEach(() => {
  database?.close();
  database = undefined;
  vi.unstubAllGlobals();
});

describe('chain causal completion migration 0062', () => {
  it('keeps generated SQL identical to the checked research manifest', () => {
    const { document, manifest, migration } = loadArtifacts();
    expect(migrationCases(migration)).toEqual(document.cases);
    expect(migrationCorrections(migration)).toEqual(document.corrections);
    expect(migration).toContain(
      `canonical-manifest-sha256 ${
        createHash('sha256').update(manifest).digest('hex')
      }`,
    );
    expect(migration).not.toMatch(/\bCREATE\s+TEMP(?:ORARY)?\s+TABLE\b/i);
    expect(caseStatementByteLengths(migration)).toHaveLength(document.cases.length);
    expect(Math.max(...caseStatementByteLengths(migration)))
      .toBeLessThanOrEqual(maxD1StatementBytes);
    expect(correctionStatementByteLengths(migration))
      .toHaveLength(document.corrections.length);
    expect(Math.max(...correctionStatementByteLengths(migration)))
      .toBeLessThanOrEqual(maxD1StatementBytes);
    const wranglerStatements = unstable_splitSqlQuery(migration);
    expect(wranglerStatements).toHaveLength(
      document.cases.length + document.corrections.length,
    );
    expect(Math.max(...wranglerStatements.map(
      (statement) => Buffer.byteLength(statement, 'utf8'),
    ))).toBeLessThanOrEqual(maxD1StatementBytes);
    expect(document.schema).toBe('chaindump-chain-causal-completion-v1');
    expect(document.research_as_of).toBe('2026-07-29');
    expect(document.cases.map(({ chain }) => chain).sort()).toEqual(expectedChains);
    for (const correction of document.corrections) {
      for (const source of correction.sources) {
        expect(source, `${correction.id}:${source.url}`).toMatchObject({
          id: expect.any(String),
          publisher: expect.any(String),
          source_role: expect.any(String),
          checked_at: '2026-07-29',
        });
      }
    }
  });

  it('publishes deep, evidence-resolving causal contracts instead of boilerplate', () => {
    const { document } = loadArtifacts();
    for (const entry of document.cases) {
      const sourceById = Object.fromEntries(entry.sources.map((source) => [source.id, source]));
      expect(new Set(entry.sources.map(({ id }) => id)).size, entry.chain)
        .toBe(entry.sources.length);
      expect(new Set(entry.sources.map(({ url }) => url)).size, entry.chain)
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
    const ethereumSources = JSON.parse(database.prepare(`
      SELECT sources FROM chain_facts WHERE chain = 'Ethereum' AND dimension = 'synthesis'
    `).get().sources);
    const ethereumRoadmap = ethereumSources.find(
      ({ url }) => url === 'https://ethereum.org/roadmap/',
    );
    Object.assign(ethereumRoadmap, {
      checked_at: '2026-07-30',
      access_state: 'bot_blocked',
      verification_note: 'Existing access metadata must survive a URL merge.',
    });
    ethereumSources.push({ ...ethereumRoadmap });
    database.prepare(`
      UPDATE chain_facts SET sources = ?
      WHERE chain = 'Ethereum' AND dimension = 'synthesis'
    `).run(JSON.stringify(ethereumSources));
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
      const beforeSources = JSON.parse(priorByDimension.synthesis.sources);
      const afterSources = JSON.parse(synthesis.sources);
      const afterSourceUrls = afterSources.map(({ url }) => url);
      expect(afterSourceUrls, entry.chain).toEqual(expect.arrayContaining(beforeSourceUrls));
      expect(new Set(afterSourceUrls).size, entry.chain).toBe(afterSourceUrls.length);
      for (const oldSource of beforeSources) {
        const merged = afterSources.find(({ url }) => url === oldSource.url);
        const canonical = entry.sources.find(({ url }) => url === oldSource.url);
        expect(merged, `${entry.chain}:${oldSource.url}`).toBeTruthy();
        if (!canonical) {
          expect(merged, `${entry.chain}:${oldSource.url}`).toEqual(oldSource);
          continue;
        }
        for (const [key, value] of Object.entries(oldSource)) {
          if (['id', 'title', 'publisher', 'source_role', 'checked_at'].includes(key)) {
            continue;
          }
          expect(merged[key], `${entry.chain}:${oldSource.url}:${key}`).toEqual(value);
        }
      }
      for (const newSource of entry.sources) {
        const merged = afterSources.find(({ url }) => url === newSource.url);
        expect(merged, `${entry.chain}:${newSource.id}`).toMatchObject({
          id: newSource.id,
          url: newSource.url,
        });
        expect(
          merged.checked_at >= newSource.checked_at,
          `${entry.chain}:${newSource.id}`,
        ).toBe(true);
      }

      const meta = JSON.parse(rows.find(({ dimension }) => dimension === '_meta').data);
      expect(meta).toMatchObject({
        forensic_analysis_version: 'forensic-analysis-v1',
        last_reviewed: '2026-07-29',
        next_review_at: entry.forensic_analysis.review.next_review_at,
      });
    }

    const xdcIdentity = database.prepare(`
      SELECT data, sources FROM chain_facts WHERE chain = 'XDC' AND dimension = 'identity'
    `).get();
    expect(database.prepare(`
      SELECT COUNT(*) AS count
      FROM chain_facts WHERE chain = 'XDC' AND dimension = 'identity'
    `).get().count).toBe(1);
    const xdcSourceUrls = new Set(JSON.parse(xdcIdentity.sources).map(({ url }) => url));
    for (const sourceUrl of collectNestedSourceUrls(JSON.parse(xdcIdentity.data))) {
      expect(xdcSourceUrls.has(sourceUrl), `XDC:identity:${sourceUrl}`).toBe(true);
    }
    const xdcCorrection = document.corrections.find(
      ({ id }) => id === 'xdc-identity-nested-source-coverage',
    );
    const xdcSourcesByUrl = Object.fromEntries(
      JSON.parse(xdcIdentity.sources).map((source) => [source.url, source]),
    );
    for (const expectedSource of xdcCorrection.sources) {
      expect(xdcSourcesByUrl[expectedSource.url]).toMatchObject(expectedSource);
    }

    const osmosisToken = database.prepare(`
      SELECT data, sources FROM chain_facts WHERE chain = 'Osmosis' AND dimension = 'token'
    `).get();
    expect(database.prepare(`
      SELECT COUNT(*) AS count
      FROM chain_facts WHERE chain = 'Osmosis' AND dimension = 'token'
    `).get().count).toBe(1);
    const osmosisData = JSON.parse(osmosisToken.data);
    expect(osmosisData.unlock_overhang_pct).toBe(21.73);
    expect(osmosisData.unlock_overhang_denominator).toBe('max_supply');
    expect(
      ((osmosisData.max_supply - osmosisData.circulating_supply)
        / osmosisData.max_supply) * 100,
    ).toBeCloseTo(osmosisData.unlock_overhang_pct, 2);
    expect(
      ((osmosisData.total_supply - osmosisData.circulating_supply)
        / osmosisData.total_supply) * 100,
    ).toBeCloseTo(osmosisData.reported_total_noncirculating_pct_of_total, 2);
    const osmosisSource = JSON.parse(osmosisToken.sources)
      .find(({ url }) => url === osmosisData.source_url);
    expect(osmosisSource).toMatchObject(
      document.corrections.find(
        ({ id }) => id === 'osmosis-token-overhang-denominator',
      ).sources[0],
    );

    const first = database.prepare(`
      SELECT chain, dimension, data, sources, updated_at
      FROM chain_facts
      WHERE chain IN (${migrationTouchedChains.map(() => '?').join(',')})
      ORDER BY chain, dimension
    `).all(...migrationTouchedChains);
    database.exec(migration);
    expect(database.prepare(`
      SELECT chain, dimension, data, sources, updated_at
      FROM chain_facts
      WHERE chain IN (${migrationTouchedChains.map(() => '?').join(',')})
      ORDER BY chain, dimension
    `).all(...migrationTouchedChains)).toEqual(first);
  });

  it('serves each causal dossier through the chain API and has a visible chain UI section', async () => {
    const { document } = loadArtifacts();
    database = new DatabaseSync(':memory:');
    applyMigrations(database);
    stubChainFeeds();
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
      const actualSources = body.facts.synthesis.sources;
      const identifiedSources = actualSources.filter(({ id }) => id);
      expect(new Set(identifiedSources.map(({ id }) => id)).size, entry.chain)
        .toBe(identifiedSources.length);
      const sourceById = Object.fromEntries(
        identifiedSources.map((source) => [source.id, source]),
      );
      expect(
        validateForensicAnalysis(body.facts.synthesis.data.forensic_analysis, {
          resolver: sourceById,
        }),
        entry.chain,
      ).toEqual({ errors: [], warnings: [], withheld_sections: [] });
      for (const sourceRef of collectSourceRefs(entry.forensic_analysis)) {
        expect(sourceById[sourceRef], `${entry.chain}:${sourceRef}`).toBeTruthy();
        expect(sourceById[sourceRef].url, `${entry.chain}:${sourceRef}`)
          .toMatch(/^https:\/\//);
      }
    }

    const xdcResponse = await worker.fetch(
      new Request('http://localhost/api/chain/XDC'),
      { DB: d1(database) },
      ctx(),
    );
    expect(xdcResponse.status).toBe(200);
    const xdcBody = await xdcResponse.json();
    const xdcSourceUrls = new Set(
      xdcBody.facts.identity.sources.map(({ url }) => url),
    );
    for (const sourceUrl of collectNestedSourceUrls(xdcBody.facts.identity.data)) {
      expect(xdcSourceUrls.has(sourceUrl), `XDC:identity:${sourceUrl}`).toBe(true);
    }
    const xdcCorrection = document.corrections.find(
      ({ id }) => id === 'xdc-identity-nested-source-coverage',
    );
    const xdcSourcesByUrl = Object.fromEntries(
      xdcBody.facts.identity.sources.map((source) => [source.url, source]),
    );
    for (const expectedSource of xdcCorrection.sources) {
      expect(xdcSourcesByUrl[expectedSource.url]).toMatchObject(expectedSource);
    }

    const osmosisResponse = await worker.fetch(
      new Request('http://localhost/api/chain/Osmosis'),
      { DB: d1(database) },
      ctx(),
    );
    expect(osmosisResponse.status).toBe(200);
    const osmosisBody = await osmosisResponse.json();
    const osmosisToken = osmosisBody.facts.token;
    expect(osmosisToken.data).toMatchObject({
      unlock_overhang_pct: 21.73,
      unlock_overhang_denominator: 'max_supply',
      reported_total_noncirculating_pct_of_total: 19.77,
      unissued_to_max_supply_pct: 2.44,
    });
    const osmosisSource = osmosisToken.sources
      .find(({ url }) => url === osmosisToken.data.source_url);
    expect(osmosisSource).toMatchObject(
      document.corrections.find(
        ({ id }) => id === 'osmosis-token-overhang-denominator',
      ).sources[0],
    );

    const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    expect(html).toContain('forensicAnalysisHtml(d.forensic_analysis');
    expect(html).toContain('Why this outcome');
    expect(html).toContain('Strategic choices');
    expect(html).toContain('What could have been different');
    expect(html).toContain('What would change our mind');
    expect(html).toContain('Material unknowns');
  }, 20_000);
});

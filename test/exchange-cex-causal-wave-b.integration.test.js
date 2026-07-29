import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const document = JSON.parse(readFileSync(
  new URL('../docs/exchange-cex-causal-wave-b-2026-07-29.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0060_exchange_cex_causal_wave_b.sql', import.meta.url),
  'utf8',
);
const migrationUrl = new URL(
  '../migrations/0060_exchange_cex_causal_wave_b.sql',
  import.meta.url,
);
const publicUi = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const expectedSlugs = [
  'blockfi',
  'celsius',
  'coinflex',
  'fcoin',
  'genesis-global',
  'hodlnaut',
  'prime-trust',
  'thodex',
  'vauld',
  'voyager-digital',
  'wazirx',
  'xeggex',
  'zipmex',
];

function applyMigrations(database, through = 60) {
  const migrationDirectory = new URL('../migrations/', import.meta.url);
  const files = readdirSync(migrationDirectory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .filter((file) => Number(file.slice(0, 4)) <= through)
    .sort();
  for (const file of files) {
    database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
}

function caseRow(database, entry) {
  const summaryColumn = entry.table === 'mid_exchanges' ? 'why_stuck' : 'why';
  return database.prepare(`
    SELECT verdict, ${summaryColumn} AS summary, outlook, profile, sources, updated_at
    FROM ${entry.table}
    WHERE kind = 'cex' AND slug = ?
  `).get(entry.slug);
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
const markdownRequest = (path) => new Request(`http://localhost${path}`, {
  headers: { accept: 'text/markdown' },
});

let database;

afterEach(() => {
  database?.close();
  database = undefined;
  vi.unstubAllGlobals();
});

describe('exchange CEX causal Wave B migration 0060', () => {
  it('keeps renderer imports side-effect free and pure output byte-identical to applied 0060', async () => {
    const modifiedBeforeImport = statSync(migrationUrl).mtimeMs;
    const renderer = await import(
      '../scripts/render-exchange-cex-causal-wave-b-migration.mjs?import-regression'
    );
    expect(renderer.buildExchangeCexCausalWaveBManifest()).toEqual(document);
    expect(renderer.renderExchangeCexCausalWaveBMigration(document)).toBe(migration);
    expect(statSync(migrationUrl).mtimeMs).toBe(modifiedBeforeImport);
  });

  it('keeps one bounded generated statement per checked research case', () => {
    expect(migration).not.toMatch(/\bCREATE\s+TEMP(?:ORARY)?\s+TABLE\b/i);
    expect(migration).toContain('-- batched-payload-start');
    expect(migration.match(
      /INSERT OR REPLACE INTO exchange_cex_causal_wave_b_0060 \(\n/g,
    )).toHaveLength(document.cases.length);
    expect(document.as_of).toBe('2026-07-29');
    expect(document.source_check.checked_at).toBe('2026-07-29');
    expect(document.cases.map(({ slug }) => slug)).toEqual(expectedSlugs);
    expect(document.cases.filter(({ table }) => table === 'dead_exchanges')).toHaveLength(11);
    expect(document.cases.filter(({ table }) => table === 'mid_exchanges')
      .map(({ slug }) => slug)).toEqual(['wazirx', 'xeggex']);
    expect(document.cases.every(({ kind }) => kind === 'cex')).toBe(true);
    for (const entry of document.cases) {
      expect(migration, entry.slug).toContain(`  '${entry.slug.replaceAll("'", "''")}',`);
    }
  });

  it('publishes complete causal analyses with direct checked source references', () => {
    for (const entry of document.cases) {
      expect(entry.sources.length, entry.slug).toBeGreaterThanOrEqual(2);
      for (const source of entry.sources) {
        expect(source, `${entry.slug}:${source.title}`).toMatchObject({
          publisher: expect.any(String),
          checked_at: '2026-07-29',
        });
        expect(source.url, `${entry.slug}:${source.title}`).toMatch(/^https:\/\//);
      }
      expect(
        validateForensicAnalysis(entry.forensic_analysis),
        entry.slug,
      ).toEqual({
        errors: [],
        warnings: [],
        withheld_sections: [],
      });
      expect(entry.forensic_analysis.strategic_choices.length, entry.slug)
        .toBeGreaterThanOrEqual(3);
      expect(entry.forensic_analysis.watch.length, entry.slug)
        .toBeGreaterThanOrEqual(2);
      expect(entry.forensic_analysis.unknowns.length, entry.slug)
        .toBeGreaterThanOrEqual(3);
      const sourceRefs = [
        ...entry.forensic_analysis.outcome.source_refs,
        ...entry.forensic_analysis.why.source_refs,
        ...entry.forensic_analysis.strategic_choices.flatMap(({ source_refs }) => source_refs),
        ...entry.forensic_analysis.counterfactual.source_refs,
        ...entry.forensic_analysis.watch.flatMap(({ source_refs }) => source_refs),
      ];
      expect(sourceRefs.every((url) => /^https:\/\/\S+$/.test(url)), entry.slug).toBe(true);
    }
  });

  it('replaces stale public claims, preserves profile fields, and is idempotent', () => {
    database = new DatabaseSync(':memory:');
    applyMigrations(database, 59);
    const untouchedBefore = database.prepare(`
      SELECT verdict, why, outlook, profile, updated_at
      FROM dead_exchanges
      WHERE kind = 'cex' AND slug = 'mt-gox'
    `).get();

    database.exec(migration);
    const first = Object.fromEntries(document.cases.map((entry) => {
      const row = caseRow(database, entry);
      expect(row).toMatchObject({
        verdict: entry.row_patch.verdict,
        summary: entry.row_patch.why,
        outlook: entry.row_patch.outlook,
        sources: JSON.stringify(entry.sources),
        updated_at: '2026-07-29',
      });
      expect(JSON.parse(row.profile).forensic_analysis).toEqual(entry.forensic_analysis);
      return [entry.slug, row];
    }));

    database.exec(migration);
    for (const entry of document.cases) {
      expect(caseRow(database, entry)).toEqual(first[entry.slug]);
    }
    expect(database.prepare(`
      SELECT verdict, why, outlook, profile, updated_at
      FROM dead_exchanges
      WHERE kind = 'cex' AND slug = 'mt-gox'
    `).get()).toEqual(untouchedBefore);
    for (const slug of ['wazirx', 'xeggex']) {
      expect(database.prepare(`
        SELECT COUNT(*) AS count FROM dead_exchanges
        WHERE kind = 'cex' AND slug = ?
      `).get(slug).count).toBe(0);
      expect(database.prepare(`
        SELECT lifecycle FROM exchange_case_features
        WHERE kind = 'cex' AND slug = ?
      `).get(slug).lifecycle).toBe('mid');
    }
    expect(caseRow(database, document.cases.find(({ slug }) => slug === 'xeggex')).sources)
      .not.toContain('ainvest.com');
    expect(database.prepare(`
      SELECT COUNT(*) AS count
      FROM sqlite_master
      WHERE type = 'table' AND name = 'exchange_cex_causal_wave_b_0060'
    `).get().count).toBe(0);
  });

  it('brings the full replay to 29/29 DEX and 30/30 CEX forensic coverage', () => {
    database = new DatabaseSync(':memory:');
    applyMigrations(database);

    for (const [kind, expected] of [['dex', 29], ['cex', 30]]) {
      const rows = database.prepare(`
        SELECT type AS kind, slug, profile FROM successful_exchanges
        UNION ALL
        SELECT kind, slug, profile FROM mid_exchanges
        UNION ALL
        SELECT kind, slug, profile FROM dead_exchanges
      `).all().filter((row) => row.kind === kind);
      const forensicRows = rows.filter((row) => (
        JSON.parse(row.profile || '{}').forensic_analysis?.version === 'forensic-analysis-v1'
      ));
      expect(rows, kind).toHaveLength(expected);
      expect(forensicRows, kind).toHaveLength(expected);
    }
  });

  it('renders all 13 corrected cases through the public API and direct UI route', async () => {
    database = new DatabaseSync(':memory:');
    applyMigrations(database);
    const worker = await freshWorker();
    const env = { DB: d1(database) };

    for (const entry of document.cases) {
      const lifecycle = entry.table === 'mid_exchanges' ? 'mid' : 'dead';
      const response = await worker.fetch(
        new Request(
          `http://localhost/api/exchange-analysis?kind=cex`
          + `&lifecycle=${lifecycle}&slug=${entry.slug}`,
        ),
        env,
        ctx(),
      );
      expect(response.status, entry.slug).toBe(200);
      const body = await response.json();
      expect(body.cases, entry.slug).toHaveLength(1);
      expect(body.cases[0].analysis.forensic_analysis_status, entry.slug).toBe('published');
      expect(body.cases[0].analysis.forensic_analysis.outcome.label, entry.slug)
        .toBe(entry.forensic_analysis.outcome.label);
      expect(body.cases[0].summary, entry.slug).toBe(entry.row_patch.why);

      const page = await worker.fetch(
        markdownRequest(`/exchange/cex/${lifecycle}/${entry.slug}`),
        env,
        ctx(),
      );
      const markdown = await page.text();
      expect(page.status, entry.slug).toBe(200);
      expect(markdown, entry.slug).toContain('forensic dossier | Chaindump');
      expect(markdown, entry.slug).toContain(
        `/api/exchange-analysis?kind=cex&lifecycle=${lifecycle}&slug=${entry.slug}`,
      );
    }
  });

  it('shows true CEX product scopes in list cards and sitemap while excluding non-exchange DEX rows', async () => {
    database = new DatabaseSync(':memory:');
    applyMigrations(database);
    database.exec(`
      INSERT INTO dead_exchanges
        (slug, kind, venue_type, name, metric_label, why, verdict, profile, sources)
      VALUES
        ('hidden-dex-lender', 'dex', 'lender', 'Hidden DEX Lender',
         'test-only', 'must not enter the DEX product', 'test-only', '{}', '[]')
    `);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      chains: [],
      protocols: [],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));
    const worker = await freshWorker();
    const env = { DB: d1(database) };

    const cexResponse = await worker.fetch(
      new Request('http://localhost/api/exchange-analysis?kind=cex'),
      env,
      ctx(),
    );
    const cex = await cexResponse.json();
    const scoped = Object.fromEntries(cex.cases.map((entry) => [entry.slug, entry.venue_type]));
    expect(scoped).toMatchObject({
      blockfi: 'lender',
      celsius: 'lender',
      vauld: 'lender',
      hodlnaut: 'lender',
      'genesis-global': 'lender',
      'voyager-digital': 'broker',
      'prime-trust': 'custodian',
    });
    expect(publicUi).toContain('`venue: ${exchangeLabel(row.venueType)}`');

    const legacyList = await worker.fetch(
      new Request('http://localhost/api/dead-exchanges?kind=cex'),
      env,
      ctx(),
    );
    const legacySlugs = (await legacyList.json()).exchanges.map(({ slug }) => slug);
    for (const slug of [
      'blockfi',
      'celsius',
      'vauld',
      'hodlnaut',
      'genesis-global',
      'voyager-digital',
      'prime-trust',
    ]) {
      expect(legacySlugs, slug).toContain(slug);
    }

    const dexResponse = await worker.fetch(
      new Request('http://localhost/api/exchange-analysis?kind=dex'),
      env,
      ctx(),
    );
    expect((await dexResponse.json()).cases.map(({ slug }) => slug))
      .not.toContain('hidden-dex-lender');
    const hiddenPage = await worker.fetch(
      markdownRequest('/exchange/dex/dead/hidden-dex-lender'),
      env,
      ctx(),
    );
    expect(await hiddenPage.text()).not.toContain('Hidden DEX Lender — DEX forensic dossier');

    const sitemap = await worker.fetch(
      new Request('http://localhost/sitemap.xml'),
      env,
      ctx(),
    );
    const xml = await sitemap.text();
    for (const entry of document.cases) {
      const lifecycle = entry.table === 'mid_exchanges' ? 'mid' : 'dead';
      expect(xml, entry.slug).toContain(`/exchange/cex/${lifecycle}/${entry.slug}`);
    }
    expect(xml).not.toContain('/exchange/dex/dead/hidden-dex-lender');
  });
});

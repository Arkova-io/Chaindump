import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const document = JSON.parse(readFileSync(
  new URL('../docs/exchange-forensic-wave-a-2026-07-29.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0059_exchange_forensic_wave_a.sql', import.meta.url),
  'utf8',
);
const expectedSlugs = [
  'deus-finance',
  'solidly',
  'spiritswap',
  'waultswap',
  'binance',
  'coinbase',
  'kraken',
  'bybit',
  'bitstamp',
  'bithumb',
  'htx',
  'bitmex',
  'bitmart',
];

function applyMigrations(database, through = 59) {
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
  const kindColumn = entry.table === 'successful_exchanges' ? 'type' : 'kind';
  return database.prepare(`
    SELECT *, '${entry.lifecycle}' AS lifecycle
    FROM ${entry.table}
    WHERE slug = ? AND ${kindColumn} = ?
  `).get(entry.slug, entry.kind);
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

describe('exchange forensic wave A migration 0059', () => {
  it('keeps one bounded generated statement per checked research case', () => {
    expect(migration).not.toMatch(/\bCREATE\s+TEMP(?:ORARY)?\s+TABLE\b/i);
    expect(migration).toContain('-- batched-payload-start');
    expect(migration.match(
      /INSERT OR REPLACE INTO exchange_forensic_wave_a_0059\n/g,
    )).toHaveLength(document.cases.length);
    expect(document.schema).toBe('chaindump-exchange-forensic-wave-a-v1');
    expect(document.research_as_of).toBe('2026-07-29');
    expect(document.cases.map(({ slug }) => slug)).toEqual(expectedSlugs);
    expect(document.cases.filter(({ kind }) => kind === 'dex')).toHaveLength(4);
    expect(document.cases.filter(({ kind }) => kind === 'cex')).toHaveLength(9);
    for (const entry of document.cases) {
      expect(migration, entry.slug).toContain(`  '${entry.slug.replaceAll("'", "''")}',`);
    }
  });

  it('publishes complete, resolving forensic analyses with source freshness metadata', () => {
    for (const entry of document.cases) {
      const sourceById = Object.fromEntries(entry.sources.map((source) => [source.id, source]));
      expect(entry.sources.length, entry.slug).toBeGreaterThan(0);
      for (const source of entry.sources) {
        expect(source.checked_at, `${entry.slug}:${source.id}`).toBe('2026-07-29');
        expect(source.url, `${entry.slug}:${source.id}`).toMatch(/^https:\/\//);
        expect(source.source_role, `${entry.slug}:${source.id}`).toBeTruthy();
      }
      expect(
        validateForensicAnalysis(entry.forensic_analysis, { resolver: sourceById }),
        entry.slug,
      ).toEqual({
        errors: [],
        warnings: [],
        withheld_sections: [],
      });
      expect(entry.forensic_analysis.strategic_choices.length, entry.slug).toBeGreaterThanOrEqual(3);
      expect(entry.forensic_analysis.watch.length, entry.slug).toBeGreaterThanOrEqual(3);
      expect(entry.forensic_analysis.unknowns.length, entry.slug).toBeGreaterThanOrEqual(4);
    }
  });

  it('applies every case, is idempotent, and preserves unrelated rows', () => {
    database = new DatabaseSync(':memory:');
    applyMigrations(database, 58);
    const untouchedBefore = database.prepare(`
      SELECT profile, sources, updated_at
      FROM successful_exchanges
      WHERE type = 'dex' AND slug = 'uniswap'
    `).get();

    database.exec(migration);
    const first = Object.fromEntries(document.cases.map((entry) => {
      const row = caseRow(database, entry);
      expect(row, entry.slug).toBeTruthy();
      expect(JSON.parse(row.profile).forensic_analysis, entry.slug)
        .toEqual(entry.forensic_analysis);
      expect(JSON.parse(row.sources), entry.slug).toEqual(entry.sources);
      expect(row.updated_at, entry.slug).toBe('2026-07-29');
      return [entry.slug, { profile: row.profile, sources: row.sources }];
    }));

    database.exec(migration);
    for (const entry of document.cases) {
      const row = caseRow(database, entry);
      expect({ profile: row.profile, sources: row.sources }, entry.slug)
        .toEqual(first[entry.slug]);
    }
    expect(database.prepare(`
      SELECT profile, sources, updated_at
      FROM successful_exchanges
      WHERE type = 'dex' AND slug = 'uniswap'
    `).get()).toEqual(untouchedBefore);
    expect(database.prepare(`
      SELECT COUNT(*) AS count
      FROM sqlite_master
      WHERE type = 'table' AND name = 'exchange_forensic_wave_a_0059'
    `).get().count).toBe(0);
  });

  it('prevents SpiritSwap and DEUS from silently reverting to overstated dead scopes', () => {
    database = new DatabaseSync(':memory:');
    applyMigrations(database);

    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM dead_exchanges
      WHERE kind = 'dex' AND slug = 'spiritswap'
    `).get().count).toBe(0);
    const spirit = database.prepare(`
      SELECT venue_type, name, launched, verdict, why_stuck, profile
      FROM mid_exchanges
      WHERE kind = 'dex' AND slug = 'spiritswap'
    `).get();
    expect(spirit).toMatchObject({
      venue_type: 'exchange',
      name: 'SpiritSwap',
      launched: '2021-04',
    });
    expect(spirit.verdict).toBe('declining');
    expect(spirit.why_stuck).toContain('rescue');
    expect(JSON.parse(spirit.profile)).toMatchObject({
      status: 'rescued_declining',
      forensic_analysis: { outcome: { label: 'declining' } },
    });
    expect(database.prepare(`
      SELECT lifecycle, product_cohort
      FROM exchange_case_features
      WHERE kind = 'dex' AND slug = 'spiritswap'
    `).get()).toEqual({
      lifecycle: 'mid',
      product_cohort: 'vote_escrow_amm',
    });

    const deus = database.prepare(`
      SELECT profile FROM dead_exchanges
      WHERE kind = 'dex' AND slug = 'deus-finance'
    `).get();
    expect(JSON.parse(deus.profile)).toMatchObject({
      status: 'failed_original_dei_amm_scope',
      forensic_analysis: { outcome: { label: 'failed' } },
    });
    expect(JSON.parse(deus.profile).scope).toContain('not every current DEUS-branded');
  });

  it('preserves SpiritSwap identity fields when migration 0059 is replayed', () => {
    database = new DatabaseSync(':memory:');
    applyMigrations(database, 58);
    database.prepare(`
      UPDATE dead_exchanges
      SET venue_type = ?, name = ?, launched = ?
      WHERE kind = 'dex' AND slug = 'spiritswap'
    `).run('forensic-amm', 'SpiritSwap canonical', '2021-04-20');

    database.exec(migration);
    expect(database.prepare(`
      SELECT venue_type, name, launched
      FROM mid_exchanges
      WHERE kind = 'dex' AND slug = 'spiritswap'
    `).get()).toEqual({
      venue_type: 'forensic-amm',
      name: 'SpiritSwap canonical',
      launched: '2021-04-20',
    });

    database.prepare(`
      UPDATE mid_exchanges
      SET venue_type = ?, name = ?, launched = ?
      WHERE kind = 'dex' AND slug = 'spiritswap'
    `).run('corrected-amm', 'SpiritSwap corrected', '2021-04-30');
    database.exec(migration);

    expect(database.prepare(`
      SELECT venue_type, name, launched
      FROM mid_exchanges
      WHERE kind = 'dex' AND slug = 'spiritswap'
    `).get()).toEqual({
      venue_type: 'corrected-amm',
      name: 'SpiritSwap corrected',
      launched: '2021-04-30',
    });
  });

  it('keeps BitMEX and BitMart as announced wind-downs and removes unsupported causes', () => {
    database = new DatabaseSync(':memory:');
    applyMigrations(database);
    const bitmex = database.prepare(`
      SELECT verdict, why, profile, sources
      FROM dead_exchanges WHERE kind = 'cex' AND slug = 'bitmex'
    `).get();
    const bitmart = database.prepare(`
      SELECT verdict, why, profile, sources
      FROM dead_exchanges WHERE kind = 'cex' AND slug = 'bitmart'
    `).get();

    expect(bitmex.verdict).toBe('wind_down_announced');
    expect(bitmart.verdict).toBe('wind_down_announced');
    expect(JSON.parse(bitmex.profile).forensic_analysis.outcome.label).toBe('declining');
    expect(JSON.parse(bitmart.profile)).toMatchObject({
      status: 'wind_down_announced',
      cause_status: expect.stringContaining('without specific attribution'),
      forensic_analysis: { outcome: { label: 'declining' } },
    });
    expect(JSON.parse(bitmex.sources).map(({ url }) => url)).toEqual([
      'https://www.bitmex.com/blog/bitmex-closure',
    ]);
    expect(JSON.parse(bitmart.sources).map(({ url }) => url)).toEqual([
      'https://www.bitmart.com/en-US/support/articles/7922665245339/39162120325403/53544595916059',
      'https://www.bitmart.com/en-US/support/articles/7922665245339/39162120325403/50773623099035',
    ]);
    for (const text of [bitmex.why, bitmart.why, bitmart.profile]) {
      expect(text).not.toMatch(/\$200M|58%|3,694 BTC|\$805,000|Nathan Chow|CEO.*removed/i);
    }
    expect(bitmex.why).toContain('did not identify');
    expect(bitmart.why).toContain('does not establish');
  });

  it('renders all 13 dossiers through the public API and direct UI routes', async () => {
    database = new DatabaseSync(':memory:');
    applyMigrations(database);
    const worker = await freshWorker();
    const env = { DB: d1(database) };

    for (const entry of document.cases) {
      const response = await worker.fetch(
        new Request(
          `http://localhost/api/exchange-analysis?kind=${entry.kind}`
          + `&lifecycle=${entry.lifecycle}&slug=${entry.slug}`,
        ),
        env,
        ctx(),
      );
      expect(response.status, entry.slug).toBe(200);
      const body = await response.json();
      expect(body.cases, entry.slug).toHaveLength(1);
      expect(body.cases[0].slug, entry.slug).toBe(entry.slug);
      expect(body.cases[0].analysis.forensic_analysis_status, entry.slug)
        .toBe('support_pending');
      expect(body.cases[0].analysis.forensic_analysis.outcome, entry.slug).toMatchObject({
        publication_support: 'pending_independent_support',
        source_refs: expect.any(Array),
      });
      expect(
        body.cases[0].analysis.forensic_analysis.outcome.source_refs,
        entry.slug,
      ).toHaveLength(entry.forensic_analysis.outcome.source_refs.length);
      expect(body.cases[0].analysis.forensic_analysis.outcome, entry.slug)
        .not.toHaveProperty('label');
      expect(
        body.cases[0].analysis.forensic_analysis.outcome.source_refs
          .every(({ url }) => url.startsWith('https://')),
        entry.slug,
      ).toBe(true);

      const page = await worker.fetch(
        markdownRequest(`/exchange/${entry.kind}/${entry.lifecycle}/${entry.slug}`),
        env,
        ctx(),
      );
      const markdown = await page.text();
      expect(page.status, entry.slug).toBe(200);
      expect(markdown, entry.slug).toContain('lifecycle report | Chaindump');
      expect(markdown, entry.slug).toContain(
        `/api/exchange-analysis?kind=${entry.kind}`
        + `&lifecycle=${entry.lifecycle}&slug=${entry.slug}`,
      );
    }
  });
});

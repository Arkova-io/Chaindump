import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const topEightMigration = readFileSync(
  new URL('../migrations/0015_top8_chain_dossiers.sql', import.meta.url),
  'utf8',
);
const causalMigration = readFileSync(
  new URL('../migrations/0062_chain_causal_completion.sql', import.meta.url),
  'utf8',
);
const refreshMigration = readFileSync(
  new URL('../migrations/0066_ethereum_profile_refresh.sql', import.meta.url),
  'utf8',
);

const ALLOWED_SOURCE_HOSTS = new Set([
  'api.coingecko.com',
  'api.llama.fi',
  'blog.ethereum.org',
  'eips.ethereum.org',
  'ethereum.org',
  'stablecoins.llama.fi',
]);

function openDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE chain_analysis (
      chain TEXT PRIMARY KEY,
      take TEXT,
      sentiment TEXT,
      trend TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      sources TEXT,
      profile TEXT
    );
    CREATE TABLE chain_facts (
      chain TEXT NOT NULL,
      dimension TEXT NOT NULL,
      data TEXT NOT NULL,
      sources TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (chain, dimension)
    );
  `);
  db.prepare(`
    INSERT INTO chain_analysis
      (chain, take, sentiment, trend, updated_at, sources, profile)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Ethereum',
    'Stale ETF squeeze copy; 2026 shipped Pectra and Fusaka; Lean Ethereum July 4-6; Glamsterdam Q3 2026.',
    'mixed',
    'Macro squeeze',
    '2026-07-08',
    JSON.stringify([{ title: 'Secondary recap', url: 'https://example.com/ethereum' }]),
    JSON.stringify({ outlook: 'Stale prose' }),
  );
  db.exec(topEightMigration);
  db.exec(causalMigration);
  return db;
}

function sourceRefs(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) sourceRefs(item, found);
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value.source_refs)) found.push(...value.source_refs);
  for (const child of Object.values(value)) sourceRefs(child, found);
  return found;
}

function substantive(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined;
}

let db;

beforeEach(() => {
  db = openDatabase();
});

afterEach(() => {
  db.close();
});

describe('Ethereum gold-standard profile refresh migration', () => {
  it('corrects chronology and fills every normalized public section', () => {
    db.exec(refreshMigration);

    const analysis = db.prepare(
      "SELECT take, sentiment, trend, updated_at, sources, profile FROM chain_analysis WHERE chain = 'Ethereum'",
    ).get();
    const profile = JSON.parse(analysis.profile);
    const synthesis = JSON.parse(db.prepare(
      "SELECT data FROM chain_facts WHERE chain = 'Ethereum' AND dimension = 'synthesis'",
    ).get().data);

    expect(analysis).toMatchObject({
      sentiment: 'mixed',
      trend: 'Settlement leadership; rollup value capture remains open',
      updated_at: '2026-08-03',
    });
    expect(analysis.take).toContain('Pectra activated on 2025-05-07');
    expect(analysis.take).toContain('Fusaka on 2025-12-03');
    expect(analysis.take).toContain('Lean Ethereum was published on 2025-07-31');
    expect(analysis.take).toContain('Glamsterdam for H2 2026 without a precise mainnet date');
    expect(analysis.take).not.toMatch(/2026 shipped|July 4-6|Q3 2026|ETF squeeze/i);

    const normalizedSections = {
      what_it_is: profile.what_it_does,
      what_happened: synthesis.situation,
      why: synthesis.why,
      strategic_choices: synthesis.strategic_choices,
      operating_model: profile.operating_model,
      token_value_capture: profile.token,
      evidence: synthesis.evidence,
      counterfactual: synthesis.could_differ,
      risks_unknowns: synthesis.unknowns,
      lifecycle: synthesis.lifecycle,
      outlook_watch: synthesis.outlook,
      review_metadata: synthesis.review,
    };
    expect(Object.keys(normalizedSections)).toHaveLength(12);
    for (const [section, value] of Object.entries(normalizedSections)) {
      expect(substantive(value), section).toBe(true);
    }

    expect(profile.lifecycle.milestones).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: '2025-05-07', event: 'Pectra activated on mainnet.' }),
      expect.objectContaining({ date: '2025-12-03', event: 'Fusaka activated on mainnet.' }),
      expect.objectContaining({ target: 'H2 2026', date_precision: 'half_year' }),
    ]));
    expect(profile.evidence_policy).toEqual({
      schema: 'forensic-freshness-v1',
      status_basis: 'direct_current',
      status_as_of: '2026-08-03',
      last_verified_at: '2026-08-03',
      next_review_at: '2026-08-10',
      stale: false,
    });
  });

  it('uses only reviewed primary or independent data sources with resolvable claim references', () => {
    db.exec(refreshMigration);
    const analysis = db.prepare(
      "SELECT sources, profile FROM chain_analysis WHERE chain = 'Ethereum'",
    ).get();
    const sources = JSON.parse(analysis.sources);
    const profile = JSON.parse(analysis.profile);
    const sourceIds = new Set(sources.map(({ id }) => id));

    expect(sources.length).toBeGreaterThanOrEqual(15);
    expect(profile.sources).toEqual(sources);
    for (const source of sources) {
      expect(source).toMatchObject({
        last_verified_at: '2026-08-03',
        checked_at: '2026-08-03',
        access_state: 'accessible',
        stale: false,
      });
      expect(['published', 'updated', 'event', 'observed', 'unknown'])
        .toContain(source.source_date_kind);
      expect(['historical_event', 'mechanism', 'current_state', 'terminal_outcome'])
        .toContain(source.evidence_scope);
      if (source.evidence_scope === 'current_state') {
        expect(source.stale_after).toBe('2026-08-10');
      }
      expect(ALLOWED_SOURCE_HOSTS.has(new URL(source.url).hostname), source.url).toBe(true);
      expect(source.url).not.toContain('chaindump.xyz');
    }

    for (const ref of sourceRefs(profile)) {
      expect(sourceIds.has(ref), `unresolved profile source_ref ${ref}`).toBe(true);
    }

    const factRows = db.prepare(
      "SELECT dimension, data, sources FROM chain_facts WHERE chain = 'Ethereum'",
    ).all();
    for (const row of factRows) {
      const factSources = JSON.parse(row.sources);
      expect(factSources.length, row.dimension).toBeGreaterThan(0);
      expect(factSources.every(({ id, source_role: role, last_verified_at: verified }) => (
        Boolean(id) && Boolean(role) && verified === '2026-08-03'
      )), row.dimension).toBe(true);
      for (const ref of sourceRefs(JSON.parse(row.data))) {
        expect(sourceIds.has(ref), `${row.dimension} unresolved source_ref ${ref}`).toBe(true);
      }
    }
  });

  it('refreshes the dated market observation without presenting live numbers as timeless copy', () => {
    db.exec(refreshMigration);
    const fact = (dimension) => JSON.parse(db.prepare(
      "SELECT data FROM chain_facts WHERE chain = 'Ethereum' AND dimension = ?",
    ).get(dimension).data);

    expect(fact('token')).toMatchObject({
      as_of: '2026-08-03',
      token_current_usd: 1862.52,
      market_cap_usd: 224727593232,
      observed_at: '2026-08-03T16:05:07.051Z',
    });
    expect(fact('onchain')).toMatchObject({
      as_of: '2026-08-03',
      tvl_current_usd: 40699785678,
      stablecoin_tvl_usd: 146883364640.79175,
      fees_24h_usd: 7204686.8,
      observed_at: '2026-08-03',
    });

    const copy = db.prepare(
      "SELECT take || ' ' || profile AS copy FROM chain_analysis WHERE chain = 'Ethereum'",
    ).get().copy;
    expect(copy).not.toMatch(/\$[0-9]|~[0-9]+%|cumulative inflows/i);
  });

  it('is idempotent and preserves every non-Ethereum dossier', () => {
    const solanaBefore = db.prepare(
      "SELECT dimension, data, sources, updated_at FROM chain_facts WHERE chain = 'Solana' ORDER BY dimension",
    ).all();

    db.exec(refreshMigration);
    const ethereumAfterFirst = db.prepare(
      "SELECT dimension, data, sources, updated_at FROM chain_facts WHERE chain = 'Ethereum' ORDER BY dimension",
    ).all();
    const analysisAfterFirst = db.prepare(
      "SELECT * FROM chain_analysis WHERE chain = 'Ethereum'",
    ).get();
    db.exec(refreshMigration);

    expect(db.prepare(
      "SELECT dimension, data, sources, updated_at FROM chain_facts WHERE chain = 'Ethereum' ORDER BY dimension",
    ).all()).toEqual(ethereumAfterFirst);
    expect(db.prepare(
      "SELECT * FROM chain_analysis WHERE chain = 'Ethereum'",
    ).get()).toEqual(analysisAfterFirst);
    expect(db.prepare(
      "SELECT dimension, data, sources, updated_at FROM chain_facts WHERE chain = 'Solana' ORDER BY dimension",
    ).all()).toEqual(solanaBefore);
    expect(db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_ethereum_profile_refresh'",
    ).get()).toBeUndefined();
  });
});

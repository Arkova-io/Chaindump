import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function sql(name) {
  return readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
}

function normalizedMigrationName() {
  const names = readdirSync(new URL('../migrations/', import.meta.url));
  const matches = names.filter((name) => name.endsWith('_exchange_case_features.sql'));
  if (matches.length !== 1) throw new Error(`expected one exchange feature migration, found ${matches.length}`);
  return matches[0];
}

function migratedDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE graveyard_meta (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT)');
  db.exec(sql('0011_exchange_analysis.sql'));
  db.exec(sql('0012_exchange_seed.sql'));
  db.exec(sql('0013_exchange_success_seed.sql'));
  db.exec(sql(normalizedMigrationName()));
  return db;
}

describe('exchange_case_features migration', () => {
  it('normalizes all 29 DEX and all 18 CEX lifecycle cases without overwriting them', () => {
    const db = migratedDb();
    const normalized = db.prepare(
      `SELECT kind, lifecycle, COUNT(*) AS count
       FROM exchange_case_features
       GROUP BY kind, lifecycle
       ORDER BY kind, lifecycle`,
    ).all();
    expect(normalized).toEqual([
      { kind: 'cex', lifecycle: 'dead', count: 14 },
      { kind: 'cex', lifecycle: 'mid', count: 4 },
      { kind: 'dex', lifecycle: 'dead', count: 13 },
      { kind: 'dex', lifecycle: 'mid', count: 6 },
      { kind: 'dex', lifecycle: 'successful', count: 10 },
    ]);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM dead_exchanges`).get().count).toBe(34);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM mid_exchanges`).get().count).toBe(10);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM successful_exchanges`).get().count).toBe(10);
    db.close();
  });

  it('requires explicit operating, token, metric, as-of, evidence, and quality fields', () => {
    const db = migratedDb();
    const gaps = db.prepare(
      `SELECT COUNT(*) AS count
       FROM exchange_case_features
       WHERE operating_model = ''
          OR product_cohort = ''
          OR token_status = ''
          OR token_launch_timing = ''
          OR token_strategy = ''
          OR metric_type = ''
          OR metric_unit = ''
          OR metric_window = ''
          OR metric_as_of NOT GLOB '????-??-??'
          OR NOT json_valid(evidence)
          OR NOT json_valid(quality_issues)
          OR last_verified_at NOT GLOB '????-??-??'
          OR next_review_at NOT GLOB '????-??-??'
          OR freshness_status NOT IN ('current', 'review_due', 'stale', 'unknown')`,
    ).get();
    expect(gaps.count).toBe(0);
    db.close();
  });

  it('records the live Uranium citation as an overlay without rewriting legacy research', () => {
    const db = migratedDb();
    const legacy = db.prepare(
      `SELECT sources FROM dead_exchanges WHERE kind = 'dex' AND slug = 'uranium-finance'`,
    ).get();
    const feature = db.prepare(
      `SELECT evidence FROM exchange_case_features WHERE kind = 'dex' AND slug = 'uranium-finance'`,
    ).get();
    expect(legacy.sources).toContain('crypto-news-flash.com/uranium-finance-exploit');
    expect(JSON.parse(feature.evidence).source_replacements).toEqual({
      'https://www.crypto-news-flash.com/uranium-finance-exploit/':
        'https://www.coindesk.com/markets/2021/04/28/binance-chain-defi-exchange-uranium-finance-loses-50m-in-exploit',
    });
    db.close();
  });

  it('never assigns unlike metrics, units, or windows to one comparison key', () => {
    const db = migratedDb();
    const incompatible = db.prepare(
      `SELECT comparability_key
       FROM exchange_case_features
       GROUP BY comparability_key
       HAVING COUNT(DISTINCT kind) > 1
          OR COUNT(DISTINCT product_cohort) > 1
          OR COUNT(DISTINCT metric_type) > 1
          OR COUNT(DISTINCT metric_unit) > 1
          OR COUNT(DISTINCT metric_window) > 1`,
    ).all();
    expect(incompatible).toEqual([]);

    const special = db.prepare(
      `SELECT slug, metric_type, comparability_key
       FROM exchange_case_features
       WHERE slug IN ('jupiter', 'hyperliquid', 'uniswap')
       ORDER BY slug`,
    ).all();
    expect(new Set(special.map((row) => row.comparability_key)).size).toBe(3);
    expect(special.map((row) => row.metric_type)).toEqual([
      'perpetual_notional_volume_24h',
      'aggregator_routed_volume_24h',
      'spot_volume_24h',
    ]);

    const cexVolume = db.prepare(
      `SELECT slug, metric_type
       FROM exchange_case_features
       WHERE slug IN ('bithumb', 'htx', 'kucoin')
       ORDER BY slug`,
    ).all();
    expect(cexVolume.map((row) => row.metric_type)).toEqual([
      'spot_volume_daily_average',
      'spot_volume_quarterly',
      'futures_notional_volume_quarterly',
    ]);
    const statusUnits = db.prepare(
      `SELECT DISTINCT metric_unit
       FROM exchange_case_features
       WHERE metric_type = 'operational_status'`,
    ).all();
    expect(statusUnits).toEqual([{ metric_unit: 'status' }]);
    db.close();
  });

  it('maps only exact successful-case metric evidence and never infers legacy evidence from source order', () => {
    const db = migratedDb();
    const rows = db.prepare(
      `SELECT f.slug, f.lifecycle, f.evidence, c.sources, c.profile
       FROM exchange_case_features f
       INNER JOIN (
         SELECT kind, slug, 'dead' AS lifecycle, sources, profile FROM dead_exchanges
         UNION ALL
         SELECT kind, slug, 'mid', sources, profile FROM mid_exchanges
         UNION ALL
         SELECT type AS kind, slug, 'successful', sources, profile FROM successful_exchanges
       ) c ON c.kind = f.kind AND c.slug = f.slug AND c.lifecycle = f.lifecycle
       WHERE f.kind = 'dex'
         AND f.slug IN ('kyberswap', 'sushiswap', 'dydx', 'hyperliquid', 'uniswap')
       ORDER BY f.slug`,
    ).all();
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      const sources = JSON.parse(row.sources);
      const indexes = JSON.parse(row.evidence).metric_source_indexes;
      if (row.lifecycle === 'successful') {
        expect(indexes).toHaveLength(1);
        const mappedUrl = sources[indexes[0]].url;
        expect(mappedUrl).toBe(JSON.parse(row.profile).metrics.source_url);
      } else {
        expect(indexes).toEqual([]);
      }
    }
    expect(JSON.parse(rows.find((row) => row.slug === 'dydx').evidence).metric_source_indexes).toEqual([2]);
    expect(JSON.parse(rows.find((row) => row.slug === 'hyperliquid').evidence).metric_source_indexes).toEqual([2]);
    expect(JSON.parse(rows.find((row) => row.slug === 'uniswap').evidence).metric_source_indexes).toEqual([1]);
    db.close();
  });

  it('keeps uncited token and lifecycle claims partial and exposes their review state', () => {
    const db = migratedDb();
    const uncited = db.prepare(
      `SELECT COUNT(*) AS count
       FROM exchange_case_features
       WHERE token_status = 'launched' AND token_source_url IS NULL`,
    ).get().count;
    const wronglyVerified = db.prepare(
      `SELECT COUNT(*) AS count
       FROM exchange_case_features
       WHERE quality_label = 'verified'
          OR freshness_status != 'unknown'
          OR lifecycle_evidence_date IS NOT NULL`,
    ).get().count;
    expect(uncited).toBeGreaterThan(0);
    expect(wronglyVerified).toBe(0);
    db.close();
  });
});

import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const sql = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const migrationName = () => readdirSync(new URL('../migrations/', import.meta.url))
  .find((name) => name.endsWith('_bitmex_primary_closure_evidence.sql'));

describe('BitMEX primary closure evidence', () => {
  it('keeps the shutdown announced, cause-limited, and field-cited', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE graveyard_meta (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT)');
    db.exec(sql('0011_exchange_analysis.sql'));
    db.exec(sql('0012_exchange_seed.sql'));
    db.exec(sql('0013_exchange_success_seed.sql'));
    db.exec(sql('0018_exchange_case_features.sql'));
    db.exec(sql('0021_exchange_success_cex_wave1.sql'));
    db.exec(sql(migrationName()));
    const row = db.prepare(`SELECT d.verdict, d.collapse_date, d.sources, d.profile, f.metric_type, f.evidence, f.quality_issues, f.freshness_status
      FROM dead_exchanges d JOIN exchange_case_features f ON f.slug = d.slug AND f.kind = d.kind AND f.lifecycle = 'dead'
      WHERE d.slug = 'bitmex'`).get();
    expect(row.verdict).toBe('wind_down_announced');
    expect(row.collapse_date).toBe('2026-09-23');
    expect(JSON.parse(row.sources)).toEqual([{
      title: 'BitMEX — Exchange to Sunset on 23 September at 04:00 UTC',
      url: 'https://www.bitmex.com/blog/bitmex-closure',
    }]);
    expect(JSON.parse(row.profile).cause_status).toBe('not stated by operator');
    expect(row.metric_type).toBe('operations_cease_date');
    expect(JSON.parse(row.evidence).metric_source_indexes).toEqual([0]);
    expect(JSON.parse(row.quality_issues)).toContain('closure_cause_not_stated_by_operator');
    expect(row.freshness_status).toBe('current');
    db.close();
  });
});

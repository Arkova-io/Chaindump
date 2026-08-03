import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ANALYSIS_SECTION_KEYS,
  embeddedCanonicalEntityProfile,
  validateEntityProfile,
} from '../src/lib/entity-profile.js';
import { document, renderMigration } from '../scripts/render-cex-wave-c-migration.mjs';

const migration = readFileSync(
  new URL('../migrations/0084_cex_wave_c_profiles.sql', import.meta.url),
  'utf8',
);
const researchDocument = JSON.parse(readFileSync(
  new URL('../docs/cex-wave-c-profiles-2026-08-03.json', import.meta.url),
  'utf8',
));

function openDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE successful_exchanges (
      slug TEXT NOT NULL, type TEXT NOT NULL, status TEXT, metric_label TEXT,
      metric_type TEXT, metric_unit TEXT, metric REAL, why_successful TEXT,
      outlook TEXT, profile TEXT NOT NULL CHECK (json_valid(profile)),
      sources TEXT NOT NULL CHECK (json_valid(sources)), updated_at TEXT,
      PRIMARY KEY (type, slug)
    );
    CREATE TABLE dead_exchanges (
      slug TEXT NOT NULL, kind TEXT NOT NULL, venue_type TEXT, name TEXT, launched TEXT,
      metric_label TEXT, metric_type TEXT, metric_unit TEXT, peak_metric REAL,
      current_metric REAL, drawdown_pct REAL, peak_date TEXT, collapse_date TEXT,
      why TEXT, outlook TEXT, verdict TEXT,
      sources TEXT NOT NULL CHECK (json_valid(sources)),
      profile TEXT NOT NULL CHECK (json_valid(profile)), updated_at TEXT,
      PRIMARY KEY (kind, slug)
    );
    CREATE TABLE exchange_case_features (
      kind TEXT NOT NULL, slug TEXT NOT NULL, lifecycle TEXT NOT NULL,
      lifecycle_evidence_date TEXT, last_verified_at TEXT, next_review_at TEXT,
      freshness_status TEXT, updated_at TEXT,
      PRIMARY KEY (kind, slug, lifecycle)
    );
    INSERT INTO successful_exchanges VALUES
      ('coinbase','cex','old','old','old','USD',1,'old','old','{"legacy":"coinbase"}','[]','old'),
      ('kraken','cex','old','old','old','USD',1,'old','old','{"legacy":"kraken"}','[]','old'),
      ('untouched','cex','old','old','old','USD',1,'old','old','{"legacy":"untouched"}','[]','old');
    INSERT INTO dead_exchanges VALUES
      ('bitmex','cex','exchange','BitMEX','2014','old','old','USD',1,1,0,'old','old','old','old','old','[]','{"legacy":"bitmex"}','old'),
      ('ftx','cex','exchange','FTX','2019','old','old','USD',1,1,0,'old','old','old','old','old','[]','{"legacy":"ftx"}','old'),
      ('bittrex','cex','exchange','Bittrex','2014','old','old','USD',1,1,0,'old','old','old','old','old','[]','{"legacy":"bittrex"}','old');
    INSERT INTO exchange_case_features VALUES
      ('cex','coinbase','successful','old','old','old','old','old'),
      ('cex','kraken','successful','old','old','old','old','old'),
      ('cex','bitmex','dead','old','old','old','old','old'),
      ('cex','ftx','dead','old','old','old','old','old'),
      ('cex','bittrex','dead','old','old','old','old','old'),
      ('cex','untouched','successful','old','old','old','old','old');
  `);
  return database;
}

function canonical(database, table, slug) {
  const discriminator = table === 'successful_exchanges' ? 'type' : 'kind';
  const row = database.prepare(`SELECT profile FROM ${table} WHERE ${discriminator} = 'cex' AND slug = ?`).get(slug);
  return embeddedCanonicalEntityProfile(row?.profile, { type: 'cex', slug });
}

let database;

beforeEach(() => { database = openDatabase(); });
afterEach(() => { database.close(); });

describe('CEX wave C canonical profiles', () => {
  it('keeps source data and migration deterministic', () => {
    expect(researchDocument).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document.generated_migration).toBe('0084_cex_wave_c_profiles.sql');
    expect(document.cases.map(({ slug }) => slug)).toEqual([
      'coinbase', 'kraken', 'bitmex', 'ftx', 'bittrex',
    ]);
  });

  it('uses the exact shared report template with atomic, source-linked claims', () => {
    database.exec(migration);
    for (const { table, slug } of document.cases) {
      const profile = canonical(database, table, slug);
      expect(profile).not.toBeNull();
      expect(validateEntityProfile(profile), slug).toEqual([]);
      expect(Object.keys(profile.analysis.sections)).toEqual(ANALYSIS_SECTION_KEYS);
      expect(profile.quality).toMatchObject({ publication_state: 'review', completeness_pct: 100 });
      for (const [sectionKey, section] of Object.entries(profile.analysis.sections)) {
        expect(section.body.trim().length, `${slug}.${sectionKey}`).toBeGreaterThan(0);
        expect(section.body).not.toMatch(/source_ids|field_path|canonical_profile|\[object Object\]/i);
        expect(section.claim_ids.length, `${slug}.${sectionKey} claim count`).toBeGreaterThanOrEqual(2);
        expect(section.claim_ids.length, `${slug}.${sectionKey} claim count`).toBeLessThanOrEqual(4);
        for (const claimId of section.claim_ids) {
          const claim = profile.claims.find(({ id }) => id === claimId);
          expect(claim).toMatchObject({
            field_path: `analysis.sections.${sectionKey}.body`,
            review: { state: 'pending', reviewer: null, reviewed_at: null },
          });
          expect(claim.assertion.length).toBeLessThanOrEqual(240);
          expect(claim.source_ids.length).toBeGreaterThan(0);
          expect(claim.source_ids.every((id) => profile.sources.some((source) => source.id === id))).toBe(true);
        }
      }
    }
  });

  it('keeps current status, entity and measurement boundaries explicit', () => {
    database.exec(migration);
    const coinbase = canonical(database, 'successful_exchanges', 'coinbase');
    const kraken = canonical(database, 'successful_exchanges', 'kraken');
    const bitmex = canonical(database, 'dead_exchanges', 'bitmex');
    const ftx = canonical(database, 'dead_exchanges', 'ftx');
    const bittrex = canonical(database, 'dead_exchanges', 'bittrex');

    expect(coinbase.analysis.sections.what_happened.body).toContain('$1.221 trillion');
    expect(coinbase.analysis.sections.what_happened.body).toContain('$5.2 trillion');
    expect(coinbase.analysis.sections.what_happened.body).toContain('different definitions');
    expect(kraken.analysis.sections.what_happened.body).toContain('not spot-only');
    expect(bitmex.status.operating_state).toBe('wind_down_announced');
    expect(bitmex.analysis.sections.lifecycle.body).toContain('September 23, 2026');
    expect(bitmex.analysis.sections.why_this_outcome.body).toContain('has not published a specific cause');
    expect(ftx.analysis.sections.lifecycle.body).toContain('petition-date dollar claims');
    expect(ftx.analysis.sections.lifecycle.body).toContain('does not mean customers were made whole');
    expect(bittrex.analysis.sections.what_it_is.body).toContain('separate legal entities');
  });

  it('cannot publish while editorial review is pending', () => {
    database.exec(migration);
    for (const { table, slug } of document.cases) {
      const profile = structuredClone(canonical(database, table, slug));
      profile.quality.publication_state = 'published';
      const errors = validateEntityProfile(profile, { forPublication: true, now: new Date('2026-08-03T19:00:00Z') });
      expect(errors.some(({ code }) => code === 'reviewed_support_required'), slug).toBe(true);
    }
  });

  it('preserves legacy JSON, leaves unrelated rows alone and replays idempotently', () => {
    database.exec(migration);
    const first = database.prepare("SELECT * FROM successful_exchanges WHERE type='cex' ORDER BY slug").all();
    expect(JSON.parse(first.find(({ slug }) => slug === 'coinbase').profile)).toMatchObject({
      legacy: 'coinbase', canonical_profile: { identity: { id: 'cex:coinbase' } },
    });
    expect(first.find(({ slug }) => slug === 'untouched')).toMatchObject({ profile: '{"legacy":"untouched"}', updated_at: 'old' });
    expect(database.prepare("SELECT DISTINCT lifecycle_evidence_date, last_verified_at, next_review_at, freshness_status, updated_at FROM exchange_case_features WHERE slug <> 'untouched'").all()).toEqual([{
      lifecycle_evidence_date: '2026-08-03',
      last_verified_at: '2026-08-03',
      next_review_at: '2026-08-10',
      freshness_status: 'current',
      updated_at: '2026-08-03',
    }]);
    expect(database.prepare("SELECT * FROM exchange_case_features WHERE slug='untouched'").get()).toMatchObject({
      lifecycle_evidence_date: 'old', last_verified_at: 'old', next_review_at: 'old', freshness_status: 'old', updated_at: 'old',
    });
    database.exec(migration);
    expect(database.prepare("SELECT * FROM successful_exchanges WHERE type='cex' ORDER BY slug").all()).toEqual(first);
    expect(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='_cex_wave_c_0084'").get().count).toBe(0);
  });
});

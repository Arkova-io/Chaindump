import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ANALYSIS_SECTION_KEYS,
  embeddedCanonicalEntityProfile,
  validateEntityProfile,
} from '../src/lib/entity-profile.js';
import {
  document,
  renderMigration,
} from '../scripts/render-exchange-gold-profiles-migration.mjs';

const migration = readFileSync(
  new URL('../migrations/0068_exchange_gold_profiles.sql', import.meta.url),
  'utf8',
);
const researchDocument = JSON.parse(readFileSync(
  new URL('../docs/exchange-gold-profiles-2026-08-03.json', import.meta.url),
  'utf8',
));
const worker = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');

function openDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE successful_exchanges (
      slug TEXT NOT NULL,
      type TEXT NOT NULL,
      metric_label TEXT,
      metric_type TEXT,
      metric_unit TEXT,
      metric REAL,
      why_successful TEXT,
      outlook TEXT,
      profile TEXT NOT NULL CHECK (json_valid(profile)),
      sources TEXT NOT NULL CHECK (json_valid(sources)),
      updated_at TEXT,
      PRIMARY KEY (type, slug)
    );
    CREATE TABLE exchange_case_features (
      kind TEXT NOT NULL,
      slug TEXT NOT NULL,
      lifecycle TEXT NOT NULL,
      metric_type TEXT,
      metric_unit TEXT,
      metric_window TEXT,
      metric_as_of TEXT,
      metric_observed_at TEXT,
      comparability_key TEXT,
      last_verified_at TEXT,
      next_review_at TEXT,
      freshness_status TEXT,
      updated_at TEXT,
      PRIMARY KEY (kind, slug, lifecycle)
    );
    INSERT INTO successful_exchanges VALUES
      ('uniswap', 'dex', 'old', 'old', 'USD', 1, 'old', 'old', '{"preserved":"uniswap"}', '[]', 'old'),
      ('binance', 'cex', 'old', 'old', 'USD', 1, 'old', 'old', '{"preserved":"binance"}', '[]', 'old'),
      ('untouched', 'dex', 'old', 'old', 'USD', 1, 'old', 'old', '{"preserved":"untouched"}', '[]', 'old');
    INSERT INTO exchange_case_features VALUES
      ('dex', 'uniswap', 'successful', 'old', 'usd', 'old', '2026-07-29', NULL, 'old', '2026-07-29', '2026-08-05', 'review_due', 'old'),
      ('cex', 'binance', 'successful', 'old', 'usd', 'old', '2025-12-31', NULL, 'old', '2026-07-29', '2026-08-05', 'review_due', 'old'),
      ('dex', 'untouched', 'successful', 'old', 'usd', 'old', '2026-07-29', NULL, 'old', '2026-07-29', '2026-08-05', 'review_due', 'old');
  `);
  return database;
}

function getCanonical(database, type, slug) {
  const row = database.prepare(`
    SELECT profile
    FROM successful_exchanges
    WHERE type = ? AND slug = ?
  `).get(type, slug);
  return embeddedCanonicalEntityProfile(row?.profile, { type, slug });
}

let database;

beforeEach(() => {
  database = openDatabase();
});

afterEach(() => {
  database.close();
});

describe('Uniswap and Binance canonical gold profiles', () => {
  it('keeps the reviewed document and generated migration deterministic', () => {
    expect(researchDocument).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document.generated_migration).toBe('0068_exchange_gold_profiles.sql');
    expect(document.cases.map(({ type, slug }) => `${type}:${slug}`)).toEqual([
      'dex:uniswap',
      'cex:binance',
    ]);
  });

  it('keeps all ten prose sections visible with source-linked pending claims', () => {
    database.exec(migration);

    for (const { type, slug } of document.cases) {
      const profile = getCanonical(database, type, slug);
      expect(profile, `${type}:${slug} canonical lookup`).not.toBeNull();
      expect(validateEntityProfile(profile), `${type}:${slug} structural validation`).toEqual([]);
      expect(profile.quality.publication_state).toBe('review');
      expect(profile.claims.every((claim) => (
        claim.review.state === 'pending'
        && claim.review.reviewer === null
        && claim.review.reviewed_at === null
      ))).toBe(true);

      expect(Object.keys(profile.analysis.sections)).toEqual(ANALYSIS_SECTION_KEYS);
      for (const [sectionKey, section] of Object.entries(profile.analysis.sections)) {
        expect(typeof section.body, `${slug}.${sectionKey}`).toBe('string');
        expect(section.body.length, `${slug}.${sectionKey}`).toBeGreaterThan(180);
        expect(section.body, `${slug}.${sectionKey}`).not.toMatch(
          /\[object Object\]|"source_ids"|"evidence_locator"|"title"\s*:/,
        );
        const claims = section.claim_ids.map((claimId) => (
          profile.claims.find(({ id }) => id === claimId)
        ));
        expect(claims).toEqual([expect.objectContaining({
          field_path: `analysis.sections.${sectionKey}.body`,
          support_direction: 'supports',
          review: {
            state: 'pending',
            reviewer: null,
            reviewed_at: null,
          },
        })]);
        expect(claims[0].source_ids.length).toBeGreaterThan(0);
      }
    }
  });

  it('cannot be promoted to published without human-reviewed supporting claims', () => {
    database.exec(migration);

    for (const { type, slug } of document.cases) {
      const profile = structuredClone(getCanonical(database, type, slug));
      profile.quality.publication_state = 'published';
      const errors = validateEntityProfile(profile, {
        forPublication: true,
        now: new Date('2026-08-03T18:00:00Z'),
      });
      expect(new Set(errors.map(({ code }) => code), `${type}:${slug}`)).toEqual(
        new Set(['reviewed_support_required']),
      );
      expect(errors).toHaveLength(
        2 + ANALYSIS_SECTION_KEYS.length + profile.metrics.length + profile.events.length,
      );
    }
  });

  it('uses dated HTTPS primary or independent sources and labels metric limitations', () => {
    database.exec(migration);

    const uniswap = getCanonical(database, 'dex', 'uniswap');
    const binance = getCanonical(database, 'cex', 'binance');
    for (const profile of [uniswap, binance]) {
      expect(profile.sources.length).toBeGreaterThanOrEqual(12);
      for (const source of profile.sources) {
        expect(source.url).toMatch(/^https:\/\//);
        expect(['primary', 'independent']).toContain(source.role);
        expect(source.access_state).toBe('reachable');
        expect(Date.parse(source.accessed_at)).not.toBeNaN();
        expect(Date.parse(source.checked_at)).not.toBeNaN();
      }
      expect(profile.freshness).toMatchObject({
        state: 'current',
        last_reviewed_at: '2026-08-03T16:30:00Z',
        next_review_at: '2026-08-10T16:30:00Z',
      });
      expect(
        Date.parse(profile.freshness.next_review_at)
          - Date.parse(profile.freshness.last_reviewed_at),
      ).toBe(7 * 24 * 60 * 60 * 1000);
      expect(profile.freshness.last_reviewed_at).toBe(
        profile.sources.map(({ checked_at: checkedAt }) => checkedAt).sort().at(-1),
      );
      expect(profile.extensions.methodology_notes[0]).toContain(
        'records evidence assembly and source verification, not human approval',
      );
      expect(profile.metrics.every(({ as_of: asOf }) => Date.parse(asOf) > 0)).toBe(true);
    }

    expect(uniswap.analysis.sections.token_and_value_capture.body).toContain(
      'separate from about $96.33 million of total 30-day trading fees',
    );
    expect(binance.metrics.find(({ dimension }) => dimension === 'customer_assets'))
      .toMatchObject({
        label: 'DefiLlama-tracked on-chain exchange wallet balances',
        quality_flags: ['partial_wallet_coverage', 'not_liability_matched'],
      });
    expect(binance.analysis.sections.what_happened.body).toContain(
      'operator figures, not audited financial statements',
    );
  });

  it('preserves legacy data, refreshes the feature overlay, and replays idempotently', () => {
    database.exec(migration);
    const first = database.prepare(`
      SELECT type, slug, profile, sources, updated_at
      FROM successful_exchanges
      WHERE slug IN ('uniswap', 'binance')
      ORDER BY type, slug
    `).all();

    for (const row of first) {
      const parsed = JSON.parse(row.profile);
      expect(parsed.preserved).toBe(row.slug);
      expect(parsed.canonical_profile.identity).toMatchObject({
        type: row.type,
        slug: row.slug,
      });
      expect(JSON.parse(row.sources)).toEqual([]);
      expect(parsed.canonical_profile.sources.length).toBeGreaterThanOrEqual(12);
      expect(row.updated_at).toBe('2026-08-03');
    }
    expect(database.prepare(`
      SELECT metric_as_of, metric_observed_at, last_verified_at, next_review_at, freshness_status
      FROM exchange_case_features
      WHERE kind = 'dex' AND slug = 'uniswap' AND lifecycle = 'successful'
    `).get()).toEqual({
      metric_as_of: '2026-08-03',
      metric_observed_at: '2026-08-03T16:18:00Z',
      last_verified_at: '2026-08-03',
      next_review_at: '2026-08-10',
      freshness_status: 'current',
    });

    database.exec(migration);
    const second = database.prepare(`
      SELECT type, slug, profile, sources, updated_at
      FROM successful_exchanges
      WHERE slug IN ('uniswap', 'binance')
      ORDER BY type, slug
    `).all();
    expect(second).toEqual(first);
    expect(database.prepare(`
      SELECT profile, updated_at
      FROM successful_exchanges
      WHERE slug = 'untouched'
    `).get()).toEqual({
      profile: '{"preserved":"untouched"}',
      updated_at: 'old',
    });
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM sqlite_master
      WHERE type = 'table' AND name = '_exchange_gold_profiles_0068'
    `).get().count).toBe(0);
  });

  it('routes an embedded canonical exchange profile before the legacy adapter', () => {
    const canonicalBranch = worker.indexOf(
      'const embeddedProfile = embeddedCanonicalEntityProfile(rows[0].profile, { type, slug });',
    );
    const legacyBranch = worker.indexOf('const normalized = normalizeExchangeCase(rows[0]);', canonicalBranch);
    expect(canonicalBranch).toBeGreaterThan(-1);
    expect(worker.slice(canonicalBranch, legacyBranch)).toContain(
      'if (embeddedProfile) return embeddedProfile;',
    );
    expect(legacyBranch).toBeGreaterThan(canonicalBranch);
  });
});

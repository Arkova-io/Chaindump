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
} from '../scripts/render-exchange-control-profiles-migration.mjs';

const migration = readFileSync(
  new URL('../migrations/0070_exchange_control_profiles.sql', import.meta.url),
  'utf8',
);
const researchDocument = JSON.parse(readFileSync(
  new URL('../docs/exchange-control-profiles-2026-08-03.json', import.meta.url),
  'utf8',
));

function openDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE mid_exchanges (
      slug TEXT NOT NULL,
      kind TEXT NOT NULL,
      metric_label TEXT,
      metric_type TEXT,
      metric_unit TEXT,
      metric REAL,
      verdict TEXT,
      why_stuck TEXT,
      outlook TEXT,
      profile TEXT,
      sources TEXT,
      updated_at TEXT,
      PRIMARY KEY (kind, slug)
    );
    CREATE TABLE successful_exchanges (
      slug TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT,
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
    INSERT INTO mid_exchanges VALUES
      ('sushiswap', 'dex', 'old', 'old', 'USD', 1, 'old', 'old', 'old', '{"preserved":"sushiswap"}', '[{"title":"legacy sushi","url":"https://example.com/sushi"}]', 'old'),
      ('untouched-mid', 'dex', 'old', 'old', 'USD', 1, 'old', 'old', 'old', '{"preserved":"untouched-mid"}', '[]', 'old');
    INSERT INTO successful_exchanges VALUES
      ('bybit', 'cex', 'old', 'old', 'old', 'USD', 1, 'old', 'old', '{"preserved":"bybit"}', '[{"title":"legacy bybit","url":"https://example.com/bybit"}]', 'old'),
      ('untouched-success', 'cex', 'old', 'old', 'old', 'USD', 1, 'old', 'old', '{"preserved":"untouched-success"}', '[]', 'old');
    INSERT INTO exchange_case_features VALUES
      ('dex', 'sushiswap', 'mid', 'old', 'usd', 'old', '2026-07-29', NULL, 'old', '2026-07-29', '2026-08-05', 'review_due', 'old'),
      ('cex', 'bybit', 'successful', 'old', 'usd', 'old', '2025-12-31', NULL, 'old', '2026-07-29', '2026-08-05', 'review_due', 'old'),
      ('dex', 'untouched-mid', 'mid', 'old', 'usd', 'old', '2026-07-29', NULL, 'old', '2026-07-29', '2026-08-05', 'review_due', 'old');
  `);
  return database;
}

function getCanonical(database, table, type, slug) {
  const discriminator = table === 'mid_exchanges' ? 'kind' : 'type';
  const row = database.prepare(`
    SELECT profile
    FROM ${table}
    WHERE ${discriminator} = ? AND slug = ?
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

describe('SushiSwap and Bybit canonical control profiles', () => {
  it('keeps the research document and generated migration deterministic', () => {
    expect(researchDocument).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document.generated_migration).toBe('0070_exchange_control_profiles.sql');
    expect(document.cases.map(({ type, slug }) => `${type}:${slug}`)).toEqual([
      'dex:sushiswap',
      'cex:bybit',
    ]);
  });

  it('keeps the normalized ten-section template plain, cited and review-only', () => {
    database.exec(migration);

    for (const { table, type, slug } of document.cases) {
      const profile = getCanonical(database, table, type, slug);
      expect(profile, `${type}:${slug} canonical lookup`).not.toBeNull();
      expect(validateEntityProfile(profile), `${type}:${slug} structural validation`).toEqual([]);
      expect(profile.quality).toMatchObject({
        publication_state: 'review',
        completeness_pct: 100,
      });
      expect(profile.claims.every((claim) => (
        claim.review.state === 'pending'
        && claim.review.reviewer === null
        && claim.review.reviewed_at === null
      ))).toBe(true);

      expect(Object.keys(profile.analysis.sections)).toEqual(ANALYSIS_SECTION_KEYS);
      for (const [sectionKey, section] of Object.entries(profile.analysis.sections)) {
        expect(section.body.length, `${slug}.${sectionKey}`).toBeGreaterThan(180);
        expect(section.body, `${slug}.${sectionKey}`).not.toMatch(
          /\[object Object\]|"source_ids"|"evidence_locator"|"title"\s*:/,
        );
        const claim = profile.claims.find(({ id }) => id === section.claim_ids[0]);
        expect(claim).toMatchObject({
          field_path: `analysis.sections.${sectionKey}.body`,
          support_direction: 'supports',
          review: {
            state: 'pending',
            reviewer: null,
            reviewed_at: null,
          },
        });
        expect(claim.source_ids.length).toBeGreaterThan(0);
      }
    }
  });

  it('cannot be promoted to published without human-reviewed support', () => {
    database.exec(migration);

    for (const { table, type, slug } of document.cases) {
      const profile = structuredClone(getCanonical(database, table, type, slug));
      profile.quality.publication_state = 'published';
      const errors = validateEntityProfile(profile, {
        forPublication: true,
        now: new Date('2026-08-03T18:00:00Z'),
      });
      expect(new Set(errors.map(({ code }) => code)), `${type}:${slug}`).toEqual(
        new Set(['reviewed_support_required']),
      );
      expect(errors).toHaveLength(
        2 + ANALYSIS_SECTION_KEYS.length + profile.metrics.length + profile.events.length,
      );
    }
  });

  it('uses current, reachable sources and states the scope limits in human language', () => {
    database.exec(migration);
    const sushi = getCanonical(database, 'mid_exchanges', 'dex', 'sushiswap');
    const bybit = getCanonical(database, 'successful_exchanges', 'cex', 'bybit');

    for (const profile of [sushi, bybit]) {
      expect(profile.sources.length).toBeGreaterThanOrEqual(12);
      for (const source of profile.sources) {
        expect(source.url).toMatch(/^https:\/\//);
        expect(['primary', 'independent', 'aggregator']).toContain(source.role);
        expect(source.access_state).toBe('reachable');
        expect(Date.parse(source.accessed_at)).not.toBeNaN();
        expect(Date.parse(source.checked_at)).not.toBeNaN();
      }
      expect(profile.freshness).toMatchObject({
        state: 'current',
        last_reviewed_at: '2026-08-03T16:44:19Z',
        next_review_at: '2026-08-10T16:44:19Z',
      });
      expect(Date.parse(profile.freshness.next_review_at)
        - Date.parse(profile.freshness.last_reviewed_at)).toBe(7 * 24 * 60 * 60 * 1000);
      expect(profile.extensions.methodology_notes[0]).toContain(
        'records evidence assembly and source verification, not human approval',
      );
    }

    expect(sushi.analysis.sections.what_it_is.body).toContain(
      'aggregator-routed volume is not the same thing as Sushi-owned pool volume or TVL',
    );
    expect(sushi.analysis.sections.risks_and_unknowns.body).toContain(
      '885 ETH returned at the postmortem date',
    );
    expect(bybit.metrics.find(({ dimension }) => dimension === 'customer_assets'))
      .toMatchObject({
        label: 'DefiLlama-tracked on-chain exchange wallet balances',
        quality_flags: ['partial_wallet_coverage', 'not_liability_matched', 'not_financial_audit'],
      });
    expect(bybit.analysis.sections.risks_and_unknowns.body).toContain(
      'not a comprehensive audit of all assets, liabilities',
    );
    expect(bybit.analysis.sections.what_it_is.body).toContain(
      'does not license every Bybit entity or every product worldwide',
    );
  });

  it('preserves legacy sources, refreshes both table shapes and replays idempotently', () => {
    database.exec(migration);
    const first = {
      sushi: database.prepare(`
        SELECT metric_label, metric_type, metric_unit, metric, verdict, profile, sources, updated_at
        FROM mid_exchanges WHERE kind = 'dex' AND slug = 'sushiswap'
      `).get(),
      bybit: database.prepare(`
        SELECT status, metric_label, metric_type, metric_unit, metric, profile, sources, updated_at
        FROM successful_exchanges WHERE type = 'cex' AND slug = 'bybit'
      `).get(),
      features: database.prepare(`
        SELECT kind, slug, lifecycle, metric_type, metric_unit, metric_window,
               metric_as_of, metric_observed_at, comparability_key,
               last_verified_at, next_review_at, freshness_status, updated_at
        FROM exchange_case_features
        WHERE (kind = 'dex' AND slug = 'sushiswap' AND lifecycle = 'mid')
           OR (kind = 'cex' AND slug = 'bybit' AND lifecycle = 'successful')
        ORDER BY kind, slug
      `).all(),
    };

    expect(JSON.parse(first.sushi.profile)).toMatchObject({
      preserved: 'sushiswap',
      canonical_profile: { identity: { id: 'dex:sushiswap' } },
    });
    expect(JSON.parse(first.bybit.profile)).toMatchObject({
      preserved: 'bybit',
      canonical_profile: { identity: { id: 'cex:bybit' } },
    });
    expect(JSON.parse(first.sushi.sources)).toEqual([
      { title: 'legacy sushi', url: 'https://example.com/sushi' },
    ]);
    expect(JSON.parse(first.bybit.sources)).toEqual([
      { title: 'legacy bybit', url: 'https://example.com/bybit' },
    ]);
    expect(first.sushi).toMatchObject({
      metric_label: 'Protocol TVL',
      metric_type: 'tvl',
      metric_unit: 'USD',
      metric: 32700621,
      verdict: 'declining',
      updated_at: '2026-08-03',
    });
    expect(first.bybit).toMatchObject({
      status: 'successful_established',
      metric_type: 'spot_volume_24h_btc_equivalent',
      metric_unit: 'BTC',
      updated_at: '2026-08-03',
    });
    expect(first.features).toEqual([
      {
        kind: 'cex',
        slug: 'bybit',
        lifecycle: 'successful',
        metric_type: 'spot_volume_24h_btc_equivalent',
        metric_unit: 'btc_equivalent',
        metric_window: 'rolling_24h',
        metric_as_of: '2026-08-03',
        metric_observed_at: '2026-08-03T16:41:58Z',
        comparability_key: 'cex|centralized_multi_product_exchange|spot_volume_24h_btc_equivalent|btc_equivalent|rolling_24h',
        last_verified_at: '2026-08-03',
        next_review_at: '2026-08-10',
        freshness_status: 'current',
        updated_at: '2026-08-03',
      },
      {
        kind: 'dex',
        slug: 'sushiswap',
        lifecycle: 'mid',
        metric_type: 'tvl',
        metric_unit: 'usd',
        metric_window: 'point_in_time',
        metric_as_of: '2026-08-03',
        metric_observed_at: '2026-08-03T15:19:11Z',
        comparability_key: 'dex|spot_amm_and_aggregator|tvl|usd|point_in_time',
        last_verified_at: '2026-08-03',
        next_review_at: '2026-08-10',
        freshness_status: 'current',
        updated_at: '2026-08-03',
      },
    ]);

    database.exec(migration);
    expect(database.prepare(`
      SELECT metric_label, metric_type, metric_unit, metric, verdict, profile, sources, updated_at
      FROM mid_exchanges WHERE kind = 'dex' AND slug = 'sushiswap'
    `).get()).toEqual(first.sushi);
    expect(database.prepare(`
      SELECT status, metric_label, metric_type, metric_unit, metric, profile, sources, updated_at
      FROM successful_exchanges WHERE type = 'cex' AND slug = 'bybit'
    `).get()).toEqual(first.bybit);
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM sqlite_master
      WHERE type = 'table' AND name = '_exchange_control_profiles_0070'
    `).get().count).toBe(0);
    expect(database.prepare(`
      SELECT profile, sources, updated_at
      FROM mid_exchanges WHERE kind = 'dex' AND slug = 'untouched-mid'
    `).get()).toEqual({
      profile: '{"preserved":"untouched-mid"}',
      sources: '[]',
      updated_at: 'old',
    });
  });
});

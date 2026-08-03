import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const migration = readFileSync(
  new URL('../migrations/0067_usdc_profile_refresh.sql', import.meta.url),
  'utf8',
);

const CANONICAL_SECTIONS = [
  'what_it_is',
  'what_happened',
  'why_this_outcome',
  'strategic_choices',
  'operating_model',
  'token_and_value_capture',
  'counterfactual',
  'risks_and_unknowns',
  'lifecycle',
  'outlook_and_watch',
];

const ALLOWED_SOURCE_HOSTS = new Set([
  '6778953.fs1.hubspotusercontent-na1.net',
  'apps.occ.gov',
  'stablecoins.llama.fi',
  'www.blackrock.com',
  'www.circle.com',
  'www.esma.europa.eu',
  'www.occ.gov',
]);

function openDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE stablecoin_meta (
      slug TEXT PRIMARY KEY,
      name TEXT,
      symbol TEXT,
      profile TEXT,
      sources TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  db.prepare(`
    INSERT INTO stablecoin_meta (slug, name, symbol, profile, sources, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'usdc',
    'USD Coin',
    'USDC',
    JSON.stringify({
      backing: 'Cash and Treasuries with approximately 73 billion dollars of supply.',
      audits: 'Monthly reserve attestations by Deloitte.',
      regulatory: 'First MiCA-authorized stablecoin and a flagship GENIUS Act issuer.',
      comparison: 'Wins on regulation and transparency.',
    }),
    JSON.stringify(['https://en.wikipedia.org/wiki/USD_Coin']),
    '2026-07-08 19:14:07',
  );
  db.prepare(`
    INSERT INTO stablecoin_meta (slug, name, symbol, profile, sources, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'usdt',
    'Tether',
    'USDT',
    JSON.stringify({ notes: 'Preserve this row.' }),
    JSON.stringify(['https://tether.to/']),
    '2026-07-08 19:14:08',
  );
  return db;
}

function d1ForRow(row) {
  return {
    prepare(sql) {
      return {
        bind() { return this; },
        async all() {
          if (sql.includes('FROM stablecoin_meta')) return { results: [row] };
          return { results: [] };
        },
      };
    },
  };
}

let db;

beforeEach(() => {
  db = openDatabase();
});

afterEach(() => {
  db.close();
});

describe('USDC gold-standard profile refresh migration', () => {
  it('replaces robotic comparative copy with canonical profile source data', () => {
    db.exec(migration);
    const row = db.prepare("SELECT * FROM stablecoin_meta WHERE slug = 'usdc'").get();
    const profile = JSON.parse(row.profile);
    const canonical = profile.canonical_profile;

    expect(row).toMatchObject({
      name: 'USD Coin',
      symbol: 'USDC',
      updated_at: '2026-08-03',
    });
    expect(Object.keys(canonical.sections)).toEqual(CANONICAL_SECTIONS);
    expect(canonical).toMatchObject({
      schema: 'chaindump-entity-profile-source',
      version: 1,
      status: {
        operating_state: 'operating',
        as_of: '2026-08-03',
      },
      freshness: {
        state: 'current',
        last_reviewed_at: '2026-08-03',
        next_review_at: '2026-08-10',
      },
      confidence: 'medium',
    });
    for (const [section, value] of Object.entries(canonical.sections)) {
      expect(typeof value, section).toBe('string');
      expect(value.trim().length, section).toBeGreaterThan(20);
      expect(canonical.section_dates[section], section).toBe('2026-08-03');
      expect(canonical.section_claim_ids[section].length, section).toBeGreaterThan(0);
    }

    expect(profile).toMatchObject({
      type: 'Fiat-backed US-dollar stablecoin with region-specific issuance and redemption terms.',
      yield: expect.stringContaining('does not pay holder interest'),
      current_observation: {
        observed_at: '2026-08-03T16:14:26Z',
        circulating_supply_usd: 72024953948.83426,
        price_usd: 0.9997770501068687,
        previous_week_circulating_supply_usd: 73448486326.83969,
        seven_day_supply_change_pct: -1.9381,
        reported_chain_count: 154,
      },
      reserve_observation: {
        period_end: '2026-06-30',
        report_date: '2026-07-29',
        usdc_in_circulation: 73268560097,
        reserve_assets_fair_value_usd: 73344909176,
      },
    });
    expect(profile.evidence_policy).toMatchObject({
      schema: 'forensic-freshness-v1',
      status_basis: 'direct_current',
      status_as_of: '2026-08-03',
      last_verified_at: '2026-08-03',
      next_review_at: '2026-08-10',
      stale: false,
    });

    const evergreenCopy = [
      profile.backing,
      profile.daily_activity,
      profile.audits,
      profile.transparency,
      profile.outlook,
    ].join(' ');
    expect(evergreenCopy).not.toMatch(/\$73B|~\$|72,?024,?953,?948|0\.999777/);
    expect(JSON.stringify(profile)).not.toMatch(/wins on|flagship compliant|industry-leading|evidence_reviewed/i);
  });

  it('keeps legal and regulatory claims scoped to what each source establishes', () => {
    db.exec(migration);
    const profile = JSON.parse(db.prepare(
      "SELECT profile FROM stablecoin_meta WHERE slug = 'usdc'",
    ).get().profile);
    const copy = JSON.stringify(profile);

    expect(profile.canonical_profile.sections.operating_model).toContain(
      'Outside the EEA, direct redemption in the reviewed terms depends on Circle Mint eligibility',
    );
    expect(profile.canonical_profile.sections.operating_model).toContain(
      'The EEA materials describe at-par redemption',
    );
    expect(profile.regulatory).toContain(
      'ESMA warns that registered crypto-asset whitepapers have not been reviewed or approved',
    );
    expect(profile.regulatory).toContain(
      'The official OCC material reviewed records a 2025-12-12 preliminary conditional approval',
    );
    expect(profile.regulatory).toContain(
      'Circle separately announced final approval',
    );
    expect(copy).toContain('planned future capability');
    expect(copy).not.toMatch(/unconditional.{0,30}redemption|FDIC.insured|deposit.insurance|full reserve audit|MiCA-approved whitepaper/i);
  });

  it('uses canonical source enums and resolves every claim, section, metric and event reference', () => {
    db.exec(migration);
    const row = db.prepare(
      "SELECT profile, sources FROM stablecoin_meta WHERE slug = 'usdc'",
    ).get();
    const profile = JSON.parse(row.profile);
    const sources = JSON.parse(row.sources);
    const ids = new Set(sources.map(({ id }) => id));
    const canonical = profile.canonical_profile;
    const claimIds = new Set(canonical.claims.map(({ id }) => id));

    expect(profile.sources).toEqual(sources);
    expect(sources).toHaveLength(12);
    for (const source of sources) {
      expect(source).toMatchObject({
        last_verified_at: '2026-08-03',
        checked_at: '2026-08-03',
        access_state: 'reachable',
        stale: false,
      });
      expect(['published', 'updated', 'event', 'observed', 'unknown'])
        .toContain(source.source_date_kind);
      expect(['historical_event', 'mechanism', 'current_state', 'terminal_outcome'])
        .toContain(source.evidence_scope);
      expect(['primary', 'independent', 'aggregator']).toContain(source.source_role);
      expect(['A', 'B', 'C', 'D', 'unknown']).toContain(source.tier);
      expect(['primary', 'independent', 'aggregator']).toContain(source.role);
      expect(source.accessed_at).toBeTruthy();
      const host = new URL(source.url).hostname;
      expect(ALLOWED_SOURCE_HOSTS.has(host), source.url).toBe(true);
      const expectedRole = host === 'stablecoins.llama.fi'
        ? 'aggregator'
        : host === '6778953.fs1.hubspotusercontent-na1.net'
          ? 'independent'
          : 'primary';
      expect(source.source_role).toBe(expectedRole);
      expect(source.role).toBe(expectedRole);
      if (source.evidence_scope === 'current_state') {
        expect(source.stale_after).toMatch(/^2026-08-(10|31)$/);
      }
      expect(source.url).not.toMatch(/chaindump\.xyz|wikipedia\.org/);
    }

    for (const claim of canonical.claims) {
      expect(claim.source_ids.length, claim.id).toBeGreaterThan(0);
      for (const sourceId of claim.source_ids) {
        expect(ids.has(sourceId), `${claim.id} unresolved source ${sourceId}`).toBe(true);
      }
      expect(claim.review).toEqual({ state: 'pending', reviewer: null, reviewed_at: null });
    }
    for (const refs of Object.values(canonical.section_claim_ids)) {
      for (const claimId of refs) expect(claimIds.has(claimId), claimId).toBe(true);
    }
    for (const record of [...canonical.metrics, ...canonical.events]) {
      for (const claimId of record.claim_ids) expect(claimIds.has(claimId), claimId).toBe(true);
    }
  });

  it('feeds the canonical stablecoin endpoint without flattening structured data into prose', async () => {
    db.exec(migration);
    const row = db.prepare("SELECT * FROM stablecoin_meta WHERE slug = 'usdc'").get();
    vi.resetModules();
    const worker = (await import('../src/worker.js')).default;
    const response = await worker.fetch(
      new Request('http://localhost/api/profile/stablecoin/usdc'),
      { DB: d1ForRow(row) },
      { waitUntil() {}, passThroughOnException() {} },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      schema: 'chaindump-entity-profile',
      version: 1,
      identity: { id: 'stablecoin:usdc', type: 'stablecoin', slug: 'usdc', name: 'USD Coin' },
      status: { operating_state: 'operating', as_of: '2026-08-03' },
      outcome: { label: null, as_of: null, rule_id: null, confidence: null, claim_ids: [] },
      freshness: { state: 'current', last_reviewed_at: '2026-08-03', next_review_at: '2026-08-10' },
      quality: {
        publication_state: 'review',
        completeness_pct: 100,
        confidence: 'medium',
        unsourced_fields: [],
        validation_errors: [],
      },
    });
    expect(Object.keys(body.analysis.sections)).toEqual(CANONICAL_SECTIONS);
    for (const [section, value] of Object.entries(body.analysis.sections)) {
      expect(typeof value.body, section).toBe('string');
      expect(value.body.trim().length, section).toBeGreaterThan(20);
      expect(value.as_of, section).toBe('2026-08-03');
      expect(value.claim_ids.length, section).toBeGreaterThan(0);
      expect(value.body, section).not.toMatch(/source_role|source_refs|evidence_locator|https?:\/\/|\{.*\}/i);
    }
    expect(body.sources).toHaveLength(12);
    expect(body.sources.every(({ role }) => role !== 'unknown')).toBe(true);
    expect(body.sources.every(({ access_state: state }) => state === 'reachable')).toBe(true);
    expect(body.claims).toHaveLength(20);
    expect(body.claims.every(({ review }) => review.state === 'pending')).toBe(true);
    expect(body.metrics.map(({ dimension }) => dimension)).toEqual([
      'circulating_supply',
      'price',
      'peg_deviation',
      'reserve_assets',
      'reserve_coverage',
    ]);
    expect(body.metrics.every(({ value }) => Number.isFinite(value))).toBe(true);
    expect(body.events).toHaveLength(4);
    expect(Array.isArray(body.extensions.structured_analysis.strategic_choices)).toBe(true);
    expect(body.extensions.category_data).not.toHaveProperty('canonical_profile');
  });

  it('withholds a non-prose canonical section instead of serializing it into copy', async () => {
    db.exec(migration);
    const row = db.prepare("SELECT * FROM stablecoin_meta WHERE slug = 'usdc'").get();
    const profile = JSON.parse(row.profile);
    profile.canonical_profile.sections.strategic_choices =
      profile.canonical_profile.extensions.structured_analysis.strategic_choices;
    row.profile = JSON.stringify(profile);

    vi.resetModules();
    const worker = (await import('../src/worker.js')).default;
    const response = await worker.fetch(
      new Request('http://localhost/api/profile/stablecoin/usdc'),
      { DB: d1ForRow(row) },
      { waitUntil() {}, passThroughOnException() {} },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.analysis.sections.strategic_choices.body).toBeNull();
    expect(body.extensions.legacy_unmapped.strategic_choices).toEqual(
      profile.canonical_profile.extensions.structured_analysis.strategic_choices,
    );
    expect(body.quality).toMatchObject({
      publication_state: 'review',
      completeness_pct: 90,
      unsourced_fields: ['analysis.sections.strategic_choices.body'],
    });
    expect(JSON.stringify(body.analysis)).not.toMatch(/decision|consequence|claim:usdc:strategy/);
  });

  it('is deterministic, idempotent and preserves other stablecoins', () => {
    const otherBefore = db.prepare("SELECT * FROM stablecoin_meta WHERE slug = 'usdt'").get();

    db.exec(migration);
    const usdcAfterFirst = db.prepare("SELECT * FROM stablecoin_meta WHERE slug = 'usdc'").get();
    db.exec(migration);

    expect(db.prepare("SELECT * FROM stablecoin_meta WHERE slug = 'usdc'").get())
      .toEqual(usdcAfterFirst);
    expect(db.prepare("SELECT * FROM stablecoin_meta WHERE slug = 'usdt'").get())
      .toEqual(otherBefore);
    expect(db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_usdc_profile_refresh'",
    ).get()).toBeUndefined();
  });
});

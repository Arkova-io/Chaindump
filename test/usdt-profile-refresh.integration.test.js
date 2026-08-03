import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const migration = readFileSync(
  new URL('../migrations/0069_usdt_profile_refresh.sql', import.meta.url),
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
  'assets.ctfassets.net',
  'cnad.gob.sv',
  'stablecoins.llama.fi',
  'tether.io',
  'tether.to',
  'www.esma.europa.eu',
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
    'usdt',
    'Tether',
    'USDT',
    JSON.stringify({
      backing: 'Approximately 182 billion dollars backed by reserves.',
      audits: 'Quarterly attestations but never a full audit.',
      regulatory: 'Avoided EU regulation and did not seek MiCA authorization.',
      comparison: 'Wins on liquidity and loses on transparency.',
    }),
    JSON.stringify(['https://en.wikipedia.org/wiki/Tether_(cryptocurrency)']),
    '2026-07-08 19:13:50',
  );
  db.prepare(`
    INSERT INTO stablecoin_meta (slug, name, symbol, profile, sources, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'usdc',
    'USD Coin',
    'USDC',
    JSON.stringify({ notes: 'Preserve this row.' }),
    JSON.stringify(['https://circle.com/']),
    '2026-07-08 19:14:07',
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

describe('USDT gold-standard profile refresh migration', () => {
  it('replaces robotic comparative copy with canonical profile source data', () => {
    db.exec(migration);
    const row = db.prepare("SELECT * FROM stablecoin_meta WHERE slug = 'usdt'").get();
    const profile = JSON.parse(row.profile);
    const canonical = profile.canonical_profile;

    expect(row).toMatchObject({
      name: 'Tether',
      symbol: 'USDT',
      updated_at: '2026-08-03',
    });
    expect(Object.keys(canonical.sections)).toEqual(CANONICAL_SECTIONS);
    expect(canonical).toMatchObject({
      schema: 'chaindump-entity-profile-source',
      version: 1,
      status: { operating_state: 'operating', as_of: '2026-08-03' },
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
      type: 'Fiat-denominated US-dollar stablecoin with issuer-administered issuance, redemption and token controls.',
      current_observation: {
        observed_at: '2026-08-03T16:33:11Z',
        circulating_supply_usd: 183140660283.77628,
        price_usd: 0.9987561821369779,
        previous_week_circulating_supply_usd: 183867073283.62018,
        seven_day_supply_change_pct: -0.3950750870567177,
        reported_chain_count: 130,
      },
      reserve_observation: {
        period_end: '2026-06-30',
        report_date: '2026-07-31',
        total_assets_usd: 187751426411,
        total_liabilities_usd: 183641897215,
        digital_token_liabilities_usd: 183622105630,
        equity_usd: 4109529196,
      },
    });
    expect(profile.protocol_observation.issuer_supported_page).toHaveLength(14);
    expect(profile.protocol_observation.assurance_report_note).toHaveLength(13);
    expect(profile.protocol_observation.caveat).toContain('BNB Smart Chain');

    const evergreenCopy = [
      profile.backing,
      profile.daily_activity,
      profile.audits,
      profile.transparency,
      profile.outlook,
    ].join(' ');
    expect(evergreenCopy).not.toMatch(/\$182B|~\$|183,?140,?660,?283|0\.998756/);
    expect(JSON.stringify(profile)).not.toMatch(/wins on|category leader|most trusted|evidence_reviewed/i);
  });

  it('keeps assurance, redemption, chain and regulatory claims within source scope', () => {
    db.exec(migration);
    const profile = JSON.parse(db.prepare(
      "SELECT profile FROM stablecoin_meta WHERE slug = 'usdt'",
    ).get().profile);
    const canonical = profile.canonical_profile;
    const copy = JSON.stringify(profile);

    expect(profile.audits).toContain('is not an audit or review of historical financial information');
    expect(profile.audits).toContain('do not establish completion');
    expect(profile.regulatory).toContain('No Tether or USDT issuer row was found');
    expect(profile.regulatory).toContain('do not support a blanket statement');
    expect(canonical.sections.operating_model).toContain('Eligible KYC-verified customers');
    expect(canonical.sections.operating_model).toContain('minimum is 100,000 US dollars');
    expect(canonical.sections.risks_and_unknowns).toContain(
      'covers all fiat-denominated Tether tokens rather than USDT alone',
    );
    expect(profile.current_observation.chain_count_caveat).toContain(
      'not necessarily issued or redeemable by Tether',
    );
    expect(copy).not.toMatch(/is a completed financial-statement audit|is universally redeemable|is MiCA authorized|is banned across the EEA/i);
  });

  it('uses canonical source enums and resolves every claim, section, metric and event reference', () => {
    db.exec(migration);
    const row = db.prepare(
      "SELECT profile, sources FROM stablecoin_meta WHERE slug = 'usdt'",
    ).get();
    const profile = JSON.parse(row.profile);
    const sources = JSON.parse(row.sources);
    const sourceIds = new Set(sources.map(({ id }) => id));
    const canonical = profile.canonical_profile;
    const claimIds = new Set(canonical.claims.map(({ id }) => id));

    expect(profile.sources).toEqual(sources);
    expect(sources).toHaveLength(11);
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
      expect(source.role).toBe(source.source_role);
      expect(source.accessed_at).toBeTruthy();
      const host = new URL(source.url).hostname;
      expect(ALLOWED_SOURCE_HOSTS.has(host), source.url).toBe(true);
      const expectedRole = host === 'stablecoins.llama.fi'
        ? 'aggregator'
        : host === 'assets.ctfassets.net'
          ? 'independent'
          : 'primary';
      expect(source.source_role).toBe(expectedRole);
      if (source.evidence_scope === 'current_state') {
        expect(source.stale_after).toMatch(/^2026-(08-10|10-31)$/);
      }
      expect(source.url).not.toMatch(/chaindump\.xyz|wikipedia\.org/);
    }

    expect(canonical.claims).toHaveLength(24);
    for (const claim of canonical.claims) {
      expect(claim.source_ids.length, claim.id).toBeGreaterThan(0);
      for (const sourceId of claim.source_ids) {
        expect(sourceIds.has(sourceId), `${claim.id} unresolved source ${sourceId}`).toBe(true);
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
    const row = db.prepare("SELECT * FROM stablecoin_meta WHERE slug = 'usdt'").get();
    vi.resetModules();
    const worker = (await import('../src/worker.js')).default;
    const response = await worker.fetch(
      new Request('http://localhost/api/profile/stablecoin/usdt'),
      { DB: d1ForRow(row) },
      { waitUntil() {}, passThroughOnException() {} },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      schema: 'chaindump-entity-profile',
      version: 1,
      identity: { id: 'stablecoin:usdt', type: 'stablecoin', slug: 'usdt', name: 'Tether' },
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
    expect(body.sources).toHaveLength(11);
    expect(body.sources.every(({ role }) => role !== 'unknown')).toBe(true);
    expect(body.sources.every(({ access_state: state }) => state === 'reachable')).toBe(true);
    expect(body.claims).toHaveLength(24);
    expect(body.claims.every(({ review }) => review.state === 'pending')).toBe(true);
    expect(body.metrics.map(({ dimension }) => dimension)).toEqual([
      'circulating_supply',
      'price',
      'peg_deviation',
      'reserve_assets',
      'reserve_coverage',
    ]);
    expect(body.metrics.every(({ value }) => Number.isFinite(value))).toBe(true);
    expect(body.metrics.at(-1)).toMatchObject({
      scope: { product: 'fiat-denominated Tether tokens' },
      quality_flags: ['issuer-wide-not-usdt-only', 'point-in-time-assurance'],
    });
    expect(body.events).toHaveLength(5);
    expect(Array.isArray(body.extensions.structured_analysis.strategic_choices)).toBe(true);
    expect(body.extensions.category_data).not.toHaveProperty('canonical_profile');
  });

  it('withholds a non-prose canonical section instead of serializing it into copy', async () => {
    db.exec(migration);
    const row = db.prepare("SELECT * FROM stablecoin_meta WHERE slug = 'usdt'").get();
    const profile = JSON.parse(row.profile);
    profile.canonical_profile.sections.strategic_choices =
      profile.canonical_profile.extensions.structured_analysis.strategic_choices;
    row.profile = JSON.stringify(profile);

    vi.resetModules();
    const worker = (await import('../src/worker.js')).default;
    const response = await worker.fetch(
      new Request('http://localhost/api/profile/stablecoin/usdt'),
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
    expect(JSON.stringify(body.analysis)).not.toMatch(/decision|consequence|claim:usdt:strategy/);
  });

  it('is idempotent and preserves every non-USDT row', () => {
    db.exec(migration);
    const first = db.prepare("SELECT * FROM stablecoin_meta WHERE slug = 'usdt'").get();
    db.exec(migration);
    const second = db.prepare("SELECT * FROM stablecoin_meta WHERE slug = 'usdt'").get();
    const usdc = db.prepare("SELECT * FROM stablecoin_meta WHERE slug = 'usdc'").get();

    expect(second).toEqual(first);
    expect(usdc).toMatchObject({
      name: 'USD Coin',
      symbol: 'USDC',
      updated_at: '2026-07-08 19:14:07',
    });
    expect(JSON.parse(usdc.profile)).toEqual({ notes: 'Preserve this row.' });
  });
});

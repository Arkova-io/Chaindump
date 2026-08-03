import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const migration = readFileSync(
  new URL('../migrations/0071_rwa_control_profiles.sql', import.meta.url),
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

const TARGETS = ['blackrock-buidl', 'ondo-finance'];
const ALLOWED_SOURCE_HOSTS = new Set([
  'app.rwa.xyz',
  'docs.ondo.finance',
  'ondo.finance',
  'securitize.io',
  'www.sec.gov',
]);

function openDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE rwa_depin (
      slug TEXT PRIMARY KEY,
      name TEXT,
      category TEXT,
      status TEXT,
      profile TEXT,
      sources TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  const insert = db.prepare(`
    INSERT INTO rwa_depin (slug, name, category, status, profile, sources, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run(
    'blackrock-buidl',
    'BlackRock BUIDL',
    'rwa-treasuries',
    'thriving',
    JSON.stringify({
      what_it_does: 'Largest tokenized money-market fund in the world.',
      market_metric: 'About three billion dollars in AUM.',
      outlook: 'Bull, base and bear price narrative.',
    }),
    JSON.stringify([{ title: 'Unsourced article', url: 'https://example.com/buidl' }]),
    '2026-07-08 15:48:07',
  );
  insert.run(
    'ondo-finance',
    'Ondo Finance',
    'rwa-treasuries',
    'thriving',
    JSON.stringify({
      what_it_does: 'Permissionless yield token and tokenization platform.',
      market_metric: 'Platform TVL and OUSG AUM combined.',
      business_model: 'ONDO captures OUSG fees.',
    }),
    JSON.stringify([{ title: 'Secondary profile', url: 'https://example.com/ondo' }]),
    '2026-07-08 15:47:36',
  );
  insert.run(
    'helium',
    'Helium',
    'depin-wireless',
    'operating',
    JSON.stringify({ what_it_does: 'Preserve this row.' }),
    JSON.stringify([{ title: 'Helium', url: 'https://helium.com/' }]),
    '2026-07-08 15:47:51',
  );
  return db;
}

function d1ForRow(row) {
  return {
    prepare(sql) {
      return {
        bind() { return this; },
        async all() {
          if (sql.includes('FROM rwa_depin')) return { results: [row] };
          return { results: [] };
        },
      };
    },
  };
}

function rowFor(slug) {
  return db.prepare('SELECT * FROM rwa_depin WHERE slug = ?').get(slug);
}

let db;

beforeEach(() => {
  db = openDatabase();
});

afterEach(() => {
  db.close();
});

describe('BUIDL and OUSG canonical RWA control profiles', () => {
  it('replaces stale robot copy with complete product-scoped profiles', () => {
    db.exec(migration);

    for (const slug of TARGETS) {
      const row = rowFor(slug);
      const profile = JSON.parse(row.profile);
      const canonical = profile.canonical_profile;

      expect(row).toMatchObject({
        category: 'rwa-treasuries',
        status: 'operating',
        updated_at: '2026-08-03',
      });
      expect(canonical).toMatchObject({
        schema: 'chaindump-entity-profile-source',
        version: 1,
        status: { operating_state: 'operating', as_of: '2026-08-03' },
        outcome: { label: null, as_of: null, rule_id: null, confidence: null },
        freshness: {
          state: 'current',
          last_reviewed_at: '2026-08-03',
          next_review_at: '2026-08-10',
        },
        confidence: 'medium',
      });
      expect(Object.keys(canonical.sections)).toEqual(CANONICAL_SECTIONS);
      for (const [section, value] of Object.entries(canonical.sections)) {
        expect(typeof value, `${slug}:${section}`).toBe('string');
        expect(value.trim().length, `${slug}:${section}`).toBeGreaterThan(80);
        expect(canonical.section_dates[section], `${slug}:${section}`).toBe('2026-08-03');
        expect(canonical.section_claim_ids[section].length, `${slug}:${section}`)
          .toBeGreaterThan(0);
      }

      const copy = JSON.stringify(profile);
      expect(copy).not.toMatch(/Bull, base|largest tokenized money-market fund in the world|price narrative/i);
      expect(canonical.extensions.methodology_notes[0]).toContain(
        'records evidence assembly and source verification, not human approval',
      );
    }

    const buidl = JSON.parse(rowFor('blackrock-buidl').profile);
    expect(buidl.legal_structure).toMatchObject({
      issuer: 'BlackRock USD Institutional Digital Liquidity Fund Ltd.',
      offering: 'Rule 506(c) private placement',
      investment_company_act: 'Section 3(c)(7) exclusion',
    });
    expect(buidl.canonical_profile.sections.what_it_is).toContain(
      'tokenization does not make the fund interest permissionless',
    );
    expect(buidl.canonical_profile.sections.operating_model).toContain(
      'peer transfers are limited to approved participants',
    );

    const ousg = JSON.parse(rowFor('ondo-finance').profile);
    expect(ousg.scope).toContain('not the whole Ondo platform');
    expect(ousg.canonical_profile.sections.what_it_is).toContain(
      'not a permissionless Treasury token',
    );
    expect(ousg.canonical_profile.sections.token_and_value_capture).toContain(
      'no reviewed evidence supports direct value accrual from OUSG to the separate ONDO token',
    );
  });

  it('keeps product AUM, platform TVL, yield and network representations in explicit scopes', () => {
    db.exec(migration);
    const buidl = JSON.parse(rowFor('blackrock-buidl').profile);
    const ousg = JSON.parse(rowFor('ondo-finance').profile);

    expect(buidl.current_observation).toMatchObject({
      product_total_asset_value_usd: 2673461059.240449,
      net_asset_value_usd: 1,
      holder_addresses: 113,
      observed_seven_day_apy_pct: 1.4705439273203145,
      native_token_rows: 10,
      bridge_token_rows: 0,
    });
    expect(buidl.data_scope_notes.join(' ')).toMatch(/separate from Securitize platform AUM/i);
    expect(buidl.data_scope_notes.join(' ')).toMatch(/not a promised return/i);
    expect(buidl.canonical_profile.sections.risks_and_unknowns).toContain(
      'may not maintain one dollar',
    );

    expect(ousg.current_observation.official_product).toMatchObject({
      reported_value_usd: 378352807.35,
      net_asset_value_usd: 116.075451,
      observed_apy_pct: 3.43,
      reported_chain_scope: ['Ethereum', 'XRP Ledger'],
    });
    expect(ousg.current_observation.aggregator_onchain).toMatchObject({
      total_asset_value_usd: 450853994.96748495,
      holder_addresses: 60,
      network_names: ['Ethereum', 'Polygon', 'Solana', 'XRP Ledger'],
    });
    expect(ousg.data_scope_notes[0]).toContain('separate, non-additive observations');
    expect(ousg.data_scope_notes[1]).toBe('OUSG product value is not Ondo platform TVL.');
    expect(ousg.economics).toMatchObject({
      management_fee_pct: 0.15,
      management_fee_waived_until: '2027-01-01',
      fund_expense_cap_pct: 0.15,
    });

    const ousgMetrics = ousg.canonical_profile.metrics;
    expect(ousgMetrics.map(({ dimension }) => dimension)).toEqual([
      'aum',
      'outstanding_value',
      'yield',
      'holders',
    ]);
    expect(ousgMetrics[0].scope.excludes).toBe('Ondo platform TVL');
    expect(ousgMetrics[1].quality_flags).toContain('non-additive-with-official-aum');
    expect(ousgMetrics[2].quality_flags).toContain('observed-not-promised');
  });

  it('uses canonical enums and resolves every source, section, metric and event reference', () => {
    db.exec(migration);

    for (const slug of TARGETS) {
      const row = rowFor(slug);
      const profile = JSON.parse(row.profile);
      const sources = JSON.parse(row.sources);
      const canonical = profile.canonical_profile;
      const sourceIds = new Set(sources.map(({ id }) => id));
      const claimIds = new Set(canonical.claims.map(({ id }) => id));

      expect(profile.sources).toEqual(sources);
      expect(sources.length).toBeGreaterThanOrEqual(7);
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
        expect(ALLOWED_SOURCE_HOSTS.has(new URL(source.url).hostname), source.url).toBe(true);
        expect(Date.parse(source.accessed_at)).toBeLessThanOrEqual(Date.parse('2026-08-03T23:59:59Z'));
        expect(Date.parse(source.source_date)).toBeLessThanOrEqual(Date.parse('2026-08-03T23:59:59Z'));
        if (source.evidence_scope === 'current_state') {
          expect(source.stale_after).toBe('2026-08-10');
        }
        expect(source.url).not.toMatch(/chaindump\.xyz|wikipedia\.org|example\.com/);
      }

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
        expect(Number.isFinite(record.value) || record.value === undefined, record.id).toBe(true);
        for (const claimId of record.claim_ids) expect(claimIds.has(claimId), claimId).toBe(true);
      }
    }
  });

  it('feeds canonical RWA endpoints without flattening evidence records into prose', async () => {
    db.exec(migration);

    for (const slug of TARGETS) {
      vi.resetModules();
      const worker = (await import('../src/worker.js')).default;
      const row = rowFor(slug);
      const response = await worker.fetch(
        new Request(`http://localhost/api/profile/rwa/${slug}`),
        { DB: d1ForRow(row) },
        { waitUntil() {}, passThroughOnException() {} },
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        schema: 'chaindump-entity-profile',
        version: 1,
        identity: { id: `rwa:${slug}`, type: 'rwa', slug },
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
        expect(value.as_of, section).toBe('2026-08-03');
        expect(value.claim_ids.length, section).toBeGreaterThan(0);
        expect(value.body, section).not.toMatch(/source_role|source_ids|evidence_locator|https?:\/\/|\{.*\}/i);
      }
      expect(body.metrics.length).toBeGreaterThanOrEqual(3);
      expect(body.events.length).toBeGreaterThanOrEqual(4);
      expect(body.claims.every(({ review }) => review.state === 'pending')).toBe(true);
      expect(body.sources.every(({ access_state: state }) => state === 'reachable')).toBe(true);
      expect(body.extensions.category_data).not.toHaveProperty('canonical_profile');
      expect(Array.isArray(body.extensions.structured_analysis.strategic_choices)).toBe(true);
    }
  });

  it('is deterministic, idempotent and does not touch non-target rows', () => {
    const before = rowFor('helium');
    db.exec(migration);
    const first = TARGETS.map((slug) => rowFor(slug));
    db.exec(migration);
    const second = TARGETS.map((slug) => rowFor(slug));

    expect(second).toEqual(first);
    expect(rowFor('helium')).toEqual(before);
  });
});

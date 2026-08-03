import { Buffer } from 'node:buffer';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { unstable_splitSqlQuery } from 'wrangler';
import {
  ANALYSIS_SECTION_KEYS,
  embeddedCanonicalEntityProfile,
  validateEntityProfile,
} from '../src/lib/entity-profile.js';
import {
  document,
  profiles,
  renderMigration,
} from '../scripts/render-stablecoin-depth-wave-b-0099.mjs';

const artifact = JSON.parse(readFileSync(
  new URL('../docs/stablecoin-depth-wave-b-2026-08-03.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0099_stablecoin_depth_wave_b.sql', import.meta.url),
  'utf8',
);
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const TARGETS = Object.freeze(['usd1', 'usyc', 'usdg', 'buidl', 'usdy']);
const INTERNAL_COPY = /\[object Object\]|"source_ids"|"evidence_locator"|publication_state|trend_id|claim_ids|field_path|canonical_profile|quality_flags|review_state/;

function applyMigrations(database, through = Infinity) {
  const files = readdirSync(new URL('../migrations/', import.meta.url))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .filter((file) => Number(file.slice(0, 4)) <= through)
    .sort();
  for (const file of files) database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
}

function row(database, slug) {
  return database.prepare('SELECT * FROM stablecoin_meta WHERE slug = ?').get(slug);
}

function profile(database, slug) {
  return embeddedCanonicalEntityProfile(row(database, slug)?.profile, { type: 'stablecoin', slug });
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
          if (sql.includes('snapshot_cache')) return { data: '{"chains":[]}', updated_at: Date.now() };
          return database.prepare(sql).get(...this.bindings) ?? null;
        },
      };
    },
  };
}

function profileRenderer() {
  const start = html.indexOf('const PROFILE_SECTION_ORDER');
  const end = html.indexOf('\nfunction synthesisHtml', start);
  if (start < 0 || end < 0) throw new Error('canonical profile renderer not found');
  const context = {
    Date, Intl, URL,
    state: { profileCache: {}, profileRequest: 0 },
    document: { getElementById: () => null },
    history: { pushState() {}, replaceState() {} },
    location: { pathname: '/' },
    fetch: async () => { throw new Error('not used in renderer test'); },
    switchView() {},
    fmtUsd: (value) => `$${Number(value).toLocaleString('en-US')}`,
    esc: (value) => String(value ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#39;'),
    safeUrl: (value) => /^https:\/\//.test(String(value || '')) ? String(value) : '#',
    normalizedText: (value) => typeof value === 'string' ? value.trim() : '',
    normalizedLabel: (key) => String(key).replaceAll('_', ' '),
    verdictClass: () => 'mixed',
  };
  vm.runInNewContext(html.slice(start, end), context);
  return context.canonicalProfileHtml;
}

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });
const ASSETS = { fetch: async () => new Response('<html><head><title>Chaindump</title></head><body></body></html>') };
let apiDatabase;
let worker;

beforeAll(async () => {
  apiDatabase = new DatabaseSync(':memory:');
  applyMigrations(apiDatabase);
  vi.resetModules();
  worker = (await import('../src/worker.js')).default;
}, 60_000);

afterAll(() => {
  apiDatabase?.close();
  vi.unstubAllGlobals();
});

describe('stablecoin depth wave B migration 0099', () => {
  it('keeps the artifact and D1-safe migration deterministic', () => {
    expect(artifact).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document).toMatchObject({
      schema: 'chaindump-stablecoin-depth-wave-b-v1',
      research_as_of: '2026-08-03',
      generated_at: '2026-08-03T21:48:00Z',
      generated_migration: '0099_stablecoin_depth_wave_b.sql',
    });
    expect(document.entities.map(({ slug }) => slug)).toEqual(TARGETS);
    expect(migration).not.toMatch(/\bCREATE\s+TEMP(?:ORARY)?\s+TABLE\b/i);
    expect(Math.max(...unstable_splitSqlQuery(migration).map((statement) => Buffer.byteLength(statement, 'utf8'))))
      .toBeLessThanOrEqual(95_000);
  });

  it('ships the exact normalized ten-section contract with pending dated claims', () => {
    for (const slug of TARGETS) {
      const value = profiles[slug];
      expect(validateEntityProfile(value), slug).toEqual([]);
      expect(value.identity).toMatchObject({ id: `stablecoin:${slug}`, type: 'stablecoin', slug });
      expect(Object.keys(value.analysis.sections), slug).toEqual(ANALYSIS_SECTION_KEYS);
      expect(value.quality).toMatchObject({ publication_state: 'review', completeness_pct: 100 });
      expect(value.freshness).toMatchObject({
        state: 'current',
        last_reviewed_at: '2026-08-03T21:48:00Z',
        next_review_at: '2026-08-10T21:48:00Z',
      });

      const sourceIds = new Set(value.sources.map(({ id }) => id));
      expect(value.sources.some(({ role }) => role === 'primary'), slug).toBe(true);
      expect(value.sources.some(({ role }) => role === 'independent'), slug).toBe(true);
      expect(value.sources.some(({ role }) => role === 'aggregator'), slug).toBe(true);
      for (const [key, section] of Object.entries(value.analysis.sections)) {
        expect(section.body.length, `${slug}:${key}`).toBeGreaterThanOrEqual(300);
        expect(section.body.length, `${slug}:${key}`).toBeLessThanOrEqual(1000);
        expect(section.body, `${slug}:${key}`).not.toMatch(INTERNAL_COPY);
        expect(section.body, `${slug}:${key}`).not.toMatch(/https?:\/\/|T\d{2}:\d{2}:\d{2}/);
        expect(section.claim_ids.length, `${slug}:${key}`).toBe(2);
        for (const id of section.claim_ids) {
          const claim = value.claims.find((candidate) => candidate.id === id);
          expect(claim?.assertion.length, id).toBeGreaterThan(20);
          expect(claim?.source_ids.length, id).toBeGreaterThan(0);
          expect(claim?.source_ids.every((sourceId) => sourceIds.has(sourceId)), id).toBe(true);
          expect(claim?.review, id).toEqual({ state: 'pending', reviewer: null, reviewed_at: null });
        }
      }
      const expectedDimensions = ['usd1', 'usdg'].includes(slug)
        ? ['circulating_supply', 'price', 'peg_deviation']
        : ['tokenized_asset_value', 'price', 'price_premium_to_initial_unit'];
      expect(value.metrics.map(({ dimension }) => dimension)).toEqual(expectedDimensions);
      expect(value.claims.every(({ review }) => review.state === 'pending'), slug).toBe(true);
    }
  });

  it('states the strategic cause, redemption boundary and lifecycle honestly', () => {
    expect(profiles.usd1.analysis.sections.why_this_outcome.body)
      .toMatch(/cold-start problem|headline supply overstates diversified adoption/i);
    expect(profiles.usd1.extensions.editorial_guardrail).toMatch(/without alleging a quid pro quo/i);

    expect(profiles.usyc.analysis.sections.what_it_is.body)
      .toMatch(/not a one-dollar stablecoin|Cayman Islands mutual fund/i);
    expect(profiles.usyc.extensions.dataset_classification)
      .toBe('tokenized_mutual_fund_share_not_payment_stablecoin');

    expect(profiles.usdg.analysis.sections.why_this_outcome.body)
      .toMatch(/paid those distributors|reward-seeking inventory/i);
    expect(profiles.usdg.extensions.editorial_guardrail).toMatch(/partner rewards universal token yield/i);

    expect(profiles.buidl.analysis.sections.what_it_is.body)
      .toMatch(/private fund security|not a retail stablecoin/i);
    expect(profiles.buidl.extensions.dataset_classification)
      .toBe('private_fund_security_not_payment_stablecoin');

    expect(profiles.usdy.analysis.sections.lifecycle.body)
      .toMatch(/December 2025 move|second lifecycle/i);
    expect(profiles.usdy.extensions.editorial_guardrail).toMatch(/\$1\.14 accumulating USDY price a depeg/i);
  });

  it('records source access and causal independence honestly', () => {
    for (const [slug, value] of Object.entries(profiles)) {
      expect(new Set(value.sources.map(({ url }) => url)).size, slug).toBe(value.sources.length);
      for (const source of value.sources) {
        expect(source.url, source.id).toMatch(/^https:\/\//);
        expect(source.checked_at, source.id).toBe('2026-08-03T21:48:00Z');
        if ([403, 404].includes(source.direct_http_status)) {
          expect(source.access_method, source.id).toBe('indexed_browser_snapshot');
        } else {
          expect(source.direct_http_status, source.id).toBe(200);
        }
      }
      const whySourceIds = new Set(value.analysis.sections.why_this_outcome.claim_ids.flatMap((claimId) => (
        value.claims.find(({ id }) => id === claimId)?.source_ids || []
      )));
      const groups = new Set(value.sources
        .filter(({ id }) => whySourceIds.has(id))
        .map(({ independence_group }) => independence_group));
      expect(groups.size, `${slug}:why source independence`).toBeGreaterThanOrEqual(2);
    }
  });

  it('changes only five stablecoins, preserves legacy data and replays idempotently', () => {
    const database = new DatabaseSync(':memory:');
    applyMigrations(database, 98);
    const countBefore = database.prepare('SELECT COUNT(*) AS count FROM stablecoin_meta').get().count;
    const before = new Map(database.prepare(
      'SELECT slug, name, symbol, profile, sources, updated_at FROM stablecoin_meta ORDER BY slug',
    ).all().map((item) => [item.slug, item]));

    database.exec(migration);
    expect(database.prepare('SELECT COUNT(*) AS count FROM stablecoin_meta').get().count).toBe(countBefore);
    const changed = [];
    for (const item of database.prepare(
      'SELECT slug, name, symbol, profile, sources, updated_at FROM stablecoin_meta ORDER BY slug',
    ).all()) {
      const prior = before.get(item.slug);
      if (item.profile !== prior.profile || item.updated_at !== prior.updated_at) changed.push(item.slug);
      if (!profiles[item.slug]) {
        expect(item, item.slug).toEqual(prior);
        continue;
      }
      expect(item.name, `${item.slug}:name`).toBe(prior.name);
      expect(item.symbol, `${item.slug}:symbol`).toBe(prior.symbol);
      expect(item.sources, `${item.slug}:sources`).toBe(prior.sources);
      const oldLegacy = JSON.parse(prior.profile);
      const newLegacy = JSON.parse(item.profile);
      delete oldLegacy.canonical_profile;
      delete newLegacy.canonical_profile;
      expect(newLegacy, `${item.slug}:legacy profile`).toEqual(oldLegacy);
      expect(profile(database, item.slug), item.slug).toEqual(profiles[item.slug]);
    }
    expect(changed).toEqual([...TARGETS].sort());
    const once = database.prepare('SELECT * FROM stablecoin_meta ORDER BY slug').all();
    database.exec(migration);
    expect(database.prepare('SELECT * FROM stablecoin_meta ORDER BY slug').all()).toEqual(once);
    expect(database.prepare(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = '_stablecoin_depth_wave_b_0099'`).get().count).toBe(0);
    database.close();
  });

  it('serves each profile through the API and customer profile route', async () => {
    for (const slug of TARGETS) {
      const api = await worker.fetch(
        new Request(`http://localhost/api/profile/stablecoin/${slug}`),
        { DB: d1(apiDatabase), ASSETS },
        ctx(),
      );
      expect(api.status, slug).toBe(200);
      expect(await api.json(), slug).toEqual(profiles[slug]);

      const page = await worker.fetch(
        new Request(`http://localhost/profile/stablecoin/${slug}`, { headers: { accept: 'text/markdown' } }),
        { DB: d1(apiDatabase), ASSETS },
        ctx(),
      );
      expect(page.status, slug).toBe(200);
      expect(await page.text(), slug).toContain(`# ${profiles[slug].identity.name} — Chaindump`);
    }
  });

  it('renders every report through the shared human-facing template without schema leakage', () => {
    const render = profileRenderer();
    const labels = [
      'What it is', 'What happened', 'Why this outcome', 'Strategic choices',
      'Operating model', 'Token and value capture', 'What could have been different',
      'Risks and unknowns', 'Lifecycle', 'Outlook and what to watch', 'Evidence and sources',
    ];
    for (const [slug, value] of Object.entries(profiles)) {
      const output = render(value);
      for (const label of labels) expect(output, `${slug}:${label}`).toContain(label);
      expect(output, slug).toContain(value.analysis.sections.why_this_outcome.body);
      expect(output, slug).not.toMatch(/source_ids|evidence_locator|validation_errors|structured_analysis|chaindump-entity-profile|\[object Object\]/);
    }
  });
});

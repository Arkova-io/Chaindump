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
  renderMigration,
} from '../scripts/render-casino-wave-a-migration.mjs';

const artifact = JSON.parse(readFileSync(
  new URL('../docs/casino-wave-a-profiles-2026-08-03.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0087_casino_wave_a_profiles.sql', import.meta.url),
  'utf8',
);
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const expected = {
  'decentral-games-poker-arcade': {
    state: 'operator_documented_operating', outcome: 'operating_unclassified', minSources: 8,
  },
  overtime: {
    state: 'operating', outcome: 'operating_established', minSources: 8,
  },
  'sx-bet': {
    state: 'operating', outcome: 'operating_token_transition', minSources: 8,
  },
  azuro: {
    state: 'operating', outcome: 'operating_unclassified', minSources: 9,
  },
  'purebet-solana-exchange': {
    state: 'hibernating', outcome: 'failed_paused', minSources: 6,
  },
};

const INTERNAL_COPY = /\[object Object\]|"source_ids"|"evidence_locator"|publication_state|trend_id|claim_ids|field_path|forensic_analysis|canonical_profile|quality_flags|review_state/;

function applyMigrations(database, through = Infinity) {
  const files = readdirSync(new URL('../migrations/', import.meta.url))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .filter((file) => Number(file.slice(0, 4)) <= through)
    .sort();
  for (const file of files) {
    database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
}

function row(database, slug) {
  return database.prepare('SELECT * FROM casino_syntheses WHERE case_id = ?').get(slug);
}

function profile(database, slug) {
  return embeddedCanonicalEntityProfile(row(database, slug)?.outlook, {
    type: 'web3_casino',
    slug,
  });
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
const ASSETS = {
  fetch: async () => new Response('<html><head><title>Chaindump</title></head><body></body></html>'),
};
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

describe('Web3 casino canonical profile wave A', () => {
  it('keeps the source artifact and D1-safe migration deterministic', () => {
    expect(artifact).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document).toMatchObject({
      schema: 'chaindump-casino-wave-a-v1',
      research_as_of: '2026-08-03',
      generated_migration: '0087_casino_wave_a_profiles.sql',
    });
    expect(document.cases.map(({ slug }) => slug)).toEqual(Object.keys(expected));
    expect(migration).not.toMatch(/\bCREATE\s+TEMP(?:ORARY)?\s+TABLE\b/i);
    expect(Math.max(...unstable_splitSqlQuery(migration).map((statement) => (
      Buffer.byteLength(statement, 'utf8')
    )))).toBeLessThanOrEqual(95_000);
  });

  it('ships the same ten plain-English sections with atomic, pending claims', () => {
    for (const entry of document.cases) {
      const value = entry.canonical_profile;
      const contract = expected[entry.slug];
      expect(validateEntityProfile(value), entry.slug).toEqual([]);
      expect(value.identity).toMatchObject({
        id: `web3_casino:${entry.slug}`,
        type: 'web3_casino',
        slug: entry.slug,
      });
      expect(value.status.operating_state).toBe(contract.state);
      expect(value.outcome.label).toBe(contract.outcome);
      expect(Object.keys(value.analysis.sections)).toEqual(ANALYSIS_SECTION_KEYS);
      expect(value.sources.length).toBeGreaterThanOrEqual(contract.minSources);
      expect(value.sources.some(({ role }) => role === 'primary'), entry.slug).toBe(true);
      expect(value.sources.some(({ role }) => ['independent', 'aggregator'].includes(role)), entry.slug)
        .toBe(true);
      expect(new Set(value.sources.map(({ url }) => url)).size, entry.slug)
        .toBe(value.sources.length);
      expect(value.quality).toMatchObject({
        publication_state: 'review',
        completeness_pct: 100,
      });

      const sourceIds = new Set(value.sources.map(({ id }) => id));
      for (const source of value.sources) {
        expect(source, source.id).toMatchObject({
          url: expect.stringMatching(/^https:\/\//),
          accessed_at: expect.stringMatching(/^2026-08-03T/),
          checked_at: expect.stringMatching(/^2026-08-03T/),
          access_state: 'reachable',
        });
      }
      for (const [key, section] of Object.entries(value.analysis.sections)) {
        expect(section.body.trim(), `${entry.slug}.${key}`).not.toBe('');
        expect(section.body, `${entry.slug}.${key}`).not.toMatch(INTERNAL_COPY);
        expect(section.claim_ids.length, `${entry.slug}.${key}`).toBeGreaterThanOrEqual(2);
        expect(section.claim_ids.length, `${entry.slug}.${key}`).toBeLessThanOrEqual(4);
        for (const id of section.claim_ids) {
          const claim = value.claims.find((candidate) => candidate.id === id);
          expect(claim?.field_path, id).toBe(`analysis.sections.${key}.body`);
          expect(claim?.assertion.length, id).toBeLessThanOrEqual(240);
        }
      }
      for (const claim of value.claims) {
        expect(claim.review, claim.id).toEqual({
          state: 'pending', reviewer: null, reviewed_at: null,
        });
        expect(claim.source_ids.length, claim.id).toBeGreaterThan(0);
        expect(claim.source_ids.every((id) => sourceIds.has(id)), claim.id).toBe(true);
      }
      expect(value.claims.some(({ kind }) => kind === 'fact'), entry.slug).toBe(true);
      expect(value.claims.some(({ kind }) => kind === 'inference'), entry.slug).toBe(true);
      expect(value.claims.some(({ kind }) => kind === 'unknown'), entry.slug).toBe(true);
    }
  });

  it('keeps product, operator, chain, token, volume and solvency boundaries explicit', () => {
    const profiles = Object.fromEntries(document.cases.map(({ slug, canonical_profile: value }) => (
      [slug, value]
    )));

    expect(profiles['decentral-games-poker-arcade'].extensions.identity_boundary)
      .toMatch(/Poker Arcade.*not Bag\.win.*not every Decentral Games product/i);
    expect(profiles['decentral-games-poker-arcade'].analysis.sections.token_and_value_capture.body)
      .toMatch(/Tickets and Tournament Badges.*not transferable.*BAG.*separate/i);

    expect(profiles.overtime.analysis.sections.operating_model.body)
      .toMatch(/pool-versus-peer.*liquidity providers.*house side/i);
    expect(profiles.overtime.extensions.metric_boundary)
      .toMatch(/TVL.*not wagering volume.*not solvency/i);

    expect(profiles['sx-bet'].analysis.sections.lifecycle.body)
      .toMatch(/active product.*token sunset.*planned deprecation/i);
    expect(profiles['sx-bet'].analysis.sections.token_and_value_capture.body)
      .toMatch(/not USDC.*not cash.*not withdrawable.*no token redemption or buyback/i);

    expect(profiles.azuro.extensions.identity_boundary)
      .toMatch(/infrastructure.*not a consumer sportsbook.*applications.*separate/i);
    expect(profiles.azuro.extensions.metric_boundary)
      .toMatch(/pool liquidity.*not users.*not operator solvency/i);

    expect(profiles['purebet-solana-exchange'].analysis.sections.why_this_outcome.body)
      .toMatch(/cause is unknown.*liquidity.*demand.*regulation.*team.*competition/i);
    expect(profiles['purebet-solana-exchange'].extensions.identity_boundary)
      .toMatch(/official frontend.*not every historical Solana program/i);
  });

  it('preserves every legacy synthesis and replays idempotently', () => {
    const database = new DatabaseSync(':memory:');
    applyMigrations(database, 86);
    const before = new Map(document.cases.map(({ slug }) => [slug, row(database, slug)]));
    const unrelated = row(database, 'stake-dot-com');

    database.exec(migration);
    for (const entry of document.cases) {
      const prior = before.get(entry.slug);
      const current = row(database, entry.slug);
      for (const [key, value] of Object.entries(prior)) {
        if (key === 'outlook') continue;
        expect(current[key], `${entry.slug}:${key}`).toEqual(value);
      }
      const oldOutlook = JSON.parse(prior.outlook || '{}');
      const newOutlook = JSON.parse(current.outlook || '{}');
      delete oldOutlook.canonical_profile;
      delete newOutlook.canonical_profile;
      expect(newOutlook, `${entry.slug}:legacy outlook`).toEqual(oldOutlook);
      expect(profile(database, entry.slug), entry.slug).toEqual(entry.canonical_profile);
    }
    expect(row(database, 'stake-dot-com')).toEqual(unrelated);

    const once = document.cases.map(({ slug }) => row(database, slug));
    database.exec(migration);
    expect(document.cases.map(({ slug }) => row(database, slug))).toEqual(once);
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM sqlite_master
      WHERE type = 'table' AND name = '_casino_wave_a_profiles_0087'
    `).get().count).toBe(0);
    database.close();
  });

  it('serves each canonical profile through both the API and the customer page route', async () => {
    for (const entry of document.cases) {
      const response = await worker.fetch(
        new Request(`http://localhost/api/profile/web3_casino/${entry.slug}`),
        { DB: d1(apiDatabase), ASSETS },
        ctx(),
      );
      expect(response.status, entry.slug).toBe(200);
      expect(await response.json(), entry.slug).toEqual(entry.canonical_profile);

      const page = await worker.fetch(
        new Request(`http://localhost/profile/web3_casino/${entry.slug}`, {
          headers: { accept: 'text/markdown' },
        }),
        { DB: d1(apiDatabase), ASSETS },
        ctx(),
      );
      expect(page.status, entry.slug).toBe(200);
      expect(await page.text(), entry.slug).toContain(`# ${entry.canonical_profile.identity.name} — Chaindump`);
    }
  });

  it('renders every report in the shared customer UI without leaking research schema', () => {
    const render = profileRenderer();
    const labels = [
      'What it is', 'What happened', 'Why this outcome', 'Strategic choices',
      'Operating model', 'Token and value capture', 'What could have been different',
      'Risks and unknowns', 'Lifecycle', 'Outlook and what to watch',
      'Evidence and sources',
    ];
    for (const entry of document.cases) {
      const output = render(entry.canonical_profile);
      for (const label of labels) expect(output, `${entry.slug}:${label}`).toContain(label);
      expect(output, entry.slug).toContain(entry.canonical_profile.analysis.sections.why_this_outcome.body);
      expect(output, entry.slug).not.toMatch(
        /source_ids|evidence_locator|validation_errors|structured_analysis|chaindump-entity-profile|\[object Object\]/,
      );
    }
  });

  it('keeps every profile out of publication until a person reviews its claims', () => {
    for (const entry of document.cases) {
      const value = structuredClone(entry.canonical_profile);
      value.quality.publication_state = 'published';
      expect(validateEntityProfile(value, {
        forPublication: true,
        now: new Date('2026-08-03T20:00:00Z'),
      }).some(({ code }) => code === 'reviewed_support_required'), entry.slug).toBe(true);
    }
  });
});

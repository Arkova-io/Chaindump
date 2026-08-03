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
} from '../scripts/render-casino-wave-b-migration.mjs';

const artifact = JSON.parse(readFileSync(
  new URL('../docs/casino-wave-b-profiles-2026-08-03.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0090_casino_wave_b_profiles.sql', import.meta.url),
  'utf8',
);
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const expected = {
  'etheroll-dice-game': {
    state: 'customer_product_inactive', outcome: 'failed_product_artifacts_survive', minSources: 6,
  },
  'wagerr-consumer-sportsbook': {
    state: 'customer_product_inactive_protocol_unknown', outcome: 'failed_consumer_distribution_protocol_unresolved', minSources: 7,
  },
  'rollbit-dot-com': {
    state: 'operating', outcome: 'successful_established_unquantified', minSources: 8,
  },
  'bitcasino-dot-io': {
    state: 'operating', outcome: 'successful_established_unquantified', minSources: 8,
  },
  'augur-protocol-reboot': {
    state: 'active_rebuild_migration_result_unresolved', outcome: 'recovering_development_adoption_unproven', minSources: 9,
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

describe('Web3 casino canonical profile wave B', () => {
  it('keeps the evidence artifact and D1-safe migration deterministic', () => {
    expect(artifact).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document).toMatchObject({
      schema: 'chaindump-casino-wave-b-v1',
      research_as_of: '2026-08-03',
      generated_migration: '0090_casino_wave_b_profiles.sql',
    });
    expect(document.cases.map(({ slug }) => slug)).toEqual(Object.keys(expected));
    expect(migration).not.toMatch(/\bCREATE\s+TEMP(?:ORARY)?\s+TABLE\b/i);
    expect(Math.max(...unstable_splitSqlQuery(migration).map((statement) => (
      Buffer.byteLength(statement, 'utf8')
    )))).toBeLessThanOrEqual(95_000);
  });

  it('ships the same ten readable sections with atomic claims awaiting review', () => {
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
      expect(value.sources.some(({ role }) => ['independent', 'aggregator'].includes(role)), entry.slug).toBe(true);
      expect(new Set(value.sources.map(({ url }) => url)).size, entry.slug).toBe(value.sources.length);
      expect(value.quality).toMatchObject({ publication_state: 'review', completeness_pct: 100 });

      const sourceIds = new Set(value.sources.map(({ id }) => id));
      for (const source of value.sources) {
        expect(source, source.id).toMatchObject({
          url: expect.stringMatching(/^https:\/\//),
          accessed_at: expect.stringMatching(/^2026-08-03T/),
          checked_at: expect.stringMatching(/^2026-08-03T/),
        });
        expect(['reachable', 'archived'], source.id).toContain(source.access_state);
        if (source.access_state === 'archived') {
          expect(source.archive_url, source.id).toMatch(/^https:\/\/web\.archive\.org\/web\//);
        }
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
        expect(claim.review, claim.id).toEqual({ state: 'pending', reviewer: null, reviewed_at: null });
        expect(claim.source_ids.length, claim.id).toBeGreaterThan(0);
        expect(claim.source_ids.every((id) => sourceIds.has(id)), claim.id).toBe(true);
      }
      expect(value.claims.some(({ kind }) => kind === 'fact'), entry.slug).toBe(true);
      expect(value.claims.some(({ kind }) => kind === 'inference'), entry.slug).toBe(true);
      expect(value.claims.some(({ kind }) => kind === 'unknown'), entry.slug).toBe(true);
    }
  });

  it('keeps frontend, operator, protocol, custody, token and legal boundaries explicit', () => {
    const profiles = Object.fromEntries(document.cases.map(({ slug, canonical_profile: value }) => [slug, value]));

    expect(profiles['etheroll-dice-game'].extensions.identity_boundary)
      .toMatch(/customer dice game.*frontend.*does not call.*contracts.*DICE.*dead/i);
    expect(profiles['etheroll-dice-game'].analysis.sections.lifecycle.body)
      .toMatch(/failed at the product\/frontend layer.*shutdown date.*unresolved/i);

    expect(profiles['wagerr-consumer-sportsbook'].extensions.metric_boundary)
      .toMatch(/Blank explorer fields.*unavailable.*not zero/i);
    expect(profiles['wagerr-consumer-sportsbook'].analysis.sections.why_this_outcome.body)
      .toMatch(/no verified postmortem.*binding cause is unknown/i);

    expect(profiles['rollbit-dot-com'].extensions.identity_boundary)
      .toMatch(/Bull Gaming.*crypto-futures.*RLB.*separate/i);
    expect(profiles['rollbit-dot-com'].extensions.metric_boundary)
      .toMatch(/not casino revenue.*profit.*customer assets.*reserves/i);

    expect(profiles['bitcasino-dot-io'].analysis.sections.what_it_is.body)
      .toMatch(/cryptocurrency.*does not make every game an onchain protocol/i);
    expect(profiles['bitcasino-dot-io'].analysis.sections.token_and_value_capture.body)
      .toMatch(/No Bitcasino-native crypto token.*payment rails.*not ownership/i);

    expect(profiles['augur-protocol-reboot'].extensions.identity_boundary)
      .toMatch(/protocol.*Foundation.*ChainSafe.*Zoltar.*frontends.*custodians/i);
    expect(profiles['augur-protocol-reboot'].analysis.sections.risks_and_unknowns.body)
      .toMatch(/deadline passed.*ForkWatch.*usable completion number/i);
  });

  it('does not turn old, operator-reported or unavailable measurements into current facts', () => {
    const profiles = Object.fromEntries(document.cases.map(({ slug, canonical_profile: value }) => [slug, value]));
    expect(profiles['etheroll-dice-game'].metrics).toEqual([]);
    expect(profiles['wagerr-consumer-sportsbook'].metrics).toEqual([]);
    expect(profiles['bitcasino-dot-io'].metrics).toEqual([]);
    expect(profiles['augur-protocol-reboot'].metrics).toEqual([]);

    const rlb = profiles['rollbit-dot-com'].metrics[0];
    expect(rlb).toMatchObject({
      dimension: 'token_volume',
      value: 5538265.59,
      as_of: '2023-09-13T00:00:00Z',
      scope: { product: 'RLB buy-and-burn program' },
    });
    expect(rlb.quality_flags).toEqual(expect.arrayContaining([
      'historical', 'operator_reported', 'revenue_input_not_profit', 'not_casino_revenue', 'not_current',
    ]));
  });

  it('preserves every legacy synthesis and replays idempotently', () => {
    const database = new DatabaseSync(':memory:');
    applyMigrations(database, 89);
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
      WHERE type = 'table' AND name = '_casino_wave_b_profiles_0090'
    `).get().count).toBe(0);
    database.close();
  });

  it('serves each canonical report through the API and customer profile route', async () => {
    for (const entry of document.cases) {
      const api = await worker.fetch(
        new Request(`http://localhost/api/profile/web3_casino/${entry.slug}`),
        { DB: d1(apiDatabase), ASSETS },
        ctx(),
      );
      expect(api.status, entry.slug).toBe(200);
      expect(await api.json(), entry.slug).toEqual(entry.canonical_profile);

      const page = await worker.fetch(
        new Request(`http://localhost/profile/web3_casino/${entry.slug}`, { headers: { accept: 'text/markdown' } }),
        { DB: d1(apiDatabase), ASSETS },
        ctx(),
      );
      expect(page.status, entry.slug).toBe(200);
      expect(await page.text(), entry.slug).toContain(`# ${entry.canonical_profile.identity.name} — Chaindump`);
    }
  });

  it('renders every report in the shared customer UI without research-schema leakage', () => {
    const render = profileRenderer();
    const labels = [
      'What it is', 'What happened', 'Why this outcome', 'Strategic choices',
      'Operating model', 'Token and value capture', 'What could have been different',
      'Risks and unknowns', 'Lifecycle', 'Outlook and what to watch', 'Evidence and sources',
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

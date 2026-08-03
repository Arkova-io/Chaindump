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
} from '../scripts/render-nft-depth-wave-a-0093.mjs';

const artifact = JSON.parse(readFileSync(
  new URL('../docs/nft-depth-wave-a-2026-08-03.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0093_nft_depth_wave_a.sql', import.meta.url),
  'utf8',
);
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const TARGETS = Object.freeze([
  ['ordinals_collection', 'bitcoin-frogs'],
  ['nft_collection', 'gods-unchained-cards'],
  ['nft_collection', 'f1-delta-time'],
  ['nft_collection', 'solana-monkey-business'],
  ['nft_collection', 'axie-origin-axies'],
]);
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
  return database.prepare('SELECT * FROM nft_collections WHERE slug = ?').get(slug);
}

function profile(database, type, slug) {
  return embeddedCanonicalEntityProfile(row(database, slug)?.profile, { type, slug });
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

describe('NFT and Ordinals depth wave A migration 0093', () => {
  it('keeps the evidence artifact and D1-safe migration deterministic', () => {
    expect(artifact).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document).toMatchObject({
      schema: 'chaindump-nft-depth-wave-a-v1',
      research_as_of: '2026-08-03',
      generated_migration: '0093_nft_depth_wave_a.sql',
    });
    expect(document.entities.map(({ slug }) => slug)).toEqual(TARGETS.map(([, slug]) => slug));
    expect(migration).not.toMatch(/\bCREATE\s+TEMP(?:ORARY)?\s+TABLE\b/i);
    expect(Math.max(...unstable_splitSqlQuery(migration).map((statement) => (
      Buffer.byteLength(statement, 'utf8')
    )))).toBeLessThanOrEqual(95_000);
  });

  it('ships the normalized ten-section report with atomic dated claims', () => {
    for (const [type, slug] of TARGETS) {
      const value = profiles[slug];
      expect(validateEntityProfile(value), slug).toEqual([]);
      expect(value.identity).toMatchObject({ id: `${type}:${slug}`, type, slug });
      expect(Object.keys(value.analysis.sections), slug).toEqual(ANALYSIS_SECTION_KEYS);
      expect(value.quality).toMatchObject({ publication_state: 'review', completeness_pct: 100 });
      expect(value.metrics, slug).toEqual([]);

      const sourceIds = new Set(value.sources.map(({ id }) => id));
      expect(value.sources.some(({ role }) => role === 'primary'), slug).toBe(true);
      expect(value.sources.some(({ role }) => role === 'independent'), slug).toBe(true);
      for (const [key, section] of Object.entries(value.analysis.sections)) {
        expect(section.body.length, `${slug}:${key}`).toBeGreaterThanOrEqual(300);
        expect(section.body.length, `${slug}:${key}`).toBeLessThanOrEqual(900);
        expect(section.body, `${slug}:${key}`).not.toMatch(INTERNAL_COPY);
        expect(section.body, `${slug}:${key}`).not.toMatch(/https?:\/\/|T\d{2}:\d{2}:\d{2}/);
        expect(section.claim_ids.length, `${slug}:${key}`).toBeGreaterThanOrEqual(3);
        expect(section.claim_ids.length, `${slug}:${key}`).toBeLessThanOrEqual(4);
        for (const id of section.claim_ids) {
          const claim = value.claims.find((candidate) => candidate.id === id);
          expect(claim?.field_path, id).toMatch(new RegExp(`^analysis\\.sections\\.${key}\\.body#\\d+$`));
          expect(claim?.assertion.length, id).toBeGreaterThan(20);
          expect(claim?.assertion.length, id).toBeLessThanOrEqual(240);
          expect(claim?.source_ids.length, id).toBeGreaterThan(0);
          expect(claim?.source_ids.every((sourceId) => sourceIds.has(sourceId)), id).toBe(true);
          expect(claim?.review, id).toEqual({ state: 'pending', reviewer: null, reviewed_at: null });
        }
      }
      expect(value.claims.some(({ kind }) => kind === 'fact'), slug).toBe(true);
      expect(value.claims.some(({ kind }) => kind === 'inference'), slug).toBe(true);
      expect(value.claims.some(({ kind }) => kind === 'unknown'), slug).toBe(true);
    }
  });

  it('keeps causes, scope, lifecycle and unknowns inside their evidence boundaries', () => {
    expect(profiles['bitcoin-frogs'].analysis.sections.why_this_outcome.body)
      .toMatch(/artifact can persist.*do not establish current demand|off-chain companies/i);
    expect(profiles['bitcoin-frogs'].outcome.label).toBe('unclassified_artifact_durable_market_unverified');

    expect(profiles['gods-unchained-cards'].analysis.sections.why_this_outcome.body)
      .toMatch(/keeps shipping.*game|token rewards alone rarely sustain engagement/i);
    expect(profiles['gods-unchained-cards'].analysis.sections.token_and_value_capture.body)
      .toMatch(/maximum supply is not sell-through|not profit/i);

    expect(profiles['f1-delta-time'].analysis.sections.why_this_outcome.body)
      .toMatch(/depended on Formula 1 intellectual property|does not say why renewal failed/i);
    expect(profiles['f1-delta-time'].status.operating_state).toBe('ceased_2022');

    expect(profiles['solana-monkey-business'].analysis.sections.why_this_outcome.body)
      .toMatch(/holder community.*acquired the IP|economically unproven/i);
    expect(profiles['solana-monkey-business'].analysis.sections.token_and_value_capture.body)
      .toMatch(/DAO treasury, not directly to every holder/i);

    expect(profiles['axie-origin-axies'].analysis.sections.what_it_is.body)
      .toMatch(/cap of 4,088.*need reconciliation|not the same as the game named/i);
    expect(profiles['axie-origin-axies'].analysis.sections.token_and_value_capture.body)
      .toMatch(/Neither allocation is an Origin-holder dividend/i);
  });

  it('records source access and independence honestly', () => {
    for (const [slug, value] of Object.entries(profiles)) {
      expect(new Set(value.sources.map(({ url }) => url)).size, slug).toBe(value.sources.length);
      for (const source of value.sources) {
        expect(source.url, source.id).toMatch(/^https:\/\//);
        expect(source.checked_at, source.id).toBe('2026-08-03T20:55:00Z');
        expect(['reachable', 'archived'], source.id).toContain(source.access_state);
        expect(source.independence_group, source.id).not.toBe('');
        if (source.direct_http_status === 403) {
          expect(source.access_method, source.id).toBe('indexed_browser_snapshot');
        }
      }
      const whyIds = new Set(value.analysis.sections.why_this_outcome.claim_ids.flatMap((claimId) => (
        value.claims.find(({ id }) => id === claimId)?.source_ids || []
      )));
      const groups = new Set(value.sources
        .filter(({ id }) => whyIds.has(id))
        .map(({ independence_group }) => independence_group));
      expect(groups.size, `${slug}:why source independence`).toBeGreaterThanOrEqual(2);
    }
  });

  it('changes only five profiles, preserves legacy data and replays idempotently', () => {
    const database = new DatabaseSync(':memory:');
    applyMigrations(database, 92);
    const countBefore = database.prepare('SELECT COUNT(*) AS count FROM nft_collections').get().count;
    const before = new Map(database.prepare(
      'SELECT slug, name, chain, category, status, profile, sources, updated_at FROM nft_collections ORDER BY slug',
    ).all().map((item) => [item.slug, item]));

    database.exec(migration);
    expect(database.prepare('SELECT COUNT(*) AS count FROM nft_collections').get().count).toBe(countBefore);
    const changed = [];
    for (const item of database.prepare(
      'SELECT slug, name, chain, category, status, profile, sources, updated_at FROM nft_collections ORDER BY slug',
    ).all()) {
      const prior = before.get(item.slug);
      if (item.profile !== prior.profile || item.updated_at !== prior.updated_at) changed.push(item.slug);
      if (!profiles[item.slug]) {
        expect(item, item.slug).toEqual(prior);
        continue;
      }
      expect(item.name, `${item.slug}:name`).toBe(prior.name);
      expect(item.chain, `${item.slug}:chain`).toBe(prior.chain);
      expect(item.category, `${item.slug}:category`).toBe(prior.category);
      expect(item.status, `${item.slug}:status`).toBe(prior.status);
      expect(item.sources, `${item.slug}:sources`).toBe(prior.sources);
      const oldLegacy = JSON.parse(prior.profile);
      const newLegacy = JSON.parse(item.profile);
      delete oldLegacy.canonical_profile;
      delete newLegacy.canonical_profile;
      expect(newLegacy, `${item.slug}:legacy profile`).toEqual(oldLegacy);
      const type = TARGETS.find(([, slug]) => slug === item.slug)[0];
      expect(profile(database, type, item.slug), item.slug).toEqual(profiles[item.slug]);
    }
    expect(changed).toEqual(TARGETS.map(([, slug]) => slug).sort());

    const once = database.prepare('SELECT * FROM nft_collections ORDER BY slug').all();
    database.exec(migration);
    expect(database.prepare('SELECT * FROM nft_collections ORDER BY slug').all()).toEqual(once);
    expect(database.prepare(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = '_nft_depth_wave_a_0093'`).get().count).toBe(0);
    database.close();
  });

  it('serves each profile through the API and customer profile route', async () => {
    for (const [type, slug] of TARGETS) {
      const api = await worker.fetch(
        new Request(`http://localhost/api/profile/${type}/${slug}`),
        { DB: d1(apiDatabase), ASSETS },
        ctx(),
      );
      expect(api.status, slug).toBe(200);
      expect(await api.json(), slug).toEqual(profiles[slug]);

      const page = await worker.fetch(
        new Request(`http://localhost/profile/${type}/${slug}`, { headers: { accept: 'text/markdown' } }),
        { DB: d1(apiDatabase), ASSETS },
        ctx(),
      );
      expect(page.status, slug).toBe(200);
      expect(await page.text(), slug).toContain(`# ${profiles[slug].identity.name} — Chaindump`);
    }
  });

  it('renders every report with the shared customer template and no schema leakage', () => {
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
      expect(output, slug).not.toMatch(
        /source_ids|evidence_locator|validation_errors|structured_analysis|chaindump-entity-profile|\[object Object\]/,
      );
    }
  });
});

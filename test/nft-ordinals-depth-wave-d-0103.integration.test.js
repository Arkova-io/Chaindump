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
} from '../scripts/render-nft-ordinals-depth-wave-d-0103.mjs';

const artifact = JSON.parse(readFileSync(
  new URL('../docs/nft-ordinals-depth-wave-d-2026-08-03.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0103_nft_ordinals_depth_wave_d.sql', import.meta.url),
  'utf8',
);
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const TARGETS = Object.freeze([
  ['nft_collection', 'art-blocks-generative-art'],
  ['nft_collection', 'mad-lads'],
  ['nft_collection', 'okay-bears'],
  ['ordinals_collection', 'bitcoin-puppets'],
  ['ordinals_collection', 'gamma-ordinals-platform'],
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

describe('NFT and Ordinals normalized-depth Wave D migration 0103', () => {
  it('keeps the evidence artifact and D1-safe migration deterministic', () => {
    expect(artifact).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document).toMatchObject({
      schema: 'chaindump-nft-ordinals-depth-wave-d-v1',
      research_as_of: '2026-08-03',
      generated_migration: '0103_nft_ordinals_depth_wave_d.sql',
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
    expect(profiles['art-blocks-generative-art'].analysis.sections.why_this_outcome.body)
      .toMatch(/durable creative method.*single character brand|does not prove.*profitable/i);
    expect(profiles['art-blocks-generative-art'].extensions.editorial_guardrail)
      .toMatch(/Do not call Art Blocks financially thriving/i);

    expect(profiles['mad-lads'].analysis.sections.token_and_value_capture.body)
      .toMatch(/one-time allocation, not recurring NFT yield|did not transfer the allocation/i);
    expect(profiles['mad-lads'].extensions.identity_boundary)
      .toMatch(/Backpack Exchange customer assets.*BP token are separate/i);

    expect(profiles['okay-bears'].analysis.sections.lifecycle.body)
      .toMatch(/brand is active.*collection-market health is unclassified to middling/i);
    expect(profiles['okay-bears'].extensions.editorial_guardrail)
      .toMatch(/retail partnerships.*proof of current NFT liquidity/i);

    expect(profiles['bitcoin-puppets'].analysis.sections.lifecycle.body)
      .toMatch(/no-roadmap stance.*not whether a promised game shipped/i);
    expect(profiles['bitcoin-puppets'].extensions.editorial_guardrail)
      .toMatch(/marketplace floor as liquidity.*adjacent token as holder revenue/i);

    expect(profiles['gamma-ordinals-platform'].analysis.sections.what_it_is.body)
      .toMatch(/not itself one collection.*contracting operator/i);
    expect(profiles['gamma-ordinals-platform'].extensions.editorial_guardrail)
      .toMatch(/hosted collection.s success.*Bitcoin-wide activity/i);
  });

  it('contains no future-dated evidence or lifecycle events', () => {
    const generatedAt = Date.parse(document.generated_at);
    expect(generatedAt).toBeLessThanOrEqual(Date.now());
    for (const value of Object.values(profiles)) {
      for (const source of value.sources) {
        expect(Date.parse(source.accessed_at), source.id).toBeLessThanOrEqual(Date.now());
        expect(Date.parse(source.checked_at), source.id).toBeLessThanOrEqual(Date.now());
        if (source.published_at) expect(Date.parse(source.published_at), source.id).toBeLessThanOrEqual(generatedAt);
      }
      for (const event of value.events) {
        expect(Date.parse(event.date), event.id).toBeLessThanOrEqual(generatedAt);
      }
    }
  });

  it('records source access and independence honestly', () => {
    for (const [slug, value] of Object.entries(profiles)) {
      expect(new Set(value.sources.map(({ url }) => url)).size, slug).toBe(value.sources.length);
      for (const source of value.sources) {
        expect(source.url, source.id).toMatch(/^https:\/\//);
        expect(source.checked_at, source.id).toBe('2026-08-03T22:07:00Z');
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
    applyMigrations(database, 102);
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
    expect(database.prepare(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = '_nft_ordinals_depth_wave_d_0103'`).get().count).toBe(0);
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

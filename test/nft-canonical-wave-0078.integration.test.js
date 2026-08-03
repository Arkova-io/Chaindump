import { readFileSync, readdirSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANALYSIS_SECTION_KEYS,
  embeddedCanonicalEntityProfile,
  validateEntityProfile,
} from '../src/lib/entity-profile.js';
import {
  document,
  profiles,
  renderMigration,
} from '../scripts/render-nft-canonical-wave-0078.mjs';
import {
  MAX_D1_STATEMENT_BYTES,
  sqlStatementByteLengths,
} from '../scripts/check-migrations.mjs';

const migration = readFileSync(
  new URL('../migrations/0078_nft_canonical_profiles.sql', import.meta.url),
  'utf8',
);
const artifact = JSON.parse(readFileSync(
  new URL('../docs/nft-canonical-wave-2026-08-03.json', import.meta.url),
  'utf8',
));
const TARGETS = Object.freeze([
  ['nft_collection', 'bored-ape-yacht-club'],
  ['nft_collection', 'pudgy-penguins'],
  ['nft_collection', 'nba-top-shot'],
  ['nft_collection', 'gamestop-nft-marketplace'],
  ['ordinals_collection', 'runestone'],
]);

function applyMigrationsBefore0078(database) {
  const directory = new URL('../migrations/', import.meta.url);
  const files = readdirSync(directory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file) && file < '0078_')
    .sort();
  for (const file of files) {
    database.exec(readFileSync(new URL(file, directory), 'utf8'));
  }
}

function d1Adapter(database) {
  return {
    prepare(sql) {
      let bindings = [];
      return {
        bind(...values) {
          bindings = values;
          return this;
        },
        async all() {
          return { results: database.prepare(sql).all(...bindings) };
        },
        async first() {
          if (sql.includes('snapshot_cache')) {
            return { data: '{"chains":[]}', updated_at: Date.now() };
          }
          return database.prepare(sql).get(...bindings) ?? null;
        },
      };
    },
  };
}

async function freshWorker() {
  vi.resetModules();
  return (await import('../src/worker.js')).default;
}

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });
let database;

beforeEach(() => {
  database = new DatabaseSync(':memory:');
  applyMigrationsBefore0078(database);
});

afterEach(() => {
  database?.close();
  database = undefined;
  vi.unstubAllGlobals();
});

describe('five-profile NFT canonical wave 0078', () => {
  it('keeps the research document, renderer and SQL byte-for-byte deterministic', () => {
    expect(artifact).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document.generated_migration).toBe('0078_nft_canonical_profiles.sql');
    expect(Object.keys(profiles)).toEqual(TARGETS.map(([, slug]) => slug));
    expect(Buffer.byteLength(migration, 'utf8')).toBeLessThan(1_000_000);
    expect(Math.max(...sqlStatementByteLengths(migration))).toBeLessThanOrEqual(
      MAX_D1_STATEMENT_BYTES,
    );
  });

  it('ships the exact shared ten-section contract with atomic, source-linked claims', () => {
    for (const [type, slug] of TARGETS) {
      const profile = profiles[slug];
      expect(validateEntityProfile(profile), slug).toEqual([]);
      expect(profile.identity).toMatchObject({
        id: `${type}:${slug}`,
        type,
        slug,
      });
      expect(Object.keys(profile.analysis.sections), slug).toEqual(ANALYSIS_SECTION_KEYS);
      expect(profile.quality).toMatchObject({
        publication_state: 'review',
        completeness_pct: 100,
      });
      expect(profile.claims.every(({ review }) => (
        review.state === 'pending'
        && review.reviewer === null
        && review.reviewed_at === null
      )), slug).toBe(true);

      for (const [key, section] of Object.entries(profile.analysis.sections)) {
        expect(section.body.length, `${slug}:${key}`).toBeGreaterThan(300);
        expect(section.body.length, `${slug}:${key}`).toBeLessThan(900);
        expect(section.claim_ids.length, `${slug}:${key}`).toBeGreaterThanOrEqual(3);
        const claims = section.claim_ids.map((id) => (
          profile.claims.find((claim) => claim.id === id)
        ));
        expect(claims.every(Boolean), `${slug}:${key}`).toBe(true);
        expect(new Set(claims.map(({ field_path: path }) => path)).size, `${slug}:${key}`)
          .toBe(claims.length);
        for (const claim of claims) {
          expect(claim.field_path, claim.id).toMatch(
            new RegExp(`^analysis\\.sections\\.${key}\\.body#[a-z0-9-]+$`),
          );
          expect(claim.assertion.length, claim.id).toBeGreaterThan(20);
          expect(claim.evidence_locator.length, claim.id).toBeGreaterThan(25);
          expect(claim.source_ids.length, claim.id).toBeGreaterThan(0);
        }
      }

      const whyClaims = profile.analysis.sections.why_this_outcome.claim_ids.map((id) => (
        profile.claims.find((claim) => claim.id === id)
      ));
      const whySources = new Set(whyClaims.flatMap(({ source_ids: ids }) => ids));
      const whyGroups = new Set(profile.sources
        .filter(({ id }) => whySources.has(id))
        .map(({ independence_group: group }) => group));
      expect(whyGroups.size, `${slug}:why independence`).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps current observations and lifecycle conclusions within their evidence boundaries', () => {
    expect(profiles['bored-ape-yacht-club'].analysis.sections.token_and_value_capture.body)
      .toMatch(/ApeCoin.*separate distribution|APE gas demand.*not automatically/i);
    expect(profiles['bored-ape-yacht-club'].analysis.sections.what_happened.body)
      .toMatch(/2026 ApeFest page was live|neither item proves broad or durable demand/i);

    expect(profiles['pudgy-penguins'].analysis.sections.token_and_value_capture.body)
      .toMatch(/merchandise revenue.*operating company|does not represent company ownership/i);
    expect(profiles['pudgy-penguins'].analysis.sections.risks_and_unknowns.body)
      .toMatch(/Licensing benefits are selective|not executable bids/i);

    expect(profiles['nba-top-shot'].analysis.sections.what_happened.body)
      .toMatch(/historical, not a current-user figure|ten recent marketplace transaction records/i);
    expect(profiles['nba-top-shot'].analysis.sections.token_and_value_capture.body)
      .toMatch(/gross platform fee|not proof that Dapper retains the entire amount/i);

    expect(profiles['gamestop-nft-marketplace'].analysis.sections.why_this_outcome.body)
      .toMatch(/do not reveal.*single proven cause|not promoted here from inference to fact/i);
    expect(profiles['gamestop-nft-marketplace'].analysis.sections.token_and_value_capture.body)
      .toMatch(/IMX grant.*not customer revenue|protocol fee.*not necessarily GameStop revenue/i);

    expect(profiles.runestone.analysis.sections.what_it_is.body)
      .toMatch(/must not be confused.*protocol message|DOG itself.*separate fungible Rune/i);
    expect(profiles.runestone.analysis.sections.risks_and_unknowns.body)
      .toMatch(/112,383.*112,400|silently normalized/i);
    expect(profiles.runestone.analysis.sections.outlook_and_watch.body)
      .toMatch(/DOG price move is not by itself evidence.*NFT collection is liquid/i);

    const prose = Object.values(profiles).flatMap((profile) => (
      Object.values(profile.analysis.sections).map(({ body }) => body)
    )).join(' ');
    expect(prose).not.toMatch(/guaranteed return|risk[- ]free|certain to|will appreciate/i);
    expect(prose).not.toMatch(/source_ids|evidence_locator|canonical_profile|https?:\/\//i);
    expect(prose).not.toMatch(/T\d{2}:\d{2}:\d{2}/);
  });

  it('records source access honestly and does not manufacture independence', () => {
    for (const [slug, profile] of Object.entries(profiles)) {
      expect(profile.sources.some(({ role }) => role === 'primary'), slug).toBe(true);
      expect(profile.sources.some(({ role }) => role === 'independent'), slug).toBe(true);
      for (const source of profile.sources) {
        expect(source.url, source.id).toMatch(/^https:\/\//);
        expect(source.checked_at, source.id).toBe('2026-08-03T18:05:00Z');
        expect(['reachable', 'archived'], source.id).toContain(source.access_state);
        expect(source.independence_group, source.id).not.toBe('');
        if (source.direct_http_status === 403) {
          expect(['indexed_browser_snapshot', 'redirect_check'], source.id)
            .toContain(source.access_method);
        }
        if (source.access_state === 'archived') {
          expect(source.archive_url, source.id).toMatch(/^https:\/\//);
        }
      }
    }
    expect(profiles.runestone.sources.find(({ id }) => id.endsWith(':organizer')))
      .toMatchObject({ role: 'primary', tier: 'C', access_state: 'archived' });
    expect(profiles['bored-ape-yacht-club'].sources.find(({ id }) => id.endsWith(':coingecko')))
      .toMatchObject({ role: 'aggregator', independence_group: 'coingecko' });
  });

  it('replays against the real corpus, changes only five rows and preserves legacy JSON exactly', () => {
    const countBefore = database.prepare('SELECT COUNT(*) AS count FROM nft_collections').get().count;
    const before = new Map(database.prepare(
      'SELECT slug, status, profile, sources, updated_at FROM nft_collections ORDER BY slug',
    ).all().map((item) => [item.slug, item]));

    database.exec(migration);
    expect(database.prepare('SELECT COUNT(*) AS count FROM nft_collections').get().count)
      .toBe(countBefore);

    const changed = [];
    for (const item of database.prepare(
      'SELECT slug, status, profile, sources, updated_at FROM nft_collections ORDER BY slug',
    ).all()) {
      const prior = before.get(item.slug);
      if (item.profile !== prior.profile || item.status !== prior.status || item.updated_at !== prior.updated_at) {
        changed.push(item.slug);
      }
      if (!profiles[item.slug]) {
        expect(item, item.slug).toEqual(prior);
        continue;
      }
      const oldProfile = JSON.parse(prior.profile);
      const newProfile = JSON.parse(item.profile);
      const oldLegacy = structuredClone(oldProfile);
      const newLegacy = structuredClone(newProfile);
      delete oldLegacy.canonical_profile;
      delete newLegacy.canonical_profile;
      expect(newLegacy, `${item.slug}:legacy`).toEqual(oldLegacy);
      expect(item.sources, `${item.slug}:sources`).toBe(prior.sources);
      expect(item.updated_at).toBe('2026-08-03');
      const type = TARGETS.find(([, slug]) => slug === item.slug)[0];
      const embedded = embeddedCanonicalEntityProfile(item.profile, { type, slug: item.slug });
      expect(embedded, item.slug).toEqual(profiles[item.slug]);
      expect(validateEntityProfile(embedded), item.slug).toEqual([]);
    }
    expect(changed).toEqual(TARGETS.map(([, slug]) => slug).sort());

    const afterOnce = database.prepare(
      'SELECT slug, status, profile, sources, updated_at FROM nft_collections ORDER BY slug',
    ).all();
    database.exec(migration);
    expect(database.prepare(
      'SELECT slug, status, profile, sources, updated_at FROM nft_collections ORDER BY slug',
    ).all()).toEqual(afterOnce);
  });

  it.each(TARGETS)('serves clean %s customer copy for %s', async (type, slug) => {
    database.exec(migration);
    const worker = await freshWorker();
    const response = await worker.fetch(
      new Request(`http://localhost/api/profile/${type}/${slug}`),
      { DB: d1Adapter(database) },
      ctx(),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual(profiles[slug]);
    expect(Object.keys(body.analysis.sections)).toEqual(ANALYSIS_SECTION_KEYS);
    for (const section of Object.values(body.analysis.sections)) {
      expect(section.body).not.toMatch(/source_ids|source_role|evidence_locator|https?:\/\/|\{.*\}/i);
    }
    expect(body.sources.every(({ url }) => url.startsWith('https://'))).toBe(true);
    expect(body.quality.publication_state).toBe('review');
  });
});

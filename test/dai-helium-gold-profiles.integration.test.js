import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { document, renderMigration } from '../scripts/render-dai-helium-gold-migration.mjs';

const migrationUrl = new URL('../migrations/0079_helium_q2_citation_integrity.sql', import.meta.url);
const migration = readFileSync(migrationUrl, 'utf8');
const artifact = JSON.parse(readFileSync(
  new URL('../docs/dai-helium-gold-2026-08-03.json', import.meta.url),
  'utf8',
));
const SECTIONS = [
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
const MATERIAL_SECTIONS = [
  'what_happened',
  'why_this_outcome',
  'strategic_choices',
  'operating_model',
  'token_and_value_capture',
  'risks_and_unknowns',
  'lifecycle',
  'outlook_and_watch',
];
let db;

function openDb() {
  const value = new DatabaseSync(':memory:');
  value.exec(`
    CREATE TABLE stablecoin_meta (slug TEXT PRIMARY KEY,name TEXT,symbol TEXT,profile TEXT,sources TEXT,updated_at TEXT);
    CREATE TABLE rwa_depin (slug TEXT PRIMARY KEY,name TEXT,category TEXT,status TEXT,profile TEXT,sources TEXT,updated_at TEXT);
    INSERT INTO stablecoin_meta VALUES ('dai','Dai','DAI','{"notes":"legacy","sources":["https://legacy.example/dai"]}','["https://legacy.example/dai"]','2026-07-08');
    INSERT INTO stablecoin_meta VALUES ('usds','Sky Dollar','USDS','{"notes":"preserve"}','[]','2026-07-08');
    INSERT INTO rwa_depin VALUES ('helium','Helium','depin-wireless','steady','{"what_it_does":"legacy","sources":["https://legacy.example/helium"]}','["https://legacy.example/helium"]','2026-07-08');
    INSERT INTO rwa_depin VALUES ('filecoin','Filecoin','depin-storage','steady','{"notes":"preserve"}','[]','2026-07-08');
  `);
  return value;
}

function applyMigrationsBefore0079(database) {
  const migrationDirectory = new URL('../migrations/', import.meta.url);
  const files = readdirSync(migrationDirectory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file) && file < '0079_')
    .sort();
  for (const file of files) {
    database.exec(readFileSync(new URL(file, migrationDirectory), 'utf8'));
  }
}

function row(table, slug, database = db) {
  return database.prepare(`SELECT * FROM ${table} WHERE slug=?`).get(slug);
}

function d1For(table, value) {
  return {
    prepare(sql) {
      return {
        bind() { return this; },
        async all() {
          return sql.includes(`FROM ${table}`) ? { results: [value] } : { results: [] };
        },
      };
    },
  };
}

beforeEach(() => { db = openDb(); });
afterEach(() => db.close());

describe('DAI and Helium gold profiles', () => {
  it('keeps the research document, renderer and SQL artifact deterministic', () => {
    expect(artifact).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document.generated_migration).toBe('0079_helium_q2_citation_integrity.sql');
  });

  it('installs semantically complete, atomic profiles without touching neighboring rows', () => {
    const usds = row('stablecoin_meta', 'usds');
    const filecoin = row('rwa_depin', 'filecoin');
    db.exec(migration);
    for (const [table, slug] of [['stablecoin_meta', 'dai'], ['rwa_depin', 'helium']]) {
      const value = row(table, slug);
      const stored = JSON.parse(value.profile);
      const canonical = stored.canonical_profile;
      expect(value.updated_at).toBe('2026-08-03');
      expect(canonical).toMatchObject({
        schema: 'chaindump-entity-profile-source',
        version: 1,
        status: { operating_state: 'operating', as_of: '2026-08-03' },
        outcome: { as_of: '2026-08-03', rule_id: 'forensic-lifecycle-v1' },
        freshness: { state: 'current', last_reviewed_at: '2026-08-03', next_review_at: '2026-08-10' },
      });
      expect(canonical.confidence).toBe(slug === 'helium' ? 'low' : 'medium');
      expect(canonical.outcome.confidence).toBe(canonical.confidence);
      expect(canonical.outcome.label).toMatch(/^operating_/);
      expect(Object.keys(canonical.sections)).toEqual(SECTIONS);
      expect(canonical.claims.every(({ review }) => review.state === 'pending')).toBe(true);
      expect(canonical.extensions.methodology_notes[0]).toMatch(/pending until a person reviews/i);
      for (const key of SECTIONS) {
        expect(canonical.sections[key].trim(), key).not.toBe('');
        expect(canonical.sections[key], key).not.toMatch(/Unknown \/ not published|needs a dated|T\d{2}:\d{2}:\d{2}/);
        expect(canonical.section_dates[key]).toBe('2026-08-03');
        expect(canonical.section_claim_ids[key].length, key).toBeGreaterThanOrEqual(2);
      }
      for (const key of MATERIAL_SECTIONS) {
        const claims = canonical.section_claim_ids[key]
          .map((id) => canonical.claims.find((claim) => claim.id === id));
        expect(claims.every(Boolean), `${slug}:${key}`).toBe(true);
        expect(claims.every((claim) => claim.evidence_locator.length >= 35), `${slug}:${key}`).toBe(true);
        expect(new Set(claims.flatMap((claim) => claim.source_ids)).size, `${slug}:${key}`)
          .toBeGreaterThanOrEqual(2);
      }
      const sourceIds = new Set(JSON.parse(value.sources).map(({ id }) => id));
      const claimIds = new Set(canonical.claims.map(({ id }) => id));
      expect(new Set(canonical.claims.map(({ field_path }) => field_path)).size)
        .toBe(canonical.claims.length);
      for (const claim of canonical.claims) {
        expect(claim.assertion?.trim(), `${slug}:${claim.id}:assertion`).not.toBe('');
        for (const id of claim.source_ids) {
          expect(sourceIds.has(id), `${slug}:${claim.id}:${id}`).toBe(true);
        }
      }
      for (const item of [...canonical.metrics, ...canonical.events]) {
        for (const id of item.claim_ids) expect(claimIds.has(id), `${slug}:${id}`).toBe(true);
      }
    }
    expect(row('stablecoin_meta', 'usds')).toEqual(usds);
    expect(row('rwa_depin', 'filecoin')).toEqual(filecoin);
  });

  it('keeps DAI/USDS and Helium usage, cash and reward boundaries explicit', () => {
    db.exec(migration);
    const daiRow = row('stablecoin_meta', 'dai');
    const heliumRow = row('rwa_depin', 'helium');
    const dai = JSON.parse(daiRow.profile);
    const helium = JSON.parse(heliumRow.profile);
    expect(dai.canonical_profile.sections.what_happened).toMatch(/DAI remained live|should not be combined/);
    expect(dai.canonical_profile.sections.operating_model).toMatch(/not a promise.*redeem at a bank/i);
    expect(dai.canonical_profile.events.map(({ date }) => date)).toEqual(['2024-09-17', '2026-06-22']);
    expect(JSON.stringify(JSON.parse(daiRow.sources))).toContain('0x2221973333bd0c22f8b1b2593fa9817765bafcf65a2d3c25ebde8df06bbd197c');
    expect(JSON.stringify(JSON.parse(daiRow.sources))).toContain('0xa2bffc99b76e5a2e2733ac1f5c350c1d7590e5ae74862fad58b2816b7ab8fba6');
    expect(helium.canonical_profile.sections.what_it_is).toMatch(/protocol documents say.*HNT.*FAQ still says.*MOBILE/i);
    expect(helium.canonical_profile.sections.token_and_value_capture)
      .toMatch(/payer rate changed.*\$0\.50.*\$0\.10/is);
    expect(helium.canonical_profile.sections.lifecycle).toMatch(/commercial partner statement.*not independent proof/i);
    expect(helium.canonical_profile.sections.outlook_and_watch).toMatch(/not independent proof or a permanent growth forecast/i);
    expect(helium.canonical_profile.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dimension: 'fees',
        value: 3290000,
        window: { start: '2026-04-01', end: '2026-06-30', definition: 'calendar_quarter' },
        quality_flags: expect.arrayContaining(['latest-reported-quarter', 'issuer-funded-advisory']),
      }),
      expect.objectContaining({ dimension: 'fees', value: 3350000 }),
      expect.objectContaining({ dimension: 'utilization', value: 9851, unit: 'terabytes' }),
      expect.objectContaining({ dimension: 'unit_revenue', value: 0.1, as_of: '2026-06-05' }),
    ]));
    const telefonica = JSON.parse(heliumRow.sources).find(({ id }) => id === 'telefonica');
    expect(telefonica.role).toBe('primary');
  });

  it('treats Q2 as the latest Helium period and Q1 only as history', () => {
    const helium = document.cases.find(({ slug }) => slug === 'helium');
    const canonical = helium.profile.canonical_profile;
    const quarterMetrics = canonical.metrics.filter(({ window }) => (
      window.definition === 'calendar_quarter'
    ));
    const latest = quarterMetrics.reduce((left, right) => (
      left.as_of > right.as_of ? left : right
    ));
    expect(latest.as_of).toBe('2026-06-30');
    expect(quarterMetrics.filter(({ as_of }) => as_of === '2026-06-30'))
      .toHaveLength(4);
    expect(quarterMetrics.filter(({ as_of }) => as_of === '2026-03-31')
      .every(({ quality_flags }) => quality_flags.includes('historical-comparator'))).toBe(true);
    expect(canonical.sections.what_happened).toMatch(/latest quarterly report.*Q2.*9,851.*20% from Q1/is);
    expect(canonical.sections.lifecycle).toMatch(/latest period is Q2 2026.*Q1 is retained only as dated history/is);
    expect(canonical.sections.token_and_value_capture).toMatch(/June 4–5.*\$0\.50.*\$0\.10/is);
    expect(canonical.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'event:helium:carrier-payer-rate-reset:2026-06-05',
        date: '2026-06-05',
      }),
    ]));
  });

  it('classifies Blockworks Advisory as issuer-funded primary evidence, never independent', () => {
    const helium = document.cases.find(({ slug }) => slug === 'helium');
    const advisory = helium.sources.filter(({ id }) => /^hnt-q[12]-2026$/.test(id));
    expect(advisory).toHaveLength(2);
    expect(advisory.every(({ role }) => role === 'primary')).toBe(true);
    expect(advisory.every(({ publisher }) => publisher === 'Blockworks Advisory')).toBe(true);
    expect(advisory.every(({ title }) => /Nova Labs-funded/i.test(title))).toBe(true);
    expect(helium.profile.canonical_profile.confidence).toBe('low');
    expect(helium.profile.canonical_profile.outcome.note).toMatch(/issuer-funded.*lack independent/is);
  });

  it('maps every section claim to one explicit assertion and one unique atomic field', () => {
    for (const { slug, profile } of document.cases) {
      const canonical = profile.canonical_profile;
      const sectionClaims = Object.values(canonical.section_claim_ids).flat()
        .map((id) => canonical.claims.find((claim) => claim.id === id));
      expect(sectionClaims.every(Boolean)).toBe(true);
      expect(new Set(sectionClaims.map(({ field_path }) => field_path)).size)
        .toBe(sectionClaims.length);
      expect(new Set(sectionClaims.map(({ evidence_locator }) => evidence_locator)).size)
        .toBe(sectionClaims.length);
      for (const claim of sectionClaims) {
        expect(claim.assertion?.trim(), `${slug}:${claim.id}`).not.toBe('');
        const match = claim.field_path.match(
          /^extensions\.atomic_assertions\.([a-z_]+)\.([a-z0-9-]+)$/,
        );
        expect(match, `${slug}:${claim.id}:${claim.field_path}`).not.toBeNull();
        expect(canonical.extensions.atomic_assertions[match[1]][match[2]])
          .toBe(claim.assertion);
      }
    }
  });

  it('splits formerly bundled Helium market and DAI risk claims into atomic records', () => {
    const dai = document.cases.find(({ slug }) => slug === 'dai').profile.canonical_profile;
    const helium = document.cases.find(({ slug }) => slug === 'helium').profile.canonical_profile;
    const daiIds = new Set(dai.claims.map(({ id }) => id));
    const heliumIds = new Set(helium.claims.map(({ id }) => id));
    expect(daiIds.has('claim:dai:risks_and_unknowns:liquidation-shutdown')).toBe(false);
    for (const id of [
      'claim:dai:risks_and_unknowns:liquidation-risk',
      'claim:dai:risks_and_unknowns:shutdown-process',
      'claim:dai:risks_and_unknowns:issuer-exposure',
      'claim:dai:risks_and_unknowns:collateral-split-unknown',
    ]) expect(daiIds.has(id), id).toBe(true);
    expect(heliumIds.has('claim:helium:what_happened:usage-and-market')).toBe(false);
    for (const id of [
      'claim:helium:what_happened:q2-transfer',
      'claim:helium:what_happened:q2-carrier-burn',
      'claim:helium:what_happened:q2-total-burn',
      'claim:helium:what_happened:hnt-price',
      'claim:helium:what_happened:hnt-market-cap',
      'claim:helium:what_happened:measurement-boundary',
    ]) expect(heliumIds.has(id), id).toBe(true);
  });

  it('preserves the exact pre-0079 legacy envelope during a real migration replay', () => {
    const corpus = new DatabaseSync(':memory:');
    try {
      applyMigrationsBefore0079(corpus);
      const beforeDai = row('stablecoin_meta', 'dai', corpus);
      const beforeHelium = row('rwa_depin', 'helium', corpus);
      const beforeUsds = row('stablecoin_meta', 'usds', corpus);
      const beforeFilecoin = row('rwa_depin', 'filecoin', corpus);
      corpus.exec(migration);
      const afterDai = row('stablecoin_meta', 'dai', corpus);
      const afterHelium = row('rwa_depin', 'helium', corpus);
      for (const [before, after] of [[beforeDai, afterDai], [beforeHelium, afterHelium]]) {
        const beforeProfile = JSON.parse(before.profile);
        const profile = JSON.parse(after.profile);
        expect(profile.legacy_preservation).toEqual(beforeProfile.legacy_preservation);
        expect(profile.canonical_profile.schema).toBe('chaindump-entity-profile-source');
      }
      expect(JSON.parse(afterDai.profile).notes).toBe(JSON.parse(beforeDai.profile).notes);
      expect(JSON.parse(afterHelium.profile).what_it_does).not.toBeUndefined();
      expect(row('stablecoin_meta', 'usds', corpus)).toEqual(beforeUsds);
      expect(row('rwa_depin', 'filecoin', corpus)).toEqual(beforeFilecoin);
      corpus.exec(migration);
      expect(row('stablecoin_meta', 'dai', corpus)).toEqual(afterDai);
      expect(row('rwa_depin', 'helium', corpus)).toEqual(afterHelium);
    } finally {
      corpus.close();
    }
  });

  it.each([
    ['stablecoin', 'stablecoin_meta', 'dai'],
    ['depin', 'rwa_depin', 'helium'],
  ])('feeds a clean canonical %s route without exposing private audit data', async (type, table, slug) => {
    db.exec(migration);
    const stored = row(table, slug);
    vi.resetModules();
    const worker = (await import('../src/worker.js')).default;
    const response = await worker.fetch(
      new Request(`http://localhost/api/profile/${type}/${slug}`),
      { DB: d1For(table, stored) },
      { waitUntil() {}, passThroughOnException() {} },
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      schema: 'chaindump-entity-profile',
      version: 1,
      identity: { id: `${type}:${slug}`, type, slug },
      status: { operating_state: 'operating' },
      outcome: { label: expect.stringMatching(/^operating_/) },
      freshness: { state: 'current' },
      quality: { publication_state: 'review', completeness_pct: 100, validation_errors: [] },
    });
    expect(Object.keys(body.analysis.sections)).toEqual(SECTIONS);
    for (const section of Object.values(body.analysis.sections)) {
      expect(section.body).not.toMatch(/source_ids|source_role|evidence_locator|https?:\/\/|\{.*\}/i);
    }
    expect(body.claims.every(({ review }) => review.state === 'pending')).toBe(true);
    expect(body.extensions.category_data).not.toHaveProperty('canonical_profile');
    expect(body.extensions.category_data).not.toHaveProperty('legacy_preservation');
  });
});

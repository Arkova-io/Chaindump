import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const migration = readFileSync(new URL('../migrations/0076_dai_helium_gold_profiles.sql', import.meta.url), 'utf8');
const SECTIONS = ['what_it_is','what_happened','why_this_outcome','strategic_choices','operating_model','token_and_value_capture','counterfactual','risks_and_unknowns','lifecycle','outlook_and_watch'];
let db;

function openDb() {
  const value = new DatabaseSync(':memory:');
  value.exec(`
    CREATE TABLE stablecoin_meta (slug TEXT PRIMARY KEY,name TEXT,symbol TEXT,profile TEXT,sources TEXT,updated_at TEXT);
    CREATE TABLE rwa_depin (slug TEXT PRIMARY KEY,name TEXT,category TEXT,status TEXT,profile TEXT,sources TEXT,updated_at TEXT);
    INSERT INTO stablecoin_meta VALUES ('dai','Dai','DAI','{"notes":"legacy"}','[]','2026-07-08');
    INSERT INTO stablecoin_meta VALUES ('usds','Sky Dollar','USDS','{"notes":"preserve"}','[]','2026-07-08');
    INSERT INTO rwa_depin VALUES ('helium','Helium','depin-wireless','steady','{"notes":"legacy"}','[]','2026-07-08');
    INSERT INTO rwa_depin VALUES ('filecoin','Filecoin','depin-storage','steady','{"notes":"preserve"}','[]','2026-07-08');
  `);
  return value;
}
function row(table, slug) { return db.prepare(`SELECT * FROM ${table} WHERE slug=?`).get(slug); }
function d1For(table, value) { return { prepare(sql) { return { bind(){return this;}, async all(){ return sql.includes(`FROM ${table}`) ? {results:[value]} : {results:[]}; } }; } }; }

beforeEach(() => { db = openDb(); });
afterEach(() => db.close());

describe('DAI and Helium gold profiles', () => {
  it('installs complete canonical profiles without touching neighboring rows', () => {
    const usds = row('stablecoin_meta','usds');
    const filecoin = row('rwa_depin','filecoin');
    db.exec(migration);
    for (const [table, slug] of [['stablecoin_meta','dai'],['rwa_depin','helium']]) {
      const value = row(table,slug);
      const stored = JSON.parse(value.profile);
      const canonical = stored.canonical_profile;
      expect(value.updated_at).toBe('2026-08-03');
      expect(canonical).toMatchObject({schema:'chaindump-entity-profile-source',version:1,status:{operating_state:'operating',as_of:'2026-08-03'},freshness:{state:'current',last_reviewed_at:'2026-08-03',next_review_at:'2026-08-10'},confidence:'medium'});
      expect(Object.keys(canonical.sections)).toEqual(SECTIONS);
      expect(canonical.claims.every(({review})=>review.state==='pending')).toBe(true);
      expect(canonical.extensions.methodology_notes[0]).toMatch(/not human approval/);
      for (const key of SECTIONS) {
        expect(canonical.sections[key].length,key).toBeGreaterThan(250);
        expect(canonical.section_dates[key]).toBe('2026-08-03');
        expect(canonical.section_claim_ids[key]).toHaveLength(1);
      }
      const sourceIds = new Set(JSON.parse(value.sources).map(({id})=>id));
      const claimIds = new Set(canonical.claims.map(({id})=>id));
      for (const claim of canonical.claims) for (const id of claim.source_ids) expect(sourceIds.has(id),`${slug}:${claim.id}:${id}`).toBe(true);
      for (const item of [...canonical.metrics,...canonical.events]) for (const id of item.claim_ids) expect(claimIds.has(id),`${slug}:${id}`).toBe(true);
    }
    expect(row('stablecoin_meta','usds')).toEqual(usds);
    expect(row('rwa_depin','filecoin')).toEqual(filecoin);
  });

  it('preserves DAI/USDS and usage/emission boundaries', () => {
    db.exec(migration);
    const dai = JSON.parse(row('stablecoin_meta','dai').profile);
    const helium = JSON.parse(row('rwa_depin','helium').profile);
    expect(dai.canonical_profile.sections.what_happened).toMatch(/not erase DAI|must not be combined/);
    expect(dai.canonical_profile.sections.operating_model).toMatch(/not a promise.*redeem/i);
    expect(dai.editorial_guardrails).toMatch(/separate from USDS/);
    expect(helium.canonical_profile.sections.what_happened).toMatch(/MOBILE and IOT.*remained/);
    expect(helium.canonical_profile.sections.token_and_value_capture).toMatch(/gross burns.*not automatically be called customer revenue/i);
    expect(helium.editorial_guardrails).toMatch(/paid usage.*emissions.*separate/i);
    expect(helium.what_it_does).toMatch(/LoRaWAN.*carrier offload/i);
    expect(helium.outlook).toMatch(/Watch traffic-only Data Credit spend/i);
  });

  it.each([
    ['stablecoin','stablecoin_meta','dai'],
    ['depin','rwa_depin','helium'],
  ])('feeds a clean canonical %s route', async (type, table, slug) => {
    db.exec(migration);
    const stored = row(table,slug);
    vi.resetModules();
    const worker = (await import('../src/worker.js')).default;
    const response = await worker.fetch(new Request(`http://localhost/api/profile/${type}/${slug}`), {DB:d1For(table,stored)}, {waitUntil(){},passThroughOnException(){}});
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({schema:'chaindump-entity-profile',version:1,identity:{id:`${type}:${slug}`,type,slug},status:{operating_state:'operating'},freshness:{state:'current'},quality:{publication_state:'review',completeness_pct:100,validation_errors:[]}});
    expect(Object.keys(body.analysis.sections)).toEqual(SECTIONS);
    for (const section of Object.values(body.analysis.sections)) expect(section.body).not.toMatch(/source_ids|source_role|evidence_locator|https?:\/\/|\{.*\}/i);
    expect(body.claims.every(({review})=>review.state==='pending')).toBe(true);
    expect(body.extensions.category_data).not.toHaveProperty('canonical_profile');
  });

  it('is deterministic and idempotent', () => {
    db.exec(migration);
    const first = [row('stablecoin_meta','dai'),row('rwa_depin','helium')];
    db.exec(migration);
    expect([row('stablecoin_meta','dai'),row('rwa_depin','helium')]).toEqual(first);
  });
});

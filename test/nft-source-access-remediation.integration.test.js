import { DatabaseSync } from 'node:sqlite';
import { Buffer } from 'node:buffer';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { unstable_splitSqlQuery } from 'wrangler';
import { buildNftLifecycleAnalysis } from '../src/lib/nft-lifecycle-analysis.js';
import {
  buildRemediationRows,
  renderNftSourceAccessRemediationMigration,
} from '../scripts/render-nft-source-access-remediation-migration.mjs';
import { MAX_D1_STATEMENT_BYTES, sqlStatementByteLengths } from '../scripts/check-migrations.mjs';

const document = JSON.parse(readFileSync(
  new URL('../docs/nft-source-access-remediation-wave-2026-07-29.json', import.meta.url),
  'utf8',
));

function databaseThroughCurrentMigrations() {
  const database = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../migrations', import.meta.url))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()) {
    database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  return database;
}

function rows(database) {
  return database.prepare(`
    SELECT slug, name, chain, status, profile, sources
    FROM nft_collections
    ORDER BY slug
  `).all();
}

function analysisRows(database) {
  return rows(database).map((row) => ({ ...row, profile: JSON.parse(row.profile) }));
}

function source(database, slug, sourceId) {
  const row = database.prepare('SELECT sources FROM nft_collections WHERE slug = ?').get(slug);
  return JSON.parse(row.sources).find(({ id }) => id === sourceId);
}

function profile(database, slug) {
  return JSON.parse(database.prepare('SELECT profile FROM nft_collections WHERE slug = ?').get(slug).profile);
}

function collectReferences(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, found);
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value.source_ids)) found.push(...value.source_ids);
  if (Array.isArray(value.source_refs)) found.push(...value.source_refs);
  for (const item of Object.values(value)) collectReferences(item, found);
  return found;
}

let before;
let after;
let baselineRows;
let builtRows;

beforeAll(() => {
  before = databaseThroughCurrentMigrations();
  baselineRows = rows(before);
  builtRows = buildRemediationRows(document, baselineRows);
  after = databaseThroughCurrentMigrations();
  after.exec(renderNftSourceAccessRemediationMigration(document, rows(after), '0064'));
});

describe('NFT source-access remediation wave', () => {
  it('preserves the bounded audit result without converting HTTP access into evidence review', () => {
    expect(document.migration_sequence).toMatchObject({
      reserved_after: '0063',
      confirmed_id: '0064',
      rendered: false,
    });
    expect(document.audit_records).toHaveLength(198);
    expect(document.expected.audited_access_states).toEqual({
      accessible: 171,
      bot_blocked: 21,
      unverified: 5,
      dead: 1,
    });
    expect(document.audit_records.filter(({ access_state: state }) => state === 'accessible'))
      .toHaveLength(171);
    expect(document.audit_records.every((record) => (
      record.access_checked_at === '2026-07-29'
      && !Object.hasOwn(record, 'access_verified_at')
      && !Object.hasOwn(record, 'evidence_reviewed')
      && !Object.hasOwn(record, 'last_verified_at')
    ))).toBe(true);
    expect(document.repair_sources.every(({ source: repairSource }) => (
      repairSource.access_checked_at === '2026-07-29'
      && repairSource.last_verified_at === '2026-07-29'
      && repairSource.verification_note.includes('HTTP 200')
    ))).toBe(true);
  });

  it('patches every audited source and adds seven separately inspected repair sources', () => {
    expect(builtRows).toHaveLength(49);
    const allSources = builtRows.flatMap(({ sources }) => sources);
    const auditedSources = allSources.filter(({ access_checked_at: day }) => day === '2026-07-29');
    expect(auditedSources).toHaveLength(205);

    const stateCounts = Object.groupBy(
      document.audit_records,
      ({ access_state: accessState }) => accessState,
    );
    expect(stateCounts.accessible).toHaveLength(171);
    expect(stateCounts.bot_blocked).toHaveLength(21);
    expect(stateCounts.unverified).toHaveLength(5);
    expect(stateCounts.dead).toHaveLength(1);
  });

  it('keeps all six broken originals visible and remaps every published reference', () => {
    const remaps = [
      ['bored-ape-yacht-club', 'bayc-origin', 'bayc-founding-current'],
      ['decentraland-land', 'dcl-marketplace', 'dcl-marketplace-current'],
      ['funko-digital-pop', 'funko-faq', 'funko-digital-current'],
      ['nifty-gateway', 'nifty-s1', 'nifty-s1-sec'],
      ['nifty-gateway', 'nifty-risk', 'nifty-risk-sec'],
      ['nifty-gateway', 'nifty-8k', 'nifty-winddown-sec'],
    ];
    for (const [slug, oldId, newId] of remaps) {
      const oldSource = source(after, slug, oldId);
      const newSource = source(after, slug, newId);
      expect(['unverified', 'dead']).toContain(oldSource.access_state);
      expect(oldSource.access_checked_at).toBe('2026-07-29');
      expect(newSource).toMatchObject({
        access_state: 'accessible',
        access_checked_at: '2026-07-29',
        last_verified_at: '2026-07-29',
      });
      const references = collectReferences(profile(after, slug));
      expect(references, `${slug} must not publish ${oldId}`).not.toContain(oldId);
      expect(references, `${slug} must publish ${newId}`).toContain(newId);
    }
  });

  it('withholds BAYC details no longer supported by accessible current first-party evidence', () => {
    const bayc = profile(after, 'bored-ape-yacht-club');
    expect(bayc.launched).toContain('10,000 Bored Apes were released on 2021-04-23');
    expect(bayc.mint_price).toContain('Withheld');
    expect(bayc.founder_engagement).toContain('does not name the full founding or original art team');
    expect(JSON.stringify(bayc)).not.toContain('0.08 ETH');
    expect(JSON.stringify(bayc)).not.toContain('Gargamel');
    expect(JSON.stringify(bayc)).not.toContain('Presale began');
    expect(bayc.forensic_analysis.strategic_choices[0].decision)
      .toBe('Launch a fixed 10,000-avatar membership collection.');
  });

  it('moves the live aggregate from unrecorded access to visible publication-depth counts', () => {
    const beforeAnalysis = buildNftLifecycleAnalysis(analysisRows(before));
    const afterAnalysis = buildNftLifecycleAnalysis(analysisRows(after));
    expect(beforeAnalysis.coverage).toMatchObject({
      source_records: 226,
      source_records_access_confirmed: 0,
      field_claims: 440,
      field_claims_access_anchored: 0,
      forensic_sections_total: 457,
      forensic_sections_access_anchored: 0,
      forensic_references_access_anchored: 0,
    });
    expect(beforeAnalysis.evidenceWindow.source_access_checked_through).toBeNull();

    expect(afterAnalysis.coverage).toMatchObject({
      source_records: 233,
      source_records_access_confirmed: 178,
      distinct_source_urls: 228,
      field_claims: 440,
      field_claims_access_anchored: 372,
      forensic_sections_total: 457,
      forensic_sections_access_anchored: 391,
      forensic_references_access_anchored: 685,
    });
    expect(afterAnalysis.coverage.source_access_states).toEqual([
      { key: 'accessible', count: 178 },
      { key: 'bot_blocked', count: 44 },
      { key: 'unverified', count: 5 },
      { key: 'redirected_to_homepage', count: 2 },
      { key: 'dead', count: 1 },
      { key: 'not_found_by_raw_fetch', count: 1 },
      { key: 'service_unavailable', count: 1 },
      { key: 'tls_fetch_failed', count: 1 },
    ]);
    expect(afterAnalysis.evidenceWindow.source_access_checked_through).toBe('2026-07-29');
  });

  it('does not reserve a numbered migration file before sequencing is confirmed', () => {
    const migrationNames = readdirSync(new URL('../migrations', import.meta.url));
    expect(migrationNames.some((name) => name.includes('nft_source_access_remediation'))).toBe(false);
    expect(() => renderNftSourceAccessRemediationMigration(document, baselineRows))
      .toThrow('confirmed four-digit migration id');
  });

  it('renders within Cloudflare D1 authorization and statement-size constraints', () => {
    const sql = renderNftSourceAccessRemediationMigration(document, baselineRows, '0064');
    const wranglerStatements = unstable_splitSqlQuery(sql);
    expect(sql).not.toMatch(/\bCREATE\s+TEMP(?:ORARY)?\s+TABLE\b/i);
    expect(sql).toContain('CREATE TABLE nft_source_remediation_0064');
    expect(Math.max(...sqlStatementByteLengths(sql))).toBeLessThanOrEqual(MAX_D1_STATEMENT_BYTES);
    expect(wranglerStatements).toHaveLength(53);
    expect(Math.max(...wranglerStatements.map((statement) => Buffer.byteLength(statement))))
      .toBeLessThanOrEqual(MAX_D1_STATEMENT_BYTES);
  });
});

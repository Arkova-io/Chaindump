import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const document = JSON.parse(readFileSync(
  new URL('../docs/casino-wave6-2026-07-29.json', import.meta.url),
  'utf8',
));
const schemaMigration = readFileSync(
  new URL('../migrations/0014_casino_analysis.sql', import.meta.url),
  'utf8',
);
const waveMigration = readFileSync(
  new URL('../migrations/0042_casino_wave6.sql', import.meta.url),
  'utf8',
);

const expectedIds = [
  'cloudbet-dot-com',
  'shuffle-dot-com',
  'betfury-bfg-ecosystem',
  'winr-protocol-bankroll',
  'betswirl-onchain-casino',
];

const publishedIds = new Set([
  'overtime',
  'decentral-games-poker-arcade',
  'sx-bet',
  'azuro',
  'funfair-b2b-platform',
  'kingtiger-casino',
  'stake-dot-com',
  'bustabit',
  'wink-gaming-platform',
  'polymarket-international',
  'rollbit-dot-com',
  'augur-protocol-reboot',
  'zkasino-alleged-platform',
  'bc-game-curacao-small-house',
  'bitcasino-dot-io',
  'roobet-dot-com',
  'etheroll-dice-game',
  'wagerr-consumer-sportsbook',
  'virtue-poker-consumer-platform',
]);

function migrationDocument() {
  const match = waveMigration.match(
    /-- canonical-payload-start[\s\S]*?VALUES \('([\s\S]*?)'\);\n-- canonical-payload-end/,
  );
  if (!match) throw new Error('0042 canonical payload not found');
  return JSON.parse(match[1].replaceAll("''", "'"));
}

function createFixture() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec(schemaMigration);
  return database;
}

function tableSnapshot(database, table, orderBy) {
  return database.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all();
}

let database;

afterEach(() => {
  database?.close();
  database = undefined;
});

describe('casino Wave-6 forensic dossiers', () => {
  it('keeps migration parity and adds five non-overlapping cases', () => {
    expect(migrationDocument()).toEqual(document);
    expect(document.schema).toBe('casino-wave6-v1');
    expect(document.analysis_version).toBe('forensic-analysis-v1');
    expect(document.cases.map((entry) => entry.case.case_id)).toEqual(expectedIds);
    expect(document.cases.map((entry) => entry.case.outcome_label)).toEqual([
      'successful',
      'successful',
      'middling',
      'successful',
      'successful',
    ]);
    expect(expectedIds.some((caseId) => publishedIds.has(caseId))).toBe(false);
    expect(publishedIds.size).toBe(19);
  });

  it('passes the citation, freshness, scope and forensic quality gate', () => {
    for (const entry of document.cases) {
      expect(validateForensicAnalysis(entry.forensic_analysis), entry.case.case_id).toEqual({
        errors: [],
        warnings: [],
        withheld_sections: [],
      });
      expect(entry.case.status_as_of).toBe('2026-07-29');
      expect(entry.case.outcome_as_of).toBe('2026-07-29');
      expect(entry.case.quality_passed).toBe(1);
      expect(entry.case.human_review_required).toBe(0);
      expect(entry.case.product_scope_note.length).toBeGreaterThan(100);
      expect(entry.forensic_analysis.review).toEqual(expect.objectContaining({
        status: 'current',
        last_reviewed_at: '2026-07-29',
        next_review_at: '2026-08-05',
      }));
      expect(entry.forensic_analysis.why.source_refs.length).toBeGreaterThan(0);
      expect(entry.forensic_analysis.strategic_choices.length).toBeGreaterThan(0);
      expect(entry.forensic_analysis.counterfactual.source_refs.length).toBeGreaterThan(0);
      expect(entry.forensic_analysis.watch.length).toBeGreaterThan(0);
      expect(entry.forensic_analysis.unknowns.length).toBeGreaterThan(0);

      const sourceUrls = new Set(entry.sources.map((source) => source.canonical_url));
      for (const source of entry.sources) {
        expect(source.canonical_url).toMatch(/^https:\/\//);
        expect(source.resolving).toBe(1);
        expect(source.evidence_reviewed).toBe(1);
        expect(source.evidence_reviewed_at).toBe('2026-07-29');
      }
      for (const claim of entry.claims) {
        expect(entry.sources.some((source) => source.source_id === claim.source_id)).toBe(true);
      }
      for (const ref of entry.forensic_analysis.outcome.source_refs) {
        expect(sourceUrls.has(ref)).toBe(true);
      }
    }
  });

  it('normalizes every evidence section and remains idempotent', () => {
    database = createFixture();
    database.exec(waveMigration);

    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM casino_cases
      WHERE cohort_id = 'web3-casino-wave6-2026-07-29'
    `).get().count).toBe(5);
    expect(database.prepare('SELECT COUNT(*) AS count FROM casino_sources').get().count).toBe(14);
    expect(database.prepare('SELECT COUNT(*) AS count FROM casino_claims').get().count).toBe(20);
    expect(database.prepare('SELECT COUNT(*) AS count FROM casino_licences').get().count).toBe(2);
    expect(database.prepare('SELECT COUNT(*) AS count FROM casino_observations').get().count).toBe(7);
    expect(database.prepare('SELECT COUNT(*) AS count FROM casino_events').get().count).toBe(6);
    expect(database.prepare('SELECT COUNT(*) AS count FROM casino_syntheses').get().count).toBe(5);

    for (const entry of document.cases) {
      const row = database.prepare(`
        SELECT c.*, s.outlook
        FROM casino_cases AS c
        JOIN casino_syntheses AS s USING (case_id)
        WHERE c.case_id = ?
      `).get(entry.case.case_id);
      expect(row.quality_passed).toBe(1);
      expect(row.outcome_label).toBe(entry.case.outcome_label);
      expect(JSON.parse(row.outlook).forensic_analysis).toEqual(entry.forensic_analysis);
    }

    expect(database.prepare(`
      SELECT * FROM casino_coverage
      WHERE cohort_id = 'web3-casino-wave6-2026-07-29'
    `).get()).toMatchObject({
      target_count: 5,
      quality_passed_count: 5,
      partial_count: 0,
      missing_count: 0,
      methodology_version: 'casino-wave6-v1+forensic-analysis-v1',
    });

    const tables = [
      ['casino_cases', 'case_id'],
      ['casino_sources', 'source_id'],
      ['casino_claims', 'claim_id'],
      ['casino_licences', 'licence_observation_id'],
      ['casino_observations', 'observation_id'],
      ['casino_events', 'event_id'],
      ['casino_syntheses', 'case_id'],
      ['casino_coverage', 'cohort_id'],
    ];
    const beforeSecondRun = Object.fromEntries(
      tables.map(([table, orderBy]) => [table, tableSnapshot(database, table, orderBy)]),
    );
    database.exec(waveMigration);
    for (const [table, orderBy] of tables) {
      expect(tableSnapshot(database, table, orderBy)).toEqual(beforeSecondRun[table]);
    }
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM sqlite_master
      WHERE type = 'table' AND name = 'casino_wave6_payload_0042'
    `).get().count).toBe(0);
  });

  it('preserves explicit operator, token, chain and legal boundaries', () => {
    database = createFixture();
    database.exec(waveMigration);

    const scopes = Object.fromEntries(database.prepare(`
      SELECT case_id, product_scope_note FROM casino_cases
      WHERE cohort_id = 'web3-casino-wave6-2026-07-29'
    `).all().map((row) => [row.case_id, row.product_scope_note]));

    expect(scopes['cloudbet-dot-com']).toContain('payment-processing subsidiary');
    expect(scopes['cloudbet-dot-com']).toContain('deposit and withdrawal rails');
    expect(scopes['shuffle-dot-com']).toContain('not public-chain execution of every wager');
    expect(scopes['betfury-bfg-ecosystem']).toContain('withholds a current legal-operator');
    expect(scopes['winr-protocol-bankroll']).toContain('does not treat protocol contracts as a gambling licence');
    expect(scopes['betswirl-onchain-casino']).toContain('excludes Azuro-integrated sportsbook economics');
  });
});

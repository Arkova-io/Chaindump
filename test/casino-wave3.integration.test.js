import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const document = JSON.parse(readFileSync(
  new URL('../docs/casino-wave3-2026-07-29.json', import.meta.url),
  'utf8',
));
const schemaMigration = readFileSync(
  new URL('../migrations/0014_casino_analysis.sql', import.meta.url),
  'utf8',
);
const waveMigration = readFileSync(
  new URL('../migrations/0033_casino_wave3.sql', import.meta.url),
  'utf8',
);

function migrationDocument() {
  const match = waveMigration.match(
    /-- canonical-payload-start[\s\S]*?VALUES \('([\s\S]*?)'\);\n-- canonical-payload-end/,
  );
  if (!match) throw new Error('0033 canonical payload not found');
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

describe('casino Wave-3 forensic dossiers', () => {
  it('keeps the generated migration payload identical to the canonical document', () => {
    expect(migrationDocument()).toEqual(document);
    expect(document.cases.map((entry) => entry.case.case_id)).toEqual([
      'funfair-b2b-platform',
      'kingtiger-casino',
      'stake-dot-com',
      'bustabit',
      'wink-gaming-platform',
    ]);
    expect(document.cases.map((entry) => entry.case.outcome_label)).toEqual([
      'failed',
      'failed',
      'successful',
      'successful',
      'middling',
    ]);
  });

  it('passes every case through the forensic-analysis-v1 evidence gate', () => {
    for (const entry of document.cases) {
      expect(
        validateForensicAnalysis(entry.forensic_analysis),
        entry.case.case_id,
      ).toEqual({
        errors: [],
        warnings: [],
        withheld_sections: [],
      });

      expect(entry.case.status_as_of).toBe('2026-07-29');
      expect(entry.case.outcome_as_of).toBe('2026-07-29');
      expect(entry.case.quality_passed).toBe(1);
      expect(entry.forensic_analysis.why.source_refs.length).toBeGreaterThan(0);
      expect(entry.forensic_analysis.strategic_choices.length).toBeGreaterThan(0);
      expect(entry.forensic_analysis.counterfactual.source_refs.length).toBeGreaterThan(0);
      expect(entry.forensic_analysis.watch.length).toBeGreaterThan(0);
      expect(entry.forensic_analysis.unknowns.length).toBeGreaterThan(0);

      for (const source of entry.sources) {
        expect(source.canonical_url).toMatch(/^https:\/\//);
        expect(source.resolving).toBe(1);
        expect(source.evidence_reviewed).toBe(1);
      }
    }
  });

  it('publishes normalized evidence, embeds the forensic profile, and is idempotent', () => {
    database = createFixture();
    database.exec(waveMigration);

    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM casino_cases
      WHERE cohort_id = 'web3-casino-wave3-2026-07-29'
    `).get().count).toBe(5);
    expect(database.prepare('SELECT COUNT(*) AS count FROM casino_sources').get().count).toBe(24);
    expect(database.prepare('SELECT COUNT(*) AS count FROM casino_claims').get().count).toBe(27);
    expect(database.prepare('SELECT COUNT(*) AS count FROM casino_licences').get().count).toBe(2);
    expect(database.prepare('SELECT COUNT(*) AS count FROM casino_observations').get().count).toBe(5);
    expect(database.prepare('SELECT COUNT(*) AS count FROM casino_events').get().count).toBe(8);
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
      WHERE cohort_id = 'web3-casino-wave3-2026-07-29'
    `).get()).toMatchObject({
      target_count: 5,
      quality_passed_count: 5,
      partial_count: 0,
      missing_count: 0,
      methodology_version: 'casino-wave3-v1+forensic-analysis-v1',
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
      SELECT COUNT(*) AS count
      FROM sqlite_master
      WHERE type = 'table' AND name = 'casino_wave3_payload_0033'
    `).get().count).toBe(0);
  });

  it('preserves product/token/entity scope and the Stake licence conflict', () => {
    database = createFixture();
    database.exec(waveMigration);

    const funfair = database.prepare(`
      SELECT product_scope_note, status, outcome_label
      FROM casino_cases WHERE case_id = 'funfair-b2b-platform'
    `).get();
    expect(funfair).toMatchObject({ status: 'superseded', outcome_label: 'failed' });
    expect(funfair.product_scope_note).toContain('does not classify FunFair Technologies Ltd');
    expect(funfair.product_scope_note).toContain('FUNToken');

    const kingTiger = database.prepare(`
      SELECT product_scope_note, status, outcome_label
      FROM casino_cases WHERE case_id = 'kingtiger-casino'
    `).get();
    expect(kingTiger).toMatchObject({ status: 'inactive', outcome_label: 'failed' });
    expect(kingTiger.product_scope_note).toContain('casino frontend');
    expect(kingTiger.product_scope_note).toContain('wallet balances');

    const wink = database.prepare(`
      SELECT product_scope_note, status, outcome_label
      FROM casino_cases WHERE case_id = 'wink-gaming-platform'
    `).get();
    expect(wink).toMatchObject({ status: 'superseded', outcome_label: 'middling' });
    expect(wink.product_scope_note).toContain('surviving WIN token');
    expect(wink.product_scope_note).toContain('WINkLink oracle network');

    const stakeLicence = database.prepare(`
      SELECT licence_status, valid_until, notes
      FROM casino_licences
      WHERE licence_observation_id = 'casino:licence:stake:curacao:2026-06-26'
    `).get();
    expect(stakeLicence).toMatchObject({
      licence_status: 'expired',
      valid_until: '2026-06-09',
    });
    expect(stakeLicence.notes).toContain('Assessment in progress');
    expect(stakeLicence.notes).toContain("Stake's current terms call the same licence active");
  });
});

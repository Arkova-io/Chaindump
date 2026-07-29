import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const document = JSON.parse(readFileSync(
  new URL('../docs/exchange-wave1-2026-07-29.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0032_exchange_wave1_forensic_analysis.sql', import.meta.url),
  'utf8',
);

function migrationDocument() {
  const match = migration.match(
    /-- canonical-payload-start[\s\S]*?VALUES \('([\s\S]*?)'\)\n\)\nINSERT OR REPLACE/,
  );
  if (!match) throw new Error('0032 canonical payload not found');
  return JSON.parse(match[1].replaceAll("''", "'"));
}

function createFixture() {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE successful_exchanges (
      slug TEXT NOT NULL,
      type TEXT NOT NULL,
      profile TEXT,
      updated_at TEXT,
      PRIMARY KEY (type, slug)
    );
    CREATE TABLE dead_exchanges (
      slug TEXT NOT NULL,
      kind TEXT NOT NULL,
      profile TEXT,
      updated_at TEXT,
      PRIMARY KEY (kind, slug)
    );
    INSERT INTO successful_exchanges VALUES
      ('curve-finance', 'dex', '{"preserved":"curve-finance"}', 'old'),
      ('dydx', 'dex', '{"preserved":"dydx"}', 'old'),
      ('untouched-success', 'dex', '{"preserved":"untouched"}', 'old');
    INSERT INTO dead_exchanges VALUES
      ('gmx-v1', 'dex', '{"preserved":"gmx-v1"}', 'old'),
      ('mt-gox', 'cex', '{"preserved":"mt-gox"}', 'old'),
      ('quadrigacx', 'cex', '{"preserved":"quadrigacx"}', 'old'),
      ('untouched-dead', 'cex', '{"preserved":"untouched"}', 'old');
  `);
  return database;
}

let database;

afterEach(() => {
  database?.close();
  database = undefined;
});

describe('exchange forensic Wave-1', () => {
  it('keeps migration payload identical to the canonical research document', () => {
    expect(migrationDocument()).toEqual(document);
    expect(document.cases.map(({ slug }) => slug)).toEqual([
      'curve-finance',
      'dydx',
      'gmx-v1',
      'mt-gox',
      'quadrigacx',
    ]);
    expect(document.cases.map(({ forensic_analysis: analysis }) => (
      analysis.outcome.label
    ))).toEqual([
      'successful',
      'successful',
      'dead',
      'dead',
      'dead',
    ]);
  });

  it('passes every case through the forensic-analysis-v1 publication gate', () => {
    for (const entry of document.cases) {
      expect(
        validateForensicAnalysis(entry.forensic_analysis),
        entry.slug,
      ).toEqual({
        errors: [],
        warnings: [],
        withheld_sections: [],
      });
    }
  });

  it('attaches each analysis, preserves profile data, and replays idempotently', () => {
    database = createFixture();

    database.exec(migration);
    const afterFirstRun = Object.fromEntries(document.cases.map((entry) => {
      const kindColumn = entry.table === 'successful_exchanges' ? 'type' : 'kind';
      const row = database.prepare(`
        SELECT profile, updated_at
        FROM ${entry.table}
        WHERE slug = ? AND ${kindColumn} = ?
      `).get(entry.slug, entry.kind);
      const profile = JSON.parse(row.profile);
      expect(profile.preserved).toBe(entry.slug);
      expect(profile.forensic_analysis).toEqual(entry.forensic_analysis);
      expect(row.updated_at).toBe('2026-07-29');
      return [entry.slug, row.profile];
    }));

    database.exec(migration);
    for (const entry of document.cases) {
      const kindColumn = entry.table === 'successful_exchanges' ? 'type' : 'kind';
      const row = database.prepare(`
        SELECT profile
        FROM ${entry.table}
        WHERE slug = ? AND ${kindColumn} = ?
      `).get(entry.slug, entry.kind);
      expect(row.profile).toBe(afterFirstRun[entry.slug]);
    }

    expect(database.prepare(`
      SELECT profile, updated_at
      FROM successful_exchanges
      WHERE slug = 'untouched-success'
    `).get()).toEqual({
      profile: '{"preserved":"untouched"}',
      updated_at: 'old',
    });
    expect(database.prepare(`
      SELECT profile, updated_at
      FROM dead_exchanges
      WHERE slug = 'untouched-dead'
    `).get()).toEqual({
      profile: '{"preserved":"untouched"}',
      updated_at: 'old',
    });
    expect(database.prepare(`
      SELECT COUNT(*) AS count
      FROM sqlite_master
      WHERE type = 'table' AND name = 'exchange_wave1_forensic_0032'
    `).get().count).toBe(0);
  });
});

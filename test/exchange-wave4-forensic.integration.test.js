import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const document = JSON.parse(readFileSync(
  new URL('../docs/exchange-wave4-2026-07-29.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0038_exchange_wave4_forensic_analysis.sql', import.meta.url),
  'utf8',
);

function migrationDocument() {
  const match = migration.match(
    /-- canonical-payload-start[\s\S]*?VALUES \('([\s\S]*?)'\)\n\)\nINSERT OR REPLACE/,
  );
  if (!match) throw new Error('0038 canonical payload not found');
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
    CREATE TABLE mid_exchanges (
      slug TEXT NOT NULL,
      kind TEXT NOT NULL,
      profile TEXT,
      updated_at TEXT,
      PRIMARY KEY (kind, slug)
    );
    CREATE TABLE dead_exchanges (
      slug TEXT NOT NULL,
      kind TEXT NOT NULL,
      profile TEXT,
      updated_at TEXT,
      PRIMARY KEY (kind, slug)
    );
    INSERT INTO successful_exchanges VALUES
      ('meteora', 'dex', '{"preserved":"meteora"}', 'old'),
      ('untouched-success', 'dex', '{"preserved":"untouched"}', 'old');
    INSERT INTO mid_exchanges VALUES
      ('bancor', 'dex', '{"preserved":"bancor"}', 'old'),
      ('okx', 'cex', '{"preserved":"okx"}', 'old'),
      ('untouched-mid', 'dex', '{"preserved":"untouched"}', 'old');
    INSERT INTO dead_exchanges VALUES
      ('kyberswap', 'dex', '{"preserved":"kyberswap"}', 'old'),
      ('cryptopia', 'cex', '{"preserved":"cryptopia"}', 'old'),
      ('untouched-dead', 'cex', '{"preserved":"untouched"}', 'old');
  `);
  return database;
}

let database;

afterEach(() => {
  database?.close();
  database = undefined;
});

describe('exchange forensic Wave-4', () => {
  it('keeps migration payload identical to the canonical research document', () => {
    expect(migrationDocument()).toEqual(document);
    expect(document.cases.map(({ slug }) => slug)).toEqual([
      'meteora',
      'bancor',
      'okx',
      'kyberswap',
      'cryptopia',
    ]);
    expect(document.cases.map(({ forensic_analysis: analysis }) => (
      analysis.outcome.label
    ))).toEqual([
      'successful',
      'middling',
      'middling',
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

    for (const [table, slug] of [
      ['successful_exchanges', 'untouched-success'],
      ['mid_exchanges', 'untouched-mid'],
      ['dead_exchanges', 'untouched-dead'],
    ]) {
      expect(database.prepare(`
        SELECT profile, updated_at
        FROM ${table}
        WHERE slug = ?
      `).get(slug)).toEqual({
        profile: '{"preserved":"untouched"}',
        updated_at: 'old',
      });
    }
    expect(database.prepare(`
      SELECT COUNT(*) AS count
      FROM sqlite_master
      WHERE type = 'table' AND name = 'exchange_wave4_forensic_0038'
    `).get().count).toBe(0);
  });
});

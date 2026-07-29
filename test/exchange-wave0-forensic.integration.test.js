import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const document = JSON.parse(readFileSync(
  new URL('../docs/exchange-wave0-2026-07-29.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0030_exchange_wave0_forensic_analysis.sql', import.meta.url),
  'utf8',
);

function migrationDocument() {
  const match = migration.match(
    /-- canonical-payload-start[\s\S]*?VALUES \('([\s\S]*?)'\)\n\)\nINSERT OR REPLACE/,
  );
  if (!match) throw new Error('0030 canonical payload not found');
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
      ('uniswap', 'dex', '{"preserved":"uniswap"}', 'old'),
      ('hyperliquid', 'dex', '{"preserved":"hyperliquid"}', 'old'),
      ('untouched-success', 'dex', '{"preserved":"untouched"}', 'old');
    INSERT INTO mid_exchanges VALUES
      ('sushiswap', 'dex', '{"preserved":"sushiswap"}', 'old');
    INSERT INTO dead_exchanges VALUES
      ('ftx', 'cex', '{"preserved":"ftx"}', 'old'),
      ('ascendex', 'cex', '{"preserved":"ascendex"}', 'old');
  `);
  return database;
}

let database;

afterEach(() => {
  database?.close();
  database = undefined;
});

describe('exchange forensic Wave-0', () => {
  it('keeps the generated migration payload identical to the canonical research document', () => {
    expect(migrationDocument()).toEqual(document);
    expect(document.cases.map(({ slug }) => slug)).toEqual([
      'uniswap',
      'hyperliquid',
      'sushiswap',
      'ftx',
      'ascendex',
    ]);
  });

  it('passes every case through the implemented forensic-analysis-v1 publication gate', () => {
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

  it('attaches each analysis, preserves existing profile fields, and is idempotent', () => {
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
      SELECT COUNT(*) AS count
      FROM sqlite_master
      WHERE type = 'table' AND name = 'exchange_wave0_forensic_0030'
    `).get().count).toBe(0);
  });
});

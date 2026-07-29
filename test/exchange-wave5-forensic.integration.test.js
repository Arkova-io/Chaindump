import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const document = JSON.parse(readFileSync(
  new URL('../docs/exchange-wave5-2026-07-29.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0052_exchange_wave5_forensic_analysis.sql', import.meta.url),
  'utf8',
);

function migrationDocument() {
  const match = migration.match(
    /-- canonical-payload-start[\s\S]*?VALUES \('([\s\S]*?)'\)\n\)\nINSERT OR REPLACE/,
  );
  if (!match) throw new Error('0052 canonical payload not found');
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
      ('raydium', 'dex', '{"preserved":"raydium"}', 'old'),
      ('untouched-success', 'dex', '{"preserved":"untouched"}', 'old');
    INSERT INTO mid_exchanges VALUES
      ('dodo-amm', 'dex', '{"preserved":"dodo-amm"}', 'old'),
      ('spookyswap', 'dex', '{"preserved":"spookyswap"}', 'old');
    INSERT INTO dead_exchanges VALUES
      ('bunni', 'dex', '{"preserved":"bunni"}', 'old'),
      ('saddle-finance', 'dex', '{"preserved":"saddle-finance"}', 'old'),
      ('serum', 'dex', '{"preserved":"serum"}', 'old'),
      ('mirror-protocol', 'dex', '{"preserved":"mirror-protocol"}', 'old'),
      ('uranium-finance', 'dex', '{"preserved":"uranium-finance"}', 'old');
  `);
  return database;
}

function fetchExchangeRow(database, table, slug, kind) {
  switch (table) {
    case 'successful_exchanges':
      return database.prepare(`
        SELECT profile, updated_at
        FROM successful_exchanges
        WHERE slug = ? AND type = ?
      `).get(slug, kind);
    case 'mid_exchanges':
      return database.prepare(`
        SELECT profile, updated_at
        FROM mid_exchanges
        WHERE slug = ? AND kind = ?
      `).get(slug, kind);
    case 'dead_exchanges':
      return database.prepare(`
        SELECT profile, updated_at
        FROM dead_exchanges
        WHERE slug = ? AND kind = ?
      `).get(slug, kind);
    default:
      throw new Error(`Unsupported exchange table: ${table}`);
  }
}

function applyCorpusMigrations(database) {
  const migrationDirectory = new URL('../migrations/', import.meta.url);
  const files = readdirSync(migrationDirectory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .filter((file) => Number(file.slice(0, 4)) <= 52)
    .sort();

  for (const file of files) {
    database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
}

let database;

afterEach(() => {
  database?.close();
  database = undefined;
});

describe('exchange forensic Wave-5', () => {
  it('keeps the generated migration payload identical to the cited research document', () => {
    expect(migrationDocument()).toEqual(document);
    expect(document.cases.map(({ slug }) => slug)).toEqual([
      'raydium',
      'dodo-amm',
      'spookyswap',
      'bunni',
      'saddle-finance',
      'serum',
      'mirror-protocol',
      'uranium-finance',
    ]);
    expect(document.cases.every(({ kind }) => kind === 'dex')).toBe(true);
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
      const row = fetchExchangeRow(
        database,
        entry.table,
        entry.slug,
        entry.kind,
      );
      const profile = JSON.parse(row.profile);
      expect(profile.preserved).toBe(entry.slug);
      expect(profile.forensic_analysis).toEqual(entry.forensic_analysis);
      expect(row.updated_at).toBe('2026-07-29');
      return [entry.slug, row.profile];
    }));

    database.exec(migration);
    for (const entry of document.cases) {
      const row = fetchExchangeRow(
        database,
        entry.table,
        entry.slug,
        entry.kind,
      );
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
      FROM sqlite_temp_master
      WHERE type = 'table' AND name = 'exchange_wave5_forensic_0052'
    `).get().count).toBe(0);
  });

  it('brings the complete migration corpus to at least 25 publication-gated DEX analyses', () => {
    database = new DatabaseSync(':memory:');
    applyCorpusMigrations(database);

    const rows = database.prepare(`
      SELECT type AS kind, slug, profile FROM successful_exchanges
      UNION ALL
      SELECT kind, slug, profile FROM mid_exchanges
      UNION ALL
      SELECT kind, slug, profile FROM dead_exchanges
    `).all().filter((row) => row.kind === 'dex');
    const forensicRows = rows.filter((row) => {
      const profile = JSON.parse(row.profile || '{}');
      return profile.forensic_analysis?.version === 'forensic-analysis-v1';
    });

    expect(rows.length).toBeGreaterThanOrEqual(29);
    expect(forensicRows.length).toBeGreaterThanOrEqual(25);
    for (const row of forensicRows) {
      expect(
        validateForensicAnalysis(JSON.parse(row.profile).forensic_analysis),
        row.slug,
      ).toEqual({
        errors: [],
        warnings: [],
        withheld_sections: [],
      });
    }
  });
});

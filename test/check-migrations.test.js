import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkMigrationsDir } from '../scripts/check-migrations.mjs';

// Regression coverage for the 0007_mid_chains_stuck.sql incident: a migration
// comment that merely *mentioned* "BEGIN TRANSACTION" (to say it had none) broke
// `wrangler d1 migrations apply --local` for every fresh environment, because
// wrangler's own multi-transaction guard is a raw substring search over the whole
// file, not a SQL parser — it can't tell a comment from a real statement.

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'migrations-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(name, contents) {
  writeFileSync(join(dir, name), contents);
}

describe('checkMigrationsDir', () => {
  it('passes a clean, sequential set of migrations', () => {
    write('0001_init.sql', "INSERT INTO t (a) VALUES ('x');");
    write('0002_more.sql', "INSERT INTO t (a) VALUES ('y');");

    const { errors, files } = checkMigrationsDir(dir);

    expect(errors).toEqual([]);
    expect(files).toEqual(['0001_init.sql', '0002_more.sql']);
  });

  it('flags a gap or out-of-order sequence number', () => {
    write('0001_init.sql', "INSERT INTO t (a) VALUES ('x');");
    write('0003_skip.sql', "INSERT INTO t (a) VALUES ('y');");

    const { errors } = checkMigrationsDir(dir);

    expect(errors).toEqual([expect.stringContaining('0003_skip.sql')]);
  });

  it('flags a filename missing the 4-digit sequence prefix', () => {
    write('not-numbered.sql', "INSERT INTO t (a) VALUES ('x');");

    const { errors } = checkMigrationsDir(dir);

    expect(errors).toEqual([expect.stringContaining('must start with a 4-digit sequence')]);
  });

  it('flags a real explicit BEGIN TRANSACTION / COMMIT wrapper', () => {
    write('0001_explicit_txn.sql', "BEGIN TRANSACTION;\nINSERT INTO t (a) VALUES ('x');\nCOMMIT;");

    const { errors } = checkMigrationsDir(dir);

    expect(errors).toEqual([expect.stringContaining('0001_explicit_txn.sql')]);
  });

  it('flags "BEGIN TRANSACTION" even when it only appears in a comment (the 0007 bug)', () => {
    // This is the exact shape of the original bug: no real explicit transaction,
    // just a comment noting the absence of one — which is enough to trip
    // wrangler's raw substring check and break `d1 migrations apply --local`.
    write(
      '0001_comment_only.sql',
      "-- No BEGIN TRANSACTION / COMMIT (D1 wraps --file execution).\nINSERT INTO t (a) VALUES ('x');",
    );

    const { errors } = checkMigrationsDir(dir);

    expect(errors).toEqual([expect.stringContaining('0001_comment_only.sql')]);
  });

  it('does not flag a comment that avoids the exact "BEGIN TRANSACTION" phrase', () => {
    write(
      '0001_reworded.sql',
      "-- No manual transaction wrapper — D1 wraps --file execution in its own.\nINSERT INTO t (a) VALUES ('x');",
    );

    const { errors } = checkMigrationsDir(dir);

    expect(errors).toEqual([]);
  });

  it('flags TEMP staging tables that Cloudflare D1 rejects remotely', () => {
    write(
      '0001_temp_table.sql',
      'CREATE TEMP TABLE migration_stage (id INTEGER);\nDROP TABLE migration_stage;',
    );

    const { errors } = checkMigrationsDir(dir);

    expect(errors).toEqual([expect.stringContaining('CREATE TEMP TABLE')]);
  });

  it('accepts a normal staging table bracketed by DROP statements', () => {
    write(
      '0001_staging_table.sql',
      'DROP TABLE IF EXISTS migration_stage;\nCREATE TABLE migration_stage (id INTEGER);\nDROP TABLE migration_stage;',
    );

    const { errors } = checkMigrationsDir(dir);

    expect(errors).toEqual([]);
  });
});

describe('the real migrations/ directory', () => {
  it('has no numbering gaps, forbidden transaction text, or D1-incompatible TEMP tables', () => {
    const { errors } = checkMigrationsDir('migrations');

    expect(errors).toEqual([]);
  });
});

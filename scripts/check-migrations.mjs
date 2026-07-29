#!/usr/bin/env node
// Migration guard — run in CI and locally before adding a migration.
//
// Enforces the rules that have actually bitten this project (CLAUDE.md §3.4):
//   1. Sequential, gap-free, unique NNNN_ numbering.
//   2. No literal "BEGIN TRANSACTION" / "COMMIT;" text anywhere in the file —
//      `wrangler d1 migrations apply` wraps each migration in its own transaction,
//      and its multi-transaction guard (src/d1/trimmer.ts) does a raw substring
//      search, not real SQL parsing. It doesn't strip comments or string literals,
//      so even a comment that merely *mentions* "BEGIN TRANSACTION" (e.g. to say a
//      migration doesn't use one) trips the same "several transactions" error as a
//      real one. 0007_mid_chains_stuck.sql hit exactly this — its own comment said
//      "No BEGIN TRANSACTION / COMMIT" and that phrase alone broke
//      `wrangler d1 migrations apply --local` for every fresh environment. Fixed by
//      rewording the comment; the rule below is what would have caught it.
//   3. No TEMP tables. Cloudflare D1's remote query authorizer rejects
//      CREATE TEMP TABLE with SQLITE_AUTH even though local SQLite accepts it.
//      Generated staging tables must use a normal table bracketed by DROP TABLE.
//   4. Keep every SQL statement below a conservative 95 KB. D1 rejects larger
//      statements with SQLITE_TOOBIG even when the migration file itself is valid.
//      Research waves must emit one bounded statement per dossier.
//
// Migrations 0001–0009 predate this guard and were loaded out-of-band (0001 is a
// bulk backup dump). None of them actually contain the literal text this guard
// checks for, so no exemption is needed — the rule applies uniformly to every
// migration in the directory.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const TRANSACTION_TEXT_RE = /\bBEGIN\s+TRANSACTION\b|\bCOMMIT\s*;/i;
const TEMP_TABLE_RE = /\bCREATE\s+TEMP(?:ORARY)?\s+TABLE\b/i;
export const MAX_D1_STATEMENT_BYTES = 95_000;

export function sqlStatementByteLengths(sql) {
  const lengths = [];
  let statementStart = 0;
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];

    if (inLineComment) {
      if (current === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (current === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      if (current === "'" && next === "'") {
        index += 1;
      } else if (current === "'") {
        inString = false;
      }
      continue;
    }
    if (current === '-' && next === '-') {
      inLineComment = true;
      index += 1;
    } else if (current === '/' && next === '*') {
      inBlockComment = true;
      index += 1;
    } else if (current === "'") {
      inString = true;
    } else if (current === ';') {
      lengths.push(Buffer.byteLength(sql.slice(statementStart, index + 1), 'utf8'));
      statementStart = index + 1;
    }
  }

  if (sql.slice(statementStart).trim()) {
    lengths.push(Buffer.byteLength(sql.slice(statementStart), 'utf8'));
  }
  return lengths;
}

export function checkMigrationsDir(dir) {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const errors = [];

  // Rule 1: numbering is sequential and gap-free starting at 0001.
  files.forEach((f, i) => {
    const m = /^(\d{4})_/.exec(f);
    if (!m) {
      errors.push(`${f}: filename must start with a 4-digit sequence like 0010_name.sql`);
      return;
    }
    const expected = String(i + 1).padStart(4, '0');
    if (m[1] !== expected) {
      errors.push(`${f}: out-of-order or gap in numbering (expected ${expected}_…)`);
    }
  });

  // Rules 2 and 3 inspect raw migration text. The transaction check must include
  // comments because Wrangler's own check does; the TEMP-table check is also raw
  // so generated migrations cannot silently reintroduce a remote-only failure.
  for (const f of files) {
    const sql = readFileSync(join(dir, f), 'utf8');
    if (TRANSACTION_TEXT_RE.test(sql)) {
      errors.push(
        `${f}: contains the literal text "BEGIN TRANSACTION" or "COMMIT;" (even in a ` +
          `comment) — wrangler's multi-transaction guard does a raw substring search ` +
          `and will fail with "several transactions" on \`wrangler d1 migrations apply\`. ` +
          `Reword to avoid that exact phrase.`,
      );
    }
    if (TEMP_TABLE_RE.test(sql)) {
      errors.push(
        `${f}: contains CREATE TEMP TABLE, which Cloudflare D1 rejects remotely with ` +
          `SQLITE_AUTH. Use a normal staging table with DROP TABLE before and after it.`,
      );
    }
    const largestStatement = Math.max(0, ...sqlStatementByteLengths(sql));
    if (largestStatement > MAX_D1_STATEMENT_BYTES) {
      errors.push(
        `${f}: contains a ${largestStatement}-byte SQL statement; Cloudflare D1 rejects ` +
          `oversized statements with SQLITE_TOOBIG. Keep each statement at or below ` +
          `${MAX_D1_STATEMENT_BYTES} bytes by batching one dossier per statement.`,
      );
    }
  }

  return { files, errors };
}

function main() {
  const { files, errors } = checkMigrationsDir('migrations');
  if (errors.length) {
    console.error('Migration guard failed:\n' + errors.map((e) => '  ✗ ' + e).join('\n'));
    process.exit(1);
  }
  console.log(`Migration guard passed: ${files.length} migration(s) OK.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

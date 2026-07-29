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

function isWordCharacter(character) {
  return (
    character === '_'
    || (character >= 'A' && character <= 'Z')
    || (character >= 'a' && character <= 'z')
    || (character >= '0' && character <= '9')
  );
}

function skipDelimitedToken(sql, start, delimiter) {
  for (let index = start + 1; index < sql.length; index += 1) {
    if (sql[index] !== delimiter) continue;
    if (sql[index + 1] === delimiter) {
      index += 1;
      continue;
    }
    return index + 1;
  }
  return sql.length;
}

function nextSqlToken(sql, start) {
  const current = sql[start];
  const next = sql[start + 1];
  if (current === "'" || current === '"' || current === '`') {
    return { kind: 'ignored', end: skipDelimitedToken(sql, start, current) };
  }
  if (current === '[') {
    const closing = sql.indexOf(']', start + 1);
    return { kind: 'ignored', end: closing === -1 ? sql.length : closing + 1 };
  }
  if (current === '-' && next === '-') {
    const newline = sql.indexOf('\n', start + 2);
    return { kind: 'ignored', end: newline === -1 ? sql.length : newline + 1 };
  }
  if (current === '/' && next === '*') {
    const closing = sql.indexOf('*/', start + 2);
    return { kind: 'ignored', end: closing === -1 ? sql.length : closing + 2 };
  }
  if (current === ';') return { kind: 'semicolon', end: start + 1 };
  if (!isWordCharacter(current) || (current >= '0' && current <= '9')) {
    return { kind: 'ignored', end: start + 1 };
  }
  let end = start + 1;
  while (end < sql.length && isWordCharacter(sql[end])) end += 1;
  return { kind: 'word', word: sql.slice(start, end).toUpperCase(), end };
}

function beginsTrigger(prefixWords) {
  return (
    prefixWords[0] === 'CREATE'
    && (
      prefixWords[1] === 'TRIGGER'
      || (
        ['TEMP', 'TEMPORARY'].includes(prefixWords[1])
        && prefixWords[2] === 'TRIGGER'
      )
    )
  );
}

function nextTriggerState(state, word) {
  if (!state.active) return state;
  if (!state.bodyStarted) {
    return word === 'BEGIN' ? { ...state, bodyStarted: true, depth: 1 } : state;
  }
  if (word === 'BEGIN' || word === 'CASE') return { ...state, depth: state.depth + 1 };
  if (word === 'END') return { ...state, depth: Math.max(0, state.depth - 1) };
  return state;
}

export function sqlStatementByteLengths(sql) {
  const lengths = [];
  let statementStart = 0;
  let prefixWords = [];
  let trigger = { active: false, bodyStarted: false, depth: 0 };

  for (let index = 0; index < sql.length;) {
    const token = nextSqlToken(sql, index);
    if (token.kind === 'word') {
      const { word } = token;
      if (prefixWords.length < 3) prefixWords.push(word);
      if (beginsTrigger(prefixWords)) trigger = { ...trigger, active: true };
      trigger = nextTriggerState(trigger, word);
      index = token.end;
      continue;
    }
    if (
      token.kind !== 'semicolon'
      || (trigger.active && (!trigger.bodyStarted || trigger.depth > 0))
    ) {
      index = token.end;
      continue;
    }
    const statementEnd = token.end;
    lengths.push(Buffer.byteLength(sql.slice(statementStart, statementEnd), 'utf8'));
    statementStart = statementEnd;
    prefixWords = [];
    trigger = { active: false, bodyStarted: false, depth: 0 };
    index = token.end;
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

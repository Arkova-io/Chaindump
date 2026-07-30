#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import {
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
} from 'node:path';
import {
  fileURLToPath,
  pathToFileURL,
} from 'node:url';
import {
  assessCasinoPublicationDepth,
  assessExchangePublicationDepth,
} from '../src/lib/publication-depth.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultDocumentPath = resolve(
  root,
  'docs/high-risk-evidence-remediation-2026-07-29.json',
);
const MIGRATION_ID = /^\d{4}$/;

function repositoryPath(requestedPath, label) {
  const candidate = resolve(root, requestedPath);
  const relation = relative(root, candidate);
  if (relation.startsWith('..') || isAbsolute(relation)) {
    throw new Error(`${label} must stay inside the repository`);
  }
  return candidate;
}
const EXCHANGE_TARGETS = Object.freeze({
  'dex:mid:sushiswap': {
    table: 'mid_exchanges',
    lifecycle: 'mid',
    kind: 'dex',
    kindColumn: 'kind',
    slug: 'sushiswap',
  },
  'dex:successful:aerodrome': {
    table: 'successful_exchanges',
    lifecycle: 'successful',
    kind: 'dex',
    kindColumn: 'type',
    slug: 'aerodrome',
  },
  'dex:dead:solidly': {
    table: 'dead_exchanges',
    lifecycle: 'dead',
    kind: 'dex',
    kindColumn: 'kind',
    slug: 'solidly',
  },
  'cex:dead:bitmart': {
    table: 'dead_exchanges',
    lifecycle: 'dead',
    kind: 'cex',
    kindColumn: 'kind',
    slug: 'bitmart',
  },
  'cex:mid:htx': {
    table: 'mid_exchanges',
    lifecycle: 'mid',
    kind: 'cex',
    kindColumn: 'kind',
    slug: 'htx',
  },
  'cex:successful:binance': {
    table: 'successful_exchanges',
    lifecycle: 'successful',
    kind: 'cex',
    kindColumn: 'type',
    slug: 'binance',
  },
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseJson(value, fallback = {}) {
  if (value == null) return structuredClone(fallback);
  if (typeof value === 'object') return structuredClone(value);
  try {
    return JSON.parse(value);
  } catch {
    return structuredClone(fallback);
  }
}

function quoteSql(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sourceId(source) {
  return source.id || source.source_id;
}

function sourceUrl(source) {
  return source.url || source.canonical_url;
}

function mergeSources(existingSources, additions, metadataPatches) {
  const result = asArray(existingSources).map((source) => ({ ...source }));
  const byId = new Map(result.map((source, index) => [sourceId(source), index]));
  const byUrl = new Map(result.map((source, index) => [sourceUrl(source), index]));

  for (const addition of asArray(additions)) {
    const existingIndex = byId.get(sourceId(addition)) ?? byUrl.get(sourceUrl(addition));
    if (existingIndex == null) {
      const index = result.push({ ...addition }) - 1;
      byId.set(sourceId(addition), index);
      byUrl.set(sourceUrl(addition), index);
    } else {
      result[existingIndex] = { ...result[existingIndex], ...addition };
    }
  }

  for (const patch of asArray(metadataPatches)) {
    const index = byId.get(sourceId(patch)) ?? byUrl.get(sourceUrl(patch));
    if (index == null) {
      throw new Error(`Cannot patch missing source ${sourceId(patch) || sourceUrl(patch)}`);
    }
    result[index] = { ...result[index], ...patch };
  }
  return result;
}

function pathTokens(path) {
  return path
    .replace(/^forensic_analysis\./, '')
    .replaceAll(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .map((token) => (/^\d+$/.test(token) ? Number(token) : token));
}

function sectionAt(analysis, path) {
  let cursor = analysis;
  for (const token of pathTokens(path)) {
    cursor = cursor?.[token];
  }
  if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
    throw new Error(`Forensic patch path does not resolve to a section: ${path}`);
  }
  return cursor;
}

function applyForensicPatches(profileOrOutlook, patches) {
  const analysis = profileOrOutlook.forensic_analysis;
  if (!analysis) throw new Error('Target has no forensic_analysis');
  for (const patch of asArray(patches)) {
    const section = sectionAt(analysis, patch.path);
    if (patch.replace_summary) section.summary = patch.replace_summary;
    const references = [...asArray(section.source_refs)];
    for (const reference of asArray(patch.append_source_refs)) {
      if (!references.includes(reference)) references.push(reference);
    }
    section.source_refs = references;
  }
}

function exchangeRow(database, target) {
  const row = database.prepare(`
    SELECT name, profile, sources
    FROM ${target.table}
    WHERE ${target.kindColumn} = ? AND slug = ?
  `).get(target.kind, target.slug);
  if (!row) throw new Error(`Missing exchange target ${target.kind}:${target.slug}`);
  return row;
}

function buildExchangeRows(document, database) {
  return document.cases
    .filter((entry) => entry.dossier_id.includes(':'))
    .map((entry) => {
      const target = EXCHANGE_TARGETS[entry.dossier_id];
      if (!target) throw new Error(`Unknown exchange target ${entry.dossier_id}`);
      const row = exchangeRow(database, target);
      const profile = parseJson(row.profile);
      const before = assessExchangePublicationDepth({
        kind: target.kind,
        lifecycle: target.lifecycle,
        slug: target.slug,
        name: row.name,
        sources: parseJson(row.sources, []),
        forensicAnalysis: profile.forensic_analysis,
      });
      const sources = mergeSources(
        parseJson(row.sources, []),
        entry.source_additions,
        entry.source_metadata_patches,
      );
      const unknownsBefore = JSON.stringify(profile.forensic_analysis?.unknowns);
      applyForensicPatches(profile, entry.forensic_claim_patches);
      const unknownsAfter = JSON.stringify(profile.forensic_analysis?.unknowns);
      if (unknownsAfter !== unknownsBefore) {
        throw new Error(`${entry.dossier_id}: remediation mutated forensic unknowns`);
      }
      for (const expectedPath of asArray(entry.expected_resolved_paths)) {
        sectionAt(profile.forensic_analysis, expectedPath);
      }
      return {
        ...target,
        dossier_id: entry.dossier_id,
        name: row.name,
        profile,
        sources,
        publication_depth_before: before,
      };
    });
}

function casinoRegisteredSources(database, caseId) {
  return database.prepare(`
    SELECT DISTINCT
      s.source_id,
      s.canonical_url,
      s.title,
      s.publisher,
      s.source_tier,
      s.source_role,
      s.resolving,
      s.evidence_reviewed,
      s.evidence_reviewed_at,
      s.evidence_reviewer,
      s.accessed_at
    FROM casino_sources AS s
    JOIN casino_claims AS c USING (source_id)
    WHERE c.case_id = ?
    ORDER BY s.source_id
  `).all(caseId);
}

function casinoCaseState(database, entry) {
  const synthesis = database.prepare(`
    SELECT outlook
    FROM casino_syntheses
    WHERE case_id = ?
  `).get(entry.dossier_id);
  if (!synthesis) throw new Error(`Missing casino synthesis ${entry.dossier_id}`);

  const outlook = parseJson(synthesis.outlook);
  const claims = database.prepare(`
    SELECT *
    FROM casino_claims
    WHERE case_id = ?
    ORDER BY claim_id
  `).all(entry.dossier_id).map((claim) => ({ ...claim }));
  const existingSources = casinoRegisteredSources(database, entry.dossier_id);
  const before = assessCasinoPublicationDepth({
    caseId: entry.dossier_id,
    name: entry.dossier_id,
    sources: existingSources,
    claims,
    forensicAnalysis: outlook.forensic_analysis,
  });
  const byClaimId = new Map(claims.map((claim) => [claim.claim_id, claim]));
  for (const patch of asArray(entry.casino_claim_patches)) {
    const claim = byClaimId.get(patch.claim_id);
    if (!claim) throw new Error(`Missing casino claim ${patch.claim_id}`);
    Object.assign(claim, patch.set);
  }
  for (const addition of asArray(entry.casino_claim_additions)) {
    if (!byClaimId.has(addition.claim_id)) {
      const claim = { ...addition };
      claims.push(claim);
      byClaimId.set(claim.claim_id, claim);
    }
  }

  const unknownsBefore = JSON.stringify(outlook.forensic_analysis?.unknowns);
  applyForensicPatches(outlook, entry.forensic_claim_patches);
  const unknownsAfter = JSON.stringify(outlook.forensic_analysis?.unknowns);
  if (unknownsAfter !== unknownsBefore) {
    throw new Error(`${entry.dossier_id}: remediation mutated forensic unknowns`);
  }
  return {
    case_id: entry.dossier_id,
    outlook,
    claims,
    source_additions: asArray(entry.source_additions),
    sources: mergeSources(existingSources, entry.source_additions, []),
    publication_depth_before: before,
  };
}

function buildCasinoRows(document, database) {
  return document.cases
    .filter((entry) => !entry.dossier_id.includes(':'))
    .map((entry) => casinoCaseState(database, entry));
}

export function buildHighRiskEvidenceRemediation(document, database) {
  if (document.schema !== 'chaindump-high-risk-remediation-implementation-v1') {
    throw new Error('Unexpected implementation document schema');
  }
  if (
    document.migration_sequence?.assigned_id !== '0065'
    || document.migration_sequence?.rendered !== true
    || document.migration_sequence?.rendered_file
      !== 'migrations/0065_high_risk_evidence_remediation.sql'
  ) {
    throw new Error('Integration document must record rendered migration 0065');
  }
  if (asArray(document.unresolved_claims).length !== 37) {
    throw new Error('Exactly 37 unresolved claims must be preserved');
  }
  const state = {
    exchange_rows: buildExchangeRows(document, database),
    casino_rows: buildCasinoRows(document, database),
  };
  const rows = [
    ...state.exchange_rows.map((row) => ({
      id: row.dossier_id,
      before: row.publication_depth_before,
      after: assessExchangePublicationDepth({
        kind: row.kind,
        lifecycle: row.lifecycle,
        slug: row.slug,
        name: row.name,
        sources: row.sources,
        forensicAnalysis: row.profile.forensic_analysis,
      }),
    })),
    ...state.casino_rows.map((row) => ({
      id: row.case_id,
      before: row.publication_depth_before,
      after: assessCasinoPublicationDepth({
        caseId: row.case_id,
        name: row.case_id,
        sources: row.sources,
        claims: row.claims,
        forensicAnalysis: row.outlook.forensic_analysis,
      }),
    })),
  ];
  const casesById = new Map(document.cases.map((entry) => [entry.dossier_id, entry]));
  for (const row of rows) {
    const entry = casesById.get(row.id);
    if (!entry) throw new Error(`Missing projected support summary for ${row.id}`);
    const expected = entry.support_summary;
    const actualBefore = row.before.unresolved_high_risk_claim_count;
    const actualAfter = row.after.unresolved_high_risk_claim_count;
    if (
      actualBefore !== entry.unresolved_before
      || actualBefore !== expected.high_risk_before
      || actualAfter !== entry.unresolved_after_projected
      || actualAfter !== expected.high_risk_after_projected
      || actualBefore - actualAfter !== expected.resolved_projected
      || asArray(entry.remains_unresolved).length !== expected.unresolved_preserved
    ) {
      throw new Error(
        `${row.id}: projected publication support does not match the shared evaluator `
        + `(actual ${actualBefore}->${actualAfter}, projected `
        + `${expected.high_risk_before}->${expected.high_risk_after_projected})`,
      );
    }
  }
  return state;
}

function casinoSourceSql(source) {
  const notes = {
    evidence_locator: source.evidence_locator,
    evidence_scope: source.evidence_scope,
    last_verified_at: source.last_verified_at,
    access_state: source.access_state,
    access_checked_at: source.access_checked_at,
    access_http_status: source.access_http_status,
    access_method: source.access_method,
    authority_class: source.authority_class,
    verification_note: source.verification_note,
  };
  return `INSERT OR IGNORE INTO casino_sources (
  source_id, canonical_url, title, publisher, accessed_at, source_tier,
  source_role, resolving, evidence_reviewed, evidence_reviewed_at,
  evidence_reviewer, notes
) VALUES (
  ${quoteSql(source.source_id)},
  ${quoteSql(source.canonical_url)},
  ${quoteSql(source.title)},
  ${quoteSql(source.publisher)},
  ${quoteSql(source.checked_at)},
  ${quoteSql(source.source_tier)},
  ${quoteSql(source.source_role)},
  ${source.resolving ? 1 : 0},
  ${source.evidence_reviewed ? 1 : 0},
  ${quoteSql(source.evidence_reviewed_at)},
  ${quoteSql(source.evidence_reviewer)},
  ${quoteSql(JSON.stringify(notes))}
);

UPDATE casino_sources
SET canonical_url = ${quoteSql(source.canonical_url)},
    title = ${quoteSql(source.title)},
    publisher = ${quoteSql(source.publisher)},
    accessed_at = ${quoteSql(source.checked_at)},
    source_tier = ${quoteSql(source.source_tier)},
    source_role = ${quoteSql(source.source_role)},
    resolving = ${source.resolving ? 1 : 0},
    evidence_reviewed = ${source.evidence_reviewed ? 1 : 0},
    evidence_reviewed_at = ${quoteSql(source.evidence_reviewed_at)},
    evidence_reviewer = ${quoteSql(source.evidence_reviewer)},
    notes = ${quoteSql(JSON.stringify(notes))}
WHERE source_id = ${quoteSql(source.source_id)};`;
}

function casinoClaimInsertSql(claim) {
  return `INSERT OR IGNORE INTO casino_claims (
  claim_id, case_id, field_path, source_id, evidence_locator, claim_type,
  support_direction, analyst_note, checked_at
) VALUES (
  ${quoteSql(claim.claim_id)},
  ${quoteSql(claim.case_id)},
  ${quoteSql(claim.field_path)},
  ${quoteSql(claim.source_id)},
  ${quoteSql(claim.evidence_locator)},
  ${quoteSql(claim.claim_type)},
  ${quoteSql(claim.support_direction)},
  ${quoteSql(claim.analyst_note)},
  ${quoteSql(claim.checked_at)}
);

UPDATE casino_claims
SET case_id = ${quoteSql(claim.case_id)},
    field_path = ${quoteSql(claim.field_path)},
    source_id = ${quoteSql(claim.source_id)},
    evidence_locator = ${quoteSql(claim.evidence_locator)},
    claim_type = ${quoteSql(claim.claim_type)},
    support_direction = ${quoteSql(claim.support_direction)},
    analyst_note = ${quoteSql(claim.analyst_note)},
    checked_at = ${quoteSql(claim.checked_at)}
WHERE claim_id = ${quoteSql(claim.claim_id)};`;
}

export function renderHighRiskEvidenceRemediationMigration(document, state, migrationId) {
  if (!MIGRATION_ID.test(migrationId || '')) {
    throw new Error('A confirmed four-digit migration id is required');
  }
  const reservedAfter = Number(document.migration_sequence?.reserved_after);
  if (!Number.isInteger(reservedAfter) || Number(migrationId) <= reservedAfter) {
    throw new Error(
      `Migration ${migrationId} violates reserved sequence after ${document.migration_sequence?.reserved_after}`,
    );
  }
  const table = `high_risk_evidence_remediation_${migrationId}`;
  const exchangeValues = state.exchange_rows.map((row) => `(
  ${quoteSql(row.table)},
  ${quoteSql(row.kind)},
  ${quoteSql(row.slug)},
  ${quoteSql(JSON.stringify(row.profile))},
  ${quoteSql(JSON.stringify(row.sources))}
)`).join(',\n');
  const casinoSources = state.casino_rows
    .flatMap((row) => row.source_additions)
    .map(casinoSourceSql)
    .join('\n\n');
  const casinoClaimAdditions = document.cases
    .flatMap((entry) => asArray(entry.casino_claim_additions))
    .map(casinoClaimInsertSql)
    .join('\n\n');
  const casinoClaimPatches = document.cases.flatMap((entry) => (
    asArray(entry.casino_claim_patches).map((patch) => `UPDATE casino_claims
SET claim_type = ${quoteSql(patch.set.claim_type)},
    support_direction = ${quoteSql(patch.set.support_direction)},
    analyst_note = ${quoteSql(patch.set.analyst_note)}
WHERE claim_id = ${quoteSql(patch.claim_id)};`)
  )).join('\n\n');
  const casinoOutlooks = state.casino_rows.map((row) => `UPDATE casino_syntheses
SET outlook = ${quoteSql(JSON.stringify(row.outlook))},
    reviewed_at = '2026-07-29'
WHERE case_id = ${quoteSql(row.case_id)};`).join('\n\n');

  return `-- Generated by scripts/render-high-risk-evidence-remediation-migration.mjs.
-- Applies editorially reviewed, claim-specific evidence while preserving 37 unsupported high-risk claims.

DROP TABLE IF EXISTS ${table};
CREATE TABLE ${table} (
  table_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  slug TEXT NOT NULL,
  profile TEXT NOT NULL CHECK (json_valid(profile)),
  sources TEXT NOT NULL CHECK (json_valid(sources)),
  PRIMARY KEY (kind, slug)
);

INSERT OR REPLACE INTO ${table}
  (table_name, kind, slug, profile, sources)
VALUES
${exchangeValues};

UPDATE successful_exchanges
SET profile = (
      SELECT patch.profile FROM ${table} AS patch
      WHERE patch.table_name = 'successful_exchanges'
        AND patch.kind = successful_exchanges.type
        AND patch.slug = successful_exchanges.slug
    ),
    sources = (
      SELECT patch.sources FROM ${table} AS patch
      WHERE patch.table_name = 'successful_exchanges'
        AND patch.kind = successful_exchanges.type
        AND patch.slug = successful_exchanges.slug
    ),
    updated_at = '2026-07-29'
WHERE EXISTS (
  SELECT 1 FROM ${table} AS patch
  WHERE patch.table_name = 'successful_exchanges'
    AND patch.kind = successful_exchanges.type
    AND patch.slug = successful_exchanges.slug
);

UPDATE mid_exchanges
SET profile = (
      SELECT patch.profile FROM ${table} AS patch
      WHERE patch.table_name = 'mid_exchanges'
        AND patch.kind = mid_exchanges.kind
        AND patch.slug = mid_exchanges.slug
    ),
    sources = (
      SELECT patch.sources FROM ${table} AS patch
      WHERE patch.table_name = 'mid_exchanges'
        AND patch.kind = mid_exchanges.kind
        AND patch.slug = mid_exchanges.slug
    ),
    updated_at = '2026-07-29'
WHERE EXISTS (
  SELECT 1 FROM ${table} AS patch
  WHERE patch.table_name = 'mid_exchanges'
    AND patch.kind = mid_exchanges.kind
    AND patch.slug = mid_exchanges.slug
);

UPDATE dead_exchanges
SET profile = (
      SELECT patch.profile FROM ${table} AS patch
      WHERE patch.table_name = 'dead_exchanges'
        AND patch.kind = dead_exchanges.kind
        AND patch.slug = dead_exchanges.slug
    ),
    sources = (
      SELECT patch.sources FROM ${table} AS patch
      WHERE patch.table_name = 'dead_exchanges'
        AND patch.kind = dead_exchanges.kind
        AND patch.slug = dead_exchanges.slug
    ),
    updated_at = '2026-07-29'
WHERE EXISTS (
  SELECT 1 FROM ${table} AS patch
  WHERE patch.table_name = 'dead_exchanges'
    AND patch.kind = dead_exchanges.kind
    AND patch.slug = dead_exchanges.slug
);

${casinoSources}

${casinoClaimAdditions}

${casinoClaimPatches}

${casinoOutlooks}

DROP TABLE IF EXISTS ${table};
`;
}

export function applyRepositoryMigrations(database, throughExclusive = Infinity) {
  const migrationDirectory = resolve(root, 'migrations');
  const files = readdirSync(migrationDirectory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .filter((file) => Number(file.slice(0, 4)) < throughExclusive)
    .sort();
  for (const file of files) {
    database.exec(readFileSync(repositoryPath(resolve(migrationDirectory, file), 'Migration path'), 'utf8'));
  }
}

function main() {
  const documentPath = repositoryPath(
    process.argv[2] || defaultDocumentPath,
    'Remediation document path',
  );
  const document = JSON.parse(readFileSync(documentPath, 'utf8'));
  const assignedId = document.migration_sequence?.assigned_id;
  if (!MIGRATION_ID.test(assignedId || '')) {
    throw new Error(
      'Migration rendering refused: document must record a confirmed four-digit assigned id.',
    );
  }
  const existingIds = readdirSync(resolve(root, 'migrations'))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .map((file) => Number(file.slice(0, 4)));
  const nextId = Math.max(...existingIds.filter((id) => id !== Number(assignedId))) + 1;
  if (Number(assignedId) !== nextId) {
    throw new Error(
      `Migration rendering refused: assigned ${assignedId}, but the next contiguous id is ${String(nextId).padStart(4, '0')}.`,
    );
  }
  const database = new DatabaseSync(':memory:');
  try {
    applyRepositoryMigrations(database, Number(assignedId));
    const state = buildHighRiskEvidenceRemediation(document, database);
    const sql = renderHighRiskEvidenceRemediationMigration(document, state, assignedId);
    const destination = resolve(
      root,
      `migrations/${assignedId}_high_risk_evidence_remediation.sql`,
    );
    writeFileSync(destination, sql);
    console.log(destination);
  } finally {
    database.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

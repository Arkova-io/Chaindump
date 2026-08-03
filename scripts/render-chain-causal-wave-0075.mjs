#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const basePath = resolve(root, 'docs/chain-causal-completion-2026-08-03.json');
const correctionPath = resolve(root, 'docs/chain-causal-corrections-2026-08-03.json');
const cohortPath = resolve(root, 'docs/chain-causal-completion-wave-c-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0075_chain_causal_completion_wave_c.sql');
const baseText = readFileSync(basePath, 'utf8');
const correctionText = readFileSync(correctionPath, 'utf8');
const cohortText = readFileSync(cohortPath, 'utf8');
const baseDocument = JSON.parse(baseText);
const correctionDocument = JSON.parse(correctionText);
const cohortDocument = JSON.parse(cohortText);
const checkedAt = cohortDocument.research_as_of;
const maxD1StatementBytes = 95_000;

if (baseDocument.schema !== 'chaindump-chain-causal-completion-v1') {
  throw new Error(`base: unexpected manifest schema: ${baseDocument.schema}`);
}
if (correctionDocument.schema !== 'chaindump-chain-causal-correction-v1') {
  throw new Error(`correction: unexpected manifest schema: ${correctionDocument.schema}`);
}
if (cohortDocument.schema !== 'chaindump-chain-causal-completion-v1') {
  throw new Error(`cohort: unexpected manifest schema: ${cohortDocument.schema}`);
}
const baseHash = createHash('sha256').update(baseText).digest('hex');
if (baseHash !== correctionDocument.base_manifest_sha256) {
  throw new Error(
    `correction: base manifest hash mismatch (${baseHash} != ${correctionDocument.base_manifest_sha256})`,
  );
}
if (correctionDocument.base_manifest !== 'docs/chain-causal-completion-2026-08-03.json') {
  throw new Error(`correction: unexpected base manifest: ${correctionDocument.base_manifest}`);
}
for (const [label, document] of [['correction', correctionDocument], ['cohort', cohortDocument]]) {
  if (document.research_as_of !== checkedAt || !/^\d{4}-\d{2}-\d{2}$/.test(checkedAt || '')) {
    throw new Error(`${label}: invalid research_as_of: ${document.research_as_of}`);
  }
}

const baseByChain = Object.fromEntries(baseDocument.cases.map((entry) => [entry.chain, entry]));
const correctionCases = correctionDocument.cases.map((patch) => {
  const base = baseByChain[patch.chain];
  if (!base) throw new Error(`correction: missing base case for ${patch.chain}`);
  return {
    ...base,
    forensic_analysis: {
      ...base.forensic_analysis,
      observation_snapshot: {
        ...base.forensic_analysis.observation_snapshot,
        ...patch.observation_snapshot_patch,
      },
      outcome: {
        ...base.forensic_analysis.outcome,
        summary: patch.outcome_summary,
      },
    },
  };
});

for (const [label, entries] of [
  ['correction', correctionCases],
  ['cohort', cohortDocument.cases],
]) {
  for (const entry of entries) {
    const sourceById = Object.fromEntries(entry.sources.map((source) => [source.id, source]));
    if (Object.keys(sourceById).length !== entry.sources.length) {
      throw new Error(`${entry.chain}: duplicate source id`);
    }
    if (new Set(entry.sources.map(({ url }) => url)).size !== entry.sources.length) {
      throw new Error(`${entry.chain}: duplicate source URL`);
    }
    for (const source of entry.sources) {
      if (source.checked_at !== checkedAt || !/^https:\/\//.test(source.url || '')) {
        throw new Error(`${entry.chain}:${source.id}: unchecked or invalid source`);
      }
    }
    const result = validateForensicAnalysis(entry.forensic_analysis, { resolver: sourceById });
    if (result.errors.length || result.warnings.length || result.withheld_sections.length) {
      throw new Error(`${entry.chain}: ${JSON.stringify(result)}`);
    }
  }
}

const correctionChains = correctionCases.map(({ chain }) => chain);
const cohortChains = cohortDocument.cases.map(({ chain }) => chain);
const overlap = cohortChains.filter((chain) => correctionChains.includes(chain));
if (overlap.length) throw new Error(`correction/cohort overlap: ${overlap.join(', ')}`);

function renderSourceMerge() {
  return `(
      SELECT json_group_array(json(source_json))
      FROM (
        SELECT source_json
        FROM (
          SELECT
            CASE
              WHEN new_source.value IS NULL THEN old_source.value
              ELSE json_set(
                json_patch(old_source.value, new_source.value),
                '$.checked_at',
                CASE
                  WHEN json_extract(old_source.value, '$.checked_at')
                    > json_extract(new_source.value, '$.checked_at')
                    THEN json_extract(old_source.value, '$.checked_at')
                  ELSE COALESCE(
                    json_extract(new_source.value, '$.checked_at'),
                    json_extract(old_source.value, '$.checked_at')
                  )
                END
              )
            END AS source_json,
            old_source.key AS position
          FROM json_each(COALESCE(facts.sources, '[]')) AS old_source
          LEFT JOIN json_each(
            json_extract((SELECT payload FROM causal_seed), '$.sources')
          ) AS new_source
            ON json_extract(new_source.value, '$.url')
              = json_extract(old_source.value, '$.url')
          WHERE json_extract(old_source.value, '$.url') IS NULL
            OR old_source.key = (
              SELECT MIN(candidate.key)
              FROM json_each(COALESCE(facts.sources, '[]')) AS candidate
              WHERE json_extract(candidate.value, '$.url')
                = json_extract(old_source.value, '$.url')
            )
          UNION ALL
          SELECT new_source.value AS source_json, 10000 + new_source.key AS position
          FROM json_each(
            json_extract((SELECT payload FROM causal_seed), '$.sources')
          ) AS new_source
          WHERE NOT EXISTS (
            SELECT 1
            FROM json_each(COALESCE(facts.sources, '[]')) AS existing
            WHERE json_extract(existing.value, '$.url')
              = json_extract(new_source.value, '$.url')
          )
        )
        ORDER BY position
      )
    )`;
}

function renderCase(entry, marker) {
  const payload = JSON.stringify(entry).replaceAll("'", "''");
  const statement = `-- ${marker}-start ${entry.chain}
WITH causal_seed(payload) AS (
  VALUES ('${payload}')
)
UPDATE chain_facts AS facts
SET
  data = CASE facts.dimension
    WHEN 'synthesis' THEN json_set(
      facts.data,
      '$.forensic_analysis',
      json(json_extract((SELECT payload FROM causal_seed), '$.forensic_analysis'))
    )
    WHEN '_meta' THEN json_set(
      facts.data,
      '$.forensic_analysis_version', 'forensic-analysis-v1',
      '$.last_reviewed', '${checkedAt}',
      '$.next_review_at',
      json_extract(
        (SELECT payload FROM causal_seed),
        '$.forensic_analysis.review.next_review_at'
      )
    )
    ELSE facts.data
  END
  ,
  sources = CASE
    WHEN facts.dimension = 'synthesis' THEN ${renderSourceMerge()}
    ELSE facts.sources
  END
  ,
  updated_at = '${checkedAt}'
WHERE facts.chain = json_extract((SELECT payload FROM causal_seed), '$.chain')
  AND facts.dimension IN ('synthesis', '_meta');
-- ${marker}-end ${entry.chain}
`;
  const bytes = Buffer.byteLength(statement, 'utf8');
  if (bytes > maxD1StatementBytes) {
    throw new Error(`${entry.chain}: ${bytes} bytes exceeds D1 statement ceiling`);
  }
  return statement;
}

const correctionHash = createHash('sha256').update(correctionText).digest('hex');
const cohortHash = createHash('sha256').update(cohortText).digest('hex');
const sql = `-- Generated by scripts/render-chain-causal-wave-0075.mjs.
-- Corrects the merged 0073 point-in-time copy/data, then adds five new causal profiles.
-- Does not rewrite migrations 0073 or 0074; every statement is idempotent.
-- base-manifest-sha256 ${baseHash}
-- correction-manifest-sha256 ${correctionHash}
-- cohort-manifest-sha256 ${cohortHash}

-- corrective-prelude-start
${correctionCases.map((entry) => renderCase(entry, 'corrective-case')).join('\n')}
-- corrective-prelude-end

-- cohort-wave-c-start
${cohortDocument.cases.map((entry) => renderCase(entry, 'canonical-case')).join('\n')}
-- cohort-wave-c-end
`;

writeFileSync(migrationPath, sql);

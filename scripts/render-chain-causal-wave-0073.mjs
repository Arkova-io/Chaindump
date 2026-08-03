#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const documentPath = resolve(root, 'docs/chain-causal-completion-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0073_chain_causal_completion_wave_b.sql');
const documentText = readFileSync(documentPath, 'utf8');
const document = JSON.parse(documentText);
const checkedAt = document.research_as_of;
const maxD1StatementBytes = 95_000;

if (document.schema !== 'chaindump-chain-causal-completion-v1') {
  throw new Error(`unexpected manifest schema: ${document.schema}`);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedAt || '')) {
  throw new Error(`invalid research_as_of: ${checkedAt}`);
}

for (const entry of document.cases) {
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

function renderCase(entry) {
  const payload = JSON.stringify(entry).replaceAll("'", "''");
  const statement = `-- canonical-case-start ${entry.chain}
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
-- canonical-case-end ${entry.chain}
`;
  const bytes = Buffer.byteLength(statement, 'utf8');
  if (bytes > maxD1StatementBytes) {
    throw new Error(`${entry.chain}: ${bytes} bytes exceeds D1 statement ceiling`);
  }
  return statement;
}

const manifestHash = createHash('sha256').update(documentText).digest('hex');
const sql = `-- Generated by scripts/render-chain-causal-wave-0073.mjs.
-- Adds the shared causal contract without replacing any existing dossier dimension.
-- Re-run after editing the checked research corpus; every update is idempotent.
-- canonical-manifest-sha256 ${manifestHash}

${document.cases.map(renderCase).join('\n')}`;

writeFileSync(migrationPath, sql);

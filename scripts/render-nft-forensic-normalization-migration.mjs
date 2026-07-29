#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const sourceUrl = new URL('../docs/nft-forensic-normalization-wave-2026-07-29.json', import.meta.url);
const destinationUrl = new URL('../migrations/0058_nft_forensic_normalization.sql', import.meta.url);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const LIMITED_ACCESS_STATES = new Set([
  'bot_blocked',
  'tls_fetch_failed',
  'not_found_by_raw_fetch',
  'redirected_to_homepage',
  'service_unavailable',
]);
const EXPECTED_SLUGS = [
  'metroverse',
  'moonbirds',
  'nba-top-shot',
  'nifty-gateway',
  'nouns-dao',
  'onchainmonkey-genesis',
  'opensea-marketplace',
  'pizza-ninjas',
  'pudgy-penguins',
  'quantum-cats',
  'reddit-collectible-avatars',
  'solana-monkey-business',
  'sorare-cards',
  'taproot-wizards',
  'tezzardz',
  'the-sandbox-land',
  'twelvefold',
  'world-of-women',
];

function quoteSql(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function collectSourceIds(value, found = []) {
  if (Array.isArray(value)) {
    for (const child of value) collectSourceIds(child, found);
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value.source_ids)) found.push(...value.source_ids);
  if (Array.isArray(value.source_refs)) found.push(...value.source_refs);
  for (const child of Object.values(value)) collectSourceIds(child, found);
  return found;
}

function sourceResolver(dossier) {
  return Object.fromEntries(dossier.sources.map((source) => [source.id, source]));
}

function validateDocumentHeader(document) {
  if (document?.schema !== 'chaindump-nft-field-v1') {
    throw new Error('Unexpected NFT forensic normalization schema');
  }
  if (document?.patch_schema !== 'nft-forensic-normalization-v1') {
    throw new Error('Unexpected NFT forensic patch schema');
  }
  if (!ISO_DAY.test(document.research_as_of || '')) {
    throw new Error('NFT forensic normalization needs an ISO research_as_of date');
  }
  if (document.generated_migration !== '0058_nft_forensic_normalization.sql') {
    throw new Error('NFT forensic normalization must reserve migration 0058');
  }
  if (!Array.isArray(document.dossiers)) throw new Error('No NFT forensic dossiers');

  const slugs = document.dossiers.map(({ slug }) => slug);
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error(`Unexpected NFT forensic cohort: ${slugs.join(', ')}`);
  }
}

function validateSource(source, dossierSlug, sourceIds) {
  if (!source?.id || sourceIds.has(source.id)) {
    throw new Error(`${dossierSlug}: missing or duplicate source id ${source?.id || '(missing)'}`);
  }
  if (!source.title || !source.url?.startsWith('https://')) {
    throw new Error(`${dossierSlug}: source ${source.id} needs title and HTTPS URL`);
  }
  if (!ISO_DAY.test(source.checked_at || '')) {
    throw new Error(`${dossierSlug}: source ${source.id} needs checked_at`);
  }
  if (source.access_state && !LIMITED_ACCESS_STATES.has(source.access_state)) {
    throw new Error(`${dossierSlug}: source ${source.id} has unknown access_state`);
  }
  if (source.access_state && !source.verification_note) {
    throw new Error(`${dossierSlug}: source ${source.id} needs a verification_note`);
  }
}

function validateSourceRegistry(dossier) {
  const sourceIds = new Set();
  for (const source of dossier.sources || []) {
    validateSource(source, dossier.slug, sourceIds);
    sourceIds.add(source.id);
  }
  return sourceIds;
}

function validateProfileShape(dossier, sourceIds) {
  const profile = dossier.profile || {};
  for (const key of ['token_model', 'chain_dependence', 'forensic_analysis']) {
    if (!profile[key]) throw new Error(`${dossier.slug}: missing ${key}`);
  }
  for (const id of collectSourceIds(profile)) {
    if (!sourceIds.has(typeof id === 'string' ? id : id?.id)) {
      throw new Error(`${dossier.slug}: unresolved source reference ${JSON.stringify(id)}`);
    }
  }
  return profile;
}

function validateAnalysisDepth(dossier, analysis) {
  if (!analysis.outcome?.scope) throw new Error(`${dossier.slug}: outcome scope is required`);
  if (!analysis.why?.summary?.includes('Observed:') || !analysis.why.summary.includes('Inference')) {
    throw new Error(`${dossier.slug}: why must separate observed facts from inference`);
  }
  if (!analysis.why.basis) throw new Error(`${dossier.slug}: why basis is required`);
  if ((analysis.strategic_choices || []).length < 3) {
    throw new Error(`${dossier.slug}: needs at least three strategic choices`);
  }
  const completeChoices = analysis.strategic_choices.every((choice) => (
    choice.decision && choice.intended_mechanism && choice.consequence
  ));
  if (!completeChoices) {
    throw new Error(`${dossier.slug}: every choice needs decision, mechanism, and consequence`);
  }
  if (!analysis.counterfactual?.limits) {
    throw new Error(`${dossier.slug}: counterfactual limits are required`);
  }
  if ((analysis.watch || []).length < 2) {
    throw new Error(`${dossier.slug}: needs at least two watch conditions`);
  }
  if ((analysis.unknowns || []).length < 4) {
    throw new Error(`${dossier.slug}: needs at least four explicit unknowns`);
  }
}

function validateDossier(dossier) {
  const sourceIds = validateSourceRegistry(dossier);
  const profile = validateProfileShape(dossier, sourceIds);
  const analysis = profile.forensic_analysis;
  validateAnalysisDepth(dossier, analysis);
  const forensic = validateForensicAnalysis(analysis, { resolver: sourceResolver(dossier) });
  if (forensic.errors.length || forensic.warnings.length || forensic.withheld_sections.length) {
    throw new Error(`${dossier.slug} forensic analysis: ${[
      ...forensic.errors,
      ...forensic.warnings,
      ...forensic.withheld_sections,
    ].join('; ')}`);
  }
}

function validateDocument(document) {
  validateDocumentHeader(document);
  for (const dossier of document.dossiers) validateDossier(dossier);
}

export function renderNftForensicNormalizationMigration(document) {
  validateDocument(document);
  const checkedAt = quoteSql(document.research_as_of);
  const dossierInserts = document.dossiers.map((dossier) => `
INSERT OR REPLACE INTO nft_forensic_normalization_0058
  (slug, status, profile_patch, sources)
VALUES (
  ${quoteSql(dossier.slug)}, -- NOSONAR: deterministic cited research payload
  ${quoteSql(dossier.status)}, -- NOSONAR: deterministic cited research payload
  ${quoteSql(JSON.stringify(dossier.profile))}, -- NOSONAR: deterministic cited research payload
  ${quoteSql(JSON.stringify(dossier.sources))} -- NOSONAR: deterministic cited research payload
);`).join('\n');
  return `-- Generated by scripts/render-nft-forensic-normalization-migration.mjs.
-- Adds the shared causal-analysis contract to the final 18 field-cited NFT dossiers.

DROP TABLE IF EXISTS nft_forensic_normalization_0058;
CREATE TABLE nft_forensic_normalization_0058 (
  slug TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  profile_patch TEXT NOT NULL,
  sources TEXT NOT NULL
);

-- batched-payload-start
${dossierInserts}
-- batched-payload-end

UPDATE nft_collections
SET status = (
      SELECT patch.status
      FROM nft_forensic_normalization_0058 AS patch
      WHERE patch.slug = nft_collections.slug
    ),
    profile = json_patch(
      COALESCE(NULLIF(profile, ''), '{}'),
      json((
        SELECT patch.profile_patch
        FROM nft_forensic_normalization_0058 AS patch
        WHERE patch.slug = nft_collections.slug
      ))
    ),
    sources = COALESCE((
      SELECT json_group_array(json(merged_source.value))
      FROM (
        SELECT
          json_patch(
            existing_source.value,
            COALESCE((
              SELECT manifest_source.value
              FROM nft_forensic_normalization_0058 AS source_patch,
                   json_each(source_patch.sources) AS manifest_source
              WHERE source_patch.slug = nft_collections.slug
                AND json_extract(manifest_source.value, '$.id')
                  = json_extract(existing_source.value, '$.id')
            ), '{}')
          ) AS value,
          CAST(existing_source.key AS INTEGER) AS source_order
        FROM json_each(
          COALESCE(NULLIF(nft_collections.sources, ''), '[]')
        ) AS existing_source

        UNION ALL

        SELECT
          manifest_source.value AS value,
          1000000 + CAST(manifest_source.key AS INTEGER) AS source_order
        FROM nft_forensic_normalization_0058 AS source_patch,
             json_each(source_patch.sources) AS manifest_source
        WHERE source_patch.slug = nft_collections.slug
          AND NOT EXISTS (
            SELECT 1
            FROM json_each(
              COALESCE(NULLIF(nft_collections.sources, ''), '[]')
            ) AS existing_source
            WHERE json_extract(existing_source.value, '$.id')
              = json_extract(manifest_source.value, '$.id')
          )
        ORDER BY source_order
      ) AS merged_source
    ), '[]'),
    updated_at = ${checkedAt}
WHERE EXISTS (
  SELECT 1
  FROM nft_forensic_normalization_0058 AS patch
  WHERE patch.slug = nft_collections.slug
);

DROP TABLE IF EXISTS nft_forensic_normalization_0058;
`;
}

function main() {
  const document = JSON.parse(readFileSync(sourceUrl, 'utf8'));
  writeFileSync(
    fileURLToPath(destinationUrl),
    renderNftForensicNormalizationMigration(document),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

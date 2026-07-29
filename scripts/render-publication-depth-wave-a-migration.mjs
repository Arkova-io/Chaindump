#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'docs/publication-depth-wave-a-2026-07-29.json');
const destinationPath = resolve(root, 'migrations/0063_publication_depth_wave_a.sql');

const EXPECTED = Object.freeze({
  exchanges: ['bitmex', 'kucoin'],
  casinos: ['bc-game-curacao-small-house'],
  nfts: ['f1-delta-time'],
  referenceRepairExchanges: [
    'cex:dead:ascendex',
    'cex:dead:bittrex',
    'cex:dead:blockfi',
    'cex:dead:celsius',
    'cex:dead:coinflex',
    'cex:dead:cryptopia',
    'cex:dead:ftx',
    'cex:dead:genesis-global',
    'cex:dead:hodlnaut',
    'cex:dead:mt-gox',
    'cex:dead:quadrigacx',
    'cex:dead:vauld',
    'cex:dead:voyager-digital',
    'cex:dead:zipmex',
    'cex:mid:okx',
    'cex:mid:wazirx',
    'dex:dead:bunni',
    'dex:dead:gmx-v1',
    'dex:dead:kyberswap',
    'dex:dead:mango-markets',
    'dex:dead:mirror-protocol',
    'dex:dead:platypus-finance',
    'dex:dead:saddle-finance',
    'dex:dead:serum',
    'dex:dead:uranium-finance',
    'dex:mid:balancer',
    'dex:mid:bancor',
    'dex:mid:dodo-amm',
    'dex:mid:osmosis',
    'dex:mid:spookyswap',
    'dex:mid:sushiswap',
    'dex:successful:curve-finance',
    'dex:successful:dydx',
    'dex:successful:hyperliquid',
    'dex:successful:meteora',
    'dex:successful:pancakeswap',
    'dex:successful:raydium',
    'dex:successful:thorchain',
    'dex:successful:uniswap',
  ],
});

function assertSource(source, path, casino = false, allowUnavailable = false) {
  const url = casino ? source.canonical_url : source.url;
  const tier = casino ? source.source_tier : source.source_tier;
  const role = casino ? source.source_role : source.source_role;
  if (!/^https:\/\/\S+$/.test(url || '')) throw new Error(`${path}: HTTPS URL required`);
  if (!(casino ? ['A', 'B', 'C', 'D'] : ['T1', 'T2', 'T3', 'T4']).includes(tier)) {
    throw new Error(`${path}: explicit source tier required`);
  }
  if (!['authority', 'primary', 'independent', 'aggregator', 'data'].includes(role)) {
    throw new Error(`${path}: explicit source role required`);
  }
  const resolving = source.resolving === true || source.resolving === 1;
  const reviewed = source.evidence_reviewed === true || source.evidence_reviewed === 1;
  if ((!allowUnavailable && (!resolving || !reviewed)) || (allowUnavailable && reviewed !== resolving)) {
    throw new Error(`${path}: resolving and evidence_reviewed must be explicit`);
  }
  if (allowUnavailable && !resolving && !source.access_state?.trim()) {
    throw new Error(`${path}: unavailable source requires an explicit access state`);
  }
  const checkedAt = casino ? source.accessed_at : source.checked_at;
  if (checkedAt !== '2026-07-29') throw new Error(`${path}: stale verification date`);
}

function assertIds(entries, field, expected, path) {
  const actual = entries.map((entry) => entry[field]);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${path}: expected ${expected.join(', ')}, received ${actual.join(', ')}`);
  }
}

export function validatePublicationDepthManifest(document) {
  if (
    document.schema !== 'chaindump-publication-depth-wave-v1'
    || document.generated_migration !== '0063_publication_depth_wave_a.sql'
    || document.as_of !== '2026-07-29'
    || document.source_verification?.checked_at !== '2026-07-29'
  ) {
    throw new Error('Publication-depth Wave A metadata is invalid');
  }
  assertIds(document.exchange_patches, 'slug', EXPECTED.exchanges, 'exchange_patches');
  assertIds(document.casino_patches, 'case_id', EXPECTED.casinos, 'casino_patches');
  assertIds(document.nft_patches, 'slug', EXPECTED.nfts, 'nft_patches');
  const verificationResults = document.source_verification?.results || [];
  const verificationIds = new Set(verificationResults.map(({ source_id: sourceId }) => sourceId));
  if (
    verificationResults.length !== 11
    || verificationResults.some(({ http_status: status, final_url: url }) => (
      status !== 200 || !/^https:\/\/\S+$/.test(url || '')
    ))
  ) {
    throw new Error('Publication-depth Wave A requires eleven resolving HTTP 200 verification results');
  }

  for (const [index, patch] of document.exchange_patches.entries()) {
    if (!['dead_exchanges', 'mid_exchanges'].includes(patch.table) || patch.kind !== 'cex') {
      throw new Error(`exchange_patches[${index}]: invalid target`);
    }
    if (patch.sources.length < 2) {
      throw new Error(`exchange_patches[${index}]: independent repair requires two sources`);
    }
    patch.sources.forEach((source, sourceIndex) => (
      assertSource(source, `exchange_patches[${index}].sources[${sourceIndex}]`)
    ));
    if (patch.sources.some(({ id }) => !verificationIds.has(id))) {
      throw new Error(`exchange_patches[${index}]: source verification result missing`);
    }
  }

  for (const [index, patch] of document.casino_patches.entries()) {
    if (patch.sources.length < 2 || patch.claims.length < 2) {
      throw new Error(`casino_patches[${index}]: source and field-claim repairs required`);
    }
    patch.sources.forEach((source, sourceIndex) => (
      assertSource(source, `casino_patches[${index}].sources[${sourceIndex}]`, true)
    ));
    if (patch.sources.some(({ source_id: sourceId }) => !verificationIds.has(sourceId))) {
      throw new Error(`casino_patches[${index}]: source verification result missing`);
    }
    const sourceIds = new Set(patch.sources.map(({ source_id: sourceId }) => sourceId));
    for (const claim of patch.claims) {
      if (!sourceIds.has(claim.source_id)) {
        throw new Error(`${claim.claim_id}: claim must reference a Wave A source`);
      }
      if (claim.checked_at !== '2026-07-29' || !claim.evidence_locator?.trim()) {
        throw new Error(`${claim.claim_id}: checked field-level evidence required`);
      }
    }
    const analysis = patch.synthesis_patch?.outlook?.forensic_analysis;
    const validation = validateForensicAnalysis(analysis);
    if (
      validation.errors.length
      || validation.warnings.length
      || validation.withheld_sections.length
    ) {
      throw new Error(`${patch.case_id}: ${JSON.stringify(validation)}`);
    }
  }

  for (const [index, patch] of document.nft_patches.entries()) {
    if (patch.sources.length < 2) {
      throw new Error(`nft_patches[${index}]: independent repair requires two sources`);
    }
    patch.sources.forEach((source, sourceIndex) => (
      assertSource(source, `nft_patches[${index}].sources[${sourceIndex}]`)
    ));
    if (patch.sources.some(({ id }) => !verificationIds.has(id))) {
      throw new Error(`nft_patches[${index}]: source verification result missing`);
    }
    if (!patch.sources.some(({ source_role: role }) => role === 'independent')) {
      throw new Error(`nft_patches[${index}]: independent lifecycle source required`);
    }
  }

  const referenceRepairs = document.reference_repairs;
  if (
    referenceRepairs?.checked_at !== '2026-07-29'
    || !referenceRepairs.method?.includes('not inferred from HTTP status or an access timestamp')
    || JSON.stringify(referenceRepairs.summary) !== JSON.stringify({
      dossier_count: 40,
      source_ref_count: 179,
      resolving_source_ref_count: 161,
      unavailable_source_ref_count: 18,
    })
  ) {
    throw new Error('Publication-depth reference-repair summary is invalid');
  }
  assertIds(
    referenceRepairs.exchange_patches,
    'dossier_id',
    EXPECTED.referenceRepairExchanges,
    'reference_repairs.exchange_patches',
  );
  assertIds(
    referenceRepairs.casino_patches,
    'case_id',
    ['wink-gaming-platform'],
    'reference_repairs.casino_patches',
  );
  assertIds(
    referenceRepairs.casino_strengthening_patches,
    'case_id',
    ['zkasino-alleged-platform'],
    'reference_repairs.casino_strengthening_patches',
  );
  const repairUrls = [];
  for (const [index, patch] of referenceRepairs.exchange_patches.entries()) {
    const expectedTable = {
      successful: 'successful_exchanges',
      mid: 'mid_exchanges',
      dead: 'dead_exchanges',
    }[patch.lifecycle];
    if (
      patch.table !== expectedTable
      || patch.dossier_id !== `${patch.kind}:${patch.lifecycle}:${patch.slug}`
      || !['cex', 'dex'].includes(patch.kind)
      || patch.sources.length === 0
    ) {
      throw new Error(`reference_repairs.exchange_patches[${index}]: invalid target`);
    }
    patch.sources.forEach((source, sourceIndex) => {
      assertSource(
        source,
        `reference_repairs.exchange_patches[${index}].sources[${sourceIndex}]`,
        false,
        true,
      );
      repairUrls.push(source.url);
    });
  }
  for (const [index, patch] of referenceRepairs.casino_patches.entries()) {
    if (patch.sources.length !== 1 || patch.claims.length !== 1) {
      throw new Error(`reference_repairs.casino_patches[${index}]: one source/claim expected`);
    }
    patch.sources.forEach((source, sourceIndex) => {
      assertSource(
        source,
        `reference_repairs.casino_patches[${index}].sources[${sourceIndex}]`,
        true,
      );
      repairUrls.push(source.canonical_url);
    });
    const sourceIds = new Set(patch.sources.map(({ source_id: sourceId }) => sourceId));
    for (const claim of patch.claims) {
      if (
        !sourceIds.has(claim.source_id)
        || claim.checked_at !== '2026-07-29'
        || !claim.evidence_locator?.trim()
      ) {
        throw new Error(`${claim.claim_id}: checked source/claim mapping required`);
      }
    }
  }
  for (const [index, patch] of referenceRepairs.casino_strengthening_patches.entries()) {
    if (patch.sources.length !== 1 || patch.claims.length !== 2) {
      throw new Error(
        `reference_repairs.casino_strengthening_patches[${index}]: source/claim cohort invalid`,
      );
    }
    patch.sources.forEach((source, sourceIndex) => {
      assertSource(
        source,
        `reference_repairs.casino_strengthening_patches[${index}].sources[${sourceIndex}]`,
        true,
      );
      if (!verificationIds.has(source.source_id)) {
        throw new Error(`${source.source_id}: source verification result missing`);
      }
    });
    const sourceIds = new Set(patch.sources.map(({ source_id: sourceId }) => sourceId));
    for (const claim of patch.claims) {
      if (
        !sourceIds.has(claim.source_id)
        || claim.checked_at !== '2026-07-29'
        || !claim.evidence_locator?.trim()
      ) {
        throw new Error(`${claim.claim_id}: checked corroborating mapping required`);
      }
    }
    const updateLists = Object.values(patch.analysis_updates);
    if (
      updateLists.length !== 4
      || updateLists.some((references) => (
        references.length !== 2
        || references.some((reference) => !/^https:\/\/\S+$/.test(reference))
      ))
    ) {
      throw new Error(`${patch.case_id}: two-source causal/lifecycle updates required`);
    }
  }
  if (repairUrls.length !== 179 || new Set(repairUrls).size !== 179) {
    throw new Error('Publication-depth reference repairs must contain 179 unique URLs');
  }
  return document;
}

export function buildPublicationDepthManifest() {
  return validatePublicationDepthManifest(JSON.parse(readFileSync(sourcePath, 'utf8')));
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function renderPublicationDepthMigration(documentValue = buildPublicationDepthManifest()) {
  const document = validatePublicationDepthManifest(documentValue);
  const rows = [
    ...document.exchange_patches.map((patch) => ['exchange', patch.slug, patch]),
    ...document.casino_patches.map((patch) => ['casino', patch.case_id, patch]),
    ...document.nft_patches.map((patch) => ['nft_ordinals', patch.slug, patch]),
    ...document.reference_repairs.exchange_patches.map((patch) => (
      ['exchange_reference', patch.dossier_id, patch]
    )),
    ...document.reference_repairs.casino_patches.map((patch) => (
      ['casino_reference', patch.case_id, patch]
    )),
    ...document.reference_repairs.casino_strengthening_patches.map((patch) => (
      ['casino_strengthening', patch.case_id, patch]
    )),
  ];
  const payloadStatements = rows.map(([vertical, dossierId, patch]) => `
INSERT OR REPLACE INTO publication_depth_wave_a_0063 (vertical, dossier_id, patch)
VALUES (
  ${sqlLiteral(vertical)}, -- NOSONAR: deterministic cited research payload
  ${sqlLiteral(dossierId)}, -- NOSONAR: deterministic cited research payload
  ${sqlLiteral(JSON.stringify(patch))} -- NOSONAR: deterministic cited research payload
);`).join('\n');
  return `-- Generated by scripts/render-publication-depth-wave-a-migration.mjs.
-- Repairs the highest-risk evidence-depth cohort without asserting that legacy gaps are resolved.

DROP TABLE IF EXISTS publication_depth_wave_a_0063;
CREATE TABLE publication_depth_wave_a_0063 (
  vertical TEXT NOT NULL,
  dossier_id TEXT NOT NULL,
  patch TEXT NOT NULL CHECK (json_valid(patch)),
  PRIMARY KEY (vertical, dossier_id)
);

-- batched-payload-start
${payloadStatements}
-- batched-payload-end

UPDATE dead_exchanges
SET sources = json((
      SELECT json_extract(patch, '$.sources')
      FROM publication_depth_wave_a_0063
      WHERE vertical = 'exchange' AND dossier_id = dead_exchanges.slug
    )),
    why = COALESCE((
      SELECT json_extract(patch, '$.row_patch.why')
      FROM publication_depth_wave_a_0063
      WHERE vertical = 'exchange' AND dossier_id = dead_exchanges.slug
    ), why),
    outlook = COALESCE((
      SELECT json_extract(patch, '$.row_patch.outlook')
      FROM publication_depth_wave_a_0063
      WHERE vertical = 'exchange' AND dossier_id = dead_exchanges.slug
    ), outlook),
    updated_at = '2026-07-29'
WHERE kind = 'cex'
  AND EXISTS (
    SELECT 1
    FROM publication_depth_wave_a_0063
    WHERE vertical = 'exchange'
      AND dossier_id = dead_exchanges.slug
      AND json_extract(patch, '$.table') = 'dead_exchanges'
  );

UPDATE mid_exchanges
SET sources = json((
      SELECT json_extract(patch, '$.sources')
      FROM publication_depth_wave_a_0063
      WHERE vertical = 'exchange' AND dossier_id = mid_exchanges.slug
    )),
    why_stuck = COALESCE((
      SELECT json_extract(patch, '$.row_patch.why')
      FROM publication_depth_wave_a_0063
      WHERE vertical = 'exchange' AND dossier_id = mid_exchanges.slug
    ), why_stuck),
    outlook = COALESCE((
      SELECT json_extract(patch, '$.row_patch.outlook')
      FROM publication_depth_wave_a_0063
      WHERE vertical = 'exchange' AND dossier_id = mid_exchanges.slug
    ), outlook),
    updated_at = '2026-07-29'
WHERE kind = 'cex'
  AND EXISTS (
    SELECT 1
    FROM publication_depth_wave_a_0063
    WHERE vertical = 'exchange'
      AND dossier_id = mid_exchanges.slug
      AND json_extract(patch, '$.table') = 'mid_exchanges'
  );

UPDATE dead_exchanges
SET profile = json_set(
      profile,
      '$.forensic_analysis.outcome.source_refs',
      json_extract((
        SELECT patch
        FROM publication_depth_wave_a_0063
        WHERE vertical = 'exchange' AND dossier_id = dead_exchanges.slug
      ), '$.analysis_updates.outcome_source_refs'),
      '$.forensic_analysis.why.summary',
      json_extract((
        SELECT patch
        FROM publication_depth_wave_a_0063
        WHERE vertical = 'exchange' AND dossier_id = dead_exchanges.slug
      ), '$.analysis_updates.why_summary'),
      '$.forensic_analysis.why.confidence',
      json_extract((
        SELECT patch
        FROM publication_depth_wave_a_0063
        WHERE vertical = 'exchange' AND dossier_id = dead_exchanges.slug
      ), '$.analysis_updates.why_confidence'),
      '$.forensic_analysis.why.source_refs',
      json_extract((
        SELECT patch
        FROM publication_depth_wave_a_0063
        WHERE vertical = 'exchange' AND dossier_id = dead_exchanges.slug
      ), '$.analysis_updates.why_source_refs'),
      '$.forensic_analysis.counterfactual.source_refs',
      json_extract((
        SELECT patch
        FROM publication_depth_wave_a_0063
        WHERE vertical = 'exchange' AND dossier_id = dead_exchanges.slug
      ), '$.analysis_updates.counterfactual_source_refs')
    )
WHERE kind = 'cex' AND slug = 'bitmex';

INSERT OR REPLACE INTO casino_sources (
  source_id,
  canonical_url,
  archive_url,
  title,
  publisher,
  published_at,
  accessed_at,
  source_tier,
  source_role,
  content_hash,
  resolving,
  evidence_reviewed,
  evidence_reviewed_at,
  evidence_reviewer,
  notes
)
SELECT
  json_extract(source.value, '$.source_id'),
  json_extract(source.value, '$.canonical_url'),
  NULL,
  json_extract(source.value, '$.title'),
  json_extract(source.value, '$.publisher'),
  json_extract(source.value, '$.published_at'),
  json_extract(source.value, '$.accessed_at'),
  json_extract(source.value, '$.source_tier'),
  json_extract(source.value, '$.source_role'),
  NULL,
  json_extract(source.value, '$.resolving'),
  json_extract(source.value, '$.evidence_reviewed'),
  json_extract(source.value, '$.evidence_reviewed_at'),
  json_extract(source.value, '$.evidence_reviewer'),
  json_extract(source.value, '$.notes')
FROM publication_depth_wave_a_0063 AS wave,
     json_each(wave.patch, '$.sources') AS source
WHERE wave.vertical = 'casino';

INSERT OR REPLACE INTO casino_claims (
  claim_id,
  case_id,
  field_path,
  source_id,
  evidence_locator,
  claim_type,
  support_direction,
  analyst_note,
  checked_at
)
SELECT
  json_extract(claim.value, '$.claim_id'),
  wave.dossier_id,
  json_extract(claim.value, '$.field_path'),
  json_extract(claim.value, '$.source_id'),
  json_extract(claim.value, '$.evidence_locator'),
  json_extract(claim.value, '$.claim_type'),
  json_extract(claim.value, '$.support_direction'),
  json_extract(claim.value, '$.analyst_note'),
  json_extract(claim.value, '$.checked_at')
FROM publication_depth_wave_a_0063 AS wave,
     json_each(wave.patch, '$.claims') AS claim
WHERE wave.vertical = 'casino';

INSERT OR REPLACE INTO casino_events (
  event_id,
  case_id,
  event_type,
  event_date,
  date_precision,
  amount_usd,
  description,
  source_claim_ids
)
SELECT
  json_extract(patch, '$.event.event_id'),
  dossier_id,
  json_extract(patch, '$.event.event_type'),
  json_extract(patch, '$.event.event_date'),
  json_extract(patch, '$.event.date_precision'),
  NULL,
  json_extract(patch, '$.event.description'),
  json(json_extract(patch, '$.event.source_claim_ids'))
FROM publication_depth_wave_a_0063
WHERE vertical = 'casino';

UPDATE casino_cases
SET status = json_extract((
      SELECT patch FROM publication_depth_wave_a_0063
      WHERE vertical = 'casino' AND dossier_id = casino_cases.case_id
    ), '$.case_patch.status'),
    status_as_of = json_extract((
      SELECT patch FROM publication_depth_wave_a_0063
      WHERE vertical = 'casino' AND dossier_id = casino_cases.case_id
    ), '$.case_patch.status_as_of'),
    outcome_label = json_extract((
      SELECT patch FROM publication_depth_wave_a_0063
      WHERE vertical = 'casino' AND dossier_id = casino_cases.case_id
    ), '$.case_patch.outcome_label'),
    outcome_as_of = json_extract((
      SELECT patch FROM publication_depth_wave_a_0063
      WHERE vertical = 'casino' AND dossier_id = casino_cases.case_id
    ), '$.case_patch.outcome_as_of'),
    last_reviewed = json_extract((
      SELECT patch FROM publication_depth_wave_a_0063
      WHERE vertical = 'casino' AND dossier_id = casino_cases.case_id
    ), '$.case_patch.last_reviewed'),
    updated_at = '2026-07-29'
WHERE EXISTS (
  SELECT 1 FROM publication_depth_wave_a_0063
  WHERE vertical = 'casino' AND dossier_id = casino_cases.case_id
);

UPDATE casino_syntheses
SET present_situation = json_extract((
      SELECT patch FROM publication_depth_wave_a_0063
      WHERE vertical = 'casino' AND dossier_id = casino_syntheses.case_id
    ), '$.synthesis_patch.present_situation'),
    risk_legal_posture = json_extract((
      SELECT patch FROM publication_depth_wave_a_0063
      WHERE vertical = 'casino' AND dossier_id = casino_syntheses.case_id
    ), '$.synthesis_patch.risk_legal_posture'),
    success_failure_hypotheses = json_extract((
      SELECT patch FROM publication_depth_wave_a_0063
      WHERE vertical = 'casino' AND dossier_id = casino_syntheses.case_id
    ), '$.synthesis_patch.success_failure_hypotheses'),
    source_claim_ids = json(json_extract((
      SELECT patch FROM publication_depth_wave_a_0063
      WHERE vertical = 'casino' AND dossier_id = casino_syntheses.case_id
    ), '$.synthesis_patch.source_claim_ids')),
    outlook = json(json_extract((
      SELECT patch FROM publication_depth_wave_a_0063
      WHERE vertical = 'casino' AND dossier_id = casino_syntheses.case_id
    ), '$.synthesis_patch.outlook')),
    analyst_id = 'chaindump-research-desk',
    reviewed_at = '2026-07-29'
WHERE EXISTS (
  SELECT 1 FROM publication_depth_wave_a_0063
  WHERE vertical = 'casino' AND dossier_id = casino_syntheses.case_id
);

UPDATE nft_collections
SET sources = json((
      SELECT json_extract(patch, '$.sources')
      FROM publication_depth_wave_a_0063
      WHERE vertical = 'nft_ordinals' AND dossier_id = nft_collections.slug
    )),
    profile = json_set(
      profile,
      '$.forensic_analysis.outcome.source_refs',
      json_extract((
        SELECT patch FROM publication_depth_wave_a_0063
        WHERE vertical = 'nft_ordinals' AND dossier_id = nft_collections.slug
      ), '$.analysis_updates.outcome_source_refs'),
      '$.forensic_analysis.why.source_refs',
      json_extract((
        SELECT patch FROM publication_depth_wave_a_0063
        WHERE vertical = 'nft_ordinals' AND dossier_id = nft_collections.slug
      ), '$.analysis_updates.why_source_refs'),
      '$.forensic_analysis.counterfactual.source_refs',
      json_extract((
        SELECT patch FROM publication_depth_wave_a_0063
        WHERE vertical = 'nft_ordinals' AND dossier_id = nft_collections.slug
      ), '$.analysis_updates.counterfactual_source_refs'),
      '$.evidence',
      (
        SELECT json_group_array(json(
          CASE json_extract(evidence.value, '$.field')
            WHEN 'lifecycle_status' THEN json_set(
              evidence.value,
              '$.source_ids',
              json_extract(wave.patch, '$.evidence_updates.lifecycle_status_source_ids')
            )
            WHEN 'analysis' THEN json_set(
              evidence.value,
              '$.source_ids',
              json_extract(wave.patch, '$.evidence_updates.analysis_source_ids')
            )
            ELSE evidence.value
          END
        ))
        FROM publication_depth_wave_a_0063 AS wave,
             json_each(nft_collections.profile, '$.evidence') AS evidence
        WHERE wave.vertical = 'nft_ordinals'
          AND wave.dossier_id = nft_collections.slug
      )
    ),
    updated_at = '2026-07-29'
WHERE EXISTS (
  SELECT 1 FROM publication_depth_wave_a_0063
  WHERE vertical = 'nft_ordinals' AND dossier_id = nft_collections.slug
);

UPDATE successful_exchanges
SET sources = json((
      SELECT json_group_array(json(source_json))
      FROM (
        SELECT current_source.value AS source_json
        FROM json_each(COALESCE(NULLIF(successful_exchanges.sources, ''), '[]')) AS current_source
        WHERE COALESCE(
          json_extract(current_source.value, '$.url'),
          json_extract(current_source.value, '$.canonical_url')
        ) NOT IN (
          SELECT json_extract(repair_source.value, '$.url')
          FROM publication_depth_wave_a_0063 AS wave,
               json_each(wave.patch, '$.sources') AS repair_source
          WHERE wave.vertical = 'exchange_reference'
            AND wave.dossier_id = json_extract(wave.patch, '$.dossier_id')
            AND json_extract(wave.patch, '$.table') = 'successful_exchanges'
            AND json_extract(wave.patch, '$.kind') = successful_exchanges.type
            AND json_extract(wave.patch, '$.slug') = successful_exchanges.slug
        )
        UNION ALL
        SELECT repair_source.value
        FROM publication_depth_wave_a_0063 AS wave,
             json_each(wave.patch, '$.sources') AS repair_source
        WHERE wave.vertical = 'exchange_reference'
          AND json_extract(wave.patch, '$.table') = 'successful_exchanges'
          AND json_extract(wave.patch, '$.kind') = successful_exchanges.type
          AND json_extract(wave.patch, '$.slug') = successful_exchanges.slug
      )
    )),
    updated_at = '2026-07-29'
WHERE EXISTS (
  SELECT 1 FROM publication_depth_wave_a_0063
  WHERE vertical = 'exchange_reference'
    AND json_extract(patch, '$.table') = 'successful_exchanges'
    AND json_extract(patch, '$.kind') = successful_exchanges.type
    AND json_extract(patch, '$.slug') = successful_exchanges.slug
);

UPDATE mid_exchanges
SET sources = json((
      SELECT json_group_array(json(source_json))
      FROM (
        SELECT current_source.value AS source_json
        FROM json_each(COALESCE(NULLIF(mid_exchanges.sources, ''), '[]')) AS current_source
        WHERE COALESCE(
          json_extract(current_source.value, '$.url'),
          json_extract(current_source.value, '$.canonical_url')
        ) NOT IN (
          SELECT json_extract(repair_source.value, '$.url')
          FROM publication_depth_wave_a_0063 AS wave,
               json_each(wave.patch, '$.sources') AS repair_source
          WHERE wave.vertical = 'exchange_reference'
            AND json_extract(wave.patch, '$.table') = 'mid_exchanges'
            AND json_extract(wave.patch, '$.kind') = mid_exchanges.kind
            AND json_extract(wave.patch, '$.slug') = mid_exchanges.slug
        )
        UNION ALL
        SELECT repair_source.value
        FROM publication_depth_wave_a_0063 AS wave,
             json_each(wave.patch, '$.sources') AS repair_source
        WHERE wave.vertical = 'exchange_reference'
          AND json_extract(wave.patch, '$.table') = 'mid_exchanges'
          AND json_extract(wave.patch, '$.kind') = mid_exchanges.kind
          AND json_extract(wave.patch, '$.slug') = mid_exchanges.slug
      )
    )),
    updated_at = '2026-07-29'
WHERE EXISTS (
  SELECT 1 FROM publication_depth_wave_a_0063
  WHERE vertical = 'exchange_reference'
    AND json_extract(patch, '$.table') = 'mid_exchanges'
    AND json_extract(patch, '$.kind') = mid_exchanges.kind
    AND json_extract(patch, '$.slug') = mid_exchanges.slug
);

UPDATE dead_exchanges
SET sources = json((
      SELECT json_group_array(json(source_json))
      FROM (
        SELECT current_source.value AS source_json
        FROM json_each(COALESCE(NULLIF(dead_exchanges.sources, ''), '[]')) AS current_source
        WHERE COALESCE(
          json_extract(current_source.value, '$.url'),
          json_extract(current_source.value, '$.canonical_url')
        ) NOT IN (
          SELECT json_extract(repair_source.value, '$.url')
          FROM publication_depth_wave_a_0063 AS wave,
               json_each(wave.patch, '$.sources') AS repair_source
          WHERE wave.vertical = 'exchange_reference'
            AND json_extract(wave.patch, '$.table') = 'dead_exchanges'
            AND json_extract(wave.patch, '$.kind') = dead_exchanges.kind
            AND json_extract(wave.patch, '$.slug') = dead_exchanges.slug
        )
        UNION ALL
        SELECT repair_source.value
        FROM publication_depth_wave_a_0063 AS wave,
             json_each(wave.patch, '$.sources') AS repair_source
        WHERE wave.vertical = 'exchange_reference'
          AND json_extract(wave.patch, '$.table') = 'dead_exchanges'
          AND json_extract(wave.patch, '$.kind') = dead_exchanges.kind
          AND json_extract(wave.patch, '$.slug') = dead_exchanges.slug
      )
    )),
    updated_at = '2026-07-29'
WHERE EXISTS (
  SELECT 1 FROM publication_depth_wave_a_0063
  WHERE vertical = 'exchange_reference'
    AND json_extract(patch, '$.table') = 'dead_exchanges'
    AND json_extract(patch, '$.kind') = dead_exchanges.kind
    AND json_extract(patch, '$.slug') = dead_exchanges.slug
);

INSERT OR REPLACE INTO casino_sources (
  source_id,
  canonical_url,
  archive_url,
  title,
  publisher,
  published_at,
  accessed_at,
  source_tier,
  source_role,
  content_hash,
  resolving,
  evidence_reviewed,
  evidence_reviewed_at,
  evidence_reviewer,
  notes
)
SELECT
  json_extract(source.value, '$.source_id'),
  json_extract(source.value, '$.canonical_url'),
  NULL,
  json_extract(source.value, '$.title'),
  json_extract(source.value, '$.publisher'),
  json_extract(source.value, '$.published_at'),
  json_extract(source.value, '$.accessed_at'),
  json_extract(source.value, '$.source_tier'),
  json_extract(source.value, '$.source_role'),
  NULL,
  json_extract(source.value, '$.resolving'),
  json_extract(source.value, '$.evidence_reviewed'),
  json_extract(source.value, '$.evidence_reviewed_at'),
  json_extract(source.value, '$.evidence_reviewer'),
  json_extract(source.value, '$.notes')
FROM publication_depth_wave_a_0063 AS wave,
     json_each(wave.patch, '$.sources') AS source
WHERE wave.vertical IN ('casino_reference', 'casino_strengthening');

INSERT OR REPLACE INTO casino_claims (
  claim_id,
  case_id,
  field_path,
  source_id,
  evidence_locator,
  claim_type,
  support_direction,
  analyst_note,
  checked_at
)
SELECT
  json_extract(claim.value, '$.claim_id'),
  wave.dossier_id,
  json_extract(claim.value, '$.field_path'),
  json_extract(claim.value, '$.source_id'),
  json_extract(claim.value, '$.evidence_locator'),
  json_extract(claim.value, '$.claim_type'),
  json_extract(claim.value, '$.support_direction'),
  json_extract(claim.value, '$.analyst_note'),
  json_extract(claim.value, '$.checked_at')
FROM publication_depth_wave_a_0063 AS wave,
     json_each(wave.patch, '$.claims') AS claim
WHERE wave.vertical IN ('casino_reference', 'casino_strengthening');

UPDATE casino_syntheses
SET source_claim_ids = (
      SELECT json_group_array(claim_id)
      FROM (
        SELECT value AS claim_id
        FROM json_each(COALESCE(NULLIF(casino_syntheses.source_claim_ids, ''), '[]'))
        WHERE value NOT IN (
          SELECT json_extract(claim.value, '$.claim_id')
          FROM publication_depth_wave_a_0063 AS wave,
               json_each(wave.patch, '$.claims') AS claim
          WHERE wave.vertical IN ('casino_reference', 'casino_strengthening')
            AND wave.dossier_id = casino_syntheses.case_id
        )
        UNION ALL
        SELECT json_extract(claim.value, '$.claim_id')
        FROM publication_depth_wave_a_0063 AS wave,
             json_each(wave.patch, '$.claims') AS claim
        WHERE wave.vertical IN ('casino_reference', 'casino_strengthening')
          AND wave.dossier_id = casino_syntheses.case_id
      )
    ),
    reviewed_at = '2026-07-29'
WHERE EXISTS (
  SELECT 1 FROM publication_depth_wave_a_0063
  WHERE vertical IN ('casino_reference', 'casino_strengthening')
    AND dossier_id = casino_syntheses.case_id
);

UPDATE casino_syntheses
SET outlook = json_set(
      outlook,
      '$.forensic_analysis.outcome.source_refs',
      json_extract((
        SELECT patch FROM publication_depth_wave_a_0063
        WHERE vertical = 'casino_strengthening'
          AND dossier_id = casino_syntheses.case_id
      ), '$.analysis_updates.outcome_source_refs'),
      '$.forensic_analysis.why.source_refs',
      json_extract((
        SELECT patch FROM publication_depth_wave_a_0063
        WHERE vertical = 'casino_strengthening'
          AND dossier_id = casino_syntheses.case_id
      ), '$.analysis_updates.why_source_refs'),
      '$.forensic_analysis.strategic_choices[0].source_refs',
      json_extract((
        SELECT patch FROM publication_depth_wave_a_0063
        WHERE vertical = 'casino_strengthening'
          AND dossier_id = casino_syntheses.case_id
      ), '$.analysis_updates.strategic_choice_0_source_refs'),
      '$.forensic_analysis.watch[0].source_refs',
      json_extract((
        SELECT patch FROM publication_depth_wave_a_0063
        WHERE vertical = 'casino_strengthening'
          AND dossier_id = casino_syntheses.case_id
      ), '$.analysis_updates.watch_0_source_refs')
    ),
    reviewed_at = '2026-07-29'
WHERE EXISTS (
  SELECT 1 FROM publication_depth_wave_a_0063
  WHERE vertical = 'casino_strengthening'
    AND dossier_id = casino_syntheses.case_id
);

DROP TABLE IF EXISTS publication_depth_wave_a_0063;
`;
}

function main() {
  const document = buildPublicationDepthManifest();
  writeFileSync(destinationPath, renderPublicationDepthMigration(document));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

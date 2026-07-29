import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sourceUrl = new URL('../docs/casino-wave4-2026-07-29.json', import.meta.url);
const outputUrl = new URL('../migrations/0036_casino_wave4.sql', import.meta.url);
const document = JSON.parse(readFileSync(sourceUrl, 'utf8'));
const payload = JSON.stringify(document).replaceAll("'", "''");

const sql = `-- Generated from docs/casino-wave4-2026-07-29.json.
-- The fixed-key writes are idempotent. The staging table is removed at the end.

CREATE TABLE IF NOT EXISTS casino_wave4_payload_0036 (
  document TEXT NOT NULL CHECK (json_valid(document))
);

DELETE FROM casino_wave4_payload_0036;

-- canonical-payload-start
INSERT INTO casino_wave4_payload_0036 (document)
VALUES ('${payload}');
-- canonical-payload-end

INSERT OR REPLACE INTO casino_sources
  (source_id, canonical_url, archive_url, title, publisher, published_at,
   accessed_at, source_tier, source_role, content_hash, resolving,
   evidence_reviewed, evidence_reviewed_at, evidence_reviewer, notes)
SELECT
  json_extract(source.value, '$.source_id'),
  json_extract(source.value, '$.canonical_url'),
  json_extract(source.value, '$.archive_url'),
  json_extract(source.value, '$.title'),
  json_extract(source.value, '$.publisher'),
  json_extract(source.value, '$.published_at'),
  json_extract(source.value, '$.accessed_at'),
  json_extract(source.value, '$.source_tier'),
  json_extract(source.value, '$.source_role'),
  json_extract(source.value, '$.content_hash'),
  json_extract(source.value, '$.resolving'),
  json_extract(source.value, '$.evidence_reviewed'),
  json_extract(source.value, '$.evidence_reviewed_at'),
  json_extract(source.value, '$.evidence_reviewer'),
  json_extract(source.value, '$.notes')
FROM casino_wave4_payload_0036 AS payload,
     json_each(payload.document, '$.cases') AS dossier,
     json_each(dossier.value, '$.sources') AS source;

INSERT OR REPLACE INTO casino_cases
  (case_id, brand_name, entity_kind, product_subtype, legal_operator,
   parent_entity, primary_domain, launched, date_precision, custody_model,
   chains, product_scope_note, status, status_as_of, outcome_label,
   outcome_as_of, outcome_rule_id, token_status, token_symbol, token_name,
   token_contracts, token_launch_date, token_utility, token_fee_revenue_rights,
   token_supply, cohort_id, cohort_role, selection_rule_id, selection_as_of,
   confidence, completeness_pct, quality_passed, human_review_required,
   unsourced_fields, last_reviewed, updated_at)
SELECT
  json_extract(dossier.value, '$.case.case_id'),
  json_extract(dossier.value, '$.case.brand_name'),
  json_extract(dossier.value, '$.case.entity_kind'),
  json_extract(dossier.value, '$.case.product_subtype'),
  json_extract(dossier.value, '$.case.legal_operator'),
  json_extract(dossier.value, '$.case.parent_entity'),
  json_extract(dossier.value, '$.case.primary_domain'),
  json_extract(dossier.value, '$.case.launched'),
  json_extract(dossier.value, '$.case.date_precision'),
  json_extract(dossier.value, '$.case.custody_model'),
  json_extract(dossier.value, '$.case.chains'),
  json_extract(dossier.value, '$.case.product_scope_note'),
  json_extract(dossier.value, '$.case.status'),
  json_extract(dossier.value, '$.case.status_as_of'),
  json_extract(dossier.value, '$.case.outcome_label'),
  json_extract(dossier.value, '$.case.outcome_as_of'),
  json_extract(dossier.value, '$.case.outcome_rule_id'),
  json_extract(dossier.value, '$.case.token_status'),
  json_extract(dossier.value, '$.case.token_symbol'),
  json_extract(dossier.value, '$.case.token_name'),
  json_extract(dossier.value, '$.case.token_contracts'),
  json_extract(dossier.value, '$.case.token_launch_date'),
  json_extract(dossier.value, '$.case.token_utility'),
  json_extract(dossier.value, '$.case.token_fee_revenue_rights'),
  json_extract(dossier.value, '$.case.token_supply'),
  json_extract(dossier.value, '$.case.cohort_id'),
  json_extract(dossier.value, '$.case.cohort_role'),
  json_extract(dossier.value, '$.case.selection_rule_id'),
  json_extract(dossier.value, '$.case.selection_as_of'),
  json_extract(dossier.value, '$.case.confidence'),
  json_extract(dossier.value, '$.case.completeness_pct'),
  json_extract(dossier.value, '$.case.quality_passed'),
  json_extract(dossier.value, '$.case.human_review_required'),
  json_extract(dossier.value, '$.case.unsourced_fields'),
  json_extract(dossier.value, '$.case.last_reviewed'),
  json_extract(dossier.value, '$.case.updated_at')
FROM casino_wave4_payload_0036 AS payload,
     json_each(payload.document, '$.cases') AS dossier;

INSERT OR REPLACE INTO casino_claims
  (claim_id, case_id, field_path, source_id, evidence_locator, claim_type,
   support_direction, analyst_note, checked_at)
SELECT
  json_extract(claim.value, '$.claim_id'),
  json_extract(claim.value, '$.case_id'),
  json_extract(claim.value, '$.field_path'),
  json_extract(claim.value, '$.source_id'),
  json_extract(claim.value, '$.evidence_locator'),
  json_extract(claim.value, '$.claim_type'),
  json_extract(claim.value, '$.support_direction'),
  json_extract(claim.value, '$.analyst_note'),
  json_extract(claim.value, '$.checked_at')
FROM casino_wave4_payload_0036 AS payload,
     json_each(payload.document, '$.cases') AS dossier,
     json_each(dossier.value, '$.claims') AS claim;

INSERT OR REPLACE INTO casino_licences
  (licence_observation_id, case_id, authority, licence_id, legal_entity,
   domains, activities, jurisdiction, licence_status, valid_from, valid_until,
   as_of, source_claim_ids, notes)
SELECT
  json_extract(licence.value, '$.licence_observation_id'),
  json_extract(licence.value, '$.case_id'),
  json_extract(licence.value, '$.authority'),
  json_extract(licence.value, '$.licence_id'),
  json_extract(licence.value, '$.legal_entity'),
  json_extract(licence.value, '$.domains'),
  json_extract(licence.value, '$.activities'),
  json_extract(licence.value, '$.jurisdiction'),
  json_extract(licence.value, '$.licence_status'),
  json_extract(licence.value, '$.valid_from'),
  json_extract(licence.value, '$.valid_until'),
  json_extract(licence.value, '$.as_of'),
  json_extract(licence.value, '$.source_claim_ids'),
  json_extract(licence.value, '$.notes')
FROM casino_wave4_payload_0036 AS payload,
     json_each(payload.document, '$.cases') AS dossier,
     json_each(dossier.value, '$.licences') AS licence;

INSERT OR REPLACE INTO casino_observations
  (observation_id, case_id, metric_dimension, value, unit, currency,
   window_start, window_end, window_definition, as_of, product_scope,
   chain_scope, method, formula, raw_input_ids, source_claim_ids, quality_flags)
SELECT
  json_extract(observation.value, '$.observation_id'),
  json_extract(observation.value, '$.case_id'),
  json_extract(observation.value, '$.metric_dimension'),
  json_extract(observation.value, '$.value'),
  json_extract(observation.value, '$.unit'),
  json_extract(observation.value, '$.currency'),
  json_extract(observation.value, '$.window_start'),
  json_extract(observation.value, '$.window_end'),
  json_extract(observation.value, '$.window_definition'),
  json_extract(observation.value, '$.as_of'),
  json_extract(observation.value, '$.product_scope'),
  json_extract(observation.value, '$.chain_scope'),
  json_extract(observation.value, '$.method'),
  json_extract(observation.value, '$.formula'),
  json_extract(observation.value, '$.raw_input_ids'),
  json_extract(observation.value, '$.source_claim_ids'),
  json_extract(observation.value, '$.quality_flags')
FROM casino_wave4_payload_0036 AS payload,
     json_each(payload.document, '$.cases') AS dossier,
     json_each(dossier.value, '$.observations') AS observation;

INSERT OR REPLACE INTO casino_events
  (event_id, case_id, event_type, event_date, date_precision, amount_usd,
   description, source_claim_ids)
SELECT
  json_extract(event.value, '$.event_id'),
  json_extract(event.value, '$.case_id'),
  json_extract(event.value, '$.event_type'),
  json_extract(event.value, '$.event_date'),
  json_extract(event.value, '$.date_precision'),
  json_extract(event.value, '$.amount_usd'),
  json_extract(event.value, '$.description'),
  json_extract(event.value, '$.source_claim_ids')
FROM casino_wave4_payload_0036 AS payload,
     json_each(payload.document, '$.cases') AS dossier,
     json_each(dossier.value, '$.events') AS event;

INSERT OR REPLACE INTO casino_syntheses
  (case_id, present_situation, business_mechanism, token_contribution,
   chain_dependence, risk_legal_posture, success_failure_hypotheses,
   counterfactual, outlook, lessons_learned, source_claim_ids, analyst_id,
   reviewed_at)
SELECT
  json_extract(dossier.value, '$.case.case_id'),
  json_extract(dossier.value, '$.synthesis.present_situation'),
  json_extract(dossier.value, '$.synthesis.business_mechanism'),
  json_extract(dossier.value, '$.synthesis.token_contribution'),
  json_extract(dossier.value, '$.synthesis.chain_dependence'),
  json_extract(dossier.value, '$.synthesis.risk_legal_posture'),
  json_extract(dossier.value, '$.synthesis.success_failure_hypotheses'),
  json_extract(dossier.value, '$.synthesis.counterfactual'),
  json_set(
    COALESCE(json_extract(dossier.value, '$.synthesis.outlook'), '{}'),
    '$.forensic_analysis',
    json_extract(dossier.value, '$.forensic_analysis')
  ),
  json_extract(dossier.value, '$.synthesis.lessons_learned'),
  json_extract(dossier.value, '$.synthesis.source_claim_ids'),
  json_extract(dossier.value, '$.synthesis.analyst_id'),
  json_extract(dossier.value, '$.synthesis.reviewed_at')
FROM casino_wave4_payload_0036 AS payload,
     json_each(payload.document, '$.cases') AS dossier;

INSERT OR REPLACE INTO casino_coverage
  (cohort_id, universe_as_of, target_count, quality_passed_count,
   partial_count, missing_count, methodology_version, updated_at)
SELECT
  json_extract(document, '$.coverage.cohort_id'),
  json_extract(document, '$.coverage.universe_as_of'),
  json_extract(document, '$.coverage.target_count'),
  json_extract(document, '$.coverage.quality_passed_count'),
  json_extract(document, '$.coverage.partial_count'),
  json_extract(document, '$.coverage.missing_count'),
  json_extract(document, '$.coverage.methodology_version'),
  json_extract(document, '$.coverage.updated_at')
FROM casino_wave4_payload_0036;

DROP TABLE IF EXISTS casino_wave4_payload_0036;
`;

writeFileSync(outputUrl, sql);
console.log(fileURLToPath(outputUrl));

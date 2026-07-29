-- Replace the BitMEX closure case's mixed explanatory coverage with a direct
-- operator notice. Regulatory penalties and market-share theories are context,
-- not an asserted cause of the announced wind-down.
UPDATE dead_exchanges
SET
  metric_label = 'Announced platform sunset date',
  metric_type = 'operations_cease_date',
  metric_unit = 'date',
  collapse_date = '2026-09-23',
  why = 'BitMEX''s own July 23, 2026 notice says the platform will sunset on September 23 at 04:00 UTC and asks users to close positions and withdraw assets before that date. The notice supports a voluntary wind-down announcement; it does not state a regulatory penalty, insolvency, or market-share cause.',
  outlook = 'Classified wind-down announced, not already inactive. Recheck customer-withdrawal and final-cessation evidence after the stated September 23, 2026 cutoff; do not infer customer-loss or insolvency from the announcement alone.',
  verdict = 'wind_down_announced',
  sources = '[{"title":"BitMEX — Exchange to Sunset on 23 September at 04:00 UTC","url":"https://www.bitmex.com/blog/bitmex-closure"}]',
  profile = '{"status":"wind_down_announced","announcement_date":"2026-07-23","operations_cease":"2026-09-23T04:00:00Z","classification_basis":"operator closure notice","cause_status":"not stated by operator","analyst_boundary":"Regulatory, market-share, sale-process, and insurance-fund explanations require independent evidence and are not asserted as closure causes in this current record."}',
  updated_at = '2026-07-29'
WHERE slug = 'bitmex' AND kind = 'cex';

UPDATE exchange_case_features
SET
  metric_type = 'operations_cease_date',
  metric_unit = 'date',
  metric_window = 'announced_2026-07-23',
  metric_as_of = '2026-09-23',
  metric_observed_at = '2026-07-23',
  comparability_key = 'cex|centralized_derivatives_exchange|operations_cease_date|date|announced_2026-07-23',
  evidence = '{"operating_model_source_indexes":[0],"custody_model_source_indexes":[0],"product_cohort_source_indexes":[0],"metric_source_indexes":[0],"lifecycle_source_indexes":[0],"token_source_indexes":[],"metric_observation_note":"Operator-announced final platform-sunset date; this is not a volume, solvency, or loss metric."}',
  quality_label = 'partial',
  quality_issues = '["token_citation_not_field_specific","closure_cause_not_stated_by_operator","final_operations_status_pending"]',
  lifecycle_evidence_date = '2026-07-23',
  last_verified_at = '2026-07-29',
  next_review_at = '2026-08-05',
  freshness_status = 'current',
  updated_at = '2026-07-29'
WHERE kind = 'cex' AND slug = 'bitmex' AND lifecycle = 'dead';

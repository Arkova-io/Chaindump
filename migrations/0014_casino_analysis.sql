-- Citation-first Web3 casino research model.
-- This migration creates the normalized storage contract only. The initial
-- 25-case research cohort remains in docs until every case passes editorial
-- evidence review; drafts must not enter production trend aggregates.

CREATE TABLE IF NOT EXISTS casino_cases (
  case_id TEXT PRIMARY KEY,
  brand_name TEXT NOT NULL,
  entity_kind TEXT NOT NULL CHECK (entity_kind IN (
    'custodial_operator',
    'onchain_casino',
    'betting_exchange',
    'bankroll_protocol',
    'gaming_infrastructure'
  )),
  product_subtype TEXT NOT NULL CHECK (product_subtype IN (
    'casino',
    'sportsbook',
    'casino_and_sportsbook',
    'poker',
    'betting_exchange',
    'prediction_market',
    'bankroll',
    'infrastructure'
  )),
  legal_operator TEXT,
  parent_entity TEXT,
  primary_domain TEXT NOT NULL,
  launched TEXT,
  date_precision TEXT NOT NULL DEFAULT 'unknown' CHECK (date_precision IN (
    'day', 'month', 'year', 'unknown'
  )),
  custody_model TEXT NOT NULL CHECK (custody_model IN (
    'custodial', 'noncustodial', 'hybrid', 'not_applicable'
  )),
  chains TEXT NOT NULL DEFAULT '[]',
  product_scope_note TEXT,
  status TEXT NOT NULL CHECK (status IN (
    'active',
    'restricted',
    'paused',
    'wind_down_announced',
    'inactive',
    'insolvent',
    'superseded',
    'unknown'
  )),
  status_as_of TEXT NOT NULL,
  outcome_label TEXT NOT NULL DEFAULT 'unclassified' CHECK (outcome_label IN (
    'successful',
    'middling',
    'declining',
    'failed',
    'recovering',
    'unclassified'
  )),
  outcome_as_of TEXT,
  outcome_rule_id TEXT,
  token_status TEXT NOT NULL CHECK (token_status IN (
    'documented',
    'none_explicit',
    'no_official_token_identified',
    'not_applicable',
    'unknown'
  )),
  token_symbol TEXT,
  token_name TEXT,
  token_contracts TEXT NOT NULL DEFAULT '[]',
  token_launch_date TEXT,
  token_utility TEXT,
  token_fee_revenue_rights TEXT,
  token_supply TEXT NOT NULL DEFAULT '{}',
  cohort_id TEXT NOT NULL,
  cohort_role TEXT NOT NULL DEFAULT 'case' CHECK (cohort_role IN (
    'case', 'control'
  )),
  selection_rule_id TEXT NOT NULL,
  selection_as_of TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  completeness_pct REAL NOT NULL DEFAULT 0 CHECK (
    completeness_pct >= 0 AND completeness_pct <= 100
  ),
  quality_passed INTEGER NOT NULL DEFAULT 0 CHECK (quality_passed IN (0, 1)),
  human_review_required INTEGER NOT NULL DEFAULT 0 CHECK (
    human_review_required IN (0, 1)
  ),
  unsourced_fields TEXT NOT NULL DEFAULT '[]',
  last_reviewed TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_casino_cases_kind
  ON casino_cases(entity_kind, product_subtype);
CREATE INDEX IF NOT EXISTS idx_casino_cases_status
  ON casino_cases(status, outcome_label);
CREATE INDEX IF NOT EXISTS idx_casino_cases_cohort
  ON casino_cases(cohort_id, quality_passed);

CREATE TABLE IF NOT EXISTS casino_sources (
  source_id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL,
  archive_url TEXT,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  published_at TEXT,
  accessed_at TEXT NOT NULL,
  source_tier TEXT NOT NULL CHECK (source_tier IN ('A', 'B', 'C', 'D')),
  source_role TEXT NOT NULL CHECK (source_role IN (
    'primary', 'independent', 'aggregator'
  )),
  content_hash TEXT,
  resolving INTEGER NOT NULL DEFAULT 1 CHECK (resolving IN (0, 1)),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_casino_sources_publisher
  ON casino_sources(publisher, source_tier);

CREATE TABLE IF NOT EXISTS casino_claims (
  claim_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES casino_cases(case_id) ON DELETE CASCADE,
  field_path TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES casino_sources(source_id),
  evidence_locator TEXT NOT NULL,
  claim_type TEXT NOT NULL CHECK (claim_type IN (
    'identity',
    'status',
    'token',
    'chain',
    'licence',
    'metric',
    'event',
    'risk',
    'context'
  )),
  support_direction TEXT NOT NULL CHECK (support_direction IN (
    'supports', 'contradicts', 'context_only'
  )),
  analyst_note TEXT,
  checked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_casino_claims_case_field
  ON casino_claims(case_id, field_path);
CREATE INDEX IF NOT EXISTS idx_casino_claims_source
  ON casino_claims(source_id);

-- A licence is an observation about a particular legal entity, domain, activity
-- and jurisdiction.  It must not be reduced to a global `licensed` boolean.
CREATE TABLE IF NOT EXISTS casino_licences (
  licence_observation_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES casino_cases(case_id) ON DELETE CASCADE,
  authority TEXT NOT NULL,
  licence_id TEXT,
  legal_entity TEXT,
  domains TEXT NOT NULL DEFAULT '[]',
  activities TEXT NOT NULL DEFAULT '[]',
  jurisdiction TEXT NOT NULL,
  licence_status TEXT NOT NULL CHECK (licence_status IN (
    'active', 'suspended', 'revoked', 'expired', 'unknown'
  )),
  valid_from TEXT,
  valid_until TEXT,
  as_of TEXT NOT NULL,
  source_claim_ids TEXT NOT NULL DEFAULT '[]',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_casino_licences_case_jurisdiction
  ON casino_licences(case_id, jurisdiction, licence_status);

CREATE TABLE IF NOT EXISTS casino_observations (
  observation_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES casino_cases(case_id) ON DELETE CASCADE,
  metric_dimension TEXT NOT NULL,
  value REAL,
  unit TEXT NOT NULL,
  currency TEXT,
  window_start TEXT,
  window_end TEXT,
  window_definition TEXT NOT NULL,
  as_of TEXT NOT NULL,
  product_scope TEXT NOT NULL,
  chain_scope TEXT NOT NULL DEFAULT '[]',
  method TEXT NOT NULL,
  formula TEXT,
  raw_input_ids TEXT NOT NULL DEFAULT '[]',
  source_claim_ids TEXT NOT NULL DEFAULT '[]',
  quality_flags TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_casino_observations_aggregate
  ON casino_observations(metric_dimension, unit, currency, window_definition, as_of);
CREATE INDEX IF NOT EXISTS idx_casino_observations_case
  ON casino_observations(case_id, metric_dimension);

CREATE TABLE IF NOT EXISTS casino_events (
  event_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES casino_cases(case_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'launch',
    'token_launch',
    'licence_granted',
    'licence_suspended',
    'licence_revoked',
    'market_exit',
    'exploit',
    'pause',
    'withdrawal_restriction',
    'leadership_change',
    'migration',
    'rebrand',
    'wind_down_announcement',
    'operations_ceased',
    'insolvency',
    'acquisition'
  )),
  event_date TEXT NOT NULL,
  date_precision TEXT NOT NULL CHECK (date_precision IN (
    'day', 'month', 'year', 'unknown'
  )),
  amount_usd REAL,
  description TEXT NOT NULL,
  source_claim_ids TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_casino_events_case_date
  ON casino_events(case_id, event_date);

-- Narrative is stored separately from facts so a reviewer can trace each
-- sentence to claim/observation IDs without duplicating the raw evidence.
CREATE TABLE IF NOT EXISTS casino_syntheses (
  case_id TEXT PRIMARY KEY REFERENCES casino_cases(case_id) ON DELETE CASCADE,
  present_situation TEXT,
  business_mechanism TEXT,
  token_contribution TEXT,
  chain_dependence TEXT,
  risk_legal_posture TEXT,
  success_failure_hypotheses TEXT,
  counterfactual TEXT,
  outlook TEXT NOT NULL DEFAULT '{}',
  lessons_learned TEXT NOT NULL DEFAULT '[]',
  source_claim_ids TEXT NOT NULL DEFAULT '[]',
  analyst_id TEXT,
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS casino_coverage (
  cohort_id TEXT PRIMARY KEY,
  universe_as_of TEXT NOT NULL,
  target_count INTEGER NOT NULL,
  quality_passed_count INTEGER NOT NULL DEFAULT 0,
  partial_count INTEGER NOT NULL DEFAULT 0,
  missing_count INTEGER NOT NULL DEFAULT 0,
  methodology_version TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

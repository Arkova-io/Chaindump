-- Azuro is a protocol-infrastructure control, not a claim that any particular
-- frontend is legal or commercially successful. The published record exposes
-- deployment, product, custody, token and legal-scope evidence separately.
INSERT OR REPLACE INTO casino_sources
  (source_id, canonical_url, title, publisher, accessed_at, source_tier, source_role, resolving, evidence_reviewed, evidence_reviewed_at, evidence_reviewer, notes)
VALUES
  ('casino:source:azuro:overview', 'https://gem.azuro.org/knowledge-hub/introduction/what-is-azuro', 'What Is Azuro?', 'Azuro Documentation', '2026-07-29', 'B', 'primary', 1, 1, '2026-07-29', 'chaindump-editorial', 'Product architecture and shared-liquidity source.'),
  ('casino:source:azuro:deployments', 'https://gem.azuro.org/hub/blockchains/deployment-addresses', 'Deployment Addresses', 'Azuro Documentation', '2026-07-29', 'B', 'primary', 1, 1, '2026-07-29', 'chaindump-editorial', 'Versioned production-deployment and current developer-surface source.'),
  ('casino:source:azuro:tokenomics', 'https://gem.azuro.org/knowledge-hub/azur/tokenomics', 'AZUR Tokenomics', 'Azuro Documentation', '2026-07-29', 'B', 'primary', 1, 1, '2026-07-29', 'chaindump-editorial', 'Canonical token contract and declared supply source; not a current market snapshot.'),
  ('casino:source:azuro:staking', 'https://gem.azuro.org/knowledge-hub/azur/st-azur', 'stAZUR', 'Azuro Documentation', '2026-07-29', 'B', 'primary', 1, 1, '2026-07-29', 'chaindump-editorial', 'Staking and operator-described rewards mechanism source.'),
  ('casino:source:azuro:pazur', 'https://gem.azuro.org/knowledge-hub/azur/p-azur', 'pAZUR', 'Azuro Documentation', '2026-07-29', 'B', 'primary', 1, 1, '2026-07-29', 'chaindump-editorial', 'Two-year locking and variable USDT-distribution mechanism source.'),
  ('casino:source:azuro:terms', 'https://gem.azuro.org/terms-of-use', 'Azuro Terms of Use', 'Azuro DAO', '2026-07-29', 'B', 'primary', 1, 1, '2026-07-29', 'chaindump-editorial', 'Interface/DAO jurisdictional restriction and custody-scope source; not a gaming-licence record.');

INSERT OR REPLACE INTO casino_cases
  (case_id, brand_name, entity_kind, product_subtype, legal_operator, parent_entity, primary_domain, launched, date_precision, custody_model, chains, product_scope_note, status, status_as_of, outcome_label, outcome_as_of, outcome_rule_id, token_status, token_symbol, token_name, token_contracts, token_launch_date, token_utility, token_fee_revenue_rights, token_supply, cohort_id, cohort_role, selection_rule_id, selection_as_of, confidence, completeness_pct, quality_passed, human_review_required, unsourced_fields, last_reviewed, updated_at)
VALUES
  ('azuro', 'Azuro', 'gaming_infrastructure', 'prediction_market', NULL, NULL, 'azuro.org', NULL, 'unknown', 'noncustodial', '["Polygon","Gnosis","Base","Chiliz","Arbitrum","Linea"]',
   'Azuro is protocol infrastructure used by independent prediction and betting applications, not a single B2C casino. V3 production deployments are documented on Polygon, Gnosis, Base and Chiliz; V2 documentation also names Arbitrum and Linea. App-level legality and operation require separate assessment.',
   'active', '2026-07-29', 'unclassified', '2026-07-29', 'casino-outcome-v1-no-comparable-financial-metric',
   'documented', 'AZUR', 'AZUR', '[{"chain":"Ethereum","address":"0x9E6be44cC1236eEf7e1f197418592D363BedCd5A","contract_role":"AZUR ERC-20"}]', NULL,
   'Official documentation describes staking AZUR into stAZUR and a separate two-year-lock pAZUR position. This does not make every AZUR holder a protocol-revenue recipient.',
   'Official documentation describes pAZUR holders, after locking stAZUR for two years, as eligible for variable USDT distributions attributed to protocol activity. It is an operator-documented mechanism, not an audited revenue observation or guaranteed return.', '{"declared_total_supply":1000000000,"initial_circulating_supply":152000000,"unit":"AZUR","current_circulating_supply":null}',
   'web3-casino-initial-2026-07-29', 'case', 'casino-initial-v1', '2026-07-29', 'medium', 78, 1, 0, '["launch_date","legal_operator","gaming_licence","protocol_wagers","protocol_revenue","active_bettors","current_liquidity","current_token_circulating_supply"]', '2026-07-29', '2026-07-29');

INSERT OR REPLACE INTO casino_claims
  (claim_id, case_id, field_path, source_id, evidence_locator, claim_type, support_direction, analyst_note, checked_at)
VALUES
  ('casino:claim:azuro:identity', 'azuro', 'identity.product', 'casino:source:azuro:overview', 'Documentation describes decentralized prediction-market infrastructure using virtual AMMs and singleton liquidity.', 'identity', 'supports', 'Infrastructure classification; no single consumer operator is inferred.', '2026-07-29'),
  ('casino:claim:azuro:mechanism', 'azuro', 'business.mechanism', 'casino:source:azuro:overview', 'Documentation separates applications, protocol and DAO and describes application access to shared liquidity.', 'context', 'supports', 'This describes the documented design, not current usage.', '2026-07-29'),
  ('casino:claim:azuro:status', 'azuro', 'status.active', 'casino:source:azuro:deployments', 'Current versioned production-contract tables and 2026 developer documentation.', 'status', 'supports', 'Supports an active maintained deployment surface, not commercial scale.', '2026-07-29'),
  ('casino:claim:azuro:custody', 'azuro', 'identity.custody_model', 'casino:source:azuro:terms', 'Terms state the interface and DAO do not possess or control user assets or private keys.', 'context', 'supports', 'Noncustodial classification is limited to the cited interface/DAO custody statement.', '2026-07-29'),
  ('casino:claim:azuro:chains', 'azuro', 'chains', 'casino:source:azuro:deployments', 'Versioned V2 and V3 production-deployment tables name Polygon, Gnosis, Base, Chiliz, Arbitrum and Linea.', 'chain', 'supports', 'Versioned contract availability is not proof of equal demand on every chain.', '2026-07-29'),
  ('casino:claim:azuro:token-contract', 'azuro', 'token.contract', 'casino:source:azuro:tokenomics', 'Tokenomics page identifies AZUR as an Ethereum ERC-20 and gives the canonical contract address.', 'token', 'supports', 'Contract identity only.', '2026-07-29'),
  ('casino:claim:azuro:token-supply', 'azuro', 'token.supply', 'casino:source:azuro:tokenomics', 'Declared total supply is 1 billion AZUR and initial circulating supply is 152 million.', 'token', 'supports', 'Declared and initial values; not a current supply reading.', '2026-07-29'),
  ('casino:claim:azuro:staking', 'azuro', 'token.utility', 'casino:source:azuro:staking', 'stAZUR documentation describes staking AZUR and a variable reward mechanism tied to protocol activity.', 'token', 'supports', 'No APR, current distribution, or revenue claim is made.', '2026-07-29'),
  ('casino:claim:azuro:revenue-right', 'azuro', 'token.fee_revenue_rights', 'casino:source:azuro:pazur', 'pAZUR documentation describes a two-year stAZUR lock and variable USDT distributions.', 'token', 'supports', 'Conditional mechanism only; not an automatic liquid-AZUR right.', '2026-07-29'),
  ('casino:claim:azuro:legal-scope', 'azuro', 'legal.scope', 'casino:source:azuro:terms', 'Terms apply to the Azuro DAO website/interface, restrict specified jurisdictions and distinguish the interface from protocol transactions.', 'licence', 'context_only', 'No gaming licence, legal operator, or independent-app legality conclusion is inferred.', '2026-07-29');

INSERT OR REPLACE INTO casino_observations
  (observation_id, case_id, metric_dimension, value, unit, currency, window_start, window_end, window_definition, as_of, product_scope, chain_scope, method, formula, raw_input_ids, source_claim_ids, quality_flags)
VALUES
  ('casino:observation:azuro:declared-total-supply:2026-07-29', 'azuro', 'declared_token_total_supply', 1000000000, 'AZUR', NULL, NULL, NULL, 'official tokenomics declaration', '2026-07-29', 'AZUR token', '["Ethereum"]', 'operator documentation', 'declared total supply', '[]', '["casino:claim:azuro:token-supply"]', '["not_current_circulating_supply","not_market_metric"]'),
  ('casino:observation:azuro:initial-circulating-supply:2026-07-29', 'azuro', 'initial_token_circulating_supply', 152000000, 'AZUR', NULL, NULL, NULL, 'token-generation initial supply', '2026-07-29', 'AZUR token', '["Ethereum"]', 'operator documentation', 'initial declared circulating supply', '[]', '["casino:claim:azuro:token-supply"]', '["historical_initial_value","not_current_supply","not_market_metric"]');

INSERT OR REPLACE INTO casino_syntheses
  (case_id, present_situation, business_mechanism, token_contribution, chain_dependence, risk_legal_posture, success_failure_hypotheses, counterfactual, outlook, lessons_learned, source_claim_ids, analyst_id, reviewed_at)
VALUES
  ('azuro',
   'Azuro maintains current multi-chain prediction-market infrastructure, versioned production contracts and a current developer documentation surface. This supports active status, but not a successful commercial outcome.',
   'Independent applications connect to a documented virtual-AMM and shared-liquidity protocol. LP capital underwrites markets while frontends compete on distribution and user experience.',
   'AZUR has a documented Ethereum contract and staking/locking paths. The documented distribution path is conditional on converting and locking into pAZUR; it is not an automatic right attached to liquid AZUR.',
   'The design has version-specific EVM deployments across several chains. Multi-chain availability reduces dependence on one chain but fragments contract versions and does not prove demand on every deployment.',
   'No gaming licence or legal operator was verified. Interface terms restrict specified jurisdictions and separate the interface from protocol transactions; independent applications can have different legal entities, controls and availability.',
   'Hypothesis only: pooled liquidity and reusable application infrastructure could lower launch cost for betting frontends. Failure could occur if frontend distribution, bettor demand or LP economics do not materialize despite functional infrastructure. Comparable activity and revenue series are absent.',
   'A single canonical sportsbook would simplify measurement and legal attribution but remove the multi-app distribution thesis and introduce a central-interface dependency.',
   '{"as_of":"2026-07-29","classification":"unclassified","watch":["Version migrations and active applications","Reproducible wager, fee and pool-liquidity series","LP returns and actual pAZUR distributions","Primary legal-entity and licence evidence for each application"]}',
   '["Protocol deployment is not adoption.","Multi-chain breadth is not chain-product fit.","Documented token revenue plumbing is not evidence that distributions are material or sustainable."]',
   '["casino:claim:azuro:identity","casino:claim:azuro:mechanism","casino:claim:azuro:status","casino:claim:azuro:custody","casino:claim:azuro:chains","casino:claim:azuro:token-contract","casino:claim:azuro:token-supply","casino:claim:azuro:staking","casino:claim:azuro:revenue-right","casino:claim:azuro:legal-scope"]', 'chaindump-editorial', '2026-07-29');

UPDATE casino_coverage
SET quality_passed_count = 4, partial_count = 21, updated_at = '2026-07-29'
WHERE cohort_id = 'web3-casino-initial-2026-07-29';

-- Source-reviewed SX Bet betting-exchange dossier. Published scope is limited
-- to the documented product, custody, chain configuration, token reference and
-- fee schedule; it makes no legal-availability or activity-scale assertion.
INSERT OR REPLACE INTO casino_sources
  (source_id, canonical_url, title, publisher, accessed_at, source_tier, source_role, resolving, evidence_reviewed, evidence_reviewed_at, evidence_reviewer, notes)
VALUES
  ('casino:source:sxbet:overview', 'https://docs.sx.bet/user-guides/getting-started/overview.md', 'SX Bet Overview', 'SX Bet Documentation', '2026-07-29', 'B', 'primary', 1, 1, '2026-07-29', 'chaindump-editorial', 'Product, peer-to-peer model and published fee-schedule source.'),
  ('casino:source:sxbet:how', 'https://docs.sx.bet/user-guides/getting-started/how-it-works.md', 'How Does SX Bet Work?', 'SX Bet Documentation', '2026-07-29', 'B', 'primary', 1, 1, '2026-07-29', 'chaindump-editorial', 'Non-custody, escrow and USDC-settlement source.'),
  ('casino:source:sxbet:references', 'https://docs.sx.bet/api-reference/references.md', 'SX Bet API References', 'SX Bet Documentation', '2026-07-29', 'B', 'primary', 1, 1, '2026-07-29', 'chaindump-editorial', 'Mainnet chain ID, application, RPC, explorer and USDC-address source.'),
  ('casino:source:sxbet:rewards', 'https://docs.sx.bet/user-guides/rewards/maker-rewards.md', 'SX Bet Maker Rewards', 'SX Bet Documentation', '2026-07-29', 'B', 'primary', 1, 1, '2026-07-29', 'chaindump-editorial', 'Documented USDC liquidity-incentive and SX-token gas reference.'),
  ('casino:source:sxbet:rules', 'https://docs.sx.bet/user-guides/more/betting-rules.md', 'SX Bet Betting Rules', 'SX Bet Documentation', '2026-07-29', 'B', 'primary', 1, 1, '2026-07-29', 'chaindump-editorial', 'Settlement-rule scope only; this is not a licence or jurisdictional-availability source.');

INSERT OR REPLACE INTO casino_cases
  (case_id, brand_name, entity_kind, product_subtype, legal_operator, parent_entity, primary_domain, launched, date_precision, custody_model, chains, product_scope_note, status, status_as_of, outcome_label, outcome_as_of, outcome_rule_id, token_status, token_symbol, token_name, token_contracts, token_launch_date, token_utility, token_fee_revenue_rights, token_supply, cohort_id, cohort_role, selection_rule_id, selection_as_of, confidence, completeness_pct, quality_passed, human_review_required, unsourced_fields, last_reviewed, updated_at)
VALUES
  ('sx-bet', 'SX Bet', 'betting_exchange', 'sportsbook', NULL, NULL, 'sx.bet', NULL, 'unknown', 'noncustodial', '["SX mainnet (chain ID 4162)"]',
   'This dossier covers SX Bet''s documented peer-to-peer sports-prediction market and mainnet exchange configuration. It does not assert licence status or availability in any jurisdiction.',
   'active', '2026-07-29', 'unclassified', '2026-07-29', 'casino-outcome-v1-no-comparable-financial-metric',
   'documented', 'SX', 'SX Token', '[]', NULL, 'Documentation describes SX Token as needed for network gas when claiming maker rewards; this does not establish token value capture.', NULL, '{}',
   'web3-casino-initial-2026-07-29', 'case', 'casino-initial-v1', '2026-07-29', 'medium', 75, 1, 0, '["launched","legal_operator","licence","jurisdictional_availability","token_contract","token_launch_date","comparable_operating_metric"]', '2026-07-29', '2026-07-29');

INSERT OR REPLACE INTO casino_claims
  (claim_id, case_id, field_path, source_id, evidence_locator, claim_type, support_direction, analyst_note, checked_at)
VALUES
  ('casino:claim:sxbet:identity', 'sx-bet', 'identity.product', 'casino:source:sxbet:overview', '“Sports Prediction Market” and “Bet against other bettors — not the house”', 'identity', 'supports', 'Product is described as peer-to-peer, not a house sportsbook.', '2026-07-29'),
  ('casino:claim:sxbet:status', 'sx-bet', 'status.active', 'casino:source:sxbet:references', 'Current mainnet API, application, RPC, explorer and metadata references', 'status', 'supports', 'Current developer documentation supports active configuration, not volume or legal availability.', '2026-07-29'),
  ('casino:claim:sxbet:custody', 'sx-bet', 'identity.custody_model', 'casino:source:sxbet:how', '“SX Bet is non-custodial — your funds stay in your personal wallet” and escrow flow', 'context', 'supports', 'Non-custodial classification is scoped to described user-fund custody.', '2026-07-29'),
  ('casino:claim:sxbet:chain', 'sx-bet', 'chains', 'casino:source:sxbet:references', 'Mainnet table records chain ID 4162, application, RPC and explorer', 'chain', 'supports', 'Uses the operator''s documented mainnet identifier; no broader multichain claim.', '2026-07-29'),
  ('casino:claim:sxbet:token', 'sx-bet', 'token.symbol', 'casino:source:sxbet:rewards', 'Claiming rewards requires a small amount of “SX Token” for network gas fees', 'token', 'supports', 'Token reference does not establish contract, launch date, supply or value capture.', '2026-07-29'),
  ('casino:claim:sxbet:fee', 'sx-bet', 'observations.single_bet_fee_pct', 'casino:source:sxbet:overview', 'Overview fee table: single bets 0%; winning parlays 5%', 'metric', 'supports', 'Published fee schedule, not trading volume, revenue or liquidity.', '2026-07-29'),
  ('casino:claim:sxbet:legal-scope', 'sx-bet', 'legal.scope', 'casino:source:sxbet:rules', 'Sport-specific betting rules and settlement links', 'licence', 'context_only', 'Rules document product settlement; no licence or jurisdiction conclusion is inferred.', '2026-07-29');

INSERT OR REPLACE INTO casino_observations
  (observation_id, case_id, metric_dimension, value, unit, currency, window_start, window_end, window_definition, as_of, product_scope, chain_scope, method, formula, raw_input_ids, source_claim_ids, quality_flags)
VALUES
  ('casino:observation:sxbet:single-bet-fee:2026-07-29', 'sx-bet', 'documented_single_bet_fee_pct', 0, 'percent', NULL, NULL, NULL, 'current documentation fee schedule', '2026-07-29', 'single bets on SX Bet', '["SX mainnet (chain ID 4162)"]', 'Read the published single-bet fee row; do not convert it into revenue or activity.', 'published single-bet fee percentage', '[]', '["casino:claim:sxbet:fee"]', '["not_an_activity_metric","not_comparable_to_wager_or_revenue"]');

INSERT OR REPLACE INTO casino_syntheses
  (case_id, present_situation, business_mechanism, token_contribution, chain_dependence, risk_legal_posture, success_failure_hypotheses, counterfactual, outlook, lessons_learned, source_claim_ids, analyst_id, reviewed_at)
VALUES
  ('sx-bet',
   'Current operator documentation presents a live mainnet peer-to-peer sports-prediction market with a documented application, API, RPC, explorer and USDC configuration. No wager, fee-revenue, TVL, user, or valuation figure is published in this dossier.',
   'Makers post limit orders and takers fill them; users authorize transfers from personal wallets and the documented flow places matched stakes in escrow until settlement. The fee schedule states 0% on single bets and 5% on winning parlays.',
   'SX Token is documented as gas needed to claim maker rewards. This dossier does not infer a token contract, supply, launch date, fee right, or economic value capture.',
   'The current mainnet documentation identifies chain ID 4162 and SX-operated RPC/explorer endpoints. It is a deployment/configuration fact, not proof that the chain causes market success.',
   'The reviewed rules describe settlement scope only. No licence, legal operator, jurisdictional availability, consumer-protection, or global legality conclusion is published.',
   'Outcome is unclassified: current documentation establishes a product surface but supplies no comparable activity, revenue, liquidity, retention, or loss metric.',
   'A sourced time series for matched volume, maker depth, fee revenue, or active wallets could make comparison possible; current docs are not substituted with promotional claims.',
   '{"as_of":"2026-07-29","watch":["Comparable sourced series for matched wagers, liquidity depth, fee revenue, or active wallets","Primary legal-entity and jurisdictional/licence documentation","SX Token contract and value-capture evidence"]}',
   '["Non-custodial escrow language is not a legal or solvency guarantee.","A published 0% fee schedule does not prove adoption or sustainable economics."]',
   '["casino:claim:sxbet:identity","casino:claim:sxbet:status","casino:claim:sxbet:custody","casino:claim:sxbet:chain","casino:claim:sxbet:token","casino:claim:sxbet:fee","casino:claim:sxbet:legal-scope"]', 'chaindump-editorial', '2026-07-29');

UPDATE casino_coverage
SET quality_passed_count = 3, partial_count = 22, updated_at = '2026-07-29'
WHERE cohort_id = 'web3-casino-initial-2026-07-29';

-- Initial publishable casino-analysis cohort.
--
-- This deliberately promotes only two of the 25 research candidates. Each row
-- has direct, reviewed source evidence for its product/onchain model, a scoped
-- legal posture, operating-state claim and a non-financial, clearly-labelled
-- metric snapshot. The other 23 candidates remain unpublished research pending.

INSERT OR REPLACE INTO casino_sources
  (source_id, canonical_url, title, publisher, accessed_at, source_tier, source_role,
   resolving, evidence_reviewed, evidence_reviewed_at, evidence_reviewer, notes)
VALUES -- NOSONAR: citation-linked seed data intentionally repeats foreign keys and review metadata.
  ('casino:source:overtime:terms', 'https://docs.overtime.io/resources/terms-of-use', 'Overtime Terms of Use', 'Overtime Documentation', '2026-07-29', 'B', 'primary', 1, 1, '2026-07-29', 'chaindump-editorial', 'Scope source: permissionless smart-contract software and jurisdictional restriction language; not a licence assertion.'), -- NOSONAR
  ('casino:source:overtime:how', 'https://docs.overtime.io/learn-about-overtime/how-overtime-works', 'How Overtime Works', 'Overtime Documentation', '2026-07-29', 'B', 'primary', 1, 1, '2026-07-29', 'chaindump-editorial', 'Product and chain-deployment source.'), -- NOSONAR
  ('casino:source:overtime:faq', 'https://docs.overtime.io/get-started/faq', 'Overtime FAQ', 'Overtime Documentation', '2026-07-29', 'B', 'primary', 1, 1, '2026-07-29', 'chaindump-editorial', 'Token and non-custody source.'), -- NOSONAR
  ('casino:source:dg:poker-terms', 'https://docs.decentral.games/legal/terms-of-use', 'Decentral Games Poker Arcade Terms of Use', 'Decentral Games Documentation', '2026-07-29', 'B', 'primary', 1, 1, '2026-07-29', 'chaindump-editorial', 'Operator, product, Polygon deployment and jurisdictional-scope source.'), -- NOSONAR
  ('casino:source:dg:disclaimer', 'https://docs.decentral.games/legal/disclaimer', 'Decentral Games Notice and Disclaimer', 'Decentral Games Documentation', '2026-07-29', 'B', 'primary', 1, 1, '2026-07-29', 'chaindump-editorial', 'Explicit no-regulatory-approval statement; not a licence assertion.');

INSERT OR REPLACE INTO casino_cases
  (case_id, brand_name, entity_kind, product_subtype, legal_operator, parent_entity,
   primary_domain, launched, date_precision, custody_model, chains, product_scope_note,
   status, status_as_of, outcome_label, outcome_as_of, outcome_rule_id,
   token_status, token_symbol, token_name, token_contracts, token_launch_date,
   token_utility, token_fee_revenue_rights, token_supply, cohort_id, cohort_role,
   selection_rule_id, selection_as_of, confidence, completeness_pct, quality_passed,
   human_review_required, unsourced_fields, last_reviewed, updated_at)
VALUES -- NOSONAR: citation-linked seed data intentionally repeats reviewed source identifiers.
  ('overtime', 'Overtime', 'onchain_casino', 'sportsbook', NULL, NULL, -- NOSONAR
   'overtimemarkets.xyz', NULL, 'unknown', 'noncustodial', '["Optimism","Arbitrum","Base"]', -- NOSONAR
   'This dossier covers Overtime''s onchain sports-market protocol. It does not assert the legal availability of any interface or product in any jurisdiction.',
   'active', '2026-07-29', 'unclassified', '2026-07-29', 'casino-outcome-v1-no-comparable-financial-metric',
   'documented', 'OVER', 'Overtime token', '[]', NULL,
   'Official documentation identifies OVER as the protocol''s official token; token economics and value capture are not assessed in this initial dossier.', NULL, '{}',
   'web3-casino-initial-2026-07-29', 'case', 'casino-initial-v1', '2026-07-29', 'medium', 75, 1, 0, '["launched","token_contracts","token_launch_date","token_fee_revenue_rights","token_supply","licence","comparable_operating_metric"]', '2026-07-29', '2026-07-29'), -- NOSONAR
  ('decentral-games-poker-arcade', 'Decentral Games Poker Arcade', 'onchain_casino', 'poker', 'BAG Limited, LTD', NULL, -- NOSONAR
   'app.decentral.games', NULL, 'unknown', 'noncustodial', '["Polygon"]',
   'This dossier covers the Poker Arcade terms/product surface only. It does not generalize those terms to other Decentral Games or BAG-branded products.',
   'unknown', '2024-06-30', 'unclassified', '2026-07-29', 'casino-outcome-v1-no-comparable-financial-metric',
   'unknown', NULL, NULL, '[]', NULL, NULL, NULL, '{}',
   'web3-casino-initial-2026-07-29', 'case', 'casino-initial-v1', '2026-07-29', 'medium', 75, 1, 0, '["launched","token","token_contracts","licence","comparable_operating_metric","current_operating_status"]', '2026-07-29', '2026-07-29');

INSERT OR REPLACE INTO casino_claims
  (claim_id, case_id, field_path, source_id, evidence_locator, claim_type, support_direction, analyst_note, checked_at)
VALUES -- NOSONAR: citation-linked evidence rows intentionally repeat case and source identifiers.
  ('casino:claim:overtime:identity', 'overtime', 'identity.product', 'casino:source:overtime:how', '“complete sportsbook experience that runs entirely onchain”', 'identity', 'supports', 'Product description is attributed to Overtime documentation.', '2026-07-29'), -- NOSONAR
  ('casino:claim:overtime:status', 'overtime', 'status.active', 'casino:source:overtime:how', '“continuously provides pricing and liquidity across thousands of active sports markets”', 'status', 'supports', 'Published as active based on the current official product documentation, not as a volume ranking.', '2026-07-29'),
  ('casino:claim:overtime:chain', 'overtime', 'chains', 'casino:source:overtime:how', '“deployed across ... Optimism, Arbitrum, and Base”', 'chain', 'supports', 'Three named L2 deployments.', '2026-07-29'),
  ('casino:claim:overtime:token', 'overtime', 'token.symbol', 'casino:source:overtime:faq', '“official token is $OVER”', 'token', 'supports', 'No contract address or financial-value claim is made.', '2026-07-29'),
  ('casino:claim:overtime:custody', 'overtime', 'identity.custody_model', 'casino:source:overtime:faq', 'FAQ states that Overtime does not hold user funds.', 'context', 'supports', 'Non-custodial classification is limited to user-fund custody.', '2026-07-29'),
  ('casino:claim:overtime:legal', 'overtime', 'legal.scope', 'casino:source:overtime:terms', 'Terms say the software is permissionless and users must not use it where illegal or impermissible.', 'licence', 'supports', 'This is a user-facing terms restriction, not evidence of a licence or global legality.', '2026-07-29'), -- NOSONAR
  ('casino:claim:overtime:metric', 'overtime', 'observations.documented_deployment_chain_count', 'casino:source:overtime:how', 'Three named deployment networks: Optimism, Arbitrum, Base.', 'metric', 'supports', 'Documented-chain count only; not activity, TVL, wagers, or revenue.', '2026-07-29'),
  ('casino:claim:dg:identity', 'decentral-games-poker-arcade', 'identity.operator_product', 'casino:source:dg:poker-terms', 'Terms identify BAG Limited, LTD and app.decentral.games Poker Arcade games.', 'identity', 'supports', 'Scoped to Poker Arcade terms.', '2026-07-29'),
  ('casino:claim:dg:status', 'decentral-games-poker-arcade', 'status.unknown', 'casino:source:dg:poker-terms', 'Terms last updated 2024-06-30 describe the distributed application as “currently running on the Polygon Network”.', 'status', 'supports', 'The source supports the 2024 terms snapshot only; current operation is unknown.', '2026-07-29'),
  ('casino:claim:dg:custody', 'decentral-games-poker-arcade', 'identity.custody_model', 'casino:source:dg:poker-terms', 'Terms describe peer-to-peer play and user responsibility for private keys.', 'context', 'supports', 'Non-custodial classification is limited to the cited application posture.', '2026-07-29'),
  ('casino:claim:dg:chain', 'decentral-games-poker-arcade', 'chains', 'casino:source:dg:poker-terms', 'Terms specify Polygon Network and autonomously deployed smart contracts.', 'chain', 'supports', 'Single documented deployment chain.', '2026-07-29'),
  ('casino:claim:dg:legal', 'decentral-games-poker-arcade', 'legal.scope', 'casino:source:dg:poker-terms', 'Terms restrict unlawful use and state BVI governing law for the Poker Arcade terms.', 'licence', 'supports', 'No gaming licence is inferred.', '2026-07-29'),
  ('casino:claim:dg:no-approval', 'decentral-games-poker-arcade', 'legal.regulatory_approval', 'casino:source:dg:disclaimer', 'Disclaimer says no regulatory authority has examined or approved the information.', 'licence', 'supports', 'Evidence gap is displayed; this is not a licence conclusion.', '2026-07-29'),
  ('casino:claim:dg:metric', 'decentral-games-poker-arcade', 'observations.documented_deployment_chain_count', 'casino:source:dg:poker-terms', 'Polygon Network is the only deployment network named in the Poker Arcade terms.', 'metric', 'supports', 'Documented-chain count only; not activity, volume, or revenue.', '2026-07-29');

INSERT OR REPLACE INTO casino_observations
  (observation_id, case_id, metric_dimension, value, unit, currency, window_start, window_end,
   window_definition, as_of, product_scope, chain_scope, method, formula, raw_input_ids,
   source_claim_ids, quality_flags)
VALUES -- NOSONAR: normalized observations intentionally repeat case identifiers and as-of metadata.
  ('casino:observation:overtime:documented-deployment-chains:2026-07-29', 'overtime', 'documented_deployment_chain_count', 3, 'count', NULL, NULL, NULL,
   'point-in-time documentation snapshot', '2026-07-29', 'sportsbook protocol', '["Optimism","Arbitrum","Base"]',
   'Count distinct deployment networks explicitly named by the official product documentation.', 'COUNT(distinct named deployment networks)', '[]', '["casino:claim:overtime:metric"]', '["not_an_activity_metric","not_comparable_to_wager_or_revenue"]'),
  ('casino:observation:dg:documented-deployment-chains:2024-06-30', 'decentral-games-poker-arcade', 'documented_deployment_chain_count', 1, 'count', NULL, NULL, NULL,
   'point-in-time documentation snapshot', '2024-06-30', 'Poker Arcade product surface', '["Polygon"]',
   'Count deployment networks explicitly named in the Poker Arcade terms.', 'COUNT(distinct named deployment networks)', '[]', '["casino:claim:dg:metric"]', '["not_an_activity_metric","not_comparable_to_wager_or_revenue"]');

INSERT OR REPLACE INTO casino_syntheses
  (case_id, present_situation, business_mechanism, token_contribution, chain_dependence,
   risk_legal_posture, success_failure_hypotheses, counterfactual, outlook, lessons_learned,
   source_claim_ids, analyst_id, reviewed_at)
VALUES -- NOSONAR: normalized syntheses intentionally repeat reviewed claim identifiers.
  ('overtime',
   'Official documentation describes an active onchain sports-market protocol; the published record intentionally contains no wager, revenue, TVL, or valuation claim.',
   'A pool-versus-peer AMM provides pricing and liquidity while third-party LPs supply collateral; the documentation says market creation, trading, and settlement occur through smart contracts.',
   'OVER is documented as the official token. This initial dossier does not infer token value capture.',
   'The documentation names Optimism, Arbitrum, and Base deployments; this is a documented deployment count, not a measure of usage across those networks.',
   'The cited terms instruct users not to use the software where illegal or impermissible. No licence, legal availability, or global compliance conclusion is published.',
   'Outcome is unclassified because the current evidence set does not contain a comparable financial or activity metric.',
   'A comparable, sourced time series for settled volume, fees, or retained liquidity could make outcome analysis possible; it is not substituted with interface claims.',
   '{"as_of":"2026-07-29","watch":["Comparable onchain volume or fee series with method and scope","Any source-supported jurisdictional or licence change"]}',
   '["Do not treat permissionless deployment as a legal conclusion.","Do not rank protocol scale from deployment count."]',
   '["casino:claim:overtime:identity","casino:claim:overtime:status","casino:claim:overtime:chain","casino:claim:overtime:token","casino:claim:overtime:legal","casino:claim:overtime:metric"]', 'chaindump-editorial', '2026-07-29'),
  ('decentral-games-poker-arcade',
   'Poker Arcade terms last updated 2024-06-30 identify BAG Limited, LTD and describe a Polygon application at that date. The current operating status is unknown from the reviewed evidence set.',
   'The terms describe Poker Arcade as a peer-to-peer poker simulation using autonomously deployed smart contracts, alongside site-level account and user terms.',
   'No official protocol-token conclusion is published from the reviewed source set.',
   'Polygon is the single network named in the Poker Arcade terms. This is a documentation observation, not an activity measurement.',
   'The terms restrict unlawful use and use BVI governing law for the Poker Arcade terms. A separate Decentral Games disclaimer states that no regulatory authority has examined or approved the information. No gaming-licence conclusion is published.',
   'Outcome is unclassified because this evidence set does not support a comparable operating metric.',
   'A source-supported series for real-money participation, fees, or poker liquidity would be needed before lifecycle comparison; marketing or contract existence is not a substitute.',
   '{"as_of":"2026-07-29","watch":["Comparable activity or fee series with scope","Any primary licence or jurisdictional-status document for this exact product surface"]}',
   '["Do not generalize legal terms from one Decentral Games product surface to another.","A named chain is not proof of sustained operating activity."]',
   '["casino:claim:dg:identity","casino:claim:dg:status","casino:claim:dg:chain","casino:claim:dg:legal","casino:claim:dg:no-approval","casino:claim:dg:metric"]', 'chaindump-editorial', '2026-07-29');

INSERT OR REPLACE INTO casino_coverage
  (cohort_id, universe_as_of, target_count, quality_passed_count, partial_count, missing_count, methodology_version, updated_at)
VALUES -- NOSONAR: one cohort summary row is explicit for auditability.
  ('web3-casino-initial-2026-07-29', '2026-07-29', 25, 2, 23, 0, 'casino-dossier-v1', '2026-07-29');

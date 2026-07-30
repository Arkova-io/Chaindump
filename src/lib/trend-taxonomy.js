// Cross-vertical trend taxonomy for Chaindump forensic research.
//
// This is intentionally additive to forensic-analysis-v1. It does not rewrite
// published conclusions, and it refuses to call a one-off observation a trend.
// The taxonomy gives the UI, research desk, and future SLM export a shared
// vocabulary for "what kind of pressure is this?" without weakening the
// publication-depth gates that decide whether a specific conclusion is public.

export const TREND_TAXONOMY_VERSION = 'chaindump-trend-taxonomy-v1';
export const TREND_SIGNAL_VERSION = 'chaindump-trend-signal-v1';
export const OUTLOOK_VERSION = 'chaindump-outlook-v1';

// These are the words the reader should see before the internal taxonomy. The
// tags remain machine-readable, but every vertical gets one short explanation
// of the question the research is trying to answer. This keeps the SLM
// contract useful without making the public report read like a database dump.
export const HUMAN_INTELLIGENCE_GUIDE = Object.freeze({
  canonical_format: [
    ['What it is', 'What the project or company actually does.'],
    ['What happened', 'The important events, in order, with dates and sources.'],
    ['Why it turned out this way', 'The strategic choices and outside forces that explain the result.'],
    ['What would change the call', 'The evidence that would prove the outlook wrong or move it.'],
    ['What to watch next', 'A short list of measurable signals and the next review date.'],
  ],
  verticals: {
    blockchain: 'Does this chain create a repeatable reason to use it, and does the token capture any of that value?',
    dex: 'Does this exchange attract real traders and keep them when incentives fade, or is the activity rented?',
    cex: 'Can this exchange protect customer assets, stay compliant, and earn durable revenue in a crowded market?',
    casino: 'Is the operator legally able to serve its users, and does it have repeat paying demand after promotions?',
    nft_ordinals: 'Did the collection turn a launch moment into lasting holders, products, and founder follow-through?',
    stablecoin: 'Can holders redeem at par, and are the reserves, issuer, and legal rights strong enough to support that promise?',
    rwa: 'Does the token represent a real legal claim on an asset, with a credible custodian and a workable exit?',
    depin: 'Are people paying for a useful physical service, or are token rewards paying for activity that disappears when emissions stop?',
    treasury_company: 'Does the balance-sheet strategy create shareholder value after debt, dilution, custody, and crypto volatility?',
    etf_etp: 'Do flows, fees, liquidity, and the creation/redemption mechanism make this a useful investment vehicle?',
    regulatory_news: 'Who is affected, what changes, when does it take effect, and what evidence would change the legal reading?',
  },
});

export const REFRESHED_OUTLOOK_GUIDE = Object.freeze({
  version: 'chaindump-refreshed-outlook-v1',
  summary: 'Outlooks are dated analyst states, not evergreen blurbs. A refresh must say what changed, why it matters, what would falsify it, and which signals should be watched next.',
  required_narrative_sections: [
    'current_call',
    'prior_call',
    'change_since_last_review',
    'evidence_that_changed_the_call',
    'strategic_choices_or_constraints',
    'watch_signals',
    'unknowns_and_withheld_claims',
    'next_review_at',
  ],
  evidence_statuses: ['source_registered', 'source_reachable', 'field_cited', 'editor_reviewed', 'publication_pending', 'withheld'],
  trend_promotion_policy: {
    minimum_comparable_observations: 3,
    required: [
      'declared time window',
      'declared denominator',
      'source date or observation date',
      'metric contract',
      'entity-stable comparison key',
      'reviewer or deterministic extractor provenance',
    ],
    not_enough: [
      'one screenshot',
      'one operator claim',
      'one stale metric',
      'one incomparable metric from a different product cohort',
      'one regulatory headline without affected actor and effective date',
    ],
  },
  vertical_refresh_fields: {
    blockchain: ['killer_app_or_repeat_use', 'token_value_capture', 'security_or_uptime', 'validator_or_sequencer_risk', 'tvl_fees_users_trend', 'ecosystem_concentration', 'regulatory_or_bridge_dependency'],
    dex: ['retained_trader_activity', 'liquidity_depth', 'fee_or_revenue_quality', 'emissions_dependence', 'chain_dependence', 'token_rights_and_unlocks', 'regulatory_market_structure'],
    cex: ['withdrawal_state', 'reserve_and_liability_scope', 'licensing_status', 'product_availability', 'revenue_or_volume_quality', 'customer_asset_controls', 'jurisdiction_access'],
    casino: ['legal_operator_and_license', 'active_player_or_handle_signal', 'custody_or_bankroll_model', 'settlement_chain_or_offchain_scope', 'token_incentive_dependence', 'payout_state', 'jurisdiction_risk'],
    nft_ordinals: ['holder_retention', 'realized_sales_depth', 'founder_activity', 'product_or_ip_followthrough', 'royalty_or_treasury_capture', 'chain_dependence', 'community_sentiment_shift'],
    stablecoin: ['issuer_authorization', 'redemption_right', 'reserve_composition', 'attestation_freshness', 'custodian_concentration', 'supply_and_liquidity_by_chain', 'depeg_recovery'],
    rwa: ['legal_claim', 'custodian_or_spv', 'nav_supply_reconciliation', 'redemption_window', 'transfer_restrictions', 'collateral_concentration', 'issuer_disclosure'],
    depin: ['paying_demand', 'useful_work_utilization', 'node_quality', 'revenue_excluding_emissions', 'operator_concentration', 'capex_payback', 'token_emissions'],
    treasury_company: ['asset_units_and_cost_basis', 'mnav_premium_discount', 'debt_maturity', 'pledged_assets', 'custody', 'dilution', 'operating_cash_flow'],
    etf_etp: ['aum_and_flows', 'nav_premium_discount', 'spread_and_volume', 'fee', 'creation_redemption_mode', 'custodian', 'collateral_or_staking_policy'],
    regulatory_news: ['authority', 'instrument', 'affected_actors', 'affected_products', 'effective_date', 'transition_deadline', 'obligations', 'appeal_or_enforcement_status'],
  },
});

const TREND_DRIVER_DOMAIN_ROWS = Object.freeze([
  ['distribution', 'Distribution', 'Embedded channels, wallets, exchanges, IP, geography, and repeatable acquisition.', ['distribution_advantage', 'wallet_or_exchange_funnel', 'brand_ip_reach', 'geographic_reach']],
  ['demand_retention', 'Demand retention', 'Paying use, retained users, repeat activity, active builders, and recurring demand.', ['organic_fee_demand', 'retained_users', 'active_builders', 'repeat_transactions']],
  ['capital_liquidity', 'Capital & liquidity', 'TVL, depth, net flows, reserves, collateral, redemption capacity, and liquidity reflexivity.', ['liquidity_reflexivity', 'reserve_quality', 'collateral_quality', 'redemption_capacity']],
  ['unit_economics', 'Unit economics', 'Fees, revenue, take rate, margins, runway, and emissions-adjusted economics.', ['fee_capture', 'revenue_quality', 'subsidy_dependence', 'treasury_runway']],
  ['token_design', 'Token design', 'Launch timing, allocation, unlocks, emissions, governance, rights, and value capture.', ['token_value_capture', 'unlock_pressure', 'emissions_design', 'holder_rights']],
  ['product_execution', 'Product execution', 'Differentiation, killer apps, delivery, migration quality, and product-market fit.', ['killer_app', 'migration_execution', 'roadmap_delivery', 'product_differentiation']],
  ['security_reliability', 'Security & reliability', 'Exploits, outages, custody failures, oracle failures, bridge risk, and operational resilience.', ['security_failure', 'custody_failure', 'oracle_failure', 'bridge_dependency', 'outage_reliability']],
  ['governance_organization', 'Governance & organization', 'Founder continuity, control keys, treasury controls, disclosure, and governance capture.', ['founder_continuity', 'governance_capture', 'control_key_risk', 'disclosure_quality']],
  ['dependency_concentration', 'Dependency concentration', 'Reliance on one chain, operator, custodian, sequencer, issuer, liquidity source, or IP owner.', ['single_dependency', 'custodian_concentration', 'sequencer_dependency', 'issuer_dependency']],
  ['competition_market_structure', 'Competition & market structure', 'Share, fragmentation, switching costs, fee compression, and vertical integration.', ['fee_compression', 'switching_costs', 'fragmentation', 'vertical_integration']],
  ['regulation_compliance', 'Regulation & compliance', 'Licensing, enforcement, reporting, AML/sanctions, tax, consumer protection, and transition deadlines.', ['regulatory_fit', 'licensing_gap', 'reporting_obligation', 'sanctions_exposure']],
  ['lifecycle_shock', 'Lifecycle shock', 'Launch, depeg, hack, halt, acquisition, shutdown, bankruptcy, restructuring, or recovery events.', ['launch_shock', 'depeg_event', 'shutdown_event', 'bankruptcy_event', 'recovery_event']],
  ['evidence_quality', 'Evidence quality', 'Stale, contradictory, incomparable, missing-denominator, inaccessible, or unverifiable evidence.', ['stale_evidence', 'contradictory_sources', 'missing_denominator', 'incomparable_metric']],
]);

export const TREND_DRIVER_DOMAINS = Object.freeze(
  TREND_DRIVER_DOMAIN_ROWS.map(([id, label, description, mechanism_tags]) => ({
    id,
    label,
    description,
    mechanism_tags,
  })),
);

export const TREND_CATEGORIES = Object.freeze([
  ...TREND_DRIVER_DOMAINS.map((domain) => ({
    id: domain.id,
    label: domain.label,
    domains: ['all'],
    question: domain.description,
    slm_features: domain.mechanism_tags,
  })),
  {
    id: 'distribution_moat',
    label: 'Distribution moat',
    domains: ['all'],
    question: 'Does this entity have a durable acquisition, wallet, exchange, brand, IP, or geographic channel that competitors cannot cheaply copy?',
    slm_features: ['distribution_advantage', 'wallet_or_exchange_funnel', 'brand_ip_reach'],
  },
  {
    id: 'regulatory_gate',
    label: 'Regulatory gate',
    domains: ['all'],
    question: 'Does licensing, enforcement, reporting, sanctions, tax, or transition timing change who can operate and where?',
    slm_features: ['regulatory_fit', 'licensing_gap', 'reporting_obligation', 'transition_deadline'],
  },
  {
    id: 'token_value_capture',
    label: 'Token value capture',
    domains: ['blockchain', 'dex', 'cex', 'casino', 'nft_ordinals', 'stablecoin', 'rwa', 'depin'],
    question: 'Does the token capture product value, coordinate governance, or mainly subsidize demand before unlock/emission pressure?',
    slm_features: ['token_value_capture', 'unlock_pressure', 'emissions_design', 'holder_rights'],
  },
  {
    id: 'outlook_regime_change',
    label: 'Outlook regime change',
    domains: ['all'],
    question: 'Has new evidence changed the analyst call, or is the prior outlook still supported by the same dated facts?',
    slm_features: ['prior_call', 'current_call', 'evidence_delta', 'falsifier'],
  },
  {
    id: 'retention_break',
    label: 'Retention break',
    domains: ['blockchain', 'dex', 'casino', 'nft_ordinals', 'depin'],
    question: 'Did repeat users, holders, traders, players, builders, or nodes persist after launch, incentives, or hype faded?',
    slm_features: ['retained_users', 'holder_retention', 'repeat_transactions', 'incentive_decay'],
  },
  {
    id: 'access_or_jurisdiction_shift',
    label: 'Access or jurisdiction shift',
    domains: ['cex', 'dex', 'casino', 'stablecoin', 'rwa', 'etf_etp', 'regulatory_news'],
    question: 'Did a licence, enforcement action, transition deadline, product block, or jurisdiction rule change who can use or operate the product?',
    slm_features: ['jurisdiction_license', 'affected_actors', 'transition_deadline', 'product_availability'],
  },
  {
    id: 'chain_dependency_shift',
    label: 'Chain dependency shift',
    domains: ['dex', 'casino', 'nft_ordinals', 'stablecoin', 'rwa', 'depin'],
    question: 'Is success or failure explained by the host chain, bridge, sequencer, issuer, wallet, or distribution layer rather than the project alone?',
    slm_features: ['primary_chain', 'bridge_dependency', 'sequencer_dependency', 'issuer_dependency'],
  },
]);

export const TREND_ENUMS = Object.freeze({
  statement_type: ['observation', 'state_tag', 'trend', 'causal_hypothesis', 'outlook_revision', 'regulatory_signal'],
  observed_direction: ['increasing', 'decreasing', 'stable', 'volatile', 'discontinuous', 'unknown'],
  outlook_effect: ['positive', 'negative', 'mixed', 'neutral', 'unknown'],
  lifecycle_pressure: ['upside', 'recovery', 'neutral', 'downside', 'terminal', 'unknown'],
  state: ['candidate', 'verified', 'disputed', 'superseded', 'invalidated', 'stale', 'withheld'],
  evidence_level: ['authority', 'first_party', 'reviewed_independent', 'multiple_independent', 'single_report', 'operator_claim', 'unknown'],
});

export const VERTICAL_SIGNAL_CONTRACTS = Object.freeze({
  blockchain: [
    'architecture', 'settlement_model', 'vm', 'token_launch_timing', 'active_user_method',
    'fees', 'revenue', 'tvl', 'stablecoin_supply', 'dex_volume', 'validator_or_sequencer_concentration',
    'outages', 'application_concentration', 'bridge_dependence',
  ],
  dex: [
    'amm_clob_perps_or_aggregator_cohort', 'custody_model', 'chain_context', 'spot_volume',
    'perpetual_notional', 'tvl', 'open_interest', 'fees', 'protocol_or_holder_revenue',
    'liquidity_depth', 'slippage', 'emissions', 'token_rights', 'retained_traders',
  ],
  cex: [
    'spot_and_derivatives_separated', 'custody_model', 'customer_assets', 'reserve_scope',
    'liabilities', 'withdrawal_state', 'jurisdiction_license', 'product_availability',
    'filed_revenue', 'funded_accounts',
  ],
  casino: [
    'product_subtype', 'legal_operator', 'domain', 'custody_or_bankroll_model',
    'onchain_or_offchain_settlement', 'handle_ggr_revenue_separated', 'active_players',
    'payout_state', 'contract_activity', 'token_model', 'licence_by_activity_jurisdiction',
  ],
  nft_ordinals: [
    'collection_platform_or_protocol_scope', 'mint_and_supply', 'floor_plus_bid_depth',
    'realized_sales', 'unique_buyers', 'holder_concentration', 'holder_retention',
    'royalties', 'treasury', 'product_utility', 'founder_activity', 'chain_dependence',
    'lifecycle_evidence',
  ],
  stablecoin: [
    'issuer_model', 'legal_issuer', 'redemption_right', 'reserve_composition',
    'reserve_duration', 'custodian', 'attestation', 'supply_by_chain', 'liquidity_spread',
    'mint_burn', 'depeg_severity_duration_recovery', 'freeze_powers',
  ],
  rwa: [
    'underlying_asset', 'issuer_spv_custodian', 'legal_claim', 'bankruptcy_remoteness',
    'nav_vs_token_supply', 'net_yield', 'redemption_window', 'transfer_restrictions',
    'collateral_concentration', 'issuer_concentration',
  ],
  depin: [
    'service_delivered', 'paying_demand', 'revenue_excluding_emissions', 'active_nodes',
    'useful_work_utilization', 'operator_concentration', 'geographic_concentration',
    'service_quality', 'capex_payback', 'token_emissions',
  ],
  treasury_company: [
    'asset_units', 'cost_basis', 'fair_value', 'pledged_percentage', 'custody',
    'debt_maturity', 'interest', 'equity_dilution', 'mnav_premium', 'staking_yield',
    'operating_cash_flow',
  ],
  etf_etp: [
    'aum', 'net_flows', 'shares', 'nav_premium_discount', 'creation_redemption_mode',
    'fee', 'spread', 'volume', 'custodian', 'collateral',
  ],
  regulatory_news: [
    'jurisdiction', 'authority', 'instrument', 'legal_status', 'affected_actors',
    'affected_products', 'effective_date', 'transition_deadline', 'obligations',
    'enforcement_court_appeal_status',
  ],
});

export const REGULATORY_SIGNALS = Object.freeze([
  {
    id: 'eu-mica-casp-register-2026-07',
    driver_domain: 'regulation_compliance',
    statement_type: 'regulatory_signal',
    jurisdiction: 'EU',
    as_of: '2026-07-30',
    title: 'MiCA CASP authorization and non-compliance register is an entity-level exchange signal',
    summary: 'EU exchange and service-provider outlooks should track authorization, transitional status, and register appearance per legal entity rather than applying a blanket lifecycle label.',
    affected_verticals: ['cex', 'dex', 'stablecoin', 'regulatory_news'],
    source_refs: [
      {
        title: 'ESMA — Markets in Crypto-Assets Regulation (MiCA)',
        url: 'https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica',
        publisher: 'ESMA',
      },
    ],
  },
  {
    id: 'us-stablecoin-framework-2026-07',
    driver_domain: 'regulation_compliance',
    statement_type: 'regulatory_signal',
    jurisdiction: 'US',
    as_of: '2026-07-30',
    title: 'U.S. stablecoin authorization, reserves, redemption, and disclosure become SLM features',
    summary: 'Stablecoin analysis needs separate fields for permitted issuer status, one-to-one reserve quality, redemption mechanics, monthly disclosure, and regulator scope.',
    affected_verticals: ['stablecoin', 'cex', 'rwa', 'regulatory_news'],
    source_refs: [
      {
        title: 'Congress.gov — S.1582 GENIUS Act',
        url: 'https://www.congress.gov/bill/119th-congress/senate-bill/1582',
        publisher: 'Library of Congress',
      },
    ],
  },
  {
    id: 'sec-crypto-taxonomy-2026-03',
    driver_domain: 'regulation_compliance',
    statement_type: 'regulatory_signal',
    jurisdiction: 'US',
    as_of: '2026-07-30',
    title: 'SEC crypto interpretation separates asset class from transaction context',
    summary: 'Chaindump records should not collapse token type, transaction context, and lifecycle outcome into one label; asset classification and transaction context are separate features.',
    affected_verticals: ['blockchain', 'dex', 'cex', 'nft_ordinals', 'stablecoin', 'rwa', 'regulatory_news'],
    source_refs: [
      {
        title: 'SEC — SEC Clarifies the Application of Federal Securities Laws to Crypto Assets',
        url: 'https://www.sec.gov/newsroom/press-releases/2026-30-sec-clarifies-application-federal-securities-laws-crypto-assets',
        publisher: 'SEC',
      },
    ],
  },
  {
    id: 'cftc-crypto-perps-market-structure-2026-07',
    driver_domain: 'regulation_compliance',
    statement_type: 'regulatory_signal',
    jurisdiction: 'US',
    as_of: '2026-07-30',
    title: 'CFTC digital-asset derivatives and perpetual-contract signals are exchange taxonomy inputs',
    summary: 'DEX/CEX and derivatives venue outlooks should separate spot, perps, DCM/listed-contract, FCM, foreign-futures, and event-market exposure instead of using one generic exchange label.',
    affected_verticals: ['dex', 'cex', 'regulatory_news'],
    source_refs: [
      {
        title: 'CFTC — Press Releases',
        url: 'https://www.cftc.gov/PressRoom/PressReleases',
        publisher: 'CFTC',
      },
    ],
  },
  {
    id: 'ec-mica-review-consultation-2026-05',
    driver_domain: 'regulation_compliance',
    statement_type: 'regulatory_signal',
    jurisdiction: 'EU',
    as_of: '2026-07-30',
    title: 'European Commission MiCA review keeps EU crypto rules in review-active state',
    summary: 'EU regulatory analysis should tag MiCA assumptions as review-active through the 2026 consultation window and preserve separate fields for issuer, CASP, stablecoin, DeFi, and supervisory-scope questions.',
    affected_verticals: ['cex', 'dex', 'stablecoin', 'rwa', 'regulatory_news'],
    source_refs: [
      {
        title: 'European Commission — Commission seeks feedback on the functioning of EU crypto-assets rules',
        url: 'https://finance.ec.europa.eu/news/commission-seeks-feedback-functioning-eu-crypto-assets-rules-2026-05-20_en',
        publisher: 'European Commission',
      },
    ],
  },
  {
    id: 'irs-1099-da-2026',
    driver_domain: 'regulation_compliance',
    statement_type: 'regulatory_signal',
    jurisdiction: 'US',
    as_of: '2026-07-30',
    title: 'Broker reporting is an operational signal for CEXs and broker-like venues',
    summary: 'CEX and broker-like venue dossiers should track reporting obligations, covered product scope, basis availability, and operational readiness separately from solvency or product-market fit.',
    affected_verticals: ['cex', 'dex', 'regulatory_news'],
    source_refs: [
      {
        title: 'IRS — Instructions for Form 1099-DA',
        url: 'https://www.irs.gov/instructions/i1099da',
        publisher: 'IRS',
      },
    ],
  },
]);

const SIGNAL_TO_CATEGORY_IDS = Object.freeze({
  'eu-mica-casp-register-2026-07': ['regulation_compliance', 'evidence_quality'],
  'us-stablecoin-framework-2026-07': ['regulation_compliance', 'capital_liquidity', 'evidence_quality'],
  'sec-crypto-taxonomy-2026-03': ['regulation_compliance', 'token_design', 'evidence_quality'],
  'cftc-crypto-perps-market-structure-2026-07': ['regulation_compliance', 'capital_liquidity', 'competition_market_structure'],
  'ec-mica-review-consultation-2026-05': ['regulation_compliance', 'evidence_quality', 'competition_market_structure'],
  'irs-1099-da-2026': ['regulation_compliance', 'governance_organization', 'evidence_quality'],
});

function compatibilityRegulatorySignal(signal) {
  const source = signal.source_refs?.[0] || {};
  return {
    ...signal,
    trend_ids: SIGNAL_TO_CATEGORY_IDS[signal.id] || [signal.driver_domain],
    regulator: source.publisher || signal.jurisdiction,
    signal: signal.summary,
    source,
  };
}

export const OUTLOOK_CONTRACT = Object.freeze({
  version: OUTLOOK_VERSION,
  required_fields: [
    'outlook_id',
    'entity_id',
    'vertical',
    'prior_as_of',
    'current_as_of',
    'prior_lifecycle_label',
    'new_lifecycle_label',
    'forecast_horizon',
    'base_case',
    'upside_case',
    'downside_case',
    'probability_band_or_not_estimated',
    'supporting_signal_ids',
    'contradicting_signal_ids',
    'falsifier',
    'change_summary',
    'trend_promotion_basis',
    'withheld_or_unknown_claims',
    'next_review_at',
    'reviewer',
    'supersedes_outlook_id',
  ],
  publication_policy: 'Agents may propose outlook revisions, but causal, legal, lifecycle, adverse, and loss conclusions remain human-review-required before publication.',
});

export const SLM_LABEL_CONTRACT = Object.freeze({
  version: 'chaindump-slm-label-contract-v1',
  unit: 'one dated claim or withheld claim per row',
  input_features: [
    'vertical',
    'entity_id',
    'claim_path',
    'published_text_or_withheld_state',
    'metric_contract',
    'source_refs',
    'as_of',
    'last_reviewed_at',
    'next_review_at',
  ],
  supervised_labels: [
    'driver_domain',
    'trend_ids',
    'statement_type',
    'observed_direction',
    'outlook_effect',
    'lifecycle_pressure',
    'evidence_sufficiency',
    'publication_support',
    'human_review_status',
    'regulatory_status',
    'outlook_revision_needed',
  ],
  evidence_sufficiency_labels: ['supported', 'partially_supported', 'withheld_unknown', 'withheld_stale', 'contradicted', 'not_comparable'],
  split_policy: 'Use entity-stable and time-stable splits; no facts after forecast_cutoff may appear in training input for an outlook task.',
});

export const SLM_FEATURE_CONTRACT = Object.freeze({
  corpus_schema: 'chaindump-forensic-training-record-v1',
  export_policy: 'internal_redacted_public_api_snapshot',
  train_on: [
    'immutable claim/evidence snapshots',
    'supported and withheld examples',
    'human vs deterministic vs model-proposed provenance',
    'entity-stable and time-stable splits',
  ],
  never_train_on: [
    'raw source articles',
    'future facts after forecast timestamp',
    'unredacted withheld high-risk conclusions',
    'mutable live pages without snapshot metadata',
  ],
  target_tasks: [
    'observation_extraction',
    'taxonomy_classification',
    'evidence_sufficiency',
    'causal_reasoning',
    'outlook_revision_proposal',
    'refreshed_outlook_diffing',
    'regulatory_status_tracking',
  ],
});

function sourceCount(signals) {
  return new Set(signals.flatMap((signal) => (
    (signal.source_refs || []).map((source) => source.url).filter(Boolean)
  ))).size;
}

export function buildTrendTaxonomyPayload(asOf = '2026-07-30') {
  return {
    schema: TREND_TAXONOMY_VERSION,
    signal_schema: TREND_SIGNAL_VERSION,
    as_of: asOf,
    human_intelligence_guide: HUMAN_INTELLIGENCE_GUIDE,
    summary: {
      driver_domains: TREND_DRIVER_DOMAINS.length,
      trend_categories: TREND_CATEGORIES.length,
      vertical_contracts: Object.keys(VERTICAL_SIGNAL_CONTRACTS).length,
      vertical_outlook_refresh_contracts: Object.keys(REFRESHED_OUTLOOK_GUIDE.vertical_refresh_fields).length,
      regulatory_signals: REGULATORY_SIGNALS.length,
      regulatory_sources: sourceCount(REGULATORY_SIGNALS),
    },
    refreshed_outlook_guide: REFRESHED_OUTLOOK_GUIDE,
    categories: TREND_CATEGORIES,
    evidence_contract: {
      version: TREND_SIGNAL_VERSION,
      required_fields: [
        'trend_ids',
        'statement_type',
        'observed_direction',
        'outlook_effect',
        'lifecycle_pressure',
        'metric_contract',
        'claim.summary',
        'claim.as_of',
        'source_refs',
        'unknowns',
        'last_reviewed_at',
        'next_review_at',
      ],
      trend_rule: 'A trend requires at least three comparable dated observations with a declared window and denominator.',
    },
    rule: REFRESHED_OUTLOOK_GUIDE.trend_promotion_policy,
    driver_domains: TREND_DRIVER_DOMAINS,
    enums: TREND_ENUMS,
    vertical_contracts: VERTICAL_SIGNAL_CONTRACTS,
    regulatory_signals: REGULATORY_SIGNALS.map(compatibilityRegulatorySignal),
    outlook_contract: OUTLOOK_CONTRACT,
    slm_feature_contract: SLM_FEATURE_CONTRACT,
    slm_label_contract: SLM_LABEL_CONTRACT,
  };
}

export function trendTaxonomyPayload(asOf = '2026-07-30') {
  return {
    ...buildTrendTaxonomyPayload(asOf),
    schema: 'trend-taxonomy-v1',
    canonical_schema: TREND_TAXONOMY_VERSION,
  };
}

export function slmTrainingSchemaPayload(asOf = '2026-07-30') {
  return {
    schema: 'chaindump-slm-training-schema-v1',
    taxonomy_schema: 'trend-taxonomy-v1',
    canonical_taxonomy_schema: TREND_TAXONOMY_VERSION,
    as_of: asOf,
    human_intelligence_guide: HUMAN_INTELLIGENCE_GUIDE,
    refreshed_outlook_guide: REFRESHED_OUTLOOK_GUIDE,
    required_record_fields: [
      'entity_id',
      'vertical',
      'claim_path',
      'published_text_or_withheld_state',
      'trend_ids',
      'driver_domain',
      'statement_type',
      'metric_contract',
      'source_refs',
      'publication_support',
      'evidence_status',
      'unknowns',
      'last_reviewed_at',
      'next_review_at',
      'forecast_cutoff',
      'human_review_status',
    ],
    label_targets: [
      'trend_ids',
      'taxonomy_classification',
      'evidence_sufficiency',
      'state_tags',
      'driver_domain',
      'outlook_revision_needed',
      'regulatory_status',
      'refreshed_outlook_delta',
    ],
    quality_gates: [
      'withheld high-risk conclusions remain withheld in training text',
      'one claim per record',
      'entity-stable split',
      'time-stable split before forecast timestamp',
      'source URL and review provenance required for training-eligible rows',
      'trend labels require at least three comparable dated observations',
      'regulatory records require affected actors, effective date or explicit unknown, and source authority',
    ],
    slm_label_contract: SLM_LABEL_CONTRACT,
    export_command: 'npm run export:forensic-corpus',
    export_policy: SLM_FEATURE_CONTRACT.export_policy,
  };
}

export function validateTrendIds(ids) {
  const known = new Set(TREND_CATEGORIES.map((category) => category.id));
  const unknown = (ids || []).filter((id) => !known.has(id));
  return { ok: unknown.length === 0, unknown };
}

export function stateTagsForForensicRecord(record) {
  const tags = new Set();
  const lifecycle = record?.lifecycle || record?.status || record?.dossierStatus;
  if (lifecycle) tags.add(`outcome_${String(lifecycle).toLowerCase().replaceAll(' ', '_')}`);
  const depth = record?.publication_depth || record?.publicationDepth || {};
  if (Number(depth.unresolved_high_risk_claim_count) > 0) tags.add('support_pending');
  const freshness = record?.freshness || record?.analysis?.freshness || record?.causalFreshness || {};
  const freshnessStatus = freshness.status || freshness.state;
  if (freshnessStatus) tags.add(`review_${String(freshnessStatus).toLowerCase()}`);
  const forensicStatus = record?.forensicStatus || record?.analysis?.forensic_analysis_status || record?.causalStatus;
  if (forensicStatus) tags.add(`causal_${String(forensicStatus).toLowerCase()}`);
  return [...tags].sort((a, b) => a.localeCompare(b));
}

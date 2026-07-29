-- Citation-first normalization for the exchange case-study library.
--
-- This table is an analytical overlay: it does not replace or rewrite the
-- lifecycle rows in dead_exchanges, mid_exchanges, or successful_exchanges.
-- Metric comparability is deliberately encoded in `comparability_key`.
-- Spot volume, aggregator-routed volume, perpetual notional, TVL, token price,
-- loss exposure, and operating-status observations therefore remain separate.
CREATE TABLE IF NOT EXISTS exchange_case_features (
  kind                 TEXT NOT NULL CHECK (kind IN ('dex', 'cex')),
  slug                 TEXT NOT NULL,
  lifecycle            TEXT NOT NULL CHECK (lifecycle IN ('successful', 'mid', 'dead')),
  operating_model      TEXT NOT NULL,
  product_cohort       TEXT NOT NULL,
  custody_model        TEXT NOT NULL CHECK (custody_model IN ('non_custodial', 'custodial')),
  primary_chain        TEXT,
  chains               TEXT NOT NULL CHECK (json_valid(chains)),
  token_status         TEXT NOT NULL CHECK (token_status IN ('launched', 'not_identified')),
  token_symbol         TEXT,
  token_launch_date    TEXT,
  token_launch_timing  TEXT NOT NULL CHECK (token_launch_timing IN ('at_or_near_launch', 'post_product', 'unknown')),
  token_strategy       TEXT NOT NULL,
  token_source_url     TEXT CHECK (token_source_url IS NULL OR token_source_url LIKE 'https://%'),
  metric_type          TEXT NOT NULL,
  metric_unit          TEXT NOT NULL,
  metric_window        TEXT NOT NULL,
  metric_as_of         TEXT NOT NULL CHECK (metric_as_of GLOB '????-??-??'),
  comparability_key    TEXT NOT NULL,
  evidence             TEXT NOT NULL CHECK (json_valid(evidence)),
  quality_label        TEXT NOT NULL CHECK (quality_label IN ('verified', 'partial', 'limited')),
  quality_issues       TEXT NOT NULL CHECK (json_valid(quality_issues)),
  updated_at           TEXT NOT NULL,
  PRIMARY KEY (kind, slug, lifecycle),
  CHECK (
    (token_status = 'launched' AND token_symbol IS NOT NULL)
    OR (token_status = 'not_identified' AND token_symbol IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_exchange_case_features_scope
  ON exchange_case_features(kind, lifecycle, product_cohort);
CREATE INDEX IF NOT EXISTS idx_exchange_case_features_comparability
  ON exchange_case_features(kind, comparability_key);

WITH
feature_seed (
  kind, slug, lifecycle, operating_model, product_cohort, custody_model,
  token_status, token_symbol, token_launch_date, token_launch_timing,
  token_strategy, token_source_url, quality_issues
) AS (
  VALUES
    ('dex','kyberswap','dead','Multi-chain concentrated-liquidity AMM; this case is scoped to the exploited Elastic product.','concentrated_liquidity_amm','non_custodial','launched','KNC','2017','post_product','governance_and_ecosystem','https://docs.kyberswap.com/governance/knc-token','[]'),
    ('dex','platypus-finance','dead','Avalanche-native single-sided stableswap AMM with a protocol stablecoin and collateralized borrowing path.','stable_swap_amm','non_custodial','launched','PTP',NULL,'at_or_near_launch','liquidity_incentives',NULL,'["token_citation_not_field_specific"]'),
    ('dex','deus-finance','dead','Multi-chain synthetic-asset and stablecoin protocol whose AMM depended on DEI minting and oracle pricing.','synthetic_asset_amm','non_custodial','launched','DEUS',NULL,'at_or_near_launch','governance_and_ecosystem',NULL,'["token_citation_not_field_specific"]'),
    ('dex','mango-markets','dead','Solana cross-margin venue combining Serum spot order books, perpetuals, lending, and shared collateral.','perpetual_orderbook','non_custodial','launched','MNGO',NULL,'at_or_near_launch','governance_and_incentives',NULL,'["token_citation_not_field_specific"]'),
    ('dex','mirror-protocol','dead','Terra synthetic-asset issuance and AMM trading system collateralized through the Terra stablecoin stack.','synthetic_asset_amm','non_custodial','launched','MIR',NULL,'at_or_near_launch','governance_and_incentives',NULL,'["token_citation_not_field_specific"]'),
    ('dex','serum','dead','Solana central-limit order book and composable liquidity layer whose upgrade authority remained tied to FTX and Alameda.','spot_orderbook','non_custodial','launched','SRM',NULL,'at_or_near_launch','fee_discounts_and_incentives',NULL,'["token_citation_not_field_specific"]'),
    ('dex','spiritswap','dead','Fantom spot AMM using liquidity incentives and vote-escrow governance, with material dependence on bridged assets.','vote_escrow_amm','non_custodial','launched','SPIRIT',NULL,'at_or_near_launch','governance_and_liquidity_incentives',NULL,'["token_citation_not_field_specific"]'),
    ('dex','solidly','dead','Fantom vote-escrow AMM that directed emissions to pools according to governance votes and fee generation.','vote_escrow_amm','non_custodial','launched','SOLID',NULL,'at_or_near_launch','vote_directed_liquidity_incentives',NULL,'["token_citation_not_field_specific"]'),
    ('dex','bunni','dead','Uniswap-hook-based liquidity venue using custom liquidity-density functions; this case is scoped to the shut-down protocol.','hook_based_amm','non_custodial','launched','BUNNI',NULL,'post_product','governance_and_incentives','https://docs.bunni.xyz/docs/v2/tokenomics/BUNNI/','["token_launch_date_unresolved"]'),
    ('dex','waultswap','dead','BNB Chain constant-product spot AMM embedded in the wider Wault Finance yield and stablecoin system.','spot_amm','non_custodial','launched','WEX',NULL,'at_or_near_launch','governance_and_liquidity_incentives',NULL,'["token_citation_not_field_specific"]'),
    ('dex','gmx-v1','dead','Oracle-priced perpetual and spot-swap venue using the GLP pooled-liquidity counterparty model; this case excludes GMX V2.','perpetual_liquidity_pool','non_custodial','launched','GMX',NULL,'at_or_near_launch','governance_and_fee_share','https://docs.gmx.io/docs/tokenomics/gmx-token/','["token_launch_date_unresolved","product_scope_is_gmx_v1_only"]'),
    ('dex','saddle-finance','dead','Ethereum stableswap AMM optimized for pegged-value assets and competing directly with Curve-style pools.','stable_swap_amm','non_custodial','launched','SDL',NULL,'post_product','governance_and_liquidity_incentives',NULL,'["token_citation_not_field_specific"]'),
    ('dex','uranium-finance','dead','BNB Chain constant-product AMM fork whose liquidity migration depended on modified invariant calculations.','spot_amm','non_custodial','launched','URF',NULL,'at_or_near_launch','governance_and_liquidity_incentives',NULL,'["token_citation_not_field_specific"]'),
    ('dex','sushiswap','mid','Multi-chain spot AMM suite spanning constant-product and concentrated-liquidity deployments.','spot_amm_multichain','non_custodial','launched','SUSHI','2020-08','at_or_near_launch','governance_and_fee_incentives','https://www.sushi.com/faq/general/about-sushi/what-is-sushi','[]'),
    ('dex','dodo-amm','mid','Proactive-market-maker AMM that uses oracle-guided curves to concentrate liquidity around a reference price.','proactive_market_maker','non_custodial','launched','DODO',NULL,'at_or_near_launch','governance_and_liquidity_incentives',NULL,'["token_citation_not_field_specific"]'),
    ('dex','osmosis','mid','Sovereign Cosmos appchain for AMM liquidity, interchain routing, and chain-governed pool incentives.','appchain_amm','non_custodial','launched','OSMO','2021-06','at_or_near_launch','network_security_governance_and_incentives',NULL,'["token_citation_not_field_specific"]'),
    ('dex','balancer','mid','Multi-chain programmable AMM supporting weighted multi-asset pools, stable pools, and vault-routed liquidity.','weighted_pool_amm','non_custodial','launched','BAL','2020-06','post_product','governance_and_liquidity_incentives',NULL,'["token_citation_not_field_specific"]'),
    ('dex','bancor','mid','Ethereum AMM centered on protocol-managed and single-sided liquidity, with BNT used throughout the pool design.','single_sided_amm','non_custodial','launched','BNT','2017-06','at_or_near_launch','core_liquidity_and_governance',NULL,'["token_citation_not_field_specific"]'),
    ('dex','spookyswap','mid','Fantom constant-product spot AMM with farm incentives and vote-escrow governance.','spot_amm','non_custodial','launched','BOO',NULL,'at_or_near_launch','governance_and_liquidity_incentives',NULL,'["token_citation_not_field_specific"]'),
    ('dex','aerodrome','successful','Base-native MetaDEX combining constant-product and concentrated-liquidity AMMs with vote-directed emissions and fee distribution.','vote_escrow_amm','non_custodial','launched','AERO','2023-08-28','at_or_near_launch','vote_directed_liquidity_and_fee_distribution','https://aerodrome.finance/docs','[]'),
    ('dex','curve-finance','successful','Multi-chain AMM optimized for stable and correlated assets with gauge-directed liquidity incentives.','stable_swap_amm','non_custodial','launched','CRV',NULL,'post_product','vote_directed_liquidity_and_governance','https://news.curve.finance/curve-finance-the-rise-of-the-home-of-stablecoins/','["token_launch_date_unresolved"]'),
    ('dex','dydx','successful','Perpetual-futures central-limit order book on sovereign dYdX Chain; legacy v3 operated on Ethereum and StarkEx.','perpetual_orderbook','non_custodial','launched','DYDX','2021-08-04','post_product','governance_and_ecosystem_incentives','https://www.dydx.foundation/blog/introducing-dydx-token','[]'),
    ('dex','hyperliquid','successful','App-specific Layer 1 with fully on-chain central-limit order books for perpetual futures and spot markets.','perpetual_orderbook','non_custodial','launched','HYPE','2024-11-29','post_product','network_security_costs_and_ecosystem','https://www.hyperfoundation.org/','[]'),
    ('dex','jupiter','successful','Solana liquidity aggregator and execution router; the wider suite includes perpetuals, lending, and launch tooling.','liquidity_aggregator','non_custodial','launched','JUP','2024-01-31','post_product','dao_governance_and_ecosystem','https://discuss.jup.ag/t/jup-the-genesis-post/478/1','[]'),
    ('dex','meteora','successful','Solana liquidity infrastructure with dynamic concentrated-liquidity, constant-product, and bonding-curve pools.','dynamic_liquidity_amm','non_custodial','launched','MET',NULL,'unknown','role_unresolved','https://defillama.com/protocol/meteora-dlmm','["token_role_unresolved","token_launch_date_unresolved"]'),
    ('dex','pancakeswap','successful','Multi-chain spot AMM suite with constant-product, concentrated-liquidity, stableswap, and Infinity versions.','spot_amm_multichain','non_custodial','launched','CAKE',NULL,'at_or_near_launch','governance_liquidity_incentives_and_utility','https://docs.pancakeswap.finance/protocol/cake-tokenomics','["token_launch_date_unresolved"]'),
    ('dex','raydium','successful','Solana AMM suite spanning classic AMM, constant-product, concentrated liquidity, and token-launch liquidity.','spot_amm','non_custodial','launched','RAY',NULL,'at_or_near_launch','fee_funded_buybacks_and_ecosystem','https://docs.raydium.io/ray/ray-buybacks','["token_launch_date_unresolved"]'),
    ('dex','thorchain','successful','Sovereign cross-chain AMM using threshold-signed vaults to swap native L1 assets without wrapped representations.','cross_chain_amm','non_custodial','launched','RUNE',NULL,'at_or_near_launch','settlement_security_liquidity_and_governance','https://docs.thorchain.org/understanding-thorchain/rune','["token_launch_date_unresolved"]'),
    ('dex','uniswap','successful','Permissionless multi-chain spot AMM: v2 constant-product, v3 concentrated liquidity, and v4 singleton with hooks.','spot_amm_multichain','non_custodial','launched','UNI','2020-09-16','post_product','protocol_governance','https://blog.uniswap.org/uni','[]'),
    ('cex','mt-gox','dead','Custodial Bitcoin spot exchange holding customer assets and matching orders in an off-chain ledger.','centralized_spot_exchange','custodial','not_identified',NULL,NULL,'unknown','no_venue_token_identified',NULL,'["token_status_unresolved"]'),
    ('cex','quadrigacx','dead','Custodial multi-asset spot exchange with exchange-controlled wallets and an off-chain order ledger.','centralized_spot_exchange','custodial','not_identified',NULL,NULL,'unknown','no_venue_token_identified',NULL,'["token_status_unresolved"]'),
    ('cex','ftx','dead','Custodial multi-product exchange combining spot, derivatives, margin, and an affiliated trading ecosystem.','centralized_multi_product_exchange','custodial','launched','FTT','2019-05','at_or_near_launch','exchange_utility_and_fee_discounts',NULL,'["token_citation_not_field_specific"]'),
    ('cex','cryptopia','dead','Custodial altcoin-focused spot exchange with exchange-controlled deposits and withdrawals.','centralized_spot_exchange','custodial','launched','CEFS',NULL,'post_product','fee_share_instrument','https://www.grantthornton.co.nz/globalassets/1.-member-firms/new-zealand/pdfs/cryptopia/2020/3.-affidavit-of-timothy-james-strahan-brocket-affirmed-27-november-2019.pdf','["token_launch_date_unresolved"]'),
    ('cex','coinflex','dead','Custodial derivatives venue offering physically delivered futures and yield products around exchange-managed collateral.','centralized_derivatives_exchange','custodial','launched','FLEX',NULL,'post_product','exchange_utility_and_restructuring_claims',NULL,'["token_citation_not_field_specific"]'),
    ('cex','zipmex','dead','Custodial regional spot exchange and yield program that intermediated customer assets through external counterparties.','centralized_spot_and_yield_exchange','custodial','launched','ZMT',NULL,'post_product','exchange_utility_and_rewards',NULL,'["token_citation_not_field_specific"]'),
    ('cex','bittrex','dead','Custodial crypto spot exchange serving retail and institutional order-book markets.','centralized_spot_exchange','custodial','not_identified',NULL,NULL,'unknown','no_venue_token_identified',NULL,'["token_status_unresolved"]'),
    ('cex','xeggex','dead','Custodial long-tail crypto spot exchange with exchange-controlled hot and cold wallets.','centralized_spot_exchange','custodial','not_identified',NULL,NULL,'unknown','no_venue_token_identified',NULL,'["token_status_unresolved"]'),
    ('cex','ascendex','dead','Custodial multi-product exchange offering spot, margin, derivatives, and staking services.','centralized_multi_product_exchange','custodial','launched','ASD',NULL,'post_product','exchange_utility_and_rewards',NULL,'["token_citation_not_field_specific"]'),
    ('cex','wazirx','dead','Custodial spot exchange focused on the Indian market, with exchange-controlled custody and off-chain matching.','centralized_spot_exchange','custodial','launched','WRX',NULL,'post_product','exchange_utility_and_fee_discounts',NULL,'["token_citation_not_field_specific"]'),
    ('cex','thodex','dead','Custodial Turkish crypto spot exchange controlling customer deposits, withdrawals, and order matching.','centralized_spot_exchange','custodial','not_identified',NULL,NULL,'unknown','no_venue_token_identified',NULL,'["token_status_unresolved"]'),
    ('cex','fcoin','dead','Custodial spot exchange built around transaction-fee mining, rebating fees through its venue token.','centralized_spot_exchange','custodial','launched','FT',NULL,'at_or_near_launch','transaction_fee_mining_and_revenue_share',NULL,'["token_citation_not_field_specific"]'),
    ('cex','bitmex','dead','Custodial crypto-derivatives exchange centered on perpetual swaps and margined futures.','centralized_derivatives_exchange','custodial','launched','BMEX',NULL,'post_product','exchange_utility_and_rewards',NULL,'["token_citation_not_field_specific"]'),
    ('cex','bitmart','dead','Custodial multi-asset exchange offering spot and derivatives markets through an off-chain order book.','centralized_multi_product_exchange','custodial','launched','BMX',NULL,'at_or_near_launch','exchange_utility_and_fee_discounts',NULL,'["token_citation_not_field_specific"]'),
    ('cex','htx','mid','Custodial multi-product exchange offering spot, derivatives, earn, and institutional services.','centralized_multi_product_exchange','custodial','launched','HT',NULL,'post_product','exchange_utility_and_fee_discounts',NULL,'["token_citation_not_field_specific"]'),
    ('cex','bithumb','mid','Custodial Korean-won spot exchange with exchange-controlled custody and off-chain matching.','centralized_spot_exchange','custodial','not_identified',NULL,NULL,'unknown','no_venue_token_identified',NULL,'["token_status_unresolved"]'),
    ('cex','kucoin','mid','Custodial global exchange offering spot, margin, futures, and earn products.','centralized_multi_product_exchange','custodial','launched','KCS',NULL,'post_product','exchange_utility_fee_discounts_and_rewards',NULL,'["token_citation_not_field_specific"]'),
    ('cex','okx','mid','Custodial multi-product exchange offering spot, derivatives, and yield services through jurisdiction-specific entities.','centralized_multi_product_exchange','custodial','launched','OKB',NULL,'post_product','exchange_utility_and_fee_discounts',NULL,'["token_citation_not_field_specific"]')
),
legacy_rows AS (
  SELECT
    kind, slug, 'dead' AS lifecycle, profile, sources,
    CASE
      WHEN kind != 'cex' THEN lower(metric_type)
      WHEN slug = 'ascendex' THEN 'reserve_decline'
      WHEN slug = 'bittrex' THEN 'bankruptcy_exposure'
      WHEN slug = 'coinflex' THEN 'counterparty_exposure'
      WHEN slug = 'cryptopia' THEN 'hack_loss'
      WHEN slug = 'fcoin' THEN 'insolvency_shortfall'
      WHEN slug = 'ftx' THEN 'bankruptcy_shortfall'
      WHEN slug = 'mt-gox' THEN 'asset_loss'
      WHEN slug = 'quadrigacx' THEN 'customer_exposure'
      WHEN slug = 'wazirx' THEN 'hack_loss'
      WHEN slug = 'xeggex' THEN 'customer_exposure'
      ELSE 'operational_status'
    END AS metric_type,
    CASE WHEN metric_type = 'operational_status' THEN 'status' ELSE lower(metric_unit) END AS metric_unit,
    CASE WHEN kind = 'dex' THEN 'peak_to_snapshot' ELSE
      CASE WHEN metric_type = 'loss_exposure' THEN 'event_exposure' ELSE 'operating_status_snapshot' END
    END AS metric_window,
    '2026-07-27' AS metric_as_of,
    json_extract(profile, '$.chains') AS chains,
    json_extract(profile, '$.chains[0]') AS primary_chain
  FROM dead_exchanges
  WHERE venue_type = 'exchange'
  UNION ALL
  SELECT
    kind, slug, 'mid', profile, sources,
    CASE
      WHEN kind != 'cex' THEN lower(metric_type)
      WHEN slug = 'bithumb' THEN 'spot_volume_daily_average'
      WHEN slug = 'htx' THEN 'spot_volume_quarterly'
      WHEN slug = 'kucoin' THEN 'futures_notional_volume_quarterly'
      ELSE 'operational_status'
    END,
    CASE WHEN metric_type = 'operational_status' THEN 'status' ELSE lower(metric_unit) END,
    CASE
      WHEN kind = 'dex' THEN 'snapshot'
      WHEN slug = 'bithumb' THEN 'daily_average_q1_2026'
      WHEN slug = 'htx' THEN 'calendar_quarter_q1_2026'
      WHEN slug = 'kucoin' THEN 'calendar_quarter_q2_2026'
      ELSE 'operating_status_snapshot'
    END,
    '2026-07-27',
    json_extract(profile, '$.chains'),
    json_extract(profile, '$.chains[0]')
  FROM mid_exchanges
  WHERE venue_type = 'exchange'
  UNION ALL
  SELECT
    type, slug, 'successful', profile, sources, metric_type, metric_unit,
    CASE
      WHEN metric_type LIKE '%_24h' THEN 'rolling_24h'
      ELSE 'snapshot'
    END,
    '2026-07-29',
    json_extract(profile, '$.chains'),
    primary_chain
  FROM successful_exchanges
  WHERE venue_type = 'exchange'
),
normalized AS (
  SELECT
    f.*, COALESCE(l.primary_chain, json_extract(l.chains, '$[0]')) AS primary_chain,
    COALESCE(l.chains, '[]') AS chains, lower(l.metric_type) AS metric_type,
    lower(l.metric_unit) AS metric_unit, l.metric_window, l.metric_as_of,
    f.kind || '|' || f.product_cohort || '|' || lower(l.metric_type) || '|' ||
      lower(l.metric_unit) || '|' || l.metric_window AS comparability_key,
    json_object(
      'source_count', COALESCE(json_array_length(l.sources), 0),
      'operating_model_source_indexes', CASE WHEN COALESCE(json_array_length(l.sources), 0) > 0 THEN json_array(0) ELSE json_array() END,
      'metric_source_indexes', CASE WHEN COALESCE(json_array_length(l.sources), 0) > 0 THEN json_array(COALESCE(json_array_length(l.sources), 1) - 1) ELSE json_array() END,
      'token_source_url', f.token_source_url,
      'source_replacements', CASE
        WHEN f.kind = 'dex' AND f.slug = 'uranium-finance' THEN json_object(
          'https://www.crypto-news-flash.com/uranium-finance-exploit/',
          'https://www.coindesk.com/markets/2021/04/28/binance-chain-defi-exchange-uranium-finance-loses-50m-in-exploit'
        )
        ELSE json_object()
      END
    ) AS evidence,
    CASE
      WHEN json_array_length(f.quality_issues) = 0 AND COALESCE(json_array_length(l.sources), 0) >= 2 THEN 'verified'
      WHEN COALESCE(json_array_length(l.sources), 0) >= 1 THEN 'partial'
      ELSE 'limited'
    END AS quality_label
  FROM feature_seed f
  INNER JOIN legacy_rows l
    ON l.kind = f.kind AND l.slug = f.slug AND l.lifecycle = f.lifecycle
)
INSERT OR REPLACE INTO exchange_case_features (
  kind, slug, lifecycle, operating_model, product_cohort, custody_model,
  primary_chain, chains, token_status, token_symbol, token_launch_date,
  token_launch_timing, token_strategy, token_source_url, metric_type,
  metric_unit, metric_window, metric_as_of, comparability_key, evidence,
  quality_label, quality_issues, updated_at
)
SELECT
  kind, slug, lifecycle, operating_model, product_cohort, custody_model,
  primary_chain, chains, token_status, token_symbol, token_launch_date,
  token_launch_timing, token_strategy, token_source_url, metric_type,
  metric_unit, metric_window, metric_as_of, comparability_key, evidence,
  quality_label, quality_issues, '2026-07-29'
FROM normalized;

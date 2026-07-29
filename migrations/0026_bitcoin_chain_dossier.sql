-- Bitcoin is a deliberately conservative L1 control.  This migration publishes
-- the same eight visible dossier dimensions as the other completed chains, but
-- does not manufacture current market, revenue, or activity measurements.

WITH dossier_seed(payload) AS (
  VALUES ('[
    {
      "chain":"Bitcoin",
      "source_catalog":{
        "whitepaper":{"title":"Bitcoin white paper","url":"https://bitcoin.org/bitcoin.pdf"},
        "source_code":{"title":"Bitcoin Core consensus amount constants","url":"https://github.com/bitcoin/bitcoin/blob/master/src/consensus/amount.h"},
        "genesis":{"title":"Bitcoin Core chain parameters","url":"https://github.com/bitcoin/bitcoin/blob/master/src/kernel/chainparams.cpp"},
        "devguide":{"title":"Bitcoin developer guide: transactions","url":"https://developer.bitcoin.org/devguide/transactions.html"}
      },
      "dimension_sources":{
        "identity":["whitepaper","genesis"],
        "token":["whitepaper","source_code"],
        "capital":["whitepaper"],
        "onchain":["devguide"],
        "team":["whitepaper","source_code"],
        "narrative":["whitepaper","devguide"],
        "risk":["whitepaper","source_code","devguide"],
        "synthesis":["whitepaper","source_code","devguide"]
      },
      "dimensions":{
        "identity":{"as_of":"2026-07-29","chain":"Bitcoin","aliases":["BTC","Bitcoin network"],"category":"L1","vm":"other","launched":"2009-01-03","status":"established","lifecycle":[{"date":"2008-10-31","type":"whitepaper","description":"The white paper proposed a peer-to-peer electronic-cash system using proof of work and a public transaction history.","source_url":"https://bitcoin.org/bitcoin.pdf"},{"date":"2009-01-03","type":"genesis","description":"Bitcoin Core chain parameters encode the mainnet genesis block and its timestamp.","source_url":"https://github.com/bitcoin/bitcoin/blob/master/src/kernel/chainparams.cpp"}]},
        "token":{"as_of":"2026-07-29","launch_status":"launched","token_symbol":"BTC","gas_token":"BTC","launch_date":"2009-01-03","launch_relation":"BTC is the native unit transferred by the protocol and used to pay transaction fees; no issuer, token sale, or separate governance asset is asserted.","max_supply":21000000,"source_url":"https://github.com/bitcoin/bitcoin/blob/master/src/consensus/amount.h"},
        "capital":{"as_of":"2026-07-29","total_raised_usd":null,"rounds":[],"treasury_usd":null,"backers_tier":"none_unknown","notes":"Bitcoin has no protocol issuer or corporate financing record in this dossier. Mining revenue, foundations, custodians, and companies are separate entities and are not treated as protocol funding."},
        "onchain":{"as_of":"2026-07-29","tvl_peak_usd":null,"tvl_peak_date":null,"tvl_current_usd":null,"tvl_drawdown_pct":null,"stablecoin_tvl_usd":null,"spot_dex_volume_24h_usd":null,"fees_24h_usd":null,"fees_30d_usd":null,"revenue_30d_usd":null,"active_addresses_daily":null,"dev_activity_monthly":null,"tvl_concentration":null,"source_url":"https://developer.bitcoin.org/devguide/transactions.html","notes":"No live snapshot is asserted: wrapped-BTC or application TVL is not native Bitcoin protocol TVL, and current fee, transaction, miner, and holder metrics need their own timestamped source."},
        "team":{"as_of":"2026-07-29","founders":[{"name":"Satoshi Nakamoto","role":"white-paper author and pseudonymous creator","source_url":"https://bitcoin.org/bitcoin.pdf"}],"entity":"No protocol operator is asserted. The public Bitcoin Core repository is one implementation and does not constitute ownership of the network.","key_events":[{"date":"2008-10-31","type":"publication","description":"Satoshi Nakamoto published the Bitcoin white paper.","source_url":"https://bitcoin.org/bitcoin.pdf"},{"date":"2009-01-03","type":"genesis","description":"Bitcoin Core mainnet parameters encode the genesis block.","source_url":"https://github.com/bitcoin/bitcoin/blob/master/src/kernel/chainparams.cpp"}],"regulatory_status":null},
        "narrative":{"as_of":"2026-07-29","purpose":"A peer-to-peer electronic cash system using proof of work and a public transaction history.","positioning":"A native monetary-settlement network where transaction validation and issuance rules are enforced by consensus software rather than a platform operator.","competitors":[{"name":"gold and fiat settlement rails","relationship":"store-of-value and settlement comparison, not a protocol-equivalence claim"},{"name":"other L1 networks","relationship":"native-asset settlement and security-budget comparison"}],"narrative_arc":"The original electronic-cash proposal became a global monetary-settlement network; this dossier does not turn that history into a claim about current adoption, liquidity, or price performance.","media_sentiment":"mixed"},
        "risk":{"as_of":"2026-07-29","exploits":[],"sanctions":{"flagged":false,"detail":"No protocol-level sanctions conclusion is asserted; regulated custodians, intermediaries, addresses, and applications require separate current checks."},"extraction_flags":["mining_concentration","custody_dependency","fee_market_transition"],"audit_status":null,"risks":[{"type":"mining_concentration","detail":"Proof-of-work security depends on economically independent hash power; current pool concentration must be measured with a dated source rather than inferred from the protocol design."},{"type":"custody_and_key_management","detail":"The protocol model makes private-key control material; custody failures are distinct from a consensus failure but can dominate user loss and access risk."},{"type":"fee_market_transition","detail":"The issuance schedule reduces block subsidy over time, making sustainable fee demand a security-budget question to monitor with current data."},{"type":"implementation_and_upgrade","detail":"Consensus-client bugs and contentious changes are operational risks even though the public repository and protocol rules are transparent."}]},
        "synthesis":{"as_of":"2026-07-29","situation":"Bitcoin is the baseline L1 control: a fixed-rule proof-of-work monetary network with no issuer financing or native TVL measure in this dossier. The missing live data is deliberate, so no current success, failure, price, or activity conclusion is made here.","postmortem":null,"success_mechanism":"Permissionless participation, fixed issuance rules, a native fee asset, and a long-lived public ledger can reinforce a settlement-network thesis when independent users, miners, and infrastructure continue to participate.","lessons_learned":["Do not substitute wrapped-asset or application TVL for native protocol TVL.","Separate consensus security, miner economics, custodial access, and market price rather than collapsing them into one health score.","A protocol without an issuer or token sale needs a different capital and governance model from venture-backed smart-contract chains."],"could_differ":"Hash-power concentration, weak fee-market demand, implementation faults, custody failures, or constrained fiat access could impair the settlement thesis; this migration does not quantify any of those conditions without current data.","outlook":{"bull":"Independent participation and fee demand support a durable monetary-settlement network.","base":"Bitcoin remains the benchmark native-asset L1 while security and access trade-offs require ongoing measurement.","bear":"Security-budget, concentration, custody, or access constraints weaken confidence and use.","most_likely":"base"},"cause_tags":["proof_of_work","native_fee_asset","permissionless_distribution","fixed_issuance","no_issuer"],"confidence":"medium"}
      },
      "meta":{"dimension_completeness_pct":100,"data_completeness_pct":56,"confidence":"medium","unsourced_fields":["token.current_usd","token.ath_usd","token.market_cap_usd","onchain.current_fee_metrics","onchain.current_activity_metrics","onchain.hashrate_and_pool_concentration","capital.protocol_financing","team.current_maintainer_distribution","risk.current_pool_concentration","risk.current_regulatory_access"],"last_reviewed":"2026-07-29"}
    }
  ]')
),
dossiers AS (
  SELECT value AS dossier FROM dossier_seed, json_each(dossier_seed.payload)
),
dimension_rows AS (
  SELECT
    json_extract(dossier, '$.chain') AS chain,
    dimensions.key AS dimension,
    dimensions.value AS data,
    (SELECT json_group_array(json(json_extract(dossier, '$.source_catalog.' || source_keys.value)))
     FROM json_each(json_extract(dossier, '$.dimension_sources.' || dimensions.key)) AS source_keys) AS sources
  FROM dossiers, json_each(json_extract(dossier, '$.dimensions')) AS dimensions
),
meta_rows AS (
  SELECT json_extract(dossier, '$.chain') AS chain, '_meta' AS dimension, json_extract(dossier, '$.meta') AS data,
    (SELECT json_group_array(json(value)) FROM json_each(json_extract(dossier, '$.source_catalog'))) AS sources
  FROM dossiers
)
INSERT OR REPLACE INTO chain_facts (chain, dimension, data, sources, updated_at)
SELECT chain, dimension, data, sources, '2026-07-29' FROM dimension_rows
UNION ALL
SELECT chain, dimension, data, sources, '2026-07-29' FROM meta_rows;

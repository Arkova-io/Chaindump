-- Cardano control dossier. Native supply evidence is recorded in ADA at the
-- source epoch; app-style TVL/DEX/revenue fields remain null until scoped,
-- timestamped sources are reviewed independently.
WITH dossier_seed(payload) AS (
  VALUES ('[
    {
      "chain":"Cardano",
      "source_catalog":{
        "eras":{"title":"Cardano Docs: development phases and eras","url":"https://docs.cardano.org/about-cardano/evolution/eras-and-phases"},
        "shelley":{"title":"Cardano Docs: Byron to Shelley","url":"https://docs.cardano.org/about-cardano/evolution/upgrades/byron-to-shelley"},
        "ada":{"title":"Cardano Docs: ada native currency","url":"https://docs.cardano.org/about-cardano/new-to-cardano/what-is-a-cryptocurrency"},
        "genesis":{"title":"Cardano genesis distribution","url":"https://cardano.org/genesis/"},
        "supply":{"title":"Cardano ADA supply distribution, epoch 637","url":"https://cardano.org/insights/supply/?epoch=637"},
        "constitution":{"title":"Cardano Constitution","url":"https://cardano.org/constitution/"},
        "rewards":{"title":"Cardano Docs: pledging and rewards","url":"https://docs.cardano.org/about-cardano/learn/pledging-rewards"}
      },
      "dimension_sources":{
        "identity":["eras","shelley"],
        "token":["ada","constitution","supply"],
        "capital":["genesis"],
        "onchain":["supply"],
        "team":["genesis","eras"],
        "narrative":["eras","ada"],
        "risk":["shelley","rewards","constitution"],
        "synthesis":["eras","shelley","supply","constitution","rewards"]
      },
      "dimensions":{
        "identity":{"as_of":"2026-07-29","chain":"Cardano","aliases":["ADA","Cardano mainnet"],"category":"L1","vm":"other","launched":"2017","launch_date_precision":"year","status":"established","lifecycle":[{"date":"2017","type":"launch","description":"Cardano documentation describes Byron as the initial federated proof-of-stake mainnet phase.","source_url":"https://docs.cardano.org/about-cardano/evolution/eras-and-phases"},{"date":"2020-07","type":"hard_fork","description":"The mainnet switched from Byron rules to Shelley ledger rules in late July 2020, beginning its decentralized stake-pool transition.","source_url":"https://docs.cardano.org/about-cardano/evolution/eras-and-phases"}]},
        "token":{"as_of":"2026-07-29","launch_status":"launched","token_symbol":"ADA","gas_token":"ADA","launch_date":"2017","launch_date_precision":"year","launch_relation":"ADA is Cardano''s native payment unit for fees, deposits and staking rewards. Current price and market-cap fields are intentionally withheld in this source-only dossier.","max_supply":45000000000,"source_url":"https://cardano.org/constitution/","supply_snapshot":{"evidence_date":"2026-06-13","epoch":637,"circulating_utxos_ada":36373183721,"treasury_ada":1486632641,"rewards_ada":826656960,"reserves_ada":6307350175,"source_url":"https://cardano.org/insights/supply/?epoch=637","scope":"Official epoch-end supply distribution; not a USD valuation or a current intraday snapshot."}},
        "capital":{"as_of":"2026-07-29","total_raised_usd":null,"rounds":[],"treasury_usd":null,"backers_tier":"none_unknown","notes":"The genesis record describes a historical ADA voucher sale and allocations, but this dossier does not convert BTC/Yen proceeds into a USD financing total or equate the on-chain treasury with an entity treasury. The documented public-sale allocation was 25,927,070,538 ADA."},
        "onchain":{"as_of":"2026-07-29","tvl_peak_usd":null,"tvl_peak_date":null,"tvl_current_usd":null,"tvl_drawdown_pct":null,"stablecoin_tvl_usd":null,"spot_dex_volume_24h_usd":null,"fees_24h_usd":null,"fees_30d_usd":null,"revenue_30d_usd":null,"active_addresses_daily":null,"dev_activity_monthly":null,"tvl_concentration":null,"source_url":"https://cardano.org/insights/supply/?epoch=637","notes":"The cited native supply snapshot is evidence dated 2026-06-13. It does not justify a Cardano TVL, DEX-volume, fee-revenue, active-address, or developer-activity claim without separately scoped data."},
        "team":{"as_of":"2026-07-29","founders":[],"entity":"Cardano documentation distinguishes the blockchain/community from founding-era entities. The genesis distribution record names Cardano Foundation, EMURGO and IOHK allocations; it does not establish current control or a complete founder roster.","key_events":[{"date":"2017","type":"genesis_distribution","description":"The published genesis distribution records public voucher-sale allocation and founding-era entity allocations.","source_url":"https://cardano.org/genesis/"},{"date":"2020-07","type":"protocol_transition","description":"Shelley transitioned the network from federated Byron operation toward distributed stake-pool production.","source_url":"https://docs.cardano.org/about-cardano/evolution/upgrades/byron-to-shelley"}],"regulatory_status":null},
        "narrative":{"as_of":"2026-07-29","purpose":"A proof-of-stake ledger whose eras added decentralized stake pools, smart-contract support, scalability/interoperability work and on-chain governance.","positioning":"A research-led UTxO-based L1 where ADA is the native fee, deposit and reward asset and stake pools participate in block production.","competitors":[{"name":"Ethereum","relationship":"smart-contract and proof-of-stake platform comparison"},{"name":"Solana","relationship":"L1 developer, liquidity and consumer-application comparison"},{"name":"other UTxO ecosystems","relationship":"native-asset and ledger-model comparison"}],"narrative_arc":"Cardano moved from a federated Byron phase to Shelley stake-pool operation, then added smart-contract, scaling and governance eras. Product claims do not substitute for current application or liquidity evidence.","media_sentiment":"mixed"},
        "risk":{"as_of":"2026-07-29","exploits":[],"sanctions":{"flagged":false,"detail":"No protocol-entity designation conclusion is asserted. Address-level sanctions, intermediaries and jurisdictional access need separately dated evidence."},"extraction_flags":["governance_treasury_execution","stake_pool_decentralization","application_liquidity_evidence_gap"],"audit_status":null,"risks":[{"type":"governance_and_treasury_execution","detail":"The Constitution defines a protocol treasury and governance processes; treasury balance is not evidence that allocation decisions or funded work will produce adoption."},{"type":"stake_pool_decentralization","detail":"Shelley changed the federated model toward stake-pool production, but current pool distribution and control require a dated measurement rather than historical inference."},{"type":"application_and_liquidity_gap","detail":"This dossier has no verified current TVL, DEX volume, fee or retention series, so it cannot infer application-product fit from protocol eras or token supply."},{"type":"monetary_model_scope","detail":"Reserve release, staking rewards, fees and treasury flows are distinct ADA-supply mechanisms; USD treasury or protocol-revenue claims require separate valuation and accounting evidence."}]},
        "synthesis":{"as_of":"2026-07-29","situation":"Cardano is an established L1 with a documented transition from federated Byron operation to Shelley stake-pool operation, an ADA maximum supply of 45B and a dated official ADA supply snapshot. The dossier deliberately contains no current USD activity or price conclusion.","postmortem":null,"success_mechanism":"A native fee/reward asset, stake-pool incentives, a staged protocol roadmap and governance/treasury mechanisms can support a durable network if developer, application and user demand persist; those outcome variables require their own measurements.","lessons_learned":["Protocol treasury balance, token supply and ecosystem financing are different fields and should not be pooled.","A historical decentralization transition is not a current concentration measurement.","Research, roadmap and governance narratives need to be tested against current application, liquidity and fee evidence."],"could_differ":"Sustained application and fee demand, independently measured stake-pool decentralization and effective treasury execution could strengthen the thesis; weak activity or concentrated control would weaken it. Neither result is inferred from this source set.","outlook":{"bull":"Application demand and decentralized governance translate supply and treasury mechanisms into sustained network use.","base":"Cardano remains an established L1 while comparable current activity and retention evidence stays decisive.","bear":"Application liquidity and developer demand remain insufficient relative to competing L1 ecosystems.","most_likely":"base"},"cause_tags":["proof_of_stake","stake_pool_transition","native_fee_asset","treasury_governance","research_roadmap"],"confidence":"medium"}
      },
      "meta":{"dimension_completeness_pct":100,"data_completeness_pct":64,"confidence":"medium","unsourced_fields":["token.current_usd","token.ath_usd","token.market_cap_usd","capital.usd_financing_total","capital.usd_treasury_value","onchain.tvl_and_dex_metrics","onchain.current_fee_metrics","onchain.active_addresses","onchain.dev_activity","team.current_control_and_founder_roster","risk.current_pool_concentration"],"last_reviewed":"2026-07-29"}
    }
  ]')
), dossiers AS (
  SELECT value AS dossier FROM dossier_seed, json_each(dossier_seed.payload)
), dimension_rows AS (
  SELECT json_extract(dossier, '$.chain') AS chain, dimensions.key AS dimension, dimensions.value AS data,
    (SELECT json_group_array(json(json_extract(dossier, '$.source_catalog.' || source_keys.value))) FROM json_each(json_extract(dossier, '$.dimension_sources.' || dimensions.key)) AS source_keys) AS sources
  FROM dossiers, json_each(json_extract(dossier, '$.dimensions')) AS dimensions
), meta_rows AS (
  SELECT json_extract(dossier, '$.chain') AS chain, '_meta' AS dimension, json_extract(dossier, '$.meta') AS data,
    (SELECT json_group_array(json(value)) FROM json_each(json_extract(dossier, '$.source_catalog'))) AS sources FROM dossiers
)
INSERT OR REPLACE INTO chain_facts (chain, dimension, data, sources, updated_at)
SELECT chain, dimension, data, sources, '2026-07-29' FROM dimension_rows
UNION ALL SELECT chain, dimension, data, sources, '2026-07-29' FROM meta_rows;

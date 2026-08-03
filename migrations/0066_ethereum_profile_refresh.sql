-- Ethereum gold-standard profile refresh, verified 2026-08-03.
-- Replaces stale narrative copy with a dated evidence contract and leaves live
-- market values to the existing DefiLlama and CoinGecko-backed API paths.
-- The fixed staging payload makes repeated application deterministic.

DROP TABLE IF EXISTS _ethereum_profile_refresh;

CREATE TABLE _ethereum_profile_refresh (
  payload TEXT NOT NULL CHECK (json_valid(payload))
);

INSERT INTO _ethereum_profile_refresh (payload) VALUES ('
{
  "analysis": {
    "take": "Ethereum remains the leading settlement and collateral network in the independent market-data snapshot used by Chaindump, while direct ETH value capture from rollup activity remains unresolved. Pectra activated on 2025-05-07 and Fusaka on 2025-12-03. Lean Ethereum was published on 2025-07-31 as a research vision, not a shipped fork. The official roadmap lists Glamsterdam for H2 2026 without a precise mainnet date.",
    "sentiment": "mixed",
    "trend": "Settlement leadership; rollup value capture remains open",
    "updated_at": "2026-08-03",
    "sources": [
      {"id":"eth-history","title":"Ethereum history, founder, launch and ownership","publisher":"ethereum.org","url":"https://ethereum.org/ethereum-history-founder-and-ownership/","source_role":"primary","source_date":null,"source_date_kind":"unknown","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"accessible","evidence_scope":"historical_event","stale_after":null,"stale":false},
      {"id":"eth-launch","title":"Ethereum Launches","publisher":"Ethereum Foundation","url":"https://blog.ethereum.org/2015/07/30/ethereum-launches","source_role":"primary","source_date":"2015-07-30","source_date_kind":"published","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"accessible","evidence_scope":"historical_event","stale_after":null,"stale":false},
      {"id":"eth-forks","title":"Ethereum fork history","publisher":"ethereum.org","url":"https://ethereum.org/ethereum-forks/","source_role":"primary","source_date":null,"source_date_kind":"unknown","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"accessible","evidence_scope":"historical_event","stale_after":null,"stale":false},
      {"id":"eth-roadmap","title":"Ethereum roadmap","publisher":"ethereum.org","url":"https://ethereum.org/roadmap/","source_role":"primary","source_date":null,"source_date_kind":"unknown","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"accessible","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
      {"id":"eth-pectra","title":"Prague-Electra (Pectra)","publisher":"ethereum.org","url":"https://ethereum.org/roadmap/pectra/","source_role":"primary","source_date":"2026-06-30","source_date_kind":"updated","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"accessible","evidence_scope":"historical_event","stale_after":null,"stale":false},
      {"id":"eth-fusaka","title":"Fulu-Osaka (Fusaka)","publisher":"ethereum.org","url":"https://ethereum.org/roadmap/fusaka/","source_role":"primary","source_date":"2026-06-24","source_date_kind":"updated","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"accessible","evidence_scope":"historical_event","stale_after":null,"stale":false},
      {"id":"eth-glamsterdam","title":"Glamsterdam","publisher":"ethereum.org","url":"https://ethereum.org/roadmap/glamsterdam/","source_role":"primary","source_date":"2026-06-24","source_date_kind":"updated","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"accessible","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
      {"id":"eth-lean","title":"lean Ethereum","publisher":"Ethereum Foundation","url":"https://blog.ethereum.org/2025/07/31/lean-ethereum","source_role":"primary","source_date":"2025-07-31","source_date_kind":"published","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"accessible","evidence_scope":"mechanism","stale_after":null,"stale":false},
      {"id":"eth-scaling","title":"Scaling Ethereum","publisher":"ethereum.org","url":"https://ethereum.org/roadmap/scaling/","source_role":"primary","source_date":"2026-06-24","source_date_kind":"updated","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"accessible","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
      {"id":"eth-staking","title":"Ethereum staking","publisher":"ethereum.org","url":"https://ethereum.org/staking/","source_role":"primary","source_date":null,"source_date_kind":"unknown","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"accessible","evidence_scope":"mechanism","stale_after":null,"stale":false},
      {"id":"eth-eip1559","title":"EIP-1559 fee market change","publisher":"Ethereum Improvement Proposals","url":"https://eips.ethereum.org/EIPS/eip-1559","source_role":"primary","source_date":"2019-04-13","source_date_kind":"published","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"accessible","evidence_scope":"mechanism","stale_after":null,"stale":false},
      {"id":"eth-coingecko","title":"Ethereum market data API","publisher":"CoinGecko","url":"https://api.coingecko.com/api/v3/coins/ethereum","source_role":"data","source_date":"2026-08-03","source_date_kind":"observed","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"accessible","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
      {"id":"eth-llama-tvl","title":"Ethereum historical TVL API","publisher":"DefiLlama","url":"https://api.llama.fi/v2/historicalChainTvl/Ethereum","source_role":"data","source_date":"2026-08-03","source_date_kind":"observed","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"accessible","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
      {"id":"eth-llama-fees","title":"Ethereum fees API","publisher":"DefiLlama","url":"https://api.llama.fi/overview/fees/Ethereum?dataType=dailyFees","source_role":"data","source_date":"2026-08-03","source_date_kind":"observed","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"accessible","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
      {"id":"eth-llama-revenue","title":"Ethereum revenue API","publisher":"DefiLlama","url":"https://api.llama.fi/overview/fees/Ethereum?dataType=dailyRevenue","source_role":"data","source_date":"2026-08-03","source_date_kind":"observed","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"accessible","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
      {"id":"eth-llama-volume","title":"Ethereum DEX volume API","publisher":"DefiLlama","url":"https://api.llama.fi/overview/dexs/Ethereum?dataType=dailyVolume","source_role":"data","source_date":"2026-08-03","source_date_kind":"observed","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"accessible","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
      {"id":"eth-llama-stables","title":"Stablecoin supply by chain API","publisher":"DefiLlama","url":"https://stablecoins.llama.fi/stablecoinchains","source_role":"data","source_date":"2026-08-03","source_date_kind":"observed","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"accessible","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false}
    ],
    "profile": {
      "what_it_does": "Ethereum is a public smart-contract network used as a settlement, collateral and data-availability layer. Applications execute on mainnet and on rollups that publish data or proofs back to Ethereum.",
      "purpose": "Ethereum launched in 2015 as a general-purpose programmable blockchain. Its current roadmap combines proof-of-stake security, mainnet execution and rollup-centric scaling.",
      "why": "Ethereum accumulated reusable standards, developer tooling and deep liquidity early. Its choice to preserve permissionless verification while moving much execution to rollups reinforced settlement demand, but also split users, liquidity and fee capture across layers.",
      "operating_model": "Independent node operators run execution and consensus clients. Validators stake ETH to propose and attest to blocks. Users pay gas in ETH; the protocol burns the EIP-1559 base fee and pays protocol rewards and priority fees to validators. Rollups buy Ethereum data availability and settlement while operating their own execution systems.",
      "strategic_choices": [
        {"decision":"Move consensus from proof of work to proof of stake.","consequence":"ETH became the explicit economic security asset; staking-provider and client concentration became direct protocol risks.","basis":"observed mechanism plus strategic inference","source_refs":["eth-forks","eth-staking"]},
        {"decision":"Scale through rollups and blob data while retaining an independently verifiable L1.","consequence":"Execution became cheaper on L2s, while composability and direct fee capture fragmented across layers.","basis":"observed roadmap plus strategic inference","source_refs":["eth-scaling","eth-fusaka"]},
        {"decision":"Ship account and validator changes in Pectra before the later scaling work.","consequence":"Pectra improved wallet programmability and validator operations without changing the network token.","basis":"observed upgrade","source_refs":["eth-pectra"]},
        {"decision":"Treat Lean Ethereum as a long-horizon research direction rather than a committed fork schedule.","consequence":"Post-quantum and proof-oriented designs can be evaluated without presenting research targets as shipped product.","basis":"source-scoped interpretation","source_refs":["eth-lean","eth-roadmap"]}
      ],
      "token": {
        "symbol":"ETH",
        "roles":["gas asset","proof-of-stake collateral","protocol reward asset","application collateral"],
        "value_capture":"Demand for execution and data availability requires ETH for gas; the EIP-1559 base fee is burned, while validators receive protocol issuance and priority fees. Rollup growth does not automatically imply proportional L1 fees, so net value capture must be measured rather than assumed.",
        "supply_policy":"No fixed maximum supply; issuance rewards validators and the EIP-1559 base fee removes ETH from supply.",
        "source_refs":["eth-staking","eth-eip1559","eth-coingecko","eth-llama-fees","eth-llama-revenue"]
      },
      "lifecycle": {
        "status":"established",
        "status_basis":"direct_current",
        "status_as_of":"2026-08-03",
        "summary":"Live proof-of-stake network with continuing mainnet upgrades and material current activity in independent data feeds.",
        "milestones":[
          {"date":"2015-07-30","date_precision":"day","type":"launch","event":"Frontier launched the live network.","source_refs":["eth-launch"]},
          {"date":"2022-09-15","date_precision":"day","type":"consensus_transition","event":"The Merge changed consensus to proof of stake.","source_refs":["eth-forks"]},
          {"date":"2025-05-07","date_precision":"day","type":"network_upgrade","event":"Pectra activated on mainnet.","source_refs":["eth-pectra"]},
          {"date":"2025-12-03","date_precision":"day","type":"network_upgrade","event":"Fusaka activated on mainnet.","source_refs":["eth-fusaka"]},
          {"target":"H2 2026","date_precision":"half_year","type":"planned_upgrade","event":"Glamsterdam is planned for H2 2026; the reviewed official page does not publish a precise activation date.","source_refs":["eth-glamsterdam"]}
        ]
      },
      "risks": [
        {"risk":"Rollup value-capture gap","detail":"More L2 activity can increase settlement demand without producing proportional L1 fees.","source_refs":["eth-scaling","eth-llama-fees","eth-llama-revenue"]},
        {"risk":"Rollup control and fragmentation","detail":"Many rollups still rely on centralized sequencers or limited prover sets, creating censorship and exit assumptions outside Ethereum L1.","source_refs":["eth-scaling"]},
        {"risk":"Staking and client concentration","detail":"Concentrated providers or correlated client failures can weaken the diversity expected by proof-of-stake security.","source_refs":["eth-staking"]},
        {"risk":"Roadmap execution","detail":"Glamsterdam is planned for H2 2026, but its precise activation date and final included proposals remain open.","source_refs":["eth-glamsterdam"]}
      ],
      "outlook": {
        "bull":"Blob demand, mainnet capacity and tokenized-asset settlement grow while validator and client diversity remain healthy.",
        "base":"Ethereum remains a leading settlement layer while rollups retain much user execution and part of the economics.",
        "bear":"Execution and application economics migrate faster than settlement demand grows, while concentration or upgrade failures weaken the security premium.",
        "most_likely":"base",
        "watch":["L1 and L2 fees and revenue measured together","blob utilization after Fusaka","Glamsterdam scope and official activation date","validator, staking-provider and client concentration"]
      },
      "evidence": [
        {"claim":"Pectra activated on Ethereum mainnet on 2025-05-07.","source_refs":["eth-pectra"]},
        {"claim":"Fusaka went live on 2025-12-03 and introduced PeerDAS-led blob scaling.","source_refs":["eth-fusaka"]},
        {"claim":"Lean Ethereum was published on 2025-07-31 as a research vision.","source_refs":["eth-lean"]},
        {"claim":"The official roadmap plans Glamsterdam for H2 2026 without a precise reviewed activation date.","source_refs":["eth-glamsterdam"]},
        {"claim":"Current market and on-chain figures are supplied by independent APIs and should be read at their observation time.","source_refs":["eth-coingecko","eth-llama-tvl","eth-llama-fees","eth-llama-revenue","eth-llama-volume","eth-llama-stables"]}
      ],
      "could_differ":"A monolithic execution-first design might retain more activity and fees on L1, but it would change node-resource and scaling trade-offs. The reviewed evidence does not quantify the net value that alternative would create.",
      "unknowns": [
        {"question":"What share of rollup economic value ultimately accrues to ETH and L1 security?","resolution_trigger":"A reproducible L1/L2 fee, burn, issuance, MEV and sequencer-profit attribution series."},
        {"question":"When will major rollups remove centralized sequencing and limited prover assumptions?","resolution_trigger":"Verified production milestones and independent operator-diversity measurements."},
        {"question":"What will the final Glamsterdam scope and activation date be?","resolution_trigger":"A mainnet announcement and final client-release schedule from official protocol channels."}
      ],
      "evidence_policy": {"schema":"forensic-freshness-v1","status_basis":"direct_current","status_as_of":"2026-08-03","last_verified_at":"2026-08-03","next_review_at":"2026-08-10","stale":false},
      "review": {"status":"current","last_reviewed_at":"2026-08-03","next_review_at":"2026-08-10","reviewer":"chaindump-research-desk"},
      "sources": []
    }
  },
  "facts": {
    "identity": {
      "as_of":"2026-08-03",
      "lifecycle":[
        {"date":"2015-07-30","date_precision":"day","type":"launch","description":"Frontier genesis created the live Ethereum network.","source_url":"https://blog.ethereum.org/2015/07/30/ethereum-launches"},
        {"date":"2022-09-15","date_precision":"day","type":"consensus_transition","description":"The Merge changed Ethereum consensus from proof of work to proof of stake.","source_url":"https://ethereum.org/ethereum-forks/"},
        {"date":"2025-05-07","date_precision":"day","type":"network_upgrade","description":"Pectra activated on Ethereum mainnet.","source_url":"https://ethereum.org/roadmap/pectra/"},
        {"date":"2025-12-03","date_precision":"day","type":"network_upgrade","description":"Fusaka activated on Ethereum mainnet.","source_url":"https://ethereum.org/roadmap/fusaka/"}
      ]
    },
    "token": {
      "as_of":"2026-08-03",
      "token_current_usd":1862.52,
      "token_ath_usd":4946.05,
      "token_ath_date":"2025-08-24",
      "price_drawdown_pct":62.34,
      "market_cap_usd":224727593232,
      "fdv_usd":224727593232,
      "circulating_supply":120682241.8993688,
      "total_supply":120682241.8993688,
      "max_supply":null,
      "observed_at":"2026-08-03T16:05:07.051Z",
      "source_url":"https://api.coingecko.com/api/v3/coins/ethereum"
    },
    "onchain": {
      "as_of":"2026-08-03",
      "tvl_peak_usd":107449681996,
      "tvl_peak_date":"2021-11-09",
      "tvl_current_usd":40699785678,
      "tvl_drawdown_pct":62.12,
      "stablecoin_tvl_usd":146883364640.79175,
      "spot_dex_volume_24h_usd":550056565.93,
      "fees_24h_usd":7204686.8,
      "fees_30d_usd":269547967.27,
      "revenue_30d_usd":49689483.42,
      "observed_at":"2026-08-03",
      "source_url":"https://api.llama.fi/v2/historicalChainTvl/Ethereum",
      "fees_source_url":"https://api.llama.fi/overview/fees/Ethereum?dataType=dailyFees",
      "revenue_source_url":"https://api.llama.fi/overview/fees/Ethereum?dataType=dailyRevenue",
      "volume_source_url":"https://api.llama.fi/overview/dexs/Ethereum?dataType=dailyVolume",
      "stablecoin_source_url":"https://stablecoins.llama.fi/stablecoinchains"
    },
    "narrative": {
      "as_of":"2026-08-03",
      "purpose":"General-purpose smart-contract settlement and data-availability layer.",
      "positioning":"A proof-of-stake settlement layer for mainnet applications and a rollup-centric ecosystem.",
      "narrative_arc":"Ethereum launched as a programmable L1, moved to proof of stake in 2022, activated Pectra and Fusaka in 2025, and now balances L1 scaling with rollup data availability.",
      "media_sentiment":"mixed"
    },
    "risk": {
      "as_of":"2026-08-03",
      "extraction_flags":["rollup_value_capture","staking_provider_concentration","client_concentration"],
      "risks":[
        {"type":"rollup_value_capture","detail":"Execution migration can expand ecosystem use without proportional L1 fee capture."},
        {"type":"rollup_control","detail":"Centralized sequencers and limited prover sets add censorship and exit assumptions outside L1."},
        {"type":"client_and_staking_concentration","detail":"Correlated client faults or concentrated stake can impair consensus."},
        {"type":"roadmap_execution","detail":"Glamsterdam has an H2 2026 target but no precise reviewed activation date."}
      ]
    },
    "synthesis": {
      "as_of":"2026-08-03",
      "situation":"Ethereum remains a leading settlement and collateral network in the independent data snapshot, while the division of economics between L1, rollups, applications and sequencers remains unresolved. Pectra and Fusaka activated in 2025; Glamsterdam is planned for H2 2026 without a precise reviewed activation date.",
      "why":"Ethereum accumulated reusable standards, developer tooling and deep liquidity early. Proof-of-stake security and a rollup-centric roadmap reinforced settlement demand, but also fragmented execution and fee capture across layers.",
      "success_mechanism":"Reusable standards, liquidity depth, proof-of-stake security and rollup settlement reinforce one another; this is a causal interpretation, not proof that every layer accrues equal value.",
      "strategic_choices":[
        {"decision":"Move consensus from proof of work to proof of stake.","consequence":"ETH became the explicit economic security asset; staking-provider and client concentration became direct protocol risks.","basis":"observed mechanism plus strategic inference","source_refs":["eth-forks","eth-staking"]},
        {"decision":"Scale through rollups and blob data while retaining an independently verifiable L1.","consequence":"Execution became cheaper on L2s, while composability and direct fee capture fragmented across layers.","basis":"observed roadmap plus strategic inference","source_refs":["eth-scaling","eth-fusaka"]},
        {"decision":"Ship account and validator changes in Pectra before later scaling work.","consequence":"Pectra improved wallet programmability and validator operations without changing the network token.","basis":"observed upgrade","source_refs":["eth-pectra"]},
        {"decision":"Treat Lean Ethereum as research direction rather than a committed fork schedule.","consequence":"Long-horizon cryptographic designs remain distinguishable from shipped protocol changes.","basis":"source-scoped interpretation","source_refs":["eth-lean","eth-roadmap"]}
      ],
      "evidence":[
        {"claim":"Pectra activated on 2025-05-07.","source_refs":["eth-pectra"]},
        {"claim":"Fusaka went live on 2025-12-03.","source_refs":["eth-fusaka"]},
        {"claim":"Lean Ethereum was published on 2025-07-31 as a research vision.","source_refs":["eth-lean"]},
        {"claim":"Glamsterdam is planned for H2 2026 without a precise reviewed activation date.","source_refs":["eth-glamsterdam"]},
        {"claim":"Current market and on-chain figures use independent observation APIs.","source_refs":["eth-coingecko","eth-llama-tvl","eth-llama-fees","eth-llama-revenue","eth-llama-volume","eth-llama-stables"]}
      ],
      "could_differ":"A monolithic execution-first design might retain more activity and fees on L1, but it would change node-resource and scaling trade-offs. The reviewed evidence does not quantify the net value that alternative would create.",
      "unknowns":[
        {"question":"What share of rollup economic value ultimately accrues to ETH and L1 security?","resolution_trigger":"A reproducible L1/L2 fee, burn, issuance, MEV and sequencer-profit attribution series."},
        {"question":"When will major rollups remove centralized sequencing and limited prover assumptions?","resolution_trigger":"Verified production milestones and independent operator-diversity measurements."},
        {"question":"What will the final Glamsterdam scope and activation date be?","resolution_trigger":"A mainnet announcement and final client-release schedule from official protocol channels."}
      ],
      "lifecycle":{"status":"established","status_basis":"direct_current","status_as_of":"2026-08-03","summary":"Live proof-of-stake network with continuing mainnet upgrades and material current activity in independent data feeds."},
      "outlook":{"bull":"Blob demand, mainnet capacity and tokenized-asset settlement grow while validator and client diversity remain healthy.","base":"Ethereum remains a leading settlement layer while rollups retain much user execution and part of the economics.","bear":"Execution and application economics migrate faster than settlement demand grows, while concentration or upgrade failures weaken the security premium.","most_likely":"base","watch":["L1 and L2 fees and revenue measured together","blob utilization after Fusaka","Glamsterdam scope and official activation date","validator, staking-provider and client concentration"]},
      "review":{"status":"current","last_reviewed_at":"2026-08-03","next_review_at":"2026-08-10","reviewer":"chaindump-research-desk"},
      "forensic_analysis": {
        "version":"forensic-analysis-v1",
        "outcome":{"label":"thriving","summary":"Ethereum is a thriving settlement and collateral network, but the value captured from a rollup-centric economy remains an open measurement question.","confidence":"high","as_of":"2026-08-03","source_refs":["eth-llama-tvl","eth-llama-stables","eth-roadmap","eth-scaling"]},
        "why":{"summary":"Observed standards, liquidity and repeated protocol delivery support Ethereum settlement demand. Strategic inference: proof-of-stake security and rollup specialization preserved verifiability and lower-cost execution while dispersing users and economics across layers.","confidence":"medium","source_refs":["eth-forks","eth-staking","eth-scaling","eth-pectra","eth-fusaka","eth-llama-tvl"]},
        "strategic_choices":[
          {"decision":"Move consensus from proof of work to proof of stake.","consequence":"ETH became the security asset while concentration shifted toward staking infrastructure.","confidence":"high","source_refs":["eth-forks","eth-staking"]},
          {"decision":"Adopt rollup-centric scaling and blob data.","consequence":"L2 execution became cheaper while direct L1 fee capture and cross-rollup composability became conditional.","confidence":"high","source_refs":["eth-scaling","eth-fusaka"]},
          {"decision":"Keep research visions separate from committed fork schedules.","consequence":"Lean Ethereum can guide long-horizon work without being misreported as a shipped upgrade.","confidence":"high","source_refs":["eth-lean","eth-roadmap"]}
        ],
        "counterfactual":{"summary":"A monolithic execution-first design might retain more activity and fees on L1, but would change node-resource and scaling trade-offs. The evidence does not quantify the net counterfactual value.","confidence":"medium","source_refs":["eth-scaling","eth-roadmap"]},
        "watch":[
          {"signal":"L1 and L2 fees, burn, issuance and sequencer revenue measured together.","implication":"Shows whether ecosystem growth strengthens or dilutes direct ETH value capture.","source_refs":["eth-llama-fees","eth-llama-revenue","eth-scaling"]},
          {"signal":"Official Glamsterdam scope and activation announcement.","implication":"Separates a roadmap target from a production delivery date.","source_refs":["eth-glamsterdam"]},
          {"signal":"Validator, staking-provider and client concentration.","implication":"Tests whether proof-of-stake security remains independently controlled.","source_refs":["eth-staking"]}
        ],
        "unknowns":[
          {"question":"What share of rollup economic value ultimately accrues to ETH and L1 security?","resolution_trigger":"A reproducible L1/L2 value-attribution series."},
          {"question":"When will major rollups remove centralized sequencing and limited prover assumptions?","resolution_trigger":"Verified production decentralization milestones."},
          {"question":"What is the final Glamsterdam scope and activation date?","resolution_trigger":"Official mainnet announcement and client schedule."}
        ],
        "review":{"status":"current","last_reviewed_at":"2026-08-03","next_review_at":"2026-08-10","reviewer":"chaindump-research-desk"}
      }
    },
    "_meta": {
      "last_reviewed":"2026-08-03",
      "next_review_at":"2026-08-10",
      "forensic_freshness_schema":"forensic-freshness-v1",
      "status_basis":"direct_current",
      "status_as_of":"2026-08-03",
      "last_verified_at":"2026-08-03",
      "stale":false
    }
  },
  "fact_source_ids": {
    "identity":["eth-history","eth-launch","eth-forks","eth-pectra","eth-fusaka"],
    "token":["eth-history","eth-staking","eth-eip1559","eth-coingecko"],
    "capital":["eth-history"],
    "onchain":["eth-llama-tvl","eth-llama-fees","eth-llama-revenue","eth-llama-volume","eth-llama-stables"],
    "team":["eth-history"],
    "narrative":["eth-history","eth-roadmap","eth-pectra","eth-fusaka","eth-glamsterdam","eth-lean","eth-scaling"],
    "risk":["eth-roadmap","eth-glamsterdam","eth-scaling","eth-staking","eth-llama-fees","eth-llama-revenue"],
    "synthesis":["eth-roadmap","eth-pectra","eth-fusaka","eth-glamsterdam","eth-lean","eth-scaling","eth-staking","eth-eip1559","eth-coingecko","eth-llama-tvl","eth-llama-fees","eth-llama-revenue","eth-llama-volume","eth-llama-stables"],
    "_meta":["eth-roadmap","eth-glamsterdam","eth-llama-tvl"]
  }
}
');

UPDATE chain_analysis
SET
  take = json_extract((SELECT payload FROM _ethereum_profile_refresh), '$.analysis.take'),
  sentiment = json_extract((SELECT payload FROM _ethereum_profile_refresh), '$.analysis.sentiment'),
  trend = json_extract((SELECT payload FROM _ethereum_profile_refresh), '$.analysis.trend'),
  updated_at = json_extract((SELECT payload FROM _ethereum_profile_refresh), '$.analysis.updated_at'),
  sources = json_extract((SELECT payload FROM _ethereum_profile_refresh), '$.analysis.sources'),
  profile = json_set(
    json(json_extract((SELECT payload FROM _ethereum_profile_refresh), '$.analysis.profile')),
    '$.sources',
    json(json_extract((SELECT payload FROM _ethereum_profile_refresh), '$.analysis.sources'))
  )
WHERE lower(chain) = 'ethereum';

UPDATE chain_facts AS facts
SET
  data = CASE
    WHEN json_type(
      (SELECT payload FROM _ethereum_profile_refresh),
      '$.facts.' || facts.dimension
    ) = 'object'
    THEN json_patch(
      facts.data,
      json(json_extract(
        (SELECT payload FROM _ethereum_profile_refresh),
        '$.facts.' || facts.dimension
      ))
    )
    ELSE facts.data
  END,
  sources = COALESCE(
    (
      SELECT json_group_array(json(source.value))
      FROM json_each(
        json_extract((SELECT payload FROM _ethereum_profile_refresh), '$.analysis.sources')
      ) AS source
      WHERE json_extract(source.value, '$.id') IN (
        SELECT wanted.value
        FROM json_each(
          json_extract(
            (SELECT payload FROM _ethereum_profile_refresh),
            '$.fact_source_ids.' || facts.dimension
          )
        ) AS wanted
      )
    ),
    facts.sources
  ),
  updated_at = '2026-08-03'
WHERE facts.chain = 'Ethereum';

DROP TABLE _ethereum_profile_refresh;

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const documentPath = resolve(root, 'docs/chain-causal-completion-2026-07-29.json');
const migrationPath = resolve(root, 'migrations/0062_chain_causal_completion.sql');
const checkedAt = '2026-07-29';

const source = (id, title, publisher, url, sourceRole = 'primary') => ({
  id,
  title,
  publisher,
  url,
  source_role: sourceRole,
  checked_at: checkedAt,
});

function analysis({
  label,
  outcome,
  outcomeSources,
  why,
  whySources,
  choices,
  counterfactual,
  counterfactualSources,
  watch,
  unknowns,
  confidence = 'high',
  whyConfidence = 'medium',
  nextReview = '2026-08-05',
}) {
  return {
    version: 'forensic-analysis-v1',
    outcome: {
      label,
      summary: outcome,
      confidence,
      as_of: checkedAt,
      source_refs: outcomeSources,
    },
    why: {
      summary: why,
      confidence: whyConfidence,
      source_refs: whySources,
    },
    strategic_choices: choices.map(([decision, consequence, sourceRefs, choiceConfidence]) => ({
      decision,
      consequence,
      confidence: choiceConfidence ?? 'medium',
      source_refs: sourceRefs,
    })),
    counterfactual: {
      summary: counterfactual,
      confidence: 'medium',
      source_refs: counterfactualSources,
    },
    watch: watch.map(([signal, implication, sourceRefs]) => ({
      signal,
      implication,
      source_refs: sourceRefs,
    })),
    unknowns: unknowns.map(([question, resolutionTrigger]) => ({
      question,
      resolution_trigger: resolutionTrigger,
    })),
    review: {
      status: 'current',
      last_reviewed_at: checkedAt,
      next_review_at: nextReview,
      reviewer: 'chaindump-research-desk',
    },
  };
}

const cases = [
  {
    chain: 'Ethereum',
    sources: [
      source('eth-llama', 'Ethereum chain metrics', 'DefiLlama', 'https://defillama.com/chain/ethereum', 'independent-data'),
      source('eth-roadmap', 'Ethereum roadmap', 'Ethereum Foundation', 'https://ethereum.org/roadmap/'),
      source('eth-scaling', 'Scaling Ethereum', 'Ethereum Foundation', 'https://ethereum.org/roadmap/scaling/'),
      source('eth-priorities', 'Protocol priorities update for 2026', 'Ethereum Foundation', 'https://blog.ethereum.org/2026/02/18/protocol-priorities-update-2026'),
      source('eth-build', 'Why build on Ethereum', 'Ethereum Foundation', 'https://ethereum.org/latest/why-build-on-ethereum/'),
    ],
    forensic_analysis: analysis({
      label: 'thriving',
      outcome: 'Ethereum is a thriving, dominant settlement and collateral network rather than an unqualified execution winner. The July 29 snapshot records deep DeFi, stablecoin and tokenized-asset bases, while the protocol deliberately pushes much transaction execution to rollups. That makes L1-only fee or transaction comparisons incomplete and makes value capture from the rollup economy the central open question.',
      outcomeSources: ['eth-llama', 'eth-roadmap', 'eth-scaling'],
      why: 'Observed: Ethereum accumulated the deepest reviewed collateral and settlement base, has continued upgrading without a recorded full-network halt, and explicitly follows a rollup-centric roadmap. Strategic inference: its durability comes from choosing neutral settlement, multi-client fault isolation, conservative community-governed upgrades and cheap data availability for rollups instead of maximizing base-layer throughput. Those choices reinforced developer standards, liquidity and credible neutrality, but they also dispersed execution, users and fee capture across L2s. The success is therefore causal and conditional: standards plus security created the moat; rollup specialization preserved accessibility while creating fragmentation and an unresolved division of economics among ETH, L1 validators, applications and sequencers.',
      whySources: ['eth-roadmap', 'eth-scaling', 'eth-priorities', 'eth-build', 'eth-llama'],
      choices: [
        ['Replace proof of work with proof of stake through the Merge.', 'Energy use and issuance fell and staked ETH became the security budget; the trade-off moved concentration and correlated-provider risk into staking infrastructure.', ['eth-roadmap', 'eth-build'], 'high'],
        ['Adopt a rollup-centric scaling roadmap and introduce blob data.', 'L2 transaction capacity and cost improved without forcing every home node to execute every user transaction, while execution economics and user state fragmented across rollups.', ['eth-scaling', 'eth-priorities'], 'high'],
        ['Maintain multiple execution and consensus clients.', 'Implementation diversity limits one-client failure blast radius, but actual protection still depends on balanced client and operator shares rather than the number of codebases.', ['eth-build'], 'high'],
        ['Prioritize conservative, community-coordinated protocol upgrades over a single operator roadmap.', 'The network gained resilience and credible neutrality at the cost of slower coordination and unresolved governance during extreme failures.', ['eth-roadmap', 'eth-priorities'], 'medium'],
      ],
      counterfactual: 'A monolithic high-throughput L1 might have retained more execution fees and simpler composability, but would likely have raised node requirements and weakened the accessibility and client diversity supporting Ethereum’s trust premium. Rejecting rollups would also have left Base- and Arbitrum-class demand facing materially higher costs. The evidence does not establish the net counterfactual value captured by either design.',
      counterfactualSources: ['eth-scaling', 'eth-build', 'eth-priorities'],
      watch: [
        ['Ethereum and L2 TVL, stablecoins, tokenized assets, blobs, fees and transactions measured together.', 'Growth on L2s with stagnant L1 fees can still validate settlement demand, but may weaken direct ETH value capture.', ['eth-llama', 'eth-scaling']],
        ['Delivery and utilization of PeerDAS, blob-scaling and the published protocol-priority roadmap.', 'Successful capacity increases strengthen rollup settlement; delay or sustained underuse weakens the scaling thesis.', ['eth-priorities', 'eth-scaling']],
        ['Execution-client, consensus-client, staking-provider and cloud concentration.', 'Safety depends on independent control distribution; a dominant client or operator creates correlated fault risk.', ['eth-build']],
      ],
      unknowns: [
        ['What share of rollup economic value ultimately accrues to ETH and L1 security?', 'Publish a reproducible L1/L2 fee, MEV, issuance and sequencer-profit attribution series.'],
        ['When will major rollups decentralize sequencing and proving without degrading exits?', 'Verified production milestones and measured operator diversity.'],
        ['Who beneficially controls stake across pools, operators and infrastructure providers?', 'Independent entity-resolution audit of validator and delegation ownership.'],
        ['How would extreme-case social slashing be governed in practice?', 'A tested, public incident-governance procedure or real event postmortem.'],
      ],
    }),
  },
  {
    chain: 'Solana',
    sources: [
      source('sol-llama', 'Solana chain metrics', 'DefiLlama', 'https://defillama.com/chain/solana', 'independent-data'),
      source('sol-health', 'Solana network health report — June 2025', 'Solana Foundation', 'https://solana.com/uk/news/network-health-report-june-2025'),
      source('sol-reliability', 'Plans to improve the Solana network', 'Solana Foundation', 'https://solana.com/news/plans-to-improve-the-network-upgrades'),
      source('sol-alpenglow', 'Alpenglow upgrade', 'Solana Foundation', 'https://solana.com/de/upgrades/alpenglow'),
      source('sol-payments', 'Subscriptions and allowances', 'Solana Foundation', 'https://solana.com/news/subscriptions-and-allowances'),
    ],
    forensic_analysis: analysis({
      label: 'thriving',
      outcome: 'Solana is a thriving high-activity trading and payments chain. The reviewed snapshot shows leading spot DEX activity and substantial stablecoin and tokenized-asset use, while official engineering reports document a reliability program following earlier outages. High raw transaction counts are not treated as proof of valuable human demand, and the outcome remains conditioned on client diversity and validator economics.',
      outcomeSources: ['sol-llama', 'sol-health', 'sol-reliability'],
      why: 'Observed: Solana combines high DEX volume, low-latency shared state, large transaction throughput and a period of improved reliability after a history of correlated failures. Strategic inference: the chain won by committing to one performance-oriented execution environment, synchronous composability and aggressive validator/network engineering rather than fragmenting liquidity across rollups. That design made trading, consumer applications and frequent payments economically practical, and returning liquidity helped repair the outage-era reputation. The same choice makes hardware, networking, validator profitability and client diversity business-critical rather than secondary engineering details. Solana’s success is therefore a coupled flywheel of execution quality, wallet/application distribution and liquidity—not a throughput number—and it can reverse if reliability or validator independence deteriorates.',
      whySources: ['sol-llama', 'sol-health', 'sol-reliability', 'sol-alpenglow', 'sol-payments'],
      choices: [
        ['Prioritize one high-throughput shared-state L1 instead of a rollup-first architecture.', 'Applications gained synchronous composability and cheap frequent transactions, while demanding validator hardware and network performance became consensus dependencies.', ['sol-health', 'sol-alpenglow'], 'high'],
        ['Respond to outages with staged releases, adversarial testing, traffic controls and a second validator client.', 'Reliability improved and client optionality expanded, but diversity must be measured by production stake rather than release announcements.', ['sol-health', 'sol-reliability'], 'high'],
        ['Optimize fee markets and scheduling for high-load applications.', 'Trading and consumer apps can continue during local congestion, though priority markets and validator incentives can still create uneven user outcomes.', ['sol-reliability'], 'medium'],
        ['Expand from trading toward stablecoin payments and programmable commerce primitives.', 'The chain gains a route to repeat non-speculative demand, but adoption and retention require independent transaction and revenue attribution.', ['sol-payments', 'sol-llama'], 'medium'],
      ],
      counterfactual: 'Without the outage-driven reliability program and independent-client effort, high-load trading adoption would likely remain capped by liveness confidence. Reducing validator requirements could broaden participation but might sacrifice some execution profile that differentiated the chain. The evidence cannot quantify how much current activity would survive materially higher fees or lower speculative trading demand.',
      counterfactualSources: ['sol-health', 'sol-reliability', 'sol-alpenglow'],
      watch: [
        ['Thirty- and ninety-day DEX volume, application fees, stablecoins and tokenized assets rather than raw transactions alone.', 'Retention across paid use cases supports durable demand; activity dominated by low-value automation weakens it.', ['sol-llama']],
        ['Alpenglow activation, realized finality and incident performance.', 'Production fault tolerance near published targets would strengthen reliability; delay or regression reopens the core historical risk.', ['sol-alpenglow']],
        ['Stake share by independent clients, validator count and concentration.', 'Multiple binaries do not create resilience unless independently operated clients hold meaningful stake.', ['sol-health']],
      ],
      unknowns: [
        ['Did Alpenglow meet its stated activation and production fault-tolerance targets?', 'Public activation record plus independent latency and incident measurements.'],
        ['What share of stake runs fully independent Firedancer rather than hybrid implementations?', 'Dated stake-weighted client telemetry.'],
        ['How much activity is durable paid demand rather than bots or launch-driven churn?', 'Entity-adjusted cohorts and application-level fee retention.'],
        ['What is the validator profitability distribution after hardware, vote and bandwidth costs?', 'Audited operator economics across size cohorts.'],
      ],
    }),
  },
  {
    chain: 'Base',
    sources: [
      source('base-llama', 'Base chain metrics', 'DefiLlama', 'https://defillama.com/chain/base?dexs=true', 'independent-data'),
      source('base-meet', 'Meet Base', 'Base', 'https://blog.base.org/meet-base'),
      source('base-strategy', '2026 mission, vision and strategy', 'Base', 'https://blog.base.org/2026-mission-vision-and-strategy'),
      source('base-stage1', 'Base has reached Stage 1 decentralization', 'Base', 'https://blog.base.org/base-has-reached-stage-1-decentralization'),
      source('base-l2beat', 'Base risk analysis', 'L2BEAT', 'https://l2beat.com/scaling/projects/base?protocols=base', 'independent-research'),
    ],
    forensic_analysis: analysis({
      label: 'thriving',
      outcome: 'Base is a thriving distribution-led Ethereum L2 with substantial liquidity and transactions despite launching without a native network token. It has reached Stage 1 under the project’s and L2BEAT’s frameworks, but sequencing and upgrade authority remain material trust assumptions. The observed success belongs to the network product; it is not evidence for a nonexistent token thesis.',
      outcomeSources: ['base-llama', 'base-meet', 'base-stage1', 'base-l2beat'],
      why: 'Observed: Base reached material TVL, stablecoin liquidity and transaction volume while using ETH for gas and the OP Stack for execution. Strategic inference: it compressed the normal chain cold start by combining Ethereum settlement and EVM compatibility with Coinbase’s exchange, wallet, merchant, account and application distribution. Choosing no native token reduced mercenary incentive signaling and aligned fees with ETH, while the shared Superchain stack accelerated infrastructure delivery. The consequence is a genuine product-led adoption signal, but also a concentrated dependency: Coinbase distribution, first-party products, sequencing and upgrade influence are simultaneously the moat and the censorship, regulatory and neutrality risk. Base succeeded because distribution and usable products reinforced liquidity—not because its rollup code alone was unique.',
      whySources: ['base-meet', 'base-strategy', 'base-stage1', 'base-l2beat', 'base-llama'],
      choices: [
        ['Launch without a new network token and use ETH as gas.', 'Base avoided a token-incentive cold start and strengthened Ethereum alignment, but lacks a native token for validator or governance distribution.', ['base-meet'], 'high'],
        ['Build on the open OP Stack and join the Superchain economic model.', 'Shared infrastructure and interoperability create stack network effects, while upgrades and revenue sharing tie Base to Optimism governance and common machinery.', ['base-meet', 'base-stage1'], 'high'],
        ['Vertically integrate the chain with Coinbase and Base account, app and payments products.', 'Existing users and merchant rails create distribution competitors cannot easily copy, while first-party power can challenge ecosystem neutrality.', ['base-strategy'], 'high'],
        ['Advance to Stage 1 before claiming full decentralization.', 'Permissionless fault proofs and exit protections improve user control, but centralized sequencing and upgrade powers remain explicit rather than solved.', ['base-stage1', 'base-l2beat'], 'high'],
      ],
      counterfactual: 'Without Coinbase distribution, Base would likely resemble a competent but less liquid OP Stack deployment competing on technology and incentives. A token could have accelerated grants or speculation, but also weakened the product-led and ETH-aligned signal. A faster move to decentralized sequencing might reduce control risk while sacrificing some operational integration; the sources do not quantify that trade-off.',
      counterfactualSources: ['base-meet', 'base-strategy', 'base-l2beat'],
      watch: [
        ['TVL, stablecoin mix, DEX volume, active users and fee retention after incentives.', 'Persistent multi-product usage validates distribution-led demand; one-off campaigns do not.', ['base-llama', 'base-strategy']],
        ['Progress from Stage 1 to Stage 2, proof-system diversity and upgrade thresholds.', 'Reduced unilateral control strengthens the neutrality thesis; stagnation preserves a centralization discount.', ['base-stage1', 'base-l2beat']],
        ['Coinbase- and Base-product-originated merchant, payment and application flows.', 'Growth outside crypto-native trading demonstrates the proposed distribution flywheel.', ['base-strategy']],
      ],
      unknowns: [
        ['What is the dated path to Stage 2 and decentralized sequencing?', 'Published milestones verified by L2 risk analysis and production contracts.'],
        ['How independent and censorship-resistant is sequencer operation in practice?', 'Public operator diversity, incident and censorship telemetry.'],
        ['How many Base App and payment users retain activity independent of promotions?', 'Audited user cohorts and attributable fees.'],
        ['Could token policy change despite the original no-token statement?', 'A binding governance or operator policy, not speculation.'],
      ],
    }),
  },
  {
    chain: 'BSC',
    sources: [
      source('bsc-llama', 'BSC chain metrics', 'DefiLlama', 'https://defillama.com/chain/bsc?currency=USD', 'independent-data'),
      source('bsc-consensus', 'BNB Smart Chain introduction', 'BNB Chain', 'https://docs.bnbchain.org/bnb-smart-chain/introduction/'),
      source('bsc-roadmap', 'BNB Chain H2 2026 technical roadmap', 'BNB Chain', 'https://www.bnbchain.org/en/blog/bnb-chain-h2-2026-tech-roadmap-doubling-down-on-speed'),
      source('bsc-mev', 'Malicious MEV reduction', 'BNB Chain', 'https://www.bnbchain.org/en/blog/malicious-mev-reduction'),
    ],
    forensic_analysis: analysis({
      label: 'thriving',
      outcome: 'BSC is a thriving mass-market EVM trading and stablecoin chain with high observed activity. Its success is paired with a persistent concentration discount: the small elected validator set and Binance-adjacent distribution produce speed and liquidity, but weaken the credible-neutrality case compared with broader validator networks. Activity does not erase this governance trade-off.',
      outcomeSources: ['bsc-llama', 'bsc-consensus', 'bsc-roadmap'],
      why: 'Observed: BSC combines large stablecoin liquidity and DEX volume with low fees, EVM compatibility and a limited proof-of-staked-authority validator set. Strategic inference: the chain won retail flow by minimizing migration cost for Ethereum applications, using BNB incentives and exchange-adjacent wallet/liquidity distribution, and repeatedly optimizing block time, clients and gas pricing for trading. That coordinated design can ship performance changes and incident responses quickly. It also concentrates validator selection, governance and brand risk, so the same coordination that creates speed can reduce neutrality and make external regulatory or operational shocks propagate. Low fees were necessary but not sufficient: pre-existing users, assets and applications supplied the distribution flywheel that technically similar chains lacked.',
      whySources: ['bsc-llama', 'bsc-consensus', 'bsc-roadmap', 'bsc-mev'],
      choices: [
        ['Use a limited, stake-ranked proof-of-staked-authority validator set.', 'A small active set supports predictable sub-second execution and coordinated slashing, while concentrating consensus and governance power.', ['bsc-consensus'], 'high'],
        ['Preserve EVM compatibility while aggressively reducing gas costs and block times.', 'Ethereum applications and users migrated cheaply and trading throughput grew, while state growth and validator economics became continuing engineering constraints.', ['bsc-roadmap'], 'high'],
        ['Treat malicious MEV as a coordinated builder, validator, governance and protected-RPC problem.', 'The ecosystem can intervene quickly, but operator-reported reduction claims require independent reproducibility and may hide displacement.', ['bsc-mev', 'bsc-roadmap'], 'medium'],
        ['Leverage BNB and Binance-adjacent liquidity instead of building distribution from zero.', 'The chain gained a powerful retail funnel and asset base, while inheriting brand, access and regulatory concentration risk.', ['bsc-llama', 'bsc-consensus'], 'medium'],
      ],
      counterfactual: 'A much larger, permissionlessly rotating validator set could improve credible neutrality but might slow the exact coordinated execution profile that won retail trading flow. Without Binance-adjacent liquidity and wallet distribution, low fees and EVM compatibility alone would probably not have produced the same scale. The evidence does not isolate the independent causal contribution of brand, incentives and technology.',
      counterfactualSources: ['bsc-llama', 'bsc-consensus', 'bsc-roadmap'],
      watch: [
        ['DEX volume, stablecoin supply, active addresses and application revenue per transaction.', 'Paid retained demand matters more than benchmark TPS or raw transactions.', ['bsc-llama']],
        ['Validator beneficial ownership, stake concentration, client mix and slash incidents.', 'Concentrated control or correlated clients widen the safety discount.', ['bsc-consensus']],
        ['Realized finality, fees, state growth and validator yield after roadmap changes.', 'Performance gains are durable only if independent validators can economically operate them.', ['bsc-roadmap']],
      ],
      unknowns: [
        ['Who beneficially controls the elected validators and their major delegations?', 'Independent entity-resolution and infrastructure audit.'],
        ['Can the claimed malicious-MEV reduction be reproduced independently?', 'Published methodology and third-party block-level replication.'],
        ['Is validator security budget sustainable after large gas-price cuts?', 'Operator cost, reward and exit data by cohort.'],
        ['What trust and migration assumptions accompany the proposed next-generation architecture?', 'Production specifications, audits and transition plan.'],
      ],
    }),
  },
  {
    chain: 'Arbitrum',
    sources: [
      source('arb-llama', 'Arbitrum chain metrics', 'DefiLlama', 'https://defillama.com/chain/arbitrum', 'independent-data'),
      source('arb-docs', 'Arbitrum documentation', 'Arbitrum Foundation', 'https://docs.arbitrum.io/'),
      source('arb-timeboost', 'Timeboost live on Arbitrum', 'Arbitrum Foundation', 'https://blog.arbitrum.io/gattaca-titan-timeboost-live-on-arbitrum/'),
      source('arb-stylus', 'Arbitrum Stylus mainnet', 'Arbitrum Foundation', 'https://blog.arbitrum.io/arbitrum-stylus-mainnet/'),
      source('arb-l2beat', 'Arbitrum One risk analysis', 'L2BEAT', 'https://l2beat.com/scaling/projects/arbitrum?selectedChart=detailedTvl', 'independent-research'),
    ],
    forensic_analysis: analysis({
      label: 'successful',
      outcome: 'Arbitrum is a successful but share-challenged Ethereum L2: it retains material secured value, stablecoins and derivatives activity, while Base has taken broader activity leadership. The network and its finance applications are evaluated separately from ARB, which is a governance token while ETH pays gas. Chain use therefore does not automatically imply token value capture.',
      outcomeSources: ['arb-llama', 'arb-docs', 'arb-l2beat'],
      why: 'Observed: Arbitrum built durable DeFi and perpetuals liquidity, introduced permissionless BoLD validation, and expanded from one rollup into configurable Orbit chains, Stylus execution and Timeboost ordering. Strategic inference: early rollup liquidity, close EVM compatibility and finance specialization created a defensible application base, while the Orbit stack diversified distribution beyond one chain. The consequence is strong infrastructure and substantial value secured, but also fragmentation and a weaker mass-market funnel than Base. Centralized sequencing, emergency upgrades and uncertain ARB value capture remain explicit risks. Arbitrum succeeded technically and economically in finance; it lost general-purpose share because security and developer tooling alone did not match a competitor’s integrated consumer distribution.',
      whySources: ['arb-llama', 'arb-docs', 'arb-timeboost', 'arb-stylus', 'arb-l2beat'],
      choices: [
        ['Use Nitro compression and Ethereum data availability with permissionless BoLD challenges.', 'The rollup gained credible validation and exits, while interactive proofs, bonding and emergency controls remain operational trust considerations.', ['arb-docs', 'arb-l2beat'], 'high'],
        ['Offer Orbit and AnyTrust as configurable application-chain products.', 'The stack reaches dedicated deployments and new fee domains, but differing data-availability assumptions and separate chains fragment liquidity.', ['arb-docs'], 'high'],
        ['Add Stylus support for Rust, C and C++ alongside the EVM.', 'The addressable developer base expands, though production adoption and incremental demand remain unproven.', ['arb-stylus'], 'high'],
        ['Auction express transaction ordering through Timeboost.', 'Ordering rights create explicit, treasury-capturable economics instead of eliminating MEV, while sequencer concentration persists.', ['arb-timeboost', 'arb-l2beat'], 'high'],
      ],
      counterfactual: 'Without Orbit and Stylus, Arbitrum would be more dependent on one EVM rollup’s declining relative share. With a Coinbase-scale consumer funnel it might have retained category leadership, but that comparison cannot isolate product, incentives and distribution. Faster sequencer decentralization could reduce control risk, while potentially slowing the coordinated ordering and upgrade model used today.',
      counterfactualSources: ['arb-llama', 'arb-docs', 'arb-l2beat'],
      watch: [
        ['TVL, stablecoins, spot and perpetuals volume, and net flows relative to Base and Ethereum.', 'Finance specialization can remain successful even if broad activity share falls, but sustained outflows challenge the moat.', ['arb-llama']],
        ['Orbit production chains, retained users and fees attributable to the Arbitrum ecosystem.', 'Real stack adoption validates diversification only when it creates durable use and measurable ecosystem value.', ['arb-docs']],
        ['Sequencer and upgrade decentralization, BoLD challenges and security incidents.', 'Reduced unilateral control strengthens the trust model; emergency dependence preserves a discount.', ['arb-l2beat']],
      ],
      unknowns: [
        ['What caused the relative TVL and activity share loss?', 'Cohort analysis separating incentives, UX, app migration and competitor distribution.'],
        ['How much Orbit economic value accrues to ARB holders or the DAO?', 'Audited fee and revenue attribution across production chains.'],
        ['When will sequencing and emergency-upgrade powers decentralize?', 'Dated production milestones verified in contracts and risk frameworks.'],
        ['How much retained usage is specifically attributable to Stylus?', 'Language-level application cohorts after grants and launch effects.'],
      ],
    }),
  },
  {
    chain: 'Polygon',
    sources: [
      source('pol-llama', 'Polygon chain metrics', 'DefiLlama', 'https://defillama.com/chain/polygon', 'independent-data'),
      source('pol-zkevm', 'Polygon zkEVM closure and recovery', 'Polygon Labs', 'https://polygon.technology/polygon-zkevm'),
      source('pol-sunset', 'Sunsetting Polygon zkEVM Mainnet Beta', 'Polygon Forum', 'https://forum.polygon.technology/t/sunsetting-polygon-zkevm-mainnet-beta-in-2026/21020'),
      source('pol-payments', '2025 in review: payments usage on Polygon', 'Polygon Labs', 'https://polygon.technology/blog/2025-in-review-a-year-of-real-payments-usage-on-polygon'),
      source('pol-agglayer', 'Pessimistic proofs live on Agglayer mainnet', 'Polygon Labs', 'https://polygon.technology/blog/major-development-upgrade-for-a-multistack-future-pessimistic-proofs-live-on-agglayer-mainnet'),
    ],
    forensic_analysis: analysis({
      label: 'middling',
      outcome: 'Polygon is a middling ecosystem with a materially used PoS chain and a failed zkEVM product. Polygon PoS retains stablecoins, transactions and DEX activity; the separate zkEVM sequencer stopped in July 2026 and recovery constraints remain. Treating the living PoS chain as dead, or the zkEVM sunset as irrelevant, would both erase the actual mixed lifecycle.',
      outcomeSources: ['pol-llama', 'pol-zkevm', 'pol-sunset', 'pol-payments'],
      why: 'Observed: cheap EVM PoS execution continues to process meaningful payments and application activity, while Polygon’s technically ambitious zkEVM was sunset after delayed upgrades, operational constraints and weak differentiation. Strategic inference: the early PoS product won distribution by being inexpensive, familiar and enterprise-friendly, but the organization then spread attention across PoS, zkEVM and a broad multi-product scaling narrative. Custom-client complexity, ZK counters and lagging EIP-4844 support made the zkEVM experience less competitive, stranding some smart-contract-held assets during closure. The current Agglayer and payments reset is an attempt to turn research and multiple stacks into unified distribution. Polygon’s problem was not absence of engineering; it was insufficient product differentiation and focus relative to the cost of maintaining simultaneous bets.',
      whySources: ['pol-zkevm', 'pol-sunset', 'pol-payments', 'pol-agglayer', 'pol-llama'],
      choices: [
        ['Launch an EVM-equivalent zkEVM alongside the established PoS chain.', 'Polygon demonstrated ZK capability, but duplicate products and custom-client constraints diluted differentiation and operating focus.', ['pol-sunset', 'pol-zkevm'], 'high'],
        ['Retain and upgrade PoS around cheap, fast payment execution.', 'The surviving product preserves high-volume use and stablecoin distribution, while carrying a different security model from a full Ethereum rollup.', ['pol-payments', 'pol-llama'], 'high'],
        ['Sunset zkEVM with a user-recovery process rather than indefinitely subsidizing it.', 'Resources can move to PoS and Agglayer, but contracts unable to use the recovery interface may remain stranded and trust is damaged.', ['pol-zkevm', 'pol-sunset'], 'high'],
        ['Pivot from many Polygon-branded execution products toward chain-agnostic Agglayer coordination.', 'A multistack network may aggregate liquidity and create new POL roles, but adoption and value accrual are not established by launch announcements.', ['pol-agglayer'], 'medium'],
      ],
      counterfactual: 'Concentrating earlier on PoS reliability, payments and one differentiated ZK product might have reduced ecosystem confusion and user stranding. Abandoning ZK research altogether would have forfeited Agglayer and prover optionality. The evidence supports the zkEVM failure mechanisms, but cannot prove that product focus alone would have overcome Base and Arbitrum distribution advantages.',
      counterfactualSources: ['pol-sunset', 'pol-payments', 'pol-agglayer'],
      watch: [
        ['PoS stablecoin/payment volume, active users, fees and durable applications after zkEVM closure.', 'Retained paid use validates the living-chain thesis; activity collapse would move the ecosystem toward decline.', ['pol-llama', 'pol-payments']],
        ['Amounts recovered and stranded from zkEVM, plus claim completion.', 'A transparent resolution narrows user-loss uncertainty; unresolved contracts remain a continuing lifecycle liability.', ['pol-zkevm']],
        ['Agglayer connected chains, cross-chain volume, proof incidents and attributable POL economics.', 'Measured production use is required before the strategic pivot can be called successful.', ['pol-agglayer']],
      ],
      unknowns: [
        ['How much zkEVM value remains stranded in smart contracts?', 'Final recovery accounting by asset and contract type.'],
        ['How much PoS activity is real external payment demand rather than automation or incentives?', 'Entity-adjusted application cohorts and paid fee retention.'],
        ['Does Agglayer produce durable cross-chain activity and POL value capture?', 'Audited production volumes, fees and staking flows.'],
        ['What is current validator and infrastructure concentration after PoS upgrades?', 'Independent stake, client and operator mapping.'],
      ],
    }),
  },
  {
    chain: 'Tron',
    sources: [
      source('tron-llama', 'Tron chain metrics', 'DefiLlama', 'https://defillama.com/chain/tron', 'independent-data'),
      source('tron-resource', 'TRON resource model', 'TRON DAO', 'https://developers.tron.network/docs/resource-model'),
      source('tron-sr', 'TRON super representatives', 'TRON DAO', 'https://developers.tron.network/docs/super-representatives'),
      source('tron-economics', 'TRON economic model', 'TRON DAO', 'https://developers.tron.network/docs/tron-economic-model'),
    ],
    forensic_analysis: analysis({
      label: 'thriving',
      outcome: 'Tron is a thriving but narrow and concentrated stablecoin-transfer rail. The reviewed snapshot shows very large stablecoin balances and active addresses relative to a much smaller DEX economy, with USDT dominating the stablecoin mix. Success in low-cost transfers should not be generalized into broad application diversity or decentralized governance.',
      outcomeSources: ['tron-llama', 'tron-resource', 'tron-sr'],
      why: 'Observed: Tron supports a very large stablecoin base and frequent transfers through a bandwidth-and-energy resource model, TRC-20 compatibility and 27 elected block-producing super representatives. Strategic inference: the network optimized for cheap, predictable token movement and exchange settlement rather than a maximally broad validator set or differentiated application stack. That fit USDT distribution exceptionally well, and issuer, exchange and user liquidity reinforced one another until the payment rail became difficult to displace. The cost is concentration: one stablecoin issuer dominates balances, 27 producers coordinate consensus, and a narrow use case can mask shallow application diversity. Tron succeeded because it found a repeat transactional killer app; that success remains exposed to issuer policy, beneficial validator control and competing payment rails.',
      whySources: ['tron-llama', 'tron-resource', 'tron-sr', 'tron-economics'],
      choices: [
        ['Use bandwidth and energy resources obtained through staking or delegation, with TRX burn as fallback.', 'Frequent transfers receive predictable economics and a resource-rental market, while users inherit complexity and intermediated resource pricing.', ['tron-resource', 'tron-economics'], 'high'],
        ['Limit block production to 27 elected super representatives.', 'Three-second production and fast parameter coordination become practical, while consensus and governance power remain concentrated.', ['tron-sr'], 'high'],
        ['Prioritize EVM-compatible TRC-20 token and stablecoin rails.', 'Existing wallets and exchanges could support USDT transfers at scale, but one issuer and use case dominate the economic profile.', ['tron-llama', 'tron-economics'], 'high'],
        ['Make transaction resources and fees adjustable through representative governance.', 'The chain can respond to congestion and economics quickly, while large voters and producers gain material policy influence.', ['tron-sr', 'tron-resource'], 'medium'],
      ],
      counterfactual: 'A broader validator set could improve neutrality but raise coordination and latency costs. Without early USDT and exchange distribution, the resource model alone likely would not have produced the same transfer network effect. A more diversified application strategy might reduce issuer dependence, but could also dilute the cheap-transfer specialization that made the chain successful.',
      counterfactualSources: ['tron-llama', 'tron-resource', 'tron-sr'],
      watch: [
        ['Stablecoin supply by issuer, transfer growth, active addresses, fees and diversified application volume.', 'Transfer growth with broader paid applications strengthens durability; greater issuer concentration increases fragility.', ['tron-llama']],
        ['Super-representative vote concentration, turnover and shared infrastructure.', 'Independent and rotating producers narrow the governance discount; coordinated control widens it.', ['tron-sr']],
        ['Energy pricing, rental demand, TRX burn and transfer cost versus competing rails.', 'The killer app persists only while users retain a cost and distribution advantage.', ['tron-resource', 'tron-economics']],
      ],
      unknowns: [
        ['Who beneficially controls the 27 super representatives and largest voters?', 'Independent entity and infrastructure-resolution audit.'],
        ['What share of transfers represents external commerce rather than exchange movement or automation?', 'Entity-adjusted flow classification and sampled user cohorts.'],
        ['How sensitive is activity to Tether issuance, redemption and compliance policy?', 'Issuer scenario analysis and observed policy-event responses.'],
        ['Who captures margins in the energy-rental market and how concentrated is supply?', 'Address-level market-share and profitability analysis.'],
      ],
    }),
  },
  {
    chain: 'Avalanche',
    sources: [
      source('avax-docs', 'Avalanche documentation', 'Avalanche', 'https://build.avax.network/docs'),
      source('avax-l1', 'Avalanche L1 overview', 'Avalanche', 'https://build.avax.network/docs/avalanche-l1s'),
      source('avax-llama-tvl', 'Avalanche historical TVL', 'DefiLlama', 'https://api.llama.fi/v2/historicalChainTvl/Avalanche', 'independent-data'),
      source('avax-llama-fees', 'Avalanche fee metrics', 'DefiLlama', 'https://api.llama.fi/overview/fees/Avalanche?dataType=dailyFees', 'independent-data'),
      source('avax-cg', 'AVAX market data', 'CoinGecko', 'https://api.coingecko.com/api/v3/coins/avalanche-2', 'independent-data'),
    ],
    forensic_analysis: analysis({
      label: 'middling',
      outcome: 'Avalanche is an established but middling L1: its current chain still has observable fees, liquidity and application activity, while both TVL and AVAX remain roughly 96% below their reviewed cycle peaks. The current strategy centers on customizable Avalanche L1 networks, so C-Chain TVL alone is incomplete; equally, deployment announcements do not prove recurring economic demand or AVAX value capture.',
      outcomeSources: ['avax-llama-tvl', 'avax-llama-fees', 'avax-cg', 'avax-l1'],
      why: 'Observed: Avalanche’s 2021 liquidity expansion did not persist, leaving a severe capital and token drawdown, while the platform continues to offer an EVM C-Chain and customizable sovereign-style Avalanche L1s. Strategic inference: the original combination of EVM familiarity, fast finality and liquidity incentives attracted portable DeFi capital, but did not create a sufficiently durable application or distribution moat after incentives and the market cycle faded. The later custom-chain strategy gives institutions and applications control over execution and validator requirements, yet it can fragment users, liquidity and fees away from the primary network. Avalanche is not dead because the architecture and economic activity remain; it is middling because its strategic breadth has not yet demonstrated recurring demand that reconnects custom-network adoption to shared liquidity and AVAX economics.',
      whySources: ['avax-docs', 'avax-l1', 'avax-llama-tvl', 'avax-llama-fees', 'avax-cg'],
      choices: [
        ['Provide an EVM-compatible C-Chain for general-purpose applications.', 'Ethereum tooling lowered adoption friction and helped the liquidity boom, but made applications and capital highly portable to competing EVM chains.', ['avax-docs'], 'high'],
        ['Use incentives and ecosystem programs to accelerate early DeFi liquidity.', 'TVL scaled rapidly during the cycle, while the later 96% drawdown indicates that peak capital was not a durable moat.', ['avax-llama-tvl'], 'medium'],
        ['Expand from subnets into customizable Avalanche L1 networks.', 'Applications and institutions gain dedicated execution and policy control, while the ecosystem risks fragmenting liquidity, validator economics and user attention.', ['avax-l1'], 'high'],
        ['Keep AVAX as the primary network staking and fee asset while allowing custom network configurations.', 'Shared security and asset demand can accrue to AVAX, but the strength of that linkage varies with each L1’s validator and fee choices.', ['avax-docs', 'avax-l1'], 'medium'],
      ],
      counterfactual: 'A narrower focus on one or two high-retention applications and shared C-Chain liquidity might have produced a clearer moat, but would have sacrificed institutional and application-chain optionality. Stronger mandatory AVAX economics across custom L1s could improve value capture while raising adoption friction. The evidence cannot prove that either alternative would have retained 2021 incentive-driven capital.',
      counterfactualSources: ['avax-l1', 'avax-llama-tvl', 'avax-docs'],
      watch: [
        ['C-Chain TVL, fees and retained users alongside each production Avalanche L1’s transactions and fees.', 'Broad deployment only strengthens the thesis when it produces recurring paid demand.', ['avax-llama-tvl', 'avax-llama-fees', 'avax-l1']],
        ['Liquidity and asset movement among C-Chain and custom L1s.', 'Rising fragmentation without usable interoperability weakens ecosystem network effects.', ['avax-l1']],
        ['AVAX staking, burn and fee demand attributable to custom L1 operation.', 'Measured linkage would resolve the value-capture question; weak linkage leaves used infrastructure with weak asset economics.', ['avax-docs', 'avax-l1']],
      ],
      unknowns: [
        ['How many announced Avalanche L1s have retained production users and fees?', 'Contract- and chain-level cohorts after launch incentives.'],
        ['What proportion of custom-L1 activity creates AVAX demand?', 'Audited fee, staking and validator-payment attribution.'],
        ['How concentrated are validators and infrastructure across primary and custom networks?', 'Independent operator and hosting map.'],
        ['How much current liquidity is incentive-sensitive?', 'Protocol cohorts before, during and after reward changes.'],
      ],
    }),
  },
  {
    chain: 'Bitcoin',
    sources: [
      source('btc-paper', 'Bitcoin: A Peer-to-Peer Electronic Cash System', 'Satoshi Nakamoto', 'https://bitcoin.org/bitcoin.pdf', 'primary-historical'),
      source('btc-core', 'About Bitcoin Core', 'Bitcoin Core', 'https://bitcoincore.org/en/about/'),
      source('btc-consensus', 'Bitcoin consensus amount constants', 'Bitcoin Core', 'https://github.com/bitcoin/bitcoin/blob/master/src/consensus/amount.h'),
      source('btc-dev', 'Bitcoin transaction developer guide', 'Bitcoin.org', 'https://developer.bitcoin.org/devguide/transactions.html'),
      source('btc-cve', 'CVE-2018-17144 disclosure', 'Bitcoin Core', 'https://bitcoincore.org/en/2018/09/20/notice/'),
    ],
    forensic_analysis: analysis({
      label: 'successful',
      outcome: 'Bitcoin is a successful monetary-settlement L1 and the control case for a chain without a company treasury, token sale or native DeFi-TVL metric. The outcome rests on continued protocol operation and the durability of proof-of-work settlement, not on wrapped-BTC application TVL. This dossier deliberately withholds current market, hash-rate and fee conclusions not covered by its dated source set.',
      outcomeSources: ['btc-paper', 'btc-core', 'btc-consensus', 'btc-dev'],
      why: 'Observed: Bitcoin has operated since 2009 under a proof-of-work consensus model, uses a native scarce fee asset, and is maintained through open-source client development rather than a protocol company. Strategic inference: its durability comes from choosing a deliberately narrow monetary function, simple validation rules, costly proof-of-work history and the ability for users to verify with their own software. Avoiding a foundation-led roadmap and rich base-layer application environment reduced governance and execution complexity, while limiting throughput and pushing custody, payments and applications into external layers. The success is not “oldest therefore best”: the design created a credible, hard-to-change settlement asset and social coordination norm. Its long-run weakness is the same narrowness—security must increasingly rely on fee demand, and many users depend on concentrated miners, pools and custodians outside consensus.',
      whySources: ['btc-paper', 'btc-core', 'btc-consensus', 'btc-dev', 'btc-cve'],
      choices: [
        ['Use proof of work and accumulated chain work to order transactions.', 'Open participation and costly history support censorship resistance, while security consumes resources and depends on economically independent hash power.', ['btc-paper'], 'high'],
        ['Embed rule-based issuance and transition miner incentives toward transaction fees.', 'Predictable monetary rules strengthen scarcity, while declining subsidy makes future fee demand a material security-budget question.', ['btc-paper', 'btc-consensus'], 'high'],
        ['Keep the base protocol narrow instead of adding a general smart-contract VM.', 'Validation remains comparatively auditable and stable, while applications and higher-throughput payments move to layers with separate trust assumptions.', ['btc-dev', 'btc-core'], 'medium'],
        ['Rely on open-source maintainers and voluntary node adoption rather than an owner-controlled upgrade process.', 'No entity can unilaterally rewrite consensus, but upgrades and emergencies require slow social coordination and concentrated maintainer review.', ['btc-core', 'btc-cve'], 'high'],
      ],
      counterfactual: 'A richer VM and faster base-layer blocks could have attracted more application fees and native activity, but likely increased node resource demands, attack surface and contentious governance. A foundation treasury could coordinate development faster while creating an identifiable control point. The sources do not establish whether those alternatives would improve the current security budget or weaken the trust-minimized settlement property.',
      counterfactualSources: ['btc-paper', 'btc-core', 'btc-dev', 'btc-cve'],
      watch: [
        ['Fee revenue relative to block subsidy across full market cycles.', 'A durable fee market supports the post-subsidy security thesis; weak fees increase dependence on issuance and miner economics.', ['btc-paper', 'btc-consensus']],
        ['Hash-rate, mining-pool and infrastructure concentration from dated independent data.', 'Concentration can undermine the assumption that honest control is broadly distributed.', ['btc-paper']],
        ['Critical client vulnerabilities, adoption of fixes and implementation diversity.', 'Rapid remediation limits consensus risk; unpatched correlated clients widen it.', ['btc-cve', 'btc-core']],
      ],
      unknowns: [
        ['What is the current beneficial concentration of hash power?', 'Entity-resolved pool, facility and financing data.'],
        ['Will transaction fees support an adequate security budget as subsidy declines?', 'Multi-cycle fee, hash-price and attack-cost modeling.'],
        ['How concentrated is practical user custody and transaction access?', 'Audited custodian and wallet market shares across jurisdictions.'],
        ['How distributed is effective influence over Bitcoin Core changes?', 'Maintainer, reviewer, funding and node-adoption analysis.'],
      ],
      nextReview: '2026-08-29',
    }),
  },
  {
    chain: 'Cardano',
    sources: [
      source('ada-eras', 'Cardano development phases and eras', 'Cardano Foundation', 'https://docs.cardano.org/about-cardano/evolution/eras-and-phases'),
      source('ada-shelley', 'Byron to Shelley transition', 'Cardano Foundation', 'https://docs.cardano.org/about-cardano/evolution/upgrades/byron-to-shelley'),
      source('ada-supply', 'ADA supply distribution — epoch 637', 'Cardano Foundation', 'https://cardano.org/insights/supply/?epoch=637'),
      source('ada-constitution', 'Cardano Constitution', 'Cardano Foundation', 'https://cardano.org/constitution/'),
      source('ada-rewards', 'Pledging and rewards', 'Cardano Foundation', 'https://docs.cardano.org/about-cardano/learn/pledging-rewards'),
      source('ada-llama', 'Cardano chain metrics', 'DefiLlama', 'https://defillama.com/chain/cardano', 'independent-data'),
    ],
    forensic_analysis: analysis({
      label: 'middling',
      outcome: 'Cardano is an established but middling L1: it completed a documented transition from federated operation toward stake-pool consensus and constitutional governance, while the July 29 DefiLlama snapshot showed about $62 million of DeFi TVL, $63.5 million of stablecoins, $1.64 million of 24-hour DEX volume and $883 of 24-hour chain fees. Protocol longevity and governance machinery are real outcomes, but the independently observed application economy remains modest relative to ADA’s roughly $6 billion market capitalization.',
      outcomeSources: ['ada-eras', 'ada-shelley', 'ada-constitution', 'ada-supply', 'ada-llama'],
      why: 'Observed: Cardano pursued staged protocol eras, formal research, a Byron-to-Shelley stake-pool transition, native staking incentives and constitutional treasury governance. The July 29 independent-data snapshot showed a functioning application layer, including DeFi liquidity, stablecoins, DEX trading, active addresses and transaction activity, but only $883 in daily chain fees against an ADA market capitalization near $6 billion. Strategic inference: this methodical approach prioritized protocol correctness, predictable evolution and formal governance over rapid application shipping and ecosystem improvisation. It produced a durable chain, a large native asset base and a clear decentralization narrative, but increased time-to-market while faster EVM and high-throughput competitors accumulated liquidity, developers and consumer distribution. Cardano is not a failed chain: consensus, staking, governance and applications continue. It is middling because the strategic investment in research and process has not yet produced application demand and fee generation commensurate with its capitalization and longevity. The causal question is execution of treasury and roadmap into retained paid use, not the existence of those mechanisms.',
      whySources: ['ada-eras', 'ada-shelley', 'ada-constitution', 'ada-rewards', 'ada-supply', 'ada-llama'],
      choices: [
        ['Deliver the protocol through named eras and staged hard-fork transitions.', 'Changes can be researched and coordinated deliberately, while application capabilities arrive more slowly than in ecosystems that ship iteratively.', ['ada-eras'], 'high'],
        ['Move from federated Byron operation to delegated stake pools in Shelley.', 'Consensus participation broadened beyond the launch federation, while current pool ownership and effective delegation concentration still require measurement.', ['ada-shelley', 'ada-rewards'], 'high'],
        ['Use ADA for fees, staking rewards, governance and treasury funding.', 'One asset coordinates network security and policy, while price, delegation and treasury-allocation incentives become coupled.', ['ada-supply', 'ada-rewards', 'ada-constitution'], 'high'],
        ['Constitutionalize governance and treasury decision-making.', 'The community gains formal proposal and budget mechanisms, but procedural legitimacy does not guarantee fast or economically productive allocation.', ['ada-constitution'], 'high'],
      ],
      counterfactual: 'Shipping smart-contract and application tooling earlier could have captured more of the 2020–2021 developer and liquidity cycle, but might have weakened the research-first quality and governance transition. More centralized roadmap execution could move faster while contradicting the decentralization thesis. The evidence cannot determine whether faster delivery would have produced retained users rather than short-lived incentives.',
      counterfactualSources: ['ada-eras', 'ada-shelley', 'ada-constitution'],
      watch: [
        ['Application TVL, stablecoins, DEX volume, active users, fees and developer retention from dated sources.', 'Sustained paid application demand would move Cardano from institutional durability to economic success.', ['ada-llama']],
        ['Stake-pool beneficial ownership, delegation concentration and operator profitability.', 'Nominal pool counts are insufficient if control or infrastructure is concentrated.', ['ada-rewards', 'ada-shelley']],
        ['Treasury proposal throughput, completion, audited outcomes and repeat user impact.', 'Effective allocation validates constitutional governance; unspent or low-impact capital weakens it.', ['ada-constitution']],
      ],
      unknowns: [
        ['How much of the observed application demand represents retained users rather than short-lived activity?', 'Thirty-, ninety- and 180-day user, fee and liquidity cohorts with protocol attribution.'],
        ['Who beneficially controls stake pools and delegation?', 'Independent entity and infrastructure mapping.'],
        ['What economic outcomes has treasury spending produced?', 'Proposal-level completion, spend and retained-usage audits.'],
        ['What is current client and infrastructure diversity?', 'Stake-weighted production telemetry.'],
      ],
    }),
  },
  {
    chain: 'Hyperliquid L1',
    sources: [
      source('hl-docs', 'Hyperliquid technical overview', 'Hyperliquid', 'https://hyperliquid.gitbook.io/hyperliquid-docs'),
      source('hl-team', 'Hyperliquid core contributors', 'Hyperliquid', 'https://hyperliquid.gitbook.io/hyperliquid-docs/about-hyperliquid/core-contributors'),
      source('hl-genesis', 'HYPE genesis', 'Hyper Foundation', 'https://hyperfnd.medium.com/hype-genesis-1830a4dc2e3f'),
      source('hl-risks', 'Hyperliquid risk disclosures', 'Hyperliquid', 'https://hyperliquid.gitbook.io/hyperliquid-docs/risks'),
      source('hl-fees', 'Hyperliquid L1 fee metrics', 'DefiLlama', 'https://api.llama.fi/overview/fees/Hyperliquid%20L1?dataType=dailyFees', 'independent-data'),
      source('hl-stables', 'Stablecoin supply by chain', 'DefiLlama', 'https://stablecoins.llama.fi/stablecoinchains', 'independent-data'),
    ],
    forensic_analysis: analysis({
      label: 'thriving',
      outcome: 'Hyperliquid L1 is thriving as a vertically integrated trading chain, with high observed fees and stablecoin balances centered on one exchange stack. This is a strong product outcome but not proof of a diversified neutral L1. Chain and application activity are causally coupled, so adding their metrics would double-count the same economic engine.',
      outcomeSources: ['hl-docs', 'hl-fees', 'hl-stables', 'hl-risks'],
      why: 'Observed: Hyperliquid built a purpose-specific onchain order book and perpetuals venue before generalizing the L1 through staking, spot assets and HyperEVM. It reports no venture financing, distributed HYPE heavily to users, and discloses consensus, oracle, bridge and liquidation risks. Strategic inference: vertical integration let one team optimize execution, liquidity, custody, liquidation and validator economics as a single product, creating a trader flywheel that neutral general-purpose chains struggled to match. Community distribution strengthened user alignment and reduced the usual investor-unlock narrative. The same concentration creates correlated failure: exchange liquidity, validator/oracle behavior, bridge custody, token confidence and chain reputation can all break together. Hyperliquid succeeded because it solved a demanding application first; diversification beyond that application is promising but not yet proven.',
      whySources: ['hl-docs', 'hl-team', 'hl-genesis', 'hl-risks', 'hl-fees', 'hl-stables'],
      choices: [
        ['Build a sovereign high-performance L1 around the exchange rather than deploy on a general chain.', 'Execution and liquidity could be optimized end to end, while the protocol assumed consensus, bridge and validator responsibilities.', ['hl-docs', 'hl-risks'], 'high'],
        ['Use an onchain central-limit-order-book and validator-maintained oracle inputs.', 'Traders receive familiar execution and transparent settlement, while oracle manipulation and liquidation coupling become protocol-critical.', ['hl-docs', 'hl-risks'], 'high'],
        ['Distribute HYPE primarily to users and avoid a reported venture allocation.', 'Community ownership and token loyalty became a distribution advantage, though beneficial concentration and future governance still require measurement.', ['hl-genesis', 'hl-team'], 'high'],
        ['Add HyperEVM after proving the core trading product.', 'External applications gain access to the chain’s users and liquidity, while the ecosystem can diversify only if those apps develop independent demand.', ['hl-docs'], 'high'],
      ],
      counterfactual: 'Deploying on an established L1 or L2 would have reduced consensus and bridge responsibilities, but likely sacrificed the execution control and latency central to the product. Launching a general-purpose chain before the exchange could have created an undifferentiated cold start. A more independent validator and oracle structure would reduce correlated risk while potentially slowing coordinated product changes.',
      counterfactualSources: ['hl-docs', 'hl-risks', 'hl-genesis'],
      watch: [
        ['Fees, stablecoins, retained traders and liquidity through volatile and quiet market regimes.', 'Durability requires activity beyond one favorable trading cycle.', ['hl-fees', 'hl-stables']],
        ['HyperEVM applications, fees and users not attributable to HyperCore trading.', 'Independent demand would turn a successful appchain into a more diversified L1.', ['hl-docs']],
        ['Validator, oracle and bridge concentration plus downtime or manipulation incidents.', 'A correlated failure would directly challenge the vertically integrated trust premium.', ['hl-risks']],
      ],
      unknowns: [
        ['Who beneficially controls validators, delegations and oracle influence?', 'Independent operator and infrastructure mapping.'],
        ['How much revenue and user activity exists outside the core exchange?', 'Application-level attribution excluding HyperCore flows.'],
        ['What loss-absorption and governance process applies after a major oracle or bridge incident?', 'Published incident procedures and funded backstop terms.'],
        ['How durable is liquidity when trading volatility and token incentives fall?', 'Multi-regime cohorts of deposits, makers and fees.'],
      ],
    }),
  },
  {
    chain: 'Mantle',
    sources: [
      source('mnt-launch', 'Mantle mainnet launch recap', 'Mantle', 'https://www.mantle.xyz/blog/community/mainnet-launch-event-roundups-more'),
      source('mnt-l2beat', 'Mantle risk analysis', 'L2BEAT', 'https://l2beat.com/scaling/projects/mantle', 'independent-research'),
      source('mnt-tvl', 'Mantle historical TVL', 'DefiLlama', 'https://api.llama.fi/v2/historicalChainTvl/Mantle', 'independent-data'),
      source('mnt-fees', 'Mantle fee metrics', 'DefiLlama', 'https://api.llama.fi/overview/fees/Mantle?dataType=dailyFees', 'independent-data'),
      source('mnt-cg', 'MNT market data', 'CoinGecko', 'https://api.coingecko.com/api/v3/coins/mantle', 'independent-data'),
    ],
    forensic_analysis: analysis({
      label: 'declining',
      outcome: 'Mantle is a live but declining Ethereum L2 in the reviewed snapshot: TVL is roughly 91% below an April 2026 peak and MNT is materially below its high, while the network still produces fees and maintains a product surface. A governance-linked capital base and launch programs created liquidity, but current retention is not yet a durable moat.',
      outcomeSources: ['mnt-tvl', 'mnt-fees', 'mnt-cg', 'mnt-l2beat'],
      why: 'Observed: Mantle launched an EVM rollup with a governance-linked ecosystem fund and liquidity-centered narrative, reached a recent TVL peak, then lost roughly nine-tenths of that capital within months. L2BEAT records Stage 0 trust assumptions involving sequencing, upgrades, validation and data availability. Strategic inference: treasury scale, MNT incentives and EVM familiarity accelerated capital formation, but the chain entered a crowded L2 market where Base owns consumer distribution and Arbitrum owns deeper established DeFi. Incentive-responsive liquidity can create impressive peaks without retained users or fee-paying applications. Mantle is not dead because the chain remains operational and earns fees; it is declining because capital exited faster than a differentiated application or distribution loop replaced it. The unresolved question is whether the broader Mantle asset ecosystem creates recurring network use or merely rotates treasury-supported liquidity.',
      whySources: ['mnt-launch', 'mnt-l2beat', 'mnt-tvl', 'mnt-fees', 'mnt-cg'],
      choices: [
        ['Launch with a large governance-approved ecosystem capital pool.', 'Developers and liquidity gained immediate funding, while allocation concentration and subsidy dependence became central lifecycle risks.', ['mnt-launch'], 'high'],
        ['Position Mantle as a liquidity-focused EVM rollup.', 'Ethereum compatibility lowered migration friction, but product differentiation remained weak against other EVM L2s.', ['mnt-launch', 'mnt-l2beat'], 'medium'],
        ['Use MNT as both network gas and ecosystem incentive asset.', 'Usage and treasury programs can support token demand, while declining price and rewards can jointly accelerate capital exit.', ['mnt-cg', 'mnt-launch'], 'medium'],
        ['Operate under Stage 0 rollup trust assumptions while scaling the ecosystem.', 'The team can upgrade and coordinate quickly, but users depend materially on current sequencer, validation and governance controls.', ['mnt-l2beat'], 'high'],
      ],
      counterfactual: 'A smaller capped incentive program tied to retained fees and users could have tested organic demand before large liquidity accumulated. A distinctive first-party application or distribution partner might have created a use loop that generic EVM compatibility did not. Moving faster toward stronger rollup trust guarantees could reduce risk, but alone would not create demand.',
      counterfactualSources: ['mnt-launch', 'mnt-l2beat', 'mnt-tvl'],
      watch: [
        ['Thirty-, ninety- and 180-day TVL, fees, users and application retention after incentive changes.', 'Stabilization in paid cohorts supports recovery; continued outflows move the chain toward failure.', ['mnt-tvl', 'mnt-fees']],
        ['Stage 1 milestones, proof availability, upgrade delays and sequencer controls.', 'Reduced unilateral trust assumptions improve safety but must be verified in production.', ['mnt-l2beat']],
        ['Treasury deployment by program and resulting retained fees or users.', 'Capital allocation is successful only when measurable demand survives funding.', ['mnt-launch']],
      ],
      unknowns: [
        ['What caused the April-to-July TVL collapse by protocol and asset?', 'Protocol-level net-flow and incentive-event decomposition.'],
        ['How much current activity remains incentive-dependent?', 'Cohorts around reward starts, cuts and expirations.'],
        ['What is the current liquid and committed governance treasury?', 'Audited treasury inventory with encumbrances.'],
        ['Which applications generate repeat fees independent of Mantle-controlled programs?', 'Application revenue and user-retention attribution.'],
      ],
    }),
  },
  {
    chain: 'Monad',
    sources: [
      source('mon-docs', 'Monad documentation', 'Monad Foundation', 'https://docs.monad.xyz/'),
      source('mon-token', 'MON tokenomics overview', 'Monad Foundation', 'https://www.monad.xyz/blog/mon-tokenomics-overview'),
      source('mon-funding', 'Monad Labs raises $225M', 'Monad Labs', 'https://www.monad.xyz/blog/monad-labs-raises-225m-in-funding'),
      source('mon-tvl', 'Monad historical TVL', 'DefiLlama', 'https://api.llama.fi/v2/historicalChainTvl/Monad', 'independent-data'),
      source('mon-fees', 'Monad fee metrics', 'DefiLlama', 'https://api.llama.fi/overview/fees/Monad?dataType=dailyFees', 'independent-data'),
      source('mon-cg', 'MON market data', 'CoinGecko', 'https://api.coingecko.com/api/v3/coins/monad', 'independent-data'),
    ],
    forensic_analysis: analysis({
      label: 'middling',
      outcome: 'Monad is an emerging, presently middling L1 whose July snapshot shows substantial launch-era TVL and fees but less than one year of public-mainnet history. MON is materially below its initial high and a large locked allocation remains a future supply variable. Early capital and activity are observations, not yet evidence of durable product-market fit.',
      outcomeSources: ['mon-docs', 'mon-token', 'mon-tvl', 'mon-fees', 'mon-cg'],
      why: 'Observed: Monad launched a high-throughput EVM-compatible L1 after a disclosed $225M financing round, accumulated meaningful early TVL, and tied MON to gas and staking while investor, team and builder allocations follow lock schedules. Strategic inference: parallel execution and full EVM compatibility target a specific market gap—Solana-like performance without forcing Ethereum developers to change tools. Large financing and ecosystem programs accelerated builders and liquidity, but also make it difficult to distinguish organic demand from subsidized launch positioning. The first production client and early validator ecosystem create implementation concentration, while future token unlocks can pressure confidence even if chain usage grows. Monad is not classified as thriving because the observation window is too short; it is not failing because production activity and capital are real. Its outcome depends on retained paid applications after incentives and unlocks.',
      whySources: ['mon-docs', 'mon-token', 'mon-funding', 'mon-tvl', 'mon-fees', 'mon-cg'],
      choices: [
        ['Preserve full EVM compatibility while redesigning execution for parallelism.', 'Ethereum applications can migrate with low tooling friction, while the technical performance advantage must survive real state contention and production load.', ['mon-docs'], 'high'],
        ['Raise a large institutional financing round before mainnet.', 'The team gained runway and ecosystem-launch capacity, while investor concentration and expectations became part of the token and governance risk.', ['mon-funding'], 'high'],
        ['Launch MON with gas, staking and a large locked allocation schedule.', 'The asset coordinates security and incentives, but future unlocks can create supply pressure and misalign short-lived liquidity.', ['mon-token', 'mon-cg'], 'high'],
        ['Enter the market as a new general-purpose L1 rather than an Ethereum L2.', 'Monad controls execution and validator economics, while accepting the harder task of bootstrapping independent security, liquidity and distribution.', ['mon-docs', 'mon-tvl'], 'medium'],
      ],
      counterfactual: 'Launching as an L2 could have inherited Ethereum settlement and reduced validator cold-start risk, but weakened the sovereign high-performance thesis. Smaller incentives and financing might yield a cleaner organic-demand signal while slowing developer acquisition. Waiting longer before token launch could reduce unlock pressure, but also delay staking and ecosystem coordination.',
      counterfactualSources: ['mon-docs', 'mon-token', 'mon-funding'],
      watch: [
        ['TVL, fees, applications and user cohorts after launch programs expire.', 'Stable paid demand validates the architecture; synchronized outflows reveal incentive dependence.', ['mon-tvl', 'mon-fees']],
        ['MON unlock dates, circulating supply, staking participation and validator concentration.', 'Orderly absorption supports security; concentrated exits or delegation widen token and consensus risk.', ['mon-token', 'mon-cg']],
        ['Production throughput, latency, outages and client diversity under contended workloads.', 'Real performance rather than benchmark claims determines differentiation.', ['mon-docs']],
      ],
      unknowns: [
        ['How much current TVL is directly or indirectly incentive-driven?', 'Protocol cohorts around reward expiry and unlock events.'],
        ['What is beneficial validator, stake and infrastructure concentration?', 'Independent operator-resolution and stake telemetry.'],
        ['Which applications retain fee-paying users after launch campaigns?', 'Ninety- and 180-day application cohorts.'],
        ['How does parallel execution perform under real shared-state contention?', 'Reproducible production traces and incident reports.'],
      ],
    }),
  },
  {
    chain: 'OP Mainnet',
    sources: [
      source('op-mainnet', 'What is OP Mainnet?', 'Optimism', 'https://optimism.io/blog/what-is-op-mainnet'),
      source('op-stack', 'OP Stack introduction', 'Optimism', 'https://docs.optimism.io/op-stack/introduction/op-stack'),
      source('op-chapter', 'Optimism: A New Chapter', 'Optimism', 'https://optimism.io/blog/a-new-chapter'),
      source('op-tvl', 'Optimism historical TVL', 'DefiLlama', 'https://api.llama.fi/v2/historicalChainTvl/Optimism', 'independent-data'),
      source('op-fees', 'Optimism fee metrics', 'DefiLlama', 'https://api.llama.fi/overview/fees/Optimism?dataType=dailyFees', 'independent-data'),
      source('op-cg', 'OP market data', 'CoinGecko', 'https://api.coingecko.com/api/v3/coins/optimism', 'independent-data'),
    ],
    forensic_analysis: analysis({
      label: 'successful',
      outcome: 'OP Mainnet is a successful Ethereum L2 and the reference deployment for a widely adopted rollup stack, but it no longer owns all economic activity created by that stack. The reviewed snapshot shows meaningful fees and TVL alongside large drawdowns in network liquidity and OP price. ETH pays gas, so network usage and OP token value capture require separate conclusions.',
      outcomeSources: ['op-mainnet', 'op-stack', 'op-tvl', 'op-fees', 'op-cg'],
      why: 'Observed: OP Mainnet reduced Ethereum execution costs, the OP Stack became infrastructure for multiple chains including stronger-distribution competitors, and the Collective uses OP for governance while ETH remains the gas asset. Strategic inference: Optimism chose platform distribution over protecting one chain’s exclusive market share. Open, reusable software and Superchain coordination multiplied adoption and public-goods influence, but also enabled activity to migrate to other OP chains, especially those with superior consumer funnels. The product strategy succeeded at the stack level; OP Mainnet’s own TVL and token performance show that stack success does not automatically create local liquidity or token demand. This is a deliberate value-capture trade-off, not simply competitive failure. The next causal test is whether shared sequencing, interoperability and revenue mechanisms return measurable economics to the Collective and OP.',
      whySources: ['op-mainnet', 'op-stack', 'op-chapter', 'op-tvl', 'op-fees', 'op-cg'],
      choices: [
        ['Use an optimistic rollup with Ethereum data and settlement.', 'Applications gained lower-cost EVM execution, while users retained proof, sequencer and upgrade assumptions beyond Ethereum L1.', ['op-mainnet', 'op-stack'], 'high'],
        ['Open the OP Stack for other chains rather than keep the technology proprietary.', 'Ecosystem distribution expanded dramatically, while OP Mainnet invited competition from deployments using the same stack.', ['op-stack', 'op-chapter'], 'high'],
        ['Use ETH for gas and OP for governance.', 'Ethereum alignment and user onboarding improved, but routine transaction demand does not mechanically create OP buy pressure.', ['op-mainnet', 'op-cg'], 'high'],
        ['Pursue a Superchain of coordinated chains and shared standards.', 'Network effects may emerge through interoperability and shared economics, while execution and liquidity fragment before those mechanisms mature.', ['op-stack', 'op-chapter'], 'medium'],
      ],
      counterfactual: 'Keeping the stack proprietary might have protected OP Mainnet share and short-term fees, but would likely have reduced distribution and Superchain relevance. Making OP the gas asset could strengthen direct demand while increasing onboarding friction and weakening ETH alignment. A narrower application strategy might create stickier local use but sacrifice infrastructure leadership.',
      counterfactualSources: ['op-stack', 'op-chapter', 'op-mainnet'],
      watch: [
        ['OP Mainnet TVL, fees, users and net flows relative to Base and other OP Stack chains.', 'Local retention distinguishes a successful chain from a successful shared stack.', ['op-tvl', 'op-fees']],
        ['Interoperability, shared sequencing and revenue contributions across the Superchain.', 'Production economic flows must validate the collective value-capture thesis.', ['op-stack', 'op-chapter']],
        ['Governance participation and OP-linked economic rights beyond grants.', 'Durable token relevance requires measurable control or cash-flow utility, not stack branding alone.', ['op-chapter', 'op-cg']],
      ],
      unknowns: [
        ['How much OP Stack value returns to the Collective and OP holders?', 'Audited chain-by-chain revenue and governance-right attribution.'],
        ['Can Superchain interoperability reduce fragmentation in production?', 'Measured cross-chain UX, latency, failure and liquidity data.'],
        ['What share of OP Mainnet users are retained independent of incentives?', 'Application and wallet cohorts around grant changes.'],
        ['When will sequencing and upgrade authority become materially decentralized?', 'Verified contract and operator milestones.'],
      ],
    }),
  },
  {
    chain: 'Robinhood Chain',
    sources: [
      source('rh-launch', 'Robinhood Chain mainnet announcement', 'Robinhood', 'https://robinhood.com/us/en/newsroom/robinhood-accelerates-global-expansion-robinhood-chain-mainnet-stock-tokens-agentic-trading/'),
      source('rh-support', 'Robinhood Chain mainnet support', 'Robinhood', 'https://robinhood.com/us/en/support/articles/robinhood-chain-mainnet/'),
      source('rh-l2beat', 'Robinhood Chain risk analysis', 'L2BEAT', 'https://l2beat.com/scaling/projects/robinhood', 'independent-research'),
      source('rh-tvl', 'Robinhood Chain historical TVL', 'DefiLlama', 'https://api.llama.fi/v2/historicalChainTvl/Robinhood%20Chain', 'independent-data'),
      source('rh-fees', 'Robinhood Chain fee metrics', 'DefiLlama', 'https://api.llama.fi/overview/fees/Robinhood%20Chain?dataType=dailyFees', 'independent-data'),
    ],
    forensic_analysis: analysis({
      label: 'unclassified',
      outcome: 'Robinhood Chain is too new for a defensible success or failure classification. Its first-month snapshot shows unusually high spot volume and fees, and Robinhood supplies immediate users and tokenized-asset inventory, but the observation window cannot distinguish durable demand from launch concentration. It has no separately launched chain token in the reviewed dossier.',
      outcomeSources: ['rh-launch', 'rh-support', 'rh-l2beat', 'rh-tvl', 'rh-fees'],
      why: 'Observed: Robinhood launched an Arbitrum-based chain around stock tokens, always-on markets and first-party brokerage distribution, and the chain entered the activity board with substantial launch-period volume and fees. Strategic inference: this is a distribution-first experiment rather than a conventional developer-first L1 cold start. Robinhood can place assets, identity, regulated customer relationships and user interfaces onto one execution environment immediately, compressing years of liquidity acquisition. The same vertical integration concentrates product, issuer, upgrade, access and regulatory risk in one corporate ecosystem. Early activity may reflect real demand for tokenized equities, internal routing, incentives or temporary launch novelty; current evidence cannot separate them. The causal thesis is strong—corporate distribution plus unique inventory creates adoption—but the lifecycle verdict remains unclassified until retained external users and independent builders appear.',
      whySources: ['rh-launch', 'rh-support', 'rh-l2beat', 'rh-tvl', 'rh-fees'],
      choices: [
        ['Build on Arbitrum technology rather than create a new VM and validator ecosystem.', 'Robinhood gained EVM tooling and rollup infrastructure quickly, while inheriting stack, sequencing and upgrade dependencies.', ['rh-launch', 'rh-l2beat'], 'high'],
        ['Anchor launch distribution in stock tokens and brokerage users.', 'Unique inventory and a large user funnel create immediate demand, while regulatory and issuer controls shape asset access and transferability.', ['rh-launch', 'rh-support'], 'high'],
        ['Launch without a separate native chain token.', 'Users avoid a speculative gas-token cold start and activity is a cleaner product signal, while there is no token mechanism for independent governance or validator distribution.', ['rh-launch', 'rh-support'], 'medium'],
        ['Vertically integrate chain, product interfaces, agentic trading and tokenized assets.', 'The company can deliver a coherent experience rapidly, while outsiders depend on Robinhood’s continued strategy, permissions and operations.', ['rh-launch', 'rh-l2beat'], 'high'],
      ],
      counterfactual: 'A neutral consortium or independently governed rollup could reduce corporate-control risk but would likely launch more slowly and lack Robinhood’s integrated customer funnel. A native token might accelerate incentives and external governance while introducing speculation and regulatory complexity. Delaying launch for greater decentralization could improve trust but forfeit the timing advantage in tokenized equities.',
      counterfactualSources: ['rh-launch', 'rh-support', 'rh-l2beat'],
      watch: [
        ['Ninety- and 180-day volume, fees, users and liquidity after launch programs normalize.', 'Retention converts a launch event into product-market fit; rapid decay supports a temporary-distribution explanation.', ['rh-tvl', 'rh-fees']],
        ['Share of activity from independent applications and non-Robinhood interfaces.', 'External demand would reduce corporate concentration and validate the chain as an ecosystem.', ['rh-launch', 'rh-l2beat']],
        ['Asset redemption, transfer restrictions, sequencer incidents and upgrade-control changes.', 'Operational and regulatory controls determine whether tokenized assets behave as open onchain instruments.', ['rh-support', 'rh-l2beat']],
      ],
      unknowns: [
        ['How much launch activity came from incentives, internal routing or genuine external users?', 'Entity-adjusted cohorts after launch campaigns.'],
        ['What legal and redemption rights attach to each stock token?', 'Instrument-level disclosures and tested redemption outcomes.'],
        ['What is the dated decentralization path for sequencing, proofs and upgrades?', 'Verified operator and contract milestones.'],
        ['Will independent builders and liquidity providers remain without Robinhood subsidies?', 'Six-month application, capital and fee retention.'],
      ],
      confidence: 'medium',
      nextReview: '2026-08-02',
    }),
  },
];

const corrections = [
  {
    id: 'xdc-identity-nested-source-coverage',
    chain: 'XDC',
    dimension: 'identity',
    correction_type: 'citation_completion',
    reason: 'The identity lifecycle cites financing and TVL observations whose URLs were absent from the dimension-level source list.',
    sources: [
      {
        id: 'xdc-funding',
        title: 'XDC $50M LDA Capital investment',
        publisher: 'XDC Network',
        url: 'https://xdc.org/articles/xdc-accelerates-network-expansion-with-ldas-50-m',
        source_role: 'primary',
        checked_at: checkedAt,
      },
      {
        id: 'xdc-tvl',
        title: 'DefiLlama XDC historical TVL API',
        publisher: 'DefiLlama',
        url: 'https://api.llama.fi/v2/historicalChainTvl/XDC',
        source_role: 'independent-data',
        checked_at: checkedAt,
      },
    ],
  },
  {
    id: 'osmosis-token-overhang-denominator',
    chain: 'Osmosis',
    dimension: 'token',
    correction_type: 'metric_correction',
    reason: 'The prior 2.44% value measured max supply minus reported total supply, not the non-circulating gap between max and circulating supply.',
    sources: [
      {
        id: 'osmosis-token',
        title: 'CoinGecko Osmosis market data API',
        publisher: 'CoinGecko',
        url: 'https://api.coingecko.com/api/v3/coins/osmosis',
        source_role: 'independent-data',
        checked_at: checkedAt,
      },
    ],
    patch: {
      circulating_supply: 782724061.654104,
      total_supply: 975626844.081024,
      max_supply: 1000000000,
      unlock_overhang_pct: 21.73,
      unlock_overhang_denominator: 'max_supply',
      unlock_overhang_formula: '(max_supply - circulating_supply) / max_supply',
      supply_gap_to_max: 217275938.345896,
      reported_total_noncirculating_supply: 192902782.42692006,
      reported_total_noncirculating_pct_of_total: 19.77,
      unissued_to_max_supply_pct: 2.44,
      overhang_methodology_note: 'The 21.73% field is the gap from circulating supply to max supply. The 19.77% companion figure is reported total supply minus circulating supply divided by reported total supply. The 2.44% figure is only max supply minus reported total supply divided by max supply. These arithmetic gaps do not prove a contractual unlock schedule.',
    },
  },
];

const document = {
  schema: 'chaindump-chain-causal-completion-v1',
  research_as_of: checkedAt,
  methodology: {
    scope: 'Shared causal forensic normalization for the exact 15 top-chain dossiers that lacked explicit why and strategic-choice contracts.',
    observation_rule: 'Dated metrics are observations. Causal attribution and counterfactuals are labeled analytical inferences and carry confidence.',
    preservation_rule: 'Migration 0062 adds forensic_analysis to synthesis and review metadata to _meta; it does not replace any existing dossier dimension.',
    source_rule: 'Every causal field resolves to an exact checked source. Primary or operator sources establish designs and decisions; independent data and risk research test outcomes.',
    correction_rule: 'Applied historical migrations remain immutable. Citation and arithmetic corrections are isolated, source-scoped, denominator-labeled, and idempotent.',
  },
  cases,
  corrections,
};

for (const entry of document.cases) {
  const sourceById = Object.fromEntries(entry.sources.map((item) => [item.id, item]));
  if (Object.keys(sourceById).length !== entry.sources.length) {
    throw new Error(`${entry.chain}: duplicate source id`);
  }
  if (new Set(entry.sources.map(({ url }) => url)).size !== entry.sources.length) {
    throw new Error(`${entry.chain}: duplicate source URL`);
  }
  const validation = validateForensicAnalysis(entry.forensic_analysis, {
    resolver: sourceById,
  });
  if (validation.errors.length || validation.withheld_sections.length) {
    throw new Error(`${entry.chain}: ${JSON.stringify(validation)}`);
  }
}

const serializedDocument = `${JSON.stringify(document, null, 2)}\n`;
const canRewriteManifest = process.argv.includes('--write-manifest');
const existingDocument = existsSync(documentPath) ? readFileSync(documentPath, 'utf8') : null;
if (existingDocument !== serializedDocument && !canRewriteManifest) {
  throw new Error('checked manifest differs from the canonical renderer input');
}
if (existingDocument !== serializedDocument) writeFileSync(documentPath, serializedDocument);
const manifestHash = createHash('sha256').update(serializedDocument).digest('hex');
const maxD1StatementBytes = 95_000;

function assertStatementSize(label, statement) {
  const statementBytes = Buffer.byteLength(statement, 'utf8');
  if (statementBytes > maxD1StatementBytes) {
    throw new Error(
      `${label}: ${statementBytes}-byte statement exceeds ${maxD1StatementBytes}`,
    );
  }
  return statement;
}

function renderCaseStatement(entry) {
  const payload = JSON.stringify(entry).replaceAll("'", "''");
  const statement = `-- canonical-case-start ${entry.chain}
WITH causal_seed(payload) AS (
  VALUES ('${payload}')
)
UPDATE chain_facts AS facts
SET
  data = CASE facts.dimension
    WHEN 'synthesis' THEN json_set(
      facts.data,
      '$.forensic_analysis',
      json(json_extract((SELECT payload FROM causal_seed), '$.forensic_analysis'))
    )
    WHEN '_meta' THEN json_set(
      facts.data,
      '$.forensic_analysis_version', 'forensic-analysis-v1',
      '$.last_reviewed', '${checkedAt}',
      '$.next_review_at',
      json_extract(
        (SELECT payload FROM causal_seed),
        '$.forensic_analysis.review.next_review_at'
      )
    )
    ELSE facts.data
  END,
  sources = CASE
    WHEN facts.dimension = 'synthesis' THEN (
      SELECT json_group_array(json(source_json))
      FROM (
        SELECT source_json
        FROM (
          SELECT
            CASE
              WHEN new_source.value IS NULL THEN old_source.value
              ELSE json_set(
                json_patch(old_source.value, new_source.value),
                '$.checked_at',
                CASE
                  WHEN json_extract(old_source.value, '$.checked_at')
                    > json_extract(new_source.value, '$.checked_at')
                    THEN json_extract(old_source.value, '$.checked_at')
                  ELSE COALESCE(
                    json_extract(new_source.value, '$.checked_at'),
                    json_extract(old_source.value, '$.checked_at')
                  )
                END
              )
            END AS source_json,
            old_source.key AS position
          FROM json_each(COALESCE(facts.sources, '[]')) AS old_source
          LEFT JOIN json_each(
            json_extract((SELECT payload FROM causal_seed), '$.sources')
          ) AS new_source
            ON json_extract(new_source.value, '$.url')
              = json_extract(old_source.value, '$.url')
          WHERE json_extract(old_source.value, '$.url') IS NULL
            OR old_source.key = (
              SELECT MIN(candidate.key)
              FROM json_each(COALESCE(facts.sources, '[]')) AS candidate
              WHERE json_extract(candidate.value, '$.url')
                = json_extract(old_source.value, '$.url')
            )
          UNION ALL
          SELECT new_source.value AS source_json, 10000 + new_source.key AS position
          FROM json_each(
            json_extract((SELECT payload FROM causal_seed), '$.sources')
          ) AS new_source
          WHERE NOT EXISTS (
            SELECT 1
            FROM json_each(COALESCE(facts.sources, '[]')) AS existing
            WHERE json_extract(existing.value, '$.url')
              = json_extract(new_source.value, '$.url')
          )
        )
        ORDER BY position
      )
    )
    ELSE facts.sources
  END,
  updated_at = '${checkedAt}'
WHERE facts.chain = json_extract((SELECT payload FROM causal_seed), '$.chain')
  AND facts.dimension IN ('synthesis', '_meta');
-- canonical-case-end ${entry.chain}
`;
  return assertStatementSize(entry.chain, statement);
}

function renderCorrectionStatement(correction) {
  const payload = JSON.stringify(correction).replaceAll("'", "''");
  const statement = `-- canonical-correction-start ${correction.id}
WITH correction_seed(payload) AS (
  VALUES ('${payload}')
)
UPDATE chain_facts AS facts
SET
  data = CASE
    WHEN json_type((SELECT payload FROM correction_seed), '$.patch') = 'object'
      THEN json_patch(
        facts.data,
        json_extract((SELECT payload FROM correction_seed), '$.patch')
      )
    ELSE facts.data
  END,
  sources = (
    SELECT json_group_array(json(source_json))
    FROM (
      SELECT
        CASE
          WHEN new_source.value IS NULL THEN old_source.value
          ELSE json_set(
            json_patch(old_source.value, new_source.value),
            '$.checked_at',
            CASE
              WHEN json_extract(old_source.value, '$.checked_at')
                > json_extract(new_source.value, '$.checked_at')
                THEN json_extract(old_source.value, '$.checked_at')
              ELSE COALESCE(
                json_extract(new_source.value, '$.checked_at'),
                json_extract(old_source.value, '$.checked_at')
              )
            END
          )
        END AS source_json,
        old_source.key AS position
      FROM json_each(COALESCE(facts.sources, '[]')) AS old_source
      LEFT JOIN json_each(
        json_extract((SELECT payload FROM correction_seed), '$.sources')
      ) AS new_source
        ON json_extract(new_source.value, '$.url')
          = json_extract(old_source.value, '$.url')
      WHERE json_extract(old_source.value, '$.url') IS NULL
        OR old_source.key = (
          SELECT MIN(candidate.key)
          FROM json_each(COALESCE(facts.sources, '[]')) AS candidate
          WHERE json_extract(candidate.value, '$.url')
            = json_extract(old_source.value, '$.url')
        )
      UNION ALL
      SELECT new_source.value AS source_json, 10000 + new_source.key AS position
      FROM json_each(
        json_extract((SELECT payload FROM correction_seed), '$.sources')
      ) AS new_source
      WHERE NOT EXISTS (
        SELECT 1
        FROM json_each(COALESCE(facts.sources, '[]')) AS existing
        WHERE json_extract(existing.value, '$.url')
          = json_extract(new_source.value, '$.url')
      )
      ORDER BY position
    )
  ),
  updated_at = '${checkedAt}'
WHERE facts.chain = json_extract((SELECT payload FROM correction_seed), '$.chain')
  AND facts.dimension = json_extract(
    (SELECT payload FROM correction_seed),
    '$.dimension'
  );
-- canonical-correction-end ${correction.id}
`;
  return assertStatementSize(correction.id, statement);
}

const caseStatements = document.cases.map(renderCaseStatement);
const correctionStatements = document.corrections.map(renderCorrectionStatement);
const sql = `-- Generated by scripts/render-chain-causal-completion-migration.mjs.
-- Adds the shared causal contract without replacing any existing dossier dimension.
-- Re-run after editing the checked research corpus; every update is idempotent.
-- canonical-manifest-sha256 ${manifestHash}

${caseStatements.join('\n')}
${correctionStatements.join('\n')}`;

writeFileSync(migrationPath, sql);

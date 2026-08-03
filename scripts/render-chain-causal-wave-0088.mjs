#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYSIS_SECTION_KEYS, validateEntityProfile } from '../src/lib/entity-profile.js';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(root, 'docs/chain-causal-completion-wave-g-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0088_chain_causal_completion_wave_g.sql');
const AS_OF = '2026-08-03';
const OBSERVED_AT = '2026-08-03T19:40:32.300Z';
const ACCESSED_AT = '2026-08-03T19:45:03.000Z';
const NEXT_REVIEW_AT = '2026-08-10T19:45:03.000Z';
const MAX_D1_STATEMENT_BYTES = 95_000;

function source(slug, key, title, url, publisher, options = {}) {
  return {
    id: `source:${slug}:${key}`,
    title,
    url,
    publisher,
    published_at: options.publishedAt || null,
    accessed_at: ACCESSED_AT,
    archive_url: null,
    tier: options.tier || 'B',
    role: options.role || 'primary',
    access_state: 'reachable',
    checked_at: ACCESSED_AT,
    content_hash: null,
    evidence_locator: options.locator || 'The reviewed page and its dated or versioned content.',
  };
}

function claim(assertion, sourceIds, evidenceLocator, options = {}) {
  return {
    assertion,
    value: options.value ?? assertion,
    source_ids: sourceIds,
    evidence_locator: evidenceLocator,
    confidence: options.confidence || 'high',
    kind: options.kind || 'fact',
    support_direction: 'supports',
    note: options.note || null,
  };
}

const section = (body, claims) => ({ body, claims });
const rolling = (definition) => ({ start: null, end: AS_OF, definition });

function metric(key, dimension, label, value, sourceIds, method, qualityFlags = []) {
  return {
    key,
    dimension,
    label,
    value,
    unit: 'usd',
    currency: 'USD',
    window: rolling(key.includes('30d') ? 'provider-reported rolling 30 days' : 'latest point'),
    as_of: AS_OF,
    method,
    scope: { product: 'blockchain network', chains: [] },
    source_ids: sourceIds,
    evidence_locator: `Provider response replayed during ${OBSERVED_AT}–${ACCESSED_AT}; exact value retained in the artifact.`,
    quality_flags: qualityFlags,
  };
}

const event = (key, type, date, description, sourceIds, evidenceLocator) => (
  { key, type, date, description, source_ids: sourceIds, evidence_locator: evidenceLocator }
);

function buildProfile(spec) {
  const claims = [];
  const sections = {};
  for (const [key, value] of Object.entries(spec.sections)) {
    const claimIds = value.claims.map((entry, index) => {
      const id = `claim:${spec.slug}:section:${key}:${index + 1}`;
      claims.push({
        id,
        field_path: `analysis.sections.${key}.body`,
        assertion: entry.assertion,
        value: entry.value,
        as_of: AS_OF,
        confidence: entry.confidence,
        kind: entry.kind,
        source_ids: entry.source_ids,
        evidence_locator: entry.evidence_locator,
        support_direction: entry.support_direction,
        note: entry.note,
        review: { state: 'pending', reviewer: null, reviewed_at: null },
      });
      return id;
    });
    sections[key] = { body: value.body, as_of: AS_OF, claim_ids: claimIds };
  }

  const statusClaimId = `claim:${spec.slug}:status`;
  const outcomeClaimId = `claim:${spec.slug}:outcome`;
  claims.unshift(
    {
      id: statusClaimId,
      field_path: 'status.operating_state',
      assertion: `${spec.name} was operating at the review date.`,
      value: 'operating',
      as_of: AS_OF,
      confidence: 'high',
      kind: 'fact',
      source_ids: spec.statusSources,
      evidence_locator: spec.statusLocator,
      support_direction: 'supports',
      note: null,
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    },
    {
      id: outcomeClaimId,
      field_path: 'outcome.label',
      assertion: `${spec.name} is classified ${spec.outcome} as of ${AS_OF}.`,
      value: spec.outcome,
      as_of: AS_OF,
      confidence: spec.outcomeConfidence,
      kind: 'inference',
      source_ids: spec.outcomeSources,
      evidence_locator: spec.outcomeLocator,
      support_direction: 'supports',
      note: 'Analyst lifecycle classification; current metrics do not prove a single cause.',
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    },
  );

  const metrics = spec.metrics.map((entry) => {
    const id = `metric:${spec.slug}:${entry.key}:${AS_OF}`;
    const claimId = `claim:${spec.slug}:metric:${entry.key}`;
    claims.push({
      id: claimId,
      field_path: `metrics[${id}].value`,
      assertion: `${entry.label} was ${entry.value} ${entry.unit.toUpperCase()} for the stated window.`,
      value: entry.value,
      as_of: AS_OF,
      confidence: 'high',
      kind: 'fact',
      source_ids: entry.source_ids,
      evidence_locator: entry.evidence_locator,
      support_direction: 'supports',
      note: 'Point-in-time provider observation; providers can revise a same-day point.',
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    });
    return {
      id,
      dimension: entry.dimension,
      label: entry.label,
      value: entry.value,
      unit: entry.unit,
      currency: entry.currency,
      window: entry.window,
      as_of: entry.as_of,
      method: entry.method,
      scope: entry.scope,
      formula: null,
      raw_input_ids: [],
      claim_ids: [claimId],
      quality_flags: entry.quality_flags,
    };
  });

  const events = spec.events.map((entry) => {
    const id = `event:${spec.slug}:${entry.key}`;
    const claimId = `claim:${spec.slug}:event:${entry.key}`;
    claims.push({
      id: claimId,
      field_path: `events[${id}]`,
      assertion: entry.description,
      value: entry.date,
      as_of: entry.date,
      confidence: 'high',
      kind: 'fact',
      source_ids: entry.source_ids,
      evidence_locator: entry.evidence_locator,
      support_direction: 'supports',
      note: null,
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    });
    return { id, type: entry.type, date: entry.date, description: entry.description, claim_ids: [claimId] };
  });

  return {
    schema: 'chaindump-entity-profile',
    version: 1,
    identity: { id: `blockchain:${spec.slug}`, type: 'blockchain', slug: spec.slug, name: spec.name, aliases: spec.aliases || [] },
    classification: spec.classification,
    status: { operating_state: 'operating', as_of: AS_OF, claim_ids: [statusClaimId] },
    outcome: { label: spec.outcome, as_of: AS_OF, rule_id: 'blockchain-lifecycle-v1', confidence: spec.outcomeConfidence, claim_ids: [outcomeClaimId] },
    analysis: { sections },
    metrics,
    events,
    sources: spec.sources,
    claims,
    freshness: { state: 'current', last_reviewed_at: ACCESSED_AT, next_review_at: NEXT_REVIEW_AT, field_reviews: [] },
    quality: { publication_state: 'review', completeness_pct: 100, confidence: spec.qualityConfidence, unsourced_fields: [] },
    extensions: {
      legacy_origin: 'chain_analysis_and_chain_facts',
      observation_window: { started_at: OBSERVED_AT, completed_at: ACCESSED_AT },
      explicit_unknowns: spec.unknowns,
      methodology_notes: [
        'Every material field has atomic pending claims; a person must review those claims before publication.',
        'TVL, stablecoin supply, DEX volume, fees, revenue and token prices answer different questions and must not be treated as interchangeable.',
        'Documented decisions, observed outcomes, analyst inferences and unresolved unknowns are kept separate.',
      ],
    },
  };
}

function buildForensic(spec) {
  return {
    version: 'forensic-analysis-v1',
    observation_snapshot: spec.snapshot,
    outcome: { label: spec.forensicOutcome, summary: spec.forensicSummary, confidence: spec.outcomeConfidence, as_of: AS_OF, source_refs: spec.outcomeSources },
    why: { summary: spec.forensicWhy, confidence: 'medium', source_refs: spec.whySources },
    strategic_choices: spec.choices,
    counterfactual: { summary: spec.forensicCounterfactual, confidence: 'medium', source_refs: spec.counterfactualSources },
    watch: spec.watch,
    unknowns: spec.unknowns.map(([question, resolution_trigger]) => ({ question, resolution_trigger })),
    review: { status: 'current', last_reviewed_at: AS_OF, next_review_at: '2026-08-10', reviewer: 'chaindump-research-desk' },
  };
}

function marketSources(slug, chain, tokenSlug) {
  const encoded = encodeURIComponent(chain).replaceAll('%20', '%20');
  const items = [
    source(slug, 'tvl', `${chain} historical TVL API`, `https://api.llama.fi/v2/historicalChainTvl/${encoded}`, 'DefiLlama', { role: 'independent', locator: 'Latest and maximum points in the returned daily TVL series.' }),
    source(slug, 'volume', `${chain} DEX volume API`, `https://api.llama.fi/overview/dexs/${encoded}?dataType=dailyVolume`, 'DefiLlama', { role: 'independent', locator: 'total30d and change_1m fields.' }),
    source(slug, 'fees', `${chain} fees API`, `https://api.llama.fi/overview/fees/${encoded}?dataType=dailyFees`, 'DefiLlama', { role: 'independent', locator: 'total30d field.' }),
    source(slug, 'revenue', `${chain} revenue API`, `https://api.llama.fi/overview/fees/${encoded}?dataType=dailyRevenue`, 'DefiLlama', { role: 'independent', locator: 'total30d field.' }),
    source(slug, 'stables', 'Stablecoin supply by chain API', 'https://stablecoins.llama.fi/stablecoinchains', 'DefiLlama', { role: 'independent', locator: `${chain} row and peggedUSD field.` }),
  ];
  if (tokenSlug) {
    items.push(source(slug, 'market', `${chain} token market data`, `https://api.coingecko.com/api/v3/coins/${tokenSlug}`, 'CoinGecko', { role: 'aggregator', locator: 'current price, market cap, FDV and all-time-high fields.' }));
  }
  return items;
}

const adiSources = [
  source('adi', 'overview', 'ADI Foundation overview', 'https://www.adi.foundation/', 'ADI Foundation', { locator: 'Current institutional-network positioning and documented ecosystem relationships.' }),
  source('adi', 'mainnet', 'ADI Network contracts', 'https://docs.adi.foundation/how-to-start/network-contracts', 'ADI Foundation', { locator: 'Current mainnet core, bridge and governance contract addresses.' }),
  source('adi', 'components', 'ADI Network components', 'https://docs.adi.foundation/adi-network-components/overview', 'ADI Foundation', { locator: 'Current execution, proving and active-development statements.' }),
  source('adi', 'utility', 'ADI token utility', 'https://docs.adi.foundation/adi-token/adi-token-utility', 'ADI Foundation', { locator: 'Documented gas, staking and ecosystem utility claims.' }),
  source('adi', 'tokenomics', 'ADI tokenomics overview', 'https://docs.adi.foundation/adi-token/adi-tokenomics-overview', 'ADI Foundation', { locator: 'Genesis supply, allocations, cliffs and monthly unlock schedule.' }),
  source('adi', 'l2beat', 'ADI risk analysis', 'https://l2beat.com/scaling/projects/adi', 'L2BEAT', { tier: 'A', role: 'independent', locator: 'Current Stage 0, operator, multisig, upgrade, activity and liveness panels.' }),
  ...marketSources('adi', 'ADI', null),
];

const berachainSources = [
  source('berachain', 'overview', 'Berachain documentation', 'https://docs.berachain.com/', 'Berachain', { locator: 'Current chain and ecosystem overview.' }),
  source('berachain', 'pol', 'Proof of Liquidity overview', 'https://docs.berachain.com/general/proof-of-liquidity/overview', 'Berachain', { locator: 'Current BERA staking, WBERA emissions, reward vaults and deprecation of the former BGT design.' }),
  source('berachain', 'rewards', 'Proof of Liquidity block rewards', 'https://docs.berachain.com/general/proof-of-liquidity/block-rewards', 'Berachain', { locator: 'Current top-69 validator rule and per-block WBERA allocations.' }),
  source('berachain', 'bgt', 'BGT token documentation', 'https://docs.berachain.com/general/tokens/bgt', 'Berachain', { locator: 'Current deprecation and residual-claim treatment for BGT.' }),
  source('berachain', 'bex', 'What is BEX', 'https://docs.berachain.com/bex/learn/what-is-bex', 'Berachain', { locator: 'BEX application boundary and current disclosed Balancer V2 vulnerability warning.' }),
  ...marketSources('berachain', 'Berachain', 'berachain-bera'),
];

const katanaSources = [
  source('katana', 'overview', 'Katana documentation', 'https://docs.katana.network/', 'Katana', { locator: 'Current DeFi L2, core applications, Vault Bridge, sequencer-fee and Agglayer design.' }),
  source('katana', 'liquidity', 'Katana chain-owned liquidity', 'https://docs.katana.network/katana/core-concepts/chain-owned-liquidity/', 'Katana', { locator: 'Current chain-owned-liquidity funding and deployment design.' }),
  source('katana', 'risk', 'Katana risk overview', 'https://docs.katana.network/katana/core-concepts/risk/', 'Katana', { locator: 'Current smart-contract, bridge, vault and yield dependencies.' }),
  source('katana', 'token', 'KAT token overview', 'https://docs.katana.network/katana/how-to/kat-token-overview/', 'Katana', { locator: 'Current KAT transferability and vKAT voting and cooldown mechanics.' }),
  source('katana', 'tge', 'Katana TGE is here', 'https://katana.network/blog/the-wait-is-over-katana-tge-is-here', 'Katana', { publishedAt: '2026-03-18', locator: 'Dated KAT launch and vKAT Armory activation.' }),
  source('katana', 'l2beat', 'Katana risk analysis', 'https://l2beat.com/scaling/projects/katana', 'L2BEAT', { tier: 'A', role: 'independent', locator: 'Current Stage 0, operator, bridge, vault, upgrade and exit-risk panels.' }),
  ...marketSources('katana', 'Katana', 'katana-network-token'),
];

const rootstockSources = [
  source('rootstock', 'overview', 'Rootstock developer portal', 'https://dev.rootstock.io/', 'Rootstock', { locator: 'Current EVM sidechain, merge-mining, rBTC and PowPeg descriptions.' }),
  source('rootstock', 'federation', 'PowPeg federation trust discussion', 'https://research.rsk.dev/t/federation-trust/315', 'Rootstock Research', { locator: 'Operator research discussion of the federation label and inability to prove private keys were not copied.' }),
  source('rootstock', 'rskip383', 'RSKIP-383 PowPeg composition changes', 'https://ips.rootstock.io/IPs/RSKIP383.html', 'Rootstock', { locator: 'Adopted PowPeg composition-change process.' }),
  source('rootstock', 'rskip419', 'RSKIP-419 PowPeg spendability validation', 'https://ips.rootstock.io/IPs/RSKIP419.html', 'Rootstock', { locator: 'Adopted validation change for PowPeg spendability.' }),
  source('rootstock', 'union', 'Union: a trust-minimized bridge for Rootstock', 'https://arxiv.org/abs/2501.07435', 'Rootstock Research', { role: 'primary', locator: 'Research design for a future BitVMX-based bridge; not evidence of production deployment.' }),
  source('rootstock', 'spark', 'Rootstock EVM sidechain analysis', 'https://www.spark.money/research/rootstock-rsk-evm-bitcoin-analysis', 'Spark', { role: 'independent', locator: 'Independent current analysis of the PowPeg threshold and Union testnet/roadmap boundary.' }),
  ...marketSources('rootstock', 'Rootstock', null),
];

const sonicSources = [
  source('sonic', 'migration', 'Sonic migration overview', 'https://docs.soniclabs.com/migration/overview', 'Sonic Labs', { locator: 'Launch date, FTM-to-S conversion phases and Fantom Opera continuation.' }),
  source('sonic', 'token', 'S token documentation', 'https://docs.soniclabs.com/sonic/s-token', 'Sonic Labs', { locator: 'Current S supply, utility, airdrop, annual issuance, block rewards and Sonic USA issuance.' }),
  source('sonic', 'feem', 'Fee Monetization', 'https://docs.soniclabs.com/funding/fee-monetization', 'Sonic Labs', { locator: 'Current registered-app and validator fee split.' }),
  source('sonic', 'faq', 'Sonic FAQ', 'https://docs.soniclabs.com/sonic/faq', 'Sonic Labs', { locator: 'Current network, migration and token answers.' }),
  source('sonic', 'infra', 'Sonic post-migration infrastructure update', 'https://blog.soniclabs.com/sonic-labs-post-migration-infrastructure-update/', 'Sonic Labs', { publishedAt: '2026-02-02', locator: 'Dated infrastructure changes and stated balance/supply boundary.' }),
  source('sonic', '21shares', 'FTM to S migration FAQ', 'https://cdn.21shares.com/uploads/current-documents/products/misc/FTM%3AS_MigrationFAQ.pdf', '21Shares', { role: 'independent', locator: 'Independent description of 1:1 migration and post-genesis supply-growth boundary.' }),
  ...marketSources('sonic', 'Sonic', 'sonic-3'),
];

const adiSpec = {
  slug: 'adi', name: 'ADI', classification: { subtype: 'Ethereum ZK rollup', tags: ['zk_rollup', 'ethereum', 'institutional', 'adi_token'], chains: ['Ethereum'], jurisdictions: [] },
  outcome: 'middling', forensicOutcome: 'middling', outcomeConfidence: 'medium', qualityConfidence: 'medium', sources: adiSources,
  statusSources: ['source:adi:mainnet','source:adi:l2beat','source:adi:tvl'], statusLocator: 'Current mainnet configuration, risk panels and nonzero capital show an operating rollup.',
  outcomeSources: ['source:adi:tvl','source:adi:volume','source:adi:fees','source:adi:revenue','source:adi:l2beat'], outcomeLocator: 'Capital, aggregate activity, economics and current control assumptions were reviewed together.',
  sections: {
    what_it_is: section('ADI is an Ethereum ZK rollup aimed at governments, banks and regulated institutions. ADI is the gas token. The live network uses ZKsync OS execution and an Airbender prover, while several architecture and institutional-adoption goals are still being built. Partnerships and roadmap language show a distribution strategy; they do not prove that customers are running production workloads.', [claim('ADI is an Ethereum ZK rollup whose mainnet uses ADI for gas.', ['source:adi:overview','source:adi:utility','source:adi:components','source:adi:l2beat'], 'Current network configuration, utility and architecture panels.'),claim('Institutional relationships and roadmap claims are not treated as production usage.', ['source:adi:overview','source:adi:components'], 'Marketing and active-development language.', { kind: 'unknown' })]),
    what_happened: section('ADI launched in December 2025 and quickly accumulated a small but resilient capital base. TVL peaked at $3.99 million on July 23, 2026 and was $3.73 million at review, only 6.31% lower. Thirty-day DEX volume was $120.60 million but had fallen 63.58% from the prior provider comparison. DefiLlama reported $6.13 million of both fees and revenue for the period, a surprising equality that requires provider-method review.', [claim('TVL was $3,734,625, 6.31% below the reviewed peak.', ['source:adi:tvl'], 'Latest and maximum historical series points.'),claim('Thirty-day volume fell 63.58%, while reported fees and revenue were exactly equal.', ['source:adi:volume','source:adi:fees','source:adi:revenue'], 'Provider total30d and change_1m fields.', { value: 'volume 120596987; change -63.58%; fees 6133888; revenue 6133888' })]),
    why_this_outcome: section('ADI has retained most of its small TVL base, which is better than a launch spike followed by immediate collapse. However, the large volume and fee figures sit beside very low activity reported by L2BEAT and a sharp monthly volume decline. That mismatch means we cannot yet say institutional adoption or repeat users caused the result. The fairest call is middling: operating and funded, but not yet proven.', [claim('ADI retained most of its small peak TVL while monthly volume fell sharply.', ['source:adi:tvl','source:adi:volume'], 'Capital history and monthly activity comparison.', { confidence: 'medium', kind: 'inference' }),claim('Aggregate fees and volume do not establish institutional production demand.', ['source:adi:overview','source:adi:fees','source:adi:l2beat'], 'Marketing claims compared with independent activity.', { kind: 'unknown' })]),
    strategic_choices: section('ADI chose a compliance-first institutional pitch, Ethereum settlement, ZK execution and a separate token for gas and incentives. It also reserved large token allocations for community, treasury and partnerships, released through multi-year schedules. That can finance distribution and development, but it creates continuing unlock pressure. The network prioritized controlled institutional delivery before broad decentralization.', [claim('ADI chose Ethereum settlement, ZK execution and ADI as the gas token.', ['source:adi:mainnet','source:adi:components','source:adi:utility'], 'Current architecture and utility.'),claim('Community, treasury and partnership allocations unlock over multi-year schedules.', ['source:adi:tokenomics'], 'Allocation and vesting tables.')]),
    operating_model: section('ADI batches transactions through a centralized operator and proves them to Ethereum. L2BEAT classified it Stage 0 at review, with whitelisted proposing, no upgrade delay and multisig-controlled critical actions. L2BEAT also recorded multi-day proof or state-submission gaps in March and April 2026. These are current operating facts; the planned institutional stack and future decentralization are not live safeguards.', [claim('ADI remained Stage 0 with centralized proposing and no-delay upgrade risk.', ['source:adi:l2beat'], 'Current stage and control panels.'),claim('L2BEAT recorded multi-day submission gaps in March and April 2026.', ['source:adi:l2beat'], 'Current liveness incident history.')]),
    token_and_value_capture: section('ADI pays gas and is described as a future staking and ecosystem asset. Genesis supply was 999,999,999 tokens. Scheduled monthly unlocks began in the first year and several allocations run for six to nine years. We did not publish a market-cap or price claim because the reviewed market pages did not provide a sufficiently consistent circulating-supply picture. Token utility claims are not a substitute for verified fees, users or staking participation.', [claim('ADI genesis supply was 999,999,999 with monthly and multi-year unlock schedules.', ['source:adi:tokenomics'], 'Supply and allocation tables.'),claim('Current circulating supply and live staking participation were not independently reconciled.', ['source:adi:utility','source:adi:tokenomics'], 'Utility and schedule documents do not provide a reconciled current state.', { kind: 'unknown' })]),
    counterfactual: section('ADI could have used ETH for gas and avoided a new token, reducing unlock and liquidity complexity while giving up a native coordination tool. It could also have delayed the institutional launch until operator controls were broader, trading speed for stronger trust assurances. The practical test is whether the chosen token and controlled rollout produce recurring production workloads rather than partner announcements.', [claim('Using ETH for gas would reduce token complexity while surrendering ADI-native incentives.', ['source:adi:mainnet','source:adi:utility','source:adi:tokenomics'], 'Current gas and token design.', { confidence: 'medium', kind: 'counterfactual' }),claim('A later decentralized launch could reduce control risk while delaying distribution.', ['source:adi:l2beat','source:adi:overview'], 'Current controls and market strategy.', { confidence: 'medium', kind: 'counterfactual' })]),
    risks_and_unknowns: section('The main risks are centralized upgrades, proving gaps, token unlocks, thin TVL and dependence on a small number of institutional relationships. The exact meaning of provider-reported fees and revenue is unresolved, especially because both values are identical and large relative to TVL. We also lack repeat-user cohorts, independently verified production customers, current token circulation and a complete operator-control map.', [claim('Control, liveness, token-unlock and concentration risks remain material.', ['source:adi:l2beat','source:adi:tokenomics'], 'Current risk and vesting evidence.'),claim('Fee methodology, repeat users, production customers and current circulation remain unresolved.', ['source:adi:fees','source:adi:revenue','source:adi:overview','source:adi:tokenomics'], 'Reviewed sources omit reconciled answers.', { kind: 'unknown' })]),
    lifecycle: section('ADI is operating and middling. It retained 93.69% of peak TVL and reports substantial aggregate volume and fees, but monthly volume fell sharply and independent activity remains low. The chain is too new and the metrics are too inconsistent to call it a durable success. The next lifecycle step is proving that named institutions generate repeated transactions and fees without relying on unlocks or centralized intervention.', [claim('Retained capital and aggregate activity support continued operation.', ['source:adi:tvl','source:adi:volume','source:adi:fees'], 'Current capital and provider activity.'),claim('Short history, weak independent activity and control concentration support a middling call.', ['source:adi:l2beat','source:adi:tvl'], 'Operating history and current controls.', { confidence: 'medium', kind: 'inference' })]),
    outlook_and_watch: section('The base case is a small institution-focused rollup whose adoption remains unproven. The outlook improves if reconciled on-chain cohorts show repeat customer use, fee methodology checks out and control broadens. Watch proof submissions, transactions per second, partner deployments, unlocks, TVL, volume and the gap between gross fees and actual operator income. The call worsens if volume keeps falling or roadmap claims continue without public production evidence.', [claim('Repeat customer use, validated economics and broader control would strengthen the outlook.', ['source:adi:overview','source:adi:fees','source:adi:revenue','source:adi:l2beat'], 'Current demand and control baseline.', { confidence: 'medium', kind: 'inference' }),claim('Liveness, unlocks, capital, volume and fee reconciliation require dated monitoring.', ['source:adi:l2beat','source:adi:tokenomics','source:adi:tvl','source:adi:volume'], 'Current risk and activity baseline.', { confidence: 'medium', kind: 'inference' })]),
  },
  metrics: [metric('tvl-latest','tvl','TVL',3734625,['source:adi:tvl'],'Latest historicalChainTvl point.'),metric('dex-volume-30d','dex_spot_volume','DEX volume (30d)',120596987,['source:adi:volume'],'total30d.',['not_unique_users']),metric('fees-30d','fees','Fees (30d)',6133888,['source:adi:fees'],'total30d.',['methodology_requires_review']),metric('revenue-30d','protocol_revenue','Protocol revenue (30d)',6133888,['source:adi:revenue'],'total30d.',['gross_fees_not_profit','same_as_fees_requires_review'])],
  events: [event('mainnet','launch','2025-12-09','ADI mainnet launched.',['source:adi:l2beat','source:adi:mainnet'],'Current project history and live configuration.'),event('peak-tvl','market_event','2026-07-23','ADI reached the maximum TVL point in the reviewed series.',['source:adi:tvl'],'Historical series maximum.')],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama and L2BEAT', historical_tvl_point_date: AS_OF, latest_tvl_usd: 3734625, peak_tvl_usd: 3985950, peak_tvl_date: '2026-07-23', tvl_drawdown_pct: 6.31, dex_volume_30d_usd: 120596987, dex_volume_change_1m_pct: -63.58, fees_30d_usd: 6133888, revenue_30d_usd: 6133888, metric_boundary: 'Provider-reported fees and revenue are equal and are not assumed to be profit or institutional demand.' },
  forensicSummary: 'ADI is a new operating rollup with capital near its peak, but falling monthly volume, low independent activity and unreconciled fee figures keep the lifecycle call middling.', forensicWhy: 'The institutional pitch and partner funnel may support distribution, while centralized controls, scheduled unlocks and weak independently measured usage leave durable demand unproven.', whySources: ['source:adi:overview','source:adi:tvl','source:adi:volume','source:adi:fees','source:adi:l2beat'],
  choices: [{decision:'Target regulated institutions and governments.',consequence:'Distribution can be concentrated and high-value, but public customer evidence remains sparse.',confidence:'high',source_refs:['source:adi:overview']},{decision:'Use an Ethereum ZK rollup with controlled operation.',consequence:'Settlement inherits Ethereum while present operator and upgrade risks remain.',confidence:'high',source_refs:['source:adi:components','source:adi:l2beat']},{decision:'Use ADI for gas with long allocation schedules.',consequence:'The network gains a native economic tool while holders face unlock and liquidity risk.',confidence:'high',source_refs:['source:adi:utility','source:adi:tokenomics']}],
  forensicCounterfactual: 'ETH gas would reduce token complexity; a later decentralized launch would reduce control risk. Either choice would sacrifice part of ADI’s current incentive or distribution strategy.', counterfactualSources: ['source:adi:mainnet','source:adi:utility','source:adi:tokenomics','source:adi:l2beat'],
  watch: [{signal:'Repeat customer cohorts, transactions, TVL, volume and independently reconciled fees.',implication:'Persistence would distinguish real institutional demand from launch-period activity.',source_refs:['source:adi:tvl','source:adi:volume','source:adi:fees','source:adi:revenue']},{signal:'Submission gaps, upgrade controls, validator changes and token unlocks.',implication:'Improvement would reduce liveness, governance and dilution risk.',source_refs:['source:adi:l2beat','source:adi:tokenomics']}],
  unknowns: [['Which named institutions run recurring production workloads?','A two-quarter customer-level activity disclosure reconciled on-chain.'],['Why are provider-reported fees and revenue identical?','A provider methodology statement and operator income reconciliation.'],['What is current circulating ADI and staking participation?','An independently reconciled supply and staking statement.'],['Who beneficially controls proposer, verifier and upgrade multisigs?','A current independent control map.']],
};

const berachainSpec = {
  slug: 'berachain', name: 'Berachain', classification: { subtype: 'EVM L1', tags: ['evm', 'proof_of_liquidity', 'bera', 'incentives'], chains: ['Berachain'], jurisdictions: [] },
  outcome: 'declining', forensicOutcome: 'declining', outcomeConfidence: 'high', qualityConfidence: 'high', sources: berachainSources,
  statusSources: ['source:berachain:overview','source:berachain:pol','source:berachain:tvl'], statusLocator: 'Current network and incentive documentation plus nonzero capital show an operating chain.',
  outcomeSources: ['source:berachain:tvl','source:berachain:volume','source:berachain:fees','source:berachain:revenue','source:berachain:market','source:berachain:pol'], outcomeLocator: 'Capital, activity, economics, token market and current incentive design were reviewed together.',
  sections: {
    what_it_is: section('Berachain is an EVM-compatible Layer 1 built around Proof of Liquidity. Today validators stake BERA, and WBERA emissions are routed through reward vaults and dedicated streams. The old public story centered on nontransferable BGT for validator direction and governance; current documentation says that model is deprecated. BEX is one application on Berachain, not the chain itself.', [claim('Current Proof of Liquidity uses BERA staking and WBERA emissions.', ['source:berachain:pol','source:berachain:rewards'], 'Current mechanism and block rewards.'),claim('BGT is deprecated, and BEX is a separate native DEX application.', ['source:berachain:bgt','source:berachain:bex'], 'Current token and application documentation.')]),
    what_happened: section('Berachain mainnet and BERA launched in February 2025 after a heavily promoted pre-deposit and incentive cycle. TVL reached $3.31 billion in March 2025, then fell to $46.71 million, a 98.59% drawdown. Dollar stablecoins were $59.64 million. Thirty-day DEX volume was $29.89 million, down 78.03% from the prior provider comparison; fees were $111,057.03 and retained revenue was $43,754.57.', [claim('Berachain TVL fell from $3,307,489,893 to $46,705,476.', ['source:berachain:tvl'], 'Maximum and latest historical series points.'),claim('Thirty-day DEX volume was $29,887,102.54 and fell 78.03%.', ['source:berachain:volume'], 'Provider total30d and change_1m fields.', { value: 'volume 29887102.54; change -78.03%' })]),
    why_this_outcome: section('Berachain attracted enormous launch capital by paying users to supply liquidity and compete for future rewards. That proved incentives could move money, not that applications had lasting demand. When the launch cycle faded, most capital and trading left. The project then redesigned Proof of Liquidity and deprecated BGT, evidence that the first economic system did not work as intended. The chain remains active, but the retention result is poor.', [claim('Launch incentives coincided with a short-lived capital peak and 98.59% drawdown.', ['source:berachain:tvl','source:berachain:pol'], 'Capital history compared with incentive design.', { confidence: 'high', kind: 'inference' }),claim('The current PoL and BGT documents show a material economic redesign.', ['source:berachain:pol','source:berachain:bgt'], 'Current system compared with deprecated design.')]),
    strategic_choices: section('Berachain chose an application-aware incentive system instead of ordinary fee-only staking. It used BERA for gas and security, BGT for the original reward-direction model, and first-party applications such as BEX to seed activity. The team later replaced the BGT-centered design with BERA staking, WBERA emissions and an incentive auction. That preserves the liquidity thesis while admitting that the original mechanism needed substantial change.', [claim('Berachain chose protocol emissions and reward vaults to direct liquidity.', ['source:berachain:pol','source:berachain:rewards'], 'Current incentive routing.'),claim('The move from BGT to BERA/WBERA materially changed the original economic design.', ['source:berachain:pol','source:berachain:bgt'], 'Current deprecation and replacement mechanics.')]),
    operating_model: section('The top 69 validators by staked BERA produce blocks. Each block currently sends WBERA to the operator and to reward vaults, where applications can add incentives. This can coordinate security and liquidity, but it ties validator and application economics to ongoing emissions and auction demand. BEX’s disclosed Balancer V2 vulnerability is an application risk; it should not be described as a consensus failure or counted as separate chain volume.', [claim('The top 69 BERA-staked validators receive operator and reward-vault emissions.', ['source:berachain:rewards'], 'Current validator and block-reward rules.'),claim('BEX risk and volume are application-level, not separate chain-level observations.', ['source:berachain:bex','source:berachain:volume'], 'Application boundary and aggregate chain volume.')]),
    token_and_value_capture: section('BERA pays gas, secures validators and now anchors Proof of Liquidity. WBERA is the wrapped form used for emissions. BGT remains only as a deprecated residual claim path, not the current governance-and-reward engine. CoinGecko observed BERA at $0.157183, with a $47.47 million market capitalization and $87.15 million fully diluted value, 98.94% below its recorded high. Emissions can create activity while diluting holders if organic fees do not catch up.', [claim('BERA now secures validators, while BGT is deprecated.', ['source:berachain:pol','source:berachain:bgt'], 'Current token roles.'),claim('BERA market capitalization was $47,468,025 at observation.', ['source:berachain:market'], 'CoinGecko market_data.market_cap.usd.', { value: 47468025 })]),
    counterfactual: section('Berachain could have launched with conventional BERA staking and smaller application grants, reducing reflexive complexity but losing its distinctive liquidity pitch. It could also have kept BEX and other first-party apps separate from consensus incentives, making product performance easier to measure. The redesign moves closer to simpler staking, but continued emissions still need to earn durable users.', [claim('Conventional staking would reduce incentive complexity while weakening differentiation.', ['source:berachain:pol','source:berachain:rewards'], 'Current mechanism compared with a simpler model.', { confidence: 'medium', kind: 'counterfactual' }),claim('Separating first-party apps from chain incentives would clarify organic product demand.', ['source:berachain:bex','source:berachain:pol'], 'Application and incentive boundaries.', { confidence: 'medium', kind: 'counterfactual' })]),
    risks_and_unknowns: section('The main risks are incentive dependence, token dilution, validator concentration, application vulnerabilities and another economic redesign. BEX still discloses exposure to a known Balancer V2 issue while planning a future migration. We lack incentive-adjusted volume, repeat-user cohorts, validator beneficial ownership, complete treasury spending and proof that the new auction generates fees greater than its emissions.', [claim('Incentive, validator, token and BEX vulnerability risks remain material.', ['source:berachain:pol','source:berachain:rewards','source:berachain:bex','source:berachain:market'], 'Current mechanism, app warning and market data.'),claim('Incentive-adjusted activity, operator ownership and auction profitability remain unresolved.', ['source:berachain:pol','source:berachain:volume','source:berachain:revenue'], 'Current sources omit reconciled answers.', { kind: 'unknown' })]),
    lifecycle: section('Berachain is operating but declining. The chain shipped, BERA remains traded and the economic system was actively redesigned. Yet TVL is 98.59% below peak, monthly volume fell 78.03% and BERA is 98.94% below its high. The current phase is a retention and repair test: can the new BERA/WBERA system support applications without recreating the same incentive-dependent launch spike?', [claim('The chain and redesigned PoL are operating.', ['source:berachain:overview','source:berachain:pol','source:berachain:rewards'], 'Current product documentation.'),claim('Capital, volume and token drawdowns support a declining call.', ['source:berachain:tvl','source:berachain:volume','source:berachain:market'], 'Peak-to-current observations.', { kind: 'inference' })]),
    outlook_and_watch: section('The base case is a much smaller chain that survives by narrowing incentives and retaining a few core applications. The outlook improves if TVL stabilizes, auction-funded rewards exceed emissions, volume persists and several independent apps generate fees. Watch BEX’s Balancer migration, BERA stake concentration, WBERA issuance, incentive spend, stablecoins, repeat users and governance changes. The call worsens if each new reward program produces only another temporary liquidity spike.', [claim('Stable capital, sustainable rewards and diversified application fees would strengthen the outlook.', ['source:berachain:tvl','source:berachain:pol','source:berachain:fees','source:berachain:revenue'], 'Current baseline for review.', { confidence: 'medium', kind: 'inference' }),claim('BEX migration, validator concentration, emissions and repeat users require dated monitoring.', ['source:berachain:bex','source:berachain:rewards','source:berachain:volume'], 'Current app and incentive baseline.', { confidence: 'medium', kind: 'inference' })]),
  },
  metrics: [metric('tvl-latest','tvl','TVL',46705476,['source:berachain:tvl'],'Latest historicalChainTvl point.'),metric('stablecoins-latest','stablecoin_supply','Dollar stablecoin supply',59638476.05122793,['source:berachain:stables'],'peggedUSD field.'),metric('dex-volume-30d','dex_spot_volume','DEX volume (30d)',29887102.54,['source:berachain:volume'],'total30d.',['not_unique_users','incentive_adjustment_unknown']),metric('fees-30d','fees','Fees (30d)',111057.03,['source:berachain:fees'],'total30d.'),metric('revenue-30d','protocol_revenue','Protocol revenue (30d)',43754.57,['source:berachain:revenue'],'total30d.',['gross_fees_not_profit']),metric('token-price','token_price','BERA price',0.157183,['source:berachain:market'],'current_price.usd.'),metric('token-market-cap','token_market_cap','BERA market capitalization',47468025,['source:berachain:market'],'market_cap.usd.'),metric('token-fdv','token_fdv','BERA fully diluted value',87146628,['source:berachain:market'],'fully_diluted_valuation.usd.')],
  events: [event('mainnet','launch','2025-02-06','Berachain mainnet and BERA launched.',['source:berachain:overview','source:berachain:market'],'Current project history and token all-time-high date.'),event('peak-tvl','market_event','2025-03-27','Berachain reached the maximum TVL point in the reviewed series.',['source:berachain:tvl'],'Historical series maximum.')],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama and CoinGecko', historical_tvl_point_date: AS_OF, latest_tvl_usd: 46705476, peak_tvl_usd: 3307489893, peak_tvl_date: '2025-03-27', tvl_drawdown_pct: 98.59, stablecoin_supply: { pegged_usd: 59638476.05122793 }, dex_volume_30d_usd: 29887102.54, dex_volume_change_1m_pct: -78.03, fees_30d_usd: 111057.03, revenue_30d_usd: 43754.57, boundary: 'BEX is an application and current BERA/WBERA PoL replaces the deprecated BGT-centered model.' },
  forensicSummary: 'Berachain is active but declining after losing 98.59% of peak TVL, posting a 78.03% monthly volume decline and replacing its original BGT-centered incentive model.', forensicWhy: 'Large launch incentives attracted capital, but did not retain it. The current BERA/WBERA redesign can repair incentives only if applications generate demand beyond emissions.', whySources: ['source:berachain:tvl','source:berachain:volume','source:berachain:pol','source:berachain:bgt','source:berachain:market'],
  choices: [{decision:'Make liquidity incentives part of the chain economic system.',consequence:'Capital moved quickly, but activity became hard to separate from emissions.',confidence:'high',source_refs:['source:berachain:pol']},{decision:'Seed activity with first-party applications including BEX.',consequence:'The chain gained initial products while app and base-layer performance became easy to conflate.',confidence:'high',source_refs:['source:berachain:bex']},{decision:'Deprecate BGT and rebuild PoL around BERA and WBERA.',consequence:'The system became simpler, but the redesign confirms the first model did not persist unchanged.',confidence:'high',source_refs:['source:berachain:pol','source:berachain:bgt']}],
  forensicCounterfactual: 'Conventional staking and smaller grants would reduce reflexive complexity but weaken differentiation. Separating first-party app incentives would make organic demand easier to measure.', counterfactualSources: ['source:berachain:pol','source:berachain:rewards','source:berachain:bex'],
  watch: [{signal:'TVL, stablecoins, repeat users, fees and incentive-adjusted volume.',implication:'Persistent activity would show demand beyond launch emissions.',source_refs:['source:berachain:tvl','source:berachain:stables','source:berachain:volume','source:berachain:fees']},{signal:'BERA stake concentration, WBERA issuance, auction funding and BEX migration.',implication:'Sustainable funding and safe application migration would reduce current risks.',source_refs:['source:berachain:rewards','source:berachain:pol','source:berachain:bex']}],
  unknowns: [['How much current activity remains after incentives are removed?','A two-quarter incentive-adjusted cohort and volume analysis.'],['Who beneficially controls the top validators?','An independent stake and operator ownership map.'],['Does the incentive auction fund more rewards than new emissions?','A reconciled quarterly auction and emission statement.'],['When will BEX leave the disclosed Balancer V2 risk surface?','A deployed migration with independent security verification.']],
};

const katanaSpec = {
  slug: 'katana', name: 'Katana', classification: { subtype: 'Ethereum optimistic rollup', tags: ['defi_l2', 'op_stack', 'kat', 'chain_owned_liquidity'], chains: ['Ethereum'], jurisdictions: [] },
  outcome: 'declining', forensicOutcome: 'declining', outcomeConfidence: 'high', qualityConfidence: 'high', sources: katanaSources,
  statusSources: ['source:katana:overview','source:katana:l2beat','source:katana:tvl'], statusLocator: 'Current network, risk and capital observations show an operating rollup.',
  outcomeSources: ['source:katana:tvl','source:katana:volume','source:katana:fees','source:katana:revenue','source:katana:market','source:katana:l2beat'], outcomeLocator: 'Chain capital, aggregate activity, token market and current controls were reviewed separately from app and bridge economics.',
  sections: {
    what_it_is: section('Katana is an Ethereum Layer 2 designed around a small set of DeFi applications and chain-owned liquidity. It uses ETH for gas. KAT is a separate governance and incentive token; locking KAT creates nontransferable vKAT. Morpho, Sushi, the Vault Bridge and Katana Perps are products or financial layers on the chain, not the chain itself, so their balances and revenues must not be silently combined.', [claim('Katana is an Ethereum L2 that uses ETH for gas and concentrates DeFi liquidity.', ['source:katana:overview','source:katana:l2beat'], 'Current architecture and gas panels.'),claim('KAT/vKAT and the core applications are separate from chain execution.', ['source:katana:token','source:katana:overview'], 'Current token and product scope.')]),
    what_happened: section('Katana launched in July 2025, accumulated $711.05 million of TVL by March 2026 and launched KAT on March 18. TVL then fell to $64.98 million, a 90.86% drawdown. Dollar stablecoins were $18.20 million. Thirty-day DEX volume was $24.81 million, down 58.15% from the prior provider comparison; fees were $287,146.41 and provider-reported retained revenue was $14,255.52.', [claim('TVL fell from $711,046,604 to $64,978,331.', ['source:katana:tvl'], 'Maximum and latest historical series points.'),claim('KAT launched on March 18, 2026 with vKAT live.', ['source:katana:tge','source:katana:token'], 'Dated TGE and current token mechanics.')]),
    why_this_outcome: section('Katana’s launch concentrated liquidity and routed sequencer and bridge economics back into the ecosystem. That produced a large initial capital base, but most of it did not stay. The narrow app set can improve depth, yet it also concentrates product risk and makes incentives difficult to separate from demand. A live token and perps product did not reverse the capital or monthly volume decline by review.', [claim('Concentrated apps and recycled economics did not prevent a 90.86% TVL drawdown.', ['source:katana:overview','source:katana:liquidity','source:katana:tvl'], 'Product design compared with capital history.', { confidence: 'high', kind: 'inference' }),claim('Aggregate chain data cannot isolate organic demand from incentives or core apps.', ['source:katana:volume','source:katana:liquidity'], 'Current aggregate activity and funding design.', { kind: 'unknown' })]),
    strategic_choices: section('Katana chose a curated DeFi stack, chain-owned liquidity, a Vault Bridge that deploys selected assets into Ethereum strategies, and a token that does not pay gas. It routes net sequencer fees into liquidity rather than treating them only as operator income. KAT holders can lock into vKAT for voting with a 60-day withdrawal delay. These choices aim to deepen a few markets, while adding bridge, strategy, governance and concentration risk.', [claim('Katana chose curated apps, chain-owned liquidity and external Vault Bridge strategies.', ['source:katana:overview','source:katana:liquidity','source:katana:risk'], 'Current economic and risk design.'),claim('KAT is transferable and vKAT has voting utility and a 60-day cooldown.', ['source:katana:token'], 'Current token mechanics.')]),
    operating_model: section('Katana batches transactions through an operator-controlled OP Stack rollup and uses ZK proofs through OP Succinct and the Agglayer design. L2BEAT classified it Stage 0 with no user exit window before upgrades. Vault Bridge assets can be deployed away from Katana into external strategies, while users hold bridge representations on Katana. Those yield flows and app fees are distinct from base-chain sequencer revenue.', [claim('Katana remained Stage 0 with operator and upgrade risk.', ['source:katana:l2beat'], 'Current stage and risk panels.'),claim('Vault Bridge strategy assets and app economics are distinct from base-chain execution revenue.', ['source:katana:overview','source:katana:risk','source:katana:l2beat'], 'Bridge, yield and control boundaries.')]),
    token_and_value_capture: section('ETH pays gas. KAT provides governance and incentives, and vKAT is the nontransferable locked form. KAT does not govern every chain upgrade or the Vault Bridge, so token voting should not be described as complete system control. CoinGecko observed KAT at $0.00434103, with a $13.36 million market capitalization and $43.41 million fully diluted value, 85.27% below its recorded high.', [claim('KAT is not gas and does not govern all chain or Vault Bridge controls.', ['source:katana:token','source:katana:overview','source:katana:l2beat'], 'Current token, gas and control descriptions.'),claim('KAT market capitalization was $13,363,658 at observation.', ['source:katana:market'], 'CoinGecko market_data.market_cap.usd.', { value: 13363658 })]),
    counterfactual: section('Katana could have launched as a general-purpose L2 and let independent apps compete for liquidity, reducing curation risk while losing its focused market structure. It could have kept assets on Katana instead of deploying them through the Vault Bridge, simplifying custody but giving up external yield. An ETH-only model would avoid token dilution but remove vKAT governance and incentives.', [claim('A general-purpose app strategy would reduce curation while weakening concentrated liquidity.', ['source:katana:overview','source:katana:liquidity'], 'Current focus compared with an open model.', { confidence: 'medium', kind: 'counterfactual' }),claim('Keeping bridge assets idle would reduce strategy risk while giving up external yield.', ['source:katana:risk','source:katana:l2beat'], 'Current vault and bridge design.', { confidence: 'medium', kind: 'counterfactual' })]),
    risks_and_unknowns: section('The main risks are Stage 0 control, bridge and strategy losses, core-app concentration, token dilution and incentive dependence. Chain-owned liquidity may support markets while hiding weak third-party demand. We lack repeat-user cohorts, app-by-app fee attribution, a complete Vault Bridge asset and yield reconciliation, beneficial ownership of upgrade controls and a net income statement after incentives and strategy costs.', [claim('Operator, bridge, strategy, concentration and token risks remain material.', ['source:katana:l2beat','source:katana:risk','source:katana:market'], 'Current controls, financial dependencies and market data.'),claim('Repeat users, app fee attribution, vault reconciliation and net economics remain unresolved.', ['source:katana:overview','source:katana:fees','source:katana:revenue'], 'Current sources omit reconciled answers.', { kind: 'unknown' })]),
    lifecycle: section('Katana is operating but declining. It shipped the rollup, core DeFi apps, KAT/vKAT and new trading products. However, TVL is 90.86% below peak, monthly volume fell 58.15% and KAT is 85.27% below its high. The next test is whether the integrated financial stack retains capital and traders after launch incentives, rather than whether another product can create a short burst.', [claim('Katana has shipped its chain, core apps and KAT/vKAT system.', ['source:katana:overview','source:katana:tge','source:katana:token'], 'Current shipped products.'),claim('Capital, volume and token drawdowns support a declining call.', ['source:katana:tvl','source:katana:volume','source:katana:market'], 'Peak-to-current observations.', { kind: 'inference' })]),
    outlook_and_watch: section('The base case is a smaller curated DeFi chain whose economics depend on a few apps and bridge strategies. The call improves if TVL stabilizes, independent apps and users grow, fee retention rises and control matures. Watch Vault Bridge positions and losses, sequencer-fee recycling, app concentration, vKAT participation, KAT unlocks, repeat traders and the difference between bridge yield and user yield. The call worsens if capital keeps leaving despite recycled incentives.', [claim('Stable capital, diversified demand, better fee retention and broader controls would strengthen the outlook.', ['source:katana:tvl','source:katana:fees','source:katana:revenue','source:katana:l2beat'], 'Current baseline for future review.', { confidence: 'medium', kind: 'inference' }),claim('Vault positions, app concentration, token participation and repeat traders require dated monitoring.', ['source:katana:risk','source:katana:liquidity','source:katana:token','source:katana:volume'], 'Current risk and demand baseline.', { confidence: 'medium', kind: 'inference' })]),
  },
  metrics: [metric('tvl-latest','tvl','TVL',64978331,['source:katana:tvl'],'Latest historicalChainTvl point.'),metric('stablecoins-latest','stablecoin_supply','Dollar stablecoin supply',18200180.180766344,['source:katana:stables'],'peggedUSD field.'),metric('dex-volume-30d','dex_spot_volume','DEX volume (30d)',24808092,['source:katana:volume'],'total30d.',['not_unique_users','do_not_add_app_volumes']),metric('fees-30d','fees','Fees (30d)',287146.41,['source:katana:fees'],'total30d.'),metric('revenue-30d','protocol_revenue','Protocol revenue (30d)',14255.52,['source:katana:revenue'],'total30d.',['gross_fees_not_profit','app_and_bridge_income_excluded']),metric('token-price','token_price','KAT price',0.00434103,['source:katana:market'],'current_price.usd.'),metric('token-market-cap','token_market_cap','KAT market capitalization',13363658,['source:katana:market'],'market_cap.usd.'),metric('token-fdv','token_fdv','KAT fully diluted value',43408560,['source:katana:market'],'fully_diluted_valuation.usd.')],
  events: [event('mainnet','launch','2025-07-01','Katana mainnet launched.',['source:katana:l2beat','source:katana:overview'],'Current project history.'),event('peak-tvl','market_event','2026-03-07','Katana reached the maximum TVL point in the reviewed series.',['source:katana:tvl'],'Historical series maximum.'),event('tge','token_launch','2026-03-18','Katana launched KAT and activated vKAT.',['source:katana:tge','source:katana:token'],'Dated TGE and current token documentation.')],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama, CoinGecko and L2BEAT', historical_tvl_point_date: AS_OF, latest_tvl_usd: 64978331, peak_tvl_usd: 711046604, peak_tvl_date: '2026-03-07', tvl_drawdown_pct: 90.86, stablecoin_supply: { pegged_usd: 18200180.180766344 }, dex_volume_30d_usd: 24808092, dex_volume_change_1m_pct: -58.15, fees_30d_usd: 287146.41, revenue_30d_usd: 14255.52, boundary: 'Core-app, Vault Bridge and base-chain economics are not combined.' },
  forensicSummary: 'Katana is active but declining after losing 90.86% of peak TVL. Its curated apps, bridge-yield model and KAT launch are live, but they have not yet produced durable capital or volume retention.', forensicWhy: 'Concentrated liquidity and recycled economics created a strong launch, while product, bridge and incentive concentration made demand less durable and harder to separate from the system’s own capital.', whySources: ['source:katana:overview','source:katana:liquidity','source:katana:tvl','source:katana:volume','source:katana:market','source:katana:l2beat'],
  choices: [{decision:'Concentrate liquidity in a curated DeFi stack.',consequence:'Core markets can deepen while ecosystem and app risk concentrate.',confidence:'high',source_refs:['source:katana:overview','source:katana:liquidity']},{decision:'Deploy selected bridge assets into external strategies.',consequence:'The chain can fund yield while adding custody, strategy and accounting risk.',confidence:'high',source_refs:['source:katana:risk','source:katana:l2beat']},{decision:'Launch KAT/vKAT while retaining ETH gas.',consequence:'Governance and incentives gain a token without making it the universal control or fee asset.',confidence:'high',source_refs:['source:katana:token','source:katana:tge']}],
  forensicCounterfactual: 'A general-purpose L2 would reduce curation risk; an idle bridge would reduce strategy risk; ETH-only economics would remove token dilution. Each alternative gives up part of Katana’s integrated liquidity design.', counterfactualSources: ['source:katana:overview','source:katana:liquidity','source:katana:risk','source:katana:token'],
  watch: [{signal:'TVL, stablecoins, repeat traders, app concentration and incentive-adjusted volume.',implication:'Persistence would show demand beyond chain-owned liquidity.',source_refs:['source:katana:tvl','source:katana:stables','source:katana:volume','source:katana:liquidity']},{signal:'Vault Bridge positions, realized yield, losses, sequencer fees and KAT/vKAT participation.',implication:'Transparent positive net economics would strengthen the model.',source_refs:['source:katana:risk','source:katana:overview','source:katana:token']}],
  unknowns: [['How much volume and TVL persist without incentives?','A two-quarter incentive-adjusted cohort and flow analysis.'],['Where are all Vault Bridge assets and who controls them?','A reconciled position, custody and control statement.'],['Which apps generate chain fees and retained users?','Non-overlapping app-level fee and cohort data.'],['Who beneficially controls upgrades and emergency actions?','An independent entity-level control map.']],
};

const rootstockSpec = {
  slug: 'rootstock', name: 'Rootstock', classification: { subtype: 'Bitcoin merge-mined sidechain', tags: ['bitcoin', 'evm', 'merge_mining', 'federated_peg'], chains: ['Bitcoin','Rootstock'], jurisdictions: [] },
  outcome: 'declining', forensicOutcome: 'declining', outcomeConfidence: 'high', qualityConfidence: 'high', sources: rootstockSources,
  statusSources: ['source:rootstock:overview','source:rootstock:tvl','source:rootstock:spark'], statusLocator: 'Current developer documentation, independent analysis and nonzero capital show an operating sidechain.',
  outcomeSources: ['source:rootstock:tvl','source:rootstock:volume','source:rootstock:fees','source:rootstock:revenue','source:rootstock:spark'], outcomeLocator: 'Capital, activity, economics and current bridge assumptions were reviewed together.',
  sections: {
    what_it_is: section('Rootstock is an EVM-compatible Bitcoin sidechain. Bitcoin miners can merge-mine Rootstock blocks, and rBTC is the bitcoin-pegged gas asset. Moving BTC into and out of rBTC depends on the PowPeg federation and hardware-controlled keys. That bridge trust is separate from the hash power used to order Rootstock blocks, so “secured by Bitcoin” does not mean users can always exit without signers.', [claim('Rootstock is an EVM-compatible merge-mined sidechain using rBTC for gas.', ['source:rootstock:overview','source:rootstock:spark'], 'Current architecture descriptions.'),claim('PowPeg custody assumptions are separate from merge-mined block security.', ['source:rootstock:federation','source:rootstock:spark'], 'Federation and independent bridge analysis.')]),
    what_happened: section('Rootstock has operated for years and built a real Bitcoin DeFi niche. In the reviewed series, TVL peaked at $283.45 million in October 2025 and fell to $71.08 million, a 74.92% drawdown. Dollar stablecoins were $11.91 million. Thirty-day DEX volume was $44.05 million, down 36.55% from the prior provider comparison; fees were $115,313 and provider-reported retained revenue was only $1.', [claim('Rootstock TVL fell from $283,447,916 to $71,082,992.', ['source:rootstock:tvl'], 'Maximum and latest historical series points.'),claim('Thirty-day DEX volume fell 36.55%, and provider-reported revenue was $1.', ['source:rootstock:volume','source:rootstock:revenue'], 'Provider change_1m and total30d fields.', { value: 'volume 44050794; change -36.55%; revenue 1' })]),
    why_this_outcome: section('Rootstock solved a durable problem: EVM applications can use a bitcoin-pegged asset without moving all activity to a non-Bitcoin ecosystem. Merge mining reduced the need for a new validator token. But the PowPeg adds signer trust and liquidity friction, while faster L2s and other Bitcoin DeFi systems compete for developers and capital. The chain remains useful, yet current capital, volume and revenue indicate a mature network in decline rather than renewed growth.', [claim('EVM compatibility and rBTC created a durable Bitcoin DeFi niche.', ['source:rootstock:overview','source:rootstock:spark'], 'Current product and independent market analysis.', { confidence: 'medium', kind: 'inference' }),claim('Bridge trust and weak current economics limit the security and growth story.', ['source:rootstock:federation','source:rootstock:tvl','source:rootstock:revenue'], 'Current custody boundary and economic observations.', { confidence: 'high', kind: 'inference' })]),
    strategic_choices: section('Rootstock chose merge mining instead of a separate proof-of-stake token, rBTC instead of a floating gas token, and a threshold PowPeg instead of a fully custodial exchange bridge. It adopted changes to federation composition and spendability checks over time. Researchers are developing Union, a BitVMX-based bridge intended to reduce trust, but the reviewed evidence describes research or testnet work, not a production replacement for PowPeg.', [claim('Rootstock chose merge mining, rBTC gas and a threshold PowPeg.', ['source:rootstock:overview','source:rootstock:federation','source:rootstock:spark'], 'Current network and bridge design.'),claim('Union remains research or testnet work, not the live production bridge.', ['source:rootstock:union','source:rootstock:spark'], 'Research paper and independent deployment boundary.')]),
    operating_model: section('Bitcoin miners merge-mine Rootstock blocks, while EVM nodes execute smart contracts. BTC enters and exits through PowPeg, whose current threshold is described independently as five of nine functionaries. Rootstock improvements can change signer composition and validation, but users still cannot unilaterally recover BTC if the threshold is unavailable. Consensus liveness, contract safety and peg custody are three different risk surfaces.', [claim('Rootstock block production uses merge mining while PowPeg uses threshold functionaries.', ['source:rootstock:overview','source:rootstock:spark'], 'Current consensus and bridge descriptions.'),claim('PowPeg improvements do not provide users a unilateral exit from the current peg.', ['source:rootstock:rskip383','source:rootstock:rskip419','source:rootstock:federation'], 'Adopted changes and federation limitations.', { kind: 'unknown' })]),
    token_and_value_capture: section('rBTC is bitcoin-pegged gas, not a new speculative supply schedule. RIF is an ecosystem token for services and should not be presented as Rootstock’s gas or consensus-security token. That keeps network economics tied to BTC but leaves limited base-layer token value capture. The $1 provider-reported 30-day revenue field needs methodology review and is not proof that every application or miner earned only one dollar.', [claim('rBTC is the gas asset, while RIF is not the chain gas or consensus token.', ['source:rootstock:overview','source:rootstock:spark'], 'Current network and ecosystem boundary.'),claim('Provider-reported chain revenue is not total app, miner or ecosystem income.', ['source:rootstock:fees','source:rootstock:revenue'], 'Aggregate provider fields.', { kind: 'unknown' })]),
    counterfactual: section('Rootstock could have used a separate validator token, gaining direct security incentives while losing Bitcoin-miner alignment. It could have used a simpler custodian for BTC, improving speed at the cost of even more explicit trust. A production trust-minimized bridge could reduce PowPeg dependence, but calling Union live before deployment would hide today’s actual exit assumptions.', [claim('A separate validator token would create direct incentives while weakening Bitcoin alignment.', ['source:rootstock:overview','source:rootstock:spark'], 'Current merge-mined design.', { confidence: 'medium', kind: 'counterfactual' }),claim('A production trust-minimized bridge could reduce PowPeg dependence, but Union is not there yet.', ['source:rootstock:union','source:rootstock:spark'], 'Roadmap versus current deployment.', { confidence: 'medium', kind: 'counterfactual' })]),
    risks_and_unknowns: section('The main risks are PowPeg signer availability or collusion, smart-contract losses, weak liquidity, miner concentration and competition from newer Bitcoin systems. Merge-mining percentages do not reveal who controls bridge keys. We lack a current independent functionary ownership map, a complete unilateral-exit analysis, app-level fee concentration, repeat-user cohorts and a provider explanation for the $1 revenue observation.', [claim('Peg, miner, contract, liquidity and competition risks remain material.', ['source:rootstock:federation','source:rootstock:spark','source:rootstock:tvl'], 'Current bridge and market conditions.'),claim('Functionary ownership, unilateral exits, user cohorts and revenue methodology remain unresolved.', ['source:rootstock:federation','source:rootstock:revenue','source:rootstock:volume'], 'Reviewed sources omit reconciled answers.', { kind: 'unknown' })]),
    lifecycle: section('Rootstock is operating but declining. It remains one of the longest-running EVM environments tied to Bitcoin, with meaningful TVL and DEX volume. Still, TVL is 74.92% below peak, monthly volume fell 36.55% and reported retained revenue is negligible. The next lifecycle test is whether better bridge technology and applications can restore demand without overstating Bitcoin’s protection of the current peg.', [claim('Rootstock remains a live, mature Bitcoin sidechain.', ['source:rootstock:overview','source:rootstock:spark','source:rootstock:tvl'], 'Current operation and capital.'),claim('Capital, volume and revenue observations support a declining call.', ['source:rootstock:tvl','source:rootstock:volume','source:rootstock:revenue'], 'Peak-to-current activity and economics.', { kind: 'inference' })]),
    outlook_and_watch: section('The base case is continued niche use with gradual decline unless a new application or safer bridge materially changes distribution. The outlook improves if TVL and repeat users stabilize, fees translate into retained revenue and a production bridge reduces unilateral-exit risk. Watch PowPeg membership, HSM procedures, miner concentration, Union deployment status, rBTC supply, bridge delays, app concentration and fee methodology. The call worsens if current bridge trust is marketed as native Bitcoin security.', [claim('Stable demand, reconciled economics and a safer production bridge would strengthen the outlook.', ['source:rootstock:tvl','source:rootstock:fees','source:rootstock:revenue','source:rootstock:union'], 'Current baseline and future bridge work.', { confidence: 'medium', kind: 'inference' }),claim('PowPeg ownership, miner concentration, rBTC flows and Union deployment require dated monitoring.', ['source:rootstock:federation','source:rootstock:spark','source:rootstock:union'], 'Current custody and roadmap baseline.', { confidence: 'medium', kind: 'inference' })]),
  },
  metrics: [metric('tvl-latest','tvl','TVL',71082992,['source:rootstock:tvl'],'Latest historicalChainTvl point.'),metric('stablecoins-latest','stablecoin_supply','Dollar stablecoin supply',11909690.768024461,['source:rootstock:stables'],'peggedUSD field.'),metric('dex-volume-30d','dex_spot_volume','DEX volume (30d)',44050794,['source:rootstock:volume'],'total30d.',['not_unique_users']),metric('fees-30d','fees','Fees (30d)',115313,['source:rootstock:fees'],'total30d.'),metric('revenue-30d','protocol_revenue','Protocol revenue (30d)',1,['source:rootstock:revenue'],'total30d.',['gross_fees_not_profit','methodology_requires_review'])],
  events: [event('peak-tvl','market_event','2025-10-07','Rootstock reached the maximum TVL point in the reviewed series.',['source:rootstock:tvl'],'Historical series maximum.')],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama, Rootstock Research and Spark', historical_tvl_point_date: AS_OF, latest_tvl_usd: 71082992, peak_tvl_usd: 283447916, peak_tvl_date: '2025-10-07', tvl_drawdown_pct: 74.92, stablecoin_supply: { pegged_usd: 11909690.768024461 }, dex_volume_30d_usd: 44050794, dex_volume_change_1m_pct: -36.55, fees_30d_usd: 115313, revenue_30d_usd: 1, security_boundary: 'Merge-mined block ordering does not remove current PowPeg federation or unilateral-exit assumptions.' },
  forensicSummary: 'Rootstock remains a working Bitcoin sidechain, but TVL is 74.92% below peak, monthly volume is falling and current revenue is negligible. Its mature niche is declining, not dead.', forensicWhy: 'EVM compatibility and rBTC created durable Bitcoin DeFi utility, while PowPeg trust, liquidity friction and newer competitors limited growth. Merge mining does not solve peg custody.', whySources: ['source:rootstock:overview','source:rootstock:federation','source:rootstock:spark','source:rootstock:tvl','source:rootstock:volume','source:rootstock:revenue'],
  choices: [{decision:'Use Bitcoin merge mining instead of a new validator token.',consequence:'Rootstock aligns block security with miners while relying on their participation and concentration.',confidence:'high',source_refs:['source:rootstock:overview','source:rootstock:spark']},{decision:'Use rBTC and a threshold PowPeg.',consequence:'BTC liquidity reaches EVM apps while users accept federation and exit assumptions.',confidence:'high',source_refs:['source:rootstock:federation','source:rootstock:spark']},{decision:'Research Union as a future bridge.',consequence:'Trust could fall after production deployment, but current users still rely on PowPeg.',confidence:'high',source_refs:['source:rootstock:union','source:rootstock:spark']}],
  forensicCounterfactual: 'A separate token could fund validators but weaken Bitcoin alignment. A simple custodian could speed bridging but increase trust. A live trust-minimized bridge would help, but Union must not be counted before production.', counterfactualSources: ['source:rootstock:overview','source:rootstock:union','source:rootstock:spark'],
  watch: [{signal:'TVL, rBTC supply, repeat users, DEX volume, fees and retained revenue.',implication:'Stability would show the Bitcoin DeFi niche is holding.',source_refs:['source:rootstock:tvl','source:rootstock:stables','source:rootstock:volume','source:rootstock:fees','source:rootstock:revenue']},{signal:'PowPeg ownership, signer availability, miner concentration and Union production status.',implication:'Broader controls and a safer exit would improve the security case.',source_refs:['source:rootstock:federation','source:rootstock:rskip383','source:rootstock:rskip419','source:rootstock:union']}],
  unknowns: [['Who beneficially controls current PowPeg functionaries?','An independently verified ownership and jurisdiction map.'],['Can a user exit without the PowPeg threshold?','A current executable unilateral-exit proof or explicit limitation.'],['Which apps and users generate current fees?','Non-overlapping app-level fee and cohort data.'],['Why did the provider report only $1 of retained revenue?','A provider methodology and operator-income reconciliation.']],
};

const sonicSpec = {
  slug: 'sonic', name: 'Sonic', classification: { subtype: 'EVM L1', tags: ['evm', 'fantom_migration', 's_token', 'fee_monetization'], chains: ['Sonic'], jurisdictions: [] },
  outcome: 'declining', forensicOutcome: 'declining', outcomeConfidence: 'high', qualityConfidence: 'high', sources: sonicSources,
  statusSources: ['source:sonic:migration','source:sonic:token','source:sonic:tvl'], statusLocator: 'Current migration, token and capital observations show an operating L1.',
  outcomeSources: ['source:sonic:tvl','source:sonic:volume','source:sonic:fees','source:sonic:revenue','source:sonic:market','source:sonic:migration'], outcomeLocator: 'Sonic metrics were reviewed as a new chain and token history, not silently combined with Fantom Opera.',
  sections: {
    what_it_is: section('Sonic is an EVM Layer 1 launched by the team behind Fantom. FTM holders can migrate one-way into S at 1:1, and S pays gas, secures validators and supports governance. Sonic is not merely a renamed Fantom ledger: it is a new chain with its own activity, allocations and later token issuance. Fantom Opera still exists, although new development moved toward Sonic.', [claim('Sonic is a new EVM L1 with a 1:1 FTM-to-S migration path.', ['source:sonic:migration','source:sonic:faq','source:sonic:21shares'], 'Current migration and network descriptions.'),claim('Sonic and Fantom histories and supplies must not be silently combined.', ['source:sonic:migration','source:sonic:token','source:sonic:21shares'], 'Migration and post-genesis issuance boundary.')]),
    what_happened: section('Sonic launched on December 18, 2024 and attracted more than $1.14 billion of TVL by May 2025. TVL later fell to $14.99 million, a 98.69% drawdown. Dollar stablecoins were $134.73 million. Thirty-day DEX volume was $24.95 million, down 65.61% from the prior provider comparison; fees were $129,818.62 and provider-reported retained revenue was $80,796.92.', [claim('Sonic launched on December 18, 2024 and migrated FTM holders into S.', ['source:sonic:migration','source:sonic:21shares'], 'Dated launch and migration terms.'),claim('TVL fell from $1,140,087,474 to $14,990,537.', ['source:sonic:tvl'], 'Maximum and latest historical series points.')]),
    why_this_outcome: section('Sonic offered faster execution, grants and a direct migration path to Fantom’s community. That created a strong early capital cycle, but did not retain most liquidity or trading. The migration also split attention between Opera and Sonic, while new S issuance expanded beyond the initial 1:1 conversion story. Fee Monetization can help applications, yet it cannot create users by itself. Current metrics show a shipped migration with weak retention.', [claim('Migration and app incentives produced a launch cycle but did not retain peak capital.', ['source:sonic:migration','source:sonic:feem','source:sonic:tvl'], 'Product incentives compared with capital history.', { confidence: 'high', kind: 'inference' }),claim('The reviewed data do not isolate organic demand from migrated or incentivized activity.', ['source:sonic:volume','source:sonic:feem'], 'Aggregate activity and incentive system.', { kind: 'unknown' })]),
    strategic_choices: section('Sonic chose a new chain and token migration instead of upgrading Fantom Opera in place. It kept a 1:1 FTM conversion, then added airdrop, ecosystem, annual and Sonic USA issuance. It also gives registered applications 90% of eligible gas fees through Fee Monetization, leaving 10% for validators. These choices reward apps and fund growth, while creating supply, accounting and migration complexity.', [claim('Sonic chose a new L1 with one-way FTM-to-S migration after the first 90 days.', ['source:sonic:migration'], 'Current migration phases.'),claim('Sonic added post-migration issuance and routes eligible fees 90% to apps and 10% to validators.', ['source:sonic:token','source:sonic:feem'], 'Current supply and FeeM mechanics.')]),
    operating_model: section('Validators stake S and process Sonic transactions. S is used for gas and governance, while registered applications can claim most eligible gas fees through FeeM. Fantom Opera continues separately, so balances, transactions and TVL from the old chain are not Sonic metrics. A 2026 infrastructure update changed operational components without changing user balances or supply; that update is not a new token migration.', [claim('Sonic validators use S, and FeeM routes eligible fees primarily to registered apps.', ['source:sonic:token','source:sonic:feem'], 'Current validator and fee routing.'),claim('Opera remains separate, and the 2026 infrastructure update did not alter balances or supply.', ['source:sonic:migration','source:sonic:infra'], 'Chain and operational boundaries.')]),
    token_and_value_capture: section('S pays gas, secures validators and supports governance. The current supply is about 3.8 billion after the base migration, airdrop, annual funding and a 472.37 million S Sonic USA issuance. CoinGecko observed S at $0.02276235 with an $88.44 million market capitalization and fully diluted value, 97.79% below its recorded high. Gross chain fees are split with applications, so they are not all validator or foundation revenue.', [claim('Current S supply is about 3.8 billion after multiple post-migration issuances.', ['source:sonic:token','source:sonic:21shares'], 'Current supply and migration boundary.'),claim('S market capitalization was $88,439,111 at observation.', ['source:sonic:market'], 'CoinGecko market_data.market_cap.usd.', { value: 88439111 })]),
    counterfactual: section('Sonic could have upgraded Opera in place, preserving one ledger and token history while carrying more legacy constraints. It could have capped S at the migrated FTM supply, reducing dilution but removing funding for airdrops, ecosystem plans and Sonic USA. It could also have kept all gas fees with validators, simplifying economics while weakening the application-acquisition pitch.', [claim('An in-place Opera upgrade would reduce migration fragmentation while preserving legacy constraints.', ['source:sonic:migration','source:sonic:infra'], 'New-chain strategy versus continued Opera.', { confidence: 'medium', kind: 'counterfactual' }),claim('A fixed migrated supply or validator-only fees would reduce complexity while removing growth tools.', ['source:sonic:token','source:sonic:feem'], 'Current issuance and fee design.', { confidence: 'medium', kind: 'counterfactual' })]),
    risks_and_unknowns: section('The main risks are weak retained liquidity, token dilution, fragmented Fantom/Sonic activity, validator concentration and dependence on incentives. Stablecoin supply materially exceeds DeFi TVL, so it should not be treated as equivalent productive capital. We lack repeat-user cohorts, a full S supply and unlock reconciliation, FeeM concentration by app, validator beneficial ownership and net foundation economics after grants and issuances.', [claim('Liquidity, dilution, fragmentation and incentive risks remain material.', ['source:sonic:migration','source:sonic:token','source:sonic:tvl','source:sonic:market'], 'Current chain, supply and market observations.'),claim('Repeat users, supply reconciliation, FeeM concentration and operator economics remain unresolved.', ['source:sonic:token','source:sonic:feem','source:sonic:volume'], 'Current sources omit reconciled answers.', { kind: 'unknown' })]),
    lifecycle: section('Sonic is operating but declining. The migration, token, validators and FeeM system are live, and the chain still holds stablecoins and trading activity. Yet TVL is 98.69% below peak, monthly volume fell 65.61% and S is 97.79% below its high. The next phase is proving that the new chain can retain applications and users after the Fantom migration and major issuance programs.', [claim('Sonic’s migration, token and FeeM systems are live.', ['source:sonic:migration','source:sonic:token','source:sonic:feem'], 'Current shipped systems.'),claim('Capital, volume and token drawdowns support a declining call.', ['source:sonic:tvl','source:sonic:volume','source:sonic:market'], 'Peak-to-current observations.', { kind: 'inference' })]),
    outlook_and_watch: section('The base case is a smaller active L1 that retains parts of the Fantom ecosystem but struggles to rebuild peak liquidity. The call improves if TVL stabilizes, repeat users grow, FeeM supports several durable apps and S issuance slows relative to fees. Watch FTM conversions, S supply, validator stake, stablecoin deployment, app fee concentration, token unlocks and cross-chain TVL accounting. The call worsens if new issuance funds activity that disappears when rewards stop.', [claim('Stable capital, repeat users, diversified apps and improving fee-to-issuance economics would strengthen the outlook.', ['source:sonic:tvl','source:sonic:volume','source:sonic:feem','source:sonic:token'], 'Current baseline for future review.', { confidence: 'medium', kind: 'inference' }),claim('Migration flows, supply, validators, stablecoins and FeeM concentration require dated monitoring.', ['source:sonic:migration','source:sonic:token','source:sonic:stables','source:sonic:feem'], 'Current migration and economic baseline.', { confidence: 'medium', kind: 'inference' })]),
  },
  metrics: [metric('tvl-latest','tvl','TVL',14990537,['source:sonic:tvl'],'Latest historicalChainTvl point.'),metric('stablecoins-latest','stablecoin_supply','Dollar stablecoin supply',134732276.02471256,['source:sonic:stables'],'peggedUSD field.'),metric('dex-volume-30d','dex_spot_volume','DEX volume (30d)',24947891.62,['source:sonic:volume'],'total30d.',['not_unique_users','fantom_activity_excluded']),metric('fees-30d','fees','Fees (30d)',129818.62,['source:sonic:fees'],'total30d.'),metric('revenue-30d','protocol_revenue','Protocol revenue (30d)',80796.92,['source:sonic:revenue'],'total30d.',['gross_fees_not_profit','feem_split_requires_reconciliation']),metric('token-price','token_price','S price',0.02276235,['source:sonic:market'],'current_price.usd.'),metric('token-market-cap','token_market_cap','S market capitalization',88439111,['source:sonic:market'],'market_cap.usd.'),metric('token-fdv','token_fdv','S fully diluted value',88439111,['source:sonic:market'],'fully_diluted_valuation.usd.')],
  events: [event('mainnet','launch','2024-12-18','Sonic mainnet launched with FTM-to-S migration.',['source:sonic:migration','source:sonic:21shares'],'Dated launch and migration.'),event('peak-tvl','market_event','2025-05-11','Sonic reached the maximum TVL point in the reviewed series.',['source:sonic:tvl'],'Historical series maximum.'),event('sonic-usa','token_issuance','2025-09-04','Sonic issued 472,372,662.8 S for its Sonic USA strategy.',['source:sonic:token'],'Current token supply history.')],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama, CoinGecko, Sonic Labs and 21Shares', historical_tvl_point_date: AS_OF, latest_tvl_usd: 14990537, peak_tvl_usd: 1140087474, peak_tvl_date: '2025-05-11', tvl_drawdown_pct: 98.69, stablecoin_supply: { pegged_usd: 134732276.02471256 }, dex_volume_30d_usd: 24947891.62, dex_volume_change_1m_pct: -65.61, fees_30d_usd: 129818.62, revenue_30d_usd: 80796.92, migration_boundary: 'Sonic is a new chain; Fantom activity is excluded and post-migration S issuance is retained separately.' },
  forensicSummary: 'Sonic shipped a full Fantom migration and app-fee system, but TVL is 98.69% below peak, monthly volume is falling and S is 97.79% below its high. The chain is active but declining.', forensicWhy: 'Migration, speed and app rewards created a strong launch, while chain fragmentation, incentive dependence and later token issuance did not produce durable capital retention.', whySources: ['source:sonic:migration','source:sonic:token','source:sonic:feem','source:sonic:tvl','source:sonic:volume','source:sonic:market'],
  choices: [{decision:'Launch a new chain instead of upgrading Fantom Opera in place.',consequence:'Sonic gained a clean technical and economic reset while splitting activity and history.',confidence:'high',source_refs:['source:sonic:migration','source:sonic:infra']},{decision:'Migrate FTM 1:1 and add later S issuance.',consequence:'Existing holders received continuity while total supply and accounting grew more complex.',confidence:'high',source_refs:['source:sonic:token','source:sonic:21shares']},{decision:'Route 90% of eligible gas fees to registered apps.',consequence:'Applications gain revenue incentives while validators retain less of those fees.',confidence:'high',source_refs:['source:sonic:feem']}],
  forensicCounterfactual: 'An Opera upgrade would reduce fragmentation; a fixed migrated supply would reduce dilution; validator-only fees would simplify accounting. Each alternative gives up part of Sonic’s growth strategy.', counterfactualSources: ['source:sonic:migration','source:sonic:token','source:sonic:feem'],
  watch: [{signal:'TVL, stablecoins, repeat users, volume, fees and FeeM concentration.',implication:'Persistent diversified activity would show demand beyond migration incentives.',source_refs:['source:sonic:tvl','source:sonic:stables','source:sonic:volume','source:sonic:fees','source:sonic:feem']},{signal:'FTM conversions, S supply, unlocks, validator stake and additional strategic issuance.',implication:'Slower dilution and broad security would improve token and network economics.',source_refs:['source:sonic:migration','source:sonic:token','source:sonic:21shares']}],
  unknowns: [['How many users migrated and remained active on Sonic?','A two-quarter wallet cohort excluding one-time migration transactions.'],['What is fully reconciled circulating and locked S supply?','An independently audited supply and unlock statement.'],['Which apps receive most FeeM revenue?','A non-overlapping app-level FeeM report.'],['Who beneficially controls validator stake and emergency powers?','An independent entity-level control map.']],
};

const specs = [adiSpec, berachainSpec, katanaSpec, rootstockSpec, sonicSpec];
const cases = specs.map((spec) => ({
  chain: spec.chain || spec.name,
  slug: spec.slug,
  sources: spec.sources,
  canonical_profile: buildProfile(spec),
  forensic_analysis: buildForensic(spec),
}));

const document = {
  schema: 'chaindump-chain-causal-completion-v2',
  research_as_of: AS_OF,
  generated_migration: '0088_chain_causal_completion_wave_g.sql',
  methodology: {
    scope: 'Canonical ten-section blockchain profiles for ADI, Berachain, Katana, Rootstock and Sonic.',
    observation_rule: `Volatile provider fields were fetched between ${OBSERVED_AT} and ${ACCESSED_AT}. Exact values remain point-in-time observations.`,
    evidence_rule: 'Official sources establish documented design and decisions. Independent sources test market outcomes and control assumptions. Aggregate metrics do not prove causality or user retention.',
    claim_rule: 'Each customer section has bounded atomic claims with source references, evidence locators, confidence, fact/inference/unknown labels and pending human review.',
    preservation_rule: 'Migration 0088 preserves legacy facts and analysis fields while adding forensic analysis, review metadata and an embedded canonical profile. Sources merge by URL.',
  },
  cases,
};

for (const entry of cases) {
  const profileErrors = validateEntityProfile(entry.canonical_profile, { now: new Date(ACCESSED_AT) });
  if (profileErrors.length) throw new Error(`${entry.chain}: invalid canonical profile: ${JSON.stringify(profileErrors)}`);
  const sourceById = Object.fromEntries(entry.sources.map((item) => [item.id, item]));
  const forensic = validateForensicAnalysis(entry.forensic_analysis, { resolver: sourceById });
  if (forensic.errors.length || forensic.warnings.length || forensic.withheld_sections.length) {
    throw new Error(`${entry.chain}: invalid forensic profile: ${JSON.stringify(forensic)}`);
  }
  if (Object.keys(entry.canonical_profile.analysis.sections).join('|') !== ANALYSIS_SECTION_KEYS.join('|')) {
    throw new Error(`${entry.chain}: canonical section order drifted`);
  }
  if (new Set(entry.sources.map(({ id }) => id)).size !== entry.sources.length) throw new Error(`${entry.chain}: duplicate source id`);
  if (new Set(entry.sources.map(({ url }) => url)).size !== entry.sources.length) throw new Error(`${entry.chain}: duplicate source URL`);
  if (!entry.sources.some(({ role }) => role === 'primary') || !entry.sources.some(({ role }) => role === 'independent')) {
    throw new Error(`${entry.chain}: primary and independent evidence are required`);
  }
  for (const [key, value] of Object.entries(entry.canonical_profile.analysis.sections)) {
    if (!value.body.trim() || value.claim_ids.length < 2 || value.claim_ids.length > 4) throw new Error(`${entry.chain}:${key}: invalid section depth`);
    for (const id of value.claim_ids) {
      const item = entry.canonical_profile.claims.find((candidate) => candidate.id === id);
      if (!item || item.field_path !== `analysis.sections.${key}.body` || item.assertion.length > 240) {
        throw new Error(`${entry.chain}:${key}:${id}: invalid atomic claim`);
      }
    }
  }
}

const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sqlJson = (value) => sqlText(JSON.stringify(value));

function legacySources(entry) {
  return entry.sources.map((item) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    publisher: item.publisher,
    ...(item.published_at ? { published_at: item.published_at } : {}),
    source_role: item.role === 'primary' ? 'primary' : item.role === 'independent' ? 'independent' : 'aggregator',
    tier: item.tier,
    checked_at: item.checked_at,
    evidence_locator: item.evidence_locator,
  }));
}

function sourceMerge(ownerExpression, incomingExpression) {
  return `(SELECT json_group_array(json(source_json))
      FROM (
        SELECT source_json
        FROM (
          SELECT
            CASE
              WHEN new_source.value IS NULL THEN old_source.value
              ELSE json_patch(old_source.value, new_source.value)
            END AS source_json,
            old_source.key AS position
          FROM json_each(COALESCE(${ownerExpression}, '[]')) AS old_source
          LEFT JOIN json_each(COALESCE(${incomingExpression}, '[]')) AS new_source
            ON json_extract(new_source.value, '$.url') = json_extract(old_source.value, '$.url')
          WHERE json_extract(old_source.value, '$.url') IS NULL
             OR old_source.key = (
               SELECT MIN(candidate.key)
               FROM json_each(COALESCE(${ownerExpression}, '[]')) AS candidate
               WHERE json_extract(candidate.value, '$.url') = json_extract(old_source.value, '$.url')
             )
          UNION ALL
          SELECT new_source.value AS source_json, 10000 + new_source.key AS position
          FROM json_each(COALESCE(${incomingExpression}, '[]')) AS new_source
          WHERE NOT EXISTS (
            SELECT 1 FROM json_each(COALESCE(${ownerExpression}, '[]')) AS existing
            WHERE json_extract(existing.value, '$.url') = json_extract(new_source.value, '$.url')
          )
        )
        ORDER BY position
      ))`;
}

function renderFactsStatement(entry) {
  const payload = { chain: entry.chain, sources: legacySources(entry), forensic_analysis: entry.forensic_analysis };
  const synthesisStatement = `-- canonical-synthesis-start ${entry.chain}
WITH canonical_seed(payload) AS (VALUES (${sqlJson(payload)}))
UPDATE chain_facts AS facts
SET
  data = json_set(
    facts.data,
    '$.forensic_analysis', json(json_extract((SELECT payload FROM canonical_seed), '$.forensic_analysis')),
    '$.canonical_profile_ref', 'chain_analysis.profile.canonical_profile'
  ),
  sources = ${sourceMerge("facts.sources", "json_extract((SELECT payload FROM canonical_seed), '$.sources')")},
  updated_at = '${AS_OF}'
WHERE facts.chain = json_extract((SELECT payload FROM canonical_seed), '$.chain')
  AND facts.dimension = 'synthesis';
-- canonical-synthesis-end ${entry.chain}
`;
  const metaStatement = `-- canonical-meta-start ${entry.chain}
UPDATE chain_facts
SET
  data = json_set(
    data,
    '$.forensic_analysis_version', 'forensic-analysis-v1',
    '$.canonical_profile_schema', 'chaindump-entity-profile',
    '$.canonical_claim_review', json(${sqlJson({
      state: 'pending',
      claims: entry.canonical_profile.claims.length,
      last_assembled_at: ACCESSED_AT,
      human_approval_required: true,
    })}),
    '$.last_reviewed', '${AS_OF}',
    '$.next_review_at', '2026-08-10'
  ),
  updated_at = '${AS_OF}'
WHERE chain = ${sqlText(entry.chain)} AND dimension = '_meta';
-- canonical-meta-end ${entry.chain}
`;
  for (const [label, statement] of [['synthesis', synthesisStatement], ['meta', metaStatement]]) {
    if (Buffer.byteLength(statement, 'utf8') > MAX_D1_STATEMENT_BYTES) throw new Error(`${entry.chain}: ${label} statement exceeds D1 ceiling`);
  }
  return `${synthesisStatement}\n${metaStatement}`;
}

function renderAnalysisStatement(entry) {
  const profileEnvelope = { canonical_profile: entry.canonical_profile };
  const incomingSources = legacySources(entry);
  const take = entry.canonical_profile.analysis.sections.why_this_outcome.body;
  const trend = entry.canonical_profile.analysis.sections.lifecycle.body.slice(0, 500);
  const sentiment = entry.canonical_profile.outcome.label === 'declining' ? 'bearish' : 'mixed';
  const statement = `-- canonical-profile-start ${entry.chain}
INSERT INTO chain_analysis (chain, take, sentiment, trend, updated_at, sources, profile)
VALUES (
  ${sqlText(entry.chain)},
  ${sqlText(take)},
  ${sqlText(sentiment)},
  ${sqlText(trend)},
  '${AS_OF}',
  ${sqlJson(incomingSources)},
  ${sqlJson(profileEnvelope)}
)
ON CONFLICT(chain) DO UPDATE SET
  updated_at = excluded.updated_at,
  sources = ${sourceMerge('chain_analysis.sources', 'excluded.sources')},
  profile = json_set(
    COALESCE(chain_analysis.profile, '{}'),
    '$.canonical_profile', json_extract(excluded.profile, '$.canonical_profile')
  );
-- canonical-profile-end ${entry.chain}
`;
  if (Buffer.byteLength(statement, 'utf8') > MAX_D1_STATEMENT_BYTES) throw new Error(`${entry.chain}: chain_analysis statement exceeds D1 ceiling`);
  return statement;
}

function renderMigration(value = document) {
  const artifactHash = createHash('sha256').update(`${JSON.stringify(value, null, 2)}\n`).digest('hex');
  return `-- Generated by scripts/render-chain-causal-wave-0088.mjs.
-- Adds Wave G review-state canonical profiles without overwriting legacy dossiers.
-- Sources merge by URL; every statement is idempotent and under the D1 statement ceiling.
-- artifact-sha256 ${artifactHash}

${value.cases.flatMap((entry) => [renderFactsStatement(entry), renderAnalysisStatement(entry)]).join('\n')}`;
}

export { document, renderMigration };

function writeOutputs() {
  writeFileSync(artifactPath, `${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(migrationPath, renderMigration(document));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) writeOutputs();

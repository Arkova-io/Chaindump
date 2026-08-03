#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYSIS_SECTION_KEYS, validateEntityProfile } from '../src/lib/entity-profile.js';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(root, 'docs/chain-causal-completion-wave-e-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0082_chain_causal_completion_wave_e.sql');
const AS_OF = '2026-08-03';
const OBSERVED_AT = '2026-08-03T18:46:35.506Z';
const ACCESSED_AT = '2026-08-03T18:46:43.378Z';
const NEXT_REVIEW_AT = '2026-08-10T18:46:43.378Z';
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

const seiSources = [
  source('sei', 'giga', 'Sei Giga overview', 'https://docs.sei.io/learn/sei-giga', 'Sei', { locator: 'Current Giga architecture, performance targets and roadmap status.' }),
  source('sei', 'v2', 'How the Sei v2 launch worked', 'https://blog.sei.io/how-the-sei-v2-launch-will-work/', 'Sei Labs', { publishedAt: '2024-05-20', locator: 'Parallel EVM launch phases and compatibility plan.' }),
  source('sei', 'parallel', 'Parallel EVM is open for everyone', 'https://blog.sei.io/parallel-evm-is-open-for-everyone/', 'Sei Labs', { publishedAt: '2024-05-28', locator: 'Permissionless v2 mainnet launch and EVM positioning.' }),
  source('sei', 'sip3', 'SIP-3: no new CosmWasm deployments', 'https://blog.sei.io/announcements/sip-03-no-new-cosmwasm-contract-deployments/', 'Sei Labs', { locator: 'EVM-only migration decision and Cosmos deprecation steps.' }),
  ...marketSources('sei', 'Sei', 'sei-network'),
];

const provenanceSources = [
  source('provenance', 'tokenomics', 'Provenance tokenomics', 'https://www.provenance.io/whitepaper-tokenomics', 'Provenance Blockchain', { locator: 'Current HASH fee, staking, inflation, auction and burn descriptions.' }),
  source('provenance', 'intro', 'Provenance Blockchain introduction', 'https://developer.provenance.io/docs/pb/blockchain/introduction/', 'Provenance Blockchain', { locator: 'Finance-specific modules, privacy pattern and network purpose.' }),
  source('provenance', 'governance', 'Provenance governance', 'https://developer.provenance.io/docs/pb/ecosystem/governance/', 'Provenance Blockchain', { locator: 'Validator voting and proposal process.' }),
  source('provenance', 'sec', 'Figure Technology Solutions 2025 annual report', 'https://www.sec.gov/Archives/edgar/data/2064124/000206412426000009/figr-20251231.htm', 'U.S. SEC', { tier: 'A', role: 'independent', publishedAt: '2026-03-02', locator: 'Figure transaction volume, RWA balances, HASH dependency and operating relationship.' }),
  source('provenance', 'rwa', 'Provenance network dashboard', 'https://app.rwa.xyz/networks/provenance', 'RWA.xyz', { role: 'independent', locator: 'Represented asset value and issuer concentration snapshot.' }),
  ...marketSources('provenance', 'Provenance', 'hash-2'),
];

const flareSources = [
  source('flare', 'overview', 'Flare network overview', 'https://dev.flare.network/network/overview', 'Flare', { locator: 'Current EVM network, FTSO and FDC architecture.' }),
  source('flare', 'ftso', 'Flare Time Series Oracle overview', 'https://dev.flare.network/ftso/overview', 'Flare', { locator: 'Validator-linked price and data-estimation process.' }),
  source('flare', 'fassets', 'FAssets overview', 'https://dev.flare.network/fassets/overview', 'Flare', { locator: 'FAssets collateral, agent and redemption model.' }),
  source('flare', 'fxrp', 'FAssets FXRP is live on mainnet', 'https://flare.network/es/news/fassets-fxrp-is-live-on-mainnet', 'Flare', { publishedAt: '2025-09-24', locator: 'Dated FXRP mainnet launch and initial scope.' }),
  source('flare', 'fip16', 'FIP.16: FLR emissions and value accrual', 'https://proposals.flare.network/FIP/FIP_16.html', 'Flare Governance', { publishedAt: '2026-04-24', locator: 'Accepted proposal, phased changes and target economics.' }),
  source('flare', 'audit', 'FAssets OpenZeppelin audit', 'https://dev.flare.network/assets/files/20260128-OpenZeppelin-FAssets-484601fddc2f576c1c7df3a80869b36c.pdf', 'OpenZeppelin', { tier: 'A', role: 'independent', publishedAt: '2026-01-28', locator: 'Independent FAssets code review, findings and scope.' }),
  ...marketSources('flare', 'Flare', 'flare-networks'),
];

const chainflipSources = [
  source('chainflip', 'overview', 'Chainflip protocol overview', 'https://docs.chainflip.io/protocol/protocol-overview', 'Chainflip', { locator: 'Purpose-built cross-chain exchange design and supported swap path.' }),
  source('chainflip', 'security', 'Chainflip governance and security', 'https://docs.chainflip.io/protocol/governance-and-security', 'Chainflip', { locator: 'Vault, governance and trust assumptions.' }),
  source('chainflip', 'validators', 'Validator role', 'https://docs.chainflip.io/validators/validators-role', 'Chainflip', { locator: 'Authority-set size and threshold-signing responsibilities.' }),
  source('chainflip', 'economics', 'Current Chainflip token economics', 'https://docs.chainflip.io/protocol/token-economics/current-token-economics-2025-and-beyond', 'Chainflip', { locator: 'Current documented emissions and burn mechanics.' }),
  source('chainflip', 'flip21', 'Introducing FLIP 2.1', 'https://chainflip.io/blog/introducing-flip-2-1-fixed-supply-revenue-backed-staking/', 'Chainflip', { publishedAt: '2026-04-22', locator: 'Proposed fixed-supply and buy-and-distribute model.' }),
  source('chainflip', 'lending', 'Behind Lending 2.0', 'https://chainflip.io/blog/behind-lending-2-0-protocol-developer-explains', 'Chainflip', { publishedAt: '2026-07-16', locator: 'Live lending product, mechanism and risk discussion.' }),
  ...marketSources('chainflip', 'Chainflip', 'chainflip'),
];

const unichainSources = [
  source('unichain', 'mainnet', 'Unichain mainnet is here', 'https://blog.uniswap.org/unichain-mainnet-is-here', 'Uniswap Labs', { publishedAt: '2025-02-11', locator: 'Mainnet date, OP Stack, costs and DeFi positioning.' }),
  source('unichain', 'flashblocks', 'Flashblocks are live', 'https://blog.uniswap.org/es-ES/flashblocks-are-live', 'Uniswap Labs', { publishedAt: '2025-08-14', locator: '200 millisecond preconfirmation production launch.' }),
  source('unichain', 'rollupboost', 'Rollup-Boost is live on Unichain', 'https://blog.uniswap.org/es-ES/rollup-boost-is-live-on-unichain', 'Uniswap Labs', { locator: 'TEE priority ordering and operator design.' }),
  source('unichain', 'unification', 'UNIfication', 'https://blog.uniswap.org/unification', 'Uniswap Labs', { publishedAt: '2025-11-10', locator: 'Executed fee switch, UNI burn and sequencer-fee routing.' }),
  source('unichain', 'whitepaper', 'Unichain whitepaper', 'https://docs.unichain.org/whitepaper.pdf', 'Uniswap Labs', { locator: 'Design for priority ordering and the planned validation network.' }),
  source('unichain', 'l2beat', 'Unichain risk analysis', 'https://l2beat.com/scaling/projects/unichain', 'L2BEAT', { tier: 'A', role: 'independent', locator: 'Stage, operator, data, upgrade and user-exit risk panels.' }),
  ...marketSources('unichain', 'Unichain', null),
];

const seiSpec = {
  slug: 'sei', name: 'Sei', aliases: ['Sei Network'],
  classification: { subtype: 'parallel EVM layer 1', tags: ['evm', 'trading', 'parallel_execution', 'cosmos_migration'], chains: [], jurisdictions: [] },
  outcome: 'declining', forensicOutcome: 'declining', outcomeConfidence: 'high', qualityConfidence: 'medium', sources: seiSources,
  statusSources: ['source:sei:giga', 'source:sei:tvl', 'source:sei:fees'],
  statusLocator: 'Current documentation and nonzero capital, activity and fee observations show an operating network.',
  outcomeSources: ['source:sei:tvl', 'source:sei:volume', 'source:sei:fees', 'source:sei:revenue', 'source:sei:sip3'],
  outcomeLocator: 'The latest and peak capital observations, recent activity trend and documented EVM-only pivot were reviewed together.',
  sections: {
    what_it_is: section('Sei is a fast layer 1 built around parallel EVM execution. It began as a Cosmos-based trading chain, then widened into a general smart-contract platform. Its pitch is that existing Solidity applications can run with low latency without changing programming languages. That makes Sei easier to compare with other fast EVM chains than with its original order-book-focused design. The network is live today; the more ambitious Giga system remains a roadmap with staged components, not a blanket description of current production performance.', [
      claim('Sei currently supports parallel EVM execution for permissionless applications.', ['source:sei:parallel', 'source:sei:v2'], 'V2 launch and permissionless mainnet descriptions.'),
      claim('Giga performance figures describe a staged roadmap rather than a fully verified production baseline.', ['source:sei:giga'], 'Current Giga overview and roadmap language.', { kind: 'unknown' }),
    ]),
    what_happened: section('Sei launched with a Cosmos and CosmWasm identity, added a parallel EVM in 2024, and later approved an EVM-only direction through SIP-3. By 2026-08-03, TVL was $37.84 million, down 93.98% from its $628.35 million peak in July 2025. Dollar stablecoins were $302.84 million and 30-day DEX volume was $208.13 million, but that volume had fallen 35.59% from the provider’s prior-month comparison. The network collected $1.19 million in 30-day fees and retained $132,394.74 as provider-reported revenue.', [
      claim('Sei moved from Cosmos and CosmWasm toward an EVM-only network through SIP-3.', ['source:sei:v2', 'source:sei:sip3'], 'Dated EVM launch and deprecation decision.'),
      claim('TVL fell from $628,350,950 to $37,842,652 by the review date.', ['source:sei:tvl'], 'Maximum and latest daily TVL points.', { value: 'peak 628350950; latest 37842652' }),
    ]),
    why_this_outcome: section('The clearest problem is not raw speed; it is durable demand. EVM compatibility increased the addressable developer pool, while the earlier Cosmos identity and repeated architectural changes made Sei’s positioning harder to follow. Current stablecoin balances and trading activity show that the chain is still used, but the TVL drawdown and weaker recent volume show that capital has not stayed near its peak. The EVM-only decision may simplify the product, yet current evidence cannot separate organic retention from incentives, tokenized assets or migration-related activity.', [
      claim('EVM compatibility plausibly widened Sei’s developer market while repeated pivots increased migration and identity costs.', ['source:sei:v2', 'source:sei:sip3'], 'Documented architecture sequence.', { confidence: 'medium', kind: 'inference' }),
      claim('Aggregate TVL and volume do not identify repeat users, incentive dependence or migration turnover.', ['source:sei:tvl', 'source:sei:volume'], 'Provider aggregates omit cohort and acquisition data.', { kind: 'unknown' }),
    ]),
    strategic_choices: section('Sei made three large choices. It optimized execution for trading, added a parallel EVM instead of remaining Cosmos-only, and then chose to retire new CosmWasm deployment paths under SIP-3. The first two choices chased speed and a larger builder market. The third reduces the cost of supporting two execution environments, but asks Cosmos-native teams and users to migrate. Giga doubles down on the same thesis with new consensus, storage and execution work. That roadmap can sharpen the product, but it does not by itself repair weak capital retention.', [
      claim('SIP-3 deliberately reduces dual-stack complexity by moving Sei toward EVM-only operation.', ['source:sei:sip3'], 'Published SIP-3 migration rationale.'),
      claim('Giga continues the high-throughput strategy with new consensus and execution components.', ['source:sei:giga'], 'Giga architecture overview.'),
    ]),
    operating_model: section('Sei is a sovereign proof-of-stake network rather than an Ethereum rollup. Validators order and execute transactions, and the EVM can identify independent work that runs in parallel. The design avoids depending on an Ethereum sequencer or bridge for ordinary execution, but it creates its own validator, client and upgrade risks. During the EVM-only transition, exchanges, wallets and applications must coordinate address and asset handling. The reviewed sources describe the migration plan, not a complete independent map of validator ownership or application-level user retention.', [
      claim('Sei operates its own validator network and parallel EVM execution.', ['source:sei:v2', 'source:sei:parallel'], 'V2 network and execution descriptions.'),
      claim('Current validator ownership and application retention were not independently reconciled in this review.', ['source:sei:giga', 'source:sei:sip3'], 'Protocol sources do not provide an entity-level concentration study.', { kind: 'unknown' }),
    ]),
    token_and_value_capture: section('SEI pays transaction fees, secures the network through staking and participates in governance. CoinGecko observed a $0.04156664 price, $279.86 million market capitalization and $415.64 million fully diluted value on 2026-08-03, about 96.35% below the recorded all-time high. Network use creates fee and staking demand, but token value also depends on supply, unlocks and market expectations. The reviewed sources do not give token holders a contractual right to ecosystem revenue, so high transaction counts should not be treated as automatic token value capture.', [
      claim('SEI market capitalization was $279,861,930 at the observation date.', ['source:sei:market'], 'CoinGecko market_data.market_cap.usd.', { value: 279861930 }),
      claim('The reviewed materials do not establish a contractual claim on application or operator revenue for SEI holders.', ['source:sei:giga', 'source:sei:sip3'], 'Protocol and migration descriptions contain no reviewed cash-flow right.', { kind: 'unknown' }),
    ]),
    counterfactual: section('Sei could have kept both CosmWasm and EVM indefinitely. That would preserve backward compatibility but continue the engineering and product cost of two environments. It could also have stayed a narrow trading chain, accepting a smaller builder market in exchange for a clearer identity. A slower migration might reduce disruption while prolonging uncertainty. None of these alternatives has a controlled comparison, so the useful test is practical: does the EVM-only system retain more applications, capital and paying activity than the dual-stack period?', [
      claim('Keeping both virtual machines would trade migration disruption for continuing dual-stack complexity.', ['source:sei:v2', 'source:sei:sip3'], 'Documented before-and-after architectures.', { confidence: 'medium', kind: 'counterfactual' }),
      claim('A narrower trading-only strategy might improve clarity while limiting the developer market.', ['source:sei:v2', 'source:sei:parallel'], 'Original and expanded product scopes.', { confidence: 'medium', kind: 'counterfactual' }),
    ]),
    risks_and_unknowns: section('The immediate risks are migration execution, thin retained capital and roadmap overreach. Deprecating Cosmos paths can strand tooling or users if wallets and exchanges do not coordinate correctly. A 93.98% TVL drawdown leaves less room for another demand shock. Giga’s targets are useful engineering goals, but production performance, client diversity and outage behavior must be measured after activation. We also lack repeat-user cohorts, incentive-adjusted activity, validator concentration and a reconciled statement of fee distribution.', [
      claim('The EVM-only migration introduces coordination risk for wallets, exchanges and Cosmos-native applications.', ['source:sei:sip3'], 'Published migration steps and affected functionality.'),
      claim('Repeat users, incentive-adjusted activity and validator concentration remain unresolved.', ['source:sei:tvl', 'source:sei:volume', 'source:sei:giga'], 'Current sources do not supply those measurements.', { kind: 'unknown' }),
    ]),
    lifecycle: section('Sei is operating but declining. It has survived launch and executed major technical changes, yet its capital base is far below the 2025 peak and recent DEX activity is contracting. The stablecoin balance shows that the network is not dead, and current fees show real use. The next phase is a retention test after SIP-3 and Giga milestones: builders, liquidity and paying users must stay without relying on novelty or migration events. Until that happens, a high-speed roadmap is optionality rather than evidence of a completed turnaround.', [
      claim('Sei remains operating with nonzero capital, volume, fees and revenue.', ['source:sei:tvl', 'source:sei:volume', 'source:sei:fees', 'source:sei:revenue'], 'Current provider observations.'),
      claim('The drawdown and weaker monthly volume support a declining lifecycle call.', ['source:sei:tvl', 'source:sei:volume'], 'Peak-to-latest TVL and provider change_1m.', { confidence: 'high', kind: 'inference' }),
    ]),
    outlook_and_watch: section('The base case is a smaller but active EVM chain while the market waits for Giga and post-migration retention. The call improves if TVL stabilizes, volume recovers without one-off incentives, independent applications keep repeat users and fees translate into a sustainable validator budget. Watch migration incidents, application departures, validator concentration, stablecoin circulation and the gap between gross fees and retained revenue. The call worsens if capital keeps leaving, the roadmap slips or EVM compatibility fails to produce a distinct reason to choose Sei over other fast chains.', [
      claim('Sustained capital, repeat activity and fee economics would strengthen the outlook.', ['source:sei:tvl', 'source:sei:volume', 'source:sei:fees', 'source:sei:revenue'], 'Current baseline for future comparison.', { confidence: 'medium', kind: 'inference' }),
      claim('Production Giga milestones and post-SIP-3 retention are the next decisive tests.', ['source:sei:giga', 'source:sei:sip3'], 'Published roadmap and migration sequence.', { confidence: 'medium', kind: 'inference' }),
    ]),
  },
  metrics: [
    metric('tvl-latest', 'tvl', 'TVL', 37842652, ['source:sei:tvl'], 'Latest historicalChainTvl point.'),
    metric('stablecoins-latest', 'stablecoin_supply', 'Dollar stablecoin supply', 302835194.04274774, ['source:sei:stables'], 'peggedUSD field.'),
    metric('dex-volume-30d', 'dex_spot_volume', 'DEX volume (30d)', 208131654.57, ['source:sei:volume'], 'total30d.', ['not_unique_users']),
    metric('fees-30d', 'fees', 'Fees (30d)', 1189961.87, ['source:sei:fees'], 'total30d.'),
    metric('revenue-30d', 'protocol_revenue', 'Protocol revenue (30d)', 132394.74, ['source:sei:revenue'], 'total30d.', ['gross_fees_not_profit']),
    metric('token-price', 'token_price', 'SEI price', 0.04156664, ['source:sei:market'], 'current_price.usd.'),
    metric('token-market-cap', 'token_market_cap', 'SEI market capitalization', 279861930, ['source:sei:market'], 'market_cap.usd.'),
    metric('token-fdv', 'token_fdv', 'SEI fully diluted value', 415636530, ['source:sei:market'], 'fully_diluted_valuation.usd.'),
  ],
  events: [
    event('v2', 'architecture_upgrade', '2024-05-28', 'Sei opened its parallel EVM mainnet to permissionless use.', ['source:sei:parallel'], 'Dated announcement.'),
    event('peak-tvl', 'market_event', '2025-07-18', 'Sei reached the maximum TVL point in the reviewed series.', ['source:sei:tvl'], 'Historical series maximum.'),
    event('sip3', 'governance', '2026-04-06', 'SIP-3 migration steps moved Sei toward EVM-only operation.', ['source:sei:sip3'], 'Published migration schedule.'),
  ],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama and CoinGecko', historical_tvl_point_date: AS_OF, latest_tvl_usd: 37842652, peak_tvl_usd: 628350950, peak_tvl_date: '2025-07-18', tvl_drawdown_pct: 93.98, stablecoin_supply: { pegged_usd: 302835194.04274774 }, dex_volume_30d_usd: 208131654.57, dex_volume_change_1m_pct: -35.59, fees_30d_usd: 1189961.87, revenue_30d_usd: 132394.74 },
  forensicSummary: 'Sei is an operating but declining parallel-EVM chain. TVL was $37.84 million on 2026-08-03, 93.98% below its peak, and 30-day DEX volume was down 35.59% month over month. Stablecoins and fees show continued use, but not a completed turnaround.',
  forensicWhy: 'Sei widened from a Cosmos trading chain into a parallel EVM and then chose an EVM-only direction. That simplifies the product and expands developer compatibility, but repeated repositioning has not yet produced durable capital retention. Current aggregates do not isolate organic users or incentive dependence.',
  whySources: ['source:sei:v2', 'source:sei:parallel', 'source:sei:sip3', 'source:sei:tvl', 'source:sei:volume', 'source:sei:fees', 'source:sei:revenue'],
  choices: [
    { decision: 'Add a parallel EVM to the original Cosmos-based chain.', consequence: 'Sei reached Solidity developers while increasing architectural complexity.', confidence: 'high', source_refs: ['source:sei:v2', 'source:sei:parallel'] },
    { decision: 'Move toward EVM-only operation under SIP-3.', consequence: 'The product becomes simpler while Cosmos-native users and applications bear migration costs.', confidence: 'high', source_refs: ['source:sei:sip3'] },
    { decision: 'Continue investing in the Giga high-throughput roadmap.', consequence: 'Performance optionality increases, but production delivery and demand remain separate tests.', confidence: 'high', source_refs: ['source:sei:giga'] },
  ],
  forensicCounterfactual: 'Keeping both execution environments would preserve compatibility but continue dual-stack cost. Staying trading-only would keep a clearer identity while narrowing the builder market. No alternative has a controlled outcome; post-migration retention is the practical test.',
  counterfactualSources: ['source:sei:v2', 'source:sei:parallel', 'source:sei:sip3'],
  watch: [
    { signal: 'TVL, stablecoins, DEX volume, fees and retained revenue after SIP-3.', implication: 'Broad stabilization would support a turnaround; isolated spikes would not.', source_refs: ['source:sei:tvl', 'source:sei:stables', 'source:sei:volume', 'source:sei:fees', 'source:sei:revenue'] },
    { signal: 'Giga production milestones, incidents, application retention and validator concentration.', implication: 'Delivered performance with broad control and retained builders would reduce execution risk.', source_refs: ['source:sei:giga', 'source:sei:sip3'] },
  ],
  unknowns: [
    ['What share of activity comes from repeat users without incentives?', 'A two-quarter wallet-cohort and incentive-adjusted study.'],
    ['How concentrated are validators and core infrastructure providers?', 'An independently verified entity-level control map.'],
    ['What migration losses or application departures resulted from SIP-3?', 'A complete pre- and post-migration application inventory.'],
    ['When do Giga components become verified production behavior?', 'Mainnet activation plus independent load and incident testing.'],
  ],
};

const provenanceSpec = {
  slug: 'provenance', name: 'Provenance', aliases: ['Provenance Blockchain'],
  classification: { subtype: 'finance-focused Cosmos layer 1', tags: ['rwa', 'financial_services', 'cosmos_sdk', 'hash'], chains: [], jurisdictions: ['US'] },
  outcome: 'successful', forensicOutcome: 'successful', outcomeConfidence: 'medium', qualityConfidence: 'medium', sources: provenanceSources,
  statusSources: ['source:provenance:intro', 'source:provenance:tvl', 'source:provenance:fees'],
  statusLocator: 'Current documentation and nonzero capital, trading and fee observations show an operating network.',
  outcomeSources: ['source:provenance:sec', 'source:provenance:rwa', 'source:provenance:tvl', 'source:provenance:volume', 'source:provenance:fees'],
  outcomeLocator: 'Regulatory filings, represented-asset reporting and current network observations were compared without treating them as the same metric.',
  sections: {
    what_it_is: section('Provenance is a Cosmos-based layer 1 built for regulated financial assets and transactions. It includes modules for identity, asset metadata, records and financial workflows, while sensitive documents can stay off-chain with hashes used for verification. Figure is the network’s dominant commercial user. Provenance should therefore be judged less like a retail smart-contract chain and more like financial infrastructure: can institutions originate, finance, service and trade assets with lower cost and reliable legal records?', [
      claim('Provenance is a finance-specific Cosmos network with identity, metadata and record modules.', ['source:provenance:intro'], 'Current network introduction and module list.'),
      claim('Figure is a material operating and commercial dependency for the network.', ['source:provenance:sec', 'source:provenance:rwa'], 'Figure filing and represented-asset concentration snapshot.'),
    ]),
    what_happened: section('Figure built lending and capital-markets products on Provenance, bringing mortgages, HELOCs and other credit assets onto the network. Figure’s SEC filing reported more than $60 billion of cumulative transactions through October 2025 and about $13 billion of real-world assets on Provenance at September 2025. Those figures are not the same as liquid DeFi TVL. On 2026-08-03, DefiLlama measured $1.56 billion TVL, only 12.12% below the series peak, and $271.60 million of 30-day DEX volume, up 180.69% month over month.', [
      claim('Figure reported more than $60 billion of cumulative transactions through October 2025.', ['source:provenance:sec'], 'Figure annual report business and network discussion.', { value: 'more than 60000000000 cumulative' }),
      claim('DefiLlama TVL was $1,562,605,640, 12.12% below the reviewed peak.', ['source:provenance:tvl'], 'Latest and maximum daily TVL points.', { value: 'latest 1562605640; peak 1778133420' }),
    ]),
    why_this_outcome: section('Provenance succeeded by choosing a narrow customer and building the workflow that customer needed. Finance-specific modules and USD-denominated fee logic reduce integration friction for institutions, while Figure supplies products, assets and distribution. The result is substantial retained capital without needing broad retail mindshare. The weakness is concentration: RWA.xyz attributed the represented value in its snapshot to Figure, so commercial success and single-operator dependence are both true. The evidence supports a successful call, but not a claim that the network has a diversified economy.', [
      claim('Specialized financial modules and Figure distribution plausibly explain the network’s retained capital.', ['source:provenance:intro', 'source:provenance:sec', 'source:provenance:tvl'], 'Product design, distribution and market outcome.', { confidence: 'medium', kind: 'inference' }),
      claim('The reviewed evidence does not establish a diversified issuer or application base.', ['source:provenance:rwa', 'source:provenance:sec'], 'Represented-asset and operator concentration evidence.', { kind: 'unknown' }),
    ]),
    strategic_choices: section('Provenance chose a purpose-built finance chain rather than a general-purpose retail platform. It stores sensitive information off-chain while anchoring verification on-chain, prices transaction fees in familiar dollar terms but settles them in HASH, and relies on validator governance. It also accepted close alignment with Figure to gain immediate products and institutional distribution. That accelerates adoption, but the network’s regulatory and commercial risk becomes closely tied to one company and to the legal treatment of HASH.', [
      claim('Provenance keeps sensitive documents off-chain while using on-chain records and hashes for verification.', ['source:provenance:intro'], 'Privacy and record architecture.'),
      claim('The network prices fees in USD terms while HASH settles network costs.', ['source:provenance:tokenomics'], 'Current fee denomination and settlement description.'),
    ]),
    operating_model: section('Provenance uses proof of stake and on-chain governance. Validators secure the network and vote on proposals; financial applications use purpose-built modules instead of rebuilding every workflow in contracts. HASH pays fees and supports staking. Figure’s 2026 operating role makes execution capacity clearer, but also reinforces concentration. A reported asset value, a settled transaction and DeFi TVL measure different things, so the app should keep all three separate rather than rolling them into one headline.', [
      claim('Validators secure Provenance and participate in governance proposals.', ['source:provenance:governance', 'source:provenance:tokenomics'], 'Governance and staking descriptions.'),
      claim('Represented asset value, cumulative transactions and TVL are different measurements.', ['source:provenance:sec', 'source:provenance:rwa', 'source:provenance:tvl'], 'Each source reports a different scope.', { confidence: 'high', kind: 'inference' }),
    ]),
    token_and_value_capture: section('HASH pays transaction fees, secures the network and participates in governance. CoinGecko observed a $0.00821071 price, $460.20 million market capitalization and $779.74 million fully diluted value on 2026-08-03, about 86.35% below the recorded all-time high. Current tokenomics describe dynamic inflation plus a fee auction and burn model. Older official materials described a fixed supply and different fee distribution. Until activation and production parameters are independently reconciled, the current documentation should be treated as the target model, not proof that every mechanism is live.', [
      claim('HASH market capitalization was $460,201,162 at the observation date.', ['source:provenance:market'], 'CoinGecko market_data.market_cap.usd.', { value: 460201162 }),
      claim('Production activation of every current tokenomics mechanism was not independently reconciled.', ['source:provenance:tokenomics', 'source:provenance:sec'], 'Current target model and regulatory dependency disclosure.', { kind: 'unknown' }),
    ]),
    counterfactual: section('Provenance could have launched its products on a general-purpose chain. That would improve composability and shared liquidity, but institutions would inherit external fee markets, governance and privacy constraints. It could also have kept the chain neutral from Figure, reducing concentration while losing the anchor customer that drove real adoption. Neither path has a controlled outcome. The practical test is whether new issuers and applications can use the same rails without depending on Figure for demand and operations.', [
      claim('A general-purpose host chain would trade custom finance controls for shared liquidity and composability.', ['source:provenance:intro'], 'Documented specialized module rationale.', { confidence: 'medium', kind: 'counterfactual' }),
      claim('Less Figure alignment would reduce concentration while weakening anchor-customer distribution.', ['source:provenance:sec', 'source:provenance:rwa'], 'Observed commercial concentration.', { confidence: 'medium', kind: 'counterfactual' }),
    ]),
    risks_and_unknowns: section('The main risk is concentration across operator, issuer, applications and represented assets. Figure’s SEC filing also identifies regulatory treatment of HASH as a material dependency. Low reported token trading volume can make market prices fragile even when the network processes large financial assets. We do not yet have a complete entity-level validator map, a reconciled live token-emissions schedule or a clean breakdown of independent issuers. These gaps do not negate current success; they limit how durable and decentralized that success can be called.', [
      claim('Figure disclosed regulatory treatment of HASH as a material business dependency.', ['source:provenance:sec'], 'Annual report risk discussion.'),
      claim('Validator, issuer and application concentration are not fully reconciled in the reviewed sources.', ['source:provenance:governance', 'source:provenance:rwa'], 'Governance description and represented-asset snapshot.', { kind: 'unknown' }),
    ]),
    lifecycle: section('Provenance is an established, successful specialist chain. Its liquid TVL remained close to the reviewed peak and Figure reported large cumulative financial activity. It is not a broad consumer ecosystem, and success depends heavily on one anchor business. The next lifecycle phase is diversification: new issuers, lenders, exchanges and service providers need to add meaningful volume while governance and validator control broaden. Until then, Provenance is best described as proven infrastructure with a concentrated customer base.', [
      claim('Current TVL remained within 12.12% of the reviewed peak.', ['source:provenance:tvl'], 'Latest and maximum TVL points.'),
      claim('Current success is substantial but commercially concentrated.', ['source:provenance:sec', 'source:provenance:rwa', 'source:provenance:tvl'], 'Operating scale and concentration evidence.', { confidence: 'medium', kind: 'inference' }),
    ]),
    outlook_and_watch: section('The base case is continued growth through Figure and other regulated-asset programs, with lumpy volume rather than retail-style daily activity. The call improves if non-Figure issuers grow, validator control broadens and current tokenomics are verified in production. Watch liquid TVL separately from represented assets, plus DEX volume, fees, issuer concentration, HASH liquidity and regulatory disclosures. The call weakens if one operator remains the source of nearly all activity or if token, legal or governance risk interrupts institutional use.', [
      claim('Issuer diversification and broader validator control would strengthen the durability call.', ['source:provenance:rwa', 'source:provenance:governance'], 'Current concentration and governance baseline.', { confidence: 'medium', kind: 'inference' }),
      claim('TVL, represented assets and cumulative transactions should continue to be reported separately.', ['source:provenance:tvl', 'source:provenance:rwa', 'source:provenance:sec'], 'Different scopes and measurement contracts.'),
    ]),
  },
  metrics: [
    metric('tvl-latest', 'tvl', 'TVL', 1562605640, ['source:provenance:tvl'], 'Latest historicalChainTvl point.'),
    metric('stablecoins-latest', 'stablecoin_supply', 'Dollar stablecoin supply', 98739389.75622718, ['source:provenance:stables'], 'peggedUSD field.'),
    metric('dex-volume-30d', 'dex_spot_volume', 'DEX volume (30d)', 271599334, ['source:provenance:volume'], 'total30d.', ['not_unique_users']),
    metric('fees-30d', 'fees', 'Fees (30d)', 6174.81, ['source:provenance:fees'], 'total30d.'),
    metric('revenue-30d', 'protocol_revenue', 'Protocol revenue (30d)', 6174.81, ['source:provenance:revenue'], 'total30d.', ['gross_fees_not_profit']),
    metric('token-price', 'token_price', 'HASH price', 0.00821071, ['source:provenance:market'], 'current_price.usd.'),
    metric('token-market-cap', 'token_market_cap', 'HASH market capitalization', 460201162, ['source:provenance:market'], 'market_cap.usd.'),
    metric('token-fdv', 'token_fdv', 'HASH fully diluted value', 779736660, ['source:provenance:market'], 'fully_diluted_valuation.usd.'),
  ],
  events: [
    event('figure-scale', 'market_event', '2025-10-31', 'Figure reported more than $60 billion of cumulative transactions through October 2025.', ['source:provenance:sec'], 'SEC filing reporting cutoff.'),
    event('peak-tvl', 'market_event', '2026-07-23', 'Provenance reached the maximum TVL point in the reviewed series.', ['source:provenance:tvl'], 'Historical series maximum.'),
  ],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama, CoinGecko, RWA.xyz and SEC filings', historical_tvl_point_date: AS_OF, latest_tvl_usd: 1562605640, peak_tvl_usd: 1778133420, peak_tvl_date: '2026-07-23', tvl_drawdown_pct: 12.12, stablecoin_supply: { pegged_usd: 98739389.75622718 }, dex_volume_30d_usd: 271599334, dex_volume_change_1m_pct: 180.69, fees_30d_usd: 6174.81, revenue_30d_usd: 6174.81 },
  forensicSummary: 'Provenance is a successful specialist financial chain. TVL was $1.56 billion on 2026-08-03, 12.12% below its peak, and Figure reported more than $60 billion in cumulative transactions through October 2025. Success is real but highly concentrated around Figure.',
  forensicWhy: 'Purpose-built financial modules and an anchor institution converted a narrow strategy into real transaction and asset scale. The same Figure relationship creates distribution and concentration simultaneously. Represented assets, cumulative transactions and liquid TVL are kept separate.',
  whySources: ['source:provenance:intro', 'source:provenance:sec', 'source:provenance:rwa', 'source:provenance:tvl', 'source:provenance:volume'],
  choices: [
    { decision: 'Build a purpose-built financial-services chain.', consequence: 'Institutions gain tailored workflows while the ecosystem sacrifices some shared-chain composability.', confidence: 'high', source_refs: ['source:provenance:intro'] },
    { decision: 'Use off-chain sensitive records with on-chain verification.', consequence: 'Privacy improves while completeness depends on external record systems.', confidence: 'high', source_refs: ['source:provenance:intro'] },
    { decision: 'Align closely with Figure as the anchor operator and customer.', consequence: 'Distribution and assets arrived quickly, but company-specific risk became network risk.', confidence: 'high', source_refs: ['source:provenance:sec', 'source:provenance:rwa'] },
  ],
  forensicCounterfactual: 'A general-purpose host could add composability while weakening tailored controls. Less Figure alignment could reduce concentration while losing the anchor customer. New independent issuers are the observable test that distinguishes durable infrastructure from a single-company chain.',
  counterfactualSources: ['source:provenance:intro', 'source:provenance:sec', 'source:provenance:rwa'],
  watch: [
    { signal: 'Non-Figure issuers, applications, represented assets and liquid TVL.', implication: 'Diversification would make current success more durable.', source_refs: ['source:provenance:rwa', 'source:provenance:sec', 'source:provenance:tvl'] },
    { signal: 'Validator concentration, live fee mechanics, HASH liquidity and regulatory disclosures.', implication: 'Broader control and reconciled economics would reduce current dependency risk.', source_refs: ['source:provenance:governance', 'source:provenance:tokenomics', 'source:provenance:market', 'source:provenance:sec'] },
  ],
  unknowns: [
    ['How much activity comes from organizations independent of Figure?', 'Issuer- and application-level volume reporting.'],
    ['How concentrated are validator ownership and delegated stake?', 'An independently verified entity-level validator map.'],
    ['Which current HASH tokenomics mechanisms are active in production?', 'Mainnet parameter and flow reconciliation.'],
    ['How much represented asset value is liquid and transferable?', 'Asset-level liquidity, redemption and transfer reporting.'],
  ],
};

const flareSpec = {
  slug: 'flare', name: 'Flare', aliases: ['Flare Network'],
  classification: { subtype: 'data-focused EVM layer 1', tags: ['evm', 'oracle', 'cross_chain_data', 'xrpfi'], chains: [], jurisdictions: [] },
  outcome: 'middling', forensicOutcome: 'middling', outcomeConfidence: 'medium', qualityConfidence: 'medium', sources: flareSources,
  statusSources: ['source:flare:overview', 'source:flare:fxrp', 'source:flare:tvl'],
  statusLocator: 'Current documentation, the FXRP mainnet launch and nonzero capital show an operating network.',
  outcomeSources: ['source:flare:tvl', 'source:flare:volume', 'source:flare:fees', 'source:flare:revenue', 'source:flare:fxrp'],
  outcomeLocator: 'Current capital and economics were read alongside the live FAssets milestone.',
  sections: {
    what_it_is: section('Flare is an EVM layer 1 built to make external blockchain and internet data available inside smart contracts. Its native systems include the Flare Time Series Oracle for price-like data and the Flare Data Connector for event proofs. FAssets uses those systems to represent assets such as XRP in DeFi without changing the source chain. Flare’s test is whether integrated data and asset bridging create repeat economic use that a normal EVM chain plus external oracle cannot match.', [
      claim('Flare integrates the FTSO and FDC data systems into the network.', ['source:flare:overview', 'source:flare:ftso'], 'Current network and oracle documentation.'),
      claim('FAssets uses collateral and agents to represent external assets on Flare.', ['source:flare:fassets'], 'Current FAssets system overview.'),
    ]),
    what_happened: section('Flare built its data layer first, then launched FXRP on mainnet on September 24, 2025. TVL peaked at $218.09 million in January 2026 and was $114.58 million on 2026-08-03, a 47.46% drawdown. Dollar stablecoins were $47.21 million. Thirty-day DEX volume was $141.23 million, down 51.87% month over month, while fees were $413,558.60 and retained revenue $42,432.23. FIP.16 later approved lower target inflation and new fee-routing changes, but its own text describes phased implementation.', [
      claim('FXRP launched on Flare mainnet on September 24, 2025.', ['source:flare:fxrp'], 'Dated launch announcement.'),
      claim('TVL fell from $218,090,724 to $114,584,371 by the review date.', ['source:flare:tvl'], 'Maximum and latest daily TVL points.', { value: 'peak 218090724; latest 114584371' }),
    ]),
    why_this_outcome: section('Flare has a real differentiator and a live product, but adoption remains modest and uneven. Native data systems reduce the number of external components an application must combine, and XRP offers a large potential user base. Yet a product can be technically distinctive without becoming the default venue. Current TVL is nearly half below peak and recent DEX volume is weakening. Incentives, collateral efficiency, bridge trust and user demand cannot be separated from aggregate volume alone, so the evidence supports a middling—not failed and not yet broadly successful—call.', [
      claim('Integrated data systems and FXRP plausibly create a differentiated XRPFi product.', ['source:flare:overview', 'source:flare:fassets', 'source:flare:fxrp'], 'Documented architecture and live asset launch.', { confidence: 'medium', kind: 'inference' }),
      claim('Aggregate volume does not isolate organic demand, incentives or repeat users.', ['source:flare:volume'], 'Provider aggregate lacks cohort and incentive fields.', { kind: 'unknown' }),
    ]),
    strategic_choices: section('Flare chose to make validators part of data provision instead of treating oracles as a separate application. It then built FAssets to bring non-smart-contract assets into DeFi and used incentives to seed that market. FIP.16 shifts emphasis toward lower emissions, fee burning and future value accrual. Those choices align security, data and applications, but also make the system more complex. A failure in collateral, agents or data protocols can affect the flagship product even if EVM execution remains healthy.', [
      claim('Flare links network validation and data provision through its native protocols.', ['source:flare:ftso', 'source:flare:overview'], 'Validator and data-provider descriptions.'),
      claim('FIP.16 approved phased changes to inflation and fee routing.', ['source:flare:fip16'], 'Accepted proposal and implementation phases.'),
    ]),
    operating_model: section('Flare runs its own proof-of-stake EVM network. FTSO providers submit estimates, FDC attestation providers confirm external events, and FAssets agents supply collateral and handle minting and redemption. That division of work creates checks, but users still depend on the health and incentives of several participant groups. OpenZeppelin reviewed the FAssets code in a defined scope; an audit reduces some code risk but does not guarantee economic safety or live operations.', [
      claim('FAssets relies on agents, collateral and redemption mechanics in addition to the base chain.', ['source:flare:fassets'], 'FAssets architecture.'),
      claim('The OpenZeppelin review covered a defined code scope and is not a guarantee of economic safety.', ['source:flare:audit'], 'Independent audit scope and findings.', { confidence: 'high', kind: 'inference' }),
    ]),
    token_and_value_capture: section('FLR pays network fees, supports staking and participates in governance and data incentives. CoinGecko observed a $0.00627097 price, $544.27 million market capitalization and $666.60 million fully diluted value on 2026-08-03, about 95.82% below the recorded all-time high. FIP.16 targets lower inflation and more fee burning, but the proposal is phased. The report therefore separates approved targets from verified live flows. Token value still depends on actual data use, FAssets demand, emissions and market behavior.', [
      claim('FLR market capitalization was $544,268,652 at the observation date.', ['source:flare:market'], 'CoinGecko market_data.market_cap.usd.', { value: 544268652 }),
      claim('Full production activation of every FIP.16 phase was not established by the proposal alone.', ['source:flare:fip16'], 'The proposal distinguishes phases and future work.', { kind: 'unknown' }),
    ]),
    counterfactual: section('Flare could have offered data services as middleware on existing chains, gaining distribution without building a new validator economy. That would reduce sovereign-chain overhead but weaken protocol-level integration. It could also have focused only on general EVM applications, avoiding FAssets complexity while losing its clearest reason to exist. Neither alternative guarantees adoption. The observable test is whether FAssets and native data integrations generate users, fees and retained capital beyond incentives.', [
      claim('A middleware model would trade sovereign integration for access to existing chain distribution.', ['source:flare:overview'], 'Documented native-chain rationale.', { confidence: 'medium', kind: 'counterfactual' }),
      claim('Removing FAssets would simplify the system while removing the core XRPFi product.', ['source:flare:fassets', 'source:flare:fxrp'], 'Product architecture and launch.', { confidence: 'medium', kind: 'counterfactual' }),
    ]),
    risks_and_unknowns: section('Flare’s main risks are FAssets collateral failures, data-provider concentration, bridge and agent behavior, declining liquidity and dependence on incentives. The current audit is useful but scoped. The network also needs to show that approved token changes become actual production flows. We lack a complete entity-level map of validators, data providers and FAssets agents, repeat-user cohorts and subsidy-adjusted economics. These gaps are why current product progress does not yet support a stronger lifecycle label.', [
      claim('FAssets adds collateral, agent and data-system risks beyond normal EVM execution.', ['source:flare:fassets', 'source:flare:audit'], 'Protocol architecture and audit scope.'),
      claim('Entity concentration and incentive-adjusted user retention remain unresolved.', ['source:flare:ftso', 'source:flare:volume'], 'Current sources do not provide those measurements.', { kind: 'unknown' }),
    ]),
    lifecycle: section('Flare is in the adoption phase. It has moved beyond a data-network thesis because FXRP is live, but current capital is 47.46% below peak and recent trading activity is shrinking. The chain is not dead: it retains more than $100 million TVL and generates fees. It is not yet mature either: its signature product and revised token model still need durable demand and independently reconciled economics. Middling captures that combination of real delivery and incomplete market proof.', [
      claim('Flare has a live flagship asset product and nonzero network economics.', ['source:flare:fxrp', 'source:flare:tvl', 'source:flare:fees'], 'Launch and current provider observations.'),
      claim('Current drawdown and weaker monthly volume support a middling lifecycle call.', ['source:flare:tvl', 'source:flare:volume'], 'Peak-to-latest TVL and change_1m.', { confidence: 'medium', kind: 'inference' }),
    ]),
    outlook_and_watch: section('The base case is a specialized XRPFi and data chain with modest scale. The call improves if FXRP supply and redemptions remain healthy, other FAssets launch safely, TVL and volume recover without subsidies and FIP.16 flows are visible on-chain. Watch agent collateral, oracle performance, redemptions, audits, data-provider concentration, fees and retained revenue together. The call weakens if collateral incidents occur, incentives fade without users or planned value capture remains documentation rather than production behavior.', [
      claim('Healthy FAssets growth and reconciled fee flows would strengthen the outlook.', ['source:flare:fassets', 'source:flare:fxrp', 'source:flare:fip16', 'source:flare:revenue'], 'Current product and economics baseline.', { confidence: 'medium', kind: 'inference' }),
      claim('Data-provider, validator and agent concentration should be monitored together.', ['source:flare:ftso', 'source:flare:fassets'], 'Participant roles in the operating model.', { confidence: 'medium', kind: 'inference' }),
    ]),
  },
  metrics: [
    metric('tvl-latest', 'tvl', 'TVL', 114584371, ['source:flare:tvl'], 'Latest historicalChainTvl point.'),
    metric('stablecoins-latest', 'stablecoin_supply', 'Dollar stablecoin supply', 47205211.140954845, ['source:flare:stables'], 'peggedUSD field.'),
    metric('dex-volume-30d', 'dex_spot_volume', 'DEX volume (30d)', 141234694.79, ['source:flare:volume'], 'total30d.', ['not_unique_users']),
    metric('fees-30d', 'fees', 'Fees (30d)', 413558.6, ['source:flare:fees'], 'total30d.'),
    metric('revenue-30d', 'protocol_revenue', 'Protocol revenue (30d)', 42432.23, ['source:flare:revenue'], 'total30d.', ['gross_fees_not_profit']),
    metric('token-price', 'token_price', 'FLR price', 0.00627097, ['source:flare:market'], 'current_price.usd.'),
    metric('token-market-cap', 'token_market_cap', 'FLR market capitalization', 544268652, ['source:flare:market'], 'market_cap.usd.'),
    metric('token-fdv', 'token_fdv', 'FLR fully diluted value', 666603932, ['source:flare:market'], 'fully_diluted_valuation.usd.'),
  ],
  events: [
    event('fxrp-mainnet', 'product_launch', '2025-09-24', 'Flare launched FXRP through FAssets on mainnet.', ['source:flare:fxrp'], 'Dated announcement.'),
    event('fip16', 'governance', '2026-04-24', 'Flare governance accepted FIP.16.', ['source:flare:fip16'], 'Proposal status and date.'),
  ],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama and CoinGecko', historical_tvl_point_date: AS_OF, latest_tvl_usd: 114584371, peak_tvl_usd: 218090724, peak_tvl_date: '2026-01-06', tvl_drawdown_pct: 47.46, stablecoin_supply: { pegged_usd: 47205211.140954845 }, dex_volume_30d_usd: 141234694.79, dex_volume_change_1m_pct: -51.87, fees_30d_usd: 413558.6, revenue_30d_usd: 42432.23 },
  forensicSummary: 'Flare is a middling data-focused EVM chain. FXRP is live and current capital and fees show real use, but TVL was 47.46% below peak and 30-day DEX volume was down 51.87% month over month on 2026-08-03.',
  forensicWhy: 'Native data protocols and FAssets give Flare a distinctive XRPFi product. Delivery has progressed, but capital and recent trading show uneven retention. FIP.16 may improve token economics, yet approved phases must be separated from verified production flows.',
  whySources: ['source:flare:overview', 'source:flare:ftso', 'source:flare:fassets', 'source:flare:fxrp', 'source:flare:fip16', 'source:flare:tvl', 'source:flare:volume'],
  choices: [
    { decision: 'Integrate data protocols into the validator network.', consequence: 'Applications get native data while validator and data-provider health become linked.', confidence: 'high', source_refs: ['source:flare:overview', 'source:flare:ftso'] },
    { decision: 'Build FAssets around collateralized agents.', consequence: 'External assets gain DeFi access while collateral and agent risks increase.', confidence: 'high', source_refs: ['source:flare:fassets', 'source:flare:fxrp'] },
    { decision: 'Approve phased lower emissions and fee routing under FIP.16.', consequence: 'Value capture may improve if implementation and demand both materialize.', confidence: 'high', source_refs: ['source:flare:fip16'] },
  ],
  forensicCounterfactual: 'Middleware could access existing-chain distribution while losing native integration. A general EVM focus would simplify operations while removing the strongest differentiation. Durable FAssets use is the observable test.',
  counterfactualSources: ['source:flare:overview', 'source:flare:fassets', 'source:flare:fxrp'],
  watch: [
    { signal: 'FAssets supply, redemptions, collateral health, agent concentration and incidents.', implication: 'Safe repeat use would validate the flagship product.', source_refs: ['source:flare:fassets', 'source:flare:fxrp', 'source:flare:audit'] },
    { signal: 'TVL, volume, fees, revenue and FIP.16 production flows.', implication: 'Broad improvement would strengthen the middling call.', source_refs: ['source:flare:tvl', 'source:flare:volume', 'source:flare:fees', 'source:flare:revenue', 'source:flare:fip16'] },
  ],
  unknowns: [
    ['How concentrated are validators, data providers and FAssets agents?', 'An independently verified entity-level control map.'],
    ['What share of activity remains after incentives?', 'A subsidy-adjusted two-quarter user cohort.'],
    ['Which FIP.16 phases are active in production?', 'On-chain parameter and cash-flow reconciliation.'],
    ['How does FAssets behave during stressed redemptions?', 'A material live stress event or independently reviewed simulation.'],
  ],
};

const chainflipSpec = {
  slug: 'chainflip', name: 'Chainflip', aliases: ['Chainflip State Chain'],
  classification: { subtype: 'purpose-built cross-chain exchange network', tags: ['substrate', 'cross_chain_swap', 'threshold_signing', 'flip'], chains: [], jurisdictions: [] },
  outcome: 'middling', forensicOutcome: 'middling', outcomeConfidence: 'medium', qualityConfidence: 'medium', sources: chainflipSources,
  statusSources: ['source:chainflip:overview', 'source:chainflip:lending', 'source:chainflip:volume'],
  statusLocator: 'Current documentation, a July 2026 product release and nonzero volume show an operating network.',
  outcomeSources: ['source:chainflip:tvl', 'source:chainflip:volume', 'source:chainflip:fees', 'source:chainflip:revenue', 'source:chainflip:market'],
  outcomeLocator: 'Current capital, exchange flow, economics and token-market observations were reviewed together.',
  sections: {
    what_it_is: section('Chainflip is a purpose-built network for swapping native assets across blockchains without wrapping them first. A Substrate-based State Chain coordinates deposits, pricing and vaults, while validators jointly control external-chain funds through threshold signatures. It is not a general smart-contract platform and it is not fully trustless: users rely on an economic and cryptographic validator threshold. The product succeeds if that narrower design gives traders reliable cross-chain execution with enough liquidity and sustainable validator economics.', [
      claim('Chainflip coordinates native cross-chain swaps through a purpose-built State Chain.', ['source:chainflip:overview'], 'Current protocol overview.'),
      claim('External vaults depend on threshold signatures from the validator authority set.', ['source:chainflip:security', 'source:chainflip:validators'], 'Vault and authority-set descriptions.'),
    ]),
    what_happened: section('Chainflip launched its swap network, expanded supported assets and added Lending 2.0 in July 2026. On 2026-08-03, TVL was $12.88 million, 42.02% below its December 2024 peak. Thirty-day exchange volume was much larger at $313.76 million, but had fallen 43.15% month over month. Fees were $968,623 and provider-reported revenue was $174,551. FLIP traded about 96.47% below its all-time high. Those numbers show a working product with real turnover, but shrinking recent demand and weak token performance.', [
      claim('Chainflip released Lending 2.0 in July 2026.', ['source:chainflip:lending'], 'Dated product explanation.'),
      claim('TVL was $12,877,066 and 30-day volume was $313,755,771 on the review date.', ['source:chainflip:tvl', 'source:chainflip:volume'], 'Latest TVL and total30d volume fields.', { value: 'tvl 12877066; volume 313755771' }),
    ]),
    why_this_outcome: section('Chainflip solves a real cross-chain problem without asking users to hold wrapped assets, and its focused architecture can route substantial turnover against a relatively small capital base. The trade-off is trust and operating complexity: liquidity, validators, external vaults, relayers and pricing must all work together. Recent volume contraction and a depressed token suggest the market has not yet rewarded that complexity with durable growth. Aggregate volume also cannot show unique traders, wash activity or profitability after validator and incentive costs.', [
      claim('Native-asset swaps and focused infrastructure plausibly explain high volume relative to TVL.', ['source:chainflip:overview', 'source:chainflip:tvl', 'source:chainflip:volume'], 'Product design and current capital/flow.', { confidence: 'medium', kind: 'inference' }),
      claim('Provider volume does not identify repeat traders or subsidy-adjusted profitability.', ['source:chainflip:volume', 'source:chainflip:fees', 'source:chainflip:revenue'], 'Aggregates omit user cohorts and complete costs.', { kind: 'unknown' }),
    ]),
    strategic_choices: section('Chainflip chose a dedicated network rather than deploying a bridge and DEX on another chain. It capped the active authority set near 150 validators and uses a two-thirds threshold to control vaults. It also tied FLIP to validator security and network economics. In 2026 the team proposed FLIP 2.1, replacing elastic supply and burn mechanics with fixed supply and buy-and-distribute staking. That is a material change, so the proposal should not be described as live until production parameters and flows confirm activation.', [
      claim('Chainflip limits the active authority set and uses threshold signing for external vaults.', ['source:chainflip:validators', 'source:chainflip:security'], 'Validator and vault documentation.'),
      claim('FLIP 2.1 proposes a fixed-supply, buy-and-distribute model.', ['source:chainflip:flip21'], 'Published proposal description.'),
    ]),
    operating_model: section('Validators observe supported chains, sign vault transactions and advance State Chain consensus. Liquidity providers fund pools, brokers submit swap instructions, and users deposit native assets to chain-specific addresses. A 100-of-150 signing threshold means no single validator controls funds, but a colluding supermajority or failed authority rotation remains a risk. Lending adds another credit and liquidation layer. Chainflip calls the system trust-minimized; the architecture does not justify calling it trustless.', [
      claim('Validators combine State Chain consensus with external-chain observation and signing duties.', ['source:chainflip:validators', 'source:chainflip:security'], 'Validator role and governance documents.'),
      claim('The architecture is trust-minimized rather than free of validator trust.', ['source:chainflip:security', 'source:chainflip:validators'], 'Threshold control assumptions.', { confidence: 'high', kind: 'inference' }),
    ]),
    token_and_value_capture: section('FLIP is used for validator staking and network economics. CoinGecko observed a $0.334808 price, $29.66 million market capitalization and $29.94 million fully diluted value on 2026-08-03, about 96.47% below the recorded all-time high. Current docs still describe elastic supply, authority emissions and buy-and-burn behavior, while FLIP 2.1 describes a fixed-supply, buy-and-distribute future. Until mainnet activation is reconciled, both models cannot be presented as simultaneously live.', [
      claim('FLIP market capitalization was $29,662,615 at the observation date.', ['source:chainflip:market'], 'CoinGecko market_data.market_cap.usd.', { value: 29662615 }),
      claim('The current docs and FLIP 2.1 proposal describe materially different token models.', ['source:chainflip:economics', 'source:chainflip:flip21'], 'Current and proposed economic mechanisms.', { kind: 'unknown' }),
    ]),
    counterfactual: section('Chainflip could have deployed as contracts on one host chain and bridged assets into that environment. That would reuse existing validators and tooling, but native-asset custody would still require cross-chain controls. It could also increase validator-set size, reducing concentration while making threshold ceremonies and performance harder. A simpler swap-only scope might reduce risk but give up lending revenue. These are trade-offs; the measurable test is reliability, liquidity depth and net economics across market cycles.', [
      claim('A host-chain deployment would reuse consensus while preserving some cross-chain custody risk.', ['source:chainflip:overview', 'source:chainflip:security'], 'Dedicated-network and vault design.', { confidence: 'medium', kind: 'counterfactual' }),
      claim('A larger authority set could reduce concentration while increasing threshold coordination cost.', ['source:chainflip:validators'], 'Current authority-set and signing design.', { confidence: 'medium', kind: 'counterfactual' }),
    ]),
    risks_and_unknowns: section('The major risks are threshold-key compromise, validator concentration, supported-chain reorgs, liquidity imbalance, lending losses and token-model transition. Large turnover against modest TVL can indicate capital efficiency, but can also create slippage and stress during one-sided flow. We lack a complete entity map of validators, independently reconciled operator costs, repeat-trader cohorts and proof that FLIP 2.1 is active. These unknowns limit confidence even though the product is operating.', [
      claim('Vault security depends on validator threshold integrity and supported-chain behavior.', ['source:chainflip:security', 'source:chainflip:validators'], 'Published security model.'),
      claim('Validator ownership, complete costs, user retention and FLIP 2.1 activation remain unresolved.', ['source:chainflip:economics', 'source:chainflip:flip21', 'source:chainflip:volume'], 'Current sources do not reconcile these fields.', { kind: 'unknown' }),
    ]),
    lifecycle: section('Chainflip is a functioning but middling exchange network. It has survived launch, processed more than $300 million of recent monthly volume and continued shipping products. At the same time, capital is below peak, recent volume is contracting and the token trades far below its high. The next stage is economic proof: repeat traders, reliable vault operations and sustainable validator rewards must persist without continual token redesign. Current evidence supports relevance, not dominance or failure.', [
      claim('Chainflip remains active with material volume and a recent product release.', ['source:chainflip:volume', 'source:chainflip:lending'], 'Current flow and dated release.'),
      claim('Capital and token drawdowns plus weaker monthly volume support a middling call.', ['source:chainflip:tvl', 'source:chainflip:volume', 'source:chainflip:market'], 'Market and network observations.', { confidence: 'medium', kind: 'inference' }),
    ]),
    outlook_and_watch: section('The base case is continued niche use for native cross-chain swaps with volatile monthly volume. The call improves if liquidity deepens, repeat traders grow, vault and lending incidents remain limited and the token model is activated transparently. Watch volume beside slippage and TVL, plus validator entities, signing failures, bad debt, fees, revenue and FLIP flows. The call weakens if volume keeps falling, a threshold incident hits user funds or token-model changes fail to sustain validators.', [
      claim('Liquidity depth, repeat trading and reliable vault operations would strengthen the outlook.', ['source:chainflip:overview', 'source:chainflip:tvl', 'source:chainflip:volume'], 'Current product and market baseline.', { confidence: 'medium', kind: 'inference' }),
      claim('Token-model activation and lending losses require separate monitoring.', ['source:chainflip:flip21', 'source:chainflip:lending'], 'Proposed economics and new credit product.', { confidence: 'medium', kind: 'inference' }),
    ]),
  },
  metrics: [
    metric('tvl-latest', 'tvl', 'TVL', 12877066, ['source:chainflip:tvl'], 'Latest historicalChainTvl point.'),
    metric('dex-volume-30d', 'dex_spot_volume', 'Exchange volume (30d)', 313755771, ['source:chainflip:volume'], 'total30d.', ['not_unique_users']),
    metric('fees-30d', 'fees', 'Fees (30d)', 968623, ['source:chainflip:fees'], 'total30d.'),
    metric('revenue-30d', 'protocol_revenue', 'Protocol revenue (30d)', 174551, ['source:chainflip:revenue'], 'total30d.', ['gross_fees_not_profit']),
    metric('token-price', 'token_price', 'FLIP price', 0.334808, ['source:chainflip:market'], 'current_price.usd.'),
    metric('token-market-cap', 'token_market_cap', 'FLIP market capitalization', 29662615, ['source:chainflip:market'], 'market_cap.usd.'),
    metric('token-fdv', 'token_fdv', 'FLIP fully diluted value', 29939152, ['source:chainflip:market'], 'fully_diluted_valuation.usd.'),
  ],
  events: [
    event('peak-tvl', 'market_event', '2024-12-09', 'Chainflip reached the maximum TVL point in the reviewed series.', ['source:chainflip:tvl'], 'Historical series maximum.'),
    event('flip21', 'token_proposal', '2026-04-22', 'Chainflip published the FLIP 2.1 token-model proposal.', ['source:chainflip:flip21'], 'Dated proposal post.'),
    event('lending2', 'product_launch', '2026-07-16', 'Chainflip published Lending 2.0 as a live product.', ['source:chainflip:lending'], 'Dated product post.'),
  ],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama and CoinGecko', historical_tvl_point_date: AS_OF, latest_tvl_usd: 12877066, peak_tvl_usd: 22210323, peak_tvl_date: '2024-12-09', tvl_drawdown_pct: 42.02, dex_volume_30d_usd: 313755771, dex_volume_change_1m_pct: -43.15, fees_30d_usd: 968623, revenue_30d_usd: 174551 },
  forensicSummary: 'Chainflip is a middling cross-chain exchange network. It processed $313.76 million of 30-day volume, but volume fell 43.15% month over month, TVL remained 42.02% below peak and FLIP traded about 96.47% below its high.',
  forensicWhy: 'Native-asset swaps and focused infrastructure create real utility and capital efficiency. Threshold custody, limited validator membership, declining recent demand and unsettled token economics constrain the outcome. Aggregate volume does not prove trader retention or profitability.',
  whySources: ['source:chainflip:overview', 'source:chainflip:security', 'source:chainflip:validators', 'source:chainflip:tvl', 'source:chainflip:volume', 'source:chainflip:fees', 'source:chainflip:revenue'],
  choices: [
    { decision: 'Build a dedicated State Chain for native cross-chain swaps.', consequence: 'The product avoids wrapped assets while operating its own complex validator and vault system.', confidence: 'high', source_refs: ['source:chainflip:overview'] },
    { decision: 'Use a capped authority set and threshold vault signatures.', consequence: 'No single signer controls funds, but supermajority integrity remains critical.', confidence: 'high', source_refs: ['source:chainflip:security', 'source:chainflip:validators'] },
    { decision: 'Propose replacing elastic supply and burns with fixed supply and buy-and-distribute staking.', consequence: 'Staking may align with revenue, but transition and activation must be verified.', confidence: 'high', source_refs: ['source:chainflip:economics', 'source:chainflip:flip21'] },
  ],
  forensicCounterfactual: 'A host-chain deployment would reuse consensus but keep cross-chain custody risk. A larger validator set could reduce concentration while slowing signing. Durable liquidity and incident-free operation are the observable tests.',
  counterfactualSources: ['source:chainflip:overview', 'source:chainflip:security', 'source:chainflip:validators'],
  watch: [
    { signal: 'Volume, TVL, slippage, repeat traders, fees and retained revenue.', implication: 'Broad persistence would support durable exchange demand.', source_refs: ['source:chainflip:tvl', 'source:chainflip:volume', 'source:chainflip:fees', 'source:chainflip:revenue'] },
    { signal: 'Validator entities, vault incidents, lending bad debt and FLIP 2.1 activation.', implication: 'Reliable controls and reconciled economics would reduce current risk.', source_refs: ['source:chainflip:validators', 'source:chainflip:security', 'source:chainflip:lending', 'source:chainflip:flip21'] },
  ],
  unknowns: [
    ['How concentrated is the authority set by beneficial owner?', 'An independently verified entity-level validator map.'],
    ['How many repeat traders use Chainflip without incentives?', 'A two-quarter cohort study.'],
    ['When is FLIP 2.1 fully active in production?', 'Mainnet parameters and token-flow reconciliation.'],
    ['What are validator and operator costs after incentives?', 'A complete independently reconciled income statement.'],
  ],
};

const unichainSpec = {
  slug: 'unichain', name: 'Unichain', aliases: ['Uniswap Unichain'],
  classification: { subtype: 'DeFi-focused Ethereum layer 2', tags: ['op_stack', 'uniswap', 'defi', 'flashblocks'], chains: ['Ethereum'], jurisdictions: [] },
  outcome: 'declining', forensicOutcome: 'declining', outcomeConfidence: 'high', qualityConfidence: 'medium', sources: unichainSources,
  statusSources: ['source:unichain:mainnet', 'source:unichain:flashblocks', 'source:unichain:l2beat'],
  statusLocator: 'Mainnet and Flashblocks launches plus the current independent risk page show an operating rollup.',
  outcomeSources: ['source:unichain:tvl', 'source:unichain:stables', 'source:unichain:volume', 'source:unichain:fees', 'source:unichain:revenue', 'source:unichain:l2beat'],
  outcomeLocator: 'Capital, activity, economics and control risks were reviewed together.',
  sections: {
    what_it_is: section('Unichain is Uniswap’s Ethereum layer 2 for DeFi. It uses the OP Stack, pays gas in ETH and settles transaction data to Ethereum. Uniswap supplies the distribution and liquidity brand; Flashblocks gives users roughly 200 millisecond preconfirmations, while TEE priority ordering is designed to reduce harmful transaction reordering. This is a live rollup, but its planned Unichain Validation Network must not be confused with current production control.', [
      claim('Unichain is an OP Stack Ethereum layer 2 using ETH for gas.', ['source:unichain:mainnet', 'source:unichain:l2beat'], 'Launch architecture and current independent project page.'),
      claim('Flashblocks are live, while the validation network remains a separate design objective.', ['source:unichain:flashblocks', 'source:unichain:whitepaper'], 'Production launch and whitepaper design.', { kind: 'unknown' }),
    ]),
    what_happened: section('Unichain launched mainnet in February 2025 and activated Flashblocks in August 2025. TVL peaked at $902.86 million in July 2025, then fell to $27.16 million by 2026-08-03, a 96.99% drawdown. Dollar stablecoins were also about $27.16 million. Thirty-day DEX volume was $216.97 million, down 54.59% month over month. Fees were $434,964.34, while provider-reported retained revenue was only $3,627.30. UNIfication later activated Uniswap protocol fees and routes Unichain sequencer net fees toward UNI burns.', [
      claim('Unichain mainnet launched in February 2025 and Flashblocks went live in August 2025.', ['source:unichain:mainnet', 'source:unichain:flashblocks'], 'Dated product announcements.'),
      claim('TVL fell from $902,862,383 to $27,160,961 by the review date.', ['source:unichain:tvl'], 'Maximum and latest daily TVL points.', { value: 'peak 902862383; latest 27160961' }),
    ]),
    why_this_outcome: section('Uniswap gave Unichain immediate awareness and a natural source of order flow. Fast confirmations and low fees improve trading experience, but brand distribution did not make peak capital sticky. The 96.99% TVL drawdown and weaker recent volume show that users can still prefer liquidity on Base, Arbitrum, Ethereum or other venues. UNIfication improves the link between chain use and UNI, but current retained revenue is very small. The evidence supports an active but declining chain, not a failed product and not a mature DeFi hub.', [
      claim('Uniswap distribution and faster execution plausibly support continued trading activity.', ['source:unichain:mainnet', 'source:unichain:flashblocks', 'source:unichain:volume'], 'Product distribution and current flow.', { confidence: 'medium', kind: 'inference' }),
      claim('Current aggregates do not isolate organic users, incentives or liquidity migration among Uniswap venues.', ['source:unichain:tvl', 'source:unichain:volume'], 'Provider fields lack acquisition and cohort data.', { kind: 'unknown' }),
    ]),
    strategic_choices: section('Uniswap built its own rollup rather than remaining chain-neutral. It reused the OP Stack, prioritized sub-second trading experience and added TEE-based ordering through Rollup-Boost. UNIfication then turned on protocol fees, burned 100 million UNI and routes net sequencer fees toward further burns. These choices give Uniswap more control over execution and value capture. They also create tension: Uniswap still serves many chains, while Unichain competes for the same liquidity and depends on concentrated rollup operations.', [
      claim('Uniswap chose a dedicated OP Stack rollup with Flashblocks and TEE priority ordering.', ['source:unichain:mainnet', 'source:unichain:flashblocks', 'source:unichain:rollupboost'], 'Launch and production feature descriptions.'),
      claim('UNIfication activated fee changes, a 100 million UNI burn and sequencer-fee burn routing.', ['source:unichain:unification'], 'Executed governance outcome and economic changes.', { value: 100000000 }),
    ]),
    operating_model: section('A centralized sequencer currently orders transactions, and Rollup-Boost adds priority ordering and Flashblocks preconfirmations. Ethereum provides data availability and settlement, but L2BEAT still identifies centralized sequencing, MEV and no-delay upgrade paths. The rollup was Stage 1 at the review date, which is progress but not full decentralization. The whitepaper’s validation-network design is a future control model until independently verified on mainnet.', [
      claim('Unichain currently relies on centralized sequencing and no-delay upgrade controls.', ['source:unichain:l2beat'], 'Current operator and upgrade-risk panels.'),
      claim('The Unichain Validation Network was not verified as a live production control in this review.', ['source:unichain:whitepaper', 'source:unichain:l2beat'], 'Whitepaper design versus current independent controls.', { kind: 'unknown' }),
    ]),
    token_and_value_capture: section('Unichain has no separate gas token; users pay ETH. UNI governs the Uniswap system and UNIfication links protocol fees and net Unichain sequencer fees to UNI burns. That is a stronger economic link than pure governance, but it is not a contractual claim on Uniswap Labs revenue. Low retained chain revenue means the burn effect depends on future fee scale. The planned validation network may add UNI staking utility, but it should remain labeled as planned until production evidence exists.', [
      claim('Unichain uses ETH for gas and UNIfication routes net sequencer fees toward UNI burns.', ['source:unichain:mainnet', 'source:unichain:unification'], 'Launch gas model and governance execution.'),
      claim('Production UNI staking through the planned validation network was not verified.', ['source:unichain:whitepaper', 'source:unichain:l2beat'], 'Future design compared with current controls.', { kind: 'unknown' }),
    ]),
    counterfactual: section('Uniswap could have stayed entirely chain-neutral and invested only in deployments across existing networks. That would avoid rollup operating risk but surrender execution control and sequencer economics. It could also delay advanced ordering until broader decentralization, reducing trust assumptions while losing speed. None of these choices guarantees more liquidity. The useful comparison is whether Unichain produces incremental traders and retained capital rather than merely moving existing Uniswap activity between chains.', [
      claim('Remaining chain-neutral would reduce rollup responsibility while giving up direct execution control.', ['source:unichain:mainnet', 'source:unichain:unification'], 'Documented reasons and economics for the dedicated chain.', { confidence: 'medium', kind: 'counterfactual' }),
      claim('Delaying advanced ordering could reduce early trust while sacrificing trading speed.', ['source:unichain:flashblocks', 'source:unichain:rollupboost', 'source:unichain:l2beat'], 'Feature and risk trade-off.', { confidence: 'medium', kind: 'counterfactual' }),
    ]),
    risks_and_unknowns: section('The largest risks are liquidity fragmentation, centralized sequencing, TEE dependence, upgrade authority and weak retained economics. L2BEAT also recorded a transaction-data anomaly on June 25, 2026, reinforcing the need to monitor liveness as well as settlement. Current volume does not reveal repeat traders or activity moved from other Uniswap deployments. We also lack a reconciled statement of sequencer costs, burn flows and the validation network’s live status.', [
      claim('Unichain retains centralized operator, TEE and upgrade-control risks.', ['source:unichain:l2beat', 'source:unichain:rollupboost'], 'Current risk panels and ordering architecture.'),
      claim('Repeat traders, incremental activity and complete sequencer economics remain unresolved.', ['source:unichain:volume', 'source:unichain:revenue'], 'Current provider aggregates omit those fields.', { kind: 'unknown' }),
    ]),
    lifecycle: section('Unichain is operating but declining. It shipped mainnet, Flashblocks and fee-linked UNI burns, so the product is more than a roadmap. Yet TVL is almost 97% below peak, stablecoin supply is small and recent DEX volume is falling. The next lifecycle test is whether Uniswap’s distribution can rebuild sticky liquidity while control broadens and retained economics improve. Until then, strong product execution and weak capital retention coexist.', [
      claim('Unichain has delivered mainnet, Flashblocks and executed fee changes.', ['source:unichain:mainnet', 'source:unichain:flashblocks', 'source:unichain:unification'], 'Dated product and governance milestones.'),
      claim('The TVL drawdown and weaker monthly volume support a declining lifecycle call.', ['source:unichain:tvl', 'source:unichain:volume'], 'Peak-to-latest TVL and change_1m.', { confidence: 'high', kind: 'inference' }),
    ]),
    outlook_and_watch: section('The base case is a fast Uniswap-centered rollup with meaningful flow but limited retained capital. The call improves if TVL and stablecoins recover, independent applications add users, sequencer fee burns become material and control decentralizes. Watch volume by venue, repeat traders, net liquidity inflows, fees, retained revenue, burn transactions, sequencer incidents and upgrade changes. The call worsens if activity keeps migrating elsewhere or if speed remains dependent on concentrated controls without durable economics.', [
      claim('Recovered capital, independent applications and material fee burns would strengthen the outlook.', ['source:unichain:tvl', 'source:unichain:volume', 'source:unichain:unification', 'source:unichain:revenue'], 'Current market and economics baseline.', { confidence: 'medium', kind: 'inference' }),
      claim('Sequencer, TEE, upgrade and validation-network controls require continued review.', ['source:unichain:l2beat', 'source:unichain:rollupboost', 'source:unichain:whitepaper'], 'Current and planned operating controls.', { confidence: 'medium', kind: 'inference' }),
    ]),
  },
  metrics: [
    metric('tvl-latest', 'tvl', 'TVL', 27160961, ['source:unichain:tvl'], 'Latest historicalChainTvl point.'),
    metric('stablecoins-latest', 'stablecoin_supply', 'Dollar stablecoin supply', 27162079.679891188, ['source:unichain:stables'], 'peggedUSD field.'),
    metric('dex-volume-30d', 'dex_spot_volume', 'DEX volume (30d)', 216967639.41, ['source:unichain:volume'], 'total30d.', ['not_unique_users']),
    metric('fees-30d', 'fees', 'Fees (30d)', 434964.34, ['source:unichain:fees'], 'total30d.'),
    metric('revenue-30d', 'protocol_revenue', 'Protocol revenue (30d)', 3627.3, ['source:unichain:revenue'], 'total30d.', ['gross_fees_not_profit']),
  ],
  events: [
    event('mainnet', 'launch', '2025-02-11', 'Uniswap announced Unichain mainnet.', ['source:unichain:mainnet'], 'Dated launch announcement.'),
    event('flashblocks', 'architecture_upgrade', '2025-08-14', 'Unichain activated Flashblocks in production.', ['source:unichain:flashblocks'], 'Dated feature launch.'),
    event('unification', 'governance', '2025-12-26', 'UNIfication executed the 100 million UNI burn and fee changes.', ['source:unichain:unification'], 'Published execution update.'),
  ],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama and L2BEAT', historical_tvl_point_date: AS_OF, latest_tvl_usd: 27160961, peak_tvl_usd: 902862383, peak_tvl_date: '2025-07-21', tvl_drawdown_pct: 96.99, stablecoin_supply: { pegged_usd: 27162079.679891188 }, dex_volume_30d_usd: 216967639.41, dex_volume_change_1m_pct: -54.59, fees_30d_usd: 434964.34, revenue_30d_usd: 3627.3 },
  forensicSummary: 'Unichain is an operating but declining DeFi rollup. TVL was $27.16 million on 2026-08-03, 96.99% below peak, and 30-day DEX volume was down 54.59% month over month. Mainnet, Flashblocks and UNI fee burns are live, but retained capital and revenue remain weak.',
  forensicWhy: 'Uniswap distribution and fast execution create a credible product, but they have not retained peak capital. Users can access Uniswap liquidity on competing chains, while centralized sequencing and very low retained revenue limit maturity. Planned validation must remain separate from current controls.',
  whySources: ['source:unichain:mainnet', 'source:unichain:flashblocks', 'source:unichain:rollupboost', 'source:unichain:unification', 'source:unichain:l2beat', 'source:unichain:tvl', 'source:unichain:volume', 'source:unichain:revenue'],
  choices: [
    { decision: 'Build a dedicated Uniswap OP Stack rollup.', consequence: 'Uniswap gains execution control and sequencer economics while assuming rollup risk.', confidence: 'high', source_refs: ['source:unichain:mainnet'] },
    { decision: 'Launch Flashblocks and TEE priority ordering.', consequence: 'Trading feels faster while users depend on additional operator and hardware assumptions.', confidence: 'high', source_refs: ['source:unichain:flashblocks', 'source:unichain:rollupboost', 'source:unichain:l2beat'] },
    { decision: 'Route protocol and net sequencer fees toward UNI burns.', consequence: 'UNI gains a clearer economic link, but materiality depends on future fees.', confidence: 'high', source_refs: ['source:unichain:unification', 'source:unichain:revenue'] },
  ],
  forensicCounterfactual: 'Remaining chain-neutral would avoid rollup risk while giving up control and sequencer economics. Delaying fast ordering could reduce trust assumptions while losing speed. Incremental users and retained liquidity are the practical tests.',
  counterfactualSources: ['source:unichain:mainnet', 'source:unichain:flashblocks', 'source:unichain:l2beat', 'source:unichain:unification'],
  watch: [
    { signal: 'TVL, stablecoins, venue-level volume, repeat traders, fees and retained revenue.', implication: 'Broad recovery would support durable demand rather than shifted activity.', source_refs: ['source:unichain:tvl', 'source:unichain:stables', 'source:unichain:volume', 'source:unichain:fees', 'source:unichain:revenue'] },
    { signal: 'Sequencer incidents, TEE behavior, upgrade delays and live validation controls.', implication: 'Broader verified control would reduce current rollup risk.', source_refs: ['source:unichain:l2beat', 'source:unichain:rollupboost', 'source:unichain:whitepaper'] },
  ],
  unknowns: [
    ['How much activity is incremental rather than moved from other Uniswap venues?', 'Cross-chain trader and liquidity cohorts.'],
    ['What are sequencer costs and net fee burns after all obligations?', 'A reconciled on-chain and operator cash-flow statement.'],
    ['When is the validation network a live production control?', 'Independent mainnet control-path verification.'],
    ['How dependent are Flashblocks and ordering on single operators and TEEs?', 'An entity-level failure and control map.'],
  ],
};

const specs = [seiSpec, provenanceSpec, flareSpec, chainflipSpec, unichainSpec];
const cases = specs.map((spec) => ({
  chain: spec.name,
  slug: spec.slug,
  sources: spec.sources,
  canonical_profile: buildProfile(spec),
  forensic_analysis: buildForensic(spec),
}));

const document = {
  schema: 'chaindump-chain-causal-completion-v2',
  research_as_of: AS_OF,
  generated_migration: '0082_chain_causal_completion_wave_e.sql',
  methodology: {
    scope: 'Canonical ten-section blockchain profiles for Sei, Provenance, Flare, Chainflip and Unichain.',
    observation_rule: `Volatile provider fields were fetched between ${OBSERVED_AT} and ${ACCESSED_AT}. Exact values remain point-in-time observations.`,
    evidence_rule: 'Official sources establish documented design and decisions. Independent sources test market outcomes and control assumptions. Aggregate metrics do not prove causality or user retention.',
    claim_rule: 'Each customer section has bounded atomic claims with source references, evidence locators, confidence, fact/inference/unknown labels and pending human review.',
    preservation_rule: 'Migration 0082 preserves legacy facts and analysis fields while adding forensic analysis, review metadata and an embedded canonical profile. Sources merge by URL.',
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
  return `-- Generated by scripts/render-chain-causal-wave-0082.mjs.
-- Adds Wave E review-state canonical profiles without overwriting legacy dossiers.
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

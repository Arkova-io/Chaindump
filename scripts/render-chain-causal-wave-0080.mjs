#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYSIS_SECTION_KEYS, validateEntityProfile } from '../src/lib/entity-profile.js';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(root, 'docs/chain-causal-completion-wave-d-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0080_chain_causal_completion_wave_d.sql');
const AS_OF = '2026-08-03';
const ACCESSED_AT = '2026-08-03T18:22:33.937Z';
const NEXT_REVIEW_AT = '2026-08-10T18:22:33.937Z';
const OBSERVED_AT = '2026-08-03T18:22:33.405Z';
const MAX_D1_STATEMENT_BYTES = 95_000;

const rolling = (end, definition) => ({ start: null, end, definition });

function source(slug, key, title, url, publisher, {
  publishedAt = null,
  tier = 'B',
  role = 'primary',
  locator,
} = {}) {
  return {
    id: `source:${slug}:${key}`,
    title,
    url,
    publisher,
    published_at: publishedAt,
    accessed_at: ACCESSED_AT,
    archive_url: null,
    tier,
    role,
    access_state: 'reachable',
    checked_at: ACCESSED_AT,
    content_hash: null,
    evidence_locator: locator || 'The reviewed page and its current dated or versioned content.',
  };
}

function section(body, claims) {
  return { body, claims };
}

function claim(assertion, sourceIds, evidenceLocator, {
  value = assertion,
  confidence = 'high',
  kind = 'fact',
  supportDirection = 'supports',
  note = null,
} = {}) {
  return {
    assertion,
    value,
    source_ids: sourceIds,
    evidence_locator: evidenceLocator,
    confidence,
    kind,
    support_direction: supportDirection,
    note,
  };
}

function metric(key, dimension, label, value, sourceIds, method, qualityFlags = []) {
  return {
    key,
    dimension,
    label,
    value,
    unit: 'usd',
    currency: 'USD',
    window: rolling(AS_OF, key.includes('30d') ? 'provider-reported rolling 30 days' : 'latest point'),
    as_of: AS_OF,
    method,
    scope: { product: 'blockchain network', chains: [] },
    source_ids: sourceIds,
    evidence_locator: `Provider response replayed during ${OBSERVED_AT}–${ACCESSED_AT}; exact value retained in this artifact.`,
    quality_flags: qualityFlags,
  };
}

function event(key, type, date, description, sourceIds, evidenceLocator) {
  return { key, type, date, description, source_ids: sourceIds, evidence_locator: evidenceLocator };
}

function buildProfile(spec) {
  const sectionEntries = Object.entries(spec.sections);
  const claims = [];
  const sectionEnvelopes = {};
  for (const [sectionKey, value] of sectionEntries) {
    const claimIds = value.claims.map((entry, index) => {
      const id = `claim:${spec.slug}:section:${sectionKey}:${index + 1}`;
      claims.push({
        id,
        // A section's claim ids support its published prose. Atomic claims live
        // in the top-level claims array; the section envelope itself exposes a
        // body, as_of date and claim_ids, not a nested claims collection.
        field_path: `analysis.sections.${sectionKey}.body`,
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
    sectionEnvelopes[sectionKey] = { body: value.body, as_of: AS_OF, claim_ids: claimIds };
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
      assertion: `${spec.name} is classified ${spec.outcome.replaceAll('_', ' ')} as of ${AS_OF}.`,
      value: spec.outcome,
      as_of: AS_OF,
      confidence: spec.outcomeConfidence,
      kind: 'inference',
      source_ids: spec.outcomeSources,
      evidence_locator: spec.outcomeLocator,
      support_direction: 'supports',
      note: 'Analyst lifecycle classification; metrics describe the outcome but do not prove a single cause.',
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
      as_of: entry.as_of,
      confidence: 'high',
      kind: 'fact',
      source_ids: entry.source_ids,
      evidence_locator: entry.evidence_locator,
      support_direction: 'supports',
      note: 'Point-in-time provider observation; the provider may revise a same-day point.',
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
    identity: {
      id: `blockchain:${spec.slug}`,
      type: 'blockchain',
      slug: spec.slug,
      name: spec.name,
      aliases: spec.aliases || [],
    },
    classification: spec.classification,
    status: { operating_state: 'operating', as_of: AS_OF, claim_ids: [statusClaimId] },
    outcome: {
      label: spec.outcome,
      as_of: AS_OF,
      rule_id: 'blockchain-lifecycle-v1',
      confidence: spec.outcomeConfidence,
      claim_ids: [outcomeClaimId],
    },
    analysis: { sections: sectionEnvelopes },
    metrics,
    events,
    sources: spec.sources,
    claims,
    freshness: {
      state: 'current',
      last_reviewed_at: ACCESSED_AT,
      next_review_at: NEXT_REVIEW_AT,
      field_reviews: [],
    },
    quality: {
      publication_state: 'review',
      completeness_pct: 100,
      confidence: spec.qualityConfidence,
      unsourced_fields: [],
    },
    extensions: {
      legacy_origin: 'chain_analysis_and_chain_facts',
      observation_window: { started_at: OBSERVED_AT, completed_at: ACCESSED_AT },
      explicit_unknowns: spec.unknowns,
      methodology_notes: [
        'Every material field is attached to atomic pending claims; a human must review those claims before publication state can become published.',
        'TVL is not liquidity, stablecoin supply is not payment volume, DEX volume is not retained users, fees are not profit, and token price is not product success.',
        'Documented decisions, observed outcomes, analyst inferences, and unresolved unknowns are kept separate.',
      ],
    },
  };
}

function buildForensic(spec) {
  return {
    version: 'forensic-analysis-v1',
    observation_snapshot: spec.snapshot,
    outcome: {
      label: spec.forensicOutcome,
      summary: spec.forensicSummary,
      confidence: spec.outcomeConfidence,
      as_of: AS_OF,
      source_refs: spec.outcomeSources,
    },
    why: {
      summary: spec.forensicWhy,
      confidence: 'medium',
      source_refs: spec.whySources,
    },
    strategic_choices: spec.choices,
    counterfactual: {
      summary: spec.forensicCounterfactual,
      confidence: 'medium',
      source_refs: spec.counterfactualSources,
    },
    watch: spec.watch,
    unknowns: spec.unknowns.map(([question, resolution_trigger]) => ({ question, resolution_trigger })),
    review: {
      status: 'current',
      last_reviewed_at: AS_OF,
      next_review_at: '2026-08-10',
      reviewer: 'chaindump-research-desk',
    },
  };
}

const xLayerSources = [
  source('x-layer', 'launch', 'OKX launches X Layer mainnet', 'https://www.okx.com/en-gb/learn/x-layer-mainnet', 'OKX', { publishedAt: '2024-04-16', locator: 'Launch announcement: mainnet, Polygon CDK, Ethereum L2 and OKB gas.' }),
  source('x-layer', 'pp', 'X Layer PP upgrade and OKB gas model', 'https://www.okx.com/en-gb/help/announcement-on-the-pp-upgrade-of-x-layer-and-optimisation-of-the-okb-gas', 'OKX', { publishedAt: '2025-08-13', locator: 'Upgrade terms: fixed 21 million OKB supply and the revised gas model.' }),
  source('x-layer', 'jovian', 'X Layer activates Jovian upgrade', 'https://web3.okx.com/learn/x-layer-activates-jovian-upgrade', 'OKX Wallet', { publishedAt: '2026-06-30', locator: 'Current OP Stack architecture, 0.02 Gwei minimum base fee and upgrade description.' }),
  source('x-layer', 'l2beat', 'X Layer risk analysis', 'https://l2beat.com/scaling/projects/xlayer', 'L2BEAT', { tier: 'A', role: 'independent', locator: 'Current technology, bridge, data availability, proposer, challenger and upgrade-risk panels.' }),
  source('x-layer', 'tvl', 'X Layer historical TVL API', 'https://api.llama.fi/v2/historicalChainTvl/X%20Layer', 'DefiLlama', { role: 'independent', locator: 'Latest point and maximum point in the returned daily TVL series.' }),
  source('x-layer', 'fees', 'X Layer fees API', 'https://api.llama.fi/overview/fees/X%20Layer?dataType=dailyFees', 'DefiLlama', { role: 'independent', locator: 'total30d returned by the chain fees adapter.' }),
  source('x-layer', 'revenue', 'X Layer revenue API', 'https://api.llama.fi/overview/fees/X%20Layer?dataType=dailyRevenue', 'DefiLlama', { role: 'independent', locator: 'total30d returned by the chain revenue adapter.' }),
  source('x-layer', 'volume', 'X Layer DEX volume API', 'https://api.llama.fi/overview/dexs/X%20Layer?dataType=dailyVolume', 'DefiLlama', { role: 'independent', locator: 'total30d returned by the DEX adapter.' }),
  source('x-layer', 'stables', 'Stablecoin supply by chain API', 'https://stablecoins.llama.fi/stablecoinchains', 'DefiLlama', { role: 'independent', locator: 'X Layer row and peggedUSD field.' }),
  source('x-layer', 'okb', 'OKB market data', 'https://api.coingecko.com/api/v3/coins/okb', 'CoinGecko', { role: 'aggregator', locator: 'market_data current_price, market_cap, ath and circulating/total supply fields.' }),
];

const plasmaSources = [
  source('plasma', 'launch', 'Plasma mainnet beta and XPL', 'https://www.plasma.org/company/blog/plasma-mainnet-beta-and-xpl', 'Plasma', { publishedAt: '2025-09-18', locator: 'September 25 launch date, announced day-one liquidity, partners and zero-fee USDT scope.' }),
  source('plasma', 'sale', 'XPL public sale and ecosystem role', 'https://www.plasma.org/vi/company/blog/xpl-the-public-sale-and-its-role-in-the-plasma-ecosystem', 'Plasma', { publishedAt: '2025-06-24', locator: '$50 million cap, $373 million commitments and initial token allocation.' }),
  source('plasma', 'docs', 'Why build on Plasma', 'https://docs.plasma.to/docs/get-started/why-build-on-plasma/overview', 'Plasma', { locator: 'Current stablecoin-first EVM design, payment and gas experience.' }),
  source('plasma', 'one', 'Introducing Plasma One', 'https://www.plasma.org/company/blog/introducing-plasma-one-the-one-app-for-your-money', 'Plasma', { publishedAt: '2025-09-22', locator: 'Integrated consumer app, card, savings and payments positioning.' }),
  source('plasma', 'tvl', 'Plasma historical TVL API', 'https://api.llama.fi/v2/historicalChainTvl/Plasma', 'DefiLlama', { role: 'independent', locator: 'Latest point and maximum point in the returned daily TVL series.' }),
  source('plasma', 'fees', 'Plasma fees API', 'https://api.llama.fi/overview/fees/Plasma?dataType=dailyFees', 'DefiLlama', { role: 'independent', locator: 'total30d returned by the chain fees adapter.' }),
  source('plasma', 'revenue', 'Plasma revenue API', 'https://api.llama.fi/overview/fees/Plasma?dataType=dailyRevenue', 'DefiLlama', { role: 'independent', locator: 'total30d returned by the chain revenue adapter.' }),
  source('plasma', 'volume', 'Plasma DEX volume API', 'https://api.llama.fi/overview/dexs/Plasma?dataType=dailyVolume', 'DefiLlama', { role: 'independent', locator: 'total30d and change_1m returned by the DEX adapter.' }),
  source('plasma', 'stables', 'Stablecoin supply by chain API', 'https://stablecoins.llama.fi/stablecoinchains', 'DefiLlama', { role: 'independent', locator: 'Plasma row and pegged assets fields.' }),
  source('plasma', 'xpl', 'Plasma token market data', 'https://api.coingecko.com/api/v3/coins/plasma', 'CoinGecko', { role: 'aggregator', locator: 'market_data current price, market cap, FDV, ATH and supply fields.' }),
];

const megaSources = [
  source('megaeth', 'token', 'MEGA token', 'https://www.megaeth.com/token', 'MegaETH', { locator: 'KPI milestones, April 2026 token launch, allocation and planned utility.' }),
  source('megaeth', 'live', 'MEGA is live', 'https://www.megaeth.com/blog-news/mega-is-live', 'MegaETH', { publishedAt: '2026-04-30', locator: 'Token launch and current campaign description.' }),
  source('megaeth', 'architecture', 'MegaETH architecture', 'https://docs.megaeth.com/architecture', 'MegaETH', { locator: 'Sequencer, replica, full-node, prover and data-availability roles.' }),
  source('megaeth', 'realtime', 'MegaETH realtime API', 'https://docs.megaeth.com/realtime-api', 'MegaETH', { locator: '10 millisecond mini-block preconfirmation behavior and limitations.' }),
  source('megaeth', 'l2beat', 'MegaETH risk analysis', 'https://l2beat.com/scaling/projects/megaeth', 'L2BEAT', { tier: 'A', role: 'independent', locator: 'Current stage, upgrade, program-hash and liveness risk panels.' }),
  source('megaeth', 'tvl', 'MegaETH historical TVL API', 'https://api.llama.fi/v2/historicalChainTvl/MegaETH', 'DefiLlama', { role: 'independent', locator: 'Latest point and maximum point in the returned daily TVL series.' }),
  source('megaeth', 'fees', 'MegaETH fees API', 'https://api.llama.fi/overview/fees/MegaETH?dataType=dailyFees', 'DefiLlama', { role: 'independent', locator: 'total30d returned by the chain fees adapter.' }),
  source('megaeth', 'revenue', 'MegaETH revenue API', 'https://api.llama.fi/overview/fees/MegaETH?dataType=dailyRevenue', 'DefiLlama', { role: 'independent', locator: 'total30d returned by the chain revenue adapter.' }),
  source('megaeth', 'volume', 'MegaETH DEX volume API', 'https://api.llama.fi/overview/dexs/MegaETH?dataType=dailyVolume', 'DefiLlama', { role: 'independent', locator: 'total30d and change_1m returned by the DEX adapter.' }),
  source('megaeth', 'stables', 'Stablecoin supply by chain API', 'https://stablecoins.llama.fi/stablecoinchains', 'DefiLlama', { role: 'independent', locator: 'MegaETH row and peggedUSD field.' }),
  source('megaeth', 'mega', 'MEGA market data', 'https://api.coingecko.com/api/v3/coins/megaeth', 'CoinGecko', { role: 'aggregator', locator: 'market_data current price, market cap, FDV, ATH and supply fields.' }),
];

const inkSources = [
  source('ink', 'announce', 'Announcing Ink', 'https://blog.kraken.com/news/announcing-ink', 'Kraken', { publishedAt: '2024-10-24', locator: 'Kraken-backed DeFi L2 purpose and OP Stack strategy.' }),
  source('ink', 'launch', 'Ink mainnet launch', 'https://blog.kraken.com/news/ink-mainnet-launch', 'Kraken', { publishedAt: '2024-12-18', locator: 'Mainnet launch date and early-launch statement.' }),
  source('ink', 'token', 'Integrating the INK token', 'https://blog.kraken.com/news/integrating-ink-token', 'Kraken', { publishedAt: '2025-06-18', locator: 'Planned token, purpose and future distribution language; not evidence of a completed TGE.' }),
  source('ink', 'points', 'Introducing Ink Points', 'https://blog.kraken.com/product/pro/introducing-ink-points', 'Kraken', { publishedAt: '2026-04-22', locator: 'Current loyalty-points program and earning mechanics.' }),
  source('ink', 'faq', 'Ink FAQ', 'https://docs.inkonchain.com/faq', 'Ink', { locator: 'Current token FAQ states that token information has not been announced there.' }),
  source('ink', 'l2beat', 'Ink risk analysis', 'https://l2beat.com/scaling/projects/ink', 'L2BEAT', { tier: 'A', role: 'independent', locator: 'Current Stage 1, sequencing, fault-proof, governance and upgrade-risk panels.' }),
  source('ink', 'tvl', 'Ink historical TVL API', 'https://api.llama.fi/v2/historicalChainTvl/Ink', 'DefiLlama', { role: 'independent', locator: 'Latest point and maximum point in the returned daily TVL series.' }),
  source('ink', 'fees', 'Ink fees API', 'https://api.llama.fi/overview/fees/Ink?dataType=dailyFees', 'DefiLlama', { role: 'independent', locator: 'total30d returned by the chain fees adapter.' }),
  source('ink', 'revenue', 'Ink revenue API', 'https://api.llama.fi/overview/fees/Ink?dataType=dailyRevenue', 'DefiLlama', { role: 'independent', locator: 'total30d returned by the chain revenue adapter.' }),
  source('ink', 'volume', 'Ink DEX volume API', 'https://api.llama.fi/overview/dexs/Ink?dataType=dailyVolume', 'DefiLlama', { role: 'independent', locator: 'total30d and change_1m returned by the DEX adapter.' }),
  source('ink', 'stables', 'Stablecoin supply by chain API', 'https://stablecoins.llama.fi/stablecoinchains', 'DefiLlama', { role: 'independent', locator: 'Ink row and peggedUSD field.' }),
];

const starknetSources = [
  source('starknet', 'launch', 'Starknet Alpha on mainnet', 'https://www.starknet.io/blog/starknet-alpha-now-on-mainnet/', 'Starknet', { publishedAt: '2021-11-29', locator: 'Alpha launch date and validity-rollup purpose.' }),
  source('starknet', 'roadmap', 'Starknet roadmap', 'https://www.starknet.io/roadmap/', 'Starknet', { locator: 'Current roadmap and phased decentralization plans.' }),
  source('starknet', 'incident-2025', 'Starknet incident report: September 2, 2025', 'https://www.starknet.io/blog/starknet-incident-report-september-2-2025/', 'Starknet', { publishedAt: '2025-09-08', locator: 'Sequencer transition, reorgs, degraded period, root causes and remediations.' }),
  source('starknet', 'incident-2026', 'Starknet incident report: January 5, 2026', 'https://www.starknet.io/blog/starknet-incident-report-january-5-2026/', 'Starknet', { publishedAt: '2026-01-16', locator: 'Invalid block, proof rejection, 18-minute reorg and downtime window.' }),
  source('starknet', 'strk', 'STRK token', 'https://docs.starknet.io/learn/protocol/strk', 'Starknet', { locator: 'STRK fees, staking and governance roles.' }),
  source('starknet', 'l2beat', 'Starknet risk analysis', 'https://l2beat.com/scaling/projects/starknet', 'L2BEAT', { tier: 'A', role: 'independent', locator: 'Current validity proof, data availability, operator, governance and upgrade-risk panels.' }),
  source('starknet', 'tvl', 'Starknet historical TVL API', 'https://api.llama.fi/v2/historicalChainTvl/Starknet', 'DefiLlama', { role: 'independent', locator: 'Latest point and maximum point in the returned daily TVL series.' }),
  source('starknet', 'fees', 'Starknet fees API', 'https://api.llama.fi/overview/fees/Starknet?dataType=dailyFees', 'DefiLlama', { role: 'independent', locator: 'total30d returned by the chain fees adapter.' }),
  source('starknet', 'revenue', 'Starknet revenue API', 'https://api.llama.fi/overview/fees/Starknet?dataType=dailyRevenue', 'DefiLlama', { role: 'independent', locator: 'total30d returned by the chain revenue adapter.' }),
  source('starknet', 'volume', 'Starknet DEX volume API', 'https://api.llama.fi/overview/dexs/Starknet?dataType=dailyVolume', 'DefiLlama', { role: 'independent', locator: 'total30d and change_1m returned by the DEX adapter.' }),
  source('starknet', 'stables', 'Stablecoin supply by chain API', 'https://stablecoins.llama.fi/stablecoinchains', 'DefiLlama', { role: 'independent', locator: 'Starknet row and peggedUSD field.' }),
  source('starknet', 'market', 'STRK market data', 'https://api.coingecko.com/api/v3/coins/starknet', 'CoinGecko', { role: 'aggregator', locator: 'market_data current price, market cap, FDV, ATH and supply fields.' }),
];

const xLayerSpec = {
  slug: 'x-layer',
  name: 'X Layer',
  aliases: ['OKX X Layer'],
  classification: { subtype: 'exchange-backed Ethereum layer 2', tags: ['op_stack', 'okx', 'okb_gas', 'agg_layer'], chains: ['Ethereum'], jurisdictions: [] },
  outcome: 'successful',
  forensicOutcome: 'successful',
  outcomeConfidence: 'medium',
  qualityConfidence: 'medium',
  sources: xLayerSources,
  statusSources: ['source:x-layer:jovian', 'source:x-layer:l2beat', 'source:x-layer:tvl'],
  statusLocator: 'The June 2026 upgrade announcement, current L2BEAT project page and 2026-08-03 TVL observation all describe an operating network.',
  outcomeSources: ['source:x-layer:tvl', 'source:x-layer:stables', 'source:x-layer:volume', 'source:x-layer:fees', 'source:x-layer:revenue', 'source:x-layer:l2beat'],
  outcomeLocator: 'Current capital, stablecoin, trading, fee and retained-revenue observations read alongside the independent control and exit-risk assessment.',
  sections: {
    what_it_is: section(
      'X Layer is OKX’s Ethereum layer 2. It uses the OP Stack for execution, posts transaction data to Ethereum and uses OKB for gas. OKX supplies the distribution: customers can move assets from a large centralized exchange into a low-cost on-chain environment. The chain also connects to Polygon’s AggLayer bridge. That mix makes X Layer an exchange-backed rollup rather than an independent base chain. It can inherit Ethereum data availability while still depending on OKX-aligned operators, contracts and product decisions. The practical question is not whether the network can process transactions—it can—but whether OKX distribution becomes durable third-party demand and whether that demand produces value beyond cheap activity.',
      [
        claim('X Layer currently runs OP Stack execution and posts data to Ethereum.', ['source:x-layer:jovian', 'source:x-layer:l2beat'], 'Jovian architecture section and L2BEAT technology/data-availability panels.'),
        claim('OKB is the gas token and OKX is the chain’s main distribution channel.', ['source:x-layer:launch', 'source:x-layer:pp'], 'Mainnet product description and PP gas-model announcement.'),
        claim('The AggLayer bridge remains a material dependency separate from Ethereum data availability.', ['source:x-layer:l2beat'], 'L2BEAT bridge and technology panels.'),
      ],
    ),
    what_happened: section(
      'OKX launched X Layer in April 2024 using Polygon CDK. In August 2025 it fixed OKB’s total supply at 21 million and revised the gas model. The later Jovian release moved current execution onto the OP Stack and set a very low 0.02 Gwei minimum base fee. By the 2026-08-03 observation, X Layer had reached a new TVL high of $111.14 million, held about $2.04 billion of dollar stablecoins and routed $1.04 billion of 30-day DEX volume. It collected $106,402.94 of 30-day fees but retained only $2,836.51 as provider-reported chain revenue. The activity is substantial, but its sudden growth and low revenue make quality and persistence more important than the headline.',
      [
        claim('X Layer launched in April 2024 with Polygon CDK and later moved current execution to OP Stack.', ['source:x-layer:launch', 'source:x-layer:jovian'], 'Dated launch and Jovian architecture announcements.'),
        claim('The latest TVL point was $111,137,879, the highest point in the reviewed series.', ['source:x-layer:tvl'], 'Latest and maximum returned daily TVL points.', { value: 111137879 }),
        claim('The 30-day DEX volume was $1,035,836,475.40 while 30-day retained revenue was $2,836.51.', ['source:x-layer:volume', 'source:x-layer:revenue'], 'Provider total30d fields.', { value: 'volume 1035836475.40; revenue 2836.51' }),
      ],
    ),
    why_this_outcome: section(
      'The strongest explanation is distribution plus cheap execution. OKX can place deposits, wallets and products in front of an existing exchange audience, while the OP Stack avoids building every rollup component from scratch. Fixing OKB supply and making it the gas asset gives that activity a visible token link. Those choices help explain why liquidity and volume can arrive quickly. They do not prove that users would stay without exchange promotion, that third-party builders choose X Layer on its own merits, or that the token captures the economic value of the network. The large gap between gross fees and retained revenue supports a “successful but still proving itself” call rather than a claim that activity already produces a durable business.',
      [
        claim('OKX distribution and reused rollup infrastructure are plausible drivers of rapid adoption.', ['source:x-layer:launch', 'source:x-layer:jovian', 'source:x-layer:tvl'], 'Operator distribution claims and independently observed capital growth.', { confidence: 'medium', kind: 'inference' }),
        claim('Current retained revenue is small relative to current fees and activity.', ['source:x-layer:fees', 'source:x-layer:revenue', 'source:x-layer:volume'], 'Provider 30-day aggregates.', { value: 'fees 106402.94; revenue 2836.51; volume 1035836475.40' }),
        claim('The evidence does not isolate organic demand from OKX-directed or campaign activity.', ['source:x-layer:volume', 'source:x-layer:launch'], 'Aggregate volume and operator distribution do not identify users or acquisition source.', { confidence: 'high', kind: 'unknown' }),
      ],
    ),
    strategic_choices: section(
      'OKX made four connected bets. It built a dedicated chain instead of only integrating public networks, giving it control over fees and product sequencing. It launched on Polygon CDK, then accepted migration cost to move current execution to OP Stack when the preferred architecture changed. It consolidated ecosystem utility around OKB, fixed supply at 21 million and made OKB the gas asset. Finally, it kept fees extremely low to favor adoption. These choices can make onboarding feel like an extension of the exchange and reduce friction for builders. They also make the chain’s identity, upgrade path and token demand unusually dependent on one corporate ecosystem. The migration is evidence of adaptability, but also evidence that the technical base is not immutable.',
      [
        claim('OKX chose a dedicated exchange-backed L2 and later migrated current execution from Polygon CDK to OP Stack.', ['source:x-layer:launch', 'source:x-layer:jovian'], 'Dated architecture announcements.'),
        claim('OKX fixed OKB supply at 21 million and retained it as the chain gas asset.', ['source:x-layer:pp', 'source:x-layer:jovian'], 'PP gas-model and Jovian fee descriptions.'),
        claim('The 0.02 Gwei minimum base fee prioritizes cheap use over immediate fee capture.', ['source:x-layer:jovian', 'source:x-layer:revenue'], 'Published minimum fee and observed low retained revenue.', { confidence: 'medium', kind: 'inference' }),
      ],
    ),
    operating_model: section(
      'Users submit transactions to an OP Stack rollup operated through X Layer’s current infrastructure. Transaction data is posted to Ethereum, while sequencing, proposal and challenge roles remain permissioned in the reviewed L2BEAT assessment. The chain also uses an AggLayer bridge path, creating a separate bridge trust surface. L2BEAT reports OP Succinct Lite was activated on 2026-06-30, but also reports no practical user exit window before some upgrades and no delay on certain X Layer changes. In plain terms: Ethereum data posting improves verifiability, but it does not eliminate operator, bridge or upgrade control. This is a common rollup trade-off—fast coordinated development now, with decentralization and credible exits still incomplete.',
      [
        claim('X Layer uses Ethereum for on-chain data availability.', ['source:x-layer:l2beat'], 'L2BEAT data-availability panel.'),
        claim('The reviewed proposer and challenger roles are permissioned.', ['source:x-layer:l2beat'], 'L2BEAT state-validation and sequencer panels.'),
        claim('Some reviewed upgrade paths provide no practical exit window before changes take effect.', ['source:x-layer:l2beat'], 'L2BEAT upgradeability and exit-window risk panels.'),
      ],
    ),
    token_and_value_capture: section(
      'OKB predates X Layer and serves several OKX ecosystem functions; it was not created only as a claim on this rollup. After the 2025 change, total and circulating supply were reported at 21 million, and OKB remains the gas token. CoinGecko observed an $86.01 price and roughly $1.81 billion market capitalization on 2026-08-03, about 62.4% below the recorded all-time high. Gas demand links network use to OKB, but the reviewed sources do not give holders a contractual right to sequencer profits, protocol revenue or OKX cash flows. Very low gas prices also mean transaction growth can coexist with limited direct fee demand. Token value therefore depends on broader OKX utility, scarcity expectations and market demand—not just X Layer activity.',
      [
        claim('OKB supply was fixed at 21 million and OKB is X Layer gas.', ['source:x-layer:pp', 'source:x-layer:jovian'], 'Supply and gas-model announcements.', { value: 21000000 }),
        claim('OKB market capitalization was $1,806,378,867 at the observation date.', ['source:x-layer:okb'], 'CoinGecko market_data.market_cap.usd.', { value: 1806378867 }),
        claim('The reviewed sources do not give OKB holders a contractual claim on X Layer or OKX revenue.', ['source:x-layer:pp', 'source:x-layer:jovian'], 'Token and gas descriptions contain no reviewed cash-flow right.', { confidence: 'medium', kind: 'unknown' }),
      ],
    ),
    counterfactual: section(
      'X Layer could have remained on its original Polygon-based stack, which would have avoided migration work but left it more exposed to a roadmap OKX no longer preferred. It could also have stayed chain-agnostic and used wallet integrations across public networks, reducing infrastructure and governance responsibility while giving up control over fees, product defaults and OKB gas demand. A higher fee floor could improve revenue per transaction, but might weaken the low-cost adoption pitch. None of those alternatives has an observable control group, so they are trade-offs rather than claims about a guaranteed better outcome. The clearest test is whether the OP migration produces more persistent, third-party activity than the earlier configuration.',
      [
        claim('Remaining on the original stack would have avoided migration but preserved the prior architecture.', ['source:x-layer:launch', 'source:x-layer:jovian'], 'The two documented architectures establish the choice set.', { confidence: 'medium', kind: 'counterfactual' }),
        claim('Using public networks without a dedicated L2 would reduce direct infrastructure control and OKB gas linkage.', ['source:x-layer:launch', 'source:x-layer:pp'], 'Documented reasons for a dedicated chain and gas token.', { confidence: 'medium', kind: 'counterfactual' }),
      ],
    ),
    risks_and_unknowns: section(
      'The largest risks are concentration and durability. OKX can accelerate distribution, but a change in exchange strategy, regulation or customer behavior can also hit the chain and OKB together. Permissioned proposal and challenge roles, bridge contracts and no-delay upgrades add technical and governance trust. The stack migration introduces execution and continuity risk even when it is strategically sensible. On the data side, the sharp recent volume increase does not identify unique users, wash activity, incentives or retained cohorts. We also do not have an independently reconciled statement of sequencer costs and revenue. These are not accusations; they are unresolved measurements that prevent a stronger economic or decentralization call.',
      [
        claim('X Layer has material operator, bridge and upgrade-control dependencies.', ['source:x-layer:l2beat'], 'Current L2BEAT risk panels.'),
        claim('Aggregate DEX volume does not identify unique or retained users.', ['source:x-layer:volume'], 'The provider aggregate contains volume, not cohort-level user identity.', { kind: 'unknown' }),
        claim('A reconciled sequencer income and cost statement was not found in the reviewed sources.', ['source:x-layer:fees', 'source:x-layer:revenue', 'source:x-layer:jovian'], 'Gross and retained aggregates do not report operator costs.', { confidence: 'high', kind: 'unknown' }),
      ],
    ),
    lifecycle: section(
      'X Layer is in a second-growth phase rather than a simple launch phase. The 2024 mainnet established the product; the 2025 OKB reset and 2026 OP Stack/Jovian work materially changed its economics and architecture. The latest TVL point is a new high, dollar stablecoin supply is large and 30-day DEX volume exceeds $1 billion, which supports an operating and established classification. The low retained revenue and incomplete control model prevent a “mature, self-sustaining” label. The next lifecycle test is retention: capital, independent applications and revenue need to remain after the migration and any exchange campaigns fade. A new peak is meaningful, but one observation window is not a durable trend.',
      [
        claim('X Layer has passed launch and completed material token and architecture changes.', ['source:x-layer:launch', 'source:x-layer:pp', 'source:x-layer:jovian'], 'Dated launch and upgrade sequence.'),
        claim('The latest TVL point is a reviewed series high, but one point does not establish retention.', ['source:x-layer:tvl'], 'Daily TVL series maximum and latest point.', { value: 'latest=peak=111137879', confidence: 'high' }),
        claim('Current economics do not yet establish a mature self-sustaining rollup business.', ['source:x-layer:fees', 'source:x-layer:revenue'], 'Thirty-day fee and retained-revenue observations.', { confidence: 'medium', kind: 'inference' }),
      ],
    ),
    outlook_and_watch: section(
      'The base case is continued growth inside the OKX funnel with uneven independent adoption. A stronger case requires stablecoin balances to circulate, DEX volume to persist without one-off campaigns, third-party applications to contribute fees and retained revenue to rise faster than activity. Watch TVL, stablecoin supply, 30-day volume, gross fees and retained revenue together; any one metric can mislead alone. Also watch proposer and challenger permissioning, upgrade delays, bridge exposure and the practical user exit path. The call weakens if liquidity reverses after the current peak, if OKX becomes the overwhelming source of use, or if migration and upgrade control produce outages or unreviewable contract risk.',
      [
        claim('Persistent capital, activity and revenue together would strengthen the X Layer outcome call.', ['source:x-layer:tvl', 'source:x-layer:stables', 'source:x-layer:volume', 'source:x-layer:revenue'], 'Current baseline for future comparison.', { confidence: 'medium', kind: 'inference' }),
        claim('More permissionless operation and meaningful upgrade exits would reduce current trust assumptions.', ['source:x-layer:l2beat'], 'Current proposer, challenger and upgrade risk baseline.', { confidence: 'medium', kind: 'inference' }),
      ],
    ),
  },
  metrics: [
    metric('tvl-latest', 'tvl', 'TVL', 111137879, ['source:x-layer:tvl'], 'Latest DefiLlama historicalChainTvl point.'),
    metric('stablecoins-latest', 'stablecoin_supply', 'Dollar stablecoin supply', 2038102614.830803, ['source:x-layer:stables'], 'DefiLlama peggedUSD field.'),
    metric('dex-volume-30d', 'dex_spot_volume', 'DEX volume (30d)', 1035836475.4, ['source:x-layer:volume'], 'DefiLlama total30d.', ['not_unique_users', 'scope_sensitive']),
    metric('fees-30d', 'fees', 'Fees (30d)', 106402.94, ['source:x-layer:fees'], 'DefiLlama total30d.'),
    metric('revenue-30d', 'protocol_revenue', 'Protocol revenue (30d)', 2836.51, ['source:x-layer:revenue'], 'DefiLlama total30d.', ['gross_fees_not_profit']),
    metric('token-price', 'token_price', 'OKB price', 86.01, ['source:x-layer:okb'], 'CoinGecko current_price.usd.'),
    metric('token-market-cap', 'token_market_cap', 'OKB market capitalization', 1806378867, ['source:x-layer:okb'], 'CoinGecko market_cap.usd.'),
  ],
  events: [
    event('mainnet', 'launch', '2024-04-16', 'OKX announced X Layer mainnet.', ['source:x-layer:launch'], 'Dated mainnet announcement.'),
    event('jovian', 'architecture_upgrade', '2026-06-30', 'X Layer activated the Jovian OP Stack upgrade.', ['source:x-layer:jovian'], 'Dated upgrade announcement.'),
  ],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama and CoinGecko', historical_tvl_point_date: AS_OF, latest_tvl_usd: 111137879, peak_tvl_usd: 111137879, peak_tvl_date: AS_OF, tvl_drawdown_pct: 0, stablecoin_supply: { pegged_usd: 2038102614.830803 }, dex_volume_30d_usd: 1035836475.4, fees_30d_usd: 106402.94, revenue_30d_usd: 2836.51 },
  forensicSummary: 'X Layer is a successful but still concentrated exchange-backed L2. Its 2026-08-03 TVL point was a new $111.1 million high, with about $2.04 billion of dollar stablecoins and $1.04 billion of 30-day DEX volume. Yet 30-day retained revenue was only $2,836.51, and independent review still identifies permissioned operation, bridge and no-delay upgrade risks. Success describes current scale and survival, not proven organic retention or decentralization.',
  forensicWhy: 'Observed activity rose after OKX consolidated its chain strategy, fixed OKB supply and moved current execution onto OP Stack. Documented mechanisms make distribution, low fees and reused infrastructure plausible drivers. The evidence does not separate OKX-directed activity from independent demand, while the fee/revenue gap limits an economic-maturity claim.',
  whySources: ['source:x-layer:launch', 'source:x-layer:pp', 'source:x-layer:jovian', 'source:x-layer:l2beat', 'source:x-layer:tvl', 'source:x-layer:volume', 'source:x-layer:fees', 'source:x-layer:revenue'],
  choices: [
    { decision: 'Build a dedicated OKX-backed Ethereum L2.', consequence: 'OKX controls onboarding and product defaults, while corporate and regulatory dependence become chain risks.', confidence: 'high', source_refs: ['source:x-layer:launch'] },
    { decision: 'Move current execution from Polygon CDK to OP Stack.', consequence: 'The chain gains a broader rollup stack but accepts migration and continuity risk.', confidence: 'high', source_refs: ['source:x-layer:launch', 'source:x-layer:jovian'] },
    { decision: 'Fix OKB supply and use it for gas while keeping base fees extremely low.', consequence: 'Scarcity and gas utility become clearer, but cheap activity can still generate little retained revenue.', confidence: 'high', source_refs: ['source:x-layer:pp', 'source:x-layer:jovian', 'source:x-layer:revenue'] },
  ],
  forensicCounterfactual: 'Staying on Polygon CDK would avoid migration while preserving a less-preferred stack. Remaining chain-agnostic would reduce operator responsibility but also remove control over defaults and OKB gas use. Raising fees might improve revenue per transaction while weakening the adoption pitch. None of these alternatives has a controlled outcome.',
  counterfactualSources: ['source:x-layer:launch', 'source:x-layer:pp', 'source:x-layer:jovian', 'source:x-layer:revenue'],
  watch: [
    { signal: 'TVL, stablecoins, DEX volume, gross fees and retained revenue tracked together.', implication: 'Broad persistence would support durable adoption; volume alone would not.', source_refs: ['source:x-layer:tvl', 'source:x-layer:stables', 'source:x-layer:volume', 'source:x-layer:fees', 'source:x-layer:revenue'] },
    { signal: 'Proposer, challenger, bridge and upgrade-control changes.', implication: 'Permissionless roles and meaningful delays would reduce the current trust burden.', source_refs: ['source:x-layer:l2beat'] },
  ],
  unknowns: [
    ['What share of current volume comes from repeat independent users rather than OKX-directed campaigns?', 'A reproducible wallet-cohort and acquisition-source study across two quarters.'],
    ['What are the sequencer’s reconciled revenue, costs and subsidies?', 'An operator statement independently reconciled to on-chain fee flows.'],
    ['How concentrated are application liquidity and bridged assets?', 'Protocol-, bridge- and holder-level concentration reporting.'],
    ['What practical exit protection will users receive before future upgrades?', 'A verified delayed-upgrade and permissionless-exit mechanism.'],
  ],
};

const plasmaSpec = {
  slug: 'plasma', name: 'Plasma', aliases: ['Plasma XPL'],
  classification: { subtype: 'stablecoin-focused EVM layer 1', tags: ['stablecoin_payments', 'usdt', 'evm', 'xpl'], chains: [], jurisdictions: [] },
  outcome: 'declining', forensicOutcome: 'declining', outcomeConfidence: 'high', qualityConfidence: 'medium', sources: plasmaSources,
  statusSources: ['source:plasma:docs', 'source:plasma:tvl', 'source:plasma:fees'],
  statusLocator: 'Current protocol documentation and nonzero 2026-08-03 capital and fee observations.',
  outcomeSources: ['source:plasma:tvl', 'source:plasma:stables', 'source:plasma:volume', 'source:plasma:fees', 'source:plasma:revenue'],
  outcomeLocator: 'Latest and peak TVL, current stablecoin supply, DEX activity and fee observations.',
  sections: {
    what_it_is: section('Plasma is an EVM-compatible layer 1 designed around stablecoin payments, especially USDT. Its product pitch is simple: stablecoins should feel like money, so selected USDT transfers can be subsidized, users should not need to understand a separate gas asset for routine payments, and applications should get payment-focused infrastructure. XPL is the network token for fees, security and governance. Plasma is not the older Ethereum scaling design with the same name. It is a new chain backed by a team that also plans consumer distribution through Plasma One. The core test is whether a specialized chain can turn seeded stablecoin balances into repeat payments and useful applications—not merely hold assets in yield pools.', [
      claim('Plasma is a stablecoin-focused EVM layer 1 with subsidized USDT transfers.', ['source:plasma:docs', 'source:plasma:launch'], 'Current product overview and mainnet launch terms.'),
      claim('XPL is designed for network fees, security and governance.', ['source:plasma:sale', 'source:plasma:launch'], 'Token role and mainnet description.'),
      claim('Plasma One is the operator’s planned integrated consumer distribution surface.', ['source:plasma:one'], 'Plasma One product announcement.'),
    ]),
    what_happened: section('Plasma’s $50 million public sale drew about $373 million of commitments. Mainnet beta launched on September 25, 2025 with more than 100 announced partners and a stated $2 billion of stablecoin liquidity for day one. TVL then peaked at $6.36 billion on October 9, 2025. By 2026-08-03 it had fallen to $706.90 million, an 88.89% drawdown. Dollar stablecoin supply was still about $943.35 million, so the chain retained meaningful assets, but 30-day DEX volume was only $149.92 million and had fallen 87.82% from the provider’s prior-month comparison. Thirty-day fees were $3.71 million and retained revenue $338,637.52. The launch was real; the retention problem is also real.', [
      claim('The public sale had a $50 million cap and about $373 million of commitments.', ['source:plasma:sale'], 'Public-sale demand and cap section.', { value: 'cap 50000000; commitments 373000000' }),
      claim('Mainnet beta launched on September 25, 2025 with more than 100 announced partners.', ['source:plasma:launch'], 'Dated launch announcement.'),
      claim('TVL fell from a $6,360,114,429 peak to $706,896,181 by 2026-08-03.', ['source:plasma:tvl'], 'Maximum and latest returned daily TVL points.', { value: 'peak 6360114429; latest 706896181' }),
    ]),
    why_this_outcome: section('Plasma solved a genuine user-experience problem: gas and chain selection make stablecoin payments harder than they need to be. Tether relationships, investors, exchange access and launch partners helped it gather capital quickly. That distribution explains the launch better than it explains durable demand. Much of the capital could earn yield without proving that people used Plasma for everyday payments. Zero-fee transfers also create a subsidy question: somebody still pays for execution. The 88.89% TVL drawdown and weak recent DEX trend indicate that early liquidity was far less sticky than the launch headline suggested. The chain remains substantial, but current evidence supports a declining outcome until payments, active balances or repeat application use replace launch incentives as the demand engine.', [
      claim('Stablecoin specialization and launch partnerships plausibly accelerated initial liquidity.', ['source:plasma:launch', 'source:plasma:docs', 'source:plasma:sale'], 'Documented product design, partners and sale demand.', { confidence: 'medium', kind: 'inference' }),
      claim('An 88.89% TVL drawdown shows that most peak capital did not remain.', ['source:plasma:tvl'], 'Peak and latest TVL calculation.', { value: 88.89 }),
      claim('The reviewed data does not measure repeat payment users or subsidy-adjusted economics.', ['source:plasma:fees', 'source:plasma:revenue', 'source:plasma:stables'], 'Aggregate chain fields omit user cohorts and subsidy costs.', { kind: 'unknown' }),
    ]),
    strategic_choices: section('Plasma chose specialization over being another general-purpose chain. It subsidized selected USDT transfers, built EVM compatibility to reduce developer friction, seeded a large partner set before launch and paired infrastructure with the vertically integrated Plasma One app. Token allocation also favored long development: 40% went to ecosystem growth, while team and investor allocations each received 25%. Planned proof-of-stake inflation begins at 5% only when external validators and delegation are live, then declines toward 3%; base fees are designed to burn. These choices can coordinate an ecosystem quickly, but they concentrate early influence, create subsidy dependence and make validator decentralization an important unfinished milestone.', [
      claim('Plasma chose selected zero-fee USDT transfers and EVM compatibility.', ['source:plasma:docs', 'source:plasma:launch'], 'Current architecture and launch description.'),
      claim('Initial allocation assigned 40% to ecosystem, 25% to team and 25% to investors.', ['source:plasma:sale'], 'Initial token allocation table.', { value: 'ecosystem 40%; team 25%; investors 25%' }),
      claim('Plasma paired network infrastructure with a consumer app and card strategy.', ['source:plasma:one'], 'Plasma One announcement.'),
    ]),
    operating_model: section('Plasma runs its own EVM-compatible consensus and execution network rather than settling every transaction through Ethereum. XPL pays ordinary network costs and is intended to secure proof of stake. The zero-fee USDT experience is not zero-cost computation; it relies on protocol or application mechanisms that cover selected transfers. External validator participation and delegation were described as future activation points in the reviewed token materials, so the current entity-level validator distribution and the exact date when inflation begins remain important unknowns. Plasma One adds an application layer—accounts, card spending and savings—on top of the chain. That can improve distribution, but it also means the chain’s adoption story depends on operator-controlled products as well as open third-party applications.', [
      claim('Plasma is an EVM-compatible sovereign network rather than an Ethereum rollup.', ['source:plasma:docs'], 'Protocol overview and build documentation.'),
      claim('Selected free USDT transfers still require a payment or subsidy mechanism for execution.', ['source:plasma:docs', 'source:plasma:launch'], 'Zero-fee transfer scope and gas experience.', { confidence: 'high', kind: 'inference' }),
      claim('The reviewed materials describe external validators and delegation as staged features.', ['source:plasma:sale'], 'Token security and inflation description.'),
    ]),
    token_and_value_capture: section('XPL launched with an initial supply of 10 billion. The public sale represented 10%; 40% was allocated to ecosystem growth and 50% to team and investors combined. CoinGecko observed a $0.076984 price, about $207.02 million market capitalization and $769.92 million fully diluted value on 2026-08-03. The token was about 95.4% below its recorded $1.68 high, and roughly 2.69 billion tokens were circulating. XPL can capture demand through fees, staking and governance, while base-fee burns can offset some supply. But future inflation, large non-circulating allocations and the timing of external staking matter. Stablecoin balances do not automatically create XPL demand if user transfers are subsidized or can be paid without holding XPL directly.', [
      claim('XPL initial supply is 10 billion with the reviewed initial allocation.', ['source:plasma:sale'], 'Token allocation and supply sections.', { value: 10000000000 }),
      claim('XPL market cap was $207,022,660 and FDV $769,918,984 on 2026-08-03.', ['source:plasma:xpl'], 'CoinGecko market_data market_cap and fully_diluted_valuation.', { value: 'mcap 207022660; fdv 769918984' }),
      claim('Subsidized stablecoin transfers can reduce the direct need for users to acquire XPL.', ['source:plasma:docs', 'source:plasma:launch'], 'User gas and zero-fee transfer design.', { confidence: 'medium', kind: 'inference' }),
    ]),
    counterfactual: section('Plasma could have launched with a smaller, usage-gated liquidity program. That would make retention easier to read, but it might have failed to attract the partners and pools needed for a payment network. It could have deployed as an Ethereum rollup, inheriting Ethereum data and exit properties while accepting higher dependency on rollup infrastructure. It could also have postponed a consumer app and focused only on neutral infrastructure, reducing vertical-control concerns but losing a direct acquisition channel. Finally, charging visible fees on every transfer would make unit economics clearer while weakening the central user promise. These are credible trade-offs, not proven superior paths; no reviewed source supplies a controlled comparison.', [
      claim('A smaller launch program could improve signal quality while reducing early network effects.', ['source:plasma:launch', 'source:plasma:tvl'], 'Launch scale and subsequent retention outcome.', { confidence: 'medium', kind: 'counterfactual' }),
      claim('Visible per-transfer fees could clarify economics while weakening the zero-fee product.', ['source:plasma:docs', 'source:plasma:fees'], 'Product promise and aggregate fee observation.', { confidence: 'medium', kind: 'counterfactual' }),
    ]),
    risks_and_unknowns: section('Plasma is exposed to stablecoin concentration, operator and investor concentration, validator decentralization, subsidy sustainability and token dilution. USDT is its advantage and a correlated dependency: issuer, regulatory or bridge problems can affect the whole proposition. The public data does not show how much stablecoin supply is active in payments versus parked for yield, nor how many users return after incentives. It also does not reconcile who pays for zero-fee transfers, the cost per active payer, or the economics of Plasma One rewards. Token allocation creates future supply pressure even when vesting is orderly. A current independent map of validators, controlling entities, bridges and major application deposits is needed before a stronger resilience call.', [
      claim('Plasma’s product is structurally concentrated around stablecoins and especially USDT.', ['source:plasma:docs', 'source:plasma:launch', 'source:plasma:stables'], 'Product design and observed stablecoin inventory.'),
      claim('Half of initial XPL supply was allocated to team and investors.', ['source:plasma:sale'], 'Initial allocation table.', { value: 0.5 }),
      claim('Active payers, subsidy cost and validator concentration remain unresolved.', ['source:plasma:docs', 'source:plasma:fees', 'source:plasma:revenue'], 'Reviewed public aggregates do not resolve these fields.', { kind: 'unknown' }),
    ]),
    lifecycle: section('Plasma has moved from explosive launch to post-incentive contraction. The September 2025 debut and October TVL peak established one of the fastest capital ramps in the cohort. By August 2026, nearly nine-tenths of peak TVL had left, XPL traded far below its high and recent DEX volume had contracted sharply. At the same time, more than $700 million of TVL and roughly $943 million of dollar stablecoins remained, so “failed” would be inaccurate. The right lifecycle label is declining: the network is operating, economically material and still building products, but its early capital story has not yet converted into durable payment or application evidence. Recovery requires retained activity, not another short-lived deposit campaign.', [
      claim('Plasma is operating with material remaining TVL and stablecoin supply.', ['source:plasma:tvl', 'source:plasma:stables'], 'Latest provider observations.', { value: 'tvl 706896181; dollar stables 943345071.8178' }),
      claim('TVL is 88.89% below peak and monthly DEX volume change was -87.82%.', ['source:plasma:tvl', 'source:plasma:volume'], 'TVL series calculation and provider change_1m field.', { value: 'tvl drawdown 88.89%; volume change -87.82%' }),
      claim('Declining describes contraction without claiming the operating network has failed.', ['source:plasma:tvl', 'source:plasma:fees', 'source:plasma:stables'], 'Nonzero current capital, fees and stablecoins read against drawdown.', { confidence: 'high', kind: 'inference' }),
    ]),
    outlook_and_watch: section('The base case is a smaller stablecoin chain that remains relevant but must prove payments beyond deposits. Watch active stablecoin senders, transfer frequency, merchant or card settlement, Plasma One retention and the share of balances earning passive yield. Track TVL, stablecoin supply, DEX volume, fees and retained revenue separately. Watch XPL unlocks, staking activation, inflation and burned fees so token demand is compared with supply. Also watch validator and bridge concentration. The call improves if payment activity and retained revenue grow without a new wave of subsidies. It weakens if stablecoin balances keep falling, activity depends on rewards, or token emissions rise before external security and organic fee demand are visible.', [
      claim('Payment retention and subsidy-adjusted revenue are the decisive recovery signals.', ['source:plasma:docs', 'source:plasma:one', 'source:plasma:revenue'], 'Product goals and current revenue baseline.', { confidence: 'medium', kind: 'inference' }),
      claim('TVL, stablecoins, volume, fees and token supply must be read separately.', ['source:plasma:tvl', 'source:plasma:stables', 'source:plasma:volume', 'source:plasma:fees', 'source:plasma:sale'], 'Each source measures a different economic field.'),
    ]),
  },
  metrics: [
    metric('tvl-latest', 'tvl', 'TVL', 706896181, ['source:plasma:tvl'], 'Latest historicalChainTvl point.'),
    metric('stablecoins-latest', 'stablecoin_supply', 'Dollar stablecoin supply', 943345071.8178, ['source:plasma:stables'], 'peggedUSD field.'),
    metric('dex-volume-30d', 'dex_spot_volume', 'DEX volume (30d)', 149915734.62, ['source:plasma:volume'], 'total30d.', ['not_unique_users']),
    metric('fees-30d', 'fees', 'Fees (30d)', 3707591.21, ['source:plasma:fees'], 'total30d.'),
    metric('revenue-30d', 'protocol_revenue', 'Protocol revenue (30d)', 338637.52, ['source:plasma:revenue'], 'total30d.', ['gross_fees_not_profit']),
    metric('token-price', 'token_price', 'XPL price', 0.076984, ['source:plasma:xpl'], 'current_price.usd.'),
    metric('token-market-cap', 'token_market_cap', 'XPL market capitalization', 207022660, ['source:plasma:xpl'], 'market_cap.usd.'),
    metric('token-fdv', 'token_fdv', 'XPL fully diluted value', 769918984, ['source:plasma:xpl'], 'fully_diluted_valuation.usd.'),
  ],
  events: [
    event('mainnet', 'launch', '2025-09-25', 'Plasma mainnet beta and XPL launched.', ['source:plasma:launch'], 'Launch date in announcement.'),
    event('tvl-peak', 'market_peak', '2025-10-09', 'Plasma TVL reached the reviewed series peak of $6.36 billion.', ['source:plasma:tvl'], 'Maximum daily TVL point.'),
  ],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama and CoinGecko', historical_tvl_point_date: AS_OF, latest_tvl_usd: 706896181, peak_tvl_usd: 6360114429, peak_tvl_date: '2025-10-09', tvl_drawdown_pct: 88.89, stablecoin_supply: { pegged_usd: 943345071.8178 }, dex_volume_30d_usd: 149915734.62, dex_volume_change_1m_pct: -87.82, fees_30d_usd: 3707591.21, revenue_30d_usd: 338637.52 },
  forensicSummary: 'Plasma is declining, not dead. It launched with extraordinary capital and partner support, then fell from $6.36 billion peak TVL to $706.9 million by 2026-08-03. Roughly $943.3 million of dollar stablecoins remained, but 30-day DEX volume was down sharply. The evidence supports a post-launch retention problem; it does not yet show whether payments can replace incentive-driven deposits.',
  forensicWhy: 'Stablecoin specialization, Tether-aligned distribution, EVM compatibility and a large seeded partner network explain fast initial liquidity. Those mechanisms do not guarantee active payments. The observed drawdown and weak recent DEX trend show contraction, while aggregate data leaves repeat payer counts and subsidy-adjusted economics unknown.',
  whySources: ['source:plasma:launch', 'source:plasma:sale', 'source:plasma:docs', 'source:plasma:one', 'source:plasma:tvl', 'source:plasma:stables', 'source:plasma:volume', 'source:plasma:fees', 'source:plasma:revenue'],
  choices: [
    { decision: 'Specialize the chain around stablecoins and subsidized USDT transfers.', consequence: 'The product removes payment friction but depends on stablecoin concentration and ongoing cost coverage.', confidence: 'high', source_refs: ['source:plasma:docs', 'source:plasma:launch'] },
    { decision: 'Seed a large partner and liquidity network before launch.', consequence: 'Plasma achieved rapid scale, but the later drawdown shows that launch capital was not fully retained.', confidence: 'medium', source_refs: ['source:plasma:launch', 'source:plasma:tvl'] },
    { decision: 'Build Plasma One as a vertically integrated distribution product.', consequence: 'Direct consumer access can improve conversion while increasing dependence on operator execution.', confidence: 'high', source_refs: ['source:plasma:one'] },
  ],
  forensicCounterfactual: 'A smaller usage-gated launch might have produced cleaner demand signals but weaker initial network effects. A rollup could inherit Ethereum data and exits while adding rollup dependencies. Charging visible fees could improve unit-economics clarity while damaging the core payment promise. The evidence cannot show that any alternative would retain more users.',
  counterfactualSources: ['source:plasma:launch', 'source:plasma:docs', 'source:plasma:tvl', 'source:plasma:fees'],
  watch: [
    { signal: 'Active stablecoin senders, repeat transfers, card settlements and subsidy cost.', implication: 'Growth without escalating subsidy would support the payment thesis.', source_refs: ['source:plasma:docs', 'source:plasma:one', 'source:plasma:fees'] },
    { signal: 'TVL, stablecoins, DEX volume, fees, revenue and XPL supply.', implication: 'Broad recovery would improve the call; deposits or emissions alone would not.', source_refs: ['source:plasma:tvl', 'source:plasma:stables', 'source:plasma:volume', 'source:plasma:fees', 'source:plasma:revenue', 'source:plasma:sale'] },
  ],
  unknowns: [
    ['How many users make repeat payments rather than park assets for yield?', 'A wallet-cohort and transaction-purpose analysis across two quarters.'],
    ['Who pays for subsidized transfers and what is the cost per active payer?', 'A reconciled subsidy and unit-economics statement.'],
    ['How concentrated are validators, bridges and application deposits?', 'An independent entity-level security and liquidity map.'],
    ['When do external staking, inflation and large allocations become economically active?', 'A current vesting, staking and issuance schedule tied to on-chain events.'],
  ],
};

const megaethSpec = {
  slug: 'megaeth', name: 'MegaETH', aliases: ['MegaETH Mainnet'],
  classification: { subtype: 'high-performance Ethereum layer 2', tags: ['realtime', 'specialized_sequencer', 'evm', 'mega'], chains: ['Ethereum'], jurisdictions: [] },
  outcome: 'declining', forensicOutcome: 'declining', outcomeConfidence: 'high', qualityConfidence: 'medium', sources: megaSources,
  statusSources: ['source:megaeth:live', 'source:megaeth:l2beat', 'source:megaeth:tvl'],
  statusLocator: 'Current operator launch material, L2BEAT page and nonzero 2026-08-03 TVL observation.',
  outcomeSources: ['source:megaeth:tvl', 'source:megaeth:volume', 'source:megaeth:fees', 'source:megaeth:revenue', 'source:megaeth:l2beat'],
  outcomeLocator: 'Latest and peak capital, current activity/economics and independent rollup-risk assessment.',
  sections: {
    what_it_is: section('MegaETH is an Ethereum layer 2 built for very low-latency applications. Instead of asking every node to execute at the same performance level, it separates roles: a specialized sequencer executes transactions, replicas serve fast state, full nodes verify and provers create proofs. Its realtime API can expose 10-millisecond mini-block preconfirmations, but those are sequencer promises before Ethereum finality, not the same thing as settled blocks. The design targets trading, games and other applications that feel closer to web servers while retaining an Ethereum settlement path. The trade-off is explicit: performance comes from hardware and role specialization, so users must distinguish fast feedback from final settlement and evaluate centralized operational dependencies.', [
      claim('MegaETH separates sequencer, replica, full-node, prover and data-availability roles.', ['source:megaeth:architecture'], 'Current architecture role descriptions.'),
      claim('Realtime API mini-blocks are 10-millisecond sequencer preconfirmations, not Ethereum finality.', ['source:megaeth:realtime'], 'Realtime API timing and preconfirmation description.'),
      claim('MegaETH is assessed as an Ethereum scaling project with material operator and upgrade dependencies.', ['source:megaeth:l2beat'], 'Current L2BEAT project and risk panels.'),
    ]),
    what_happened: section('MegaETH built an application campaign around “real-time” EVM execution, then tied the MEGA token launch to public product milestones. The team announced that ten applications had met the first milestone on April 23, 2026, and MEGA went live on April 30. TVL peaked at $245.59 million on May 12, then fell to $43.21 million by August 3—an 82.40% drawdown. Dollar stablecoin supply was $20.73 million. Thirty-day DEX volume was $42.14 million and had risen 300.67% from the provider’s prior-month comparison; fees were $639,105.07 and retained revenue $373,952.93. That rebound matters, but it does not erase the capital decline or prove that stress-test transactions became repeat users.', [
      claim('MEGA went live on April 30, 2026 after the first KPI milestone was announced April 23.', ['source:megaeth:token', 'source:megaeth:live'], 'Token milestone timeline and launch announcement.'),
      claim('TVL fell from $245,592,022 to $43,211,981 by 2026-08-03.', ['source:megaeth:tvl'], 'Maximum and latest daily TVL points.', { value: 'peak 245592022; latest 43211981' }),
      claim('Thirty-day DEX volume was $42,140,308.06 and provider change_1m was +300.67%.', ['source:megaeth:volume'], 'total30d and change_1m fields.', { value: '42140308.06; change 300.67%' }),
    ]),
    why_this_outcome: section('MegaETH offers a real technical distinction: specialized execution can provide faster feedback than general-purpose replicated EVM networks. The team also used apps and performance campaigns to create a visible launch funnel. Those choices explain attention and recent transaction bursts. They do not establish product-market fit. Fast blocks only matter if applications attract repeat paying users, and benchmark or campaign traffic can overstate durable demand. The TVL drawdown, small stablecoin base and token decline support a declining call even though current volume and retained revenue show the network is active. The causal interpretation is therefore bounded: architecture created capability, token incentives and campaigns created reasons to try it, but the evidence does not yet show lasting retention.', [
      claim('Role specialization plausibly enables lower-latency application feedback.', ['source:megaeth:architecture', 'source:megaeth:realtime'], 'Documented architecture and mini-block behavior.', { confidence: 'high', kind: 'inference' }),
      claim('The network remains active despite an 82.40% TVL drawdown.', ['source:megaeth:tvl', 'source:megaeth:volume', 'source:megaeth:fees', 'source:megaeth:revenue'], 'Current nonzero activity read against capital decline.'),
      claim('Aggregate transactions and volume do not prove repeat paying users.', ['source:megaeth:volume', 'source:megaeth:realtime'], 'Provider aggregates and performance interface omit retention cohorts.', { kind: 'unknown' }),
    ]),
    strategic_choices: section('MegaETH chose heterogeneous nodes instead of requiring every participant to match the sequencer’s hardware. It exposed preconfirmations directly to applications, optimizing user experience before final settlement. It launched MEGA only after named product milestones and assigned 53% of KPI rewards to users and applications, making incentives part of the adoption design. The published initial allocation assigns 15% to community, 10% to team and advisers, 7% to the foundation and 15% to venture investors. The team also describes future proximity seats, sequencer rotation and USDm-funded buybacks. These are planned mechanisms, not all current production facts. The result is ambitious alignment paired with substantial execution, concentration and incentive-quality risk.', [
      claim('MegaETH chose heterogeneous node roles and direct preconfirmation APIs.', ['source:megaeth:architecture', 'source:megaeth:realtime'], 'Architecture and realtime API design.'),
      claim('The token launch used KPI milestones and assigned 53% to KPI rewards.', ['source:megaeth:token'], 'Token allocation and milestone framework.', { value: 0.53 }),
      claim('Proximity seats and sequencer rotation are described as future mechanisms, not current decentralization.', ['source:megaeth:token', 'source:megaeth:l2beat'], 'Token roadmap read against current L2BEAT operator assessment.'),
    ]),
    operating_model: section('A specialized sequencer orders and executes transactions quickly. Replicas can provide low-latency state to applications; full nodes re-execute and verify; provers produce validity evidence; data availability and Ethereum settlement complete the broader trust model. This means performance is not achieved by making every participant equally powerful. L2BEAT’s current assessment identifies no-delay upgrade control, unreproducible program hashes and recent liveness anomalies. Those issues do not invalidate the architecture, but they mean users still trust operator software and governance in addition to cryptography. Mini-blocks improve interface responsiveness, while finality follows a slower path. Any product showing “confirmed” must communicate which stage it means.', [
      claim('MegaETH performance relies on a specialized sequencer and differentiated node roles.', ['source:megaeth:architecture'], 'Current architecture document.'),
      claim('Current independent assessment reports no-delay upgrades and unreproducible program hashes.', ['source:megaeth:l2beat'], 'Current upgrade and program-hash risk panels.'),
      claim('Application preconfirmation and Ethereum final settlement are separate stages.', ['source:megaeth:realtime', 'source:megaeth:l2beat'], 'Realtime API and settlement assessment.'),
    ]),
    token_and_value_capture: section('MEGA launched on April 30, 2026 with a stated 10 billion maximum supply. CoinGecko observed a $0.0374661 price, $42.33 million market capitalization and $374.65 million fully diluted value on August 3. The token was about 82.79% below its recorded high, with roughly 1.13 billion circulating. Published utility includes future access and network roles; the team also says yield from USDm can fund MEGA buybacks. Planned proximity seats and sequencer rotation could link token ownership to scarce infrastructure, but they should not be counted as current cash flow or decentralization before activation. The large gap between market cap and FDV makes supply timing material. Token success remains tied to applications producing durable demand after KPI rewards fade.', [
      claim('MEGA launched April 30, 2026 with a maximum supply of 10 billion.', ['source:megaeth:token', 'source:megaeth:live', 'source:megaeth:mega'], 'Launch announcement, token page and supply field.', { value: 10000000000 }),
      claim('MEGA market cap was $42,327,720 and FDV $374,650,298 on 2026-08-03.', ['source:megaeth:mega'], 'CoinGecko market_data market_cap and fully_diluted_valuation.', { value: 'mcap 42327720; fdv 374650298' }),
      claim('Planned buybacks and infrastructure roles are not equivalent to current contractual holder cash flow.', ['source:megaeth:token'], 'Roadmap and utility language.', { confidence: 'high', kind: 'inference' }),
    ]),
    counterfactual: section('MegaETH could require more nodes to execute at similar performance, reducing specialization but sharply raising hardware and bandwidth barriers. It could avoid exposing 10-millisecond preconfirmations until finality, simplifying user expectations while losing the realtime experience. It could also launch without KPI rewards, producing a cleaner demand test but reducing the number of applications willing to optimize for a new chain. A delayed token launch might reduce supply overhang and financial distraction, but would remove the incentive and future infrastructure mechanism the team designed. These alternatives illustrate the same trade-off: credible performance, decentralization, growth speed and signal quality cannot all be maximized at once. The reviewed evidence cannot prove which balance would retain more users.', [
      claim('Homogeneous high-performance nodes would reduce specialization while increasing participation requirements.', ['source:megaeth:architecture'], 'Documented heterogeneous design establishes the trade-off.', { confidence: 'medium', kind: 'counterfactual' }),
      claim('Removing KPI rewards would improve organic-demand measurement while reducing launch incentives.', ['source:megaeth:token', 'source:megaeth:tvl'], 'Reward design and subsequent capital path.', { confidence: 'medium', kind: 'counterfactual' }),
    ]),
    risks_and_unknowns: section('MegaETH’s key risks are sequencer concentration, no-delay upgrades, code reproducibility, liveness, incentive-sensitive traffic and token dilution. The speed promise can also create a communication risk if users confuse preconfirmation with final settlement. L2BEAT reports recent liveness anomalies; these are a real operating signal, not proof of permanent instability. We do not yet know the share of volume generated by repeat users, the concentration of applications and deposits, the full sequencer income statement, or the production timetable for rotation and proximity seats. We also lack a long operating history through extreme market conditions. Those gaps prevent the performance thesis from being treated as a proven durable business.', [
      claim('Current independent review identifies upgrade, reproducibility and liveness risks.', ['source:megaeth:l2beat'], 'Current L2BEAT risk and activity panels.'),
      claim('Preconfirmations can be mistaken for final settlement if applications label them poorly.', ['source:megaeth:realtime'], 'Realtime API confirmation-stage description.', { confidence: 'high', kind: 'inference' }),
      claim('User retention, deposit concentration and sequencer economics remain unresolved.', ['source:megaeth:volume', 'source:megaeth:fees', 'source:megaeth:revenue'], 'Aggregate provider data omits these fields.', { kind: 'unknown' }),
    ]),
    lifecycle: section('MegaETH is in post-token contraction with signs of renewed activity. The April token launch and May TVL peak mark the end of pure prelaunch experimentation. Since then, TVL has fallen 82.40% and MEGA is more than 80% below its recorded high. That supports a declining label. The chain is not dormant: thirty-day DEX volume rose sharply, gross fees exceeded $639,000 and retained revenue exceeded $373,000. A single rebound does not establish recovery, especially when stablecoin supply is only $20.73 million. Recovery should require at least two quarters of repeat application usage, resilient liveness and capital retention after rewards. Until then, MegaETH is an active technical platform whose economic outcome trails its launch expectations.', [
      claim('MegaETH is active with nonzero volume, fees and retained revenue.', ['source:megaeth:volume', 'source:megaeth:fees', 'source:megaeth:revenue'], 'Current 30-day provider totals.'),
      claim('TVL is 82.40% below peak and MEGA is 82.79% below its recorded high.', ['source:megaeth:tvl', 'source:megaeth:mega'], 'TVL series calculation and CoinGecko ATH change.', { value: 'tvl drawdown 82.40%; token drawdown 82.79%' }),
      claim('One month of improving volume is insufficient to classify recovery.', ['source:megaeth:volume'], 'A one-month comparison is not a multi-quarter retention series.', { confidence: 'high', kind: 'inference' }),
    ]),
    outlook_and_watch: section('The base case is a technically differentiated but smaller rollup that must convert speed into repeat use. Watch application-level retention, paying users, organic fees, stablecoin balances and TVL after KPI rewards. Compare preconfirmation latency with final settlement and record outages, reorgs and failed preconfirmations. Watch whether program hashes become reproducible, upgrades gain delays and sequencer rotation becomes operational. For MEGA, track circulating supply, unlocks, buybacks and actual token-gated infrastructure rather than announced plans. The outlook improves if several unrelated applications retain users and revenue through quieter markets. It weakens if activity remains campaign-driven, the capital base continues shrinking or reliability problems make realtime execution less trustworthy.', [
      claim('Multi-application user retention and organic revenue would validate the realtime thesis.', ['source:megaeth:architecture', 'source:megaeth:volume', 'source:megaeth:revenue'], 'Technical capability and current economic baseline.', { confidence: 'medium', kind: 'inference' }),
      claim('Delayed upgrades, reproducible code and sequencer rotation would reduce current control risks.', ['source:megaeth:l2beat', 'source:megaeth:token'], 'Current risk baseline and planned mechanisms.', { confidence: 'medium', kind: 'inference' }),
    ]),
  },
  metrics: [
    metric('tvl-latest', 'tvl', 'TVL', 43211981, ['source:megaeth:tvl'], 'Latest historicalChainTvl point.'),
    metric('stablecoins-latest', 'stablecoin_supply', 'Dollar stablecoin supply', 20734097.668, ['source:megaeth:stables'], 'peggedUSD field.'),
    metric('dex-volume-30d', 'dex_spot_volume', 'DEX volume (30d)', 42140308.06, ['source:megaeth:volume'], 'total30d.', ['not_unique_users', 'campaign_sensitive']),
    metric('fees-30d', 'fees', 'Fees (30d)', 639105.07, ['source:megaeth:fees'], 'total30d.'),
    metric('revenue-30d', 'protocol_revenue', 'Protocol revenue (30d)', 373952.93, ['source:megaeth:revenue'], 'total30d.', ['gross_fees_not_profit']),
    metric('token-price', 'token_price', 'MEGA price', 0.0374661, ['source:megaeth:mega'], 'current_price.usd.'),
    metric('token-market-cap', 'token_market_cap', 'MEGA market capitalization', 42327720, ['source:megaeth:mega'], 'market_cap.usd.'),
    metric('token-fdv', 'token_fdv', 'MEGA fully diluted value', 374650298, ['source:megaeth:mega'], 'fully_diluted_valuation.usd.'),
  ],
  events: [
    event('token-live', 'token_launch', '2026-04-30', 'MEGA token went live after the first public KPI milestone.', ['source:megaeth:token', 'source:megaeth:live'], 'Token timeline and launch post.'),
    event('tvl-peak', 'market_peak', '2026-05-12', 'MegaETH TVL reached the reviewed series peak of $245.59 million.', ['source:megaeth:tvl'], 'Maximum daily TVL point.'),
  ],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama and CoinGecko', historical_tvl_point_date: AS_OF, latest_tvl_usd: 43211981, peak_tvl_usd: 245592022, peak_tvl_date: '2026-05-12', tvl_drawdown_pct: 82.4, stablecoin_supply: { pegged_usd: 20734097.668 }, dex_volume_30d_usd: 42140308.06, dex_volume_change_1m_pct: 300.67, fees_30d_usd: 639105.07, revenue_30d_usd: 373952.93 },
  forensicSummary: 'MegaETH is an active but declining high-performance rollup. TVL fell 82.40% from the May 2026 peak to $43.2 million on 2026-08-03. Recent DEX volume improved and the chain retained meaningful fees and revenue, but one rebound does not prove repeat demand. The performance design is differentiated; current control, reproducibility and liveness risks remain material.',
  forensicWhy: 'Specialized execution and preconfirmations create a credible low-latency product, while KPI rewards and app campaigns accelerate trials. The evidence does not show that benchmark or campaign users became retained payers. Capital and token drawdowns support a declining call despite current activity.',
  whySources: ['source:megaeth:architecture', 'source:megaeth:realtime', 'source:megaeth:token', 'source:megaeth:l2beat', 'source:megaeth:tvl', 'source:megaeth:volume', 'source:megaeth:fees', 'source:megaeth:revenue'],
  choices: [
    { decision: 'Separate sequencer, replica, full-node and prover roles.', consequence: 'Applications receive lower latency while operator and hardware specialization increase.', confidence: 'high', source_refs: ['source:megaeth:architecture'] },
    { decision: 'Expose 10-millisecond mini-block preconfirmations.', consequence: 'Interfaces can respond quickly, but must distinguish preconfirmation from final settlement.', confidence: 'high', source_refs: ['source:megaeth:realtime'] },
    { decision: 'Tie token distribution to KPI milestones and application rewards.', consequence: 'The network can attract trials quickly while organic-demand measurement becomes harder.', confidence: 'high', source_refs: ['source:megaeth:token'] },
  ],
  forensicCounterfactual: 'Homogeneous nodes could reduce role specialization but make participation prohibitively expensive. Hiding preconfirmations until finality would simplify UX while removing the realtime advantage. Launching without KPI rewards would create a cleaner demand test but likely fewer initial applications. The evidence does not identify a superior balance.',
  counterfactualSources: ['source:megaeth:architecture', 'source:megaeth:realtime', 'source:megaeth:token', 'source:megaeth:tvl'],
  watch: [
    { signal: 'Application retention, stablecoins, TVL, volume, fees and revenue after rewards.', implication: 'Broad persistence would validate the performance thesis; campaign spikes would not.', source_refs: ['source:megaeth:tvl', 'source:megaeth:stables', 'source:megaeth:volume', 'source:megaeth:fees', 'source:megaeth:revenue'] },
    { signal: 'Liveness, reproducible program hashes, upgrade delays and sequencer rotation.', implication: 'Improvement would lower present operator and software trust.', source_refs: ['source:megaeth:l2beat', 'source:megaeth:token'] },
  ],
  unknowns: [
    ['What share of activity comes from repeat paying users rather than campaigns or tests?', 'Application-level cohorts across two quarters.'],
    ['How concentrated are deposits, applications and sequencing infrastructure?', 'An independent entity- and protocol-level concentration map.'],
    ['What are reconciled sequencer revenue, costs and subsidies?', 'An operator income statement matched to on-chain flows.'],
    ['When will rotation, proximity seats and reproducible production code be live?', 'Verified mainnet activation and independent reproduction.'],
  ],
};

const inkSpec = {
  slug: 'ink', name: 'Ink', aliases: ['Ink onchain'],
  classification: { subtype: 'exchange-backed Ethereum layer 2', tags: ['op_stack', 'superchain', 'kraken', 'defi'], chains: ['Ethereum'], jurisdictions: [] },
  outcome: 'middling', forensicOutcome: 'middling', outcomeConfidence: 'high', qualityConfidence: 'medium', sources: inkSources,
  statusSources: ['source:ink:launch', 'source:ink:l2beat', 'source:ink:tvl'],
  statusLocator: 'Mainnet launch, current independent rollup assessment and current TVL observation.',
  outcomeSources: ['source:ink:tvl', 'source:ink:stables', 'source:ink:volume', 'source:ink:fees', 'source:ink:revenue', 'source:ink:l2beat'],
  outcomeLocator: 'Current capital, stablecoins, activity/economics and control-risk assessment.',
  sections: {
    what_it_is: section('Ink is Kraken’s Ethereum layer 2 for DeFi. It uses the OP Stack, posts data to Ethereum, uses ETH for gas and participates in the broader Superchain environment. Kraken’s strategic advantage is distribution: it can make on-chain lending, trading and yield products easier for exchange customers to reach. Ink itself is non-custodial infrastructure; Kraken accounts and products may provide the entrance, while smart contracts and users carry protocol-specific risks. The chain launched without a native token. A future INK token has been announced, but the reviewed FAQ still provides no completed launch details, and Ink Points are a loyalty program rather than proof that a token already exists. That distinction matters for both users and analysis.', [
      claim('Ink is a Kraken-backed OP Stack Ethereum L2 focused on DeFi.', ['source:ink:announce', 'source:ink:launch', 'source:ink:l2beat'], 'Announcement, launch and current technology assessment.'),
      claim('ETH is the operating gas asset and no INK token launch was verified by 2026-08-03.', ['source:ink:token', 'source:ink:faq'], 'Future-tense token announcement and current FAQ.', { value: 'INK token not launched/verified' }),
      claim('Ink Points are a separate loyalty program, not evidence of a token TGE.', ['source:ink:points', 'source:ink:faq'], 'Points mechanics and current token FAQ.'),
    ]),
    what_happened: section('Kraken announced Ink in October 2024 and launched mainnet early on December 18, 2024. The network then expanded DeFi products and Kraken-linked onboarding. TVL peaked at $572.84 million on January 15, 2026, before falling to $118.01 million by August 3—79.40% below peak. Dollar stablecoin supply was $136.46 million. Thirty-day DEX volume was $66.32 million and had improved 52.99% from the provider’s prior-month comparison. Thirty-day fees were $3.07 million and retained revenue $730,905.89. Ink also introduced Points in April 2026. The chain has a meaningful capital base and active economics, but the large drawdown and limited evidence of broad independent applications support a middling rather than leading outcome.', [
      claim('Ink mainnet launched on December 18, 2024.', ['source:ink:launch'], 'Dated launch announcement.'),
      claim('TVL fell from $572,838,055 to $118,012,547 by 2026-08-03.', ['source:ink:tvl'], 'Maximum and latest returned daily TVL points.', { value: 'peak 572838055; latest 118012547' }),
      claim('Thirty-day fees were $3,072,521.69 and retained revenue $730,905.89.', ['source:ink:fees', 'source:ink:revenue'], 'Provider total30d fields.', { value: 'fees 3072521.69; revenue 730905.89' }),
    ]),
    why_this_outcome: section('Ink copied a proven strategic pattern: pair cheap EVM execution with the distribution of a major exchange. OP Stack compatibility reduced the cost of launching, while Kraken could funnel customers toward on-chain products. That likely explains why capital arrived faster than it would for an unknown independent rollup. The same pattern creates dependence. If most demand comes through Kraken or one lending product, the network may hold capital without developing a broad application economy. Current stablecoins, volume and fees prove real activity; they do not reveal retained users, protocol concentration or how much use was reward-driven. The 79.40% TVL drawdown is evidence that peak deposits were not sticky. Ink is still useful and operating, but distribution has not yet proven a durable independent moat.', [
      claim('Kraken distribution and OP Stack compatibility plausibly reduced launch friction.', ['source:ink:announce', 'source:ink:launch'], 'Documented strategy and architecture.', { confidence: 'medium', kind: 'inference' }),
      claim('Current activity coexists with a 79.40% TVL drawdown.', ['source:ink:tvl', 'source:ink:volume', 'source:ink:fees'], 'Latest capital and 30-day activity observations.'),
      claim('The reviewed aggregates do not show retained users or application concentration.', ['source:ink:tvl', 'source:ink:volume'], 'Provider chain aggregates omit cohort and protocol concentration.', { kind: 'unknown' }),
    ]),
    strategic_choices: section('Kraken chose a dedicated DeFi L2 rather than only integrating third-party chains. It chose OP Stack and the Superchain, gaining mature EVM tooling and shared standards at the cost of stack and governance dependencies. It launched ahead of schedule without a native token, using ETH for gas so users were not forced to acquire a new asset. It later announced INK and introduced Points before a verified token launch. That sequence can reward early participation and preserve flexibility, but it also creates speculation and uncertainty until allocation, rights, vesting and activation are final. Kraken’s strongest choice is distribution; the strategic risk is allowing that distribution to substitute for an independently compelling application ecosystem.', [
      claim('Kraken launched a dedicated OP Stack DeFi chain and initially used ETH rather than a native token.', ['source:ink:announce', 'source:ink:launch'], 'Architecture and mainnet product description.'),
      claim('INK was announced for future integration while Points launched as a separate program.', ['source:ink:token', 'source:ink:points', 'source:ink:faq'], 'Token and points announcements read with current FAQ.'),
      claim('Exchange-led distribution can accelerate adoption while increasing corporate dependence.', ['source:ink:announce', 'source:ink:tvl'], 'Operator strategy and observed capital trajectory.', { confidence: 'medium', kind: 'inference' }),
    ]),
    operating_model: section('Ink runs OP Stack execution with Ethereum data availability and fault-proof machinery. L2BEAT currently classifies it Stage 1 and reports permissionless proposal/fault-proof participation, which is stronger than a purely operator-controlled validation path. A centralized sequencer can still censor or extract MEV until users use forced inclusion. Regular and emergency upgrade authority remains shared among Ink Foundation and Security Council actors, with no delay on the reviewed paths. In plain terms, users gain Ethereum-linked data and working escape mechanisms, but they still trust a centralized sequencer and governance keys for timely, safe operation. Kraken can make the interface easy; it cannot remove smart-contract, bridge, sequencing or governance risk.', [
      claim('Ink uses Ethereum data availability and is assessed Stage 1.', ['source:ink:l2beat'], 'Current stage and data-availability panels.'),
      claim('Fault-proof proposal is permissionless while sequencing remains centralized.', ['source:ink:l2beat'], 'Current state-validation and sequencer panels.'),
      claim('Reviewed regular and emergency upgrade paths have no delay.', ['source:ink:l2beat'], 'Current upgradeability panel.'),
    ]),
    token_and_value_capture: section('Ink used ETH for gas at launch. Kraken later announced plans for an INK token, but as of this review the official FAQ does not provide a completed token launch, and no market profile should be fabricated. Ink Points can track or reward activity, but points are not transferable token supply, governance rights or a claim on revenue. Until tokenomics are published and a TGE occurs, token allocation, vesting, holder rights and value capture are unknown. The chain can still produce economics through sequencer fees: DefiLlama reported $3.07 million of 30-day fees and $730,905.89 of retained revenue. Those network economics currently accrue through infrastructure arrangements, not a verified public INK holder contract.', [
      claim('ETH is the verified gas token; INK launch details remain unverified.', ['source:ink:launch', 'source:ink:token', 'source:ink:faq'], 'Launch design, future token announcement and current FAQ.'),
      claim('Points do not establish transferable supply, governance or revenue rights.', ['source:ink:points'], 'Points mechanics contain no reviewed token rights.', { confidence: 'high', kind: 'inference' }),
      claim('Thirty-day provider-reported retained revenue was $730,905.89.', ['source:ink:revenue'], 'DefiLlama total30d.', { value: 730905.89 }),
    ]),
    counterfactual: section('Kraken could onboard users to existing public chains instead of running Ink. That would reduce infrastructure and governance responsibility but sacrifice control over fees, product defaults and a dedicated brand. Ink could have launched a token immediately, making incentives explicit while adding dilution, legal and speculative pressure before product fit. It could also delay Points until token terms are final, reducing ambiguity but giving up a flexible loyalty tool. A more neutral governance structure at launch might attract independent builders, while slowing emergency decisions. None of those choices guarantees more adoption. The current evidence supports watching whether Kraken distribution creates sticky use without relying on an eventual token event.', [
      claim('Using only third-party chains would reduce direct control and infrastructure responsibility.', ['source:ink:announce'], 'The reasons given for a dedicated Ink network.', { confidence: 'medium', kind: 'counterfactual' }),
      claim('An immediate token could clarify incentives while adding dilution and launch pressure.', ['source:ink:token', 'source:ink:faq'], 'Future token status establishes the alternative timing.', { confidence: 'medium', kind: 'counterfactual' }),
    ]),
    risks_and_unknowns: section('Ink’s main risks are Kraken dependence, application concentration, centralized sequencing, no-delay governance actions, token uncertainty and incentive-sensitive deposits. The current data does not show how many Kraken customers become repeat self-custodial users, how much TVL sits in the largest protocol, or which party captures sequencer margin after costs. INK allocation, vesting, rights and launch date remain unknown; Points should not be used as a substitute. Bridge exposure and forced-withdrawal usability also deserve testing. These are ordinary but material risks for an exchange-backed L2. A future token launch could improve coordination or merely add another speculative layer; the outcome depends on terms and retained product use.', [
      claim('Ink currently has centralized sequencing and no-delay upgrade risk.', ['source:ink:l2beat'], 'Current sequencer and upgradeability panels.'),
      claim('INK allocation, vesting, rights and launch date were not verified.', ['source:ink:token', 'source:ink:faq'], 'Future-tense announcement and current FAQ.', { kind: 'unknown' }),
      claim('Kraken conversion and application concentration are not reported by chain aggregates.', ['source:ink:tvl', 'source:ink:volume'], 'Aggregate data lacks acquisition and protocol concentration.', { kind: 'unknown' }),
    ]),
    lifecycle: section('Ink is a middling growth-stage L2. It launched, reached meaningful scale and remains active, so it is not a failed experiment. It also sits almost 80% below peak TVL and has not yet shown that Kraken distribution creates a broad, retained ecosystem. Improving recent DEX volume and material fee revenue are constructive. Token speculation is not counted as current product success because no verified TGE occurred by the review date. The next phase will be defined by whether capital and users remain after Points and any token launch, whether more independent applications contribute revenue, and whether governance becomes safer. Until those tests pass, Ink belongs between successful leaders and declining failures.', [
      claim('Ink is operating with $118.01 million TVL and $136.46 million dollar stablecoins.', ['source:ink:tvl', 'source:ink:stables'], 'Latest provider observations.', { value: 'tvl 118012547; stables 136459848.121' }),
      claim('TVL is 79.40% below peak despite improving recent DEX volume.', ['source:ink:tvl', 'source:ink:volume'], 'TVL drawdown and change_1m field.'),
      claim('Token speculation is excluded from the current lifecycle result.', ['source:ink:token', 'source:ink:faq'], 'No completed token launch verified.', { confidence: 'high', kind: 'methodology' }),
    ]),
    outlook_and_watch: section('The base case is a viable Kraken-linked DeFi network that remains mid-sized. Watch the conversion funnel from Kraken account to self-custodial repeat user, application and liquidity concentration, stablecoin transfers, DEX volume, fees and retained revenue. If INK launches, record the actual allocation, vesting, rights and on-chain contracts rather than repeating expectations. Watch whether Points change behavior or simply attract temporary deposits. On security, track sequencer outages, forced inclusion, fault-proof participation, bridge exposure and upgrade delays. The call improves if independent applications and organic revenue grow after incentives. It weakens if TVL keeps falling, usage remains concentrated in Kraken-directed products or token rewards become the primary reason to stay.', [
      claim('Repeat conversion and independent application revenue are the decisive growth signals.', ['source:ink:announce', 'source:ink:volume', 'source:ink:revenue'], 'Distribution strategy and current activity baseline.', { confidence: 'medium', kind: 'inference' }),
      claim('Token terms should be updated only after official publication and verified launch.', ['source:ink:token', 'source:ink:faq'], 'Current token evidence state.', { confidence: 'high', kind: 'methodology' }),
      claim('Sequencer, fault-proof and upgrade controls should be tracked with economic metrics.', ['source:ink:l2beat', 'source:ink:tvl'], 'Current control and capital baselines.'),
    ]),
  },
  metrics: [
    metric('tvl-latest', 'tvl', 'TVL', 118012547, ['source:ink:tvl'], 'Latest historicalChainTvl point.'),
    metric('stablecoins-latest', 'stablecoin_supply', 'Dollar stablecoin supply', 136459848.121, ['source:ink:stables'], 'peggedUSD field.'),
    metric('dex-volume-30d', 'dex_spot_volume', 'DEX volume (30d)', 66318106.65, ['source:ink:volume'], 'total30d.', ['not_unique_users']),
    metric('fees-30d', 'fees', 'Fees (30d)', 3072521.69, ['source:ink:fees'], 'total30d.'),
    metric('revenue-30d', 'protocol_revenue', 'Protocol revenue (30d)', 730905.89, ['source:ink:revenue'], 'total30d.', ['gross_fees_not_profit']),
  ],
  events: [
    event('mainnet', 'launch', '2024-12-18', 'Ink mainnet launched ahead of its original schedule.', ['source:ink:launch'], 'Dated launch announcement.'),
    event('points', 'incentive_program', '2026-04-22', 'Kraken introduced Ink Points as a loyalty program.', ['source:ink:points'], 'Dated product announcement.'),
  ],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama', historical_tvl_point_date: AS_OF, latest_tvl_usd: 118012547, peak_tvl_usd: 572838055, peak_tvl_date: '2026-01-15', tvl_drawdown_pct: 79.4, stablecoin_supply: { pegged_usd: 136459848.121 }, dex_volume_30d_usd: 66318106.65, dex_volume_change_1m_pct: 52.99, fees_30d_usd: 3072521.69, revenue_30d_usd: 730905.89 },
  forensicSummary: 'Ink is a middling exchange-backed L2. It remains active with $118.0 million TVL, $136.5 million of dollar stablecoins and material fees, but TVL is 79.40% below peak. Kraken distribution is a real advantage; conversion into broad retained on-chain use remains unproven. INK was announced but no completed token launch was verified.',
  forensicWhy: 'Kraken distribution, OP Stack compatibility and DeFi specialization plausibly accelerated adoption. Current capital and fee activity show a real network, while the large drawdown and unknown user/application concentration prevent a stronger call. Points and a future token may affect demand, but they are not counted as current token success.',
  whySources: ['source:ink:announce', 'source:ink:launch', 'source:ink:token', 'source:ink:points', 'source:ink:faq', 'source:ink:l2beat', 'source:ink:tvl', 'source:ink:volume', 'source:ink:fees', 'source:ink:revenue'],
  choices: [
    { decision: 'Launch a dedicated Kraken-backed OP Stack DeFi L2.', consequence: 'Ink gains distribution and mature tooling while depending on Kraken strategy and rollup governance.', confidence: 'high', source_refs: ['source:ink:announce', 'source:ink:launch'] },
    { decision: 'Launch without a native token and use ETH for gas.', consequence: 'Users avoid a new gas asset, while direct native-token value capture remains absent.', confidence: 'high', source_refs: ['source:ink:launch', 'source:ink:faq'] },
    { decision: 'Introduce Points before a verified INK launch.', consequence: 'The operator can test loyalty incentives while creating uncertainty about future conversion and rights.', confidence: 'high', source_refs: ['source:ink:token', 'source:ink:points', 'source:ink:faq'] },
  ],
  forensicCounterfactual: 'Kraken could rely on public chains and avoid direct rollup responsibility, but would lose control over defaults and economics. An immediate token could clarify incentives while adding dilution and legal risk before product fit. Delaying Points would reduce speculation but remove a flexible growth tool. No reviewed evidence proves one path would retain more users.',
  counterfactualSources: ['source:ink:announce', 'source:ink:token', 'source:ink:points', 'source:ink:faq'],
  watch: [
    { signal: 'Kraken-to-Ink conversion, repeat users, application concentration and organic revenue.', implication: 'Broad independent retention would strengthen the outcome; directed deposits would not.', source_refs: ['source:ink:announce', 'source:ink:tvl', 'source:ink:volume', 'source:ink:revenue'] },
    { signal: 'Verified INK terms and launch plus Points behavior.', implication: 'Clear terms permit token analysis; continued ambiguity should remain labeled unknown.', source_refs: ['source:ink:token', 'source:ink:points', 'source:ink:faq'] },
    { signal: 'Sequencer, fault-proof and upgrade governance changes.', implication: 'Reduced centralized control would improve resilience.', source_refs: ['source:ink:l2beat'] },
  ],
  unknowns: [
    ['How many Kraken users become repeat self-custodial Ink users?', 'A two-quarter acquisition and retention cohort.'],
    ['How concentrated are TVL and fees by application?', 'Protocol-level capital and revenue decomposition.'],
    ['What are final INK allocation, vesting, rights and launch contracts?', 'Official token documents plus verified on-chain deployment.'],
    ['What are sequencer revenue, costs and subsidies?', 'A reconciled operator income statement.'],
  ],
};

const starknetSpec = {
  slug: 'starknet', name: 'Starknet', aliases: ['StarkNet'],
  classification: { subtype: 'STARK validity rollup', tags: ['zk_rollup', 'cairo', 'stark_proofs', 'strk'], chains: ['Ethereum'], jurisdictions: [] },
  outcome: 'middling', forensicOutcome: 'middling', outcomeConfidence: 'high', qualityConfidence: 'high', sources: starknetSources,
  statusSources: ['source:starknet:roadmap', 'source:starknet:l2beat', 'source:starknet:tvl'],
  statusLocator: 'Current roadmap, current independent assessment and 2026-08-03 network observations.',
  outcomeSources: ['source:starknet:tvl', 'source:starknet:stables', 'source:starknet:volume', 'source:starknet:fees', 'source:starknet:revenue', 'source:starknet:incident-2025', 'source:starknet:incident-2026'],
  outcomeLocator: 'Current economics and capital read with two detailed operator incident reports.',
  sections: {
    what_it_is: section('Starknet is an Ethereum validity rollup built around STARK proofs and the Cairo programming environment. A sequencer orders and executes transactions; proofs let Ethereum verify state transitions without re-executing every transaction. This design can compress many transactions while preserving strong correctness guarantees after proofs settle. It is not EVM-equivalent by default, so developers use Cairo and Starknet-specific tooling. STRK supports fees, staking and governance. The project’s distinctive bet is that a purpose-built proving stack and language can outperform a compatibility-first rollup over time. That gives Starknet a technical identity, but also asks developers, applications and users to adopt a separate ecosystem while competing with large EVM rollups.', [
      claim('Starknet is a STARK validity rollup with Cairo-based execution.', ['source:starknet:launch', 'source:starknet:l2beat'], 'Launch description and current technology panel.'),
      claim('Ethereum verifies Starknet state transitions through validity proofs.', ['source:starknet:l2beat'], 'Current state-validation panel.'),
      claim('STRK is used for fees, staking and governance.', ['source:starknet:strk'], 'Current STRK protocol documentation.'),
    ]),
    what_happened: section('Starknet Alpha launched on Ethereum mainnet on November 29, 2021. The network later added STRK and began phased staking and decentralization. TVL peaked at $330.78 million on March 26, 2024 and measured $166.50 million on August 3, 2026, a 49.66% drawdown. Dollar stablecoin supply was $160.86 million; 30-day DEX volume was $106.09 million, down 41.45% from the provider’s prior-month comparison. Thirty-day fees were $1.64 million, while retained revenue was only $11,749.53. Two detailed incidents are central: a September 2025 sequencer transition caused degraded service and reorgs, and a January 2026 execution bug caused an 18-minute reorg and hours of downtime. Proofs stopped invalid execution from finalizing, but liveness still failed.', [
      claim('Starknet Alpha launched on mainnet on November 29, 2021.', ['source:starknet:launch'], 'Dated Alpha mainnet announcement.'),
      claim('TVL was $166,504,229, 49.66% below the $330,779,212 peak.', ['source:starknet:tvl'], 'Latest and maximum daily TVL points.', { value: 'latest 166504229; peak 330779212; drawdown 49.66%' }),
      claim('The 2025 and 2026 incidents caused reorgs and downtime while proof rejection protected correctness.', ['source:starknet:incident-2025', 'source:starknet:incident-2026'], 'Incident timelines, root causes and proof outcomes.'),
    ]),
    why_this_outcome: section('Starknet’s middling outcome comes from a mix of technical credibility and adoption friction. STARK proofs, Cairo and years of research created a defensible architecture and demonstrated a real safety benefit when invalid execution was rejected. The same custom stack raises switching and tooling costs relative to EVM rollups. Phased decentralization also means users still rely on concentrated sequencing and governance while the long-term model is being built. Current TVL and stablecoins show meaningful use, but falling recent DEX volume and very low retained revenue show that the chain has not converted technical ambition into leading economic scale. The incidents reinforce this split: validity proofs protected settlement integrity, while operational software and coordination still interrupted service.', [
      claim('The custom Cairo/STARK stack provides technical differentiation and adoption friction.', ['source:starknet:launch', 'source:starknet:l2beat'], 'Architecture and compatibility assessment.', { confidence: 'medium', kind: 'inference' }),
      claim('Proof rejection protected correctness during the January 2026 execution bug.', ['source:starknet:incident-2026'], 'Incident report: invalid block was not accepted by the proving layer.'),
      claim('Current capital is meaningful while retained revenue remains small.', ['source:starknet:tvl', 'source:starknet:stables', 'source:starknet:revenue'], 'Current provider observations.', { value: 'tvl 166504229; stables 160856376.813; revenue30d 11749.53' }),
    ]),
    strategic_choices: section('StarkWare chose validity proofs and Cairo rather than prioritize drop-in EVM equivalence. That enabled a proving-first architecture but required a distinct developer ecosystem. The project launched Alpha with centralized operating roles, then adopted a phased roadmap toward staking, more validators and broader responsibilities instead of decentralizing every role at once. STRK was designed to cover fees, staking and governance. The team also publishes detailed incident reports and remediation work, improving accountability after failures. These choices favor controlled iteration and technical specialization. Their cost is time: concentrated sequencing, multisig authority and ecosystem friction remain visible years after launch. The strategic question is whether the architecture’s long-term advantages arrive before application and liquidity networks standardize elsewhere.', [
      claim('Starknet chose a Cairo/STARK proving stack rather than EVM equivalence.', ['source:starknet:launch', 'source:starknet:l2beat'], 'Launch architecture and current technology panel.'),
      claim('Decentralization and staking responsibilities are being introduced in phases.', ['source:starknet:roadmap', 'source:starknet:strk'], 'Current roadmap and staking documentation.'),
      claim('The operator published detailed root causes and remediation after both reviewed incidents.', ['source:starknet:incident-2025', 'source:starknet:incident-2026'], 'Incident report corrective-action sections.'),
    ]),
    operating_model: section('Starknet transactions are ordered by sequencers, executed in Cairo and proven with STARKs before Ethereum accepts the resulting state. This separates liveness from correctness: a sequencer or blockifier bug can stop or rewind service, while invalid state should fail proof verification. The January 2026 incident demonstrated exactly that boundary. Current governance is still concentrated. L2BEAT reports that a 9-of-12 Security Council can act immediately and a 2-of-4 StarkWare multisig has an eight-day upgrade path. The roadmap describes broader validator responsibilities over time, but future decentralization should not be treated as current fact. Users therefore receive strong proof-based settlement assurances alongside ongoing operator, sequencing and governance dependencies.', [
      claim('Starknet separates sequenced execution from STARK proof verification on Ethereum.', ['source:starknet:l2beat', 'source:starknet:incident-2026'], 'State-validation panel and invalid-block incident.'),
      claim('A 9-of-12 Security Council has immediate reviewed authority and a 2-of-4 StarkWare multisig has an eight-day path.', ['source:starknet:l2beat'], 'Current governance and upgradeability panels.', { value: 'Security Council 9/12 immediate; StarkWare 2/4 with 8-day path' }),
      claim('Broader validator responsibility remains a roadmap objective rather than complete current operation.', ['source:starknet:roadmap'], 'Current decentralization roadmap.', { kind: 'fact' }),
    ]),
    token_and_value_capture: section('STRK pays network fees, participates in staking and supports governance. CoinGecko observed a $0.02476752 price, $168.72 million market capitalization and $247.68 million fully diluted value on August 3, 2026. Roughly 6.81 billion of the 10 billion total supply was circulating, and the token was about 99.44% below its recorded $4.41 high. Staking can link token demand to network security, but the rollout remains phased and fees alone do not establish holder return. DefiLlama reported $1.64 million of 30-day gross fees and only $11,749.53 of retained chain revenue; neither is profit. Token value depends on security demand, governance, supply distribution and broader market demand, not simply on transaction count.', [
      claim('STRK has fee, staking and governance roles and a 10 billion total supply.', ['source:starknet:strk', 'source:starknet:market'], 'Protocol role documentation and CoinGecko total_supply.', { value: 10000000000 }),
      claim('STRK market cap was $168,722,374 and FDV $247,675,036 on 2026-08-03.', ['source:starknet:market'], 'CoinGecko market_data fields.', { value: 'mcap 168722374; fdv 247675036' }),
      claim('Thirty-day retained revenue was $11,749.53 against $1,644,711.97 of gross fees.', ['source:starknet:fees', 'source:starknet:revenue'], 'DefiLlama total30d fields.', { value: 'fees 1644711.97; revenue 11749.53' }),
    ]),
    counterfactual: section('Starknet could have prioritized EVM compatibility, lowering migration friction and importing more existing applications, but that would constrain its purpose-built proving and language choices. It could have delayed mainnet until sequencing and governance were more decentralized, reducing early trust while also losing years of production learning. Faster multi-sequencer rollout might reduce concentration sooner, but the September 2025 transition shows that adding sequencers safely is itself complex. It could also maintain a more centralized system for longer to maximize operational consistency, at the cost of credible neutrality. The incidents support the value of staged testing and proof safeguards; they do not prove that any alternative architecture would avoid software bugs or win more demand.', [
      claim('EVM compatibility could reduce developer friction while limiting the custom Cairo design.', ['source:starknet:launch', 'source:starknet:l2beat'], 'Documented custom architecture establishes the alternative.', { confidence: 'medium', kind: 'counterfactual' }),
      claim('A faster multi-sequencer rollout could decentralize sooner while adding transition risk.', ['source:starknet:incident-2025', 'source:starknet:roadmap'], 'Observed sequencer-transition incident and current roadmap.', { confidence: 'medium', kind: 'counterfactual' }),
    ]),
    risks_and_unknowns: section('Starknet faces centralized sequencing and governance, software complexity, custom-tooling adoption, low token and revenue performance, and competition from EVM rollups. The two incidents show that blockifier, node and sequencer defects can interrupt liveness and trigger reorgs even when validity proofs preserve correctness. We do not have a current independent map of validator, sequencer, staking and infrastructure entities, nor a complete fee-flow reconciliation. We also cannot tell from aggregate volume how many users return or how concentrated liquidity is by application. Future decentralization steps, better incident testing and sustained application demand could reduce these risks. Until then, roadmap promises must stay separate from current production controls.', [
      claim('Recent incidents demonstrate software and liveness risk without a proof-system safety failure.', ['source:starknet:incident-2025', 'source:starknet:incident-2026'], 'Incident root causes and finalization outcomes.'),
      claim('Current governance retains concentrated emergency and upgrade authority.', ['source:starknet:l2beat'], 'Current governance risk panels.'),
      claim('Entity-level infrastructure concentration and repeat-user retention remain unresolved.', ['source:starknet:roadmap', 'source:starknet:volume'], 'Roadmap and aggregate data do not resolve these fields.', { kind: 'unknown' }),
    ]),
    lifecycle: section('Starknet is a mature technical project with a middling market outcome. It has operated since 2021, shipped a token and staking path, retained $166.5 million of TVL and $160.9 million of dollar stablecoins, and demonstrated that its proof layer can reject invalid execution. It has not reached the economic scale or operational decentralization implied by the original ambition. TVL remains about half below peak, recent DEX volume is falling and STRK is far below its high. The incidents also show that years in production do not eliminate liveness risk. The chain is neither new nor failing; it is in a proving phase where decentralization, developer adoption and economic retention must catch up with research credibility.', [
      claim('Starknet has more than four years of mainnet operating history.', ['source:starknet:launch'], 'Launch date through current review date.'),
      claim('The chain retains material capital but remains below peak and has weak recent market performance.', ['source:starknet:tvl', 'source:starknet:stables', 'source:starknet:volume', 'source:starknet:market'], 'Current capital, activity and token observations.'),
      claim('Middling reflects a durable operating network without leading adoption or complete decentralization.', ['source:starknet:l2beat', 'source:starknet:tvl', 'source:starknet:roadmap'], 'Current operation, capital and roadmap status.', { confidence: 'high', kind: 'inference' }),
    ]),
    outlook_and_watch: section('The base case is continued relevance as a specialized validity rollup, with adoption growing more slowly than the technology. Watch the rollout of validators and sequencer responsibilities, Security Council and multisig authority, proof latency, outages, reorgs and completed incident remediations. Track TVL, stablecoins, DEX volume, gross fees and retained revenue separately, then add application-level retained users. For STRK, monitor staking participation, entity concentration, circulating supply and fee demand. The call improves if several applications produce repeat use while governance decentralizes and liveness remains stable. It weakens if custom-tooling friction persists, economic activity continues declining or another transition causes a long outage or reorg.', [
      claim('Sustained application demand plus safer decentralization would strengthen the outcome.', ['source:starknet:roadmap', 'source:starknet:tvl', 'source:starknet:volume'], 'Current roadmap and economic baseline.', { confidence: 'medium', kind: 'inference' }),
      claim('Incident remediation and liveness must be monitored independently of proof correctness.', ['source:starknet:incident-2025', 'source:starknet:incident-2026'], 'Prior incidents separated liveness and safety outcomes.'),
      claim('Staking participation and entity concentration determine whether STRK security utility broadens.', ['source:starknet:strk', 'source:starknet:roadmap'], 'Staking role and decentralization roadmap.', { confidence: 'medium', kind: 'inference' }),
    ]),
  },
  metrics: [
    metric('tvl-latest', 'tvl', 'TVL', 166504229, ['source:starknet:tvl'], 'Latest historicalChainTvl point.'),
    metric('stablecoins-latest', 'stablecoin_supply', 'Dollar stablecoin supply', 160856376.813, ['source:starknet:stables'], 'peggedUSD field.'),
    metric('dex-volume-30d', 'dex_spot_volume', 'DEX volume (30d)', 106088540.66, ['source:starknet:volume'], 'total30d.', ['not_unique_users']),
    metric('fees-30d', 'fees', 'Fees (30d)', 1644711.97, ['source:starknet:fees'], 'total30d.'),
    metric('revenue-30d', 'protocol_revenue', 'Protocol revenue (30d)', 11749.53, ['source:starknet:revenue'], 'total30d.', ['gross_fees_not_profit']),
    metric('token-price', 'token_price', 'STRK price', 0.02476752, ['source:starknet:market'], 'current_price.usd.'),
    metric('token-market-cap', 'token_market_cap', 'STRK market capitalization', 168722374, ['source:starknet:market'], 'market_cap.usd.'),
    metric('token-fdv', 'token_fdv', 'STRK fully diluted value', 247675036, ['source:starknet:market'], 'fully_diluted_valuation.usd.'),
  ],
  events: [
    event('alpha-mainnet', 'launch', '2021-11-29', 'Starknet Alpha launched on Ethereum mainnet.', ['source:starknet:launch'], 'Dated launch announcement.'),
    event('sequencer-incident', 'incident', '2025-09-02', 'A multi-sequencer transition incident caused degraded service and reorgs.', ['source:starknet:incident-2025'], 'Incident date and timeline.'),
    event('blockifier-incident', 'incident', '2026-01-05', 'A blockifier bug caused downtime and an 18-minute reorg; proof rejection prevented invalid finalization.', ['source:starknet:incident-2026'], 'Incident date, timeline and proof outcome.'),
  ],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama and CoinGecko', historical_tvl_point_date: AS_OF, latest_tvl_usd: 166504229, peak_tvl_usd: 330779212, peak_tvl_date: '2024-03-26', tvl_drawdown_pct: 49.66, stablecoin_supply: { pegged_usd: 160856376.813 }, dex_volume_30d_usd: 106088540.66, dex_volume_change_1m_pct: -41.45, fees_30d_usd: 1644711.97, revenue_30d_usd: 11749.53 },
  forensicSummary: 'Starknet is a middling, technically durable validity rollup. It retained $166.5 million TVL and $160.9 million of dollar stablecoins on 2026-08-03, but recent DEX volume was weakening and retained revenue was low. The 2025 and 2026 incidents show meaningful liveness risk; the proof system prevented invalid execution from finalizing in the January incident.',
  forensicWhy: 'STARK proofs, Cairo and long research investment created technical differentiation and strong settlement safeguards. A custom developer stack, phased decentralization and operational complexity add friction. Current capital shows relevance, while modest economics and repeated liveness incidents prevent a stronger outcome.',
  whySources: ['source:starknet:launch', 'source:starknet:roadmap', 'source:starknet:incident-2025', 'source:starknet:incident-2026', 'source:starknet:l2beat', 'source:starknet:tvl', 'source:starknet:volume', 'source:starknet:fees', 'source:starknet:revenue'],
  choices: [
    { decision: 'Build around Cairo and STARK validity proofs instead of EVM equivalence.', consequence: 'Starknet gains a purpose-built proving stack while accepting greater developer migration friction.', confidence: 'high', source_refs: ['source:starknet:launch', 'source:starknet:l2beat'] },
    { decision: 'Decentralize sequencing, staking and governance in phases.', consequence: 'The network can learn in production while concentrated operational authority persists longer.', confidence: 'high', source_refs: ['source:starknet:roadmap', 'source:starknet:l2beat'] },
    { decision: 'Publish detailed incident reports and preserve proof rejection as a safety boundary.', consequence: 'Users gain evidence about failures and remediations, while the reports confirm ongoing liveness complexity.', confidence: 'high', source_refs: ['source:starknet:incident-2025', 'source:starknet:incident-2026'] },
  ],
  forensicCounterfactual: 'EVM compatibility could reduce application friction while constraining the custom proving stack. Delaying launch until full decentralization could reduce early trust assumptions while forfeiting production learning. Faster multi-sequencer rollout could reduce concentration sooner but adds transition risk, as the 2025 incident demonstrates. No alternative guarantees more adoption or fewer software defects.',
  counterfactualSources: ['source:starknet:launch', 'source:starknet:roadmap', 'source:starknet:incident-2025', 'source:starknet:l2beat'],
  watch: [
    { signal: 'Validators, sequencers, governance keys, proof latency, outages and incident remediation.', implication: 'Broader control and stable liveness would reduce current operational risk.', source_refs: ['source:starknet:roadmap', 'source:starknet:l2beat', 'source:starknet:incident-2025', 'source:starknet:incident-2026'] },
    { signal: 'TVL, stablecoins, volume, fees, revenue and application retention.', implication: 'Broad growth would show technical credibility converting into a stronger economy.', source_refs: ['source:starknet:tvl', 'source:starknet:stables', 'source:starknet:volume', 'source:starknet:fees', 'source:starknet:revenue'] },
  ],
  unknowns: [
    ['How concentrated are sequencers, validators, stake and infrastructure entities?', 'An independent entity-level operating map.'],
    ['How many applications have repeat paying users?', 'Application cohorts over two quarters.'],
    ['How do fees, staking rewards, sequencer costs and STRK value accrual reconcile?', 'A complete fee and security-budget statement.'],
    ['When will planned decentralization steps become verified production controls?', 'Mainnet activation plus independent control-path testing.'],
  ],
};

const specs = [xLayerSpec, plasmaSpec, megaethSpec, inkSpec, starknetSpec];

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
  generated_migration: '0080_chain_causal_completion_wave_d.sql',
  methodology: {
    scope: 'Canonical ten-section blockchain profiles for X Layer, Plasma, MegaETH, Ink, and Starknet.',
    observation_rule: `Volatile DefiLlama and CoinGecko fields were fetched between ${OBSERVED_AT} and ${ACCESSED_AT}. Exact provider values are retained because providers can revise a current-day observation.`,
    evidence_rule: 'Official sources establish documented design and choices. Independent sources test market outcomes, incidents and control assumptions. Aggregate metrics do not prove causality or user retention.',
    claim_rule: 'Material prose is supported by multiple atomic field-level claims with dated values, evidence locators, confidence, fact/inference/unknown labels and pending human review.',
    preservation_rule: 'Migration 0080 preserves all legacy chain_facts dimensions and chain_analysis fields. It adds forensic analysis, review metadata and an embedded canonical profile; sources merge by URL.',
  },
  cases,
};

for (const entry of document.cases) {
  const profileErrors = validateEntityProfile(entry.canonical_profile, {
    now: new Date(ACCESSED_AT),
  });
  if (profileErrors.length) {
    throw new Error(`${entry.chain}: invalid canonical profile: ${JSON.stringify(profileErrors)}`);
  }
  const sourceById = Object.fromEntries(entry.sources.map((item) => [item.id, item]));
  const forensicResult = validateForensicAnalysis(entry.forensic_analysis, { resolver: sourceById });
  if (forensicResult.errors.length || forensicResult.warnings.length || forensicResult.withheld_sections.length) {
    throw new Error(`${entry.chain}: invalid forensic profile: ${JSON.stringify(forensicResult)}`);
  }
  if (Object.keys(entry.canonical_profile.analysis.sections).join('|') !== ANALYSIS_SECTION_KEYS.join('|')) {
    throw new Error(`${entry.chain}: canonical section order drifted`);
  }
  if (new Set(entry.sources.map(({ id }) => id)).size !== entry.sources.length) {
    throw new Error(`${entry.chain}: duplicate source id`);
  }
  if (new Set(entry.sources.map(({ url }) => url)).size !== entry.sources.length) {
    throw new Error(`${entry.chain}: duplicate source URL`);
  }
  if (!entry.sources.some(({ role }) => role === 'primary')
      || !entry.sources.some(({ role }) => role === 'independent')) {
    throw new Error(`${entry.chain}: primary and independent evidence are both required`);
  }
  for (const item of entry.canonical_profile.claims) {
    if (!item.assertion || item.value == null || !item.as_of || !item.evidence_locator) {
      throw new Error(`${entry.chain}:${item.id}: incomplete atomic claim`);
    }
  }
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlJson(value) {
  return sqlText(JSON.stringify(value));
}

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
  const payload = {
    chain: entry.chain,
    sources: legacySources(entry),
    forensic_analysis: entry.forensic_analysis,
  };
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
    if (Buffer.byteLength(statement, 'utf8') > MAX_D1_STATEMENT_BYTES) {
      throw new Error(`${entry.chain}: ${label} statement exceeds D1 ceiling`);
    }
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
  if (Buffer.byteLength(statement, 'utf8') > MAX_D1_STATEMENT_BYTES) {
    throw new Error(`${entry.chain}: chain_analysis statement exceeds D1 ceiling`);
  }
  return statement;
}

function renderMigration(value = document) {
  const artifactHash = createHash('sha256')
    .update(`${JSON.stringify(value, null, 2)}\n`)
    .digest('hex');
  return `-- Generated by scripts/render-chain-causal-wave-0080.mjs.
-- Adds five review-state canonical profiles without overwriting legacy dossiers.
-- Sources merge by URL; every statement is idempotent and under the D1 statement ceiling.
-- artifact-sha256 ${artifactHash}

${value.cases.flatMap((entry) => [
    renderFactsStatement(entry),
    renderAnalysisStatement(entry),
  ]).join('\n')}`;
}

export { document, renderMigration };

function writeOutputs() {
  const artifact = `${JSON.stringify(document, null, 2)}\n`;
  writeFileSync(artifactPath, artifact);
  writeFileSync(migrationPath, renderMigration(document));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeOutputs();
}

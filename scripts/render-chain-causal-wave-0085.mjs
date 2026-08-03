#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYSIS_SECTION_KEYS, validateEntityProfile } from '../src/lib/entity-profile.js';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(root, 'docs/chain-causal-completion-wave-f-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0085_chain_causal_completion_wave_f.sql');
const AS_OF = '2026-08-03';
const OBSERVED_AT = '2026-08-03T19:24:23.300Z';
const ACCESSED_AT = '2026-08-03T19:24:34.000Z';
const NEXT_REVIEW_AT = '2026-08-10T19:24:34.000Z';
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

const lineaSources = [
  source('linea', 'overview', 'Linea network overview', 'https://linea.build/', 'Linea', { locator: 'Current network positioning, ETH gas and LINEA economics.' }),
  source('linea', 'roadmap', 'Linea product roadmap update', 'https://community.linea.build/t/linea-product-roadmap-update/10607', 'Linea', { publishedAt: '2025-08-08', locator: 'Dated roadmap targets and dual-burn design.' }),
  source('linea', 'token', '2025 launched a new era for Linea and L2s', 'https://linea.build/blog/2025-launched-a-new-era-for-linea-and-l2s', 'Linea', { publishedAt: '2025-12-11', locator: 'Dated token launch, allocation and burn totals.' }),
  source('linea', 'yield', 'Yield Boost is activated', 'https://linea.build/blog/yield-boost-is-activated', 'Linea', { publishedAt: '2026-03-30', locator: 'Activation and phased reserve-deployment limits.' }),
  source('linea', 'proving', 'Linea proved the EVM the hard way', 'https://linea.build/blog/linea-proved-the-evm-the-hard-way-heres-what-comes-next', 'Linea', { publishedAt: '2026-03-29', locator: 'Current proving architecture and forward work.' }),
  source('linea', 'l2beat', 'Linea risk analysis', 'https://l2beat.com/scaling/projects/linea', 'L2BEAT', { tier: 'A', role: 'independent', locator: 'Current stage, operator, upgrade, exit and incident panels.' }),
  ...marketSources('linea', 'Linea', 'linea'),
];

const dexalotSources = [
  source('dexalot', 'node', 'Dexalot L1 node guide', 'https://docs.dexalot.com/en/tutorials/runanode/', 'Dexalot', { locator: 'Current sovereign Avalanche L1 and exchange description.' }),
  source('dexalot', 'portfolio', 'Dexalot Portfolio contract', 'https://docs.dexalot.com/en/contracts/Portfolio.html', 'Dexalot', { locator: 'Origin-chain asset custody and balance representation.' }),
  source('dexalot', 'validation', 'Dexalot Validation Program', 'https://docs.dexalot.com/en/articles/validation/', 'Dexalot', { publishedAt: '2022-10-24', locator: 'Initial ten-node validator plan and foundation operation of eight nodes.' }),
  source('dexalot', 'litepaper', 'Dexalot litepaper', 'https://docs.dexalot.com/en/articles/litepaper/', 'Dexalot', { locator: 'ALOT gas, staking, governance and incentive design.' }),
  source('dexalot', 'avalanche', 'Avalanche Evergreen and application-specific networks', 'https://kr.avax.network/blog/avalanche-launches-evergreen-subnets-for-institutional-blockchain-deployments', 'Avalanche', { role: 'independent', locator: 'Third-party description of Dexalot as an on-chain order-book network.' }),
  ...marketSources('dexalot', 'Dexalot', 'dexalot'),
];

const cronosSources = [
  source('cronos', 'reserve', 'The new golden age for Cronos', 'https://blog.cronos.com/p/the-new-golden-age-for-cronos', 'Cronos Labs', { publishedAt: '2025-03-03', locator: 'Strategic-reserve proposal and proposed vesting.' }),
  source('cronos', 'economics', 'A new era for CRO', 'https://blog.cronos.com/p/a-new-era-for-cro', 'Cronos Labs', { publishedAt: '2026-05-05', locator: 'Dated staking and emission proposal; proposal language retained.' }),
  source('cronos', 'strategy', 'Cronos Labs names Ryan Wyatt as CEO', 'https://blog.cronos.com/p/cronos-labs-names-ryan-wyatt-as-ceo', 'Cronos Labs', { publishedAt: '2025-12-15', locator: 'Distribution-led financial-app strategy and current plans.' }),
  source('cronos', 'validators', 'Cronos EVM chain FAQ', 'https://github.com/crypto-org-chain/chain-main/discussions/442', 'Cronos', { locator: 'PoA validator admission and partner-validator description.' }),
  source('cronos', 'statement', 'Crypto.com crypto asset statement', 'https://crypto.com/document/crypto_asset_statement', 'Crypto.com', { locator: 'Current CRO utility, supply and multi-network boundary.' }),
  ...marketSources('cronos', 'Cronos', 'crypto-com-chain'),
];

const thorchainSources = [
  source('thorchain', 'overview', 'THORChain documentation', 'https://docs.thorchain.org/', 'THORChain', { locator: 'Current native cross-chain AMM and network description.' }),
  source('thorchain', 'technology', 'THORChain technology', 'https://docs.thorchain.org/technology', 'THORChain', { locator: 'Bifrost, threshold-signature vault and Cosmos SDK design.' }),
  source('thorchain', 'tcy', 'RUNE and TCY tokenomics', 'https://docs.thorchain.org/tokenomics-rune-tcy', 'THORChain', { locator: 'Current fee split and TCY income rights.' }),
  source('thorchain', 'thorfi', 'THORFi debt and TCY', 'https://dev.thorchain.org/concepts/tcy.html', 'THORChain', { locator: 'January 2025 suspension, approximate debt and conversion mechanism.' }),
  source('thorchain', 'thorswap', 'Protocol spotlight: THORSwap', 'https://blog.thorchain.org/protocol-spotlight-thorswap/', 'THORChain', { publishedAt: '2026-02-27', locator: 'THORSwap described as an independent frontend and aggregator.' }),
  source('thorchain', 'laundering', 'The blockchain fueling North Korea crypto laundering', 'https://www.coindesk.com/tech/2025/04/07/the-blockchain-fueling-north-korea-s-massive-crypto-laundering-operation', 'CoinDesk', { role: 'independent', publishedAt: '2025-04-07', locator: 'Independent reporting on illicit flow and interface-policy conflict.' }),
  ...marketSources('thorchain', 'Thorchain', 'thorchain'),
];

const abstractSources = [
  source('abstract', 'overview', 'What is Abstract', 'https://docs.abs.xyz/what-is-abstract', 'Abstract', { locator: 'Current ZK Stack Ethereum rollup description.' }),
  source('abstract', 'accounts', 'Abstract native account abstraction', 'https://docs.abs.xyz/how-abstract-works/native-account-abstraction', 'Abstract', { locator: 'Native account and paymaster behavior.' }),
  source('abstract', 'wallet', 'Abstract Global Wallet architecture', 'https://docs.abs.xyz/abstract-global-wallet/architecture', 'Abstract', { locator: 'Privy signer, contract-wallet and recovery architecture.' }),
  source('abstract', 'portal', 'Abstract Portal overview', 'https://docs.abs.xyz/portal/overview', 'Abstract', { locator: 'Portal discovery, wallet, XP, streaming and trading features.' }),
  source('abstract', 'l2beat', 'Abstract risk analysis', 'https://l2beat.com/scaling/projects/abstract', 'L2BEAT', { tier: 'A', role: 'independent', locator: 'Current stage, operator, upgrade and liveness incident panels.' }),
  ...marketSources('abstract', 'Abstract', null),
];

const lineaSpec = {
  slug: 'linea', name: 'Linea', classification: { subtype: 'Ethereum ZK rollup', tags: ['zk_rollup', 'ethereum', 'eth_gas', 'linea_token'], chains: ['Ethereum'], jurisdictions: [] },
  outcome: 'declining', forensicOutcome: 'declining', outcomeConfidence: 'high', qualityConfidence: 'medium', sources: lineaSources,
  statusSources: ['source:linea:overview', 'source:linea:l2beat', 'source:linea:tvl'], statusLocator: 'Current network, risk and capital observations show an operating rollup.',
  outcomeSources: ['source:linea:tvl', 'source:linea:volume', 'source:linea:fees', 'source:linea:market', 'source:linea:l2beat'], outcomeLocator: 'Peak-to-current capital, activity, token and control observations were reviewed together.',
  sections: {
    what_it_is: section('Linea is an Ethereum rollup built to behave like the EVM while proving batches with zero-knowledge proofs. Users pay gas in ETH. LINEA is a separate ecosystem token, not the gas asset. The chain now combines Ethereum settlement with a dual-burn design and a phased program that puts some bridged ETH to work. That program is live, but future proving, decentralization and performance targets remain roadmap items.', [claim('Linea is an Ethereum ZK rollup that uses ETH for gas.', ['source:linea:overview', 'source:linea:l2beat'], 'Current architecture and gas panels.'), claim('Future proving and decentralization targets are not treated as live controls.', ['source:linea:proving', 'source:linea:l2beat'], 'Roadmap compared with current controls.', { kind: 'unknown' })]),
    what_happened: section('Linea launched as Consensys’ EVM-equivalent rollup, introduced LINEA in 2025 and activated Yield Boost in March 2026. TVL reached $1.68 billion in September 2025 before falling to $26.87 million, a 98.40% drawdown. Dollar stablecoins were $37.46 million. Thirty-day DEX volume was $31.99 million and had jumped 526.98% from the prior provider comparison, while fees were $226,927.64 and retained revenue was $204,181.15.', [claim('LINEA launched in 2025 and Yield Boost activated in March 2026.', ['source:linea:token', 'source:linea:yield'], 'Dated launch and activation posts.'), claim('TVL fell from $1,682,939,926 to $26,874,022 by the review date.', ['source:linea:tvl'], 'Maximum and latest series points.', { value: 'peak 1682939926; latest 26874022' })]),
    why_this_outcome: section('Linea offered strong Ethereum compatibility and Consensys distribution, but those advantages did not keep peak capital on the chain. The token launch and Yield Boost added incentives after the large liquidity cycle had already turned. A one-month volume rebound is encouraging, yet it is too short to outweigh the TVL collapse or prove repeat demand. Centralized sequencing and no-delay upgrades also limit the trust advantage the rollup is trying to sell.', [claim('Compatibility and distribution did not prevent a 98.40% TVL drawdown.', ['source:linea:tvl', 'source:linea:overview'], 'Product position compared with capital history.', { confidence: 'medium', kind: 'inference' }), claim('The volume rebound does not reveal repeat users or incentive dependence.', ['source:linea:volume', 'source:linea:yield'], 'Aggregate volume and incentive design.', { kind: 'unknown' })]),
    strategic_choices: section('Linea chose close EVM compatibility, ETH gas and Ethereum settlement rather than a sovereign chain. It later launched LINEA with an ecosystem-heavy allocation and added a dual burn that links activity to ETH and LINEA. Yield Boost deploys only a staged share of bridged assets, beginning with a buffer rather than putting every deposit at risk. These choices improve familiarity and potential value capture, but they add token, reserve-management and governance complexity.', [claim('Linea chose ETH gas, Ethereum settlement and a separate ecosystem token.', ['source:linea:overview', 'source:linea:token'], 'Current network and token descriptions.'), claim('Yield Boost was activated as a staged program with a reserve buffer.', ['source:linea:yield'], 'Activation and ramp details.')]),
    operating_model: section('Linea batches transactions through a centralized sequencer and posts data to Ethereum. Proofs support settlement, but current users still depend on operator and upgrade controls. L2BEAT classified Linea Stage 0 at the review date, with no force-inclusion path and no user exit window before upgrades. Yield Boost adds external strategy and reserve dependencies to the bridge system. Those controls are different from the security of Ethereum itself.', [claim('Linea remained Stage 0 with centralized sequencing and no-delay upgrade risk.', ['source:linea:l2beat'], 'Current stage and risk panels.'), claim('Yield Boost adds strategy and reserve risks beyond ordinary rollup execution.', ['source:linea:yield', 'source:linea:l2beat'], 'Yield mechanism and bridge controls.', { confidence: 'medium', kind: 'inference' })]),
    token_and_value_capture: section('ETH remains the gas asset. LINEA adds governance and ecosystem incentives, while the dual-burn design destroys some ETH and LINEA as network activity generates fees. CoinGecko observed LINEA at $0.00223742, with a $54.10 million market capitalization and $160.19 million fully diluted value, about 95.21% below its recorded high. The burn is real but still small relative to token supply and cannot substitute for durable users and fees.', [claim('LINEA market capitalization was $54,099,879 at the observation date.', ['source:linea:market'], 'CoinGecko market_data.market_cap.usd.', { value: 54099879 }), claim('Dated burn totals should not be projected as a permanent burn rate.', ['source:linea:token', 'source:linea:overview'], 'Historical totals and current design.', { kind: 'unknown' })]),
    counterfactual: section('Linea could have stayed an ETH-only rollup without a new token, avoiding dilution and governance overhead but giving up an incentive and coordination tool. It could also have delayed bridge-yield deployment until control was broader, sacrificing near-term rewards for a simpler risk model. A stronger test than either story is whether liquidity and paying use stay after incentives normalize.', [claim('An ETH-only design would reduce token complexity while giving up LINEA incentives.', ['source:linea:overview', 'source:linea:token'], 'Before-and-after economic design.', { confidence: 'medium', kind: 'counterfactual' }), claim('Delaying Yield Boost would reduce strategy exposure while postponing rewards.', ['source:linea:yield', 'source:linea:l2beat'], 'Activated mechanism and current control risks.', { confidence: 'medium', kind: 'counterfactual' })]),
    risks_and_unknowns: section('The main risks are thin retained liquidity, centralized control, token dilution, bridge strategy losses and roadmap slippage. The 2025 token launch does not establish who will hold or use LINEA through a full market cycle. The reviewed sources also do not provide repeat-user cohorts, incentive-adjusted volume, a complete reserve stress test or a fully independent map of sequencer and upgrade authority.', [claim('Centralized sequencing, no-delay upgrades and bridge strategy exposure remain material.', ['source:linea:l2beat', 'source:linea:yield'], 'Current controls and yield system.'), claim('Repeat users, incentive-adjusted activity and full reserve stress results remain unresolved.', ['source:linea:volume', 'source:linea:yield'], 'Current sources omit those measurements.', { kind: 'unknown' })]),
    lifecycle: section('Linea is operating but declining. It has shipped a token, burns and Yield Boost, and recent DEX volume improved sharply. However, TVL is 98.40% below peak and LINEA is roughly 95% below its high. The next phase is not another announcement; it is whether capital, users and fees persist after the incentive ramp while operational control becomes less concentrated.', [claim('Linea has live burns and an activated Yield Boost program.', ['source:linea:token', 'source:linea:yield'], 'Dated shipped features.'), claim('Capital and token drawdowns support a declining lifecycle call.', ['source:linea:tvl', 'source:linea:market'], 'Peak-to-current capital and token observations.', { kind: 'inference' })]),
    outlook_and_watch: section('The base case is a smaller active rollup with occasional incentive-led bursts. The call improves if TVL holds, the volume rebound persists, fees grow without outsized rewards and L2BEAT records meaningful control improvements. Watch Yield Boost losses and buffers, burn transactions, token unlocks, sequencer incidents, upgrade delays and repeat-user activity. The call worsens if liquidity resumes falling or roadmap claims continue to outrun production controls.', [claim('Sustained capital, fees and independent control improvements would strengthen the outlook.', ['source:linea:tvl', 'source:linea:fees', 'source:linea:l2beat'], 'Current baseline for future review.', { confidence: 'medium', kind: 'inference' }), claim('Yield performance, token supply and roadmap activation require dated review.', ['source:linea:yield', 'source:linea:token', 'source:linea:proving'], 'Current programs and forward work.', { confidence: 'medium', kind: 'inference' })]),
  },
  metrics: [metric('tvl-latest','tvl','TVL',26874022,['source:linea:tvl'],'Latest historicalChainTvl point.'),metric('stablecoins-latest','stablecoin_supply','Dollar stablecoin supply',37455540.76503395,['source:linea:stables'],'peggedUSD field.'),metric('dex-volume-30d','dex_spot_volume','DEX volume (30d)',31985674.01,['source:linea:volume'],'total30d.',['not_unique_users']),metric('fees-30d','fees','Fees (30d)',226927.64,['source:linea:fees'],'total30d.'),metric('revenue-30d','protocol_revenue','Protocol revenue (30d)',204181.15,['source:linea:revenue'],'total30d.',['gross_fees_not_profit']),metric('token-price','token_price','LINEA price',0.00223742,['source:linea:market'],'current_price.usd.'),metric('token-market-cap','token_market_cap','LINEA market capitalization',54099879,['source:linea:market'],'market_cap.usd.'),metric('token-fdv','token_fdv','LINEA fully diluted value',160185732,['source:linea:market'],'fully_diluted_valuation.usd.')],
  events: [event('token','token_launch','2025-09-10','Linea launched the LINEA token.',['source:linea:token'],'Dated retrospective.'),event('peak-tvl','market_event','2025-09-21','Linea reached the maximum TVL point in the reviewed series.',['source:linea:tvl'],'Historical series maximum.'),event('yield','product_launch','2026-03-30','Linea activated Yield Boost with a phased reserve deployment.',['source:linea:yield'],'Dated activation post.')],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama, CoinGecko and L2BEAT', historical_tvl_point_date: AS_OF, latest_tvl_usd: 26874022, peak_tvl_usd: 1682939926, peak_tvl_date: '2025-09-21', tvl_drawdown_pct: 98.40, stablecoin_supply: { pegged_usd: 37455540.76503395 }, dex_volume_30d_usd: 31985674.01, dex_volume_change_1m_pct: 526.98, fees_30d_usd: 226927.64, revenue_30d_usd: 204181.15 },
  forensicSummary: 'Linea is active but declining: TVL is 98.40% below peak despite a sharp one-month volume rebound. Its token, burns and Yield Boost are live, while future proving and decentralization targets remain roadmap work.',
  forensicWhy: 'Close EVM compatibility and Consensys distribution brought an early liquidity cycle, but did not retain peak capital. Later token and yield incentives have not yet proved durable demand, while centralized control weakens the trust proposition.', whySources: ['source:linea:overview','source:linea:tvl','source:linea:volume','source:linea:token','source:linea:yield','source:linea:l2beat'],
  choices: [{decision:'Use Ethereum settlement and ETH gas.',consequence:'Users get familiar tooling while depending on rollup operators.',confidence:'high',source_refs:['source:linea:overview','source:linea:l2beat']},{decision:'Launch LINEA and dual burns.',consequence:'Activity gains token value capture while adding dilution and governance complexity.',confidence:'high',source_refs:['source:linea:token']},{decision:'Activate phased Yield Boost.',consequence:'Deposits can earn yield while the bridge takes strategy and reserve risk.',confidence:'high',source_refs:['source:linea:yield']}],
  forensicCounterfactual: 'An ETH-only rollup would avoid token complexity. Delaying yield would reduce strategy exposure. Persistent liquidity and fees after incentives normalize are the observable tests.', counterfactualSources: ['source:linea:overview','source:linea:token','source:linea:yield','source:linea:l2beat'],
  watch: [{signal:'TVL, repeat volume, fees, burns and incentive-adjusted users.',implication:'Persistence would show demand beyond a short rebound.',source_refs:['source:linea:tvl','source:linea:volume','source:linea:fees','source:linea:token']},{signal:'Yield losses, reserve buffers, sequencer incidents and upgrade controls.',implication:'Reliable operation and broader control would reduce current risk.',source_refs:['source:linea:yield','source:linea:l2beat']}],
  unknowns: [['How much volume remains after incentives normalize?','A two-quarter incentive-adjusted cohort study.'],['What losses can Yield Boost absorb?','A published stress test and reconciled reserve statement.'],['Who controls sequencer and upgrades by beneficial owner?','An independent entity-level control map.'],['When do roadmap proving changes become production defaults?','Versioned mainnet activation and independent verification.']],
};

const dexalotSpec = {
  slug: 'dexalot', name: 'Dexalot', classification: { subtype: 'exchange-specific Avalanche L1', tags: ['avalanche_l1', 'order_book', 'appchain', 'omnichain'], chains: ['Avalanche'], jurisdictions: [] },
  outcome: 'middling', forensicOutcome: 'middling', outcomeConfidence: 'medium', qualityConfidence: 'medium', sources: dexalotSources,
  statusSources: ['source:dexalot:node','source:dexalot:tvl','source:dexalot:volume'], statusLocator: 'Current node documentation and nonzero exchange activity show an operating application chain.',
  outcomeSources: ['source:dexalot:tvl','source:dexalot:volume','source:dexalot:fees','source:dexalot:revenue','source:dexalot:market','source:dexalot:validation'], outcomeLocator: 'Exchange flow, represented capital, economics, token and initial controls were reviewed without double counting.',
  sections: {
    what_it_is: section('Dexalot is both an exchange and the Avalanche L1 built to run that exchange. Its central limit order book supports limit and market orders, swaps from connected chains and programmatic trading. Assets can remain locked on their origin chains while balances are represented on Dexalot L1, so the chain’s TVL is not a complete measure of order-book liquidity. Its chain activity and exchange activity are the same business flow and must not be added together.', [claim('Dexalot operates a central limit order book on its own sovereign Avalanche L1.', ['source:dexalot:node','source:dexalot:avalanche'], 'Current operator and Avalanche descriptions.'),claim('Origin-chain assets can be represented on Dexalot without moving all value into chain TVL.', ['source:dexalot:portfolio'], 'Portfolio custody and messaging design.')]),
    what_happened: section('Dexalot moved from an Avalanche C-Chain application to a dedicated exchange chain. By 2026-08-03, reported TVL was $1.41 million, down 85.65% from its January 2025 peak. The same chain recorded $393.17 million in 30-day DEX volume, up 166.48% from the provider’s prior-month comparison. Fees were $21,501 and retained revenue was $8,525. Those numbers show a working exchange, but not a broad, independent chain economy.', [claim('Dexalot migrated its order book to a dedicated Avalanche application chain.', ['source:dexalot:node','source:dexalot:avalanche'], 'Current and historical network descriptions.'),claim('TVL fell from $9,816,833 to $1,409,039 while 30-day exchange volume reached $393,174,818.', ['source:dexalot:tvl','source:dexalot:volume'], 'Maximum/latest TVL and total30d volume.', { value: 'peak tvl 9816833; latest tvl 1409039; volume 393174818' })]),
    why_this_outcome: section('The dedicated chain gives the order book predictable execution and lets Dexalot shape fees, APIs and cross-chain settlement around trading. That product focus helped preserve meaningful flow despite a small capital footprint. The trade-off is concentration: one exchange is effectively the chain’s reason to exist, and its initial validator plan placed eight of ten nodes with the foundation. Rising volume can therefore coexist with weak diversification, limited revenue and a token that is far below its high.', [claim('The appchain design plausibly improves exchange execution while concentrating demand in one product.', ['source:dexalot:node','source:dexalot:volume'], 'Architecture and current flow.', { confidence: 'medium', kind: 'inference' }),claim('Current validator ownership and repeat-trader retention were not independently verified.', ['source:dexalot:validation','source:dexalot:volume'], 'Initial validator plan and aggregate volume.', { kind: 'unknown' })]),
    strategic_choices: section('Dexalot chose a sovereign order-book chain instead of remaining only a smart contract on Avalanche C-Chain. It keeps many assets on origin chains and communicates balances into the trading system, reducing the need to bridge every asset into one pool. It also made ALOT the gas, staking and governance asset. These choices create a faster, specialized product, but they concentrate security, token demand and chain survival around the exchange operator and its cross-chain messaging.', [claim('Dexalot chose its own Avalanche L1 for exchange execution.', ['source:dexalot:node','source:dexalot:avalanche'], 'Current network description.'),claim('Dexalot chose origin-chain custody with represented balances for connected assets.', ['source:dexalot:portfolio'], 'Portfolio contract model.')]),
    operating_model: section('Dexalot uses an Avalanche-compatible validator set and EVM contracts to run an on-chain order book. The launch plan described ten nodes, eight operated by the foundation and two by vetted outside users. That is a dated starting configuration, not proof of current ownership. The Portfolio layer and messaging systems coordinate deposits and withdrawals across chains, while users depend on exchange contracts, admin roles, validator liveness and message delivery.', [claim('The documented launch plan assigned eight of ten validators to the foundation.', ['source:dexalot:validation'], 'Initial validator allocation.', { value: '8 of 10 initial nodes' }),claim('The current beneficial ownership of validators is unresolved.', ['source:dexalot:validation','source:dexalot:node'], 'No current entity map in reviewed sources.', { kind: 'unknown' })]),
    token_and_value_capture: section('ALOT pays gas and is described as a staking, governance and incentive token. CoinGecko observed a $0.00979093 price, $625,917 market capitalization and $979,093 fully diluted value, about 99.65% below its recorded high. The chain produced fees and some retained revenue, but the reviewed sources do not establish that holders receive a continuing contractual share of exchange profit. Early fee-sharing language was time-bounded and should not be projected forward.', [claim('ALOT market capitalization was $625,917 at the observation date.', ['source:dexalot:market'], 'CoinGecko market_data.market_cap.usd.', { value: 625917 }),claim('Current continuing profit rights for ALOT holders were not established.', ['source:dexalot:litepaper','source:dexalot:validation'], 'Token design and time-bounded launch incentives.', { kind: 'unknown' })]),
    counterfactual: section('Dexalot could have stayed on Avalanche C-Chain, reusing a broader validator set and ecosystem while accepting shared blockspace and less control. It could also have used a conventional AMM, simplifying liquidity accounting but giving up a professional order-book experience. The practical test is whether the dedicated chain produces better spreads, retention and fee economics after validator and messaging costs, not whether it can report a large gross volume number.', [claim('Remaining on C-Chain would reduce sovereign infrastructure while giving up dedicated execution.', ['source:dexalot:node','source:dexalot:avalanche'], 'Host-chain versus appchain design.', { confidence: 'medium', kind: 'counterfactual' }),claim('An AMM would simplify pool accounting while changing the intended trading product.', ['source:dexalot:node'], 'Order-book product scope.', { confidence: 'medium', kind: 'counterfactual' })]),
    risks_and_unknowns: section('The main risks are single-product dependence, validator concentration, cross-chain message failures, contract admin power and thin retained economics. TVL understates origin-chain assets, but high gross volume can also overstate durable users because the provider does not identify market makers or repeat cohorts. We lack a current validator map, audited cross-chain exposure, full operator costs and a clear statement of current ALOT fee rights.', [claim('Dexalot depends on validators, message delivery, exchange contracts and admin roles.', ['source:dexalot:portfolio','source:dexalot:validation'], 'Custody and control descriptions.'),claim('Repeat traders, validator ownership and complete operator costs remain unknown.', ['source:dexalot:volume','source:dexalot:fees','source:dexalot:revenue'], 'Aggregate provider fields omit those details.', { kind: 'unknown' })]),
    lifecycle: section('Dexalot is operating and middling. It has a real order-book product and strong recent volume, but only modest fees, low reported TVL and concentrated product risk. The exchange should not be scored twice as both a successful chain and a separate venue. The next lifecycle test is whether rising flow produces retained users, revenue and broader security without depending on one operator or temporary market-making activity.', [claim('Dexalot remains active with $393.17 million in 30-day exchange volume.', ['source:dexalot:volume','source:dexalot:node'], 'Current provider and product observations.'),claim('Product concentration and weak retained economics support a middling call.', ['source:dexalot:fees','source:dexalot:revenue','source:dexalot:validation'], 'Economics and control baseline.', { confidence: 'medium', kind: 'inference' })]),
    outlook_and_watch: section('The base case is a useful niche exchange chain rather than a broad L1 ecosystem. The call improves if volume remains high, spreads stay competitive, revenue grows, validators broaden and cross-chain withdrawals stay reliable. Watch market-maker concentration, repeat traders, validator entities, message failures, contract upgrades, fee distribution and ALOT supply. The call worsens if flow disappears when incentives or market makers leave, or if a bridge or validator incident interrupts withdrawals.', [claim('Persistent flow, revenue and broader validators would strengthen the outlook.', ['source:dexalot:volume','source:dexalot:revenue','source:dexalot:validation'], 'Current baseline for future review.', { confidence: 'medium', kind: 'inference' }),claim('Withdrawal reliability and represented balances require continued review.', ['source:dexalot:portfolio'], 'Cross-chain custody and messaging model.', { confidence: 'medium', kind: 'inference' })]),
  },
  metrics: [metric('tvl-latest','tvl','Reported chain TVL',1409039,['source:dexalot:tvl'],'Latest historicalChainTvl point.',['origin_chain_assets_excluded']),metric('dex-volume-30d','dex_spot_volume','Exchange volume (30d)',393174818,['source:dexalot:volume'],'total30d; same flow as the Dexalot exchange.',['do_not_add_to_exchange_volume','not_unique_users']),metric('fees-30d','fees','Fees (30d)',21501,['source:dexalot:fees'],'total30d.'),metric('revenue-30d','protocol_revenue','Protocol revenue (30d)',8525,['source:dexalot:revenue'],'total30d.',['gross_fees_not_profit']),metric('token-price','token_price','ALOT price',0.00979093,['source:dexalot:market'],'current_price.usd.'),metric('token-market-cap','token_market_cap','ALOT market capitalization',625917,['source:dexalot:market'],'market_cap.usd.'),metric('token-fdv','token_fdv','ALOT fully diluted value',979093,['source:dexalot:market'],'fully_diluted_valuation.usd.')],
  events: [event('validation-plan','governance','2022-10-24','Dexalot published an initial ten-node validator plan.',['source:dexalot:validation'],'Dated validation article.'),event('l1','launch','2023-02-01','Dexalot moved its order book to a dedicated Avalanche network.',['source:dexalot:avalanche','source:dexalot:node'],'Launch-era and current descriptions.'),event('peak-tvl','market_event','2025-01-08','Dexalot reached the maximum TVL point in the reviewed series.',['source:dexalot:tvl'],'Historical series maximum.')],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama and CoinGecko', historical_tvl_point_date: AS_OF, latest_tvl_usd: 1409039, peak_tvl_usd: 9816833, peak_tvl_date: '2025-01-08', tvl_drawdown_pct: 85.65, dex_volume_30d_usd: 393174818, dex_volume_change_1m_pct: 166.48, fees_30d_usd: 21501, revenue_30d_usd: 8525, comparability_note: 'Dexalot chain volume is the exchange flow and is not additive. TVL excludes assets held on connected origin chains.' },
  forensicSummary: 'Dexalot is a working but concentrated exchange chain. Thirty-day volume was $393.17 million, but reported TVL was $1.41 million and retained revenue was $8,525. Chain and exchange flow are the same activity, not two successes.',
  forensicWhy: 'A purpose-built order book gives Dexalot predictable execution and a clear product. The same focus creates single-product and validator concentration, while represented origin-chain balances make TVL incomplete and gross volume says little about repeat demand.', whySources: ['source:dexalot:node','source:dexalot:portfolio','source:dexalot:validation','source:dexalot:tvl','source:dexalot:volume','source:dexalot:revenue'],
  choices: [{decision:'Move the order book to a sovereign Avalanche L1.',consequence:'Trading gains dedicated execution while the exchange assumes chain operations.',confidence:'high',source_refs:['source:dexalot:node','source:dexalot:avalanche']},{decision:'Represent assets locked on origin chains.',consequence:'Users avoid moving every asset into one chain, but liquidity is harder to measure.',confidence:'high',source_refs:['source:dexalot:portfolio']},{decision:'Use ALOT for gas, staking and governance.',consequence:'Token demand is tied to one exchange chain and its security model.',confidence:'high',source_refs:['source:dexalot:litepaper']}],
  forensicCounterfactual: 'Staying on C-Chain would reuse broader infrastructure while giving up dedicated execution. An AMM would simplify liquidity accounting but change the product. Spreads, retention and net economics are the tests.', counterfactualSources: ['source:dexalot:node','source:dexalot:portfolio','source:dexalot:avalanche'],
  watch: [{signal:'Volume, spreads, repeat traders, fees and retained revenue.',implication:'Persistence would support real exchange demand rather than temporary flow.',source_refs:['source:dexalot:volume','source:dexalot:fees','source:dexalot:revenue']},{signal:'Validator entities, withdrawals, messaging incidents and contract upgrades.',implication:'Broader control and reliable exits would reduce concentration risk.',source_refs:['source:dexalot:validation','source:dexalot:portfolio']}],
  unknowns: [['Who beneficially owns the current validator set?','An independent current entity map.'],['How much volume comes from repeat traders?','A two-quarter wallet and market-maker cohort study.'],['What assets and liabilities sit on connected origin chains?','A reconciled cross-chain reserve statement.'],['What are current ALOT holder fee rights?','Current governing contracts and executed distributions.']],
};

const cronosSpec = {
  slug: 'cronos', name: 'Cronos', classification: { subtype: 'Crypto.com-distributed EVM layer 1', tags: ['evm','cosmos_sdk','crypto_com','proof_of_authority'], chains: [], jurisdictions: [] },
  outcome: 'declining', forensicOutcome: 'declining', outcomeConfidence: 'high', qualityConfidence: 'medium', sources: cronosSources,
  statusSources: ['source:cronos:statement','source:cronos:tvl','source:cronos:fees'], statusLocator: 'Current network documentation and nonzero capital and fees show an operating EVM chain.',
  outcomeSources: ['source:cronos:tvl','source:cronos:volume','source:cronos:fees','source:cronos:revenue','source:cronos:market','source:cronos:reserve'], outcomeLocator: 'Capital, flow, economics, token and strategic decisions were reviewed together.',
  sections: {
    what_it_is: section('Cronos is the EVM-compatible chain distributed through Crypto.com’s exchange, wallet and consumer products. It is built with Cosmos SDK and Ethermint technology, uses CRO for gas and relies on an admitted validator group. This report covers the Cronos EVM chain, not Cronos POS or Cronos zkEVM. The operator’s newer plan is to build first-party financial applications for Crypto.com users, but planned apps are not counted as live demand.', [claim('Cronos is an EVM-compatible Cosmos SDK chain using CRO for gas.', ['source:cronos:statement','source:cronos:validators'], 'Current network and asset descriptions.'),claim('Cronos EVM is distinct from Cronos POS and Cronos zkEVM.', ['source:cronos:statement'], 'Current multi-network statement.')]),
    what_happened: section('Crypto.com gave Cronos an immediate distribution channel, and TVL peaked at $3.22 billion in April 2022. By 2026-08-03, TVL was $253.50 million, a 92.13% drawdown, with $179.54 million in dollar stablecoins. Thirty-day DEX volume was $39.91 million, down 67.35% from the prior provider comparison. Fees were $603,614.39 and retained revenue was $121,290.02. In 2025, governance restored a large CRO strategic reserve after the 2021 burn.', [claim('TVL fell from $3,220,325,493 to $253,500,085 by the review date.', ['source:cronos:tvl'], 'Maximum and latest series points.', { value: 'peak 3220325493; latest 253500085' }),claim('Cronos published a 2025 plan to restore roughly 70 billion CRO to a strategic reserve.', ['source:cronos:reserve','source:cronos:statement'], 'Dated proposal and current supply statement.')]),
    why_this_outcome: section('Crypto.com distribution was Cronos’ largest advantage, but a general-purpose EVM chain did not keep most of the 2022 capital cycle. Users could access similar DeFi products on larger networks, and current DEX volume is shrinking. The 70 billion CRO reserve reversal also weakened the scarcity story after the earlier burn and increased governance concentration. Cronos Labs now argues that first-party apps distributed through Crypto.com are a better strategy; that is a plausible response, not evidence of a completed turnaround.', [claim('Distribution supported adoption but did not prevent a 92.13% TVL drawdown.', ['source:cronos:tvl','source:cronos:strategy'], 'Capital history and operator strategy.', { confidence: 'medium', kind: 'inference' }),claim('The first-party application pivot remains a plan until products and cash flows are verified.', ['source:cronos:strategy'], 'Forward-looking strategy language.', { kind: 'unknown' })]),
    strategic_choices: section('Cronos chose an EVM chain tied closely to Crypto.com distribution and an invitation-based validator model. Governance later reversed most of the 2021 burn by creating a strategic reserve with a long vesting schedule. Cronos Labs then shifted from selling generic blockspace toward first-party financial applications and proposed new staking and emission rules in 2026. Each step seeks stronger distribution or economics, but the supply reversal asks token holders to trust concentrated long-term stewardship.', [claim('Cronos chose admitted partner validators and Crypto.com-led distribution.', ['source:cronos:validators','source:cronos:strategy'], 'Validator and distribution descriptions.'),claim('The 2026 emission and staking changes were published as a proposal, not assumed live.', ['source:cronos:economics'], 'Proposal wording.', { kind: 'unknown' })]),
    operating_model: section('Cronos EVM uses proof-of-authority-style admission: validator participation is not simply open to any holder who stakes CRO. That can provide coordinated operations and known counterparties, but it concentrates censorship, upgrade and governance power. Crypto.com distribution is a commercial advantage rather than an independent security guarantee. The reviewed sources do not provide a current beneficial-owner map for validators or a complete separation of Cronos Labs, Crypto.com and partner control.', [claim('Cronos EVM uses an invitation-based partner validator model.', ['source:cronos:validators'], 'Official validator FAQ.'),claim('Current validator beneficial ownership and operator separation remain unresolved.', ['source:cronos:validators','source:cronos:strategy'], 'No current entity-level control map.', { kind: 'unknown' })]),
    token_and_value_capture: section('CRO pays gas and supports staking and governance across the Cronos ecosystem. CoinGecko observed CRO at $0.054896, with a $2.60 billion market capitalization and $5.43 billion fully diluted value, about 93.84% below its recorded high. The restored strategic reserve greatly expanded the long-term supply overhang. Proposed emission decay and lock tiers may change staking incentives, but this review does not call them active until executed parameters and token flows are verified.', [claim('CRO market capitalization was $2,596,633,658 at the observation date.', ['source:cronos:market'], 'CoinGecko market_data.market_cap.usd.', { value: 2596633658 }),claim('The 2026 staking and emission design remains unverified as a live production rule.', ['source:cronos:economics','source:cronos:statement'], 'Proposal compared with current asset statement.', { kind: 'unknown' })]),
    counterfactual: section('Cronos could have kept the 2021 burn intact, preserving scarcity while giving up a large treasury for incentives and strategic deals. It could also have focused on a small number of Crypto.com-native products from launch instead of competing as another general EVM chain. A more permissionless validator set would reduce control concentration while making coordination harder. The measurable test is whether new applications create paying demand that exceeds dilution and operating cost.', [claim('Keeping the burn would reduce supply overhang while limiting treasury resources.', ['source:cronos:reserve','source:cronos:statement'], 'Burn reversal and current supply.', { confidence: 'medium', kind: 'counterfactual' }),claim('An earlier first-party app focus might improve differentiation while narrowing the builder market.', ['source:cronos:strategy'], 'Operator explanation of the strategy change.', { confidence: 'medium', kind: 'counterfactual' })]),
    risks_and_unknowns: section('The major risks are token dilution, concentrated governance, admitted validators, dependence on Crypto.com distribution and weak DeFi retention. Cronos’ umbrella branding can also cause analysts to mix EVM, POS and zkEVM activity. We lack repeat-user cohorts, an independent validator ownership map, a reconciled reserve unlock schedule and verified first-party app economics. Proposed economic changes should remain proposals until on-chain execution is confirmed.', [claim('CRO reserve supply and admitted validators create concentration risk.', ['source:cronos:reserve','source:cronos:validators'], 'Supply and control design.'),claim('User retention, reserve unlock reconciliation and new-app economics remain unresolved.', ['source:cronos:tvl','source:cronos:volume','source:cronos:strategy'], 'Current sources omit those measurements.', { kind: 'unknown' })]),
    lifecycle: section('Cronos is operating but declining. It still holds meaningful capital and stablecoins, and Crypto.com remains a strong distribution channel. However, TVL is 92.13% below peak, monthly DEX flow is contracting and retained revenue is small compared with the token’s fully diluted value. The first-party app strategy may create a second act, but the lifecycle call changes only after those products produce durable users, fees and transparent value capture.', [claim('Cronos remains operating with nonzero capital, stablecoins, volume and fees.', ['source:cronos:tvl','source:cronos:stables','source:cronos:volume','source:cronos:fees'], 'Current provider observations.'),claim('Capital drawdown and weaker monthly flow support a declining call.', ['source:cronos:tvl','source:cronos:volume'], 'Peak-to-latest TVL and change_1m.', { kind: 'inference' })]),
    outlook_and_watch: section('The base case is an active but smaller Crypto.com-linked chain while first-party finance products are built. The call improves if new apps launch, repeat users grow, fees and retained revenue rise, and reserve unlocks remain transparent. Watch CRO unlocks, validator entities, DEX liquidity, stablecoin balances, app-level revenue and whether proposed emissions become live. The call worsens if distribution produces promotional activity without durable cash flow or if supply growth overwhelms demand.', [claim('Durable first-party demand and transparent reserve flows would strengthen the outlook.', ['source:cronos:strategy','source:cronos:reserve','source:cronos:revenue'], 'Strategy and current economics baseline.', { confidence: 'medium', kind: 'inference' }),claim('Validator concentration and multi-network activity boundaries require continued review.', ['source:cronos:validators','source:cronos:statement'], 'Control and scope boundaries.', { confidence: 'medium', kind: 'inference' })]),
  },
  metrics: [metric('tvl-latest','tvl','TVL',253500085,['source:cronos:tvl'],'Latest historicalChainTvl point.'),metric('stablecoins-latest','stablecoin_supply','Dollar stablecoin supply',179541902.7834992,['source:cronos:stables'],'peggedUSD field.'),metric('dex-volume-30d','dex_spot_volume','DEX volume (30d)',39914574.99,['source:cronos:volume'],'total30d.',['not_unique_users']),metric('fees-30d','fees','Fees (30d)',603614.39,['source:cronos:fees'],'total30d.'),metric('revenue-30d','protocol_revenue','Protocol revenue (30d)',121290.02,['source:cronos:revenue'],'total30d.',['gross_fees_not_profit']),metric('token-price','token_price','CRO price',0.054896,['source:cronos:market'],'current_price.usd.'),metric('token-market-cap','token_market_cap','CRO market capitalization',2596633658,['source:cronos:market'],'market_cap.usd.'),metric('token-fdv','token_fdv','CRO fully diluted value',5425772418,['source:cronos:market'],'fully_diluted_valuation.usd.')],
  events: [event('launch','launch','2021-11-08','Cronos EVM launched as a Crypto.com-linked EVM chain.',['source:cronos:statement'],'Current network history.'),event('peak-tvl','market_event','2022-04-05','Cronos reached the maximum TVL point in the reviewed series.',['source:cronos:tvl'],'Historical series maximum.'),event('reserve-vote','governance','2025-03-17','Voting ended on the proposal to restore roughly 70 billion CRO to a strategic reserve.',['source:cronos:reserve'],'Published governance schedule; current reserve state is established separately.')],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama and CoinGecko', historical_tvl_point_date: AS_OF, latest_tvl_usd: 253500085, peak_tvl_usd: 3220325493, peak_tvl_date: '2022-04-05', tvl_drawdown_pct: 92.13, stablecoin_supply: { pegged_usd: 179541902.7834992 }, dex_volume_30d_usd: 39914574.99, dex_volume_change_1m_pct: -67.35, fees_30d_usd: 603614.39, revenue_30d_usd: 121290.02 },
  forensicSummary: 'Cronos remains active through Crypto.com distribution, but TVL is 92.13% below peak and monthly DEX volume is down 67.35%. A first-party app pivot is a plan, while the 70 billion CRO reserve is a live supply overhang.',
  forensicWhy: 'Crypto.com distribution created an early advantage but generic EVM products did not retain peak capital. The reserve reversal weakened scarcity and concentrated future supply, while first-party finance may improve differentiation only if it ships and earns.', whySources: ['source:cronos:strategy','source:cronos:reserve','source:cronos:statement','source:cronos:tvl','source:cronos:volume','source:cronos:revenue'],
  choices: [{decision:'Build an EVM chain around Crypto.com distribution.',consequence:'Cronos gains a user funnel while depending on one commercial ecosystem.',confidence:'high',source_refs:['source:cronos:statement','source:cronos:strategy']},{decision:'Use admitted partner validators.',consequence:'Operations are coordinated while control remains concentrated.',confidence:'high',source_refs:['source:cronos:validators']},{decision:'Restore a 70 billion CRO strategic reserve.',consequence:'The treasury expands while scarcity and governance credibility weaken.',confidence:'high',source_refs:['source:cronos:reserve','source:cronos:statement']}],
  forensicCounterfactual: 'Keeping the burn would preserve scarcity but reduce treasury resources. An earlier first-party app focus might differentiate Cronos sooner. Paying demand net of dilution is the decisive test.', counterfactualSources: ['source:cronos:reserve','source:cronos:strategy','source:cronos:statement'],
  watch: [{signal:'App launches, repeat users, TVL, stablecoins, fees and retained revenue.',implication:'Broad growth would support a real second act.',source_refs:['source:cronos:strategy','source:cronos:tvl','source:cronos:stables','source:cronos:fees','source:cronos:revenue']},{signal:'Reserve unlocks, emission rules, validator entities and governance participation.',implication:'Transparent supply and broader control would reduce current risk.',source_refs:['source:cronos:reserve','source:cronos:economics','source:cronos:validators']}],
  unknowns: [['Which first-party apps are live and earning?','Audited product-level users, fees and revenue.'],['Who beneficially owns current validators?','An independent entity-level validator map.'],['What is the reconciled reserve unlock schedule?','On-chain treasury and circulation reconciliation.'],['Did the 2026 emission proposal execute?','Mainnet parameters and observed token flows.']],
};

const thorchainSpec = {
  slug: 'thorchain', name: 'THORChain', chain: 'Thorchain', classification: { subtype: 'cross-chain liquidity layer 1', tags: ['cosmos_sdk','cross_chain_amm','threshold_signatures','thorfi_restructuring'], chains: [], jurisdictions: [] },
  outcome: 'declining', forensicOutcome: 'declining', outcomeConfidence: 'high', qualityConfidence: 'medium', sources: thorchainSources,
  statusSources: ['source:thorchain:overview','source:thorchain:tvl','source:thorchain:volume'], statusLocator: 'Current protocol documentation and nonzero swap flow show an operating network.',
  outcomeSources: ['source:thorchain:tvl','source:thorchain:volume','source:thorchain:fees','source:thorchain:revenue','source:thorchain:thorfi','source:thorchain:market'], outcomeLocator: 'Swap activity, capital, economics, token and the ThorFi creditor event were reviewed together.',
  sections: {
    what_it_is: section('THORChain is a sovereign network for swapping native assets across blockchains without wrapping them into one host chain. Validators jointly control threshold-signature vaults, and liquidity pools pair assets with RUNE. Wallets and interfaces such as THORSwap route users into the protocol, but they are separate businesses and control their own screens. The base network, its frontends and the failed ThorFi savings and lending products must be evaluated separately.', [claim('THORChain uses validator-controlled vaults and RUNE-paired pools for native cross-chain swaps.', ['source:thorchain:overview','source:thorchain:technology'], 'Current protocol and technology descriptions.'),claim('THORSwap is an independent frontend rather than the THORChain network itself.', ['source:thorchain:thorswap'], 'Dated protocol spotlight.')]),
    what_happened: section('THORChain became a major cross-chain swap backend, then suffered a severe ThorFi liability crisis. Lending and Savers withdrawals were suspended on January 23, 2025 with about $210 million of unserviceable debt. Governance converted claims into 210 million TCY tokens that receive 10% of network income in RUNE; that is a restructuring, not cash repayment. By 2026-08-03, TVL was $28.80 million, 94.73% below peak, while 30-day swap volume remained $765.92 million.', [claim('ThorFi lending and savings faced about $210 million of unserviceable debt and suspended withdrawals in January 2025.', ['source:thorchain:thorfi'], 'Current debt and suspension history.', { value: 210000000 }),claim('TCY converted claims into a 10% network-income right rather than immediate repayment.', ['source:thorchain:tcy','source:thorchain:thorfi'], 'TCY issuance and revenue-share terms.')]),
    why_this_outcome: section('The swap network solved a real problem and still carries substantial flow through wallets and aggregators. ThorFi took a different risk: zero-interest, no-liquidation lending depended on RUNE economics and created liabilities the system could not service after market stress. TCY socialized those claims into future network income, preserving operation but transferring recovery risk to creditors. Illicit-flow scrutiny also exposed a conflict between a permissionless base protocol and frontends that can filter access.', [claim('ThorFi design created liabilities that became unserviceable after market stress.', ['source:thorchain:thorfi'], 'Protocol explanation of the crisis.', { confidence: 'high', kind: 'inference' }),claim('Current volume shows swap demand but not creditor recovery or frontend independence.', ['source:thorchain:volume','source:thorchain:tcy','source:thorchain:thorswap'], 'Separate flow, claim and interface evidence.', { kind: 'unknown' })]),
    strategic_choices: section('THORChain chose native cross-chain vaults and RUNE-paired liquidity rather than wrapped assets or a single bridge. It expanded from swaps into ThorFi lending and Savers, accepting balance-sheet risk to create more demand. After the crisis, governance issued TCY and redirected 10% of network income to holders instead of forcing immediate liquidation or cash redemption. Frontends remain independent, which preserves open infrastructure while making policy and sanctions responses uneven.', [claim('THORChain chose validator vaults and RUNE-paired pools for cross-chain settlement.', ['source:thorchain:technology','source:thorchain:overview'], 'Current mechanism.'),claim('Governance chose TCY revenue sharing to restructure ThorFi claims.', ['source:thorchain:tcy','source:thorchain:thorfi'], 'Debt conversion and fee split.')]),
    operating_model: section('THORChain is built with Cosmos SDK. An active validator set uses threshold signatures to manage chain-specific vaults while Bifrost observes external chains. This removes a single custodian but concentrates risk in validator selection, signer software, vault operations and external-chain assumptions. Wallets and frontends can block or warn users, yet they do not rewrite base protocol rules. Volume routed by those interfaces is still protocol volume and must not be added twice.', [claim('Validators use threshold signatures and Bifrost to manage and observe cross-chain vaults.', ['source:thorchain:technology'], 'Current architecture.'),claim('Frontend filtering and base-protocol permissionlessness are different control layers.', ['source:thorchain:thorswap','source:thorchain:laundering'], 'Operator boundary and independent risk reporting.')]),
    token_and_value_capture: section('RUNE secures the network, pairs with pool assets and absorbs protocol economics. CoinGecko observed RUNE at $0.443779, with a $150.15 million market capitalization and $157.22 million fully diluted value, about 97.87% below its recorded high. Current fee policy assigns 10% of network income to TCY holders, reducing what remains for nodes, liquidity and other uses. TCY has no governance rights and represents a risky fee claim, not a stablecoin or guaranteed creditor payout.', [claim('RUNE market capitalization was $150,150,045 at the observation date.', ['source:thorchain:market'], 'CoinGecko market_data.market_cap.usd.', { value: 150150045 }),claim('TCY receives 10% of network income and does not provide governance rights or guaranteed repayment.', ['source:thorchain:tcy','source:thorchain:thorfi'], 'Current TCY rights and limits.')]),
    counterfactual: section('THORChain could have remained a swap-only network and avoided ThorFi credit liabilities, giving up potential demand but protecting the core balance sheet. Lending could also have used liquidations and explicit interest to price risk, reducing borrower appeal while limiting hidden insolvency. After the crisis, liquidation might have closed claims faster but risked network failure. Durable fee income and transparent TCY distributions are now the observable recovery test.', [claim('A swap-only scope would avoid ThorFi credit risk while limiting product expansion.', ['source:thorchain:overview','source:thorchain:thorfi'], 'Core protocol versus failed product scope.', { confidence: 'medium', kind: 'counterfactual' }),claim('Priced and collateral-enforced lending could reduce insolvency risk while changing the product promise.', ['source:thorchain:thorfi'], 'Documented lending design and failure.', { confidence: 'medium', kind: 'counterfactual' })]),
    risks_and_unknowns: section('The main risks are vault compromise, validator concentration, external-chain failures, thin liquidity, illicit-flow policy conflict and the continuing TCY burden. Reported swap volume is not profit, and low retained revenue limits the income available for security and creditors. We lack a complete creditor recovery ledger, current validator ownership map, interface-level flow split and independently reconciled network costs. A frontend restriction should never be described as a base-protocol shutdown.', [claim('Vault, signer and external-chain failures remain core technical risks.', ['source:thorchain:technology'], 'Current vault architecture.'),claim('Creditor recovery, validator ownership and net network costs remain unresolved.', ['source:thorchain:tcy','source:thorchain:fees','source:thorchain:revenue'], 'Current sources do not fully reconcile them.', { kind: 'unknown' })]),
    lifecycle: section('THORChain is operating but declining. The core swap network still processed $765.92 million in 30 days, which is meaningful product use. At the same time, TVL is 94.73% below peak, RUNE is almost 98% below its high and ThorFi creditors were converted into a long-dated fee claim. The network survived the crisis, but survival is not creditor repayment and high flow is not proof of healthy economics.', [claim('THORChain remains active with $765.92 million in 30-day swap volume.', ['source:thorchain:volume','source:thorchain:overview'], 'Current provider and protocol observations.'),claim('Capital, token and creditor outcomes support a declining lifecycle call.', ['source:thorchain:tvl','source:thorchain:market','source:thorchain:thorfi'], 'Peak-to-current and restructuring evidence.', { kind: 'inference' })]),
    outlook_and_watch: section('The base case is a still-useful cross-chain swap backend carrying a damaged credit and token history. The call improves if liquidity stabilizes, fees grow, validator control broadens and TCY distributions create transparent creditor recovery without starving security. Watch vault incidents, RUNE depth, route concentration, frontend policy, illicit-flow controls, TCY payouts and retained revenue. The call worsens if another balance-sheet product fails or if low liquidity makes vault and token reflexivity more dangerous.', [claim('Stable liquidity, fee income and transparent TCY payouts would strengthen the outlook.', ['source:thorchain:tvl','source:thorchain:fees','source:thorchain:tcy'], 'Current baseline for future review.', { confidence: 'medium', kind: 'inference' }),claim('Frontend policy and base-network operation must remain separately monitored.', ['source:thorchain:thorswap','source:thorchain:laundering'], 'Independent interface and risk boundary.', { confidence: 'medium', kind: 'inference' })]),
  },
  metrics: [metric('tvl-latest','tvl','TVL',28797048,['source:thorchain:tvl'],'Latest historicalChainTvl point.'),metric('dex-volume-30d','dex_spot_volume','Native cross-chain swap volume (30d)',765915393,['source:thorchain:volume'],'total30d.',['not_unique_users','frontend_routes_overlap']),metric('fees-30d','fees','Fees (30d)',187997,['source:thorchain:fees'],'total30d.'),metric('revenue-30d','protocol_revenue','Protocol revenue (30d)',13945.18,['source:thorchain:revenue'],'total30d.',['gross_fees_not_profit']),metric('token-price','token_price','RUNE price',0.443779,['source:thorchain:market'],'current_price.usd.'),metric('token-market-cap','token_market_cap','RUNE market capitalization',150150045,['source:thorchain:market'],'market_cap.usd.'),metric('token-fdv','token_fdv','RUNE fully diluted value',157216866,['source:thorchain:market'],'fully_diluted_valuation.usd.')],
  events: [event('peak-tvl','market_event','2022-04-02','THORChain reached the maximum TVL point in the reviewed series.',['source:thorchain:tvl'],'Historical series maximum.'),event('thorfi-pause','crisis','2025-01-23','ThorFi suspended lending and Savers withdrawals amid unserviceable debt.',['source:thorchain:thorfi'],'Dated crisis history.'),event('tcy','restructuring','2025-05-01','THORChain converted creditor claims into 210 million TCY fee-claim tokens.',['source:thorchain:tcy','source:thorchain:thorfi'],'Token mechanics and launch-period history.')],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama and CoinGecko', historical_tvl_point_date: AS_OF, latest_tvl_usd: 28797048, peak_tvl_usd: 546437336, peak_tvl_date: '2022-04-02', tvl_drawdown_pct: 94.73, dex_volume_30d_usd: 765915393, dex_volume_change_1m_pct: -35.97, fees_30d_usd: 187997, revenue_30d_usd: 13945.18, creditor_boundary: 'About $210 million of ThorFi claims were converted into TCY; this is not cash repayment.' },
  forensicSummary: 'THORChain still processes meaningful native swaps, but TVL is 94.73% below peak and ThorFi’s roughly $210 million debt became a risky TCY fee claim. Network activity, frontend activity and creditor recovery are separate outcomes.',
  forensicWhy: 'The native-swap design solved a real distribution problem. ThorFi expanded into zero-interest, no-liquidation credit whose liabilities became unserviceable. TCY preserved operation by moving recovery into future fees rather than repaying cash.', whySources: ['source:thorchain:overview','source:thorchain:technology','source:thorchain:thorfi','source:thorchain:tcy','source:thorchain:volume','source:thorchain:revenue'],
  choices: [{decision:'Build native cross-chain vaults and RUNE-paired pools.',consequence:'Users avoid wrapped assets while accepting validator-vault risk.',confidence:'high',source_refs:['source:thorchain:overview','source:thorchain:technology']},{decision:'Expand into ThorFi lending and Savers.',consequence:'The network added demand and unserviceable balance-sheet liabilities.',confidence:'high',source_refs:['source:thorchain:thorfi']},{decision:'Convert claims into TCY with 10% of network income.',consequence:'Operation continued while creditors took long-dated recovery risk.',confidence:'high',source_refs:['source:thorchain:tcy','source:thorchain:thorfi']}],
  forensicCounterfactual: 'Remaining swap-only would avoid ThorFi credit losses. Explicit interest and liquidations might price risk better. Transparent fee income and TCY distributions now determine recovery.', counterfactualSources: ['source:thorchain:overview','source:thorchain:thorfi','source:thorchain:tcy'],
  watch: [{signal:'Liquidity, swap volume, fees, retained revenue and TCY distributions.',implication:'Sustainable economics would support both security and creditor recovery.',source_refs:['source:thorchain:tvl','source:thorchain:volume','source:thorchain:fees','source:thorchain:revenue','source:thorchain:tcy']},{signal:'Vault incidents, validator entities, frontend route share and illicit-flow controls.',implication:'Reliable custody and clear control boundaries would reduce operational risk.',source_refs:['source:thorchain:technology','source:thorchain:thorswap','source:thorchain:laundering']}],
  unknowns: [['How much value have TCY holders actually recovered?','A reconciled distribution ledger in RUNE and USD.'],['Who beneficially owns current validators?','An independent entity-level validator map.'],['What share of flow comes from each frontend?','A non-overlapping route attribution study.'],['What are net network costs after every fee allocation?','A complete protocol cash-flow reconciliation.']],
};

const abstractSpec = {
  slug: 'abstract', name: 'Abstract', classification: { subtype: 'consumer-focused Ethereum ZK rollup', tags: ['zk_stack','ethereum','account_abstraction','consumer_apps'], chains: ['Ethereum'], jurisdictions: [] },
  outcome: 'middling', forensicOutcome: 'middling', outcomeConfidence: 'medium', qualityConfidence: 'medium', sources: abstractSources,
  statusSources: ['source:abstract:overview','source:abstract:l2beat','source:abstract:tvl'], statusLocator: 'Current network documentation, risk panels and nonzero capital show an operating rollup.',
  outcomeSources: ['source:abstract:tvl','source:abstract:volume','source:abstract:fees','source:abstract:revenue','source:abstract:l2beat','source:abstract:portal'], outcomeLocator: 'Chain capital and economics were reviewed separately from Portal and wallet distribution.',
  sections: {
    what_it_is: section('Abstract is an Ethereum ZK rollup built with the ZK Stack and aimed at consumer applications. It uses ETH for gas and has no separate chain token in the reviewed sources. The operator also runs Abstract Portal and Abstract Global Wallet, which package discovery, accounts, XP, streaming and trading into a consumer interface. Those products may distribute users, but their clicks and XP are not automatically chain transactions or retained protocol demand.', [claim('Abstract is an Ethereum ZK rollup using ETH for gas.', ['source:abstract:overview','source:abstract:l2beat'], 'Current architecture and gas panels.'),claim('Portal and Global Wallet are distribution products distinct from rollup execution.', ['source:abstract:portal','source:abstract:wallet'], 'Product and wallet architecture.')]),
    what_happened: section('Abstract launched mainnet in January 2025 around the thesis that better accounts and consumer discovery could reduce crypto friction. TVL peaked at $57.84 million in August 2025 and fell to $10.21 million by 2026-08-03, an 82.34% drawdown. Dollar stablecoins were $6.86 million and 30-day DEX volume was $15.25 million, down 6.55% from the prior provider comparison. Fees were $2.88 million and provider-reported retained revenue was $785,923.19.', [claim('Abstract launched mainnet in January 2025 as a consumer-focused ZK rollup.', ['source:abstract:overview','source:abstract:l2beat'], 'Current project history.'),claim('TVL fell from $57,839,558 to $10,214,276 by the review date.', ['source:abstract:tvl'], 'Maximum and latest series points.', { value: 'peak 57839558; latest 10214276' })]),
    why_this_outcome: section('Abstract made onboarding and discovery the product, not just cheaper blockspace. Native account abstraction, a global wallet and Portal can make consumer apps easier to enter and revisit. That likely helps explain why the chain can generate meaningful fees with little TVL. However, the capital base and DEX volume remain small, and Portal engagement cannot substitute for verified repeat on-chain users. The result is a promising but concentrated consumer distribution experiment rather than a proven broad ecosystem.', [claim('Account abstraction and Portal plausibly reduce onboarding and discovery friction.', ['source:abstract:accounts','source:abstract:wallet','source:abstract:portal'], 'Current product design.', { confidence: 'medium', kind: 'inference' }),claim('Portal engagement cannot be converted into chain retention without reconciled user cohorts.', ['source:abstract:portal','source:abstract:volume'], 'Product activity and aggregate chain flow.', { kind: 'unknown' })]),
    strategic_choices: section('Abstract chose a ZK Stack rollup, native account abstraction and a first-party consumer portal. Global Wallet combines an embedded Privy signer with a smart-account layer so users can recover accounts and applications can sponsor gas. Portal then bundles discovery, XP, streaming and trading around those accounts. The choices create a strong funnel, but they also make the ecosystem dependent on the operator, Privy and a curated interface rather than only the open chain.', [claim('Abstract chose native account abstraction and paymaster support.', ['source:abstract:accounts'], 'Current account design.'),claim('Global Wallet and Portal create a first-party distribution funnel with Privy dependency.', ['source:abstract:wallet','source:abstract:portal'], 'Wallet architecture and Portal scope.')]),
    operating_model: section('Abstract batches transactions through operator-controlled rollup infrastructure and settles to Ethereum with ZK proofs. L2BEAT classified it Stage 0 at the review date and identified centralized operator and emergency-upgrade risks. In May 2025, an unprovable batch halted finalization for about two days and was resolved through an emergency upgrade. Account and Portal convenience therefore sit on top of material sequencer, prover, upgrade and wallet-provider dependencies.', [claim('Abstract remained Stage 0 with centralized operator and emergency-upgrade risk.', ['source:abstract:l2beat'], 'Current stage and risk panels.'),claim('A May 2025 unprovable batch halted finalization for about two days.', ['source:abstract:l2beat'], 'Liveness incident panel.')]),
    token_and_value_capture: section('Abstract uses ETH for gas and no separate chain token was verified. That avoids a token whose price can obscure product adoption, but it also means value capture must be judged through fees, retained revenue and ecosystem ownership rather than a chain-token market capitalization. Current 30-day fees were high relative to TVL, yet the provider’s retained-revenue field is not operator profit and does not include all infrastructure, wallet or incentive costs.', [claim('Abstract uses ETH for gas and no separate chain token was verified.', ['source:abstract:overview','source:abstract:l2beat'], 'Current gas and project descriptions.'),claim('Provider-reported retained revenue is not a complete operator profit measure.', ['source:abstract:fees','source:abstract:revenue'], 'Gross and retained provider fields.', { kind: 'unknown' })]),
    counterfactual: section('Abstract could have launched only the rollup and left wallet and discovery to independent teams, reducing operator concentration while losing a coordinated consumer funnel. It could also have deployed Portal and Global Wallet across existing chains, avoiding rollup operations but giving up control over execution and economics. The useful comparison is whether the integrated stack creates more retained paying users than a chain-neutral consumer application would.', [claim('A rollup-only approach would reduce first-party distribution while lowering operator scope.', ['source:abstract:overview','source:abstract:portal'], 'Chain versus Portal product boundary.', { confidence: 'medium', kind: 'counterfactual' }),claim('A chain-neutral portal could avoid rollup operations while giving up execution control.', ['source:abstract:portal','source:abstract:l2beat'], 'Integrated product and rollup risk.', { confidence: 'medium', kind: 'counterfactual' })]),
    risks_and_unknowns: section('The main risks are operator concentration, emergency upgrades, prover failures, Privy or wallet dependency, curated distribution and weak capital depth. Portal XP or streaming numbers could become vanity metrics if they are not reconciled with paying on-chain behavior. We lack repeat-user cohorts, application-level fee concentration, complete operator costs and an independent control map. The May 2025 halt shows that user-facing polish does not remove settlement and liveness risk.', [claim('Operator, prover, upgrade and wallet-provider dependencies remain material.', ['source:abstract:l2beat','source:abstract:wallet'], 'Current rollup and account controls.'),claim('Repeat paying users, app concentration and full operator costs remain unresolved.', ['source:abstract:portal','source:abstract:fees','source:abstract:revenue'], 'Current sources omit those measurements.', { kind: 'unknown' })]),
    lifecycle: section('Abstract is operating and middling. It has shipped the chain, native accounts, Global Wallet and Portal, and it generated meaningful fees. Capital is still 82.34% below peak, stablecoins and DEX volume are small, and current control remains Stage 0. The next lifecycle test is whether consumer distribution produces repeat paying users across several applications without recurring liveness incidents or dependence on one curated interface.', [claim('Abstract has live rollup, account, wallet and Portal products.', ['source:abstract:overview','source:abstract:accounts','source:abstract:wallet','source:abstract:portal'], 'Current shipped product descriptions.'),claim('Shipped products and meaningful fees coexist with low capital and Stage 0 control, supporting a middling call.', ['source:abstract:tvl','source:abstract:fees','source:abstract:l2beat'], 'Capital, economics and control baseline.', { confidence: 'medium', kind: 'inference' })]),
    outlook_and_watch: section('The base case is a small consumer rollup with a differentiated onboarding funnel but concentrated control. The call improves if repeat users and paying applications grow, fees diversify, TVL stabilizes and operator safeguards mature. Watch account recovery failures, Privy dependence, app and fee concentration, Portal-to-chain conversion, sequencer or prover incidents and upgrade controls. The call worsens if engagement stays inside XP and content surfaces without durable on-chain demand.', [claim('Repeat paying users, diversified fees and improved controls would strengthen the outlook.', ['source:abstract:portal','source:abstract:fees','source:abstract:l2beat'], 'Current product and control baseline.', { confidence: 'medium', kind: 'inference' }),claim('Portal-to-chain conversion and wallet recovery reliability require separate measurement.', ['source:abstract:portal','source:abstract:wallet'], 'Distribution and account layers.', { confidence: 'medium', kind: 'inference' })]),
  },
  metrics: [metric('tvl-latest','tvl','TVL',10214276,['source:abstract:tvl'],'Latest historicalChainTvl point.'),metric('stablecoins-latest','stablecoin_supply','Dollar stablecoin supply',6858504.882522769,['source:abstract:stables'],'peggedUSD field.'),metric('dex-volume-30d','dex_spot_volume','DEX volume (30d)',15252805,['source:abstract:volume'],'total30d.',['not_unique_users','portal_activity_excluded']),metric('fees-30d','fees','Fees (30d)',2875241.97,['source:abstract:fees'],'total30d.'),metric('revenue-30d','protocol_revenue','Protocol revenue (30d)',785923.19,['source:abstract:revenue'],'total30d.',['gross_fees_not_profit'])],
  events: [event('mainnet','launch','2025-01-27','Abstract mainnet launched.',['source:abstract:l2beat','source:abstract:overview'],'Current project history.'),event('liveness','incident','2025-05-14','An unprovable batch halted Abstract finalization for about two days.',['source:abstract:l2beat'],'Liveness incident panel.'),event('peak-tvl','market_event','2025-08-14','Abstract reached the maximum TVL point in the reviewed series.',['source:abstract:tvl'],'Historical series maximum.')],
  snapshot: { observed_at: OBSERVED_AT, observation_completed_at: ACCESSED_AT, provider: 'DefiLlama and L2BEAT', historical_tvl_point_date: AS_OF, latest_tvl_usd: 10214276, peak_tvl_usd: 57839558, peak_tvl_date: '2025-08-14', tvl_drawdown_pct: 82.34, stablecoin_supply: { pegged_usd: 6858504.882522769 }, dex_volume_30d_usd: 15252805, dex_volume_change_1m_pct: -6.55, fees_30d_usd: 2875241.97, revenue_30d_usd: 785923.19, product_boundary: 'Portal, Global Wallet, XP and streaming are not counted as chain transactions without reconciliation.' },
  forensicSummary: 'Abstract is a small but differentiated consumer rollup. Native accounts, Global Wallet and Portal are live, yet TVL is 82.34% below peak and control remains Stage 0. Product engagement and chain activity stay separate.',
  forensicWhy: 'Abstract built a coordinated consumer funnel rather than selling generic blockspace. That can reduce onboarding friction and support fees, but it concentrates distribution and wallet dependencies while capital and DEX activity remain small.', whySources: ['source:abstract:overview','source:abstract:accounts','source:abstract:wallet','source:abstract:portal','source:abstract:l2beat','source:abstract:tvl','source:abstract:fees'],
  choices: [{decision:'Build a ZK Stack Ethereum rollup.',consequence:'Abstract controls execution while assuming rollup operator risk.',confidence:'high',source_refs:['source:abstract:overview','source:abstract:l2beat']},{decision:'Make account abstraction native.',consequence:'Apps can sponsor gas and simplify accounts while users depend on wallet infrastructure.',confidence:'high',source_refs:['source:abstract:accounts','source:abstract:wallet']},{decision:'Operate Portal as a first-party discovery funnel.',consequence:'Distribution improves while ecosystem attention becomes curated and concentrated.',confidence:'high',source_refs:['source:abstract:portal']}],
  forensicCounterfactual: 'A rollup-only strategy would reduce product scope but lose the consumer funnel. A chain-neutral portal would avoid rollup risk but surrender execution control. Repeat paying users are the practical test.', counterfactualSources: ['source:abstract:overview','source:abstract:portal','source:abstract:l2beat'],
  watch: [{signal:'Repeat paying users, app concentration, TVL, fees and retained revenue.',implication:'Broad persistence would show durable demand beyond Portal engagement.',source_refs:['source:abstract:tvl','source:abstract:fees','source:abstract:revenue','source:abstract:portal']},{signal:'Sequencer, prover, upgrade, Privy and recovery incidents.',implication:'Reliable operation and broader controls would reduce current platform risk.',source_refs:['source:abstract:l2beat','source:abstract:wallet']}],
  unknowns: [['How many Portal users become repeat on-chain payers?','A reconciled two-quarter funnel cohort.'],['Which applications produce most fees?','A non-overlapping app-level fee statement.'],['What are complete operator and incentive costs?','An audited rollup and product income statement.'],['Who controls sequencer, prover and upgrades by beneficial owner?','An independent entity-level control map.']],
};

const specs = [lineaSpec, dexalotSpec, cronosSpec, thorchainSpec, abstractSpec];
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
  generated_migration: '0085_chain_causal_completion_wave_f.sql',
  methodology: {
    scope: 'Canonical ten-section blockchain profiles for Linea, Dexalot, Cronos, THORChain and Abstract.',
    observation_rule: `Volatile provider fields were fetched between ${OBSERVED_AT} and ${ACCESSED_AT}. Exact values remain point-in-time observations.`,
    evidence_rule: 'Official sources establish documented design and decisions. Independent sources test market outcomes and control assumptions. Aggregate metrics do not prove causality or user retention.',
    claim_rule: 'Each customer section has bounded atomic claims with source references, evidence locators, confidence, fact/inference/unknown labels and pending human review.',
    preservation_rule: 'Migration 0085 preserves legacy facts and analysis fields while adding forensic analysis, review metadata and an embedded canonical profile. Sources merge by URL.',
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
  return `-- Generated by scripts/render-chain-causal-wave-0085.mjs.
-- Adds Wave F review-state canonical profiles without overwriting legacy dossiers.
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

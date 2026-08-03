import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ACCESSED_AT = '2026-08-03T17:36:47Z';
const NEXT_REVIEW_AT = '2026-08-10T17:36:47Z';
const AS_OF_DATE = '2026-08-03';

function makeSource(slug, [key, title, url, publisher, publishedAt, tier = 'B', role = 'primary']) {
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
  };
}

function makeSources(slug, rows) {
  return rows.map((row) => makeSource(slug, row));
}

function pendingClaim(id, fieldPath, sourceIds, evidenceLocator, note = null) {
  return {
    id,
    field_path: fieldPath,
    source_ids: sourceIds,
    evidence_locator: evidenceLocator,
    support_direction: 'supports',
    note,
    review: { state: 'pending', reviewer: null, reviewed_at: null },
  };
}

function buildProfile(spec) {
  const sectionEntries = Object.entries(spec.sections);
  const metrics = spec.metrics.map((metric) => ({
    id: `metric:${spec.slug}:${metric.key}:${metric.as_of}`,
    dimension: metric.dimension,
    label: metric.label,
    value: metric.value,
    unit: metric.unit,
    currency: metric.currency ?? null,
    window: metric.window,
    as_of: metric.as_of,
    method: metric.method,
    scope: metric.scope,
    formula: null,
    raw_input_ids: [],
    claim_ids: [`claim:${spec.slug}:metric:${metric.key}`],
    quality_flags: metric.quality_flags || [],
  }));
  const events = spec.events.map((event) => ({
    id: `event:${spec.slug}:${event.key}`,
    type: event.type,
    date: event.date,
    description: event.description,
    claim_ids: [`claim:${spec.slug}:event:${event.key}`],
  }));

  return {
    schema: 'chaindump-entity-profile',
    version: 1,
    identity: {
      id: `dex:${spec.slug}`,
      type: 'dex',
      slug: spec.slug,
      name: spec.name,
      aliases: spec.aliases || [],
    },
    classification: spec.classification,
    status: {
      operating_state: 'operating',
      as_of: AS_OF_DATE,
      claim_ids: [`claim:${spec.slug}:status`],
    },
    outcome: {
      label: spec.outcome_label,
      as_of: AS_OF_DATE,
      rule_id: 'exchange-lifecycle-v1',
      confidence: spec.outcome_confidence,
      claim_ids: [`claim:${spec.slug}:outcome`],
    },
    analysis: {
      sections: Object.fromEntries(sectionEntries.map(([key, value]) => [key, {
        body: value.body,
        as_of: AS_OF_DATE,
        claim_ids: [`claim:${spec.slug}:section:${key}`],
      }])),
    },
    metrics,
    events,
    sources: spec.sources,
    claims: [
      pendingClaim(`claim:${spec.slug}:status`, 'status.operating_state', spec.status_source_ids, spec.status_evidence_locator),
      pendingClaim(`claim:${spec.slug}:outcome`, 'outcome.label', spec.outcome_source_ids, spec.outcome_evidence_locator, 'Analyst lifecycle classification; it is not a token-price recommendation.'),
      ...sectionEntries.map(([key, value]) => pendingClaim(
        `claim:${spec.slug}:section:${key}`,
        `analysis.sections.${key}.body`,
        value.source_ids,
        value.evidence_locator,
        value.note || null,
      )),
      ...spec.metrics.map((metric) => pendingClaim(
        `claim:${spec.slug}:metric:${metric.key}`,
        `metrics[metric:${spec.slug}:${metric.key}:${metric.as_of}].value`,
        metric.source_ids,
        metric.evidence_locator,
        metric.note || null,
      )),
      ...spec.events.map((event) => pendingClaim(
        `claim:${spec.slug}:event:${event.key}`,
        `events[event:${spec.slug}:${event.key}]`,
        event.source_ids,
        event.evidence_locator,
        event.note || null,
      )),
    ],
    freshness: {
      state: 'current',
      last_reviewed_at: ACCESSED_AT,
      next_review_at: NEXT_REVIEW_AT,
      field_reviews: [],
    },
    quality: {
      publication_state: 'review',
      completeness_pct: 100,
      confidence: spec.quality_confidence,
      unsourced_fields: spec.unsourced_fields,
    },
    extensions: {
      legacy_origin: spec.legacy_origin,
      methodology_notes: [
        'Freshness records evidence assembly and source verification, not human approval; every claim remains pending until an editor reviews it.',
        'Volume is not liquidity, TVL is not market depth, fees are not profit, wallet or protocol activity is not retained users, and correlation is not causation.',
        ...spec.methodology_notes,
      ],
    },
  };
}

const rolling = (end, definition) => ({ start: null, end, definition });
const scope = (product, chains = []) => ({ product, chains });

const pancakeSources = makeSources('pancakeswap', [
  ['tokenomics', 'CAKE Tokenomics', 'https://docs.pancakeswap.finance/protocol/cake-tokenomics', 'PancakeSwap', null],
  ['tokenomics3', 'Implementation of CAKE Tokenomics 3.0', 'https://blog.pancakeswap.finance/articles/implementation-of-cake-tokenomics-3-0-what-you-need-to-know', 'PancakeSwap', '2025-04-21'],
  ['voting', 'Voting', 'https://docs.pancakeswap.finance/protocol/voting', 'PancakeSwap', null],
  ['infinity', 'PancakeSwap Infinity is Now Live', 'https://blog.pancakeswap.finance/articles/pancake-swap-infinity-is-now-live-formerly-pancake-swap-v4', 'PancakeSwap', '2025-04-28'],
  ['five-years', '5 Years of PancakeSwap', 'https://blog.pancakeswap.finance/articles/5-years-of-pancakeswap', 'PancakeSwap', '2025-09-22'],
  ['january-2026', 'Kitchen Report: January 2026', 'https://blog.pancakeswap.finance/articles/kitchen-report-january-2026', 'PancakeSwap', '2026-02-06'],
  ['audits', 'PancakeSwap audits', 'https://docs.pancakeswap.finance/readme/audits', 'PancakeSwap', null],
  ['developers', 'PancakeSwap Developer Documentation', 'https://developer.pancakeswap.finance/', 'PancakeSwap', null],
  ['volume', 'PancakeSwap DEX volume API', 'https://api.llama.fi/summary/dexs/pancakeswap?dataType=dailyVolume', 'DefiLlama', null, 'B', 'independent'],
  ['amm-volume', 'PancakeSwap AMM volume API', 'https://api.llama.fi/summary/dexs/pancakeswap-amm?dataType=dailyVolume', 'DefiLlama', null, 'B', 'independent'],
  ['tvl', 'PancakeSwap AMM TVL API', 'https://api.llama.fi/protocol/pancakeswap-amm', 'DefiLlama', null, 'B', 'independent'],
  ['fees', 'PancakeSwap AMM fees API', 'https://api.llama.fi/summary/fees/pancakeswap-amm?dataType=dailyFees', 'DefiLlama', null, 'B', 'independent'],
  ['revenue', 'PancakeSwap AMM revenue API', 'https://api.llama.fi/summary/fees/pancakeswap-amm?dataType=dailyRevenue', 'DefiLlama', null, 'B', 'independent'],
]);

const curveSources = makeSources('curve-finance', [
  ['intro', 'Introduction to Curve', 'https://resources.curve.finance/user/introduction', 'Curve Finance', null],
  ['why', 'Why Curve?', 'https://resources.curve.finance/protocol/why-curve', 'Curve Finance', null],
  ['crv', 'CRV token', 'https://resources.curve.finance/user/curve-tokens/crv', 'Curve Finance', null],
  ['vecrv', 'What is veCRV?', 'https://resources.curve.finance/user/vecrv/what-is-vecrv', 'Curve Finance', null],
  ['dao', 'Curve DAO overview', 'https://resources.curve.finance/user/dao/overview', 'Curve Finance', null],
  ['audits', 'Curve audits', 'https://resources.curve.finance/user/security/audits', 'Curve Finance', null],
  ['stableswap', 'Stableswap NG implementation', 'https://github.com/curvefi/stableswap-ng', 'Curve Finance', null],
  ['exploit', 'Curve incident: compiler error produces faulty bytecode', 'https://blocksec.com/blog/curve-incident-compiler-error-produces-faulty-bytecode-from-innocent-source-code', 'BlockSec', '2024-02-14', 'A', 'independent'],
  ['volume', 'Curve DEX volume API', 'https://api.llama.fi/summary/dexs/curve-dex?dataType=dailyVolume', 'DefiLlama', null, 'B', 'independent'],
  ['tvl', 'Curve DEX TVL API', 'https://api.llama.fi/protocol/curve-dex', 'DefiLlama', null, 'B', 'independent'],
  ['fees', 'Curve DEX fees API', 'https://api.llama.fi/summary/fees/curve-dex?dataType=dailyFees', 'DefiLlama', null, 'B', 'independent'],
  ['revenue', 'Curve DEX protocol revenue API', 'https://api.llama.fi/summary/fees/curve-dex?dataType=dailyRevenue', 'DefiLlama', null, 'B', 'independent'],
]);

const jupiterSources = makeSources('jupiter', [
  ['tokenomics', 'JUP Tokenomics', 'https://docs.jup.ag/user-docs/more/jup-token/tokenomics', 'Jupiter', null],
  ['genesis', 'JUP: The Genesis Post', 'https://discuss.jup.ag/t/jup-the-genesis-post/478/1', 'Jupiter DAO', '2024-01-30'],
  ['execution', 'Order and Execute', 'https://developers.jup.ag/docs/swap/order-and-execute', 'Jupiter', null],
  ['listing', 'Market Listing', 'https://developers.jup.ag/docs/swap/routing/market-listing', 'Jupiter', null],
  ['solana', 'Development Basics', 'https://developers.jup.ag/docs/get-started/development-basics', 'Jupiter', null],
  ['net-zero', 'Proposal: Net-Zero Emissions', 'https://discuss.jup.ag/t/proposal-net-zero-emissions/39948', 'Jupiter DAO', '2026-02-13'],
  ['swap-audit', 'Jupiter security audits', 'https://developers.jup.ag/docs/resources/audits', 'Jupiter', null],
  ['volume', 'Jupiter aggregator routed-volume API', 'https://api.llama.fi/summary/aggregators/jupiter?dataType=dailyVolume', 'DefiLlama', null, 'B', 'independent'],
  ['dex-volume', 'Jupiter DEX-adapter volume API', 'https://api.llama.fi/summary/dexs/jupiter?dataType=dailyVolume', 'DefiLlama', null, 'B', 'independent'],
  ['aggregator-fees', 'Jupiter Aggregator fees API', 'https://api.llama.fi/summary/fees/jupiter-aggregator?dataType=dailyFees', 'DefiLlama', null, 'B', 'independent'],
  ['family-fees', 'Jupiter protocol-family fees API', 'https://api.llama.fi/summary/fees/jupiter?dataType=dailyFees', 'DefiLlama', null, 'B', 'independent'],
  ['family-revenue', 'Jupiter protocol-family revenue API', 'https://api.llama.fi/summary/fees/jupiter?dataType=dailyRevenue', 'DefiLlama', null, 'B', 'independent'],
  ['family-tvl', 'Jupiter protocol-family TVL API', 'https://api.llama.fi/protocol/jupiter', 'DefiLlama', null, 'B', 'independent'],
]);

const dydxSources = makeSources('dydx', [
  ['intro', 'dYdX Chain documentation', 'https://docs.dydx.community/dydx', 'dYdX Community', null],
  ['token', 'DYDX token', 'https://docs.dydx.community/dydx/start-here/dydx-token', 'dYdX Community', null],
  ['distribution', 'Distribution module', 'https://docs.dydx.community/dydx/modules/distribution', 'dYdX Community', null],
  ['faq', 'dYdX Chain FAQ and resources', 'https://docs.dydx.community/dydx-chain-technical-docs/getting-started/faq-and-resources', 'dYdX Community', null],
  ['architecture', 'dYdX v4 technical architecture overview', 'https://www.dydx.xyz/blog/v4-technical-architecture-overview', 'dYdX', '2022-08-23'],
  ['sunset', 'dYdX v3 product sunset', 'https://www.dydx.xyz/blog/v3-product-sunset', 'dYdX', '2024-09-27'],
  ['buyback', 'dYdX Community launches first DYDX buyback program', 'https://www.dydx.xyz/blog/dydx-buyback-program', 'dYdX', '2025-03-20'],
  ['outage', 'October 2025 dYdX Chain incident review', 'https://www.dydx.xyz/blog/october-2025-dydx-chain-incident-review-community-update', 'dYdX', '2025-10-16'],
  ['compensation', 'dYdX Chain October 2025 incident compensation update', 'https://www.dydx.xyz/blog/dydx-chain-october-2025-incident-compensation-and-community-update', 'dYdX', '2025-10-27'],
  ['surge', 'dYdX Surge is live', 'https://www.dydx.xyz/blog/dydx-surge', 'dYdX', '2025-04-07'],
  ['annual-2025', 'dYdX Annual Report 2025', 'https://www.dydx.xyz/annual-report/annual-report-2025', 'dYdX', '2026-01-01'],
  ['audit', 'Dive Into The dYdX Chain Audit', 'https://www.dydx.xyz/blog/dydx-chain-audit', 'dYdX', '2023-10-04'],
  ['indexer', 'dYdX v4 perpetual markets indexer', 'https://indexer.dydx.trade/v4/perpetualMarkets', 'dYdX', null],
  ['tvl', 'dYdX v4 TVL API', 'https://api.llama.fi/protocol/dydx-v4', 'DefiLlama', null, 'B', 'independent'],
  ['fees', 'dYdX v4 fees API', 'https://api.llama.fi/summary/fees/dydx-v4?dataType=dailyFees', 'DefiLlama', null, 'B', 'independent'],
  ['revenue', 'dYdX v4 protocol revenue API', 'https://api.llama.fi/summary/fees/dydx-v4?dataType=dailyRevenue', 'DefiLlama', null, 'B', 'independent'],
]);

const thorswapSources = makeSources('thorswap', [
  ['token', 'THOR token', 'https://docs.thorswap.finance/thorswap/thor/about', 'THORSwap', null],
  ['tokenomics', 'THOR tokenomics', 'https://docs.thorswap.finance/thorswap/thor/about/thor-tokenomics', 'THORSwap', null],
  ['fees', 'THORSwap fees', 'https://docs.thorswap.finance/thorswap/thorswap/fees', 'THORSwap', null],
  ['buyback', 'THOR buyback and burn programme', 'https://docs.thorswap.finance/thorswap/thor/about/thor-buyback-%2B-burn-programme', 'THORSwap', null],
  ['rune-edition', 'THORSwap RUNE Edition', 'https://docs.thorswap.finance/thorswap/ecosystem/thorchain/thorswap-rune-edition', 'THORSwap', null],
  ['ethereum-router', 'Ethereum DEX aggregator', 'https://docs.thorswap.finance/thorswap/thorswap/cross-chain-dex-aggregation/ethereum-dex-aggregator', 'THORSwap', null],
  ['terms', 'THORSwap Terms of Service', 'https://docs.thorswap.finance/thorswap/resources/terms-of-service', 'THORSwap', '2023-10-11'],
  ['recap-2023', 'THORSwap 2023 highlights and vision for 2024', 'https://thorswap.medium.com/thorswap-2023-highlights-and-vision-for-2024-9ded81f4c3a1', 'THORSwap', '2024-01-29'],
  ['pause', 'THORSwap back online after halt over FTX-linked funds', 'https://cointelegraph.com/news/thorswap-back-online-ftx-hacker', 'Cointelegraph', '2023-10-13', 'B', 'independent'],
  ['volume', 'THORSwap DEX volume API', 'https://api.llama.fi/summary/dexs/thorswap?dataType=dailyVolume', 'DefiLlama', null, 'B', 'independent'],
  ['tvl', 'THORSwap protocol TVL API', 'https://api.llama.fi/protocol/thorswap', 'DefiLlama', null, 'B', 'independent'],
  ['adapter-fees', 'THORSwap fees API', 'https://api.llama.fi/summary/fees/thorswap?dataType=dailyFees', 'DefiLlama', null, 'B', 'independent'],
  ['adapter-revenue', 'THORSwap protocol revenue API', 'https://api.llama.fi/summary/fees/thorswap?dataType=dailyRevenue', 'DefiLlama', null, 'B', 'independent'],
]);

const pancakeswap = buildProfile({
  slug: 'pancakeswap',
  name: 'PancakeSwap',
  aliases: ['PancakeSwap AMM'],
  legacy_origin: 'successful_exchanges',
  outcome_label: 'successful_established',
  outcome_confidence: 'high',
  quality_confidence: 'high',
  classification: {
    subtype: 'multi-chain spot AMM and exchange suite',
    tags: ['spot_amm', 'multi_chain', 'liquidity_incentives', 'modular_pools'],
    chains: ['BNB Chain', 'Ethereum', 'Base', 'Arbitrum', 'Aptos', 'Solana', 'Linea', 'zkSync Era', 'opBNB', 'Monad'],
    jurisdictions: [],
  },
  sources: pancakeSources,
  status_source_ids: ['source:pancakeswap:volume', 'source:pancakeswap:tvl', 'source:pancakeswap:january-2026'],
  status_evidence_locator: 'Current DefiLlama observations and the latest reviewed operating report.',
  outcome_source_ids: ['source:pancakeswap:five-years', 'source:pancakeswap:volume', 'source:pancakeswap:tvl', 'source:pancakeswap:tokenomics3'],
  outcome_evidence_locator: 'Five-year operating history, current activity and the implemented token-economics redesign.',
  sections: {
    what_it_is: {
      body: 'PancakeSwap is a non-custodial exchange suite built around automated market-maker contracts. It began on BNB Chain and now runs pool contracts and related products across several chains. The exchange surface is not one homogeneous venue: classic constant-product pools, concentrated-liquidity pools, StableSwap pools and Infinity pools have different fee and liquidity behavior, while other PancakeSwap products contribute separate fees. Traders keep custody until a transaction executes; liquidity providers supply the inventory and take pool-specific price and smart-contract risk. The public interface and router make those contracts easier to use, but chain deployments and contract generations must be measured separately before they are combined.',
      source_ids: ['source:pancakeswap:developers', 'source:pancakeswap:infinity', 'source:pancakeswap:five-years'],
      evidence_locator: 'Current developer architecture, Infinity launch description and the operator product history.',
    },
    what_happened: {
      body: 'PancakeSwap launched in September 2020 into BNB Chain’s low-fee retail market and used CAKE emissions to attract early liquidity. It then added pool designs, products and chains rather than remaining a BNB-only Uniswap-style fork. Infinity launched in 2025 with a singleton-style architecture, concentrated-liquidity and liquidity-book pool types, hooks and more flexible fees. By the 2026-08-03 replay, DefiLlama recorded $546.04 million of 24-hour and $17.60 billion of 30-day volume for the broad PancakeSwap DEX adapter, while the narrower PancakeSwap AMM adapter recorded $76.08 million and $763.42 million respectively. The difference is a scope warning, not evidence that either series is wrong; neither series establishes unique traders, profit or market depth.',
      source_ids: ['source:pancakeswap:five-years', 'source:pancakeswap:infinity', 'source:pancakeswap:volume', 'source:pancakeswap:amm-volume'],
      evidence_locator: 'Dated product milestones and separately labeled DefiLlama adapter totals replayed at 2026-08-03T17:36:35Z.',
    },
    why_this_outcome: {
      body: 'The strongest supported explanation is a reinforcing combination of distribution, cheap execution, incentives and iteration. BNB Chain gave the exchange a large retail funnel when Ethereum swaps were expensive; CAKE rewards paid liquidity providers to seed markets; a recognizable interface reduced switching friction; and later deployments followed users onto additional chains. Product breadth made PancakeSwap more useful, but it also increased maintenance and measurement complexity. Current scale is consistent with those choices creating a durable venue, yet the evidence does not isolate how much activity came from organic repeat demand versus emissions, routing relationships, chain cycles or temporary trading conditions. Success therefore describes observed survival and scale, not proof that every pool or token program earns an economic return.',
      source_ids: ['source:pancakeswap:five-years', 'source:pancakeswap:tokenomics', 'source:pancakeswap:volume', 'source:pancakeswap:tvl'],
      evidence_locator: 'Operator history and token mechanisms read with independent activity and TVL observations.',
      note: 'Causal interpretation bounded by documented mechanisms; no causal coefficient is claimed.',
    },
    strategic_choices: {
      body: 'PancakeSwap made four consequential choices. First, it used recurring CAKE emissions to bootstrap liquidity, gaining speed at the cost of dilution and mercenary-capital risk. Second, it expanded across chains, reducing dependence on one ecosystem while fragmenting liquidity and multiplying deployment, bridge and routing surfaces. Third, it kept shipping new pool generations; Infinity gives developers more control through hooks and flexible pool types, but users must assess hook and version-specific risk instead of treating the brand as one contract. Fourth, Tokenomics 3.0 retired veCAKE and gauges, removed the former five-percent revenue share, simplified voting to one liquid CAKE per vote and redirected selected product economics toward burns while cutting emissions. That made the holder proposition simpler and more scarcity-oriented, but also removed a direct revenue-sharing mechanism.',
      source_ids: ['source:pancakeswap:tokenomics', 'source:pancakeswap:tokenomics3', 'source:pancakeswap:voting', 'source:pancakeswap:infinity', 'source:pancakeswap:five-years'],
      evidence_locator: 'Implemented tokenomics, current voting rules, Infinity design and multi-chain history.',
      note: 'Trade-off analysis combines documented decisions with analyst interpretation.',
    },
    operating_model: {
      body: 'Liquidity providers deposit assets into smart-contract pools and receive the portion of swap fees assigned to their position or pool. Routers can choose among pool versions and paths, while Infinity hooks can add custom behavior. PancakeSwap also operates products outside the core AMM, so broad fee and volume aggregates can include different economic engines. The protocol is non-custodial at trade execution, but users still depend on the selected chain, token contracts, router, approvals, front end and any custom hook. The organization funds development, audits, incentives and operations from treasury and product economics; the reviewed public sources do not provide audited consolidated expenses, profit or runway. DefiLlama’s $1.70 billion AMM TVL observation is capital deposited in tracked contracts, not a guarantee that a specific trade has that depth.',
      source_ids: ['source:pancakeswap:developers', 'source:pancakeswap:infinity', 'source:pancakeswap:audits', 'source:pancakeswap:tvl'],
      evidence_locator: 'Architecture, audit inventory and the current protocol TVL adapter.',
    },
    token_and_value_capture: {
      body: 'CAKE launched with the product and remains an incentive, governance and utility token. Tokenomics 3.0 materially changed its economics in April 2025: veCAKE and gauge voting were retired, daily emissions were reduced in phases, and the former revenue share was discontinued. Current documentation targets at least roughly four-percent annual net deflation and lists product-funded buyback or burn contributions, including portions of spot fees and profits or fees from other products. Governance reduced the hard cap from 450 million to 400 million in January 2026, and PancakeSwap reported 29 consecutive months of net supply reduction at that point. These are protocol rules and operator-reported supply results, not equity rights. A burn can support scarcity but does not entitle CAKE holders to cash, treasury assets or exchange profit.',
      source_ids: ['source:pancakeswap:tokenomics', 'source:pancakeswap:tokenomics3', 'source:pancakeswap:voting', 'source:pancakeswap:january-2026', 'source:pancakeswap:fees', 'source:pancakeswap:revenue'],
      evidence_locator: 'Current tokenomics, implemented 2025 changes, January 2026 governance result and separately replayed fee/revenue series.',
    },
    counterfactual: {
      body: 'A BNB-only PancakeSwap would have a simpler security and liquidity footprint, but it would miss users and integrations on other chains and remain more exposed to one host ecosystem. A no-emissions launch would reduce dilution, but probably would have formed liquidity more slowly in a crowded market. Keeping veCAKE and direct revenue share might give locked holders a clearer cash-flow mechanism, while preserving governance complexity and long lock-in. These alternatives cannot be back-tested from the available record. The useful decision test is narrower: if multi-chain deployment and emissions were necessary, did each incremental chain and token program produce retained fees and liquidity greater than its ongoing cost and dilution? Public data does not yet answer that chain by chain.',
      source_ids: ['source:pancakeswap:five-years', 'source:pancakeswap:tokenomics', 'source:pancakeswap:tokenomics3', 'source:pancakeswap:volume', 'source:pancakeswap:tvl'],
      evidence_locator: 'Observed distribution and token choices used to bound alternatives.',
      note: 'Counterfactual scenario; no quantified causal estimate is available.',
    },
    risks_and_unknowns: {
      body: 'The main economic risk is that incentives and brand distribution make activity look durable while too little value remains after liquidity rewards, token emissions and operating costs. Multi-chain and multi-version expansion adds contract, hook, bridge, router and fragmented-liquidity risk. DefiLlama’s broad and AMM-specific adapters diverge sharply, so headline volume must always carry its adapter scope. Audits reduce uncertainty but do not prove safety, especially for custom hooks or newly deployed contracts. Unknowns include chain-by-chain retained traders, pool-level depth, net liquidity-provider returns after adverse selection, current product-level profit, the full cost of incentives, treasury runway, operator control surfaces and whether net CAKE deflation persists through a prolonged low-volume period.',
      source_ids: ['source:pancakeswap:audits', 'source:pancakeswap:developers', 'source:pancakeswap:infinity', 'source:pancakeswap:tokenomics', 'source:pancakeswap:volume', 'source:pancakeswap:amm-volume'],
      evidence_locator: 'Audit and architecture records, token policy and the current adapter-scope mismatch.',
    },
    lifecycle: {
      body: 'PancakeSwap launched on BNB Chain in September 2020 with CAKE incentives near product launch. It expanded beyond the original constant-product exchange into concentrated liquidity, StableSwap and a broader product suite, then across multiple chains. Infinity went live in April 2025. Tokenomics 3.0 followed that month, retiring veCAKE and gauges and reducing emissions. The five-year review in September 2025 documented the broader multi-chain footprint, and governance reduced CAKE’s hard cap to 400 million in January 2026. On 2026-08-03 the venue remained operating at large reported scale with approximately $1.70 billion of AMM TVL. The lifecycle call is established success with continuing redesign, not a claim that it is risk-free or that current scale will persist.',
      source_ids: ['source:pancakeswap:five-years', 'source:pancakeswap:infinity', 'source:pancakeswap:tokenomics3', 'source:pancakeswap:january-2026', 'source:pancakeswap:tvl', 'source:pancakeswap:volume'],
      evidence_locator: 'Dated launch, architecture, token-policy and current market observations.',
    },
    outlook_and_watch: {
      body: 'The base case is continued operation as a large retail-oriented, multi-chain exchange suite. The upside case requires Infinity adoption and chain expansion to produce repeat fee-paying activity without renewed emissions growth. The downside case is hollow scale: routed or incentive-sensitive volume remains high while owned liquidity, retained fees and CAKE economics weaken. Watch broad DEX volume and the narrower AMM adapter separately; AMM TVL without calling it depth; fees, protocol revenue and their product scope; net CAKE issuance after burns; emissions per dollar of fees; BNB Chain concentration; chain-by-chain liquidity retention; Infinity migration and hook incidents; audit coverage; governance participation; and treasury disclosure. Unique and retained traders should remain unknown until measured directly.',
      source_ids: ['source:pancakeswap:volume', 'source:pancakeswap:amm-volume', 'source:pancakeswap:tvl', 'source:pancakeswap:fees', 'source:pancakeswap:revenue', 'source:pancakeswap:tokenomics', 'source:pancakeswap:audits'],
      evidence_locator: 'Current independent metrics and the documented token, product and security mechanisms.',
      note: 'Scenario analysis, not a token-price forecast.',
    },
  },
  metrics: [
    { key: 'broad-volume-24h', dimension: 'spot_volume', label: 'Broad PancakeSwap DEX-adapter volume, rolling 24 hours', value: 546038063, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:34Z', window: rolling('2026-08-03T17:36:34Z', 'rolling_24h'), method: 'DefiLlama PancakeSwap DEX adapter', scope: scope('PancakeSwap adapter across listed chains'), source_ids: ['source:pancakeswap:volume'], evidence_locator: 'total24h in replayed dailyVolume response.', quality_flags: ['adapter_scope', 'not_unique_users', 'not_liquidity'] },
    { key: 'broad-volume-30d', dimension: 'spot_volume', label: 'Broad PancakeSwap DEX-adapter volume, rolling 30 days', value: 17601304608, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:34Z', window: rolling('2026-08-03T17:36:34Z', 'rolling_30d'), method: 'DefiLlama PancakeSwap DEX adapter', scope: scope('PancakeSwap adapter across listed chains'), source_ids: ['source:pancakeswap:volume'], evidence_locator: 'total30d in replayed dailyVolume response.', quality_flags: ['adapter_scope', 'not_additive_with_amm_series'] },
    { key: 'amm-tvl', dimension: 'tvl', label: 'PancakeSwap AMM tracked TVL', value: 1695663693, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:38Z', window: rolling('2026-08-03T17:36:38Z', 'point_in_time'), method: 'DefiLlama PancakeSwap AMM protocol TVL', scope: scope('PancakeSwap AMM contracts'), source_ids: ['source:pancakeswap:tvl'], evidence_locator: 'Latest totalLiquidityUSD observation at epoch 1785775019.', quality_flags: ['tvl_not_market_depth', 'adapter_scope'] },
    { key: 'amm-fees-30d', dimension: 'fees', label: 'PancakeSwap AMM trading fees, rolling 30 days', value: 3045207, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:35Z', window: rolling('2026-08-03T17:36:35Z', 'rolling_30d'), method: 'DefiLlama PancakeSwap AMM fee adapter', scope: scope('PancakeSwap AMM fee scope'), source_ids: ['source:pancakeswap:fees'], evidence_locator: 'total30d in replayed dailyFees response.', quality_flags: ['fees_not_profit', 'adapter_scope'] },
    { key: 'amm-revenue-30d', dimension: 'protocol_revenue', label: 'PancakeSwap AMM protocol revenue, rolling 30 days', value: 974461, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:36Z', window: rolling('2026-08-03T17:36:36Z', 'rolling_30d'), method: 'DefiLlama PancakeSwap AMM revenue adapter', scope: scope('PancakeSwap AMM protocol-revenue scope'), source_ids: ['source:pancakeswap:revenue'], evidence_locator: 'total30d in replayed dailyRevenue response.', quality_flags: ['revenue_not_profit', 'adapter_scope'] },
  ],
  events: [
    { key: 'launch', type: 'launch', date: '2020-09-20', description: 'PancakeSwap launched on BNB Chain with CAKE incentives near product launch.', source_ids: ['source:pancakeswap:five-years'], evidence_locator: 'Five-year operator timeline.' },
    { key: 'infinity', type: 'product_launch', date: '2025-04-28', description: 'PancakeSwap launched Infinity with modular pool types and hooks.', source_ids: ['source:pancakeswap:infinity'], evidence_locator: 'Dated launch announcement.' },
    { key: 'tokenomics3', type: 'tokenomics_change', date: '2025-04-23', description: 'CAKE Tokenomics 3.0 implementation retired veCAKE and gauges and began phased emission reductions.', source_ids: ['source:pancakeswap:tokenomics3'], evidence_locator: 'Implementation date and change list.' },
    { key: 'five-years', type: 'operating_milestone', date: '2025-09-22', description: 'PancakeSwap published its five-year multi-chain operating review.', source_ids: ['source:pancakeswap:five-years'], evidence_locator: 'Dated operator review.' },
    { key: 'cap-cut', type: 'tokenomics_change', date: '2026-01-19', description: 'PancakeSwap implemented the governance-approved CAKE hard-cap reduction from 450 million to 400 million.', source_ids: ['source:pancakeswap:january-2026', 'source:pancakeswap:tokenomics'], evidence_locator: 'January 2026 report and current tokenomics.' },
  ],
  unsourced_fields: ['Unique and retained traders', 'Pool-level market depth across every chain and version', 'Audited product-level expenses and profit', 'Complete incentive cost and treasury runway'],
  methodology_notes: [
    'The broad PancakeSwap DEX adapter and narrower PancakeSwap AMM adapter are retained separately and are never summed.',
    'Operator-reported supply and milestone claims remain labeled; independent adapter data does not validate every operator claim.',
  ],
});

const curve = buildProfile({
  slug: 'curve-finance',
  name: 'Curve',
  aliases: ['Curve Finance', 'Curve DEX'],
  legacy_origin: 'successful_exchanges',
  outcome_label: 'successful_but_declining',
  outcome_confidence: 'high',
  quality_confidence: 'high',
  classification: {
    subtype: 'multi-chain stable and correlated-asset AMM',
    tags: ['stableswap', 'vote_escrow', 'gauge_incentives', 'multi_chain'],
    chains: ['Ethereum', 'Arbitrum', 'Base', 'Optimism', 'Polygon', 'Avalanche', 'Gnosis', 'Fraxtal', 'Sonic'],
    jurisdictions: [],
  },
  sources: curveSources,
  status_source_ids: ['source:curve-finance:volume', 'source:curve-finance:tvl', 'source:curve-finance:audits'],
  status_evidence_locator: 'Current DefiLlama observations and maintained security documentation.',
  outcome_source_ids: ['source:curve-finance:why', 'source:curve-finance:volume', 'source:curve-finance:tvl', 'source:curve-finance:exploit'],
  outcome_evidence_locator: 'Specialized design, current activity, retained capital and the major 2023 security event.',
  sections: {
    what_it_is: {
      body: 'Curve is a non-custodial automated market maker designed first for stablecoins and other assets expected to trade near one another, then extended to volatile pairs through Cryptoswap. StableSwap changes the pricing curve so a pool can offer low slippage near the expected peg while still responding as balances move apart. Curve also operates a wider credit and stablecoin stack through crvUSD and LlamaLend, but this profile keeps exchange activity, lending and stablecoin economics separate. Liquidity providers own the inventory risk; smart contracts execute swaps; and governance uses vote-escrowed CRV to direct incentives and set parameters. A Curve-branded pool is not automatically safe: the assets, deployment, pool generation and gauges each matter.',
      source_ids: ['source:curve-finance:intro', 'source:curve-finance:why', 'source:curve-finance:stableswap', 'source:curve-finance:dao'],
      evidence_locator: 'Current protocol introduction, design explanation, whitepaper and DAO operating model.',
    },
    what_happened: {
      body: 'Curve launched in 2020 and became a core venue for stablecoin and correlated-asset liquidity. CRV and the Curve DAO followed in August 2020, turning liquidity incentives into a vote-directed market: protocols could seek gauge weight and users could lock CRV for governance, boost and fee rights. The model became influential enough to create a wider market for vote aggregation and incentives. Curve then added Cryptoswap, deployments on many EVM chains, crvUSD and lending. It also suffered a major shock on 2023-07-30 when pools compiled with vulnerable Vyper versions were exploited after a compiler bug defeated reentrancy protection. At the 2026-08-03 replay, Curve still had approximately $1.28 billion of tracked TVL and $1.99 billion of 30-day DEX volume, showing continued relevance at a smaller scale than its cycle peak.',
      source_ids: ['source:curve-finance:why', 'source:curve-finance:crv', 'source:curve-finance:vecrv', 'source:curve-finance:exploit', 'source:curve-finance:tvl', 'source:curve-finance:volume'],
      evidence_locator: 'Protocol chronology, token mechanics, security analysis and current independent observations.',
    },
    why_this_outcome: {
      body: 'Curve succeeded by specializing where a generic constant-product AMM was inefficient. StableSwap gave stable and correlated assets better capital efficiency near their peg, which attracted stablecoin issuers, aggregators and DeFi applications. The CRV gauge system then turned liquidity into a repeatable distribution market: issuers could compete for incentives rather than waiting for passive liquidity to appear. Those same strengths created dependencies. The exchange’s economics are tied to stablecoin quality, Ethereum and EVM liquidity, CRV emissions, governance aggregation and sophisticated liquidity-provider behavior. Current volume and TVL show that the product still has demand, but they do not prove retained users, pool-level depth or profitability. The 2023 exploit and later competition also show why infrastructure status does not remove security or substitution risk.',
      source_ids: ['source:curve-finance:stableswap', 'source:curve-finance:why', 'source:curve-finance:vecrv', 'source:curve-finance:volume', 'source:curve-finance:tvl', 'source:curve-finance:exploit'],
      evidence_locator: 'Documented design and incentive mechanisms read with current scale and the security record.',
      note: 'Analyst causal synthesis; individual factor weights are not observable.',
    },
    strategic_choices: {
      body: 'Curve chose specialization before breadth: the original market maker optimized trades between like-priced assets instead of trying to serve every pair. It then added Cryptoswap and more chains without abandoning stablecoin liquidity as the center of gravity. The second major choice was vote escrow. CRV holders must lock for up to four years to receive veCRV, whose voting power decays; lockers can vote on gauges, receive a fee share and boost rewards. This aligns long-term participants but creates lock-in, governance complexity and a market for delegated voting power. The DAO controls cross-chain gauge decisions from Ethereum, preserving a governance center while making remote deployments dependent on messaging and Ethereum coordination. Curve also kept substantial long-run emissions rather than using a fixed circulating supply, accepting dilution to fund liquidity while reducing issuance by 16 percent each August.',
      source_ids: ['source:curve-finance:why', 'source:curve-finance:vecrv', 'source:curve-finance:dao', 'source:curve-finance:crv'],
      evidence_locator: 'Protocol product chronology, current vote-escrow rules, cross-chain governance and emissions schedule.',
      note: 'Consequences are an analyst interpretation of documented mechanisms.',
    },
    operating_model: {
      body: 'Liquidity providers deposit assets into Curve pools and receive pool tokens; traders swap against those contracts without depositing into a custodial account. Pool fees are split according to deployed pool rules, while governance and gauges determine which pools receive CRV emissions. Users who lock CRV obtain non-transferable veCRV that decays until unlock, can boost eligible liquidity rewards, vote on DAO and gauge proposals and receive the protocol-defined fee share. Cross-chain deployments can use full or lighter implementations, but governance remains rooted in Ethereum. The model therefore has several economic layers: trading fees, liquidity-provider inventory risk, CRV emissions, external voting incentives and governance aggregation. DefiLlama TVL measures assets assigned to tracked contracts; it does not measure how much size can trade at a quoted spread in every pool.',
      source_ids: ['source:curve-finance:intro', 'source:curve-finance:why', 'source:curve-finance:vecrv', 'source:curve-finance:dao', 'source:curve-finance:tvl'],
      evidence_locator: 'User and protocol mechanics plus the current TVL adapter.',
    },
    token_and_value_capture: {
      body: 'CRV launched in August 2020 after the exchange had already attracted liquidity. Curve documents a maximum supply of about 3.03 billion CRV, with 57 percent allocated to community emissions and issuance declining by 16 percent each August; the original team and investor vesting finished in August 2024, while community emissions continue on a very long tail. CRV itself is liquid governance and incentive inventory. Holders must lock it into non-transferable veCRV to vote, boost rewards and receive the fee share, so value capture depends on choosing illiquidity and maintaining lock duration. DefiLlama reported $1.80 million of 30-day trading fees and $583,090 of 30-day protocol revenue in the reviewed adapter. Revenue is not profit, and veCRV does not represent equity, a redemption claim or ownership of liquidity-provider deposits.',
      source_ids: ['source:curve-finance:crv', 'source:curve-finance:vecrv', 'source:curve-finance:fees', 'source:curve-finance:revenue'],
      evidence_locator: 'Current supply and lock mechanics with replayed fee and protocol-revenue observations.',
    },
    counterfactual: {
      body: 'A Curve without CRV gauges would be simpler and less inflation-dependent, but stablecoin issuers and liquidity providers would lose a programmable mechanism for bootstrapping strategically important pools. A transferable fee-bearing token would be easier to price than decaying veCRV, but could weaken the long-term commitment and governance design. Remaining only on Ethereum would reduce cross-chain governance and deployment risk, while surrendering users and assets on other EVM chains. More conservative compiler-version controls and faster migration away from vulnerable legacy contracts might have reduced the 2023 loss surface, but the exploit’s unusual root cause was a compiler bug rather than an intentionally unsafe source-code design. The evidence cannot quantify how much volume or TVL any alternative would retain.',
      source_ids: ['source:curve-finance:vecrv', 'source:curve-finance:dao', 'source:curve-finance:why', 'source:curve-finance:exploit', 'source:curve-finance:audits'],
      evidence_locator: 'Observed incentive, chain and security choices used to bound alternatives.',
      note: 'Counterfactual scenario; no quantified causal estimate is available.',
    },
    risks_and_unknowns: {
      body: 'Curve’s first risk is asset quality: a stablecoin depeg or correlated-asset break can turn the low-slippage design into concentrated inventory losses for liquidity providers. The second is incentive complexity—emissions and external voting payments can support nominal liquidity that may leave when rewards change. The third is security across legacy pools, new pool generations, gauges, lending, stablecoin code and cross-chain governance. The 2023 Vyper incident demonstrated that compiler infrastructure can defeat intended protections even when source code looks correct. Audits document review, not safety guarantees. Unknowns include unique and retained traders, net liquidity-provider returns, pool-level market depth, the share of activity purchased by incentives, governance-power concentration after aggregators, product-level operating costs and how much demand would persist without CRV emissions.',
      source_ids: ['source:curve-finance:stableswap', 'source:curve-finance:crv', 'source:curve-finance:vecrv', 'source:curve-finance:audits', 'source:curve-finance:exploit', 'source:curve-finance:volume'],
      evidence_locator: 'Pool design, token mechanics, audit inventory, exploit analysis and current adapter observations.',
    },
    lifecycle: {
      body: 'Curve launched StableSwap in 2020 and added CRV and DAO governance in August that year. Cryptoswap followed in 2021, extending the design beyond pegged assets. The vote-escrow and gauge model became a durable part of DeFi liquidity allocation. On 2023-07-30, several pools compiled with affected Vyper versions were exploited; the incident was material but did not end the protocol. Initial insider vesting concluded in August 2024 while community emissions continued. Security documentation shows continuing audits of newer pool, stablecoin, lending and cross-chain components. On 2026-08-03 Curve remained operating across many chains with $79.28 million of 24-hour volume and approximately $1.28 billion TVL. The correct lifecycle label is successful but declining from earlier dominance, not dead and not fully recovered.',
      source_ids: ['source:curve-finance:why', 'source:curve-finance:crv', 'source:curve-finance:exploit', 'source:curve-finance:audits', 'source:curve-finance:volume', 'source:curve-finance:tvl'],
      evidence_locator: 'Dated product, token, security and current operating observations.',
    },
    outlook_and_watch: {
      body: 'The base case is continued operation as specialized stablecoin and correlated-asset infrastructure with a smaller share of the wider DEX market. The upside case requires new pools, crvUSD and integrations to generate fee-paying flow faster than incentives dilute CRV and competitors take routing. The downside case is a sequence of depegs, security failures or incentive decay that leaves gauges active but economic depth thin. Watch DEX volume, TVL without treating it as depth, trading fees and protocol revenue, pool-level slippage at fixed trade sizes, stablecoin concentration and depeg losses, CRV issuance and burns if any, veCRV concentration, incentive spending, Ethereum governance-message health, exploit and audit disclosures, and the share of liquidity that remains after gauge changes. Token price alone does not show protocol recovery.',
      source_ids: ['source:curve-finance:volume', 'source:curve-finance:tvl', 'source:curve-finance:fees', 'source:curve-finance:revenue', 'source:curve-finance:crv', 'source:curve-finance:vecrv', 'source:curve-finance:audits'],
      evidence_locator: 'Current independent metrics and documented token, governance and security mechanisms.',
      note: 'Scenario analysis, not a token-price forecast.',
    },
  },
  metrics: [
    { key: 'volume-24h', dimension: 'spot_volume', label: 'Curve DEX-adapter volume, rolling 24 hours', value: 79280214, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:39Z', window: rolling('2026-08-03T17:36:39Z', 'rolling_24h'), method: 'DefiLlama Curve DEX adapter', scope: scope('Curve DEX pools across listed chains'), source_ids: ['source:curve-finance:volume'], evidence_locator: 'total24h in replayed dailyVolume response.', quality_flags: ['adapter_scope', 'volume_not_liquidity', 'not_unique_users'] },
    { key: 'volume-30d', dimension: 'spot_volume', label: 'Curve DEX-adapter volume, rolling 30 days', value: 1985230048, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:39Z', window: rolling('2026-08-03T17:36:39Z', 'rolling_30d'), method: 'DefiLlama Curve DEX adapter', scope: scope('Curve DEX pools across listed chains'), source_ids: ['source:curve-finance:volume'], evidence_locator: 'total30d in replayed dailyVolume response.', quality_flags: ['adapter_scope'] },
    { key: 'tvl', dimension: 'tvl', label: 'Curve DEX tracked TVL', value: 1275163267, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:41Z', window: rolling('2026-08-03T17:36:41Z', 'point_in_time'), method: 'DefiLlama Curve DEX protocol TVL', scope: scope('Curve DEX contracts'), source_ids: ['source:curve-finance:tvl'], evidence_locator: 'Latest totalLiquidityUSD observation at epoch 1785776039.', quality_flags: ['tvl_not_market_depth', 'adapter_scope'] },
    { key: 'fees-30d', dimension: 'fees', label: 'Curve DEX trading fees, rolling 30 days', value: 1796226, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:39Z', window: rolling('2026-08-03T17:36:39Z', 'rolling_30d'), method: 'DefiLlama Curve DEX fee adapter', scope: scope('Curve DEX fee scope'), source_ids: ['source:curve-finance:fees'], evidence_locator: 'total30d in replayed dailyFees response.', quality_flags: ['fees_not_profit', 'adapter_scope'] },
    { key: 'revenue-30d', dimension: 'protocol_revenue', label: 'Curve DEX protocol revenue, rolling 30 days', value: 583090, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:40Z', window: rolling('2026-08-03T17:36:40Z', 'rolling_30d'), method: 'DefiLlama Curve DEX revenue adapter', scope: scope('Curve DEX protocol-revenue scope'), source_ids: ['source:curve-finance:revenue'], evidence_locator: 'total30d in replayed dailyRevenue response.', quality_flags: ['revenue_not_profit', 'adapter_scope'] },
  ],
  events: [
    { key: 'launch', type: 'launch', date: '2020-01-01', description: 'Curve launched StableSwap for stable and correlated assets in 2020.', source_ids: ['source:curve-finance:why', 'source:curve-finance:stableswap'], evidence_locator: 'Protocol history and current StableSwap implementation documentation; day is represented as year-start because the reviewed source gives the year.' },
    { key: 'crv-launch', type: 'token_launch', date: '2020-08-13', description: 'CRV and Curve DAO launched after the exchange product.', source_ids: ['source:curve-finance:crv', 'source:curve-finance:dao'], evidence_locator: 'Current CRV and DAO documentation.' },
    { key: 'cryptoswap', type: 'product_launch', date: '2021-01-01', description: 'Curve introduced Cryptoswap for volatile assets in 2021.', source_ids: ['source:curve-finance:why'], evidence_locator: 'Protocol product history; day is represented as year-start because the reviewed source gives the year.' },
    { key: 'vyper-exploit', type: 'security_incident', date: '2023-07-30', description: 'Pools compiled with affected Vyper versions were exploited after a compiler bug defeated reentrancy protection.', source_ids: ['source:curve-finance:exploit'], evidence_locator: 'BlockSec root-cause analysis and incident date.' },
    { key: 'vesting-end', type: 'tokenomics_milestone', date: '2024-08-13', description: 'The initial team and investor CRV vesting period finished while community emissions continued.', source_ids: ['source:curve-finance:crv'], evidence_locator: 'Current CRV distribution and vesting description.' },
  ],
  unsourced_fields: ['Unique and retained traders', 'Pool-level market depth across every deployment', 'Net liquidity-provider returns after incentives and depegs', 'Governance concentration after vote aggregators', 'Audited product-level expenses and profit'],
  methodology_notes: [
    'The profile separates Curve DEX metrics from crvUSD and LlamaLend economics unless a source explicitly combines them.',
    'The security incident is attributed to affected compiler versions and pools; it is not generalized to every Curve contract.',
  ],
});

const jupiter = buildProfile({
  slug: 'jupiter',
  name: 'Jupiter',
  aliases: ['Jupiter Exchange'],
  legacy_origin: 'successful_exchanges',
  outcome_label: 'successful_chain_native_router',
  outcome_confidence: 'high',
  quality_confidence: 'high',
  classification: {
    subtype: 'Solana liquidity aggregator and exchange suite',
    tags: ['liquidity_aggregator', 'routing', 'solana', 'multi_product'],
    chains: ['Solana'],
    jurisdictions: [],
  },
  sources: jupiterSources,
  status_source_ids: ['source:jupiter:execution', 'source:jupiter:volume', 'source:jupiter:family-fees'],
  status_evidence_locator: 'Current developer execution documentation and replayed routed-volume and fee observations.',
  outcome_source_ids: ['source:jupiter:genesis', 'source:jupiter:execution', 'source:jupiter:volume', 'source:jupiter:tokenomics'],
  outcome_evidence_locator: 'Product-before-token chronology, current router architecture, routed activity and current token policy.',
  sections: {
    what_it_is: {
      body: 'Jupiter is Solana’s routing and execution layer for token swaps, surrounded by a broader product suite. Its core aggregator compares routes across underlying liquidity venues and can source execution through Metis, JupiterZ RFQ, Dflow, OKX and other paths before returning a transaction for the user to sign. That makes Jupiter different from an AMM that owns the pool: routed notional can execute against Raydium, Orca, Meteora or another venue, so it overlaps the underlying exchange’s volume and must never be added to it as new market activity. Jupiter also offers or integrates products beyond routing, including perpetuals, lending and launch tooling. Those products have different capital, fee and risk boundaries and should not be described as one pool.',
      source_ids: ['source:jupiter:execution', 'source:jupiter:listing', 'source:jupiter:solana', 'source:jupiter:family-tvl'],
      evidence_locator: 'Current order execution, market routing and Solana-specific integration documentation plus the protocol-family adapter.',
    },
    what_happened: {
      body: 'Jupiter began routing Solana liquidity in 2021 and built distribution through wallets, applications and developers before launching JUP. The JUP token launched on 2024-01-31 after the product already had a meaningful routing role, making this a product-before-token case rather than a token-subsidized launch thesis. Jupiter expanded from quote aggregation into a meta-aggregator and wider exchange stack. At the 2026-08-03 replay, DefiLlama recorded $286.72 million of 24-hour and $15.39 billion of 30-day aggregator-routed volume. A separate Jupiter DEX adapter reported only $12.74 million and $910.17 million for the same windows because it tracks a different product scope. Neither figure is unique users, owned liquidity or profit, and routed volume overlaps the venues where execution occurred.',
      source_ids: ['source:jupiter:genesis', 'source:jupiter:execution', 'source:jupiter:volume', 'source:jupiter:dex-volume'],
      evidence_locator: 'Product-before-token chronology and separately scoped DefiLlama aggregator and DEX-adapter totals.',
    },
    why_this_outcome: {
      body: 'Jupiter’s success is best explained by distribution and execution quality on one fast-growing chain. Solana’s fragmented pool and order-flow landscape created a real routing problem; Jupiter made the best available path accessible through an API and interface, then wallets and applications embedded it. Each new integration improved distribution without requiring Jupiter to fund every pool itself. The product also benefited directly from Solana’s user growth and low-cost transactions, so protocol skill and base-chain conditions cannot be cleanly separated. Current routed volume is consistent with a durable order-flow role, but it does not prove Jupiter owns liquidity or that every route is profitable. The token came later and may strengthen governance and alignment, yet it was not necessary to create the original router demand.',
      source_ids: ['source:jupiter:execution', 'source:jupiter:listing', 'source:jupiter:solana', 'source:jupiter:genesis', 'source:jupiter:volume'],
      evidence_locator: 'Documented routing mechanism, Solana operating dependency, launch chronology and current routed activity.',
      note: 'Causal interpretation bounded by documented mechanisms; base-chain and product effects are not separately estimated.',
    },
    strategic_choices: {
      body: 'Jupiter first chose to aggregate rather than own all liquidity, trading inventory control for broader quote coverage and a distribution moat. It later became a meta-aggregator by combining multiple routing engines and RFQ sources, improving execution options while adding dependencies on third-party venues, market makers and routing logic. It stayed Solana-only, which simplifies integration and lets the team optimize for one transaction model, but makes uptime, fees, priority markets and ecosystem demand chain-dependent. JUP launched after product traction with a large community allocation and governance role. Current tokenomics direct 50 percent of on-chain revenue to the Litterbox buyback mechanism and report burns, while a February 2026 net-zero-emissions proposal sought to stop net-new emissions. The reviewed evidence does not prove that every element of that proposal passed or was implemented, so proposal terms remain proposals.',
      source_ids: ['source:jupiter:execution', 'source:jupiter:solana', 'source:jupiter:genesis', 'source:jupiter:tokenomics', 'source:jupiter:net-zero'],
      evidence_locator: 'Current routing architecture, Solana dependency, launch allocation, current token policy and a separately labeled governance proposal.',
      note: 'Proposal language is not treated as implemented policy without a verified execution record.',
    },
    operating_model: {
      body: 'A user or integrator requests a quote, Jupiter evaluates available routes, and the user signs the resulting Solana transaction. Jupiter can manage transaction landing, priority fees, slippage controls and confirmation logic, while custody stays in the user wallet until execution. The underlying venues or RFQ counterparties supply liquidity, so Jupiter’s router does not own the notional it routes. Its business model includes fees from selected products and routing services, but the DefiLlama family fee adapter combines more than the spot aggregator. The narrower aggregator adapter recorded $2.39 million of 30-day fees and protocol revenue, while the family adapter recorded $12.47 million of fees and $3.93 million of protocol revenue. Those series are different scopes, not additive components. Public data does not disclose audited product-level expenses or profit.',
      source_ids: ['source:jupiter:execution', 'source:jupiter:listing', 'source:jupiter:aggregator-fees', 'source:jupiter:family-fees', 'source:jupiter:family-revenue'],
      evidence_locator: 'Execution mechanics and separately scoped aggregator and protocol-family adapter totals.',
    },
    token_and_value_capture: {
      body: 'JUP launched in January 2024, years after the router, as an ecosystem and governance token rather than an ownership interest in pooled liquidity. The genesis design emphasized a 50/50 split between community and team-managed allocation; current documentation records team vesting restrictions, prior community-approved supply reduction, Jupuary distributions and a Litterbox that receives 50 percent of on-chain revenue for market purchases and burning. The page reported roughly 134 million JUP burned at the reviewed snapshot. Buyback-and-burn links product revenue to token supply, but it is not a cash distribution, redemption right or legal claim on Jupiter entities. Future emissions, team unlocks, community distributions and governance decisions can offset burns. The February 2026 net-zero proposal is evidence of the dilution debate, not by itself evidence of implemented zero issuance.',
      source_ids: ['source:jupiter:genesis', 'source:jupiter:tokenomics', 'source:jupiter:net-zero', 'source:jupiter:aggregator-fees', 'source:jupiter:family-revenue'],
      evidence_locator: 'Genesis allocation, current token page, proposal terms and current separately scoped revenue observations.',
    },
    counterfactual: {
      body: 'Owning more pools could give Jupiter greater control over liquidity economics, but it would require inventory incentives and would undermine the neutral-routing advantage that made it useful to many venues. Expanding to multiple chains could diversify Solana dependence, while losing the chain-specific optimization, integrations and brand position that form its moat. Launching JUP with the product might have funded growth earlier but would weaken the evidence that the router found demand on its own. A direct cash distribution could make value capture easier to understand than buyback-and-burn, yet it would create different legal, tax and treasury constraints. None of these alternatives has a reliable causal estimate; the practical test is whether Jupiter can retain routes, revenue and integrations if Solana growth or token rewards slow.',
      source_ids: ['source:jupiter:execution', 'source:jupiter:solana', 'source:jupiter:genesis', 'source:jupiter:tokenomics', 'source:jupiter:volume'],
      evidence_locator: 'Observed routing, chain and token choices used to bound alternatives.',
      note: 'Counterfactual scenario; no quantified causal estimate is available.',
    },
    risks_and_unknowns: {
      body: 'Jupiter is exposed to Solana uptime, transaction congestion, priority fees, token-program behavior and the security of every venue or route it touches. A correct router can still deliver a bad outcome if an underlying market is manipulated, illiquid or compromised. Market-listing filters reduce obvious pathologies but do not guarantee safe tokens or depth. Aggregator volume is especially easy to misuse: it overlaps underlying venue volume and says nothing by itself about unique traders, retained users, owned capital or profit. The wider protocol-family TVL figure includes non-aggregator products and borrowed scope, so it cannot be described as spot-router liquidity. Unknowns include route-level margins, repeat traders, dependence on incentives, market-maker concentration, failed-transaction rates, adverse-selection costs, audited expenses, governance concentration and the implemented status of every 2026 emissions proposal term.',
      source_ids: ['source:jupiter:execution', 'source:jupiter:listing', 'source:jupiter:solana', 'source:jupiter:swap-audit', 'source:jupiter:volume', 'source:jupiter:family-tvl'],
      evidence_locator: 'Execution and listing mechanics, security assessments and explicit adapter-scope boundaries.',
    },
    lifecycle: {
      body: 'Jupiter began as a Solana routing product in 2021. It built embedded distribution before the JUP genesis event and token launch on 2024-01-31. The product then widened from one routing engine into a meta-aggregator and broader exchange suite. Current tokenomics reflect supply reduction, recurring community distribution and Litterbox buyback-and-burn mechanics. In February 2026 a governance proposal argued for no net-new emissions, but this report withholds an implementation claim without a verified vote-and-execution record. On 2026-08-03 Jupiter remained operating with $286.72 million of 24-hour routed volume and $69,295 of 24-hour aggregator revenue in DefiLlama’s adapters. The lifecycle call is successful and chain-native, with token economics still evolving after product-market fit.',
      source_ids: ['source:jupiter:genesis', 'source:jupiter:execution', 'source:jupiter:tokenomics', 'source:jupiter:net-zero', 'source:jupiter:volume', 'source:jupiter:aggregator-fees'],
      evidence_locator: 'Product and token chronology, current mechanics, proposal status boundary and current routed activity.',
    },
    outlook_and_watch: {
      body: 'The base case is continued operation as Solana’s major routing and execution layer while the wider suite adds fee sources. The upside case requires more embedded order flow, reliable execution and growing aggregator revenue without depending on emissions. The downside case is order-flow leakage to wallets, RFQ networks or vertically integrated venues, amplified by a Solana slowdown or route incident. Watch routed volume without adding underlying DEX volume; direct DEX-adapter activity separately; aggregator fees and family fees as different scopes; quote improvement versus executable prices; failed and reverted transactions; route and market-maker concentration; Solana uptime and priority fees; JUP circulating supply, unlocks, Jupuary distributions, buybacks and burns; governance execution; security disclosures; and retained integrators and traders when those measures become available.',
      source_ids: ['source:jupiter:volume', 'source:jupiter:dex-volume', 'source:jupiter:aggregator-fees', 'source:jupiter:family-fees', 'source:jupiter:family-revenue', 'source:jupiter:solana', 'source:jupiter:tokenomics'],
      evidence_locator: 'Current independently replayed activity and fee scopes with documented chain and token mechanisms.',
      note: 'Scenario analysis, not a token-price forecast.',
    },
  },
  metrics: [
    { key: 'routed-volume-24h', dimension: 'spot_volume', label: 'Aggregator-routed volume, rolling 24 hours', value: 286722004, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:40:42Z', window: rolling('2026-08-03T17:40:42Z', 'rolling_24h'), method: 'DefiLlama Jupiter aggregator adapter', scope: scope('Jupiter routed volume on Solana', ['Solana']), source_ids: ['source:jupiter:volume'], evidence_locator: 'total24h in replayed aggregator dailyVolume response.', quality_flags: ['routed_volume_overlap', 'not_owned_liquidity', 'not_unique_users'] },
    { key: 'routed-volume-30d', dimension: 'spot_volume', label: 'Aggregator-routed volume, rolling 30 days', value: 15389749678, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:40:42Z', window: rolling('2026-08-03T17:40:42Z', 'rolling_30d'), method: 'DefiLlama Jupiter aggregator adapter', scope: scope('Jupiter routed volume on Solana', ['Solana']), source_ids: ['source:jupiter:volume'], evidence_locator: 'total30d in replayed aggregator dailyVolume response.', quality_flags: ['routed_volume_overlap', 'not_additive_with_underlying_dexs'] },
    { key: 'aggregator-fees-30d', dimension: 'fees', label: 'Jupiter Aggregator fees, rolling 30 days', value: 2392368, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:43Z', window: rolling('2026-08-03T17:36:43Z', 'rolling_30d'), method: 'DefiLlama Jupiter Aggregator fee adapter', scope: scope('Jupiter Aggregator', ['Solana']), source_ids: ['source:jupiter:aggregator-fees'], evidence_locator: 'total30d in replayed dailyFees response.', quality_flags: ['fees_not_profit', 'aggregator_scope'] },
    { key: 'family-revenue-30d', dimension: 'protocol_revenue', label: 'Jupiter protocol-family revenue, rolling 30 days', value: 3933439.93, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:42Z', window: rolling('2026-08-03T17:36:42Z', 'rolling_30d'), method: 'DefiLlama Jupiter family revenue adapter', scope: scope('Jupiter protocol family', ['Solana']), source_ids: ['source:jupiter:family-revenue'], evidence_locator: 'total30d in replayed dailyRevenue response.', quality_flags: ['revenue_not_profit', 'protocol_family_scope', 'not_aggregator_only'] },
    { key: 'family-tvl', dimension: 'tvl', label: 'Jupiter protocol-family tracked TVL', value: 1513615180.10471, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:43Z', window: rolling('2026-08-03T17:36:43Z', 'point_in_time'), method: 'DefiLlama Jupiter protocol-family TVL', scope: scope('Jupiter protocol family including non-aggregator products', ['Solana']), source_ids: ['source:jupiter:family-tvl'], evidence_locator: 'Latest totalLiquidityUSD observation at epoch 1785777059.', quality_flags: ['protocol_family_scope', 'includes_non_aggregator_products', 'tvl_not_market_depth'] },
  ],
  events: [
    { key: 'product-launch', type: 'launch', date: '2021-10-01', description: 'Jupiter began operating as a Solana liquidity-routing product in 2021.', source_ids: ['source:jupiter:genesis'], evidence_locator: 'Genesis history; day represented as month-start because the reviewed source gives the month.' },
    { key: 'jup-genesis', type: 'token_launch', date: '2024-01-31', description: 'JUP launched after the routing product had established distribution.', source_ids: ['source:jupiter:genesis', 'source:jupiter:tokenomics'], evidence_locator: 'Genesis post and current tokenomics.' },
    { key: 'supply-reduction', type: 'tokenomics_change', date: '2025-01-01', description: 'Jupiter documents a community-approved reduction to JUP supply before the reviewed snapshot.', source_ids: ['source:jupiter:tokenomics'], evidence_locator: 'Current tokenomics; day represented as year-start because the reviewed page does not give the execution date.' },
    { key: 'net-zero-proposal', type: 'governance_proposal', date: '2026-02-13', description: 'A Jupiter DAO proposal sought no net-new JUP emissions for the foreseeable future.', source_ids: ['source:jupiter:net-zero'], evidence_locator: 'Dated proposal; implementation is intentionally not asserted.' },
  ],
  unsourced_fields: ['Unique and retained traders', 'Route-level gross margin and audited profit', 'Market-maker and router concentration', 'Implemented status of every net-zero proposal term', 'Product-level expenses and treasury runway'],
  methodology_notes: [
    'Aggregator-routed volume overlaps underlying DEX execution and is never added to pool-venue volume.',
    'Protocol-family TVL and fees include non-aggregator products and are labeled separately from the spot router.',
  ],
});

const dydx = buildProfile({
  slug: 'dydx',
  name: 'dYdX',
  aliases: ['dYdX Chain', 'dYdX v4'],
  legacy_origin: 'successful_exchanges',
  outcome_label: 'successful_then_displaced',
  outcome_confidence: 'high',
  quality_confidence: 'high',
  classification: {
    subtype: 'sovereign-chain perpetual order book',
    tags: ['perpetuals', 'orderbook', 'appchain', 'staking'],
    chains: ['dYdX Chain', 'Ethereum legacy v3'],
    jurisdictions: [],
  },
  sources: dydxSources,
  status_source_ids: ['source:dydx:indexer', 'source:dydx:tvl', 'source:dydx:annual-2025'],
  status_evidence_locator: 'Current live market indexer, current TVL and latest reviewed annual operating report.',
  outcome_source_ids: ['source:dydx:architecture', 'source:dydx:sunset', 'source:dydx:indexer', 'source:dydx:annual-2025', 'source:dydx:surge'],
  outcome_evidence_locator: 'Appchain migration, legacy sunset, current activity and documented incentive intensity.',
  sections: {
    what_it_is: {
      body: 'dYdX is a non-custodial derivatives exchange built around a central-limit order book on its own Cosmos SDK and CometBFT blockchain. Validators agree on state, while an off-chain order book and matching network distribute orders before matched trades settle on-chain. Traders post collateral and manage leveraged perpetual positions rather than depositing assets into a conventional exchange account. The current dYdX Chain product is distinct from the older Ethereum/StarkEx v3 venue, whose trading was shut down in October 2024. DYDX is the chain’s native staking, governance and gas token. The architecture gives the protocol control over execution and fee distribution, but makes the exchange responsible for chain security, validators, oracles and incident coordination.',
      source_ids: ['source:dydx:intro', 'source:dydx:architecture', 'source:dydx:token', 'source:dydx:sunset'],
      evidence_locator: 'Current chain, order-book, token and legacy-product documentation.',
    },
    what_happened: {
      body: 'dYdX established decentralized perpetual trading on Ethereum scaling infrastructure, launched DYDX in 2021 after the product, and then made the unusually large strategic choice to replace v3 with a sovereign chain. The dYdX Chain produced its genesis block on 2023-10-26; v3 trading stopped a year later. The move redirected chain fees to validators and delegators and removed dependence on StarkEx, but it also forced users, liquidity and operations through a migration. By 2025 dYdX was using a $20 million Surge incentive program, fee holidays and product expansion to rebuild activity. On 2026-08-03 its live indexer showed $20.85 million of 24-hour perpetual notional across 296 listed markets, while DefiLlama tracked $76.45 million of v4 TVL and only $270,784 of 30-day fees. Those metrics show operation, not retained traders, profitability or category leadership.',
      source_ids: ['source:dydx:faq', 'source:dydx:sunset', 'source:dydx:distribution', 'source:dydx:surge', 'source:dydx:annual-2025', 'source:dydx:indexer', 'source:dydx:tvl', 'source:dydx:fees'],
      evidence_locator: 'Migration chronology, incentive programs and current independently separated activity, TVL and fee observations.',
    },
    why_this_outcome: {
      body: 'dYdX succeeded early because it focused on a professional derivatives product, used an order book familiar to active traders and solved execution before many decentralized competitors. The appchain choice then traded inherited infrastructure for product control: dYdX could own block-space, parameters and fee distribution, while accepting validator, oracle, bridge and migration risk. The chain continues to operate, but current notional and fees are small relative to its historic role and newer vertically integrated competitors. Documented trading rewards, rebates and fee holidays mean recent volume cannot be assumed organic. The supported diagnosis is success followed by displacement and an active recovery effort. The record does not isolate whether lost share came primarily from migration friction, execution quality, competitor design, incentives, token performance or market cycles.',
      source_ids: ['source:dydx:architecture', 'source:dydx:sunset', 'source:dydx:surge', 'source:dydx:annual-2025', 'source:dydx:indexer', 'source:dydx:fees'],
      evidence_locator: 'Documented architecture and migration choices, current scale and explicit incentive programs.',
      note: 'Analyst causal synthesis; factor weights are unresolved.',
    },
    strategic_choices: {
      body: 'The defining choice was to leave an Ethereum rollup-style architecture for a sovereign chain. That gave dYdX direct control over an exchange-specific order book, consensus, market listings and fee flow, but also made validator coordination and oracle operations part of the exchange product. The team then sunset v3 rather than run two perpetual venues indefinitely, reducing fragmentation while forcing migration. DYDX moved from an Ethereum governance token to the native L1 token used for staking, gas and governance, making security and token economics inseparable. Growth strategy remained incentive-heavy: launch rewards, the $20 million Surge program, trading competitions and fee holidays subsidized activity. In 2025 governance added buybacks and later raised the allocation, seeking stronger token value capture. These choices improve alignment only if durable fee-paying order flow survives after rewards and rebates fall.',
      source_ids: ['source:dydx:architecture', 'source:dydx:sunset', 'source:dydx:token', 'source:dydx:distribution', 'source:dydx:surge', 'source:dydx:buyback', 'source:dydx:annual-2025'],
      evidence_locator: 'Migration, chain-token, incentive and buyback records.',
      note: 'Consequences combine documented mechanisms with analyst interpretation.',
    },
    operating_model: {
      body: 'Orders are distributed and matched off-chain, then committed through dYdX Chain consensus. Positions, collateral, liquidations and insurance mechanisms are enforced by chain software; validators and their oracle sidecars must coordinate for correct execution. Traders pay market fees under governance-controlled tiers. The distribution module sends fee-pool proceeds to validators and delegators after community tax and validator commission, while later governance allocations also fund treasury, MegaVault and token buybacks. This is not a custodial exchange ledger, but users still face smart-contract and chain-software risk, validator liveness, oracle accuracy, bridge and collateral risk, liquidation mechanics and front-end restrictions. Current DefiLlama fee revenue equals fees in the v4 adapter, but revenue is not net profit because validator rewards, incentives, engineering, operations and losses remain outside that number.',
      source_ids: ['source:dydx:architecture', 'source:dydx:distribution', 'source:dydx:fees', 'source:dydx:revenue', 'source:dydx:outage'],
      evidence_locator: 'Order-book and fee-distribution architecture, current adapter scope and incident mechanics.',
    },
    token_and_value_capture: {
      body: 'DYDX launched in 2021 after dYdX had a working product, then became the native token of dYdX Chain at genesis in October 2023. The token has a one-billion initial supply framework and is used for staking, governance and gas; stakers help secure the chain and receive a share of fee-pool distribution after protocol deductions. A March 2025 buyback announcement initially described 25 percent of net protocol fees for monthly market purchases and staking. The 2025 annual report records governance increasing the buyback allocation in stages and ultimately directing 75 percent of net protocol revenue to the buyback account. That is a stronger economic link than governance alone, but DYDX is not equity and buybacks do not guarantee price support. Scheduled unlock completion, community treasury inventory, rewards and governance changes still affect circulating supply.',
      source_ids: ['source:dydx:token', 'source:dydx:faq', 'source:dydx:distribution', 'source:dydx:buyback', 'source:dydx:annual-2025'],
      evidence_locator: 'Native-token roles, supply framework, fee distribution and implemented governance buyback history.',
    },
    counterfactual: {
      body: 'Keeping v3 on Ethereum scaling infrastructure would avoid a chain migration and validator operating burden, while preserving dependence on StarkEx and limiting control over sequencing and fee distribution. Running v3 and the appchain in parallel longer might reduce user disruption but split liquidity and engineering attention. A less incentive-heavy growth plan would make organic demand easier to observe, but could leave order books too thin for professional traders. Earlier token buybacks could strengthen holder alignment, yet would reduce funds available for treasury, insurance, market making and product development. The evidence cannot say that any one alternative would have preserved leadership. The practical counterfactual test is whether current execution, fees and retained traders improve when Surge rewards and fee holidays decline.',
      source_ids: ['source:dydx:architecture', 'source:dydx:sunset', 'source:dydx:surge', 'source:dydx:buyback', 'source:dydx:annual-2025'],
      evidence_locator: 'Observed migration, incentive and fee-allocation choices used to bound alternatives.',
      note: 'Counterfactual scenario; no quantified causal estimate is available.',
    },
    risks_and_unknowns: {
      body: 'dYdX combines derivatives market risk with appchain operational risk. Liquidation or margin logic can fail under extreme conditions; validators must stay live and coordinated; oracle sidecars must publish current prices; collateral and bridges can fail; and governance can change market or fee parameters. The October 2025 incident is direct evidence: an incorrect order of operations in isolated-market collateral transfers triggered a failsafe halt, and incomplete oracle-sidecar restarts produced stale prices after the chain resumed. The proposed compensation totaled about $462,098. Current volume is also incentive-contaminated because Surge and fee holidays explicitly reward trading. Unknowns include retained traders, volume net of rebates and self-trading, execution quality versus competitors, validator concentration, product-level expenses, insurance adequacy across tail events and the durability of fee revenue after rewards fall.',
      source_ids: ['source:dydx:outage', 'source:dydx:compensation', 'source:dydx:surge', 'source:dydx:annual-2025', 'source:dydx:audit', 'source:dydx:indexer'],
      evidence_locator: 'Incident root cause and compensation accounting, explicit incentive programs, security review and current activity.',
    },
    lifecycle: {
      body: 'dYdX began operating in 2017 and later established v3 perpetual trading through Ethereum and StarkEx. DYDX launched in 2021 after product operation. The dYdX Chain generated its first block on 2023-10-26, moving the token and exchange to a sovereign L1. V3 trading halted on 2024-10-28 and the product froze two days later, leaving withdrawals available. In 2025 dYdX launched Surge incentives and buybacks, then expanded the buyback allocation through governance. The chain halted during the October 2025 liquidation incident and later documented a proposed $462,097.79 compensation calculation. On 2026-08-03 it remained live with measurable markets, collateral and fees, but at displaced economics. The lifecycle call is an operating former leader attempting recovery, not dead and not currently dominant.',
      source_ids: ['source:dydx:intro', 'source:dydx:token', 'source:dydx:sunset', 'source:dydx:surge', 'source:dydx:annual-2025', 'source:dydx:outage', 'source:dydx:compensation', 'source:dydx:indexer'],
      evidence_locator: 'Dated product, chain, token, incentive, incident and current operating milestones.',
    },
    outlook_and_watch: {
      body: 'The base case is continued operation as a smaller specialist perpetual exchange while governance uses product expansion, rebates and token buybacks to rebuild flow. The upside case requires better execution, more repeat traders and fee revenue that persists after incentives decline. The downside case is structural displacement: markets remain technically live but professional order flow, fees and security economics shrink. Watch 24-hour perpetual notional from the indexer, open interest in a separate series, fee revenue, TVL without calling it liquidity depth, active versus listed markets, bid-ask spread and slippage, retained traders, Surge rewards and fee rebates per dollar of activity, validator and voting-power concentration, oracle freshness, downtime, insurance and compensation events, net DYDX issuance, staking participation, buyback execution and treasury runway. Current volume alone cannot establish recovery.',
      source_ids: ['source:dydx:indexer', 'source:dydx:tvl', 'source:dydx:fees', 'source:dydx:surge', 'source:dydx:annual-2025', 'source:dydx:distribution', 'source:dydx:outage'],
      evidence_locator: 'Current operating metrics and documented incentive, security and token mechanisms.',
      note: 'Scenario analysis, not a token-price forecast.',
    },
  },
  metrics: [
    { key: 'perpetual-volume-24h', dimension: 'derivatives_notional', label: 'Perpetual notional volume, rolling 24 hours', value: 20853049.52939899, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:42:08Z', window: rolling('2026-08-03T17:42:08Z', 'rolling_24h'), method: 'Sum of volume24H across dYdX v4 perpetualMarkets indexer rows', scope: scope('dYdX v4 listed perpetual markets', ['dYdX Chain']), source_ids: ['source:dydx:indexer'], evidence_locator: 'Sum of numeric volume24H across 296 returned markets.', quality_flags: ['notional_not_revenue', 'incentive_sensitive', 'not_unique_users'] },
    { key: 'v4-tvl', dimension: 'tvl', label: 'dYdX v4 tracked TVL', value: 76454956, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:46Z', window: rolling('2026-08-03T17:36:46Z', 'point_in_time'), method: 'DefiLlama dYdX v4 protocol TVL', scope: scope('dYdX v4', ['dYdX Chain']), source_ids: ['source:dydx:tvl'], evidence_locator: 'Latest totalLiquidityUSD observation at epoch 1785776099.', quality_flags: ['tvl_not_market_depth', 'adapter_scope'] },
    { key: 'fees-24h', dimension: 'fees', label: 'dYdX v4 fees, rolling 24 hours', value: 2167, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:45Z', window: rolling('2026-08-03T17:36:45Z', 'rolling_24h'), method: 'DefiLlama dYdX v4 fee adapter', scope: scope('dYdX v4', ['dYdX Chain']), source_ids: ['source:dydx:fees'], evidence_locator: 'total24h in replayed dailyFees response.', quality_flags: ['fees_not_profit', 'adapter_scope'] },
    { key: 'fees-30d', dimension: 'fees', label: 'dYdX v4 fees, rolling 30 days', value: 270784, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:45Z', window: rolling('2026-08-03T17:36:45Z', 'rolling_30d'), method: 'DefiLlama dYdX v4 fee adapter', scope: scope('dYdX v4', ['dYdX Chain']), source_ids: ['source:dydx:fees'], evidence_locator: 'total30d in replayed dailyFees response.', quality_flags: ['fees_not_profit', 'incentive_sensitive', 'adapter_scope'] },
    { key: 'revenue-30d', dimension: 'protocol_revenue', label: 'dYdX v4 protocol revenue, rolling 30 days', value: 270784, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:46Z', window: rolling('2026-08-03T17:36:46Z', 'rolling_30d'), method: 'DefiLlama dYdX v4 revenue adapter', scope: scope('dYdX v4 fee-recipient scope', ['dYdX Chain']), source_ids: ['source:dydx:revenue'], evidence_locator: 'total30d in replayed dailyRevenue response.', quality_flags: ['revenue_not_profit', 'adapter_scope'] },
  ],
  events: [
    { key: 'token-launch', type: 'token_launch', date: '2021-08-04', description: 'DYDX launched after the dYdX product had begun operating.', source_ids: ['source:dydx:token', 'source:dydx:faq'], evidence_locator: 'Current token and FAQ history.' },
    { key: 'chain-genesis', type: 'chain_launch', date: '2023-10-26', description: 'The dYdX Chain produced its genesis block and DYDX became its native token.', source_ids: ['source:dydx:intro', 'source:dydx:faq'], evidence_locator: 'Current chain documentation and FAQ.' },
    { key: 'v3-sunset', type: 'product_sunset', date: '2024-10-28', description: 'Trading on dYdX v3 stopped before the product was frozen on October 30.', source_ids: ['source:dydx:sunset'], evidence_locator: 'Dated v3 sunset announcement.' },
    { key: 'buyback', type: 'tokenomics_change', date: '2025-04-23', description: 'The Treasury SubDAO initiated DYDX buybacks; governance expanded the allocation later in 2025.', source_ids: ['source:dydx:buyback', 'source:dydx:annual-2025'], evidence_locator: 'Initial announcement and annual governance record.' },
    { key: 'outage', type: 'security_incident', date: '2025-10-10', description: 'An isolated-market collateral-transfer ordering bug triggered a dYdX Chain halt and stale-oracle losses after restart.', source_ids: ['source:dydx:outage', 'source:dydx:compensation'], evidence_locator: 'Incident review, restart timeline and compensation analysis.' },
  ],
  unsourced_fields: ['Unique and retained traders', 'Volume net of rebates and self-trading', 'Audited product-level expenses and profit', 'Validator ownership concentration', 'Complete insurance adequacy under tail events'],
  methodology_notes: [
    'The current perpetual notional is replayed from the official indexer because the free DefiLlama derivatives endpoint was unavailable; DefiLlama TVL and fee metrics remain separately replayed.',
    'Incentive programs and fee holidays are explicit confounders; volume is not treated as organic demand without retention evidence.',
  ],
});

const thorswap = buildProfile({
  slug: 'thorswap',
  name: 'THORSwap',
  aliases: ['THORSwap Finance'],
  legacy_origin: 'mid_exchanges',
  outcome_label: 'middling_operating_niche',
  outcome_confidence: 'high',
  quality_confidence: 'high',
  classification: {
    subtype: 'cross-chain exchange aggregator and interface',
    tags: ['cross_chain', 'aggregator', 'interface', 'external_liquidity'],
    chains: ['THORChain', 'Maya Protocol', 'Chainflip', 'NEAR Intents', 'Ethereum'],
    jurisdictions: [],
  },
  sources: thorswapSources,
  status_source_ids: ['source:thorswap:fees', 'source:thorswap:volume', 'source:thorswap:terms'],
  status_evidence_locator: 'Current product and fee documentation, live routed-volume adapter and current terms.',
  outcome_source_ids: ['source:thorswap:fees', 'source:thorswap:volume', 'source:thorswap:tokenomics', 'source:thorswap:pause'],
  outcome_evidence_locator: 'Current cross-chain router scope, modest current activity, redesigned token economics and the 2023 interface pause.',
  sections: {
    what_it_is: {
      body: 'THORSwap is a cross-chain exchange interface and aggregator, not the THORChain blockchain itself. The application routes native-asset swaps through external liquidity and settlement systems including THORChain, Maya Protocol, Chainflip and NEAR Intents, and it can also aggregate Ethereum DEX routes. Users sign transactions from their wallets; THORSwap supplies route discovery, transaction construction and a branded interface. That distinction changes the analysis: THORSwap can earn an interface fee without owning the underlying pools, while route security and execution depend on the selected network. The THOR token is an Ethereum token tied to THORSwap utility, staking, governance and fee economics; RUNE is the separate native asset of THORChain and should not be conflated with THOR.',
      source_ids: ['source:thorswap:fees', 'source:thorswap:rune-edition', 'source:thorswap:ethereum-router', 'source:thorswap:token'],
      evidence_locator: 'Current router, THORChain edition, Ethereum aggregation and THOR token documentation.',
    },
    what_happened: {
      body: 'THORSwap grew as a major interface into THORChain’s native cross-chain swaps and launched THOR on 2021-10-20. It expanded routing to additional cross-chain networks and charged an interface-level exchange fee. In October 2023, after stolen FTX funds were routed through the service, THORSwap paused its front end for six days, then returned with updated terms and additional illicit-flow controls. The underlying THORChain protocol was not the same entity as the paused interface. THOR token emissions ended in November 2024 after a large burn, and a 2025 vote redirected 20 percent of protocol revenue to buyback and burn. On 2026-08-03 DefiLlama recorded $524,410 of 24-hour and $30.64 million of 30-day routed volume—evidence of an operating niche product, but far below a category-leading venue.',
      source_ids: ['source:thorswap:tokenomics', 'source:thorswap:pause', 'source:thorswap:terms', 'source:thorswap:buyback', 'source:thorswap:volume'],
      evidence_locator: 'Token chronology, independent interface-pause reporting, current terms, buyback policy and current routed volume.',
    },
    why_this_outcome: {
      body: 'THORSwap addressed a real problem: swapping native assets across chains without first wrapping every asset or opening a centralized-exchange account. By becoming an early and polished THORChain interface, it gained a recognizable route into technically complex infrastructure. The model remained structurally dependent on someone else’s liquidity, security and chain support. As competing wallets and aggregators added cross-chain routes, THORSwap had to broaden beyond THORChain and compete on execution, coverage and interface distribution. Current volume shows continued use, while its modest scale and near-zero tracked owned TVL fit a middling aggregator rather than a dominant liquidity venue. The 2023 pause also exposed the strategic conflict between permissionless settlement and a company-operated front end subject to legal and reputational constraints.',
      source_ids: ['source:thorswap:rune-edition', 'source:thorswap:fees', 'source:thorswap:ethereum-router', 'source:thorswap:volume', 'source:thorswap:tvl', 'source:thorswap:pause', 'source:thorswap:terms'],
      evidence_locator: 'Cross-chain product mechanism, current adapter observations and the documented interface-control event.',
      note: 'Analyst causal synthesis; route-level contribution and competitor effects are not separately estimated.',
    },
    strategic_choices: {
      body: 'THORSwap chose to be an interface and router over external cross-chain networks rather than build a sovereign liquidity protocol. That reduced the capital needed to support every market and let it add routes faster, but it ceded control over pool depth, chain security, asset support and settlement reliability. It added a 0.5 percent interface exchange fee for swaps above the documented threshold, creating direct revenue while risking worse quotes than fee-free interfaces. It launched THOR near the product’s early growth phase, used emissions and staking to build participation, then ended emissions through a large 2024 burn. In 2025 the community directed 20 percent of revenue to buyback and burn and 55 percent toward stakers and liquidity providers. The October 2023 front-end pause and stricter terms favored legal and reputational survival over uncensored interface access, while the underlying protocols remained distinct.',
      source_ids: ['source:thorswap:fees', 'source:thorswap:tokenomics', 'source:thorswap:buyback', 'source:thorswap:pause', 'source:thorswap:terms'],
      evidence_locator: 'Current fee, token and revenue-allocation rules plus the documented interface pause and terms change.',
      note: 'Trade-off analysis combines documented choices with analyst interpretation.',
    },
    operating_model: {
      body: 'THORSwap queries supported routes, presents a quote and constructs transactions that settle through the selected external network. THORChain, Maya, Chainflip, NEAR Intents or an Ethereum liquidity source supplies the underlying exchange mechanics; THORSwap applies interface logic and, where documented, its own affiliate or exchange fee. The current fee page lists a 0.5 percent fee for exchange transactions above $100 before discounts, with THOR-based membership able to reduce selected fees. Because liquidity is external, DefiLlama’s protocol page reports zero owned TVL while separately tracking about $4.57 million of THOR staking. Zero owned TVL does not mean no executable routes, and routed volume does not become THORSwap-owned liquidity. Public sources do not disclose audited expenses, counterparty contracts, route margins or consolidated profit.',
      source_ids: ['source:thorswap:fees', 'source:thorswap:rune-edition', 'source:thorswap:ethereum-router', 'source:thorswap:tvl', 'source:thorswap:adapter-fees'],
      evidence_locator: 'Current route and fee mechanics plus explicitly scoped protocol and staking adapter observations.',
    },
    token_and_value_capture: {
      body: 'THOR launched on 2021-10-20 with a stated 500 million maximum supply and roles spanning membership, fee discounts, governance, liquidity incentives and staked products such as vTHOR and uTHOR. Token economics changed materially. THORSwap documents a 104.694 million THOR burn on 2024-11-19 that ended emissions and reports approximately 213.4 million tokens burned in total at the cited snapshot. After an October 2025 vote, the current revenue split directs 20 percent to THOR buyback and burn, 55 percent to vTHOR, uTHOR, yTHOR and LP economics, and 25 percent to treasury. This is a stronger operating-revenue link than an emissions-only token, but THOR is not equity, does not own routed liquidity and has no redemption claim on treasury. Adapter revenue is not net profit or guaranteed future buyback capacity.',
      source_ids: ['source:thorswap:token', 'source:thorswap:tokenomics', 'source:thorswap:buyback', 'source:thorswap:adapter-revenue'],
      evidence_locator: 'Current launch, supply, emissions, burn and revenue-allocation documentation with a separately scoped adapter observation.',
    },
    counterfactual: {
      body: 'Building proprietary cross-chain liquidity would give THORSwap more control over fees and execution, but would require a much larger security, validator and capital system and would duplicate the networks it currently aggregates. Remaining exclusively a THORChain interface would preserve focus and brand clarity while increasing dependence on one route provider. A lower interface fee could improve quote competitiveness but reduce funds available for treasury, staking and buybacks. Never pausing the front end in 2023 would be more censorship-resistant, yet would expose the operator to greater sanctions, anti-money-laundering and reputational risk. The record cannot quantify which alternative maximizes value. The measurable decision test is whether multi-network expansion grows repeat routed flow and revenue faster than it adds integration and security cost.',
      source_ids: ['source:thorswap:rune-edition', 'source:thorswap:fees', 'source:thorswap:ethereum-router', 'source:thorswap:pause', 'source:thorswap:terms'],
      evidence_locator: 'Observed network, fee and interface-control choices used to bound alternatives.',
      note: 'Counterfactual scenario; no quantified causal estimate is available.',
    },
    risks_and_unknowns: {
      body: 'Every route inherits external protocol, validator, vault, bridge, solver, token and chain risk. A compromise or halt in one network can break a quoted path even if THORSwap’s interface code is sound. The router must also protect against stale quotes, slippage, spoofed tokens, approval risk and front-end compromise. The 2023 pause proves that access depends on an operator-controlled website and legal policy even when settlement protocols are decentralized. DefiLlama’s fee adapter reported $104,480 over 30 days but zero in the latest seven-day and 24-hour windows; that may reflect genuine inactivity, timing or adapter scope and should not be generalized into a solvency claim. Unknowns include unique and retained traders, route-level margins, quote competitiveness after fees, market-maker and network concentration, audited expenses, treasury runway, tokenholder concentration and the exact share of routed activity by network.',
      source_ids: ['source:thorswap:fees', 'source:thorswap:terms', 'source:thorswap:pause', 'source:thorswap:volume', 'source:thorswap:adapter-fees', 'source:thorswap:rune-edition'],
      evidence_locator: 'Current route and legal controls, the interface-pause event and separately scoped volume and fee observations.',
    },
    lifecycle: {
      body: 'THORSwap emerged as a major THORChain interface and launched THOR on 2021-10-20. It reported meaningful 2023 routing and affiliate-fee activity, then paused its front end on 2023-10-06 after illicit FTX-linked flows and resumed six days later with updated terms and additional controls. A 104.694 million THOR burn on 2024-11-19 ended emissions. The community approved a recurring revenue-funded buyback-and-burn program on 2025-10-17. By 2026 the product routed across THORChain, Maya, Chainflip, NEAR Intents and Ethereum sources. On 2026-08-03 it remained live with $30.64 million of 30-day routed volume, zero adapter-owned TVL and separately tracked THOR staking. The lifecycle call is operating and strategically adaptive but economically middling, not THORChain itself and not dead.',
      source_ids: ['source:thorswap:recap-2023', 'source:thorswap:pause', 'source:thorswap:terms', 'source:thorswap:tokenomics', 'source:thorswap:buyback', 'source:thorswap:fees', 'source:thorswap:volume', 'source:thorswap:tvl'],
      evidence_locator: 'Dated product, interface-control, token-policy and current operating observations.',
    },
    outlook_and_watch: {
      body: 'The base case is continued operation as a niche cross-chain router with direct interface fees and post-emission THOR economics. The upside case requires more supported routes and embedded wallet distribution to grow fee-paying repeat flow without weakening execution. The downside case is disintermediation by wallets and aggregators that offer the same external networks at lower fees, or a route incident that damages trust. Watch routed volume by network without adding underlying protocol volume; executable quote quality after fees; success and refund rates; owned TVL separately from external route liquidity; adapter fees and revenue; THOR staking, buybacks, burns and treasury share; route-provider concentration; supported-chain additions and removals; interface uptime and policy changes; security incidents; and retained traders when available. A rising THOR price alone would not demonstrate product recovery.',
      source_ids: ['source:thorswap:volume', 'source:thorswap:tvl', 'source:thorswap:adapter-fees', 'source:thorswap:adapter-revenue', 'source:thorswap:fees', 'source:thorswap:tokenomics', 'source:thorswap:buyback', 'source:thorswap:terms'],
      evidence_locator: 'Current activity and fee metrics with documented network, token and access mechanisms.',
      note: 'Scenario analysis, not a token-price forecast.',
    },
  },
  metrics: [
    { key: 'routed-volume-24h', dimension: 'spot_volume', label: 'THORSwap routed volume, rolling 24 hours', value: 524410, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:46Z', window: rolling('2026-08-03T17:36:46Z', 'rolling_24h'), method: 'DefiLlama THORSwap DEX adapter', scope: scope('THORSwap routes across listed networks'), source_ids: ['source:thorswap:volume'], evidence_locator: 'total24h in replayed dailyVolume response.', quality_flags: ['routed_volume_overlap', 'not_owned_liquidity', 'not_unique_users'] },
    { key: 'routed-volume-30d', dimension: 'spot_volume', label: 'THORSwap routed volume, rolling 30 days', value: 30637753, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:46Z', window: rolling('2026-08-03T17:36:46Z', 'rolling_30d'), method: 'DefiLlama THORSwap DEX adapter', scope: scope('THORSwap routes across listed networks'), source_ids: ['source:thorswap:volume'], evidence_locator: 'total30d in replayed dailyVolume response.', quality_flags: ['routed_volume_overlap', 'not_additive_with_route_providers'] },
    { key: 'owned-tvl', dimension: 'tvl', label: 'THORSwap adapter-owned TVL', value: 0, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:47Z', window: rolling('2026-08-03T17:36:47Z', 'point_in_time'), method: 'DefiLlama THORSwap protocol TVL', scope: scope('THORSwap owned protocol TVL; external route liquidity excluded'), source_ids: ['source:thorswap:tvl'], evidence_locator: 'Latest totalLiquidityUSD observation at epoch 1785775079.', note: 'Zero owned TVL does not mean no executable external route liquidity; staking is tracked separately by the adapter.', quality_flags: ['external_liquidity_excluded', 'tvl_not_market_depth'] },
    { key: 'fees-30d', dimension: 'fees', label: 'THORSwap adapter fees, rolling 30 days', value: 104480, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:46Z', window: rolling('2026-08-03T17:36:46Z', 'rolling_30d'), method: 'DefiLlama THORSwap fee adapter', scope: scope('THORSwap fee adapter; chain scope reported as Ethereum'), source_ids: ['source:thorswap:adapter-fees'], evidence_locator: 'total30d in replayed dailyFees response.', note: 'The same response reported zero over the latest seven-day and 24-hour windows; do not generalize beyond the adapter scope.', quality_flags: ['fees_not_profit', 'adapter_scope', 'recent_zero_window'] },
    { key: 'revenue-30d', dimension: 'protocol_revenue', label: 'THORSwap adapter protocol revenue, rolling 30 days', value: 104480, unit: 'usd', currency: 'USD', as_of: '2026-08-03T17:36:47Z', window: rolling('2026-08-03T17:36:47Z', 'rolling_30d'), method: 'DefiLlama THORSwap revenue adapter', scope: scope('THORSwap protocol-revenue adapter; chain scope reported as Ethereum'), source_ids: ['source:thorswap:adapter-revenue'], evidence_locator: 'total30d in replayed dailyRevenue response.', quality_flags: ['revenue_not_profit', 'adapter_scope', 'recent_zero_window'] },
  ],
  events: [
    { key: 'token-launch', type: 'token_launch', date: '2021-10-20', description: 'THOR launched as THORSwap’s utility, governance and incentive token.', source_ids: ['source:thorswap:tokenomics', 'source:thorswap:token'], evidence_locator: 'Current tokenomics and token overview.' },
    { key: 'interface-pause', type: 'operational_pause', date: '2023-10-06', description: 'THORSwap paused its interface after illicit FTX-linked funds were routed through the service.', source_ids: ['source:thorswap:pause'], evidence_locator: 'Independent report of pause scope, cause and date.' },
    { key: 'interface-resume', type: 'operational_restart', date: '2023-10-12', description: 'THORSwap resumed after six days with updated terms and additional illicit-flow controls.', source_ids: ['source:thorswap:pause', 'source:thorswap:terms'], evidence_locator: 'Independent restart report and dated terms.' },
    { key: 'emissions-end', type: 'tokenomics_change', date: '2024-11-19', description: 'A 104.694 million THOR burn ended recurring THOR emissions.', source_ids: ['source:thorswap:tokenomics'], evidence_locator: 'Current tokenomics burn and emissions history.' },
    { key: 'buyback-vote', type: 'tokenomics_change', date: '2025-10-17', description: 'The THORSwap community approved using 20 percent of revenue for THOR buyback and burn.', source_ids: ['source:thorswap:buyback', 'source:thorswap:tokenomics'], evidence_locator: 'Current buyback program and tokenomics allocation.' },
  ],
  unsourced_fields: ['Unique and retained traders', 'Route-level margin and audited profit', 'Quote competitiveness net of interface fees', 'Route-provider concentration', 'Treasury runway and complete operating expenses'],
  methodology_notes: [
    'THORSwap is modeled separately from THORChain; routed volume and external liquidity are not assigned to the interface as owned capital.',
    'The 2023 event is scoped to the operator-controlled interface and terms, not represented as a THORChain consensus halt.',
  ],
});

function feature({
  slug, lifecycle, operatingModel, productCohort, primaryChain, chains, tokenSymbol,
  tokenLaunchDate, tokenLaunchTiming, tokenStrategy, tokenSourceUrl, metricType,
  metricObservedAt, comparabilityKey,
}) {
  return {
    kind: 'dex',
    slug,
    lifecycle,
    operating_model: operatingModel,
    product_cohort: productCohort,
    custody_model: 'non_custodial',
    primary_chain: primaryChain,
    chains,
    token_status: 'launched',
    token_symbol: tokenSymbol,
    token_launch_date: tokenLaunchDate,
    token_launch_timing: tokenLaunchTiming,
    token_strategy: tokenStrategy,
    token_source_url: tokenSourceUrl,
    metric_type: metricType,
    metric_unit: 'usd',
    metric_window: 'rolling_24h',
    metric_as_of: AS_OF_DATE,
    metric_observed_at: metricObservedAt,
    comparability_key: comparabilityKey,
    evidence: {
      canonical_profile: true,
      claims_pending_human_review: true,
      metric_replayed_at: metricObservedAt,
    },
    quality_label: 'verified',
    quality_issues: [],
    lifecycle_evidence_date: AS_OF_DATE,
    last_verified_at: AS_OF_DATE,
    next_review_at: '2026-08-10',
    freshness_status: 'current',
    updated_at: AS_OF_DATE,
  };
}

export const document = {
  schema: 'chaindump-dex-gold-wave-v1',
  as_of: AS_OF_DATE,
  generated_migration: '0077_dex_gold_profiles.sql',
  cases: [
    {
      table: 'successful_exchanges',
      slug: 'pancakeswap',
      legacy: {
        metric_label: '24h broad DEX-adapter volume', metric_type: 'spot_volume_24h', metric_unit: 'USD', metric: 546038063,
        why_successful: 'PancakeSwap combined BNB Chain retail distribution, low-cost execution, CAKE-funded liquidity and repeated product iteration, then diversified across chains. Its success is observable; the relative contribution of incentives, routing and organic repeat demand remains unresolved.',
        outlook: 'Established and operating. Watch broad versus AMM-only volume separately, AMM TVL, retained fees, CAKE net issuance, incentive efficiency, chain concentration and Infinity hook risk.',
        operating_model: 'Multi-chain non-custodial AMM suite spanning classic, concentrated-liquidity, StableSwap and Infinity pools.',
        synthesis: 'A large exchange whose distribution and iteration survived multiple cycles; token redesign shows that emissions remain an operating cost rather than free growth.',
      },
      canonical_profile: pancakeswap,
      feature: feature({ slug: 'pancakeswap', lifecycle: 'successful', operatingModel: 'Multi-chain non-custodial AMM suite spanning classic, concentrated-liquidity, StableSwap and Infinity pools.', productCohort: 'spot_amm_multichain', primaryChain: 'BNB Chain', chains: ['BNB Chain', 'Ethereum', 'Base', 'Arbitrum', 'Aptos', 'Solana', 'Linea', 'zkSync Era', 'opBNB', 'Monad'], tokenSymbol: 'CAKE', tokenLaunchDate: '2020-09-20', tokenLaunchTiming: 'at_or_near_launch', tokenStrategy: 'governance_liquidity_incentives_utility_and_burns', tokenSourceUrl: 'https://docs.pancakeswap.finance/protocol/cake-tokenomics', metricType: 'spot_volume_24h', metricObservedAt: '2026-08-03T17:36:34Z', comparabilityKey: 'dex|spot_amm_multichain|spot_volume_24h|usd|rolling_24h' }),
    },
    {
      table: 'successful_exchanges',
      slug: 'curve-finance',
      legacy: {
        metric_label: '24h Curve DEX-adapter volume', metric_type: 'spot_volume_24h', metric_unit: 'USD', metric: 79280214,
        why_successful: 'Curve specialized in stable and correlated assets, then reinforced the product with vote-directed liquidity incentives. It remains important infrastructure, but current scale, incentive complexity and the 2023 exploit support a successful-but-declining call.',
        outlook: 'Operating and specialized, but below earlier dominance. Watch pool-level depth, stablecoin risk, fee revenue, CRV emissions, veCRV concentration, incentives and security across contract generations.',
        operating_model: 'Multi-chain StableSwap and Cryptoswap AMM with CRV emissions and veCRV-directed gauges rooted in Ethereum governance.',
        synthesis: 'Purpose-built market structure and an incentive marketplace created durable relevance; specialization did not remove stablecoin, governance or compiler risk.',
      },
      canonical_profile: curve,
      feature: feature({ slug: 'curve-finance', lifecycle: 'successful', operatingModel: 'Multi-chain StableSwap and Cryptoswap AMM with CRV emissions and veCRV-directed gauges rooted in Ethereum governance.', productCohort: 'stable_swap_amm', primaryChain: 'Ethereum', chains: ['Ethereum', 'Arbitrum', 'Base', 'Optimism', 'Polygon', 'Avalanche', 'Gnosis', 'Fraxtal', 'Sonic'], tokenSymbol: 'CRV', tokenLaunchDate: '2020-08-13', tokenLaunchTiming: 'post_product', tokenStrategy: 'vote_escrow_governance_fees_and_liquidity_emissions', tokenSourceUrl: 'https://resources.curve.finance/user/curve-tokens/crv', metricType: 'spot_volume_24h', metricObservedAt: '2026-08-03T17:36:39Z', comparabilityKey: 'dex|stable_swap_amm|spot_volume_24h|usd|rolling_24h' }),
    },
    {
      table: 'successful_exchanges',
      slug: 'jupiter',
      legacy: {
        metric_label: '24h aggregator-routed volume', metric_type: 'aggregator_routed_volume_24h', metric_unit: 'USD', metric: 286722004,
        why_successful: 'Jupiter solved fragmented Solana execution, embedded its router in wallets and applications, and established distribution before launching JUP. Routed volume overlaps underlying venues and does not establish owned liquidity or unique users.',
        outlook: 'Successful and Solana-dependent. Watch routed flow, executable quote quality, aggregator fees, JUP issuance versus burns, integrations, route concentration and Solana reliability.',
        operating_model: 'Solana meta-aggregator routing user-signed swaps across independent AMMs, RFQ sources and execution engines.',
        synthesis: 'A product-before-token distribution case: Jupiter owns order-flow relationships rather than all of the liquidity it routes.',
      },
      canonical_profile: jupiter,
      feature: feature({ slug: 'jupiter', lifecycle: 'successful', operatingModel: 'Solana meta-aggregator routing user-signed swaps across independent AMMs, RFQ sources and execution engines.', productCohort: 'liquidity_aggregator', primaryChain: 'Solana', chains: ['Solana'], tokenSymbol: 'JUP', tokenLaunchDate: '2024-01-31', tokenLaunchTiming: 'post_product', tokenStrategy: 'dao_governance_ecosystem_distribution_and_revenue_funded_burns', tokenSourceUrl: 'https://docs.jup.ag/user-docs/more/jup-token/tokenomics', metricType: 'aggregator_routed_volume_24h', metricObservedAt: '2026-08-03T17:40:42Z', comparabilityKey: 'dex|liquidity_aggregator|aggregator_routed_volume_24h|usd|rolling_24h' }),
    },
    {
      table: 'successful_exchanges',
      slug: 'dydx',
      legacy: {
        metric_label: '24h perpetual notional volume', metric_type: 'perpetual_notional_volume_24h', metric_unit: 'USD', metric: 20853049.52939899,
        why_successful: 'dYdX proved decentralized perpetual order books could work, then traded Ethereum infrastructure for a sovereign chain. It remains live but is now a displaced former leader using material incentives, product expansion and buybacks to recover order flow.',
        outlook: 'Operating but displaced. Watch notional, open interest, fees, spreads, retained traders, incentives, validator and oracle reliability, insurance events and DYDX buyback execution.',
        operating_model: 'Sovereign dYdX Chain perpetual order book with off-chain matching, on-chain settlement, validator consensus and native DYDX staking.',
        synthesis: 'A success-and-displacement case where appchain control improved fee and token alignment but added migration, validator and oracle responsibility.',
      },
      canonical_profile: dydx,
      feature: feature({ slug: 'dydx', lifecycle: 'successful', operatingModel: 'Sovereign dYdX Chain perpetual order book with off-chain matching, on-chain settlement, validator consensus and native DYDX staking.', productCohort: 'perpetual_orderbook', primaryChain: 'dYdX Chain', chains: ['dYdX Chain', 'Ethereum legacy v3'], tokenSymbol: 'DYDX', tokenLaunchDate: '2021-08-04', tokenLaunchTiming: 'post_product', tokenStrategy: 'network_security_governance_fee_distribution_and_buybacks', tokenSourceUrl: 'https://docs.dydx.community/dydx/start-here/dydx-token', metricType: 'perpetual_notional_volume_24h', metricObservedAt: '2026-08-03T17:42:08Z', comparabilityKey: 'dex|perpetual_orderbook|perpetual_notional_volume_24h|usd|rolling_24h' }),
    },
    {
      table: 'mid_exchanges',
      slug: 'thorswap',
      legacy: {
        metric_label: '24h aggregator-routed volume', metric_type: 'aggregator_routed_volume_24h', metric_unit: 'USD', metric: 524410,
        verdict: 'Operating niche cross-chain aggregator; economically middling and distinct from THORChain.',
        why_stuck: 'THORSwap offers useful native-asset routing but depends on external networks for liquidity and settlement, competes with embedded wallets and aggregators, and exposed operator control when it paused its interface after illicit flows in 2023.',
        outlook: 'Watch routed flow by network, quote quality after fees, revenue, route concentration, access policy, incidents and THOR buybacks. Do not assign THORChain liquidity or volume to THORSwap.',
        operating_model: 'Cross-chain interface and aggregator routing user-signed swaps through THORChain, Maya, Chainflip, NEAR Intents and Ethereum sources.',
        synthesis: 'A distinct interface business with direct fees and token economics but externally supplied liquidity, security and settlement.',
        sources: thorswapSources.map(({ title, url }) => ({ title, url })),
      },
      canonical_profile: thorswap,
      feature: feature({ slug: 'thorswap', lifecycle: 'mid', operatingModel: 'Cross-chain interface and aggregator routing user-signed swaps through THORChain, Maya, Chainflip, NEAR Intents and Ethereum sources.', productCohort: 'cross_chain_aggregator', primaryChain: 'THORChain', chains: ['THORChain', 'Maya Protocol', 'Chainflip', 'NEAR Intents', 'Ethereum'], tokenSymbol: 'THOR', tokenLaunchDate: '2021-10-20', tokenLaunchTiming: 'at_or_near_launch', tokenStrategy: 'membership_governance_staking_fee_discounts_and_revenue_funded_burns', tokenSourceUrl: 'https://docs.thorswap.finance/thorswap/thor/about/thor-tokenomics', metricType: 'aggregator_routed_volume_24h', metricObservedAt: '2026-08-03T17:36:46Z', comparabilityKey: 'dex|cross_chain_aggregator|aggregator_routed_volume_24h|usd|rolling_24h' }),
    },
  ],
};

export function renderMigration(value = document) {
  const sqlText = (entry) => `'${String(entry).replaceAll("'", "''")}'`;
  const sqlJson = (entry) => `'${JSON.stringify(entry).replaceAll("'", "''")}'`;
  const stagedRows = value.cases.map((entry) => `INSERT INTO _dex_gold_profiles_0077 (
  target_table, slug, legacy, canonical_profile, feature
)
VALUES (
  ${sqlText(entry.table)},
  ${sqlText(entry.slug)},
  ${sqlJson(entry.legacy)},
  ${sqlJson(entry.canonical_profile)},
  ${sqlJson(entry.feature)}
);`).join('\n\n');
  return `-- Five source-linked DEX profiles assembled and source-checked 2026-08-03.
-- Claims remain pending human review. THORSwap is inserted separately from THORChain.

DROP TABLE IF EXISTS _dex_gold_profiles_0077;

CREATE TABLE _dex_gold_profiles_0077 (
  target_table TEXT NOT NULL,
  slug TEXT NOT NULL,
  legacy TEXT NOT NULL CHECK (json_valid(legacy)),
  canonical_profile TEXT NOT NULL CHECK (json_valid(canonical_profile)),
  feature TEXT NOT NULL CHECK (json_valid(feature)),
  PRIMARY KEY (target_table, slug)
);

-- canonical-payload-start
${stagedRows}
-- canonical-payload-end

INSERT INTO mid_exchanges (
  slug, kind, venue_type, name, launched, metric_label, metric_type, metric_unit,
  metric, verdict, why_stuck, outlook, profile, sources, updated_at
)
SELECT
  staged.slug, 'dex', 'exchange', 'THORSwap', '2021-10-20',
  json_extract(staged.legacy, '$.metric_label'),
  json_extract(staged.legacy, '$.metric_type'),
  json_extract(staged.legacy, '$.metric_unit'),
  json_extract(staged.legacy, '$.metric'),
  json_extract(staged.legacy, '$.verdict'),
  json_extract(staged.legacy, '$.why_stuck'),
  json_extract(staged.legacy, '$.outlook'),
  json_object(
    'canonical_profile', json(staged.canonical_profile),
    'operational_model', json_extract(staged.legacy, '$.operating_model'),
    'synthesis', json_extract(staged.legacy, '$.synthesis')
  ),
  json_extract(staged.legacy, '$.sources'),
  '${AS_OF_DATE}'
FROM _dex_gold_profiles_0077 AS staged
WHERE staged.target_table = 'mid_exchanges' AND staged.slug = 'thorswap'
ON CONFLICT(kind, slug) DO UPDATE SET
  venue_type = excluded.venue_type,
  name = excluded.name,
  launched = excluded.launched,
  metric_label = excluded.metric_label,
  metric_type = excluded.metric_type,
  metric_unit = excluded.metric_unit,
  metric = excluded.metric,
  verdict = excluded.verdict,
  why_stuck = excluded.why_stuck,
  outlook = excluded.outlook,
  profile = excluded.profile,
  sources = excluded.sources,
  updated_at = excluded.updated_at;

UPDATE successful_exchanges AS exchange_row
SET
  metric_label = json_extract(staged.legacy, '$.metric_label'),
  metric_type = json_extract(staged.legacy, '$.metric_type'),
  metric_unit = json_extract(staged.legacy, '$.metric_unit'),
  metric = json_extract(staged.legacy, '$.metric'),
  why_successful = json_extract(staged.legacy, '$.why_successful'),
  outlook = json_extract(staged.legacy, '$.outlook'),
  profile = json_set(
    COALESCE(exchange_row.profile, '{}'),
    '$.canonical_profile', json(staged.canonical_profile),
    '$.operational_model', json_extract(staged.legacy, '$.operating_model'),
    '$.synthesis', json_extract(staged.legacy, '$.synthesis')
  ),
  updated_at = '${AS_OF_DATE}'
FROM _dex_gold_profiles_0077 AS staged
WHERE staged.target_table = 'successful_exchanges'
  AND exchange_row.type = 'dex'
  AND exchange_row.slug = staged.slug;

INSERT INTO exchange_case_features (
  kind, slug, lifecycle, operating_model, product_cohort, custody_model,
  primary_chain, chains, token_status, token_symbol, token_launch_date,
  token_launch_timing, token_strategy, token_source_url, metric_type,
  metric_unit, metric_window, metric_as_of, metric_observed_at,
  comparability_key, evidence, quality_label, quality_issues,
  lifecycle_evidence_date, last_verified_at, next_review_at,
  freshness_status, updated_at
)
SELECT
  json_extract(feature, '$.kind'), json_extract(feature, '$.slug'),
  json_extract(feature, '$.lifecycle'), json_extract(feature, '$.operating_model'),
  json_extract(feature, '$.product_cohort'), json_extract(feature, '$.custody_model'),
  json_extract(feature, '$.primary_chain'), json_extract(feature, '$.chains'),
  json_extract(feature, '$.token_status'), json_extract(feature, '$.token_symbol'),
  json_extract(feature, '$.token_launch_date'), json_extract(feature, '$.token_launch_timing'),
  json_extract(feature, '$.token_strategy'), json_extract(feature, '$.token_source_url'),
  json_extract(feature, '$.metric_type'), json_extract(feature, '$.metric_unit'),
  json_extract(feature, '$.metric_window'), json_extract(feature, '$.metric_as_of'),
  json_extract(feature, '$.metric_observed_at'), json_extract(feature, '$.comparability_key'),
  json_extract(feature, '$.evidence'), json_extract(feature, '$.quality_label'),
  json_extract(feature, '$.quality_issues'), json_extract(feature, '$.lifecycle_evidence_date'),
  json_extract(feature, '$.last_verified_at'), json_extract(feature, '$.next_review_at'),
  json_extract(feature, '$.freshness_status'), json_extract(feature, '$.updated_at')
FROM _dex_gold_profiles_0077
WHERE 1 = 1
ON CONFLICT(kind, slug, lifecycle) DO UPDATE SET
  operating_model = excluded.operating_model,
  product_cohort = excluded.product_cohort,
  custody_model = excluded.custody_model,
  primary_chain = excluded.primary_chain,
  chains = excluded.chains,
  token_status = excluded.token_status,
  token_symbol = excluded.token_symbol,
  token_launch_date = excluded.token_launch_date,
  token_launch_timing = excluded.token_launch_timing,
  token_strategy = excluded.token_strategy,
  token_source_url = excluded.token_source_url,
  metric_type = excluded.metric_type,
  metric_unit = excluded.metric_unit,
  metric_window = excluded.metric_window,
  metric_as_of = excluded.metric_as_of,
  metric_observed_at = excluded.metric_observed_at,
  comparability_key = excluded.comparability_key,
  evidence = excluded.evidence,
  quality_label = excluded.quality_label,
  quality_issues = excluded.quality_issues,
  lifecycle_evidence_date = excluded.lifecycle_evidence_date,
  last_verified_at = excluded.last_verified_at,
  next_review_at = excluded.next_review_at,
  freshness_status = excluded.freshness_status,
  updated_at = excluded.updated_at;

DROP TABLE _dex_gold_profiles_0077;
`;
}

function writeOutputs() {
  writeFileSync(
    fileURLToPath(new URL('../docs/dex-gold-profiles-2026-08-03.json', import.meta.url)),
    `${JSON.stringify(document, null, 2)}\n`,
  );
  writeFileSync(
    fileURLToPath(new URL('../migrations/0077_dex_gold_profiles.sql', import.meta.url)),
    renderMigration(),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) writeOutputs();

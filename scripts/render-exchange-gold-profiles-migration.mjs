import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const ACCESSED_AT = '2026-08-03T16:30:00Z';
const EVIDENCE_VERIFIED_AT = '2026-08-03T16:30:00Z';
const NEXT_REVIEW_AT = '2026-08-10T16:30:00Z';

function source(id, title, url, publisher, publishedAt, tier, role) {
  return {
    id,
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

function pendingClaim(id, fieldPath, sourceIds, evidenceLocator, note = null) {
  return {
    id,
    field_path: fieldPath,
    source_ids: sourceIds,
    evidence_locator: evidenceLocator,
    support_direction: 'supports',
    note,
    review: {
      state: 'pending',
      reviewer: null,
      reviewed_at: null,
    },
  };
}

function buildProfile(spec) {
  const sectionEntries = Object.entries(spec.sections);
  const sectionClaims = sectionEntries.map(([key, section]) => pendingClaim(
    `claim:${spec.slug}:section:${key}`,
    `analysis.sections.${key}.body`,
    section.source_ids,
    section.evidence_locator,
    section.note || null,
  ));
  const metrics = spec.metrics.map((metric) => ({
    id: `metric:${spec.slug}:${metric.key}:${metric.as_of}`,
    dimension: metric.dimension,
    label: metric.label,
    value: metric.value,
    unit: metric.unit,
    currency: metric.currency || null,
    window: metric.window,
    as_of: metric.as_of,
    method: metric.method,
    scope: metric.scope,
    formula: null,
    raw_input_ids: [],
    claim_ids: [`claim:${spec.slug}:metric:${metric.key}`],
    quality_flags: metric.quality_flags || [],
  }));
  const metricClaims = spec.metrics.map((metric) => pendingClaim(
    `claim:${spec.slug}:metric:${metric.key}`,
    `metrics[metric:${spec.slug}:${metric.key}:${metric.as_of}].value`,
    metric.source_ids,
    metric.evidence_locator,
    metric.note || null,
  ));
  const events = spec.events.map((event) => ({
    id: `event:${spec.slug}:${event.key}`,
    type: event.type,
    date: event.date,
    description: event.description,
    claim_ids: [`claim:${spec.slug}:event:${event.key}`],
  }));
  const eventClaims = spec.events.map((event) => pendingClaim(
    `claim:${spec.slug}:event:${event.key}`,
    `events[event:${spec.slug}:${event.key}]`,
    event.source_ids,
    event.evidence_locator,
    event.note || null,
  ));

  return {
    schema: 'chaindump-entity-profile',
    version: 1,
    identity: {
      id: `${spec.type}:${spec.slug}`,
      type: spec.type,
      slug: spec.slug,
      name: spec.name,
      aliases: spec.aliases,
    },
    classification: spec.classification,
    status: {
      operating_state: 'operating',
      as_of: '2026-08-03',
      claim_ids: [`claim:${spec.slug}:status`],
    },
    outcome: {
      label: 'successful_established',
      as_of: '2026-08-03',
      rule_id: 'exchange-lifecycle-v1',
      confidence: spec.outcome_confidence,
      claim_ids: [`claim:${spec.slug}:outcome`],
    },
    analysis: {
      sections: Object.fromEntries(sectionEntries.map(([key, section]) => [key, {
        body: section.body,
        as_of: '2026-08-03',
        claim_ids: [`claim:${spec.slug}:section:${key}`],
      }])),
    },
    metrics,
    events,
    sources: spec.sources,
    claims: [
      pendingClaim(
        `claim:${spec.slug}:status`,
        'status.operating_state',
        spec.status_source_ids,
        spec.status_evidence_locator,
      ),
      pendingClaim(
        `claim:${spec.slug}:outcome`,
        'outcome.label',
        spec.outcome_source_ids,
        spec.outcome_evidence_locator,
        'Outcome is an analyst classification bounded by the cited current observations and lifecycle evidence.',
      ),
      ...sectionClaims,
      ...metricClaims,
      ...eventClaims,
    ],
    freshness: {
      state: 'current',
      last_reviewed_at: EVIDENCE_VERIFIED_AT,
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
      legacy_origin: 'successful_exchanges',
      methodology_notes: [
        'freshness.last_reviewed_at records evidence assembly and source verification, not human approval; every claim remains pending until an editor reviews it.',
        ...spec.methodology_notes,
      ],
    },
  };
}

const uniswapSources = [
  source('source:uniswap:overview', 'Uniswap 101: What is Uniswap?', 'https://blog.uniswap.org/what-is-uniswap', 'Uniswap Labs', null, 'B', 'primary'),
  source('source:uniswap:v2-launch', 'Uniswap v2 Mainnet Launch', 'https://blog.uniswap.org/launch-uniswap-v2', 'Uniswap Labs', '2020-05-18', 'B', 'primary'),
  source('source:uniswap:uni', 'Introducing UNI', 'https://blog.uniswap.org/uni', 'Uniswap Labs', '2020-09-16', 'B', 'primary'),
  source('source:uniswap:v3-launch', 'Uniswap v3 Mainnet launch', 'https://blog.uniswap.org/launch-uniswap-v3', 'Uniswap Labs', '2021-05-05', 'B', 'primary'),
  source('source:uniswap:v4-design', 'Our Vision for Uniswap v4', 'https://blog.uniswap.org/uniswap-v4', 'Uniswap Labs', '2023-06-13', 'B', 'primary'),
  source('source:uniswap:v4-launch', 'Uniswap v4 is Here', 'https://blog.uniswap.org/uniswap-v4-is-here', 'Uniswap Labs', '2025-01-31', 'B', 'primary'),
  source('source:uniswap:unichain', 'Unichain Mainnet Is Here', 'https://blog.uniswap.org/unichain-mainnet-is-here', 'Uniswap Labs', '2025-02-11', 'B', 'primary'),
  source('source:uniswap:unification', 'UNIfication', 'https://blog.uniswap.org/unification', 'Uniswap Labs', '2025-11-10', 'B', 'primary'),
  source('source:uniswap:unification-governance', 'UNIfication proposal', 'https://gov.uniswap.org/t/unification-proposal/25881', 'Uniswap Governance', '2025-11-10', 'A', 'primary'),
  source('source:uniswap:fee-expansion', 'Protocol fee expansion: eight more chains and remaining mainnet v3 pools', 'https://gov.uniswap.org/t/temp-check-protocol-fee-expansion-eight-more-chains-and-remaining-mainnet-v3-pools/26035', 'Uniswap Governance', '2026-02-18', 'A', 'primary'),
  source('source:uniswap:v4-fees', 'Activate v4 protocol fees', 'https://gov.uniswap.org/t/temp-check-activate-v4-protocol-fees/26162/17', 'Uniswap Governance', '2026-07-18', 'A', 'primary'),
  source('source:uniswap:cftc', 'CFTC Orders Uniswap Labs to Pay $175,000 Civil Monetary Penalty', 'https://www.cftc.gov/PressRoom/PressReleases/8961-24', 'U.S. Commodity Futures Trading Commission', '2024-09-04', 'A', 'primary'),
  source('source:uniswap:sec-close', 'A Win for DeFi', 'https://blog.uniswap.org/a-win-for-defi', 'Uniswap Labs', '2025-02-25', 'B', 'primary'),
  source('source:uniswap:volume', 'Uniswap daily DEX volume API', 'https://api.llama.fi/summary/dexs/uniswap?dataType=dailyVolume', 'DefiLlama', null, 'B', 'independent'),
  source('source:uniswap:tvl', 'Uniswap protocol TVL API', 'https://api.llama.fi/protocol/uniswap', 'DefiLlama', null, 'B', 'independent'),
  source('source:uniswap:fees', 'Uniswap daily trading-fee API', 'https://api.llama.fi/summary/fees/uniswap?dataType=dailyFees', 'DefiLlama', null, 'B', 'independent'),
  source('source:uniswap:revenue', 'Uniswap daily protocol-revenue API', 'https://api.llama.fi/summary/fees/uniswap?dataType=dailyRevenue', 'DefiLlama', null, 'B', 'independent'),
  source('source:uniswap:token', 'Uniswap token market API', 'https://api.coingecko.com/api/v3/coins/uniswap', 'CoinGecko', null, 'B', 'independent'),
];

const uniswap = buildProfile({
  type: 'dex',
  slug: 'uniswap',
  name: 'Uniswap',
  aliases: ['Uniswap Protocol'],
  classification: {
    subtype: 'multi-chain spot automated market maker',
    tags: ['spot_amm', 'permissionless_liquidity', 'multi_chain', 'hooks'],
    chains: ['Ethereum', 'Unichain', 'Arbitrum', 'Base', 'Optimism', 'Polygon', 'BNB Chain', 'Avalanche', 'Celo', 'World Chain'],
    jurisdictions: [],
  },
  outcome_confidence: 'high',
  quality_confidence: 'high',
  sources: uniswapSources,
  status_source_ids: ['source:uniswap:volume', 'source:uniswap:tvl', 'source:uniswap:v4-fees'],
  status_evidence_locator: 'Current DefiLlama protocol observations and July 2026 governance activity.',
  outcome_source_ids: ['source:uniswap:overview', 'source:uniswap:volume', 'source:uniswap:tvl', 'source:uniswap:v4-launch'],
  outcome_evidence_locator: 'Protocol history, current TVL and trading-volume observations, and current product generation.',
  sections: {
    what_it_is: {
      body: 'Uniswap is a non-custodial spot exchange protocol. Traders swap against pools funded by independent liquidity providers instead of sending assets to an exchange account. The protocol now spans several contract generations: v2 uses a simple constant-product market maker, v3 lets liquidity providers choose price ranges, and v4 puts pools in one singleton contract and lets developers add custom hooks. Separate interfaces and routers help users reach those contracts, but the contracts can be used without the Uniswap web app.',
      source_ids: ['source:uniswap:overview', 'source:uniswap:v2-launch', 'source:uniswap:v3-launch', 'source:uniswap:v4-launch'],
      evidence_locator: 'Product overviews and launch descriptions for v2, v3 and v4.',
    },
    what_happened: {
      body: 'Uniswap launched before it had a token and became core Ethereum trading infrastructure. It expanded from the original Ethereum market maker into concentrated liquidity, multiple chains, a customizable v4 platform and the Unichain rollup. In the reviewed 2026-08-03 snapshot, DefiLlama reported about $1.03 billion of 24-hour DEX volume, $52.04 billion over 30 days and $3.06 billion of TVL. Governance also moved beyond a governance-only token story: the December 2025 UNIfication program activated protocol fees on eligible v2 and v3 pools and uses those fees to burn UNI. The reviewed record does not yet prove that protocol fees are active on every v4 deployment.',
      source_ids: ['source:uniswap:overview', 'source:uniswap:unichain', 'source:uniswap:fee-expansion', 'source:uniswap:v4-fees', 'source:uniswap:volume', 'source:uniswap:tvl'],
      evidence_locator: 'Protocol timeline, governance fee records and dated independent market snapshots.',
    },
    why_this_outcome: {
      body: 'Uniswap succeeded because the product found demand before token incentives became central. Permissionless pool creation made it easy for new assets and applications to integrate; a simple automated-market-maker design created a shared liquidity primitive; v3 improved capital efficiency for active liquidity providers; and deployments across popular chains followed users and liquidity. Each step reinforced distribution through wallets, aggregators and other applications. This is a causal interpretation, not proof that every design change increased value equally: current activity also depends on the wider chains, stablecoins and interfaces around the protocol.',
      source_ids: ['source:uniswap:v2-launch', 'source:uniswap:v3-launch', 'source:uniswap:v4-launch', 'source:uniswap:volume', 'source:uniswap:tvl'],
      evidence_locator: 'Shipped mechanisms and current independent usage observations.',
      note: 'Analyst inference bounded by cited mechanisms and current observations.',
    },
    strategic_choices: {
      body: 'The important choices were sequential. Uniswap first favored a small, permissionless and immutable pool design, which maximized composability but used capital inefficiently. V3 added concentrated liquidity, improving execution when liquidity is actively managed while making liquidity provision more complex. V4 turned the protocol into a customizable platform through a singleton and hooks, expanding what developers can build while moving more risk into hook-specific code and market design. Multi-chain deployment and Unichain widened distribution but fragmented liquidity and added rollup and bridge dependencies. UNI launched after product-market fit; the later fee-and-burn decision made value capture more explicit, but protocol fees can reduce what remains for liquidity providers and the rollout is not uniform across every version and chain.',
      source_ids: ['source:uniswap:v2-launch', 'source:uniswap:v3-launch', 'source:uniswap:v4-design', 'source:uniswap:unichain', 'source:uniswap:unification', 'source:uniswap:fee-expansion', 'source:uniswap:v4-fees'],
      evidence_locator: 'Version launches, Unichain launch and executed or pending governance records.',
      note: 'Consequences are analyst interpretation of cited protocol mechanisms.',
    },
    operating_model: {
      body: 'Liquidity providers deposit token pairs into smart-contract pools and earn the portion of trading fees assigned to them. Traders retain wallet custody until a transaction executes against a pool. Routers can split a trade across pools and versions, while interfaces, wallets and aggregators provide discovery and transaction construction. Uniswap Labs develops products and interfaces; governance controls eligible protocol parameters, treasury decisions and fee settings, but it does not hold customer deposits or operate an off-chain order ledger. V4 hooks can change pool behavior, so a v4 pool must be evaluated together with its hook rather than treated as identical to every other pool.',
      source_ids: ['source:uniswap:overview', 'source:uniswap:v2-launch', 'source:uniswap:v3-launch', 'source:uniswap:v4-design'],
      evidence_locator: 'Protocol operating descriptions and version architecture.',
    },
    token_and_value_capture: {
      body: 'UNI launched on 2020-09-16 as the protocol governance token, with 60 percent of the genesis supply allocated to the community and 15 percent immediately claimable by historical users and liquidity providers. For most of its life, UNI did not give holders a direct claim on trading fees. The UNIfication program changed the mechanism for eligible pools: protocol fees from activated v2 and v3 deployments fund UNI burns, while governance also approved a two-year growth budget. DefiLlama reported about $4.27 million of 30-day protocol revenue in the reviewed snapshot, separate from about $96.33 million of total 30-day trading fees. A burn is not a cash distribution or equity claim, and the reviewed evidence leaves complete v4 fee activation unresolved.',
      source_ids: ['source:uniswap:uni', 'source:uniswap:unification-governance', 'source:uniswap:fee-expansion', 'source:uniswap:v4-fees', 'source:uniswap:fees', 'source:uniswap:revenue'],
      evidence_locator: 'UNI genesis allocation, governance fee changes and separate fee/revenue observations.',
    },
    counterfactual: {
      body: 'A single-chain, single-version Uniswap would be easier to understand and would concentrate liquidity, but it would give up users and integrations on other chains and much of the customization introduced by v4. Turning on protocol fees much earlier might have created earlier UNI value capture, yet it could also have weakened liquidity-provider economics before the protocol had durable distribution. The reviewed evidence cannot quantify either alternative, so these are decision trade-offs rather than back-tested claims.',
      source_ids: ['source:uniswap:v3-launch', 'source:uniswap:v4-design', 'source:uniswap:unichain', 'source:uniswap:fee-expansion'],
      evidence_locator: 'Observed version and distribution choices used to bound the counterfactual.',
      note: 'Counterfactual; no causal estimate is available.',
    },
    risks_and_unknowns: {
      body: 'The main economic risk is that protocol fees or fragmented liquidity make a pool less competitive for liquidity providers and traders. V4 creates a second risk boundary because a hook can add behavior and vulnerabilities that are not part of the audited core. Multi-chain use adds rollup, bridge, governance and deployment differences; adverse selection and MEV can still reduce liquidity-provider returns. Front-end and regulatory access are separate from whether the contracts keep running: the CFTC order in 2024 concerned leveraged or margined retail commodity transactions offered through the Labs interface, and Uniswap Labs said in February 2025 that the SEC closed its investigation without enforcement. Unknowns include full v4 fee activation, the durable economics of Unichain, version-by-version liquidity concentration and the net effect of burns after incentives and treasury spending.',
      source_ids: ['source:uniswap:v4-launch', 'source:uniswap:unichain', 'source:uniswap:v4-fees', 'source:uniswap:cftc', 'source:uniswap:sec-close'],
      evidence_locator: 'Security design, chain expansion, governance state and regulator/company records.',
    },
    lifecycle: {
      body: 'Uniswap v1 launched in November 2018 as an automated-market-maker proof of concept. V2 launched on 2020-05-18, UNI on 2020-09-16 and v3 on 2021-05-05. The CFTC entered its limited interface-related order on 2024-09-04. V4 launched on 2025-01-31 and Unichain followed on 2025-02-11. Uniswap Labs said the SEC investigation closed on 2025-02-25. Governance then approved the UNIfication changes in December 2025 and continued protocol-fee expansion work through 2026. The protocol remains operating with material current activity; the lifecycle call is successful and established, not finished or risk-free.',
      source_ids: ['source:uniswap:overview', 'source:uniswap:v2-launch', 'source:uniswap:uni', 'source:uniswap:v3-launch', 'source:uniswap:v4-launch', 'source:uniswap:unichain', 'source:uniswap:cftc', 'source:uniswap:sec-close', 'source:uniswap:fee-expansion'],
      evidence_locator: 'Dated launch, regulatory and governance records.',
    },
    outlook_and_watch: {
      body: 'The base case is that Uniswap remains a leading spot-liquidity network while activity stays split across versions and chains. The upside case requires v4 hooks and Unichain to attract durable new order flow without weakening liquidity quality, and fee-funded burns to grow after accounting for incentives and treasury spending. The downside case is gradual share loss if liquidity providers earn better risk-adjusted returns elsewhere or if fragmentation, hook failures or access restrictions damage trust. Watch 30-day volume, TVL, total trading fees versus protocol revenue, UNI burned versus budgeted emissions, liquidity retained after fee changes, v4 protocol-fee execution and the share of activity concentrated on Unichain or a small number of hooks.',
      source_ids: ['source:uniswap:volume', 'source:uniswap:tvl', 'source:uniswap:fees', 'source:uniswap:revenue', 'source:uniswap:fee-expansion', 'source:uniswap:v4-fees', 'source:uniswap:unichain'],
      evidence_locator: 'Current metrics plus governance and product milestones that define the forward watch list.',
      note: 'Scenario analysis, not a price forecast.',
    },
  },
  metrics: [
    { key: 'spot-volume-24h', dimension: 'spot_volume', label: 'DEX volume, rolling 24 hours', value: 1033681270, unit: 'usd', currency: 'USD', as_of: '2026-08-03T16:18:00Z', window: { start: null, end: '2026-08-03T16:18:00Z', definition: 'rolling_24h' }, method: 'DefiLlama protocol aggregate', scope: { product: 'Uniswap spot AMM', chains: [] }, source_ids: ['source:uniswap:volume'], evidence_locator: 'total24h field in the retrieved dailyVolume response.' },
    { key: 'spot-volume-30d', dimension: 'spot_volume', label: 'DEX volume, rolling 30 days', value: 52042388759.16, unit: 'usd', currency: 'USD', as_of: '2026-08-03T16:18:00Z', window: { start: null, end: '2026-08-03T16:18:00Z', definition: 'rolling_30d' }, method: 'DefiLlama protocol aggregate', scope: { product: 'Uniswap spot AMM', chains: [] }, source_ids: ['source:uniswap:volume'], evidence_locator: 'total30d field in the retrieved dailyVolume response.' },
    { key: 'tvl', dimension: 'tvl', label: 'Protocol TVL', value: 3059619526, unit: 'usd', currency: 'USD', as_of: '2026-08-03T13:45:59Z', window: { start: null, end: '2026-08-03T13:45:59Z', definition: 'point_in_time' }, method: 'DefiLlama protocol TVL aggregate', scope: { product: 'Uniswap', chains: [] }, source_ids: ['source:uniswap:tvl'], evidence_locator: 'Latest protocol TVL observation at epoch 1785764759.' },
    { key: 'fees-30d', dimension: 'fees', label: 'Trading fees, rolling 30 days', value: 96334538.85, unit: 'usd', currency: 'USD', as_of: '2026-08-03T16:18:00Z', window: { start: null, end: '2026-08-03T16:18:00Z', definition: 'rolling_30d' }, method: 'DefiLlama dailyFees aggregate', scope: { product: 'Uniswap pools', chains: [] }, source_ids: ['source:uniswap:fees'], evidence_locator: 'total30d field in the retrieved dailyFees response.', note: 'Total trading fees are not equivalent to protocol revenue.' },
    { key: 'revenue-30d', dimension: 'protocol_revenue', label: 'Protocol revenue, rolling 30 days', value: 4269276, unit: 'usd', currency: 'USD', as_of: '2026-08-03T16:18:00Z', window: { start: null, end: '2026-08-03T16:18:00Z', definition: 'rolling_30d' }, method: 'DefiLlama dailyRevenue aggregate', scope: { product: 'Uniswap fee switch', chains: [] }, source_ids: ['source:uniswap:revenue'], evidence_locator: 'total30d field in the retrieved dailyRevenue response.' },
    { key: 'token-price', dimension: 'token_price', label: 'UNI price', value: 3.9, unit: 'usd_per_token', currency: 'USD', as_of: '2026-08-03T16:18:50.921Z', window: { start: null, end: '2026-08-03T16:18:50.921Z', definition: 'point_in_time' }, method: 'CoinGecko market snapshot', scope: { product: 'UNI', chains: ['Ethereum'] }, source_ids: ['source:uniswap:token'], evidence_locator: 'market_data.current_price.usd.' },
    { key: 'token-market-cap', dimension: 'token_market_cap', label: 'UNI market capitalization', value: 2438837687, unit: 'usd', currency: 'USD', as_of: '2026-08-03T16:18:50.921Z', window: { start: null, end: '2026-08-03T16:18:50.921Z', definition: 'point_in_time' }, method: 'CoinGecko market snapshot', scope: { product: 'UNI', chains: ['Ethereum'] }, source_ids: ['source:uniswap:token'], evidence_locator: 'market_data.market_cap.usd.' },
    { key: 'token-fdv', dimension: 'token_fdv', label: 'UNI fully diluted valuation', value: 3481979919, unit: 'usd', currency: 'USD', as_of: '2026-08-03T16:18:50.921Z', window: { start: null, end: '2026-08-03T16:18:50.921Z', definition: 'point_in_time' }, method: 'CoinGecko market snapshot', scope: { product: 'UNI', chains: ['Ethereum'] }, source_ids: ['source:uniswap:token'], evidence_locator: 'market_data.fully_diluted_valuation.usd.' },
  ],
  events: [
    { key: 'v2-launch', type: 'product_launch', date: '2020-05-18', description: 'Uniswap v2 deployed to Ethereum mainnet.', source_ids: ['source:uniswap:v2-launch'], evidence_locator: 'Launch announcement date and deployment statement.' },
    { key: 'uni-launch', type: 'token_launch', date: '2020-09-16', description: 'UNI launched as the Uniswap governance token.', source_ids: ['source:uniswap:uni'], evidence_locator: 'Introducing UNI publication date and distribution announcement.' },
    { key: 'v3-launch', type: 'product_launch', date: '2021-05-05', description: 'Uniswap v3 launched on Ethereum with concentrated liquidity.', source_ids: ['source:uniswap:v3-launch'], evidence_locator: 'V3 mainnet launch announcement.' },
    { key: 'cftc-order', type: 'regulatory_action', date: '2024-09-04', description: 'The CFTC entered an order concerning leveraged or margined retail commodity transactions offered through Uniswap Labs.', source_ids: ['source:uniswap:cftc'], evidence_locator: 'CFTC order summary and press release date.' },
    { key: 'v4-launch', type: 'product_launch', date: '2025-01-31', description: 'Uniswap v4 launched across ten chains with singleton and hook architecture.', source_ids: ['source:uniswap:v4-launch'], evidence_locator: 'V4 launch announcement.' },
    { key: 'unichain-launch', type: 'network_launch', date: '2025-02-11', description: 'Unichain mainnet launched as a DeFi-focused rollup.', source_ids: ['source:uniswap:unichain'], evidence_locator: 'Unichain mainnet launch announcement.' },
    { key: 'sec-close', type: 'regulatory_update', date: '2025-02-25', description: 'Uniswap Labs stated that the SEC closed its investigation without enforcement action.', source_ids: ['source:uniswap:sec-close'], evidence_locator: 'Company statement; no separate SEC closing release was identified in the reviewed evidence.', note: 'Company-reported regulatory outcome.' },
  ],
  unsourced_fields: ['Complete version-by-version liquidity-provider profitability', 'Complete v4 protocol-fee activation by deployment', 'Unichain standalone profitability'],
  methodology_notes: [
    'Trading fees and protocol revenue are separate metrics and must not be combined.',
    'Current values are dated API observations, not timeless protocol attributes.',
    'Causal and counterfactual sections distinguish observed mechanisms from analyst interpretation.',
  ],
});

const binanceSources = [
  source('source:binance:report-2025', 'Binance 2025 End-of-Year Report', 'https://public.bnbstatic.com/reports/2025_EOY_Report.pdf', 'Binance', '2026-01-08', 'B', 'primary'),
  source('source:binance:por', 'Proof of Reserves', 'https://www.binance.com/en/proof-of-reserves', 'Binance', null, 'B', 'primary'),
  source('source:binance:bnb', 'What Is BNB?', 'https://academy.binance.com/en/articles/what-is-bnb', 'Binance Academy', null, 'B', 'primary'),
  source('source:binance:doj', 'United States v. Binance Holdings Limited', 'https://www.justice.gov/criminal/case/united-states-v-binance-holdings-limited-dba-binancecom', 'U.S. Department of Justice', '2023-11-21', 'A', 'primary'),
  source('source:binance:treasury', 'Binance Holdings Ltd. and CEO Plead Guilty and Agree to Pay Over $4 Billion', 'https://home.treasury.gov/news/press-releases/jy1925', 'U.S. Department of the Treasury', '2023-11-21', 'A', 'primary'),
  source('source:binance:fincen-order', 'FinCEN Consent Order 2023-04', 'https://www.fincen.gov/system/files/enforcement_action/2023-11-21/FinCEN_Consent_Order_2023-04_FINAL508.pdf', 'Financial Crimes Enforcement Network', '2023-11-21', 'A', 'primary'),
  source('source:binance:cftc', 'Federal Court Enters Order Against Binance and Former CEO', 'https://www.cftc.gov/PressRoom/PressReleases/8837-23', 'U.S. Commodity Futures Trading Commission', '2023-12-18', 'A', 'primary'),
  source('source:binance:sec-dismissal', 'SEC v. Binance Holdings Limited dismissal', 'https://www.sec.gov/enforcement-litigation/litigation-releases/lr-26316', 'U.S. Securities and Exchange Commission', '2025-05-29', 'A', 'primary'),
  source('source:binance:vara', 'Binance FZE public register entry', 'https://www.vara.ae/en/licenses-and-register/public-register/binance-fze/', 'Dubai Virtual Assets Regulatory Authority', '2024-04-15', 'A', 'primary'),
  source('source:binance:adgm-announcement', 'Binance secures global operations license under ADGM framework', 'https://www.adgm.com/media/announcements/binance-becomes-first-crypto-exchange-to-secure-a-global-license-under-adgm-framework-setting-a-new-standard-in-digital-asset-regulation', 'Binance', '2025-12-08', 'B', 'primary'),
  source('source:binance:adgm', 'ADGM celebrates a decade of operations', 'https://www.adgm.com/media/announcements/adgm-celebrates-decade-of-operations-with-36-surge-in-aum-51-increase-in-workforce-and-over-12000-licences-in-2025', 'Abu Dhabi Global Market', '2026-01-28', 'A', 'primary'),
  source('source:binance:wallet-assets', 'Binance CEX wallet-balance API', 'https://api.llama.fi/protocol/binance-cex', 'DefiLlama', null, 'B', 'independent'),
  source('source:binance:exchange-market', 'Binance exchange market API', 'https://api.coingecko.com/api/v3/exchanges/binance', 'CoinGecko', null, 'B', 'independent'),
  source('source:binance:bnb-market', 'BNB market API', 'https://api.coingecko.com/api/v3/coins/binancecoin', 'CoinGecko', null, 'B', 'independent'),
];

const binance = buildProfile({
  type: 'cex',
  slug: 'binance',
  name: 'Binance',
  aliases: ['Binance.com'],
  classification: {
    subtype: 'custodial multi-product crypto exchange',
    tags: ['custodial', 'spot', 'derivatives', 'global_distribution', 'venue_token'],
    chains: ['BNB Chain'],
    jurisdictions: ['Abu Dhabi Global Market', 'Dubai'],
  },
  outcome_confidence: 'medium',
  quality_confidence: 'medium',
  sources: binanceSources,
  status_source_ids: ['source:binance:adgm', 'source:binance:vara', 'source:binance:exchange-market', 'source:binance:wallet-assets'],
  status_evidence_locator: 'Active regulator entries and dated independent market and wallet observations.',
  outcome_source_ids: ['source:binance:report-2025', 'source:binance:exchange-market', 'source:binance:wallet-assets', 'source:binance:doj'],
  outcome_evidence_locator: 'Operator scale report, current independent observations and major adverse lifecycle event.',
  sections: {
    what_it_is: {
      body: 'Binance is a custodial crypto exchange and product platform. Customers deposit assets into exchange-controlled wallets, trade on an off-chain ledger and ask the exchange to process withdrawals. The platform spans spot and derivatives trading plus earn, payments, institutional and discovery products, although availability depends on the legal entity and customer jurisdiction. Binance is connected to, but not the same thing as, BNB Chain: the exchange is a managed financial service, while the chain is public infrastructure with separate network participants.',
      source_ids: ['source:binance:report-2025', 'source:binance:por', 'source:binance:adgm', 'source:binance:vara'],
      evidence_locator: 'Operator product report, custody verification page and regulated-entity records.',
    },
    what_happened: {
      body: 'Binance scaled from a 2017 exchange into a global multi-product venue by combining broad market coverage, deep liquidity, a large retail funnel and the BNB ecosystem. Binance reported 300 million registered users and $34 trillion of all-product trading volume for calendar 2025, including more than $7.1 trillion of spot volume; those are operator figures, not audited financial statements. The defining adverse event was 2023: Binance pleaded guilty in the United States to Bank Secrecy Act, money-transmitter and sanctions-related offenses, agreed to more than $4 billion in coordinated resolutions, accepted monitorship and a U.S. exit for Binance.com, and founder Changpeng Zhao resigned as chief executive. The business continued operating and later added active VARA authorization in Dubai and a formal ADGM framework in Abu Dhabi.',
      source_ids: ['source:binance:report-2025', 'source:binance:doj', 'source:binance:treasury', 'source:binance:vara', 'source:binance:adgm'],
      evidence_locator: 'Operator annual report, U.S. resolutions and current regulator records.',
    },
    why_this_outcome: {
      body: 'Binance succeeded commercially because distribution and liquidity reinforced each other. More customers and listed markets attracted more order flow; more order flow improved execution and supported a wider product set; BNB discounts and chain utility kept users inside a connected ecosystem. The same growth model created a major failure mode. U.S. authorities found that Binance prioritized market access while failing to build required anti-money-laundering, money-transmitter and sanctions controls. The evidence therefore supports a mixed causal reading: aggressive global expansion helped create the liquidity network effect and also directly produced the 2023 criminal and regulatory consequences. Current scale does not by itself prove profitability, solvency or complete compliance.',
      source_ids: ['source:binance:report-2025', 'source:binance:bnb', 'source:binance:doj', 'source:binance:treasury', 'source:binance:cftc'],
      evidence_locator: 'Scale and ecosystem mechanisms read together with government findings.',
      note: 'Analyst inference bounded by cited operator mechanisms and government findings.',
    },
    strategic_choices: {
      body: 'Binance chose a broad global exchange rather than a narrow licensed-market footprint, then added spot, derivatives, earn and other products behind one account. That created cross-product retention and deep liquidity but multiplied custody, conduct and licensing risk. It launched BNB alongside the exchange and expanded BNB into fee discounts, network gas, staking and ecosystem programs, strengthening retention while coupling exchange reputation to a large token-and-chain economy. Before 2023, management failed to give U.S. anti-money-laundering and sanctions obligations priority; the guilty plea and settlements are direct evidence of the cost. Afterward, Binance chose monitorship, compliance remediation and formal licensing in jurisdictions including Dubai and Abu Dhabi. Proof of reserves improved customer-level verification, but the chosen method still stops short of audited consolidated financial statements and complete liability verification.',
      source_ids: ['source:binance:report-2025', 'source:binance:bnb', 'source:binance:doj', 'source:binance:treasury', 'source:binance:fincen-order', 'source:binance:vara', 'source:binance:adgm', 'source:binance:por'],
      evidence_locator: 'Product, token, enforcement, licensing and reserve-verification records.',
      note: 'Strategic consequences combine direct findings with analyst interpretation.',
    },
    operating_model: {
      body: 'Binance controls customer deposit addresses and records most trades on an internal ledger rather than settling each order on a public chain. Its matching engine pairs buyers and sellers, and the exchange manages listing, margin, liquidation, custody and withdrawal systems. Revenue is expected to depend heavily on trading and product fees, but the private group does not publish audited consolidated revenue or profit in the reviewed evidence. Different regulated entities can offer different products: the VARA and ADGM records define authorized activities and conditions for specific legal entities, so a license should not be generalized to every Binance service or country.',
      source_ids: ['source:binance:report-2025', 'source:binance:por', 'source:binance:vara', 'source:binance:adgm'],
      evidence_locator: 'Operator product and custody descriptions plus entity-specific regulator records.',
    },
    token_and_value_capture: {
      body: 'BNB began as an exchange utility token and now spans several roles. Binance describes trading-fee discounts and product access on the exchange, while BNB Chain uses BNB for gas, staking and governance. A quarterly Auto-Burn uses BNB price and BNB Smart Chain block production to reduce supply toward a stated 100 million target. That mechanism can reduce token supply, but BNB is not equity in Binance, does not give a legal claim on exchange profits and is not a claim on customer assets. The product and token launched near each other, so the evidence does not isolate how much of Binance success came from BNB versus market timing, listings, liquidity, jurisdictional reach or execution quality.',
      source_ids: ['source:binance:bnb', 'source:binance:bnb-market', 'source:binance:report-2025'],
      evidence_locator: 'Current BNB utility and burn description plus dated market observation.',
    },
    counterfactual: {
      body: 'A licensed-first strategy limited to fewer jurisdictions would likely have reduced the compliance surface and the probability of the 2023 U.S. outcome, but it would also have slowed the global liquidity flywheel that distinguished Binance. Publishing independently audited consolidated financial statements and full entity-level liabilities would make solvency and profitability easier to assess, but the reviewed evidence does not show that Binance has adopted that standard. These alternatives are directionally plausible; the available evidence does not quantify the forgone growth or risk reduction.',
      source_ids: ['source:binance:doj', 'source:binance:treasury', 'source:binance:fincen-order', 'source:binance:por', 'source:binance:adgm', 'source:binance:vara'],
      evidence_locator: 'Observed enforcement, licensing and verification choices used to bound alternatives.',
      note: 'Counterfactual; no causal estimate is available.',
    },
    risks_and_unknowns: {
      body: 'Customers bear custody and withdrawal risk because Binance controls the wallets and internal ledger. Proof of reserves can help a customer verify inclusion in a snapshot and can show selected on-chain assets, but it is not an audit of the entire corporate group, every liability, capital adequacy or profitability. Regulatory obligations remain material: the 2023 resolutions imposed remediation and monitoring, Binance.com exited the United States, and product access remains jurisdiction-specific. Other risks include BNB ecosystem concentration, market-integrity and liquidation failures, cyber or operational outages and legal-entity complexity. Unknowns include audited consolidated assets, liabilities, revenue and profit; complete affiliated-party exposure; the exact share of volume by jurisdiction; and whether all material liabilities are covered by the published reserve process.',
      source_ids: ['source:binance:por', 'source:binance:wallet-assets', 'source:binance:doj', 'source:binance:treasury', 'source:binance:fincen-order', 'source:binance:cftc', 'source:binance:vara', 'source:binance:adgm'],
      evidence_locator: 'Custody method, tracked wallet observation, settlement duties and entity-specific licenses.',
    },
    lifecycle: {
      body: 'Binance launched in 2017 and grew into a leading global exchange. On 2023-11-21 the company pleaded guilty and entered coordinated Justice Department and Treasury resolutions; Changpeng Zhao resigned and Binance accepted compliance remediation and monitoring. A federal court entered the CFTC order on 2023-12-18. Binance FZE received its Dubai VARA license on 2024-04-15. On 2025-05-29 the SEC voluntarily dismissed its civil case with prejudice, stating that the decision reflected policy and discretion and did not necessarily state its position in other cases. ADGM reported a formal global framework in December 2025. Binance remains operating as of 2026-08-03, but the lifecycle includes both durable scale and a proven compliance failure.',
      source_ids: ['source:binance:doj', 'source:binance:treasury', 'source:binance:cftc', 'source:binance:vara', 'source:binance:sec-dismissal', 'source:binance:adgm', 'source:binance:exchange-market'],
      evidence_locator: 'Dated enforcement, dismissal, licensing and current market records.',
    },
    outlook_and_watch: {
      body: 'The base case is that Binance remains a large global venue while moving more activity into explicitly licensed entities and continuing post-2023 remediation. The upside case requires independently visible liquidity, reliable withdrawals, successful completion of monitor obligations and broader regulated access without losing product depth. The downside case is renewed enforcement, a custody or withdrawal failure, or fragmentation that weakens its liquidity advantage. Watch regulator-register status, monitor and remediation disclosures, jurisdiction-by-jurisdiction product availability, independent spot and derivatives liquidity, on-chain wallet balances alongside disclosed liabilities, withdrawal performance, BNB utility and burn changes, and any audited financial disclosure. Operator-reported user and volume records should remain labeled and never substitute for solvency evidence.',
      source_ids: ['source:binance:report-2025', 'source:binance:doj', 'source:binance:treasury', 'source:binance:vara', 'source:binance:adgm', 'source:binance:wallet-assets', 'source:binance:exchange-market', 'source:binance:por'],
      evidence_locator: 'Current scale claims, regulatory obligations, active licenses and independent market observations.',
      note: 'Scenario analysis, not a token or equity price forecast.',
    },
  },
  metrics: [
    { key: 'spot-volume-24h-btc', dimension: 'spot_volume', label: 'Exchange volume, rolling 24 hours', value: 85207.73532555325, unit: 'btc_equivalent', currency: 'BTC', as_of: '2026-08-03T16:19:00Z', window: { start: null, end: '2026-08-03T16:19:00Z', definition: 'rolling_24h' }, method: 'CoinGecko exchange aggregate', scope: { product: 'Binance exchange markets', chains: [] }, source_ids: ['source:binance:exchange-market'], evidence_locator: 'trade_volume_24h_btc field in the retrieved exchange response.', quality_flags: ['independent_aggregator', 'not_audited'] },
    { key: 'tracked-wallet-assets', dimension: 'customer_assets', label: 'DefiLlama-tracked on-chain exchange wallet balances', value: 136796062343, unit: 'usd', currency: 'USD', as_of: '2026-08-03T13:38:47Z', window: { start: null, end: '2026-08-03T13:38:47Z', definition: 'point_in_time' }, method: 'DefiLlama tracked CEX wallets', scope: { product: 'Binance CEX wallets', chains: [] }, source_ids: ['source:binance:wallet-assets'], evidence_locator: 'Latest protocol TVL observation at epoch 1785764327.', note: 'Tracked on-chain wallet balances are not audited reserves and do not establish liabilities or solvency.', quality_flags: ['partial_wallet_coverage', 'not_liability_matched'] },
    { key: 'token-price', dimension: 'token_price', label: 'BNB price', value: 592.43, unit: 'usd_per_token', currency: 'USD', as_of: '2026-08-03T16:19:34.295Z', window: { start: null, end: '2026-08-03T16:19:34.295Z', definition: 'point_in_time' }, method: 'CoinGecko market snapshot', scope: { product: 'BNB', chains: ['BNB Chain'] }, source_ids: ['source:binance:bnb-market'], evidence_locator: 'market_data.current_price.usd.' },
    { key: 'token-market-cap', dimension: 'token_market_cap', label: 'BNB market capitalization', value: 78902711513, unit: 'usd', currency: 'USD', as_of: '2026-08-03T16:19:34.295Z', window: { start: null, end: '2026-08-03T16:19:34.295Z', definition: 'point_in_time' }, method: 'CoinGecko market snapshot', scope: { product: 'BNB', chains: ['BNB Chain'] }, source_ids: ['source:binance:bnb-market'], evidence_locator: 'market_data.market_cap.usd.' },
    { key: 'token-fdv', dimension: 'token_fdv', label: 'BNB fully diluted valuation', value: 78902712443, unit: 'usd', currency: 'USD', as_of: '2026-08-03T16:19:34.295Z', window: { start: null, end: '2026-08-03T16:19:34.295Z', definition: 'point_in_time' }, method: 'CoinGecko market snapshot', scope: { product: 'BNB', chains: ['BNB Chain'] }, source_ids: ['source:binance:bnb-market'], evidence_locator: 'market_data.fully_diluted_valuation.usd.' },
  ],
  events: [
    { key: 'us-plea', type: 'criminal_and_regulatory_resolution', date: '2023-11-21', description: 'Binance pleaded guilty and entered coordinated U.S. Justice Department and Treasury resolutions exceeding $4 billion.', source_ids: ['source:binance:doj', 'source:binance:treasury', 'source:binance:fincen-order'], evidence_locator: 'Plea, coordinated settlement terms, leadership change and compliance obligations.' },
    { key: 'cftc-order', type: 'regulatory_order', date: '2023-12-18', description: 'A federal court entered the CFTC order against Binance and Changpeng Zhao.', source_ids: ['source:binance:cftc'], evidence_locator: 'CFTC court-order release and monetary terms.' },
    { key: 'vara-license', type: 'license', date: '2024-04-15', description: 'Dubai VARA issued the Binance FZE VASP license listed as active in the reviewed register.', source_ids: ['source:binance:vara'], evidence_locator: 'VARA public-register issue date, status and authorized activities.' },
    { key: 'sec-dismissal', type: 'regulatory_update', date: '2025-05-29', description: 'The SEC civil case against Binance was dismissed with prejudice on a joint stipulation.', source_ids: ['source:binance:sec-dismissal'], evidence_locator: 'SEC litigation release; dismissal described as policy and discretion, not a general merits finding.' },
    { key: 'adgm-framework', type: 'license', date: '2025-12-08', description: 'Binance announced authorization under an ADGM framework; ADGM later confirmed the formal global license in its 2025 operations review.', source_ids: ['source:binance:adgm-announcement', 'source:binance:adgm'], evidence_locator: 'Dated Binance announcement hosted and disclaimed by ADGM, plus the later official ADGM review confirming the December license milestone.', note: 'The dated launch announcement is operator-authored; the later ADGM statement independently confirms the month and license.' },
  ],
  unsourced_fields: ['Audited consolidated assets and liabilities', 'Audited consolidated revenue and profitability', 'Complete affiliate and internal trading exposure', 'Complete proof-of-reserves liability and entity coverage'],
  methodology_notes: [
    'Operator-reported annual volume and registered users are labeled and are not treated as audited financial metrics.',
    'Tracked on-chain wallet balances are not proof of complete reserves or liabilities.',
    'Coordinated U.S. settlement amounts overlap; they are not summed again as separate independent penalties.',
    'A license or dismissal is scoped to the named entity and proceeding, not generalized to every Binance market.',
  ],
});

export const document = {
  schema: 'chaindump-exchange-gold-profiles-v1',
  as_of: '2026-08-03',
  generated_migration: '0068_exchange_gold_profiles.sql',
  cases: [
    {
      type: 'dex',
      slug: 'uniswap',
      legacy: {
        metric_label: '24h spot volume',
        metric_type: 'spot_volume_24h',
        metric_unit: 'USD',
        metric: 1033681270,
        why_successful: 'Uniswap found product-market fit before launching UNI, then compounded permissionless liquidity, integrations, capital efficiency and multi-chain distribution. Its 2026 fee-and-burn model adds value capture, but liquidity-provider economics and cross-chain fragmentation remain open tests.',
        outlook: 'Base case: Uniswap remains a leading spot-liquidity network across versions and chains. Watch rolling volume, TVL, trading fees versus protocol revenue, liquidity retention after fee changes, v4 fee activation, hook risk and Unichain concentration.',
        operating_model: 'Non-custodial multi-chain spot AMM spanning v2 constant-product pools, v3 concentrated liquidity and v4 singleton pools with optional hooks.',
        synthesis: 'A successful protocol-first exchange whose distribution and composability preceded token incentives; durable value capture is newer and still being tested.',
      },
      canonical_profile: uniswap,
    },
    {
      type: 'cex',
      slug: 'binance',
      legacy: {
        metric_label: '2025 all-product trading volume (operator-reported)',
        metric_type: 'all_product_trading_volume_annual',
        metric_unit: 'USD',
        metric: 34000000000000,
        why_successful: 'Binance built a global liquidity and distribution flywheel across spot, derivatives and connected products, reinforced by BNB utility. The same growth-over-compliance choice directly produced the 2023 guilty plea, settlements, monitorship and leadership change.',
        outlook: 'Base case: Binance remains a large global venue while shifting activity into licensed entities and completing remediation. Watch regulator status, monitorship, independent liquidity, withdrawals, assets versus disclosed liabilities, BNB utility and audited financial disclosure.',
        operating_model: 'Custodial multi-product exchange using exchange-controlled wallets, internal ledgers and off-chain order matching through jurisdiction-specific legal entities.',
        synthesis: 'A commercially successful exchange with proven distribution and liquidity advantages, a proven historic compliance failure and material unresolved financial-transparency questions.',
      },
      canonical_profile: binance,
    },
  ],
};

export function renderMigration(value = document) {
  const payload = JSON.stringify(value, null, 2).replaceAll("'", "''");
  return `-- Two source-linked exchange profiles, researched 2026-08-03 and awaiting human review.
-- The canonical JSON document is embedded so clean-database replay is deterministic.
-- Existing legacy profile fields are preserved; canonical consumers use canonical_profile.

DROP TABLE IF EXISTS _exchange_gold_profiles_0068;

CREATE TABLE _exchange_gold_profiles_0068 (
  type TEXT NOT NULL,
  slug TEXT NOT NULL,
  legacy TEXT NOT NULL CHECK (json_valid(legacy)),
  canonical_profile TEXT NOT NULL CHECK (json_valid(canonical_profile)),
  PRIMARY KEY (type, slug)
);

-- canonical-payload-start
WITH research_document(payload) AS (
  VALUES ('${payload}')
)
INSERT INTO _exchange_gold_profiles_0068 (type, slug, legacy, canonical_profile)
SELECT
  json_extract(entry.value, '$.type'),
  json_extract(entry.value, '$.slug'),
  json_extract(entry.value, '$.legacy'),
  json_extract(entry.value, '$.canonical_profile')
FROM research_document, json_each(json_extract(payload, '$.cases')) AS entry;
-- canonical-payload-end

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
  updated_at = '2026-08-03'
FROM _exchange_gold_profiles_0068 AS staged
WHERE exchange_row.type = staged.type AND exchange_row.slug = staged.slug;

UPDATE exchange_case_features AS features
SET
  metric_type = CASE WHEN features.slug = 'uniswap' THEN 'spot_volume_24h' ELSE features.metric_type END,
  metric_unit = CASE WHEN features.slug = 'uniswap' THEN 'usd' ELSE features.metric_unit END,
  metric_window = CASE WHEN features.slug = 'uniswap' THEN 'rolling_24h' ELSE features.metric_window END,
  metric_as_of = CASE WHEN features.slug = 'uniswap' THEN '2026-08-03' ELSE features.metric_as_of END,
  metric_observed_at = CASE WHEN features.slug = 'uniswap' THEN '2026-08-03T16:18:00Z' ELSE features.metric_observed_at END,
  comparability_key = CASE WHEN features.slug = 'uniswap' THEN 'dex|spot_amm_multichain|spot_volume_24h|usd|rolling_24h' ELSE features.comparability_key END,
  last_verified_at = '2026-08-03',
  next_review_at = '2026-08-10',
  freshness_status = 'current',
  updated_at = '2026-08-03'
WHERE features.lifecycle = 'successful'
  AND EXISTS (
    SELECT 1 FROM _exchange_gold_profiles_0068 AS staged
    WHERE staged.type = features.kind AND staged.slug = features.slug
  );

DROP TABLE _exchange_gold_profiles_0068;
`;
}

function writeOutputs() {
  const documentPath = fileURLToPath(new URL('../docs/exchange-gold-profiles-2026-08-03.json', import.meta.url));
  const migrationPath = fileURLToPath(new URL('../migrations/0068_exchange_gold_profiles.sql', import.meta.url));
  writeFileSync(documentPath, `${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(migrationPath, renderMigration());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) writeOutputs();

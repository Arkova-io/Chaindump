import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const ACCESSED_AT = '2026-08-03T16:44:19Z';
const EVIDENCE_VERIFIED_AT = '2026-08-03T16:44:19Z';
const NEXT_REVIEW_AT = '2026-08-10T16:44:19Z';

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
      label: spec.outcome_label,
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
      legacy_origin: spec.legacy_origin,
      methodology_notes: [
        'freshness.last_reviewed_at records evidence assembly and source verification, not human approval; every claim remains pending until an editor reviews it.',
        ...spec.methodology_notes,
      ],
    },
  };
}

const sushiSources = [
  source('source:sushiswap:tokenomics', 'Breaking down the Sushi Tokenomics', 'https://www.sushi.com/blog/breaking-down-the-sushi-tokenomics', 'Sushi', '2023-11-07', 'B', 'primary'),
  source('source:sushiswap:kanpai', 'Important Update: Kanpai 2.0 expires, xSushi revived!', 'https://www.sushi.com/blog/kanpai-expires-xsushi-revived', 'Sushi', '2023-11-24', 'B', 'primary'),
  source('source:sushiswap:labs', 'Introducing Sushi Labs', 'https://www.sushi.com/blog/introducing-sushi-labs', 'Sushi', '2024-06-11', 'B', 'primary'),
  source('source:sushiswap:swap-anything', 'Swap Anything: Sushi Activates its Super Swap Roadmap', 'https://www.sushi.com/blog/swap-anything', 'Sushi', '2024-10-21', 'B', 'primary'),
  source('source:sushiswap:rp2-postmortem', 'RouteProcessor2 Post Mortem', 'https://www.sushi.com/blog/routeprocessor2-post-mortem', 'Sushi', '2023-04-18', 'B', 'primary'),
  source('source:sushiswap:rp2-claims', 'Sushi RouteProcessor2 Claim Portal Is Live!', 'https://www.sushi.com/blog/routeprocessor2-claim-portal-live', 'Sushi', '2023-04-25', 'B', 'primary'),
  source('source:sushiswap:review-2024', 'Sushi 2024: Year in Review', 'https://www.sushi.com/blog/sushi-2024-review', 'Sushi', '2024-12-31', 'B', 'primary'),
  source('source:sushiswap:rp9', 'Sushi November Recap', 'https://www.sushi.com/blog/sushi-november-recap-25', 'Sushi', '2025-12-03', 'B', 'primary'),
  source('source:sushiswap:governance', 'Sushi Governance', 'https://www.sushi.com/faq/governance/governance/sushi-governance', 'Sushi', null, 'B', 'primary'),
  source('source:sushiswap:sec-forum', 'Establish Sushi Legal Defense Fund', 'https://forum.sushi.com/t/establish-sushi-legal-defense-fund/11813', 'Sushi Governance Forum', '2023-03-21', 'B', 'primary'),
  source('source:sushiswap:sec-independent', 'Sushi DAO, Key Contributor Served With SEC Subpoena', 'https://www.coindesk.com/policy/2023/03/21/sushi-dao-key-contributor-served-with-sec-subpoena', 'CoinDesk', '2023-03-21', 'B', 'independent'),
  source('source:sushiswap:tvl', 'SushiSwap protocol TVL API', 'https://api.llama.fi/protocol/sushiswap', 'DefiLlama', null, 'B', 'aggregator'),
  source('source:sushiswap:volume', 'SushiSwap daily DEX volume API', 'https://api.llama.fi/summary/dexs/sushiswap?dataType=dailyVolume', 'DefiLlama', null, 'B', 'aggregator'),
  source('source:sushiswap:fees', 'SushiSwap daily trading-fee API', 'https://api.llama.fi/summary/fees/sushiswap?dataType=dailyFees', 'DefiLlama', null, 'B', 'aggregator'),
  source('source:sushiswap:revenue', 'SushiSwap daily protocol-revenue API', 'https://api.llama.fi/summary/fees/sushiswap?dataType=dailyRevenue', 'DefiLlama', null, 'B', 'aggregator'),
  source('source:sushiswap:token', 'SUSHI token market API', 'https://api.coingecko.com/api/v3/coins/sushi', 'CoinGecko', null, 'B', 'aggregator'),
];

const sushi = buildProfile({
  type: 'dex',
  slug: 'sushiswap',
  name: 'SushiSwap',
  aliases: ['Sushi'],
  legacy_origin: 'mid_exchanges',
  classification: {
    subtype: 'multi-chain spot AMM and liquidity aggregator',
    tags: ['spot_amm', 'liquidity_aggregator', 'multi_chain', 'dao_governance'],
    chains: ['Ethereum', 'Arbitrum', 'Base', 'Polygon', 'BNB Chain', 'Optimism', 'Sonic', 'Katana'],
    jurisdictions: [],
  },
  outcome_label: 'middling_declining',
  outcome_confidence: 'high',
  quality_confidence: 'medium',
  sources: sushiSources,
  status_source_ids: ['source:sushiswap:tvl', 'source:sushiswap:volume', 'source:sushiswap:rp9'],
  status_evidence_locator: 'Current DefiLlama TVL and volume observations plus the latest reviewed product release.',
  outcome_source_ids: ['source:sushiswap:tokenomics', 'source:sushiswap:tvl', 'source:sushiswap:volume', 'source:sushiswap:swap-anything'],
  outcome_evidence_locator: 'Sushi retrospective on launch incentives, current owned-pool observations and the later aggregation pivot.',
  sections: {
    what_it_is: {
      body: 'SushiSwap is a non-custodial exchange interface and protocol suite. Its own v2 and v3 pools let liquidity providers deposit assets that traders can swap against, while its Route Processor can also search outside liquidity sources and split a trade across them. That distinction matters: a swap routed through the Sushi interface may execute against another protocol, so aggregator-routed volume is not the same thing as Sushi-owned pool volume or TVL. Sushi Labs develops products alongside the Sushi DAO, which still governs community and treasury decisions.',
      source_ids: ['source:sushiswap:labs', 'source:sushiswap:swap-anything', 'source:sushiswap:governance', 'source:sushiswap:tvl'],
      evidence_locator: 'Operating structure, Route Processor description, governance model and protocol TVL scope.',
    },
    what_happened: {
      body: 'Sushi launched in 2020 by offering SUSHI rewards to liquidity providers who moved capital from Uniswap. Sushi now says the strategy attracted billions quickly but also attracted opportunistic farmers who left when rewards faded. The product expanded across many chains and into BentoBox, Kashi, Trident, cross-chain swaps and routing, then shifted its public strategy toward aggregation. In the 2026-08-03 snapshot, DefiLlama reported about $32.70 million of TVL, down 99.54 percent from its $7.04 billion 2021 peak, plus $16.94 million of 30-day SushiSwap-adapter volume. This is an operating product with a much smaller owned-liquidity base, not a dead exchange.',
      source_ids: ['source:sushiswap:tokenomics', 'source:sushiswap:swap-anything', 'source:sushiswap:tvl', 'source:sushiswap:volume'],
      evidence_locator: 'Sushi launch retrospective, product history and dated DefiLlama protocol observations.',
    },
    why_this_outcome: {
      body: 'Sushi won attention and liquidity fast but did not convert that launch surge into a durable moat. Its own retrospective says liquidity-mining rewards worked in the short term and failed as a long-term acquisition model because farmers left. The team then spread effort across products and chains while competing with more differentiated AMMs and chain-native venues. Aggregation made the interface useful even when Sushi pools were thin, but it also changed the business from owning the liquidity venue to routing through a wider market. Token-fee policy changed during the same period. These mechanisms explain the direction of travel, although the reviewed evidence cannot assign a precise percentage of decline to incentives, competition, execution or the broader market cycle.',
      source_ids: ['source:sushiswap:tokenomics', 'source:sushiswap:kanpai', 'source:sushiswap:labs', 'source:sushiswap:swap-anything', 'source:sushiswap:tvl'],
      evidence_locator: 'Operator admissions about liquidity mining and treasury policy, strategic restructuring, aggregator design and current TVL.',
      note: 'Analyst inference bounded by the cited decisions and market observations.',
    },
    strategic_choices: {
      body: 'The first choice was a vampire-style liquidity-mining launch: it bought distribution immediately, but Sushi later acknowledged that the capital was mercenary. The second was broad product and chain expansion, which created reach but also more code, integrations and priorities to maintain. The third was changing who received fees: Kanpai redirected the xSUSHI share to the DAO treasury during a drawdown, extending runway while interrupting holder value capture. The fourth was moving toward Route Processor aggregation and Sushi Labs, improving execution speed and quote coverage while making routed flow depend on third-party pools and a more centralized product-development structure. The 2023 RouteProcessor2 rollout also showed the cost of moving too quickly: Sushi soft-launched across fourteen networks before a critical approval flaw was contained.',
      source_ids: ['source:sushiswap:tokenomics', 'source:sushiswap:kanpai', 'source:sushiswap:labs', 'source:sushiswap:swap-anything', 'source:sushiswap:rp2-postmortem'],
      evidence_locator: 'Launch-incentive retrospective, fee-policy change, Labs structure, aggregation roadmap and security postmortem.',
      note: 'Trade-off analysis is an analyst interpretation of documented choices.',
    },
    operating_model: {
      body: 'For Sushi-owned pools, liquidity providers supply assets to smart contracts and receive the pool-level fee share; traders keep wallet custody until a transaction executes. The Route Processor is a routing layer: it compares Sushi pools with external sources and can construct a better path, so its notional flow can overlap the volume of the underlying venues. Sushi can also charge interface or routing fees on selected products. Sushi Labs leads product development, while governance and council structures address community, grants and treasury decisions. This is not a custodial exchange balance sheet, but users still assume smart-contract, token-approval, route, bridge and front-end risk.',
      source_ids: ['source:sushiswap:swap-anything', 'source:sushiswap:review-2024', 'source:sushiswap:labs', 'source:sushiswap:governance', 'source:sushiswap:fees'],
      evidence_locator: 'Routing, fee, Labs and governance descriptions plus the fee-adapter methodology.',
    },
    token_and_value_capture: {
      body: 'SUSHI launched with the exchange in 2020 as the reward and governance asset; staking it in the Sushi Bar produced xSUSHI, which historically received 0.05 percentage points from the standard 0.30 percent pool fee. In December 2022, Kanpai temporarily redirected that entire xSUSHI fee share to the treasury. Sushi said the program produced roughly $5 million and a four-year runway, then restored the Sushi Bar in 2024. A proposed replacement token model was not deployed after mixed community support. In the current adapter snapshot, DefiLlama reported about $50,522 of 30-day trading fees and $8,420 of 30-day holder/protocol revenue, while CoinGecko reported a $45.76 million SUSHI market cap. SUSHI is not equity or a legal claim on Sushi Labs or DAO assets.',
      source_ids: ['source:sushiswap:tokenomics', 'source:sushiswap:kanpai', 'source:sushiswap:fees', 'source:sushiswap:revenue', 'source:sushiswap:token'],
      evidence_locator: 'Token-mechanism history, Kanpai outcome and separate current fee, revenue and market observations.',
    },
    counterfactual: {
      body: 'A narrower roadmap could have concentrated engineering and liquidity on a smaller number of products and chains, while a stable fee policy could have made SUSHI economics easier to underwrite. Slower router deployment, complete bounty scope and longer audit timelines also could have reduced the 2023 approval incident; Sushi itself adopted those lessons afterward. The trade-off is that a narrower venue might have lost the multi-chain distribution and aggregation reach it has today. The evidence cannot calculate how much TVL any one alternative would have retained, so this is a bounded decision test rather than a claim that one change would have restored the 2021 peak.',
      source_ids: ['source:sushiswap:rp2-postmortem', 'source:sushiswap:kanpai', 'source:sushiswap:labs', 'source:sushiswap:swap-anything', 'source:sushiswap:tvl'],
      evidence_locator: 'Documented security lessons, fee and organizational choices, aggregation reach and TVL history.',
      note: 'Counterfactual; no causal estimate is available.',
    },
    risks_and_unknowns: {
      body: 'The central business risk is that Sushi becomes a useful interface without rebuilding a defensible pool-liquidity or order-flow moat. Aggregator activity can look large while owned TVL, pool depth and retained fees remain small, so those measures must stay separate. Security remains material: the April 2023 RouteProcessor2 approval flaw exposed about 1,800 WETH from the largest affected user; Sushi reported 885 ETH returned at the postmortem date, 795 ETH dispersed as Lido execution rewards, a separate 94.9 ETH theft and more than $750,000 rescued by HYDN. The SEC subpoena disclosed in March 2023 is also unresolved in the reviewed public record. Unknowns include current routed-versus-owned flow, product-level profitability, exact fee allocation and the final legal outcome.',
      source_ids: ['source:sushiswap:swap-anything', 'source:sushiswap:tvl', 'source:sushiswap:volume', 'source:sushiswap:rp2-postmortem', 'source:sushiswap:rp2-claims', 'source:sushiswap:sec-forum', 'source:sushiswap:sec-independent'],
      evidence_locator: 'Aggregator scope, current pool metrics, postmortem recovery accounting and subpoena disclosure.',
    },
    lifecycle: {
      body: 'Sushi began in 2020 with SUSHI-funded liquidity migration and reached a DefiLlama TVL peak of about $7.04 billion on 2021-11-09. Kanpai redirected xSUSHI fees to the treasury in December 2022. Sushi and Jared Grey disclosed an SEC subpoena on 2023-03-21, and the RouteProcessor2 approval exploit followed on 2023-04-08. Sushi announced the return of xSUSHI fee flow in November 2023 and created Sushi Labs in June 2024. Its 2024 strategy centered on a multi-chain aggregator, and product releases continued through RouteProcessor9 in late 2025. On 2026-08-03, the venue still processed trades and held TVL, but only about 0.46 percent of the recorded peak TVL remained. The lifecycle call is therefore operating and declining, not failed or recovered.',
      source_ids: ['source:sushiswap:tokenomics', 'source:sushiswap:tvl', 'source:sushiswap:kanpai', 'source:sushiswap:sec-forum', 'source:sushiswap:rp2-postmortem', 'source:sushiswap:labs', 'source:sushiswap:review-2024', 'source:sushiswap:rp9'],
      evidence_locator: 'Dated token, TVL, governance, security, organizational and product milestones.',
    },
    outlook_and_watch: {
      body: 'The base case is continued operation as a smaller multi-chain AMM and routing interface. The upside case requires durable growth in owned-pool depth, retained fees and repeat order flow rather than a temporary rise in routed notional. The downside case is further hollowing-out: the interface remains available but pool liquidity, token economics and governance attention keep weakening. Watch owned-pool TVL, 30-day SushiSwap-adapter volume, routed volume reported separately, trading fees versus the share retained by holders or treasury, SUSHI emissions and staking policy, active chains and deprecated products, treasury runway, Route Processor incidents, governance participation and any public resolution of the SEC inquiry. A higher token price alone would not demonstrate exchange recovery.',
      source_ids: ['source:sushiswap:tvl', 'source:sushiswap:volume', 'source:sushiswap:fees', 'source:sushiswap:revenue', 'source:sushiswap:token', 'source:sushiswap:swap-anything', 'source:sushiswap:kanpai'],
      evidence_locator: 'Current owned-pool, exchange-adapter, fee and token observations plus the aggregation and treasury strategy.',
      note: 'Scenario analysis, not a token-price forecast.',
    },
  },
  metrics: [
    { key: 'spot-volume-24h', dimension: 'spot_volume', label: 'SushiSwap-adapter DEX volume, rolling 24 hours', value: 303213, unit: 'usd', currency: 'USD', as_of: '2026-08-03T00:00:00Z', window: { start: null, end: '2026-08-03T00:00:00Z', definition: 'rolling_24h' }, method: 'DefiLlama SushiSwap DEX adapter', scope: { product: 'SushiSwap pools counted by the adapter', chains: [] }, source_ids: ['source:sushiswap:volume'], evidence_locator: 'total24h and latest chart fields in the retrieved dailyVolume response.', quality_flags: ['adapter_scope', 'not_aggregator_routed_volume'] },
    { key: 'spot-volume-30d', dimension: 'spot_volume', label: 'SushiSwap-adapter DEX volume, rolling 30 days', value: 16939567, unit: 'usd', currency: 'USD', as_of: '2026-08-03T00:00:00Z', window: { start: null, end: '2026-08-03T00:00:00Z', definition: 'rolling_30d' }, method: 'DefiLlama SushiSwap DEX adapter', scope: { product: 'SushiSwap pools counted by the adapter', chains: [] }, source_ids: ['source:sushiswap:volume'], evidence_locator: 'total30d field in the retrieved dailyVolume response.', quality_flags: ['adapter_scope', 'not_aggregator_routed_volume'] },
    { key: 'tvl', dimension: 'tvl', label: 'SushiSwap protocol TVL', value: 32700621, unit: 'usd', currency: 'USD', as_of: '2026-08-03T15:19:11Z', window: { start: null, end: '2026-08-03T15:19:11Z', definition: 'point_in_time' }, method: 'DefiLlama protocol TVL aggregate', scope: { product: 'SushiSwap', chains: [] }, source_ids: ['source:sushiswap:tvl'], evidence_locator: 'Latest totalLiquidityUSD observation in the retrieved protocol response.', quality_flags: ['aggregator_methodology'] },
    { key: 'fees-30d', dimension: 'fees', label: 'Trading fees, rolling 30 days', value: 50522, unit: 'usd', currency: 'USD', as_of: '2026-08-03T00:00:00Z', window: { start: null, end: '2026-08-03T00:00:00Z', definition: 'rolling_30d' }, method: 'DefiLlama SushiSwap fee adapter', scope: { product: 'SushiSwap Classic fee scope described by the adapter', chains: [] }, source_ids: ['source:sushiswap:fees'], evidence_locator: 'total30d and methodology fields in the retrieved dailyFees response.', quality_flags: ['adapter_scope'] },
    { key: 'protocol-revenue-30d', dimension: 'protocol_revenue', label: 'Holder/protocol revenue, rolling 30 days', value: 8420, unit: 'usd', currency: 'USD', as_of: '2026-08-03T00:00:00Z', window: { start: null, end: '2026-08-03T00:00:00Z', definition: 'rolling_30d' }, method: 'DefiLlama SushiSwap revenue adapter', scope: { product: 'xSUSHI-directed share described by the adapter', chains: [] }, source_ids: ['source:sushiswap:revenue'], evidence_locator: 'total30d and methodology fields in the retrieved dailyRevenue response.', quality_flags: ['adapter_scope', 'not_corporate_revenue'] },
    { key: 'token-price', dimension: 'token_price', label: 'SUSHI token price', value: 0.156934, unit: 'usd', currency: 'USD', as_of: '2026-08-03T16:39:03.956Z', window: { start: null, end: '2026-08-03T16:39:03.956Z', definition: 'point_in_time' }, method: 'CoinGecko market aggregate', scope: { product: 'SUSHI token', chains: [] }, source_ids: ['source:sushiswap:token'], evidence_locator: 'market_data.current_price.usd and last_updated fields.', quality_flags: ['aggregator_methodology'] },
    { key: 'token-market-cap', dimension: 'token_market_cap', label: 'SUSHI token market capitalization', value: 45761102, unit: 'usd', currency: 'USD', as_of: '2026-08-03T16:39:03.956Z', window: { start: null, end: '2026-08-03T16:39:03.956Z', definition: 'point_in_time' }, method: 'CoinGecko market aggregate', scope: { product: 'SUSHI token', chains: [] }, source_ids: ['source:sushiswap:token'], evidence_locator: 'market_data.market_cap.usd and last_updated fields.', quality_flags: ['aggregator_methodology'] },
  ],
  events: [
    { key: 'sec-subpoena', type: 'regulatory_inquiry', date: '2023-03-21', description: 'Sushi and Jared Grey disclosed an SEC subpoena and proposed a legal-defense fund; the reviewed public record does not establish a final outcome.', source_ids: ['source:sushiswap:sec-forum', 'source:sushiswap:sec-independent'], evidence_locator: 'Governance disclosure and independent contemporaneous report.' },
    { key: 'rp2-exploit', type: 'security_incident', date: '2023-04-08', description: 'A RouteProcessor2 approval vulnerability exposed approved user assets after a fourteen-network soft launch.', source_ids: ['source:sushiswap:rp2-postmortem'], evidence_locator: 'Postmortem timeline, asset-flow accounting and rollout lessons.' },
    { key: 'rp2-claims', type: 'remediation', date: '2023-04-25', description: 'Sushi opened a claim portal for rescued RouteProcessor2 funds and a separate review process for funds that were not rescued.', source_ids: ['source:sushiswap:rp2-claims'], evidence_locator: 'Claim-portal instructions and affected-user groups.' },
    { key: 'kanpai-update', type: 'tokenomics_change', date: '2023-11-24', description: 'Sushi announced Kanpai expiration, the return of xSUSHI fee flow and the decision not to deploy the proposed replacement tokenomics.', source_ids: ['source:sushiswap:kanpai'], evidence_locator: 'Kanpai proceeds, Sushi Bar reopening and proposal status.' },
    { key: 'sushi-labs', type: 'organizational_change', date: '2024-06-11', description: 'Sushi introduced Sushi Labs to lead product development alongside the Sushi DAO.', source_ids: ['source:sushiswap:labs'], evidence_locator: 'Sushi Labs announcement, role and governance structure.' },
    { key: 'rp9', type: 'product_release', date: '2025-11-24', description: 'Sushi reported that RouteProcessor9 was live on Monad, evidence that the routing product remained under active development.', source_ids: ['source:sushiswap:rp9'], evidence_locator: 'November 2025 recap product milestone.' },
  ],
  unsourced_fields: ['Current Sushi Labs and DAO audited financial statements', 'Complete routed-versus-owned volume split', 'Current product-level profitability and fee allocation', 'Final public disposition of the 2023 SEC subpoena'],
  methodology_notes: [
    'DefiLlama SushiSwap-adapter volume is not treated as aggregator-routed volume and is not added to the volume of external venues used in a route.',
    'TVL measures assets in tracked contracts, not liquidity at every price level or the quality of execution for a particular trade.',
    'The RouteProcessor2 incident preserves Sushi\'s recovery categories and dates; gross exposed or drained amounts are not presented as final unrecovered loss.',
    'Sushi and CoinGecko token figures do not create an equity, treasury or legal claim for SUSHI holders.',
  ],
});

const bybitSources = [
  source('source:bybit:vision-2025', 'Bybit Unveils 2025 Vision: A User-Centric Approach to Crypto Innovation', 'https://www.bybit.com/en/press/post/bybit-unveils-2025-vision-a-user-centric-approach-to-crypto-innovation-blt02b02bc45c5a067d', 'Bybit', '2025-01-21', 'B', 'primary'),
  source('source:bybit:vision-2026', 'Bybit Unveils 2026 Vision as The New Financial Platform', 'https://www.bybit.com/en/press/post/bybit-unveils-2026-vision-as-the-new-financial-platform-expanding-beyond-exchange-into-global-financial-infrastructure-bltb6dfb3b99d431f3f', 'Bybit', '2026-01-29', 'B', 'primary'),
  source('source:bybit:incident', 'Bybit Security Incident: Timeline of Events and FAQs', 'https://www.bybit.com/en/learn/this-week-in-bybit/bybit-security-incident-timeline', 'Bybit', '2025-03-03', 'B', 'primary'),
  source('source:bybit:fbi', 'North Korea Responsible for $1.5 Billion Bybit Hack', 'https://www.fbi.gov/investigate/cyber/alerts/2025/north-korea-responsible-for-1-5-billion-bybit-hack', 'Federal Bureau of Investigation', '2025-02-26', 'A', 'independent'),
  source('source:bybit:sygnia', 'Bybit — What We Know So Far', 'https://www.sygnia.co/blog/sygnia-investigation-bybit-hack/', 'Sygnia', '2025-03-16', 'B', 'independent'),
  source('source:bybit:por-2025', 'Fully Backed Within 72 hours: Bybit Maintains 1:1 Customer Assets Ratio', 'https://www.bybit.com/en/press/post/fully-backed-within-72-hours-bybit-maintains-1-1-customer-assets-ratio-in-latest-proof-of-reserves-audited-report-by-hacken-bltb767a9461133831f', 'Bybit', '2025-02-24', 'B', 'primary'),
  source('source:bybit:por-2026', 'Bybit Proof of Reserves Audit Report — 2026-05-27 snapshot', 'https://www.bybit.com/common-static/cht-static/por/Bybit_PoR_Audit_2026_May_27.pdf', 'Hacken OU', '2026-06-03', 'B', 'independent'),
  source('source:bybit:por-current', 'Bybit Proof of Reserves', 'https://www.bybit.com/app/user/proof-of-reserve', 'Bybit', null, 'B', 'primary'),
  source('source:bybit:por-method', 'How to Verify Bybit Ownership of Wallet Addresses and Their Balances', 'https://www.bybit.com/en/help-center/article/How-to-Verify-Bybit-Ownership-of-Wallet-Addresses-and-Their-Balances', 'Bybit', '2025-11-25', 'B', 'primary'),
  source('source:bybit:fma', 'Granting of Authorisation Bybit EU GmbH', 'https://www.fma.gv.at/en/granting-of-authorisation-bybit-eu-gmbh/', 'Austrian Financial Market Authority', '2025-05-30', 'A', 'independent'),
  source('source:bybit:amf', 'The AMF reminds the public that the cryptoasset trading platform BYBIT is blacklisted', 'https://www.amf-france.org/en/news-publications/news-releases/amf-news-releases/amf-reminds-public-cryptoasset-trading-platform-bybit-blacklisted', 'Autorité des marchés financiers', '2024-05-16', 'A', 'independent'),
  source('source:bybit:fsa', 'Warning concerning an unregistered crypto-asset exchange provider — Bybit Fintech Limited', 'https://www.fsa.go.jp/policy/virtual_currency02/bybit_fintech_limited_keikokushiryo.pdf', 'Japan Financial Services Agency', '2024-11-28', 'A', 'independent'),
  source('source:bybit:wallets', 'Bybit protocol and tracked exchange-wallet API', 'https://api.llama.fi/protocol/bybit', 'DefiLlama', null, 'B', 'aggregator'),
  source('source:bybit:spot', 'Bybit spot exchange API', 'https://api.coingecko.com/api/v3/exchanges/bybit_spot', 'CoinGecko', null, 'B', 'aggregator'),
];

const bybit = buildProfile({
  type: 'cex',
  slug: 'bybit',
  name: 'Bybit',
  aliases: [],
  legacy_origin: 'successful_exchanges',
  classification: {
    subtype: 'global centralized multi-product exchange',
    tags: ['custodial', 'spot', 'derivatives', 'payments', 'earn'],
    chains: [],
    jurisdictions: ['Global, entity-specific access', 'European Union through Bybit EU GmbH'],
  },
  outcome_label: 'successful_established',
  outcome_confidence: 'high',
  quality_confidence: 'medium',
  sources: bybitSources,
  status_source_ids: ['source:bybit:spot', 'source:bybit:wallets', 'source:bybit:por-current', 'source:bybit:vision-2026'],
  status_evidence_locator: 'Current exchange activity, tracked wallets, proof-of-reserves page and 2026 operator strategy.',
  outcome_source_ids: ['source:bybit:vision-2025', 'source:bybit:vision-2026', 'source:bybit:spot', 'source:bybit:fbi', 'source:bybit:fma'],
  outcome_evidence_locator: 'Operator scale history, current independent exchange observations, security survival and entity-specific licensing.',
  sections: {
    what_it_is: {
      body: 'Bybit is a custodial exchange: customers deposit assets into exchange-controlled wallets, trade on an internal ledger and depend on Bybit to honor withdrawals. The venue began with crypto derivatives and now offers spot markets, margin, earn products, cards, payments, institutional custody and traditional-market instruments through different legal entities. The product mix, permissions and customer protections vary by jurisdiction. Bybit EU GmbH, for example, has a specific Austrian MiCA authorization for named crypto-asset services; that authorization does not license every Bybit entity or every product worldwide.',
      source_ids: ['source:bybit:vision-2025', 'source:bybit:vision-2026', 'source:bybit:fma'],
      evidence_locator: 'Operator product descriptions and the Austrian regulator\'s entity-and-service-specific authorization.',
    },
    what_happened: {
      body: 'Bybit grew from a derivatives-focused exchange founded in 2018 into a large multi-product venue. The operator reported 60 million users and $36 billion of average daily trading volume for 2024, then 82 million users in its January 2026 strategy; these are operator figures, not active-user counts or audited financial statements. On 2025-02-21, attackers stole about $1.5 billion from an Ethereum cold wallet. Bybit kept operating and replenished the asset gap using bridge loans, deposits and purchases according to its own timeline. In the current snapshot, CoinGecko reported 22,555.96 BTC-equivalent of rolling 24-hour spot volume, while DefiLlama tracked about $12.95 billion in labeled Bybit wallets. The wallet figure is not a complete reserve or liability statement.',
      source_ids: ['source:bybit:vision-2025', 'source:bybit:vision-2026', 'source:bybit:fbi', 'source:bybit:incident', 'source:bybit:spot', 'source:bybit:wallets'],
      evidence_locator: 'Operator scale claims, official incident attribution, operator response and current aggregator observations.',
    },
    why_this_outcome: {
      body: 'Bybit became large by pairing a derivatives-first product with global distribution, deep markets and continuous expansion into spot, yield, cards, payments and institutional services. More products gave customers reasons to keep balances and activity on one venue, which reinforced liquidity. The same model also concentrated custody, leverage and regulatory risk. The 2025 hack did not end the exchange because Bybit continued withdrawals, obtained outside liquidity and restored in-scope asset coverage quickly enough to contain a run, according to operator and commissioned-attestation evidence. Continued current activity supports the survival conclusion, but it does not prove audited profitability or complete solvency. Licensing Bybit EU GmbH later improved access in the EU without resolving every jurisdiction.',
      source_ids: ['source:bybit:vision-2025', 'source:bybit:vision-2026', 'source:bybit:incident', 'source:bybit:por-2025', 'source:bybit:por-2026', 'source:bybit:spot', 'source:bybit:fma'],
      evidence_locator: 'Product and distribution strategy, incident response, scoped reserve attestations, current activity and EU authorization.',
      note: 'Analyst inference bounded by operator, commissioned-attestation, market and regulator evidence.',
    },
    strategic_choices: {
      body: 'The first choice was to lead with high-frequency derivatives rather than a narrow spot exchange, accelerating trader adoption while increasing liquidation, market-integrity and regulatory exposure. The second was broad global distribution through offshore and local entities; that created reach but also historical warnings in France and Japan. The third was product expansion into payments, cards, earn, custody and traditional instruments, increasing cross-sell and operational complexity. The fourth was a cold-wallet workflow that relied on Safe\'s web interface for a multisig transaction. The 2025 attacker compromised that signing supply chain; even if the malicious code originated outside Bybit, Bybit\'s transaction-verification controls failed to stop it. Finally, bridge loans and rapid reserve replenishment protected continuity but left the size, terms and repayment of that financing outside the reviewed public record.',
      source_ids: ['source:bybit:vision-2025', 'source:bybit:vision-2026', 'source:bybit:amf', 'source:bybit:fsa', 'source:bybit:incident', 'source:bybit:sygnia', 'source:bybit:por-2025'],
      evidence_locator: 'Product strategy, regulator warnings, forensic attack chain and operator funding response.',
      note: 'Trade-off analysis is an analyst interpretation of documented choices.',
    },
    operating_model: {
      body: 'Customers transfer assets to Bybit-controlled addresses and receive balances on Bybit\'s internal ledger. Off-chain matching engines execute spot and derivative orders; margin rules, liquidation systems and insurance arrangements manage leveraged positions. Withdrawals convert ledger claims back into on-chain transfers. This structure can provide fast execution and shared collateral, but customers are unsecured to the quality of custody, accounting, risk controls and the legal entity serving them. Public wallet labels show only some on-chain assets. Proof-of-reserves compares submitted in-scope addresses with in-scope customer liabilities at one snapshot; it does not replace consolidated audited accounts, cash-flow statements or a complete map of affiliates and obligations.',
      source_ids: ['source:bybit:vision-2025', 'source:bybit:incident', 'source:bybit:por-2026', 'source:bybit:por-method', 'source:bybit:wallets'],
      evidence_locator: 'Product model, withdrawal response, PoR methodology and tracked-wallet scope.',
    },
    token_and_value_capture: {
      body: 'The reviewed evidence does not establish a Bybit-issued venue token that gives holders a claim on exchange revenue, assets or equity, so Chaindump does not assign one. Listed assets, Mantle\'s MNT and Bybit-branded staking products should not be silently treated as legal claims on the exchange. Bybit\'s value capture instead appears to be private-company economics: trading fees, spreads, financing, custody, earn, card, payments and other product revenue. The operator does not publish audited consolidated revenue, expenses or ownership economics in the reviewed sources. That makes product scale visible but prevents a clean comparison between customer activity and durable profit.',
      source_ids: ['source:bybit:vision-2025', 'source:bybit:vision-2026', 'source:bybit:por-2026'],
      evidence_locator: 'Reviewed product strategy and PoR asset list; no venue-token claim is made by the cited evidence.',
    },
    counterfactual: {
      body: 'A smaller, licensed-market-first spot exchange would have carried less derivatives and jurisdictional risk, but it likely would not have built Bybit\'s global liquidity or product distribution as quickly. For the 2025 theft, independent transaction simulation, policy checks against contract-logic changes, allowlisted destinations and verification on a channel separate from the Safe web interface could have rejected the malicious transaction even after Safe was compromised. Those controls might have prevented the transfer, but the reviewed evidence does not prove which were absent or calculate a prevention probability. Afterward, slower funding or halted withdrawals could have increased run risk; rapid borrowing reduced that risk while creating financing opacity.',
      source_ids: ['source:bybit:vision-2025', 'source:bybit:sygnia', 'source:bybit:incident', 'source:bybit:por-2025'],
      evidence_locator: 'Observed strategy, attack path and response used to bound alternative choices.',
      note: 'Counterfactual; no causal estimate is available.',
    },
    risks_and_unknowns: {
      body: 'The largest known risk is custody. The FBI attributed the roughly $1.5 billion February 2025 theft to North Korea, while Sygnia described malicious code served through Safe infrastructure that altered the signing flow. This was a third-party compromise and a failure of the end-to-end treasury control at the same time. Financial transparency remains incomplete: the 2026 Hacken report found greater-than-100-percent coverage for its in-scope assets and liabilities at the May 27 snapshot, but its disclaimer says it is not a comprehensive audit of all assets, liabilities or the organization\'s overall financial position. Historical regulator warnings also show jurisdiction fragmentation; the AMF page now says its 2024 warning is no longer current, while Japan\'s 2024 warning concerned unregistered service at that date. Unknowns include consolidated debt, post-hack bridge-loan terms, affiliate exposures, revenue, profit and complete wallet coverage.',
      source_ids: ['source:bybit:fbi', 'source:bybit:sygnia', 'source:bybit:por-2026', 'source:bybit:amf', 'source:bybit:fsa', 'source:bybit:fma'],
      evidence_locator: 'Government attribution, commissioned forensics, PoR findings and disclaimer, and dated regulator records.',
    },
    lifecycle: {
      body: 'Bybit was founded in 2018 and built its first scale around crypto derivatives before adding spot and adjacent products. France\'s AMF repeated a blacklist warning on 2024-05-16 but now labels that release no longer current; Japan\'s FSA warned Bybit Fintech Limited about unregistered service on 2024-11-28. The cold-wallet theft occurred on 2025-02-21, and the FBI attributed it to North Korea on 2025-02-26. Austria authorized Bybit EU GmbH for specified MiCA services by decision dated 2025-05-28. Bybit then continued expanding its platform and commissioned recurring PoR snapshots, including the reviewed 2026-05-27 report. Current spot and tracked-wallet observations show the exchange remains material. Its lifecycle call is successful and established with a severe security loss and uneven regulatory history, not unqualified success.',
      source_ids: ['source:bybit:spot', 'source:bybit:vision-2025', 'source:bybit:amf', 'source:bybit:fsa', 'source:bybit:fbi', 'source:bybit:fma', 'source:bybit:vision-2026', 'source:bybit:por-2026'],
      evidence_locator: 'Founding context, dated regulator actions, hack attribution, entity authorization, platform strategy and reserve snapshot.',
    },
    outlook_and_watch: {
      body: 'The base case is that Bybit remains a large global exchange while shifting more access into licensed entities and expanding beyond crypto trading. The upside case is a durable regulated financial platform with stronger custody controls, independently observable liquidity and recurring reserve coverage. The downside case is another custody failure, loss of market access, opaque leverage or a withdrawal shock that exposes liabilities not visible in public wallet data. Watch independent spot and derivatives volume separately, market depth, withdrawal latency, DefiLlama-tracked wallets without calling them reserves, PoR asset and liability scope, consolidated audited accounts if published, bridge-loan repayment, stolen-asset recovery, Safe and treasury-control remediation, legal-entity registers and product restrictions by country. Operator user counts and AUM claims should remain labeled until independently verified.',
      source_ids: ['source:bybit:spot', 'source:bybit:wallets', 'source:bybit:por-current', 'source:bybit:por-2026', 'source:bybit:incident', 'source:bybit:fma', 'source:bybit:vision-2026'],
      evidence_locator: 'Current market and wallet observations, reserve scope, incident response, licensed-entity status and operator strategy.',
      note: 'Scenario analysis, not a token or company valuation forecast.',
    },
  },
  metrics: [
    { key: 'spot-volume-24h-btc-equivalent', dimension: 'spot_volume', label: 'Spot volume, rolling 24 hours (BTC equivalent)', value: 22555.963774980275, unit: 'btc_equivalent', currency: 'BTC', as_of: '2026-08-03T16:41:58Z', window: { start: null, end: '2026-08-03T16:41:58Z', definition: 'rolling_24h' }, method: 'CoinGecko Bybit spot exchange aggregate', scope: { product: 'Bybit spot ticker sample', chains: [] }, source_ids: ['source:bybit:spot'], evidence_locator: 'trade_volume_24h_btc field in the retrieved exchange response.', quality_flags: ['aggregator_methodology', 'btc_equivalent', 'ticker_sample_limit', 'not_all_product_volume'] },
    { key: 'tracked-wallet-assets', dimension: 'customer_assets', label: 'DefiLlama-tracked on-chain exchange wallet balances', value: 12954358847, unit: 'usd', currency: 'USD', as_of: '2026-08-03T15:21:23Z', window: { start: null, end: '2026-08-03T15:21:23Z', definition: 'point_in_time' }, method: 'DefiLlama labeled exchange-wallet aggregate', scope: { product: 'Publicly tracked Bybit wallets', chains: [] }, source_ids: ['source:bybit:wallets'], evidence_locator: 'Latest totalLiquidityUSD observation in the retrieved Bybit protocol response.', quality_flags: ['partial_wallet_coverage', 'not_liability_matched', 'not_financial_audit'] },
  ],
  events: [
    { key: 'amf-warning', type: 'regulatory_warning', date: '2024-05-16', description: 'France\'s AMF repeated that Bybit was blacklisted for unregistered service; the AMF now marks this historical release as no longer current.', source_ids: ['source:bybit:amf'], evidence_locator: 'Warning date, historic basis and current stale-information notice.' },
    { key: 'fsa-warning', type: 'regulatory_warning', date: '2024-11-28', description: 'Japan\'s FSA warned Bybit Fintech Limited for serving Japanese residents without registration at that date.', source_ids: ['source:bybit:fsa'], evidence_locator: 'FSA warning, named entity, address and conduct description.' },
    { key: 'cold-wallet-theft', type: 'security_incident', date: '2025-02-21', description: 'Attackers stole approximately $1.5 billion from a Bybit Ethereum cold wallet after compromising the transaction-signing flow.', source_ids: ['source:bybit:fbi', 'source:bybit:incident', 'source:bybit:sygnia'], evidence_locator: 'FBI amount and date, operator timeline and commissioned forensic attack path.' },
    { key: 'fbi-attribution', type: 'law_enforcement_attribution', date: '2025-02-26', description: 'The FBI attributed the Bybit theft to North Korean TraderTraitor actors.', source_ids: ['source:bybit:fbi'], evidence_locator: 'FBI public service announcement.' },
    { key: 'eu-authorization', type: 'license', date: '2025-05-28', description: 'Austria\'s FMA authorized Bybit EU GmbH for specified crypto-asset services under MiCA.', source_ids: ['source:bybit:fma'], evidence_locator: 'Administrative decision date, named entity and permitted services.' },
    { key: 'financial-platform', type: 'strategy_update', date: '2026-01-29', description: 'Bybit announced a strategy to expand beyond exchange trading into banking, payments, custody and traditional-market products.', source_ids: ['source:bybit:vision-2026'], evidence_locator: 'Operator 2026 strategy and product claims.' },
    { key: 'por-audit', type: 'reserve_attestation', date: '2026-05-27', description: 'Hacken performed a point-in-time Bybit PoR assessment that reported greater-than-100-percent coverage for in-scope assets and liabilities and disclaimed a comprehensive financial audit.', source_ids: ['source:bybit:por-2026'], evidence_locator: 'Audit date, scope, findings and page-30 disclaimer.' },
  ],
  unsourced_fields: ['Audited consolidated assets and liabilities', 'Audited consolidated revenue and profitability', 'Complete affiliate and internal trading exposure', 'Post-hack bridge-loan amount, terms and repayment status', 'Complete wallet and customer-liability coverage'],
  methodology_notes: [
    'CoinGecko spot volume is a rolling BTC-equivalent exchange aggregate and is not compared with operator-reported all-product or derivatives volume.',
    'DefiLlama-tracked wallet balances are not proof of complete reserves, customer liabilities, legal ownership or solvency.',
    'The Hacken report is a commissioned point-in-time attestation; its own disclaimer says it is not a comprehensive audit of all assets, liabilities or the overall financial position.',
    'Regulatory records are scoped to the named entity, country, services and date; the Bybit EU authorization is not generalized to every Bybit entity or product.',
    'The Safe supply-chain compromise does not remove Bybit\'s responsibility for the end-to-end treasury control that authorized the malicious transaction.',
  ],
});

export const document = {
  schema: 'chaindump-exchange-control-profiles-v1',
  as_of: '2026-08-03',
  generated_migration: '0070_exchange_control_profiles.sql',
  cases: [
    {
      table: 'mid_exchanges',
      lifecycle: 'mid',
      type: 'dex',
      slug: 'sushiswap',
      legacy: {
        metric_label: 'Protocol TVL',
        metric_type: 'tvl',
        metric_unit: 'USD',
        metric: 32700621,
        verdict: 'declining',
        why: 'Sushi remains useful and operating, but its liquidity-mining launch did not create a durable moat. Owned-pool TVL is 99.54% below the recorded peak, while the aggregation pivot improves routing without proving recovery of Sushi-owned liquidity.',
        outlook: 'Base case: Sushi continues as a smaller AMM and multi-chain router. Watch owned-pool TVL, SushiSwap-adapter volume, routed flow separately, fees retained, treasury runway, token policy, security incidents and the unresolved SEC inquiry.',
        operating_model: 'Non-custodial multi-chain spot AMM plus Route Processor aggregation across Sushi and third-party liquidity sources.',
        synthesis: 'An operating but declining exchange that converted a mercenary-liquidity launch into a durable brand and routing product, not a durable owned-liquidity moat.',
      },
      canonical_profile: sushi,
    },
    {
      table: 'successful_exchanges',
      lifecycle: 'successful',
      type: 'cex',
      slug: 'bybit',
      legacy: {
        metric_label: '24h spot volume (BTC equivalent; CoinGecko)',
        metric_type: 'spot_volume_24h_btc_equivalent',
        metric_unit: 'BTC',
        metric: 22555.963774980275,
        verdict: 'successful_established',
        why: 'Bybit compounded derivatives-first liquidity, global distribution and a broad product suite. It survived the $1.5B 2025 cold-wallet theft through continued withdrawals and rapid outside funding, but that survival does not prove complete solvency or audited profitability.',
        outlook: 'Base case: Bybit remains a large global venue while moving more access into licensed entities. Watch independent spot and derivatives liquidity, withdrawals, PoR scope, audited liabilities, bridge-loan repayment, custody remediation and jurisdiction-specific authorization.',
        operating_model: 'Custodial multi-product exchange using exchange-controlled wallets, internal ledgers and off-chain matching through jurisdiction-specific legal entities.',
        synthesis: 'A commercially successful exchange with durable distribution, a severe survived security loss, uneven regulatory history and material unresolved financial-transparency questions.',
      },
      canonical_profile: bybit,
    },
  ],
};

export function renderMigration(value = document) {
  const payload = JSON.stringify(value, null, 2).replaceAll("'", "''");
  return `-- Two source-linked exchange control profiles, researched 2026-08-03 and awaiting human review.
-- The canonical JSON document is embedded so clean-database replay is deterministic.
-- Existing legacy source arrays are preserved; canonical consumers use canonical_profile.

DROP TABLE IF EXISTS _exchange_control_profiles_0070;

CREATE TABLE _exchange_control_profiles_0070 (
  table_name TEXT NOT NULL,
  lifecycle TEXT NOT NULL,
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
INSERT INTO _exchange_control_profiles_0070 (table_name, lifecycle, type, slug, legacy, canonical_profile)
SELECT
  json_extract(entry.value, '$.table'),
  json_extract(entry.value, '$.lifecycle'),
  json_extract(entry.value, '$.type'),
  json_extract(entry.value, '$.slug'),
  json_extract(entry.value, '$.legacy'),
  json_extract(entry.value, '$.canonical_profile')
FROM research_document, json_each(json_extract(payload, '$.cases')) AS entry;
-- canonical-payload-end

UPDATE mid_exchanges AS exchange_row
SET
  metric_label = json_extract(staged.legacy, '$.metric_label'),
  metric_type = json_extract(staged.legacy, '$.metric_type'),
  metric_unit = json_extract(staged.legacy, '$.metric_unit'),
  metric = json_extract(staged.legacy, '$.metric'),
  verdict = json_extract(staged.legacy, '$.verdict'),
  why_stuck = json_extract(staged.legacy, '$.why'),
  outlook = json_extract(staged.legacy, '$.outlook'),
  profile = json_set(
    COALESCE(exchange_row.profile, '{}'),
    '$.canonical_profile', json(staged.canonical_profile),
    '$.operational_model', json_extract(staged.legacy, '$.operating_model'),
    '$.synthesis', json_extract(staged.legacy, '$.synthesis')
  ),
  updated_at = '2026-08-03'
FROM _exchange_control_profiles_0070 AS staged
WHERE staged.table_name = 'mid_exchanges'
  AND exchange_row.kind = staged.type
  AND exchange_row.slug = staged.slug;

UPDATE successful_exchanges AS exchange_row
SET
  status = json_extract(staged.legacy, '$.verdict'),
  metric_label = json_extract(staged.legacy, '$.metric_label'),
  metric_type = json_extract(staged.legacy, '$.metric_type'),
  metric_unit = json_extract(staged.legacy, '$.metric_unit'),
  metric = json_extract(staged.legacy, '$.metric'),
  why_successful = json_extract(staged.legacy, '$.why'),
  outlook = json_extract(staged.legacy, '$.outlook'),
  profile = json_set(
    COALESCE(exchange_row.profile, '{}'),
    '$.canonical_profile', json(staged.canonical_profile),
    '$.operational_model', json_extract(staged.legacy, '$.operating_model'),
    '$.synthesis', json_extract(staged.legacy, '$.synthesis')
  ),
  updated_at = '2026-08-03'
FROM _exchange_control_profiles_0070 AS staged
WHERE staged.table_name = 'successful_exchanges'
  AND exchange_row.type = staged.type
  AND exchange_row.slug = staged.slug;

UPDATE exchange_case_features AS features
SET
  metric_type = CASE
    WHEN features.kind = 'dex' AND features.slug = 'sushiswap' THEN 'tvl'
    WHEN features.kind = 'cex' AND features.slug = 'bybit' THEN 'spot_volume_24h_btc_equivalent'
    ELSE features.metric_type
  END,
  metric_unit = CASE
    WHEN features.kind = 'dex' AND features.slug = 'sushiswap' THEN 'usd'
    WHEN features.kind = 'cex' AND features.slug = 'bybit' THEN 'btc_equivalent'
    ELSE features.metric_unit
  END,
  metric_window = CASE
    WHEN features.kind = 'dex' AND features.slug = 'sushiswap' THEN 'point_in_time'
    WHEN features.kind = 'cex' AND features.slug = 'bybit' THEN 'rolling_24h'
    ELSE features.metric_window
  END,
  metric_as_of = '2026-08-03',
  metric_observed_at = CASE
    WHEN features.kind = 'dex' AND features.slug = 'sushiswap' THEN '2026-08-03T15:19:11Z'
    WHEN features.kind = 'cex' AND features.slug = 'bybit' THEN '2026-08-03T16:41:58Z'
    ELSE features.metric_observed_at
  END,
  comparability_key = CASE
    WHEN features.kind = 'dex' AND features.slug = 'sushiswap' THEN 'dex|spot_amm_and_aggregator|tvl|usd|point_in_time'
    WHEN features.kind = 'cex' AND features.slug = 'bybit' THEN 'cex|centralized_multi_product_exchange|spot_volume_24h_btc_equivalent|btc_equivalent|rolling_24h'
    ELSE features.comparability_key
  END,
  last_verified_at = '2026-08-03',
  next_review_at = '2026-08-10',
  freshness_status = 'current',
  updated_at = '2026-08-03'
WHERE EXISTS (
  SELECT 1
  FROM _exchange_control_profiles_0070 AS staged
  WHERE staged.type = features.kind
    AND staged.slug = features.slug
    AND staged.lifecycle = features.lifecycle
);

DROP TABLE _exchange_control_profiles_0070;
`;
}

function writeOutputs() {
  const documentPath = fileURLToPath(new URL('../docs/exchange-control-profiles-2026-08-03.json', import.meta.url));
  const migrationPath = fileURLToPath(new URL('../migrations/0070_exchange_control_profiles.sql', import.meta.url));
  writeFileSync(documentPath, `${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(migrationPath, renderMigration());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) writeOutputs();

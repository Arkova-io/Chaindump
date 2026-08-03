import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const ACCESSED_AT = '2026-08-03T17:01:09Z';
const EVIDENCE_VERIFIED_AT = '2026-08-03T17:01:09Z';
const NEXT_REVIEW_AT = '2026-08-10T17:01:09Z';
const AS_OF = '2026-08-03';

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
    review: { state: 'pending', reviewer: null, reviewed_at: null },
  };
}

const sources = [
  source(
    'source:quantum-cats:official',
    'Quantum Cats — Bringing OP_CAT Back to Bitcoin',
    'https://www.quantumcats.xyz/',
    'Taproot Wizards',
    null,
    'B',
    'primary',
  ),
  source(
    'source:quantum-cats:taproot-wizards',
    'Taproot Wizards',
    'https://taprootwizards.com/',
    'Taproot Wizards',
    null,
    'B',
    'primary',
  ),
  source(
    'source:quantum-cats:bip347',
    'BIP 347 — OP_CAT in Tapscript',
    'https://bips.xyz/347',
    'Bitcoin Improvement Proposals',
    '2026-04-23',
    'A',
    'primary',
  ),
  source(
    'source:quantum-cats:bitcoin-core',
    'Bitcoin Core script interpreter',
    'https://github.com/bitcoin/bitcoin/blob/master/src/script/interpreter.cpp',
    'Bitcoin Core',
    null,
    'A',
    'primary',
  ),
  source(
    'source:quantum-cats:coingecko',
    'Quantum Cats market data API',
    'https://api.coingecko.com/api/v3/nfts/quantum-cats',
    'CoinGecko',
    null,
    'B',
    'aggregator',
  ),
  source(
    'source:quantum-cats:decrypt-launch',
    'Taproot Wizards Launch Quantum Cats Bitcoin Ordinals Collection',
    'https://decrypt.co/212594/taproot-wizards-launch-quantum-cats-bitcoin-ordinals-collection',
    'Decrypt',
    '2024-01-12',
    'B',
    'independent',
  ),
  source(
    'source:quantum-cats:coindesk-mint',
    'Taproot Wizards Recovers From Tech-Marred Debut, Selling $13M of Bitcoin NFTs',
    'https://www.coindesk.com/tech/2024/02/05/taproot-wizards-recovers-from-tech-marred-debut-selling-11m-of-bitcoin-nfts',
    'CoinDesk',
    '2024-02-05',
    'B',
    'independent',
  ),
  source(
    'source:quantum-cats:sothebys-genesis',
    'Genesis Cat',
    'https://www.sothebys.com/en/buy/auction/2024/natively-digital-an-ordinals-curated-sale/genesis-cat',
    "Sotheby's",
    '2024-01-22',
    'A',
    'primary',
  ),
  source(
    'source:quantum-cats:coindesk-genesis',
    'Bitcoin-Based Digital Art Image Genesis Cat Sells for $254K in Sotheby’s Auction',
    'https://www.coindesk.com/tech/2024/01/22/bitcoin-based-digital-art-image-genesis-cat-sells-for-254k-in-sothebys-auction',
    'CoinDesk',
    '2024-01-22',
    'B',
    'independent',
  ),
  source(
    'source:quantum-cats:techcrunch-seed',
    'Taproot Wizards raises $7.5M to make Bitcoin magical again',
    'https://techcrunch.com/2023/11/16/taproot-wizards-bitcoin-ordinals/',
    'TechCrunch',
    '2023-11-16',
    'B',
    'independent',
  ),
  source(
    'source:quantum-cats:theblock-series-a',
    'Taproot Wizards raises $30 million to expand OP_CAT functionality on Bitcoin',
    'https://www.theblock.co/post/338805/taproot-wizards-raises-30-million-to-expand-op_cat-functionality-on-bitcoin',
    'The Block',
    '2025-02-04',
    'B',
    'independent',
  ),
  source(
    'source:quantum-cats:theblock-floor',
    'Quantum Cats NFT floor price plunges 54% post-Taproot Wizards mint',
    'https://www.theblock.co/amp/post/349893/quantum-cats-nft-floor-price-plunges-54-post-taproot-wizards-mint',
    'The Block',
    '2025-04-09',
    'B',
    'independent',
  ),
  source(
    'source:quantum-cats:axios',
    "A Bitcoin NFT project is lobbying for the blockchain's next upgrade",
    'https://www.axios.com/2024/04/24/bitcoin-quantum-cats-nft-taproot-code',
    'Axios',
    '2024-04-24',
    'B',
    'independent',
  ),
  source(
    'source:quantum-cats:galaxy',
    'Top Stories of the Week — January 19, 2024',
    'https://www.galaxy.com/insights/research/top-stories-of-the-week-1-19-24/',
    'Galaxy Research',
    '2024-01-19',
    'B',
    'independent',
  ),
];

const sections = {
  what_it_is: {
    body: 'Quantum Cats is a fixed collection of 3,333 evolving Bitcoin Ordinals created by Taproot Wizards. The art and its changing states are built around a campaign to restore OP_CAT, a Bitcoin scripting operation that was disabled in 2010. Owning a Cat means owning the inscription and participating in the collection’s culture; it does not give the holder a vote over Bitcoin, a legal claim on Taproot Wizards, or the power to activate OP_CAT. The collection therefore works as both digital art and a public advocacy device, but those are different from contractual holder utility.',
    source_ids: ['source:quantum-cats:official', 'source:quantum-cats:decrypt-launch', 'source:quantum-cats:axios', 'source:quantum-cats:bip347'],
    evidence_locator: 'Official collection purpose, independent launch reporting, advocacy reporting and the BIP 347 specification.',
  },
  what_happened: {
    body: 'Taproot Wizards announced the collection in January 2024 after spending about $66,000 to inscribe roughly 10 MB of encrypted artwork and future states on Bitcoin. The one-of-one Genesis Cat sold at Sotheby’s for 6.31 BTC, reported as about $254,000. The public mint then suffered three technical delays, but all 3,000 public-sale Cats were claimed at 0.1 BTC each; CoinDesk described nearly $13 million of gross sales. In 2025, qualifying Cat holders received a one-time discount on the Taproot Wizards mint. The reported Cat floor then fell 54 percent around that event. In the 2026-08-03 CoinGecko snapshot, the collection had one reported sale in 24 hours, so that snapshot cannot establish a liquid market or a reliable collection-wide valuation.',
    source_ids: ['source:quantum-cats:decrypt-launch', 'source:quantum-cats:sothebys-genesis', 'source:quantum-cats:coindesk-genesis', 'source:quantum-cats:coindesk-mint', 'source:quantum-cats:theblock-floor', 'source:quantum-cats:coingecko'],
    evidence_locator: 'Dated inscription, auction, public-mint, holder-benefit, floor-price and current aggregator observations.',
  },
  why_this_outcome: {
    body: 'The launch succeeded at raising money and attention because it combined scarce on-chain art, a visible technical experiment, the Taproot Wizards brand and a concrete Bitcoin policy campaign. The evolving artwork made the OP_CAT argument easier to explain than a specification alone. Demand was also helped by expectations around the wider Taproot Wizards ecosystem, including the later discounted mint. That benefit was temporary: the sharp floor reset after the Wizards mint is consistent with some event-driven demand leaving once the discount had been used, although the cited reporting does not prove a single cause. The result is a culturally visible collection with thin current observed trading, not evidence of a failed project or a deeply liquid asset.',
    source_ids: ['source:quantum-cats:official', 'source:quantum-cats:decrypt-launch', 'source:quantum-cats:coindesk-mint', 'source:quantum-cats:theblock-floor', 'source:quantum-cats:coingecko'],
    evidence_locator: 'Observed collection design, sale outcome, later holder benefit, reported floor move and current trading snapshot.',
    note: 'Causal interpretation is bounded by the cited sequence; it does not attribute the floor move to one proven cause.',
  },
  strategic_choices: {
    body: 'Taproot Wizards tied the collection directly to OP_CAT instead of building a general Bitcoin art brand. It pre-inscribed encrypted future states and said the evolution schedule was predetermined, using Bitcoin itself as the storage and reveal layer. The team chose a premium fixed public price of 0.1 BTC and an allowlist-led sale; that captured substantial revenue but made the mint sensitive to Bitcoin prices and raised expectations for future value. It later connected Cats to the Taproot Wizards collection through a 50 percent mint discount for qualifying entangled pairs. These choices created a coherent campaign and strong launch economics, while also concentrating the collection’s meaning and some demand around one protocol debate and one operator ecosystem.',
    source_ids: ['source:quantum-cats:decrypt-launch', 'source:quantum-cats:galaxy', 'source:quantum-cats:coindesk-mint', 'source:quantum-cats:theblock-floor', 'source:quantum-cats:official'],
    evidence_locator: 'Technical design, sale structure, stated advocacy and the later holder-discount mechanism.',
    note: 'Trade-offs are analyst interpretation of documented choices; the sources do not quantify each choice’s causal effect.',
  },
  operating_model: {
    body: 'Taproot Wizards develops the art, publishes the campaign and maintains the public collection experience. Bitcoin stores the inscriptions, while collectors control the satoshis carrying their Cats and use third-party marketplaces for secondary trades. The operator said the future art states were encrypted and pre-inscribed, limiting its ability to change individual outcomes after launch, but buyers still rely on Taproot Wizards for communication, interpretation and ecosystem activity. BIP authors and Bitcoin Core contributors control neither the collection nor its holder benefits, and Cat holders do not control the BIP process. Corporate fundraising supports the broader Taproot Wizards company and OP_CAT work; it is not collection treasury revenue owed to holders.',
    source_ids: ['source:quantum-cats:official', 'source:quantum-cats:decrypt-launch', 'source:quantum-cats:galaxy', 'source:quantum-cats:techcrunch-seed', 'source:quantum-cats:theblock-series-a', 'source:quantum-cats:bip347'],
    evidence_locator: 'Operator descriptions, technical reporting, corporate funding reports and the independent protocol proposal record.',
  },
  token_and_value_capture: {
    body: 'The reviewed record does not establish a separate Quantum Cats fungible token, an equity interest, a revenue share or a governance right. Collection value is captured first through the primary sale and then by holders only if they can sell their individual inscriptions or use a stated benefit. The 3,000-piece public sale at 0.1 BTC implies about 300 BTC of gross proceeds; CoinDesk reported nearly $13 million at the time. The Genesis Cat auction was a separate one-of-one sale. Taproot Wizards later raised $7.5 million and $30 million as company financing, which must not be counted as value accruing to Cat holders. Audited collection costs, profit, royalties, marketplace fees and the distribution of proceeds were not found in the reviewed sources.',
    source_ids: ['source:quantum-cats:coindesk-mint', 'source:quantum-cats:sothebys-genesis', 'source:quantum-cats:techcrunch-seed', 'source:quantum-cats:theblock-series-a', 'source:quantum-cats:theblock-floor'],
    evidence_locator: 'Public mint price and count, separate auction record, corporate financing reports and documented one-time holder benefit.',
  },
  counterfactual: {
    body: 'A lower mint price or a simpler sale system could have reduced the launch failures and the amount of capital buyers put at risk, but it also would have reduced primary-sale revenue and may have weakened the premium positioning. More repeatable holder benefits or a product independent of OP_CAT could give collectors reasons to remain active after a one-time mint discount, yet that would change the project from a focused advocacy collection into a broader membership program. A clearer public ledger of royalties, spending and future benefits would make value capture easier to evaluate. These are plausible alternatives, not measured results; the available record does not show what demand or floor price would have been under any of them.',
    source_ids: ['source:quantum-cats:coindesk-mint', 'source:quantum-cats:theblock-floor', 'source:quantum-cats:official', 'source:quantum-cats:techcrunch-seed'],
    evidence_locator: 'Observed mint friction, pricing, one-time utility and advocacy focus used to bound the alternatives.',
    note: 'Counterfactual analysis only; no causal estimate is available.',
  },
  risks_and_unknowns: {
    body: 'The central risk is narrative dependence: if OP_CAT loses momentum, is rejected or becomes less culturally important, the collection loses part of the story that differentiates it. BIP 347 being marked “Complete” means the specification is complete; it does not mean OP_CAT is active on Bitcoin. The reviewed Bitcoin Core master interpreter still treats OP_CAT as disabled. Market evidence is also weak: CoinGecko showed one 24-hour sale, and a listed floor plus an aggregator market-cap estimate is not an executable bid, broad liquidity or realized collection valuation. Other unknowns include holder concentration beyond the reported address count, current royalties, repeat benefits, reveal timing, legal and intellectual-property terms, operator commitments and the age of CoinGecko’s underlying marketplace data.',
    source_ids: ['source:quantum-cats:bip347', 'source:quantum-cats:bitcoin-core', 'source:quantum-cats:coingecko', 'source:quantum-cats:official', 'source:quantum-cats:theblock-floor'],
    evidence_locator: 'Current specification status, current Bitcoin Core code, limited market snapshot and operator/market records.',
  },
  lifecycle: {
    body: 'Taproot Wizards raised a reported $7.5 million seed round in November 2023 and announced Quantum Cats in January 2024. Genesis Cat sold on 2024-01-22. After three delays, the public mint finished on 2024-02-05. The collection then served as a continuing OP_CAT campaign while the proposal entered the BIP process. Taproot Wizards raised another reported $30 million in February 2025 for broader OP_CAT work. A discounted Taproot Wizards mint gave qualifying Cat holders a concrete but one-time benefit in March 2025, followed by a reported floor reset. BIP 347 was marked specification-complete in March 2026, while OP_CAT remained disabled in the reviewed Bitcoin Core code. The collection website and operator remain active; current secondary-market depth remains unproven.',
    source_ids: ['source:quantum-cats:techcrunch-seed', 'source:quantum-cats:decrypt-launch', 'source:quantum-cats:coindesk-genesis', 'source:quantum-cats:coindesk-mint', 'source:quantum-cats:axios', 'source:quantum-cats:theblock-series-a', 'source:quantum-cats:theblock-floor', 'source:quantum-cats:bip347', 'source:quantum-cats:bitcoin-core', 'source:quantum-cats:official', 'source:quantum-cats:taproot-wizards'],
    evidence_locator: 'Dated funding, launch, auction, mint, benefit, protocol and current-operating records.',
  },
  outlook_and_watch: {
    body: 'The base case is that Quantum Cats remains an active but thinly traded cultural and advocacy collection. The upside case requires a real OP_CAT activation path, a meaningful new use for Cats, new art states or sustained collector activity that is visible in more than a few sales. The downside case is gradual loss of attention if the protocol campaign stalls and no repeat reason to own a Cat appears. Watch released Bitcoin Core versions and activation proposals rather than the BIP label alone; also watch 30- and 90-day sales, executable bids, buyer and seller counts, holder concentration, reveal events, operator communications, repeat holder benefits and any documented royalties. Do not use a single floor listing, an aggregator market cap or the price of another Taproot Wizards asset as a proxy for Cat liquidity or holder returns.',
    source_ids: ['source:quantum-cats:bip347', 'source:quantum-cats:bitcoin-core', 'source:quantum-cats:coingecko', 'source:quantum-cats:official', 'source:quantum-cats:taproot-wizards', 'source:quantum-cats:theblock-floor'],
    evidence_locator: 'Current protocol, operator and limited market observations defining measurable future signals.',
    note: 'Scenario analysis and watch list, not a price forecast.',
  },
};

const metricSpecs = [
  {
    key: 'floor-btc', dimension: 'floor_price', label: 'Listed floor', value: 0.01044696, unit: 'btc', currency: 'BTC',
    window: { start: null, end: '2026-08-03T17:00:05Z', definition: 'point_in_time' },
    method: 'CoinGecko marketplace aggregate', scope: { collection: 'Quantum Cats', chain: 'Bitcoin Ordinals' },
    source_ids: ['source:quantum-cats:coingecko'], evidence_locator: 'floor_price.native_currency field in the response retrieved at the HTTP Date timestamp.',
    quality_flags: ['listing_not_executable_bid', 'underlying_marketplace_timestamp_unavailable', 'not_liquidity_measure'],
  },
  {
    key: 'market-cap-btc', dimension: 'market_cap', label: 'Aggregator-estimated collection market cap', value: 34.82, unit: 'btc', currency: 'BTC',
    window: { start: null, end: '2026-08-03T17:00:05Z', definition: 'point_in_time' },
    method: 'CoinGecko collection estimate', scope: { collection: 'Quantum Cats', chain: 'Bitcoin Ordinals' },
    source_ids: ['source:quantum-cats:coingecko'], evidence_locator: 'market_cap.native_currency field in the retrieved API response.',
    quality_flags: ['aggregator_estimate', 'not_realized_valuation', 'underlying_marketplace_timestamp_unavailable'],
  },
  {
    key: 'volume-24h-btc', dimension: 'secondary_volume', label: 'Reported secondary volume, rolling 24 hours', value: 0.010447, unit: 'btc', currency: 'BTC',
    window: { start: null, end: '2026-08-03T17:00:05Z', definition: 'rolling_24h' },
    method: 'CoinGecko marketplace aggregate', scope: { collection: 'Quantum Cats', chain: 'Bitcoin Ordinals' },
    source_ids: ['source:quantum-cats:coingecko'], evidence_locator: 'volume_24h.native_currency field in the retrieved API response.',
    quality_flags: ['one_reported_sale', 'thin_observation', 'underlying_marketplace_timestamp_unavailable'],
  },
  {
    key: 'sales-24h', dimension: 'sales', label: 'Reported sales, rolling 24 hours', value: 1, unit: 'count', currency: null,
    window: { start: null, end: '2026-08-03T17:00:05Z', definition: 'rolling_24h' },
    method: 'CoinGecko marketplace aggregate', scope: { collection: 'Quantum Cats', chain: 'Bitcoin Ordinals' },
    source_ids: ['source:quantum-cats:coingecko'], evidence_locator: 'one_day_sales field in the retrieved API response.',
    quality_flags: ['thin_observation', 'not_liquidity_measure', 'underlying_marketplace_timestamp_unavailable'],
  },
  {
    key: 'holders', dimension: 'holders', label: 'Unique holder addresses', value: 1638, unit: 'addresses', currency: null,
    window: { start: null, end: '2026-08-03T17:00:05Z', definition: 'point_in_time' },
    method: 'CoinGecko marketplace aggregate', scope: { collection: 'Quantum Cats', chain: 'Bitcoin Ordinals' },
    source_ids: ['source:quantum-cats:coingecko'], evidence_locator: 'number_of_unique_addresses field in the retrieved API response.',
    quality_flags: ['addresses_not_people', 'underlying_marketplace_timestamp_unavailable'],
  },
  {
    key: 'supply', dimension: 'supply', label: 'Collection supply', value: 3333, unit: 'inscriptions', currency: null,
    window: { start: null, end: AS_OF, definition: 'fixed_collection_count' },
    method: 'Official collection count corroborated by CoinGecko', scope: { collection: 'Quantum Cats', chain: 'Bitcoin Ordinals' },
    source_ids: ['source:quantum-cats:official', 'source:quantum-cats:coingecko'], evidence_locator: 'Official 3,333 collection description and total_supply API field.',
    quality_flags: [],
  },
  {
    key: 'mint-gross-usd', dimension: 'mint_raise', label: 'Reported public-mint gross proceeds', value: 13000000, unit: 'usd', currency: 'USD',
    window: { start: '2024-02-05', end: '2024-02-05', definition: 'public_mint_event' },
    method: 'Contemporaneous press report of 3,000 sales at 0.1 BTC', scope: { collection: 'Quantum Cats', sale: 'public mint only' },
    source_ids: ['source:quantum-cats:coindesk-mint'], evidence_locator: 'CoinDesk public-sale count, fixed BTC price and “nearly $13 million” report.',
    quality_flags: ['reported_approximation', 'gross_not_net', 'public_sale_not_total_supply'],
  },
];

const eventSpecs = [
  { key: 'seed', type: 'corporate_funding', date: '2023-11-16', description: 'Taproot Wizards raised a reported $7.5 million seed round; this was company financing, not collection-holder value capture.', source_ids: ['source:quantum-cats:techcrunch-seed'], evidence_locator: 'TechCrunch funding report.' },
  { key: 'announcement', type: 'collection_launch', date: '2024-01-12', description: 'Quantum Cats was announced as a 3,333-piece evolving Ordinals collection supporting OP_CAT.', source_ids: ['source:quantum-cats:decrypt-launch'], evidence_locator: 'Decrypt collection launch report.' },
  { key: 'genesis-auction', type: 'auction', date: '2024-01-22', description: 'The one-of-one Genesis Cat sold for 6.31 BTC, reported as about $254,000, at Sotheby’s.', source_ids: ['source:quantum-cats:sothebys-genesis', 'source:quantum-cats:coindesk-genesis'], evidence_locator: 'Sotheby’s lot record and CoinDesk sale report.' },
  { key: 'public-mint', type: 'primary_sale', date: '2024-02-05', description: 'After three technical delays, all 3,000 public-sale Cats were claimed at 0.1 BTC each.', source_ids: ['source:quantum-cats:coindesk-mint'], evidence_locator: 'CoinDesk mint completion report.' },
  { key: 'bip-progress', type: 'protocol_advocacy', date: '2024-04-24', description: 'The OP_CAT proposal obtained a BIP number; proposal progress did not activate the opcode.', source_ids: ['source:quantum-cats:axios', 'source:quantum-cats:bip347'], evidence_locator: 'Axios advocacy report and BIP 347 record.' },
  { key: 'series-a', type: 'corporate_funding', date: '2025-02-04', description: 'Taproot Wizards raised a reported $30 million to expand broader OP_CAT work; this was company financing.', source_ids: ['source:quantum-cats:theblock-series-a'], evidence_locator: 'The Block funding report.' },
  { key: 'wizard-discount', type: 'holder_benefit', date: '2025-03-25', description: 'Qualifying entangled Cat-pair holders received a 50 percent discount on the Taproot Wizards mint.', source_ids: ['source:quantum-cats:theblock-floor'], evidence_locator: 'The Block description of the holder discount and mint timing.' },
  { key: 'floor-reset', type: 'market_observation', date: '2025-04-05', description: 'The Block reported a floor around 0.04 BTC after a 54 percent decline around the Wizards mint event.', source_ids: ['source:quantum-cats:theblock-floor'], evidence_locator: 'The Block floor observations from March 30 through April 5.' },
  { key: 'bip-complete', type: 'specification_status', date: '2026-03-01', description: 'BIP 347 was marked specification-complete; that label did not itself activate OP_CAT.', source_ids: ['source:quantum-cats:bip347', 'source:quantum-cats:bitcoin-core'], evidence_locator: 'BIP changelog and current Bitcoin Core disabled-opcode branch.' },
  { key: 'current-observation', type: 'market_observation', date: '2026-08-03', description: 'CoinGecko reported one sale in the preceding 24 hours; current collection-wide liquidity remained unproven.', source_ids: ['source:quantum-cats:coingecko'], evidence_locator: 'CoinGecko API response retrieved at 2026-08-03T17:00:05Z.' },
];

const sectionClaims = Object.entries(sections).map(([key, section]) => pendingClaim(
  `claim:quantum-cats:section:${key}`,
  `analysis.sections.${key}.body`,
  section.source_ids,
  section.evidence_locator,
  section.note || null,
));

const metrics = metricSpecs.map((metric) => ({
  id: `metric:quantum-cats:${metric.key}:${metric.window.end}`,
  dimension: metric.dimension,
  label: metric.label,
  value: metric.value,
  unit: metric.unit,
  currency: metric.currency,
  window: metric.window,
  as_of: metric.window.end,
  method: metric.method,
  scope: metric.scope,
  formula: null,
  raw_input_ids: [],
  claim_ids: [`claim:quantum-cats:metric:${metric.key}`],
  quality_flags: metric.quality_flags,
}));

const events = eventSpecs.map((event) => ({
  id: `event:quantum-cats:${event.key}`,
  type: event.type,
  date: event.date,
  description: event.description,
  claim_ids: [`claim:quantum-cats:event:${event.key}`],
}));

export const profile = {
  schema: 'chaindump-entity-profile',
  version: 1,
  identity: {
    id: 'ordinals_collection:quantum-cats',
    type: 'ordinals_collection',
    slug: 'quantum-cats',
    name: 'Quantum Cats',
    aliases: [],
  },
  classification: {
    subtype: 'evolving Ordinals art and protocol-advocacy collection',
    tags: ['bitcoin_ordinals', 'evolving_art', 'op_cat_advocacy', 'pfp_collection'],
    chains: ['Bitcoin Ordinals'],
    jurisdictions: [],
  },
  status: {
    operating_state: 'operating',
    as_of: AS_OF,
    claim_ids: ['claim:quantum-cats:status'],
  },
  outcome: {
    label: 'middling_declining',
    as_of: AS_OF,
    rule_id: 'nft-lifecycle-evidence-v1',
    confidence: 'medium',
    claim_ids: ['claim:quantum-cats:outcome'],
  },
  analysis: {
    sections: Object.fromEntries(Object.entries(sections).map(([key, section]) => [key, {
      body: section.body,
      as_of: AS_OF,
      claim_ids: [`claim:quantum-cats:section:${key}`],
    }])),
  },
  metrics,
  events,
  sources,
  claims: [
    pendingClaim(
      'claim:quantum-cats:status',
      'status.operating_state',
      ['source:quantum-cats:official', 'source:quantum-cats:taproot-wizards', 'source:quantum-cats:coingecko'],
      'Current operator sites and current market-aggregator response.',
    ),
    pendingClaim(
      'claim:quantum-cats:outcome',
      'outcome.label',
      ['source:quantum-cats:coindesk-mint', 'source:quantum-cats:theblock-floor', 'source:quantum-cats:coingecko', 'source:quantum-cats:official'],
      'Strong primary-sale outcome, later floor reset, thin current observed trading and active operator presence.',
      'Analyst lifecycle classification; it is not a price forecast or a claim that the collection has failed.',
    ),
    ...sectionClaims,
    ...metricSpecs.map((metric) => pendingClaim(
      `claim:quantum-cats:metric:${metric.key}`,
      `metrics[metric:quantum-cats:${metric.key}:${metric.window.end}].value`,
      metric.source_ids,
      metric.evidence_locator,
      metric.quality_flags.length ? `Limits: ${metric.quality_flags.join(', ')}.` : null,
    )),
    ...eventSpecs.map((event) => pendingClaim(
      `claim:quantum-cats:event:${event.key}`,
      `events[event:quantum-cats:${event.key}]`,
      event.source_ids,
      event.evidence_locator,
    )),
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
    confidence: 'medium',
    unsourced_fields: [
      'audited_collection_costs',
      'audited_collection_profit',
      'current_royalties',
      'executable_bid_depth',
      'repeat_holder_benefits',
      'underlying_marketplace_observation_time',
    ],
  },
  extensions: {
    legacy_origin: 'nft_collections',
    methodology_notes: [
      'freshness.last_reviewed_at records evidence assembly and source verification, not human approval; every claim remains pending until an editor reviews it.',
      'BIP 347 specification status is kept separate from activation in released Bitcoin Core.',
      'Advocacy, a past mint discount and corporate financing are kept separate from contractual holder utility and value capture.',
      'A listing floor, one reported sale and an aggregator market-cap estimate are not treated as liquidity or realized valuation.',
      'CoinGecko was retrieved at a current HTTP timestamp, but its underlying marketplace observation time was unavailable and remains a stated limitation.',
    ],
  },
};

export const document = {
  schema: 'chaindump-research-profile-document',
  version: 1,
  researched_at: EVIDENCE_VERIFIED_AT,
  generated_migration: '0072_quantum_cats_profile.sql',
  entity: {
    type: 'ordinals_collection',
    slug: 'quantum-cats',
    status: 'middling',
    canonical_profile: profile,
    legacy: {
      analysis: 'Quantum Cats achieved a strong, technically troubled primary sale and made OP_CAT advocacy culturally visible. Its later one-time holder benefit did not establish repeat utility, and current observed trading is too sparse for a broad liquidity or valuation conclusion.',
      business: 'Taproot Wizards creates and communicates an evolving Bitcoin Ordinals art collection; holders custody inscriptions and trade through third-party marketplaces.',
      benefits: 'Ownership of the inscription, evolving collection art and a documented past discount on the Taproot Wizards mint; no continuing contractual utility was established in the reviewed sources.',
      founder_engagement: 'Taproot Wizards remains active and continues to frame the collection around OP_CAT advocacy.',
      outlook: 'Active cultural and advocacy collection with thin current observed trading. Watch protocol activation, 30- and 90-day sales, executable bids, holder activity, reveals and repeat benefits.',
      current_observation: 'CoinGecko reported one sale in the prior 24 hours at 2026-08-03T17:00:05Z; this does not establish liquidity or a collection-wide valuation.',
    },
  },
};

export function renderMigration(value = document) {
  const payload = JSON.stringify(value, null, 2).replaceAll("'", "''");
  return `-- Quantum Cats source-linked Ordinals profile, researched 2026-08-03 and awaiting human review.
-- The canonical JSON document is embedded so clean-database replay is deterministic.
-- Existing legacy evidence structures are preserved; canonical consumers use canonical_profile.

DROP TABLE IF EXISTS _quantum_cats_profile_0072;

CREATE TABLE _quantum_cats_profile_0072 (
  slug TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  legacy TEXT NOT NULL CHECK (json_valid(legacy)),
  canonical_profile TEXT NOT NULL CHECK (json_valid(canonical_profile))
);

-- canonical-payload-start
WITH research_document(payload) AS (
  VALUES ('${payload}')
)
INSERT INTO _quantum_cats_profile_0072 (slug, status, legacy, canonical_profile)
SELECT
  json_extract(payload, '$.entity.slug'),
  json_extract(payload, '$.entity.status'),
  json_extract(payload, '$.entity.legacy'),
  json_extract(payload, '$.entity.canonical_profile')
FROM research_document;
-- canonical-payload-end

UPDATE nft_collections AS collection
SET
  status = staged.status,
  profile = json_set(
    COALESCE(collection.profile, '{}'),
    '$.canonical_profile', json(staged.canonical_profile)
  ),
  updated_at = '2026-08-03'
FROM _quantum_cats_profile_0072 AS staged
WHERE collection.slug = staged.slug;

DROP TABLE _quantum_cats_profile_0072;
`;
}

function writeOutputs() {
  const documentPath = fileURLToPath(new URL('../docs/quantum-cats-profile-2026-08-03.json', import.meta.url));
  const migrationPath = fileURLToPath(new URL('../migrations/0072_quantum_cats_profile.sql', import.meta.url));
  writeFileSync(documentPath, `${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(migrationPath, renderMigration());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) writeOutputs();

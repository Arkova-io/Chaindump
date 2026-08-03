import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const ACCESSED_AT = '2026-08-03T18:05:00Z';
const AS_OF = '2026-08-03';
const NEXT_REVIEW_AT = '2026-08-10T18:05:00Z';

const sid = (slug, key) => `source:${slug}:${key}`;

function source(slug, key, title, url, publisher, publishedAt, tier, role, details = {}) {
  return {
    id: sid(slug, key),
    title,
    url,
    publisher,
    published_at: publishedAt,
    published_at_precision: details.published_at_precision || (publishedAt ? 'day' : null),
    accessed_at: ACCESSED_AT,
    archive_url: details.archive_url || null,
    tier,
    role,
    access_state: details.access_state || 'reachable',
    checked_at: ACCESSED_AT,
    access_final_url: details.final_url || url,
    content_hash: null,
    independence_group: details.independence_group || publisher,
    access_method: details.access_method || 'direct_http',
    direct_http_status: details.direct_http_status || 200,
  };
}

function pendingClaim(id, fieldPath, sourceIds, evidenceLocator, assertion, supportDirection = 'supports', note = null) {
  return {
    id,
    field_path: fieldPath,
    source_ids: sourceIds,
    evidence_locator: evidenceLocator,
    support_direction: supportDirection,
    assertion,
    note,
    review: { state: 'pending', reviewer: null, reviewed_at: null },
  };
}

function metric(slug, spec) {
  const id = `metric:${slug}:${spec.key}:${spec.as_of}`;
  return {
    id,
    dimension: spec.dimension,
    label: spec.label,
    value: spec.value,
    unit: spec.unit,
    currency: spec.currency || null,
    window: spec.window,
    as_of: spec.as_of,
    method: spec.method,
    scope: spec.scope,
    formula: spec.formula || null,
    raw_input_ids: [],
    claim_ids: [`claim:${slug}:metric:${spec.key}`],
    quality_flags: spec.quality_flags || [],
    headline: spec.headline !== false,
  };
}

function event(slug, spec) {
  return {
    id: `event:${slug}:${spec.key}`,
    type: spec.type,
    date: spec.date,
    date_precision: spec.date_precision || 'day',
    description: spec.description,
    claim_ids: [`claim:${slug}:event:${spec.key}`],
  };
}

function buildProfile(spec) {
  const sectionClaims = [];
  const sections = Object.fromEntries(Object.entries(spec.sections).map(([sectionKey, section]) => {
    const claimIds = section.claims.map((claimSpec) => {
      const id = `claim:${spec.slug}:section:${sectionKey}:${claimSpec.key}`;
      sectionClaims.push(pendingClaim(
        id,
        `analysis.sections.${sectionKey}.body#${claimSpec.key}`,
        claimSpec.sources.map((key) => sid(spec.slug, key)),
        claimSpec.locator,
        claimSpec.assertion,
        claimSpec.direction || 'supports',
        claimSpec.note || null,
      ));
      return id;
    });
    return [sectionKey, { body: section.body, as_of: section.as_of || AS_OF, claim_ids: claimIds }];
  }));

  const metrics = (spec.metrics || []).map((item) => metric(spec.slug, item));
  const events = (spec.events || []).map((item) => event(spec.slug, item));
  const statusClaim = pendingClaim(
    `claim:${spec.slug}:status`,
    'status.operating_state',
    spec.status.sources.map((key) => sid(spec.slug, key)),
    spec.status.locator,
    spec.status.assertion,
  );
  const outcomeClaim = pendingClaim(
    `claim:${spec.slug}:outcome`,
    'outcome.label',
    spec.outcome.sources.map((key) => sid(spec.slug, key)),
    spec.outcome.locator,
    spec.outcome.assertion,
    'supports',
    spec.outcome.note || 'Analyst lifecycle classification; it is not a price forecast.',
  );

  return {
    schema: 'chaindump-entity-profile',
    version: 1,
    identity: {
      id: `${spec.type}:${spec.slug}`,
      type: spec.type,
      slug: spec.slug,
      name: spec.name,
      aliases: spec.aliases || [],
    },
    classification: {
      subtype: spec.subtype,
      tags: spec.tags,
      chains: spec.chains,
      jurisdictions: spec.jurisdictions || [],
    },
    status: {
      operating_state: spec.status.value,
      as_of: AS_OF,
      claim_ids: [statusClaim.id],
    },
    outcome: {
      label: spec.outcome.value,
      as_of: AS_OF,
      rule_id: 'nft-lifecycle-evidence-v1',
      confidence: spec.outcome.confidence,
      claim_ids: [outcomeClaim.id],
    },
    analysis: { sections },
    metrics,
    events,
    sources: spec.sources,
    claims: [
      statusClaim,
      outcomeClaim,
      ...sectionClaims,
      ...(spec.metrics || []).map((item) => pendingClaim(
        `claim:${spec.slug}:metric:${item.key}`,
        `metrics[metric:${spec.slug}:${item.key}:${item.as_of}].value`,
        item.sources.map((key) => sid(spec.slug, key)),
        item.locator,
        item.assertion,
        'supports',
        item.quality_flags?.length ? `Limits: ${item.quality_flags.join(', ')}.` : null,
      )),
      ...(spec.events || []).map((item) => pendingClaim(
        `claim:${spec.slug}:event:${item.key}`,
        `events[event:${spec.slug}:${item.key}]`,
        item.sources.map((key) => sid(spec.slug, key)),
        item.locator,
        item.assertion,
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
      confidence: spec.outcome.confidence,
      unsourced_fields: spec.unknowns,
    },
    extensions: {
      legacy_origin: 'nft_collections',
      editorial_guardrail: spec.guardrail,
      methodology_notes: [
        'Source verification and evidence assembly are complete; every claim remains pending until a human editor reviews it.',
        'Collection activity, holder rights, operator revenue, related-token economics and company financing are kept separate.',
        ...(spec.methodologyNotes || []),
      ],
    },
  };
}

const baycSources = [
  source('bored-ape-yacht-club', 'founding', 'The Birth of the Bored Ape Yacht Club', 'https://boredapeyachtclub.com/activations/bayc-founding', 'Bored Ape Yacht Club / Yuga Labs', '2021-04-23', 'B', 'primary', { independence_group: 'yuga_labs' }),
  source('bored-ape-yacht-club', 'license', 'BAYC License', 'https://boredapeyachtclub.com/bayc-license', 'Bored Ape Yacht Club / Yuga Labs', null, 'B', 'primary', { independence_group: 'yuga_labs' }),
  source('bored-ape-yacht-club', 'activations', 'Bored Ape Yacht Club Activations', 'https://boredapeyachtclub.com/activations', 'Bored Ape Yacht Club / Yuga Labs', null, 'B', 'primary', { independence_group: 'yuga_labs' }),
  source('bored-ape-yacht-club', 'essentials', 'BAYC Essentials', 'https://boredapeyachtclub.com/activations/bayc-essentials', 'Bored Ape Yacht Club / Yuga Labs', '2025-12-01', 'B', 'primary', { independence_group: 'yuga_labs', published_at_precision: 'month' }),
  source('bored-ape-yacht-club', 'apechain', 'ApeChain Launch', 'https://boredapeyachtclub.com/activations/apechain-launch', 'Bored Ape Yacht Club / Yuga Labs', '2024-10-01', 'B', 'primary', { independence_group: 'yuga_labs', published_at_precision: 'month' }),
  source('bored-ape-yacht-club', 'apefest-2025', 'ApeFest 2025: Las Vegas', 'https://boredapeyachtclub.com/activations/apefest-2025-las-vegas', 'Bored Ape Yacht Club / Yuga Labs', '2025-10-31', 'B', 'primary', { independence_group: 'yuga_labs' }),
  source('bored-ape-yacht-club', 'apefest-2026', 'ApeFest 2026', 'https://www.apefest.com/', 'Bored Ape Yacht Club / Yuga Labs', null, 'B', 'primary', { independence_group: 'yuga_labs' }),
  source('bored-ape-yacht-club', 'apecoin', 'ApeCoin', 'https://apecoin.com/', 'ApeCoin', null, 'B', 'primary', { independence_group: 'apecoin_ecosystem' }),
  source('bored-ape-yacht-club', 'coindesk-rebound', 'Bored Ape NFTs Are Finally Making a Comeback', 'https://www.coindesk.com/business/2026/05/10/bored-ape-nfts-are-finally-making-a-comeback-as-crypto-traders-rediscover-their-appetite-for-risk', 'CoinDesk', '2026-05-10', 'B', 'independent', { independence_group: 'coindesk' }),
  source('bored-ape-yacht-club', 'coingecko', 'Bored Ape Yacht Club market data API', 'https://api.coingecko.com/api/v3/nfts/bored-ape-yacht-club', 'CoinGecko', null, 'B', 'aggregator', { independence_group: 'coingecko', access_method: 'json_api' }),
];

const bayc = buildProfile({
  slug: 'bored-ape-yacht-club',
  name: 'Bored Ape Yacht Club',
  type: 'nft_collection',
  subtype: 'profile-picture membership and intellectual-property collection',
  tags: ['ethereum', 'pfp', 'membership', 'holder_ip', 'yuga_labs'],
  chains: ['Ethereum'],
  sources: baycSources,
  status: {
    value: 'operating', sources: ['activations', 'apefest-2026'],
    locator: 'Current activations index and ApeFest 2026 landing page observed on August 3, 2026.',
    assertion: 'BAYC remained an actively operated collection and membership brand on August 3, 2026.',
  },
  outcome: {
    value: 'operating_mixed', confidence: 'medium', sources: ['activations', 'coindesk-rebound', 'coingecko'],
    locator: 'Current operator activity, CoinDesk May 2026 market report and CoinGecko August 3 snapshot.',
    assertion: 'BAYC showed continuing brand operation and a dated market rebound, while current durable demand and business economics remained unproven.',
    note: 'Mixed refers to active execution plus incomplete durability evidence; it does not predict price.',
  },
  sections: {
    what_it_is: {
      body: 'Bored Ape Yacht Club is a 10,000-piece Ethereum avatar collection released by Yuga Labs in April 2021. The NFT is also used as a club identity. The current license gives an owner personal rights and broad commercial-use rights in the art attached to that owner’s Ape; it does not make the owner a shareholder in Yuga Labs or give a claim on ApeCoin or ApeChain revenue.',
      claims: [
        { key: 'collection', assertion: 'BAYC is a 10,000-piece collection released on Ethereum in April 2021.', sources: ['founding', 'license'], locator: 'Founding page opening history and BAYC License “What is the Bored Ape Yacht Club?” paragraph.' },
        { key: 'membership', assertion: 'Yuga presents BAYC ownership as club membership and identity.', sources: ['founding', 'activations'], locator: 'Founding page club framing and current activation index.' },
        { key: 'rights', assertion: 'The current license grants personal and broad commercial-use rights in the associated Ape art.', sources: ['license'], locator: 'BAYC License sections “Personal Use” and “Commercial Use”.' },
        { key: 'no-equity', assertion: 'The reviewed license does not grant Yuga equity or a revenue claim.', sources: ['license'], locator: 'BAYC License grant language; no equity or revenue-share grant appears.', direction: 'context_only', note: 'Legal interpretation is limited to the reviewed contract text.' },
      ],
    },
    what_happened: {
      body: 'Yuga released the collection on April 23, 2021 and later built recurring events, merchandise and digital experiences around it. A fifth ApeFest concluded in Las Vegas in 2025, BAYC Essentials opened as an always-on store that December, and a 2026 ApeFest page was live when checked. CoinDesk reported a sharp floor-price rebound in May 2026; the August 3 CoinGecko snapshot still represented only six reported sales over 24 hours, so neither item proves broad or durable demand.',
      claims: [
        { key: 'launch', assertion: 'The collection release date was April 23, 2021.', sources: ['founding'], locator: 'Founding page sentence stating 10,000 Apes were released on April 23, 2021.' },
        { key: 'apefest', assertion: 'The fifth ApeFest concluded in Las Vegas in 2025.', sources: ['apefest-2025'], locator: 'ApeFest 2025 recap opening paragraph.' },
        { key: 'store', assertion: 'BAYC Essentials launched as an always-on retail store in December 2025.', sources: ['essentials'], locator: 'BAYC Essentials page launch description.' },
        { key: 'planned-event', assertion: 'The current ApeFest page advertised 2026 ticketing rather than documenting a completed event.', sources: ['apefest-2026'], locator: 'ApeFest 2026 landing-page headline and ticketing language.' },
        { key: 'rebound', assertion: 'CoinDesk reported that the BAYC floor moved from roughly 5 ETH to above 10 ETH during a month in May 2026.', sources: ['coindesk-rebound'], locator: 'CoinDesk May 10, 2026 market-move paragraphs.' },
        { key: 'sales-snapshot', assertion: 'CoinGecko returned six 24-hour sales on August 3, 2026.', sources: ['coingecko'], locator: 'API fields one_day_sales and volume_24h in the response retrieved at 2026-08-03T18:05:00Z.' },
      ],
    },
    why_this_outcome: {
      body: 'BAYC’s staying power is consistent with three reinforcing choices: a recognizable fixed cohort, usable holder IP and repeated reasons for members to gather or display the brand. Yuga has continued to ship activations instead of leaving the collection as static art. That mechanism plausibly supports attention, but the reviewed sources do not isolate whether events, licensing, speculation or the wider Yuga ecosystem caused the 2026 price rebound.',
      claims: [
        { key: 'cohort', assertion: 'A fixed collection and shared visual identity created a legible membership cohort.', sources: ['founding'], locator: 'Founding page collection and club description.', direction: 'context_only', note: 'Mechanism inference, not a measured causal effect.' },
        { key: 'usable-ip', assertion: 'The license permits holder commercial use of associated art.', sources: ['license'], locator: 'BAYC License “Commercial Use” section.' },
        { key: 'repeat-activation', assertion: 'Yuga continued to publish recurring physical and digital BAYC activations through 2026.', sources: ['activations', 'apefest-2025', 'apefest-2026'], locator: 'Current activation index, completed 2025 event recap and 2026 landing page.' },
        { key: 'cause-limit', assertion: 'Available evidence does not isolate the cause of the reported 2026 market rebound.', sources: ['coindesk-rebound', 'coingecko'], locator: 'CoinDesk attributes renewed risk appetite and community activity but does not provide causal identification; CoinGecko is a point snapshot.', direction: 'context_only' },
      ],
    },
    strategic_choices: {
      body: 'Yuga made the Ape both a scarce avatar and a membership credential, then allowed owners to commercialize their individual character. It extended the brand through events, retail, games and collaborations, while also launching ApeChain for the broader APE ecosystem. That widened the number of ways people could encounter BAYC, but it also made attribution harder: activity in APE, ApeChain or another Yuga product is not automatically value created for BAYC holders.',
      claims: [
        { key: 'membership-design', assertion: 'Yuga paired scarce avatar ownership with club membership.', sources: ['founding'], locator: 'Founding page collection and membership framing.' },
        { key: 'commercial-license', assertion: 'Yuga chose a license that permits broad commercial use by the current NFT owner.', sources: ['license'], locator: 'BAYC License “Commercial Use” section.' },
        { key: 'brand-extension', assertion: 'BAYC extended into events, retail, games and collaborations.', sources: ['activations', 'essentials', 'apefest-2025'], locator: 'Activation index, BAYC Essentials launch page and ApeFest 2025 recap.' },
        { key: 'apechain-boundary', assertion: 'ApeChain launched as a dedicated chain for the wider APE ecosystem.', sources: ['apechain', 'apecoin'], locator: 'ApeChain Launch page and ApeCoin site ecosystem description.' },
      ],
    },
    operating_model: {
      body: 'Yuga Labs operates the brand, license, event program and official experiences. Owners custody and trade the Ethereum NFTs through wallets and third-party markets; they may build around their assigned art subject to the license. ApeCoin and ApeChain are adjacent infrastructure with separate governance and economics. Public pages show an active program, but they do not disclose BAYC-attributable revenue, costs, staffing or holder-retention data.',
      claims: [
        { key: 'operator', assertion: 'Yuga Labs operates BAYC’s official brand surfaces and programs.', sources: ['license', 'activations'], locator: 'License issuer and current official activation index.' },
        { key: 'owner-control', assertion: 'The license conditions rights on ownership of the underlying NFT.', sources: ['license'], locator: 'BAYC License ownership and grant provisions.' },
        { key: 'adjacent-infrastructure', assertion: 'APE is used as ApeChain gas and is described as an ecosystem token rather than a BAYC share.', sources: ['apecoin', 'apechain'], locator: 'ApeCoin site token description and ApeChain launch page.' },
        { key: 'financial-gap', assertion: 'The reviewed operator pages do not publish BAYC-attributable revenue, cost or retention figures.', sources: ['activations', 'essentials', 'apefest-2025'], locator: 'Reviewed program pages contain launch and event descriptions but no collection-level financial statements.', direction: 'context_only' },
      ],
    },
    token_and_value_capture: {
      body: 'The collection’s original primary sale, any creator royalties, merchandise, events and licensing are different revenue channels; current BAYC-specific figures were not found. A holder can capture value by selling an Ape or commercially using its art, but neither route promises a return. ApeCoin’s historical allocation to BAYC and MAYC holders was a separate distribution, and APE gas demand on ApeChain belongs to the token economy—not automatically to the NFT or its owner.',
      claims: [
        { key: 'holder-routes', assertion: 'The license permits commercial use, while secondary resale depends on a separate market transaction.', sources: ['license', 'coingecko'], locator: 'License commercial-use grant and CoinGecko market fields.' },
        { key: 'no-return', assertion: 'The reviewed license does not promise a financial return.', sources: ['license'], locator: 'BAYC License grants use rights, not an investment return.', direction: 'context_only' },
        { key: 'ape-airdrop', assertion: 'ApeCoin tokenomics describe a historical allocation to BAYC and MAYC NFT holders.', sources: ['apecoin'], locator: 'ApeCoin tokenomics allocation table.' },
        { key: 'gas-boundary', assertion: 'APE is the native gas token on ApeChain.', sources: ['apecoin', 'apechain'], locator: 'ApeCoin ecosystem page and ApeChain launch description.' },
        { key: 'economics-unknown', assertion: 'Current BAYC royalties and collection-attributable Yuga revenue were not disclosed in the reviewed sources.', sources: ['activations', 'essentials', 'apefest-2025'], locator: 'Current official program pages reviewed; no audited collection economics appear.', direction: 'context_only' },
      ],
    },
    counterfactual: {
      body: 'A narrower, collection-only strategy would have reduced the confusion between BAYC, Yuga, ApeCoin and ApeChain, but it also would have removed distribution and product surfaces. A stronger version of the current model would publish collection-level economics and define which benefits recur for holders. Those changes could make the membership proposition easier to value; the record does not show how they would have changed price, retention or revenue.',
      claims: [
        { key: 'ecosystem-complexity', assertion: 'BAYC is currently extended through products that sit beside the NFT collection.', sources: ['activations', 'apechain', 'apecoin'], locator: 'Activation index, ApeChain launch page and ApeCoin ecosystem description.' },
        { key: 'disclosure-gap', assertion: 'Collection-level economics and repeat-benefit commitments were not found in the reviewed sources.', sources: ['activations', 'license', 'essentials'], locator: 'Reviewed current license, activation and retail pages.', direction: 'context_only' },
        { key: 'scenario-only', assertion: 'The proposed narrower strategy and added disclosure are unmeasured alternatives.', sources: ['activations', 'apechain'], locator: 'Observed ecosystem breadth used only to bound the scenario.', direction: 'context_only' },
      ],
    },
    risks_and_unknowns: {
      body: 'The main risk is dependence on Yuga’s ability to keep the club culturally relevant while managing a much wider ecosystem. License changes, thinner event programming or unclear boundaries between the NFT and related tokens could weaken the membership case. Market numbers are also easy to overread: CoinGecko’s 7.96 ETH floor and estimated market cap were listings-based aggregates, not executable bids or realized value. Current royalties, holder concentration, active-member retention and event economics remain unknown.',
      claims: [
        { key: 'operator-dependence', assertion: 'Current membership programming depends on continued Yuga execution.', sources: ['activations', 'apefest-2026'], locator: 'Current official activation and event pages.' },
        { key: 'license-dependence', assertion: 'Holder use rights are defined by the current BAYC license.', sources: ['license'], locator: 'BAYC License grant and ownership conditions.' },
        { key: 'listing-limit', assertion: 'CoinGecko returned a 7.96 ETH listed floor and estimated market cap, neither of which is a collection-wide executable bid.', sources: ['coingecko'], locator: 'API floor_price and market_cap fields retrieved at 2026-08-03T18:05:00Z.', note: 'The API did not expose the underlying marketplace observation time.' },
        { key: 'unknowns', assertion: 'Current royalties, retention, holder concentration and event economics were not established.', sources: ['activations', 'coingecko', 'apefest-2025'], locator: 'Reviewed operator program pages and point-in-time market response.', direction: 'context_only' },
      ],
    },
    lifecycle: {
      body: 'BAYC began as a 10,000-piece Ethereum release on April 23, 2021. Yuga then turned it into a broader membership and IP brand, including recurring ApeFest events. ApeChain launched in October 2024 as adjacent APE infrastructure; a fifth ApeFest concluded in 2025 and BAYC Essentials followed that December. In 2026 the operator still maintained an activation pipeline and advertised another ApeFest. The collection is operating, but current operating continuity should not be rewritten as proof of financial health.',
      claims: [
        { key: 'release', assertion: 'BAYC released on April 23, 2021.', sources: ['founding'], locator: 'Founding page release sentence.' },
        { key: 'apechain-launch', assertion: 'ApeChain launched in October 2024.', sources: ['apechain'], locator: 'ApeChain Launch page date and launch description.' },
        { key: '2025-programs', assertion: 'ApeFest 2025 concluded and BAYC Essentials launched in 2025.', sources: ['apefest-2025', 'essentials'], locator: 'Dated official activation pages.' },
        { key: '2026-operation', assertion: 'Official activation and ApeFest surfaces remained live in August 2026.', sources: ['activations', 'apefest-2026'], locator: 'Current pages checked on August 3, 2026.' },
      ],
    },
    outlook_and_watch: {
      body: 'Base case: BAYC remains a recognizable, actively operated membership brand with a volatile secondary market. Watch completion and attendance of ApeFest 2026, delivery of announced Clubhouse and anime work, changes to the license, repeat retail or collaboration launches, 30- and 90-day buyer and seller counts, executable bid depth and any BAYC-specific royalty or revenue disclosure. Do not use APE price, ApeChain activity or one floor listing as a substitute for the collection’s own health.',
      claims: [
        { key: 'base-case', assertion: 'Current operation and dated market volatility support an operating-but-mixed base case.', sources: ['activations', 'coindesk-rebound', 'coingecko'], locator: 'Current activation index, May rebound report and August point snapshot.', direction: 'context_only' },
        { key: 'delivery-watch', assertion: 'ApeFest 2026 and announced Clubhouse and anime work are future delivery signals.', sources: ['apefest-2026', 'apefest-2025'], locator: 'ApeFest 2026 ticketing page and 2025 recap announcements.' },
        { key: 'market-watch', assertion: 'Longer-window participation and executable depth are needed to assess durable demand.', sources: ['coingecko'], locator: 'CoinGecko exposes a short rolling snapshot and listing-derived fields only.', direction: 'context_only' },
        { key: 'boundary-watch', assertion: 'APE and ApeChain metrics are separate from BAYC collection performance.', sources: ['apecoin', 'apechain'], locator: 'Separate token and chain descriptions on ecosystem sources.' },
      ],
    },
  },
  metrics: [
    { key: 'floor-eth', dimension: 'floor_price', label: 'Listed floor', value: 7.96, unit: 'eth', currency: 'ETH', as_of: '2026-08-03T18:05:00Z', window: { start: null, end: '2026-08-03T18:05:00Z', definition: 'point_in_time' }, method: 'CoinGecko marketplace aggregate', scope: { collection: 'Bored Ape Yacht Club', chain: 'Ethereum' }, sources: ['coingecko'], locator: 'floor_price.native_currency API field.', assertion: 'CoinGecko returned a 7.96 ETH floor.', quality_flags: ['listing_not_executable_bid', 'underlying_marketplace_timestamp_unavailable', 'not_liquidity_measure'] },
    { key: 'volume-24h-eth', dimension: 'secondary_volume', label: 'Reported secondary volume, rolling 24 hours', value: 51.57, unit: 'eth', currency: 'ETH', as_of: '2026-08-03T18:05:00Z', window: { start: null, end: '2026-08-03T18:05:00Z', definition: 'rolling_24h' }, method: 'CoinGecko marketplace aggregate', scope: { collection: 'Bored Ape Yacht Club', chain: 'Ethereum' }, sources: ['coingecko'], locator: 'volume_24h.native_currency API field.', assertion: 'CoinGecko returned 51.57 ETH of 24-hour volume.', quality_flags: ['aggregator_snapshot', 'underlying_marketplace_timestamp_unavailable'] },
    { key: 'sales-24h', dimension: 'sales', label: 'Reported sales, rolling 24 hours', value: 6, unit: 'count', as_of: '2026-08-03T18:05:00Z', window: { start: null, end: '2026-08-03T18:05:00Z', definition: 'rolling_24h' }, method: 'CoinGecko marketplace aggregate', scope: { collection: 'Bored Ape Yacht Club', chain: 'Ethereum' }, sources: ['coingecko'], locator: 'one_day_sales API field.', assertion: 'CoinGecko returned six sales in the prior 24 hours.', quality_flags: ['thin_observation', 'not_liquidity_measure', 'underlying_marketplace_timestamp_unavailable'] },
    { key: 'holders', dimension: 'holders', label: 'Unique holder addresses', value: 5670, unit: 'addresses', as_of: '2026-08-03T18:05:00Z', window: { start: null, end: '2026-08-03T18:05:00Z', definition: 'point_in_time' }, method: 'CoinGecko marketplace aggregate', scope: { collection: 'Bored Ape Yacht Club', chain: 'Ethereum' }, sources: ['coingecko'], locator: 'number_of_unique_addresses API field.', assertion: 'CoinGecko returned 5,670 unique holder addresses.', quality_flags: ['addresses_not_people', 'underlying_marketplace_timestamp_unavailable'] },
    { key: 'supply', dimension: 'supply', label: 'Reported collection supply', value: 9998, unit: 'nfts', as_of: '2026-08-03T18:05:00Z', window: { start: null, end: '2026-08-03T18:05:00Z', definition: 'point_in_time' }, method: 'CoinGecko marketplace aggregate; official design count is 10,000', scope: { collection: 'Bored Ape Yacht Club', chain: 'Ethereum' }, sources: ['founding', 'coingecko'], locator: 'Official 10,000 release statement and total_supply API field.', assertion: 'The official design count is 10,000 while CoinGecko returned 9,998 current supply.', quality_flags: ['reported_supply_differs_from_design_count'] },
  ],
  events: [
    { key: 'launch', type: 'collection_launch', date: '2021-04-23', description: 'Yuga released 10,000 Bored Apes.', sources: ['founding'], locator: 'Founding page release sentence.', assertion: 'BAYC released on April 23, 2021.' },
    { key: 'apechain', type: 'ecosystem_launch', date: '2024-10-01', date_precision: 'month', description: 'ApeChain launched for the broader APE ecosystem.', sources: ['apechain'], locator: 'ApeChain Launch page.', assertion: 'ApeChain launched in October 2024.' },
    { key: 'apefest-five', type: 'community_event', date: '2025-10-31', description: 'BAYC completed its fifth ApeFest in Las Vegas.', sources: ['apefest-2025'], locator: 'ApeFest 2025 recap.', assertion: 'The fifth ApeFest concluded in 2025.' },
    { key: 'current-review', type: 'research_review', date: '2026-08-03', description: 'Current activations, license, planned event and market snapshot were reviewed.', sources: ['activations', 'license', 'apefest-2026', 'coingecko'], locator: 'Named current pages and API response checked at the research timestamp.', assertion: 'BAYC evidence was refreshed on August 3, 2026.' },
  ],
  unknowns: ['current_collection_royalties', 'bayc_attributable_revenue_and_costs', 'active_member_retention', 'holder_identity_concentration', 'executable_bid_depth', 'apefest_2026_completion_and_attendance'],
  guardrail: 'Keep BAYC NFT ownership, Yuga corporate economics, APE token value and ApeChain activity separate. Planned 2026 programs are not completed outcomes.',
  methodologyNotes: ['CoinGecko metrics are a dated aggregator snapshot; listing floors and estimated market caps are not treated as executable liquidity or realized value.'],
});

const pudgySources = [
  source('pudgy-penguins', 'licensing', 'Pudgy Penguins Licensing Deals', 'https://media.pudgypenguins.com/licensing-deals', 'Pudgy Penguins', null, 'B', 'primary', { independence_group: 'pudgy_penguins', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source('pudgy-penguins', 'toys', 'Pudgy Toys', 'https://media.pudgypenguins.com/post/pudgytoys', 'Pudgy Penguins', '2023-05-18', 'B', 'primary', { independence_group: 'pudgy_penguins', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source('pudgy-penguins', 'world', 'Q1 2026: PENGU Winter', 'https://media.pudgypenguins.com/post/q1-2026-pengu-winter', 'Pudgy Penguins', '2026-04-15', 'B', 'primary', { independence_group: 'pudgy_penguins', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source('pudgy-penguins', 'may-2026', 'May 2026: The Huddle Is Everywhere', 'https://media.pudgypenguins.com/post/may-2026', 'Pudgy Penguins', '2026-05-31', 'B', 'primary', { independence_group: 'pudgy_penguins', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source('pudgy-penguins', 'axios-acquisition', 'Pudgy Penguins takes new tack on NFT IP', 'https://www.axios.com/2023/05/09/pudgy-penguins-nft-ip-brand', 'Axios', '2023-05-09', 'B', 'independent', { independence_group: 'axios', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source('pudgy-penguins', 'axios-walmart', 'Pudgy Penguins expands its Walmart footprint', 'https://www.axios.com/2024/02/20/pudgy-penguins-nft-walmart', 'Axios', '2024-02-20', 'B', 'independent', { independence_group: 'axios', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source('pudgy-penguins', 'axios-igloo', 'Pudgy Penguins parent Igloo raises $11 million', 'https://www.axios.com/2024/07/23/pudgy-penguins-igloo-nft-founders-fund-11m', 'Axios', '2024-07-23', 'B', 'independent', { independence_group: 'axios', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source('pudgy-penguins', 'pengu-whitepaper', 'PENGU Crypto-Asset White Paper', 'https://www.penguwhitepaper.com/', 'Simple Action Limited', '2025-10-21', 'A', 'primary', { independence_group: 'pengu_issuer', access_method: 'pdf' }),
  source('pudgy-penguins', 'decrypt-pengu', 'PENGU Tokenomics and Airdrop', 'https://decrypt.co/296507/pengu-pudgy-penguins-solana-token-airdrop-tokenomics', 'Decrypt', '2024-12-17', 'B', 'independent', { independence_group: 'decrypt' }),
  source('pudgy-penguins', 'coingecko', 'Pudgy Penguins market data API', 'https://api.coingecko.com/api/v3/nfts/pudgy-penguins', 'CoinGecko', null, 'B', 'aggregator', { independence_group: 'coingecko', access_method: 'json_api' }),
];

const pudgy = buildProfile({
  slug: 'pudgy-penguins',
  name: 'Pudgy Penguins',
  type: 'nft_collection',
  subtype: 'profile-picture collection and consumer character brand',
  tags: ['ethereum', 'pfp', 'consumer_products', 'licensing', 'pudgy_world', 'pengu'],
  chains: ['Ethereum'],
  sources: pudgySources,
  status: { value: 'operating', sources: ['world', 'may-2026'], locator: 'April and May 2026 operator updates describing a live browser game and ongoing brand distribution.', assertion: 'Pudgy Penguins remained actively operated in 2026.' },
  outcome: { value: 'operating_expanding', confidence: 'medium', sources: ['world', 'may-2026', 'axios-walmart', 'coingecko'], locator: 'Current product updates, independent retail reporting and August 3 market snapshot.', assertion: 'The brand was expanding into games and retail while collection economics and user retention remained undisclosed.', note: 'Expanding describes shipped distribution and product surfaces, not profitability or guaranteed holder value.' },
  sections: {
    what_it_is: {
      body: 'Pudgy Penguins is an 8,888-piece Ethereum avatar collection that is also used as the source material for a consumer character brand. The company sells toys, operates Pudgy World and licenses selected holder-owned characters. PENGU is a separate fungible token with its own issuer and economics; owning a Penguin is not the same as owning the company, its retail revenue or a standing claim on token value.',
      claims: [
        { key: 'collection', assertion: 'Pudgy Penguins is an 8,888-piece Ethereum NFT collection.', sources: ['coingecko', 'axios-acquisition'], locator: 'CoinGecko total_supply and Axios collection description.' },
        { key: 'consumer-brand', assertion: 'The operator uses collection characters in toys and a browser game.', sources: ['toys', 'world'], locator: 'Pudgy Toys launch post and Q1 2026 Pudgy World update.' },
        { key: 'selected-licensing', assertion: 'Licensing is available through individual deals for selected NFTs rather than as an automatic benefit for every holder.', sources: ['licensing', 'axios-walmart'], locator: 'Official licensing-deal terms and Axios description of licensed toy characters.' },
        { key: 'pengu-separate', assertion: 'PENGU is a separately issued fungible token and does not confer corporate ownership or dividends.', sources: ['pengu-whitepaper'], locator: 'White paper sections 1.1, 2.6 and token-holder rights statements.' },
      ],
    },
    what_happened: {
      body: 'After Luca Netz acquired control of the project in 2022, the team pushed the IP beyond crypto-native media. Pudgy Toys launched in 2023 and expanded from roughly 2,000 to 3,100 Walmart stores by February 2024, according to Axios. PENGU launched later as a separate token with an NFT-linked claim. By spring 2026 Pudgy World was live as a free browser game and the company was announcing more licensing and retail work. The August 3 NFT snapshot showed 17 reported sales in 24 hours—activity, but not proof of broad retention or a profitable brand.',
      claims: [
        { key: 'acquisition', assertion: 'Luca Netz acquired the project in 2022 and pursued an IP-brand strategy.', sources: ['axios-acquisition'], locator: 'Axios project-acquisition and strategy paragraphs.' },
        { key: 'toy-launch', assertion: 'Pudgy Toys launched in May 2023 using community-licensed characters.', sources: ['toys'], locator: 'Pudgy Toys post launch and licensing paragraphs.' },
        { key: 'walmart', assertion: 'Axios reported expansion from roughly 2,000 to 3,100 Walmart stores by February 2024.', sources: ['axios-walmart'], locator: 'Axios opening retail-footprint paragraphs.' },
        { key: 'pengu-launch', assertion: 'PENGU launched with an NFT-linked claim and disclosed allocation structure.', sources: ['decrypt-pengu', 'pengu-whitepaper'], locator: 'Decrypt tokenomics/claim paragraphs and white paper token description.' },
        { key: 'world-live', assertion: 'Pudgy World was live as a free-to-play browser game by April 2026.', sources: ['world'], locator: 'Q1 2026 update Pudgy World section.' },
        { key: 'current-sales', assertion: 'CoinGecko returned 17 sales in the prior 24 hours on August 3, 2026.', sources: ['coingecko'], locator: 'one_day_sales API field retrieved at 2026-08-03T18:05:00Z.' },
      ],
    },
    why_this_outcome: {
      body: 'The recovery is consistent with a shift from selling scarce JPEGs to building characters that can travel through toys, retail and games. Licensing some community-owned Penguins lets the company source recognizable characters while giving selected holders a direct contract. That model creates more distribution than an NFT-only roadmap, but the sources do not show how much retail demand converts into NFT buyers, game retention, royalties or company profit. The causal claim therefore stops at a plausible distribution mechanism.',
      claims: [
        { key: 'strategy-shift', assertion: 'Management explicitly pursued consumer IP and licensing after the acquisition.', sources: ['axios-acquisition', 'toys'], locator: 'Axios strategy report and official toy launch.' },
        { key: 'retail-distribution', assertion: 'The brand reached national retail distribution through toys.', sources: ['axios-walmart'], locator: 'Axios Walmart footprint report.' },
        { key: 'holder-contract', assertion: 'Selected holders can enter licensing deals paid under deal-specific terms.', sources: ['licensing'], locator: 'Official licensing page deal and annual-payment language.' },
        { key: 'conversion-unknown', assertion: 'Retail-to-NFT conversion, game retention and brand profitability were not disclosed.', sources: ['world', 'may-2026', 'axios-walmart'], locator: 'Reviewed product, distribution and independent retail reports contain no audited conversion or profit data.', direction: 'context_only' },
      ],
    },
    strategic_choices: {
      body: 'The team chose mass-market toys and a free browser game rather than making the NFT marketplace the only front door. It also licensed real community characters into products and added QR-linked digital experiences. PENGU broadened participation beyond Ethereum NFT owners, but introduced a second asset whose price, allocation and issuer must be judged separately. The strategy increases reach while making it easier to confuse company success, token trading and NFT-holder value.',
      claims: [
        { key: 'mass-market', assertion: 'Pudgy Penguins chose mass retail as a distribution channel.', sources: ['toys', 'axios-walmart'], locator: 'Official toy launch and Axios Walmart expansion report.' },
        { key: 'digital-link', assertion: 'Toy purchases were designed to connect to Pudgy World through a QR code.', sources: ['toys'], locator: 'Pudgy Toys post Pudgy World and QR-code description.' },
        { key: 'licensed-characters', assertion: 'Some toys use characters licensed from NFT holders.', sources: ['toys', 'licensing'], locator: 'Toy launch licensing paragraph and current licensing-deal page.' },
        { key: 'token-expansion', assertion: 'PENGU expanded the ecosystem through a separate token allocation and claim.', sources: ['decrypt-pengu', 'pengu-whitepaper'], locator: 'Decrypt airdrop/tokenomics report and white paper supply/issuer sections.' },
      ],
    },
    operating_model: {
      body: 'The company controls the brand, product roadmap, retail partnerships and Pudgy World. Individual NFT owners control their tokens; only holders selected for a licensing deal receive the deal’s stated payment. Retailers sell physical goods, while the game supplies a low-friction digital entry point. Simple Action Limited is identified as PENGU’s offeror in the white paper. Company financing, merchandise sales, NFT trades and PENGU markets are four separate ledgers.',
      claims: [
        { key: 'company-control', assertion: 'The operator directs products, partnerships and Pudgy World.', sources: ['toys', 'world', 'may-2026'], locator: 'Official product and monthly update descriptions.' },
        { key: 'license-specific', assertion: 'Holder licensing compensation is deal-specific and paid annually under the current program description.', sources: ['licensing'], locator: 'Official licensing page payment and deal language.' },
        { key: 'retail-role', assertion: 'Walmart and other retailers distribute physical Pudgy products.', sources: ['axios-walmart', 'may-2026'], locator: 'Axios retail footprint and May 2026 retail/distribution update.' },
        { key: 'issuer', assertion: 'The PENGU white paper identifies Simple Action Limited as the offeror.', sources: ['pengu-whitepaper'], locator: 'White paper issuer/offeror identification sections.' },
      ],
    },
    token_and_value_capture: {
      body: 'NFT owners can sell their Penguin and, if selected, earn a negotiated licensing payment. Those are not the same as merchandise revenue earned by the operating company. PENGU’s launch distributed tokens to parts of the ecosystem, but its white paper says the token does not represent company ownership, dividends or corporate governance. Igloo’s reported $11 million financing funded the parent company, not NFT holders. Current royalty receipts, licensed-holder totals and revenue splits were not disclosed.',
      claims: [
        { key: 'holder-licensing', assertion: 'Selected NFT holders may receive licensing payments under individual deals.', sources: ['licensing', 'axios-walmart'], locator: 'Official licensing payment language and Axios licensed-character description.' },
        { key: 'merch-boundary', assertion: 'Retail merchandise sales are company product activity, not an automatic payment to all NFT holders.', sources: ['toys', 'licensing'], locator: 'Toy launch and licensing-deal scope.', direction: 'context_only' },
        { key: 'token-rights', assertion: 'The PENGU white paper disclaims corporate ownership, dividends and corporate governance rights.', sources: ['pengu-whitepaper'], locator: 'White paper token-holder rights statements around pages 8–9.' },
        { key: 'financing-boundary', assertion: 'Axios reported $11 million of Igloo company financing, not holder distributions.', sources: ['axios-igloo'], locator: 'Axios financing announcement and company description.' },
        { key: 'economics-gap', assertion: 'Current NFT royalties, licensed-holder count and revenue splits were not found.', sources: ['licensing', 'may-2026'], locator: 'Current licensing and monthly update pages reviewed.', direction: 'context_only' },
      ],
    },
    counterfactual: {
      body: 'An NFT-only strategy would have been easier to explain, but it would have left the project dependent on collector trading. The chosen consumer-brand model could be made more legible by reporting product sell-through, Pudgy World retention and how many holders actually receive license payments. Clearer separation between the Ethereum collection and PENGU would also reduce mistaken value claims. These are design alternatives; no source shows what price or revenue would have resulted.',
      claims: [
        { key: 'observed-model', assertion: 'The current strategy spans NFTs, toys, a game and a fungible token.', sources: ['toys', 'world', 'pengu-whitepaper'], locator: 'Product launch, game update and token white paper.' },
        { key: 'disclosure-gap', assertion: 'Sell-through, game retention and licensed-holder totals were not published in reviewed materials.', sources: ['world', 'may-2026', 'licensing'], locator: 'Reviewed current operator updates and licensing page.', direction: 'context_only' },
        { key: 'unmeasured-alternative', assertion: 'The NFT-only and clearer-reporting alternatives are not observed outcomes.', sources: ['toys', 'world'], locator: 'Current multi-product model used only to bound the scenario.', direction: 'context_only' },
      ],
    },
    risks_and_unknowns: {
      body: 'The strategy depends on converting broad character awareness into repeat product and game demand without diluting the collection’s meaning. PENGU adds issuer, allocation and token-market risk that should not be assigned to the NFT by default. Licensing benefits are selective, so promotional language can overstate what a typical holder receives. CoinGecko’s 3.85 ETH floor and estimated market cap were listing-derived aggregates, not executable bids. Product sell-through, profitability, NFT royalties, game retention and holder concentration remain unknown.',
      claims: [
        { key: 'conversion-risk', assertion: 'The operator has broad distribution surfaces but does not disclose conversion or retention.', sources: ['world', 'may-2026', 'axios-walmart'], locator: 'Current game/brand updates and independent retail report.', direction: 'context_only' },
        { key: 'token-risk', assertion: 'PENGU has a separate issuer and token allocation.', sources: ['pengu-whitepaper', 'decrypt-pengu'], locator: 'White paper issuer/supply sections and independent tokenomics report.' },
        { key: 'selective-benefit', assertion: 'Licensing is an opportunity for selected NFT owners, not a universal royalty.', sources: ['licensing'], locator: 'Official licensing page eligibility and deal language.' },
        { key: 'market-limit', assertion: 'CoinGecko returned a 3.85 ETH floor that does not establish executable collection-wide liquidity.', sources: ['coingecko'], locator: 'floor_price.native_currency API field retrieved at 2026-08-03T18:05:00Z.', note: 'Underlying marketplace timestamp was unavailable.' },
      ],
    },
    lifecycle: {
      body: 'Pudgy Penguins launched as an Ethereum collection in 2021 and changed control in 2022. The new team built a licensing and physical-to-digital toy model in 2023, expanded national retail distribution in 2024 and launched PENGU as a separate asset. By April 2026 Pudgy World was live across twelve towns, and May updates described further licensing, sports and retail work. The project is operating and expanding its surfaces; audited profitability and durable NFT demand are still unproven.',
      claims: [
        { key: 'control-change', assertion: 'Control changed in 2022 under Luca Netz.', sources: ['axios-acquisition'], locator: 'Axios acquisition history.' },
        { key: 'toy-stage', assertion: 'Toys and holder-character licensing shipped in 2023.', sources: ['toys'], locator: 'Dated official toy launch.' },
        { key: 'retail-stage', assertion: 'Retail distribution expanded in 2024.', sources: ['axios-walmart'], locator: 'Axios February 2024 Walmart expansion report.' },
        { key: 'game-stage', assertion: 'Pudgy World was live with twelve towns in April 2026.', sources: ['world'], locator: 'Q1 2026 update Pudgy World section.' },
        { key: 'current-pipeline', assertion: 'The May 2026 update described ongoing licensing and planned retail work.', sources: ['may-2026'], locator: 'May 2026 licensing, partnership and retail sections.', note: 'Planned distribution is not treated as completed sell-through.' },
      ],
    },
    outlook_and_watch: {
      body: 'Base case: Pudgy Penguins remains an active consumer brand whose NFT market benefits from, but is not identical to, retail visibility. Watch toy sell-through rather than store count alone, Pudgy World active and retained users, the number and value of holder licensing deals, repeat partnerships, PENGU issuer disclosures, NFT buyer and seller counts, and executable bids. The strongest evidence would connect product and game demand to recurring company economics and clearly measured holder benefits.',
      claims: [
        { key: 'base-case', assertion: 'Current products and distribution support an active-brand base case.', sources: ['world', 'may-2026', 'axios-walmart'], locator: 'Current game/brand updates and independent retail report.', direction: 'context_only' },
        { key: 'sell-through-watch', assertion: 'Store count alone does not report retail sell-through.', sources: ['axios-walmart', 'may-2026'], locator: 'Distribution counts and planned locations without unit-sales disclosure.', direction: 'context_only' },
        { key: 'holder-benefit-watch', assertion: 'Licensing participation and payments are measurable holder-benefit signals.', sources: ['licensing'], locator: 'Official licensing page deal and payment terms.' },
        { key: 'market-watch', assertion: 'Longer-window buyers, sellers and executable bids are needed beyond the CoinGecko snapshot.', sources: ['coingecko'], locator: 'API provides short-window sales and listing-derived floor fields.', direction: 'context_only' },
      ],
    },
  },
  metrics: [
    { key: 'floor-eth', dimension: 'floor_price', label: 'Listed floor', value: 3.85, unit: 'eth', currency: 'ETH', as_of: '2026-08-03T18:05:00Z', window: { start: null, end: '2026-08-03T18:05:00Z', definition: 'point_in_time' }, method: 'CoinGecko marketplace aggregate', scope: { collection: 'Pudgy Penguins', chain: 'Ethereum' }, sources: ['coingecko'], locator: 'floor_price.native_currency API field.', assertion: 'CoinGecko returned a 3.85 ETH floor.', quality_flags: ['listing_not_executable_bid', 'underlying_marketplace_timestamp_unavailable', 'not_liquidity_measure'] },
    { key: 'volume-24h-eth', dimension: 'secondary_volume', label: 'Reported secondary volume, rolling 24 hours', value: 66.22, unit: 'eth', currency: 'ETH', as_of: '2026-08-03T18:05:00Z', window: { start: null, end: '2026-08-03T18:05:00Z', definition: 'rolling_24h' }, method: 'CoinGecko marketplace aggregate', scope: { collection: 'Pudgy Penguins', chain: 'Ethereum' }, sources: ['coingecko'], locator: 'volume_24h.native_currency API field.', assertion: 'CoinGecko returned 66.22 ETH of 24-hour volume.', quality_flags: ['aggregator_snapshot', 'underlying_marketplace_timestamp_unavailable'] },
    { key: 'sales-24h', dimension: 'sales', label: 'Reported sales, rolling 24 hours', value: 17, unit: 'count', as_of: '2026-08-03T18:05:00Z', window: { start: null, end: '2026-08-03T18:05:00Z', definition: 'rolling_24h' }, method: 'CoinGecko marketplace aggregate', scope: { collection: 'Pudgy Penguins', chain: 'Ethereum' }, sources: ['coingecko'], locator: 'one_day_sales API field.', assertion: 'CoinGecko returned 17 sales in the prior 24 hours.', quality_flags: ['thin_observation', 'not_liquidity_measure', 'underlying_marketplace_timestamp_unavailable'] },
    { key: 'holders', dimension: 'holders', label: 'Unique holder addresses', value: 5201, unit: 'addresses', as_of: '2026-08-03T18:05:00Z', window: { start: null, end: '2026-08-03T18:05:00Z', definition: 'point_in_time' }, method: 'CoinGecko marketplace aggregate', scope: { collection: 'Pudgy Penguins', chain: 'Ethereum' }, sources: ['coingecko'], locator: 'number_of_unique_addresses API field.', assertion: 'CoinGecko returned 5,201 holder addresses.', quality_flags: ['addresses_not_people', 'underlying_marketplace_timestamp_unavailable'] },
    { key: 'supply', dimension: 'supply', label: 'Collection supply', value: 8888, unit: 'nfts', as_of: '2026-08-03T18:05:00Z', window: { start: null, end: '2026-08-03T18:05:00Z', definition: 'point_in_time' }, method: 'CoinGecko marketplace aggregate', scope: { collection: 'Pudgy Penguins', chain: 'Ethereum' }, sources: ['coingecko'], locator: 'total_supply API field.', assertion: 'CoinGecko returned supply of 8,888 NFTs.', quality_flags: ['aggregator_snapshot'] },
  ],
  events: [
    { key: 'acquisition', type: 'control_change', date: '2022-04-01', date_precision: 'month', description: 'Luca Netz acquired control of Pudgy Penguins and shifted toward consumer IP.', sources: ['axios-acquisition'], locator: 'Axios acquisition history.', assertion: 'The project changed control in 2022.' },
    { key: 'toys', type: 'product_launch', date: '2023-05-18', description: 'Pudgy Toys launched with holder-licensed characters and a Pudgy World link.', sources: ['toys'], locator: 'Official Pudgy Toys launch post.', assertion: 'Pudgy Toys launched on May 18, 2023.' },
    { key: 'retail-expansion', type: 'distribution_expansion', date: '2024-02-20', description: 'Axios reported expansion to about 3,100 Walmart stores.', sources: ['axios-walmart'], locator: 'Axios opening retail paragraphs.', assertion: 'Walmart distribution expanded by February 2024.' },
    { key: 'current-review', type: 'research_review', date: '2026-08-03', description: 'Current product, licensing, token and market evidence was reviewed.', sources: ['world', 'may-2026', 'licensing', 'pengu-whitepaper', 'coingecko'], locator: 'Named sources checked at the research timestamp.', assertion: 'Pudgy Penguins evidence was refreshed on August 3, 2026.' },
  ],
  unknowns: ['retail_unit_sell_through', 'pudgy_world_active_and_retained_users', 'current_nft_royalties', 'licensed_holder_count_and_payments', 'company_profitability', 'nft_holder_concentration', 'pengu_holder_overlap'],
  guardrail: 'Keep the Ethereum NFT, selected-holder licensing deals, merchandise revenue, Igloo financing and PENGU token economics separate.',
  methodologyNotes: ['Store footprint proves distribution, not product sell-through. CoinGecko values are a dated short-window snapshot, not durable demand.'],
});

const topShotSources = [
  source('nba-top-shot', 'launch', 'NBA, NBPA and Dapper Labs announce NBA Top Shot', 'https://pr.nba.com/nba-nbpa-dapper-labs-blockchain-game/', 'NBA Communications', '2019-07-31', 'A', 'primary', { independence_group: 'nba' }),
  source('nba-top-shot', 'finals-2026', '2026 NBA Finals Drop', 'https://blog.nbatopshot.com/posts/2026-nba-finals-drop', 'NBA Top Shot / Dapper Labs', '2026-06-17', 'B', 'primary', { independence_group: 'dapper_labs' }),
  source('nba-top-shot', 'playoffs-2026', '2026 NBA Playoffs on Top Shot', 'https://blog.nbatopshot.com/posts/2026-nba-playoffs-on-top-shot', 'NBA Top Shot / Dapper Labs', '2026-04-14', 'B', 'primary', { independence_group: 'dapper_labs' }),
  source('nba-top-shot', 'moments', 'What are Moments?', 'https://support.nbatopshot.com/hc/en-us/articles/4404116274451-What-are-Moments', 'NBA Top Shot / Dapper Labs', null, 'B', 'primary', { independence_group: 'dapper_labs', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source('nba-top-shot', 'fees', 'Marketplace Fees', 'https://support.nbatopshot.com/hc/en-us/articles/1500003409882-Marketplace-Fees', 'NBA Top Shot / Dapper Labs', null, 'B', 'primary', { independence_group: 'dapper_labs', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source('nba-top-shot', 'set-ownership', 'Set Ownership', 'https://support.nbatopshot.com/hc/en-us/articles/18273491925395-Set-Ownership', 'NBA Top Shot / Dapper Labs', null, 'B', 'primary', { independence_group: 'dapper_labs', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source('nba-top-shot', 'locking', 'Locking Moments and Sets', 'https://support.nbatopshot.com/hc/en-us/articles/7738397259923-Locking-Moments-and-Sets', 'NBA Top Shot / Dapper Labs', null, 'B', 'primary', { independence_group: 'dapper_labs', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source('nba-top-shot', 'graphql', 'Top Shot public GraphQL API — latest marketplace transactions', 'https://public-api.nbatopshot.com/graphql', 'NBA Top Shot / Dapper Labs', null, 'B', 'primary', { independence_group: 'dapper_labs', access_method: 'graphql_post', direct_http_status: 200 }),
  source('nba-top-shot', 'axios-peak', 'NBA Top Shot brings blockchain to the mainstream', 'https://www.axios.com/2021/03/12/nba-top-shot-blockchain', 'Axios', '2021-03-12', 'B', 'independent', { independence_group: 'axios', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
];

const topShot = buildProfile({
  slug: 'nba-top-shot', name: 'NBA Top Shot', type: 'nft_collection',
  subtype: 'licensed sports-highlight collectible platform',
  tags: ['flow', 'sports', 'licensed_ip', 'packs', 'marketplace'], chains: ['Flow'], sources: topShotSources,
  status: { value: 'operating', sources: ['finals-2026', 'graphql'], locator: 'June 2026 official drop and public marketplace transactions observed through August 3, 2026.', assertion: 'NBA Top Shot remained an operating product and marketplace in August 2026.' },
  outcome: { value: 'operating_mixed', confidence: 'medium', sources: ['axios-peak', 'finals-2026', 'graphql'], locator: 'Historical independent peak report, current official drop and current bounded transaction feed.', assertion: 'Top Shot remained live after its 2021 boom, but current users, retention and profitability were not established.', note: 'Mixed reflects live operation after a documented historical peak; it is not a current market-share or profit claim.' },
  sections: {
    what_it_is: {
      body: 'NBA Top Shot is Dapper Labs’ licensed marketplace for NBA highlight collectibles called Moments, issued on Flow. The original partnership joined Dapper with the NBA and the National Basketball Players Association. A Moment gives the collector the token and the product rights stated by Top Shot; it does not ordinarily transfer the NBA’s footage, team marks or player publicity rights. Narrow commercial rights exist for qualifying locked sets under a separate agreement.',
      claims: [
        { key: 'partnership', assertion: 'Top Shot was created through a Dapper, NBA and NBPA partnership.', sources: ['launch'], locator: 'NBA Communications partnership announcement.' },
        { key: 'moment', assertion: 'Moments are licensed NBA/NBPA digital collectibles on Flow.', sources: ['moments'], locator: 'Top Shot support article Moment definition.' },
        { key: 'ip-limit', assertion: 'Ordinary ownership does not transfer broad NBA, team or player IP rights.', sources: ['set-ownership'], locator: 'Set Ownership exclusions for NBA and player intellectual property.' },
        { key: 'set-rights', assertion: 'Only qualifying locked sets receive the stated commercial-art rights under an agreement.', sources: ['set-ownership', 'locking'], locator: 'Set Ownership eligibility/rights and Locking restrictions.' },
      ],
    },
    what_happened: {
      body: 'The parties announced Top Shot in 2019 and the product became one of the largest early NFT markets during the 2021 boom; Axios reported roughly $250 million of sales and 100,000 buyers in a one-month period then. That peak is historical, not a current-user figure. In 2026 Top Shot still ran playoff and Finals drops, including pack sales, challenges and burn-to-earn mechanics. A public API query on August 3 returned ten recent marketplace transaction records, confirming live trades without establishing daily volume, active collectors or profitability.',
      claims: [
        { key: 'announcement', assertion: 'The NBA, NBPA and Dapper announced the product in 2019.', sources: ['launch'], locator: 'NBA Communications dated announcement.' },
        { key: 'historical-peak', assertion: 'Axios reported about $250 million in one-month sales and 100,000 buyers during the 2021 peak.', sources: ['axios-peak'], locator: 'Axios March 2021 sales and buyer paragraphs.' },
        { key: 'current-drops', assertion: 'Top Shot ran playoff and Finals drops in 2026.', sources: ['playoffs-2026', 'finals-2026'], locator: 'Dated official 2026 drop posts.' },
        { key: 'current-trades', assertion: 'The latest-transactions query returned ten recent records on August 3, 2026.', sources: ['graphql'], locator: 'GraphQL getLatestMarketplaceTransactions.data.searchSummary.data response; size=10, newest updatedAt 2026-08-03T18:03:00.823879Z.' },
        { key: 'current-limit', assertion: 'The bounded latest-transactions response does not report current active collectors or profitability.', sources: ['graphql'], locator: 'Queried fields id, price, txHash and updatedAt; no active-user, retention or income field.', direction: 'context_only' },
      ],
    },
    why_this_outcome: {
      body: 'Top Shot paired globally recognized basketball IP with familiar pack openings, serial-number scarcity and a built-in resale market. That combination lowered the conceptual distance between sports cards and NFTs, helping explain the 2021 breakout. Current drops show the format can still produce new inventory and collector rituals. The reviewed evidence does not establish why activity fell from the peak or how much present demand comes from fandom, rewards, speculation or discounts, so no single decline story is asserted.',
      claims: [
        { key: 'licensed-ip', assertion: 'Top Shot uses officially licensed NBA and NBPA highlights.', sources: ['launch', 'moments'], locator: 'NBA partnership announcement and Moment definition.' },
        { key: 'pack-format', assertion: 'Current drops continue to use packs, scarcity, challenges and burn mechanics.', sources: ['playoffs-2026', 'finals-2026'], locator: '2026 drop structures and challenge descriptions.' },
        { key: 'historical-scale', assertion: 'The product reached a large reported sales and buyer peak in 2021.', sources: ['axios-peak'], locator: 'Axios peak sales and buyer report.' },
        { key: 'cause-limit', assertion: 'The reviewed sources do not causally decompose the change from the 2021 peak.', sources: ['axios-peak', 'finals-2026', 'graphql'], locator: 'Historical scale, current operator inventory and bounded current transaction records.', direction: 'context_only' },
      ],
    },
    strategic_choices: {
      body: 'Dapper chose licensed video highlights instead of generic sports art, sold randomized packs and kept a first-party marketplace around the collection. Current programs use next-day Moments, challenges, set completion, locking and burning to create reasons to collect beyond a single purchase. These mechanics can concentrate attention around releases and rewards, but they also make observed activity sensitive to incentive design. Selective set rights are narrower than giving every holder broad commercial use of NBA footage.',
      claims: [
        { key: 'licensed-video', assertion: 'The core collectible is licensed video-highlight content.', sources: ['launch', 'moments'], locator: 'Partnership product description and Moment definition.' },
        { key: 'pack-market', assertion: 'Top Shot operates official pack drops and a first-party secondary marketplace.', sources: ['finals-2026', 'fees'], locator: 'Finals drop pack terms and Marketplace Fees article.' },
        { key: 'collection-mechanics', assertion: 'Current programs use challenges, locking and burns.', sources: ['playoffs-2026', 'locking'], locator: 'Playoffs 2026 mechanics and Locking article.' },
        { key: 'rights-scope', assertion: 'Commercial rights are limited to qualifying locked sets and exclude NBA/player IP.', sources: ['set-ownership'], locator: 'Set Ownership eligibility and exclusions.' },
      ],
    },
    operating_model: {
      body: 'Dapper Labs operates the app, pack drops, accounts and marketplace on Flow under NBA and NBPA licenses. Collectors buy packs or individual Moments and may resell eligible items through the marketplace. Locking removes a Moment or set from sale, gifting and withdrawal for one year. The public transaction API exposes recent trades, but the reviewed sources do not disclose the current revenue split among Dapper, the leagues, players or other partners.',
      claims: [
        { key: 'operator', assertion: 'Dapper operates Top Shot under NBA and NBPA licenses.', sources: ['launch', 'finals-2026'], locator: 'Partnership announcement and current operator drop.' },
        { key: 'collector-flow', assertion: 'Collectors can acquire packs and resell Moments through the marketplace.', sources: ['finals-2026', 'fees'], locator: 'Drop purchase terms and marketplace fee article.' },
        { key: 'lock', assertion: 'Locking prevents sale, gifting and withdrawal for one year.', sources: ['locking'], locator: 'Locking article restrictions.' },
        { key: 'split-unknown', assertion: 'The reviewed materials do not disclose how marketplace fee revenue is divided among counterparties.', sources: ['fees', 'launch'], locator: 'Fee article states the charge; partnership announcement does not publish a revenue split.', direction: 'context_only' },
      ],
    },
    token_and_value_capture: {
      body: 'Top Shot can collect pack revenue and charges a 5 percent fee on each marketplace sale; the seller receives 95 percent. That is a gross platform fee, not proof that Dapper retains the entire amount or earns a profit. A collector captures value only through a completed resale or an explicit product benefit. Locking, challenge rewards and burn mechanics can change supply or eligibility, but they are not cash yield. FLOW token economics and NBA licensing economics are separate from a Moment holder’s return.',
      claims: [
        { key: 'fee', assertion: 'Top Shot charges 5 percent per marketplace sale and the seller receives 95 percent.', sources: ['fees'], locator: 'Marketplace Fees article fee example and seller proceeds statement.' },
        { key: 'gross-boundary', assertion: 'The published fee is gross platform revenue before undisclosed partner shares and costs.', sources: ['fees', 'launch'], locator: 'Fee article and partnership record; allocation and costs are not disclosed.', direction: 'context_only' },
        { key: 'holder-value', assertion: 'Holder realization requires a completed sale or stated product benefit.', sources: ['fees', 'finals-2026', 'locking'], locator: 'Sale fee mechanics, drop benefits and locking restrictions.' },
        { key: 'not-yield', assertion: 'Locking and burn/challenge mechanics are product eligibility tools rather than promised cash yield.', sources: ['playoffs-2026', 'locking'], locator: 'Playoffs mechanics and Locking article.', direction: 'context_only' },
      ],
    },
    counterfactual: {
      body: 'A more open marketplace and broader withdrawal path might reduce platform dependence, while a tighter closed system can make licensing and product mechanics easier to control. Top Shot could also publish current active collectors, retention, net pack revenue and secondary volume by cohort, making the post-boom business easier to judge. Fewer reward-driven mechanics might produce a cleaner measure of fandom but less short-term engagement. These alternatives have no measured causal estimate in the reviewed record.',
      claims: [
        { key: 'platform-dependence', assertion: 'Current packs, marketplace and locking mechanics depend on Top Shot-operated systems.', sources: ['finals-2026', 'fees', 'locking'], locator: 'Official drop, fee and locking documents.' },
        { key: 'disclosure-gap', assertion: 'Current active collectors, retention and net revenue were not found.', sources: ['finals-2026', 'graphql'], locator: 'Current drop post and bounded transaction API fields.', direction: 'context_only' },
        { key: 'unmeasured', assertion: 'Open-market and lower-incentive alternatives are scenarios, not observed outcomes.', sources: ['fees', 'playoffs-2026'], locator: 'Current system design used only to bound counterfactuals.', direction: 'context_only' },
      ],
    },
    risks_and_unknowns: {
      body: 'Top Shot depends on continuing league and player licenses, Dapper’s platform operation and collector willingness to buy new inventory. Locking and burn mechanics can make headline supply or activity hard to compare across periods. A latest-transactions page proves trades exist but cannot establish daily volume or broad participation. The largest gaps are current active users, repeat buyers, pack sell-through, net revenue, license economics, withdrawal behavior and the concentration of inventory among collectors.',
      claims: [
        { key: 'license-dependence', assertion: 'The product rests on NBA and NBPA licensing relationships.', sources: ['launch', 'moments'], locator: 'Partnership announcement and licensed Moment definition.' },
        { key: 'mechanics-comparability', assertion: 'Locking and burning change availability and supply state.', sources: ['locking', 'playoffs-2026'], locator: 'Locking restrictions and burn-to-earn mechanics.' },
        { key: 'api-limit', assertion: 'The latest-transactions page is a bounded feed, not a daily market total.', sources: ['graphql'], locator: 'GraphQL response size=10 and null totalCount.', direction: 'context_only' },
        { key: 'unknowns', assertion: 'Current users, retention, sell-through, net revenue and inventory concentration were not established.', sources: ['finals-2026', 'graphql'], locator: 'Current drop and public query reviewed.', direction: 'context_only' },
      ],
    },
    lifecycle: {
      body: 'The NBA, NBPA and Dapper announced Top Shot in July 2019. It broke into the mainstream during the 2021 NFT boom, when Axios reported roughly $250 million of one-month sales and 100,000 buyers. The platform later continued through changing market conditions rather than shutting down. In 2026 it ran playoff and Finals programs and its public marketplace feed still returned recent transactions. The correct current label is operating after a historic peak—not dead, and not proven to have recovered to peak-scale use.',
      claims: [
        { key: 'start', assertion: 'Top Shot was announced in July 2019.', sources: ['launch'], locator: 'Dated NBA Communications announcement.' },
        { key: 'peak', assertion: 'Axios documented a large sales and buyer peak in early 2021.', sources: ['axios-peak'], locator: 'Axios March 2021 reported sales and buyer-count paragraphs.' },
        { key: 'current-program', assertion: 'Official playoff and Finals programs shipped in 2026.', sources: ['playoffs-2026', 'finals-2026'], locator: 'Dated 2026 operator posts.' },
        { key: 'live-feed', assertion: 'Recent marketplace transactions were returned on August 3, 2026.', sources: ['graphql'], locator: 'getLatestMarketplaceTransactions response timestamps.' },
      ],
    },
    outlook_and_watch: {
      body: 'Base case: Top Shot remains a functioning licensed collectibles niche with regular drops, far below the evidentiary clarity of its 2021 peak. Watch unique buyers and sellers, 30- and 90-day volume, pack sell-through, repeat-purchase cohorts, marketplace-fee revenue, withdrawals, license renewals and the share of activity tied to rewards. New drops and a handful of trades show operation; only sustained participation and disclosed economics would support a stronger recovery claim.',
      claims: [
        { key: 'base-case', assertion: 'Current drops and trades support continued operation but not recovery to the historical peak.', sources: ['axios-peak', 'finals-2026', 'graphql'], locator: 'Historical peak report, current drop and bounded transaction feed.', direction: 'context_only' },
        { key: 'participation-watch', assertion: 'Unique buyers, sellers and repeat cohorts are not available in the reviewed current sources.', sources: ['graphql'], locator: 'Queried transaction fields omit unique-user and cohort measures.', direction: 'context_only' },
        { key: 'economics-watch', assertion: 'The 5 percent gross fee and pack prices do not establish net revenue or profitability.', sources: ['fees', 'finals-2026'], locator: 'Fee article and current pack terms.', direction: 'context_only' },
        { key: 'license-watch', assertion: 'License continuity is a material operating signal.', sources: ['launch', 'moments'], locator: 'Product rests on NBA and NBPA licensed content.' },
      ],
    },
  },
  metrics: [
    { key: 'latest-api-page', dimension: 'sales', label: 'Latest marketplace transaction records returned', value: 10, unit: 'records', as_of: '2026-08-03T18:03:00.823879Z', window: { start: null, end: '2026-08-03T18:03:00.823879Z', definition: 'latest_api_page' }, method: 'Top Shot public GraphQL getLatestMarketplaceTransactions query', scope: { platform: 'NBA Top Shot', chain: 'Flow' }, sources: ['graphql'], locator: 'searchSummary.data.size and nested transaction data array.', assertion: 'The API returned a page of ten recent transaction records.', quality_flags: ['bounded_api_page', 'not_period_sales_total', 'not_volume_measure'], headline: false },
  ],
  events: [
    { key: 'announcement', type: 'partnership_announcement', date: '2019-07-31', description: 'The NBA, NBPA and Dapper announced NBA Top Shot.', sources: ['launch'], locator: 'NBA Communications announcement date and body.', assertion: 'Top Shot was announced on July 31, 2019.' },
    { key: 'peak-report', type: 'market_observation', date: '2021-03-12', description: 'Axios reported roughly $250 million in one-month sales and 100,000 buyers.', sources: ['axios-peak'], locator: 'Axios reported metrics.', assertion: 'Top Shot reached a large reported market peak in early 2021.' },
    { key: 'finals-drop', type: 'product_drop', date: '2026-06-17', description: 'Top Shot published its 2026 NBA Finals drop.', sources: ['finals-2026'], locator: 'Dated official Finals drop.', assertion: 'A 2026 Finals drop shipped.' },
    { key: 'current-review', type: 'research_review', date: '2026-08-03', description: 'The current product, rights, fee and transaction evidence was reviewed.', sources: ['finals-2026', 'set-ownership', 'fees', 'graphql'], locator: 'Named current sources checked at the research timestamp.', assertion: 'Top Shot evidence was refreshed on August 3, 2026.' },
  ],
  unknowns: ['current_active_collectors', 'buyer_and_seller_retention', 'pack_sell_through', 'net_platform_revenue', 'license_revenue_shares', 'withdrawal_activity', 'inventory_concentration'],
  guardrail: 'Keep historical peak metrics separate from current users; keep the 5 percent gross marketplace fee separate from Dapper net revenue and keep narrow set rights separate from NBA IP ownership.',
  methodologyNotes: ['The GraphQL observation is a latest-page sample with a null total count; it proves live transactions, not a period total.'],
});

const gameStopSources = [
  source('gamestop-nft-marketplace', '2022-10q', 'GameStop Form 10-Q for quarter ended October 29, 2022', 'https://www.sec.gov/Archives/edgar/data/1326380/000132638022000137/gme-20221029.htm', 'U.S. SEC / GameStop Corp.', '2022-12-07', 'A', 'primary', { independence_group: 'gamestop_sec_filing' }),
  source('gamestop-nft-marketplace', 'immutable-agreement', 'Protocol Services and License Agreement', 'https://www.sec.gov/Archives/edgar/data/1326380/000132638022000012/a101-protocolservicesandli.htm', 'U.S. SEC / GameStop Corp. / Immutable X', '2022-01-27', 'A', 'primary', { independence_group: 'gamestop_immutable_agreement' }),
  source('gamestop-nft-marketplace', 'immutable-amendment', 'GameStop–Immutable X License Agreement Amendment', 'https://www.sec.gov/Archives/edgar/data/1326380/000132638022000137/a101gamestop-immutablexlic.htm', 'U.S. SEC / GameStop Corp. / Immutable X', '2022-07-28', 'A', 'primary', { independence_group: 'gamestop_immutable_agreement' }),
  source('gamestop-nft-marketplace', 'sec-response', 'GameStop response to SEC staff comments', 'https://www.sec.gov/Archives/edgar/data/1326380/000132638023000052/filename1.htm', 'U.S. SEC / GameStop Corp.', '2023-04-28', 'A', 'primary', { independence_group: 'gamestop_sec_filing' }),
  source('gamestop-nft-marketplace', '2024-10k', 'GameStop Form 10-K for fiscal year ended February 3, 2024', 'https://www.sec.gov/Archives/edgar/data/1326380/000132638024000012/gme-20240203.htm', 'U.S. SEC / GameStop Corp.', '2024-03-26', 'A', 'primary', { independence_group: 'gamestop_sec_filing' }),
  source('gamestop-nft-marketplace', 'closure', 'GameStop’s crypto plans collapse as retailer prepares to shut NFT marketplace', 'https://www.gamedeveloper.com/business/gamestop-s-crypto-plans-collapse-as-retailer-prepares-to-shut-nft-marketplace', 'Game Developer', '2024-01-15', 'B', 'independent', { independence_group: 'game_developer' }),
  source('gamestop-nft-marketplace', 'current-domain', 'GameStop NFT marketplace endpoint', 'https://nft.gamestop.com/', 'GameStop Corp.', null, 'B', 'primary', { independence_group: 'gamestop', access_method: 'redirect_check', direct_http_status: 403, final_url: 'https://www.gamestop.com/' }),
];

const gameStop = buildProfile({
  slug: 'gamestop-nft-marketplace', name: 'GameStop NFT Marketplace', type: 'nft_collection',
  subtype: 'discontinued multi-collection NFT marketplace',
  tags: ['marketplace', 'loopring', 'immutable_x', 'discontinued'], chains: ['Ethereum', 'Loopring', 'Immutable X'], sources: gameStopSources,
  status: { value: 'ceased', sources: ['2024-10k', 'current-domain'], locator: '2024 Form 10-K wind-down disclosure and August 3, 2026 redirect of nft.gamestop.com to the general retailer.', assertion: 'GameStop’s NFT wallet and marketplace were wound down and the NFT domain no longer served the marketplace.' },
  outcome: { value: 'ceased', confidence: 'high', sources: ['2024-10k', 'closure'], locator: 'Filed wind-down disclosure plus contemporaneous independent closure reporting quoting GameStop’s notice.', assertion: 'The marketplace ceased operation after GameStop said NFT-related revenue was not material and cited continuing regulatory uncertainty.', note: 'The evidence supports the public rationale and revenue materiality; it does not prove a single complete cause.' },
  sections: {
    what_it_is: {
      body: 'GameStop NFT was a retailer-operated marketplace for third-party NFTs, not one NFT collection. GameStop launched a self-custodial wallet and a marketplace using Loopring, then added Immutable X support for gaming assets. The product is now discontinued. NFTs bought there remain blockchain assets controlled under their own contracts and wallets; marketplace closure did not turn them into GameStop equity or guarantee they would retain liquidity elsewhere.',
      claims: [
        { key: 'marketplace', assertion: 'GameStop NFT was a marketplace rather than a single collection.', sources: ['2022-10q'], locator: '2022 Form 10-Q digital-assets business description.' },
        { key: 'stack', assertion: 'The wallet and marketplace launched with Loopring and later integrated Immutable X.', sources: ['2022-10q', 'immutable-agreement'], locator: '10-Q launch timeline and agreement integration obligations.' },
        { key: 'ceased', assertion: 'The wallet and marketplace were wound down.', sources: ['2024-10k'], locator: '2024 Form 10-K digital-assets wind-down paragraphs.' },
        { key: 'asset-boundary', assertion: 'Marketplace termination did not transfer ownership of customer NFTs to GameStop.', sources: ['immutable-agreement', 'closure'], locator: 'Agreement termination/ownership provisions and closure notice stating assets remain onchain.' },
      ],
    },
    what_happened: {
      body: 'GameStop opened its wallet in May 2022, launched the marketplace in July and added Immutable X in November. The Immutable agreement contemplated protocol integration, customer fees and IMX grants tied to milestones; GameStop later said the first three grant milestones were achieved but the largest transaction-volume milestones were not. The company discontinued the wallet in 2023 and closed the marketplace on February 2, 2024. Its 2024 Form 10-K said wallet and marketplace revenues were not material in fiscal 2022 or 2023.',
      claims: [
        { key: 'launches', assertion: 'Wallet, marketplace and Immutable X milestones occurred in May, July and November 2022.', sources: ['2022-10q'], locator: '10-Q digital-assets launch timeline.' },
        { key: 'agreement', assertion: 'The Immutable agreement included integration, marketing and engineering obligations plus milestone grants.', sources: ['immutable-agreement', 'sec-response'], locator: 'Agreement sections 2–4, Exhibit A and SEC response summary.' },
        { key: 'milestones', assertion: 'GameStop reported receiving the first three IMX grants but not reaching the largest transaction-volume targets by January 2023.', sources: ['sec-response'], locator: 'SEC response paragraphs describing grants and unmet $1.5 billion/$3 billion targets.' },
        { key: 'closure', assertion: 'The marketplace closed on February 2, 2024 after the wallet was discontinued.', sources: ['closure', '2024-10k'], locator: 'Closure notice quoted by Game Developer and 10-K wind-down disclosure.' },
        { key: 'immaterial-revenue', assertion: 'GameStop said wallet and marketplace revenues were not material in fiscal 2022 and 2023.', sources: ['2024-10k'], locator: '2024 Form 10-K digital-assets revenue materiality paragraph.' },
      ],
    },
    why_this_outcome: {
      body: 'GameStop’s public shutdown notice cited continuing regulatory uncertainty. Its filed results add a second verified fact: NFT wallet and marketplace revenue was not material. Together they support a decision to stop funding a peripheral, uncertain business, but they do not reveal operating cost, user retention, management deliberations or a single proven cause. Low adoption is plausible; it is not promoted here from inference to fact.',
      claims: [
        { key: 'stated-reason', assertion: 'GameStop publicly cited continuing regulatory uncertainty when announcing closure.', sources: ['closure'], locator: 'Game Developer quotation of the marketplace shutdown notice.' },
        { key: 'materiality', assertion: 'Filed NFT-related revenue was not material.', sources: ['2024-10k'], locator: '2024 10-K digital-assets revenue disclosure.' },
        { key: 'decision-inference', assertion: 'Stopping a peripheral uncertain business is an analyst interpretation of the stated reason and immaterial revenue.', sources: ['closure', '2024-10k'], locator: 'Public rationale and filed materiality read together.', direction: 'context_only', note: 'No internal decision record was reviewed.' },
        { key: 'no-single-cause', assertion: 'The record does not prove low adoption, regulation or economics as the sole cause.', sources: ['closure', '2024-10k'], locator: 'Public sources disclose no complete causal decomposition.', direction: 'context_only' },
      ],
    },
    strategic_choices: {
      body: 'GameStop paired a self-custodial wallet with an Ethereum Layer 2 marketplace, starting with Loopring and contractually adding Immutable X as the first integration after Loopring. The Immutable deal used co-marketing and token grants tied to delivery and transaction milestones. This let GameStop enter quickly with external infrastructure, but split the product across partners and exposed it to token-grant optics, integration work and changing regulation. The company ultimately chose an orderly wind-down instead of a further pivot.',
      claims: [
        { key: 'self-custody', assertion: 'GameStop launched a self-custodial digital-asset wallet.', sources: ['2022-10q'], locator: '10-Q wallet launch description.' },
        { key: 'layer-two', assertion: 'The marketplace used Loopring and then integrated Immutable X.', sources: ['2022-10q', 'immutable-agreement'], locator: '10-Q timeline and agreement first-integration-after-Loopring clause.' },
        { key: 'incentives', assertion: 'The Immutable agreement tied IMX grants to specified milestones.', sources: ['immutable-agreement', 'sec-response'], locator: 'Agreement Exhibit A and SEC response grant summary.' },
        { key: 'wind-down-choice', assertion: 'GameStop chose to wind down both wallet and marketplace.', sources: ['2024-10k'], locator: '2024 10-K wind-down disclosure.' },
      ],
    },
    operating_model: {
      body: 'While live, GameStop supplied the customer interface, wallet and marketplace; Loopring and Immutable X supplied blockchain infrastructure, and creators or game publishers supplied assets. Customers paid marketplace charges, while the amended agreement assigned Immutable a 2 percent fee on covered primary and secondary transactions, subject to its terms. After closure, GameStop stopped the operating layer. Users had to rely on compatible wallets and other markets for any remaining transfer or resale path.',
      claims: [
        { key: 'roles', assertion: 'GameStop operated the customer product while protocol partners supplied infrastructure.', sources: ['2022-10q', 'immutable-agreement'], locator: '10-Q product descriptions and agreement service obligations.' },
        { key: 'customer-fees', assertion: 'The amended agreement states covered primary and trading fees were paid by customers or end users.', sources: ['immutable-amendment'], locator: 'Amendment fee-payment clauses.' },
        { key: 'immutable-fee', assertion: 'The agreement specified a 2 percent Immutable protocol fee on covered transactions, with a primary-sale exemption threshold.', sources: ['immutable-agreement'], locator: 'Agreement Exhibit A protocol fee terms.' },
        { key: 'post-closure', assertion: 'After closure, GameStop no longer supplied the marketplace interface.', sources: ['2024-10k', 'current-domain'], locator: '10-K wind-down and current NFT-domain redirect.' },
      ],
    },
    token_and_value_capture: {
      body: 'GameStop could earn customer transaction fees and received IMX milestone grants, while Immutable had its own 2 percent protocol fee under the agreement. Creators and sellers captured sale proceeds under marketplace terms. These flows must not be combined: an IMX grant to GameStop was not customer revenue, a protocol fee was not necessarily GameStop revenue, and owning an NFT did not entitle a customer to either. Exact GameStop fee rates, net revenue, operating costs and creator splits were not disclosed in the reviewed filings.',
      claims: [
        { key: 'gamestop-fees', assertion: 'GameStop described customer transaction fees as a source of marketplace revenue.', sources: ['sec-response', 'immutable-amendment'], locator: 'SEC response revenue description and amended customer-fee terms.' },
        { key: 'imx-grants', assertion: 'GameStop received and sold IMX granted under milestone provisions.', sources: ['sec-response'], locator: 'SEC response grant receipt and sale paragraphs.' },
        { key: 'protocol-fee', assertion: 'Immutable’s contractual 2 percent protocol fee was a separate flow.', sources: ['immutable-agreement'], locator: 'Agreement Exhibit A fee provision.' },
        { key: 'holder-boundary', assertion: 'NFT ownership did not create a claim on GameStop fees or IMX grants.', sources: ['immutable-agreement', 'immutable-amendment'], locator: 'Agreement ownership and fee provisions.', direction: 'context_only' },
        { key: 'economics-unknown', assertion: 'GameStop fee rates, net revenue, costs and creator splits were not disclosed in the reviewed record.', sources: ['2024-10k', 'sec-response'], locator: 'Filed materiality and agreement summary disclosures.', direction: 'context_only' },
      ],
    },
    counterfactual: {
      body: 'A narrower marketplace with exclusive gaming inventory, repeat buyer evidence and lower compliance burden might have justified continued investment. Publishing active users, repeat purchases, gross merchandise value, fee revenue and operating cost would also have made the decision legible. Remaining on one Layer 2 could have reduced integration complexity but narrowed supply. None of these alternatives is a measured result; the filings do not show that any one would have changed the shutdown decision.',
      claims: [
        { key: 'observed-complexity', assertion: 'The product integrated multiple Layer 2 partners and milestone obligations.', sources: ['2022-10q', 'immutable-agreement'], locator: 'Launch timeline and partner obligations.' },
        { key: 'metrics-gap', assertion: 'Active users, repeat purchases, GMV, detailed fee revenue and cost were not disclosed.', sources: ['2024-10k', 'sec-response'], locator: 'Filed program disclosures reviewed.', direction: 'context_only' },
        { key: 'scenario', assertion: 'Exclusive inventory, lower compliance burden and single-chain operation are unmeasured alternatives.', sources: ['closure', 'immutable-agreement'], locator: 'Observed closure rationale and multi-partner design used only to bound scenarios.', direction: 'context_only' },
      ],
    },
    risks_and_unknowns: {
      body: 'For the discontinued product, the main user risk is stranded discoverability and thin resale rather than an operating-platform failure. Tokens may remain onchain while metadata, media, wallet support or compatible markets degrade. The public record does not show how many users migrated assets, what liquidity survives, or whether any creator support obligations remain. It also does not disclose the full shutdown economics or management’s internal weighting of regulation, demand and cost.',
      claims: [
        { key: 'onchain-survival', assertion: 'The closure notice said NFTs would remain onchain and could be traded elsewhere.', sources: ['closure'], locator: 'Quoted GameStop shutdown notice.' },
        { key: 'platform-loss', assertion: 'GameStop discontinued its wallet and marketplace support.', sources: ['2024-10k'], locator: '2024 Form 10-K digital-assets wind-down paragraph.' },
        { key: 'migration-unknown', assertion: 'User migration, current liquidity and ongoing creator-support data were not disclosed.', sources: ['closure', 'current-domain'], locator: 'Closure report and current endpoint observation.', direction: 'context_only' },
        { key: 'cause-unknown', assertion: 'Internal weighting of regulation, demand and cost remains unknown.', sources: ['closure', '2024-10k'], locator: 'Public rationale and filed materiality do not provide an internal decision record.', direction: 'context_only' },
      ],
    },
    lifecycle: {
      body: 'GameStop signed the Immutable agreement in January 2022, launched its wallet in May, opened the marketplace in July and added Immutable X in November. By January 2023, it had earned the first three IMX grants but not the two largest volume milestones. The wallet was discontinued in 2023, the marketplace closed on February 2, 2024 and the 2024 Form 10-K described both as wound down. In August 2026 the old NFT hostname redirected to GameStop’s general retail site. This is a completed shutdown, not an active turnaround case.',
      claims: [
        { key: 'agreement', assertion: 'The Immutable agreement was signed in January 2022.', sources: ['immutable-agreement'], locator: 'Protocol Services and License Agreement effective-date clause.' },
        { key: 'launch-sequence', assertion: 'Wallet, marketplace and Immutable X integration launched during 2022.', sources: ['2022-10q'], locator: '10-Q dated launch sequence.' },
        { key: 'grant-state', assertion: 'The first three grants were achieved but highest volume milestones were not by January 2023.', sources: ['sec-response'], locator: 'SEC response milestone summary.' },
        { key: 'shutdown', assertion: 'The wallet and marketplace were wound down by February 2024.', sources: ['closure', '2024-10k'], locator: 'Closure notice and filed wind-down disclosure.' },
        { key: 'current-endpoint', assertion: 'The NFT hostname redirected to the general GameStop site on August 3, 2026.', sources: ['current-domain'], locator: 'Redirect observation at the research timestamp.' },
      ],
    },
    outlook_and_watch: {
      body: 'Base case: the marketplace remains closed and its former inventory survives only where contracts, media and third-party tools still work. Watch GameStop filings for a concrete digital-asset relaunch, the NFT hostname for a product rather than a redirect, and major creator collections for migration or metadata notices. A generic corporate blockchain statement would not be enough to call the marketplace revived. For legacy users, the useful signals are wallet access, metadata availability and actual bids on compatible markets.',
      claims: [
        { key: 'closed-base', assertion: 'Filed wind-down and the current redirect support a closed base case.', sources: ['2024-10k', 'current-domain'], locator: '10-K wind-down and August 2026 endpoint check.' },
        { key: 'revival-standard', assertion: 'A revival would require a concrete operating product, not a generic statement.', sources: ['current-domain', '2024-10k'], locator: 'Current absence of the marketplace and filed completed wind-down.', direction: 'context_only' },
        { key: 'legacy-watch', assertion: 'Legacy asset usability depends on compatible wallets, metadata and other markets.', sources: ['closure', 'immutable-agreement'], locator: 'Closure notice and asset-ownership provisions.' },
      ],
    },
  },
  events: [
    { key: 'agreement', type: 'partnership', date: '2022-01-27', description: 'GameStop and Immutable entered the protocol services and license agreement.', sources: ['immutable-agreement'], locator: 'Protocol Services and License Agreement effective-date clause.', assertion: 'The Immutable agreement began January 27, 2022.' },
    { key: 'marketplace-launch', type: 'product_launch', date: '2022-07-01', date_precision: 'month', description: 'GameStop launched its NFT marketplace in July 2022.', sources: ['2022-10q'], locator: '2022 Form 10-Q digital-assets launch timeline.', assertion: 'The marketplace launched in July 2022.' },
    { key: 'closure', type: 'shutdown', date: '2024-02-02', description: 'GameStop closed the NFT marketplace.', sources: ['closure', '2024-10k'], locator: 'Shutdown notice and 10-K wind-down.', assertion: 'The marketplace closed February 2, 2024.' },
    { key: 'current-review', type: 'research_review', date: '2026-08-03', description: 'Filings, closure evidence and the current endpoint were reviewed.', sources: ['2024-10k', 'current-domain'], locator: 'Named sources checked at the research timestamp.', assertion: 'GameStop NFT evidence was refreshed on August 3, 2026.' },
  ],
  unknowns: ['exact_gamestop_transaction_fee_rate', 'net_marketplace_revenue', 'operating_costs', 'historical_active_users_and_retention', 'legacy_asset_liquidity', 'metadata_persistence', 'internal_shutdown_decision_record'],
  guardrail: 'Do not combine customer fees, Immutable protocol fees, IMX grants, seller proceeds or NFT-holder value. Regulatory uncertainty was the stated rationale, not a proven sole cause.',
});

const runestoneSources = [
  source('runestone', 'runes-spec', 'Runes specification', 'https://docs.ordinals.com/runes.html', 'Ordinals documentation', null, 'A', 'primary', { independence_group: 'ordinals_protocol' }),
  source('runestone', 'dog-chain', 'DOG•GO•TO•THE•MOON Rune record', 'https://ordinals.com/rune/DOG%E2%80%A2GO%E2%80%A2TO%E2%80%A2THE%E2%80%A2MOON', 'Ordinals explorer', '2024-04-20', 'A', 'primary', { independence_group: 'bitcoin_chain_record' }),
  source('runestone', 'decrypt-airdrop', 'Bitcoin Ordinals Runestone airdrop', 'https://decrypt.co/219113/bitcoin-ordinals-runestone-airdrop-leonidas-casey-rodarmor-runes', 'Decrypt', '2024-02-20', 'B', 'independent', { independence_group: 'decrypt' }),
  source('runestone', 'decrypt-runes', 'Bitcoin Runes projects to know before the halving', 'https://decrypt.co/225282/bitcoin-ordinals-runes-projects-you-should-know-halving', 'Decrypt', '2024-04-11', 'B', 'independent', { independence_group: 'decrypt' }),
  source('runestone', 'decrypt-dog', 'Runestone will airdrop DOG meme coin to holders', 'https://decrypt.co/225338/bitcoin-runes-meme-coin-dog-airdrop-runestone', 'Decrypt', '2024-04-12', 'B', 'independent', { independence_group: 'decrypt' }),
  source('runestone', 'organizer', 'Leonidas Runestone and DOG distribution account', 'https://x.com/LeonidasNFT/status/2045604007008420267', 'Leonidas', null, 'C', 'primary', { independence_group: 'runestone_organizer', access_state: 'archived', archive_url: 'https://ww.twstalker.com/LeonidasNFT/status/2045604007008420267', access_method: 'indexed_mirror', direct_http_status: 200 }),
  source('runestone', 'coingecko', 'Runestone market data API', 'https://api.coingecko.com/api/v3/nfts/runestone', 'CoinGecko', null, 'B', 'aggregator', { independence_group: 'coingecko', access_method: 'json_api' }),
];

const runestone = buildProfile({
  slug: 'runestone', name: 'Runestone', type: 'ordinals_collection', aliases: ['Runestones'],
  subtype: 'free airdropped Bitcoin Ordinals collection and meme-token distribution artifact',
  tags: ['bitcoin_ordinals', 'fairdrop', 'runes', 'dog'], chains: ['Bitcoin Ordinals', 'Bitcoin Runes'], sources: runestoneSources,
  status: { value: 'community_artifact', sources: ['organizer', 'dog-chain', 'coingecko'], locator: 'Organizer retrospective, current onchain DOG record and August 3 collection-market snapshot.', assertion: 'Runestone persists as a traded community artifact linked to a live onchain DOG Rune rather than as an operator-run product roadmap.' },
  outcome: { value: 'community_artifact_thin_market', confidence: 'medium', sources: ['decrypt-airdrop', 'organizer', 'dog-chain', 'coingecko'], locator: 'Independent distribution history, organizer account, chain record and two-sale August snapshot.', assertion: 'Runestone achieved a broad free distribution and delivered DOG, while current NFT trading was thin and the project lacked a conventional operating business.', note: 'Organizer statements about no team or treasury are not independently audited, and supply sources disagree.' },
  sections: {
    what_it_is: {
      body: 'Runestone is a large Bitcoin Ordinals collection distributed free to qualifying wallets in 2024. It was created by the organizer known as Leonidas as a pre-Runes community artifact and later became the eligibility asset for DOG•GO•TO•THE•MOON. The collection must not be confused with a generic “runestone,” the protocol message used by Bitcoin Runes, or with DOG itself, which is a separate fungible Rune.',
      claims: [
        { key: 'collection', assertion: 'Runestone is a Bitcoin Ordinals collection distributed as a free airdrop.', sources: ['decrypt-airdrop'], locator: 'Decrypt airdrop description and eligibility paragraphs.' },
        { key: 'organizer', assertion: 'The collection was organized by Leonidas.', sources: ['decrypt-airdrop', 'organizer'], locator: 'Decrypt identification and organizer retrospective.' },
        { key: 'pre-runes', assertion: 'The NFT collection preceded the Runes launch and was not itself a fungible Rune.', sources: ['decrypt-airdrop', 'runes-spec'], locator: 'Decrypt timing/context and protocol distinction between inscriptions and runes.' },
        { key: 'dog-separate', assertion: 'DOG•GO•TO•THE•MOON is a separate fungible Rune recorded onchain.', sources: ['dog-chain', 'runes-spec'], locator: 'Ordinals Rune #3 record and Runes specification.' },
      ],
    },
    what_happened: {
      body: 'Eligibility was based on holding at least three qualifying non-text, non-JSON inscriptions at Bitcoin block 826,600. Decrypt reported 112,383 eligible addresses, with one Runestone sent to each. After Runes activated at the 2024 halving, Runestone holders received DOG; the chain record shows Rune #3 with a 100 billion premine. In the August 3, 2026 CoinGecko snapshot, the NFT collection recorded two reported sales and $164.17 of 24-hour volume. That is evidence of a thin market, not a dead artifact or broad liquidity.',
      claims: [
        { key: 'eligibility', assertion: 'Eligibility required at least three qualifying non-text, non-JSON inscriptions at block 826,600.', sources: ['decrypt-airdrop'], locator: 'Decrypt eligibility-rule paragraphs.' },
        { key: 'distribution', assertion: 'Decrypt reported 112,383 eligible addresses and one free Runestone per address.', sources: ['decrypt-airdrop'], locator: 'Decrypt distribution-count paragraphs.' },
        { key: 'dog-delivery', assertion: 'DOG was distributed to Runestone holders after Runes launched.', sources: ['decrypt-dog', 'organizer', 'dog-chain'], locator: 'Contemporaneous airdrop report, organizer retrospective and current chain record.' },
        { key: 'dog-supply', assertion: 'The chain record identifies DOG as Rune #3 with a 100 billion premine.', sources: ['dog-chain'], locator: 'Ordinals explorer Rune number, etching height and premine fields.' },
        { key: 'thin-snapshot', assertion: 'CoinGecko returned two NFT sales and $164.17 of 24-hour volume on August 3, 2026.', sources: ['coingecko'], locator: 'one_day_sales and volume_24h.usd API fields retrieved at 2026-08-03T18:05:00Z.' },
      ],
    },
    why_this_outcome: {
      body: 'Runestone spread because the mint price was zero, eligibility rewarded existing Ordinals participation and the collection arrived just before the Runes launch. The large distribution gave the organizer a ready holder graph for DOG, while the absence of a paid mint reduced the usual buyer-versus-team framing. That mechanism explains reach better than it explains durable NFT demand. Current trading is sparse, and the reviewed evidence cannot separate cultural attachment, DOG expectations and speculation as causes of value.',
      claims: [
        { key: 'free', assertion: 'Runestones were distributed without a mint price.', sources: ['decrypt-airdrop', 'organizer'], locator: 'Decrypt free-airdrop report and organizer distribution account.' },
        { key: 'community-filter', assertion: 'Eligibility selected wallets already participating in Ordinals.', sources: ['decrypt-airdrop'], locator: 'Eligibility based on three qualifying inscriptions.' },
        { key: 'runes-timing', assertion: 'The collection was distributed shortly before the Runes launch at the halving.', sources: ['decrypt-airdrop', 'decrypt-runes', 'dog-chain'], locator: 'Airdrop timing, Runes preview and DOG etching height 840,000.' },
        { key: 'cause-limit', assertion: 'Current evidence does not decompose cultural, token-expectation and speculative demand.', sources: ['decrypt-airdrop', 'decrypt-dog', 'coingecko'], locator: 'Historical reports and current thin snapshot.', direction: 'context_only' },
      ],
    },
    strategic_choices: {
      body: 'Leonidas chose a fairdrop instead of a paid mint, used objective onchain eligibility and sent one artifact per qualifying address. The collection had no conventional utility roadmap; its main later function was eligibility for a separate DOG distribution. The organizer says the allocation process was open-sourced and funded by donations rather than a team treasury. Those choices maximized symbolic fairness and reach, while leaving no obvious recurring revenue engine or formal service obligation.',
      claims: [
        { key: 'fairdrop', assertion: 'The launch used a free one-per-eligible-address distribution.', sources: ['decrypt-airdrop'], locator: 'Decrypt distribution design.' },
        { key: 'objective-rule', assertion: 'Eligibility was computed from an onchain block-height rule.', sources: ['decrypt-airdrop'], locator: 'Decrypt block 826,600 eligibility details.' },
        { key: 'no-roadmap', assertion: 'Leonidas said the project had no utility or roadmap at launch.', sources: ['decrypt-airdrop'], locator: 'Decrypt quotation of organizer statements.' },
        { key: 'donation-account', assertion: 'The organizer later said donations funded Runestone and DOG distribution and that the algorithm was open-sourced.', sources: ['organizer'], locator: 'Organizer retrospective distribution-cost and algorithm paragraphs.', note: 'Organizer account; not independently audited.' },
      ],
    },
    operating_model: {
      body: 'Runestone has no conventional company product in the reviewed record. Bitcoin stores the inscriptions, holders control them, and third-party markets support transfers. Leonidas coordinated eligibility, distribution and later DOG messaging. The organizer says there is no team allocation, official team or treasury; that statement is useful for describing intent but is not an audited control report. DOG operates under the Runes protocol as a separate fungible asset.',
      claims: [
        { key: 'chain-custody', assertion: 'The artifacts are Bitcoin inscriptions held and transferred by owners.', sources: ['decrypt-airdrop', 'runes-spec'], locator: 'Ordinals collection description and protocol distinction.' },
        { key: 'coordination', assertion: 'Leonidas coordinated the Runestone distribution and DOG link.', sources: ['decrypt-airdrop', 'decrypt-dog', 'organizer'], locator: 'Independent launch reports and organizer retrospective.' },
        { key: 'no-team-claim', assertion: 'The organizer claims there is no official team, treasury or team allocation.', sources: ['organizer'], locator: 'Organizer retrospective organizational statements.', note: 'Self-reported and not independently audited.' },
        { key: 'dog-protocol', assertion: 'DOG exists as a fungible asset under the Runes protocol.', sources: ['dog-chain', 'runes-spec'], locator: 'Rune #3 chain record and Runes specification.' },
      ],
    },
    token_and_value_capture: {
      body: 'The free Runestone distribution produced no collection mint revenue. Donors funded the inscription and DOG etching costs according to the organizer. Holders could capture value through NFT resale and received DOG, but the NFT and token have separate supplies and markets. A 100 percent DOG premine describes how the Rune was etched; it does not by itself prove who ultimately received the supply. No recurring royalty, treasury claim, company equity or contractual revenue share was found.',
      claims: [
        { key: 'no-mint-revenue', assertion: 'The Runestone distribution charged no mint price.', sources: ['decrypt-airdrop'], locator: 'Decrypt free-airdrop description.' },
        { key: 'donor-cost', assertion: 'The organizer said donations paid Runestone inscription and DOG etching costs.', sources: ['organizer'], locator: 'Organizer retrospective BTC cost figures.', note: 'Self-reported cost account.' },
        { key: 'holder-routes', assertion: 'Holders had NFT resale optionality and received the separate DOG asset.', sources: ['decrypt-dog', 'coingecko', 'dog-chain'], locator: 'DOG airdrop report, NFT market response and Rune record.' },
        { key: 'premine-limit', assertion: 'The 100 billion premine field alone does not prove downstream distribution.', sources: ['dog-chain'], locator: 'Onchain premine field without recipient-allocation proof.', direction: 'context_only' },
        { key: 'no-recurring-right', assertion: 'No recurring royalty, treasury or revenue-share right was found for Runestone holders.', sources: ['decrypt-airdrop', 'organizer'], locator: 'Launch design and organizer organizational account.', direction: 'context_only' },
      ],
    },
    counterfactual: {
      body: 'A paid mint or formal treasury could have funded continuing products, but it would have weakened the fairdrop premise and created clearer expectations of delivery. A recurring holder program could support NFT demand after DOG, while also turning a cultural artifact into a managed membership product. Publishing a signed distribution ledger and a stable supply reconciliation would improve auditability without changing the project’s lightweight model. These are untested alternatives, not forecasts.',
      claims: [
        { key: 'observed-fairdrop', assertion: 'The actual launch used a free distribution and donation-funded account.', sources: ['decrypt-airdrop', 'organizer'], locator: 'Independent airdrop report and organizer cost retrospective.' },
        { key: 'no-program', assertion: 'No conventional utility roadmap was promised at launch.', sources: ['decrypt-airdrop'], locator: 'Organizer statements quoted by Decrypt.' },
        { key: 'supply-gap', assertion: 'Published distribution and aggregator supply counts do not match.', sources: ['decrypt-airdrop', 'coingecko'], locator: 'Decrypt 112,383-address count versus CoinGecko total_supply 112,400.', direction: 'context_only' },
        { key: 'scenario', assertion: 'Treasury and recurring-program alternatives are not observed outcomes.', sources: ['organizer', 'decrypt-airdrop'], locator: 'Current lightweight model used only to bound counterfactuals.', direction: 'context_only' },
      ],
    },
    risks_and_unknowns: {
      body: 'The project’s meaning depends heavily on community memory, the organizer’s account and interest in DOG or Ordinals. There is no formal operating entity or contractual roadmap to underwrite future work. Supply reporting conflicts: Decrypt reported 112,383 eligible addresses, while CoinGecko returned 112,400 NFTs; neither figure should be silently normalized. The August 3 snapshot contained only two sales. Distribution audit details, holder concentration, executable bids, royalties and any ongoing obligations remain unknown.',
      claims: [
        { key: 'informal-control', assertion: 'No formal team or treasury was identified beyond organizer statements.', sources: ['organizer', 'decrypt-airdrop'], locator: 'Organizer retrospective and launch quotations.', note: 'Absence is not independently audited.' },
        { key: 'supply-conflict', assertion: 'Independent launch reporting and CoinGecko disagree on the relevant collection count.', sources: ['decrypt-airdrop', 'coingecko'], locator: '112,383 eligible addresses versus total_supply 112,400.' },
        { key: 'thin-market', assertion: 'CoinGecko returned only two sales in the prior 24 hours.', sources: ['coingecko'], locator: 'one_day_sales API field retrieved at 2026-08-03T18:05:00Z.' },
        { key: 'unknowns', assertion: 'Distribution audit, holder concentration, executable bids, royalties and ongoing obligations remain unverified.', sources: ['organizer', 'coingecko'], locator: 'Organizer account and bounded aggregator snapshot.', direction: 'context_only' },
      ],
    },
    lifecycle: {
      body: 'Runestone eligibility was calculated at block 826,600 and the free distribution followed in early 2024. The collection arrived ahead of Runes, then became the source cohort for DOG after the halving at block 840,000. The onchain DOG record remains available, and the NFT collection still had reported trades in August 2026. The lifecycle is best described as a delivered community artifact with a thin current market—not an operating company, and not erased simply because trading slowed.',
      claims: [
        { key: 'snapshot', assertion: 'Eligibility was fixed at Bitcoin block 826,600.', sources: ['decrypt-airdrop'], locator: 'Decrypt eligibility block.' },
        { key: 'distribution', assertion: 'The free Runestone distribution occurred before the Runes launch.', sources: ['decrypt-airdrop', 'decrypt-runes'], locator: 'Dated airdrop and pre-halving reporting.' },
        { key: 'dog', assertion: 'DOG was etched at block 840,000 as Rune #3.', sources: ['dog-chain'], locator: 'Ordinals explorer etching and Rune-number fields.' },
        { key: 'current-trades', assertion: 'The NFT collection still returned reported sales in August 2026.', sources: ['coingecko'], locator: 'CoinGecko one_day_sales response.' },
      ],
    },
    outlook_and_watch: {
      body: 'Base case: Runestone remains a recognizable Ordinals artifact whose trading is sporadic and whose strongest delivered utility was the DOG distribution. Watch 30- and 90-day unique buyers and sellers, executable bids, reconciliation of the collection supply, DOG distribution disclosures, organizer communications and any new holder-specific delivery. A DOG price move is not by itself evidence that the NFT collection is liquid, and a generic Runes “runestone” message is not activity in this collection.',
      claims: [
        { key: 'base-case', assertion: 'Delivered distribution history plus thin current trades support the community-artifact base case.', sources: ['decrypt-airdrop', 'decrypt-dog', 'coingecko'], locator: 'Launch, DOG and current market observations.', direction: 'context_only' },
        { key: 'market-watch', assertion: 'Longer-window participants and executable bids are required beyond the two-sale snapshot.', sources: ['coingecko'], locator: 'CoinGecko short-window fields.', direction: 'context_only' },
        { key: 'supply-watch', assertion: 'The 112,383 versus 112,400 count conflict needs reconciliation.', sources: ['decrypt-airdrop', 'coingecko'], locator: 'Independent eligibility count and aggregator supply field.' },
        { key: 'name-boundary', assertion: 'Generic protocol runestones, the Runestone collection and DOG are distinct objects.', sources: ['runes-spec', 'dog-chain', 'decrypt-airdrop'], locator: 'Protocol message definition, Rune record and collection report.' },
      ],
    },
  },
  metrics: [
    { key: 'floor-btc', dimension: 'floor_price', label: 'Listed floor', value: 0.001388, unit: 'btc', currency: 'BTC', as_of: '2026-08-03T18:05:00Z', window: { start: null, end: '2026-08-03T18:05:00Z', definition: 'point_in_time' }, method: 'CoinGecko marketplace aggregate', scope: { collection: 'Runestone', chain: 'Bitcoin Ordinals' }, sources: ['coingecko'], locator: 'floor_price.native_currency API field.', assertion: 'CoinGecko returned a 0.001388 BTC floor.', quality_flags: ['listing_not_executable_bid', 'underlying_marketplace_timestamp_unavailable', 'not_liquidity_measure'] },
    { key: 'volume-24h-usd', dimension: 'secondary_volume', label: 'Reported secondary volume, rolling 24 hours', value: 164.17, unit: 'usd', currency: 'USD', as_of: '2026-08-03T18:05:00Z', window: { start: null, end: '2026-08-03T18:05:00Z', definition: 'rolling_24h' }, method: 'CoinGecko marketplace aggregate', scope: { collection: 'Runestone', chain: 'Bitcoin Ordinals' }, sources: ['coingecko'], locator: 'volume_24h.usd API field.', assertion: 'CoinGecko returned $164.17 of 24-hour volume.', quality_flags: ['thin_observation', 'underlying_marketplace_timestamp_unavailable'] },
    { key: 'sales-24h', dimension: 'sales', label: 'Reported sales, rolling 24 hours', value: 2, unit: 'count', as_of: '2026-08-03T18:05:00Z', window: { start: null, end: '2026-08-03T18:05:00Z', definition: 'rolling_24h' }, method: 'CoinGecko marketplace aggregate', scope: { collection: 'Runestone', chain: 'Bitcoin Ordinals' }, sources: ['coingecko'], locator: 'one_day_sales API field.', assertion: 'CoinGecko returned two sales in the prior 24 hours.', quality_flags: ['thin_observation', 'not_liquidity_measure', 'underlying_marketplace_timestamp_unavailable'] },
    { key: 'holders', dimension: 'holders', label: 'Unique holder addresses', value: 63743, unit: 'addresses', as_of: '2026-08-03T18:05:00Z', window: { start: null, end: '2026-08-03T18:05:00Z', definition: 'point_in_time' }, method: 'CoinGecko marketplace aggregate', scope: { collection: 'Runestone', chain: 'Bitcoin Ordinals' }, sources: ['coingecko'], locator: 'number_of_unique_addresses API field.', assertion: 'CoinGecko returned 63,743 holder addresses.', quality_flags: ['addresses_not_people', 'underlying_marketplace_timestamp_unavailable'] },
    { key: 'supply', dimension: 'supply', label: 'Aggregator-reported collection supply', value: 112400, unit: 'inscriptions', as_of: '2026-08-03T18:05:00Z', window: { start: null, end: '2026-08-03T18:05:00Z', definition: 'point_in_time' }, method: 'CoinGecko marketplace aggregate', scope: { collection: 'Runestone', chain: 'Bitcoin Ordinals' }, sources: ['coingecko', 'decrypt-airdrop'], locator: 'CoinGecko total_supply versus Decrypt 112,383 eligible-address count.', assertion: 'CoinGecko returned 112,400 supply, which conflicts with the reported 112,383-address distribution.', quality_flags: ['supply_conflict', 'do_not_silently_normalize'] },
  ],
  events: [
    { key: 'eligibility', type: 'eligibility_snapshot', date: '2024-01-21', description: 'Eligibility was calculated at Bitcoin block 826,600.', sources: ['decrypt-airdrop'], locator: 'Decrypt eligibility block.', assertion: 'The eligibility snapshot used block 826,600.' },
    { key: 'airdrop', type: 'collection_distribution', date: '2024-03-01', date_precision: 'month', description: 'Runestones were distributed free to qualifying addresses.', sources: ['decrypt-airdrop'], locator: 'Decrypt airdrop report.', assertion: 'The free Runestone distribution occurred in early 2024.' },
    { key: 'dog-etch', type: 'token_etching', date: '2024-04-20', description: 'DOG•GO•TO•THE•MOON was etched as Rune #3 at block 840,000.', sources: ['dog-chain'], locator: 'Current Rune chain record.', assertion: 'DOG was etched April 20, 2024.' },
    { key: 'current-review', type: 'research_review', date: '2026-08-03', description: 'Current protocol, chain, organizer and market evidence was reviewed.', sources: ['runes-spec', 'dog-chain', 'organizer', 'coingecko'], locator: 'Named sources checked at the research timestamp.', assertion: 'Runestone evidence was refreshed on August 3, 2026.' },
  ],
  unknowns: ['collection_supply_reconciliation', 'independently_audited_distribution_ledger', 'holder_identity_concentration', 'executable_bid_depth', 'current_royalties', 'ongoing_obligations', 'formal_control_structure'],
  guardrail: 'Keep the Runestone NFT collection, generic Runes protocol messages and DOG fungible Rune separate. Preserve the 112,383 versus 112,400 supply conflict.',
  methodologyNotes: ['Organizer claims about donations, allocation and lack of a team are labeled self-reported. Two 24-hour sales are treated as a thin observation.'],
});

export const document = {
  schema: 'chaindump-nft-canonical-wave',
  version: 1,
  researched_at: ACCESSED_AT,
  generated_migration: '0078_nft_canonical_profiles.sql',
  entities: [
    { slug: 'bored-ape-yacht-club', legacy_status: 'middling', canonical_profile: bayc },
    { slug: 'pudgy-penguins', legacy_status: 'thriving', canonical_profile: pudgy },
    { slug: 'nba-top-shot', legacy_status: 'middling', canonical_profile: topShot },
    { slug: 'gamestop-nft-marketplace', legacy_status: 'failed', canonical_profile: gameStop },
    { slug: 'runestone', legacy_status: 'middling', canonical_profile: runestone },
  ],
};

export const profiles = Object.fromEntries(document.entities.map((entry) => [entry.slug, entry.canonical_profile]));

export function renderMigration(value = document) {
  const inserts = value.entities.map((entry) => {
    const slug = String(entry.slug).replaceAll("'", "''");
    const status = String(entry.legacy_status).replaceAll("'", "''");
    const canonical = JSON.stringify(entry.canonical_profile).replaceAll("'", "''");
    return `INSERT INTO _nft_canonical_profiles_0078 (slug, status, canonical_profile)
VALUES ('${slug}', '${status}', '${canonical}');`;
  }).join('\n\n');
  return `-- Five source-linked NFT and Ordinals profiles researched 2026-08-03 and awaiting human review.
-- Existing legacy profile fields are preserved; canonical consumers use profile.canonical_profile.

DROP TABLE IF EXISTS _nft_canonical_profiles_0078;

CREATE TABLE _nft_canonical_profiles_0078 (
  slug TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  canonical_profile TEXT NOT NULL CHECK (json_valid(canonical_profile))
);

-- canonical-payload-start
${inserts}
-- canonical-payload-end

UPDATE nft_collections AS collection
SET
  status = staged.status,
  profile = json_set(
    COALESCE(collection.profile, '{}'),
    '$.canonical_profile', json(staged.canonical_profile)
  ),
  updated_at = '2026-08-03'
FROM _nft_canonical_profiles_0078 AS staged
WHERE collection.slug = staged.slug;

DROP TABLE _nft_canonical_profiles_0078;
`;
}

function writeOutputs() {
  const documentPath = fileURLToPath(new URL('../docs/nft-canonical-wave-2026-08-03.json', import.meta.url));
  const migrationPath = fileURLToPath(new URL('../migrations/0078_nft_canonical_profiles.sql', import.meta.url));
  writeFileSync(documentPath, `${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(migrationPath, renderMigration());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) writeOutputs();

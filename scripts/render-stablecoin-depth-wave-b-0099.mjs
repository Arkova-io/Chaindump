#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYSIS_SECTION_KEYS, validateEntityProfile } from '../src/lib/entity-profile.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(root, 'docs/stablecoin-depth-wave-b-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0099_stablecoin_depth_wave_b.sql');
const AS_OF = '2026-08-03';
const ACCESSED_AT = '2026-08-03T21:48:00Z';
const NEXT_REVIEW_AT = '2026-08-10T21:48:00Z';
const MARKET_URL = 'https://stablecoins.llama.fi/stablecoins?includePrices=true';
const MAX_D1_STATEMENT_BYTES = 95_000;
const TARGET_TABLE = '_stablecoin_depth_wave_b_0099';

const sourceId = (slug, key) => `source:${slug}:${key}`;

function source(slug, key, title, url, publisher, publishedAt, role, details = {}) {
  return {
    id: sourceId(slug, key),
    title,
    url,
    publisher,
    published_at: publishedAt,
    published_at_precision: details.published_at_precision || (publishedAt ? 'day' : null),
    accessed_at: ACCESSED_AT,
    archive_url: null,
    tier: details.tier || (role === 'primary' ? 'A' : 'B'),
    role,
    access_state: details.access_state || 'reachable',
    checked_at: ACCESSED_AT,
    access_final_url: details.final_url || url,
    content_hash: null,
    independence_group: details.independence_group || publisher,
    access_method: details.access_method || 'direct_http',
    direct_http_status: details.direct_http_status === undefined ? 200 : details.direct_http_status,
  };
}

function section(body, sourceKeys, conclusion, conclusionKind = 'inference', locator = 'The cited records establish the factual baseline; the conclusion is the analyst interpretation of that record.') {
  const firstSentence = body.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || body;
  return {
    body,
    claims: [
      { assertion: firstSentence, sources: sourceKeys, locator, kind: 'fact' },
      { assertion: conclusion, sources: sourceKeys, locator, kind: conclusionKind },
    ],
  };
}

function marketMetrics(spec) {
  const isPaymentStablecoin = spec.market.kind === 'payment_stablecoin';
  const thirdDimension = isPaymentStablecoin ? 'peg_deviation' : 'price_premium_to_initial_unit';
  const thirdLabel = isPaymentStablecoin ? 'Observed peg deviation' : 'Observed premium to initial $1 unit';
  const deviation = Number(((spec.market.price - 1) * 100).toFixed(4));
  const totalLabel = isPaymentStablecoin ? 'Circulating supply' : 'Observed tokenized asset value';
  return [
    {
      key: `tokenized-value-${AS_OF}`,
      dimension: isPaymentStablecoin ? 'circulating_supply' : 'tokenized_asset_value',
      label: totalLabel,
      value: spec.market.value,
      unit: 'usd',
      currency: 'USD',
      method: 'DefiLlama peggedAssets circulating.peggedUSD field.',
      assertion: `DefiLlama reported ${spec.market.value} USD for this product at the observation time.`,
      qualityFlags: ['aggregator_snapshot', 'multi_chain_sum', 'provider_can_revise', ...(isPaymentStablecoin ? [] : ['classification_is_not_payment_stablecoin'])],
    },
    {
      key: `price-${AS_OF}`,
      dimension: 'price',
      label: 'Observed market or reference price',
      value: spec.market.price,
      unit: 'usd',
      currency: 'USD',
      method: 'DefiLlama peggedAssets price field.',
      assertion: `DefiLlama reported a price of ${spec.market.price} USD at the observation time.`,
      qualityFlags: ['aggregator_snapshot', 'price_point_not_executable_redemption', 'provider_can_revise'],
    },
    {
      key: `${thirdDimension}-${AS_OF}`,
      dimension: thirdDimension,
      label: thirdLabel,
      value: deviation,
      unit: 'percent',
      currency: null,
      method: isPaymentStablecoin
        ? 'Computed as (DefiLlama price - 1 USD) × 100.'
        : 'Computed as (DefiLlama price - initial 1 USD unit reference) × 100; this is accumulated value, not a depeg.',
      assertion: isPaymentStablecoin
        ? `The observed market price was ${deviation}% away from one dollar.`
        : `The observed unit price was ${deviation}% above the initial one-dollar reference; this is not classified as a peg deviation.`,
      qualityFlags: isPaymentStablecoin
        ? ['computed_from_aggregator_snapshot', 'not_a_liquidity_measure', 'not_a_redemption_test']
        : ['computed_from_aggregator_snapshot', 'yield_accrual_or_distribution_model_matters', 'not_a_peg_measure'],
    },
  ].map((metric) => ({
    ...metric,
    window: { start: null, end: AS_OF, definition: 'provider_snapshot' },
    asOf: AS_OF,
  }));
}

function buildProfile(spec) {
  const claims = [];
  const sections = {};
  for (const key of ANALYSIS_SECTION_KEYS) {
    const value = spec.sections[key];
    if (!value) throw new Error(`${spec.slug}: missing ${key}`);
    const claimIds = value.claims.map((item, index) => {
      const id = `claim:${spec.slug}:section:${key}:${index + 1}`;
      claims.push({
        id,
        field_path: `analysis.sections.${key}.body#${index + 1}`,
        assertion: item.assertion,
        value: item.assertion,
        as_of: AS_OF,
        confidence: item.kind === 'unknown' ? 'medium' : 'high',
        kind: item.kind,
        source_ids: item.sources.map((keyValue) => sourceId(spec.slug, keyValue)),
        evidence_locator: item.locator,
        support_direction: item.kind === 'unknown' ? 'context_only' : 'supports',
        note: null,
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
      assertion: spec.statusAssertion,
      value: spec.operatingState,
      as_of: AS_OF,
      confidence: 'high',
      kind: 'fact',
      source_ids: spec.statusSources.map((keyValue) => sourceId(spec.slug, keyValue)),
      evidence_locator: spec.statusLocator,
      support_direction: 'supports',
      note: null,
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    },
    {
      id: outcomeClaimId,
      field_path: 'outcome.label',
      assertion: spec.outcomeAssertion,
      value: spec.outcome,
      as_of: AS_OF,
      confidence: spec.outcomeConfidence,
      kind: 'inference',
      source_ids: spec.outcomeSources.map((keyValue) => sourceId(spec.slug, keyValue)),
      evidence_locator: spec.outcomeLocator,
      support_direction: 'supports',
      note: 'Lifecycle classification, not a guarantee of redemption, solvency, liquidity or future price.',
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    },
  );

  const metrics = marketMetrics(spec).map((item) => {
    const id = `metric:${spec.slug}:${item.key}`;
    const claimId = `claim:${spec.slug}:metric:${item.key}`;
    claims.push({
      id: claimId,
      field_path: `metrics[${id}]`,
      assertion: item.assertion,
      value: item.value,
      as_of: item.asOf,
      confidence: 'high',
      kind: 'fact',
      source_ids: [sourceId(spec.slug, 'market')],
      evidence_locator: 'DefiLlama stablecoins API snapshot retrieved at the recorded observation time.',
      support_direction: 'supports',
      note: 'Point-in-time aggregator observation; not proof of reserve sufficiency, NAV or executable redemption.',
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    });
    return {
      id,
      dimension: item.dimension,
      label: item.label,
      value: item.value,
      unit: item.unit,
      currency: item.currency,
      window: item.window,
      as_of: item.asOf,
      method: item.method,
      scope: { product: spec.name, chains: spec.classification.chains },
      formula: null,
      raw_input_ids: [],
      claim_ids: [claimId],
      quality_flags: item.qualityFlags,
      headline: item.dimension === 'circulating_supply' || item.dimension === 'tokenized_asset_value',
    };
  });

  const events = spec.events.map((item) => {
    const id = `event:${spec.slug}:${item.key}`;
    const claimId = `claim:${spec.slug}:event:${item.key}`;
    claims.push({
      id: claimId,
      field_path: `events[${id}]`,
      assertion: item.description,
      value: item.date,
      as_of: item.date,
      confidence: 'high',
      kind: 'fact',
      source_ids: item.sources.map((keyValue) => sourceId(spec.slug, keyValue)),
      evidence_locator: item.locator,
      support_direction: 'supports',
      note: item.datePrecision === 'day' ? null : `Source precision: ${item.datePrecision}.`,
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    });
    return { id, type: item.type, date: item.date, date_precision: item.datePrecision, description: item.description, claim_ids: [claimId] };
  });

  const profile = {
    schema: 'chaindump-entity-profile',
    version: 1,
    identity: { id: `stablecoin:${spec.slug}`, type: 'stablecoin', slug: spec.slug, name: spec.name, aliases: spec.aliases },
    classification: spec.classification,
    status: { operating_state: spec.operatingState, as_of: AS_OF, claim_ids: [statusClaimId] },
    outcome: { label: spec.outcome, as_of: AS_OF, rule_id: 'stablecoin-and-tokenized-cash-lifecycle-evidence-v1', confidence: spec.outcomeConfidence, claim_ids: [outcomeClaimId] },
    analysis: { sections },
    metrics,
    events,
    sources: spec.sources,
    claims,
    freshness: { state: 'current', last_reviewed_at: ACCESSED_AT, next_review_at: NEXT_REVIEW_AT, field_reviews: [] },
    quality: { publication_state: 'review', completeness_pct: 100, confidence: spec.outcomeConfidence, unsourced_fields: spec.unknowns },
    extensions: {
      legacy_origin: 'stablecoin_meta',
      dataset_classification: spec.datasetClassification,
      identity_boundary: spec.identityBoundary,
      reserve_boundary: spec.reserveBoundary,
      redemption_boundary: spec.redemptionBoundary,
      value_capture_boundary: spec.valueCaptureBoundary,
      editorial_guardrail: spec.guardrail,
      explicit_unknowns: spec.unknowns,
      methodology_notes: [
        'Every material field remains pending until a person reviews the cited evidence.',
        'Payment stablecoins, fund shares, private-fund securities and tokenized notes are labeled by legal and economic structure rather than grouped as interchangeable dollar tokens.',
        'Market price, issuer redemption, NAV, reserve value, circulating supply, tokenized asset value and holder yield answer different questions.',
      ],
    },
  };

  const errors = validateEntityProfile(profile);
  if (errors.length) throw new Error(`${spec.slug}: ${JSON.stringify(errors)}`);
  for (const [key, value] of Object.entries(sections)) {
    if (value.body.length < 300 || value.body.length > 1000) throw new Error(`${spec.slug}.${key}: section length ${value.body.length}`);
  }
  return profile;
}

const usd1Slug = 'usd1';
const usd1Sources = [
  source(usd1Slug, 'product', 'Meet USD1', 'https://worldlibertyfinancial.com/usd1', 'World Liberty Financial', null, 'primary'),
  source(usd1Slug, 'terms', 'USD1 Terms', 'https://www.bitgo.com/usd1-terms/', 'BitGo', null, 'primary'),
  source(usd1Slug, 'faq', 'World Liberty Financial FAQ', 'https://docs.worldlibertyfinancial.com/resources/faq', 'World Liberty Financial', null, 'primary'),
  source(usd1Slug, 'attestations', 'USD1 Attestations', 'https://www.bitgo.com/uk/usd1/attestations/', 'BitGo', null, 'primary'),
  source(usd1Slug, 'launch', 'World Liberty Financial Plans to Launch USD1', 'https://via.ritzau.dk/pressemeddelelse/14324001/world-liberty-financial-plans-to-launch-usd1-the-institutional-ready-stablecoin?lang=en&publisherId=90456', 'World Liberty Financial via Business Wire', '2025-03-25', 'primary'),
  source(usd1Slug, 'mgx', 'Pakistan to partner with World Liberty affiliate on USD1 stablecoin', 'https://www.investing.com/news/stock-market-news/exclusivepakistan-to-partner-with-world-liberty-financial-on-dollarlinked-stablecoin-source-says-4446070', 'Reuters via Investing.com', '2026-01-14', 'independent', { independence_group: 'Reuters', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source(usd1Slug, 'concentration', "Trump's Stablecoin USD1: Binance Holds 87%", 'https://www.forbes.com/sites/zacheverson/2026/02/09/trump-stablecoin-usd1-binance-holds-87-percent/', 'Forbes', '2026-02-09', 'independent'),
  source(usd1Slug, 'occ', 'Digital Assets Licensing Applications', 'https://www.occ.gov/topics/charters-and-licensing/digital-assets-licensing-applications/index-digital-assets-licensing-applications.html', 'Office of the Comptroller of the Currency', null, 'primary', { independence_group: 'OCC' }),
  source(usd1Slug, 'market', 'DefiLlama stablecoins API', MARKET_URL, 'DefiLlama', null, 'aggregator'),
];

const usd1 = buildProfile({
  slug: usd1Slug,
  name: 'World Liberty Financial USD',
  aliases: ['USD1'],
  datasetClassification: 'payment_stablecoin',
  classification: {
    subtype: 'fiat-backed payment stablecoin with third-party issuer and custodian',
    tags: ['fiat_backed', 'payments', 'bitgo', 'world_liberty_brand', 'exchange_concentration', 'political_conflict_risk'],
    chains: ['Ethereum', 'BNB Chain', 'Solana', 'Aptos', 'Tron', 'Monad', 'Plume', 'Abcore'],
    jurisdictions: ['United States'],
  },
  sources: usd1Sources,
  operatingState: 'operating_at_scale_with_concentrated_distribution',
  statusAssertion: 'USD1 remains live across several chains with BitGo issuance and redemption terms, monthly reserve reporting and roughly $4.00 billion observed supply.',
  statusSources: ['product', 'terms', 'faq', 'attestations', 'market'],
  statusLocator: 'Current product, issuer, reserve-reporting and market-data pages.',
  outcome: 'fast_growth_from_deal_and_exchange_distribution_with_high_concentration',
  outcomeConfidence: 'high',
  outcomeAssertion: 'USD1 reached multi-billion-dollar scale unusually quickly because one large Binance transaction and later exchange distribution created supply and liquidity, but that same route left the product highly concentrated and politically exposed.',
  outcomeSources: ['launch', 'mgx', 'concentration', 'market', 'terms'],
  outcomeLocator: 'Launch record, Reuters transaction history, independent holder analysis, current terms and supply snapshot.',
  market: { kind: 'payment_stablecoin', value: 4002406219.4664216, price: 0.9988727819686456 },
  sections: {
    what_it_is: section('USD1 is a dollar payment token branded by World Liberty Financial and issued through BitGo. BitGo’s current terms say approved customers can exchange one USD1 for one U.S. dollar, while World Liberty owns the brand and provides services around it. The reserve is described as cash, U.S. government money-market funds and similar cash equivalents. A token holder does not own World Liberty, BitGo or the interest earned on those assets.', ['product', 'terms', 'faq'], 'USD1 is a conventional reserve-backed stablecoin with an unusual split between the commercial brand and the issuing infrastructure.'),
    what_happened: section('World Liberty announced USD1 in March 2025 and initially launched it on Ethereum and BNB Chain. Its defining growth event came weeks later: Abu Dhabi-backed MGX used about $2 billion of USD1 to settle its investment in Binance. Distribution then widened across exchanges and additional chains. DefiLlama observed about $4.00 billion in supply on 2026-08-03, while a February 2026 Forbes analysis estimated Binance controlled roughly 87 percent of the then-current supply.', ['launch', 'mgx', 'concentration', 'market'], 'USD1 did not grow through years of ordinary retail use; a very large institutional deal and Binance distribution created its first major scale.'),
    why_this_outcome: section('USD1 succeeded at raising supply because World Liberty paired political and institutional access with BitGo’s custody and issuance stack, then won a transaction large enough to make the token relevant immediately. Binance supplied trading, balances and incentives after the MGX deal. That combination solved the cold-start problem faster than a standalone issuer could. It also means headline supply overstates diversified adoption: a large balance at one exchange is not the same as millions of independent users choosing the token.', ['mgx', 'concentration', 'faq', 'market'], 'Distribution concentration is both the reason USD1 scaled and the main reason its adoption quality remains uncertain.'),
    strategic_choices: section('World Liberty chose not to build the reserve, minting and redemption system alone; it used BitGo and kept the brand, partnerships and reserve-linked commercial economics. It targeted institutions and exchanges before everyday payments, accepted a single enormous settlement as an anchor balance and expanded to many chains. It also applied for a national trust bank charter in 2026. These choices favored speed, visibility and reserve income, while creating dependence on BitGo, Binance and politically sensitive relationships.', ['faq', 'terms', 'mgx', 'occ', 'market'], 'USD1 chose concentrated institutional distribution first and broader organic usage second.'),
    operating_model: section('BitGo’s terms govern direct minting and redemption for eligible customers and allow compliance checks, restrictions and forfeiture in specified illegal-activity cases. Reserve assets are held and monthly reports are published; World Liberty markets the token and participates in the surrounding economics. Most holders will trade or convert through an exchange rather than redeem directly. The current terms contain an unresolved drafting placeholder about the issuer, so the legal identity should be confirmed before treating the document as perfectly settled.', ['terms', 'attestations', 'faq'], 'Direct par redemption is an eligibility-dependent BitGo service, while market liquidity and World Liberty branding are separate layers.'),
    token_and_value_capture: section('USD1 holders receive a transferable dollar token but no contractual share of reserve interest. World Liberty’s own disclosures say affiliated entities can earn from the reserves, and BitGo is paid for issuance, custody and related services. Exchanges can add their own rewards to attract balances. The product therefore monetizes stored balances and distribution rather than charging the holder an obvious yield fee. Political influence, brand equity and the WLFI governance token are separate from USD1 redemption rights.', ['product', 'terms', 'faq', 'mgx'], 'Reserve income and distribution benefits flow to the commercial partners, not automatically to ordinary USD1 holders.'),
    counterfactual: section('World Liberty could have used USDC or USDG for the MGX settlement, issued USD1 entirely in-house, or delayed launch until it had a broader payment network. Using an incumbent would have reduced reserve and launch work but surrendered the large reserve balance and branded asset. Direct issuance might capture more economics but add operational and regulatory burden. A slower retail build could diversify holders but might never reach comparable scale. Public evidence cannot show which path would have produced durable usage.', ['launch', 'mgx', 'terms', 'occ'], 'The $2 billion anchor transaction delivered scale, but no controlled evidence shows that it delivered the best long-term distribution.' , 'counterfactual'),
    risks_and_unknowns: section('The main risks are Binance and large-holder concentration, political conflicts, brand and issuer separation, BitGo operational dependence, reserve-custodian exposure, legal freezes, smart-contract controls and uneven liquidity across chains. The OCC application is pending, not an approval. Public reporting does not reconcile direct redemption volume, failed or delayed redemptions, reserve income sharing, beneficial ownership, customer count, merchant payment volume or the share of supply held for exchange promotions rather than recurring use.', ['terms', 'attestations', 'concentration', 'occ', 'market'], 'A stable market price and monthly report do not resolve governance, concentration or conflict-of-interest risk.'),
    lifecycle: section('USD1 moved from announcement to multi-billion-dollar supply faster than most stablecoins because the MGX transaction created a huge starting balance. It then expanded across chains and exchange products while World Liberty sought a federal trust charter. The lifecycle call is growing but concentrated: the token is active and economically material, yet its history is short and much of the distribution case remains tied to Binance. Its next test is whether balances diversify and repeat payment or settlement demand survives after promotions and major deals fade.', ['launch', 'mgx', 'concentration', 'occ', 'market'], 'USD1 has proven access to large deals, not yet broad or politically independent product-market fit.'),
    outlook_and_watch: section('Base case: USD1 remains a large exchange and institutional-settlement stablecoin while BitGo maintains reserve and redemption operations. Watch Binance’s share of supply, monthly reserve timeliness, reserve composition, direct redemption results, bid depth across chains, new institutional settlements, merchant volume, OCC charter status and related-party disclosures. The call improves if holders and venues diversify without subsidies. It worsens if a political investigation, BitGo interruption or Binance outflow exposes how little independent demand exists.', ['attestations', 'concentration', 'occ', 'market', 'mgx'], 'The decisive signal is diversified repeat usage, not another headline mint or partnership announcement.'),
  },
  events: [
    { key: 'launch', type: 'product_launch', date: '2025-03-25', datePrecision: 'day', description: 'World Liberty Financial announced USD1 as a BitGo-supported dollar stablecoin for institutional and cross-border use.', sources: ['launch'], locator: 'Dated launch announcement.' },
    { key: 'mgx-settlement', type: 'institutional_settlement', date: '2025-05-01', datePrecision: 'day', description: 'World Liberty said MGX would use about $2 billion of USD1 to settle its investment in Binance.', sources: ['mgx'], locator: 'Reuters reporting on the dated Token2049 announcement.' },
    { key: 'occ-application', type: 'regulatory_application', date: '2026-01-06', datePrecision: 'day', description: 'The OCC recorded World Liberty Trust Company, N.A. as a pending digital-asset charter application.', sources: ['occ'], locator: 'OCC application table.' },
  ],
  identityBoundary: 'USD1, the WLFI governance token, World Liberty Financial, BitGo, World Liberty Trust Company and participating exchanges are separate assets or legal actors.',
  reserveBoundary: 'USD1 redemption assets, World Liberty corporate assets, WLFI token treasury value and exchange balances must not be combined.',
  redemptionBoundary: 'BitGo account redemption, exchange conversion and a secondary-market sale are different paths with different eligibility and liquidity.',
  valueCaptureBoundary: 'Reserve income, BitGo service fees, exchange rewards, World Liberty economics and WLFI token value are separate.',
  guardrail: 'Describe documented political and commercial conflicts without alleging a quid pro quo, and do not treat a pending OCC charter as approval.',
  unknowns: ['direct_redemption_volume_and_latency', 'reserve_income_allocation', 'beneficial_ownership', 'merchant_payment_volume', 'customer_count', 'exchange_promotion_share', 'cross_chain_liquidity_depth', 'final_occ_charter_outcome'],
});

const usycSlug = 'usyc';
const usycSources = [
  source(usycSlug, 'overview', 'USYC Overview', 'https://developers.circle.com/tokenized/usyc/overview', 'Circle', null, 'primary'),
  source(usycSlug, 'product', 'USYC Tokenized Money Market Fund', 'https://www.circle.com/usyc', 'Circle', null, 'primary', { access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source(usycSlug, 'redemption', 'Subscribe and Redeem USYC Using the Teller Smart Contract', 'https://developers.circle.com/tokenized/usyc/subscribe-and-redeem', 'Circle', null, 'primary'),
  source(usycSlug, 'acquisition', 'Circle Announces Acquisition of Hashnote and USYC', 'https://www.circle.com/pressroom/circle-announces-acquisition-of-hashnote-and-usyc-tokenized-money-market-fund-alongside-strategic-partnership-with-global-trading-firm-drw', 'Circle', '2025-01-21', 'primary'),
  source(usycSlug, 'year-review', 'Circle 2025 Year in Review', 'https://www.circle.com/executiveinsights/circle-2025-year-in-review', 'Circle', null, 'primary'),
  source(usycSlug, 'milestone', 'The Advantages of Tokenized Money Market Funds', 'https://www.circle.com/blog/the-advantages-of-tokenized-money-market-funds', 'Circle', '2026-03-23', 'primary'),
  source(usycSlug, 'rwa', 'Circle USYC', 'https://app.rwa.xyz/assets/USYC', 'RWA.xyz', null, 'aggregator'),
  source(usycSlug, 'independent', 'The Treasury Flip and Sticky Institutional Capital', 'https://sentora.com/research/articles/the-treasury-flip-and-sticky-institutional-capital', 'Sentora Research', '2026-06-26', 'independent'),
  source(usycSlug, 'market', 'DefiLlama stablecoins API', MARKET_URL, 'DefiLlama', null, 'aggregator'),
];

const usyc = buildProfile({
  slug: usycSlug,
  name: 'Circle USYC',
  aliases: ['USYC', 'US Yield Coin'],
  datasetClassification: 'tokenized_mutual_fund_share_not_payment_stablecoin',
  classification: {
    subtype: 'tokenized Cayman mutual-fund interest with accumulating NAV',
    tags: ['tokenized_fund_share', 'money_market_fund', 'reverse_repo', 'non_us_investors', 'usdc_redemption', 'institutional_collateral'],
    chains: ['Ethereum', 'BNB Chain', 'Solana', 'Canton'],
    jurisdictions: ['Cayman Islands', 'Bermuda'],
  },
  sources: usycSources,
  operatingState: 'operating_and_scaling_as_institutional_tokenized_fund',
  statusAssertion: 'USYC remains an operating tokenized fund interest with non-U.S. eligibility, USDC subscription and redemption rails and roughly $3.01 billion of observed tokenized value.',
  statusSources: ['overview', 'product', 'redemption', 'milestone', 'market'],
  statusLocator: 'Current Circle product and developer documentation plus dated growth and market observations.',
  outcome: 'successful_institutional_cash_and_collateral_product',
  outcomeConfidence: 'high',
  outcomeAssertion: 'USYC became a leading tokenized cash product by combining Treasury and reverse-repo yield with fast USDC entry and exit, Circle distribution and institutional collateral integrations, not by acting like a retail one-dollar payment coin.',
  outcomeSources: ['overview', 'acquisition', 'year-review', 'milestone', 'independent', 'market'],
  outcomeLocator: 'Legal structure, acquisition, distribution expansion, milestone and independent market analysis.',
  market: { kind: 'accruing_fund_share', value: 3006541459.467986, price: 1.132968209384809 },
  sections: {
    what_it_is: section('USYC is not a one-dollar stablecoin. Each token represents an interest in the Hashnote International Short Duration Yield Fund, a Cayman Islands mutual fund, and its unit price rises as income accrues. Circle International Bermuda administers the token for the fund. The portfolio primarily uses reverse repos backed by U.S. government securities. Only eligible non-U.S. persons can subscribe, and holding USYC is different from holding USDC or a bank deposit.', ['overview', 'product'], 'USYC should be compared with tokenized money-market funds, not judged as though a price above one dollar were a broken peg.'),
    what_happened: section('Hashnote launched USYC in 2023 and built it as onchain institutional cash. Circle bought Hashnote in January 2025, linked USYC more closely to USDC liquidity and expanded it across BNB Chain and Solana. Circle reported $1.54 billion at the end of 2025 and said assets passed $2 billion in March 2026. DefiLlama observed about $3.01 billion of tokenized value and a $1.133 unit price on 2026-08-03; that higher price reflects accumulated value, not a depeg.', ['acquisition', 'year-review', 'milestone', 'market'], 'Circle turned an acquired fund into a larger collateral and treasury product by improving distribution and redemption plumbing.'),
    why_this_outcome: section('USYC grew because it solved an institutional timing problem: capital can earn short-duration government yield while remaining convertible to USDC through onchain contracts. Circle added a recognized compliance and distribution brand, and trading venues could use the product as margin or collateral. Independent research found that later growth was heavily connected to BNB Chain and institutional exchange use. The small number of direct holders means large AUM does not equal broad retail adoption or deep public secondary liquidity.', ['overview', 'redemption', 'year-review', 'independent', 'rwa'], 'USYC won institutional balances through collateral efficiency and USDC liquidity, not consumer payment demand.'),
    strategic_choices: section('Circle chose acquisition instead of building a competing fund from scratch. The product keeps a Cayman fund and Bermuda token-administrator structure, excludes U.S. persons, earns the overnight rate through reverse repo and uses an accumulating unit price. It also chose USDC as the main subscription and redemption rail and deployed where institutional trading already happens. Those choices improve capital efficiency and distribution, while concentrating dependency on Circle, USDC, approved counterparties and eligibility controls.', ['overview', 'acquisition', 'redemption', 'year-review'], 'USYC is deliberately optimized for compliant institutional cash management rather than universal permissionless payments.'),
    operating_model: section('An eligible entity acquires fund exposure by exchanging USDC through the Teller contract; redemption returns USDC, subject to onboarding, capacity, fees and fund rules. The mutual fund owns the portfolio, Circle International Bermuda administers the token and an oracle publishes price and holdings data. Instant liquidity has capacity limits, with larger redemptions able to settle later or use paid liquidity. Smart-contract settlement shortens the workflow, but it does not remove the fund, administrator, repo counterparty or legal layers.', ['overview', 'product', 'redemption'], 'The blockchain automates fund entry and exit; it does not transform the fund share into an unconditional bearer claim on cash.'),
    token_and_value_capture: section('USYC passes most short-term portfolio returns into a rising token price. Circle and the fund ecosystem can earn administration, performance, spread or liquidity fees under the applicable fund documents, while USDC gains demand as the settlement asset. RWA.xyz reports a performance-fee field, but public pages do not provide one complete current fee waterfall for every investor and redemption path. USYC income belongs to the fund interest; it does not create revenue rights in Circle stock or USDC.', ['product', 'rwa', 'redemption'], 'Holder yield, Circle revenue, USDC balances and venue collateral benefits are related but legally separate economic flows.'),
    counterfactual: section('Circle could have built USYC as a fixed-one-dollar payment coin with rewards, left Hashnote independent, or used offchain bank wires for every subscription. A fixed price would look familiar but require rebasing or separate distributions and could blur securities and stablecoin rules. Leaving Hashnote independent would preserve focus but lose Circle distribution. Bank-only settlement would reduce smart-contract exposure but weaken 24-hour liquidity. No public experiment isolates which design choice contributed most to growth.', ['acquisition', 'overview', 'redemption', 'year-review'], 'The USDC-linked accumulating-fund design appears commercially effective, but its advantage over alternative structures is not causally proven.', 'counterfactual'),
    risks_and_unknowns: section('USYC carries fund, repo-counterparty, custodian, administrator, oracle, contract, liquidity, eligibility and regulatory risk. A rising unit price is not guaranteed, and instant redemption depends on available liquidity and approved access. Assets and holders are concentrated, while public secondary turnover is not equivalent to executable size. Current portfolio counterparties, full fee waterfalls, stress-redemption results, liquidity-provider capacity, beneficial-holder concentration and the exact rights of a wallet that receives USYC without onboarding remain incompletely public.', ['overview', 'product', 'redemption', 'rwa', 'independent'], 'Treasury collateral reduces credit risk but does not eliminate fund structure, liquidity or access risk.'),
    lifecycle: section('USYC began as Hashnote’s institutional tokenized fund, then entered a new phase after Circle acquired Hashnote in January 2025. It expanded chains, crossed $2 billion in March 2026 and reached roughly $3.01 billion in the current market snapshot. The lifecycle call is successful but specialized: USYC is a large institutional cash and collateral product with few direct holders, not a universal retail stablecoin. Its durability depends on retaining exchange, treasury and collateral demand as short-term rates fall.', ['acquisition', 'year-review', 'milestone', 'rwa', 'independent', 'market'], 'USYC has clear product-market fit in institutional collateral, while breadth and through-cycle retention remain unproven.'),
    outlook_and_watch: section('Base case: USYC remains one of the largest tokenized Treasury products and a bridge between USDC liquidity and yield-bearing collateral. Watch net subscriptions, holder concentration, chain distribution, repo counterparties, instant-redemption capacity, fees, oracle continuity, USDC dependency, collateral haircuts and demand after rate cuts. The call improves if holders and venues diversify while redemptions remain fast during stress. It worsens if balances leave with one exchange program or liquidity capacity fails when institutions exit together.', ['milestone', 'rwa', 'independent', 'redemption', 'market'], 'USYC should be judged on retained institutional balances and reliable exits, not whether its accruing price stays at one dollar.'),
  },
  events: [
    { key: 'inception', type: 'fund_inception', date: '2023-05-01', datePrecision: 'day', description: 'RWA.xyz records May 1, 2023 as the inception date for the USYC fund product.', sources: ['rwa'], locator: 'RWA.xyz key-facts field.' },
    { key: 'circle-acquisition', type: 'ownership_change', date: '2025-01-21', datePrecision: 'day', description: 'Circle announced its acquisition of Hashnote and the USYC tokenized money-market fund.', sources: ['acquisition'], locator: 'Dated Circle acquisition announcement.' },
    { key: 'two-billion', type: 'scale_milestone', date: '2026-03-23', datePrecision: 'day', description: 'Circle reported that USYC assets under management had passed $2 billion.', sources: ['milestone'], locator: 'Dated Circle tokenized-fund analysis.' },
  ],
  identityBoundary: 'USYC, the underlying Cayman mutual fund, Circle International Bermuda, Hashnote, Circle Internet Group and USDC are separate instruments or legal actors.',
  reserveBoundary: 'Fund investments, oracle NAV, tokenized value, USDC liquidity buffers and Circle corporate assets must not be combined.',
  redemptionBoundary: 'Teller redemption into USDC, paid instant liquidity, ordinary fund settlement and secondary-market sale are distinct exit paths.',
  valueCaptureBoundary: 'Fund yield, performance or administration fees, USDC reserve economics and Circle shareholder value are separate.',
  guardrail: 'Never describe USYC as a simple one-dollar stablecoin, cash reserve token or unrestricted retail product; its price above one dollar reflects an accumulating fund share.',
  unknowns: ['current_portfolio_counterparties', 'complete_fee_waterfall', 'stress_redemption_results', 'instant_liquidity_capacity', 'beneficial_holder_concentration', 'unonboarded_transferee_rights', 'secondary_market_depth', 'chain_level_net_flows'],
});

const usdgSlug = 'usdg';
const usdgSources = [
  source(usdgSlug, 'overview', 'USDG Overview', 'https://docs.paxos.com/guides/stablecoin/usdg', 'Paxos', null, 'primary'),
  source(usdgSlug, 'whitepaper', 'USDG EU Whitepaper', 'https://www.paxos.com/terms-and-conditions/usdg-eu-whitepaper', 'Paxos', null, 'primary'),
  source(usdgSlug, 'transparency', 'Global Dollar Transparency Reports', 'https://www.paxos.com/usdg-transparency', 'Paxos', null, 'primary'),
  source(usdgSlug, 'launch', 'Paxos Introduces Global Dollar', 'https://www.paxos.com/newsroom/paxos-introduces-global-dollar-usdg', 'Paxos', '2024-11-01', 'primary'),
  source(usdgSlug, 'solana', 'Global Dollar Is Now Available on Solana', 'https://globaldollar.com/newsroom/global-dollar-usdg-stablecoin-now-available-on-solana-blockchain', 'Global Dollar Network', '2025-02-25', 'primary'),
  source(usdgSlug, 'network', 'How Kraken Drives Adoption of USDG', 'https://globaldollar.com/newsroom/kraken-usdg', 'Global Dollar Network', null, 'primary'),
  source(usdgSlug, 'growth', 'Global Dollar Network Newsroom', 'https://globaldollar.com/newsroom', 'Global Dollar Network', null, 'primary'),
  source(usdgSlug, 'independent', 'Global Dollar Network adds 19 new members', 'https://www.theblock.co/post/353947/global-dollar-network-new-members-solana-usdg-stablecoin', 'The Block', '2025-05-12', 'independent', { access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source(usdgSlug, 'rwa', 'Global Dollar', 'https://app.rwa.xyz/assets/USDG', 'RWA.xyz', null, 'aggregator'),
  source(usdgSlug, 'market', 'DefiLlama stablecoins API', MARKET_URL, 'DefiLlama', null, 'aggregator'),
];

const usdg = buildProfile({
  slug: usdgSlug,
  name: 'Global Dollar',
  aliases: ['USDG'],
  datasetClassification: 'payment_stablecoin',
  classification: {
    subtype: 'regulated fiat-backed payment stablecoin with distributor revenue sharing',
    tags: ['fiat_backed', 'payments', 'paxos', 'singapore_issuer', 'mica_issuer', 'partner_rewards', 'global_dollar_network'],
    chains: ['Solana', 'Ethereum', 'X Layer', 'Robinhood Chain', 'Ink', 'Hyperliquid'],
    jurisdictions: ['Singapore', 'European Union'],
  },
  sources: usdgSources,
  operatingState: 'operating_and_scaling_through_partner_network',
  statusAssertion: 'USDG remains a live Paxos-issued stablecoin with one-for-one redemption, monthly reserve reports, multiple regulated issuers by region and roughly $3.39 billion observed supply.',
  statusSources: ['overview', 'whitepaper', 'transparency', 'market'],
  statusLocator: 'Current issuer documentation, regional whitepaper, reserve-reporting page and market snapshot.',
  outcome: 'successful_partner_incentive_led_stablecoin_challenger',
  outcomeConfidence: 'high',
  outcomeAssertion: 'USDG grew from a small 2024 launch into a multi-billion-dollar challenger by sharing reserve economics with exchanges and wallets and concentrating distribution on Solana, while its durability without those incentives remains untested.',
  outcomeSources: ['launch', 'solana', 'network', 'growth', 'independent', 'rwa', 'market'],
  outcomeLocator: 'Launch, chain expansion, partner-reward terms, membership growth and independent market observations.',
  market: { kind: 'payment_stablecoin', value: 3392196822.836755, price: 0.9997615411820531 },
  sections: {
    what_it_is: section('USDG is a regulated dollar stablecoin issued by Paxos Digital Singapore outside the EEA and by Paxos EU for eligible European holders. Paxos says reserve assets sit in segregated accounts and approved customers can redeem one token for one dollar. The Global Dollar Network recruits exchanges, wallets and payment companies to distribute it. Holders receive the dollar token; distribution partners, not ordinary wallets by default, can receive reserve-funded rewards.', ['overview', 'whitepaper', 'network'], 'USDG combines ordinary fiat-backed token mechanics with an unusually explicit revenue-sharing distribution model.'),
    what_happened: section('Paxos launched USDG in Singapore in November 2024 with Kraken, Robinhood, Anchorage, Galaxy and other founding distributors. The network added Solana in February 2025, then expanded membership and European issuance. Global Dollar Network said it passed 100 partners and $1 billion in December 2025. DefiLlama observed about $3.39 billion in supply on 2026-08-03, while RWA.xyz showed substantial Solana activity in its most recent indexed snapshot.', ['launch', 'solana', 'growth', 'rwa', 'market'], 'USDG moved from consortium launch to meaningful scale after aligning distributor economics and putting most growth near active Solana venues.'),
    why_this_outcome: section('Stablecoin distribution is usually a network-effects problem: users want the token exchanges, wallets and counterparties already support. USDG paid those distributors from reserve earnings rather than asking them to list a new asset for free. Solana gave the network cheap transfers and active trading venues, and Paxos supplied a recognized issuer and monthly reports. That combination accelerated supply, but it also means some balances may be reward-seeking inventory rather than sticky payment demand.', ['network', 'solana', 'independent', 'transparency', 'market'], 'USDG’s growth is best explained by paid distribution plus regulated issuance, not a new token mechanism.'),
    strategic_choices: section('Paxos chose a network brand instead of a single consumer sponsor, regional issuers instead of one global legal entity, and partner revenue sharing instead of retaining all reserve income. The network prioritized Solana while keeping Ethereum and later chains, and it let partners design holder rewards. These choices attack USDC and USDT at the distribution layer. The tradeoff is margin compression, partner bargaining power and a risk that balances move whenever a competing issuer offers better economics.', ['launch', 'whitepaper', 'solana', 'network', 'growth'], 'USDG deliberately buys network distribution with reserve yield and accepts lower control over the end-user relationship.'),
    operating_model: section('Approved customers send dollars to Paxos, receive USDG and can redeem at par after compliance review; redeemed tokens are burned. Paxos holds reserve assets, publishes monthly reports and operates issuer controls. The applicable issuer and holder rights depend on region. Global Dollar Network partners custody, list, settle or reward balances and can receive a negotiated share of reserve earnings. A partner reward is not the same as a legal yield entitlement attached to every USDG token.', ['overview', 'whitepaper', 'transparency', 'network'], 'Issuance and redemption stay centralized at Paxos even though distribution and reward programs are spread across many partners.'),
    token_and_value_capture: section('Plain USDG targets one dollar and does not automatically pass reserve interest to every holder. Paxos uses reserve earnings to fund issuer operations and partner rewards; some platforms then share part of their allocation with customers. Partners can reportedly receive up to all reserve-based earnings attributable to balances they drive, subject to network terms. The model can lower Paxos’s margin per dollar while increasing scale. Rewards, exchange rebates and third-party DeFi yield must be separated from the token’s par redemption right.', ['network', 'solana', 'whitepaper'], 'USDG shifts value capture from one issuer toward distributors, making partner retention a core unit-economics question.'),
    counterfactual: section('Paxos could have kept all reserve income, launched another house-branded coin like USDP, or paid holders directly. Retaining income would improve margin but give platforms little reason to displace incumbents. Direct holder yield could attract savings but introduce different regulatory and product questions. A single-chain launch would be simpler but weaker for distribution. The consortium model created rapid reach, yet no public comparison shows whether the added supply produces more durable profit than a smaller high-margin token.', ['launch', 'network', 'solana', 'growth'], 'Revenue sharing solved the cold start, but its long-run economics versus a conventional issuer model remain unknown.', 'counterfactual'),
    risks_and_unknowns: section('The main risks are partner and chain concentration, rate-cut pressure on rewards, regional legal differences, Paxos operational dependence, reserve-bank exposure, freeze controls, smart contracts and market liquidity. Partner incentives can create balances that leave quickly when rewards change. Public reports do not reconcile reward expense, Paxos net margin, customer concentration, direct redemption volume, failed redemptions, payment volume, holder retention after campaigns or chain-by-chain native versus bridged supply in one current dataset.', ['whitepaper', 'transparency', 'network', 'rwa', 'market'], 'Regulated reserves support par redemption but do not prove that subsidized distribution will become durable demand.'),
    lifecycle: section('USDG launched in late 2024, added Solana and European issuance in 2025, crossed 100 partners and then expanded above $3 billion in the current snapshot. The lifecycle call is successful challenger: it is no longer an experiment, but it remains much smaller than USDC and USDT and is still proving whether a paid consortium can create self-sustaining usage. The next phase is less about signing partners and more about retaining balances, payments and liquidity if short-term rates and rewards fall.', ['launch', 'solana', 'growth', 'whitepaper', 'market'], 'USDG has validated its distribution strategy at scale; through-cycle retention is the unresolved test.'),
    outlook_and_watch: section('Base case: USDG remains a meaningful Solana-heavy stablecoin and grows through exchange, wallet, payroll and DeFi integrations. Watch monthly reports, regional redemption terms, supply by chain, active users, partner concentration, reward rates, payment volume, direct redemptions and retention after incentives change. The call improves if non-reward usage and independent liquidity deepen. It worsens if rate cuts compress partner economics, a major distributor leaves or a regional issuer creates inconsistent redemption access.', ['transparency', 'network', 'growth', 'rwa', 'market'], 'The key signal is repeat use after incentives normalize, not the number of logos in the consortium.'),
  },
  events: [
    { key: 'launch', type: 'product_launch', date: '2024-11-01', datePrecision: 'day', description: 'Paxos launched USDG from Singapore with the founding Global Dollar Network partners.', sources: ['launch'], locator: 'Dated Paxos launch announcement.' },
    { key: 'solana', type: 'chain_expansion', date: '2025-02-25', datePrecision: 'day', description: 'Global Dollar Network launched native USDG on Solana with reserve-based returns available to distribution partners.', sources: ['solana'], locator: 'Dated network announcement.' },
    { key: 'network-scale', type: 'scale_milestone', date: '2025-12-04', datePrecision: 'day', description: 'Global Dollar Network reported more than 100 partners and over $1 billion of USDG market capitalization.', sources: ['growth'], locator: 'Dated newsroom entry.' },
  ],
  identityBoundary: 'USDG, Paxos Digital Singapore, Paxos EU, Paxos corporate entities, Global Dollar Network and participating distributors are separate actors.',
  reserveBoundary: 'Issuer reserve assets, partner-held balances, partner reward allocations and Paxos corporate assets must not be combined.',
  redemptionBoundary: 'Regional Paxos redemption, partner conversion, exchange sale and DeFi swap are distinct exit routes.',
  valueCaptureBoundary: 'Paxos margin, network rewards, platform customer rewards, DeFi yield and holder par value are separate.',
  guardrail: 'Do not call partner rewards universal token yield or treat Singapore and European holder rights as identical.',
  unknowns: ['paxos_net_margin', 'partner_reward_expense', 'customer_concentration', 'direct_redemption_volume_and_latency', 'failed_redemptions', 'non_incentivized_payment_volume', 'post_campaign_retention', 'native_versus_bridged_supply'],
});

const buidlSlug = 'buidl';
const buidlSources = [
  source(buidlSlug, 'form-d', 'BlackRock USD Institutional Digital Liquidity Fund Form D', 'https://www.sec.gov/Archives/edgar/data/2013810/000201439024000001/xslFormDX01/primary_doc.xml', 'U.S. Securities and Exchange Commission', '2024-03-14', 'primary', { independence_group: 'SEC' }),
  source(buidlSlug, 'launch', 'BlackRock Launches Its First Tokenized Fund, BUIDL', 'https://markets.financialcontent.com/prnews/article/bizwire-2024-3-20-blackrock-launches-its-first-tokenized-fund-buidl-on-the-ethereum-network', 'BlackRock via Business Wire', '2024-03-20', 'primary'),
  source(buidlSlug, 'multichain', 'BlackRock Launches New BUIDL Share Classes Across Multiple Blockchains', 'https://www.prnewswire.com/news-releases/blackrock-launches-new-buidl-share-classes-across-multiple-blockchains-to-expand-access-and-potential-of-buidl-ecosystem-302304035.html', 'BlackRock and Securitize via PR Newswire', '2024-11-13', 'primary'),
  source(buidlSlug, 'billion', 'BUIDL Surpasses $1B in AUM', 'https://www.prnewswire.com/news-releases/blackrock-usd-institutional-digital-liquidity-fund-buidl-tokenized-by-securitize-surpasses-1b-in-aum-302401480.html', 'Securitize via PR Newswire', '2025-03-13', 'primary'),
  source(buidlSlug, 'offramp', 'USDC Smart Contract for BlackRock BUIDL Fund Investors', 'https://www.circle.com/pressroom/circle-announces-usdc-smart-contract-for-transfers-by-blackrocks-buidl-fund-investors', 'Circle', '2024-04-11', 'primary'),
  source(buidlSlug, 'collateral', 'BUIDL Accepted as Collateral on Binance and Launches on BNB Chain', 'https://securitize.io/press/BlackRock-BUIDL-Tokenized-by-Securitize-Now-Accepted-on-Binance-and-Launches-on-BNB-Chain', 'Securitize', null, 'primary'),
  source(buidlSlug, 'rwa', 'BlackRock Asset Manager Profile', 'https://app.rwa.xyz/asset-managers/blackrock', 'RWA.xyz', null, 'aggregator'),
  source(buidlSlug, 'liquidity-study', 'Tokenized but Illiquid? Evidence from Real-World Asset Markets', 'https://arxiv.org/abs/2606.01131', 'arXiv', '2026-05-31', 'independent', { independence_group: 'academic-authors' }),
  source(buidlSlug, 'axios', "BlackRock's tokenized fund", 'https://www.axios.com/newsletters/axios-crypto-95c95d60-b5a6-4087-a264-4c8b7d0c3718', 'Axios', '2024-03-26', 'independent', { access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source(buidlSlug, 'market', 'DefiLlama stablecoins API', MARKET_URL, 'DefiLlama', null, 'aggregator'),
];

const buidl = buildProfile({
  slug: buidlSlug,
  name: 'BlackRock USD Institutional Digital Liquidity Fund',
  aliases: ['BUIDL'],
  datasetClassification: 'private_fund_security_not_payment_stablecoin',
  classification: {
    subtype: 'tokenized private liquidity-fund share with stable NAV and token dividends',
    tags: ['private_fund_security', 'qualified_purchasers', 'treasury_cash_repo', 'securitize_transfer_agent', 'daily_dividends', 'institutional_collateral'],
    chains: ['Ethereum', 'Solana', 'Avalanche', 'BNB Chain', 'OP Mainnet', 'Arbitrum', 'Aptos', 'Polygon'],
    jurisdictions: ['British Virgin Islands', 'United States private placement'],
  },
  sources: buidlSources,
  operatingState: 'operating_at_scale_as_restricted_tokenized_fund',
  statusAssertion: 'BUIDL remains an operating restricted fund security with multiple blockchain share classes, qualified-investor access, daily token dividends and roughly $2.69 billion of observed tokenized value.',
  statusSources: ['form-d', 'multichain', 'billion', 'collateral', 'market'],
  statusLocator: 'SEC filing, issuer and transfer-agent announcements, collateral integration and market snapshot.',
  outcome: 'successful_institutional_tokenized_fund_and_reserve_primitive',
  outcomeConfidence: 'high',
  outcomeAssertion: 'BUIDL became a leading tokenized Treasury fund because BlackRock supplied asset-management trust, Securitize supplied compliant transfer infrastructure and crypto firms adopted the shares as reserves and collateral, not because it became a retail payment coin.',
  outcomeSources: ['launch', 'multichain', 'billion', 'collateral', 'rwa', 'liquidity-study', 'market'],
  outcomeLocator: 'Launch and scale records, chain expansion, collateral adoption, current data and independent liquidity research.',
  market: { kind: 'stable_nav_fund_share', value: 2686982221.900449, price: 1 },
  sections: {
    what_it_is: section('BUIDL is a tokenized share of BlackRock USD Institutional Digital Liquidity Fund Ltd., not a retail stablecoin. It is offered as a private fund security to qualified investors through Securitize. The fund seeks a stable one-dollar token value, invests in cash, U.S. Treasury bills and repurchase agreements, and pays income as additional tokens. A wallet holding BUIDL owns a restricted fund interest under offering documents, not an unrestricted claim to redeem one token at any bank.', ['form-d', 'launch', 'axios'], 'BUIDL belongs in tokenized-fund analysis even though its one-dollar unit price makes it look superficially like a stablecoin.'),
    what_happened: section('BlackRock filed the fund’s Form D in March 2024 and launched BUIDL on Ethereum days later with Securitize as transfer agent. It passed $1 billion within a year, added share classes across several chains and gained off-ramps into USDC and later institutional collateral uses. DefiLlama observed roughly $2.69 billion of tokenized value on 2026-08-03. The price remains near one dollar because income is distributed in new tokens, not because holders receive a non-yielding payment coin.', ['form-d', 'launch', 'multichain', 'billion', 'offramp', 'collateral', 'market'], 'BUIDL scaled from a tokenization pilot into institutional reserve and collateral infrastructure.'),
    why_this_outcome: section('BUIDL combined a trusted asset manager with the compliance machinery required for securities: onboarding, a controlled shareholder register, transfer restrictions and fund administration. Its one-dollar unit and daily dividends made it easy for stablecoin issuers and trading firms to treat as cash-like collateral. Multi-chain share classes moved the product closer to where those institutions operate. Large AUM still does not imply broad liquidity; independent research warns that tokenized-asset value and actual turnover are different outcomes.', ['launch', 'multichain', 'collateral', 'rwa', 'liquidity-study'], 'BUIDL succeeded by becoming institutional plumbing, while access and secondary liquidity remained intentionally narrow.'),
    strategic_choices: section('BlackRock chose a private fund rather than a public retail token, Securitize rather than an open anonymous registry, and stable NAV plus token dividends rather than an accumulating unit price. It expanded native share classes instead of relying only on bridges and supported stablecoin off-ramps and collateral integrations. These choices preserved familiar fund and securities controls while adding blockchain settlement. They also limited who can enter, transfer and redeem and made Securitize a critical operating dependency.', ['form-d', 'launch', 'multichain', 'offramp', 'collateral'], 'BUIDL prioritizes institutional legal certainty and composability over permissionless ownership.'),
    operating_model: section('Qualified purchasers onboard through Securitize, subscribe to the private fund and receive whitelisted tokenized shares. The fund invests the cash portfolio; BlackRock manages it; Securitize maintains transfer-agent and tokenization controls. Income accrues daily and is paid as additional BUIDL tokens while the unit aims to remain at one dollar. Approved transfers can settle onchain, and separate smart contracts or liquidity providers can exchange shares for stablecoins. Every step remains subject to fund and securities rules.', ['form-d', 'launch', 'multichain', 'offramp'], 'BUIDL automates the record and movement of a private fund share rather than removing the fund’s legal gatekeepers.'),
    token_and_value_capture: section('BUIDL holders receive portfolio income after fund expenses through token dividends. BlackRock earns fund-management economics, Securitize earns platform, transfer-agent or distribution economics, and stablecoin issuers or venues gain a high-quality reserve and collateral asset. A one-dollar BUIDL token can therefore generate holder return, unlike a normal payment stablecoin whose issuer keeps reserve income. Current public pages do not provide one complete fee schedule, liquidity-provider spread or revenue split across every chain.', ['launch', 'billion', 'offramp', 'collateral'], 'Fund yield, manager fees, tokenization fees, stablecoin reserve benefits and collateral utility are distinct value flows.'),
    counterfactual: section('BlackRock could have launched an ETF, kept the fund entirely offchain, allowed an accumulating NAV, or opened it to retail investors. An ETF would gain public market liquidity but lose direct programmable shareholder records; a conventional fund would reduce contract risk but weaken 24-hour transfers. Accumulating NAV would simplify distributions but make each token drift above one dollar. Retail access could broaden holders while requiring a different regulatory structure. Public data cannot isolate which alternative would have produced better net adoption.', ['form-d', 'launch', 'multichain', 'axios'], 'BUIDL’s current design fits institutional collateral well, but the opportunity cost of private-fund restrictions is unmeasured.', 'counterfactual'),
    risks_and_unknowns: section('BUIDL carries fund, counterparty, custodian, transfer-agent, contract, oracle, regulatory, eligibility and liquidity risk. Stable NAV is a fund objective, not a guarantee that every secondary exit is immediate or free. Cross-chain share classes add operational surface, and collateral integrations can create correlated redemptions. Public evidence does not fully reconcile holder concentration, chain-level flows, secondary depth, redemption latency under stress, complete fees, repo counterparties, bridge exposure or emergency administrative powers.', ['form-d', 'multichain', 'offramp', 'collateral', 'liquidity-study', 'rwa'], 'High-quality assets and a large manager do not eliminate restricted-market liquidity or infrastructure risk.'),
    lifecycle: section('BUIDL launched in March 2024, became the largest tokenized fund within weeks, passed $1 billion by March 2025 and then expanded as reserve and collateral infrastructure. At roughly $2.69 billion today, it has moved beyond proof of concept. The lifecycle call is successful and specialized: institutions have adopted it, but the product remains a private fund with a limited direct-holder base. Its next test is reliable multi-chain liquidity and redemptions through a synchronized market stress.', ['launch', 'billion', 'multichain', 'collateral', 'rwa', 'market'], 'BUIDL proved that tokenized funds can gather institutional assets; it has not yet proven public-market-like liquidity.'),
    outlook_and_watch: section('Base case: BUIDL remains a leading reserve, treasury and collateral asset for crypto institutions while BlackRock and Securitize add regulated venues. Watch net subscriptions, holders, chain distribution, fund yield and fees, repo exposure, collateral haircuts, stablecoin issuer concentration, redemption timing and secondary spreads. The call improves if activity and holders broaden without weakening compliance. It worsens if a concentrated reserve buyer exits, a chain-control failure interrupts transfers or private-market liquidity breaks during a run.', ['collateral', 'rwa', 'liquidity-study', 'market', 'multichain'], 'BUIDL should be judged on institutional retention and stress exits, not on a one-dollar screen price alone.'),
  },
  events: [
    { key: 'launch', type: 'fund_launch', date: '2024-03-20', datePrecision: 'day', description: 'BlackRock launched BUIDL on Ethereum after filing a Form D for the private offering.', sources: ['form-d', 'launch'], locator: 'SEC filing and dated launch announcement.' },
    { key: 'multichain', type: 'share_class_expansion', date: '2024-11-13', datePrecision: 'day', description: 'BlackRock and Securitize announced native BUIDL share classes on five additional blockchains.', sources: ['multichain'], locator: 'Dated expansion announcement.' },
    { key: 'one-billion', type: 'scale_milestone', date: '2025-03-13', datePrecision: 'day', description: 'Securitize reported that BUIDL had surpassed $1 billion in assets under management.', sources: ['billion'], locator: 'Dated Securitize milestone announcement.' },
  ],
  identityBoundary: 'BUIDL tokens, the BlackRock private fund, BlackRock Inc., Securitize, liquidity providers and stablecoins using BUIDL as reserves are separate.',
  reserveBoundary: 'Fund portfolio assets, BUIDL token value, stablecoin liabilities backed by BUIDL and BlackRock corporate assets must not be combined.',
  redemptionBoundary: 'Fund redemption, whitelisted peer transfer, Circle or liquidity-provider off-ramp and secondary sale are distinct exits.',
  valueCaptureBoundary: 'Fund dividends, BlackRock fees, Securitize fees, stablecoin issuer income and venue collateral benefits are separate.',
  guardrail: 'Never describe BUIDL as a universally redeemable dollar stablecoin or public retail money-market fund; it is a restricted private-fund security.',
  unknowns: ['holder_concentration', 'chain_level_net_flows', 'secondary_market_depth', 'stress_redemption_latency', 'complete_fee_schedule', 'repo_counterparties', 'bridge_exposure', 'emergency_admin_powers'],
});

const usdySlug = 'usdy';
const usdySources = [
  source(usdySlug, 'basics', 'USDY Basics', 'https://docs.ondo.finance/general-access-products/usdy/basics', 'Ondo Finance', null, 'primary'),
  source(usdySlug, 'product', 'USDY', 'https://ondo.finance/usdy', 'Ondo Finance', null, 'primary'),
  source(usdySlug, 'important', 'USDY Important Notes', 'https://docs.ondo.finance/general-access-products/usdy/important-notes', 'Ondo Finance', null, 'primary'),
  source(usdySlug, 'eligibility', 'USDY Eligibility', 'https://docs.ondo.finance/general-access-products/usdy/eligibility', 'Ondo Finance', null, 'primary'),
  source(usdySlug, 'launch', 'Introducing Ondo USD Yield', 'https://ondo.finance/blog/introducing-ondo-usd-yield-usdy', 'Ondo Finance', '2023-08-03', 'primary'),
  source(usdySlug, 'sei', 'USDY Is Now Live on Sei', 'https://ondo.finance/blog/usdy-is-now-live-on-sei', 'Ondo Finance', '2026-01-28', 'primary'),
  source(usdySlug, 'independent', 'Ondo USDY: Tokenized Treasuries Explained', 'https://eco.com/support/en/articles/14798657-ondo-usdy-tokenized-treasuries-explained', 'Eco', null, 'independent'),
  source(usdySlug, 'liquidity-study', 'Tokenized but Illiquid? Evidence from Real-World Asset Markets', 'https://arxiv.org/abs/2606.01131', 'arXiv', '2026-05-31', 'independent', { independence_group: 'academic-authors' }),
  source(usdySlug, 'market', 'DefiLlama stablecoins API', MARKET_URL, 'DefiLlama', null, 'aggregator'),
];

const usdy = buildProfile({
  slug: usdySlug,
  name: 'Ondo US Dollar Yield',
  aliases: ['USDY', 'rUSDY'],
  datasetClassification: 'secured_tokenized_note_not_payment_stablecoin',
  classification: {
    subtype: 'Regulation S yield-bearing tokenized note with accumulating and rebasing forms',
    tags: ['tokenized_note', 'non_us_investors', 'treasury_backed', 'bank_deposits', 'accumulating_price', 'rebasing_variant', 'multichain'],
    chains: ['Ethereum', 'Stellar', 'Sei', 'Solana', 'Mantle', 'Sui', 'Aptos', 'Noble', 'Osmosis', 'Arbitrum', 'MANTRA', 'Injective', 'Penumbra', 'Plume', 'Glue'],
    jurisdictions: ['British Virgin Islands', 'Regulation S non-U.S. distribution'],
  },
  sources: usdySources,
  operatingState: 'operating_at_scale_after_issuer_and_product_transition',
  statusAssertion: 'USDY remains an operating non-U.S. tokenized note under Ondo Global Markets with accumulating and rebasing forms, daily portfolio reporting and roughly $2.15 billion of observed tokenized value.',
  statusSources: ['basics', 'product', 'important', 'eligibility', 'market'],
  statusLocator: 'Current product, legal, eligibility and market pages.',
  outcome: 'successful_global_yield_bearing_dollar_note_with_evolving_structure',
  outcomeConfidence: 'high',
  outcomeAssertion: 'USDY reached multi-billion-dollar scale by giving eligible non-U.S. users a transferable Treasury-yield product across many chains, while its 2025 issuer transition and evolving collateral make current legal and reserve details essential to the analysis.',
  outcomeSources: ['launch', 'basics', 'product', 'important', 'sei', 'independent', 'market'],
  outcomeLocator: 'Launch structure, current issuer and portfolio disclosures, chain expansion, independent explanation and market snapshot.',
  market: { kind: 'accruing_tokenized_note', value: 2149844197.6629395, price: 1.1410100651553448 },
  sections: {
    what_it_is: section('USDY is a yield-bearing tokenized note for eligible non-U.S. investors, not a simple one-dollar payment stablecoin. Current documents say Ondo Global Markets (BVI) Limited issues the tokens. USDY’s unit price rises as income accrues; rUSDY keeps a one-dollar reference by increasing token balances. Depending on issuance date, claims may be secured by short-term Treasuries, an iShares short-Treasury ETF or bank deposits. Holder rights come from note documents and eligibility rules.', ['basics', 'important', 'eligibility'], 'USDY must be evaluated as a regulated note with changing reference value and legal terms, not as a stablecoin that has drifted to $1.14.'),
    what_happened: section('Ondo launched USDY in August 2023 through a bankruptcy-remote U.S. special-purpose issuer with a roughly three-percent equity buffer and third-party collateral oversight. It expanded across many chains and grew into a major non-U.S. yield product. On December 15, 2025, the product moved under the Ondo Global Markets umbrella and its current BVI issuer. DefiLlama observed about $2.15 billion of tokenized value and a $1.141 unit price on 2026-08-03; the premium represents accrued value.', ['launch', 'basics', 'important', 'sei', 'market'], 'USDY scaled by pairing global distribution with Treasury yield, then materially changed its issuer and operating structure.'),
    why_this_outcome: section('USDY filled a gap left by payment stablecoins: non-U.S. users could hold a transferable dollar instrument and receive part of the underlying short-term yield. Ondo added daily transparency, collateral-agent protections, two accrual formats and broad chain distribution. That made the token useful for savings and DeFi collateral. The success is still partly a rates story; high short-term yields made the product attractive, while legal restrictions and onboarding kept U.S. retail outside the primary market.', ['launch', 'product', 'basics', 'sei', 'independent'], 'USDY won by sharing Treasury yield and meeting users on many chains, not by offering universal payment acceptance.'),
    strategic_choices: section('Ondo chose a secured note rather than a fund share or non-yielding stablecoin, a non-U.S. Regulation S market rather than U.S. retail, and both accumulating and rebasing formats. It funded an equity cushion, appointed third-party oversight and deployed widely. In late 2025 it folded issuance into Ondo Global Markets, broadening the operating platform but changing the legal boundary investors originally entered. Current portfolio reporting also includes a small amount of USD value issued against Ondo Stocks, not only Treasuries and bank cash.', ['launch', 'basics', 'product', 'important'], 'USDY traded structural simplicity for global accessibility, yield and integration across Ondo’s expanding product stack.'),
    operating_model: section('Eligible users complete onboarding, mint with USDC or larger bank wires and redeem through approved routes. USDY’s reference price increases on business days based on the declared yield; rUSDY rebases balances to preserve a one-dollar unit reference. Current documentation separates U.S.-dollar wire redemptions from USDC redemptions through Ondo Global Markets and restricts certain jurisdictions. Daily reports show collateral value and outstanding claims, while contracts and chain infrastructure move the tokens.', ['basics', 'product', 'eligibility', 'important'], 'USDY combines legal-note claims, issuer-controlled eligibility, offchain assets and onchain transfer mechanics; no single smart contract replaces those layers.'),
    token_and_value_capture: section('USDY holders receive a declared variable return through an increasing reference price, while rUSDY holders receive more units. Ondo retains a spread between portfolio yield and the rate credited to holders and may earn service or platform economics. The equity buffer absorbs some asset fluctuation before noteholders, subject to governing terms. The separate ONDO governance token has no automatic claim on USDY income. Current public pages do not fully reconcile the spread, all fees and affiliate economics across legacy and current issuers.', ['launch', 'basics', 'product', 'important'], 'Holder yield, issuer spread, equity-buffer returns, Ondo platform revenue and ONDO token value are separate.'),
    counterfactual: section('Ondo could have issued a non-yielding stablecoin, limited USDY to one chain, kept the original U.S. special-purpose issuer or used only a fund-share model. A simple stablecoin would improve payment familiarity but keep reserve yield from holders. One chain would reduce operating surface but constrain distribution. Keeping the original issuer might preserve continuity but limit integration with Ondo Global Markets. Public evidence cannot show whether the 2025 transition improved investor protection, economics or only operational convenience.', ['launch', 'basics', 'important', 'sei'], 'The multi-chain note design produced scale, but the benefits of the issuer transition have not been independently measured.', 'counterfactual'),
    risks_and_unknowns: section('USDY carries issuer, noteholder, collateral, interest-rate, custodian, broker, contract, oracle, transfer, eligibility and regulatory risk. A quoted reference price is not guaranteed secondary liquidity, and U.S. persons face restrictions. The issuer transition complicates comparisons with the original bankruptcy-remote structure. Current reporting does not fully reconcile claim seniority across vintages, affiliate exposures, exact equity-buffer ownership, fee spread, stress redemptions, beneficial-holder concentration, chain-level liquidity or the small Ondo Stocks-linked position.', ['basics', 'product', 'important', 'eligibility', 'liquidity-study'], 'Daily collateral figures help, but investors still need current governing documents and stress-tested exit evidence.'),
    lifecycle: section('USDY launched in 2023 as a novel secured note, expanded from one product into a fifteen-chain footprint and grew above $2 billion. The December 2025 move to Ondo Global Markets marks a second lifecycle, not a cosmetic update: issuer identity and some collateral paths changed. The current call is successful but evolving. USDY has real scale and utility for eligible non-U.S. users, yet its through-cycle performance, current noteholder protections and liquidity after short-term rates fall remain open questions.', ['launch', 'basics', 'important', 'sei', 'product', 'market'], 'USDY has established product-market fit, while continuity across its issuer transition requires ongoing legal and reserve review.'),
    outlook_and_watch: section('Base case: USDY stays a leading non-U.S. yield-bearing dollar product and gains utility as savings, collateral and settlement. Watch current offering documents, collateral mix, coverage ratio, credited yield versus portfolio yield, issuer and affiliate changes, redemptions, holder concentration, chain liquidity and the share of assets connected to Ondo Stocks. The call improves if protections remain clear and exits work during rate and market stress. It worsens if collateral complexity grows faster than disclosure or liquidity fragments.', ['basics', 'product', 'important', 'eligibility', 'market', 'liquidity-study'], 'The most important signal is whether current note terms and redemption performance remain strong as the product broadens beyond its original Treasury-only story.'),
  },
  events: [
    { key: 'launch', type: 'product_launch', date: '2023-08-03', datePrecision: 'day', description: 'Ondo launched USDY as a secured tokenized note for non-U.S. investors with Treasury and bank-deposit collateral.', sources: ['launch'], locator: 'Dated Ondo launch announcement.' },
    { key: 'issuer-transition', type: 'issuer_transition', date: '2025-12-15', datePrecision: 'day', description: 'Current Ondo documentation says USDY was folded into the Ondo Global Markets umbrella and is now issued through its BVI entity.', sources: ['basics', 'important'], locator: 'Current product documentation states the effective transition date and issuer.' },
    { key: 'sei-expansion', type: 'chain_expansion', date: '2026-01-28', datePrecision: 'day', description: 'Ondo launched USDY natively on the Sei network as part of its multi-chain expansion.', sources: ['sei'], locator: 'Dated Ondo chain-expansion announcement.' },
  ],
  identityBoundary: 'USDY, rUSDY, legacy Ondo USDY LLC notes, current Ondo Global Markets notes, ONDO, OUSG and Ondo Stocks are separate instruments or issuers.',
  reserveBoundary: 'Treasuries, ETF shares, bank deposits, Ondo Stocks-linked USD value, equity buffers and Ondo corporate assets must be reported separately.',
  redemptionBoundary: 'USD wire redemption, USDC redemption, rUSDY conversion, peer transfer and secondary sale are distinct paths.',
  valueCaptureBoundary: 'Noteholder yield, issuer spread, equity-buffer return, platform revenue and ONDO token value are separate.',
  guardrail: 'Do not call the $1.14 accumulating USDY price a depeg, transfer the original LLC structure unchanged into 2026, or describe the product as available to U.S. retail.',
  unknowns: ['current_note_terms_by_vintage', 'claim_seniority_across_vintages', 'affiliate_exposure', 'equity_buffer_ownership', 'complete_fee_and_spread', 'stress_redemption_results', 'beneficial_holder_concentration', 'chain_level_liquidity', 'ondo_stocks_linked_exposure'],
});

export const document = {
  schema: 'chaindump-stablecoin-depth-wave-b-v1',
  version: 1,
  research_as_of: AS_OF,
  generated_at: ACCESSED_AT,
  generated_migration: '0099_stablecoin_depth_wave_b.sql',
  selection_method: 'Five strategic dollar-denominated products selected to compare a deal-led payment stablecoin, a partner-reward stablecoin, two tokenized funds and a secured yield-bearing note without collapsing their legal structures.',
  entities: [
    { slug: usd1Slug, canonical_profile: usd1 },
    { slug: usycSlug, canonical_profile: usyc },
    { slug: usdgSlug, canonical_profile: usdg },
    { slug: buidlSlug, canonical_profile: buidl },
    { slug: usdySlug, canonical_profile: usdy },
  ],
};

export const profiles = Object.fromEntries(document.entities.map((entry) => [entry.slug, entry.canonical_profile]));

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function renderMigration(value = document) {
  const statements = value.entities.map((entry) => {
    const canonical = JSON.stringify(entry.canonical_profile);
    const statement = `INSERT INTO ${TARGET_TABLE} (slug, canonical_profile) VALUES (${sqlLiteral(entry.slug)}, ${sqlLiteral(canonical)});`;
    if (Buffer.byteLength(statement, 'utf8') > MAX_D1_STATEMENT_BYTES) throw new Error(`${entry.slug}: D1 statement exceeds ${MAX_D1_STATEMENT_BYTES} bytes`);
    return statement;
  }).join('\n\n');
  return `-- Five current, source-linked dollar product profiles researched ${AS_OF} and awaiting human review.
-- Existing legacy profile fields, names, symbols, source lists and row identity are preserved.

DROP TABLE IF EXISTS ${TARGET_TABLE};

CREATE TABLE ${TARGET_TABLE} (
  slug TEXT PRIMARY KEY,
  canonical_profile TEXT NOT NULL CHECK (json_valid(canonical_profile))
);

-- canonical-payload-start
${statements}
-- canonical-payload-end

UPDATE stablecoin_meta AS stablecoin
SET
  profile = json_set(
    COALESCE(stablecoin.profile, '{}'),
    '$.canonical_profile', json(staged.canonical_profile)
  ),
  updated_at = '${AS_OF}'
FROM ${TARGET_TABLE} AS staged
WHERE stablecoin.slug = staged.slug;

DROP TABLE ${TARGET_TABLE};
`;
}

function writeOutputs() {
  writeFileSync(artifactPath, `${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(migrationPath, renderMigration());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) writeOutputs();

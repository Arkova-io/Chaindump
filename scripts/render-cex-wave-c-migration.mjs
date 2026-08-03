import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ACCESSED_AT = '2026-08-03T19:00:00Z';
const NEXT_REVIEW_AT = '2026-08-10T19:00:00Z';
const AS_OF_DATE = '2026-08-03';

const sid = (slug, key) => `source:${slug}:${key}`;

function makeSource(slug, [key, title, url, publisher, publishedAt, tier = 'A', role = 'primary']) {
  return {
    id: sid(slug, key), title, url, publisher, published_at: publishedAt,
    accessed_at: ACCESSED_AT, archive_url: null, tier, role,
    access_state: 'reachable', resolving: true,
    checked_at: ACCESSED_AT, content_hash: null,
  };
}

function makeSources(slug, rows) {
  return rows.map((row) => makeSource(slug, row));
}

function section(body, claims) {
  return {
    body,
    claims: claims.map(([assertion, sourceKeys, evidenceLocator, supportDirection = 'supports', note = null]) => ({
      assertion, sourceKeys, evidenceLocator, supportDirection, note,
    })),
  };
}

function pendingClaim({ id, fieldPath, sourceIds, evidenceLocator, assertion, supportDirection = 'supports', note = null }) {
  return {
    id, field_path: fieldPath, source_ids: sourceIds, evidence_locator: evidenceLocator,
    assertion, support_direction: supportDirection, note,
    review: { state: 'pending', reviewer: null, reviewed_at: null },
  };
}

function buildProfile(spec) {
  const sectionEntries = Object.entries(spec.sections);
  const sectionClaims = sectionEntries.flatMap(([key, value]) => value.claims.map((claim, index) => pendingClaim({
    id: `claim:${spec.slug}:section:${key}:${index + 1}`,
    fieldPath: `analysis.sections.${key}.body`,
    sourceIds: claim.sourceKeys.map((sourceKey) => sid(spec.slug, sourceKey)),
    evidenceLocator: claim.evidenceLocator,
    assertion: claim.assertion,
    supportDirection: claim.supportDirection,
    note: claim.note,
  })));
  const metrics = spec.metrics.map((metric) => ({
    id: `metric:${spec.slug}:${metric.key}:${metric.asOf}`,
    dimension: metric.dimension,
    label: metric.label,
    value: metric.value,
    unit: metric.unit,
    currency: metric.currency ?? null,
    window: { start: metric.start ?? null, end: metric.end ?? metric.asOf, definition: metric.window },
    as_of: metric.asOf,
    method: metric.method,
    scope: metric.scope,
    formula: null,
    raw_input_ids: [],
    claim_ids: [`claim:${spec.slug}:metric:${metric.key}`],
    quality_flags: metric.qualityFlags || [],
  }));
  const metricClaims = spec.metrics.map((metric) => pendingClaim({
    id: `claim:${spec.slug}:metric:${metric.key}`,
    fieldPath: `metrics[metric:${spec.slug}:${metric.key}:${metric.asOf}].value`,
    sourceIds: metric.sourceKeys.map((sourceKey) => sid(spec.slug, sourceKey)),
    evidenceLocator: metric.evidenceLocator,
    assertion: metric.assertion,
    note: metric.note || null,
  }));
  const events = spec.events.map((event) => ({
    id: `event:${spec.slug}:${event.key}`,
    type: event.type,
    date: event.date,
    description: event.description,
    claim_ids: [`claim:${spec.slug}:event:${event.key}`],
  }));
  const eventClaims = spec.events.map((event) => pendingClaim({
    id: `claim:${spec.slug}:event:${event.key}`,
    fieldPath: `events[event:${spec.slug}:${event.key}]`,
    sourceIds: event.sourceKeys.map((sourceKey) => sid(spec.slug, sourceKey)),
    evidenceLocator: event.evidenceLocator,
    assertion: event.assertion,
    note: event.note || null,
  }));

  return {
    schema: 'chaindump-entity-profile',
    version: 1,
    identity: { id: `cex:${spec.slug}`, type: 'cex', slug: spec.slug, name: spec.name, aliases: spec.aliases || [] },
    classification: spec.classification,
    status: {
      operating_state: spec.operatingState,
      as_of: AS_OF_DATE,
      claim_ids: [`claim:${spec.slug}:status`],
    },
    outcome: {
      label: spec.outcomeLabel,
      as_of: AS_OF_DATE,
      rule_id: 'exchange-lifecycle-v1',
      confidence: spec.outcomeConfidence,
      claim_ids: [`claim:${spec.slug}:outcome`],
    },
    analysis: {
      sections: Object.fromEntries(sectionEntries.map(([key, value]) => [key, {
        body: value.body,
        as_of: AS_OF_DATE,
        claim_ids: value.claims.map((_, index) => `claim:${spec.slug}:section:${key}:${index + 1}`),
      }])),
    },
    metrics,
    events,
    sources: spec.sources,
    claims: [
      pendingClaim({
        id: `claim:${spec.slug}:status`, fieldPath: 'status.operating_state',
        sourceIds: spec.statusSourceKeys.map((key) => sid(spec.slug, key)),
        evidenceLocator: spec.statusEvidenceLocator, assertion: spec.statusAssertion,
      }),
      pendingClaim({
        id: `claim:${spec.slug}:outcome`, fieldPath: 'outcome.label',
        sourceIds: spec.outcomeSourceKeys.map((key) => sid(spec.slug, key)),
        evidenceLocator: spec.outcomeEvidenceLocator, assertion: spec.outcomeAssertion,
        note: 'Analyst lifecycle classification, not a token-price recommendation.',
      }),
      ...sectionClaims,
      ...metricClaims,
      ...eventClaims,
    ],
    freshness: { state: 'current', last_reviewed_at: ACCESSED_AT, next_review_at: NEXT_REVIEW_AT, field_reviews: [] },
    quality: { publication_state: 'review', completeness_pct: 100, confidence: spec.qualityConfidence, unsourced_fields: spec.unsourcedFields },
    extensions: {
      legacy_origin: spec.table,
      methodology_notes: [
        'Freshness records evidence assembly and source verification, not human approval; every claim remains pending until an editor reviews it.',
        'Corporate reports, proof-of-reserves exercises, court records and regulator orders answer different questions and are not treated as interchangeable.',
        ...spec.methodologyNotes,
      ],
    },
  };
}

const coinbaseSources = makeSources('coinbase', [
  ['10k', 'Coinbase Global 2025 Form 10-K', 'https://www.sec.gov/Archives/edgar/data/1679788/000167978826000015/coin-20251231.htm', 'U.S. Securities and Exchange Commission', '2026-02-12'],
  ['q4', 'Q4 2025 Shareholder Letter', 'https://www.sec.gov/Archives/edgar/data/1679788/000167978826000011/q425shareholderletter.htm', 'Coinbase Global', '2026-02-12'],
  ['q1', 'Coinbase Q1 2026 Financial Results', 'https://investor.coinbase.com/news/news-details/2026/Coinbase-Q1-Financial-Results-Show-Resilient-Financial-Performance-Driven-by-New-All-Time-High-Crypto-Trading-Volume-Market-Share/default.aspx', 'Coinbase Global', '2026-05-07'],
  ['sec-dismissal', 'SEC Announces Dismissal of Civil Enforcement Action Against Coinbase', 'https://www.sec.gov/newsroom/press-releases/2025-47', 'U.S. Securities and Exchange Commission', '2025-02-27'],
  ['nydfs', 'Coinbase NYDFS Consent Order', 'https://www.dfs.ny.gov/system/files/documents/2023/01/ea20230104_coinbase.pdf', 'New York Department of Financial Services', '2023-01-04'],
  ['mica', 'Coinbase MiCA licence announcement', 'https://sanfrancisco.mae.lu/en/actualites/2025/june-24-coinbase-has-secured-its-markets-in-crypto-assets-mica-licence-from-luxembourgs-regulator.html', 'Government of Luxembourg', '2025-06-24'],
  ['products', 'System Update: The future of finance is on Coinbase', 'https://www.coinbase.com/blog/system-update-the-future-of-finance-is-on-coinbase', 'Coinbase', '2025-12-17'],
  ['loss', 'Coinbase swings to quarterly loss on trading slowdown', 'https://www.investing.com/news/stock-market-news/cryptocurrency-exchange-coinbases-swings-to-quarterly-loss-on-trading-slowdown-4504006', 'Reuters via Investing.com', '2026-02-12', 'B', 'independent'],
]);

const krakenSources = makeSources('kraken', [
  ['financials', 'Kraken 2025 financials', 'https://blog.kraken.com/news/kraken-2025-financials', 'Kraken', '2026-02-03'],
  ['por', 'Kraken Proof of Reserves', 'https://www.kraken.com/au/proof-of-reserves', 'Kraken', null],
  ['sec-dismissal', 'SEC v. Payward dismissal', 'https://www.sec.gov/enforcement-litigation/litigation-releases/lr-26278', 'U.S. Securities and Exchange Commission', '2025-03-27'],
  ['staking', 'Kraken agrees to end U.S. staking service and pay $30 million', 'https://www.sec.gov/newsroom/press-releases/2023-25', 'U.S. Securities and Exchange Commission', '2023-02-09'],
  ['licenses', 'Where is Kraken licensed or regulated?', 'https://support.kraken.com/articles/where-is-kraken-licensed-or-regulated', 'Kraken', '2026-06-08'],
  ['mica', 'Kraken activates MiCA licence across all 30 EEA countries', 'https://blog.kraken.com/news/all-30-eea-countries-mica', 'Kraken', '2025-08-12'],
  ['xstocks', 'xStocks eligible as collateral for futures and margin', 'https://blog.kraken.com/product/xstocks/eligible-as-collateral-for-futures-and-margin', 'Kraken', '2026-06-16'],
  ['backed', 'Kraken acquires Backed Finance', 'https://blog.kraken.com/news/backed-acquisition', 'Kraken', '2026-05-12'],
]);

const bitmexSources = makeSources('bitmex', [
  ['closure', 'BitMEX closure notice', 'https://www.bitmex.com/blog/bitmex-closure', 'BitMEX', '2026-07-23'],
  ['reuters', 'Cryptocurrency exchange BitMEX to shut down', 'https://live.euronext.com/en/financial-news/cryptocurrency-exchange-bitmex-shut-down', 'Reuters via Euronext', '2026-07-23', 'A', 'independent'],
  ['cftc', 'Federal Court Orders BitMEX to Pay $100 Million', 'https://www.cftc.gov/PressRoom/PressReleases/8412-21', 'Commodity Futures Trading Commission', '2021-08-10'],
  ['doj', 'Third BitMEX founder pleads guilty to Bank Secrecy Act violations', 'https://www.justice.gov/usao-sdny/pr/third-founder-cryptocurrency-exchange-pleads-guilty-bank-secrecy-act-violations', 'U.S. Department of Justice', '2022-03-09'],
  ['por', 'BitMEX Proof of Reserves and Liabilities', 'https://www.bitmex.com/app/porlDetails', 'BitMEX', null],
  ['security', 'BitMEX Security and Custody', 'https://www.bitmex.com/security-and-custody', 'BitMEX', null],
  ['perpetual', 'Five years ago, the perpetual swap was born', 'https://www.bitmex.com/blog/five-years-ago-the-perpetual-swap-was-born-everything-changed', 'BitMEX', '2021-05-13'],
  ['bmex', 'BMEX Litepaper 2025', 'https://static.bitmex.com/documents/2025_BMEX_LITEPAPER.pdf', 'BitMEX', '2025-01-01'],
  ['leverage', 'Cryptocurrency leverage trading: the case for BitMEX', 'https://arxiv.org/abs/2102.04591', 'arXiv', '2021-02-09', 'B', 'independent'],
]);

const ftxSources = makeSources('ftx', [
  ['doj-sentence', 'Samuel Bankman-Fried sentenced to 25 years', 'https://www.justice.gov/usao-sdny/pr/samuel-bankman-fried-sentenced-25-years-prison', 'U.S. Department of Justice', '2024-03-28'],
  ['cftc', 'Court orders FTX and Alameda to pay $12.7 billion', 'https://www.cftc.gov/PressRoom/PressReleases/8938-24', 'Commodity Futures Trading Commission', '2024-08-08'],
  ['distribution', 'FTX announces fifth distribution of approximately $900 million', 'https://www.prnewswire.com/news-releases/ftx-announces-fifth-distribution-of-approximately-900-million-to-creditors-on-july-31-2026-302828726.html', 'FTX Recovery Trust via PR Newswire', '2026-07-17'],
  ['faq', 'FTX Distributions Dashboard FAQs', 'https://support.ftx.com/hc/en-us/articles/34522100742804-Distributions-Dashboard-FAQs', 'FTX Recovery Trust', null],
  ['providers', 'General Information on Distribution Service Providers', 'https://support.ftx.com/hc/en-us/articles/33190623459092-General-Information-on-Distribution-Service-Providers', 'FTX Recovery Trust', null],
  ['claims', 'Using the FTX Customer Claims Portal', 'https://support.ftx.com/hc/en-us/articles/19519576531476-Using-the-Customer-Claims-Portal', 'FTX Recovery Trust', null],
  ['bahamas', 'FTX Digital Markets distribution notice', 'https://www.pwc.com/bs/en/services/business-restructuring-ftx-digital-markets/assets/fdm-notice-of-distribution-record-date-270526.pdf', 'PricewaterhouseCoopers Bahamas', '2026-05-27'],
  ['case', 'United States v. Samuel Bankman-Fried case page', 'https://www.justice.gov/usao-sdny/united-states-v-samuel-bankman-fried-aka-sbf-22-cr-673-lak', 'U.S. Department of Justice', null],
]);

const bittrexSources = makeSources('bittrex', [
  ['sec-settlement', 'Bittrex and former CEO settle SEC charges', 'https://www.sec.gov/newsroom/press-releases/2023-150', 'U.S. Securities and Exchange Commission', '2023-08-10'],
  ['sec-charge', 'SEC charges Bittrex and former CEO', 'https://www.sec.gov/newsroom/press-releases/2023-78', 'U.S. Securities and Exchange Commission', '2023-04-17'],
  ['ofac', 'OFAC announces Bittrex settlement', 'https://ofac.treasury.gov/recent-actions/20221011', 'U.S. Department of the Treasury', '2022-10-11'],
  ['bermuda-appeal', 'Bittrex Global (Bermuda) Ltd Court of Appeal judgment', 'https://www.gov.bm/sites/default/files/2026-03/Bittrex-Global.pdf', 'Government of Bermuda', '2026-03-01'],
  ['bermuda-ruling', 'In re Bittrex Global (Bermuda) Ltd', 'https://www.gov.bm/sites/default/files/2025-11/2024-No52-In-ReBittrex-Global.pdf', 'Supreme Court of Bermuda', '2025-11-01'],
  ['customer', 'Important information for Bittrex Global Bermuda customers', 'https://bittrexglobal.zendesk.com/hc/en-us/articles/17327877118621-Important-Information-for-Bittrex-Global-Bermuda-Customers', 'Bittrex Global', null],
  ['analysis', 'Bermuda case insights: Re Bittrex Global', 'https://www.conyers.com/publications/view/bermuda-case-insights-re-bittrex-global-bermuda-ltd-in-liquidation/', 'Conyers', '2025-12-08', 'B', 'independent'],
]);

const coinbase = buildProfile({
  slug: 'coinbase', name: 'Coinbase', table: 'successful_exchanges',
  sources: coinbaseSources,
  aliases: ['Coinbase Global', 'Coinbase Exchange'],
  classification: {
    subtype: 'centralized_multi_product_exchange',
    tags: ['custodial', 'public_company', 'spot', 'derivatives', 'payments', 'institutional'],
    chains: [], jurisdictions: ['United States', 'European Economic Area', 'multiple additional markets'],
  },
  operatingState: 'operating', outcomeLabel: 'successful_established',
  outcomeConfidence: 'high', qualityConfidence: 'high',
  statusSourceKeys: ['10k', 'q1', 'products'],
  statusEvidenceLocator: '2025 Form 10-K, Q1 2026 results and current product announcement.',
  statusAssertion: 'Coinbase remained an operating public-company exchange and financial platform as of August 3, 2026.',
  outcomeSourceKeys: ['10k', 'q1', 'loss'],
  outcomeEvidenceLocator: 'Full-year operating scale, Q1 2026 market-share update and independent earnings coverage.',
  outcomeAssertion: 'Coinbase is established and large, while still exposed to trading cycles and product-execution risk.',
  sections: {
    what_it_is: section(
      'Coinbase is a U.S.-listed financial company built around a custodial crypto exchange. It also sells custody, stablecoin services, staking, derivatives, payments and institutional trading. Different legal entities and licences serve different places and products, so a licence in one market does not authorize every Coinbase service worldwide.',
      [
        ['Coinbase combines a custodial exchange with subscription, institutional and payments businesses.', ['10k'], 'Business and revenue descriptions in the 2025 Form 10-K.'],
        ['Coinbase serves markets through different regulated entities rather than one worldwide licence.', ['10k', 'mica'], 'Regulation discussion and Luxembourg MiCA announcement.'],
      ],
    ),
    what_happened: section(
      'In 2025 Coinbase reported 9.2 million monthly transacting users, $376 billion of assets on platform and $6.88 billion of net revenue. Its Form 10-K defines $1.221 trillion of annual spot trading volume, while the shareholder letter reports $5.2 trillion of broader “Total Coinbase trading volume.” Those are different definitions: the larger figure spans a wider product family and must not be presented as spot volume.',
      [
        ['Coinbase reported 9.2 million MTUs, $376 billion of assets on platform and $6.88 billion of 2025 net revenue.', ['10k'], '2025 operating metrics and consolidated statements.'],
        ['The $1.221 trillion spot figure and $5.2 trillion broad platform figure use different definitions.', ['10k', 'q4'], '10-K trading-volume definition compared with the shareholder-letter platform measure.'],
      ],
    ),
    why_this_outcome: section(
      'Coinbase converted an early U.S. retail brand into regulated custody, institutional execution and a public-company balance sheet. It then widened the revenue mix beyond transaction fees. That distribution and compliance investment help explain durability, but they do not remove market sensitivity: 2025 transaction revenue still exceeded subscription and services revenue, and Reuters reported a quarterly loss when trading slowed.',
      [
        ['Institutional, retail and subscription products reduce reliance on a single customer or product.', ['10k', 'products'], 'Business segments, customer groups and product expansion.'],
        ['Coinbase remains materially exposed to trading activity even after diversifying revenue.', ['10k', 'loss'], '2025 revenue mix and independent Q4 earnings coverage.'],
      ],
    ),
    strategic_choices: section(
      'Management chose a compliance-heavy U.S. base, public listing and custody-led institutional strategy instead of operating as an offshore venue. It also deliberately changed stablecoin-pair pricing in March 2025; the 10-K attributes a $101 billion decline in stablecoin-pair volume to that choice. More recently it expanded toward an “everything exchange” with derivatives, stocks and prediction products, increasing both reach and operating complexity.',
      [
        ['Coinbase chose regulated custody and public-company reporting as core distribution advantages.', ['10k', 'mica'], 'Corporate structure, licences and custody business disclosures.'],
        ['A March 2025 pricing change intentionally reduced reported stablecoin-pair trading volume by $101 billion.', ['10k'], '2025 trading-volume discussion.'],
      ],
    ),
    operating_model: section(
      'Customers place trades or use Coinbase products through custodial accounts, while institutions also use prime, custody and execution services. The company earns transaction fees and spreads, plus subscription and services revenue from stablecoins, blockchain rewards, interest, custody and other products. Revenue is company revenue; a customer balance, Base activity or USDC circulation is not automatically Coinbase profit.',
      [
        ['Coinbase earns transaction revenue plus subscription and services revenue.', ['10k'], 'Revenue recognition and disaggregated revenue tables.'],
        ['Custody, stablecoin and blockchain-reward activity have distinct economics and accounting treatment.', ['10k'], 'Business and revenue-recognition sections.'],
      ],
    ),
    token_and_value_capture: section(
      'Coinbase has not launched a Coinbase exchange utility token. COIN is public equity, not a venue token, and gives shareholders corporate rights rather than exchange discounts or on-chain governance. USDC is issued through a separate arrangement and Base is an Ethereum layer-2 product; neither gives users an automatic claim on Coinbase revenue. Value capture therefore sits primarily in company fees, cash flows and equity.',
      [
        ['Coinbase has no exchange utility token; COIN is public-company equity.', ['10k'], 'Capital stock and business descriptions.'],
        ['USDC economics and Base activity do not create a general customer claim on Coinbase revenue.', ['10k'], 'Stablecoin and blockchain platform disclosures.'],
      ],
    ),
    counterfactual: section(
      'Coinbase would be less resilient if it had remained a U.S. retail spot broker funded almost entirely by volatile transaction fees. The institutional, custody and subscription businesses provided a wider base. The opposite risk is overexpansion: if new products add compliance cost without retained users or durable revenue, a narrower exchange could have produced better margins.',
      [
        ['The reported revenue mix supports the view that non-trading products broadened the business.', ['10k'], 'Transaction versus subscription and services revenue.'],
        ['Whether newer products improve long-run margins remains unproven as of August 3, 2026.', ['products', 'q1'], 'Recent product launches and current financial update.', 'context_only'],
      ],
    ),
    risks_and_unknowns: section(
      'Trading volume, crypto prices and interest rates can move Coinbase revenue quickly. Regulation remains entity- and product-specific: the SEC dismissed its 2023 case in 2025 as a policy decision, not a blanket legal endorsement, while the 2023 NYDFS order documented earlier compliance failures and required a $50 million penalty plus $50 million of compliance investment. Current product-level profitability and unique-user retention are not publicly broken out.',
      [
        ['The SEC dismissal was a discretionary policy decision rather than a merits ruling on every Coinbase product.', ['sec-dismissal'], 'SEC dismissal announcement.'],
        ['NYDFS imposed a $50 million penalty and separate $50 million compliance investment in 2023.', ['nydfs'], 'Consent order findings and monetary terms.'],
      ],
    ),
    lifecycle: section(
      'Coinbase moved from a retail bitcoin broker to a public, multi-product financial platform. The current phase is expansion under a larger regulatory footprint: Luxembourg MiCA authorization supports EEA service through the named entity, and 2026 results reported an 8.6% crypto-trading market share under Coinbase’s own broad definition. That market-share figure is operator-reported and is not a verified share of global spot volume.',
      [
        ['Coinbase’s Luxembourg authorization supports service across the EEA through its licensed entity.', ['mica'], 'Luxembourg government announcement.'],
        ['Coinbase reported 8.6% crypto-trading market share for Q1 2026 using its platform definition.', ['q1'], 'Q1 2026 company results.'],
      ],
    ),
    outlook_and_watch: section(
      'The outlook is established but cycle-sensitive. Watch monthly users, assets on platform, spot and derivatives volume separately, transaction versus subscription revenue, custody growth, product-level regulatory permissions and operating margin. A stronger call requires evidence that newer products retain customers and earn durable revenue without weakening controls; a weaker call follows falling users, assets and revenue across several quarters.',
      [
        ['Current scale supports an established outlook, but trading sensitivity remains material.', ['10k', 'q1', 'loss'], 'Full-year and quarterly operating evidence.'],
        ['Product retention and product-level profitability remain important disclosed-data gaps.', ['10k', 'products'], 'Segment and product disclosure boundaries.', 'context_only'],
      ],
    ),
  },
  metrics: [
    {
      key: 'spot-volume-2025', dimension: 'spot_volume', label: '2025 defined spot trading volume',
      value: 1221000000000, unit: 'USD', currency: 'USD', start: '2025-01-01', end: '2025-12-31', asOf: '2025-12-31',
      window: 'Coinbase-defined full-year spot volume; excludes derivatives, equities and event contracts and includes one-half of routed-off-platform spot trades.',
      method: 'Company-reported Form 10-K measure.', scope: { product: 'Coinbase-defined spot trading', jurisdictions: ['global platform scope'] },
      sourceKeys: ['10k'], evidenceLocator: '2025 key business metrics and volume definition.',
      assertion: 'Coinbase reported $1.221 trillion of defined spot trading volume for 2025.',
      qualityFlags: ['operator_reported', 'definition_specific'],
    },
    {
      key: 'assets-2025', dimension: 'customer_assets', label: 'Assets on Platform',
      value: 376000000000, unit: 'USD', currency: 'USD', asOf: '2025-12-31',
      window: 'Point-in-time company measure at December 31, 2025.', method: 'Company-reported Form 10-K measure.',
      scope: { product: 'assets on platform', jurisdictions: ['global platform scope'] }, sourceKeys: ['10k'],
      evidenceLocator: '2025 key business metrics.', assertion: 'Coinbase reported $376 billion of assets on platform at December 31, 2025.',
      qualityFlags: ['operator_reported', 'not_customer_liabilities'],
    },
    {
      key: 'mtu-2025', dimension: 'active_users', label: 'Average monthly transacting users',
      value: 9200000, unit: 'users', currency: null, start: '2025-01-01', end: '2025-12-31', asOf: '2025-12-31',
      window: 'Company-defined average monthly transacting users for 2025.', method: 'Company-reported Form 10-K measure.',
      scope: { product: 'Coinbase platform', jurisdictions: ['global platform scope'] }, sourceKeys: ['10k'],
      evidenceLocator: '2025 key business metrics and MTU definition.', assertion: 'Coinbase reported 9.2 million average monthly transacting users for 2025.',
      qualityFlags: ['operator_reported', 'company_defined_user_metric'],
    },
    {
      key: 'nydfs-fine', dimension: 'regulatory_fines', label: '2023 NYDFS civil monetary penalty',
      value: 50000000, unit: 'USD', currency: 'USD', asOf: '2023-01-04',
      window: 'One-time civil monetary penalty in the January 2023 consent order.', method: 'Regulator order.',
      scope: { product: 'New York compliance program', jurisdictions: ['New York, United States'] }, sourceKeys: ['nydfs'],
      evidenceLocator: 'Consent order monetary provisions.', assertion: 'NYDFS imposed a $50 million penalty; the separate $50 million compliance investment is not part of this metric.',
      qualityFlags: ['regulator_order', 'scoped_entity_and_period'],
    },
  ],
  events: [
    { key: 'public-listing', type: 'public_listing', date: '2021-04-14', description: 'Coinbase Global became a U.S.-listed public company through a direct listing.', sourceKeys: ['10k'], evidenceLocator: 'Corporate history and equity disclosures.', assertion: 'Coinbase became publicly listed in April 2021.' },
    { key: 'sec-dismissal', type: 'legal_case_dismissed', date: '2025-02-27', description: 'The SEC dismissed its civil enforcement action against Coinbase with prejudice as a policy decision.', sourceKeys: ['sec-dismissal'], evidenceLocator: 'SEC announcement.', assertion: 'The SEC dismissed its Coinbase civil action with prejudice in February 2025.' },
    { key: 'mica', type: 'regulatory_authorization', date: '2025-06-24', description: 'Coinbase secured a MiCA licence from Luxembourg for EEA service through the named licensed entity.', sourceKeys: ['mica'], evidenceLocator: 'Luxembourg government announcement.', assertion: 'Luxembourg announced Coinbase’s MiCA authorization in June 2025.' },
  ],
  unsourcedFields: ['Product-level profitability', 'Unique-user retention by product', 'Comparable worldwide share of spot-only volume'],
  methodologyNotes: ['Coinbase’s $1.221 trillion spot metric is kept separate from the $5.2 trillion broader platform measure.'],
});

const kraken = buildProfile({
  slug: 'kraken', name: 'Kraken', table: 'successful_exchanges', aliases: ['Payward', 'Kraken Exchange'],
  sources: krakenSources,
  classification: {
    subtype: 'centralized_multi_product_exchange',
    tags: ['custodial', 'private_company', 'spot', 'derivatives', 'tokenized_equities'],
    chains: [], jurisdictions: ['United States', 'European Economic Area', 'multiple additional markets'],
  },
  operatingState: 'operating', outcomeLabel: 'successful_diversifying', outcomeConfidence: 'high', qualityConfidence: 'high',
  statusSourceKeys: ['financials', 'licenses', 'xstocks'], statusEvidenceLocator: '2025 financials and current licensing and product pages.',
  statusAssertion: 'Kraken remained an operating, multi-product centralized exchange as of August 3, 2026.',
  outcomeSourceKeys: ['financials', 'licenses'], outcomeEvidenceLocator: '2025 scale and current regulatory footprint.',
  outcomeAssertion: 'Kraken is an established private exchange that is diversifying beyond crypto spot trading.',
  sections: {
    what_it_is: section(
      'Kraken is a custodial exchange operated through the Payward group and related licensed entities. It offers spot, margin, derivatives, custody and consumer products, with availability depending on the customer, jurisdiction and legal entity. Recent expansion into xStocks and acquired infrastructure does not turn every Kraken customer into a securities customer or authorize every product worldwide.',
      [
        ['Kraken is a Payward-operated custodial exchange with several product and legal-entity boundaries.', ['licenses', 'financials'], 'Current licensing page and 2025 business scope.'],
        ['xStocks and derivatives are jurisdiction- and eligibility-dependent products.', ['xstocks', 'licenses'], 'Current product and licensing restrictions.'],
      ],
    ),
    what_happened: section(
      'Kraken reported $2.2 billion of adjusted revenue, $531 million of adjusted EBITDA, $2.0 trillion of total platform transaction volume, $48.2 billion of assets and 5.7 million funded accounts for 2025. The $2.0 trillion figure is not spot-only: Kraken says it spans spot, margin, consumer, OTC spot, equities, xStocks, Krak, Earn, funding and affiliated NinjaTrader activity. The company also notes revised prior periods and acquisition timing.',
      [
        ['Kraken reported $2.2 billion adjusted revenue and $531 million adjusted EBITDA for 2025.', ['financials'], '2025 financial highlights and definitions.'],
        ['The reported $2.0 trillion transaction volume covers a broad product family and is not spot-only.', ['financials'], 'Total platform transaction volume definition.'],
      ],
    ),
    why_this_outcome: section(
      'Kraken survived multiple market cycles by combining a security-focused brand with professional trading, broad asset coverage and geographic licensing. It is now using acquisitions and product expansion to reach traditional assets and derivatives. That strategy broadens distribution, but the public evidence does not isolate organic growth from acquired activity or show product-level profit.',
      [
        ['Kraken’s current scale spans consumer, professional and acquired product lines.', ['financials', 'backed'], '2025 scope and Backed acquisition.'],
        ['Reported company totals do not isolate organic growth or product-level profit.', ['financials'], 'Methodology notes and consolidated adjusted figures.', 'context_only'],
      ],
    ),
    strategic_choices: section(
      'Kraken remained privately held while investing in regulated entities, professional execution and a wider product suite. It exited U.S. staking-as-a-service in the 2023 SEC settlement, later activated a MiCA licence across the EEA and bought Backed to bring tokenized-equity infrastructure in-house. These choices favor regulated breadth, but add integration and legal complexity.',
      [
        ['Kraken ended U.S. staking-as-a-service under a 2023 SEC settlement.', ['staking'], 'SEC settlement terms.'],
        ['Kraken expanded EEA licensing and acquired Backed for tokenized-equity infrastructure.', ['mica', 'backed'], 'MiCA activation and acquisition announcement.'],
      ],
    ),
    operating_model: section(
      'Kraken holds customer assets for custodial products, matches trades and sells execution, custody, staking and other services. Company-reported financials aggregate a broader platform that now includes affiliated and acquired businesses. Its proof-of-reserves page describes an accountant-assisted check of covered assets and customer claims; that exercise is useful but is not a complete financial-statement audit or proof of every corporate liability.',
      [
        ['Kraken’s reported platform combines exchange and adjacent financial products.', ['financials'], 'Financial metric definitions.'],
        ['Proof of reserves covers named assets and claims, not every corporate asset, liability or control.', ['por'], 'Current proof-of-reserves scope and limitations.'],
      ],
    ),
    token_and_value_capture: section(
      'Kraken has not launched a Kraken exchange utility token. The business captures value through private-company revenue and ownership, not a token that gives customers equity or a general share of fees. xStocks are separately issued tokenized-equity products with their own legal terms; they are not a Kraken ownership token.',
      [
        ['Kraken’s reported value capture is private-company revenue rather than a venue token.', ['financials'], 'Company financial reporting and product description.'],
        ['xStocks are distinct tokenized-equity products, not equity in Kraken.', ['xstocks', 'backed'], 'xStocks product and infrastructure descriptions.'],
      ],
    ),
    counterfactual: section(
      'Kraken might have stayed simpler by remaining a crypto-only exchange, but that would leave more revenue tied to one market cycle. Diversification can improve resilience if acquired users, licences and products generate durable margins. It can destroy value if integrations, regulatory fragmentation and operating costs grow faster than retained demand; current public reporting cannot yet settle that trade-off.',
      [
        ['Kraken has deliberately expanded beyond crypto-only spot trading.', ['financials', 'xstocks', 'backed'], 'Current platform scope and acquisitions.'],
        ['Public reporting does not yet show product-level acquisition returns or retention.', ['financials'], 'Consolidated adjusted reporting boundaries.', 'context_only'],
      ],
    ),
    risks_and_unknowns: section(
      'Kraken faces custody, market, derivatives and multi-jurisdiction compliance risk. The SEC dismissed its 2023 exchange case with prejudice in March 2025, while expressly saying the decision reflected policy and discretion rather than the merits of other cases. The separate 2023 staking settlement and $30 million payment remain historical facts. Audited consolidated financial statements, current product margins and unique-person counts were not public in the reviewed sources.',
      [
        ['The 2025 SEC dismissal was policy-based and did not decide broader legal merits.', ['sec-dismissal'], 'SEC litigation release.'],
        ['The 2023 staking settlement required a $30 million payment and U.S. service closure.', ['staking'], 'SEC settlement announcement.'],
      ],
    ),
    lifecycle: section(
      'Kraken grew from a crypto spot exchange into a wider trading and asset platform. Its current phase combines EEA MiCA operation, tokenized-equity distribution and derivatives expansion. The March 31, 2026 proof-of-reserves exercise offers a current check for covered assets and customer claims, but it should not be read as proof of company-wide solvency.',
      [
        ['Kraken activated MiCA service across the EEA through its licensed entity.', ['mica', 'licenses'], 'Current MiCA and licensing pages.'],
        ['The March 31, 2026 reserve exercise is limited to covered assets and participating claims.', ['por'], 'Current proof-of-reserves page.'],
      ],
    ),
    outlook_and_watch: section(
      'The outlook is established and diversifying. Watch funded accounts, assets, spot and derivatives activity separately, recurring versus transaction revenue, proof-of-reserves coverage, licence changes and the economics of xStocks and acquisitions. A stronger call requires transparent retention and margin evidence across the expanded platform; a weaker call follows declining assets and users, control failures or costly integration without durable demand.',
      [
        ['Current scale and licensing support an established operating outlook.', ['financials', 'licenses'], 'Financial and regulatory evidence.'],
        ['Acquisition economics and product-level retention remain important unknowns.', ['financials', 'backed'], 'Consolidated reporting and acquisition announcement.', 'context_only'],
      ],
    ),
  },
  metrics: [
    {
      key: 'assets-2025', dimension: 'customer_assets', label: 'Company-reported platform assets', value: 48200000000,
      unit: 'USD', currency: 'USD', asOf: '2025-12-31', window: 'Point-in-time company measure at December 31, 2025.',
      method: 'Company-reported 2025 financial measure.', scope: { product: 'Kraken platform assets', jurisdictions: ['reported platform scope'] },
      sourceKeys: ['financials'], evidenceLocator: '2025 financial highlights.', assertion: 'Kraken reported $48.2 billion of platform assets at year-end 2025.',
      qualityFlags: ['operator_reported', 'not_liability_matched', 'not_financial_audit'],
    },
    {
      key: 'funded-accounts-2025', dimension: 'active_users', label: 'Funded accounts', value: 5700000,
      unit: 'accounts', currency: null, asOf: '2025-12-31', window: 'Company-reported funded accounts at year-end 2025.',
      method: 'Company-reported account measure.', scope: { product: 'Kraken platform', jurisdictions: ['reported platform scope'] },
      sourceKeys: ['financials'], evidenceLocator: '2025 financial highlights.', assertion: 'Kraken reported 5.7 million funded accounts for 2025; accounts are not necessarily unique people.',
      qualityFlags: ['operator_reported', 'accounts_not_unique_people'],
    },
    {
      key: 'staking-settlement', dimension: 'regulatory_fines', label: '2023 U.S. staking settlement payment', value: 30000000,
      unit: 'USD', currency: 'USD', asOf: '2023-02-09', window: 'One-time SEC settlement payment.', method: 'Regulator announcement.',
      scope: { product: 'U.S. staking-as-a-service', jurisdictions: ['United States'] }, sourceKeys: ['staking'],
      evidenceLocator: 'SEC settlement terms.', assertion: 'Kraken-affiliated entities agreed to pay $30 million in the 2023 U.S. staking settlement.',
      qualityFlags: ['regulator_order', 'scoped_service_and_entities'],
    },
  ],
  events: [
    { key: 'staking-settlement', type: 'regulatory_settlement', date: '2023-02-09', description: 'Kraken-affiliated entities agreed to end U.S. staking-as-a-service and pay $30 million.', sourceKeys: ['staking'], evidenceLocator: 'SEC announcement.', assertion: 'The 2023 settlement ended Kraken’s U.S. staking-as-a-service offering.' },
    { key: 'sec-dismissal', type: 'legal_case_dismissed', date: '2025-03-27', description: 'The SEC dismissed its exchange civil action against Payward entities with prejudice.', sourceKeys: ['sec-dismissal'], evidenceLocator: 'SEC litigation release.', assertion: 'The SEC dismissed its Payward exchange action in March 2025.' },
    { key: 'backed-acquisition', type: 'acquisition', date: '2026-05-12', description: 'Kraken announced the acquisition of Backed Finance to internalize tokenized-equity infrastructure.', sourceKeys: ['backed'], evidenceLocator: 'Kraken acquisition announcement.', assertion: 'Kraken announced its Backed Finance acquisition in May 2026.' },
  ],
  unsourcedFields: ['Audited consolidated financial statements', 'Product-level profitability', 'Unique natural-person users', 'Organic versus acquired growth'],
  methodologyNotes: ['Kraken’s $2.0 trillion total platform transaction volume is not forced into a spot or derivatives metric because the published scope mixes product families.'],
});

const bitmex = buildProfile({
  slug: 'bitmex', name: 'BitMEX', table: 'dead_exchanges', aliases: ['Bitcoin Mercantile Exchange'],
  sources: bitmexSources,
  classification: {
    subtype: 'centralized_derivatives_exchange',
    tags: ['custodial', 'derivatives', 'perpetual_swaps', 'wind_down_announced'],
    chains: [], jurisdictions: ['Global excluding restricted jurisdictions', 'United States excluded'],
  },
  operatingState: 'wind_down_announced', outcomeLabel: 'declining_wind_down_announced', outcomeConfidence: 'high', qualityConfidence: 'high',
  statusSourceKeys: ['closure', 'reuters'], statusEvidenceLocator: 'Dated closure timetable and independent confirmation.',
  statusAssertion: 'BitMEX was still operating on August 3, 2026, with exchange closure scheduled for September 23, 2026 at 04:00 UTC.',
  outcomeSourceKeys: ['closure', 'reuters'], outcomeEvidenceLocator: 'Operator wind-down timetable and independent report.',
  outcomeAssertion: 'BitMEX is in an announced global exchange wind-down; the specific business cause remains undisclosed.',
  sections: {
    what_it_is: section(
      'BitMEX is a custodial crypto derivatives exchange owned and operated by HDR Global Trading Limited. It helped popularize the perpetual swap and built its brand around leveraged, crypto-margined trading. The 2026 notice covers the whole BitMEX Exchange, not only a country, product or affiliate, while the earlier U.S. enforcement action concerned a separate geographic and legal boundary.',
      [
        ['HDR Global Trading Limited is the named owner and operator of the BitMEX Exchange.', ['closure'], 'Closure notice owner and operator statement.'],
        ['The 2026 whole-exchange wind-down is distinct from BitMEX’s 2021 U.S. regulatory exit.', ['closure', 'cftc'], 'Global closure timetable compared with CFTC entity and U.S. operations order.'],
      ],
    ),
    what_happened: section(
      'On July 23, 2026, BitMEX stopped accepting new account registrations and announced that the exchange would close on September 23, 2026 at 04:00 UTC. Risk limits and reduce-only trading are scheduled to begin August 26. The venue was still operating on August 3, so describing it as already shut would be wrong. Reuters independently confirmed the scheduled closure and that BitMEX did not state a specific reason.',
      [
        ['BitMEX stopped new registrations on July 23 and scheduled closure for September 23, 2026 at 04:00 UTC.', ['closure'], 'Closure timetable.'],
        ['BitMEX was still operating during the announced wind-down on August 3, 2026.', ['closure', 'reuters'], 'Future-dated closure and independent report.'],
      ],
    ),
    why_this_outcome: section(
      'The board said the decision followed a strategic review of the business and broader crypto industry. It has not published a specific cause. Competition is a plausible outside explanation discussed by an analyst quoted by Reuters, but it is not an established company finding. The reviewed evidence does not prove insolvency, a security loss, regulation, BMEX performance or a single market-share event caused the closure.',
      [
        ['BitMEX publicly attributed the decision only to a strategic review of the business and industry.', ['closure'], 'Board rationale in closure notice.'],
        ['Competition is outside analysis, not an established cause published by BitMEX.', ['reuters'], 'Reuters report distinguishing company silence from analyst interpretation.', 'context_only'],
      ],
    ),
    strategic_choices: section(
      'BitMEX chose extreme derivatives specialization, crypto-collateralized leverage and a global offshore model. It also operated without an adequate U.S. registration and AML/KYC program before the 2021 CFTC order, then excluded U.S. customers and changed controls. In the final wind-down, management chose a two-month runway with reduce-only trading before forced closure rather than an immediate halt.',
      [
        ['BitMEX built around leveraged crypto derivatives and the perpetual swap.', ['perpetual', 'leverage'], 'Product history and independent leverage study.'],
        ['The 2021 CFTC order addressed registration and AML/KYC failures and required U.S. operational separation.', ['cftc'], 'CFTC settlement findings and certifications.'],
      ],
    ),
    operating_model: section(
      'Customers deposit assets with BitMEX and trade centrally matched derivatives. The exchange manages margin, liquidation and custody, so users depend on its controls and withdrawal process. BitMEX publishes reserve addresses and a Merkle-based liabilities check twice weekly for covered assets. That is a useful point-in-time reconciliation tool, not a financial-statement audit or proof of every corporate obligation.',
      [
        ['BitMEX centrally manages collateral, matching, margin and custody for derivatives trading.', ['security', 'perpetual'], 'Custody and product descriptions.'],
        ['Its reserve-and-liability process covers published assets and Merkle claims but is not a full corporate audit.', ['por'], 'Proof-of-reserves methodology and coverage.'],
      ],
    ),
    token_and_value_capture: section(
      'BMEX is an exchange utility and rewards token described in the 2025 litepaper; it is not equity and does not guarantee exchange revenue or continued operation. The closure notice says all staked BMEX was unstaked immediately. That makes the boundary clear: token utility depended on an operating venue, but the evidence does not establish that BMEX caused the wind-down.',
      [
        ['BMEX provides exchange-linked utility and rewards rather than equity ownership.', ['bmex'], 'BMEX litepaper utility and rights.'],
        ['BitMEX unstaked all staked BMEX when it announced the closure.', ['closure'], 'Customer and token instructions in closure notice.'],
      ],
    ),
    counterfactual: section(
      'A broader spot, custody or institutional franchise might have reduced dependence on leveraged derivatives and a shrinking brand position. Earlier regulatory investment could also have avoided part of the legal damage and management distraction documented in 2021 and 2022. Neither counterfactual proves the 2026 decision would have changed, because BitMEX has not disclosed the economics or board thresholds behind the closure.',
      [
        ['Earlier compliant U.S. controls could have avoided the violations established in the CFTC and DOJ cases.', ['cftc', 'doj'], 'Regulator and criminal-case findings.'],
        ['The effect of product breadth on the 2026 closure cannot be proven from the disclosed record.', ['closure', 'reuters'], 'Limited published rationale.', 'context_only'],
      ],
    ),
    risks_and_unknowns: section(
      'The immediate customer risks are position closure, pricing during reduce-only trading and leaving assets behind. After September 23, users may still log in, view history and withdraw, but open positions will be force-closed and balances left after closure can incur a monthly charge equal to the greater of $50 or 1% a year for KYC users. BitMEX has not published audited wind-down financials, expected residual balances or a specific closure cause.',
      [
        ['Open positions remaining at closure will be force-closed under the published timetable.', ['closure'], 'Closure and position-handling instructions.'],
        ['Post-closure login and withdrawals remain available, while qualifying residual balances can incur a fee.', ['closure'], 'Post-closure account and fee terms.'],
      ],
    ),
    lifecycle: section(
      'BitMEX evolved from a category-defining derivatives venue into a regulated-exit and wind-down case. It settled the U.S. CFTC action in 2021, with named BitMEX entities paying $100 million and certifying the U.S. operating boundary. As of August 3, 2026 it remains open in a managed wind-down: reduce-only restrictions start August 26, the exchange closes September 23, 2026, and withdrawals remain available after closure.',
      [
        ['The 2021 $100 million CFTC settlement addressed the earlier U.S. regulatory boundary.', ['cftc'], 'Settlement terms and entity scope.'],
        ['BitMEX operates through the announced September 23 closure date, with withdrawals continuing afterward.', ['closure'], 'Wind-down schedule and post-closure access.'],
      ],
    ),
    outlook_and_watch: section(
      'The base case is orderly exchange closure on September 23, followed by a withdrawal-only account service. Watch whether reduce-only and forced-close mechanics work as stated, whether users can withdraw promptly, whether the board publishes a fuller rationale and whether any buyer or successor service emerges. Do not label BitMEX insolvent or already closed without new evidence.',
      [
        ['The published base case is scheduled closure followed by continued account and withdrawal access.', ['closure'], 'Closure notice timetable.'],
        ['Insolvency, a sale and a specific closure cause remain unconfirmed as of August 3, 2026.', ['closure', 'reuters'], 'Operator notice and independent report.', 'context_only'],
      ],
    ),
  },
  metrics: [
    {
      key: 'cftc-settlement', dimension: 'regulatory_fines', label: '2021 CFTC monetary penalty', value: 100000000,
      unit: 'USD', currency: 'USD', asOf: '2021-08-10', window: 'One-time monetary penalty in the 2021 CFTC settlement.',
      method: 'Federal court consent order reported by the regulator.', scope: { product: 'BitMEX U.S. regulatory case', jurisdictions: ['United States'] },
      sourceKeys: ['cftc'], evidenceLocator: 'CFTC settlement amount and entity scope.', assertion: 'Named BitMEX entities were ordered to pay a $100 million civil monetary penalty in 2021.',
      qualityFlags: ['regulator_order', 'scoped_entities_and_period'],
    },
  ],
  events: [
    { key: 'cftc-settlement', type: 'regulatory_settlement', date: '2021-08-10', description: 'A federal court ordered named BitMEX entities to pay $100 million and comply with U.S. registration and AML requirements.', sourceKeys: ['cftc'], evidenceLocator: 'CFTC announcement.', assertion: 'The 2021 CFTC settlement imposed a $100 million penalty and U.S. compliance obligations.' },
    { key: 'closure-announcement', type: 'wind_down_announced', date: '2026-07-23', description: 'BitMEX stopped new registrations and announced a whole-exchange closure for September 23, 2026.', sourceKeys: ['closure', 'reuters'], evidenceLocator: 'Operator closure notice and independent confirmation.', assertion: 'BitMEX announced the exchange wind-down on July 23, 2026.' },
    { key: 'reduce-only', type: 'wind_down_restriction', date: '2026-08-26', description: 'BitMEX scheduled risk-limit reductions and reduce-only trading to begin at 04:00 UTC.', sourceKeys: ['closure'], evidenceLocator: 'Closure timetable.', assertion: 'BitMEX scheduled reduce-only restrictions for August 26, 2026 at 04:00 UTC.' },
    { key: 'scheduled-closure', type: 'scheduled_closure', date: '2026-09-23', description: 'BitMEX scheduled exchange closure and forced closure of remaining positions for 04:00 UTC; account history and withdrawals remain available.', sourceKeys: ['closure'], evidenceLocator: 'Closure and post-closure instructions.', assertion: 'BitMEX scheduled exchange closure for September 23, 2026 at 04:00 UTC.' },
  ],
  unsourcedFields: ['Specific board closure cause', 'Audited wind-down balance sheet', 'Expected residual customer balances', 'Potential buyer or successor service'],
  methodologyNotes: ['The 2026 global exchange wind-down is kept separate from the 2021 U.S. regulatory exit.', 'Analyst commentary about competition is not promoted to a proven cause.'],
});

const ftx = buildProfile({
  slug: 'ftx', name: 'FTX', table: 'dead_exchanges', aliases: ['FTX.com', 'FTX Trading Ltd'],
  sources: ftxSources,
  classification: {
    subtype: 'collapsed_centralized_exchange',
    tags: ['custodial', 'bankruptcy', 'fraud', 'creditor_recovery'], chains: [],
    jurisdictions: ['United States bankruptcy proceedings', 'Bahamas liquidation proceedings', 'global former customer base'],
  },
  operatingState: 'closed_bankruptcy_recovery', outcomeLabel: 'failed_fraud_and_governance_collapse', outcomeConfidence: 'high', qualityConfidence: 'high',
  statusSourceKeys: ['distribution', 'faq', 'bahamas'], statusEvidenceLocator: 'Current Recovery Trust and Bahamas liquidation notices.',
  statusAssertion: 'FTX is closed; separate U.S. plan and Bahamas liquidation recovery processes remained active on August 3, 2026.',
  outcomeSourceKeys: ['doj-sentence', 'cftc'], outcomeEvidenceLocator: 'Criminal conviction and final CFTC judgment.',
  outcomeAssertion: 'FTX failed after criminal misuse of customer assets, false representations and intertwined Alameda controls.',
  sections: {
    what_it_is: section(
      'FTX.com was the international custodial exchange associated with FTX Trading Ltd and the wider FTX group. FTX.US was a separate customer platform inside the debtor group, and FTX Digital Markets in the Bahamas follows a separate liquidation process. The FTX Recovery Trust now administers distributions under the U.S. plan; it is not a relaunched exchange.',
      [
        ['FTX.com, FTX.US and FTX Digital Markets had distinct platform and legal-process boundaries.', ['doj-sentence', 'bahamas', 'faq'], 'Criminal-case entity description and separate recovery notices.'],
        ['The Recovery Trust distributes estate value and does not operate a revived FTX exchange.', ['distribution', 'faq'], 'Distribution announcement and dashboard guidance.'],
      ],
    ),
    what_happened: section(
      'FTX collapsed in November 2022 after customer withdrawals exposed a large hole and the group entered bankruptcy. A federal jury later convicted Sam Bankman-Fried, and the sentencing record says customer assets were secretly diverted to Alameda through special code and false segregation claims. The CFTC final judgment ordered $8.7 billion in restitution and $4 billion in disgorgement; that $12.7 billion legal remedy is not a current customer-shortfall measure.',
      [
        ['The criminal record established secret Alameda access, customer-fund misuse and false representations.', ['doj-sentence', 'case'], 'Sentencing release and case record.'],
        ['The CFTC’s $12.7 billion remedy combines restitution and disgorgement and is not a live shortfall metric.', ['cftc'], 'Final judgment monetary breakdown.'],
      ],
    ),
    why_this_outcome: section(
      'FTX did not fail because a token price happened to fall. The adjudicated record points to customer-asset misuse, undisclosed Alameda privileges, concentrated control and false claims about segregation. Falling FTT and withdrawals accelerated discovery of the problem, while FTT-linked collateral and the exchange’s relationship with Alameda amplified fragility. They exposed the failure; they did not create the underlying misconduct.',
      [
        ['Customer-asset misuse and secret Alameda privileges were established in the criminal case.', ['doj-sentence'], 'Sentencing findings.'],
        ['Market stress exposed a pre-existing governance and asset-control failure rather than serving as its sole cause.', ['doj-sentence', 'cftc'], 'Criminal and civil findings.'],
      ],
    ),
    strategic_choices: section(
      'Leadership combined an exchange, market maker, venture activity and an exchange-linked token inside a tightly controlled group. It gave Alameda special access and used customer assets outside the promised custody boundary. The group also expanded faster than its governance, accounting and risk controls. Those were management choices, not unavoidable blockchain mechanics.',
      [
        ['FTX gave Alameda secret, effectively unlimited access that ordinary customers did not have.', ['doj-sentence'], 'Sentencing description of special code access.'],
        ['Management represented customer assets as segregated while using them elsewhere.', ['doj-sentence', 'cftc'], 'Criminal and CFTC findings.'],
      ],
    ),
    operating_model: section(
      'FTX was a custodial exchange: customers depended on the company to safeguard deposits, maintain ledgers and honor withdrawals. Alameda was presented as a market participant but received hidden privileges and access. After bankruptcy, claims, distributions and identity checks moved to court-supervised and service-provider workflows. Those recovery systems should not be confused with exchange operations or normal withdrawals.',
      [
        ['FTX customers depended on a centralized custody and ledger system.', ['doj-sentence', 'cftc'], 'Customer-asset and exchange-control findings.'],
        ['Post-bankruptcy claims and distributions use separate Recovery Trust and service-provider workflows.', ['faq', 'providers', 'claims'], 'Current distribution and claims guidance.'],
      ],
    ),
    token_and_value_capture: section(
      'FTT was an exchange-linked utility token used for discounts and ecosystem incentives; it was not equity and did not give holders a bankruptcy-proof claim on FTX assets. Its use inside the FTX–Alameda balance-sheet relationship created reflexive collateral risk. The token’s fall was a warning and liquidity trigger, while the proven customer-asset misuse remained the core failure.',
      [
        ['FTT did not provide equity or a protected claim on FTX customer assets.', ['doj-sentence', 'cftc'], 'Legal findings and asset-control record.'],
        ['FTT-linked balance-sheet exposure amplified liquidity stress but does not replace the adjudicated cause.', ['doj-sentence'], 'Sentencing account of misconduct and collapse.', 'context_only'],
      ],
    ),
    counterfactual: section(
      'Independent custody controls, a genuinely separate Alameda relationship, audited financial reporting and a board able to stop related-party transfers could have prevented or limited the loss. A lower-growth exchange with enforceable asset segregation would have been more valuable than rapid expansion funded by customer money. Better token design alone would not have fixed the governance failure.',
      [
        ['Enforced segregation and independent controls directly address the misconduct established in court.', ['doj-sentence', 'cftc'], 'Customer-asset and control findings.'],
        ['Changing FTT alone would not correct secret related-party access to customer funds.', ['doj-sentence'], 'Mechanism of the proven fraud.'],
      ],
    ),
    risks_and_unknowns: section(
      'Recovery remains procedural and jurisdiction-specific. Eligibility, identity checks, distribution providers, claim class and election between processes can affect timing and amount. Crypto prices after the petition date are not restored by a dollar claim calculated under plan rules. The reviewed sources do not establish one universal recovery percentage, that every July 31 payment reached its recipient, or that all customers were made whole.',
      [
        ['Distribution timing and eligibility vary by claim class, provider and jurisdiction.', ['distribution', 'faq', 'providers'], 'Current distribution rules and service-provider guidance.'],
        ['A petition-date dollar recovery percentage is not the same as returning the original crypto.', ['distribution', 'faq'], 'Plan distribution description and dashboard FAQ.'],
      ],
    ),
    lifecycle: section(
      'FTX moved from rapid exchange growth to a November 2022 collapse, criminal conviction, plan administration and creditor distributions. The fifth U.S. distribution was announced for July 31, 2026 at approximately $900 million. For Classes 6A and 6B, the extra 3% brought stated cumulative distributions to 103% of petition-date dollar claims. That narrow measure does not mean customers were made whole in crypto terms or that every class received 103%.',
      [
        ['The Recovery Trust announced a roughly $900 million fifth distribution for July 31, 2026.', ['distribution'], 'Dated distribution announcement.'],
        ['The 103% cumulative figure applies to Classes 6A and 6B and petition-date dollar claims.', ['distribution'], 'Class-specific distribution table and explanation.'],
      ],
    ),
    outlook_and_watch: section(
      'FTX will remain a recovery and litigation case, not an operating exchange, unless a genuinely new venue is separately authorized and launched. Watch completed distributions rather than announcements, class-specific recovery, disputed claims, provider and jurisdiction delays, Bahamas coordination and final estate costs. Never compare plan percentages directly with token returns or call all creditors fully repaid.',
      [
        ['Current activity is estate recovery rather than exchange operation.', ['distribution', 'faq', 'bahamas'], 'Current U.S. and Bahamas recovery documents.'],
        ['Future assessment should separate announced distributions, completed payments and claim-class percentages.', ['distribution', 'providers'], 'Distribution timing and provider process.'],
      ],
    ),
  },
  metrics: [
    {
      key: 'class-6ab-recovery', dimension: 'creditor_recovery', label: 'Classes 6A and 6B cumulative petition-date dollar distributions', value: 103,
      unit: 'percent', currency: null, asOf: '2026-07-31', window: 'Cumulative percentage stated after the fifth distribution for Classes 6A and 6B only.',
      method: 'Recovery Trust class-specific distribution statement.', scope: { product: 'U.S. plan Classes 6A and 6B', jurisdictions: ['U.S. plan distribution process'] },
      sourceKeys: ['distribution'], evidenceLocator: 'Fifth distribution class table and cumulative percentage.',
      assertion: 'The Recovery Trust stated 103% cumulative petition-date dollar distributions for Classes 6A and 6B after the fifth distribution.',
      qualityFlags: ['class_specific', 'petition_date_dollars', 'not_original_crypto_recovery', 'announcement_not_recipient_confirmation'],
    },
  ],
  events: [
    { key: 'bankruptcy', type: 'bankruptcy', date: '2022-11-11', description: 'FTX group entities entered Chapter 11 proceedings after the exchange collapse.', sourceKeys: ['doj-sentence', 'case'], evidenceLocator: 'Criminal-case chronology.', assertion: 'FTX entered bankruptcy proceedings in November 2022.' },
    { key: 'sentence', type: 'criminal_sentence', date: '2024-03-28', description: 'Sam Bankman-Fried received a 25-year federal prison sentence and more than $11 billion in forfeiture after conviction.', sourceKeys: ['doj-sentence'], evidenceLocator: 'DOJ sentencing announcement.', assertion: 'Bankman-Fried was sentenced to 25 years and ordered to forfeit more than $11 billion.' },
    { key: 'cftc-judgment', type: 'civil_judgment', date: '2024-08-08', description: 'The CFTC final judgment ordered $8.7 billion restitution and $4 billion disgorgement against FTX and Alameda.', sourceKeys: ['cftc'], evidenceLocator: 'CFTC final judgment announcement.', assertion: 'The CFTC judgment ordered $12.7 billion split between restitution and disgorgement.' },
    { key: 'fifth-distribution', type: 'creditor_distribution', date: '2026-07-31', description: 'The Recovery Trust announced commencement of an approximately $900 million fifth distribution to eligible classes.', sourceKeys: ['distribution'], evidenceLocator: 'Fifth distribution announcement.', assertion: 'The Recovery Trust announced the fifth distribution for July 31, 2026.' },
  ],
  unsourcedFields: ['Universal customer recovery percentage', 'Recipient-level payment completion', 'Final estate cost', 'Final timing for all disputed claims'],
  methodologyNotes: ['FTX.com, FTX.US, the Recovery Trust and FTX Digital Markets Bahamas are not collapsed into one legal process.', 'Recovery percentages are labeled by claim class and petition-date dollar basis.'],
});

const bittrex = buildProfile({
  slug: 'bittrex', name: 'Bittrex', table: 'dead_exchanges', aliases: ['Bittrex Inc.', 'Bittrex Global'],
  sources: bittrexSources,
  classification: {
    subtype: 'closed_centralized_exchange_group', tags: ['custodial', 'closed', 'regulatory_pressure', 'liquidation'], chains: [],
    jurisdictions: ['United States', 'Liechtenstein', 'Bermuda'],
  },
  operatingState: 'closed_recovery_processes', outcomeLabel: 'closed_regulatory_and_business_wind_down', outcomeConfidence: 'medium', qualityConfidence: 'high',
  statusSourceKeys: ['bermuda-appeal', 'customer', 'sec-settlement'], statusEvidenceLocator: 'Regulatory case, customer notice and current Bermuda proceeding.',
  statusAssertion: 'The Bittrex trading venues are closed, while separate legal and recovery processes continue.',
  outcomeSourceKeys: ['sec-settlement', 'ofac', 'bermuda-ruling'],
  outcomeEvidenceLocator: 'Regulatory settlements and liquidation record.',
  outcomeAssertion: 'Bittrex closed through a staged U.S. and international wind-down amid regulatory and business pressure.',
  sections: {
    what_it_is: section(
      '“Bittrex” now describes several closed businesses and recovery tracks, not one live exchange. Bittrex Inc. operated the U.S. venue. Bittrex Global GmbH served international customers through Liechtenstein, while Bittrex Global (Bermuda) Ltd entered a separate Bermuda liquidation. They are separate legal entities, so one settlement, balance or recovery process must not be assigned automatically to the others.',
      [
        ['Bittrex Inc. and Bittrex Global GmbH were separately named exchange entities in the SEC case.', ['sec-charge', 'sec-settlement'], 'SEC entity and platform descriptions.'],
        ['Bittrex Global (Bermuda) Ltd follows its own Bermuda liquidation and court process.', ['bermuda-appeal', 'bermuda-ruling'], 'Bermuda judgments and entity naming.'],
      ],
    ),
    what_happened: section(
      'Bittrex Inc. stopped U.S. trading in April 2023 and entered bankruptcy in May. Bittrex Global later stopped international trading in December 2023. Earlier, Bittrex Inc. agreed to a $24.28 million OFAC sanctions settlement in 2022, and Bittrex Inc. plus Bittrex Global GmbH reached a $24 million SEC settlement in 2023. These are separate remedies with different legal scopes, not one $48 million fine against every Bittrex entity.',
      [
        ['The U.S. and international venues closed on different timetables and through different entities.', ['sec-settlement', 'customer'], 'SEC and customer-facing closure records.'],
        ['The OFAC and SEC settlements had distinct amounts, entities and legal issues.', ['ofac', 'sec-settlement'], 'Regulator settlement announcements.'],
      ],
    ),
    why_this_outcome: section(
      'The evidence supports a combined regulatory-and-business wind-down, not one proven insolvency story for the whole brand. U.S. sanctions and securities cases raised compliance cost and legal risk. Management then closed the U.S. venue and later the international exchange. Bermuda court records concern liquidation governance and creditor treatment; they do not show the trading venue has revived.',
      [
        ['Bittrex faced separate sanctions-compliance and securities-regulation actions before closure.', ['ofac', 'sec-charge', 'sec-settlement'], 'Regulator findings and settlements.'],
        ['Current Bermuda litigation concerns liquidation administration rather than exchange operation.', ['bermuda-appeal', 'bermuda-ruling'], 'Court proceeding and orders.'],
      ],
    ),
    strategic_choices: section(
      'Bittrex built a broad-token custodial exchange and served U.S. customers through Bittrex Inc. Its controls did not prevent the sanctions violations described by OFAC, and the SEC alleged the companies coordinated with issuers to remove problematic public statements before listings. Rather than continue the U.S. fight, Bittrex exited U.S. trading and settled without admitting or denying the SEC allegations, then wound down the international venue.',
      [
        ['OFAC documented sanctions-screening failures at Bittrex Inc.', ['ofac'], 'OFAC enforcement announcement.'],
        ['The SEC settlement resolved exchange and listing allegations without admission or denial.', ['sec-settlement', 'sec-charge'], 'SEC charge and settlement terms.'],
      ],
    ),
    operating_model: section(
      'The venues used a conventional custodial exchange model: customer assets and orders depended on centralized accounts, wallets and compliance systems. Once trading stopped, customers moved into withdrawal, bankruptcy or liquidation workflows controlled by the relevant legal entity and court. A customer claim against one Bittrex company is not automatically a claim against another.',
      [
        ['Bittrex operated custodial trading platforms through distinct U.S. and international entities.', ['sec-charge', 'customer'], 'Regulator entity description and customer notice.'],
        ['Post-closure customer rights depend on the specific entity and legal process.', ['customer', 'bermuda-ruling'], 'Bermuda customer and court materials.'],
      ],
    ),
    token_and_value_capture: section(
      'Bittrex did not launch a Bittrex venue token. The businesses captured value through exchange fees and corporate ownership rather than a token that shared revenue or governed the venue. That avoids an exchange-token reflexivity problem like FTT, but it did not solve regulatory cost, compliance controls or the loss of a durable competitive position.',
      [
        ['The reviewed Bittrex sources do not identify a Bittrex exchange token.', ['sec-charge', 'sec-settlement'], 'Business and charged-product descriptions.', 'context_only'],
        ['Regulatory and operating outcomes were tied to the companies and controls, not a venue-token mechanism.', ['ofac', 'sec-settlement'], 'Enforcement scope and settlement terms.'],
      ],
    ),
    counterfactual: section(
      'Stronger sanctions screening, clearer listing governance and earlier regulatory investment could have reduced the enforcement burden. A sharper product advantage or larger institutional franchise might have made that compliance investment economically worthwhile. The record does not establish that either change would have kept every Bittrex entity open, and token launch would not have corrected the documented control failures.',
      [
        ['Better sanctions and listing controls address failures described by OFAC and the SEC.', ['ofac', 'sec-charge'], 'Enforcement findings and allegations.'],
        ['Whether stronger economics would have prevented closure remains unproven.', ['sec-settlement', 'bermuda-ruling'], 'Settlement and later liquidation record.', 'context_only'],
      ],
    ),
    risks_and_unknowns: section(
      'Former customers must identify the entity that held their account, the governing court and the applicable deadline. Bermuda and Liechtenstein proceedings should not be merged, and a Bermuda ruling about liquidators or shareholders is not a universal customer-recovery percentage. The reviewed sources do not provide one current, verified recovery rate for all Bittrex users or a single audited group balance sheet.',
      [
        ['Customer recovery depends on the specific Bittrex entity and proceeding.', ['customer', 'bermuda-appeal'], 'Customer guidance and appellate judgment.'],
        ['No universal recovery percentage can be inferred from the Bermuda court record.', ['bermuda-appeal', 'bermuda-ruling'], 'Entity-specific liquidation litigation.', 'context_only'],
      ],
    ),
    lifecycle: section(
      'Bittrex moved from a long-running U.S. altcoin exchange to a staged closure. The U.S. venue ceased trading and entered bankruptcy in 2023; the international venue stopped trading later that year. In 2026, Bermuda appellate litigation remained active around the liquidation of Bittrex Global (Bermuda) Ltd. That continuing court activity is recovery administration, not proof of renewed exchange operations.',
      [
        ['The Bittrex brand’s trading operations ended through staged U.S. and international closures.', ['sec-settlement', 'customer'], 'Regulatory and customer closure records.'],
        ['Bermuda appellate litigation continued in 2026 for the named Bermuda company.', ['bermuda-appeal'], '2026 Court of Appeal judgment.'],
      ],
    ),
    outlook_and_watch: section(
      'The exchange outlook is closed; the remaining work is legal and creditor administration. Watch entity-specific court orders, distribution notices, claim deadlines, undistributed balances and final dissolution. Any future business using the Bittrex name should be treated as a new legal and operating claim until ownership, licences, customer assets and management are verified.',
      [
        ['Current evidence supports closed trading venues with continuing recovery administration.', ['customer', 'bermuda-appeal'], 'Customer notice and 2026 court process.'],
        ['A future use of the Bittrex name would require fresh entity and licence verification.', ['sec-settlement', 'bermuda-ruling'], 'Existing entity and legal-process boundaries.', 'context_only'],
      ],
    ),
  },
  metrics: [
    {
      key: 'ofac-settlement', dimension: 'regulatory_fines', label: '2022 OFAC settlement by Bittrex Inc.', value: 24280829.2,
      unit: 'USD', currency: 'USD', asOf: '2022-10-11', window: 'One-time OFAC settlement by Bittrex Inc.', method: 'Regulator settlement announcement.',
      scope: { product: 'Bittrex Inc. sanctions compliance', jurisdictions: ['United States'] }, sourceKeys: ['ofac'],
      evidenceLocator: 'OFAC settlement amount and entity.', assertion: 'Bittrex Inc. agreed to pay $24,280,829.20 to settle OFAC sanctions-related liability.',
      qualityFlags: ['regulator_settlement', 'entity_specific'],
    },
    {
      key: 'sec-settlement', dimension: 'regulatory_fines', label: '2023 SEC settlement by Bittrex Inc. and Bittrex Global GmbH', value: 24000000,
      unit: 'USD', currency: 'USD', asOf: '2023-08-10', window: 'Joint and several settlement amount in the 2023 SEC case.', method: 'Regulator settlement announcement.',
      scope: { product: 'U.S. securities enforcement case', jurisdictions: ['United States'] }, sourceKeys: ['sec-settlement'],
      evidenceLocator: 'SEC settlement amount and entity scope.', assertion: 'Bittrex Inc. and Bittrex Global GmbH agreed to a $24 million SEC settlement.',
      qualityFlags: ['regulator_settlement', 'entity_specific', 'not_added_to_ofac_metric'],
    },
  ],
  events: [
    { key: 'ofac-settlement', type: 'regulatory_settlement', date: '2022-10-11', description: 'Bittrex Inc. agreed to pay $24.28 million to settle OFAC sanctions-related liability.', sourceKeys: ['ofac'], evidenceLocator: 'OFAC announcement.', assertion: 'Bittrex Inc. entered the OFAC settlement in October 2022.' },
    { key: 'us-closure', type: 'venue_closure', date: '2023-04-30', description: 'Bittrex Inc. ceased U.S. trading before entering Chapter 11 proceedings.', sourceKeys: ['sec-settlement'], evidenceLocator: 'SEC settlement chronology.', assertion: 'Bittrex ended U.S. trading in April 2023.' },
    { key: 'sec-settlement', type: 'regulatory_settlement', date: '2023-08-10', description: 'Bittrex Inc. and Bittrex Global GmbH agreed to a $24 million SEC settlement without admitting or denying the allegations.', sourceKeys: ['sec-settlement'], evidenceLocator: 'SEC settlement announcement.', assertion: 'The two named Bittrex entities settled the SEC case in August 2023.' },
    { key: 'global-closure', type: 'venue_closure', date: '2023-12-04', description: 'Bittrex Global stopped trading and moved customers into withdrawal and liquidation processes.', sourceKeys: ['customer'], evidenceLocator: 'Bittrex Global customer notice.', assertion: 'Bittrex Global stopped trading in December 2023.' },
    { key: 'bermuda-appeal', type: 'liquidation_litigation', date: '2026-03-01', description: 'A Bermuda Court of Appeal judgment addressed the liquidation of Bittrex Global (Bermuda) Ltd.', sourceKeys: ['bermuda-appeal'], evidenceLocator: '2026 appellate judgment.', assertion: 'Bermuda appellate litigation remained active in 2026 for the named Bermuda entity.' },
  ],
  unsourcedFields: ['Universal customer recovery percentage', 'Consolidated audited group balance sheet', 'Final dissolution dates for every entity', 'Final Liechtenstein distributions'],
  methodologyNotes: ['Bittrex Inc., Bittrex Global GmbH and Bittrex Global (Bermuda) Ltd are modeled as separate legal and recovery boundaries.', 'OFAC and SEC settlement amounts are not summed into a fictional group-wide fine.'],
});

export const document = {
  schema: 'chaindump-cex-wave-c-v1',
  as_of: AS_OF_DATE,
  generated_migration: '0084_cex_wave_c_profiles.sql',
  cases: [
    {
      table: 'successful_exchanges', slug: 'coinbase', canonical_profile: coinbase,
      legacy: {
        lifecycle: 'successful', status: 'successful_established', metric_label: 'Assets on Platform at 2025 year-end',
        metric_type: 'customer_assets', metric_unit: 'USD', metric: 376000000000,
        why_successful: 'Coinbase combined a large U.S. retail funnel with custody, institutional execution, stablecoin services and public-company access to capital. Its breadth improves resilience, while trading cycles and product-level regulation still shape results.',
        outlook: 'Established but cycle-sensitive. Watch users, assets, spot and derivatives separately, transaction versus subscription revenue, product permissions and operating margin.',
      },
    },
    {
      table: 'successful_exchanges', slug: 'kraken', canonical_profile: kraken,
      legacy: {
        lifecycle: 'successful', status: 'successful_diversifying', metric_label: 'Company-reported platform assets at 2025 year-end',
        metric_type: 'customer_assets', metric_unit: 'USD', metric: 48200000000,
        why_successful: 'Kraken combined a security-focused trading brand with professional products and a widening regulatory footprint, then diversified through tokenized equities, derivatives and acquisitions.',
        outlook: 'Established and diversifying. Watch funded accounts, assets, product-level retention, proof-of-reserves coverage, licences and acquisition economics.',
      },
    },
    {
      table: 'dead_exchanges', slug: 'bitmex', canonical_profile: bitmex,
      legacy: {
        lifecycle: 'dead', verdict: 'wind_down_announced', metric_label: 'Scheduled exchange closure', metric_type: 'operational_status', metric_unit: 'status',
        current_metric: null,
        why: 'BitMEX announced a whole-exchange wind-down after a strategic review. It has not disclosed a more specific cause; competition, regulation, insolvency, security and BMEX performance are not established closure causes.',
        outlook: 'Still operating as of August 3, 2026. Reduce-only begins August 26, closure is scheduled for September 23 at 04:00 UTC, and login, history and withdrawals remain after closure.',
      },
    },
    {
      table: 'dead_exchanges', slug: 'ftx', canonical_profile: ftx,
      legacy: {
        lifecycle: 'dead', verdict: 'closed_bankruptcy_recovery', metric_label: 'Classes 6A and 6B cumulative petition-date dollar recovery',
        metric_type: 'creditor_recovery', metric_unit: 'percent', current_metric: 103,
        why: 'FTX collapsed because customer assets were misused through hidden Alameda privileges and concentrated, deceptive control. Falling FTT and withdrawals exposed and amplified the failure; they did not create the underlying misconduct.',
        outlook: 'Closed. Track completed, class-specific distributions across the U.S. and Bahamas processes; do not equate petition-date dollar recovery with return of original crypto or universal repayment.',
      },
    },
    {
      table: 'dead_exchanges', slug: 'bittrex', canonical_profile: bittrex,
      legacy: {
        lifecycle: 'dead', verdict: 'closed_recovery_processes', metric_label: '2023 SEC settlement', metric_type: 'regulatory_fines', metric_unit: 'USD', current_metric: 24000000,
        why: 'Bittrex closed through a staged U.S. and international wind-down amid sanctions and securities enforcement, compliance cost and business pressure. The separate legal entities and recovery tracks must not be treated as one bankruptcy.',
        outlook: 'Trading venues are closed. Track entity-specific court orders, withdrawals, distributions and dissolution in the United States, Liechtenstein and Bermuda.',
      },
    },
  ],
};

export function renderMigration(value = document) {
  const sqlText = (entry) => `'${String(entry).replaceAll("'", "''")}'`;
  const sqlJson = (entry) => `'${JSON.stringify(entry).replaceAll("'", "''")}'`;
  const stagedRows = value.cases.map((entry) => `INSERT INTO _cex_wave_c_0084 (target_table, slug, legacy, canonical_profile)
VALUES (${sqlText(entry.table)}, ${sqlText(entry.slug)}, ${sqlJson(entry.legacy)}, ${sqlJson(entry.canonical_profile)});`).join('\n\n');

  return `-- Five current, source-linked CEX profiles assembled 2026-08-03.
-- Every claim remains pending human review. Existing legacy profile fields and source arrays are preserved.

DROP TABLE IF EXISTS _cex_wave_c_0084;

CREATE TABLE _cex_wave_c_0084 (
  target_table TEXT NOT NULL,
  slug TEXT NOT NULL,
  legacy TEXT NOT NULL CHECK (json_valid(legacy)),
  canonical_profile TEXT NOT NULL CHECK (json_valid(canonical_profile)),
  PRIMARY KEY (target_table, slug)
);

-- canonical-payload-start
${stagedRows}
-- canonical-payload-end

UPDATE successful_exchanges AS exchange_row
SET
  status = json_extract(staged.legacy, '$.status'),
  metric_label = json_extract(staged.legacy, '$.metric_label'),
  metric_type = json_extract(staged.legacy, '$.metric_type'),
  metric_unit = json_extract(staged.legacy, '$.metric_unit'),
  metric = json_extract(staged.legacy, '$.metric'),
  why_successful = json_extract(staged.legacy, '$.why_successful'),
  outlook = json_extract(staged.legacy, '$.outlook'),
  profile = json_set(
    COALESCE(NULLIF(exchange_row.profile, ''), '{}'),
    '$.canonical_profile', json(staged.canonical_profile)
  ),
  updated_at = '${AS_OF_DATE}'
FROM _cex_wave_c_0084 AS staged
WHERE staged.target_table = 'successful_exchanges'
  AND exchange_row.type = 'cex'
  AND exchange_row.slug = staged.slug;

UPDATE dead_exchanges AS exchange_row
SET
  verdict = json_extract(staged.legacy, '$.verdict'),
  metric_label = json_extract(staged.legacy, '$.metric_label'),
  metric_type = json_extract(staged.legacy, '$.metric_type'),
  metric_unit = json_extract(staged.legacy, '$.metric_unit'),
  current_metric = json_extract(staged.legacy, '$.current_metric'),
  why = json_extract(staged.legacy, '$.why'),
  outlook = json_extract(staged.legacy, '$.outlook'),
  profile = json_set(
    COALESCE(NULLIF(exchange_row.profile, ''), '{}'),
    '$.canonical_profile', json(staged.canonical_profile)
  ),
  updated_at = '${AS_OF_DATE}'
FROM _cex_wave_c_0084 AS staged
WHERE staged.target_table = 'dead_exchanges'
  AND exchange_row.kind = 'cex'
  AND exchange_row.slug = staged.slug;

UPDATE exchange_case_features AS feature
SET
  lifecycle_evidence_date = '${AS_OF_DATE}',
  last_verified_at = '${AS_OF_DATE}',
  next_review_at = '2026-08-10',
  freshness_status = 'current',
  updated_at = '${AS_OF_DATE}'
FROM _cex_wave_c_0084 AS staged
WHERE feature.kind = 'cex'
  AND feature.slug = staged.slug
  AND feature.lifecycle = json_extract(staged.legacy, '$.lifecycle');

DROP TABLE IF EXISTS _cex_wave_c_0084;
`;
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  writeFileSync(
    new URL('../docs/cex-wave-c-profiles-2026-08-03.json', import.meta.url),
    `${JSON.stringify(document, null, 2)}\n`,
  );
  writeFileSync(
    new URL('../migrations/0084_cex_wave_c_profiles.sql', import.meta.url),
    renderMigration(document),
  );
}

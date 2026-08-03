import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const ACCESSED_AT = '2026-08-03T17:13:33Z';
const NEXT_REVIEW_AT = '2026-08-10T17:13:33Z';
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
  source('source:polymarket:official', 'Polymarket', 'https://polymarket.com/', 'Adventure One QSS Inc.', null, 'B', 'primary'),
  source('source:polymarket:orderbook', 'Prices and order book', 'https://docs.polymarket.com/concepts/prices-orderbook', 'Polymarket', null, 'A', 'primary'),
  source('source:polymarket:trading', 'Trading overview', 'https://docs.polymarket.com/trading/overview', 'Polymarket', null, 'A', 'primary'),
  source('source:polymarket:resolution', 'Market resolution', 'https://docs.polymarket.com/concepts/resolution', 'Polymarket', null, 'A', 'primary'),
  source('source:polymarket:positions', 'Positions and outcome tokens', 'https://docs.polymarket.com/concepts/positions-tokens', 'Polymarket', null, 'A', 'primary'),
  source('source:polymarket:pusd', 'pUSD on Polygon', 'https://docs.polymarket.com/concepts/pusd', 'Polymarket', null, 'A', 'primary'),
  source('source:polymarket:fees', 'Trading fees', 'https://docs.polymarket.com/trading/fees', 'Polymarket', null, 'A', 'primary'),
  source('source:polymarket:liquidity-rewards', 'Liquidity rewards', 'https://docs.polymarket.com/programs/liquidity-rewards', 'Polymarket', null, 'A', 'primary'),
  source('source:polymarket:maker-rebates', 'Maker rebates', 'https://docs.polymarket.com/programs/maker-rebates', 'Polymarket', null, 'A', 'primary'),
  source('source:polymarket:changelog', 'Prediction-markets developer changelog', 'https://docs.polymarket.com/changelog/predictions', 'Polymarket', null, 'A', 'primary'),
  source('source:polymarket:cftc-order', 'CFTC orders event-based binary options market operator to pay $1.4 million penalty', 'https://www.cftc.gov/PressRoom/PressReleases/8478-22', 'U.S. Commodity Futures Trading Commission', '2022-01-03', 'A', 'primary'),
  source('source:polymarket:cftc-qcx', 'QCX LLC d/b/a Polymarket US designation record', 'https://www.cftc.gov/IndustryOversight/IndustryFilings/TradingOrganizations/49571', 'U.S. Commodity Futures Trading Commission', '2025-07-09', 'A', 'primary'),
  source('source:polymarket:ap-category', 'Polymarket is in a high-stakes race to win back trust as it recommits to the US market', 'https://apnews.com/article/polymarket-kalshi-prediction-markets-cftc-774de0d21eba8bf380a68a3ca01f6aaa', 'Associated Press', '2026-07-08', 'A', 'independent'),
  source('source:polymarket:ap-integrity', "Newly created Polymarket accounts bet big on US-Iran ceasefire in hours before Trump's announcement", 'https://apnews.com/article/polymarket-iran-trump-ceasefire-prediction-markets-350d9fe5ffefa74080ff5dd973aef48b', 'Associated Press', '2026-04-08', 'A', 'independent'),
  source('source:polymarket:llama-volume', 'Polymarket Polygon trading-volume API', 'https://api.llama.fi/summary/dexs/polymarket?dataType=dailyVolume', 'DefiLlama', null, 'B', 'aggregator'),
  source('source:polymarket:llama-tvl', 'Polymarket Polygon protocol and collateral API', 'https://api.llama.fi/protocol/polymarket', 'DefiLlama', null, 'B', 'aggregator'),
  source('source:polymarket:llama-fees', 'Polymarket Polygon fee API', 'https://api.llama.fi/summary/fees/polymarket?dataType=dailyFees', 'DefiLlama', null, 'B', 'aggregator'),
  source('source:polymarket:llama-revenue', 'Polymarket Polygon revenue-estimate API', 'https://api.llama.fi/summary/fees/polymarket?dataType=dailyRevenue', 'DefiLlama', null, 'B', 'aggregator'),
];

const sections = {
  what_it_is: {
    body: 'Polymarket International is a peer-to-peer prediction market operated by Adventure One QSS Inc. outside the United States. A market asks a question with defined outcomes. Traders buy and sell outcome tokens through an order book, usually at prices between $0 and $1; a correct token can be redeemed for $1 after resolution and an incorrect token for $0. The price is therefore a market price, not a poll result or a promise that the event has that exact probability. The international product is legally and technically separate from QCX LLC’s CFTC-regulated Polymarket US venue. This report does not transfer the US venue’s regulatory status to the international platform.',
    source_ids: ['source:polymarket:official', 'source:polymarket:orderbook', 'source:polymarket:trading', 'source:polymarket:positions', 'source:polymarket:cftc-qcx', 'source:polymarket:ap-category'],
    evidence_locator: 'Current international footer, product documentation, CFTC venue record and independent reporting on the separated products.',
  },
  what_happened: {
    body: 'Polymarket began offering event markets in 2020 and attracted enough activity to become a material prediction-market venue. The regulatory model broke in the United States: on 2022-01-03 the CFTC said Blockratize, Inc. had offered more than 900 event markets without designation or registration, imposed a $1.4 million penalty and required noncompliant markets to be wound down. The international on-chain product continued. A separate company, QCX LLC, received designated contract market status on 2025-07-09 and later became the US route; that did not make the international venue CFTC-regulated. The international platform then upgraded its CLOB and pUSD system and introduced Fee Structure V2 on 2026-03-30. DefiLlama’s Polygon-only snapshot retrieved on 2026-08-03 reported about $80.9 million of 24-hour trading volume, $3.31 billion over 30 days and $328.7 million of tracked collateral. Those figures show substantial activity, but not unique users, profit or executable depth.',
    source_ids: ['source:polymarket:cftc-order', 'source:polymarket:cftc-qcx', 'source:polymarket:ap-category', 'source:polymarket:changelog', 'source:polymarket:llama-volume', 'source:polymarket:llama-tvl'],
    evidence_locator: 'Dated CFTC enforcement and venue-designation records, product changelog, independent reporting and Polygon-only API observations.',
  },
  why_this_outcome: {
    body: 'Polymarket’s strongest advantage is that it turns news questions into a product people can trade, compare and share. Broad market selection gives traders repeated reasons to return, while a visible order book and APIs let professional market makers add prices and liquidity. Polygon settlement lowers the cost of moving positions, and a common collateral asset lets capital move across markets. These features can reinforce one another: more questions attract more traders; more traders attract market makers; tighter markets make prices more useful; useful prices attract more attention. The current volume and collateral observations are consistent with that flywheel operating at scale. They do not prove that each design choice caused growth, that every market is liquid, or that the operator is profitable. Rebates and liquidity rewards also mean some observed activity may be subsidized rather than wholly organic.',
    source_ids: ['source:polymarket:orderbook', 'source:polymarket:trading', 'source:polymarket:pusd', 'source:polymarket:liquidity-rewards', 'source:polymarket:maker-rebates', 'source:polymarket:llama-volume', 'source:polymarket:llama-tvl', 'source:polymarket:ap-category'],
    evidence_locator: 'Documented market mechanics and incentives compared with current independent activity and collateral observations.',
    note: 'Causal interpretation only; the evidence does not isolate the effect of each design choice.',
  },
  strategic_choices: {
    body: 'The operator chose an exchange model instead of taking the other side of every bet. Traders set prices and the matching engine pairs signed orders, which limits direct house exposure but makes liquidity and market quality central operating problems. It chose off-chain matching with on-chain Polygon settlement rather than a fully on-chain order book, improving speed and cost while leaving availability and order matching dependent on operator infrastructure. It chose UMA’s optimistic oracle and a proposal-dispute process for resolution, making rules and dispute incentives part of the product. After the 2022 CFTC order, it maintained a separated international product and later used a separately regulated US entity rather than treating one legal status as globally portable. Finally, it introduced market-dependent taker fees, maker rebates and liquidity rewards. That can improve quoted depth, but it can also obscure how much trading would remain without incentives.',
    source_ids: ['source:polymarket:trading', 'source:polymarket:resolution', 'source:polymarket:fees', 'source:polymarket:liquidity-rewards', 'source:polymarket:maker-rebates', 'source:polymarket:cftc-order', 'source:polymarket:cftc-qcx', 'source:polymarket:official', 'source:polymarket:ap-category'],
    evidence_locator: 'Current architecture, resolution, fee and incentive documentation plus the dated enforcement and separate-US-venue record.',
    note: 'The trade-offs are analyst interpretation of documented choices; no source quantifies every alternative.',
  },
  operating_model: {
    body: 'A trader funds a Polygon wallet with pUSD, an ERC-20 asset backed by USDC in the documented system. The trader signs an order off-chain; Polymarket’s CLOB matches compatible orders, while settlement happens through smart contracts. A complete collateral pair can be split into Yes and No ERC-1155 outcome tokens, or recombined. After the market’s written rules determine the answer, UMA’s optimistic oracle accepts a proposal unless it is disputed; a dispute can escalate through the documented process. Winning tokens redeem for $1 and losing tokens for $0. Polymarket curates questions, writes market rules, operates the matching and interface layers and administers incentives. Users retain on-chain positions, but they still depend on the operator for market creation, the API, matching availability and the public interface, and on external contracts and oracle participants for settlement.',
    source_ids: ['source:polymarket:trading', 'source:polymarket:positions', 'source:polymarket:pusd', 'source:polymarket:resolution', 'source:polymarket:orderbook'],
    evidence_locator: 'Current signed-order, collateral, outcome-token, resolution and redemption documentation.',
  },
  token_and_value_capture: {
    body: 'The reviewed official record does not establish a fungible Polymarket platform token, token-holder governance right, revenue share or equity claim. Outcome tokens are temporary market positions: their value depends on a particular event’s resolution, and they are not ownership in the platform. pUSD is documented as a collateral and settlement asset backed by USDC, not a share of the business. The platform charges taker fees on fee-enabled markets, leaves some market categories fee-free, and sends part of collected fees back to eligible makers through rebates; it also pays separate liquidity rewards. DefiLlama estimated about $1.17 million of Polygon fees and $604,787 of Polygon protocol revenue over the latest 24 hours, and about $41.6 million of fees and $20.5 million of revenue over 30 days. These are independent methodology-based estimates, not audited operator revenue, net income, cash, liabilities or owner distributions.',
    source_ids: ['source:polymarket:positions', 'source:polymarket:pusd', 'source:polymarket:fees', 'source:polymarket:maker-rebates', 'source:polymarket:liquidity-rewards', 'source:polymarket:llama-fees', 'source:polymarket:llama-revenue'],
    evidence_locator: 'Current token/collateral and fee documentation plus Polygon-only independent fee and revenue estimates.',
  },
  counterfactual: {
    body: 'Ignoring the 2022 CFTC order or continuing to serve the same US market without a compliant route could have prevented the later US re-entry and increased enforcement risk. A fully on-chain matching engine could reduce operator control over order matching, but would probably trade away some speed, cost and order-management flexibility. A house-banked model could guarantee a counterparty for selected bets, but it would put event exposure on the operator’s balance sheet and make reserves and solvency more central. Lower maker subsidies would make organic liquidity easier to measure, while likely widening spreads in newer markets. Clearer public reporting of international unique traders, executable depth, rebates, operating costs and audited revenue would reduce uncertainty without changing the product. These alternatives are analytical controls, not estimates of what volume, profit or regulatory outcomes would have been.',
    source_ids: ['source:polymarket:cftc-order', 'source:polymarket:cftc-qcx', 'source:polymarket:trading', 'source:polymarket:liquidity-rewards', 'source:polymarket:maker-rebates', 'source:polymarket:llama-volume', 'source:polymarket:llama-revenue'],
    evidence_locator: 'Observed enforcement, current architecture and incentive design used to bound plausible alternatives.',
    note: 'Counterfactual analysis only; no causal estimate is available.',
  },
  risks_and_unknowns: {
    body: 'The biggest product risk is resolution: ambiguous wording, late information or a disputed oracle result can make a trade behave differently from a user’s intuition. The matching engine and interface are off-chain dependencies even though positions settle on Polygon, while smart contracts, pUSD backing, USDC, Polygon and UMA introduce separate technical and dependency risks. Regulation remains jurisdiction-specific; the CFTC designation belongs to QCX LLC’s US venue and must not be presented as a licence for Adventure One QSS Inc.’s international platform. Market integrity is another open problem. Associated Press reporting described well-timed wallets and a disputed market, but a public wallet is not proof of a person’s identity or unlawful conduct. Volume can count repeated trading, addresses are not people, collateral is not executable order-book depth, and incentives can rent activity. The reviewed sources do not provide audited international financials, customer-liability coverage, unique-user retention, complete geographic availability, market-level spread history, subsidy-adjusted revenue or a consolidated relationship between the international and US economics.',
    source_ids: ['source:polymarket:resolution', 'source:polymarket:trading', 'source:polymarket:pusd', 'source:polymarket:official', 'source:polymarket:cftc-qcx', 'source:polymarket:cftc-order', 'source:polymarket:ap-integrity', 'source:polymarket:llama-volume', 'source:polymarket:llama-tvl', 'source:polymarket:liquidity-rewards'],
    evidence_locator: 'Current resolution and architecture dependencies, legal separation, independent integrity reporting and metric-methodology boundaries.',
  },
  lifecycle: {
    body: 'The international product launched in 2020. On 2022-01-03, the CFTC imposed a $1.4 million civil monetary penalty and required noncompliant US-facing markets to be wound down; that was a regulatory reset, not the end of the international product. On 2025-07-09, the CFTC record shows QCX LLC as a designated contract market, creating a separate regulated US path. Independent reporting says the US product began operating at the end of 2025 and is walled off from the international crypto platform. On 2026-03-30, Polymarket documented a CLOB upgrade and Fee Structure V2. In April 2026, independent reporting highlighted integrity and resolution questions around a current-event market. By the 2026-08-03 review, the international site remained active and Polygon-only DefiLlama feeds showed large current volume and collateral. The lifecycle call is therefore established and operating, with legal separation, resolution quality and incentive-adjusted liquidity still requiring continuous review.',
    source_ids: ['source:polymarket:cftc-order', 'source:polymarket:cftc-qcx', 'source:polymarket:ap-category', 'source:polymarket:changelog', 'source:polymarket:ap-integrity', 'source:polymarket:official', 'source:polymarket:llama-volume', 'source:polymarket:llama-tvl'],
    evidence_locator: 'Dated enforcement, designation, product-change and integrity records followed by a current operating and metric observation.',
  },
  outlook_and_watch: {
    body: 'The base case is continued international category leadership supported by broad market selection, current liquidity and a product that turns breaking news into repeat trading. The upside case requires durable volume after rebates and liquidity rewards, more useful market depth and fewer disputed or confusing resolutions; rising fee generation would matter more if it is accompanied by transparent costs. The downside case is a loss of trust after a material resolution failure, integrity controversy, outage, collateral problem or new jurisdictional restriction. Watch Polygon trading volume over 30 and 90 days, tracked collateral, market-level spreads and executable depth, fee revenue alongside rebates and rewards, repeated traders rather than wallet counts, resolution disputes and time to finality, API or matching outages, pUSD and USDC backing, geofencing changes and separate disclosures from the international operator and QCX LLC. Do not treat a US regulatory milestone, one high-volume event or an address cluster as proof about the international business as a whole.',
    source_ids: ['source:polymarket:orderbook', 'source:polymarket:resolution', 'source:polymarket:fees', 'source:polymarket:liquidity-rewards', 'source:polymarket:maker-rebates', 'source:polymarket:official', 'source:polymarket:cftc-qcx', 'source:polymarket:ap-integrity', 'source:polymarket:llama-volume', 'source:polymarket:llama-tvl', 'source:polymarket:llama-revenue'],
    evidence_locator: 'Current activity, product dependencies, incentive structure, legal separation and integrity record defining measurable future signals.',
    note: 'Scenario analysis and watch list, not a trading, legal or revenue forecast.',
  },
};

const metricSpecs = [
  { key: 'volume-24h', dimension: 'wagers', label: 'Polygon trading volume, rolling 24 hours', value: 80892377, unit: 'usd', currency: 'USD', definition: 'rolling_24h', source_ids: ['source:polymarket:llama-volume'], locator: 'DefiLlama total24h field retrieved 2026-08-03T17:13:33Z.', flags: ['trading_volume_not_operator_revenue', 'repeated_trades_count', 'not_unique_users'] },
  { key: 'volume-30d', dimension: 'wagers', label: 'Polygon trading volume, rolling 30 days', value: 3312013309, unit: 'usd', currency: 'USD', definition: 'rolling_30d', source_ids: ['source:polymarket:llama-volume'], locator: 'DefiLlama total30d field retrieved 2026-08-03T17:13:33Z.', flags: ['trading_volume_not_operator_revenue', 'repeated_trades_count', 'not_unique_users'] },
  { key: 'collateral', dimension: 'liquidity', label: 'Polygon tracked collateral', value: 328654492, unit: 'usd', currency: 'USD', definition: 'point_in_time', source_ids: ['source:polymarket:llama-tvl'], locator: 'DefiLlama currentChainTvls.Polygon and latest TVL observation.', flags: ['tracked_collateral_not_executable_depth', 'aggregator_methodology'] },
  { key: 'fees-24h', dimension: 'fees', label: 'Estimated Polygon fees, rolling 24 hours', value: 1167175, unit: 'usd', currency: 'USD', definition: 'rolling_24h', source_ids: ['source:polymarket:llama-fees'], locator: 'DefiLlama total24h fee field retrieved 2026-08-03T17:13:33Z.', flags: ['independent_estimate', 'not_audited_financials'] },
  { key: 'fees-30d', dimension: 'fees', label: 'Estimated Polygon fees, rolling 30 days', value: 41621441, unit: 'usd', currency: 'USD', definition: 'rolling_30d', source_ids: ['source:polymarket:llama-fees'], locator: 'DefiLlama total30d fee field retrieved 2026-08-03T17:13:33Z.', flags: ['independent_estimate', 'not_audited_financials'] },
  { key: 'revenue-24h', dimension: 'protocol_revenue', label: 'Estimated Polygon protocol revenue, rolling 24 hours', value: 604787, unit: 'usd', currency: 'USD', definition: 'rolling_24h', source_ids: ['source:polymarket:llama-revenue'], locator: 'DefiLlama total24h revenue field retrieved 2026-08-03T17:13:33Z.', flags: ['independent_estimate', 'methodology_not_operator_audited', 'not_profit'] },
  { key: 'revenue-30d', dimension: 'protocol_revenue', label: 'Estimated Polygon protocol revenue, rolling 30 days', value: 20472100, unit: 'usd', currency: 'USD', definition: 'rolling_30d', source_ids: ['source:polymarket:llama-revenue'], locator: 'DefiLlama total30d revenue field retrieved 2026-08-03T17:13:33Z.', flags: ['independent_estimate', 'methodology_not_operator_audited', 'not_profit'] },
];

const eventSpecs = [
  { key: 'cftc-order', type: 'enforcement', date: '2022-01-03', description: 'The CFTC imposed a $1.4 million penalty and required Blockratize, Inc. to wind down noncompliant event markets.', source_ids: ['source:polymarket:cftc-order'], locator: 'CFTC enforcement release and order summary.' },
  { key: 'us-designation', type: 'licence', date: '2025-07-09', description: 'QCX LLC, the legally separate Polymarket US venue, appears as a designated contract market in the CFTC record.', source_ids: ['source:polymarket:cftc-qcx', 'source:polymarket:official'], locator: 'CFTC DCM record and current international legal-separation notice.' },
  { key: 'fee-v2', type: 'product_update', date: '2026-03-30', description: 'Polymarket documented its CLOB upgrade, pUSD system and Fee Structure V2.', source_ids: ['source:polymarket:changelog', 'source:polymarket:pusd', 'source:polymarket:fees'], locator: 'Polymarket changelog and current fee/collateral documentation.' },
  { key: 'integrity-observation', type: 'market_integrity', date: '2026-04-08', description: 'Independent reporting described well-timed wallets and a disputed current-event market; wallet observations did not establish a person’s identity or unlawful conduct.', source_ids: ['source:polymarket:ap-integrity'], locator: 'Associated Press reporting and its stated identity limits.' },
  { key: 'current-snapshot', type: 'market_observation', date: '2026-08-03', description: 'Polygon-only APIs reported about $80.9 million of 24-hour trading volume and $328.7 million of tracked collateral.', source_ids: ['source:polymarket:llama-volume', 'source:polymarket:llama-tvl'], locator: 'DefiLlama API responses retrieved 2026-08-03T17:13:33Z.' },
];

const metrics = metricSpecs.map((metric) => ({
  id: `metric:polymarket:${metric.key}:${AS_OF}`,
  dimension: metric.dimension,
  label: metric.label,
  value: metric.value,
  unit: metric.unit,
  currency: metric.currency,
  window: { start: null, end: ACCESSED_AT, definition: metric.definition },
  as_of: ACCESSED_AT,
  method: 'DefiLlama Polygon-only API aggregate',
  scope: { product: 'Polymarket International', chain: 'Polygon' },
  formula: null,
  raw_input_ids: [],
  claim_ids: [`claim:polymarket:metric:${metric.key}`],
  quality_flags: metric.flags,
}));

const events = eventSpecs.map((event) => ({
  id: `event:polymarket:${event.key}`,
  type: event.type,
  date: event.date,
  description: event.description,
  claim_ids: [`claim:polymarket:event:${event.key}`],
}));

export const profile = {
  schema: 'chaindump-entity-profile',
  version: 1,
  identity: { id: 'web3_casino:polymarket-international', type: 'web3_casino', slug: 'polymarket-international', name: 'Polymarket International', aliases: ['Polymarket'] },
  classification: { subtype: 'peer-to-peer prediction market', tags: ['prediction_market', 'order_book', 'hybrid_custody'], chains: ['Polygon'], jurisdictions: ['international_excluding_us'] },
  status: { operating_state: 'operating', as_of: AS_OF, claim_ids: ['claim:polymarket:status'] },
  outcome: { label: 'successful_established', as_of: AS_OF, rule_id: 'casino-lifecycle-evidence-v1', confidence: 'high', claim_ids: ['claim:polymarket:outcome'] },
  analysis: { sections: Object.fromEntries(Object.entries(sections).map(([key, section]) => [key, { body: section.body, as_of: AS_OF, claim_ids: [`claim:polymarket:section:${key}`] }])) },
  metrics,
  events,
  sources,
  claims: [
    pendingClaim('claim:polymarket:status', 'status.operating_state', ['source:polymarket:official', 'source:polymarket:llama-volume', 'source:polymarket:llama-tvl'], 'Current international product and current Polygon activity/collateral observations.'),
    pendingClaim('claim:polymarket:outcome', 'outcome.label', ['source:polymarket:cftc-order', 'source:polymarket:official', 'source:polymarket:llama-volume', 'source:polymarket:llama-tvl', 'source:polymarket:llama-fees'], 'Long operating record, survived regulatory reset and substantial current activity.', 'Analyst lifecycle classification, not a profitability or investment conclusion.'),
    ...Object.entries(sections).map(([key, section]) => pendingClaim(`claim:polymarket:section:${key}`, `analysis.sections.${key}.body`, section.source_ids, section.evidence_locator, section.note || null)),
    ...metricSpecs.map((metric) => pendingClaim(`claim:polymarket:metric:${metric.key}`, `metrics[metric:polymarket:${metric.key}:${AS_OF}].value`, metric.source_ids, metric.locator, `Limits: ${metric.flags.join(', ')}.`)),
    ...eventSpecs.map((event) => pendingClaim(`claim:polymarket:event:${event.key}`, `events[event:polymarket:${event.key}]`, event.source_ids, event.locator)),
  ],
  freshness: { state: 'current', last_reviewed_at: ACCESSED_AT, next_review_at: NEXT_REVIEW_AT, field_reviews: [] },
  quality: {
    publication_state: 'review',
    completeness_pct: 100,
    confidence: 'high',
    unsourced_fields: ['audited_international_financials', 'unique_trader_retention', 'market_level_executable_depth_history', 'total_rebates_and_rewards', 'complete_jurisdiction_availability', 'international_customer_liabilities'],
  },
  extensions: {
    legacy_origin: 'casino_syntheses.outlook',
    methodology_notes: [
      'freshness.last_reviewed_at records evidence retrieval and assembly, not human editorial approval; every claim remains pending.',
      'The CFTC designation belongs to QCX LLC and is not attributed to Adventure One QSS Inc. or the international product.',
      'Polygon trading volume is not operator revenue, unique users or capital at risk; tracked collateral is not executable order-book depth.',
      'DefiLlama fee and revenue values are independent estimates, not audited operator financial statements or profit.',
      'Wallet-level timing observations are not treated as proof of a natural person’s identity or unlawful conduct.',
    ],
  },
};

export const document = {
  schema: 'chaindump-research-profile-document',
  version: 1,
  researched_at: ACCESSED_AT,
  generated_migration: '0074_polymarket_casino_profile.sql',
  entity: { type: 'web3_casino', slug: 'polymarket-international', canonical_profile: profile },
};

export function renderMigration(value = document) {
  const payload = JSON.stringify(value, null, 2).replaceAll("'", "''");
  return `-- Polymarket International source-linked control profile, researched 2026-08-03 and awaiting human review.
-- The existing casino synthesis is preserved; canonical consumers read outlook.canonical_profile.

DROP TABLE IF EXISTS _polymarket_profile_0074;

CREATE TABLE _polymarket_profile_0074 (
  case_id TEXT PRIMARY KEY,
  canonical_profile TEXT NOT NULL CHECK (json_valid(canonical_profile))
);

-- canonical-payload-start
WITH research_document(payload) AS (
  VALUES ('${payload}')
)
INSERT INTO _polymarket_profile_0074 (case_id, canonical_profile)
SELECT
  json_extract(payload, '$.entity.slug'),
  json_extract(payload, '$.entity.canonical_profile')
FROM research_document;
-- canonical-payload-end

UPDATE casino_syntheses AS synthesis
SET outlook = json_set(
  COALESCE(synthesis.outlook, '{}'),
  '$.canonical_profile', json(staged.canonical_profile)
)
FROM _polymarket_profile_0074 AS staged
WHERE synthesis.case_id = staged.case_id;

DROP TABLE _polymarket_profile_0074;
`;
}

function writeOutputs() {
  const documentPath = fileURLToPath(new URL('../docs/polymarket-casino-profile-2026-08-03.json', import.meta.url));
  const migrationPath = fileURLToPath(new URL('../migrations/0074_polymarket_casino_profile.sql', import.meta.url));
  writeFileSync(documentPath, `${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(migrationPath, renderMigration());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) writeOutputs();

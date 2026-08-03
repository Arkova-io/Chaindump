#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYSIS_SECTION_KEYS, validateEntityProfile } from '../src/lib/entity-profile.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(root, 'docs/stablecoin-depth-wave-a-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0097_stablecoin_depth_wave_a.sql');
const AS_OF = '2026-08-03';
const ACCESSED_AT = '2026-08-03T21:20:00Z';
const NEXT_REVIEW_AT = '2026-08-10T21:20:00Z';
const MARKET_URL = 'https://stablecoins.llama.fi/stablecoins?includePrices=true';
const MAX_D1_STATEMENT_BYTES = 95_000;
const TARGET_TABLE = '_stablecoin_depth_wave_a_0097';

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

function section(body, sourceKeys, conclusion, conclusionKind = 'inference', locator = 'The cited records support the factual baseline; the conclusion is the analyst interpretation of that record.') {
  const firstSentence = body.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || body;
  return {
    body,
    claims: [
      { assertion: firstSentence, sources: sourceKeys, locator, kind: 'fact' },
      { assertion: conclusion, sources: sourceKeys, locator, kind: conclusionKind },
    ],
  };
}

function marketMetrics(slug, supply, price) {
  const deviation = Number(((price - 1) * 100).toFixed(4));
  return [
    {
      key: `circulating-supply-${AS_OF}`,
      dimension: 'circulating_supply',
      label: 'Circulating supply',
      value: supply,
      unit: 'usd',
      currency: 'USD',
      window: { start: null, end: AS_OF, definition: 'provider_snapshot' },
      asOf: AS_OF,
      method: 'DefiLlama peggedAssets circulating.peggedUSD field.',
      assertion: `DefiLlama reported ${supply} USD of circulating supply at the observation time.`,
      qualityFlags: ['aggregator_snapshot', 'multi_chain_sum', 'provider_can_revise'],
    },
    {
      key: `price-${AS_OF}`,
      dimension: 'price',
      label: 'Observed market price',
      value: price,
      unit: 'usd',
      currency: 'USD',
      window: { start: null, end: AS_OF, definition: 'provider_snapshot' },
      asOf: AS_OF,
      method: 'DefiLlama peggedAssets price field.',
      assertion: `DefiLlama reported a market price of ${price} USD at the observation time.`,
      qualityFlags: ['aggregator_snapshot', 'price_point_not_redemption_value', 'provider_can_revise'],
    },
    {
      key: `peg-deviation-${AS_OF}`,
      dimension: 'peg_deviation',
      label: 'Observed peg deviation',
      value: deviation,
      unit: 'percent',
      currency: null,
      window: { start: null, end: AS_OF, definition: 'price_minus_one_dollar' },
      asOf: AS_OF,
      method: 'Computed as (DefiLlama price - 1 USD) × 100.',
      assertion: `The observed market price was ${deviation}% away from one dollar.`,
      qualityFlags: ['computed_from_aggregator_snapshot', 'not_a_liquidity_measure', 'not_a_redemption_test'],
    },
  ];
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
        source_ids: item.sources.map((sourceKey) => sourceId(spec.slug, sourceKey)),
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
      source_ids: spec.statusSources.map((key) => sourceId(spec.slug, key)),
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
      source_ids: spec.outcomeSources.map((key) => sourceId(spec.slug, key)),
      evidence_locator: spec.outcomeLocator,
      support_direction: 'supports',
      note: 'Lifecycle classification, not a guarantee of redemption, solvency or future price.',
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    },
  );

  const metrics = marketMetrics(spec.slug, spec.market.supply, spec.market.price).map((item) => {
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
      note: 'Point-in-time market observation; this is not proof of reserve sufficiency or executable redemption.',
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
      headline: item.dimension === 'circulating_supply',
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
      source_ids: item.sources.map((key) => sourceId(spec.slug, key)),
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
    outcome: { label: spec.outcome, as_of: AS_OF, rule_id: 'stablecoin-lifecycle-evidence-v1', confidence: spec.outcomeConfidence, claim_ids: [outcomeClaimId] },
    analysis: { sections },
    metrics,
    events,
    sources: spec.sources,
    claims,
    freshness: { state: 'current', last_reviewed_at: ACCESSED_AT, next_review_at: NEXT_REVIEW_AT, field_reviews: [] },
    quality: { publication_state: 'review', completeness_pct: 100, confidence: spec.outcomeConfidence, unsourced_fields: spec.unknowns },
    extensions: {
      legacy_origin: 'stablecoin_meta',
      identity_boundary: spec.identityBoundary,
      reserve_boundary: spec.reserveBoundary,
      redemption_boundary: spec.redemptionBoundary,
      value_capture_boundary: spec.valueCaptureBoundary,
      editorial_guardrail: spec.guardrail,
      explicit_unknowns: spec.unknowns,
      methodology_notes: [
        'Every material field remains pending until a person reviews the cited evidence.',
        'Market price, issuer redemption, reserve value, circulating supply and holder yield answer different questions and are not interchangeable.',
        'Issuer statements, legal terms, regulator findings, attestation snapshots and independent market observations are labeled separately.',
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

const pyusdSlug = 'pyusd';
const pyusdSources = [
  source(pyusdSlug, 'product', 'PayPal USD', 'https://www.paxos.com/pyusd', 'Paxos', null, 'primary'),
  source(pyusdSlug, 'terms', 'US Dollar-Backed Stablecoin Terms and Conditions', 'https://www.paxos.com/terms-and-conditions/stablecoin-terms-conditions', 'Paxos', '2026-06-30', 'primary'),
  source(pyusdSlug, 'freeze', 'Illegal Activity Policy', 'https://www.paxos.com/terms-and-conditions/illegal-activity', 'Paxos', '2025-12-12', 'primary'),
  source(pyusdSlug, 'launch', 'PayPal Launches U.S. Dollar Stablecoin', 'https://newsroom.paypal-corp.com/2023-08-07-PayPal-Launches-U-S-Dollar-Stablecoin', 'PayPal', '2023-08-07', 'primary'),
  source(pyusdSlug, 'markets', 'PayPal Brings PayPal USD to Users Across 70 Markets', 'https://newsroom.paypal-corp.com/2026-03-17-PAYPAL-BRINGS-PAYPAL-USD-TO-USERS-ACROSS-70-MARKETS', 'PayPal', '2026-03-17', 'primary'),
  source(pyusdSlug, 'occ', 'Paxos national trust bank conversion decision', 'https://www.occ.gov/news-issuances/news-releases/2025/nr-occ-2025-125e.pdf', 'Office of the Comptroller of the Currency', '2025-12-12', 'primary', { independence_group: 'occ' }),
  source(pyusdSlug, 'range', 'Where do stablecoins sit at rest?', 'https://range.org/blog/where-do-stablecoins-sit-at-rest-we-mapped-180b-to-find-out', 'Range', null, 'independent'),
  source(pyusdSlug, 'aave', 'Precautionary freezing (LTV0) of pyUSD', 'https://governance.aave.com/t/precautionary-freezing-ltv0-of-pyusd/23262', 'Aave Governance', '2025-10-15', 'independent'),
  source(pyusdSlug, 'market', 'DefiLlama stablecoins API', MARKET_URL, 'DefiLlama', null, 'aggregator'),
];

const pyusd = buildProfile({
  slug: pyusdSlug,
  name: 'PayPal USD',
  aliases: ['PYUSD'],
  classification: { subtype: 'regulated fiat-backed payment stablecoin', tags: ['fiat_backed', 'payments', 'paxos', 'paypal_distribution', 'freeze_capable'], chains: ['Ethereum', 'Solana', 'Arbitrum'], jurisdictions: ['United States'] },
  sources: pyusdSources,
  operatingState: 'operating_and_expanding_distribution',
  statusAssertion: 'Paxos continues to issue and redeem PYUSD while PayPal distributes it across its payment products and 70 markets.',
  statusSources: ['product', 'terms', 'markets'],
  statusLocator: 'Current issuer page and terms plus PayPal’s March 2026 distribution announcement.',
  outcome: 'growing_distribution_led_regulated_stablecoin',
  outcomeConfidence: 'high',
  outcomeAssertion: 'PYUSD has grown into a material regulated stablecoin because PayPal supplies distribution and Paxos supplies issuance, reserves and redemption, while concentration and operational controls remain important risks.',
  outcomeSources: ['product', 'terms', 'markets', 'range', 'aave', 'market'],
  outcomeLocator: 'Current operating terms, distribution expansion, holder mapping, stress event and supply snapshot.',
  market: { supply: 2694049470.7487316, price: 0.9997075091666159 },
  sections: {
    what_it_is: section('PYUSD is PayPal’s dollar token, but Paxos—not PayPal—legally issues it. Paxos says each token is backed by dollar deposits, short-dated U.S. government debt or similar cash equivalents and can be redeemed one-for-one by an eligible Paxos customer. Most people instead get it through PayPal, Venmo, exchanges or onchain markets. Holding PYUSD is not the same as holding a bank deposit, PayPal stock or a claim to Paxos profit.', ['product', 'terms', 'launch'], 'PYUSD separates a familiar PayPal front end from a regulated Paxos issuer and reserve structure.'),
    what_happened: section('PayPal launched PYUSD on Ethereum in August 2023, added Venmo and other chains, and expanded account access across 70 markets in March 2026. DefiLlama observed about $2.69 billion in circulation on 2026-08-03. The largest public operational warning came in October 2025, when Paxos accidentally minted and then burned $300 trillion of PYUSD; Aave briefly froze the asset while it checked the incident. The peg recovered because the error was reversed, not because the oversized mint was economically backed.', ['launch', 'markets', 'aave', 'market'], 'Distribution expanded materially, while the 2025 mint error proved that issuer operations can create risk even when reserve assets are conservative.'),
    why_this_outcome: section('PYUSD grew because two companies contributed different strengths. PayPal gave it a consumer wallet, merchant and cross-border distribution network; Paxos supplied regulated issuance, reserve management and primary redemption. That is a clearer route to adoption than launching a token and waiting for exchanges to list it. Range’s 2026 holder study nevertheless found a large share parked in lending protocols, so circulating supply should not be mistaken for everyday PayPal spending or broad retail retention.', ['markets', 'occ', 'range', 'market'], 'The success is distribution-led, but current evidence does not show how much supply represents repeat payments rather than subsidized DeFi balances.'),
    strategic_choices: section('PayPal chose a partner-issued stablecoin instead of becoming the reserve issuer itself. Paxos chose cash and short-term government assets, direct eligible-customer redemption and a centrally controlled token that can be frozen when law or investigations require it. PayPal later widened geographic and chain access instead of keeping PYUSD inside one closed wallet. Those choices favor compliance, recoverability and distribution, while accepting censorship, issuer concentration and dependence on two companies’ priorities.', ['product', 'terms', 'freeze', 'markets'], 'PYUSD deliberately trades decentralization for regulated control and PayPal distribution.'),
    operating_model: section('Eligible Paxos customers can mint or redeem against dollars after identity and compliance checks; PayPal and market intermediaries handle most retail access. Paxos holds the reserve assets, publishes reports and can delay large withdrawals or restrict accounts under its terms. PayPal provides branded wallet and payment experiences but is not the token issuer. The OCC approved Paxos’s conversion to an uninsured national trust bank, which changes the supervisor but does not turn PYUSD into an FDIC-insured deposit.', ['terms', 'occ', 'product'], 'Redemption depends on Paxos eligibility and operations, while most holders depend on secondary liquidity or PayPal’s own conversion rails.'),
    token_and_value_capture: section('PYUSD itself does not promise holders a share of reserve interest. Paxos and its commercial partners can earn economics from reserve yield, issuance services, distribution and payment activity, while PayPal may also use rewards to encourage balances. A holder receives a transferable dollar token and whatever third-party yield a separate product offers. That distinction matters: lending incentives can raise supply and demand temporarily without proving that merchants or consumers prefer PYUSD for payments.', ['terms', 'markets', 'range'], 'The issuer and distributors capture the core reserve and network economics; ordinary PYUSD holders receive no contractual revenue share.'),
    counterfactual: section('PayPal could have issued the token itself, kept it only inside PayPal, or used an incumbent such as USDC for settlement. Direct issuance would give PayPal more reserve economics but add bank, compliance and operational responsibility. A closed-loop token would be easier to control but less useful in open crypto markets. Using an incumbent would gain immediate liquidity but surrender product identity. The Paxos partnership is therefore a middle path: branded distribution without PayPal owning every issuance function.', ['launch', 'terms', 'markets'], 'No controlled evidence shows that direct PayPal issuance or an incumbent token would have produced better adoption or safer operations.', 'unknown'),
    risks_and_unknowns: section('The main risks are issuer and PayPal concentration, legal freezes, bank and custodian exposure, smart-contract controls, chain fragmentation and shallow liquidity outside major venues. The October 2025 mint error also exposed a missing operational guardrail: a huge amount could be created before downstream protocols reacted. Current reserve composition, redemption volume, failed redemptions, customer concentration, payment volume and the split between PayPal use and DeFi incentives are not available in one reconciled public dataset.', ['terms', 'freeze', 'aave', 'range'], 'Reserve backing does not remove operational, access, liquidity or concentration risk, and several decision-useful measures remain undisclosed.'),
    lifecycle: section('PYUSD moved from a U.S. Ethereum launch in 2023 to a multi-chain and multi-market product by 2026. It survived an extraordinary operational mint error without a lasting peg failure, then continued under Paxos’s national trust bank structure. The lifecycle call is growing, not mature: supply and distribution are meaningful, but the token remains much smaller and less liquid than USDT or USDC and much of its observed balance is concentrated in lending venues. The next phase is proving repeat payment use.', ['launch', 'markets', 'occ', 'range', 'aave', 'market'], 'PYUSD is operating and growing, but durable payment demand is not yet as well demonstrated as its distribution and balance growth.'),
    outlook_and_watch: section('The base case is continued growth through PayPal, Venmo, merchant settlement and selected DeFi markets. Watch monthly reserve reports, redemption delays, PayPal payment volume, repeat senders, merchant acceptance, holder concentration, lending subsidies, chain-level liquidity and new mint controls after the 2025 error. The call improves if payment activity grows without outsized rewards and redemptions clear through stress. It worsens if supply remains parked in a few protocols, liquidity fragments or another control failure reaches live markets.', ['product', 'markets', 'range', 'aave', 'market'], 'The outlook depends on converting PayPal reach into repeat economic use while maintaining disciplined issuance controls.'),
  },
  events: [
    { key: 'launch', type: 'product_launch', date: '2023-08-07', datePrecision: 'day', description: 'PayPal launched PYUSD with Paxos as issuer.', sources: ['launch'], locator: 'Dated PayPal launch release.' },
    { key: 'mint-error', type: 'operational_incident', date: '2025-10-15', datePrecision: 'day', description: 'Paxos accidentally minted and burned $300 trillion of PYUSD, prompting a brief Aave freeze.', sources: ['aave'], locator: 'Dated Aave incident response with issuer confirmation.' },
    { key: 'occ-conversion', type: 'regulatory_change', date: '2025-12-12', datePrecision: 'day', description: 'The OCC conditionally approved Paxos’s conversion to a national trust bank.', sources: ['occ'], locator: 'OCC approval letter.' },
  ],
  identityBoundary: 'PayPal owns the brand and distribution relationship; Paxos issues PYUSD and manages primary redemption; wallets, chains and lending protocols are separate counterparties.',
  reserveBoundary: 'Issuer reserve claims and reports describe backing; market price and circulating supply do not independently prove reserve quality.',
  redemptionBoundary: 'One-for-one issuer redemption is limited by eligibility, compliance checks and terms; secondary-market sale is not the same process.',
  valueCaptureBoundary: 'Reserve income, PayPal economics, third-party lending yield and holder token value are separate flows.',
  guardrail: 'Do not call PYUSD a PayPal-issued bank deposit or treat PayPal reach, circulating supply or a near-one-dollar price as verified payment adoption.',
  unknowns: ['current_reserve_composition', 'redemption_volume', 'failed_or_delayed_redemptions', 'unique_payment_users', 'merchant_payment_volume', 'holder_concentration_by_beneficial_owner', 'subsidy_adjusted_demand', 'issuer_distribution_economics'],
});

const usdeSlug = 'usde';
const usdeSources = [
  source(usdeSlug, 'overview', 'Ethena protocol overview', 'https://docs.ethena.fi/', 'Ethena', null, 'primary'),
  source(usdeSlug, 'mechanics', 'How USDe works', 'https://docs.ethena.fi/how-usde-works', 'Ethena', null, 'primary'),
  source(usdeSlug, 'terms', 'USDe Terms and Conditions', 'https://docs.ethena.fi/resources/usde-terms-and-conditions', 'Ethena', null, 'primary'),
  source(usdeSlug, 'custody', 'Off-exchange settlement in detail', 'https://docs.ethena.fi/backing-custody-and-security/overview/off-exchange-settlement-in-detail', 'Ethena', null, 'primary'),
  source(usdeSlug, 'attestations', 'Custodian attestations', 'https://docs.ethena.fi/resources/custodian-attestations', 'Ethena', null, 'primary'),
  source(usdeSlug, 'bafin', 'Ethena GmbH: BaFin initiates redemption process for USDe tokens', 'https://www.bafin.de/EN/Aufsicht/BoersenMaerkte/Massnahmen/massnahmen_sanktionen_node.html?cms_gtp=19584194_list%253D20%252619584192_list%253D2%25267953862_list%253D9', 'BaFin', '2025-06-25', 'primary', { independence_group: 'bafin', access_method: 'indexed_browser_snapshot', direct_http_status: 404 }),
  source(usdeSlug, 'stress', 'USDe Analysis during the Oct 10th-11th Volatility Event', 'https://gov.ethenafoundation.com/t/usde-analysis-during-the-oct-10th-11th-volatility-event/706', 'Ethena Foundation Governance', '2025-10-15', 'primary'),
  source(usdeSlug, 'independent', 'Why did Ethena’s stablecoin remain stable onchain but depeg on Binance?', 'https://www.21shares.com/fr/insights/why-did-ethenas-stablecoin-remain-stable-onchain-but-depegged-on-binance', '21Shares', '2025-10-21', 'independent'),
  source(usdeSlug, 'market', 'DefiLlama stablecoins API', MARKET_URL, 'DefiLlama', null, 'aggregator'),
];

const usde = buildProfile({
  slug: usdeSlug,
  name: 'Ethena USDe',
  aliases: ['USDe'],
  classification: { subtype: 'crypto-backed delta-neutral synthetic dollar', tags: ['synthetic_dollar', 'delta_neutral', 'perpetual_hedges', 'oes_custody', 'restricted_redemption'], chains: ['Ethereum', 'Solana', 'Base', 'Arbitrum'], jurisdictions: ['British Virgin Islands', 'European Union'] },
  sources: usdeSources,
  operatingState: 'operating_outside_wound_down_eu_issuer',
  statusAssertion: 'USDe remains in circulation and its offshore mint-and-redeem system operates, while Ethena GmbH’s EU issuance business was wound down under BaFin supervision.',
  statusSources: ['overview', 'terms', 'bafin', 'market'],
  statusLocator: 'Current protocol and terms plus the regulator’s completed 2025 wind-down process.',
  outcome: 'successful_scale_with_cyclical_and_regulatory_constraints',
  outcomeConfidence: 'medium',
  outcomeAssertion: 'USDe achieved multi-billion-dollar scale and processed a large stress redemption, but its hedge, custody, venue and regulatory dependencies make success more cyclical and fragile than cash-backed redemption.',
  outcomeSources: ['mechanics', 'terms', 'custody', 'bafin', 'stress', 'independent', 'market'],
  outcomeLocator: 'Current mechanism and access rules, EU enforcement, October 2025 stress evidence and current supply.',
  market: { supply: 3855015827.771935, price: 0.9997213268874253 },
  sections: {
    what_it_is: section('USDe is a synthetic dollar created by Ethena. It is not backed one-for-one by cash in a bank. Ethena takes crypto collateral, keeps it with off-exchange settlement providers and opens short derivatives positions intended to offset the collateral’s price movement. Approved customers can mint and redeem; everyone else normally trades USDe in secondary markets. USDe itself pays no yield, while the separate sUSDe vault passes through protocol rewards and adds its own risks.', ['overview', 'mechanics', 'terms', 'custody'], 'USDe’s dollar behavior depends on a hedged crypto portfolio and redemption network rather than a conventional cash reserve.'),
    what_happened: section('USDe scaled rapidly after its 2024 launch and DefiLlama observed about $3.86 billion in circulation on 2026-08-03. Germany’s BaFin found serious problems in Ethena GmbH’s authorization process and ordered an orderly 2025 wind-down and redemption window. During the October 10, 2025 market crash, USDe fell near $0.65 on Binance while staying much closer to one dollar onchain; about $1.9 billion was redeemed through the primary system during the event.', ['market', 'bafin', 'stress', 'independent'], 'USDe survived a large redemption test, but the Binance print showed that venue design and settlement access can create losses even when backing remains available.'),
    why_this_outcome: section('USDe grew because it turned crypto funding rates and staked-asset returns into an attractive sUSDe savings product while keeping the base token near a dollar. The strategy also lets Ethena expand without holding an equivalent amount of bank cash. That growth is cyclical: attractive funding can reverse, and the hedge requires exchanges, custodians and market makers to keep working together. The October 2025 recovery supports the mechanism under one sharp shock, not under every prolonged bear market or counterparty failure.', ['mechanics', 'custody', 'stress', 'independent'], 'The same derivatives and custody design that funds USDe’s growth is also its central source of fragility.'),
    strategic_choices: section('Ethena chose a delta-neutral crypto portfolio instead of Treasury bills, off-exchange settlement instead of leaving full collateral on exchanges, restricted primary redemption instead of universal fiat redemption, and a separate yield token instead of paying every USDe holder. It also pursued an EU entity and authorization path that ended in a regulator-supervised wind-down. These choices created scale and yield differentiation, but they added derivative, custodian, legal and access layers that users must understand.', ['mechanics', 'terms', 'custody', 'bafin'], 'Ethena optimized for crypto-native yield and capital efficiency rather than simple legal redemption into bank dollars.'),
    operating_model: section('A verified Mint User deposits approved assets; Ethena builds matching short positions and places backing with off-exchange settlement providers. Redemption returns a pro-rata portion of reserve assets up to a one-dollar notional value, subject to terms and eligibility, rather than guaranteeing cash to every wallet. External holders rely on exchanges, pools or becoming approved. Monthly custodian attestations report assets at providers, but the public page available during this review listed reports only through January 2026.', ['terms', 'custody', 'attestations'], 'The system reduces direct exchange custody but still depends on custodians, derivatives venues, oracles, liquidity and timely attestations.'),
    token_and_value_capture: section('USDe holders receive a transferable synthetic dollar but no automatic yield. Users must stake into sUSDe to receive a share of funding, basis, staking and other protocol returns, accepting vault and withdrawal conditions. Ethena can retain spreads, reserve-fund allocations and ecosystem value; ENA is a separate governance token and does not turn USDe into equity. High sUSDe yield can attract balances, but it may represent rented capital if users leave when funding rates or incentives fall.', ['overview', 'terms', 'mechanics'], 'USDe separates the dollar token, the yield-bearing vault and governance economics; combining them would overstate holder rights.'),
    counterfactual: section('Ethena could have used only cash and Treasuries, but that would remove its crypto-basis differentiation and likely compress yield. It could make direct redemption universal, but onboarding and compliance costs would rise and the operator would still need liquid backing. It could also hold assets directly on exchanges, improving execution speed while increasing exchange insolvency exposure. None of these alternatives removes every risk; each changes which party, market and legal system users depend on.', ['mechanics', 'terms', 'custody'], 'There is no controlled evidence that a cash-backed, universally redeemable or exchange-custodied version would preserve USDe’s scale and economics.', 'unknown'),
    risks_and_unknowns: section('Core risks include negative funding, basis breakdown, exchange default, off-exchange custodian failure, collateral depegs, bad oracles, impaired transfers, smart-contract bugs, reserve-fund governance and regulatory restrictions. The $0.65 Binance print demonstrated venue and oracle risk rather than a global reserve collapse, but affected users could still lose money. Current counterparty concentrations, liquidation buffers, stress redemption timing, reserve-fund sufficiency and a complete post-January-2026 attestation sequence remain unresolved.', ['custody', 'attestations', 'bafin', 'stress', 'independent'], 'A near-one-dollar current price does not erase the legal, funding, venue and counterparty risks exposed by prior events.'),
    lifecycle: section('USDe progressed from a fast-growing 2024 synthetic dollar into a system that survived a major 2025 redemption wave and an EU regulatory retreat. Its supply later contracted and rebuilt, leaving about $3.86 billion in circulation at this review. The lifecycle call is successful scale with material constraints: the product works and has demand, but it has not completed a full funding cycle free of issuer, exchange or custodian stress. BaFin’s action also shows that global circulation does not equal permission to issue everywhere.', ['market', 'bafin', 'stress', 'independent'], 'USDe is active and significant, yet its durability must be measured across both market cycles and jurisdictions.'),
    outlook_and_watch: section('The base case is continued crypto-native demand with sharp supply changes as funding and leverage move. Watch average and worst funding rates, hedge execution, custodian concentration, open interest by venue, reserve-fund size, monthly attestations, mint and redeem latency, sUSDe exits, EU legal status and price differences across exchanges and onchain pools. The call improves after repeated clean stress redemptions and current attestations. It worsens if negative funding persists, counterparties block assets or price gaps cannot be arbitraged.', ['mechanics', 'attestations', 'bafin', 'stress', 'independent', 'market'], 'USDe’s outlook depends less on a static reserve ratio than on continuous hedge, custody, liquidity and regulatory execution.'),
  },
  events: [
    { key: 'bafin-winddown', type: 'regulatory_action', date: '2025-06-25', datePrecision: 'day', description: 'BaFin ordered Ethena GmbH to conduct a supervised USDe redemption and wind-down process.', sources: ['bafin'], locator: 'BaFin measures record.' },
    { key: 'binance-dislocation', type: 'market_stress', date: '2025-10-10', datePrecision: 'day', description: 'USDe printed near $0.65 on Binance while holding much closer to its peg onchain.', sources: ['stress', 'independent'], locator: 'Protocol and independent event analyses.' },
    { key: 'stress-redemptions', type: 'redemption_stress', date: '2025-10-11', datePrecision: 'day', description: 'The primary system processed about $1.9 billion of USDe redemptions during the event.', sources: ['stress'], locator: 'Ethena governance event analysis.' },
  ],
  identityBoundary: 'USDe, sUSDe, ENA, Ethena’s offshore protocol entities, the wound-down German issuer, custodians and derivatives venues are separate instruments and counterparties.',
  reserveBoundary: 'Backing assets, derivative hedges, reserve-fund assets and attestation snapshots must be reconciled; gross collateral alone is not net solvency.',
  redemptionBoundary: 'Direct redemption is restricted to approved Mint Users and may return reserve assets, while secondary holders depend on market liquidity.',
  valueCaptureBoundary: 'USDe has no yield; sUSDe rewards, ENA economics, reserve-fund flows and protocol retained economics are separate.',
  guardrail: 'Do not call USDe cash-backed or describe a venue-specific print as either proof of total insolvency or proof that no user was harmed.',
  unknowns: ['current_complete_attestation_sequence', 'counterparty_concentration', 'hedge_slippage', 'negative_funding_runway', 'reserve_fund_current_assets', 'stress_redemption_latency', 'eusde_legal_status_by_country', 'repeat_non_incentivized_users'],
});

const fdusdSlug = 'fdusd';
const fdusdSources = [
  source(fdusdSlug, 'product', 'First Digital USD', 'https://www.firstdigitallabs.com/fdusd', 'First Digital Labs', null, 'primary', { access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source(fdusdSlug, 'terms', 'FDD Terms', 'https://www.firstdigitallabs.com/legal/fdd-terms', 'FD121 (BVI) Limited', null, 'primary', { access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source(fdusdSlug, 'transparency', 'FDUSD Transparency', 'https://www.firstdigitallabs.com/transparency', 'First Digital Labs', null, 'primary', { access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source(fdusdSlug, 'move', 'FDUSD Transitions to BVI-Based Issuance Structure', 'https://www.firstdigitallabs.com/news-and-insights/fdusd-transitions-to-bvi-based-issuance-structure', 'First Digital Labs', '2025-08-15', 'primary', { access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source(fdusdSlug, 'solana', 'First Digital USD Stablecoin Now Available on Solana', 'https://www.firstdigitallabs.com/news-and-insights/first-digital-usd-fdusd-r-stablecoin-now-available-on-solana-blockchain', 'First Digital Labs', '2025-01-15', 'primary', { access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source(fdusdSlug, 'stress', 'First Digital to pursue legal action over Justin Sun allegations as FDUSD drops', 'https://www.coindesk.com/markets/2025/04/02/first-digital-to-pursue-legal-action-over-justin-sun-allegations-as-fdusd-drops', 'CoinDesk', '2025-04-02', 'independent'),
  source(fdusdSlug, 'assessment', 'FDUSD Reserves and Backing: What Actually Backs It', 'https://eco.com/support/en/articles/15276700-fdusd-reserves-and-backing-2026-what-actually-backs-it', 'Eco', null, 'independent'),
  source(fdusdSlug, 'market', 'DefiLlama stablecoins API', MARKET_URL, 'DefiLlama', null, 'aggregator'),
];

const fdusd = buildProfile({
  slug: fdusdSlug,
  name: 'First Digital USD',
  aliases: ['FDUSD'],
  classification: { subtype: 'fiat-backed exchange-distributed stablecoin', tags: ['fiat_backed', 'binance_distribution', 'bvi_issuer', 'hong_kong_custody', 'freeze_and_redemption_controls'], chains: ['Ethereum', 'BNB Chain', 'Sui', 'Solana', 'Arbitrum', 'TON'], jurisdictions: ['British Virgin Islands', 'Hong Kong'] },
  sources: fdusdSources,
  operatingState: 'operating_after_supply_contraction',
  statusAssertion: 'FD121 (BVI) Limited continues to issue FDUSD, publish reserve information and offer eligible-client redemption after moving issuance from Hong Kong to BVI.',
  statusSources: ['product', 'terms', 'transparency', 'move'],
  statusLocator: 'Current issuer, legal and reserve pages plus the completed issuer transition.',
  outcome: 'middling_exchange_led_stablecoin_after_stress',
  outcomeConfidence: 'medium',
  outcomeAssertion: 'FDUSD remains operational and reserve-backed after a sharp 2025 confidence shock, but its supply is far below its 2024 peak and demand remains concentrated around exchange distribution.',
  outcomeSources: ['product', 'terms', 'transparency', 'stress', 'assessment', 'market'],
  outcomeLocator: 'Current reserves and terms, independent stress coverage, risk assessment and supply snapshot.',
  market: { supply: 349076244.3626302, price: 0.9969145953046599 },
  sections: {
    what_it_is: section('FDUSD is a dollar stablecoin issued by FD121 (BVI) Limited. First Digital says each token is backed by cash and short-term cash-equivalent assets held through segregated structures with First Digital Trust as reserve custodian. Direct minting and redemption target eligible professional clients; retail users generally buy or sell through exchanges. FDUSD is not a bank deposit, and neither a secondary-market price near one dollar nor an exchange listing gives every wallet an unconditional claim to instant cash.', ['product', 'terms', 'transparency'], 'FDUSD combines an offshore issuer and Hong Kong-linked custody with professional-client redemption and exchange-led retail liquidity.'),
    what_happened: section('FDUSD launched in 2023 and expanded quickly as Binance promoted it after BUSD’s wind-down, later reaching several chains. In April 2025 it briefly fell near $0.87 after Justin Sun made insolvency allegations connected to a separate TUSD reserve dispute; First Digital denied those claims and pointed to FDUSD reserves. The issuer moved from Hong Kong to BVI in August 2025 and continued monthly reporting. DefiLlama observed about $349.08 million in circulation on 2026-08-03, far below its earlier multi-billion-dollar peak.', ['solana', 'stress', 'move', 'transparency', 'market'], 'FDUSD recovered from the price shock, but the supply contraction shows that restored peg stability did not restore prior scale.'),
    why_this_outcome: section('FDUSD grew because Binance supplied immediate trading pairs, promotions and liquidity after another Paxos-issued exchange coin stopped minting. First Digital provided a simple cash-backed structure and expanded to chains used by Binance and DeFi customers. That distribution shortcut created scale but also concentration: when confidence in the broader First Digital group was challenged, FDUSD’s market price moved quickly. Published reserve reports helped the peg recover, yet exchange dependence and lower supply still limit evidence of durable independent demand.', ['product', 'transparency', 'stress', 'assessment', 'market'], 'Exchange distribution created FDUSD’s growth advantage and its main demand concentration risk.'),
    strategic_choices: section('First Digital chose cash and short-term instruments rather than crypto collateral, professional-client onboarding rather than universal direct redemption, and Binance-led distribution rather than building a large consumer wallet. It expanded across multiple chains and moved the legal issuer to BVI while leaving reserve custody and attestations largely unchanged. Those choices preserved global access and operating flexibility, but they also put more weight on private terms, exchange liquidity and the credibility of affiliated service providers.', ['terms', 'move', 'solana', 'transparency'], 'The BVI move favored global operating flexibility over a clearly licensed payment-stablecoin regime in a major market.'),
    operating_model: section('Eligible clients send dollars to mint and return FDUSD to redeem through FD121; retail holders normally trade with exchanges or market makers. Reserve assets are custodied by First Digital Trust in segregated structures, and independent accountants publish monthly snapshot reports. The terms let FD121 limit or suspend subscriptions and redemptions during market stress, insufficient reserve liquidity, exchange closures or other events. That means one-for-one design is an operating promise with conditions, not a smart-contract guarantee available equally to every holder.', ['terms', 'transparency', 'product'], 'FDUSD’s stability depends on reserve liquidity, custodian performance, issuer controls and professional arbitrage access.'),
    token_and_value_capture: section('FDUSD pays no contractual yield to ordinary holders. FD121 and related service providers can earn reserve income and fees, while exchanges and market makers may capture trading, listing or promotional economics. Users receive a transferable dollar token and may earn third-party yield in separate products, but those returns add counterparty or smart-contract risk. Because Binance distribution helped create demand, exchange incentives and organic payment use must be measured separately before calling supply growth product-market fit.', ['terms', 'product', 'assessment'], 'The issuer and distribution network keep the core reserve and trading economics; the token itself carries no revenue right.'),
    counterfactual: section('First Digital could have pursued a tightly regulated onshore issuer before scaling, diversified distribution away from Binance earlier, or limited the token to fewer chains. Stronger licensing might improve trust but reduce reachable markets and increase cost. Broader distribution could reduce concentration but is difficult without comparable exchange incentives. Fewer chains would simplify controls while limiting utility. The record does not show whether any alternative would have prevented the April 2025 selloff, which was driven by confidence and liquidity as much as formal structure.', ['move', 'stress', 'solana', 'assessment'], 'No observed comparison proves that a different domicile, exchange mix or chain strategy would have preserved FDUSD’s peak supply.', 'unknown'),
    risks_and_unknowns: section('The key risks are issuer and custodian concentration, discretionary redemption gates, bank and Treasury liquidity, exchange dependence, cross-chain contract controls, legal uncertainty and group-level reputational contagion. April 2025 showed that allegations about another reserve relationship could move FDUSD before holders separated the entities. Current beneficial-owner concentration, Binance share of volume, redemption queues, reserve counterparties, account eligibility, payment usage and audited full-year issuer financials are not available in one reconciled public record.', ['terms', 'transparency', 'stress', 'assessment'], 'Monthly reserve snapshots help but do not eliminate liquidity, legal, operational or distribution risk.'),
    lifecycle: section('FDUSD moved from a 2023 launch to rapid exchange-led scale, multi-chain expansion, a sharp April 2025 confidence test and a later legal-issuer migration. It is still redeemable for eligible clients and current reporting shows reserve assets above issued tokens at the reported snapshot, but circulating supply has contracted to roughly $349 million. The lifecycle call is middling: the product survived and the peg recovered, yet it has not regained its former demand and remains less diversified than the largest fiat-backed stablecoins.', ['product', 'transparency', 'stress', 'move', 'market'], 'FDUSD is an operating survivor, not a failed stablecoin, but recovery in price should not be confused with recovery in adoption.'),
    outlook_and_watch: section('Base case: FDUSD remains an exchange and settlement stablecoin at a smaller scale while First Digital pursues more banking and licensing relationships. Watch monthly report timeliness, reserve mix and counterparties, mint and redemption volume, Binance concentration, supply by chain, executable liquidity, legal proceedings tied to First Digital entities and evidence of merchant payments. The call improves with diversified demand and repeated stress redemptions. It worsens if reporting lags, redemption limits activate or another confidence shock produces persistent outflows.', ['transparency', 'terms', 'move', 'stress', 'market'], 'FDUSD’s outlook depends on diversifying beyond one exchange ecosystem while keeping reserve and redemption evidence current.'),
  },
  events: [
    { key: 'solana', type: 'chain_expansion', date: '2025-01-15', datePrecision: 'day', description: 'First Digital launched native FDUSD on Solana.', sources: ['solana'], locator: 'Dated issuer announcement.' },
    { key: 'depeg', type: 'market_stress', date: '2025-04-02', datePrecision: 'day', description: 'FDUSD briefly fell near $0.87 amid public insolvency allegations that First Digital denied.', sources: ['stress'], locator: 'Contemporaneous independent market report.' },
    { key: 'bvi-transition', type: 'issuer_change', date: '2025-08-15', datePrecision: 'day', description: 'FDUSD issuance moved from a Hong Kong entity to FD121 (BVI) Limited.', sources: ['move', 'terms'], locator: 'Issuer transition and updated terms.' },
  ],
  identityBoundary: 'FD121 (BVI) issues FDUSD; First Digital Trust custodies reserves; Binance distributes and trades it; the TUSD reserve dispute is a separate relationship.',
  reserveBoundary: 'Monthly reserve-account snapshots are not a full audit of every group entity, custodian control or intramonth liquidity.',
  redemptionBoundary: 'Direct redemption is for eligible onboarded clients and may be limited under the terms; secondary holders rely on exchanges and market makers.',
  valueCaptureBoundary: 'Reserve income, exchange trading economics, third-party yield and ordinary holder value are separate.',
  guardrail: 'Do not transfer allegations about TUSD reserves to FDUSD as fact, and do not call a recovered market price proof that demand or group-wide solvency was unchanged.',
  unknowns: ['beneficial_holder_concentration', 'binance_volume_share', 'redemption_volume_and_latency', 'reserve_counterparty_concentration', 'eligible_client_count', 'payment_volume', 'issuer_financial_statements', 'current_licensing_status_by_market'],
});

const tusdSlug = 'tusd';
const tusdSources = [
  source(tusdSlug, 'whitepaper', 'TrueUSD: A Tokenized Version of the US Dollar', 'https://tusd.io/docs/trueusd-white-paper-202602.pdf', 'TrueUSD', '2026-02-02', 'primary'),
  source(tusdSlug, 'terms', 'TrueUSD Terms of Use', 'https://app.tusd.io/terms-of-use', 'TrueUSD', null, 'primary'),
  source(tusdSlug, 'transparency', 'TrueUSD Transparency', 'https://tusd.io/transparency', 'TrueUSD', null, 'primary'),
  source(tusdSlug, 'attestation', 'Independent Assurance Report on the Consolidated Reserves Report', 'https://protos-media.s3.eu-west-2.amazonaws.com/wp-content/uploads/2026/02/19181312/2026-02-19-trueusd-attestation.pdf', 'Moore Hong Kong', '2026-02-19', 'independent', { independence_group: 'moore_hong_kong' }),
  source(tusdSlug, 'sec', 'TrueCoin LLC and TrustToken, Inc.', 'https://www.sec.gov/enforcement-litigation/litigation-releases/lr-26126', 'U.S. Securities and Exchange Commission', '2024-09-25', 'primary', { independence_group: 'sec' }),
  source(tusdSlug, 'bankruptcy', 'Archblock bankruptcy objection concerning TUSD reserves', 'https://cases.stretto.com/public/x514/14527/PLEADINGS/1452704232680000000160.pdf', 'U.S. Bankruptcy Court for the District of Delaware', '2026-04-23', 'primary', { independence_group: 'delaware_bankruptcy_court' }),
  source(tusdSlug, 'depeg', 'TrueUSD deploys new reserve audit system in attempt to recover dollar peg', 'https://cointelegraph.com/news/trueusd-reserve-audit-system-depeg-data', 'Cointelegraph', '2024-01-18', 'independent'),
  source(tusdSlug, 'market', 'DefiLlama stablecoins API', MARKET_URL, 'DefiLlama', null, 'aggregator'),
];

const tusd = buildProfile({
  slug: tusdSlug,
  name: 'TrueUSD',
  aliases: ['TUSD'],
  classification: { subtype: 'fiat-backed stablecoin under reserve and legal stress', tags: ['fiat_backed', 'techteryx', 'daily_attestations', 'reserve_dispute', 'restricted_redemption'], chains: ['Ethereum', 'Tron', 'BNB Chain', 'Avalanche'], jurisdictions: ['British Virgin Islands', 'Hong Kong', 'United States'] },
  sources: tusdSources,
  operatingState: 'operating_with_material_reserve_and_legal_risk',
  statusAssertion: 'Techteryx continues to operate TUSD with minting, redemption and reserve-reporting surfaces, while legacy reserve investments remain the subject of regulatory findings and litigation.',
  statusSources: ['whitepaper', 'terms', 'transparency', 'sec', 'bankruptcy', 'market'],
  statusLocator: 'Current product materials plus regulator and court records about historical reserve management.',
  outcome: 'declining_high_risk_stablecoin',
  outcomeConfidence: 'high',
  outcomeAssertion: 'TUSD remains redeemable and in circulation, but severe historical reserve-governance findings, repeated peg stress and large supply contraction support a declining high-risk classification.',
  outcomeSources: ['terms', 'transparency', 'sec', 'bankruptcy', 'depeg', 'market'],
  outcomeLocator: 'Current operating evidence compared with regulator findings, litigation, prior depeg and current supply.',
  market: { supply: 482388761.75526035, price: 0.9956738426763424 },
  sections: {
    what_it_is: section('TUSD is a dollar stablecoin operated by Techteryx. Verified customers can mint and redeem through the TrueUSD application, while most other holders use exchanges and onchain markets. TrueUSD markets daily reserve attestations and a Chainlink proof-of-reserve control intended to stop new minting when reported reserves fall short. Those tools report selected balances and controls; they do not make TUSD a bank deposit, guarantee every custodian, or give every wallet immediate legal access to reserve cash.', ['whitepaper', 'terms', 'transparency'], 'TUSD is a centrally operated dollar claim whose safety depends on Techteryx, reserve custodians, attestation inputs and redemption access.'),
    what_happened: section('TrueCoin launched TUSD in 2018 and sold the business to Techteryx in December 2020 while continuing some operations. The SEC later alleged and settled claims that TrueCoin and TrustToken misrepresented reserve safety while hundreds of millions of dollars were placed in a risky offshore commodity fund; the defendants settled without admitting or denying the allegations. TUSD depegged near $0.97 in January 2024. By 2026, reserve recovery disputes appeared in bankruptcy court and DefiLlama observed about $482.39 million in circulation.', ['sec', 'bankruptcy', 'depeg', 'market'], 'TUSD’s current operation sits on top of a documented history of poor reserve decisions, redemption trouble and lost market confidence.'),
    why_this_outcome: section('TUSD originally differentiated itself through direct redemption, frequent attestations and visible proof-of-reserve controls. It later benefited from exchange distribution and Tron-linked liquidity. The strategic failure was reserve governance: according to the SEC complaint, operators represented reserves as safe and liquid while large sums were invested in an offshore fund that later failed to honor redemption requests promptly. Daily reporting could not undo the economic and trust damage once users questioned who controlled the assets and whether they were liquid.', ['transparency', 'sec', 'bankruptcy', 'depeg'], 'TUSD declined because reserve-management and disclosure credibility broke the trust that its transparency product was designed to create.'),
    strategic_choices: section('The operators chose a multi-bank, multi-custodian reserve network and daily attestation system instead of one disclosed Treasury portfolio. They also allowed reserve assets to enter a commodity finance fund in pursuit of returns or operational strategy, according to the SEC and court records. Techteryx retained the product after acquiring it and now emphasizes new attestations and proof-of-reserve mint controls. Those choices preserved operation, but changing reports cannot erase legacy claims, trapped assets or uncertainty about recovery timing.', ['whitepaper', 'transparency', 'sec', 'bankruptcy'], 'TUSD prioritized yield and complex reserve relationships before later prioritizing visible daily controls, and the reversal came after trust was damaged.'),
    operating_model: section('A verified TrueUSD customer wires dollars to mint and sends TUSD for redemption, subject to a $1,000 minimum, identity checks and the company’s right to refuse requests for legal or risk reasons. Techteryx manages the product and reserve relationships; Moore Hong Kong provides assurance reports and Chainlink carries reported reserve coverage onchain. Court filings describe separate escrow agents, investment managers and recovery claims tied to historical assets. The chain token therefore depends on a long offchain control path that holders cannot inspect from a wallet.', ['terms', 'transparency', 'attestation', 'bankruptcy'], 'Frequent attestations improve visibility but do not replace independent control of the underlying custodians, investments and recovery rights.'),
    token_and_value_capture: section('TUSD holders receive no contractual share of reserve income. Techteryx and service providers can capture interest, fees and business value, while exchanges and lending venues can add separate incentives. The SEC case focused partly on profit opportunities marketed with TrueFi, which is distinct from ordinary TUSD redemption but shows how a stablecoin and adjacent yield product can be blurred. A one-dollar target is not yield, and a proof-of-reserve feed does not give holders equity or priority over every disputed asset.', ['terms', 'sec', 'whitepaper'], 'TUSD’s reserve and adjacent yield economics accrue outside the base token; holders primarily receive a conditional redemption claim.'),
    counterfactual: section('TUSD could have held only cash and short Treasuries with named custodians, refused opaque yield strategies, or paused growth until reserve control was independently verified. Those choices might have reduced income and exchange flexibility while preserving trust and liquidity. Techteryx could also have wound down after acquiring troubled assets instead of continuing the brand. The record cannot quantify which path would have recovered more value, but it clearly shows that complexity and delayed disclosure made later attestations less persuasive.', ['sec', 'bankruptcy', 'transparency'], 'A simpler, lower-yield reserve structure plausibly would have reduced the failure surface, but its adoption and recovery outcome are unobserved.', 'counterfactual'),
    risks_and_unknowns: section('The major risks are unresolved reserve recovery, custodian and fund concentration, legal ownership of claims, discretionary redemption, attestation scope, price liquidity, contract controls and governance opacity. The SEC settlement describes historical conduct by TrueCoin and TrustToken; current Techteryx obligations and recoveries must not be inferred beyond court records. Current reserve composition, accessible cash, redemption queues, beneficial ownership, recovered fund assets, issuer financial statements and post-February-2026 assurance continuity remain insufficiently reconciled.', ['terms', 'attestation', 'sec', 'bankruptcy', 'market'], 'Current reports do not eliminate the need to reconcile historical reserve losses, legal recoveries and present redemption capacity.'),
    lifecycle: section('TUSD moved from a first-generation redeemable stablecoin into a major exchange asset, then lost scale as depegs and reserve disclosures damaged confidence. It remains live in 2026, publishes product materials and trades near—but below—one dollar in the observed snapshot. The lifecycle call is declining and high risk rather than dead: current operation matters, but it coexists with serious regulator findings and court disputes over how reserves were invested and recovered. Survival alone is not evidence that prior holders or the product fully recovered.', ['whitepaper', 'sec', 'bankruptcy', 'depeg', 'market'], 'TUSD survives as a smaller operating token, but its trust and scale have not recovered from documented reserve-governance failures.'),
    outlook_and_watch: section('Base case: TUSD continues at a reduced scale while Techteryx pursues reserve recoveries and uses frequent reporting to retain market access. Watch current assurance publication dates, reserve asset and custodian breakdowns, redemption volumes and delays, court recoveries, related-party controls, exchange support, price depth and supply. The call improves only when recovered assets and accessible reserves are independently reconciled with liabilities over time. It worsens if attestations lapse, litigation reveals new shortfalls or redemptions become restricted during another run.', ['transparency', 'attestation', 'sec', 'bankruptcy', 'market'], 'TUSD’s outlook is primarily a reserve-recovery and credibility problem, not a marketing or chain-expansion problem.'),
  },
  events: [
    { key: 'techteryx-acquisition', type: 'ownership_change', date: '2020-12-02', datePrecision: 'day', description: 'Techteryx acquired the TUSD business and related reserve rights and obligations from TrueCoin.', sources: ['bankruptcy'], locator: 'Dated transaction described in the bankruptcy court filing.' },
    { key: 'depeg', type: 'market_stress', date: '2024-01-15', datePrecision: 'day', description: 'TUSD began a sustained depeg that reached about $0.97 during heavy selling.', sources: ['depeg'], locator: 'Contemporaneous independent market report.' },
    { key: 'sec-case', type: 'regulatory_action', date: '2024-09-25', datePrecision: 'day', description: 'The SEC announced settled charges concerning TUSD reserve and investment representations by TrueCoin and TrustToken.', sources: ['sec'], locator: 'SEC litigation release and complaint.' },
  ],
  identityBoundary: 'Techteryx currently operates TUSD; TrueCoin and TrustToken are legacy operators named in the SEC case; reserve custodians, commodity funds and TrueFi are separate counterparties or products.',
  reserveBoundary: 'Attestation values, fund recovery claims, onchain proof-of-reserve inputs and liquid cash are distinct and must be reconciled.',
  redemptionBoundary: 'Direct redemption requires an approved account and may be refused; a market sale is not proof that reserve cash was delivered.',
  valueCaptureBoundary: 'Base-token redemption, reserve income, TrueFi investment opportunities and exchange incentives are separate.',
  guardrail: 'Attribute allegations and findings precisely to the SEC or court record, distinguish legacy operators from current Techteryx, and do not call daily attestations a full audit.',
  unknowns: ['current_liquid_reserve_composition', 'redemption_volume_and_latency', 'recovered_commodity_fund_assets', 'beneficial_ownership_and_control', 'related_party_controls', 'post_february_2026_assurance_sequence', 'issuer_financial_statements', 'current_exchange_liquidity_depth'],
});

const usddSlug = 'usdd';
const usddSources = [
  source(usddSlug, 'architecture', 'USDD System Architecture', 'https://docs.usdd.io/system-architecture/system-architecture', 'USDD', null, 'primary'),
  source(usddSlug, 'vault', 'Manage a Vault', 'https://docs.usdd.io/user-guide/manage-a-vault', 'USDD', null, 'primary'),
  source(usddSlug, 'psm', 'Peg Stability Module', 'https://docs.usdd.io/user-guide/psm-peg-stability-module', 'USDD', null, 'primary'),
  source(usddSlug, 'susdd', 'sUSDD Mechanism', 'https://docs.usdd.io/system-architecture/susdd-mechanism', 'USDD', null, 'primary'),
  source(usddSlug, 'governance', 'Governance Overview', 'https://docs.usdd.io/governance/overview', 'USDD', null, 'primary'),
  source(usddSlug, 'terms', 'USDD Terms of Use', 'https://docs.usdd.io/legals/terms-of-use', 'USDD', '2025-01-04', 'primary'),
  source(usddSlug, 'data', 'USDD Data', 'https://usdd.io/data', 'USDD', null, 'primary'),
  source(usddSlug, 'relaunch', 'USDD 2.0 — New Horizons', 'https://medium.com/@usddio/usdd-2-0-new-horizons-bef12531dad8', 'USDD', '2025-09-29', 'primary'),
  source(usddSlug, 'launch', 'TRON Founder Announces the Launch of USDD', 'https://www.businesswire.com/news/home/20220421005765/en/TRON-Founder-H.E.-Justin-Sun-Announces-the-Launch-of-USDD-A-Decentralized-Stablecoin', 'TRON DAO', '2022-04-21', 'primary'),
  source(usddSlug, 'depeg', 'Tron Network USDD Stablecoin Wobbles From Dollar Peg', 'https://www.coindesk.com/markets/2022/11/10/tron-network-usdd-stablecoin-wobbles-from-dollar-peg-amid-latest-crypto-crisis', 'CoinDesk', '2022-11-10', 'independent'),
  source(usddSlug, 'market', 'DefiLlama stablecoins API', MARKET_URL, 'DefiLlama', null, 'aggregator'),
];

const usdd = buildProfile({
  slug: usddSlug,
  name: 'Decentralized USD',
  aliases: ['USDD', 'USDD 2.0'],
  classification: { subtype: 'crypto-overcollateralized vault stablecoin', tags: ['crypto_collateral', 'vaults', 'psm', 'tron_ecosystem', 'susdd_yield'], chains: ['Tron', 'Ethereum', 'BNB Chain', 'BitTorrent Chain'], jurisdictions: [] },
  sources: usddSources,
  operatingState: 'operating_after_protocol_redesign',
  statusAssertion: 'The current USDD protocol operates with collateralized vaults, liquidations, a USDT peg module, sUSDD and an active multi-chain supply.',
  statusSources: ['architecture', 'vault', 'psm', 'susdd', 'data', 'market'],
  statusLocator: 'Current protocol documentation, live data surface and supply snapshot.',
  outcome: 'middling_recovered_but_concentrated_stablecoin',
  outcomeConfidence: 'medium',
  outcomeAssertion: 'USDD recovered from early depegs and replaced much of its original algorithmic story with collateralized vaults and a peg module, but governance, ecosystem and collateral concentration keep the outcome middling.',
  outcomeSources: ['architecture', 'governance', 'data', 'launch', 'depeg', 'market'],
  outcomeLocator: 'Current design compared with original launch claims, historical stress and current scale.',
  market: { supply: 1508251537.6077943, price: 1.0000637487007638 },
  sections: {
    what_it_is: section('USDD is a crypto-backed dollar token developed for the TRON ecosystem. The current version lets users lock approved collateral in vaults to mint USDD, liquidates weak positions and uses a peg module that swaps USDD and USDT. A separate sUSDD vault distributes strategy returns. This is materially different from a bank-reserve stablecoin and from the 2022 launch story centered on TRX burning and a TRON DAO Reserve. A holder owns the token, not a legal claim on a named bank account.', ['architecture', 'vault', 'psm', 'susdd', 'launch'], 'USDD now resembles a collateralized lending protocol more than the algorithmic stablecoin first announced in 2022.'),
    what_happened: section('TRON announced USDD in April 2022 as an algorithmic dollar managed through the TRON DAO Reserve. It lost its peg during the June and November 2022 market crises, trading near $0.96 or lower while the operator argued that a three-percent range was acceptable. USDD 2.0 relaunched on January 25, 2025 with overcollateralized vaults, auctions, a peg module and later sUSDD savings. DefiLlama observed about $1.51 billion in circulation at a price slightly above one dollar on 2026-08-03.', ['launch', 'depeg', 'relaunch', 'architecture', 'psm', 'susdd', 'market'], 'USDD survived by changing the design, so current stability should be judged on the new collateral system rather than the original launch promise.'),
    why_this_outcome: section('USDD survived because TRON supplied a large existing user and exchange network, the reserve organization added collateral during early stress, and the later redesign introduced clearer vault, liquidation and stablecoin-swap tools. The same ecosystem support also limits independence: demand, collateral, governance and distribution remain closely tied to TRON and its major applications. The current peg shows the system is functioning today, but it does not reveal how it would behave if TRX, USDT liquidity and TRON governance were stressed together.', ['architecture', 'psm', 'governance', 'data', 'depeg'], 'USDD’s recovery came from stronger collateral and ecosystem support, while concentration remains the central unresolved risk.'),
    strategic_choices: section('USDD first chose an ambitious algorithmic narrative close to the moment Terra’s UST was collapsing. It later chose overcollateralized borrower vaults, liquidations, auctions and a USDT peg module, effectively conceding that explicit collateral and arbitrage rails were more credible. The team also added sUSDD to attract savings demand and described governance as community-driven, although detailed decision rights remain thin in the reviewed documentation. The redesign reduced death-spiral risk but added dependence on collateral and USDT.', ['launch', 'architecture', 'psm', 'susdd', 'governance'], 'The decisive strategic move was abandoning a mostly algorithmic identity for collateralized lending and stablecoin liquidity.'),
    operating_model: section('A borrower deposits approved crypto, mints USDD against it and pays stability fees; if collateral falls below required levels, the system liquidates and auctions it. The peg module accepts USDT to mint USDD or returns USDT when USDD is redeemed through that pool, subject to available liquidity and contract rules. sUSDD places USDD into a separate yield strategy. The documentation says governance is decentralized but does not yet provide a complete current map of administrators, voting power, emergency controls or beneficial control.', ['architecture', 'vault', 'psm', 'susdd', 'governance'], 'USDD stability depends on collateral prices, liquidators, oracles, auctions, PSM liquidity and administrative governance working together.'),
    token_and_value_capture: section('Plain USDD targets one dollar and does not automatically earn the returns advertised for sUSDD. Borrowers pay stability fees, liquidators and auction participants can earn spreads, and the Smart Allocator can generate strategy income for the savings product. TRX and other collateral holders gain leverage but bear liquidation risk. The protocol and associated ecosystem may gain liquidity and activity, yet current documents do not reconcile fee income, subsidies, sUSDD rewards and any retained surplus into a complete unit-economics statement.', ['vault', 'susdd', 'architecture', 'data'], 'USDD, sUSDD, borrower leverage, protocol fees and TRON ecosystem value are distinct economic flows.'),
    counterfactual: section('USDD could have remained a TRX burn-and-mint system, but the 2022 depegs showed how confidence in volatile collateral can weaken the peg. It could instead use only fiat reserves, gaining simpler redemption while giving up permissionless vault creation. A broader mix of independent stablecoins and collateral could reduce TRON concentration but import other issuers’ freeze and banking risk. The current hybrid design is a compromise; no public controlled test proves which alternative would perform best under a simultaneous TRON and stablecoin shock.', ['launch', 'depeg', 'architecture', 'psm'], 'The redesign plausibly reduced algorithmic reflexivity, but comparative stress results against the abandoned design are unobserved.', 'counterfactual'),
    risks_and_unknowns: section('Key risks are volatile collateral, TRX concentration, USDT dependence in the peg module, oracle failure, slow liquidations, auction shortfalls, smart-contract bugs, bridge risk, admin controls and governance opacity. The interface terms also exclude users in several major jurisdictions and disclaim guarantees. Current collateral composition, minimum ratios by asset, liquidator concentration, PSM reserves, emergency keys, protocol subsidies, bad debt, legal issuer identity and stress-test results are not fully reconciled in the public profile.', ['vault', 'psm', 'governance', 'terms', 'data'], 'Overcollateralization helps only if collateral is liquid, correctly valued and reachable when the system needs it.'),
    lifecycle: section('USDD launched into the 2022 algorithmic-stablecoin crisis, depegged more than once and then relaunched as a materially different collateralized system on January 25, 2025. The current protocol is live, the market snapshot is near one dollar and circulation is larger than during its first year. The lifecycle call is middling recovery: survival and redesign are meaningful, but the product remains concentrated in the TRON ecosystem and has not published enough governance and stress data to support a top-tier resilience call.', ['launch', 'depeg', 'relaunch', 'architecture', 'data', 'market'], 'USDD recovered operationally by redesigning itself, but independent resilience remains unproven.'),
    outlook_and_watch: section('Base case: USDD remains a meaningful TRON-centered stablecoin supported by vault borrowing, USDT arbitrage and sUSDD demand. Watch collateral and debt by asset, liquidation speed, auction losses, PSM USDT balances, sUSDD reward funding, protocol subsidies, governance votes, admin changes, holder concentration and price gaps across chains. The call improves after transparent stress tests and broader collateral and governance participation. It worsens if TRX falls while PSM liquidity drains or if rewards, rather than repeat settlement use, drive supply.', ['architecture', 'psm', 'susdd', 'governance', 'data', 'market'], 'USDD’s outlook depends on proving that the redesigned system works without concentrated support or unsustainable rewards.'),
  },
  events: [
    { key: 'announcement', type: 'product_announcement', date: '2022-04-21', datePrecision: 'day', description: 'TRON announced USDD as an algorithmic stablecoin supported by the TRON DAO Reserve.', sources: ['launch'], locator: 'Dated launch announcement.' },
    { key: 'depeg', type: 'market_stress', date: '2022-11-10', datePrecision: 'day', description: 'USDD traded below its dollar target during the FTX market crisis after an earlier June depeg.', sources: ['depeg'], locator: 'Contemporaneous independent report.' },
    { key: 'current-redesign', type: 'protocol_redesign', date: '2025-01-25', datePrecision: 'day', description: 'USDD 2.0 relaunched with overcollateralized vaults, liquidations, a peg module and savings strategy.', sources: ['relaunch', 'architecture', 'vault', 'psm', 'susdd'], locator: 'Dated USDD retrospective and current protocol documentation.' },
  ],
  identityBoundary: 'Current USDD, legacy USDD mechanics, sUSDD, TRX, the TRON DAO Reserve, the USDD interface and external collateral tokens are separate instruments or actors.',
  reserveBoundary: 'Vault collateral, PSM USDT, Smart Allocator assets and legacy reserve wallets are different pools and must not be added without liability reconciliation.',
  redemptionBoundary: 'PSM swaps and vault debt repayment are protocol operations, not a universal legal right to withdraw U.S. bank dollars.',
  valueCaptureBoundary: 'USDD peg value, sUSDD yield, borrower leverage, liquidator income, subsidies and TRX ecosystem benefits are separate.',
  guardrail: 'Do not analyze the current collateralized system as if the 2022 burn-and-mint design were unchanged, and do not call onchain collateral a legal cash redemption promise.',
  unknowns: ['current_collateral_composition', 'collateral_ratios_by_asset', 'psm_reserve_balance', 'liquidator_concentration', 'bad_debt', 'emergency_admin_keys', 'governance_voting_power', 'protocol_subsidies', 'stress_test_results', 'legal_issuer_identity'],
});

export const document = {
  schema: 'chaindump-stablecoin-depth-wave-a-v1',
  version: 1,
  research_as_of: AS_OF,
  generated_at: ACCESSED_AT,
  generated_migration: '0097_stablecoin_depth_wave_a.sql',
  selection_method: 'Five strategic shallow profiles selected to compare regulated distribution, a synthetic hedge, exchange-led fiat backing, reserve-governance failure and a redesigned crypto-collateral system.',
  entities: [
    { slug: pyusdSlug, canonical_profile: pyusd },
    { slug: usdeSlug, canonical_profile: usde },
    { slug: fdusdSlug, canonical_profile: fdusd },
    { slug: tusdSlug, canonical_profile: tusd },
    { slug: usddSlug, canonical_profile: usdd },
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
  return `-- Five current, source-linked stablecoin profiles researched ${AS_OF} and awaiting human review.
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

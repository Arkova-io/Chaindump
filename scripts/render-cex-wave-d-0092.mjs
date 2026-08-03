#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYSIS_SECTION_KEYS, validateEntityProfile } from '../src/lib/entity-profile.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(root, 'docs/cex-wave-d-profiles-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0092_cex_wave_d_profiles.sql');
const AS_OF = '2026-08-03';
const ACCESSED_AT = '2026-08-03T21:10:00Z';
const OBSERVED_AT = '2026-08-03T21:00:00Z';
const NEXT_REVIEW_AT = '2026-08-10T21:10:00Z';
const MAX_D1_STATEMENT_BYTES = 95_000;

function source(slug, key, title, url, publisher, {
  publishedAt = null,
  tier = 'A',
  role = 'primary',
  locator = 'The reviewed page and its dated or current content.',
  directHttpStatus = 200,
  accessMethod = 'direct_http',
} = {}) {
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
    evidence_locator: locator,
    direct_http_status: directHttpStatus,
    access_method: accessMethod,
  };
}

function claim(assertion, sourceKeys, evidenceLocator, {
  value = assertion,
  confidence = 'high',
  kind = 'fact',
  supportDirection = 'supports',
  note = null,
} = {}) {
  return {
    assertion,
    value,
    sourceKeys,
    evidenceLocator,
    confidence,
    kind,
    supportDirection,
    note,
  };
}

function section(body, claims) {
  return { body, claims };
}

function metric(key, dimension, label, value, sourceKeys, method, {
  window = 'dated observation',
  scope = 'named exchange entity or venue',
  qualityFlags = [],
  asOf = AS_OF,
  currency = 'USD',
  unit = 'usd',
  evidenceLocator = `Source observation checked at ${ACCESSED_AT}.`,
} = {}) {
  return {
    key,
    dimension,
    label,
    value,
    unit,
    currency,
    window: { start: null, end: asOf, definition: window },
    as_of: asOf,
    method,
    scope: { product: scope, chains: [] },
    sourceKeys,
    evidenceLocator,
    qualityFlags,
  };
}

function event(key, type, date, description, sourceKeys, evidenceLocator) {
  return { key, type, date, description, sourceKeys, evidenceLocator };
}

function buildProfile(spec) {
  const sourceId = (key) => `source:${spec.slug}:${key}`;
  const claims = [];
  const sections = {};
  for (const key of ANALYSIS_SECTION_KEYS) {
    const value = spec.sections[key];
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
        source_ids: entry.sourceKeys.map(sourceId),
        evidence_locator: entry.evidenceLocator,
        support_direction: entry.supportDirection,
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
      assertion: spec.statusAssertion,
      value: spec.operatingState,
      as_of: AS_OF,
      confidence: spec.statusConfidence || 'high',
      kind: 'fact',
      source_ids: spec.statusSourceKeys.map(sourceId),
      evidence_locator: spec.statusEvidenceLocator,
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
      source_ids: spec.outcomeSourceKeys.map(sourceId),
      evidence_locator: spec.outcomeEvidenceLocator,
      support_direction: 'supports',
      note: 'Analyst lifecycle classification; it is not a token or investment recommendation.',
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    },
  );

  const metrics = spec.metrics.map((entry) => {
    const id = `metric:${spec.slug}:${entry.key}:${entry.as_of}`;
    const claimId = `claim:${spec.slug}:metric:${entry.key}`;
    claims.push({
      id: claimId,
      field_path: `metrics[${id}].value`,
      assertion: `${entry.label} was ${entry.value} ${entry.unit.toUpperCase()} for the stated scope and date.`,
      value: entry.value,
      as_of: entry.as_of,
      confidence: 'high',
      kind: 'fact',
      source_ids: entry.sourceKeys.map(sourceId),
      evidence_locator: entry.evidenceLocator,
      support_direction: 'supports',
      note: 'A dated observation is not automatically comparable with a different entity, scope, or accounting definition.',
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
      quality_flags: entry.qualityFlags,
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
      source_ids: entry.sourceKeys.map(sourceId),
      evidence_locator: entry.evidenceLocator,
      support_direction: 'supports',
      note: null,
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    });
    return {
      id,
      type: entry.type,
      date: entry.date,
      description: entry.description,
      claim_ids: [claimId],
    };
  });

  const profile = {
    schema: 'chaindump-entity-profile',
    version: 1,
    identity: {
      id: `cex:${spec.slug}`,
      type: 'cex',
      slug: spec.slug,
      name: spec.name,
      aliases: spec.aliases,
    },
    classification: spec.classification,
    status: { operating_state: spec.operatingState, as_of: AS_OF, claim_ids: [statusClaimId] },
    outcome: {
      label: spec.outcome,
      as_of: AS_OF,
      rule_id: 'exchange-lifecycle-v1',
      confidence: spec.outcomeConfidence,
      claim_ids: [outcomeClaimId],
    },
    analysis: { sections },
    metrics,
    events,
    sources: spec.sources,
    claims,
    freshness: {
      state: 'current',
      last_reviewed_at: ACCESSED_AT,
      next_review_at: NEXT_REVIEW_AT,
      field_reviews: [],
    },
    quality: {
      publication_state: 'review',
      completeness_pct: 100,
      confidence: spec.qualityConfidence,
      unsourced_fields: spec.unsourcedFields,
    },
    extensions: {
      legacy_origin: spec.table,
      identity_boundary: spec.identityBoundary,
      methodology_notes: [
        'Freshness records source assembly, not human approval; every claim remains pending review.',
        'Legal entities, venue brands, parent companies, recovery estates, reserve snapshots and tokens are kept separate.',
        ...spec.methodologyNotes,
      ],
      explicit_unknowns: spec.unknowns,
    },
  };
  const errors = validateEntityProfile(profile);
  if (errors.length) throw new Error(`${spec.slug}: ${JSON.stringify(errors)}`);
  return profile;
}

const bitstampSources = [
  source('bitstamp', 'acquisition', 'Robinhood completes acquisition of Bitstamp', 'https://robinhood.com/us/en/newsroom/robinhood-completes-acquisition-of-bitstamp/', 'Robinhood', { publishedAt: '2025-06-02', locator: 'Closing date, product scope, global registrations, customer mix and reported trailing revenue.' }),
  source('bitstamp', 'sec-10k', 'Robinhood Markets 2025 Form 10-K', 'https://www.sec.gov/Archives/edgar/data/1783879/000178387926000023/hood-20251231.htm', 'U.S. Securities and Exchange Commission', { publishedAt: '2026-02-18', locator: 'Acquisition, custody infrastructure, entity integration and business-risk disclosures.' }),
  source('bitstamp', 'may-volume', 'Robinhood Markets May 2026 operating data', 'https://investors.robinhood.com/news-releases/news-release-details/robinhood-markets-inc-reports-may-2026-operating-data', 'Robinhood Investor Relations', { publishedAt: '2026-06-09', locator: 'Bitstamp May 2026 notional crypto volume and daily average volume.' }),
  source('bitstamp', 'q2-2026', 'Robinhood Markets second-quarter 2026 results', 'https://www.sec.gov/Archives/edgar/data/1783879/000178387926000113/q22026robinhoodexhibit991.htm', 'U.S. Securities and Exchange Commission', { publishedAt: '2026-07-29', locator: 'Q2 2026 crypto notional-volume table: $22 billion for Bitstamp, $18 billion for Robinhood App and $40 billion total.' }),
  source('bitstamp', 'q2-presentation', 'Robinhood Q2 2025 earnings presentation', 'https://investors.robinhood.com/static-files/fb802076-4508-4f06-bf20-ca7075d33fc1', 'Robinhood Investor Relations', { publishedAt: '2025-07-30', locator: 'Institutional-versus-retail mix and average revenue rate after closing.' }),
  source('bitstamp', 'prudential', 'Bitstamp Financial Services 2025 prudential disclosure', 'https://assets.bitstamp.net/msc/BFS_2025_Annual_Prudential_Disclosure_Report_e4b9c23319.pdf', 'Bitstamp Financial Services', { publishedAt: '2026-05-01', locator: 'Regulated entity, acquisition integration, capital and risk framework.' }),
  source('bitstamp', 'sec-q3', 'Robinhood Markets Q3 2025 Form 10-Q', 'https://www.sec.gov/Archives/edgar/data/1783879/000178387925000310/hood-20250930.htm', 'U.S. Securities and Exchange Commission', { publishedAt: '2025-11-06', locator: 'Cash consideration and acquisition date after purchase-price adjustments.' }),
  source('bitstamp', 'coindesk', 'Robinhood completes acquisition of Bitstamp', 'https://www.coindesk.com/business/2025/06/03/robinhood-completes-200m-acquisition-of-crypto-exchange-bitstamp', 'CoinDesk', { publishedAt: '2025-06-03', tier: 'B', role: 'independent', locator: 'Independent deal context and strategic rationale.' }),
  source('bitstamp', 'markets', 'Bitstamp markets', 'https://www.bitstamp.net/markets/', 'Bitstamp by Robinhood', { locator: 'Current branded spot-market surface and supported pairs.' }),
];

const bitstamp = {
  slug: 'bitstamp', name: 'Bitstamp by Robinhood', aliases: ['Bitstamp', 'Bitstamp Ltd.'], table: 'successful_exchanges',
  operatingState: 'operating', outcome: 'successful_acquired', outcomeConfidence: 'high', qualityConfidence: 'high',
  classification: { subtype: 'regulated custodial spot exchange and institutional venue', tags: ['custodial', 'spot', 'institutional', 'acquired', 'regulated'], chains: [], jurisdictions: ['European Union', 'United Kingdom', 'United States', 'Singapore'] },
  sources: bitstampSources,
  statusAssertion: 'Bitstamp remained an operating Robinhood-owned exchange at the review date.', statusSourceKeys: ['q2-2026', 'markets', 'sec-10k'], statusEvidenceLocator: 'Current product surface, parent reporting and SEC filing.',
  outcomeAssertion: 'Bitstamp is classified as a successful acquired exchange rather than a failed or independent venue.', outcomeSourceKeys: ['acquisition', 'q2-2026', 'prudential', 'coindesk'], outcomeEvidenceLocator: 'Completed acquisition, regulated continuity and separately reported volume.',
  identityBoundary: 'This profile covers the Bitstamp exchange businesses acquired by Robinhood. Robinhood App trading, stock tokens, brokerage assets and group-wide revenue are separate unless a source reports Bitstamp specifically. Parent ownership is not proof that every Bitstamp entity, licence or product remains unchanged.',
  methodologyNotes: ['Parent-reported notional volume is activity, not revenue, profit, liquidity depth or customer assets.', 'The acquisition price and regulated-entity disclosures are dated facts; future integration outcomes remain unobserved.'],
  unknowns: ['Post-acquisition standalone profit and cash flow', 'Current customer assets and liability coverage by legal entity', 'How much routing occurs between Robinhood and Bitstamp', 'Which products and licences will remain separately branded'],
  unsourcedFields: ['Standalone profit', 'Entity-level customer assets', 'Internal order routing', 'Long-run brand plan'],
  sections: {
    what_it_is: section('Bitstamp is a custodial spot exchange founded in 2011 and owned by Robinhood since June 2025. It serves retail traders, institutions and liquidity providers through several regulated entities. Customers trade on Bitstamp and the venue controls the custody and internal account ledger. Robinhood also runs its own app and other crypto products; those are related businesses, not Bitstamp volume by default.', [claim('Bitstamp is a custodial exchange serving retail and institutional customers.', ['acquisition', 'sec-10k'], 'Acquirer product and custody descriptions.'), claim('Robinhood completed the acquisition in June 2025.', ['acquisition', 'sec-q3'], 'Closing announcement and SEC filing.'), claim('Robinhood App activity is separate from reported Bitstamp activity.', ['q2-2026'], 'Parent results table reports Bitstamp and Robinhood App in separate columns.', { kind: 'inference' })]),
    what_happened: section('Bitstamp survived multiple crypto cycles by staying focused on spot and institutional trading while accumulating licences and registrations. Robinhood agreed to buy it in 2024 and closed the deal in June 2025. The final accounting value was about $224 million after adjustments. Robinhood reported $22 billion of Bitstamp crypto notional volume for Q2 2026, separately from $18 billion on the Robinhood App. The venue is operating, but it is now part of a larger group rather than an independent company.', [claim('The acquisition closed after a multi-jurisdiction review process.', ['acquisition', 'sec-q3'], 'Closing and acquisition accounting.'), claim('Final cash consideration was about $224 million after adjustments.', ['sec-q3'], 'SEC acquisition note.'), claim('Q2 2026 Bitstamp crypto notional volume was $22 billion.', ['q2-2026'], 'Dated SEC-filed parent results.')]),
    why_this_outcome: section('Bitstamp built acquisition value through longevity, regulated access and an institutional customer base instead of chasing the highest-risk product mix. Robinhood wanted global licences, institutional relationships and an exchange engine it did not already have. That distribution and capital base now supports continuity. The evidence shows why Bitstamp was attractive to a buyer; it does not prove that the venue would have grown as quickly on its own or that every licence caused the deal.', [claim('Robinhood identified global reach and institutional access as reasons for the acquisition.', ['acquisition', 'coindesk'], 'Buyer rationale and independent deal context.'), claim('Bitstamp maintained regulated capital and risk obligations after the acquisition.', ['prudential'], 'Entity prudential disclosure.'), claim('The contribution of any one licence to the purchase price is not disclosed.', ['acquisition', 'sec-q3'], 'Deal sources do not allocate value by licence.', { kind: 'unknown' })]),
    strategic_choices: section('Bitstamp chose a narrower regulated spot and institutional position, operated without an identified venue token, and accepted a sale to Robinhood. Those choices traded some independence and high-risk growth for durable market access and a buyer with a large retail funnel. Robinhood kept reporting Bitstamp volume separately, which gives users an observable continuity signal. Integration can still remove that transparency later or fold products into the parent.', [claim('Bitstamp emphasized spot and institutional trading across regulated entities.', ['acquisition', 'prudential'], 'Product and entity scope.'), claim('Selling to Robinhood exchanged independence for parent distribution and capital.', ['acquisition', 'coindesk'], 'Observed transaction and stated strategy.', { kind: 'inference' }), claim('Separate reporting currently makes venue activity visible.', ['q2-2026'], 'Parent results table.', { kind: 'inference' })]),
    operating_model: section('Bitstamp matches customer spot orders and earns transaction and institutional service revenue while holding customer crypto through custodial infrastructure. Robinhood reported that about 90% of June 2025 Bitstamp volume was institutional and that the average revenue rate was about five basis points per traded dollar. Those figures describe one month soon after closing, not a permanent margin. Q2 2026 notional volume confirms use but does not reveal product mix, spreads, rebates, capital costs or profit.', [claim('Bitstamp operates custodial spot trading for retail and institutional customers.', ['sec-10k', 'acquisition'], 'Custody and product descriptions.'), claim('About 90% of June 2025 Bitstamp volume was institutional with an average revenue rate near five basis points.', ['q2-presentation'], 'Dated parent presentation.'), claim('Notional volume does not establish standalone profit.', ['q2-2026', 'sec-10k'], 'Activity and consolidated reporting limits.', { kind: 'inference' })]),
    token_and_value_capture: section('The reviewed record does not identify a Bitstamp exchange token. Value capture sits in fees, customer relationships, licences and the Robinhood parent rather than a token claim. That avoids emissions and token-unlock reflexivity, but users receive no automatic ownership or fee share from trading on the venue. Robinhood-issued stock tokens and Robinhood equity are different instruments and are outside this profile.', [claim('Reviewed Bitstamp and Robinhood sources do not identify a Bitstamp venue token.', ['acquisition', 'sec-10k', 'markets'], 'Product and filing review.', { kind: 'unknown' }), claim('Venue economics accrue to operating companies and their parent, not automatically to customers.', ['sec-10k', 'sec-q3'], 'Corporate ownership and consolidated reporting.', { kind: 'inference' }), claim('Robinhood stock tokens are not Bitstamp exchange tokens.', ['sec-10k'], 'Separate product and issuer boundary.', { kind: 'inference' })]),
    counterfactual: section('Remaining independent would have preserved strategic control but required Bitstamp to fund distribution, compliance and product expansion alone. A venue token or aggressive derivatives push might have lifted headline volume, while weakening the regulated institutional position that attracted Robinhood. The stronger alternative test is whether Bitstamp could have produced comparable customers, licences and cash flow without the sale. Public evidence cannot answer that counterfactual.', [claim('Independence would leave funding and distribution with Bitstamp rather than Robinhood.', ['acquisition', 'sec-10k'], 'Observed ownership change supports the alternative.', { kind: 'inference' }), claim('A token-led model was not required for the observed acquisition outcome.', ['acquisition', 'markets'], 'No identified venue token and completed deal.', { kind: 'inference' }), claim('Standalone growth without the sale is unobservable.', ['sec-q3', 'coindesk'], 'Only the completed transaction is observed.', { kind: 'unknown' })]),
    risks_and_unknowns: section('The main risks are integration, loss of separate reporting, parent concentration, regulatory change and custodial liability. Bitstamp’s prudential report covers one regulated entity and cannot prove every group company or wallet is solvent at all times. Robinhood’s SEC filing describes shared custody infrastructure and acquisition risks, not a ring-fenced Bitstamp balance sheet. Users should watch entity names, terms, licences, withdrawal performance and segregated reporting.', [claim('Bitstamp remains exposed to custody, regulatory and integration risks.', ['sec-10k', 'prudential'], 'Risk disclosures.'), claim('One entity disclosure is not a group-wide solvency audit.', ['prudential', 'sec-10k'], 'Scope boundary.', { kind: 'inference' }), claim('Current entity-level customer assets and liabilities are not published in the reviewed record.', ['prudential', 'sec-10k'], 'Disclosure gap.', { kind: 'unknown' })]),
    lifecycle: section('Bitstamp launched in 2011, survived the early exchange-failure era, expanded its regulatory footprint and built an institutional business. Robinhood announced an acquisition in 2024 and closed in June 2025. Early post-close reporting showed an institutional-heavy mix, while Q2 2026 volume remained material and separately visible. The lifecycle call is successful acquisition: the venue operates and found a strategic buyer, but future identity and economics depend on Robinhood integration.', [claim('Bitstamp has operated since 2011 through multiple market cycles.', ['acquisition', 'coindesk'], 'Buyer and independent history.'), claim('It moved from independent venue to Robinhood subsidiary in June 2025.', ['acquisition', 'sec-q3'], 'Completed acquisition.'), claim('Separately reported 2026 volume supports continued operation.', ['q2-2026'], 'Dated activity observation.')]),
    outlook_and_watch: section('Watch Bitstamp volume, revenue-rate disclosure, licences, customer assets, withdrawal reliability and whether Robinhood continues to report the venue separately. A healthy outcome means Bitstamp gains parent distribution while retaining trusted execution and regulatory access. A weaker outcome means activity is absorbed into the parent, the brand loses independent meaning or custodial disclosures shrink. Customer count and profitability remain necessary before calling the integration complete.', [claim('Venue volume and separate reporting are direct continuity signals.', ['q2-2026'], 'Current parent reporting.', { kind: 'inference' }), claim('Licence and capital disclosures remain material institutional signals.', ['prudential', 'acquisition'], 'Regulated operating scope.', { kind: 'inference' }), claim('Standalone profitability and customer count remain unknown.', ['sec-10k', 'q2-2026'], 'Consolidated public reporting.', { kind: 'unknown' })]),
  },
  metrics: [
    metric('q2-notional-volume', 'spot_volume', 'Q2 2026 parent-defined crypto notional volume', 22000000000, ['q2-2026'], 'SEC-filed parent results report Bitstamp crypto notional volume but do not disclose the product mix.', { asOf: '2026-06-30', window: 'calendar quarter', scope: 'Bitstamp venue', qualityFlags: ['parent_reported', 'not_profit', 'product_mix_not_disclosed', 'not_comparable_to_spot_only_volume'] }),
    metric('may-notional-volume', 'spot_volume', 'May 2026 notional crypto volume', 6300000000, ['may-volume'], 'Parent-reported monthly venue notional volume.', { asOf: '2026-05-31', window: 'calendar month', scope: 'Bitstamp venue', qualityFlags: ['parent_reported', 'not_profit'] }),
    metric('may-average-daily-volume', 'spot_volume', 'May 2026 average daily notional volume', 203000000, ['may-volume'], 'Parent-reported average daily volume.', { asOf: '2026-05-31', window: 'calendar-month average', scope: 'Bitstamp venue', qualityFlags: ['parent_reported'] }),
  ],
  events: [
    event('acquisition-close', 'acquisition', '2025-06-02', 'Robinhood completed its acquisition of Bitstamp.', ['acquisition', 'sec-q3'], 'Closing records.'),
    event('post-close-reporting', 'operating_disclosure', '2025-06-30', 'Robinhood disclosed an institutional-heavy first full month of Bitstamp volume.', ['q2-presentation'], 'Dated parent presentation.'),
    event('may-volume', 'operating_disclosure', '2026-05-31', 'Robinhood reported $6.3 billion of Bitstamp notional crypto volume for May 2026.', ['may-volume'], 'Dated operating release.'),
    event('q2-2026-volume', 'operating_disclosure', '2026-06-30', 'Robinhood reported $22 billion of Bitstamp crypto notional volume for Q2 2026.', ['q2-2026'], 'SEC-filed parent results.'),
  ],
  feature: { lifecycle: 'successful', operating_model: 'Robinhood-owned custodial spot exchange serving retail and institutional customers.', product_cohort: 'regulated_custodial_spot_exchange', custody_model: 'custodial', token_status: 'not_identified', token_symbol: null, token_launch_date: null, token_launch_timing: 'unknown', token_strategy: 'no_venue_token_identified', token_source_url: 'https://robinhood.com/us/en/newsroom/robinhood-completes-acquisition-of-bitstamp/', metric_type: 'spot_volume', metric_unit: 'usd', metric_window: 'calendar_quarter', metric_as_of: '2026-06-30', metric_observed_at: OBSERVED_AT, comparability_key: 'cex|regulated_custodial_spot_exchange|spot_volume|usd|calendar_quarter' },
};

const okxSources = [
  source('okx', 'doj', 'OKX pleads guilty and agrees to more than $500 million in penalties', 'https://www.justice.gov/usao-sdny/pr/okx-pleads-guilty-violating-us-anti-money-laundering-laws-and-agrees-pay-penalties', 'U.S. Department of Justice', { publishedAt: '2025-02-24', locator: 'Aux Cayes entity, offense, fine, forfeiture, remediation and consultant term.' }),
  source('okx', 'plea', 'United States v. Aux Cayes Fintech plea agreement', 'https://www.justice.gov/usao-sdny/media/1390641/dl?inline=', 'U.S. District Court, Southern District of New York', { publishedAt: '2025-02-24', locator: 'Plea terms, legal entity and compliance commitments.' }),
  source('okx', 'us-launch', 'Bringing OKX to America', 'https://www.okx.com/en-us/learn/bringing-okx-to-the-united-states-a-new-era-for-crypto-and-web3-innovation', 'OKX US', { publishedAt: '2025-04-16', locator: 'Separate U.S. launch, exchange and wallet scope, and San Jose headquarters.' }),
  source('okx', 'por', 'OKX proof of reserves', 'https://www.okx.com/en-eu/proof-of-reserves', 'OKX', { publishedAt: '2026-07-07', locator: '45th reserve report, primary-asset total, account assets, wallet assets and ratios.' }),
  source('okx', 'mica', 'How MiCA regulates OKX Europe', 'https://www.okx.com/en-eu/learn/okx-regulated-crypto-exchange-mica-europe', 'OKX Europe', { publishedAt: '2026-06-04', locator: 'OKX Europe Limited entity, licence date, passport scope and customer-asset statements.' }),
  source('okx', 'trusted', 'OKX trusted exchange disclosures', 'https://www.okx.com/en-us/trusted-exchange', 'OKX', { publishedAt: '2026-06-01', locator: 'Current user, jurisdiction, security-control and reserve marketing disclosures.' }),
  source('okx', 'reuters', 'Operator of OKX enters $505 million guilty plea', 'https://www.investing.com/news/world-news/operator-of-okx-crypto-exchange-enters-guilty-plea-to-pay-more-than-504-million-us-says-3887505', 'Reuters via Investing.com', { publishedAt: '2025-02-24', tier: 'B', role: 'independent', locator: 'Independent plea, penalty and consultant reporting.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('okx', 'cincodias', 'OKX expansion and regulatory history in Europe', 'https://cincodias.elpais.com/criptoactivos/2025-06-27/erald-ghoos-okx-espana-esta-acelerando-en-la-adopcion-cripto-respecto-a-otros-paises.html', 'Cinco Días', { publishedAt: '2025-06-27', tier: 'B', role: 'independent', locator: 'Independent entity, product, licence and prior-enforcement context.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
];

const okx = {
  slug: 'okx', name: 'OKX', aliases: ['OKEx', 'Aux Cayes Fintech Co. Ltd.'], table: 'mid_exchanges',
  operatingState: 'operating', outcome: 'operating_regulatory_pivot', outcomeConfidence: 'high', qualityConfidence: 'high',
  classification: { subtype: 'global custodial multi-product exchange with jurisdiction-specific entities', tags: ['custodial', 'spot', 'derivatives', 'regulated_entities', 'venue_token', 'regulatory_remediation'], chains: [], jurisdictions: ['Global', 'United States', 'European Economic Area'] },
  sources: okxSources,
  statusAssertion: 'OKX remained operating through separate global, U.S. and European entities at the review date.', statusSourceKeys: ['us-launch', 'por', 'mica', 'trusted'], statusEvidenceLocator: 'Current entity, product and reserve surfaces.',
  outcomeAssertion: 'OKX is classified as an operating regulatory pivot after a guilty plea, remediation and licensed re-entry.', outcomeSourceKeys: ['doj', 'plea', 'us-launch', 'mica', 'reuters'], outcomeEvidenceLocator: 'Entity-specific criminal resolution followed by separate regulated expansion.',
  identityBoundary: 'The 2025 guilty plea belongs to Aux Cayes Fintech Co. Ltd., the named Seychelles operator. OKX US and OKX Europe Limited are separate entities and their later licences do not erase the plea. The OKX Wallet is self-custody software and is not the same product as custodial exchange balances. OKB is a venue token, not equity in every OKX entity.',
  methodologyNotes: ['OKX proof of reserves is a point-in-time cryptographic reserve-and-liability disclosure, not a full financial-statement audit.', 'Penalty, forfeiture, global platform assets and reserve ratios are separate measures and are never added together.'],
  unknowns: ['Consolidated audited liabilities and profitability across OKX entities', 'Organic customer retention after U.S. and EU restructuring', 'Net economic value delivered to OKB holders', 'Outcome of the compliance consultant engagement after February 2027'],
  unsourcedFields: ['Consolidated audit', 'Entity-level profit', 'Customer retention', 'Future consultant findings'],
  sections: {
    what_it_is: section('OKX is a global custodial exchange offering spot, derivatives and other crypto services through jurisdiction-specific companies. The brand also offers a self-custody wallet, but wallet users control their own keys while exchange users rely on an OKX entity. Aux Cayes Fintech operated the international venue named in the 2025 U.S. criminal case. Separate U.S. and European entities later launched or expanded under local rules.', [claim('OKX runs a custodial multi-product exchange through multiple legal entities.', ['doj', 'us-launch', 'mica'], 'Authority and entity descriptions.'), claim('OKX Wallet is a separate self-custody product from the exchange.', ['us-launch'], 'U.S. product launch description.'), claim('The guilty plea applies to Aux Cayes, not automatically to every later OKX entity.', ['doj', 'plea', 'mica'], 'Named defendant and separate entity records.', { kind: 'inference' })]),
    what_happened: section('Aux Cayes Fintech pleaded guilty in February 2025 to operating an unlicensed money-transmitting business. It agreed to forfeit about $420.3 million, pay a fine of about $84.4 million and keep an external compliance consultant through February 2027. OKX then launched a U.S. exchange and wallet under a separate U.S. structure and expanded in Europe through a MiCA-authorized company. In July 2026, OKX’s reserve page reported $23.12 billion in primary assets.', [claim('Aux Cayes pleaded guilty and accepted more than $504 million of fine and forfeiture.', ['doj', 'plea', 'reuters'], 'Criminal resolution and independent report.'), claim('A separate U.S. exchange and wallet launched in April 2025.', ['us-launch', 'doj'], 'Launch announcement and DOJ affiliate boundary.'), claim('OKX reported $23.12 billion in primary reserve assets in its 45th report.', ['por'], 'Current operator reserve page.')]),
    why_this_outcome: section('OKX grew by offering a broad product set across many markets, but it also served U.S. users through an unregistered offshore entity and failed to maintain the required controls. The resulting criminal case imposed a large cost and forced a compliance reset. The brand survived because it had global scale, liquidity and enough capital to pay the resolution while building separate regulated entities. Survival does not convert past control failures into success; it shows that remediation and distribution can preserve a franchise after enforcement.', [claim('The DOJ documented U.S. access and control failures at Aux Cayes.', ['doj', 'plea'], 'Plea facts and authority account.'), claim('Scale and continued products supported operating continuity after the penalty.', ['trusted', 'por', 'us-launch'], 'Current platform and expansion evidence.', { kind: 'inference' }), claim('The public record does not isolate how much business the enforcement action displaced.', ['doj', 'trusted', 'us-launch'], 'No entity-level customer-retention series.', { kind: 'unknown' })]),
    strategic_choices: section('OKX chose offshore global expansion before it had a compliant U.S. entry, then changed course. After the plea it kept a consultant, relaunched in America under a separate structure, used a licensed European company and continued publishing reserve proofs. That strategy preserves access but creates a complex legal map: users must know which entity, rules and custody terms apply. The choice to keep both a centralized exchange and self-custody wallet adds distribution while increasing identity confusion.', [claim('Aux Cayes expanded into U.S. business without the required registration.', ['doj', 'plea'], 'Admitted offense.'), claim('OKX later chose jurisdiction-specific U.S. and European structures.', ['us-launch', 'mica'], 'Current entity strategy.'), claim('Monthly reserve publication is a transparency choice with limited scope.', ['por'], 'Operator methodology and disclaimer.', { kind: 'inference' })]),
    operating_model: section('The exchange earns trading and service fees while custodying customer assets and matching orders off-chain. Product availability varies by entity and country. OKX publishes wallet ownership, customer-liability proofs and reserve ratios for selected assets; users can verify inclusion with its tools. The report is useful for checking the snapshot, but it does not show all corporate liabilities, future withdrawals, profit or whether every affiliate can transfer capital to another.', [claim('OKX exchange users rely on custodial account and wallet infrastructure.', ['por', 'us-launch'], 'Exchange and reserve descriptions.'), claim('The reserve system covers selected asset liabilities and wallet balances at a snapshot.', ['por'], 'Published methodology and disclaimer.'), claim('Proof of reserves is not a consolidated audit or guarantee of future liquidity.', ['por', 'doj'], 'Scope and legal-entity limits.', { kind: 'inference' })]),
    token_and_value_capture: section('OKB is the OKX ecosystem token and appears in the exchange’s reserve report, but it is not stock in Aux Cayes, OKX US or OKX Europe. Token demand can come from exchange uses, discounts or ecosystem programs, while price and holder value remain exposed to centralized policy and market demand. The reviewed sources do not establish a fixed legal claim on consolidated fees or profits. Regulatory licences and reserve assets belong to named companies, not automatically to OKB holders.', [claim('OKB is included as an asset and liability in the OKX reserve report.', ['por'], 'Current reserve table.'), claim('OKB is not identified as equity in the named OKX legal entities.', ['plea', 'mica', 'us-launch'], 'Corporate and token boundary.', { kind: 'inference' }), claim('A fixed consolidated profit claim for OKB holders is not established in the reviewed sources.', ['por', 'trusted'], 'Disclosure gap.', { kind: 'unknown' })]),
    counterfactual: section('Registering the U.S. business earlier, blocking prohibited access consistently and testing sales incentives against compliance rules could have avoided the admitted unlicensed activity. That might have slowed growth and removed some volume, but it would have reduced the $504 million resolution and reputational cost. A simpler entity map could also make customer protections easier to understand. These controls address the documented failure; they cannot prove OKX would have achieved the same global scale.', [claim('Earlier registration and effective geofencing address the conduct described by the DOJ.', ['doj', 'plea'], 'Documented failure and remediation.', { kind: 'inference' }), claim('A simpler entity map could improve customer understanding.', ['us-launch', 'mica', 'doj'], 'Observed multi-entity structure.', { kind: 'inference' }), claim('The growth outcome under stricter early controls is unknowable.', ['doj', 'trusted'], 'Unobserved alternative.', { kind: 'unknown' })]),
    risks_and_unknowns: section('Key risks are entity complexity, future enforcement, derivatives leverage, custody, token dependence and over-reading reserve snapshots. Proof of reserves is not a financial-statement audit and does not prove every corporate liability. The consultant engagement runs through February 2027, so remediation is still active. EU and U.S. licences cover named entities and products, not the entire brand. Users should confirm the company, products, withdrawal path and current reserve report.', [claim('The compliance consultant remains required through February 2027.', ['doj', 'plea', 'reuters'], 'Plea condition.'), claim('Licences and customer protections are entity-specific.', ['us-launch', 'mica'], 'Separate legal structures.'), claim('Consolidated liabilities and post-remediation findings remain unknown.', ['por', 'doj'], 'Public disclosure limits.', { kind: 'unknown' })]),
    lifecycle: section('OKX grew internationally under the OKEx and OKX names, built spot and derivatives businesses and added the OKB token and wallet. The U.S. case culminated in the February 2025 Aux Cayes guilty plea and a resolution above $504 million. Instead of exiting, the brand launched a separate U.S. operation and expanded through a MiCA-authorized European entity. Current reserve and product pages show continuing scale. The right call is operating regulatory pivot, not collapse and not clean success.', [claim('The 2025 plea was a material regulatory break in the international venue’s lifecycle.', ['doj', 'reuters'], 'Criminal resolution.'), claim('U.S. and European regulated expansion followed the resolution.', ['us-launch', 'mica'], 'Dated entity launches.'), claim('Current reserve and product disclosures support continuing operation.', ['por', 'trusted'], 'Current operator surfaces.')]),
    outlook_and_watch: section('Watch the consultant’s work through February 2027, entity-level licence status, withdrawals, reserve ratios, derivatives exposure, customer retention and OKB economics. Improvement means consistent controls and independently verifiable customer protection across the entities that actually hold assets. Deterioration would appear as new enforcement, shrinking access, unexplained reserve changes or reliance on token incentives to mask weaker organic demand. A reserve report should trigger questions, not end them.', [claim('Consultant completion and licence status are direct regulatory watch items.', ['doj', 'mica'], 'Active obligations and entities.', { kind: 'inference' }), claim('Reserve ratios and withdrawal performance are direct custody watch items.', ['por'], 'Published snapshot methodology.', { kind: 'inference' }), claim('Organic customer retention and consolidated profit remain unknown.', ['trusted', 'por'], 'Marketing and reserve data do not answer them.', { kind: 'unknown' })]),
  },
  metrics: [
    metric('criminal-forfeiture', 'regulatory_fines', 'Criminal forfeiture', 420300000, ['doj', 'plea'], 'Plea and sentencing amount.', { asOf: '2025-02-24', window: 'criminal resolution', scope: 'Aux Cayes Fintech Co. Ltd.', qualityFlags: ['entity_specific', 'forfeiture_not_fine', 'not_additive_to_platform_assets'] }),
    metric('criminal-fine', 'regulatory_fines', 'Criminal fine', 84400000, ['doj', 'plea'], 'Plea and sentencing amount.', { asOf: '2025-02-24', window: 'criminal resolution', scope: 'Aux Cayes Fintech Co. Ltd.', qualityFlags: ['entity_specific'] }),
    metric('por-primary-assets', 'customer_assets', 'Primary assets in 45th proof of reserves', 23120000000, ['por'], 'Operator-reported reserve snapshot.', { asOf: '2026-07-07', window: '45th reserve snapshot', scope: 'Primary assets in OKX proof-of-reserves scope', qualityFlags: ['operator_reported', 'snapshot_not_audit', 'scope_selected_assets', 'not_all_customer_assets'] }),
    metric('btc-reserve-ratio', 'reserve_coverage', 'BTC reserve ratio', 105, ['por'], 'Wallet assets divided by account assets in the report.', { asOf: '2026-07-07', window: '45th reserve snapshot', scope: 'BTC in OKX proof-of-reserves scope', unit: 'percent', currency: null, qualityFlags: ['operator_reported', 'snapshot'] }),
  ],
  events: [
    event('guilty-plea', 'criminal_resolution', '2025-02-24', 'Aux Cayes Fintech pleaded guilty to operating an unlicensed money-transmitting business.', ['doj', 'plea', 'reuters'], 'Authority and independent records.'),
    event('us-launch', 'regulated_expansion', '2025-04-16', 'OKX launched a separate U.S. exchange and wallet operation with a San Jose headquarters.', ['us-launch'], 'Operator launch record.'),
    event('mica-licence', 'licence', '2025-01-27', 'OKX Europe Limited received its MiCA authorization from the Malta regulator.', ['mica'], 'Current European entity description.'),
    event('por-45', 'reserve_disclosure', '2026-07-07', 'OKX published its 45th proof-of-reserves report.', ['por'], 'Current reserve report and downloadable file date.'),
  ],
  feature: { lifecycle: 'mid', operating_model: 'Global custodial spot and derivatives exchange operating through jurisdiction-specific entities.', product_cohort: 'global_multi_product_custodial_exchange', custody_model: 'custodial', token_status: 'launched', token_symbol: 'OKB', token_launch_date: null, token_launch_timing: 'post_product', token_strategy: 'venue_utility_and_ecosystem_token_without_verified_equity_rights', token_source_url: 'https://www.okx.com/en-eu/proof-of-reserves', metric_type: 'customer_assets', metric_unit: 'usd', metric_window: 'point_in_time_snapshot', metric_as_of: '2026-07-07', metric_observed_at: OBSERVED_AT, comparability_key: 'cex|global_multi_product_custodial_exchange|customer_assets|usd|point_in_time_snapshot' },
};

const wazirxSources = [
  source('wazirx', 'incident', 'WazirX multisig wallet incident report', 'https://wazirx.com/blog/preliminary-report-cyber-attack-on-wazirx-multisig-wallet/', 'WazirX', { publishedAt: '2024-07-18', locator: 'Wallet configuration, signers, third-party custody workflow and reported loss.' }),
  source('wazirx', 'collateral', 'WazirX update on the cyber attack and customer assets', 'https://wazirx.com/blog/important-update-cyber-attack-incident-and-measures-to-protect-your-assets/', 'WazirX', { publishedAt: '2024-07-21', locator: 'Reported loss above $230 million and acknowledged loss of one-to-one collateral.' }),
  source('wazirx', 'liminal', 'Liminal response to the WazirX incident', 'https://www.liminalcustody.com/blog/liminal-remains-secure-amidst-sophisticated-attack/', 'Liminal Custody', { publishedAt: '2024-07-29', role: 'primary', locator: 'Interested counterparty account of wallet ownership, infrastructure and disputed responsibility.' }),
  source('wazirx', 'scheme', 'WazirX scheme of arrangement becomes effective', 'https://wazirx.com/blog/the-scheme-of-arrangement-is-now-effective/', 'WazirX', { publishedAt: '2025-10-16', locator: 'Zettai entity, court sanction date, effective date and liability-over-assets statement.' }),
  source('wazirx', 'recovery-token', 'WazirX recovery-token allocation complete', 'https://wazirx.com/blog/recovery-tokens-explained/', 'WazirX', { publishedAt: '2026-01-09', locator: 'First distribution, approved-claim valuation and recovery-token allocation.' }),
  source('wazirx', 'futures', 'WazirX launches crypto futures', 'https://wazirx.com/blog/wazirx-launches-crypto-futures/', 'WazirX', { publishedAt: '2026-05-13', locator: 'Futures launch, fees and stated recovery-token profit linkage.' }),
  source('wazirx', 'h1', 'WazirX H1 2026 transparency report', 'https://wazirx.com/blog/wazirx-transparency-report-h1-2026/', 'WazirX', { publishedAt: '2026-07-27', locator: 'Current product activity, recovery-token completion and operating claims.' }),
  source('wazirx', 'coindesk', 'Singapore court clears WazirX restructuring', 'https://www.coindesk.com/markets/2025/10/13/wazirx-restructuring-cleared-in-massive-relief-for-usd230m-hack-victims', 'CoinDesk', { publishedAt: '2025-10-13', tier: 'B', role: 'independent', locator: 'Independent court, restart and loss context.' }),
  source('wazirx', 'moneycontrol-futures', 'WazirX enters crypto futures trading after its restart', 'https://www.moneycontrol.com/news/business/startup/wazirx-enters-crypto-futures-trading-eyes-50-revenue-contribution-from-the-offering-13917685.html', 'Moneycontrol', { publishedAt: '2026-05-13', tier: 'B', role: 'independent', locator: 'Independent confirmation of current operation, futures launch, initial market count and leverage terms.' }),
  source('wazirx', 'bombay-court', 'Zanmai Labs Private Limited v. Bitcipher Labs LLP', 'https://indiankanoon.org/doc/156121593/', 'Bombay High Court via Indian Kanoon', { publishedAt: '2025-10-07', locator: 'Indian entity, user relationship and cross-border scheme questions.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('wazirx', 'liminal-dispute', 'Liminal follow-up on the WazirX incident', 'https://www.liminalcustody.com/blog/wazirx-incident-update-response-to-ongoing-disinformation-campaign/', 'Liminal Custody', { publishedAt: '2024-10-22', role: 'primary', locator: 'Interested counterparty statement explicitly disputing technical and responsibility claims.' }),
];

const wazirx = {
  slug: 'wazirx', name: 'WazirX', aliases: ['Zettai Pte. Ltd.', 'Zanmai Labs'], table: 'mid_exchanges',
  operatingState: 'operating_restructured', outcome: 'recovering_after_custody_failure', outcomeConfidence: 'high', qualityConfidence: 'high',
  classification: { subtype: 'Indian-market custodial exchange operating after a court-approved restructuring', tags: ['custodial', 'spot', 'futures', 'hack_recovery', 'scheme_of_arrangement', 'venue_token'], chains: [], jurisdictions: ['India', 'Singapore'] },
  sources: wazirxSources,
  statusAssertion: 'WazirX was operating spot and futures products after its restructuring at the review date.', statusSourceKeys: ['recovery-token', 'futures', 'h1', 'moneycontrol-futures'], statusEvidenceLocator: 'Current operator activity and independently confirmed product-launch records.',
  outcomeAssertion: 'WazirX is classified as recovering after a custody failure, not fully restored and not permanently closed.', outcomeSourceKeys: ['incident', 'scheme', 'recovery-token', 'futures', 'coindesk'], outcomeEvidenceLocator: 'Loss, court scheme, first distribution and resumed products.',
  identityBoundary: 'WazirX is a brand used across an Indian operating relationship involving Zanmai Labs and a Singapore restructuring by Zettai. Those entities and customer claims must not be collapsed into one unqualified company. Liminal was a custody-workflow provider and disputes WazirX’s account of responsibility. WRX is the pre-existing venue token; scheme Recovery Tokens are separate creditor instruments.',
  methodologyNotes: ['WazirX and Liminal give conflicting incident accounts; Chaindump reports the shared facts and leaves disputed attribution unresolved.', 'The first distribution is measured at scheme reference prices, not at each user’s original deposit value or current market value.'],
  unknowns: ['Final technical allocation of responsibility for the wallet compromise', 'Cash value ultimately realized by Recovery Token holders', 'Post-restart reserves, withdrawals, users and organic volume', 'How Indian and Singapore entity obligations interact for every creditor'],
  unsourcedFields: ['Final incident attribution', 'Final recovery value', 'Audited post-restart reserves', 'Entity-wide claim map'],
  sections: {
    what_it_is: section('WazirX is a custodial crypto exchange focused on Indian users. It matches trades off-chain, controls customer account balances and now offers spot and futures products. Its operating and restructuring story spans Zanmai Labs in India and Zettai in Singapore, so the brand is not one simple legal entity. WRX is the older venue token; Recovery Tokens represent contingent scheme claims and are a different instrument.', [claim('WazirX operates custodial trading products for Indian-market users.', ['futures', 'h1', 'bombay-court'], 'Current products and entity relationship.'), claim('Zettai used a Singapore scheme to restructure platform liabilities.', ['scheme', 'coindesk'], 'Scheme and court reporting.'), claim('WRX and scheme Recovery Tokens are different instruments.', ['recovery-token', 'h1'], 'Operator recovery-token description.', { kind: 'inference' })]),
    what_happened: section('On July 18, 2024, an attacker took more than $230 million from one multisignature wallet. WazirX said three of its signers and one Liminal signer approved a transaction that changed control; Liminal says its infrastructure remained secure and points to a customer-side compromise. The loss broke one-to-one collateral and halted normal operations. A Singapore court later sanctioned an amended scheme. WazirX restarted, distributed about 85% of approved claims at reference prices, allocated Recovery Tokens and launched futures in May 2026.', [claim('The July 2024 wallet loss exceeded $230 million.', ['incident', 'collateral', 'coindesk'], 'Operator and independent loss reports.'), claim('WazirX and Liminal dispute where responsibility lies.', ['incident', 'liminal', 'liminal-dispute'], 'Conflicting first-party accounts.', { kind: 'unknown' }), claim('The scheme, first distribution and product restart followed the loss.', ['scheme', 'recovery-token', 'futures'], 'Dated recovery milestones.')]),
    why_this_outcome: section('A multisignature threshold did not prevent failure because multiple signers relied on the same transaction context and a shared custody interface. Too much customer value sat behind one operational workflow, so one successful control change became a system-wide solvency event. The exchange recovered because creditors accepted a court-supervised sharing of the loss and the product still had a brand, users and a route to resume trading. Recovery shifted part of the remaining risk to creditors through Recovery Tokens.', [claim('The wallet required WazirX and Liminal approvals yet was still compromised.', ['incident', 'liminal'], 'Shared wallet and signing facts.'), claim('Concentration made one workflow failure large enough to impair collateral.', ['collateral', 'incident'], 'Loss and collateral acknowledgement.', { kind: 'inference' }), claim('Court restructuring and creditor instruments enabled a restart without full immediate repayment.', ['scheme', 'recovery-token', 'coindesk'], 'Observed scheme design.', { kind: 'inference' })]),
    strategic_choices: section('WazirX chose a six-signer multisig workflow using hardware wallets and a third-party interface, but substantial assets remained concentrated in that setup. After the attack it chose a collective scheme instead of preserving each unaffected asset claim one-for-one. It then tied future Recovery Token value partly to recoveries and profits from restarted products, including futures. Those choices restored operations faster while leaving customers exposed to execution, market and legal risk.', [claim('The wallet used six signers and a four-approval workflow.', ['incident'], 'Operator technical report.'), claim('The scheme pooled loss and returned an initial reference-price distribution.', ['scheme', 'recovery-token'], 'Operator scheme implementation.'), claim('Futures profit is intended to support additional Recovery Token recoveries.', ['futures'], 'Operator product announcement.')]),
    operating_model: section('WazirX earns trading fees from custodial spot and futures accounts. The futures product advertises a 0.02% maker fee and 0.04% taker fee, with profits intended in part for additional creditor recovery. That creates a direct link between restarted activity and the scheme, but it does not guarantee a distribution or disclose net profit after incentives and operating costs. Current marketing and product updates prove availability, not independently audited reserves or reliable withdrawals.', [claim('WazirX charges maker and taker fees on its futures product.', ['futures'], 'Published fee schedule.'), claim('Operator statements link futures profits to additional creditor recovery.', ['futures', 'recovery-token'], 'Product and scheme descriptions.'), claim('Current product activity does not prove audited reserve sufficiency.', ['h1', 'collateral'], 'Marketing and historical impairment limits.', { kind: 'inference' })]),
    token_and_value_capture: section('WRX existed before the hack as the venue’s exchange token. The restructuring did not turn WRX into a creditor claim. Recovery Tokens were allocated to eligible scheme creditors after the first distribution and represent contingent participation in future recoveries or designated value. They are not cash, a guaranteed payment or proof that the residual loss has been made whole. Any value depends on asset recovery, operating results and scheme execution.', [claim('Recovery Tokens were allocated after the first distribution under the scheme.', ['recovery-token', 'h1'], 'Operator allocation record.'), claim('Recovery Tokens are distinct from the older WRX venue token.', ['recovery-token', 'futures'], 'Instrument and product descriptions.', { kind: 'inference' }), claim('Final cash value for Recovery Token holders is not known.', ['recovery-token', 'futures'], 'Contingent future mechanism.', { kind: 'unknown' })]),
    counterfactual: section('Smaller wallet limits, independent transaction-intent displays, signer separation across networks, withdrawal circuit breakers and tested recovery keys could have reduced the blast radius. A four-of-six threshold was not enough when signers approved the same malicious context. After the loss, a transparent entity and asset map could have reduced litigation and creditor confusion. These controls address observed weaknesses without resolving whether WazirX or Liminal caused the compromise.', [claim('Smaller wallet concentration would reduce maximum loss from one workflow.', ['incident', 'collateral'], 'Observed concentration and loss.', { kind: 'inference' }), claim('Independent intent verification could protect signers from a shared false transaction view.', ['incident', 'liminal'], 'Disputed interface context.', { kind: 'inference' }), claim('No reviewed evidence proves one control would have prevented the attacker.', ['incident', 'liminal-dispute'], 'Attribution and counterfactual remain unresolved.', { kind: 'unknown' })]),
    risks_and_unknowns: section('The main risks are incomplete creditor recovery, custodial concentration, derivatives leverage, entity complexity and trust after restart. WazirX and Liminal disagree about technical responsibility for the incident, so this report does not treat either account as a final finding. The 85% first distribution uses scheme reference values and is not 85 cents of current value for every user. Recovery Token timing and value remain unknown. Users should verify withdrawals, entity, reserves and scheme reports.', [claim('The first distribution represented about 85% of approved claims at reference prices.', ['recovery-token'], 'Operator scheme measurement.'), claim('Incident responsibility remains disputed between WazirX and Liminal.', ['incident', 'liminal', 'liminal-dispute'], 'Conflicting accounts.', { kind: 'unknown' }), claim('Final recovery, audited reserves and post-restart user quality remain unknown.', ['h1', 'recovery-token'], 'Current disclosure gaps.', { kind: 'unknown' })]),
    lifecycle: section('WazirX grew as a major Indian exchange, launched WRX and relied on a shared multisignature custody workflow. The July 2024 attack removed more than $230 million and interrupted normal trading. Zettai pursued a Singapore scheme, won sanction in October 2025 and made the first distribution after the platform restarted. Recovery Tokens followed in January 2026 and futures opened in May. WazirX is an unusual recovery case: alive again, but still carrying creditor and trust obligations from the failure.', [claim('The 2024 attack caused a collateral and operating break.', ['collateral', 'incident'], 'Loss and operator response.'), claim('The court-sanctioned scheme became effective in October 2025.', ['scheme', 'coindesk'], 'Scheme and independent court report.'), claim('Recovery-token allocation and futures launch show post-restart operation.', ['recovery-token', 'futures', 'h1'], 'Dated operator milestones.')]),
    outlook_and_watch: section('Watch actual Recovery Token purchases or distributions, recovered assets, audited reserves, withdrawal completion, organic spot and futures volume, customer retention and court developments. Recovery improves if operating profit and recovered assets produce measurable creditor payments without recreating concentrated custody risk. It weakens if tokens substitute for cash indefinitely, withdrawals become restricted or new products add leverage faster than controls mature. Current operation is meaningful, but it is not the same as complete recovery.', [claim('Realized creditor distributions are the primary recovery signal.', ['recovery-token', 'futures'], 'Scheme and profit-linkage design.', { kind: 'inference' }), claim('Reserves, withdrawals and custody controls are the primary operating signals.', ['incident', 'collateral', 'h1'], 'Failure mode and current claims.', { kind: 'inference' }), claim('Organic volume, retention and final creditor value remain unknown.', ['h1', 'recovery-token'], 'No independent current series.', { kind: 'unknown' })]),
  },
  metrics: [
    metric('reported-hack-loss', 'customer_shortfall', 'Reported wallet theft', 230000000, ['incident', 'collateral', 'coindesk'], 'Operator minimum and independent incident reporting.', { asOf: '2024-07-18', window: 'incident estimate', scope: 'One WazirX multisignature wallet', qualityFlags: ['reported_minimum', 'not_final_customer_shortfall', 'not_final_forensic_allocation'] }),
    metric('first-distribution', 'creditor_recovery', 'First distribution share of approved claims', 85, ['recovery-token'], 'Operator-reported share at scheme reference prices.', { asOf: '2025-11-07', window: 'first scheme distribution', scope: 'Eligible approved scheme claims', unit: 'percent', currency: null, qualityFlags: ['reference_price_basis', 'operator_reported', 'not_final_recovery'] }),
  ],
  events: [
    event('wallet-attack', 'custody_failure', '2024-07-18', 'An attacker removed more than $230 million from a WazirX multisignature wallet.', ['incident', 'collateral', 'liminal'], 'Shared incident facts despite disputed attribution.'),
    event('scheme-effective', 'restructuring', '2025-10-15', 'Zettai’s amended scheme became effective after Singapore court sanction.', ['scheme', 'coindesk'], 'Scheme and court reporting.'),
    event('recovery-tokens', 'creditor_distribution', '2026-01-09', 'WazirX completed allocation of Recovery Tokens to eligible users.', ['recovery-token'], 'Operator allocation record.'),
    event('futures-launch', 'product_relaunch', '2026-05-13', 'WazirX launched futures trading and linked future profit to creditor recovery.', ['futures'], 'Operator product announcement.'),
  ],
  feature: { lifecycle: 'mid', operating_model: 'Indian-market custodial spot and futures exchange operating after a Singapore restructuring.', product_cohort: 'restructured_custodial_exchange', custody_model: 'custodial', token_status: 'launched', token_symbol: 'WRX', token_launch_date: null, token_launch_timing: 'post_product', token_strategy: 'venue_token_separate_from_scheme_recovery_tokens', token_source_url: 'https://wazirx.com/blog/recovery-tokens-explained/', metric_type: 'customer_shortfall', metric_unit: 'usd', metric_window: 'incident_estimate', metric_as_of: '2024-07-18', metric_observed_at: OBSERVED_AT, comparability_key: 'cex|restructured_custodial_exchange|customer_shortfall|usd|incident_estimate' },
};

const fcoinSources = [
  source('fcoin', 'operator-model', 'FCoin describes trans-fee mining and revenue distribution', 'https://www.prnewswire.com/news-releases/trans-fee-mining-model-fcoin-the-chinese-cryptocurrency-exchange-is-leading-the-industry-300699262.html', 'FCoin via PR Newswire', { publishedAt: '2018-08-20', locator: 'Operator description of FT supply, fee rebates and 80% daily revenue distribution.' }),
  source('fcoin', 'operator-guide', 'FCoin guide to FT and trans-fee mining', 'https://medium.com/@fcoin_asia/fcoin-guide-answering-the-most-frequently-asked-questions-9e9b6f38c690', 'FCoin Asia', { publishedAt: '2018-06-26', locator: 'Operator token, governance and revenue-share mechanics.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('fcoin', 'coindesk-model', 'FCoin draws fire for controversial business model', 'https://www.coindesk.com/markets/2018/06/22/fcoin-crypto-exchange-draws-fire-for-controversial-business-model', 'CoinDesk', { publishedAt: '2018-06-22', tier: 'B', role: 'independent', locator: 'Independent launch-volume, incentive and wash-trading concerns.' }),
  source('fcoin', 'theblock-default', 'FCoin expects to default on user bitcoin', 'https://www.theblock.co/post/56191/cryptocurrency-exchange-fcoin-expects-to-default-on-as-much-as-125m-of-users-bitcoin', 'The Block', { publishedAt: '2020-02-17', tier: 'B', role: 'independent', locator: 'Founder-announced shortfall range, accounting explanation and shutdown context.', directHttpStatus: 403, accessMethod: 'browser_or_paywalled_page' }),
  source('fcoin', 'coindesk-insolvency', 'FCoin insolvent after revealing bitcoin shortfall', 'https://www.coindesk.com/markets/2020/02/17/crypto-exchange-fcoin-insolvent-after-revealing-up-to-130m-bitcoin-shortfall', 'CoinDesk', { publishedAt: '2020-02-17', tier: 'B', role: 'independent', locator: 'Independent shortfall, withdrawal and founder-letter reporting.' }),
  source('fcoin', 'ciphertrace', 'CipherTrace cryptocurrency crime and anti-money laundering report', 'https://downloads.regulations.gov/OCC-2019-0028-0012/attachment_1.pdf', 'CipherTrace via Regulations.gov', { publishedAt: '2020-06-01', tier: 'B', role: 'independent', locator: 'Industry report summary of the insolvency and founder-stated liability.', directHttpStatus: 403, accessMethod: 'browser_rendered_pdf' }),
  source('fcoin', 'cryptocompare', 'CryptoCompare exchange review July 2018', 'https://www.cryptocompare.com/media/34477968/exchange-review-july-2018.pdf', 'CryptoCompare', { publishedAt: '2018-07-31', tier: 'B', role: 'independent', locator: 'Contemporary FT, trans-fee-mining start and reported-volume context.' }),
];

const fcoin = {
  slug: 'fcoin', name: 'FCoin', aliases: ['FCoin Exchange', 'FT Exchange'], table: 'dead_exchanges',
  operatingState: 'closed', outcome: 'failed_insolvent_unresolved', outcomeConfidence: 'medium', qualityConfidence: 'medium',
  classification: { subtype: 'closed custodial exchange built around transaction-fee mining', tags: ['custodial', 'spot', 'transaction_fee_mining', 'venue_token', 'insolvency', 'closed'], chains: [], jurisdictions: ['China-linked'] },
  sources: fcoinSources,
  statusAssertion: 'FCoin closed after announcing an unpayable customer-asset shortfall in February 2020.', statusSourceKeys: ['theblock-default', 'coindesk-insolvency', 'ciphertrace'], statusEvidenceLocator: 'Contemporary founder-announcement reporting and later industry review.',
  outcomeAssertion: 'FCoin is classified as a failed insolvent exchange with unresolved recovery and attribution.', outcomeSourceKeys: ['operator-model', 'coindesk-model', 'theblock-default', 'coindesk-insolvency'], outcomeEvidenceLocator: 'Token incentive design, admitted shortfall and no verified relaunch.',
  identityBoundary: 'FCoin was a custodial exchange founded by Zhang Jian and used FT as its venue token. It is unrelated to similarly named coins or later projects. Founder statements about accounting failures are attributed statements, not an audited explanation. Researcher or community use of “exit scam” is an allegation; the reviewed record does not establish a criminal conviction or final legal finding.',
  methodologyNotes: ['The 7,000-to-13,000 BTC shortfall range is a founder-reported estimate carried by independent reporting, not an audited final claim ledger.', 'Headline trading volume generated under token rebates is not treated as organic demand or economic profit.'],
  unknowns: ['Final customer-claim ledger and asset balance', 'Amount, if any, ultimately repaid', 'Whether misconduct contributed beyond admitted accounting and decision failures', 'Final legal status of the operator and founder'],
  unsourcedFields: ['Final claims', 'Verified repayments', 'Legal disposition', 'Organic user volume'],
  sections: {
    what_it_is: section('FCoin was a custodial spot exchange launched in 2018 by former Huobi executive Zhang Jian. Its central product was transaction-fee mining: users paid trading fees and received newly issued FT tokens in return. FT holders were promised most daily exchange-fee revenue and governance participation. That made the token, reported volume and exchange liabilities part of one reflexive system rather than separate products.', [claim('FCoin launched as a custodial exchange in 2018.', ['operator-model', 'coindesk-model'], 'Operator and independent launch descriptions.'), claim('Trading fees were rebated with newly issued FT tokens.', ['operator-model', 'operator-guide', 'coindesk-model'], 'Published mechanism.'), claim('FT holders were offered revenue distribution and governance claims.', ['operator-model', 'operator-guide'], 'Operator token description.')]),
    what_happened: section('The incentive model produced very high reported volume soon after launch, while critics warned that fee rebates rewarded repeated or wash-like trading. In February 2020, Zhang announced that FCoin could not meet customer withdrawals and estimated a shortfall between 7,000 and 13,000 BTC, then worth roughly $67 million to $125 million. The venue closed. The reviewed record does not provide a complete audited ledger, verified customer payout or authoritative final legal disposition.', [claim('Transaction-fee mining drove unusually high reported launch volume.', ['coindesk-model', 'cryptocompare'], 'Contemporary exchange and market reviews.'), claim('The founder reported a 7,000-to-13,000 BTC shortfall in February 2020.', ['theblock-default', 'coindesk-insolvency', 'ciphertrace'], 'Contemporary reporting of founder statement.'), claim('A complete final repayment and legal record was not found.', ['theblock-default', 'coindesk-insolvency'], 'Reviewed record ends with unresolved obligations.', { kind: 'unknown' })]),
    why_this_outcome: section('FCoin rewarded trading with FT while promising FT holders up to 80% of daily fee revenue. That encouraged activity, but it also made issuance, trading volume and liabilities feed each other. The founder later blamed data errors and operating decisions for balances the exchange could not honor. Without an independent reserve, reconciliation or administrator record, the exact cause remains uncertain. The strongest supported conclusion is that reflexive incentives scaled faster than custody and accounting controls.', [claim('The model linked token issuance to trading and fee revenue.', ['operator-model', 'operator-guide', 'coindesk-model'], 'Published incentive mechanics.'), claim('The founder attributed the shortfall to data and decision errors.', ['theblock-default', 'coindesk-insolvency'], 'Attributed founder explanation.', { confidence: 'medium' }), claim('The record does not prove that accounting failure was the only cause.', ['theblock-default', 'ciphertrace'], 'No audited final forensic account.', { kind: 'unknown' })]),
    strategic_choices: section('FCoin chose to refund fees in FT, distribute 80% of fee revenue to token holders and market the resulting volume as a growth breakthrough. It expanded the incentive before publishing a durable reserve and liability-reconciliation system. Those choices made low-quality volume look valuable and reduced the cash retained for operations. When the books diverged from assets, the founder remained the central source of information instead of an independent administrator.', [claim('FCoin chose fee rebates and an 80% token-holder revenue distribution.', ['operator-model', 'operator-guide'], 'Operator mechanics.'), claim('The model encouraged frequent trading to obtain more FT.', ['operator-model', 'coindesk-model'], 'Operator and independent descriptions.'), claim('No independent administrator or audited reconciliation is identified in the reviewed closure record.', ['theblock-default', 'coindesk-insolvency'], 'Closure disclosure gap.', { kind: 'unknown' })]),
    operating_model: section('FCoin custodyed customer assets, matched trades internally and issued FT against fees. Most reported fee revenue was distributed to token holders, leaving the exchange dependent on continued activity and correct liability accounting. A trader could cycle volume to earn tokens, so notional volume overstated durable customer demand. The 2020 shortfall showed that internal balances could not be converted into available withdrawals. Public estimates do not establish which wallets, assets or users bore each loss.', [claim('FCoin combined custodial trading with token rebates.', ['operator-model', 'coindesk-model'], 'Business-model descriptions.'), claim('High reported volume could include incentive-driven cycling rather than organic demand.', ['coindesk-model', 'cryptocompare'], 'Contemporary market concern.', { kind: 'inference' }), claim('The final allocation of losses among customers remains unknown.', ['theblock-default', 'coindesk-insolvency'], 'No final claimant ledger.', { kind: 'unknown' })]),
    token_and_value_capture: section('FT was central to FCoin from launch. A 10 billion supply was announced, with 51% intended for transaction-fee mining, and eligible FT holders were promised 80% of daily fee revenue. That created a visible value-capture story but also depended on the exchange continuing to trade, reconcile and pay. When withdrawals failed, token rights could not replace the missing assets. The current record does not establish surviving legal, recovery or governance rights for FT holders.', [claim('FCoin announced a 10 billion FT supply and 51% mining allocation.', ['operator-model'], 'Operator token specification.'), claim('Eligible FT holders were promised 80% of daily trading-fee revenue.', ['operator-model', 'operator-guide'], 'Operator revenue model.'), claim('Surviving FT recovery or governance rights are not established.', ['theblock-default', 'coindesk-insolvency'], 'Post-closure disclosure gap.', { kind: 'unknown' })]),
    counterfactual: section('FCoin could have capped token rebates, excluded self-trading, retained more fee revenue, reconciled every customer liability daily and published independent custody attestations before scaling. Those controls would probably have reduced headline volume, which was the product’s main distribution advantage. A court-supervised administrator after closure could also have created a verified claim and recovery record. None of these alternatives proves all losses would have been prevented.', [claim('Rebate caps and wash-trading controls directly address incentive cycling.', ['coindesk-model', 'operator-model'], 'Observed model supports the alternative.', { kind: 'inference' }), claim('Independent liability reconciliation could expose a gap before withdrawals fail.', ['theblock-default', 'coindesk-insolvency'], 'Founder-described accounting failure.', { kind: 'inference' }), claim('The prevention effect of those controls is unobserved.', ['theblock-default'], 'Counterfactual limit.', { kind: 'unknown' })]),
    risks_and_unknowns: section('FCoin is closed, so the main risks are stale domains or tokens, unverifiable repayment claims and unsupported accusations. The shortfall range is not a final loss number, and dollar conversions depend on the date used. Zhang was not shown in the reviewed record to have been convicted of stealing customer assets. Users and researchers should require a court, regulator, administrator or independently verified wallet record before changing recovery or misconduct conclusions.', [claim('The reported shortfall is a range, not a final audited loss.', ['theblock-default', 'coindesk-insolvency', 'ciphertrace'], 'Source measurement limits.'), claim('The reviewed record does not establish a criminal conviction for customer-asset theft.', ['theblock-default', 'coindesk-insolvency'], 'No authority outcome in reviewed sources.', { kind: 'unknown' }), claim('Repayment and legal disposition remain unresolved.', ['theblock-default', 'ciphertrace'], 'No later verified resolution.', { kind: 'unknown' })]),
    lifecycle: section('FCoin launched in May 2018 and quickly became a volume story through transaction-fee mining. FT issuance and revenue distribution attracted traders, while critics questioned whether the activity was economically real. Less than two years later, the founder announced a large bitcoin shortfall and FCoin stopped meeting withdrawals. No verified relaunch or comprehensive repayment followed in the reviewed record. The venue is failed and closed; its precise legal and recovery ending remains unresolved.', [claim('FCoin launched its token-incentive exchange in May 2018.', ['operator-model', 'cryptocompare'], 'Dated model history.'), claim('Withdrawal insolvency was announced in February 2020.', ['theblock-default', 'coindesk-insolvency'], 'Contemporary closure reporting.'), claim('No verified relaunch appears in the reviewed evidence.', ['theblock-default', 'ciphertrace'], 'Lifecycle record.', { kind: 'unknown' })]),
    outlook_and_watch: section('There is no operating outlook for FCoin. Watch for authoritative court or regulator records, a verified administrator, wallet distributions or a defensible claimant ledger. For other exchanges, discount volume when trading fees are refunded in newly issued venue tokens and demand proof of liabilities, reserves and anti-wash controls. FCoin’s most useful signal is structural: activity bought with emissions can disappear while customer balances remain real obligations.', [claim('Authoritative recovery and legal records are the only material FCoin watch items.', ['theblock-default', 'ciphertrace'], 'Current information gap.', { kind: 'inference' }), claim('Token-rebated volume needs separate quality controls before comparison.', ['operator-model', 'coindesk-model'], 'Observed incentive design.', { kind: 'inference' }), claim('Current customer recovery remains unknown.', ['theblock-default', 'coindesk-insolvency'], 'No final distribution evidence.', { kind: 'unknown' })]),
  },
  metrics: [
    metric('shortfall-low-btc', 'customer_shortfall', 'Founder-reported shortfall low estimate', 7000, ['theblock-default', 'coindesk-insolvency'], 'Lower bound reported from founder statement.', { asOf: '2020-02-17', window: 'announcement estimate', scope: 'FCoin customer obligations', unit: 'btc', currency: 'BTC', qualityFlags: ['founder_reported', 'range_low', 'not_final_claims'] }),
    metric('shortfall-high-btc', 'customer_shortfall', 'Founder-reported shortfall high estimate', 13000, ['theblock-default', 'coindesk-insolvency', 'ciphertrace'], 'Upper bound reported from founder statement.', { asOf: '2020-02-17', window: 'announcement estimate', scope: 'FCoin customer obligations', unit: 'btc', currency: 'BTC', qualityFlags: ['founder_reported', 'range_high', 'not_additive_to_low'] }),
  ],
  events: [
    event('launch', 'launch', '2018-05-21', 'FCoin launched trading with transaction-fee mining.', ['operator-model', 'cryptocompare'], 'Operator and market-review dates.'),
    event('model-scrutiny', 'market_signal', '2018-06-22', 'Independent reporting questioned whether token rebates inflated reported volume.', ['coindesk-model'], 'Contemporary independent analysis.'),
    event('insolvency', 'closure', '2020-02-17', 'FCoin announced a large bitcoin shortfall and inability to meet customer withdrawals.', ['theblock-default', 'coindesk-insolvency', 'ciphertrace'], 'Contemporary and later reporting.'),
  ],
  feature: { lifecycle: 'dead', operating_model: 'Closed custodial spot exchange built around transaction-fee mining and FT revenue distribution.', product_cohort: 'token_incentivized_custodial_exchange', custody_model: 'custodial', token_status: 'launched', token_symbol: 'FT', token_launch_date: '2018-05-21', token_launch_timing: 'at_or_near_launch', token_strategy: 'fee_rebate_emissions_and_exchange_revenue_distribution', token_source_url: 'https://www.prnewswire.com/news-releases/trans-fee-mining-model-fcoin-the-chinese-cryptocurrency-exchange-is-leading-the-industry-300699262.html', metric_type: 'customer_shortfall', metric_unit: 'btc', metric_window: 'announcement_estimate', metric_as_of: '2020-02-17', metric_observed_at: OBSERVED_AT, comparability_key: 'cex|token_incentivized_custodial_exchange|customer_shortfall|btc|announcement_estimate' },
};

const mtGoxSources = [
  source('mt-gox', 'company-found-wallet', 'Mt. Gox notice on approximately 200,000 BTC found in an old-format wallet', 'https://www.mtgox.com/img/pdf/20140320-btc-announce.pdf', 'MtGox Co., Ltd.', { publishedAt: '2014-03-20', locator: 'Company-reported original approximately 850,000 BTC gap and later discovery of approximately 200,000 BTC; historical operator statement, not a current estate balance.' }),
  source('mt-gox', 'trustee-deadline', 'Notice concerning change of Mt. Gox repayments deadline', 'https://www.mtgox.com/img/pdf/20251027_1cc36334-e8b2-4fe4-8135-97d9a149e4f7_announcement_en.pdf', 'Mt. Gox Rehabilitation Trustee', { publishedAt: '2025-10-27', locator: 'Repayment progress, remaining creditor issues and court-approved deadline extension to October 31, 2026.' }),
  source('mt-gox', 'trustee-selection', 'Launch of repayment method and payee registration', 'https://www.mtgox.com/img/pdf/20221006_announcement_en.pdf', 'Mt. Gox Rehabilitation Trustee', { publishedAt: '2022-10-06', locator: 'Creditor selection process, repayment methods, identity checks and rehabilitation-plan administration.' }),
  source('mt-gox', 'doj-charges', 'Russian nationals charged in Mt. Gox hack and BTC-e operation', 'https://www.justice.gov/archives/opa/pr/russian-nationals-charged-hacking-one-cryptocurrency-exchange-and-illicitly-operating-another', 'U.S. Department of Justice', { publishedAt: '2023-06-09', locator: 'Indictment allegations, approximately 647,000 BTC figure, wallet-custody facts and express presumption of innocence.' }),
  source('mt-gox', 'fincen-btce', 'FinCEN fines BTC-e for anti-money-laundering violations', 'https://www.fincen.gov/news/news-releases/fincen-fines-btc-e-virtual-currency-exchange-110-million-facilitating-ransomware', 'Financial Crimes Enforcement Network', { publishedAt: '2017-07-27', locator: 'BTC-e enforcement finding and more than 300,000 BTC traced to Mt. Gox theft transactions.' }),
  source('mt-gox', 'doj-vinnik', 'BTC-e operator pleads guilty to money laundering conspiracy', 'https://www.justice.gov/archives/opa/pr/btc-e-operator-pleads-guilty-money-laundering-conspiracy', 'U.S. Department of Justice', { publishedAt: '2024-05-03', locator: 'Vinnik guilty plea and BTC-e legal outcome; not a conviction for hacking Mt. Gox.' }),
  source('mt-gox', 'wizsec', 'Breaking open the Mt. Gox case, part 1', 'https://blog.wizsec.jp/2017/07/breaking-open-mtgox-1.html', 'WizSec', { publishedAt: '2017-07-27', tier: 'B', role: 'independent', locator: 'Independent wallet analysis, compromised-key theory, accounting effects and BTC-e coin flow.' }),
  source('mt-gox', 'malleability-paper', 'Bitcoin transaction malleability and Mt. Gox', 'https://arxiv.org/abs/1403.6676', 'Christian Decker and Roger Wattenhofer', { publishedAt: '2014-03-26', tier: 'A', role: 'independent', locator: 'Network-trace study finding no widespread malleability attack sufficient to explain the collapse.' }),
  source('mt-gox', 'coindesk-repayments', 'Bitstamp starts distributing Mt. Gox proceeds', 'https://www.coindesk.com/business/2024/07/24/bitstamp-to-start-distributing-mt-gox-proceeds-on-thursday', 'CoinDesk', { publishedAt: '2024-07-24', tier: 'B', role: 'independent', locator: 'Independent confirmation of 2024 exchange-assisted creditor distributions.' }),
  source('mt-gox', 'axios-repayments', 'Former Mt. Gox users set to get repayments', 'https://www.axios.com/2024/06/24/bitcoin-cryptocurrency-exchange-repayments-mt-gov', 'Axios', { publishedAt: '2024-06-24', tier: 'B', role: 'independent', locator: 'Independent history and planned July 2024 repayment context.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
];

const mtGox = {
  slug: 'mt-gox', name: 'Mt. Gox', aliases: ['MtGox', 'MtGox Co., Ltd.'], table: 'dead_exchanges',
  operatingState: 'closed_rehabilitation', outcome: 'failed_closed_partial_recovery', outcomeConfidence: 'high', qualityConfidence: 'high',
  classification: { subtype: 'closed custodial bitcoin spot exchange in civil rehabilitation', tags: ['custodial', 'bitcoin', 'spot', 'hack', 'insolvency', 'civil_rehabilitation', 'closed'], chains: ['Bitcoin'], jurisdictions: ['Japan'] },
  sources: mtGoxSources,
  statusAssertion: 'Mt. Gox remains closed while its Japanese rehabilitation trustee continues creditor repayments.', statusSourceKeys: ['trustee-deadline', 'trustee-selection', 'coindesk-repayments'], statusEvidenceLocator: 'Latest trustee notice and independently reported distributions.',
  outcomeAssertion: 'Mt. Gox is a failed closed exchange with partial creditor recovery still in progress.', outcomeSourceKeys: ['trustee-deadline', 'doj-charges', 'malleability-paper', 'coindesk-repayments'], outcomeEvidenceLocator: 'Closure, causal evidence, completed repayment categories and remaining creditors.',
  identityBoundary: 'This profile covers the former MtGox Co., Ltd. bitcoin exchange and its rehabilitation estate. It does not treat the trustee, repayment exchanges, BTC-e or charged individuals as the same entity. Theft allegations, convictions involving BTC-e and civil creditor repayments are separate legal facts.',
  methodologyNotes: ['The approximately 850,000 BTC originally reported missing, approximately 200,000 BTC later located and approximately 647,000 BTC alleged in the U.S. indictment are different measures and must not be added.', 'The latest trustee notice describes progress by repayment category but does not publish a universal percentage of all creditors or claims repaid.'],
  unknowns: ['Final creditor recovery by claim type', 'Assets and claims remaining after the extended deadline', 'Final disposition of the 2023 Mt. Gox hacking charges', 'Complete allocation of losses among theft, accounting errors and earlier incidents'],
  unsourcedFields: ['Universal recovery percentage', 'Current estate balance by asset', 'Final hacking-case disposition', 'Complete loss attribution'],
  sections: {
    what_it_is: section('Mt. Gox was a Tokyo-based custodial bitcoin exchange. Customers deposited bitcoin or cash, traded on an internal ledger and trusted the company to control the wallets. It became the largest early bitcoin venue, then stopped withdrawals and closed in February 2014. The exchange no longer operates; a Japanese rehabilitation trustee now administers the remaining estate and creditor payments.', [claim('Mt. Gox was a custodial bitcoin exchange based in Japan.', ['doj-charges', 'malleability-paper'], 'Authority and academic descriptions.'), claim('The venue closed in February 2014 after stopping withdrawals.', ['doj-charges', 'malleability-paper', 'axios-repayments'], 'Closure history.'), claim('A rehabilitation trustee, not an exchange operator, now administers creditor payments.', ['trustee-selection', 'trustee-deadline'], 'Current legal-administration notices.')]),
    what_happened: section('Mt. Gox lost control of customer bitcoin over several years while its internal records failed to reveal the drain. The company initially blamed transaction malleability, but a 2014 network study found too little widespread malleability abuse to explain the loss. U.S. prosecutors later alleged that attackers stole about 647,000 BTC after gaining access to wallet infrastructure. That figure is an indictment allegation, not a final conviction or the same number as every bankruptcy estimate.', [claim('The exchange lost customer bitcoin over a period before its 2014 closure.', ['doj-charges', 'wizsec'], 'Charging account and independent wallet analysis.'), claim('Network data did not support widespread malleability as a sufficient explanation.', ['malleability-paper'], 'Academic abstract and network-trace conclusion.'), claim('The approximately 647,000 BTC figure is an allegation in an indictment.', ['doj-charges'], 'DOJ charge and presumption-of-innocence language.', { kind: 'allegation' })]),
    why_this_outcome: section('The evidence points to a custody failure compounded by weak accounting and detection. Prosecutors allege that wallet-server access let attackers keep draining deposits. WizSec independently traced a long-running compromised-key pattern and accounting distortions. Management did not reconcile liabilities to controllable coins soon enough to stop the loss or warn customers. Theft explains much of the damage, but the venue’s strategic failure was operating a dominant custodian without controls that exposed the gap.', [claim('Prosecutors allege unauthorized wallet-server access enabled repeated theft.', ['doj-charges'], 'Indictment summary.', { kind: 'allegation' }), claim('Independent wallet analysis found a long-running key compromise and accounting effects.', ['wizsec'], 'Researcher transaction tracing.'), claim('The loss becoming an insolvency also reflects failed custody and reconciliation controls.', ['doj-charges', 'wizsec', 'malleability-paper'], 'Causal synthesis from the technical record.', { kind: 'inference' })]),
    strategic_choices: section('Mt. Gox concentrated a large share of early bitcoin trading and custody inside one company-controlled wallet and ledger system. It kept operating while the hidden asset gap grew and used withdrawal restrictions only near the end. It did not provide customers with independent proof that wallet assets matched account balances. Those choices made the venue easy to use and liquid in its era, but created one large failure domain with little outside warning.', [claim('Customer wallets and keys were held on Mt. Gox infrastructure.', ['doj-charges'], 'DOJ custody description.'), claim('The exchange continued operating during the alleged multi-year drain.', ['doj-charges', 'wizsec'], 'Alleged theft dates and independent tracing.'), claim('The reviewed record does not identify independent liability-and-reserve verification before closure.', ['malleability-paper', 'wizsec'], 'Control gap in the reviewed history.', { kind: 'unknown' })]),
    operating_model: section('Mt. Gox matched bitcoin trades on a company ledger and held the underlying bitcoin and fiat for customers. That model made trading fast but separated account balances from what customers could verify on-chain. Once private keys were compromised, later deposits could also be exposed while the ledger still showed users a balance. The current rehabilitation process is different: it verifies creditor identity and distributes estate assets through approved payment channels and exchanges.', [claim('Mt. Gox used company-controlled custody and an internal account ledger.', ['doj-charges', 'wizsec'], 'Wallet and accounting descriptions.'), claim('Compromised keys could expose later deposits to previously generated addresses.', ['wizsec'], 'Independent keypool analysis.'), claim('The rehabilitation process uses verified creditor and payee registration.', ['trustee-selection'], 'Trustee instructions.')]),
    token_and_value_capture: section('Mt. Gox did not launch a venue token. Its value came from trading fees, custody, brand and the liquidity created by a large user base. Customers had contractual account claims, not a token that represented equity or a segregated reserve. Rehabilitation claims and bitcoin or bitcoin-cash distributions are legal recovery rights from the estate; they are not a new Mt. Gox token or evidence that the old exchange restarted.', [claim('The reviewed exchange record does not identify a Mt. Gox venue token.', ['doj-charges', 'malleability-paper', 'trustee-selection'], 'Historical exchange and repayment records.', { kind: 'unknown' }), claim('Customer balances depended on company custody rather than tokenized ownership.', ['doj-charges', 'wizsec'], 'Custody model.'), claim('Rehabilitation claims and distributions are not a venue token or relaunch.', ['trustee-selection', 'trustee-deadline', 'coindesk-repayments'], 'Legal-payment process.', { kind: 'inference' })]),
    counterfactual: section('Mt. Gox could have separated hot and cold custody, rotated compromised keys, reconciled liabilities to wallet assets every day and published independent proof that balances matched controllable coins. Withdrawal limits imposed when the first unexplained gap appeared could have reduced later exposure. A faster court process would also have shortened uncertainty for creditors. These controls address observed weaknesses, but public evidence cannot calculate exactly how much each would have saved.', [claim('Key rotation and segmented custody directly address the compromised-key pattern.', ['wizsec', 'doj-charges'], 'Observed attack path supports the alternative.', { kind: 'inference' }), claim('Frequent liability reconciliation could have surfaced a persistent asset gap earlier.', ['wizsec'], 'Observed ledger distortion supports the alternative.', { kind: 'inference' }), claim('The amount any counterfactual would have saved is unknowable.', ['wizsec', 'malleability-paper'], 'Historical evidence cannot replay the outcome.', { kind: 'unknown' })]),
    risks_and_unknowns: section('Mt. Gox is closed, but creditor and legal uncertainty remains. The trustee says major repayment categories are largely complete for eligible creditors without processing problems, while many others still have not received payment. That is not a universal recovery rate. The U.S. hacking indictment remains an allegation unless a court resolves it. Researchers must also keep the original missing estimate, later-found coins, alleged theft amount and estate distributions separate.', [claim('Some major repayment categories are largely complete for procedurally ready creditors.', ['trustee-deadline'], 'Latest trustee wording.'), claim('Many creditors still had not received repayments for procedural or other reasons.', ['trustee-deadline'], 'Latest trustee wording.'), claim('The missing, found, alleged-stolen and distributed bitcoin measures are not additive.', ['trustee-deadline', 'doj-charges', 'wizsec'], 'Different scope and legal status.', { kind: 'inference' })]),
    lifecycle: section('Mt. Gox grew from an early bitcoin marketplace into the dominant custodial exchange, then halted withdrawals and entered bankruptcy in 2014. Civil rehabilitation later replaced straight liquidation and created payment choices for approved creditors. Exchange-assisted distributions began in 2024. In October 2025, the trustee extended the remaining repayment deadline to October 31, 2026. The exchange is permanently closed even though the recovery process is still active.', [claim('Mt. Gox closed and entered insolvency proceedings in 2014.', ['doj-charges', 'axios-repayments'], 'Authority and independent history.'), claim('Exchange-assisted creditor distributions began in 2024.', ['coindesk-repayments', 'axios-repayments'], 'Independent distribution reporting.'), claim('The remaining repayment deadline is October 31, 2026.', ['trustee-deadline'], 'Court-approved trustee notice.')]),
    outlook_and_watch: section('The only current Mt. Gox outlook is recovery administration, not exchange growth. Watch for trustee updates after October 31, 2026, final asset and claim accounting, delayed-creditor distributions and court outcomes in the hacking case. The broader lesson is durable: a liquid exchange can still fail if customers cannot verify custody and management cannot reconcile liabilities to keys it controls. Repayment progress should update the recovery label, never the closed status.', [claim('Current material updates come from the trustee and courts, not exchange operations.', ['trustee-deadline', 'doj-charges'], 'Closed venue and active legal processes.', { kind: 'inference' }), claim('The next dated repayment milestone is October 31, 2026.', ['trustee-deadline'], 'Current deadline.'), claim('Repayment progress does not mean Mt. Gox has reopened.', ['trustee-deadline', 'coindesk-repayments'], 'Trustee distribution versus operating-venue boundary.', { kind: 'inference' })]),
  },
  metrics: [
    metric('initial-missing-btc', 'customer_shortfall', 'Bitcoin initially reported missing', 850000, ['company-found-wallet', 'malleability-paper'], 'Historical operator estimate and contemporary academic context.', { asOf: '2014-02-28', window: 'initial closure estimate', scope: 'Mt. Gox exchange liabilities and wallets', unit: 'btc', currency: 'BTC', qualityFlags: ['historical_operator_estimate', 'not_current_estate_balance', 'not_additive'] }),
    metric('later-located-btc', 'creditor_recovery', 'Bitcoin later located', 200000, ['company-found-wallet'], 'Historical operator notice reporting the old-format wallet discovery.', { asOf: '2014-03-20', window: 'post-closure discovery', scope: 'Mt. Gox estate', unit: 'btc', currency: 'BTC', qualityFlags: ['historical_operator_report', 'not_current_distributable_balance', 'not_final_recovery', 'not_additive'] }),
    metric('doj-alleged-theft-btc', 'customer_shortfall', 'Bitcoin alleged stolen in U.S. indictment', 647000, ['doj-charges'], 'Approximate amount alleged by prosecutors.', { asOf: '2023-06-09', window: 'indictment allegation', scope: 'Mt. Gox wallets and alleged laundering flow', unit: 'btc', currency: 'BTC', qualityFlags: ['allegation_not_conviction', 'not_final_shortfall', 'approximate', 'not_additive'] }),
  ],
  events: [
    event('closure', 'closure', '2014-02-28', 'Mt. Gox closed and filed for bankruptcy after stopping bitcoin withdrawals.', ['doj-charges', 'malleability-paper', 'axios-repayments'], 'Authority, academic and independent closure history.'),
    event('repayment-selection', 'restructuring', '2022-10-06', 'The trustee opened repayment-method selection and payee registration.', ['trustee-selection'], 'Trustee notice.'),
    event('hacking-charges', 'legal', '2023-06-09', 'U.S. prosecutors announced hacking and laundering charges tied to approximately 647,000 BTC; the charges are allegations.', ['doj-charges'], 'DOJ announcement and presumption-of-innocence notice.'),
    event('distributions-begin', 'recovery', '2024-07-24', 'Approved exchanges began distributing estate assets to some creditors.', ['coindesk-repayments', 'axios-repayments'], 'Independent distribution reporting.'),
    event('deadline-extension', 'recovery', '2025-10-27', 'The trustee extended the remaining repayment deadline to October 31, 2026.', ['trustee-deadline'], 'Court-approved trustee notice.'),
  ],
  feature: { lifecycle: 'dead', operating_model: 'Closed custodial bitcoin spot exchange whose remaining estate is administered through Japanese civil rehabilitation.', product_cohort: 'bitcoin_spot_custodial_exchange', custody_model: 'custodial', token_status: 'not_identified', token_symbol: null, token_launch_date: null, token_launch_timing: 'unknown', token_strategy: 'no_venue_token_identified', token_source_url: 'https://www.mtgox.com/img/pdf/20251027_1cc36334-e8b2-4fe4-8135-97d9a149e4f7_announcement_en.pdf', metric_type: 'customer_shortfall', metric_unit: 'btc', metric_window: 'historical_estimate', metric_as_of: '2014-02-28', metric_observed_at: OBSERVED_AT, comparability_key: 'cex|bitcoin_spot_custodial_exchange|customer_shortfall|btc|historical_estimate' },
};

// PROFILE_SPECS_START

const specs = [bitstamp, okx, wazirx, fcoin, mtGox];

export const document = {
  schema: 'chaindump-cex-wave-d-v1',
  research_as_of: AS_OF,
  generated_migration: '0092_cex_wave_d_profiles.sql',
  cases: specs.map((spec) => ({
    table: spec.table,
    slug: spec.slug,
    name: spec.name,
    canonical_profile: buildProfile(spec),
    feature: {
      kind: 'cex',
      slug: spec.slug,
      lifecycle: spec.feature.lifecycle,
      operating_model: spec.feature.operating_model,
      product_cohort: spec.feature.product_cohort,
      custody_model: spec.feature.custody_model,
      primary_chain: null,
      chains: [],
      token_status: spec.feature.token_status,
      token_symbol: spec.feature.token_symbol,
      token_launch_date: spec.feature.token_launch_date,
      token_launch_timing: spec.feature.token_launch_timing,
      token_strategy: spec.feature.token_strategy,
      token_source_url: spec.feature.token_source_url,
      metric_type: spec.feature.metric_type,
      metric_unit: spec.feature.metric_unit,
      metric_window: spec.feature.metric_window,
      metric_as_of: spec.feature.metric_as_of,
      metric_observed_at: spec.feature.metric_observed_at,
      comparability_key: spec.feature.comparability_key,
      evidence: {
        canonical_profile: true,
        claims_pending_human_review: true,
        identity_boundary: spec.identityBoundary,
        source_count: spec.sources.length,
      },
      quality_label: 'verified',
      quality_issues: [],
      lifecycle_evidence_date: AS_OF,
      last_verified_at: AS_OF,
      next_review_at: NEXT_REVIEW_AT.slice(0, 10),
      freshness_status: 'current',
      updated_at: AS_OF,
    },
  })),
};

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function stagingInsert(entry) {
  return `INSERT INTO _cex_wave_d_profiles_0092 (
  target_table, slug, canonical_profile, feature
) VALUES (${[
    entry.table,
    entry.slug,
    JSON.stringify(entry.canonical_profile),
    JSON.stringify(entry.feature),
  ].map(sqlText).join(', ')});`;
}

export function renderMigration(value = document) {
  const staged = value.cases.map(stagingInsert);
  const migration = `-- Five current CEX profiles assembled and source-checked ${AS_OF}.
-- Claims remain pending human review. Existing case fields and source arrays are preserved.

DROP TABLE IF EXISTS _cex_wave_d_profiles_0092;

CREATE TABLE _cex_wave_d_profiles_0092 (
  target_table TEXT NOT NULL,
  slug TEXT NOT NULL,
  canonical_profile TEXT NOT NULL CHECK (json_valid(canonical_profile)),
  feature TEXT NOT NULL CHECK (json_valid(feature)),
  PRIMARY KEY (target_table, slug)
);

-- canonical-payload-start
${staged.join('\n\n')}
-- canonical-payload-end

UPDATE successful_exchanges AS exchange_row
SET profile = json_set(
  CASE WHEN json_valid(exchange_row.profile) AND json_type(exchange_row.profile) = 'object'
    THEN exchange_row.profile ELSE '{}' END,
  '$.canonical_profile', json(staged.canonical_profile)
)
FROM _cex_wave_d_profiles_0092 AS staged
WHERE staged.target_table = 'successful_exchanges'
  AND exchange_row.type = 'cex'
  AND exchange_row.slug = staged.slug;

UPDATE mid_exchanges AS exchange_row
SET profile = json_set(
  CASE WHEN json_valid(exchange_row.profile) AND json_type(exchange_row.profile) = 'object'
    THEN exchange_row.profile ELSE '{}' END,
  '$.canonical_profile', json(staged.canonical_profile)
)
FROM _cex_wave_d_profiles_0092 AS staged
WHERE staged.target_table = 'mid_exchanges'
  AND exchange_row.kind = 'cex'
  AND exchange_row.slug = staged.slug;

UPDATE dead_exchanges AS exchange_row
SET profile = json_set(
  CASE WHEN json_valid(exchange_row.profile) AND json_type(exchange_row.profile) = 'object'
    THEN exchange_row.profile ELSE '{}' END,
  '$.canonical_profile', json(staged.canonical_profile)
)
FROM _cex_wave_d_profiles_0092 AS staged
WHERE staged.target_table = 'dead_exchanges'
  AND exchange_row.kind = 'cex'
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
FROM _cex_wave_d_profiles_0092
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

DROP TABLE _cex_wave_d_profiles_0092;
`;
  for (const [index, statement] of staged.entries()) {
    const bytes = Buffer.byteLength(statement, 'utf8');
    if (bytes > MAX_D1_STATEMENT_BYTES) {
      throw new Error(`D1 statement for ${value.cases[index].slug} is ${bytes} bytes`);
    }
  }
  return migration;
}

writeFileSync(artifactPath, `${JSON.stringify(document, null, 2)}\n`);
writeFileSync(migrationPath, renderMigration(document));

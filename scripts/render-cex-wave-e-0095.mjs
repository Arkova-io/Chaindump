#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYSIS_SECTION_KEYS, validateEntityProfile } from '../src/lib/entity-profile.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(root, 'docs/cex-wave-e-profiles-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0095_cex_wave_e_profiles.sql');
const AS_OF = '2026-08-03';
const ACCESSED_AT = '2026-08-03T21:15:00Z';
const OBSERVED_AT = '2026-08-03T21:15:00Z';
const NEXT_REVIEW_AT = '2026-08-10T21:15:00Z';
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
    resolving: true,
    reachable: true,
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

const bitmartSources = [
  source('bitmart', 'closure', 'Important notice regarding the orderly cessation of BitMart operations', 'https://bitmart.zendesk.com/hc/en-us/articles/53544595916059-Important-Notice-Regarding-the-Orderly-Cessation-of-BitMart-Operations', 'BitMart', { publishedAt: '2026-07-26', locator: 'Official wind-down announcement, product cutoffs, withdrawal recommendation and final platform-closure date.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('bitmart', 'controls', 'Statement on unusual trading activity and account restrictions', 'https://www.bitmart.com/en-US/support/articles/7922665245339/39162120325403/50773623099035', 'BitMart', { publishedAt: '2026-05-23', locator: 'Operator account-restriction explanation and statement that proof of reserves had not yet been published.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('bitmart', 'breach', 'BitMart security breach update', 'https://www.bitmart.com/en-US/support/articles/7922665245339/7923672421147/4411998987419', 'BitMart', { publishedAt: '2021-12-05', locator: 'Operator description of two affected hot wallets, a stolen private key and compensation commitment.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('bitmart', 'bmx', 'BMX token', 'https://www.bitmart.com/en-US/bmx', 'BitMart', { locator: 'Current BMX token, timelock and multisignature-control page.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('bitmart', 'bmx-supply', 'What is BMX?', 'https://www.bitmart.com/en-US/support/articles/7949433565211/360000415634/360003185273', 'BitMart', { locator: 'Initial one-billion BMX supply and fee-funded repurchase-and-burn description.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('bitmart', 'coindesk-close', 'Crypto exchange BitMart to shut down after nine years', 'https://www.coindesk.com/markets/2026/07/26/crypto-exchange-bitmart-to-shut-down-after-nine-years-bmx-token-crashes-58', 'CoinDesk', { publishedAt: '2026-07-26', tier: 'B', role: 'independent', locator: 'Independent closure coverage and event-window BMX price reaction.' }),
  source('bitmart', 'breach-independent', 'BitMart hacked, losses estimated at $196 million', 'https://beincrypto.com/bitmart-hacked-losses-estimated-at-196m/', 'BeInCrypto', { publishedAt: '2021-12-05', tier: 'B', role: 'independent', locator: 'Independent report of PeckShield\'s approximate 2021 loss estimate.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
];

const bitmart = {
  slug: 'bitmart', name: 'BitMart', aliases: ['BitMart Exchange'], table: 'dead_exchanges',
  operatingState: 'winding_down', outcome: 'orderly_wind_down_announced', outcomeConfidence: 'high', qualityConfidence: 'high',
  classification: { subtype: 'custodial multi-product exchange in announced wind-down', tags: ['custodial', 'spot', 'derivatives', 'wind-down', 'exchange-token'], chains: [], jurisdictions: ['global'] },
  sources: bitmartSources,
  statusAssertion: 'BitMart was in an announced wind-down at the review date, with all trading scheduled to stop on August 26, 2026 and the platform scheduled to close on January 31, 2027.', statusSourceKeys: ['closure', 'coindesk-close'], statusEvidenceLocator: 'Official cessation schedule and independent contemporaneous coverage.',
  outcomeAssertion: 'BitMart is classified as winding down, not already closed or proven insolvent.', outcomeSourceKeys: ['closure', 'controls', 'coindesk-close'], outcomeEvidenceLocator: 'The operator published a future closure schedule but did not disclose insolvency or a final financial cause.',
  identityBoundary: 'This profile covers the BitMart custodial exchange and its announced wind-down. BMX is a separate token, the 2021 hot-wallet breach is a historical incident, and account restrictions reported in May 2026 do not by themselves prove the cause of the July closure.',
  methodologyNotes: ['The operator gave broad market and strategy reasons but no audited causal account; this report does not invent one.', 'The 58% BMX move is an event-window market observation, not a permanent holder loss or a measure of exchange liabilities.'],
  unknowns: ['Financial condition and liabilities during the wind-down', 'Specific board or owner decision process behind closure', 'Withdrawal completion rate and latency', 'Treatment of remaining BMX utility after platform closure'],
  unsourcedFields: ['Audited wind-down balance sheet', 'Decision-maker record', 'Withdrawal service-level data', 'Post-closure BMX utility'],
  sections: {
    what_it_is: section('BitMart is a custodial exchange that has offered spot, derivatives and other crypto services through accounts controlled by the venue. It also issued BMX, a separate exchange utility token. On July 26, 2026 BitMart announced a phased shutdown, so the useful description today is not simply “active” or “dead”: it is an exchange still processing an orderly wind-down under a published timetable.', [claim('BitMart operates a custodial multi-product exchange.', ['closure', 'controls'], 'Current operator notices and product restrictions.'), claim('BMX is a separate exchange token rather than customer equity.', ['bmx', 'bmx-supply'], 'Current token and supply pages.', { kind: 'inference' }), claim('The venue was winding down rather than fully closed on August 3, 2026.', ['closure'], 'Future trading and closure dates in the official schedule.')]),
    what_happened: section('BitMart stopped new registrations, deposits and new orders beginning July 26, 2026. It scheduled all trading to end August 26 and the full platform to close January 31, 2027, while urging customers to withdraw before the trading cutoff. The announcement followed May restrictions on 239 linked accounts and a much older 2021 hot-wallet breach, but the public record does not establish either episode as the cause of the shutdown.', [claim('Registrations, deposits and new orders were scheduled to stop from July 26, 2026.', ['closure'], 'Official phase-one timetable.'), claim('Trading was scheduled to end August 26, 2026 and the platform January 31, 2027.', ['closure'], 'Official phase-two and final dates.'), claim('The May controls and 2021 breach are not established causes of the 2026 closure.', ['closure', 'controls', 'breach'], 'The closure notice does not make that causal link.', { kind: 'unknown' })]),
    why_this_outcome: section('The only direct explanation from BitMart is a review of operating conditions, the market environment and future strategic direction. That supports a strategic-exit reading, but it is too vague to distinguish weak economics, compliance cost, owner preference or another constraint. BMX falling 58% on the news shows that token holders treated the venue closure as material; it does not reveal why management made the decision.', [claim('BitMart cited operating conditions, market environment and future strategic direction.', ['closure'], 'Operator explanation in the cessation notice.'), claim('The public explanation does not isolate a financial or regulatory cause.', ['closure'], 'No causal balance sheet, regulator order or board record is published.', { kind: 'unknown' }), claim('BMX fell 58% around the closure announcement according to CoinDesk.', ['coindesk-close'], 'Independent event-window reporting.')]),
    strategic_choices: section('BitMart chose a broad global product menu and tied platform benefits to BMX, including a fee-funded repurchase-and-burn design. It also chose a long phased exit rather than an immediate platform stop, leaving months for trading and withdrawals before final closure. That can reduce operational shock if execution works. It also creates a long period in which customers must judge withdrawal performance without a published proof-of-reserves report.', [claim('BitMart linked BMX economics to exchange fees and token burns.', ['bmx-supply', 'bmx'], 'Operator token design pages.'), claim('BitMart chose a phased rather than immediate closure.', ['closure'], 'Published six-month wind-down timetable.', { kind: 'inference' }), claim('BitMart said in May 2026 that proof of reserves had not yet been published.', ['controls'], 'Operator transparency statement.')]),
    operating_model: section('Customers deposited assets with BitMart, traded on its internal order books and relied on the venue to process withdrawals. Revenue could come from trading and service fees, while the BMX design directed a stated portion of fees toward repurchases and burns. The reviewed record does not publish a current exchange-level income statement, customer-liability schedule or audited reserve reconciliation, so trading activity cannot be translated into solvency or profitability.', [claim('BitMart used custodial accounts and internal trading controls.', ['controls', 'closure'], 'Account restriction and trading-cutoff mechanics.'), claim('The BMX design described fee-funded repurchases and burns.', ['bmx-supply'], 'Operator token economics.'), claim('Current audited venue profitability and liabilities are not published in the reviewed sources.', ['closure', 'controls'], 'Disclosure gap.', { kind: 'unknown' })]),
    token_and_value_capture: section('BMX was issued with an initial supply of one billion and was designed for exchange benefits plus repurchase-and-burn demand funded from fees. That connected token utility to continued platform use, which became a weakness once closure was announced. The reported 58% price fall is consistent with that dependency, but a market price reaction is not proof of the token’s future legal status, remaining treasury assets or final redemption value.', [claim('BMX had an initial stated supply of one billion tokens.', ['bmx-supply'], 'Operator supply description.'), claim('Exchange-fee repurchases and burns were a stated BMX value-capture mechanism.', ['bmx-supply', 'bmx'], 'Operator economics and control pages.'), claim('Post-closure BMX utility and redemption rights are not established by the reviewed record.', ['closure', 'bmx'], 'Closure and token pages do not resolve the post-platform state.', { kind: 'unknown' })]),
    counterfactual: section('A credible reserve report, clearer entity-level financial disclosure and earlier explanation of the strategic problem could have given customers and token holders more information before the exit. A narrower product or jurisdiction footprint might also have reduced operating burden, but there is no published evidence that it would have preserved the business. The real counterfactual is whether transparent reserves and profitable core markets existed; public documents do not answer it.', [claim('BitMart had not published proof of reserves by May 2026.', ['controls'], 'Operator statement.'), claim('Earlier financial disclosure could have reduced information risk during a wind-down.', ['controls', 'closure'], 'Analyst counterfactual based on the disclosure gap.', { kind: 'inference' }), claim('Whether a narrower business would have prevented closure is unknown.', ['closure'], 'The operator did not publish segment economics.', { kind: 'unknown' })]),
    risks_and_unknowns: section('The immediate risk is execution: customers need withdrawals processed before services end, but the reviewed record contains no current completion-rate or liability-coverage data. There is also governance uncertainty because the closure notice does not identify a specific economic trigger. The 2021 stolen-key breach is relevant custody history, yet BitMart said it would compensate users; it should not be presented as an unpaid 2026 shortfall without new evidence.', [claim('Withdrawal execution is the principal customer risk during the scheduled closure.', ['closure'], 'Operator withdrawal recommendation and cutoff schedule.', { kind: 'inference' }), claim('The 2021 incident involved two hot wallets and a stolen private key.', ['breach', 'breach-independent'], 'Operator incident description and independent estimate.'), claim('The reviewed record does not establish a current unpaid shortfall from that incident.', ['breach', 'closure'], 'Operator compensation statement and absence of a current contrary finding.', { kind: 'unknown' })]),
    lifecycle: section('BitMart launched in 2017, built a global custodial exchange and exchange-token model, suffered a major hot-wallet compromise in 2021, restricted suspicious linked accounts in May 2026 and announced closure two months later. The platform has not yet reached its final scheduled end date of January 31, 2027. Its lifecycle label is “winding down,” with the final outcome dependent on withdrawals, residual claims and completion of the timetable.', [claim('BitMart operated for roughly nine years before announcing closure.', ['coindesk-close'], 'Independent operating-history summary.'), claim('A 2021 breach and May 2026 account restrictions preceded the closure announcement.', ['breach', 'controls', 'closure'], 'Dated sequence without causal assertion.'), claim('Final closure was scheduled for January 31, 2027.', ['closure'], 'Official final platform date.')]),
    outlook_and_watch: section('Watch whether trading stops on August 26, whether withdrawals remain available and timely, whether BitMart publishes reserve or liability data, and what happens to BMX benefits and treasury controls. A clean outcome means customers exit on schedule with few unresolved claims. A worse outcome means withdrawal friction, date changes or material liabilities emerge. Until those facts are known, this is an unresolved wind-down rather than a completed failure.', [claim('The August trading cutoff and January closure date are observable milestones.', ['closure'], 'Official schedule.', { kind: 'inference' }), claim('Reserve disclosure and withdrawal performance would materially change the risk call.', ['controls', 'closure'], 'Current disclosure gap and user exit process.', { kind: 'inference' }), claim('Final customer claims and BMX treatment remain unknown.', ['closure', 'bmx'], 'No final closure accounting or token resolution is published.', { kind: 'unknown' })]),
  },
  metrics: [
    metric('breach-estimate', 'customer_shortfall', 'Independent 2021 breach loss estimate', 196000000, ['breach-independent', 'breach'], 'Independent estimate paired with operator incident scope.', { asOf: '2021-12-05', window: 'incident estimate', scope: 'two BitMart hot wallets', qualityFlags: ['third_party_estimate', 'historical_incident', 'operator_said_users_would_be_compensated', 'not_current_shortfall'] }),
  ],
  events: [event('breach', 'security', '2021-12-05', 'BitMart reported a stolen private key affecting two hot wallets and said it would compensate affected users.', ['breach'], 'Operator incident update.'), event('account-controls', 'risk_control', '2026-05-23', 'BitMart described restrictions on 239 linked accounts and said proof of reserves was not yet published.', ['controls'], 'Operator controls statement.'), event('wind-down', 'closure', '2026-07-26', 'BitMart announced its phased cessation schedule.', ['closure', 'coindesk-close'], 'Operator announcement and independent coverage.')],
  feature: { lifecycle: 'dead', operating_model: 'Custodial multi-product exchange executing a phased platform wind-down.', product_cohort: 'centralized_multi_product_exchange', custody_model: 'custodial', token_status: 'launched', token_symbol: 'BMX', token_launch_date: null, token_launch_timing: 'at_or_near_launch', token_strategy: 'exchange_utility_fee_repurchases_and_burns', token_source_url: 'https://www.bitmart.com/en-US/support/articles/7949433565211/360000415634/360003185273', metric_type: 'customer_shortfall', metric_unit: 'usd', metric_window: 'historical_incident_estimate', metric_as_of: '2021-12-05', metric_observed_at: OBSERVED_AT, comparability_key: 'cex|centralized_multi_product_exchange|customer_shortfall|usd|incident_estimate' },
};

const htxSources = [
  source('htx', 'fca-case', 'HTX (Huobi): legal proceedings', 'https://www.fca.org.uk/news/statements/htx-huobi-legal-proceedings', 'UK Financial Conduct Authority', { publishedAt: '2026-06-29', locator: 'Current High Court service orders and named Huobi Global S.A. proceeding.' }),
  source('htx', 'fca-release', 'FCA takes action against HTX over illegal financial promotions', 'https://www.fca.org.uk/news/press-releases/fca-action-against-htx-illegal-financial-promotions', 'UK Financial Conduct Authority', { publishedAt: '2026-02-10', locator: 'Regulator allegation, prior warning and UK consumer-access restrictions.' }),
  source('htx', 'sanctions', 'UK sanctions designation: Huobi Global S.A.', 'https://search-uk-sanctions-list.service.gov.uk/designations/RUS3619/Entity', 'UK Sanctions List', { publishedAt: '2026-05-26', locator: 'Named designated entity, date, asset-freeze measures and statement of reasons.' }),
  source('htx', 'ofsi', 'UK financial sanctions FAQs', 'https://www.gov.uk/government/publications/uk-financial-sanctions-faqs/uk-financial-sanctions-faqs', 'UK Office of Financial Sanctions Implementation', { publishedAt: '2026-05-29', locator: 'FAQ 186 treatment of the HTX exchange under ownership-and-control rules.' }),
  source('htx', 'response', 'HTX response regarding the UK sanctions designation', 'https://www.htx.com/fr-fr/support/65034152911363/', 'HTX', { publishedAt: '2026-05-27', locator: 'Operator assertion that Huobi Global S.A. is separate from the online HTX exchange.' }),
  source('htx', 'agreement', 'HTX user agreement', 'https://www.htx.com/en-in/support/360000298561', 'HTX', { publishedAt: '2026-06-18', locator: 'Definition of HTX Operators and user counterparty-identification language.' }),
  source('htx', 'por', 'HTX proof of reserves', 'https://www.htx.com/en-us/proof-of-reserve', 'HTX', { locator: 'Current Merkle-tree reserve methodology, 1:1 operator claim and third-party custody caveat.' }),
  source('htx', 'june-por', 'HTX June 2026 proof-of-reserves report', 'https://square.htx.com/htx-releases-june-2026-merkle-tree-proof-of-reserves-2/', 'HTX Square', { publishedAt: '2026-06-01', locator: 'June 1 snapshot reserve ratios for BTC, ETH, stablecoins and selected assets.' }),
  source('htx', 'token-convert', 'HTX token conversion and benefits', 'https://www.htx.com/en-us/htx/convert', 'HTX', { locator: 'Current HTX-token governance, fee-discount and membership benefits.' }),
  source('htx', 'burn', 'HTX DAO completes Q1 2026 HTX burn', 'https://square.htx.com/htx-dao-completes-q1-2026-htx-burn-two-year-supply-shrinks-over-11-as-deflation-accelerates/', 'HTX Square', { publishedAt: '2026-04-15', locator: 'Operator/DAO-reported quarterly and cumulative burn amounts.' }),
  source('htx', 'eu-observatory', 'EU Blockchain Observatory November 2023 trends report', 'https://blockchain-observatory.ec.europa.eu/document/download/a337a52d-ed31-42ee-9122-63db5c8eafe3_en?filename=November+2023+Trends+Report.pdf', 'EU Blockchain Observatory and Forum', { publishedAt: '2023-11-30', tier: 'B', role: 'independent', locator: 'Independent summary of the November 2023 HTX security incident and reported loss.', accessMethod: 'direct_pdf' }),
];

const htx = {
  slug: 'htx', name: 'HTX', aliases: ['Huobi', 'Huobi Global'], table: 'mid_exchanges',
  operatingState: 'operating_high_risk', outcome: 'operating_regulatory_and_identity_risk', outcomeConfidence: 'high', qualityConfidence: 'medium',
  classification: { subtype: 'custodial multi-product exchange with disputed legal-entity perimeter', tags: ['custodial', 'spot', 'derivatives', 'sanctions', 'legal-proceedings', 'exchange-token'], chains: [], jurisdictions: ['global', 'United Kingdom'] },
  sources: htxSources,
  statusAssertion: 'HTX remained an online operating exchange at the review date while facing UK legal proceedings and sanctions-related restrictions.', statusSourceKeys: ['agreement', 'por', 'fca-case', 'ofsi'], statusEvidenceLocator: 'Current operator terms and reserve page together with live regulator and sanctions records.',
  outcomeAssertion: 'HTX is classified as operating with high regulatory and legal-entity risk, not as closed.', outcomeSourceKeys: ['fca-case', 'sanctions', 'ofsi', 'response', 'agreement'], outcomeEvidenceLocator: 'The venue still publishes current terms and reserves, while official UK records and the operator disagree about the entity perimeter.',
  identityBoundary: 'Huobi Global S.A., the online HTX exchange, unspecified “HTX Operators,” the HTX DAO and the HTX token are not interchangeable. UK authorities say ownership-and-control rules bring the exchange into scope; HTX disputes that reading. This report records both positions and does not decide the legal dispute.',
  methodologyNotes: ['Sanctions and FCA proceedings are legal facts and allegations, not proof of insolvency.', 'Merkle reserve ratios are point-in-time operator disclosures, not audited financial statements or proof that every liability is included.'],
  unknowns: ['The precise legal counterparty for every customer and product', 'Final outcome of FCA proceedings', 'Practical effect of UK sanctions across jurisdictions and counterparties', 'Audited consolidated customer assets and liabilities'],
  unsourcedFields: ['Product-by-product legal-entity map', 'Final FCA judgment', 'Global sanctions implementation', 'Audited consolidated reserves'],
  sections: {
    what_it_is: section('HTX is the rebranded Huobi exchange, offering custodial spot, derivatives and related services. Its public agreement defines “HTX Operators” broadly and tells users that the relevant counterparty can vary by service. That flexibility is now a core risk rather than a drafting footnote because UK authorities named Huobi Global S.A. and say the HTX exchange is covered, while HTX says the online exchange is separate.', [claim('HTX offers custodial exchange services under a broad operator definition.', ['agreement', 'por'], 'Current terms and reserve methodology.'), claim('UK authorities named Huobi Global S.A. and addressed the HTX exchange.', ['sanctions', 'ofsi'], 'Official designation and FAQ.'), claim('HTX disputes that Huobi Global S.A. represents the online exchange.', ['response'], 'Operator response.')]),
    what_happened: section('The FCA began High Court proceedings over allegedly illegal UK financial promotions and updated its service orders in June 2026. On May 26 the UK designated Huobi Global S.A. under Russia sanctions, and OFSI later said the HTX exchange was subject to those restrictions through ownership and control. HTX publicly rejected the entity connection. The dispute has not stopped the global site from publishing current terms, token benefits and reserve snapshots.', [claim('The FCA brought High Court proceedings concerning UK financial promotions.', ['fca-case', 'fca-release'], 'Regulator case and press release.'), claim('Huobi Global S.A. was designated on May 26, 2026.', ['sanctions'], 'Official sanctions record.'), claim('OFSI and HTX published conflicting positions on whether the online exchange is covered.', ['ofsi', 'response'], 'Official FAQ and operator response.', { kind: 'inference' })]),
    why_this_outcome: section('HTX preserved a large global product surface by using a flexible operator structure and moving the brand beyond Huobi, but the same opacity makes legal and regulatory perimeter questions harder to resolve. The UK dispute is therefore not just external enforcement; it exposes a strategic tradeoff between jurisdictional flexibility and customer certainty about who holds assets and owes obligations. Continued operation shows resilience, not resolution.', [claim('HTX terms allow operators and counterparties to vary by service.', ['agreement'], 'Current user-agreement definitions.'), claim('That flexibility reduces legal-entity clarity for users.', ['agreement', 'ofsi', 'response'], 'Analyst inference from conflicting official and operator positions.', { kind: 'inference' }), claim('Current operation does not resolve the FCA case or sanctions dispute.', ['por', 'fca-case', 'sanctions'], 'Operating and legal records remain separate.', { kind: 'inference' })]),
    strategic_choices: section('HTX chose a multi-product global model, a rebrand away from Huobi, a broad operator definition and a token-led loyalty system. It also answers trust questions with recurring Merkle reserve reports rather than a public consolidated audit. Those choices support speed and customer incentives but concentrate confidence in changing contracts, operator assertions and jurisdiction-by-jurisdiction access. The UK episode shows the cost when authorities apply a wider control test.', [claim('HTX uses a broad multi-operator contractual structure.', ['agreement'], 'User agreement.'), claim('HTX chose recurring Merkle reserve disclosures.', ['por', 'june-por'], 'Current methodology and June snapshot.'), claim('HTX tied customer benefits to the HTX token.', ['token-convert', 'burn'], 'Current token benefits and burn report.')]),
    operating_model: section('HTX holds customer assets, matches trades and offers products through legal persons or other operators that can differ by service. Customers depend on the platform ledger, custody controls and withdrawal process. The June reserve page reported asset-specific ratios above 100%, but the methodology is a point-in-time Merkle comparison and may include third-party custody. It does not publish consolidated revenue, operating costs or a complete audited liability perimeter.', [claim('The customer counterparty can vary according to the service.', ['agreement'], 'Operator-definition and service terms.'), claim('The June snapshot reported selected asset ratios at or above 100%.', ['june-por'], 'Operator-reported snapshot.'), claim('The reserve page is not a consolidated financial-statement audit.', ['por', 'june-por'], 'Method and scope limits.', { kind: 'inference' })]),
    token_and_value_capture: section('HTX migrated exchange benefits toward the HTX token, which is promoted for fee discounts, governance and membership. HTX DAO reports periodic burns, including a Q1 2026 burn valued by the publisher at about $19.22 million. That design can connect activity to token scarcity, but burn-value figures are operator or DAO claims and do not grant holders ownership of the exchange, customer assets or regulated-entity cash flow.', [claim('HTX token is promoted for discounts, governance and membership benefits.', ['token-convert'], 'Current benefits page.'), claim('HTX DAO reported a Q1 2026 burn valued at about $19.22 million.', ['burn'], 'DAO/operator report.'), claim('Those token benefits do not establish equity or customer-asset rights.', ['token-convert', 'agreement'], 'Token and customer-contract boundary.', { kind: 'inference' })]),
    counterfactual: section('A single named customer-facing legal entity, a published service-to-entity map and audited consolidated liabilities would have reduced the ambiguity now driving the UK dispute. HTX might still have faced sanctions or promotion rules, but users and counterparties could more easily identify the responsible company. A narrower jurisdictional footprint could lower enforcement exposure, while also sacrificing volume and distribution. Public evidence cannot price that tradeoff.', [claim('Current terms do not provide one simple operator for every service.', ['agreement'], 'Counterparty definition.'), claim('A service-to-entity map would reduce customer identity uncertainty.', ['agreement', 'ofsi', 'response'], 'Analyst counterfactual.', { kind: 'inference' }), claim('The revenue effect of a narrower footprint is not publicly disclosed.', ['agreement', 'fca-case'], 'No jurisdiction-level financial data.', { kind: 'unknown' })]),
    risks_and_unknowns: section('The largest risks are sanctions compliance, the FCA case, uncertain customer counterparties, custody and token dependence. HTX says the designated company is separate; OFSI says the exchange is covered. That contradiction must remain visible until a court, regulator or authoritative entity map resolves it. Reserve ratios can help customers verify inclusion at a snapshot, but they do not prove solvency, beneficial ownership or access to every custodian wallet.', [claim('The legal-entity perimeter is actively disputed.', ['ofsi', 'response', 'fca-case'], 'Conflicting public positions.'), claim('Merkle ratios do not prove complete solvency or wallet control.', ['por', 'june-por'], 'Scope of operator reserve method.', { kind: 'inference' }), claim('Final sanctions and FCA outcomes remain unknown.', ['sanctions', 'fca-case'], 'Open official records.', { kind: 'unknown' })]),
    lifecycle: section('Huobi grew into a major global exchange, rebranded to HTX and shifted platform incentives toward a new HTX token. A November 2023 security incident added custody history. By 2026 the defining phase was regulatory: FCA proceedings, a UK designation and a public fight over whether Huobi Global S.A. and the online exchange sit inside the same perimeter. The venue remains online, but its lifecycle has moved from expansion to high-risk regulatory adaptation.', [claim('HTX is the current brand of the former Huobi exchange.', ['agreement', 'fca-case'], 'Current operator and regulator naming.'), claim('An independent EU report recorded a 2023 HTX security incident.', ['eu-observatory'], 'Independent historical incident summary.'), claim('The 2026 lifecycle is operating under regulatory and entity-perimeter pressure.', ['fca-case', 'sanctions', 'response'], 'Analyst classification from current records.', { kind: 'inference' })]),
    outlook_and_watch: section('Watch the FCA docket, sanctions guidance, app and payment access, named contracting entities, reserve methodology, withdrawal performance and HTX-token burns. The call improves if HTX publishes a stable legal-entity map, independent assurance and clean regulator outcomes. It worsens if more counterparties block access, courts reject the separation argument or customers cannot identify who owes them assets. Continued web access alone is not a sufficient health signal.', [claim('FCA and sanctions records are direct legal milestones to monitor.', ['fca-case', 'sanctions', 'ofsi'], 'Current official records.', { kind: 'inference' }), claim('Entity maps and independent assurance would change the risk call.', ['agreement', 'por'], 'Current identity and assurance gaps.', { kind: 'inference' }), claim('Future access restrictions and legal outcomes are unknown.', ['fca-case', 'sanctions'], 'Open proceedings and implementation.', { kind: 'unknown' })]),
  },
  metrics: [
    metric('btc-reserve-ratio', 'reserve_coverage', 'BTC reserve ratio', 103, ['june-por'], 'Operator-reported Merkle snapshot.', { asOf: '2026-06-01', window: 'point-in-time snapshot', scope: 'HTX disclosed BTC wallets and user balances', unit: 'percent', currency: 'PERCENT', qualityFlags: ['operator_reported', 'snapshot', 'not_financial_statement_audit', 'liability_completeness_not_verified'] }),
    metric('stablecoin-reserve-ratio', 'reserve_coverage', 'Disclosed USD-stablecoin reserve ratio', 104, ['june-por'], 'Operator-reported grouped stablecoin snapshot.', { asOf: '2026-06-01', window: 'point-in-time snapshot', scope: 'HTX disclosed stablecoin wallets and user balances', unit: 'percent', currency: 'PERCENT', qualityFlags: ['operator_reported', 'snapshot', 'grouped_assets', 'not_financial_statement_audit'] }),
  ],
  events: [event('fca-proceedings', 'legal', '2026-02-10', 'The FCA announced High Court proceedings over alleged illegal financial promotions.', ['fca-release', 'fca-case'], 'Official regulator record.'), event('uk-designation', 'sanctions', '2026-05-26', 'The UK designated Huobi Global S.A. under Russia sanctions.', ['sanctions'], 'Official designation.'), event('entity-dispute', 'legal_response', '2026-05-27', 'HTX disputed that the designated entity represented the online exchange.', ['response', 'ofsi'], 'Operator response and later OFSI interpretation.')],
  feature: { lifecycle: 'mid', operating_model: 'Custodial multi-product exchange whose customer counterparty can vary across HTX Operators and services.', product_cohort: 'centralized_multi_product_exchange', custody_model: 'custodial', token_status: 'launched', token_symbol: 'HTX', token_launch_date: null, token_launch_timing: 'post_product', token_strategy: 'exchange_utility_governance_fee_discounts_and_burns', token_source_url: 'https://www.htx.com/en-us/htx/convert', metric_type: 'reserve_coverage', metric_unit: 'percent', metric_window: 'point_in_time_snapshot', metric_as_of: '2026-06-01', metric_observed_at: OBSERVED_AT, comparability_key: 'cex|centralized_multi_product_exchange|reserve_coverage|percent|snapshot' },
};

const kucoinSources = [
  source('kucoin', 'doj-plea', 'KuCoin pleads guilty to unlicensed money transmission charge', 'https://www.justice.gov/usao-sdny/pr/kucoin-pleads-guilty-unlicensed-money-transmission-charge-and-agrees-pay-penalties', 'U.S. Department of Justice', { publishedAt: '2025-01-27', locator: 'Peken Global guilty plea, forfeiture, fine, U.S. exit and management changes.' }),
  source('kucoin', 'doj-charges', 'KuCoin and two founders charged with Bank Secrecy Act and money-transmission offenses', 'https://www.justice.gov/usao-sdny/pr/prominent-global-cryptocurrency-exchange-kucoin-and-two-its-founders-criminally', 'U.S. Department of Justice', { publishedAt: '2024-03-26', locator: 'Named operating entities, alleged U.S. activity and charging-stage allegations.' }),
  source('kucoin', 'fma-current', 'FMA lifts new-business ban, but KuCoin EU may not commence operations', 'https://www.fma.gv.at/en/fma-lifts-ban-on-new-business-for-kucoin-eu-exchange-gmbh-however-commencement-of-business-operations-remains-prohibited/', 'Austrian Financial Market Authority', { publishedAt: '2026-05-18', locator: 'Current governance remediation and continuing prohibition on commencement of KuCoin EU business.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('kucoin', 'fma-license', 'Authorization granted to KuCoin EU Exchange GmbH', 'https://www.fma.gv.at/zulassungserteilung-kucoin-eu-exchange-gmbh/', 'Austrian Financial Market Authority', { publishedAt: '2025-11-27', locator: 'MiCA crypto-asset service-provider authorization and named Austrian entity.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('kucoin', 'por', 'KuCoin proof of reserves', 'https://www.kucoin.com/proof-of-reserves', 'KuCoin', { publishedAt: '2026-06-30', locator: 'Current operator snapshot ratios for BTC, ETH, USDT and USDC and verification method.' }),
  source('kucoin', 'kcs', 'KuCoin trading fees and KCS discount', 'https://www.kucoin.com/en-au/support/47497300094040', 'KuCoin', { locator: 'Base trading-fee schedule, KCS discount and stated token supply-and-burn design.' }),
  source('kucoin', 'terms', 'KuCoin terms of use', 'https://www.kucoin.com/legal/terms-of-use', 'KuCoin', { locator: 'Current service, custody, jurisdiction and contracting provisions.' }),
  source('kucoin', 'nyag', 'Attorney General James secures more than $22 million from KuCoin', 'https://ag.ny.gov/press-release/2023/attorney-general-james-secures-more-22-million-cryptocurrency-platform-operating', 'New York State Attorney General', { publishedAt: '2023-12-12', locator: 'New York settlement, customer refunds, penalty and state exit.' }),
  source('kucoin', 'reuters', 'KuCoin pleads guilty and agrees to pay nearly $300 million', 'https://www.investing.com/news/stock-market-news/kucoin-pleads-guilty-agrees-to-pay-nearly-300-million-us-crypto-case-3833232', 'Reuters via Investing.com', { publishedAt: '2025-01-27', tier: 'B', role: 'independent', locator: 'Independent account of the plea, penalties and U.S. exit.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
];

const kucoin = {
  slug: 'kucoin', name: 'KuCoin', aliases: ['KuCoin Exchange', 'Peken Global Limited'], table: 'mid_exchanges',
  operatingState: 'operating_under_remediation', outcome: 'operating_after_us_conviction_with_eu_launch_blocked', outcomeConfidence: 'high', qualityConfidence: 'high',
  classification: { subtype: 'custodial global multi-product exchange under regulatory remediation', tags: ['custodial', 'spot', 'derivatives', 'guilty-plea', 'european-remediation', 'exchange-token'], chains: [], jurisdictions: ['global', 'United States', 'European Union', 'Austria'] },
  sources: kucoinSources,
  statusAssertion: 'The global KuCoin venue remained operating, while Peken Global had exited the United States and KuCoin EU Exchange GmbH remained prohibited from commencing business in Austria.', statusSourceKeys: ['terms', 'por', 'doj-plea', 'fma-current'], statusEvidenceLocator: 'Current venue disclosures and distinct U.S. and Austrian legal records.',
  outcomeAssertion: 'KuCoin is classified as an operating exchange under remediation, not as globally closed or authorized to operate its Austrian EU entity.', outcomeSourceKeys: ['doj-plea', 'fma-current', 'fma-license', 'por'], outcomeEvidenceLocator: 'The global exchange publishes current reserves while specific named entities face completed and continuing restrictions.',
  identityBoundary: 'Peken Global Limited pleaded guilty in the United States. KuCoin EU Exchange GmbH is the Austrian MiCA entity whose business start remains prohibited. Other entities named in the 2024 charges and the global KuCoin brand must not be treated as the same legal person without a source.',
  methodologyNotes: ['A MiCA authorization and a later prohibition on commencing business are both true; the later FMA notice controls the current Austrian operating call.', 'Proof-of-reserves ratios are point-in-time operator disclosures, not audited proof of consolidated solvency.'],
  unknowns: ['Current global revenue and profitability by product', 'Complete service-to-legal-entity map', 'When or whether KuCoin EU may commence business', 'Audited completeness of customer liabilities behind proof of reserves'],
  unsourcedFields: ['Segment profitability', 'Complete entity map', 'Austrian launch date', 'Audited consolidated liability coverage'],
  sections: {
    what_it_is: section('KuCoin is a custodial global exchange offering spot, margin, futures and related services, with KCS used for fee discounts and other platform benefits. The brand spans multiple legal entities. That distinction matters: Peken Global Limited is the company that pleaded guilty in the United States, while KuCoin EU Exchange GmbH holds an Austrian authorization but is still prohibited from commencing business there.', [claim('KuCoin offers custodial multi-product exchange services.', ['terms', 'por'], 'Current customer terms and reserve page.'), claim('KCS provides trading-fee benefits on the platform.', ['kcs'], 'Current fee documentation.'), claim('Peken Global and KuCoin EU Exchange GmbH are distinct named entities.', ['doj-plea', 'fma-current', 'fma-license'], 'U.S. and Austrian official records.')]),
    what_happened: section('In January 2025 Peken Global pleaded guilty to unlicensed money transmission, agreed to more than $297 million in forfeiture and fines, left the U.S. market for at least two years and changed management. Austria later authorized KuCoin EU under MiCA, but the FMA restricted new business over governance and compliance staffing. In May 2026 the FMA lifted that narrow ban while keeping the more important prohibition on starting operations.', [claim('Peken Global pleaded guilty and agreed to $184.5 million forfeiture plus a $112.9 million fine.', ['doj-plea', 'reuters'], 'Official plea announcement and independent report.'), claim('KuCoin agreed to exit the U.S. market for at least two years.', ['doj-plea'], 'Plea disposition.'), claim('KuCoin EU remained prohibited from commencing operations on May 18, 2026.', ['fma-current'], 'Current FMA notice.')]),
    why_this_outcome: section('KuCoin grew through a broad global product set, low-friction access and token-linked incentives, but compliance systems and jurisdictional boundaries did not keep pace with that distribution. The U.S. conviction converted that gap into a costly exit and governance reset. The Austrian sequence shows that obtaining a licence is not enough when required management and control functions are unfinished. Global continuity reflects product demand; it does not erase entity-specific failures.', [claim('The U.S. case identified failures in money-transmission and AML compliance.', ['doj-plea', 'doj-charges'], 'Official charge and disposition records.'), claim('Austrian restrictions focused on governance and required control functions.', ['fma-current'], 'FMA remediation explanation.'), claim('Global operation and entity-specific restrictions can coexist.', ['por', 'terms', 'doj-plea', 'fma-current'], 'Current venue plus legal-entity records.', { kind: 'inference' })]),
    strategic_choices: section('KuCoin chose rapid multi-jurisdiction expansion, a wide spot-and-derivatives menu and KCS-based fee incentives. After enforcement, it accepted a U.S. exit and management changes while pursuing a regulated European entity. That is a pivot from border-light growth toward licensed regional operations, but the Austrian launch block shows the execution is incomplete. The strategy can work only if governance capacity matches the number of products and legal entities.', [claim('KuCoin used a broad product and KCS incentive strategy.', ['terms', 'kcs'], 'Current product and fee pages.'), claim('The plea required a U.S. exit and management changes.', ['doj-plea'], 'Official disposition.'), claim('The Austrian entity pursued MiCA authorization but had not completed launch conditions.', ['fma-license', 'fma-current'], 'Authorization and later current restriction.')]),
    operating_model: section('Customers deposit assets with KuCoin and trade through its internal custodial ledger across spot and derivatives products. Fees are discounted for qualifying KCS use. KuCoin publishes Merkle proof-of-reserves ratios, including a June 30, 2026 snapshot above 100% for four major assets. Those ratios compare disclosed wallets and user balances at one moment; they do not show revenue, capital, off-balance-sheet obligations or the full legal owner of every wallet.', [claim('KuCoin operates a custodial internal exchange ledger.', ['terms', 'por'], 'Current service and verification mechanics.'), claim('The June 2026 snapshot reported BTC, ETH, USDT and USDC ratios above 100%.', ['por'], 'Operator snapshot.'), claim('The snapshot does not establish audited consolidated solvency.', ['por'], 'Method and disclosure limits.', { kind: 'inference' })]),
    token_and_value_capture: section('KCS reduces eligible trading fees and is tied to a supply-reduction plan that began from a stated 200 million tokens with a target of 100 million. That design lets activity and platform loyalty support the token, while exchange fees remain corporate revenue. KCS is not equity in KuCoin or a claim on customer reserves. Public token burns also do not prove that the underlying venue is profitable or that regulators accept the product.', [claim('KCS can provide a trading-fee discount.', ['kcs'], 'Current fee schedule.'), claim('KuCoin describes a burn plan from 200 million toward 100 million KCS.', ['kcs'], 'Operator token-supply description.'), claim('KCS does not establish ownership of customer reserves or the exchange.', ['kcs', 'terms'], 'Token benefit and customer-contract boundary.', { kind: 'inference' })]),
    counterfactual: section('Earlier U.S. registration, stronger AML controls and a clearer entity map could have avoided or reduced the guilty plea and forced exit. In Austria, filling required governance roles before seeking launch would have reduced delay. A narrower product or country footprint might have been easier to supervise, but public data do not show whether the sacrificed volume would outweigh compliance cost. The useful test is durable legal access, not maximum short-term reach.', [claim('Earlier compliant U.S. licensing and AML controls addressed the conduct in the plea.', ['doj-plea'], 'Analyst counterfactual grounded in the offense.', { kind: 'inference' }), claim('Completing Austrian governance conditions earlier could have reduced launch delay.', ['fma-current'], 'Analyst counterfactual grounded in the FMA notice.', { kind: 'inference' }), claim('The economics of a narrower footprint are not publicly disclosed.', ['terms', 'doj-plea'], 'No jurisdiction-level profit record.', { kind: 'unknown' })]),
    risks_and_unknowns: section('KuCoin’s main risks are recurring compliance failures, fragmented legal entities, custody, derivatives exposure and KCS dependence. The U.S. plea is completed, but the Austrian entity still cannot commence business. Reserve ratios provide a useful snapshot and customer verification path, yet liability completeness and group-wide capital remain unaudited in the reviewed record. Customers should identify their contracting entity rather than assuming every KuCoin service has the same protections.', [claim('The U.S. plea created a completed financial and market-exit consequence.', ['doj-plea'], 'Official disposition.'), claim('The Austrian commencement prohibition remained current in May 2026.', ['fma-current'], 'Current regulator notice.'), claim('Group-wide audited liabilities and capital remain unknown.', ['por', 'terms'], 'Disclosure gap.', { kind: 'unknown' })]),
    lifecycle: section('KuCoin scaled from a global crypto venue into a large multi-product exchange with its own token. State and federal U.S. actions culminated in customer refunds, penalties, a guilty plea and a market exit. The next phase is regional licensing: Austria granted authorization, then held back business commencement until governance conditions are met. The global venue remains online, making the lifecycle one of constrained adaptation rather than closure or clean regulatory success.', [claim('New York obtained refunds, a penalty and a state exit in 2023.', ['nyag'], 'Official state settlement.'), claim('The federal case produced a 2025 guilty plea and U.S. exit.', ['doj-plea'], 'Official disposition.'), claim('The current phase is global operation with unfinished EU remediation.', ['por', 'fma-current'], 'Current venue and FMA status.', { kind: 'inference' })]),
    outlook_and_watch: section('Watch whether KuCoin EU satisfies the FMA, whether any further jurisdictions restrict service, whether legal entities become easier to identify, and whether reserve reports gain independent assurance. The call improves if the Austrian business starts lawfully, controls remain staffed and no new enforcement follows. It worsens if governance gaps recur or the global brand keeps relying on entity ambiguity. KCS price and burns are secondary to durable access and customer-asset protection.', [claim('FMA permission to commence business is a direct European milestone.', ['fma-current'], 'Current prohibition.', { kind: 'inference' }), claim('Entity clarity and stronger reserve assurance would change the risk call.', ['terms', 'por'], 'Current identity and assurance gaps.', { kind: 'inference' }), claim('Timing of Austrian commencement and future enforcement are unknown.', ['fma-current'], 'Open regulatory conditions.', { kind: 'unknown' })]),
  },
  metrics: [
    metric('us-penalties', 'regulatory_fines', 'U.S. forfeiture and criminal fine', 297400000, ['doj-plea', 'reuters'], 'Sum of $184.5 million forfeiture and $112.9 million fine stated by DOJ.', { asOf: '2025-01-27', window: 'criminal disposition', scope: 'Peken Global Limited', qualityFlags: ['includes_forfeiture_and_fine', 'specific_legal_entity', 'not_global_kucoin_revenue'] }),
    metric('btc-reserve-ratio', 'reserve_coverage', 'BTC reserve ratio', 111, ['por'], 'Operator-reported June 30 Merkle snapshot.', { asOf: '2026-06-30', window: 'point-in-time snapshot', scope: 'KuCoin disclosed BTC wallets and user balances', unit: 'percent', currency: 'PERCENT', qualityFlags: ['operator_reported', 'snapshot', 'not_financial_statement_audit'] }),
    metric('usdt-reserve-ratio', 'reserve_coverage', 'USDT reserve ratio', 119, ['por'], 'Operator-reported June 30 Merkle snapshot.', { asOf: '2026-06-30', window: 'point-in-time snapshot', scope: 'KuCoin disclosed USDT wallets and user balances', unit: 'percent', currency: 'PERCENT', qualityFlags: ['operator_reported', 'snapshot', 'not_financial_statement_audit'] }),
  ],
  events: [event('new-york-settlement', 'legal', '2023-12-12', 'KuCoin agreed to customer refunds, a state penalty and an exit from New York.', ['nyag'], 'Official state settlement.'), event('guilty-plea', 'legal', '2025-01-27', 'Peken Global pleaded guilty and accepted penalties, a U.S. exit and management changes.', ['doj-plea', 'reuters'], 'Official disposition and independent coverage.'), event('eu-launch-block', 'regulatory', '2026-05-18', 'The FMA lifted a new-business ban but kept KuCoin EU prohibited from commencing operations.', ['fma-current'], 'Current FMA notice.')],
  feature: { lifecycle: 'mid', operating_model: 'Custodial global spot and derivatives exchange operating through multiple legal entities.', product_cohort: 'centralized_multi_product_exchange', custody_model: 'custodial', token_status: 'launched', token_symbol: 'KCS', token_launch_date: null, token_launch_timing: 'post_product', token_strategy: 'exchange_utility_fee_discounts_and_burns', token_source_url: 'https://www.kucoin.com/en-au/support/47497300094040', metric_type: 'reserve_coverage', metric_unit: 'percent', metric_window: 'point_in_time_snapshot', metric_as_of: '2026-06-30', metric_observed_at: OBSERVED_AT, comparability_key: 'cex|centralized_multi_product_exchange|reserve_coverage|percent|snapshot' },
};

const bithumbSources = [
  source('bithumb', 'fsc-incident', 'Financial authorities respond to Bithumb erroneous bitcoin payouts', 'https://www.fsc.go.kr/eng/pr010101/86230?curPage=&srchBeginDt=&srchCtgry=5&srchEndDt=&srchKey=&srchText=', 'South Korean Financial Services Commission', { publishedAt: '2026-02-08', locator: 'Regulator confirmation of erroneous BTC payouts, compensation planning and ledger-accuracy review.' }),
  source('bithumb', 'fsc-controls', 'FSC inspection findings on virtual-asset exchange internal controls', 'https://www.fsc.go.kr/eng/pr010101/86638?curPage=&srchBeginDt=&srchCtgry=&srchEndDt=&srchKey=&srchText=', 'South Korean Financial Services Commission', { publishedAt: '2026-04-06', locator: 'Inspection findings concerning Bithumb controls and planned sanction-review process.' }),
  source('bithumb', 'operator-incident', 'Bithumb notice on erroneous BTC credits', 'https://feed.bithumb.com/notice/1651924', 'Bithumb', { publishedAt: '2026-02-07', locator: 'Operator-reported 620,000 BTC internal credits, 618,212 BTC recovery and 99.7% recovery ratio.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('bithumb', 'reports', 'Bithumb Korea financial reports', 'https://www.bithumbcorp.com/ko/company/report.php', 'Bithumb Korea', { locator: 'Current corporate financial-report index and reporting-entity boundary.', directHttpStatus: 0, accessMethod: 'browser_rendered_page' }),
  source('bithumb', 'vasp', 'Korean FIU accepts reports from three virtual-asset service providers', 'https://www.fsc.go.kr/eng/pr010101/76569?curPage=14&srchBeginDt=&srchCtgry=3&srchEndDt=&srchKey=&srchText=', 'South Korean Financial Services Commission', { publishedAt: '2021-09-17', locator: 'Historical Bithumb VASP-report acceptance and Korean regulatory perimeter.' }),
  source('bithumb', 'yonhap', 'Bithumb retrieves most bitcoin mistakenly credited to customers', 'https://en.yna.co.kr/view/AEN20260207001551320', 'Yonhap News Agency', { publishedAt: '2026-02-07', tier: 'B', role: 'independent', locator: 'Independent incident chronology, internal-credit scale and affected-customer reporting.' }),
  source('bithumb', 'market-share', 'Bithumb market share falls after fee waivers tied to bitcoin fiasco end', 'https://www.koreatimes.co.kr/economy/cryptocurrency/20260222/bithumb-market-share-falls-after-fee-waivers-tied-to-bitcoin-fiasco-end', 'The Korea Times', { publishedAt: '2026-02-22', tier: 'B', role: 'independent', locator: 'Independent post-incident fee campaign and domestic market-share estimate.' }),
  source('bithumb', 'ipo', 'Bithumb IPO delayed again after bitcoin payout error', 'https://en.sedaily.com/finance/2026/03/03/bithumb-ipo-delayed-again-after-43-billion-bitcoin', 'Seoul Economic Daily', { publishedAt: '2026-03-03', tier: 'B', role: 'independent', locator: 'Independent reporting on IPO timetable, governance scrutiny and incident impact.' }),
  source('bithumb', 'governance', 'Bithumb bitcoin mishap casts doubt on CEO third term', 'https://www.koreatimes.co.kr/economy/cryptocurrency/20260210/bithumb-bitcoin-mishap-casts-doubt-on-ceo-lee-jae-wons-third-term', 'The Korea Times', { publishedAt: '2026-02-10', tier: 'B', role: 'independent', locator: 'Independent governance and control-accountability context.' }),
];

const bithumb = {
  slug: 'bithumb', name: 'Bithumb', aliases: ['Bithumb Korea'], table: 'mid_exchanges',
  operatingState: 'operating_under_control_remediation', outcome: 'operating_domestic_leader_with_control_failure', outcomeConfidence: 'high', qualityConfidence: 'high',
  classification: { subtype: 'Korean-won custodial spot exchange', tags: ['custodial', 'spot', 'krw', 'internal-controls', 'domestic-concentration'], chains: [], jurisdictions: ['South Korea'] },
  sources: bithumbSources,
  statusAssertion: 'Bithumb remained an operating Korean exchange at the review date while regulators reviewed internal-control failures tied to a February 2026 ledger error.', statusSourceKeys: ['fsc-incident', 'fsc-controls', 'reports', 'market-share'], statusEvidenceLocator: 'Current regulator follow-up, corporate reporting and independent market reporting.',
  outcomeAssertion: 'Bithumb is classified as an operating domestic leader under control remediation, not as insolvent or closed.', outcomeSourceKeys: ['fsc-incident', 'fsc-controls', 'operator-incident', 'market-share'], outcomeEvidenceLocator: 'The incident involved erroneous internal credits with reported recovery, while the venue remained active in Korean market-share reporting.',
  identityBoundary: 'The 620,000 BTC figure was an erroneous internal ledger credit, not evidence that Bithumb transferred or owned 620,000 on-chain bitcoin. Operator recovery percentages, regulator findings, corporate financial statements and the Korean spot-market venue are related but separate evidence types.',
  methodologyNotes: ['Incident figures are reported ledger amounts and must not be presented as actual custody assets or a realized $44 billion loss.', 'The market-share value is an approximate independent domestic spot-market estimate after temporary fee waivers ended, not global exchange share.'],
  unknowns: ['Final regulatory sanctions from the 2026 inspections', 'Net realized loss and insurance treatment from the ledger error', 'Current audited customer-asset and liability coverage', 'Final IPO timetable and governance changes'],
  unsourcedFields: ['Final sanctions', 'Final incident loss', 'Current audited reserve coverage', 'Final IPO date'],
  sections: {
    what_it_is: section('Bithumb is a South Korean custodial exchange centered on won-denominated spot trading. Customers rely on Bithumb’s internal ledger, custody and banking access rather than settling every trade directly on-chain. Its strength is concentrated domestic distribution, not a broad global derivatives franchise. That same concentration makes Korean regulation, bank relationships, fee competition and operating controls unusually important to the business.', [claim('Bithumb is a Korean custodial spot exchange.', ['vasp', 'reports'], 'Regulatory and reporting-entity records.'), claim('Customers trade through an internal exchange ledger.', ['fsc-incident', 'operator-incident'], 'Incident mechanics demonstrate off-chain credits.'), claim('Domestic regulation and distribution are central to its operating model.', ['vasp', 'market-share'], 'Korean registration and domestic share reporting.', { kind: 'inference' })]),
    what_happened: section('On February 6, 2026 a rewards-processing error credited customers with a combined 620,000 BTC on Bithumb’s internal system. The operator said it recovered 618,212 BTC of those credits, or 99.7%, while regulators began checking ledger integrity, sales and compensation. In April the FSC said inspections found internal-control deficiencies and that sanctions would be considered after legal review. The exchange continued operating.', [claim('Bithumb reported 620,000 BTC of erroneous internal credits.', ['operator-incident', 'fsc-incident', 'yonhap'], 'Operator, regulator and independent incident records.'), claim('The operator reported recovering 618,212 BTC, or 99.7% of the credits.', ['operator-incident'], 'Operator recovery notice.'), claim('The FSC later identified control deficiencies and had not yet finalized sanctions.', ['fsc-controls'], 'April inspection update.')]),
    why_this_outcome: section('Bithumb’s domestic brand, won market and promotional pricing preserved meaningful market share, but rapid operational campaigns ran through controls that failed on an extraordinary scale. The February event was not a blockchain exploit; it was a software-and-ledger governance failure. Regulators and users therefore have to judge the process that approved rewards, the ability to reverse mistaken credits and the company’s capacity to prevent a repeat—not just whether most entries were recovered.', [claim('The incident was an internal rewards and ledger error rather than an on-chain exploit.', ['operator-incident', 'fsc-incident'], 'Incident descriptions.', { kind: 'inference' }), claim('Fee promotions were tied to Bithumb’s post-incident market-share effort.', ['market-share'], 'Independent market reporting.'), claim('Reported recovery does not by itself prove control remediation.', ['operator-incident', 'fsc-controls'], 'Recovery and later inspection are distinct.', { kind: 'inference' })]),
    strategic_choices: section('Bithumb chose to compete aggressively in a concentrated Korean spot market with fee waivers and promotional rewards, while also pursuing an IPO. Those choices can win volume and brand attention, but they raise the cost of operational mistakes when reward logic and internal approvals are weak. After the error, the company emphasized recovery and compensation; regulators shifted attention to control design, and independent reporting linked the incident to renewed IPO and governance uncertainty.', [claim('Bithumb used fee waivers and promotions to compete for domestic share.', ['market-share', 'operator-incident'], 'Independent share report and rewards incident.'), claim('Bithumb was pursuing an IPO whose timetable faced renewed uncertainty.', ['ipo'], 'Independent corporate-finance reporting.'), claim('Control design, not only customer recovery, became a regulator focus.', ['fsc-controls'], 'Inspection findings.')]),
    operating_model: section('Bithumb takes custody of customer assets, maintains account balances and matches won-denominated spot trades on an internal ledger. Its economic engine is trading activity and related fees, shaped by competition with Upbit and access to Korean banking rails. Temporary fee waivers can raise market share while reducing immediate fee capture. Public corporate reports provide company-level financial history, but the reviewed record does not provide a current audited reserve-to-customer-liability ratio.', [claim('Bithumb uses custodial account balances and internal matching.', ['fsc-incident', 'operator-incident'], 'Ledger and recovery mechanics.'), claim('Fee policy can change domestic trading share and immediate fee capture.', ['market-share'], 'Post-waiver share reporting.', { kind: 'inference' }), claim('A current audited customer-liability coverage ratio was not found in the reviewed record.', ['reports', 'fsc-controls'], 'Disclosure gap.', { kind: 'unknown' })]),
    token_and_value_capture: section('The reviewed current Bithumb corporate, regulatory and incident sources do not identify a live Bithumb venue token that gives users exchange ownership or a fee claim. Value capture therefore appears to sit in the operating company’s trading economics and, if an IPO eventually occurs, its corporate securities—not an exchange-token market. This is a bounded research finding, not proof that no promotional or historical token has ever used the name.', [claim('Reviewed current sources do not identify a live Bithumb exchange token.', ['reports', 'vasp', 'operator-incident'], 'Current corporate, regulatory and operator-source review.', { kind: 'unknown' }), claim('Trading economics accrue to the operating company rather than automatically to users.', ['reports', 'market-share'], 'Corporate and fee-competition boundary.', { kind: 'inference' }), claim('A future IPO security would be distinct from an exchange utility token.', ['ipo'], 'Corporate-finance boundary.', { kind: 'inference' })]),
    counterfactual: section('Stronger change control, staged reward deployment, hard balance ceilings and independent reconciliation could have prevented or contained the erroneous credits before they reached customer accounts. A less aggressive promotion might also have reduced operational pressure, though the evidence does not show that marketing speed directly caused the bug. For the business, a credible controls reset before reviving the IPO would matter more than another short fee campaign.', [claim('Ledger controls and reconciliation were the direct remediation domain identified by regulators.', ['fsc-incident', 'fsc-controls'], 'Regulator response.'), claim('Staged deployment and balance ceilings could have contained the error.', ['fsc-incident', 'operator-incident'], 'Analyst counterfactual grounded in the incident mechanics.', { kind: 'inference' }), claim('The evidence does not prove fee promotion caused the software error.', ['market-share', 'operator-incident'], 'Separate marketing and technical records.', { kind: 'unknown' })]),
    risks_and_unknowns: section('The key risks are internal ledger integrity, governance accountability, final sanctions, domestic concentration and custody. Bithumb says it recovered nearly all erroneous entries, but that is not the same as a final audited loss number or proof that no customer was harmed. Market share around the mid-20s after fee waivers ended shows a large franchise, yet it remains an estimate from one domestic period. The final IPO and control consequences remain open.', [claim('Internal-control deficiencies were identified by the FSC.', ['fsc-controls'], 'Regulator inspection update.'), claim('Operator recovery figures are not a final audited loss determination.', ['operator-incident', 'fsc-incident'], 'Different evidence scopes.', { kind: 'inference' }), claim('Final sanctions, loss and IPO consequences remain unknown.', ['fsc-controls', 'ipo'], 'Open regulatory and corporate processes.', { kind: 'unknown' })]),
    lifecycle: section('Bithumb grew into one of South Korea’s two dominant exchanges through domestic brand recognition, won trading and aggressive fee competition. It completed the country’s VASP reporting process in 2021 and continued pursuing public-market ambitions. The 2026 rewards error exposed how much trust depends on the internal ledger and governance. Its current phase is continued operation under scrutiny, with the recovery claim strong enough to avoid a collapse label but not enough to close the case.', [claim('Bithumb completed the Korean VASP reporting process in 2021.', ['vasp'], 'Official regulator record.'), claim('The exchange remained a material domestic venue after the incident.', ['market-share'], 'Independent market-share reporting.'), claim('The lifecycle call is operating under remediation rather than failed.', ['fsc-controls', 'market-share'], 'Regulatory follow-up and continuing market activity.', { kind: 'inference' })]),
    outlook_and_watch: section('Watch the final FSC sanctions, audited incident cost, control changes, customer complaints, Korean market share, banking access and the IPO timetable. The call improves if Bithumb publishes a clear root-cause review, independent assurance and sustained share without uneconomic fee waivers. It worsens if another ledger failure appears or regulators find deeper governance problems. Headline recovered BTC entries should never substitute for verified cash loss and customer-liability data.', [claim('Final regulator action and root-cause disclosure would directly change the control assessment.', ['fsc-controls', 'fsc-incident'], 'Open regulatory process.', { kind: 'inference' }), claim('Sustained share without fee waivers is a stronger demand signal than temporary promotion volume.', ['market-share'], 'Independent fee-period comparison.', { kind: 'inference' }), claim('Audited incident cost and current liability coverage remain unknown.', ['reports', 'fsc-controls'], 'Disclosure gap.', { kind: 'unknown' })]),
  },
  metrics: [
    metric('domestic-share', 'market_share', 'Approximate Korean spot-market share after fee waivers', 25, ['market-share'], 'Independent description of share in the mid-20% range after waivers ended.', { asOf: '2026-02-22', window: 'post-incident observation', scope: 'South Korean crypto-exchange spot market', unit: 'percent', currency: 'PERCENT', qualityFlags: ['approximate_midpoint', 'independent_estimate', 'domestic_market_only', 'post_fee_waiver'] }),
  ],
  events: [event('ledger-error', 'operational_incident', '2026-02-06', 'A rewards-processing error created 620,000 BTC of erroneous internal account credits.', ['operator-incident', 'fsc-incident', 'yonhap'], 'Operator, regulator and independent incident records.'), event('recovery-report', 'operational_recovery', '2026-02-07', 'Bithumb reported recovering 618,212 BTC of erroneous ledger credits.', ['operator-incident'], 'Operator notice; not an on-chain asset recovery figure.'), event('control-findings', 'regulatory', '2026-04-06', 'The FSC reported control deficiencies and a pending sanction-review process.', ['fsc-controls'], 'Official inspection update.')],
  feature: { lifecycle: 'mid', operating_model: 'Custodial Korean-won spot exchange using an internal order and balance ledger.', product_cohort: 'centralized_spot_exchange', custody_model: 'custodial', token_status: 'not_identified', token_symbol: null, token_launch_date: null, token_launch_timing: 'unknown', token_strategy: 'no_current_venue_token_identified', token_source_url: 'https://www.bithumbcorp.com/ko/company/report.php', metric_type: 'market_share', metric_unit: 'percent', metric_window: 'post_incident_observation', metric_as_of: '2026-02-22', metric_observed_at: OBSERVED_AT, comparability_key: 'cex|centralized_spot_exchange|market_share|percent|domestic_observation' },
};

const quadrigaSources = [
  source('quadrigacx', 'osc-release', 'OSC publishes investigative report on QuadrigaCX', 'https://www.newswire.ca/news-releases/osc-publishes-investigative-report-of-quadrigacx-871268566.html', 'Ontario Securities Commission via Canada Newswire', { publishedAt: '2020-06-11', locator: 'OSC staff conclusion, affected-investor count and aggregate loss estimate.' }),
  source('quadrigacx', 'osc-funds', 'Where did the Quadriga funds go?', 'https://www.osc.gov.on.ca/quadrigacxreport/where-did-the-funds-go.html', 'Ontario Securities Commission', { publishedAt: '2020-06-11', locator: 'C$215 million customer liabilities, C$46 million identified assets and C$169 million shortfall breakdown.' }),
  source('quadrigacx', 'osc-conclusion', 'QuadrigaCX investigation: conclusion', 'https://www.osc.gov.on.ca/quadrigacxreport/conclusion.html', 'Ontario Securities Commission', { publishedAt: '2020-06-11', locator: 'OSC staff findings on registration, asset handling, misleading statements and enforcement limitations.' }),
  source('quadrigacx', 'osc-report', 'QuadrigaCX: a review by staff of the Ontario Securities Commission', 'https://www.osc.gov.on.ca/quadrigacxreport/web/files/QuadrigaCX-A-Review-by-Staff-of-the-Ontario-Securities-Commission.pdf', 'Ontario Securities Commission', { publishedAt: '2020-04-14', locator: 'Full staff investigative record and methodology.', accessMethod: 'direct_pdf' }),
  source('quadrigacx', 'ey-distribution', 'QuadrigaCX second interim status report', 'https://documentcentre.ey.com/api/Document/download?docId=37250&language=EN', 'Ernst & Young Inc., bankruptcy trustee', { publishedAt: '2023-05-12', locator: 'First interim dividend of 13.094156% of proven claims and reserve for future administration.', accessMethod: 'direct_pdf' }),
  source('quadrigacx', 'ey-estate', 'QuadrigaCX court and creditor document centre', 'https://documentcentre.ey.com/#/detail-engmt?eid=337', 'Ernst & Young Inc., bankruptcy trustee', { locator: 'Current official estate document index and bankruptcy-estate boundary.' }),
  source('quadrigacx', 'coindesk', 'Quadriga was a Ponzi scheme, Ontario securities regulator says', 'https://www.coindesk.com/markets/2020/06/11/quadriga-was-a-ponzi-scheme-ontario-securities-regulator-says', 'CoinDesk', { publishedAt: '2020-06-11', tier: 'B', role: 'independent', locator: 'Independent account of OSC staff findings and loss breakdown.' }),
  source('quadrigacx', 'bloomberg', 'Quadriga downfall stemmed from founder fraud, regulators find', 'https://news.bloomberglaw.com/banking-law/quadriga-downfall-stemmed-from-founders-fraud-regulators-find', 'Bloomberg Law', { publishedAt: '2020-06-11', tier: 'B', role: 'independent', locator: 'Independent account of the regulator findings and enforcement context.' }),
];

const quadrigaCx = {
  slug: 'quadrigacx', name: 'QuadrigaCX', aliases: ['Quadriga', '0984750 B.C. Ltd.'], table: 'dead_exchanges',
  operatingState: 'closed_bankruptcy_estate', outcome: 'failed_fraud_with_partial_creditor_recovery', outcomeConfidence: 'high', qualityConfidence: 'high',
  classification: { subtype: 'failed Canadian custodial spot exchange and bankruptcy estate', tags: ['custodial', 'spot', 'failed', 'fraud-finding', 'bankruptcy', 'creditor-recovery'], chains: [], jurisdictions: ['Canada'] },
  sources: quadrigaSources,
  statusAssertion: 'QuadrigaCX is closed and its remaining affairs are handled through the bankruptcy estate; the exchange is not operating.', statusSourceKeys: ['osc-release', 'ey-estate', 'ey-distribution'], statusEvidenceLocator: 'Regulator collapse report and current trustee estate records.',
  outcomeAssertion: 'QuadrigaCX is classified as a failed exchange caused primarily by founder fraud, with only partial creditor recovery.', outcomeSourceKeys: ['osc-funds', 'osc-conclusion', 'osc-report', 'ey-distribution', 'coindesk'], outcomeEvidenceLocator: 'OSC staff forensic findings and trustee dividend record.',
  identityBoundary: 'QuadrigaCX the closed venue, 0984750 B.C. Ltd. the bankrupt company, Gerald Cotten the deceased founder, and the EY-administered bankruptcy estate are separate subjects. OSC staff findings are authoritative regulatory findings, not a criminal conviction; Cotten died before charges or a trial.',
  methodologyNotes: ['C$215 million liabilities, C$46 million identified assets and C$169 million shortfall are one OSC breakdown and must not be added together.', 'The 13.094156% payment was an interim dividend on proven claims at court-fixed conversion values, not recovery of the original crypto units or current market value.'],
  unknowns: ['Final estate distribution percentage', 'Ultimate resolution of remaining disputed claims and reserves', 'Whether additional assets will ever be recovered', 'Exact loss for each customer after claim conversion and levy'],
  unsourcedFields: ['Final creditor recovery', 'Final disputed claims', 'Future asset recovery', 'Individual customer realized loss'],
  sections: {
    what_it_is: section('QuadrigaCX was a Canadian custodial crypto exchange that held customer assets and maintained an internal trading ledger. It stopped operating in 2019 and is now only a bankruptcy estate administered by Ernst & Young. This report therefore separates the dead venue from the continuing claims process. A trustee distribution is estate recovery, not evidence that Quadriga has reopened or that customers recovered their original crypto.', [claim('QuadrigaCX was a Canadian custodial exchange.', ['osc-report', 'osc-conclusion'], 'Regulator business-model findings.'), claim('The exchange is closed and the remaining process is a bankruptcy estate.', ['ey-estate', 'ey-distribution'], 'Trustee records.'), claim('Estate distributions do not represent renewed exchange operation.', ['ey-distribution'], 'Bankruptcy-dividend context.', { kind: 'inference' })]),
    what_happened: section('Quadriga lost access to normal operations after founder Gerald Cotten died in December 2018, but the later OSC investigation found that the central problem was not simply lost cold-wallet keys. Staff concluded that Cotten controlled the business, created false balances, traded against customers and diverted assets, producing a C$169 million shortfall. The company entered bankruptcy, and the trustee later paid an interim dividend on accepted claims.', [claim('The OSC found that founder conduct, not only lost keys, caused the collapse.', ['osc-release', 'osc-report', 'osc-conclusion'], 'Staff investigative conclusion.'), claim('The OSC calculated a C$169 million customer shortfall.', ['osc-funds'], 'Regulator loss breakdown.'), claim('The trustee declared an interim dividend for creditors with proven claims.', ['ey-distribution'], 'Trustee status report.')]),
    why_this_outcome: section('Quadriga concentrated custody, accounting, trading and authority in one founder without effective internal controls or independent oversight. That let fabricated account balances and self-dealing remain hidden while customer deposits funded withdrawals and losses. The market downturn exposed the gap because new inflows could no longer cover obligations. Cotten’s death removed the only operator with complete knowledge, but OSC staff found the financial hole already existed.', [claim('Cotten exercised broad control without adequate oversight.', ['osc-report', 'osc-conclusion'], 'Regulator governance findings.'), claim('OSC staff found fabricated trading and misuse of customer assets.', ['osc-funds', 'osc-report'], 'Forensic loss categories.'), claim('Cotten’s death exposed rather than created most of the shortfall.', ['osc-release', 'osc-funds'], 'Regulator causal finding.', { kind: 'inference' })]),
    strategic_choices: section('Quadriga chose founder-controlled wallets, weak books, no meaningful segregation and no effective checks on proprietary activity. It also operated without securities registration while customers believed balances represented assets held for them. Those were not ordinary startup tradeoffs; they removed the controls that could have exposed misuse. Once the exchange failed, bankruptcy converted customer positions into claims at court-fixed values, shifting control from the venue to the trustee.', [claim('Quadriga operated without registration and adequate controls.', ['osc-conclusion', 'osc-report'], 'OSC findings.'), claim('Customer assets were not reliably segregated from founder activity.', ['osc-funds', 'osc-report'], 'Forensic tracing.'), claim('Bankruptcy converted exchange balances into estate claims.', ['ey-distribution'], 'Trustee claim and dividend process.', { kind: 'inference' })]),
    operating_model: section('Customers deposited fiat and crypto with Quadriga and traded balances on its internal ledger. The exchange and Cotten controlled the wallets, payment processors and records, while reported balances could exceed real assets. According to OSC staff, later deposits were used to satisfy earlier withdrawals and fund Cotten’s trading and personal spending. After bankruptcy, EY—not the exchange—validated claims and distributed available Canadian-dollar estate funds.', [claim('Quadriga held customer assets and maintained an internal ledger.', ['osc-report', 'osc-funds'], 'Regulator operating-model findings.'), claim('OSC staff found later deposits were used to meet withdrawals and other spending.', ['osc-release', 'osc-funds'], 'Ponzi-like flow findings.'), claim('EY administers claims and distributions after closure.', ['ey-distribution', 'ey-estate'], 'Trustee records.')]),
    token_and_value_capture: section('The reviewed regulator and trustee record does not identify a Quadriga venue token. Value was captured through exchange fees and, according to OSC staff, through Cotten’s unauthorized use of customer assets. Customers held account claims, not equity or a protected reserve token. In bankruptcy those balances became Canadian-dollar proven claims using court-fixed exchange rates, so the interim distribution cannot be read as a token return or original-asset repayment.', [claim('Reviewed OSC and trustee sources do not identify a Quadriga exchange token.', ['osc-report', 'ey-distribution'], 'Regulator and estate record review.', { kind: 'unknown' }), claim('OSC staff found unauthorized founder value extraction from customer assets.', ['osc-funds', 'osc-conclusion'], 'Forensic loss findings.'), claim('Bankruptcy dividends are Canadian-dollar claim payments, not token economics.', ['ey-distribution'], 'Trustee conversion and dividend method.', { kind: 'inference' })]),
    counterfactual: section('Independent custody controls, wallet reconciliation, separation of customer assets, audited books and limits on founder trading would likely have exposed the shortfall much earlier. Registration and credible oversight could have forced those controls or stopped the venue from taking more deposits. No control can guarantee survival, but Quadriga’s failure required multiple basic protections to be absent at once. A normal key-management plan alone would not have fixed fabricated balances and asset diversion.', [claim('Segregation and reconciliation address the specific failures documented by OSC staff.', ['osc-report', 'osc-funds'], 'Analyst counterfactual grounded in forensic findings.', { kind: 'inference' }), claim('Registration and oversight could have exposed or constrained the misconduct.', ['osc-conclusion'], 'OSC policy conclusion.', { kind: 'inference' }), claim('Better key management alone would not fix false balances and diversion.', ['osc-funds', 'osc-report'], 'Distinct failure mechanisms.', { kind: 'inference' })]),
    risks_and_unknowns: section('For the venue, the risk is settled: it is closed and will not resume normal exchange operations. For creditors, the open risks are estate costs, disputed claims, tax and legal reserves, conversion-date effects and whether more assets are found. The first interim dividend was 13.094156% of proven claims before the statutory levy, not a final recovery rate. Individual outcomes differ by accepted claim, original asset and market move after the conversion date.', [claim('Quadriga is a closed venue rather than an operating exchange.', ['osc-release', 'ey-estate'], 'Regulator and trustee records.'), claim('The 13.094156% dividend was interim and subject to a levy.', ['ey-distribution'], 'Trustee paragraph 13.'), claim('Final recovery and individual economic loss remain unknown.', ['ey-distribution'], 'Future distribution and claim-specific uncertainty.', { kind: 'unknown' })]),
    lifecycle: section('Quadriga grew into a major Canadian exchange, accumulated customer liabilities without matching assets and collapsed after Cotten’s death in late 2018. Bankruptcy and the OSC investigation replaced the lost-keys story with a documented fraud-and-controls explanation. By 2023 the trustee could distribute a first interim dividend, but the exchange itself remained dead. Its lifecycle is failure followed by estate recovery, not a turnaround or relaunch.', [claim('Quadriga collapsed in the period following Cotten’s December 2018 death.', ['osc-release', 'osc-report'], 'Regulator chronology.'), claim('The OSC investigation established a broader fraud-and-controls cause.', ['osc-funds', 'osc-conclusion'], 'Staff findings.'), claim('Creditor recovery continued without a venue relaunch.', ['ey-distribution', 'ey-estate'], 'Trustee process.', { kind: 'inference' })]),
    outlook_and_watch: section('Watch the EY document centre for a final distribution, reserve releases, disputed-claim decisions and any newly recovered assets. The final creditor outcome improves only if more estate value becomes distributable after costs and claims. Nothing in the current record supports reopening the exchange. For future CEX analysis, Quadriga’s durable signals are founder concentration, unverifiable internal balances, weak segregation and a narrative that blamed key access before forensic accounting showed a deeper hole.', [claim('Future estate distributions and claim decisions are the remaining live milestones.', ['ey-distribution', 'ey-estate'], 'Trustee process.', { kind: 'inference' }), claim('The current record does not support a Quadriga reopening.', ['ey-estate', 'osc-conclusion'], 'Bankruptcy and closure record.', { kind: 'inference' }), claim('Final distributable value remains unknown.', ['ey-distribution'], 'Interim-status limitation.', { kind: 'unknown' })]),
  },
  metrics: [
    metric('customer-liabilities', 'customer_liabilities', 'Customer liabilities identified by OSC staff', 215000000, ['osc-funds'], 'OSC forensic balance-sheet reconstruction.', { asOf: '2019-04-15', window: 'collapse reconstruction', scope: 'QuadrigaCX customer obligations', unit: 'cad', currency: 'CAD', qualityFlags: ['regulator_reconstruction', 'historical', 'not_additive_with_shortfall'] }),
    metric('customer-shortfall', 'customer_shortfall', 'Customer shortfall identified by OSC staff', 169000000, ['osc-funds', 'osc-release'], 'OSC forensic balance-sheet reconstruction.', { asOf: '2019-04-15', window: 'collapse reconstruction', scope: 'QuadrigaCX customer obligations less identified assets', unit: 'cad', currency: 'CAD', qualityFlags: ['regulator_reconstruction', 'historical', 'not_additive_with_liabilities_or_assets'] }),
    metric('first-interim-dividend', 'creditor_recovery', 'First interim dividend on proven claims', 13.094156, ['ey-distribution'], 'Trustee-declared dividend before statutory levy.', { asOf: '2023-05-12', window: 'first interim distribution', scope: 'Accepted proven claims in the Quadriga bankruptcy', unit: 'percent', currency: 'PERCENT', qualityFlags: ['interim_not_final', 'less_statutory_levy', 'court_fixed_claim_values', 'not_original_asset_recovery'] }),
  ],
  events: [event('closure', 'closure', '2019-02-05', 'Quadriga sought creditor protection after stopping normal exchange operations.', ['osc-report', 'osc-release'], 'Regulator chronology.'), event('bankruptcy', 'bankruptcy', '2019-04-15', 'Quadriga entered bankruptcy and claims were valued using court-fixed conversion rates.', ['ey-distribution'], 'Trustee background and conversion method.'), event('osc-findings', 'regulatory_finding', '2020-06-11', 'OSC staff published findings that founder fraud caused the collapse.', ['osc-release', 'osc-report', 'osc-conclusion'], 'Official staff report; not a criminal conviction.'), event('interim-dividend', 'recovery', '2023-05-12', 'The trustee declared a 13.094156% interim dividend on proven claims before the levy.', ['ey-distribution'], 'Trustee status report.')],
  feature: { lifecycle: 'dead', operating_model: 'Closed custodial spot exchange whose remaining bankruptcy estate is administered by Ernst & Young.', product_cohort: 'centralized_spot_exchange', custody_model: 'custodial', token_status: 'not_identified', token_symbol: null, token_launch_date: null, token_launch_timing: 'unknown', token_strategy: 'no_venue_token_identified', token_source_url: 'https://www.osc.gov.on.ca/quadrigacxreport/conclusion.html', metric_type: 'customer_shortfall', metric_unit: 'cad', metric_window: 'collapse_reconstruction', metric_as_of: '2019-04-15', metric_observed_at: OBSERVED_AT, comparability_key: 'cex|centralized_spot_exchange|customer_shortfall|cad|collapse_reconstruction' },
};

// PROFILE_SPECS_START

const specs = [bitmart, htx, kucoin, bithumb, quadrigaCx];

export const document = {
  schema: 'chaindump-cex-wave-e-v1',
  research_as_of: AS_OF,
  generated_migration: '0095_cex_wave_e_profiles.sql',
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
  return `INSERT INTO _cex_wave_e_profiles_0095 (
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

DROP TABLE IF EXISTS _cex_wave_e_profiles_0095;

CREATE TABLE _cex_wave_e_profiles_0095 (
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
FROM _cex_wave_e_profiles_0095 AS staged
WHERE staged.target_table = 'successful_exchanges'
  AND exchange_row.type = 'cex'
  AND exchange_row.slug = staged.slug;

UPDATE mid_exchanges AS exchange_row
SET profile = json_set(
  CASE WHEN json_valid(exchange_row.profile) AND json_type(exchange_row.profile) = 'object'
    THEN exchange_row.profile ELSE '{}' END,
  '$.canonical_profile', json(staged.canonical_profile)
)
FROM _cex_wave_e_profiles_0095 AS staged
WHERE staged.target_table = 'mid_exchanges'
  AND exchange_row.kind = 'cex'
  AND exchange_row.slug = staged.slug;

UPDATE dead_exchanges AS exchange_row
SET profile = json_set(
  CASE WHEN json_valid(exchange_row.profile) AND json_type(exchange_row.profile) = 'object'
    THEN exchange_row.profile ELSE '{}' END,
  '$.canonical_profile', json(staged.canonical_profile)
)
FROM _cex_wave_e_profiles_0095 AS staged
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
FROM _cex_wave_e_profiles_0095
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

DROP TABLE _cex_wave_e_profiles_0095;
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

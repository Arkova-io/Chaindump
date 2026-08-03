#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYSIS_SECTION_KEYS, validateEntityProfile } from '../src/lib/entity-profile.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(root, 'docs/cex-wave-f-profiles-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0101_cex_wave_f_profiles.sql');
const AS_OF = '2026-08-03';
const ACCESSED_AT = '2026-08-03T22:00:00Z';
const OBSERVED_AT = ACCESSED_AT;
const NEXT_REVIEW_AT = '2026-08-10T22:00:00Z';
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
  return { assertion, value, sourceKeys, evidenceLocator, confidence, kind, supportDirection, note };
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
    key, dimension, label, value, unit, currency,
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
    return { id, type: entry.type, date: entry.date, description: entry.description, claim_ids: [claimId] };
  });

  const profile = {
    schema: 'chaindump-entity-profile',
    version: 1,
    identity: { id: `cex:${spec.slug}`, type: 'cex', slug: spec.slug, name: spec.name, aliases: spec.aliases },
    classification: spec.classification,
    status: { operating_state: spec.operatingState, as_of: AS_OF, claim_ids: [statusClaimId] },
    outcome: { label: spec.outcome, as_of: AS_OF, rule_id: 'exchange-lifecycle-v1', confidence: spec.outcomeConfidence, claim_ids: [outcomeClaimId] },
    analysis: { sections },
    metrics,
    events,
    sources: spec.sources,
    claims,
    freshness: { state: 'current', last_reviewed_at: ACCESSED_AT, next_review_at: NEXT_REVIEW_AT, field_reviews: [] },
    quality: { publication_state: 'review', completeness_pct: 100, confidence: spec.qualityConfidence, unsourced_fields: spec.unsourcedFields },
    extensions: {
      legacy_origin: spec.table,
      identity_boundary: spec.identityBoundary,
      methodology_notes: [
        'Freshness records source assembly, not human approval; every claim remains pending review.',
        'Legal entities, venue brands, parent companies, recovery estates, custody liabilities and tokens are kept separate.',
        ...spec.methodologyNotes,
      ],
      explicit_unknowns: spec.unknowns,
    },
  };
  const errors = validateEntityProfile(profile);
  if (errors.length) throw new Error(`${spec.slug}: ${JSON.stringify(errors)}`);
  return profile;
}

// PROFILE_SPECS_START

const ascendexSources = [
  source('ascendex', 'cessation', 'Cessation of operations and processing of withdrawals', 'https://ascendex.com/en/support/articles/138693', 'AscendEX', { publishedAt: '2026-07-06', locator: 'Operator notice confirming the July 1 cessation, lack of MiCA authorization, service shutdown and manual withdrawal review.', directHttpStatus: 404, accessMethod: 'indexed_browser_snapshot' }),
  source('ascendex', 'mica', 'Regulation (EU) 2023/1114 on markets in crypto-assets', 'https://eur-lex.europa.eu/eli/reg/2023/1114/oj', 'European Union', { publishedAt: '2023-05-31', locator: 'Articles 59 and 143 governing authorization and the July 1, 2026 end of the maximum transition period.' }),
  source('ascendex', 'asd', 'What is ASD', 'https://ascendex.com/ko/support/articles/36308', 'AscendEX', { publishedAt: '2019-11-06', locator: 'Operator description of ASD utility, holder benefits and supply mechanics.', directHttpStatus: 404, accessMethod: 'indexed_browser_snapshot' }),
  source('ascendex', 'asds', 'What is ASDS', 'https://ascendex.com/en/support/articles/36312', 'AscendEX', { publishedAt: '2019-11-06', locator: 'Operator explanation that ASDS records consumed ASD and cannot be traded or converted back.', directHttpStatus: 404, accessMethod: 'indexed_browser_snapshot' }),
  source('ascendex', 'futures', 'Margin and leverage', 'https://ascendex.com/en/support/articles/62084', 'AscendEX', { publishedAt: '2021-12-10', locator: 'Operator description of the futures multi-asset collateral and margin model.', directHttpStatus: 404, accessMethod: 'indexed_browser_snapshot' }),
  source('ascendex', 'fees', 'AscendEX VIP fee and rebate structure', 'https://ascendex.com/en/support/articles/1699', 'AscendEX', { publishedAt: '2021-10-18', locator: 'Operator description of trading-volume and ASD-holding fee tiers.', directHttpStatus: 404, accessMethod: 'indexed_browser_snapshot' }),
  source('ascendex', 'cryptoslate', 'AscendEX shuts down after MiCA miss and warns some withdrawals may not be processed', 'https://cryptoslate.com/ascendex-shuts-down-after-mica-miss-and-warns-some-withdrawals-may-not-be-processed/', 'CryptoSlate', { publishedAt: '2026-07-07', tier: 'B', role: 'independent', locator: 'Independent coverage of the operator notice and unresolved withdrawal process.', directHttpStatus: 403, accessMethod: 'indexed_browser_snapshot' }),
  source('ascendex', 'crowdfund', 'Crypto exchange AscendEX halts all operations', 'https://www.crowdfundinsider.com/2026/07/290550-crypto-exchange-ascendex-halts-all-operations-offers-no-guarantees-on-customer-fund-withdrawals/', 'Crowdfund Insider', { publishedAt: '2026-07-07', tier: 'C', role: 'independent', locator: 'Independent account of cessation, withdrawal uncertainty and the absence of a confirmed bankruptcy filing.' }),
];

const ascendex = {
  slug: 'ascendex', name: 'AscendEX', aliases: ['BitMax', 'AscendEX Exchange'], table: 'dead_exchanges',
  operatingState: 'ceased_operations_manual_withdrawal_review', outcome: 'unresolved_wind_down_after_authorization_and_operating_constraints', outcomeConfidence: 'high', qualityConfidence: 'high',
  classification: { subtype: 'ceased custodial multi-product exchange with unresolved withdrawals', tags: ['custodial', 'spot', 'derivatives', 'lending', 'staking', 'ceased', 'exchange-token'], chains: [], jurisdictions: ['global', 'European Union'] },
  sources: ascendexSources,
  statusAssertion: 'AscendEX ceased crypto-asset services on July 1, 2026 and limited account access to offboarding functions, with withdrawals under manual review.', statusSourceKeys: ['cessation', 'cryptoslate', 'crowdfund'], statusEvidenceLocator: 'Dated operator notice corroborated by independent coverage.',
  outcomeAssertion: 'AscendEX is an unresolved wind-down rather than a confirmed bankruptcy or completed customer-loss event.', outcomeSourceKeys: ['cessation', 'cryptoslate', 'crowdfund'], outcomeEvidenceLocator: 'The operator disclosed cessation and possible legal or insolvency constraints but no formal insolvency proceeding or final recovery result.',
  identityBoundary: 'This profile covers the AscendEX/BitMax custodial venue and its offboarding process. ASD is the venue utility token; ASDS is a non-tradable accounting representation of consumed ASD. A lack of MiCA authorization explains the EU deadline but does not by itself prove insolvency or quantify customer losses.',
  methodologyNotes: ['The legacy $240 million reserve-drop and liquidity-injection story is excluded because the reviewed primary record does not substantiate it.', 'The operator names regulatory, financial and operational considerations together, so this report does not reduce the closure to MiCA alone.'],
  unknowns: ['Total customer liabilities and liquid reserves', 'Number and value of withdrawals completed or rejected', 'Whether formal insolvency proceedings will begin', 'Post-closure rights and utility of ASD'],
  unsourcedFields: ['Audited asset-liability reconciliation', 'Withdrawal completion statistics', 'Formal insolvency status', 'Final ASD treatment'],
  sections: {
    what_it_is: section('AscendEX, previously called BitMax, was a custodial centralized exchange offering spot markets, leveraged products, futures, staking and lending-like services. Customers relied on the venue to hold balances and process withdrawals. It also issued ASD, a utility token tied to platform benefits. Since July 1, 2026 the trading business has been closed and only limited offboarding functions remain.', [claim('AscendEX operated a custodial multi-product crypto venue.', ['cessation', 'futures'], 'Operator product and closure records.'), claim('ASD was a venue utility token with platform benefits.', ['asd', 'fees'], 'Operator token and fee records.'), claim('Only limited offboarding access remained after service cessation.', ['cessation'], 'Section one of the operator notice.')]),
    what_happened: section('AscendEX stopped all crypto-asset services on July 1, 2026. Its July 6 notice said it lacked authorization under the EU Markets in Crypto-Assets regime and also cited broader regulatory, financial and operational considerations. Automated withdrawals were paused and every request moved to manual review, with no assurance on timing or amount. No reviewed source confirms a bankruptcy filing.', [claim('AscendEX ceased operations effective July 1, 2026.', ['cessation'], 'Dated operator notice.'), claim('The operator lacked MiCA authorization and cited additional financial and operational considerations.', ['cessation', 'mica'], 'Operator explanation and EU authorization rule.'), claim('No reviewed source confirms a bankruptcy filing.', ['cessation', 'crowdfund'], 'Operator wording and independent status report.', { kind: 'unknown' })]),
    why_this_outcome: section('The clearest documented constraint was authorization: the maximum MiCA transition period ended July 1 and AscendEX said it did not hold the required approval. But the company expressly named financial and operational factors too, then adopted a withdrawal process that allowed delays or non-processing. That combination points to a broader wind-down problem whose balance-sheet cause remains undisclosed, not a simple compliance migration.', [claim('The MiCA transition period could run no later than July 1, 2026.', ['mica'], 'Article 143.'), claim('AscendEX said it did not hold authorization under MiCA.', ['cessation'], 'Operator causal statement.'), claim('The financial and operational contribution to the closure remains unquantified.', ['cessation'], 'The operator listed factors but published no supporting accounts.', { kind: 'unknown' })]),
    strategic_choices: section('AscendEX chose a broad product stack spanning spot, futures, leveraged tokens, staking and lending, then tied fee benefits and other services to ASD holdings. That increased the number of products and customer obligations that had to be shut down at once. Management also waited until after the July 1 effective cessation to publish its detailed retail notice on July 6. The record does not show when licensing or narrower-market alternatives were rejected.', [claim('AscendEX operated multiple trading and yield products.', ['cessation', 'futures'], 'Service list and futures documentation.'), claim('ASD holdings were used in fee tiers and platform benefits.', ['asd', 'fees'], 'Operator token mechanics.'), claim('The timing and rejection of licensing or retrenchment alternatives are not published.', ['cessation', 'mica'], 'Disclosure gap.', { kind: 'unknown' })]),
    operating_model: section('Users deposited assets into accounts controlled by AscendEX, traded through venue-managed markets and relied on the operator for withdrawals. Futures used multi-asset collateral, while trading fees varied with volume and ASD holdings. This model combined custody, leverage and token incentives inside one operator. The reviewed record provides no audited final balance sheet, customer-liability ledger or withdrawal service level for the wind-down.', [claim('AscendEX controlled service access and withdrawal processing.', ['cessation'], 'Offboarding and review rules.'), claim('Futures used multi-asset collateral and venue risk controls.', ['futures'], 'Operator futures documentation.'), claim('No audited closing balance sheet or withdrawal service level was found.', ['cessation', 'cryptoslate'], 'Disclosure gap.', { kind: 'unknown' })]),
    token_and_value_capture: section('ASD was marketed as AscendEX’s utility token for platform services and fee advantages. Consumed ASD could be represented as ASDS, which the operator said was non-tradable and could not be converted back. That design linked token usefulness to a functioning venue. Once services stopped, the main disclosed utility disappeared, but the record does not establish a redemption right, residual claim, treasury backing or final treatment for ASD holders.', [claim('ASD supplied platform utility and fee benefits.', ['asd', 'fees'], 'Operator token and fee pages.'), claim('ASDS was non-tradable and conversion from ASD was irreversible.', ['asds'], 'Operator ASDS explanation.'), claim('No residual redemption or estate right for ASD is established.', ['cessation', 'asd'], 'Closure notice and token page do not create one.', { kind: 'unknown' })]),
    counterfactual: section('Earlier licensing disclosure, a narrower product or regional footprint, and a published asset-liability reconciliation could have reduced the shock and information gap. They cannot be claimed as cures because AscendEX says financial and operational considerations were also involved. The decisive counterfactual is whether a licensed, solvent core exchange existed outside the affected services. The company has not published the numbers needed to test that question.', [claim('Earlier authorization or retrenchment could have reduced regulatory exposure.', ['mica', 'cessation'], 'Analyst counterfactual grounded in the deadline.', { kind: 'inference' }), claim('A balance-sheet reconciliation would reduce withdrawal uncertainty.', ['cessation'], 'Analyst counterfactual grounded in missing liability data.', { kind: 'inference' }), claim('Whether a viable narrower business existed is unknown.', ['cessation'], 'No segment economics were disclosed.', { kind: 'unknown' })]),
    risks_and_unknowns: section('Customer risk is concentrated in manual withdrawals: requests may be delayed, require more documents or remain unprocessed, while the operator gives no timing or payout assurance. Legal status is also unresolved because the notice mentions possible insolvency-related constraints without announcing a proceeding. The unsupported legacy claims about a $240 million reserve movement should not be treated as fact. The missing facts are liabilities, reserves and completed payouts.', [claim('All withdrawal requests were subject to manual review from July 6.', ['cessation'], 'Operator withdrawal section.'), claim('The notice did not guarantee timing or amounts.', ['cessation', 'cryptoslate'], 'Operator wording and independent coverage.'), claim('The claimed $240 million reserve movement is not supported by the reviewed primary record.', ['cessation'], 'Evidence audit exclusion.', { kind: 'unknown' })]),
    lifecycle: section('AscendEX launched as BitMax, expanded into a broad custodial trading and yield platform, rebranded, and used ASD as an exchange-linked utility asset. Its active lifecycle ended on July 1, 2026 when services stopped. The current phase is offboarding under manual withdrawal review, not normal operation and not yet a completed insolvency estate. The final lifecycle call depends on payouts and any later administrator or court process.', [claim('AscendEX formerly operated under the BitMax brand.', ['asd', 'fees'], 'Historical operator token pages.'), claim('Normal crypto-asset services ended July 1, 2026.', ['cessation'], 'Operator notice.'), claim('The final recovery phase remains unresolved.', ['cessation', 'crowdfund'], 'No completion or estate outcome is reported.', { kind: 'unknown' })]),
    outlook_and_watch: section('Watch for a verified withdrawal completion report, audited assets and liabilities, a regulator or court filing, and clear treatment of ASD. Successful offboarding would mean customers receive reconciled balances and the platform closes without a formal shortfall. A worse outcome would be persistent unprocessed requests or an insolvency proceeding. Until primary evidence resolves those points, the accurate label is ceased operations with unresolved customer offboarding.', [claim('Withdrawal completion is the main near-term outcome signal.', ['cessation'], 'Published wind-down process.', { kind: 'inference' }), claim('A court, regulator or audited balance-sheet record could change the classification.', ['cessation', 'mica'], 'Specified falsification evidence.', { kind: 'inference' }), claim('Final customer recovery and ASD treatment remain unknown.', ['cessation', 'asd'], 'No final distribution record.', { kind: 'unknown' })]),
  },
  metrics: [],
  events: [
    event('bitmax-era', 'launch', '2018-08-01', 'The venue launched under the BitMax brand in 2018.', ['asd'], 'Historical operator token context; month-level date.'),
    event('asd-rebrand', 'token', '2021-03-22', 'BitMax rebranded as AscendEX and the exchange token ticker changed from BTMX to ASD.', ['asd', 'fees'], 'Operator historical materials.'),
    event('cessation', 'closure', '2026-07-01', 'AscendEX ceased crypto-asset services.', ['cessation'], 'Dated operator notice.'),
    event('manual-review', 'withdrawal_control', '2026-07-06', 'Automated withdrawals were paused and requests moved to manual review.', ['cessation', 'cryptoslate'], 'Operator notice and independent coverage.'),
  ],
  feature: { lifecycle: 'dead', operating_model: 'Ceased custodial multi-product exchange with customer withdrawals under manual review.', product_cohort: 'centralized_multi_product_exchange', custody_model: 'custodial', token_status: 'launched', token_symbol: 'ASD', token_launch_date: '2019-11-06', token_launch_timing: 'post_product', token_strategy: 'exchange_utility_and_fee_benefits', token_source_url: 'https://ascendex.com/ko/support/articles/36308', metric_type: 'withdrawal_latency', metric_unit: 'unknown', metric_window: 'manual_review_unresolved', metric_as_of: AS_OF, metric_observed_at: OBSERVED_AT, comparability_key: 'cex|centralized_multi_product_exchange|withdrawal_latency|unknown|manual_review_unresolved' },
};

const blockfiSources = [
  source('blockfi', 'sec-release', 'BlockFi agrees to pay $100 million in penalties', 'https://www.sec.gov/newsroom/press-releases/2022-26', 'U.S. Securities and Exchange Commission', { publishedAt: '2022-02-14', locator: 'SEC findings on BlockFi Interest Accounts, the lending model, misleading risk statements and combined federal-state penalties.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('blockfi', 'sec-order', 'In the matter of BlockFi Lending LLC', 'https://www.sec.gov/files/litigation/admin/2022/33-11029.pdf', 'U.S. Securities and Exchange Commission', { publishedAt: '2022-02-14', locator: 'Administrative order and settled findings specific to BlockFi Lending LLC.', directHttpStatus: 403, accessMethod: 'indexed_pdf_snapshot' }),
  source('blockfi', 'court', 'BlockFi Inc., 22-19361 (MBK)', 'https://www.njb.uscourts.gov/BlockFi', 'U.S. Bankruptcy Court for the District of New Jersey', { locator: 'Official case page, debtor case number and current claims contact.' }),
  source('blockfi', 'plan', 'BlockFi final Chapter 11 plan', 'https://blockfiofficialcommittee.com/downloads/BlockFi%20-%20Final%20Plan.pdf', 'BlockFi Official Committee of Unsecured Creditors', { publishedAt: '2023-09-25', locator: 'Court-filed final plan, entity-specific claim classes and distribution mechanics.', accessMethod: 'direct_pdf' }),
  source('blockfi', 'claims', 'BlockFi schedule and wallet information portal', 'https://forms.ra.kroll.com/efiling/fr/claim-lookup/blockfi/new', 'Kroll Restructuring Administration', { locator: 'Current claims portal confirming nine Chapter 11 debtor filings and the jointly administered case.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('blockfi', 'distribution', 'Verify identity to secure remaining BlockFi distributions', 'https://ebs.publicnow.com/view/25EDAA69B80F8E62A1CF14CFD0CC3032DF8B7E08', 'BlockFi Plan Administrator via Public', { publishedAt: '2025-04-02', locator: 'Plan-administrator notice describing 100% of allowed dollarized claims for eligible customers and unfinished identity checks.', directHttpStatus: 403, accessMethod: 'indexed_browser_snapshot' }),
  source('blockfi', 'settlement', 'In re BlockFi, Inc. securities litigation', 'https://www.blockfisecuritiessettlement.com/', 'BlockFi Securities Settlement', { publishedAt: '2025-12-05', locator: 'Court-approved civil securities settlement and allocation process, separate from Chapter 11 distributions.' }),
  source('blockfi', 'theblock', 'BlockFi can begin repaying creditors after emerging from bankruptcy', 'https://www.theblock.co/post/259262/blockfi-can-begin-repaying-creditors-after-emerging-from-bankruptcy', 'The Block', { publishedAt: '2023-10-24', tier: 'B', role: 'independent', locator: 'Independent report of the effective date, wind-down and contingent recoveries.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('blockfi', 'cnbc', 'BlockFi files for bankruptcy as FTX contagion spreads', 'https://www.cnbc.com/2022/11/28/blockfi-files-for-bankruptcy-as-ftx-contagion-spreads.html', 'CNBC', { publishedAt: '2022-11-28', tier: 'B', role: 'independent', locator: 'Contemporaneous independent bankruptcy filing and FTX-contagion context.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
];

const blockfi = {
  slug: 'blockfi', name: 'BlockFi', aliases: ['BlockFi Inc.', 'BlockFi Lending LLC'], table: 'dead_exchanges',
  operatingState: 'closed_plan_administration_and_distributions', outcome: 'failed_lender_in_wind_down_with_dollarized_claim_recovery', outcomeConfidence: 'high', qualityConfidence: 'high',
  classification: { subtype: 'failed crypto lender and broker with plan-administered distributions', tags: ['lender', 'earn', 'broker', 'custodial', 'chapter-11', 'wind-down', 'no-venue-token'], chains: [], jurisdictions: ['United States', 'Bermuda'] },
  sources: blockfiSources,
  statusAssertion: 'BlockFi no longer operates its lending or trading products and remains in a plan-administered wind-down and distribution process.', statusSourceKeys: ['court', 'plan', 'claims', 'distribution'], statusEvidenceLocator: 'Official court, plan and administrator records.',
  outcomeAssertion: 'BlockFi failed as a crypto lender and broker, but eligible customers were later positioned to receive the allowed dollar amount of their claims through the estate.', outcomeSourceKeys: ['plan', 'distribution', 'theblock', 'cnbc'], outcomeEvidenceLocator: 'Plan, administrator and independent wind-down records.',
  identityBoundary: 'BlockFi was primarily a lender and yield platform with wallet, loan and brokerage-style trading surfaces, not a conventional order-book exchange. BlockFi Inc., BlockFi Lending LLC, BlockFi International Ltd. and other debtors have distinct claim classes. The Chapter 11 estate and the later civil securities settlement are separate recovery processes.',
  methodologyNotes: ['A 100% distribution refers to the allowed dollarized claim amount, not restoration of the original crypto quantity or its later market value.', 'The SEC settlement findings were entered without BlockFi admitting or denying them, except as to jurisdiction; criminal guilt is not asserted.'],
  unknowns: ['Unfinished distributions after identity or jurisdiction checks', 'Final administrative costs and unresolved claims', 'Economic loss versus original crypto units and later prices', 'Allocation from the separate civil securities settlement'],
  unsourcedFields: ['Final unclaimed distribution amount', 'Final estate closure costs', 'Claimant-specific market-value loss', 'Final securities-settlement payout'],
  sections: {
    what_it_is: section('BlockFi was a custodial crypto lender and broker, not a normal centralized order-book exchange. Customers could place assets into interest accounts, borrow against collateral, hold wallet assets and use a trading interface. BlockFi then lent or invested pooled assets to earn a spread. Today the products are closed; a plan administrator and claims agents manage recoveries and distributions for several legally distinct debtor entities.', [claim('BlockFi’s core product was interest-bearing crypto lending.', ['sec-release', 'sec-order'], 'SEC product and business-model findings.'), claim('BlockFi also provided wallet, loan and trading surfaces.', ['plan', 'court'], 'Plan claim classes and court customer categories.'), claim('The operating company has been replaced by a wind-down and claims process.', ['plan', 'claims', 'distribution'], 'Court and administrator records.')]),
    what_happened: section('BlockFi settled federal and state registration cases for a combined $100 million in February 2022 and stopped offering new U.S. interest accounts. Later that year it relied on financing connected to FTX while retaining exposures to FTX, Alameda and other failed counterparties. After FTX collapsed, BlockFi paused withdrawals and filed Chapter 11 on November 28. Its confirmed plan became effective in October 2023 and shifted the business into recovery and distribution.', [claim('BlockFi agreed to $100 million in combined federal and state penalties.', ['sec-release', 'sec-order'], 'SEC settlement terms.'), claim('BlockFi filed Chapter 11 on November 28, 2022.', ['court', 'claims', 'cnbc'], 'Court and contemporaneous report.'), claim('The effective plan began a managed wind-down and recovery process.', ['plan', 'theblock'], 'Plan and effective-date report.')]),
    why_this_outcome: section('BlockFi funded customer yield by taking credit and investment risk outside customer wallets. That made repayment dependent on borrower quality, collateral and the survival of large crypto counterparties. The SEC had already found its public loan-risk statement misleading, and the 2022 market collapse exposed concentrated counterparty risk. FTX’s failure was the immediate trigger, but the deeper weakness was a maturity and credit model that could not meet customer withdrawals after counterparties failed.', [claim('Interest-account returns depended on BlockFi lending or investing customer assets.', ['sec-release', 'sec-order'], 'Regulatory description of the pooled model.'), claim('The SEC found a misleading statement about loan-portfolio risk.', ['sec-release', 'sec-order'], 'Settled administrative finding.'), claim('FTX failure was the immediate bankruptcy trigger rather than the entire structural cause.', ['cnbc', 'plan'], 'Filing chronology and plan recovery claims.', { kind: 'inference' })]),
    strategic_choices: section('BlockFi chose to combine custody, retail yield, institutional lending, collateralized loans and brokerage in one brand. It pursued continued U.S. yield distribution through a proposed registered product after the SEC settlement, while also accepting financing and exposure linked to FTX during the credit crisis. Those decisions preserved growth options but concentrated funding and recovery risk. The plan later chose liquidation and claims recovery rather than trying to relaunch the consumer platform.', [claim('BlockFi combined retail yield with institutional lending and other account products.', ['sec-release', 'plan'], 'Regulatory and plan descriptions.'), claim('BlockFi proposed a registered successor product after the SEC settlement.', ['sec-release'], 'Company commitment described by the SEC.'), claim('The confirmed plan pursued wind-down rather than a consumer relaunch.', ['plan', 'theblock'], 'Plan mechanics and effective-date report.', { kind: 'inference' })]),
    operating_model: section('Interest-account customers transferred crypto to BlockFi in exchange for variable monthly yield. BlockFi pooled those assets, made institutional loans and held other investments; wallet, loan-collateral and interest-account customers had different legal positions. Trading was a brokerage feature inside that platform, not the central matching business used by a conventional exchange. Once the platform paused, account balances became entity- and product-specific claims administered under the plan.', [claim('BlockFi Interest Account holders lent crypto to BlockFi for variable monthly yield.', ['sec-release', 'sec-order'], 'SEC operating-model findings.'), claim('Different products and debtor entities received different plan classes.', ['plan'], 'Final plan classification.'), claim('Trading was a platform surface within a lending model, not the core order-book business.', ['sec-release', 'plan'], 'Analyst taxonomy based on the documented products.', { kind: 'inference' })]),
    token_and_value_capture: section('BlockFi did not issue a venue token identified in the reviewed court and regulatory record. Value was meant to accrue to the private company through the spread between what it earned on loans and investments and what it paid to interest-account customers, plus product fees. Customers therefore held contractual account or wallet claims rather than a liquid governance token. In bankruptcy, recovery followed those claims and legal entities, not token-holder rights.', [claim('No BlockFi venue token is identified in the reviewed official record.', ['sec-order', 'plan'], 'Regulatory and plan document review.', { kind: 'unknown' }), claim('The lending spread was the core value-capture mechanism.', ['sec-release', 'sec-order'], 'Regulatory business-model description.', { kind: 'inference' }), claim('Bankruptcy recovery followed account and debtor claim classes.', ['plan', 'claims'], 'Court-approved distribution structure.')]),
    counterfactual: section('Lower counterparty concentration, stronger liquidity reserves and transparent borrower-level stress testing could have reduced the chance that one market failure froze the platform. Segregating wallet assets from yield products and limiting new risk after the SEC settlement would also have narrowed customer confusion and exposure. None of those controls guarantees survival in a system-wide crash. The test is whether BlockFi could have met withdrawals without recoveries from failed borrowers; the filing shows it could not.', [claim('Diversification and liquidity buffers directly address the documented counterparty model.', ['sec-order', 'plan'], 'Analyst counterfactual grounded in exposures.', { kind: 'inference' }), claim('Product segregation would have clarified different customer legal positions.', ['plan'], 'Analyst counterfactual grounded in plan classes.', { kind: 'inference' }), claim('Whether BlockFi could have survived without failed-counterparty recoveries is answered negatively by the wind-down plan.', ['plan', 'theblock'], 'Plan dependence on recoveries.', { kind: 'inference' })]),
    risks_and_unknowns: section('The exchange-like app is gone, but creditor administration is not fully finished. Remaining risks include failed identity checks, jurisdiction-specific distribution routes, disputed claims, estate costs and scams impersonating the administrator. The headline 100% figure is limited to eligible allowed dollar claims; it does not compensate for later crypto appreciation or promise every claimant has been paid. A separate 2025 securities settlement must not be added to Chapter 11 recovery as if it were the same pool.', [claim('Some remaining distributions required identity verification in 2025.', ['distribution'], 'Plan-administrator notice.'), claim('The 100% statement is limited to allowed dollarized claim amounts.', ['distribution', 'plan'], 'Administrator language and plan valuation mechanics.'), claim('The securities settlement is separate from Chapter 11 distributions.', ['settlement', 'court'], 'Distinct case and allocation process.', { kind: 'inference' })]),
    lifecycle: section('BlockFi grew from a 2017 startup into a large crypto lender, added wallet, credit and trading products, and was forced to change its U.S. interest-account offering after the 2022 SEC settlement. The credit crisis and FTX collapse then caused a withdrawal pause and Chapter 11 filing. A confirmed plan took effect in 2023, the web platform closed, and distributions advanced in 2024 and 2025. This is a failed operating business with an unusually strong dollar-claim recovery, not a relaunch.', [claim('BlockFi’s operating lifecycle ended in the 2022 bankruptcy.', ['court', 'cnbc'], 'Filing chronology.'), claim('The plan became effective in October 2023 and enabled distributions.', ['plan', 'theblock'], 'Effective-date record.'), claim('Strong dollar-claim recovery does not mean the lender relaunched.', ['distribution', 'claims'], 'Administrator and claims records.', { kind: 'inference' })]),
    outlook_and_watch: section('Watch the Kroll and court pages for final distributions, unclaimed property, contested claims and estate closure. Also track the separate securities-settlement allocation without combining it with bankruptcy payments. The operating outlook is settled: BlockFi is not returning as a lender or exchange. The remaining analytical question is final claimant recovery after administrative frictions and whether allowed-dollar payments matched the economic value customers expected from their original crypto.', [claim('Court and claims-agent updates are the authoritative remaining milestones.', ['court', 'claims'], 'Official current sources.', { kind: 'inference' }), claim('No reviewed plan provides for a BlockFi operating relaunch.', ['plan', 'theblock'], 'Wind-down design.', { kind: 'inference' }), claim('Final claimant-specific economic recovery remains unknown.', ['distribution', 'settlement'], 'Dollarization and separate recovery pools.', { kind: 'unknown' })]),
  },
  metrics: [
    metric('regulatory-penalties', 'regulatory_fines', 'Combined SEC and state regulatory penalties', 100000000, ['sec-release', 'sec-order'], 'Settled federal and parallel state penalties.', { asOf: '2022-02-14', window: '2022 settlement', scope: 'BlockFi Lending LLC federal settlement and 32 parallel state actions', qualityFlags: ['settlement', 'federal_and_state_combined', 'not_customer_recovery'] }),
    metric('allowed-claim-distribution', 'creditor_recovery', 'Announced distribution of allowed dollar claim amounts', 100, ['distribution', 'plan'], 'Plan-administrator announcement for eligible allowed claims.', { asOf: '2025-04-02', window: 'announced maximum distribution', scope: 'Eligible BlockFi customers with allowed dollarized claims', unit: 'percent', currency: 'PERCENT', qualityFlags: ['allowed_dollar_claims_only', 'not_original_crypto_units', 'eligibility_and_identity_checks_apply', 'not_final_estate_closure'] }),
  ],
  events: [
    event('sec-settlement', 'regulatory', '2022-02-14', 'BlockFi settled SEC and state interest-account cases for a combined $100 million.', ['sec-release', 'sec-order'], 'Regulator settlement record.'),
    event('chapter-11', 'bankruptcy', '2022-11-28', 'BlockFi Inc. and eight affiliates filed Chapter 11 cases.', ['court', 'claims', 'cnbc'], 'Court and claims records.'),
    event('plan-effective', 'restructuring', '2023-10-24', 'The confirmed plan became effective and the company entered its distribution wind-down.', ['plan', 'theblock'], 'Plan and effective-date report.'),
  ],
  feature: { lifecycle: 'dead', operating_model: 'Closed crypto lender and broker whose distinct debtor estates distribute allowed claims under a Chapter 11 plan.', product_cohort: 'centralized_crypto_lender_and_broker', custody_model: 'custodial', token_status: 'not_identified', token_symbol: null, token_launch_date: null, token_launch_timing: 'unknown', token_strategy: 'no_venue_token_identified', token_source_url: 'https://www.sec.gov/newsroom/press-releases/2022-26', metric_type: 'creditor_recovery', metric_unit: 'percent', metric_window: 'allowed_dollar_claim_distribution', metric_as_of: '2025-04-02', metric_observed_at: OBSERVED_AT, comparability_key: 'cex|centralized_crypto_lender_and_broker|creditor_recovery|percent|allowed_dollar_claims' },
};

const celsiusSources = [
  source('celsius', 'stretto', 'Celsius Network LLC, et al.', 'https://cases.stretto.com/celsius', 'Stretto', { locator: 'Official case hub, January 31, 2024 effective date and current distribution notices.' }),
  source('celsius', 'app-close', 'Celsius distribution inquiries', 'https://cases.stretto.com/celsius/contact-us/', 'Stretto', { locator: 'Official notice that the Celsius app shut down February 29, 2024 as part of the plan wind-down.' }),
  source('celsius', 'doj', 'Founder of Celsius sentenced to 12 years for fraud and market manipulation', 'https://www.justice.gov/usao-sdny/pr/founder-celsius-sentenced-12-years-fraud-and-market-manipulation', 'U.S. Department of Justice', { publishedAt: '2025-05-08', locator: 'Guilty plea, sentence, forfeiture, platform asset figure and proven CEL manipulation scheme.' }),
  source('celsius', 'ftc', 'FTC reaches settlement with crypto platform Celsius Network', 'https://www.ftc.gov/news-events/news/press-releases/2023/07/ftc-reaches-settlement-crypto-platform-celsius-network-charges-former-executives-duping-consumers', 'U.S. Federal Trade Commission', { publishedAt: '2023-07-13', locator: 'Corporate settlement, product model, alleged deposit misuse and the suspended $4.7 billion judgment.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('celsius', 'ftc-case', 'FTC v. Celsius Network Inc. et al.', 'https://www.ftc.gov/legal-library/browse/cases-proceedings/222-3137-celsius-network-inc-et-al-ftc-v', 'U.S. Federal Trade Commission', { publishedAt: '2023-07-13', locator: 'Current FTC case page separating Celsius entities and individual-defendant resolutions.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('celsius', 'sec', 'Celsius Network Limited and Alexander Mashinsky', 'https://www.sec.gov/enforcement-litigation/litigation-releases/lr-25779', 'U.S. Securities and Exchange Commission', { publishedAt: '2023-07-14', locator: 'SEC allegations concerning Earn, business disclosures and CEL market manipulation.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('celsius', 'court-2026', 'Post-effective-date Celsius court filing', 'https://cases.stretto.com/public/x191/11749/PLEADINGS/1174903162680000000335.pdf', 'U.S. Bankruptcy Court for the Southern District of New York', { publishedAt: '2026-03-16', locator: 'Court filing confirming the plan, effective date and continuing post-effective-date administration.', accessMethod: 'direct_pdf' }),
  source('celsius', 'cnbc', 'Celsius founder Alex Mashinsky sentenced to 12 years', 'https://www.cnbc.com/2025/05/08/celsius-ceo-alex-mashinsky-sentenced-to-12-years-in-crypto-fraud-case.html', 'CNBC', { publishedAt: '2025-05-08', tier: 'B', role: 'independent', locator: 'Independent sentencing coverage and customer-loss context.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
];

const celsius = {
  slug: 'celsius', name: 'Celsius Network', aliases: ['Celsius', 'Celsius Network LLC'], table: 'dead_exchanges',
  operatingState: 'closed_post_effective_date_distributions', outcome: 'failed_lender_after_fraud_liquidity_and_risk_failures', outcomeConfidence: 'high', qualityConfidence: 'high',
  classification: { subtype: 'failed crypto lender and yield platform in post-confirmation administration', tags: ['lender', 'earn', 'loans', 'custodial', 'bankruptcy', 'fraud-conviction', 'exchange-token'], chains: [], jurisdictions: ['United States', 'United Kingdom'] },
  sources: celsiusSources,
  statusAssertion: 'The Celsius consumer platform and app are closed, while post-effective-date debtors and claims agents continue distributions and litigation.', statusSourceKeys: ['stretto', 'app-close', 'court-2026'], statusEvidenceLocator: 'Official case hub, app shutdown notice and 2026 court filing.',
  outcomeAssertion: 'Celsius failed as a crypto lender after liquidity, risk and disclosure failures that included founder fraud and CEL manipulation proven by Mashinsky’s guilty plea.', outcomeSourceKeys: ['doj', 'stretto', 'ftc', 'sec'], outcomeEvidenceLocator: 'Criminal disposition, regulator records and bankruptcy administration.',
  identityBoundary: 'Celsius was primarily a lender and yield platform with loans, custody and exchange-like swap features, not a conventional order-book exchange. Celsius debtor entities, the post-effective-date estate, Alexander Mashinsky, other executives and the successor mining company are separate subjects. Mashinsky’s fraud and manipulation are proven by his plea and sentence; SEC and FTC allegations against other parties remain allegations unless resolved.',
  methodologyNotes: ['The $4.7 billion customer-assets figure in the DOJ release is not the same metric as the FTC’s separately suspended $4.7 billion corporate judgment and must not be added to it.', 'Bankruptcy distributions, successor-company shares and litigation proceeds are distinct recovery components.'],
  unknowns: ['Final creditor recovery by claim class', 'Remaining disputed and unclaimed distributions', 'Net value ultimately realized from successor-company equity', 'Final resolution of civil claims against non-settling defendants'],
  unsourcedFields: ['Final class-level recovery', 'Final unclaimed property amount', 'Realized successor-equity value', 'Final unresolved civil case outcomes'],
  sections: {
    what_it_is: section('Celsius was a custodial crypto lender and yield platform, not a standard order-book exchange. Its main Earn product paid rewards on deposited assets; Borrow offered collateralized loans; Custody and swap features broadened the app. Customers transferred control of assets to Celsius while the company deployed them for yield. The app is now closed, and the remaining organization exists to make plan distributions and pursue or defend claims.', [claim('Celsius offered Earn, Borrow, Custody and exchange-like services.', ['doj', 'ftc'], 'Government product descriptions.'), claim('Earn customers transferred assets for promised yield.', ['sec', 'doj'], 'SEC and criminal case descriptions.'), claim('The app is closed and only post-plan administration remains.', ['app-close', 'stretto', 'court-2026'], 'Official case and shutdown records.')]),
    what_happened: section('Celsius halted withdrawals on June 12, 2022 with roughly $4.7 billion of customer assets inaccessible, then filed Chapter 11 on July 13. Regulators later described misleading safety, liquidity and business claims. Founder Alex Mashinsky pleaded guilty to commodities and securities fraud and was sentenced to 12 years in May 2025; the Justice Department also documented manipulation of CEL. A reorganization plan became effective in January 2024 and the consumer app closed the next month.', [claim('Celsius halted withdrawals on June 12, 2022 with about $4.7 billion inaccessible.', ['doj'], 'Criminal sentencing release.'), claim('Celsius filed Chapter 11 on July 13, 2022.', ['stretto', 'ftc'], 'Official case records.'), claim('Mashinsky pleaded guilty and received a 12-year sentence.', ['doj', 'cnbc'], 'Criminal disposition and independent coverage.')]),
    why_this_outcome: section('Celsius promised liquid, bank-like access while using customer assets for loans, trading and other risky strategies. The FTC said unsecured lending reached $1.2 billion by April 2022 and reserves could cover only a fraction of withdrawals. The criminal record also shows management misrepresented stability and used large purchases to support CEL. When markets turned and customers demanded assets back, the platform lacked the liquid resources and trust needed to honor the promise.', [claim('Celsius deployed customer assets into lending and risky investments.', ['ftc', 'doj'], 'Government findings and criminal record.'), claim('The FTC alleged $1.2 billion of unsecured loans by April 2022.', ['ftc'], 'FTC complaint summary.', { kind: 'fact', note: 'An FTC allegation against the Celsius enterprise, not a separate criminal finding.' }), claim('Liquidity stress exposed the mismatch between withdrawal promises and deployed assets.', ['ftc', 'doj'], 'Analyst causal synthesis.', { kind: 'inference' })]),
    strategic_choices: section('Celsius chose rapid growth through high reward rates, broad retail marketing and the “unbank yourself” message. It concentrated multiple products and balance-sheet risks in one app, made unsecured institutional loans, and supported CEL through company purchases. Those choices made growth depend on continued deposits, asset prices and trust. The later plan chose distributions plus a mining successor structure instead of trying to revive the lender, while permanently shutting the consumer app.', [claim('Celsius marketed high rewards and a bank alternative to retail customers.', ['ftc', 'doj'], 'Government marketing records.'), claim('Celsius used unsecured lending and company CEL purchases.', ['ftc', 'doj'], 'FTC allegations and criminally established manipulation.'), claim('The plan wound down the app rather than relaunching the lender.', ['stretto', 'app-close', 'court-2026'], 'Post-confirmation records.', { kind: 'inference' })]),
    operating_model: section('Customers deposited crypto into Celsius accounts and, for Earn, exchanged asset control for promised variable rewards. Celsius pooled assets, made secured and unsecured loans, invested or traded, used deposits in operations and offered loans against customer collateral. Revenue had to exceed reward obligations and losses while enough liquid assets remained for withdrawals. That fragile balance was hidden by internal risk and disclosure failures until withdrawals were stopped.', [claim('Earn transferred customer assets into a pooled yield model.', ['sec', 'doj'], 'Regulatory and criminal descriptions.'), claim('Celsius made both secured and unsecured loans and used deposits in operations.', ['ftc'], 'FTC complaint summary.'), claim('The business required yield and liquidity to cover customer obligations.', ['ftc', 'doj'], 'Analyst operating-model inference.', { kind: 'inference' })]),
    token_and_value_capture: section('CEL was the platform token used in rewards and promoted as part of the Celsius ecosystem. The Justice Department established that Mashinsky and others used hundreds of millions of dollars of purchases, sometimes funded with customer deposits, to inflate CEL while he sold personal holdings. That is not healthy token value capture; it is manipulation tied to executive extraction. In the bankruptcy, CEL claim treatment is a plan question, not proof of market value or redemption backing.', [claim('CEL was promoted as Celsius’s platform token.', ['sec', 'doj'], 'Regulatory and criminal records.'), claim('Mashinsky’s manipulation scheme used large CEL purchases and enabled personal sales.', ['doj'], 'Guilty plea and sentencing facts.'), claim('Bankruptcy treatment of CEL does not establish token backing or redemption value.', ['stretto', 'court-2026'], 'Analyst legal and market boundary.', { kind: 'inference' })]),
    counterfactual: section('Transparent asset-liability reporting, conservative reward rates, limits on unsecured credit and a real liquidity buffer could have reduced the run risk. Independent controls over CEL purchases and executive sales could have exposed manipulation earlier. Product-level segregation could also have made custody and yield risks clearer. These controls do not guarantee survival, but they directly address the documented mismatch between customer promises, hidden risk-taking and management incentives.', [claim('Liquidity buffers and lower unsecured exposure address the documented withdrawal mismatch.', ['ftc', 'doj'], 'Analyst counterfactual.', { kind: 'inference' }), claim('Independent CEL controls address the proven manipulation scheme.', ['doj'], 'Analyst counterfactual.', { kind: 'inference' }), claim('Product segregation could have clarified custody versus yield risk.', ['stretto', 'ftc'], 'Analyst counterfactual grounded in product classes.', { kind: 'inference' })]),
    risks_and_unknowns: section('The lender is not coming back, but creditors still face distribution, identity, tax, claim and litigation uncertainty. Current case notices warn of phishing and show that some classes and later distributions remain active. Recovery should not be summarized with one percentage because crypto, cash, claim class and successor equity differ. Civil allegations against defendants other than those whose cases resolved must remain attributed, while Mashinsky’s plea and sentence can be stated as established facts.', [claim('Post-effective-date distributions and communications remained active in 2025 and 2026.', ['stretto', 'court-2026'], 'Current case records.'), claim('Recovery differs by claim class and distribution component.', ['stretto', 'court-2026'], 'Plan-administration structure.', { kind: 'inference' }), claim('Unresolved civil allegations remain allegations.', ['sec', 'ftc-case'], 'Procedural boundary.', { kind: 'unknown' })]),
    lifecycle: section('Celsius launched in 2017, grew to roughly $25 billion in assets at its peak, and built its brand around high-yield retail accounts and CEL. The model broke during the 2022 credit crisis, withdrawals stopped and Chapter 11 followed. A court confirmed the plan in November 2023; it became effective January 31, 2024, and the app shut February 29. Mashinsky’s 2025 sentence closed the main criminal founder case while estate distributions continued.', [claim('Celsius held approximately $25 billion in assets at its peak.', ['doj'], 'DOJ historical scale figure.'), claim('The plan became effective January 31, 2024 and the app closed February 29.', ['stretto', 'app-close', 'court-2026'], 'Official dates.'), claim('The operating lifecycle ended while estate administration continued.', ['stretto', 'app-close'], 'Analyst lifecycle boundary.', { kind: 'inference' })]),
    outlook_and_watch: section('Watch the Stretto docket for later distributions, claim reconciliations, estate litigation and final wind-down reports. Track successor-company equity separately from cash or crypto payments, and do not confuse app closure with completion of the estate. No credible evidence supports a Celsius lending relaunch. The final success measure is how much each class actually realizes after time, costs and valuation effects, not the size of a judgment or the token’s quoted price.', [claim('The Stretto case hub is the authoritative source for remaining distributions.', ['stretto', 'court-2026'], 'Current official case channel.', { kind: 'inference' }), claim('No reviewed plan record supports a Celsius lender relaunch.', ['app-close', 'stretto'], 'Wind-down and app closure.', { kind: 'inference' }), claim('Final class-level realized recovery remains unknown.', ['stretto', 'court-2026'], 'Ongoing administration.', { kind: 'unknown' })]),
  },
  metrics: [
    metric('inaccessible-customer-assets', 'customer_assets', 'Customer assets inaccessible when withdrawals stopped', 4700000000, ['doj'], 'Justice Department sentencing release.', { asOf: '2022-06-12', window: 'withdrawal-halt observation', scope: 'Celsius customer assets inaccessible on the platform', qualityFlags: ['approximate', 'customer_assets_not_shortfall', 'not_additive_with_ftc_judgment'] }),
  ],
  events: [
    event('withdrawal-halt', 'withdrawal_halt', '2022-06-12', 'Celsius halted customer withdrawals.', ['doj', 'ftc'], 'Government chronology.'),
    event('chapter-11', 'bankruptcy', '2022-07-13', 'Celsius and affiliated debtors filed Chapter 11 cases.', ['stretto', 'ftc'], 'Official case record.'),
    event('plan-effective', 'restructuring', '2024-01-31', 'The confirmed Celsius plan became effective and distributions began.', ['stretto', 'court-2026'], 'Official effective-date record.'),
    event('mashinsky-sentencing', 'criminal_disposition', '2025-05-08', 'Alex Mashinsky was sentenced to 12 years after pleading guilty to commodities and securities fraud.', ['doj', 'cnbc'], 'Criminal disposition.'),
  ],
  feature: { lifecycle: 'dead', operating_model: 'Closed crypto lender and yield platform whose post-effective-date debtors continue distributions and litigation.', product_cohort: 'centralized_crypto_lender_and_yield_platform', custody_model: 'custodial', token_status: 'launched', token_symbol: 'CEL', token_launch_date: '2018-03-22', token_launch_timing: 'post_product', token_strategy: 'rewards_and_platform_utility_with_proven_manipulation', token_source_url: 'https://www.justice.gov/usao-sdny/pr/founder-celsius-sentenced-12-years-fraud-and-market-manipulation', metric_type: 'customer_assets', metric_unit: 'usd', metric_window: 'withdrawal_halt_observation', metric_as_of: '2022-06-12', metric_observed_at: OBSERVED_AT, comparability_key: 'cex|centralized_crypto_lender_and_yield_platform|customer_assets|usd|withdrawal_halt' },
};

const coinflexSources = [
  source('coinflex', 'seychelles', 'Ex parte Liquidity Technologies Limited', 'https://seylii.org/akn/sc/judgment/scsc/2022/718/eng%402022-08-17/source.pdf', 'Supreme Court of Seychelles', { publishedAt: '2022-08-17', locator: 'Interim reorganization order, balance-sheet hole, dollarization, creditor groups, proposed equity and recovery-token terms.', directHttpStatus: 404, accessMethod: 'indexed_pdf_snapshot' }),
  source('coinflex', 'wipo', 'WIPO domain name dispute D2025-3478', 'https://www.wipo.int/amc/en/domains/decisions/pdf/2025/d2025-3478.pdf', 'World Intellectual Property Organization', { publishedAt: '2025-12-19', locator: 'Decision identifying Liquidity Technologies, CoinFLEX brand use and the October 31, 2023 trading cessation date.', accessMethod: 'direct_pdf' }),
  source('coinflex', 'hong-kong', 'Liquidity Technologies Ltd v. Mark David Lamb and others', 'https://lawhero.io/cases/183113/hca1646-2023-liquidity-technologies-ltd-and-another-v-mark-david-lamb-and-others', 'Hong Kong Court case summary via LawHero', { publishedAt: '2026-04-01', tier: 'B', role: 'independent', locator: 'Procedural summary of pleaded CoinFLEX/OPNX asset, technology and token disputes; allegations are not treated as findings.', directHttpStatus: 404, accessMethod: 'indexed_browser_snapshot' }),
  source('coinflex', 'decrypt-plan', 'Seychelles court approves CoinFLEX restructuring plan', 'https://decrypt.co/122887', 'Decrypt', { publishedAt: '2023-03-07', tier: 'B', role: 'independent', locator: 'Independent report of March 6 court approval and proposed creditor consideration.' }),
  source('coinflex', 'axios', 'CoinFLEX wants Roger Ver to pay them back', 'https://www.axios.com/2022/06/28/coinflex-roger-ver-to-pay-them-back', 'Axios', { publishedAt: '2022-06-28', tier: 'B', role: 'independent', locator: 'Contemporaneous account presenting both CoinFLEX’s claim and Roger Ver’s denial.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('coinflex', 'coindesk-rvusd', 'CoinFLEX to launch a $47M recovery token', 'https://www.coindesk.com/business/2022/06/27/coinflex-to-launch-a-47m-recovery-token-to-solve-withdrawal-issues', 'CoinDesk', { publishedAt: '2022-06-27', tier: 'B', role: 'independent', locator: 'Independent report on the initial rvUSD proposal and withdrawal halt.' }),
  source('coinflex', 'theblock-opnx', 'Crypto derivatives exchange OPNX to shut down', 'https://www.theblock.co/post/275695/crypto-derivatives-exchange-opnx-to-shut-down-in-february', 'The Block', { publishedAt: '2024-02-01', tier: 'B', role: 'independent', locator: 'Independent OPNX closure report; used only as successor-context evidence.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
];

const coinflex = {
  slug: 'coinflex', name: 'CoinFLEX', aliases: ['CoinFLEX Exchange', 'Liquidity Technologies Ltd.'], table: 'dead_exchanges',
  operatingState: 'closed_restructured_with_disputed_recoveries', outcome: 'failed_after_concentrated_counterparty_exposure_and_restructuring', outcomeConfidence: 'high', qualityConfidence: 'high',
  classification: { subtype: 'closed custodial derivatives exchange in creditor restructuring and litigation', tags: ['custodial', 'derivatives', 'withdrawal-halt', 'restructuring', 'counterparty-risk', 'recovery-token', 'exchange-token'], chains: [], jurisdictions: ['Seychelles', 'Hong Kong'] },
  sources: coinflexSources,
  statusAssertion: 'CoinFLEX trading ceased by October 31, 2023 and the brand remains tied to restructuring, recovery rights and litigation rather than an operating exchange.', statusSourceKeys: ['wipo', 'seychelles', 'decrypt-plan'], statusEvidenceLocator: 'WIPO decision, court order and restructuring report.',
  outcomeAssertion: 'CoinFLEX failed after one concentrated counterparty position created a withdrawal shortfall, then converted creditor balances into a mixture of claims, tokens and equity.', outcomeSourceKeys: ['seychelles', 'axios', 'coindesk-rvusd', 'decrypt-plan'], outcomeEvidenceLocator: 'Court-filed reorganization terms and independent contemporaneous coverage.',
  identityBoundary: 'CoinFLEX the exchange, Liquidity Technologies Ltd. the Seychelles company, the restructuring creditor pool, the rvUSD recovery vehicle, FLEX, flexUSD, and OPNX are separate subjects. The $84 million Roger Ver amount is CoinFLEX’s disputed claim reflected in a court-filed plan, not an adjudicated debt finding. OPNX’s later operation and closure do not prove that it legally succeeded CoinFLEX.',
  methodologyNotes: ['FLEX, flexUSD, rvUSD and equity represent different rights and must never be collapsed into one token recovery figure.', 'Hong Kong pleadings about OPNX asset transfers are allegations; this profile does not state them as adjudicated misconduct.'],
  unknowns: ['Amount actually recovered on the disputed counterparty claim', 'Realized creditor value from equity, FLEX and rvUSD', 'Final ownership and disposition of CoinFLEX technology and domains', 'Status and cost of remaining restructuring and litigation'],
  unsourcedFields: ['Final counterparty recovery', 'Final creditor recovery percentage', 'Final intellectual-property ownership', 'Final estate and litigation closure'],
  sections: {
    what_it_is: section('CoinFLEX was a custodial crypto derivatives exchange whose customers traded futures and other products through balances controlled by the venue. It also used FLEX as a venue token, issued flexUSD as an interest-bearing stablecoin product and later proposed rvUSD as a recovery claim. Trading has ended. The surviving story is a Seychelles restructuring, creditor rights and litigation, not an active exchange or a clean rebrand into OPNX.', [claim('CoinFLEX operated a custodial derivatives venue.', ['seychelles', 'wipo'], 'Court and WIPO business descriptions.'), claim('FLEX, flexUSD and rvUSD represented different products and rights.', ['seychelles', 'coindesk-rvusd'], 'Reorganization terms and recovery-token report.', { kind: 'inference' }), claim('Trading ceased by October 31, 2023.', ['wipo'], 'WIPO factual chronology.')]),
    what_happened: section('CoinFLEX halted withdrawals in June 2022 after a large customer account went negative. The company identified Roger Ver and first described a $47 million gap; Ver denied owing it. By the Seychelles filing, CoinFLEX asserted an $84 million debt and proposed dollarizing customer positions, applying a haircut, and giving creditors equity plus pro-rata rights to recovery through rvUSD. A court approved the restructuring in March 2023, and trading later ceased.', [claim('CoinFLEX halted withdrawals after a large negative counterparty position.', ['seychelles', 'axios', 'coindesk-rvusd'], 'Court and contemporaneous chronology.'), claim('CoinFLEX claimed $84 million from Roger Ver, who disputed the debt.', ['seychelles', 'axios'], 'Company claim and counterparty denial.'), claim('The restructuring proposed dollarization, creditor equity and recovery rights.', ['seychelles', 'decrypt-plan'], 'Court-filed terms and approval report.')]),
    why_this_outcome: section('The direct cause was concentrated counterparty credit: CoinFLEX allowed one customer position to create a balance-sheet hole large enough to stop withdrawals. The court record says the position could not be liquidated under an arrangement with the customer, making the venue an unsecured creditor when the market moved. Tokenizing the claim did not restore cash or liquid assets; it transferred recovery uncertainty to users. That is a risk-control failure, not simply a market downturn.', [claim('One customer exposure created the stated balance-sheet hole.', ['seychelles'], 'Court’s summary of the company’s evidence.'), claim('The alleged debt remained disputed rather than adjudicated in the reviewed record.', ['axios', 'seychelles'], 'Counterparty denial and plan claim.', { kind: 'unknown' }), claim('Recovery tokens transferred rather than removed recovery risk.', ['seychelles', 'coindesk-rvusd'], 'Analyst causal inference.', { kind: 'inference' })]),
    strategic_choices: section('CoinFLEX chose to grant special margin treatment to a large customer instead of enforcing ordinary automatic liquidation, concentrating solvency risk in a bilateral arrangement. After the shortfall, it chose a novel token-and-equity restructuring rather than immediate liquidation: balances were dollarized and creditors received mixed consideration. Management later associated CoinFLEX with OPNX, but subsequent litigation disputed asset and brand transfers, so the successor story cannot be presented as settled.', [claim('CoinFLEX used special margin treatment for the large counterparty.', ['seychelles', 'axios'], 'Court and contemporaneous accounts.'), claim('The plan used dollarization, equity and recovery rights instead of cash-only repayment.', ['seychelles', 'decrypt-plan'], 'Restructuring terms.'), claim('The legal connection between CoinFLEX and OPNX remains disputed.', ['hong-kong', 'theblock-opnx'], 'Pleadings and later closure context.', { kind: 'unknown' })]),
    operating_model: section('Customers posted collateral and traded derivatives on CoinFLEX while the venue controlled accounts, margin rules and withdrawals. Normal risk management should liquidate under-margined positions before they become exchange losses. CoinFLEX said a special agreement prevented that for the disputed customer, leaving the platform with a large receivable and insufficient liquid value for withdrawals. After restructuring, account balances became dollar claims, equity interests and recovery-token rights instead of freely withdrawable exchange balances.', [claim('CoinFLEX controlled margin and withdrawals on a custodial derivatives platform.', ['seychelles', 'coindesk-rvusd'], 'Court and market descriptions.'), claim('A special arrangement allegedly prevented normal liquidation of the disputed position.', ['seychelles', 'axios'], 'Court-filed company explanation and independent report.'), claim('Restructuring converted balances into multiple creditor instruments.', ['seychelles', 'decrypt-plan'], 'Plan terms.')]),
    token_and_value_capture: section('FLEX was CoinFLEX’s venue token, while flexUSD was a separate stablecoin product and rvUSD represented contingent recovery value. The restructuring also proposed locked FLEX and company equity for creditors. None of those instruments was equivalent to cash or a guaranteed redemption. Their value depended on venue activity, company value and successful collection of the disputed claim. OPNX later used a different OX token, which should not be merged into CoinFLEX’s recovery math.', [claim('FLEX, flexUSD, rvUSD and equity carried distinct rights.', ['seychelles', 'decrypt-plan'], 'Court-filed restructuring categories.', { kind: 'inference' }), claim('rvUSD redemption depended on successful recovery of liquid assets from Roger Ver.', ['seychelles'], 'Proposed ring-fenced SPV terms.'), claim('OPNX’s OX token is separate from CoinFLEX recovery instruments.', ['theblock-opnx', 'hong-kong'], 'Successor-context and pleaded entity separation.', { kind: 'inference' })]),
    counterfactual: section('Enforcing normal liquidation rules, capping single-counterparty exposure, requiring additional collateral and independently reviewing exceptions could have prevented one account from threatening all withdrawals. Once the gap existed, a cash recapitalization or transparent liquidation could have given creditors simpler rights than several volatile instruments, though neither was assured. The key counterfactual is whether the disputed position would have been liquidated earlier under ordinary rules; the court record says the exception prevented that.', [claim('Concentration limits and automatic liquidation address the documented failure mode.', ['seychelles'], 'Analyst counterfactual.', { kind: 'inference' }), claim('Simpler creditor consideration could have reduced valuation complexity.', ['seychelles', 'decrypt-plan'], 'Analyst counterfactual.', { kind: 'inference' }), claim('Whether outside capital or liquidation would have improved recovery is unknown.', ['seychelles'], 'No completed alternative valuation is published.', { kind: 'unknown' })]),
    risks_and_unknowns: section('The exchange is closed, but recovery uncertainty remains. The central unknown is how much, if anything, was collected on the disputed $84 million claim; the court filing proves that CoinFLEX asserted it, not that Ver legally owed or paid it. Creditor outcomes also depend on equity, token liquidity and restructuring costs. Separate Hong Kong allegations over OPNX-related assets and FLEX transfers remain contested and should not be described as findings.', [claim('The $84 million figure is a disputed company claim, not an adjudicated judgment.', ['seychelles', 'axios'], 'Legal-status boundary.'), claim('Final creditor value depends on several illiquid or contingent instruments.', ['seychelles', 'decrypt-plan'], 'Plan consideration.', { kind: 'inference' }), claim('The reviewed OPNX asset-transfer claims remain allegations.', ['hong-kong'], 'Procedural summary.', { kind: 'unknown' })]),
    lifecycle: section('CoinFLEX launched in 2019 as a derivatives venue, expanded into exchange and stablecoin tokens, then stopped withdrawals in June 2022 when a concentrated counterparty position created a hole. Seychelles reorganization followed, with court approval in March 2023. Trading officially ceased October 31, 2023. OPNX operated afterward and closed in 2024, but disputed ownership and transfer claims prevent treating it as a clean continuation. CoinFLEX’s lifecycle is failure followed by contested recovery.', [claim('CoinFLEX stopped withdrawals in June 2022.', ['seychelles', 'axios'], 'Court and independent chronology.'), claim('The restructuring received court approval in March 2023.', ['decrypt-plan'], 'Approval report.'), claim('CoinFLEX trading ceased October 31, 2023.', ['wipo'], 'WIPO decision chronology.')]),
    outlook_and_watch: section('Watch court and restructuring records for actual recovery on the disputed claim, distributions from the rvUSD vehicle, equity outcomes and resolution of CoinFLEX/OPNX asset litigation. Do not use FLEX or OX market prices as a substitute for creditor recovery. A better outcome requires cash realization and distributable value; a worse one leaves creditors with illiquid instruments and unresolved claims. No reviewed evidence supports a CoinFLEX exchange relaunch.', [claim('Cash recovery and distributions are the decisive remaining signals.', ['seychelles'], 'Recovery-vehicle design.', { kind: 'inference' }), claim('Token prices do not measure creditor distributions across mixed instruments.', ['seychelles', 'theblock-opnx'], 'Analyst metric boundary.', { kind: 'inference' }), claim('No reviewed source supports a CoinFLEX relaunch.', ['wipo', 'theblock-opnx'], 'Trading cessation and successor closure.', { kind: 'inference' })]),
  },
  metrics: [
    metric('company-claimed-counterparty-debt', 'customer_shortfall', 'CoinFLEX-claimed counterparty debt assigned to recovery rights', 84000000, ['seychelles', 'axios'], 'Company claim reproduced in the reorganization record and paired with the counterparty denial.', { asOf: '2022-08-17', window: 'reorganization application', scope: 'Claim assigned to the proposed CoinFLEX recovery vehicle', qualityFlags: ['company_claim_not_adjudicated', 'counterparty_disputed', 'not_proven_customer_loss', 'not_final_recovery'] }),
  ],
  events: [
    event('withdrawal-halt', 'withdrawal_halt', '2022-06-23', 'CoinFLEX halted withdrawals after a large counterparty position produced a claimed shortfall.', ['seychelles', 'axios', 'coindesk-rvusd'], 'Court and contemporaneous reports.'),
    event('interim-reorganization', 'restructuring', '2022-08-17', 'The Seychelles court granted interim approval for the proposed reorganization process.', ['seychelles'], 'Court order.'),
    event('plan-approved', 'restructuring', '2023-03-06', 'The Seychelles court approved the restructuring plan.', ['decrypt-plan'], 'Independent report quoting the operator.'),
    event('trading-ceased', 'closure', '2023-10-31', 'CoinFLEX trading officially ceased.', ['wipo'], 'WIPO decision chronology.'),
  ],
  feature: { lifecycle: 'dead', operating_model: 'Closed custodial derivatives exchange whose dollarized creditor claims received mixed equity, token and disputed-recovery rights.', product_cohort: 'centralized_derivatives_exchange', custody_model: 'custodial', token_status: 'launched', token_symbol: 'FLEX', token_launch_date: '2019-07-01', token_launch_timing: 'post_product', token_strategy: 'venue_utility_separate_from_flexusd_and_rvusd_recovery_rights', token_source_url: 'https://seylii.org/akn/sc/judgment/scsc/2022/718/eng%402022-08-17/source.pdf', metric_type: 'customer_shortfall', metric_unit: 'usd', metric_window: 'disputed_company_claim', metric_as_of: '2022-08-17', metric_observed_at: OBSERVED_AT, comparability_key: 'cex|centralized_derivatives_exchange|customer_shortfall|usd|disputed_company_claim' },
};

const xeggexSources = [
  source('xeggex', 'terms', 'XeggeX terms and conditions', 'https://xeggex.com/legal/terms', 'XeggeX', { locator: 'Current platform terms describing digital-asset trading but not naming a contracting legal entity.', directHttpStatus: 0, accessMethod: 'indexed_browser_snapshot' }),
  source('xeggex', 'reserves', 'XeggeX proof of liabilities and reserves', 'https://xeggex.com/provereserves', 'XeggeX', { locator: 'Current operator-produced Merkle-liability and reserve page, stated to refresh every six hours.', directHttpStatus: 0, accessMethod: 'indexed_browser_snapshot' }),
  source('xeggex', 'homepage', 'XeggeX cryptocurrency exchange', 'https://www.xeggex.com/', 'XeggeX', { locator: 'Current 2026 website and trading interface; existence does not establish continuity with the 2025 operator.', directHttpStatus: 0, accessMethod: 'indexed_browser_snapshot' }),
  source('xeggex', 'verification', 'XeggeX official communication verification', 'https://xeggex.com/verification-search', 'XeggeX', { locator: 'Current communication-authenticity page.', directHttpStatus: 0, accessMethod: 'indexed_browser_snapshot' }),
  source('xeggex', 'xpe', 'Xpense native token whitepaper', 'https://xpense.network/xpense.pdf', 'Xpense', { publishedAt: '2023-07-01', locator: 'Historical XPE token design and claimed relationship to XeggeX.', directHttpStatus: 0, accessMethod: 'indexed_pdf_snapshot' }),
  source('xeggex', 'poloniex', 'New listing: XeggeX (XPE)', 'https://support.poloniex.com/hc/en-us/articles/20193879186455-New-Listing-XeggeX-XPE', 'Poloniex', { publishedAt: '2023-10-03', tier: 'B', role: 'independent', locator: 'Independent exchange listing that identified XPE as the XeggeX token.' }),
  source('xeggex', 'pactus', 'Important announcement regarding XeggeX exploit', 'https://pactus.org/2025/02/10/important-announcement-regarding-xeggex-exploit/', 'Pactus', { publishedAt: '2025-02-10', tier: 'B', role: 'independent', locator: 'Affected ecosystem project’s chronology, asset-movement observations and explicitly attributed exit-scam concern.' }),
  source('xeggex', 'incident-archive', 'Archived XeggeX incident statement', 'https://bitcointalk.org/index.php?topic=5530595.0', 'Bitcointalk archive', { publishedAt: '2025-02-14', tier: 'C', role: 'independent', locator: 'Forum archive quoting the operator’s account of database loss and a compromised administrator device.' }),
  source('xeggex', 'mpost', 'XeggeX CEO Telegram account hacked and users unable to log in', 'https://mpost.io/xeggex-ceos-telegram-account-hacked-users-unable-to-log-in-to-exchange/', 'Metaverse Post', { publishedAt: '2025-02-04', tier: 'C', role: 'independent', locator: 'Contemporaneous report of the initial operator statement and login shutdown.' }),
  source('xeggex', 'companies-house', 'XEGGEX SOFTWARE SERVICES LTD filing history', 'https://find-and-update.company-information.service.gov.uk/company/14910559/filing-history', 'UK Companies House', { locator: 'Official UK company filing history; the current platform terms do not identify this company as the contracting operator.' }),
];

const xeggex = {
  slug: 'xeggex', name: 'XeggeX', aliases: ['XeggeX Exchange'], table: 'mid_exchanges',
  operatingState: 'website_online_operator_continuity_unverified', outcome: 'historical_platform_failure_with_unverified_brand_return', outcomeConfidence: 'medium', qualityConfidence: 'medium',
  classification: { subtype: 'small-asset custodial spot exchange with failed 2025 platform and unverified 2026 brand return', tags: ['custodial', 'spot', 'security-incident', 'data-loss', 'identity-risk', 'website-online', 'exchange-token'], chains: [], jurisdictions: ['unknown'] },
  sources: xeggexSources,
  statusAssertion: 'A site using the XeggeX brand was live at the review date, but its legal operator and continuity with the platform that failed in 2025 were not verified.', statusSourceKeys: ['terms', 'homepage', 'companies-house'], statusEvidenceLocator: 'Current site and legal-page inspection paired with the official company registry.',
  statusConfidence: 'medium',
  outcomeAssertion: 'The historical XeggeX platform failed after a severe security and data-loss event; the current website is classified separately as an unverified brand return.', outcomeSourceKeys: ['incident-archive', 'pactus', 'mpost', 'terms', 'homepage'], outcomeEvidenceLocator: 'Archived operator statements, affected-project reporting and current-site inspection.',
  identityBoundary: 'The XeggeX platform that lost access and data in February 2025, the current 2026 website, any company using the XeggeX name, and the XPE token are separate subjects until continuity is proven. Current terms do not name a contracting legal entity. No primary bankruptcy order, verified $80 million loss or verified 12,000-user count was found, so those legacy claims are removed.',
  methodologyNotes: ['A live website and self-published reserve page do not prove that the old operator returned, that old customer liabilities were assumed or that reserves were independently audited.', 'Pactus’s exit-scam concern is attributed to Pactus and is not a regulator or court finding.'],
  unknowns: ['Identity and jurisdiction of the current contracting operator', 'Whether the current site assumed 2025 customer liabilities', 'Verified assets lost and customers affected in the 2025 incident', 'Current legal rights and utility of historical XPE holders'],
  unsourcedFields: ['Current legal operator', 'Continuity and liability assumption', 'Verified incident loss and user count', 'Current XPE rights'],
  sections: {
    what_it_is: section('XeggeX was a custodial exchange focused on many smaller crypto assets and used internal accounts for deposits, trading and withdrawals. A severe February 2025 incident took the platform offline and damaged its data. A website with the same brand is live again in 2026 and advertises trading and proof of reserves. The current terms do not name the legal operator, so Chaindump treats the old failed platform and the present site as unverified counterparts, not one proven continuous business.', [claim('The current XeggeX site advertises custodial digital-asset trading.', ['terms', 'homepage'], 'Current site and terms.'), claim('The historical platform suffered a security and data-loss incident in February 2025.', ['incident-archive', 'mpost', 'pactus'], 'Archived operator account and independent chronology.'), claim('Legal and operational continuity between the 2025 platform and current site is unverified.', ['terms', 'companies-house', 'homepage'], 'Current terms omit a legal entity.', { kind: 'unknown' })]),
    what_happened: section('On February 3, 2025 XeggeX reported a security breach and data loss after an administrator device and communication accounts were compromised. The archived statement said database collections were deleted and restoration was attempted. Pactus later reported asset movements and publicly raised exit-scam concerns, but that was its assessment rather than an official finding. The old service did not transparently recover. A new-looking site later appeared under the same domain without a published liability-assumption record.', [claim('XeggeX reported a February 3 security breach and database loss.', ['incident-archive', 'mpost'], 'Archived operator statement and contemporaneous report.'), claim('Pactus reported asset movements and raised an exit-scam concern.', ['pactus'], 'Affected-project statement.', { note: 'Attributed concern; not a legal finding.' }), claim('No reviewed record shows the current site assumed historical customer liabilities.', ['terms', 'homepage', 'companies-house'], 'Current-site disclosure gap.', { kind: 'unknown' })]),
    why_this_outcome: section('The documented technical failure combined privileged access, communications and critical data around an administrator device. Once that access was compromised, databases were taken offline or deleted and users lost reliable account access. That is both a security-architecture and governance failure: an exchange should not depend on one poorly isolated control path. The later lack of a named operator, audited incident account and liability reconciliation prevented trust from being rebuilt even though the domain returned.', [claim('The archived operator account tied the incident to privileged administrator access and data loss.', ['incident-archive'], 'Quoted incident explanation.'), claim('Control concentration made the technical compromise a governance problem.', ['incident-archive', 'pactus'], 'Analyst causal inference.', { kind: 'inference' }), claim('Missing operator and liability disclosure leaves the current return unverified.', ['terms', 'reserves', 'companies-house'], 'Current disclosure gap.', { kind: 'unknown' })]),
    strategic_choices: section('The historical exchange chose to list a long tail of assets and run customer access through a centralized platform with opaque legal and operational ownership. Its incident account indicates sensitive administrative authority was concentrated around one device. The current site chose to publish a Merkle-style proof page and communication checker, which addresses visible trust concerns, but it did not publish the legal entity, independent audit, incident reconciliation or assumption of old balances needed to prove a genuine recovery.', [claim('The historical platform used centralized custody and administration.', ['incident-archive', 'terms'], 'Incident and current operating mechanics.'), claim('The current site publishes proof and communication-verification pages.', ['reserves', 'verification'], 'Current operator pages.'), claim('The current site does not publish the evidence needed to prove liability continuity.', ['terms', 'reserves', 'companies-house'], 'Disclosure audit.', { kind: 'unknown' })]),
    operating_model: section('Customers deposited digital assets, traded them on an internal platform and depended on XeggeX to maintain account data and authorize withdrawals. That model makes database integrity, wallet control and legal accountability inseparable from customer access. The current terms describe the platform as a facilitator and reserve broad suspension powers, while the proof page shows operator-produced balances. Without a named contracting company and independent liability audit, users cannot verify who owes them assets or whether all liabilities are included.', [claim('XeggeX relied on internal accounts and operator-controlled service access.', ['terms', 'incident-archive'], 'Terms and incident mechanics.'), claim('The current reserve page is operator-produced and refreshes every six hours.', ['reserves'], 'Current page description.'), claim('Liability completeness and legal obligor identity are not independently verified.', ['terms', 'reserves', 'companies-house'], 'Disclosure gap.', { kind: 'unknown' })]),
    token_and_value_capture: section('Xpense, symbol XPE, was presented as the native token of the historical XeggeX exchange and received an independent Poloniex listing. Its claimed utility included venue-related functions, so value depended on continued platform use. The current XeggeX site does not provide a clear, legally binding statement that old XPE rights continue, were migrated or were redeemed. The presence of an old whitepaper or current token references is therefore history, not proof of present holder rights.', [claim('XPE was marketed as the historical XeggeX native token.', ['xpe', 'poloniex'], 'Whitepaper and independent listing.'), claim('XPE utility was linked to the venue.', ['xpe'], 'Historical token design.'), claim('Current contractual rights or migration treatment for XPE are not established.', ['terms', 'homepage', 'xpe'], 'Current terms and historical token record.', { kind: 'unknown' })]),
    counterfactual: section('Hardware-backed privileged access, separation of duties, offline database backups and tested disaster recovery could have limited the 2025 blast radius. A public incident report and independently reconciled customer ledger could have made recovery credible. For the current site, naming the legal operator, proving ownership continuity and auditing both assets and liabilities would materially change the risk call. None of those safeguards can be inferred from a live domain or a self-published Merkle page alone.', [claim('Separated access and tested backups address the documented compromise and data loss.', ['incident-archive'], 'Analyst counterfactual.', { kind: 'inference' }), claim('A reconciled ledger and incident report could have supported a credible recovery.', ['incident-archive', 'pactus'], 'Analyst counterfactual.', { kind: 'inference' }), claim('Legal identity and independent liability assurance would change the current classification.', ['terms', 'reserves', 'companies-house'], 'Specified falsification evidence.', { kind: 'inference' })]),
    risks_and_unknowns: section('The largest current risk is identity: users cannot tell from the terms which legal entity operates the site or whether it owes anything to customers of the failed platform. The reserve page may show selected balances but does not establish an independent audit, ownership continuity or complete liabilities. Historical loss estimates of $80 million and 12,000 users, plus a June 2025 bankruptcy claim, lack the primary court or administrator record required for publication and are intentionally excluded.', [claim('The current terms do not name a contracting legal entity.', ['terms'], 'Legal-page inspection.'), claim('The reserve page does not prove historical liability assumption or independent audit.', ['reserves', 'terms'], 'Scope limitation.', { kind: 'inference' }), claim('The legacy $80 million, 12,000-user and bankruptcy assertions were not primary-source verified.', ['companies-house', 'terms', 'pactus'], 'Evidence audit.', { kind: 'unknown' })]),
    lifecycle: section('XeggeX operated from roughly 2021, launched XPE and built a niche exchange for smaller assets. The February 2025 compromise caused a platform and data failure from which the old service did not transparently recover. In 2026 the domain again presents an exchange interface, proof page and updated terms. Because operator identity, customer-liability continuity and recovery records are missing, the lifecycle is not “reopened.” It is a failed historical platform followed by an unverified brand return.', [claim('The historical venue operated before the February 2025 failure.', ['xpe', 'poloniex', 'incident-archive'], 'Token and incident chronology.'), claim('A current XeggeX-branded website was live at the review date.', ['homepage', 'terms', 'reserves'], 'Current page inspection.'), claim('The lifecycle cannot be classified as a verified reopening.', ['terms', 'companies-house', 'homepage'], 'Continuity evidence gap.', { kind: 'inference' })]),
    outlook_and_watch: section('Watch for a named legal operator and jurisdiction, signed proof that it controls the historic company or assets, an independent reserve-and-liability audit, and a plan for old customer balances and XPE. Verified documentation on those points could move the current site into a normal operating review. Absent that evidence, a functioning interface should not override the 2025 failure record. Any formal insolvency claim also needs a court or administrator document before publication.', [claim('Legal identity, continuity and audited liabilities are the decisive watch signals.', ['terms', 'reserves', 'companies-house'], 'Specified review criteria.', { kind: 'inference' }), claim('A live interface alone does not prove recovery of the historical operator.', ['homepage', 'incident-archive'], 'Analyst identity boundary.', { kind: 'inference' }), claim('No primary insolvency filing was verified in the reviewed source set.', ['companies-house', 'pactus'], 'Evidence gap.', { kind: 'unknown' })]),
  },
  metrics: [],
  events: [
    event('xpe-listing', 'token', '2023-10-03', 'Poloniex announced a listing of XPE and identified it as the XeggeX token.', ['poloniex', 'xpe'], 'Independent listing and token paper.'),
    event('security-incident', 'security', '2025-02-03', 'XeggeX reported a security breach, login shutdown and data loss.', ['incident-archive', 'mpost'], 'Archived operator statement and contemporaneous report.'),
    event('pactus-warning', 'ecosystem_warning', '2025-02-10', 'Pactus reported asset movements and raised concerns about a possible exit scam.', ['pactus'], 'Attributed ecosystem-project statement; not a legal finding.'),
    event('current-site-observed', 'website_return', '2026-08-03', 'A XeggeX-branded trading site and current terms were online, with operator continuity unverified.', ['homepage', 'terms', 'reserves'], 'Current-site observation.'),
  ],
  feature: { lifecycle: 'mid', operating_model: 'Historical custodial spot exchange failed in 2025; a current branded site is online without verified operator or liability continuity.', product_cohort: 'centralized_long_tail_spot_exchange', custody_model: 'custodial', token_status: 'launched', token_symbol: 'XPE', token_launch_date: '2023-07-01', token_launch_timing: 'post_product', token_strategy: 'historical_venue_utility_current_rights_unverified', token_source_url: 'https://xpense.network/xpense.pdf', metric_type: 'customer_shortfall', metric_unit: 'unknown', metric_window: 'incident_loss_unverified', metric_as_of: '2025-02-03', metric_observed_at: OBSERVED_AT, comparability_key: 'cex|centralized_long_tail_spot_exchange|customer_shortfall|unknown|incident_unverified' },
};

const specs = [ascendex, blockfi, celsius, coinflex, xeggex];

export const document = {
  schema: 'chaindump-cex-wave-f-v1',
  research_as_of: AS_OF,
  generated_migration: '0101_cex_wave_f_profiles.sql',
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
  return `INSERT INTO _cex_wave_f_profiles_0101 (
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

DROP TABLE IF EXISTS _cex_wave_f_profiles_0101;

CREATE TABLE _cex_wave_f_profiles_0101 (
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
FROM _cex_wave_f_profiles_0101 AS staged
WHERE staged.target_table = 'successful_exchanges'
  AND exchange_row.type = 'cex'
  AND exchange_row.slug = staged.slug;

UPDATE mid_exchanges AS exchange_row
SET profile = json_set(
  CASE WHEN json_valid(exchange_row.profile) AND json_type(exchange_row.profile) = 'object'
    THEN exchange_row.profile ELSE '{}' END,
  '$.canonical_profile', json(staged.canonical_profile)
)
FROM _cex_wave_f_profiles_0101 AS staged
WHERE staged.target_table = 'mid_exchanges'
  AND exchange_row.kind = 'cex'
  AND exchange_row.slug = staged.slug;

UPDATE dead_exchanges AS exchange_row
SET profile = json_set(
  CASE WHEN json_valid(exchange_row.profile) AND json_type(exchange_row.profile) = 'object'
    THEN exchange_row.profile ELSE '{}' END,
  '$.canonical_profile', json(staged.canonical_profile)
)
FROM _cex_wave_f_profiles_0101 AS staged
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
FROM _cex_wave_f_profiles_0101
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

DROP TABLE _cex_wave_f_profiles_0101;
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

#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYSIS_SECTION_KEYS, validateEntityProfile } from '../src/lib/entity-profile.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(root, 'docs/dex-wave-f-profiles-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0083_dex_wave_f_profiles.sql');
const AS_OF = '2026-08-03';
const ACCESSED_AT = '2026-08-03T18:58:00Z';
const OBSERVED_AT = '2026-08-03T18:53:00Z';
const NEXT_REVIEW_AT = '2026-08-10T18:58:00Z';
const MAX_D1_STATEMENT_BYTES = 95_000;

function source(slug, key, title, url, publisher, {
  publishedAt = null,
  tier = 'B',
  role = 'primary',
  locator = 'The reviewed page and its current dated or versioned content.',
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

function claim(assertion, sourceIds, evidenceLocator, {
  value = assertion,
  confidence = 'high',
  kind = 'fact',
  supportDirection = 'supports',
  note = null,
} = {}) {
  return {
    assertion,
    value,
    source_ids: sourceIds,
    evidence_locator: evidenceLocator,
    confidence,
    kind,
    support_direction: supportDirection,
    note,
  };
}

function section(body, claims) {
  return { body, claims };
}

function rolling(end, definition) {
  return { start: null, end, definition };
}

function metric(key, dimension, label, value, sourceIds, method, {
  window = 'provider-reported latest point',
  scope = 'exchange venue',
  qualityFlags = [],
  asOf = AS_OF,
  currency = 'USD',
  unit = 'usd',
  evidenceLocator = `Provider response replayed between ${OBSERVED_AT} and ${ACCESSED_AT}; exact value retained in the research artifact.`,
} = {}) {
  return {
    key,
    dimension,
    label,
    value,
    unit,
    currency,
    window: rolling(asOf, window),
    as_of: asOf,
    method,
    scope: { product: scope, chains: [] },
    source_ids: sourceIds,
    evidence_locator: evidenceLocator,
    quality_flags: qualityFlags,
  };
}

function event(key, type, date, description, sourceIds, evidenceLocator) {
  return { key, type, date, description, source_ids: sourceIds, evidence_locator: evidenceLocator };
}

function buildProfile(spec) {
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
        source_ids: entry.source_ids,
        evidence_locator: entry.evidence_locator,
        support_direction: entry.support_direction,
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
      assertion: `${spec.name} was ${spec.operatingState.replaceAll('_', ' ')} at the review date.`,
      value: spec.operatingState,
      as_of: AS_OF,
      confidence: 'high',
      kind: 'fact',
      source_ids: spec.statusSources,
      evidence_locator: spec.statusLocator,
      support_direction: 'supports',
      note: null,
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    },
    {
      id: outcomeClaimId,
      field_path: 'outcome.label',
      assertion: `${spec.name} is classified ${spec.outcome.replaceAll('_', ' ')} as of ${AS_OF}.`,
      value: spec.outcome,
      as_of: AS_OF,
      confidence: spec.outcomeConfidence,
      kind: 'inference',
      source_ids: spec.outcomeSources,
      evidence_locator: spec.outcomeLocator,
      support_direction: 'supports',
      note: 'Analyst lifecycle classification; observed activity and events do not prove one exclusive cause.',
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    },
  );

  const metrics = spec.metrics.map((entry) => {
    const id = `metric:${spec.slug}:${entry.key}:${entry.as_of}`;
    const claimId = `claim:${spec.slug}:metric:${entry.key}`;
    claims.push({
      id: claimId,
      field_path: `metrics[${id}].value`,
      assertion: `${entry.label} was ${entry.value} ${entry.unit.toUpperCase()} for the stated scope and window.`,
      value: entry.value,
      as_of: entry.as_of,
      confidence: 'high',
      kind: 'fact',
      source_ids: entry.source_ids,
      evidence_locator: entry.evidence_locator,
      support_direction: 'supports',
      note: 'Point-in-time provider observation; adapters may revise same-day values and must not be combined across unlike scopes.',
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
      quality_flags: entry.quality_flags,
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
      source_ids: entry.source_ids,
      evidence_locator: entry.evidence_locator,
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
      id: `dex:${spec.slug}`,
      type: 'dex',
      slug: spec.slug,
      name: spec.name,
      aliases: spec.aliases || [],
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
      observation_window: { started_at: OBSERVED_AT, completed_at: ACCESSED_AT },
      explicit_unknowns: spec.unknowns,
      identity_boundary: spec.identityBoundary,
      methodology_notes: [
        'Every material field is attached to atomic pending claims; a person must review those claims before the report can be published.',
        'Routed volume is not additive to underlying DEX volume, notional is not revenue, TVL is not market depth, fees are not profit, and token price is not product success.',
        'Documented decisions, observed outcomes, analyst inferences and unresolved unknowns are kept separate.',
        ...spec.methodologyNotes,
      ],
    },
  };
  const errors = validateEntityProfile(profile);
  if (errors.length) throw new Error(`${spec.slug} failed profile validation: ${JSON.stringify(errors)}`);
  return profile;
}

const hyperliquidSources = [
  source('hyperliquid', 'overview', 'Hyperliquid 101', 'https://hyperliquid.gitbook.io/hyperliquid-docs/about-hyperliquid/hyperliquid-101-for-non-crypto-audiences', 'Hyperliquid', { locator: 'Current operator description of the chain, flagship exchange, HYPE uses and builder-code distribution.' }),
  source('hyperliquid', 'fees', 'Hyperliquid trading fees', 'https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees', 'Hyperliquid', { locator: 'Current fee tiers, maker rebates, deployer share and Assistance Fund burn description.' }),
  source('hyperliquid', 'staking', 'Hyperliquid staking', 'https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/staking', 'Hyperliquid', { locator: 'Delegated-proof-of-stake mechanics, validator self-delegation and reward rules.' }),
  source('hyperliquid', 'api-docs', 'Hyperliquid info endpoint', 'https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint', 'Hyperliquid', { locator: 'Definitions for metaAndAssetCtxs and spotMetaAndAssetCtxs responses.' }),
  source('hyperliquid', 'api', 'Hyperliquid protocol API', 'https://api.hyperliquid.xyz/info', 'Hyperliquid', { locator: 'POST responses replayed for perpetual and spot market contexts during the observation window.' }),
  source('hyperliquid', 'hip1', 'HIP-1 native token standard', 'https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-1-native-token-standard', 'Hyperliquid', { locator: 'Native token, spot-book deployment, deployer fee and burn mechanics.' }),
  source('hyperliquid', 'sec-filing', '21Shares Hyperliquid ETF registration statement', 'https://www.sec.gov/Archives/edgar/data/2078856/000119312526234992/d50758ds1.htm', 'U.S. Securities and Exchange Commission', { tier: 'A', role: 'independent', locator: 'Filed HYPE launch date, supply allocation, disclosed uses and vesting description.', directHttpStatus: 403, accessMethod: 'indexed_browser_snapshot' }),
  source('hyperliquid', 'jelly', 'Hyperliquid delists JELLY after vault squeeze', 'https://www.coindesk.com/markets/2025/03/26/hyperliquid-delists-jellyjelly-after-vault-squeezed-in-usd13m-tussle', 'CoinDesk', { publishedAt: '2025-03-26', role: 'independent', locator: 'Independent description of the JELLY position, validator delisting and forced settlement.' }),
  source('hyperliquid', 'fees-api', 'Hyperliquid fees API', 'https://api.llama.fi/summary/fees/hyperliquid?dataType=dailyFees', 'DefiLlama', { role: 'independent', locator: 'total24h, total7d, total30d and totalAllTime returned by the fee adapter.' }),
  source('hyperliquid', 'revenue-api', 'Hyperliquid protocol revenue API', 'https://api.llama.fi/summary/fees/hyperliquid?dataType=dailyRevenue', 'DefiLlama', { role: 'independent', locator: 'total24h, total7d, total30d and totalAllTime returned by the revenue adapter.' }),
  source('hyperliquid', 'spot-api', 'Hyperliquid spot-volume API', 'https://api.llama.fi/summary/dexs/hyperliquid?dataType=dailyVolume', 'DefiLlama', { role: 'independent', locator: 'Separately scoped spot-volume adapter used as a cross-check, not added to protocol API totals.' }),
];

const hyperliquid = {
  slug: 'hyperliquid',
  name: 'Hyperliquid DEX',
  aliases: ['Hyperliquid exchange', 'HyperCore exchange'],
  table: 'successful_exchanges',
  operatingState: 'operating',
  outcome: 'successful_established',
  outcomeConfidence: 'high',
  qualityConfidence: 'high',
  classification: {
    subtype: 'onchain perpetual and spot central-limit order book',
    tags: ['perpetuals', 'spot', 'order_book', 'self_custody', 'app_specific_chain'],
    chains: ['Hyperliquid L1'],
    jurisdictions: [],
  },
  sources: hyperliquidSources,
  statusSources: ['source:hyperliquid:api', 'source:hyperliquid:fees-api'],
  statusLocator: 'Current market-context responses and current fee-adapter observations show active trading.',
  outcomeSources: ['source:hyperliquid:api', 'source:hyperliquid:fees-api', 'source:hyperliquid:revenue-api', 'source:hyperliquid:overview', 'source:hyperliquid:jelly'],
  outcomeLocator: 'Current scale, documented product mechanics, sustained fee production and the material 2025 intervention are considered together.',
  identityBoundary: 'This profile covers the Hyperliquid DEX running in HyperCore. The Hyperliquid L1 and HyperEVM are separate blockchain surfaces and have their own blockchain analysis.',
  methodologyNotes: [
    'Perpetual notional and open interest come from Hyperliquid market-context responses; the spot series is kept separate.',
    'Protocol fee and revenue adapters do not establish audited company profit or a legal right for HYPE holders.',
  ],
  unknowns: [
    'Unique and retained traders across linked accounts are not published in the reviewed sources.',
    'Complete validator ownership and coordinated-control relationships are not established by public labels.',
    'Audited exchange-level expenses, treasury runway and net profit are not public.',
    'The long-run effect of discretionary validator interventions on market-maker confidence is not measurable yet.',
  ],
  unsourcedFields: ['Unique retained traders', 'Audited operating profit', 'Complete validator beneficial ownership', 'Jurisdiction-by-jurisdiction derivatives eligibility'],
  sections: {
    what_it_is: section(
      'Hyperliquid DEX is the flagship exchange inside HyperCore, the trading engine of Hyperliquid L1. It runs perpetual-futures and spot order books onchain, so orders, fills, margin and liquidations are recorded by the network while traders keep control of their accounts. This is not the same object as the Hyperliquid blockchain profile: the L1 also secures HyperEVM and other applications, while this report judges the exchange venue and its market design.',
      [
        claim('Hyperliquid DEX operates perpetual and spot order books inside HyperCore.', ['source:hyperliquid:overview', 'source:hyperliquid:api-docs'], 'Operator product description and API market-context definitions.'),
        claim('The DEX is a venue on Hyperliquid L1, not the whole blockchain or HyperEVM ecosystem.', ['source:hyperliquid:overview', 'source:hyperliquid:hip1'], 'The operator separates flagship exchange applications from the wider chain and token standard.'),
        claim('Orders, fills and liquidations are represented as onchain exchange activity.', ['source:hyperliquid:overview', 'source:hyperliquid:api-docs'], 'Current architecture description and market-context schema.'),
      ],
    ),
    what_happened: section(
      'The venue moved from a 2023-era perpetuals product into the dominant high-volume case in this cohort, then added spot books and a native token. HYPE launched on 2024-11-29 through a large user distribution and now links network security, fees and exchange economics. At the current replay, Hyperliquid reported about $3.07 billion of 24-hour perpetual notional, $6.90 billion of open interest and $69.68 million of spot notional. Growth did not eliminate market-design risk: validators delisted JELLY and forcibly settled positions during a March 2025 squeeze involving the shared liquidity vault.',
      [
        claim('HYPE launched through the Genesis distribution on 2024-11-29.', ['source:hyperliquid:sec-filing'], 'SEC-filed registration statement describing the launch and distribution.'),
        claim('The current protocol API showed multi-billion-dollar daily perpetual notional and open interest.', ['source:hyperliquid:api', 'source:hyperliquid:api-docs'], 'Replayed metaAndAssetCtxs response and field definitions.'),
        claim('Validators delisted JELLY and forcibly settled positions during the March 2025 squeeze.', ['source:hyperliquid:jelly'], 'Independent event report dated 2025-03-26.'),
      ],
    ),
    why_this_outcome: section(
      'The best-supported explanation is vertical integration. Hyperliquid designed the chain around the exchange instead of asking a general-purpose chain to meet its latency, ordering and margin requirements. That let the product combine CEX-like books and a fast interface with self-custody and public state. A user-focused token distribution, maker rebates, builder codes and deepening liquidity reinforced the trading funnel. These mechanisms are consistent with the observed scale, but public data cannot isolate how much growth came from execution quality, incentives, the 2024 token launch, market volatility or competitors losing share.',
      [
        claim('Purpose-built exchange execution reduced the product constraints of deploying a matching engine on an unrelated chain.', ['source:hyperliquid:overview', 'source:hyperliquid:api-docs'], 'Documented integrated stack; causal implication is analyst synthesis.', { kind: 'inference', confidence: 'medium' }),
        claim('Maker rebates, builder economics and HYPE distribution created acquisition and retention incentives around the venue.', ['source:hyperliquid:fees', 'source:hyperliquid:overview', 'source:hyperliquid:sec-filing'], 'Documented fee tiers, builder codes and token distribution.', { kind: 'inference', confidence: 'medium' }),
        claim('Public evidence does not identify one exclusive cause for Hyperliquid growth.', ['source:hyperliquid:api', 'source:hyperliquid:fees-api', 'source:hyperliquid:overview'], 'Reviewed sources measure outcomes and mechanisms but do not estimate causal contribution.', { kind: 'unknown', confidence: 'high' }),
      ],
    ),
    strategic_choices: section(
      'Management chose a purpose-built L1 and an onchain order book rather than an AMM on a neutral host chain. It distributed 31% of HYPE to prior users at launch, reserved large allocations for future rewards and contributors, and connected fees to the Assistance Fund’s automated HYPE purchases and burns. It also opened market deployment and builder-code revenue to outside teams. Those choices strengthened distribution and value capture, but they concentrate exchange, chain, validator and token risk in one stack and leave the venue responsible for interventions that a neutral settlement layer would not make.',
      [
        claim('Hyperliquid vertically integrated the venue with its own exchange-optimized L1.', ['source:hyperliquid:overview', 'source:hyperliquid:staking'], 'Current operator architecture and security model.'),
        claim('The HYPE launch allocated 31% to prior users and reserved additional supply for rewards and contributors.', ['source:hyperliquid:sec-filing'], 'Filed token allocation and vesting description.'),
        claim('Trading-fee flows include automated HYPE purchases and burns through the Assistance Fund.', ['source:hyperliquid:fees'], 'Current fee allocation documentation.'),
        claim('Vertical integration increases the consequence of validator, venue or token-policy errors affecting the same ecosystem.', ['source:hyperliquid:jelly', 'source:hyperliquid:staking', 'source:hyperliquid:fees'], 'Observed intervention and documented shared security/economic stack.', { kind: 'inference', confidence: 'medium' }),
      ],
    ),
    operating_model: section(
      'Traders post orders to central-limit books for perpetual and spot markets. Perpetual accounts use collateral, funding and liquidation rules; spot books settle HIP-1 assets. Fees depend on a trader’s rolling volume, makers can receive rebates and market deployers may keep part of selected fees. Validators order and finalize the exchange state, while HLP and related vaults provide market-making and liquidation capacity. Volume is not revenue and open interest is not money held for users, so each series stays separate.',
      [
        claim('The venue uses separate perpetual and spot books with a shared fee-tier calculation.', ['source:hyperliquid:fees', 'source:hyperliquid:api-docs'], 'Current fee rules and separate API contexts.'),
        claim('Validators finalize HyperCore state and delegated HYPE secures the network.', ['source:hyperliquid:staking'], 'Current validator and staking documentation.'),
        claim('Market deployers may retain part of selected spot or HIP-3 fees.', ['source:hyperliquid:fees', 'source:hyperliquid:hip1'], 'Current deployer-fee rules.'),
      ],
    ),
    token_and_value_capture: section(
      'HYPE launched on 2024-11-29 and has a one-billion-token maximum allocation in the reviewed filing. The token secures validators, pays certain network costs and can affect trading fees. Exchange fees routed to the Assistance Fund are converted into HYPE and burned; other fee shares can reach HLP, makers or market deployers. That is real protocol-linked demand, but HYPE is not an equity claim, and gross buybacks do not equal profit after incentives, vault risk, operating cost or token emissions.',
      [
        claim('HYPE has a disclosed maximum allocation of one billion tokens and launched on 2024-11-29.', ['source:hyperliquid:sec-filing'], 'Filed launch and supply description.'),
        claim('HYPE is used for staking, network costs and trading-fee benefits.', ['source:hyperliquid:overview', 'source:hyperliquid:staking', 'source:hyperliquid:fees'], 'Current utility and fee documentation.'),
        claim('Assistance Fund purchases and burns create protocol-linked demand but do not give holders an ownership claim.', ['source:hyperliquid:fees', 'source:hyperliquid:sec-filing'], 'Fee mechanism read with the filed token-rights disclosure.', { kind: 'inference', confidence: 'high' }),
      ],
    ),
    counterfactual: section(
      'A neutral rollup or app deployment could have reduced the concentration created by one team’s chain, venue and frontend, but it likely would have sacrificed the execution control that made the product competitive. Earlier market-specific open-interest caps and tighter shared-vault limits might have reduced the JELLY intervention risk. The evidence cannot show whether those controls would have slowed growth or prevented the squeeze, so this is a bounded alternative, not a claim that one design guarantees safety.',
      [
        claim('A neutral host chain would trade execution control for lower single-stack concentration.', ['source:hyperliquid:overview', 'source:hyperliquid:staking'], 'Documented integrated architecture used to bound the alternative.', { kind: 'inference', confidence: 'medium' }),
        claim('Tighter market and vault limits before March 2025 could plausibly have reduced JELLY exposure.', ['source:hyperliquid:jelly'], 'Incident mechanics support the direction but not a quantified avoided loss.', { kind: 'inference', confidence: 'medium' }),
        claim('Public evidence cannot establish the growth cost of stricter pre-incident controls.', ['source:hyperliquid:jelly', 'source:hyperliquid:api'], 'No reviewed source estimates the counterfactual adoption effect.', { kind: 'unknown', confidence: 'high' }),
      ],
    ),
    risks_and_unknowns: section(
      'The principal risks are concentrated governance of a systemically important venue, shared-vault exposure, oracle and thin-market manipulation, derivatives regulation, and competition from other fast perpetual exchanges. The JELLY decision protected the vault but showed that validators can intervene in listed markets. Public sources do not provide audited exchange profit, complete validator ownership, retained-trader cohorts or jurisdiction-by-jurisdiction eligibility. Those gaps prevent a full decentralization, profitability or customer-quality conclusion.',
      [
        claim('The JELLY response demonstrates that validator intervention is a live exchange-governance risk.', ['source:hyperliquid:jelly', 'source:hyperliquid:staking'], 'Independent incident report read with the validator model.'),
        claim('Leveraged markets remain exposed to thin-market, oracle, liquidation and shared-vault stress.', ['source:hyperliquid:jelly', 'source:hyperliquid:api-docs'], 'Observed squeeze and current market data fields.', { kind: 'inference', confidence: 'high' }),
        claim('Audited profit, retained traders and complete validator control relationships remain unknown.', ['source:hyperliquid:api', 'source:hyperliquid:fees-api', 'source:hyperliquid:staking'], 'Reviewed public sources do not publish these fields.', { kind: 'unknown', confidence: 'high' }),
      ],
    ),
    lifecycle: section(
      'Hyperliquid began as a specialist perpetuals venue, expanded into spot markets and then launched HYPE in November 2024. The exchange’s volume, open interest and fee base grew into category leadership, while HyperEVM broadened the surrounding chain. March 2025 was the important stress test: the JELLY squeeze led to an emergency delisting and forced settlement rather than a normal market close. By 2026-08-03 the venue remained active at large scale, so the lifecycle call is successful and established, with governance maturity still being tested.',
      [
        claim('The venue expanded from perpetuals into spot and a broader chain ecosystem.', ['source:hyperliquid:overview', 'source:hyperliquid:hip1'], 'Current product history and native spot-token standard.'),
        claim('The HYPE launch materially connected exchange activity to network security and token economics.', ['source:hyperliquid:sec-filing', 'source:hyperliquid:fees', 'source:hyperliquid:staking'], 'Launch, utility and fee documentation.'),
        claim('Current activity after the JELLY intervention supports an established rather than failed lifecycle call.', ['source:hyperliquid:api', 'source:hyperliquid:fees-api', 'source:hyperliquid:jelly'], 'Current observations considered after the dated stress event.', { kind: 'inference', confidence: 'high' }),
      ],
    ),
    outlook_and_watch: section(
      'The base case is continued category leadership, but not an uncontested monopoly. Watch perpetual notional and open interest together, spot growth separately, 30-day fees and revenue, Assistance Fund burns, validator concentration and the frequency of emergency market actions. A healthy outcome would pair durable volume with fewer discretionary interventions and broader validator control. Falling share, repeated vault losses or a widening gap between token emissions and fee-funded burns would weaken the call.',
      [
        claim('Perpetual notional, open interest and spot volume should be monitored as separate demand signals.', ['source:hyperliquid:api', 'source:hyperliquid:api-docs', 'source:hyperliquid:spot-api'], 'Current separately scoped market series.'),
        claim('Fee-funded burns should be compared with token releases and incentives rather than read in isolation.', ['source:hyperliquid:fees', 'source:hyperliquid:sec-filing'], 'Current burn mechanism and disclosed allocations.', { kind: 'inference', confidence: 'high' }),
        claim('Repeated emergency interventions or shared-vault losses would weaken the established-success call.', ['source:hyperliquid:jelly'], 'The 2025 event defines a measurable governance and risk-control watch signal.', { kind: 'inference', confidence: 'high' }),
      ],
    ),
  },
  metrics: [
    metric('perp-notional-24h', 'derivatives_notional', 'Perpetual notional volume, 24h', 3070990826, ['source:hyperliquid:api'], 'Sum of dayNtlVlm across metaAndAssetCtxs perpetual rows.', { window: 'protocol-reported rolling 24 hours', qualityFlags: ['notional_not_revenue', 'not_unique_users'] }),
    metric('perp-open-interest', 'derivatives_notional', 'Perpetual open interest', 6900854751, ['source:hyperliquid:api'], 'Sum of openInterest multiplied by markPx across perpetual rows.', { qualityFlags: ['open_interest_not_customer_assets', 'mark_price_sensitive'] }),
    metric('spot-notional-24h', 'spot_volume', 'Spot notional volume, 24h', 69679924, ['source:hyperliquid:api'], 'Sum of dayNtlVlm across spotMetaAndAssetCtxs rows.', { window: 'protocol-reported rolling 24 hours', qualityFlags: ['not_unique_users', 'separate_from_perpetuals'] }),
    metric('fees-30d', 'fees', 'Protocol fees, 30d', 49423726, ['source:hyperliquid:fees-api'], 'DefiLlama total30d from the Hyperliquid dailyFees adapter.', { window: 'provider-reported rolling 30 days', qualityFlags: ['fees_not_profit'] }),
    metric('revenue-30d', 'protocol_revenue', 'Protocol revenue, 30d', 34496631, ['source:hyperliquid:revenue-api'], 'DefiLlama total30d from the Hyperliquid dailyRevenue adapter.', { window: 'provider-reported rolling 30 days', qualityFlags: ['adapter_definition', 'not_audited_profit'] }),
  ],
  events: [
    event('hype-genesis', 'token_launch', '2024-11-29', 'HYPE launched through the Genesis distribution on 2024-11-29.', ['source:hyperliquid:sec-filing'], 'Filed launch description.'),
    event('jelly-intervention', 'market_intervention', '2025-03-26', 'Validators delisted JELLY and forcibly settled positions during a shared-vault squeeze.', ['source:hyperliquid:jelly'], 'Independent dated report.'),
  ],
  feature: {
    lifecycle: 'successful',
    operating_model: 'Onchain perpetual and spot central-limit order books inside HyperCore.',
    product_cohort: 'perpetual_and_spot_orderbook',
    custody_model: 'non_custodial',
    primary_chain: 'Hyperliquid L1',
    chains: ['Hyperliquid L1'],
    token_status: 'launched',
    token_symbol: 'HYPE',
    token_launch_date: '2024-11-29',
    token_launch_timing: 'post_product',
    token_strategy: 'network_security_costs_fee_discounts_and_fee_funded_burns',
    token_source_url: 'https://www.sec.gov/Archives/edgar/data/2078856/000119312526234992/d50758ds1.htm',
    metric_type: 'perpetual_notional_volume_24h',
    metric_unit: 'usd',
    metric_window: 'rolling_24h',
    metric_as_of: AS_OF,
    metric_observed_at: OBSERVED_AT,
    comparability_key: 'dex|perpetual_orderbook|perpetual_notional_volume_24h|usd|rolling_24h',
  },
};

const raydiumSources = [
  source('raydium', 'overview', 'What is Raydium', 'https://docs.raydium.io/introduction/what-is-raydium', 'Raydium', { locator: 'Current product surfaces, protocol/interface distinction, users and routing relationships.' }),
  source('raydium', 'versions', 'Raydium versions and migration', 'https://docs.raydium.io/protocol-overview/versions-and-migration', 'Raydium', { locator: 'Current and legacy program status across AMM, CPMM, CLMM, farms and LaunchLab.' }),
  source('raydium', 'fees', 'Raydium protocol fees', 'https://docs.raydium.io/ray/protocol-fees', 'Raydium', { locator: 'Current pool-level fee destinations and pool-creation fees.' }),
  source('raydium', 'buybacks', 'RAY buybacks', 'https://docs.raydium.io/ray/ray-buybacks', 'Raydium', { locator: 'Current 12% trading-fee share used for onchain RAY purchases.' }),
  source('raydium', 'launchlab', 'LaunchLab overview', 'https://docs.raydium.io/user-flows/launchlab-overview', 'Raydium', { locator: 'Current bonding-curve, graduation, creator and platform configuration mechanics.' }),
  source('raydium', 'security', 'Raydium audits and historical incidents', 'https://docs.raydium.io/security/audits', 'Raydium', { locator: 'Current audit policy and summaries of the 2022 admin-key incident and 2023 integration freeze.' }),
  source('raydium', 'postmortem', 'Detailed post-mortem and next steps', 'https://raydium.medium.com/detailed-post-mortem-and-next-steps-d6d6dd461c3e', 'Raydium', { publishedAt: '2022-12-17', locator: 'Dated account compromise, affected pools, estimated loss and immediate mitigations.' }),
  source('raydium', 'volume', 'Raydium DEX volume API', 'https://api.llama.fi/summary/dexs/raydium?dataType=dailyVolume', 'DefiLlama', { role: 'independent', locator: 'total24h, total7d, total30d and totalAllTime from the spot-volume adapter.' }),
  source('raydium', 'tvl', 'Raydium protocol TVL API', 'https://api.llama.fi/protocol/raydium', 'DefiLlama', { role: 'independent', locator: 'Latest and maximum totalLiquidityUSD observations in the returned series.' }),
  source('raydium', 'fees-api', 'Raydium fees API', 'https://api.llama.fi/summary/fees/raydium?dataType=dailyFees', 'DefiLlama', { role: 'independent', locator: 'total30d from the current dailyFees adapter.' }),
  source('raydium', 'revenue-api', 'Raydium protocol revenue API', 'https://api.llama.fi/summary/fees/raydium?dataType=dailyRevenue', 'DefiLlama', { role: 'independent', locator: 'total30d from the current dailyRevenue adapter.' }),
];

const raydium = {
  slug: 'raydium',
  name: 'Raydium',
  aliases: [],
  table: 'successful_exchanges',
  operatingState: 'operating',
  outcome: 'successful_cyclical',
  outcomeConfidence: 'high',
  qualityConfidence: 'high',
  classification: {
    subtype: 'Solana spot AMM and token-launch liquidity suite',
    tags: ['spot_amm', 'concentrated_liquidity', 'token_launches', 'single_chain'],
    chains: ['Solana'],
    jurisdictions: [],
  },
  sources: raydiumSources,
  statusSources: ['source:raydium:overview', 'source:raydium:volume', 'source:raydium:tvl'],
  statusLocator: 'Current operator documentation and live independent volume and TVL observations.',
  outcomeSources: ['source:raydium:volume', 'source:raydium:tvl', 'source:raydium:fees-api', 'source:raydium:overview', 'source:raydium:security'],
  outcomeLocator: 'Current scale, durable Solana integrations, fee production and incident history support a successful but cyclical call.',
  identityBoundary: 'This profile covers Raydium-native AMM, CLMM, CPMM and LaunchLab programs. Raydium Perps is an interface powered by Orderly Network and is not counted as Raydium-owned derivatives execution.',
  methodologyNotes: [
    'Raydium pool volume may be routed through Jupiter or wallets; it cannot be added to aggregator-routed volume as new economic activity.',
    'The protocol TVL adapter includes staked RAY separately from Solana pool liquidity; this profile uses the latest totalLiquidityUSD series point.',
  ],
  unknowns: [
    'Unique and retained traders after wallet and aggregator deduplication are not public.',
    'LaunchLab cohort survival and post-graduation liquidity retention are not published as a complete dataset.',
    'Complete protocol expenses and net profit after incentives are not public.',
    'The share of volume attributable to organic trading versus short-lived token launches is not established.',
  ],
  unsourcedFields: ['Unique retained traders', 'Launch cohort retention', 'Audited net profit', 'Organic versus launch-driven volume share'],
  sections: {
    what_it_is: section(
      'Raydium is a non-custodial set of Solana programs for spot swaps, liquidity pools and token launches. Its live pool families include the original AMM v4, constant-product CPMM and concentrated-liquidity CLMM, while LaunchLab moves tokens from bonding curves into post-launch pools. The Raydium web app also links to perpetual trading powered by Orderly Network, but that external execution is not counted as Raydium DEX activity in this report.',
      [
        claim('Raydium operates non-custodial AMM, CPMM, CLMM and LaunchLab programs on Solana.', ['source:raydium:overview', 'source:raydium:versions'], 'Current product and version documentation.'),
        claim('Raydium Perps is an interface surface powered by Orderly Network rather than a Raydium-native derivatives venue.', ['source:raydium:overview'], 'Current operator product boundary.'),
        claim('Wallets and aggregators can route through Raydium pools without the trader visiting raydium.io.', ['source:raydium:overview'], 'Current distribution and integration description.'),
      ],
    ),
    what_happened: section(
      'Raydium launched in 2021 as a Solana AMM that also shared liquidity with an order book. It survived the FTX/Serum break by moving away from the compromised Serum path and now runs its pool curves directly; current docs say the OpenBook integration is deactivated. A December 2022 admin-key compromise drained roughly $4.4 million from eight pools and led to multisig and operating-control changes. Raydium later added concentrated liquidity, a newer CPMM default and LaunchLab. At the current replay it recorded $45.01 million of 24-hour and $2.13 billion of 30-day spot volume with about $815.68 million of TVL.',
      [
        claim('Raydium began in 2021 and its former order-book integration is no longer active.', ['source:raydium:overview', 'source:raydium:versions'], 'Current operator history and version status.'),
        claim('A compromised admin account drained about $4.4 million from eight pools in December 2022.', ['source:raydium:postmortem', 'source:raydium:security'], 'Dated operator postmortem and current incident summary.'),
        claim('Current independent adapters show material spot volume and TVL well below the historical TVL peak.', ['source:raydium:volume', 'source:raydium:tvl'], 'Replayed current and historical provider series.'),
      ],
    ),
    why_this_outcome: section(
      'Raydium became infrastructure, not merely a destination website. Solana wallets, Jupiter and bots can use its pools as execution inventory, giving the protocol distribution wherever Solana trading occurs. Multiple pool designs serve both simple token pairs and capital-efficient markets, while LaunchLab connects primary token issuance to secondary liquidity. That combination explains why Raydium remained important after Serum and after competitors launched. The trade-off is strong dependence on Solana’s token-launch and speculative cycles; present activity does not prove stable recurring demand from the same traders.',
      [
        claim('Aggregator and wallet routing give Raydium distribution beyond its own interface.', ['source:raydium:overview', 'source:raydium:volume'], 'Documented integration pattern and observed pool volume.', { kind: 'inference', confidence: 'high' }),
        claim('Multiple pool designs and LaunchLab connect trading, liquidity provision and token issuance.', ['source:raydium:versions', 'source:raydium:launchlab'], 'Current product mechanics.'),
        claim('Public data does not establish how much current volume is repeat demand versus launch-cycle activity.', ['source:raydium:volume', 'source:raydium:launchlab'], 'Volume series and launch mechanics do not provide deduplicated cohorts.', { kind: 'unknown', confidence: 'high' }),
      ],
    ),
    strategic_choices: section(
      'Raydium chose to remain Solana-native and composable with routers rather than expand its own pools across chains. It kept older AMM v4 pools operating while steering new deployments toward CPMM and CLMM, reducing forced migration but leaving several program generations to maintain. After losing the automatic Pump.fun graduation funnel to PumpSwap, it launched its own configurable issuance stack through LaunchLab. It also directs 12% of pool trading fees to RAY buybacks. These moves protect distribution and token demand, but add version, launch-market and single-chain concentration.',
      [
        claim('Raydium stayed concentrated on Solana and integrated with its routing layer.', ['source:raydium:overview'], 'Current chain and integration description.'),
        claim('Raydium keeps AMM v4 live while recommending CPMM or CLMM for newer use cases.', ['source:raydium:versions'], 'Current migration and version policy.'),
        claim('LaunchLab internalized token issuance and pool graduation as a Raydium product.', ['source:raydium:launchlab'], 'Current LaunchLab workflow.'),
        claim('Twelve percent of pool trading fees funds RAY purchases.', ['source:raydium:buybacks', 'source:raydium:fees'], 'Current fee split and buyback documentation.'),
      ],
    ),
    operating_model: section(
      'Liquidity providers deposit token pairs into AMM pools and earn their share of swap fees while bearing inventory, price and smart-contract risk. CPMM uses full-range constant-product liquidity; CLMM lets providers concentrate liquidity in selected price ranges; older AMM v4 pools remain operational. Routers choose among these pools, and LaunchLab graduates bonding-curve assets into a post-launch pool. Fee rates and destinations vary by program and configuration, so one blended percentage would be misleading.',
      [
        claim('Raydium pool families use different liquidity and fee mechanics.', ['source:raydium:versions', 'source:raydium:fees'], 'Current program status and fee schedules.'),
        claim('Liquidity providers supply inventory and receive pool-specific fee shares.', ['source:raydium:fees'], 'Current swap-fee destinations.'),
        claim('LaunchLab can graduate bonding-curve liquidity into Raydium CPMM pools.', ['source:raydium:launchlab'], 'Current graduation flow.'),
      ],
    ),
    token_and_value_capture: section(
      'RAY launched with the early protocol era and remains the exchange token, but reviewed official pages do not establish an exact launch day. The clearest current value-capture mechanism is the buyback: 12% of trading fees from the documented pool families purchases RAY into a public protocol-controlled address. CPMM and CLMM also route a treasury share while most fees stay with liquidity providers. Buybacks create demand, but bought tokens held by the protocol are not automatically burned, and gross fee allocation is not the same as earnings available to a token holder.',
      [
        claim('RAY was already part of the protocol during its 2021 launch era, but the reviewed sources do not establish an exact token-launch day.', ['source:raydium:overview', 'source:raydium:buybacks'], 'Current history and token mechanism with date limitation.', { kind: 'unknown', confidence: 'high' }),
        claim('Twelve percent of documented pool trading fees is used to buy RAY.', ['source:raydium:buybacks', 'source:raydium:fees'], 'Current fee split.'),
        claim('Protocol-held buybacks do not by themselves prove a holder cash-flow right or net deflation.', ['source:raydium:buybacks', 'source:raydium:fees-api', 'source:raydium:revenue-api'], 'Mechanism read against scoped fee and revenue observations.', { kind: 'inference', confidence: 'high' }),
      ],
    ),
    counterfactual: section(
      'A multi-chain deployment strategy could have reduced Solana dependence, but it also would have fragmented engineering attention and liquidity away from the ecosystem where Raydium had distribution. Faster removal of single-key administrative control before December 2022 could plausibly have prevented or limited the pool drain. A cleaner forced migration from old programs might reduce maintenance burden, yet it could strand liquidity and integrations. Public evidence cannot quantify those adoption and security trade-offs.',
      [
        claim('Multi-chain expansion would trade Solana focus for lower chain concentration and more fragmented liquidity.', ['source:raydium:overview', 'source:raydium:versions'], 'Current single-chain product architecture used to bound the alternative.', { kind: 'inference', confidence: 'medium' }),
        claim('Earlier multisig controls could plausibly have reduced the December 2022 admin-key loss.', ['source:raydium:postmortem', 'source:raydium:security'], 'The incident root cause and later mitigation support the direction.', { kind: 'inference', confidence: 'high' }),
        claim('The adoption cost of forcing old pools to migrate is not published.', ['source:raydium:versions'], 'Current coexistence policy explains the trade-off but provides no counterfactual estimate.', { kind: 'unknown', confidence: 'high' }),
      ],
    ),
    risks_and_unknowns: section(
      'Raydium is exposed to Solana outages and market cycles, smart-contract and authority risk, fragmented liquidity across pool versions, adverse token launches and fast-moving AMM competition. LaunchLab brings distribution but also places low-quality token issuance next to the exchange brand. The 2022 loss shows that correct program code is not enough when keys and operations fail. Unique traders, launch retention, net profit and the share of volume driven by temporary speculation remain unknown.',
      [
        claim('Single-chain dependence and several live program generations are material operating risks.', ['source:raydium:overview', 'source:raydium:versions'], 'Current chain and version architecture.', { kind: 'inference', confidence: 'high' }),
        claim('The 2022 incident was an operational key-control failure rather than a pool-math bug.', ['source:raydium:postmortem', 'source:raydium:security'], 'Operator root-cause description.'),
        claim('Trader retention, launch survival and audited net profit remain unknown.', ['source:raydium:volume', 'source:raydium:launchlab', 'source:raydium:revenue-api'], 'Reviewed sources do not publish those fields.', { kind: 'unknown', confidence: 'high' }),
      ],
    ),
    lifecycle: section(
      'Raydium’s first phase was an AMM tied to Serum’s order book. The FTX collapse forced Solana liquidity to move to community-controlled alternatives, and Raydium eventually deactivated the order-book integration. The December 2022 admin-key exploit was the major security break, followed by stronger authority controls. CPMM, CLMM and LaunchLab then widened the product. Current activity is far below January 2025’s TVL high but remains substantial, so this is a durable success with pronounced cycle exposure, not a dying venue.',
      [
        claim('Raydium outlived its original Serum-linked architecture and now routes current swaps through AMM curves.', ['source:raydium:overview', 'source:raydium:versions'], 'Current product history and version status.'),
        claim('The 2022 exploit led to authority and operational-control changes.', ['source:raydium:postmortem', 'source:raydium:security'], 'Dated incident response and current controls summary.'),
        claim('Current TVL is about 72.5% below the adapter peak while the venue still produces material volume.', ['source:raydium:tvl', 'source:raydium:volume'], 'Historical maximum and current observations from independent adapters.'),
      ],
    ),
    outlook_and_watch: section(
      'The most useful watch is whether Raydium remains essential after each launch cycle cools. Track 30-day spot volume, TVL, fee revenue, RAY purchased, pool-version concentration and the share of launches that keep liquidity after graduation. Continued router usage and fee production would support the base case. A sustained migration of wallet flow and token graduations to competing venues, or another authority incident, would weaken the success call even if short-lived volume spikes continue.',
      [
        claim('Volume, TVL, fees and buybacks should be tracked separately to test durable economics.', ['source:raydium:volume', 'source:raydium:tvl', 'source:raydium:fees-api', 'source:raydium:buybacks'], 'Current independent series and token mechanism.'),
        claim('Post-graduation liquidity retention is a better LaunchLab health signal than launch-day turnover alone.', ['source:raydium:launchlab'], 'Current launch and graduation mechanics.', { kind: 'inference', confidence: 'high' }),
        claim('Loss of router flow or another authority incident would weaken Raydium’s infrastructure advantage.', ['source:raydium:overview', 'source:raydium:security'], 'Documented distribution moat and incident history.', { kind: 'inference', confidence: 'high' }),
      ],
    ),
  },
  metrics: [
    metric('spot-volume-24h', 'spot_volume', 'Spot volume, 24h', 45008368, ['source:raydium:volume'], 'DefiLlama total24h from the Raydium dailyVolume adapter.', { window: 'provider-reported rolling 24 hours', qualityFlags: ['routed_flow_possible', 'not_unique_users'] }),
    metric('spot-volume-30d', 'spot_volume', 'Spot volume, 30d', 2132161158, ['source:raydium:volume'], 'DefiLlama total30d from the Raydium dailyVolume adapter.', { window: 'provider-reported rolling 30 days', qualityFlags: ['routed_flow_possible', 'not_unique_users'] }),
    metric('tvl-latest', 'tvl', 'Protocol TVL', 815678078, ['source:raydium:tvl'], 'Latest totalLiquidityUSD in the Raydium protocol response.', { qualityFlags: ['tvl_not_market_depth', 'staked_token_scope_separate'] }),
    metric('fees-30d', 'fees', 'Protocol fees, 30d', 3025592, ['source:raydium:fees-api'], 'DefiLlama total30d from the Raydium dailyFees adapter.', { window: 'provider-reported rolling 30 days', qualityFlags: ['fees_not_profit'] }),
    metric('revenue-30d', 'protocol_revenue', 'Protocol revenue, 30d', 463295, ['source:raydium:revenue-api'], 'DefiLlama total30d from the Raydium dailyRevenue adapter.', { window: 'provider-reported rolling 30 days', qualityFlags: ['adapter_definition', 'not_audited_profit'] }),
  ],
  events: [
    event('admin-key-exploit', 'exploit', '2022-12-16', 'A compromised Raydium admin account drained about $4.4 million from eight pools.', ['source:raydium:postmortem', 'source:raydium:security'], 'Operator incident timeline and current incident summary.'),
  ],
  feature: {
    lifecycle: 'successful',
    operating_model: 'Solana-native AMM, CPMM, CLMM and token-launch liquidity programs.',
    product_cohort: 'single_chain_spot_amm_suite',
    custody_model: 'non_custodial',
    primary_chain: 'Solana',
    chains: ['Solana'],
    token_status: 'launched',
    token_symbol: 'RAY',
    token_launch_date: null,
    token_launch_timing: 'at_or_near_launch',
    token_strategy: 'liquidity_incentives_and_fee_funded_protocol_buybacks',
    token_source_url: 'https://docs.raydium.io/ray/ray-buybacks',
    metric_type: 'spot_volume_24h',
    metric_unit: 'usd',
    metric_window: 'rolling_24h',
    metric_as_of: AS_OF,
    metric_observed_at: OBSERVED_AT,
    comparability_key: 'dex|spot_amm|spot_volume_24h|usd|rolling_24h',
  },
};

const osmosisSources = [
  source('osmosis', 'docs', 'Osmosis documentation', 'https://docs.osmosis.zone/', 'Osmosis', { locator: 'Current cross-chain DEX, appchain and feature overview.' }),
  source('osmosis', 'tokenomics', 'Osmosis tokenomics into 2025', 'https://forum.osmosis.zone/t/osmosis-tokenomics-into-2025/3352', 'Osmosis Community Hall', { publishedAt: '2025-01-10', locator: 'Community-published summary of emissions, taker fees, burns and revenue mechanisms.' }),
  source('osmosis', 'roadmap', 'Osmosis tokenomics roadmap', 'https://forum.osmosis.zone/t/tokenomics-roadmap/3775', 'Osmosis Community Hall', { publishedAt: '2025-06-30', locator: 'Dated plan and status for emission reductions, fee burns, auctions and revenue-based security.' }),
  source('osmosis', 'staking-cut', 'Reduce staking subsidy below taker-fee burn rate', 'https://forum.osmosis.zone/t/reduce-staking-subsidy-to-below-taker-fee-burn-rate/3835', 'Osmosis Community Hall', { publishedAt: '2025-08-14', locator: 'Proposal rationale for lowering inflation below sustained fee burns.' }),
  source('osmosis', 'burn', 'Prioritize burn over accumulation from taker fees', 'https://forum.osmosis.zone/t/prioritize-burn-over-accumulation-from-taker-fees/3777', 'Osmosis Community Hall', { publishedAt: '2025-07-07', locator: 'Proposal to increase the OSMO taker-fee burn allocation.' }),
  source('osmosis', 'exploit', 'Osmosis DEX exploited as validators halt the network', 'https://www.theblock.co/post/150752/osmosis-dex-on-cosmos-exploited-for-5-million-as-validators-halt-the-network', 'The Block', { publishedAt: '2022-06-08', role: 'independent', locator: 'Independent dated report of the v9 liquidity bug, estimated loss and chain halt.', directHttpStatus: 403, accessMethod: 'indexed_browser_snapshot' }),
  source('osmosis', 'exploit-response', 'Osmosis exploit fix recap', 'https://medium.com/osmosis-community-updates/osmosis-updates-from-the-lab-recap-osmocon-and-exploit-fix-june-15-2022-fc22355e4b0d', 'Osmosis Community Updates', { publishedAt: '2022-06-22', locator: 'Community recap of root cause, recovery, coverage and testing changes.', directHttpStatus: 403, accessMethod: 'indexed_browser_snapshot' }),
  source('osmosis', 'volume', 'Osmosis DEX volume API', 'https://api.llama.fi/summary/dexs/osmosis-dex?dataType=dailyVolume', 'DefiLlama', { role: 'independent', locator: 'total24h, total7d, total30d and totalAllTime from the spot-volume adapter.' }),
  source('osmosis', 'tvl', 'Osmosis DEX TVL API', 'https://api.llama.fi/protocol/osmosis-dex', 'DefiLlama', { role: 'independent', locator: 'Latest and maximum totalLiquidityUSD observations in the returned series.' }),
  source('osmosis', 'fees-api', 'Osmosis DEX fees API', 'https://api.llama.fi/summary/fees/osmosis-dex?dataType=dailyFees', 'DefiLlama', { role: 'independent', locator: 'total30d from the current dailyFees adapter.' }),
  source('osmosis', 'revenue-api', 'Osmosis DEX protocol revenue API', 'https://api.llama.fi/summary/fees/osmosis-dex?dataType=dailyRevenue', 'DefiLlama', { role: 'independent', locator: 'total30d from the current dailyRevenue adapter.' }),
];

const osmosis = {
  slug: 'osmosis',
  name: 'Osmosis DEX',
  aliases: ['Osmosis'],
  table: 'mid_exchanges',
  operatingState: 'operating',
  outcome: 'operating_middling',
  outcomeConfidence: 'high',
  qualityConfidence: 'high',
  classification: {
    subtype: 'sovereign cross-chain appchain DEX',
    tags: ['spot_amm', 'appchain', 'ibc', 'concentrated_liquidity', 'governance'],
    chains: ['Osmosis', 'Cosmos IBC'],
    jurisdictions: [],
  },
  sources: osmosisSources,
  statusSources: ['source:osmosis:docs', 'source:osmosis:volume', 'source:osmosis:tvl'],
  statusLocator: 'Current operator documentation and live independent activity and liquidity observations.',
  outcomeSources: ['source:osmosis:volume', 'source:osmosis:tvl', 'source:osmosis:fees-api', 'source:osmosis:roadmap', 'source:osmosis:docs'],
  outcomeLocator: 'Current operation and protocol relevance are weighed against a 99.35% TVL drawdown and small fee base.',
  identityBoundary: 'This profile covers the Osmosis exchange and its exchange-specific appchain economics. It does not assign activity from every Cosmos SDK or IBC chain to Osmosis.',
  methodologyNotes: [
    'Osmosis controls its own chain execution, so DEX product risk and validator-liveness risk are more tightly coupled than for a contract-only AMM.',
    'Governance forum posts document proposals and implementation status; a proposed mechanism is not treated as completed unless the source says it passed or shipped.',
  ],
  unknowns: [
    'The share of current liquidity supported by incentives, protocol-owned positions or independent market makers is not public.',
    'Unique and retained traders across IBC addresses are not available in the reviewed sources.',
    'Validator economics after future subsidy reductions are not yet observable over a full market cycle.',
    'The amount of Cosmos-wide activity that can return to Osmosis is not knowable from protocol design alone.',
  ],
  unsourcedFields: ['Unique retained traders', 'Liquidity by subsidy source', 'Full-cycle post-emission validator economics', 'Audited operating profit'],
  sections: {
    what_it_is: section(
      'Osmosis is both a decentralized spot exchange and the sovereign Cosmos SDK chain that runs it. Users trade assets connected through IBC and related bridges, while liquidity providers use classic and concentrated pools. The appchain controls execution, fees, governance and validator security instead of renting those functions from another L1. That gives Osmosis unusual product control, but it also means exchange economics must help support an entire blockchain.',
      [
        claim('Osmosis is a cross-chain DEX and DeFi hub running on its own appchain.', ['source:osmosis:docs'], 'Current operator overview.'),
        claim('The venue supports IBC-connected assets and concentrated-liquidity features.', ['source:osmosis:docs'], 'Current feature and integration documentation.'),
        claim('Exchange operation and validator security are economically coupled because Osmosis controls its own chain.', ['source:osmosis:docs', 'source:osmosis:roadmap'], 'Current appchain design and tokenomics roadmap.', { kind: 'inference', confidence: 'high' }),
      ],
    ),
    what_happened: section(
      'Osmosis launched in 2021 and grew into the main liquidity hub for the early IBC economy. Its TVL peaked around $1.83 billion on 2022-03-03. A June 2022 software bug let users receive excess pool shares; validators halted the chain and an estimated $5 million was taken before recoveries and foundation coverage. The broader crypto and Cosmos contraction then removed most of the capital base. By 2026-08-03 the adapter showed about $11.93 million of TVL, $696,752 of 24-hour volume and $45.16 million over 30 days.',
      [
        claim('Osmosis TVL peaked near $1.83 billion on 2022-03-03 and later fell by about 99.35%.', ['source:osmosis:tvl'], 'Maximum and latest totalLiquidityUSD observations in the replayed series.'),
        claim('A June 2022 pool-share bug caused an estimated $5 million exploit and a validator halt.', ['source:osmosis:exploit', 'source:osmosis:exploit-response'], 'Independent incident report and community recovery recap.'),
        claim('Current adapters show continued operation at a much smaller economic scale.', ['source:osmosis:volume', 'source:osmosis:tvl', 'source:osmosis:fees-api'], 'Current volume, TVL and fee observations.'),
      ],
    ),
    why_this_outcome: section(
      'Osmosis succeeded technically by specializing in interchain liquidity and by controlling the whole exchange stack. Early OSMO emissions paid users and validators to build that market. The same strategy became expensive when token prices, IBC flows and Cosmos risk appetite contracted: subsidies could attract capital, but they could not create lasting external demand. Governance has since cut recurring incentives and shifted toward taker-fee burns and revenue-based security. The venue remains useful, yet its smaller volume and fees have not restored the economic scale reached during the incentive-heavy cycle.',
      [
        claim('Appchain control and IBC specialization helped Osmosis become an early interchain liquidity hub.', ['source:osmosis:docs', 'source:osmosis:tokenomics'], 'Product design and early economic mechanism.', { kind: 'inference', confidence: 'medium' }),
        claim('Broad token incentives bootstrapped liquidity but exposed the system to subsidy dependence.', ['source:osmosis:tokenomics', 'source:osmosis:roadmap', 'source:osmosis:tvl'], 'Documented emissions redesign read with the observed capital contraction.', { kind: 'inference', confidence: 'high' }),
        claim('Public evidence cannot separate the effects of Cosmos demand loss, token prices, security events and Osmosis-specific execution.', ['source:osmosis:tvl', 'source:osmosis:volume', 'source:osmosis:exploit'], 'Observed outcomes do not identify one causal coefficient.', { kind: 'unknown', confidence: 'high' }),
      ],
    ),
    strategic_choices: section(
      'Osmosis chose a sovereign appchain rather than contracts on a larger settlement network. It used OSMO inflation for liquidity and staking, introduced concentrated liquidity, fee abstraction and protocol-owned arbitrage, and later added a taker fee. After incentives proved costly, governance moved to reduce recurring liquidity rewards and staking subsidies, increase the portion of fee-bought OSMO that is burned and lean on real revenue. These changes reduce dilution, but they also test whether liquidity and validator participation stay healthy without the original subsidy.',
      [
        claim('Osmosis chose sovereign appchain control over a contract-only deployment.', ['source:osmosis:docs'], 'Current architecture.'),
        claim('OSMO emissions were used to bootstrap staking and liquidity.', ['source:osmosis:tokenomics', 'source:osmosis:roadmap'], 'Tokenomics history and redesign rationale.'),
        claim('Governance has pursued lower subsidies and greater taker-fee burns.', ['source:osmosis:roadmap', 'source:osmosis:staking-cut', 'source:osmosis:burn'], 'Dated roadmap and proposal discussions.'),
        claim('Lower subsidy creates a measurable risk to liquidity and validator participation if organic revenue is insufficient.', ['source:osmosis:staking-cut', 'source:osmosis:fees-api', 'source:osmosis:revenue-api'], 'Policy trade-off read against current fee scale.', { kind: 'inference', confidence: 'medium' }),
      ],
    ),
    operating_model: section(
      'Osmosis validators order swaps and secure the appchain. Liquidity providers deposit assets into pools and earn swap fees; concentrated positions require active range management. The protocol collects taker fees in the incoming asset, converts part of non-OSMO revenue, and allocates OSMO between stakers and burns according to governance parameters. ProtoRev and block auctions seek additional value from arbitrage and transaction ordering. These revenue streams are different and may change through governance, so the profile does not treat one current split as permanent.',
      [
        claim('Validators secure the same chain that executes the Osmosis exchange.', ['source:osmosis:docs'], 'Current appchain architecture.'),
        claim('Taker fees collect multiple assets and can be converted into OSMO for distribution and burn.', ['source:osmosis:roadmap', 'source:osmosis:burn'], 'Current tokenomics roadmap and burn proposal.'),
        claim('ProtoRev and block auctions are additional protocol-revenue mechanisms.', ['source:osmosis:roadmap'], 'Current roadmap descriptions.'),
      ],
    ),
    token_and_value_capture: section(
      'OSMO launched with the network in June 2021; the reviewed material establishes the month but not an exact day, so no day is asserted. OSMO governs the chain, secures validators and has funded liquidity incentives. Taker fees now create a clearer link between exchange use and token demand through conversions, staking distributions and burns. Governance is trying to push burns above remaining emissions. That improves the design, but current 30-day revenue was only $27,762 in the replay and does not prove that fees can support security through a prolonged downturn.',
      [
        claim('OSMO governs and secures the Osmosis appchain and historically funded liquidity incentives.', ['source:osmosis:docs', 'source:osmosis:tokenomics'], 'Current token overview and tokenomics history.'),
        claim('Taker-fee conversions and burns connect exchange use to OSMO demand.', ['source:osmosis:roadmap', 'source:osmosis:burn'], 'Current revenue and burn mechanisms.'),
        claim('Current revenue is too short and small a sample to prove self-sufficient long-run chain security.', ['source:osmosis:revenue-api', 'source:osmosis:staking-cut'], 'Current 30-day adapter value and subsidy-reduction thesis.', { kind: 'inference', confidence: 'high' }),
      ],
    ),
    counterfactual: section(
      'Earlier reduction of broad emissions and faster concentration on fee-producing markets might have preserved more treasury value and reduced mercenary liquidity. Deploying only as contracts on another chain could have lowered validator-security cost, but Osmosis would have lost execution control and much of its appchain differentiation. More testing before the June 2022 upgrade would likely have prevented that specific pool-share bug. None of these alternatives guarantees that Cosmos-wide liquidity would have remained after the 2022 market contraction.',
      [
        claim('Earlier emission reductions could plausibly have reduced dilution and mercenary-liquidity dependence.', ['source:osmosis:tokenomics', 'source:osmosis:roadmap'], 'Later redesign rationale used to bound the alternative.', { kind: 'inference', confidence: 'medium' }),
        claim('Longer pre-upgrade testing could likely have prevented or detected the June 2022 pool-share bug.', ['source:osmosis:exploit-response'], 'Community response identified rushed testing and added stronger QA.', { kind: 'inference', confidence: 'high' }),
        claim('No protocol design alone could guarantee retention of Cosmos-wide demand.', ['source:osmosis:tvl', 'source:osmosis:volume'], 'Historical contraction and current scale do not resolve the ecosystem counterfactual.', { kind: 'unknown', confidence: 'high' }),
      ],
    ),
    risks_and_unknowns: section(
      'Osmosis faces low current economic scale, dependence on IBC asset demand, validator-security cost, governance execution, bridge and interchain risk, and smart-contract or chain-upgrade failure. Concentrated liquidity adds active-management and impermanent-loss risk for providers. The current tokenomics transition may reduce dilution but could also reduce staking or liquidity if fee income is inadequate. Public data does not disclose retained traders, the subsidy mix of liquidity, complete operating expenses or validator profitability.',
      [
        claim('Appchain security cost and interchain demand are material to the exchange outcome.', ['source:osmosis:docs', 'source:osmosis:roadmap'], 'Current architecture and sustainability roadmap.', { kind: 'inference', confidence: 'high' }),
        claim('The June 2022 exploit demonstrates chain-upgrade and liquidity-accounting risk.', ['source:osmosis:exploit', 'source:osmosis:exploit-response'], 'Dated incident evidence.'),
        claim('Retained traders, liquidity subsidy composition and validator profitability remain unknown.', ['source:osmosis:volume', 'source:osmosis:fees-api', 'source:osmosis:staking-cut'], 'Reviewed sources do not publish these fields.', { kind: 'unknown', confidence: 'high' }),
      ],
    ),
    lifecycle: section(
      'Osmosis moved from a 2021 launch to a rapid IBC liquidity boom, a March 2022 TVL peak and a June 2022 exploit-and-halt. Capital then contracted with the wider Cosmos and crypto cycle. The next phase has been economic repair: concentrated liquidity, taker fees, auction revenue, fewer recurring incentives and lower staking subsidies. The DEX is still operating and strategically important to IBC, but the 99.35% TVL drawdown and modest fee base make “middling” more accurate than either successful at scale or dead.',
      [
        claim('Osmosis reached a March 2022 TVL peak before the June 2022 exploit and wider contraction.', ['source:osmosis:tvl', 'source:osmosis:exploit'], 'Dated historical series and incident report.'),
        claim('The current phase emphasizes fee revenue and lower emissions.', ['source:osmosis:roadmap', 'source:osmosis:staking-cut', 'source:osmosis:burn'], 'Dated economic redesign.'),
        claim('Continued operation with sharply lower capital supports a middling lifecycle classification.', ['source:osmosis:docs', 'source:osmosis:tvl', 'source:osmosis:volume'], 'Current operation and scale.', { kind: 'inference', confidence: 'high' }),
      ],
    ),
    outlook_and_watch: section(
      'The base case is continued operation as a smaller interchain liquidity hub. Watch TVL and volume without renewed broad subsidies, taker-fee revenue, daily OSMO burns versus emissions, the staked share, validator concentration and IBC transfer activity. Rising fee-funded demand with stable security would support recovery. Falling stake or liquidity after subsidy cuts, governance reversals, or further loss of IBC activity would show that the appchain’s technical control is not producing sustainable economics.',
      [
        claim('TVL, spot volume and fee revenue should rise without renewed broad subsidies to support recovery.', ['source:osmosis:volume', 'source:osmosis:tvl', 'source:osmosis:fees-api', 'source:osmosis:roadmap'], 'Current observations and sustainability target.', { kind: 'inference', confidence: 'high' }),
        claim('OSMO burns should be compared with actual emissions and staking participation.', ['source:osmosis:roadmap', 'source:osmosis:staking-cut', 'source:osmosis:burn'], 'Current policy goals and trade-offs.'),
        claim('Post-cut validator and liquidity behavior remains a future observation, not a settled conclusion.', ['source:osmosis:staking-cut', 'source:osmosis:tvl'], 'The reviewed evidence has not covered a full future market cycle.', { kind: 'unknown', confidence: 'high' }),
      ],
    ),
  },
  metrics: [
    metric('spot-volume-24h', 'spot_volume', 'Spot volume, 24h', 696752, ['source:osmosis:volume'], 'DefiLlama total24h from the Osmosis DEX dailyVolume adapter.', { window: 'provider-reported rolling 24 hours', qualityFlags: ['not_unique_users'] }),
    metric('spot-volume-30d', 'spot_volume', 'Spot volume, 30d', 45163607, ['source:osmosis:volume'], 'DefiLlama total30d from the Osmosis DEX dailyVolume adapter.', { window: 'provider-reported rolling 30 days', qualityFlags: ['not_unique_users'] }),
    metric('tvl-latest', 'tvl', 'Protocol TVL', 11928437, ['source:osmosis:tvl'], 'Latest totalLiquidityUSD in the Osmosis DEX protocol response.', { qualityFlags: ['tvl_not_market_depth'] }),
    metric('tvl-peak', 'tvl', 'Historical peak TVL', 1831730122, ['source:osmosis:tvl'], 'Maximum totalLiquidityUSD in the Osmosis DEX protocol response, dated 2022-03-03.', { asOf: '2022-03-03', window: 'historical maximum in provider series', qualityFlags: ['historical_not_current'] }),
    metric('fees-30d', 'fees', 'Protocol fees, 30d', 72412, ['source:osmosis:fees-api'], 'DefiLlama total30d from the Osmosis DEX dailyFees adapter.', { window: 'provider-reported rolling 30 days', qualityFlags: ['fees_not_profit'] }),
    metric('revenue-30d', 'protocol_revenue', 'Protocol revenue, 30d', 27762, ['source:osmosis:revenue-api'], 'DefiLlama total30d from the Osmosis DEX dailyRevenue adapter.', { window: 'provider-reported rolling 30 days', qualityFlags: ['adapter_definition', 'not_audited_profit'] }),
  ],
  events: [
    event('pool-share-exploit', 'exploit', '2022-06-08', 'A pool-share calculation bug led to an estimated $5 million exploit and an emergency chain halt.', ['source:osmosis:exploit', 'source:osmosis:exploit-response'], 'Independent incident report and community recovery recap.'),
  ],
  feature: {
    lifecycle: 'mid',
    operating_model: 'Sovereign appchain DEX for IBC-connected spot markets and concentrated liquidity.',
    product_cohort: 'sovereign_appchain_spot_amm',
    custody_model: 'non_custodial',
    primary_chain: 'Osmosis',
    chains: ['Osmosis', 'Cosmos IBC'],
    token_status: 'launched',
    token_symbol: 'OSMO',
    token_launch_date: null,
    token_launch_timing: 'at_or_near_launch',
    token_strategy: 'governance_security_liquidity_incentives_and_fee_burns',
    token_source_url: 'https://forum.osmosis.zone/t/tokenomics-roadmap/3775',
    metric_type: 'spot_volume_24h',
    metric_unit: 'usd',
    metric_window: 'rolling_24h',
    metric_as_of: AS_OF,
    metric_observed_at: OBSERVED_AT,
    comparability_key: 'dex|sovereign_appchain_spot_amm|spot_volume_24h|usd|rolling_24h',
  },
};

const kyberswapSources = [
  source('kyberswap', 'overview', 'Introduction to KyberSwap', 'https://docs.kyberswap.com/', 'KyberSwap', { locator: 'Current aggregator, limit-order, cross-chain and developer product surfaces.' }),
  source('kyberswap', 'aggregator', 'KyberSwap Aggregator', 'https://docs.kyberswap.com/kyberswap-solutions/kyberswap-aggregator', 'KyberSwap', { locator: 'Current same-chain routing, split-route and developer integration mechanics.' }),
  source('kyberswap', 'networks', 'Supported exchanges and networks', 'https://docs.kyberswap.com/getting-started/supported-exchanges-and-networks', 'KyberSwap', { locator: 'Current supported chain and liquidity-source counts.' }),
  source('kyberswap', 'dao', 'KyberDAO rewards FAQ', 'https://docs.kyberswap.com/governance/kyberdao/faq', 'KyberSwap', { locator: 'Current KNC staking, governance and fee-reward description.' }),
  source('kyberswap', 'postmortem', 'KyberSwap Elastic exploit post-mortem', 'https://blog.kyberswap.com/post-mortem-kyberswap-elastic-exploit/', 'KyberSwap', { publishedAt: '2024-02-07', locator: 'Affected users, affected assets, root cause, recoveries and Treasury Grant update.' }),
  source('kyberswap', 'grant', 'KyberSwap Treasury Grant Program', 'https://blog.kyberswap.com/kyberswap-treasury-grant-program/', 'KyberSwap', { publishedAt: '2023-12-20', locator: 'Grant eligibility, reference amounts, application choices and timing.' }),
  source('kyberswap', 'blocksec', 'In-depth analysis of the KyberSwap incident', 'https://blocksec.com/blog/yet-another-tragedy-of-precision-loss-an-in-depth-analysis-of-the-kyber-swap-incident-1', 'BlockSec', { publishedAt: '2023-12-05', tier: 'A', role: 'independent', locator: 'Independent technical analysis of rounding direction, reinvestment and exploit mechanics.' }),
  source('kyberswap', 'aggregator-volume', 'KyberSwap routed-volume API', 'https://api.llama.fi/summary/aggregators/kyberswap?dataType=dailyVolume', 'DefiLlama', { role: 'independent', locator: 'total24h, total7d, total30d and totalAllTime from the aggregator adapter.' }),
  source('kyberswap', 'pool-volume', 'KyberSwap pool-volume API', 'https://api.llama.fi/summary/dexs/kyberswap?dataType=dailyVolume', 'DefiLlama', { role: 'independent', locator: 'Current null short-window values and historical total from the owned-pool adapter.' }),
  source('kyberswap', 'tvl', 'KyberSwap protocol TVL API', 'https://api.llama.fi/protocol/kyberswap', 'DefiLlama', { role: 'independent', locator: 'Latest and maximum totalLiquidityUSD observations in the returned series.' }),
];

const kyberswap = {
  slug: 'kyberswap',
  name: 'KyberSwap',
  aliases: ['KyberSwap Aggregator', 'KyberSwap Elastic (retired pools)'],
  table: 'dead_exchanges',
  operatingState: 'operating',
  outcome: 'operating_impaired_after_exploit',
  outcomeConfidence: 'high',
  qualityConfidence: 'high',
  classification: {
    subtype: 'multi-chain liquidity aggregator with legacy AMM pools',
    tags: ['aggregator', 'multi_chain', 'routing', 'legacy_amm', 'post_exploit'],
    chains: ['Ethereum', 'Arbitrum', 'Base', 'BNB Chain', 'Polygon', 'Avalanche', 'Optimism', 'Linea', 'Scroll', 'zkSync Era', 'additional EVM networks'],
    jurisdictions: [],
  },
  sources: kyberswapSources,
  statusSources: ['source:kyberswap:overview', 'source:kyberswap:aggregator', 'source:kyberswap:aggregator-volume'],
  statusLocator: 'Current product documentation and live routed-volume observations establish that the aggregator operates.',
  outcomeSources: ['source:kyberswap:postmortem', 'source:kyberswap:blocksec', 'source:kyberswap:aggregator-volume', 'source:kyberswap:tvl', 'source:kyberswap:pool-volume'],
  outcomeLocator: 'The active aggregator is weighed against the retired/impaired Elastic pool product, 2023 loss and minimal current owned liquidity.',
  identityBoundary: 'The legacy dead-exchange row was named KyberSwap Elastic. The canonical profile covers today’s KyberSwap aggregator while preserving Elastic as the exploited and retired pool generation; routed volume is not owned-pool volume.',
  methodologyNotes: [
    'KyberSwap aggregator volume overlaps the DEXs that execute the routes and must not be added to their pool volume.',
    'Treasury grants covering approved applicants are user compensation from KyberSwap resources, not evidence that stolen assets were fully recovered from the attacker.',
  ],
  unknowns: [
    'The final amount recovered directly from the primary attacker is not established in the reviewed update.',
    'The number and value of affected users who did not submit an eligible grant application are not public.',
    'Current unique and retained aggregator traders are not published in a deduplicated form.',
    'Audited company expenses, treasury runway and net profitability after grants are not public.',
  ],
  unsourcedFields: ['Primary-attacker final recovery', 'Non-applicant user outcome', 'Unique retained traders', 'Audited post-grant profitability'],
  sections: {
    what_it_is: section(
      'KyberSwap is now primarily a non-custodial routing service. Its aggregator compares and splits same-chain swaps across outside DEXs, private market makers, order books and Kyber sources, while the wider interface also offers limit and cross-chain flows. That current product is different from KyberSwap Elastic, the concentrated-liquidity pool system exploited in 2023. This report keeps both in one lifecycle without pretending routed liquidity belongs to KyberSwap.',
      [
        claim('KyberSwap currently operates a multi-chain, non-custodial liquidity aggregator.', ['source:kyberswap:overview', 'source:kyberswap:aggregator', 'source:kyberswap:networks'], 'Current operator product and network documentation.'),
        claim('Aggregator routes can execute against external venues and are not KyberSwap-owned liquidity.', ['source:kyberswap:aggregator'], 'Current route-splitting mechanics.'),
        claim('KyberSwap Elastic is the legacy pool generation affected by the 2023 exploit.', ['source:kyberswap:postmortem'], 'Operator incident scope.'),
      ],
    ),
    what_happened: section(
      'Kyber began as an onchain liquidity network and later combined aggregation with its own AMM generations. On 2023-11-22, a precision and tick-accounting flaw in Elastic pools was exploited. KyberSwap reports about $56.20 million of affected assets across 2,367 liquidity providers, including roughly $55.23 million removed from pools; about $5.7 million was recovered from front-running bots. The treasury-grant program later distributed grants covering 100% of the reference value to approved applicants. Those grants came from KyberSwap resources; they were not a full direct recovery of the stolen assets. By 2026-08-03 the aggregator showed $5.26 billion of 30-day routed volume, while the protocol TVL adapter showed only about $1.09 million of current non-staking liquidity.',
      [
        claim('The Elastic exploit began on 2023-11-22 and affected 2,367 liquidity providers.', ['source:kyberswap:postmortem'], 'Operator incident summary and user counts.'),
        claim('KyberSwap measured about $56.20 million of affected assets and about $5.7 million recovered from front-running bots.', ['source:kyberswap:postmortem'], 'Operator incident metrics.'),
        claim('Treasury grants covered the reference value for users who submitted an application; this was not direct recovery of all stolen assets.', ['source:kyberswap:postmortem', 'source:kyberswap:grant'], 'Grant update and program terms.', { kind: 'inference', confidence: 'high' }),
        claim('Current routed volume is large while owned-pool liquidity remains very small relative to its historical peak.', ['source:kyberswap:aggregator-volume', 'source:kyberswap:tvl', 'source:kyberswap:pool-volume'], 'Separately scoped current aggregator, TVL and pool-volume adapters.'),
      ],
    ),
    why_this_outcome: section(
      'KyberSwap retained a useful distribution product because routing does not require it to rebuild all of the liquidity lost from Elastic. Integrating many venues lets the interface compete on execution quality while external pools carry most inventory risk. The 2023 exploit still destroyed confidence in Kyber-owned concentrated liquidity and forced the treasury to absorb compensation. The result is not dead: routed activity is real. It is impaired because the successful current surface is economically and technically different from the pool product that failed, and public evidence does not show that routing revenue rebuilt the lost capital base.',
      [
        claim('External routing allowed KyberSwap to remain useful without restoring Elastic liquidity.', ['source:kyberswap:aggregator', 'source:kyberswap:aggregator-volume', 'source:kyberswap:tvl'], 'Current route mechanics and contrasting activity/capital observations.', { kind: 'inference', confidence: 'high' }),
        claim('The exploit and treasury compensation impaired the owned-liquidity business and balance-sheet position.', ['source:kyberswap:postmortem', 'source:kyberswap:grant', 'source:kyberswap:tvl'], 'Incident loss, compensation and current capital base.', { kind: 'inference', confidence: 'high' }),
        claim('Public evidence does not show whether current routing economics have restored post-grant profitability.', ['source:kyberswap:aggregator-volume', 'source:kyberswap:postmortem'], 'Reviewed sources do not publish current expense or profit statements.', { kind: 'unknown', confidence: 'high' }),
      ],
    ),
    strategic_choices: section(
      'Kyber chose both aggregation and owned concentrated-liquidity pools. The combination offered route control and fee opportunities, but it also put treasury capital and user deposits behind a more complex pool design. After the exploit, KyberSwap halted Elastic deposits, published a detailed accounting, recovered bot-held assets and funded a grant program instead of leaving approved applicants with the reference-value loss. The current strategy emphasizes aggregation, developer APIs, limit orders and cross-chain execution. That narrows capital exposure but makes distribution and execution quality more important than owned TVL.',
      [
        claim('KyberSwap combined external routing with owned Elastic concentrated-liquidity pools before the exploit.', ['source:kyberswap:aggregator', 'source:kyberswap:postmortem'], 'Current aggregator architecture and incident scope.'),
        claim('KyberSwap suspended Elastic liquidity additions and funded a treasury-grant response.', ['source:kyberswap:postmortem', 'source:kyberswap:grant'], 'Operator mitigation and compensation terms.'),
        claim('The current product focus shifts economic importance from owned liquidity toward routing distribution and integrations.', ['source:kyberswap:overview', 'source:kyberswap:aggregator', 'source:kyberswap:networks'], 'Current product suite and integration footprint.', { kind: 'inference', confidence: 'high' }),
      ],
    ),
    operating_model: section(
      'For an aggregator swap, KyberSwap requests quotes, selects or splits a route and builds an onchain transaction that the user signs. The underlying pools or market makers provide inventory and charge their own fees; KyberSwap documentation says the default aggregator does not charge the user a separate trading fee, while integrators can configure fees. Limit orders and cross-chain products have distinct execution and risk. Legacy Elastic pools should not be treated as the liquidity behind current routed volume.',
      [
        claim('The aggregator selects and can split trades across multiple liquidity sources.', ['source:kyberswap:aggregator'], 'Current dynamic route description.'),
        claim('Users sign onchain transactions and external venues provide much of the routed inventory.', ['source:kyberswap:aggregator', 'source:kyberswap:overview'], 'Current non-custodial execution model.'),
        claim('Integrator-configured fees and underlying venue fees are distinct from default aggregator pricing.', ['source:kyberswap:aggregator'], 'Current developer integration and fee configuration description.'),
      ],
    ),
    token_and_value_capture: section(
      'KNC predates the current aggregator and remains the KyberDAO governance and staking token. The reviewed DAO documentation says a portion of fees collected from KyberSwap liquidity pools is converted into KNC and paid to eligible voters, with the ratio controlled by governance. That mechanism links KNC to Kyber-owned pool activity, not automatically to every dollar routed through external DEXs. The exact present contribution of aggregator integrations, pool fees and treasury incentives to KNC demand is not publicly separated.',
      [
        claim('KNC is used for KyberDAO staking and voting.', ['source:kyberswap:dao'], 'Current governance FAQ.'),
        claim('The documented reward mechanism converts a share of KyberSwap pool fees into KNC for eligible voters.', ['source:kyberswap:dao'], 'Current fee-reward description.'),
        claim('Routed volume through external venues does not by itself prove a proportional KNC cash flow.', ['source:kyberswap:aggregator', 'source:kyberswap:dao'], 'Aggregator and DAO fee mechanisms have different scopes.', { kind: 'inference', confidence: 'high' }),
      ],
    ),
    counterfactual: section(
      'A narrower aggregator-only strategy would have avoided exposure to the Elastic code path and the resulting treasury obligation, but it also would have given Kyber less control over liquidity and fee economics. Correct rounding direction, stronger boundary tests and adversarial testing of reinvestment logic could plausibly have prevented the specific exploit. Earlier isolation of pool versions could have reduced the blast radius. The evidence cannot show whether a safer but less ambitious product would have retained the same integrations or users.',
      [
        claim('An aggregator-only strategy would have reduced owned-pool code and capital exposure.', ['source:kyberswap:aggregator', 'source:kyberswap:postmortem'], 'Current routing model contrasted with the exploited pool product.', { kind: 'inference', confidence: 'high' }),
        claim('Correct rounding and stronger adversarial tests could plausibly have prevented the Elastic exploit path.', ['source:kyberswap:blocksec', 'source:kyberswap:postmortem'], 'Independent technical root cause and operator postmortem.', { kind: 'inference', confidence: 'high' }),
        claim('The adoption cost of a less ambitious product is not measurable from public evidence.', ['source:kyberswap:aggregator-volume', 'source:kyberswap:postmortem'], 'Current activity and incident evidence do not resolve the counterfactual.', { kind: 'unknown', confidence: 'high' }),
      ],
    ),
    risks_and_unknowns: section(
      'KyberSwap still faces router-contract, quote, integration, MEV, external-venue and cross-chain risk. Its brand also carries the trust cost of the Elastic exploit, while the treasury absorbed grants that may affect runway. Aggregator volume can look large because it passes through hundreds of venues; it is not owned liquidity or unique demand. Direct primary-attacker recovery, non-applicant outcomes, retained traders and audited post-grant profitability remain unknown.',
      [
        claim('Current aggregation creates execution dependencies on integrated venues and route contracts.', ['source:kyberswap:aggregator', 'source:kyberswap:networks'], 'Current multi-source route architecture.', { kind: 'inference', confidence: 'high' }),
        claim('The Elastic exploit remains a material trust and treasury event.', ['source:kyberswap:postmortem', 'source:kyberswap:grant'], 'Incident and compensation evidence.'),
        claim('Primary-attacker recovery, non-applicant outcomes, retained users and audited profitability remain unknown.', ['source:kyberswap:postmortem', 'source:kyberswap:aggregator-volume'], 'Reviewed sources do not publish complete answers.', { kind: 'unknown', confidence: 'high' }),
      ],
    ),
    lifecycle: section(
      'Kyber evolved from its original liquidity network into a multi-chain aggregator plus AMM suite. Elastic added capital-efficient pools but became the decisive failure point in November 2023. Recovery and grants protected approved applicants, while the owned-pool capital base collapsed. The aggregator continued and, by the current replay, routed billions of dollars over 30 days. The correct lifecycle is therefore operating but impaired after an exploit—not dead, and not a clean success.',
      [
        claim('KyberSwap evolved into a combined aggregator and pool suite before the Elastic exploit.', ['source:kyberswap:overview', 'source:kyberswap:aggregator', 'source:kyberswap:postmortem'], 'Current product and incident history.'),
        claim('Elastic failed materially while the aggregator continued operating.', ['source:kyberswap:postmortem', 'source:kyberswap:aggregator-volume', 'source:kyberswap:pool-volume'], 'Incident outcome and separately scoped current activity.'),
        claim('The mixed product outcome supports an operating-but-impaired classification.', ['source:kyberswap:aggregator-volume', 'source:kyberswap:tvl', 'source:kyberswap:postmortem'], 'Current routing scale, small owned liquidity and historical loss.', { kind: 'inference', confidence: 'high' }),
      ],
    ),
    outlook_and_watch: section(
      'The base case is a durable routing product with limited owned-liquidity recovery. Watch routed volume and integrations, but pair them with route quality, any disclosed fee capture, KyberDAO rewards, treasury disclosures and whether new Kyber-controlled pools attract capital safely. A stronger case would show reliable routing plus transparent revenue and rebuilt trust. Another router or pool incident, falling integrations, or undisclosed treasury stress would move the outlook lower.',
      [
        claim('Routed volume should be evaluated with execution quality and fee capture rather than in isolation.', ['source:kyberswap:aggregator', 'source:kyberswap:aggregator-volume', 'source:kyberswap:dao'], 'Current routing and token-reward scopes.', { kind: 'inference', confidence: 'high' }),
        claim('Safe rebuilding of owned liquidity would be a distinct recovery signal from aggregator growth.', ['source:kyberswap:tvl', 'source:kyberswap:pool-volume', 'source:kyberswap:postmortem'], 'Current owned-liquidity and incident context.', { kind: 'inference', confidence: 'high' }),
        claim('Treasury runway after grants remains a review trigger because it is not publicly audited.', ['source:kyberswap:grant', 'source:kyberswap:postmortem'], 'Documented compensation without current audited treasury statements.', { kind: 'unknown', confidence: 'high' }),
      ],
    ),
  },
  metrics: [
    metric('routed-volume-24h', 'spot_volume', 'Aggregator routed volume, 24h', 115893602, ['source:kyberswap:aggregator-volume'], 'DefiLlama total24h from the KyberSwap aggregator adapter.', { window: 'provider-reported rolling 24 hours', scope: 'aggregator routes', qualityFlags: ['routed_volume_overlap', 'not_owned_liquidity', 'not_unique_users'] }),
    metric('routed-volume-30d', 'spot_volume', 'Aggregator routed volume, 30d', 5260170526, ['source:kyberswap:aggregator-volume'], 'DefiLlama total30d from the KyberSwap aggregator adapter.', { window: 'provider-reported rolling 30 days', scope: 'aggregator routes', qualityFlags: ['routed_volume_overlap', 'not_owned_liquidity', 'not_unique_users'] }),
    metric('tvl-latest', 'tvl', 'Owned protocol TVL', 1092494, ['source:kyberswap:tvl'], 'Latest totalLiquidityUSD in the KyberSwap protocol response excluding the separately labeled staking balance.', { qualityFlags: ['tvl_not_market_depth', 'aggregator_liquidity_excluded'] }),
    metric('exploit-affected-assets', 'exploit_loss', 'Elastic affected assets', 56197284.26, ['source:kyberswap:postmortem'], 'Operator total value of affected assets at incident-time estimates.', { asOf: '2023-11-22', window: 'incident-time estimate', qualityFlags: ['incident_time_valuation', 'includes_removed_and_locked_assets'] }),
    metric('exploit-bot-recovery', 'exploit_recovery', 'Assets recovered from front-running bots', 5700000, ['source:kyberswap:postmortem'], 'Operator approximate recovery from front-running bots.', { asOf: '2024-02-07', window: 'recovery reported in post-mortem update', qualityFlags: ['approximate', 'not_primary_attacker_recovery', 'grants_excluded'] }),
  ],
  events: [
    event('elastic-exploit', 'exploit', '2023-11-22', 'A precision and tick-accounting flaw in KyberSwap Elastic led to roughly $56.20 million of affected assets.', ['source:kyberswap:postmortem', 'source:kyberswap:blocksec'], 'Operator incident accounting and independent technical analysis.'),
    event('grant-program', 'user_compensation', '2023-12-20', 'KyberSwap opened a Treasury Grant Program for eligible affected users.', ['source:kyberswap:grant'], 'Dated program announcement.'),
  ],
  feature: {
    lifecycle: 'dead',
    operating_model: 'Multi-chain swap aggregator with legacy KyberSwap Elastic pools.',
    product_cohort: 'multi_chain_aggregator_post_exploit',
    custody_model: 'non_custodial',
    primary_chain: 'Ethereum',
    chains: ['Ethereum', 'Arbitrum', 'Base', 'BNB Chain', 'Polygon', 'Avalanche', 'Optimism', 'Linea', 'Scroll', 'zkSync Era'],
    token_status: 'launched',
    token_symbol: 'KNC',
    token_launch_date: null,
    token_launch_timing: 'post_product',
    token_strategy: 'governance_staking_and_pool_fee_rewards',
    token_source_url: 'https://docs.kyberswap.com/governance/kyberdao/faq',
    metric_type: 'aggregator_routed_volume_24h',
    metric_unit: 'usd',
    metric_window: 'rolling_24h',
    metric_as_of: AS_OF,
    metric_observed_at: OBSERVED_AT,
    comparability_key: 'dex|multi_chain_aggregator|aggregator_routed_volume_24h|usd|rolling_24h',
  },
};

const serumSources = [
  source('serum', 'overview', 'Serum overview', 'https://docs.projectserum.com/introduction/overview', 'Project Serum', { locator: 'Archived operator description of the shared Solana order book and product surfaces.' }),
  source('serum', 'philosophy', 'Serum philosophy and architecture', 'https://docs.projectserum.com/appendix/philosophy', 'Project Serum', { locator: 'Archived description of permissionless, non-custodial, onchain order-book design.' }),
  source('serum', 'token', 'SRM token', 'https://docs.projectserum.com/introduction/srm-token', 'Project Serum', { locator: 'Archived SRM utility, unlock and fee buy-and-burn claims.' }),
  source('serum', 'github', 'Project Serum repositories', 'https://github.com/orgs/project-serum/repositories', 'GitHub / Project Serum', { locator: 'Current repository list and last-update dates for the original code organization.' }),
  source('serum', 'solana-update', 'Solana community update: December 2022', 'https://solana.com/en/news/monthly-community-update-december-2022', 'Solana Foundation', { publishedAt: '2022-12-20', locator: 'Community migration timeline, emergency fork and OpenBook adoption.' }),
  source('serum', 'defunct', 'FTX-backed DEX Serum calls itself defunct', 'https://www.theblock.co/post/190566/ftx-backed-dex-serum-calls-itself-defunct-promotes-community-fork', 'The Block', { publishedAt: '2022-11-29', role: 'independent', locator: 'Independent report of the project statement, FTX-held upgrade authority and OpenBook replacement.', directHttpStatus: 403, accessMethod: 'indexed_browser_snapshot' }),
  source('serum', 'fork', 'Serum emergency fork after FTX hack', 'https://www.coindesk.com/markets/2022/11/15/serums-srm-tokens-double-in-price-after-emergency-fork-in-wake-of-ftx-hack', 'CoinDesk', { publishedAt: '2022-11-15', role: 'independent', locator: 'Independent report of the security concern and emergency fork.' }),
  source('serum', 'court', 'FTX digital-asset estimation appeal opinion', 'https://www.ded.uscourts.gov/sites/ded/files/opinions/24-804.pdf', 'U.S. District Court for the District of Delaware', { tier: 'A', role: 'independent', locator: 'Court record describing FTX and Alameda creation and ownership of more than 95% of SRM supply.' }),
  source('serum', 'volume', 'Serum DEX volume API', 'https://api.llama.fi/summary/dexs/serum?dataType=dailyVolume', 'DefiLlama', { role: 'independent', locator: 'Null current short-window volume fields and totalAllTime from the legacy adapter.' }),
  source('serum', 'tvl', 'Serum protocol TVL API', 'https://api.llama.fi/protocol/serum', 'DefiLlama', { role: 'independent', locator: 'Historical maximum and latest adapter observations; latest value is not treated as proof of an operating venue.' }),
];

const serum = {
  slug: 'serum',
  name: 'Serum',
  aliases: ['Project Serum', 'Serum DEX'],
  table: 'dead_exchanges',
  operatingState: 'closed',
  outcome: 'failed_closed',
  outcomeConfidence: 'high',
  qualityConfidence: 'high',
  classification: {
    subtype: 'retired Solana central-limit order-book protocol',
    tags: ['spot_order_book', 'solana', 'ftx_dependency', 'closed', 'forked'],
    chains: ['Solana'],
    jurisdictions: [],
  },
  sources: serumSources,
  statusSources: ['source:serum:defunct', 'source:serum:solana-update', 'source:serum:volume'],
  statusLocator: 'The project declared the original program defunct, ecosystem integrations migrated and current volume fields are null.',
  outcomeSources: ['source:serum:defunct', 'source:serum:solana-update', 'source:serum:court', 'source:serum:volume', 'source:serum:tvl'],
  outcomeLocator: 'Project closure, emergency migration, concentrated token/control ties and absent current volume support a failed-closed call.',
  identityBoundary: 'This profile covers the original Serum program and SRM economics. OpenBook is a community fork and successor, not a continuation whose activity can be credited to Serum.',
  methodologyNotes: [
    'The DefiLlama Serum TVL adapter still returns a latest balance; without current volume or an operating project, it is treated as legacy residual state rather than live exchange liquidity.',
    'OpenBook adoption proves the open-source design could be forked; it does not revive Serum or restore SRM value capture.',
  ],
  unknowns: [
    'The exact amount of user funds or rent still stranded in original Serum program accounts is not published.',
    'The complete current ownership and unlock status of all SRM associated with the FTX estate is not established here.',
    'No supported current user, developer or revenue cohort exists for the original program in the reviewed evidence.',
    'The original upgrade key’s final custody and revocation state are not established by a current operator statement.',
  ],
  unsourcedFields: ['Residual user funds', 'Complete SRM estate disposition', 'Current users and revenue', 'Final original upgrade-authority custody'],
  sections: {
    what_it_is: section(
      'Serum was an onchain central-limit order book on Solana. Instead of asking every app to build its own book, it offered shared markets that wallets, AMMs and trading interfaces could plug into. The contracts were non-custodial, but the original upgrade authority was controlled through FTX-linked infrastructure. Serum is no longer an operating venue. OpenBook copied the code and replaced it in the Solana ecosystem, so OpenBook activity must not be counted as Serum activity.',
      [
        claim('Serum was a permissionless, non-custodial onchain order-book protocol on Solana.', ['source:serum:overview', 'source:serum:philosophy'], 'Archived operator architecture.'),
        claim('The original upgrade authority was tied to FTX control rather than an independent Solana community process.', ['source:serum:defunct', 'source:serum:fork'], 'Independent reports of the 2022 security concern.'),
        claim('OpenBook is a successor fork and not the original Serum venue.', ['source:serum:solana-update', 'source:serum:defunct'], 'Community migration timeline and project closure report.'),
      ],
    ),
    what_happened: section(
      'Serum launched in August 2020 with FTX and Alameda backing and became shared market infrastructure for early Solana DeFi. SRM offered fee discounts and was marketed as a token that would benefit from exchange fees. When FTX collapsed and its wallets were attacked in November 2022, Solana developers could not trust the FTX-held Serum upgrade authority. They forked the program into OpenBook, and major integrations moved within days. Serum then described the original program as defunct. Current DefiLlama short-window volume fields remain null.',
      [
        claim('Serum launched in August 2020 and became shared infrastructure for early Solana trading applications.', ['source:serum:overview', 'source:serum:solana-update'], 'Archived product history and Solana migration recap.'),
        claim('FTX’s collapse and wallet compromise made the original upgrade authority unsafe to trust.', ['source:serum:defunct', 'source:serum:fork'], 'Independent contemporary reports.'),
        claim('The community deployed OpenBook and integrations shifted away from Serum in November 2022.', ['source:serum:solana-update', 'source:serum:defunct'], 'Dated migration timeline.'),
        claim('The current legacy volume adapter has no 24-hour or 30-day Serum volume value.', ['source:serum:volume'], 'Current adapter response.'),
      ],
    ),
    why_this_outcome: section(
      'Serum’s product idea worked well enough to become infrastructure, but governance and token control were not independent of FTX and Alameda. That central dependency was hidden beneath non-custodial trading contracts: users controlled assets, yet the ecosystem still depended on an upgrade key and sponsor that could no longer be trusted. The court record later described FTX and Alameda as SRM’s creators and holders of more than 95% of supply. Because the code was open, Solana could preserve the useful order book by forking it. That made migration rational and left the Serum brand and SRM economics behind.',
      [
        claim('Serum achieved meaningful integration before failing.', ['source:serum:overview', 'source:serum:solana-update', 'source:serum:volume'], 'Archived role, migration record and historical cumulative volume.'),
        claim('FTX-linked upgrade authority created a critical control dependency despite non-custodial settlement.', ['source:serum:philosophy', 'source:serum:defunct', 'source:serum:fork'], 'Architecture contrasted with contemporary security reports.', { kind: 'inference', confidence: 'high' }),
        claim('FTX and Alameda created SRM and controlled more than 95% of its supply according to the court record.', ['source:serum:court'], 'District court factual summary.'),
        claim('Forkability let users preserve the technology without preserving Serum’s operating or token franchise.', ['source:serum:solana-update', 'source:serum:defunct'], 'OpenBook migration and project closure.', { kind: 'inference', confidence: 'high' }),
      ],
    ),
    strategic_choices: section(
      'Serum chose a shared order book that other Solana applications could compose with, a strong distribution decision. It also tied upgrades, sponsorship and token economics closely to FTX and Alameda. SRM used an extremely large locked allocation and promised fee discounts plus fee-funded benefits, creating a headline fully diluted value supported by a small freely traded supply. The team did not establish a resilient independent upgrade process before its sponsor failed. Open sourcing made recovery possible, but the recovery happened through a new venue and removed Serum’s moat.',
      [
        claim('A shared order book gave Serum broad composability across Solana applications.', ['source:serum:overview', 'source:serum:philosophy'], 'Archived architecture.'),
        claim('Upgrade control and sponsorship remained dangerously tied to FTX.', ['source:serum:defunct', 'source:serum:fork'], 'Contemporary security reports.'),
        claim('SRM combined fee benefits with a schedule in which 90% began locked.', ['source:serum:token'], 'Archived token schedule.'),
        claim('Open-source forkability saved the technical primitive but transferred network effects to OpenBook.', ['source:serum:solana-update', 'source:serum:defunct'], 'Migration outcome.', { kind: 'inference', confidence: 'high' }),
      ],
    ),
    operating_model: section(
      'Serum markets matched limit orders on Solana and settled from user-controlled accounts. Third-party interfaces and protocols could create markets, place orders and share the same book. Fees were charged by the order-book program, while integrators could add their own economics. This model depended on crank and integration infrastructure as well as the program itself. After November 2022, applications moved to OpenBook or other maintained programs, so the original Serum operating model no longer has a supported market network.',
      [
        claim('Serum matched orders and settled trades through an onchain Solana program.', ['source:serum:philosophy', 'source:serum:overview'], 'Archived architecture.'),
        claim('Third-party applications could create and use shared Serum markets.', ['source:serum:overview', 'source:serum:philosophy'], 'Archived permissionless integration model.'),
        claim('The current ecosystem uses maintained successor programs rather than the original Serum network.', ['source:serum:solana-update', 'source:serum:defunct', 'source:serum:github'], 'Migration timeline, closure and repository activity context.'),
      ],
    ),
    token_and_value_capture: section(
      'SRM launched in August 2020 as Serum’s utility and governance token. Holding it reduced trading fees, while archived documentation said exchange fees would generally benefit SRM through buy-and-burn, rewards or grants. Ninety percent of supply began locked, and the later court record says FTX and Alameda controlled more than 95% of total supply. Once integrations migrated to OpenBook, the original fee funnel stopped being a credible value-capture path. SRM does not gain a right to OpenBook activity simply because OpenBook forked Serum code.',
      [
        claim('SRM provided fee discounts and was designed to receive exchange-fee benefits.', ['source:serum:token'], 'Archived token utility and buy-and-burn description.'),
        claim('Ninety percent of SRM began locked under a multi-year unlock schedule.', ['source:serum:token'], 'Archived token schedule.'),
        claim('FTX and Alameda controlled more than 95% of SRM supply according to the court record.', ['source:serum:court'], 'District court factual summary.'),
        claim('OpenBook activity does not restore Serum’s original SRM fee funnel.', ['source:serum:solana-update', 'source:serum:defunct', 'source:serum:token'], 'Successor migration and original token mechanism.', { kind: 'inference', confidence: 'high' }),
      ],
    ),
    counterfactual: section(
      'An independent multisig or governance-controlled upgrade authority established before the FTX collapse could have let Serum users rotate keys without abandoning the venue. A less concentrated token distribution could have reduced sponsor and liquidity risk. The same emergency fork might then have been an upgrade rather than a brand migration. Still, FTX’s collapse could have removed market makers and confidence even with better controls, so public evidence cannot prove Serum would have survived.',
      [
        claim('Independent upgrade control could plausibly have allowed a safer in-place recovery.', ['source:serum:defunct', 'source:serum:solana-update'], 'The actual response required a fork because the original authority was unsafe.', { kind: 'inference', confidence: 'high' }),
        claim('Less concentrated SRM ownership could have reduced sponsor-specific token risk.', ['source:serum:court', 'source:serum:token'], 'Court ownership record and archived token schedule.', { kind: 'inference', confidence: 'high' }),
        claim('The effect of FTX’s collapse on liquidity and users cannot be separated from the authority failure.', ['source:serum:fork', 'source:serum:defunct'], 'Contemporary reports document concurrent shocks but not causal decomposition.', { kind: 'unknown', confidence: 'high' }),
      ],
    ),
    risks_and_unknowns: section(
      'The original venue is closed, so current risks are residual rather than growth risks: legacy accounts, inaccessible rent or orders, dormant software, SRM estate sales and confusion between Serum and OpenBook. The public adapter still reports a latest TVL-like balance, but absent current volume and a maintained operator it cannot be treated as live exchange liquidity. Residual user balances, final upgrade-key custody, the full SRM estate disposition and any remaining supported frontends are not established.',
      [
        claim('Legacy program balances should not be labeled current operating liquidity without an active venue and volume.', ['source:serum:tvl', 'source:serum:volume', 'source:serum:defunct'], 'Current adapter mismatch and closure evidence.', { kind: 'inference', confidence: 'high' }),
        claim('SRM remains exposed to concentrated FTX-estate ownership and disposition.', ['source:serum:court'], 'Court record.'),
        claim('Residual balances, final authority custody and supported access paths remain unknown.', ['source:serum:github', 'source:serum:defunct', 'source:serum:tvl'], 'Reviewed sources do not publish a current closure ledger.', { kind: 'unknown', confidence: 'high' }),
      ],
    ),
    lifecycle: section(
      'Serum launched in August 2020, grew into a shared Solana order book and recorded about $3.49 billion of cumulative volume in the surviving adapter. Its TVL series peaked near $1.88 billion in November 2021. The FTX collapse in November 2022 exposed unsafe upgrade control, and Solana developers rapidly moved to OpenBook. Serum called the original program defunct. The technology influenced successors, but the venue, sponsor network and token value-capture loop ended. This is a failed and closed project with a successful open-source afterlife.',
      [
        claim('Serum reached material historical volume and TVL before the closure.', ['source:serum:volume', 'source:serum:tvl'], 'Historical provider series.'),
        claim('The FTX collapse triggered an emergency fork and ecosystem migration in November 2022.', ['source:serum:fork', 'source:serum:solana-update'], 'Contemporary reports and community recap.'),
        claim('The original program was declared defunct and replaced by OpenBook.', ['source:serum:defunct', 'source:serum:solana-update'], 'Project statement report and successor timeline.'),
      ],
    ),
    outlook_and_watch: section(
      'There is no operating recovery thesis for original Serum. The useful watch items are closure hygiene: migration tools for legacy accounts, transparent handling of residual balances, FTX-estate SRM disposition and whether any interface still misrepresents old markets as live. OpenBook or newer Solana order-book growth belongs in their own profiles. A genuine Serum revival would require a maintained program, independent authority, active markets and new evidence of users and fees; none appears in the reviewed record.',
      [
        claim('Residual-account migration and SRM estate disposition are the remaining material watch items.', ['source:serum:court', 'source:serum:github', 'source:serum:tvl'], 'Court ownership record, repository state and residual adapter balance.'),
        claim('OpenBook growth must be attributed to OpenBook rather than Serum.', ['source:serum:solana-update', 'source:serum:defunct'], 'Successor migration evidence.'),
        claim('No reviewed evidence supports an original-Serum revival as of 2026-08-03.', ['source:serum:volume', 'source:serum:github', 'source:serum:defunct'], 'Absent current volume, closure record and repository context.', { kind: 'unknown', confidence: 'high' }),
      ],
    ),
  },
  metrics: [
    metric('cumulative-spot-volume', 'spot_volume', 'Historical cumulative spot volume', 3488914577, ['source:serum:volume'], 'DefiLlama totalAllTime from the legacy Serum dailyVolume adapter.', { asOf: '2022-11-29', window: 'historical cumulative through venue wind-down', qualityFlags: ['historical_not_current', 'adapter_legacy_scope'] }),
    metric('tvl-peak', 'tvl', 'Historical peak TVL', 1881949146, ['source:serum:tvl'], 'Maximum totalLiquidityUSD in the Serum protocol response, dated 2021-11-09.', { asOf: '2021-11-09', window: 'historical maximum in provider series', qualityFlags: ['historical_not_current'] }),
  ],
  events: [
    event('emergency-fork', 'emergency_migration', '2022-11-12', 'Solana developers began an emergency fork after FTX’s compromise made the Serum upgrade authority unsafe to trust.', ['source:serum:fork', 'source:serum:solana-update'], 'Contemporary report and community timeline.'),
    event('declared-defunct', 'closure', '2022-11-29', 'Serum described the original mainnet program as defunct and directed the ecosystem toward OpenBook.', ['source:serum:defunct'], 'Independent report of the project statement.'),
  ],
  feature: {
    lifecycle: 'dead',
    operating_model: 'Retired Solana onchain central-limit order book replaced by OpenBook.',
    product_cohort: 'single_chain_spot_orderbook',
    custody_model: 'non_custodial',
    primary_chain: 'Solana',
    chains: ['Solana'],
    token_status: 'launched',
    token_symbol: 'SRM',
    token_launch_date: null,
    token_launch_timing: 'at_or_near_launch',
    token_strategy: 'fee_discounts_governance_and_fee_funded_buy_and_burn',
    token_source_url: 'https://docs.projectserum.com/introduction/srm-token',
    metric_type: 'historical_cumulative_spot_volume',
    metric_unit: 'usd',
    metric_window: 'lifetime_to_closure',
    metric_as_of: '2022-11-29',
    metric_observed_at: OBSERVED_AT,
    comparability_key: 'dex|spot_orderbook|historical_cumulative_spot_volume|usd|lifetime_to_closure',
  },
};

const specs = [hyperliquid, raydium, osmosis, kyberswap, serum];

export const document = {
  schema: 'chaindump-dex-wave-f-v1',
  research_as_of: AS_OF,
  generated_migration: '0083_dex_wave_f_profiles.sql',
  cases: specs.map((spec) => ({
    table: spec.table,
    slug: spec.slug,
    name: spec.name,
    canonical_profile: buildProfile(spec),
    feature: {
      kind: 'dex',
      slug: spec.slug,
      lifecycle: spec.feature.lifecycle,
      operating_model: spec.feature.operating_model,
      product_cohort: spec.feature.product_cohort,
      custody_model: spec.feature.custody_model,
      primary_chain: spec.feature.primary_chain,
      chains: spec.feature.chains,
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
        metric_replayed_at: spec.feature.metric_observed_at,
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

function renderStagingInsert(entry) {
  const values = [
    sqlText(entry.table),
    sqlText(entry.slug),
    sqlText(JSON.stringify(entry.canonical_profile)),
    sqlText(JSON.stringify(entry.feature)),
  ];
  return `INSERT INTO _dex_wave_f_profiles_0083 (
  target_table, slug, canonical_profile, feature
) VALUES (${values.join(', ')});`;
}

export function renderMigration(value = document) {
  const stagingStatements = value.cases.map(renderStagingInsert);
  const migration = `-- Five current, source-linked DEX profiles assembled and source-checked ${AS_OF}.
-- Claims remain pending human review. Legacy case fields and source arrays are preserved.

DROP TABLE IF EXISTS _dex_wave_f_profiles_0083;

CREATE TABLE _dex_wave_f_profiles_0083 (
  target_table TEXT NOT NULL,
  slug TEXT NOT NULL,
  canonical_profile TEXT NOT NULL CHECK (json_valid(canonical_profile)),
  feature TEXT NOT NULL CHECK (json_valid(feature)),
  PRIMARY KEY (target_table, slug)
);

-- canonical-payload-start
${stagingStatements.join('\n\n')}
-- canonical-payload-end

UPDATE successful_exchanges AS exchange_row
SET profile = json_set(
  CASE
    WHEN json_valid(exchange_row.profile) AND json_type(exchange_row.profile) = 'object'
      THEN exchange_row.profile
    ELSE '{}'
  END,
  '$.canonical_profile', json(staged.canonical_profile)
)
FROM _dex_wave_f_profiles_0083 AS staged
WHERE staged.target_table = 'successful_exchanges'
  AND exchange_row.type = 'dex'
  AND exchange_row.slug = staged.slug;

UPDATE mid_exchanges AS exchange_row
SET profile = json_set(
  CASE
    WHEN json_valid(exchange_row.profile) AND json_type(exchange_row.profile) = 'object'
      THEN exchange_row.profile
    ELSE '{}'
  END,
  '$.canonical_profile', json(staged.canonical_profile)
)
FROM _dex_wave_f_profiles_0083 AS staged
WHERE staged.target_table = 'mid_exchanges'
  AND exchange_row.kind = 'dex'
  AND exchange_row.slug = staged.slug;

UPDATE dead_exchanges AS exchange_row
SET profile = json_set(
  CASE
    WHEN json_valid(exchange_row.profile) AND json_type(exchange_row.profile) = 'object'
      THEN exchange_row.profile
    ELSE '{}'
  END,
  '$.canonical_profile', json(staged.canonical_profile)
)
FROM _dex_wave_f_profiles_0083 AS staged
WHERE staged.target_table = 'dead_exchanges'
  AND exchange_row.kind = 'dex'
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
  json_extract(feature, '$.kind'),
  json_extract(feature, '$.slug'),
  json_extract(feature, '$.lifecycle'),
  json_extract(feature, '$.operating_model'),
  json_extract(feature, '$.product_cohort'),
  json_extract(feature, '$.custody_model'),
  json_extract(feature, '$.primary_chain'),
  json_extract(feature, '$.chains'),
  json_extract(feature, '$.token_status'),
  json_extract(feature, '$.token_symbol'),
  json_extract(feature, '$.token_launch_date'),
  json_extract(feature, '$.token_launch_timing'),
  json_extract(feature, '$.token_strategy'),
  json_extract(feature, '$.token_source_url'),
  json_extract(feature, '$.metric_type'),
  json_extract(feature, '$.metric_unit'),
  json_extract(feature, '$.metric_window'),
  json_extract(feature, '$.metric_as_of'),
  json_extract(feature, '$.metric_observed_at'),
  json_extract(feature, '$.comparability_key'),
  json_extract(feature, '$.evidence'),
  json_extract(feature, '$.quality_label'),
  json_extract(feature, '$.quality_issues'),
  json_extract(feature, '$.lifecycle_evidence_date'),
  json_extract(feature, '$.last_verified_at'),
  json_extract(feature, '$.next_review_at'),
  json_extract(feature, '$.freshness_status'),
  json_extract(feature, '$.updated_at')
FROM _dex_wave_f_profiles_0083
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

DROP TABLE _dex_wave_f_profiles_0083;
`;

  for (const [index, statement] of stagingStatements.entries()) {
    const bytes = Buffer.byteLength(statement, 'utf8');
    if (bytes > MAX_D1_STATEMENT_BYTES) {
      throw new Error(`D1 statement for ${value.cases[index].slug} is ${bytes} bytes`);
    }
  }
  return migration;
}

writeFileSync(artifactPath, `${JSON.stringify(document, null, 2)}\n`);
writeFileSync(migrationPath, renderMigration(document));

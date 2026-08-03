#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYSIS_SECTION_KEYS, validateEntityProfile } from '../src/lib/entity-profile.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(root, 'docs/dex-wave-h-profiles-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0089_dex_wave_h_profiles.sql');
const AS_OF = '2026-08-03';
const ACCESSED_AT = '2026-08-03T20:05:00Z';
const OBSERVED_AT = '2026-08-03T19:59:00Z';
const NEXT_REVIEW_AT = '2026-08-10T20:05:00Z';
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
    return { id, type: entry.type, date: entry.date, description: entry.description, claim_ids: [claimId] };
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
        'Routed volume is not additive to underlying DEX volume, TVL is not market depth, fees are not profit, residual balances are not an operating venue, and observed co-movement is not causation.',
        'Documented decisions, observed outcomes, analyst inferences and unresolved unknowns are kept separate.',
        ...spec.methodologyNotes,
      ],
    },
  };
  const errors = validateEntityProfile(profile);
  if (errors.length) throw new Error(`${spec.slug} failed profile validation: ${JSON.stringify(errors)}`);
  return profile;
}

const spookySources = [
  source('spookyswap', 'app', 'SpookySwap application', 'https://spooky.fi/', 'SpookySwap', { locator: 'Current product surface for swaps, V3 liquidity, BOO staking, farms, launchpad and Sonic-facing operation.' }),
  source('spookyswap', 'introduction', 'Introducing SpookySwap', 'https://spookyswap.medium.com/introducing-spookyswap-less-gas-more-trades-faster-transactions-extra-spooky-da8d6ed8514a', 'SpookySwap', { publishedAt: '2021-04-14', locator: 'Dated operator launch rationale, Fantom focus and governance intent.' }),
  source('spookyswap', 'development', 'SpookySwap Development Update #3', 'https://spookyswap.medium.com/spookyswap-development-update-3-2555213db3a4', 'SpookySwap', { publishedAt: '2021-06-23', locator: 'Early Fantom traction, xBOO fee split, product priorities and audit claim.' }),
  source('spookyswap', 'v3-launch', 'SpookySwap V3 Launch Announcement', 'https://spookyswap.medium.com/spookyswap-v3-launch-announcement-c1a3c86f9100', 'SpookySwap', { publishedAt: '2024-02-26', locator: 'Dated V3 concentrated-liquidity launch, chains, fee tiers and BOO governance description.' }),
  source('spookyswap', 'frontend-incident', 'Spooky Frontend Exploit Update', 'https://spookyswap.medium.com/spooky-frontend-exploit-update-funds-are-safe-ba5f7e8fa300', 'SpookySwap', { publishedAt: '2023-11-19', locator: 'Operator account of the frontend compromise, response and statement that pool contracts and funds were not drained.' }),
  source('spookyswap', 'docs', 'SpookySwap V3 documentation', 'https://docs.spooky.fi/', 'SpookySwap', { locator: 'Current V3 scope, non-upgradeable contract framing, supported networks and BOO role.' }),
  source('spookyswap', 'sonic-routing', '1inch Integrates Sonic', 'https://blog.soniclabs.com/1inch-integrates-sonic-swaps-speed-and-seamless-defi/', 'Sonic Labs', { publishedAt: '2025-02-14', role: 'independent', locator: 'Sonic ecosystem routing context that includes SpookySwap among available liquidity sources.' }),
  source('spookyswap', 'audit', 'SpookySwap security profile', 'https://skynet.certik.com/projects/spookyswap', 'CertiK', { tier: 'A', role: 'independent', locator: 'Version-scoped 2021 audit history and current coverage limitations.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('spookyswap', 'tvl', 'SpookySwap protocol TVL API', 'https://api.llama.fi/protocol/spookyswap', 'DefiLlama', { role: 'independent', locator: 'Combined Fantom, Sonic, BitTorrent and Horizen balances plus historical TVL series.' }),
  source('spookyswap', 'volume', 'SpookySwap DEX volume API', 'https://api.llama.fi/summary/dexs/spookyswap?dataType=dailyVolume', 'DefiLlama', { role: 'independent', locator: 'Combined spot-volume series across supported SpookySwap deployments.' }),
  source('spookyswap', 'fees', 'SpookySwap fees API', 'https://api.llama.fi/summary/fees/spookyswap?dataType=dailyFees', 'DefiLlama', { role: 'independent', locator: 'Combined swap-fee observations; fees are not profit.' }),
  source('spookyswap', 'revenue', 'SpookySwap revenue API', 'https://api.llama.fi/summary/fees/spookyswap?dataType=dailyRevenue', 'DefiLlama', { role: 'independent', locator: 'Adapter-defined protocol and holder revenue observations.' }),
];

const spiritSources = [
  source('spiritswap', 'app', 'SpiritSwap application', 'https://www.spiritswap.finance/', 'SpiritSwap', { locator: 'Current Fantom product surface, AMM, farms, bridge description and inSPIRIT benefits; displayed zero and NaN figures are not used as market measurements.' }),
  source('spiritswap', 'swap', 'SpiritSwap swap surface', 'https://www.spiritswap.finance/chain/ftm/swap', 'SpiritSwap', { locator: 'Current Fantom swap route; route availability does not prove successful execution or material liquidity.' }),
  source('spiritswap', 'inspirit', 'SpiritSwap inSPIRIT surface', 'https://www.spiritswap.finance/chain/ftm/inspirit', 'SpiritSwap', { locator: 'Current branded locking and governance route; economics are cross-checked against adapter observations.' }),
  source('spiritswap', 'audit', 'SpiritSwap core smart contract audit', 'https://files.safe.de.fi/safe/files/audit/pdf/SpiritSwap_Core_Security_Audit_Report.pdf', 'Solidified', { publishedAt: '2021-06-08', tier: 'A', role: 'independent', locator: 'Version-scoped review of original constant-product core contracts; explicitly not a business-model guarantee.' }),
  source('spiritswap', 'shutdown', 'SpiritSwap winds down citing Multichain exposure', 'https://cointelegraph.com/news/spiritswap-fantom-project-winds-down-citing-multichain-exposure', 'Cointelegraph', { publishedAt: '2023-08-09', role: 'independent', locator: 'Contemporary account of the drained treasury, September closure plan and stated operating-cost shortfall.' }),
  source('spiritswap', 'rescue', 'Fantom DEX rescued after planned shutdown', 'https://cointelegraph.com/news/fantom-dex-rescued-at-eleventh-hour-following-planned-shutdown', 'Cointelegraph', { publishedAt: '2023-08-16', role: 'independent', locator: 'Community-approved transfer to Power and reported $200,000 USDC treasury commitment.' }),
  source('spiritswap', 'treasury-context', 'Multichain bridge woes spell end for Fantom-based DEX', 'https://blockworks.com/news/multichain-bridge-fantom-dex', 'Blockworks', { publishedAt: '2023-08-10', role: 'independent', locator: 'Launch timing, treasury and Multichain dependence, and historical fee-to-inSPIRIT description.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('spiritswap', 'tvl', 'SpiritSwap protocol TVL API', 'https://api.llama.fi/protocol/spiritswap', 'DefiLlama', { role: 'independent', locator: 'Current Fantom balances and historical TVL series.' }),
  source('spiritswap', 'volume', 'SpiritSwap DEX volume API', 'https://api.llama.fi/summary/dexs/spiritswap?dataType=dailyVolume', 'DefiLlama', { role: 'independent', locator: 'Current and historical spot-volume adapter series.' }),
  source('spiritswap', 'fees', 'SpiritSwap fees API', 'https://api.llama.fi/summary/fees/spiritswap?dataType=dailyFees', 'DefiLlama', { role: 'independent', locator: 'Current adapter-defined trading-fee observations.' }),
  source('spiritswap', 'revenue', 'SpiritSwap revenue API', 'https://api.llama.fi/summary/fees/spiritswap?dataType=dailyRevenue', 'DefiLlama', { role: 'independent', locator: 'Current adapter-defined protocol revenue and holder-revenue observations.' }),
];

const uraniumSources = [
  source('uranium-finance', 'doj', 'Maryland man charged over Uranium Finance hacks', 'https://www.justice.gov/usao-sdny/pr/maryland-man-charged-defrauding-crypto-exchange-over-50-million-hacks', 'U.S. Department of Justice', { publishedAt: '2026-03-30', tier: 'A', locator: 'Indictment allegations, two incident amounts, closure, seizure, victim contact and presumption-of-innocence notice.' }),
  source('uranium-finance', 'indictment', 'United States v. Spalletta indictment', 'https://www.justice.gov/usao-sdny/media/1433301/dl', 'U.S. District Court for the Southern District of New York', { publishedAt: '2026-03-30', tier: 'A', locator: 'Charging document; allegations are not findings of guilt.' }),
  source('uranium-finance', 'coindesk', 'Uranium Finance loses $50M in exploit', 'https://www.coindesk.com/markets/2021/04/28/binance-chain-defi-exchange-uranium-finance-loses-50m-in-exploit', 'CoinDesk', { publishedAt: '2021-04-28', role: 'independent', locator: 'Contemporary loss estimate, migration timing and reports of the constant mismatch.' }),
  source('uranium-finance', 'halborn', 'Explained: The Uranium Finance Hack', 'https://www.halborn.com/blog/post/explained-the-uranium-finance-hack-april-2021', 'Halborn', { publishedAt: '2021-05-04', tier: 'A', role: 'independent', locator: 'Independent explanation of the 10,000-versus-1,000 invariant mismatch.' }),
  source('uranium-finance', 'immunefi', 'Hack Analysis: Uranium Finance', 'https://medium.com/immunefi/building-a-poc-for-the-uranium-heist-ec83fbd83e9f', 'Immunefi', { publishedAt: '2022-09-19', tier: 'A', role: 'independent', locator: 'Reproduction of the second exploit across 26 market pairs.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('uranium-finance', 'dni', 'Uranium Finance incident analysis', 'https://dn.institute/research/cyberattacks/incidents/2021-04-28-uranium-finance/', 'Distributed Networks Institute', { publishedAt: '2021-04-29', role: 'independent', locator: 'Technical chronology, postmortem excerpts and audit-process context.' }),
  source('uranium-finance', 'theblock', 'Uranium Finance exploited for $50 million', 'https://www.theblock.co/amp/post/103076/binance-smart-chain-defi-uranium-finance-exploited-lost-50-million', 'The Block', { publishedAt: '2021-04-28', role: 'independent', locator: 'Contemporary asset inventory, U92 amount and allegation caveats.', directHttpStatus: 403, accessMethod: 'browser_or_paywalled_page' }),
  source('uranium-finance', 'knownsec', 'Analysis of Uranium protocol hacking attack', 'https://medium.com/@Knownsec_Blockchain_Lab/knownsec-blockchain-lab-its-the-fault-of-handling-fees-again-b5eacbdf6ccd', 'Knownsec Blockchain Lab', { publishedAt: '2021-04-28', tier: 'A', role: 'independent', locator: 'Contemporary attack-contract and transaction reconstruction.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('uranium-finance', 'attack-tx', 'Uranium Finance second exploit transaction', 'https://bscscan.com/tx/0x5a504fe72ef7fc76dfeb4d979e533af4e23fe37e90b5516186d5787893c37991', 'BscScan', { publishedAt: '2021-04-28', tier: 'A', role: 'primary', locator: 'Immutable BNB Chain transaction record for the second exploit.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('uranium-finance', 'seizure-report', 'U.S. seized $31 million linked to Uranium Finance hack', 'https://www.bleepingcomputer.com/news/cryptocurrency/us-seized-31-million-stolen-in-2021-uranium-finance-hack/', 'BleepingComputer', { publishedAt: '2025-02-25', role: 'independent', locator: 'Contemporary report of the seizure; seizure is not distribution to victims.' }),
];

const spookyswap = {
  slug: 'spookyswap',
  name: 'SpookySwap',
  aliases: ['Spooky', 'SpookySwap V2', 'SpookySwap V3'],
  table: 'mid_exchanges',
  operatingState: 'operating',
  outcome: 'operating_middling',
  outcomeConfidence: 'high',
  qualityConfidence: 'high',
  classification: {
    subtype: 'Fantom-origin multichain spot AMM with V2 and V3 pools',
    tags: ['spot_amm', 'concentrated_liquidity', 'multichain', 'fantom_origin', 'token_fee_share'],
    chains: ['Fantom Opera', 'Sonic', 'BitTorrent Chain', 'Horizen EON'],
    jurisdictions: [],
  },
  sources: spookySources,
  statusSources: ['source:spookyswap:app', 'source:spookyswap:tvl', 'source:spookyswap:volume'],
  statusLocator: 'Current interface plus nonzero multichain balances and trades establish continued operation.',
  outcomeSources: ['source:spookyswap:introduction', 'source:spookyswap:v3-launch', 'source:spookyswap:tvl', 'source:spookyswap:volume', 'source:spookyswap:fees'],
  outcomeLocator: 'Durable product continuity but activity far below the historical peak supports a middling outcome.',
  identityBoundary: 'This profile covers SpookySwap-branded spot V2 and V3 pools across Fantom, Sonic, BitTorrent Chain and Horizen EON. The launchpad, bridge integrations and linked perpetuals interface are separate products; their activity is not added to spot volume. Fantom or Sonic chain growth is not automatically SpookySwap growth.',
  methodologyNotes: [
    'Combined adapter metrics are used only where the provider explicitly aggregates SpookySwap deployments; V2-only numbers are not added again.',
    'The November 2023 event is treated as a frontend compromise based on the operator account, not a smart-contract pool loss.',
  ],
  unknowns: [
    'How many recurring traders use SpookySwap on each supported chain?',
    'What share of current BOO staking distributions comes from fees rather than incentives?',
    'How much Sonic volume is routed by aggregators versus acquired directly?',
    'Which current contracts, frontends and governance actions are controlled by identifiable maintainers?',
  ],
  unsourcedFields: ['Active traders by chain', 'Fee-funded BOO yield share', 'Direct versus routed Sonic flow', 'Current operational control map'],
  sections: {
    what_it_is: section(
      'SpookySwap is a non-custodial exchange that began as a Fantom-native constant-product AMM and later added concentrated-liquidity V3 pools. Traders swap from their wallets, LPs supply assets, and BOO holders can stake into xBOO for governance and a documented share of swap fees. The current interface also advertises farms, a launchpad and perpetuals, but this profile measures only SpookySwap-branded spot pools. It operates on Fantom and smaller deployments including Sonic, BitTorrent Chain and Horizen EON.',
      [
        claim('SpookySwap operates non-custodial V2 and V3 spot pools.', ['source:spookyswap:app', 'source:spookyswap:docs', 'source:spookyswap:v3-launch'], 'Current product and dated V3 descriptions.'),
        claim('BOO and xBOO connect governance and a documented portion of swap fees.', ['source:spookyswap:app', 'source:spookyswap:development'], 'Current staking surface and original fee-split announcement.'),
        claim('Spot metrics exclude the launchpad, bridge and perpetuals products.', ['source:spookyswap:app', 'source:spookyswap:volume'], 'Product inventory and adapter scope.', { kind: 'inference' }),
      ],
    ),
    what_happened: section(
      'SpookySwap launched in April 2021 to fill Fantom’s missing native exchange layer. It quickly paired BOO farming with limit orders, a built-in bridge and xBOO fee sharing, and its combined TVL later peaked near $1.66 billion on Jan. 17, 2022. Fantom activity and token incentives then contracted. A November 2023 frontend compromise forced a replacement interface; the operator said pool funds were safe. SpookySwap launched V3 concentrated liquidity in February 2024 and later appeared on Sonic, but current combined activity is only about $509,000 of TVL and $856,000 of 30-day spot volume.',
      [
        claim('SpookySwap launched as a Fantom-focused DEX in April 2021.', ['source:spookyswap:introduction'], 'Dated operator introduction.'),
        claim('Combined SpookySwap TVL peaked near $1.66 billion on 2022-01-17.', ['source:spookyswap:tvl'], 'Historical provider series.'),
        claim('The venue restored its frontend, launched V3 and continued across additional chains.', ['source:spookyswap:frontend-incident', 'source:spookyswap:v3-launch', 'source:spookyswap:app'], 'Dated incident, V3 launch and current interface.'),
      ],
    ),
    why_this_outcome: section(
      'SpookySwap won early because it was one of Fantom’s first native exchanges and bundled the things local users needed: swaps, farms, a bridge and trader tools. That same distribution advantage concentrated the business in Fantom’s liquidity cycle. BOO emissions and xBOO rewards helped build liquidity, but they could not guarantee repeat trading after incentives and Fantom activity weakened. V3 and Sonic preserved the product rather than restoring its old scale. Public evidence supports chain concentration, incentive dependence and continuing competition as pressures, but it does not assign a precise share of the decline to any one cause.',
      [
        claim('Early Fantom-native distribution helped SpookySwap acquire liquidity and users.', ['source:spookyswap:introduction', 'source:spookyswap:development'], 'Launch rationale and early traction.', { kind: 'inference', confidence: 'high' }),
        claim('BOO rewards and xBOO fee sharing tied liquidity to token and fee economics.', ['source:spookyswap:development', 'source:spookyswap:app'], 'Documented incentive and fee model.'),
        claim('The evidence does not quantify how much chain conditions, emissions, competition or product execution caused the decline.', ['source:spookyswap:tvl', 'source:spookyswap:volume', 'source:spookyswap:v3-launch'], 'Outcome series without causal decomposition.', { kind: 'unknown' }),
      ],
    ),
    strategic_choices: section(
      'The team chose Fantom focus instead of broad multichain distribution at launch, then built a bridge, native limit orders and a recognizable interface to own that local user journey. It used BOO farms for liquidity and xBOO fee sharing for longer-term alignment. After activity fell, it kept V2 available, rebuilt the compromised frontend, shipped non-upgradeable V3 pools on several chains and followed Fantom’s successor ecosystem to Sonic. Those choices preserved continuity and optionality, but also split liquidity across versions, chains and fee tiers.',
      [
        claim('SpookySwap deliberately launched as a Fantom-focused exchange and distribution hub.', ['source:spookyswap:introduction', 'source:spookyswap:development'], 'Operator launch and development record.'),
        claim('The team chose BOO farming and xBOO fee sharing to attract and retain liquidity.', ['source:spookyswap:development', 'source:spookyswap:app'], 'Documented token model.'),
        claim('The team retained V2 while adding multichain V3 and Sonic support.', ['source:spookyswap:v3-launch', 'source:spookyswap:docs', 'source:spookyswap:app'], 'Version and chain inventory.'),
      ],
    ),
    operating_model: section(
      'V2 pools use a constant-product AMM and historically charged 0.20% per swap, with 0.17% going to LPs and 0.03% used for the xBOO buyback path. V3 pools let LPs concentrate liquidity inside chosen price ranges and select fee tiers from 0.01% to 1.00%. The current adapter reports about $699 of 30-day fees and $23 of protocol or holder revenue. Those are tiny but real operating flows. TVL is inventory held in contracts, not a guarantee of tradeable depth, and neither fees nor revenue equals profit.',
      [
        claim('The documented V2 split sent 0.17% to LPs and 0.03% to the xBOO buyback path.', ['source:spookyswap:development'], 'Operator fee-model announcement.'),
        claim('V3 pools use concentrated liquidity with several fee tiers.', ['source:spookyswap:v3-launch', 'source:spookyswap:docs'], 'Operator V3 design record.'),
        claim('The adapter recorded about $699 of 30-day fees and $23 of 30-day revenue at review time.', ['source:spookyswap:fees', 'source:spookyswap:revenue'], 'Current provider observations.'),
      ],
    ),
    token_and_value_capture: section(
      'BOO is the venue’s governance and incentive token. Farms distributed BOO to LPs, while staking BOO into xBOO historically gave holders governance participation and exposure to the 0.03% V2 buyback allocation. That is a real link to exchange usage, but current fee generation is small and the reviewed sources do not prove how much xBOO currently distributes after incentives, contract changes and multiple versions. BOO is not equity, and Sonic’s chain token or unrelated Sonic DEX tokens do not accrue to BOO holders.',
      [
        claim('BOO funded farms and governance in the original operating model.', ['source:spookyswap:development', 'source:spookyswap:v3-launch'], 'Operator token and governance descriptions.'),
        claim('xBOO historically received value through the documented V2 buyback fee allocation.', ['source:spookyswap:development'], 'Dated fee-split announcement.'),
        claim('Current net distributions to xBOO holders are not established by the reviewed sources.', ['source:spookyswap:app', 'source:spookyswap:revenue'], 'Current interface and adapter do not provide a complete holder ledger.', { kind: 'unknown' }),
      ],
    ),
    counterfactual: section(
      'Earlier expansion beyond Fantom could have reduced dependence on one chain, but it might also have diluted the local advantage that made SpookySwap successful. Tying BOO emissions to fee-supported demand could have made organic retention easier to see. A single forced migration from V2 to V3 might concentrate liquidity, but would strand users and remove a familiar fallback. The realistic alternative was staged expansion with hard usage thresholds, explicit version sunsets and fee-backed incentives; public evidence cannot prove that plan would have restored peak scale.',
      [
        claim('Earlier multichain expansion could reduce single-chain concentration while weakening local focus.', ['source:spookyswap:introduction', 'source:spookyswap:v3-launch'], 'Observed launch and later expansion support the trade-off.', { kind: 'inference', confidence: 'medium' }),
        claim('Fee-triggered emissions could make retained demand easier to distinguish from subsidized liquidity.', ['source:spookyswap:development', 'source:spookyswap:fees'], 'Incentive design and current fee observations.', { kind: 'inference', confidence: 'medium' }),
        claim('No reviewed source proves a different migration or emission plan would restore historical scale.', ['source:spookyswap:tvl', 'source:spookyswap:volume'], 'Counterfactual is not observed.', { kind: 'unknown' }),
      ],
    ),
    risks_and_unknowns: section(
      'The main risks are fragmented liquidity, low fee generation, BOO incentive dependence, frontend compromise and uncertain control across old and new contracts. The 2023 incident shows that audited pool contracts do not protect users from a compromised website. The 2021 audits were version-specific and do not cover every later deployment or frontend. Current unknowns include active traders by chain, direct versus aggregator flow, xBOO net distributions, contract-control boundaries and whether low-volume deployments can support maintenance.',
      [
        claim('A frontend compromise can endanger users even when pool contracts are not drained.', ['source:spookyswap:frontend-incident'], 'Operator incident account.', { kind: 'inference' }),
        claim('The reviewed audit history does not cover every current contract and interface.', ['source:spookyswap:audit', 'source:spookyswap:v3-launch'], 'Audit dates and later deployment scope.'),
        claim('Trader retention, routed-flow share and current control boundaries remain unknown.', ['source:spookyswap:app', 'source:spookyswap:volume', 'source:spookyswap:sonic-routing'], 'No complete current disclosure.', { kind: 'unknown' }),
      ],
    ),
    lifecycle: section(
      'SpookySwap launched on Fantom in April 2021, grew with the chain and BOO incentives, and reached a combined TVL peak near $1.66 billion in January 2022. As Fantom’s DeFi cycle faded, balances, trading and fees declined. The team rebuilt the frontend after a November 2023 compromise, launched V3 on Fantom, Horizen EON and BitTorrent Chain in February 2024, and later carried the brand to Sonic. It remains a working exchange with legacy and newer deployments, but its current scale is a small fraction of the peak.',
      [
        claim('SpookySwap moved from Fantom-native launch to a multichain V2 and V3 product.', ['source:spookyswap:introduction', 'source:spookyswap:v3-launch', 'source:spookyswap:app'], 'Dated launch, V3 release and current surface.'),
        claim('The November 2023 frontend incident did not end the venue.', ['source:spookyswap:frontend-incident', 'source:spookyswap:app'], 'Incident response and current operation.'),
        claim('Current TVL and volume remain far below their historical levels.', ['source:spookyswap:tvl', 'source:spookyswap:volume'], 'Current and historical provider series.'),
      ],
    ),
    outlook_and_watch: section(
      'SpookySwap’s outlook is continued operation at modest scale unless Sonic or another deployment creates sustained demand. Watch 30- and 90-day spot volume by chain, fee-backed BOO distributions, active traders, liquidity concentration and frontend-security notices. Growth should count only when trades, fees and recurring users rise together without relying mainly on BOO emissions. A rising Sonic chain does not change this call unless SpookySwap captures that activity, and perpetuals or launchpad usage must remain separate from spot results.',
      [
        claim('Sustained chain-level spot volume and fees are the clearest recovery signals.', ['source:spookyswap:volume', 'source:spookyswap:fees', 'source:spookyswap:tvl'], 'Current comparable series.', { kind: 'inference' }),
        claim('Sonic growth only supports recovery if SpookySwap captures measurable usage.', ['source:spookyswap:sonic-routing', 'source:spookyswap:volume'], 'Chain and venue scopes are separate.', { kind: 'inference' }),
        claim('No reviewed evidence currently supports a return to historical scale.', ['source:spookyswap:tvl', 'source:spookyswap:volume'], 'Current metrics remain far below peak.', { kind: 'unknown' }),
      ],
    ),
  },
  metrics: [
    metric('spot-volume-24h', 'spot_volume', 'Combined spot volume, 24h', 9609, ['source:spookyswap:volume'], 'DefiLlama combined total24h.', { scope: 'SpookySwap-branded spot pools across supported chains' }),
    metric('spot-volume-30d', 'spot_volume', 'Combined spot volume, 30d', 856059, ['source:spookyswap:volume'], 'DefiLlama combined total30d.', { window: 'rolling 30 days', scope: 'SpookySwap-branded spot pools across supported chains' }),
    metric('tvl-latest', 'tvl', 'Combined TVL', 509309, ['source:spookyswap:tvl'], 'Sum of currentChainTvls without double-counted borrowed or staking buckets.', { scope: 'Fantom, Sonic, BitTorrent Chain and Horizen EON pools', qualityFlags: ['tvl_not_market_depth'] }),
    metric('tvl-peak', 'tvl', 'Historical peak TVL', 1664547468, ['source:spookyswap:tvl'], 'Maximum combined historical totalLiquidityUSD, dated 2022-01-17.', { asOf: '2022-01-17', window: 'historical maximum', qualityFlags: ['historical_not_current'] }),
    metric('fees-30d', 'fees', 'Trading fees, 30d', 699.32, ['source:spookyswap:fees'], 'DefiLlama total30d fee adapter.', { window: 'rolling 30 days', qualityFlags: ['fees_not_profit'] }),
    metric('revenue-30d', 'protocol_revenue', 'Protocol and holder revenue, 30d', 22.97, ['source:spookyswap:revenue'], 'DefiLlama dailyRevenue total30d.', { window: 'rolling 30 days', qualityFlags: ['adapter_defined_revenue'] }),
  ],
  events: [
    event('launch', 'launch', '2021-04-14', 'SpookySwap publicly introduced its Fantom-native AMM.', ['source:spookyswap:introduction'], 'Dated operator launch announcement.'),
    event('v3-launch', 'product_change', '2024-02-28', 'SpookySwap launched V3 concentrated-liquidity pools on Fantom, Horizen EON and BitTorrent Chain.', ['source:spookyswap:v3-launch'], 'Dated operator launch announcement.'),
  ],
  feature: {
    lifecycle: 'mid', operating_model: 'Operating multichain V2 and V3 spot AMM with BOO/xBOO governance and fee linkage.', product_cohort: 'multichain_spot_amm', custody_model: 'non_custodial', primary_chain: 'Fantom Opera', chains: ['Fantom Opera', 'Sonic', 'BitTorrent Chain', 'Horizen EON'], token_status: 'launched', token_symbol: 'BOO', token_launch_date: null, token_launch_timing: 'at_or_near_launch', token_strategy: 'liquidity_emissions_governance_and_xboo_fee_buyback', token_source_url: 'https://spooky.fi/', metric_type: 'spot_volume', metric_unit: 'usd', metric_window: 'rolling_30_days', metric_as_of: AS_OF, metric_observed_at: OBSERVED_AT, comparability_key: 'dex|multichain_spot_amm|spot_volume|usd|rolling_30_days',
  },
};

const spiritswap = {
  slug: 'spiritswap', name: 'SpiritSwap', aliases: ['Spirit Swap'], table: 'mid_exchanges', operatingState: 'operating', outcome: 'rescued_declining', outcomeConfidence: 'high', qualityConfidence: 'high',
  classification: { subtype: 'Fantom-native constant-product and stable-swap DEX after rescue handoff', tags: ['spot_amm', 'stableswap', 'fantom_native', 'vote_escrow', 'rescued', 'declining'], chains: ['Fantom Opera'], jurisdictions: [] },
  sources: spiritSources,
  statusSources: ['source:spiritswap:app', 'source:spiritswap:swap', 'source:spiritswap:tvl', 'source:spiritswap:volume'], statusLocator: 'Current surface and nonzero adapter activity support operation, while scale and stewardship remain limited.',
  outcomeSources: ['source:spiritswap:shutdown', 'source:spiritswap:rescue', 'source:spiritswap:tvl', 'source:spiritswap:volume', 'source:spiritswap:revenue'], outcomeLocator: 'Averted closure plus durable but very small activity supports rescued and declining status.',
  identityBoundary: 'This profile covers SpiritSwap’s Fantom AMM, farms and SPIRIT/inSPIRIT system. Multichain was external bridge and treasury infrastructure, not SpiritSwap itself. The Power rescue preserved the venue but did not merge all Power products into SpiritSwap. A live website, residual contracts or Fantom chain activity does not by itself prove healthy SpiritSwap operation.',
  methodologyNotes: ['The current interface displays zero and NaN headline figures; those broken fields are not treated as market data.', 'Nonzero adapter activity supports operating continuity but not verified team solvency, successful user execution or healthy token distributions.'],
  unknowns: ['Who currently controls SpiritSwap contracts, treasury, frontend and governance?', 'What liabilities and Multichain-linked losses remained after the 2023 handoff?', 'How many recurring users generate current volume?', 'Whether current inSPIRIT fee distributions function and are economically material?'],
  unsourcedFields: ['Current control map', 'Post-handoff liabilities', 'Recurring users', 'Current inSPIRIT distributions'],
  sections: {
    what_it_is: section('SpiritSwap is a non-custodial Fantom exchange built around constant-product and stable-swap pools. Traders swap from their wallets, LPs deposit paired assets, and farms historically paid SPIRIT rewards. Locking SPIRIT created inSPIRIT for boosted farms, governance and a documented share of exchange revenue. SpiritSwap also presented a bridge interface, but the underlying Multichain infrastructure was a separate protocol. The current site and adapters show that the venue still exists, though at very small scale.', [claim('SpiritSwap operates Fantom AMM and stable-swap products.', ['source:spiritswap:app', 'source:spiritswap:audit'], 'Current product and original core design.'), claim('SPIRIT and inSPIRIT historically linked farming, governance and fee participation.', ['source:spiritswap:app', 'source:spiritswap:inspirit', 'source:spiritswap:treasury-context'], 'Current branded surface and historical independent description.'), claim('Multichain bridge infrastructure was an external dependency, not the SpiritSwap exchange.', ['source:spiritswap:shutdown', 'source:spiritswap:treasury-context'], 'Independent incident accounts.', { kind: 'inference' })]),
    what_happened: section('SpiritSwap launched on Fantom in April 2021, grew through SPIRIT farms and inSPIRIT locks, and reached about $373.03 million of TVL on Jan. 17, 2022. In 2023, Multichain’s failure trapped or drained the treasury assets SpiritSwap needed for salaries, development and marketing. The team announced a Sept. 1 shutdown, then users approved a transfer to the Power team with a reported $200,000 USDC treasury commitment. The rescue kept the venue alive. Current adapters show roughly $229,706 of TVL and only $31,309 of 30-day volume, so survival did not restore former scale.', [claim('SpiritSwap launched in April 2021 and later peaked near $373.03 million of TVL.', ['source:spiritswap:treasury-context', 'source:spiritswap:tvl'], 'Launch report and historical provider series.'), claim('Multichain-linked treasury losses triggered the announced September 2023 closure plan.', ['source:spiritswap:shutdown', 'source:spiritswap:treasury-context'], 'Contemporary reports.'), claim('A community-approved transfer to Power and treasury commitment averted immediate closure.', ['source:spiritswap:rescue'], 'Contemporary rescue report.')]),
    why_this_outcome: section('SpiritSwap’s Fantom focus built a clear local product and community, but also concentrated demand, treasury assets and bridge exposure in one ecosystem. SPIRIT emissions and inSPIRIT voting helped attract liquidity while fees were strong. They could not protect operating runway when Multichain failed and Fantom liquidity shrank. The rescue worked because the code, brand and community could be transferred to another team. The evidence strongly supports treasury concentration and the Multichain shock as the immediate closure trigger; it does not quantify how much chain decline, competition, emissions or later execution explains today’s low scale.', [claim('Treasury dependence on Multichain turned an external infrastructure failure into an operating crisis.', ['source:spiritswap:shutdown', 'source:spiritswap:treasury-context'], 'Reported treasury loss and cost shortfall.', { kind: 'inference', confidence: 'high' }), claim('Transferable code, governance and community created a rescue option instead of unavoidable closure.', ['source:spiritswap:rescue', 'source:spiritswap:app'], 'Handoff and continued surface.', { kind: 'inference' }), claim('The public record does not decompose current weakness among Fantom decline, incentives, competition and post-rescue execution.', ['source:spiritswap:tvl', 'source:spiritswap:volume', 'source:spiritswap:rescue'], 'Outcome series without causal allocation.', { kind: 'unknown' })]),
    strategic_choices: section('SpiritSwap chose deep Fantom specialization, a branded bridge interface, SPIRIT liquidity emissions and vote-locked inSPIRIT. That package made the venue useful inside Fantom, but placed treasury and distribution risk around the same ecosystem and bridge stack. After Multichain broke the operating budget, the community chose a team transfer and recapitalization rather than shut the contracts and interface. That preserved continuity but left users dependent on a new stewardship group whose current control and financial disclosures are incomplete.', [claim('SpiritSwap chose Fantom specialization and bridge-assisted distribution.', ['source:spiritswap:app', 'source:spiritswap:treasury-context'], 'Product and bridge descriptions.'), claim('The venue chose SPIRIT emissions and inSPIRIT locking for liquidity and governance.', ['source:spiritswap:app', 'source:spiritswap:inspirit'], 'Token-system surfaces.'), claim('The community chose transfer and recapitalization instead of closure.', ['source:spiritswap:rescue'], 'Reported rescue vote and funding commitment.')]),
    operating_model: section('SpiritSwap earned swap fees from AMM trades and historically allocated value among LPs, the protocol and inSPIRIT holders. LPs also received SPIRIT emissions, while inSPIRIT locks boosted farms and directed governance. At review time, the data adapter recorded about $95 of 30-day fees, $13.85 of protocol revenue and zero holder revenue. That does not prove every inSPIRIT contract has stopped paying, but it shows the current tracked business is tiny. The roughly $229,706 of TVL is contract inventory, not proof of deep execution or a funded operating team.', [claim('SpiritSwap combined swap fees with SPIRIT farming and inSPIRIT governance.', ['source:spiritswap:app', 'source:spiritswap:inspirit', 'source:spiritswap:treasury-context'], 'Product and historical economics.'), claim('The adapter recorded about $95 of 30-day fees and $13.85 of revenue at review time.', ['source:spiritswap:fees', 'source:spiritswap:revenue'], 'Current provider observations.'), claim('Current TVL and fees do not prove operator solvency or reliable user execution.', ['source:spiritswap:tvl', 'source:spiritswap:swap'], 'Metric and route limitations.', { kind: 'inference' })]),
    token_and_value_capture: section('SPIRIT launched with the product’s farming economy, and locking it created inSPIRIT. The advertised rights included boosted farm emissions, governance over incentives and community proposals, and a share of swap revenue. That linked the token to exchange use when volume and fees were meaningful. Current fee and holder-revenue observations are very small, and the site does not publish a complete post-rescue distribution ledger. SPIRIT is not ownership of Fantom, Multichain or Power, and success elsewhere in those ecosystems does not accrue automatically to holders.', [claim('SPIRIT funded liquidity incentives and inSPIRIT locks carried governance and advertised fee rights.', ['source:spiritswap:app', 'source:spiritswap:inspirit'], 'Current branded token description.'), claim('Current tracked holder revenue was zero at review time.', ['source:spiritswap:revenue'], 'Adapter observation.', { confidence: 'medium' }), claim('Post-rescue net token distributions and liabilities remain unknown.', ['source:spiritswap:rescue', 'source:spiritswap:revenue'], 'No complete current distribution ledger.', { kind: 'unknown' })]),
    counterfactual: section('A treasury split across native stable assets, qualified custodial arrangements and bridge-risk caps could have prevented one infrastructure failure from ending the operating budget. Multichain exposure could also have been separated from payroll and runway. Earlier expansion beyond Fantom might diversify demand, but would add deployment cost and dilute local focus. After the loss, closure would have been cleaner than an opaque rescue, while the transfer preserved upside. The strongest counterfactual is a documented treasury policy plus public handoff controls, not simply a different AMM curve.', [claim('Diversified treasury custody and bridge-risk caps could reduce a single external failure’s impact on runway.', ['source:spiritswap:shutdown', 'source:spiritswap:treasury-context'], 'Observed concentration supports the alternative.', { kind: 'inference', confidence: 'high' }), claim('A public control and liability ledger could make the rescue easier to evaluate.', ['source:spiritswap:rescue', 'source:spiritswap:app'], 'Handoff without complete current disclosure.', { kind: 'inference' }), claim('No source proves multichain expansion or closure would have produced a better user outcome.', ['source:spiritswap:shutdown', 'source:spiritswap:rescue'], 'Alternatives were not observed.', { kind: 'unknown' })]),
    risks_and_unknowns: section('The main risks are unclear post-rescue control, thin liquidity, low fees, dormant token rights, bridge liabilities and old contract or frontend permissions. A 2021 core audit covered specific contracts; it did not cover Multichain treasury exposure, the 2023 handoff or every current interface. The public site’s zero and NaN headline figures also weaken operational transparency. Users still need verified contracts, successful trade simulation and withdrawal paths rather than assuming a branded page is enough.', [claim('The original audit did not cover later treasury, bridge and governance failures.', ['source:spiritswap:audit', 'source:spiritswap:shutdown'], 'Audit scope and later incident.', { kind: 'inference' }), claim('The public interface currently exposes broken zero or NaN headline fields.', ['source:spiritswap:app'], 'Current rendered surface.'), claim('Current control, liabilities, recurring users and inSPIRIT distributions remain unknown.', ['source:spiritswap:rescue', 'source:spiritswap:app', 'source:spiritswap:revenue'], 'No complete current disclosure.', { kind: 'unknown' })]),
    lifecycle: section('SpiritSwap launched in April 2021, grew into a major Fantom venue and peaked in early 2022. The Fantom cycle then weakened. Multichain’s 2023 failure impaired SpiritSwap’s treasury so severely that the team announced a shutdown. A community vote transferred the project to Power days later and prevented immediate closure. The current interface remains online and adapters still record trades, fees and balances, but all are far below the peak. SpiritSwap is best described as rescued and operating at declining, marginal scale—not dead and not recovered.', [claim('SpiritSwap grew from April 2021 launch to a January 2022 TVL peak.', ['source:spiritswap:treasury-context', 'source:spiritswap:tvl'], 'Launch and provider history.'), claim('The 2023 closure plan was reversed by a community-approved rescue.', ['source:spiritswap:shutdown', 'source:spiritswap:rescue'], 'Dated reports.'), claim('Current nonzero activity remains far below historical scale.', ['source:spiritswap:tvl', 'source:spiritswap:volume', 'source:spiritswap:fees'], 'Current and historical provider series.')]),
    outlook_and_watch: section('SpiritSwap can remain online without becoming a healthy business. Watch 30- and 90-day volume, fee and TVL trends; verified control of treasury and contracts; successful swaps and withdrawals; inSPIRIT distributions; and dated releases from the rescue team. Recovery requires recurring users, deeper liquidity and fee-funded operations without another treasury subsidy. Fantom or Sonic ecosystem growth should not change the call unless SpiritSwap itself captures measurable activity.', [claim('Volume, fees, liquidity and successful execution are the primary operating watch items.', ['source:spiritswap:volume', 'source:spiritswap:fees', 'source:spiritswap:tvl', 'source:spiritswap:swap'], 'Current measurable surfaces.', { kind: 'inference' }), claim('Control and token-distribution disclosures are necessary to evaluate the rescue.', ['source:spiritswap:rescue', 'source:spiritswap:inspirit'], 'Handoff and token-system scope.', { kind: 'inference' }), claim('No reviewed evidence supports a return to SpiritSwap’s historical scale.', ['source:spiritswap:tvl', 'source:spiritswap:volume'], 'Current metrics remain far below peak.', { kind: 'unknown' })]),
  },
  metrics: [metric('spot-volume-24h', 'spot_volume', 'Spot volume, 24h', 511, ['source:spiritswap:volume'], 'DefiLlama total24h.', { scope: 'SpiritSwap Fantom spot pools' }), metric('spot-volume-30d', 'spot_volume', 'Spot volume, 30d', 31309, ['source:spiritswap:volume'], 'DefiLlama total30d.', { window: 'rolling 30 days', scope: 'SpiritSwap Fantom spot pools' }), metric('tvl-latest', 'tvl', 'Current TVL', 229706, ['source:spiritswap:tvl'], 'Current Fantom TVL without double-counted staking or borrowed buckets.', { qualityFlags: ['tvl_not_market_depth'] }), metric('tvl-peak', 'tvl', 'Historical peak TVL', 373029262, ['source:spiritswap:tvl'], 'Maximum historical totalLiquidityUSD, dated 2022-01-17.', { asOf: '2022-01-17', window: 'historical maximum', qualityFlags: ['historical_not_current'] }), metric('fees-30d', 'fees', 'Trading fees, 30d', 95, ['source:spiritswap:fees'], 'DefiLlama total30d fee adapter.', { window: 'rolling 30 days', qualityFlags: ['fees_not_profit'] }), metric('revenue-30d', 'protocol_revenue', 'Protocol revenue, 30d', 13.85, ['source:spiritswap:revenue'], 'DefiLlama dailyRevenue total30d.', { window: 'rolling 30 days', qualityFlags: ['adapter_defined_revenue'] })],
  events: [event('shutdown-announced', 'closure_plan', '2023-08-09', 'SpiritSwap announced a September shutdown after Multichain-linked treasury losses removed its operating budget.', ['source:spiritswap:shutdown', 'source:spiritswap:treasury-context'], 'Contemporary independent reports.'), event('rescue-approved', 'rescue', '2023-08-16', 'Users approved transfer to Power with a reported $200,000 USDC treasury commitment.', ['source:spiritswap:rescue'], 'Contemporary rescue report.')],
  feature: { lifecycle: 'mid', operating_model: 'Rescued Fantom spot AMM with SPIRIT farming and inSPIRIT governance.', product_cohort: 'single_chain_spot_amm', custody_model: 'non_custodial', primary_chain: 'Fantom Opera', chains: ['Fantom Opera'], token_status: 'launched', token_symbol: 'SPIRIT', token_launch_date: null, token_launch_timing: 'at_or_near_launch', token_strategy: 'liquidity_emissions_vote_lock_governance_and_fee_share', token_source_url: 'https://www.spiritswap.finance/', metric_type: 'spot_volume', metric_unit: 'usd', metric_window: 'rolling_30_days', metric_as_of: AS_OF, metric_observed_at: OBSERVED_AT, comparability_key: 'dex|single_chain_spot_amm|spot_volume|usd|rolling_30_days' },
};

const uranium = {
  slug: 'uranium-finance', name: 'Uranium Finance', aliases: ['Uranium', 'Uranium AMM'], table: 'dead_exchanges', operatingState: 'closed', outcome: 'failed_after_repeat_exploits', outcomeConfidence: 'high', qualityConfidence: 'high',
  classification: { subtype: 'closed BNB Chain constant-product AMM and yield farm', tags: ['spot_amm', 'yield_farm', 'bnb_chain', 'repeat_exploit', 'closed'], chains: ['BNB Chain'], jurisdictions: [] },
  sources: uraniumSources,
  statusSources: ['source:uranium-finance:doj', 'source:uranium-finance:coindesk', 'source:uranium-finance:dni'], statusLocator: 'Authority allegation and independent incident sources agree the second exploit ended the venue; guilt attribution remains unresolved.',
  outcomeSources: ['source:uranium-finance:doj', 'source:uranium-finance:halborn', 'source:uranium-finance:immunefi', 'source:uranium-finance:coindesk'], outcomeLocator: 'Two attacks, a fatal invariant error and closure support failure independently of disputed actor attribution.',
  identityBoundary: 'This profile covers the 2021 Uranium Finance AMM and farming protocol on BNB Chain. It has no relationship to physical uranium, uranium-backed tokens or later projects using the word Uranium. The exchange’s code defect was application-specific; it was not a BNB Chain consensus failure. Old tokens, contracts, domains or legal recovery do not constitute a successor exchange.',
  methodologyNotes: ['The DOJ’s March 2026 account and indictment are allegations. The named defendant is presumed innocent unless proven guilty.', 'The $31 million seizure is tracked separately from victim recovery; seized assets are not assumed distributed.'],
  unknowns: ['What final criminal-case disposition will occur?', 'How much seized value will ultimately reach victims?', 'What independent audit work covered the vulnerable V2 pair contracts before deployment?', 'How were final losses allocated across LPs, treasury and token holders?'],
  unsourcedFields: ['Criminal disposition', 'Final victim recovery', 'Complete pre-deployment review record', 'Final claimant allocation'],
  sections: {
    what_it_is: section('Uranium Finance was a non-custodial AMM and yield farm on BNB Chain. It forked the familiar constant-product exchange model, let LPs deposit token pairs, and used a native U92 token in its farming system. It launched and failed in April 2021. This record is only about that crypto protocol; it is unrelated to physical uranium or later uranium-branded assets.', [claim('Uranium Finance was a BNB Chain AMM using liquidity pools.', ['source:uranium-finance:doj', 'source:uranium-finance:halborn'], 'Authority description and independent technical analysis.'), claim('The venue used U92 as a native token inside the protocol.', ['source:uranium-finance:theblock'], 'Contemporary stolen-asset inventory.'), claim('Later physical-uranium or uranium-branded projects are outside this profile.', ['source:uranium-finance:doj'], 'Case-specific identity scope.', { kind: 'inference' })]),
    what_happened: section('Uranium suffered two attacks in April 2021. A March 2026 indictment alleges that the April 8 attack manipulated reward logic and extracted about $1.4 million. On April 28, a separate attacker transaction exploited a V2 pair-contract arithmetic error across 26 pools. Contemporary reports estimated roughly $50 million lost; the indictment alleges about $53.3 million. The venue shut down. U.S. authorities seized cryptocurrency worth about $31 million in February 2025, but seizure is not the same as victim repayment and the criminal allegations have not been proven.', [claim('The April 8 incident allegedly extracted about $1.4 million through reward logic.', ['source:uranium-finance:doj', 'source:uranium-finance:indictment'], 'Charging documents; allegation only.', { confidence: 'medium', note: 'The named defendant is presumed innocent unless proven guilty.' }), claim('The April 28 invariant exploit drained roughly $50 million to $53.3 million across 26 pools.', ['source:uranium-finance:doj', 'source:uranium-finance:coindesk', 'source:uranium-finance:immunefi'], 'Authority allegation and contemporary independent estimates.'), claim('About $31 million was seized in February 2025 but is not established as distributed victim recovery.', ['source:uranium-finance:doj', 'source:uranium-finance:seizure-report'], 'Authority and independent seizure reports.', { confidence: 'high' })]),
    why_this_outcome: section('The fatal second exploit came from Uranium’s own code change, not from BNB Chain. Developers changed the fee calculation to use 10,000-scale arithmetic but left the invariant check on a 1,000-scale assumption. That mismatch let a caller provide a small input while withdrawing nearly all pool reserves. The venue had already survived a separate reward attack earlier in the month and was preparing another migration. Repeated control failures plus a loss larger than any credible reserve ended the exchange. Actor attribution remains an allegation; the code defect and closure have independent support.', [claim('A 10,000-versus-1,000 arithmetic mismatch broke the V2 invariant check.', ['source:uranium-finance:halborn', 'source:uranium-finance:immunefi', 'source:uranium-finance:dni'], 'Independent technical reconstructions.'), claim('The defect was application code introduced during migration, not a BNB Chain consensus failure.', ['source:uranium-finance:coindesk', 'source:uranium-finance:halborn', 'source:uranium-finance:attack-tx'], 'Migration reporting, code analysis and chain record.', { kind: 'inference', confidence: 'high' }), claim('The evidence supports repeat control failure but does not establish criminal guilt.', ['source:uranium-finance:doj', 'source:uranium-finance:dni'], 'Incident record and explicit authority caveat.', { kind: 'unknown' })]),
    strategic_choices: section('Uranium chose to fork a proven AMM design and modify fee arithmetic for its own economics. That accelerated launch but made a tiny deviation in asset-conservation logic catastrophic. After the first April attack, the project continued operating and migrated to V2 while another V2.1 update was planned. The team did not pause all liquidity until the changed invariant had been independently verified. Those were product and release choices; BNB Chain provided execution but did not choose the faulty constants.', [claim('Uranium modified the upstream constant-product fee and invariant arithmetic.', ['source:uranium-finance:halborn', 'source:uranium-finance:immunefi'], 'Independent code comparisons.'), claim('The venue continued through migration after an earlier April attack.', ['source:uranium-finance:doj', 'source:uranium-finance:coindesk', 'source:uranium-finance:dni'], 'Two-incident chronology and migration timing.'), claim('The reviewed record does not show a successful independent verification of the fatal V2 change before deployment.', ['source:uranium-finance:dni', 'source:uranium-finance:coindesk'], 'Contemporaneous review record.', { kind: 'unknown' })]),
    operating_model: section('Uranium matched traders inside constant-product pools funded by LPs and added farming rewards through U92. In a healthy AMM, every swap must leave the adjusted reserve product at or above the invariant after fees. Uranium’s V2 check failed that basic conservation rule, so the second attacker could drain reserves across many pairs. The model had no disclosed insurance or recapitalization capacity able to absorb the loss. Once pool assets disappeared, token emissions could not recreate user claims or market trust.', [claim('Uranium used constant-product pools and farming rewards.', ['source:uranium-finance:halborn', 'source:uranium-finance:theblock'], 'Technical design and asset inventory.'), claim('The V2 invariant error allowed withdrawals vastly larger than the supplied value.', ['source:uranium-finance:halborn', 'source:uranium-finance:immunefi', 'source:uranium-finance:knownsec'], 'Independent exploit reconstructions.'), claim('No reviewed reserve or insurance could recapitalize the venue after the second loss.', ['source:uranium-finance:doj', 'source:uranium-finance:coindesk'], 'Closure following the loss and absence of a disclosed recovery facility.', { kind: 'unknown' })]),
    token_and_value_capture: section('U92 was Uranium’s native token and part of its farming economy; contemporary reporting counted about 112,000 U92 among assets drained in the second exploit. The surviving public record does not establish a durable fee claim, governance right, fixed emission schedule or recovery entitlement for holders. Whatever incentive role U92 had disappeared with the venue’s liquidity and operations. Legal seizures concern allegedly stolen assets and do not revive U92 or create a successor token.', [claim('U92 was Uranium’s native token and was held inside affected protocol balances.', ['source:uranium-finance:theblock'], 'Contemporary stolen-asset inventory.'), claim('Reviewed sources do not establish durable U92 fee, governance or recovery rights.', ['source:uranium-finance:doj', 'source:uranium-finance:coindesk'], 'Incident sources do not document those rights.', { kind: 'unknown' }), claim('Asset seizure does not revive U92 or the exchange.', ['source:uranium-finance:doj', 'source:uranium-finance:seizure-report'], 'Legal recovery and product continuity are separate.', { kind: 'inference' })]),
    counterfactual: section('The direct prevention path was technical: differential testing against the upstream pair contract, invariant-based property tests for every fee setting, and an independent review of each changed arithmetic constant. After the first incident, a full pause until V2 and V2.1 passed those tests would have traded availability for safety. A capped migration with per-pool limits could also have reduced blast radius. These controls would address the documented defect, but they cannot prove every attack or alleged actor would have been stopped.', [claim('Differential and invariant testing could detect the documented constant mismatch.', ['source:uranium-finance:halborn', 'source:uranium-finance:immunefi', 'source:uranium-finance:dni'], 'Reproducible technical defect supports the control.', { kind: 'inference', confidence: 'high' }), claim('Pausing after the first attack could reduce exposure during the later migration.', ['source:uranium-finance:doj', 'source:uranium-finance:coindesk'], 'Observed two-incident chronology.', { kind: 'inference', confidence: 'high' }), claim('No counterfactual proves all losses or alleged conduct would have been prevented.', ['source:uranium-finance:doj', 'source:uranium-finance:dni'], 'Unobserved alternative and pending criminal case.', { kind: 'unknown' })]),
    risks_and_unknowns: section('The exchange is closed, so remaining risks are claimant recovery, misleading old interfaces or tokens, forgotten approvals and uncertainty around residual contracts. The legal case may clarify attribution and forfeiture, but the indictment is only an accusation. Authorities reported a $31 million seizure, not a completed distribution. Unknowns include final case disposition, recoverable value after legal process, every pre-deployment audit, remaining contract permissions and how losses divide among LPs and other users.', [claim('The criminal charges are accusations and the defendant is presumed innocent.', ['source:uranium-finance:doj', 'source:uranium-finance:indictment'], 'Explicit authority notice.'), claim('Seized assets are not the same as funds distributed to victims.', ['source:uranium-finance:doj', 'source:uranium-finance:seizure-report'], 'Seizure and victim-contact record.', { kind: 'inference' }), claim('Final recovery, permissions, audit history and claimant allocations remain unknown.', ['source:uranium-finance:doj', 'source:uranium-finance:dni'], 'No final ledger or case disposition.', { kind: 'unknown' })]),
    lifecycle: section('Uranium launched on BNB Chain in early 2021 and combined an AMM with aggressive farming. An April 8 reward exploit removed about $1.4 million according to later federal allegations. The project continued, moved into V2 and prepared another migration. On April 28, the faulty invariant check was exploited across 26 pools, removing roughly $50 million to $53.3 million and forcing closure. A 2025 seizure and 2026 indictment reopened the recovery and attribution story, not the exchange. Uranium Finance remains dead.', [claim('Uranium suffered two separate April 2021 attacks.', ['source:uranium-finance:doj', 'source:uranium-finance:dni'], 'Authority allegation and independent chronology.'), claim('The second exploit forced the exchange to shut down.', ['source:uranium-finance:doj', 'source:uranium-finance:coindesk'], 'Authority and contemporary closure record.'), claim('Later seizure and criminal proceedings concern recovery and attribution, not venue revival.', ['source:uranium-finance:doj', 'source:uranium-finance:seizure-report'], 'Legal and product outcomes are separate.', { kind: 'inference' })]),
    outlook_and_watch: section('There is no operating outlook for Uranium Finance. Watch the criminal docket, forfeiture orders, victim-claim instructions, asset-distribution records and any verified warning about residual contracts. A legal recovery can improve creditor outcomes without changing the failure classification. Any separately funded exchange using similar code, branding or tokens must receive its own identity, contracts and evidence. Until victims receive distributions, Chaindump should report seized value separately from recovered value.', [claim('The criminal docket and forfeiture process are the material watch items.', ['source:uranium-finance:doj', 'source:uranium-finance:indictment'], 'Current authority process.', { kind: 'inference' }), claim('Victim recovery should count only when value is actually distributed or legally credited.', ['source:uranium-finance:doj', 'source:uranium-finance:seizure-report'], 'Seizure and victim-contact distinction.', { kind: 'inference' }), claim('No reviewed evidence supports a Uranium Finance revival.', ['source:uranium-finance:doj', 'source:uranium-finance:coindesk'], 'Closure with no successor record.', { kind: 'unknown' })]),
  },
  metrics: [metric('first-exploit-loss', 'exploit_loss', 'First exploit amount alleged', 1400000, ['source:uranium-finance:doj', 'source:uranium-finance:indictment'], 'Indictment allegation for the April 8 incident.', { asOf: '2021-04-08', window: 'incident estimate', qualityFlags: ['indictment_allegation', 'not_final_finding'] }), metric('second-exploit-loss-authority', 'exploit_loss', 'Second exploit amount alleged', 53300000, ['source:uranium-finance:doj', 'source:uranium-finance:indictment'], 'Indictment allegation across 26 pools.', { asOf: '2021-04-28', window: 'incident estimate', qualityFlags: ['indictment_allegation', 'not_final_finding'] }), metric('second-exploit-loss-contemporary', 'exploit_loss', 'Second exploit contemporary estimate', 50000000, ['source:uranium-finance:coindesk', 'source:uranium-finance:halborn', 'source:uranium-finance:theblock'], 'Rounded contemporary independent estimate; not additive to the authority estimate.', { asOf: '2021-04-28', window: 'incident estimate', qualityFlags: ['rounded_estimate', 'same_incident_as_authority_measure'] }), metric('assets-seized', 'exploit_recovery', 'Assets seized, not distributed', 31000000, ['source:uranium-finance:doj', 'source:uranium-finance:seizure-report'], 'Value at February 24, 2025 seizure; not treated as victim payment.', { asOf: '2025-02-24', window: 'seizure-date value', qualityFlags: ['seized_not_distributed', 'not_final_recovery'] })],
  events: [event('first-exploit', 'exploit', '2021-04-08', 'A reward-logic exploit allegedly extracted about $1.4 million; criminal attribution remains unproven.', ['source:uranium-finance:doj', 'source:uranium-finance:indictment'], 'Authority allegations with presumption-of-innocence caveat.'), event('fatal-exploit', 'exploit_and_closure', '2021-04-28', 'The V2 invariant error was exploited across 26 pools and Uranium Finance shut down.', ['source:uranium-finance:doj', 'source:uranium-finance:coindesk', 'source:uranium-finance:halborn', 'source:uranium-finance:attack-tx'], 'Authority, independent and onchain records.')],
  feature: { lifecycle: 'dead', operating_model: 'Closed BNB Chain constant-product AMM and yield farm.', product_cohort: 'single_chain_spot_amm_and_yield_farm', custody_model: 'non_custodial', primary_chain: 'BNB Chain', chains: ['BNB Chain'], token_status: 'launched', token_symbol: 'U92', token_launch_date: null, token_launch_timing: 'post_product', token_strategy: 'farming_incentive_token_with_unverified_current_rights', token_source_url: 'https://www.theblock.co/amp/post/103076/binance-smart-chain-defi-uranium-finance-exploited-lost-50-million', metric_type: 'exploit_loss', metric_unit: 'usd', metric_window: 'incident_estimate', metric_as_of: '2021-04-28', metric_observed_at: OBSERVED_AT, comparability_key: 'dex|single_chain_spot_amm|exploit_loss|usd|incident_estimate' },
};

const specs = [spookyswap, spiritswap, uranium];


export const document = {
  schema: 'chaindump-dex-wave-h-v1',
  research_as_of: AS_OF,
  generated_migration: '0089_dex_wave_h_profiles.sql',
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
  return `INSERT INTO _dex_wave_h_profiles_0089 (
  target_table, slug, canonical_profile, feature
) VALUES (${values.join(', ')});`;
}

export function renderMigration(value = document) {
  const stagingStatements = value.cases.map(renderStagingInsert);
  const migration = `-- Three current, source-linked DEX profiles assembled and source-checked ${AS_OF}.
-- Claims remain pending human review. Legacy case fields and source arrays are preserved.

DROP TABLE IF EXISTS _dex_wave_h_profiles_0089;

CREATE TABLE _dex_wave_h_profiles_0089 (
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
FROM _dex_wave_h_profiles_0089 AS staged
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
FROM _dex_wave_h_profiles_0089 AS staged
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
FROM _dex_wave_h_profiles_0089 AS staged
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
FROM _dex_wave_h_profiles_0089
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

DROP TABLE _dex_wave_h_profiles_0089;
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

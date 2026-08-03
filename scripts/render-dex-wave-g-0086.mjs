#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYSIS_SECTION_KEYS, validateEntityProfile } from '../src/lib/entity-profile.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(root, 'docs/dex-wave-g-profiles-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0086_dex_wave_g_profiles.sql');
const AS_OF = '2026-08-03';
const ACCESSED_AT = '2026-08-03T19:18:00Z';
const OBSERVED_AT = '2026-08-03T19:12:00Z';
const NEXT_REVIEW_AT = '2026-08-10T19:18:00Z';
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

const meteoraSources = [
  source('meteora', 'launch-guide', 'Meteora Launch Guide', 'https://launch.meteora.ag/', 'Meteora', { locator: 'Current DLMM, DAMM and dynamic-bonding-curve launch-pool capabilities and fee controls.' }),
  source('meteora', 'tokenomics', 'Meteora TGE and tokenomics', 'https://met.meteora.ag/', 'Meteora', { locator: 'One-billion MET supply, distribution buckets and user distribution options.' }),
  source('meteora', 'mica', 'MET MiCA white paper', 'https://static.meteora.ag/whitepaper/mica.pdf', 'Meteora', { tier: 'A', locator: 'Q4 2025 TGE plan, initial circulating supply and 2026 utility roadmap.' }),
  source('meteora', 'stimulus', 'Meteora LP Stimulus Season 2', 'https://proposals.meteora.ag/t/meteora-lp-stimulus-season-2/3357', 'Meteora Governance', { publishedAt: '2026-07-20', locator: 'Season 2 fee-based points, date range and 20-million-MET allocation.' }),
  source('meteora', 'ir', 'Meteora investor relations', 'https://ir.meteora.ag/', 'Meteora', { locator: 'Current operator treasury, buyback and reporting directory.' }),
  source('meteora', 'q1-report', 'Meteora Q1 2026 Token Holder Report', 'https://ir.meteora.ag/assets/Meteora_Q1_2026_Token_Holder_Report.pdf', 'Meteora', { publishedAt: '2026-04-30', tier: 'A', locator: 'Operator-reported revenue, expense, treasury and token-holder figures for Q1 2026.' }),
  source('meteora', 'volume', 'Meteora DEX volume API', 'https://api.llama.fi/summary/dexs/meteora?dataType=dailyVolume', 'DefiLlama', { role: 'independent', locator: 'Parent-protocol total24h, total7d, total30d and totalAllTime across named Meteora DEX products.' }),
  source('meteora', 'tvl', 'Meteora DLMM TVL API', 'https://api.llama.fi/protocol/meteora-dlmm', 'DefiLlama', { role: 'independent', locator: 'Current and historical DLMM-only totalLiquidityUSD series.' }),
  source('meteora', 'fees', 'Meteora fees API', 'https://api.llama.fi/summary/fees/meteora?dataType=dailyFees', 'DefiLlama', { role: 'independent', locator: 'Current gross user-fee series for the parent protocol.' }),
  source('meteora', 'revenue', 'Meteora protocol revenue API', 'https://api.llama.fi/summary/fees/meteora?dataType=dailyRevenue', 'DefiLlama', { role: 'independent', locator: 'Current adapter-defined protocol-revenue series for the parent protocol.' }),
  source('meteora', 'platform-launch', 'Meteora Platform Launch', 'https://meteoraag.medium.com/meteora-platform-launch-7defbc562f18', 'Meteora', { publishedAt: '2023-02-23', locator: 'Operator history of the Mercurial reset after the FTX and Alameda collapse.' }),
];

const dodoSources = [
  source('dodo-amm', 'overview', 'What is DODO?', 'https://docs.dodoex.io/en/home/what-is-dodo', 'DODO', { locator: 'Current PMM versions, EVM-chain coverage, DODOX and product-tooling description.' }),
  source('dodo-amm', 'pmm', 'PMM in Details', 'https://docs.dodoex.io/en/product/pmm-algorithm/details-about-pmm', 'DODO', { locator: 'Guide price, inventory, slippage factor and PMM curve behavior.' }),
  source('dodo-amm', 'smarttrade', 'SmartTrade routing', 'https://docs-next.dodoex.io/en/developer/developers-portal/api/smart-trade/index', 'DODO', { locator: 'Routing across DODO and external pools, including split orders.' }),
  source('dodo-amm', 'dashboard', 'DODO dashboard data definitions', 'https://docs.dodoex.io/en/developer/data', 'DODO', { locator: 'Onchain metric definitions and explicit distinction between native and external-pool flow.' }),
  source('dodo-amm', 'token', 'DODO Token', 'https://docs.dodoex.io/en/home/token-economy', 'DODO', { locator: 'One-billion supply, allocation, multichain mapping, vDODO and documented revenue distribution.' }),
  source('dodo-amm', 'security', 'DODO security audits', 'https://docs.dodoex.io/en/home/security', 'DODO', { locator: 'Version-scoped audit and bug-bounty inventory.' }),
  source('dodo-amm', 'volume', 'DODO AMM DEX volume API', 'https://api.llama.fi/summary/dexs/dodo-amm?dataType=dailyVolume', 'DefiLlama', { role: 'independent', locator: 'Native AMM total24h, total7d, total30d and totalAllTime.' }),
  source('dodo-amm', 'aggregator', 'DODO aggregator volume API', 'https://api.llama.fi/summary/aggregators/dodo?dataType=dailyVolume', 'DefiLlama', { role: 'independent', locator: 'Separately scoped routed-volume series; not additive to native or underlying DEX volume.' }),
  source('dodo-amm', 'tvl', 'DODO AMM TVL API', 'https://api.llama.fi/protocol/dodo-amm', 'DefiLlama', { role: 'independent', locator: 'Current multichain AMM totalLiquidityUSD and historical series.' }),
  source('dodo-amm', 'fees', 'DODO fees API', 'https://api.llama.fi/summary/fees/dodo?dataType=dailyFees', 'DefiLlama', { role: 'independent', locator: 'Current fee-adapter observations.' }),
  source('dodo-amm', 'crime-report', 'Cryptocurrency Crime and AML Report', 'https://info.ciphertrace.com/hubfs/CAML%20Reports/CipherTrace%20Cryptocurrency%20Crime%20and%20Anti-Money%20Laundering%20Report%20-%20May%202021.pdf', 'CipherTrace', { publishedAt: '2021-05-13', tier: 'A', role: 'independent', locator: 'Independent 2021 incident summary and reported loss.' }),
];

const platypusSources = [
  source('platypus-finance', 'recovery', 'Update on recovery efforts after the exploitation', 'https://medium.com/platypus-finance/update-on-recovery-efforts-after-the-exploitation-a8f64acd5aa5', 'Platypus Finance', { publishedAt: '2023-02-23', locator: 'Three February attacks, $9.19 million total, recovery actions and minimum-compensation plan.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('platypus-finance', 'immunefi', 'Hack Analysis: Platypus Finance', 'https://medium.com/immunefi/hack-analysis-platypus-finance-february-2023-d11fce37d861', 'Immunefi', { publishedAt: '2023-02-17', role: 'independent', locator: 'Independent technical reconstruction of the February emergency-withdraw and USP solvency failure.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('platypus-finance', 'recap', 'Platypus recap: the 2022–2023 transition', 'https://medium.com/platypus-finance/platypus-recap-the-2022-2023-transition-503ca5483076', 'Platypus Finance', { publishedAt: '2023-01-18', locator: 'Operator history of single-sided pools, vePTP and USP product coupling.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('platypus-finance', 'october-analysis', 'Analysis of the attack behind Platypus Finance', 'https://www.sharkteam.org/report/analysis/20231021001A_en.pdf', 'SharkTeam', { publishedAt: '2023-10-21', tier: 'A', role: 'independent', locator: 'Independent October attack reconstruction, affected pools and initial recoveries.' }),
  source('platypus-finance', 'october-recovery', 'Platypus Finance recovers 90% of assets lost in exploit', 'https://cointelegraph.com/news/platypus-finance-recovers-90-percent-assets-lost-exploit', 'Cointelegraph', { publishedAt: '2023-10-17', role: 'independent', locator: 'Reports the operator announcement that over 90% of October assets were returned and the net loss was 18,000 AVAX.' }),
  source('platypus-finance', 'trial', 'Platypus defendants acquitted in Paris criminal trial', 'https://www.leparisien.fr/faits-divers/accuse-davoir-vole-des-cryptomonnaies-un-hackeur-ethique-relaxe-au-terme-du-premier-proces-du-genre-en-france-01-12-2023-XUSP24FXIVBVBD5UK6J365R4VE.php', 'Le Parisien', { publishedAt: '2023-12-01', role: 'independent', locator: 'Contemporary account of the acquittals and trial court reasoning.', directHttpStatus: 403, accessMethod: 'browser_or_paywalled_page' }),
  source('platypus-finance', 'appeal-filed', 'Paris prosecutor appeals Platypus acquittal', 'https://incyber.org/article/__trashed-2/', 'InCyber News', { publishedAt: '2023-12-14', role: 'independent', locator: 'Reports that the Paris prosecutor appealed the December 2023 acquittal.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('platypus-finance', 'appeal-result', 'Paris appeal court confirms Platypus first-instance ruling', 'https://www.avocats-aubourg-bastiani.com/finance-decentralisee-la-cour-dappel-de-paris-confirme-le-jugement-de-premiere-instance-dans-laffaire-iplatypus-i/', 'Aubourg & Bastiani', { publishedAt: '2024-12-06', role: 'independent', locator: 'Counsel report that the Paris Court of Appeal confirmed the first-instance result; no higher-court result was located.' }),
  source('platypus-finance', 'volume', 'Platypus Finance DEX volume API', 'https://api.llama.fi/summary/dexs/platypus-finance?dataType=dailyVolume', 'DefiLlama', { role: 'independent', locator: 'Current low-volume adapter series and deadUrl flag.' }),
  source('platypus-finance', 'tvl', 'Platypus Finance TVL API', 'https://api.llama.fi/protocol/platypus-finance', 'DefiLlama', { role: 'independent', locator: 'Current residual balances, historical peak and deadUrl flag.' }),
];

const saddleSources = [
  source('saddle-finance', 'about', 'About Saddle', 'https://docs.saddle.finance/', 'Saddle Finance', { locator: 'Operator notice that SIP-54 wound down the protocol, paused pools and dissolved the multisig.' }),
  source('saddle-finance', 'faq', 'Saddle FAQ', 'https://docs.saddle.finance/saddle-faq', 'Saddle Finance', { locator: 'Stable-asset AMM design, guarded launch and SDL supply and vesting terms.' }),
  source('saddle-finance', 'vesdl', 'veSDL documentation', 'https://docs.saddle.finance/vesdl-vote-escrowed-sdl', 'Saddle Finance', { locator: 'Gauge voting, emissions, fee allocation and veSDL locking rules.' }),
  source('saddle-finance', 'governance', 'Saddle governance', 'https://docs.saddle.finance/governance', 'Saddle Finance', { locator: 'SIP governance process and voting framework.' }),
  source('saddle-finance', 'winddown-news', 'Venture-backed Saddle Finance proposes wind-down', 'https://www.coindesk.com/tech/2023/08/08/venture-backed-saddle-finance-proposes-wind-down-dissolution', 'CoinDesk', { publishedAt: '2023-08-08', role: 'independent', locator: 'Independent account of the wind-down rationale, treasury proposal and earlier funding.' }),
  source('saddle-finance', 'vote', 'Saddle governance record', 'https://defillama.com/governance/saddle', 'DefiLlama', { role: 'independent', locator: 'SIP-54 dates, 8.13 million votes and 99.78% support.', directHttpStatus: 403, accessMethod: 'browser_rendered_page' }),
  source('saddle-finance', 'ragequit', 'FIP-280 Saddle L2D4 gauge ragequit', 'https://gov.frax.finance/t/fip-280-implement-saddle-l2d4-gauge-ragequit-function-with-20-fee/2528', 'Frax Governance', { publishedAt: '2023-08-24', role: 'independent', locator: 'Partner-governance response to the Saddle sunset and organized gauge exit path.' }),
  source('saddle-finance', 'audit', 'Saddle contracts audit', 'https://www.openzeppelin.com/news/saddle-contracts-audit', 'OpenZeppelin', { publishedAt: '2021-01-19', tier: 'A', role: 'independent', locator: 'Independent review of specified Saddle contracts; not an economic viability opinion.' }),
  source('saddle-finance', 'volume', 'Saddle Finance DEX volume API', 'https://api.llama.fi/summary/dexs/saddle-finance?dataType=dailyVolume', 'DefiLlama', { role: 'independent', locator: 'Current residual volume series and deadUrl flag.' }),
  source('saddle-finance', 'tvl', 'Saddle Finance TVL API', 'https://api.llama.fi/protocol/saddle-finance', 'DefiLlama', { role: 'independent', locator: 'Current residual balances, historical peak and deadUrl flag.' }),
];

const solidlySources = [
  source('solidly', 'product-launch', 'Fantom General Update: February 14, 2022', 'https://blog.fantom.foundation/fantom-general-update-february-14-2022/', 'Fantom Foundation', { publishedAt: '2022-02-14', locator: 'Dated Foundation record that the original Fantom product launched on February 10, before SOLID began trading.' }),
  source('solidly', 'fantom-launch', 'Fantom General Update: March 1, 2022', 'https://blog.fantom.foundation/fantom-general-update-march-1-2022/', 'Fantom Foundation', { publishedAt: '2022-03-01', locator: 'February 24 emissions launch, veNFT voting and more than $1.6 billion first-day TVL.' }),
  source('solidly', 'audit-status', 'Audit and Release Status', 'https://andrecronje.info/public-record/audit-release-status/', 'Andre Cronje', { publishedAt: '2026-06-24', locator: 'Historical-production status and version-specific original Solidly V1 audit record.' }),
  source('solidly', 'departure', 'Dozens of tokens tumble as Andre Cronje calls it quits', 'https://www.coindesk.com/business/2022/03/06/dozens-of-tokens-tumble-as-prolific-developer-andre-cronje-calls-it-quits', 'CoinDesk', { publishedAt: '2022-03-06', role: 'independent', locator: 'Contemporary report of the developer-departure announcement and immediate market reaction.' }),
  source('solidly', 'departure-2', 'YFI, FTM tank after Andre Cronje and Anton Nell leave crypto', 'https://decrypt.co/94483/yfi-ftm-tank-after-andre-cronje-anton-nell-claim-theyre-leaving-crypto', 'Decrypt', { publishedAt: '2022-03-06', role: 'independent', locator: 'Contemporary report of launch context, service termination announcement and token reaction.' }),
  source('solidly', 'theblock-research', 'The State of Fantom', 'https://www.tbstat.com/wp/uploads/2022/05/May_Latest_Research_Analysis_4-May.pdf', 'The Block Research', { publishedAt: '2022-05-04', tier: 'A', role: 'independent', locator: 'Post-launch analysis of Fantom TVL, SOLID emissions and the developer-departure shock.' }),
  source('solidly', 'velodrome-history', 'Proposal to launch a VELO Fed', 'https://forum.inverse.finance/t/proposal-to-launch-a-velo-fed/151/1', 'Inverse Finance Governance', { publishedAt: '2022-09-12', role: 'independent', locator: 'Contemporary successor description that explicitly treats original Solidly as failed and Velodrome as modified code.' }),
  source('solidly', 'equalizer', 'Equalizer introduction', 'https://docs.equalizer.exchange/', 'Equalizer', { role: 'independent', locator: 'Successor documentation identifying Solidly as the source concept and describing material modifications.' }),
  source('solidly', 'volume', 'Original Solidly DEX volume API', 'https://api.llama.fi/summary/dexs/solidly?dataType=dailyVolume', 'DefiLlama', { role: 'independent', locator: 'Fantom-scoped current and historical spot-volume adapter series.' }),
  source('solidly', 'tvl', 'Original Solidly TVL API', 'https://api.llama.fi/protocol/solidly', 'DefiLlama', { role: 'independent', locator: 'Fantom-scoped current residual balance and historical peak series.' }),
];

const meteora = {
  slug: 'meteora',
  name: 'Meteora',
  aliases: ['Meteora AG', 'Mercurial successor platform'],
  table: 'successful_exchanges',
  operatingState: 'operating',
  outcome: 'successful_cyclical',
  outcomeConfidence: 'high',
  qualityConfidence: 'high',
  classification: {
    subtype: 'Solana liquidity and token-launch AMM suite',
    tags: ['dlmm', 'concentrated_liquidity', 'token_launch', 'single_chain', 'spot_amm'],
    chains: ['Solana'],
    jurisdictions: [],
  },
  sources: meteoraSources,
  statusSources: ['source:meteora:volume', 'source:meteora:fees', 'source:meteora:ir'],
  statusLocator: 'Current DEX, fee and operator-reporting surfaces show an operating protocol.',
  outcomeSources: ['source:meteora:volume', 'source:meteora:tvl', 'source:meteora:fees', 'source:meteora:launch-guide', 'source:meteora:stimulus'],
  outcomeLocator: 'Current multi-billion-dollar monthly volume and material DLMM liquidity support success, while the historical drawdown and incentive program support a cyclical qualifier.',
  identityBoundary: 'This profile covers Meteora’s Solana DEX and liquidity-launch products. It does not count all Solana DEX activity, Jupiter-routed flow, partner-launchpad demand or the former Mercurial product as current Meteora venue activity.',
  methodologyNotes: [
    'Parent-protocol volume and fees include named Meteora products; DLMM TVL is narrower and is labeled accordingly.',
    'Solana growth, launch cycles and MET rewards are contextual drivers, not measured causal attribution.',
  ],
  unknowns: [
    'How much trading remains after individual token-launch cohorts and rewards mature?',
    'What share of volume is direct versus routed through Jupiter or other interfaces?',
    'What are audited protocol-wide expenses, liabilities and net income outside operator reports?',
    'How concentrated are MET voting, staking and treasury-control rights after delegation?',
  ],
  unsourcedFields: ['Retained traders by cohort', 'Incentive-adjusted LP returns', 'Audited protocol-wide profit', 'Complete MET beneficial ownership'],
  sections: {
    what_it_is: section(
      'Meteora is a Solana liquidity platform rather than one simple swap pool. Its DLMM puts liquidity into price bins and can change fees with volatility; DAMM pools provide broader automated-market-maker designs; and Dynamic Bonding Curve and launch pools help a token move from sale or price discovery into tradeable liquidity. Traders use the resulting pools, while liquidity providers choose ranges, assets and fee exposure. A Meteora pool is not the whole Solana market, and routing through a pool does not mean Meteora owns the trader relationship.',
      [
        claim('Meteora operates DLMM, DAMM and token-launch liquidity products on Solana.', ['source:meteora:launch-guide', 'source:meteora:volume'], 'Current product guide and parent-protocol adapter.'),
        claim('DLMM liquidity is allocated in price bins and exposes LPs to active-range choices.', ['source:meteora:launch-guide', 'source:meteora:tvl'], 'Current launch and DLMM descriptions.'),
        claim('Meteora pool activity must not be treated as all Solana DEX or router activity.', ['source:meteora:volume', 'source:meteora:launch-guide'], 'The adapter identifies named child products and the guide identifies partner integrations.', { kind: 'inference' }),
      ],
    ),
    what_happened: section(
      'Meteora grew out of Mercurial after the FTX and Alameda collapse damaged that project’s funding and token context. The replacement platform focused on dynamic liquidity and then became important infrastructure for Solana token launches. MET arrived later, in October 2025, after the exchange products already had users. At this review the DefiLlama parent adapter reported $73.50 million of 24-hour spot volume, $3.46 billion over 30 days and $11.27 million of 30-day fees. DLMM alone held $172.30 million, far below its $1.47 billion January 2025 peak.',
      [
        claim('Meteora was introduced as a reset from Mercurial after the FTX and Alameda collapse.', ['source:meteora:platform-launch'], 'Operator launch history.'),
        claim('MET launched after Meteora’s exchange and launch-liquidity products were operating.', ['source:meteora:mica', 'source:meteora:tokenomics'], 'The white paper places the TGE in Q4 2025; platform history predates it.'),
        claim('Current volume and fees remain material while DLMM TVL is far below its January 2025 peak.', ['source:meteora:volume', 'source:meteora:fees', 'source:meteora:tvl'], 'Replayed current and historical provider series.'),
      ],
    ),
    why_this_outcome: section(
      'The best-supported explanation combines useful market design with Solana distribution and a launch boom. Meteora gave active LPs fine control over ranges and variable fees, while launch teams could move new tokens through bonding curves into DAMM or DLMM pools. Wallets and routers could then send traders into those pools without requiring a direct Meteora visit. Solana’s memecoin and token-launch cycle expanded that funnel, and the year-long MET stimulus paid users based on eligible fees. These facts explain a plausible flywheel; they do not tell us how much demand was organic, incentive-driven or simply borrowed from Solana’s boom.',
      [
        claim('Meteora combined specialized liquidity design with token-launch distribution on Solana.', ['source:meteora:launch-guide', 'source:meteora:volume'], 'Current product design and observed activity.', { kind: 'inference', confidence: 'medium' }),
        claim('LP Stimulus Season 2 rewarded eligible fee generation with a 20-million-MET allocation.', ['source:meteora:stimulus'], 'Dated governance methodology.'),
        claim('Public evidence cannot separate Solana launch demand from product quality and MET incentives.', ['source:meteora:stimulus', 'source:meteora:volume', 'source:meteora:tvl'], 'Mechanisms and outcomes are observed without causal decomposition.', { kind: 'unknown' }),
      ],
    ),
    strategic_choices: section(
      'Meteora chose to stay Solana-native, build several pool types and sell infrastructure to token issuers as well as traders. It also chose flexible launch controls—vesting, locking, anti-sniper fees and rate limits—instead of one fixed launch recipe. After building product adoption without a token, it launched MET with a large community and ecosystem allocation and later tied Season 2 rewards to eligible fees rather than raw TVL. Those choices strengthened distribution and reduced simple TVL farming, but they also tied the business to one chain, complicated LP decisions and made launch quality partly dependent on outside token teams.',
      [
        claim('Meteora chose a Solana-only product and distribution strategy.', ['source:meteora:launch-guide', 'source:meteora:volume'], 'Product and adapter chain scope.'),
        claim('Launch products expose configurable vesting, locking and anti-sniper controls.', ['source:meteora:launch-guide'], 'Current launch guide.'),
        claim('Season 2 moved rewards to eligible fee generation and excluded raw TVL scoring.', ['source:meteora:stimulus'], 'Governance methodology and exclusions.'),
      ],
    ),
    operating_model: section(
      'Traders pay swap fees to use liquidity supplied by users. DLMM providers choose bins and strategies; positions outside the active price do not execute, and volatile or low-quality tokens can leave an LP holding the weaker asset. DAMM and launch products use different curves and fee settings. DefiLlama’s $255,232 latest daily fee figure is gross user fees, while its $37,527 protocol-revenue figure is the adapter-defined share attributed to the protocol. Neither is audited company profit, and parent-protocol numbers should not be divided by DLMM-only TVL without labeling the mismatch.',
      [
        claim('Liquidity providers, rather than Meteora, supply the trading inventory in AMM pools.', ['source:meteora:launch-guide', 'source:meteora:tvl'], 'Pool design and TVL methodology.'),
        claim('DLMM range and asset selection create position-management and adverse-asset risk for LPs.', ['source:meteora:launch-guide'], 'Current product controls.', { kind: 'inference', confidence: 'medium' }),
        claim('Gross fees and adapter-defined protocol revenue are not audited net profit.', ['source:meteora:fees', 'source:meteora:revenue', 'source:meteora:q1-report'], 'Different measurement scopes and operator financial report.', { kind: 'inference' }),
      ],
    ),
    token_and_value_capture: section(
      'Meteora is a clear post-product token case: the venue operated before MET’s Q4 2025 generation event. The fixed headline supply is one billion MET. The launch materials allocated large blocks to Mercurial stakeholders, LP stimulus, ecosystem reserves and the team, and let some recipients take tokens or a MET liquidity position. MET now supports staking and incentive programs, while operator reporting describes buybacks and treasury assets. That is an economic link, not equity or a guaranteed cash claim. Returns depend on program rules, protocol revenue, treasury discretion, dilution and whether fee-producing activity survives rewards.',
      [
        claim('MET was launched post-product with a one-billion-token headline supply.', ['source:meteora:mica', 'source:meteora:tokenomics'], 'TGE plan and current tokenomics.'),
        claim('MET allocations include legacy Mercurial stakeholders, LP stimulus, ecosystem reserves and the team.', ['source:meteora:tokenomics'], 'Current allocation table.'),
        claim('Operator-reported buybacks and staking do not create a guaranteed legal claim on profit.', ['source:meteora:ir', 'source:meteora:q1-report', 'source:meteora:stimulus'], 'Current program and reporting materials.', { kind: 'inference' }),
      ],
    ),
    counterfactual: section(
      'A narrower DLMM-only strategy would have been easier to explain and audit, but it would have surrendered the token-launch funnel that distributed Meteora pools across Solana. A multi-chain strategy would reduce Solana dependence but fragment liquidity and require new engineering. Launching MET earlier could have funded growth sooner, yet it would make product-market fit harder to distinguish from emissions. The strongest forward test is not a hypothetical: compare mature pools after incentives end with new rewarded pools, using fees, depth and retained traders rather than launch-day volume.',
      [
        claim('A DLMM-only product could reduce complexity while losing launch-driven distribution.', ['source:meteora:launch-guide', 'source:meteora:volume'], 'Observed breadth supports the trade-off but not a controlled result.', { kind: 'inference', confidence: 'medium' }),
        claim('Earlier token issuance would make organic adoption harder to isolate from subsidies.', ['source:meteora:platform-launch', 'source:meteora:mica', 'source:meteora:stimulus'], 'Product preceded the token and incentives later changed.', { kind: 'inference', confidence: 'medium' }),
        claim('No reviewed source proves which alternative strategy would have produced better durable liquidity.', ['source:meteora:volume', 'source:meteora:tvl', 'source:meteora:stimulus'], 'No controlled comparison is published.', { kind: 'unknown' }),
      ],
    ),
    risks_and_unknowns: section(
      'The immediate risks are smart-contract failure, malicious or broken tokens, concentrated-liquidity losses, inactive ranges, partner-launch failures and Solana dependence. A launch pool can generate large turnover while leaving little durable liquidity. MET adds treasury, allocation, staking and incentive-policy risk; audits and operator reports reduce uncertainty but do not eliminate it. Unknowns include retained traders, fee revenue after rewards, LP returns after losses, beneficial ownership, protocol-wide liabilities and how much order flow is controlled by outside routers.',
      [
        claim('Meteora combines smart-contract, LP range, token-quality and single-chain risks.', ['source:meteora:launch-guide', 'source:meteora:tvl', 'source:meteora:mica'], 'Product mechanics and chain scope.', { kind: 'inference' }),
        claim('Launch turnover does not by itself establish durable liquidity or retained traders.', ['source:meteora:volume', 'source:meteora:stimulus'], 'Volume and incentive series lack user-retention fields.', { kind: 'inference' }),
        claim('Retained users, incentive-adjusted LP returns and complete beneficial ownership remain unknown.', ['source:meteora:q1-report', 'source:meteora:ir', 'source:meteora:volume'], 'Reviewed public materials do not supply those fields.', { kind: 'unknown' }),
      ],
    ),
    lifecycle: section(
      'Meteora began as a 2023 reset from Mercurial, expanded from liquidity products into a broad Solana launch stack, and reached a DLMM TVL peak of about $1.47 billion on Jan. 20, 2025 during an exceptional Solana trading cycle. MET launched in Q4 2025, after product adoption. Season 2 incentives then ran from July 2025 through June 2026 and rewarded eligible fees. The protocol remains large, fee-producing and funded, but current DLMM TVL is roughly 88% below peak. The right label is successful and cyclical, not failed and not permanently dominant.',
      [
        claim('Meteora followed Mercurial and expanded into launch and liquidity infrastructure.', ['source:meteora:platform-launch', 'source:meteora:launch-guide'], 'Operator product history.'),
        claim('DLMM TVL peaked near $1.47 billion in January 2025 and is now materially lower.', ['source:meteora:tvl'], 'Historical totalLiquidityUSD series.'),
        claim('Season 2 ran through June 2026 and the venue remained active afterward.', ['source:meteora:stimulus', 'source:meteora:volume', 'source:meteora:fees'], 'Dated incentive record and current activity.'),
      ],
    ),
    outlook_and_watch: section(
      'The outlook is positive but cycle-sensitive. Watch 30-day volume, DLMM TVL, gross fees, protocol revenue and the gap between them as rewards change. More important, watch mature-pool depth, repeat traders, LP returns after price movement, partner-launch survival and MET issued per dollar of organic fee revenue. A durable case strengthens if mature pools keep depth and fees without another token-launch surge. It weakens if activity follows incentives down, treasury spending outruns revenue or growth is concentrated in short-lived launches.',
      [
        claim('Current volume, fees and liquidity support a positive operating outlook.', ['source:meteora:volume', 'source:meteora:fees', 'source:meteora:tvl'], 'Replayed current metrics.'),
        claim('Mature-pool retention and incentive-adjusted fees are stronger tests than launch-day volume.', ['source:meteora:stimulus', 'source:meteora:launch-guide', 'source:meteora:volume'], 'Incentive and launch mechanisms motivate the analyst test.', { kind: 'inference' }),
        claim('Future activity after the completed Season 2 allocation is not yet established.', ['source:meteora:stimulus', 'source:meteora:volume'], 'The reward period ended recently relative to the review date.', { kind: 'unknown' }),
      ],
    ),
  },
  metrics: [
    metric('spot-volume-24h', 'spot_volume', 'Parent-protocol spot volume, 24h', 73502361, ['source:meteora:volume'], 'DefiLlama parent-protocol total24h.', { scope: 'Meteora named DEX products' }),
    metric('spot-volume-30d', 'spot_volume', 'Parent-protocol spot volume, 30d', 3464826980, ['source:meteora:volume'], 'DefiLlama parent-protocol total30d.', { window: 'rolling 30 days', scope: 'Meteora named DEX products' }),
    metric('tvl-latest', 'tvl', 'Meteora DLMM TVL', 172295643, ['source:meteora:tvl'], 'Latest totalLiquidityUSD in the DLMM protocol series.', { scope: 'Meteora DLMM only' }),
    metric('tvl-peak', 'tvl', 'Meteora DLMM peak TVL', 1465099004, ['source:meteora:tvl'], 'Maximum totalLiquidityUSD in the DLMM series, dated 2025-01-20.', { asOf: '2025-01-20', window: 'historical maximum', scope: 'Meteora DLMM only', qualityFlags: ['historical_not_current'] }),
    metric('fees-30d', 'fees', 'Parent-protocol gross fees, 30d', 11266125, ['source:meteora:fees'], 'DefiLlama total30d dailyFees.', { window: 'rolling 30 days', scope: 'Meteora parent protocol' }),
    metric('revenue-30d', 'protocol_revenue', 'Parent-protocol revenue, 30d', 1602939, ['source:meteora:revenue'], 'DefiLlama total30d dailyRevenue.', { window: 'rolling 30 days', scope: 'Meteora parent protocol' }),
  ],
  events: [
    event('platform-reset', 'relaunch', '2023-02-23', 'Meteora presented a new platform and token plan after the Mercurial project was damaged by the FTX and Alameda collapse.', ['source:meteora:platform-launch'], 'Dated operator launch post.'),
    event('met-tge', 'token_launch', '2025-10-23', 'MET launched after Meteora’s core exchange and liquidity products were already operating.', ['source:meteora:mica', 'source:meteora:tokenomics'], 'Q4 2025 TGE record and current token distribution page; exact day retained from the official TGE surface.'),
  ],
  feature: {
    lifecycle: 'successful',
    operating_model: 'Solana DLMM, AMM and token-launch liquidity suite.',
    product_cohort: 'single_chain_spot_and_launch_liquidity',
    custody_model: 'non_custodial',
    primary_chain: 'Solana',
    chains: ['Solana'],
    token_status: 'launched',
    token_symbol: 'MET',
    token_launch_date: '2025-10-23',
    token_launch_timing: 'post_product',
    token_strategy: 'staking_ecosystem_incentives_treasury_and_buybacks',
    token_source_url: 'https://met.meteora.ag/',
    metric_type: 'spot_volume_24h',
    metric_unit: 'usd',
    metric_window: 'rolling_24h',
    metric_as_of: AS_OF,
    metric_observed_at: OBSERVED_AT,
    comparability_key: 'dex|spot_amm_suite|spot_volume|usd|rolling_24h',
  },
};

const dodo = {
  slug: 'dodo-amm',
  name: 'DODO AMM',
  aliases: ['DODO', 'DODO Exchange'],
  table: 'mid_exchanges',
  operatingState: 'operating',
  outcome: 'operating_middling',
  outcomeConfidence: 'high',
  qualityConfidence: 'high',
  classification: {
    subtype: 'multichain oracle-guided proactive market maker and router',
    tags: ['pmm', 'spot_amm', 'dex_aggregator', 'multichain', 'token_launch'],
    chains: ['Ethereum', 'BNB Chain', 'Arbitrum', 'Base', 'Polygon', 'Avalanche', 'multiple EVM chains'],
    jurisdictions: [],
  },
  sources: dodoSources,
  statusSources: ['source:dodo-amm:volume', 'source:dodo-amm:tvl', 'source:dodo-amm:overview'],
  statusLocator: 'Current native-pool volume and TVL plus maintained product documentation show operation.',
  outcomeSources: ['source:dodo-amm:volume', 'source:dodo-amm:tvl', 'source:dodo-amm:aggregator', 'source:dodo-amm:pmm'],
  outcomeLocator: 'A functioning differentiated product with current flow but TVL far below peak supports middling rather than failed or market-leading.',
  identityBoundary: 'This profile covers DODO-owned AMM pools and separately labels DODO SmartTrade/DODOX routed activity. Routed trades can execute against external venues and must never be added to DODO native volume or underlying DEX volume.',
  methodologyNotes: [
    'Native AMM, aggregator routing, TVL and fees use separate provider series and are never summed.',
    'PMM capital efficiency is a design claim; current public data do not publish comparable slippage or LP return for each pool.',
  ],
  unknowns: [
    'What share of user orders executes entirely in DODO pools versus external liquidity?',
    'What are retained traders and LP returns by PMM version and chain?',
    'How much platform revenue is actually distributed to vDODO holders each month?',
    'What are current team expenses, treasury runway and governance concentration?',
  ],
  unsourcedFields: ['Retained traders', 'Pool-level LP returns', 'Current vDODO distributions', 'Audited operating profit'],
  sections: {
    what_it_is: section(
      'DODO is a non-custodial multichain exchange built around its Proactive Market Maker. A PMM pool uses a guide price, a slippage setting and its current inventory to concentrate quotes near a chosen market price instead of spreading liquidity across one constant-product curve. DODO also runs SmartTrade/DODOX, which can route an order through DODO pools, external exchanges or both. That makes DODO both a liquidity venue and a router, but those are different products and different measurements.',
      [
        claim('DODO operates PMM pools that use guide price, slippage and inventory parameters.', ['source:dodo-amm:pmm', 'source:dodo-amm:overview'], 'Current algorithm and product documentation.'),
        claim('DODO also operates a router that can use external liquidity sources.', ['source:dodo-amm:smarttrade', 'source:dodo-amm:dashboard'], 'Current routing and metric definitions.'),
        claim('Native pool activity and routed activity are separate measurement scopes.', ['source:dodo-amm:dashboard', 'source:dodo-amm:volume', 'source:dodo-amm:aggregator'], 'Operator data definition and separate provider adapters.'),
      ],
    ),
    what_happened: section(
      'DODO launched its first PMM product in 2020, then expanded to new pool types, token issuance tools, V2 and V3, routing and many EVM chains. DODO tokens were released alongside the early product and later gained a vDODO wrapper with governance and documented fee-linked rewards. A March 2021 crowdpooling logic exploit removed about $3.8 million before substantial funds were reportedly returned. The protocol continued. At this review native AMM volume was $11.46 million over 24 hours and $278.28 million over 30 days, with $11.88 million of TVL versus a $451.88 million historical peak.',
      [
        claim('DODO expanded from its 2020 PMM into multiple versions, pool types, routing and multichain deployments.', ['source:dodo-amm:overview', 'source:dodo-amm:pmm'], 'Current product history.'),
        claim('The March 2021 incident affected a V2 crowdpooling implementation and did not close DODO.', ['source:dodo-amm:crime-report', 'source:dodo-amm:security', 'source:dodo-amm:volume'], 'Independent incident report, audit chronology and current activity.'),
        claim('Current TVL is far below its January 2022 historical peak while native volume remains material.', ['source:dodo-amm:tvl', 'source:dodo-amm:volume'], 'Replayed provider series.'),
      ],
    ),
    why_this_outcome: section(
      'DODO survived because PMM was genuinely differentiated and the team kept shipping pool designs, chains and routing after the 2021 incident. The router lets DODO serve a trader even when its own pools are not best, while its private and customizable pools serve issuers and market makers. The same breadth blurs the moat: routed volume may belong economically to other venues, PMM adds oracle and parameter dependencies, and multichain operations fragment attention. Public evidence explains continued relevance but does not isolate why DODO’s locked liquidity fell so far from peak or why it did not become a category leader.',
      [
        claim('PMM and customizable pools gave DODO a differentiated liquidity product.', ['source:dodo-amm:pmm', 'source:dodo-amm:overview'], 'Documented mechanism and product breadth.', { kind: 'inference', confidence: 'medium' }),
        claim('Routing preserves a trader-facing service even when external pools provide execution.', ['source:dodo-amm:smarttrade', 'source:dodo-amm:dashboard'], 'Current routing behavior.', { kind: 'inference', confidence: 'medium' }),
        claim('Public evidence does not causally explain DODO’s large TVL decline or middling market position.', ['source:dodo-amm:tvl', 'source:dodo-amm:volume', 'source:dodo-amm:aggregator'], 'Observed outcomes lack causal decomposition.', { kind: 'unknown' }),
      ],
    ),
    strategic_choices: section(
      'DODO chose an oracle-guided market maker instead of copying a standard constant-product AMM. It added public, private and customizable pool designs, then built routing that competes for order flow even when another venue supplies the liquidity. It expanded across many EVM chains and mapped one billion DODO tokens across them without changing headline supply. Those choices widened distribution and use cases, but introduced oracle, routing, deployment and bridge complexity. The protocol also kept operating after the 2021 exploit rather than withdrawing the product.',
      [
        claim('DODO chose an oracle-guided PMM as its core differentiation.', ['source:dodo-amm:pmm'], 'Current algorithm specification.'),
        claim('DODO chose to combine owned liquidity with external-liquidity routing.', ['source:dodo-amm:smarttrade', 'source:dodo-amm:dashboard'], 'Current router design.'),
        claim('DODO mapped its fixed headline supply across multiple chains while expanding products.', ['source:dodo-amm:token', 'source:dodo-amm:overview'], 'Current token and product documentation.'),
      ],
    ),
    operating_model: section(
      'In a native DODO pool, liquidity providers deposit assets and the PMM adjusts quotes around its guide price as inventory moves. Traders pay pool fees and LPs carry smart-contract, inventory, oracle and asset risk. In SmartTrade, DODO computes a route that may split across several DODO or outside pools. The current native-volume adapter reported $11.46 million for 24 hours; the separate aggregator adapter reported only $584. They are not additive, because routed flow can overlap underlying DEX volume and each adapter has its own coverage. Fees are gross user payments, not DODO’s audited profit.',
      [
        claim('Native PMM pools use deposited inventory and guide-price mechanics to quote trades.', ['source:dodo-amm:pmm', 'source:dodo-amm:tvl'], 'Algorithm and TVL methodology.'),
        claim('SmartTrade can split one route across DODO and external pools.', ['source:dodo-amm:smarttrade'], 'Current routing documentation.'),
        claim('Native and routed volumes are not additive and fees are not net profit.', ['source:dodo-amm:dashboard', 'source:dodo-amm:volume', 'source:dodo-amm:aggregator', 'source:dodo-amm:fees'], 'Operator data definition and separate provider series.', { kind: 'inference' }),
      ],
    ),
    token_and_value_capture: section(
      'DODO launched at or near the original 2020 product. The maximum supply is one billion, with 60% allocated to community incentives, 16% to investors and 15% to the core team and related contributors. DODO holders can govern and access selected launch allocations. Locking 100 DODO can create one vDODO; current documentation says vDODO receives membership rewards and a share of platform revenue, with 75% of that revenue used to buy DODO and distribute newly minted vDODO and 25% sent to treasury. The rules create a value link, but the reviewed sources do not establish current distribution amounts or net economics after emissions.',
      [
        claim('DODO has a one-billion maximum supply with 60% allocated to community incentives.', ['source:dodo-amm:token'], 'Current allocation table.'),
        claim('vDODO documentation links membership to rewards and a share of platform revenue.', ['source:dodo-amm:token'], 'Current vDODO rules.'),
        claim('Actual current distributions and emissions-adjusted holder returns are not established.', ['source:dodo-amm:token', 'source:dodo-amm:fees'], 'Rules and fee observations do not publish recipient-level net returns.', { kind: 'unknown' }),
      ],
    ),
    counterfactual: section(
      'A standard constant-product AMM would reduce oracle and parameter risk, but erase the product that made DODO distinct. A router-only strategy would reduce pool maintenance while making DODO entirely dependent on outside liquidity and routing margins. A smaller chain footprint could concentrate liquidity and engineering, but surrender distribution in fragmented EVM markets. None was tested as a controlled alternative. The useful test now is whether native PMM pools keep competitive depth, volume and LP returns without relying on routed activity or token rewards.',
      [
        claim('A conventional AMM would reduce PMM-specific risk while removing DODO’s main differentiation.', ['source:dodo-amm:pmm', 'source:dodo-amm:overview'], 'Documented mechanism supports the trade-off.', { kind: 'inference', confidence: 'medium' }),
        claim('A router-only model would depend entirely on outside pools.', ['source:dodo-amm:smarttrade', 'source:dodo-amm:dashboard'], 'Routing mechanics support the dependency.', { kind: 'inference', confidence: 'medium' }),
        claim('No reviewed evidence proves an alternative would have produced better retention or economics.', ['source:dodo-amm:volume', 'source:dodo-amm:tvl'], 'No controlled strategy comparison is published.', { kind: 'unknown' }),
      ],
    ),
    risks_and_unknowns: section(
      'PMM inherits oracle quality, update and parameter risk in addition to ordinary smart-contract, asset and LP inventory risk. Routing adds external contracts, approval surfaces and quote-execution complexity. Many chains add deployment, bridge and governance coordination risk. The 2021 exploit shows that audits do not cover every future component or configuration. Unknowns include native-versus-external route share, retained traders, pool-level slippage, LP performance, current vDODO payouts, governance concentration and audited expenses.',
      [
        claim('PMM adds oracle and parameter risk to ordinary AMM risks.', ['source:dodo-amm:pmm', 'source:dodo-amm:security'], 'Mechanism and version-scoped audit inventory.', { kind: 'inference' }),
        claim('Routing and multichain deployment add external-contract and coordination risk.', ['source:dodo-amm:smarttrade', 'source:dodo-amm:overview', 'source:dodo-amm:token'], 'Current product and token deployment scope.', { kind: 'inference' }),
        claim('Native route share, retained traders, LP returns and current distributions remain unknown.', ['source:dodo-amm:dashboard', 'source:dodo-amm:token', 'source:dodo-amm:volume'], 'Reviewed public materials do not supply those fields.', { kind: 'unknown' }),
      ],
    ),
    lifecycle: section(
      'DODO launched PMM and DODO in 2020, expanded to V2, new pool types and chains, survived the March 2021 crowdpooling exploit, and later added V3 and DODOX routing. TVL peaked near $451.88 million on Jan. 22, 2022. Current TVL is $11.88 million, about 97% below that peak, but the native AMM still processed $278.28 million over 30 days in the reviewed adapter. This is not a dead exchange. It is a durable but diminished product whose router and owned pools must be judged separately.',
      [
        claim('DODO continued operating and shipping after the March 2021 incident.', ['source:dodo-amm:crime-report', 'source:dodo-amm:overview', 'source:dodo-amm:volume'], 'Incident history and current operation.'),
        claim('DODO TVL peaked near $451.88 million in January 2022 and is now about 97% lower.', ['source:dodo-amm:tvl'], 'Historical and current totalLiquidityUSD series.'),
        claim('Current native AMM volume supports operating, while scale supports a middling label.', ['source:dodo-amm:volume', 'source:dodo-amm:tvl'], 'Current activity and liquidity.'),
      ],
    ),
    outlook_and_watch: section(
      'The outlook is stable but not leading. Watch native PMM volume, TVL, fee generation and chain concentration separately from routed volume. The bull case is that PMM V3 and embedded routing keep DODO useful with modest capital; the bear case is that routers source nearly all useful liquidity elsewhere while DODO maintains a wide but thin deployment footprint. Reclassification should depend on native depth, retained traders, LP returns and transparent vDODO distributions, not a combined headline that double-counts routed trades.',
      [
        claim('Current native activity supports continued operation but not market leadership.', ['source:dodo-amm:volume', 'source:dodo-amm:tvl'], 'Current adapter observations.', { kind: 'inference' }),
        claim('Native depth and LP returns are better durability tests than combined routed headlines.', ['source:dodo-amm:dashboard', 'source:dodo-amm:smarttrade', 'source:dodo-amm:aggregator'], 'Routing overlap motivates the analyst test.', { kind: 'inference' }),
        claim('The future balance between owned liquidity and external routing is unresolved.', ['source:dodo-amm:volume', 'source:dodo-amm:aggregator', 'source:dodo-amm:tvl'], 'Current series do not publish order-level route share.', { kind: 'unknown' }),
      ],
    ),
  },
  metrics: [
    metric('native-volume-24h', 'spot_volume', 'DODO native AMM spot volume, 24h', 11458318, ['source:dodo-amm:volume'], 'DefiLlama DODO AMM total24h.', { scope: 'DODO-owned AMM pools' }),
    metric('native-volume-30d', 'spot_volume', 'DODO native AMM spot volume, 30d', 278279983, ['source:dodo-amm:volume'], 'DefiLlama DODO AMM total30d.', { window: 'rolling 30 days', scope: 'DODO-owned AMM pools' }),
    metric('routed-volume-24h', 'spot_volume', 'DODO aggregator-routed volume, 24h', 584, ['source:dodo-amm:aggregator'], 'DefiLlama DODO aggregator total24h.', { scope: 'DODO routing layer', qualityFlags: ['routed_volume_overlap', 'not_owned_liquidity', 'not_additive'] }),
    metric('tvl-latest', 'tvl', 'DODO AMM TVL', 11876423, ['source:dodo-amm:tvl'], 'Latest totalLiquidityUSD in the DODO AMM series.', { scope: 'DODO-owned AMM pools' }),
    metric('tvl-peak', 'tvl', 'DODO AMM peak TVL', 451883000, ['source:dodo-amm:tvl'], 'Maximum totalLiquidityUSD in the DODO AMM series, dated 2022-01-22.', { asOf: '2022-01-22', window: 'historical maximum', scope: 'DODO-owned AMM pools', qualityFlags: ['historical_not_current'] }),
    metric('fees-30d', 'fees', 'DODO gross fees, 30d', 233251, ['source:dodo-amm:fees'], 'DefiLlama total30d dailyFees.', { window: 'rolling 30 days', scope: 'DODO fee adapter' }),
  ],
  events: [
    event('v1-launch', 'launch', '2020-08-15', 'DODO’s first PMM product and early token distribution launched in August 2020.', ['source:dodo-amm:token', 'source:dodo-amm:overview'], 'Token release table and product history.'),
    event('crowdpool-exploit', 'security_incident', '2021-03-09', 'A V2 crowdpooling logic exploit removed about $3.8 million before substantial funds were reportedly returned.', ['source:dodo-amm:crime-report', 'source:dodo-amm:security'], 'Independent incident summary and post-incident audit chronology.'),
  ],
  feature: {
    lifecycle: 'mid',
    operating_model: 'Multichain PMM pools plus a separately measured liquidity router.',
    product_cohort: 'multichain_spot_amm_and_router',
    custody_model: 'non_custodial',
    primary_chain: 'Ethereum',
    chains: ['Ethereum', 'BNB Chain', 'Arbitrum', 'Base', 'Polygon', 'Avalanche', 'multiple EVM chains'],
    token_status: 'launched',
    token_symbol: 'DODO',
    token_launch_date: '2020-08-15',
    token_launch_timing: 'at_or_near_launch',
    token_strategy: 'governance_incentives_and_vdodo_fee_link',
    token_source_url: 'https://docs.dodoex.io/en/home/token-economy',
    metric_type: 'native_spot_volume_24h',
    metric_unit: 'usd',
    metric_window: 'rolling_24h',
    metric_as_of: AS_OF,
    metric_observed_at: OBSERVED_AT,
    comparability_key: 'dex|native_spot_amm|spot_volume|usd|rolling_24h',
  },
};

const platypus = {
  slug: 'platypus-finance',
  name: 'Platypus Finance',
  aliases: ['Platypus', 'Platypus DeFi'],
  table: 'dead_exchanges',
  operatingState: 'closed',
  outcome: 'failed_after_repeated_exploits',
  outcomeConfidence: 'high',
  qualityConfidence: 'high',
  classification: {
    subtype: 'Avalanche single-sided stableswap with former USP stablecoin',
    tags: ['stableswap', 'single_chain', 'stablecoin_coupled', 'exploited', 'closed'],
    chains: ['Avalanche'],
    jurisdictions: [],
  },
  sources: platypusSources,
  statusSources: ['source:platypus-finance:tvl', 'source:platypus-finance:volume', 'source:platypus-finance:recovery'],
  statusLocator: 'Dead URL flags, residual-only balances, near-zero flow and no current operating notice support closure.',
  outcomeSources: ['source:platypus-finance:recovery', 'source:platypus-finance:immunefi', 'source:platypus-finance:october-analysis', 'source:platypus-finance:tvl'],
  outcomeLocator: 'Two distinct 2023 security failures, USP impairment and capital exit support a failed classification.',
  identityBoundary: 'This profile covers the Platypus Finance Avalanche stableswap and its tightly coupled USP product. The February and October 2023 incidents are separate events with different mechanisms, losses and recovery records. Court outcomes are not fund-recovery outcomes.',
  methodologyNotes: [
    'Historical TVL is retained only as a dated peak; current residual balances and adapter volume are not treated as a functioning venue.',
    'Reported recovery percentages use their incident-specific denominator and are never combined.',
  ],
  unknowns: [
    'What final recovery percentage did each February-affected LP cohort receive by asset?',
    'What USP supply and enforceable redemption liability remain?',
    'Which pause, upgrade, treasury or token authorities remain active?',
    'Whether any higher-court proceeding followed the reported December 2024 appeal result?',
  ],
  unsourcedFields: ['Final LP recovery by asset', 'Residual USP liabilities', 'Current contract authorities', 'Any post-appeal legal proceeding'],
  sections: {
    what_it_is: section(
      'Platypus was an Avalanche stableswap built around single-sided liquidity: users could deposit one stable asset instead of an equal pair, and the pool priced trades using asset and liability coverage. It later added USP, a stablecoin borrowed against LP positions already staked in the protocol. That joined the exchange, staking and lending state into one system. The exchange pools and USP were related but not identical, which matters because the February 2023 failure was in USP collateral and solvency logic, not proof that every swap equation failed.',
      [
        claim('Platypus used single-sided stable-asset pools on Avalanche.', ['source:platypus-finance:recap', 'source:platypus-finance:tvl'], 'Operator product history and Avalanche-only adapter.'),
        claim('USP borrowing reused staked LP positions as collateral.', ['source:platypus-finance:recap', 'source:platypus-finance:immunefi'], 'Operator product history and independent exploit analysis.'),
        claim('The February bug was in USP collateral and solvency logic, not the base stableswap equation.', ['source:platypus-finance:recovery', 'source:platypus-finance:immunefi'], 'Operator and independent incident accounts.'),
      ],
    ),
    what_happened: section(
      'Platypus reached a historical TVL peak of $1.25 billion in March 2022. On Feb. 16, 2023, one attacker executed three related transactions and the protocol reported $9.19 million taken. A flawed emergency-withdraw path let collateral leave while USP debt remained. Platypus recovered or froze some assets and proposed at least 63% compensation, then relaunched without USP. On Oct. 12, a separate price-manipulation sequence affected WAVAX and sAVAX pools for about $2.23 million; over 90% was reportedly returned. These were separate incidents with different failure modes and recovery denominators.',
      [
        claim('The February 2023 incident comprised three attacks totaling $9.19 million.', ['source:platypus-finance:recovery', 'source:platypus-finance:immunefi'], 'Operator and independent incident records.'),
        claim('The October 2023 incident was a separate pool-price manipulation totaling about $2.23 million.', ['source:platypus-finance:october-analysis', 'source:platypus-finance:october-recovery'], 'Independent October analysis and recovery report.'),
        claim('Recovery percentages from the two incidents use different denominators and cannot be combined.', ['source:platypus-finance:recovery', 'source:platypus-finance:october-recovery'], 'Incident-specific compensation and return figures.', { kind: 'inference' }),
      ],
    ),
    why_this_outcome: section(
      'Platypus’s custom capital-efficiency strategy created more tightly coupled failure modes than a simple swap venue. Reusing staked LP assets as USP collateral made one missing solvency check capable of harming the pool. Relaunching preserved a chance to recover, but the October incident showed that pool pricing and withdrawal controls still had exploitable edges. Repeated trust shocks arrived while Avalanche DeFi was already below its prior boom. The evidence strongly connects the incidents to capital exit; it cannot quantify how much decline came from exploits versus the chain cycle, token emissions or competition.',
      [
        claim('Coupling USP debt to staked LP collateral expanded the consequence of one state-check failure.', ['source:platypus-finance:recap', 'source:platypus-finance:immunefi'], 'Product coupling and exploit path.', { kind: 'inference', confidence: 'high' }),
        claim('A second distinct exploit weakened the credibility of the post-February relaunch.', ['source:platypus-finance:october-analysis', 'source:platypus-finance:tvl'], 'Second incident and subsequent residual scale.', { kind: 'inference', confidence: 'medium' }),
        claim('Public evidence cannot decompose exploit effects from Avalanche contraction and competition.', ['source:platypus-finance:tvl', 'source:platypus-finance:volume'], 'Historical outcome series do not estimate causal shares.', { kind: 'unknown' }),
      ],
    ),
    strategic_choices: section(
      'The team chose single-sided pools and a coverage-ratio design to make stable liquidity easier to provide. It then used LP positions as USP collateral, increasing capital efficiency but joining swapping, staking and debt. After February, it chose recovery, compensation and relaunch rather than immediate closure, and removed USP functions from the planned return. After October, it negotiated a large voluntary return. Those choices improved recoveries, but did not rebuild a durable liquidity network or erase the repeated-control record.',
      [
        claim('Platypus chose single-sided liquidity and coverage-ratio pricing.', ['source:platypus-finance:recap'], 'Operator product history.'),
        claim('Platypus chose to add USP borrowing against staked LP collateral.', ['source:platypus-finance:recap', 'source:platypus-finance:immunefi'], 'Product and failure description.'),
        claim('The team chose to relaunch after February with USP functions removed.', ['source:platypus-finance:recovery'], 'Dated recovery plan.'),
      ],
    ),
    operating_model: section(
      'Users deposited one supported asset into a shared stableswap and received LP exposure; coverage ratios helped price imbalances across assets. PTP and vePTP incentives directed emissions and boosted LP rewards. USP let users borrow against LP collateral. In February, emergency withdrawal released collateral without fully enforcing the debt relationship. In October, a different interaction manipulated pool pricing. Current adapter values—$5,428 of daily volume and $27,286 of TVL-like balances—are residual contract activity, not evidence of a maintained customer-ready exchange.',
      [
        claim('Platypus combined single-sided stableswap pools with PTP incentives and former USP borrowing.', ['source:platypus-finance:recap', 'source:platypus-finance:recovery'], 'Operator product and incident history.'),
        claim('February and October exploited different parts of the system.', ['source:platypus-finance:immunefi', 'source:platypus-finance:october-analysis'], 'Independent incident reconstructions.'),
        claim('Current residual TVL and volume do not establish an operating venue.', ['source:platypus-finance:tvl', 'source:platypus-finance:volume'], 'Dead URL flags, scale and no maintained operation.', { kind: 'inference' }),
      ],
    ),
    token_and_value_capture: section(
      'PTP launched with the protocol’s incentive and governance system rather than after a proven mature business. Locking PTP into vePTP increased voting power and LP reward boosts, so emissions were central to acquiring liquidity. USP added another token and another promise: stable redemption backed by LP collateral. Neither PTP voting nor USP created equity in an operating company. Once exploits impaired collateral and liquidity left, the value-capture loop weakened because governance and rewards cannot substitute for safe, liquid pools.',
      [
        claim('PTP and vePTP were used for incentives, voting and LP reward boosts.', ['source:platypus-finance:recap'], 'Operator tokenomics history.'),
        claim('USP depended on LP collateral and therefore linked stablecoin health to protocol controls.', ['source:platypus-finance:recap', 'source:platypus-finance:immunefi'], 'Product and incident mechanics.'),
        claim('Residual PTP or USP tokens do not prove a functioning value-capture loop.', ['source:platypus-finance:tvl', 'source:platypus-finance:volume'], 'Residual activity and closure evidence.', { kind: 'inference' }),
      ],
    ),
    counterfactual: section(
      'A strict invariant that prevented collateral release whenever USP debt remained would likely have blocked the February path. Manipulation-aware price bounds, withdrawal delays or exposure caps could have reduced the October loss. A slower USP launch with isolated collateral could have contained damage to the stablecoin product rather than the shared LP base. Those controls address the observed failures, but cannot prove Platypus would have retained its billion-dollar peak through a shrinking Avalanche market.',
      [
        claim('Enforcing debt repayment before emergency collateral release would address the February exploit path.', ['source:platypus-finance:immunefi', 'source:platypus-finance:recovery'], 'The attack depended on the missing relationship.', { kind: 'inference', confidence: 'high' }),
        claim('Manipulation-aware bounds and exposure limits could reduce the October pool-pricing loss.', ['source:platypus-finance:october-analysis'], 'Independent attack reconstruction.', { kind: 'inference', confidence: 'medium' }),
        claim('No counterfactual proves that safer contracts would preserve peak liquidity.', ['source:platypus-finance:tvl'], 'Historical series cannot answer the unobserved alternative.', { kind: 'unknown' }),
      ],
    ),
    risks_and_unknowns: section(
      'The venue is closed, so the remaining risks are creditor and contract risks: unresolved compensation, inaccessible assets, USP claims, administrator keys, residual approvals and misleading old interfaces. The February minimum-compensation plan was a forecast, not proof that every user received 63%. The October return did not settle February losses. Legal outcomes are also separate: the February defendants were acquitted at trial; prosecutors appealed; counsel later reported the Paris Court of Appeal confirmed the result. No reviewed source establishes a later higher-court outcome.',
      [
        claim('The February compensation plan does not prove final payment to every LP.', ['source:platypus-finance:recovery'], 'The post described planned minimum distribution and conditional recoveries.', { kind: 'inference' }),
        claim('The October recovery does not settle February claims.', ['source:platypus-finance:recovery', 'source:platypus-finance:october-recovery'], 'Separate events and denominators.', { kind: 'inference' }),
        claim('Final LP recovery, USP liabilities, contract authority and any later appeal remain unknown.', ['source:platypus-finance:appeal-result', 'source:platypus-finance:tvl'], 'Reviewed sources do not publish a complete closure ledger.', { kind: 'unknown' }),
      ],
    ),
    lifecycle: section(
      'Platypus launched during Avalanche’s 2021 DeFi expansion, reached roughly $1.25 billion of TVL in March 2022, and added USP to reuse LP capital. The February 2023 exploit took $9.19 million; recovery and compensation efforts followed. The separate October 2023 exploit took about $2.23 million before more than 90% was reportedly returned. In December 2023 a Paris court acquitted two defendants in the February case, prosecutors appealed, and counsel reported the acquittal was confirmed on appeal in 2024. Today the front end is flagged dead and only residual balances and flow remain.',
      [
        claim('Platypus peaked near $1.25 billion of TVL in March 2022.', ['source:platypus-finance:tvl'], 'Historical provider series.'),
        claim('Two distinct 2023 incidents interrupted the recovery lifecycle.', ['source:platypus-finance:recovery', 'source:platypus-finance:october-analysis'], 'Dated incident records.'),
        claim('The trial acquittals were appealed and reportedly confirmed on appeal in 2024.', ['source:platypus-finance:trial', 'source:platypus-finance:appeal-filed', 'source:platypus-finance:appeal-result'], 'Contemporary trial, appeal filing and counsel-reported result.'),
      ],
    ),
    outlook_and_watch: section(
      'There is no current operating-growth thesis. Watch final compensation by asset, USP redemption and supply, residual LP exits, administrative control and any verified closure notice. A relaunch would need new contracts, independent review, a maintained front end, transparent liabilities and sustained unaided liquidity; a token price or a few adapter trades would not qualify. The legal file should also be updated if an authoritative higher-court result appears, without treating that result as a recovery for users.',
      [
        claim('Closure quality depends on final compensation, USP settlement and residual exits.', ['source:platypus-finance:recovery', 'source:platypus-finance:tvl'], 'Open recovery items and residual balances.', { kind: 'inference' }),
        claim('A relaunch requires maintained products and material liquidity, not token or adapter remnants.', ['source:platypus-finance:volume', 'source:platypus-finance:tvl'], 'Current residual series motivate the threshold.', { kind: 'inference' }),
        claim('No reviewed evidence supports a current Platypus relaunch.', ['source:platypus-finance:volume', 'source:platypus-finance:tvl'], 'Dead URL flags and residual activity.', { kind: 'unknown' }),
      ],
    ),
  },
  metrics: [
    metric('spot-volume-24h', 'spot_volume', 'Residual spot volume, 24h', 5428, ['source:platypus-finance:volume'], 'DefiLlama total24h.', { scope: 'legacy Platypus pools', qualityFlags: ['residual_activity', 'not_operating_liquidity'] }),
    metric('tvl-latest', 'tvl', 'Residual TVL-like balance', 27286, ['source:platypus-finance:tvl'], 'Latest totalLiquidityUSD.', { scope: 'legacy Platypus contracts', qualityFlags: ['residual_balance', 'not_operating_liquidity'] }),
    metric('tvl-peak', 'tvl', 'Historical peak TVL', 1254719052, ['source:platypus-finance:tvl'], 'Maximum totalLiquidityUSD, dated 2022-03-17.', { asOf: '2022-03-17', window: 'historical maximum', qualityFlags: ['historical_not_current'] }),
    metric('february-loss', 'exploit_loss', 'February 2023 reported exploit loss', 9190000, ['source:platypus-finance:recovery'], 'Operator-reported aggregate across three February attacks.', { asOf: '2023-02-16', window: 'incident total', qualityFlags: ['operator_reported'] }),
    metric('october-loss', 'exploit_loss', 'October 2023 reported exploit loss', 2230000, ['source:platypus-finance:october-analysis', 'source:platypus-finance:october-recovery'], 'Independent incident estimates.', { asOf: '2023-10-12', window: 'incident total', qualityFlags: ['separate_incident'] }),
  ],
  events: [
    event('february-exploit', 'security_incident', '2023-02-16', 'Three related attacks exploited USP collateral and solvency logic for a reported $9.19 million.', ['source:platypus-finance:recovery', 'source:platypus-finance:immunefi'], 'Operator and independent incident reconstruction.'),
    event('october-exploit', 'security_incident', '2023-10-12', 'A separate price-manipulation incident affected WAVAX and sAVAX pools for about $2.23 million.', ['source:platypus-finance:october-analysis', 'source:platypus-finance:october-recovery'], 'Independent analysis and recovery report.'),
  ],
  feature: {
    lifecycle: 'dead',
    operating_model: 'Closed Avalanche single-sided stableswap formerly coupled to USP borrowing.',
    product_cohort: 'single_chain_stableswap_with_stablecoin',
    custody_model: 'non_custodial',
    primary_chain: 'Avalanche',
    chains: ['Avalanche'],
    token_status: 'launched',
    token_symbol: 'PTP',
    token_launch_date: null,
    token_launch_timing: 'at_or_near_launch',
    token_strategy: 'liquidity_incentives_vote_escrow_and_governance',
    token_source_url: 'https://medium.com/platypus-finance/platypus-recap-the-2022-2023-transition-503ca5483076',
    metric_type: 'historical_peak_tvl',
    metric_unit: 'usd',
    metric_window: 'historical_maximum',
    metric_as_of: '2022-03-17',
    metric_observed_at: OBSERVED_AT,
    comparability_key: 'dex|single_chain_stableswap|tvl|usd|historical_maximum',
  },
};

const saddle = {
  slug: 'saddle-finance',
  name: 'Saddle Finance',
  aliases: ['Saddle'],
  table: 'dead_exchanges',
  operatingState: 'closed',
  outcome: 'closed_by_governance_wind_down',
  outcomeConfidence: 'high',
  qualityConfidence: 'high',
  classification: {
    subtype: 'multichain stable-asset AMM wound down by DAO vote',
    tags: ['stableswap', 'vote_escrow', 'multichain', 'governance_wind_down', 'closed'],
    chains: ['Ethereum', 'Arbitrum', 'Optimism', 'Fantom', 'Evmos', 'Aurora', 'Kava'],
    jurisdictions: [],
  },
  sources: saddleSources,
  statusSources: ['source:saddle-finance:about', 'source:saddle-finance:vote', 'source:saddle-finance:ragequit'],
  statusLocator: 'Operator notice, final governance record and partner unwind action establish the wind-down.',
  outcomeSources: ['source:saddle-finance:winddown-news', 'source:saddle-finance:vote', 'source:saddle-finance:tvl', 'source:saddle-finance:volume'],
  outcomeLocator: 'DAO-approved closure, paused pools, dissolved multisig and residual-only activity support the classification.',
  identityBoundary: 'This profile covers the original Saddle Finance AMM and its SDL/veSDL governance system. Residual pool balances, partner gauges and reused open-source code are not a successor exchange.',
  methodologyNotes: [
    'Residual TVL and tiny adapter volume are closure obligations, not operating-growth metrics.',
    'SIP-54’s rationale is proposal evidence; public data do not estimate the independent weight of competition, emissions, runway and the market cycle.',
  ],
  unknowns: [
    'What final treasury distribution reached SDL and veSDL stakeholders?',
    'How much residual liquidity is freely withdrawable versus stranded in partner systems?',
    'Which contracts retain administrative or emergency authority after multisig dissolution?',
    'Whether code or contributors transferred to any separately funded successor?',
  ],
  unsourcedFields: ['Final treasury distribution', 'Residual withdrawal status by pool', 'Current contract authorities', 'Contributor or code transfer'],
  sections: {
    what_it_is: section(
      'Saddle was a non-custodial automated market maker for stablecoins, wrapped bitcoin and other assets expected to trade near the same price. Users swapped against liquidity supplied by other users, and the stable-swap curve aimed to reduce slippage near the peg. Saddle later expanded across several EVM networks and added SDL incentives, veSDL locks and gauges. It is no longer an operating growth venue: the DAO voted to wind it down, pause pools and dissolve the community multisig.',
      [
        claim('Saddle was an AMM optimized for pegged-value assets.', ['source:saddle-finance:about', 'source:saddle-finance:faq'], 'Operator product description.'),
        claim('Saddle expanded with SDL, veSDL and gauge-directed incentives.', ['source:saddle-finance:faq', 'source:saddle-finance:vesdl'], 'Token and vote-escrow documentation.'),
        claim('The DAO wound down the protocol, paused pools and dissolved the multisig.', ['source:saddle-finance:about', 'source:saddle-finance:vote'], 'Operator closure notice and governance record.'),
      ],
    ),
    what_happened: section(
      'Saddle launched in January 2021 with a guarded deposit cap, then removed that guard after early operation and expanded into a multichain stable-swap suite. It minted one billion SDL at genesis, initially made the token non-transferable, and later activated veSDL gauges and fee sharing. TVL peaked near $308.46 million in March 2022. By August 2023 the proposal record described weak activity, a long bear market, depleted operating resources and difficulty raising more capital. SIP-54 passed with 99.78% of recorded voting power to wind down the DAO, and partner protocols then created exit paths for affected gauges.',
      [
        claim('Saddle began with a guarded launch and later removed its deposit caps.', ['source:saddle-finance:faq'], 'Operator guarded-launch history.'),
        claim('Saddle TVL peaked near $308.46 million in March 2022.', ['source:saddle-finance:tvl'], 'Historical provider series.'),
        claim('SIP-54 passed in August 2023 with 99.78% of recorded voting power.', ['source:saddle-finance:vote', 'source:saddle-finance:ragequit'], 'Governance record and partner response.'),
      ],
    ),
    why_this_outcome: section(
      'Saddle entered a market where liquidity network effects already favored Curve and where stable-swap math was not enough to guarantee order flow. SDL emissions and multichain gauges could rent liquidity, but they also consumed token and operational resources. Expanding across chains and partner gauges increased maintenance while the bear market reduced fees and fundraising options. The governance record supports low activity and runway pressure as proximate reasons for closure. It does not prove how much each cause mattered or whether a narrower single-chain product would have survived.',
      [
        claim('Stable-swap competition required Saddle to overcome incumbent liquidity network effects.', ['source:saddle-finance:faq', 'source:saddle-finance:winddown-news'], 'Product similarity and wind-down context.', { kind: 'inference', confidence: 'medium' }),
        claim('SDL emissions and multichain gauges added recurring incentive and operating commitments.', ['source:saddle-finance:vesdl', 'source:saddle-finance:ragequit'], 'Documented emissions and partner unwind.'),
        claim('Public evidence does not estimate the causal weight of competition, emissions, runway and market conditions.', ['source:saddle-finance:winddown-news', 'source:saddle-finance:vote'], 'Proposal reasons without causal decomposition.', { kind: 'unknown' }),
      ],
    ),
    strategic_choices: section(
      'Saddle chose open-source stable-swap infrastructure and a cautious guarded launch, then removed limits after early testing. It expanded to multiple chains and adopted vote-escrow tokenomics: veSDL holders directed weekly emissions, earned fee-linked rewards and could receive third-party voting incentives. When continued operation was no longer funded, token holders chose a documented wind-down and treasury process instead of pretending residual pools were a healthy business. The orderly vote reduced ambiguity, but partner gauges still required separate exit mechanics.',
      [
        claim('Saddle chose a guarded launch before opening deposits broadly.', ['source:saddle-finance:faq'], 'Operator launch controls.'),
        claim('Saddle adopted veSDL gauges and fee sharing to direct liquidity.', ['source:saddle-finance:vesdl'], 'Vote-escrow and fee rules.'),
        claim('The DAO chose a formal wind-down rather than unfunded continuation.', ['source:saddle-finance:about', 'source:saddle-finance:vote', 'source:saddle-finance:ragequit'], 'Closure notice, vote and implementation consequence.'),
      ],
    ),
    operating_model: section(
      'Traders paid a 0.04% fee on most swaps. Historical documentation allocated half to LPs; from the other half, 60% went to veSDL holders through an SDL/ETH LP token and 40% to treasury in USDC. LPs could also earn SDL emissions, and veSDL locks boosted rewards and voted weekly emissions across gauges. That model depended on volume, liquidity and token incentives reinforcing each other. Today the adapter reports $0 daily volume and about $808,640 in residual TVL-like balances. Those balances may need withdrawal support; they are not a live business.',
      [
        claim('Most Saddle swaps charged 0.04%, with documented fee shares for LPs, veSDL and treasury.', ['source:saddle-finance:vesdl'], 'Historical fee-allocation rules.'),
        claim('veSDL locks directed weekly emissions and boosted LP rewards.', ['source:saddle-finance:vesdl'], 'Gauge and boost documentation.'),
        claim('Current residual TVL with zero daily volume is not an operating exchange.', ['source:saddle-finance:tvl', 'source:saddle-finance:volume', 'source:saddle-finance:about'], 'Current adapter observations and closure notice.', { kind: 'inference' }),
      ],
    ),
    token_and_value_capture: section(
      'Saddle minted a maximum one billion SDL at genesis, with a two-to-three-year release framework and an initial non-transfer period intended to deter short-term farming. Later, SDL could be locked for veSDL from one week to four years. veSDL carried governance, gauge votes, reward boosts and a documented share of trading fees. That was a real economic link while pools produced fees. Once the DAO wound down, the remaining token question became treasury distribution and exit rights rather than future venue growth.',
      [
        claim('Saddle’s token symbol is SDL and its genesis maximum supply was one billion.', ['source:saddle-finance:faq'], 'Operator token FAQ.'),
        claim('veSDL carried governance, gauge and documented fee-linked rights.', ['source:saddle-finance:vesdl'], 'Vote-escrow documentation.'),
        claim('After wind-down, final distribution and exits matter more than prospective fee growth.', ['source:saddle-finance:about', 'source:saddle-finance:vote', 'source:saddle-finance:ragequit'], 'Closure and partner unwind record.', { kind: 'inference' }),
      ],
    ),
    counterfactual: section(
      'A single-chain focus on a smaller set of defensible stable pools could have reduced deployment and gauge overhead. Lower or revenue-triggered emissions could have preserved token budget and shown whether traders would stay without rewards. A merger or code transfer might have preserved integrations without maintaining a separate SDL economy. None of those alternatives had committed funding in the reviewed record, and incumbent liquidity effects may still have won. The strongest lesson is to tie expansion and emissions to fee-supported runway before the treasury reaches a closure vote.',
      [
        claim('A narrower chain and pool footprint could reduce operating overhead.', ['source:saddle-finance:vesdl', 'source:saddle-finance:winddown-news'], 'Breadth and wind-down context support the trade-off.', { kind: 'inference', confidence: 'medium' }),
        claim('Revenue-triggered emissions could reveal demand before token resources are exhausted.', ['source:saddle-finance:vesdl', 'source:saddle-finance:volume'], 'Historical emission design and low final activity.', { kind: 'inference', confidence: 'medium' }),
        claim('No reviewed source proves an alternative had capital or would beat incumbent liquidity.', ['source:saddle-finance:winddown-news', 'source:saddle-finance:vote'], 'No funded counterfactual is recorded.', { kind: 'unknown' }),
      ],
    ),
    risks_and_unknowns: section(
      'The remaining risks are closure risks: whether LPs can withdraw, whether partner gauges release deposits, what happened to treasury assets, and which emergency or administrative powers remain. The Frax response shows that one partner gauge needed its own ragequit design and a proposed fee, so “wind down” did not mean every position automatically exited. Audits covered specified code at a point in time, not runway or partner dependencies. Final treasury distributions, residual pool status and any funded successor remain unknown.',
      [
        claim('Some partner-gauge users needed separate withdrawal mechanics after SIP-54.', ['source:saddle-finance:ragequit'], 'Frax governance response.'),
        claim('A contract audit does not establish economic viability or safe closure of every integration.', ['source:saddle-finance:audit', 'source:saddle-finance:winddown-news'], 'Review scope and later business outcome.', { kind: 'inference' }),
        claim('Final distributions, residual withdrawals and current authorities remain unknown.', ['source:saddle-finance:about', 'source:saddle-finance:tvl'], 'No complete closure ledger in reviewed sources.', { kind: 'unknown' }),
      ],
    ),
    lifecycle: section(
      'Saddle launched in January 2021, removed its guarded limits in February, expanded across EVM networks and later activated transferable SDL and veSDL gauges. TVL peaked near $308.46 million in March 2022. Activity and resources weakened during the bear market. In August 2023, SIP-54 passed and the DAO wound down operations, paused pools and dissolved the multisig; partner unwind proposals followed. Current residual TVL and tiny recent trades do not reverse that governance outcome. Saddle is closed through an orderly DAO process, not silently abandoned.',
      [
        claim('Saddle moved from guarded launch to multichain veSDL operation.', ['source:saddle-finance:faq', 'source:saddle-finance:vesdl'], 'Operator launch and tokenomics history.'),
        claim('SIP-54 created a formal August 2023 wind-down.', ['source:saddle-finance:about', 'source:saddle-finance:vote'], 'Operator notice and vote record.'),
        claim('Residual balances and trades do not reverse the closure decision.', ['source:saddle-finance:tvl', 'source:saddle-finance:volume', 'source:saddle-finance:ragequit'], 'Current remnants and unwind evidence.', { kind: 'inference' }),
      ],
    ),
    outlook_and_watch: section(
      'Saddle’s outlook is an unwind, not a comeback forecast. Watch withdrawals from every remaining pool and gauge, final treasury distributions, dormant admin powers and whether old interfaces clearly warn users. A separate team could reuse the open-source code, but that would need its own profile, contracts, token and evidence. Reopening Saddle itself would require funded maintainers, restored governance, material unaided liquidity and clear liabilities; none appears in the reviewed record.',
      [
        claim('Residual withdrawals and final treasury distribution are the material watch items.', ['source:saddle-finance:about', 'source:saddle-finance:ragequit', 'source:saddle-finance:tvl'], 'Closure and residual-balance evidence.', { kind: 'inference' }),
        claim('A code fork or new team would be a separate successor profile.', ['source:saddle-finance:faq', 'source:saddle-finance:audit'], 'Open-source and scope boundaries.', { kind: 'inference' }),
        claim('No reviewed evidence supports an operating Saddle revival.', ['source:saddle-finance:about', 'source:saddle-finance:volume', 'source:saddle-finance:vote'], 'Closure notice, zero latest volume and no new vote.', { kind: 'unknown' }),
      ],
    ),
  },
  metrics: [
    metric('spot-volume-24h', 'spot_volume', 'Residual spot volume, 24h', 0, ['source:saddle-finance:volume'], 'DefiLlama total24h.', { scope: 'legacy Saddle pools', qualityFlags: ['residual_activity', 'not_operating_liquidity'] }),
    metric('spot-volume-30d', 'spot_volume', 'Residual spot volume, 30d', 3417.59, ['source:saddle-finance:volume'], 'DefiLlama total30d.', { window: 'rolling 30 days', scope: 'legacy Saddle pools', qualityFlags: ['residual_activity', 'not_operating_liquidity'] }),
    metric('tvl-latest', 'tvl', 'Residual TVL-like balance', 808640, ['source:saddle-finance:tvl'], 'Latest totalLiquidityUSD.', { scope: 'legacy Saddle contracts', qualityFlags: ['residual_balance', 'not_operating_liquidity'] }),
    metric('tvl-peak', 'tvl', 'Historical peak TVL', 308456699, ['source:saddle-finance:tvl'], 'Maximum totalLiquidityUSD, dated 2022-03-30.', { asOf: '2022-03-30', window: 'historical maximum', qualityFlags: ['historical_not_current'] }),
  ],
  events: [
    event('guard-removed', 'product_change', '2021-02-22', 'Saddle removed its guarded-launch deposit caps after operating with limits from its January launch.', ['source:saddle-finance:faq'], 'Operator launch history and dated guard-removal notice.'),
    event('sip54-winddown', 'closure', '2023-08-14', 'SIP-54 passed and authorized the responsible wind-down of Saddle operations and treasury.', ['source:saddle-finance:about', 'source:saddle-finance:vote', 'source:saddle-finance:ragequit'], 'Operator closure notice, final vote and partner implementation record.'),
  ],
  feature: {
    lifecycle: 'dead',
    operating_model: 'Closed multichain stable-asset AMM with former veSDL gauge system.',
    product_cohort: 'multichain_stableswap',
    custody_model: 'non_custodial',
    primary_chain: 'Ethereum',
    chains: ['Ethereum', 'Arbitrum', 'Optimism', 'Fantom', 'Evmos', 'Aurora', 'Kava'],
    token_status: 'launched',
    token_symbol: 'SDL',
    token_launch_date: null,
    token_launch_timing: 'post_product',
    token_strategy: 'liquidity_emissions_vote_escrow_fee_share_and_governance',
    token_source_url: 'https://docs.saddle.finance/saddle-faq',
    metric_type: 'historical_peak_tvl',
    metric_unit: 'usd',
    metric_window: 'historical_maximum',
    metric_as_of: '2022-03-30',
    metric_observed_at: OBSERVED_AT,
    comparability_key: 'dex|multichain_stableswap|tvl|usd|historical_maximum',
  },
};

const solidly = {
  slug: 'solidly',
  name: 'Solidly (original Fantom deployment)',
  aliases: ['Solidly V1', 'Solidly on Fantom'],
  table: 'dead_exchanges',
  operatingState: 'abandoned',
  outcome: 'failed_original_fantom_deployment',
  outcomeConfidence: 'high',
  qualityConfidence: 'high',
  classification: {
    subtype: 'original Fantom vote-escrowed AMM deployment',
    tags: ['ve_3_3', 'vote_escrow', 'single_chain', 'abandoned', 'spot_amm'],
    chains: ['Fantom Opera'],
    jurisdictions: [],
  },
  sources: solidlySources,
  statusSources: ['source:solidly:audit-status', 'source:solidly:volume', 'source:solidly:tvl', 'source:solidly:departure'],
  statusLocator: 'Historical-production classification, residual-only metrics and stewardship exit support abandoned status.',
  outcomeSources: ['source:solidly:fantom-launch', 'source:solidly:departure', 'source:solidly:theblock-research', 'source:solidly:tvl'],
  outcomeLocator: 'Explosive incentive-led launch, near-immediate stewardship shock and durable collapse of the original venue support failure.',
  identityBoundary: 'This profile is only the original February 2022 Solidly deployment on Fantom Opera. It excludes later Solidly-branded deployments, Velodrome, Aerodrome, Equalizer, Ramses and every other fork or successor. Their survival does not revive the original venue.',
  methodologyNotes: [
    'The current DefiLlama endpoints remain Fantom-scoped but their residual balances and trades are not treated as a maintained venue.',
    'Successor performance can test the design family but cannot be attributed to the original Solidly product, token or team.',
  ],
  unknowns: [
    'Who, if anyone, controls or maintains each original deployed contract today?',
    'What portion of launch TVL and volume was organic rather than incentive-seeking?',
    'What claims or liabilities remained when visible stewardship ended?',
    'How much SOLID remained locked, claimable or economically useful after abandonment?',
  ],
  unsourcedFields: ['Current contract control', 'Organic launch demand', 'Residual liabilities', 'Current locked-SOLID rights'],
  sections: {
    what_it_is: section(
      'Original Solidly was a Fantom automated market maker that combined stable and volatile swap curves with a vote-escrow incentive market. Liquidity providers earned newly issued SOLID. Locking SOLID created a veNFT that voted on which pools received the next emissions and collected fees and voting incentives. The launch distributed veNFT power to large Fantom protocols based largely on their TVL. This report covers only that 2022 Fantom deployment, not later forks or successor teams that adapted the mechanism.',
      [
        claim('Original Solidly was a Fantom AMM with SOLID emissions and veNFT-directed pool voting.', ['source:solidly:fantom-launch', 'source:solidly:audit-status'], 'Fantom launch record and original-version scope.'),
        claim('Initial veNFT power was distributed to established Fantom protocols around their TVL.', ['source:solidly:fantom-launch', 'source:solidly:theblock-research'], 'Launch and post-launch ecosystem records.'),
        claim('Later forks and successors are not the original venue.', ['source:solidly:audit-status', 'source:solidly:velodrome-history', 'source:solidly:equalizer'], 'Version-specific record and successor self-descriptions.'),
      ],
    ),
    what_happened: section(
      'The original product went live on Fantom on Feb. 10, 2022, and SOLID emissions began on Feb. 24. Fantom reported more than $1.6 billion of TVL in the first 24 hours of emissions, and DefiLlama’s historical series later peaked near $2.29 billion on March 3. On March 6, Andre Cronje and Anton Nell announced they were leaving DeFi and named services for termination. SOLID, Fantom-linked tokens and liquidity fell sharply. The code remained available and later teams reused the design, but the original venue did not recover durable stewardship or liquidity. Today it shows only about $9,876 of TVL-like balances and $122 of daily volume.',
      [
        claim('The product launched on 2022-02-10; SOLID emissions started on 2022-02-24 and first-day emissions TVL exceeded $1.6 billion.', ['source:solidly:product-launch', 'source:solidly:fantom-launch'], 'Two dated Fantom Foundation updates distinguish product launch from token emissions.'),
        claim('Andre Cronje and Anton Nell announced their DeFi departure on 2022-03-06.', ['source:solidly:departure', 'source:solidly:departure-2'], 'Contemporary independent reports of the same announcement.'),
        claim('The original venue never recovered material scale and now has only residual activity.', ['source:solidly:tvl', 'source:solidly:volume', 'source:solidly:velodrome-history'], 'Current and historical provider series plus successor account.'),
      ],
    ),
    why_this_outcome: section(
      'Solidly acquired liquidity before it proved durable trader demand or durable stewardship. The veNFT airdrop gave protocols a reason to inflate TVL before launch, while high early emissions paid LPs after launch. That produced spectacular deposits but also made liquidity sensitive to SOLID’s value and weekly incentives. The developer departure then exposed a key-person and succession problem within days of launch. The evidence supports an incentive-heavy launch and stewardship shock; it cannot precisely divide the collapse among emissions, bugs, market conditions, Fantom weakness and lost confidence.',
      [
        claim('The TVL-based veNFT distribution and SOLID emissions created powerful pre- and post-launch liquidity incentives.', ['source:solidly:fantom-launch', 'source:solidly:theblock-research'], 'Launch design and post-launch analysis.', { kind: 'inference', confidence: 'high' }),
        claim('The near-immediate departure exposed a succession and key-person weakness.', ['source:solidly:departure', 'source:solidly:departure-2', 'source:solidly:velodrome-history'], 'Departure timing and later successor account.', { kind: 'inference', confidence: 'high' }),
        claim('Public evidence does not quantify one exclusive cause of the collapse.', ['source:solidly:theblock-research', 'source:solidly:tvl'], 'Outcome series and narrative sources do not estimate causal shares.', { kind: 'unknown' }),
      ],
    ),
    strategic_choices: section(
      'Solidly chose a rapid launch, a TVL-weighted veNFT distribution to large Fantom protocols and steep early emissions. It directed swap fees and third-party incentives to veNFT voters rather than LPs, while emissions paid the pools those voters selected. That made governance power and liquidity direction immediately valuable, but encouraged a race for voting control before product demand was known. It also launched around a highly visible individual developer without a publicly proven succession team. Later forks changed distribution, emissions and stewardship; their choices belong to those projects.',
      [
        claim('Solidly chose TVL-weighted protocol distribution and vote-directed emissions.', ['source:solidly:fantom-launch', 'source:solidly:theblock-research'], 'Launch and ecosystem analysis.'),
        claim('The design routed fees and incentives toward locked voters while emissions paid LPs.', ['source:solidly:fantom-launch', 'source:solidly:velodrome-history'], 'Original mechanics and successor comparison.'),
        claim('The launch lacked a publicly proven succession structure able to absorb the developer exit.', ['source:solidly:departure', 'source:solidly:departure-2'], 'Departure record and absence of identified transition.', { kind: 'inference', confidence: 'medium' }),
      ],
    ),
    operating_model: section(
      'Traders swapped through stable or volatile AMM pools. LPs deposited both assets and earned SOLID emissions from gauges. SOLID lockers received veNFTs that voted each week, collected the relevant pool fees and could receive outside incentives for votes. The model tried to put fees in the hands of long-term governors and emissions in the hands of liquidity providers. It only worked if voting, fees, token value and real trading reinforced one another. Current tiny Fantom balances and trades reflect unattended legacy contracts, not a functioning team, interface or growth venue.',
      [
        claim('LPs earned emissions while veNFT voters directed gauges and received fee-linked benefits.', ['source:solidly:fantom-launch', 'source:solidly:velodrome-history'], 'Original and successor mechanic descriptions.'),
        claim('The operating loop depended on fees, votes, SOLID value and liquidity reinforcing one another.', ['source:solidly:fantom-launch', 'source:solidly:theblock-research'], 'Mechanism and post-launch outcome.', { kind: 'inference' }),
        claim('Current residual balances and trades are not a maintained exchange.', ['source:solidly:tvl', 'source:solidly:volume', 'source:solidly:audit-status'], 'Residual provider series and historical-production classification.', { kind: 'inference' }),
      ],
    ),
    token_and_value_capture: section(
      'SOLID launched with the original venue and was indispensable to its incentive system. New SOLID paid LPs; locking created veNFT voting power; voters received pool fees and voting incentives. In theory, productive pools would attract votes and locks, while emission growth declined as more supply was locked. In practice, early issuance, speculative demand and the confidence shock made the token a source of reflexivity: falling SOLID value reduced the appeal of LP rewards. The token was not equity, and successor VELO, AERO, EQUAL or other tokens are not SOLID value capture.',
      [
        claim('SOLID launched at the venue launch and funded liquidity emissions.', ['source:solidly:fantom-launch'], 'Dated launch record.'),
        claim('Locked SOLID created veNFT voting and fee-linked rights in the original design.', ['source:solidly:fantom-launch', 'source:solidly:theblock-research'], 'Launch and research descriptions.'),
        claim('Successor tokens do not accrue value to original SOLID.', ['source:solidly:velodrome-history', 'source:solidly:equalizer', 'source:solidly:audit-status'], 'Separate successor and version boundaries.', { kind: 'inference' }),
      ],
    ),
    counterfactual: section(
      'A capped, slower emissions schedule could have tested organic fees before billions of dollars chased rewards. A broader distribution based on users or time-weighted activity could reduce the race to inflate protocol TVL. Most important, a named multi-party operating team, governance authority and succession plan could have reduced the March confidence shock. Later forks show that the mechanism could be modified and maintained, but they do not prove original Solidly would have recovered under those choices.',
      [
        claim('Slower emissions could have made organic fee demand easier to observe.', ['source:solidly:fantom-launch', 'source:solidly:theblock-research'], 'Incentive-heavy launch supports the alternative.', { kind: 'inference', confidence: 'medium' }),
        claim('A published succession team could have reduced key-person risk.', ['source:solidly:departure', 'source:solidly:departure-2'], 'Observed departure shock supports the counterfactual.', { kind: 'inference', confidence: 'high' }),
        claim('Successor survival does not prove the original venue would have recovered.', ['source:solidly:velodrome-history', 'source:solidly:equalizer'], 'Successors changed design and stewardship.', { kind: 'unknown' }),
      ],
    ),
    risks_and_unknowns: section(
      'The original venue is abandoned, so risks are residual contracts, misleading interfaces, SOLID lock claims, forgotten approvals and uncertainty over administrative control. The original V1 had a published audit, but that review was version-specific and did not guarantee economic sustainability, governance quality or successors. It is also easy to misattribute later VE(3,3) success to Solidly. Unknowns include current contract control, remaining locks and claims, organic launch volume, final liabilities and whether any original interface is safely maintained.',
      [
        claim('The original V1 had a published audit with version and deployment limitations.', ['source:solidly:audit-status'], 'Current operator audit inventory and its historical report record.'),
        claim('Audit evidence does not establish economic durability or successor safety.', ['source:solidly:audit-status', 'source:solidly:velodrome-history'], 'Published scope limitation and separate successor code.', { kind: 'inference' }),
        claim('Current control, residual SOLID rights and original liabilities remain unknown.', ['source:solidly:tvl', 'source:solidly:volume', 'source:solidly:audit-status'], 'No maintained closure ledger was located.', { kind: 'unknown' }),
      ],
    ),
    lifecycle: section(
      'Solidly launched its Fantom product on Feb. 10, 2022, began SOLID emissions on Feb. 24, crossed $1.6 billion of first-day emissions TVL and peaked near $2.29 billion days later. On March 6 the departure announcement removed visible stewardship and triggered a confidence shock across related markets. Liquidity and token value collapsed, and later teams forked or adapted the code under new brands, tokens and governance. The original Fantom venue now has only residual balances and trades. Its design descendants matter historically, but its own lifecycle is failed and abandoned.',
      [
        claim('Original Solidly reached more than $1.6 billion first-day TVL and a $2.29 billion historical peak.', ['source:solidly:fantom-launch', 'source:solidly:tvl'], 'Launch update and historical provider series.'),
        claim('The March 2022 departure was followed by a sharp confidence and liquidity shock.', ['source:solidly:departure', 'source:solidly:departure-2', 'source:solidly:theblock-research'], 'Contemporary reports and post-launch research.'),
        claim('Later forks preserved ideas but not original venue continuity.', ['source:solidly:velodrome-history', 'source:solidly:equalizer', 'source:solidly:audit-status'], 'Successor and version-specific records.'),
      ],
    ),
    outlook_and_watch: section(
      'There is no evidence-backed revival thesis for original Solidly. Watch only closure and identity signals: any verified maintainer notice, contract-control change, migration path, residual SOLID claim or interface warning. Judge Velodrome, Aerodrome, Equalizer and other descendants on their own fees, emissions and governance; do not roll their success into this record. A real original-Solidly revival would require an accountable team, maintained contracts, active markets and sustained unaided liquidity. None appears as of this review.',
      [
        claim('Original Solidly lacks a current maintained-team and material-liquidity record.', ['source:solidly:audit-status', 'source:solidly:tvl', 'source:solidly:volume'], 'Historical status and residual metrics.'),
        claim('Successor fees and users must be attributed to each successor, not original Solidly.', ['source:solidly:velodrome-history', 'source:solidly:equalizer'], 'Separate products and teams.', { kind: 'inference' }),
        claim('No reviewed evidence supports an original-Solidly revival.', ['source:solidly:audit-status', 'source:solidly:volume', 'source:solidly:tvl'], 'No current operator or material activity.', { kind: 'unknown' }),
      ],
    ),
  },
  metrics: [
    metric('spot-volume-24h', 'spot_volume', 'Residual spot volume, 24h', 122, ['source:solidly:volume'], 'DefiLlama total24h for original Fantom Solidly.', { scope: 'original Fantom Solidly pools', qualityFlags: ['residual_activity', 'not_operating_liquidity'] }),
    metric('spot-volume-30d', 'spot_volume', 'Residual spot volume, 30d', 3350.86, ['source:solidly:volume'], 'DefiLlama total30d.', { window: 'rolling 30 days', scope: 'original Fantom Solidly pools', qualityFlags: ['residual_activity', 'not_operating_liquidity'] }),
    metric('tvl-latest', 'tvl', 'Residual TVL-like balance', 9876, ['source:solidly:tvl'], 'Latest totalLiquidityUSD.', { scope: 'original Fantom Solidly contracts', qualityFlags: ['residual_balance', 'not_operating_liquidity'] }),
    metric('tvl-peak', 'tvl', 'Historical peak TVL', 2291053156, ['source:solidly:tvl'], 'Maximum totalLiquidityUSD, dated 2022-03-03.', { asOf: '2022-03-03', window: 'historical maximum', qualityFlags: ['historical_not_current'] }),
  ],
  events: [
    event('product-launch', 'launch', '2022-02-10', 'Original Solidly launched its Fantom product; SOLID emissions followed on February 24.', ['source:solidly:product-launch', 'source:solidly:fantom-launch'], 'Dated Fantom Foundation updates distinguish the product launch from emissions.'),
    event('developer-departure', 'stewardship_exit', '2022-03-06', 'Andre Cronje and Anton Nell announced their departure from DeFi days after Solidly launched.', ['source:solidly:departure', 'source:solidly:departure-2'], 'Contemporary independent reports of the same announcement.'),
  ],
  feature: {
    lifecycle: 'dead',
    operating_model: 'Abandoned original Fantom vote-escrowed AMM deployment.',
    product_cohort: 'single_chain_vote_escrow_spot_amm',
    custody_model: 'non_custodial',
    primary_chain: 'Fantom Opera',
    chains: ['Fantom Opera'],
    token_status: 'launched',
    token_symbol: 'SOLID',
    token_launch_date: '2022-02-24',
    token_launch_timing: 'at_or_near_launch',
    token_strategy: 'liquidity_emissions_venft_votes_fees_and_incentives',
    token_source_url: 'https://blog.fantom.foundation/fantom-general-update-march-1-2022/',
    metric_type: 'historical_peak_tvl',
    metric_unit: 'usd',
    metric_window: 'historical_maximum',
    metric_as_of: '2022-03-03',
    metric_observed_at: OBSERVED_AT,
    comparability_key: 'dex|single_chain_vote_escrow_amm|tvl|usd|historical_maximum',
  },
};

const specs = [meteora, dodo, platypus, saddle, solidly];

export const document = {
  schema: 'chaindump-dex-wave-g-v1',
  research_as_of: AS_OF,
  generated_migration: '0086_dex_wave_g_profiles.sql',
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
  return `INSERT INTO _dex_wave_g_profiles_0086 (
  target_table, slug, canonical_profile, feature
) VALUES (${values.join(', ')});`;
}

export function renderMigration(value = document) {
  const stagingStatements = value.cases.map(renderStagingInsert);
  const migration = `-- Five current, source-linked DEX profiles assembled and source-checked ${AS_OF}.
-- Claims remain pending human review. Legacy case fields and source arrays are preserved.

DROP TABLE IF EXISTS _dex_wave_g_profiles_0086;

CREATE TABLE _dex_wave_g_profiles_0086 (
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
FROM _dex_wave_g_profiles_0086 AS staged
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
FROM _dex_wave_g_profiles_0086 AS staged
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
FROM _dex_wave_g_profiles_0086 AS staged
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
FROM _dex_wave_g_profiles_0086
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

DROP TABLE _dex_wave_g_profiles_0086;
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

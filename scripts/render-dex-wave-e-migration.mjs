import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const AS_OF = '2026-08-03';
const CHECKED_AT = '2026-08-03T18:31:22Z';
const NEXT_REVIEW_AT = '2026-08-10T18:31:22Z';
const MIGRATION = '0081_dex_wave_e_profiles.sql';
const SECTION_KEYS = [
  'what_it_is',
  'what_happened',
  'why_this_outcome',
  'strategic_choices',
  'operating_model',
  'token_and_value_capture',
  'counterfactual',
  'risks_and_unknowns',
  'lifecycle',
  'outlook_and_watch',
];

const sid = (slug, key) => `source:${slug}:${key}`;
const rolling = (definition) => ({ start: null, end: CHECKED_AT, definition });
const scope = (product, chains = []) => ({ product, chains });

function source(slug, key, title, url, publisher, role, tier = 'B', publishedAt = null) {
  return {
    id: sid(slug, key),
    title,
    url,
    publisher,
    published_at: publishedAt,
    accessed_at: CHECKED_AT,
    archive_url: null,
    tier,
    role,
    access_state: 'reachable',
    checked_at: CHECKED_AT,
    content_hash: null,
  };
}

function section(body, sourceIds, evidenceLocator, atoms) {
  return { body, source_ids: sourceIds, evidence_locator: evidenceLocator, atoms };
}

function claim(id, fieldPath, assertion, sourceIds, evidenceLocator, options = {}) {
  return {
    id,
    field_path: fieldPath,
    assertion,
    source_ids: sourceIds,
    evidence_locator: evidenceLocator,
    support_direction: options.supportDirection || 'supports',
    note: options.note || null,
    review: { state: 'pending', reviewer: null, reviewed_at: null },
  };
}

function metric(spec, item) {
  return {
    id: `metric:${spec.slug}:${item.key}:${item.as_of}`,
    dimension: item.dimension,
    label: item.label,
    value: item.value,
    unit: item.unit,
    currency: item.currency ?? null,
    window: item.window,
    as_of: item.as_of,
    method: item.method,
    scope: item.scope,
    formula: null,
    raw_input_ids: [],
    claim_ids: [`claim:${spec.slug}:metric:${item.key}`],
    quality_flags: item.quality_flags || [],
  };
}

function event(spec, item) {
  return {
    id: `event:${spec.slug}:${item.key}`,
    type: item.type,
    date: item.date,
    date_precision: item.date_precision || 'day',
    amount_usd: item.amount_usd ?? null,
    description: item.description,
    claim_ids: [`claim:${spec.slug}:event:${item.key}`],
  };
}

function buildProfile(spec) {
  const claims = [
    claim(
      `claim:${spec.slug}:status`,
      'status.operating_state',
      spec.status_assertion,
      spec.status_source_ids,
      spec.status_evidence_locator,
    ),
    claim(
      `claim:${spec.slug}:outcome`,
      'outcome.label',
      spec.outcome_assertion,
      spec.outcome_source_ids,
      spec.outcome_evidence_locator,
      { note: 'Analyst lifecycle classification; not a token-price recommendation.' },
    ),
  ];
  const sections = {};
  const atomicAssertions = {};
  for (const key of SECTION_KEYS) {
    const value = spec.sections[key];
    const claimIds = [];
    atomicAssertions[key] = {};
    for (const atom of value.atoms) {
      const id = `claim:${spec.slug}:section:${key}:${atom.key}`;
      claimIds.push(id);
      atomicAssertions[key][atom.key] = atom.assertion;
      claims.push(claim(
        id,
        `extensions.atomic_assertions.${key}.${atom.key}`,
        atom.assertion,
        atom.source_ids,
        atom.evidence_locator,
        { supportDirection: atom.support_direction, note: atom.note },
      ));
    }
    sections[key] = { body: value.body, as_of: AS_OF, claim_ids: claimIds };
  }
  for (const item of spec.metrics) {
    claims.push(claim(
      `claim:${spec.slug}:metric:${item.key}`,
      `metrics[metric:${spec.slug}:${item.key}:${item.as_of}].value`,
      `${item.label} was ${item.value} ${item.unit} as of ${item.as_of}.`,
      item.source_ids,
      item.evidence_locator,
      { note: item.note },
    ));
  }
  for (const item of spec.events) {
    claims.push(claim(
      `claim:${spec.slug}:event:${item.key}`,
      `events[event:${spec.slug}:${item.key}]`,
      item.description,
      item.source_ids,
      item.evidence_locator,
      { note: item.note },
    ));
  }
  return {
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
    status: {
      operating_state: spec.operating_state,
      as_of: AS_OF,
      claim_ids: [`claim:${spec.slug}:status`],
    },
    outcome: {
      label: spec.outcome_label,
      as_of: AS_OF,
      rule_id: 'exchange-lifecycle-v1',
      confidence: spec.confidence,
      note: spec.outcome_note,
      claim_ids: [`claim:${spec.slug}:outcome`],
    },
    analysis: { sections },
    metrics: spec.metrics.map((item) => metric(spec, item)),
    events: spec.events.map((item) => event(spec, item)),
    sources: spec.sources,
    claims,
    freshness: {
      state: 'current',
      last_reviewed_at: CHECKED_AT,
      next_review_at: NEXT_REVIEW_AT,
      field_reviews: [],
    },
    quality: {
      publication_state: 'review',
      completeness_pct: 100,
      confidence: spec.confidence,
      unsourced_fields: spec.unsourced_fields,
    },
    extensions: {
      atomic_assertions: atomicAssertions,
      methodology_notes: [
        'Freshness records evidence assembly, not editorial approval. Every claim remains pending until a person reviews it.',
        'Volume is not liquidity, TVL is not market depth, fees are not profit, token price is not product adoption, and observed co-movement is not causation.',
        ...spec.methodology_notes,
      ],
    },
  };
}

const aerodromeSources = [
  source('aerodrome', 'docs', 'Aerodrome documentation and economics', 'https://aerodrome.finance/docs', 'Aerodrome', 'primary'),
  source('aerodrome', 'security', 'Aerodrome security and audit registry', 'https://aerodrome.finance/security', 'Aerodrome', 'primary'),
  source('aerodrome', 'launcher', 'Aero Launch documentation', 'https://aerodrome.finance/docs/launcher', 'Aerodrome', 'primary'),
  source('aerodrome', 'legal', 'AERO legal disclosures', 'https://aerodrome.finance/documents/AERO/legal-disclosures.pdf', 'Aerodrome', 'primary', 'A', '2026-06-20'),
  source('aerodrome', 'volume', 'Aerodrome DEX volume API', 'https://api.llama.fi/summary/dexs/aerodrome?dataType=dailyVolume', 'DefiLlama', 'independent'),
  source('aerodrome', 'tvl', 'Aerodrome protocol TVL API', 'https://api.llama.fi/protocol/aerodrome', 'DefiLlama', 'independent'),
  source('aerodrome', 'fees', 'Aerodrome fees API', 'https://api.llama.fi/summary/fees/aerodrome?dataType=dailyFees', 'DefiLlama', 'independent'),
  source('aerodrome', 'revenue', 'Aerodrome protocol revenue API', 'https://api.llama.fi/summary/fees/aerodrome?dataType=dailyRevenue', 'DefiLlama', 'independent'),
  {
    ...source('aerodrome', 'coindesk-aero', 'Aero aims to fix liquidity fragmentation and dethrone incumbents', 'https://www.coindesk.com/business/2026/01/29/aero-dex-aims-to-fix-liquidity-fragmentation-and-dethrone-the-incumbents', 'CoinDesk', 'independent', 'B', '2026-01-29'),
    id: 'aerodrome-coindesk-aero',
    source_tier: 'T3',
    source_role: 'independent',
    resolving: true,
    evidence_reviewed: true,
    evidence_locator: 'Reports Aerodrome’s Base position, TVL context and planned Aerodrome/Velodrome consolidation into Aero.',
    evidence_scope: 'lifecycle_and_strategy_event',
    independence_group: 'aero-project-announcement-2026-01',
    source_dependency: 'Substantially reports the same project-announcement event as the paired The Block coverage; publisher diversity does not make the underlying causal evidence independent.',
    last_verified_at: CHECKED_AT,
    evidence_reviewed_at: '2026-07-29',
    evidence_reviewer: 'codex-research-agent',
    access_checked_at: CHECKED_AT,
    access_http_status: 200,
    access_method: 'direct_http_retrieval',
  },
  {
    ...source('aerodrome', 'theblock-upgrade', 'Aerodrome upgrade suite and planned chain expansion', 'https://www.theblock.co/post/378634/aerodrome-upgrades-evm-extensions-circles-arc-metadex', 'The Block', 'independent', 'B', '2025-11-13'),
    id: 'aerodrome-theblock-aero',
    source_tier: 'T3',
    source_role: 'independent',
    resolving: true,
    evidence_reviewed: true,
    evidence_locator: 'Reports Aerodrome as a successful Base DEX and describes the Aero merger, chain expansion and token conversion.',
    evidence_scope: 'lifecycle_and_strategy_event',
    independence_group: 'aero-project-announcement-2026-01',
    source_dependency: 'Substantially reports the same project-announcement event as the paired CoinDesk coverage; publisher diversity does not make the underlying causal evidence independent.',
    last_verified_at: CHECKED_AT,
    evidence_reviewed_at: '2026-07-29',
    evidence_reviewer: 'codex-research-agent',
    access_checked_at: CHECKED_AT,
    access_http_status: 403,
    access_method: 'indexed_browser_retrieval',
  },
];

const balancerSources = [
  source('balancer', 'whitepaper', 'Balancer whitepaper', 'https://docs.balancer.fi/whitepaper.pdf', 'Balancer', 'primary', 'A'),
  source('balancer', 'v3-docs', 'Balancer V3 documentation', 'https://docs.balancer.fi/', 'Balancer', 'primary'),
  source('balancer', 'postmortem', 'November 3 exploit post-mortem', 'https://medium.com/balancer-protocol/nov-3-exploit-post-mortem-51dcbeb6b020', 'Balancer', 'primary', 'A', '2025-11-18'),
  source('balancer', 'v2-pause', 'Balancer V2 emergency pause documentation', 'https://balancer.gitbook.io/balancer-v2/security/emergency-pause', 'Balancer', 'primary'),
  source('balancer', 'v2-sunset', 'BIP-887: transition to Balancer V3', 'https://forum.balancer.fi/t/bip-887-transitioning-to-balancer-v3-disabling-v2-pool-factories/6874', 'Balancer Governance', 'primary', 'B', '2025-11-05'),
  source('balancer', 'restructure', 'BIP-918: operational restructuring', 'https://forum.balancer.fi/t/bip-918-operational-restructuring-for-balancer/7000', 'Balancer Governance', 'primary', 'B', '2026-03-23'),
  source('balancer', 'labs-winddown', 'On the future of Balancer: shutting down Balancer Labs', 'https://forum.balancer.fi/t/on-the-future-of-balancer-shutting-down-balancer-labs-supporting-the-path-forward/7002', 'Balancer Governance', 'primary', 'B', '2026-03-23'),
  source('balancer', 'tokenomics', 'BIP-919: BAL tokenomics revamp', 'https://forum.balancer.fi/t/bip-919-bal-tokenomics-revamp/7001', 'Balancer Governance', 'primary', 'B', '2026-03-23'),
  source('balancer', 'openzeppelin', 'Understanding the Balancer V2 exploit', 'https://www.openzeppelin.com/news/understanding-the-balancer-v2-exploit', 'OpenZeppelin', 'independent', 'A', '2025-11-07'),
  source('balancer', 'volume', 'Balancer DEX volume API', 'https://api.llama.fi/summary/dexs/balancer?dataType=dailyVolume', 'DefiLlama', 'independent'),
  source('balancer', 'tvl', 'Balancer protocol TVL API', 'https://api.llama.fi/protocol/balancer', 'DefiLlama', 'independent'),
  source('balancer', 'fees', 'Balancer fees API', 'https://api.llama.fi/summary/fees/balancer?dataType=dailyFees', 'DefiLlama', 'independent'),
];

const bancorSources = [
  source('bancor', 'v21', 'Bancor v2.1 single-sided AMM proposal', 'https://gov.bancor.network/t/proposing-bancor-v2-1-single-sided-amm-exposure-with-elastic-bnt-supply/35', 'Bancor Governance', 'primary', 'B', '2020-10-18'),
  source('bancor', 'bancor3', 'BIP15: Bancor 3', 'https://gov.bancor.network/t/bip15-proposing-bancor-3/3445/48', 'Bancor Governance', 'primary', 'B', '2022-03-11'),
  source('bancor', 'vortex', 'BIP9: Bancor Vortex', 'https://gov.bancor.network/t/bip9-proposing-the-bancor-vortex/354', 'Bancor Governance', 'primary', 'B', '2020-12-06'),
  source('bancor', 'emergency', 'Ratification of June 19 emergency actions', 'https://gov.bancor.network/t/ratification-of-emergency-actions-taken-on-sunday-19th-june-utc/3714', 'Bancor Governance', 'primary', 'A', '2022-06-26'),
  source('bancor', 'deficit', 'wBTC and ETH deficit discussion', 'https://gov.bancor.network/t/wbtc-and-eth-deficit/4931', 'Bancor Governance', 'primary', 'B', '2024-02-08'),
  source('bancor', 'four-years', 'Community request for a current deficit reconciliation', 'https://gov.bancor.network/t/four-years-later-what-has-actually-changed-on-the-deficit-and-what-comes-next/6953', 'Bancor community forum', 'independent', 'C', '2026-04-09'),
  source('bancor', 'pol-repair', 'Proposal to use protocol-owned liquidity to reduce deficits', 'https://gov.bancor.network/t/proposal-to-use-pol-to-reduce-b3-deficits/4502', 'Bancor Governance', 'primary', 'B', '2023-10-01'),
  source('bancor', 'dune-deficit', 'Bancor 3 surplus and deficit dashboard', 'https://dune.com/bancor/bancor3-surplus-deficit', 'Dune', 'independent'),
  source('bancor', 'volume', 'Bancor DEX volume API', 'https://api.llama.fi/summary/dexs/bancor?dataType=dailyVolume', 'DefiLlama', 'independent'),
  source('bancor', 'tvl', 'Bancor protocol TVL API', 'https://api.llama.fi/protocol/bancor', 'DefiLlama', 'independent'),
  source('bancor', 'fees', 'Bancor fees API', 'https://api.llama.fi/summary/fees/bancor?dataType=dailyFees', 'DefiLlama', 'independent'),
  source('bancor', 'independent-pause', 'Bancor suspends impermanent-loss protection', 'https://www.investing.com/news/cryptocurrency-news/bancor-suspends-impermanent-loss-protection-citing-market-strain-2838858', 'Investing.com', 'independent', 'B', '2022-06-20'),
];

const gmxSources = [
  source('gmx-v1', 'contracts', 'GMX V1 contracts', 'https://docs.gmx.io/docs/archived/contracts-v1/', 'GMX', 'primary'),
  source('gmx-v1', 'archived', 'GMX archived product status', 'https://docs.gmx.io/docs/category/archived/', 'GMX', 'primary'),
  source('gmx-v1', 'trading', 'Trading on GMX V1', 'https://docs.gmx.io/docs/archived/trading-v1/', 'GMX', 'primary'),
  source('gmx-v1', 'liquidity', 'Liquidity on GMX V1', 'https://docs.gmx.io/docs/archived/liquidity-v1/', 'GMX', 'primary'),
  source('gmx-v1', 'incident', 'Resolve recovered Arbitrum GLP funds', 'https://gov.gmx.io/t/discussion-resolve-the-distribution-plan-for-the-recovered-funds-from-arbitrum-glp/4678', 'GMX Governance', 'primary', 'A', '2025-07-17'),
  source('gmx-v1', 'plan', 'GLP V1 Arbitrum distribution plan', 'https://gov.gmx.io/t/glp-v1-arbitrum-distribution-plan/4748', 'GMX Governance', 'primary', 'A', '2025-08-04'),
  source('gmx-v1', 'plan-action', 'GLP distribution plan of action', 'https://gov.gmx.io/t/glp-distribution-plan-of-action/4703', 'GMX Governance', 'primary', 'B', '2025-07-28'),
  source('gmx-v1', 'archi', 'Archi Finance security incident distribution', 'https://gov.gmx.io/t/archi-finance-security-incident-distribution/4906', 'GMX Governance', 'primary', 'B', '2025-10-28'),
  source('gmx-v1', 'archi-stuck', 'Assist V1 GLP depositors stuck in Archi Finance', 'https://gov.gmx.io/t/assist-v1-glp-depositors-stuck-in-archi-finance/4521', 'GMX Governance', 'primary', 'B', '2025-04-16'),
  source('gmx-v1', 'coindesk', 'GMX V1 exploited for $42 million', 'https://www.coindesk.com/business/2025/07/09/decentralized-exchange-gmx-exploited-for-usd42m-offers-hacker-10-white-hat-bounty', 'CoinDesk', 'independent', 'B', '2025-07-09'),
];

const mangoSources = [
  source('mango-markets', 'v4-repository', 'Mango V4 program and client repository', 'https://github.com/blockworks-foundation/mango-v4', 'Blockworks Foundation', 'primary'),
  source('mango-markets', 'sec-release', 'SEC charges and settlement with Mango entities', 'https://www.sec.gov/enforcement-litigation/litigation-releases/lr-26140', 'U.S. SEC', 'independent', 'A', '2024-09-27'),
  source('mango-markets', 'sec-complaint', 'SEC complaint concerning Mango entities', 'https://www.sec.gov/files/litigation/complaints/2024/comp-pr2024-154.pdf', 'U.S. SEC', 'independent', 'A', '2024-09-27'),
  source('mango-markets', 'cftc-release', 'CFTC charges Avraham Eisenberg', 'https://www.cftc.gov/PressRoom/PressReleases/8647-23', 'U.S. CFTC', 'independent', 'A', '2023-01-09'),
  source('mango-markets', 'cftc-complaint', 'CFTC complaint concerning Mango manipulation', 'https://www.cftc.gov/media/8046/enfeisenbergcomplaint010923/download', 'U.S. CFTC', 'independent', 'A', '2023-01-09'),
  source('mango-markets', 'doj-indictment', 'DOJ indictment and initial appearance', 'https://www.justice.gov/usao-sdny/pr/alleged-perpetrator-100-million-crypto-market-manipulation-scheme-make-initial', 'U.S. Department of Justice', 'independent', 'A', '2023-02-02'),
  source('mango-markets', 'doj-conviction', 'Man convicted for $110 million Mango scheme', 'https://www.justice.gov/usao-sdny/pr/man-convicted-110-million-cryptocurrency-scheme', 'U.S. Department of Justice', 'independent', 'A', '2024-04-18'),
  source('mango-markets', 'court-vacatur', 'Opinion vacating Mango-related convictions and entering wire-fraud acquittal', 'https://nysd.uscourts.gov/sites/default/files/2025-05/23cr10%20Opinion%20and%20Order.pdf', 'U.S. District Court, Southern District of New York', 'independent', 'A', '2025-05-23'),
  source('mango-markets', 'winddown', 'Mango Markets to wind down after settlement and DAO battle', 'https://www.theblock.co/post/334172/mango-markets-to-wind-down-in-wake-of-sec-settlement-dao-battle', 'The Block', 'independent', 'B', '2025-01-12'),
  source('mango-markets', 'dlnews', 'Mango DAO votes to shut down', 'https://www.dlnews.com/articles/defi/mango-dao-votes-to-shut-down-following-sec-settlement/', 'DL News', 'independent', 'B', '2025-01-14'),
  source('mango-markets', 'coindesk-exploit', 'How market manipulation drained Mango Markets', 'https://www.coindesk.com/markets/2022/10/12/how-market-manipulation-led-to-a-100m-exploit-on-solana-defi-exchange-mango', 'CoinDesk', 'independent', 'B', '2022-10-12'),
  source('mango-markets', 'volume', 'Mango Markets DEX volume API', 'https://api.llama.fi/summary/dexs/mango-markets?dataType=dailyVolume', 'DefiLlama', 'independent'),
  source('mango-markets', 'tvl', 'Mango Markets protocol TVL API', 'https://api.llama.fi/protocol/mango-markets', 'DefiLlama', 'independent'),
];

const A = (key) => ({
  'coindesk-aero': 'aerodrome-coindesk-aero',
  'theblock-upgrade': 'aerodrome-theblock-aero',
}[key] || sid('aerodrome', key));
const aerodrome = buildProfile({
  slug: 'aerodrome',
  name: 'Aerodrome',
  aliases: ['Aerodrome Finance'],
  operating_state: 'operating',
  outcome_label: 'successful_established',
  confidence: 'high',
  outcome_note: 'Established means durable activity and Base leadership, not proof that emissions are costless or the planned Aero migration will succeed.',
  classification: {
    subtype: 'Base-native vote-directed spot AMM',
    tags: ['spot_amm', 'concentrated_liquidity', 'vote_escrow', 'single_chain'],
    chains: ['Base'],
    jurisdictions: [],
  },
  sources: aerodromeSources,
  status_assertion: 'Aerodrome was operating on Base on Aug. 3, 2026, with current volume, TVL and fee observations.',
  status_source_ids: [A('volume'), A('tvl'), A('fees')],
  status_evidence_locator: 'DefiLlama total24h, currentChainTvls.Base and total30d fields retrieved at the research timestamp.',
  outcome_assertion: 'Aerodrome is an established successful DEX, while its emissions and planned Aero migration remain material execution risks.',
  outcome_source_ids: [A('docs'), A('volume'), A('tvl'), A('coindesk-aero')],
  outcome_evidence_locator: 'Official operating model and April 2026 track record read with independent current activity and merger reporting.',
  sections: {
    what_it_is: section(
      'Aerodrome is a non-custodial decentralized exchange built for Base. Traders exchange tokens against user-funded automated-market-maker pools rather than an exchange-owned order book. The protocol supports conventional constant-product pools and Slipstream concentrated-liquidity pools, so liquidity providers choose both assets and a pool design and then carry price, range and smart-contract risk. Aerodrome also runs a weekly market for directing liquidity incentives: liquid AERO is emitted to eligible pools, while locked veAERO positions vote on where those emissions go and receive the fees and third-party incentives associated with their votes. That makes Aerodrome both a trading venue and a coordination layer for Base liquidity. It does not make Base activity, pool TVL or token rewards interchangeable measures.',
      [A('docs'), A('security')],
      'Current documentation sections “About Aerodrome,” “Economics Overview,” “Protocol Details” and current audit registry.',
      [
        { key: 'base-dex', assertion: 'Aerodrome is a Base-native non-custodial AMM with constant-product and Slipstream concentrated-liquidity pools.', source_ids: [A('docs')], evidence_locator: 'Documentation “About Aerodrome” and “Protocol Details” pool descriptions.' },
        { key: 'vote-market', assertion: 'veAERO voters direct weekly AERO emissions and receive fees and deposited voting incentives from pools they support.', source_ids: [A('docs'), A('legal')], evidence_locator: 'Economics Overview flywheel and legal-disclosure incentive-mechanism table.' },
      ],
    ),
    what_happened: section(
      'Aerodrome launched on Aug. 28, 2023, without a token sale and quickly became a major liquidity venue on Base. Its design paired early AERO emissions with weekly vote-directed gauges, then added Slipstream concentrated liquidity and permissionless launch tooling. Aerodrome’s own April 2026 snapshot says cumulative trading exceeded $185 billion and swap fees exceeded $270 million; those are operator-reported lifetime figures and are not treated as an independent audit. At the Aug. 3 research snapshot, DefiLlama reported $302.29 million of rolling 24-hour volume, $10.94 billion over 30 days, $266.43 million of TVL and $5.77 million of 30-day fees. Aerodrome also announced that it would merge with Velodrome into Aero on MetaDEX03, turning a successful single-chain venue into an unfinished migration case.',
      [A('docs'), A('volume'), A('tvl'), A('fees'), A('coindesk-aero')],
      'Official launch and track-record sections, independently replayed API totals, and dated Aero merger coverage.',
      [
        { key: 'launch-and-scale', assertion: 'Aerodrome launched on Aug. 28, 2023, and its official April 2026 snapshot reported more than $185 billion of cumulative volume.', source_ids: [A('docs')], evidence_locator: 'Documentation “About Aerodrome” launch date and “Track Record” operator figures.' },
        { key: 'launch-tooling', assertion: 'Aerodrome added Aero Launch as protocol tooling for permissionless token launches and liquidity formation on Base.', source_ids: [A('launcher')], evidence_locator: 'Official Aero Launch documentation and product description.' },
        { key: 'current-activity', assertion: 'DefiLlama reported $302.29 million of 24-hour volume, $10.94 billion of 30-day volume and $266.43 million of TVL at the Aug. 3 snapshot.', source_ids: [A('volume'), A('tvl')], evidence_locator: 'Volume total24h/total30d and protocol currentChainTvls.Base fields retrieved 2026-08-03T18:31:22Z.' },
        { key: 'aero-plan', assertion: 'Aerodrome planned to merge with Velodrome into Aero using MetaDEX03 in 2026.', source_ids: [A('docs'), A('coindesk-aero'), A('theblock-upgrade')], evidence_locator: 'Official “About Aerodrome” roadmap and independent merger reports.' },
      ],
    ),
    why_this_outcome: section(
      'The strongest supported explanation for Aerodrome’s success is distribution plus a deliberate liquidity-acquisition machine. Base supplied a fast-growing chain and user funnel; Aerodrome gave token issuers a way to pay veAERO voters for emissions; those emissions paid liquidity providers; deeper pools could improve execution and generate more fees; and fees attracted future votes. The loop is observable in the rules and consistent with current scale. It is not a clean causal experiment. Public evidence does not separate activity caused by Base growth, Coinbase distribution, integrations, organic repeat trading, AERO emissions or third-party incentives. Aerodrome should therefore be called an established venue with a productive flywheel, not proof that vote markets always create durable demand or that its current volume would survive materially lower subsidies.',
      [A('docs'), A('volume'), A('fees'), A('coindesk-aero')],
      'Official economic-flywheel steps compared with independent activity and strategic context; no causal coefficient is inferred.',
      [
        { key: 'distribution-mechanism', assertion: 'Aerodrome combines Base distribution with a weekly vote, emission, liquidity and fee flywheel.', source_ids: [A('docs'), A('coindesk-aero')], evidence_locator: 'Economics Overview “Economic Engine” and independent Base-position discussion.' },
        { key: 'causal-boundary', assertion: 'The reviewed evidence does not isolate Base growth, emissions, voting incentives, integrations and organic repeat demand as separate causal effects.', source_ids: [A('docs'), A('volume'), A('fees')], evidence_locator: 'Mechanism documents and aggregate adapter totals lack a controlled contribution or retention breakdown.', support_direction: 'context_only', note: 'Explicit causal unknown.' },
      ],
    ),
    strategic_choices: section(
      'Aerodrome made four consequential choices. It focused on Base rather than spreading liquidity across chains at launch, gaining local density while accepting single-chain dependence. It separated liquid AERO rewards from locked veAERO voting and fee rights, turning liquidity direction into a recurring market while creating dilution and governance-concentration risk. It distributed protocol-generated value to active participants instead of presenting a conventional corporate fee margin; the Foundation and Dromos Labs participate through locked positions and a team emissions allocation. Finally, it chose to consolidate Aerodrome and Velodrome into Aero rather than preserve two chain-specific brands. That could widen distribution and reduce fragmentation, but it adds contract, governance, token-conversion and migration risk to a venue that was already working.',
      [A('docs'), A('legal'), A('coindesk-aero'), A('theblock-upgrade')],
      'Official economic, development-allocation and emissions sections plus independent reporting on the Aero consolidation.',
      [
        { key: 'token-design', assertion: 'Aerodrome chose liquid AERO for LP emissions and locked veAERO for voting and exchange-revenue rights.', source_ids: [A('docs'), A('legal')], evidence_locator: 'AERO and veAERO role descriptions in official documentation and legal disclosures.' },
        { key: 'cross-chain-merger', assertion: 'Aerodrome chose a future cross-chain consolidation into Aero instead of remaining a Base-only protocol.', source_ids: [A('docs'), A('coindesk-aero'), A('theblock-upgrade')], evidence_locator: 'MetaDEX03 roadmap and two independent reports of Aerodrome/Velodrome consolidation.' },
      ],
    ),
    operating_model: section(
      'Traders route swaps through Aerodrome pools and pay a pool-specific fee. Liquidity providers deposit both sides of a pool, choose constant-product or concentrated-liquidity exposure, and may either stake for AERO emissions or remain unstaked and earn swap fees; the same deposit does not earn both at once. veAERO voters allocate next week’s emissions according to weekly votes and receive the prior period’s eligible swap fees plus any voting incentives deposited by asset issuers. Aerodrome documents a default ten-percent protocol take from unstaked liquidity in selected emissions-eligible Slipstream pools. The system is permissionless at pool creation but gated for emissions eligibility. Reported fees are gross protocol-adapter fees, not audited profit after emissions, incentives, audits, development, losses or Foundation spending.',
      [A('docs'), A('fees'), A('revenue')],
      'Protocol Details, Value Distribution and Token Listing sections compared with separately labeled fee and revenue adapter totals.',
      [
        { key: 'lp-choice', assertion: 'Aerodrome LP deposits can earn AERO emissions when staked or swap fees when unstaked, but not both simultaneously.', source_ids: [A('docs')], evidence_locator: 'Protocol Details “Unstaked Liquidity” and Value Distribution sections.' },
        { key: 'fee-boundary', assertion: 'DefiLlama fee and revenue adapter figures are not audited net profit and must be kept separate from token emissions and third-party incentives.', source_ids: [A('fees'), A('revenue'), A('docs')], evidence_locator: 'Adapter totals compared with documented emission, incentive and development flows.', support_direction: 'context_only' },
      ],
    ),
    token_and_value_capture: section(
      'AERO launched with the exchange in August 2023. New AERO is minted weekly and streamed to eligible liquidity pools; locking AERO creates a veAERO NFT that votes on emissions and receives exchange revenue from supported pools. Aerodrome’s April 2026 documentation estimated 10.9 percent annualized emissions, 1.88 billion total AERO and roughly 51 percent of supply locked for an average of 3.7 years. Those are dated operator figures, not immutable current values. The economic link is stronger than governance alone because veAERO operators receive eligible fees and voting incentives, while LPs receive emissions or direct fees. It is still not equity or a guaranteed claim: returns depend on voting, pool productivity, lock duration, emission policy and the planned conversion into Aero. Five percent of weekly emissions funds Dromos Labs through a max-locked position.',
      [A('docs'), A('legal'), A('fees')],
      'Official AERO/veAERO, Emissions, Development and Track Record sections with independently tracked fees.',
      [
        { key: 'value-link', assertion: 'Locked veAERO positions vote on emissions and receive eligible swap fees and voting incentives.', source_ids: [A('docs'), A('legal')], evidence_locator: 'Economics Overview and legal-disclosure incentive-mechanism table.' },
        { key: 'emission-cost', assertion: 'Aerodrome reported approximately 10.9% annualized AERO emissions as of April 2026 and allocates 5% of weekly emissions to Dromos Labs.', source_ids: [A('docs')], evidence_locator: 'AERO Emissions at a Glance and Development allocation sections.' },
      ],
    ),
    counterfactual: section(
      'A fee-only launch with little or no AERO issuance would reduce dilution and make organic demand easier to observe, but it might fail to attract enough early liquidity for competitive execution on a new chain. A multi-chain launch would diversify Base risk, yet it would fragment incentives and operational attention before the product had local density. Keeping Aerodrome and Velodrome separate would avoid migration and token-conversion risk, but preserve duplicated governance and fragmented liquidity. None of those alternatives was run as a controlled comparison. The practical counterfactual test is forward-looking: if fee-producing volume and pool depth remain resilient as realized emissions and external incentives change, the venue has more durable demand than a subsidy-only explanation implies. If activity falls with incentives, the current success was more rented than retained.',
      [A('docs'), A('volume'), A('fees'), A('coindesk-aero')],
      'Observed emission, chain-focus and merger choices used only to bound unobserved alternatives.',
      [
        { key: 'low-emission-alternative', assertion: 'A lower-emission launch could reduce dilution but its effect on early liquidity and execution is not measured.', source_ids: [A('docs'), A('volume')], evidence_locator: 'Documented weekly-emission mechanism and aggregate activity lack a fee-only control case.', support_direction: 'context_only', note: 'Counterfactual, not observed history.' },
        { key: 'no-merger-alternative', assertion: 'Keeping Aerodrome and Velodrome separate would avoid migration risk while preserving cross-protocol fragmentation.', source_ids: [A('docs'), A('coindesk-aero')], evidence_locator: 'Documented Aero consolidation used to define the unobserved no-merger alternative.', support_direction: 'context_only', note: 'Counterfactual, outcome unknown.' },
      ],
    ),
    risks_and_unknowns: section(
      'Aerodrome carries ordinary AMM risks—smart-contract failure, token scams, range loss, oracle and integration problems—plus risks created by its vote market. Large veAERO holders or aggregators can concentrate emission direction; issuers can pay incentives that make a pool look productive before organic fees exist; recurring AERO issuance can dilute liquid holders; and a Base outage or demand shock affects nearly the entire venue. The Aero migration adds new contracts, token terms and cross-chain operating surfaces. Aerodrome publishes audits, but audits are not guarantees and the future MetaDEX03 implementation is not proven by MetaDEX02 history. Unknowns include retained traders, pool-level slippage, effective voting concentration after delegation, emissions and incentives per dollar of organic fee revenue, treasury runway, audited expenses and final Aero conversion terms.',
      [A('security'), A('docs'), A('volume'), A('fees'), A('coindesk-aero')],
      'Current audit registry, vote/emission mechanics, aggregate operating totals and announced migration scope.',
      [
        { key: 'governance-risk', assertion: 'Aerodrome’s weekly vote market creates governance-concentration and paid-incentive risks that aggregate volume does not resolve.', source_ids: [A('docs'), A('volume')], evidence_locator: 'Voting Incentives and Epoch mechanics compared with volume totals that lack voter concentration.' },
        { key: 'migration-unknowns', assertion: 'Final Aero contracts, audits, token-conversion terms and post-migration liquidity retention were not established by the reviewed sources.', source_ids: [A('docs'), A('security'), A('coindesk-aero')], evidence_locator: 'Roadmap and current audit registry describe a planned successor but not completed migration outcomes.', support_direction: 'context_only' },
      ],
    ),
    lifecycle: section(
      'Aerodrome launched on Base on Aug. 28, 2023 with AERO, veAERO and a vote-directed liquidity model adapted from Velodrome. It established constant-product pools, then added Slipstream concentrated liquidity, launch programs and additional economic controls. By April 2026 the operator reported more than $185 billion of cumulative volume and more than $270 million of swap fees, while independent adapters still showed substantial August activity. The lifecycle is therefore a real growth and establishment case, not merely a launch spike. It is also entering a transition: the planned Aero system would merge Aerodrome and Velodrome, extend to more chains and introduce MetaDEX03. Until migration contracts, token terms and retained liquidity are observable, the current lifecycle call remains successful Aerodrome with pending successor execution—not completed Aero success.',
      [A('docs'), A('volume'), A('fees'), A('coindesk-aero'), A('theblock-upgrade')],
      'Official launch and track record, current independent activity, and dated successor-plan reporting.',
      [
        { key: 'established-phase', assertion: 'Aerodrome progressed from an August 2023 launch to substantial operator-reported lifetime activity and current independent volume.', source_ids: [A('docs'), A('volume')], evidence_locator: 'Official launch/track record and DefiLlama Aug. 3 volume totals.' },
        { key: 'transition-phase', assertion: 'Aerodrome was planning a successor migration into Aero, so successor execution remained incomplete at the as-of date.', source_ids: [A('docs'), A('coindesk-aero'), A('theblock-upgrade')], evidence_locator: '2026 roadmap and independent migration coverage.' },
      ],
    ),
    outlook_and_watch: section(
      'Base case: Aerodrome remains Base’s major liquidity venue while the team and token operators prepare Aero. The upside requires Aero to preserve Base depth, add useful cross-chain distribution and keep fee growth ahead of dilution and migration costs. The downside is a governance or migration shock, or a gradual reveal that emissions and paid votes were supporting liquidity that will not stay. Watch 24-hour and 30-day spot volume, TVL without calling it market depth, pool-level slippage, fees, fee yield, Base DEX share, AERO issued per dollar of fee revenue, third-party voting incentives, veAERO concentration, average lock duration, audit coverage, incident history, Aero milestones, token-conversion terms and liquidity retention after migration. Retained traders and pool-level organic-fee share remain especially important missing fields.',
      [A('volume'), A('tvl'), A('fees'), A('docs'), A('security'), A('coindesk-aero')],
      'Current operating metrics and documented emissions, governance, security and migration mechanisms.',
      [
        { key: 'base-case', assertion: 'The base case is continued Base operation while Aero preparation proceeds, not automatic cross-chain success.', source_ids: [A('volume'), A('tvl'), A('docs')], evidence_locator: 'Current activity plus official but unfinished Aero roadmap.', support_direction: 'context_only', note: 'Scenario analysis.' },
        { key: 'watch-signals', assertion: 'Fee productivity relative to AERO emissions, voting incentives, governance concentration and migration retention are the key durability signals.', source_ids: [A('fees'), A('docs'), A('coindesk-aero')], evidence_locator: 'Fee totals, token mechanics and announced migration used to define measurable review triggers.', support_direction: 'context_only' },
      ],
    ),
  },
  metrics: [
    { key: 'spot-volume-24h', dimension: 'spot_volume', label: 'Aerodrome spot volume, rolling 24 hours', value: 302291376, unit: 'usd', currency: 'USD', as_of: CHECKED_AT, window: rolling('rolling_24h'), method: 'DefiLlama Aerodrome DEX adapter total24h', scope: scope('Aerodrome', ['Base']), source_ids: [A('volume')], evidence_locator: 'total24h retrieved at 2026-08-03T18:31:22Z.', quality_flags: ['not_unique_users', 'volume_not_revenue'] },
    { key: 'spot-volume-30d', dimension: 'spot_volume', label: 'Aerodrome spot volume, rolling 30 days', value: 10942330513, unit: 'usd', currency: 'USD', as_of: CHECKED_AT, window: rolling('rolling_30d'), method: 'DefiLlama Aerodrome DEX adapter total30d', scope: scope('Aerodrome', ['Base']), source_ids: [A('volume')], evidence_locator: 'total30d retrieved at 2026-08-03T18:31:22Z.', quality_flags: ['not_unique_users'] },
    { key: 'tvl', dimension: 'tvl', label: 'Aerodrome tracked TVL', value: 266431861, unit: 'usd', currency: 'USD', as_of: CHECKED_AT, window: rolling('point_in_time'), method: 'DefiLlama Aerodrome protocol currentChainTvls.Base', scope: scope('Aerodrome', ['Base']), source_ids: [A('tvl')], evidence_locator: 'currentChainTvls.Base retrieved at 2026-08-03T18:31:22Z.', quality_flags: ['tvl_not_market_depth'] },
    { key: 'fees-30d', dimension: 'fees', label: 'Aerodrome fees, rolling 30 days', value: 5771108, unit: 'usd', currency: 'USD', as_of: CHECKED_AT, window: rolling('rolling_30d'), method: 'DefiLlama Aerodrome fee adapter total30d', scope: scope('Aerodrome', ['Base']), source_ids: [A('fees')], evidence_locator: 'total30d retrieved at 2026-08-03T18:31:22Z.', quality_flags: ['fees_not_profit'] },
  ],
  events: [
    { key: 'launch', type: 'launch', date: '2023-08-28', description: 'Aerodrome launched on Base with AERO and veAERO.', source_ids: [A('docs'), A('legal')], evidence_locator: 'Official About and legal-disclosure launch records.' },
    { key: 'aero-announcement', type: 'migration_announcement', date: '2026-01-29', description: 'The planned Aero consolidation of Aerodrome and Velodrome was publicly detailed.', source_ids: [A('coindesk-aero'), A('docs')], evidence_locator: 'Dated independent report and official 2026 roadmap.' },
  ],
  unsourced_fields: ['Unique and retained traders', 'Pool-level organic fees net of voting incentives', 'Effective veAERO concentration after delegation', 'Audited expenses and treasury runway', 'Final Aero conversion and migration outcomes'],
  methodology_notes: [
    'Operator-reported April 2026 lifetime totals are kept separate from independently replayed Aug. 3 adapter observations.',
    'Aerodrome success and Aero successor execution are separate lifecycle judgments.',
  ],
});

const L = (key) => sid('balancer', key);
const balancer = buildProfile({
  slug: 'balancer',
  name: 'Balancer',
  aliases: ['Balancer V2', 'Balancer V3'],
  operating_state: 'operating',
  outcome_label: 'operating_declining_after_exploit',
  confidence: 'high',
  outcome_note: 'Balancer V3 remains live, but current scale, the V2 loss and a smaller operating organization support a declining rather than recovered call.',
  classification: {
    subtype: 'programmable multi-pool AMM',
    tags: ['spot_amm', 'weighted_pools', 'stable_pools', 'multi_chain', 'post_exploit'],
    chains: ['Ethereum', 'Arbitrum', 'Base', 'Gnosis', 'Avalanche', 'Polygon', 'Optimism', 'Monad', 'Hyperliquid L1'],
    jurisdictions: [],
  },
  sources: balancerSources,
  status_assertion: 'Balancer remained operating on Aug. 3, 2026, with V3 and unaffected V2 pool types live after the November 2025 V2 Composable Stable Pool exploit.',
  status_source_ids: [L('postmortem'), L('v3-docs'), L('volume'), L('tvl')],
  status_evidence_locator: 'Post-mortem affected/unaffected scope and current DefiLlama volume and TVL fields.',
  outcome_assertion: 'Balancer is a diminished but operating protocol after a major V2 exploit and 2026 operational restructuring.',
  outcome_source_ids: [L('postmortem'), L('restructure'), L('labs-winddown'), L('tvl'), L('volume')],
  outcome_evidence_locator: 'Official incident and restructuring records compared with current independent activity.',
  sections: {
    what_it_is: section(
      'Balancer is a programmable automated-market-maker protocol rather than one fixed pool formula. Its original design lets pool creators choose unequal asset weights, multiple assets and custom fee logic, making pools useful for both trading and portfolio-like exposure. V2 centralized token accounting in a shared Vault while pool contracts supplied pricing logic; V3 keeps the programmable-liquidity goal with a new architecture, uniform precision and explicit controls. Traders remain self-custodial until transactions execute, and liquidity providers own pool shares rather than deposits at a company. “Balancer” therefore spans versions, pool types and chains. A V2 Composable Stable Pool exploit does not mean every Balancer pool or V3 was compromised, while a surviving V3 deployment does not erase V2 user losses.',
      [L('whitepaper'), L('v3-docs'), L('postmortem')],
      'Whitepaper pool model, current V3 architecture and post-mortem affected-product boundary.',
      [
        { key: 'programmable-amm', assertion: 'Balancer generalizes AMMs into programmable weighted and multi-asset pools rather than one fixed 50:50 pair design.', source_ids: [L('whitepaper')], evidence_locator: 'Whitepaper weighted-pool and multi-asset invariant sections.' },
        { key: 'version-boundary', assertion: 'The November 2025 exploit affected a subset of V2 Composable Stable Pools; Balancer V3 was unaffected.', source_ids: [L('postmortem'), L('openzeppelin')], evidence_locator: 'Official “Why Balancer V3 Is Unaffected” and independent exploit-scope analysis.' },
      ],
    ),
    what_happened: section(
      'Balancer turned programmable pools and the V2 Vault into widely integrated DeFi infrastructure, but its capital base declined from the 2021 cycle while complexity accumulated across versions and chains. On Nov. 3, 2025, attackers exploited incorrect rounding in the exact-out path of certain V2 Composable Stable Pools under low-liquidity conditions. Balancer’s post-mortem estimates $121.1 million of total losses across Balancer and affected forks, with $45.7 million protected or recovered, and describes $94.8 million stolen from Balancer-deployed pools. V3 was unaffected, but the incident accelerated V2 stable-pool retirement. In March 2026 Balancer Labs wound down and governance proposed a 12.5-FTE OpCo with a $1.9 million annual budget. On Aug. 3 adapters showed $60.83 million TVL and $334.16 million of 30-day volume.',
      [L('postmortem'), L('openzeppelin'), L('v2-sunset'), L('restructure'), L('labs-winddown'), L('tvl'), L('volume')],
      'Dated technical incident, transition and restructuring records plus Aug. 3 adapter totals.',
      [
        { key: 'v2-exploit', assertion: 'On Nov. 3, 2025, specific V2 Composable Stable Pools were exploited through an exact-out rounding path under required low-liquidity and rate-provider conditions.', source_ids: [L('postmortem'), L('openzeppelin')], evidence_locator: 'Official Technical Breakdown and independent exploit analysis.' },
        { key: 'restructuring', assertion: 'Balancer Labs wound down in March 2026 and BIP-918 proposed a 12.5-FTE OpCo with a $1.9 million annual budget.', source_ids: [L('labs-winddown'), L('restructure')], evidence_locator: 'Founder wind-down statement and BIP-918 summary/budget.' },
        { key: 'current-scale', assertion: 'DefiLlama reported $60.83 million TVL and $334.16 million of 30-day DEX volume at the Aug. 3 snapshot.', source_ids: [L('tvl'), L('volume')], evidence_locator: 'Protocol latest TVL and DEX total30d fields retrieved 2026-08-03T18:31:22Z.' },
      ],
    ),
    why_this_outcome: section(
      'Balancer’s innovation and its failure share a root: generality. Weighted pools, shared accounting and batch operations let developers build liquidity products that a simple pairwise AMM could not support. That flexibility attracted integrations, but also expanded the number of mathematical states, contract versions and composable interactions that had to remain safe. The 2025 attack required a specific combination of rounding direction, rate providers, composable BPT and low liquidity; it turned small precision losses into a repeatable drain. V3’s cleaner precision rules blocked that path, showing that architecture mattered, but capital, reputation and staffing did not reset when the code changed. Balancer remains useful and live because the core design still serves specialized pools. It is declining because the exploit, migration burden, competition and operating contraction reduced trust and resources together.',
      [L('whitepaper'), L('postmortem'), L('openzeppelin'), L('restructure'), L('tvl')],
      'Original generality thesis, specific exploit prerequisites, V3 prevention properties and post-incident organizational scale.',
      [
        { key: 'generality-tradeoff', assertion: 'Balancer’s programmable pool and shared-Vault design increased composability while also increasing the state and integration surface that required protection.', source_ids: [L('whitepaper'), L('postmortem'), L('openzeppelin')], evidence_locator: 'Whitepaper architecture and exploit mechanics involving Vault batch swaps and composable pools.' },
        { key: 'recovery-boundary', assertion: 'V3 avoiding the specific exploit path does not by itself restore lost capital, reputation or operating capacity.', source_ids: [L('postmortem'), L('restructure'), L('tvl')], evidence_locator: 'V3 unaffected statement compared with post-exploit budget reset and current TVL.', support_direction: 'context_only' },
      ],
    ),
    strategic_choices: section(
      'Balancer chose weighted multi-asset pools over a narrow 50:50 exchange, enabling index-like products but accepting harder mathematics and integrations. V2 put token accounting in a shared Vault and enabled batch swaps, improving gas efficiency and composability while creating a common interaction layer. It kept V2 pool types available during a gradual V3 transition; that preserved user choice and old integrations, but some V2 stable pools remained reachable after emergency pause windows expired. After the exploit, governance disabled vulnerable factories and gauges and accelerated migration rather than restart the same design. The 2026 choice to close Balancer Labs and continue through a smaller DAO OpCo reduced spending and extended modeled runway, but also concentrated more responsibility in fewer people. A companion tokenomics proposal sought to route protocol fees to treasury rather than assume growth would finance itself.',
      [L('whitepaper'), L('v2-pause'), L('postmortem'), L('v2-sunset'), L('restructure'), L('tokenomics')],
      'Architecture, pause-window, transition and approved/proposed governance records.',
      [
        { key: 'gradual-migration', assertion: 'Balancer kept legacy V2 pools available during a gradual V3 migration, preserving continuity while leaving some older pool exposure.', source_ids: [L('v2-pause'), L('v2-sunset'), L('postmortem')], evidence_locator: 'Emergency-pause limits, V2 factory transition and exploit response.' },
        { key: 'lean-opco', assertion: 'Post-exploit governance chose a smaller DAO OpCo and lower annual budget rather than rebuild the prior Balancer Labs structure.', source_ids: [L('labs-winddown'), L('restructure')], evidence_locator: 'Founder wind-down statement and BIP-918 operating proposal.' },
      ],
    ),
    operating_model: section(
      'Balancer pools hold user-supplied assets and quote trades from pool-specific mathematics. The Vault coordinates custody and accounting, while routers and pool contracts execute swaps, joins and exits. Pool creators can select weights, stable-asset logic or other approved designs; LPs receive Balancer Pool Tokens representing their share and face asset, invariant, contract and integration risk. Protocol fees, swap fees and BAL incentives can flow through different paths, and chain deployments have separate operating conditions. After restructuring, Balancer OpCo acts as a DAO agent for maintenance, integrations and selected operating decisions under a governance budget. DefiLlama’s Aug. 3 fee adapter showed $265,756 over 30 days, but that number is not audited profit or cash available to BAL holders. It excludes some expenses and cannot be combined with TVL or exploit recovery.',
      [L('v3-docs'), L('whitepaper'), L('fees'), L('restructure'), L('tokenomics')],
      'Current pool/Vault documentation, operating mandate and separately scoped fee adapter.',
      [
        { key: 'pool-vault-model', assertion: 'Balancer separates shared token accounting in a Vault from pool-specific pricing logic and LP share accounting.', source_ids: [L('whitepaper'), L('v3-docs')], evidence_locator: 'Whitepaper and current Vault/pool architecture sections.' },
        { key: 'fees-not-profit', assertion: 'The $265,756 30-day fee-adapter value is gross scoped activity, not audited OpCo profit or tokenholder cash flow.', source_ids: [L('fees'), L('restructure')], evidence_locator: 'DefiLlama total30d compared with the separate $1.9 million annual operating budget.', support_direction: 'context_only' },
      ],
    ),
    token_and_value_capture: section(
      'BAL is Balancer’s governance and incentive token. Historically, BAL emissions helped attract liquidity and vote-escrowed positions influenced gauges and protocol decisions. That can align users with pools, but also makes liquidity dependent on issuance, delegated voting and external incentive markets. The post-exploit BIP-919 proposal sought to change fee capture by routing protocol fees to the DAO treasury and revising token economics alongside the smaller operating plan. A proposal is not automatically an executed, permanent right, and the dossier does not represent BAL as equity or a redeemable treasury claim. The economically important test is whether protocol fees can cover security, maintenance and recovery obligations without relying on recurring dilution. Current public evidence does not provide audited net income, complete BAL emissions cost, effective voting concentration or final per-holder value capture after the 2026 restructuring.',
      [L('tokenomics'), L('restructure'), L('fees'), L('postmortem')],
      'BIP-919 and BIP-918 proposals read with fee-adapter scope and unresolved incident obligations.',
      [
        { key: 'bal-role', assertion: 'BAL is used for governance and liquidity incentives; its economic value depends on governance-approved fee and emission policy rather than an equity claim.', source_ids: [L('tokenomics'), L('restructure')], evidence_locator: 'Tokenomics revamp and operating-restructuring proposals.' },
        { key: 'value-capture-unknown', assertion: 'Audited net income, complete emission cost and final post-restructuring BAL holder value capture were not established.', source_ids: [L('fees'), L('tokenomics'), L('postmortem')], evidence_locator: 'Fee adapter and proposals do not provide audited consolidated economics.', support_direction: 'context_only' },
      ],
    ),
    counterfactual: section(
      'A mandatory sunset of vulnerable V2 stable pools before pause authority expired would likely have reduced capital exposed in November 2025, but it would force LP migration and depend on V3 being ready across every integration. A narrower catalog with fewer composable pool types could reduce interaction risk, while giving up the programmability that differentiated Balancer. More frequent independent review of long-running contracts and invariant-specific formal properties might have caught the rounding path, but the public record cannot prove which review would have found it. After the incident, rebuilding a larger centralized Labs team might accelerate growth but shorten treasury runway and duplicate DAO service providers. The chosen lean OpCo favors survival and maintenance. Its test is whether security, delivery and fee capture improve without hidden under-staffing risk.',
      [L('postmortem'), L('openzeppelin'), L('v2-sunset'), L('restructure'), L('labs-winddown')],
      'Observed migration, security and organizational choices used only to bound alternatives.',
      [
        { key: 'faster-sunset', assertion: 'A faster mandatory V2 stable-pool sunset could reduce exposed balances but its effect on integrations and overall adoption is unmeasured.', source_ids: [L('postmortem'), L('v2-sunset')], evidence_locator: 'Post-mortem vulnerable pool scope and accelerated transition plan.', support_direction: 'context_only', note: 'Counterfactual.' },
        { key: 'larger-team', assertion: 'A larger post-exploit operating team could add capacity but would reduce the runway benefit modeled in BIP-918.', source_ids: [L('restructure'), L('labs-winddown')], evidence_locator: '12.5-FTE, $1.9 million plan compared with the ended Labs structure.', support_direction: 'context_only', note: 'Counterfactual.' },
      ],
    ),
    risks_and_unknowns: section(
      'Balancer’s primary risks are version sprawl, mathematical edge cases, multichain deployment, governance and reduced operating redundancy. The exploit proved that audited, long-running contracts can still contain compositional failures; rate providers, wrappers and forks widen the dependency surface. V2 and V3 must not be treated as one security state, and LPs can remain in unaffected but legacy contracts during migration. A smaller OpCo must maintain security response, integrations and governance across chains with fewer people. Remaining unknowns include final unrecovered user loss, claim completion, capital split between V2 and V3, TVL that would remain without incentives, chain and pool concentration, effective governance control, full audit-to-deployment mapping, insurance or treasury capacity, and whether the new budget covers another major incident. The dossier withholds a recovery claim until these fields are measured.',
      [L('postmortem'), L('openzeppelin'), L('v2-sunset'), L('restructure'), L('tvl')],
      'Incident scope, independent mechanics, migration plan, operating budget and current aggregated capital.',
      [
        { key: 'legacy-security', assertion: 'Long-running V2 contracts and composable dependencies remain a separate risk surface from V3.', source_ids: [L('postmortem'), L('openzeppelin'), L('v2-sunset')], evidence_locator: 'Affected V2 pool mechanics and transition records.' },
        { key: 'unrecovered-unknown', assertion: 'Final unrecovered loss, completed LP distributions and current V2-versus-V3 capital split were not established by the reviewed sources.', source_ids: [L('postmortem'), L('tvl')], evidence_locator: 'Post-mortem recovery estimates and aggregate TVL lack final pool-level resolution.', support_direction: 'context_only' },
      ],
    ),
    lifecycle: section(
      'Balancer began as a generalized weighted-pool AMM and evolved into the V2 Vault architecture, becoming important infrastructure for custom liquidity products. Its TVL and relative share declined after the 2021 peak while the protocol added chains and pool types. V3 launched as a redesigned successor with more explicit precision and rounding controls. On Nov. 3, 2025, a subset of V2 Composable Stable Pools was exploited; emergency partners protected or recovered part of the affected value, vulnerable factories and gauges were disabled, and migration accelerated. In March 2026 Balancer Labs shut down and governance reorganized maintenance under a smaller OpCo. At the Aug. 3 snapshot the protocol remained live with $334.16 million of 30-day volume and $60.83 million TVL. This is an operating-but-declining lifecycle, not a dead protocol and not a completed recovery.',
      [L('whitepaper'), L('v3-docs'), L('postmortem'), L('v2-sunset'), L('labs-winddown'), L('restructure'), L('volume'), L('tvl')],
      'Product generations, exploit, response, restructuring and current operating observations.',
      [
        { key: 'exploit-transition', assertion: 'The November 2025 V2 exploit accelerated a transition to V3 and disablement of vulnerable legacy factories and gauges.', source_ids: [L('postmortem'), L('v2-sunset')], evidence_locator: 'Post-mortem V2-to-V3 transition and BIP-887 actions.' },
        { key: 'live-but-diminished', assertion: 'Balancer remained live in August 2026 at materially diminished capital and a smaller operating organization.', source_ids: [L('volume'), L('tvl'), L('restructure')], evidence_locator: 'Aug. 3 adapter activity and BIP-918 organization size.' },
      ],
    ),
    outlook_and_watch: section(
      'Base case: Balancer V3 survives as specialized programmable-liquidity infrastructure while V2 exposure declines and a lean OpCo focuses on maintenance and targeted growth. Upside requires incident-free V3 adoption, transparent claims, fee capture that approaches operating cost and integrations that justify product complexity. Downside is a smaller spiral: weak capital reduces fees, constrained budget reduces delivery and another incident accelerates exits. Watch V3 TVL and volume separately from V2, pool and chain concentration, fee revenue, BAL emissions and incentives, migration completion, recovered funds and claim uptake, audits mapped to deployed versions, incident response, OpCo staffing, budget burn, treasury runway, governance concentration and delivery against BIP-918. No single TVL rebound should be treated as trust recovery without security duration and claim resolution.',
      [L('tvl'), L('volume'), L('fees'), L('postmortem'), L('v2-sunset'), L('restructure')],
      'Current activity, unresolved incident fields, migration actions and explicit operating targets.',
      [
        { key: 'base-case', assertion: 'The base case is continued smaller-scale V3 operation while V2 exposure and incident claims are resolved.', source_ids: [L('v3-docs'), L('v2-sunset'), L('restructure'), L('tvl')], evidence_locator: 'Current V3 path, legacy transition, operating plan and present capital.', support_direction: 'context_only', note: 'Scenario analysis.' },
        { key: 'review-triggers', assertion: 'V3 activity, incident-free duration, final recoveries, OpCo delivery and fee coverage are the primary recovery tests.', source_ids: [L('postmortem'), L('fees'), L('restructure')], evidence_locator: 'Incident obligations, current fee base and funded operating targets.', support_direction: 'context_only' },
      ],
    ),
  },
  metrics: [
    { key: 'spot-volume-24h', dimension: 'spot_volume', label: 'Balancer spot volume, rolling 24 hours', value: 11214423, unit: 'usd', currency: 'USD', as_of: CHECKED_AT, window: rolling('rolling_24h'), method: 'DefiLlama Balancer DEX adapter total24h', scope: scope('Balancer DEX family'), source_ids: [L('volume')], evidence_locator: 'total24h retrieved at 2026-08-03T18:31:22Z.', quality_flags: ['adapter_family_scope', 'not_unique_users'] },
    { key: 'spot-volume-30d', dimension: 'spot_volume', label: 'Balancer spot volume, rolling 30 days', value: 334158136, unit: 'usd', currency: 'USD', as_of: CHECKED_AT, window: rolling('rolling_30d'), method: 'DefiLlama Balancer DEX adapter total30d', scope: scope('Balancer DEX family'), source_ids: [L('volume')], evidence_locator: 'total30d retrieved at 2026-08-03T18:31:22Z.', quality_flags: ['adapter_family_scope'] },
    { key: 'tvl', dimension: 'tvl', label: 'Balancer tracked TVL', value: 60832590, unit: 'usd', currency: 'USD', as_of: CHECKED_AT, window: rolling('point_in_time'), method: 'DefiLlama Balancer protocol latest TVL', scope: scope('Balancer across tracked chains'), source_ids: [L('tvl')], evidence_locator: 'Latest tvl total retrieved at 2026-08-03T18:31:22Z.', quality_flags: ['tvl_not_market_depth', 'version_aggregation'] },
    { key: 'fees-30d', dimension: 'fees', label: 'Balancer fees, rolling 30 days', value: 265756, unit: 'usd', currency: 'USD', as_of: CHECKED_AT, window: rolling('rolling_30d'), method: 'DefiLlama Balancer fee adapter total30d', scope: scope('Balancer fee adapter'), source_ids: [L('fees')], evidence_locator: 'total30d retrieved at 2026-08-03T18:31:22Z.', quality_flags: ['fees_not_profit'] },
    { key: 'exploit-loss', dimension: 'exploit_loss', label: 'Balancer-deployed V2 pool theft estimate', value: 94800000, unit: 'usd', currency: 'USD', as_of: '2025-11-03', window: { start: '2025-11-03', end: '2025-11-03', definition: 'incident_estimate' }, method: 'Official Balancer post-mortem estimate for Balancer-deployed pools', scope: scope('Affected Balancer V2 Composable Stable Pools'), source_ids: [L('postmortem')], evidence_locator: 'Post-mortem introduction estimated $94.8M theft of user funds.', quality_flags: ['incident_estimate', 'not_total_fork_losses'] },
  ],
  events: [
    { key: 'v2-exploit', type: 'security_incident', date: '2025-11-03', amount_usd: 94800000, description: 'Specific Balancer V2 Composable Stable Pools were exploited; V3 was unaffected.', source_ids: [L('postmortem'), L('openzeppelin')], evidence_locator: 'Official and independent exploit analyses.' },
    { key: 'labs-winddown', type: 'organizational_restructure', date: '2026-03-23', description: 'Balancer Labs announced its wind-down and governance proposed a smaller DAO OpCo.', source_ids: [L('labs-winddown'), L('restructure')], evidence_locator: 'Dated founder statement and BIP-918.' },
  ],
  unsourced_fields: ['Final unrecovered user loss and claim completion', 'Current V2 versus V3 TVL split', 'Liquidity remaining without incentives', 'Effective BAL and governance concentration', 'Audited post-restructuring profit and runway'],
  methodology_notes: [
    'The $94.8M Balancer-deployed theft estimate is kept separate from the $121.1M wider Balancer-and-forks loss figure.',
    'V2 and V3 are separate security and lifecycle surfaces; family-level adapters are labeled as aggregates.',
  ],
});

const B = (key) => sid('bancor', key);
const bancor = buildProfile({
  slug: 'bancor',
  name: 'Bancor',
  aliases: ['Bancor Network', 'Bancor V3'],
  operating_state: 'operating_impaired',
  outcome_label: 'operating_with_unresolved_lp_deficits',
  confidence: 'high',
  outcome_note: 'Bancor is technically live, but unresolved legacy liquidity-provider deficits and very low current activity prevent a recovered or successful call.',
  classification: {
    subtype: 'single-sided-liquidity AMM with legacy protection liabilities',
    tags: ['spot_amm', 'single_sided_liquidity', 'impermanent_loss_protection', 'legacy_deficit'],
    chains: ['Ethereum'],
    jurisdictions: [],
  },
  sources: bancorSources,
  status_assertion: 'Bancor remained technically active on Ethereum at the Aug. 3, 2026 snapshot; an April community post separately said affected users still lacked a concrete deficit update.',
  status_source_ids: [B('tvl'), B('volume'), B('fees'), B('four-years')],
  status_evidence_locator: 'Current adapter observations plus an April 2026 community request for a concrete deficit reconciliation; the request is not an operator response.',
  outcome_assertion: 'Bancor is an impaired operating protocol whose 2022 protection suspension created long-lived LP deficits and loss of trust.',
  outcome_source_ids: [B('emergency'), B('independent-pause'), B('deficit'), B('tvl')],
  outcome_evidence_locator: 'Emergency governance decision, independent contemporaneous reporting, the later named-deficit discussion and current scale.',
  sections: {
    what_it_is: section(
      'Bancor is an Ethereum automated-market-maker protocol and one of the earliest projects to popularize tokenized onchain liquidity. The versions relevant to this case went beyond a conventional two-sided AMM: users could deposit one asset, while the protocol minted or supplied BNT as the counterpart and advertised impermanent-loss protection funded by fees, protocol co-investment and BNT economics. Bancor V3 reorganized liquidity through an Omnipool-style system and made protection available without the earlier 100-day vesting schedule, subject to protocol conditions. Those features made liquidity provision simpler in normal markets, but shifted divergence and withdrawal risk onto the protocol and BNT holders. Today’s Bancor is a live but impaired system with legacy deficit claims, not the same thing as the separate Carbon trading product and not a guaranteed insurance contract.',
      [B('v21'), B('bancor3'), B('emergency')],
      'v2.1 single-sided design, Bancor 3 protection rules and the emergency restriction record.',
      [
        { key: 'single-sided-model', assertion: 'Bancor v2.1 used protocol BNT to pair with user-supplied assets and enable single-sided liquidity exposure.', source_ids: [B('v21')], evidence_locator: 'v2.1 proposal sections describing protocol co-investment and elastic BNT supply.' },
        { key: 'protection-model', assertion: 'Bancor 3 offered impermanent-loss protection under protocol rules, creating a contingent liability rather than eliminating loss.', source_ids: [B('bancor3'), B('emergency')], evidence_locator: 'Bancor 3 protection design and the later emergency suspension actions.' },
      ],
    ),
    what_happened: section(
      'Bancor used single-sided deposits and BNT-funded protection to differentiate itself and reached multibillion-dollar TVL during the 2021 cycle. Bancor 3 launched in 2022 with immediate protection language, but the Terra/Celsius-era liquidity shock brought synchronized withdrawals and deficits. On June 19, 2022, emergency actors halted new deposits and protection-related BNT minting because continuing unconstrained issuance could deepen a BNT feedback loop. LPs could face substantial withdrawal haircuts even though protection was the product’s headline promise. The protocol survived, but liquidity and trust did not return at prior scale. Community discussions in 2024 and April 2026 continued to ask for ETH and WBTC deficit totals and a concrete repair plan. On Aug. 3, DefiLlama showed $23.998 million TVL, $4.80 million of 30-day volume and only $16,529.79 of 30-day fees.',
      [B('emergency'), B('independent-pause'), B('deficit'), B('four-years'), B('tvl'), B('volume'), B('fees')],
      'Emergency chronology, independent contemporaneous description, later deficit requests and current adapter totals.',
      [
        { key: 'protection-suspension', assertion: 'Bancor halted protection-related BNT minting and restricted deposits during the June 2022 deficit crisis.', source_ids: [B('emergency'), B('independent-pause')], evidence_locator: 'Emergency-action proposal and June 20 independent report.' },
        { key: 'deficit-persists', assertion: 'A 2024 Bancor forum thread discussed named ETH and WBTC deficits; an April 2026 community post later asked the team for a current reconciliation.', source_ids: [B('deficit'), B('four-years')], evidence_locator: 'Named 2024 deficit discussion and a separate, unanswered April 2026 community request; neither is treated as a current audited balance sheet.' },
        { key: 'current-scale', assertion: 'At the Aug. 3 snapshot, Bancor had $23.998 million TVL, $4.80 million of 30-day volume and $16,529.79 of 30-day fees.', source_ids: [B('tvl'), B('volume'), B('fees')], evidence_locator: 'Protocol latest TVL and total30d volume/fees fields retrieved 2026-08-03T18:31:22Z.' },
      ],
    ),
    why_this_outcome: section(
      'Bancor’s core product choice created its failure mode. Single-sided liquidity and protection attracted users by moving a familiar LP risk away from the depositor, but the risk did not disappear. The protocol used BNT co-investment, fees and elastic supply to absorb divergence. When asset prices, BNT price and withdrawals moved against the system together, minting more BNT to honor every claim could create additional sale pressure and a deeper deficit. Emergency restrictions protected protocol continuity and BNT from unconstrained issuance, but they also broke the expected withdrawal path for the LPs the feature was designed to reassure. Bancor survived because governance could stop the feedback loop and preserve contracts. It stagnated because the intervention converted a marketed protection benefit into long-lived impaired claims, while competitors offered simpler AMMs without the same protocol-level insurance promise.',
      [B('v21'), B('bancor3'), B('emergency'), B('independent-pause'), B('tvl')],
      'Protection funding and withdrawal mechanics compared with the emergency response and subsequent scale.',
      [
        { key: 'reflexive-liability', assertion: 'Bancor funded protection partly through BNT co-investment and elastic issuance, creating a reflexive liability during synchronized divergence and withdrawals.', source_ids: [B('v21'), B('bancor3'), B('emergency')], evidence_locator: 'v2.1 and Bancor 3 design compared with the stated reason for emergency mint restrictions.' },
        { key: 'trust-break', assertion: 'Suspending the protection mechanism preserved protocol continuity while impairing the expected withdrawal outcome for affected LPs.', source_ids: [B('emergency'), B('independent-pause')], evidence_locator: 'Emergency actions and contemporaneous independent reporting on the protection pause.' },
      ],
    ),
    strategic_choices: section(
      'Bancor first chose single-sided exposure, minting or deploying protocol BNT as the other side of protected pools. It then advertised impermanent-loss protection funded by trading fees, co-investment and token supply rather than hard external reserves for every claim. Bancor 3 made protection effectively immediate instead of preserving the earlier 100-day vesting path, improving product simplicity while shortening the period in which fees could offset liabilities before exit. When the June 2022 deficit became acute, governance chose to stop protection-related minting and deposits rather than continue issuance into falling confidence. Later proposals explored using protocol-owned liquidity, Vortex flows and Carbon-related economics for repair. These decisions traded rapid liquidity acquisition for balance-sheet reflexivity, and later traded full promise fulfillment for survival. Public evidence still does not show a funded timetable that closes every deficit.',
      [B('v21'), B('bancor3'), B('vortex'), B('emergency'), B('pol-repair'), B('four-years')],
      'Design proposals, emergency action and later repair discussions.',
      [
        { key: 'immediate-protection', assertion: 'Bancor 3 shortened the earlier protection vesting path, increasing product immediacy and exit-liability sensitivity.', source_ids: [B('bancor3'), B('v21')], evidence_locator: 'Bancor 3 proposal compared with v2.1 protection schedule.' },
        { key: 'survival-choice', assertion: 'In June 2022 Bancor prioritized stopping a potential BNT issuance spiral over honoring protection through unrestricted minting.', source_ids: [B('emergency')], evidence_locator: 'Emergency proposal rationale and continued restrictions.' },
        { key: 'repair-path', assertion: 'Later governance considered protocol-owned liquidity for deficit repair; the reviewed record did not include a verified full-recovery timetable.', source_ids: [B('pol-repair'), B('four-years')], evidence_locator: 'Repair proposal plus an April 2026 community request for concrete progress, used only as evidence of the information gap.', support_direction: 'context_only' },
      ],
    ),
    operating_model: section(
      'Bancor pools execute swaps from protocol-managed token inventories on Ethereum. Under the protected single-sided model, a user contributes one token and the protocol supplies BNT exposure, while pool fees and protocol mechanisms affect each side’s eventual withdrawal value. BNT issuance, protocol-owned liquidity and the Vortex can change system inventory and token supply. That means visible TVL includes capital with different withdrawal conditions; it is not automatically liquid market depth or unencumbered user value. Current DefiLlama adapters record modest trading and fees, but those fees are not the same as cash dedicated to deficit repayment, and Carbon activity must not be silently assigned to Bancor pool recovery. The public record does not provide an audited consolidated balance sheet showing pool assets, BNT obligations, impaired claims, operating costs and restricted versus available recovery funds.',
      [B('v21'), B('vortex'), B('tvl'), B('fees'), B('four-years')],
      'Single-sided pool and token-flow designs compared with current aggregate adapters and unresolved accounting requests.',
      [
        { key: 'inventory-model', assertion: 'Bancor’s single-sided pools combine user assets, protocol BNT exposure, fees and protocol-owned liquidity in the withdrawal outcome.', source_ids: [B('v21'), B('vortex')], evidence_locator: 'v2.1 co-investment and Vortex token-flow descriptions.' },
        { key: 'accounting-gap', assertion: 'Current TVL and fee adapters do not provide an audited pool-by-pool balance sheet or prove funds available for deficit repair.', source_ids: [B('tvl'), B('fees'), B('four-years')], evidence_locator: 'Aggregate adapter totals and an April 2026 community request for a concrete breakdown; the post is context, not accounting proof.', support_direction: 'context_only' },
      ],
    ),
    token_and_value_capture: section(
      'BNT is not an optional governance wrapper around Bancor’s protected-liquidity model; it has historically been the protocol’s counterpart asset, incentive and loss-absorption mechanism. That integration helped users deposit a single token and let the protocol coordinate liquidity, while making BNT price and supply part of protocol solvency. Vortex mechanisms can buy or burn BNT from protocol flows, and later repair proposals sought to direct protocol-owned liquidity toward deficits. These links create utility, but also expose holders and LPs to reflexivity: minting BNT to cover protection can increase supply and selling pressure, while falling BNT can deepen pool deficits. BNT is not equity, and current sources do not establish a pro-rata redeemable claim on Carbon revenue or treasury assets. Sustainable value capture requires fee generation and repair transfers large enough to exceed liabilities and ongoing costs.',
      [B('v21'), B('vortex'), B('emergency'), B('pol-repair'), B('fees')],
      'BNT co-investment, Vortex, emergency issuance controls and proposed repair flows.',
      [
        { key: 'bnt-system-role', assertion: 'BNT historically served as protocol counterpart liquidity and part of the protection-funding mechanism, linking token supply to pool liabilities.', source_ids: [B('v21'), B('emergency')], evidence_locator: 'v2.1 elastic-supply model and emergency mint restriction rationale.' },
        { key: 'recovery-value-gap', assertion: 'The reviewed evidence does not establish a redeemable BNT claim or audited net Carbon-to-deficit transfer sufficient to resolve legacy liabilities.', source_ids: [B('pol-repair'), B('four-years'), B('fees')], evidence_locator: 'Repair proposal, aggregate fee adapter and a community request showing that affected users still sought a reconciliation.', support_direction: 'context_only' },
      ],
    ),
    counterfactual: section(
      'Bancor could have limited protection with hard reserves, asset-specific coverage caps, longer vesting, conservative withdrawal queues and automatic suspension before deficits became severe. Those controls would make the product less generous and might have reduced the liquidity that Bancor attracted. It could also have offered ordinary unprotected pools, avoiding an insurance-like protocol liability while giving up its strongest differentiation. Once the crisis began, continuing unlimited BNT minting might honor more withdrawals in nominal terms but risk a faster BNT collapse and larger system-wide shortfall. Stopping earlier could reduce damage but still violate user expectations. No public evidence provides a controlled estimate of these alternatives. A useful future test is whether transparent, asset-level reserves and scheduled repair payments reduce deficits without new dilution or locked-withdrawal dependence.',
      [B('v21'), B('bancor3'), B('emergency'), B('deficit'), B('four-years')],
      'Observed protection and emergency choices used to bound unobserved reserve, cap and vesting alternatives.',
      [
        { key: 'hard-reserve-alternative', assertion: 'Hard reserves and protection caps could limit liabilities but their effect on Bancor liquidity acquisition was never measured.', source_ids: [B('v21'), B('bancor3')], evidence_locator: 'Documented elastic protection model lacks a hard-reserve comparison.', support_direction: 'context_only', note: 'Counterfactual.' },
        { key: 'earlier-stop-alternative', assertion: 'An earlier automatic suspension could reduce deficit growth while still breaking the expected protection path for LPs.', source_ids: [B('emergency'), B('deficit')], evidence_locator: 'Emergency restrictions and later deficit record used to define the alternative.', support_direction: 'context_only', note: 'Counterfactual.' },
      ],
    ),
    risks_and_unknowns: section(
      'The main risk is unresolved withdrawal impairment. A pool can remain onchain and contribute to TVL while an LP’s economically recoverable amount is below the displayed token balance. BNT reflexivity, low trading volume, thin fees, smart-contract risk, governance discretion and unclear recovery funding can extend that impairment. Current Dune and governance sources may help monitor deficits, but community dashboards are not audited liabilities and valuation changes can move dollar totals without repairing token-denominated claims. Unknowns include the current token and dollar deficit for every pool, total original claims, withdrawals and realized recovery, restricted versus available assets, exact Carbon and protocol-owned-liquidity transfers, legal claims, admin authorities, BNT supply effects, operating expenses and a dated recovery schedule. Until those are reconciled, TVL growth alone cannot support a recovery conclusion.',
      [B('dune-deficit'), B('deficit'), B('four-years'), B('tvl'), B('fees'), B('emergency')],
      'Current dashboard and discussions read with aggregate adapters and the original control intervention.',
      [
        { key: 'withdrawal-impairment', assertion: 'Bancor TVL can include positions whose withdrawable value is impaired by pool deficits.', source_ids: [B('deficit'), B('dune-deficit'), B('tvl')], evidence_locator: 'Pool-deficit discussions/dashboard compared with aggregate protocol TVL.' },
        { key: 'reconciliation-unknown', assertion: 'A current audited pool-by-pool reconciliation of liabilities, recoveries and repair funding was not found.', source_ids: [B('four-years'), B('deficit'), B('fees')], evidence_locator: 'An April 2026 community information request, the earlier deficit discussion and an aggregate fee total; absence is reported as a research gap.', support_direction: 'context_only' },
      ],
    ),
    lifecycle: section(
      'Bancor launched in 2017 and became an early AMM pioneer. V2.1 introduced protocol-supported single-sided liquidity and protection; Bancor 3 launched in 2022 with a simplified Omnipool and more immediate protection. The market shock of June 2022 exposed deficits and triggered emergency limits on deposits and BNT minting. Bancor continued operating rather than collapse, and governance explored Vortex, protocol-owned liquidity and Carbon-related mechanisms for repair. Yet ETH and WBTC deficit discussions persisted into 2024, and an April 2026 thread still requested a measurable plan and timeline. At the Aug. 3 snapshot, Bancor retained $23.998 million TVL but only $4.80 million of 30-day volume. The correct lifecycle is surviving but impaired: the contracts and product remain, while the central protection promise has not reached a documented final resolution.',
      [B('v21'), B('bancor3'), B('emergency'), B('deficit'), B('four-years'), B('tvl'), B('volume')],
      'Product version history, crisis response, later deficit record and current operating observations.',
      [
        { key: 'crisis-transition', assertion: 'The June 2022 protection suspension moved Bancor from a growth product into a long-running deficit-repair phase.', source_ids: [B('emergency'), B('independent-pause'), B('deficit')], evidence_locator: 'Emergency action, contemporaneous reporting and later deficit discussion.' },
        { key: 'current-impaired-state', assertion: 'August 2026 adapters showed low onchain activity, while the reviewed record did not provide a current audited resolution of the legacy pool deficits.', source_ids: [B('tvl'), B('volume'), B('deficit'), B('four-years')], evidence_locator: 'Aug. 3 adapter values, the named deficit thread and a later community request for a current reconciliation.' },
      ],
    ),
    outlook_and_watch: section(
      'Base case: Bancor continues as a small Ethereum protocol while legacy deficits decline slowly or remain unresolved. Upside requires an auditable recovery ledger, recurring transfers from fees or related products, better withdrawability and new trading demand that does not depend on BNT inflation. Downside is indefinite limbo: contracts remain live, but impaired LPs, thin volume and opaque repair flows prevent renewed trust. Watch pool-by-pool token deficits, withdrawal haircuts, original and remaining claims, distributions, BNT issuance and burns, Bancor and Carbon fees separated by product, protocol-owned-liquidity transfers, TVL that is freely withdrawable, active pools, 30-day volume, governance authority and a published timetable. Any recovery claim should require denominated liabilities and payments, not a rising BNT price or aggregate TVL alone.',
      [B('dune-deficit'), B('deficit'), B('four-years'), B('fees'), B('volume'), B('tvl'), B('pol-repair')],
      'Current deficit-monitoring sources, proposed repair paths and operating metrics.',
      [
        { key: 'base-case', assertion: 'The base case is continued small-scale operation while the timing and extent of legacy deficit repair remain unknown.', source_ids: [B('four-years'), B('tvl'), B('volume')], evidence_locator: 'Current activity plus an April 2026 community request that identifies the missing reconciliation; this is scenario analysis, not an operator forecast.', support_direction: 'context_only', note: 'Scenario analysis.' },
        { key: 'recovery-tests', assertion: 'A recovery call requires pool-level liabilities, withdrawability and documented repair transfers rather than token price or aggregate TVL.', source_ids: [B('dune-deficit'), B('deficit'), B('pol-repair'), B('tvl')], evidence_locator: 'Deficit dashboard/discussion, repair proposal and TVL measurement boundary.', support_direction: 'context_only' },
      ],
    ),
  },
  metrics: [
    { key: 'spot-volume-24h', dimension: 'spot_volume', label: 'Bancor spot volume, rolling 24 hours', value: 109491, unit: 'usd', currency: 'USD', as_of: CHECKED_AT, window: rolling('rolling_24h'), method: 'DefiLlama Bancor DEX adapter total24h', scope: scope('Bancor', ['Ethereum']), source_ids: [B('volume')], evidence_locator: 'total24h retrieved at 2026-08-03T18:31:22Z.', quality_flags: ['not_unique_users', 'thin_activity'] },
    { key: 'spot-volume-30d', dimension: 'spot_volume', label: 'Bancor spot volume, rolling 30 days', value: 4796030, unit: 'usd', currency: 'USD', as_of: CHECKED_AT, window: rolling('rolling_30d'), method: 'DefiLlama Bancor DEX adapter total30d', scope: scope('Bancor', ['Ethereum']), source_ids: [B('volume')], evidence_locator: 'total30d retrieved at 2026-08-03T18:31:22Z.', quality_flags: ['not_unique_users', 'thin_activity'] },
    { key: 'tvl', dimension: 'tvl', label: 'Bancor tracked TVL', value: 23998429, unit: 'usd', currency: 'USD', as_of: CHECKED_AT, window: rolling('point_in_time'), method: 'DefiLlama Bancor protocol latest TVL', scope: scope('Bancor', ['Ethereum']), source_ids: [B('tvl')], evidence_locator: 'Latest tvl total retrieved at 2026-08-03T18:31:22Z.', quality_flags: ['tvl_not_market_depth', 'withdrawal_impairment_possible'] },
    { key: 'fees-30d', dimension: 'fees', label: 'Bancor fees, rolling 30 days', value: 16529.79, unit: 'usd', currency: 'USD', as_of: CHECKED_AT, window: rolling('rolling_30d'), method: 'DefiLlama Bancor fee adapter total30d', scope: scope('Bancor', ['Ethereum']), source_ids: [B('fees')], evidence_locator: 'total30d retrieved at 2026-08-03T18:31:22Z.', quality_flags: ['fees_not_profit', 'not_proven_deficit_repair'] },
  ],
  events: [
    { key: 'bancor3', type: 'product_launch', date: '2022-05-11', description: 'Bancor 3 launched with redesigned single-sided liquidity and protection mechanics.', source_ids: [B('bancor3')], evidence_locator: 'Bancor 3 proposal and linked activation history.' },
    { key: 'protection-pause', type: 'liquidity_crisis', date: '2022-06-19', description: 'Emergency actors paused protection-related BNT minting and restricted deposits during the deficit crisis.', source_ids: [B('emergency'), B('independent-pause')], evidence_locator: 'Emergency ratification and contemporaneous independent report.' },
  ],
  unsourced_fields: ['Audited pool-by-pool deficits and total claims', 'Cumulative LP recovery percentage', 'Carbon net transfers to deficit repair', 'Restricted versus available recovery assets', 'Operating expenses and dated recovery timetable'],
  methodology_notes: [
    'TVL is not assumed freely withdrawable; deficit and haircut state must be evaluated separately.',
    'Carbon activity, Bancor pool fees, BNT flows and actual deficit payments are separate measures.',
  ],
});

const G = (key) => sid('gmx-v1', key);
const gmxV1 = buildProfile({
  slug: 'gmx-v1',
  name: 'GMX V1 (GLP)',
  aliases: ['GMX V1', 'GLP V1'],
  operating_state: 'sunset',
  outcome_label: 'sunset_after_exploit_with_distribution',
  confidence: 'high',
  outcome_note: 'This label applies only to GMX V1 and GLP. GMX V2 remained operating and unaffected by the V1 vulnerability.',
  classification: {
    subtype: 'sunset pooled-counterparty perpetual DEX',
    tags: ['perpetuals', 'pooled_counterparty', 'glp', 'sunset', 'post_exploit'],
    chains: ['Arbitrum', 'Avalanche'],
    jurisdictions: [],
  },
  sources: gmxSources,
  status_assertion: 'GMX V1 trading and new liquidity provision were sunset by Aug. 3, 2026; existing GLP could only be redeemed.',
  status_source_ids: [G('contracts'), G('archived'), G('plan')],
  status_evidence_locator: 'Current archived documentation and completed Arbitrum distribution record.',
  outcome_assertion: 'GMX V1 was permanently sunset after a July 2025 vulnerability drained most Arbitrum GLP, followed by fund return and an approximately $44 million distribution.',
  outcome_source_ids: [G('incident'), G('plan'), G('archived'), G('coindesk')],
  outcome_evidence_locator: 'Incident accounting, completed distribution, current product status and independent contemporaneous coverage.',
  sections: {
    what_it_is: section(
      'GMX V1 was the original GMX spot-swap and perpetual-trading product on Arbitrum and Avalanche. Liquidity providers minted GLP, a basket token backed by assets in a shared Vault, and that pooled inventory served traders and swaps. The pool could earn fees when trading activity was healthy, but it also absorbed trader profit-and-loss, asset-composition changes, oracle and contract risk. GMX V1 is no longer an operating exchange: current official documentation says trading and new liquidity provision are unsupported and classifies the contracts as archived. Existing GLP may still be redeemable under remaining contract and reserve constraints. This dossier is deliberately scoped to V1 and GLP. It does not classify GMX V2, its GM pools or the broader GMX brand as dead; V2 remained unaffected by the V1 incident.',
      [G('contracts'), G('archived'), G('liquidity'), G('incident')],
      'Current archived V1 contract/product pages and governance incident boundary.',
      [
        { key: 'v1-model', assertion: 'GMX V1 used a shared asset Vault and GLP as pooled counterparty liquidity for swaps and leveraged trading.', source_ids: [G('contracts'), G('trading'), G('liquidity')], evidence_locator: 'Archived V1 Vault, trading, GLP and liquidity descriptions.' },
        { key: 'identity-boundary', assertion: 'GMX V1 is sunset, while GMX V2 was unaffected and continued operating.', source_ids: [G('archived'), G('incident')], evidence_locator: 'Archived product status and governance incident statement separating V1 from V2.' },
      ],
    ),
    what_happened: section(
      'GMX V1 launched in 2021 and made onchain perpetual trading easier by putting many assets into one GLP-backed pool. V2 later introduced a successor architecture, but V1 remained available for legacy users and integrations. On July 9, 2025, a user disclosed and exploited a live V1 vulnerability on Arbitrum, withdrawing about $42 million from roughly $46 million of GLP value. GMX paused V1 on Arbitrum and Avalanche. Most funds were returned after negotiation and a $5 million bounty; governance estimated $40.1 million in recovered stablecoins, $3 million residual GLP and an approximately $2 million shortfall before treasury support. The DAO then completed an approximately $44 million distribution using GLV tokens and a treasury top-up. V1 was not restarted; official docs now allow only legacy redemption and GMX V2 remained separate and live.',
      [G('incident'), G('plan'), G('archived'), G('coindesk'), G('archi')],
      'July incident accounting, August distribution completion, current archive status and third-party integration resolution.',
      [
        { key: 'drain', assertion: 'The July 9, 2025 V1 vulnerability allowed about $42 million of roughly $46 million in Arbitrum GLP value to be withdrawn.', source_ids: [G('incident'), G('coindesk')], evidence_locator: 'Governance “What Happened” accounting and independent incident report.' },
        { key: 'distribution', assertion: 'GMX governance reported completing an approximately $44 million distribution for affected Arbitrum GLP holders with treasury support.', source_ids: [G('plan'), G('plan-action'), G('archi')], evidence_locator: 'Distribution-plan execution updates and third-party Archi distribution record.' },
        { key: 'no-restart', assertion: 'GMX V1 trading and liquidity provision were not restarted; only legacy GLP redemption remained.', source_ids: [G('archived'), G('contracts'), G('archi')], evidence_locator: 'Current archived product notice and Archi explanation that recovery was possible because V1 stayed paused.' },
      ],
    ),
    why_this_outcome: section(
      'V1 succeeded initially because one GLP basket gave traders deep pooled counterparty liquidity and gave LPs a simple passive position with fee exposure. The same consolidation created a large common failure domain. A critical V1 vulnerability could affect the pooled assets and third-party protocols that treated GLP as collateral or vault inventory. Keeping V1 available after V2 existed preserved integrations and user continuity, but also left meaningful capital in older contracts. The exploit was the immediate shutdown catalyst. The decision not to restart was rational after most funds were recovered because repairing and re-auditing the entire legacy surface would be slower and riskier than distributing value and moving users toward V2 liquidity products. This diagnosis does not imply V2 shared the bug. Public sources do not isolate whether earlier migration friction, product preference or abandoned integrations kept each dollar in V1.',
      [G('contracts'), G('incident'), G('plan'), G('archi-stuck'), G('archived')],
      'Legacy architecture, incident blast radius, distribution trade-offs and current successor boundary.',
      [
        { key: 'pooled-failure-domain', assertion: 'GLP simplified pooled counterparty liquidity while concentrating V1 contract and integration risk in a shared asset system.', source_ids: [G('contracts'), G('incident')], evidence_locator: 'Vault/GLP architecture and incident accounting.' },
        { key: 'sunset-rationale', assertion: 'After fund recovery, distributing value and sunsetting V1 avoided a full legacy restart and re-audit while V2 remained available.', source_ids: [G('incident'), G('plan'), G('archived')], evidence_locator: 'Governance comparison of reconstitution versus claim distribution and current sunset status.' },
      ],
    ),
    strategic_choices: section(
      'GMX chose a shared GLP basket as counterparty for V1 swaps and perpetual positions, concentrating liquidity and fee generation while pooling asset and trader P&L risk. It later launched V2 but kept V1 open for users and integrations instead of forcing immediate migration. After the vulnerability, contributors paused V1 across both chains, negotiated a return under a large bug bounty and held recovered funds for governance-directed distribution. Governance rejected reconstituting the old pool as impractical, chose claims and GLV distribution, used approximately $2 million of treasury assets to cover the shortfall and offered retention incentives. That approach prioritized making affected holders economically whole and moving capital into V2 products over restoring the old system. It also required manual handling for composable integrations such as abandoned Archi Finance, exposing the long tail created when third parties build on a legacy token.',
      [G('contracts'), G('incident'), G('plan'), G('archi'), G('archi-stuck')],
      'V1 architecture, recovery alternatives, treasury top-up and integration-specific distributions.',
      [
        { key: 'legacy-coexistence', assertion: 'GMX kept V1 available alongside V2 before the exploit, preserving legacy integrations and continued exposure.', source_ids: [G('contracts'), G('archi-stuck'), G('incident')], evidence_locator: 'Current V1 contract archive, pre-incident stuck-integration proposal and incident state.' },
        { key: 'distribution-choice', assertion: 'Governance chose GLV claims, a treasury top-up and V1 sunset rather than reconstituting and restarting GLP.', source_ids: [G('incident'), G('plan')], evidence_locator: 'Recovery-options discussion and completed distribution plan.' },
      ],
    ),
    operating_model: section(
      'Before sunset, users minted GLP from approved assets and the V1 Vault used pooled inventory for swaps and leveraged-trading settlement. Token pricing, reserved amounts, open interest and asset weights affected minting and redemption. LPs earned a share of fees while taking the other side of aggregate trader outcomes and the risk that one shared contract system could fail. After the incident, trading and minting stopped. Current official documentation says existing GLP can only be redeemed, subject to reserved amounts and remaining positions, and archived pages are informational rather than a live product invitation. Recovery used separate claim and distribution processes, including GLV successor tokens and manual mapping for smart-contract integrations. There is no meaningful current V1 trading-volume metric to publish. Any GMX V2 volume, TVL or fee number would be a different product and is intentionally excluded from this V1 profile.',
      [G('contracts'), G('archived'), G('incident'), G('plan'), G('archi')],
      'Archived Vault/redemption mechanics, current product state and recovery distribution implementation.',
      [
        { key: 'historic-operation', assertion: 'V1 GLP mint, redemption and trading depended on shared Vault assets, reserved amounts and open positions.', source_ids: [G('contracts'), G('liquidity')], evidence_locator: 'Archived contract overview and GLP liquidity/redemption mechanics.' },
        { key: 'current-operation', assertion: 'Current V1 operation is limited to redemption and claims; new trading, minting and liquidity provision are unsupported.', source_ids: [G('archived'), G('contracts'), G('plan')], evidence_locator: 'Current archive warning and post-incident distribution state.' },
      ],
    ),
    token_and_value_capture: section(
      'GLP was the V1 liquidity-provider token, not the GMX governance token and not the GM/GLV liquidity system used by V2. Its value reflected the V1 basket, trader profit-and-loss, fees and contract accounting. The July exploit broke the relationship between outstanding GLP and accessible Vault assets. Governance’s recovery plan burned attacker-held GLP, distributed successor GLV exposure and added treasury value so affected holders could receive an amount described as economically whole. That was incident resolution, not continuing GLP value capture. Existing GLP may still redeem from residual contracts, but buying or minting new GLP is disabled and V1 no longer generates ordinary trading economics. GMX token economics and V2 fee distributions should not be imported into this profile. The remaining material questions are unclaimed distributions, residual redemptions and integration-specific claims, not a growth thesis for GLP.',
      [G('contracts'), G('archived'), G('incident'), G('plan'), G('archi')],
      'Archived GLP role, post-incident burn/distribution and current redemption-only state.',
      [
        { key: 'glp-role', assertion: 'GLP represented V1 pooled liquidity and was economically distinct from GMX governance and V2 GM/GLV liquidity tokens.', source_ids: [G('contracts'), G('plan')], evidence_locator: 'V1 GLP contract overview and GLV-based recovery plan.' },
        { key: 'no-new-value-capture', assertion: 'GLP no longer receives new V1 trading economics because V1 trading and new liquidity provision are disabled.', source_ids: [G('archived'), G('contracts')], evidence_locator: 'Current archived product warnings.' },
      ],
    ),
    counterfactual: section(
      'A mandatory migration after V2 matured could have reduced the GLP value still exposed in July 2025, but it would force third-party integrations and users to unwind on a project schedule. A more modular vault could reduce the blast radius while sacrificing the simple common liquidity that made V1 attractive. Additional invariant, reentrancy and integration testing might have found the vulnerability, but public evidence does not identify one specific pre-incident review that would certainly prevent it. Restarting V1 after recovery was another option; governance described reconstituting GLP as practically difficult because balances, redemptions and integrations had changed and a full re-audit would be necessary. Choosing claims and sunset reduced renewed exposure. The exact foregone V1 demand is unknowable, but V2’s continued operation made the safer exit more feasible.',
      [G('incident'), G('plan'), G('contracts'), G('archi-stuck')],
      'Observed coexistence, recovery options and security program used to bound unobserved alternatives.',
      [
        { key: 'earlier-migration', assertion: 'Earlier mandatory V1 migration could reduce exposed capital but its effect on legacy users and integrations was not measured.', source_ids: [G('archi-stuck'), G('incident')], evidence_locator: 'Pre-incident abandoned integration and later V1 exposure.', support_direction: 'context_only', note: 'Counterfactual.' },
        { key: 'restart-alternative', assertion: 'Restarting V1 would require pool reconstitution and a broad re-audit, while claims and sunset avoided renewed legacy exposure.', source_ids: [G('incident'), G('plan')], evidence_locator: 'Governance recovery-options analysis and executed distribution choice.', support_direction: 'context_only' },
      ],
    ),
    risks_and_unknowns: section(
      'V1 is no longer a growth-risk case; it is a resolution-risk case. Remaining holders may face redemption limits tied to reserved amounts or open positions, and users of abandoned integrations can require manual mapping. Claim contracts, distribution eligibility, token burns and treasury transfers must be correct. Archived contract authorities and any upgrade or emergency roles still matter while assets remain. The largest unknowns are how much GLP remains, the value and number of unclaimed distributions, unresolved third-party positions, final treasury cost, claims disputes and the exact vulnerability root cause and independent mitigation mapping. GMX V2 must be evaluated separately for security and economics. A V2 incident would be relevant to the GMX brand but would not retroactively prove that V1 restarted. Conversely, V2 growth does not change V1’s sunset classification or erase its recovery obligations.',
      [G('contracts'), G('archived'), G('plan'), G('archi'), G('incident')],
      'Current redemption, distribution and integration-resolution records with explicit product identity boundary.',
      [
        { key: 'resolution-risk', assertion: 'Remaining GMX V1 risk concerns redemptions, unclaimed distributions, integrations and contract authorities rather than new trading activity.', source_ids: [G('contracts'), G('plan'), G('archi')], evidence_locator: 'Archived redemption state and completed/manual distribution records.' },
        { key: 'unknown-residual', assertion: 'Current residual GLP, unclaimed distributions, unresolved integrations and full vulnerability-control mapping were not established.', source_ids: [G('contracts'), G('archi'), G('incident')], evidence_locator: 'Available sources describe recovery mechanics without a final live residual ledger.', support_direction: 'context_only' },
      ],
    ),
    lifecycle: section(
      'GMX V1 launched in 2021 and established GLP-backed spot and perpetual trading on Arbitrum and Avalanche. It became a successful early perpetual DEX product and supported many composable integrations. GMX V2 later became the successor while V1 remained available. The July 9, 2025 vulnerability drained most Arbitrum GLP, after which contributors paused V1 on both chains and negotiated return of most assets. Governance chose a distribution backed by recovered funds, residual GLP, segregated fees and approximately $2 million from treasury; the roughly $44 million GLV distribution was reported complete in August, with later work resolving Archi Finance users. V1 trading and minting stayed disabled and official docs now classify it as archived and redemption-only. The lifecycle is successful legacy product, exploited, recovered in substantial part and permanently sunset—not a failed GMX V2.',
      [G('contracts'), G('incident'), G('plan'), G('archi'), G('archived')],
      'Original product architecture, exploit, distribution, integration cleanup and current archive status.',
      [
        { key: 'exploit-to-distribution', assertion: 'The July 2025 V1 exploit was followed by negotiated recovery and an approximately $44 million affected-holder distribution.', source_ids: [G('incident'), G('plan')], evidence_locator: 'Incident fund accounting and distribution completion update.' },
        { key: 'permanent-sunset', assertion: 'V1 remained sunset and redemption-only after distribution, while V2 continued separately.', source_ids: [G('archived'), G('contracts'), G('incident')], evidence_locator: 'Current archived status and explicit V2 unaffected statement.' },
      ],
    ),
    outlook_and_watch: section(
      'Base case: GMX V1 stays closed while remaining GLP is redeemed and claim edge cases are completed. Upside is an orderly resolution with negligible unclaimed value, transparent final accounting and verified successor controls in V2. Downside is persistent stranded capital, disputed eligibility, overlooked integrations or an unresolved V1 control weakness that appears in copied systems. Watch remaining GLP supply and redeemable assets, reserved amounts, open legacy positions, claim-contract balances, distribution uptake, third-party integration claims, treasury reimbursement cost, postmortem detail and audit-to-fix mapping. Evaluate GMX V2 through its own volume, liquidity, fee, market-risk and security report; do not place those metrics on V1. Any reactivation of V1 trading or minting would invalidate this profile and require a fresh security and lifecycle review.',
      [G('contracts'), G('archived'), G('plan'), G('archi'), G('incident')],
      'Current resolution state and measurable closure/reopening triggers.',
      [
        { key: 'base-case', assertion: 'The base case is continued V1 closure with remaining redemptions and claim edge cases resolved over time.', source_ids: [G('archived'), G('plan'), G('archi')], evidence_locator: 'Redemption-only status and distribution cleanup records.', support_direction: 'context_only', note: 'Scenario analysis.' },
        { key: 'reopen-trigger', assertion: 'Any resumed V1 trading or GLP minting would invalidate the sunset classification and require a new review.', source_ids: [G('archived'), G('contracts')], evidence_locator: 'Current explicit no-trading and no-liquidity baseline.', support_direction: 'context_only' },
      ],
    ),
  },
  metrics: [
    { key: 'gross-drain', dimension: 'exploit_loss', label: 'GMX V1 Arbitrum GLP gross value withdrawn', value: 42000000, unit: 'usd', currency: 'USD', as_of: '2025-07-09', window: { start: '2025-07-09', end: '2025-07-09', definition: 'incident_estimate' }, method: 'GMX governance incident estimate', scope: scope('GMX V1 Arbitrum GLP', ['Arbitrum']), source_ids: [G('incident'), G('coindesk')], evidence_locator: 'Governance reported ~$42M withdrawn from ~$46M GLP; independent report corroborates incident scale.', quality_flags: ['gross_incident_value', 'not_final_user_loss'] },
    { key: 'recovered-stablecoins', dimension: 'exploit_recovery', label: 'Recovered funds held in stablecoins before distribution', value: 40100000, unit: 'usd', currency: 'USD', as_of: '2025-07-17', window: { start: '2025-07-09', end: '2025-07-17', definition: 'recovery_estimate' }, method: 'GMX governance preliminary recovery accounting', scope: scope('GMX V1 Arbitrum GLP recovery', ['Arbitrum', 'Ethereum']), source_ids: [G('incident')], evidence_locator: 'Governance preliminary table listed $40.1M recovered funds held in stablecoins.', quality_flags: ['preliminary_estimate', 'excludes_residual_glp', 'not_distribution_total'] },
    { key: 'distribution', dimension: 'exploit_recovery', label: 'Reported GLP holder distribution', value: 44000000, unit: 'usd', currency: 'USD', as_of: '2025-08-13', window: { start: '2025-08-04', end: '2025-08-13', definition: 'distribution_value' }, method: 'GMX governance reported completed distribution', scope: scope('Eligible Arbitrum GLP holders', ['Arbitrum']), source_ids: [G('plan')], evidence_locator: 'Aug. 13 update reports ~$44M available and completed in GLV claims.', quality_flags: ['includes_treasury_topup', 'not_cash_only', 'glv_distribution'] },
  ],
  events: [
    { key: 'exploit', type: 'security_incident', date: '2025-07-09', amount_usd: 42000000, description: 'A live GMX V1 vulnerability allowed about $42 million of Arbitrum GLP value to be withdrawn.', source_ids: [G('incident'), G('coindesk')], evidence_locator: 'Governance incident accounting and independent coverage.' },
    { key: 'distribution', type: 'recovery_distribution', date: '2025-08-13', amount_usd: 44000000, description: 'GMX reported completing an approximately $44 million GLV distribution for affected Arbitrum GLP holders.', source_ids: [G('plan')], evidence_locator: 'Dated distribution completion update.' },
  ],
  unsourced_fields: ['Current remaining GLP and redeemable assets', 'Unclaimed distribution value and claimant count', 'Final unresolved third-party integrations', 'Complete vulnerability root cause and successor-control mapping', 'Final treasury recovery cost'],
  methodology_notes: [
    'GMX V1/GLP is modeled separately from GMX V2/GM/GLV. No V2 activity is assigned to the sunset product.',
    'Gross drain, recovered stablecoins, residual GLP, treasury top-up and GLV distribution are separate values and are not added into one recovery rate.',
  ],
});

const M = (key) => sid('mango-markets', key);
const mango = buildProfile({
  slug: 'mango-markets',
  name: 'Mango Markets',
  aliases: ['Mango V4', 'Mango Markets V4'],
  operating_state: 'closed',
  outcome_label: 'closed_after_oracle_manipulation_and_regulatory_winddown',
  confidence: 'high',
  outcome_note: 'The venue is closed. Partial asset return, regulatory cases and residual onchain balances are separate from product operation and do not constitute a restart.',
  classification: {
    subtype: 'closed Solana margin and perpetual DEX',
    tags: ['margin', 'perpetuals', 'oracle_manipulation', 'regulatory_settlement', 'closed'],
    chains: ['Solana'],
    jurisdictions: ['United States enforcement exposure'],
  },
  sources: mangoSources,
  status_assertion: 'Mango Markets V4 and Boost were wound down in January 2025, and no current operating-volume window was reported by the reviewed adapter on Aug. 3, 2026.',
  status_source_ids: [M('winddown'), M('dlnews'), M('volume'), M('tvl')],
  status_evidence_locator: 'Dated wind-down reporting and current adapter null volume/residual TVL fields.',
  outcome_assertion: 'Mango Markets closed after the 2022 oracle-manipulation drain, incomplete recovery, regulatory settlement and governance wind-down.',
  outcome_source_ids: [M('cftc-release'), M('sec-release'), M('winddown'), M('court-vacatur')],
  outcome_evidence_locator: 'Regulator loss/recovery records, SEC settlement terms, dated venue closure and the later court disposition of criminal charges.',
  sections: {
    what_it_is: section(
      'Mango Markets was a non-custodial trading and borrowing venue on Solana. Users deposited assets into margin accounts, traded spot and perpetual products and borrowed against collateral valued by protocol oracles. MNGO served as a governance token and was itself connected to trading and collateral mechanics. That combination let users manage many positions from one cross-margined account, but it also meant a distorted oracle or thin collateral market could affect borrowing capacity across the platform. Mango V4 and Boost are now wound down; this is a historical and resolution profile, not an invitation to use a live exchange. The remaining Solana program balances or governance authorities must be tracked separately from operating status. Likewise, enforcement proceedings against entities and an individual do not themselves determine whether a smart contract still holds residual assets.',
      [M('v4-repository'), M('cftc-complaint'), M('doj-indictment'), M('sec-release'), M('winddown'), M('tvl')],
      'Regulator descriptions of the platform and MNGO roles, dated wind-down report and current residual adapter state.',
      [
        { key: 'margin-model', assertion: 'Mango Markets combined cross-margin trading, perpetual positions and borrowing against oracle-valued collateral on Solana.', source_ids: [M('v4-repository'), M('cftc-complaint'), M('doj-indictment')], evidence_locator: 'Operator V4 program/client repository and CFTC/DOJ descriptions of Mango accounts, perpetual positions, health and borrowing.' },
        { key: 'closed-boundary', assertion: 'Mango V4 and Boost were wound down in January 2025; residual program balances do not establish an operating venue.', source_ids: [M('winddown'), M('tvl'), M('volume')], evidence_locator: 'Wind-down date and Aug. 3 null current-volume/residual-TVL adapter fields.' },
      ],
    ),
    what_happened: section(
      'Mango launched in 2021 and raised more than $70 million through MNGO sales according to the SEC’s allegations. On Oct. 11, 2022, Avraham Eisenberg used two controlled accounts to take opposing MNGO perpetual positions, bought thinly traded MNGO in external markets, moved the oracle price more than thirteen-fold and used the inflated long position as collateral to withdraw over $110 million. The CFTC says approximately $67 million was later returned while about $47 million was retained. A federal jury convicted Eisenberg in April 2024, but the district court vacated the commodities convictions and entered a wire-fraud acquittal on May 23, 2025. The report does not present the former verdict as current. In September 2024 Mango entities agreed to nearly $700,000 in penalties, destruction of MNGO tokens and delisting requests, subject to court approval. Governance then made borrowing uneconomic and wound down V4 and Boost in January 2025. Current adapters show no recent volume and about $14,943 residual TVL.',
      [M('sec-release'), M('cftc-release'), M('doj-conviction'), M('court-vacatur'), M('winddown'), M('volume'), M('tvl')],
      'SEC fundraising/settlement allegations, CFTC incident/recovery values, jury-verdict history and later court disposition, closure and current adapter state.',
      [
        { key: 'oracle-drain', assertion: 'On Oct. 11, 2022, manipulated MNGO prices inflated collateral and enabled withdrawal of more than $110 million from Mango Markets.', source_ids: [M('cftc-release'), M('cftc-complaint'), M('doj-indictment'), M('coindesk-exploit')], evidence_locator: 'CFTC and DOJ event sequence plus contemporaneous independent reporting.' },
        { key: 'partial-return', assertion: 'The CFTC reported approximately $67 million returned and approximately $47 million retained after the Mango drain.', source_ids: [M('cftc-release')], evidence_locator: 'CFTC release recovery paragraph.' },
        { key: 'conviction-vacated', assertion: 'The district court vacated Eisenberg’s two commodities convictions and entered a wire-fraud acquittal on May 23, 2025.', source_ids: [M('court-vacatur')], evidence_locator: 'Opinion and Order concluding paragraphs and disposition.' },
        { key: 'regulatory-winddown', assertion: 'Mango entities agreed to destroy MNGO and seek delisting, and Mango V4 and Boost wound down in January 2025.', source_ids: [M('sec-release'), M('winddown'), M('dlnews')], evidence_locator: 'SEC settlement terms and independent closure reports.' },
      ],
    ),
    why_this_outcome: section(
      'Mango failed because it allowed a thin, reflexive token market to support platform-wide borrowing at a scale the external market could not absorb. The attacker could trade MNGO perpetuals between controlled accounts, buy the spot token enough to move the oracle, show a large unrealized collateral gain and withdraw other users’ assets before the price normalized. Cross-margin design spread that risk across available deposits. The partial asset return reduced the loss but left a large shortfall and a controversial governance negotiation. The venue continued for a time, so the exploit alone did not mechanically close it. Trust damage, depleted economics, contributor conflict and U.S. enforcement then narrowed the recovery path. The SEC settlement’s MNGO destruction and delisting terms removed a major governance and incentive foundation, and governance chose wind-down. The supported conclusion is a product-design failure followed by incomplete recovery and institutional closure.',
      [M('cftc-release'), M('cftc-complaint'), M('doj-indictment'), M('sec-release'), M('winddown')],
      'Incident mechanics, retained shortfall, settlement obligations and closure chronology.',
      [
        { key: 'thin-collateral-failure', assertion: 'Mango let oracle-valued MNGO perpetual gains support cross-asset withdrawals despite the token’s manipulable external liquidity.', source_ids: [M('cftc-complaint'), M('doj-indictment')], evidence_locator: 'Regulator account, self-trade, spot-purchase, oracle and borrowing sequence.' },
        { key: 'closure-chain', assertion: 'Incomplete recovery, enforcement settlement and governance wind-down followed the exploit rather than a successful restoration of the venue.', source_ids: [M('cftc-release'), M('sec-release'), M('winddown')], evidence_locator: 'Recovery amount, settlement terms and January 2025 closure.' },
      ],
    ),
    strategic_choices: section(
      'Mango chose a cross-margin product where many assets and perpetual positions contributed to one account’s borrowing health. It accepted MNGO-linked position value in that system and allowed large exposure relative to observable spot depth, making the venue capital-efficient in normal use and fragile under manipulation. After the drain, DAO governance negotiated a return of approximately $67 million while the attacker retained a substantial amount; this recovered more for users but created controversy around the proposed release from liability. Mango then tried to continue rather than close immediately. Later, Mango DAO, Mango Labs and Blockworks Foundation settled SEC allegations through penalties, MNGO destruction and delisting requests. Finally, governance made most borrowing economically unviable and wound down the product. Each choice narrowed the future path: flexible collateral enabled growth, negotiation limited loss, and settlement plus wind-down prioritized legal and financial closure over revival.',
      [M('cftc-release'), M('cftc-complaint'), M('sec-release'), M('winddown'), M('dlnews')],
      'Account and collateral design, recovery negotiation, settlement and governance closure records.',
      [
        { key: 'risk-parameters', assertion: 'Mango permitted leveraged MNGO exposure and oracle-valued gains to support borrowing large amounts of other deposited assets.', source_ids: [M('cftc-complaint'), M('doj-indictment')], evidence_locator: 'Detailed controlled-account, price and withdrawal mechanics.' },
        { key: 'negotiated-return', assertion: 'Mango governance accepted a negotiated partial return rather than recover every withdrawn asset.', source_ids: [M('cftc-release')], evidence_locator: 'CFTC description of approximately $67M returned and approximately $47M retained.' },
        { key: 'closure-choice', assertion: 'After the SEC settlement, governance changed borrowing economics and wound down V4 and Boost.', source_ids: [M('sec-release'), M('winddown'), M('dlnews')], evidence_locator: 'Settlement obligations and dated closure proposals.' },
      ],
    ),
    operating_model: section(
      'Before closure, Mango accounts held deposited collateral, open spot and perpetual positions and borrowed assets. Oracle prices marked positions and determined account health; if health fell too low, liquidation should reduce risk. The 2022 scheme exploited the opposite direction: an artificially high marked MNGO position created apparent borrowing power before liquidation controls could protect depositors. External market depth, oracle construction, open-interest limits, collateral weights and withdrawal capacity were therefore part of one safety system. After wind-down, most borrowing was made economically unviable and the product stopped operating. DefiLlama still reports about $14,943 of residual TVL and $7 borrowed, but that is not customer-ready liquidity or proof of resumed markets. No current volume windows were returned. Final balances, upgrade authorities and withdrawal paths require direct program-level reconciliation beyond the adapter.',
      [M('v4-repository'), M('cftc-complaint'), M('doj-indictment'), M('winddown'), M('tvl'), M('volume')],
      'Regulator account-health mechanics, closure parameters and current residual adapter fields.',
      [
        { key: 'oracle-health-model', assertion: 'Mango account health and borrowing capacity depended on oracle-valued collateral and positions.', source_ids: [M('cftc-complaint'), M('doj-indictment')], evidence_locator: 'CFTC/DOJ descriptions of account health, MNGO perpetual value and borrowing.' },
        { key: 'residual-not-live', assertion: 'The Aug. 3 adapter showed about $14,943 residual TVL but no current volume, which does not establish a reopened venue.', source_ids: [M('tvl'), M('volume'), M('winddown')], evidence_locator: 'Latest protocol TVL, null current volume windows and closure report.', support_direction: 'context_only' },
      ],
    ),
    token_and_value_capture: section(
      'MNGO was sold as Mango’s governance token and was used in the ecosystem around trading and risk parameters. The SEC alleged that Mango DAO and Blockworks Foundation raised more than $70 million from unregistered MNGO offers beginning in August 2021, and that affiliated entities operated as unregistered brokers. Those are allegations resolved without admissions or denials, not universal legal classifications for governance tokens. The settlement required the named entities to destroy their MNGO, request removal from trading platforms and refrain from seeking new listings, subject to court approval. That removed much of the practical token base for reviving governance and incentives. MNGO also sat inside the 2022 manipulation path, demonstrating that a governance token can become a collateral risk when thin market value affects platform credit. There is no continuing token value-capture thesis for a closed venue and no equity or recovery claim is represented here.',
      [M('sec-release'), M('sec-complaint'), M('cftc-release'), M('doj-indictment')],
      'SEC offer/broker allegations and settlement terms read with the MNGO manipulation mechanics.',
      [
        { key: 'fundraising', assertion: 'The SEC alleged that Mango DAO and Blockworks Foundation raised more than $70 million through MNGO offers beginning in August 2021.', source_ids: [M('sec-release'), M('sec-complaint')], evidence_locator: 'SEC litigation release and complaint allegations.' },
        { key: 'destroy-delist', assertion: 'The settlement required named Mango entities to destroy MNGO holdings and seek delisting, subject to court approval.', source_ids: [M('sec-release')], evidence_locator: 'SEC settlement-terms paragraph.' },
        { key: 'no-live-token-case', assertion: 'A closed Mango venue provides no current operating basis for a token value-capture conclusion.', source_ids: [M('winddown'), M('volume')], evidence_locator: 'Closure and absence of current adapter volume.', support_direction: 'context_only' },
      ],
    ),
    counterfactual: section(
      'Strict open-interest caps tied to observable MNGO spot depth, conservative collateral weights, withdrawal limits and an oracle that discounted manipulable markets could have reduced the 2022 blast radius. Independent real-time risk intervention after an extreme price move might also have paused borrowing before most available assets left. Those controls would reduce capital efficiency and market breadth, which is exactly the trade-off a leveraged venue must make. After the incident, immediate closure could prevent further operating risk but would abandon a chance to recover utility and fees; Mango instead continued until settlement and governance conflict made continuation less viable. The exact avoided loss under any one control is unknown because public sources do not replay a full alternative risk engine. The lesson is not that all perpetual DEXs fail, but that collateral limits must reflect external liquidity under adversarial conditions.',
      [M('cftc-complaint'), M('doj-indictment'), M('coindesk-exploit'), M('winddown')],
      'Observed manipulation and delayed closure used to bound alternative risk controls.',
      [
        { key: 'risk-control-alternative', assertion: 'Liquidity-linked open-interest caps, lower collateral weights and withdrawal limits could reduce exposure, but the avoided loss is not quantified.', source_ids: [M('cftc-complaint'), M('doj-indictment')], evidence_locator: 'Observed position, price and withdrawal sequence used to define untested controls.', support_direction: 'context_only', note: 'Counterfactual.' },
        { key: 'immediate-closure-alternative', assertion: 'Closing immediately after the exploit would reduce continued operating risk while sacrificing any attempted product recovery.', source_ids: [M('cftc-release'), M('winddown')], evidence_locator: 'Partial return and later closure show the actual continuation path.', support_direction: 'context_only', note: 'Counterfactual.' },
      ],
    ),
    risks_and_unknowns: section(
      'Mango’s exchange risk has shifted from active trading to resolution. Residual programs may still hold assets, open authorities or governance controls; users can face withdrawal or account-cleanup issues even when the venue is closed. The final recovery percentage depends on original claims, returned assets, subsequent operations and distributions—not just the CFTC’s $67 million return. Court treatment of SEC settlement terms and remaining civil or criminal proceedings may change legal obligations without reopening the product. Unknowns include final assets and liabilities, depositor recovery by claim, residual positions, DAO treasury distributions, program upgrade authority, oracle configuration left onchain, admin key control and whether any interface or API still exposes unsafe actions. The Aug. 3 residual TVL should be treated as a cleanup signal. A website, token trade or legal update must not be mistaken for renewed exchange operation.',
      [M('cftc-release'), M('sec-release'), M('winddown'), M('tvl'), M('volume')],
      'Recovery, settlement, closure and residual adapter state with explicit product-operation boundary.',
      [
        { key: 'residual-authority-risk', assertion: 'Residual Mango programs, balances and authorities can remain relevant after the trading venue closes.', source_ids: [M('tvl'), M('winddown')], evidence_locator: 'Residual adapter TVL compared with explicit product wind-down.' },
        { key: 'final-recovery-unknown', assertion: 'Final depositor recovery, remaining assets and liabilities, and current program authorities were not established.', source_ids: [M('cftc-release'), M('sec-release'), M('tvl')], evidence_locator: 'Partial-return figure, settlement terms and residual balance lack a final claim ledger.', support_direction: 'context_only' },
      ],
    ),
    lifecycle: section(
      'Mango launched on Solana in August 2021 as a margin, spot and perpetual venue and sold MNGO as its governance token. The Oct. 11, 2022 manipulation drained more than $110 million; approximately $67 million was returned after a DAO agreement, leaving a substantial retained amount. Mango continued through newer versions while regulators and prosecutors pursued the case. A federal jury returned guilty verdicts in April 2024, but the district court vacated the commodities convictions and entered a wire-fraud acquittal in May 2025. In September 2024, Mango entities agreed to SEC settlement terms including penalties, MNGO destruction and delisting requests. Governance and contributor conflict culminated in V4 and Boost winding down on Jan. 13, 2025. By Aug. 3, 2026, the adapter returned no current volume and only a small residual balance. The lifecycle is launched, exploited, partially recovered, legally constrained and closed—not merely inactive and not recovered in full.',
      [M('sec-release'), M('cftc-release'), M('doj-conviction'), M('court-vacatur'), M('winddown'), M('volume'), M('tvl')],
      'Launch/fundraising allegation, exploit, partial return, jury-verdict history, later court disposition, settlement, wind-down and current residual state.',
      [
        { key: 'exploit-and-return', assertion: 'The 2022 drain exceeded $110 million and approximately $67 million was returned after the event.', source_ids: [M('cftc-release')], evidence_locator: 'CFTC incident and return accounting.' },
        { key: 'closure', assertion: 'Mango V4 and Boost wound down in January 2025 after settlement and governance conflict.', source_ids: [M('sec-release'), M('winddown'), M('dlnews')], evidence_locator: 'SEC terms and two dated closure reports.' },
        { key: 'criminal-case-disposition', assertion: 'The April 2024 jury verdicts are not current convictions because the district court vacated two and entered an acquittal on the third in May 2025.', source_ids: [M('doj-conviction'), M('court-vacatur')], evidence_locator: 'Historical DOJ jury-verdict release compared with the later court Opinion and Order.' },
        { key: 'current-closed', assertion: 'No current adapter volume was reported on Aug. 3, 2026, consistent with closure rather than live exchange activity.', source_ids: [M('volume'), M('winddown')], evidence_locator: 'Null total24h/total30d response and closure baseline.' },
      ],
    ),
    outlook_and_watch: section(
      'Base case: Mango remains closed while residual assets, authorities and legal matters are resolved. Upside is not renewed trading; it is orderly user recovery, transparent final accounting and deactivation or safe transfer of program control. Downside is stranded balances, disputed treasury distributions, unresolved authorities or interfaces that imply functionality the product no longer supports. Watch residual TVL and borrowed values, final depositor claims, DAO treasury movements, program upgrade and admin authorities, remaining positions, withdrawal paths, interface availability, MNGO destruction and delisting implementation, and final court or enforcement orders. A true restart would require new audited risk limits, oracle controls, governance, capitalization and operating evidence and would be a new lifecycle event. Until then, token activity or legal headlines cannot change the closed-product call.',
      [M('tvl'), M('volume'), M('winddown'), M('sec-release'), M('cftc-release')],
      'Current residual state, settlement duties and explicit reopening criteria.',
      [
        { key: 'base-case', assertion: 'The base case is continued closure with resolution of residual balances, authorities and legal matters.', source_ids: [M('winddown'), M('tvl'), M('sec-release')], evidence_locator: 'Closure, residual balance and ongoing settlement obligations.', support_direction: 'context_only', note: 'Scenario analysis.' },
        { key: 'restart-standard', assertion: 'Any claimed Mango restart would require fresh operating, audit, oracle, risk-limit and governance evidence.', source_ids: [M('winddown'), M('cftc-complaint')], evidence_locator: 'Closed baseline and documented risk failure define the evidence required to change the call.', support_direction: 'context_only' },
      ],
    ),
  },
  metrics: [
    { key: 'exploit-loss', dimension: 'exploit_loss', label: 'Mango assets withdrawn in manipulation', value: 110000000, unit: 'usd', currency: 'USD', as_of: '2022-10-11', window: { start: '2022-10-11', end: '2022-10-11', definition: 'incident_minimum' }, method: 'CFTC described more than $110M withdrawn', scope: scope('Mango Markets and deposited user assets', ['Solana']), source_ids: [M('cftc-release'), M('cftc-complaint')], evidence_locator: 'CFTC release and complaint describe over $110M withdrawn.', quality_flags: ['minimum_value', 'not_final_user_loss'] },
    { key: 'exploit-recovery', dimension: 'exploit_recovery', label: 'Mango assets returned after manipulation', value: 67000000, unit: 'usd', currency: 'USD', as_of: '2022-10-15', window: { start: '2022-10-11', end: '2022-10-15', definition: 'reported_return' }, method: 'CFTC reported approximate returned value', scope: scope('Mango Markets negotiated return', ['Solana']), source_ids: [M('cftc-release')], evidence_locator: 'CFTC release states approximately $67M returned.', quality_flags: ['approximate', 'not_final_recovery_rate'] },
    { key: 'residual-tvl', dimension: 'tvl', label: 'Mango residual tracked TVL', value: 14943, unit: 'usd', currency: 'USD', as_of: CHECKED_AT, window: rolling('point_in_time'), method: 'DefiLlama Mango Markets latest TVL', scope: scope('Residual Mango Markets adapter state', ['Solana']), source_ids: [M('tvl')], evidence_locator: 'Latest tvl total retrieved at 2026-08-03T18:31:22Z.', quality_flags: ['residual_balance', 'not_operating_liquidity', 'tvl_not_market_depth'] },
  ],
  events: [
    { key: 'oracle-manipulation', type: 'market_manipulation', date: '2022-10-11', amount_usd: 110000000, description: 'Manipulated MNGO prices inflated collateral and enabled withdrawal of more than $110 million from Mango Markets.', source_ids: [M('cftc-release'), M('doj-indictment')], evidence_locator: 'Regulator incident chronology.' },
    { key: 'sec-settlement', type: 'regulatory_settlement', date: '2024-09-27', amount_usd: 700000, description: 'Mango entities agreed to nearly $700,000 in penalties, MNGO destruction and delisting requests, subject to court approval.', source_ids: [M('sec-release')], evidence_locator: 'SEC litigation release settlement terms.' },
    { key: 'winddown', type: 'product_shutdown', date: '2025-01-13', description: 'Mango V4 and Boost wound down and most borrowing became economically unviable.', source_ids: [M('winddown'), M('dlnews')], evidence_locator: 'Dated independent wind-down reports.' },
  ],
  unsourced_fields: ['Final depositor recovery percentage', 'Complete residual assets and liabilities', 'Current program upgrade and admin authorities', 'Remaining positions and withdrawal paths', 'Final settlement and enforcement dispositions'],
  methodology_notes: [
    'The $110M+ withdrawal, $67M returned and residual TVL are separate observations; they are not combined into a final recovery percentage.',
    'Regulator allegations, the historical jury verdict, the later vacatur and acquittal, settlement obligations and product operation are labeled separately.',
  ],
});

function legacy({ metricLabel, metricType, metric, summary, outlook, operatingModel }) {
  return {
    metric_label: metricLabel,
    metric_type: metricType,
    metric_unit: 'USD',
    metric,
    summary,
    outlook,
    operating_model: operatingModel,
  };
}

export const document = {
  schema: 'chaindump-dex-wave-e-v1',
  as_of: AS_OF,
  checked_at: CHECKED_AT,
  generated_migration: MIGRATION,
  cases: [
    {
      table: 'successful_exchanges', slug: 'aerodrome', name: 'Aerodrome', sources: aerodromeSources, canonical_profile: aerodrome,
      legacy: legacy({ metricLabel: '24h spot volume', metricType: 'spot_volume_24h', metric: 302291376, summary: 'Aerodrome became Base’s liquidity hub by combining chain distribution with vote-directed emissions and fee flow. Its success is real; subsidy dependence and Aero migration execution remain unresolved.', outlook: 'Established and operating. Watch fee productivity against AERO issuance, veAERO concentration, Base share and post-migration retention.', operatingModel: 'Base-native constant-product and concentrated-liquidity AMM with weekly veAERO-directed incentives.' }),
    },
    {
      table: 'mid_exchanges', slug: 'balancer', name: 'Balancer', sources: balancerSources, canonical_profile: balancer,
      legacy: legacy({ metricLabel: 'TVL', metricType: 'tvl', metric: 60832590, summary: 'Balancer remains live through V3 after a major V2 exploit and a smaller 2026 operating structure. Surviving code is not the same as restored capital or trust.', outlook: 'Operating but declining. Watch V3 migration, final recoveries, incident-free duration, fee coverage and OpCo delivery.', operatingModel: 'Multi-chain programmable weighted and stable-pool AMM with shared Vault accounting across distinct protocol versions.' }),
    },
    {
      table: 'mid_exchanges', slug: 'bancor', name: 'Bancor', sources: bancorSources, canonical_profile: bancor,
      legacy: legacy({ metricLabel: 'TVL', metricType: 'tvl', metric: 23998429, summary: 'Bancor survived its 2022 protection crisis, but unresolved LP deficits and thin current activity leave the protocol impaired rather than recovered.', outlook: 'Operating in a diminished state. Watch withdrawable TVL, pool deficits, actual repair transfers, BNT issuance and a dated recovery ledger.', operatingModel: 'Ethereum single-sided-liquidity AMM whose legacy protection system links pool liabilities to BNT economics.' }),
    },
    {
      table: 'dead_exchanges', slug: 'gmx-v1', name: 'GMX V1 (GLP)', sources: gmxSources, canonical_profile: gmxV1,
      legacy: legacy({ metricLabel: 'Gross incident value withdrawn', metricType: 'exploit_loss', metric: 42000000, summary: 'GMX V1 was exploited, substantially recovered through negotiated return and DAO distribution, and permanently sunset. GMX V2 remained a separate operating product.', outlook: 'Sunset and redemption-only. Watch residual GLP, unclaimed distributions, integration cleanup and archived contract authorities.', operatingModel: 'Sunset Arbitrum and Avalanche pooled-counterparty perpetual DEX backed by GLP.' }),
    },
    {
      table: 'dead_exchanges', slug: 'mango-markets', name: 'Mango Markets', sources: mangoSources, canonical_profile: mango,
      legacy: legacy({ metricLabel: 'Assets withdrawn in 2022 manipulation', metricType: 'exploit_loss', metric: 110000000, summary: 'Mango closed after a manipulable collateral design enabled a major drain, only partial assets returned, and regulatory and governance pressures ended the venue.', outlook: 'Closed. Watch residual user recovery, assets and liabilities, program authorities and final legal resolution; token activity is not a restart.', operatingModel: 'Closed Solana cross-margin, spot and perpetual venue using oracle-valued collateral.' }),
    },
  ],
};

function sqlLiteral(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function stagedInsert(item) {
  const values = [
    item.table,
    item.slug,
    item.name,
    JSON.stringify(item.canonical_profile),
    JSON.stringify(item.sources),
    JSON.stringify(item.legacy),
  ].map(sqlLiteral).join(',\n  ');
  return `INSERT INTO _dex_wave_e_0081 (target_table, slug, name, canonical_profile, sources, legacy)\nVALUES (\n  ${values}\n);`;
}

function updateStatement(table, kindColumn, summaryColumn, { dead = false } = {}) {
  const metricAssignments = dead
    ? `peak_metric = json_extract(staged.legacy, '$.metric'),
  current_metric = NULL,
  drawdown_pct = NULL,`
    : `metric = json_extract(staged.legacy, '$.metric'),`;
  return `UPDATE ${table} AS exchange_row
SET
  metric_label = json_extract(staged.legacy, '$.metric_label'),
  metric_type = json_extract(staged.legacy, '$.metric_type'),
  metric_unit = json_extract(staged.legacy, '$.metric_unit'),
  ${metricAssignments}
  ${summaryColumn} = json_extract(staged.legacy, '$.summary'),
  outlook = json_extract(staged.legacy, '$.outlook'),
  profile = CASE
    WHEN json_type(COALESCE(exchange_row.profile, '{}'), '$.legacy_preservation.previous_profile') IS NULL THEN
      json_set(
        json_remove(COALESCE(exchange_row.profile, '{}'), '$.sources'),
        '$.canonical_profile', json(staged.canonical_profile),
        '$.operational_model', json_extract(staged.legacy, '$.operating_model'),
        '$.legacy_preservation.previous_profile', json(COALESCE(exchange_row.profile, '{}')),
        '$.legacy_preservation.previous_sources', json(COALESCE(exchange_row.sources, '[]')),
        '$.legacy_preservation.preserved_at', '${AS_OF}'
      )
    ELSE json_set(
      json_remove(COALESCE(exchange_row.profile, '{}'), '$.sources'),
      '$.canonical_profile', json(staged.canonical_profile),
      '$.operational_model', json_extract(staged.legacy, '$.operating_model')
    )
  END,
  sources = staged.sources,
  updated_at = '${AS_OF}'
FROM _dex_wave_e_0081 AS staged
WHERE staged.target_table = '${table}'
  AND exchange_row.${kindColumn} = 'dex'
  AND exchange_row.slug = staged.slug;`;
}

export function renderMigration(value = document) {
  const inserts = value.cases.map(stagedInsert).join('\n');
  return `-- DEX Wave E normalized profiles, researched through ${AS_OF}.
-- One explicit atomic assertion per claim; every claim remains pending human review.
-- GMX V1 is identity-scoped and never conflated with operating GMX V2.
DROP TABLE IF EXISTS _dex_wave_e_0081;
CREATE TABLE _dex_wave_e_0081 (
  target_table TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  canonical_profile TEXT NOT NULL CHECK(json_valid(canonical_profile)),
  sources TEXT NOT NULL CHECK(json_valid(sources)),
  legacy TEXT NOT NULL CHECK(json_valid(legacy)),
  PRIMARY KEY(target_table, slug)
);
${inserts}
${updateStatement('successful_exchanges', 'type', 'why_successful')}
${updateStatement('mid_exchanges', 'kind', 'why_stuck')}
${updateStatement('dead_exchanges', 'kind', 'why', { dead: true })}
DROP TABLE _dex_wave_e_0081;
`;
}

function writeOutputs() {
  writeFileSync(
    fileURLToPath(new URL('../docs/dex-wave-e-profiles-2026-08-03.json', import.meta.url)),
    `${JSON.stringify(document, null, 2)}\n`,
  );
  writeFileSync(
    fileURLToPath(new URL(`../migrations/${MIGRATION}`, import.meta.url)),
    renderMigration(),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) writeOutputs();

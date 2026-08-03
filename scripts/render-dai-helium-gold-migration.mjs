import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const AS_OF = '2026-08-03';
const CHECKED_AT = '2026-08-03T17:26:35Z';
const NEXT_REVIEW_AT = '2026-08-10';
const MIGRATION = '0076_dai_helium_gold_profiles.sql';
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

function source(id, title, url, publisher, role = 'primary', tier = 'B', publishedAt = null) {
  return {
    id,
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

function pendingClaim(slug, id, fieldPath, sourceIds, evidenceLocator, options = {}) {
  return {
    id: `claim:${slug}:${id}`,
    field_path: fieldPath,
    source_ids: sourceIds,
    evidence_locator: evidenceLocator,
    support_direction: options.supportDirection || 'supports',
    note: options.note || null,
    review: { state: 'pending', reviewer: null, reviewed_at: null },
  };
}

function metric(
  slug,
  key,
  dimension,
  label,
  value,
  unit,
  asOf,
  method,
  scope,
  sourceIds,
  qualityFlags = [],
  window = { start: null, end: asOf, definition: 'point_in_time' },
) {
  return {
    id: `metric:${slug}:${key}`,
    dimension,
    label,
    value,
    unit,
    currency: unit === 'usd' ? 'USD' : null,
    window,
    as_of: asOf,
    method,
    scope,
    formula: null,
    raw_input_ids: [],
    claim_ids: [`claim:${slug}:metric:${key}`],
    quality_flags: qualityFlags,
    source_ids: sourceIds,
  };
}

function event(slug, key, type, date, description, sourceIds) {
  return {
    id: `event:${slug}:${key}`,
    type,
    date,
    date_precision: 'day',
    amount_usd: null,
    description,
    claim_ids: [`claim:${slug}:event:${key}`],
    source_ids: sourceIds,
  };
}

function buildProfile(spec) {
  const claims = [
    pendingClaim(
      spec.slug,
      'status',
      'status.operating_state',
      spec.status.sourceIds,
      spec.status.evidenceLocator,
    ),
    pendingClaim(
      spec.slug,
      'outcome',
      'outcome.label',
      spec.outcome.sourceIds,
      spec.outcome.evidenceLocator,
      { note: spec.outcome.note },
    ),
  ];
  const sectionClaimIds = {};
  for (const sectionKey of SECTION_KEYS) {
    sectionClaimIds[sectionKey] = [];
    for (const item of spec.sectionEvidence[sectionKey]) {
      const id = `${sectionKey}:${item.id}`;
      sectionClaimIds[sectionKey].push(`claim:${spec.slug}:${id}`);
      claims.push(pendingClaim(
        spec.slug,
        id,
        `analysis.sections.${sectionKey}.body`,
        item.sourceIds,
        item.evidenceLocator,
        { supportDirection: item.supportDirection, note: item.note },
      ));
    }
  }
  for (const item of spec.metrics) {
    const key = item.id.split(':').slice(2).join(':');
    claims.push(pendingClaim(
      spec.slug,
      `metric:${key}`,
      `metrics[${key}].value`,
      item.source_ids,
      item.method,
    ));
  }
  for (const item of spec.events) {
    const key = item.id.split(':').slice(2).join(':');
    claims.push(pendingClaim(
      spec.slug,
      `event:${key}`,
      `events[${key}]`,
      item.source_ids,
      `Dated record for ${item.description}`,
    ));
  }
  return {
    schema: 'chaindump-entity-profile-source',
    version: 1,
    classification: spec.classification,
    status: {
      operating_state: 'operating',
      as_of: AS_OF,
      claim_ids: [`claim:${spec.slug}:status`],
    },
    outcome: {
      label: spec.outcome.label,
      as_of: AS_OF,
      rule_id: 'forensic-lifecycle-v1',
      confidence: spec.outcome.confidence,
      claim_ids: [`claim:${spec.slug}:outcome`],
    },
    sections: spec.sections,
    section_dates: Object.fromEntries(SECTION_KEYS.map((key) => [key, AS_OF])),
    section_claim_ids: sectionClaimIds,
    metrics: spec.metrics.map(({ source_ids: ignored, ...item }) => item),
    events: spec.events.map(({ source_ids: ignored, ...item }) => item),
    claims,
    freshness: {
      state: 'current',
      last_reviewed_at: AS_OF,
      next_review_at: NEXT_REVIEW_AT,
      field_reviews: [],
    },
    confidence: spec.outcome.confidence,
    extensions: {
      methodology_notes: [
        'The evidence was assembled and checked on Aug. 3, 2026. Every claim remains pending until a person reviews it.',
        ...spec.methodology,
      ],
      structured_analysis: spec.structured,
      review_metadata: {
        schema: 'forensic-freshness-v1',
        status_basis: 'direct_current',
        status_as_of: AS_OF,
        last_verified_at: AS_OF,
        next_review_at: NEXT_REVIEW_AT,
        stale: false,
      },
    },
  };
}

const daiSources = [
  source('dai-vat', 'Vat — Detailed Documentation', 'https://docs.makerdao.com/smart-contract-modules/core-module/vat-detailed-documentation', 'MakerDAO Documentation'),
  source('dai-liquidation', 'Dog and Clipper — Detailed Documentation', 'https://docs.makerdao.com/smart-contract-modules/dog-and-clipper-detailed-documentation', 'MakerDAO Documentation'),
  source('dai-shutdown', 'Cage Keeper — Emergency Shutdown', 'https://docs.makerdao.com/keepers/cage-keeper', 'MakerDAO Documentation'),
  source('dai-upgrade-poll', 'Launch Project — DAI to USDS and MKR to SKY upgrades', 'https://vote.makerdao.com/polling/QmTySKwi', 'Maker Governance', 'primary', 'A', '2024-09-09'),
  source('dai-upgrade-exec', 'Ethereum transaction — USDS and DAI converter execution', 'https://eth.blockscout.com/tx/0x2221973333bd0c22f8b1b2593fa9817765bafcf65a2d3c25ebde8df06bbd197c', 'Blockscout', 'aggregator', 'B', '2024-09-17'),
  source('dai-litepsm-proposal', 'Sky executive vote — update LitePSM parameters', 'https://vote.sky.money/executive/template-executive-vote-onboard-allocator-grove-a-vault-update-litepsm-parameters-replace-stusds-mom-monthly-settlement-cycle-for-may-2026-staking-rewards-normalization-update-safe-harbor-agreement-prime-agent-proxy-spell-june-18-2026', 'Sky Governance', 'primary', 'A', '2026-06-18'),
  source('dai-litepsm-exec', 'Ethereum transaction — LitePSM parameter execution', 'https://eth.blockscout.com/tx/0xa2bffc99b76e5a2e2733ac1f5c350c1d7590e5ae74862fad58b2816b7ab8fba6', 'Blockscout', 'aggregator', 'B', '2026-06-22'),
  source('dai-current-governance', 'Sky executive votes', 'https://vote.sky.money/executive', 'Sky Governance', 'primary', 'A'),
  source('dai-guides', 'LitePSM implementation and operating constraints', 'https://github.com/makerdao/dss-lite-psm', 'Sky Ecosystem', 'primary', 'A'),
  source('dai-market', 'Dai stablecoin API', 'https://stablecoins.llama.fi/stablecoin/5', 'DefiLlama', 'aggregator', 'B'),
  source('dai-ark-2026', 'A Guide To Stablecoins: Multi-Collateral-Backed Stablecoins — DAI, USDS', 'https://www.ark-invest.com/articles/analyst-research/multi-collateral-backed-stablecoins-dai-usds', 'ARK Investment Management', 'independent', 'B', '2026-06-25'),
  source('dai-mica', 'Regulation (EU) 2023/1114 on markets in crypto-assets', 'https://eur-lex.europa.eu/eli/reg/2023/1114/oj', 'European Union', 'primary', 'A', '2023-06-09'),
];

const daiSections = {
  what_it_is: 'DAI is a dollar-denominated token issued by the Maker/Sky credit system. It is not a bank deposit and it is not USDS. Borrowers can create DAI by locking approved collateral in protocol vaults. DAI also moves through exchanges, applications and bridges after it is issued. Some peg support now depends on governance-controlled modules that hold or route stablecoins such as USDC.',
  what_happened: 'Maker built DAI as an on-chain, overcollateralized credit product and later expanded the collateral mix and peg tools. On Sept. 17, 2024, an executed governance transaction initialized the newer USDS system and a one-for-one conversion path between DAI and USDS. DAI remained live. On Aug. 3, 2026, DefiLlama reported about $4.80 billion of DAI representations across 49 chains. That figure is an aggregator snapshot and should not be combined with Sky-wide totals that include USDS.',
  why_this_outcome: 'DAI is still material because it remains embedded in DeFi and the protocol kept it usable while introducing USDS. The vault system, liquidations and peg modules explain how the product can issue credit and defend its price. They do not prove which feature caused adoption. The evidence supports an established, operating product with meaningful circulation; it does not support calling DAI fully decentralized or legally redeemable for dollars.',
  strategic_choices: 'Maker chose pooled collateral and governance-managed risk instead of a single company holding dollars and promising cash redemption. It later added stablecoin-based peg modules, accepting more issuer and freeze exposure in exchange for a tighter route to dollar liquidity. The Sky transition kept DAI live beside USDS rather than forcing every integration to migrate. On June 22, 2026, a governance spell changed LitePSM parameters after a proposal to raise its buffer and gap from 400 million to 800 million DAI. The transaction proves execution; it does not by itself prove better liquidity or lower risk.',
  operating_model: 'Borrowers lock approved collateral and draw DAI under governance-set debt ceilings, fees and liquidation ratios. Unsafe positions can be liquidated and their collateral sold to cancel debt. The LitePSM provides governed swap capacity between DAI, USDS and USDC through linked modules. Independent analysis describes DAI and USDS as sharing aggregate system backing, which makes a clean token-by-token collateral split impractical. Module liquidity can be paused, capped or depleted; it is not a promise that every holder can redeem at a bank.',
  token_and_value_capture: 'DAI is the debt token, not an ownership claim. Borrowers pay stability fees and liquidations may add penalties; protocol accounting and governance decide where those economics go. Savings USDS and other Sky products have separate reward rules. A DAI holder should not be described as receiving USDS savings returns, reserve income or equity in Sky merely because a conversion route exists.',
  counterfactual: 'A crypto-only collateral policy would reduce dependence on stablecoin issuers and off-chain credit, but likely make credit supply and the peg more volatile. A forced move to USDS could concentrate liquidity and branding, but would break some integrations and remove user choice. A direct legal claim on segregated dollars would be easier to explain, but it would create a conventional issuer, banking and eligibility model. The reviewed evidence does not quantify which alternative would have produced more durable demand.',
  risks_and_unknowns: 'DAI can trade away from one dollar. Fast collateral declines, weak auctions, oracle failures, contract bugs or governance mistakes can create losses. USDC and off-chain credit add issuer, custody, freeze and legal exposure. Emergency Shutdown offers a process for claiming a share of settled collateral after system accounting; it is not guaranteed one-dollar cash redemption. A current audited DAI-only split of collateral, LitePSM liquidity and bridged representations was not found, so those values remain unknown.',
  lifecycle: 'DAI is operating and established, but its role has changed. It moved from being Maker’s only dollar token to being the legacy-compatible side of a DAI/USDS system. The executed 2024 conversion path, active 2026 governance and roughly $4.80 billion reported on Aug. 3, 2026 show that it was not discontinued. Its future depends on whether integrations and liquidity remain in DAI or continue moving to USDS.',
  outlook_and_watch: 'Base case: DAI persists where existing integrations and user preference make migration costly, while USDS receives more of Sky’s new distribution and savings activity. Watch DAI-only supply, price deviations, vault debt and collateral, auction performance, LitePSM balances and limits, DAI-to-USDS conversion, USDC concentration and changes to stablecoin rules. Revisit the call if liquidity falls sharply, conversion becomes mandatory or one-way, or a collateral loss leaves unrecovered debt.',
};

const daiSectionEvidence = {
  what_it_is: [
    { id: 'vault-credit', sourceIds: ['dai-vat'], evidenceLocator: 'Vat documentation: sections describing collateralized debt accounting and internally represented Dai balances.' },
    { id: 'shared-modules', sourceIds: ['dai-guides', 'dai-ark-2026'], evidenceLocator: 'Sky guides: LitePSM and USDS guide entries; ARK report: reserve components and LitePSM sections.' },
  ],
  what_happened: [
    { id: 'system-development', sourceIds: ['dai-vat', 'dai-liquidation', 'dai-ark-2026'], evidenceLocator: 'Maker core-accounting and liquidation documentation plus the ARK report sections on collateral evolution and peg-stability modules.' },
    { id: 'upgrade-executed', sourceIds: ['dai-upgrade-poll', 'dai-upgrade-exec'], evidenceLocator: 'Maker poll proposing the one-for-one token upgrade and Blockscout transaction dated 2024-09-17 showing execution.' },
    { id: 'current-supply', sourceIds: ['dai-market'], evidenceLocator: 'DefiLlama stablecoin 5 response checked 2026-08-03: circulating representations, price and chain balances.' },
  ],
  why_this_outcome: [
    { id: 'mechanism', sourceIds: ['dai-vat', 'dai-liquidation', 'dai-guides'], evidenceLocator: 'Maker technical docs for debt and liquidation; Sky guides for current peg modules.' },
    { id: 'durability-inference', sourceIds: ['dai-market', 'dai-current-governance', 'dai-ark-2026'], evidenceLocator: 'Dated supply observation, current executive-vote index and ARK section describing DAI liquidity concentration in DeFi.', supportDirection: 'context_only', note: 'Analytical inference: these observations support continued material operation, not a measured causal attribution.' },
  ],
  strategic_choices: [
    { id: 'collateral-and-psm', sourceIds: ['dai-vat', 'dai-guides', 'dai-ark-2026'], evidenceLocator: 'Vat collateral accounting, LitePSM implementation overview and ARK reserve/peg-stability analysis.' },
    { id: 'coexistence', sourceIds: ['dai-upgrade-poll', 'dai-upgrade-exec'], evidenceLocator: 'Upgrade poll and 2024-09-17 execution transaction for the optional DAI/USDS conversion path.' },
    { id: 'litepsm-change', sourceIds: ['dai-litepsm-proposal', 'dai-litepsm-exec'], evidenceLocator: 'June 18 proposal parameter table and June 22 execution transaction; outcome impact is not asserted.' },
  ],
  operating_model: [
    { id: 'vaults-liquidations', sourceIds: ['dai-vat', 'dai-liquidation'], evidenceLocator: 'Vat debt-ceiling and collateral accounting sections; Dog/Clipper liquidation flow.' },
    { id: 'litepsm-liquidity', sourceIds: ['dai-guides', 'dai-ark-2026'], evidenceLocator: 'Sky LitePSM guide entry and ARK sections “Peg Stability” and “Mint/Redemption Mechanisms.”' },
  ],
  token_and_value_capture: [
    { id: 'borrower-fees', sourceIds: ['dai-vat'], evidenceLocator: 'Vat documentation fields for accumulated stability fees and system debt accounting.' },
    { id: 'separate-products', sourceIds: ['dai-guides', 'dai-ark-2026'], evidenceLocator: 'Sky guide entries and ARK product comparison separating DAI, USDS and savings products.' },
  ],
  counterfactual: [
    { id: 'collateral-tradeoff', sourceIds: ['dai-vat', 'dai-ark-2026'], evidenceLocator: 'Observed collateral architecture used as context for the crypto-only alternative.', supportDirection: 'context_only', note: 'Counterfactual; reviewed sources do not measure the alternative outcome.' },
    { id: 'migration-tradeoff', sourceIds: ['dai-upgrade-poll', 'dai-upgrade-exec'], evidenceLocator: 'Optional upgrade design used as context for the forced-migration alternative.', supportDirection: 'context_only', note: 'Counterfactual; not a claim that governance considered or rejected this exact alternative.' },
  ],
  risks_and_unknowns: [
    { id: 'liquidation-shutdown', sourceIds: ['dai-liquidation', 'dai-shutdown'], evidenceLocator: 'Liquidation documentation and Cage Keeper settlement process.' },
    { id: 'legal-and-collateral-gaps', sourceIds: ['dai-ark-2026', 'dai-mica'], evidenceLocator: 'ARK limitations on token-specific backing and MiCA text for entity- and activity-specific legal review.', supportDirection: 'context_only', note: 'No blanket legal classification is asserted.' },
  ],
  lifecycle: [
    { id: 'coexistence', sourceIds: ['dai-upgrade-exec', 'dai-current-governance'], evidenceLocator: 'Executed 2024 upgrade transaction and current Sky executive-vote index.' },
    { id: 'material-circulation', sourceIds: ['dai-market'], evidenceLocator: 'DefiLlama DAI response checked 2026-08-03.' },
  ],
  outlook_and_watch: [
    { id: 'supply-and-conversion', sourceIds: ['dai-market', 'dai-upgrade-exec'], evidenceLocator: 'Current DAI supply observation and executed conversion path define measurable watch signals.', supportDirection: 'context_only', note: 'Scenario analysis, not a price forecast.' },
    { id: 'module-risk', sourceIds: ['dai-litepsm-proposal', 'dai-litepsm-exec', 'dai-ark-2026'], evidenceLocator: 'LitePSM proposal, execution and independent module description define liquidity and concentration signals.', supportDirection: 'context_only', note: 'Scenario analysis; no future outcome is claimed.' },
  ],
};

const daiMetrics = [
  metric('dai', 'circulating-supply:2026-08-03', 'circulating_supply', 'Reported circulating DAI representations', 4795469810.824513, 'usd', CHECKED_AT, 'DefiLlama stablecoin observation checked Aug. 3, 2026', { product: 'DAI', chains: [] }, ['dai-market'], ['aggregator-chain-representations', 'not-dai-usds-combined']),
  metric('dai', 'price:2026-08-03', 'price', 'DAI price', 0.9997787144200703, 'usd', CHECKED_AT, 'DefiLlama price observation checked Aug. 3, 2026', { product: 'DAI', chains: [] }, ['dai-market']),
  metric('dai', 'peg-deviation:2026-08-03', 'peg_deviation', 'DAI deviation from one dollar', -0.02212855799297, 'percent', CHECKED_AT, 'Derived from the DefiLlama price observation', { product: 'DAI', chains: [] }, ['dai-market'], ['derived']),
];

const daiEvents = [
  event('dai', 'usds-upgrade:2024-09-17', 'token_upgrade', '2024-09-17', 'A governance transaction initialized USDS and the one-for-one DAI/USDS conversion path.', ['dai-upgrade-poll', 'dai-upgrade-exec']),
  event('dai', 'litepsm-capacity:2026-06-22', 'governance_parameter_change', '2026-06-22', 'A governance transaction executed the proposed LitePSM parameter changes.', ['dai-litepsm-proposal', 'dai-litepsm-exec']),
];

const heliumSources = [
  source('hnt-docs', 'The Helium Network Token', 'https://docs.helium.com/tokens/hnt-token/', 'Helium Documentation'),
  source('dc-docs', 'Data Credit', 'https://docs.helium.com/tokens/data-credit/', 'Helium Documentation'),
  source('mobile-docs', 'The Mobile Network', 'https://docs.helium.com/mobile/5g-on-helium/', 'Helium Documentation'),
  source('solana-migration', 'Legacy blockchain data', 'https://docs.helium.com/network-data/legacy-blockchain-data/', 'Helium Documentation'),
  source('hip138', 'HIP 138: Return to HNT', 'https://github.com/helium/HIP/blob/main/0138-return-to-hnt.md', 'Helium Improvement Proposals', 'primary', 'A', '2024-11-08'),
  source('hip138-track', 'HIP 138 tracking issue', 'https://github.com/helium/HIP/issues/1120', 'Helium Improvement Proposals', 'primary', 'A', '2024-11-08'),
  source('carrier-offload', 'Helium Mobile Carrier Offload Program FAQ', 'https://hardware.hellohelium.com/en/articles/9903527-helium-mobile-carrier-offload-program-faq', 'Helium Mobile', 'primary', 'B', '2026-02-25'),
  source('rewardable-data', 'What is Rewardable Data?', 'https://hardware.hellohelium.com/en/articles/13172155-what-is-rewardable-data', 'Helium Mobile', 'primary', 'B', '2026-02-27'),
  source('telefonica', 'Telefónica and Nova Labs launch Helium Mobile Hotspots in Mexico', 'https://www.telefonica.com/en/communication-room/press-room/telefonica-and-nova-labs-launch-helium-mobile-hotspots-in-mexico/', 'Telefónica', 'primary', 'A', '2024-01-24'),
  source('hnt-market', 'Helium market API', 'https://api.coingecko.com/api/v3/coins/helium', 'CoinGecko', 'aggregator', 'B'),
  source('hnt-q1-2026', 'Helium Network Q1 2026 report', 'https://blockworks.com/api/investor-report/investor-relations-report-q1-2026/pdf', 'Blockworks Research', 'independent', 'B'),
];

const heliumSections = {
  what_it_is: 'Helium is a community-built wireless network with two products: low-bandwidth LoRaWAN service for connected devices and Wi-Fi carrier offload for mobile subscribers. Local operators provide radios, sites, power and internet access. Network customers use fixed-dollar Data Credits. Reward language is not fully consistent: protocol documents say network participants receive HNT after HIP 138, while a Feb. 25, 2026 carrier FAQ still says some hotspot owners may earn MOBILE. This report treats the denomination as a documentation conflict that needs verification.',
  what_happened: 'Helium began as a LoRaWAN network with its own blockchain, added mobile coverage, and moved protocol execution to Solana on April 18, 2023. HIP 138 later ended new MOBILE and IOT reward emissions and returned protocol rewards to HNT, while legacy tokens, treasuries and governance remained. Blockworks reported 8,281.1 terabytes of carrier-offload traffic and $3.56 million of carrier-offload Data Credit burn in the first quarter of 2026. CoinGecko observed HNT at about $0.18 and a $33.2 million market value on Aug. 3, 2026. Token price does not measure network use.',
  why_this_outcome: 'Helium has moved beyond a coverage-only experiment because the network recorded substantial carrier-offload traffic in the first quarter of 2026. Its operator model can place radios without a carrier owning every site, and Data Credits give customers a fixed-dollar unit for network fees. Those features explain how the system works; they do not prove that it is cheaper than every conventional deployment or that demand will persist. The current evidence supports an operating network with real usage and unresolved economic questions.',
  strategic_choices: 'Helium chose community-owned hardware, token incentives and fixed-dollar Data Credits. It then moved execution from its own chain to Solana, exchanging control of the base layer for dependence on Solana programs and infrastructure. HIP 138 reversed the separate MOBILE/IOT reward design after the proposal identified complexity and treasury imbalances. Carrier offload adds quality and verified-traffic rules instead of paying every hotspot equally. The reviewed sources describe these choices; they do not isolate how much each choice changed demand or cost.',
  operating_model: 'Hotspot operators buy hardware, secure a location, supply power and internet backhaul, and follow network quality rules. IoT users pay Data Credits in 24-byte increments. Mobile carriers use Passpoint to authorize subscriber offload, and qualifying traffic can earn operator rewards. One Data Credit is priced at $0.00001 and is created by burning HNT. Protocol documents point to HNT rewards after HIP 138, but the current carrier FAQ still references MOBILE; operators should verify the program’s actual payout asset before relying on either page.',
  token_and_value_capture: 'HNT is burned to create Data Credits and is emitted under a schedule to reward network participation. Gross Data Credit burn includes more than paid traffic, so it should not automatically be called cash revenue. Blockworks values first-quarter carrier-offload burn at the protocol’s $0.50-per-gigabyte accounting rate and warns that contracted carrier rates can be lower. Scheduled net emissions can replace about 1,644 HNT per day of burns, and the annual schedule beginning Aug. 1, 2026 is 7.5 million HNT. Usage, cash receipts, token burns, emissions and market price are different measures.',
  counterfactual: 'Keeping a proprietary blockchain would preserve more control but require continued consensus and tooling work. Keeping separate MOBILE and IOT emissions could retain subnetwork-specific incentives while preserving the complexity and treasury imbalance described in HIP 138. Paying only for traffic would align rewards more tightly with demand but could leave new areas uncovered before customers arrive. The reviewed sources do not establish which alternative would produce more durable coverage or better operator returns.',
  risks_and_unknowns: 'The main risk is that operator rewards and hardware costs outrun recurring customer demand. Carrier contracts can change, traffic may be concentrated, poor locations may earn little, and a lower HNT price can weaken operator payback. First-quarter Data Credit burn is protocol accounting, not audited cash receipts. Current public sources do not disclose all carrier names, contract rates, unique traffic-carrying radios or operator churn. The conflict between current MOBILE wording and HIP 138’s HNT design is another unresolved operational risk.',
  lifecycle: 'Helium is operating after two major design changes: the 2023 Solana migration and the 2025 deployment of HIP 138. Telefónica and Nova Labs announced a Mexico trial in 2024; that is a commercial partner statement about one trial, not independent proof of broad carrier adoption. More recent Blockworks data shows material carrier-offload traffic in the first quarter of 2026. The network has evidence of use, but its long-term outcome still depends on repeat traffic and subsidy-adjusted operator economics.',
  outlook_and_watch: 'Base case: carrier offload remains the largest observed source of Helium Mobile usage while LoRaWAN serves a narrower device market. The first-quarter 2026 data supports that dated statement, not a permanent growth forecast. Watch carrier-offload terabytes, traffic-only Data Credit burn, contracted rates, named-carrier concentration, active traffic-carrying radios, IoT packets, HNT emissions, MOBILE/IOT treasury conversions and operator churn. Revisit the call if repeat traffic weakens, rewards materially exceed demand, or documentation and payouts remain inconsistent.',
};

const heliumSectionEvidence = {
  what_it_is: [
    { id: 'network-products', sourceIds: ['mobile-docs', 'dc-docs'], evidenceLocator: 'Helium documentation sections describing the Mobile network and fixed-dollar Data Credits.' },
    { id: 'reward-conflict', sourceIds: ['hip138', 'carrier-offload'], evidenceLocator: 'HIP 138 summary and reward-payout sections compared with FAQ lines “Key Benefits for Hotspot Owners” and “MOBILE rewards.”', note: 'The sources conflict; this claim reports the conflict instead of selecting one page as current truth.' },
  ],
  what_happened: [
    { id: 'architecture-changes', sourceIds: ['solana-migration', 'hip138', 'hip138-track'], evidenceLocator: 'Legacy-data migration page, HIP 138 implementation text and deployed tracking issue.' },
    { id: 'usage-and-market', sourceIds: ['hnt-q1-2026', 'hnt-market'], evidenceLocator: 'Blockworks Q1 2026 traffic and Data Credit burn tables; CoinGecko response checked Aug. 3, 2026.' },
  ],
  why_this_outcome: [
    { id: 'observed-usage', sourceIds: ['hnt-q1-2026'], evidenceLocator: 'Q1 2026 Mobile Offload KPI table: carrier-offload transfer and Data Credit burn.' },
    { id: 'mechanism-inference', sourceIds: ['dc-docs', 'carrier-offload'], evidenceLocator: 'Data Credit mechanics and carrier-offload program description.', supportDirection: 'context_only', note: 'Mechanism-level inference; no universal cost advantage or causal weight is asserted.' },
  ],
  strategic_choices: [
    { id: 'operator-and-data-credit-model', sourceIds: ['mobile-docs', 'dc-docs'], evidenceLocator: 'Helium Mobile network overview and Data Credit price/burn documentation.' },
    { id: 'solana-dependency', sourceIds: ['solana-migration'], evidenceLocator: 'Helium legacy-blockchain page documenting the April 2023 Solana migration.' },
    { id: 'token-reversal', sourceIds: ['hip138', 'hip138-track'], evidenceLocator: 'HIP 138 summary, value-imbalance and implementation sections plus deployed tracker.' },
    { id: 'traffic-quality', sourceIds: ['rewardable-data', 'carrier-offload'], evidenceLocator: 'Rewardable Data eligibility and carrier program rules.' },
  ],
  operating_model: [
    { id: 'operator-and-carrier-flow', sourceIds: ['mobile-docs', 'carrier-offload'], evidenceLocator: 'Mobile network overview and carrier FAQ Passpoint/operator sections.' },
    { id: 'data-credit-rates', sourceIds: ['dc-docs'], evidenceLocator: 'Data Credit price and network-fee schedule.' },
    { id: 'reward-conflict', sourceIds: ['hip138', 'carrier-offload'], evidenceLocator: 'HIP 138 direct-HNT payout language versus February 2026 FAQ MOBILE language.', note: 'Current operator documentation conflict; payout denomination is withheld.' },
  ],
  token_and_value_capture: [
    { id: 'burn-and-emissions', sourceIds: ['hnt-docs', 'dc-docs', 'hip138'], evidenceLocator: 'HNT burn, net-emission schedule and HIP 138 reward sections.' },
    { id: 'dc-burn-not-cash', sourceIds: ['hnt-q1-2026'], evidenceLocator: 'Blockworks Q1 2026 methodology note that protocol valuation uses $0.50/GB while contracted carrier rates can be lower.' },
  ],
  counterfactual: [
    { id: 'chain-alternative', sourceIds: ['solana-migration'], evidenceLocator: 'Documented migration used as context for the proprietary-chain alternative.', supportDirection: 'context_only', note: 'Counterfactual; no measured alternative outcome.' },
    { id: 'reward-alternative', sourceIds: ['hip138'], evidenceLocator: 'HIP 138 alternatives and drawbacks sections.', supportDirection: 'context_only', note: 'Counterfactual; outcomes are not quantitatively estimated.' },
  ],
  risks_and_unknowns: [
    { id: 'economics-gap', sourceIds: ['hnt-q1-2026', 'hnt-docs'], evidenceLocator: 'Q1 2026 income-statement methodology and HNT emissions schedule.' },
    { id: 'carrier-and-reward-gaps', sourceIds: ['carrier-offload', 'rewardable-data', 'hip138'], evidenceLocator: 'FAQ confidentiality disclaimer, reward eligibility rules and HIP 138 reward design.' },
  ],
  lifecycle: [
    { id: 'design-corrections', sourceIds: ['solana-migration', 'hip138-track'], evidenceLocator: 'Dated Solana migration record and deployed HIP 138 tracker.' },
    { id: 'commercial-and-usage-evidence', sourceIds: ['telefonica', 'hnt-q1-2026'], evidenceLocator: 'Telefónica/Nova Labs trial announcement and independent Q1 2026 usage report.' },
  ],
  outlook_and_watch: [
    { id: 'dated-demand-base', sourceIds: ['hnt-q1-2026'], evidenceLocator: 'Q1 2026 carrier-offload transfer, burn and daily-user observations.', supportDirection: 'context_only', note: 'Scenario baseline; not an evergreen growth claim.' },
    { id: 'economic-signals', sourceIds: ['dc-docs', 'hnt-docs', 'carrier-offload'], evidenceLocator: 'Data Credit, emissions and carrier-program mechanics define the watch signals.', supportDirection: 'context_only', note: 'Scenario analysis, not a token price forecast.' },
  ],
};

const q1Window = { start: '2026-01-01', end: '2026-03-31', definition: 'calendar_quarter' };
const heliumMetrics = [
  metric('helium', 'hnt-price:2026-08-03', 'price', 'HNT price', 0.183, 'usd', '2026-08-03T17:26:30.797Z', 'CoinGecko market snapshot checked Aug. 3, 2026', { product: 'HNT', chains: ['Solana'] }, ['hnt-market']),
  metric('helium', 'hnt-market-cap:2026-08-03', 'market_cap', 'HNT market capitalization', 33228293, 'usd', '2026-08-03T17:26:30.797Z', 'CoinGecko market snapshot checked Aug. 3, 2026', { product: 'HNT', chains: ['Solana'] }, ['hnt-market']),
  metric('helium', 'annual-emissions:2026-08-01', 'token_emissions', 'Scheduled annual HNT emissions', 7500000, 'hnt', '2026-08-01', 'Helium emissions schedule', { product: 'HNT', chains: ['Solana'] }, ['hnt-docs'], ['scheduled-not-realized']),
  metric('helium', 'carrier-offload-dc-burn:q1-2026', 'fees', 'Carrier-offload Data Credit burn', 3560000, 'usd', '2026-03-31', 'Blockworks Q1 2026 protocol-accounting value; contracted carrier cash rates can be lower', { product: 'Helium Mobile', chains: ['Solana'] }, ['hnt-q1-2026'], ['protocol-dc-burn-not-cash-receipts', 'blockworks-methodology'], q1Window),
  metric('helium', 'carrier-offload-transfer:q1-2026', 'utilization', 'Carrier-offload data transferred', 8281.1, 'terabytes', '2026-03-31', 'Blockworks Q1 2026 carrier-offload transfer total', { product: 'Helium Mobile', chains: ['Solana'] }, ['hnt-q1-2026'], ['independent-reporting'], q1Window),
];

const heliumEvents = [
  event('helium', 'solana-migration:2023-04-18', 'chain_migration', '2023-04-18', 'Helium completed migration from its purpose-built blockchain to Solana.', ['solana-migration']),
  event('helium', 'telefonica-trial:2024-01-24', 'commercial_trial', '2024-01-24', 'Telefónica and Nova Labs announced a Helium Mobile hotspot trial in Mexico.', ['telefonica']),
  event('helium', 'hip138-deployed:2025-02-24', 'tokenomics_change', '2025-02-24', 'The HIP 138 tracker was labeled deployed after votes to return network rewards to HNT.', ['hip138', 'hip138-track']),
];

const daiSpec = {
  slug: 'dai',
  classification: {
    subtype: 'crypto-collateralized',
    tags: ['usd-denominated', 'overcollateralized', 'multi-collateral', 'dai-usds-coexistence'],
    chains: ['Ethereum'],
    jurisdictions: [],
  },
  sections: daiSections,
  sectionEvidence: daiSectionEvidence,
  metrics: daiMetrics,
  events: daiEvents,
  status: {
    sourceIds: ['dai-current-governance', 'dai-market'],
    evidenceLocator: 'Current executive-vote index and DefiLlama DAI observation checked Aug. 3, 2026.',
  },
  outcome: {
    label: 'operating_established',
    confidence: 'medium',
    sourceIds: ['dai-market', 'dai-upgrade-exec', 'dai-current-governance'],
    evidenceLocator: 'Material DAI circulation, executed DAI/USDS conversion and current governance activity as of Aug. 3, 2026.',
    note: 'Established describes continued material operation, not a legal, investment or decentralization judgment.',
  },
  methodology: [
    'DAI and USDS are separate products. Sky-wide totals are not reported as DAI-only.',
    'LitePSM liquidity is not described as a universal bank redemption right.',
    'Collateral exposure, conversion liquidity and bridged supply require contract-level reconciliation.',
  ],
  structured: {
    strategic_choices: [
      { decision: 'Keep DAI live while adding a one-for-one USDS conversion path.', consequence: 'Preserved compatibility and user choice while splitting branding and liquidity.' },
      { decision: 'Use stablecoin peg modules.', consequence: 'Added a direct route to dollar liquidity while increasing issuer, freeze and governance exposure.' },
    ],
    unknowns: [
      { question: 'What is the current DAI-only collateral and LitePSM exposure after separating USDS?', resolution_trigger: 'A dated contract-level debt, collateral and module reconciliation.' },
      { question: 'How quickly is DAI liquidity moving to USDS?', resolution_trigger: 'Converter flows and venue liquidity tracked separately by token.' },
    ],
  },
};

const heliumSpec = {
  slug: 'helium',
  classification: {
    subtype: 'depin-wireless',
    tags: ['lorawan', 'carrier-offload', 'wifi', 'burn-and-mint'],
    chains: ['Solana'],
    jurisdictions: ['United States', 'Mexico'],
  },
  sections: heliumSections,
  sectionEvidence: heliumSectionEvidence,
  metrics: heliumMetrics,
  events: heliumEvents,
  status: {
    sourceIds: ['mobile-docs', 'dc-docs', 'hnt-q1-2026'],
    evidenceLocator: 'Current product documentation and independently reported Q1 2026 usage.',
  },
  outcome: {
    label: 'operating_mixed',
    confidence: 'medium',
    sourceIds: ['hnt-q1-2026', 'hip138-track', 'carrier-offload'],
    evidenceLocator: 'Q1 2026 carrier-offload usage, deployed HIP 138 tracker and current carrier-program documentation.',
    note: 'Mixed reflects verified usage alongside unresolved reward, contract and operator-economics gaps.',
  },
  methodology: [
    'Installed hotspots, traffic, Data Credit burns, cash receipts, emissions and token price are separate signals.',
    'Blockworks values Data Credit burn at protocol rates; it warns contracted carrier rates can be lower.',
    'HIP 138 and a current carrier FAQ conflict on HNT versus MOBILE reward wording; the report does not hide that conflict.',
  ],
  structured: {
    strategic_choices: [
      { decision: 'Move protocol execution to Solana.', consequence: 'Removed a proprietary base layer while adding Solana program and infrastructure dependency.' },
      { decision: 'End new subnetwork-token reward emissions and return rewards to HNT.', consequence: 'Simplified the token system while leaving legacy tokens, treasuries and governance in place.' },
    ],
    unknowns: [
      { question: 'How much current Data Credit spend is repeat carrier and IoT traffic rather than onboarding?', resolution_trigger: 'Reconciled burn categories, payer cohorts and contracted cash rates.' },
      { question: 'Are operator rewards sustainable?', resolution_trigger: 'Traffic receipts, rewards, hardware cost and churn by hotspot cohort.' },
      { question: 'Which asset do current carrier-offload participants actually receive?', resolution_trigger: 'Reconciled protocol payout data and corrected operator documentation.' },
    ],
  },
};

export const document = {
  schema: 'chaindump-dai-helium-gold-v1',
  as_of: AS_OF,
  generated_migration: MIGRATION,
  cases: [
    {
      table: 'stablecoin_meta',
      slug: 'dai',
      name: 'Dai',
      symbol: 'DAI',
      category: null,
      status: null,
      profile: {
        editorial_guardrails: 'Keep DAI separate from USDS. Do not call LitePSM liquidity a universal cash redemption right or call combined Sky figures DAI-only.',
        current_observation: {
          observed_at: CHECKED_AT,
          circulating_supply_usd: 4795469810.824513,
          price_usd: 0.9997787144200703,
          reported_chain_count: 49,
          source_refs: ['dai-market'],
        },
        canonical_profile: buildProfile(daiSpec),
      },
      sources: daiSources,
    },
    {
      table: 'rwa_depin',
      slug: 'helium',
      name: 'Helium',
      symbol: null,
      category: 'depin-wireless',
      status: 'operating',
      profile: {
        what_it_does: 'Community-built LoRaWAN connectivity and Wi-Fi carrier offload, paid through Data Credits.',
        how_it_works: 'Local operators provide radios and backhaul; IoT users and mobile carriers pay fixed-dollar Data Credit rates for qualifying traffic.',
        traction: 'Operating after its Solana migration and HIP 138. Blockworks reported 8,281.1 terabytes of carrier-offload traffic in the first quarter of 2026.',
        business_model: 'HNT burns create Data Credits for network fees while scheduled HNT emissions reward network participation. Burns, contracted receipts, emissions and token value are separate measurements.',
        outlook: 'Base case: carrier offload remains the largest observed Mobile use. Watch repeat traffic, contracted rates, carrier concentration, emissions and operator churn.',
        editorial_guardrails: 'Keep traffic, Data Credit burns, cash receipts, emissions and token price separate. Disclose the current HNT/MOBILE reward-documentation conflict.',
        current_observation: {
          observed_at: '2026-08-03T17:26:30.797Z',
          hnt_price_usd: 0.183,
          hnt_market_cap_usd: 33228293,
          hnt_circulating_supply: 181567316.0647457,
          source_refs: ['hnt-market'],
        },
        canonical_profile: buildProfile(heliumSpec),
      },
      sources: heliumSources,
    },
  ],
};

function updateStatement(tableName, assignments) {
  return `UPDATE ${tableName} AS row\nSET\n  ${assignments},\n  profile = CASE\n    WHEN json_type(COALESCE(row.profile, '{}'), '$.legacy_preservation.previous_profile') IS NULL THEN\n      json_set(\n        json_remove(json_patch(COALESCE(row.profile, '{}'), json(s.profile)), '$.sources'),\n        '$.legacy_preservation.previous_profile', json(COALESCE(row.profile, '{}')),\n        '$.legacy_preservation.previous_sources', json(COALESCE(row.sources, '[]')),\n        '$.legacy_preservation.preserved_at', '${AS_OF}'\n      )\n    ELSE json_remove(json_patch(COALESCE(row.profile, '{}'), json(s.profile)), '$.sources')\n  END,\n  sources = s.sources,\n  updated_at = '${AS_OF}'\nFROM _dai_helium_gold_0076 s\nWHERE s.table_name = '${tableName}' AND lower(row.slug) = s.slug;`;
}

export function renderMigration(value = document) {
  const payload = JSON.stringify(value, null, 2).replaceAll("'", "''");
  return `-- DAI and Helium normalized profiles, researched 2026-08-03; all claims await human review.\n-- Existing profile fields remain in place; the exact prior profile and source list are stored once under legacy_preservation.\nDROP TABLE IF EXISTS _dai_helium_gold_0076;\nCREATE TABLE _dai_helium_gold_0076 (\n  table_name TEXT,\n  slug TEXT,\n  profile TEXT CHECK(json_valid(profile)),\n  sources TEXT CHECK(json_valid(sources)),\n  name TEXT,\n  symbol TEXT,\n  category TEXT,\n  status TEXT,\n  PRIMARY KEY(table_name, slug)\n);\nWITH research_document(payload) AS (VALUES ('${payload}'))\nINSERT INTO _dai_helium_gold_0076\nSELECT\n  json_extract(j.value, '$.table'),\n  json_extract(j.value, '$.slug'),\n  json_extract(j.value, '$.profile'),\n  json_extract(j.value, '$.sources'),\n  json_extract(j.value, '$.name'),\n  json_extract(j.value, '$.symbol'),\n  json_extract(j.value, '$.category'),\n  json_extract(j.value, '$.status')\nFROM research_document, json_each(json_extract(payload, '$.cases')) j;\n${updateStatement('stablecoin_meta', 'name = s.name,\n  symbol = s.symbol')}\n${updateStatement('rwa_depin', 'name = s.name,\n  category = s.category,\n  status = s.status')}\nDROP TABLE _dai_helium_gold_0076;\n`;
}

function writeOutputs() {
  writeFileSync(
    fileURLToPath(new URL('../docs/dai-helium-gold-2026-08-03.json', import.meta.url)),
    `${JSON.stringify(document, null, 2)}\n`,
  );
  writeFileSync(
    fileURLToPath(new URL(`../migrations/${MIGRATION}`, import.meta.url)),
    renderMigration(),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) writeOutputs();

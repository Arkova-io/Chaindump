import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const AS_OF = '2026-08-03';
const CHECKED_AT = '2026-08-03T17:26:35Z';
const NEXT_REVIEW_AT = '2026-08-10';
const MIGRATION = '0079_helium_q2_citation_integrity.sql';
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

function pendingClaim(slug, id, fieldPath, assertion, sourceIds, evidenceLocator, options = {}) {
  return {
    id: `claim:${slug}:${id}`,
    field_path: fieldPath,
    assertion,
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
      spec.status.assertion,
      spec.status.sourceIds,
      spec.status.evidenceLocator,
    ),
    pendingClaim(
      spec.slug,
      'outcome',
      'outcome.label',
      spec.outcome.assertion,
      spec.outcome.sourceIds,
      spec.outcome.evidenceLocator,
      { note: spec.outcome.note },
    ),
  ];
  const sectionClaimIds = {};
  const atomicAssertions = {};
  for (const sectionKey of SECTION_KEYS) {
    sectionClaimIds[sectionKey] = [];
    atomicAssertions[sectionKey] = {};
    for (const item of spec.sectionEvidence[sectionKey]) {
      const id = `${sectionKey}:${item.id}`;
      sectionClaimIds[sectionKey].push(`claim:${spec.slug}:${id}`);
      atomicAssertions[sectionKey][item.id] = item.assertion;
      claims.push(pendingClaim(
        spec.slug,
        id,
        `extensions.atomic_assertions.${sectionKey}.${item.id}`,
        item.assertion,
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
      `${item.label} was ${item.value} ${item.unit} as of ${item.as_of}.`,
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
      item.description,
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
      note: spec.outcome.note,
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
      atomic_assertions: atomicAssertions,
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
    { id: 'vault-credit', assertion: 'Borrowers can create DAI by locking approved collateral in Maker/Sky vaults.', sourceIds: ['dai-vat'], evidenceLocator: 'Vat documentation: collateral accounting and Dai debt sections.' },
    { id: 'shared-modules', assertion: 'Some DAI peg liquidity is routed through governance-controlled LitePSM modules that involve USDS and USDC.', sourceIds: ['dai-guides', 'dai-ark-2026'], evidenceLocator: 'LitePSM repository overview and ARK sections describing DAI/USDS peg modules.' },
  ],
  what_happened: [
    { id: 'system-development', assertion: 'Maker expanded DAI from a single-collateral design into a multi-collateral credit system with governed liquidation and peg tools.', sourceIds: ['dai-vat', 'dai-liquidation', 'dai-ark-2026'], evidenceLocator: 'Maker core-accounting and liquidation documentation, corroborated by the ARK collateral-history section.' },
    { id: 'upgrade-executed', assertion: 'A governance transaction executed on Sept. 17, 2024 initialized USDS and a one-for-one DAI/USDS conversion path.', sourceIds: ['dai-upgrade-poll', 'dai-upgrade-exec'], evidenceLocator: 'Maker launch poll and successful Blockscout transaction 0x2221…97c dated 2024-09-17.' },
    { id: 'current-supply', assertion: 'DefiLlama reported $4.80 billion of DAI representations across 49 chains on Aug. 3, 2026.', sourceIds: ['dai-market'], evidenceLocator: 'DefiLlama stablecoin id 5 response: currentCirculating, price and chainCirculating fields checked 2026-08-03.' },
  ],
  why_this_outcome: [
    { id: 'mechanism', assertion: 'Vault debt, liquidations and peg modules are the documented mechanisms that issue DAI and manage its dollar target.', sourceIds: ['dai-vat', 'dai-liquidation', 'dai-guides'], evidenceLocator: 'Vat debt accounting, Dog/Clipper liquidation flow and LitePSM implementation overview.' },
    { id: 'durability-inference', assertion: 'Material dated circulation and active governance support a continued-operation call, but do not isolate the cause of DAI adoption.', sourceIds: ['dai-market', 'dai-current-governance', 'dai-ark-2026'], evidenceLocator: 'Aug. 3 supply snapshot, current executive-vote index and ARK discussion of DAI liquidity.', supportDirection: 'context_only', note: 'Analytical inference; no measured causal attribution.' },
  ],
  strategic_choices: [
    { id: 'pooled-collateral', assertion: 'Maker chose pooled, governance-managed collateral instead of a single corporate dollar reserve.', sourceIds: ['dai-vat', 'dai-ark-2026'], evidenceLocator: 'Vat collateral-ledger design and ARK reserve composition section.' },
    { id: 'stablecoin-psm', assertion: 'Maker added stablecoin peg modules, accepting issuer and freeze exposure in exchange for a direct liquidity route.', sourceIds: ['dai-guides', 'dai-ark-2026'], evidenceLocator: 'LitePSM repository mechanism and ARK peg-stability analysis.' },
    { id: 'coexistence', assertion: 'The Sky transition kept DAI live beside USDS through an optional one-for-one conversion path.', sourceIds: ['dai-upgrade-poll', 'dai-upgrade-exec'], evidenceLocator: 'DAI-to-USDS launch poll and successful 2024-09-17 converter execution transaction.' },
    { id: 'litepsm-change', assertion: 'A June 22, 2026 governance execution applied a proposal to raise the LitePSM buffer and gap from 400 million to 800 million DAI.', sourceIds: ['dai-litepsm-proposal', 'dai-litepsm-exec'], evidenceLocator: 'June 18 proposal buf/gap table and successful June 22 execution transaction 0xa2bf…fba6.' },
  ],
  operating_model: [
    { id: 'vault-debt', assertion: 'Governance-set debt ceilings, fees and liquidation ratios constrain how much DAI a vault can draw.', sourceIds: ['dai-vat'], evidenceLocator: 'Vat documentation: Ilk debt ceiling, rate and collateral accounting fields.' },
    { id: 'liquidation-flow', assertion: 'Unsafe vault collateral can be auctioned to cancel outstanding DAI debt.', sourceIds: ['dai-liquidation'], evidenceLocator: 'Dog and Clipper documentation: bark, kick and collateral auction sequence.' },
    { id: 'litepsm-liquidity', assertion: 'LitePSM swap capacity is governed and can be capped, paused or depleted; it is not a universal bank redemption right.', sourceIds: ['dai-guides', 'dai-ark-2026'], evidenceLocator: 'LitePSM repository limits and ARK “Mint/Redemption Mechanisms” discussion.' },
  ],
  token_and_value_capture: [
    { id: 'borrower-fees', assertion: 'DAI borrowers accrue governance-set stability fees in protocol debt accounting.', sourceIds: ['dai-vat'], evidenceLocator: 'Vat documentation: rate accumulator and normalized debt fields.' },
    { id: 'debt-not-equity', assertion: 'Holding DAI does not create an ownership claim on Maker/Sky.', sourceIds: ['dai-vat', 'dai-ark-2026'], evidenceLocator: 'Vat debt-token mechanics and ARK product-structure comparison.' },
    { id: 'separate-products', assertion: 'USDS savings rewards are separate from the rights of a DAI holder.', sourceIds: ['dai-guides', 'dai-ark-2026'], evidenceLocator: 'Sky product guide entries and ARK DAI/USDS savings-product comparison.' },
  ],
  counterfactual: [
    { id: 'collateral-tradeoff', assertion: 'A crypto-only collateral policy would reduce stablecoin-issuer exposure but its effect on supply and peg stability is not measured here.', sourceIds: ['dai-vat', 'dai-ark-2026'], evidenceLocator: 'Current collateral architecture used only as context for the crypto-only alternative.', supportDirection: 'context_only', note: 'Counterfactual; the alternative outcome is unmeasured.' },
    { id: 'migration-tradeoff', assertion: 'A forced move from DAI to USDS could concentrate liquidity while breaking integrations; that alternative was not measured.', sourceIds: ['dai-upgrade-poll', 'dai-upgrade-exec'], evidenceLocator: 'Optional converter design used only as context for a forced-migration alternative.', supportDirection: 'context_only', note: 'Counterfactual; not a claim that governance evaluated this exact alternative.' },
  ],
  risks_and_unknowns: [
    { id: 'liquidation-risk', assertion: 'Fast collateral declines or failed auctions can leave the DAI system with unrecovered debt.', sourceIds: ['dai-liquidation'], evidenceLocator: 'Dog and Clipper documentation: auction and bad-debt handling sections.' },
    { id: 'shutdown-process', assertion: 'Emergency Shutdown settles claims against system collateral after accounting; it does not guarantee one-dollar cash redemption.', sourceIds: ['dai-shutdown'], evidenceLocator: 'Cage Keeper documentation: cage, thaw, flow and end-user collateral-claim sequence.' },
    { id: 'issuer-exposure', assertion: 'Stablecoin collateral adds issuer, custody and freeze exposure to DAI.', sourceIds: ['dai-ark-2026'], evidenceLocator: 'ARK reserve-composition and centralization-risk discussion for DAI/USDS.' },
    { id: 'collateral-split-unknown', assertion: 'A current audited DAI-only split of collateral and LitePSM liquidity was not found.', sourceIds: ['dai-ark-2026', 'dai-guides'], evidenceLocator: 'ARK describes aggregate DAI/USDS backing while LitePSM documentation defines shared module flows.', supportDirection: 'context_only', note: 'Unknown is explicit; no token-specific collateral total is inferred.' },
    { id: 'legal-boundary', assertion: 'This report does not assign DAI a blanket legal classification across jurisdictions.', sourceIds: ['dai-mica'], evidenceLocator: 'MiCA regulation used only to show that issuer, token and activity facts require separate legal analysis.', supportDirection: 'context_only', note: 'No legal conclusion is asserted.' },
  ],
  lifecycle: [
    { id: 'coexistence', assertion: 'DAI remained operational after the 2024 DAI/USDS converter execution.', sourceIds: ['dai-upgrade-exec', 'dai-current-governance'], evidenceLocator: 'Successful converter transaction plus current Sky executive-vote index.' },
    { id: 'material-circulation', assertion: 'DefiLlama still reported material DAI circulation on Aug. 3, 2026.', sourceIds: ['dai-market'], evidenceLocator: 'DefiLlama stablecoin id 5 currentCirculating field checked 2026-08-03.' },
  ],
  outlook_and_watch: [
    { id: 'supply-and-conversion', assertion: 'DAI-only supply and DAI-to-USDS conversion flows are the primary lifecycle watch signals.', sourceIds: ['dai-market', 'dai-upgrade-exec'], evidenceLocator: 'Current DAI supply field and the executed converter contract define the two dated measures.', supportDirection: 'context_only', note: 'Scenario analysis, not a price forecast.' },
    { id: 'module-risk', assertion: 'LitePSM balances, limits and stablecoin concentration should be monitored separately from headline DAI supply.', sourceIds: ['dai-litepsm-proposal', 'dai-litepsm-exec', 'dai-ark-2026'], evidenceLocator: 'June LitePSM parameter change and ARK module-concentration discussion define these watch fields.', supportDirection: 'context_only', note: 'Scenario analysis; no future outcome is claimed.' },
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
  source('hnt-q1-2026', 'Nova Labs-funded Helium Tokenholder Report — Q1 2026', 'https://blockworks.com/api/investor-report/investor-relations-report-q1-2026/pdf', 'Blockworks Advisory', 'primary', 'B'),
  source('hnt-q2-2026', 'Nova Labs-funded Helium Tokenholder Report — Q2 2026', 'https://blockworks.com/api/investor-report/helium-token-holder-report-q2-2026/pdf', 'Blockworks Advisory', 'primary', 'B', '2026-07-21'),
  source('helium-imc21', 'Federated Infrastructure: Usage, Patterns, and Insights from The People’s Network', 'https://cseweb.ucsd.edu/~schulman/docs/imc21-helium.pdf', 'ACM Internet Measurement Conference researchers', 'independent', 'A', '2021-11-02'),
];

const heliumSections = {
  what_it_is: 'Helium is a community-built wireless network with two products: low-bandwidth LoRaWAN service for connected devices and Wi-Fi carrier offload for mobile subscribers. Local operators provide radios, sites, power and internet access. Network customers use fixed-dollar Data Credits. Reward language is not fully consistent: protocol documents say network participants receive HNT after HIP 138, while a Feb. 25, 2026 carrier FAQ still says some hotspot owners may earn MOBILE. This report treats the denomination as a documentation conflict that needs verification.',
  what_happened: 'Helium began as a LoRaWAN network with its own blockchain, added mobile coverage, and moved protocol execution to Solana on April 18, 2023. HIP 138 later ended new MOBILE and IOT reward emissions and returned protocol rewards to HNT, while legacy tokens, treasuries and governance remained. The latest quarterly report available on Aug. 3, 2026 is the Blockworks Advisory Q2 report funded by Nova Labs. It reports 9,851 terabytes of carrier-offload traffic, up 20% from Q1, $3.29 million of carrier-offload Data Credit burn, and $3.35 million of total Data Credit burn. Q1 remains a historical comparison, not the current period. CoinGecko observed HNT at about $0.18 and a $33.2 million market value on Aug. 3, 2026. Token price, traffic and Data Credit burn measure different things.',
  why_this_outcome: 'Helium is operating and the Nova Labs-funded Q2 report describes substantial carrier-offload use, but that report is advisory evidence rather than independent verification. Its operator model can place radios without a carrier owning every site, and Data Credits give customers a fixed-dollar unit for network fees. Independent academic work documents that a user-owned wireless network can be measured through public protocol data, while also showing that deployment and reward patterns require scrutiny. The sources explain how the system can produce coverage and paid traffic; they do not prove that it is cheaper than conventional deployment or that demand will persist. The causal call is therefore low confidence.',
  strategic_choices: 'Helium chose community-owned hardware, token incentives and fixed-dollar Data Credits. It then moved execution from its own chain to Solana, exchanging control of the base layer for dependence on Solana programs and infrastructure. HIP 138 reversed the separate MOBILE/IOT reward design after the proposal identified complexity and treasury imbalances. Carrier offload adds quality and verified-traffic rules instead of paying every hotspot equally. The reviewed sources describe these choices; they do not isolate how much each choice changed demand or cost.',
  operating_model: 'Hotspot operators buy hardware, secure a location, supply power and internet backhaul, and follow network quality rules. IoT users pay Data Credits in 24-byte increments. Mobile carriers use Passpoint to authorize subscriber offload, and qualifying traffic can earn operator rewards. One Data Credit is priced at $0.00001 and is created by burning HNT. Protocol documents point to HNT rewards after HIP 138, but the current carrier FAQ still references MOBILE; operators should verify the program’s actual payout asset before relying on either page.',
  token_and_value_capture: 'HNT is burned to create Data Credits and is emitted under a schedule to reward network participation. Gross Data Credit burn includes more than paid traffic, so it should not automatically be called audited cash revenue. The Nova Labs-funded Q2 report says the carrier payer rate changed on June 4–5 from $0.50 per gigabyte to about $0.10 to match aggregate commercial terms; current Helium documentation now lists $0.10 per gigabyte. The same advisory report attributes $3.29 million of Q2 burn to carrier offload and $3.35 million to total Data Credit burn. Scheduled net emissions can replace about 1,644 HNT per day of burns, and the annual schedule beginning Aug. 1, 2026 is 7.5 million HNT. Usage, contract receipts, Data Credit burns, emissions and market price are separate measurements.',
  counterfactual: 'Keeping a proprietary blockchain would preserve more control but require continued consensus and tooling work. Keeping separate MOBILE and IOT emissions could retain subnetwork-specific incentives while preserving the complexity and treasury imbalance described in HIP 138. Paying only for traffic would align rewards more tightly with demand but could leave new areas uncovered before customers arrive. The reviewed sources do not establish which alternative would produce more durable coverage or better operator returns.',
  risks_and_unknowns: 'The main risk is that operator rewards and hardware costs outrun recurring customer demand. Carrier contracts can change, poor locations may earn little, and a lower HNT price can weaken operator payback. The Nova Labs-funded Q2 report says three paying entities used the network and two carriers accounted for essentially all offload volume, so customer concentration is material if that advisory count is accurate. Data Credit burn is protocol accounting, not audited contract receipts. Current public sources do not independently reconcile carrier names, contracted cash rates, unique traffic-carrying radios or operator churn. The conflict between current MOBILE wording and HIP 138’s HNT design is another unresolved operational risk.',
  lifecycle: 'Helium is operating after two major design changes: the 2023 Solana migration and the 2025 deployment of HIP 138. Telefónica and Nova Labs announced a Mexico trial in 2024; that is a commercial partner statement about one trial, not independent proof of broad carrier adoption. The latest period is Q2 2026: a Nova Labs-funded Blockworks Advisory report describes 9,851 terabytes of carrier-offload traffic and a June rate reset. Q1 is retained only as dated history. The network has evidence of use, but the current quarterly values still need independent reconciliation and the long-term outcome depends on repeat traffic and subsidy-adjusted operator economics.',
  outlook_and_watch: 'Base case: carrier offload remains the largest reported source of Helium Mobile use while LoRaWAN serves a narrower device market. The Nova Labs-funded Q2 2026 report supports that dated, low-confidence baseline; it is not independent proof or a permanent growth forecast. Watch carrier-offload terabytes, traffic-only Data Credit burn, contracted cash rates, named-carrier concentration, active traffic-carrying radios, IoT packets, HNT emissions, MOBILE/IOT treasury conversions and operator churn. Revisit the call when independent on-chain or carrier records reconcile the Q2 figures, or sooner if repeat traffic weakens, rewards materially exceed demand, or documentation and payouts remain inconsistent.',
};

const heliumSectionEvidence = {
  what_it_is: [
    { id: 'network-products', assertion: 'Helium supports LoRaWAN device connectivity and Wi-Fi carrier offload.', sourceIds: ['mobile-docs', 'dc-docs'], evidenceLocator: 'Helium Mobile overview and Data Credit usage tables for IoT and Mobile.' },
    { id: 'reward-conflict', assertion: 'HIP 138 says protocol rewards returned to HNT, while a Feb. 25, 2026 carrier FAQ still references MOBILE rewards.', sourceIds: ['hip138', 'carrier-offload'], evidenceLocator: 'HIP 138 “Reward Payouts” section compared with carrier FAQ “Key Benefits for Hotspot Owners.”', note: 'The sources conflict; payout denomination remains withheld.' },
  ],
  what_happened: [
    { id: 'solana-migration', assertion: 'Helium completed its migration from a purpose-built blockchain to Solana on April 18, 2023.', sourceIds: ['solana-migration'], evidenceLocator: 'Helium legacy blockchain page: migration completion date.' },
    { id: 'hip138-change', assertion: 'HIP 138 ended new MOBILE and IOT reward emissions and returned protocol reward payouts to HNT.', sourceIds: ['hip138', 'hip138-track'], evidenceLocator: 'HIP 138 summary and reward-payout sections plus deployed tracking issue.' },
    { id: 'q2-transfer', assertion: 'The Nova Labs-funded Q2 report states that carrier-offload transfer reached 9,851 terabytes, 20% above Q1.', sourceIds: ['hnt-q2-2026'], evidenceLocator: 'Q2 report page 13, “Utilization continued to outpace footprint,” first paragraph.' },
    { id: 'q2-carrier-burn', assertion: 'The Nova Labs-funded Q2 report attributes $3.29 million of Data Credit burn to carrier offload.', sourceIds: ['hnt-q2-2026'], evidenceLocator: 'Q2 report page 6, protocol income statement discussion, second paragraph.' },
    { id: 'q2-total-burn', assertion: 'The Nova Labs-funded Q2 report states total Data Credit burn was $3.35 million.', sourceIds: ['hnt-q2-2026'], evidenceLocator: 'Q2 report page 6, protocol income statement discussion, first sentence.' },
    { id: 'hnt-price', assertion: 'CoinGecko observed HNT at about $0.18 on Aug. 3, 2026.', sourceIds: ['hnt-market'], evidenceLocator: 'CoinGecko Helium response market_data.current_price.usd checked 2026-08-03.' },
    { id: 'hnt-market-cap', assertion: 'CoinGecko observed an HNT market capitalization of about $33.2 million on Aug. 3, 2026.', sourceIds: ['hnt-market'], evidenceLocator: 'CoinGecko Helium response market_data.market_cap.usd checked 2026-08-03.' },
    { id: 'measurement-boundary', assertion: 'HNT price, carrier traffic and Data Credit burn are separate measurements.', sourceIds: ['hnt-market', 'dc-docs'], evidenceLocator: 'CoinGecko token-market fields compared with Helium Data Credit usage and billing definitions.', supportDirection: 'context_only', note: 'Measurement boundary; no causal relationship is asserted.' },
  ],
  why_this_outcome: [
    { id: 'reported-q2-usage', assertion: 'The latest issuer-funded advisory report describes substantial Q2 carrier-offload traffic, but is not independent verification.', sourceIds: ['hnt-q2-2026'], evidenceLocator: 'Q2 report cover funding disclosure and page 13 carrier-offload transfer paragraph.', supportDirection: 'context_only', note: 'Issuer-funded advisory observation; causal confidence is low.' },
    { id: 'measurable-network', assertion: 'Independent academic research demonstrated that Helium usage and reward patterns can be studied from public protocol data.', sourceIds: ['helium-imc21'], evidenceLocator: 'IMC 2021 paper methodology and measurement-dataset sections.', supportDirection: 'context_only', note: 'Historical independent corroboration of measurability, not Q2 values.' },
    { id: 'mechanism-inference', assertion: 'Community-deployed radios and fixed-dollar Data Credits explain the operating model but do not prove a durable cost advantage.', sourceIds: ['dc-docs', 'carrier-offload'], evidenceLocator: 'Current Data Credit rates and carrier-offload program mechanics.', supportDirection: 'context_only', note: 'Mechanism inference; no universal cost advantage is asserted.' },
  ],
  strategic_choices: [
    { id: 'operator-model', assertion: 'Helium chose community-owned radio deployment instead of carrier-owned coverage at every site.', sourceIds: ['mobile-docs', 'helium-imc21'], evidenceLocator: 'Helium Mobile operator overview and IMC paper system-model section.' },
    { id: 'fixed-dollar-data-credit', assertion: 'Helium chose fixed-dollar Data Credits for network fees while retaining HNT burn mechanics.', sourceIds: ['dc-docs', 'hnt-docs'], evidenceLocator: 'Data Credit price table and HNT burn-and-mint documentation.' },
    { id: 'solana-dependency', assertion: 'Moving execution to Solana removed Helium consensus operations while adding Solana program and infrastructure dependency.', sourceIds: ['solana-migration'], evidenceLocator: 'Legacy blockchain page: migrated data and post-migration Solana locations.' },
    { id: 'token-reversal', assertion: 'HIP 138 reversed separate MOBILE/IOT emissions after identifying token-system complexity and treasury imbalances.', sourceIds: ['hip138', 'hip138-track'], evidenceLocator: 'HIP 138 summary, “Value Imbalance” and implementation sections plus deployed tracker.' },
    { id: 'traffic-quality', assertion: 'Carrier-offload rewards depend on qualifying traffic and quality rules rather than hotspot presence alone.', sourceIds: ['rewardable-data', 'carrier-offload'], evidenceLocator: 'Rewardable Data eligibility rules and carrier FAQ quality requirements.' },
  ],
  operating_model: [
    { id: 'operator-flow', assertion: 'Hotspot operators provide hardware, location, power and internet backhaul.', sourceIds: ['mobile-docs'], evidenceLocator: 'Helium Mobile network overview: hotspot operator responsibilities.' },
    { id: 'carrier-flow', assertion: 'Mobile carriers can use Passpoint to authorize subscriber offload onto qualifying Helium hotspots.', sourceIds: ['carrier-offload'], evidenceLocator: 'Carrier Offload FAQ: Passpoint integration and subscriber connection sections.' },
    { id: 'data-credit-unit', assertion: 'One Data Credit is fixed at $0.00001 and is created by burning HNT.', sourceIds: ['dc-docs'], evidenceLocator: 'Data Credit Fundamentals: fixed price and HNT-to-DC conversion.' },
    { id: 'mobile-rate', assertion: 'Current Helium documentation lists Mobile data transfer at $0.10 per gigabyte.', sourceIds: ['dc-docs'], evidenceLocator: 'Data Credits and Mobile: Mobile Network rate table.' },
    { id: 'reward-conflict', assertion: 'Current public documents conflict on whether carrier-offload operators receive HNT or MOBILE.', sourceIds: ['hip138', 'carrier-offload'], evidenceLocator: 'HIP 138 direct-HNT payout language versus February 2026 carrier FAQ MOBILE language.', note: 'Payout denomination is withheld.' },
  ],
  token_and_value_capture: [
    { id: 'burn-mechanic', assertion: 'HNT is burned to create non-transferable Data Credits.', sourceIds: ['hnt-docs', 'dc-docs'], evidenceLocator: 'HNT burn-and-mint section and Data Credit acquisition rules.' },
    { id: 'emission-schedule', assertion: 'The scheduled annual HNT issuance beginning Aug. 1, 2026 is 7.5 million HNT.', sourceIds: ['hnt-docs'], evidenceLocator: 'HNT emission schedule row beginning 2026-08-01.' },
    { id: 'payer-rate-reset', assertion: 'The Nova Labs-funded Q2 report says the carrier payer rate changed on June 4–5 from $0.50 to about $0.10 per gigabyte.', sourceIds: ['hnt-q2-2026'], evidenceLocator: 'Q2 report page 7, “The defining financial event was the payer-rate reset,” first paragraph.' },
    { id: 'dc-burn-not-cash', assertion: 'Data Credit burn is protocol accounting and is not presented here as audited carrier cash receipts.', sourceIds: ['hnt-q2-2026', 'dc-docs'], evidenceLocator: 'Q2 report cover funding disclosure and payer-rate discussion compared with Data Credit billing mechanics.', supportDirection: 'context_only', note: 'Customer contracts and cash settlements were not independently reconciled.' },
  ],
  counterfactual: [
    { id: 'chain-alternative', assertion: 'Keeping a proprietary blockchain would preserve base-layer control but require continued consensus and tooling work.', sourceIds: ['solana-migration'], evidenceLocator: 'Documented migration scope used only as context for the proprietary-chain alternative.', supportDirection: 'context_only', note: 'Counterfactual; no measured alternative outcome.' },
    { id: 'reward-alternative', assertion: 'Keeping separate MOBILE and IOT emissions would retain subnetwork-specific rewards and the complexity HIP 138 sought to remove.', sourceIds: ['hip138'], evidenceLocator: 'HIP 138 alternatives, drawbacks and value-imbalance sections.', supportDirection: 'context_only', note: 'Counterfactual; outcomes are not quantitatively estimated.' },
  ],
  risks_and_unknowns: [
    { id: 'economics-gap', assertion: 'Public evidence does not independently reconcile operator rewards and hardware costs against contracted carrier receipts.', sourceIds: ['hnt-q2-2026', 'hnt-docs', 'helium-imc21'], evidenceLocator: 'Q2 funding disclosure and DC-burn accounting, HNT emissions schedule, and independent historical operator-pattern analysis.', supportDirection: 'context_only', note: 'Unknown remains explicit; no profitability claim is made.' },
    { id: 'carrier-concentration', assertion: 'The Nova Labs-funded Q2 report says three entities paid for service and two carriers supplied essentially all offload volume.', sourceIds: ['hnt-q2-2026'], evidenceLocator: 'Q2 report page 12, “Demand anchored by major carriers,” first paragraph.' },
    { id: 'contract-gap', assertion: 'Current public sources do not disclose all carrier names or permit an independent reconciliation of contracted cash rates.', sourceIds: ['carrier-offload', 'hnt-q2-2026'], evidenceLocator: 'Carrier FAQ confidentiality note and Q2 report cover funding disclosure.', supportDirection: 'context_only', note: 'The undisclosed fields are treated as unknown.' },
    { id: 'reward-gap', assertion: 'The HNT/MOBILE payout-documentation conflict remains unresolved.', sourceIds: ['hip138', 'carrier-offload'], evidenceLocator: 'HIP 138 payout asset compared with carrier FAQ reward asset wording.' },
  ],
  lifecycle: [
    { id: 'solana-transition', assertion: 'Helium completed its Solana migration in 2023.', sourceIds: ['solana-migration'], evidenceLocator: 'Legacy blockchain page: April 18, 2023 migration completion.' },
    { id: 'reward-transition', assertion: 'The HIP 138 deployment tracker records the return-to-HNT change as deployed in 2025.', sourceIds: ['hip138-track'], evidenceLocator: 'HIP 138 tracking issue deployment status and dated completion entries.' },
    { id: 'commercial-trial', assertion: 'Telefónica and Nova Labs announced a Mexico carrier-offload trial in 2024.', sourceIds: ['telefonica'], evidenceLocator: 'Telefónica press release title and dated trial description.', note: 'Partner statement; not independent adoption proof.' },
    { id: 'latest-period', assertion: 'Q2 2026 is the latest available quarterly operating period; Q1 is retained only as historical comparison.', sourceIds: ['hnt-q2-2026', 'hnt-q1-2026'], evidenceLocator: 'Q2 report published July 21, 2026 compared with Q1 report period and title.' },
  ],
  outlook_and_watch: [
    { id: 'dated-demand-base', assertion: 'The Q2 advisory report supports a low-confidence carrier-offload baseline, not an evergreen growth claim.', sourceIds: ['hnt-q2-2026'], evidenceLocator: 'Q2 report cover funding disclosure and pages 6 and 13 operating tables.', supportDirection: 'context_only', note: 'Issuer-funded advisory baseline; independent reconciliation is pending.' },
    { id: 'economic-signals', assertion: 'Carrier traffic, Data Credit burn, contracted rates, emissions and operator churn must be watched separately.', sourceIds: ['dc-docs', 'hnt-docs', 'carrier-offload'], evidenceLocator: 'Data Credit billing definitions, HNT emission schedule and carrier reward rules.', supportDirection: 'context_only', note: 'Scenario analysis, not a token price forecast.' },
    { id: 'independent-refresh', assertion: 'The outcome should be revisited when independent on-chain or carrier records reconcile the Q2 advisory figures.', sourceIds: ['hnt-q2-2026', 'helium-imc21'], evidenceLocator: 'Q2 report funding disclosure and independent paper’s public-data measurement method.', supportDirection: 'context_only', note: 'Review trigger; no future result is assumed.' },
  ],
};

const q1Window = { start: '2026-01-01', end: '2026-03-31', definition: 'calendar_quarter' };
const q2Window = { start: '2026-04-01', end: '2026-06-30', definition: 'calendar_quarter' };
const heliumMetrics = [
  metric('helium', 'hnt-price:2026-08-03', 'price', 'HNT price', 0.183, 'usd', '2026-08-03T17:26:30.797Z', 'CoinGecko market snapshot checked Aug. 3, 2026', { product: 'HNT', chains: ['Solana'] }, ['hnt-market']),
  metric('helium', 'hnt-market-cap:2026-08-03', 'market_cap', 'HNT market capitalization', 33228293, 'usd', '2026-08-03T17:26:30.797Z', 'CoinGecko market snapshot checked Aug. 3, 2026', { product: 'HNT', chains: ['Solana'] }, ['hnt-market']),
  metric('helium', 'annual-emissions:2026-08-01', 'token_emissions', 'Scheduled annual HNT emissions', 7500000, 'hnt', '2026-08-01', 'Helium emissions schedule', { product: 'HNT', chains: ['Solana'] }, ['hnt-docs'], ['scheduled-not-realized']),
  metric('helium', 'carrier-offload-dc-burn:q1-2026', 'fees', 'Historical Q1 carrier-offload Data Credit burn', 3560000, 'usd', '2026-03-31', 'Nova Labs-funded Blockworks Advisory Q1 protocol-accounting value', { product: 'Helium Mobile', chains: ['Solana'] }, ['hnt-q1-2026'], ['historical-comparator', 'issuer-funded-advisory', 'protocol-dc-burn-not-cash-receipts'], q1Window),
  metric('helium', 'carrier-offload-transfer:q1-2026', 'utilization', 'Historical Q1 carrier-offload data transferred', 8281.1, 'terabytes', '2026-03-31', 'Nova Labs-funded Blockworks Advisory Q1 carrier-offload transfer total', { product: 'Helium Mobile', chains: ['Solana'] }, ['hnt-q1-2026'], ['historical-comparator', 'issuer-funded-advisory'], q1Window),
  metric('helium', 'carrier-offload-dc-burn:q2-2026', 'fees', 'Q2 carrier-offload Data Credit burn', 3290000, 'usd', '2026-06-30', 'Nova Labs-funded Blockworks Advisory Q2 protocol-accounting value', { product: 'Helium Mobile', chains: ['Solana'] }, ['hnt-q2-2026'], ['latest-reported-quarter', 'issuer-funded-advisory', 'protocol-dc-burn-not-cash-receipts'], q2Window),
  metric('helium', 'total-dc-burn:q2-2026', 'fees', 'Q2 total Data Credit burn', 3350000, 'usd', '2026-06-30', 'Nova Labs-funded Blockworks Advisory Q2 total protocol-accounting value', { product: 'Helium Network', chains: ['Solana'] }, ['hnt-q2-2026'], ['latest-reported-quarter', 'issuer-funded-advisory', 'protocol-dc-burn-not-cash-receipts'], q2Window),
  metric('helium', 'carrier-offload-transfer:q2-2026', 'utilization', 'Q2 carrier-offload data transferred', 9851, 'terabytes', '2026-06-30', 'Nova Labs-funded Blockworks Advisory Q2 carrier-offload transfer total', { product: 'Helium Mobile', chains: ['Solana'] }, ['hnt-q2-2026'], ['latest-reported-quarter', 'issuer-funded-advisory'], q2Window),
  metric('helium', 'mobile-daily-active-users:q2-2026', 'active_users', 'Q2 average Mobile daily active users', 2880000, 'users', '2026-06-30', 'Nova Labs-funded Blockworks Advisory Q2 daily-active-user average', { product: 'Helium Mobile', chains: ['Solana'] }, ['hnt-q2-2026'], ['latest-reported-quarter', 'issuer-funded-advisory', 'reported-approximation'], q2Window),
  metric('helium', 'carrier-payer-rate:2026-06-05', 'unit_revenue', 'Carrier payer rate after June reset', 0.1, 'usd_per_gigabyte', '2026-06-05', 'Nova Labs-funded Blockworks Advisory reports an approximate aggregate commercial rate; Helium documentation lists $0.10/GB', { product: 'Helium Mobile carrier offload', chains: ['Solana'] }, ['hnt-q2-2026', 'dc-docs'], ['issuer-funded-advisory', 'reported-approximation', 'not-contract-level-reconciliation']),
];

const heliumEvents = [
  event('helium', 'solana-migration:2023-04-18', 'chain_migration', '2023-04-18', 'Helium completed migration from its purpose-built blockchain to Solana.', ['solana-migration']),
  event('helium', 'telefonica-trial:2024-01-24', 'commercial_trial', '2024-01-24', 'Telefónica and Nova Labs announced a Helium Mobile hotspot trial in Mexico.', ['telefonica']),
  event('helium', 'hip138-deployed:2025-02-24', 'tokenomics_change', '2025-02-24', 'The HIP 138 tracker was labeled deployed after votes to return network rewards to HNT.', ['hip138', 'hip138-track']),
  event('helium', 'carrier-payer-rate-reset:2026-06-05', 'pricing_change', '2026-06-05', 'The Nova Labs-funded Q2 report says the carrier payer rate moved on June 4–5 from $0.50 to about $0.10 per gigabyte.', ['hnt-q2-2026', 'dc-docs']),
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
    assertion: 'DAI was operating on Aug. 3, 2026.',
    sourceIds: ['dai-current-governance', 'dai-market'],
    evidenceLocator: 'Current executive-vote index and DefiLlama DAI observation checked Aug. 3, 2026.',
  },
  outcome: {
    label: 'operating_established',
    confidence: 'medium',
    assertion: 'DAI was an established operating stablecoin as of Aug. 3, 2026.',
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
    assertion: 'Helium was operating as of Aug. 3, 2026.',
    sourceIds: ['mobile-docs', 'dc-docs', 'hnt-q2-2026'],
    evidenceLocator: 'Current product documentation and the latest Nova Labs-funded Q2 operating report.',
  },
  outcome: {
    label: 'operating_mixed',
    confidence: 'low',
    assertion: 'Helium had a mixed operating outcome as of Aug. 3, 2026, with reported Q2 usage and unresolved evidence gaps.',
    sourceIds: ['hnt-q2-2026', 'hip138-track', 'carrier-offload', 'helium-imc21'],
    evidenceLocator: 'Nova Labs-funded Q2 operating tables, deployed HIP 138 tracker, current carrier documentation and independent historical measurement research.',
    note: 'Low confidence: current Q2 values come from an issuer-funded advisory report and lack independent period-level reconciliation.',
  },
  methodology: [
    'Installed hotspots, traffic, Data Credit burns, cash receipts, emissions and token price are separate signals.',
    'Blockworks Advisory reports are funded by Nova Labs and are classified as primary advisory evidence, not independent reporting.',
    'Q2 2026 is the latest operating period. Q1 metrics remain only as a dated historical comparator.',
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
        traction: 'Operating after its Solana migration and HIP 138. A Nova Labs-funded Blockworks Advisory report states carrier-offload traffic reached 9,851 terabytes in Q2 2026, up 20% from Q1; independent period-level reconciliation is still pending.',
        business_model: 'HNT burns create Data Credits for network fees while scheduled HNT emissions reward network participation. Burns, contracted receipts, emissions and token value are separate measurements.',
        outlook: 'Low-confidence base case: carrier offload remains the largest reported Mobile use. Watch independently reconciled traffic, contracted rates, carrier concentration, emissions and operator churn.',
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
  return `UPDATE ${tableName} AS row\nSET\n  ${assignments},\n  profile = CASE\n    WHEN json_type(COALESCE(row.profile, '{}'), '$.legacy_preservation.previous_profile') IS NULL THEN\n      json_set(\n        json_remove(json_patch(COALESCE(row.profile, '{}'), json(s.profile)), '$.sources'),\n        '$.legacy_preservation.previous_profile', json(COALESCE(row.profile, '{}')),\n        '$.legacy_preservation.previous_sources', json(COALESCE(row.sources, '[]')),\n        '$.legacy_preservation.preserved_at', '${AS_OF}'\n      )\n    ELSE json_remove(json_patch(COALESCE(row.profile, '{}'), json(s.profile)), '$.sources')\n  END,\n  sources = s.sources,\n  updated_at = '${AS_OF}'\nFROM _dai_helium_citation_0079 s\nWHERE s.table_name = '${tableName}' AND lower(row.slug) = s.slug;`;
}

function sqlLiteral(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function stagingInsert(item) {
  const values = [
    item.table,
    item.slug,
    JSON.stringify(item.profile),
    JSON.stringify(item.sources),
    item.name,
    item.symbol,
    item.category,
    item.status,
  ].map(sqlLiteral).join(',\n  ');
  return `INSERT INTO _dai_helium_citation_0079 (\n  table_name, slug, profile, sources, name, symbol, category, status\n) VALUES (\n  ${values}\n);`;
}

export function renderMigration(value = document) {
  const inserts = value.cases.map(stagingInsert).join('\n');
  return `-- Follow-up DAI/Helium citation-integrity repair, researched 2026-08-03.\n-- Q2 replaces Q1 as Helium's latest period; Blockworks Advisory is issuer-funded primary evidence.\n-- Existing legacy_preservation remains byte-for-byte stable and every statement is idempotent.\nDROP TABLE IF EXISTS _dai_helium_citation_0079;\nCREATE TABLE _dai_helium_citation_0079 (\n  table_name TEXT,\n  slug TEXT,\n  profile TEXT CHECK(json_valid(profile)),\n  sources TEXT CHECK(json_valid(sources)),\n  name TEXT,\n  symbol TEXT,\n  category TEXT,\n  status TEXT,\n  PRIMARY KEY(table_name, slug)\n);\n${inserts}\n${updateStatement('stablecoin_meta', 'name = s.name,\n  symbol = s.symbol')}\n${updateStatement('rwa_depin', 'name = s.name,\n  category = s.category,\n  status = s.status')}\nDROP TABLE _dai_helium_citation_0079;\n`;
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

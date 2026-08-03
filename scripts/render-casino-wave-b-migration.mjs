#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYSIS_SECTION_KEYS, validateEntityProfile } from '../src/lib/entity-profile.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(root, 'docs/casino-wave-b-profiles-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0090_casino_wave_b_profiles.sql');
const AS_OF = '2026-08-03';
const ACCESSED_AT = '2026-08-03T19:54:08Z';
const NEXT_REVIEW_AT = '2026-08-10T19:54:08Z';
const MAX_D1_STATEMENT_BYTES = 95_000;

const sid = (slug, key) => `source:${slug}:${key}`;

function source(slug, key, title, url, publisher, {
  publishedAt = null,
  tier = 'B',
  role = 'primary',
  locator = 'The reviewed page and its product-specific text.',
  archiveUrl = null,
  accessState = 'reachable',
} = {}) {
  return {
    id: sid(slug, key),
    title,
    url,
    publisher,
    published_at: publishedAt,
    accessed_at: ACCESSED_AT,
    archive_url: archiveUrl,
    tier,
    role,
    access_state: accessState,
    checked_at: ACCESSED_AT,
    content_hash: null,
    evidence_locator: locator,
    resolving: true,
  };
}

function claim(assertion, sourceIds, evidenceLocator, {
  kind = 'fact', confidence = 'high', note = null,
} = {}) {
  return {
    assertion,
    value: assertion,
    source_ids: sourceIds,
    evidence_locator: evidenceLocator,
    confidence,
    kind,
    support_direction: 'supports',
    note,
  };
}

function section(body, claims) {
  return { body, claims };
}

function metric(key, dimension, label, value, sourceIds, method, {
  unit = 'usd', currency = 'USD', asOf = ACCESSED_AT,
  start = null, end = asOf, window = 'point_in_time', scope = {}, qualityFlags = [],
  locator = 'The dated source reports this value for the stated scope and window.',
} = {}) {
  return {
    key, dimension, label, value, source_ids: sourceIds, method,
    unit, currency, as_of: asOf,
    window: { start, end, definition: window },
    scope, quality_flags: qualityFlags, evidence_locator: locator,
  };
}

function event(key, type, date, description, sourceIds, locator, datePrecision = 'day') {
  return {
    key, type, date, description, source_ids: sourceIds,
    evidence_locator: locator, date_precision: datePrecision,
  };
}

function buildProfile(spec) {
  const claims = [];
  const sections = {};
  for (const key of ANALYSIS_SECTION_KEYS) {
    const value = spec.sections[key];
    const claimIds = value.claims.map((item, index) => {
      const id = `claim:${spec.slug}:section:${key}:${index + 1}`;
      claims.push({
        id,
        field_path: `analysis.sections.${key}.body`,
        assertion: item.assertion,
        value: item.value,
        as_of: AS_OF,
        confidence: item.confidence,
        kind: item.kind,
        source_ids: item.source_ids,
        evidence_locator: item.evidence_locator,
        support_direction: item.support_direction,
        note: item.note,
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
      confidence: spec.statusConfidence || 'high',
      kind: 'fact',
      source_ids: spec.statusSources,
      evidence_locator: spec.statusLocator,
      support_direction: 'supports',
      note: spec.statusNote || null,
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
      note: 'Lifecycle classification, not a claim of profitability, solvency, legality in every market, or one exclusive cause.',
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    },
  );

  const metrics = spec.metrics.map((item) => {
    const id = `metric:${spec.slug}:${item.key}:${item.as_of}`;
    const claimId = `claim:${spec.slug}:metric:${item.key}`;
    claims.push({
      id: claimId,
      field_path: `metrics[${id}].value`,
      assertion: `${item.label} was ${item.value} ${item.unit.toUpperCase()} for the stated scope and window.`,
      value: item.value,
      as_of: item.as_of,
      confidence: 'high',
      kind: 'fact',
      source_ids: item.source_ids,
      evidence_locator: item.evidence_locator,
      support_direction: 'supports',
      note: `Limits: ${item.quality_flags.join(', ')}.`,
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
      as_of: item.as_of,
      method: item.method,
      scope: item.scope,
      formula: null,
      raw_input_ids: [],
      claim_ids: [claimId],
      quality_flags: item.quality_flags,
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
      source_ids: item.source_ids,
      evidence_locator: item.evidence_locator,
      support_direction: 'supports',
      note: item.date_precision === 'day' ? null : `Source precision: ${item.date_precision}.`,
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    });
    return {
      id,
      type: item.type,
      date: item.date,
      description: item.description,
      claim_ids: [claimId],
      date_precision: item.date_precision,
    };
  });

  const profile = {
    schema: 'chaindump-entity-profile',
    version: 1,
    identity: {
      id: `web3_casino:${spec.slug}`,
      type: 'web3_casino',
      slug: spec.slug,
      name: spec.name,
      aliases: spec.aliases || [],
    },
    classification: spec.classification,
    status: { operating_state: spec.operatingState, as_of: AS_OF, claim_ids: [statusClaimId] },
    outcome: {
      label: spec.outcome,
      as_of: AS_OF,
      rule_id: 'casino-lifecycle-evidence-v1',
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
      legacy_origin: 'casino_syntheses.outlook',
      identity_boundary: spec.identityBoundary,
      metric_boundary: spec.metricBoundary,
      explicit_unknowns: spec.unknowns,
      methodology_notes: spec.methodologyNotes,
    },
  };
  const errors = validateEntityProfile(profile);
  if (errors.length) throw new Error(`${spec.slug}: ${JSON.stringify(errors)}`);
  return profile;
}

const etheroll = 'etheroll-dice-game';
const etherollSources = [
  source(etheroll, 'domain', 'etheroll.com parked domain', 'https://etheroll.com/', 'etheroll.com / Above.com', { locator: 'The current primary domain is a generic information page saying the domain may be for sale; no playable Etheroll interface appears.' }),
  source(etheroll, 'game-contract', 'Etheroll game contract', 'https://etherscan.io/address/0xA52e014B3f5Cc48287c2D483A3E026C32cc76E6d', 'Etherscan', { tier: 'A', role: 'independent', locator: 'Explorer labels and verified code identify the historical Etheroll dice-game contract and its onchain calls.' }),
  source(etheroll, 'token-contract', 'DICE (ROL) token contract', 'https://etherscan.io/token/0x2e071D2966Aa7D8dECB1005885bA1977D6038A65', 'Etherscan', { tier: 'A', role: 'independent', locator: 'Explorer identifies the persistent EtherollToken contract, token name DICE and symbol ROL.' }),
  source(etheroll, 'longitudinal-study', 'Inside the decentralised casino: A longitudinal study of actual cryptocurrency gambling transactions', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7592737/', 'PeerJ Computer Science / PubMed Central', { publishedAt: '2020-10-29', tier: 'A', role: 'independent', locator: 'Peer-reviewed study identifies Etheroll as a one-game, no-deposit Ethereum dice contract and analyzes its historical transactions.' }),
  source(etheroll, 'behaviour-study', 'Understanding gambling behaviour and risk attitudes using cryptocurrency-based casino blockchain data', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7657926/', 'Royal Society Open Science / PubMed Central', { publishedAt: '2020-11-11', tier: 'A', role: 'independent', locator: 'Peer-reviewed study describes Etheroll wallet-to-contract wagering and historical contract updates from 2017.' }),
  source(etheroll, 'whitepaper', 'Etheroll DICE game whitepaper', 'https://www.allcryptowhitepapers.com/wp-content/uploads/2018/05/etheroll-white-paper.pdf', 'Archived Etheroll whitepaper mirror', { tier: 'C', role: 'independent', locator: 'Historical whitepaper mirror describes the dice game, bankroll and token thesis; it is not proof of current rights or operation.' }),
];

const wagerr = 'wagerr-consumer-sportsbook';
const wagerrSources = [
  source(wagerr, 'domain', 'wagerr.com domain-sale page', 'https://wagerr.com/', 'wagerr.com / Efty', { locator: 'The primary domain now redirects to a domain-sale landing page and exposes no sportsbook.' }),
  source(wagerr, 'core', 'Wagerr Core', 'https://github.com/wagerr/wagerr', 'Wagerr GitHub organization', { locator: 'Official repository documents the purpose-built chain, WGR roles and historical releases.' }),
  source(wagerr, 'core-api', 'Wagerr Core repository metadata', 'https://api.github.com/repos/wagerr/wagerr', 'GitHub API', { role: 'aggregator', locator: 'Repository metadata reports that the project is not archived and that the default branch was last pushed in 2021.' }),
  source(wagerr, 'core-release', 'Wagerr Core 4.0.0 (Reno)', 'https://github.com/wagerr/wagerr/releases/tag/v4.0.0', 'Wagerr GitHub organization', { publishedAt: '2020-12-18', locator: 'Official release page is the latest located core release.' }),
  source(wagerr, 'electron', 'Wagerr Electron App', 'https://github.com/wagerr/wagerr-electron-app', 'Wagerr GitHub organization', { locator: 'Official consumer-client repository preserves source and release history.' }),
  source(wagerr, 'electron-release', 'Wagerr Electron App 2.1.3', 'https://github.com/wagerr/wagerr-electron-app/releases/tag/v2.1.3', 'Wagerr GitHub organization', { publishedAt: '2022-02-15', locator: 'Official release page is the latest located packaged consumer-client release.' }),
  source(wagerr, 'explorer', 'Wagerr block explorer', 'https://wgr.tokenview.io/', 'Tokenview', { role: 'independent', locator: 'Third-party explorer page identifies Wagerr but returned no current block, transaction, holder or supply figures during review.' }),
];

const rollbit = 'rollbit-dot-com';
const rollbitSources = [
  source(rollbit, 'terms', 'Rollbit Terms and Conditions of Service', 'https://rollbit.com/terms-and-conditions', 'Rollbit / Bull Gaming N.V.', { publishedAt: '2025-01-31', tier: 'A', locator: 'Terms identify Bull Gaming N.V., custodial member accounts, product scope, restrictions and claimed Curaçao licence.' }),
  source(rollbit, 'dashboard', 'RLB dashboard', 'https://rollbit.com/rlb/dashboard/stats', 'Rollbit / Bull Gaming N.V.', { locator: 'Current customer surface lists casino, sports, PVP, bonus and RLB products and separates crypto futures from the gaming licence.' }),
  source(rollbit, 'cga', 'Rollbit certificate of operation', 'https://cert.cga.cw/certificate?id=ZXlKcGRpSTZJbmg0VTBwNE5FYzBWRllyV1hCak5GQjJkMnROVjJjOVBTSXNJblpoYkhWbElqb2llRGRHZVdSelRFc3hlSFJTU1V4Q1NVNXFiMEZ5VVQwOUlpd2liV0ZqSWpvaVpqRTVaakUzWXpRNFptRTVZakk0TkRaaU1tRXlOamhsTVdaaU5XRm1NREF6WldRME5qY3pPVE14TW1VMVpUWXpZV0ptWlRJek4yTXlORE5pTjJOaU9TSXNJblJoWnlJNklpSjk%3D', 'Curaçao Gaming Authority', { tier: 'A', role: 'independent', locator: 'Regulator certificate identifies rollbit.com, Bull Gaming N.V., company number 157086, licence OGL/2024/1260/0494 and an active status.' }),
  source(rollbit, 'migration', 'RLB migration to Ethereum', 'https://blog.rollbit.com/rlb-eth-migration/', 'Rollbit', { publishedAt: '2023-06-28', locator: 'Official post documents the Solana-to-Ethereum migration, Ethereum contract and the end of Solana withdrawals.' }),
  source(rollbit, 'utility', 'RLB Utility Guide', 'https://blog.rollbit.com/rlb-utility-guide/', 'Rollbit', { publishedAt: '2023-09-13', locator: 'Operator report documents the buy-and-burn formula, historical purchase amount, lottery, rakeback and explicit revenue-versus-profit warning.' }),
  source(rollbit, 'burns', 'RLB Burn Schedule and History', 'https://blog.rollbit.com/rlb-burns/', 'Rollbit', { publishedAt: '2022-01-27', locator: 'Official history documents the 2021 token launch and historical burns, while directing current burns to an onchain hot wallet.' }),
  source(rollbit, 'token-contract', 'RLB Ethereum token contract', 'https://etherscan.io/token/0x046eee2cc3188071c02bfc1745a6b17c656e3f3d', 'Etherscan', { tier: 'A', role: 'independent', locator: 'Explorer identifies the post-migration RLB ERC-20 contract and onchain transfers.' }),
  source(rollbit, 'swiss-blocklist', 'Blocked online gambling domains, May 2026', 'https://www.esbk.admin.ch/dam/en/sd-web/nOL17qZ31LLG/sperrliste-2026-05-26-dfi.pdf', 'Swiss Federal Gaming Board', { publishedAt: '2026-05-26', tier: 'A', role: 'independent', locator: 'Official Swiss access-blocking list includes rollbit.com; this is a Switzerland-specific restriction, not a global illegality finding.' }),
];

const bitcasino = 'bitcasino-dot-io';
const bitcasinoSources = [
  source(bitcasino, 'licence', 'Our license', 'https://bitcasino.io/help-center/help-terms-and-conditions/our-license', 'Bitcasino.io / Moon Technologies B.V.', { tier: 'A', locator: 'Current disclosure identifies Moon Technologies B.V., payment agent mProcessing Solutions Ltd and Curaçao licence OGL/2023/111/0069.' }),
  source(bitcasino, 'cga', 'Bitcasino.io certificate of operation', 'https://cert.cga.cw/certificate?id=ZXlKcGRpSTZJalJKYkRWemNrdG9lbkl3ZEN0M1dXRTFTVmxYVWxFOVBTSXNJblpoYkhWbElqb2lZMWRUYWt4aE0xcEVjRXdyVW5OT1dFbERSRUpUU25vMlMzZFhXV2xSYlVGNFNGTlpXazF0YzBwdE9EMGlMQ0p0WVdNaU9pSm1NVFJqT0dObE9UZzJPR001WldSa1pURmtPV05pWXpkaE1XVmpaRGxtTldZMk16YzVaREUyWTJRNVpEbGpNREkzT0RrNU5USmxOREpoWVdSaE56VTRJaXdpZEdGbklqb2lJbjA9', 'Curaçao Gaming Authority', { tier: 'A', role: 'independent', locator: 'Regulator certificate identifies bitcasino.io, Moon Technologies B.V., licence OGL/2023/111/0069 and active status.' }),
  source(bitcasino, 'terms', 'General Terms and Conditions', 'https://bitcasino.io/help-center/help-terms-and-conditions/bitcasino-terms-and-conditions-of-use-of-services-of-the-company', 'Bitcasino.io / Moon Technologies B.V.', { tier: 'A', locator: 'Terms document member accounts, custody and withdrawal controls, KYC, restrictions and weekly processing discretion for very large withdrawals.' }),
  source(bitcasino, 'rewards', 'Bitcasino Reward System', 'https://bitcasino.io/help-center/help-your-bonuses/bitcasino-bonus-system', 'Bitcasino.io', { locator: 'Current help page documents promotions, loyalty points, rewards and withdrawal limits while an active reward is in use.' }),
  source(bitcasino, 'fairness', 'Bitcasino Originals provably fair games', 'https://bitcasino.io/help-center/help-getting-started/are-the-games-provably-fair--', 'Bitcasino.io', { locator: 'Current page limits cryptographic result verification to Bitcasino Originals and explains the seed/commitment process.' }),
  source(bitcasino, 'group', 'Yolo Group restructures business verticals and senior team', 'https://blog.yolo.com/yolo-group-restructures-business-verticals-and-senior-team/', 'Yolo Group', { publishedAt: '2023-10-03', locator: 'Archived official group announcement places Bitcasino in the Yolo Entertainment B2C portfolio and separates the platform and investment businesses.', archiveUrl: 'https://web.archive.org/web/20240419120328/https://blog.yolo.com/yolo-group-restructures-business-verticals-and-senior-team/', accessState: 'archived' }),
  source(bitcasino, 'history', 'Bitcasino since 2014', 'https://bitcasino.io/themes/fantasy', 'Bitcasino.io', { locator: 'Current operator page dates its Bitcoin-casino activity to 2014; this is a company self-report.' }),
  source(bitcasino, 'swiss-blocklist', 'Blocked online gambling domains, May 2026', 'https://www.esbk.admin.ch/dam/en/sd-web/nOL17qZ31LLG/sperrliste-2026-05-26-dfi.pdf', 'Swiss Federal Gaming Board', { publishedAt: '2026-05-26', tier: 'A', role: 'independent', locator: 'Official Swiss access-blocking list includes bitcasino.io with an initial listing date of 2020-08-18; scope is Switzerland only.' }),
];

const augur = 'augur-protocol-reboot';
const augurSources = [
  source(augur, 'current', 'Augur is testing its past and building its future', 'https://www.augur.net/blog/augur-testing-past-building-future/', 'Lituus Foundation / Augur', { publishedAt: '2026-07-21', locator: 'Official update describes the live Moon Fork, ChainSafe implementation work and separate Zoltar product track.' }),
  source(augur, 'fork', 'The Augur Fork is Here', 'https://www.augur.net/blog/the-augur-fork-is-here/', 'Lituus Foundation / Augur', { publishedAt: '2026-04-09', locator: 'Official notice documents the 2026 test fork, one-way migration and holder-coordination requirements.' }),
  source(augur, 'migration', 'Phase 2: The Fork Migration', 'https://www.augur.net/blog/phase-2-the-fork-migration', 'Lituus Foundation / Augur', { publishedAt: '2026-06-05', locator: 'Official phase-two notice describes the two-month token-migration window and stranded-token risk.' }),
  source(augur, 'faq', 'Fork and migration FAQ', 'https://www.augur.net/faq/', 'Lituus Foundation / Augur', { locator: 'FAQ documents the fork, per-universe tokens, one-way migration and stated August 1 deadline; its copy remained pre-deadline during the August 3 review.' }),
  source(augur, 'forkwatch', 'ForkWatch', 'https://v3.augur.net/', 'Augur Project', { locator: 'Official dashboard showed a zero countdown but unresolved/loading migration progress during the August 3 review.' }),
  source(augur, 'reboot-repo', 'Augur reboot website repository', 'https://api.github.com/repos/AugurProject/augur-reboot-website', 'GitHub API / AugurProject', { role: 'aggregator', locator: 'Official-organization repository metadata showed a push on 2026-08-03, supporting active development but not production adoption.' }),
  source(augur, 'lituus-repo', 'Lituus ChainSafe implementation', 'https://github.com/AugurProject/Lituus-CS', 'AugurProject / ChainSafe', { locator: 'Public implementation repository documents active oracle engineering; code activity is not a production-readiness claim.' }),
  source(augur, 'kraken', 'Notice of REP and REPV2 migration to AUGUR', 'https://support.kraken.com/articles/augur-migration', 'Kraken', { publishedAt: '2026-07-17', tier: 'A', role: 'independent', locator: 'Custodian notice says Kraken would migrate supported balances 1:1 to AUGUR and expected crediting by July 31; it is not proof of total protocol migration.' }),
  source(augur, 'whitepaper', 'Augur: a decentralized oracle and prediction market platform', 'https://arxiv.org/abs/1501.01042', 'Augur authors / arXiv', { publishedAt: '2015-01-05', tier: 'A', role: 'primary', locator: 'Original paper describes REP-based dispute resolution and the prediction-market/oracle thesis.' }),
];

const specs = [
  {
    slug: etheroll,
    name: 'Etheroll dice game',
    aliases: ['Etheroll', 'Etheroll DICE'],
    classification: {
      subtype: 'noncustodial onchain dice game',
      tags: ['casino', 'dice', 'noncustodial', 'smart_contract'],
      chains: ['Ethereum'],
      jurisdictions: [],
    },
    operatingState: 'customer_product_inactive',
    statusSources: [sid(etheroll, 'domain'), sid(etheroll, 'game-contract')],
    statusLocator: 'The official domain is parked with no playable interface while the historical game contract remains readable on Ethereum.',
    statusNote: 'The product/frontend call is separate from the continued existence of immutable contracts and token balances.',
    outcome: 'failed_product_artifacts_survive',
    outcomeConfidence: 'high',
    outcomeSources: [sid(etheroll, 'domain'), sid(etheroll, 'game-contract'), sid(etheroll, 'longitudinal-study')],
    outcomeLocator: 'Historical independent evidence establishes a shipped game; the current primary domain no longer offers it.',
    qualityConfidence: 'medium',
    sources: etherollSources,
    identityBoundary: 'This profile covers the original Etheroll customer dice game and etheroll.com frontend. It does not call the Ethereum contracts, DICE/ROL balances, clones or research datasets dead.',
    metricBoundary: 'No current bankroll, wagers, bettors, distributions, revenue, liabilities or solvency metric is published. Historical academic activity is not reused as a current business metric.',
    unknowns: [
      'exact product shutdown date',
      'binding reason for shutdown',
      'current contract administrators',
      'final bankroll disposition',
      'final token-holder distributions',
      'current legal operator or licence',
    ],
    unsourcedFields: ['shutdown_date', 'shutdown_cause', 'contract_admins', 'final_bankroll', 'final_distributions', 'current_operator', 'current_licence'],
    methodologyNotes: [
      'A parked domain establishes frontend discontinuity, not destruction of onchain code.',
      'Architectural constraints are treated as plausible pressures only; no reviewed postmortem identifies the shutdown cause.',
    ],
    sections: {
      what_it_is: section(`Etheroll was a single-game Ethereum casino. A player chose dice odds and sent ETH to a smart contract; settlement returned to the player wallet without a conventional casino deposit account. Independent researchers used its public transaction history to study real gambling behavior. The customer product depended on etheroll.com for discovery and usability even though the game and DICE/ROL token contracts lived on Ethereum. This report covers that original product, not every contract or fork that copied its design.`, [
        claim('Etheroll was a one-game, no-deposit Ethereum dice product with wallet-to-contract wagering.', [sid(etheroll, 'longitudinal-study'), sid(etheroll, 'behaviour-study')], 'Peer-reviewed descriptions of the product and transaction flow.'),
        claim('The historical game and DICE/ROL token contracts remain readable independently of the frontend.', [sid(etheroll, 'game-contract'), sid(etheroll, 'token-contract')], 'Current explorer records for the named contracts.'),
      ]),
      what_happened: section(`Etheroll shipped an onchain dice game and generated enough activity for two peer-reviewed studies of its historical transactions. The product did not remain available. On August 3, 2026, etheroll.com was a generic parked page saying the domain may be for sale and offered no playable game. The game and token contracts still existed on Ethereum, so the evidence supports an inactive customer product—not a claim that the code vanished, every contract stopped, or all token balances became worthless. No reviewed source states the exact shutdown date.`, [
        claim('Peer-reviewed studies document historical Etheroll wagering and confirm that a real customer product shipped.', [sid(etheroll, 'longitudinal-study'), sid(etheroll, 'behaviour-study')], 'Independent historical transaction studies.'),
        claim('The primary domain was parked with no playable Etheroll interface on 2026-08-03.', [sid(etheroll, 'domain')], 'Current domain observation.'),
      ]),
      why_this_outcome: section(`The shutdown cause is not known. The reviewed record has no founder postmortem, wind-down notice or financial statements. Etheroll’s design did create constraints: it offered one narrow game, required Ethereum transactions for play and depended on a public frontend plus an operating bankroll. Those facts can explain where pressure might arise, but they do not prove that gas costs, regulation, competition, security, team capacity or weak demand caused the closure. The honest conclusion is that a technically functioning contract product failed to sustain its customer surface for an unverified combination of reasons.`, [
        claim('No reviewed source identifies one binding cause for Etheroll becoming inactive.', [sid(etheroll, 'domain'), sid(etheroll, 'game-contract'), sid(etheroll, 'longitudinal-study')], 'Current status and historical operation without a causal postmortem.', { kind: 'unknown' }),
        claim('A single game and direct Ethereum interaction were real design constraints, not proven shutdown causes.', [sid(etheroll, 'longitudinal-study'), sid(etheroll, 'behaviour-study')], 'Independent product descriptions used to bound the inference.', { kind: 'inference', confidence: 'medium' }),
      ]),
      strategic_choices: section(`Etheroll put game logic and settlement on Ethereum instead of keeping bets entirely on an operator ledger. That made historical play inspectable and reduced the need for a persistent customer balance, while exposing each interaction to wallet and network friction. It concentrated the product around one dice mechanic rather than a broad casino catalogue. It also issued DICE/ROL around a profit-linked historical thesis. That token choice tied the investment story to continuing game economics, but the current token contract does not by itself prove a surviving distribution right.`, [
        claim('Etheroll chose direct smart-contract execution and wallet settlement for its dice game.', [sid(etheroll, 'game-contract'), sid(etheroll, 'behaviour-study')], 'Contract and independent transaction-flow evidence.'),
        claim('Etheroll paired the one-game product with DICE/ROL, but current holder rights are unverified.', [sid(etheroll, 'token-contract'), sid(etheroll, 'whitepaper')], 'Current token artifact and historical design record.', { kind: 'inference', confidence: 'medium' }),
      ]),
      operating_model: section(`A player selected a target probability, sent an Ethereum transaction and received any payout back to the same wallet through the game contract. The smart contract made the wager and payout visible onchain. That did not remove every operating role: the product still needed a usable frontend, randomness and settlement services, an adequately funded bankroll, maintenance and customer support. Researchers could analyze bets after the fact because the ledger was public; public data did not disclose the offchain team, legal entity, expenses or ability to keep serving users.`, [
        claim('Historical wagers and payouts moved between player wallets and the Etheroll contract on Ethereum.', [sid(etheroll, 'behaviour-study'), sid(etheroll, 'game-contract')], 'Peer-reviewed transaction model and explorer record.'),
        claim('Onchain settlement did not establish the operator, bankroll health, expenses or customer-support capacity.', [sid(etheroll, 'domain'), sid(etheroll, 'longitudinal-study')], 'Public transaction visibility and current operator gap.', { kind: 'unknown' }),
      ]),
      token_and_value_capture: section(`DICE, shown with the ROL symbol on Etherscan, was the historical Etheroll token. Archived materials described a relationship to game economics, but no current source confirms continuing distributions, enforceable revenue rights or an active treasury. The casino’s apparent value capture came from a house edge funded through its bankroll, while Ethereum validators received network fees from transactions. The surviving token contract and balances are artifacts, not evidence of active cash flow. No current wager, revenue, bankroll or payout series is available.`, [
        claim('The EtherollToken contract persists with the DICE name and ROL symbol.', [sid(etheroll, 'token-contract')], 'Current explorer record.'),
        claim('Current token-holder distributions and casino value capture are not established by the surviving contracts.', [sid(etheroll, 'token-contract'), sid(etheroll, 'whitepaper'), sid(etheroll, 'domain')], 'Historical thesis compared with current inactivity.', { kind: 'unknown' }),
      ]),
      counterfactual: section(`A lower-cost execution layer could have reduced wallet friction, and a broader catalogue could have given players more reasons to return. An offchain or hybrid design could have hidden transaction latency while adding custody and trust. A token without a profit narrative could have reduced dependence on game economics, while also removing a financing and community mechanism. None of those alternatives has a causal estimate in the reviewed record. They are useful comparisons for future products, not proof that one change would have saved Etheroll.`, [
        claim('Lower-cost, broader and hybrid designs change Etheroll’s observed product trade-offs.', [sid(etheroll, 'longitudinal-study'), sid(etheroll, 'behaviour-study')], 'Observed one-game onchain model used as the comparison.', { kind: 'inference', confidence: 'low' }),
        claim('No reviewed source shows that one alternative would have prevented product discontinuation.', [sid(etheroll, 'domain'), sid(etheroll, 'game-contract')], 'Current status with no postmortem or experiment.', { kind: 'unknown' }),
      ]),
      risks_and_unknowns: section(`The current risk is analytical confusion. Anyone can see or call an old contract, but that does not restore an official product, operator, support desk or bankroll. The legal operator and gambling licence were not established. Administrative control, remaining bankroll, final DICE distributions, contract safety and the treatment of any stranded users are unknown. A relaunch could also use a different domain or contract, so isolated onchain activity should not be called recovery without authenticated operator evidence and repeated settled customer use.`, [
        claim('Contract persistence and isolated transactions do not prove an official Etheroll relaunch.', [sid(etheroll, 'game-contract'), sid(etheroll, 'domain')], 'Current frontend/contract boundary.', { kind: 'inference', confidence: 'high' }),
        claim('Operator, licence, control, bankroll and final distribution facts remain unknown.', [sid(etheroll, 'domain'), sid(etheroll, 'token-contract')], 'Current public evidence gaps.', { kind: 'unknown' }),
      ]),
      lifecycle: section(`Etheroll was operating by 2017, when the contracts analyzed in later academic research began recording wagers. By 2020, independent studies could describe a meaningful historical dataset and confirm the wallet-to-contract design. At some unknown point afterward, the customer product stopped. On August 3, 2026, its primary domain was parked while both the game and token artifacts survived on Ethereum. The lifecycle call is therefore failed at the product/frontend layer, with a precise shutdown date and final financial state still unresolved.`, [
        claim('Independent research documents Etheroll activity beginning in 2017 and published analyses in 2020.', [sid(etheroll, 'longitudinal-study'), sid(etheroll, 'behaviour-study')], 'Dated peer-reviewed lifecycle evidence.'),
        claim('By 2026-08-03 the frontend was inactive while game and token contracts remained.', [sid(etheroll, 'domain'), sid(etheroll, 'game-contract'), sid(etheroll, 'token-contract')], 'Current product and artifact observations.'),
      ]),
      outlook_and_watch: section(`The base case is continued inactivity because there is no playable official domain, relaunch notice or current operating evidence. Recovery would require an authenticated team, working frontend, identified contracts, funded bankroll, current legal disclosures and repeated settled wagers—not merely a domain change or one contract call. Watch etheroll.com, verified project channels, contract administration, new game deployments, bankroll movements and any formal DICE distribution notice. A continuing parked page or unexplained contract activity would leave the call unchanged.`, [
        claim('No reviewed source supports a funded or scheduled Etheroll relaunch.', [sid(etheroll, 'domain'), sid(etheroll, 'game-contract')], 'Current official surface and contract state.', { kind: 'unknown' }),
        claim('A recovery call requires authenticated product operation and repeated customer settlement.', [sid(etheroll, 'domain'), sid(etheroll, 'longitudinal-study')], 'Historical operating evidence defines what would change the call.', { kind: 'inference', confidence: 'high' }),
      ]),
    },
    metrics: [],
    events: [
      event('historical-contract-window', 'historical_operation', '2017-04-17', 'Independent research traces Etheroll contract activity from at least April 2017.', [sid(etheroll, 'behaviour-study')], 'Peer-reviewed historical contract window.'),
      event('parked-domain', 'operations_ceased_observation', AS_OF, 'The primary domain was parked and offered no playable Etheroll product; the exact cessation date is unknown.', [sid(etheroll, 'domain')], 'Current primary-domain observation.'),
    ],
  },
  {
    slug: wagerr,
    name: 'Wagerr consumer sportsbook',
    aliases: ['Wagerr', 'WGR sportsbook'],
    classification: {
      subtype: 'purpose-built blockchain sportsbook',
      tags: ['sportsbook', 'purpose_built_chain', 'desktop_app', 'native_token'],
      chains: ['Wagerr blockchain'],
      jurisdictions: [],
    },
    operatingState: 'customer_product_inactive_protocol_unknown',
    statusConfidence: 'high',
    statusSources: [sid(wagerr, 'domain'), sid(wagerr, 'electron-release'), sid(wagerr, 'core-api')],
    statusLocator: 'The primary domain is for sale, the latest located desktop release is from 2022 and the core default branch was last pushed in 2021.',
    statusNote: 'The customer-product call does not assert that the Wagerr chain has stopped producing blocks.',
    outcome: 'failed_consumer_distribution_protocol_unresolved',
    outcomeConfidence: 'high',
    outcomeSources: [sid(wagerr, 'domain'), sid(wagerr, 'electron-release'), sid(wagerr, 'core'), sid(wagerr, 'explorer')],
    outcomeLocator: 'Current distribution is absent and official releases are stale; the chain and independent-client state could not be verified.',
    qualityConfidence: 'medium',
    sources: wagerrSources,
    identityBoundary: 'This profile covers Wagerr’s official consumer sportsbook, domain and official software distribution. It does not declare WGR balances, source code, community nodes, forks or independent clients dead.',
    metricBoundary: 'No reliable current block height, validator count, wagers, users, liquidity, revenue, liabilities or solvency series was available. Blank explorer fields are treated as unavailable, not zero.',
    unknowns: [
      'current chain liveness',
      'current validator or masternode count',
      'independent client operation',
      'current wagers and bettors',
      'formal shutdown date',
      'binding decline cause',
      'current operator and licence',
    ],
    unsourcedFields: ['chain_liveness', 'validator_count', 'independent_clients', 'current_wagers', 'current_bettors', 'shutdown_date', 'decline_cause', 'operator', 'licence'],
    methodologyNotes: [
      'A domain-sale page and stale official releases support a failed distribution call, not a chain-halt claim.',
      'The third-party explorer returned blank values; blanks are never converted to zero.',
    ],
    sections: {
      what_it_is: section(`Wagerr built a sportsbook around its own proof-of-stake blockchain and WGR asset rather than placing betting logic on Ethereum or keeping everything in a conventional bookmaker database. Official code describes a chain secured by stakers and collateralized masternodes; the consumer Electron application added a betting page, bet slip and changing-odds workflow. This report covers the official customer product and distribution. The network code, token and any community-run nodes are separate artifacts whose current health was not established.`, [
        claim('Wagerr paired a purpose-built proof-of-stake chain and native WGR asset with a consumer betting client.', [sid(wagerr, 'core'), sid(wagerr, 'electron-release')], 'Official core documentation and consumer-client release notes.'),
        claim('The current state of community nodes or independent clients is not established by the official repositories.', [sid(wagerr, 'core-api'), sid(wagerr, 'explorer')], 'Stale repository metadata and unavailable explorer metrics.', { kind: 'unknown' }),
      ]),
      what_happened: section(`Wagerr released Core 4.0.0 in December 2020 and continued packaging the sportsbook client through Electron 2.1.3 on February 15, 2022. That last release still contained active betting-page fixes and shows a real shipped product. Distribution then went stale. On August 3, 2026, wagerr.com redirected to a page advertising the domain for sale. The official core branch had not been pushed since 2021, and the third-party explorer exposed no usable current chain figures. The customer product is therefore inactive; the protocol remains unresolved rather than proven dead.`, [
        claim('Official core and customer-client releases show Wagerr shipped a functioning betting product.', [sid(wagerr, 'core-release'), sid(wagerr, 'electron-release')], 'Dated official releases.'),
        claim('The primary domain is for sale and official software distribution is stale as of 2026-08-03.', [sid(wagerr, 'domain'), sid(wagerr, 'core-api'), sid(wagerr, 'electron-release')], 'Current domain and repository observations.'),
      ]),
      why_this_outcome: section(`There is no verified postmortem, so the binding cause is unknown. Wagerr chose to maintain nearly the whole stack: a blockchain, proof-of-stake and masternode economics, oracle and betting logic, native token, desktop software and customer distribution. That integration gave the project control and transparent settlement, but it also multiplied the systems that needed active operators and users. Stale releases and a sold-off domain show distribution failure. They do not reveal whether liquidity, adoption, regulation, funding, oracle operations, security or team capacity was decisive.`, [
        claim('No reviewed source identifies one cause for the customer product becoming inactive.', [sid(wagerr, 'domain'), sid(wagerr, 'core-api'), sid(wagerr, 'electron-release')], 'Current inactivity without a wind-down explanation.', { kind: 'unknown' }),
        claim('Maintaining chain, token and client layers created a broad operating burden.', [sid(wagerr, 'core'), sid(wagerr, 'electron-release')], 'Observed architecture used for a bounded inference.', { kind: 'inference', confidence: 'medium' }),
      ]),
      strategic_choices: section(`Wagerr chose a dedicated chain instead of a shared smart-contract platform. It embedded WGR into network security and betting rather than using a neutral stablecoin as the customer unit. It shipped a native desktop client instead of relying only on a web interface. Those decisions reduced dependence on another chain and let the project design betting-specific features, but they raised onboarding and maintenance costs and made product recovery depend on reviving several layers together. The sources do not establish whether management considered a host-chain or web-first pivot.`, [
        claim('A dedicated proof-of-stake chain, collateralized masternodes and WGR were core design choices.', [sid(wagerr, 'core')], 'Official repository design and coin specifications.'),
        claim('The official betting product was distributed through a maintained Electron application.', [sid(wagerr, 'electron'), sid(wagerr, 'electron-release')], 'Official client repository and release notes.'),
      ]),
      operating_model: section(`Core software coordinated a Wagerr network with staking and masternode roles. The Electron application surfaced betting events, odds and a bet slip, then relied on the network’s market and settlement logic. WGR served as the native asset for the ecosystem. That design could remove a conventional bookmaker ledger for settlement, but it did not remove operational dependencies: the network needed healthy nodes, event and odds inputs, software releases, accessible wallets and a customer interface. None of those current service levels could be measured from the reviewed public sources.`, [
        claim('Wagerr Core used staking and collateralized masternodes, while the Electron client exposed betting workflows.', [sid(wagerr, 'core'), sid(wagerr, 'electron-release')], 'Official core and client records.'),
        claim('Current network, oracle, wallet and customer-service availability could not be verified.', [sid(wagerr, 'explorer'), sid(wagerr, 'domain'), sid(wagerr, 'core-api')], 'Blank explorer state and stale official surfaces.', { kind: 'unknown' }),
      ]),
      token_and_value_capture: section(`WGR was not an optional loyalty point. It was the network asset used in the proof-of-stake and masternode design and the consumer betting system. That created direct chain dependence: product demand could support WGR use, while a weak customer product could leave token and node activity without a clear demand engine. The repository documents issuance and network rewards, but the reviewed record does not establish current supply, burns, wager demand, treasury income or enforceable holder revenue rights. Token survival would not by itself prove sportsbook recovery.`, [
        claim('WGR was integral to network security and the betting stack rather than a separate promotional point.', [sid(wagerr, 'core'), sid(wagerr, 'electron-release')], 'Official architecture and client evidence.'),
        claim('Current supply, token demand, treasury income and holder rights remain unverified.', [sid(wagerr, 'explorer'), sid(wagerr, 'core-api')], 'Current measurement gaps.', { kind: 'unknown' }),
      ]),
      counterfactual: section(`Building on a larger smart-contract chain could have removed responsibility for consensus and basic wallet infrastructure, while adding host-chain fees and dependencies. A web-first interface could have reduced installation friction, while giving up some desktop control. Stablecoin settlement might have reduced token-price exposure, while weakening native network incentives. These alternatives fit the observed failure surfaces, but no adoption study or management record shows that one would have prevented the inactive outcome.`, [
        claim('Host-chain, web-first and stablecoin designs would trade control for lower infrastructure and onboarding burden.', [sid(wagerr, 'core'), sid(wagerr, 'electron-release')], 'Observed full-stack design used as the comparison.', { kind: 'inference', confidence: 'low' }),
        claim('No reviewed evidence measures any alternative against Wagerr’s actual outcome.', [sid(wagerr, 'domain'), sid(wagerr, 'core-api')], 'No published postmortem or experiment.', { kind: 'unknown' }),
      ]),
      risks_and_unknowns: section(`The main product risk is abandonment: the official domain no longer distributes a sportsbook and official releases are years old. The main analytical risk is overstating that evidence as a chain shutdown. The third-party explorer returned blanks, which may reflect an unavailable indexer rather than zero blocks or users. Current node count, chain tip, oracle operation, bets, wallet compatibility, operator, licence and customer support are unknown. Old binaries also carry dependency and security risk if users keep running them without maintained releases.`, [
        claim('The official consumer distribution is abandoned or inactive based on the domain and release record.', [sid(wagerr, 'domain'), sid(wagerr, 'electron-release')], 'Current distribution evidence.'),
        claim('Blank explorer data cannot prove zero chain activity, nodes or bets.', [sid(wagerr, 'explorer'), sid(wagerr, 'core-api')], 'Third-party indexer limitation and stale repository metadata.', { kind: 'unknown' }),
      ]),
      lifecycle: section(`Wagerr’s latest located core release arrived on December 18, 2020. The consumer client continued through February 15, 2022, when version 2.1.3 shipped betting-page fixes. No later packaged client was found. By August 3, 2026, the primary domain was a for-sale page, the core branch had not been pushed since 2021 and current explorer figures were unavailable. This sequence supports a failed consumer-distribution lifecycle. It leaves open whether a residual network or independent clients continue outside official product channels.`, [
        claim('Core 4.0.0 and Electron 2.1.3 provide dated milestones for the last located official releases.', [sid(wagerr, 'core-release'), sid(wagerr, 'electron-release')], 'Official release history.'),
        claim('The 2026 domain and repository state support inactive official distribution, not verified protocol death.', [sid(wagerr, 'domain'), sid(wagerr, 'core-api'), sid(wagerr, 'explorer')], 'Current product and measurement boundary.'),
      ]),
      outlook_and_watch: section(`The base case is continued customer-product inactivity because no maintained official distribution or relaunch plan was found. A recovery call requires a restored authenticated domain, a signed client or core release, verifiable chain liveness, live betting markets and repeated settled wagers. Watch the Wagerr GitHub organization, domain ownership, package signatures, reproducible node data, oracle feeds, active betting events and user-support channels. A token trade, repository star or blank-to-populated explorer screen would not alone establish a recovered sportsbook.`, [
        claim('No reviewed source supports a dated Wagerr customer-product relaunch.', [sid(wagerr, 'domain'), sid(wagerr, 'electron'), sid(wagerr, 'core-api')], 'Current product and repository surfaces.', { kind: 'unknown' }),
        claim('Recovery requires authenticated distribution plus verifiable network and betting activity.', [sid(wagerr, 'core'), sid(wagerr, 'electron-release')], 'Historical operating stack defines the evidence needed to change the call.', { kind: 'inference', confidence: 'high' }),
      ]),
    },
    metrics: [],
    events: [
      event('core-4-release', 'software_release', '2020-12-18', 'Wagerr released Core 4.0.0, the latest located official core release.', [sid(wagerr, 'core-release')], 'Official GitHub release.'),
      event('electron-2-1-3', 'software_release', '2022-02-15', 'Wagerr released Electron App 2.1.3, the latest located packaged customer-client release.', [sid(wagerr, 'electron-release')], 'Official GitHub release.'),
      event('domain-for-sale', 'distribution_end_observation', AS_OF, 'The primary domain redirected to a for-sale landing page and exposed no sportsbook.', [sid(wagerr, 'domain')], 'Current primary-domain observation.'),
    ],
  },
  {
    slug: rollbit,
    name: 'Rollbit',
    aliases: ['Rollbit.com', 'Bull Gaming N.V.'],
    classification: {
      subtype: 'custodial crypto casino and sportsbook',
      tags: ['casino', 'sportsbook', 'custodial', 'exchange_token', 'crypto_futures'],
      chains: ['Ethereum'],
      jurisdictions: ['Curaçao licence', 'Switzerland blocked-domain list'],
    },
    operatingState: 'operating',
    statusConfidence: 'high',
    statusSources: [sid(rollbit, 'dashboard'), sid(rollbit, 'terms'), sid(rollbit, 'cga')],
    statusLocator: 'The customer dashboard is live, current terms identify the operator and the regulator certificate reports an active licence.',
    outcome: 'successful_established_unquantified',
    outcomeConfidence: 'medium',
    outcomeSources: [sid(rollbit, 'dashboard'), sid(rollbit, 'cga'), sid(rollbit, 'migration'), sid(rollbit, 'utility')],
    outcomeLocator: 'Current operation, an active regulator certificate and product/token continuity support an established-product call; audited economics and solvency are not public.',
    qualityConfidence: 'high',
    sources: rollbitSources,
    identityBoundary: 'Bull Gaming N.V. is the named operator of Rollbit’s casino and sportsbook. The crypto-futures product, Ethereum RLB contract, individual game suppliers and customers are separate legal and technical layers.',
    metricBoundary: 'The one published dollar figure is an operator-reported historical amount of RLB purchased for its buy-and-burn program. It is not casino revenue, profit, customer assets, reserves, current token demand or audited cash flow.',
    unknowns: [
      'current active and retained customers',
      'casino wager volume and net gaming revenue',
      'customer assets and liabilities',
      'reserve coverage and withdrawal completion',
      'current RLB buyback execution and treasury holdings',
      'product and market concentration',
      'licensing position outside Curaçao',
    ],
    unsourcedFields: ['active_customers', 'retained_customers', 'wager_volume', 'net_gaming_revenue', 'customer_assets', 'liabilities', 'reserves', 'withdrawal_completion', 'current_buybacks', 'treasury', 'market_concentration'],
    methodologyNotes: [
      'Established means current product, licence and lifecycle continuity; it does not mean profitable or solvent.',
      'The Swiss blocklist is reported only as a Switzerland-specific access restriction.',
      'The operator explicitly distinguishes revenue from profit in the historical RLB purchase report.',
    ],
    sections: {
      what_it_is: section(`Rollbit is a custodial online casino and sportsbook operated by Bull Gaming N.V. Customers use platform accounts and balances rather than settling every bet from a personal wallet. The same brand also presents a crypto-futures product, but its own terms say that product is outside the gambling licence, so it must not be treated as part of the regulated casino. RLB is a separate Ethereum token used in Rollbit promotions and loyalty mechanics; holding it is not the same as owning the operator or its customer assets.`, [
        claim('Bull Gaming N.V. operates a custodial casino and sportsbook through member accounts.', [sid(rollbit, 'terms'), sid(rollbit, 'cga')], 'Current terms and regulator certificate.'),
        claim('Rollbit separates crypto futures from the casino and sportsbook covered by its gambling licence.', [sid(rollbit, 'terms'), sid(rollbit, 'dashboard')], 'Current legal and product disclosures.'),
      ]),
      what_happened: section(`Rollbit built a combined casino, sportsbook and token-led rewards product and remained accessible at the August 3, 2026 review. It launched RLB on November 10, 2021, then moved the token from Solana to Ethereum in June 2023, ending Solana withdrawals and identifying a new ERC-20 contract. In September 2023 the operator reported buying about $5.54 million of RLB since August 8 under its then-current buy-and-burn formula. The regulator certificate now lists rollbit.com and an active Curaçao licence. Those facts show continuity, not audited profitability or reserve adequacy.`, [
        claim('RLB launched in 2021 and migrated from Solana to Ethereum in 2023.', [sid(rollbit, 'burns'), sid(rollbit, 'migration'), sid(rollbit, 'token-contract')], 'Official lifecycle posts and current contract.'),
        claim('Rollbit’s customer product and Curaçao certificate were active at the review date.', [sid(rollbit, 'dashboard'), sid(rollbit, 'cga')], 'Current product and regulator observations.'),
      ]),
      why_this_outcome: section(`Rollbit’s established position is consistent with a broad product bundle, one account across casino and sports, frequent promotions and an RLB loop that linked betting revenue to token purchases. That combination can improve acquisition and give existing customers several reasons to return. It also concentrates trust in one operator, one account system and discretionary withdrawal controls. Public sources do not isolate which feature created durable demand, and they do not show retention, customer acquisition cost, game margins or subsidy-adjusted economics. The causal call is therefore bounded: product breadth and rewards plausibly supported continuity, but commercial quality is unproven.`, [
        claim('Rollbit combines casino, sportsbook, bonuses and RLB utilities in one customer surface.', [sid(rollbit, 'dashboard'), sid(rollbit, 'utility')], 'Current product surface and historical utility guide.', { kind: 'inference', confidence: 'medium' }),
        claim('No reviewed source isolates retention, acquisition cost or subsidy-adjusted profitability.', [sid(rollbit, 'terms'), sid(rollbit, 'utility'), sid(rollbit, 'cga')], 'Public disclosure limits.', { kind: 'unknown' }),
      ]),
      strategic_choices: section(`Rollbit chose a conventional custodial account experience instead of requiring an onchain transaction for every bet. It chose to put casino, sports, PVP and crypto-futures products under one brand, while legally separating futures from licensed gambling. It launched RLB and used a formula tied to revenue for market purchases, directing 90% of purchased tokens to burning and 10% to Rollbot NFT stakers in the cited 2023 program. It also migrated RLB to Ethereum, accepting migration friction in exchange for a different token environment. These choices increase cross-selling and control, but add custody, compliance and token-execution risk.`, [
        claim('Rollbit deliberately combined custodial gambling products with a revenue-linked RLB purchase program.', [sid(rollbit, 'terms'), sid(rollbit, 'utility')], 'Account terms and historical utility program.'),
        claim('The operator chose to migrate RLB from Solana to a named Ethereum contract.', [sid(rollbit, 'migration'), sid(rollbit, 'token-contract')], 'Official migration notice and explorer record.'),
      ]),
      operating_model: section(`A customer creates a Rollbit account, deposits supported assets and places bets against games or sportsbook markets while Bull Gaming controls the account ledger and withdrawal process. The licensed operator is Bull Gaming N.V.; game suppliers and sports-data providers may supply underlying products, while the operator owns the customer relationship. Crypto futures is shown in the same brand experience but is contractually outside the gaming licence. This is not a noncustodial protocol. Customers depend on the operator for account access, identity checks, balances, withdrawals, dispute handling and regional eligibility.`, [
        claim('Customer balances and withdrawals are governed through Rollbit member accounts and operator controls.', [sid(rollbit, 'terms')], 'Current account and withdrawal terms.'),
        claim('The Curaçao certificate names Bull Gaming N.V. and an active licence for rollbit.com.', [sid(rollbit, 'cga')], 'Current independent regulator certificate.'),
      ]),
      token_and_value_capture: section(`RLB is an Ethereum ERC-20 token tied to Rollbit’s reward and promotional system. The 2023 utility guide said a percentage of platform revenue was used to purchase RLB, with 90% burned and 10% sent to Rollbot stakers. It also warned that revenue is not profit. The reported $5.54 million purchase amount covered only August 8 through September 13, 2023 and is not a current run rate. Token burns can reduce supply, but they do not create a legal claim on Bull Gaming, customer balances or future cash flows. Current purchases, treasury balances and holder concentration remain unverified.`, [
        claim('The cited 2023 program directed 90% of purchased RLB to burns and 10% to Rollbot stakers.', [sid(rollbit, 'utility'), sid(rollbit, 'burns')], 'Historical operator program and burn history.'),
        claim('RLB ownership is not documented as equity, customer-asset ownership or an enforceable profit claim.', [sid(rollbit, 'utility'), sid(rollbit, 'terms'), sid(rollbit, 'token-contract')], 'Token mechanics and legal terms.', { kind: 'unknown' }),
      ]),
      counterfactual: section(`A token-free loyalty program could reduce market and migration risk, while losing the tradable incentive that Rollbit used for promotion. A noncustodial betting protocol could reduce operator custody, while making wallet, liquidity and smart-contract risk more visible to customers. Separating casino, sportsbook and futures into distinct brands could clarify regulation, but reduce cross-selling. None of the reviewed evidence estimates those alternatives. Rollbit’s continued operation shows the chosen bundle can persist; it does not prove that every component is necessary or that another design would be less profitable.`, [
        claim('Token-free, noncustodial and product-separated designs would change Rollbit’s observed risks and distribution.', [sid(rollbit, 'terms'), sid(rollbit, 'dashboard'), sid(rollbit, 'utility')], 'Current design used as the comparison.', { kind: 'inference', confidence: 'low' }),
        claim('No reviewed source measures Rollbit against those alternatives.', [sid(rollbit, 'terms'), sid(rollbit, 'utility')], 'No published controlled comparison.', { kind: 'unknown' }),
      ]),
      risks_and_unknowns: section(`Customers face operator custody, account restriction, identity-check and withdrawal risk. The terms give the operator substantial control over eligibility and processing, while no public proof-of-reserves series links customer liabilities to assets. RLB adds contract, market, concentration and program-change risk. The Swiss regulator’s blocklist includes rollbit.com, but that finding is specific to Swiss access and does not establish the site’s status in every country. Current users, retention, wagers, revenue, profit, reserves, liabilities, withdrawal times and token purchases are unknown.`, [
        claim('Custody, account controls and geographic restrictions remain material customer risks.', [sid(rollbit, 'terms'), sid(rollbit, 'swiss-blocklist')], 'Current terms and jurisdiction-specific regulator list.'),
        claim('Current reserves, liabilities, withdrawals and token-program execution are not publicly established.', [sid(rollbit, 'terms'), sid(rollbit, 'utility'), sid(rollbit, 'cga')], 'Disclosure gaps.', { kind: 'unknown' }),
      ]),
      lifecycle: section(`RLB launched in November 2021. Rollbit documented repeated token burns, then moved RLB from Solana to Ethereum in June 2023 and published a revenue-linked purchase snapshot that September. By August 3, 2026, the customer dashboard remained live and the Curaçao regulator certificate showed an active licence for rollbit.com. Switzerland’s May 2026 blocklist also showed that geographic access remains contested. Rollbit is therefore an established, operating custodial product with demonstrated continuity. Its economic success, reserve quality and customer outcomes cannot be graded from the current public record.`, [
        claim('Dated token, migration and licence records establish product continuity across 2021–2026.', [sid(rollbit, 'burns'), sid(rollbit, 'migration'), sid(rollbit, 'cga')], 'Dated lifecycle evidence.'),
        claim('The current lifecycle call does not establish profitability, solvency or universal legal access.', [sid(rollbit, 'terms'), sid(rollbit, 'cga'), sid(rollbit, 'swiss-blocklist')], 'Legal and measurement boundaries.', { kind: 'inference', confidence: 'high' }),
      ]),
      outlook_and_watch: section(`The base case is continued operation as a custodial multi-product casino and sportsbook. The strongest upgrade signals would be independently reconcilable customer liabilities and reserves, consistent withdrawal completion, durable active-customer growth and recurring revenue after bonuses. Downside signals include licence changes, new market blocks, prolonged withdrawals, large RLB program changes or falling repeat use. Watch the Curaçao certificate, terms, jurisdiction lists, withdrawal complaints and resolution times, active customers, wagers, margins, bonus cost, RLB purchases and burns, treasury movements and contract concentration.`, [
        claim('Current operation and an active certificate support a continued-operation base case.', [sid(rollbit, 'dashboard'), sid(rollbit, 'cga')], 'Current product and licence state.', { kind: 'inference', confidence: 'medium' }),
        claim('Reserves, withdrawals, retention and current RLB execution are the decisive missing signals.', [sid(rollbit, 'terms'), sid(rollbit, 'utility'), sid(rollbit, 'token-contract')], 'Known account and token dependencies.', { kind: 'unknown' }),
      ]),
    },
    metrics: [
      metric('rlb-purchases-2023', 'token_volume', 'Operator-reported RLB purchased for buy-and-burn', 5538265.59, [sid(rollbit, 'utility')], 'Operator-reported purchases attributed to the historical revenue formula', {
        asOf: '2023-09-13T00:00:00Z',
        start: '2023-08-08T00:00:00Z',
        window: 'launch_to_article_snapshot',
        scope: { product: 'RLB buy-and-burn program' },
        qualityFlags: ['historical', 'operator_reported', 'revenue_input_not_profit', 'not_casino_revenue', 'not_current'],
      }),
    ],
    events: [
      event('rlb-launch', 'token_launch', '2021-11-10', 'Rollbit launched the original RLB token.', [sid(rollbit, 'burns')], 'Official burn history.'),
      event('rlb-ethereum-migration', 'token_migration', '2023-06-28', 'Rollbit announced the RLB migration from Solana to Ethereum.', [sid(rollbit, 'migration'), sid(rollbit, 'token-contract')], 'Official migration notice and Ethereum contract.'),
      event('current-active-certificate', 'operating_observation', AS_OF, 'The customer product was live and the Curaçao regulator certificate reported an active licence.', [sid(rollbit, 'dashboard'), sid(rollbit, 'cga')], 'Current product and regulator observations.'),
    ],
  },
  {
    slug: bitcasino,
    name: 'Bitcasino.io',
    aliases: ['Bitcasino', 'Moon Technologies B.V.'],
    classification: {
      subtype: 'custodial crypto casino',
      tags: ['casino', 'custodial', 'crypto_deposits', 'loyalty_program'],
      chains: [],
      jurisdictions: ['Curaçao licence', 'Switzerland blocked-domain list'],
    },
    operatingState: 'operating',
    statusConfidence: 'high',
    statusSources: [sid(bitcasino, 'licence'), sid(bitcasino, 'cga'), sid(bitcasino, 'terms')],
    statusLocator: 'Current operator pages and the regulator certificate identify an operating customer service and active Curaçao licence.',
    outcome: 'successful_established_unquantified',
    outcomeConfidence: 'medium',
    outcomeSources: [sid(bitcasino, 'history'), sid(bitcasino, 'cga'), sid(bitcasino, 'group'), sid(bitcasino, 'terms')],
    outcomeLocator: 'Operator-reported operation since 2014, current group placement and an active licence support longevity; users, economics and solvency remain unquantified.',
    qualityConfidence: 'high',
    sources: bitcasinoSources,
    identityBoundary: 'Moon Technologies B.V. is the named casino operator, mProcessing Solutions Ltd is a payment agent and Yolo Group is the broader group. Game suppliers, payment rails, supported cryptocurrencies and customers are not the operator.',
    metricBoundary: 'No current comparable series for wagers, users, revenue, profit, customer assets, liabilities, reserves or withdrawals was verified. Loyalty points and crypto deposits are not platform tokens, revenue or reserves.',
    unknowns: ['active and retained customers', 'wager volume and game mix', 'gross and net gaming revenue', 'customer assets and liabilities', 'reserve coverage', 'withdrawal completion and timing', 'bonus-adjusted unit economics', 'supplier concentration'],
    unsourcedFields: ['active_customers', 'retained_customers', 'wager_volume', 'game_mix', 'gross_gaming_revenue', 'net_gaming_revenue', 'customer_assets', 'liabilities', 'reserves', 'withdrawal_completion', 'unit_economics', 'supplier_concentration'],
    methodologyNotes: [
      'The 2014 launch date is an operator self-report, not independent operating data for every intervening year.',
      'Provable fairness is scoped to Bitcasino Originals and is not generalized to the third-party game catalogue.',
      'The Swiss blocklist is a Switzerland-specific restriction, not a global legal conclusion.',
    ],
    sections: {
      what_it_is: section(`Bitcasino.io is a custodial online casino operated by Moon Technologies B.V. Customers open an account, deposit supported assets and rely on the operator’s internal ledger and withdrawal process. The site accepts cryptocurrency, but that does not make every game an onchain protocol. Bitcasino Originals expose a cryptographic seed process for checking their own results; third-party games require separate supplier evidence. The wider Yolo Group places Bitcasino in its consumer entertainment portfolio, while mProcessing Solutions Ltd is disclosed as a payment agent rather than the casino operator.`, [
        claim('Moon Technologies B.V. is the named operator and mProcessing Solutions Ltd is a payment agent.', [sid(bitcasino, 'licence'), sid(bitcasino, 'terms')], 'Current operator disclosures.'),
        claim('Provable-fair verification is documented for Bitcasino Originals, not the entire game catalogue.', [sid(bitcasino, 'fairness')], 'Current fairness page scope.'),
      ]),
      what_happened: section(`Bitcasino says it has operated as a Bitcoin casino since 2014. Yolo Group’s 2023 reorganization kept Bitcasino in its business-to-consumer entertainment division, separate from platform and investment businesses. The current regulator certificate names Moon Technologies B.V., licence OGL/2023/111/0069 and an active status; the licence began July 1, 2024. The site continues to publish account, reward and fairness documentation. That record supports a long-running active product, but it does not provide a continuous user, wager, revenue or reserve series for the claimed period.`, [
        claim('Bitcasino self-reports operation since 2014 and remained part of Yolo Entertainment in 2023.', [sid(bitcasino, 'history'), sid(bitcasino, 'group')], 'Operator and group lifecycle records.'),
        claim('The regulator certificate reports an active Curaçao licence for bitcasino.io.', [sid(bitcasino, 'cga')], 'Current independent regulator certificate.'),
      ]),
      why_this_outcome: section(`Bitcasino’s longevity is consistent with an early crypto-casino position, a familiar account-based experience, a large group’s distribution and repeated bonus and loyalty mechanics. Those choices can reduce wallet friction and encourage return visits. They also make customers dependent on operator custody, identity checks and withdrawal rules. The public record does not isolate which product feature drove retention, nor does it disclose acquisition cost, game margins, bonus cost or customer cohorts. The “established” call therefore describes continuity and infrastructure, not proof of superior economics or customer outcomes.`, [
        claim('Account-based crypto deposits, rewards and group distribution plausibly reduce customer friction and support repeat use.', [sid(bitcasino, 'terms'), sid(bitcasino, 'rewards'), sid(bitcasino, 'group')], 'Observed product design used for a bounded inference.', { kind: 'inference', confidence: 'medium' }),
        claim('Retention and bonus-adjusted economics are not established by the reviewed record.', [sid(bitcasino, 'rewards'), sid(bitcasino, 'terms'), sid(bitcasino, 'cga')], 'Public disclosure limits.', { kind: 'unknown' }),
      ]),
      strategic_choices: section(`Bitcasino chose a conventional custodial account rather than a wallet-only betting protocol, letting one login handle many games and assets. It used cryptocurrency as a deposit and withdrawal rail, not as proof that every wager settles onchain. It built loyalty points and promotions into the account system without launching a verified native token in the reviewed record. It also kept the consumer casino distinct from Yolo Group’s B2B platform arm. These choices simplify the mainstream customer journey and cross-selling, while concentrating custody, compliance, supplier and withdrawal responsibility in the operator.`, [
        claim('Bitcasino uses custodial accounts, cryptocurrency payment rails and an internal loyalty system.', [sid(bitcasino, 'terms'), sid(bitcasino, 'rewards')], 'Current account and reward mechanics.'),
        claim('Yolo Group separates Bitcasino’s B2C business from its platform business.', [sid(bitcasino, 'group')], 'Group structure announcement.'),
      ]),
      operating_model: section(`A customer registers, passes required checks, deposits supported value and plays through Bitcasino’s account. Moon Technologies controls account access, balances, bonuses and withdrawal review. Terms permit identity and source-of-funds checks and give the operator discretion over processing very large withdrawals in weekly installments. Game suppliers provide much of the catalogue; Bitcasino Originals use the documented seed-and-commitment check. This is a centralized casino with crypto rails, not a permissionless smart-contract casino, and the operator remains the customer’s counterparty for balances and support.`, [
        claim('The operator controls account verification, bonuses and withdrawal processing.', [sid(bitcasino, 'terms'), sid(bitcasino, 'rewards')], 'Current account and bonus terms.'),
        claim('Bitcasino Originals expose a seed-based verification process for covered games.', [sid(bitcasino, 'fairness')], 'Current product-specific fairness guide.'),
      ]),
      token_and_value_capture: section(`No Bitcasino-native crypto token was verified. Customers may deposit and withdraw supported crypto, but those assets are payment rails and customer balances, not ownership in the casino. Loyalty points and rewards are account benefits governed by promotion terms; they are not onchain claims on company cash flow. The likely business value capture is the casino margin after player winnings, supplier costs, bonuses, operations and compliance, but no comparable gross or net gaming revenue series is public. Crypto balances, loyalty points and Yolo Group ownership must remain separate in analysis.`, [
        claim('The current rewards system uses account promotions and loyalty points rather than a verified native token.', [sid(bitcasino, 'rewards'), sid(bitcasino, 'terms')], 'Current rewards and account documentation.'),
        claim('No public source reviewed establishes token-holder rights or current casino revenue.', [sid(bitcasino, 'licence'), sid(bitcasino, 'group'), sid(bitcasino, 'rewards')], 'Operator, group and reward disclosures.', { kind: 'unknown' }),
      ]),
      counterfactual: section(`A noncustodial smart-contract design could reduce operator custody, while limiting game suppliers and adding wallet and contract risk. A native token might fund acquisition or align rewards, while introducing emissions, market and regulatory risk that Bitcasino currently avoids. Publishing independently reconciled liabilities and reserves could strengthen customer trust without changing the game model. Focusing only on proprietary provably fair games could simplify verification, while narrowing the catalogue. No reviewed evidence measures how any of these alternatives would affect retention, margin or customer protection.`, [
        claim('Noncustodial, tokenized and proprietary-game alternatives change real custody and distribution trade-offs.', [sid(bitcasino, 'terms'), sid(bitcasino, 'fairness'), sid(bitcasino, 'rewards')], 'Current design used as the comparison.', { kind: 'inference', confidence: 'low' }),
        claim('No source provides a causal estimate for those alternatives.', [sid(bitcasino, 'terms'), sid(bitcasino, 'group')], 'No published controlled comparison.', { kind: 'unknown' }),
      ]),
      risks_and_unknowns: section(`Customers face operator custody, account closure, KYC, bonus restriction and withdrawal-timing risk. Terms allow additional review and discretionary processing for very large withdrawals. The Swiss regulator lists bitcasino.io among blocked domains, with an initial date of August 18, 2020; that is a Swiss access decision, not a statement about every market. “Provably fair” covers only documented Originals and does not prove operator solvency. Current users, wagers, margins, reserves, liabilities, withdrawal completion, supplier concentration and security incidents remain unverified.`, [
        claim('Custody, eligibility and withdrawal controls are material customer dependencies.', [sid(bitcasino, 'terms')], 'Current terms and withdrawal provisions.'),
        claim('Swiss blocking and product-specific fairness must not be generalized beyond their stated scope.', [sid(bitcasino, 'swiss-blocklist'), sid(bitcasino, 'fairness')], 'Jurisdiction and game-scope boundaries.'),
      ]),
      lifecycle: section(`Bitcasino dates its origin to 2014. Yolo Group’s 2023 reorganization preserved it as a consumer casino brand, and the Curaçao certificate records a licence start on July 1, 2024. On August 3, 2026, the site still published active customer terms, rewards and fairness material and the certificate remained active. Switzerland’s blocklist shows that longevity has not removed jurisdiction risk. The lifecycle is established and operating, based on current product and licence continuity; profitability, solvency, user retention and the quality of withdrawals are still ungraded.`, [
        claim('Operator, group and licence records provide dated continuity from the claimed 2014 origin through 2026.', [sid(bitcasino, 'history'), sid(bitcasino, 'group'), sid(bitcasino, 'cga')], 'Dated lifecycle records.'),
        claim('Current operation does not resolve profitability, reserves or customer outcomes.', [sid(bitcasino, 'terms'), sid(bitcasino, 'cga')], 'Measurement boundary.', { kind: 'inference', confidence: 'high' }),
      ]),
      outlook_and_watch: section(`The base case is continued operation as an established custodial crypto casino. An upgrade in confidence requires recurring active-customer and wager data, independently reconcilable liabilities and reserves, timely withdrawal completion and economics after bonuses. Downside signals include licence changes, more market blocks, repeated withdrawal delays, declining retention or supplier loss. Watch the Curaçao certificate, terms, Swiss and other regulator lists, active and retained customers, wagers by game type, bonus cost, gross and net gaming revenue, customer liabilities, reserve attestations, withdrawal times and the scope of provable-fair games.`, [
        claim('Current product and licence continuity support a continued-operation base case.', [sid(bitcasino, 'terms'), sid(bitcasino, 'cga')], 'Current customer and regulator records.', { kind: 'inference', confidence: 'medium' }),
        claim('Retention, economics, reserves and withdrawal completion are the decisive missing signals.', [sid(bitcasino, 'terms'), sid(bitcasino, 'rewards')], 'Known custodial and promotional dependencies.', { kind: 'unknown' }),
      ]),
    },
    metrics: [],
    events: [
      event('operator-reported-launch', 'launch', '2014-01-01', 'Bitcasino reports that it has operated as a Bitcoin casino since 2014.', [sid(bitcasino, 'history')], 'Current operator history page.', 'year'),
      event('licence-start', 'licence', '2024-07-01', 'The Curaçao regulator certificate records the licence start for Moon Technologies B.V.', [sid(bitcasino, 'cga')], 'Current regulator certificate.'),
      event('current-active-certificate', 'operating_observation', AS_OF, 'Customer documentation remained live and the Curaçao certificate reported active status.', [sid(bitcasino, 'terms'), sid(bitcasino, 'cga')], 'Current product and regulator observations.'),
    ],
  },
  {
    slug: augur,
    name: 'Augur protocol reboot',
    aliases: ['Augur', 'Lituus', 'Moon Fork'],
    classification: {
      subtype: 'decentralized prediction-market and oracle protocol',
      tags: ['prediction_market', 'oracle', 'protocol_reboot', 'token_migration'],
      chains: ['Ethereum'],
      jurisdictions: [],
    },
    operatingState: 'active_rebuild_migration_result_unresolved',
    statusConfidence: 'high',
    statusSources: [sid(augur, 'current'), sid(augur, 'reboot-repo'), sid(augur, 'lituus-repo')],
    statusLocator: 'Official updates and repositories show active reboot engineering; production adoption and token-migration completion are separate unresolved questions.',
    outcome: 'recovering_development_adoption_unproven',
    outcomeConfidence: 'medium',
    outcomeSources: [sid(augur, 'current'), sid(augur, 'forkwatch'), sid(augur, 'reboot-repo'), sid(augur, 'kraken')],
    outcomeLocator: 'Development and the test fork are active, but ForkWatch did not expose a usable completion figure and no current adoption series was found.',
    qualityConfidence: 'high',
    sources: augurSources,
    identityBoundary: 'The profile separates the Augur protocol and REP/AUGUR universes, the Lituus Foundation stewardship effort, ChainSafe implementation work, Zoltar as a separate product track, independent frontends and custodians such as Kraken.',
    metricBoundary: 'No current verified users, market count, open interest, liquidity, settled volume, fees, protocol revenue, migrated REP share or production reliability series was available. A zero countdown is not a zero or complete migration measurement.',
    unknowns: ['REP migration completion and supply by universe', 'current production markets and users', 'open interest and settled volume', 'liquidity and fees', 'production oracle reliability', 'frontend and market-creator adoption', 'jurisdiction-specific operators and legal access', 'custody outside named exchanges'],
    unsourcedFields: ['migration_completion', 'supply_by_universe', 'active_markets', 'active_users', 'open_interest', 'settled_volume', 'liquidity', 'fees', 'oracle_reliability', 'frontend_adoption', 'legal_access', 'custody'],
    methodologyNotes: [
      'Repository activity proves current engineering, not production readiness or commercial adoption.',
      'The August 1 deadline passed before review, but the official FAQ remained pre-deadline and ForkWatch did not provide a usable completion value.',
      'Kraken’s custodial conversion applies only to balances it supported and is not treated as total migration evidence.',
    ],
    sections: {
      what_it_is: section(`Augur is an Ethereum prediction-market and oracle protocol originally designed so market outcomes could be reported and disputed using REP. Its 2026 reboot uses a deliberately triggered “Moon Fork” to test the dispute system and move reputation into a selected universe before a new ChainSafe implementation called Lituus. The Lituus Foundation coordinates this recovery effort, but it is not automatically the operator of every future frontend or market. Zoltar is a separate product track. Custodians such as Kraken control only their own customers’ migration process.`, [
        claim('Augur’s core design links prediction markets to REP-based reporting and dispute resolution.', [sid(augur, 'whitepaper'), sid(augur, 'faq')], 'Original protocol paper and current fork FAQ.'),
        claim('Lituus, the Moon Fork, Zoltar and third-party custodians are distinct parts of the reboot.', [sid(augur, 'current'), sid(augur, 'kraken')], 'Current official update and custodian notice.'),
      ]),
      what_happened: section(`Augur launched its original mainnet in 2018 and later lost normal product momentum. In April 2026, the Lituus Foundation intentionally triggered a fork to test the mechanism and coordinate a reboot. Phase two opened a one-way token-migration window with an August 1 deadline. That date had passed by this August 3 review. ForkWatch showed a zero countdown but its migration-progress field remained unavailable, while Kraken separately said it expected to convert supported customer balances 1:1 to AUGUR by July 31. Official repositories were still active on August 3, so development is live while the migration result remains unresolved.`, [
        claim('The 2026 reboot deliberately triggered a fork and opened a time-limited one-way migration.', [sid(augur, 'fork'), sid(augur, 'migration'), sid(augur, 'faq')], 'Dated official reboot notices.'),
        claim('Development continued after the deadline, but a usable total migration result was not available.', [sid(augur, 'forkwatch'), sid(augur, 'reboot-repo'), sid(augur, 'lituus-repo')], 'Current dashboard and repository observations.', { kind: 'unknown' }),
      ]),
      why_this_outcome: section(`The reboot exists because Augur preserved technically distinctive oracle and dispute machinery but did not preserve a clearly active consumer market. The foundation chose to test the hardest mechanism in public, coordinate old REP holders and fund a fresh implementation. That can recover developer confidence and reveal protocol failures before a broader launch. It does not create traders, liquidity or market creators by itself. The reviewed sources do not provide a verified postmortem for the earlier decline, so user friction, liquidity, regulation, competition, execution cost and product design remain candidate factors rather than findings.`, [
        claim('The reboot prioritizes testing the fork and rebuilding the oracle implementation before claiming broad revival.', [sid(augur, 'current'), sid(augur, 'fork'), sid(augur, 'lituus-repo')], 'Current program sequence.', { kind: 'inference', confidence: 'high' }),
        claim('No reviewed source establishes one binding cause for Augur’s earlier loss of adoption.', [sid(augur, 'current'), sid(augur, 'whitepaper')], 'Current update and original thesis without a causal postmortem.', { kind: 'unknown' }),
      ]),
      strategic_choices: section(`Augur chose a permissionless prediction-market oracle with REP-based disputes instead of a centralized resolution desk. For the reboot, it chose a live fork test and a one-way, deadline-driven migration, forcing holders to select a universe rather than carrying every token forward automatically. It engaged ChainSafe on a new implementation and kept Zoltar as a separate exploration. These choices favor credible testing and protocol independence, but create coordination, custody and stranded-token risk. They also leave customer distribution to future frontends and market creators rather than solving it inside the oracle alone.`, [
        claim('REP-based disputes, a live fork test and one-way universe migration are deliberate protocol choices.', [sid(augur, 'whitepaper'), sid(augur, 'fork'), sid(augur, 'migration')], 'Original design and current reboot mechanics.'),
        claim('ChainSafe implementation work and the separate Zoltar track divide core-protocol and product exploration.', [sid(augur, 'current'), sid(augur, 'lituus-repo')], 'Current official update and repository.'),
      ]),
      operating_model: section(`Historically, users created or traded prediction markets while designated participants reported outcomes and REP holders could dispute them. The 2026 fork creates multiple universes, and REP can move only one way into a chosen universe before the stated deadline. Lituus is the new implementation workstream; the Moon Fork is the test and coordination event; a frontend would still need to provide markets, trading and customer support. Self-custodied holders handle their own migration, while an exchange such as Kraken may migrate balances it custodies under its own process. Current production market and settlement service levels are not established.`, [
        claim('The fork uses universe-specific REP and one-way migration to coordinate consensus.', [sid(augur, 'fork'), sid(augur, 'faq')], 'Current fork mechanics.'),
        claim('Kraken’s 1:1 conversion plan is limited to supported custodial balances.', [sid(augur, 'kraken')], 'Independent custodian notice.'),
      ]),
      token_and_value_capture: section(`REP historically supported reporting and dispute participation rather than representing equity in a casino operator. During the 2026 fork, old REP and REPV2 holders had to move to a universe-specific token, and the selected canonical asset is described as AUGUR. Kraken expected a 1:1 conversion for eligible balances on its platform, but that does not measure self-custodied or other-exchange migration. The August 1 deadline creates stranded-token risk. No current source establishes total migrated supply, token concentration, protocol fees, treasury income, holder cash distributions or an enforceable claim on future products.`, [
        claim('The reboot uses one-way migration into universe-specific reputation and identifies AUGUR for the selected outcome.', [sid(augur, 'migration'), sid(augur, 'faq'), sid(augur, 'kraken')], 'Official migration rules and custodian handling.'),
        claim('Total migrated supply, token concentration and current value capture remain unverified.', [sid(augur, 'forkwatch'), sid(augur, 'current')], 'Unavailable completion data and no current economic series.', { kind: 'unknown' }),
      ]),
      counterfactual: section(`An automatic token migration could reduce stranded-holder risk, while weakening the fork’s need for active universe selection. A centralized oracle could settle markets faster and simplify support, while reintroducing trusted control. Launching a polished consumer frontend before the oracle rebuild might attract users earlier, but could expose them to unresolved protocol risk. Using external prediction-market liquidity could reduce the cold start, while giving up independence. No reviewed evidence estimates those alternatives; the current program deliberately favors mechanism testing before a commercial recovery claim.`, [
        claim('Automatic migration, centralized resolution and product-first launches offer different coordination and trust trade-offs.', [sid(augur, 'fork'), sid(augur, 'migration'), sid(augur, 'current')], 'Current reboot design used as comparison.', { kind: 'inference', confidence: 'low' }),
        claim('No source demonstrates that an alternative would have restored Augur adoption.', [sid(augur, 'current'), sid(augur, 'whitepaper')], 'No causal comparison.', { kind: 'unknown' }),
      ]),
      risks_and_unknowns: section(`The immediate risk is migration uncertainty. The deadline passed, the FAQ still used pre-deadline language and ForkWatch did not expose a usable completion number. Some holders may have relied on custodians, while self-custodied holders bore their own execution risk. The rebuild also faces contract, oracle, dispute, governance, frontend and market-liquidity risk. A public repository can be active while production has no users. Current markets, traders, open interest, fees, liquidity, migrated supply, production reliability, legal operators and jurisdiction-specific access are unknown.`, [
        claim('Post-deadline migration completion could not be verified from the official dashboard.', [sid(augur, 'faq'), sid(augur, 'forkwatch')], 'Stale FAQ state and unavailable progress.', { kind: 'unknown' }),
        claim('Active code does not establish production adoption, liquidity or oracle reliability.', [sid(augur, 'reboot-repo'), sid(augur, 'lituus-repo'), sid(augur, 'current')], 'Engineering-versus-market boundary.', { kind: 'inference', confidence: 'high' }),
      ]),
      lifecycle: section(`Augur published its original protocol paper in January 2015 and launched mainnet in 2018. After the original market lost momentum, the Lituus Foundation triggered the Moon Fork on April 8, 2026, opened phase-two migration in June and set August 1 as the deadline. On July 21 it reported that the fork was live and ChainSafe implementation work continued. By August 3, the reboot repository had fresh activity, but ForkWatch did not reveal a completed migration share or a commercial market. The lifecycle is therefore an active technical recovery with adoption and migration outcome unproven.`, [
        claim('The original paper, 2018 launch and 2026 reboot provide distinct lifecycle stages.', [sid(augur, 'whitepaper'), sid(augur, 'current'), sid(augur, 'fork')], 'Dated protocol and reboot records.'),
        claim('August 2026 evidence supports active recovery work, not a completed commercial recovery.', [sid(augur, 'forkwatch'), sid(augur, 'reboot-repo'), sid(augur, 'lituus-repo')], 'Current dashboard and engineering evidence.', { kind: 'inference', confidence: 'high' }),
      ]),
      outlook_and_watch: section(`The base case is continued engineering and post-fork cleanup, with commercial recovery still unproven. An upgrade requires a reconciled migration report, stable production contracts, active frontends, repeated market creation and settlement, growing traders, open interest and liquidity, and transparent dispute outcomes. Downside would be unresolved migration, stalled implementation, another long product gap or no market-maker adoption. Watch ForkWatch and formal migration reports, audited contract releases, repository milestones, active markets, traders, settled volume, open interest, liquidity, oracle disputes, REP/AUGUR supply by universe, frontend operators and jurisdiction-specific terms.`, [
        claim('Current engineering supports continued recovery work but not a demand forecast.', [sid(augur, 'current'), sid(augur, 'reboot-repo'), sid(augur, 'lituus-repo')], 'Current program and repository state.', { kind: 'inference', confidence: 'medium' }),
        claim('Migration reconciliation, production reliability and repeated market activity are required to call the reboot successful.', [sid(augur, 'forkwatch'), sid(augur, 'faq'), sid(augur, 'current')], 'Current unresolved milestones.', { kind: 'inference', confidence: 'high' }),
      ]),
    },
    metrics: [],
    events: [
      event('original-paper', 'protocol_publication', '2015-01-05', 'Augur published its original prediction-market and oracle paper.', [sid(augur, 'whitepaper')], 'Dated arXiv record.'),
      event('mainnet-launch', 'launch', '2018-01-01', 'Augur reports that its original mainnet launched in 2018.', [sid(augur, 'current')], 'Current official lifecycle update.', 'year'),
      event('moon-fork-trigger', 'protocol_fork', '2026-04-08', 'The Lituus Foundation triggered the Moon Fork test.', [sid(augur, 'fork')], 'Official next-day fork announcement.'),
      event('migration-deadline', 'token_migration_deadline', '2026-08-01', 'The stated one-way token-migration deadline passed; total completion remained unresolved.', [sid(augur, 'faq'), sid(augur, 'forkwatch')], 'Official FAQ deadline and current dashboard observation.'),
      event('active-development', 'development_observation', AS_OF, 'Official repositories showed current reboot and Lituus implementation activity.', [sid(augur, 'reboot-repo'), sid(augur, 'lituus-repo')], 'Current repository observations.'),
    ],
  },
];

export const document = {
  schema: 'chaindump-casino-wave-b-v1',
  version: 1,
  research_as_of: AS_OF,
  researched_at: ACCESSED_AT,
  generated_migration: '0090_casino_wave_b_profiles.sql',
  scope_note: 'Five existing Web3 casino records upgraded to the shared ten-section canonical profile. Every claim awaits human review. Frontend, operator, protocol, chain, custody, token, jurisdiction, volume, revenue and solvency boundaries remain separate.',
  cases: specs.map((spec) => ({ slug: spec.slug, canonical_profile: buildProfile(spec) })),
};

export function renderMigration(value = document) {
  const rows = value.cases.map(({ slug, canonical_profile: profile }) => {
    const payload = JSON.stringify(profile).replaceAll("'", "''");
    return `INSERT INTO _casino_wave_b_profiles_0090 (case_id, canonical_profile) VALUES ('${slug}', '${payload}');`;
  });
  const sql = `-- Canonical Web3 casino profile wave B, researched 2026-08-03 and awaiting human review.
-- Legacy synthesis fields remain intact; only outlook.canonical_profile is replaced.

DROP TABLE IF EXISTS _casino_wave_b_profiles_0090;

CREATE TABLE _casino_wave_b_profiles_0090 (
  case_id TEXT PRIMARY KEY,
  canonical_profile TEXT NOT NULL CHECK (json_valid(canonical_profile))
);

${rows.join('\n\n')}

UPDATE casino_syntheses AS synthesis
SET outlook = json_set(
  COALESCE(synthesis.outlook, '{}'),
  '$.canonical_profile', json(staged.canonical_profile)
)
FROM _casino_wave_b_profiles_0090 AS staged
WHERE synthesis.case_id = staged.case_id;

DROP TABLE _casino_wave_b_profiles_0090;
`;
  const statements = sql.split(/;\s*(?:\n|$)/).filter(Boolean);
  const largest = Math.max(...statements.map((statement) => Buffer.byteLength(statement, 'utf8')));
  if (largest > MAX_D1_STATEMENT_BYTES) throw new Error(`D1 statement is ${largest} bytes`);
  return sql;
}

function writeOutputs() {
  writeFileSync(artifactPath, `${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(migrationPath, renderMigration(document));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) writeOutputs();

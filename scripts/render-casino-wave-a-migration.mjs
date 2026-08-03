#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYSIS_SECTION_KEYS, validateEntityProfile } from '../src/lib/entity-profile.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(root, 'docs/casino-wave-a-profiles-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0087_casino_wave_a_profiles.sql');
const AS_OF = '2026-08-03';
const ACCESSED_AT = '2026-08-03T19:31:32Z';
const NEXT_REVIEW_AT = '2026-08-10T19:31:32Z';
const MAX_D1_STATEMENT_BYTES = 95_000;

const sid = (slug, key) => `source:${slug}:${key}`;

function source(slug, key, title, url, publisher, {
  publishedAt = null,
  tier = 'B',
  role = 'primary',
  locator = 'The reviewed page and its product-specific text.',
} = {}) {
  return {
    id: sid(slug, key),
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
  window = 'point_in_time', scope = {}, qualityFlags = [],
  locator = 'Provider response retrieved and frozen in the research artifact.',
} = {}) {
  return {
    key, dimension, label, value, source_ids: sourceIds, method,
    unit, currency, as_of: asOf,
    window: { start: null, end: asOf, definition: window },
    scope, quality_flags: qualityFlags, evidence_locator: locator,
  };
}

function event(key, type, date, description, sourceIds, locator, datePrecision = 'day') {
  return { key, type, date, description, source_ids: sourceIds, evidence_locator: locator, date_precision: datePrecision };
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
      id, type: item.type, date: item.date, description: item.description,
      claim_ids: [claimId], date_precision: item.date_precision,
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

const poker = 'decentral-games-poker-arcade';
const pokerSources = [
  source(poker, 'product', 'Poker Arcade', 'https://docs.decentral.games/games/poker-arcade', 'Decentral Games', { locator: 'Current product overview describes browser play, Free Play, Arcade Mode, levels and prizes.' }),
  source(poker, 'arcade-mode', 'Arcade Mode', 'https://docs.decentral.games/games/poker-arcade/arcade-mode', 'Decentral Games', { locator: 'Arcade Mode page documents six-player SNGs, USDT ticket packs, badges and prize redemption.' }),
  source(poker, 'terms', 'Poker Arcade Terms of Use', 'https://docs.decentral.games/legal/terms-of-use', 'BAG Limited, LTD', { publishedAt: '2024-06-30', tier: 'A', locator: 'Terms identify BAG Limited, the Poker Arcade product, Polygon contracts, Tickets, Badges and governing-law scope.' }),
  source(poker, 'ice-transition', 'ICE Poker', 'https://ice.decentral.games/', 'Decentral Games', { publishedAt: '2024-04-29', locator: 'Official transition notice says ICE Poker became Poker Arcade on 2024-04-29.' }),
  source(poker, 'dg-token', 'DG (Old)', 'https://docs.decentral.games/tokens/dg-old', 'Decentral Games', { locator: 'Token documentation says DG, xDG and ICE migrate to BAG.' }),
  source(poker, 'wearables', 'Wearable Rewards', 'https://docs.decentral.games/wearables/wearable-rewards', 'Decentral Games', { locator: 'Current rewards page distinguishes Poker Arcade Tickets from Bag.win cash-poker pot bonuses.' }),
  source(poker, 'disclaimer', 'Notice and Disclaimer', 'https://docs.decentral.games/legal/disclaimer', 'Decentral Games', { tier: 'A', locator: 'Disclaimer limits regulatory and BAG-value claims and describes service interruption risk.' }),
  source(poker, 'study', 'Dressed to Gamble: How Poker Drives the Dynamics of Wearables and Visits on Decentraland', 'https://arxiv.org/abs/2407.15625', 'Trujillo, Bacciu and Abrate', { publishedAt: '2024-07-22', tier: 'A', role: 'independent', locator: 'Independent study measures historical ICE Poker visits and wearable transfers and documents the Arcade pivot.' }),
];

const overtime = 'overtime';
const overtimeSources = [
  source(overtime, 'product', 'What is Overtime?', 'https://docs.overtime.io/', 'Overtime DAO', { locator: 'Current documentation describes the sportsbook, wallet flow, smart contracts and oracle dependencies.' }),
  source(overtime, 'how', 'How Overtime Works', 'https://docs.overtime.io/learn-about-overtime/how-overtime-works', 'Overtime DAO', { locator: 'Current architecture describes pool-versus-peer liquidity and deployed networks.' }),
  source(overtime, 'amm', 'Overtime AMM and Liquidity Mechanics', 'https://docs.overtime.io/learn-about-overtime/overtime-amm-and-liquidity-mechanics', 'Overtime DAO', { locator: 'Current AMM page documents risk caps, LP exposure and OVER collateral incentives.' }),
  source(overtime, 'lp', 'Providing Liquidity to Overtime', 'https://docs.overtime.io/learn-about-overtime/providing-liquidity-to-overtime', 'Overtime DAO', { locator: 'LP guide describes seven-day rounds, loss exposure, supported collateral and withdrawal timing.' }),
  source(overtime, 'governance', 'Overtime Governance', 'https://docs.overtime.io/learn-about-overtime/overtime-governance', 'Overtime DAO', { locator: 'Governance page describes elected council epochs and OIP contract changes.' }),
  source(overtime, 'history', 'History of Overtime', 'https://docs.overtime.io/learn-about-overtime/history-of-overtime', 'Overtime DAO', { locator: 'History explains the Thales origin, L1/orderbook limits and V2 Merkle architecture pivot.' }),
  source(overtime, 'terms', 'Terms of Use', 'https://docs.overtime.io/resources/terms-of-use', 'Overtime DAO', { tier: 'A', locator: 'Terms list prohibited jurisdictions and state that no developer or entity supplies a universal licence.' }),
  source(overtime, 'llama-tvl', 'Overtime protocol TVL API', 'https://api.llama.fi/protocol/overtime', 'DefiLlama', { role: 'aggregator', locator: 'API snapshot returned current protocol liquidity and chain allocations.' }),
  source(overtime, 'llama-fees', 'Overtime fee API', 'https://api.llama.fi/summary/fees/overtime?dataType=dailyFees', 'DefiLlama', { role: 'aggregator', locator: 'API snapshot returned rolling fee totals and its AMM/LP-fee methodology.' }),
];

const sx = 'sx-bet';
const sxSources = [
  source(sx, 'terms', 'Terms and Conditions', 'https://help.sx.bet/en/articles/3613372-terms-and-conditions', 'SX Bet / CRGC Management Ltd', { publishedAt: '2026-05-15', tier: 'A', locator: 'Current terms identify the service provider, licence claim, restrictions, token sunset and credit terms.' }),
  source(sx, 'protocol', 'What is SX Bet?', 'https://docs.sx.bet/developers/what-is-sx-bet', 'SX Bet', { publishedAt: '2026-03-27', locator: 'Developer docs explain maker/taker orders, escrow, onchain reporting and USDC wagering.' }),
  source(sx, 'overview', 'Introduction and Overview', 'https://help.sx.bet/en/articles/4037276-introduction-and-overview', 'SX Bet', { publishedAt: '2026-03-02', locator: 'Overview describes the peer-to-peer model and protocol controls without validating marketing superlatives.' }),
  source(sx, 'fees', 'Fees', 'https://docs.sx.bet/user-guides/trading/fees', 'SX Bet', { publishedAt: '2026-03-24', locator: 'Fee guide documents zero single-bet fees, 5% winning-parlay fees and historical SX gas use.' }),
  source(sx, 'parlays', 'Peer-to-Peer Parlays', 'https://help.sx.bet/en/articles/13919339-peer-to-peer-parlays', 'SX Bet', { publishedAt: '2026-03-03', locator: 'Parlay guide documents peer orders, ten-leg limit and 5% winning-parlay fee.' }),
  source(sx, 'news', 'SX Bet News', 'https://blog.sx.bet/news/', 'SX Bet', { locator: 'Current news index lists the token sunset and new gasless infrastructure plan.' }),
  source(sx, 'llama-volume', 'SX Bet matched-volume API', 'https://api.llama.fi/summary/dexs/sx-bet?dataType=dailyVolume', 'DefiLlama', { role: 'aggregator', locator: 'API snapshot returned matched-bet volume from the protocol analytics adapter.' }),
  source(sx, 'llama-fees', 'SX Bet fee API', 'https://api.llama.fi/summary/fees/sx-bet?dataType=dailyFees', 'DefiLlama', { role: 'aggregator', locator: 'API snapshot returned parlay-fee estimates and historical token-distribution methodology.' }),
  source(sx, 'anjouan-context', 'How France’s lottery operator fuels the toxic online casino ecosystem in the Comoros', 'https://www.lemonde.fr/en/les-decodeurs/article/2026/02/04/how-france-s-lottery-operator-fuels-the-toxic-online-casino-ecosystem-in-the-comoros_6750148_8.html', 'Le Monde', { publishedAt: '2026-02-04', tier: 'A', role: 'independent', locator: 'Independent reporting challenges the Anjouan licensing system generally; it is not an SX-specific finding.' }),
];

const azuro = 'azuro';
const azuroSources = [
  source(azuro, 'intro', 'What Is Azuro?', 'https://gem.azuro.org/knowledge-hub/introduction/what-is-azuro', 'Azuro DAO', { locator: 'Architecture page distinguishes protocol, SDK, DAO, applications and singleton liquidity.' }),
  source(azuro, 'lp', 'Liquidity Providers', 'https://gem.azuro.org/knowledge-hub/how-azuro-works/protocol-actors/liquidity-providers', 'Azuro DAO', { locator: 'LP guide describes pool-wide market exposure and warns of possible negative returns.' }),
  source(azuro, 'apps', 'Apps (Frontends)', 'https://gem.azuro.org/knowledge-hub/how-azuro-works/protocol-actors/apps', 'Azuro DAO', { locator: 'App guide says frontends are separate entities with their own legal responsibilities.' }),
  source(azuro, 'data', 'Data Providers', 'https://gem.azuro.org/knowledge-hub/how-azuro-works/protocol-actors/data-providers', 'Azuro DAO', { locator: 'Data-provider guide documents creation, repricing and resolution responsibilities.' }),
  source(azuro, 'tokenomics', 'AZUR Tokenomics', 'https://gem.azuro.org/knowledge-hub/azur/tokenomics', 'Azuro DAO', { locator: 'Token page documents contract, one-billion supply and allocation/vesting design.' }),
  source(azuro, 'pazur', 'pAZUR', 'https://gem.azuro.org/knowledge-hub/azur/p-azur', 'Azuro DAO', { locator: 'pAZUR page documents two-year locking and conditional USDT distributions without guaranteed returns.' }),
  source(azuro, 'terms', 'Terms of Use', 'https://gem.azuro.org/terms-of-use', 'Azuro DAO', { tier: 'A', locator: 'Terms distinguish the DAO interface from transactions and restrict countries including the United States.' }),
  source(azuro, 'privacy', 'Privacy Policy', 'https://gem.azuro.org/privacy-policy', 'Azuro Ltd.', { tier: 'A', locator: 'Privacy policy identifies Azuro Ltd. in Seychelles for website data processing; it is not a gaming licence.' }),
  source(azuro, 'v3', 'Azuro V3 is here', 'https://gem.azuro.org/hub/releases/27-protocol-v3', 'Azuro DAO', { locator: 'Release notice documents the forced V2-to-V3 application migration and May 8 stop.' }),
  source(azuro, 'llama-tvl', 'Azuro protocol TVL API', 'https://api.llama.fi/protocol/azuro', 'DefiLlama', { role: 'aggregator', locator: 'API snapshot returned current tracked liquidity by chain.' }),
  source(azuro, 'llama-fees', 'Azuro pool-result API', 'https://api.llama.fi/summary/fees/azuro?dataType=dailyFees', 'DefiLlama', { role: 'aggregator', locator: 'API snapshot returned rolling pool profit/loss under DefiLlama fee and revenue labels.' }),
];

const purebet = 'purebet-solana-exchange';
const purebetSources = [
  source(purebet, 'home', 'Purebet — Decentralized Sports Betting on Solana', 'https://purebet.io/', 'Purebet', { locator: 'Current official homepage states that Purebet is hibernating.' }),
  source(purebet, 'how', 'How Purebet works', 'https://purebet.medium.com/how-purebet-works-61fc02d1dda9', 'Purebet', { publishedAt: '2022-12-15', locator: 'Official article explains the exchange, cross-protocol routing, wallet settlement and USDC use.' }),
  source(purebet, 'promotion', 'Phase 1 Completion Celebration Promotion', 'https://docs.purebet.io/promotion-terms/phase-1-completion-celebration-promotion-07-04-23', 'Purebet', { publishedAt: '2023-04-07', locator: 'Historical promotion documents Solana wallet proofs and cross-protocol user acquisition.' }),
  source(purebet, 'docs', 'Purebet API and SDK', 'https://docs.purebet.io/', 'Purebet', { locator: 'Legacy developer endpoint remains reachable; reachability does not prove active maintenance.' }),
  source(purebet, 'medium', 'Purebet publication archive', 'https://purebet.medium.com/', 'Purebet', { locator: 'Official publication archive provides historical product material, not current operation.' }),
  source(purebet, 'dappradar', 'Purebet project directory', 'https://dappradar.com/dapp/purebet', 'DappRadar', { role: 'independent', locator: 'Independent directory retains the historical Solana product description and no-token claim; it does not establish current activity.' }),
];

const specs = [
  {
    slug: poker,
    name: 'Decentral Games Poker Arcade',
    aliases: ['Poker Arcade', 'ICE Poker Arcade'],
    classification: { subtype: 'prize poker arcade', tags: ['poker', 'browser_game', 'prize_arcade', 'peer_to_peer'], chains: ['Polygon'], jurisdictions: [] },
    operatingState: 'operator_documented_operating',
    statusConfidence: 'medium',
    statusSources: [sid(poker, 'product'), sid(poker, 'arcade-mode')],
    statusLocator: 'Current documentation links to play and describes live game modes; direct table activity and concurrent players were not independently measured.',
    statusNote: 'Operator-documented status; direct playability and current player density remain unverified.',
    outcome: 'operating_unclassified',
    outcomeConfidence: 'medium',
    outcomeSources: [sid(poker, 'product'), sid(poker, 'ice-transition'), sid(poker, 'study')],
    outcomeLocator: 'A documented live successor and important historical usage, without current tables, retention, prize cost or revenue data.',
    qualityConfidence: 'medium',
    sources: pokerSources,
    identityBoundary: 'This profile covers Poker Arcade only. It is not Bag.win, not the Decentraland Casino, and not every Decentral Games product or token surface.',
    metricBoundary: 'Ticket prices and historical ICE Poker visits are product context, not current wagers, active Poker Arcade users, revenue, prize liabilities or solvency.',
    unknowns: ['current concurrent players and active tables', 'hands and tournaments per day', 'ticket sales and prize cost', 'current product licence and geographic legality', 'current BAG economic contribution to Poker Arcade'],
    unsourcedFields: ['current_active_players', 'current_hands_and_tournaments', 'ticket_sales', 'prize_liabilities', 'gaming_licence', 'product_revenue'],
    methodologyNotes: ['Historical ICE Poker activity is not relabeled as current Poker Arcade usage.', 'Operator language that the game is available worldwide is not treated as proof of legality in every jurisdiction.'],
    sections: {
      what_it_is: section(
        `Poker Arcade is Decentral Games’ browser-based poker product. It offers free-play tables and six-player Sit-and-Go tournaments in which players spend non-transferable Tickets and can earn non-transferable Tournament Badges for prizes. BAG Limited, LTD is the counterparty named in the product terms. The product uses Polygon contracts for Tickets, wearables and related assets, but the reviewed evidence does not show that every card, shuffle or game decision is executed onchain.`,
        [claim('Poker Arcade offers free play and six-player prize tournaments using Tickets and Badges.', [sid(poker, 'product'), sid(poker, 'arcade-mode')], 'Current product and Arcade Mode descriptions.'), claim('BAG Limited is the named terms counterparty and Polygon is the documented chain surface.', [sid(poker, 'terms')], 'Operator identity and chain clauses in the 2024 terms.')],
      ),
      what_happened: section(
        `Decentral Games launched ICE Poker in October 2021 and later added a separate web and mobile Arcade product. An independent study found that historical ICE Poker casinos accounted for a median 33% of daily distinct Decentraland visitors and 20% of time spent during its measurement window, showing that poker once drove meaningful platform attention. The incentive model also faced inflation pressure as players sold earned ICE. On April 29, 2024, the operator retired the ICE Poker name and moved the product to Poker Arcade, replacing token-earning emphasis with free play, Tickets, Badges and physical or USDT prizes.`,
        [claim('ICE Poker produced disproportionate historical Decentraland visits but the study does not measure current Poker Arcade.', [sid(poker, 'study')], 'Independent historical visit and wearable study.', { kind: 'fact' }), claim('The operator transitioned ICE Poker to Poker Arcade on 2024-04-29.', [sid(poker, 'ice-transition')], 'Dated official transition notice.')],
      ),
      why_this_outcome: section(
        `Poker gave Decentral Games a repeat social activity rather than a one-time NFT sale, and wearables supplied identity, access and rewards. That combination helped the old ICE Poker product capture attention inside Decentraland. The same design also tied demand to token incentives, wearable economics and concurrent player density. Poker Arcade’s pivot removes direct play-to-earn claims and lowers the barrier with free play, but it still needs enough simultaneous players to fill tables and enough prize value to make purchased Tickets attractive. Current evidence does not show whether that loop is self-sustaining.`,
        [claim('Historical poker demand and wearable incentives reinforced one another inside Decentraland.', [sid(poker, 'study')], 'Independent measurement and discussion of visits, wearables and rewards.', { kind: 'inference', confidence: 'medium' }), claim('Current commercial durability is unknown because player density, ticket sales and prize cost are not published.', [sid(poker, 'product'), sid(poker, 'arcade-mode')], 'Current mechanics disclose rules but not operating results.', { kind: 'unknown', confidence: 'high' })],
      ),
      strategic_choices: section(
        `The team chose a narrow poker arcade instead of presenting the product as a general online casino. It shifted from ICE play-to-earn toward non-transferable Tickets and Badges, which can reduce token speculation but makes prize funding and retention harder to observe. It also moved play into a normal browser rather than requiring a visit to Decentraland, widening distribution while weakening the original metaverse moat. Finally, it kept Polygon-linked wearables and rewards, preserving asset continuity without proving that blockchain execution improves the poker game itself.`,
        [claim('The April 2024 pivot replaced the ICE Poker identity with Poker Arcade and browser distribution.', [sid(poker, 'ice-transition'), sid(poker, 'product'), sid(poker, 'study')], 'Transition notice, current product page and independent lifecycle history.'), claim('Tickets and Badges are deliberately non-transferable product units rather than open market tokens.', [sid(poker, 'terms'), sid(poker, 'arcade-mode')], 'Terms and Arcade Mode mechanics.')],
      ),
      operating_model: section(
        `Players can enter free tables or buy Ticket packs with USDT on Polygon and spend Tickets to enter six-player Sit-and-Go tournaments. First- and second-place players receive Badges under the published payout schedule, and Badges can be redeemed in a prize shop. Premium wearable holders can also earn Tickets. BAG Limited controls the customer-facing rules, prize catalogue and service layer; smart contracts and player-held NFTs do not remove that operating role. Poker liquidity is social: a table cannot start until enough players arrive, so concurrent demand matters more than a contract-deployment count.`,
        [claim('Arcade Mode sells Ticket packs, starts six-player tables when full and pays Badges under a posted schedule.', [sid(poker, 'arcade-mode')], 'Current tournament, price and payout sections.'), claim('Wearables can supply Tickets across Decentral Games products, but Bag.win rewards are a separate product.', [sid(poker, 'wearables')], 'Current wearable reward distinctions.')],
      ),
      token_and_value_capture: section(
        `Poker Arcade’s core product units are Tickets and Tournament Badges; both are documented as not transferable. Tickets can be bought with USDT, earned through free play or supplied to wearable holders, while Badges redeem for prizes. Decentral Games migrated the older DG, xDG and ICE tokens to BAG, but BAG is a separate parent-ecosystem token. That history should not be presented as a Poker Arcade wagering token, revenue share or automatic claim on ticket sales. The reviewed sources do not publish ticket revenue, prize expense, rake, a BAG fee right or audited economics.`,
        [claim('Tickets and Tournament Badges are limited-use, non-transferable product units.', [sid(poker, 'terms'), sid(poker, 'arcade-mode')], 'Product terms and current game mechanics.'), claim('DG, xDG and ICE migrated to BAG, a separate parent ecosystem token surface.', [sid(poker, 'dg-token'), sid(poker, 'disclaimer')], 'Current migration page and BAG disclaimer.')],
      ),
      counterfactual: section(
        `Keeping ICE rewards at the center might have preserved a stronger crypto-native hook, but the historical record shows that sell pressure and inflation were already operating constraints. A purely free poker product could remove purchase and prize regulation questions, but would lose direct monetization and high-value rewards. A custodial cash-poker room could simplify onboarding and create clearer rake economics, while adding custody, licensing and withdrawal risk. The most credible improvement is not a theoretical token change: it is publishing current tables, repeat players, ticket sales and prize fulfillment so the product can be judged on real use.`,
        [claim('Historical ICE incentive selling created inflation pressure and motivated design changes.', [sid(poker, 'study')], 'Independent lifecycle discussion.', { kind: 'inference', confidence: 'medium' }), claim('Alternative cash or free models would change monetization and legal exposure, but no causal estimate exists.', [sid(poker, 'terms'), sid(poker, 'arcade-mode')], 'Observed current model used to bound alternatives.', { kind: 'inference', confidence: 'low' })],
      ),
      risks_and_unknowns: section(
        `The largest commercial unknown is player density: the reviewed sources do not disclose concurrent players, filled tables, hands, repeat play or Ticket conversion. Prize obligations, redemption times and product-level revenue are also unpublished. The terms identify BAG Limited and Polygon, but no gaming licence was verified for this exact product. “Available worldwide” is an operator claim, not legal proof for every player. Contract and NFT ownership do not prove fair shuffle execution, service availability, prize solvency or protection from interface changes. BAG liquidity and price are separate from the arcade’s operating health.`,
        [claim('Current Poker Arcade activity, prize liabilities and economics are not disclosed in the reviewed record.', [sid(poker, 'product'), sid(poker, 'arcade-mode')], 'Product pages disclose mechanics rather than operating results.', { kind: 'unknown' }), claim('No product-specific gaming licence was verified and the disclaimer denies regulatory approval of its information.', [sid(poker, 'terms'), sid(poker, 'disclaimer')], 'Legal terms and disclaimer boundary.', { kind: 'unknown' })],
      ),
      lifecycle: section(
        `ICE Poker launched in October 2021 as a play-to-earn metaverse game, and a web/mobile Arcade variant followed in September 2022. Independent research found strong historical Decentraland attention alongside declining visits and token-inflation pressure during the measured period. On April 29, 2024, ICE Poker became Poker Arcade and Challenge Mode was phased out. Current documentation presents free play and prize tournaments as the surviving product. The case is therefore an active, heavily pivoted successor, not a clean continuation of the 2021 token economy and not yet a proven commercial success.`,
        [claim('The product moved from ICE play-to-earn to the Poker Arcade successor across 2021–2024.', [sid(poker, 'study'), sid(poker, 'ice-transition')], 'Independent history and dated operator transition.'), claim('Current docs show a surviving arcade product but not current commercial performance.', [sid(poker, 'product'), sid(poker, 'arcade-mode')], 'Current operator product surface and evidence gaps.', { kind: 'inference', confidence: 'medium' })],
      ),
      outlook_and_watch: section(
        `The base case is continued operation as a niche browser prize arcade, supported by free onboarding and the broader Decentral Games rewards system. The upside requires rising filled tables, repeat play and Ticket purchases without unsustainable prize subsidies. The downside is a thin-player spiral in which slower table formation reduces retention, or a legal, prize-funding or product-maintenance problem. Watch concurrent players, tournament starts, hands, 30- and 90-day repeat rates, Ticket purchases, Badge redemptions, prize delivery, wearable-generated Tickets, Poker Arcade releases and any product-specific licence or restriction update.`,
        [claim('Poker success depends on simultaneous player density and repeat table formation.', [sid(poker, 'arcade-mode'), sid(poker, 'study')], 'Tournament start mechanics and historical poker engagement.', { kind: 'inference', confidence: 'medium' }), claim('No current public series supports a growth, profitability or failure forecast.', [sid(poker, 'product'), sid(poker, 'arcade-mode')], 'Current evidence gap.', { kind: 'unknown' })],
      ),
    },
    metrics: [],
    events: [
      event('ice-launch', 'launch', '2021-10-01', 'ICE Poker launched during October 2021; the source provides month precision.', [sid(poker, 'study')], 'Independent lifecycle history.', 'month'),
      event('arcade-launch', 'product_update', '2022-09-01', 'The separate web and mobile ICE Poker Arcade launched during September 2022; the source provides month precision.', [sid(poker, 'study')], 'Independent lifecycle history.', 'month'),
      event('poker-arcade-transition', 'migration', '2024-04-29', 'ICE Poker became Poker Arcade and Challenge Mode was phased out.', [sid(poker, 'ice-transition')], 'Dated official transition notice.'),
    ],
  },
  {
    slug: overtime,
    name: 'Overtime',
    aliases: ['Overtime Markets'],
    classification: { subtype: 'onchain sportsbook protocol', tags: ['sportsbook', 'amm', 'liquidity_pools', 'noncustodial'], chains: ['Optimism', 'Arbitrum', 'Base', 'Polygon'], jurisdictions: [] },
    operatingState: 'operating',
    statusSources: [sid(overtime, 'product'), sid(overtime, 'llama-tvl'), sid(overtime, 'llama-fees')],
    statusLocator: 'Current product documentation plus current liquidity and fee API observations.',
    outcome: 'operating_established',
    outcomeConfidence: 'medium',
    outcomeSources: [sid(overtime, 'product'), sid(overtime, 'llama-tvl'), sid(overtime, 'llama-fees')],
    outcomeLocator: 'Maintained product, multi-chain liquidity and current fee activity; no audited profitability or retained-bettor series.',
    qualityConfidence: 'medium',
    sources: overtimeSources,
    identityBoundary: 'This profile covers the Overtime protocol and official application. Third-party integrations, odds providers and Thales history are separate operating surfaces.',
    metricBoundary: 'Tracked TVL is LP collateral, not wagering volume, not executable depth for every market, not customer reserves, and not solvency. Fees are adapter estimates, not audited profit.',
    unknowns: ['unique and retained bettors', 'settled wagers by chain', 'market-level depth and slippage', 'risk-adjusted LP returns', 'audited buyback execution and token value capture', 'legal operator and licence by interface'],
    unsourcedFields: ['active_bettors', 'retained_bettors', 'settled_wagers_by_chain', 'market_depth', 'lp_net_returns', 'audited_financials', 'gaming_licence'],
    methodologyNotes: ['Pool collateral and fee observations are not treated as operator solvency or profit.', 'Official permissionless language is not treated as a universal legal right to use the interface.'],
    sections: {
      what_it_is: section(`Overtime is a noncustodial sports-market protocol and customer application built around automated market makers. Bettors trade against pools funded by third-party liquidity providers rather than against a conventional sportsbook balance sheet. Smart contracts collateralize positions and settle outcomes using Chainlink-supplied data and governance rules. The official application is one distribution surface; integrations can use the same liquidity. This is a pool-versus-peer model, not pure peer-to-peer matching and not a licensed sportsbook simply because contracts are public.`, [claim('Overtime uses smart contracts, external data and third-party LP pools for sports markets.', [sid(overtime, 'how'), sid(overtime, 'product')], 'Current architecture and product documentation.'), claim('The interface prohibits listed jurisdictions and no universal licence was verified.', [sid(overtime, 'terms')], 'Current terms and restrictions.')]),
      what_happened: section(`Overtime grew out of Thales’ positional markets. The original Ethereum orderbook design struggled with gas cost and market-maker usability, so Thales introduced an AMM on Optimism. Overtime V1 then applied that approach to sports, but creating a tokenized contract for each market did not scale to large schedules, parlays or live betting. V2 moved market and odds data into a Merkle-based architecture while retaining onchain collateral and settlement. By the 2026-08-03 snapshot, DefiLlama tracked about $1.03 million of liquidity and $119,123 of fees over 30 days.`, [claim('Overtime moved from tokenized V1 markets to a Merkle-based V2 to improve scale and product breadth.', [sid(overtime, 'history')], 'Official architecture history.'), claim('DefiLlama reported current liquidity and 30-day fees at the review snapshot.', [sid(overtime, 'llama-tvl'), sid(overtime, 'llama-fees')], 'Independent API observations.')]),
      why_this_outcome: section(`The protocol solved two cold-start problems at once: bettors receive quotes without waiting for a matching peer, and applications can reuse shared liquidity instead of building a sportsbook balance sheet. Lower-cost L2 execution and wallet/social login reduce some onchain friction. Those choices help explain continued operation and measurable fee activity. They do not prove that demand is organic or profitable. LPs take the house side and can lose when bettors win, while incentives, token discounts and rewards can rent activity. Sustainable success requires repeat bettors, risk-adjusted LP returns and enough market-level depth after incentives.`, [claim('Shared LP liquidity and L2 execution reduce matching and transaction friction.', [sid(overtime, 'how'), sid(overtime, 'amm')], 'Current pool-versus-peer mechanics.', { kind: 'inference', confidence: 'medium' }), claim('Current data do not establish organic retention, LP net returns or operator profit.', [sid(overtime, 'lp'), sid(overtime, 'llama-fees')], 'LP loss disclosure and independent aggregate limits.', { kind: 'unknown' })]),
      strategic_choices: section(`Overtime chose an AMM with risk caps rather than an orderbook, providing immediate quotes while concentrating pricing and loss exposure in the pools. It chose third-party LP collateral, so users can “be the house” and the protocol does not need to fund every bet itself. It moved to V2’s Merkle architecture to support more markets and live products, trading some fully onchain market creation for scalability. It deployed across several L2s and uses Chainlink data, broadening distribution while adding chain, oracle and liquidity fragmentation. Governance is delegated to OVER holders and an elected council rather than an identified bookmaker.`, [claim('The AMM, LP pools, V2 architecture and multi-chain deployment are deliberate operating choices.', [sid(overtime, 'amm'), sid(overtime, 'lp'), sid(overtime, 'history')], 'Current mechanics and lifecycle history.'), claim('OVER holders elect a council that approves proposals and contract changes.', [sid(overtime, 'governance'), sid(overtime, 'terms')], 'Governance and terms documentation.')]),
      operating_model: section(`This is a pool-versus-peer operating model. A bettor selects a market and collateral on the official app. The AMM quotes a price within market risk limits, and a smart contract escrows enough collateral to pay a winning position. Third-party liquidity providers deposit USDC, WETH or cbBTC into weekly pools; their capital takes the house side across supported bets and their withdrawal settles after the active round. Chainlink and approved data providers feed events and results, while governance sets rules and resolves policy changes. The protocol can look peer-to-peer when opposite flow balances exposure, but LP capital remains the counterparty when it does not.`, [claim('LPs provide weekly-round collateral and bear bettor-win and smart-contract risk.', [sid(overtime, 'lp')], 'Current liquidity guide.'), claim('The AMM manages pool-versus-peer risk and relies on Chainlink and governance for market data and rules.', [sid(overtime, 'amm'), sid(overtime, 'product')], 'AMM and product mechanics.')]),
      token_and_value_capture: section(`OVER is the protocol’s governance token and can be used as betting collateral with a pricing incentive. Holders elect the Overtime Council, and current DefiLlama methodology says AMM and LP performance fees are used for OVER buybacks. That is a documented mechanism, not audited proof that every fee reached a buyback, that tokens were burned, or that holders received cash. The 30-day fee observation was $119,123, but fees are not net income and TVL is not token value capture. Token supply, buyback execution, treasury spending and the effect of incentive programs require separate measurement.`, [claim('OVER supplies governance and documented collateral incentives.', [sid(overtime, 'governance'), sid(overtime, 'amm')], 'Current governance and AMM pages.'), claim('DefiLlama attributes AMM and LP fees to token buybacks, but the series is not audited profit or holder cash flow.', [sid(overtime, 'llama-fees')], 'Independent fee methodology and limits.')]),
      counterfactual: section(`A traditional custodial sportsbook could hide wallet and chain complexity and centralize customer support, but it would reintroduce custody, withdrawal and balance-sheet risk. A pure orderbook could move pricing to traders and reduce LP directional exposure, while recreating the liquidity cold start that Thales encountered. Focusing on one chain could deepen a single pool and simplify operations, but would narrow distribution. Removing OVER would simplify incentives and governance, although the evidence does not isolate whether the token currently attracts durable bettors or LP capital.`, [claim('The Thales orderbook’s gas and market-making limits provide a real comparison for the AMM choice.', [sid(overtime, 'history')], 'Official origin history.'), claim('Custodial, orderbook and single-chain alternatives involve unmeasured trade-offs.', [sid(overtime, 'how'), sid(overtime, 'terms')], 'Observed design and legal boundary used as analytical controls.', { kind: 'inference', confidence: 'low' })]),
      risks_and_unknowns: section(`LPs can lose when bettors win, and weekly withdrawal timing means collateral remains exposed through the current round. Bettors depend on contracts, supported chains, oracle data, governance decisions and the official interface even without conventional custody. Prohibited jurisdictions include the United States and several other countries; “permissionless” describes software access, not legal permission. Current TVL does not prove that every market is deep or that all winning claims can execute without slippage or delay. Unique bettors, retention, subsidy-adjusted demand, pool concentration, audited buybacks and legal responsibility remain unknown.`, [claim('LP loss, contract, oracle, governance and withdrawal-timing risks are documented.', [sid(overtime, 'lp'), sid(overtime, 'product')], 'Current risk and operating mechanics.'), claim('Jurisdiction restrictions and commercial measurement gaps prevent a universal success claim.', [sid(overtime, 'terms'), sid(overtime, 'llama-tvl'), sid(overtime, 'llama-fees')], 'Terms and aggregate-data limits.', { kind: 'unknown' })]),
      lifecycle: section(`Thales began in 2021 with tokenized positional markets on Ethereum. High gas costs and weak orderbook market making pushed activity to an AMM on Optimism. Overtime V1 reused that design for sports, then V2 replaced one-contract-per-market tokenization with a Merkle-based system to support broader schedules, parlays and live betting. Current documentation shows a maintained protocol across Optimism, Arbitrum and Base, with additional tracked liquidity on Polygon. The 2026-08-03 API snapshot shows ongoing fees and collateral. Overtime is therefore established and operating, while long-term bettor retention and LP economics remain unresolved.`, [claim('The product passed through orderbook, AMM, sports V1 and scalable V2 stages.', [sid(overtime, 'history')], 'Official lifecycle history.'), claim('Current documentation and APIs show an operating protocol with live collateral and fees.', [sid(overtime, 'product'), sid(overtime, 'llama-tvl'), sid(overtime, 'llama-fees')], 'Current product and data observations.')]),
      outlook_and_watch: section(`The base case is continued operation as a meaningful onchain sportsbook with modest collateral and measurable fee flow. Upside requires repeat bettors, growing settled wagers and strong risk-adjusted LP returns without heavy token or reward subsidies. Downside comes from an oracle or contract failure, weak pool economics, fragmented liquidity, governance error or wider geographic restrictions. Watch 7-, 30- and 90-day fees and settled wagers, active and retained bettors, market-level depth, utilization, LP returns after bettor payouts, withdrawal completion, OVER buybacks and supply, oracle disputes, contract upgrades, chain concentration and terms changes.`, [claim('Current fees and collateral support continued operation but not a profitability forecast.', [sid(overtime, 'llama-tvl'), sid(overtime, 'llama-fees')], 'Current independent aggregates and their limits.', { kind: 'inference', confidence: 'medium' }), claim('Retention, market depth, LP net returns and buyback execution are the decisive missing signals.', [sid(overtime, 'lp'), sid(overtime, 'amm'), sid(overtime, 'governance')], 'Documented risk-bearing and token mechanics.', { kind: 'unknown' })]),
    },
    metrics: [
      metric('liquidity', 'liquidity', 'Tracked protocol liquidity', 1026639, [sid(overtime, 'llama-tvl')], 'DefiLlama protocol adapter', { asOf: '2026-08-03T18:13:23Z', scope: { product: 'Overtime', chains: ['Optimism', 'Arbitrum', 'Base', 'Polygon'] }, qualityFlags: ['lp_collateral_not_wagers', 'not_market_depth', 'not_solvency'] }),
      metric('fees-7d', 'fees', 'Estimated protocol fees, rolling 7 days', 19911, [sid(overtime, 'llama-fees')], 'DefiLlama AMM and LP performance-fee adapter', { window: 'rolling_7d', qualityFlags: ['aggregator_estimate', 'not_profit', 'not_wager_volume'] }),
      metric('fees-30d', 'fees', 'Estimated protocol fees, rolling 30 days', 119123, [sid(overtime, 'llama-fees')], 'DefiLlama AMM and LP performance-fee adapter', { window: 'rolling_30d', qualityFlags: ['aggregator_estimate', 'not_profit', 'not_wager_volume'] }),
    ],
    events: [event('current-snapshot', 'market_observation', AS_OF, 'Current APIs reported $1.03 million of tracked liquidity and $119,123 of rolling 30-day fees.', [sid(overtime, 'llama-tvl'), sid(overtime, 'llama-fees')], 'DefiLlama snapshots retrieved on the review date.')],
  },
  {
    slug: sx,
    name: 'SX Bet',
    aliases: ['SX.bet'],
    classification: { subtype: 'peer-to-peer betting exchange', tags: ['sports_betting', 'order_book', 'escrow', 'noncustodial'], chains: ['SX Rollup'], jurisdictions: ['Anjouan licence claimed by operator'] },
    operatingState: 'operating',
    statusSources: [sid(sx, 'terms'), sid(sx, 'protocol'), sid(sx, 'llama-volume')],
    statusLocator: 'Current 2026 terms and protocol docs plus current matched-volume observations.',
    outcome: 'operating_token_transition',
    outcomeConfidence: 'high',
    outcomeSources: [sid(sx, 'terms'), sid(sx, 'protocol'), sid(sx, 'llama-volume')],
    outcomeLocator: 'Active exchange activity alongside an explicit SX token sunset and planned chain deprecation.',
    qualityConfidence: 'high',
    sources: sxSources,
    identityBoundary: 'This profile covers the SX Bet consumer exchange and its protocol. CRGC Management provides the service; Nextgen owns technology; neither role is attributed to ordinary market makers.',
    metricBoundary: 'Matched betting volume is not deposits, customer assets, revenue, profit or solvency. The stale SX Rollup TVL point is intentionally excluded from headline metrics.',
    unknowns: ['unique and retained bettors', 'open-order depth and spread history', 'current customer asset coverage', 'post-sunset SX Network timeline', 'independently verified licence status', 'audited parlay revenue'],
    unsourcedFields: ['active_bettors', 'retained_bettors', 'orderbook_depth', 'customer_assets', 'licence_authority_verification', 'audited_revenue'],
    methodologyNotes: ['The operator’s Anjouan licence claim is reported as a claim; jurisdiction-wide criticism is not treated as SX-specific misconduct.', 'Bet Credits are not valued as assets, redemption proceeds or token consideration.'],
    sections: {
      what_it_is: section(`SX Bet is a sports betting exchange in which makers post odds and takers accept them through an open orderbook. Both sides’ USDC is locked in an escrow contract and a reported result determines the payout. CRGC Management Ltd is the service provider named in the current terms; Nextgen Blockchain Technologies Ltd owns the proprietary service and intellectual property. The operator says CRGC is licensed in Anjouan, but local legality remains user-specific and the licence claim was not independently verified from an authority register.`, [claim('SX Bet uses maker/taker orders, USDC escrow and onchain result reporting.', [sid(sx, 'protocol')], 'Current developer documentation.'), claim('Current terms name CRGC as service provider and Nextgen as technology owner.', [sid(sx, 'terms')], '2026 legal terms and operator roles.')]),
      what_happened: section(`SX Bet continued operating through 2026 while making a major token and infrastructure reset. Current terms record a May 15, 2026 snapshot of SX balances and say the network is moving to a gasless architecture in which SX will lose its primary gas role. Eligible users may receive non-cash USDC Bet Credits, subject to KYC, geography and other checks. DefiLlama’s 2026-08-03 snapshot reported about $2.94 million of matched bets over 24 hours and $86.39 million over 30 days. That is real exchange activity, but it is not customer assets, revenue or profit.`, [claim('The 2026 terms establish an SX token sunset, gasless migration and planned network deprecation.', [sid(sx, 'terms'), sid(sx, 'news')], 'Current legal terms and news index.'), claim('Current matched-bet volume shows an active exchange product during the transition.', [sid(sx, 'llama-volume')], 'Independent API snapshot.')]),
      why_this_outcome: section(`SX Bet attracts price-sensitive bettors by letting users post odds, offering zero fees on straight bets and exposing an API for professional makers. The orderbook can reward sharp liquidity instead of banning winning users, and escrow reduces conventional operator custody. Those choices help explain meaningful matched volume. The same model depends on enough two-sided liquidity, reliable market creation and result reporting. The token sunset suggests that running a dedicated gas-token network added complexity that the customer product did not need. Product activity survived because USDC wagering and exchange liquidity are separable from SX token demand.`, [claim('Orderbook pricing, zero straight-bet fees and API access support exchange liquidity.', [sid(sx, 'protocol'), sid(sx, 'fees'), sid(sx, 'overview')], 'Current protocol and fee design.', { kind: 'inference', confidence: 'medium' }), claim('The active product and token sunset are distinct lifecycle outcomes.', [sid(sx, 'terms'), sid(sx, 'llama-volume')], 'Current transition terms and matched activity.', { kind: 'inference', confidence: 'high' })]),
      strategic_choices: section(`SX chose a peer-to-peer orderbook instead of setting house odds, making market makers and order-book depth central to product quality. It chose USDC as the primary wagering asset and smart-contract escrow for matched bets, reducing token-price exposure during play. It charges no fee on straight bets and 5% on winning parlays, using a narrow monetization path to compete on price. In 2026 it chose to sunset SX and move away from a native-gas network toward gasless infrastructure, protecting the customer exchange from token friction while severing the token’s former core utility.`, [claim('The exchange model, USDC collateral and parlay-only fee path are documented choices.', [sid(sx, 'protocol'), sid(sx, 'fees'), sid(sx, 'parlays')], 'Current product mechanics.'), claim('The gasless migration deliberately removes SX from its primary network role.', [sid(sx, 'terms'), sid(sx, 'news')], 'Current token sunset record.')]),
      operating_model: section(`A maker signs an order specifying outcome, stake and odds. A taker fills it; both stakes move into escrow until a reporter submits the event result onchain. The contract pays the winner or returns stakes on a void. SX Bet supplies the interface, market registry, maintenance controls and rule system, while market makers supply quotes. Straight bets carry no trading fee; a winning peer-to-peer parlay carries a 5% fee. Users can log in with wallets or social accounts, so noncustodial settlement coexists with an operator-controlled frontend and eligibility process.`, [claim('Matched orders escrow both stakes and settle after an onchain report.', [sid(sx, 'protocol'), sid(sx, 'overview')], 'Current order and settlement flow.'), claim('Straight bets have zero trading fee and winning parlays have a 5% fee.', [sid(sx, 'fees'), sid(sx, 'parlays')], 'Current fee schedules.')]),
      token_and_value_capture: section(`SX was the SX Network gas token and was historically used for staking and related network actions. The May 15, 2026 sunset terms say the new architecture will not require SX as native gas. USDC Bet Credits allocated from the snapshot are not USDC and not cash, stablecoins, tokens, deposits or e-money; they are not withdrawable, transferable or redeemable. The program offers no token redemption or buyback, and the $0.015 reference is not represented as fair market value. Product value capture now centers on winning-parlay fees, while post-sunset rights for SX holders are not established.`, [claim('The sunset removes SX’s primary gas role and offers conditional promotional credits.', [sid(sx, 'terms')], 'Token sunset clauses.'), claim('Bet Credits are not USDC, not cash, not withdrawable, and no token redemption or buyback is offered.', [sid(sx, 'terms')], 'Credit-nature and no-buyback clauses.')]),
      counterfactual: section(`Keeping SX as mandatory gas could preserve token utility, but would continue wallet friction and tie exchange use to token liquidity. A house-banked sportsbook could guarantee quotes on selected markets, while adding balance-sheet and reserve risk that the orderbook avoids. Charging straight-bet fees could create broader revenue, but might weaken the price advantage used to attract traders. The gasless plan is therefore a product-first trade: simplify the betting experience and accept that the original token thesis did not remain central. No evidence estimates what volume or retention would have been under the alternatives.`, [claim('The gasless transition trades native token utility for lower customer friction.', [sid(sx, 'terms'), sid(sx, 'fees')], 'Current transition and gas-fee mechanics.', { kind: 'inference', confidence: 'medium' }), claim('House pricing and broader fees are counterfactuals without causal estimates.', [sid(sx, 'protocol'), sid(sx, 'fees')], 'Observed exchange model used as comparison.', { kind: 'inference', confidence: 'low' })]),
      risks_and_unknowns: section(`Liquidity is the central product risk: large matched volume can coexist with thin depth, wide spreads or concentrated market makers. Escrow reduces conventional custody but does not remove contract, reporter, market-rule, frontend or access risk. Current terms exclude the United States and many other jurisdictions and reserve eligibility checks for the token transition. CRGC’s Anjouan licence is an operator claim; independent reporting raises broader questions about that licensing system but is not evidence of SX-specific wrongdoing. Unique bettors, customer asset coverage, audited fees and the exact network-deprecation path remain unknown.`, [claim('Orderbook, reporter, contract and jurisdiction risks remain despite onchain escrow.', [sid(sx, 'protocol'), sid(sx, 'terms')], 'Current architecture and legal restrictions.'), claim('Anjouan-system criticism is jurisdictional context, not a case-specific finding against SX.', [sid(sx, 'anjouan-context'), sid(sx, 'terms')], 'Independent context compared with operator licence claim.', { kind: 'unknown', confidence: 'high' })]),
      lifecycle: section(`SX Bet is an active product in the middle of a structural reset, not a closed exchange. Its original model paired a peer-to-peer betting exchange with SX Network and the SX gas token. On May 15, 2026, the operator took the token-holder snapshot and introduced terms for the SX token sunset, a gasless architecture and planned deprecation of SX Network. Users have until August 15, 2026 to accept the Bet Credit terms. During the transition, the exchange continued producing matched volume. The correct lifecycle call is active product, sunset token utility and migrating chain infrastructure.`, [claim('The active product, token sunset and planned network deprecation coexist.', [sid(sx, 'terms'), sid(sx, 'protocol'), sid(sx, 'llama-volume')], 'Current legal, product and activity evidence.'), claim('The 2026-08-15 acceptance deadline applies to Bet Credits, not a guaranteed cash redemption.', [sid(sx, 'terms')], 'Current credit acceptance clause.')]),
      outlook_and_watch: section(`The base case is continued exchange operation after the gasless migration, with USDC and market-maker liquidity carrying more weight than SX. Upside requires stable or rising matched volume, deeper books, repeat bettors and reliable settlement while the migration removes friction. Downside is market-maker concentration, loss of liquidity, reporter or contract failure, licence or geographic pressure, or a migration that disrupts balances and integrations. Watch 7-, 30- and 90-day matched volume, order-book depth and spreads, repeat bettors, parlay fees, open interest, settlement disputes, token-credit uptake, chain deprecation milestones and CRGC’s licence status.`, [claim('Current volume supports an operating base case but not profit, solvency or retention.', [sid(sx, 'llama-volume'), sid(sx, 'llama-fees')], 'Independent matched-volume and fee aggregates.', { kind: 'inference', confidence: 'medium' }), claim('Migration execution, liquidity depth and repeat bettors are the decisive next signals.', [sid(sx, 'terms'), sid(sx, 'protocol')], 'Current transition and exchange mechanics.', { kind: 'unknown' })]),
    },
    metrics: [
      metric('wagers-24h', 'wagers', 'Matched betting volume, rolling 24 hours', 2936713, [sid(sx, 'llama-volume')], 'DefiLlama adapter using SX public analytics', { window: 'rolling_24h', scope: { product: 'SX Bet', chain: 'SX Rollup' }, qualityFlags: ['matched_volume_not_deposits', 'not_revenue', 'not_unique_users', 'not_solvency'] }),
      metric('wagers-7d', 'wagers', 'Matched betting volume, rolling 7 days', 14157170, [sid(sx, 'llama-volume')], 'DefiLlama adapter using SX public analytics', { window: 'rolling_7d', scope: { product: 'SX Bet', chain: 'SX Rollup' }, qualityFlags: ['matched_volume_not_deposits', 'not_revenue', 'not_unique_users'] }),
      metric('wagers-30d', 'wagers', 'Matched betting volume, rolling 30 days', 86392972, [sid(sx, 'llama-volume')], 'DefiLlama adapter using SX public analytics', { window: 'rolling_30d', scope: { product: 'SX Bet', chain: 'SX Rollup' }, qualityFlags: ['matched_volume_not_deposits', 'not_revenue', 'not_unique_users'] }),
      metric('fees-30d', 'fees', 'Estimated winning-parlay fees, rolling 30 days', 984.39, [sid(sx, 'llama-fees')], 'DefiLlama parlay-fee adapter', { window: 'rolling_30d', scope: { product: 'SX Bet', chain: 'SX Rollup' }, qualityFlags: ['aggregator_estimate', 'not_audited_revenue', 'straight_bets_fee_free'] }),
    ],
    events: [event('token-snapshot', 'token_sunset', '2026-05-15', 'SX Bet took the SX holder snapshot and introduced token-sunset and Bet Credit terms.', [sid(sx, 'terms')], 'Dated current terms.'), event('credit-deadline', 'terms_deadline', '2026-08-15', 'The stated deadline to accept the Bet Credit terms is 2026-08-15; credits are not cash or token redemption.', [sid(sx, 'terms')], 'Current terms deadline.'), event('current-snapshot', 'market_observation', AS_OF, 'The API snapshot reported $2.94 million of matched bets over 24 hours and $86.39 million over 30 days.', [sid(sx, 'llama-volume')], 'DefiLlama API retrieved on the review date.')],
  },
  {
    slug: azuro,
    name: 'Azuro',
    aliases: ['Azuro Protocol'],
    classification: { subtype: 'prediction market infrastructure', tags: ['protocol_infrastructure', 'shared_liquidity', 'vamm', 'multi_app'], chains: ['Polygon', 'Gnosis', 'Base', 'Chiliz', 'Arbitrum', 'Linea'], jurisdictions: [] },
    operatingState: 'operating',
    statusSources: [sid(azuro, 'v3'), sid(azuro, 'llama-tvl'), sid(azuro, 'llama-fees')],
    statusLocator: 'Current V3 release and current protocol liquidity and pool-result observations.',
    outcome: 'operating_unclassified',
    outcomeConfidence: 'medium',
    outcomeSources: [sid(azuro, 'intro'), sid(azuro, 'v3'), sid(azuro, 'llama-tvl'), sid(azuro, 'llama-fees')],
    outcomeLocator: 'Maintained infrastructure and measurable pool activity without retained-bettor, application or LP-return evidence.',
    qualityConfidence: 'medium',
    sources: azuroSources,
    identityBoundary: 'Azuro is infrastructure, not a consumer sportsbook. Applications, data providers and AzuroDAO are separate actors, and app activity or legal status is not automatically Azuro’s.',
    metricBoundary: 'Tracked pool liquidity is not users, not application revenue, not executable depth for every market, and not operator solvency. Pool profit/loss is not audited Azuro Ltd. income.',
    unknowns: ['active and retained bettors by application', 'application concentration', 'wagers and fees by chain', 'risk-adjusted LP returns', 'actual pAZUR distributions', 'operator and licence for each frontend'],
    unsourcedFields: ['active_bettors', 'retained_bettors', 'application_concentration', 'wagers_by_chain', 'lp_net_returns', 'pazur_realized_distributions', 'app_licences'],
    methodologyNotes: ['Application metrics and legal claims are not rolled up into Azuro without app-level evidence.', 'Negative daily pool results are retained and not hidden by positive cumulative totals.'],
    sections: {
      what_it_is: section(`Azuro is shared prediction-market infrastructure for independent applications, not a consumer sportsbook. Its smart contracts, SDK and data-provider system let frontends offer sports and other event markets while drawing from common vAMM liquidity pools. LPs fund pools; data providers create and reprice conditions and initially resolve them; apps control customer experience and distribution. AzuroDAO governs the protocol and supplies an interface, while current docs say each application is a separate entity with its own legal obligations.`, [claim('Azuro combines protocol contracts, SDK, DAO, data providers, apps and shared LP pools.', [sid(azuro, 'intro'), sid(azuro, 'data'), sid(azuro, 'apps')], 'Current architecture and actor documentation.'), claim('Azuro applications are separate customer and legal surfaces rather than one canonical sportsbook.', [sid(azuro, 'intro'), sid(azuro, 'apps'), sid(azuro, 'terms')], 'Current app and interface boundaries.')]),
      what_happened: section(`Azuro built a multi-application, multi-chain liquidity layer rather than one betting brand. In 2026 it forced applications to migrate to V3 and said V2 would be emptied and stopped on May 8, demonstrating active development but also version dependency. On the 2026-08-03 review, DefiLlama tracked about $1.56 million of liquidity across six EVM networks. Its pool-result series showed a positive $147,317 over 30 days but losses of $65,043 over seven days and $15,294 over 24 hours. These are pool outcomes, not audited protocol company earnings.`, [claim('Azuro required a V2-to-V3 migration and planned to stop V2 on 2026-05-08.', [sid(azuro, 'v3')], 'Dated V3 release notice.'), claim('Current tracked liquidity and pool results show activity and short-window volatility.', [sid(azuro, 'llama-tvl'), sid(azuro, 'llama-fees')], 'Independent current API observations.')]),
      why_this_outcome: section(`Shared liquidity lowers the cold-start cost for a new betting frontend: an application can inherit pool capacity instead of recruiting its own bookmakers. The SDK lowers integration cost, and multiple applications can compete on UX and distribution. That explains why Azuro can remain active without one dominant consumer brand. It also spreads responsibility. The protocol still needs bettors, apps, accurate data providers and LPs willing to take correlated exposure across thousands of markets. Current liquidity is modest and short-window pool results can be negative, so deployment breadth alone does not establish durable commercial success.`, [claim('Shared liquidity and reusable tooling reduce the startup burden for applications.', [sid(azuro, 'intro'), sid(azuro, 'lp')], 'Current architecture and LP design.', { kind: 'inference', confidence: 'medium' }), claim('Current evidence does not establish retained demand, app concentration or risk-adjusted LP returns.', [sid(azuro, 'llama-tvl'), sid(azuro, 'llama-fees'), sid(azuro, 'lp')], 'Independent aggregates and LP risk disclosure.', { kind: 'unknown' })]),
      strategic_choices: section(`Azuro chose infrastructure over a canonical sportsbook, allowing independent apps to own distribution while making adoption harder to attribute. It chose singleton pools and vAMM pricing rather than separate orderbooks, improving capital reuse while exposing each LP position to many markets. It deployed across six EVM networks, widening addressable distribution but fragmenting versions, app support and liquidity. It assigns event creation, repricing and initial resolution to data providers with AzuroDAO as a last-resort arbiter. It also introduced AZUR staking and the two-year pAZUR lock to tie governance and conditional distributions to long-duration holders.`, [claim('Infrastructure, singleton pools, multi-chain deployments and delegated data provision are documented choices.', [sid(azuro, 'intro'), sid(azuro, 'lp'), sid(azuro, 'data')], 'Current protocol design.'), claim('pAZUR adds a two-year lock and conditional USDT distributions.', [sid(azuro, 'pazur')], 'Current pAZUR mechanics.')]),
      operating_model: section(`An application presents markets and sends a user’s bet to Azuro contracts. A data provider creates the underlying condition, supplies odds and later reports the result. The vAMM prices exposure against a singleton pool, so LP collateral can support many markets rather than one isolated book. Pool profit or loss flows from bettor outcomes and fee design, and one LP position is exposed across the pool’s market set. AzuroDAO governs protocol rules and can act as dispute arbiter, but the application remains responsible for customer access, branding and its own legal posture.`, [claim('Apps route users to shared vAMM pools while data providers manage conditions and initial resolution.', [sid(azuro, 'intro'), sid(azuro, 'data'), sid(azuro, 'apps')], 'Current actor and condition workflow.'), claim('LP positions bear broad market exposure and can show negative returns.', [sid(azuro, 'lp'), sid(azuro, 'llama-fees')], 'LP risk disclosure and current pool-result data.')]),
      token_and_value_capture: section(`AZUR is an ERC-20 with a documented one-billion total supply, ecosystem, treasury, investor and contributor allocations, and long vesting schedules. Liquid AZUR can be staked into stAZUR. A holder who locks stAZUR for two years receives a transferable pAZUR NFT that is eligible for variable USDT distributions funded from protocol activity. That right does not attach automatically to every liquid AZUR token, the lock cannot be cancelled early, and returns are not guaranteed. The reviewed record does not independently verify distribution amounts, treasury spending or whether token incentives exceed realized value.`, [claim('AZUR has a documented one-billion supply and allocation/vesting design.', [sid(azuro, 'tokenomics')], 'Current tokenomics page.'), claim('Only the two-year pAZUR path is described as eligible for variable USDT distributions.', [sid(azuro, 'pazur')], 'Current pAZUR rights and limits.')]),
      counterfactual: section(`A single Azuro-operated sportsbook would make customer metrics, revenue and legal responsibility easier to measure, but would abandon the multi-app thesis and create one interface dependency. Separate pools per app or chain could isolate risk and attribution, while worsening liquidity fragmentation. An orderbook could move price setting to market makers, but would recreate a liquidity cold start. A shorter token lock could improve flexibility while weakening the long-duration alignment pAZUR is designed to create. None of these alternatives has a causal performance estimate in the reviewed record.`, [claim('A canonical app and isolated liquidity would simplify attribution but weaken shared distribution and capital reuse.', [sid(azuro, 'intro'), sid(azuro, 'apps'), sid(azuro, 'lp')], 'Observed design used to bound alternatives.', { kind: 'inference', confidence: 'medium' }), claim('Alternative token locks or orderbooks have no measured outcome in this evidence set.', [sid(azuro, 'pazur'), sid(azuro, 'intro')], 'Current mechanism and evidence gap.', { kind: 'unknown' })]),
      risks_and_unknowns: section(`LPs face bettor losses, correlated exposure across many conditions, smart-contract risk and uncertain withdrawal economics. Bettors and apps depend on data providers for creation, repricing and initial resolution, with AzuroDAO as last-resort arbiter. V3’s forced migration shows that “permissionless” applications still depend on protocol version support. Azuro’s terms restrict countries including the United States and say the DAO is not a gambling operator; each app needs separate legal analysis. Current TVL and pool results do not identify users, app concentration, solvency, net LP returns or customer protection.`, [claim('LP, data-provider, dispute and version-migration dependencies are material operating risks.', [sid(azuro, 'lp'), sid(azuro, 'data'), sid(azuro, 'v3')], 'Current risk and migration evidence.'), claim('Protocol terms do not provide a gaming licence for applications or prove legal access.', [sid(azuro, 'terms'), sid(azuro, 'apps'), sid(azuro, 'privacy')], 'Current legal and entity boundaries.', { kind: 'unknown' })]),
      lifecycle: section(`Azuro progressed from a protocol concept to versioned production infrastructure on several EVM networks, adding SDK tooling, governance and the AZUR staking system. Its 2026 V3 release required applications to migrate within days and planned to stop V2 on May 8. Current developer surfaces and liquidity feeds show the protocol remains maintained after that migration. The lifecycle call is active infrastructure with an unclassified commercial outcome: contracts, releases and pool activity are real, but durable application demand, retained bettors, LP returns and realized token distributions are not yet demonstrated in a comparable series.`, [claim('Versioned releases and the V3 migration show active protocol maintenance.', [sid(azuro, 'v3'), sid(azuro, 'intro')], 'Current release and architecture evidence.'), claim('Current liquidity and pool results do not resolve commercial success across applications.', [sid(azuro, 'llama-tvl'), sid(azuro, 'llama-fees')], 'Independent aggregates and attribution limits.', { kind: 'inference', confidence: 'medium' })]),
      outlook_and_watch: section(`The base case is continued operation as a shared infrastructure layer with modest multi-chain liquidity. Upside requires more independent applications, repeat bettors, higher pool utilization and positive LP returns after losses and incentives, plus recurring pAZUR distributions. Downside is concentration in a few apps or data providers, poor LP economics, a resolution failure, another disruptive migration or tighter frontend restrictions. Watch wagers, bettors, apps and fees by chain; pool deposits, withdrawals and net returns; data-provider concentration and disputes; V3 adoption; pAZUR locks and distributions; AZUR unlocks; and the operator and licence behind each major frontend.`, [claim('Current activity supports continued operation but not an application-level growth forecast.', [sid(azuro, 'v3'), sid(azuro, 'llama-tvl'), sid(azuro, 'llama-fees')], 'Current release and pool observations.', { kind: 'inference', confidence: 'medium' }), claim('Application retention, LP returns, data concentration and pAZUR distributions are decisive missing signals.', [sid(azuro, 'apps'), sid(azuro, 'lp'), sid(azuro, 'data'), sid(azuro, 'pazur')], 'Current architecture and token design.', { kind: 'unknown' })]),
    },
    metrics: [
      metric('liquidity', 'liquidity', 'Tracked protocol liquidity', 1563088, [sid(azuro, 'llama-tvl')], 'DefiLlama protocol adapter', { asOf: '2026-08-03T18:13:23Z', scope: { product: 'Azuro Protocol', chains: ['Polygon', 'Gnosis', 'Base', 'Chiliz', 'Arbitrum', 'Linea'] }, qualityFlags: ['pool_liquidity_not_wagers', 'not_users', 'not_operator_solvency'] }),
      metric('pool-result-24h', 'gross_gaming_revenue', 'Pool net result, rolling 24 hours', -15294, [sid(azuro, 'llama-fees')], 'DefiLlama settled bets minus won bets', { window: 'rolling_24h', scope: { product: 'Azuro pools', chains: ['multi-chain'] }, qualityFlags: ['pool_result_not_company_revenue', 'negative_when_bettors_outperform', 'not_audited'] }),
      metric('pool-result-7d', 'gross_gaming_revenue', 'Pool net result, rolling 7 days', -65043, [sid(azuro, 'llama-fees')], 'DefiLlama settled bets minus won bets', { window: 'rolling_7d', scope: { product: 'Azuro pools', chains: ['multi-chain'] }, qualityFlags: ['pool_result_not_company_revenue', 'negative_when_bettors_outperform', 'not_audited'] }),
      metric('pool-result-30d', 'gross_gaming_revenue', 'Pool net result, rolling 30 days', 147317, [sid(azuro, 'llama-fees')], 'DefiLlama settled bets minus won bets', { window: 'rolling_30d', scope: { product: 'Azuro pools', chains: ['multi-chain'] }, qualityFlags: ['pool_result_not_company_revenue', 'not_lp_net_return', 'not_audited'] }),
    ],
    events: [event('v3-migration', 'protocol_upgrade', '2026-05-08', 'Azuro said V2 would be empty and stop on May 8 after the V3 migration window.', [sid(azuro, 'v3')], 'Official V3 release notice.'), event('current-snapshot', 'market_observation', AS_OF, 'Current APIs reported $1.56 million of liquidity and a $147,317 positive 30-day pool result, with negative seven- and one-day windows.', [sid(azuro, 'llama-tvl'), sid(azuro, 'llama-fees')], 'DefiLlama APIs retrieved on the review date.')],
  },
  {
    slug: purebet,
    name: 'Purebet',
    aliases: ['Purebet.io'],
    classification: { subtype: 'sports betting exchange and liquidity aggregator', tags: ['sports_betting', 'order_book', 'liquidity_aggregator', 'noncustodial'], chains: ['Solana'], jurisdictions: [] },
    operatingState: 'hibernating',
    statusSources: [sid(purebet, 'home')],
    statusLocator: 'The current official homepage explicitly says Purebet is hibernating.',
    outcome: 'failed_paused',
    outcomeConfidence: 'high',
    outcomeSources: [sid(purebet, 'home'), sid(purebet, 'how'), sid(purebet, 'promotion')],
    outcomeLocator: 'A once-operating product now presents a hibernation notice; no permanent shutdown or cause is inferred.',
    qualityConfidence: 'medium',
    sources: purebetSources,
    identityBoundary: 'The failed/paused call covers the official frontend and customer product, not every historical Solana program, wallet or third-party venue.',
    metricBoundary: 'No current volume, liquidity, users, revenue, liabilities or solvency metric is published. Historical product descriptions are not activity measurements.',
    unknowns: ['hibernation start date', 'binding cause of hibernation', 'remaining program activity', 'historical peak wagers and users', 'legal operator and licence', 'funded relaunch plan'],
    unsourcedFields: ['hibernation_start_date', 'causal_failure_driver', 'current_program_activity', 'historical_wagers', 'historical_users', 'legal_operator', 'gaming_licence'],
    methodologyNotes: ['The homepage status is current; the product model comes from historical sources and is labeled historical.', 'No causal driver is selected without evidence.'],
    sections: {
      what_it_is: section(`Purebet was a noncustodial sports betting exchange and liquidity aggregator built around Solana wallets and USDC. Its own orderbook could match users, while its routing layer searched integrated onchain betting protocols for better odds and placed a corresponding bet when external liquidity won. Users confirmed transactions from their wallets and winnings were designed to return automatically after settlement. This profile covers that official product and frontend, not every protocol it once integrated and not the Solana network itself.`, [claim('Purebet historically combined its own Solana orderbook with cross-protocol liquidity routing.', [sid(purebet, 'how'), sid(purebet, 'promotion')], 'Official historical product and promotion material.'), claim('The model used wallet-based USDC betting and automatic settlement rather than a conventional custodial account.', [sid(purebet, 'how')], 'Official historical operating description.')]),
      what_happened: section(`Purebet publicly described an operating exchange in December 2022 and ran a 2023 promotion aimed at users of BetDEX, Aver, Azuro, Overtime and SX Bet. That shows the product reached at least a functioning first phase and competed for existing onchain bettors. The current official homepage now says “Purebet is hibernating” and redirects attention to its community. Legacy documentation remains reachable, but no current tables, markets, releases or activity series were found. The frontend therefore failed to sustain normal operation even though a permanent shutdown has not been announced.`, [claim('Purebet had a functioning historical exchange and cross-protocol acquisition campaign in 2022–2023.', [sid(purebet, 'how'), sid(purebet, 'promotion')], 'Dated official product records.'), claim('The current official frontend is hibernating and does not establish a permanent shutdown date.', [sid(purebet, 'home')], 'Current homepage status.', { kind: 'fact' })]),
      why_this_outcome: section(`The cause is unknown. The reviewed sources do not show whether hibernation resulted from thin liquidity, weak demand, regulation, team capacity, competition, funding or a technical problem. The design had clear strengths: no conventional custody, one Solana wallet and aggregation across venues. It also had difficult coordination requirements. Purebet needed enough own-market makers, reliable external integrations, Solana wallet users and bettors willing to adopt an unfamiliar workflow. A 2024 founder discussion described marketing and conversion difficulty, but that self-report is not sufficient to select one causal driver for the product’s later status.`, [claim('No reviewed source identifies the binding cause of hibernation.', [sid(purebet, 'home'), sid(purebet, 'how'), sid(purebet, 'promotion')], 'Current status and historical model without a causal closure statement.', { kind: 'unknown' }), claim('The model depended on its own orderbook, external protocols and crypto-native user acquisition.', [sid(purebet, 'how'), sid(purebet, 'promotion')], 'Historical routing and promotion design.', { kind: 'inference', confidence: 'medium' })]),
      strategic_choices: section(`Purebet chose an exchange and aggregation model instead of acting as the house, avoiding direct exposure to every user bet while making liquidity and integration uptime core dependencies. It chose Solana as the user settlement layer so bettors could use one wallet and USDC even when external liquidity came from other chains. It targeted users already active on rival onchain betting protocols, a focused acquisition strategy that reduced education cost but limited the addressable audience. It did not launch a native token in the reviewed period, keeping wagering in USDC and avoiding a separate incentive economy.`, [claim('Purebet chose noncustodial exchange routing through a single Solana user experience.', [sid(purebet, 'how')], 'Historical operating model.'), claim('The 2023 campaign targeted existing onchain betting users and no native token was identified.', [sid(purebet, 'promotion'), sid(purebet, 'dappradar')], 'Historical campaign and independent directory record.')]),
      operating_model: section(`A user connected a funded Solana wallet, selected an event and saw odds and available liquidity. Purebet’s orderbook could match another user, or the router could place a corresponding bet at an integrated protocol offering better odds. USDC supplied the stake and SOL paid network fees. If routing failed, the order could remain unmatched; after settlement, winnings were designed to return to the user wallet without a manual claim. The frontend, matching engine, integration services and liquidity-aggregation wallet still depended on the Purebet team even though users did not keep a conventional platform balance.`, [claim('The exchange matched own orders or routed to an integrated venue and returned settlement to wallets.', [sid(purebet, 'how')], 'Historical step-by-step product flow.'), claim('Routing could fail and leave an order unmatched, preserving frontend and integration dependency.', [sid(purebet, 'how')], 'Historical error-path disclosure.')]),
      token_and_value_capture: section(`No Purebet-native token was identified in the reviewed official and independent directory material. Users wagered in USDC and paid Solana transaction fees in SOL. Avoiding a token removed emissions, unlock and token-liquidity risk from the customer workflow, but it also removed a common crypto incentive and treasury mechanism. The record does not disclose exchange commissions, routing spreads, subscription revenue or any other durable value-capture model. Hibernation therefore cannot be blamed on a token launch, and the absence of a token does not establish that the underlying business had adequate revenue.`, [claim('Purebet used USDC for betting and SOL for transaction fees.', [sid(purebet, 'how')], 'Historical product article.'), claim('No native token or value-capture right was identified in the reviewed record.', [sid(purebet, 'dappradar'), sid(purebet, 'promotion')], 'Independent directory and official promotion material.', { kind: 'unknown' })]),
      counterfactual: section(`A custodial sportsbook could have hidden wallet and cross-chain complexity and guaranteed selected odds, but would add custody, withdrawals, licensing and balance-sheet exposure. Focusing on one source of liquidity might reduce integration failures while worsening price and market coverage. A token-incentive program could subsidize early order books, but would risk attracting temporary activity and does not solve product-market fit. A distribution partner with an existing bettor audience might have addressed the narrow crypto-native funnel. These are plausible alternatives, not proven explanations; no source shows which would have prevented hibernation.`, [claim('Custodial, single-venue, token-subsidized and partner-distributed alternatives change real trade-offs.', [sid(purebet, 'how'), sid(purebet, 'promotion')], 'Observed historical model used as analytical control.', { kind: 'inference', confidence: 'low' }), claim('No counterfactual has a causal estimate or documented management decision.', [sid(purebet, 'home')], 'Current status notice provides no postmortem.', { kind: 'unknown' })]),
      risks_and_unknowns: section(`The current risk is inactivity: a reachable document or program address does not mean bettors can place and settle new bets. Historical users depended on Purebet’s matching engine, router, external protocols, market data and frontend as well as Solana. Legal operator, licence, jurisdiction restrictions, program addresses and governance were not verified. No current customer-liability, volume, liquidity, active-user or security data exists in the reviewed record. The hibernation start date, cause, remaining onchain activity, community support and relaunch funding are also unknown.`, [claim('Legacy docs do not prove active markets, maintained programs or current customer support.', [sid(purebet, 'home'), sid(purebet, 'docs')], 'Current hibernation notice compared with legacy documentation.', { kind: 'unknown' }), claim('Legal, activity, security and relaunch evidence is missing.', [sid(purebet, 'home'), sid(purebet, 'dappradar')], 'Current official status and independent directory limits.', { kind: 'unknown' })]),
      lifecycle: section(`Purebet published its exchange model on December 15, 2022 and marked completion of its first product phase with a promotion on April 7, 2023. That promotion required wallet and transaction-hash proof from users of other onchain betting protocols, confirming an operating customer flow. By the 2026-08-03 review, the official frontend said the product was hibernating. No source supplies the hibernation start date or a permanent closure statement. The correct lifecycle label is failed/paused for the official customer product, with legacy code and remaining onchain activity explicitly unresolved.`, [claim('Dated 2022 and 2023 sources show a functioning historical product and completed phase.', [sid(purebet, 'how'), sid(purebet, 'promotion')], 'Official dated lifecycle records.'), claim('Current hibernation supports a paused product call, not a claim that every program is dead.', [sid(purebet, 'home'), sid(purebet, 'docs')], 'Current frontend and legacy documentation boundary.')]),
      outlook_and_watch: section(`The base case is continued hibernation because no dated relaunch, new markets or current development release was found. An upside case requires a verified frontend reopening, new program release, active market list and settled bets with visible liquidity. A downside case is permanent abandonment or disappearance of remaining support. Watch the official homepage and community announcements, repository or program releases, market creation, liquidity-wallet flows, settled bets, relaunch funding, legal-entity disclosures and user support. Do not upgrade the lifecycle from a Discord message, a stale directory listing or one unexplained program transaction.`, [claim('No current evidence supports a scheduled or funded relaunch.', [sid(purebet, 'home'), sid(purebet, 'docs'), sid(purebet, 'medium')], 'Current status and stale official surfaces.', { kind: 'unknown' }), claim('Recovery requires verified product operation and repeated settled activity, not document reachability.', [sid(purebet, 'home'), sid(purebet, 'how')], 'Current status compared with historical operating evidence.', { kind: 'inference', confidence: 'high' })]),
    },
    metrics: [],
    events: [event('product-description', 'launch_evidence', '2022-12-15', 'Purebet published its operating exchange and aggregation model.', [sid(purebet, 'how')], 'Dated official article.'), event('phase-one', 'product_milestone', '2023-04-07', 'Purebet published a promotion marking completion of its first product phase.', [sid(purebet, 'promotion')], 'Dated official promotion.'), event('hibernating-observation', 'pause', AS_OF, 'The official homepage identified Purebet as hibernating; the start date remains unknown.', [sid(purebet, 'home')], 'Current official homepage observation.')],
  },
];

export const document = {
  schema: 'chaindump-casino-wave-a-v1',
  version: 1,
  research_as_of: AS_OF,
  researched_at: ACCESSED_AT,
  generated_migration: '0087_casino_wave_a_profiles.sql',
  scope_note: 'Five existing Web3 casino records upgraded to the shared ten-section canonical profile. Every claim awaits human review. Protocol, frontend, operator, chain, token, volume, liquidity, revenue and solvency boundaries are kept separate.',
  cases: specs.map((spec) => ({ slug: spec.slug, canonical_profile: buildProfile(spec) })),
};

export function renderMigration(value = document) {
  const rows = value.cases.map(({ slug, canonical_profile: profile }) => {
    const payload = JSON.stringify(profile).replaceAll("'", "''");
    return `INSERT INTO _casino_wave_a_profiles_0087 (case_id, canonical_profile) VALUES ('${slug}', '${payload}');`;
  });
  const sql = `-- Canonical Web3 casino profile wave A, researched 2026-08-03 and awaiting human review.
-- Legacy synthesis fields remain intact; only outlook.canonical_profile is replaced.

DROP TABLE IF EXISTS _casino_wave_a_profiles_0087;

CREATE TABLE _casino_wave_a_profiles_0087 (
  case_id TEXT PRIMARY KEY,
  canonical_profile TEXT NOT NULL CHECK (json_valid(canonical_profile))
);

${rows.join('\n\n')}

UPDATE casino_syntheses AS synthesis
SET outlook = json_set(
  COALESCE(synthesis.outlook, '{}'),
  '$.canonical_profile', json(staged.canonical_profile)
)
FROM _casino_wave_a_profiles_0087 AS staged
WHERE synthesis.case_id = staged.case_id;

DROP TABLE _casino_wave_a_profiles_0087;
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

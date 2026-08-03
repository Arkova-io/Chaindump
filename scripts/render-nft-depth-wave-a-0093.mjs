#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYSIS_SECTION_KEYS, validateEntityProfile } from '../src/lib/entity-profile.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(root, 'docs/nft-depth-wave-a-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0093_nft_depth_wave_a.sql');
const AS_OF = '2026-08-03';
const ACCESSED_AT = '2026-08-03T20:55:00Z';
const NEXT_REVIEW_AT = '2026-08-10T20:55:00Z';
const MAX_D1_STATEMENT_BYTES = 95_000;
const TARGET_TABLE = '_nft_depth_wave_a_0093';

const sid = (slug, key) => `source:${slug}:${key}`;

function source(slug, key, title, url, publisher, publishedAt, tier, role, details = {}) {
  return {
    id: sid(slug, key),
    title,
    url,
    publisher,
    published_at: publishedAt,
    published_at_precision: details.published_at_precision || (publishedAt ? 'day' : null),
    accessed_at: ACCESSED_AT,
    archive_url: details.archive_url || null,
    tier,
    role,
    access_state: details.access_state || 'reachable',
    checked_at: ACCESSED_AT,
    access_final_url: details.final_url || url,
    content_hash: null,
    independence_group: details.independence_group || publisher,
    access_method: details.access_method || 'direct_http',
    direct_http_status: details.direct_http_status || 200,
  };
}

function fact(assertion, sources, locator, kind = 'fact', note = null) {
  return { assertion, sources, locator, kind, note };
}

function section(body, claims) {
  return { body, claims };
}

function buildProfile(spec) {
  const claims = [];
  const sections = {};
  for (const key of ANALYSIS_SECTION_KEYS) {
    const value = spec.sections[key];
    if (!value) throw new Error(`${spec.slug}: missing ${key}`);
    const claimIds = value.claims.map((item, index) => {
      const id = `claim:${spec.slug}:section:${key}:${index + 1}`;
      claims.push({
        id,
        field_path: `analysis.sections.${key}.body#${index + 1}`,
        assertion: item.assertion,
        value: item.assertion,
        as_of: AS_OF,
        confidence: item.kind === 'unknown' ? 'medium' : 'high',
        kind: item.kind,
        source_ids: item.sources.map((sourceKey) => sid(spec.slug, sourceKey)),
        evidence_locator: item.locator,
        support_direction: item.kind === 'unknown' ? 'context_only' : 'supports',
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
      assertion: spec.statusAssertion,
      value: spec.operatingState,
      as_of: AS_OF,
      confidence: spec.statusConfidence || 'high',
      kind: 'fact',
      source_ids: spec.statusSources.map((key) => sid(spec.slug, key)),
      evidence_locator: spec.statusLocator,
      support_direction: 'supports',
      note: spec.statusNote || null,
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
      source_ids: spec.outcomeSources.map((key) => sid(spec.slug, key)),
      evidence_locator: spec.outcomeLocator,
      support_direction: 'supports',
      note: 'Lifecycle classification, not a price forecast or a claim of holder profitability.',
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    },
  );

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
      source_ids: item.sources.map((key) => sid(spec.slug, key)),
      evidence_locator: item.locator,
      support_direction: 'supports',
      note: item.datePrecision === 'day' ? null : `Source precision: ${item.datePrecision}.`,
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    });
    return {
      id,
      type: item.type,
      date: item.date,
      date_precision: item.datePrecision || 'day',
      description: item.description,
      claim_ids: [claimId],
    };
  });

  const profile = {
    schema: 'chaindump-entity-profile',
    version: 1,
    identity: {
      id: `${spec.type}:${spec.slug}`,
      type: spec.type,
      slug: spec.slug,
      name: spec.name,
      aliases: spec.aliases || [],
    },
    classification: spec.classification,
    status: { operating_state: spec.operatingState, as_of: AS_OF, claim_ids: [statusClaimId] },
    outcome: {
      label: spec.outcome,
      as_of: AS_OF,
      rule_id: 'nft-lifecycle-evidence-v1',
      confidence: spec.outcomeConfidence,
      claim_ids: [outcomeClaimId],
    },
    analysis: { sections },
    metrics: [],
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
      confidence: spec.outcomeConfidence,
      unsourced_fields: spec.unknowns,
    },
    extensions: {
      legacy_origin: 'nft_collections',
      identity_boundary: spec.identityBoundary,
      metric_boundary: spec.metricBoundary,
      editorial_guardrail: spec.guardrail,
      explicit_unknowns: spec.unknowns,
      methodology_notes: [
        'Source verification and evidence assembly are complete; every claim remains pending until a person reviews it.',
        'Collection activity, operator health, holder rights, related-token economics and market price are kept separate.',
        ...spec.methodologyNotes,
      ],
    },
  };
  const errors = validateEntityProfile(profile);
  if (errors.length) throw new Error(`${spec.slug}: ${JSON.stringify(errors)}`);
  for (const [key, value] of Object.entries(sections)) {
    if (value.body.length < 300 || value.body.length > 900) {
      throw new Error(`${spec.slug}.${key}: section length ${value.body.length}`);
    }
  }
  return profile;
}

const frogs = 'bitcoin-frogs';
const frogSources = [
  source(frogs, 'site', 'Bitcoin Frogs collection provenance and retrieval', 'https://bitcoinfrogs.com/', 'Bitcoin Frogs', '2023-03-08', 'B', 'primary', { independence_group: 'bitcoin_frogs' }),
  source(frogs, 'delphi', 'A Frenzy Over Bitcoin Ordinals & Runes', 'https://members.delphidigital.io/reports/a-frenzy-over-bitcoin-ordinals-runes', 'Delphi Digital', '2024-02-29', 'B', 'independent', { independence_group: 'delphi_digital' }),
  source(frogs, 'magic-eden-exit', 'Magic Eden Marketplace Updates & Service Changes', 'https://help.magiceden.io/en/articles/13885504-magic-eden-marketplace-updates-service-changes', 'Magic Eden', '2026-06-30', 'B', 'primary', { independence_group: 'magic_eden' }),
];

const bitcoinFrogs = buildProfile({
  slug: frogs,
  name: 'Bitcoin Frogs',
  type: 'ordinals_collection',
  classification: { subtype: 'fixed-supply Bitcoin Ordinals profile-picture collection', tags: ['bitcoin', 'ordinals', 'pfp', 'free_mint', 'anonymous_team'], chains: ['Bitcoin'], jurisdictions: [] },
  sources: frogSources,
  operatingState: 'artifact_persistent_current_team_and_market_unverified',
  statusAssertion: 'The inscriptions and first-party retrieval record remain available, while current team operation and market health are not established.',
  statusSources: ['site', 'magic-eden-exit'],
  statusLocator: 'Current first-party collection page plus Magic Eden’s June 30, 2026 Bitcoin service notice.',
  outcome: 'unclassified_artifact_durable_market_unverified',
  outcomeConfidence: 'medium',
  outcomeAssertion: 'Bitcoin Frogs is a durable onchain artifact, but the reviewed evidence does not support a current success, middling or failure call for the holder market.',
  outcomeSources: ['site', 'delphi', 'magic-eden-exit'],
  outcomeLocator: 'Launch mechanics, historical independent coverage and the 2026 loss of one major Bitcoin marketplace surface.',
  sections: {
    what_it_is: section(
      'Bitcoin Frogs is a fixed set of 10,000 pixel-art frogs inscribed on Bitcoin in March 2023. The first-party site says each image can be recovered from Taproot witness data with a transaction ID and a Bitcoin Core node, so the artwork is not dependent on the project website. That persistence claim is narrower than a business claim: the NFT does not represent equity, revenue rights, a game, or a promised token.',
      [fact('Bitcoin Frogs is a 10,000-piece Bitcoin Ordinals collection launched March 8, 2023.', ['site', 'delphi'], 'Official opening description and Delphi Bitcoin Frogs section.'), fact('The official retrieval instructions point to image bytes in Bitcoin Taproot witness data.', ['site'], 'Technical retrieval paragraph on the first-party collection page.'), fact('No equity, revenue-share, game or token right is stated on the reviewed collection page.', ['site'], 'First-party collection proposition reviewed in full.', 'unknown')],
    ),
    what_happened: section(
      'The collection launched free on March 8, 2023, with collectors paying network costs rather than a project mint price. Delphi later described it as an early, culturally recognizable Ordinals profile-picture set whose attention rose and fell with the wider inscriptions cycle. In 2026 Magic Eden ended its Bitcoin marketplace and API support. That removed one discovery and trading venue; it did not remove the inscriptions from Bitcoin or prove that all trading stopped.',
      [fact('The collection launched as a free mint excluding transaction costs.', ['site', 'delphi'], 'Official launch text and Delphi fair-launch description.'), fact('Delphi documented attention fading and later returning during the 2023 Ordinals cycle.', ['delphi'], 'Bitcoin Frogs activity discussion in the February 2024 report.'), fact('Magic Eden ended Bitcoin marketplace support on March 9, 2026 and remaining Bitcoin services on March 27.', ['magic-eden-exit'], 'Key Dates and Bitcoin shutdown sections.')],
    ),
    why_this_outcome: section(
      'The strongest durable choice was to put the image data in Bitcoin transactions instead of relying on a hosted image server. The free launch also reduced the need to justify a large upfront raise and gave the project a simple cultural identity during the first Ordinals wave. Those choices explain why the artifact can persist. They do not establish current demand, and Magic Eden’s Bitcoin exit shows that discovery, bids and trading remain dependent on off-chain companies even when the art survives onchain.',
      [fact('Onchain image storage reduces dependence on the project website for artifact retrieval.', ['site'], 'Bitcoin Core retrieval instructions.', 'inference'), fact('The free launch and early Ordinals timing were identified features of the collection’s historical attention.', ['site', 'delphi'], 'Official launch record and Delphi cultural analysis.', 'inference'), fact('Marketplace continuity is separate from inscription persistence.', ['site', 'magic-eden-exit'], 'Onchain retrieval method compared with Magic Eden’s service shutdown.', 'inference')],
    ),
    strategic_choices: section(
      'The team chose a fixed 10,000-piece set, a free release, anonymous authorship and fully inscribed artwork. That combination favors provenance, scarcity and meme identity over a conventional product roadmap. It also leaves fewer accountable operating facts: the reviewed first-party page does not name legal entities, a treasury, recurring benefits or delivery milestones. The design can preserve art without preserving community coordination, liquidity or a responsible operator.',
      [fact('The design fixes the collection at 10,000 and says no more will be created.', ['site'], 'First-party collection statement.'), fact('The team identifies itself as anonymous.', ['site'], 'First-party team disclosure.'), fact('No named legal entity, treasury or recurring delivery schedule was found on the reviewed first-party page.', ['site'], 'Full first-party page review.', 'unknown')],
    ),
    operating_model: section(
      'There is no verified company operating model in the reviewed record. Owners custody inscriptions and may discover or trade them through independent wallets, indexers and marketplaces. The first-party site is an archive and retrieval surface, while Bitcoin supplies the data layer. This separation matters: a working inscription does not prove a working marketplace, and a live website does not prove an active team, recurring revenue, support obligations or a funded development program.',
      [fact('Owners can independently retrieve inscription data from Bitcoin.', ['site'], 'Node retrieval instructions.'), fact('Magic Eden’s listings and bids were off-chain and became non-actionable when its Bitcoin support ended.', ['magic-eden-exit'], 'Bitcoin activity and listing shutdown sections.'), fact('Current staffing, support obligations and recurring revenue are not disclosed.', ['site'], 'Current first-party page review.', 'unknown')],
    ),
    token_and_value_capture: section(
      'The launch charged no project mint price, and the reviewed sources do not identify a Bitcoin Frogs fungible token, company share or contractual holder payout. A holder’s direct economic route is resale to another buyer, subject to venue access and executable demand. The creator’s current royalty policy and revenue are unknown. Bitcoin network fees compensate miners, not the collection team, and marketplace activity should not be counted as project revenue without a disclosed fee path.',
      [fact('The collection launched free apart from network costs.', ['site', 'delphi'], 'Launch and fair-launch descriptions.'), fact('No collection-specific fungible token or holder revenue right appears in the reviewed sources.', ['site'], 'Current first-party page review.', 'unknown'), fact('Magic Eden’s Bitcoin service closure affected listings and bids rather than the underlying inscriptions.', ['magic-eden-exit', 'site'], 'Magic Eden listing explanation compared with first-party storage model.')],
    ),
    counterfactual: section(
      'A named steward, published rights policy and periodic market disclosure could have made the collection easier to evaluate without changing its onchain art. Broader marketplace redundancy could also have reduced the distribution shock from Magic Eden’s exit. These are scenarios, not proven missed outcomes: an anonymous, minimal operator may have helped the early culture, and the record does not show that formal governance or extra utility would have improved demand, retention or price.',
      [fact('The actual record uses anonymous authorship and no conventional roadmap.', ['site'], 'First-party team and collection statements.'), fact('A major Bitcoin marketplace surface closed in 2026.', ['magic-eden-exit'], 'Service-change schedule.'), fact('The effect of named governance or added utility on holder demand is not observed.', ['site', 'delphi'], 'Historical design and attention record only.', 'unknown')],
    ),
    risks_and_unknowns: section(
      'The artifact is durable, but the social and market layers are harder to verify. The current operator, holder concentration, active community, executable bids, recent unique buyers and sellers, creator royalties and alternative marketplace depth are unknown. Marketplace exits can strand listings or reduce visibility even when custody remains intact. Anonymous control also makes it difficult to determine who can change official links, licensing language or future collection messaging.',
      [fact('Magic Eden discontinued its Bitcoin marketplace, APIs and remaining Bitcoin services in March 2026.', ['magic-eden-exit'], 'Key dates and full-shutdown sections.'), fact('The collection team is anonymous.', ['site'], 'First-party team statement.'), fact('Current holders, bid depth, sales, royalties and active stewardship are not published in the reviewed sources.', ['site', 'delphi', 'magic-eden-exit'], 'Current-source review did not provide these fields.', 'unknown')],
    ),
    lifecycle: section(
      'Bitcoin Frogs launched March 8, 2023 during the opening Ordinals cycle. Independent reporting in February 2024 described a free launch, early cultural recognition and attention that had already moved through decline and resurgence. The inscriptions remain independently retrievable in 2026, while Magic Eden withdrew from Bitcoin marketplace support that March. The correct lifecycle call is persistent artifact with unverified current coordination and market—not dead, and not proven healthy.',
      [fact('The collection launched March 8, 2023.', ['site', 'delphi'], 'Launch date in both sources.'), fact('Independent reporting documented a variable attention cycle by February 2024.', ['delphi'], 'Bitcoin Frogs activity history.'), fact('In 2026 the artifact remained retrievable while one major marketplace exited Bitcoin.', ['site', 'magic-eden-exit'], 'Current collection page and service-change record.')],
    ),
    outlook_and_watch: section(
      'Base case: the inscriptions continue to exist and the collection remains recognizable, but present market health stays unclassified until current evidence exists. Watch 30- and 90-day unique buyers and sellers, executable bid depth, active marketplaces after Magic Eden’s exit, official-site changes, named stewardship and any documented holder program. Do not treat a listed floor, a social post or the continued existence of image bytes as proof of liquidity, retained community or operating success.',
      [fact('Inscription persistence is supported by the first-party retrieval method.', ['site'], 'Technical retrieval paragraph.'), fact('Magic Eden’s exit creates a concrete reason to verify replacement distribution venues.', ['magic-eden-exit'], 'Bitcoin marketplace and API closure.'), fact('Current liquidity, retained community and active stewardship require new evidence.', ['site', 'delphi', 'magic-eden-exit'], 'Reviewed record ends before those current measurements.', 'unknown')],
    ),
  },
  events: [
    { key: 'launch', type: 'collection_launch', date: '2023-03-08', datePrecision: 'day', description: 'Bitcoin Frogs launched free apart from network costs.', sources: ['site', 'delphi'], locator: 'Official launch statement and Delphi report.' },
    { key: 'independent-review', type: 'independent_review', date: '2024-02-29', datePrecision: 'day', description: 'Delphi documented the collection’s early Ordinals position and variable attention.', sources: ['delphi'], locator: 'Dated report and Bitcoin Frogs section.' },
    { key: 'marketplace-exit', type: 'distribution_change', date: '2026-03-27', datePrecision: 'day', description: 'Magic Eden discontinued remaining Bitcoin services and APIs.', sources: ['magic-eden-exit'], locator: 'Magic Eden key dates and shutdown section.' },
  ],
  identityBoundary: 'The Bitcoin Frogs inscriptions, anonymous project team, first-party archive and third-party trading venues are separate layers.',
  metricBoundary: 'No current market metric is published here; artifact availability is not liquidity, and historical attention is not current demand.',
  guardrail: 'Never infer current success from permanent image storage or a listed floor. Verify the market and operator layers separately.',
  unknowns: ['current_team_and_control', 'holder_concentration', 'current_unique_buyers_and_sellers', 'executable_bid_depth', 'active_marketplaces', 'creator_royalties', 'holder_rights_policy'],
  methodologyNotes: ['The 2026 Magic Eden exit is treated as a distribution change, not a collection shutdown. No stale market snapshot is promoted to a current headline.'],
});

const gods = 'gods-unchained-cards';
const godsSources = [
  source(gods, 'expansion', 'New Expansion: The Waking Plague', 'https://portal.godsunchained.com/blog/new-expansion-the-waking-plague-collectors-guide', 'Gods Unchained', '2026-06-04', 'B', 'primary', { independence_group: 'gods_unchained' }),
  source(gods, 'migration', 'Everything you need to know about the Immutable zkEVM migration', 'https://portal.godsunchained.com/blog/everything-you-need-to-know-about-gods-unchaineds-migration-to-immutable-zkevm', 'Gods Unchained', '2025-05-07', 'B', 'primary', { independence_group: 'gods_unchained', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source(gods, 'zkevm-guide', 'How To Guide: Gods Unchained on Immutable zkEVM', 'https://portal.godsunchained.com/blog/how-to-guide-gods-unchained-on-immutable-zkevm', 'Gods Unchained', null, 'B', 'primary', { independence_group: 'gods_unchained', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source(gods, 'token', 'GODS About', 'https://portal.godsunchained.com/token-about', 'Gods Unchained', null, 'B', 'primary', { independence_group: 'gods_unchained' }),
  source(gods, 'engagement-study', 'Player engagement in Web3 video games', 'https://www.um.edu.mt/library/oar/handle/123456789/132109', 'University of Malta', '2025-01-01', 'A', 'independent', { independence_group: 'university_of_malta', published_at_precision: 'year' }),
  source(gods, 'provenance-study', 'On the role of provenance in NFT trades', 'https://www.sciencedirect.com/science/article/abs/pii/S016781162400096X', 'Electronic Commerce Research and Applications', '2024-01-01', 'A', 'independent', { independence_group: 'elsevier_electronic_commerce_research', published_at_precision: 'year', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
];

const godsUnchained = buildProfile({
  slug: gods,
  name: 'Gods Unchained Cards',
  type: 'nft_collection',
  classification: { subtype: 'multi-set playable digital trading-card collection', tags: ['game_assets', 'trading_cards', 'immutable_zkevm', 'gods_token', 'active_content'], chains: ['Immutable zkEVM', 'Ethereum'], jurisdictions: [] },
  sources: godsSources,
  operatingState: 'operating_current_expansion',
  statusAssertion: 'Gods Unchained was operating with a live 2026 expansion and card infrastructure on Immutable zkEVM at the review date.',
  statusSources: ['expansion', 'zkevm-guide'],
  statusLocator: 'June 2026 expansion terms and current zkEVM operating guide.',
  outcome: 'operating_established_product_economics_unverified',
  outcomeConfidence: 'medium',
  outcomeAssertion: 'Repeated game delivery and a completed chain migration establish product continuity, while player retention and card-level economics remain unverified.',
  outcomeSources: ['expansion', 'migration', 'engagement-study'],
  outcomeLocator: 'Current expansion, completed migration plan and independent Web3-game engagement research.',
  sections: {
    what_it_is: section(
      'Gods Unchained is a digital card game whose tradable cards are NFTs. This profile covers the card economy across multiple sets, not one fixed-supply collection and not the financial health of Immutable as a company. Players can use cards in decks and trade eligible assets, while free Core cards and paid or earned sets follow different supply rules. The separate GODS token supports crafting, purchases, rewards and governance; a card is not a share in the studio or token treasury.',
      [fact('Gods Unchained combines playable digital cards with tradable NFT assets.', ['expansion', 'provenance-study'], 'Current pack terms and independent description of cards with collectible and use value.'), fact('The profiled object spans multiple card sets rather than one fixed-supply NFT drop.', ['expansion'], 'Waking Plague set and product terms.'), fact('GODS is a separate ERC-20 token used in the game economy.', ['token'], 'Official token utility page.')],
    ),
    what_happened: section(
      'The project moved tradable cards and other game NFTs from Immutable X to Immutable zkEVM in June 2025. Card properties and mint numbers were meant to remain intact; GODS balances required a separate user bridge. In June 2026 the team released The Waking Plague, a 46-card expansion with capped pack categories, followed by active July updates. These deliveries prove that the product is operating. They do not disclose how many people stayed, how many packs sold, or whether the card economy is profitable.',
      [fact('Tradable NFTs were scheduled for automatic migration June 2–6, 2025.', ['migration'], 'Migration guide key dates and asset scope.'), fact('GODS tokens required manual bridging rather than automatic NFT migration.', ['migration', 'zkevm-guide'], 'Token migration instructions and current old-chain warning.'), fact('The Waking Plague went live June 16, 2026 with 46 new cards.', ['expansion'], 'Expansion summary and sales section.')],
    ),
    why_this_outcome: section(
      'Gods Unchained has lasted because it keeps shipping the underlying card game: new sets, balance work, pack sales and competitive use give the NFTs a reason to exist beyond display. Moving the assets to the studio’s current chain also prevented the card economy from being stranded on retired infrastructure. Independent research warns that token rewards alone rarely sustain engagement, so the defensible explanation is continued gameplay plus content—not proof that incentives, token price or provenance by themselves retained players.',
      [fact('The current expansion adds playable cards and a post-sale balance period.', ['expansion'], 'Expansion card count, sales window and balance phase.'), fact('The 2025 migration preserved cards for future zkEVM trading and gameplay.', ['migration', 'zkevm-guide'], 'Asset migration and current chain-use descriptions.'), fact('Independent engagement research finds that gameplay and community matter beyond financial incentives.', ['engagement-study'], 'Dissertation abstract conclusions.', 'inference')],
    ),
    strategic_choices: section(
      'The studio chose a hybrid economy: free access, collectible card sets, paid packs, tradable ownership and a fungible utility token. It also chose to migrate the asset layer rather than leave cards on Immutable X. Waking Plague used limited pack categories and a defined balance window, which can support scarcity and game tuning but also introduces spending and token complexity. The reviewed material does not show whether those choices improved acquisition, retention, liquidity or customer value.',
      [fact('The card economy uses sets, paid pack categories and tradable assets.', ['expansion', 'provenance-study'], 'Waking Plague pack design and independent card-use context.'), fact('The team migrated the NFT asset layer to Immutable zkEVM.', ['migration', 'zkevm-guide'], 'Migration scope and current-chain guide.'), fact('The effect of the migration and pack design on retention or customer value is not disclosed.', ['expansion', 'migration', 'engagement-study'], 'Product disclosures lack cohort outcomes.', 'unknown')],
    ),
    operating_model: section(
      'Gods Unchained Pty Ltd governs packs and digital collectibles, operates the game and publishes expansions. Players custody eligible NFT cards in wallets and interact through the game, marketplaces and Immutable zkEVM. Some gameplay state remains an application service even when cards are onchain. The chain migration was operator-led, and current use depends on the maintained client, balance rules and account systems. Public pages do not provide card-attributable revenue, operating cost, staffing or audited retention.',
      [fact('Gods Unchained Pty Ltd governs packs and digital collectibles.', ['expansion'], 'Expansion disclaimer.'), fact('Tradable NFTs live on Immutable zkEVM after an operator-led migration.', ['migration', 'zkevm-guide'], 'Asset migration and current operating guide.'), fact('Card-attributable financials and retention are not disclosed in the reviewed product pages.', ['expansion', 'migration'], 'Reviewed current operator disclosures.', 'unknown')],
    ),
    token_and_value_capture: section(
      'The operator can sell card packs, while players can trade eligible NFT cards and use them in the game. GODS is a separate token used for crafting and other game functions; it does not turn a card into equity or guarantee a return. Waking Plague listed pack prices and maximum quantities, but maximum supply is not sell-through and pack revenue is not profit. Current royalties, marketplace fees, active staking economics, card resale depth and the share of revenue attributable to NFTs are not published here.',
      [fact('Waking Plague offered regular, premium and shiny packs at stated prices and caps.', ['expansion'], 'Pack Types and Sales Period sections.'), fact('GODS is used for crafting, rewards and governance as a separate asset.', ['token', 'migration'], 'Official token utility and bridge descriptions.'), fact('Pack caps do not disclose units sold, revenue or profit.', ['expansion'], 'Expansion provides maximum quantities but no sell-through statement.', 'unknown')],
    ),
    counterfactual: section(
      'A simpler migration with automatic token movement might have reduced user friction, but it would have carried different custody and security tradeoffs. Publishing set-level sell-through, active-player cohorts and card-liquidity data would make the product easier to evaluate. A design that relied less on rewards might reduce financialization risk, but the evidence does not show how retention would change. These are bounded alternatives, not claims that a different chain or token policy would have guaranteed success.',
      [fact('NFTs migrated automatically while GODS required user action.', ['migration', 'zkevm-guide'], 'Migration path split by asset type.'), fact('Independent research identifies a tension between financial rewards and durable engagement.', ['engagement-study'], 'Study abstract and conclusion.'), fact('No observed counterfactual reports how retention would change under a different token or chain design.', ['engagement-study', 'migration'], 'Research and product records do not run that experiment.', 'unknown')],
    ),
    risks_and_unknowns: section(
      'The largest unknown is whether recurring content translates into retained players and healthy trading rather than repeated spending by a small cohort. Chain migration can strand assets or tokens when users miss steps, and cards remain exposed to balance changes even when ownership persists. Current monthly players, payer retention, pack sell-through, card-holder concentration, executable market depth, token subsidy cost and studio profitability are unverified. Provenance and technical ownership should not be substituted for those business outcomes.',
      [fact('GODS balances required a manual bridge and old-chain tokens are no longer supported in-game.', ['migration', 'zkevm-guide'], 'Bridge instructions and current warning.'), fact('Independent research identifies retention and token volatility as central Web3-game risks.', ['engagement-study'], 'Study abstract.'), fact('Current player, payer, liquidity and profitability fields are not disclosed in the reviewed sources.', ['expansion', 'migration', 'engagement-study'], 'Current-source gap.', 'unknown')],
    ),
    lifecycle: section(
      'Gods Unchained began as an Ethereum-era blockchain card game, later moved trading to Immutable X and then migrated tradable NFTs to Immutable zkEVM in June 2025. The 2026 Waking Plague expansion and current zkEVM guide show that the product continued after the infrastructure change. This is an operating lifecycle with repeated content delivery. It is not a single collection that sold out once, and the evidence does not justify calling the full card economy financially successful or the player base securely retained.',
      [fact('The card economy preceded the 2025 zkEVM migration.', ['migration', 'provenance-study'], 'Migration framing and independent historical research context.'), fact('Tradable cards moved to zkEVM during June 2025.', ['migration'], 'Migration schedule and asset scope.'), fact('A live June 2026 expansion establishes post-migration product delivery.', ['expansion', 'zkevm-guide'], 'Current expansion and chain guide.')],
    ),
    outlook_and_watch: section(
      'Base case: Gods Unchained remains an operating niche card game that can continue releasing sets, but durable economics are unresolved. Watch monthly active and paying players, cohort retention after each expansion, pack sell-through, unique card buyers and sellers, bid depth by set, migration support incidents, GODS subsidy and sink balance, and audited studio disclosures. Do not use a token price, a pack cap, chain transaction count or the release of one expansion as a substitute for retained play and sustainable unit economics.',
      [fact('The product had current post-migration content in June 2026.', ['expansion', 'zkevm-guide'], 'Expansion launch and current chain guide.'), fact('Independent research makes retained enjoyment a distinct measure from incentive-led acquisition.', ['engagement-study'], 'Study findings.'), fact('The listed watch fields are not supplied by the reviewed current disclosures.', ['expansion', 'migration', 'token'], 'Operator pages omit cohort and unit-economics data.', 'unknown')],
    ),
  },
  events: [
    { key: 'migration', type: 'chain_migration', date: '2025-06-02', datePrecision: 'day', description: 'Gods Unchained began migrating tradable NFTs from Immutable X to Immutable zkEVM.', sources: ['migration'], locator: 'Migration key dates and asset scope.' },
    { key: 'waking-plague', type: 'content_expansion', date: '2026-06-16', datePrecision: 'day', description: 'The Waking Plague expansion went live with 46 new cards.', sources: ['expansion'], locator: 'Expansion summary.' },
    { key: 'current-review', type: 'research_review', date: '2026-08-03', datePrecision: 'day', description: 'Current product, migration, token and independent engagement evidence was reviewed.', sources: ['expansion', 'migration', 'zkevm-guide', 'engagement-study'], locator: 'Named sources reviewed at the research timestamp.' },
  ],
  identityBoundary: 'The card collection, game client, Gods Unchained operator, Immutable chain, Immutable company and GODS token have related but distinct economics.',
  metricBoundary: 'Pack price and maximum supply are product terms, not sell-through, revenue, profit, liquidity or retained users.',
  guardrail: 'Do not call the card economy thriving from current content delivery alone. Separate operating continuity from player retention and economics.',
  unknowns: ['monthly_active_players', 'payer_retention', 'pack_sell_through', 'card_holder_concentration', 'set_level_bid_depth', 'royalties_and_marketplace_fees', 'token_subsidy_cost', 'studio_profitability'],
  methodologyNotes: ['Bot-protected operator migration pages were verified through indexed browser snapshots and labeled with direct HTTP 403. Card provenance research is not treated as current demand data.'],
});

const f1 = 'f1-delta-time';
const f1Sources = [
  source(f1, 'closure', 'F1 Delta Time to cease operations; announces rewards for supporters', 'https://www.animocabrands.com/announcement/f1-delta-time-to-cease-operations-announces-rewards-for-supporters', 'Animoca Brands', '2022-03-15', 'B', 'primary', { independence_group: 'animoca_brands' }),
  source(f1, 'pc-gamer', 'F1 Delta Time, one of the first major NFT games, has shut down', 'https://www.pcgamer.com/f1-delta-time-one-of-the-first-major-nft-games-has-shut-down/', 'PC Gamer', '2022-04-05', 'B', 'independent', { independence_group: 'future_pc_gamer' }),
  source(f1, 'whitepaper', 'F1 Delta Time White Paper v1.0', 'https://images.animocabrands.com/wp-content/uploads/2019/06/F1-Delta-Time-White-Paper-v1.0.pdf', 'Animoca Brands', '2019-06-01', 'C', 'primary', { independence_group: 'animoca_brands', published_at_precision: 'month' }),
  source(f1, 'strategy', 'Animoca Brands Strategy Update May 2020', 'https://images.animocabrands.com/wp-content/uploads/2020/05/Animoca-Brands-Strategy-Update-May-2020.pdf', 'Animoca Brands', '2020-05-01', 'C', 'primary', { independence_group: 'animoca_brands', published_at_precision: 'month' }),
];

const f1DeltaTime = buildProfile({
  slug: f1,
  name: 'F1 Delta Time',
  type: 'nft_collection',
  classification: { subtype: 'licensed motorsport game-asset collection', tags: ['ethereum', 'gaming', 'licensed_ip', 'revv', 'ceased'], chains: ['Ethereum', 'Polygon'], jurisdictions: [] },
  sources: f1Sources,
  operatingState: 'ceased_2022',
  statusAssertion: 'F1 Delta Time ceased operating on March 16, 2022 after Animoca Brands could not renew the Formula 1 license.',
  statusSources: ['closure', 'pc-gamer'],
  statusLocator: 'Dated operator shutdown notice and independent PC Gamer confirmation.',
  outcome: 'failed_licensed_product_assets_and_replacements_survive',
  outcomeConfidence: 'high',
  outcomeAssertion: 'The licensed game failed at the product layer because its required Formula 1 license was not renewed, although original tokens and replacement paths could persist.',
  outcomeSources: ['closure', 'pc-gamer'],
  outcomeLocator: 'Operator notice states the non-renewal and immediate cessation; independent reporting confirms the shutdown.',
  sections: {
    what_it_is: section(
      'F1 Delta Time was an officially licensed Formula 1 blockchain racing game operated by Animoca Brands. Cars, drivers, components and track segments were sold or used as Ethereum NFTs, while REVV and SHRD supported game rewards and related motorsport products. This profile covers the discontinued F1-branded product and its assets. It does not treat every REVV Motorsport game, replacement NFT or surviving token contract as proof that F1 Delta Time itself is alive.',
      [fact('F1 Delta Time was an officially licensed Formula 1 blockchain racing game.', ['closure', 'pc-gamer'], 'Operator retrospective and independent game description.'), fact('The product used NFT game assets and the REVV token.', ['closure', 'whitepaper'], 'Shutdown asset categories and whitepaper economy.'), fact('F1 Delta Time is distinct from the wider REVV Motorsport ecosystem.', ['closure'], 'Operator lists replacement products outside the closing game.')],
    ),
    what_happened: section(
      'Animoca launched the product in 2019 and added Time Trial and Grand Prix modes in 2020. On March 15, 2022 it announced that operations would end the next day because it had been unable to renew the Formula 1 license. The company offered different replacement cars, Race Passes, proxy assets, vouchers and temporary payouts depending on asset type. Those measures were a wind-down program, not continuation of the licensed game and not proof that every holder recovered equivalent value.',
      [fact('The product began in 2019 and later added Time Trial and Grand Prix modes.', ['closure', 'pc-gamer'], 'Operator retrospective and independent launch account.'), fact('Animoca announced on March 15, 2022 that the game would cease March 16 after license non-renewal.', ['closure', 'pc-gamer'], 'Opening paragraphs of both reports.'), fact('The operator outlined asset-specific replacement and swap paths.', ['closure'], 'Looking ahead, replacement car, proxy asset and timeline sections.')],
    ),
    why_this_outcome: section(
      'The binding reason for shutdown is unusually clear: the game depended on Formula 1 intellectual property and Animoca said it could not renew that license. The license created instant brand recognition and authentic cars, drivers and tracks, but it was also a single point of product failure controlled outside the token contracts. The reviewed record does not say why renewal failed, whether price, terms or strategy were involved, or whether weak economics contributed. Those possibilities must remain unknown rather than being promoted to causes.',
      [fact('The operator expressly tied cessation to inability to renew the license.', ['closure'], 'Opening shutdown statement.'), fact('Independent reporting confirmed the loss of the official license as the shutdown reason.', ['pc-gamer'], 'PC Gamer shutdown summary.'), fact('The sources do not disclose the negotiation reason or prove that economics caused non-renewal.', ['closure', 'pc-gamer'], 'Neither source provides negotiation terms or a causal financial analysis.', 'unknown')],
    ),
    strategic_choices: section(
      'Animoca chose premium third-party sports IP, tokenized game assets and a shared REVV economy. The branded license helped the project sell authentic Formula 1 scarcity and made it an early high-profile NFT game. The tradeoff was structural: token ownership could outlive the legal right to operate the branded experience. Building replacement paths across REVV Motorsport reduced some transition harm, but it also asked holders to accept different products, chains and utility instead of the F1 game they originally bought into.',
      [fact('The product strategy centered on licensed Formula 1 game assets.', ['whitepaper', 'closure'], 'Whitepaper product design and operator retrospective.'), fact('REVV connected the game to a wider motorsport economy.', ['closure', 'whitepaper'], 'Token and replacement ecosystem descriptions.'), fact('Replacement paths delivered different assets or utility rather than continued F1 access.', ['closure'], 'Replacement car, Race Pass, voucher and proxy sections.', 'inference')],
    ),
    operating_model: section(
      'Animoca Brands operated the game, license relationship, NFT releases and reward systems. Players held assets in wallets, but their in-game value depended on Animoca’s servers, rules and continued Formula 1 authorization. When that authorization ended, the company could close the client while the blockchain tokens remained. The wind-down then used snapshots and time-limited swaps to map asset types into other REVV products. Current completion rates, support obligations and unclaimed holder outcomes are not disclosed.',
      [fact('Animoca controlled the game operation and announced its cessation.', ['closure'], 'Operator notice.'), fact('Replacement eligibility used snapshots and time-limited swap windows.', ['closure'], 'March 30 snapshot and April 30–July 31 swap timeline.'), fact('Current completion, unclaimed assets and support outcomes are not reported in the reviewed sources.', ['closure', 'pc-gamer'], 'Shutdown reports do not provide later completion audits.', 'unknown')],
    ),
    token_and_value_capture: section(
      'The operator historically captured value through NFT sales and a game economy linked to REVV; players could trade assets and earn tokens in supported modes. The 1-1-1 car’s 415.9 ETH sale was a historical auction event, not a current valuation or a measure of broad player demand. After closure, some assets qualified for replacement NFTs, staking access or limited payouts. Those offers did not create equity or guarantee recovery equal to purchase price, and current original-asset liquidity is unverified.',
      [fact('The strategy update reports the 1-1-1 car auction at 415.9 ETH.', ['strategy'], 'Historical F1 Delta Time auction slide.'), fact('The operator offered replacement, staking and payout paths by asset class.', ['closure'], 'Wind-down benefits sections.'), fact('The reviewed sources do not establish equivalent-value recovery or current liquidity.', ['closure', 'pc-gamer'], 'Replacement language and closure reporting lack current recovery data.', 'unknown')],
    ),
    counterfactual: section(
      'A less license-dependent racing brand could have reduced the risk that one contract renewal would end the customer product, but it would also have surrendered Formula 1’s distribution and authenticity. Longer notice, perpetual fallback utility and published recovery audits might have improved the wind-down. The record does not show that any alternative would have retained users or revenue, and it does not reveal whether Animoca had a practical path to renew the license. These are design lessons, not reconstructed history.',
      [fact('The actual product required licensed Formula 1 branding.', ['whitepaper', 'closure'], 'Product design and shutdown reason.'), fact('The shutdown announcement arrived one day before cessation.', ['closure', 'pc-gamer'], 'March 15 announcement and March 16 cessation.'), fact('No source establishes the result of an unlicensed design or different notice period.', ['closure', 'pc-gamer'], 'Observed record includes only the actual wind-down.', 'unknown')],
    ),
    risks_and_unknowns: section(
      'The case shows a core NFT-game risk: custody of a token is not custody of the license, servers or promised experience around it. Original F1 assets can remain in wallets after their branded use ends, while replacement value depends on separate products and deadlines. Unknowns include the reason and terms of license non-renewal, player counts before closure, project profitability, swap completion, unclaimed assets, current original-asset trading and whether every announced replacement function was delivered as described.',
      [fact('The licensed game ended even though NFT assets could remain.', ['closure', 'pc-gamer'], 'Shutdown and replacement descriptions.'), fact('Swap availability was scheduled to close July 31, 2022.', ['closure'], 'Swap timelines section.'), fact('Negotiation terms, operating economics and current holder recovery remain undisclosed.', ['closure', 'pc-gamer'], 'Source gap across operator and independent reports.', 'unknown')],
    ),
    lifecycle: section(
      'F1 Delta Time launched in 2019, expanded its playable modes in 2020 and used REVV in a branded racing economy. On March 15, 2022 the operator announced that it could not renew the Formula 1 license; play ended on March 16. A transition program then offered snapshots, swaps and temporary benefits into REVV Motorsport. The lifecycle conclusion is terminal for the F1-branded product, with some blockchain artifacts and successor benefits surviving. Persistent tokens do not change that classification.',
      [fact('The product operated from 2019 through March 16, 2022.', ['closure', 'pc-gamer'], 'Operator retrospective and independent report.'), fact('License non-renewal triggered the terminal event.', ['closure', 'pc-gamer'], 'Opening shutdown explanation.'), fact('Successor assets and benefits were offered outside the closed F1 product.', ['closure'], 'Wind-down transition program.')],
    ),
    outlook_and_watch: section(
      'The product outlook is closed: no reviewed evidence supports a return of F1 Delta Time. The remaining research task is holder recovery, not growth forecasting. Watch for an audited wind-down report, final swap completion, unclaimed assets, current marketplace activity in original tokens and continuing utility of replacement cars, Race Passes and proxy assets. Keep any future Formula 1, Animoca or REVV game separate unless it explicitly restores rights to this product. A surviving contract or token balance is not a reopened game.',
      [fact('The operator notice describes cessation, not a pause.', ['closure'], 'Opening and final shutdown statements.'), fact('Replacement assets belong to wider REVV products.', ['closure'], 'Replacement program descriptions.'), fact('No current recovery audit or reopening notice was found in the reviewed sources.', ['closure', 'pc-gamer'], 'Current source review.', 'unknown')],
    ),
  },
  events: [
    { key: 'launch', type: 'product_launch', date: '2019-01-01', datePrecision: 'year', description: 'F1 Delta Time began operating in 2019.', sources: ['closure', 'pc-gamer'], locator: 'Operator retrospective and independent launch description.' },
    { key: 'closure-announcement', type: 'closure_announcement', date: '2022-03-15', datePrecision: 'day', description: 'Animoca announced license non-renewal and the next-day shutdown.', sources: ['closure'], locator: 'Opening operator statement.' },
    { key: 'closure', type: 'product_cessation', date: '2022-03-16', datePrecision: 'day', description: 'F1 Delta Time ceased operations.', sources: ['closure', 'pc-gamer'], locator: 'Dated operator and independent reports.' },
  ],
  identityBoundary: 'F1 Delta Time, its Ethereum tokens, the Formula 1 license, Animoca Brands, REVV and successor REVV Motorsport products are distinct objects.',
  metricBoundary: 'Historical auction prices and token reward totals are not current asset value, broad demand, profitability or holder recovery.',
  guardrail: 'State the verified license dependency as the shutdown cause. Do not invent the reason the license was not renewed or equate replacements with full recovery.',
  unknowns: ['license_nonrenewal_terms', 'preclosure_player_counts', 'project_profitability', 'swap_completion', 'unclaimed_assets', 'current_original_asset_liquidity', 'replacement_delivery_audit'],
  methodologyNotes: ['The operator’s causal statement is independently corroborated. Historical auction and reward figures are kept out of current metrics.'],
});

const smb = 'solana-monkey-business';
const smbSources = [
  source(smb, 'operator', 'Solana Monkey Business collections', 'https://solanamonkey.business/', 'MonkeDAO', null, 'B', 'primary', { independence_group: 'monkedao' }),
  source(smb, 'dao-site', 'MonkeDAO', 'https://monkedao.io/', 'MonkeDAO', null, 'B', 'primary', { independence_group: 'monkedao' }),
  source(smb, 'decrypt-acquisition', 'Solana Monkey Business IP Acquired by DAO of NFT Holders', 'https://decrypt.co/137393/solana-monkey-business-ip-acquired-dao-nft-holders', 'Decrypt', '2023-04-20', 'B', 'independent', { independence_group: 'decrypt' }),
  source(smb, 'vote', 'MonkeDAO governance', 'https://vote.monkedao.io/', 'MonkeDAO', null, 'B', 'primary', { independence_group: 'monkedao' }),
];

const solanaMonkeyBusiness = buildProfile({
  slug: smb,
  name: 'Solana Monkey Business (Gen2)',
  type: 'nft_collection',
  classification: { subtype: 'DAO-stewarded Solana profile-picture collection', tags: ['solana', 'pfp', 'monkedao', 'community_ip', 'royalties'], chains: ['Solana'], jurisdictions: [] },
  sources: smbSources,
  operatingState: 'community_stewarded_operating',
  statusAssertion: 'MonkeDAO continued to steward the Gen2 collection, its official surfaces and related Gen3 program at the review date.',
  statusSources: ['operator', 'dao-site', 'vote'],
  statusLocator: 'Current first-party collection, MonkeDAO and governance surfaces.',
  outcome: 'middling_active_stewardship_economics_unverified',
  outcomeConfidence: 'medium',
  outcomeAssertion: 'Community stewardship and delivered IP control establish continuity, while current Gen2 demand, retention and treasury economics remain unverified.',
  outcomeSources: ['operator', 'decrypt-acquisition'],
  outcomeLocator: 'Current MonkeDAO collection record and independent report of the completed 2023 IP acquisition.',
  sections: {
    what_it_is: section(
      'Solana Monkey Business Gen2 is a 5,000-piece pixel-art profile-picture collection minted on Solana on August 3, 2021. It sits inside a wider SMB family that includes Gen1, Gen3 and legacy collectibles, but this report keeps the Gen2 cohort separate. MonkeDAO, a holder community that formed around the collection, now stewards the brand and IP. Owning a Gen2 is not the same as owning MonkeDAO’s treasury, validator, investments or a legal share of its operations.',
      [fact('Gen2 contains 5,000 Solana NFTs minted August 3, 2021.', ['operator'], 'SMB Gen2 section.'), fact('MonkeDAO currently presents Gen2, Gen3 and legacy collections.', ['operator'], 'Current collection site.'), fact('Gen2 ownership is distinct from ownership of the DAO or its treasury.', ['operator', 'decrypt-acquisition'], 'Collection and DAO descriptions do not grant equity.', 'unknown')],
    ),
    what_happened: section(
      'The original creators launched Gen2 in 2021, and holders organized MonkeDAO soon afterward. Disputes developed over control and royalty funding. Hadeswap later acquired the SMB IP, then MonkeDAO purchased the IP, keys, assets and accounts for $2 million in April 2023. The DAO subsequently presented Gen3 distribution and auctions while continuing the Gen2 collection. That sequence moved brand control closer to the holder community, but it does not itself prove current collection demand or profitable execution.',
      [fact('Gen2 launched in August 2021 and MonkeDAO formed around holders.', ['operator', 'decrypt-acquisition'], 'Current collection facts and Decrypt history.'), fact('MonkeDAO completed a $2 million purchase of the SMB IP and related control assets in April 2023.', ['decrypt-acquisition'], 'Decrypt acquisition report.'), fact('The current site presents a later Gen3 program alongside Gen2.', ['operator'], 'SMB Gen3 and Gen2 sections.')],
    ),
    why_this_outcome: section(
      'SMB avoided a clean abandonment because an organized holder community built coordination outside the original team, then acquired the IP and control surfaces it had been supporting. That aligned brand stewardship more closely with active community members and enabled the later Gen3 program. The same move also concentrated responsibility and financing inside MonkeDAO. Current sources do not show whether IP ownership improved Gen2 liquidity, holder retention or treasury returns, so the outcome remains active but economically unproven.',
      [fact('MonkeDAO organized around SMB holders before it owned the IP.', ['decrypt-acquisition'], 'DAO formation and community initiatives.'), fact('The DAO acquired the IP, keys, assets and accounts in 2023.', ['decrypt-acquisition'], 'Completed acquisition details.'), fact('Current sources do not measure the acquisition’s effect on Gen2 demand or retention.', ['operator', 'decrypt-acquisition'], 'Current operator site and acquisition article lack post-deal cohort data.', 'unknown')],
    ),
    strategic_choices: section(
      'The project’s most consequential choice was not a mint feature but a governance move: the holder DAO bought the brand it had organized around. MonkeDAO also directs 5% Gen2 royalties to its treasury and expanded the family through Gen3. These choices create resources and a broader funnel for community work, while adding treasury governance and dilution risk. A Gen3 sale or DAO initiative can benefit the wider brand without automatically increasing Gen2 holder value, participation or resale demand.',
      [fact('MonkeDAO bought the SMB IP after earlier control disputes.', ['decrypt-acquisition'], 'Acquisition chronology.'), fact('The current operator says 5% of each Gen2 secondary sale is sent to the MonkeDAO treasury.', ['operator'], 'SMB Gen2 royalties field.'), fact('The Gen3 expansion is economically and contractually separate from Gen2.', ['operator'], 'Separate Gen3 and Gen2 sections.', 'inference')],
    ),
    operating_model: section(
      'MonkeDAO controls the SMB IP and presents the official collection, governance and later-generation program. Owners custody Gen2 NFTs and may trade them on third-party Solana marketplaces. The official site says Gen2 royalties flow to the DAO treasury, where governance rather than individual NFT ownership determines spending. This model can fund community work, but the reviewed pages do not provide current royalty receipts, treasury balances, spending effectiveness, staff compensation or active-member counts.',
      [fact('MonkeDAO controls the SMB IP and related operating assets.', ['decrypt-acquisition'], 'Completed purchase details.'), fact('The current MonkeDAO site presents an operating member community and official programs.', ['dao-site'], 'Current home-page community and program sections.'), fact('Current royalty receipts, treasury efficiency and verified active-member counts are not disclosed in the reviewed sources.', ['operator', 'dao-site', 'vote'], 'Current operator and governance surface review.', 'unknown')],
    ),
    token_and_value_capture: section(
      'Gen2 holders can sell their NFTs and may receive access or status from participation in the wider MonkeDAO community, but the reviewed record does not grant them a fixed share of DAO revenue. The operator states that 5% secondary-sale royalties go to the MonkeDAO treasury, not directly to every holder. The $2 million IP purchase was a DAO capital decision, not a distribution to holders. There is no verified SMB Gen2 fungible token, guaranteed yield or current royalty and resale figure in this report.',
      [fact('The operator states a 5% Gen2 royalty destination to the MonkeDAO treasury.', ['operator'], 'SMB Gen2 royalties field.'), fact('The DAO paid $2 million to acquire SMB IP and related assets.', ['decrypt-acquisition'], 'Purchase value and scope.'), fact('No direct holder revenue share, guaranteed yield or current royalty total is disclosed.', ['operator', 'decrypt-acquisition'], 'Rights and economics review.', 'unknown')],
    ),
    counterfactual: section(
      'Earlier alignment between the original creators and MonkeDAO could have reduced the royalty and control dispute that preceded the IP purchase. Publishing treasury economics and Gen2-specific retention after the acquisition would now make the model easier to judge. A narrower focus on Gen2 might reduce cross-generation dilution, while Gen3 may also broaden distribution. The evidence does not establish which path would have produced stronger value, and the counterfactual cannot assume community ownership automatically solves execution.',
      [fact('A creator-DAO funding and royalty dispute preceded the IP acquisition.', ['decrypt-acquisition'], 'Dispute and wrapping discussion.'), fact('MonkeDAO later chose broader Gen3 expansion.', ['operator'], 'Gen3 launch phases.'), fact('No observed record compares Gen2-only and multi-generation outcomes.', ['operator', 'decrypt-acquisition'], 'Available sources cover only the chosen path.', 'unknown')],
    ),
    risks_and_unknowns: section(
      'The main risk is that community stewardship becomes difficult to evaluate without transparent treasury and cohort data. Royalties depend on actual secondary sales and marketplace enforcement; a stated percentage is not cash received. Gen3 can strengthen the brand or divide attention across more assets. Current Gen2 floor, bid depth, unique buyers and sellers, holder concentration, royalty receipts, treasury runway, voter participation and overlap between Gen2, Gen3 and active DAO members are unknown.',
      [fact('The royalty policy is expressed as a percentage of secondary sales.', ['operator'], 'SMB Gen2 royalties field.'), fact('The brand now includes a much larger Gen3 program.', ['operator'], 'Gen3 supply and distribution sections.'), fact('Current market, royalty, treasury and membership measures are not in the reviewed sources.', ['operator', 'vote', 'decrypt-acquisition'], 'Current evidence gap.', 'unknown')],
    ),
    lifecycle: section(
      'SMB began with Gen1 in June 2021 and the 5,000-piece Gen2 release that August. MonkeDAO formed as an independent holder collective and became the durable coordination layer through disputes with prior IP owners. On April 20, 2023 independent reporting confirmed that the DAO had purchased the IP and related control assets. The current official site shows continuing stewardship and Gen3 delivery. Gen2 is therefore active under community control, with its present market and treasury outcome still unresolved.',
      [fact('Gen1 and Gen2 launched in June and August 2021.', ['operator', 'decrypt-acquisition'], 'Current collection dates and independent history.'), fact('MonkeDAO acquired SMB control assets in April 2023.', ['decrypt-acquisition'], 'Dated acquisition report.'), fact('Current first-party surfaces continue to present Gen2 and Gen3.', ['operator', 'vote'], 'Current collection and governance sites.')],
    ),
    outlook_and_watch: section(
      'Base case: MonkeDAO continues to operate SMB as a community-owned brand, while Gen2 remains one cohort inside a larger portfolio. Watch Gen2-specific unique buyers and sellers, executable bids, royalty receipts, treasury statements, voter participation, Gen3 delivery, holder overlap and any licensing revenue. A DAO vote, a 5% royalty setting or the existence of Gen3 is not proof that Gen2 holders are retained or financially better off. The next review should separate community activity from collection economics.',
      [fact('MonkeDAO currently operates collection, community and governance surfaces.', ['operator', 'dao-site', 'vote'], 'Current first-party sites.'), fact('Gen2 royalties and Gen3 activity create observable watch surfaces.', ['operator'], 'Royalty and Gen3 sections.'), fact('Current Gen2 retention and holder financial outcomes are not disclosed.', ['operator', 'dao-site', 'decrypt-acquisition'], 'Current-source gap.', 'unknown')],
    ),
  },
  events: [
    { key: 'gen2-launch', type: 'collection_launch', date: '2021-08-03', datePrecision: 'day', description: 'The 5,000-piece SMB Gen2 collection minted on Solana.', sources: ['operator'], locator: 'SMB Gen2 section.' },
    { key: 'ip-acquisition', type: 'control_transfer', date: '2023-04-20', datePrecision: 'day', description: 'MonkeDAO completed its $2 million acquisition of SMB IP and control assets.', sources: ['decrypt-acquisition'], locator: 'Dated acquisition report.' },
    { key: 'current-review', type: 'research_review', date: '2026-08-03', datePrecision: 'day', description: 'Current collection, community, governance and independent acquisition evidence was reviewed.', sources: ['operator', 'dao-site', 'vote', 'decrypt-acquisition'], locator: 'Named sources reviewed at the research timestamp.' },
  ],
  identityBoundary: 'SMB Gen2, other SMB generations, individual NFT owners, MonkeDAO, the DAO treasury and third-party marketplaces have distinct rights and economics.',
  metricBoundary: 'A stated royalty rate, historical acquisition price or Gen3 ticket volume is not current Gen2 revenue, liquidity, holder value or treasury health.',
  guardrail: 'Credit the completed community IP acquisition without assuming that DAO ownership proves economic success for the Gen2 cohort.',
  unknowns: ['gen2_unique_buyers_and_sellers', 'executable_bid_depth', 'holder_concentration', 'royalty_receipts', 'treasury_runway_and_spending', 'active_voters', 'cross_generation_holder_overlap', 'licensing_revenue'],
  methodologyNotes: ['The operator’s raffle figures are excluded from metrics because they are historical, self-reported and mostly refunded. The Decrypt acquisition report is the independent control-transfer source.'],
});

const axie = 'axie-origin-axies';
const axieSources = [
  source(axie, 'marketplace', 'Origin Axies collection', 'https://app.axieinfinity.com/marketplace/axies/origin/', 'Sky Mavis', null, 'B', 'primary', { independence_group: 'sky_mavis', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source(axie, 'collector-guide', 'The 2026 Axie Collector’s Guide', 'https://blog.axieinfinity.com/p/the-2024-axie-collectors-guide', 'Axie Infinity / Sky Mavis', '2024-07-02', 'B', 'primary', { independence_group: 'sky_mavis' }),
  source(axie, 'season-18', 'Origins S18 is LIVE!', 'https://blog.axieinfinity.com/p/origins-s18-is-live', 'Axie Infinity / Sky Mavis', '2026-07-08', 'B', 'primary', { independence_group: 'sky_mavis' }),
  source(axie, 'collectible-overview', 'Collectible Axies Overview', 'https://support.axieinfinity.com/hc/en-us/articles/19305751198619-Collectible-Axies-Overview', 'Sky Mavis', null, 'B', 'primary', { independence_group: 'sky_mavis', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source(axie, 'economics-study', 'Playing, earning, crashing, and grinding: Axie Infinity and growth crises in the Web3 economy', 'https://journals.sagepub.com/doi/10.1177/20539517251357296', 'Big Data & Society', '2025-07-21', 'A', 'independent', { independence_group: 'sage_big_data_and_society', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
];

const axieOrigin = buildProfile({
  slug: axie,
  name: 'Axie Infinity Origin Axies',
  type: 'nft_collection',
  classification: { subtype: 'founding-cohort playable game-asset collection', tags: ['ronin', 'gaming', 'collectible', 'origin_cohort', 'conditional_rewards'], chains: ['Ronin', 'Ethereum'], jurisdictions: [] },
  sources: axieSources,
  operatingState: 'operating_current_game_integration',
  statusAssertion: 'Origin Axies remained integrated into an operating game and current collectible reward system during Origins Season 18.',
  statusSources: ['season-18', 'collector-guide', 'marketplace'],
  statusLocator: 'July 2026 season terms, current collector guide and current collection surface.',
  outcome: 'operating_established_cohort_economics_unverified',
  outcomeConfidence: 'medium',
  outcomeAssertion: 'Scarce founding provenance and current conditional game benefits establish continuity, while holder retention, liquidity and realized reward economics remain unverified.',
  outcomeSources: ['season-18', 'collector-guide', 'economics-study'],
  outcomeLocator: 'Current season and collection benefits compared with independent research on Axie’s historical incentive and growth risks.',
  sections: {
    what_it_is: section(
      'Origin Axies are the earliest Axies sold from February through April 2018. The current marketplace describes a cap of 4,088, while the collector guide explains that some unrolled Axie Origin Coin tokens could later create higher-numbered Origin Axies; those statements need reconciliation before treating 4,088 as a current circulating count. Origin Axies are playable game assets and a provenance cohort. They are not the same as the game named Axie Infinity: Origins, and they do not represent Sky Mavis equity.',
      [fact('Origin Axies were sold from February through April 2018.', ['marketplace', 'collector-guide'], 'Current collection description and collector guide.'), fact('The marketplace states a 4,088 cap, while the guide describes unrolled AOC-based creation.', ['marketplace', 'collector-guide'], 'Supply statements in both official sources.'), fact('The Origin collectible cohort is distinct from the game title Axie Infinity: Origins.', ['marketplace', 'season-18'], 'Collection identity compared with current season product name.')],
    ),
    what_happened: section(
      'The Origin cohort launched before Ronin and became the historical base of the wider Axie collection. The operator later migrated Axie Origin Coin functionality to Ronin and attached continuing collectible benefits. In July 2026 Origins Season 18 offered an 80,000 bAXS competitive pool and a separate 10,000 bAXS collectible-chest pool. Eligibility required rank and continuous ownership through the era. This proves an active holder-linked program, but it does not show how many Origin holders qualified or what they realized.',
      [fact('The Origin cohort predates Ronin and began in 2018.', ['marketplace', 'collector-guide'], 'Collection history.'), fact('The collector guide describes migration of remaining Axie Origin Coin functionality to Ronin.', ['collector-guide'], 'Origin Axies section.'), fact('Season 18 offered conditional collectible chests tied to rank and continuous holding.', ['season-18'], 'Collectible Chest Reminder and rules.')],
    ),
    why_this_outcome: section(
      'Origin Axies persist because they combine a scarce founding identity with uses inside a game that is still being updated. Sky Mavis has repeatedly attached new perks, progression and competitive reward eligibility to collectible cohorts, giving owners reasons to keep the asset beyond simple display. That mechanism supports continuity, not a financial success claim. Independent research on Axie’s earlier growth crises shows why token incentives and asset scarcity must be separated from retained enjoyment and sustainable demand.',
      [fact('The cohort’s founding provenance and current benefits are documented by Sky Mavis.', ['marketplace', 'collector-guide', 'season-18'], 'Collection history, benefit list and current season terms.'), fact('Current benefits require active game participation rather than passive ownership alone.', ['season-18', 'collectible-overview'], 'Rank, holding and chest conditions.'), fact('Independent research documents Axie’s historical tension between financial incentives, growth and durable play.', ['economics-study'], 'Research abstract and analysis.', 'inference')],
    ),
    strategic_choices: section(
      'Sky Mavis chose to preserve the founding cohort as a status layer while adding recurring utility: Fortune Slips, progression options, collectible chests and new game surfaces. It also moved later collection functions to Ronin and now distributes season rewards in non-transferable bAXS. Those choices reward ecosystem participation and can reduce immediate extraction, but they increase rule complexity and operator dependence. A benefit can be changed, gated by rank or burdened by conversion fees without changing NFT custody.',
      [fact('Origin benefits include Fortune Slips, progression and collectible chests.', ['collector-guide', 'collectible-overview'], 'Origin benefit lists and collectible reward system.'), fact('Season 18 rewards use non-transferable bAXS backed 1:1 by AXS.', ['season-18'], 'bAXS Rewards section.'), fact('Benefit eligibility depends on current operator rules and game participation.', ['season-18', 'collectible-overview'], 'Rank, holding and ticket-expiry conditions.', 'inference')],
    ),
    operating_model: section(
      'Sky Mavis operates the Axie game, marketplace, collectible classifications, season rules and reward systems. Holders custody Origin Axies on blockchain rails, but the practical benefits are delivered through maintained applications and accounts. Season 18 required eligible players to hold a collectible for the full era and meet a rank threshold; rewards were then subject to ticket redemption and bAXS rules. Public sources do not disclose Origin-specific staffing, costs, active-holder counts or reward redemption rates.',
      [fact('Sky Mavis operates the official marketplace and current season program.', ['marketplace', 'season-18'], 'Current first-party surfaces.'), fact('Collectible chest eligibility requires holding and rank conditions.', ['season-18', 'collectible-overview'], 'Season and support rules.'), fact('Origin-specific operating cost, active-holder and redemption data are not published.', ['marketplace', 'season-18', 'collector-guide'], 'Current operator disclosures omit these fields.', 'unknown')],
    ),
    token_and_value_capture: section(
      'A holder can sell an Origin Axie, use it in supported games and pursue conditional collectible rewards. Season 18 paid in bAXS, a non-transferable token backed 1:1 by AXS; conversion to transferable AXS requires a treasury fee that varies with Axie Score. The 80,000 bAXS season pool is for top players broadly, while the 10,000 bAXS collectible pool is the more relevant holder program. Neither allocation is an Origin-holder dividend, and no current resale depth, realized reward or operator revenue is disclosed.',
      [fact('Season 18 used bAXS for player and collectible reward pools.', ['season-18'], 'Key points and bAXS sections.'), fact('bAXS conversion to AXS carries a Treasury fee scaled to Axie Score.', ['season-18'], 'bAXS conversion paragraph.'), fact('The reward pools are conditional programs, not automatic Origin-holder revenue rights.', ['season-18', 'collectible-overview'], 'Eligibility and redemption conditions.', 'inference')],
    ),
    counterfactual: section(
      'Publishing an exact current Origin supply, holder count, reward participation and redemption record would make the cohort easier to value. Simpler benefit rules or transferable rewards might improve usability, but could also increase extraction and short-term farming—the behavior bAXS is designed to limit. A model less dependent on operator-set perks would reduce policy risk but might remove the recurring reasons to use the asset. The evidence does not show which alternative would improve retention or holder outcomes.',
      [fact('Current official sources create a supply question between the stated cap and unrolled AOC mechanics.', ['marketplace', 'collector-guide'], 'Conflicting or incomplete supply descriptions.'), fact('bAXS non-transferability is designed to keep value inside the ecosystem.', ['season-18'], 'Official bAXS rationale.'), fact('No observed experiment establishes outcomes under simpler or transferable rewards.', ['season-18', 'economics-study'], 'Current design and independent history only.', 'unknown')],
    ),
    risks_and_unknowns: section(
      'Origin value depends on continued Sky Mavis operation, the relevance of Axie games and rules that preserve collectible benefits. The operator can change rank gates, reward assets, conversion fees or eligibility windows. The marketplace currently returned blank aggregate fields in the reviewed page; blank is unavailable, not zero. Current Origin supply after AOC use, owners, listed count, floor, executable bids, unique buyers and sellers, reward participation, bAXS redemption and holder concentration remain unknown.',
      [fact('Season rewards and conversion terms are operator-defined and conditional.', ['season-18'], 'Season 18 rules.'), fact('The current marketplace surface returned blank totals, owners, volume and listed fields in the reviewed snapshot.', ['marketplace'], 'Collection header fields.', 'unknown'), fact('Independent research documents historical Axie exposure to growth and token-economy cycles.', ['economics-study'], 'Research abstract and growth-crisis analysis.')],
    ),
    lifecycle: section(
      'Origin Axies were sold in the first Axie presale from February through April 2018. The cohort survived later game versions and a move from Ethereum-era infrastructure into the Ronin-centered ecosystem. By 2026 Sky Mavis still listed specific Origin benefits and included collectible holders in the current Origins season reward design. The lifecycle is an operating legacy cohort with active integration. It is not evidence that the collection retained its peak market value, owner base or economic importance.',
      [fact('The founding sale occurred February through April 2018.', ['marketplace', 'collector-guide'], 'Origin collection history.'), fact('Origin-related functionality later moved to Ronin.', ['collector-guide'], 'AOC migration discussion.'), fact('Current season rules still included collectible Axie holders in July 2026.', ['season-18'], 'Collectible chest program.')],
    ),
    outlook_and_watch: section(
      'Base case: Origin Axies remain a recognized founding cohort with recurring game integration, while financial health stays unresolved. Watch the September 2 Season 18 completion, unique Origin holders who qualified, tickets redeemed, bAXS converted, changes to collectible perks, reconciliation of the 4,088 supply statement, 30- and 90-day buyers and sellers and executable bids. Do not use the full Axie player pool, AXS price, Ronin activity or the headline reward pool as a substitute for Origin-specific retention and value.',
      [fact('Season 18 was scheduled to end September 2, 2026.', ['season-18'], 'Season timeline.'), fact('Origin benefits and supply mechanics create measurable collection-specific watch items.', ['collector-guide', 'marketplace'], 'Benefit and collection descriptions.'), fact('Current Origin-specific retention, reward realization and liquidity are not disclosed.', ['season-18', 'marketplace', 'collector-guide'], 'Current evidence gap.', 'unknown')],
    ),
  },
  events: [
    { key: 'presale', type: 'collection_sale', date: '2018-02-01', datePrecision: 'month', description: 'The Origin Axie presale began in February 2018 and ran through April.', sources: ['marketplace', 'collector-guide'], locator: 'Current collection history.' },
    { key: 'season-18', type: 'current_game_season', date: '2026-07-08', datePrecision: 'day', description: 'Origins Season 18 launched with conditional collectible-holder rewards.', sources: ['season-18'], locator: 'Dated season announcement.' },
    { key: 'season-18-end', type: 'scheduled_review_trigger', date: '2026-09-02', datePrecision: 'day', description: 'Season 18 was scheduled to end, creating a holder-reward review point.', sources: ['season-18'], locator: 'Season timeline.' },
  ],
  identityBoundary: 'Origin Axies the collectible cohort, Axie Infinity: Origins the game, all Axies, Sky Mavis, Ronin, AXS and bAXS have distinct scopes and economics.',
  metricBoundary: 'Reward-pool allocations are not Origin-holder revenue, and blank marketplace fields are unavailable rather than zero.',
  guardrail: 'Keep the Origin collectible cohort separate from the Origins game. State reward conditions and do not infer holder success from the wider Axie ecosystem.',
  unknowns: ['current_origin_supply_reconciliation', 'origin_holder_count', 'listed_count_and_executable_bids', 'unique_buyers_and_sellers', 'reward_qualifiers', 'ticket_redemptions', 'baxs_realization', 'holder_concentration'],
  methodologyNotes: ['The current marketplace is browser-visible but direct HTTP 403; blank aggregate fields are preserved as unavailable. The independent study supplies historical system risk, not current collection metrics.'],
});

export const document = {
  schema: 'chaindump-nft-depth-wave-a-v1',
  version: 1,
  research_as_of: AS_OF,
  generated_at: ACCESSED_AT,
  generated_migration: '0093_nft_depth_wave_a.sql',
  selection_method: 'Five shallowest routed nft_collections rows without a native canonical_profile after migration 0090, measured by profile JSON byte length.',
  entities: [
    { slug: frogs, legacy_status: 'unknown', canonical_profile: bitcoinFrogs },
    { slug: gods, legacy_status: 'thriving', canonical_profile: godsUnchained },
    { slug: f1, legacy_status: 'dead', canonical_profile: f1DeltaTime },
    { slug: smb, legacy_status: 'middling', canonical_profile: solanaMonkeyBusiness },
    { slug: axie, legacy_status: 'thriving', canonical_profile: axieOrigin },
  ],
};

export const profiles = Object.fromEntries(document.entities.map((entry) => [entry.slug, entry.canonical_profile]));

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function renderMigration(value = document) {
  const statements = value.entities.map((entry) => {
    const canonical = JSON.stringify(entry.canonical_profile);
    const statement = `INSERT INTO ${TARGET_TABLE} (slug, canonical_profile) VALUES (${sqlLiteral(entry.slug)}, ${sqlLiteral(canonical)});`;
    if (Buffer.byteLength(statement, 'utf8') > MAX_D1_STATEMENT_BYTES) {
      throw new Error(`${entry.slug}: D1 statement exceeds ${MAX_D1_STATEMENT_BYTES} bytes`);
    }
    return statement;
  }).join('\n\n');
  return `-- Five current, source-linked NFT and Ordinals profiles researched ${AS_OF} and awaiting human review.
-- Existing legacy profile fields, row statuses and source lists are preserved.

DROP TABLE IF EXISTS ${TARGET_TABLE};

CREATE TABLE ${TARGET_TABLE} (
  slug TEXT PRIMARY KEY,
  canonical_profile TEXT NOT NULL CHECK (json_valid(canonical_profile))
);

-- canonical-payload-start
${statements}
-- canonical-payload-end

UPDATE nft_collections AS collection
SET
  profile = json_set(
    COALESCE(collection.profile, '{}'),
    '$.canonical_profile', json(staged.canonical_profile)
  ),
  updated_at = '${AS_OF}'
FROM ${TARGET_TABLE} AS staged
WHERE collection.slug = staged.slug;

DROP TABLE ${TARGET_TABLE};
`;
}

function writeOutputs() {
  writeFileSync(artifactPath, `${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(migrationPath, renderMigration());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) writeOutputs();

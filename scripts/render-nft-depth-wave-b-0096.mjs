#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYSIS_SECTION_KEYS, validateEntityProfile } from '../src/lib/entity-profile.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(root, 'docs/nft-depth-wave-b-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0096_nft_depth_wave_b.sql');
const AS_OF = '2026-08-03';
const ACCESSED_AT = '2026-08-03T21:25:00Z';
const NEXT_REVIEW_AT = '2026-08-10T21:25:00Z';
const MAX_D1_STATEMENT_BYTES = 95_000;
const TARGET_TABLE = '_nft_depth_wave_b_0096';

const sourceId = (slug, key) => `source:${slug}:${key}`;

function source(slug, key, title, url, publisher, publishedAt, role, details = {}) {
  return {
    id: sourceId(slug, key),
    title,
    url,
    publisher,
    published_at: publishedAt,
    published_at_precision: details.published_at_precision || (publishedAt ? 'day' : null),
    accessed_at: ACCESSED_AT,
    archive_url: details.archive_url || null,
    tier: details.tier || (role === 'primary' ? 'A' : 'B'),
    role,
    access_state: details.access_state || 'reachable',
    checked_at: ACCESSED_AT,
    access_final_url: details.final_url || url,
    content_hash: null,
    independence_group: details.independence_group || publisher,
    access_method: details.access_method || 'direct_http',
    direct_http_status: details.direct_http_status === undefined ? 200 : details.direct_http_status,
  };
}

function claim(assertion, sources, locator, kind = 'fact', note = null) {
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
        source_ids: item.sources.map((keyName) => sourceId(spec.slug, keyName)),
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
      source_ids: spec.statusSources.map((key) => sourceId(spec.slug, key)),
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
      source_ids: spec.outcomeSources.map((key) => sourceId(spec.slug, key)),
      evidence_locator: spec.outcomeLocator,
      support_direction: 'supports',
      note: 'Lifecycle classification, not a price forecast or holder-profitability claim.',
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    },
  );

  const metrics = (spec.metrics || []).map((item) => {
    const id = `metric:${spec.slug}:${item.key}`;
    const claimId = `claim:${spec.slug}:metric:${item.key}`;
    claims.push({
      id: claimId,
      field_path: `metrics[${id}]`,
      assertion: item.assertion,
      value: item.value,
      as_of: item.asOf,
      confidence: item.confidence || 'medium',
      kind: 'fact',
      source_ids: item.sources.map((key) => sourceId(spec.slug, key)),
      evidence_locator: item.locator,
      support_direction: 'supports',
      note: item.note || null,
      review: { state: 'pending', reviewer: null, reviewed_at: null },
    });
    return {
      id,
      dimension: item.dimension,
      label: item.label,
      value: item.value,
      unit: item.unit,
      currency: item.currency || null,
      window: item.window,
      as_of: item.asOf,
      method: item.method,
      scope: item.scope,
      formula: null,
      raw_input_ids: [],
      claim_ids: [claimId],
      quality_flags: item.qualityFlags,
      headline: item.headline === true,
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
      source_ids: item.sources.map((key) => sourceId(spec.slug, key)),
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
    identity: { id: `${spec.type}:${spec.slug}`, type: spec.type, slug: spec.slug, name: spec.name, aliases: spec.aliases || [] },
    classification: spec.classification,
    status: { operating_state: spec.operatingState, as_of: AS_OF, claim_ids: [statusClaimId] },
    outcome: { label: spec.outcome, as_of: AS_OF, rule_id: 'nft-lifecycle-evidence-v1', confidence: spec.outcomeConfidence, claim_ids: [outcomeClaimId] },
    analysis: { sections },
    metrics,
    events,
    sources: spec.sources,
    claims,
    freshness: { state: 'current', last_reviewed_at: ACCESSED_AT, next_review_at: NEXT_REVIEW_AT, field_reviews: [] },
    quality: { publication_state: 'review', completeness_pct: 100, confidence: spec.outcomeConfidence, unsourced_fields: spec.unknowns },
    extensions: {
      legacy_origin: 'nft_collections',
      identity_boundary: spec.identityBoundary,
      metric_boundary: spec.metricBoundary,
      editorial_guardrail: spec.guardrail,
      explicit_unknowns: spec.unknowns,
      methodology_notes: [
        'Source verification and evidence assembly are complete; every claim remains pending until a person reviews it.',
        'Collection activity, operator health, holder rights, adjacent-token economics and market price are kept separate.',
        ...(spec.methodologyNotes || []),
      ],
    },
  };
  const errors = validateEntityProfile(profile);
  if (errors.length) throw new Error(`${spec.slug}: ${JSON.stringify(errors)}`);
  for (const [key, value] of Object.entries(sections)) {
    if (value.body.length < 300 || value.body.length > 1000) throw new Error(`${spec.slug}.${key}: section length ${value.body.length}`);
  }
  return profile;
}

const punksSlug = 'cryptopunks';
const punksSources = [
  source(punksSlug, 'profile', 'CryptoPunks', 'https://nodefoundation.com/cryptopunks', 'Infinite Node Foundation', null, 'primary', { independence_group: 'node_foundation' }),
  source(punksSlug, 'acquisition', 'CryptoPunks Join the NODE Foundation', 'https://hub.cryptopunks.app/cryptopunks-join-the-node-foundation', 'Infinite Node Foundation', '2025-05-13', 'primary', { independence_group: 'node_foundation' }),
  source(punksSlug, 'exhibition', '10,000', 'https://nodefoundation.com/program/10000', 'Infinite Node Foundation', '2026-01-23', 'primary', { independence_group: 'node_foundation' }),
  source(punksSlug, 'market', 'CryptoPunks native marketplace', 'https://www.cryptopunks.app/', 'Infinite Node Foundation', null, 'primary', { independence_group: 'node_foundation' }),
  source(punksSlug, 'license', 'CryptoPunks Terms', 'https://licenseterms.cryptopunks.app/CryptoPunksTerms.pdf', 'Infinite Node Foundation', '2025-08-20', 'primary', { independence_group: 'node_foundation' }),
  source(punksSlug, 'techcrunch', 'NFT phenom CryptoPunks was just sold to a nonprofit', 'https://techcrunch.com/2025/05/13/nft-phenom-cryptopunks-was-just-sold-to-a-nonprofit/', 'TechCrunch', '2025-05-13', 'independent', { independence_group: 'techcrunch' }),
];

const cryptoPunks = buildProfile({
  slug: punksSlug,
  name: 'CryptoPunks',
  type: 'nft_collection',
  classification: { subtype: 'historical generative profile-picture collection', tags: ['ethereum', 'historical', 'pfp', 'nonprofit_stewardship', 'native_marketplace'], chains: ['Ethereum'], jurisdictions: ['United States'] },
  sources: punksSources,
  operatingState: 'operating_nonprofit_stewardship',
  statusAssertion: 'NODE maintains the CryptoPunks IP, native marketplace and a current exhibition program.',
  statusSources: ['profile', 'market', 'exhibition'],
  statusLocator: 'Current NODE collection, marketplace and exhibition surfaces.',
  outcome: 'successful_cultural_infrastructure',
  outcomeConfidence: 'high',
  outcomeAssertion: 'CryptoPunks remains an operating cultural and technical collection under nonprofit stewardship, without relying on a new token or roadmap.',
  outcomeSources: ['profile', 'acquisition', 'exhibition', 'techcrunch'],
  outcomeLocator: 'Current steward activity, completed IP transfer and independent acquisition coverage.',
  sections: {
    what_it_is: section(
      'CryptoPunks is a fixed set of 10,000 algorithmically generated 24-by-24 pixel characters released free on Ethereum in 2017 by Larva Labs founders Matt Hall and John Watkinson. The collection predates ERC-721 and uses its own original market contract, with wrappers available for newer marketplaces. Infinite Node Foundation now owns and stewards the IP. A Punk grants control of the token and licensed uses of its art; it is not equity in NODE, a museum share or a promise of income.',
      [claim('CryptoPunks contains 10,000 works released free on Ethereum in 2017.', ['profile', 'exhibition'], 'NODE collection history and exhibition description.'), claim('Matt Hall and John Watkinson created the collection through Larva Labs.', ['profile', 'exhibition'], 'NODE creator and exhibition credits.'), claim('Punk ownership is distinct from ownership of NODE or its programs.', ['license', 'acquisition'], 'Holder terms and nonprofit IP transfer.', 'inference')],
    ),
    what_happened: section(
      'The project began as a free claim and gradually became a reference point for profile-picture NFTs and onchain art. Yuga Labs acquired the IP in 2022 and expanded holder commercial rights. In May 2025, Yuga transferred the full collection IP to the nonprofit NODE Foundation, with the original creators joining its advisory structure. NODE then opened a permanent Palo Alto hub with the full 10,000-piece exhibition and continued the native marketplace. The collection changed stewards twice without expanding supply or issuing a Punk token.',
      [claim('Yuga acquired CryptoPunks IP in 2022 and NODE acquired it in May 2025.', ['profile', 'acquisition', 'techcrunch'], 'NODE chronology and independent transfer confirmation.'), claim('NODE opened a dedicated 10,000-piece exhibition in January 2026.', ['exhibition'], 'Current exhibition page.'), claim('No CryptoPunks fungible token was introduced in the reviewed transition record.', ['profile', 'acquisition', 'market'], 'Current project and transfer surfaces.', 'unknown')],
    ),
    why_this_outcome: section(
      'CryptoPunks endured because it combined early Ethereum provenance, a fixed and instantly legible cohort, an original onchain marketplace and a community that could keep using the work after its creators stepped back. Later stewards added licensing and institutional presentation without asking holders to migrate into a new collection or token. That reduced roadmap failure risk and kept the historical object stable. These factors plausibly explain cultural durability; they do not prove that any one choice caused prices or liquidity to hold.',
      [claim('The fixed cohort and original marketplace have remained part of the collection since launch.', ['profile', 'exhibition', 'market'], 'NODE technical and exhibition history.'), claim('NODE preserved the collection while adding exhibition and preservation programs.', ['acquisition', 'exhibition'], 'Stewardship plan and current program.'), claim('The effect of those choices on price and liquidity cannot be isolated from the reviewed evidence.', ['market', 'techcrunch'], 'Operation and transfer coverage lacks causal market study.', 'unknown')],
    ),
    strategic_choices: section(
      'Larva Labs chose a free distribution, fixed supply and self-contained market rather than a large primary sale or continuous content roadmap. Yuga later clarified commercial-use rights, while NODE chose nonprofit preservation, open infrastructure and exhibitions instead of adding token incentives. Each decision kept the core artifact recognizable while changing the support system around it. The tradeoff is concentrated stewardship: NODE controls the IP and institutional program even though token holders control their individual Punks.',
      [claim('The original launch used free claims and a fixed 10,000 supply.', ['profile', 'exhibition'], 'Collection history.'), claim('NODE chose nonprofit preservation and exhibition as the current operating model.', ['acquisition', 'exhibition'], 'Acquisition mission and program.'), claim('IP stewardship and individual token ownership remain separate layers.', ['license', 'acquisition'], 'Holder terms and IP transfer.')],
    ),
    operating_model: section(
      'NODE operates as a nonprofit steward of the CryptoPunks IP, collection archive, native marketplace, API and physical exhibition program. Holders transact through the original market or wrapped versions on third-party markets and may use their Punk under the current license. The original artists participate in an advisory capacity, not as a promised product team. NODE does not publish CryptoPunks-specific revenue, costs, marketplace users, licensing income or the financial contribution of its exhibitions, so cultural operation must not be rewritten as profitability.',
      [claim('NODE maintains the collection, native marketplace and exhibition.', ['profile', 'market', 'exhibition'], 'Current first-party surfaces.'), claim('The original creators participate in NODE stewardship and exhibition work.', ['acquisition', 'exhibition'], 'Advisory and artist credits.'), claim('Collection-specific revenue, costs and marketplace users are not disclosed.', ['profile', 'market', 'exhibition'], 'Current public surfaces omit these measures.', 'unknown')],
    ),
    token_and_value_capture: section(
      'CryptoPunks has no collection-specific fungible token in the reviewed record. Holders can sell a Punk and use its associated art within the license, while NODE can create cultural, licensing and institutional programs around the IP. The native marketplace shows bids and sales but no disclosed project take rate or holder dividend. A high sale, museum acquisition or listed floor may demonstrate attention; none automatically sends cash to every holder or proves NODE earned revenue from the event.',
      [claim('No CryptoPunks fungible token is identified by current project sources.', ['profile', 'market', 'license'], 'Current product, market and license review.', 'unknown'), claim('Holders receive token control and licensed art uses rather than a revenue share.', ['license'], 'Current holder terms.'), claim('Marketplace activity is not disclosed as NODE revenue or a holder dividend.', ['market', 'profile'], 'Current market and project pages.', 'inference')],
    ),
    counterfactual: section(
      'A commercial owner could have pursued a new token, paid utility or aggressive licensing program to fund growth, but that would add incentive, dilution and delivery risk to a historically complete work. Abandoning the native market could reduce maintenance costs while increasing dependence on general marketplaces and wrappers. NODE instead chose preservation and public presentation. The record cannot show whether another owner would have created more financial value without weakening the collection’s historical clarity.',
      [claim('NODE selected preservation and exhibition rather than a new collection roadmap.', ['acquisition', 'exhibition'], 'Published stewardship plan.'), claim('The native marketplace reduces some dependence on general NFT marketplaces.', ['market', 'profile'], 'Current collection-specific market surface.', 'inference'), claim('Results under a tokenized or more commercial strategy are unobserved.', ['acquisition', 'techcrunch'], 'Only the chosen transfer is documented.', 'unknown')],
    ),
    risks_and_unknowns: section(
      'The core artifacts are durable, but stewardship decisions, marketplace maintenance and licensing remain concentrated in NODE. The original contract and wrapped ERC-721 versions create market-scope differences that can confuse listings and volume. Current unique holders, concentration, executable bid depth, wash-adjusted volume, marketplace users, NODE funding and collection-specific operating costs are unknown. Institutional recognition can support cultural relevance without protecting holders from price volatility or thin exits.',
      [claim('NODE controls the collection IP and current official infrastructure.', ['acquisition', 'profile', 'market'], 'Ownership and current operation.'), claim('Original and wrapped Punk markets are distinct technical surfaces.', ['market', 'profile'], 'Current marketplace explanation.'), claim('Current holder, liquidity and NODE financial measures are not disclosed.', ['profile', 'market', 'exhibition'], 'Current evidence gap.', 'unknown')],
    ),
    lifecycle: section(
      'CryptoPunks launched free in June 2017, moved from Larva Labs to Yuga Labs in 2022 and then to NODE in May 2025. NODE opened the full-collection 10,000 exhibition in January 2026 and continues to maintain the official market and collection record. The lifecycle call is successful cultural infrastructure: the work remains accessible, traded, licensed and actively stewarded. That label is about continuity and institutionalization, not a claim that current buyers will profit or that every Punk is liquid.',
      [claim('The collection launched in June 2017 and changed IP stewards in 2022 and 2025.', ['profile', 'acquisition'], 'NODE chronology.'), claim('NODE operated a current market and full-collection exhibition in 2026.', ['market', 'exhibition'], 'Current product surfaces.'), claim('The success label excludes holder returns and universal liquidity.', ['market', 'techcrunch'], 'Market and transfer evidence do not establish those outcomes.', 'inference')],
    ),
    outlook_and_watch: section(
      'Base case: CryptoPunks continues as a historically complete collection supported by NODE’s nonprofit preservation, marketplace and exhibition work. Watch maintenance of the market and API, license changes, NODE funding and governance, repeat institutional programs, unique buyers and sellers, executable bids and wrapped-versus-native activity. A museum acquisition or headline sale should be logged as an event, not used alone to change the lifecycle call. The next review should test whether infrastructure and audience participation remain active.',
      [claim('Current stewardship centers on preservation, market infrastructure and exhibitions.', ['profile', 'market', 'exhibition'], 'Current NODE program.'), claim('License and marketplace maintenance are concrete review triggers.', ['license', 'market'], 'Current holder and transaction surfaces.'), claim('Current participation and financial durability require new measurements.', ['profile', 'market', 'exhibition'], 'Present sources do not provide those series.', 'unknown')],
    ),
  },
  metrics: [],
  events: [
    { key: 'launch', type: 'collection_launch', date: '2017-06-01', datePrecision: 'month', description: 'Larva Labs released 10,000 CryptoPunks as free claims on Ethereum.', sources: ['profile', 'exhibition'], locator: 'NODE history and exhibition.' },
    { key: 'node-acquisition', type: 'control_transfer', date: '2025-05-13', datePrecision: 'day', description: 'NODE acquired the full CryptoPunks IP from Yuga Labs.', sources: ['acquisition', 'techcrunch'], locator: 'Dated first-party and independent announcements.' },
    { key: 'node-exhibition', type: 'institutional_program', date: '2026-01-23', datePrecision: 'day', description: 'NODE opened its Palo Alto hub with the 10,000 exhibition.', sources: ['exhibition'], locator: 'Current exhibition page.' },
  ],
  identityBoundary: 'Individual Punks, the original market contract, wrapped ERC-721 versions, holder licenses, NODE, Larva Labs and Yuga Labs have distinct rights and histories.',
  metricBoundary: 'Bids, listings, museum acquisitions and gross secondary sales are not executable portfolio value, NODE revenue or holder yield.',
  guardrail: 'Credit cultural and technical continuity without presenting institutional recognition as price support or a return guarantee.',
  unknowns: ['current_unique_holders', 'holder_concentration', 'executable_bid_depth', 'wash_adjusted_volume', 'native_market_users', 'node_collection_revenue', 'node_operating_costs', 'advisory_decision_rights'],
  methodologyNotes: ['Current market figures were intentionally not promoted because the dynamic page does not provide a stable observation timestamp in the research artifact.'],
});

const redditSlug = 'reddit-collectible-avatars';
const redditSources = [
  source(redditSlug, 'launch', 'Blockchain-Backed Collectible Avatars Coming to Reddit via New Storefront', 'https://redditinc.com/news/blockchain-backed-collectible-avatars-coming-to-reddit-via-new-storefront', 'Reddit', '2022-07-07', 'primary', { independence_group: 'reddit' }),
  source(redditSlug, 'current-help', 'Collectible Avatars on Reddit', 'https://support.reddithelp.com/hc/en-us/articles/6213835889044-Collectible-Avatars-on-Reddit', 'Reddit', '2026-02-04', 'primary', { independence_group: 'reddit', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source(redditSlug, 'import', 'How to import my Collectible Avatar and manage my verified wallets', 'https://support.reddithelp.com/hc/en-us/articles/40643146058900-How-to-import-my-Collectible-Avatar-and-manage-my-verified-wallet-s-associated-with-my-account', 'Reddit', '2026-02-04', 'primary', { independence_group: 'reddit', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source(redditSlug, 'terms', 'Creator Terms', 'https://redditinc.com/policies/creator-terms', 'Reddit', null, 'primary', { independence_group: 'reddit' }),
  source(redditSlug, 'polygon', 'How Reddit onboarded millions with Collectible Avatars', 'https://polygon.technology/blog/how-reddit-crypto-pilled-the-covid-generation-with-easy-to-purchase-collectible-avatars-on-polygon-pos', 'Polygon Labs', '2025-03-27', 'primary', { independence_group: 'polygon_labs' }),
  source(redditSlug, 'pcgamer', "Reddit's NFTs are disappearing in less than 30 days", 'https://www.pcgamer.com/games/oh-no-all-of-reddits-nfts-are-disappearing-in-less-than-30-days-someone-do-something/', 'PC Gamer', '2025-12-04', 'independent', { independence_group: 'future_plc' }),
  source(redditSlug, 'usenix', 'It was honestly just gambling: risks and user understanding in NFT communities', 'https://www.usenix.org/system/files/soups2024-bouma-sims.pdf', 'USENIX Association', '2024-08-01', 'independent', { independence_group: 'usenix', tier: 'A' }),
];

const redditAvatars = buildProfile({
  slug: redditSlug,
  name: 'Reddit Collectible Avatars',
  type: 'nft_collection',
  classification: { subtype: 'social-platform avatar creator program', tags: ['polygon', 'social_identity', 'fiat_onboarding', 'creator_program', 'sunset'], chains: ['Polygon'], jurisdictions: ['United States'] },
  sources: redditSources,
  operatingState: 'primary_program_sunset_residual_utility_supported',
  statusAssertion: 'Reddit no longer sells Collectible Avatars, but still supports avatar display and a simplified off-platform wallet-import flow.',
  statusSources: ['current-help', 'import', 'pcgamer'],
  statusLocator: 'Current Reddit help pages and independent coverage of the 2025-2026 wind-down.',
  outcome: 'mixed_distribution_success_product_sunset',
  outcomeConfidence: 'high',
  outcomeAssertion: 'The program achieved unusually broad blockchain distribution, then ended primary sales while preserving narrower display and transfer support.',
  outcomeSources: ['launch', 'polygon', 'current-help', 'pcgamer'],
  outcomeLocator: 'Original product design, partner-reported scale and current post-sunset support.',
  sections: {
    what_it_is: section(
      'Reddit Collectible Avatars are limited-edition avatar accessories created by independent artists and issued as NFTs on Polygon. Reddit hid most crypto complexity behind fiat checkout and its Vault wallet, then let owners mix avatar traits and receive special profile and comment treatments. The program is now closed to new on-platform sales. Existing holders retain licensed display rights and can use a simplified import flow for off-platform transfers, but they do not own Reddit, Snoo or the underlying creator copyrights.',
      [claim('Collectible Avatars are artist-made limited editions issued on Polygon.', ['launch', 'current-help'], 'Original launch and current help descriptions.'), claim('Reddit integrated fiat purchase, Vault custody and avatar-builder utility.', ['launch'], 'Launch purchase and wallet flow.'), claim('Holder rights are licenses and do not transfer Reddit or creator copyrights.', ['terms', 'current-help'], 'Creator and collector rights sections.')],
    ),
    what_happened: section(
      'Reddit announced the storefront in July 2022 and used fixed fiat prices, automatic wallets and familiar profile customization to reach people who did not need cryptocurrency first. Polygon Labs later reported more than 30 million avatars minted and more than $18 million in sales, including free distributions; those partner figures are not audited Reddit financials. Reddit sunset the creator and primary-sales program in 2025, ended access to the old Vault flow, and by February 2026 documented only existing-avatar display plus a simplified external-wallet import path.',
      [claim('Reddit launched the storefront on July 7, 2022 with fiat pricing and Vault wallets.', ['launch'], 'Dated launch announcement.'), claim('Polygon Labs reported more than 30 million mints and more than $18 million in sales by March 2025.', ['polygon'], 'Partner case study; self-reported program scale.'), claim('Primary sales ended while residual display and off-platform transfer support remained.', ['current-help', 'import', 'pcgamer'], 'Current help and wind-down coverage.')],
    ),
    why_this_outcome: section(
      'The strongest strategic success was distribution: Reddit placed collectible ownership inside a product people already used, accepted local currency and created wallets behind the scenes. That removed the usual exchange, seed-phrase and gas steps from the first interaction. The weakness was durable economics. Free mints inflated distribution counts, later drops fragmented attention, secondary sales stayed off-platform and Reddit eventually decided the creator program was not worth continuing. The sources show the mechanism and sunset, but not Reddit’s ranked internal reasons.',
      [claim('Embedded fiat purchase and automatic wallet creation reduced onboarding friction.', ['launch', 'polygon'], 'Launch mechanics and partner case study.', 'inference'), claim('The final support model excludes on-platform primary and secondary sales.', ['current-help', 'terms'], 'Current help and marketplace limitations.'), claim('Reddit has not published a ranked financial or product explanation for the sunset.', ['current-help', 'pcgamer'], 'Current operator page and independent closure report.', 'unknown')],
    ),
    strategic_choices: section(
      'Reddit chose Polygon for low-cost transactions, fixed fiat prices instead of auctions, creator-designed Snoo traits and in-product visual benefits. It paid creators from primary sales and specified secondary royalties, while never building an on-platform resale market. It later chose to end primary distribution and Vault access rather than keep a full NFT wallet and creator stack alive. These choices made entry simple, but the exit required users who wanted blockchain control to understand external wallets after the program’s most approachable interface disappeared.',
      [claim('Reddit chose Polygon, fixed fiat pricing and integrated avatar utility.', ['launch'], 'Product-design sections.'), claim('Creator terms define primary fees and secondary-royalty economics.', ['terms'], 'Creator Earnings and Reddit Fees sections.'), claim('The wind-down shifted blockchain control toward external-wallet import.', ['import', 'current-help', 'pcgamer'], 'Current import and closure process.', 'inference')],
    ),
    operating_model: section(
      'Reddit operated the creator intake, storefront, fiat collection, minting, Vault integration and avatar-builder utility. Independent creators supplied art under Reddit’s Snoo and marketplace terms. The current terms describe a 20% Reddit primary fee and a split of qualifying secondary royalties, but the help center says Collectible Avatars are no longer sold on Reddit. That mismatch is a lifecycle boundary, not proof that sales continue. Reddit does not publish avatar-specific revenue, costs, active users, creator retention or support burden.',
      [claim('Reddit historically operated creator review, checkout, minting and avatar utility.', ['launch', 'terms'], 'Launch and creator terms.'), claim('The terms define a 20% primary fee while current help says new Reddit sales have ended.', ['terms', 'current-help'], 'Payment terms versus current product status.'), claim('Program-specific revenue, costs and user retention are not disclosed.', ['current-help', 'terms'], 'Current public documentation omits these fields.', 'unknown')],
    ),
    token_and_value_capture: section(
      'There is no Reddit Collectible Avatar fungible token. Artists historically earned primary proceeds after Reddit’s stated fees and could receive part of qualifying third-party resale royalties. Reddit collected its platform fee and part of specified secondary earnings. Holders received use, display and transfer rights rather than a company revenue share. Because Reddit does not run resale, third-party marketplaces may not honor royalties, and a nominal royalty percentage does not establish cash received by creators or Reddit.',
      [claim('No program-specific fungible token is identified in current Reddit product terms.', ['current-help', 'terms'], 'Current product and creator terms.', 'unknown'), claim('Creator and Reddit fee splits are defined for primary and qualifying secondary activity.', ['terms'], 'Payment Terms section.'), claim('Collectors receive licensed utility rather than Reddit revenue rights.', ['current-help', 'terms'], 'Collector rights and creator-license sections.')],
    ),
    counterfactual: section(
      'Reddit could have kept a narrower avatar-only wallet and marketplace, or migrated custody tools gradually while maintaining creator sales. That might have preserved creator continuity and reduced the abrupt shift to external wallets, but it also would have retained product, compliance and support costs. A fully on-platform resale market could have improved discovery and royalty enforcement while increasing marketplace obligations. None of those alternatives were tested publicly, and distribution scale alone does not show that they would have been sustainable.',
      [claim('The actual path ended primary sales and moved transfers off-platform.', ['current-help', 'import', 'pcgamer'], 'Current post-sunset flow.'), claim('Reddit never supported its own secondary-sales market in the reviewed terms.', ['terms', 'current-help'], 'Marketplace acknowledgements and current help.'), claim('Costs and outcomes of narrower or fuller alternatives are not public.', ['current-help', 'pcgamer'], 'Only the chosen wind-down is documented.', 'unknown')],
    ),
    risks_and_unknowns: section(
      'The NFTs remain on Polygon, but practical value depends on Reddit continuing to recognize imported wallets and avatar traits. Holders who missed the Vault transition may face access problems even when the tokens still exist onchain. The creator program’s current contractual status is confusing because legacy terms remain public after primary sales ended. Current active avatars, imported wallets, creator payouts, royalty realization, buyer retention, support claims and usable external-market liquidity are unknown. Wallet counts are not people and free distributions are not sales.',
      [claim('Current utility depends on Reddit account and verified-wallet integration.', ['current-help', 'import'], 'Current display and import workflow.'), claim('Independent coverage documented access risk around the Vault deadline.', ['pcgamer'], 'December 2025 wind-down report.'), claim('Current usage, payout and liquidity measures are not disclosed.', ['current-help', 'terms', 'pcgamer'], 'Current evidence gap.', 'unknown')],
    ),
    lifecycle: section(
      'The lifecycle has three clear stages: a July 2022 launch built around fiat onboarding; rapid expansion through paid and free Polygon distributions; and a 2025-2026 wind-down of the creator storefront and Vault. Reddit still lets existing owners use their art as avatars and import verified external wallets, so the assets and some product utility survive. The correct call is mixed distribution success followed by product sunset—not a live creator marketplace, and not total erasure of the tokens or holder licenses.',
      [claim('The program launched in July 2022 and scaled through paid and free distributions.', ['launch', 'polygon'], 'Launch and partner scale report.'), claim('Reddit later ended sales and its old Vault flow.', ['current-help', 'import', 'pcgamer'], 'Current support and independent wind-down record.'), claim('Existing display and off-platform transfer rights survive the sales shutdown.', ['current-help', 'terms'], 'Current collector rights.')],
    ),
    outlook_and_watch: section(
      'Base case: existing avatars remain usable as Reddit identity items, while the creator marketplace and new-sale thesis stay closed. Watch whether Reddit keeps wallet import and avatar effects working, updates conflicting creator terms, resolves support claims, or introduces a successor digital-goods program. Measure active avatar use, verified wallets, unique secondary buyers and sellers, realized creator royalties and inaccessible legacy Vaults. Do not use 30 million historical mints as a current user count or as proof that the product succeeded economically.',
      [claim('Current residual utility is display plus imported-wallet support.', ['current-help', 'import'], 'Current help workflow.'), claim('Historical mint scale includes free distributions and is not current active usage.', ['polygon'], 'Partner case-study methodology.', 'inference'), claim('Current active use, royalties and access failures need new evidence.', ['current-help', 'pcgamer'], 'Current sources do not quantify them.', 'unknown')],
    ),
  },
  metrics: [
    { key: 'partner-mints-2025-03-27', dimension: 'supply', label: 'Partner-reported cumulative avatars minted', value: 30_000_000, unit: 'avatars', asOf: '2025-03-27', window: { start: '2022-07-07', end: '2025-03-27', definition: 'cumulative_partner_report' }, method: 'Polygon Labs case study; includes paid and free distributions.', scope: { program: 'Reddit Collectible Avatars', chain: 'Polygon' }, assertion: 'Polygon Labs reported more than 30 million Collectible Avatars minted.', sources: ['polygon'], locator: 'Partner case-study scale paragraph.', qualityFlags: ['ecosystem_partner_reported', 'includes_free_distributions', 'not_active_users', 'wallets_not_people'] },
    { key: 'partner-sales-2025-03-27', dimension: 'sales', label: 'Partner-reported cumulative sales', value: 18_000_000, unit: 'usd', currency: 'USD', asOf: '2025-03-27', window: { start: '2022-07-07', end: '2025-03-27', definition: 'cumulative_partner_report' }, method: 'Polygon Labs case study; accounting definition not supplied.', scope: { program: 'Reddit Collectible Avatars', chain: 'Polygon' }, assertion: 'Polygon Labs reported more than $18 million in program sales.', sources: ['polygon'], locator: 'Partner case-study scale paragraph.', qualityFlags: ['ecosystem_partner_reported', 'not_reddit_financial_statement', 'gross_net_definition_unknown'] },
  ],
  events: [
    { key: 'launch', type: 'product_launch', date: '2022-07-07', datePrecision: 'day', description: 'Reddit announced its Polygon Collectible Avatar storefront.', sources: ['launch'], locator: 'Dated launch announcement.' },
    { key: 'program-sunset', type: 'product_sunset', date: '2025-08-01', datePrecision: 'month', description: 'Reddit announced the sunset of the Avatar Creator Program during August 2025.', sources: ['pcgamer'], locator: 'Independent report reproducing the operator announcement at month precision.' },
    { key: 'current-support', type: 'residual_support', date: '2026-02-04', datePrecision: 'day', description: 'Reddit documented post-sunset avatar use and wallet import.', sources: ['current-help', 'import'], locator: 'Current help-center updates.' },
  ],
  identityBoundary: 'Individual avatar series, creators, collectors, Reddit, Vault wallets, Polygon and third-party marketplaces have separate rights and economics.',
  metricBoundary: 'Historical mints include free distributions; wallets are not people; partner-reported sales are not Reddit revenue or current product usage.',
  guardrail: 'Describe the broad onboarding result and the later sunset together. Do not call residual display support a live creator marketplace.',
  unknowns: ['current_active_avatar_users', 'verified_wallet_count', 'creator_payouts', 'realized_secondary_royalties', 'reddit_program_revenue', 'program_operating_costs', 'legacy_vault_access_failures', 'secondary_market_liquidity'],
  methodologyNotes: ['Reddit help pages were browser-indexed but returned direct HTTP 403 during automated access. The current help language takes precedence over older marketplace language in still-public creator terms.'],
});

const moonbirdsSlug = 'moonbirds';
const moonbirdsSources = [
  source(moonbirdsSlug, 'legacy', 'Moonbird collection record', 'https://www.proof.xyz/moonbirds/2026', 'PROOF Holdings', '2022-04-16', 'primary', { independence_group: 'proof_collective' }),
  source(moonbirdsSlug, 'current', 'A New Chapter for Moonbirds', 'https://moonbirds.com/', 'Moonbirds / Orange Cap Games', null, 'primary', { independence_group: 'orange_cap_games' }),
  source(moonbirdsSlug, 'thesis', 'The Birbillions Thesis', 'https://birbpad.fun/docs', 'Orange Cap Games', null, 'primary', { independence_group: 'orange_cap_games', access_method: 'indexed_browser_snapshot', direct_http_status: null }),
  source(moonbirdsSlug, 'nesting', 'BIRB Nesting', 'https://claim.moonbirds.com/nesting', 'Orange Cap Games', null, 'primary', { independence_group: 'orange_cap_games' }),
  source(moonbirdsSlug, 'vibes', 'Vibes product and tournament updates', 'https://www.vibes.game/blog', 'Orange Cap Games', null, 'primary', { independence_group: 'orange_cap_games' }),
  source(moonbirdsSlug, 'acquisition', 'Bored Apes-creator Yuga Labs unloads Moonbirds as IP selloff continues', 'https://www.theblock.co/post/356420/bored-apes-creator-yuga-labs-unloads-moonbirds-as-ip-selloff-continues', 'The Block', '2025-05-30', 'independent', { independence_group: 'the_block', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source(moonbirdsSlug, 'token-coverage', 'Moonbirds launches BIRB token', 'https://opensea.io/blog/articles/opensea-digest-january-30-2026', 'OpenSea', '2026-01-30', 'independent', { independence_group: 'opensea' }),
  source(moonbirdsSlug, 'odaily', 'Before Moonbirds launched its token, it initiated the Birbillions Project', 'https://www.odaily.news/en/post/5209045', 'Odaily', '2026-01-28', 'independent', { independence_group: 'odaily' }),
];

const moonbirds = buildProfile({
  slug: moonbirdsSlug,
  name: 'Moonbirds',
  type: 'nft_collection',
  classification: { subtype: 'acquired profile-picture IP and consumer-products brand', tags: ['ethereum', 'pfp', 'acquired', 'physical_collectibles', 'birb_token', 'reboot'], chains: ['Ethereum', 'Solana', 'TON'], jurisdictions: ['United States'] },
  sources: moonbirdsSources,
  operatingState: 'operating_reboot_with_token_and_products',
  statusAssertion: 'Orange Cap Games operates Moonbirds, its current holder portal, BIRB rewards and related Vibes consumer products.',
  statusSources: ['current', 'thesis', 'nesting', 'vibes'],
  statusLocator: 'Current first-party collection, rewards, product and operating-thesis surfaces.',
  outcome: 'middling_reboot_execution_visible_economics_unverified',
  outcomeConfidence: 'medium',
  outcomeAssertion: 'Moonbirds is in an active reboot after repeated ownership changes; products and token rewards are live, but collection-level retention and economics remain unverified.',
  outcomeSources: ['current', 'thesis', 'nesting', 'vibes', 'acquisition'],
  outcomeLocator: 'Current execution compared with the independently confirmed 2025 IP transfer.',
  sections: {
    what_it_is: section(
      'Moonbirds is a 10,000-piece Ethereum profile-picture collection launched by PROOF in April 2022. Orange Cap Games now owns the Moonbirds, Mythics and Oddities IP and is rebuilding the brand around physical collectibles, digital campaigns and the Solana-based BIRB token. The original NFTs remain on Ethereum and can use a legacy portal. BIRB, Vibes trading cards, related soulbound tokens and the operating company are separate assets and products; a Moonbird is not equity in Orange Cap Games or an automatic claim on all brand revenue.',
      [claim('Moonbirds launched as a 10,000-piece Ethereum collection in April 2022.', ['legacy', 'acquisition'], 'Original collection record and independent ownership history.'), claim('Orange Cap Games owns and operates the Moonbirds IP family.', ['current', 'thesis', 'acquisition'], 'Current first-party and independent acquisition record.'), claim('The Ethereum NFT, Solana BIRB token and physical products are separate instruments.', ['thesis', 'nesting', 'vibes'], 'Current product and token surfaces.', 'inference')],
    ),
    what_happened: section(
      'PROOF launched Moonbirds with nesting and member benefits, then Yuga Labs acquired PROOF in 2024. Yuga sold the Moonbirds IP to Orange Cap Games in May 2025 as it narrowed its portfolio. Orange Cap connected the birds to its Vibes trading-card business, expanded the IP across several chains and launched BIRB in January 2026. Current pages show nesting rewards, physical products and tournament updates. This is a real operating reboot, but a new owner and token do not erase the collection’s earlier decline or prove renewed holder demand.',
      [claim('Yuga acquired PROOF in 2024 and sold Moonbirds IP to Orange Cap Games in May 2025.', ['acquisition'], 'Independent ownership chronology.'), claim('Orange Cap launched BIRB and connected Moonbirds to its consumer-products strategy in 2026.', ['thesis', 'nesting', 'token-coverage'], 'Current thesis, rewards surface and independent launch coverage.'), claim('Current execution does not by itself establish NFT-holder retention or recovery.', ['current', 'vibes', 'acquisition'], 'Operation is visible; cohort recovery measures are absent.', 'unknown')],
    ),
    why_this_outcome: section(
      'Moonbirds lost momentum while moving from founder-led PROOF to Yuga and then to a third owner whose specialty is physical collectibles. Orange Cap’s strategic answer was distribution: use an already recognizable crypto character in cards, retail, digital campaigns and a fungible coordination token. That gives the IP more product surfaces than a static profile picture and can reach people outside NFT markets. The approach may support a turnaround, but the reviewed figures cover the wider Vibes and birb ecosystem rather than isolating what changed for original Moonbirds holders.',
      [claim('Moonbirds changed controlling IP owners twice after launch.', ['acquisition'], 'Independent acquisition history.'), claim('Orange Cap centers physical distribution and repeat consumer products in its strategy.', ['thesis', 'vibes'], 'Birbillions thesis and current product program.'), claim('Current operating figures are not isolated to the original Moonbirds NFT cohort.', ['thesis', 'vibes'], 'Self-reported metrics span products and chains.', 'unknown')],
    ),
    strategic_choices: section(
      'The original team chose nesting and gated community benefits. Orange Cap kept a legacy management portal but shifted the growth model toward consumer products, cross-chain campaigns, BIRB rewards and a token launchpad. It acquired historical IP instead of inventing a new mascot, then used Vibes distribution as the commercial engine. The tradeoff is complexity: an Ethereum NFT holder now faces Solana token mechanics, product-company execution and several adjacent communities. More reach does not guarantee that value returns to the original collection.',
      [claim('The original collection used nesting and holder benefits.', ['legacy', 'current'], 'Legacy collection and current portal.'), claim('Orange Cap chose physical distribution, cross-chain campaigns and BIRB as the reboot model.', ['thesis', 'nesting', 'vibes'], 'Current operating thesis and products.'), claim('Cross-product reach and NFT-holder value capture remain separate outcomes.', ['thesis', 'nesting'], 'Token and company model compared with holder rewards.', 'inference')],
    ),
    operating_model: section(
      'Orange Cap Games operates the Moonbirds IP and the wider consumer-products business. It develops Vibes trading cards, works with distributors and retailers, maintains current Moonbirds and rewards sites and presents BIRB as a coordination layer around the brand. NFT owners can use the legacy portal and optionally nest eligible assets for monthly token allocations. The company self-reports meaningful card sales, but does not publish audited Moonbirds-specific revenue, product margins, acquisition cost, royalty receipts, staffing or the share of customers who also hold an original NFT.',
      [claim('Orange Cap runs current product, collection and BIRB reward surfaces.', ['current', 'thesis', 'nesting', 'vibes'], 'Current first-party pages.'), claim('Eligible NFT owners can nest assets for recurring BIRB allocations.', ['nesting'], 'Current nesting rules and displayed allocations.'), claim('Moonbirds-specific financial and customer-overlap data are not disclosed.', ['thesis', 'vibes', 'current'], 'Current company disclosures omit these fields.', 'unknown')],
    ),
    token_and_value_capture: section(
      'Moonbirds now has an adjacent Solana token, BIRB. The current nesting page offers eligible Moonbirds monthly allocations and displays 16,527 BIRB remaining per Moonbird at the review date, subject to uninterrupted nesting and program rules. Orange Cap says physical collectibles are the revenue engine and BIRB coordinates culture and distribution. That is the operator’s thesis, not a legal revenue share: owning the NFT or token does not grant equity, audited cash flow or a guaranteed claim on Vibes sales, and token rewards can fall in value.',
      [claim('Eligible nested Moonbirds can receive monthly BIRB allocations under current rules.', ['nesting'], 'Current BIRB Nesting page.'), claim('Orange Cap describes physical products as revenue and BIRB as coordination.', ['thesis'], 'Birbillions business thesis.'), claim('No equity or guaranteed revenue share is stated for NFT or token holders.', ['thesis', 'nesting'], 'Current company and reward descriptions.', 'unknown')],
    ),
    counterfactual: section(
      'A collection-only strategy could have preserved a simpler Ethereum identity and reduced confusion between PROOF, Yuga, Orange Cap, Vibes and BIRB, but it would have left fewer distribution and revenue experiments. Orange Cap could also publish audited collection-level economics and a clear allocation bridge from products to holders. That would make the model easier to judge without changing the consumer strategy. The record does not establish whether a token-free reboot or greater disclosure would improve demand, retention or company performance.',
      [claim('The chosen reboot spans several owners, products and chains.', ['acquisition', 'thesis', 'nesting'], 'Ownership and current strategy.'), claim('Current reporting does not isolate collection-level economics.', ['thesis', 'vibes'], 'Self-reported business metrics are broader than Moonbirds.'), claim('Outcomes under a token-free or more transparent alternative are unobserved.', ['thesis', 'acquisition'], 'Only the chosen path is documented.', 'unknown')],
    ),
    risks_and_unknowns: section(
      'The reboot depends on Orange Cap executing physical products while keeping crypto communities engaged. BIRB adds market, allocation, custody and regulatory risk; nesting adds eligibility rules and operator dependence. Self-reported card sales and wallet growth may be accurate without proving repeat buyers, margins or original-holder retention. Current Moonbirds owners, concentration, unique buyers and sellers, executable bid depth, royalty income, nesting participation, BIRB claims and sales attributable to Moonbirds remain unknown. Ownership churn also raises the risk of another strategic handoff.',
      [claim('Current strategy combines physical execution with token and nesting mechanics.', ['thesis', 'nesting', 'vibes'], 'Current operating model.'), claim('Self-reported business figures are not audited collection-level results.', ['thesis'], 'Evidence of Execution section and its scope.', 'inference'), claim('Current NFT market, rewards and collection economics are not disclosed.', ['current', 'nesting', 'vibes'], 'Current evidence gap.', 'unknown')],
    ),
    lifecycle: section(
      'Moonbirds launched under PROOF in April 2022, passed to Yuga Labs through the 2024 PROOF acquisition and moved again to Orange Cap Games in May 2025. Orange Cap launched a consumer-products and token reboot, with live BIRB nesting and current Vibes releases in 2026. The collection is therefore operating, not abandoned, but its lifecycle remains a middling reboot: execution is visible while recovery in the original NFT cohort is not. The next call must compare retained holders and collection demand with the broader brand’s growth.',
      [claim('The collection passed from PROOF to Yuga and then Orange Cap.', ['legacy', 'acquisition'], 'Launch and independent ownership chronology.'), claim('Current 2026 BIRB and Vibes programs show active operation.', ['nesting', 'vibes', 'thesis'], 'Current first-party products.'), claim('Original-cohort recovery remains unmeasured.', ['current', 'thesis'], 'Current operator pages lack cohort outcomes.', 'unknown')],
    ),
    outlook_and_watch: section(
      'Base case: Orange Cap keeps shipping consumer collectibles and BIRB campaigns while Moonbirds functions as the historical IP anchor. Watch Vibes sell-through and repeat releases, audited company revenue and margins, Moonbirds-specific buyers and sellers, nesting participation, BIRB claims and unlocks, retailer expansion, license changes and another IP transfer. A larger cross-chain wallet count or token rally is not the same as retained Ethereum NFT holders. The strongest upgrade signal would be repeat consumer demand plus transparent collection-level benefits that do not depend on emissions.',
      [claim('Orange Cap currently positions products and distribution as the growth engine.', ['thesis', 'vibes'], 'Current strategy and release cadence.'), claim('BIRB nesting and cross-chain campaigns create measurable but separate watch surfaces.', ['nesting', 'thesis'], 'Current reward and wallet claims.'), claim('Collection-specific retention and non-emission value capture require new evidence.', ['current', 'thesis', 'nesting'], 'Current evidence gap.', 'unknown')],
    ),
  },
  metrics: [
    { key: 'vibes-cards-2026-01-28', dimension: 'sales', label: 'Operator-reported Vibes cards sold', value: 8_600_000, unit: 'cards', asOf: '2026-01-28', window: { start: '2025-01-28', end: '2026-01-28', definition: 'operator_reported_trailing_12_months' }, method: 'Orange Cap Games operating thesis, repeated by a dated independent publication.', scope: { company: 'Orange Cap Games', product: 'Vibes TCG' }, assertion: 'Orange Cap reported more than 8.6 million Vibes cards sold during the prior year.', sources: ['thesis', 'odaily'], locator: 'Evidence of Execution section and dated Odaily summary.', qualityFlags: ['operator_reported', 'independent_republication_not_audit', 'not_audited', 'not_moonbirds_nft_specific'] },
    { key: 'vibes-primary-sales-2026-01-28', dimension: 'sales', label: 'Operator-reported Vibes gross primary sales', value: 6_000_000, unit: 'usd', currency: 'USD', asOf: '2026-01-28', window: { start: '2025-01-28', end: '2026-01-28', definition: 'operator_reported_trailing_12_months' }, method: 'Orange Cap Games operating thesis, repeated by a dated independent publication.', scope: { company: 'Orange Cap Games', product: 'Vibes TCG' }, assertion: 'Orange Cap reported more than $6 million in Vibes gross primary sales during the prior year.', sources: ['thesis', 'odaily'], locator: 'Evidence of Execution section and dated Odaily summary.', qualityFlags: ['operator_reported', 'independent_republication_not_audit', 'gross_not_net', 'not_audited', 'not_moonbirds_nft_specific'] },
  ],
  events: [
    { key: 'launch', type: 'collection_launch', date: '2022-04-01', datePrecision: 'month', description: 'PROOF launched the 10,000-piece Moonbirds collection during April 2022.', sources: ['legacy', 'acquisition'], locator: 'Collection record and independent history at month precision.' },
    { key: 'orange-cap-acquisition', type: 'control_transfer', date: '2025-05-30', datePrecision: 'day', description: 'Orange Cap Games acquired the Moonbirds IP from Yuga Labs.', sources: ['acquisition'], locator: 'Dated independent acquisition report.' },
    { key: 'birb-launch', type: 'token_launch', date: '2026-01-29', datePrecision: 'day', description: 'Moonbirds launched the BIRB token and current nesting program.', sources: ['nesting', 'token-coverage'], locator: 'Current claim interface and independent launch digest.' },
  ],
  identityBoundary: 'Moonbirds NFTs, Mythics, Oddities, PROOF, Yuga Labs, Orange Cap Games, Vibes products, BIRB and cross-chain campaigns have separate ownership and economics.',
  metricBoundary: 'Company card sales, cross-chain wallets and token allocations are not Moonbirds NFT revenue, retained holders, profit or guaranteed realizable value.',
  guardrail: 'Recognize current reboot execution while keeping operator self-reports, token incentives and original NFT-cohort outcomes separate.',
  unknowns: ['moonbirds_unique_holders', 'holder_concentration', 'unique_buyers_and_sellers', 'executable_bid_depth', 'royalty_revenue', 'nesting_participation', 'birb_claims_and_realization', 'moonbirds_attributable_sales', 'company_margin', 'acquisition_price'],
  methodologyNotes: ['Operator product metrics are retained with explicit non-collection and unaudited flags. No current NFT floor is promoted because a listed floor is not executable liquidity.'],
});

const krakenSlug = 'kraken-nft-marketplace';
const krakenSources = [
  source(krakenSlug, 'waitlist', 'Kraken NFT is Coming: Join the Waitlist', 'https://blog.kraken.com/product/nft/kraken-nft-is-coming-join-the-waitlist', 'Kraken', '2022-05-03', 'primary', { independence_group: 'kraken' }),
  source(krakenSlug, 'launch', 'Kraken Opens NFT Marketplace Beta to the Public', 'https://blog.kraken.com/product/nft/kraken-opens-nft-marketplace-beta-to-the-public', 'Kraken', '2022-12-22', 'primary', { independence_group: 'kraken' }),
  source(krakenSlug, 'closure', 'NFT marketplace closure: FAQ', 'https://support.kraken.com/articles/nft-marketplace-closure-faq', 'Kraken', '2025-03-31', 'primary', { independence_group: 'kraken' }),
  source(krakenSlug, 'the-block', 'Kraken to close NFT marketplace, shift focus to other projects', 'https://www.theblock.co/post/328383/kraken-to-close-nft-marketplace-shift-focus-to-other-projects', 'The Block', '2024-11-26', 'independent', { independence_group: 'the_block', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
];

const krakenMarketplace = buildProfile({
  slug: krakenSlug,
  name: 'Kraken NFT Marketplace',
  type: 'nft_collection',
  classification: { subtype: 'closed centralized multi-chain NFT marketplace', tags: ['marketplace', 'custodial', 'multi_chain', 'closed', 'resource_reallocation'], chains: ['Ethereum', 'Polygon', 'Solana'], jurisdictions: [] },
  sources: krakenSources,
  operatingState: 'closed',
  statusAssertion: 'Kraken ended trading in November 2024 and fully shut the NFT marketplace on February 27, 2025.',
  statusSources: ['closure', 'the-block'],
  statusLocator: 'Operator closure FAQ and independent contemporaneous confirmation.',
  outcome: 'failed_product_closed_orderly_wind_down',
  outcomeConfidence: 'high',
  outcomeAssertion: 'The marketplace failed as a continuing product and closed after an announced withdrawal period; underlying NFTs remained separate assets.',
  outcomeSources: ['closure', 'the-block', 'launch'],
  outcomeLocator: 'Launch proposition compared with terminal operator and independent closure records.',
  sections: {
    what_it_is: section(
      'Kraken NFT was a custodial marketplace embedded in the Kraken exchange account, not an NFT collection. It let customers browse, buy, sell and hold NFTs from several chains while funding purchases with supported cash or crypto balances. Kraken internalized some transfers so it could advertise zero network gas fees for marketplace trades. The product is now closed. NFTs bought there were assets under their own contracts; they were not Kraken shares, and closure did not erase an NFT that a customer withdrew to a self-custodial wallet.',
      [claim('Kraken NFT was a custodial, multi-chain marketplace inside Kraken accounts.', ['waitlist', 'launch'], 'Product and funding descriptions.'), claim('Kraken advertised zero network gas fees for marketplace trades.', ['waitlist', 'launch'], 'Launch feature list.'), claim('Marketplace closure and underlying NFT existence are separate outcomes.', ['closure'], 'Self-custody withdrawal explanation.', 'inference')],
    ),
    what_happened: section(
      'Kraken announced the product in May 2022 and opened public beta on December 22 with more than 110 collections, multiple funding currencies and creator-earnings support. It later added chains and collections, but did not publish marketplace-specific users, volume or revenue. On November 27, 2024 Kraken ended listings, bids, purchases and sales and moved the service to withdrawal-only mode. After a three-month exit window, it fully shut the marketplace on February 27, 2025 and said resources would move to other products and services.',
      [claim('Public beta opened December 22, 2022 with more than 110 collections.', ['launch'], 'Dated public-beta announcement.'), claim('Trading functions ended November 27, 2024.', ['closure', 'the-block'], 'Operator schedule and independent report.'), claim('The full shutdown followed on February 27, 2025 after a three-month withdrawal period.', ['closure', 'the-block'], 'Closure timeline.')],
    ),
    why_this_outcome: section(
      'Kraken’s verified reason was portfolio priority: the company chose to shift people and resources into other products. The marketplace attempted to differentiate through exchange funding rails, custody convenience, broad collection support and zero gas fees, but the public record does not show that these features created enough usage or economics to keep funding. Weak NFT demand and specialist competition are plausible context, not proven internal causes. The strongest causal statement is therefore strategic reallocation after an undisclosed product-performance test.',
      [claim('Kraken explicitly cited shifting resources to new products and services.', ['closure', 'the-block'], 'Operator rationale and independent statement.'), claim('The launch proposition emphasized custody, funding flexibility and zero gas fees.', ['waitlist', 'launch'], 'Product feature list.'), claim('Adoption, competition, revenue and regulation were not ranked as closure causes by Kraken.', ['closure', 'the-block'], 'Published rationale is narrower.', 'unknown')],
    ),
    strategic_choices: section(
      'Kraken chose a centralized account and custody model instead of a wallet-first aggregator. It subsidized or internalized network movements for in-platform trades, accepted many payment currencies and supported creator earnings across a broad catalog. At closure it stopped trading before custody access, giving customers a defined withdrawal window and pointing them to self-custody. This reduced abrupt asset lock-in, but the hard deadline meant users who did not act would lose Kraken access to those NFTs. The company chose a clean product exit over indefinite maintenance.',
      [claim('The product used centralized custody and exchange funding rails.', ['waitlist', 'launch'], 'Launch architecture.'), claim('Kraken provided a staged trading stop and withdrawal window.', ['closure'], 'Withdrawal-only and final deadline sections.'), claim('NFTs not withdrawn by the deadline would no longer be accessible through Kraken.', ['closure'], 'Operator deadline warning.')],
    ),
    operating_model: section(
      'Kraken supplied custody, account funding, listings, bids, settlement, collection discovery and support. Users traded inside a centralized service, while creators and third-party contracts defined the underlying NFTs. The zero-gas promise depended on Kraken’s internal systems and did not mean blockchains stopped charging fees for withdrawals. Kraken has not disclosed marketplace take rate, creator payouts, active traders, custody cost, compliance cost, headcount or profit. After closure there is no operating marketplace model to evaluate—only the quality of the completed wind-down.',
      [claim('Kraken operated custody, funding, trading and discovery functions.', ['waitlist', 'launch'], 'Product scope.'), claim('Network fees could still apply to withdrawals despite zero-gas in-platform trading.', ['closure', 'launch'], 'Withdrawal-fee and launch descriptions.'), claim('Marketplace-specific unit economics and users were not disclosed.', ['launch', 'closure'], 'Public product record omits these measures.', 'unknown')],
    ),
    token_and_value_capture: section(
      'Kraken did not launch a fungible token for the NFT marketplace in the reviewed sources. Potential value capture came from marketplace or account economics, customer retention and creator arrangements, but no marketplace fee or revenue total is published. NFT sellers could realize sale proceeds and creators could receive configured earnings; neither was a guaranteed return. The underlying collection token, any creator token and Kraken’s corporate value must be evaluated separately. After trading stopped, the only supported action was withdrawal rather than continued monetization.',
      [claim('No Kraken NFT marketplace token is identified in the product or closure record.', ['waitlist', 'launch', 'closure'], 'Full reviewed product record.', 'unknown'), claim('Creator earnings and customer sale proceeds were part of the product proposition.', ['waitlist', 'launch'], 'Launch feature descriptions.'), claim('No marketplace fee, revenue or holder-yield figure was disclosed.', ['launch', 'closure'], 'Public product and closure record.', 'unknown')],
    ),
    counterfactual: section(
      'A narrower non-custodial aggregator could have reduced custody and support costs while preserving Kraken account discovery, but it would lose the integrated zero-gas experience. A marketplace focused only on existing exchange clients or selected gaming assets might have reduced catalog complexity. A longer runway could help only if unmet demand existed. Kraken did not publish the tests needed to compare those alternatives, so the counterfactual cannot assume that better design would overcome a weak product priority or produce sustainable liquidity.',
      [claim('The actual product used broad custodial integration and a large catalog.', ['waitlist', 'launch'], 'Launch scope.'), claim('Kraken chose full shutdown and resource reallocation rather than a narrower successor.', ['closure', 'the-block'], 'Published closure path.'), claim('No public experiment compares alternative marketplace scopes or custody models.', ['launch', 'closure'], 'Only the chosen design and shutdown are documented.', 'unknown')],
    ),
    risks_and_unknowns: section(
      'The terminal risk was access: customers had to move NFTs to self-custody before the deadline, and Kraken warned that anything left would no longer be accessible through the service. The record does not disclose how many users completed withdrawal, whether support disputes remain or how unwithdrawn assets were handled legally and operationally. Lifetime users, volume, unique buyers and sellers, take rate, creator payments, market share, losses and the destination of reallocated resources are also unknown. Those gaps prevent a precise financial postmortem.',
      [claim('Kraken imposed a February 27, 2025 final withdrawal deadline.', ['closure'], 'Closure FAQ.'), claim('Kraken warned that unwithdrawn NFTs would no longer be accessible through the marketplace.', ['closure'], 'Deadline consequence.'), claim('User, financial, withdrawal-completion and residual-claim data are not disclosed.', ['closure', 'the-block'], 'Terminal public record.', 'unknown')],
    ),
    lifecycle: section(
      'Kraken NFT moved from a May 2022 waitlist to private beta, public beta in December 2022 and a broader public marketplace. Less than two years later the company announced withdrawal-only mode. Trading ended November 27, 2024 and the final shutdown occurred February 27, 2025. The lifecycle call is a failed product with an announced wind-down: it did not remain strategically important enough for Kraken to operate. That does not imply that every traded NFT failed or that Kraken itself ceased operating.',
      [claim('The product progressed from waitlist to public beta during 2022.', ['waitlist', 'launch'], 'Dated product announcements.'), claim('Trading and final service ended on the published 2024 and 2025 dates.', ['closure', 'the-block'], 'Terminal schedule.'), claim('Product failure is distinct from failure of Kraken or every supported collection.', ['closure'], 'Closure scope is the NFT marketplace.', 'inference')],
    ),
    outlook_and_watch: section(
      'The marketplace has no recovery outlook because it is closed. Watch for post-closure customer claims, legal disclosures about inaccessible assets, a successor Kraken NFT feature or financial commentary explaining resource allocation. A future wallet gallery or third-party integration would be a new product and should not silently rewrite this marketplace’s lifecycle. The useful comparison is whether other exchange-owned NFT markets retained enough users and revenue to justify custody and support. Until Kraken publishes figures, this case supports only a strategic-exit conclusion, not a quantified loss estimate.',
      [claim('Kraken NFT remains fully closed under the current operator record.', ['closure'], 'Final shutdown statement.'), claim('A future NFT feature would require separate identity and lifecycle analysis.', ['closure'], 'Current product termination.', 'inference'), claim('Post-closure claims and internal product economics remain unknown.', ['closure', 'the-block'], 'Current public record.', 'unknown')],
    ),
  },
  metrics: [],
  events: [
    { key: 'public-beta', type: 'product_launch', date: '2022-12-22', datePrecision: 'day', description: 'Kraken opened its NFT marketplace public beta.', sources: ['launch'], locator: 'Dated launch announcement.' },
    { key: 'withdrawal-only', type: 'wind_down', date: '2024-11-27', datePrecision: 'day', description: 'Kraken ended NFT listings, bids, purchases and sales.', sources: ['closure', 'the-block'], locator: 'Operator and independent closure schedule.' },
    { key: 'closure', type: 'product_closure', date: '2025-02-27', datePrecision: 'day', description: 'Kraken fully shut its NFT marketplace.', sources: ['closure', 'the-block'], locator: 'Final operator deadline and independent confirmation.' },
  ],
  identityBoundary: 'Kraken NFT Marketplace, the Kraken exchange, Kraken Wallet, customers, creators and underlying NFT contracts are distinct products and owners.',
  metricBoundary: 'Catalog size and supported currencies are product breadth, not users, volume, revenue, liquidity or product-market fit.',
  guardrail: 'Use Kraken’s verified resource-reallocation rationale and label competing causal stories as hypotheses unless new internal evidence appears.',
  unknowns: ['lifetime_users', 'unique_buyers_and_sellers', 'volume', 'take_rate', 'creator_payments', 'market_share', 'operating_costs', 'withdrawal_completion', 'unwithdrawn_asset_disposition', 'reallocated_resource_destination'],
  methodologyNotes: ['No marketplace financial metric is published, so the profile does not manufacture a loss estimate from sector-level NFT volume.'],
});

const nodesSlug = 'nodemonkes';
const nodesSources = [
  source(nodesSlug, 'monkedex', 'MONKEDEX', 'https://nodemonkes.com/monkedex', 'NodeMonkes', null, 'primary', { independence_group: 'nodemonkes' }),
  source(nodesSlug, 'auction', 'NodeMonkes 8,000 Monke Auction Results', 'https://nodemonkes.com/send-nodes/3', 'NodeMonkes', '2023-12-21', 'primary', { independence_group: 'nodemonkes' }),
  source(nodesSlug, 'telegram', 'Node Monkes official channel', 'https://t.me/s/nodemonkes?before=32', 'NodeMonkes', null, 'primary', { independence_group: 'nodemonkes' }),
  source(nodesSlug, 'ordiscan', 'NodeMonkes collection', 'https://ordiscan.com/collection/nodemonkes', 'Ordiscan', null, 'independent', { independence_group: 'ordiscan', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  source(nodesSlug, 'coindesk', 'Bitcoin NFT NodeMonke Sells for $1M as BTC Inches Towards $69K', 'https://www.coindesk.com/markets/2024/03/04/bitcoin-nft-nodemonkes-sells-for-1m-as-btc-inches-towards-69k', 'CoinDesk', '2024-03-04', 'independent', { independence_group: 'coindesk' }),
  source(nodesSlug, 'leather', 'Guide to Bitcoin Ordinals Collections: What is NodeMonkes?', 'https://leather.io/blog/guide-to-bitcoin-ordinals-collections-what-is-nodemonkes', 'Leather', '2024-04-03', 'independent', { independence_group: 'leather' }),
  source(nodesSlug, 'the-block-report', 'The Block Research 2025 Digital Assets Outlook', 'https://www.tbstat.com/wp/uploads/2024/12/20241230_EOYReport_TBR.pdf', 'The Block Research', '2024-12-30', 'independent', { independence_group: 'the_block_research' }),
];

const nodeMonkes = buildProfile({
  slug: nodesSlug,
  name: 'NodeMonkes',
  type: 'ordinals_collection',
  classification: { subtype: 'Bitcoin Ordinals profile-picture collection', tags: ['bitcoin', 'ordinals', 'pfp', 'fixed_supply', 'no_roadmap'], chains: ['Bitcoin'], jurisdictions: [] },
  sources: nodesSources,
  operatingState: 'operating_artifact_market_active_demand_unverified',
  statusAssertion: 'The 10,000 inscriptions remain indexed on the official MonkeDEX and independent Ordinals infrastructure, while the project intentionally promises no operating roadmap.',
  statusSources: ['monkedex', 'telegram', 'ordiscan'],
  statusLocator: 'Current collection indexes and the operator\'s original no-roadmap statement.',
  outcome: 'middling_cultural_artifact_current_demand_unverified',
  outcomeConfidence: 'medium',
  outcomeAssertion: 'NodeMonkes remains a recognizable Bitcoin Ordinals artifact after a high-profile launch, but current retention, liquidity and economic durability are not established by the available evidence.',
  outcomeSources: ['monkedex', 'coindesk', 'the-block-report', 'ordiscan'],
  outcomeLocator: 'Current indexed collection, independent peak-event coverage and later sector review.',
  sections: {
    what_it_is: section(
      'NodeMonkes is a fixed collection of 10,000 pixel-art characters stored as Bitcoin Ordinal inscriptions. Its official index exposes every item and its traits, while independent Ordinals explorers map the inscriptions to current owners and transfers. The project deliberately described itself as having no team, roadmap or execution promise after distribution. A NodeMonke is therefore a collectible Bitcoin artifact, not equity, a claim on protocol fees or a contract for future software and community benefits.',
      [claim('The official index contains 10,000 NodeMonke inscriptions and their traits.', ['monkedex'], 'Current MonkeDEX count and trait index.'), claim('The collection uses Bitcoin Ordinal inscriptions rather than an ERC-721 contract.', ['ordiscan', 'leather'], 'Independent collection and protocol descriptions.'), claim('The operator explicitly promised no team or roadmap.', ['telegram'], 'Official channel statement.')],
    ),
    what_happened: section(
      'The creators inscribed the collection before its public sale, distributed 2,000 pieces through earlier activity and sold the remaining 8,000 in a December 21, 2023 Dutch auction. The official result records all 8,000 secured at a 0.03 BTC clearing price. Attention accelerated in early 2024, including a 17 BTC sale covered by CoinDesk. Later research documented a broad cooling in Ordinals collection volume after the first-half peak. The collection remains indexed, but a live index is not proof of current demand.',
      [claim('The public auction distributed 8,000 NodeMonkes at a 0.03 BTC clearing price.', ['auction', 'leather'], 'Official auction result and independent history.'), claim('A 17 BTC sale received independent coverage in March 2024.', ['coindesk'], 'Dated sale report.'), claim('Ordinals collection activity cooled after its 2024 peak.', ['the-block-report'], 'Year-end Ordinals market review.')],
    ),
    why_this_outcome: section(
      'NodeMonkes gained attention by pairing a complete 10,000-piece cohort with Bitcoin-native storage, recognizable profile art and timing near the first major Ordinals market cycle. Its no-roadmap message made the artifact itself the product and removed dependence on promised games or software. That clarity reduced one kind of execution risk, but it also left few reasons for repeat use beyond collecting, identity and speculation. Independent peak-sale and later market evidence support cultural recognition, not durable liquidity or retained demand.',
      [claim('The project centered a fixed Bitcoin-native artifact rather than future product delivery.', ['telegram', 'monkedex'], 'Official positioning and collection index.'), claim('Independent reporting documented major market attention during the 2024 peak.', ['coindesk', 'leather'], 'Sale and collection coverage.'), claim('Later market cooling prevents the peak event from proving durable demand.', ['the-block-report', 'ordiscan'], 'Later sector review and current collection infrastructure.', 'inference')],
    ),
    strategic_choices: section(
      'The creators chose early Bitcoin inscription provenance, a 10,000-piece profile collection and an onchain Dutch auction instead of an allowlist-heavy mint. They then rejected a conventional roadmap, named team and continuing execution obligation. That choice kept the promise narrow and made provenance, art and community the value proposition. The tradeoff is limited accountability and little disclosed product strategy. Collectors cannot evaluate a treasury, release schedule or operating milestones because the project says those are not part of the bargain.',
      [claim('The project used a public onchain auction for 8,000 inscriptions.', ['auction'], 'Official allocation and clearing record.'), claim('Its public posture rejects a team, roadmap and future execution promise.', ['telegram'], 'Official project statement.'), claim('No treasury plan or operating milestones are published in the reviewed official surfaces.', ['monkedex', 'telegram', 'auction'], 'Current official evidence set.', 'unknown')],
    ),
    operating_model: section(
      'NodeMonkes does not present a conventional company or product operation. The enduring first-party surfaces are the inscriptions, the MonkeDEX trait index, auction records and community channels. Third-party Ordinals explorers and marketplaces provide custody views, listings and settlement. The creators do not publish staffing, entity ownership, treasury balances, royalties, marketplace fees, licensing income or ongoing expenses. The operating model is best understood as a finished artifact plus community and external market infrastructure, not a subscription or live-service business.',
      [claim('The official site currently maintains collection and auction records.', ['monkedex', 'auction'], 'Current first-party surfaces.'), claim('Independent infrastructure indexes the underlying inscriptions.', ['ordiscan'], 'Current Ordinals collection page.'), claim('Team, treasury, revenue and expense data are not disclosed.', ['telegram', 'monkedex', 'auction'], 'Reviewed official record.', 'unknown')],
    ),
    token_and_value_capture: section(
      'The reviewed collection sources do not establish an official fungible token or a contractual token benefit for NodeMonke holders. Runes or similarly named assets can exist nearby without becoming collection entitlements. Holder value can come from selling an inscription, licensing or using its image, and community status, subject to actual rights and market demand. The 0.03 BTC auction proceeds went to the seller side of the launch; they were not a holder dividend. A later high sale benefited that transaction’s seller, not every owner.',
      [claim('No official fungible holder token is documented in the reviewed collection record.', ['monkedex', 'telegram', 'auction'], 'Official collection, channel and sale surfaces.', 'unknown'), claim('The auction clearing price describes primary distribution, not recurring holder income.', ['auction'], 'Official auction result.', 'inference'), claim('A high secondary sale does not distribute value to all holders.', ['coindesk'], 'Single independently covered transaction.', 'inference')],
    ),
    counterfactual: section(
      'A named team could have used auction proceeds to publish a treasury, develop tools and create repeat utility, but that would replace the project’s finished-artifact premise with execution risk. A token could add liquidity incentives while introducing emissions, allocation and regulatory questions unrelated to the inscriptions. A smaller supply might make ownership scarcer but reduce broad identity distribution. None of these alternatives was tested in the reviewed record, so they should be treated as design options rather than claims about a better financial outcome.',
      [claim('The chosen design minimizes promises beyond the finished collection.', ['telegram', 'monkedex'], 'Official posture and index.'), claim('No official collection token or product roadmap was observed.', ['telegram', 'monkedex', 'auction'], 'Reviewed official surfaces.', 'unknown'), claim('Financial outcomes under a named-team, token or smaller-supply design are unobserved.', ['auction', 'the-block-report'], 'Only the chosen launch and later market are documented.', 'unknown')],
    ),
    risks_and_unknowns: section(
      'The main risks are thin Bitcoin NFT liquidity, marketplace fragmentation, custody mistakes, ordinal-indexing differences, anonymous or unclear operator accountability and dependence on cultural attention. A listed floor can disappear before execution and one headline sale can distort perceived depth. Current unique owners, holder concentration, active listings, executable bids, unique buyers and sellers, wash-adjusted volume, royalties, operator control, licensing terms and community retention are not disclosed in a stable, reproducible series. Those gaps keep the outcome at middling rather than proven success.',
      [claim('The collection depends on external Ordinals indexes and markets for discovery and trading.', ['monkedex', 'ordiscan'], 'Current infrastructure surfaces.'), claim('Peak-sale reporting is insufficient to measure executable market depth.', ['coindesk', 'the-block-report'], 'Single event compared with later market review.', 'inference'), claim('Current holder, liquidity, revenue and governance measures remain unverified.', ['ordiscan', 'monkedex', 'telegram'], 'Current evidence gap.', 'unknown')],
    ),
    lifecycle: section(
      'NodeMonkes was inscribed and auctioned in late 2023, became a leading Ordinals profile collection during the early-2024 market surge and then entered a quieter period as sector volume declined. In August 2026 the full collection remains queryable through the official MonkeDEX and independent Ordinals infrastructure. The lifecycle call is a middling cultural artifact: it survived as an accessible collection and brand, but current owner retention and liquid demand are not proven. No roadmap failure is alleged because no roadmap was promised.',
      [claim('The 8,000-piece public auction completed in December 2023.', ['auction'], 'Official result.'), claim('Independent reporting documented high attention in early 2024 and later cooling.', ['coindesk', 'the-block-report'], 'Dated market record.'), claim('Current indexes show artifact availability but not retained liquid demand.', ['monkedex', 'ordiscan'], 'Current collection infrastructure.', 'inference')],
    ),
    outlook_and_watch: section(
      'Base case: NodeMonkes persists as a recognizable Bitcoin-native collectible without becoming an operating product company. Watch 30- and 90-day unique buyers and sellers, executable bids, holder concentration, transfer activity, marketplace support, official channel activity, licensing changes and any verified token or treasury announcement. Compare those signals with other early Ordinals cohorts rather than Ethereum profile collections alone. The call improves only if repeat independent demand is visible; it weakens if indexes, markets and community activity disappear together.',
      [claim('The current collection remains available through official and independent indexes.', ['monkedex', 'ordiscan'], 'Current collection surfaces.'), claim('No product roadmap creates collection and market activity as the relevant watch surface.', ['telegram'], 'Official no-roadmap posture.', 'inference'), claim('Repeat buyer, seller, bid and holder data require a fresh reproducible dataset.', ['ordiscan', 'the-block-report'], 'Current evidence limitation.', 'unknown')],
    ),
  },
  metrics: [
    { key: 'auction-mint-raise-2023-12-21', dimension: 'mint_raise', label: 'Computed 8,000-piece auction proceeds', value: 240, unit: 'btc', currency: 'BTC', asOf: '2023-12-21', window: { start: '2023-12-21', end: '2023-12-21', definition: 'final_dutch_auction_allocation' }, method: 'Computed as 8,000 secured inscriptions multiplied by the official 0.03 BTC clearing price.', scope: { collection: 'NodeMonkes', allocation: 'public_auction_8000' }, assertion: 'The official auction result implies 240 BTC of gross proceeds before refunds, fees or transaction costs.', sources: ['auction'], locator: '8,000 secured inscriptions and 0.03 BTC clearing price.', qualityFlags: ['computed_from_primary_source', 'gross_not_net', 'historical', 'not_holder_return'] },
  ],
  events: [
    { key: 'auction', type: 'collection_sale', date: '2023-12-21', datePrecision: 'day', description: 'The public Dutch auction secured all 8,000 offered NodeMonkes at 0.03 BTC each.', sources: ['auction'], locator: 'Official auction result.' },
    { key: 'headline-sale', type: 'secondary_sale', date: '2024-03-04', datePrecision: 'day', description: 'CoinDesk reported a 17 BTC NodeMonke sale during the early Ordinals surge.', sources: ['coindesk'], locator: 'Dated independent sale report.' },
    { key: 'current-index', type: 'current_operation', date: AS_OF, datePrecision: 'day', description: 'The official MonkeDEX continued to index all 10,000 inscriptions.', sources: ['monkedex', 'ordiscan'], locator: 'Current official and independent indexes.' },
  ],
  identityBoundary: 'NodeMonke inscriptions, the anonymous or pseudonymous creators, official indexes, third-party marketplaces and similarly named Runes are distinct actors and assets.',
  metricBoundary: 'Primary auction price and one secondary sale are not current floor, executable liquidity, holder returns, project revenue or retained demand.',
  guardrail: 'Treat the collection as a finished Bitcoin artifact; do not invent a company, roadmap or token connection, and do not use a peak sale as current market depth.',
  unknowns: ['current_unique_owners', 'holder_concentration', 'active_listings', 'executable_bids', 'unique_buyers_and_sellers', 'wash_adjusted_volume', 'royalties', 'operator_control', 'licensing_terms', 'community_retention', 'official_fungible_token'],
  methodologyNotes: ['The stable auction price is retained as historical primary-sale evidence. Volatile floors and owner snapshots are excluded until a reproducible observation pipeline records them.'],
});

export const document = {
  schema: 'chaindump-nft-depth-wave-b-v1',
  version: 1,
  research_as_of: AS_OF,
  generated_at: ACCESSED_AT,
  generated_migration: '0096_nft_depth_wave_b.sql',
  selection_method: 'Five high-signal shallow routed profiles selected to add successful, middling, closed and product-sunset outcomes across Ethereum, Polygon, Bitcoin and multi-chain markets.',
  entities: [
    { slug: punksSlug, legacy_status: 'thriving', canonical_profile: cryptoPunks },
    { slug: redditSlug, legacy_status: 'middling', canonical_profile: redditAvatars },
    { slug: moonbirdsSlug, legacy_status: 'middling', canonical_profile: moonbirds },
    { slug: krakenSlug, legacy_status: 'dead', canonical_profile: krakenMarketplace },
    { slug: nodesSlug, legacy_status: 'middling', canonical_profile: nodeMonkes },
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

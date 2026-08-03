#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYSIS_SECTION_KEYS, validateEntityProfile } from '../src/lib/entity-profile.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(root, 'docs/nft-ordinals-depth-wave-c-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0100_nft_ordinals_depth_wave_c.sql');
const AS_OF = '2026-08-03';
const ACCESSED_AT = '2026-08-03T22:03:00Z';
const NEXT_REVIEW_AT = '2026-08-10T22:03:00Z';
const MAX_D1_STATEMENT_BYTES = 95_000;
const TARGET_TABLE = '_nft_ordinals_depth_wave_c_0100';

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

const funko = 'funko-digital-pop';
const funkoProfile = buildProfile({
  slug: funko,
  name: 'Funko Digital Pop!',
  type: 'nft_collection',
  classification: { subtype: 'licensed phygital collectible program', tags: ['wax', 'licensed_ip', 'mystery_packs', 'physical_redemption', 'centralized_platform', 'ceased'], chains: ['WAX'], jurisdictions: ['United States'] },
  sources: [
    source(funko, 'mechanics', 'Funko Digital Pop program mechanics', 'https://funko.com/digital-pop.html', 'Funko', null, 'A', 'primary', { independence_group: 'funko' }),
    source(funko, 'sunset', 'Digital Pop update: Droppp program sunsets May 31, 2026', 'https://funko.com/funko-blog-home/funko-digital-pop-update.html', 'Funko', '2026-04-30', 'A', 'primary', { independence_group: 'funko' }),
    source(funko, 'independent', "Funko's NFT era ends", 'https://www.nerdbeak.com/news/funko-droppp-digital-pop-shutdown-may-2026', 'Nerdbeak', '2026-05-29', 'C', 'independent', { independence_group: 'nerdbeak' }),
  ],
  operatingState: 'operator_program_ceased_2026_assets_may_persist_elsewhere',
  statusAssertion: 'Funko disabled Droppp accounts, wallets, pack opening and community services on May 31, 2026 after ending new Digital Pop releases.',
  statusSources: ['sunset', 'independent'],
  statusLocator: 'Dated operator shutdown notice corroborated by independent coverage.',
  outcome: 'failed_operator_program_with_exportable_artifacts_and_outstanding_fulfillment',
  outcomeConfidence: 'high',
  outcomeAssertion: 'The Digital Pop product failed as a continuing operator program even though timely exported WAX collectibles can remain in third-party wallets.',
  outcomeSources: ['mechanics', 'sunset', 'independent'],
  outcomeLocator: 'Original product mechanics, explicit terminal event and independent shutdown review.',
  sections: {
    what_it_is: section('Funko Digital Pop was a series of licensed digital trading-card drops on the WAX blockchain, sold through the Droppp platform from 2021 to 2026. Buyers opened randomized packs, collected rarity tiers and traded items. Selected rare cards or completed “Royalty Sets” generated time-limited tokens redeemable for physical Funko Pop figures. A Digital Pop was not company stock or a permanent promise of future drops, and most cards carried no physical redemption right.', [
      fact('Funko sold licensed Digital Pop collectibles through randomized packs and a secondary marketplace.', ['mechanics'], 'How it works and complete your collection sections.'),
      fact('Only qualifying rarities or completed sets generated redemption tokens for physical figures.', ['mechanics'], 'Physical-redemption explanation.'),
      fact('The reviewed program pages state no equity, revenue-share or permanent future-release right for holders.', ['mechanics', 'sunset'], 'Product proposition and shutdown notice.', 'unknown'),
    ]),
    what_happened: section('Funko launched Digital Pop in 2021 and repeatedly paired well-known entertainment licenses with scarce physical figures. On April 30, 2026, Funko announced that no new collections would be released and that Droppp would close on May 31. Users had to open packs and move collectibles and USDC before the deadline. Funko said it would refund Droppp credits and finish outstanding physical orders, while unexported access, pack opening, marketplace service and Discord support ended.', [
      fact('Funko states that Digital Pop launched in 2021.', ['sunset'], 'Opening paragraphs of the sunset notice.'),
      fact('Droppp accounts and wallets were disabled on May 31, 2026.', ['sunset', 'independent'], 'Shutdown deadline and independent review.'),
      fact('Funko committed to refund credits and fulfill outstanding physical redemption orders.', ['sunset'], 'Credit and physical-order FAQ sections.'),
    ]),
    why_this_outcome: section('The product’s strongest hook was also its central weakness. Licensed characters and exclusive physical figures gave collectors a reason to buy beyond a digital image, but pack opening, custody, trading, redemption tracking and fulfillment all ran through Droppp and Funko. WAX could preserve exported tokens, yet it could not preserve those operator services. The shutdown is verified; Funko did not publish program revenue, costs, user retention or a detailed reason for ending it, so poor economics should not be presented as proven.', [
      fact('The physical-figure hook depended on Funko eligibility and fulfillment rather than the token alone.', ['mechanics', 'sunset'], 'Redemption mechanics and outstanding-order commitment.', 'inference'),
      fact('Droppp concentrated wallet, marketplace, pack-opening and community functions in one operator surface.', ['mechanics', 'sunset', 'independent'], 'Program workflow and shutdown consequences.', 'inference'),
      fact('Funko did not disclose a quantified financial or retention reason for the closure in the reviewed notice.', ['sunset'], 'Full shutdown notice.', 'unknown'),
    ]),
    strategic_choices: section('Funko chose recurring licensed drops rather than one permanent collection, mystery packs rather than direct selection and physical redemption rather than digital-only utility. It also used a managed Droppp wallet and marketplace to hide much of the blockchain complexity from mainstream collectors. Those choices made the product familiar to trading-card and Funko buyers, but required continuous licensing, inventory design, shipping and platform operations. The late export window reduced damage without making the product self-sustaining.', [
      fact('Digital Pop used recurring licensed drops and randomized packs.', ['mechanics'], 'Drop and pack workflow.'),
      fact('The program used a managed account, wallet and marketplace experience through Droppp.', ['mechanics', 'sunset'], 'Account workflow and shutdown instructions.'),
      fact('Funko allowed WAX exports during shutdown but ended the original service layer.', ['sunset', 'independent'], 'Transfer instructions and terminal deadline.'),
    ]),
    operating_model: section('Collectors bought packs, received WAX-based items in Droppp and could trade through its marketplace. On a snapshot date after a drop, the current owner of an eligible card received a redemption token, which then had to be redeemed for a physical figure within the stated window. Funko and its partners controlled licenses, pack inventory, eligibility and physical fulfillment. WAX handled token custody after export, but an external wallet could not reopen a sealed pack or recreate Funko’s redemption database after closure.', [
      fact('The current owner at the applicable snapshot could receive the physical-redemption token.', ['mechanics'], 'Redemption-token workflow.'),
      fact('Funko controlled physical-product eligibility and fulfillment.', ['mechanics', 'sunset'], 'Redemption and outstanding-order sections.'),
      fact('After closure, exported tokens could persist while Droppp-only functions stopped.', ['sunset', 'independent'], 'Transfer, pack-opening and account-shutdown instructions.'),
    ]),
    token_and_value_capture: section('Funko captured primary pack revenue and used scarce physical figures to drive demand; Droppp could also monetize marketplace activity under its terms. Holders captured value only through collectible enjoyment, an eligible physical redemption or resale to another buyer. A digital item’s WAX persistence did not guarantee a buyer, royalty payment, shipping claim or future utility. Current program-level sales, margins, licensing expense, marketplace take rate and final redemption completion are not disclosed in the reviewed sources.', [
      fact('Primary packs and qualifying physical figures were the program’s disclosed commercial products.', ['mechanics'], 'Purchase and redemption workflow.'),
      fact('A holder had no disclosed automatic claim on Funko revenue or Droppp fees.', ['mechanics', 'sunset'], 'Reviewed holder proposition.', 'unknown'),
      fact('Program revenue, margin, licensing cost and final fulfillment counts were not published in the reviewed sources.', ['sunset', 'independent'], 'Shutdown and independent review.', 'unknown'),
    ]),
    counterfactual: section('A self-custody-first design with open pack and redemption standards could have preserved more functions when Droppp closed. A longer read-only period could also have reduced deadline risk. Neither option removes the need for a licensed company to manufacture and ship the physical figures, and continued infrastructure carries real cost. The available record does not show that decentralizing custody would have fixed demand or economics; it would mainly have reduced the number of utilities lost at one shutdown date.', [
      fact('The actual design concentrated multiple functions in Droppp.', ['mechanics', 'sunset'], 'Product workflow and shutdown effects.'),
      fact('Funko provided a finite export window rather than permanent Droppp access.', ['sunset'], 'May 31 transfer deadline.'),
      fact('The effect of a self-custody-first design on demand and profitability is not observed.', ['sunset', 'independent'], 'Terminal record contains no controlled comparison.', 'unknown'),
    ]),
    risks_and_unknowns: section('The remaining risks are practical, not just market-price risk. Some users may have missed the export or pack-opening deadlines; physical shipments may still be delayed or disputed; metadata and trading depend on third-party WAX services; and licensed imagery does not automatically grant broad commercial rights. Unknowns include final user counts, unexported assets, unopened inventory burned, outstanding redemptions, refunds, program losses and whether Funko will offer a replacement digital product under different terms.', [
      fact('Users faced hard deadlines for transfers, pack opening and USDC withdrawal.', ['sunset', 'independent'], 'Shutdown checklist.'),
      fact('Funko acknowledged physical-shipping delays while promising completion.', ['sunset'], 'Outstanding physical redemption section.'),
      fact('Final exported-asset, refund, burn and fulfillment totals remain unpublished.', ['sunset', 'independent'], 'Reviewed terminal record.', 'unknown'),
    ]),
    lifecycle: section('Digital Pop began in 2021 as a bridge between Funko’s licensed physical collectibles and blockchain trading. Repeated drops extended the line for almost five years, but the program entered terminal wind-down when new releases stopped and Funko announced Droppp’s closure in April 2026. The service ended on May 31. The correct lifecycle call is dead at the operator-product layer with residual artifacts and fulfillment obligations—not that every WAX token vanished, and not that Funko itself ceased operating.', [
      fact('The product operated from its 2021 launch until the 2026 sunset.', ['sunset'], 'Launch retrospective and closure date.'),
      fact('New collections, accounts, wallets, pack opening and Discord support ended with the wind-down.', ['sunset'], 'Program shutdown details.'),
      fact('Exported WAX assets can persist separately from the ceased operator program.', ['sunset', 'independent'], 'Third-party wallet instructions and independent explanation.'),
    ]),
    outlook_and_watch: section('The terminal status will not change unless Funko launches a clearly documented successor; transferring old tokens on WAX would not revive Digital Pop. Watch completion of outstanding physical orders and refunds, availability of metadata in third-party wallets, any formal rights update and any new Funko digital-collectible strategy. The most important postmortem signal is how many users successfully recovered assets and claims. Funko has not published that reconciliation, so holder recovery remains incomplete as a research question.', [
      fact('Funko said outstanding physical orders and Droppp credits would be honored.', ['sunset'], 'Fulfillment and refund commitments.'),
      fact('Third-party WAX support determines residual access after Droppp closure.', ['sunset', 'independent'], 'External-wallet transfer explanation.', 'inference'),
      fact('No final recovery reconciliation was available in the reviewed sources.', ['sunset', 'independent'], 'Post-shutdown record.', 'unknown'),
    ]),
  },
  events: [
    { key: 'launch', type: 'product_launch', date: '2021-01-01', datePrecision: 'year', description: 'Funko launched the Digital Pop program during 2021.', sources: ['sunset'], locator: 'Operator launch retrospective.' },
    { key: 'sunset-announcement', type: 'shutdown_announcement', date: '2026-04-30', datePrecision: 'day', description: 'Funko announced that Digital Pop releases had ended and Droppp would close.', sources: ['sunset'], locator: 'Dated operator notice.' },
    { key: 'shutdown', type: 'service_shutdown', date: '2026-05-31', datePrecision: 'day', description: 'Droppp accounts, wallets, pack opening and community services ended.', sources: ['sunset', 'independent'], locator: 'Operator deadline and independent review.' },
  ],
  identityBoundary: 'Funko Inc., the Digital Pop product, Droppp services, WAX tokens, licensed brands and physical-redemption obligations are separate.',
  metricBoundary: 'Historical pack sales, token transfers, marketplace prices and physical fulfillment are different measures and are not combined.',
  guardrail: 'Do not say every token disappeared when Droppp closed, and do not call residual WAX transferability an operating product.',
  unknowns: ['program_revenue_and_costs', 'final_user_count', 'export_completion', 'unopened_pack_burn_total', 'outstanding_physical_orders', 'refund_completion', 'license_rights_after_shutdown'],
  methodologyNotes: ['Terminal status is supported by Funko’s dated notice; the undisclosed business reason is kept unknown.'],
});

const sorare = 'sorare-cards';
const sorareProfile = buildProfile({
  slug: sorare,
  name: 'Sorare Cards',
  type: 'nft_collection',
  classification: { subtype: 'licensed fantasy-sports card platform', tags: ['sports', 'fantasy_game', 'licensed_ip', 'seasonal_supply', 'solana', 'regulated_game'], chains: ['Solana', 'Base'], jurisdictions: ['France', 'United Kingdom', 'United States'] },
  sources: [
    source(sorare, 'history', 'Our next chapter: Sorare beta rollout history', 'https://medium.com/sorare/our-next-chapter-sorare-raises-a-4m-seed-round-led-by-e-ventures-b8e615bce191', 'Sorare', '2020-07-16', 'B', 'primary', { independence_group: 'sorare', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
    source(sorare, 'terms', 'Sorare terms and conditions', 'https://sorare.com/terms-and-conditions', 'Sorare', '2026-05-07', 'A', 'primary', { independence_group: 'sorare' }),
    source(sorare, 'ownership', 'Security, transparency and ownership', 'https://sorare.com/help/a/30889391102749/security-transparency-ownership', 'Sorare', null, 'A', 'primary', { independence_group: 'sorare' }),
    source(sorare, 'migration', 'Sorare migration timeline and phases', 'https://help.sorare.com/hc/en-us/articles/30889042268573-Timeline-Phases', 'Sorare', '2025-10-08', 'B', 'primary', { independence_group: 'sorare', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
    source(sorare, 'jonum', 'JONUM regulation and current Sorare competitions', 'https://help.sorare.com/hc/en-us/articles/35374770201373-JONUM-Regulation', 'Sorare', '2026-04-14', 'B', 'primary', { independence_group: 'sorare', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
    source(sorare, 'ukgc', 'Consumer information notice: Sorare.com prosecution', 'https://www.gamblingcommission.gov.uk/news/article/consumer-information-notice-sorare-com-prosecution', 'UK Gambling Commission', '2024-09-26', 'A', 'independent', { independence_group: 'uk_gambling_commission' }),
    source(sorare, 'financial', 'Sorare getting very close to the red', 'https://sbcnews.co.uk/featurednews/2025/06/13/sorare-close-to-the-red/', 'SBC News', '2025-06-13', 'B', 'independent', { independence_group: 'sbc_news', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
  ],
  operatingState: 'operating_after_chain_migration_with_financial_and_regulatory_pressure',
  statusAssertion: 'Sorare remains operational in 2026 with card ownership on Solana, ETH settlement on Base and jurisdiction-specific competition rules.',
  statusSources: ['terms', 'ownership', 'migration', 'jonum'],
  statusLocator: 'Current terms, wallet architecture, migration record and competition rules.',
  outcome: 'surviving_product_with_repeat_gameplay_but_shrinking_economics_and_regulatory_risk',
  outcomeConfidence: 'high',
  outcomeAssertion: 'Sorare achieved durable licensed fantasy gameplay but entered a retrenchment phase as reported revenue and cash reserves fell and legal treatment remained contested.',
  outcomeSources: ['migration', 'jonum', 'ukgc', 'financial'],
  outcomeLocator: 'Operating migration and rules compared with regulator and independent financial reporting.',
  sections: {
    what_it_is: section('Sorare is a fantasy-sports platform built around licensed digital player cards. Managers assemble football, baseball or basketball lineups, and real-world player performance determines competition results. Some entry modes use free cards; scarce cards are blockchain collectibles with edition tiers and seasonal identity. The current wallet architecture uses Solana for collectibles and Base for ETH. A card is a game item and transferable collectible, not equity in Sorare or a guaranteed investment return.', [
      fact('Sorare uses licensed digital player cards in fantasy competitions tied to real-world sports results.', ['terms', 'jonum'], 'Service and competition descriptions.'),
      fact('Current Sorare wallets hold collectibles on Solana and ETH on Base.', ['terms', 'ownership', 'migration'], 'Wallet and migration descriptions.'),
      fact('The reviewed terms provide no equity or guaranteed appreciation right to card owners.', ['terms'], 'Ownership and risk terms.', 'unknown'),
    ]),
    what_happened: section('Sorare launched its football product in 2019, expanded into additional sports and reached a 2021 private valuation associated with hypergrowth expectations. The market then contracted. Independent reporting based on company accounts said revenue fell from €143 million in 2022 to €59 million in 2023 and €43 million in 2024, while cash reserves also declined. Sorare cut burn, adapted products to France’s JONUM framework and migrated collectibles from StarkEx to Solana, showing survival and retrenchment at the same time.', [
      fact('Independent reporting said Sorare revenue fell from €143 million in 2022 to €43 million in 2024.', ['financial'], 'Account figures summarized in the independent report.'),
      fact('Sorare completed a collectible migration from StarkEx to Solana with ETH settlement on Base.', ['migration', 'ownership', 'terms'], 'Migration timeline and current wallet architecture.'),
      fact('Sorare operates jurisdiction-specific JONUM competition rules in France.', ['jonum'], 'Current regulatory-competition notice.'),
    ]),
    why_this_outcome: section('Sorare lasted because cards have repeat use in live competitions rather than depending only on profile-picture demand. Sports seasons refresh the game, licenses supply recognizable players and a marketplace lets users change lineups. The same model creates recurring cost and risk: licenses, rewards, compliance and new seasonal inventory must be supported while older cards compete with new supply. Falling revenue shows the 2021 growth story did not persist, while continued competitions and a major chain migration show the product did not simply collapse.', [
      fact('Recurring fantasy competitions give cards a use beyond passive collection.', ['terms', 'jonum'], 'Competition mechanics.', 'inference'),
      fact('Seasonal card issuance and reward obligations create continuing product and economic requirements.', ['terms', 'financial'], 'Card-service terms and reported financial contraction.', 'inference'),
      fact('Lower revenue and continued operations support a retrenchment call rather than a dead-or-thriving binary.', ['financial', 'migration', 'jonum'], 'Financial trend compared with current operating evidence.', 'inference'),
    ]),
    strategic_choices: section('Sorare chose official league and player licenses, a repeated fantasy-game loop and season-specific scarcity instead of a fixed art collection. It initially used Ethereum scaling infrastructure, then moved collectibles to Solana and ETH settlement to Base. It also adjusted competition formats to fit France’s JONUM regime rather than withdraw entirely. These choices preserved product continuity and mainstream sports identity, but they increased dependence on rights holders, rules in each country, continuing content production and user trust during a complex migration.', [
      fact('Sorare’s product is built around licensed sports identity and repeated competitions.', ['terms', 'jonum'], 'Current service descriptions.'),
      fact('Sorare replaced the older StarkEx card stack with Solana and Base infrastructure.', ['migration', 'ownership'], 'Migration and current custody descriptions.'),
      fact('Sorare uses jurisdiction-specific product rules instead of one universal competition format.', ['terms', 'jonum', 'ukgc'], 'Terms, French JONUM notice and UK enforcement record.'),
    ]),
    operating_model: section('Sorare creates and sells scarce player-card inventory, operates fantasy competitions and supports transfers between user wallets. Users select lineups; performance data determines scores; eligible rankings can receive cards, cash, merchandise or experiences under competition terms. Payments, withdrawals and transfers remain subject to identity, sanctions and fraud controls. The company therefore combines game publisher, licensed-content buyer, marketplace and wallet interface. Blockchain custody can make a card transferable, but Sorare still controls competition eligibility, scoring and rewards.', [
      fact('Sorare operates the competition, scoring, reward and marketplace layers around user-owned cards.', ['terms', 'jonum'], 'Service operation and competition terms.'),
      fact('Transfers and withdrawals can be restricted for fraud, sanctions or legal compliance.', ['terms'], 'Wallet and compliance clauses.'),
      fact('Blockchain custody does not independently preserve Sorare competition eligibility or reward delivery.', ['terms', 'ownership'], 'Ownership boundary compared with operator-controlled game functions.', 'inference'),
    ]),
    token_and_value_capture: section('Sorare can earn from primary card sales and marketplace or service economics, while paying for licenses, staff, infrastructure and rewards. A card holder can use a card in eligible competitions or sell it, but receives no disclosed share of company profit. Annual issuance supports fresh gameplay and revenue while diluting attention across seasons and scarcity tiers. The reviewed public record does not reconcile current primary sales, marketplace take rate, reward expense, licensing cost, active paying managers or profitability after the migration.', [
      fact('Primary card inventory and marketplace activity are disclosed components of Sorare’s service.', ['terms'], 'Service and transaction provisions.'),
      fact('Card ownership does not create a disclosed claim on Sorare profit.', ['terms'], 'Ownership and transaction terms.', 'unknown'),
      fact('Current take rate, licensing cost, reward expense and paying-user cohorts remain unpublished in the reviewed sources.', ['financial', 'terms'], 'Independent accounts summary and current terms.', 'unknown'),
    ]),
    counterfactual: section('Sorare could have issued fewer seasonal cards, stayed on StarkEx, removed cash-like rewards or operated as a conventional non-transferable fantasy game. Lower issuance might protect older scarcity but reduce new sales and roster coverage. Staying put would avoid migration friction but preserve older infrastructure. Removing transferable value could reduce some regulatory exposure while weakening ownership. No public experiment isolates which design would maximize durable users or profit, so these alternatives should remain scenarios rather than prescriptions.', [
      fact('The actual product uses transferable scarce cards, rewards and a migrated chain stack.', ['terms', 'migration', 'jonum'], 'Current design and migration record.'),
      fact('Legal treatment differs by jurisdiction and product configuration.', ['jonum', 'ukgc', 'terms'], 'French rules, UK prosecution notice and current terms.'),
      fact('The user and profit effects of lower issuance or non-transferable cards are not established.', ['financial', 'terms'], 'No controlled comparison in the reviewed record.', 'unknown'),
    ]),
    risks_and_unknowns: section('The largest risks are declining economics, licensing renewal, regulation, reward affordability, card oversupply, migration or wallet failures and thin markets for older seasons. The UK Gambling Commission’s public notice records a prosecution allegation, not a conviction and not a universal classification of Sorare as gambling. Unknowns include 2025–2026 audited revenue, cash runway, active and retained paying managers, primary-versus-secondary mix, license obligations, take rate, reward cost and how many users or cards were stranded during migration.', [
      fact('Independent reporting described substantial revenue and cash-reserve contraction through 2024.', ['financial'], 'Reported company-account figures.'),
      fact('The UK regulator published a prosecution notice concerning unlicensed gambling facilities.', ['ukgc'], 'Consumer information notice.'),
      fact('The reviewed notice does not establish a final conviction or a worldwide legal classification.', ['ukgc'], 'Procedural scope of the regulator notice.', 'unknown'),
    ]),
    lifecycle: section('Sorare moved from a 2019 football startup to a highly valued multi-sport NFT company, then into a post-boom correction. The 2022–2024 revenue decline and reported cash burn materially weaken the original hypergrowth thesis. Yet current terms, competitions and completed chain migration show an operating product with adaptation capacity. The lifecycle call is surviving and strategically important but financially pressured—not thriving based only on activity, and not dead because card prices fell or regulation became harder.', [
      fact('Sorare’s reported revenue contracted sharply after 2022.', ['financial'], 'Independent financial history.'),
      fact('The platform remained operational through a major 2025–2026 custody and settlement migration.', ['migration', 'ownership', 'terms'], 'Migration and current-service record.'),
      fact('Current operating continuity and economic contraction coexist.', ['financial', 'migration', 'jonum'], 'Cross-source lifecycle synthesis.', 'inference'),
    ]),
    outlook_and_watch: section('Base case: Sorare continues as a smaller, more regulated fantasy-sports platform while trying to stabilize costs and card demand. Watch audited revenue and cash, paying-manager retention, league renewals, competition entries, reward delivery, old-card usage, Solana custody incidents and the resolution of UK proceedings. The call improves if active paying cohorts and margins stabilize without aggressive issuance. It worsens if a major license leaves, cash declines faster than costs or legal restrictions remove the rewards that make scarce cards useful.', [
      fact('Current evidence supports continued operation with lower historical revenue and active regulatory adaptation.', ['financial', 'migration', 'jonum'], 'Operating and financial record.'),
      fact('Licensing, rewards, custody and legal availability are material ongoing dependencies.', ['terms', 'ownership', 'ukgc'], 'Current service and enforcement boundaries.', 'inference'),
      fact('Current audited profitability and retained-manager cohorts remain unavailable.', ['financial', 'terms'], 'Reviewed public evidence.', 'unknown'),
    ]),
  },
  events: [
    { key: 'launch', type: 'product_launch', date: '2019-03-01', datePrecision: 'month', description: 'Sorare launched its football fantasy-card beta in March 2019.', sources: ['history'], locator: 'Operator beta-rollout history.' },
    { key: 'revenue-peak', type: 'financial_peak', date: '2022-12-31', datePrecision: 'year', description: 'Independent reporting identified €143 million of 2022 revenue before a two-year contraction.', sources: ['financial'], locator: 'Reported company-account comparison.' },
    { key: 'current-terms', type: 'operating_update', date: '2026-05-07', datePrecision: 'day', description: 'Current terms documented the post-migration Solana and Base wallet structure.', sources: ['terms', 'ownership'], locator: 'Effective date and wallet provisions.' },
  ],
  identityBoundary: 'Sorare the company, its fantasy games, individual seasonal card NFTs, user wallets, league licensors and reward providers are separate.',
  metricBoundary: 'Company revenue, primary card sales, secondary volume, card prices, active managers and competition entries measure different outcomes.',
  guardrail: 'Do not call continuing competitions proof of healthy economics, and do not turn a prosecution notice into a conviction or universal gambling ruling.',
  unknowns: ['audited_2025_2026_financials', 'cash_runway', 'paying_manager_retention', 'primary_sales', 'marketplace_take_rate', 'licensing_costs', 'reward_expense', 'migration_attrition', 'older_card_liquidity'],
  methodologyNotes: ['The operating call is separated from card investment performance and company profitability.'],
});

const metroverse = 'metroverse';
const metroverseProfile = buildProfile({
  slug: metroverse,
  name: 'Metroverse',
  type: 'nft_collection',
  classification: { subtype: 'ceased NFT strategy game', tags: ['ethereum', 'gamefi', 'virtual_land', 'onchain_puzzle', 'open_source_wind_down', 'ceased'], chains: ['Ethereum'], jurisdictions: [] },
  sources: [
    source(metroverse, 'home', 'Metroverse Genesis collection overview', 'https://metroverse.com/', 'Metroverse', '2022-01-18', 'B', 'primary', { independence_group: 'metroverse' }),
    source(metroverse, 'roadmap', 'Metroverse dated roadmap', 'https://metroverse.com/roadmap', 'Metroverse', '2022-01-18', 'B', 'primary', { independence_group: 'metroverse' }),
    source(metroverse, 'closure', 'Metroverse community closure notice', 'https://metroverse.com/community-notice', 'Metroverse', '2023-03-10', 'A', 'primary', { independence_group: 'metroverse' }),
    source(metroverse, 'independent', 'NFT strategy game Metroverse is shutting down', 'https://www.coinlive.com/news-flash/13945', 'Coinlive', '2023-02-24', 'C', 'independent', { independence_group: 'coinlive' }),
    source(metroverse, 'legal-study', 'Decentralized Collaboration', 'https://aulawreview.org/wp-content/uploads/2024/01/Lee.to_.Printer.pdf', 'American University Law Review', '2024-01-01', 'A', 'independent', { independence_group: 'american_university_law_review', published_at_precision: 'month' }),
  ],
  operatingState: 'game_and_operator_development_ceased_2023',
  statusAssertion: 'Metroverse ended game operations and development by March 10, 2023 after reporting a roughly 96 percent year-over-year fall in site visits.',
  statusSources: ['closure', 'independent'],
  statusLocator: 'Operator closure notice and contemporaneous independent report.',
  outcome: 'failed_game_economy_with_orderly_code_and_asset_release',
  outcomeConfidence: 'high',
  outcomeAssertion: 'Metroverse failed to retain enough game engagement to support operations, while its orderly shutdown preserved NFT ownership, code and reusable data.',
  outcomeSources: ['roadmap', 'closure', 'independent', 'legal-study'],
  outcomeLocator: 'Product roadmap, operator-reported decline, shutdown actions and later legal research.',
  sections: {
    what_it_is: section('Metroverse was an Ethereum strategy game centered on 10,000 city-block NFTs. Owners arranged blocks into neighborhoods, combined traits for score boosts and later competed through additional game modes and Metro Battles. The NFTs were both game inputs and transferable collectibles, but they did not represent ownership of the developer or a contractual share of game revenue. This report distinguishes the original operator-run game from the Ethereum contracts and community rights that survived its closure.', [
      fact('Metroverse launched a 10,000-piece Genesis city-block NFT collection on Ethereum.', ['home', 'roadmap'], 'Genesis overview and launch roadmap.'),
      fact('City blocks were used in neighborhood optimization and later competition modes.', ['roadmap', 'closure'], 'Delivered roadmap and game retrospective.'),
      fact('The reviewed product materials disclose no equity or company-revenue right for NFT holders.', ['home', 'closure'], 'Collection proposition and wind-down rights.', 'unknown'),
    ]),
    what_happened: section('The Genesis collection launched in January 2022, followed by an optimization game and a roadmap of additional blocks, passes, characters and battle features. The team says it kept building during an eight-month engagement decline and released the final Metro Battles phase. In February 2023 it announced shutdown; by March 10 the Discord was closed, the last rewards were distributed, contracts and block data were released and creator royalties were set to zero. The NFTs remained, but operator-led play and development ended.', [
      fact('The Genesis collection launched on January 18, 2022.', ['home', 'roadmap'], 'Dated roadmap and collection overview.'),
      fact('Metroverse reported that site visits had fallen about 96 percent year over year.', ['closure', 'independent'], 'Why Metroverse is shutting down section and independent report.'),
      fact('By March 10, 2023 the team closed Discord, released code and data, distributed final Mayors and set royalties to zero.', ['closure'], 'Updated shutdown checklist.'),
    ]),
    why_this_outcome: section('Metroverse sold a speculative land-and-optimization thesis into the 2021–2022 NFT-game cycle, but keeping value required people to return and play. The team reported that early optimization attracted attention, while the later battle loop did not restore engagement after the market turned. Building the roadmap was therefore not enough: completed features existed without a retained audience large enough to fund support. The 96 percent traffic decline is operator-reported and corroborated by contemporaneous coverage; revenue, retention and treasury data remain unavailable.', [
      fact('The team described strong early optimization interest but weak engagement for later Battles.', ['closure'], 'Product retrospective and shutdown rationale.'),
      fact('A roughly 96 percent traffic decline made continued support unsustainable according to the operator.', ['closure', 'independent'], 'Operator metric and independent corroboration.'),
      fact('The reviewed record does not disclose revenue, cohort retention, treasury runway or support costs.', ['closure', 'independent'], 'Shutdown record and contemporaneous coverage.', 'unknown'),
    ]),
    strategic_choices: section('The team chose scarce city-block ownership, neighborhood-combination mechanics and a staged roadmap that culminated in competitive Battles. That created a reason to assemble multiple NFTs but made the game sensitive to collection prices, player liquidity and repeated strategic interest. During wind-down, the team chose completion and release over indefinite promises: it delivered final rewards, removed royalties and opened code and block data. Those actions reduced continuing dependence, but they occurred only after the operating audience had already collapsed.', [
      fact('Metroverse tied gameplay to owning and combining multiple city-block assets.', ['home', 'roadmap'], 'Collection and optimization mechanics.'),
      fact('The roadmap expanded from optimization into additional assets and competitive Battles.', ['roadmap', 'closure'], 'Roadmap and final-phase record.'),
      fact('The shutdown transferred reuse rights and released code while ending operator support.', ['closure', 'legal-study'], 'Wind-down terms and later legal treatment.'),
    ]),
    operating_model: section('Players bought or traded Ethereum NFTs and connected them to a web game that calculated neighborhood scores and supported later competition. The operator maintained the interface, game rules, community and feature roadmap; token contracts preserved ownership separately. Continued operations depended on enough users to justify servers, moderation and development, and creator royalties were one possible revenue path. At closure, royalties became zero and operational responsibility did not automatically transfer to a named successor, leaving community reuse possible but unfunded.', [
      fact('The web game used holder-controlled NFTs as inputs to operator-maintained game modes.', ['home', 'roadmap'], 'Collection and feature documentation.'),
      fact('Creator royalties were set to zero during the shutdown.', ['closure', 'independent'], 'Wind-down checklist.'),
      fact('No funded successor or continuing service obligation was named in the shutdown notice.', ['closure'], 'Future and next-steps sections.', 'unknown'),
    ]),
    token_and_value_capture: section('Primary NFT sales and any creator royalties could fund the project; holders could seek game utility or resale value. The design offered no disclosed fungible token dividend or automatic claim on revenue. When the team set royalties to zero and stopped the game, the main operator value loop ended. Surviving contracts could still be transferred or reused, but transfer activity is not project revenue and a secondary sale does not prove an active game. Final primary proceeds, royalty income, operating costs and holder losses are unknown.', [
      fact('Metroverse monetized collection assets and used creator royalties before wind-down.', ['home', 'closure'], 'Collection proposition and zero-royalty action.'),
      fact('The shutdown ended operator development and set all collection royalties to zero.', ['closure', 'independent'], 'Terminal notice and independent report.'),
      fact('Final proceeds, costs, holder losses and revenue allocation were not published in the reviewed record.', ['closure', 'independent'], 'Terminal record.', 'unknown'),
    ]),
    counterfactual: section('The team could have tested retention before expanding asset types, limited the roadmap to the early optimization loop or designed a subscription-like revenue stream less dependent on NFT enthusiasm. A community-governed handoff might also have preserved a smaller game. None is proven to have worked: the team says the broader market decline preceded Battles, and no cohort or cost data shows which feature lost users. The strongest evidence-based lesson is to validate repeat play before scaling inventory and roadmap complexity.', [
      fact('The actual roadmap expanded assets and modes before the final engagement test failed.', ['roadmap', 'closure'], 'Roadmap sequence and shutdown rationale.'),
      fact('The operator attributed part of the decline to the broader NFT-game downturn.', ['closure', 'independent'], 'Shutdown explanation.'),
      fact('No controlled evidence shows that a smaller product, subscription or DAO handoff would have survived.', ['closure'], 'No alternative experiment in the terminal record.', 'unknown'),
    ]),
    risks_and_unknowns: section('The original game is closed, so remaining risks concern preservation and misrepresentation. A live contract or old website can be mistaken for an operating product; abandoned interfaces may break; community forks may lack authority or funding; and thin trades may be presented as recovery. The team was anonymous or not fully accountable in public materials, and a later legal study notes the project’s licensing limitations. Unknowns include final users, treasury, code maintenance, active forks, current holders, executable bids and whether archived metadata will remain available.', [
      fact('The game ceased even though token ownership and reusable materials remained.', ['closure', 'legal-study'], 'Shutdown boundary and later legal analysis.'),
      fact('The reviewed wind-down did not appoint a funded successor.', ['closure'], 'Future and next-steps sections.', 'unknown'),
      fact('Current forks, holders, bid depth, archive maintenance and treasury balances are unverified.', ['closure', 'independent', 'legal-study'], 'Available sources do not supply current measurements.', 'unknown'),
    ]),
    lifecycle: section('Metroverse had a short but complete product lifecycle: a January 2022 launch, a year of roadmap delivery, an engagement collapse, a February 2023 shutdown decision and completed wind-down by March 10. It is a useful failure case because the team did ship the promised final phase; delivery did not create sustainable retention. The project is dead as an operator-run game, while its contracts and assets are persistent artifacts. No verified community relaunch changes that classification as of August 3, 2026.', [
      fact('Metroverse launched in January 2022 and completed shutdown actions in March 2023.', ['roadmap', 'closure'], 'Dated launch and terminal update.'),
      fact('The operator completed the final roadmap phase before ending support.', ['closure'], 'Product retrospective and final checklist.'),
      fact('No verified successor operation was identified in the reviewed current record.', ['home', 'closure', 'independent'], 'Current archive and terminal sources.', 'unknown'),
    ]),
    outlook_and_watch: section('Base case: Metroverse remains an archived game with transferable NFTs and reusable code, not a recovering business. Watch whether the official archive and repository stay accessible, whether a named successor launches a playable product, whether that product retains users and whether any rights terms change. A few transfers or a community experiment would not by themselves revive the original operator. A recovery call requires current players, maintained software, responsible governance and an economic path that does not repeat the original engagement failure.', [
      fact('The shutdown preserved reuse rights, contracts, code and block data.', ['closure', 'legal-study'], 'Future and wind-down actions.'),
      fact('No current operator-led game is documented.', ['closure', 'independent'], 'Terminal evidence remains controlling.'),
      fact('A recovery would require new evidence of maintained play, governance and funding.', ['closure'], 'Analyst threshold based on the documented failure mode.', 'inference'),
    ]),
  },
  events: [
    { key: 'launch', type: 'collection_launch', date: '2022-01-18', datePrecision: 'day', description: 'Metroverse launched its Genesis city-block collection.', sources: ['home', 'roadmap'], locator: 'Dated collection roadmap.' },
    { key: 'shutdown-announcement', type: 'shutdown_announcement', date: '2023-02-24', datePrecision: 'day', description: 'Metroverse announced that development and the game would end.', sources: ['closure', 'independent'], locator: 'Operator notice and contemporaneous report.' },
    { key: 'wind-down-complete', type: 'service_shutdown', date: '2023-03-10', datePrecision: 'day', description: 'Metroverse completed its stated Discord, reward, code-release and royalty wind-down steps.', sources: ['closure'], locator: 'Dated update to shutdown checklist.' },
  ],
  identityBoundary: 'The ceased Metroverse game, original development team, Ethereum NFT contracts, open-source code and any later community fork are separate.',
  metricBoundary: 'Site visits, active game users, NFT transfers, floor prices and operator revenue measure different layers and are not interchangeable.',
  guardrail: 'Do not call Metroverse a rug pull without stronger evidence, and do not call persistent contracts a live game.',
  unknowns: ['final_active_users', 'retention_cohorts', 'revenue_and_costs', 'treasury_runway', 'current_code_maintenance', 'community_forks', 'current_holder_count', 'executable_market_depth'],
  methodologyNotes: ['The causal explanation uses the operator’s quantified decline but does not accept undisclosed blame claims as independently proven.'],
});

const nouns = 'nouns-dao';
const nounsProfile = buildProfile({
  slug: nouns,
  name: 'Nouns',
  type: 'nft_collection',
  classification: { subtype: 'perpetual-auction governance NFT protocol', tags: ['ethereum', 'cc0', 'daily_auction', 'dao', 'treasury', 'fork_exit', 'open_ended_supply'], chains: ['Ethereum'], jurisdictions: [] },
  sources: [
    source(nouns, 'contract', 'Nouns token contract', 'https://etherscan.io/address/0x9c8ff314c9bc7f6e59a9d9225fb22946427edc03', 'Etherscan', '2021-08-08', 'A', 'aggregator', { independence_group: 'etherscan', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
    source(nouns, 'protocol', 'Nouns daily auction and governance protocol', 'https://nouns.wtf/', 'Nouns DAO', null, 'A', 'primary', { independence_group: 'nouns_dao' }),
    source(nouns, 'world', 'Welcome to Nouns', 'https://www.nouns.world/', 'Nouns DAO', null, 'A', 'primary', { independence_group: 'nouns_dao' }),
    source(nouns, 'governance', 'Nouns DAO governance proposals', 'https://docs.nouns.wtf/governance/proposals', 'Nouns DAO', null, 'A', 'primary', { independence_group: 'nouns_dao' }),
    source(nouns, 'stats', 'Nouns treasury statistics', 'https://www.nouns.com/stats/treasury', 'Nouns.com', null, 'B', 'aggregator', { independence_group: 'nouns_com' }),
    source(nouns, 'fork-axios', 'This NFT project break up is the crypto equivalent of Brexit', 'https://www.axios.com/2023/09/15/the-nouns-a-top-tier-nft-project-is-breaking-up', 'Axios', '2023-09-15', 'B', 'independent', { independence_group: 'axios', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
    source(nouns, 'fork-coindesk', 'NounsDAO barrels toward treasury split', 'https://www.coindesk.com/markets/2023/09/09/nounsdao-barrels-toward-treasury-split-after-nft-holders-rally-for-rage-quit', 'CoinDesk', '2023-09-09', 'B', 'independent', { independence_group: 'coindesk' }),
  ],
  operatingState: 'operating_with_daily_issuance_and_holder_governance',
  statusAssertion: 'Nouns continues to mint and auction one governance NFT per day, sending proceeds to a treasury controlled by Noun owners.',
  statusSources: ['protocol', 'world', 'governance', 'stats'],
  statusLocator: 'Current auction, governance and treasury surfaces.',
  outcome: 'durable_operating_protocol_with_governance_fragmentation_and_unproven_spending_efficiency',
  outcomeConfidence: 'high',
  outcomeAssertion: 'Nouns built a durable issuance-and-governance loop, but its 2023 treasury fork exposed a conflict between public-goods spending and holders seeking asset-value exits.',
  outcomeSources: ['protocol', 'governance', 'fork-axios', 'fork-coindesk', 'stats'],
  outcomeLocator: 'Current mechanism and treasury data compared with independent fork reporting.',
  sections: {
    what_it_is: section('Nouns is an Ethereum protocol that creates one pixel-art governance NFT every 24 hours and sells it by auction. Each Noun carries one vote in Nouns DAO, and auction proceeds enter a treasury that holders govern through proposals. The artwork is released under CC0 for broad reuse. Unlike a fixed 10,000-item profile-picture collection, supply has no planned endpoint. A Noun is a membership and voting asset, not a contractual pro-rata share of treasury cash or guaranteed investment return.', [
      fact('The protocol creates and auctions one Noun every 24 hours.', ['protocol', 'world'], 'Current auction-mechanism descriptions.'),
      fact('Each Noun carries one delegatable vote and auction proceeds enter the DAO treasury.', ['protocol', 'governance'], 'Governance and treasury descriptions.'),
      fact('Noun ownership does not create a simple contractual pro-rata treasury redemption right outside approved fork mechanics.', ['governance', 'fork-axios', 'fork-coindesk'], 'Governance system and documented fork process.', 'inference'),
    ]),
    what_happened: section('Nouns launched in August 2021 with perpetual daily auctions and treasury-funded experiments. The model accumulated a large pool and funded media, public goods, events and community projects. In September 2023, after governance adopted a fork exit, more than half of eligible Nouns joined a split that moved roughly $27 million of assets according to contemporary reporting. The original DAO continued operating afterward. Current sites still show auctions, governance and treasury activity, so the fork was a major contraction and governance stress test rather than the protocol’s death.', [
      fact('Nouns began daily issuance in August 2021.', ['contract', 'protocol', 'world'], 'Contract deployment, protocol history and current mechanism.'),
      fact('A September 2023 fork attracted more than half of eligible Nouns and moved a large treasury share.', ['fork-axios', 'fork-coindesk'], 'Contemporaneous independent fork reports.'),
      fact('The original Nouns auction and governance system remains active after the fork.', ['protocol', 'world', 'governance', 'stats'], 'Current official and treasury surfaces.'),
    ]),
    why_this_outcome: section('Nouns survives because its core loop funds itself: each new member pays through an auction, and the proceeds finance work that can expand the brand. CC0 lets outsiders build without negotiating a license, while one-Noun-one-vote gives owners direct control. The same treasury creates an arbitrage problem when treasury value per Noun exceeds market price. The 2023 fork showed that some buyers valued an exit more than continued collective spending. Durable contracts therefore solved continuity, not agreement about capital allocation.', [
      fact('Daily auctions provide recurring treasury funding without relying primarily on resale royalties.', ['protocol', 'world', 'stats'], 'Auction and treasury descriptions.', 'inference'),
      fact('CC0 reuse and holder voting broaden participation while keeping formal budget control with Noun owners.', ['world', 'governance'], 'Brand and governance descriptions.', 'inference'),
      fact('Independent reporting connected the 2023 fork to a gap between treasury backing and Noun market value.', ['fork-axios', 'fork-coindesk'], 'Fork motive and mechanics in independent reports.'),
    ]),
    strategic_choices: section('The founders chose perpetual issuance instead of a fixed supply, one-Noun-one-vote instead of a separate governance token and CC0 instead of restrictive licensing. They also directed every auction’s proceeds into a collectively governed treasury and later added a fork mechanism for dissatisfied holders. These choices create continuous membership, financing and remix culture. They also produce ongoing dilution, wealth-weighted voting, pressure to justify treasury spending and an exit path that can fragment the organization when asset-value buyers outnumber long-horizon builders.', [
      fact('Nouns uses open-ended daily issuance, NFT-based voting and a treasury funded by primary auctions.', ['protocol', 'world', 'governance'], 'Current protocol design.'),
      fact('Nouns artwork is offered under CC0 for permissionless reuse.', ['world'], 'Current brand description.'),
      fact('The DAO adopted a fork mechanism that enabled a major 2023 treasury split.', ['fork-axios', 'fork-coindesk'], 'Independent history of the fork.'),
    ]),
    operating_model: section('Anyone can settle an ended auction, which transfers the winning ETH into the treasury and starts the next auction. Noun holders or delegates submit and vote on proposals; approved transactions direct treasury assets. Builders can use CC0 art without obtaining a commercial license, while funded teams may receive grants through governance. There is no conventional executive promising a product roadmap. In practice, frontends, delegates, proposal authors and service providers remain important even when issuance and treasury execution are onchain.', [
      fact('Auction settlement sends proceeds to the treasury and creates the next Noun.', ['protocol'], 'Self-sufficient auction mechanism.'),
      fact('Noun owners and delegates vote on proposals that direct treasury spending.', ['governance', 'world'], 'Governance workflow.'),
      fact('Onchain execution does not remove dependence on frontends, delegates, proposal authors and funded operators.', ['protocol', 'governance', 'fork-axios'], 'Protocol mechanics compared with observed governance conflict.', 'inference'),
    ]),
    token_and_value_capture: section('Primary auction ETH flows to Nouns DAO, not automatically to existing holders. Holders capture governance influence, cultural membership and any resale value; builders can capture grants for approved work. Open-ended supply means a buyer must weigh future issuance against treasury and brand growth. The fork mechanism can return a proportional pool to participants only under specific governance conditions; it is not an everyday redemption guarantee. Current net treasury performance, proposal return on spending, voter concentration and holder profit are not established.', [
      fact('One hundred percent of primary auction proceeds enter the Nouns treasury.', ['protocol', 'world'], 'Current auction economics.'),
      fact('Existing holders do not receive each auction’s proceeds as an automatic dividend.', ['protocol', 'governance'], 'Treasury-control mechanism.', 'inference'),
      fact('Current spending returns, voting concentration and realized holder outcomes are not disclosed as one reconciled dataset.', ['stats', 'governance'], 'Current metrics and proposal surfaces.', 'unknown'),
    ]),
    counterfactual: section('A fixed-supply mint could have reduced dilution and treasury-value arbitrage, but it would remove the recurring membership and funding loop. A non-redeemable treasury might protect long-term grants while trapping dissenting owners; automatic pro-rata redemption could discipline spending while turning Nouns into a liquidation trade. More delegated committees could improve expertise but weaken direct ownership control. The 2023 fork supplies evidence about exit demand, not a controlled answer about which governance design would create better public goods.', [
      fact('The actual protocol uses perpetual issuance and direct holder governance.', ['protocol', 'governance'], 'Current mechanism.'),
      fact('The 2023 fork provided an exit path and substantially reduced the original treasury.', ['fork-axios', 'fork-coindesk'], 'Independent fork reports.'),
      fact('No controlled comparison establishes that fixed supply or a different redemption policy would improve governance.', ['fork-axios', 'fork-coindesk', 'governance'], 'Observed fork without experimental counterfactual.', 'unknown'),
    ]),
    risks_and_unknowns: section('The main risks are auction-demand decline, voter and delegate concentration, treasury capture, low-quality grants, recurring forks, smart-contract or frontend failures and confusion between treasury assets and holder rights. CC0 encourages distribution but cannot force builders to return value to the DAO. A large treasury can keep governance active even if outside demand weakens. Unknowns include retained unique bidders, buyer-to-voter conversion, delegate concentration, proposal completion, measurable grant outcomes, treasury-adjusted dilution and the quality of current secondary liquidity.', [
      fact('The protocol depends on interested bidders to continue economically meaningful daily auctions.', ['protocol'], 'Auction continuation condition.'),
      fact('The 2023 fork demonstrates material governance and treasury-fragmentation risk.', ['fork-axios', 'fork-coindesk'], 'Documented fork outcome.'),
      fact('Current bidder retention, voter concentration and proposal outcomes are not reconciled in the reviewed sources.', ['stats', 'governance'], 'Available current dashboards.', 'unknown'),
    ]),
    lifecycle: section('Nouns has operated from August 2021 through August 2026 with a distinctive recurring-auction model. It grew a major treasury and a recognizable open brand, then suffered a severe 2023 fork driven partly by treasury-value arbitrage and disagreement over spending. Daily issuance and governance survived, which is stronger evidence than a live marketing page alone. The lifecycle call is durable but mixed: the protocol works and funds activity, while the fork prevents a simple “thriving” label without better evidence on demand and spending quality.', [
      fact('Nouns has maintained daily auctions and governance from 2021 into 2026.', ['contract', 'protocol', 'world', 'governance'], 'Historical launch context and current operation.'),
      fact('The 2023 fork removed a material share of membership and treasury assets.', ['fork-axios', 'fork-coindesk'], 'Independent event reporting.'),
      fact('Operating continuity does not establish efficient spending or positive holder returns.', ['stats', 'governance', 'fork-axios'], 'Current activity and historical stress evidence.', 'inference'),
    ]),
    outlook_and_watch: section('Base case: Nouns keeps auctioning new members and funding projects, but governance remains vulnerable when treasury backing, auction prices and holder objectives diverge. Watch unique auction bidders, clearing prices, voter participation, delegate concentration, treasury net of commitments, completed proposals, measurable audience growth and new fork participation. The call improves if repeat demand and verified project outcomes rise without another large exit. It worsens if auctions thin, treasury spending lacks delivery or arbitrage-driven forks repeatedly shrink the organization.', [
      fact('The protocol remains capable of recurring auctions, proposals and treasury spending.', ['protocol', 'governance', 'stats'], 'Current mechanism and dashboard.'),
      fact('The 2023 fork identifies treasury-value divergence as a concrete watch signal.', ['fork-axios', 'fork-coindesk'], 'Independent explanation of exit demand.', 'inference'),
      fact('Current retained-bidder and proposal-outcome cohorts remain unverified.', ['stats', 'governance'], 'Reviewed current surfaces.', 'unknown'),
    ]),
  },
  events: [
    { key: 'launch', type: 'protocol_launch', date: '2021-08-08', datePrecision: 'day', description: 'Nouns began its perpetual daily-auction protocol in August 2021.', sources: ['contract', 'protocol', 'world'], locator: 'Contract deployment and operating description.' },
    { key: 'fork', type: 'governance_fork', date: '2023-09-15', datePrecision: 'day', description: 'A majority-scale Nouns fork split membership and a material treasury share.', sources: ['fork-axios', 'fork-coindesk'], locator: 'Contemporaneous independent reports.' },
    { key: 'current-operation', type: 'operating_observation', date: '2026-08-03', datePrecision: 'day', description: 'Current official surfaces continued to expose auctions, governance and treasury activity.', sources: ['protocol', 'world', 'governance', 'stats'], locator: 'Observed current product surfaces.' },
  ],
  identityBoundary: 'The Nouns NFT, Nouns DAO treasury, auction protocol, delegates, funded builders, forks and unrelated $NOUNS-branded assets are separate.',
  metricBoundary: 'Auction revenue, treasury value, proposal spending, NFT price, bidder count and governance participation measure different outcomes.',
  guardrail: 'Do not describe the treasury as automatically redeemable backing or use live auctions alone as proof of efficient governance.',
  unknowns: ['unique_bidder_retention', 'buyer_to_voter_conversion', 'delegate_concentration', 'proposal_completion', 'grant_outcomes', 'treasury_commitments', 'secondary_market_depth', 'holder_returns'],
  methodologyNotes: ['Protocol continuity is separated from governance quality, treasury efficiency and holder investment performance.'],
});

const twelvefold = 'twelvefold';
const twelvefoldProfile = buildProfile({
  slug: twelvefold,
  name: 'TwelveFold',
  type: 'ordinals_collection',
  classification: { subtype: 'finite Bitcoin Ordinals generative-art collection', tags: ['bitcoin', 'ordinals', 'generative_art', 'auction', 'yuga_labs', 'finite_program'], chains: ['Bitcoin'], jurisdictions: ['United States'] },
  sources: [
    source(twelvefold, 'site', 'TwelveFold collection archive and timeline', 'https://twelvefold.io/', 'Yuga Labs', null, 'A', 'primary', { independence_group: 'yuga_labs' }),
    source(twelvefold, 'terms', 'TwelveFold terms of sale', 'https://twelvefold.io/terms-of-sale.html', 'Yuga Labs', '2023-03-04', 'A', 'primary', { independence_group: 'yuga_labs' }),
    source(twelvefold, 'about', 'Yuga Labs collections portfolio', 'https://yuga.com/about/', 'Yuga Labs', null, 'B', 'primary', { independence_group: 'yuga_labs' }),
    source(twelvefold, 'auction-report', "Yuga Labs' Bitcoin NFT collection fetches top bid of nearly $160K", 'https://www.coindesk.com/web3/2023/03/06/yugas-bitcoin-nft-collection-fetches-top-bid-of-nearly-160k', 'CoinDesk', '2023-03-06', 'B', 'independent', { independence_group: 'coindesk' }),
    source(twelvefold, 'marketplace-exit', 'Magic Eden marketplace updates and service changes', 'https://help.magiceden.io/en/articles/13885504-magic-eden-marketplace-updates-service-changes', 'Magic Eden', '2026-06-30', 'B', 'primary', { independence_group: 'magic_eden' }),
  ],
  operatingState: 'finite_artifact_persistent_recurring_program_and_current_market_unverified',
  statusAssertion: 'TwelveFold’s 300 Bitcoin inscriptions and Yuga archive remain identifiable, while no current recurring holder program or verified liquid market is established.',
  statusSources: ['site', 'about', 'marketplace-exit'],
  statusLocator: 'Current collection archive and Yuga portfolio listing, bounded by a 2026 Bitcoin marketplace closure.',
  outcome: 'successful_primary_art_auction_with_persistent_artifact_but_unclassified_current_market',
  outcomeConfidence: 'high',
  outcomeAssertion: 'TwelveFold succeeded as a scarce primary art sale and finite creative experiment, but the reviewed evidence cannot classify current collector-market health.',
  outcomeSources: ['site', 'terms', 'auction-report', 'about', 'marketplace-exit'],
  outcomeLocator: 'Launch, legal terms, independent auction result and current distribution evidence.',
  sections: {
    what_it_is: section('TwelveFold is a 300-piece generative-art collection created by Yuga Labs and inscribed on individual satoshis in 2023. The work uses a base-12 system and a 12-by-12 grid to connect time, mathematics and Bitcoin’s ordinal numbering. It is separate from Bored Ape Yacht Club and Yuga’s Ethereum ecosystem. Buyers acquired specific Bitcoin inscriptions and a limited license under sale terms; they did not buy Yuga equity, copyright ownership, recurring revenue or a guaranteed future program.', [
      fact('TwelveFold contains 300 generative artworks inscribed on satoshis on Bitcoin.', ['site', 'terms'], 'Collection archive and sale definition.'),
      fact('The collection uses a base-12 art system organized around a 12-by-12 grid.', ['site'], 'Collection description.'),
      fact('Purchasers did not receive Yuga equity, copyright ownership or guaranteed recurring utility.', ['terms'], 'Ownership, license and disclaimer provisions.'),
    ]),
    what_happened: section('Yuga announced TwelveFold in February 2023 and auctioned 288 works in March, reserving 12 for contributors and philanthropic purposes. CoinDesk reported that the auction drew 3,246 bidders and generated about 735.7 BTC, then worth roughly $16.5 million; the top accepted bid approached $160,000. Yuga later ran a 13-part puzzle series with BTC prizes and offered physical pieces to holders, with claims closing in June 2024. No reviewed source documents a comparable recurring program after that finite sequence.', [
      fact('Yuga sold 288 of 300 works and reserved 12 under the original allocation.', ['site', 'terms', 'auction-report'], 'Auction structure and independent result.'),
      fact('CoinDesk reported 3,246 bidders and about 735.7 BTC of auction proceeds.', ['auction-report'], 'Independent auction-result article.'),
      fact('The collection archive records a puzzle series and a physical-claim window that closed in June 2024.', ['site'], 'Dated collection timeline.'),
    ]),
    why_this_outcome: section('TwelveFold converted Yuga’s brand and the novelty of early Ordinals into unusually strong primary demand for a tiny supply. The Bitcoin-native design, distinctive art system and auction scarcity differentiated it from another large profile-picture mint. That explains the launch, not current liquidity. The collection’s follow-on puzzles and physicals were finite, and a 300-piece supply can produce rare high-value sales while still offering little executable depth. Magic Eden’s 2026 Bitcoin exit removed one major trading surface and makes fresh market evidence more important.', [
      fact('Yuga brand distribution and a 300-piece cap coincided with a heavily subscribed primary auction.', ['site', 'auction-report'], 'Collection design and independent auction outcome.', 'inference'),
      fact('The documented follow-on puzzle and physical programs were finite rather than recurring.', ['site'], 'Dated archive timeline.', 'inference'),
      fact('Magic Eden ended its Bitcoin marketplace and related services during 2026.', ['marketplace-exit'], 'Bitcoin service shutdown schedule.'),
    ]),
    strategic_choices: section('Yuga chose Bitcoin Ordinals instead of extending an existing Ethereum collection, a highly limited 300-piece supply instead of mass distribution and a sealed-bid auction instead of a fixed mint price. It kept 12 works for contributors, donations and philanthropy, then added puzzles and physical art without promising a permanent roadmap. These choices protected artistic separation and scarcity, generated powerful price discovery and limited dilution. They also reduced holder breadth and made current market quality difficult to observe.', [
      fact('TwelveFold was designed as a standalone Bitcoin experiment rather than an Ethereum collection extension.', ['site', 'about'], 'Collection positioning and portfolio separation.'),
      fact('Yuga used an auction for 288 pieces and reserved 12.', ['terms', 'auction-report'], 'Sale allocation and result.'),
      fact('The reviewed terms and archive do not promise a permanent utility roadmap.', ['terms', 'site'], 'Sale obligations and finite timeline.', 'unknown'),
    ]),
    operating_model: section('Yuga created the artwork, conducted the one-time BTC auction and delivered inscriptions to successful bidders. Holders self-custody Bitcoin inscriptions and may transfer them through compatible wallets or marketplaces. Yuga later operated time-bounded puzzles and physical claims, but no subscription, treasury, DAO or continuing service obligation appears in the reviewed terms. Bitcoin preserves the inscription record; websites and marketplaces provide discovery and trading. Those layers can disappear without deleting the artwork.', [
      fact('The sale accepted BTC bids and delivered designated inscriptions to successful bidders.', ['terms', 'auction-report'], 'Auction process and result.'),
      fact('The official archive records finite follow-on puzzles and physical claims.', ['site'], 'Collection timeline.'),
      fact('No DAO, shared treasury, subscription or continuing operator obligation appears in the reviewed terms.', ['terms', 'site'], 'Sale and archive review.', 'unknown'),
    ]),
    token_and_value_capture: section('Yuga captured the primary auction proceeds. Holders captured the artwork, the license stated in the terms, finite puzzle or physical opportunities when eligible and any resale proceeds they could obtain. There is no separate TwelveFold token, revenue share or automatic royalty stream for holders. Historical auction value is not current market capitalization, and a rare asking price is not executable liquidity. Current royalties, active holders, bids, sale frequency and Yuga’s net costs are not established by the reviewed record.', [
      fact('The primary auction generated about 735.7 BTC according to independent reporting.', ['auction-report'], 'Auction result.'),
      fact('The reviewed terms provide artwork rights and disclaim financial guarantees rather than holder revenue sharing.', ['terms'], 'License and disclaimer provisions.'),
      fact('Current royalties, active holders, bids, sales and project costs remain unverified.', ['site', 'about', 'marketplace-exit'], 'Current archive and distribution evidence.', 'unknown'),
    ]),
    counterfactual: section('A larger fixed-price release could have broadened ownership but sacrificed scarcity and auction proceeds. Direct integration with Yuga’s Ethereum ecosystem might create more utility while weakening the Bitcoin-native thesis. A recurring exhibition or puzzle schedule could show continuing stewardship but would turn a finite art experiment into an operating product. None is proven superior: the primary auction was exceptionally successful, and current evidence does not show whether added utility would improve long-term collector demand or merely add cost.', [
      fact('The actual design used a small supply, Bitcoin-native art and a one-time auction.', ['site', 'terms', 'auction-report'], 'Collection and distribution design.'),
      fact('The documented follow-on program ended after finite puzzles and physical claims.', ['site'], 'Collection timeline.'),
      fact('The market effect of broader supply, Ethereum integration or recurring utility is unobserved.', ['site', 'auction-report'], 'No comparative experiment in the reviewed record.', 'unknown'),
    ]),
    risks_and_unknowns: section('Risks include thin-market pricing, Bitcoin wallet mistakes, marketplace dependence, licensing misunderstanding, phishing around rare inscriptions and confusing Yuga’s continuing corporate activity with TwelveFold-specific support. The 300-piece cap magnifies holder concentration and makes a single sale a weak trend measure. Magic Eden’s Bitcoin exit reduced one distribution channel. Unknowns include current beneficial holders, inscription movement, bids, unique buyers and sellers, royalties, private sales, physical delivery, creator staffing and whether Yuga plans another TwelveFold-specific program.', [
      fact('A 300-piece collection can have sparse observations even when individual works remain valuable.', ['site', 'auction-report'], 'Supply and historical auction record.', 'inference'),
      fact('Magic Eden discontinued its Bitcoin marketplace and remaining Bitcoin services in 2026.', ['marketplace-exit'], 'Service-change notice.'),
      fact('Current ownership concentration, bids, sales, royalties and TwelveFold staffing are not published in the reviewed sources.', ['site', 'about', 'marketplace-exit'], 'Current-source review.', 'unknown'),
    ]),
    lifecycle: section('TwelveFold moved from a February 2023 announcement to a high-demand March auction, then through inscriptions, puzzles and a 2024 physical-art claim. Its artifact layer remains intact and Yuga still identifies the collection, but the documented product sequence was finite. The lifecycle call therefore separates launch from present market: successful primary art release, persistent Bitcoin artifact and unclassified current collector economy. It is not dead simply because no new roadmap exists, and it is not thriving based on a three-year-old auction.', [
      fact('The collection launched, auctioned and delivered during February and March 2023.', ['site', 'terms', 'auction-report'], 'Dated launch timeline and independent result.'),
      fact('Follow-on puzzles and physical claims ended by June 2024 in the official timeline.', ['site'], 'Collection archive.'),
      fact('Current recurring operations and liquid market depth are not established.', ['site', 'about', 'marketplace-exit'], 'Current archive and distribution boundary.', 'unknown'),
    ]),
    outlook_and_watch: section('Base case: TwelveFold remains a recognized, scarce Bitcoin art collection with episodic private or marketplace trades, but market health stays unclassified. Watch verified transfers, unique buyers and sellers, executable bids, holder concentration, Yuga-specific updates, exhibitions and replacement Bitcoin venues after Magic Eden’s exit. The call improves if repeated arm’s-length sales and active stewardship appear. It worsens if official surfaces disappear or ownership becomes so concentrated that quoted prices have no reliable market behind them.', [
      fact('The inscriptions and collection archive support continued artifact recognition.', ['site', 'about'], 'Current first-party surfaces.'),
      fact('The loss of Magic Eden’s Bitcoin service increases the need to identify replacement market infrastructure.', ['marketplace-exit'], 'Marketplace shutdown notice.', 'inference'),
      fact('Repeated current sales, executable bids and active stewardship are not yet verified.', ['site', 'about', 'marketplace-exit'], 'Reviewed current evidence.', 'unknown'),
    ]),
  },
  events: [
    { key: 'announcement', type: 'collection_announcement', date: '2023-02-27', datePrecision: 'day', description: 'Yuga announced TwelveFold as a 300-piece Bitcoin generative-art collection.', sources: ['site'], locator: 'Official collection timeline.' },
    { key: 'auction', type: 'primary_auction', date: '2023-03-06', datePrecision: 'day', description: 'The auction allocated 288 works and generated about 735.7 BTC according to CoinDesk.', sources: ['terms', 'auction-report'], locator: 'Sale period and independent result.' },
    { key: 'physical-claims-close', type: 'holder_program_end', date: '2024-06-14', datePrecision: 'day', description: 'The official timeline records the end of the physical TwelveFold claim window.', sources: ['site'], locator: 'Collection archive timeline.' },
  ],
  identityBoundary: 'TwelveFold inscriptions, Yuga Labs, its other collections, auction proceeds, physical artworks and third-party Bitcoin marketplaces are separate.',
  metricBoundary: 'Primary auction proceeds, asking prices, executed sales, bids, holders and market capitalization are different and are not inferred from one another.',
  guardrail: 'Do not describe the 2023 auction as current liquidity, and do not call a finite art release dead solely because it has no recurring product roadmap.',
  unknowns: ['current_holders', 'holder_concentration', 'executed_sales', 'unique_buyers_and_sellers', 'bid_depth', 'royalties', 'private_sales', 'physical_delivery', 'current_stewardship'],
  methodologyNotes: ['The collection is evaluated as finite art rather than forced into an operating-product success test.'],
});

export const document = {
  schema: 'chaindump-nft-ordinals-depth-wave-c-v1',
  version: 1,
  research_as_of: AS_OF,
  generated_at: ACCESSED_AT,
  generated_migration: '0100_nft_ordinals_depth_wave_c.sql',
  selection_method: 'Five weakest non-overlapping NFT and Ordinals profiles after Waves A and B, selected for a mixed operating, pressured, failed, governance and finite-art lifecycle cohort.',
  entities: [
    { slug: funko, legacy_status: 'dead', canonical_profile: funkoProfile },
    { slug: sorare, legacy_status: 'thriving', canonical_profile: sorareProfile },
    { slug: metroverse, legacy_status: 'dead', canonical_profile: metroverseProfile },
    { slug: nouns, legacy_status: 'thriving', canonical_profile: nounsProfile },
    { slug: twelvefold, legacy_status: 'unknown', canonical_profile: twelvefoldProfile },
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
  return `-- Five current, source-linked NFT and Ordinals Wave C profiles researched ${AS_OF} and awaiting human review.
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

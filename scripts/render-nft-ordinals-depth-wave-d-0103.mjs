#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYSIS_SECTION_KEYS, validateEntityProfile } from '../src/lib/entity-profile.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = resolve(root, 'docs/nft-ordinals-depth-wave-d-2026-08-03.json');
const migrationPath = resolve(root, 'migrations/0103_nft_ordinals_depth_wave_d.sql');
const AS_OF = '2026-08-03';
const ACCESSED_AT = '2026-08-03T22:07:00Z';
const NEXT_REVIEW_AT = '2026-08-10T22:07:00Z';
const MAX_D1_STATEMENT_BYTES = 95_000;
const TARGET_TABLE = '_nft_ordinals_depth_wave_d_0103';

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

const artBlocks = 'art-blocks-generative-art';
const artBlocksProfile = buildProfile({
  slug: artBlocks,
  name: 'Art Blocks / onchain generative art',
  type: 'nft_collection',
  classification: { subtype: 'generative-art platform and protocol', tags: ['ethereum', 'generative_art', 'artist_platform', 'primary_mints', 'secondary_marketplace'], chains: ['Ethereum'], jurisdictions: ['United States'] },
  sources: [
    source(artBlocks, 'about', 'About Art Blocks', 'https://www.artblocks.io/articles/about-art-blocks', 'Art Blocks', '2020-11-27', 'A', 'primary', { independence_group: 'art-blocks' }),
    source(artBlocks, 'offerings', 'Art Blocks creative offerings', 'https://docs.artblocks.io/creator-onboarding/offerings/', 'Art Blocks', null, 'A', 'primary', { independence_group: 'art-blocks' }),
    source(artBlocks, 'contracts', 'Art Blocks core contract and royalty standard', 'https://docs.artblocks.io/developer/core-contract/', 'Art Blocks', null, 'A', 'primary', { independence_group: 'art-blocks' }),
    source(artBlocks, 'generator', 'Art Blocks on-chain generator', 'https://docs.artblocks.io/protocol/on-chain-generator/', 'Art Blocks', null, 'A', 'primary', { independence_group: 'art-blocks' }),
    source(artBlocks, 'journal', 'The Art Blocks Journal', 'https://www.artblocks.io/articles', 'Art Blocks', null, 'A', 'primary', { independence_group: 'art-blocks' }),
    source(artBlocks, 'time', 'As the NFT market explodes again, artists fend off old art-world power structures', 'https://time.com/6106679/nft-art-rise/', 'TIME', '2021-10-15', 'B', 'independent', { independence_group: 'time', access_method: 'indexed_browser_snapshot', direct_http_status: 406 }),
  ],
  operatingState: 'active_artist_platform_with_current_programming',
  statusAssertion: 'Art Blocks maintained current editorial and exhibition programming and documented active creator offerings as of August 3, 2026.',
  statusSources: ['offerings', 'journal'],
  statusLocator: 'Current creator documentation and dated 2026 journal entries.',
  outcome: 'durable_category_leader_with_unverified_current_market_economics',
  outcomeConfidence: 'medium',
  outcomeAssertion: 'Art Blocks has endured as a recognizable onchain generative-art platform, while current company revenue and collection-level liquidity remain unverified.',
  outcomeSources: ['about', 'offerings', 'journal', 'time'],
  outcomeLocator: 'Operating platform evidence plus independent historical category reporting; financial unknowns are explicit.',
  sections: {
    what_it_is: section('Art Blocks is an Ethereum-based platform and protocol for artists who write an algorithm and collectors who mint a unique output from that code. The platform is not one NFT collection: each artist project has its own supply, pricing and market history, while Art Blocks supplies contracts, curation, discovery and mint infrastructure. Its onchain-generator work also gives projects a standardized way to preserve or reconstruct outputs without treating every external marketplace listing as platform revenue.', [
      fact('Art Blocks lets artists publish generative projects whose outputs are created when collectors mint.', ['about', 'offerings'], 'Platform description and creator-offering documentation.'),
      fact('Each Art Blocks artist project is economically and artistically distinct from the Art Blocks platform.', ['offerings', 'time'], 'Offering categories and independent description of artist projects.'),
      fact('The onchain generator provides shared rendering infrastructure without making third-party asking prices Art Blocks revenue.', ['generator', 'contracts'], 'Protocol documentation and metric boundary.', 'inference'),
    ]),
    what_happened: section('Art Blocks launched in 2020 and became an early home for long-form generative art during the 2021 NFT expansion. Independent reporting described hundreds of artists using the platform and documented strong demand for individual releases, but those historical auctions do not measure the whole platform today. By 2026 Art Blocks was still publishing exhibitions, artist features and creator pathways, showing continuing cultural and operating activity even though this review found no audited current revenue or platform-wide trading series.', [
      fact('Art Blocks launched in 2020 as an on-demand generative-art platform.', ['about', 'time'], 'Launch history and independent contemporary reporting.'),
      fact('Demand for individual Art Blocks releases was substantial during the 2021 NFT expansion.', ['time'], 'Contemporary reporting on artists and auctions.'),
      fact('Current programming continued in 2026, but audited platform revenue and a complete current trading series were not published in reviewed sources.', ['journal', 'offerings'], 'Current journal and documentation review.', 'unknown'),
    ]),
    why_this_outcome: section('Art Blocks built around a durable creative method rather than a single character brand: artist-authored code, provable scarcity and a reveal at mint. That differentiated product attracted artists and collectors before generative art became a broad NFT category, as TIME documented in 2021. The platform then kept investing in curation, creator tooling and exhibitions after speculative volumes fell. This supports cultural durability, but it does not prove that current mints, secondary royalties or platform operations are profitable.', [
      fact('Code-based creation and the collector-triggered reveal differentiated Art Blocks from fixed-image collectible drops.', ['about', 'generator', 'time'], 'Product mechanism and independent category reporting.'),
      fact('Creator offerings and current editorial programming show the platform continued beyond its 2021 market peak.', ['offerings', 'journal'], 'Current operating surfaces.'),
      fact('The evidence supports cultural durability but does not establish current profitability.', ['journal', 'contracts', 'time'], 'Synthesis across current first-party and independent historical evidence.', 'inference'),
    ]),
    strategic_choices: section('Art Blocks chose a curated platform model with multiple creator tracks instead of issuing one house collection as the entire product. It also chose reusable Ethereum contracts and onchain rendering standards, making provenance and preservation part of the pitch. More recently it has used physical exhibitions and editorial storytelling to reach beyond crypto-native trading. Those choices strengthen institutional legibility, but dependence on artist quality, Ethereum economics and collector demand remains outside the platform’s full control.', [
      fact('Art Blocks offers multiple creator pathways rather than treating every project as one undifferentiated collection.', ['offerings'], 'Creator-offering documentation.'),
      fact('The platform invested in reusable contracts and an onchain rendering standard.', ['contracts', 'generator'], 'Developer and protocol documentation.'),
      fact('Exhibitions and editorial programming extend distribution beyond marketplace trading.', ['journal'], 'Dated exhibition and artist features.', 'inference'),
    ]),
    operating_model: section('Artists submit or develop projects through Art Blocks offerings, then collectors mint algorithmically generated works through project contracts. Art Blocks provides curation, technical infrastructure and discovery; artists provide the code and creative concept; collectors own the resulting tokens. Secondary marketplaces can list those tokens, but a marketplace’s volume belongs to the project and venue before it says anything about Art Blocks itself. Current staffing, runway, mint cadence and customer cohort retention were not disclosed in the reviewed material.', [
      fact('Artists supply project code and collectors mint generated outputs through the platform’s contract system.', ['offerings', 'contracts'], 'Creator onboarding and core-contract documentation.'),
      fact('Collection trading on an external venue is not the same measure as Art Blocks platform usage or revenue.', ['contracts', 'time'], 'Platform and market boundary.', 'inference'),
      fact('Current staffing, runway, mint cadence and retained collector cohorts were not disclosed.', ['offerings', 'journal'], 'Reviewed current public surfaces.', 'unknown'),
    ]),
    token_and_value_capture: section('Art Blocks does not present a native fungible platform token in the reviewed sources. Value can be created through primary mints and creator royalties supported by contract standards, but the split among artist, platform and collaborators varies by project and must be checked at the contract or offering level. Owning one artwork does not confer equity in Art Blocks, rights to other artists’ projects or a guaranteed royalty stream. Current platform take rates and realized annual revenue are not publicly verified here.', [
      fact('The reviewed Art Blocks materials do not describe a native fungible platform token.', ['about', 'contracts'], 'Platform and contract documentation.', 'unknown'),
      fact('Core contracts support royalty information, while project economics can vary by deployment.', ['contracts', 'offerings'], 'Royalty standard and offering differences.'),
      fact('An Art Blocks token is artwork ownership, not equity in the platform or a guaranteed income claim.', ['contracts', 'time'], 'Contract and ownership boundary.', 'inference'),
    ]),
    counterfactual: section('Art Blocks would have been more fragile if it had remained only a 2021 mint calendar with no preservation layer, artist pipeline or institutional programming. The opposite risk is over-curation: a closed gate can reduce experimentation and push creators to cheaper open tools. A stronger outcome would pair cultural programming with transparent platform-level operating measures such as active artists, primary collectors, repeat mint participation and realized fee revenue. None of those counterfactual measures is yet complete in this dossier.', [
      fact('Creator programs, protocol work and exhibitions give Art Blocks more than one operating surface.', ['offerings', 'generator', 'journal'], 'Current product and distribution surfaces.'),
      fact('A curated model trades quality control for a narrower creator funnel.', ['offerings'], 'Offering design.', 'inference'),
      fact('Active-artist cohorts, repeat collectors and realized platform fee revenue remain unverified.', ['offerings', 'journal', 'contracts'], 'Public evidence review.', 'unknown'),
    ]),
    risks_and_unknowns: section('The largest risk is confusing famous historical collections with current platform health: a past auction or a high floor is not recurring revenue. Ethereum transaction costs, optional royalty enforcement, artist concentration and reduced speculative demand can all weaken economics even when the art remains culturally important. This review could not verify company profitability, treasury, staff count, retained collectors, current primary-mint sell-through or platform-wide secondary revenue. Those gaps keep the outcome confidence at medium.', [
      fact('Historical project prices do not by themselves measure current platform health.', ['time', 'journal'], 'Historical-versus-current evidence boundary.', 'inference'),
      fact('Royalty standards can communicate payment information but do not guarantee every venue enforces payment.', ['contracts'], 'ERC-2981 implementation context.', 'inference'),
      fact('Profitability, treasury, staffing, retained collectors and current sell-through were not verified.', ['offerings', 'journal'], 'Current-source review.', 'unknown'),
    ]),
    lifecycle: section('Art Blocks progressed from a 2020 experiment to a category-defining 2021 platform, then into a post-boom institution that still supports artists and exhibitions. The important lifecycle distinction is that individual projects can be dead, dormant or liquid while the platform remains active. As of August 3, 2026 the operating platform is active and culturally durable, but current financial strength is unclassified. That is a stronger conclusion than “thriving” based on reputation alone and a more accurate one than treating lower NFT volume as platform death.', [
      fact('Art Blocks launched in 2020 and gained broad artist and collector attention during 2021.', ['about', 'time'], 'Launch and independent historical reporting.'),
      fact('Current creator documentation and 2026 programming show continued platform operations.', ['offerings', 'journal'], 'Current operating evidence.'),
      fact('Current financial strength remains unclassified because verified platform economics were not found.', ['contracts', 'journal'], 'Financial evidence gap.', 'unknown'),
    ]),
    outlook_and_watch: section('Base case: Art Blocks remains an important generative-art institution and active creator platform, while commercial performance varies sharply by artist and project. Watch primary release cadence, unique and repeat minters, active artists, exhibition partnerships, contract upgrades, realized royalty payments and platform disclosures. The call improves if current cohorts and fee revenue show repeat demand beyond a few marquee names. It weakens if new projects stop attracting collectors, current programming thins or preservation tooling becomes detached from artist adoption.', [
      fact('Current creator and exhibition surfaces support a continuing operating base case.', ['offerings', 'journal'], 'Current first-party activity.'),
      fact('Project-level demand must be measured separately from platform-level retention and revenue.', ['contracts', 'time'], 'Metric boundary.', 'inference'),
      fact('Repeat-minter cohorts, active-artist counts and realized fee revenue need current verification.', ['offerings', 'journal'], 'Forward evidence requirements.', 'unknown'),
    ]),
  },
  events: [
    { key: 'launch', type: 'platform_launch', date: '2020-11-27', datePrecision: 'day', description: 'Art Blocks published its founding account of launching an on-demand generative-art platform.', sources: ['about'], locator: 'Dated About Art Blocks article.' },
    { key: 'market-expansion', type: 'category_expansion', date: '2021-10-15', datePrecision: 'day', description: 'TIME documented hundreds of generative artists finding a home on Art Blocks during the NFT-art expansion.', sources: ['time'], locator: 'Independent contemporary feature.' },
    { key: 'current-programming', type: 'current_operations', date: '2026-04-02', datePrecision: 'day', description: 'Art Blocks published current exhibition programming tied to Art Basel Hong Kong.', sources: ['journal'], locator: 'Dated journal entry visible in the current journal.' },
  ],
  identityBoundary: 'Art Blocks the platform, individual artist projects, token holders, external marketplaces and the company behind the platform are separate analytical objects.',
  metricBoundary: 'Project floors, primary auction proceeds, marketplace volume, royalties and platform revenue are distinct measures and are never substituted for one another.',
  guardrail: 'Do not call Art Blocks financially thriving from historic auction prices or current cultural programming alone.',
  unknowns: ['platform_revenue', 'profitability', 'treasury', 'staffing', 'active_artists', 'repeat_minters', 'primary_sell_through', 'realized_royalties'],
  methodologyNotes: ['Platform lifecycle is evaluated separately from the lifecycle of each artist collection hosted on it.'],
});

const madLads = 'mad-lads';
const madLadsProfile = buildProfile({
  slug: madLads,
  name: 'Mad Lads',
  type: 'nft_collection',
  classification: { subtype: 'profile-picture and xNFT collection', tags: ['solana', 'xnft', 'backpack', 'holder_allocation', 'operator_ecosystem'], chains: ['Solana'], jurisdictions: ['United States', 'United Arab Emirates'] },
  sources: [
    source(madLads, 'history', 'What are the Mad Lads?', 'https://news.madlads.com/p/what-are-the-mad-lads', 'Mad News', '2023-12-22', 'B', 'primary', { independence_group: 'mad-lads' }),
    source(madLads, 'collection', 'Mad Lads collection', 'https://www.madlads.com/', 'Mad Lads', null, 'A', 'primary', { independence_group: 'mad-lads' }),
    source(madLads, 'about-backpack', 'About Backpack', 'https://learn.backpack.exchange/about', 'Backpack', null, 'A', 'primary', { independence_group: 'backpack' }),
    source(madLads, 'tge', 'Backpack TGE: 24% to Points, 1% to Mad Lads', 'https://learn.backpack.exchange/blog/backpack-token-tge-overview', 'Backpack', '2026-01-30', 'A', 'primary', { independence_group: 'backpack' }),
    source(madLads, 'claim', 'How to claim your BP allocation on Backpack Exchange', 'https://learn.backpack.exchange/articles/how-to-claim-bp', 'Backpack', '2026-03-23', 'A', 'primary', { independence_group: 'backpack' }),
    source(madLads, 'coindesk-launch', 'Heavy demand for Madlads NFT breaks internet, delays mint', 'https://www.coindesk.com/web3/2023/04/21/heavy-demand-for-madlads-nft-breaks-internet-delays-mint', 'CoinDesk', '2023-04-21', 'B', 'independent', { independence_group: 'coindesk' }),
    source(madLads, 'techcrunch', 'How Backpack climbed to success after FTX died', 'https://techcrunch.com/2024/03/19/how-crypto-exchange-backpack-climbed-its-way-to-success-after-its-major-investor-ftx-died/', 'TechCrunch', '2024-03-19', 'B', 'independent', { independence_group: 'techcrunch' }),
  ],
  operatingState: 'active_collection_inside_active_backpack_ecosystem',
  statusAssertion: 'Mad Lads remained an active 10,000-item Solana collection tied to Backpack, with a completed BP holder-claim process documented in 2026.',
  statusSources: ['collection', 'about-backpack', 'claim'],
  statusLocator: 'Current collection and operator pages plus dated claim instructions.',
  outcome: 'durable_operator_linked_collection_with_one_time_token_benefit',
  outcomeConfidence: 'medium',
  outcomeAssertion: 'Mad Lads sustained relevance by anchoring Backpack’s user community, but its benefits are discretionary or event-specific rather than ownership of Backpack cash flows.',
  outcomeSources: ['history', 'tge', 'techcrunch', 'coindesk-launch'],
  outcomeLocator: 'Launch evidence, operator strategy, 2026 allocation and explicit holder-right boundary.',
  sections: {
    what_it_is: section('Mad Lads is a 10,000-piece Solana profile-picture collection created by the team behind Backpack and introduced as an xNFT, a token that could expose applications inside the Backpack wallet. It is not the Backpack company, exchange, wallet or BP token. The shared operator gives the collection privileged cultural positioning and occasional benefits, but an NFT does not represent equity, customer assets or a contractual share of exchange revenue. Any holder program must be verified on its own terms and snapshot date.', [
      fact('Mad Lads is a 10,000-piece Solana collection created by the team behind Backpack.', ['history', 'collection', 'tge'], 'Collection history and 2026 operator description.'),
      fact('Mad Lads was introduced as an xNFT connected to applications inside Backpack.', ['history', 'coindesk-launch'], 'Product history and independent launch reporting.'),
      fact('A Mad Lads NFT is separate from Backpack equity, customer assets and the BP token.', ['about-backpack', 'tge'], 'Entity and rights boundary.', 'inference'),
    ]),
    what_happened: section('Heavy demand and bot traffic forced the April 2023 mint to be delayed, while the team used a decoy mint and refunds to blunt automated abuse. Mad Lads then became the cultural entry point for Backpack as the operator expanded from wallet and xNFT infrastructure into a regulated exchange business. Backpack’s 2026 token launch reserved a defined share for eligible Mad Lads holders and published a snapshot-based claim process. That distribution was a dated event, not evidence of a permanent rewards obligation.', [
      fact('The April 2023 mint was delayed after demand and bot traffic overwhelmed launch infrastructure.', ['coindesk-launch'], 'Independent launch report.'),
      fact('Backpack expanded from wallet and xNFT products into an exchange business after the collection launched.', ['about-backpack', 'techcrunch'], 'Operator history and independent business profile.'),
      fact('Eligible snapshot holders received a defined 2026 BP allocation through a wallet-linked claim process.', ['tge', 'claim'], 'Official token overview and claim instructions.'),
    ]),
    why_this_outcome: section('Mad Lads benefited from unusually tight product and community fit: the collection gave Backpack a recognizable user group, and Backpack gave holders a live wallet, exchange and distribution channel. Independent reporting also found that the founders’ credibility in Solana and the timing after FTX’s collapse helped the launch attract attention. The 2026 BP allocation renewed that link. The inference is durable relevance, not guaranteed value: operator growth can support attention while NFT liquidity, holder retention and realized benefits still vary.', [
      fact('The collection and Backpack were designed as complementary community and product surfaces.', ['history', 'about-backpack', 'techcrunch'], 'Operator framing and independent business profile.'),
      fact('Independent launch reporting connected demand to the team’s Solana reputation and a difficult post-FTX market.', ['coindesk-launch', 'techcrunch'], 'Independent launch and company coverage.'),
      fact('The operator relationship helps distribution but does not guarantee NFT liquidity or future benefits.', ['tge', 'claim', 'techcrunch'], 'Benefit mechanics and analytical boundary.', 'inference'),
    ]),
    strategic_choices: section('The team launched a collectible as a live demonstration of its xNFT wallet thesis instead of treating the art as a disconnected merchandise drop. It used bot countermeasures and refunds during a hostile mint, then made Mad Lads a recurring community layer around Backpack products. In 2026 Backpack chose a snapshot-based BP allocation for holders, which rewarded a specific cohort without making benefits transferable after the snapshot. This strategy aligns attention with the operator, but it also makes collection sentiment dependent on Backpack execution and policy.', [
      fact('Mad Lads was positioned as a demonstration of Backpack’s xNFT model.', ['history', 'coindesk-launch'], 'Launch positioning.'),
      fact('The launch team used a decoy mint and refunds as an anti-bot response.', ['coindesk-launch'], 'Independent launch report.'),
      fact('The BP holder allocation used a snapshot, so later NFT transfers did not transfer that claim.', ['claim'], 'Official claim instructions.'),
    ]),
    operating_model: section('The collection itself is a fixed-supply digital collectible, while Backpack operates the wallet, exchange and related services. Holders can use the NFT as identity and may receive access or benefits chosen by the operator or third parties. Backpack acquires customers and earns through its own products; those economics do not automatically accrue to the NFT. Current verified collection staffing, royalty receipts, unique active holders and repeat marketplace buyers were not published in the reviewed sources, so operating health is inferred from active surfaces rather than a complete P&L.', [
      fact('Backpack operates wallet and exchange products separately from the Mad Lads collection.', ['about-backpack', 'techcrunch'], 'Operator product description.'),
      fact('Holder access or distributions are program-specific and do not automatically mirror Backpack revenue.', ['tge', 'claim'], 'Benefit terms and entity boundary.', 'inference'),
      fact('Current royalty receipts, active holders and repeat buyer cohorts were not published.', ['collection', 'about-backpack'], 'Current evidence review.', 'unknown'),
    ]),
    token_and_value_capture: section('Mad Lads holders own the NFT; Backpack’s BP is a separate fungible token. Backpack’s official TGE overview allocated 1 percent of BP supply to Mad Lads holders, and its claim guide tied eligibility to a historical wallet snapshot. That was a one-time allocation, not recurring NFT yield, and transferring the NFT after the snapshot did not transfer the allocation. This review found no contract promising holders exchange profits, future airdrops or a permanent share of token supply, and it does not value the BP received.', [
      fact('Backpack documented a 1 percent BP supply allocation for eligible Mad Lads holders.', ['tge'], 'Official TGE allocation.'),
      fact('Eligibility followed a historical wallet snapshot and did not transfer with a later NFT sale.', ['claim'], 'Official claim instructions.'),
      fact('The reviewed sources do not establish recurring yield, exchange profit-sharing or guaranteed future airdrops.', ['tge', 'claim'], 'Rights review.', 'unknown'),
    ]),
    counterfactual: section('Mad Lads could have become another isolated profile-picture mint if Backpack had not shipped usable products or survived the loss of capital associated with FTX. The team instead kept building a wallet and exchange, preserving a reason for the collection to matter beyond launch week. A better outcome for holders would include transparent, repeatable benefits and current liquidity data that are not dependent on occasional announcements. A worse outcome would follow regulatory trouble, exchange loss events or policy changes that sever the collection’s privileged relationship with the operator.', [
      fact('Backpack continued building after losing operating capital connected to the FTX collapse.', ['techcrunch'], 'Independent company history.'),
      fact('Live operator products gave the collection a continuing role beyond its launch.', ['about-backpack', 'history'], 'Product and community linkage.', 'inference'),
      fact('Repeatable holder economics and complete current liquidity data remain unverified.', ['collection', 'tge', 'claim'], 'Current evidence gap.', 'unknown'),
    ]),
    risks_and_unknowns: section('Mad Lads is exposed to Backpack concentration risk: security, solvency, regulation, service availability and management decisions can affect collection sentiment even when the NFT contracts continue to exist. The xNFT label also should not be read as proof that holders still use embedded applications. Marketplace floors can be thin and volatile, and the BP allocation can create short-lived attention that is mistaken for retained demand. This review could not verify current holder concentration, sales depth, royalty revenue, embedded-app usage or contractual future benefits.', [
      fact('The collection’s brand and benefits are materially linked to Backpack’s execution.', ['history', 'about-backpack', 'tge'], 'Operator linkage.'),
      fact('A one-time token allocation can increase attention without proving retained NFT demand.', ['tge', 'claim'], 'Event-versus-retention boundary.', 'inference'),
      fact('Current holder concentration, sales depth, royalties and xNFT usage were not verified.', ['collection', 'about-backpack'], 'Current public-source review.', 'unknown'),
    ]),
    lifecycle: section('Mad Lads moved from a technically ambitious and heavily contested April 2023 mint into the flagship community collection for a growing wallet and exchange operator. It retained a clear operator relationship through Backpack’s expansion and received a documented BP allocation in 2026. As of August 3, 2026 the collection is active and strategically relevant, but commercial health is only partly measured. The lifecycle call is “durable operator-linked collection,” not “thriving” solely because Backpack is active or because holders received one distribution.', [
      fact('Mad Lads launched in April 2023 after a high-demand, disrupted mint.', ['coindesk-launch'], 'Independent launch report.'),
      fact('The collection remained tied to Backpack through its product expansion and 2026 token event.', ['about-backpack', 'tge', 'claim'], 'Operator and benefit timeline.'),
      fact('Current NFT commercial health remains only partly measured.', ['collection', 'techcrunch'], 'Collection-versus-operator metric boundary.', 'unknown'),
    ]),
    outlook_and_watch: section('Base case: Mad Lads remains a recognizable Solana collection and the cultural front door to Backpack, with value driven more by operator relevance than by the original xNFT novelty alone. Watch unique buyers and sellers, executable bids, holder concentration, royalty receipts, actual xNFT use, Backpack security and licensing status, and whether benefits recur under published rules. The call improves if product use and broad holder participation persist without subsidies. It weakens if activity concentrates around one-off allocations or Backpack problems spill into the collection.', [
      fact('The continuing Backpack relationship supports a durable cultural base case.', ['about-backpack', 'tge', 'techcrunch'], 'Current operator linkage and independent context.'),
      fact('One-off benefits must be separated from broad, repeated holder participation.', ['tge', 'claim'], 'Benefit and retention boundary.', 'inference'),
      fact('Current bids, holder concentration, royalty receipts and xNFT usage need verification.', ['collection', 'about-backpack'], 'Forward evidence requirements.', 'unknown'),
    ]),
  },
  events: [
    { key: 'mint-delay', type: 'mint_event', date: '2023-04-21', datePrecision: 'day', description: 'Heavy demand and bot activity forced the Mad Lads mint to be delayed.', sources: ['coindesk-launch'], locator: 'Independent launch report.' },
    { key: 'exchange-beta', type: 'operator_expansion', date: '2024-03-19', datePrecision: 'day', description: 'TechCrunch reported Backpack had expanded into exchange beta after surviving the loss of capital at FTX.', sources: ['techcrunch'], locator: 'Independent company profile.' },
    { key: 'bp-claim', type: 'holder_distribution', date: '2026-03-23', datePrecision: 'day', description: 'Backpack opened instructions for eligible Mad Lads snapshot holders to claim BP.', sources: ['tge', 'claim'], locator: 'Official TGE and claim documentation.' },
  ],
  identityBoundary: 'Mad Lads NFTs, the Backpack company, Backpack Exchange customer assets, the Backpack wallet and the BP token are separate.',
  metricBoundary: 'NFT floors, exchange volume, operator revenue, BP price and holder allocations are distinct and cannot substitute for one another.',
  guardrail: 'Do not describe the 2026 BP allocation as recurring yield, Backpack equity or a benefit that followed NFT transfers after the snapshot.',
  unknowns: ['holder_concentration', 'unique_buyers_and_sellers', 'bid_depth', 'royalty_revenue', 'xnft_usage', 'future_holder_benefits', 'collection_staffing'],
  methodologyNotes: ['Operator strength is treated as context and distribution, not as a direct collection cash flow.'],
});

const okayBears = 'okay-bears';
const okayBearsProfile = buildProfile({
  slug: okayBears,
  name: 'Okay Bears',
  type: 'nft_collection',
  classification: { subtype: 'profile-picture collection and consumer brand', tags: ['solana', 'consumer_products', 'licensing', 'img', 'charity'], chains: ['Solana'], jurisdictions: ['Australia'] },
  sources: [
    source(okayBears, 'launch', 'Okay Bears top Ethereum NFT projects in $18M sales day', 'https://decrypt.co/98848/solana-okay-bears-top-ethereum-nft-projects-18m-sales', 'Decrypt', '2022-04-27', 'B', 'independent', { independence_group: 'decrypt' }),
    source(okayBears, 'img', 'Okay Bears signs licensing deal with IMG', 'https://www.coindesk.com/business/2022/09/20/solana-based-nft-project-okay-bears-signs-licensing-deal-with-img', 'CoinDesk', '2022-09-20', 'B', 'independent', { independence_group: 'coindesk' }),
    source(okayBears, 'about', 'About Okay Bears', 'https://weareokay.com/blogs/news/about', 'Okay Bears', null, 'A', 'primary', { independence_group: 'okay-bears' }),
    source(okayBears, 'shop', 'Okay Bears current products', 'https://weareokay.com/collections/frontpage', 'Okay Bears', null, 'A', 'primary', { independence_group: 'okay-bears' }),
  ],
  operatingState: 'active_consumer_brand_with_partly_measured_nft_market',
  statusAssertion: 'Okay Bears continued to operate a consumer-brand site and sell physical products while its original Solana collection remained identifiable as of August 3, 2026.',
  statusSources: ['about', 'shop'],
  statusLocator: 'Current operator brand and storefront surfaces.',
  outcome: 'active_brand_extension_with_unverified_collection_retention',
  outcomeConfidence: 'medium',
  outcomeAssertion: 'Okay Bears converted launch attention into licensing and products, but current NFT holder retention, liquidity and cash-flow linkage are not established.',
  outcomeSources: ['launch', 'img', 'about', 'shop'],
  outcomeLocator: 'Independent launch and licensing history plus current first-party brand activity.',
  sections: {
    what_it_is: section('Okay Bears began as a 10,000-piece Solana profile-picture collection and developed into a character and lifestyle brand. The NFT collection, the operating brand, licensed products and charitable campaigns are related but not interchangeable: a retail sale is not an NFT sale, and a licensing deal does not automatically pay token holders. Current brand pages describe apparel, partnerships and public-impact programs. They do not describe the NFT as equity, a royalty claim or a guaranteed coupon on every product.', [
      fact('Okay Bears launched as a 10,000-piece Solana profile-picture collection.', ['launch', 'about'], 'Independent launch reporting and current brand history.'),
      fact('The operator expanded the characters into licensing, products and public-impact campaigns.', ['img', 'about', 'shop'], 'Licensing report and current brand surfaces.'),
      fact('The reviewed sources do not give NFT holders equity or a contractual share of retail and licensing revenue.', ['about', 'shop', 'img'], 'Rights boundary.', 'unknown'),
    ]),
    what_happened: section('Okay Bears minted in April 2022 and produced roughly $18 million of secondary volume in one day, briefly topping major Ethereum collections. Later that year the team signed with IMG to pursue consumer products, live events and publishing. The current brand says it subsequently worked with Zara, appeared in Fortnite promotion and raised funds for charities, while the store still lists physical products. Those milestones show brand execution, but the reviewed pages do not publish current NFT trading depth or audited brand revenue.', [
      fact('Okay Bears generated roughly $18 million in secondary trading during its April 2022 breakout day.', ['launch'], 'Independent contemporary market report.'),
      fact('The team signed IMG in 2022 to pursue licensing beyond the NFT market.', ['img'], 'Independent licensing report.'),
      fact('Current brand and store pages show ongoing products and partnerships but not audited revenue or current NFT depth.', ['about', 'shop'], 'Current public surfaces.', 'unknown'),
    ]),
    why_this_outcome: section('The collection succeeded at launch because its approachable artwork, optimistic message and Solana timing reached beyond a narrow trading niche. The team then made a deliberate licensing pivot while attention was still high, giving the characters distribution through established retail and entertainment channels. That helps explain why the brand still has a public product surface after the NFT boom. It does not prove that original holders remain engaged or that consumer revenue flows back to the collection, which is why the outcome stays mixed rather than fully thriving.', [
      fact('Independent launch reporting documented unusually broad trading attention for a Solana collection.', ['launch'], 'Contemporary market report.'),
      fact('The IMG deal and current brand history show a deliberate move into mainstream licensing and products.', ['img', 'about', 'shop'], 'Independent licensing evidence and current execution.'),
      fact('Brand persistence supports durability but does not establish retained NFT demand or holder cash flow.', ['launch', 'about', 'shop'], 'Cross-source causal synthesis.', 'inference'),
    ]),
    strategic_choices: section('Okay Bears chose a positive, broadly licensable character identity rather than an exclusively crypto-native or adversarial brand. It hired IMG within months of launch and used partnerships, retail products and charity work to make the intellectual property visible outside NFT marketplaces. This diversified distribution and reduced dependence on a single marketplace cycle. The tradeoff is that brand success can become detached from token demand unless holders receive clear, enforceable utility or the community remains central to product launches; neither condition is fully measured here.', [
      fact('The brand adopted a positive, mass-market character identity and message.', ['about', 'launch'], 'Brand history and launch coverage.'),
      fact('The team chose licensing, retail and charitable partnerships as distribution channels.', ['img', 'about', 'shop'], 'Independent deal report and current brand activity.'),
      fact('Offchain brand growth can diverge from NFT demand when holder rights are not explicit.', ['img', 'about'], 'Entity and value-capture boundary.', 'inference'),
    ]),
    operating_model: section('The operating brand develops character IP, licenses it to partners, sells physical goods and runs community or charitable campaigns. NFT holders own individual Solana tokens and can participate in community identity, but the reviewed current pages do not state that they control the IP company or receive product margins. Sales through Zara or the brand store belong to those commercial relationships, not automatically to the collection’s secondary market. Current unit sales, license fees, margins, repeat customers and NFT-holder participation were not disclosed.', [
      fact('Okay Bears operates through licensing, physical products and brand partnerships.', ['img', 'about', 'shop'], 'Business and storefront evidence.'),
      fact('Commercial partner sales and NFT marketplace sales are separate operating measures.', ['img', 'shop', 'launch'], 'Channel boundary.', 'inference'),
      fact('Current unit sales, licensing revenue, margins and holder participation were not disclosed.', ['about', 'shop'], 'Current public-source review.', 'unknown'),
    ]),
    token_and_value_capture: section('The original Okay Bears NFT is the relevant onchain asset in this profile; this review found no native fungible token required to use the brand. The collection can capture value through resale demand and any creator royalties actually paid, while the operating company can capture value through licensing and product sales. Those paths are separate. Owning a bear does not, on the evidence reviewed, entitle the holder to IMG licensing revenue, Zara sales or charity funds, and current realized royalty receipts were not published.', [
      fact('The reviewed sources center the Solana NFT and do not describe a native fungible Okay Bears token.', ['about', 'shop', 'launch'], 'Current and historical product descriptions.', 'unknown'),
      fact('NFT resale economics and consumer-product economics are separate value-capture channels.', ['img', 'shop', 'launch'], 'Channel and entity boundary.', 'inference'),
      fact('No reviewed source grants NFT holders a contractual share of licensing or retail revenue.', ['img', 'about', 'shop'], 'Rights review.', 'unknown'),
    ]),
    counterfactual: section('Without the early IMG relationship, Okay Bears might have remained a high-volume 2022 mint whose visibility faded with Solana NFT trading. The licensing strategy preserved brand surfaces and created reasons for the characters to appear in retail, but it may also have prioritized a consumer-IP company over measurable NFT-holder value. A stronger counterfactual would publish repeat product demand, licensing results and holder participation without promising securities-like returns. A weaker path would be a dormant store and no current partners while historical launch volume carried the narrative.', [
      fact('The IMG relationship created a pathway beyond NFT marketplace demand.', ['img'], 'Independent licensing report.'),
      fact('Current products and brand history indicate that pathway produced visible follow-on activity.', ['about', 'shop'], 'Current first-party surfaces.'),
      fact('The effect of brand expansion on NFT-holder retention and value remains unmeasured.', ['about', 'shop', 'launch'], 'Current evidence gap.', 'unknown'),
    ]),
    risks_and_unknowns: section('The principal risk is brand-token decoupling: Okay Bears can sell licensed products while the original NFT loses users, buyers or relevance. Retail claims on a brand website also need independent, dated verification before they are used as financial evidence. Solana marketplace liquidity can be thin, quoted floors can move without broad trading and royalties may not be consistently enforced. This review could not verify holder concentration, current sales, bids, repeat buyers, realized royalties, licensing revenue, product margins or a formal holder-benefit program.', [
      fact('Brand activity and NFT market health can move independently.', ['img', 'about', 'launch'], 'Entity and channel boundary.', 'inference'),
      fact('A quoted marketplace floor would not establish broad liquidity or repeat demand.', ['launch'], 'Historical market evidence and metric guardrail.', 'inference'),
      fact('Current holder, market, royalty and licensing economics were not verified.', ['about', 'shop'], 'Current evidence review.', 'unknown'),
    ]),
    lifecycle: section('Okay Bears moved from a breakout April 2022 mint into a licensing-led consumer brand with physical products and partnership claims that remain visible in 2026. That is real operating continuity, but it answers a different question from whether the NFT collection has retained owners, liquidity and repeat use. As of August 3, 2026 the brand is active and the NFT artifact persists; collection-market health is unclassified to middling because current participation data are missing. Historical launch volume is not treated as today’s demand.', [
      fact('The collection broke out in April 2022 and entered a licensing relationship by September 2022.', ['launch', 'img'], 'Dated independent reports.'),
      fact('Current brand and product pages show continued offchain operations in 2026.', ['about', 'shop'], 'Current first-party evidence.'),
      fact('Current NFT participation and liquidity remain unclassified because required measures were not found.', ['about', 'shop', 'launch'], 'Collection market evidence gap.', 'unknown'),
    ]),
    outlook_and_watch: section('Base case: Okay Bears continues as a modest consumer IP brand while the original NFT community remains valuable mainly as provenance and an early audience. Watch current licensing announcements, actual product availability, repeat retail releases, active holder counts, unique marketplace buyers and sellers, executable bids, royalty receipts and any clearly documented holder access. The call improves if brand growth repeatedly includes and retains holders. It weakens if the store and partnerships persist only as stale marketing or if NFT activity concentrates in a few wallets with no new demand.', [
      fact('Current products and licensing history support a continuing consumer-brand base case.', ['img', 'about', 'shop'], 'Independent deal and current brand surfaces.'),
      fact('NFT health should be tested with participation and liquidity rather than brand claims alone.', ['launch', 'about'], 'Metric boundary.', 'inference'),
      fact('Current holder activity, repeat buyers, bids and royalty receipts require verification.', ['about', 'shop'], 'Forward evidence requirements.', 'unknown'),
    ]),
  },
  events: [
    { key: 'launch', type: 'collection_launch', date: '2022-04-27', datePrecision: 'day', description: 'Okay Bears recorded roughly $18 million of secondary trading during its breakout day.', sources: ['launch'], locator: 'Independent contemporary report.' },
    { key: 'img-deal', type: 'licensing_deal', date: '2022-09-20', datePrecision: 'day', description: 'CoinDesk reported that Okay Bears signed IMG for global consumer-product licensing.', sources: ['img'], locator: 'Independent licensing report.' },
    { key: 'brand-current', type: 'current_operations', date: '2026-08-03', datePrecision: 'day', description: 'Okay Bears maintained current brand and product storefront pages.', sources: ['about', 'shop'], locator: 'Directly observed current pages.' },
  ],
  identityBoundary: 'Okay Bears NFTs, the operating brand, retailers, licensees, charity partners and physical products are separate.',
  metricBoundary: 'NFT volume, floors, product sales, licensing revenue, donations and royalties are distinct measures.',
  guardrail: 'Do not use retail partnerships or historical NFT volume as proof of current NFT liquidity or holder cash flow.',
  unknowns: ['current_holders', 'holder_concentration', 'unique_buyers_and_sellers', 'bid_depth', 'royalty_revenue', 'licensing_revenue', 'product_margins', 'holder_benefits'],
  methodologyNotes: ['Brand continuation and collection-market health receive separate lifecycle calls.'],
});

const bitcoinPuppets = 'bitcoin-puppets';
const bitcoinPuppetsProfile = buildProfile({
  slug: bitcoinPuppets,
  name: 'Bitcoin Puppets',
  type: 'ordinals_collection',
  classification: { subtype: 'meme-native profile-picture inscriptions', tags: ['bitcoin', 'ordinals', 'free_mint', 'pseudonymous_artist', 'copyleft', 'no_roadmap'], chains: ['Bitcoin'], jurisdictions: [] },
  sources: [
    source(bitcoinPuppets, 'hub', 'Bitcoin Puppets community hub', 'https://bitcoinpuppets.community/', 'Bitcoin Puppets Community', null, 'B', 'primary', { independence_group: 'bitcoin-puppets-community' }),
    source(bitcoinPuppets, 'gallery', 'Bitcoin Puppets community gallery', 'https://bitcoinpuppets.community/gallery', 'Bitcoin Puppets Community', null, 'B', 'primary', { independence_group: 'bitcoin-puppets-community' }),
    source(bitcoinPuppets, 'nftnow', 'The ultimate guide to Bitcoin Puppets', 'https://nftnow.com/guides/bitcoin-puppets-ordinals-guide/', 'nft now', '2024-04-22', 'B', 'independent', { independence_group: 'nft-now', access_state: 'reachable', access_method: 'indexed_browser_snapshot', direct_http_status: 403 }),
    source(bitcoinPuppets, 'liquidium', 'What are Bitcoin Puppets?', 'https://liquidium.wtf/blog/bitcoin-puppets', 'Liquidium', '2025-07-09', 'C', 'independent', { independence_group: 'liquidium' }),
    source(bitcoinPuppets, 'market', 'Bitcoin Ordinals marketplace', 'https://ord.net/', 'ORD', null, 'C', 'independent', { independence_group: 'ord-net' }),
  ],
  operatingState: 'active_artifact_and_community_without_formal_roadmap',
  statusAssertion: 'Bitcoin Puppets remained indexed as a 10,001-piece collection with a live community hub and observable marketplace listings on August 3, 2026.',
  statusSources: ['hub', 'gallery', 'market'],
  statusLocator: 'Current community and marketplace surfaces.',
  outcome: 'culturally_durable_meme_collection_with_thinly_measured_market',
  outcomeConfidence: 'medium',
  outcomeAssertion: 'Bitcoin Puppets sustained a recognizable community through art and meme identity despite rejecting a conventional roadmap, while current liquidity remains thinly measured.',
  outcomeSources: ['hub', 'nftnow', 'liquidium', 'market'],
  outcomeLocator: 'Community doctrine, independent history and current market observation.',
  sections: {
    what_it_is: section('Bitcoin Puppets is a 10,001-piece collection of hand-drawn profile-picture inscriptions on Bitcoin, created by the pseudonymous artist Le Puppeteer Fou. It was a free mint and explicitly presents itself as art and community rather than a conventional startup with a roadmap or guarantees. The collection is separate from the artist’s earlier O.P.I.U.M. work, later honorary pieces, third-party marketplaces and any adjacent fungible tokens. A marketplace can index a Puppet without becoming its operator.', [
      fact('Bitcoin Puppets comprises 10,001 hand-drawn profile-picture inscriptions on Bitcoin.', ['hub', 'nftnow', 'liquidium'], 'Current community description and independent histories.'),
      fact('The collection was a free mint and rejects a conventional roadmap or guarantees.', ['hub', 'liquidium'], 'Community doctrine and independent 2025 description.'),
      fact('O.P.I.U.M., honorary works, marketplaces and adjacent tokens are separate from the core collection.', ['hub', 'nftnow'], 'Collection history and identity boundary.', 'inference'),
    ]),
    what_happened: section('The collection launched in January 2024 after the artist’s smaller O.P.I.U.M. series and became a high-profile Ordinals meme collection. nft now documented intense attention and a high quoted floor in April 2024, while later reporting described the same anti-roadmap identity in 2025. By August 2026 the community hub and gallery remained available and ORD still displayed collection listings and recent observations. Historical floors are not reused as current value, and live listings are not treated as completed sales.', [
      fact('Bitcoin Puppets launched in January 2024 after the artist’s earlier O.P.I.U.M. collection.', ['nftnow', 'liquidium'], 'Independent collection histories.'),
      fact('The collection attracted substantial market attention during 2024.', ['nftnow'], 'Contemporary report; historical only.'),
      fact('Current community and marketplace surfaces remained observable in August 2026.', ['hub', 'gallery', 'market'], 'Direct current observations.'),
    ]),
    why_this_outcome: section('Bitcoin Puppets succeeded culturally by making the absence of a normal roadmap part of the product. Handmade art, absurd humor, copyleft-style sharing and a simple “community is the project” message gave holders material to remix without waiting for a game or promised yield. Independent histories connect that identity to the artist’s earlier work, so the collection did not appear from nowhere. Current market observations show continued recognition, but not enough evidence to claim deep liquidity or a sustainable business.', [
      fact('The community explicitly centers art, absurdity and participation instead of a roadmap.', ['hub'], 'Current community manifesto and FAQ.'),
      fact('Independent histories connect the collection’s identity to the pseudonymous artist and earlier work.', ['nftnow', 'liquidium'], 'Independent historical accounts.'),
      fact('Cultural recognition can persist without proving deep liquidity or an operating business.', ['hub', 'market', 'nftnow'], 'Community and market synthesis.', 'inference'),
    ]),
    strategic_choices: section('The creator chose a free mint, pseudonymity, minimal formal promises and permissive remix culture. That reduced the need to fund and deliver a complex roadmap while making authenticity and community behavior the primary retention mechanism. The community hub now formalizes the story and curates the artifacts without claiming centralized control over Bitcoin. This choice protects the project from unmet product promises, but it also leaves holders without a conventional team, service-level commitment or accountable commercial plan.', [
      fact('The project chose a free mint and no-roadmap posture.', ['hub', 'liquidium'], 'Community FAQ and independent description.'),
      fact('The collection uses permissive remix language and community curation as distribution.', ['hub', 'gallery'], 'Current license and gallery surfaces.'),
      fact('Minimal promises reduce roadmap risk but leave no conventional service commitment.', ['hub', 'nftnow'], 'Governance and accountability boundary.', 'inference'),
    ]),
    operating_model: section('Bitcoin Puppets operates more like an artist-led cultural network than a company. The artist creates work, volunteers and holders maintain community surfaces, and independent marketplaces facilitate trades. Bitcoin preserves the inscription data, but it does not guarantee discovery, liquidity, moderation or a maintained website. The reviewed sources do not identify a formal entity, payroll, treasury, royalty program or recurring customer product. Marketplace rewards and lending products belong to those third parties, not to the Puppets collection.', [
      fact('The project presents the community, not a conventional company, as the continuing operating layer.', ['hub', 'gallery'], 'Current community surfaces.'),
      fact('Third-party marketplaces and lending products operate separately from the collection.', ['market', 'liquidium'], 'Venue and product boundary.'),
      fact('A formal entity, payroll, treasury and recurring revenue model were not identified.', ['hub', 'nftnow', 'liquidium'], 'Public-source review.', 'unknown'),
    ]),
    token_and_value_capture: section('The Puppets inscriptions are the collection assets. This review found no native collection token or contractually promised revenue share, and the community’s own language says there are no guarantees. Adjacent names such as PUPS or Rune Pups must not be treated as collection cash flow without explicit legal and technical linkage. Holders may capture value through voluntary sales or cultural participation, while marketplaces capture their own fees. Current creator royalties, if any, and realized secondary proceeds were not verified.', [
      fact('The core assets are Bitcoin inscriptions and the community does not promise guaranteed utility.', ['hub', 'nftnow'], 'Community FAQ and independent guide.'),
      fact('Adjacent fungible tokens or collections are not automatically economic claims on Bitcoin Puppets.', ['hub', 'nftnow'], 'Identity boundary.', 'inference'),
      fact('Current creator royalties and realized secondary proceeds were not verified.', ['market', 'hub'], 'Current evidence review.', 'unknown'),
    ]),
    counterfactual: section('A conventional roadmap could have produced more measurable products, but it also would have exposed an anonymous art project to execution promises its audience did not necessarily want. The free mint and anti-roadmap stance let culture compound with little formal obligation. A stronger outcome would preserve that character while publishing verifiable holder distribution, repeated arm’s-length sales and clear stewardship of public surfaces. A weaker outcome would see the meme remain visible while trading concentrates in a few wallets and community infrastructure quietly disappears.', [
      fact('The no-roadmap stance deliberately avoided conventional product commitments.', ['hub', 'liquidium'], 'Project doctrine and independent description.'),
      fact('The community model allowed identity and remixing to remain the primary product.', ['hub', 'gallery', 'nftnow'], 'Community and historical evidence.', 'inference'),
      fact('Broad holder distribution, repeat sales and stewardship continuity remain incompletely measured.', ['gallery', 'market'], 'Current evidence gap.', 'unknown'),
    ]),
    risks_and_unknowns: section('Pseudonymous leadership and volunteer stewardship create key-person and continuity risk even when inscriptions remain on Bitcoin. Marketplaces can delist, disappear or show stale asks; a floor is only the cheapest visible listing, not proof of a buyer. Copyleft-style remixing strengthens distribution but can also blur which products are official. This review could not verify current holder concentration, unique buyers and sellers, executable bids, repeat sales, creator revenue, legal entity, treasury or the artist’s continuing workload.', [
      fact('Pseudonymous, community-led stewardship creates continuity and accountability risk.', ['hub', 'nftnow'], 'Leadership and operating model.'),
      fact('Marketplace listings and quoted floors do not prove executable demand.', ['market'], 'Current venue observation.', 'inference'),
      fact('Holder concentration, repeat sales, revenue, legal entity and treasury were not verified.', ['hub', 'gallery', 'market'], 'Current-source review.', 'unknown'),
    ]),
    lifecycle: section('Bitcoin Puppets moved from a January 2024 free mint into a prominent Ordinals meme and then into a community-maintained cultural collection. Its no-roadmap stance means the correct lifecycle test is not whether a promised game shipped; it is whether the art remains recognized, community surfaces persist and real collectors still trade. As of August 3, 2026 the artifact and community are active and market observations exist, but liquidity quality is not fully classified. The collection is culturally durable, not proven financially thriving.', [
      fact('The collection launched as a free mint in January 2024.', ['hub', 'liquidium'], 'Community and independent history.'),
      fact('Community and gallery surfaces remained active in August 2026.', ['hub', 'gallery'], 'Current direct observations.'),
      fact('Current liquidity quality remains unclassified despite visible listings.', ['market'], 'Market metric boundary.', 'unknown'),
    ]),
    outlook_and_watch: section('Base case: Bitcoin Puppets remains a recognizable Ordinals culture asset whose staying power depends on community creation more than formal utility. Watch active contributors, website stewardship, unique owners, repeated sales across independent venues, executable bids, wallet concentration and whether new works deepen or dilute the core identity. The call improves if broad ownership and repeat collecting persist without incentives. It weakens if market activity becomes wash-like or concentrated, the public hub goes stale or adjacent tokens repeatedly create confusion about holder rights.', [
      fact('Current community surfaces support a culture-led continuing base case.', ['hub', 'gallery'], 'Current community evidence.'),
      fact('Market health should be tested through repeated independent buyers and executable bids.', ['market', 'nftnow'], 'Market-quality rule.', 'inference'),
      fact('Current owner breadth, repeat buyers and bid depth require verification.', ['market', 'gallery'], 'Forward evidence requirements.', 'unknown'),
    ]),
  },
  events: [
    { key: 'launch', type: 'collection_launch', date: '2024-01-01', datePrecision: 'month', description: 'Bitcoin Puppets launched as a free-mint Ordinals collection during January 2024.', sources: ['hub', 'liquidium'], locator: 'Community FAQ and independent history.' },
    { key: 'historical-attention', type: 'market_attention', date: '2024-04-22', datePrecision: 'day', description: 'nft now documented the collection’s rapid rise and historical market attention.', sources: ['nftnow'], locator: 'Dated independent guide; prices treated as historical.' },
    { key: 'current-observation', type: 'current_operations', date: '2026-08-03', datePrecision: 'day', description: 'The community hub, gallery and independent marketplace index remained observable.', sources: ['hub', 'gallery', 'market'], locator: 'Direct current observations.' },
  ],
  identityBoundary: 'Bitcoin Puppets, O.P.I.U.M., honorary artworks, Rune Pups, PUPS, marketplaces, lenders and the pseudonymous artist are separate.',
  metricBoundary: 'Asks, floors, bids, completed sales, holders, lending values and adjacent-token prices are distinct measures.',
  guardrail: 'Do not treat a marketplace floor as liquidity, an adjacent token as holder revenue or a no-roadmap art collection as failed for lacking a game.',
  unknowns: ['holder_concentration', 'unique_buyers_and_sellers', 'bid_depth', 'repeat_sales', 'creator_revenue', 'legal_entity', 'treasury', 'artist_workload'],
  methodologyNotes: ['Lifecycle is evaluated as a finite cultural collection rather than a conventional software startup.'],
});

const gamma = 'gamma-ordinals-platform';
const gammaProfile = buildProfile({
  slug: gamma,
  name: 'Gamma Ordinals',
  type: 'ordinals_collection',
  classification: { subtype: 'Bitcoin inscriptions platform and marketplace', tags: ['bitcoin', 'ordinals', 'marketplace', 'launchpad', 'creator_tools', 'platform_profile'], chains: ['Bitcoin', 'Stacks'], jurisdictions: ['Bahamas'] },
  sources: [
    source(gamma, 'launch', 'Create Ordinal inscriptions on Gamma', 'https://blog.gamma.io/2023/02/08/create-ordinal-inscriptions-on-gamma', 'Gamma', '2023-02-08', 'A', 'primary', { independence_group: 'gamma' }),
    source(gamma, 'marketplaces', 'Ordinals marketplaces', 'https://stacks.gamma.io/learn/ordinals/marketplaces', 'Gamma', null, 'A', 'primary', { independence_group: 'gamma' }),
    source(gamma, 'launchpad', 'No-code Ordinals launchpad', 'https://stacks.gamma.io/learn/ordinals/inscriptions/no-code-ordinals-launchpad', 'Gamma', null, 'A', 'primary', { independence_group: 'gamma' }),
    source(gamma, 'platform', 'Gamma Ordinals marketplace and creator launchpad', 'https://ordinals.gamma.io/', 'Gamma', null, 'A', 'primary', { independence_group: 'gamma' }),
    source(gamma, 'terms', 'Gamma creator terms', 'https://ordinals.gamma.io/terms/creators', 'Nassau Machines Inc.', '2026-04-08', 'A', 'primary', { independence_group: 'nassau-machines' }),
    source(gamma, 'binance', 'A new era for Bitcoin?', 'https://research.binance.com/static/pdf/a-new-era-for-bitcoin.pdf', 'Binance Research', null, 'B', 'independent', { independence_group: 'binance-research' }),
  ],
  operatingState: 'active_creator_platform_and_marketplace',
  statusAssertion: 'Gamma maintained an accessible Ordinals marketplace, creator launchpad and creator terms updated in April 2026 as of August 3, 2026.',
  statusSources: ['platform', 'terms'],
  statusLocator: 'Current product surface and dated legal terms.',
  outcome: 'active_early_mover_platform_with_unverified_current_unit_economics',
  outcomeConfidence: 'medium',
  outcomeAssertion: 'Gamma remains an operating Bitcoin inscriptions platform, but current market share, retained creators, trading depth and profitability are not verified.',
  outcomeSources: ['launch', 'platform', 'terms', 'binance'],
  outcomeLocator: 'Launch history, current product and legal surfaces, and independent ecosystem timeline.',
  sections: {
    what_it_is: section('Gamma Ordinals is a creator platform and marketplace for making, launching, discovering and trading Bitcoin inscriptions. It is stored in Chaindump’s Ordinals corpus for comparison, but it is not itself one collection: creators and their collections are customers or listings, and their performance should not be rolled into Gamma without attribution. Gamma also has Stacks history, while its Ordinals marketplace describes native Bitcoin L1 trading. The current creator terms identify Nassau Machines Inc. as the contracting operator.', [
      fact('Gamma provides inscription, collection-launch and marketplace tools for Bitcoin Ordinals.', ['launch', 'launchpad', 'platform'], 'Product documentation and current interface.'),
      fact('Gamma the platform is analytically separate from the collections and creators using it.', ['launchpad', 'terms'], 'Creator terms and platform boundary.', 'inference'),
      fact('The reviewed creator terms identify Nassau Machines Inc. as the contracting operator.', ['terms'], 'Updated creator terms.'),
    ]),
    what_happened: section('Gamma added no-code inscription tooling in February 2023 and released an Ordinals marketplace in March as the new protocol drew rapid attention. Binance Research independently included Gamma’s marketplace release in its early Ordinals timeline. The platform expanded from single and bulk inscriptions into collection mints, launchpad services and native-Bitcoin trading. In 2026 its product and legal pages remained accessible, but this review found no verified current share, creator cohort, trading volume or audited revenue series.', [
      fact('Gamma introduced no-code Ordinals inscription tooling in February 2023.', ['launch'], 'Dated operator launch article.'),
      fact('Gamma released its Ordinals marketplace in March 2023 during the protocol’s early expansion.', ['marketplaces', 'binance'], 'Operator timeline corroborated by independent research.'),
      fact('Current product and legal surfaces persisted in 2026, while current market and revenue series were not published.', ['platform', 'terms'], 'Current direct observations.', 'unknown'),
    ]),
    why_this_outcome: section('Gamma moved quickly when Ordinals created a technically difficult new market. Its no-code workflow lowered the barrier for creators, while collection minting and a native-Bitcoin marketplace let the same user move from creation to sale without assembling several tools. Independent research confirms Gamma was part of the first marketplace wave. That speed and integrated funnel explain persistence, but early entry does not prove current leadership: competitor growth, Bitcoin market cycles and creator retention can change platform economics.', [
      fact('No-code inscription and collection tools reduced technical friction for creators.', ['launch', 'launchpad'], 'Creator workflow documentation.'),
      fact('Gamma paired creator tooling with a native-Bitcoin marketplace early in the Ordinals market.', ['marketplaces', 'binance'], 'Operator description and independent timeline.'),
      fact('Integrated early entry explains persistence but does not establish current market leadership.', ['platform', 'terms', 'binance'], 'Current and independent evidence synthesis.', 'inference'),
    ]),
    strategic_choices: section('Gamma chose an integrated platform: individual and bulk inscriptions, no-code public mints, collection pages and marketplace trading. It also separated its Ordinals experience from its earlier Stacks marketplace while emphasizing Bitcoin L1 settlement for inscription trades. The creator terms formalize operator control over onboarding and platform rules, even though the underlying inscriptions exist on Bitcoin. This product breadth improves conversion and creator convenience, but it increases the burden to maintain security, moderation, wallets, listings and legal compliance.', [
      fact('Gamma bundled inscription, minting, collection and marketplace functions.', ['launch', 'launchpad', 'marketplaces'], 'Product documentation.'),
      fact('The Ordinals marketplace describes trading native inscriptions on Bitcoin L1 rather than wrapped assets.', ['marketplaces'], 'Marketplace architecture description.'),
      fact('The operator retains platform and onboarding responsibilities distinct from Bitcoin’s persistence layer.', ['terms', 'platform'], 'Legal terms and product boundary.', 'inference'),
    ]),
    operating_model: section('Creators use Gamma to inscribe assets, organize collections and run public mints; collectors use the marketplace to discover and trade inscriptions through compatible wallets. Gamma can earn from platform or transaction charges described in applicable interfaces and agreements, while miners earn Bitcoin network fees and creators may set their own sale economics. Those flows must remain separate. Current active creators, repeat minters, unique buyers and sellers, gross merchandise volume, take rate, refunds and operating costs were not verified in reviewed public sources.', [
      fact('Gamma serves both creators launching inscriptions and collectors trading them.', ['launchpad', 'marketplaces', 'platform'], 'Documented product flows.'),
      fact('Bitcoin network fees, creator proceeds and Gamma platform economics are separate flows.', ['launch', 'terms'], 'Transaction and legal boundary.', 'inference'),
      fact('Current cohorts, trading volume, take rate, refunds and operating costs were not verified.', ['platform', 'terms'], 'Current public-source review.', 'unknown'),
    ]),
    token_and_value_capture: section('This review found no native Gamma fungible token that represents ownership of the platform. Gamma’s economic opportunity is service and marketplace revenue, while creators receive their own mint proceeds and any creator payments supported by a sale. An inscription bought on Gamma remains the creator’s asset, not equity in Nassau Machines, and third-party collection tokens are not Gamma liabilities. The reviewed terms and product pages did not provide enough current data to calculate realized take rate, annual revenue or profit.', [
      fact('The reviewed Gamma sources do not describe a native fungible ownership token.', ['platform', 'terms', 'marketplaces'], 'Current product and legal review.', 'unknown'),
      fact('Platform fees, creator proceeds and third-party collection tokens are separate economic objects.', ['terms', 'launchpad'], 'Creator agreement and product flow.', 'inference'),
      fact('Current realized take rate, annual revenue and profit were not published in the reviewed sources.', ['platform', 'terms'], 'Financial evidence gap.', 'unknown'),
    ]),
    counterfactual: section('Gamma could have remained a Stacks-focused NFT venue and missed the native-Bitcoin inscription wave. Moving early into Ordinals gave it creator distribution and a place in the ecosystem’s foundational timeline. A stronger outcome would now show retained creator cohorts, repeat marketplace users, reliable settlement and transparent fee economics rather than relying on first-mover history. A weaker outcome would keep old product pages online while new launches, trades and wallet support migrate elsewhere. Current public evidence is not sufficient to choose between those commercial extremes.', [
      fact('Gamma expanded from Stacks NFT infrastructure into native-Bitcoin Ordinals tools.', ['launch', 'marketplaces', 'binance'], 'Product and independent ecosystem timeline.'),
      fact('Early entry created distribution but does not guarantee retained market share.', ['binance', 'platform'], 'First-mover versus current-state boundary.', 'inference'),
      fact('Retained creators, repeat users and transparent fee economics remain unverified.', ['platform', 'terms'], 'Current evidence gap.', 'unknown'),
    ]),
    risks_and_unknowns: section('Gamma faces marketplace security, wallet integration, listing quality, regulatory and competitive risks. Bitcoin preserves inscriptions, but users still depend on Gamma’s interface, indexing and transaction construction; an onchain asset does not make every web workflow trustless. Creator terms can change and users may confuse creator claims with operator guarantees. This review could not verify custody design across every flow, incident history, current market share, wash-trading controls, retained cohorts, revenue, profitability or the operator’s financial runway.', [
      fact('Users depend on Gamma’s interface, indexing and transaction workflow even when inscriptions live on Bitcoin.', ['marketplaces', 'platform', 'terms'], 'Service-versus-settlement boundary.', 'inference'),
      fact('Creator statements and collection performance are not guarantees by the platform operator.', ['terms', 'launchpad'], 'Creator terms and identity boundary.'),
      fact('Security history, market share, wash controls, retained cohorts and finances were not verified.', ['platform', 'terms'], 'Current evidence review.', 'unknown'),
    ]),
    lifecycle: section('Gamma moved from Stacks NFT infrastructure into an early Ordinals inscription service in February 2023, then added a marketplace and broader creator launch tools. Product and legal surfaces remained current enough in 2026 to classify the platform as operating. The right lifecycle call is “active early mover with unverified economics,” not “thriving” based on a 2023 market-share claim or the activity of collections listed there. Each hosted collection needs its own lifecycle profile, and Bitcoin network growth is only context for Gamma demand.', [
      fact('Gamma entered Ordinals tooling in February 2023 and marketplace trading in March 2023.', ['launch', 'marketplaces', 'binance'], 'Dated platform and independent timeline.'),
      fact('Current product and updated legal surfaces support an active operating-state classification.', ['platform', 'terms'], 'Current direct observations.'),
      fact('Current financial and cohort strength remain unclassified.', ['platform', 'terms'], 'Missing operating measures.', 'unknown'),
    ]),
    outlook_and_watch: section('Base case: Gamma remains a functioning Ordinals creator and marketplace platform, competing on ease of use and its early brand. Watch new public mints, active creators, repeat minters, unique buyers and sellers, completed trade volume, failed transactions, wallet support, security incidents, fee changes and legal updates. The call improves if independent data show retained creators and repeated arm’s-length trades. It weakens if product surfaces stay online but cohorts shrink, major wallets or creators leave, or incident and compliance costs overwhelm marketplace revenue.', [
      fact('Current product breadth supports a continuing creator-platform base case.', ['launchpad', 'platform', 'terms'], 'Current product and legal surfaces.'),
      fact('Independent cohort and completed-trade data are needed to test platform strength.', ['marketplaces', 'binance'], 'Evidence standard.', 'inference'),
      fact('Current active creators, repeat users, completed volume and incident rates require verification.', ['platform', 'terms'], 'Forward evidence requirements.', 'unknown'),
    ]),
  },
  events: [
    { key: 'inscriptions-launch', type: 'product_launch', date: '2023-02-08', datePrecision: 'day', description: 'Gamma launched no-code tooling for individual and bulk Ordinals inscriptions.', sources: ['launch'], locator: 'Dated operator launch article.' },
    { key: 'marketplace-launch', type: 'marketplace_launch', date: '2023-03-01', datePrecision: 'month', description: 'Gamma released its native-Bitcoin Ordinals marketplace during March 2023.', sources: ['marketplaces', 'binance'], locator: 'Operator history corroborated by independent research.' },
    { key: 'terms-update', type: 'legal_update', date: '2026-04-08', datePrecision: 'day', description: 'Nassau Machines Inc. updated Gamma’s creator terms.', sources: ['terms'], locator: 'Dated legal terms.' },
  ],
  identityBoundary: 'Gamma the platform, Nassau Machines Inc., Stacks products, Bitcoin, creators, hosted collections, wallets and external marketplaces are separate.',
  metricBoundary: 'Network inscriptions, platform users, mints, asks, completed trades, creator proceeds, miner fees and Gamma revenue are distinct measures.',
  guardrail: 'Do not classify Gamma from a hosted collection’s success, Bitcoin-wide activity or a historical market-share claim.',
  unknowns: ['active_creators', 'repeat_minters', 'unique_buyers_and_sellers', 'completed_volume', 'take_rate', 'revenue', 'profitability', 'runway', 'security_incidents', 'wash_controls'],
  methodologyNotes: ['Gamma remains typed as ordinals_collection for schema compatibility, but the profile explicitly evaluates it as a platform.'],
});

export const document = {
  schema: 'chaindump-nft-ordinals-depth-wave-d-v1',
  version: 1,
  research_as_of: AS_OF,
  generated_at: ACCESSED_AT,
  generated_migration: '0103_nft_ordinals_depth_wave_d.sql',
  selection_method: 'Five existing shallow NFT and Ordinals rows selected for normalized platform, operator-linked brand, consumer-IP and culture-led lifecycle coverage.',
  entities: [
    { slug: artBlocks, legacy_status: 'thriving', canonical_profile: artBlocksProfile },
    { slug: madLads, legacy_status: 'thriving', canonical_profile: madLadsProfile },
    { slug: okayBears, legacy_status: 'middling', canonical_profile: okayBearsProfile },
    { slug: bitcoinPuppets, legacy_status: 'middling', canonical_profile: bitcoinPuppetsProfile },
    { slug: gamma, legacy_status: 'thriving', canonical_profile: gammaProfile },
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
  return `-- Five current, source-linked NFT and Ordinals Wave D profiles researched ${AS_OF} and awaiting human review.
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

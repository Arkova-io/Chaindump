#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import {
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';
import { validateForensicFreshness } from '../src/lib/evidence-freshness.mjs';
import { validateFieldCitedNft } from '../src/lib/nft-citation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const documentPath = resolve(root, 'docs/nft-forensic-wave-a-2026-07-29.json');
const migrationPath = resolve(root, 'migrations/0057_nft_forensic_wave_a.sql');
const checkedAt = '2026-07-29';

function analysis({
  label,
  asOf,
  outcome,
  outcomeConfidence = 'high',
  outcomeSources,
  why,
  whyConfidence = 'medium',
  whySources,
  choices,
  counterfactual,
  counterfactualSources,
  watch,
  unknowns,
  nextReview,
}) {
  return {
    version: 'forensic-analysis-v1',
    outcome: {
      label,
      summary: outcome,
      confidence: outcomeConfidence,
      as_of: asOf,
      source_refs: outcomeSources,
    },
    why: {
      summary: why,
      confidence: whyConfidence,
      source_refs: whySources,
    },
    strategic_choices: choices.map((choice) => ({
      confidence: choice.confidence ?? 'medium',
      ...choice,
    })),
    counterfactual: {
      summary: counterfactual,
      confidence: 'medium',
      source_refs: counterfactualSources,
    },
    watch,
    unknowns,
    review: {
      status: 'current',
      last_reviewed_at: checkedAt,
      next_review_at: nextReview,
      reviewer: 'chaindump-research-desk',
    },
  };
}

const analyses = {
  'art-blocks-generative-art': analysis({
    label: 'thriving',
    asOf: '2026-06-09',
    outcome: 'Art Blocks is classified as thriving only as an operating generative-art platform: current Studio tooling and a June 2026 exhibition publication show continued creator and cultural activity. The label does not claim strong collection prices, platform profitability, artist income, liquidity, or holder returns.',
    outcomeSources: ['art-blocks-studio', 'art-blocks-william-mapan'],
    why: 'The platform made deterministic onchain generation its trust mechanism, then paired that technical identity with release tooling and continuing editorial or exhibition activity. Observed evidence supports product continuity and a differentiated permanence proposition; the inference is that those choices help Art Blocks remain culturally relevant, while the reviewed sources do not measure their effect on demand or revenue. No native token is evidenced, so value capture depends on releases, creator infrastructure, and royalty plumbing rather than token-holder rights.',
    whySources: ['art-blocks-onchain-generator', 'art-blocks-studio', 'art-blocks-royalties', 'art-blocks-william-mapan'],
    choices: [
      {
        decision: 'Make compatible works reconstructible from contract data through an onchain generator.',
        consequence: 'This reduced dependence on a single hosted image store and made technical permanence part of the platform brand, although some documented projects still retain distributed-CDN dependencies.',
        confidence: 'high',
        source_refs: ['art-blocks-onchain-generator'],
      },
      {
        decision: 'Productize artist releases through Studio, V3 Engine deployment, testnet QA, rendering integration, and a minter suite.',
        consequence: 'Art Blocks expanded from a cultural label into reusable creator infrastructure; current adoption, conversion, and unit economics remain undisclosed.',
        confidence: 'high',
        source_refs: ['art-blocks-studio'],
      },
      {
        decision: 'Provide ERC-2981 royalty plumbing through 0xSplits rather than issue a platform token.',
        consequence: 'The documented value-capture path stays tied to artwork and creator payment flows, not governance-token or revenue-share claims; actual royalty enforcement and receipts are not established.',
        confidence: 'high',
        source_refs: ['art-blocks-royalties'],
      },
      {
        decision: 'Continue exhibitions and artist publications alongside protocol tooling.',
        consequence: 'Institutional and editorial programming can reinforce cultural distribution beyond marketplace trading, but the causal effect on prices or artist careers is unmeasured.',
        source_refs: ['art-blocks-art-basel', 'art-blocks-william-mapan'],
      },
    ],
    counterfactual: 'A marketplace-only or offchain-media strategy could have reduced engineering constraints and widened eligible art formats, but it would have weakened the permanence claim that differentiates Art Blocks. A token-led incentive strategy might have accelerated participation while introducing an additional speculative layer without proving durable collector demand.',
    counterfactualSources: ['art-blocks-onchain-generator', 'art-blocks-studio', 'art-blocks-royalties'],
    watch: [
      {
        signal: 'Continued Studio releases and changes to the V3 creator workflow.',
        implication: 'Sustained shipping would support the operating-platform thesis; a dormant dashboard or release pipeline would weaken it.',
        source_refs: ['art-blocks-studio'],
      },
      {
        signal: 'New exhibition, artist, or institutional programming.',
        implication: 'Repeated programming would show cultural distribution continuing independently of token-market conditions.',
        source_refs: ['art-blocks-art-basel', 'art-blocks-william-mapan'],
      },
      {
        signal: 'Changes in renderer dependencies and royalty plumbing.',
        implication: 'More self-contained rendering would strengthen permanence; declining support or unenforced royalties would weaken creator-value-capture claims.',
        source_refs: ['art-blocks-onchain-generator', 'art-blocks-royalties'],
      },
    ],
    unknowns: [
      'What share of Studio projects and flagship outputs remains fully reconstructible without hosted dependencies?',
      'What are current release volume, collector conversion, secondary liquidity, and unique-holder retention?',
      'What revenue, costs, and royalty receipts accrue to Art Blocks and participating artists?',
      'How much exhibition activity produces measurable collector or institutional demand?',
    ],
    nextReview: '2026-10-07',
  }),
  autoglyphs: analysis({
    label: 'thriving',
    asOf: '2026-07-28',
    outcome: 'Autoglyphs is thriving as a technically and culturally maintained fixed artwork: all 512 outputs remain immutable, official ownership and rendering tools are live, and current stewardship preserves the collection. This is not a conclusion about floor price, liquidity, recent sales, owner retention, or creator revenue.',
    outcomeSources: ['autoglyph-origin', 'autoglyph-current', 'autoglyph-owners'],
    why: 'Autoglyphs concentrated its proposition into a scarce, self-contained onchain artifact rather than an expanding roadmap. Stopping the generator after 512 outputs, donating creation fees, and maintaining owner rendering tools produced a legible permanence-and-provenance story. The observed facts establish technical finality and ongoing stewardship; the inference is that this clarity supports cultural endurance, while no reviewed source attributes current market demand to those choices.',
    whySources: ['autoglyph-origin', 'autoglyph-report', 'autoglyph-current', 'autoglyph-owners'],
    choices: [
      {
        decision: 'Permanently stop generation after 512 Autoglyphs.',
        consequence: 'The collection gained verifiable supply finality and scarcity, while giving up future primary issuance as a recurring creator revenue path.',
        confidence: 'high',
        source_refs: ['autoglyph-origin', 'autoglyph-report'],
      },
      {
        decision: 'Encode the generative system and output instructions on Ethereum.',
        consequence: 'Owners can reconstruct the work from contract state without relying on a conventional image host, making Ethereum execution and archival access central to the artwork.',
        confidence: 'high',
        source_refs: ['autoglyph-origin', 'autoglyph-current'],
      },
      {
        decision: 'Donate the stated creation fees to 350.org rather than retain them as creator proceeds.',
        consequence: 'The launch emphasized experiment and public-benefit signaling over primary-sale extraction; it does not establish later financial sustainability.',
        confidence: 'high',
        source_refs: ['autoglyph-report'],
      },
      {
        decision: 'Maintain official ownership and plotter-oriented rendering utilities after mint completion.',
        consequence: 'Stewardship preserves usability and provenance without changing the immutable generator or promising a product roadmap.',
        confidence: 'high',
        source_refs: ['autoglyph-current', 'autoglyph-owners'],
      },
    ],
    counterfactual: 'Continuing issuance or hosting richer offchain media could have created more inventory and monetization opportunities, but would have weakened fixed-supply finality and fully onchain self-containment. Ending all official interfaces would not erase the tokens, yet would make ownership verification and physical rendering less accessible.',
    counterfactualSources: ['autoglyph-origin', 'autoglyph-report', 'autoglyph-owners'],
    watch: [
      {
        signal: 'Availability and maintenance of the official owner and rendering interfaces.',
        implication: 'Continued access supports practical stewardship; disappearance would increase reliance on third-party tools even though the generator remains onchain.',
        source_refs: ['autoglyph-current', 'autoglyph-owners'],
      },
      {
        signal: 'Independent institutional exhibitions and conservation work.',
        implication: 'Continued institutional treatment would support cultural endurance without implying market performance.',
        source_refs: ['autoglyph-current'],
      },
      {
        signal: 'Ethereum archival and execution compatibility for the original contract.',
        implication: 'Reliable reconstruction supports the permanence thesis; tooling breakage would expose access risk despite immutable code.',
        source_refs: ['autoglyph-origin'],
      },
    ],
    unknowns: [
      'What are current unique-holder concentration, realized liquidity, and sale frequency?',
      'How often are owner rendering and plotter tools used?',
      'What current stewardship costs or revenues exist after creation fees were donated?',
      'How much institutional presentation affects collector demand or long-term conservation?',
    ],
    nextReview: '2026-10-29',
  }),
  'axie-origin-axies': analysis({
    label: 'thriving',
    asOf: '2026-07-08',
    outcome: 'Origin Axies are thriving within the narrow capped 4,088-asset cohort because Axie Infinity continued live competitive seasons and published collectible-holder rewards in July 2026. This does not establish Origin floor strength, reward profitability, total Axie demand, active-owner retention, or Sky Mavis financial health.',
    outcomeSources: ['axie-origin-market', 'axie-current'],
    why: 'The cohort combines provable early provenance with continuing game-linked recognition rather than depending only on static collectible status. A capped Origin identity creates differentiation, while current seasons and holder reward mechanics keep that identity connected to an operating product. These observed mechanisms support continuity; it remains an inference that rewards cause durable demand because player, holder, and reward-realization data are not disclosed here.',
    whySources: ['axie-roadmap', 'axie-origin-market', 'axie-current'],
    choices: [
      {
        decision: 'Cap the Origin cohort at 4,088 while allowing the broader Axie economy to expand through other assets.',
        consequence: 'Early provenance stays scarce within a much larger game ecosystem, but the cohort value depends on users continuing to distinguish Origin status.',
        confidence: 'high',
        source_refs: ['axie-origin-market'],
      },
      {
        decision: 'Tie collectible holding to season-specific chests and bAXS-backed reward eligibility.',
        consequence: 'The collection receives current product utility, while benefit quality remains contingent on published conditions, token mechanics, and game participation.',
        confidence: 'high',
        source_refs: ['axie-current'],
      },
      {
        decision: 'Continue shipping competitive seasons and integrity rules instead of treating Origins as a completed legacy collection.',
        consequence: 'Ongoing gameplay creates repeated engagement opportunities; the reviewed release does not prove retention or sustainable reward economics.',
        confidence: 'high',
        source_refs: ['axie-current'],
      },
      {
        decision: 'Anchor collection access and trading in the Sky Mavis and Ronin product stack.',
        consequence: 'Integrated marketplace and game distribution reduce user fragmentation but increase dependence on one operator ecosystem and its chain infrastructure.',
        source_refs: ['axie-origin-market', 'axie-roadmap'],
      },
    ],
    counterfactual: 'Treating Origin Axies as purely commemorative assets would reduce operating complexity but remove the live utility that distinguishes them from inactive legacy collections. Permanent high rewards could strengthen short-term attention while increasing subsidy and token-pressure risk; the reviewed evidence does not quantify either path.',
    counterfactualSources: ['axie-origin-market', 'axie-current'],
    watch: [
      {
        signal: 'Future seasons that retain or remove explicit Origin-holder benefits.',
        implication: 'Repeated benefits would support product integration; removal would shift the cohort toward provenance-only value.',
        source_refs: ['axie-current'],
      },
      {
        signal: 'Origin participation, unique holders, and reward-claim behavior.',
        implication: 'Observed use would test whether the current benefit design creates engagement rather than nominal eligibility.',
        source_refs: ['axie-current', 'axie-origin-market'],
      },
      {
        signal: 'Ronin marketplace and game infrastructure changes.',
        implication: 'Availability or migration changes would materially affect access, trading, and the collection-chain dependence thesis.',
        source_refs: ['axie-origin-market', 'axie-roadmap'],
      },
    ],
    unknowns: [
      'How many Origin Axies and unique Origin holders participate in each current season?',
      'What rewards are actually claimed and what is their realized economic value?',
      'What are current Origin liquidity, holder concentration, and retention?',
      'How dependent are Origin benefits on continuing Sky Mavis subsidies or bAXS issuance?',
    ],
    nextReview: '2026-10-06',
  }),
  'bitcoin-frogs': analysis({
    label: 'unclassified',
    asOf: '2023-03-08',
    outcome: 'Bitcoin Frogs remains unclassified: the first-party source proves a free 10,000-inscription launch and durable Bitcoin retrieval, but it does not provide dated current-state evidence for an operating team, product, market, or community. Artifact persistence is therefore not mislabeled as lifecycle success.',
    outcomeSources: ['bitcoin-frogs-site'],
    why: 'The collection chose a simple fixed-supply, free-launch, Bitcoin-native artwork proposition with no documented contractual utility or revenue claim. That design supports provenance and independent retrieval, but those observed properties cannot answer whether the social and market layer is alive. The causal conclusion is deliberately withheld because one undated first-party surface cannot separate durable artifact availability from active ecosystem operation.',
    whyConfidence: 'high',
    whySources: ['bitcoin-frogs-site'],
    choices: [
      {
        decision: 'Launch 10,000 inscriptions for free and state that no more would be created.',
        consequence: 'The project established a fixed provenance boundary without a documented primary-sale raise; current distribution and concentration remain unknown.',
        confidence: 'high',
        source_refs: ['bitcoin-frogs-site'],
      },
      {
        decision: 'Place artwork retrieval in Bitcoin transaction witness data.',
        consequence: 'The artifact can persist independently of a conventional image host, while discovery and trading still depend on wallets, indexers, and social coordination.',
        confidence: 'high',
        source_refs: ['bitcoin-frogs-site'],
      },
      {
        decision: 'Avoid promising a game, token, revenue share, or operating roadmap in the reviewed source.',
        consequence: 'The collection has fewer unfulfilled utility promises, but it also supplies no current product signal with which to classify lifecycle health.',
        confidence: 'high',
        source_refs: ['bitcoin-frogs-site'],
      },
    ],
    counterfactual: 'A dated operating update, independently observable community product, or first-party roadmap could support a current lifecycle classification. Adding token incentives alone would not prove durable demand and could introduce speculation without resolving team, usage, or liquidity unknowns.',
    counterfactualSources: ['bitcoin-frogs-site'],
    watch: [
      {
        signal: 'A dated first-party update identifying current maintainers and delivered work.',
        implication: 'Verified continued operation could move the case out of unclassified status.',
        source_refs: ['bitcoin-frogs-site'],
      },
      {
        signal: 'Reproducible holder, sales, and liquidity observations from Bitcoin marketplaces.',
        implication: 'Consistent evidence would distinguish collectible activity from mere inscription persistence.',
        source_refs: ['bitcoin-frogs-site'],
      },
      {
        signal: 'Continued independent retrieval and indexer support.',
        implication: 'Reliable access supports artifact durability but would still not, by itself, establish a thriving community.',
        source_refs: ['bitcoin-frogs-site'],
      },
    ],
    unknowns: [
      'Who currently maintains the project and what has been delivered since launch?',
      'How many unique holders remain and how concentrated is ownership?',
      'What are current sale frequency, bid depth, and marketplace liquidity?',
      'Does the collection have any current product, treasury, token, licensing, or holder program?',
    ],
    nextReview: '2026-08-29',
  }),
  bitmap: analysis({
    label: 'middling',
    asOf: '2026-07-28',
    outcome: 'Bitmap is middling as a living Bitcoin metaverse convention: current documentation specifies district and parcel rules and remains maintained, but the reviewed evidence does not establish broad application use, consistent indexer agreement, market health, protocol revenue, or holder retention.',
    outcomeSources: ['bitmap-current', 'bitmap-whitepaper', 'bitmap-method'],
    why: 'Bitmap maps Bitcoin block history into an open land convention, giving builders permissionless inventory and a shared narrative without a centralized issuer. The same openness makes coordination the core weakness: recognition depends on indexers, marketplaces, and applications converging on rules that are not Bitcoin consensus. Observed documentation supports an active standard; the middling causal assessment reflects unproven downstream adoption and fragmented enforcement, not a claim that the inscriptions are invalid.',
    whySources: ['bitmap-abstract', 'bitmap-intro', 'bitmap-method', 'bitmap-theory'],
    choices: [
      {
        decision: 'Define each Bitcoin block as a claimable district rather than sell a centrally created fixed collection.',
        consequence: 'Inventory expands with Bitcoin and avoids a central primary sale, but scarcity and comparability differ from fixed-supply NFT collections.',
        confidence: 'high',
        source_refs: ['bitmap-abstract', 'bitmap-theory'],
      },
      {
        decision: 'Publish Bitmap as an open standard interpreted by indexers and builders.',
        consequence: 'Third parties can innovate without permission, while inconsistent implementation can fragment ownership recognition and user experience.',
        confidence: 'high',
        source_refs: ['bitmap-method', 'bitmap-whitepaper'],
      },
      {
        decision: 'Support districts, parcels, and child inscriptions as composable building primitives.',
        consequence: 'The model enables richer applications but adds technical and social coordination layers beyond simple inscription ownership.',
        confidence: 'high',
        source_refs: ['bitmap-method', 'bitmap-theory'],
      },
      {
        decision: 'Rely on Bitcoin for inscription provenance without issuing a native protocol token or documented revenue claim.',
        consequence: 'The standard avoids a separate token dependency; value capture shifts to scarce claims and third-party products rather than protocol cash flow.',
        source_refs: ['bitmap-current', 'bitmap-theory'],
      },
    ],
    counterfactual: 'A canonical governance and compatibility process could reduce indexer fragmentation and make application behavior easier to predict, but it would introduce coordination authority into an intentionally open convention. A centralized fixed land sale might simplify scarcity and funding while weakening the permissionless link to Bitcoin block history.',
    counterfactualSources: ['bitmap-whitepaper', 'bitmap-method', 'bitmap-theory'],
    watch: [
      {
        signal: 'Compatibility across major Bitmap indexers and marketplaces.',
        implication: 'Convergent ownership and parcel interpretation would strengthen the standard; divergent results would deepen coordination risk.',
        source_refs: ['bitmap-method', 'bitmap-theory'],
      },
      {
        signal: 'Shipped applications that use districts or parcels beyond trading.',
        implication: 'Repeat usage would support the metaverse utility thesis; prototypes without users would not.',
        source_refs: ['bitmap-abstract', 'bitmap-method'],
      },
      {
        signal: 'Changes to the living whitepaper and dispute-resolution norms.',
        implication: 'Stable, transparent evolution could improve trust, while incompatible revisions could strand prior assumptions.',
        source_refs: ['bitmap-current', 'bitmap-whitepaper'],
      },
    ],
    unknowns: [
      'How consistently do current indexers recognize districts, parcels, and parent-child relationships?',
      'How many applications have recurring users rather than speculative inventory listings?',
      'What are deduplicated holder concentration, sale frequency, and liquidity?',
      'Who funds ongoing specification work and whether any sustainable protocol-level business exists?',
    ],
    nextReview: '2026-10-29',
  }),
  'bored-ape-yacht-club': analysis({
    label: 'thriving',
    asOf: '2026-07-27',
    outcome: 'Bored Ape Yacht Club is thriving as a currently operated membership and IP brand: a 2026 ApeFest surface and continuing activation archive show recurring holder programming. The scope excludes floor performance, holder returns, ApeCoin or ApeChain performance, event profitability, and consolidated Yuga Labs finances.',
    outcomeSources: ['bayc-apefest-2026', 'bayc-activations'],
    why: 'BAYC turned a fixed avatar collection into a social membership identity, then repeatedly refreshed that identity through holder IP, events, merchandise, and a broader Yuga product network. The observed evidence proves current activation rather than only token persistence. The inference is that repeated offline and online coordination reinforces community distribution; the reviewed sources do not isolate how much each program contributes to retention, revenue, or price.',
    whySources: ['bayc-origin', 'bayc-yuga-about', 'bayc-apefest-2025', 'bayc-apefest-2026', 'bayc-activations'],
    choices: [
      {
        decision: 'Launch a fixed 10,000-avatar membership collection at one public price.',
        consequence: 'A legible cohort and shared visual identity made community coordination easier, while concentrating access in a scarce asset whose market price can exclude later users.',
        confidence: 'high',
        source_refs: ['bayc-origin'],
      },
      {
        decision: 'Give holders commercial-use opportunities and treat the NFT as a club membership layer.',
        consequence: 'Community members can extend the brand and identity, but rights and benefits remain program-specific rather than equity or guaranteed cash flow.',
        confidence: 'high',
        source_refs: ['bayc-origin', 'bayc-yuga-about'],
      },
      {
        decision: 'Invest in recurring ApeFest events and activation programming.',
        consequence: 'Physical gatherings create repeated social utility beyond marketplace trading; attendance, cost, and retention impact are not disclosed.',
        confidence: 'high',
        source_refs: ['bayc-apefest-2025', 'bayc-apefest-2026', 'bayc-activations'],
      },
      {
        decision: 'Expand BAYC into a broader Yuga ecosystem while keeping token and corporate economics distinct.',
        consequence: 'Cross-product distribution can deepen the franchise, but complexity makes it difficult to attribute value or risk specifically to BAYC holders.',
        source_refs: ['bayc-yuga-about', 'bayc-activations'],
      },
    ],
    counterfactual: 'Keeping BAYC as static profile-picture art would have reduced execution cost and ecosystem complexity, but also removed the recurring membership experiences that distinguish an active club from an inert collection. A single tightly controlled brand could preserve consistency while sacrificing holder-led distribution and experimentation.',
    counterfactualSources: ['bayc-origin', 'bayc-yuga-about', 'bayc-activations'],
    watch: [
      {
        signal: 'Delivery, attendance, and recurrence of ApeFest and other holder activations.',
        implication: 'Sustained programs support operating continuity; cancellations or shrinking scope would weaken the membership thesis.',
        source_refs: ['bayc-apefest-2026', 'bayc-activations'],
      },
      {
        signal: 'Changes to holder IP rights and collection-specific benefits.',
        implication: 'Broader usable rights could strengthen distribution, while restrictions or benefit withdrawal could reduce member utility.',
        source_refs: ['bayc-origin', 'bayc-yuga-about'],
      },
      {
        signal: 'Separation or consolidation among BAYC, ApeCoin, ApeChain, and other Yuga products.',
        implication: 'Clearer boundaries improve attribution; forced coupling could add token and execution risk to the collection.',
        source_refs: ['bayc-yuga-about'],
      },
    ],
    unknowns: [
      'What are current unique-holder retention, concentration, and active membership rates?',
      'What do ApeFest and other activations cost and how do they affect revenue or retention?',
      'How much value is created by holder commercial use versus Yuga-operated products?',
      'What collection-specific royalty, merchandise, licensing, and operating economics exist?',
    ],
    nextReview: '2026-10-29',
  }),
  'cool-cats': analysis({
    label: 'thriving',
    asOf: '2026-07-28',
    outcome: 'Cool Cats is thriving as a currently operated character and holder-product brand: its app, avatar, legal, and founder-led product surfaces were live at review. This does not establish NFT market strength, active-user quality, token value, royalty revenue, licensing profitability, or holder retention.',
    outcomeSources: ['cats-home', 'cats-leadership', 'cats-avatar', 'cats-terms'],
    why: 'Cool Cats survived a weak-utility phase by explicitly sunsetting Cooltopia and MILK, returning the creator to operating leadership, and redirecting the brand toward apps, avatars, licensing, partnerships, and physical character products. The observed pivot and current surfaces show execution rather than abandonment. It is inferred—not measured—that narrowing the strategy and restoring founder accountability improved continuity; no source provides cohort retention or profitability.',
    whySources: ['cats-sunset', 'cats-leadership', 'cats-avatar', 'cats-strategy', 'cats-home'],
    choices: [
      {
        decision: 'Build the brand around 9,999 recognizable characters and holder IP rather than a single game.',
        consequence: 'The collection can extend into media, licensing, apps, and products, while success depends on consistent character distribution and execution across formats.',
        confidence: 'high',
        source_refs: ['cats-home', 'cats-terms'],
      },
      {
        decision: 'Sunset Cooltopia and MILK instead of maintaining legacy utility indefinitely.',
        consequence: 'The team reduced product and token baggage but imposed continuity costs on holders who had organized around the retired ecosystem.',
        confidence: 'high',
        source_refs: ['cats-sunset'],
      },
      {
        decision: 'Return founder and artist Clon to direct operating leadership.',
        consequence: 'Creative and operating accountability became more legible, although individual leadership also increases key-person dependence.',
        confidence: 'high',
        source_refs: ['cats-leadership'],
      },
      {
        decision: 'Ship a mini-app and avatar system while pursuing licensing and physical products.',
        consequence: 'Multiple access points can widen distribution beyond NFT trading; usage, conversion, and business contribution remain unreported.',
        source_refs: ['cats-home', 'cats-avatar', 'cats-strategy'],
      },
    ],
    counterfactual: 'Continuing to subsidize MILK and Cooltopia could have preserved narrative continuity but risked spending resources on a weak product loop. A narrower art-only strategy would reduce execution burden while abandoning the broader character-IP opportunity that the current team is pursuing.',
    counterfactualSources: ['cats-sunset', 'cats-strategy', 'cats-home'],
    watch: [
      {
        signal: 'Mini-app retention, quest activity, and avatar adoption.',
        implication: 'Repeat use would support the product pivot; nominal launches without sustained users would weaken it.',
        source_refs: ['cats-home', 'cats-avatar'],
      },
      {
        signal: 'Delivery of announced character media, licensing, and physical products.',
        implication: 'Shipped distribution would validate the IP strategy; repeated roadmap slippage would increase execution risk.',
        source_refs: ['cats-strategy', 'cats-home'],
      },
      {
        signal: 'Founder leadership continuity and changes to holder rights or benefits.',
        implication: 'Stable leadership and predictable rights support trust; another abrupt pivot would revive coordination risk.',
        source_refs: ['cats-leadership', 'cats-terms'],
      },
    ],
    unknowns: [
      'How many unique holders and non-holder users actively use current Cool Cats products?',
      'What revenue and costs come from licensing, apps, merchandise, royalties, and partnerships?',
      'How did the Cooltopia and MILK sunset affect holder retention and realized losses?',
      'Which announced products are funded, scheduled, and contractually committed rather than exploratory?',
    ],
    nextReview: '2026-10-29',
  }),
  cryptokitties: analysis({
    label: 'thriving',
    asOf: '2026-02-12',
    outcome: 'CryptoKitties is thriving as a maintained collectible protocol and product lineage: the original guide and API remain available and Dapper ran a related February 2026 experience. The classification does not establish original-collection trading health, breeder activity, unique-holder retention, fee revenue, or profitability.',
    outcomeSources: ['kitties-dapper', 'kitties-api', 'kitties-zen'],
    why: 'CryptoKitties created a repeatable ownership loop rather than a fixed image drop: genetics, breeding, siring, marketplace exchange, and Fancy combinations made each asset both collectible and productive inside the game. That observed mechanism explains historical differentiation, while current API and related-product maintenance show continued stewardship. It remains unproven whether the loop still attracts material original-product usage, and Ethereum transaction dependence can add cost and friction.',
    whySources: ['kitties-guide', 'kitties-gen0', 'kitties-genes', 'kitties-fancy', 'kitties-api', 'kitties-zen'],
    choices: [
      {
        decision: 'Cap Generation 0 while allowing the broader cat population to expand through breeding.',
        consequence: 'The design preserved scarcity for one cohort and created an ongoing creation loop, while making total supply dynamic and potentially dilutive.',
        confidence: 'high',
        source_refs: ['kitties-gen0', 'kitties-genes'],
      },
      {
        decision: 'Encode heritable traits and Fancy Cat recipes into the collection experience.',
        consequence: 'Assets gained game-like discovery and combination utility beyond visual ownership, encouraging experimentation without guaranteeing economic value.',
        confidence: 'high',
        source_refs: ['kitties-genes', 'kitties-fancy'],
      },
      {
        decision: 'Combine trading, offers, breeding, and siring in one product loop.',
        consequence: 'Multiple participant roles can create recurring interaction, but the reviewed sources do not disclose current fees, users, or profitable demand.',
        confidence: 'high',
        source_refs: ['kitties-guide'],
      },
      {
        decision: 'Maintain an Ethereum API and extend the IP through related CryptoKitties experiences.',
        consequence: 'Developer and brand continuity outlasted the launch cycle, while original-token utility remains partly dependent on Dapper-operated interfaces.',
        source_refs: ['kitties-api', 'kitties-zen', 'kitties-dapper'],
      },
    ],
    counterfactual: 'A fixed non-breeding collection would have simplified scarcity and reduced network transactions, but removed the genetic creation loop that made CryptoKitties distinctive. Moving all activity offchain could improve throughput while weakening owner-verifiable breeding and asset provenance.',
    counterfactualSources: ['kitties-guide', 'kitties-gen0', 'kitties-genes', 'kitties-api'],
    watch: [
      {
        signal: 'Availability and use of the original guide, API, breeding, and marketplace interfaces.',
        implication: 'Continued functionality supports protocol stewardship; deprecation would narrow the case to artifact persistence.',
        source_refs: ['kitties-guide', 'kitties-api'],
      },
      {
        signal: 'New Dapper-operated CryptoKitties experiences and their relationship to original cats.',
        implication: 'Meaningful interoperability could refresh utility; brand-only extensions would not prove original-collection health.',
        source_refs: ['kitties-dapper', 'kitties-zen'],
      },
      {
        signal: 'Current breeding, siring, holder, and transaction activity.',
        implication: 'Repeat behavior would validate the original product loop; inactivity would weaken the thriving classification.',
        source_refs: ['kitties-guide', 'kitties-genes'],
      },
    ],
    unknowns: [
      'How many unique users currently breed, sire, buy, or sell original CryptoKitties?',
      'What are current holder concentration, sale liquidity, and transaction costs?',
      'What fee revenue and operating costs come from the original product?',
      'How do related experiences use or reward original-token ownership?',
    ],
    nextReview: '2026-10-29',
  }),
  cryptopunks: analysis({
    label: 'thriving',
    asOf: '2026-05-08',
    outcome: 'CryptoPunks is thriving as a currently stewarded cultural and technical collection: nonprofit NODE maintains the IP, an open-source marketplace and API, and a dedicated exhibition program. The label excludes floor price, trading volume, liquidity, holder returns, and NODE financial performance.',
    outcomeSources: ['punks-node-profile', 'punks-marketplace', 'punks-exhibition'],
    why: 'CryptoPunks paired fixed, free-to-claim scarcity with early Ethereum provenance, then shifted stewardship toward preservation, licensing, open-source market infrastructure, and institutional presentation. The observed current work keeps the collection usable and culturally legible without requiring a new token or expanding supply. It is inferred that neutral stewardship and open infrastructure reinforce durability; no reviewed evidence measures their causal effect on demand.',
    whySources: ['punks-node-profile', 'punks-node-acquisition', 'punks-marketplace', 'punks-exhibition'],
    choices: [
      {
        decision: 'Release 10,000 fixed works as free claims rather than a priced primary sale.',
        consequence: 'The launch privileged distribution and experimentation over creator sale proceeds, producing a clear fixed-supply historical cohort.',
        confidence: 'high',
        source_refs: ['punks-node-profile'],
      },
      {
        decision: 'Transfer collection IP stewardship to nonprofit NODE with creator involvement.',
        consequence: 'Preservation and public-benefit framing became separate from token ownership and marketplace operation, reducing reliance on a commercial roadmap.',
        confidence: 'high',
        source_refs: ['punks-node-acquisition', 'punks-node-profile'],
      },
      {
        decision: 'Open-source a native marketplace and expand it with bids, USDC purchases, notifications, and an API.',
        consequence: 'Collection-specific infrastructure can reduce dependence on general marketplaces and support developers, while usage and operating cost remain undisclosed.',
        confidence: 'high',
        source_refs: ['punks-marketplace', 'punks-engineering-index'],
      },
      {
        decision: 'Invest in exhibitions and institutional cultural programming instead of issuing a native utility token.',
        consequence: 'Value remains tied to art, provenance, rights, and cultural distribution rather than token incentives or promised cash flow.',
        source_refs: ['punks-exhibition', 'punks-node-profile'],
      },
    ],
    counterfactual: 'A commercial token, royalty, or expanding-collection strategy could fund more products but would change the fixed, historically complete proposition and add incentive risk. Abandoning the native marketplace would reduce maintenance cost while increasing dependence on third-party trading and metadata surfaces.',
    counterfactualSources: ['punks-node-profile', 'punks-marketplace', 'punks-exhibition'],
    watch: [
      {
        signal: 'Maintenance and adoption of the open-source marketplace and API.',
        implication: 'Sustained engineering supports collection independence; abandonment would increase platform dependency.',
        source_refs: ['punks-marketplace', 'punks-engineering-index'],
      },
      {
        signal: 'NODE governance, funding, and preservation activity.',
        implication: 'Stable nonprofit stewardship supports cultural continuity; mission or funding changes could alter the operating model.',
        source_refs: ['punks-node-acquisition', 'punks-node-profile'],
      },
      {
        signal: 'Continued exhibitions and institutional collaborations.',
        implication: 'Recurring programs would support cultural relevance without serving as a proxy for market prices.',
        source_refs: ['punks-exhibition'],
      },
    ],
    unknowns: [
      'What are current unique-holder retention, concentration, sale frequency, and liquidity?',
      'How many users and developers rely on the native marketplace and API?',
      'How is NODE funded and what are the costs of preservation, engineering, and exhibitions?',
      'What measurable effect do institutional programs have on audience growth or collection demand?',
    ],
    nextReview: '2026-10-29',
  }),
  cyberkongz: analysis({
    label: 'thriving',
    asOf: '2026-07-28',
    outcome: 'CyberKongz is thriving as a currently operated multi-collection, game, shop, and token ecosystem after its BANANA-to-KONG transition. The classification does not claim strong NFT liquidity, game retention, token value, holder returns, treasury health, or business profitability.',
    outcomeSources: ['kong-current', 'kong-token', 'kong-shop'],
    why: 'CyberKongz repeatedly expanded a scarce Genesis identity into later collections, games, avatars, merchandise, licensing, and token-mediated rewards. That breadth supplies multiple reasons to remain engaged and the current surfaces prove operation. The same strategy creates execution and coordination risk across Ethereum, Polygon, Ronin, and changing token mechanics; it is inferred that utility breadth supports continuity, while no reviewed source proves sustainable demand or value capture.',
    whySources: ['kong-about', 'kong-collections', 'kong-genkai', 'kong-whitepaper', 'kong-token', 'kong-shop'],
    choices: [
      {
        decision: 'Use a scarce 1,000-item Genesis cohort as the identity anchor, then issue Baby, VX, and Genkai collections.',
        consequence: 'The ecosystem widened access and product formats while making collection-specific rights and value harder to compare.',
        confidence: 'high',
        source_refs: ['kong-collections', 'kong-genkai'],
      },
      {
        decision: 'Build games, avatars, holder licensing, community access, and physical products around the collection family.',
        consequence: 'Multiple utility surfaces can diversify engagement beyond trading, but each adds delivery cost and no source discloses product-level profitability.',
        confidence: 'high',
        source_refs: ['kong-current', 'kong-terms', 'kong-shop'],
      },
      {
        decision: 'Transition token utility from BANANA toward KONG with team-managed staking and reward programs.',
        consequence: 'The new token can consolidate current incentives, while migrations and discretionary reward rules expose holders to policy, liquidity, and token-supply risk.',
        confidence: 'high',
        source_refs: ['kong-whitepaper', 'kong-token'],
      },
      {
        decision: 'Distribute collections and products across Ethereum, Polygon, and Ronin.',
        consequence: 'Multichain reach can access different users and game infrastructure, but fragments liquidity, custody paths, and technical support.',
        source_refs: ['kong-collections', 'kong-genkai', 'kong-current'],
      },
    ],
    counterfactual: 'Remaining an Ethereum-only art collection would reduce bridge, token, and execution complexity but forgo game and broader consumer distribution. Keeping BANANA indefinitely might preserve continuity for existing holders while limiting the team’s ability to redesign incentives; neither alternative guarantees demand.',
    counterfactualSources: ['kong-collections', 'kong-whitepaper', 'kong-token'],
    watch: [
      {
        signal: 'KONG staking, reward-rule changes, and migration completion.',
        implication: 'Transparent durable mechanics support trust; repeated redesigns or weak liquidity would increase token dependence risk.',
        source_refs: ['kong-whitepaper', 'kong-token'],
      },
      {
        signal: 'Repeat usage of games, avatar products, and holder programs across collections.',
        implication: 'Sustained behavior would validate utility breadth; nominal availability without users would not.',
        source_refs: ['kong-current', 'kong-genkai'],
      },
      {
        signal: 'Cross-chain support and collection-specific rights.',
        implication: 'Reliable infrastructure and clear rights reduce fragmentation; sunset chains or ambiguous benefits could strand holders.',
        source_refs: ['kong-collections', 'kong-terms'],
      },
    ],
    unknowns: [
      'What are current unique players, repeat users, and holder participation by collection?',
      'What are KONG circulation, reward costs, realized liquidity, and treasury exposure?',
      'How much revenue and cost comes from games, merchandise, royalties, licensing, and partnerships?',
      'How fragmented are holders and liquidity across Ethereum, Polygon, and Ronin?',
    ],
    nextReview: '2026-10-29',
  }),
  'decentraland-land': analysis({
    label: 'middling',
    asOf: '2026-05-20',
    outcome: 'Decentraland LAND is middling: the world, LAND and Estate tooling, governance, and security maintenance remain operational, but current primary evidence does not establish strong parcel demand, owner activity, occupancy, rentals, or returns. A patched 2026 Estate vulnerability shows active stewardship and continuing smart-contract risk.',
    outcomeSources: ['dcl-about', 'dcl-overview', 'dcl-security-2026'],
    why: 'Decentraland made coordinate-linked land the scarce control layer for a user-built world, tied exchange and governance to MANA and DAO processes, and allowed owners to publish, combine, rent, or transfer parcels. Those mechanisms still operate, but ownership supply and tooling alone do not create compelling reasons for recurring visits or tenant demand. The observed system is maintained; the middling assessment is an inference from the absence of verified strong usage or land economics, not proof of failure.',
    whySources: ['dcl-whitepaper', 'dcl-whitepaper2', 'dcl-about', 'dcl-overview', 'dcl-security-2026'],
    choices: [
      {
        decision: 'Use a finite coordinate grid of 90,601 Genesis City parcels as the world-control layer.',
        consequence: 'Owners receive legible spatial control and scarcity, while productive value depends on location, content, users, and platform demand rather than scarcity alone.',
        confidence: 'high',
        source_refs: ['dcl-whitepaper2', 'dcl-overview'],
      },
      {
        decision: 'Price initial unclaimed LAND in MANA and connect ownership to DAO governance.',
        consequence: 'Land and governance became linked to a native token economy, adding coordination and treasury tools as well as MANA volatility and governance-participation risk.',
        confidence: 'high',
        source_refs: ['dcl-whitepaper', 'dcl-about'],
      },
      {
        decision: 'Enable owner publishing, parcel aggregation into Estates, rentals, and transfers.',
        consequence: 'LAND can function as a productive creator or tenant input, but the reviewed sources do not establish occupancy, rent, or owner revenue.',
        confidence: 'high',
        source_refs: ['dcl-overview', 'dcl-about'],
      },
      {
        decision: 'Maintain Estate contracts and publish a 2026 vulnerability post-mortem.',
        consequence: 'The response demonstrates ongoing security stewardship while confirming that LAND utility depends on upgrade, indexing, and contract correctness.',
        confidence: 'high',
        source_refs: ['dcl-security-2026'],
      },
    ],
    counterfactual: 'A world with abundant or non-tokenized publishing space could reduce acquisition friction and invite more creators, but weaken LAND scarcity and owner control. Stronger centralized curation could improve discovery and safety while reducing the open governance proposition. Neither alternative ensures repeat users.',
    counterfactualSources: ['dcl-whitepaper2', 'dcl-about', 'dcl-overview'],
    watch: [
      {
        signal: 'Unique visitors, repeat sessions, scene publishing, and parcel occupancy.',
        implication: 'Growth would support productive LAND demand; flat or declining use would weaken the ownership thesis.',
        source_refs: ['dcl-about', 'dcl-overview'],
      },
      {
        signal: 'Rental activity, creator earnings, and LAND-owner revenue distributions.',
        implication: 'Measured cash flow would clarify value capture; absent activity would leave scarcity disconnected from use.',
        source_refs: ['dcl-about', 'dcl-overview'],
      },
      {
        signal: 'Security incidents and Estate or LAND contract changes.',
        implication: 'Transparent remediation supports trust; exploitation or incompatible upgrades could impair ownership and utility.',
        source_refs: ['dcl-security-2026'],
      },
    ],
    unknowns: [
      'How many unique owners actively publish, rent, or manage LAND?',
      'What are current visitor retention, scene engagement, and parcel occupancy?',
      'What rental, marketplace, creator, and DAO economics accrue specifically to LAND owners?',
      'How concentrated are LAND and governance power, and how exposed are Estates to unresolved contract risk?',
    ],
    nextReview: '2026-10-29',
  }),
  'ethereum-name-service': analysis({
    label: 'thriving',
    asOf: '2026-07-20',
    outcome: 'Ethereum Name Service is thriving as an actively governed naming protocol: current architecture, registrar, reverse-resolution, governance, and security work remain live. The label does not claim strong secondary-market returns, registration retention, treasury profitability, governance quality, or token value.',
    outcomeSources: ['ens-v2', 'ens-governance', 'ens-reverse', 'ens-security'],
    why: 'ENS solves a recurring identity problem rather than manufacturing collectible scarcity: renewable names map human-readable identifiers to addresses and records, while governance and treasury funding support protocol maintenance. Current architecture and security work show continuing adaptation, including multichain ambitions. Observed utility and stewardship support the outcome; it is inferred that renewal pricing discourages squatting and funds continuity, while retention and financial efficiency are not measured here.',
    whySources: ['ens-history', 'ens-v2', 'ens-registrar', 'ens-governance', 'ens-foundation', 'ens-reverse', 'ens-security'],
    choices: [
      {
        decision: 'Use renewable .eth registrations with recurring length-based fees rather than permanent one-time ownership.',
        consequence: 'Renewals create a maintenance funding path and recycling pressure for abandoned names, while exposing users to recurring cost and expiration risk.',
        confidence: 'high',
        source_refs: ['ens-registrar'],
      },
      {
        decision: 'Route protocol governance and treasury allocation through a DAO and Foundation structure.',
        consequence: 'Stakeholders can fund public goods and upgrades, but participation, delegate concentration, and treasury efficiency become material governance risks.',
        confidence: 'high',
        source_refs: ['ens-governance', 'ens-foundation'],
      },
      {
        decision: 'Support primary names, records, and subnames as identity infrastructure rather than issue a fixed art collection.',
        consequence: 'Utility can recur across wallets and applications; adoption depends on resolver, wallet, and application integration.',
        confidence: 'high',
        source_refs: ['ens-reverse', 'ens-v2'],
      },
      {
        decision: 'Pursue ENSv2 and multichain architecture while formalizing a security council.',
        consequence: 'The protocol can broaden reach and upgradeability, while migration and governance complexity increase execution and trust assumptions.',
        source_refs: ['ens-v2', 'ens-security', 'ens-history'],
      },
    ],
    counterfactual: 'Permanent one-time names could simplify ownership but encourage indefinite squatting and remove recurring protocol funding. Remaining Ethereum-only would reduce architectural complexity while limiting identity reach across other chains. Centralized upgrades might move faster but weaken ENS governance legitimacy.',
    counterfactualSources: ['ens-registrar', 'ens-v2', 'ens-governance', 'ens-security'],
    watch: [
      {
        signal: 'Registration renewals, expirations, and primary-name usage.',
        implication: 'Strong renewal and use would validate durable utility; speculative registrations without retention would weaken it.',
        source_refs: ['ens-registrar', 'ens-reverse'],
      },
      {
        signal: 'ENSv2 and multichain migration milestones.',
        implication: 'Safe adoption would expand reach; delays, incompatibility, or governance disputes would add execution risk.',
        source_refs: ['ens-v2', 'ens-history'],
      },
      {
        signal: 'Security Council actions, DAO participation, and treasury allocation.',
        implication: 'Transparent effective governance supports continuity; concentrated or opaque control would weaken the decentralization thesis.',
        source_refs: ['ens-security', 'ens-governance', 'ens-foundation'],
      },
    ],
    unknowns: [
      'What are current renewal rates, active primary-name usage, and multi-year retention?',
      'How concentrated are names, delegates, and governance voting power?',
      'What are treasury runway, protocol costs, and grant outcomes?',
      'How much multichain adoption will ENSv2 achieve without fragmenting resolver compatibility?',
    ],
    nextReview: '2026-10-29',
  }),
  'f1-delta-time': analysis({
    label: 'dead',
    asOf: '2022-03-16',
    outcome: 'F1 Delta Time is dead at the operating-product layer because Animoca Brands explicitly ended the game on March 16, 2022 after it could not renew the Formula 1 licence. NFTs and replacement entitlements could persist, but persistence does not preserve the licensed game, brand utility, or original economy.',
    outcomeSources: ['f1dt-closure'],
    why: 'The product concentrated its identity and utility in a third-party Formula 1 licence, then built a multi-asset game economy around that controlled brand. When renewal failed, the operator could not continue the named product, so blockchain ownership did not prevent the offchain licence from removing core utility. The licensing failure is observed and explicit; player demand, unit economics, and whether other factors contributed remain unknown.',
    whyConfidence: 'high',
    whySources: ['f1dt-closure'],
    choices: [
      {
        decision: 'Center the game and collectible economy on licensed Formula 1 identity.',
        consequence: 'The licence supplied immediate global distribution and authenticity while creating a single external dependency capable of terminating the product.',
        confidence: 'high',
        source_refs: ['f1dt-closure'],
      },
      {
        decision: 'Issue multiple interoperating asset types including cars, drivers, parts, tyres, and event segments.',
        consequence: 'The design deepened the game economy but increased the number of holder entitlements requiring resolution when operations ended.',
        confidence: 'high',
        source_refs: ['f1dt-closure'],
      },
      {
        decision: 'Use replacement REVV Racing assets, passes, proxies, vouchers, and limited payouts in the wind-down.',
        consequence: 'Animoca preserved some ecosystem access and compensation paths without restoring the original licensed product or guaranteeing equivalent value.',
        confidence: 'high',
        source_refs: ['f1dt-closure'],
      },
    ],
    counterfactual: 'Owning original racing IP or negotiating a long-dated renewal and transition right could have reduced licence concentration risk, but might have sacrificed Formula 1 distribution. A licence-independent fallback game could preserve utility after termination, although the reviewed source does not establish whether it was commercially or contractually feasible.',
    counterfactualSources: ['f1dt-closure'],
    watch: [
      {
        signal: 'Completion and usability of promised replacement or payout paths.',
        implication: 'Fulfillment affects loss mitigation for former holders but cannot change the dead operating-product classification.',
        source_refs: ['f1dt-closure'],
      },
      {
        signal: 'Any revival under a renewed Formula 1 licence or successor product.',
        implication: 'Only a verified operating return would change the terminal product status.',
        source_refs: ['f1dt-closure'],
      },
      {
        signal: 'Treatment of licensed IP dependencies in other Animoca NFT games.',
        implication: 'Contractual fallbacks would show whether the failure lesson changed portfolio strategy.',
        source_refs: ['f1dt-closure'],
      },
    ],
    unknowns: [
      'What were active users, revenue, costs, and asset-holder concentration before closure?',
      'Why was the Formula 1 licence not renewed and were economics or performance contributing factors?',
      'What percentage of holders completed each replacement or payout path?',
      'How did realized replacement value compare with original asset acquisition costs?',
    ],
    nextReview: '2027-01-29',
  }),
  'funko-digital-pop': analysis({
    label: 'dead',
    asOf: '2026-05-31',
    outcome: 'Funko Digital Pop is dead at the operator-program layer: Funko stopped new releases and disabled Droppp accounts, wallets, marketplace access, pack opening, and community infrastructure on May 31, 2026. Exported WAX assets can persist, but the primary product and redemption system ended.',
    outcomeSources: ['funko-sunset'],
    why: 'The program connected licensed digital drops to Funko-operated custody, marketplace, pack opening, and time-limited physical redemption. That integration differentiated the product, but concentrated utility in operator services and fulfilment rather than the WAX token alone. Funko’s shutdown is observed; the causal inference is that centralized program dependence made the tokens unable to preserve their full use when the operator exited, while the business reason for exit is undisclosed.',
    whySources: ['funko-sunset', 'funko-faq'],
    choices: [
      {
        decision: 'Release recurring licensed Digital Pop collections instead of one fixed collection.',
        consequence: 'Periodic drops created repeat inventory and brand partnerships, while exposing the program to ongoing licensing, demand, and fulfilment requirements.',
        confidence: 'high',
        source_refs: ['funko-sunset', 'funko-faq'],
      },
      {
        decision: 'Tie selected digital items and completed sets to physical redemption tokens.',
        consequence: 'Physical figures created differentiated utility, but value depended on eligibility windows, logistics, and Funko fulfillment rather than token ownership alone.',
        confidence: 'high',
        source_refs: ['funko-faq'],
      },
      {
        decision: 'Concentrate wallet, marketplace, pack-opening, and community functions in Droppp.',
        consequence: 'The integrated experience simplified participation but created an operator shutdown point that removed most program utility at once.',
        confidence: 'high',
        source_refs: ['funko-sunset'],
      },
      {
        decision: 'Permit WAX transfers and commit to outstanding physical redemptions during sunset.',
        consequence: 'Export and fulfillment mitigate some losses while leaving holders without new drops or the original platform experience.',
        source_refs: ['funko-sunset', 'funko-faq'],
      },
    ],
    counterfactual: 'A self-custody-first architecture with open pack and redemption standards could preserve more functionality after operator exit, but licensed physical fulfilment would still require accountable counterparties. Ending new drops while keeping read-only wallet and redemption infrastructure longer could reduce transition risk at continued operating cost.',
    counterfactualSources: ['funko-sunset', 'funko-faq'],
    watch: [
      {
        signal: 'Fulfillment of outstanding physical redemption obligations.',
        implication: 'Completion affects holder recovery and trust but does not restore the sunset program.',
        source_refs: ['funko-sunset', 'funko-faq'],
      },
      {
        signal: 'Continued third-party WAX transfer and display support.',
        implication: 'External support preserves artifact access while demonstrating the boundary between token persistence and product continuity.',
        source_refs: ['funko-faq'],
      },
      {
        signal: 'Any successor Funko digital-collectible program.',
        implication: 'A verified replacement could change the company-level strategy, not the terminal status of Digital Pop and Droppp.',
        source_refs: ['funko-sunset'],
      },
    ],
    unknowns: [
      'Why did Funko decide to close the program and what were its revenue and operating costs?',
      'How many users and assets were exported before Droppp access ended?',
      'How many physical redemptions remain outstanding and what is their fulfillment status?',
      'What functions remain usable for WAX assets without Droppp metadata and interfaces?',
    ],
    nextReview: '2027-01-29',
  }),
  'gamestop-nft-marketplace': analysis({
    label: 'dead',
    asOf: '2024-02-03',
    outcome: 'GameStop NFT Marketplace is dead: GameStop’s filed disclosure says its wallet and marketplace activities were wound down by the end of fiscal 2023 and that related revenue was not material. The evidence establishes terminal status and weak consolidated materiality, not a single proven cause or marketplace-specific loss.',
    outcomeSources: ['gme-2024-10k', 'gme-2026-10k'],
    why: 'GameStop entered with a non-custodial wallet and peer-to-peer marketplace but did not build a financially material business inside the reporting company before winding both activities down. The filings directly support launch, wind-down, and immaterial related revenue; they do not disclose users, product costs, or management’s complete causal analysis. The supported inference is that blockchain rails and corporate distribution were insufficient to justify continued resource allocation under the achieved economics.',
    whySources: ['gme-2024-10k', 'gme-2026-10k'],
    choices: [
      {
        decision: 'Launch beta wallet and peer-to-peer marketplace products in 2022 as corporate adjacencies.',
        consequence: 'GameStop gained an integrated route into NFT trading but entered a business requiring new creator, liquidity, custody, and compliance capabilities.',
        confidence: 'high',
        source_refs: ['gme-2024-10k'],
      },
      {
        decision: 'Support Ethereum and Immutable X rather than build a proprietary blockchain.',
        consequence: 'Existing ecosystems reduced base-layer development needs, while product adoption and GameStop-specific differentiation still had to be earned.',
        source_refs: ['gme-2024-10k'],
      },
      {
        decision: 'Recognize wallet and marketplace revenue in net sales while reporting it as not material.',
        consequence: 'The filing boundary prevents separate digital-asset gains or Immutable agreement accounting from being mistaken for marketplace customer revenue.',
        confidence: 'high',
        source_refs: ['gme-2024-10k'],
      },
      {
        decision: 'Wind down both wallet and marketplace activities rather than continue a subscale product.',
        consequence: 'The company stopped ongoing exposure and also removed the integrated user surface before any disclosed material scale was reached.',
        confidence: 'high',
        source_refs: ['gme-2024-10k', 'gme-2026-10k'],
      },
    ],
    counterfactual: 'A longer runway, a narrower gaming-asset niche, or deeper integration with GameStop’s customer base might have improved differentiation, but the filings provide no adoption or unit-economic evidence showing that those alternatives would succeed. Building a proprietary chain would add control and cost without resolving product demand.',
    counterfactualSources: ['gme-2024-10k', 'gme-2026-10k'],
    watch: [
      {
        signal: 'Future GameStop filings for residual obligations or renewed digital-asset activity.',
        implication: 'New disclosure could refine losses or strategy but would not alter the completed marketplace wind-down without a relaunch.',
        source_refs: ['gme-2026-10k'],
      },
      {
        signal: 'Disposition or support status of wallet and marketplace customer assets.',
        implication: 'Transition outcomes determine user harm and portability after the product exit.',
        source_refs: ['gme-2024-10k'],
      },
      {
        signal: 'Any successor gaming marketplace with disclosed users and economics.',
        implication: 'Measured traction would test whether the failure was execution-specific or reflected a weak corporate adjacency.',
        source_refs: ['gme-2026-10k'],
      },
    ],
    unknowns: [
      'What were marketplace users, creators, volume, fees, and retention?',
      'What product, compliance, infrastructure, and marketing costs were attributable to the initiative?',
      'Which strategic or market factors drove management to wind down the products?',
      'How were users and creators affected, and what assets or obligations remained after closure?',
    ],
    nextReview: '2027-01-29',
  }),
  'gods-unchained-cards': analysis({
    label: 'thriving',
    asOf: '2026-06-16',
    outcome: 'Gods Unchained cards are thriving within an actively shipped game: a June 2026 expansion and completed NFT infrastructure migration show continuing content and operations. The label does not establish card appreciation, active-player retention, GODS token returns, expansion profitability, or Immutable financial health.',
    outcomeSources: ['gu-current', 'gu-migration'],
    why: 'The collection’s durable mechanism is playable utility reinforced by recurring sets and expansions, not static scarcity. Tradable cards remain connected to game rules, while GODS provides crafting and pack-purchase utility and the team migrated assets to current Immutable infrastructure. Those observed choices support operating continuity; it is inferred that new content and lower-friction chain infrastructure help retention, but user and economic outcomes are not disclosed.',
    whySources: ['gu-history', 'gu-genesis', 'gu-rollout', 'gu-migration', 'gu-current', 'gu-token'],
    choices: [
      {
        decision: 'Make cards playable in a competitive game and tradable as NFTs.',
        consequence: 'Ownership has repeat functional use, while card value depends on game balance, player demand, and continued operator support.',
        confidence: 'high',
        source_refs: ['gu-history', 'gu-rollout'],
      },
      {
        decision: 'Issue multiple sets and expansions rather than preserve one fixed card pool.',
        consequence: 'New content can refresh strategy and revenue, while increasing supply and creating balance or obsolescence risk for older cards.',
        confidence: 'high',
        source_refs: ['gu-genesis', 'gu-current'],
      },
      {
        decision: 'Migrate NFT infrastructure from earlier Immutable rails to Immutable zkEVM.',
        consequence: 'The game can use the current ecosystem and tooling, but holders face migration, wallet, and chain-dependence coordination costs.',
        confidence: 'high',
        source_refs: ['gu-rollout', 'gu-migration'],
      },
      {
        decision: 'Use GODS for crafting NFTs and purchasing card packs.',
        consequence: 'The token creates in-product sinks and value-capture mechanics without granting card holders equity or proving sustainable token demand.',
        confidence: 'high',
        source_refs: ['gu-token'],
      },
    ],
    counterfactual: 'Freezing the card pool would protect old-set relevance but remove the content cadence needed for a live trading-card game. Staying on legacy infrastructure would avoid migration friction while limiting current ecosystem integration. Removing GODS could simplify the economy but eliminate documented crafting and purchase sinks.',
    counterfactualSources: ['gu-genesis', 'gu-rollout', 'gu-migration', 'gu-current', 'gu-token'],
    watch: [
      {
        signal: 'Expansion cadence, game balance, and repeat player participation.',
        implication: 'Sustained play validates card utility; content without retention would weaken the thriving assessment.',
        source_refs: ['gu-current'],
      },
      {
        signal: 'Immutable zkEVM migration completion and wallet support.',
        implication: 'Reliable access supports trading and play; stranded or confused holders would reveal chain-migration costs.',
        source_refs: ['gu-migration'],
      },
      {
        signal: 'GODS crafting, pack-purchase use, issuance, and liquidity.',
        implication: 'Healthy sinks support the token loop; weak utility or excessive incentives would add value-capture risk.',
        source_refs: ['gu-token'],
      },
    ],
    unknowns: [
      'What are current daily and monthly players, retention, and payer conversion?',
      'What are card liquidity, holder concentration, and usage by set?',
      'What revenue, reward cost, and profitability come from packs and expansions?',
      'How many assets and holders completed the zkEVM migration without loss of access?',
    ],
    nextReview: '2026-12-13',
  }),
  'kraken-nft-marketplace': analysis({
    label: 'dead',
    asOf: '2025-02-27',
    outcome: 'Kraken NFT Marketplace is dead: trading stopped on November 27, 2024 and the marketplace fully shut after the February 27, 2025 withdrawal deadline so Kraken could move resources to other products. The record does not establish market share, losses, user count, or one feature as the cause.',
    outcomeSources: ['kraken-close'],
    why: 'Kraken differentiated through custodial convenience: zero network gas fees for internal trades, multi-currency bids, curated collections, and integration with its broader client platform. Those choices reduced transaction friction but required Kraken to operate custody, marketplace, and creator-earnings infrastructure. The closure and stated resource reallocation are observed; it is inferred that achieved strategic value did not clear Kraken’s internal threshold, while adoption and unit economics remain undisclosed.',
    whySources: ['kraken-waitlist', 'kraken-launch', 'kraken-close'],
    choices: [
      {
        decision: 'Internalize custody and trades to offer zero network gas fees while assets remained on Kraken.',
        consequence: 'Users received a simpler cost experience, while portability and product continuity depended more heavily on the centralized operator.',
        confidence: 'high',
        source_refs: ['kraken-waitlist', 'kraken-launch'],
      },
      {
        decision: 'Launch with curated collections, multiple bid currencies, rarity tools, and creator earnings.',
        consequence: 'A broad feature set attempted to compete with specialist marketplaces, but no reviewed source shows that it produced sufficient liquidity or users.',
        confidence: 'high',
        source_refs: ['kraken-launch'],
      },
      {
        decision: 'Run the marketplace as an adjacency to Kraken’s existing client platform.',
        consequence: 'The exchange could reuse accounts and funding rails, yet marketplace demand still had to justify dedicated operating resources.',
        source_refs: ['kraken-waitlist', 'kraken-launch'],
      },
      {
        decision: 'Move to withdrawal-only mode and reallocate resources to other products.',
        consequence: 'Kraken provided an exit window while terminating listing, buying, bidding, and selling rather than maintain a subscale service.',
        confidence: 'high',
        source_refs: ['kraken-close'],
      },
    ],
    counterfactual: 'A non-custodial aggregator or narrower exchange-client collectible product could reduce operating scope and custody dependence, but might also lose the zero-gas convenience used for differentiation. A longer runway could build liquidity only if unmet demand existed; the reviewed sources provide no evidence that it did.',
    counterfactualSources: ['kraken-waitlist', 'kraken-launch', 'kraken-close'],
    watch: [
      {
        signal: 'Residual customer asset support or post-closure claims.',
        implication: 'Unresolved withdrawals would affect the quality of the wind-down even though trading remains terminated.',
        source_refs: ['kraken-close'],
      },
      {
        signal: 'Any Kraken relaunch or integration of NFT functions into another product.',
        implication: 'A successor could revise the company-level thesis but would need verified operation to change this marketplace’s status.',
        source_refs: ['kraken-close'],
      },
      {
        signal: 'Kraken disclosure about resource allocation and product profitability.',
        implication: 'More detail could distinguish weak adoption from strategic reprioritization or high operating cost.',
        source_refs: ['kraken-close'],
      },
    ],
    unknowns: [
      'What were marketplace users, volume, take rate, creator participation, and retention?',
      'What custody, infrastructure, support, and compliance costs did Kraken incur?',
      'Which products received the reallocated resources and what decision threshold was used?',
      'How many users withdrew assets before closure and were any assets or claims unresolved?',
    ],
    nextReview: '2027-01-29',
  }),
  meebits: analysis({
    label: 'thriving',
    asOf: '2026-07-28',
    outcome: 'Meebits is thriving as a currently stewarded 3D collection and IP: MeebCo maintains collection and license interfaces and shipped a 2026 merchandise program. The classification excludes NFT price, liquidity, asset-pack usage, unique-holder retention, royalty receipts, and MeebCo profitability.',
    outcomeSources: ['meebits-about', 'meebits-license', 'meebits-current', 'meebits-shop'],
    why: 'Meebits launched with reusable 3D asset packs and an integrated no-fee marketplace, giving owners a creation and portability proposition beyond profile imagery. After transfer from Larva Labs through Yuga, specialist MeebCo stewardship focused the IP on licensing, physical and digital production, and public presentation. Current surfaces prove operation; it is inferred that specialist focus sustains the collection, while actual asset use and economics are unmeasured.',
    whySources: ['meebits-launch', 'meebits-transfer', 'meebits-about', 'meebits-license', 'meebits-current', 'meebits-shop'],
    choices: [
      {
        decision: 'Issue 20,000 voxel characters with downloadable 3D asset packs.',
        consequence: 'Owners can use the assets in modeling, animation, games, and virtual worlds, while practical utility depends on compatible tools and holder execution.',
        confidence: 'high',
        source_refs: ['meebits-launch', 'meebits-current'],
      },
      {
        decision: 'Launch an integrated no-fee marketplace and allocate free claims to Punk and Glyph owners.',
        consequence: 'The design rewarded existing communities and reduced initial trading fees, while public-sale economics and later marketplace usage remain undisclosed.',
        confidence: 'high',
        source_refs: ['meebits-launch'],
      },
      {
        decision: 'Transfer stewardship from Larva Labs to Yuga and then to specialist MeebCo.',
        consequence: 'A dedicated operator can focus the collection, but multiple transitions create dependency on successor execution and rights continuity.',
        confidence: 'high',
        source_refs: ['meebits-transfer', 'meebits-about'],
      },
      {
        decision: 'Use holder commercial rights, merchandise, and physical or cultural programs instead of a native collection token.',
        consequence: 'Value capture remains tied to IP use and product sales rather than token incentives, with collection-specific revenues and costs undisclosed.',
        source_refs: ['meebits-license', 'meebits-shop', 'meebits-about'],
      },
    ],
    counterfactual: 'Keeping Meebits inside a broad Yuga portfolio could provide cross-brand distribution but less dedicated attention. Treating the collection as static art would reduce operating cost while abandoning the reusable 3D and consumer-IP thesis. A native token might add incentives without proving asset use or sustainable demand.',
    counterfactualSources: ['meebits-transfer', 'meebits-about', 'meebits-license', 'meebits-shop'],
    watch: [
      {
        signal: 'MeebCo product, merchandise, licensing, and public-program cadence.',
        implication: 'Repeated delivery supports specialist stewardship; dormant surfaces would weaken the thriving classification.',
        source_refs: ['meebits-about', 'meebits-shop'],
      },
      {
        signal: 'Use of official 3D asset packs in games, media, and owner businesses.',
        implication: 'Verified reuse would validate the collection’s core differentiation beyond token ownership.',
        source_refs: ['meebits-launch', 'meebits-license'],
      },
      {
        signal: 'License, stewardship, and collection-interface changes.',
        implication: 'Stable rights and access support owner investment in the IP; abrupt changes would increase successor risk.',
        source_refs: ['meebits-license', 'meebits-current', 'meebits-about'],
      },
    ],
    unknowns: [
      'How many holders download or actively use the 3D asset packs?',
      'What are current holder concentration, sale liquidity, and retention?',
      'What revenue and costs come from merchandise, licensing, royalties, and partnerships?',
      'What funding, staffing, and governance commitments support MeebCo stewardship?',
    ],
    nextReview: '2026-10-29',
  }),
};

export const expectedSlugs = Object.freeze(Object.keys(analyses));

function sourceIds(value, found = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) sourceIds(item, found);
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  for (const id of value.source_refs ?? []) found.add(typeof id === 'string' ? id : id.ref);
  for (const id of value.source_ids ?? []) found.add(id);
  for (const child of Object.values(value)) sourceIds(child, found);
  return found;
}

function sourceResolver(sources) {
  return Object.fromEntries(sources.map((source) => [source.id, source]));
}

function validateDossier(dossier) {
  const sourceById = new Map(dossier.sources.map((source) => [source.id, source]));
  for (const source of dossier.sources) {
    if (source.checked_at !== checkedAt) {
      throw new Error(`${dossier.slug}: source ${source.id} needs checked_at ${checkedAt}`);
    }
  }
  for (const id of sourceIds(dossier.profile)) {
    if (!sourceById.has(id)) throw new Error(`${dossier.slug}: unresolved source ${id}`);
  }
  const citations = validateFieldCitedNft(dossier.profile, dossier.sources);
  if (!citations.valid) {
    throw new Error(`${dossier.slug}: ${citations.errors.join('; ')}`);
  }
  const freshness = validateForensicFreshness(dossier);
  if (!freshness.valid) {
    throw new Error(`${dossier.slug} freshness: ${freshness.errors.join('; ')}`);
  }
  const forensic = validateForensicAnalysis(dossier.profile.forensic_analysis, {
    resolver: sourceResolver(dossier.sources),
  });
  if (forensic.errors.length || forensic.warnings.length || forensic.withheld_sections.length) {
    throw new Error(`${dossier.slug} forensic: ${[
      ...forensic.errors,
      ...forensic.warnings,
      ...forensic.withheld_sections,
    ].join('; ')}`);
  }
}

function priorCorpus() {
  const database = new DatabaseSync(':memory:');
  try {
    const files = readdirSync(resolve(root, 'migrations'))
      .filter((file) => /^\d{4}_.+\.sql$/.test(file))
      .filter((file) => Number(file.slice(0, 4)) <= 56)
      .sort();
    for (const file of files) {
      database.exec(readFileSync(resolve(root, 'migrations', file), 'utf8'));
    }
    return expectedSlugs.map((slug) => database.prepare(`
      SELECT slug, name, chain, category, status, profile, sources
      FROM nft_collections
      WHERE slug = ?
    `).get(slug));
  } finally {
    database.close();
  }
}

export function buildNftForensicWaveAManifest() {
  const rows = priorCorpus();
  const dossiers = rows.map((row, index) => {
    if (!row) throw new Error(`Missing prior NFT row: ${expectedSlugs[index]}`);
    const fullProfile = JSON.parse(row.profile);
    const allSources = JSON.parse(row.sources);
    const evidence = fullProfile.evidence.filter((item) => [
      'launch',
      'supply_or_mint',
      'lifecycle_status',
    ].includes(item.field));
    const profile = {
      citation_schema: fullProfile.citation_schema,
      evidence_policy: fullProfile.evidence_policy,
      evidence,
      forensic_analysis: analyses[row.slug],
    };
    const required = sourceIds(profile);
    const sources = allSources
      .filter((source) => required.has(source.id))
      .map((source) => ({ ...source, checked_at: checkedAt }));
    const dossier = {
      slug: row.slug,
      name: row.name,
      chain: row.chain,
      category: row.category,
      status: row.status,
      profile,
      sources,
    };
    validateDossier(dossier);
    return dossier;
  });
  return {
    schema: 'chaindump-nft-field-v1',
    research_as_of: checkedAt,
    method: 'Causal-analysis patch manifest. Each compact dossier retains only the three field-v1 evidence records needed to validate lifecycle scope plus the normalized forensic-analysis-v1 contract. Migration 0057 patches only profile.forensic_analysis into the full existing dossier; it does not replace sources, lifecycle evidence, or long-form content.',
    generated_migration: '0057_nft_forensic_wave_a.sql',
    dossiers,
  };
}

function quoteSql(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function renderNftForensicWaveAMigration(document) {
  if (document.schema !== 'chaindump-nft-field-v1') throw new Error('Unexpected NFT schema');
  if (document.research_as_of !== checkedAt) throw new Error('Unexpected research date');
  if (document.generated_migration !== '0057_nft_forensic_wave_a.sql') {
    throw new Error('Unexpected generated migration');
  }
  if (JSON.stringify(document.dossiers.map(({ slug }) => slug)) !== JSON.stringify(expectedSlugs)) {
    throw new Error('Unexpected NFT wave A cohort');
  }
  for (const dossier of document.dossiers) validateDossier(dossier);
  const dossierInserts = document.dossiers.map((dossier) => `
INSERT OR REPLACE INTO nft_forensic_wave_a_0057 (slug, forensic_analysis)
VALUES (
  ${quoteSql(dossier.slug)},
  ${quoteSql(JSON.stringify(dossier.profile.forensic_analysis))}
);`).join('\n');

  return `-- Generated by scripts/render-nft-forensic-wave-a-migration.mjs.
-- Patches normalized causal analysis without replacing existing NFT dossier content.

DROP TABLE IF EXISTS nft_forensic_wave_a_0057;
CREATE TABLE nft_forensic_wave_a_0057 (
  slug TEXT PRIMARY KEY,
  forensic_analysis TEXT NOT NULL CHECK (json_valid(forensic_analysis))
);

-- batched-payload-start
${dossierInserts}
-- batched-payload-end

UPDATE nft_collections
SET profile = json_set(
      COALESCE(NULLIF(profile, ''), '{}'),
      '$.forensic_analysis',
      json((
        SELECT patch.forensic_analysis
        FROM nft_forensic_wave_a_0057 AS patch
        WHERE patch.slug = nft_collections.slug
      ))
    ),
    updated_at = '2026-07-29'
WHERE EXISTS (
  SELECT 1
  FROM nft_forensic_wave_a_0057 AS patch
  WHERE patch.slug = nft_collections.slug
);

DROP TABLE IF EXISTS nft_forensic_wave_a_0057;
`;
}

function main() {
  const document = buildNftForensicWaveAManifest();
  writeFileSync(documentPath, `${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(migrationPath, renderNftForensicWaveAMigration(document));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

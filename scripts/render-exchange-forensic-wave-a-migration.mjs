#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const documentPath = resolve(root, 'docs/exchange-forensic-wave-a-2026-07-29.json');
const migrationPath = resolve(root, 'migrations/0059_exchange_forensic_wave_a.sql');
const checkedAt = '2026-07-29';

const source = (id, title, publisher, url, sourceRole = 'primary') => ({
  id,
  title,
  publisher,
  url,
  source_role: sourceRole,
  checked_at: checkedAt,
});

function analysis({
  label,
  asOf,
  outcome,
  outcomeSources,
  why,
  whySources,
  choices,
  counterfactual,
  counterfactualSources,
  watch,
  unknowns,
  nextReview,
  outcomeConfidence = 'high',
  whyConfidence = 'medium',
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

const cases = [
  {
    table: 'dead_exchanges',
    kind: 'dex',
    lifecycle: 'dead',
    slug: 'deus-finance',
    replace_profile: {
      status: 'failed_original_dei_amm_scope',
      scope: 'The failed classification applies to the exploited DEI and original AMM design, not every current DEUS-branded contract or product.',
      residual_protocol: 'A first-party DEUS site remained publicly available on the review date; current users, liquidity, solvency, and contract activity were not independently established.',
    },
    sources: [
      source('deus-current', 'DEUS Finance', 'DEUS Finance', 'https://www.deus.finance/'),
      source('deus-certik-exploit', 'Stablecoin Stumble: The Code Bug That Led to a $6.5 Million Loss on DEUS Finance', 'CertiK', 'https://www.certik.com/blog/stablecoin-stumble-the-code-bug-led-to-usd6-5-million-loss-on-deus-finance', 'security-research'),
      source('deus-dei-hack', 'DEUS Finance loses $6M following stablecoin hack', 'Cointelegraph', 'https://cointelegraph.com/news/deus-finance-loses-6m-following-stablecoin-hack', 'independent-reporting'),
    ],
    forensic_analysis: analysis({
      label: 'failed',
      asOf: '2026-07-29',
      outcome: 'Failed is scoped to the exploited DEI and original AMM mechanism: reviewed incident evidence documents a material 2023 loss, while a DEUS first-party surface still exists. The record therefore does not claim that every residual DEUS product is dead, solvent, active, or economically successful.',
      outcomeSources: ['deus-current', 'deus-certik-exploit', 'deus-dei-hack'],
      why: 'The failed product combined a synthetic-dollar design, protocol-managed liquidity, cross-chain deployment, and pricing logic whose implementation could be manipulated. The exploit was an observed technical failure; the broader inference is that a complex monetary mechanism with a concentrated oracle or accounting boundary made a security incident capable of destroying confidence in DEI. A live residual website does not reverse the original product failure or prove a recovery.',
      whySources: ['deus-certik-exploit', 'deus-dei-hack', 'deus-current'],
      choices: [
        {
          decision: 'Bind the venue to the DEI synthetic-dollar mechanism instead of limiting it to conventional spot swaps.',
          consequence: 'The AMM gained a differentiated monetary product but inherited redemption, peg, oracle, and confidence failure modes beyond ordinary pool impermanent loss.',
          confidence: 'high',
          source_refs: ['deus-certik-exploit', 'deus-dei-hack'],
        },
        {
          decision: 'Deploy a multi-contract, cross-chain protocol with DEUS and DEI as coupled ecosystem assets.',
          consequence: 'Broader product reach increased composability, while security and liquidity risk could propagate across contracts and chains.',
          source_refs: ['deus-current', 'deus-certik-exploit'],
        },
        {
          decision: 'Continue a residual DEUS product surface after the DEI-era failure.',
          consequence: 'The brand and some product interfaces persisted, but current adoption and economic recovery cannot be inferred from website availability.',
          confidence: 'high',
          source_refs: ['deus-current'],
        },
      ],
      counterfactual: 'A narrower audited spot-AMM scope, isolated collateral domains, conservative oracle design, and staged caps could have reduced blast radius. The reviewed evidence cannot establish that those controls would have prevented the specific loss or restored DEI confidence.',
      counterfactualSources: ['deus-certik-exploit', 'deus-dei-hack'],
      watch: [
        {
          signal: 'Current DEUS contract addresses, audits, incident remediation, and live liquidity published by the operator.',
          implication: 'Contract-level evidence could support a separate recovery classification for residual products; a marketing surface alone cannot.',
          source_refs: ['deus-current', 'deus-certik-exploit'],
        },
        {
          signal: 'Any DEI redemption, migration, or final wind-down record.',
          implication: 'A dated resolution would clarify whether the failed monetary product was repaired, replaced, or abandoned.',
          source_refs: ['deus-current', 'deus-dei-hack'],
        },
        {
          signal: 'New security reviews covering the current product architecture.',
          implication: 'Independent review would narrow implementation risk but would not by itself prove demand or solvency.',
          source_refs: ['deus-certik-exploit', 'deus-current'],
        },
      ],
      unknowns: [
        'Which DEUS contracts and products are currently supported by an accountable operator?',
        'What current users, liquidity, fee revenue, liabilities, and redemption obligations exist?',
        'Were all DEI incident losses and claims resolved, migrated, or written off?',
        'How much of the original design remains in the residual protocol?',
      ],
      nextReview: '2026-08-05',
    }),
  },
  {
    table: 'dead_exchanges',
    kind: 'dex',
    lifecycle: 'dead',
    slug: 'solidly',
    replace_profile: {
      status: 'failed_original_fantom_deployment',
      scope: 'This record covers the original Solidly deployment on Fantom. It does not classify later forks, successor teams, or the broader ve(3,3) design family.',
    },
    sources: [
      source('solidly-fantom-launch', 'Fantom General Update: March 1, 2022', 'Fantom Foundation', 'https://blog.fantom.foundation/fantom-general-update-march-1-2022/'),
      source('solidly-cronje-exit', 'Dozens of Tokens Tumble as Prolific Developer Andre Cronje Calls It Quits', 'CoinDesk', 'https://www.coindesk.com/business/2022/03/06/dozens-of-tokens-tumble-as-prolific-developer-andre-cronje-calls-it-quits', 'independent-reporting'),
      source('solidly-history', 'Audit & Release Status', 'Andre Cronje', 'https://andrecronje.info/public-record/audit-release-status/'),
    ],
    forensic_analysis: analysis({
      label: 'failed',
      asOf: '2026-07-29',
      outcome: 'The original Fantom Solidly deployment failed as a durable operating venue after an explosive incentive-led launch and abrupt loss of visible stewardship. The classification excludes later forks and successors that reused the design.',
      outcomeSources: ['solidly-fantom-launch', 'solidly-cronje-exit', 'solidly-history'],
      why: 'Solidly concentrated launch distribution in veNFT holders and directed emissions through vote-escrow incentives, producing more than $1.6B of first-day TVL according to Fantom. That liquidity arrived before operating stewardship and durable demand were proven. Cronje’s departure then exposed key-person and governance continuity risk. The evidence supports rapid launch, exit shock, and historical status; the conclusion that mercenary liquidity and stewardship fragility jointly prevented durability is a causal inference, not a measured attribution.',
      whySources: ['solidly-fantom-launch', 'solidly-cronje-exit', 'solidly-history'],
      choices: [
        {
          decision: 'Bootstrap liquidity through a veNFT distribution to established Fantom protocols and vote-directed emissions.',
          consequence: 'The launch acquired extraordinary TVL quickly, but incentives and voting power arrived before durable trader demand and operating accountability were demonstrated.',
          confidence: 'high',
          source_refs: ['solidly-fantom-launch'],
        },
        {
          decision: 'Tie SOLID emissions and fee direction to vote-escrow governance.',
          consequence: 'The token coordinated pool incentives and fee claims, while making venue economics dependent on emission design, voting markets, and token confidence.',
          source_refs: ['solidly-fantom-launch'],
        },
        {
          decision: 'Launch around a highly visible individual builder without a clearly evidenced succession structure.',
          consequence: 'The public exit created an immediate confidence and stewardship shock even though deployed code and later design descendants could continue.',
          source_refs: ['solidly-cronje-exit', 'solidly-history'],
        },
        {
          decision: 'Ship the original deployment rapidly into production.',
          consequence: 'Speed captured attention and capital, but compressed the period available to prove governance, maintenance, and organic product-market fit.',
          source_refs: ['solidly-fantom-launch', 'solidly-history'],
        },
      ],
      counterfactual: 'A capped launch, transparent multi-party stewardship, slower emissions, and published succession plan could have tested organic volume before billions in incentive-sensitive TVL accumulated. The design’s survival in successors suggests the mechanism was not inherently unusable, but does not show the original deployment could have recovered.',
      counterfactualSources: ['solidly-fantom-launch', 'solidly-cronje-exit', 'solidly-history'],
      watch: [
        {
          signal: 'Any current official maintenance or migration notice for the original Fantom contracts.',
          implication: 'A verified operator and active migration could change the original-deployment status; successor activity alone cannot.',
          source_refs: ['solidly-history'],
        },
        {
          signal: 'Successor venues’ organic fees relative to emissions and vote incentives.',
          implication: 'Those data can test whether the design generates demand after subsidies, without retroactively changing Solidly’s outcome.',
          source_refs: ['solidly-fantom-launch', 'solidly-history'],
        },
        {
          signal: 'Governance and admin-control ownership for the historical deployment.',
          implication: 'Resolved control would clarify whether the original contracts are abandoned, immutable, or recoverable.',
          source_refs: ['solidly-history'],
        },
      ],
      unknowns: [
        'What portion of launch TVL was retained after incentives and founder attention declined?',
        'Who, if anyone, controls or maintains the original deployment today?',
        'What fees, users, and volumes were organic rather than incentive-driven?',
        'Which liabilities or migration commitments remained when stewardship changed?',
      ],
      nextReview: '2026-10-29',
    }),
  },
  {
    table: 'mid_exchanges',
    kind: 'dex',
    lifecycle: 'mid',
    slug: 'spiritswap',
    replace_profile: {
      status: 'rescued_declining',
      timeline: {
        planned_shutdown: '2023-08',
        rescue: 'announced before planned closure',
        current_surface_checked: '2026-07-29',
      },
      boundary: 'A resolving first-party product surface supports operating continuity, not verified liquidity, revenue, trade execution, or team solvency.',
    },
    row_patch: {
      metric_label: 'Current operating surface',
      metric_type: 'operational_status',
      metric_unit: 'status',
      metric: null,
      verdict: 'declining',
      summary: 'SpiritSwap announced a planned 2023 shutdown after Multichain-related treasury damage, then reported a rescue and transfer to a new team. On July 29, 2026, its first-party Fantom surface still advertised swap, liquidity, farms, bridge, and inSPIRIT functions. That supports a rescued, live-but-declining classification; it does not verify current trade execution, TVL, fees, users, or solvency.',
      outlook: 'The venue remains chain- and bridge-concentrated and lacks a verified current activity baseline. Reclassify only from dated onchain usage, accountable-team releases, and functioning governance or liquidity evidence.',
    },
    sources: [
      source('spiritswap-current', 'SpiritSwap — Fantom DEX', 'SpiritSwap', 'https://www.spiritswap.finance/'),
      source('spiritswap-swap', 'SpiritSwap Swap', 'SpiritSwap', 'https://www.spiritswap.finance/chain/ftm/swap'),
      source('spiritswap-inspirit', 'SpiritSwap inSPIRIT', 'SpiritSwap', 'https://www.spiritswap.finance/chain/ftm/inspirit'),
      source('spiritswap-rescue', 'Fantom DEX rescued at eleventh hour following planned shutdown', 'Cointelegraph', 'https://cointelegraph.com/news/fantom-dex-rescued-at-eleventh-hour-following-planned-shutdown', 'independent-reporting'),
    ],
    forensic_analysis: analysis({
      label: 'declining',
      asOf: '2026-07-29',
      outcome: 'SpiritSwap is a rescued, declining Fantom DEX—not a dead venue. Independent reporting documents the planned 2023 shutdown and rescue, while the current first-party surface still advertises core products. Neither source set establishes meaningful present liquidity, successful swaps, fees, or a financially durable operator.',
      outcomeSources: ['spiritswap-current', 'spiritswap-swap', 'spiritswap-inspirit', 'spiritswap-rescue'],
      why: 'The venue concentrated product and treasury exposure on Fantom and bridged assets, then suffered when the Multichain crisis impaired treasury resources. A last-minute team handoff avoided immediate closure, preserving the product surface. The strategic lesson is not simply that a hack killed a DEX: treasury concentration and bridge dependence turned external infrastructure failure into an existential operating crisis, while transferability of the code and community created a recovery option.',
      whySources: ['spiritswap-rescue', 'spiritswap-current', 'spiritswap-inspirit'],
      choices: [
        {
          decision: 'Concentrate the venue, treasury, and community identity on Fantom.',
          consequence: 'SpiritSwap gained ecosystem fit but had fewer distribution and treasury alternatives when a critical Fantom bridge failed.',
          source_refs: ['spiritswap-rescue', 'spiritswap-current'],
        },
        {
          decision: 'Use SPIRIT and vote-escrowed inSPIRIT for incentives and governance.',
          consequence: 'The token linked users to fees and voting, while adding dependence on continuing emissions, locks, liquidity, and an active governance operator.',
          confidence: 'high',
          source_refs: ['spiritswap-inspirit'],
        },
        {
          decision: 'Depend materially on Multichain-linked treasury assets and bridge infrastructure.',
          consequence: 'An external bridge crisis impaired operating runway and triggered the announced shutdown plan.',
          confidence: 'high',
          source_refs: ['spiritswap-rescue'],
        },
        {
          decision: 'Transfer control to a rescue team rather than close the protocol.',
          consequence: 'The venue retained a public interface and possible continuity, but the handoff did not itself prove usage, liquidity, or sustainable funding.',
          source_refs: ['spiritswap-rescue', 'spiritswap-current'],
        },
      ],
      counterfactual: 'A diversified stable treasury, explicit bridge-risk caps, and multi-chain distribution could have reduced the Multichain shock. Closing in 2023 would have eliminated operating ambiguity but also the rescue option; the evidence does not show whether the handoff preserved meaningful economic activity.',
      counterfactualSources: ['spiritswap-rescue', 'spiritswap-current'],
      watch: [
        {
          signal: 'Successful current swap transactions, TVL, fees, and unique users on verified SpiritSwap contracts.',
          implication: 'Sustained activity would support recovery; an interface without transactions would support further decline.',
          source_refs: ['spiritswap-swap', 'spiritswap-current'],
        },
        {
          signal: 'Dated rescue-team releases and identified control of contracts, treasury, and governance.',
          implication: 'Accountable stewardship would strengthen continuity; silent or unclear control increases abandonment risk.',
          source_refs: ['spiritswap-rescue', 'spiritswap-current'],
        },
        {
          signal: 'inSPIRIT locking, voting, fee distribution, and bridge availability.',
          implication: 'Working token and bridge functions would test whether the advertised product remains operational.',
          source_refs: ['spiritswap-inspirit', 'spiritswap-current'],
        },
      ],
      unknowns: [
        'What current TVL, volume, fees, transactions, and unique wallets belong to verified SpiritSwap contracts?',
        'Who currently controls the treasury, upgrade keys, front end, and governance process?',
        'What liabilities or commitments survived the 2023 handoff?',
        'Are SPIRIT and inSPIRIT benefits functioning and economically material?',
      ],
      nextReview: '2026-08-05',
    }),
  },
  {
    table: 'dead_exchanges',
    kind: 'dex',
    lifecycle: 'dead',
    slug: 'waultswap',
    replace_profile: {
      status: 'failed_original_waultswap_wusd_scope',
      scope: 'This record covers the original WaultSwap and WUSD-linked mechanism. It does not claim that every historical Wault Finance contract is inactive.',
    },
    sources: [
      source('wault-slowmist', 'An Analysis of the Attack on Wault Finance', 'SlowMist', 'https://slowmist.medium.com/slowmist-an-analysis-of-the-attack-on-wault-finance-5874100b3b73', 'security-research'),
      source('wault-knownsec', 'Wault Finance Flash Loan Security Incident Analysis', 'Knownsec Blockchain Lab', 'https://medium.com/@Knownsec_Blockchain_Lab/wault-finance-flash-loan-security-incident-analysis-368a2e1ebb5b', 'security-research'),
      source('wault-slowmist-index', 'Wault Finance security incident', 'SlowMist Hacked', 'https://hacked.slowmist.io/?c=BSC&page=18', 'security-database'),
    ],
    forensic_analysis: analysis({
      label: 'failed',
      asOf: '2026-07-29',
      outcome: 'The original WaultSwap and WUSD-linked product is classified failed because security researchers document an exploitable economic-design flaw and loss. No reviewed primary operator source establishes a current recovery, supported successor, or live operating baseline, so broader present-tense claims are withheld.',
      outcomeSources: ['wault-slowmist', 'wault-knownsec', 'wault-slowmist-index'],
      why: 'Wault embedded a spot AMM inside a wider token and stablecoin system whose WUSDMaster and WEX subsidy mechanics could be manipulated with flash liquidity. The incident evidence attributes the exploit to economic-model design, not merely a stolen key. Coupling the exchange, WUSD minting, and WEX incentives made one mechanism failure capable of harming both product confidence and token economics; the record cannot quantify how much that event versus later operator choices caused final inactivity.',
      whySources: ['wault-slowmist', 'wault-knownsec', 'wault-slowmist-index'],
      choices: [
        {
          decision: 'Connect WaultSwap liquidity to the WUSD stablecoin and WEX subsidy mechanism.',
          consequence: 'The integrated design could bootstrap liquidity, but a flaw in one component transmitted risk into the exchange and token system.',
          confidence: 'high',
          source_refs: ['wault-slowmist', 'wault-knownsec'],
        },
        {
          decision: 'Permit flash-liquidity interactions with the economic mechanism.',
          consequence: 'Atomic capital made the design composable but also allowed an attacker to amplify a pricing or accounting weakness within one transaction.',
          confidence: 'high',
          source_refs: ['wault-slowmist', 'wault-knownsec'],
        },
        {
          decision: 'Use WEX as a central incentive and subsidy asset.',
          consequence: 'Token incentives tied product adoption to WEX confidence and supply dynamics rather than isolating exchange usage from protocol-token stress.',
          source_refs: ['wault-slowmist'],
        },
      ],
      counterfactual: 'Staged caps, independent invariant testing, oracle-resistant accounting, and isolation between swap pools and WUSD minting could have reduced loss and contagion. The reviewed post-incident record is too thin to show that technical remediation alone would have produced durable demand.',
      counterfactualSources: ['wault-slowmist', 'wault-knownsec'],
      watch: [
        {
          signal: 'A resolving operator notice identifying supported contracts, redemptions, or final closure.',
          implication: 'Primary lifecycle evidence could replace the current failed-product scope with a dated recovered or dead status.',
          source_refs: ['wault-slowmist-index'],
        },
        {
          signal: 'Verified current liquidity, transactions, fees, and contract ownership.',
          implication: 'Material use would challenge an inactivity assumption; absent data keeps current operation unknown.',
          source_refs: ['wault-slowmist', 'wault-knownsec'],
        },
        {
          signal: 'Documented compensation and WUSD or WEX resolution.',
          implication: 'A complete settlement would clarify residual customer and token-holder exposure.',
          source_refs: ['wault-slowmist-index'],
        },
      ],
      unknowns: [
        'Which original Wault contracts remain callable and which are supported?',
        'What users, liquidity, fees, and token liabilities remain?',
        'Were affected users fully compensated or migrated?',
        'Which governance or admin keys remain active and who controls them?',
      ],
      nextReview: '2026-10-29',
    }),
  },
  {
    table: 'successful_exchanges',
    kind: 'cex',
    lifecycle: 'successful',
    slug: 'binance',
    sources: [
      source('binance-2025-report', 'Binance 2025 End-of-Year Report', 'Binance', 'https://www.prnewswire.com/in/news-releases/binances-2025-end-of-year-report-trust-liquidity-and-web3-discovery-302657209.html'),
      source('binance-bnb', 'What Is BNB?', 'Binance Academy', 'https://academy.binance.com/en/articles/what-is-bnb'),
      source('binance-por', 'Proof of Reserves', 'Binance', 'https://www.binance.com/en/proof-of-reserves'),
    ],
    forensic_analysis: analysis({
      label: 'successful',
      asOf: '2025-12-31',
      outcome: 'Binance is a successful scale control because its issuer report states $34T of 2025 all-product volume and 300M users. Those are operator-defined figures, not independent spot volume, audited profitability, a solvency conclusion, or a jurisdiction-wide regulatory endorsement.',
      outcomeSources: ['binance-2025-report'],
      why: 'Binance paired broad global distribution and a wide product suite with deep liquidity and the BNB ecosystem. The observed scale, token utility, and reserve-disclosure surface coexist with success; it remains an inference that any one caused it. Proof of reserves shows selected asset balances and coverage methodology, not all liabilities or corporate solvency.',
      whySources: ['binance-2025-report', 'binance-bnb', 'binance-por'],
      choices: [
        {
          decision: 'Build a global multi-product venue rather than a narrow spot exchange.',
          consequence: 'Users could remain inside one platform across trading and Web3 discovery, increasing distribution leverage while expanding operational and regulatory complexity.',
          source_refs: ['binance-2025-report'],
        },
        {
          decision: 'Launch BNB and expand it from fee utility into a broader chain ecosystem.',
          consequence: 'BNB created retention and ecosystem coordination, but venue and token risks became partially coupled and token success does not prove exchange profitability.',
          confidence: 'high',
          source_refs: ['binance-bnb'],
        },
        {
          decision: 'Publish a proof-of-reserves interface.',
          consequence: 'Users gain an asset-backing checkpoint, while omitted liabilities, entity boundaries, and audit scope prevent a full solvency inference.',
          confidence: 'high',
          source_refs: ['binance-por'],
        },
      ],
      counterfactual: 'A narrow, single-jurisdiction spot strategy could reduce operational and regulatory surface area but sacrifice product breadth, token-network effects, and global distribution. The evidence cannot quantify the marginal contribution of BNB versus liquidity, brand, pricing, or geography.',
      counterfactualSources: ['binance-2025-report', 'binance-bnb', 'binance-por'],
      watch: [
        {
          signal: 'Independent spot and derivatives liquidity alongside the operator’s all-product metric.',
          implication: 'Agreement would strengthen the scale thesis; divergence would expose definition or concentration risk.',
          source_refs: ['binance-2025-report'],
        },
        {
          signal: 'Proof-of-reserves scope, frequency, entity coverage, and liability treatment.',
          implication: 'Broader independently tested coverage would strengthen custody evidence without eliminating counterparty risk.',
          source_refs: ['binance-por'],
        },
        {
          signal: 'BNB utility changes and jurisdiction-specific service restrictions.',
          implication: 'Reduced utility or distribution could weaken the ecosystem flywheel attributed to the venue.',
          source_refs: ['binance-bnb', 'binance-2025-report'],
        },
      ],
      unknowns: [
        'What share of reported volume is spot, derivatives, internal, or incentive-driven?',
        'What are audited revenue, profitability, complete liabilities, and entity-level capital?',
        'How much user retention is attributable to BNB rather than liquidity and price?',
        'How concentrated are users and revenue by jurisdiction and product?',
      ],
      nextReview: '2026-08-05',
    }),
  },
  {
    table: 'successful_exchanges',
    kind: 'cex',
    lifecycle: 'successful',
    slug: 'coinbase',
    sources: [
      source('coinbase-10k', 'Coinbase 2025 Form 10-K', 'U.S. Securities and Exchange Commission', 'https://www.sec.gov/Archives/edgar/data/1679788/000167978826000015/coin-20251231.htm', 'regulatory-filing'),
      source('coinbase-letter', 'Coinbase Q4 and Full-Year 2025 Shareholder Letter', 'U.S. Securities and Exchange Commission', 'https://www.sec.gov/Archives/edgar/data/1679788/000167978826000011/q425shareholderletter.htm', 'regulatory-filing'),
    ],
    forensic_analysis: analysis({
      label: 'successful',
      asOf: '2025-12-31',
      outcome: 'Coinbase is a successful public-company control: its SEC filing reports $1.221T of 2025 trading volume and documents a continuing retail, institutional, custody, and infrastructure business. The figure uses Coinbase’s definition and is not a current spot-only or profitability metric.',
      outcomeSources: ['coinbase-10k', 'coinbase-letter'],
      why: 'Coinbase chose regulated public-market access, compliance-heavy distribution, and a broad product portfolio spanning retail and institutional users. Those mechanisms plausibly widen trust and revenue channels, but the filings show coexistence rather than causal attribution. The scoped centralized venue has no identified venue token, so value capture is corporate revenue rather than token-holder rights; Base and wallet products remain distinct.',
      whySources: ['coinbase-10k', 'coinbase-letter'],
      choices: [
        {
          decision: 'Operate as a publicly reporting U.S. company with SEC-filed risk and financial disclosures.',
          consequence: 'Disclosure and governance can expand institutional access, while adding compliance cost, legal exposure, and quarterly-market pressure.',
          confidence: 'high',
          source_refs: ['coinbase-10k'],
        },
        {
          decision: 'Serve retail, institutional, custody, and infrastructure customers rather than rely on one trading product.',
          consequence: 'Product breadth diversifies distribution and revenue, but makes company-wide volume an imperfect measure of the centralized venue alone.',
          source_refs: ['coinbase-10k', 'coinbase-letter'],
        },
        {
          decision: 'Avoid a centralized-exchange utility token while separately building Base and wallet products.',
          consequence: 'Venue value capture stays with the company and fees, reducing token reflexivity but foregoing a native loyalty or governance asset.',
          source_refs: ['coinbase-10k'],
        },
      ],
      counterfactual: 'An offshore derivatives-first or venue-token strategy could accelerate product breadth and incentives but conflict with Coinbase’s disclosure and compliance posture. The filings cannot isolate how much scale came from regulation, brand, custody, pricing, product design, or crypto-market beta.',
      counterfactualSources: ['coinbase-10k', 'coinbase-letter'],
      watch: [
        {
          signal: 'Filed trading volume, transaction revenue, subscription revenue, and institutional activity.',
          implication: 'A stable mix would support diversified durability; renewed fee concentration would increase cycle sensitivity.',
          source_refs: ['coinbase-10k', 'coinbase-letter'],
        },
        {
          signal: 'Regulatory proceedings, custody disclosures, and capital requirements.',
          implication: 'Changes can alter distribution advantages and operating costs without immediately appearing in volume.',
          source_refs: ['coinbase-10k'],
        },
        {
          signal: 'Separation of centralized venue metrics from Base and wallet activity.',
          implication: 'Cleaner segmentation would improve causal comparison with other CEXs.',
          source_refs: ['coinbase-10k', 'coinbase-letter'],
        },
      ],
      unknowns: [
        'What current volume is independently measured and spot-only?',
        'What share of customer acquisition and retention comes from compliance posture?',
        'How profitable is each venue, custody, subscription, and infrastructure cohort?',
        'How much Base and wallet distribution feeds the centralized exchange?',
      ],
      nextReview: '2026-08-05',
    }),
  },
  {
    table: 'successful_exchanges',
    kind: 'cex',
    lifecycle: 'successful',
    slug: 'kraken',
    sources: [
      source('kraken-2025', 'Kraken 2025 Financials', 'Kraken', 'https://blog.kraken.com/news/kraken-2025-financials'),
      source('kraken-por', 'Proof of Reserves', 'Kraken', 'https://www.kraken.com/gb/proof-of-reserves?rel=outbound'),
    ],
    forensic_analysis: analysis({
      label: 'successful',
      asOf: '2025-12-31',
      outcome: 'Kraken is a successful scale-and-survival control: the operator reports $2T of 2025 platform transaction volume, $48.2B in assets, and 5.7M funded accounts. These platform-wide figures are not spot-only volume, audited profitability, or proof of complete solvency.',
      outcomeSources: ['kraken-2025'],
      why: 'Kraken combined a long operating history with retail and institutional products and recurring proof-of-reserves reporting. Longevity, funded accounts, and product breadth plausibly support trust and distribution, but the reviewed sources do not isolate causality. Kraken has no identified venue token in this record, so token speculation is not used to explain its result.',
      whySources: ['kraken-2025', 'kraken-por'],
      choices: [
        {
          decision: 'Build both retail and institutional exchange products over a long operating period.',
          consequence: 'Multiple customer channels expand distribution and asset scale while increasing product and compliance complexity.',
          source_refs: ['kraken-2025'],
        },
        {
          decision: 'Publish recurring proof-of-reserves results with customer-verification tooling.',
          consequence: 'The process offers an asset-and-liability checkpoint for covered balances, but remains narrower than a full financial audit or solvency guarantee.',
          confidence: 'high',
          source_refs: ['kraken-por'],
        },
        {
          decision: 'Operate without an identified exchange utility token.',
          consequence: 'Customer acquisition depends more directly on product, trust, liquidity, and pricing, while the venue forgoes token-based loyalty and financing.',
          source_refs: ['kraken-2025'],
        },
      ],
      counterfactual: 'A token-led or rapid offshore-derivatives strategy might create faster incentives but add reflexive token and jurisdiction risk. The evidence does not separate the contribution of longevity, reserve reporting, product quality, acquisitions, pricing, or market conditions.',
      counterfactualSources: ['kraken-2025', 'kraken-por'],
      watch: [
        {
          signal: 'Platform volume, assets, funded accounts, and product-specific activity in later reports.',
          implication: 'Sustained multi-metric growth would support durability; volume without funded-account or asset retention would weaken it.',
          source_refs: ['kraken-2025'],
        },
        {
          signal: 'Proof-of-reserves dates, coverage ratios, covered assets, and user verification.',
          implication: 'Frequent broad coverage strengthens custody transparency without replacing financial statements.',
          source_refs: ['kraken-por'],
        },
        {
          signal: 'Regulatory access and fee compression across retail and institutional products.',
          implication: 'Distribution or margin deterioration could change the success classification before platform volume disappears.',
          source_refs: ['kraken-2025'],
        },
      ],
      unknowns: [
        'What portion of platform transaction volume is spot, derivatives, or non-exchange activity?',
        'What complete liabilities and corporate capital sit outside reserve snapshots?',
        'What are audited revenue, profitability, and cohort retention?',
        'Which product and geography contribute most to durable users?',
      ],
      nextReview: '2026-08-05',
    }),
  },
  {
    table: 'successful_exchanges',
    kind: 'cex',
    lifecycle: 'successful',
    slug: 'bybit',
    sources: [
      source('bybit-scale', 'Bybit Unveils 2025 Vision', 'Bybit', 'https://www.bybit.com/en/press/post/bybit-unveils-2025-vision-a-user-centric-approach-to-crypto-innovation-blt02b02bc45c5a067d'),
      source('bybit-recovery', 'Fully Backed Within 72 Hours: Bybit Maintains 1:1 Customer Assets Ratio', 'Bybit', 'https://www.bybit.com/en/press/post/fully-backed-within-72-hours-bybit-maintains-1-1-customer-assets-ratio-in-latest-proof-of-reserves-audited-report-by-hacken-bltb767a9461133831f'),
      source('bybit-por-current', 'Proof of Reserves', 'Bybit', 'https://www.bybit.com/app/user/proof-of-reserve'),
    ],
    forensic_analysis: analysis({
      label: 'successful',
      asOf: '2026-07-22',
      outcome: 'Bybit is a successful-with-stress control: the operator reported $36B average daily volume and 60M users for 2024, then continued publishing reserve evidence after a major incident. These issuer-defined measures do not establish current independent volume, audited profitability, or complete solvency.',
      outcomeSources: ['bybit-scale', 'bybit-recovery', 'bybit-por-current'],
      why: 'Bybit used a derivatives-led global product suite and aggressive distribution to build scale, then made rapid incident recovery and reserve communication central to retaining trust. The sources support reported scale and post-incident reserve claims; attributing survival to speed, liquidity, or communication remains an inference. No venue token is identified in the reviewed evidence.',
      whySources: ['bybit-scale', 'bybit-recovery', 'bybit-por-current'],
      choices: [
        {
          decision: 'Build around high-frequency derivatives while expanding spot and adjacent products.',
          consequence: 'The venue attracted active traders and cross-product users but assumed liquidation, custody, leverage, and regulatory risk.',
          source_refs: ['bybit-scale'],
        },
        {
          decision: 'Restore and publicly document asset backing rapidly after a major security incident.',
          consequence: 'Fast recovery reduced immediate customer-loss uncertainty, while operator and attestation claims remain narrower than complete audited solvency.',
          confidence: 'high',
          source_refs: ['bybit-recovery', 'bybit-por-current'],
        },
        {
          decision: 'Use periodic proof-of-reserves rather than rely only on brand assurances.',
          consequence: 'Covered customer assets become independently checkable to a degree, but entity liabilities and corporate capital remain outside the narrow reserve claim.',
          confidence: 'high',
          source_refs: ['bybit-por-current'],
        },
      ],
      counterfactual: 'A slower, geographically narrow spot-only strategy could reduce leverage and regulatory complexity but sacrifice the derivatives distribution that built Bybit’s scale. After the incident, delayed recapitalization or opaque communication plausibly would have increased run risk, though the reviewed sources cannot prove the counterfactual.',
      counterfactualSources: ['bybit-scale', 'bybit-recovery', 'bybit-por-current'],
      watch: [
        {
          signal: 'Current independent liquidity and volume by spot and derivatives product.',
          implication: 'Independent confirmation would strengthen the scale thesis and reveal whether incident recovery retained traders.',
          source_refs: ['bybit-scale'],
        },
        {
          signal: 'Reserve reports, covered liabilities, asset concentration, and incident remediation.',
          implication: 'Sustained coverage supports custody confidence; narrowing scope or stale reports would weaken it.',
          source_refs: ['bybit-recovery', 'bybit-por-current'],
        },
        {
          signal: 'Legal availability and product restrictions by jurisdiction.',
          implication: 'Distribution loss could erode the derivatives-led flywheel even if the platform remains technically active.',
          source_refs: ['bybit-scale'],
        },
      ],
      unknowns: [
        'What is current independently measured spot and derivatives volume?',
        'What complete liabilities, insurance, and corporate capital sit outside reserve reports?',
        'What user and asset retention followed the security incident?',
        'Which geographies and products drive contribution margin?',
      ],
      nextReview: '2026-08-05',
    }),
  },
  {
    table: 'successful_exchanges',
    kind: 'cex',
    lifecycle: 'successful',
    slug: 'bitstamp',
    sources: [
      source('bitstamp-acquisition', 'Robinhood Completes Acquisition of Bitstamp', 'Robinhood', 'https://robinhood.com/us/en/newsroom/robinhood-completes-acquisition-of-bitstamp/'),
      source('bitstamp-may-data', 'Robinhood Reports May 2026 Operating Data', 'Robinhood Investor Relations', 'https://investors.robinhood.com/static-files/f3595a43-a2df-4874-bca4-8fd10e8bc9f0'),
      source('bitstamp-prudential', 'Bitstamp 2025 Annual Prudential Disclosure Report', 'Bitstamp', 'https://assets.bitstamp.net/msc/BFS_2025_Annual_Prudential_Disclosure_Report_e4b9c23319.pdf'),
    ],
    forensic_analysis: analysis({
      label: 'successful',
      asOf: '2026-05-31',
      outcome: 'Bitstamp is a successful continuity-and-acquisition control: Robinhood completed the acquisition in 2025 and reported $6.3B of Bitstamp crypto volume for May 2026. The monthly figure is acquirer-reported and does not establish profitability, market share, or future independence.',
      outcomeSources: ['bitstamp-acquisition', 'bitstamp-may-data', 'bitstamp-prudential'],
      why: 'Bitstamp chose a narrower regulated spot and institutional identity, accumulated licences and operating history, then joined Robinhood’s distribution and capital base. The acquisition and current monthly volume establish continuity; the inference is that regulatory footprint, institutional relationships, and acquirer distribution supported survival. No venue token is identified, so token value capture is not part of the explanation.',
      whySources: ['bitstamp-acquisition', 'bitstamp-may-data', 'bitstamp-prudential'],
      choices: [
        {
          decision: 'Prioritize a regulated spot and institutional venue with a broad licence footprint.',
          consequence: 'Compliance and institutional access created strategic acquisition value, while limiting some high-risk products and adding fixed costs.',
          source_refs: ['bitstamp-acquisition', 'bitstamp-prudential'],
        },
        {
          decision: 'Sell to Robinhood rather than remain a standalone exchange.',
          consequence: 'The venue gained parent distribution and resources but became dependent on integration quality and group strategy.',
          confidence: 'high',
          source_refs: ['bitstamp-acquisition'],
        },
        {
          decision: 'Operate without an identified venue utility token.',
          consequence: 'Value capture remains in exchange revenue and the parent company, avoiding token reflexivity while forgoing token-based incentives.',
          source_refs: ['bitstamp-acquisition', 'bitstamp-prudential'],
        },
      ],
      counterfactual: 'Remaining independent could preserve strategic control but require Bitstamp to fund product expansion and distribution alone. A derivatives- or token-led strategy might increase volume while weakening the regulated-institutional positioning that made the acquisition attractive.',
      counterfactualSources: ['bitstamp-acquisition', 'bitstamp-may-data', 'bitstamp-prudential'],
      watch: [
        {
          signal: 'Monthly Bitstamp volume, customer assets, revenue, and Robinhood reporting segmentation.',
          implication: 'Sustained activity would validate post-acquisition continuity; disappearing segmentation would reduce observability.',
          source_refs: ['bitstamp-may-data'],
        },
        {
          signal: 'Licence, capital, and prudential disclosures after integration.',
          implication: 'Stable coverage supports institutional access; retrenchment could narrow the venue’s strategic advantage.',
          source_refs: ['bitstamp-prudential', 'bitstamp-acquisition'],
        },
        {
          signal: 'Product and customer migration into Robinhood infrastructure.',
          implication: 'Integration could expand distribution or gradually erase Bitstamp as a separately measurable venue.',
          source_refs: ['bitstamp-acquisition'],
        },
      ],
      unknowns: [
        'What are Bitstamp’s post-acquisition standalone revenue and profitability?',
        'How much May 2026 volume is retail, institutional, spot, or internal routing?',
        'What customers and assets migrated between Bitstamp and Robinhood?',
        'Which licences and operating entities remain independently active?',
      ],
      nextReview: '2026-08-05',
    }),
  },
  {
    table: 'mid_exchanges',
    kind: 'cex',
    lifecycle: 'mid',
    slug: 'bithumb',
    replace_profile: {
      status: 'active_with_control_and_competition_risk',
      scope: 'The venue remains active. Declining-volume figures are third-party reported and are not treated as audited market-share or causal proof.',
      current_risk: 'Korean regulators documented erroneous Bitcoin payments and later inspection findings; final remediation and sanctions outcomes require refresh.',
    },
    sources: [
      source('bithumb-press', 'Bithumb Press Center', 'Bithumb', 'https://feed.bithumb.com/press'),
      source('bithumb-product', 'Bithumb announces service and user-experience changes', 'Bithumb', 'https://feed.bithumb.com/press/1652418'),
      source('bithumb-fsc-incident', 'FSC statement on Bithumb erroneous Bitcoin payment incident', 'Financial Services Commission, Republic of Korea', 'https://www.fsc.go.kr/eng/pr010101/86230', 'regulator'),
      source('bithumb-fsc-inspection', 'FSC inspection findings concerning Bithumb', 'Financial Services Commission, Republic of Korea', 'https://www.fsc.go.kr/eng/pr010101/86638', 'regulator'),
      source('bithumb-volume-report', 'Bithumb Volume Falls in South Korea Q1', 'CryptoRank', 'https://cryptorank.io/news/feed/ffb44-bithumb-volume-falls-south-korea-q1', 'third-party-data'),
    ],
    forensic_analysis: analysis({
      label: 'middling',
      asOf: '2026-07-23',
      outcome: 'Bithumb remains an active Korean exchange with current first-party releases, but is classified middling because third-party reporting describes declining volume and the Korean regulator documented a 2026 erroneous-payment incident and inspection deficiencies. This does not establish insolvency, shutdown, or a regulator-measured market-share trend.',
      outcomeSources: ['bithumb-press', 'bithumb-product', 'bithumb-fsc-incident', 'bithumb-fsc-inspection', 'bithumb-volume-report'],
      why: 'Bithumb’s domestic KRW distribution and long brand history support continued relevance, while market concentration and strong competition limit growth. More importantly, the erroneous Bitcoin allocation exposed internal-control risk in a custodial ledger: the exchange’s product remains live, but operational reliability and regulatory remediation now matter alongside volume. The reported decline is observed by a third party; attribution to competition is a plausible inference rather than a proven cause.',
      whySources: ['bithumb-press', 'bithumb-fsc-incident', 'bithumb-fsc-inspection', 'bithumb-volume-report'],
      choices: [
        {
          decision: 'Concentrate distribution in the regulated Korean-won market.',
          consequence: 'Local fiat access and brand recognition support survival, while country and competitor concentration reduce diversification.',
          source_refs: ['bithumb-press', 'bithumb-volume-report'],
        },
        {
          decision: 'Operate a custodial off-chain ledger with exchange-controlled promotions and allocations.',
          consequence: 'Centralized execution improves convenience but made internal controls capable of generating a material erroneous-payment incident.',
          confidence: 'high',
          source_refs: ['bithumb-fsc-incident', 'bithumb-fsc-inspection'],
        },
        {
          decision: 'Continue product and UX changes while remediation remains under regulatory review.',
          consequence: 'Shipping can protect distribution, but unresolved control findings can increase compliance cost and customer-trust risk.',
          source_refs: ['bithumb-product', 'bithumb-fsc-inspection'],
        },
      ],
      counterfactual: 'Stronger pre-release ledger controls, staged promotional allocations, and independent reconciliation could have reduced the incident risk. Geographic diversification could reduce Korea concentration but add licensing and execution complexity; the sources do not show which strategy would reverse reported volume decline.',
      counterfactualSources: ['bithumb-fsc-incident', 'bithumb-fsc-inspection', 'bithumb-volume-report'],
      watch: [
        {
          signal: 'Final regulatory findings, sanctions, remediation, and independent control assurance.',
          implication: 'Verified remediation would reduce operational-risk weight; recurring deficiencies would support further decline.',
          source_refs: ['bithumb-fsc-incident', 'bithumb-fsc-inspection'],
        },
        {
          signal: 'Official or independently comparable KRW spot volume and market share.',
          implication: 'A consistent series would test whether the reported decline is persistent and competition-driven.',
          source_refs: ['bithumb-volume-report'],
        },
        {
          signal: 'Current product releases, customer access, and withdrawal operations.',
          implication: 'Continued service supports middling rather than dead status; disruption would materially change lifecycle.',
          source_refs: ['bithumb-press', 'bithumb-product'],
        },
      ],
      unknowns: [
        'What is Bithumb’s current independently measured KRW spot market share?',
        'What financial, customer, or capital impact resulted from the erroneous-payment incident?',
        'Which remediation steps and final sanctions were completed?',
        'What are audited revenue, profitability, liabilities, and customer-asset coverage?',
      ],
      nextReview: '2026-08-05',
    }),
  },
  {
    table: 'mid_exchanges',
    kind: 'cex',
    lifecycle: 'mid',
    slug: 'htx',
    replace_profile: {
      status: 'active_with_material_market_access_risk',
      scope: 'HTX remains active and publishes reserve snapshots. The UK designation is a regulator-observed restriction; broad claims about dozens of bans are removed.',
      metric_boundary: 'Q1 2026 volume and decline figures remain third-party estimates, not operator-audited or like-for-like across exchanges.',
    },
    sources: [
      source('htx-uk-designation', 'UK Sanctions List designation RUS3619', 'UK Government', 'https://search-uk-sanctions-list.service.gov.uk/designations/RUS3619/Entity', 'regulator'),
      source('htx-uk-faq', 'UK Financial Sanctions FAQs — HTX and Huobi Global S.A.', 'Office of Financial Sanctions Implementation', 'https://www.gov.uk/government/publications/uk-financial-sanctions-faqs/uk-financial-sanctions-faqs', 'regulator'),
      source('htx-uk-announcement', 'UK cracks down on backdoor Russian sanctions evasion', 'UK Government', 'https://www.gov.uk/government/news/uk-cracks-down-on-backdoor-russian-sanctions-evasion-with-tough-new-measures', 'regulator'),
      source('htx-por', 'HTX Proof of Reserves', 'HTX', 'https://www.htx.com/en-us/proof-of-reserve'),
      source('htx-q1-data', 'Crypto Exchange Report Q1 2026', 'TokenInsight', 'https://tokeninsight.com/en/research/reports/crypto-exchange-report-q1-2026', 'third-party-data'),
    ],
    forensic_analysis: analysis({
      label: 'declining',
      asOf: '2026-07-29',
      outcome: 'HTX is active but declining: its reserve portal remains available, third-party data reports lower Q1 2026 spot volume, and the UK designated Huobi Global S.A.; OFSI states that HTX is subject to those financial sanctions through ownership. This is a material access and compliance event, not proof that HTX is globally shut down or insolvent.',
      outcomeSources: ['htx-uk-designation', 'htx-uk-faq', 'htx-uk-announcement', 'htx-por', 'htx-q1-data'],
      why: 'HTX retained a broad multi-product platform and token-linked ecosystem, but its distribution strategy spans jurisdictions with divergent compliance requirements. The UK designation converts jurisdiction risk into a concrete access and counterparty constraint. Reported volume decline is consistent with pressure but cannot be attributed solely to sanctions, product quality, competition, or HT token economics from the reviewed evidence.',
      whySources: ['htx-uk-designation', 'htx-uk-faq', 'htx-uk-announcement', 'htx-por', 'htx-q1-data'],
      choices: [
        {
          decision: 'Operate a global multi-product custodial venue across legally divergent markets.',
          consequence: 'Broad reach supports liquidity and user acquisition, while sanctions or licensing action in one jurisdiction can impair banking, apps, counterparties, and reputation elsewhere.',
          source_refs: ['htx-uk-designation', 'htx-uk-faq', 'htx-uk-announcement'],
        },
        {
          decision: 'Use a venue token as part of exchange utility and incentives.',
          consequence: 'Token utility can support retention, but current value capture and token-to-venue dependence are not field-verified in this source set.',
          source_refs: ['htx-por'],
        },
        {
          decision: 'Publish recurring proof-of-reserves snapshots during regulatory stress.',
          consequence: 'The portal provides an asset-backing checkpoint for covered balances but does not resolve sanctions exposure or prove complete solvency.',
          confidence: 'high',
          source_refs: ['htx-por'],
        },
      ],
      counterfactual: 'Earlier jurisdictional ring-fencing, counterpart screening, and transparent entity boundaries might have reduced sanctions exposure, but the regulator sources do not establish which operating decisions produced the designation. A narrow licensed-market strategy could reduce reach and liquidity while improving predictability.',
      counterfactualSources: ['htx-uk-designation', 'htx-uk-faq', 'htx-uk-announcement', 'htx-por'],
      watch: [
        {
          signal: 'Changes to the UK designation and documented service or counterparty restrictions.',
          implication: 'Removal or expansion would materially change the venue’s market-access risk.',
          source_refs: ['htx-uk-designation', 'htx-uk-faq', 'htx-uk-announcement'],
        },
        {
          signal: 'Independent comparable volume and liquidity after Q1 2026.',
          implication: 'Continued decline would support structural pressure; stabilization would weaken that inference.',
          source_refs: ['htx-q1-data'],
        },
        {
          signal: 'Reserve-report freshness, scope, and liability coverage.',
          implication: 'Current broad coverage supports custody transparency but cannot offset legal access risk alone.',
          source_refs: ['htx-por'],
        },
      ],
      unknowns: [
        'What share of HTX users, revenue, and counterparties is affected by the UK designation?',
        'What is current independently measured spot and derivatives volume?',
        'What complete liabilities and corporate capital sit outside reserve snapshots?',
        'What current role and value capture does the venue token provide?',
      ],
      nextReview: '2026-08-05',
    }),
  },
  {
    table: 'dead_exchanges',
    kind: 'cex',
    lifecycle: 'dead',
    slug: 'bitmex',
    row_patch: {
      metric_label: 'Announced platform sunset date',
      metric_type: 'operations_cease_date',
      metric_unit: 'date',
      verdict: 'wind_down_announced',
      summary: 'BitMEX announced that its exchange will close on September 23, 2026 at 04:00 UTC following a board strategic review. New positions stop under tighter risk limits on August 26, and users retain post-closure login and withdrawal access. The operator did not identify insolvency, regulatory penalties, market-share loss, or a failed sale as the cause.',
      outlook: 'Operating during an announced wind-down, not already dead. Verify August 26 risk-limit execution, September 23 cessation, remaining withdrawals, and any later statement that provides a more specific cause.',
    },
    sources: [
      source('bitmex-closure', 'Important Message from BitMEX', 'BitMEX', 'https://www.bitmex.com/blog/bitmex-closure'),
    ],
    forensic_analysis: analysis({
      label: 'declining',
      asOf: '2026-07-23',
      outcome: 'BitMEX is in an operator-confirmed wind-down, not yet dead: exchange closure is scheduled for September 23, 2026, new-position risk limits begin August 26, and withdrawals remain available after closure. The announcement does not establish insolvency or customer loss.',
      outcomeSources: ['bitmex-closure'],
      why: 'The board states only that a strategic review of the business and broader crypto industry led to closure. BitMEX’s historical derivatives innovation and BMEX token did not prevent the decision, but the notice supplies no evidence that regulation, competition, token design, security, reserves, or profitability was the decisive cause. Honest causal analysis therefore stops at board choice and product wind-down mechanics.',
      whyConfidence: 'high',
      whySources: ['bitmex-closure'],
      choices: [
        {
          decision: 'Build the venue around professional crypto derivatives and the perpetual swap.',
          consequence: 'BitMEX created a category-defining product, while the operator’s notice does not explain why that historical advantage ceased to support continued operation.',
          confidence: 'high',
          source_refs: ['bitmex-closure'],
        },
        {
          decision: 'Launch BMEX after the core exchange product and use it for platform rewards and utility.',
          consequence: 'The token added an exchange-linked asset, but it is being unstaked during closure and did not create a contractual right to continued operations.',
          confidence: 'high',
          source_refs: ['bitmex-closure'],
        },
        {
          decision: 'Use an orderly two-stage wind-down with risk limits, forced position closure, and post-closure withdrawals.',
          consequence: 'The schedule reduces open-market and custody transition risk, while users still face execution, fee, phishing, and withdrawal-processing risk.',
          confidence: 'high',
          source_refs: ['bitmex-closure'],
        },
      ],
      counterfactual: 'Continuing, selling, narrowing, or restructuring the venue may have been alternatives, but the operator provides no decision record with economics or rejected options. Any claim that one specific regulatory, competitive, or balance-sheet change would have prevented closure would exceed the evidence.',
      counterfactualSources: ['bitmex-closure'],
      watch: [
        {
          signal: 'August 26 risk limits and close-only operation.',
          implication: 'Execution as announced supports an orderly-wind-down classification; deviation could increase customer and market risk.',
          source_refs: ['bitmex-closure'],
        },
        {
          signal: 'September 23 exchange cessation and continuing withdrawal access.',
          implication: 'Verified cessation would move the product from announced wind-down to closed; unresolved balances would require separate analysis.',
          source_refs: ['bitmex-closure'],
        },
        {
          signal: 'A later board, filing, regulator, or administrator statement explaining the strategic review.',
          implication: 'Primary causal evidence could replace current unknowns without relying on analyst speculation.',
          source_refs: ['bitmex-closure'],
        },
      ],
      unknowns: [
        'What financial and strategic evidence drove the board’s review?',
        'What customer balances and positions will remain at each deadline?',
        'What happens to BMEX utility and any related obligations after closure?',
        'Will all covered withdrawals be completed and independently verified?',
      ],
      nextReview: '2026-08-05',
    }),
  },
  {
    table: 'dead_exchanges',
    kind: 'cex',
    lifecycle: 'dead',
    slug: 'bitmart',
    replace_profile: {
      status: 'wind_down_announced',
      announcement_date: '2026-07-26',
      phase_out: {
        new_registrations_deposits_and_orders: 'phased from 2026-07-26T01:30:00Z',
        trading_ends: '2026-08-26T01:00:00Z',
        platform_operations_end: '2027-01-31T15:59:00Z',
      },
      cause_status: 'Operator cited operating conditions, market environment, and strategic direction without specific attribution.',
      analyst_boundary: 'No insolvency, customer-loss, regulatory-cause, executive-misconduct, or token-crash cause is asserted from the reviewed primary notice.',
    },
    row_patch: {
      metric_label: 'Announced platform termination date',
      metric_type: 'operations_cease_date',
      metric_unit: 'date',
      verdict: 'wind_down_announced',
      summary: 'BitMart’s July 26, 2026 notice confirms an orderly wind-down after a general review of operating conditions, market environment, and strategy. Registrations, deposits, and new orders began phasing out immediately; trading ends August 26, 2026 and platform operations are scheduled to cease January 31, 2027. The notice does not establish insolvency, customer loss, a regulatory cause, or internal wrongdoing.',
      outlook: 'Operating in a phased wind-down, not already closed. Withdrawals remain available but may face manual compliance or security review. Verify each deadline and do not convert delays, rumors, token moves, or personnel claims into causality without primary evidence.',
    },
    sources: [
      source('bitmart-closure', 'Important Notice Regarding the Orderly Cessation of BitMart Operations', 'BitMart', 'https://www.bitmart.com/en-US/support/articles/7922665245339/39162120325403/53544595916059'),
      source('bitmart-controls', 'BitMart Statement on Recent Risk Controls and Asset Transparency', 'BitMart', 'https://www.bitmart.com/en-US/support/articles/7922665245339/39162120325403/50773623099035'),
    ],
    forensic_analysis: analysis({
      label: 'declining',
      asOf: '2026-07-26',
      outcome: 'BitMart is in an operator-confirmed phased wind-down, not already dead. Trading is scheduled to stop August 26, 2026 and platform operations January 31, 2027; withdrawals remain available subject to review. The notice does not prove insolvency, customer loss, or a regulatory shutdown.',
      outcomeSources: ['bitmart-closure'],
      why: 'BitMart attributes the decision only to an evaluation of operating conditions, market environment, and future strategic direction. Its multi-product custodial model and BMX token created product breadth and exchange-linked incentives, but neither the closure notice nor the separate risk-control statement identifies those features as the cause. The correct causal conclusion is unresolved management strategy under a formal wind-down schedule.',
      whyConfidence: 'high',
      whySources: ['bitmart-closure', 'bitmart-controls'],
      choices: [
        {
          decision: 'Operate a broad custodial platform spanning spot, futures, automation, earn, staking, lending, and launch products.',
          consequence: 'Product breadth widened distribution and obligations; the closure plan must unwind multiple product and settlement paths rather than only stop spot matching.',
          confidence: 'high',
          source_refs: ['bitmart-closure'],
        },
        {
          decision: 'Use BMX as an exchange-linked token.',
          consequence: 'The token connected users to the venue, but the primary notice provides no verified treatment beyond the broader product wind-down and no evidence that BMX caused closure.',
          source_refs: ['bitmart-closure'],
        },
        {
          decision: 'Phase out orders and products before a later final platform termination.',
          consequence: 'The staged process creates time for settlement and withdrawals, while manual review and separate product notices create timing and execution uncertainty.',
          confidence: 'high',
          source_refs: ['bitmart-closure'],
        },
        {
          decision: 'Apply account risk controls and restrictions before the closure announcement.',
          consequence: 'The operator says restrictions addressed linked-account activity; that claim does not prove insolvency or establish that risk controls caused the later wind-down.',
          source_refs: ['bitmart-controls', 'bitmart-closure'],
        },
      ],
      counterfactual: 'A sale, regional retrenchment, narrower product set, or continued operation may have been alternatives, but the company disclosed no economics or rejected options. Claims that a token move, executive exit, account restriction, or prior hack forced closure remain unsupported by the reviewed primary record.',
      counterfactualSources: ['bitmart-closure', 'bitmart-controls'],
      watch: [
        {
          signal: 'Withdrawal availability, processing disclosures, and unresolved customer balances.',
          implication: 'Orderly completion would support the announced-wind-down framing; material unresolved claims would require a separate failure analysis.',
          source_refs: ['bitmart-closure'],
        },
        {
          signal: 'August 26 trading cessation and product-specific settlement notices.',
          implication: 'Verified execution would narrow operational uncertainty before the final platform deadline.',
          source_refs: ['bitmart-closure'],
        },
        {
          signal: 'January 31, 2027 platform termination and later administrator, regulator, or company explanation.',
          implication: 'Primary evidence could confirm closure and clarify cause; until then the strategic rationale remains broad.',
          source_refs: ['bitmart-closure'],
        },
      ],
      unknowns: [
        'What financial and strategic data drove the wind-down decision?',
        'What customer balances, open products, and liabilities remain at each deadline?',
        'How will BMX and any token-linked benefits be treated?',
        'Will all withdrawals and manual reviews complete, and will proof-of-reserves evidence be published?',
      ],
      nextReview: '2026-08-05',
    }),
  },
];

export const expectedSlugs = Object.freeze(cases.map(({ slug }) => slug));

function sourceIds(value, found = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) sourceIds(item, found);
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  for (const reference of value.source_refs ?? []) {
    found.add(typeof reference === 'string' ? reference : reference.ref);
  }
  for (const child of Object.values(value)) sourceIds(child, found);
  return found;
}

function validateCase(entry) {
  if (!['successful_exchanges', 'mid_exchanges', 'dead_exchanges'].includes(entry.table)) {
    throw new Error(`${entry.slug}: invalid table`);
  }
  const sourceById = Object.fromEntries(entry.sources.map((item) => [item.id, item]));
  for (const item of entry.sources) {
    if (item.checked_at !== checkedAt) throw new Error(`${entry.slug}: stale ${item.id}`);
    if (!item.url.startsWith('https://')) throw new Error(`${entry.slug}: invalid ${item.id} URL`);
  }
  for (const id of sourceIds(entry.forensic_analysis)) {
    if (!sourceById[id]) throw new Error(`${entry.slug}: unresolved ${id}`);
  }
  const result = validateForensicAnalysis(entry.forensic_analysis, { resolver: sourceById });
  if (result.errors.length || result.warnings.length || result.withheld_sections.length) {
    throw new Error(`${entry.slug}: ${[
      ...result.errors,
      ...result.warnings,
      ...result.withheld_sections,
    ].join('; ')}`);
  }
}

export function buildExchangeForensicWaveAManifest() {
  for (const entry of cases) validateCase(entry);
  return {
    schema: 'chaindump-exchange-forensic-wave-a-v1',
    research_as_of: checkedAt,
    generated_migration: '0059_exchange_forensic_wave_a.sql',
    method: 'Primary-source-bounded causal dossiers. Product operation, distribution, regulation, token/value capture, security, and metrics are separated from inference. SpiritSwap is corrected to rescued/declining; DEUS, Solidly, and WaultSwap are explicitly product-scoped; BitMEX and BitMart remain announced wind-downs until their stated deadlines are verified.',
    cases,
  };
}

function quoteSql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function renderExchangeForensicWaveAMigration(document) {
  if (document.schema !== 'chaindump-exchange-forensic-wave-a-v1') {
    throw new Error('Unexpected exchange forensic wave A schema');
  }
  if (document.research_as_of !== checkedAt) throw new Error('Unexpected research date');
  if (document.generated_migration !== '0059_exchange_forensic_wave_a.sql') {
    throw new Error('Unexpected generated migration');
  }
  if (JSON.stringify(document.cases.map(({ slug }) => slug)) !== JSON.stringify(expectedSlugs)) {
    throw new Error('Unexpected exchange forensic wave A cohort');
  }
  for (const entry of document.cases) validateCase(entry);
  const caseInserts = document.cases.map((entry) => `
INSERT OR REPLACE INTO exchange_forensic_wave_a_0059
  (table_name, kind, lifecycle, slug, forensic_analysis, sources, replace_profile, row_patch)
VALUES (
  ${quoteSql(entry.table)}, -- NOSONAR: deterministic cited research payload
  ${quoteSql(entry.kind)}, -- NOSONAR: deterministic cited research payload
  ${quoteSql(entry.lifecycle)}, -- NOSONAR: deterministic cited research payload
  ${quoteSql(entry.slug)}, -- NOSONAR: deterministic cited research payload
  ${quoteSql(JSON.stringify(entry.forensic_analysis))}, -- NOSONAR: deterministic cited research payload
  ${quoteSql(JSON.stringify(entry.sources))}, -- NOSONAR: deterministic cited research payload
  ${entry.replace_profile ? quoteSql(JSON.stringify(entry.replace_profile)) : 'NULL'}, -- NOSONAR: deterministic cited research payload
  ${entry.row_patch ? quoteSql(JSON.stringify(entry.row_patch)) : 'NULL'} -- NOSONAR: deterministic cited research payload
);`).join('\n');

  return `-- Generated by scripts/render-exchange-forensic-wave-a-migration.mjs.
-- Adds evidence-gated causal dossiers and corrects overstated lifecycle claims.

DROP TABLE IF EXISTS exchange_forensic_wave_a_0059;
CREATE TABLE exchange_forensic_wave_a_0059 (
  table_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  lifecycle TEXT NOT NULL,
  slug TEXT NOT NULL,
  forensic_analysis TEXT NOT NULL CHECK (json_valid(forensic_analysis)),
  sources TEXT NOT NULL CHECK (json_valid(sources)),
  replace_profile TEXT CHECK (replace_profile IS NULL OR json_valid(replace_profile)),
  row_patch TEXT CHECK (row_patch IS NULL OR json_valid(row_patch)),
  PRIMARY KEY (kind, slug)
);

-- batched-payload-start
${caseInserts}
-- batched-payload-end

-- SpiritSwap was rescued before its planned 2023 closure. Move it to the mid
-- lifecycle before applying the shared profile/source patch. The anti-join
-- makes replay preserve identity fields on an existing mid-lifecycle row.
INSERT INTO mid_exchanges
  (slug, kind, venue_type, name, launched, metric_label, metric_type, metric_unit,
   metric, verdict, why_stuck, outlook, profile, sources, updated_at)
SELECT
  patch.slug,
  patch.kind,
  COALESCE(prior.venue_type, 'exchange'),
  COALESCE(prior.name, 'SpiritSwap'),
  COALESCE(prior.launched, '2021-04'),
  json_extract(patch.row_patch, '$.metric_label'),
  json_extract(patch.row_patch, '$.metric_type'),
  json_extract(patch.row_patch, '$.metric_unit'),
  json_extract(patch.row_patch, '$.metric'),
  json_extract(patch.row_patch, '$.verdict'),
  json_extract(patch.row_patch, '$.summary'),
  json_extract(patch.row_patch, '$.outlook'),
  json_set(json(patch.replace_profile), '$.forensic_analysis', json(patch.forensic_analysis)),
  patch.sources,
  '2026-07-29'
FROM exchange_forensic_wave_a_0059 AS patch
LEFT JOIN dead_exchanges AS prior
  ON prior.kind = patch.kind AND prior.slug = patch.slug
WHERE patch.slug = 'spiritswap'
  AND patch.kind = 'dex'
  AND NOT EXISTS (
    SELECT 1
    FROM mid_exchanges AS existing
    WHERE existing.kind = patch.kind
      AND existing.slug = patch.slug
  );

DELETE FROM dead_exchanges WHERE kind = 'dex' AND slug = 'spiritswap';
UPDATE exchange_case_features
SET lifecycle = 'mid',
    operating_model = 'Rescued Fantom spot AMM with advertised swap, liquidity, farm, bridge, and vote-escrow products.',
    product_cohort = 'vote_escrow_amm',
    metric_type = 'operational_status',
    metric_unit = 'status',
    metric_window = 'current_surface_snapshot',
    metric_as_of = '2026-07-29',
    metric_observed_at = '2026-07-29',
    comparability_key = 'dex|vote_escrow_amm|operational_status|status|current_surface_snapshot',
    quality_label = 'partial',
    quality_issues = '["current_interface_not_verified_onchain_activity","current_tvl_volume_fees_unknown","rescued_shutdown_timeline"]',
    lifecycle_evidence_date = '2026-07-29',
    last_verified_at = '2026-07-29',
    next_review_at = '2026-08-05',
    freshness_status = 'current',
    updated_at = '2026-07-29'
WHERE kind = 'dex' AND slug = 'spiritswap' AND lifecycle = 'dead';

UPDATE successful_exchanges
SET profile = CASE
      WHEN patch.replace_profile IS NOT NULL THEN
        json_set(json(patch.replace_profile), '$.forensic_analysis', json(patch.forensic_analysis))
      ELSE
        json_set(COALESCE(NULLIF(successful_exchanges.profile, ''), '{}'),
          '$.forensic_analysis', json(patch.forensic_analysis))
    END,
    sources = patch.sources,
    metric_label = COALESCE(json_extract(patch.row_patch, '$.metric_label'), metric_label),
    metric_type = COALESCE(json_extract(patch.row_patch, '$.metric_type'), metric_type),
    metric_unit = COALESCE(json_extract(patch.row_patch, '$.metric_unit'), metric_unit),
    metric = CASE
      WHEN json_type(patch.row_patch, '$.metric') IS NOT NULL
        THEN json_extract(patch.row_patch, '$.metric')
      ELSE metric
    END,
    status = COALESCE(json_extract(patch.row_patch, '$.verdict'), status),
    why_successful = COALESCE(json_extract(patch.row_patch, '$.summary'), why_successful),
    outlook = COALESCE(json_extract(patch.row_patch, '$.outlook'), outlook),
    updated_at = '2026-07-29'
FROM exchange_forensic_wave_a_0059 AS patch
WHERE patch.table_name = 'successful_exchanges'
  AND successful_exchanges.type = patch.kind
  AND successful_exchanges.slug = patch.slug;

UPDATE mid_exchanges
SET profile = CASE
      WHEN patch.replace_profile IS NOT NULL THEN
        json_set(json(patch.replace_profile), '$.forensic_analysis', json(patch.forensic_analysis))
      ELSE
        json_set(COALESCE(NULLIF(mid_exchanges.profile, ''), '{}'),
          '$.forensic_analysis', json(patch.forensic_analysis))
    END,
    sources = patch.sources,
    metric_label = COALESCE(json_extract(patch.row_patch, '$.metric_label'), metric_label),
    metric_type = COALESCE(json_extract(patch.row_patch, '$.metric_type'), metric_type),
    metric_unit = COALESCE(json_extract(patch.row_patch, '$.metric_unit'), metric_unit),
    metric = CASE
      WHEN json_type(patch.row_patch, '$.metric') IS NOT NULL
        THEN json_extract(patch.row_patch, '$.metric')
      ELSE metric
    END,
    verdict = COALESCE(json_extract(patch.row_patch, '$.verdict'), verdict),
    why_stuck = COALESCE(json_extract(patch.row_patch, '$.summary'), why_stuck),
    outlook = COALESCE(json_extract(patch.row_patch, '$.outlook'), outlook),
    updated_at = '2026-07-29'
FROM exchange_forensic_wave_a_0059 AS patch
WHERE patch.table_name = 'mid_exchanges'
  AND mid_exchanges.kind = patch.kind
  AND mid_exchanges.slug = patch.slug;

UPDATE dead_exchanges
SET profile = CASE
      WHEN patch.replace_profile IS NOT NULL THEN
        json_set(json(patch.replace_profile), '$.forensic_analysis', json(patch.forensic_analysis))
      ELSE
        json_set(COALESCE(NULLIF(dead_exchanges.profile, ''), '{}'),
          '$.forensic_analysis', json(patch.forensic_analysis))
    END,
    sources = patch.sources,
    metric_label = COALESCE(json_extract(patch.row_patch, '$.metric_label'), metric_label),
    metric_type = COALESCE(json_extract(patch.row_patch, '$.metric_type'), metric_type),
    metric_unit = COALESCE(json_extract(patch.row_patch, '$.metric_unit'), metric_unit),
    current_metric = CASE
      WHEN json_type(patch.row_patch, '$.metric') IS NOT NULL
        THEN json_extract(patch.row_patch, '$.metric')
      ELSE current_metric
    END,
    verdict = COALESCE(json_extract(patch.row_patch, '$.verdict'), verdict),
    why = COALESCE(json_extract(patch.row_patch, '$.summary'), why),
    outlook = COALESCE(json_extract(patch.row_patch, '$.outlook'), outlook),
    updated_at = '2026-07-29'
FROM exchange_forensic_wave_a_0059 AS patch
WHERE patch.table_name = 'dead_exchanges'
  AND dead_exchanges.kind = patch.kind
  AND dead_exchanges.slug = patch.slug;

-- Refresh evidence provenance and lifecycle review dates for every patched case.
UPDATE exchange_case_features
SET evidence = json_object(
      'source_ids', json((
        SELECT json_group_array(json_extract(source.value, '$.id'))
        FROM exchange_forensic_wave_a_0059 AS patch,
             json_each(patch.sources) AS source
        WHERE patch.kind = exchange_case_features.kind
          AND patch.slug = exchange_case_features.slug
      )),
      'evidence_policy', 'source IDs resolve against the case sources array; inference is labeled in forensic_analysis'
    ),
    quality_label = 'partial',
    quality_issues = CASE
      WHEN kind = 'dex' AND slug = 'deus-finance'
        THEN '["failed_product_scope_only","residual_protocol_activity_unknown","current_metrics_unknown"]'
      WHEN kind = 'dex' AND slug = 'solidly'
        THEN '["original_fantom_deployment_scope_only","organic_demand_not_measured"]'
      WHEN kind = 'dex' AND slug = 'waultswap'
        THEN '["original_waultswap_wusd_scope_only","current_operator_and_activity_unknown"]'
      WHEN kind = 'cex' AND slug IN ('bitmex','bitmart')
        THEN '["announced_wind_down_not_final_closure","specific_cause_not_disclosed","customer_completion_pending"]'
      WHEN kind = 'cex' AND slug = 'bithumb'
        THEN '["third_party_volume_metric","regulatory_remediation_pending","no_venue_token_identified"]'
      WHEN kind = 'cex' AND slug = 'htx'
        THEN '["third_party_volume_metric","uk_designation_current","reserve_scope_not_full_solvency"]'
      ELSE quality_issues
    END,
    lifecycle_evidence_date = (
      SELECT json_extract(patch.forensic_analysis, '$.outcome.as_of')
      FROM exchange_forensic_wave_a_0059 AS patch
      WHERE patch.kind = exchange_case_features.kind
        AND patch.slug = exchange_case_features.slug
    ),
    last_verified_at = '2026-07-29',
    next_review_at = (
      SELECT json_extract(patch.forensic_analysis, '$.review.next_review_at')
      FROM exchange_forensic_wave_a_0059 AS patch
      WHERE patch.kind = exchange_case_features.kind
        AND patch.slug = exchange_case_features.slug
    ),
    freshness_status = 'current',
    updated_at = '2026-07-29'
WHERE EXISTS (
  SELECT 1
  FROM exchange_forensic_wave_a_0059 AS patch
  WHERE patch.kind = exchange_case_features.kind
    AND patch.slug = exchange_case_features.slug
    AND patch.lifecycle = exchange_case_features.lifecycle
);

-- Scope original DEX failures instead of treating successor or residual products
-- as dead, and keep announced CEX wind-downs separate from completed shutdowns.
UPDATE exchange_case_features
SET operating_model = 'DEI and original AMM product scope; residual DEUS-branded protocol activity is tracked separately.',
    product_cohort = 'synthetic_asset_amm_failed_product',
    quality_label = 'partial'
WHERE kind = 'dex' AND slug = 'deus-finance' AND lifecycle = 'dead';

UPDATE exchange_case_features
SET operating_model = 'Original Fantom Solidly deployment; forks and successor ve(3,3) venues are excluded.',
    product_cohort = 'vote_escrow_amm_original_deployment',
    quality_label = 'partial'
WHERE kind = 'dex' AND slug = 'solidly' AND lifecycle = 'dead';

UPDATE exchange_case_features
SET operating_model = 'Original WaultSwap and WUSD-linked product scope; current support status is not established.',
    product_cohort = 'spot_amm_stablecoin_failed_product',
    quality_label = 'limited'
WHERE kind = 'dex' AND slug = 'waultswap' AND lifecycle = 'dead';

UPDATE exchange_case_features
SET metric_type = 'operations_cease_date',
    metric_unit = 'date',
    metric_window = CASE slug
      WHEN 'bitmex' THEN 'announced_2026-07-23'
      ELSE 'announced_2026-07-26'
    END,
    metric_as_of = CASE slug
      WHEN 'bitmex' THEN '2026-09-23'
      ELSE '2027-01-31'
    END,
    metric_observed_at = CASE slug
      WHEN 'bitmex' THEN '2026-07-23'
      ELSE '2026-07-26'
    END,
    comparability_key = 'cex|announced_wind_down|operations_cease_date|date|operator_notice',
    quality_label = 'partial'
WHERE kind = 'cex' AND slug IN ('bitmex','bitmart') AND lifecycle = 'dead';

DROP TABLE IF EXISTS exchange_forensic_wave_a_0059;
`;
}

function main() {
  const document = buildExchangeForensicWaveAManifest();
  writeFileSync(documentPath, `${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(migrationPath, renderExchangeForensicWaveAMigration(document));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

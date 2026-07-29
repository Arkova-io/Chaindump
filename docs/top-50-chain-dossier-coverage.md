# Top-50 chain dossier coverage

Audit date: **2026-07-29**

Board snapshot: **2026-07-29T15:35:40.123Z**

The [machine-readable manifest](./top-50-chain-dossier-coverage-2026-07-29.json)
records the exact live board, research surfaces, dimension gaps, and source links
used for this audit.

## What is actually covered

The production site has some analysis for almost every current top-50 chain, but
that is not the same as having 50 comparable dossiers.

| Coverage measure | Count | Meaning |
|---|---:|---|
| Comparable schema-v1 dossier | 1/50 | All eight required `chain_facts` dimensions are present |
| Partial research | 47/50 | At least one research surface exists, but required dimensions are missing |
| No production research | 2/50 | XDC and Fluent have no required facts, legacy analysis, or dead/mid profile |
| Legacy `chain_analysis` prose | 43/50 | A current take exists; it may be only a paragraph and is not a full dossier |
| Slim dead/mid profile | 14/50 | A curated lifecycle profile exists in one of the status-specific tables |

Only **Osmosis** has all eight required dimensions: `identity`, `token`,
`capital`, `onchain`, `team`, `narrative`, `risk`, and `synthesis`. Robinhood
Chain and Soneium are each at 7/8. This audit checks structural presence, not the
truth or freshness of every field, so even “comparable” still requires source
review.

The two honest ways to state coverage are:

- **48/50 have some production research.**
- **1/50 has a structurally comparable schema-v1 dossier.**

“The top 50 are analyzed” would overstate the current dataset.

## Universe and method

The universe is the 50 rows returned by
[`/api/chains`](https://chaindump.xyz/api/chains) at the timestamp above. The
board ranks relative activity using 50% 24-hour spot DEX volume, 30% TVL, and
20% 24-hour fees. Inputs are log-scaled and normalized before the composite is
rescaled to 1–100 across the board.

That score is **not** a health or quality score. It excludes derivatives,
prediction markets, NFT marketplaces, and aggregators from spot DEX volume. A
chain can rank highly while concentrating activity in one application, and a
healthy specialist chain can rank low.

For each board row, the audit queried the production chain-detail endpoint and
checked:

1. which of the eight required `chain_facts` dimensions were present;
2. whether a legacy `chain_analysis` row was visible;
3. whether the chain had a slim `dead_chains` or `mid_chains` profile.

`links` is useful provenance but is not one of the eight dossier dimensions.
Legacy prose and slim profiles are recorded separately rather than treated as
schema completion.

## First completion batch

The first batch completes ranks 1–8. It is a **gap-fill**, not a rewrite: each
chain already has some research, and Robinhood Chain needs only its `team`
dimension.

| Chain | Current dimensions | Missing dimensions | Lifecycle/token checkpoint |
|---|---:|---|---|
| Ethereum | 2/8 | token, capital, onchain, team, narrative, risk | Frontier launched 2015-07-30; ETH belongs to the chain launch history |
| Solana | 3/8 | token, onchain, team, narrative, risk | Mainnet Beta began 2020-03-16; record SOL launch/distribution separately |
| BSC | 2/8 | token, capital, onchain, team, narrative, risk | BSC launched 2020-09-01; BNB predates it and migrated from ERC-20 |
| Base | 2/8 | token, capital, onchain, team, narrative, risk | Public mainnet opened 2023-08-09; no native network token, ETH gas |
| Robinhood Chain | 7/8 | team | Public mainnet launched 2026-07-01; no native token, ETH gas |
| Hyperliquid L1 | 3/8 | token, onchain, team, narrative, risk | Separate HyperCore, HyperEVM, and HYPE lifecycle dates |
| Polygon | 2/8 | token, capital, onchain, team, narrative, risk | Preserve Matic/Polygon PoS history and MATIC→POL migration on 2024-09-04 |
| Arbitrum | 2/8 | token, capital, onchain, team, narrative, risk | Arbitrum One opened 2021-08-31; ARB launched later for governance; ETH gas |

Primary starting points:

- Ethereum: [Foundation launch announcement](https://blog.ethereum.org/2015/07/30/ethereum-launches)
- Solana: [official newsletter recording the 2020 genesis](https://solana.com/en/news/june-newsletter)
- BSC: [official mainnet launch](https://www.bnbchain.org/en/blog/binance-smart-chain-mainnet-launch)
- Base: [public mainnet date](https://blog.base.org/its-onchain-summer-%F0%9F%9F%A1-and-base-is-open-for-bridging) and [no-token statement](https://blog.base.org/base-mainnet-is-open-for-builders)
- Robinhood Chain: [official mainnet announcement](https://robinhood.com/us/en/newsroom/robinhood-accelerates-global-expansion-robinhood-chain-mainnet-stock-tokens-agentic-trading/) and [network details](https://robinhood.com/us/en/support/articles/robinhood-chain-mainnet/)
- Hyperliquid: [official documentation](https://hyperliquid.gitbook.io/hyperliquid-docs) and [HIP-1 token standard](https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-1-native-token-standard)
- Polygon: [official MATIC→POL migration notice](https://polygon.technology/blog/save-the-date-matic-pol-migration-coming-september-4th-everything-you-need-to-know)
- Arbitrum: [Arbitrum One public mainnet](https://offchain.medium.com/mainnet-for-everyone-27ce0f67c85e) and [official ARB governance-token announcement](https://blog.arbitrum.foundation/arbitrum-the-next-phase-of-decentralization/)

Each completed block should follow the dossier contract: material figures carry
a resolving `source_url` and `as_of`; unsupported fields remain `null`; derived
values name their inputs; chain launch, token generation, migrations, rebrands,
and gas-token identity remain distinct events.

## Priorities after the first batch

1. Finish Robinhood Chain’s single missing block and Soneium’s missing
   `synthesis`.
2. Build XDC and Fluent from zero so every current board member has at least one
   researched dossier path.
3. Complete the next activity-ranked cohort: Tron, Monad, Avalanche, OP Mainnet,
   Mantle, Plasma, TON, and Ink.
4. Work down the manifest by missing-dimension count, refreshing the snapshot
   before each cohort because board membership is volatile.

## Data-quality blockers

- **Research is split across three shapes.** `chain_analysis`, `chain_facts`, and
  dead/mid profiles overlap without one completion flag. Consumers can mistake
  “a take exists” for “a comparable dossier exists.”
- **The schema status text is stale.** `docs/chain-dossier-schema.md` says no
  worker route reads `chain_facts`, while `/api/chain/:name` now does. The
  contract should describe current behavior before it is treated as an API
  guarantee.
- **The status vocabulary does not cover the target universe.** The schema lists
  dead-to-recovering states, while production identities also use emerging and
  anticipated, and successful chains need a neutral/established state.
- **Chain and token lifecycles are not interchangeable.** Base and Robinhood
  Chain use ETH without native tokens; BNB predates BSC; ARB postdates Arbitrum
  One; Polygon migrated MATIC to POL. A single `token_launched` field would lose
  the causal chronology needed for trend analysis.
- **Point-in-time and historical metrics need separate fields.** The board
  snapshot is suitable for rank provenance, not peak/drawdown or lifecycle
  conclusions.
- **Aliases need one canonical identity map.** BSC/BNB Chain, OP
  Mainnet/Optimism, Near/NEAR, and Hyperliquid L1/Hyperliquid can otherwise
  double-count or fail joins.
- **Structural completeness is not evidence quality.** A present dimension may
  still rely on weak secondary sources, stale figures, or source lists that do
  not map individual claims to evidence. Publication should retain a separate
  verifier gate.

This change is documentation and audit data only. It makes no UI or production
data claims beyond the fixed snapshot.

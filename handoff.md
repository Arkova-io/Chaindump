# Chaindump session handoff - 2026-07-29

## Current state

- Current execution branch: `codex/nft-art-blocks-20260729`, now rebased on the branch that includes merged PR #52. The branch carries migrations `0022`–`0026`; unrelated untracked `.claude/` and `archer-agent-config.md` remain intentionally unstaged.
- Current research delivery: `0026_bitcoin_chain_dossier.sql` publishes Bitcoin as the 14th complete eight-dimension blockchain dossier and is visible in the existing public Blockchain Analysis route/card/detail UI. It intentionally withholds mutable price, fee, activity, hashrate/pool-concentration, capital, and custody metrics until each has a dated source. Four cited sources resolve: the white paper, Bitcoin Core consensus amount constants, Bitcoin Core chain parameters, and the developer transaction guide. Focused migration/contract tests, lint, and migration guard pass locally.
- Top-50 implementation coverage is now **14/50 complete schema-v1 dossiers**, **34/50 partial or legacy research**, and **2/50 absent in the historical audit**. This remains an incomplete rollout; neither the count nor the structural dossier schema claims that all current-board coverage is current or equally deep.
- Repository: `carson-see/Chaindump`
- Root checkout: `/Users/carson/Desktop/chain-monitor-source`
- Root branch at latest handoff update: `codex/nft-wave2-freshness-20260729`, based on `origin/main` at `21f1325` after PR #49 merged.
- Root worktree before this handoff edit had only unrelated untracked files: `.claude/` and `archer-agent-config.md`.
- Production health endpoint currently reports revision `21f132598f163383e9ddcc0810b432d1b5e33caa`, which is the merged/deployed canonical analysis UI from PR #49.
- Goal remains active: deliver Chaindump as a production-verified, citation-backed forensic research product across blockchain, DEX/CEX, Web3 casino, NFT/Ordinals, and future Web3 verticals.
- GitHub open PR state before the NFT wave 2 PR: no open PRs.
- PR #46, #47, and #48 are merged into `main`. PR #48 added a visible `Live mid watch` panel to Stuck/Mid chains so the page uses the same live chip/sparkline pattern as Dead & Dying, matches profiled Stuck/Mid chains to the live board, and lets users click or keyboard-open the matching dossier.
- PR #49 merged and deployed successfully. It standardizes the public analysis surfaces around the Blockchain Analysis contract and also adds the missing DEX/CEX Stuck/Mid UI parity. Production verification after deploy confirmed `/api/health` revision `21f132598f163383e9ddcc0810b432d1b5e33caa`, plus deployed HTML strings for Casino, NFT/Ordinals, Exchange, and Mid-page UI parity.
- Current local PR-in-progress: `codex/nft-wave2-freshness-20260729`. It cherry-picks the staged NFT/Ordinals wave 2 onto current main, adds generated migration `0019_nft_freshness_wave2.sql`, and publishes 10 freshness-gated, field-cited NFT/Ordinals lifecycle dossiers.
- Local validation for `codex/nft-wave2-freshness-20260729`: `npm run check:nft-dossiers -- docs/nft-citation-wave-2-2026-07-29.json` passed for 10 dossiers; focused freshness/NFT tests passed with 3 files / 12 tests; full `npm test` passed with 37 files / 457 tests; `npm run lint` passed; `npm run check:worker` passed; `npm run check:migrations` passed with 19 migrations OK; direct inline SPA parse passed (`Parsed 1 inline script(s)`).
- Main deployment workflow state from the PR/CI audit: PR mergeability is not blocked, but the latest Deploy workflow was waiting on an approval/environment gate. If production has not updated, approve/resume the waiting Deploy run rather than looking for a PR merge blocker.
- Current local implementation branch: `codex/top50-chain-dossiers-20260729`, based on current `origin/main`. It adds migration `0020_chain_dossiers_wave2.sql` plus an API/integration test for five complete, field-cited blockchain dossiers: Tron, Monad, Avalanche, OP Mainnet, and Mantle. These are real public `/chain/:name` dossiers and board-card coverage, not an internal research artifact.
- Wave 2 explicit evidence boundary: live CoinGecko/DefiLlama fields were observed on 2026-07-29; source URLs and dates are stored per dimension. Unknown capital, treasury, founder, developer, active-address, concentration, and stablecoin fields remain `null` and appear in each dossier’s `unsourced_fields` rather than being inferred.
- Ready for review after blockchain PR #51: [PR #52](https://github.com/carson-see/Chaindump/pull/52) adds a cited successful-CEX control wave for Coinbase, Kraken, Binance, Bybit, and Bitstamp. It closes the prior `0 successful CEX` comparison gap, keeps issuer metrics in five distinct comparison classes, records BNB separately from the other venue-token unknowns, and does not pool volume/revenue definitions. The records are public through the existing DEX/CEX Analysis cards and detail views; 462 tests, lint, worker syntax, migration guard, inline UI parsing, and source-resolution checks pass locally. Bybit and Bitstamp have 2025-only lifecycle evidence and intentionally show `review_due`, not `current`, until a fresher operating source is added.
- Ready behind CEX PR #52: an Art Blocks / onchain generative-art lifecycle dossier adds direct current-state evidence and a 2026-10-07 review trigger. The `thriving` label is limited to documented operating-platform continuity; market price, liquidity, aggregate supply, holder retention, revenue, and founder-economics claims remain explicitly withheld. It is rendered through the existing NFT/Ordinals Analysis UI and backed by six resolving primary URLs plus a generated-migration parity test.
- In progress on `codex/casino-dossiers-wave2-20260729`: the Web3 Casino Analysis UI uses the same forensic dossier contract as Blockchain Analysis. It exposes lifecycle timeline, operating model, token and chain dependence, legal scope, hypotheses, counterfactual, outlook, lessons, field evidence, metric scope/formula/limits, licence detail, gaps, and review metadata; cards are filterable by status, entity model, product, and token treatment. This is deliberately a UI/evidence-surface change, not a claim that withheld casino candidates are complete.
- Ready behind Art Blocks PR #54: migration `0023_forensic_refresh_heartbeat.sql` and the existing five-minute Worker cron create a separate six-hour forensic-review heartbeat. It records fresh review debt for field-cited NFTs, exchange dossiers, publication-gated casinos, and chain dossiers; `/api/forensics-refresh-status` and every analysis page visibly expose the most recent scan. The scheduler never rewrites lifecycle/legal/narrative/causal analysis or promotes an AI finding—those remain human-review-required. This is the safe foundation for a future agent: an agent may fetch/verify sources and prepare review candidates every six hours, but it must not silently change published conclusions.
- Ready behind the six-hour heartbeat: migration `0024_bitmex_primary_closure_evidence.sql` replaces BitMEX's mixed explanatory closure record with its resolving operator notice. The public CEX dossier now says only that a wind-down was announced for 2026-09-23 04:00 UTC; it explicitly withholds insolvency, regulatory-penalty, market-share, and customer-loss causality. The next review is 2026-08-05. BitMart's official support page is Cloudflare-blocked and the supplied AscendEX notice URL returns 404 in this environment, so neither is falsely upgraded to verified/current status by this wave.
- Ready behind the BitMEX update: migration `0025_sx_bet_verified_dossier.sql` promotes SX Bet as the third publication-gated Web3 casino/betting dossier. It documents the peer-to-peer exchange, wallet/escrow custody boundary, current mainnet chain ID 4162, SX-token role boundary, and 0% single-bet published fee schedule. Outcome stays `unclassified`; activity, revenue, liquidity, licence, jurisdictional availability, legal operator, token contract, launch date, and value capture are all explicitly unsourced rather than inferred.

## Original user objective

The user asked to read the shared Drive folder, GitHub repo, live site, local/internal context, and open PRs; review and drive open PRs to done; expand DEX/CEX analysis in the same format as blockchain analysis with at least 25 DEX analyses and verified citations; restructure the left Forensics toolbar into:

- Blockchain Analysis
- DEX/CEX Analysis
- Web3 Casino Analysis
- NFT and Ordinals Analysis

The user also asked for the entire top-50 blockchain set to have analysis, for all analysis categories to be sortable and UI-visible, for Web3 casino and NFT/Ordinals corpora to grow substantially, and for this to become the evidence base for a future local LLM/agent "brain" for crypto/Web3 trend analysis.

## Global publication rule

This is now a hard rule for every forensic category, not just NFTs:

- DEX/CEX, blockchains, Web3 casinos, NFTs/Ordinals, and future categories must carry field-level citations where a conclusion is made.
- Each conclusion should expose evidence date separately from access/review date.
- Each dossier should expose last verified date, next review date, freshness/stale/unknown state, and explicit unknown/withheld states when evidence is weak.
- Numeric market data may be automatically refreshed, but lifecycle, legal, status, narrative, and causality claims must go through human review/promotion before becoming public analysis.
- The UI must render this evidence/freshness state visibly. Hidden JSON does not satisfy the requirement.

## Canonical analysis UI contract

The user clarified that Blockchain Analysis is the canonical format/style for all analysis routes. That means every public forensic analysis vertical should converge on this sequence and card anatomy:

- page title/subtitle
- honest scope/evidence note
- four stat tiles
- search/filter/sort toolbar
- optional related-action row
- result count
- uniform card grid with lifecycle/status badge, primary metric, coverage/citation/freshness metadata, short finding, visible source preview/state, and a direct dossier action

Do not interpret "same as Blockchain Analysis" as "add random charts." The chart-heavy Dead & Dying/Stuck pages are legacy/source views; the four Forensics analysis routes should behave like sortable research indexes.

## Merged and deployed PRs

- PR #33: DEX/CEX graveyard, merged.
- PR #34: citation-backed DEX success cohort and Sonar fixes, merged.
- PR #35: unified Forensics navigation/UI, merged.
- PR #36: earlier handoff progress update, merged.
- PR #37: top-50 blockchain coverage docs/work, merged.
- PR #38: deployment/release protections, merged.
- PR #39: casino schema and candidate ledger, merged manually.
- PR #40: top-8 blockchain dossier/UI work, merged manually but initially had migration replay issues.
- PR #42: fixed PR #40 migration replay issue, merged.
- PR #43: NFT/Ordinals wave, merged before final Sonar.
- PR #44: NFT Sonar correction, merged and deployed.
- PR #45: citation-gated Web3 casino initial cohort, merged and deployed to production at revision `5f7748b6e1f295d72626c9286c9e3ab20ebd79a9`.
- PR #46: DEX/CEX exchange analysis normalization and Sonar cleanup, merged.
- PR #47: current-state handoff update, merged.
- PR #48: Stuck/Mid chain live-watch UI parity, merged.
- PR #49: canonical forensic analysis UI standardization, merged and deployed to production at revision `21f132598f163383e9ddcc0810b432d1b5e33caa`.

## Production verification after PR #45

- `https://chaindump.xyz/api/health` returned `ok: true` and revision `5f7748b6e1f295d72626c9286c9e3ab20ebd79a9`.
- Casino production API:
  - `/api/casino-coverage`: target 25, published quality-passed 2, partial/withheld 23.
  - `/api/casinos?sort=name`: 2 published cases.
  - `/api/casino/overtime`: published with 7 claims and 3 sources.
  - `/api/casino/decentral-games-poker-arcade`: published with observation date `2024-06-30`.
  - `/api/casino/stake`: 404 by design because candidate is withheld.
- Casino UI at `/casino-analysis` visibly renders `Web3 Casino Analysis`, publication-gated dossiers, withheld candidates, and full cited dossier links.
- Blockchain production UI already has the four requested Forensics links and sortable analysis pages, but the full "top 50 all same-format" goal is not complete.

## Historical PR #46 - DEX/CEX normalization

- PR: `https://github.com/carson-see/Chaindump/pull/46`
- Branch: `codex/exchange-cohort-normalization`
- State at latest handoff update: merged into `main`.
- Current substantive head checked: `836bdf42482eb96bccdb2b39667586c0e77c63ac`.
- Follow-up Sonar cleanup commit pushed to the branch: `776e6f3268ad5bad89f8472f1e2d664c6c666a0a`.
- State: GitHub metadata briefly showed stale/inconsistent head state after the cleanup push; verify PR #46 head again before merging.
- GitHub merge state at last stable check: `CLEAN`.
- GitHub checks at head `836bdf4`: lint, test, agent-desk, mcp-server, guards, audit, ci-success, CodeRabbit, and SonarCloud check all showed success.
- Direct SonarCloud issues API still showed 5 unresolved issues despite the green GitHub check:
  - 2 critical `plsql:S1192` repeated-literal issues in `migrations/0018_exchange_case_features.sql`
  - 2 minor `javascript:S7778` repeated `Array#push()` issues in `public/index.html`
  - 1 major `javascript:S8786` regex issue in `scripts/smoke-production.mjs`

### PR #46 substantive review status

The original #46 head had serious blockers:

- It inferred metric evidence from source order, for example "last source equals metric evidence."
- It could mark rows verified even when metric evidence was unrelated.
- Known false mappings included KyberSwap TVL to a hack article, Sushi TVL to a slippage article, dYdX perpetual notional to TVL source, Hyperliquid perpetual notional to spot-volume source, and Uniswap spot volume to TVL source.
- It parsed an evidence object but did not render field-level evidence in the UI.
- It called raw token assertions "documented token launches."
- Mutable live 24h API values had no retrieved/observed timestamp, and current live values had already drifted from the seed.

The repaired pushed head `836bdf4` fixes the substantive research/product blockers:

- 29 DEX and 18 CEX cases normalize into the exchange analysis API.
- No false verified rows remain; all 47 rows are downgraded to partial with freshness unknown unless field-specific proof exists.
- Metric evidence is no longer inferred from arbitrary legacy source order.
- Exact successful metric mappings are present for dYdX, Hyperliquid, and Uniswap; Kyber/Sushi are not falsely mapped.
- Token evidence is split between field-cited and unverified token assertions.
- UI renders field evidence and explicit gaps instead of hiding provenance in JSON.
- Freshness fields are exposed: lifecycle evidence date, last verified, next review, freshness status, and metric observed-at where available.

### PR #46 local verification already run

On `/private/tmp/chaindump-pr46-latest.bwdrOi` at head `836bdf4`:

- `npm test`: 35 test files passed, 442 tests passed.
- `npm run lint`: passed.
- `npm run check:worker`: passed.
- `npm run check:migrations`: passed, 18 migrations OK.
- Focused exchange tests also passed: 5 files, 41 tests.

### PR #46 Sonar cleanup pushed

A local verifier worktree had Sonar cleanup edits in:

- `/private/tmp/chaindump-pr46-latest.bwdrOi/migrations/0018_exchange_case_features.sql`
- `/private/tmp/chaindump-pr46-latest.bwdrOi/public/index.html`
- `/private/tmp/chaindump-pr46-latest.bwdrOi/scripts/smoke-production.mjs`

Those edits were made to address the 5 direct Sonar API findings and were committed/pushed as `776e6f3268ad5bad89f8472f1e2d664c6c666a0a`. After that cleanup, these commands passed again:

- `npm test`: 35 test files passed, 442 tests passed.
- `npm run lint`: passed.
- `npm run check:worker`: passed.
- `npm run check:migrations`: passed, 18 migrations OK.

Historical note: earlier handoff text said to wait for remote PR #46 metadata/checks to settle. That is no longer current; PR #46 is merged. Do not reopen that loop unless a new SonarCloud issue appears on current `main`.

## Active NFT/Ordinals wave 2

- Branch: `codex/nft-wave2-freshness-20260729`
- Original staged commit: `2510acc21c1edfd5e1ca19a9d9227b056f3f26da`
- Rebased/cherry-picked commit on current main: `607d747` before migration amend.
- Assigned migration: `migrations/0019_nft_freshness_wave2.sql`.
- Status: ready for PR after final amend/push; no direct merge until remote CI and deploy pass.

Wave 2 adds/stages 10 NFT/Ordinals cases with the universal freshness contract:

- F1 Delta Time - Ethereum - dead.
- Funko Digital Pop!/Droppp - WAX - dead.
- Reddit Collectible Avatars - Polygon - middling/current limited utility.
- NBA Top Shot - Flow - thriving/current.
- Sorare Cards - Solana NFTs/Base settlement - thriving/current.
- TwelveFold - Bitcoin Ordinals - unknown/withheld for current status.
- Bitcoin Frogs - Bitcoin Ordinals - unknown/withheld for current status.
- Gods Unchained cards - Immutable zkEVM - thriving/current.
- Axie Infinity Origin Axies - Ronin - thriving/current.
- Tezzardz - Tezos - unknown/withheld for current status.

NFT wave 2 also adds/stages:

- `src/lib/evidence-freshness.mjs`
- `docs/forensic-evidence-freshness.md`
- Generic source-date, date-kind, last-verified, evidence-scope, stale-after/stale, next-review, status-basis, and status-as-of handling.
- UI that visibly renders freshness basis, source date, verification date, stale state, review target, and field-level links.

NFT wave 2 verification:

- 457/457 tests passed locally after rebasing onto PR #49.
- Lint passed.
- Worker syntax passed.
- Migration guard 19/19 passed.
- Dossier citation/freshness check passed for 10/10 cases.
- Generated migration `0019_nft_freshness_wave2.sql` replayed cleanly after current migrations.
- Total staged NFT dossiers would become 30, with 14 field-cited and 10 freshness-gated.

## Web3 casino status

- PR #45 delivered a conservative initial Web3 Casino Analysis product, not the full target corpus.
- Published cases: 2 quality-passed dossiers.
- Candidate ledger: 25 target candidates, with 23 partial/withheld.
- Important quality rule: no casino record should be public unless reviewed primary evidence, explicit scope, status evidence, an as-of metric, no blockers, and a defined outcome rule are present.
- The UI exists and renders the publication-gated state; this satisfies the "must have UI" requirement for the initial casino slice but not the final corpus size goal.

## Blockchain analysis status

- UI and routes exist for sortable Blockchain Analysis.
- Production `/api/chains` includes 50 top live records.
- Ethereum has a substantive multi-dimension dossier.
- The full requirement is not complete: the entire top 50 still needs same-format, citation-backed analysis, including thriving, dead, dying, and stuck chains.
- Current UI honestly labels full/partial/live-only coverage; do not claim top-50 analysis is complete until every top-50 chain has the same-format dossier and citations.

## Six-hour/live agent design

Existing architecture:

- `wrangler.jsonc` currently has a cron trigger every 5 minutes.
- `src/worker.js` scheduled handler refreshes live board data every five minutes, RWA/DePIN hourly, CEX every four hours, sanctions daily, and NFT catalog weekly.
- Existing Research Desk proposal/promotion flow uses guarded endpoints:
  - `POST /api/desk/propose`
  - `POST /api/desk/promote`
- Current design already says nothing reaches live tables without human promotion.

Recommended six-hour research agent design:

- Use the existing scheduled worker to enqueue stale/changed research cases about every 6 hours.
- Do not run large model jobs inside the cron request itself.
- Worker/queue agent fetches official sources and live metrics, computes diffs, and writes Research Desk proposals.
- Numeric metrics can auto-refresh with provenance.
- Lifecycle/legal/status/narrative changes require human promotion before publication.
- UI should show fresh, due, stale, pending-review, and unknown states for every category.
- Do not enable unattended paid LLM/API calls until model/provider, budget, secrets, and review policy are explicitly chosen.

## Current open work

- Finish and publish `codex/nft-wave2-freshness-20260729`:
  - Amend generated migration and handoff update into the NFT wave 2 branch.
  - Push and open PR.
  - Wait for remote CI and review signals.
  - Merge only if remote checks are green, then verify production health and `/nft-analysis`.
- Continue the original workflow; it is not done:
  - Continue top-50 blockchain same-format dossier completion.
  - Continue Web3 Casino Analysis beyond the first 2 published records.
  - Continue NFT/Ordinals from 30 toward the requested 50 case studies after wave 2 lands.
  - Keep every content/data PR tied to visible UI, API, tests, migration replay, and production smoke.

## Local worktree notes

Unrelated untracked root files should be preserved and not staged without explicit user direction:

- `.claude/`
- `archer-agent-config.md`

Temporary PR worktrees used during this session:

- `/private/tmp/chaindump-pr46-review.uOgoMt` - earlier verifier worktree for old PR #46 head.
- `/private/tmp/chaindump-pr46-latest.bwdrOi` - latest PR #46 verifier/cleanup worktree.
- `/private/tmp/chaindump-nft-wave2` - staged NFT wave 2 worktree.

## Google Drive doc

Existing Drive document from earlier session work:

- `https://docs.google.com/document/d/1p6nuJuXhcowZWBtb1NMWYndbWRpaFGZw0yiQUh5xpBI/edit?usp=drivesdk`

This document exists but may not include the latest #45 production verification, #46 repaired-head status, direct Sonar discrepancy, or NFT wave 2 staged details. Update it after PR #46 is merged or after the next stable checkpoint.

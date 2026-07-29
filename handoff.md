# Chaindump session handoff - 2026-07-29

## Current state

- Repository: `carson-see/Chaindump`
- Root checkout: `/Users/carson/Desktop/chain-monitor-source`
- Root branch at handoff time: `codex/casino-verified-cohort`, tracking branch is gone.
- Root worktree before this handoff edit had only unrelated untracked files: `.claude/` and `archer-agent-config.md`.
- Production health endpoint currently reports revision `5f7748b6e1f295d72626c9286c9e3ab20ebd79a9`, which is the merged/deployed casino cohort from PR #45.
- Goal remains active: deliver Chaindump as a production-verified, citation-backed forensic research product across blockchain, DEX/CEX, Web3 casino, NFT/Ordinals, and future Web3 verticals.

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

## Active PR #46 - DEX/CEX normalization

- PR: `https://github.com/carson-see/Chaindump/pull/46`
- Branch: `codex/exchange-cohort-normalization`
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

Next immediate action: wait for remote PR #46 metadata/checks to settle on `776e6f3`, then re-run the direct Sonar API query. Only mark PR #46 ready/merge after direct Sonar unresolved issue count is 0 and the adversarial reviewer has rechecked the UI/evidence mapping.

## Staged NFT/Ordinals wave 2

- Branch: `codex/nft-wave2-staged`
- Worktree: `/private/tmp/chaindump-nft-wave2`
- Commit: `2510acc21c1edfd5e1ca19a9d9227b056f3f26da`
- No PR opened yet because it must rebase after PR #46 lands and must receive the next migration number after `0018`.

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

NFT wave 2 verification reported by the agent:

- 439/439 tests passed.
- Lint passed.
- Worker syntax passed.
- Migration guard 17/17 passed.
- Dossier citation/freshness check passed for 10/10 cases.
- Generated unnumbered seed replayed cleanly after current migrations.
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

- Finish PR #46:
  - Confirm GitHub PR metadata/checks settle on cleanup commit `776e6f3`.
  - Query direct Sonar API and require unresolved `total: 0`.
  - Re-run adversarial review for false citation mapping and UI evidence visibility.
  - Mark ready only after those pass.
- After #46 merges:
  - Rebase NFT wave 2.
  - Assign the next migration number.
  - Open PR for NFT wave 2.
  - Run adversarial citation/freshness review before merge.
- Continue top-50 blockchain same-format dossier completion.
- Continue Web3 Casino Analysis beyond the first 2 published records.
- Continue NFT/Ordinals from 30 toward the requested 50 case studies.
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

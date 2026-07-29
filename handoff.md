# Chaindump session handoff - 2026-07-29

## Current branch

- Working branch: `codex/handoff-progress`
- Production base: `main` after PRs #33, #34, and #35
- Repository: `carson-see/Chaindump`

## User objective

The user asked to understand Chaindump from Drive, GitHub, the live site, local/internal memory, and open PRs; drive open PRs to done; expand DEX/CEX analysis in the same format as blockchain analysis with at least 25 DEX analyses and verified citations; restructure the left toolbar under Forensics into Blockchain Analysis, DEX/CEX Analysis, Web3 Casino Analysis, and NFT and Ordinals Analysis; eventually build a large citation-backed corpus for local LLM/agent analysis across crypto/Web3 verticals.

The latest explicit request was to provide code review on open PRs, commit uncommitted work, update this handoff, and create a Google Drive document summarizing everything done plus the original prompt.

## PR status

- PR #29, "Server-render live board rows", was merged earlier in the session.
- PR #33, "DEX/CEX Graveyard", merged to `main`. Review fixes include cohort-scoped CEX ordering and corrected DEX aggregate drawdown arithmetic.
- PR #34, "Add citation-backed DEX success cohort", merged to `main`. It adds 10 successful DEX dossiers, Exchange Dossier Schema v1, `successful_exchanges`, and `GET /api/successful-exchanges`. SonarCloud is green: the migration was mechanically rewritten into one SQLite JSON-seed expansion, preserving a self-contained clean-database replay without the duplicated SQL tuples.
- PR #35, "Add unified Forensics analysis views", merged to `main`. It adds the requested four-link Forensics navigation, sortable Blockchain Analysis and DEX/CEX Analysis views, always-visible citations, and explicit Web3 Casino empty-state coverage.

## Code review findings

- PR #33: No remaining blocking finding after the metric-cohort ordering fix. Its DEX/CEX source data is now published through the dedicated analysis surface in PR #35.
- PR #33: Reclassified lender/broker/custodian cases are not publicly surfaced after exchange-only filtering. That is intentional for avoiding CEX contamination, but a future CeFi/lender/custodian view should decide whether to expose those well-sourced dossiers.
- PR #34: The success cohort is only 10 cases. Together with PR #33 it brings the DEX analysis universe to 29 cases, but the balanced, quality-gated research program still needs more controls and stricter field-level evidence checks.
- PR #35: The interface is intentionally honest about incomplete coverage: live top-50 rows are not labeled as completed blockchain research, and Web3 Casino remains an empty research surface until verified dossiers are available.

## Research and data delivered

- Added `docs/exchange-dossier-schema.md` with a citation-first dossier contract, comparable-cohort rules, and publication gates.
- Added `docs/dex-success-cohort-2026-07-29.json` with 10 successful DEX dossiers.
- Added `migrations/0013_exchange_success_seed.sql` with the `successful_exchanges` table and seed data for the 10 successful DEX cases.
- Added `GET /api/successful-exchanges`, which returns parsed profiles and sources, dimension-safe metric groups, and bound chain/metric filters without a cross-metric aggregate.
- Added a dedicated DEX/CEX Analysis UI with search, DEX/CEX and lifecycle filters, sort controls, expandable dossiers, and source links visible before expansion.
- Verified current CEX shutdown news from primary sources earlier in the session:
  - BitMEX announced closure on 2026-07-23, with closure effective 2026-09-23 04:00 UTC.
  - BitMart announced orderly cessation, with trading ending 2026-08-26 and platform services ending 2027-01-31.

## Casino and NFT audit

- Current curated NFT/Ordinals coverage is exactly 16 dossiers: 8 Ethereum, 4 Solana, and 4 Bitcoin Ordinals; statuses are 4 thriving, 10 fading, and 2 dead.
- There is no Web3 casino data model, seed, API, or dossier test yet. A visible `/casino-analysis` route now accurately says that no casino dossiers are published.
- The live NFT catalog and `nft_market` rows are not analysis dossiers and should not be counted toward the 50-case NFT/Ordinals target.
- `/blockchain-analysis`, `/exchange-analysis`, `/casino-analysis`, and `/nft-analysis` now exist, with `/nft`, `/grave`, and `/mid` retained as compatibility aliases.

## What is still open

- Complete the full top-50 blockchain analysis corpus; the current seeded blockchain analysis does not yet cover the entire top 50.
- Build Web3 Casino Analysis from zero: schema, seed, API, UI, tests, and legal/source gates.
- Retrofit the 16 NFT dossiers to the new citation-first schema, then expand to 50 NFT/Ordinals case studies.
- Add quality gates so trend analysis reports cohort size, denominators, missingness, source support, and confidence instead of treating row count as evidence quality.

## Local worktree notes

Untracked files were intentionally left uncommitted because they appear unrelated to Chaindump product work:

- `.claude/launch.json`
- `.claude/launch 2.json`
- `archer-agent-config.md`

## Verification commands run

- `npm test`
- `npm run lint`
- `node scripts/check-migrations.mjs`
- Targeted: `npm test -- test/exchange-routes.integration.test.js test/exchange-tiers.integration.test.js`

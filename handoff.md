# Chaindump session handoff - 2026-07-29

## Current branch

- Working branch: `codex/dex-success-cohort`
- Stack base: `feature/exchange-graveyard` / PR #33
- Repository: `carson-see/Chaindump`

## User objective

The user asked to understand Chaindump from Drive, GitHub, the live site, local/internal memory, and open PRs; drive open PRs to done; expand DEX/CEX analysis in the same format as blockchain analysis with at least 25 DEX analyses and verified citations; restructure the left toolbar under Forensics into Blockchain Analysis, DEX/CEX Analysis, Web3 Casino Analysis, and NFT and Ordinals Analysis; eventually build a large citation-backed corpus for local LLM/agent analysis across crypto/Web3 verticals.

The latest explicit request was to provide code review on open PRs, commit uncommitted work, update this handoff, and create a Google Drive document summarizing everything done plus the original prompt.

## PR status

- PR #29, "Server-render live board rows", was merged earlier in the session.
- PR #33, "DEX/CEX Graveyard", is open and no longer has a known local blocker. A real review issue was found and fixed: CEX exchange rows were being sorted by metric fields that either were null for CEXs or mixed incompatible units. The branch now orders CEX rows inside comparable metric cohorts and has regression coverage. A separate pushed fix on the same branch corrected the DEX aggregate drawdown text from -99.2% mean to -98.9% mean. Local validation after these fixes: `npm test` 389/389, `npm run lint`, and `node scripts/check-migrations.mjs`.
- PR #34, "Add citation-backed DEX success cohort", is a draft stacked PR on top of PR #33. It adds 10 successful DEX dossiers, the Exchange Dossier Schema v1, and migration `0013_exchange_success_seed.sql`. Its GitHub base was corrected from `main` to `feature/exchange-graveyard` because migration `0013` depends on `0011` and `0012` from PR #33. Local validation on the stack before this handoff: `npm test` 388/388, `npm run lint`, and `node scripts/check-migrations.mjs`.

## Code review findings

- PR #33: No remaining blocking finding after the metric-cohort ordering fix. Residual product gap: it does not implement the requested new Forensics toolbar or the final DEX/CEX Analysis page. It extends the current Dead and Dying / Stuck-Mid pattern with DEX/CEX toggles and live boards.
- PR #33: Reclassified lender/broker/custodian cases are not publicly surfaced after exchange-only filtering. That is intentional for avoiding CEX contamination, but a future CeFi/lender/custodian view should decide whether to expose those well-sourced dossiers.
- PR #34: Correct as a research seed draft, not ready as a production user-facing feature. It needs an API/UI publication PR, field-level source checks, and a final Sonar/GitHub pass after PR #33 settles.
- PR #34: The success cohort is still only 10 cases. Together with PR #33 it brings the DEX analysis universe to 29 cases, but the balanced, quality-gated research program still needs more controls and stricter field-level evidence checks.

## Research and data delivered

- Added `docs/exchange-dossier-schema.md` with a citation-first dossier contract, comparable-cohort rules, and publication gates.
- Added `docs/dex-success-cohort-2026-07-29.json` with 10 successful DEX dossiers.
- Added `migrations/0013_exchange_success_seed.sql` with the `successful_exchanges` table and seed data for the 10 successful DEX cases.
- Verified current CEX shutdown news from primary sources earlier in the session:
  - BitMEX announced closure on 2026-07-23, with closure effective 2026-09-23 04:00 UTC.
  - BitMart announced orderly cessation, with trading ending 2026-08-26 and platform services ending 2027-01-31.

## Casino and NFT audit

- Current curated NFT/Ordinals coverage is exactly 16 dossiers: 8 Ethereum, 4 Solana, and 4 Bitcoin Ordinals; statuses are 4 thriving, 10 fading, and 2 dead.
- There is no Web3 casino data model, seed, API, UI view, route, or test yet.
- The live NFT catalog and `nft_market` rows are not analysis dossiers and should not be counted toward the 50-case NFT/Ordinals target.
- Recommended next routes are `/blockchain-analysis`, `/exchange-analysis`, `/casino-analysis`, and `/nft-analysis`, keeping `/nft`, `/grave`, and `/mid` as compatibility aliases.

## What is still open

- Build the new Forensics sidebar and sortable analysis surfaces.
- Complete the full top-50 blockchain analysis corpus; the current seeded blockchain analysis does not yet cover the entire top 50.
- Publish DEX/CEX Analysis as a dedicated route/view after PR #33 and PR #34 are clean.
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


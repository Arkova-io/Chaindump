# Chaindump product and engineering handoff

## Authoritative current snapshot — 2026-08-03

Use this section first. The older entries below are a chronological work log,
not current truth. When they conflict, production, current `main`, the test
suite, and this snapshot win.

### Production and delivery

- Repository: `https://github.com/Arkova-io/Chaindump` (the former
  `carson-see/Chaindump` location redirects).
- Production: `https://chaindump.xyz`.
- Current verified production revision at this snapshot:
  `eed6d6c17fb6fddaee0ca1aa7ebaa9b8223b6dcb`.
- PR #117 fixed two calendar-dependent tests, passed required CI, merged, was
  approved through the protected `production` environment, deployed, and
  passed the exact-revision production smoke test.
- Production delivery is `main` only: GitHub Actions reruns tests and migration
  checks, waits for production approval, applies D1 migrations, deploys the
  Worker with `BUILD_SHA`, and runs the production smoke test. Do not bypass
  this with an ad-hoc local deploy.

### What the product actually has

- Live Top 50 is the current interaction and visual benchmark: compact header,
  live stats, sortable table, and progressive detail.
- Indexed corpus: 50 live blockchain records, 29 DEX cases, 30 CEX cases, 29
  Web3 casino cases, 51 NFT/Ordinals cases, 50 ranked stablecoins, 18 curated
  RWA/DePIN cases, and 15 infrastructure cases.
- `normalized-dossier-v1` is present for 50/50 blockchains, 29/29 DEX, 30/30
  CEX, 29/29 casinos, and 51/51 NFT/Ordinals. It is absent for stablecoins,
  RWA/DePIN, and infrastructure.
- Those structural counts are **not analytical completion**. Complete
  12-section reports are currently 0/50 blockchain, 1/29 DEX, 2/30 CEX, 0/29
  casino, and 0/51 NFT/Ordinals. Stablecoin, RWA/DePIN, and infrastructure have
  no normalized report contract yet.
- High-risk evidence remains unresolved for 1,056 of 1,169 tracked claims
  (90.3%): DEX 188/195, CEX 180/188, casino 143/236, NFT/Ordinals 545/550.
  Withheld claims must remain withheld; indexed rows must never be labeled
  complete merely because the schema exists.

### Current product correction program

1. Replace browser-side recursive object flattening with a typed, server-owned
   entity profile. Raw source registry metadata, IDs, schema fields, and URLs
   must never become customer prose.
2. Give every supported entity a dedicated profile endpoint and route. A deep
   link must render the entity, not the whole category page with one card
   expanded thousands of pixels below the header.
3. Use the same human report anatomy everywhere: what it is; what happened;
   why; strategic choices; operating model; token/value capture; evidence;
   counterfactual; risks/unknowns; lifecycle; outlook/watch; review date.
   Category-specific facts are extensions, not alternate templates.
4. Keep review-run state, SLM fields, promotion rules, source-registry
   internals, and raw JSON endpoints off customer report pages. Explain the
   public method once in a dedicated Intelligence Methodology section.
5. Treat the six-hour job as a review-debt scanner and proposal workflow, not a
   content freshness guarantee. Live market metrics can refresh automatically;
   causal, lifecycle, legal, loss, adverse, and outlook conclusions require
   source-backed human promotion.
6. Refresh the corpus in evidence-priority order. The first corrective wave is
   Ethereum, USDC, USDT, BUIDL, Ondo, Binance, Bybit, Decentral Games Poker
   Arcade, Reddit Collectible Avatars, and SushiSwap.

### Known UX and data-quality failures

- Customer pages currently expose six-hour job state, optional research-agent
  state, taxonomy contracts, SLM/training links, and regulatory methodology.
  This is internal process copy and must move out of category pages.
- `normalizedValue()` in `public/index.html` recursively stringifies arbitrary
  objects. It caused evidence metadata such as `title:`, `url:`, source tiers,
  access state, and registry fields to appear as robot-like prose.
- Mobile category pages bury the first entity below large methodology blocks:
  approximately 4,144px on Blockchain, 7,486px on DEX/CEX, 4,075px on Casino,
  and 7,561px on NFT/Ordinals in the 2026-08-03 production audit.
- A global 30-second refresh calls `load()` directly. Background refresh must
  preserve scroll, focus, and input selection; it must never act like a new
  navigation.
- The six-hour status can be current while underlying analysis is stale. Most
  dated chain narratives are from July 8 or July 17; stablecoin and RWA/DePIN
  narrative snapshots are July 8. Show content-level `as_of` and review dates,
  not a misleading global freshness implication.
- The current SLM export reports structurally eligible rows, but the eligible
  blockchain records have empty narrative/outcome fields because the export
  reads summary rows rather than entity detail. Effective usable training rows
  are zero until that path is corrected and evaluated.

### Documentation reconciliation

- `docs/session-summary-2026-07-30.md` and older Drive handoffs include stale
  operational claims. In particular, PR #116 was not merge-ready on the current
  branch: required tests failed and its copy-only approach did not correct the
  information architecture. It was closed on 2026-08-03.
- Older notes that say the corpus is complete refer to structural/index counts,
  not evidence-complete reports.
- Older instructions that say there is no test/CI harness or that direct deploys
  are acceptable are superseded by the protected GitHub Actions release path.

### Next-session boot sequence

1. Read this section, `CLAUDE.md`, `DESIGN.md`, and the newest dated session
   summary.
2. Check `https://chaindump.xyz/api/health` with a cache-busting query and
   compare the returned revision to current `main`.
3. List open PRs and pending Deploy runs. Review code and evidence before merge;
   approve only the exact current-main production deployment.
4. Query the public APIs for corpus counts and per-field support. Never inherit
   a completion number from an old handoff.
5. Work in small independent PRs: presentation cleanup, entity-profile API,
   entity-profile UI, then source-backed content waves.
6. Run focused tests, full tests, lint, Worker syntax, migration guard, browser
   verification, deployment smoke, and desktop/mobile production verification.

# Historical session handoff - 2026-07-29

## Current execution snapshot — 2026-07-30

This is the authoritative handoff for the latest workflow pass. The source of
truth is `main` at production revision
`9235c75d825e0e19d45c4691ad6611ca12f16cdf` (verified through
`https://chaindump.xyz/api/health`). PRs **#110** and **#111** are merged and
deployed. The normalized `normalized-dossier-v1` template is now both a public
UI renderer and an API contract across Blockchain, DEX/CEX, Web3 Casino, and
NFT/Ordinals; it is not only a style or vocabulary pass. The contract keeps
the same human report order everywhere: what it is, what happened, why the
outcome happened, strategic choices, operating model, token/value capture,
evidence, counterfactual, risks/unknowns, lifecycle, outlook/watch list, and
review metadata. Unknown and withheld claims remain explicit and each sourced
claim retains its field-level citation and dates.

### Research Desk execution boundary

The screenshot showing three one-second proposal runs is normal for the
current safe configuration: the workflow trigger fired, then the jobs were
intentionally skipped because `RESEARCH_DESK_ENABLED` is not `true`. No paid
model call or proposal publication occurred. The free six-hour refresh scanner
continues to record review debt and status, but it is human-review-only and
cannot rewrite a lifecycle, legal, causal, narrative, or outlook conclusion.
To enable paid proposal research later, production must have the proposal and
run-status migrations, matching `DESK_PROPOSAL_TOKEN` /
`RESEARCH_DESK_PROPOSAL_TOKEN`, a human-only `DESK_REVIEW_TOKEN`, and
`RESEARCH_DESK_ANTHROPIC_API_KEY`; then a human must explicitly set the
repository variable. See `agent-desk/README.md` and
`.github/workflows/research-desk.yml`.

### Agent-discovery and DNS status

- WebMCP is live and scanner-verified: the page registers four read-only
  tools (market summary, chain profile, sourced signals, forensic trace
  lookup) when the browser API is available.
- The MCP server card and API catalog are live. OAuth/OIDC discovery and
  protected-resource metadata intentionally return a truthful
  `oauth_not_configured` 404 because Chaindump's current agent API uses x402,
  not a fabricated issuer/JWKS/registration server. `/auth.md` documents the
  no-account x402 flow; the external scanner may still mark it incomplete
  because it expects a registration URL.
- DNS-AID is not live. The Cloudflare credential does exist in Secret Manager,
  but its token currently has only Worker and zone-read permissions. It lacks
  DNS Records read/edit and DNSSEC permissions, so public `_agents` SVCB
  records cannot be published or claimed. The runbook and dry-run workflow
  remain in `docs/dns-aid-publication.md`, `docs/dns-aid.md`, and
  `ops/dns/dns-aid.zone`.

### Verified corpus and remaining work

The latest production corpus smoke verified **50 blockchains, 29 DEX cases,
30 CEX cases, 29 Web3 casino cases, and 51 NFT/Ordinals cases** through the
public APIs. Counts describe indexed records, not equal evidentiary depth;
field-level freshness and withheld states remain visible in each dossier.
The remaining known product backlog is small and explicit: remove the
console-icon 404 noise in the browser surface and complete the remaining
casino jargon/copy cleanup while preserving the normalized contract. A
detailed chronological account of this pass, including checks and external
gates, is in `docs/session-summary-2026-07-30.md`.

## Current state

- 2026-07-30 refreshed-outlook categorization continuation: branch `codex/outlook-trend-slm-readiness-20260730` extends the merged trend taxonomy into a stricter SLM-ready outlook contract. `/api/trend-taxonomy` now exposes `chaindump-refreshed-outlook-v1` with required outlook-refresh sections, evidence statuses, per-vertical refresh fields for blockchain, DEX, CEX, casino, NFT/Ordinals, stablecoins, RWA, DePIN, treasury companies, ETFs/ETPs, and regulatory news, plus the hard rule that a promoted trend needs at least three comparable dated observations with a declared window, denominator, metric contract, comparison key, source/observation date, and provenance. `/api/slm/training-schema` now includes metric contracts, evidence status, human-review status, refreshed-outlook deltas, and the SLM label contract. Every analysis page’s trend guide renders a visible **Refreshed outlook contract** block so this is product surface, not hidden JSON.
- 2026-07-30 reader-first copy/UI pass (PR pending): all four Forensics indexes now use the same plain-English vocabulary as the canonical Solana chain detail page. Cards expose one shared “Plain-English read · why this matters” block sourced only from existing report fields; internal labels such as “causal map,” “structural dossier,” “metric contract,” and “publication-gated” are replaced in the visible UI with “why analysis,” “research report,” “how we measured it,” and “evidence-reviewed.” The trend panel now leads with the five human questions every report answers, labels feature tags as “signals we track,” and presents regulatory inputs as “rules and policy to watch.” Evidence links, field-level support, withheld states, and review dates remain unchanged. Inline SPA syntax check and Worker syntax check pass; `npm run lint` could not run in this clean worktree because the local `eslint` binary is not installed.
- 2026-07-30 refreshed-outlook / SLM taxonomy slice: branch `codex/trend-taxonomy-outlooks-20260730` adds the shared trend/outlook vocabulary as public product surface, not hidden JSON. `/api/trend-taxonomy` now exposes the cross-vertical driver-domain taxonomy, vertical signal contracts, outlook contract, regulatory signals, evidence contract, and primary-source citations; `/api/slm/training-schema` exposes the future local-SLM training record requirements, label targets, quality gates, and export policy. Blockchain Analysis, DEX/CEX Analysis, Web3 Casino Analysis, and NFT/Ordinals Analysis each render a visible “outlook trend taxonomy” panel with SLM feature tags, regulatory inputs, and direct API/schema links. `npm run export:forensic-corpus` writes an internal redacted JSONL + manifest from public APIs only; a production smoke against `https://chaindump.xyz` exported 189 records (50 blockchains, 29 DEX, 30 CEX, 29 casino, 51 NFT/Ordinals) with zero endpoint failures and correctly withheld/non-training-eligible rows where high-risk support is unresolved. The six-hour proposal agent prompt now loads the taxonomy/schema, prioritizes stale outlook/watch/unknowns/licensing/status fields, and preserves the rule that trend claims require at least three comparable dated observations. This does not auto-rewrite dossier conclusions: six-hour scans may prepare evidence-backed proposals, but lifecycle/legal/status/causal/outlook changes still require human review/promotion. Verification on this branch passed focused taxonomy/export tests (9/9 after the blockchain export addition), agent-desk tests (4 files / 26 tests), targeted UI/API regressions (6 files / 37 tests), full suite (95 files / 763 tests), lint, Worker syntax, the 65-migration guard, publication-depth guard, NFT dossier guard, casino evidence-depth guard, exchange remediation guard, and production corpus-export smoke.
- 2026-07-29 six-hour Research Desk audit: PR #87 merged at `ea679c062bab6901bd0eeb442e14e0cc045d801f`, preserving both exact-main deployment guards while making an already-superseded run a successful no-op before D1/Worker/smoke mutation. [PR #89](https://github.com/carson-see/Chaindump/pull/89) is the ready review line for evidence-governance hardening. It exposes authoritative current/stale/failed/unknown status, exact last completion, prior successful agent completion, age, and next due time in the public API and every analysis page; the UI polls status every five minutes. Proposal-agent next due time follows the fixed `17 */6 * * *` UTC schedule rather than drifting with run duration. Blockchain, DEX, CEX, casino, and NFT/Ordinals are separate bounded research surfaces (DEX and CEX are no longer treated as one candidate slot).
- PR #89 also moves the cross-vertical evidence contract from prompt-only guidance to the Worker boundary: every analysis candidate needs a canonical `entity_id--field_path--as_of` key, one field/claim, explicit `source_refs`, and unique resolving HTTP(S) citations with source type, timezone-qualified verification time, and `verification_result="resolved"`. Duplicate, malformed, unreferenced, or alternate-key packets fail closed; a repeated key may update only while pending and cannot overwrite human-reviewed history. All complex candidates remain non-promotable and human-review-required. Local final verification at head `859c65c` passed 85 files / 683 root tests, 4 files / 26 agent tests, lint, typecheck/build, 62-migration guard, Worker syntax, diff hygiene, and a Wrangler deploy dry-run.
- Six-hour paid-agent activation remains deliberately off. Activation requires the proposal/run-status migrations in production, Worker `DESK_PROPOSAL_TOKEN` matching GitHub `RESEARCH_DESK_PROPOSAL_TOKEN`, a separate human-only `DESK_REVIEW_TOKEN`, `RESEARCH_DESK_ANTHROPIC_API_KEY`, and then the explicit repository variable `RESEARCH_DESK_ENABLED=true`. No paid credential, repository variable, or unattended model run was created or enabled during this audit.
- 2026-07-29 final corpus correction: PR #58 merged; [PR #59](https://github.com/carson-see/Chaindump/pull/59) contains only the last two rebased live-top-50 waves. The current live `/api/chains` snapshot has a field-cited eight-dimension dossier path for all **50/50** entries. The previous Wave-8 names dYdX, Mixin, Mezo, Bittensor, and XRPL are retained as historical research but are explicitly excluded from the current-top-50 completion count after the live-snapshot audit. Final live ranks 41–50 are Osmosis, Celo, Hedera, Sonic, Gala, XDC, Fluent, Algorand, ICP, and Soneium. Wave 9–10 tests passed 6/6; lint, diff check, and the 51-migration guard passed locally.
- Current attained corpus targets: 50/50 current top‑50 blockchain structural dossiers; 25 source-backed DEX/CEX causal maps (minimum reached); 29 quality-gated casino dossiers; 51 NFT/Ordinals lifecycle dossiers (50-case target surpassed). The six-hour worker remains an evidence-review-debt scanner, not an unattended publisher: numeric data can refresh with provenance, but lifecycle, legal, causal, and status changes still require reviewed promotion.
- 2026-07-29 current merge line: PR #56 now includes migrations `0035`–`0043` after the latest integrated push. The just-validated batch adds five more top-50 chains (Starknet, Ink, Chainflip, Sei, Unichain), five casinos (Cloudbet, Shuffle, BetFury BFG, WINR, BetSwirl), and five NFT/Ordinals dossiers (ENS, CryptoKitties, The Sandbox LAND, Pizza Ninjas, Nifty Gateway). Current structural coverage is 25/50 top-50 chains, 25 cited DEX/CEX causal maps (the requested minimum), 24 quality-gated casino dossiers, and 46 NFT/Ordinals dossiers. The batch passed focused 11/11 tests, lint, diff check, and the 43-migration guard. New active lanes are `0044` top-50 chains, `0045` casinos, and `0046` NFT/Ordinals; the last will take raw NFT/Ordinals coverage past the requested 50.
- 2026-07-29 corpus expansion update: PR #55 merged; [PR #56](https://github.com/carson-see/Chaindump/pull/56) is the current reviewable release line. It now contains the full 25-case minimum of source-backed DEX/CEX causal maps (five waves) and 19 quality-gated casino dossiers (three expansion waves plus the original four). It also contains ten new detailed NFT/Ordinals dossiers, raising the raw corpus from 31 to 41 on migration replay; 9 more are still required to reach the stated 50-case target. The latest ordered release batch (migrations `0038`–`0040`) passed focused 11/11 tests, lint, diff check, and the global 40-migration guard.
- Current active parallel work after the 25-exchange milestone: Chain Wave-4 is producing five additional top-50 eight-dimension dossiers as migration `0041`; Casino Wave-6 is producing five quality-gated dossiers as `0042`; NFT/Ordinals Wave-5 is producing five detailed dossiers as `0043`. All three must ship canonical source documents, idempotent migrations, parity/schema tests, explicit scope/unknowns, and UI-visible data—not research notes alone.
- 2026-07-29 parallel-wave update: commits `053560b` and `edff82e` are pushed on `codex/nft-art-blocks-20260729` after combined review. Casino migration `0033_casino_wave3.sql` adds five public, quality-gated UI dossiers: FunFair B2B platform, KingTiger Casino, Stake.com, bustabit, and the original WINk gaming platform. Scope controls are explicit (e.g. no verdict about the surviving FUN/WIN token ecosystems; Stake’s conflicting operator/regulator licence statements remain visible). Exchange migration `0034_exchange_wave2_forensic_analysis.sql` adds Aerodrome, PancakeSwap, Osmosis, Mango Markets, and Bittrex; Wave-0/1/2 now supplies 15 publication-gated forensic DEX/CEX maps in total. Combined focused tests passed 13/13; lint and the global 34-migration guard passed. The global guard caught and forced correction of an initially parallel-generated numbering gap before push.
- 2026-07-29 active execution update: branch `codex/nft-art-blocks-20260729` is pushed at `edff82e` before this handoff-only commit. The shared public UI now renders every chain dossier's explicit **Why this outcome**, **Strategic choices**, and **Material unknowns** fields; structured lifecycle/risk/outlook objects render as readable prose rather than disappearing. Casino dossier links now stay inside `/casino/:caseId` in the public research UI and lazy-load cited detail rather than directing readers to raw API JSON. Focused UI tests pass; the full suite currently passes at 50 files / 502 tests. Do not stage unrelated `.claude/` or `archer-agent-config.md`.
- New mergeable research artifacts on this branch: `0030_exchange_wave0_forensic_analysis.sql` plus canonical source JSON and parity/idempotency tests publishes five citation-backed `forensic-analysis-v1` exchange dossiers: Uniswap, Hyperliquid, SushiSwap, FTX, and AscendEX. Each visibly distinguishes observed outcome, causal reasoning, strategic choices, counterfactual, watch signals, unknowns, confidence, and review date. The AscendEX outcome is deliberately scoped to the ceased venue, not an unproven insolvency or customer-recovery conclusion.
- `0031_chain_dossiers_wave3.sql` plus canonical source JSON, reproducible renderer, and validation/idempotency tests publishes five eight-dimension top-50 dossiers: Near, Sui, Plasma, TON, and Aptos. They have per-field sources, date boundaries, explicit nulls, lifecycle events, strategic decisions, risks, synthesis, and unknowns. This raises structural top-50 chain dossier coverage from 15 to 20 when migrations run; it does **not** claim 50/50 completion.
- Two agents remain in parallel execution: Exchange Wave-1 is publishing five additional fully cited DEX/CEX dossiers as migration `0032`; Casino Wave-3 is publishing five fully cited casino cases as migration `0033`. They must return canonical source documents, migrations, parity/schema/idempotency tests, and commits—not audits or unrendered notes. Review, test, push, PR review, and merge work continues in parallel with those waves.
- PR state: #53 is merged. #54 contains the current restoration/UI work and had its two NFT review defects corrected, review threads resolved, and its Sonar duplication scope restricted to declarative SQL migrations. GitHub previously required the `ci-success` status; do not waste execution time polling it. Continue substantive corpus work and review/merge the PR once the normal required gate is available.
- 2026-07-29 continuation: PR #53 is merged after its real expanded-casino identity defect was fixed and its two outdated review threads resolved. PR #54 remains open while its two NFT UI review defects and Sonar duplication gate are addressed. Current root work makes the forensic-analysis contract evidence-gated, exposes previously hidden chain/casino reasoning in the public UI, prevents invented NFT marketplace links and `NaN` descriptive supply, adds visible chain review-freshness sorting, and restores `/api/chain/:name` fallback access to the existing curated dead/mid analysis. Do not stage unrelated `.claude/` or `archer-agent-config.md`.
- Corpus truth from the current audit: 15/50 top-50 chains have structural eight-dimension dossiers (only 8 currently at >=80% field completeness); 52 DEX/CEX rows exist but only 1 is verified and none yet has a publication-grade causal contract; 4/25 casino dossiers are publication-gated; 31 NFT/Ordinals cases exist (16 field-cited, 15 legacy). These are coverage counts, not evidence that the target corpus is complete. All public labels and trend claims must preserve that distinction.
- Six-hour operation: the heartbeat records review debt and exposes it in the UI/API. A future research agent may retrieve and validate sources every six hours and queue evidence-backed proposals, but lifecycle, legal, status, narrative, and causal claims still require human promotion. This applies to chains, DEX/CEX, casinos, NFTs/Ordinals, and future categories.
- Current execution branch: `codex/nft-art-blocks-20260729`, now rebased on the branch that includes merged PR #52. The branch carries migrations `0022`–`0026`; unrelated untracked `.claude/` and `archer-agent-config.md` remain intentionally unstaged.
- Current research delivery: `0026_bitcoin_chain_dossier.sql` publishes Bitcoin as the 14th complete eight-dimension blockchain dossier and is visible in the existing public Blockchain Analysis route/card/detail UI. It intentionally withholds mutable price, fee, activity, hashrate/pool-concentration, capital, and custody metrics until each has a dated source. An adversarial review corrected the false implication that Bitcoin Core's 21M `MAX_MONEY` validation bound proves exact supply; the dossier now leaves `max_supply` null, labels the upper bound correctly, adds the original release artifact and Core-about source, and includes the cited 2018 client-vulnerability disclosure without asserting exploitation. Focused migration/contract tests, lint, and migration guard pass locally.
- Current blockchain delivery: `0028_cardano_chain_dossier.sql` raises the complete top-50 schema-v1 count to 15. It has visible public Blockchain Analysis card/detail rendering, a field-cited Byron-to-Shelley lifecycle, dated native ADA supply evidence, genesis-sale/treasury scope boundaries, and explicit nulls for USD market, TVL, DEX, fee, active-user, and current concentration claims.
- Current NFT/Ordinals delivery: `0029_nft_pudgy_penguins_wave.sql` raises the staged corpus to 31 dossiers, 16 of them field-cited. Pudgy Penguins is a public NFT/Ordinals Analysis dossier with a 2021 mint/supply/price record, a May 2026 direct-current review basis, a visible 2026-08-29 review deadline, and explicit separation of operator-reported product telemetry from NFT price, liquidity, royalty, PENGU, retention, or company-financial conclusions. The official sources are browser-verifiable but return terminal 403 bot challenges in this environment; no source is mislabelled as independently verified market data.
- Current casino delivery: `0027_azuro_verified_dossier.sql` adds Azuro as the fourth quality-passed Web3 casino/gaming dossier and renders it through the existing public Casino Analysis index and detail UI. It is explicitly a multi-chain prediction-market infrastructure control, not a verdict on any frontend. Product/custody/deployment/token fields have reviewed primary citations; wagering, fee revenue, liquidity, users, legal operator, gaming licence, current token supply, and commercial outcome remain visibly withheld/unclassified.
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
- Published cases: 4 quality-passed dossiers (Overtime, Decentral Games Poker Arcade, SX Bet, and Azuro).
- Candidate ledger: 25 target candidates, with 21 partial/withheld after the SX Bet and Azuro promotions.
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

- Continue the existing PR #54 branch, `codex/nft-art-blocks-20260729`, which now contains the Art Blocks NFT dossier, six-hour review heartbeat/UI, primary BitMEX wind-down correction, SX Bet and Azuro casino dossiers, and the Bitcoin blockchain dossier. It is stacked on the now-merged CEX control wave and has been rebased/pushed accordingly.
- Continue the original workflow; it is not done:
  - Continue top-50 blockchain same-format dossier completion.
  - Continue Web3 Casino Analysis beyond the first 4 published records.
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

# chaindump-agent-desk — proposal-only research

An opt-in **Claude Agent SDK** process that researches fresh evidence for
Chaindump's blockchain, DEX/CEX, Web3 casino, and NFT/Ordinals analyses.

**It never publishes.** It reads Chaindump's public freshness and analysis APIs,
verifies external sources with WebFetch, deduplicates against the current
record, and queues field-level evidence candidates. A separate human reviewer
decides whether and how to update the canonical dossier.

## What runs every six hours

Chaindump has three deliberately separate freshness layers:

| Layer | Purpose | Model cost | Can publish analysis? |
| --- | --- | --- | --- |
| Numeric live refresh | Worker cron refreshes live market/snapshot data used by UI metrics. | No | No dossier rewrite |
| Review-debt scan | Worker records which blockchain, exchange, casino, and NFT/Ordinals dossiers are due for review at `/api/forensics-refresh-status`. | No | No; it only records debt counts |
| Proposal agent | `.github/workflows/research-desk.yml` researches overdue/material changes and queues verified evidence candidates. | Yes, when enabled | No; human review is mandatory |

The public `/api/forensics-refresh-status` response reports these as two
separate systems:

- `refresh` is the free six-hour review-debt scanner.
- `proposal_agent` is the latest paid model-backed proposal run, including
  running/completed/failed state and the number of candidates queued.
- `refresh_freshness` and `proposal_agent_freshness` derive `current`, `stale`,
  `failed`, or `unknown` from server time and include the exact last completion,
  age, and next-due timestamp.
- `proposal_agent_last_completed` preserves the exact prior successful
  completion while a newer attempt is running or failed.

The analysis page header renders both states and polls this public status every
five minutes. A completed proposal run never means a dossier was published;
promotion still requires the separate reviewer credential and human action.

The GitHub Action is scheduled at minute 17 every six hours and also supports
manual dispatch. Both paths are skipped unless the repository variable
`RESEARCH_DESK_ENABLED` is exactly `true`. Paid runs are therefore **off by
default**.

## Evidence contract

Each run first reads these public Chaindump surfaces:

- `/api/forensics-refresh-status`
- `/api/chains`
- `/api/exchange-analysis?kind=dex`
- `/api/exchange-analysis?kind=cex`
- `/api/casinos` and `/api/casino/{case_id}`
- `/api/nft`

It then verifies each new source with WebFetch and deduplicates by entity,
field/claim, source URL, and as-of date. The Worker enforces one canonical
`<entity_id>--<field_path>--<as_of>` queue key. Analysis payloads must include
`entity_id`, `field_path`, `claim`, `as_of`, and `source_refs`. Every referenced
source must have a unique `id` and HTTP(S) URL plus `source_type`, a
timezone-qualified `verified_at`, and `verification_result="resolved"`.
Unreferenced, duplicate, malformed, or alternate-slug evidence packets are
rejected. A repeated key may update a pending candidate, but cannot overwrite
human-reviewed queue history.

Analysis proposals should also identify the existing value when known, source
dates, causal reasoning, counterevidence/unknowns, and suggested reviewer
action. Full dossier replacements, bulk status rewrites, and freshness claims
unsupported by current evidence are forbidden.

The four cross-vertical queue types are:

- `blockchain_analysis_candidate`
- `exchange_analysis_candidate`
- `casino_analysis_candidate`
- `nft_lifecycle_candidate`

These types always receive `needs_human_review=true` and are intentionally
absent from the Worker's direct-promotion allowlist. For NFT/Ordinals, lifecycle
evidence must separately address operator activity, community activity,
market/liquidity, utility/benefits, and conflicts in the current lifecycle read.

## GitHub configuration and cost control

Set these repository secrets:

- `RESEARCH_DESK_ANTHROPIC_API_KEY` — model/API credential.
- `RESEARCH_DESK_PROPOSAL_TOKEN` — proposal-only credential for
  `/api/desk/propose`.

Set `RESEARCH_DESK_ENABLED=true` only when four paid research runs per day are
intended. Optional repository variables:

- `RESEARCH_DESK_MODEL` (default `claude-sonnet-5`)
- `RESEARCH_DESK_MAX_TURNS` (default `20`)

Actual cost depends on the selected model, source volume, and tool turns; it is
not fixed. Each completed desk run logs the SDK-reported USD cost when
available. Set `RESEARCH_DESK_ENABLED=false` (or remove it) to stop both
scheduled and manually dispatched paid runs.

`DESK_REVIEW_TOKEN` must never be added to this workflow or agent environment.
It belongs only in the human review environment. It must be distinct from the
proposal token; the Worker fails closed if the values match. The proposal
credential cannot list pending work, promote, or reject proposals.

Before enabling the schedule, production must already have the proposal queue
and run-status migrations applied, and the Worker secret
`DESK_PROPOSAL_TOKEN` must equal the GitHub secret
`RESEARCH_DESK_PROPOSAL_TOKEN`. The separate human-only `DESK_REVIEW_TOKEN`
must be present in the review environment and must not equal either proposal
secret. These are activation requirements; repository code and static tests do
not require, create, or enable paid credentials.

## Local run

```bash
npm ci
npm run build
export ANTHROPIC_API_KEY=...
export DESK_PROPOSAL_TOKEN=...
npm start
```

Environment variables: `ANTHROPIC_API_KEY` (required),
`DESK_PROPOSAL_TOKEN`, `CHAINDUMP_BASE_URL`, `CHAINDUMP_MCP_URL`,
`DESK_TASK`, `DESK_MODEL`, `DESK_MAX_TURNS`, and `DESK_QUEUE_DIR`.
`DESK_TOKEN` remains a temporary proposal-only migration fallback. Without a
proposal token, local development falls back to JSON files in `./proposals`;
the scheduled workflow validates both required secrets before running. When a
proposal token is configured, a failed queue write fails the run instead of
falling back to the ephemeral runner filesystem.

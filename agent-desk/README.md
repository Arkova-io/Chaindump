# chaindump-agent-desk — proposal-only research

An opt-in **Gemini (default) / Claude** process that researches fresh evidence for
Chaindump's blockchain, DEX/CEX, Web3 casino, NFT/Ordinals, stablecoin, RWA,
DePIN, infrastructure, treasury-company, miner, and ETF analyses.

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

## Provider and cost boundary

Gemini is the default provider because it is the lower-cost path for bounded
review-debt scans. The workflow defaults to `gemini-2.5-flash-lite`, six model
turns, and 4,096 output tokens. Set the repository variable
`RESEARCH_DESK_PROVIDER=claude` only when Claude is intentionally selected.
There is no automatic provider fallback: a missing selected-provider key fails
closed before any model request.

The Gemini adapter is deliberately narrower than the Claude Agent SDK adapter:
it gives the model only a read-only `fetch_url` function for public HTTPS
sources and the `queue_proposal` function. It does not expose the chain-intel
MCP server, shell, credentials, promotion, or publication operations. Every
candidate still goes through the same durable queue and human review gate. This
is a safe proposal path while Gemini MCP parity is evaluated; it must not be
described as equivalent to the Claude tool surface.

## Evidence contract

Each run first reads these public Chaindump surfaces:

- `/api/forensics-refresh-status`
- `/api/chains`
- `/api/exchange-analysis?kind=dex`
- `/api/exchange-analysis?kind=cex`
- `/api/casinos` and `/api/casino/{case_id}`
- `/api/nft`
- `/api/stablecoins`
- `/api/rwa`
- `/api/infra`
- `/api/markets`
- `/api/profile-contract` and one selected `/api/profile/{entity_type}/{slug}`

The default budget selects one surface and at most one field-level candidate per
run. It does not bulk-fetch every canonical profile; that keeps the four-times-
daily Gemini job bounded as the corpus grows.

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

The five cross-vertical queue types are:

- `blockchain_analysis_candidate`
- `exchange_analysis_candidate`
- `casino_analysis_candidate`
- `nft_lifecycle_candidate`
- `entity_analysis_candidate` for stablecoins, RWA, DePIN, infrastructure,
  crypto treasury companies, miners, and ETFs. Its `entity_id` must use the
  canonical entity type and slug returned by `/api/profile-contract`.

These types always receive `needs_human_review=true` and are intentionally
absent from the Worker's direct-promotion allowlist. For NFT/Ordinals, lifecycle
evidence must separately address operator activity, community activity,
market/liquidity, utility/benefits, and conflicts in the current lifecycle read.

## GitHub configuration and cost control

Set these repository secrets:

- `RESEARCH_DESK_GEMINI_API_KEY` — Gemini API key (load the value from GCP
  Secret Manager resource `projects/arkova1/secrets/gemini-api-key`; never
  commit or print it). This is required when the provider is `gemini`.
- `RESEARCH_DESK_ANTHROPIC_API_KEY` — Claude API credential, only required
  when `RESEARCH_DESK_PROVIDER=claude`.
- `RESEARCH_DESK_PROPOSAL_TOKEN` — proposal-only credential for
  `/api/desk/propose`.

Set `RESEARCH_DESK_ENABLED=true` only when four paid research runs per day are
intended. Optional repository variables:

- `RESEARCH_DESK_PROVIDER` (default `gemini`; allowed values `gemini`, `claude`)
- `RESEARCH_DESK_MODEL` (default `gemini-2.5-flash-lite` for Gemini)
- `RESEARCH_DESK_MAX_TURNS` (default `6` for Gemini, `20` for Claude)
- `RESEARCH_DESK_MAX_OUTPUT_TOKENS` (default `4096`)

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
export DESK_PROVIDER=gemini
export GEMINI_API_KEY=...
export DESK_PROPOSAL_TOKEN=...
npm start
```

Environment variables: `DESK_PROVIDER` (default `gemini`),
`GEMINI_API_KEY` (required for Gemini) or `ANTHROPIC_API_KEY` (required for
Claude),
`DESK_PROPOSAL_TOKEN`, `CHAINDUMP_BASE_URL`, `CHAINDUMP_MCP_URL`,
`DESK_TASK`, `DESK_MODEL`, `DESK_MAX_TURNS`, `DESK_MAX_OUTPUT_TOKENS`, and
`DESK_QUEUE_DIR`.
`DESK_TOKEN` remains a temporary proposal-only migration fallback. Without a
proposal token, local development falls back to JSON files in `./proposals`;
the scheduled workflow validates both required secrets before running. When a
proposal token is configured, a failed queue write fails the run instead of
falling back to the ephemeral runner filesystem.

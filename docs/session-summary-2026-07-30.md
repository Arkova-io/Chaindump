# Chaindump workflow summary — 2026-07-30

> Historical record. For current production, evidence-completion, standardized
> profile, CI/CD, and UX state, read `handoff.md` and
> `docs/product-corpus-audit-2026-08-03.md`. Several operational statements in
> this document were later disproved by current GitHub and production checks;
> do not use it as release instructions.

## Purpose

This note records the latest production and documentation pass so a future
maintainer can distinguish what is live, what is intentionally gated, and what
still needs an external permission or product-quality follow-up. It is paired
with the longer historical timeline in [`handoff.md`](../handoff.md).

## What shipped

### Normalized forensic report contract

PRs **#110** and **#111** are merged into `main` and included in production
revision `9235c75d825e0e19d45c4691ad6611ca12f16cdf`.

The `normalized-dossier-v1` contract is a real data and rendering contract,
not merely a visual or vocabulary convention. All four Forensics surfaces use
the same normalized order and field names:

1. What it is
2. What happened
3. Why this outcome
4. Strategic choices
5. Operating model
6. Token and value capture
7. Evidence and sources
8. What could have been different
9. Risks and unknowns
10. Lifecycle read
11. Outlook and what to watch
12. Review metadata

The API preserves the same structure that the UI renders. Category-specific
detail remains available below the normalized block, but it no longer changes
the top-level report shape. Unknown, withheld, stale, and unresolved claims are
rendered as states instead of being silently omitted. Sources retain their
field-level references and evidence/review dates.

### Front-end behavior

The refresh-preservation work shipped in the same release line. Background
polling, route remounts, taxonomy fetches, catalog filters, and delegated form
events preserve scroll position, focused controls, and caret state where data
updates do not require a user-visible navigation. This addresses the prior
problem where a dashboard refresh unexpectedly returned the reader to the top.

## Research Desk: what the screenshot means

The three one-second `Research Desk Proposals` entries were workflow-trigger
attempts, not completed research runs. The workflow is configured to skip both
scheduled and manual proposal work unless the repository variable
`RESEARCH_DESK_ENABLED=true`; therefore no paid model call, proposal queue
write, or public dossier promotion occurred in those runs.

The free six-hour refresh scan is a separate, no-cost review-debt mechanism. It
records which dossiers are stale/due and exposes last-completed and next-due
timestamps. It is intentionally human-review-only: it may refresh numeric
telemetry with provenance and prepare evidence candidates, but cannot silently
rewrite lifecycle, legal, causal, narrative, status, or outlook conclusions.

Paid proposal research can be enabled only after all of the following are
verified in the target environment:

- proposal and run-status migrations are applied;
- Worker `DESK_PROPOSAL_TOKEN` matches the GitHub
  `RESEARCH_DESK_PROPOSAL_TOKEN`;
- a distinct human-only `DESK_REVIEW_TOKEN` exists;
- `RESEARCH_DESK_ANTHROPIC_API_KEY` exists; and
- a human explicitly sets `RESEARCH_DESK_ENABLED=true`.

No paid credential or unattended publisher was enabled during this pass.

## Agent discovery status

The current production scan and repository checks establish the following:

| Surface | Status | Boundary |
| --- | --- | --- |
| WebMCP | Live/pass | Four read-only tools register when the browser API exists; no transaction or site mutation tool is exposed. |
| MCP server card | Live/pass | Card points to the hosted streamable HTTP endpoint. |
| API catalog | Live/pass | Catalog links the public API/health surfaces. |
| OAuth/OIDC discovery | Intentionally unavailable | Routes return `oauth_not_configured` until a real issuer, token endpoint, JWKS, and registration policy are supplied. |
| OAuth protected resource metadata | Intentionally unavailable | No protected OAuth API is claimed; do not invent scopes or an authorization server. |
| `auth.md` | Truthful x402 instructions | Chaindump's current agent API is x402/no-account; the external scanner may still require a registration URL. |
| DNS-AID | Not published | DNS records and DNSSEC are blocked by Cloudflare token scopes; committed manifests are not evidence of publication. |

The Cloudflare secret is present in Secret Manager. The current token can read
the zone and manage Worker resources, but Cloudflare rejects DNS record and
DNSSEC API calls because the token lacks DNS Records read/edit and DNSSEC
permissions. The required next step is an operator-approved token-scope
change, followed by the dry-run workflow, explicit apply, registrar DS
publication, and validating-resolver verification (`AD=true`).

## Corpus snapshot

The production corpus smoke reached these indexed-record counts:

- 50 blockchain records;
- 29 DEX records;
- 30 CEX records;
- 29 Web3 casino records; and
- 51 NFT/Ordinals records.

These are coverage counts, not a claim that every record has identical source
depth. Each vertical retains freshness, source dates, unknown/withheld fields,
and review metadata. Lifecycle conclusions remain evidence-gated and must be
promoted by a human after a proposal or refresh scan.

## Verification and release state

- Production health returned `ok: true` at
  `https://chaindump.xyz/api/health` with revision
  `9235c75d825e0e19d45c4691ad6611ca12f16cdf`.
- PRs #110 and #111 are merged; no merged PR is treated as proof of DNS or
  OAuth availability.
- The deploy workflow's production environment gate was satisfied for this
  release line; later main pushes supersede older deploy attempts under the
  repository's concurrency policy.
- The known remaining UI backlog is the browser console icon 404 and residual
  casino jargon/copy cleanup. These do not change the normalized API contract
  or the evidence state of existing dossiers.

## Original direction carried forward

Continue the Chaindump program as a citation-backed forensic research product:
keep Blockchain, DEX/CEX, Web3 Casino, and NFT/Ordinals analyses in one
normalized Solana-style report template; preserve lifecycle freshness and
field-level citations; use sortable, human-readable UI; expand the corpus and
trend taxonomy for a future local SLM; and operate six-hour research as a
proposal/review workflow rather than an unattended publisher. Production
changes must be verified at the health endpoint and external discovery claims
must not be marked live until the relevant resolver/scanner proves them.

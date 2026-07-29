# Web3 Casino Analysis UI integration contract

This document intentionally specifies a neutral, evidence-aware UI before any
casino dossier is promoted. It prevents a research candidate from looking like
a verified operating or legal conclusion.

## Route and navigation

- Route: `/casino-analysis`.
- Sidebar label: **Web3 Casino Analysis**.
- The route reads only `quality_passed = 1` records from `casino_cases` for its
  default results. It must never promote `docs/web3-casino-cohort-2026-07-29.json`
  directly into a public list.
- A separate staff-only coverage view may show counts from `casino_coverage`:
  `quality_passed_count`, `partial_count`, and `missing_count`. It must label
  partial candidates as “research pending”, not as active, licensed, fair, or
  successful products.

## API shape

`GET /api/casinos` accepts `entity_kind`, `product_subtype`, `status`, `chain`,
`token_status`, `jurisdiction`, `sort`, and `cursor`. Every response includes
`as_of`, `quality_passed`, `confidence`, `completeness_pct`, `source_count`,
and `last_reviewed`. A requested licence filter joins `casino_licences` and
returns the entity/domain/activity/jurisdiction scope alongside its status.

`GET /api/casino/:case_id` returns the case, claims, sources, observations,
events, and licence observations. Claims retain `support_direction`; an API
must not discard contradictions. Metrics retain metric dimension, window,
method, and source claim IDs.

`GET /api/casino-coverage` returns methodology version, frozen cohort rule,
universe date, denominator, and quality counts. It is a coverage endpoint, not
a trend endpoint.

## Display and sorting rules

- The table supports sorting only within a named metric dimension, unit,
  currency, window, product scope, method class, and as-of bucket. It never
  creates a single “largest casino” rank from wagers, wallet inflows, token
  market cap, or GGR.
- Status, outcome, token status, custody model, chain scope, and source age are
  visible filters. “No official token identified” displays as a research state,
  never as “no token”.
- Licence cards show exact authority, legal entity, activity, domain,
  jurisdiction, status, and as-of date with an outbound source link. They never
  state global legality.
- Every synthesis sentence links to source claims. A missing, contradictory, or
  unreviewed claim renders a visible evidence-gap marker rather than a polished
  conclusion.

## Publication gate

The UI may render a research-pending empty state until cases pass. A case becomes
visible only after the same server-side validation used by the research editor:
all required claim mappings, editor-reviewed evidence, explicit outcome rule,
no blockers, no human-review flag, and at least 75% completeness. Trends need
five quality-passed cases per comparable stratum and must show denominator,
exclusions, missing count, and small-sample warning.

# Forensic evidence freshness contract

`forensic-freshness-v1` is a category-neutral publication gate for blockchains,
DEX/CEX, casinos, NFT/Ordinals, and future research corpora. It separates when
evidence was created or observed from when an analyst last verified the link.

Every freshness-gated profile carries:

- `evidence_policy.schema`: `forensic-freshness-v1`
- `status_basis`: `direct_current`, `terminal_event`, or `withheld`
- `status_as_of`: date of the evidence supporting the lifecycle label
- `last_verified_at`: later date on which the source and claim were checked
- `next_review_at`: mandatory review target
- `stale`: whether the published status is outside its evidence horizon

Every source carries:

- `source_date`: publication, update, event, or observation date; `null` only
  when the date is explicitly unknown
- `source_date_kind`: `published`, `updated`, `event`, `observed`, or `unknown`
- `last_verified_at`: access/verification date, distinct from `source_date`
- `evidence_scope`: `historical_event`, `mechanism`, `current_state`, or
  `terminal_outcome`
- `stale_after`: required for `current_state` evidence
- `stale`: a boolean checked against `stale_after`

Publication rules:

1. A live status requires a non-stale `current_state` source.
2. A terminal status requires direct `terminal_outcome` evidence.
3. Missing or stale current-state evidence publishes `unknown`; old launch,
   provenance, marketplace, or portfolio pages cannot silently become a current
   lifecycle classification.
4. `lifecycle_status.as_of` equals `status_as_of` and must differ from the
   access/verification date.
5. Historical facts do not expire merely because they are old, but they cannot
   establish current operating status.
6. The UI must show status basis, evidence date, last verification date, stale
   state, and next review target. Source links remain visible at field level.
7. API/UI freshness is recomputed against `next_review_at` at read time. An
   overdue `direct_current` label is returned as `unknown` even if the stored
   row has not yet been refreshed; terminal events remain visible but show an
   overdue-review warning.

The validator is `validateForensicFreshness` in
`src/lib/evidence-freshness.mjs`. It is intentionally independent of entity
type so every forensic product can adopt the same gate.

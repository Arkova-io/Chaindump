# Refreshed outlook and trend taxonomy

As of 2026-07-30, Chaindump treats an outlook as a dated analyst state. It is not evergreen copy. A refreshed outlook must preserve the prior call, say what changed, cite the evidence that changed it, identify unknowns, and set the next review trigger.

The shared contract now lives in `/api/trend-taxonomy` and `/api/slm/training-schema`.

## Required refreshed-outlook sections

- `current_call`
- `prior_call`
- `change_since_last_review`
- `evidence_that_changed_the_call`
- `strategic_choices_or_constraints`
- `watch_signals`
- `unknowns_and_withheld_claims`
- `next_review_at`

## Trend promotion rule

A label can be promoted to `trend` only when the dossier has at least three comparable dated observations with a declared window, denominator, metric contract, comparison key, source/observation date, and reviewer or deterministic-extractor provenance.

If the record has only one screenshot, one operator claim, one stale metric, one incomparable metric, or one regulatory headline without affected actors and an effective date, it stays a state tag, event, or review trigger.

## SLM readiness

The SLM corpus contract is one dated claim, or one withheld claim, per row. Training-eligible records need source URLs, review provenance, metric contract, as-of dates, unknowns, publication support, and a human-review status. Entity-stable and time-stable splits are required so the model does not learn future facts while evaluating historical outlooks.

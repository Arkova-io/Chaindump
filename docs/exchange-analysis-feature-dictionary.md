# Exchange analysis feature dictionary

The exchange library separates decentralized exchanges (DEXs) from centralized
exchanges (CEXs), and separates metrics that sound similar but measure different
economic activity. The normalized overlay in `exchange_case_features` does not
replace the original successful, mid, or dead lifecycle records.

## Unit of analysis

One row represents one venue or explicitly scoped product line at one lifecycle
outcome. `gmx-v1`, for example, is the discontinued GLP-backed product and does
not imply that GMX V2 is dead.

The primary key is:

`kind + slug + lifecycle`

## Operating features

| Field | Meaning |
| --- | --- |
| `kind` | `dex` or `cex`; summaries never mix the two |
| `operating_model` | Plain-language description of custody, matching, and liquidity |
| `product_cohort` | Comparable market structure, such as `spot_amm`, `perpetual_orderbook`, or `centralized_spot_exchange` |
| `custody_model` | `non_custodial` for DEX cases or `custodial` for CEX cases |
| `primary_chain` / `chains` | Deployment context for DEXs; normally empty for CEXs |

## Token-decision features

`token_status` distinguishes a documented launch from `not_identified`. The
latter is deliberately not the stronger claim that a venue never had a token.
`token_launch_timing` records whether launch was near product launch, after an
operating product existed, or unresolved. `token_strategy` describes the
mechanism without treating token launch as a causal success factor.

Token adoption is reported as counts with the known denominator inside each
lifecycle. No success probability is inferred from this observational cohort.

## Metric provenance and comparability

Every row carries explicit `metric_type`, `metric_unit`, `metric_window`, and
`metric_as_of`. A machine-readable comparison key is:

`kind | product_cohort | metric_type | metric_unit | metric_window`

Only cases with the same complete key belong to the same comparison group. The
API returns group membership and lifecycle counts, but deliberately returns no
pooled total or average.

In particular:

- spot volume is not perpetual notional;
- aggregator-routed volume is flow-through and can overlap AMM volume;
- TVL is not trading volume;
- loss exposure is not assets under management;
- a daily observation is not a quarterly observation;
- quarterly spot volume is not quarterly futures notional;
- hack loss, bankruptcy shortfall, customer exposure, and reserve decline retain
  separate metric types;
- DEX and CEX observations are never combined.

## Evidence and data quality

`evidence` points back to the ordered citation list on the underlying lifecycle
record. A token-specific URL is stored separately when one was verified.
`source_replacements` records an audited live URL for a retired citation without
silently rewriting the historical lifecycle row. The API applies that mapping
before publishing citations and leaves the replacement visible in `evidence`.

Quality labels are:

- `verified`: at least two case sources and no recorded feature gap;
- `partial`: at least one case source, with one or more explicit gaps;
- `limited`: missing normalized evidence or a missing feature record.

`quality_issues` is part of the public contract. Unknown token timing, a
non-field-specific token citation, and scoped-product caveats remain visible
instead of being silently imputed.

## API trend envelope

`GET /api/exchange-analysis?kind=dex|cex` returns one kind at a time. Its
`summary` contains lifecycle and quality counts, documented token launches by
lifecycle, product-cohort outcome counts, primary-chain context for DEXs, token
strategy counts, and strict comparison-group membership.

These are descriptive cohort views. The response contains no `totalMetric`,
does not estimate a pooled success rate across heterogeneous products, and does
not claim that a token strategy or host chain caused an outcome.

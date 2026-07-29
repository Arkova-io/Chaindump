# Exchange Dossier Schema v1

> **Purpose:** a machine-checkable research contract for DEX, CEX, and adjacent
> CeFi case studies. It preserves the human-readable Chaindump dossier format
> while making cross-case comparisons reproducible. A case that fails this
> contract may remain a draft, but it must not enter trend aggregates.

## 1. Non-negotiable rules

1. Every material claim and metric has field-level provenance and an `as_of`
   date. Row-level source lists are not sufficient.
2. Status is an observed fact; outcome is an analytical label. Store them
   separately and time-stamp both.
3. A brand, legal entity, product, version, and deployment are different scopes.
   A failed product version must not mark its surviving parent brand as failed.
4. DEX, CEX, lenders, brokers, and custodians are different entity kinds. They
   may share a page template, but not an unqualified analytical cohort.
5. Missing or conflicting evidence is explicit. Unknown values are `null`, never
   inferred from prose.
6. Derived metrics retain their formula and the IDs of every raw input.
7. **An aggregate may include only observations with identical metric
   dimensions and compatible units, windows, scopes, and dates.** TVL, volume,
   token price, assets, liabilities, losses, and customer shortfalls must never
   be summed or averaged together.

## 2. Required case fields

### Identity and scope

| Field | Type | Allowed values / rule |
|---|---|---|
| `case_id` | string | Stable Chaindump ID |
| `entity_id` | string | Canonical organization/protocol ID |
| `product_id` | string | Canonical product ID |
| `product_version` | string \| null | Required when a version can fail independently |
| `parent_product_id` | string \| null | Parent brand/product |
| `successor_product_id` | string \| null | Fork, migration, or replacement |
| `entity_kind` | enum | `dex`, `cex`, `cefi_lender`, `broker`, `custodian` |
| `exchange_subtype` | enum | See controlled vocabulary below |
| `launched` | `YYYY-MM-DD` \| null | Earliest supported precision; also store `date_precision` |
| `chains` | string[] | Canonical chain names; non-empty for DEX |
| `primary_chain` | string \| null | Null only when genuinely chain-neutral |
| `jurisdictions` | string[] | Required for CEX/CeFi where known |

`exchange_subtype` is one of:

- DEX: `amm_constant_product`, `clmm`, `stableswap`, `clob_spot`,
  `perpetuals`, `aggregator`, `rfq`, `cross_chain`, `hybrid_dex`.
- CEX: `spot`, `derivatives`, `spot_and_derivatives`, `hybrid_cex`.
- Adjacent CeFi: `lending`, `brokerage`, `custody`.

### Status and outcome

| Field | Type | Rule |
|---|---|---|
| `status` | enum | `active`, `paused`, `withdrawals_restricted`, `wind_down_announced`, `inactive`, `bankruptcy`, `forked_or_superseded` |
| `status_as_of` | date | Required |
| `status_source_claim_ids` | string[] | At least one |
| `outcome_label` | enum | `successful`, `middling`, `declining`, `failed`, `recovering`, `unclassified` |
| `outcome_as_of` | date | Required |
| `outcome_rule_id` | string | Versioned deterministic rule |
| `outcome_horizon_months` | integer \| null | Required for launch-cohort studies |
| `confidence` | enum | `high`, `medium`, `low` |

An announced future closure remains `wind_down_announced` until operations
actually cease. Do not backdate `inactive` or `failed` to the announcement.

### Token

Every case carries a token block, including no-token cases:

| Field | Type |
|---|---|
| `has_token` | boolean |
| `token_symbol`, `token_cg_id` | string \| null |
| `token_launch_date` | date \| null |
| `governance_utility`, `fee_utility`, `value_capture` | string \| null |
| `circulating_supply`, `total_supply`, `max_supply` | number \| null |
| `market_cap_usd`, `fdv_usd`, `current_price_usd` | number \| null |
| `ath_price_usd`, `ath_date`, `price_drawdown_pct` | number/date \| null |
| `annualized_emissions_pct`, `insider_allocation_pct` | number \| null |
| `as_of`, `source_claim_ids` | date/string[] |

Token launch impact is evaluated as an event study at fixed windows (normally
30, 90, and 365 days), not from a before/after anecdote.

## 3. Metric observations

Store metrics in a long-form observation table or equivalent JSON array:

```json
{
  "observation_id": "dex:uniswap:spot_volume_usd:2026-07",
  "case_id": "dex:uniswap",
  "metric_dimension": "spot_volume",
  "value": 123.45,
  "unit": "usd",
  "currency": "USD",
  "window_start": "2026-07-01",
  "window_end": "2026-07-31",
  "window_definition": "calendar_month_sum",
  "as_of": "2026-08-01",
  "product_scope": "parent_protocol",
  "chain_scope": ["Ethereum"],
  "method": "observed",
  "formula": null,
  "raw_input_ids": [],
  "source_claim_ids": ["claim:example"],
  "quality_flags": []
}
```

Required DEX dimensions, where applicable:

- `spot_volume`, `derivatives_notional`, `tvl`, `fees`, `protocol_revenue`
- `market_share_subtype`, `market_share_chain`
- `volume_to_tvl`, `fee_to_volume`, `incentives_paid`
- `monthly_active_traders`, `trader_retention`
- `liquidity_depth`, with pair, venue, trade size, and slippage threshold
- `top_pool_volume_share`, `top_chain_volume_share`
- `exploit_loss`, `exploit_recovery`, `downtime_hours`

Required CEX dimensions, where applicable:

- `spot_volume` and `derivatives_notional` as separate dimensions
- `customer_assets`, `customer_liabilities`, `reserve_coverage`
- `net_flow`, `withdrawal_latency`, `market_share`
- `regulatory_fines`, `customer_shortfall`, `creditor_recovery`

Never treat self-reported CEX volume as equivalent to independently measured
volume without an explicit source/method flag. Never use TVL alone as a DEX
success label: capital-efficient venues can generate more volume with less TVL.

## 4. Events and chain dependence

Store events as structured rows:

```text
event_id, case_id, event_type, event_date, date_precision,
amount_usd, description, source_claim_ids
```

`event_type` is one of `launch`, `token_launch`, `incentive_start`,
`incentive_end`, `exploit`, `pause`, `withdrawal_restriction`, `regulatory`,
`leadership_change`, `migration`, `fork`, `wind_down_announcement`,
`operations_ceased`, or `bankruptcy`.

To distinguish protocol execution from host-chain effects, compute:

```text
chain_adjusted_change =
  change(log(protocol_metric)) - change(log(host_chain_peer_metric))
```

Record the peer metric, peer-set definition, and raw observation IDs. Event
studies should report 30/90/365-day pre/post changes and a matched control where
one exists.

## 5. Claim-level provenance

Each source and claim is independently addressable:

```text
source_id, canonical_url, title, publisher, published_at, accessed_at,
archive_url, source_tier, source_role

claim_id, case_id, field_path, source_id, evidence_locator,
claim_type, support_direction, analyst_note
```

Source tiers:

- `A`: court/regulator records, audited financials, reproducible on-chain data.
- `B`: established data providers and official technical postmortems.
- `C`: reputable independent reporting.
- `D`: trade press, project statements, or secondary summaries.

`source_role` is `primary`, `independent`, or `aggregator`.
`support_direction` is `supports`, `contradicts`, or `context_only`.

Minimum evidence:

- Every numeric observation: one resolving source with the exact period and
  field, plus retrieval time.
- Material adverse or causal claim: one primary record where available and one
  independent source. If unavailable, lower confidence and state the gap.
- Derived claim: cited raw observations plus a versioned formula.
- A resolving URL is necessary but not sufficient; the cited page must support
  the mapped field and entity.

## 6. Comparable-cohort requirements

The first publishable DEX corpus must contain at least 25 quality-passing
dossiers and include successful, middling, and failed cases. The preferred
minimum is 9 successful, 8 middling, and 8 failed; no outcome class may be less
than 20% of the corpus.

Sampling must be stratified across:

- launch era / market cycle
- exchange subtype
- primary chain or ecosystem
- scale bucket
- token versus no token
- exploit versus no exploit

Each case stores `cohort_id`, `cohort_role` (`case` or `control`),
`selection_rule_id`, and the frozen `selection_as_of`. A trend requires:

1. at least two outcome classes;
2. at least five cases per compared stratum;
3. a documented denominator, including excluded and missing cases;
4. matched or adjusted comparisons for launch era, subtype, and chain where
   those factors could explain the result.

The initial balanced expansion should add at least nine successful controls and
two additional middling controls, then select a frozen 9/8/8 comparison cohort;
extra researched cases may remain in the wider library without entering that
cohort. Successful candidates across distinct designs and chains include
Uniswap, PancakeSwap, Raydium, Aerodrome, Jupiter, Hyperliquid, Curve, Orca,
dYdX, CoW Swap, LFJ/Trader Joe, and THORChain. Candidate labels are not
prejudged: every case must pass the same evidence and outcome-rule gate.

## 7. Aggregation gate

The exact aggregation key is:

```text
entity_kind
+ approved exchange_subtype rollup
+ metric_dimension
+ unit
+ currency
+ window_definition
+ product_scope
+ chain_scope policy
+ as_of bucket
```

Reject the aggregate if any component differs, unless a named, versioned
normalization explicitly converts it. In particular:

- do not sum TVL and token prices;
- do not sum customer assets, liabilities, losses, or shortfalls;
- do not compare daily volume with monthly or quarterly volume without a
  documented conversion;
- do not mix spot volume with derivatives notional;
- do not mix a product version with its parent protocol;
- do not average drawdowns computed from different dimensions.

Every published trend returns `n`, denominator, missing count, metric definition,
observation range, cohort rule, and confidence interval or an explicit
small-sample warning.

## 8. Machine-checkable publication gates

A dossier is `quality_passed=true` only when all checks pass:

1. Schema types and controlled vocabularies validate.
2. Identity scope is unambiguous and parent/successor links are populated.
3. `status`, `outcome_label`, and their `as_of` dates are distinct.
4. Required token and chain fields are present, including explicit no-token.
5. Every non-null material field maps to at least one claim/source.
6. Every metric has dimension, unit, window, scope, and `as_of`.
7. Derived metrics reproduce from stored raw inputs within numeric tolerance.
8. Source URLs resolve or have an archive; entity and field support are checked.
9. Conflicting sources are retained and lower confidence rather than overwritten.
10. No future event is represented as completed at the dossier's `as_of`.
11. Aggregate compatibility passes the exact-key rule above.
12. Completeness is at least 80%, with all critical identity, status, outcome,
    primary metric, token-presence, and provenance fields complete.

## 9. Bias and model-training controls

- Avoid survivorship bias by freezing the candidate universe before research.
- Avoid failure-mode bias by including quiet closures and competitive decline,
  not only well-documented exploits.
- Mark active cases as right-censored; survival is not proof of future success.
- Use chain-adjusted and market-share changes to reduce host-chain and crypto
  cycle confounding.
- Prefer rolling 30-day or calendar-month metrics over a single daily peak.
- Separate observed evidence, derived facts, analyst synthesis, and future
  outlook into different fields.
- Split training/evaluation data by entity and time. Do not place a later version
  or future outcome of the same entity into the evaluation context.
- Treat causal language as a hypothesis unless supported by a predeclared
  comparison or event-study design.

## 10. Honest coverage reporting

Coverage is a first-class dataset:

```text
universe_id, universe_as_of, target_count, quality_passed_count,
partial_count, missing_count, methodology_version
```

For the blockchain top 50 and every future exchange cohort, the UI must display
`quality_passed_count / target_count`. A row count is not dossier coverage.
Do not claim “all top 50 analyzed” until all 50 pass the current quality gate;
surface partial and missing cases explicitly.

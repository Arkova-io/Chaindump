# Web3 Casino Dossier Schema v1

> Status: research contract. A case may be stored as a draft when evidence is
> incomplete, but only `quality_passed = 1` cases may enter trend aggregates.

## Scope

The library covers crypto-native gambling products without treating unlike
businesses as one cohort:

- `custodial_operator`: an operator holds player balances and settles bets.
- `onchain_casino`: wagers and settlement occur in public smart contracts.
- `betting_exchange`: users take opposing positions; the venue takes a fee.
- `bankroll_protocol`: liquidity providers underwrite games or markets.
- `gaming_infrastructure`: chain, oracle, RNG, or software used by operators.

Sportsbooks, poker rooms, prediction markets, and casino games remain separate
`product_subtype` values. Infrastructure and betting exchanges may appear in
the library, but must not enter an operator-level revenue or survival aggregate.

## Non-negotiable evidence rules

1. Brand, legal operator, product, domain, token, and deployment are separate
   scopes.
2. `status` is observed; `outcome_label` is analytical. Both carry an `as_of`.
3. Every material field maps to one or more claim records and resolving sources.
4. A licence is recorded for the exact legal entity, domain, activity, and
   jurisdiction. It never implies legality worldwide.
5. Wallet inflow is not wagers, gross gaming revenue, deposits, reserves, or
   customer assets unless a reproducible method proves that dimension.
6. Operator statements are primary evidence of what the operator claims, not
   independent verification of scale, solvency, fairness, or compliance.
7. A native-token absence is never inferred from silence. Use
   `no_official_token_identified` until an explicit primary source supports
   `none`.
8. Missing evidence is `null`; conflicting evidence remains stored.
9. Active cases are right-censored. Survival today is not a successful outcome.
10. Alleged, charged, pleaded, convicted, dismissed, revoked, suspended, and
    expired are distinct legal states and must not be collapsed.

## Case record

### Identity and product scope

| Field | Type / rule |
|---|---|
| `case_id` | stable slug, primary key |
| `brand_name` | public brand |
| `entity_kind` | controlled vocabulary above |
| `product_subtype` | `casino`, `sportsbook`, `casino_and_sportsbook`, `poker`, `betting_exchange`, `prediction_market`, `bankroll`, `infrastructure` |
| `legal_operator` | legal entity or `null` |
| `parent_entity` | parent organization or `null` |
| `primary_domain` | canonical product domain |
| `launched` | ISO date or partial date |
| `date_precision` | `day`, `month`, `year`, `unknown` |
| `custody_model` | `custodial`, `noncustodial`, `hybrid`, `not_applicable` |
| `chains` | canonical chain names; empty only for an offchain operator |
| `product_scope_note` | explains migrations, rebrands, and excluded products |

### Status and outcome

`status` is one of:

`active`, `restricted`, `paused`, `wind_down_announced`, `inactive`,
`insolvent`, `superseded`, `unknown`.

`outcome_label` is one of:

`successful`, `middling`, `declining`, `failed`, `recovering`, `unclassified`.

Every publishable case stores `status_as_of`, `outcome_as_of`, `outcome_rule_id`,
`confidence`, `quality_passed`, `completeness_pct`, and
`human_review_required`. A candidate ledger may omit an outcome field only when
it is implicitly `unclassified` and `quality_passed` is false; it must not be
silently defaulted at promotion time.

### Token

`token_status` is one of:

- `documented`: a product/ecosystem token is supported by a canonical contract
  or official documentation.
- `none_explicit`: a primary source explicitly establishes no native token.
- `no_official_token_identified`: the official product surface reviewed on the
  stated date disclosed supported payment assets but no product token. This is
  a research control, not proof of permanent absence.
- `not_applicable`: no token belongs to this product scope.
- `unknown`.

Store `token_symbol`, `token_name`, `token_contracts` (chain, address,
contract_role), launch date, utility, fee/revenue rights, supply/allocation,
emissions, CoinGecko ID, market observations, and source claim IDs. A payment
asset such as BTC, ETH, or USDT is not a native token.

### Licence and jurisdiction

Store observations, not a single global flag:

`authority`, `licence_id`, `legal_entity`, `domains`, `activities`,
`jurisdiction`, `licence_status`, `valid_from`, `valid_until`, `as_of`, and
source claims.

### Metrics

All metrics use a long-form observation:

```json
{
  "observation_id": "casino:example:wagers_usd:2026-07",
  "case_id": "example",
  "metric_dimension": "wagers",
  "value": 123.45,
  "unit": "usd",
  "currency": "USD",
  "window_start": "2026-07-01",
  "window_end": "2026-07-31",
  "window_definition": "calendar_month_sum",
  "as_of": "2026-08-01",
  "product_scope": "casino",
  "chain_scope": [],
  "method": "observed",
  "formula": null,
  "raw_input_ids": [],
  "source_claim_ids": ["claim:example"],
  "quality_flags": []
}
```

Allowed dimensions include:

- Operations: `wagers`, `gross_gaming_revenue`, `net_gaming_revenue`,
  `deposits`, `withdrawals`, `active_bettors`, `retained_bettors`,
  `withdrawal_latency`.
- Onchain: `bet_count`, `unique_bettors`, `contract_inflow`,
  `contract_outflow`, `bankroll`, `liquidity`, `fees`, `protocol_revenue`,
  `payouts`, `exploit_loss`, `exploit_recovery`, `downtime_hours`.
- Product: `house_edge`, `return_to_player`, `market_share`,
  `jurisdiction_count`.
- Token: `price`, `market_cap`, `fdv`, `circulating_supply`,
  `token_holder_count`, `token_concentration`, `incentives_paid`,
  `buyback_burn`.

Never aggregate unlike metric dimensions. Self-reported GGR and independently
derived GGR also remain separate methods.

### Events

Events use:

`event_id`, `case_id`, `event_type`, `event_date`, `date_precision`,
`amount_usd`, `description`, and source claims.

`event_type` is one of:

`launch`, `token_launch`, `licence_granted`, `licence_suspended`,
`licence_revoked`, `market_exit`, `exploit`, `pause`,
`withdrawal_restriction`, `leadership_change`, `migration`, `rebrand`,
`wind_down_announcement`, `operations_ceased`, `insolvency`, `acquisition`.

### Synthesis

Human-facing synthesis is written only after the facts pass:

- present situation
- business and product mechanism
- token contribution
- chain dependence
- risk and legal posture
- success/failure hypotheses
- counterfactual
- bull/base/bear outlook
- lessons learned

Each causal sentence cites underlying claim/observation IDs. Hypotheses are
labelled as hypotheses unless a predeclared comparison or event study supports
causality.

## Provenance

Sources:

`source_id`, canonical URL, archive URL, title, publisher, published/accessed
dates, source tier, source role, and content hash where practical. The JSON
ledger uses the compact names `url`, `tier`, and `role`; the migration maps them
to `canonical_url`, `source_tier`, and `source_role`.

`evidence_reviewed` is false (or absent, which means false) until an editor has
opened the cited material and confirmed that its locator supports the mapped
field. A reachable URL is not proof that the page supports a claim. The initial
candidate ledger has **no** editor-reviewed source evidence and therefore no
publishable cases. Persist the reviewer identity and review time with each
positive review so a later URL change can trigger a re-review.

Claims:

`claim_id`, `case_id`, `field_path`, `source_id`, evidence locator,
claim type, support direction, and analyst note.

Source tiers:

- `A`: regulator/court records, audited financials, reproducible raw-chain data.
- `B`: official terms/docs, verified contracts, audits, established data APIs.
- `C`: reputable independent reporting.
- `D`: trade press, marketing, social posts, or secondary summaries.

## Initial cohort and aggregation gates

The first research wave freezes 25 cases across entity kind, token state,
product subtype, chain, launch era, and visible operating state. Candidate
placement is not an outcome label.

An aggregate must key on:

`entity_kind + product_subtype + metric_dimension + unit + currency +
window_definition + product_scope + chain_scope_policy + as_of_bucket +
method_class`.

Every published trend reports `n`, denominator, exclusions, missing count,
observation range, cohort rule, and confidence interval or small-sample warning.
At least five quality-passed cases are required in every compared stratum.

## Migration plan

Migration `0014_casino_analysis.sql` creates normalized research tables:

- `casino_cases`
- `casino_sources`
- `casino_claims`
- `casino_observations`
- `casino_events`
- `casino_syntheses`
- `casino_coverage`

The initial evidence dataset lives in
`docs/web3-casino-cohort-2026-07-29.json`. It deliberately remains a research
artifact until an editor verifies every evidence locator. A later generated,
idempotent migration should promote only `quality_passed = true` cases.

The API should eventually expose:

- `GET /api/casinos`
- `GET /api/casino/:case_id`
- `GET /api/casino-coverage`

The SPA route should be `/casino-analysis`, with a compatibility-neutral page
label “Web3 Casino Analysis.” UI implementation is intentionally outside this
research wave.

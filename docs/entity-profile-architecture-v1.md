# Chaindump canonical entity profiles — architecture v1

**Audit baseline:** corpus and production sampled from `origin/main` at
`5f9c8761dbb0a64786005753893d03694d60b82b` on 2026-08-03 between 15:45 and
16:00 UTC; the implementation was rebased onto `4964435` before verification.

## Decision

Every entity page should read one server-owned, versioned profile shape. The
canonical public boundary is:

```text
GET /api/profile/:entity_type/:slug
GET /api/profile-contract
```

The existing list and detail endpoints remain backward-compatible. The new
endpoint is a read model assembled from the tables that already own each
vertical; it is not another copy of the corpus. A shared materialized-profile
table should be added only when a validator-backed promotion writer exists to
keep it in sync.

The contract and validator live in `src/lib/entity-profile.js`. The current-table
adapters live beside the route in `src/worker.js`. Every adapter returns
`quality.publication_state = "review"` until the record meets the strict v1
publication gate. This is deliberate: the route exposes migration debt without
pretending row-level source lists are field-level proof.

## Why the current implementation reads badly

`normalized-dossier-v1` is a shallow projection, not a canonical entity record.
The server projects four verticals into it, then `public/index.html` independently
reconstructs the same report again from legacy fields. The two implementations
already choose different fallbacks.

Specific production failures observed in this audit:

- `normalizedValue()` recursively turns arrays and objects into prose. An
  evidence JSON string therefore renders as `title: … · url: …` copy, exactly as
  shown in the reported Ethereum screenshot.
- Evidence appears twice: once as a raw `evidence` section and again as the
  source ledger.
- The renderer emits one paragraph of templated “Unknown / not published…” copy
  per missing section. Ten canonical slots can therefore become ten repetitive
  robot paragraphs instead of one compact research-gap disclosure.
- The browser re-derives analysis instead of rendering the API's normalized
  envelope. A server-side redaction can therefore drift from the visible copy.
- Status and analytical outcome are regularly collapsed into one label.
- `normalizedChainDossier()` chooses `row.updated_at` before
  `synthesis.as_of`. On 2026-08-03 the live Ethereum response reported
  `as_of = 2026-07-08 15:06:53` even though its structured synthesis was reviewed
  on 2026-07-29.
- Ethereum's evidence block is a JSON string while its source ledger is an
  array, so the same sources take two incompatible paths through the renderer.
- Stablecoins, RWA, DePIN, decentralized infrastructure, treasuries, miners and
  ETFs have no normalized dossier at all.
- A successful six-hour refresh scan means “review debt was counted,” not
  “analysis was refreshed.” The live scan at 2026-08-03T14:31:03.901Z found
  review-due records but did not rewrite their conclusions.

## Current corpus and coverage

Fresh migrations were applied to a temporary SQLite/D1-compatible database to
inventory seeded source-of-truth rows. Production APIs were sampled separately.

| Vertical | Seeded/current-table coverage | Canonical-depth observations |
|---|---:|---|
| Blockchains | 90 unique names across legacy tables; 55 have all 9 `chain_facts` dimensions; 25 `chain_analysis`, 26 curated dead, 20 curated mid | Live top board is 50. Six-hour scanner saw 66 structured dossiers and 1 due. `/api/chain/:name` alone had `normalized_dossier`; list/postmortem rows did not. |
| DEX | 29 total: 12 dead, 7 mid, 10 successful | Live: 195 high-risk claims, 7 passing and 188 unresolved. |
| CEX | 30 total: 19 dead, 6 mid, 5 successful | Live: 188 high-risk claims, 8 passing and 180 unresolved. |
| Exchange feature overlay | 52 of 59 cases | 51 `partial`, 1 `limited`, 0 `verified`; 7 cases have no feature row. |
| NFT / Ordinals | 51 collections (19 Ethereum, 11 Bitcoin Ordinals, 7 Solana; the remainder spans mixed chain labels) | All 51 say `field-v1` and have evidence/forensic blocks, but live support was 550 high-risk claims, 5 passing, 545 unresolved; 234 registered sources, 9 reachable, 7 reviewed. |
| Web3 casino | 29 cases and syntheses, 138 claims, 108 sources | All 29 have `quality_passed=1`; stored completeness spans 75–94%. Live: 236 high-risk claims, 93 passing, 143 unresolved. |
| Stablecoins | 42 enriched metadata profiles; live ranking returns 50 | At least 8 live-ranked assets lack a matching enriched row before symbol/alias reconciliation. Profiles are row-source-cited, not field-cited. |
| RWA | 10 static case studies | 4 Treasury, 3 credit, 3 tokenization. Live `rwa_live` is cron-populated and empty after a fresh migration. |
| DePIN | 8 static case studies | 3 data, 2 compute, 2 mapping, 1 wireless. Live `depin_live` is cron-populated and empty after a fresh migration. |
| Infrastructure | 15 static profiles | 8 storage, 4 notarization/verification, 3 data availability. |
| Public-market entities | 25 static profiles | 10 crypto treasuries, 8 miners, 7 ETFs. Numeric-looking fields are stored as presentation strings. |

The production payloads also show why list/detail separation is necessary:

| Endpoint | Sample payload size |
|---|---:|
| `/api/chains` | 231 KB |
| `/api/dead` | 630 KB |
| `/api/mid` | 197 KB |
| `/api/exchange-analysis?kind=dex` | 752 KB |
| `/api/exchange-analysis?kind=cex` | 677 KB |
| `/api/nft` | 1.36 MB |
| `/api/casinos` | 224 KB |
| `/api/stablecoins` | 91 KB |
| `/api/rwa` | 145 KB |
| `/api/infra` | 52 KB |
| `/api/markets` | 136 KB |

The old normalized envelope is structurally present but semantically sparse.
Non-null section counts from the live responses were:

| Vertical | What it is | What happened | Why | Strategic choices | Operating model | Token/value | Lifecycle | Outlook/watch |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| DEX (29) | 29 | 1 | 29 | 29 | 29 | 29 | 1 | 29 |
| CEX (30) | 30 | 2 | 30 | 30 | 23 | 30 | 2 | 30 |
| NFT/Ordinals (51) | 0 | 0 | 51 | 51 | 42 | 8 | 0 | 51 |
| Casino (29) | 29 | 0 | 0 | 0 | 0 | 29 | 28 | 0 |

Some of those “present” values are tokens, evidence arrays or fallback labels,
not prose. Counting a non-null adapter slot therefore overstates research depth.

List endpoints currently ship whole profiles and source ledgers. The target is a
small list/card summary plus the canonical detail fetch on expansion or route
navigation.

## Canonical v1 envelope

```json
{
  "schema": "chaindump-entity-profile",
  "version": 1,
  "identity": {
    "id": "blockchain:ethereum",
    "type": "blockchain",
    "slug": "ethereum",
    "name": "Ethereum",
    "aliases": ["ETH"]
  },
  "classification": {
    "subtype": "L1",
    "tags": [],
    "chains": [],
    "jurisdictions": []
  },
  "status": {
    "operating_state": null,
    "as_of": null,
    "claim_ids": []
  },
  "outcome": {
    "label": "thriving",
    "as_of": "2026-07-29",
    "rule_id": "forensic-analysis-v1",
    "confidence": "high",
    "claim_ids": []
  },
  "analysis": {
    "sections": {
      "what_it_is": { "body": "…", "as_of": "2026-07-29", "claim_ids": [] },
      "what_happened": { "body": "…", "as_of": "2026-07-29", "claim_ids": [] },
      "why_this_outcome": { "body": "…", "as_of": "2026-07-29", "claim_ids": [] },
      "strategic_choices": { "body": null, "as_of": null, "claim_ids": [] },
      "operating_model": { "body": null, "as_of": null, "claim_ids": [] },
      "token_and_value_capture": { "body": null, "as_of": null, "claim_ids": [] },
      "counterfactual": { "body": "…", "as_of": "2026-07-29", "claim_ids": [] },
      "risks_and_unknowns": { "body": null, "as_of": null, "claim_ids": [] },
      "lifecycle": { "body": null, "as_of": null, "claim_ids": [] },
      "outlook_and_watch": { "body": null, "as_of": null, "claim_ids": [] }
    }
  },
  "metrics": [],
  "events": [],
  "sources": [],
  "claims": [],
  "freshness": {
    "state": "review_due",
    "last_reviewed_at": "2026-07-29",
    "next_review_at": "2026-08-05",
    "field_reviews": []
  },
  "quality": {
    "publication_state": "review",
    "completeness_pct": 40,
    "confidence": "high",
    "unsourced_fields": [],
    "validation_errors": []
  },
  "extensions": {
    "structured_analysis": {},
    "legacy_unmapped": {}
  }
}
```

Rules:

1. Identity never defaults to “Unnamed case,” `forensics`, or another invented
   value. The canonical ID is `<entity_type>:<slug>`.
2. Operating status and analytical outcome are separate observations with
   separate dates, rules and claims.
3. Every analysis slot exists, but absent content is `null`.
4. Analysis bodies are plain prose strings only. Scenario sets, strategic-choice
   arrays and evidence objects remain structured under `extensions` until a
   category-aware renderer exists.
5. Every metric is a numeric observation with dimension, unit, currency, window,
   scope, method, date and claim IDs. Unlike measures are never aggregated.
6. Every material section, status, outcome, event and metric points to claims;
   every claim points to one or more sources.
7. Unknown top-level fields fail validation. Category-specific fields belong
   under `extensions`.

## Entity types and category metrics

The v1 type registry is:

```text
blockchain, dex, cex, nft_collection, ordinals_collection, web3_casino,
stablecoin, rwa, depin, infrastructure_network, crypto_treasury, miner, etf
```

The authoritative dimension registry is returned by `/api/profile-contract`.
Highlights:

- Blockchain: TVL, stablecoin supply, DEX spot volume, derivatives notional,
  fees, protocol revenue, active addresses, transactions, validators, staking,
  token price/market cap/FDV/volume.
- DEX: spot and derivatives kept separate, TVL, fees, revenue, market share,
  liquidity depth, active/retained traders, incentives, exploit loss/recovery,
  downtime and token metrics.
- CEX: spot and derivatives kept separate, customer assets/liabilities, reserve
  coverage, net flow, withdrawal latency, fines, shortfall/recovery and token
  metrics.
- NFT/Ordinals: floor, market cap, secondary volume, mint raise, royalties,
  holders, supply, sales and unique counterparties; Ordinals also supports
  inscription count.
- Casino: wagers, GGR, NGR, deposits, withdrawals, bettors, bet count,
  bankroll/liquidity, fees/revenue, payouts, house edge/RTP, legal-market breadth,
  exploit/downtime and token metrics.
- Stablecoin: supply, price, peg deviation, reserves/coverage, redemptions,
  transfers, active addresses, holders, yield and attestation coverage.
- RWA: TVL/AUM/outstanding value, issuance/redemption, yield/maturity, holders,
  market cap/volume, defaults and collateral coverage.
- DePIN/infrastructure: nodes, capacity, utilization, geography, revenue/fees,
  market metrics, token emissions, storage use, transactions and activity.

## Current adapter behavior

The read-only route resolves current rows from parameterized queries:

| Type | Current source |
|---|---|
| `blockchain` | `dead_chains`, `mid_chains`, `chain_analysis`, enriched with `chain_facts` |
| `dex`, `cex` | `dead_exchanges`, `mid_exchanges`, `successful_exchanges`, with existing publication-depth redaction |
| `nft_collection`, `ordinals_collection` | `nft_collections`, with existing NFT publication-depth redaction |
| `web3_casino` | normalized `casino_*` tables, observations, events, claims and sources, with existing public redaction |
| `stablecoin` | `stablecoin_meta` |
| `rwa`, `depin` | `rwa_depin`, guarded by category prefix |
| `infrastructure_network` | `infra_chains` |
| `crypto_treasury`, `miner`, `etf` | `market_entities`, guarded by row type |

Unknown enum values and malformed slugs return 400. A valid type/slug with no
matching entity returns 404. SQL table and column names are static; all user
values are bound parameters.

The transitional adapter only moves explicit strings into prose. It does not
join arrays, flatten objects, manufacture citations or claim that `updated_at`
is a market observation. Unmapped structures and validation gaps are preserved.

## Publication, citation and freshness gates

A profile may be served for migration review, but it is publishable only when:

1. The v1 schema and controlled entity/metric vocabularies validate.
2. Every material body/metric/status/outcome/event has an `as_of` and claim IDs.
3. Every claim resolves to a source and at least one supporting claim for each
   material field is human-reviewed.
4. A source is both reachable (or archived) and checked at a recorded time.
   Reachability alone is not evidence review.
5. `last_reviewed_at` and `next_review_at` are present, the next review is not
   overdue and freshness is `current`.
6. Completeness and confidence are explicit. Missing material fields remain in
   `unsourced_fields`; they are not inferred from another field's prose.
7. Legal/adverse/causal claims keep the existing independent-support and
   human-review gates.

Source tiers are `A`, `B`, `C`, `D` or explicit `unknown`; source roles are
`primary`, `independent`, `aggregator` or explicit `unknown`. Legacy sources are
never assigned a stronger tier or independence role merely because one is
missing.

Freshness has two clocks:

- Live numeric observations use source-specific TTLs and keep their own `as_of`,
  window and retrieval time.
- Human analysis uses review deadlines. The six-hour job identifies debt and
  queues proposals; it does not relabel old analysis as current.

When a critical status, outcome, legal or causal field is overdue, its public
body should be withheld until review. Stable background can remain visible with
its date. The page should show one compact freshness line, not repeat freshness
copy inside every section.

## Frontend rendering contract

The frontend should render the server profile, not reconstruct it from legacy
fields.

- Render only non-null `analysis.sections[*].body` values.
- Never recursively stringify an object into prose.
- Render structured outlooks, choices, timelines and category metrics with
  dedicated components.
- Render the deduplicated source ledger once, after the analysis.
- Summarize all missing/unsupported fields in one collapsed “Research gaps (N)”
  panel. Do not emit one robotic placeholder paragraph per slot.
- Keep JSON/API links in developer surfaces, not as primary reader calls to
  action.
- List/card payloads use `profileSummary()` and must not include full analysis,
  claims or source ledgers. Fetch `/api/profile/...` when a detail is opened.

## Migration plan

### Phase 0 — stop presentation damage

Use the current normalized envelope where available, remove recursive object
flattening, remove duplicate evidence rendering, collapse unknowns into one gap
panel and stop linking raw taxonomy/training JSON from reader copy.

### Phase 1 — canonical read boundary (this change)

Ship the v1 contract, strict validator, machine-readable contract route and
current-table adapters. Keep all existing endpoints stable. Treat adapter output
as `review`, not newly verified content.

### Phase 2 — frozen entity registry and gap export

Export one canonical ID per current entity, including alias collisions and exact
legacy locator. Freeze denominators by vertical. Generate a migration queue from
`quality.validation_errors` and `unsourced_fields`; do not silently coerce rows.

Priority order:

1. Ethereum and every page-visible top-50 blockchain profile.
2. Stablecoins and RWA/DePIN because they currently have no field-level claim
   model and much of their prose was last edited around 2026-07-08.
3. Exchanges and NFT/Ordinals by unresolved high-risk claim count.
4. Casinos by unresolved legal/causal claims.
5. Infrastructure and public-market entities, converting numeric presentation
   strings into dated observations.

### Phase 3 — category research waves

For each entity, research into the v1 schema, store exact observations and
field-level claims, run the strict validator, then require human promotion.
Each wave reports denominator, passed, review, withheld and missing counts. A
wave cannot call a corpus complete merely because each legacy row has a JSON
blob.

### Phase 4 — make the canonical profile the page source

Change each detail renderer to fetch `/api/profile/:type/:slug`. Shrink list
endpoints to `profileSummary()` shapes. Delete the browser's legacy fallback
mapping only after route coverage and screenshot/DOM tests pass for every type.

### Phase 5 — optional materialization

If read-model composition becomes a performance problem, add a materialized
profile store only together with its promotion writer, content hash, source-row
revision pointers, invalidation tests and rebuild command. Do not add an empty
table that can drift from the current vertical sources.

## Known gaps requiring product decisions

- Canonical operating-state and analytical-outcome vocabularies still need
  product sign-off; the v1 envelope separates them but does not relabel legacy
  values automatically.
- Chain and exchange source ledgers often lack stable source/claim IDs. The
  adapters correctly report citation gaps instead of inventing IDs that imply
  field support.
- Stablecoin symbol/slug aliases need a frozen registry before claiming the 42
  enriched rows cover a specific subset of the live 50.
- RWA and DePIN live rows are feed observations, not automatically the same
  entities as static case-study slugs. Reconciliation needs explicit IDs.
- Public-market numeric values are strings with units embedded. They require
  source-backed re-extraction, not parsing guesses.
- NFT chain labels contain multiple spellings (`multichain`, `multi-chain`,
  compound labels). Canonical chain IDs should be reviewed, not normalized by
  punctuation alone.
- The contract exposes review-state profiles today. The public renderer must not
  imply that `quality.publication_state = review` means a conclusion is verified.

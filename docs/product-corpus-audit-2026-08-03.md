# Chaindump product and corpus audit — 2026-08-03

## Purpose

This audit separates indexed coverage, structural schema coverage, supported
analysis, and current evidence. Those are four different things. It is the
baseline for the standardized entity-profile program and for any future SLM or
research-agent training work.

## Product benchmark

Live Top 50 is the interaction benchmark: a short human header, current metrics,
sorting/filtering, and progressive detail. The Ethereum report is the content
anatomy benchmark, but not the source/freshness benchmark: its current narrative
is dated 2026-07-08 and still contains missing sections and weak secondary
citations.

Every entity profile must use one report order:

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

Category-specific facts extend that shape. They do not create a second report
template.

## Coverage snapshot

| Category | Indexed | Existing normalized dossier | Complete 12-section report |
| --- | ---: | ---: | ---: |
| Blockchain (live top 50) | 50 | 50 | 0 |
| DEX | 29 | 29 | 1 |
| CEX | 30 | 30 | 2 |
| Web3 casino | 29 | 29 | 0 |
| NFT / Ordinals | 51 | 51 | 0 |
| Stablecoin | 50 ranked; 30 enriched | 0 | 0 |
| RWA / DePIN | 18 curated | 0 | 0 |
| Infrastructure | 15 | 0 | 0 |

An indexed row means only that the product can name and retrieve the entity. A
normalized dossier means only that an API object follows the current shallow
projection. Neither implies a supported causal explanation.

## High-risk evidence debt

| Category | Unresolved | Tracked | Unresolved share |
| --- | ---: | ---: | ---: |
| DEX | 188 | 195 | 96.4% |
| CEX | 180 | 188 | 95.7% |
| Web3 casino | 143 | 236 | 60.6% |
| NFT / Ordinals | 545 | 550 | 99.1% |
| Total | 1,056 | 1,169 | 90.3% |

Publicly supported causal explanations currently exist for 1/29 DEX, 2/30 CEX,
0/29 casino, and 0/51 NFT/Ordinals. The UI must not turn pending-support objects
into prose or imply analytical completion.

## Freshness findings

- The six-hour workflow scans review debt. It does not re-research every report
  and is not a content-freshness guarantee.
- Forty-three of 47 dated chain narratives are more than seven days old at this
  audit date; most are dated July 8 or July 17. Three chain profiles have no
  narrative `as_of` date.
- Stablecoin and RWA/DePIN aggregate narratives are dated July 8 and embed
  mutable metrics in prose.
- NFT/Ordinals rows were procedurally reviewed July 29, but 50/51 lifecycle
  outputs remain unknown and all 51 why-confidence values remain unknown.
- Current SLM export eligibility is not usable training readiness. The exported
  blockchain summary rows omit the narrative and outcome required for useful
  supervised examples.

## UI/UX findings

- Category pages expose research-run state, taxonomy fields, promotion policy,
  SLM schema links, regulatory methodology, and source-registry internals to
  customers.
- `normalizedValue()` recursively flattens arbitrary objects into `key: value`
  text. That is the direct cause of raw metadata in public reports.
- Entity deep links render the category/index and expand one card instead of
  rendering a dedicated profile.
- On the audited mobile viewport, the first entity begins roughly 4,144px down
  on Blockchain, 7,486px on DEX/CEX, 4,075px on Casino, and 7,561px on
  NFT/Ordinals.
- The 30-second live refresh must preserve scroll position, focused control, and
  text selection.

## Required architecture

- One server-owned, versioned entity profile envelope.
- Explicit entity types and category extensions.
- Observed status separated from analytical outcome.
- Nullable human prose sections; one compact gaps block for missing support.
- Claim IDs and `as_of` at the assertion boundary; reviewed sources resolved
  behind those claims.
- Curated source labels/links in the customer UI; registry metadata stays in the
  API/internal workflow.
- Dedicated entity endpoint and dedicated entity route for blockchain, DEX, CEX,
  casino, NFT/Ordinals, stablecoin, RWA, DePIN, and infrastructure.
- Existing API endpoints remain backward-compatible during migration.

## First refresh wave

1. Ethereum — correct upgrade chronology and replace weak secondary citations.
2. USDC — reserves, network footprint, OCC approval, MiCA status, and issuer
   controls.
3. USDT — reserve attestation, MiCA status, supply by chain, and product scope.
4. BlackRock BUIDL — reconcile live TVL with stale narrative and document legal
   claim, custodian, and redemption.
5. Ondo Finance — refresh OUSG/USDY product, redemption, legal, and market data.
6. Binance — current licensing, product availability, asset controls, and
   reserve/liability scope.
7. Bybit — current operating jurisdictions, controls, and reserves/liabilities.
8. Decentral Games Poker Arcade — verify whether the stale casino entity still
   operates or should be retired.
9. Reddit Collectible Avatars — current product, operator, activity, liquidity,
   and lifecycle.
10. SushiSwap — refresh the strongest current DEX causal control and use it as
    the first gold-standard exchange profile.

## Publication rules

- Do not auto-publish causal, legal, lifecycle, loss, adverse, or outlook claims.
- Prefer primary sources for product, protocol, issuer, legal, and regulatory
  facts; use independent sources for outcome and adverse claims.
- Separate evidence date, observation date, access date, and reviewer date.
- Mutable metrics must carry units, scope, methodology, source, and `as_of`.
- Use explicit unknowns. Do not fill a section with generic template language.
- A future SLM trains only on reviewed, narrative-bearing, claim-to-source-linked
  records. Structural rows and withheld claims are not training examples.

-- DAI and Helium normalized profiles, researched 2026-08-03; all claims await human review.
-- Existing profile fields remain in place; the exact prior profile and source list are stored once under legacy_preservation.
DROP TABLE IF EXISTS _dai_helium_gold_0076;
CREATE TABLE _dai_helium_gold_0076 (
  table_name TEXT,
  slug TEXT,
  profile TEXT CHECK(json_valid(profile)),
  sources TEXT CHECK(json_valid(sources)),
  name TEXT,
  symbol TEXT,
  category TEXT,
  status TEXT,
  PRIMARY KEY(table_name, slug)
);
WITH research_document(payload) AS (VALUES ('{
  "schema": "chaindump-dai-helium-gold-v1",
  "as_of": "2026-08-03",
  "generated_migration": "0076_dai_helium_gold_profiles.sql",
  "cases": [
    {
      "table": "stablecoin_meta",
      "slug": "dai",
      "name": "Dai",
      "symbol": "DAI",
      "category": null,
      "status": null,
      "profile": {
        "editorial_guardrails": "Keep DAI separate from USDS. Do not call LitePSM liquidity a universal cash redemption right or call combined Sky figures DAI-only.",
        "current_observation": {
          "observed_at": "2026-08-03T17:26:35Z",
          "circulating_supply_usd": 4795469810.824513,
          "price_usd": 0.9997787144200703,
          "reported_chain_count": 49,
          "source_refs": [
            "dai-market"
          ]
        },
        "canonical_profile": {
          "schema": "chaindump-entity-profile-source",
          "version": 1,
          "classification": {
            "subtype": "crypto-collateralized",
            "tags": [
              "usd-denominated",
              "overcollateralized",
              "multi-collateral",
              "dai-usds-coexistence"
            ],
            "chains": [
              "Ethereum"
            ],
            "jurisdictions": []
          },
          "status": {
            "operating_state": "operating",
            "as_of": "2026-08-03",
            "claim_ids": [
              "claim:dai:status"
            ]
          },
          "outcome": {
            "label": "operating_established",
            "as_of": "2026-08-03",
            "rule_id": "forensic-lifecycle-v1",
            "confidence": "medium",
            "claim_ids": [
              "claim:dai:outcome"
            ]
          },
          "sections": {
            "what_it_is": "DAI is a dollar-denominated token issued by the Maker/Sky credit system. It is not a bank deposit and it is not USDS. Borrowers can create DAI by locking approved collateral in protocol vaults. DAI also moves through exchanges, applications and bridges after it is issued. Some peg support now depends on governance-controlled modules that hold or route stablecoins such as USDC.",
            "what_happened": "Maker built DAI as an on-chain, overcollateralized credit product and later expanded the collateral mix and peg tools. On Sept. 17, 2024, an executed governance transaction initialized the newer USDS system and a one-for-one conversion path between DAI and USDS. DAI remained live. On Aug. 3, 2026, DefiLlama reported about $4.80 billion of DAI representations across 49 chains. That figure is an aggregator snapshot and should not be combined with Sky-wide totals that include USDS.",
            "why_this_outcome": "DAI is still material because it remains embedded in DeFi and the protocol kept it usable while introducing USDS. The vault system, liquidations and peg modules explain how the product can issue credit and defend its price. They do not prove which feature caused adoption. The evidence supports an established, operating product with meaningful circulation; it does not support calling DAI fully decentralized or legally redeemable for dollars.",
            "strategic_choices": "Maker chose pooled collateral and governance-managed risk instead of a single company holding dollars and promising cash redemption. It later added stablecoin-based peg modules, accepting more issuer and freeze exposure in exchange for a tighter route to dollar liquidity. The Sky transition kept DAI live beside USDS rather than forcing every integration to migrate. On June 22, 2026, a governance spell changed LitePSM parameters after a proposal to raise its buffer and gap from 400 million to 800 million DAI. The transaction proves execution; it does not by itself prove better liquidity or lower risk.",
            "operating_model": "Borrowers lock approved collateral and draw DAI under governance-set debt ceilings, fees and liquidation ratios. Unsafe positions can be liquidated and their collateral sold to cancel debt. The LitePSM provides governed swap capacity between DAI, USDS and USDC through linked modules. Independent analysis describes DAI and USDS as sharing aggregate system backing, which makes a clean token-by-token collateral split impractical. Module liquidity can be paused, capped or depleted; it is not a promise that every holder can redeem at a bank.",
            "token_and_value_capture": "DAI is the debt token, not an ownership claim. Borrowers pay stability fees and liquidations may add penalties; protocol accounting and governance decide where those economics go. Savings USDS and other Sky products have separate reward rules. A DAI holder should not be described as receiving USDS savings returns, reserve income or equity in Sky merely because a conversion route exists.",
            "counterfactual": "A crypto-only collateral policy would reduce dependence on stablecoin issuers and off-chain credit, but likely make credit supply and the peg more volatile. A forced move to USDS could concentrate liquidity and branding, but would break some integrations and remove user choice. A direct legal claim on segregated dollars would be easier to explain, but it would create a conventional issuer, banking and eligibility model. The reviewed evidence does not quantify which alternative would have produced more durable demand.",
            "risks_and_unknowns": "DAI can trade away from one dollar. Fast collateral declines, weak auctions, oracle failures, contract bugs or governance mistakes can create losses. USDC and off-chain credit add issuer, custody, freeze and legal exposure. Emergency Shutdown offers a process for claiming a share of settled collateral after system accounting; it is not guaranteed one-dollar cash redemption. A current audited DAI-only split of collateral, LitePSM liquidity and bridged representations was not found, so those values remain unknown.",
            "lifecycle": "DAI is operating and established, but its role has changed. It moved from being Maker’s only dollar token to being the legacy-compatible side of a DAI/USDS system. The executed 2024 conversion path, active 2026 governance and roughly $4.80 billion reported on Aug. 3, 2026 show that it was not discontinued. Its future depends on whether integrations and liquidity remain in DAI or continue moving to USDS.",
            "outlook_and_watch": "Base case: DAI persists where existing integrations and user preference make migration costly, while USDS receives more of Sky’s new distribution and savings activity. Watch DAI-only supply, price deviations, vault debt and collateral, auction performance, LitePSM balances and limits, DAI-to-USDS conversion, USDC concentration and changes to stablecoin rules. Revisit the call if liquidity falls sharply, conversion becomes mandatory or one-way, or a collateral loss leaves unrecovered debt."
          },
          "section_dates": {
            "what_it_is": "2026-08-03",
            "what_happened": "2026-08-03",
            "why_this_outcome": "2026-08-03",
            "strategic_choices": "2026-08-03",
            "operating_model": "2026-08-03",
            "token_and_value_capture": "2026-08-03",
            "counterfactual": "2026-08-03",
            "risks_and_unknowns": "2026-08-03",
            "lifecycle": "2026-08-03",
            "outlook_and_watch": "2026-08-03"
          },
          "section_claim_ids": {
            "what_it_is": [
              "claim:dai:what_it_is:vault-credit",
              "claim:dai:what_it_is:shared-modules"
            ],
            "what_happened": [
              "claim:dai:what_happened:system-development",
              "claim:dai:what_happened:upgrade-executed",
              "claim:dai:what_happened:current-supply"
            ],
            "why_this_outcome": [
              "claim:dai:why_this_outcome:mechanism",
              "claim:dai:why_this_outcome:durability-inference"
            ],
            "strategic_choices": [
              "claim:dai:strategic_choices:collateral-and-psm",
              "claim:dai:strategic_choices:coexistence",
              "claim:dai:strategic_choices:litepsm-change"
            ],
            "operating_model": [
              "claim:dai:operating_model:vaults-liquidations",
              "claim:dai:operating_model:litepsm-liquidity"
            ],
            "token_and_value_capture": [
              "claim:dai:token_and_value_capture:borrower-fees",
              "claim:dai:token_and_value_capture:separate-products"
            ],
            "counterfactual": [
              "claim:dai:counterfactual:collateral-tradeoff",
              "claim:dai:counterfactual:migration-tradeoff"
            ],
            "risks_and_unknowns": [
              "claim:dai:risks_and_unknowns:liquidation-shutdown",
              "claim:dai:risks_and_unknowns:legal-and-collateral-gaps"
            ],
            "lifecycle": [
              "claim:dai:lifecycle:coexistence",
              "claim:dai:lifecycle:material-circulation"
            ],
            "outlook_and_watch": [
              "claim:dai:outlook_and_watch:supply-and-conversion",
              "claim:dai:outlook_and_watch:module-risk"
            ]
          },
          "metrics": [
            {
              "id": "metric:dai:circulating-supply:2026-08-03",
              "dimension": "circulating_supply",
              "label": "Reported circulating DAI representations",
              "value": 4795469810.824513,
              "unit": "usd",
              "currency": "USD",
              "window": {
                "start": null,
                "end": "2026-08-03T17:26:35Z",
                "definition": "point_in_time"
              },
              "as_of": "2026-08-03T17:26:35Z",
              "method": "DefiLlama stablecoin observation checked Aug. 3, 2026",
              "scope": {
                "product": "DAI",
                "chains": []
              },
              "formula": null,
              "raw_input_ids": [],
              "claim_ids": [
                "claim:dai:metric:circulating-supply:2026-08-03"
              ],
              "quality_flags": [
                "aggregator-chain-representations",
                "not-dai-usds-combined"
              ]
            },
            {
              "id": "metric:dai:price:2026-08-03",
              "dimension": "price",
              "label": "DAI price",
              "value": 0.9997787144200703,
              "unit": "usd",
              "currency": "USD",
              "window": {
                "start": null,
                "end": "2026-08-03T17:26:35Z",
                "definition": "point_in_time"
              },
              "as_of": "2026-08-03T17:26:35Z",
              "method": "DefiLlama price observation checked Aug. 3, 2026",
              "scope": {
                "product": "DAI",
                "chains": []
              },
              "formula": null,
              "raw_input_ids": [],
              "claim_ids": [
                "claim:dai:metric:price:2026-08-03"
              ],
              "quality_flags": []
            },
            {
              "id": "metric:dai:peg-deviation:2026-08-03",
              "dimension": "peg_deviation",
              "label": "DAI deviation from one dollar",
              "value": -0.02212855799297,
              "unit": "percent",
              "currency": null,
              "window": {
                "start": null,
                "end": "2026-08-03T17:26:35Z",
                "definition": "point_in_time"
              },
              "as_of": "2026-08-03T17:26:35Z",
              "method": "Derived from the DefiLlama price observation",
              "scope": {
                "product": "DAI",
                "chains": []
              },
              "formula": null,
              "raw_input_ids": [],
              "claim_ids": [
                "claim:dai:metric:peg-deviation:2026-08-03"
              ],
              "quality_flags": [
                "derived"
              ]
            }
          ],
          "events": [
            {
              "id": "event:dai:usds-upgrade:2024-09-17",
              "type": "token_upgrade",
              "date": "2024-09-17",
              "date_precision": "day",
              "amount_usd": null,
              "description": "A governance transaction initialized USDS and the one-for-one DAI/USDS conversion path.",
              "claim_ids": [
                "claim:dai:event:usds-upgrade:2024-09-17"
              ]
            },
            {
              "id": "event:dai:litepsm-capacity:2026-06-22",
              "type": "governance_parameter_change",
              "date": "2026-06-22",
              "date_precision": "day",
              "amount_usd": null,
              "description": "A governance transaction executed the proposed LitePSM parameter changes.",
              "claim_ids": [
                "claim:dai:event:litepsm-capacity:2026-06-22"
              ]
            }
          ],
          "claims": [
            {
              "id": "claim:dai:status",
              "field_path": "status.operating_state",
              "source_ids": [
                "dai-current-governance",
                "dai-market"
              ],
              "evidence_locator": "Current executive-vote index and DefiLlama DAI observation checked Aug. 3, 2026.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:outcome",
              "field_path": "outcome.label",
              "source_ids": [
                "dai-market",
                "dai-upgrade-exec",
                "dai-current-governance"
              ],
              "evidence_locator": "Material DAI circulation, executed DAI/USDS conversion and current governance activity as of Aug. 3, 2026.",
              "support_direction": "supports",
              "note": "Established describes continued material operation, not a legal, investment or decentralization judgment.",
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:what_it_is:vault-credit",
              "field_path": "analysis.sections.what_it_is.body",
              "source_ids": [
                "dai-vat"
              ],
              "evidence_locator": "Vat documentation: sections describing collateralized debt accounting and internally represented Dai balances.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:what_it_is:shared-modules",
              "field_path": "analysis.sections.what_it_is.body",
              "source_ids": [
                "dai-guides",
                "dai-ark-2026"
              ],
              "evidence_locator": "Sky guides: LitePSM and USDS guide entries; ARK report: reserve components and LitePSM sections.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:what_happened:system-development",
              "field_path": "analysis.sections.what_happened.body",
              "source_ids": [
                "dai-vat",
                "dai-liquidation",
                "dai-ark-2026"
              ],
              "evidence_locator": "Maker core-accounting and liquidation documentation plus the ARK report sections on collateral evolution and peg-stability modules.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:what_happened:upgrade-executed",
              "field_path": "analysis.sections.what_happened.body",
              "source_ids": [
                "dai-upgrade-poll",
                "dai-upgrade-exec"
              ],
              "evidence_locator": "Maker poll proposing the one-for-one token upgrade and Blockscout transaction dated 2024-09-17 showing execution.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:what_happened:current-supply",
              "field_path": "analysis.sections.what_happened.body",
              "source_ids": [
                "dai-market"
              ],
              "evidence_locator": "DefiLlama stablecoin 5 response checked 2026-08-03: circulating representations, price and chain balances.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:why_this_outcome:mechanism",
              "field_path": "analysis.sections.why_this_outcome.body",
              "source_ids": [
                "dai-vat",
                "dai-liquidation",
                "dai-guides"
              ],
              "evidence_locator": "Maker technical docs for debt and liquidation; Sky guides for current peg modules.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:why_this_outcome:durability-inference",
              "field_path": "analysis.sections.why_this_outcome.body",
              "source_ids": [
                "dai-market",
                "dai-current-governance",
                "dai-ark-2026"
              ],
              "evidence_locator": "Dated supply observation, current executive-vote index and ARK section describing DAI liquidity concentration in DeFi.",
              "support_direction": "context_only",
              "note": "Analytical inference: these observations support continued material operation, not a measured causal attribution.",
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:strategic_choices:collateral-and-psm",
              "field_path": "analysis.sections.strategic_choices.body",
              "source_ids": [
                "dai-vat",
                "dai-guides",
                "dai-ark-2026"
              ],
              "evidence_locator": "Vat collateral accounting, LitePSM implementation overview and ARK reserve/peg-stability analysis.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:strategic_choices:coexistence",
              "field_path": "analysis.sections.strategic_choices.body",
              "source_ids": [
                "dai-upgrade-poll",
                "dai-upgrade-exec"
              ],
              "evidence_locator": "Upgrade poll and 2024-09-17 execution transaction for the optional DAI/USDS conversion path.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:strategic_choices:litepsm-change",
              "field_path": "analysis.sections.strategic_choices.body",
              "source_ids": [
                "dai-litepsm-proposal",
                "dai-litepsm-exec"
              ],
              "evidence_locator": "June 18 proposal parameter table and June 22 execution transaction; outcome impact is not asserted.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:operating_model:vaults-liquidations",
              "field_path": "analysis.sections.operating_model.body",
              "source_ids": [
                "dai-vat",
                "dai-liquidation"
              ],
              "evidence_locator": "Vat debt-ceiling and collateral accounting sections; Dog/Clipper liquidation flow.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:operating_model:litepsm-liquidity",
              "field_path": "analysis.sections.operating_model.body",
              "source_ids": [
                "dai-guides",
                "dai-ark-2026"
              ],
              "evidence_locator": "Sky LitePSM guide entry and ARK sections “Peg Stability” and “Mint/Redemption Mechanisms.”",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:token_and_value_capture:borrower-fees",
              "field_path": "analysis.sections.token_and_value_capture.body",
              "source_ids": [
                "dai-vat"
              ],
              "evidence_locator": "Vat documentation fields for accumulated stability fees and system debt accounting.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:token_and_value_capture:separate-products",
              "field_path": "analysis.sections.token_and_value_capture.body",
              "source_ids": [
                "dai-guides",
                "dai-ark-2026"
              ],
              "evidence_locator": "Sky guide entries and ARK product comparison separating DAI, USDS and savings products.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:counterfactual:collateral-tradeoff",
              "field_path": "analysis.sections.counterfactual.body",
              "source_ids": [
                "dai-vat",
                "dai-ark-2026"
              ],
              "evidence_locator": "Observed collateral architecture used as context for the crypto-only alternative.",
              "support_direction": "context_only",
              "note": "Counterfactual; reviewed sources do not measure the alternative outcome.",
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:counterfactual:migration-tradeoff",
              "field_path": "analysis.sections.counterfactual.body",
              "source_ids": [
                "dai-upgrade-poll",
                "dai-upgrade-exec"
              ],
              "evidence_locator": "Optional upgrade design used as context for the forced-migration alternative.",
              "support_direction": "context_only",
              "note": "Counterfactual; not a claim that governance considered or rejected this exact alternative.",
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:risks_and_unknowns:liquidation-shutdown",
              "field_path": "analysis.sections.risks_and_unknowns.body",
              "source_ids": [
                "dai-liquidation",
                "dai-shutdown"
              ],
              "evidence_locator": "Liquidation documentation and Cage Keeper settlement process.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:risks_and_unknowns:legal-and-collateral-gaps",
              "field_path": "analysis.sections.risks_and_unknowns.body",
              "source_ids": [
                "dai-ark-2026",
                "dai-mica"
              ],
              "evidence_locator": "ARK limitations on token-specific backing and MiCA text for entity- and activity-specific legal review.",
              "support_direction": "context_only",
              "note": "No blanket legal classification is asserted.",
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:lifecycle:coexistence",
              "field_path": "analysis.sections.lifecycle.body",
              "source_ids": [
                "dai-upgrade-exec",
                "dai-current-governance"
              ],
              "evidence_locator": "Executed 2024 upgrade transaction and current Sky executive-vote index.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:lifecycle:material-circulation",
              "field_path": "analysis.sections.lifecycle.body",
              "source_ids": [
                "dai-market"
              ],
              "evidence_locator": "DefiLlama DAI response checked 2026-08-03.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:outlook_and_watch:supply-and-conversion",
              "field_path": "analysis.sections.outlook_and_watch.body",
              "source_ids": [
                "dai-market",
                "dai-upgrade-exec"
              ],
              "evidence_locator": "Current DAI supply observation and executed conversion path define measurable watch signals.",
              "support_direction": "context_only",
              "note": "Scenario analysis, not a price forecast.",
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:outlook_and_watch:module-risk",
              "field_path": "analysis.sections.outlook_and_watch.body",
              "source_ids": [
                "dai-litepsm-proposal",
                "dai-litepsm-exec",
                "dai-ark-2026"
              ],
              "evidence_locator": "LitePSM proposal, execution and independent module description define liquidity and concentration signals.",
              "support_direction": "context_only",
              "note": "Scenario analysis; no future outcome is claimed.",
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:metric:circulating-supply:2026-08-03",
              "field_path": "metrics[circulating-supply:2026-08-03].value",
              "source_ids": [
                "dai-market"
              ],
              "evidence_locator": "DefiLlama stablecoin observation checked Aug. 3, 2026",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:metric:price:2026-08-03",
              "field_path": "metrics[price:2026-08-03].value",
              "source_ids": [
                "dai-market"
              ],
              "evidence_locator": "DefiLlama price observation checked Aug. 3, 2026",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:metric:peg-deviation:2026-08-03",
              "field_path": "metrics[peg-deviation:2026-08-03].value",
              "source_ids": [
                "dai-market"
              ],
              "evidence_locator": "Derived from the DefiLlama price observation",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:event:usds-upgrade:2024-09-17",
              "field_path": "events[usds-upgrade:2024-09-17]",
              "source_ids": [
                "dai-upgrade-poll",
                "dai-upgrade-exec"
              ],
              "evidence_locator": "Dated record for A governance transaction initialized USDS and the one-for-one DAI/USDS conversion path.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:dai:event:litepsm-capacity:2026-06-22",
              "field_path": "events[litepsm-capacity:2026-06-22]",
              "source_ids": [
                "dai-litepsm-proposal",
                "dai-litepsm-exec"
              ],
              "evidence_locator": "Dated record for A governance transaction executed the proposed LitePSM parameter changes.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            }
          ],
          "freshness": {
            "state": "current",
            "last_reviewed_at": "2026-08-03",
            "next_review_at": "2026-08-10",
            "field_reviews": []
          },
          "confidence": "medium",
          "extensions": {
            "methodology_notes": [
              "The evidence was assembled and checked on Aug. 3, 2026. Every claim remains pending until a person reviews it.",
              "DAI and USDS are separate products. Sky-wide totals are not reported as DAI-only.",
              "LitePSM liquidity is not described as a universal bank redemption right.",
              "Collateral exposure, conversion liquidity and bridged supply require contract-level reconciliation."
            ],
            "structured_analysis": {
              "strategic_choices": [
                {
                  "decision": "Keep DAI live while adding a one-for-one USDS conversion path.",
                  "consequence": "Preserved compatibility and user choice while splitting branding and liquidity."
                },
                {
                  "decision": "Use stablecoin peg modules.",
                  "consequence": "Added a direct route to dollar liquidity while increasing issuer, freeze and governance exposure."
                }
              ],
              "unknowns": [
                {
                  "question": "What is the current DAI-only collateral and LitePSM exposure after separating USDS?",
                  "resolution_trigger": "A dated contract-level debt, collateral and module reconciliation."
                },
                {
                  "question": "How quickly is DAI liquidity moving to USDS?",
                  "resolution_trigger": "Converter flows and venue liquidity tracked separately by token."
                }
              ]
            },
            "review_metadata": {
              "schema": "forensic-freshness-v1",
              "status_basis": "direct_current",
              "status_as_of": "2026-08-03",
              "last_verified_at": "2026-08-03",
              "next_review_at": "2026-08-10",
              "stale": false
            }
          }
        }
      },
      "sources": [
        {
          "id": "dai-vat",
          "title": "Vat — Detailed Documentation",
          "url": "https://docs.makerdao.com/smart-contract-modules/core-module/vat-detailed-documentation",
          "publisher": "MakerDAO Documentation",
          "published_at": null,
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "B",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "dai-liquidation",
          "title": "Dog and Clipper — Detailed Documentation",
          "url": "https://docs.makerdao.com/smart-contract-modules/dog-and-clipper-detailed-documentation",
          "publisher": "MakerDAO Documentation",
          "published_at": null,
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "B",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "dai-shutdown",
          "title": "Cage Keeper — Emergency Shutdown",
          "url": "https://docs.makerdao.com/keepers/cage-keeper",
          "publisher": "MakerDAO Documentation",
          "published_at": null,
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "B",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "dai-upgrade-poll",
          "title": "Launch Project — DAI to USDS and MKR to SKY upgrades",
          "url": "https://vote.makerdao.com/polling/QmTySKwi",
          "publisher": "Maker Governance",
          "published_at": "2024-09-09",
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "A",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "dai-upgrade-exec",
          "title": "Ethereum transaction — USDS and DAI converter execution",
          "url": "https://eth.blockscout.com/tx/0x2221973333bd0c22f8b1b2593fa9817765bafcf65a2d3c25ebde8df06bbd197c",
          "publisher": "Blockscout",
          "published_at": "2024-09-17",
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "B",
          "role": "aggregator",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "dai-litepsm-proposal",
          "title": "Sky executive vote — update LitePSM parameters",
          "url": "https://vote.sky.money/executive/template-executive-vote-onboard-allocator-grove-a-vault-update-litepsm-parameters-replace-stusds-mom-monthly-settlement-cycle-for-may-2026-staking-rewards-normalization-update-safe-harbor-agreement-prime-agent-proxy-spell-june-18-2026",
          "publisher": "Sky Governance",
          "published_at": "2026-06-18",
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "A",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "dai-litepsm-exec",
          "title": "Ethereum transaction — LitePSM parameter execution",
          "url": "https://eth.blockscout.com/tx/0xa2bffc99b76e5a2e2733ac1f5c350c1d7590e5ae74862fad58b2816b7ab8fba6",
          "publisher": "Blockscout",
          "published_at": "2026-06-22",
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "B",
          "role": "aggregator",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "dai-current-governance",
          "title": "Sky executive votes",
          "url": "https://vote.sky.money/executive",
          "publisher": "Sky Governance",
          "published_at": null,
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "A",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "dai-guides",
          "title": "LitePSM implementation and operating constraints",
          "url": "https://github.com/makerdao/dss-lite-psm",
          "publisher": "Sky Ecosystem",
          "published_at": null,
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "A",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "dai-market",
          "title": "Dai stablecoin API",
          "url": "https://stablecoins.llama.fi/stablecoin/5",
          "publisher": "DefiLlama",
          "published_at": null,
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "B",
          "role": "aggregator",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "dai-ark-2026",
          "title": "A Guide To Stablecoins: Multi-Collateral-Backed Stablecoins — DAI, USDS",
          "url": "https://www.ark-invest.com/articles/analyst-research/multi-collateral-backed-stablecoins-dai-usds",
          "publisher": "ARK Investment Management",
          "published_at": "2026-06-25",
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "B",
          "role": "independent",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "dai-mica",
          "title": "Regulation (EU) 2023/1114 on markets in crypto-assets",
          "url": "https://eur-lex.europa.eu/eli/reg/2023/1114/oj",
          "publisher": "European Union",
          "published_at": "2023-06-09",
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "A",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        }
      ]
    },
    {
      "table": "rwa_depin",
      "slug": "helium",
      "name": "Helium",
      "symbol": null,
      "category": "depin-wireless",
      "status": "operating",
      "profile": {
        "what_it_does": "Community-built LoRaWAN connectivity and Wi-Fi carrier offload, paid through Data Credits.",
        "how_it_works": "Local operators provide radios and backhaul; IoT users and mobile carriers pay fixed-dollar Data Credit rates for qualifying traffic.",
        "traction": "Operating after its Solana migration and HIP 138. Blockworks reported 8,281.1 terabytes of carrier-offload traffic in the first quarter of 2026.",
        "business_model": "HNT burns create Data Credits for network fees while scheduled HNT emissions reward network participation. Burns, contracted receipts, emissions and token value are separate measurements.",
        "outlook": "Base case: carrier offload remains the largest observed Mobile use. Watch repeat traffic, contracted rates, carrier concentration, emissions and operator churn.",
        "editorial_guardrails": "Keep traffic, Data Credit burns, cash receipts, emissions and token price separate. Disclose the current HNT/MOBILE reward-documentation conflict.",
        "current_observation": {
          "observed_at": "2026-08-03T17:26:30.797Z",
          "hnt_price_usd": 0.183,
          "hnt_market_cap_usd": 33228293,
          "hnt_circulating_supply": 181567316.0647457,
          "source_refs": [
            "hnt-market"
          ]
        },
        "canonical_profile": {
          "schema": "chaindump-entity-profile-source",
          "version": 1,
          "classification": {
            "subtype": "depin-wireless",
            "tags": [
              "lorawan",
              "carrier-offload",
              "wifi",
              "burn-and-mint"
            ],
            "chains": [
              "Solana"
            ],
            "jurisdictions": [
              "United States",
              "Mexico"
            ]
          },
          "status": {
            "operating_state": "operating",
            "as_of": "2026-08-03",
            "claim_ids": [
              "claim:helium:status"
            ]
          },
          "outcome": {
            "label": "operating_mixed",
            "as_of": "2026-08-03",
            "rule_id": "forensic-lifecycle-v1",
            "confidence": "medium",
            "claim_ids": [
              "claim:helium:outcome"
            ]
          },
          "sections": {
            "what_it_is": "Helium is a community-built wireless network with two products: low-bandwidth LoRaWAN service for connected devices and Wi-Fi carrier offload for mobile subscribers. Local operators provide radios, sites, power and internet access. Network customers use fixed-dollar Data Credits. Reward language is not fully consistent: protocol documents say network participants receive HNT after HIP 138, while a Feb. 25, 2026 carrier FAQ still says some hotspot owners may earn MOBILE. This report treats the denomination as a documentation conflict that needs verification.",
            "what_happened": "Helium began as a LoRaWAN network with its own blockchain, added mobile coverage, and moved protocol execution to Solana on April 18, 2023. HIP 138 later ended new MOBILE and IOT reward emissions and returned protocol rewards to HNT, while legacy tokens, treasuries and governance remained. Blockworks reported 8,281.1 terabytes of carrier-offload traffic and $3.56 million of carrier-offload Data Credit burn in the first quarter of 2026. CoinGecko observed HNT at about $0.18 and a $33.2 million market value on Aug. 3, 2026. Token price does not measure network use.",
            "why_this_outcome": "Helium has moved beyond a coverage-only experiment because the network recorded substantial carrier-offload traffic in the first quarter of 2026. Its operator model can place radios without a carrier owning every site, and Data Credits give customers a fixed-dollar unit for network fees. Those features explain how the system works; they do not prove that it is cheaper than every conventional deployment or that demand will persist. The current evidence supports an operating network with real usage and unresolved economic questions.",
            "strategic_choices": "Helium chose community-owned hardware, token incentives and fixed-dollar Data Credits. It then moved execution from its own chain to Solana, exchanging control of the base layer for dependence on Solana programs and infrastructure. HIP 138 reversed the separate MOBILE/IOT reward design after the proposal identified complexity and treasury imbalances. Carrier offload adds quality and verified-traffic rules instead of paying every hotspot equally. The reviewed sources describe these choices; they do not isolate how much each choice changed demand or cost.",
            "operating_model": "Hotspot operators buy hardware, secure a location, supply power and internet backhaul, and follow network quality rules. IoT users pay Data Credits in 24-byte increments. Mobile carriers use Passpoint to authorize subscriber offload, and qualifying traffic can earn operator rewards. One Data Credit is priced at $0.00001 and is created by burning HNT. Protocol documents point to HNT rewards after HIP 138, but the current carrier FAQ still references MOBILE; operators should verify the program’s actual payout asset before relying on either page.",
            "token_and_value_capture": "HNT is burned to create Data Credits and is emitted under a schedule to reward network participation. Gross Data Credit burn includes more than paid traffic, so it should not automatically be called cash revenue. Blockworks values first-quarter carrier-offload burn at the protocol’s $0.50-per-gigabyte accounting rate and warns that contracted carrier rates can be lower. Scheduled net emissions can replace about 1,644 HNT per day of burns, and the annual schedule beginning Aug. 1, 2026 is 7.5 million HNT. Usage, cash receipts, token burns, emissions and market price are different measures.",
            "counterfactual": "Keeping a proprietary blockchain would preserve more control but require continued consensus and tooling work. Keeping separate MOBILE and IOT emissions could retain subnetwork-specific incentives while preserving the complexity and treasury imbalance described in HIP 138. Paying only for traffic would align rewards more tightly with demand but could leave new areas uncovered before customers arrive. The reviewed sources do not establish which alternative would produce more durable coverage or better operator returns.",
            "risks_and_unknowns": "The main risk is that operator rewards and hardware costs outrun recurring customer demand. Carrier contracts can change, traffic may be concentrated, poor locations may earn little, and a lower HNT price can weaken operator payback. First-quarter Data Credit burn is protocol accounting, not audited cash receipts. Current public sources do not disclose all carrier names, contract rates, unique traffic-carrying radios or operator churn. The conflict between current MOBILE wording and HIP 138’s HNT design is another unresolved operational risk.",
            "lifecycle": "Helium is operating after two major design changes: the 2023 Solana migration and the 2025 deployment of HIP 138. Telefónica and Nova Labs announced a Mexico trial in 2024; that is a commercial partner statement about one trial, not independent proof of broad carrier adoption. More recent Blockworks data shows material carrier-offload traffic in the first quarter of 2026. The network has evidence of use, but its long-term outcome still depends on repeat traffic and subsidy-adjusted operator economics.",
            "outlook_and_watch": "Base case: carrier offload remains the largest observed source of Helium Mobile usage while LoRaWAN serves a narrower device market. The first-quarter 2026 data supports that dated statement, not a permanent growth forecast. Watch carrier-offload terabytes, traffic-only Data Credit burn, contracted rates, named-carrier concentration, active traffic-carrying radios, IoT packets, HNT emissions, MOBILE/IOT treasury conversions and operator churn. Revisit the call if repeat traffic weakens, rewards materially exceed demand, or documentation and payouts remain inconsistent."
          },
          "section_dates": {
            "what_it_is": "2026-08-03",
            "what_happened": "2026-08-03",
            "why_this_outcome": "2026-08-03",
            "strategic_choices": "2026-08-03",
            "operating_model": "2026-08-03",
            "token_and_value_capture": "2026-08-03",
            "counterfactual": "2026-08-03",
            "risks_and_unknowns": "2026-08-03",
            "lifecycle": "2026-08-03",
            "outlook_and_watch": "2026-08-03"
          },
          "section_claim_ids": {
            "what_it_is": [
              "claim:helium:what_it_is:network-products",
              "claim:helium:what_it_is:reward-conflict"
            ],
            "what_happened": [
              "claim:helium:what_happened:architecture-changes",
              "claim:helium:what_happened:usage-and-market"
            ],
            "why_this_outcome": [
              "claim:helium:why_this_outcome:observed-usage",
              "claim:helium:why_this_outcome:mechanism-inference"
            ],
            "strategic_choices": [
              "claim:helium:strategic_choices:operator-and-data-credit-model",
              "claim:helium:strategic_choices:solana-dependency",
              "claim:helium:strategic_choices:token-reversal",
              "claim:helium:strategic_choices:traffic-quality"
            ],
            "operating_model": [
              "claim:helium:operating_model:operator-and-carrier-flow",
              "claim:helium:operating_model:data-credit-rates",
              "claim:helium:operating_model:reward-conflict"
            ],
            "token_and_value_capture": [
              "claim:helium:token_and_value_capture:burn-and-emissions",
              "claim:helium:token_and_value_capture:dc-burn-not-cash"
            ],
            "counterfactual": [
              "claim:helium:counterfactual:chain-alternative",
              "claim:helium:counterfactual:reward-alternative"
            ],
            "risks_and_unknowns": [
              "claim:helium:risks_and_unknowns:economics-gap",
              "claim:helium:risks_and_unknowns:carrier-and-reward-gaps"
            ],
            "lifecycle": [
              "claim:helium:lifecycle:design-corrections",
              "claim:helium:lifecycle:commercial-and-usage-evidence"
            ],
            "outlook_and_watch": [
              "claim:helium:outlook_and_watch:dated-demand-base",
              "claim:helium:outlook_and_watch:economic-signals"
            ]
          },
          "metrics": [
            {
              "id": "metric:helium:hnt-price:2026-08-03",
              "dimension": "price",
              "label": "HNT price",
              "value": 0.183,
              "unit": "usd",
              "currency": "USD",
              "window": {
                "start": null,
                "end": "2026-08-03T17:26:30.797Z",
                "definition": "point_in_time"
              },
              "as_of": "2026-08-03T17:26:30.797Z",
              "method": "CoinGecko market snapshot checked Aug. 3, 2026",
              "scope": {
                "product": "HNT",
                "chains": [
                  "Solana"
                ]
              },
              "formula": null,
              "raw_input_ids": [],
              "claim_ids": [
                "claim:helium:metric:hnt-price:2026-08-03"
              ],
              "quality_flags": []
            },
            {
              "id": "metric:helium:hnt-market-cap:2026-08-03",
              "dimension": "market_cap",
              "label": "HNT market capitalization",
              "value": 33228293,
              "unit": "usd",
              "currency": "USD",
              "window": {
                "start": null,
                "end": "2026-08-03T17:26:30.797Z",
                "definition": "point_in_time"
              },
              "as_of": "2026-08-03T17:26:30.797Z",
              "method": "CoinGecko market snapshot checked Aug. 3, 2026",
              "scope": {
                "product": "HNT",
                "chains": [
                  "Solana"
                ]
              },
              "formula": null,
              "raw_input_ids": [],
              "claim_ids": [
                "claim:helium:metric:hnt-market-cap:2026-08-03"
              ],
              "quality_flags": []
            },
            {
              "id": "metric:helium:annual-emissions:2026-08-01",
              "dimension": "token_emissions",
              "label": "Scheduled annual HNT emissions",
              "value": 7500000,
              "unit": "hnt",
              "currency": null,
              "window": {
                "start": null,
                "end": "2026-08-01",
                "definition": "point_in_time"
              },
              "as_of": "2026-08-01",
              "method": "Helium emissions schedule",
              "scope": {
                "product": "HNT",
                "chains": [
                  "Solana"
                ]
              },
              "formula": null,
              "raw_input_ids": [],
              "claim_ids": [
                "claim:helium:metric:annual-emissions:2026-08-01"
              ],
              "quality_flags": [
                "scheduled-not-realized"
              ]
            },
            {
              "id": "metric:helium:carrier-offload-dc-burn:q1-2026",
              "dimension": "fees",
              "label": "Carrier-offload Data Credit burn",
              "value": 3560000,
              "unit": "usd",
              "currency": "USD",
              "window": {
                "start": "2026-01-01",
                "end": "2026-03-31",
                "definition": "calendar_quarter"
              },
              "as_of": "2026-03-31",
              "method": "Blockworks Q1 2026 protocol-accounting value; contracted carrier cash rates can be lower",
              "scope": {
                "product": "Helium Mobile",
                "chains": [
                  "Solana"
                ]
              },
              "formula": null,
              "raw_input_ids": [],
              "claim_ids": [
                "claim:helium:metric:carrier-offload-dc-burn:q1-2026"
              ],
              "quality_flags": [
                "protocol-dc-burn-not-cash-receipts",
                "blockworks-methodology"
              ]
            },
            {
              "id": "metric:helium:carrier-offload-transfer:q1-2026",
              "dimension": "utilization",
              "label": "Carrier-offload data transferred",
              "value": 8281.1,
              "unit": "terabytes",
              "currency": null,
              "window": {
                "start": "2026-01-01",
                "end": "2026-03-31",
                "definition": "calendar_quarter"
              },
              "as_of": "2026-03-31",
              "method": "Blockworks Q1 2026 carrier-offload transfer total",
              "scope": {
                "product": "Helium Mobile",
                "chains": [
                  "Solana"
                ]
              },
              "formula": null,
              "raw_input_ids": [],
              "claim_ids": [
                "claim:helium:metric:carrier-offload-transfer:q1-2026"
              ],
              "quality_flags": [
                "independent-reporting"
              ]
            }
          ],
          "events": [
            {
              "id": "event:helium:solana-migration:2023-04-18",
              "type": "chain_migration",
              "date": "2023-04-18",
              "date_precision": "day",
              "amount_usd": null,
              "description": "Helium completed migration from its purpose-built blockchain to Solana.",
              "claim_ids": [
                "claim:helium:event:solana-migration:2023-04-18"
              ]
            },
            {
              "id": "event:helium:telefonica-trial:2024-01-24",
              "type": "commercial_trial",
              "date": "2024-01-24",
              "date_precision": "day",
              "amount_usd": null,
              "description": "Telefónica and Nova Labs announced a Helium Mobile hotspot trial in Mexico.",
              "claim_ids": [
                "claim:helium:event:telefonica-trial:2024-01-24"
              ]
            },
            {
              "id": "event:helium:hip138-deployed:2025-02-24",
              "type": "tokenomics_change",
              "date": "2025-02-24",
              "date_precision": "day",
              "amount_usd": null,
              "description": "The HIP 138 tracker was labeled deployed after votes to return network rewards to HNT.",
              "claim_ids": [
                "claim:helium:event:hip138-deployed:2025-02-24"
              ]
            }
          ],
          "claims": [
            {
              "id": "claim:helium:status",
              "field_path": "status.operating_state",
              "source_ids": [
                "mobile-docs",
                "dc-docs",
                "hnt-q1-2026"
              ],
              "evidence_locator": "Current product documentation and independently reported Q1 2026 usage.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:outcome",
              "field_path": "outcome.label",
              "source_ids": [
                "hnt-q1-2026",
                "hip138-track",
                "carrier-offload"
              ],
              "evidence_locator": "Q1 2026 carrier-offload usage, deployed HIP 138 tracker and current carrier-program documentation.",
              "support_direction": "supports",
              "note": "Mixed reflects verified usage alongside unresolved reward, contract and operator-economics gaps.",
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:what_it_is:network-products",
              "field_path": "analysis.sections.what_it_is.body",
              "source_ids": [
                "mobile-docs",
                "dc-docs"
              ],
              "evidence_locator": "Helium documentation sections describing the Mobile network and fixed-dollar Data Credits.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:what_it_is:reward-conflict",
              "field_path": "analysis.sections.what_it_is.body",
              "source_ids": [
                "hip138",
                "carrier-offload"
              ],
              "evidence_locator": "HIP 138 summary and reward-payout sections compared with FAQ lines “Key Benefits for Hotspot Owners” and “MOBILE rewards.”",
              "support_direction": "supports",
              "note": "The sources conflict; this claim reports the conflict instead of selecting one page as current truth.",
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:what_happened:architecture-changes",
              "field_path": "analysis.sections.what_happened.body",
              "source_ids": [
                "solana-migration",
                "hip138",
                "hip138-track"
              ],
              "evidence_locator": "Legacy-data migration page, HIP 138 implementation text and deployed tracking issue.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:what_happened:usage-and-market",
              "field_path": "analysis.sections.what_happened.body",
              "source_ids": [
                "hnt-q1-2026",
                "hnt-market"
              ],
              "evidence_locator": "Blockworks Q1 2026 traffic and Data Credit burn tables; CoinGecko response checked Aug. 3, 2026.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:why_this_outcome:observed-usage",
              "field_path": "analysis.sections.why_this_outcome.body",
              "source_ids": [
                "hnt-q1-2026"
              ],
              "evidence_locator": "Q1 2026 Mobile Offload KPI table: carrier-offload transfer and Data Credit burn.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:why_this_outcome:mechanism-inference",
              "field_path": "analysis.sections.why_this_outcome.body",
              "source_ids": [
                "dc-docs",
                "carrier-offload"
              ],
              "evidence_locator": "Data Credit mechanics and carrier-offload program description.",
              "support_direction": "context_only",
              "note": "Mechanism-level inference; no universal cost advantage or causal weight is asserted.",
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:strategic_choices:operator-and-data-credit-model",
              "field_path": "analysis.sections.strategic_choices.body",
              "source_ids": [
                "mobile-docs",
                "dc-docs"
              ],
              "evidence_locator": "Helium Mobile network overview and Data Credit price/burn documentation.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:strategic_choices:solana-dependency",
              "field_path": "analysis.sections.strategic_choices.body",
              "source_ids": [
                "solana-migration"
              ],
              "evidence_locator": "Helium legacy-blockchain page documenting the April 2023 Solana migration.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:strategic_choices:token-reversal",
              "field_path": "analysis.sections.strategic_choices.body",
              "source_ids": [
                "hip138",
                "hip138-track"
              ],
              "evidence_locator": "HIP 138 summary, value-imbalance and implementation sections plus deployed tracker.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:strategic_choices:traffic-quality",
              "field_path": "analysis.sections.strategic_choices.body",
              "source_ids": [
                "rewardable-data",
                "carrier-offload"
              ],
              "evidence_locator": "Rewardable Data eligibility and carrier program rules.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:operating_model:operator-and-carrier-flow",
              "field_path": "analysis.sections.operating_model.body",
              "source_ids": [
                "mobile-docs",
                "carrier-offload"
              ],
              "evidence_locator": "Mobile network overview and carrier FAQ Passpoint/operator sections.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:operating_model:data-credit-rates",
              "field_path": "analysis.sections.operating_model.body",
              "source_ids": [
                "dc-docs"
              ],
              "evidence_locator": "Data Credit price and network-fee schedule.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:operating_model:reward-conflict",
              "field_path": "analysis.sections.operating_model.body",
              "source_ids": [
                "hip138",
                "carrier-offload"
              ],
              "evidence_locator": "HIP 138 direct-HNT payout language versus February 2026 FAQ MOBILE language.",
              "support_direction": "supports",
              "note": "Current operator documentation conflict; payout denomination is withheld.",
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:token_and_value_capture:burn-and-emissions",
              "field_path": "analysis.sections.token_and_value_capture.body",
              "source_ids": [
                "hnt-docs",
                "dc-docs",
                "hip138"
              ],
              "evidence_locator": "HNT burn, net-emission schedule and HIP 138 reward sections.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:token_and_value_capture:dc-burn-not-cash",
              "field_path": "analysis.sections.token_and_value_capture.body",
              "source_ids": [
                "hnt-q1-2026"
              ],
              "evidence_locator": "Blockworks Q1 2026 methodology note that protocol valuation uses $0.50/GB while contracted carrier rates can be lower.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:counterfactual:chain-alternative",
              "field_path": "analysis.sections.counterfactual.body",
              "source_ids": [
                "solana-migration"
              ],
              "evidence_locator": "Documented migration used as context for the proprietary-chain alternative.",
              "support_direction": "context_only",
              "note": "Counterfactual; no measured alternative outcome.",
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:counterfactual:reward-alternative",
              "field_path": "analysis.sections.counterfactual.body",
              "source_ids": [
                "hip138"
              ],
              "evidence_locator": "HIP 138 alternatives and drawbacks sections.",
              "support_direction": "context_only",
              "note": "Counterfactual; outcomes are not quantitatively estimated.",
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:risks_and_unknowns:economics-gap",
              "field_path": "analysis.sections.risks_and_unknowns.body",
              "source_ids": [
                "hnt-q1-2026",
                "hnt-docs"
              ],
              "evidence_locator": "Q1 2026 income-statement methodology and HNT emissions schedule.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:risks_and_unknowns:carrier-and-reward-gaps",
              "field_path": "analysis.sections.risks_and_unknowns.body",
              "source_ids": [
                "carrier-offload",
                "rewardable-data",
                "hip138"
              ],
              "evidence_locator": "FAQ confidentiality disclaimer, reward eligibility rules and HIP 138 reward design.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:lifecycle:design-corrections",
              "field_path": "analysis.sections.lifecycle.body",
              "source_ids": [
                "solana-migration",
                "hip138-track"
              ],
              "evidence_locator": "Dated Solana migration record and deployed HIP 138 tracker.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:lifecycle:commercial-and-usage-evidence",
              "field_path": "analysis.sections.lifecycle.body",
              "source_ids": [
                "telefonica",
                "hnt-q1-2026"
              ],
              "evidence_locator": "Telefónica/Nova Labs trial announcement and independent Q1 2026 usage report.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:outlook_and_watch:dated-demand-base",
              "field_path": "analysis.sections.outlook_and_watch.body",
              "source_ids": [
                "hnt-q1-2026"
              ],
              "evidence_locator": "Q1 2026 carrier-offload transfer, burn and daily-user observations.",
              "support_direction": "context_only",
              "note": "Scenario baseline; not an evergreen growth claim.",
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:outlook_and_watch:economic-signals",
              "field_path": "analysis.sections.outlook_and_watch.body",
              "source_ids": [
                "dc-docs",
                "hnt-docs",
                "carrier-offload"
              ],
              "evidence_locator": "Data Credit, emissions and carrier-program mechanics define the watch signals.",
              "support_direction": "context_only",
              "note": "Scenario analysis, not a token price forecast.",
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:metric:hnt-price:2026-08-03",
              "field_path": "metrics[hnt-price:2026-08-03].value",
              "source_ids": [
                "hnt-market"
              ],
              "evidence_locator": "CoinGecko market snapshot checked Aug. 3, 2026",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:metric:hnt-market-cap:2026-08-03",
              "field_path": "metrics[hnt-market-cap:2026-08-03].value",
              "source_ids": [
                "hnt-market"
              ],
              "evidence_locator": "CoinGecko market snapshot checked Aug. 3, 2026",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:metric:annual-emissions:2026-08-01",
              "field_path": "metrics[annual-emissions:2026-08-01].value",
              "source_ids": [
                "hnt-docs"
              ],
              "evidence_locator": "Helium emissions schedule",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:metric:carrier-offload-dc-burn:q1-2026",
              "field_path": "metrics[carrier-offload-dc-burn:q1-2026].value",
              "source_ids": [
                "hnt-q1-2026"
              ],
              "evidence_locator": "Blockworks Q1 2026 protocol-accounting value; contracted carrier cash rates can be lower",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:metric:carrier-offload-transfer:q1-2026",
              "field_path": "metrics[carrier-offload-transfer:q1-2026].value",
              "source_ids": [
                "hnt-q1-2026"
              ],
              "evidence_locator": "Blockworks Q1 2026 carrier-offload transfer total",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:event:solana-migration:2023-04-18",
              "field_path": "events[solana-migration:2023-04-18]",
              "source_ids": [
                "solana-migration"
              ],
              "evidence_locator": "Dated record for Helium completed migration from its purpose-built blockchain to Solana.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:event:telefonica-trial:2024-01-24",
              "field_path": "events[telefonica-trial:2024-01-24]",
              "source_ids": [
                "telefonica"
              ],
              "evidence_locator": "Dated record for Telefónica and Nova Labs announced a Helium Mobile hotspot trial in Mexico.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            },
            {
              "id": "claim:helium:event:hip138-deployed:2025-02-24",
              "field_path": "events[hip138-deployed:2025-02-24]",
              "source_ids": [
                "hip138",
                "hip138-track"
              ],
              "evidence_locator": "Dated record for The HIP 138 tracker was labeled deployed after votes to return network rewards to HNT.",
              "support_direction": "supports",
              "note": null,
              "review": {
                "state": "pending",
                "reviewer": null,
                "reviewed_at": null
              }
            }
          ],
          "freshness": {
            "state": "current",
            "last_reviewed_at": "2026-08-03",
            "next_review_at": "2026-08-10",
            "field_reviews": []
          },
          "confidence": "medium",
          "extensions": {
            "methodology_notes": [
              "The evidence was assembled and checked on Aug. 3, 2026. Every claim remains pending until a person reviews it.",
              "Installed hotspots, traffic, Data Credit burns, cash receipts, emissions and token price are separate signals.",
              "Blockworks values Data Credit burn at protocol rates; it warns contracted carrier rates can be lower.",
              "HIP 138 and a current carrier FAQ conflict on HNT versus MOBILE reward wording; the report does not hide that conflict."
            ],
            "structured_analysis": {
              "strategic_choices": [
                {
                  "decision": "Move protocol execution to Solana.",
                  "consequence": "Removed a proprietary base layer while adding Solana program and infrastructure dependency."
                },
                {
                  "decision": "End new subnetwork-token reward emissions and return rewards to HNT.",
                  "consequence": "Simplified the token system while leaving legacy tokens, treasuries and governance in place."
                }
              ],
              "unknowns": [
                {
                  "question": "How much current Data Credit spend is repeat carrier and IoT traffic rather than onboarding?",
                  "resolution_trigger": "Reconciled burn categories, payer cohorts and contracted cash rates."
                },
                {
                  "question": "Are operator rewards sustainable?",
                  "resolution_trigger": "Traffic receipts, rewards, hardware cost and churn by hotspot cohort."
                },
                {
                  "question": "Which asset do current carrier-offload participants actually receive?",
                  "resolution_trigger": "Reconciled protocol payout data and corrected operator documentation."
                }
              ]
            },
            "review_metadata": {
              "schema": "forensic-freshness-v1",
              "status_basis": "direct_current",
              "status_as_of": "2026-08-03",
              "last_verified_at": "2026-08-03",
              "next_review_at": "2026-08-10",
              "stale": false
            }
          }
        }
      },
      "sources": [
        {
          "id": "hnt-docs",
          "title": "The Helium Network Token",
          "url": "https://docs.helium.com/tokens/hnt-token/",
          "publisher": "Helium Documentation",
          "published_at": null,
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "B",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "dc-docs",
          "title": "Data Credit",
          "url": "https://docs.helium.com/tokens/data-credit/",
          "publisher": "Helium Documentation",
          "published_at": null,
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "B",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "mobile-docs",
          "title": "The Mobile Network",
          "url": "https://docs.helium.com/mobile/5g-on-helium/",
          "publisher": "Helium Documentation",
          "published_at": null,
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "B",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "solana-migration",
          "title": "Legacy blockchain data",
          "url": "https://docs.helium.com/network-data/legacy-blockchain-data/",
          "publisher": "Helium Documentation",
          "published_at": null,
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "B",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "hip138",
          "title": "HIP 138: Return to HNT",
          "url": "https://github.com/helium/HIP/blob/main/0138-return-to-hnt.md",
          "publisher": "Helium Improvement Proposals",
          "published_at": "2024-11-08",
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "A",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "hip138-track",
          "title": "HIP 138 tracking issue",
          "url": "https://github.com/helium/HIP/issues/1120",
          "publisher": "Helium Improvement Proposals",
          "published_at": "2024-11-08",
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "A",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "carrier-offload",
          "title": "Helium Mobile Carrier Offload Program FAQ",
          "url": "https://hardware.hellohelium.com/en/articles/9903527-helium-mobile-carrier-offload-program-faq",
          "publisher": "Helium Mobile",
          "published_at": "2026-02-25",
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "B",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "rewardable-data",
          "title": "What is Rewardable Data?",
          "url": "https://hardware.hellohelium.com/en/articles/13172155-what-is-rewardable-data",
          "publisher": "Helium Mobile",
          "published_at": "2026-02-27",
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "B",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "telefonica",
          "title": "Telefónica and Nova Labs launch Helium Mobile Hotspots in Mexico",
          "url": "https://www.telefonica.com/en/communication-room/press-room/telefonica-and-nova-labs-launch-helium-mobile-hotspots-in-mexico/",
          "publisher": "Telefónica",
          "published_at": "2024-01-24",
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "A",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "hnt-market",
          "title": "Helium market API",
          "url": "https://api.coingecko.com/api/v3/coins/helium",
          "publisher": "CoinGecko",
          "published_at": null,
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "B",
          "role": "aggregator",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        },
        {
          "id": "hnt-q1-2026",
          "title": "Helium Network Q1 2026 report",
          "url": "https://blockworks.com/api/investor-report/investor-relations-report-q1-2026/pdf",
          "publisher": "Blockworks Research",
          "published_at": null,
          "accessed_at": "2026-08-03T17:26:35Z",
          "archive_url": null,
          "tier": "B",
          "role": "independent",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:26:35Z",
          "content_hash": null
        }
      ]
    }
  ]
}'))
INSERT INTO _dai_helium_gold_0076
SELECT
  json_extract(j.value, '$.table'),
  json_extract(j.value, '$.slug'),
  json_extract(j.value, '$.profile'),
  json_extract(j.value, '$.sources'),
  json_extract(j.value, '$.name'),
  json_extract(j.value, '$.symbol'),
  json_extract(j.value, '$.category'),
  json_extract(j.value, '$.status')
FROM research_document, json_each(json_extract(payload, '$.cases')) j;
UPDATE stablecoin_meta AS row
SET
  name = s.name,
  symbol = s.symbol,
  profile = CASE
    WHEN json_type(COALESCE(row.profile, '{}'), '$.legacy_preservation.previous_profile') IS NULL THEN
      json_set(
        json_remove(json_patch(COALESCE(row.profile, '{}'), json(s.profile)), '$.sources'),
        '$.legacy_preservation.previous_profile', json(COALESCE(row.profile, '{}')),
        '$.legacy_preservation.previous_sources', json(COALESCE(row.sources, '[]')),
        '$.legacy_preservation.preserved_at', '2026-08-03'
      )
    ELSE json_remove(json_patch(COALESCE(row.profile, '{}'), json(s.profile)), '$.sources')
  END,
  sources = s.sources,
  updated_at = '2026-08-03'
FROM _dai_helium_gold_0076 s
WHERE s.table_name = 'stablecoin_meta' AND lower(row.slug) = s.slug;
UPDATE rwa_depin AS row
SET
  name = s.name,
  category = s.category,
  status = s.status,
  profile = CASE
    WHEN json_type(COALESCE(row.profile, '{}'), '$.legacy_preservation.previous_profile') IS NULL THEN
      json_set(
        json_remove(json_patch(COALESCE(row.profile, '{}'), json(s.profile)), '$.sources'),
        '$.legacy_preservation.previous_profile', json(COALESCE(row.profile, '{}')),
        '$.legacy_preservation.previous_sources', json(COALESCE(row.sources, '[]')),
        '$.legacy_preservation.preserved_at', '2026-08-03'
      )
    ELSE json_remove(json_patch(COALESCE(row.profile, '{}'), json(s.profile)), '$.sources')
  END,
  sources = s.sources,
  updated_at = '2026-08-03'
FROM _dai_helium_gold_0076 s
WHERE s.table_name = 'rwa_depin' AND lower(row.slug) = s.slug;
DROP TABLE _dai_helium_gold_0076;

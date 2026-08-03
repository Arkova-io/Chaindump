-- Quantum Cats source-linked Ordinals profile, researched 2026-08-03 and awaiting human review.
-- The canonical JSON document is embedded so clean-database replay is deterministic.
-- Existing legacy evidence structures are preserved; canonical consumers use canonical_profile.

DROP TABLE IF EXISTS _quantum_cats_profile_0072;

CREATE TABLE _quantum_cats_profile_0072 (
  slug TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  legacy TEXT NOT NULL CHECK (json_valid(legacy)),
  canonical_profile TEXT NOT NULL CHECK (json_valid(canonical_profile))
);

-- canonical-payload-start
WITH research_document(payload) AS (
  VALUES ('{
  "schema": "chaindump-research-profile-document",
  "version": 1,
  "researched_at": "2026-08-03T17:01:09Z",
  "generated_migration": "0072_quantum_cats_profile.sql",
  "entity": {
    "type": "ordinals_collection",
    "slug": "quantum-cats",
    "status": "middling",
    "canonical_profile": {
      "schema": "chaindump-entity-profile",
      "version": 1,
      "identity": {
        "id": "ordinals_collection:quantum-cats",
        "type": "ordinals_collection",
        "slug": "quantum-cats",
        "name": "Quantum Cats",
        "aliases": []
      },
      "classification": {
        "subtype": "evolving Ordinals art and protocol-advocacy collection",
        "tags": [
          "bitcoin_ordinals",
          "evolving_art",
          "op_cat_advocacy",
          "pfp_collection"
        ],
        "chains": [
          "Bitcoin Ordinals"
        ],
        "jurisdictions": []
      },
      "status": {
        "operating_state": "operating",
        "as_of": "2026-08-03",
        "claim_ids": [
          "claim:quantum-cats:status"
        ]
      },
      "outcome": {
        "label": "middling_declining",
        "as_of": "2026-08-03",
        "rule_id": "nft-lifecycle-evidence-v1",
        "confidence": "medium",
        "claim_ids": [
          "claim:quantum-cats:outcome"
        ]
      },
      "analysis": {
        "sections": {
          "what_it_is": {
            "body": "Quantum Cats is a fixed collection of 3,333 evolving Bitcoin Ordinals created by Taproot Wizards. The art and its changing states are built around a campaign to restore OP_CAT, a Bitcoin scripting operation that was disabled in 2010. Owning a Cat means owning the inscription and participating in the collection’s culture; it does not give the holder a vote over Bitcoin, a legal claim on Taproot Wizards, or the power to activate OP_CAT. The collection therefore works as both digital art and a public advocacy device, but those are different from contractual holder utility.",
            "as_of": "2026-08-03",
            "claim_ids": [
              "claim:quantum-cats:section:what_it_is"
            ]
          },
          "what_happened": {
            "body": "Taproot Wizards announced the collection in January 2024 after spending about $66,000 to inscribe roughly 10 MB of encrypted artwork and future states on Bitcoin. The one-of-one Genesis Cat sold at Sotheby’s for 6.31 BTC, reported as about $254,000. The public mint then suffered three technical delays, but all 3,000 public-sale Cats were claimed at 0.1 BTC each; CoinDesk described nearly $13 million of gross sales. In 2025, qualifying Cat holders received a one-time discount on the Taproot Wizards mint. The reported Cat floor then fell 54 percent around that event. In the 2026-08-03 CoinGecko snapshot, the collection had one reported sale in 24 hours, so that snapshot cannot establish a liquid market or a reliable collection-wide valuation.",
            "as_of": "2026-08-03",
            "claim_ids": [
              "claim:quantum-cats:section:what_happened"
            ]
          },
          "why_this_outcome": {
            "body": "The launch succeeded at raising money and attention because it combined scarce on-chain art, a visible technical experiment, the Taproot Wizards brand and a concrete Bitcoin policy campaign. The evolving artwork made the OP_CAT argument easier to explain than a specification alone. Demand was also helped by expectations around the wider Taproot Wizards ecosystem, including the later discounted mint. That benefit was temporary: the sharp floor reset after the Wizards mint is consistent with some event-driven demand leaving once the discount had been used, although the cited reporting does not prove a single cause. The result is a culturally visible collection with thin current observed trading, not evidence of a failed project or a deeply liquid asset.",
            "as_of": "2026-08-03",
            "claim_ids": [
              "claim:quantum-cats:section:why_this_outcome"
            ]
          },
          "strategic_choices": {
            "body": "Taproot Wizards tied the collection directly to OP_CAT instead of building a general Bitcoin art brand. It pre-inscribed encrypted future states and said the evolution schedule was predetermined, using Bitcoin itself as the storage and reveal layer. The team chose a premium fixed public price of 0.1 BTC and an allowlist-led sale; that captured substantial revenue but made the mint sensitive to Bitcoin prices and raised expectations for future value. It later connected Cats to the Taproot Wizards collection through a 50 percent mint discount for qualifying entangled pairs. These choices created a coherent campaign and strong launch economics, while also concentrating the collection’s meaning and some demand around one protocol debate and one operator ecosystem.",
            "as_of": "2026-08-03",
            "claim_ids": [
              "claim:quantum-cats:section:strategic_choices"
            ]
          },
          "operating_model": {
            "body": "Taproot Wizards develops the art, publishes the campaign and maintains the public collection experience. Bitcoin stores the inscriptions, while collectors control the satoshis carrying their Cats and use third-party marketplaces for secondary trades. The operator said the future art states were encrypted and pre-inscribed, limiting its ability to change individual outcomes after launch, but buyers still rely on Taproot Wizards for communication, interpretation and ecosystem activity. BIP authors and Bitcoin Core contributors control neither the collection nor its holder benefits, and Cat holders do not control the BIP process. Corporate fundraising supports the broader Taproot Wizards company and OP_CAT work; it is not collection treasury revenue owed to holders.",
            "as_of": "2026-08-03",
            "claim_ids": [
              "claim:quantum-cats:section:operating_model"
            ]
          },
          "token_and_value_capture": {
            "body": "The reviewed record does not establish a separate Quantum Cats fungible token, an equity interest, a revenue share or a governance right. Collection value is captured first through the primary sale and then by holders only if they can sell their individual inscriptions or use a stated benefit. The 3,000-piece public sale at 0.1 BTC implies about 300 BTC of gross proceeds; CoinDesk reported nearly $13 million at the time. The Genesis Cat auction was a separate one-of-one sale. Taproot Wizards later raised $7.5 million and $30 million as company financing, which must not be counted as value accruing to Cat holders. Audited collection costs, profit, royalties, marketplace fees and the distribution of proceeds were not found in the reviewed sources.",
            "as_of": "2026-08-03",
            "claim_ids": [
              "claim:quantum-cats:section:token_and_value_capture"
            ]
          },
          "counterfactual": {
            "body": "A lower mint price or a simpler sale system could have reduced the launch failures and the amount of capital buyers put at risk, but it also would have reduced primary-sale revenue and may have weakened the premium positioning. More repeatable holder benefits or a product independent of OP_CAT could give collectors reasons to remain active after a one-time mint discount, yet that would change the project from a focused advocacy collection into a broader membership program. A clearer public ledger of royalties, spending and future benefits would make value capture easier to evaluate. These are plausible alternatives, not measured results; the available record does not show what demand or floor price would have been under any of them.",
            "as_of": "2026-08-03",
            "claim_ids": [
              "claim:quantum-cats:section:counterfactual"
            ]
          },
          "risks_and_unknowns": {
            "body": "The central risk is narrative dependence: if OP_CAT loses momentum, is rejected or becomes less culturally important, the collection loses part of the story that differentiates it. BIP 347 being marked “Complete” means the specification is complete; it does not mean OP_CAT is active on Bitcoin. The reviewed Bitcoin Core master interpreter still treats OP_CAT as disabled. Market evidence is also weak: CoinGecko showed one 24-hour sale, and a listed floor plus an aggregator market-cap estimate is not an executable bid, broad liquidity or realized collection valuation. Other unknowns include holder concentration beyond the reported address count, current royalties, repeat benefits, reveal timing, legal and intellectual-property terms, operator commitments and the age of CoinGecko’s underlying marketplace data.",
            "as_of": "2026-08-03",
            "claim_ids": [
              "claim:quantum-cats:section:risks_and_unknowns"
            ]
          },
          "lifecycle": {
            "body": "Taproot Wizards raised a reported $7.5 million seed round in November 2023 and announced Quantum Cats in January 2024. Genesis Cat sold on 2024-01-22. After three delays, the public mint finished on 2024-02-05. The collection then served as a continuing OP_CAT campaign while the proposal entered the BIP process. Taproot Wizards raised another reported $30 million in February 2025 for broader OP_CAT work. A discounted Taproot Wizards mint gave qualifying Cat holders a concrete but one-time benefit in March 2025, followed by a reported floor reset. BIP 347 was marked specification-complete in March 2026, while OP_CAT remained disabled in the reviewed Bitcoin Core code. The collection website and operator remain active; current secondary-market depth remains unproven.",
            "as_of": "2026-08-03",
            "claim_ids": [
              "claim:quantum-cats:section:lifecycle"
            ]
          },
          "outlook_and_watch": {
            "body": "The base case is that Quantum Cats remains an active but thinly traded cultural and advocacy collection. The upside case requires a real OP_CAT activation path, a meaningful new use for Cats, new art states or sustained collector activity that is visible in more than a few sales. The downside case is gradual loss of attention if the protocol campaign stalls and no repeat reason to own a Cat appears. Watch released Bitcoin Core versions and activation proposals rather than the BIP label alone; also watch 30- and 90-day sales, executable bids, buyer and seller counts, holder concentration, reveal events, operator communications, repeat holder benefits and any documented royalties. Do not use a single floor listing, an aggregator market cap or the price of another Taproot Wizards asset as a proxy for Cat liquidity or holder returns.",
            "as_of": "2026-08-03",
            "claim_ids": [
              "claim:quantum-cats:section:outlook_and_watch"
            ]
          }
        }
      },
      "metrics": [
        {
          "id": "metric:quantum-cats:floor-btc:2026-08-03T17:00:05Z",
          "dimension": "floor_price",
          "label": "Listed floor",
          "value": 0.01044696,
          "unit": "btc",
          "currency": "BTC",
          "window": {
            "start": null,
            "end": "2026-08-03T17:00:05Z",
            "definition": "point_in_time"
          },
          "as_of": "2026-08-03T17:00:05Z",
          "method": "CoinGecko marketplace aggregate",
          "scope": {
            "collection": "Quantum Cats",
            "chain": "Bitcoin Ordinals"
          },
          "formula": null,
          "raw_input_ids": [],
          "claim_ids": [
            "claim:quantum-cats:metric:floor-btc"
          ],
          "quality_flags": [
            "listing_not_executable_bid",
            "underlying_marketplace_timestamp_unavailable",
            "not_liquidity_measure"
          ]
        },
        {
          "id": "metric:quantum-cats:market-cap-btc:2026-08-03T17:00:05Z",
          "dimension": "market_cap",
          "label": "Aggregator-estimated collection market cap",
          "value": 34.82,
          "unit": "btc",
          "currency": "BTC",
          "window": {
            "start": null,
            "end": "2026-08-03T17:00:05Z",
            "definition": "point_in_time"
          },
          "as_of": "2026-08-03T17:00:05Z",
          "method": "CoinGecko collection estimate",
          "scope": {
            "collection": "Quantum Cats",
            "chain": "Bitcoin Ordinals"
          },
          "formula": null,
          "raw_input_ids": [],
          "claim_ids": [
            "claim:quantum-cats:metric:market-cap-btc"
          ],
          "quality_flags": [
            "aggregator_estimate",
            "not_realized_valuation",
            "underlying_marketplace_timestamp_unavailable"
          ]
        },
        {
          "id": "metric:quantum-cats:volume-24h-btc:2026-08-03T17:00:05Z",
          "dimension": "secondary_volume",
          "label": "Reported secondary volume, rolling 24 hours",
          "value": 0.010447,
          "unit": "btc",
          "currency": "BTC",
          "window": {
            "start": null,
            "end": "2026-08-03T17:00:05Z",
            "definition": "rolling_24h"
          },
          "as_of": "2026-08-03T17:00:05Z",
          "method": "CoinGecko marketplace aggregate",
          "scope": {
            "collection": "Quantum Cats",
            "chain": "Bitcoin Ordinals"
          },
          "formula": null,
          "raw_input_ids": [],
          "claim_ids": [
            "claim:quantum-cats:metric:volume-24h-btc"
          ],
          "quality_flags": [
            "one_reported_sale",
            "thin_observation",
            "underlying_marketplace_timestamp_unavailable"
          ]
        },
        {
          "id": "metric:quantum-cats:sales-24h:2026-08-03T17:00:05Z",
          "dimension": "sales",
          "label": "Reported sales, rolling 24 hours",
          "value": 1,
          "unit": "count",
          "currency": null,
          "window": {
            "start": null,
            "end": "2026-08-03T17:00:05Z",
            "definition": "rolling_24h"
          },
          "as_of": "2026-08-03T17:00:05Z",
          "method": "CoinGecko marketplace aggregate",
          "scope": {
            "collection": "Quantum Cats",
            "chain": "Bitcoin Ordinals"
          },
          "formula": null,
          "raw_input_ids": [],
          "claim_ids": [
            "claim:quantum-cats:metric:sales-24h"
          ],
          "quality_flags": [
            "thin_observation",
            "not_liquidity_measure",
            "underlying_marketplace_timestamp_unavailable"
          ]
        },
        {
          "id": "metric:quantum-cats:holders:2026-08-03T17:00:05Z",
          "dimension": "holders",
          "label": "Unique holder addresses",
          "value": 1638,
          "unit": "addresses",
          "currency": null,
          "window": {
            "start": null,
            "end": "2026-08-03T17:00:05Z",
            "definition": "point_in_time"
          },
          "as_of": "2026-08-03T17:00:05Z",
          "method": "CoinGecko marketplace aggregate",
          "scope": {
            "collection": "Quantum Cats",
            "chain": "Bitcoin Ordinals"
          },
          "formula": null,
          "raw_input_ids": [],
          "claim_ids": [
            "claim:quantum-cats:metric:holders"
          ],
          "quality_flags": [
            "addresses_not_people",
            "underlying_marketplace_timestamp_unavailable"
          ]
        },
        {
          "id": "metric:quantum-cats:supply:2026-08-03",
          "dimension": "supply",
          "label": "Collection supply",
          "value": 3333,
          "unit": "inscriptions",
          "currency": null,
          "window": {
            "start": null,
            "end": "2026-08-03",
            "definition": "fixed_collection_count"
          },
          "as_of": "2026-08-03",
          "method": "Official collection count corroborated by CoinGecko",
          "scope": {
            "collection": "Quantum Cats",
            "chain": "Bitcoin Ordinals"
          },
          "formula": null,
          "raw_input_ids": [],
          "claim_ids": [
            "claim:quantum-cats:metric:supply"
          ],
          "quality_flags": []
        },
        {
          "id": "metric:quantum-cats:mint-gross-usd:2024-02-05",
          "dimension": "mint_raise",
          "label": "Reported public-mint gross proceeds",
          "value": 13000000,
          "unit": "usd",
          "currency": "USD",
          "window": {
            "start": "2024-02-05",
            "end": "2024-02-05",
            "definition": "public_mint_event"
          },
          "as_of": "2024-02-05",
          "method": "Contemporaneous press report of 3,000 sales at 0.1 BTC",
          "scope": {
            "collection": "Quantum Cats",
            "sale": "public mint only"
          },
          "formula": null,
          "raw_input_ids": [],
          "claim_ids": [
            "claim:quantum-cats:metric:mint-gross-usd"
          ],
          "quality_flags": [
            "reported_approximation",
            "gross_not_net",
            "public_sale_not_total_supply"
          ]
        }
      ],
      "events": [
        {
          "id": "event:quantum-cats:seed",
          "type": "corporate_funding",
          "date": "2023-11-16",
          "description": "Taproot Wizards raised a reported $7.5 million seed round; this was company financing, not collection-holder value capture.",
          "claim_ids": [
            "claim:quantum-cats:event:seed"
          ]
        },
        {
          "id": "event:quantum-cats:announcement",
          "type": "collection_launch",
          "date": "2024-01-12",
          "description": "Quantum Cats was announced as a 3,333-piece evolving Ordinals collection supporting OP_CAT.",
          "claim_ids": [
            "claim:quantum-cats:event:announcement"
          ]
        },
        {
          "id": "event:quantum-cats:genesis-auction",
          "type": "auction",
          "date": "2024-01-22",
          "description": "The one-of-one Genesis Cat sold for 6.31 BTC, reported as about $254,000, at Sotheby’s.",
          "claim_ids": [
            "claim:quantum-cats:event:genesis-auction"
          ]
        },
        {
          "id": "event:quantum-cats:public-mint",
          "type": "primary_sale",
          "date": "2024-02-05",
          "description": "After three technical delays, all 3,000 public-sale Cats were claimed at 0.1 BTC each.",
          "claim_ids": [
            "claim:quantum-cats:event:public-mint"
          ]
        },
        {
          "id": "event:quantum-cats:bip-progress",
          "type": "protocol_advocacy",
          "date": "2024-04-24",
          "description": "The OP_CAT proposal obtained a BIP number; proposal progress did not activate the opcode.",
          "claim_ids": [
            "claim:quantum-cats:event:bip-progress"
          ]
        },
        {
          "id": "event:quantum-cats:series-a",
          "type": "corporate_funding",
          "date": "2025-02-04",
          "description": "Taproot Wizards raised a reported $30 million to expand broader OP_CAT work; this was company financing.",
          "claim_ids": [
            "claim:quantum-cats:event:series-a"
          ]
        },
        {
          "id": "event:quantum-cats:wizard-discount",
          "type": "holder_benefit",
          "date": "2025-03-25",
          "description": "Qualifying entangled Cat-pair holders received a 50 percent discount on the Taproot Wizards mint.",
          "claim_ids": [
            "claim:quantum-cats:event:wizard-discount"
          ]
        },
        {
          "id": "event:quantum-cats:floor-reset",
          "type": "market_observation",
          "date": "2025-04-05",
          "description": "The Block reported a floor around 0.04 BTC after a 54 percent decline around the Wizards mint event.",
          "claim_ids": [
            "claim:quantum-cats:event:floor-reset"
          ]
        },
        {
          "id": "event:quantum-cats:bip-complete",
          "type": "specification_status",
          "date": "2026-03-01",
          "description": "BIP 347 was marked specification-complete; that label did not itself activate OP_CAT.",
          "claim_ids": [
            "claim:quantum-cats:event:bip-complete"
          ]
        },
        {
          "id": "event:quantum-cats:current-observation",
          "type": "market_observation",
          "date": "2026-08-03",
          "description": "CoinGecko reported one sale in the preceding 24 hours; current collection-wide liquidity remained unproven.",
          "claim_ids": [
            "claim:quantum-cats:event:current-observation"
          ]
        }
      ],
      "sources": [
        {
          "id": "source:quantum-cats:official",
          "title": "Quantum Cats — Bringing OP_CAT Back to Bitcoin",
          "url": "https://www.quantumcats.xyz/",
          "publisher": "Taproot Wizards",
          "published_at": null,
          "accessed_at": "2026-08-03T17:01:09Z",
          "archive_url": null,
          "tier": "B",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:01:09Z",
          "content_hash": null
        },
        {
          "id": "source:quantum-cats:taproot-wizards",
          "title": "Taproot Wizards",
          "url": "https://taprootwizards.com/",
          "publisher": "Taproot Wizards",
          "published_at": null,
          "accessed_at": "2026-08-03T17:01:09Z",
          "archive_url": null,
          "tier": "B",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:01:09Z",
          "content_hash": null
        },
        {
          "id": "source:quantum-cats:bip347",
          "title": "BIP 347 — OP_CAT in Tapscript",
          "url": "https://bips.xyz/347",
          "publisher": "Bitcoin Improvement Proposals",
          "published_at": "2026-04-23",
          "accessed_at": "2026-08-03T17:01:09Z",
          "archive_url": null,
          "tier": "A",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:01:09Z",
          "content_hash": null
        },
        {
          "id": "source:quantum-cats:bitcoin-core",
          "title": "Bitcoin Core script interpreter",
          "url": "https://github.com/bitcoin/bitcoin/blob/master/src/script/interpreter.cpp",
          "publisher": "Bitcoin Core",
          "published_at": null,
          "accessed_at": "2026-08-03T17:01:09Z",
          "archive_url": null,
          "tier": "A",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:01:09Z",
          "content_hash": null
        },
        {
          "id": "source:quantum-cats:coingecko",
          "title": "Quantum Cats market data API",
          "url": "https://api.coingecko.com/api/v3/nfts/quantum-cats",
          "publisher": "CoinGecko",
          "published_at": null,
          "accessed_at": "2026-08-03T17:01:09Z",
          "archive_url": null,
          "tier": "B",
          "role": "aggregator",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:01:09Z",
          "content_hash": null
        },
        {
          "id": "source:quantum-cats:decrypt-launch",
          "title": "Taproot Wizards Launch Quantum Cats Bitcoin Ordinals Collection",
          "url": "https://decrypt.co/212594/taproot-wizards-launch-quantum-cats-bitcoin-ordinals-collection",
          "publisher": "Decrypt",
          "published_at": "2024-01-12",
          "accessed_at": "2026-08-03T17:01:09Z",
          "archive_url": null,
          "tier": "B",
          "role": "independent",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:01:09Z",
          "content_hash": null
        },
        {
          "id": "source:quantum-cats:coindesk-mint",
          "title": "Taproot Wizards Recovers From Tech-Marred Debut, Selling $13M of Bitcoin NFTs",
          "url": "https://www.coindesk.com/tech/2024/02/05/taproot-wizards-recovers-from-tech-marred-debut-selling-11m-of-bitcoin-nfts",
          "publisher": "CoinDesk",
          "published_at": "2024-02-05",
          "accessed_at": "2026-08-03T17:01:09Z",
          "archive_url": null,
          "tier": "B",
          "role": "independent",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:01:09Z",
          "content_hash": null
        },
        {
          "id": "source:quantum-cats:sothebys-genesis",
          "title": "Genesis Cat",
          "url": "https://www.sothebys.com/en/buy/auction/2024/natively-digital-an-ordinals-curated-sale/genesis-cat",
          "publisher": "Sotheby''s",
          "published_at": "2024-01-22",
          "accessed_at": "2026-08-03T17:01:09Z",
          "archive_url": null,
          "tier": "A",
          "role": "primary",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:01:09Z",
          "content_hash": null
        },
        {
          "id": "source:quantum-cats:coindesk-genesis",
          "title": "Bitcoin-Based Digital Art Image Genesis Cat Sells for $254K in Sotheby’s Auction",
          "url": "https://www.coindesk.com/tech/2024/01/22/bitcoin-based-digital-art-image-genesis-cat-sells-for-254k-in-sothebys-auction",
          "publisher": "CoinDesk",
          "published_at": "2024-01-22",
          "accessed_at": "2026-08-03T17:01:09Z",
          "archive_url": null,
          "tier": "B",
          "role": "independent",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:01:09Z",
          "content_hash": null
        },
        {
          "id": "source:quantum-cats:techcrunch-seed",
          "title": "Taproot Wizards raises $7.5M to make Bitcoin magical again",
          "url": "https://techcrunch.com/2023/11/16/taproot-wizards-bitcoin-ordinals/",
          "publisher": "TechCrunch",
          "published_at": "2023-11-16",
          "accessed_at": "2026-08-03T17:01:09Z",
          "archive_url": null,
          "tier": "B",
          "role": "independent",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:01:09Z",
          "content_hash": null
        },
        {
          "id": "source:quantum-cats:theblock-series-a",
          "title": "Taproot Wizards raises $30 million to expand OP_CAT functionality on Bitcoin",
          "url": "https://www.theblock.co/post/338805/taproot-wizards-raises-30-million-to-expand-op_cat-functionality-on-bitcoin",
          "publisher": "The Block",
          "published_at": "2025-02-04",
          "accessed_at": "2026-08-03T17:01:09Z",
          "archive_url": null,
          "tier": "B",
          "role": "independent",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:01:09Z",
          "content_hash": null
        },
        {
          "id": "source:quantum-cats:theblock-floor",
          "title": "Quantum Cats NFT floor price plunges 54% post-Taproot Wizards mint",
          "url": "https://www.theblock.co/amp/post/349893/quantum-cats-nft-floor-price-plunges-54-post-taproot-wizards-mint",
          "publisher": "The Block",
          "published_at": "2025-04-09",
          "accessed_at": "2026-08-03T17:01:09Z",
          "archive_url": null,
          "tier": "B",
          "role": "independent",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:01:09Z",
          "content_hash": null
        },
        {
          "id": "source:quantum-cats:axios",
          "title": "A Bitcoin NFT project is lobbying for the blockchain''s next upgrade",
          "url": "https://www.axios.com/2024/04/24/bitcoin-quantum-cats-nft-taproot-code",
          "publisher": "Axios",
          "published_at": "2024-04-24",
          "accessed_at": "2026-08-03T17:01:09Z",
          "archive_url": null,
          "tier": "B",
          "role": "independent",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:01:09Z",
          "content_hash": null
        },
        {
          "id": "source:quantum-cats:galaxy",
          "title": "Top Stories of the Week — January 19, 2024",
          "url": "https://www.galaxy.com/insights/research/top-stories-of-the-week-1-19-24/",
          "publisher": "Galaxy Research",
          "published_at": "2024-01-19",
          "accessed_at": "2026-08-03T17:01:09Z",
          "archive_url": null,
          "tier": "B",
          "role": "independent",
          "access_state": "reachable",
          "checked_at": "2026-08-03T17:01:09Z",
          "content_hash": null
        }
      ],
      "claims": [
        {
          "id": "claim:quantum-cats:status",
          "field_path": "status.operating_state",
          "source_ids": [
            "source:quantum-cats:official",
            "source:quantum-cats:taproot-wizards",
            "source:quantum-cats:coingecko"
          ],
          "evidence_locator": "Current operator sites and current market-aggregator response.",
          "support_direction": "supports",
          "note": null,
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:outcome",
          "field_path": "outcome.label",
          "source_ids": [
            "source:quantum-cats:coindesk-mint",
            "source:quantum-cats:theblock-floor",
            "source:quantum-cats:coingecko",
            "source:quantum-cats:official"
          ],
          "evidence_locator": "Strong primary-sale outcome, later floor reset, thin current observed trading and active operator presence.",
          "support_direction": "supports",
          "note": "Analyst lifecycle classification; it is not a price forecast or a claim that the collection has failed.",
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:section:what_it_is",
          "field_path": "analysis.sections.what_it_is.body",
          "source_ids": [
            "source:quantum-cats:official",
            "source:quantum-cats:decrypt-launch",
            "source:quantum-cats:axios",
            "source:quantum-cats:bip347"
          ],
          "evidence_locator": "Official collection purpose, independent launch reporting, advocacy reporting and the BIP 347 specification.",
          "support_direction": "supports",
          "note": null,
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:section:what_happened",
          "field_path": "analysis.sections.what_happened.body",
          "source_ids": [
            "source:quantum-cats:decrypt-launch",
            "source:quantum-cats:sothebys-genesis",
            "source:quantum-cats:coindesk-genesis",
            "source:quantum-cats:coindesk-mint",
            "source:quantum-cats:theblock-floor",
            "source:quantum-cats:coingecko"
          ],
          "evidence_locator": "Dated inscription, auction, public-mint, holder-benefit, floor-price and current aggregator observations.",
          "support_direction": "supports",
          "note": null,
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:section:why_this_outcome",
          "field_path": "analysis.sections.why_this_outcome.body",
          "source_ids": [
            "source:quantum-cats:official",
            "source:quantum-cats:decrypt-launch",
            "source:quantum-cats:coindesk-mint",
            "source:quantum-cats:theblock-floor",
            "source:quantum-cats:coingecko"
          ],
          "evidence_locator": "Observed collection design, sale outcome, later holder benefit, reported floor move and current trading snapshot.",
          "support_direction": "supports",
          "note": "Causal interpretation is bounded by the cited sequence; it does not attribute the floor move to one proven cause.",
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:section:strategic_choices",
          "field_path": "analysis.sections.strategic_choices.body",
          "source_ids": [
            "source:quantum-cats:decrypt-launch",
            "source:quantum-cats:galaxy",
            "source:quantum-cats:coindesk-mint",
            "source:quantum-cats:theblock-floor",
            "source:quantum-cats:official"
          ],
          "evidence_locator": "Technical design, sale structure, stated advocacy and the later holder-discount mechanism.",
          "support_direction": "supports",
          "note": "Trade-offs are analyst interpretation of documented choices; the sources do not quantify each choice’s causal effect.",
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:section:operating_model",
          "field_path": "analysis.sections.operating_model.body",
          "source_ids": [
            "source:quantum-cats:official",
            "source:quantum-cats:decrypt-launch",
            "source:quantum-cats:galaxy",
            "source:quantum-cats:techcrunch-seed",
            "source:quantum-cats:theblock-series-a",
            "source:quantum-cats:bip347"
          ],
          "evidence_locator": "Operator descriptions, technical reporting, corporate funding reports and the independent protocol proposal record.",
          "support_direction": "supports",
          "note": null,
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:section:token_and_value_capture",
          "field_path": "analysis.sections.token_and_value_capture.body",
          "source_ids": [
            "source:quantum-cats:coindesk-mint",
            "source:quantum-cats:sothebys-genesis",
            "source:quantum-cats:techcrunch-seed",
            "source:quantum-cats:theblock-series-a",
            "source:quantum-cats:theblock-floor"
          ],
          "evidence_locator": "Public mint price and count, separate auction record, corporate financing reports and documented one-time holder benefit.",
          "support_direction": "supports",
          "note": null,
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:section:counterfactual",
          "field_path": "analysis.sections.counterfactual.body",
          "source_ids": [
            "source:quantum-cats:coindesk-mint",
            "source:quantum-cats:theblock-floor",
            "source:quantum-cats:official",
            "source:quantum-cats:techcrunch-seed"
          ],
          "evidence_locator": "Observed mint friction, pricing, one-time utility and advocacy focus used to bound the alternatives.",
          "support_direction": "supports",
          "note": "Counterfactual analysis only; no causal estimate is available.",
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:section:risks_and_unknowns",
          "field_path": "analysis.sections.risks_and_unknowns.body",
          "source_ids": [
            "source:quantum-cats:bip347",
            "source:quantum-cats:bitcoin-core",
            "source:quantum-cats:coingecko",
            "source:quantum-cats:official",
            "source:quantum-cats:theblock-floor"
          ],
          "evidence_locator": "Current specification status, current Bitcoin Core code, limited market snapshot and operator/market records.",
          "support_direction": "supports",
          "note": null,
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:section:lifecycle",
          "field_path": "analysis.sections.lifecycle.body",
          "source_ids": [
            "source:quantum-cats:techcrunch-seed",
            "source:quantum-cats:decrypt-launch",
            "source:quantum-cats:coindesk-genesis",
            "source:quantum-cats:coindesk-mint",
            "source:quantum-cats:axios",
            "source:quantum-cats:theblock-series-a",
            "source:quantum-cats:theblock-floor",
            "source:quantum-cats:bip347",
            "source:quantum-cats:bitcoin-core",
            "source:quantum-cats:official",
            "source:quantum-cats:taproot-wizards"
          ],
          "evidence_locator": "Dated funding, launch, auction, mint, benefit, protocol and current-operating records.",
          "support_direction": "supports",
          "note": null,
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:section:outlook_and_watch",
          "field_path": "analysis.sections.outlook_and_watch.body",
          "source_ids": [
            "source:quantum-cats:bip347",
            "source:quantum-cats:bitcoin-core",
            "source:quantum-cats:coingecko",
            "source:quantum-cats:official",
            "source:quantum-cats:taproot-wizards",
            "source:quantum-cats:theblock-floor"
          ],
          "evidence_locator": "Current protocol, operator and limited market observations defining measurable future signals.",
          "support_direction": "supports",
          "note": "Scenario analysis and watch list, not a price forecast.",
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:metric:floor-btc",
          "field_path": "metrics[metric:quantum-cats:floor-btc:2026-08-03T17:00:05Z].value",
          "source_ids": [
            "source:quantum-cats:coingecko"
          ],
          "evidence_locator": "floor_price.native_currency field in the response retrieved at the HTTP Date timestamp.",
          "support_direction": "supports",
          "note": "Limits: listing_not_executable_bid, underlying_marketplace_timestamp_unavailable, not_liquidity_measure.",
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:metric:market-cap-btc",
          "field_path": "metrics[metric:quantum-cats:market-cap-btc:2026-08-03T17:00:05Z].value",
          "source_ids": [
            "source:quantum-cats:coingecko"
          ],
          "evidence_locator": "market_cap.native_currency field in the retrieved API response.",
          "support_direction": "supports",
          "note": "Limits: aggregator_estimate, not_realized_valuation, underlying_marketplace_timestamp_unavailable.",
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:metric:volume-24h-btc",
          "field_path": "metrics[metric:quantum-cats:volume-24h-btc:2026-08-03T17:00:05Z].value",
          "source_ids": [
            "source:quantum-cats:coingecko"
          ],
          "evidence_locator": "volume_24h.native_currency field in the retrieved API response.",
          "support_direction": "supports",
          "note": "Limits: one_reported_sale, thin_observation, underlying_marketplace_timestamp_unavailable.",
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:metric:sales-24h",
          "field_path": "metrics[metric:quantum-cats:sales-24h:2026-08-03T17:00:05Z].value",
          "source_ids": [
            "source:quantum-cats:coingecko"
          ],
          "evidence_locator": "one_day_sales field in the retrieved API response.",
          "support_direction": "supports",
          "note": "Limits: thin_observation, not_liquidity_measure, underlying_marketplace_timestamp_unavailable.",
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:metric:holders",
          "field_path": "metrics[metric:quantum-cats:holders:2026-08-03T17:00:05Z].value",
          "source_ids": [
            "source:quantum-cats:coingecko"
          ],
          "evidence_locator": "number_of_unique_addresses field in the retrieved API response.",
          "support_direction": "supports",
          "note": "Limits: addresses_not_people, underlying_marketplace_timestamp_unavailable.",
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:metric:supply",
          "field_path": "metrics[metric:quantum-cats:supply:2026-08-03].value",
          "source_ids": [
            "source:quantum-cats:official",
            "source:quantum-cats:coingecko"
          ],
          "evidence_locator": "Official 3,333 collection description and total_supply API field.",
          "support_direction": "supports",
          "note": null,
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:metric:mint-gross-usd",
          "field_path": "metrics[metric:quantum-cats:mint-gross-usd:2024-02-05].value",
          "source_ids": [
            "source:quantum-cats:coindesk-mint"
          ],
          "evidence_locator": "CoinDesk public-sale count, fixed BTC price and “nearly $13 million” report.",
          "support_direction": "supports",
          "note": "Limits: reported_approximation, gross_not_net, public_sale_not_total_supply.",
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:event:seed",
          "field_path": "events[event:quantum-cats:seed]",
          "source_ids": [
            "source:quantum-cats:techcrunch-seed"
          ],
          "evidence_locator": "TechCrunch funding report.",
          "support_direction": "supports",
          "note": null,
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:event:announcement",
          "field_path": "events[event:quantum-cats:announcement]",
          "source_ids": [
            "source:quantum-cats:decrypt-launch"
          ],
          "evidence_locator": "Decrypt collection launch report.",
          "support_direction": "supports",
          "note": null,
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:event:genesis-auction",
          "field_path": "events[event:quantum-cats:genesis-auction]",
          "source_ids": [
            "source:quantum-cats:sothebys-genesis",
            "source:quantum-cats:coindesk-genesis"
          ],
          "evidence_locator": "Sotheby’s lot record and CoinDesk sale report.",
          "support_direction": "supports",
          "note": null,
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:event:public-mint",
          "field_path": "events[event:quantum-cats:public-mint]",
          "source_ids": [
            "source:quantum-cats:coindesk-mint"
          ],
          "evidence_locator": "CoinDesk mint completion report.",
          "support_direction": "supports",
          "note": null,
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:event:bip-progress",
          "field_path": "events[event:quantum-cats:bip-progress]",
          "source_ids": [
            "source:quantum-cats:axios",
            "source:quantum-cats:bip347"
          ],
          "evidence_locator": "Axios advocacy report and BIP 347 record.",
          "support_direction": "supports",
          "note": null,
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:event:series-a",
          "field_path": "events[event:quantum-cats:series-a]",
          "source_ids": [
            "source:quantum-cats:theblock-series-a"
          ],
          "evidence_locator": "The Block funding report.",
          "support_direction": "supports",
          "note": null,
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:event:wizard-discount",
          "field_path": "events[event:quantum-cats:wizard-discount]",
          "source_ids": [
            "source:quantum-cats:theblock-floor"
          ],
          "evidence_locator": "The Block description of the holder discount and mint timing.",
          "support_direction": "supports",
          "note": null,
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:event:floor-reset",
          "field_path": "events[event:quantum-cats:floor-reset]",
          "source_ids": [
            "source:quantum-cats:theblock-floor"
          ],
          "evidence_locator": "The Block floor observations from March 30 through April 5.",
          "support_direction": "supports",
          "note": null,
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:event:bip-complete",
          "field_path": "events[event:quantum-cats:bip-complete]",
          "source_ids": [
            "source:quantum-cats:bip347",
            "source:quantum-cats:bitcoin-core"
          ],
          "evidence_locator": "BIP changelog and current Bitcoin Core disabled-opcode branch.",
          "support_direction": "supports",
          "note": null,
          "review": {
            "state": "pending",
            "reviewer": null,
            "reviewed_at": null
          }
        },
        {
          "id": "claim:quantum-cats:event:current-observation",
          "field_path": "events[event:quantum-cats:current-observation]",
          "source_ids": [
            "source:quantum-cats:coingecko"
          ],
          "evidence_locator": "CoinGecko API response retrieved at 2026-08-03T17:00:05Z.",
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
        "last_reviewed_at": "2026-08-03T17:01:09Z",
        "next_review_at": "2026-08-10T17:01:09Z",
        "field_reviews": []
      },
      "quality": {
        "publication_state": "review",
        "completeness_pct": 100,
        "confidence": "medium",
        "unsourced_fields": [
          "audited_collection_costs",
          "audited_collection_profit",
          "current_royalties",
          "executable_bid_depth",
          "repeat_holder_benefits",
          "underlying_marketplace_observation_time"
        ]
      },
      "extensions": {
        "legacy_origin": "nft_collections",
        "methodology_notes": [
          "freshness.last_reviewed_at records evidence assembly and source verification, not human approval; every claim remains pending until an editor reviews it.",
          "BIP 347 specification status is kept separate from activation in released Bitcoin Core.",
          "Advocacy, a past mint discount and corporate financing are kept separate from contractual holder utility and value capture.",
          "A listing floor, one reported sale and an aggregator market-cap estimate are not treated as liquidity or realized valuation.",
          "CoinGecko was retrieved at a current HTTP timestamp, but its underlying marketplace observation time was unavailable and remains a stated limitation."
        ]
      }
    },
    "legacy": {
      "analysis": "Quantum Cats achieved a strong, technically troubled primary sale and made OP_CAT advocacy culturally visible. Its later one-time holder benefit did not establish repeat utility, and current observed trading is too sparse for a broad liquidity or valuation conclusion.",
      "business": "Taproot Wizards creates and communicates an evolving Bitcoin Ordinals art collection; holders custody inscriptions and trade through third-party marketplaces.",
      "benefits": "Ownership of the inscription, evolving collection art and a documented past discount on the Taproot Wizards mint; no continuing contractual utility was established in the reviewed sources.",
      "founder_engagement": "Taproot Wizards remains active and continues to frame the collection around OP_CAT advocacy.",
      "outlook": "Active cultural and advocacy collection with thin current observed trading. Watch protocol activation, 30- and 90-day sales, executable bids, holder activity, reveals and repeat benefits.",
      "current_observation": "CoinGecko reported one sale in the prior 24 hours at 2026-08-03T17:00:05Z; this does not establish liquidity or a collection-wide valuation."
    }
  }
}')
)
INSERT INTO _quantum_cats_profile_0072 (slug, status, legacy, canonical_profile)
SELECT
  json_extract(payload, '$.entity.slug'),
  json_extract(payload, '$.entity.status'),
  json_extract(payload, '$.entity.legacy'),
  json_extract(payload, '$.entity.canonical_profile')
FROM research_document;
-- canonical-payload-end

UPDATE nft_collections AS collection
SET
  status = staged.status,
  profile = json_set(
    COALESCE(collection.profile, '{}'),
    '$.canonical_profile', json(staged.canonical_profile)
  ),
  updated_at = '2026-08-03'
FROM _quantum_cats_profile_0072 AS staged
WHERE collection.slug = staged.slug;

DROP TABLE _quantum_cats_profile_0072;

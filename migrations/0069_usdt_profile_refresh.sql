-- USDT gold-standard profile refresh, verified 2026-08-03.
-- Replaces stale comparative and regulatory copy with a scoped, dated evidence
-- contract. Reserve assurance is issuer-wide and is not presented as a completed
-- financial-statement audit or as USDT-only backing evidence.

DROP TABLE IF EXISTS _usdt_profile_refresh;

CREATE TABLE _usdt_profile_refresh (
  payload TEXT NOT NULL CHECK (json_valid(payload))
);

INSERT INTO _usdt_profile_refresh (payload) VALUES ('
{
  "profile": {
    "issuer": "Tether International, S.A. de C.V. under the reviewed terms and El Salvador public register.",
    "type": "Fiat-denominated US-dollar stablecoin with issuer-administered issuance, redemption and token controls.",
    "backing": "Tether reports reserves across all fiat-denominated Tether tokens. The latest reviewed assurance report is a point-in-time report for 2026-06-30; its totals are issuer-wide and must not be described as USDT-only reserves or evergreen balances.",
    "issuer_background": "The reviewed terms identify Tether International, S.A. de C.V. as the contracting entity and describe a redomiciliation from the British Virgin Islands plus an assignment effective 2025-01-27. El Salvador CNAD separately lists the entity as stablecoin issuer EME-0003.",
    "daily_activity": "Chaindump uses a dated DefiLlama observation for supply, price and reported chain representations. The 2026-08-03 snapshot is stored below and should be superseded after the next review.",
    "audits": "The 2026-07-31 BDO Advisory Services report provides reasonable assurance under ISAE 3000 Revised over the Financial Figures and Reserves Report at 2026-06-30. It explicitly is not an audit or review of historical financial information and not a full set of financial statements. Tether announced an engagement for its first full financial-statement audit on 2026-03-24; the reviewed sources do not establish completion.",
    "regulatory": "El Salvador CNAD lists Tether International as stablecoin issuer EME-0003 from 2025-05-19. No Tether or USDT issuer row was found in the ESMA electronic-money-token issuer CSV reviewed on 2026-08-03. An ESMA 2025 statement recorded USDT restrictions by several EEA venues. These facts do not support a blanket statement that USDT is globally regulated, MiCA authorized, or universally banned in the EEA.",
    "transparency": "Tether publishes a reserve dashboard and periodic assurance reports. The report provides assurance only at the stated date; its notes are outside the assurance scope, and it warns that stressed markets or counterparty illiquidity can change realizable values and timing.",
    "yield": "The reviewed terms do not grant holders interest, reserve ownership or a claim on reserve earnings. Direct acquisitions and redemptions can carry fees, while reserve returns remain within the issuer structure.",
    "future": "Watch the first full financial-statement audit for completion and scope, the next assurance report, reserve composition, redemption performance, ESMA and CNAD registers, freeze policy, and reconciled native-versus-bridged supply.",
    "outlook": "Base case: USDT remains a large multi-chain dollar settlement asset because liquidity and distribution reinforce one another. That is an analytical scenario, not a promise of par value or continuing venue access.",
    "risks": "Price can deviate from one dollar; direct redemption is gated; the issuer can freeze or block tokens; reserves include assets beyond Treasury bills and cash; assurance is point-in-time and issuer-wide; market, custody, counterparty, chain, bridge and regulatory risks remain.",
    "notes": "USDT is intended to track one US dollar. Direct issuer rights belong to eligible verified customers under the terms; secondary-market holders and third-party bridged or wrapped representations can face different access, liquidity and technical risks.",
    "editorial_guardrails": "Do not call the 2026-07-31 assurance report a completed financial-statement audit, apply issuer-wide reserve totals to USDT alone, describe direct redemption as universal, equate every aggregator chain representation with native Tether issuance, or infer MiCA authorization or an EEA-wide ban from register and venue evidence.",
    "evidence_policy": {"schema":"forensic-freshness-v1","status_basis":"direct_current","status_as_of":"2026-08-03","last_verified_at":"2026-08-03","next_review_at":"2026-08-10","stale":false},
    "current_observation": {
      "observed_at": "2026-08-03T16:33:11Z",
      "circulating_supply_usd": 183140660283.77628,
      "price_usd": 0.9987561821369779,
      "previous_week_circulating_supply_usd": 183867073283.62018,
      "seven_day_supply_change_pct": -0.3950750870567177,
      "reported_chain_count": 130,
      "chain_count_caveat": "DefiLlama reported USDT representations on 130 chains. This count includes representations that are not necessarily issued or redeemable by Tether.",
      "largest_reported_chain_balances_usd": [
        {"chain":"Tron","value":89616759617.50328},
        {"chain":"Ethereum","value":74735495586.96901},
        {"chain":"BSC","value":9172403591.33505},
        {"chain":"Solana","value":3356034645.7682967},
        {"chain":"Aptos","value":885895949.4638382},
        {"chain":"Polygon","value":842782262.3631942},
        {"chain":"Plasma","value":837576813.5519936},
        {"chain":"Arbitrum","value":821074574.4356177}
      ],
      "source_refs": ["llama-usdt"]
    },
    "reserve_observation": {
      "period_end": "2026-06-30",
      "report_date": "2026-07-31",
      "scope": "All fiat-denominated Tether tokens reported by Tether International, not USDT alone. Reasonable assurance applies to the Financial Figures and Reserves Report at one date; report notes are not assured.",
      "total_assets_usd": 187751426411,
      "total_liabilities_usd": 183641897215,
      "digital_token_liabilities_usd": 183622105630,
      "equity_usd": 4109529196,
      "gross_contractual_redemption_value_usd": 184588527295,
      "composition_usd": {
        "us_treasury_bills": 114960963604,
        "overnight_reverse_repurchase_agreements": 18625552412,
        "term_reverse_repurchase_agreements": 6993428950,
        "non_us_treasury_bills": 22374689,
        "cash_and_bank_deposits": 40307440,
        "corporate_bonds": 8711171,
        "precious_metals": 18838357171,
        "bitcoin": 5801630681,
        "public_equities": 3761438892,
        "other_investments": 5244911675,
        "secured_loans": 13453749726
      },
      "source_refs": ["tether-assurance-2026-q2"]
    },
    "protocol_observation": {
      "reviewed_at": "2026-08-03",
      "issuer_supported_page": ["Ethereum","Avalanche","BNB Smart Chain","Cosmos via Kava","Celo","Kaia","Tron","Liquid","Solana","Polkadot Asset Hub","Tezos","Near","Ton","Aptos"],
      "assurance_report_note": ["Ethereum","Tron","Ton","Liquid","Solana","Avalanche","Tezos","Near","Cosmos","Celo","Kaia","Aptos","Polkadot Asset Hub"],
      "deprecated_for_usdt_redemption": ["Kusama","Bitcoin Cash SLP","Omni Layer","EOS","Algorand"],
      "caveat": "The current general supported-protocol list includes BNB Smart Chain, while its BNB section identifies an XAUt contract rather than a USDT contract and the 2026-06-30 report note omits BNB. The lists are issuer statements, the report note is outside BDO assurance, and neither list should be substituted for a USDT native-versus-bridged supply reconciliation.",
      "source_refs": ["tether-supported-protocols","tether-assurance-2026-q2"]
    },
    "canonical_profile": {
      "schema": "chaindump-entity-profile-source",
      "version": 1,
      "classification": {"subtype":"fiat-backed","tags":["usd-pegged","fiat-backed","multi-chain"],"chains":[],"jurisdictions":["El Salvador","European Economic Area"]},
      "status": {"operating_state":"operating","as_of":"2026-08-03","claim_ids":["claim:usdt:operating-state"]},
      "outcome": {"label":null,"as_of":null,"rule_id":null,"confidence":null,"claim_ids":[]},
      "sections": {
        "what_it_is": "USDT is a token intended to track one US dollar. The reviewed terms identify Tether International, S.A. de C.V. as the issuer counterparty. Direct issuer access and third-party market access are separate: secondary-market holders and bridged representations do not automatically receive the same contractual redemption path.",
        "what_happened": "USDT launched in 2014 and expanded across multiple networks. The issuer changed its contracting entity through an assignment effective 2025-01-27, entered the El Salvador stablecoin-issuer register on 2025-05-19, ended redemption obligations on five legacy networks on 2025-09-01, announced a first full-audit engagement on 2026-03-24, and published a point-in-time reserve assurance report on 2026-07-31.",
        "why_this_outcome": "A simple dollar unit, early exchange distribution and deployment across major settlement networks plausibly created a liquidity loop: more venues and users made USDT easier to accept, and deeper acceptance made further integration useful. Current supply concentration on Tron and Ethereum is consistent with that network effect, but the reviewed sources do not isolate or quantify each cause.",
        "strategic_choices": "Tether chose multi-chain distribution, institution-sized direct issuance and redemption, a mixed reserve portfolio, retained reserve economics, periodic point-in-time assurance and issuer controls that can freeze or block tokens. It also ceased redemption on five legacy networks while retaining historical protocol information.",
        "operating_model": "Eligible KYC-verified customers can acquire or redeem directly through Tether under the reviewed terms and onboarding process. The current minimum is 100,000 US dollars equivalent; redemption fees are the greater of 1,000 dollars or 0.1 percent and can change. Other holders usually trade through venues or intermediaries. Tether can suspend service and can freeze, burn or block tokens under the terms and in some law-enforcement circumstances.",
        "token_and_value_capture": "The reviewed terms do not pay holders interest or grant ownership of reserve assets or earnings. Direct acquisition and redemption fees can accrue to the issuer, and reserve returns stay within the issuer structure. This report does not estimate margins, profit allocation or affiliate economics beyond what the cited documents establish.",
        "counterfactual": "Universal low-minimum redemption could reduce dependence on intermediaries but would add onboarding and banking load. A cash-and-Treasury-only reserve could narrow market and valuation risk while changing return and liquidity management. A single native network would simplify token provenance but give up distribution. The evidence does not quantify these alternatives.",
        "risks_and_unknowns": "USDT can trade away from one dollar; direct redemption is gated by eligibility, minimums, fees and issuer discretion; freeze controls create censorship and recovery trade-offs; and the reserve includes precious metals, bitcoin, investments and secured loans as well as Treasury instruments. The latest assurance is point-in-time, covers all fiat-denominated Tether tokens rather than USDT alone, and is not a completed financial-statement audit. Native-versus-bridged supply, stressed redemption capacity, EEA venue access and full-audit completion remain open.",
        "lifecycle": "USDT is an operating, established stablecoin with material independently observed circulation on 2026-08-03. It remains supported on multiple issuer-listed protocols, while redemption support ended for five legacy networks in 2025.",
        "outlook_and_watch": "Watch the next assurance report, reserve mix and excess assets, redemption performance, a completed first financial-statement audit and its scope, issuer freeze policy, CNAD and ESMA registers, EEA venue access, price and supply, and a reproducible native-versus-bridged chain reconciliation. The base case is continued major settlement use; a reserve, banking, compliance, chain or redemption disruption is the main downside path."
      },
      "section_dates": {"what_it_is":"2026-08-03","what_happened":"2026-08-03","why_this_outcome":"2026-08-03","strategic_choices":"2026-08-03","operating_model":"2026-08-03","token_and_value_capture":"2026-08-03","counterfactual":"2026-08-03","risks_and_unknowns":"2026-08-03","lifecycle":"2026-08-03","outlook_and_watch":"2026-08-03"},
      "section_claim_ids": {
        "what_it_is":["claim:usdt:identity","claim:usdt:redemption"],
        "what_happened":["claim:usdt:launch","claim:usdt:legal-entity","claim:usdt:cnad-registration","claim:usdt:legacy-networks","claim:usdt:audit-engagement","claim:usdt:assurance"],
        "why_this_outcome":["claim:usdt:why"],
        "strategic_choices":["claim:usdt:strategy","claim:usdt:freeze-controls"],
        "operating_model":["claim:usdt:redemption","claim:usdt:freeze-controls"],
        "token_and_value_capture":["claim:usdt:value-capture"],
        "counterfactual":["claim:usdt:counterfactual"],
        "risks_and_unknowns":["claim:usdt:risks","claim:usdt:assurance","claim:usdt:protocol-scope","claim:usdt:esma-status"],
        "lifecycle":["claim:usdt:operating-state","claim:usdt:market-observation","claim:usdt:protocol-scope"],
        "outlook_and_watch":["claim:usdt:outlook"]
      },
      "metrics": [
        {"id":"metric:usdt:circulating-supply:2026-08-03","dimension":"circulating_supply","label":"Circulating supply","value":183140660283.77628,"unit":"usd","currency":"USD","window":{"start":null,"end":"2026-08-03T16:33:11Z","definition":"point_in_time"},"as_of":"2026-08-03T16:33:11Z","method":"aggregator_observation","scope":{"product":"usdt","chains":[]},"formula":null,"raw_input_ids":[],"claim_ids":["claim:usdt:metric-supply"],"quality_flags":[]},
        {"id":"metric:usdt:price:2026-08-03","dimension":"price","label":"Price","value":0.9987561821369779,"unit":"usd","currency":"USD","window":{"start":null,"end":"2026-08-03T16:33:11Z","definition":"point_in_time"},"as_of":"2026-08-03T16:33:11Z","method":"aggregator_observation","scope":{"product":"usdt","chains":[]},"formula":null,"raw_input_ids":[],"claim_ids":["claim:usdt:metric-price"],"quality_flags":[]},
        {"id":"metric:usdt:peg-deviation:2026-08-03","dimension":"peg_deviation","label":"Peg deviation","value":-0.12438178630220786,"unit":"percent","currency":null,"window":{"start":null,"end":"2026-08-03T16:33:11Z","definition":"point_in_time"},"as_of":"2026-08-03T16:33:11Z","method":"derived","scope":{"product":"usdt","chains":[]},"formula":"(price_usd - 1) * 100","raw_input_ids":["metric:usdt:price:2026-08-03"],"claim_ids":["claim:usdt:metric-peg"],"quality_flags":[]},
        {"id":"metric:usdt:reserve-assets:2026-06-30","dimension":"reserve_assets","label":"Issuer-wide reserve assets","value":187751426411,"unit":"usd","currency":"USD","window":{"start":null,"end":"2026-06-30","definition":"point_in_time"},"as_of":"2026-06-30","method":"reasonable_assurance_report","scope":{"product":"fiat-denominated Tether tokens","chains":[]},"formula":null,"raw_input_ids":[],"claim_ids":["claim:usdt:metric-reserves"],"quality_flags":["issuer-wide-not-usdt-only","point-in-time-assurance"]},
        {"id":"metric:usdt:reserve-coverage:2026-06-30","dimension":"reserve_coverage","label":"Issuer-wide assets to liabilities","value":102.23779500120756,"unit":"percent","currency":null,"window":{"start":null,"end":"2026-06-30","definition":"point_in_time"},"as_of":"2026-06-30","method":"derived","scope":{"product":"fiat-denominated Tether tokens","chains":[]},"formula":"total_assets_usd / total_liabilities_usd * 100","raw_input_ids":["metric:usdt:reserve-assets:2026-06-30"],"claim_ids":["claim:usdt:metric-coverage"],"quality_flags":["issuer-wide-not-usdt-only","point-in-time-assurance"]}
      ],
      "events": [
        {"id":"event:usdt:launch:2014-10-06","type":"launch","date":"2014-10-06","date_precision":"day","amount_usd":null,"description":"Tether identifies 2014-10-06 as the launch date for USDT.","claim_ids":["claim:usdt:launch"]},
        {"id":"event:usdt:cnad-registration:2025-05-19","type":"regulatory_registration","date":"2025-05-19","date_precision":"day","amount_usd":null,"description":"El Salvador CNAD lists Tether International, S.A. de C.V. as stablecoin issuer EME-0003.","claim_ids":["claim:usdt:cnad-registration"]},
        {"id":"event:usdt:legacy-redemption-end:2025-09-01","type":"protocol_support_change","date":"2025-09-01","date_precision":"day","amount_usd":null,"description":"Tether ended its obligation to redeem USDT on Kusama, Bitcoin Cash SLP, Omni Layer, EOS and Algorand.","claim_ids":["claim:usdt:legacy-networks"]},
        {"id":"event:usdt:audit-engagement:2026-03-24","type":"issuer_announcement","date":"2026-03-24","date_precision":"day","amount_usd":null,"description":"Tether announced an engagement for its first full independent financial-statement audit.","claim_ids":["claim:usdt:audit-engagement"]},
        {"id":"event:usdt:assurance-report:2026-07-31","type":"reserve_report","date":"2026-07-31","date_precision":"day","amount_usd":null,"description":"BDO Advisory Services issued reasonable assurance over the Financial Figures and Reserves Report as at 2026-06-30.","claim_ids":["claim:usdt:assurance"]}
      ],
      "claims": [
        {"id":"claim:usdt:identity","field_path":"analysis.sections.what_it_is.body","statement":"USDT is a US-dollar token issued under the reviewed terms by Tether International, S.A. de C.V.","source_ids":["tether-terms","tether-rid"],"evidence_locator":"Terms parties and RID product description","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:launch","field_path":"events[event:usdt:launch:2014-10-06]","statement":"Tether identifies 2014-10-06 as the USDT launch date.","source_ids":["tether-launch-history"],"evidence_locator":"Issuer eight-year history article","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:legal-entity","field_path":"analysis.sections.what_happened.body","statement":"The reviewed terms identify the El Salvador entity and an assignment effective 2025-01-27 after redomiciliation.","source_ids":["tether-terms"],"evidence_locator":"Terms introduction and assignment provisions","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:cnad-registration","field_path":"events[event:usdt:cnad-registration:2025-05-19]","statement":"CNAD lists Tether International as stablecoin issuer EME-0003 from 2025-05-19.","source_ids":["cnad-issuer-register"],"evidence_locator":"Issuer list row for Tether International, S.A. de C.V.","support_direction":"supports","note":"This is scoped to the El Salvador register and is not a claim of authorization in other jurisdictions.","review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:esma-status","field_path":"analysis.sections.risks_and_unknowns.body","statement":"The reviewed ESMA EMT issuer CSV contains no Tether or USDT issuer row, while an ESMA statement documented venue restrictions for EEA users.","source_ids":["esma-mica-register","esma-usdt-eea-statement"],"evidence_locator":"2026 EMT issuer CSV search and 2025 ESMA statement footnote 14","support_direction":"supports","note":"Register absence and venue restrictions do not establish an EEA-wide ban or a global regulatory status.","review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:redemption","field_path":"analysis.sections.operating_model.body","statement":"Direct Tether redemption requires an eligible verified customer, a 100,000 dollar equivalent minimum and current fees.","source_ids":["tether-terms","tether-rid"],"evidence_locator":"Terms issuance and redemption provisions; RID sections 2.6 and 5","support_direction":"supports","note":"The right is contractual and personal under the terms; it is not universal secondary-market access.","review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:freeze-controls","field_path":"analysis.sections.operating_model.body","statement":"Tether reserves rights to suspend service and freeze, burn or block tokens in specified circumstances.","source_ids":["tether-terms","tether-rid"],"evidence_locator":"Terms suspension and token-control provisions; RID token restrictions","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:legacy-networks","field_path":"events[event:usdt:legacy-redemption-end:2025-09-01]","statement":"Tether ended USDT redemption obligations on five legacy networks on 2025-09-01.","source_ids":["tether-terms","tether-supported-protocols"],"evidence_locator":"Terms and supported-protocol deprecation notice","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:audit-engagement","field_path":"events[event:usdt:audit-engagement:2026-03-24]","statement":"Tether announced engagement of a Big Four firm for its first full financial-statement audit.","source_ids":["tether-audit-engagement"],"evidence_locator":"2026-03-24 issuer announcement","support_direction":"supports","note":"An engagement is not a completed audit; the firm was not identified in the announcement.","review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:assurance","field_path":"events[event:usdt:assurance-report:2026-07-31]","statement":"BDO Advisory Services provided reasonable assurance over a point-in-time Financial Figures and Reserves Report at 2026-06-30.","source_ids":["tether-assurance-2026-q2"],"evidence_locator":"Independent assurance opinion and scope limitations","support_direction":"supports","note":"The engagement is under ISAE 3000 Revised, is not an audit or review of historical financial information, and excludes the report notes from assurance.","review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:protocol-scope","field_path":"analysis.sections.risks_and_unknowns.body","statement":"Issuer protocol lists do not reconcile every aggregator-reported USDT representation as native or redeemable.","source_ids":["tether-supported-protocols","tether-assurance-2026-q2","llama-usdt"],"evidence_locator":"Supported protocols; report note 15; DefiLlama chainCirculating and chains arrays","support_direction":"supports","note":"The current protocol page and the quarter-end report note also differ on BNB Smart Chain.","review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:why","field_path":"analysis.sections.why_this_outcome.body","statement":"USDT distribution is plausibly reinforced by early venue adoption, multi-chain availability and liquidity network effects.","source_ids":["tether-launch-history","tether-supported-protocols","llama-usdt"],"evidence_locator":"Launch history, issuer network list and current distribution observation","support_direction":"context_only","note":"Analytical inference; the sources do not isolate causal contribution.","review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:strategy","field_path":"analysis.sections.strategic_choices.body","statement":"Tether chose multi-chain distribution, institution-sized direct access, a mixed reserve portfolio and periodic assurance.","source_ids":["tether-rid","tether-supported-protocols","tether-assurance-2026-q2"],"evidence_locator":"RID operating model; supported protocols; reserve composition and assurance scope","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:value-capture","field_path":"analysis.sections.token_and_value_capture.body","statement":"The reviewed documents do not grant holders reserve earnings and specify direct transaction fees.","source_ids":["tether-terms","tether-rid"],"evidence_locator":"Terms holder rights and RID acquisition and redemption fees","support_direction":"supports","note":"No unverified margin or affiliate allocation is inferred.","review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:counterfactual","field_path":"analysis.sections.counterfactual.body","statement":"Alternative redemption, reserve and network designs would change access, risk and distribution trade-offs.","source_ids":["tether-rid","tether-assurance-2026-q2","tether-supported-protocols"],"evidence_locator":"Current redemption, reserve and protocol designs","support_direction":"context_only","note":"Unquantified analytical counterfactual.","review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:risks","field_path":"analysis.sections.risks_and_unknowns.body","statement":"USDT retains peg, redemption, issuer-control, reserve, market-access and representation risks.","source_ids":["tether-terms","tether-rid","tether-assurance-2026-q2","esma-mica-register","esma-usdt-eea-statement","llama-usdt"],"evidence_locator":"Terms, RID, assurance limitations, regulator records and market observation","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:operating-state","field_path":"status.operating_state","statement":"USDT was operating with material circulation on 2026-08-03.","source_ids":["tether-transparency","llama-usdt"],"evidence_locator":"Current issuer transparency page and DefiLlama USDT observation","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:market-observation","field_path":"analysis.sections.lifecycle.body","statement":"DefiLlama recorded material USDT circulation on 2026-08-03.","source_ids":["llama-usdt"],"evidence_locator":"peggedAssets entry with symbol USDT","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:outlook","field_path":"analysis.sections.outlook_and_watch.body","statement":"Reserve, audit, redemption, regulator, control and chain-provenance evidence are the material watch items.","source_ids":["tether-transparency","tether-assurance-2026-q2","tether-audit-engagement","cnad-issuer-register","esma-mica-register","llama-usdt"],"evidence_locator":"Current reserve, audit-status, regulator and market records","support_direction":"context_only","note":"Scenario analysis, not a forecast guarantee.","review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:metric-supply","field_path":"metrics[metric:usdt:circulating-supply:2026-08-03].value","statement":"DefiLlama recorded 183140660283.77628 dollars of circulating USDT at retrieval.","source_ids":["llama-usdt"],"evidence_locator":"USDT circulating.peggedUSD","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:metric-price","field_path":"metrics[metric:usdt:price:2026-08-03].value","statement":"DefiLlama recorded a 0.9987561821369779 dollar USDT price at retrieval.","source_ids":["llama-usdt"],"evidence_locator":"USDT price","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:metric-peg","field_path":"metrics[metric:usdt:peg-deviation:2026-08-03].value","statement":"Peg deviation is derived from the dated DefiLlama price.","source_ids":["llama-usdt"],"evidence_locator":"USDT price and formula stored on metric","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:metric-reserves","field_path":"metrics[metric:usdt:reserve-assets:2026-06-30].value","statement":"The assurance report recorded 187751426411 dollars of issuer-wide assets at 2026-06-30.","source_ids":["tether-assurance-2026-q2"],"evidence_locator":"Financial Figures and Reserves Report total assets","support_direction":"supports","note":"The value covers all fiat-denominated Tether tokens, not USDT alone.","review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdt:metric-coverage","field_path":"metrics[metric:usdt:reserve-coverage:2026-06-30].value","statement":"Issuer-wide asset coverage is derived from assured total assets and total liabilities at 2026-06-30.","source_ids":["tether-assurance-2026-q2"],"evidence_locator":"Report total assets and total liabilities; formula stored on metric","support_direction":"supports","note":"The ratio is not USDT-only reserve coverage.","review":{"state":"pending","reviewer":null,"reviewed_at":null}}
      ],
      "freshness": {"state":"current","last_reviewed_at":"2026-08-03","next_review_at":"2026-08-10","field_reviews":[]},
      "confidence": "medium",
      "extensions": {
        "methodology_notes": [
          "freshness.last_reviewed_at records evidence assembly and source verification, not human approval; every claim remains pending until an editor reviews it.",
          "Issuer-wide reserve totals are not USDT-only balances, and the point-in-time assurance report is not a completed financial-statement audit.",
          "Aggregator-reported chain representations are not treated as native issuer-supported USDT without contract-level reconciliation."
        ],
        "structured_analysis": {
          "strategic_choices": [
            {"decision":"Distribute USDT across multiple issuer-supported protocols.","consequence":"Liquidity can meet users on several settlement rails, while token provenance and deprecated-network support become harder to explain.","claim_ids":["claim:usdt:strategy","claim:usdt:protocol-scope"]},
            {"decision":"Gate direct issuance and redemption to eligible verified customers with institution-sized minimums.","consequence":"The issuer can operate controlled bank rails while many holders depend on intermediaries and secondary markets.","claim_ids":["claim:usdt:redemption"]},
            {"decision":"Use a mixed reserve portfolio and periodic point-in-time assurance.","consequence":"The structure can earn returns and show dated asset coverage, while valuation, liquidity and assurance-scope questions remain.","claim_ids":["claim:usdt:strategy","claim:usdt:assurance"]},
            {"decision":"Retain token freeze and service-suspension controls.","consequence":"The issuer can respond to legal and security events, while holders accept censorship and access risk.","claim_ids":["claim:usdt:freeze-controls"]}
          ],
          "unknowns": [
            {"question":"When will the announced first full financial-statement audit be completed, by whom, and with what scope?","resolution_trigger":"A signed independent audit report and audited financial statements."},
            {"question":"How much reported USDT supply is native issuer inventory versus bridged or wrapped representation on each chain?","resolution_trigger":"A reproducible contract-level reconciliation against issuer-authorized token contracts."},
            {"question":"Does Tether currently issue native USDT on BNB Smart Chain, where the general protocol list names BNB but the page identifies only an XAUt contract and the quarter-end report note omits BNB?","resolution_trigger":"An issuer-published dated USDT contract inventory that reconciles the difference."},
            {"question":"How would reserve assets and redemption timing perform under stressed markets or major counterparty illiquidity?","resolution_trigger":"A stress test, crisis redemption disclosure or independently tested liquidity analysis."},
            {"question":"Will Tether or USDT appear in a future ESMA EMT issuer register, and how will EEA venue access change?","resolution_trigger":"A dated ESMA register entry or regulator and venue notices."}
          ]
        },
        "review_metadata": {"schema":"forensic-freshness-v1","status_basis":"direct_current","status_as_of":"2026-08-03","last_verified_at":"2026-08-03","next_review_at":"2026-08-10","stale":false}
      }
    },
    "sources": []
  },
  "sources": [
    {"id":"tether-terms","title":"Tether Tokens Terms of Sale and Service","publisher":"Tether International, S.A. de C.V.","url":"https://tether.to/en/legal/","source_role":"primary","tier":"A","role":"primary","accessed_at":"2026-08-03","source_date":"2026-02-26","source_date_kind":"updated","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"mechanism","stale_after":"2026-08-10","stale":false},
    {"id":"tether-rid","title":"Relevant Information Document for fiat-denominated Tether tokens","publisher":"Tether International, S.A. de C.V.","url":"https://tether.to/public/Relevant_Information_Document_-_Tether_International%2C_S.A._de_C.V..pdf","source_role":"primary","tier":"A","role":"primary","accessed_at":"2026-08-03","source_date":"2026-02-20","source_date_kind":"published","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
    {"id":"tether-transparency","title":"Tether transparency and reserve reports","publisher":"Tether","url":"https://tether.to/en/transparency/","source_role":"primary","tier":"B","role":"primary","accessed_at":"2026-08-03","source_date":"2026-07-31","source_date_kind":"updated","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
    {"id":"tether-assurance-2026-q2","title":"Assurance Report on Financial Figures and Reserves Report at 2026-06-30","publisher":"BDO Advisory Services S.r.l.","url":"https://assets.ctfassets.net/vyse88cgwfbl/2kYf7r64h3tzwiu6F0CbUB/2997abd2f11ecea74a21528048b50707/Opinion___Report_-_Tether_International_Financial_Figure_30-06-2026.pdf","source_role":"independent","tier":"A","role":"independent","accessed_at":"2026-08-03","source_date":"2026-07-31","source_date_kind":"published","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"current_state","stale_after":"2026-10-31","stale":false},
    {"id":"tether-audit-engagement","title":"Tether announces engagement for first full financial-statement audit","publisher":"Tether","url":"https://tether.io/news/tether-signs-big-four-firm-to-complete-first-full-audit-setting-a-new-quality-standard-for-the-digital-asset-economy/","source_role":"primary","tier":"B","role":"primary","accessed_at":"2026-08-03","source_date":"2026-03-24","source_date_kind":"published","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"historical_event","stale_after":null,"stale":false},
    {"id":"tether-supported-protocols","title":"Supported Protocols and Integration Guidelines","publisher":"Tether","url":"https://tether.to/en/supported-protocols/","source_role":"primary","tier":"B","role":"primary","accessed_at":"2026-08-03","source_date":"2026-08-03","source_date_kind":"observed","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
    {"id":"tether-launch-history","title":"Eight Years of Stability and Innovation","publisher":"Tether","url":"https://tether.io/news/eight-years-of-stability-and-innovation/","source_role":"primary","tier":"B","role":"primary","accessed_at":"2026-08-03","source_date":"2022-10-06","source_date_kind":"published","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"historical_event","stale_after":null,"stale":false},
    {"id":"cnad-issuer-register","title":"El Salvador public stablecoin issuer register","publisher":"National Commission of Digital Assets","url":"https://cnad.gob.sv/issuers/","source_role":"primary","tier":"A","role":"primary","accessed_at":"2026-08-03","source_date":"2026-08-03","source_date_kind":"observed","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
    {"id":"esma-mica-register","title":"MiCA register and electronic-money-token issuer data","publisher":"European Securities and Markets Authority","url":"https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica","source_role":"primary","tier":"A","role":"primary","accessed_at":"2026-08-03","source_date":"2026-07-16","source_date_kind":"updated","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
    {"id":"esma-usdt-eea-statement","title":"ESMA opening statement on crypto-assets and financial stability","publisher":"European Securities and Markets Authority","url":"https://www.esma.europa.eu/sites/default/files/2025-04/ESMA50-43599798-27866_Natasha_Cazenave_s_opening_statement_at_ECON_hearing_on_crypto-assets_and_financial_stability__8_April_2025.pdf","source_role":"primary","tier":"A","role":"primary","accessed_at":"2026-08-03","source_date":"2025-04-08","source_date_kind":"published","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"historical_event","stale_after":null,"stale":false},
    {"id":"llama-usdt","title":"Stablecoin market data API","publisher":"DefiLlama","url":"https://stablecoins.llama.fi/stablecoins?includePrices=true","source_role":"aggregator","tier":"C","role":"aggregator","accessed_at":"2026-08-03T16:33:11Z","source_date":"2026-08-03","source_date_kind":"observed","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false}
  ]
}
');

UPDATE stablecoin_meta
SET
  name = 'Tether',
  symbol = 'USDT',
  profile = json_set(
    json(json_extract((SELECT payload FROM _usdt_profile_refresh), '$.profile')),
    '$.sources',
    json(json_extract((SELECT payload FROM _usdt_profile_refresh), '$.sources'))
  ),
  sources = json_extract((SELECT payload FROM _usdt_profile_refresh), '$.sources'),
  updated_at = '2026-08-03'
WHERE lower(slug) = 'usdt';

DROP TABLE _usdt_profile_refresh;

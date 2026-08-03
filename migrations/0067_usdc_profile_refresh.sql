-- USDC gold-standard profile refresh, verified 2026-08-03.
-- Replaces stale comparative and regulatory marketing copy with a scoped,
-- dated evidence contract. Live supply and price remain dated observations.

DROP TABLE IF EXISTS _usdc_profile_refresh;

CREATE TABLE _usdc_profile_refresh (
  payload TEXT NOT NULL CHECK (json_valid(payload))
);

INSERT INTO _usdc_profile_refresh (payload) VALUES ('
{
  "profile": {
    "issuer": "Circle Internet Financial LLC under the reviewed non-EEA terms; Circle Internet Financial Europe SAS for the EEA offering described in the MiCA whitepaper.",
    "type": "Fiat-backed US-dollar stablecoin with region-specific issuance and redemption terms.",
    "backing": "Circle says USDC reserves are held separately from operating funds in cash, short-dated US Treasuries, overnight Treasury repurchase agreements and the Circle Reserve Fund. Exact reserve and circulation figures are dated observations below, not evergreen copy.",
    "issuer_background": "Circle operates the USDC issuance and redemption system through different legal entities and terms by region. The reviewed evidence does not support treating every holder, venue or token representation as having identical contractual rights.",
    "daily_activity": "Chaindump uses an independent DefiLlama observation for supply and price. The 2026-08-03 snapshot is stored below with its retrieval time; the live API should supersede it after the next review.",
    "audits": "Circle publishes weekly reserve disclosures and monthly independent third-party reserve assurance. The reviewed 2026-07-29 report is an independent accountants examination of management assertions at two June dates, not a full financial-statement audit.",
    "regulatory": "The ESMA register lists Circle Internet Financial Europe SAS as an authorized electronic-money institution, with an authorization-notification date of 2024-07-01. ESMA warns that registered crypto-asset whitepapers have not been reviewed or approved by a competent authority. The official OCC material reviewed records a 2025-12-12 preliminary conditional approval; Circle separately announced final approval for its national trust bank on 2026-07-10.",
    "transparency": "Circle reports reserve composition weekly and commissions monthly assurance. Reserve composition, custodians and assurance periods can change, so each claim must retain an observation or publication date.",
    "yield": "USDC does not pay holder interest under the reviewed Circle terms. Holding USDC does not itself convey a claim to reserve income or ownership of reserve assets.",
    "future": "Watch reserve-to-circulation coverage, redemption performance, ESMA register changes, native-versus-bridged supply, and an official OCC public record for any transition of reserve management to the new trust bank.",
    "outlook": "Base case: USDC remains a widely distributed dollar token while its safety case depends on liquid reserves, functioning redemption rails and precise regional legal treatment. This is an outlook, not a guarantee of par value.",
    "risks": "Secondary-market price can depart from one dollar; direct redemption eligibility differs by region and account status; issuer controls can block addresses; banking, custody, liquidity, smart-contract and bridged-asset risks remain; legal treatment can change.",
    "notes": "USDC is a fiat-backed token intended to track one US dollar. Circle Internet Financial LLC and Circle Internet Financial Europe SAS operate under different regional terms; secondary-market holders and bridged representations can have different access and risk than direct issuer customers.",
    "editorial_guardrails": "Do not describe MiCA registration as whitepaper approval, a reserve examination as a full audit, Circle Mint redemption as universal, or Circle announced OCC approval as independently verified final OCC action until the regulator record is available.",
    "evidence_policy": {"schema":"forensic-freshness-v1","status_basis":"direct_current","status_as_of":"2026-08-03","last_verified_at":"2026-08-03","next_review_at":"2026-08-10","stale":false},
    "current_observation": {
      "observed_at": "2026-08-03T16:14:26Z",
      "circulating_supply_usd": 72024953948.83426,
      "price_usd": 0.9997770501068687,
      "previous_week_circulating_supply_usd": 73448486326.83969,
      "seven_day_supply_change_pct": -1.9381,
      "reported_chain_count": 154,
      "chain_count_caveat": "DefiLlama reported representations on 154 chains; this is not a claim that every representation is native or issuer-supported.",
      "source_refs": ["llama-usdc"]
    },
    "reserve_observation": {
      "period_end": "2026-06-30",
      "report_date": "2026-07-29",
      "usdc_in_circulation": 73268560097,
      "reserve_assets_fair_value_usd": 73344909176,
      "scope": "Independent accountants examination of Circle management assertions for 2026-06-02 and 2026-06-30.",
      "source_refs": ["circle-attestation-2026-06"]
    },
    "canonical_profile": {
      "schema": "chaindump-entity-profile-source",
      "version": 1,
      "classification": {"subtype":"fiat-backed","tags":["usd-pegged","fiat-backed"],"chains":[],"jurisdictions":["EEA","United States"]},
      "status": {"operating_state":"operating","as_of":"2026-08-03","claim_ids":["claim:usdc:operating-state"]},
      "outcome": {"label":null,"as_of":null,"rule_id":null,"confidence":null,"claim_ids":[]},
      "sections": {
        "what_it_is": "USDC is a fiat-backed token intended to track one US dollar. Circle Internet Financial LLC issues and redeems under the reviewed non-EEA terms; Circle Internet Financial Europe SAS is the identified EEA issuer in the reviewed MiCA materials. Secondary-market and bridged holdings can carry different access and risk.",
        "what_happened": "USDC launched in 2018 and became a multi-chain dollar token. The ESMA register records Circle Internet Financial Europe SAS as an electronic-money institution from 2024-07-01. A 2026-07-29 reserve report covered June balances, and Circle announced final OCC approval for a national trust bank on 2026-07-10; the official OCC record reviewed by Chaindump still exposes the earlier preliminary conditional approval.",
        "why_this_outcome": "USDC distribution is consistent with a simple dollar unit, broad market availability, institutional mint-and-redeem rails and recurring reserve disclosure. Those factors plausibly reinforce liquidity and acceptance, but the reviewed sources do not isolate their individual causal contribution.",
        "strategic_choices": "Circle uses different issuer entities and legal terms inside and outside the EEA, keeps reserves separate from operating funds, publishes weekly reserve information, commissions monthly assurance and limits direct Circle Mint access to eligible institutions. Contract controls can also block addresses when required.",
        "operating_model": "Eligible Circle Mint customers send fiat to issue USDC and redeem under the applicable account terms. Outside the EEA, direct redemption in the reviewed terms depends on Circle Mint eligibility, account status, law, fees and controls. The EEA materials describe at-par redemption through Circle Internet Financial Europe SAS subject to procedures, AML controls and recovery or redemption plans. Circle says reserves are held separately in liquid dollar assets.",
        "token_and_value_capture": "The reviewed terms say holding USDC does not pay interest, convey ownership of reserve assets or entitle the holder to reserve returns. Issuance and redemption support trading around one dollar, but secondary-market price is not guaranteed. This profile does not infer unverified revenue-sharing percentages or margins.",
        "counterfactual": "One global issuer and redemption contract would be simpler to explain but would not match the reviewed regional structure. A fully on-chain reserve might reduce some banking opacity while introducing different liquidity, custody and asset risks. The evidence does not quantify either alternative.",
        "risks_and_unknowns": "Price can deviate from one dollar; direct redemption access differs by region, legal entity and account status; issuer controls can block addresses; and banking, custody, liquidity, smart-contract and bridge risks remain. Open questions include the regulator record for Circle announced final OCC approval, the timing of any trust-bank reserve role and native-versus-bridged supply by chain.",
        "lifecycle": "USDC is an operating, established multi-chain stablecoin with active issuance and redemption, recurring reserve disclosure and material independently observed circulation as of 2026-08-03.",
        "outlook_and_watch": "Watch weekly reserve composition, monthly assurance, dated supply and price, redemption performance, ESMA register changes, native-versus-bridged supply and official OCC documentation. The base case is continued major dollar-token usage; reserve, banking, compliance, bridge or redemption disruption is the main downside path."
      },
      "section_dates": {"what_it_is":"2026-08-03","what_happened":"2026-08-03","why_this_outcome":"2026-08-03","strategic_choices":"2026-08-03","operating_model":"2026-08-03","token_and_value_capture":"2026-08-03","counterfactual":"2026-08-03","risks_and_unknowns":"2026-08-03","lifecycle":"2026-08-03","outlook_and_watch":"2026-08-03"},
      "section_claim_ids": {
        "what_it_is":["claim:usdc:identity"],
        "what_happened":["claim:usdc:launch","claim:usdc:esma-registration","claim:usdc:reserve-report","claim:usdc:occ-preliminary","claim:usdc:occ-announcement"],
        "why_this_outcome":["claim:usdc:why"],
        "strategic_choices":["claim:usdc:strategy"],
        "operating_model":["claim:usdc:operating-model"],
        "token_and_value_capture":["claim:usdc:value-capture"],
        "counterfactual":["claim:usdc:counterfactual"],
        "risks_and_unknowns":["claim:usdc:risks"],
        "lifecycle":["claim:usdc:operating-state","claim:usdc:market-observation"],
        "outlook_and_watch":["claim:usdc:outlook"]
      },
      "metrics": [
        {"id":"metric:usdc:circulating-supply:2026-08-03","dimension":"circulating_supply","label":"Circulating supply","value":72024953948.83426,"unit":"usd","currency":"USD","window":{"start":null,"end":"2026-08-03T16:14:26Z","definition":"point_in_time"},"as_of":"2026-08-03T16:14:26Z","method":"aggregator_observation","scope":{"product":"usdc","chains":[]},"formula":null,"raw_input_ids":[],"claim_ids":["claim:usdc:metric-supply"],"quality_flags":[]},
        {"id":"metric:usdc:price:2026-08-03","dimension":"price","label":"Price","value":0.9997770501068687,"unit":"usd","currency":"USD","window":{"start":null,"end":"2026-08-03T16:14:26Z","definition":"point_in_time"},"as_of":"2026-08-03T16:14:26Z","method":"aggregator_observation","scope":{"product":"usdc","chains":[]},"formula":null,"raw_input_ids":[],"claim_ids":["claim:usdc:metric-price"],"quality_flags":[]},
        {"id":"metric:usdc:peg-deviation:2026-08-03","dimension":"peg_deviation","label":"Peg deviation","value":-0.022294989313131897,"unit":"percent","currency":null,"window":{"start":null,"end":"2026-08-03T16:14:26Z","definition":"point_in_time"},"as_of":"2026-08-03T16:14:26Z","method":"derived","scope":{"product":"usdc","chains":[]},"formula":"(price_usd - 1) * 100","raw_input_ids":["metric:usdc:price:2026-08-03"],"claim_ids":["claim:usdc:metric-peg"],"quality_flags":[]},
        {"id":"metric:usdc:reserve-assets:2026-06-30","dimension":"reserve_assets","label":"Reserve assets at fair value","value":73344909176,"unit":"usd","currency":"USD","window":{"start":null,"end":"2026-06-30","definition":"point_in_time"},"as_of":"2026-06-30","method":"independent_accountants_examination","scope":{"product":"usdc","chains":[]},"formula":null,"raw_input_ids":[],"claim_ids":["claim:usdc:metric-reserves"],"quality_flags":["issuer-hosted-report"]},
        {"id":"metric:usdc:reserve-coverage:2026-06-30","dimension":"reserve_coverage","label":"Reserve coverage","value":100.10420442124006,"unit":"percent","currency":null,"window":{"start":null,"end":"2026-06-30","definition":"point_in_time"},"as_of":"2026-06-30","method":"derived","scope":{"product":"usdc","chains":[]},"formula":"reserve_assets_fair_value_usd / usdc_in_circulation * 100","raw_input_ids":["metric:usdc:reserve-assets:2026-06-30"],"claim_ids":["claim:usdc:metric-coverage"],"quality_flags":["issuer-hosted-report"]}
      ],
      "events": [
        {"id":"event:usdc:esma-registration:2024-07-01","type":"regulatory_registration","date":"2024-07-01","date_precision":"day","amount_usd":null,"description":"The ESMA EMT register records the authorization notification for Circle Internet Financial Europe SAS as an electronic-money institution.","claim_ids":["claim:usdc:esma-registration"]},
        {"id":"event:usdc:occ-preliminary:2025-12-12","type":"preliminary_conditional_approval","date":"2025-12-12","date_precision":"day","amount_usd":null,"description":"The OCC granted preliminary conditional approval for the proposed national trust bank and said it could not begin business before final approval.","claim_ids":["claim:usdc:occ-preliminary"]},
        {"id":"event:usdc:reserve-report:2026-07-29","type":"reserve_report","date":"2026-07-29","date_precision":"day","amount_usd":null,"description":"An independent accountants report examined Circle reserve assertions at two June 2026 dates.","claim_ids":["claim:usdc:reserve-report"]},
        {"id":"event:usdc:occ-announcement:2026-07-10","type":"issuer_announcement","date":"2026-07-10","date_precision":"day","amount_usd":null,"description":"Circle announced final OCC approval for its national trust bank and described reserve management as a planned future capability.","claim_ids":["claim:usdc:occ-announcement"]}
      ],
      "claims": [
        {"id":"claim:usdc:identity","field_path":"analysis.sections.what_it_is.body","statement":"USDC has region-specific Circle issuers and terms.","source_ids":["circle-usdc","circle-terms","circle-whitepaper"],"evidence_locator":"USDC overview; USDC Terms scope; MiCA whitepaper issuer identification","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdc:launch","field_path":"analysis.sections.what_happened.body","statement":"Circle identifies 2018 as the USDC launch year.","source_ids":["circle-usdc"],"evidence_locator":"USDC overview launch history","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdc:esma-registration","field_path":"events[event:usdc:esma-registration:2024-07-01]","statement":"The ESMA EMT issuer data lists Circle Internet Financial Europe SAS and a 2024-07-01 authorization notification.","source_ids":["esma-mica-register"],"evidence_locator":"EMT issuer CSV row for Circle Internet Financial Europe SAS","support_direction":"supports","note":"ESMA says registered whitepapers have not been reviewed or approved by a competent authority.","review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdc:reserve-report","field_path":"events[event:usdc:reserve-report:2026-07-29]","statement":"The report examined Circle reserve assertions for 2026-06-02 and 2026-06-30.","source_ids":["circle-attestation-2026-06"],"evidence_locator":"Management assertion and Schedule I","support_direction":"supports","note":"This is an examination of specified assertions, not a full financial-statement audit.","review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdc:occ-preliminary","field_path":"events[event:usdc:occ-preliminary:2025-12-12]","statement":"Official OCC materials record preliminary conditional approval on 2025-12-12.","source_ids":["occ-preliminary","occ-cas"],"evidence_locator":"Preliminary conditional approval letter and CAS filing 2025-Charter-342299","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdc:occ-announcement","field_path":"events[event:usdc:occ-announcement:2026-07-10]","statement":"Circle announced final OCC approval and described reserve management as planned.","source_ids":["circle-occ-announcement"],"evidence_locator":"2026-07-10 press release","support_direction":"supports","note":"The reviewed OCC public record did not expose a later final decision document.","review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdc:why","field_path":"analysis.sections.why_this_outcome.body","statement":"Distribution is plausibly reinforced by dollar denomination, access, redemption rails and disclosure.","source_ids":["circle-usdc","circle-transparency","llama-usdc"],"evidence_locator":"Product access, reserve disclosure and independent circulation observation","support_direction":"context_only","note":"Analytical inference; the sources do not isolate causal contribution.","review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdc:strategy","field_path":"analysis.sections.strategic_choices.body","statement":"Circle chose regional issuers, liquid separated reserves, recurring disclosure, institutional direct access and compliance controls.","source_ids":["circle-terms","circle-whitepaper","circle-transparency","circle-attestation-2026-06"],"evidence_locator":"Terms, MiCA issuer materials, reserve-management description and examination report","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdc:operating-model","field_path":"analysis.sections.operating_model.body","statement":"Issuance, redemption and reserve mechanics differ by region and account eligibility.","source_ids":["circle-terms","circle-whitepaper","circle-redemption-policy","circle-transparency"],"evidence_locator":"Circle Mint eligibility and redemption sections; MiCA redemption policy; reserve management","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdc:value-capture","field_path":"analysis.sections.token_and_value_capture.body","statement":"USDC holders receive no interest or ownership of reserve assets under the reviewed terms.","source_ids":["circle-terms","circle-whitepaper"],"evidence_locator":"USDC Terms and MiCA whitepaper holder-rights sections","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdc:counterfactual","field_path":"analysis.sections.counterfactual.body","statement":"Alternative issuer and reserve designs would change legal and operational trade-offs.","source_ids":["circle-terms","circle-whitepaper","circle-transparency"],"evidence_locator":"Regional terms and current reserve model","support_direction":"context_only","note":"Unquantified analytical counterfactual.","review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdc:risks","field_path":"analysis.sections.risks_and_unknowns.body","statement":"USDC retains peg, redemption, issuer-control, reserve and representation risks.","source_ids":["circle-terms","circle-whitepaper","circle-transparency","llama-usdc"],"evidence_locator":"Market-value warning, redemption conditions, control rights, reserve disclosure and chain data","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdc:operating-state","field_path":"status.operating_state","statement":"USDC was operating with material circulation on 2026-08-03.","source_ids":["circle-usdc","llama-usdc"],"evidence_locator":"Current product page and DefiLlama USDC observation","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdc:market-observation","field_path":"analysis.sections.lifecycle.body","statement":"DefiLlama recorded material USDC circulation on 2026-08-03.","source_ids":["llama-usdc"],"evidence_locator":"peggedAssets entry with symbol USDC","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdc:outlook","field_path":"analysis.sections.outlook_and_watch.body","statement":"Reserve, market, redemption and regulator records are the material watch items.","source_ids":["circle-transparency","circle-attestation-2026-06","esma-mica-register","occ-cas","llama-usdc"],"evidence_locator":"Current reserve, registry, filing and market observations","support_direction":"context_only","note":"Scenario analysis, not a forecast guarantee.","review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdc:metric-supply","field_path":"metrics[metric:usdc:circulating-supply:2026-08-03].value","statement":"DefiLlama recorded 72024953948.83426 dollars of circulating USDC at retrieval.","source_ids":["llama-usdc"],"evidence_locator":"USDC circulating.peggedUSD","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdc:metric-price","field_path":"metrics[metric:usdc:price:2026-08-03].value","statement":"DefiLlama recorded a 0.9997770501068687 dollar price at retrieval.","source_ids":["llama-usdc"],"evidence_locator":"USDC price","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdc:metric-peg","field_path":"metrics[metric:usdc:peg-deviation:2026-08-03].value","statement":"Peg deviation is derived from the dated DefiLlama price.","source_ids":["llama-usdc"],"evidence_locator":"USDC price; formula stored on metric","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdc:metric-reserves","field_path":"metrics[metric:usdc:reserve-assets:2026-06-30].value","statement":"The report recorded 73344909176 dollars of reserve assets at fair value at 2026-06-30.","source_ids":["circle-attestation-2026-06"],"evidence_locator":"Schedule I, June 30 column","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}},
        {"id":"claim:usdc:metric-coverage","field_path":"metrics[metric:usdc:reserve-coverage:2026-06-30].value","statement":"Reserve coverage is derived from report values for reserve assets and USDC in circulation.","source_ids":["circle-attestation-2026-06"],"evidence_locator":"Schedule I, June 30 column; formula stored on metric","support_direction":"supports","note":null,"review":{"state":"pending","reviewer":null,"reviewed_at":null}}
      ],
      "freshness": {"state":"current","last_reviewed_at":"2026-08-03","next_review_at":"2026-08-10","field_reviews":[]},
      "confidence": "medium",
      "extensions": {
        "structured_analysis": {
          "strategic_choices":[
            {"decision":"Use distinct issuer entities and legal terms inside and outside the EEA.","consequence":"Redemption rights and procedures cannot be summarized as one universal promise.","claim_ids":["claim:usdc:strategy"]},
            {"decision":"Hold reserves separately and publish recurring reserve evidence.","consequence":"Transparency improves while custody, banking and liquidity risk remain.","claim_ids":["claim:usdc:strategy"]},
            {"decision":"Limit direct Circle Mint access to eligible institutions.","consequence":"Many holders depend on intermediaries or secondary markets.","claim_ids":["claim:usdc:strategy"]}
          ],
          "unknowns":[
            {"question":"When will an OCC public record independently document the final approval announced by Circle?","resolution_trigger":"A final OCC decision or regulator release."},
            {"question":"When will the new trust bank begin any USDC reserve-management role?","resolution_trigger":"Operating authorization and implemented reserve-management disclosures."},
            {"question":"How much cross-chain supply is native versus bridged?","resolution_trigger":"A reproducible chain-by-chain issuer reconciliation."}
          ]
        },
        "review_metadata": {"schema":"forensic-freshness-v1","status_basis":"direct_current","status_as_of":"2026-08-03","last_verified_at":"2026-08-03","next_review_at":"2026-08-10","stale":false}
      }
    },
    "sources": []
  },
  "sources": [
    {"id":"circle-usdc","title":"USDC product and network overview","publisher":"Circle","url":"https://www.circle.com/usdc","source_role":"primary","tier":"B","role":"primary","accessed_at":"2026-08-03","source_date":"2026-07-30","source_date_kind":"updated","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
    {"id":"circle-terms","title":"USDC Terms","publisher":"Circle","url":"https://www.circle.com/legal/usdc-terms","source_role":"primary","tier":"A","role":"primary","accessed_at":"2026-08-03","source_date":"2025-12-12","source_date_kind":"updated","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"mechanism","stale_after":null,"stale":false},
    {"id":"circle-transparency","title":"USDC reserve transparency","publisher":"Circle","url":"https://www.circle.com/transparency","source_role":"primary","tier":"B","role":"primary","accessed_at":"2026-08-03","source_date":"2026-07-30","source_date_kind":"updated","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
    {"id":"circle-attestation-2026-06","title":"USDC Reserve Examination Report, June 2026","publisher":"Independent accountants via Circle","url":"https://6778953.fs1.hubspotusercontent-na1.net/hubfs/6778953/USDCAttestationReports/2026/2026%20USDC_Examination%20Report%20June%2026.pdf","source_role":"independent","tier":"A","role":"independent","accessed_at":"2026-08-03","source_date":"2026-07-29","source_date_kind":"published","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"current_state","stale_after":"2026-08-31","stale":false},
    {"id":"circle-whitepaper","title":"MiCA USDC Whitepaper","publisher":"Circle Internet Financial Europe SAS","url":"https://www.circle.com/legal/mica-usdc-whitepaper","source_role":"primary","tier":"A","role":"primary","accessed_at":"2026-08-03","source_date":"2026-07-10","source_date_kind":"updated","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
    {"id":"circle-redemption-policy","title":"MiCA Redemption Policy","publisher":"Circle Internet Financial Europe SAS","url":"https://www.circle.com/legal/mica-redemption-policy","source_role":"primary","tier":"A","role":"primary","accessed_at":"2026-08-03","source_date":null,"source_date_kind":"unknown","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
    {"id":"esma-mica-register","title":"MiCA register and electronic-money-token issuer data","publisher":"European Securities and Markets Authority","url":"https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica","source_role":"primary","tier":"A","role":"primary","accessed_at":"2026-08-03","source_date":"2026-07-31","source_date_kind":"updated","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
    {"id":"occ-preliminary","title":"OCC preliminary conditional approval for First National Digital Currency Bank","publisher":"Office of the Comptroller of the Currency","url":"https://www.occ.gov/news-issuances/news-releases/2025/nr-occ-2025-125a.pdf","source_role":"primary","tier":"A","role":"primary","accessed_at":"2026-08-03","source_date":"2025-12-12","source_date_kind":"published","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"historical_event","stale_after":null,"stale":false},
    {"id":"occ-cas","title":"OCC Corporate Applications Search filing 2025-Charter-342299","publisher":"Office of the Comptroller of the Currency","url":"https://apps.occ.gov/CAS/home/details?FilingID=342299&FilingSubtypeID=1093&FilingTypeID=2","source_role":"primary","tier":"A","role":"primary","accessed_at":"2026-08-03","source_date":"2025-12-12","source_date_kind":"event","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
    {"id":"circle-occ-announcement","title":"Circle announces final OCC approval to establish national trust bank","publisher":"Circle","url":"https://www.circle.com/pressroom/circle-receives-final-occ-approval-to-establish-national-trust-bank","source_role":"primary","tier":"B","role":"primary","accessed_at":"2026-08-03","source_date":"2026-07-10","source_date_kind":"published","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"historical_event","stale_after":null,"stale":false},
    {"id":"blackrock-crf","title":"Circle Reserve Fund Institutional Shares","publisher":"BlackRock","url":"https://www.blackrock.com/cash/en-us/products/329365/circle-reserve-fund-institutional-shares","source_role":"primary","tier":"B","role":"primary","accessed_at":"2026-08-03","source_date":"2026-07-20","source_date_kind":"observed","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false},
    {"id":"llama-usdc","title":"Stablecoin market data API","publisher":"DefiLlama","url":"https://stablecoins.llama.fi/stablecoins?includePrices=true","source_role":"aggregator","tier":"C","role":"aggregator","accessed_at":"2026-08-03T16:14:26Z","source_date":"2026-08-03","source_date_kind":"observed","last_verified_at":"2026-08-03","checked_at":"2026-08-03","access_state":"reachable","evidence_scope":"current_state","stale_after":"2026-08-10","stale":false}
  ]
}
');

UPDATE stablecoin_meta
SET
  name = 'USD Coin',
  symbol = 'USDC',
  profile = json_set(
    json(json_extract((SELECT payload FROM _usdc_profile_refresh), '$.profile')),
    '$.sources',
    json(json_extract((SELECT payload FROM _usdc_profile_refresh), '$.sources'))
  ),
  sources = json_extract((SELECT payload FROM _usdc_profile_refresh), '$.sources'),
  updated_at = '2026-08-03'
WHERE lower(slug) = 'usdc';

DROP TABLE _usdc_profile_refresh;

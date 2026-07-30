# Agent-readiness / AI-discovery checklist (Phase D)

Runs **after the redesign, before UAT**. Source: isitagentready.com audit of
chaindump.xyz (via Carson 2026-07-13). Each item = a file/header the Worker
serves. Most are static routes we add to `src/worker.js` (served with the right
content-type) or `public/` assets. Verify each returns 200 with correct
content-type before UAT.

## Must-do (high value, low effort)

1. **`/robots.txt`** — currently invalid (no `User-agent`). Serve plain-text,
   200, with explicit `User-agent` + allow/disallow, AI-crawler rules, and
   Content-Signal directives (items 6–7 below folded in).
   - Skill: https://isitagentready.com/.well-known/agent-skills/robots-txt/SKILL.md
   - RFC 9309: https://www.rfc-editor.org/rfc/rfc9309

2. **`/sitemap.xml`** — canonical URLs (each view + key entity deep-links:
   `/chain/*`, `/scam/*`, `/collection/*`), referenced from robots.txt. Keep
   updated on publish.
   - Skill: https://isitagentready.com/.well-known/agent-skills/sitemap/SKILL.md
   - https://www.sitemaps.org/protocol.html

3. **`Link:` response headers** on homepage (RFC 8288) — e.g.
   `Link: </.well-known/api-catalog>; rel="api-catalog"`,
   `Link: </docs/api>; rel="service-doc"`.
   - Skill: https://isitagentready.com/.well-known/agent-skills/link-headers/SKILL.md
   - RFC 8288: https://www.rfc-editor.org/rfc/rfc8288 · RFC 9727 §3

4. **AI-crawler `User-agent` rules** in robots.txt — GPTBot, OAI-SearchBot,
   Claude-Web, Google-Extended, + wildcard, with our allow/disallow policy.
   - Skill: https://isitagentready.com/.well-known/agent-skills/ai-rules/SKILL.md
   - https://developers.cloudflare.com/ai-crawl-control/

5. **Content-Signal directives** in robots.txt — declare AI usage prefs, e.g.
   `Content-Signal: ai-train=no, search=yes, ai-input=no` (Carson to confirm the
   actual policy).
   - Skill: https://isitagentready.com/.well-known/agent-skills/content-signals/SKILL.md
   - https://contentsignals.org/

6. **`/.well-known/api-catalog`** (RFC 9727) — `application/linkset+json` with a
   `linkset` array; each entry: `anchor` (API URL) + relations `service-desc`
   (OpenAPI), `service-doc`, `status` (health). We already have `/api/agent/*`
   and `/api/health` to point at.
   - Skill: https://isitagentready.com/.well-known/agent-skills/api-catalog/SKILL.md
   - RFC 9727: https://www.rfc-editor.org/rfc/rfc9727

7. ✅ **Markdown-for-agents** — DONE (2026-07-24). `prefersMarkdown()` (`src/lib/negotiate.js`)
   serves `Content-Type: text/markdown` only when `Accept` explicitly asks for
   markdown and does not also accept HTML (so real browsers always get HTML).
   Was previously homepage-only (served the site-wide `llms.txt` overview);
   now also covers every entity/view deep-link — `/chain/:name`, `/scam/:slug`,
   `/collection/:id`, and all of `/live`, `/mid`, `/grave`, `/nft`, `/stables`,
   `/rwa`, `/infra`, `/markets`, `/geo`, `/uspolicy`, `/power`, `/news`,
   `/traces`, `/api` — via a shared `sendPage()` helper + pure renderer
   `renderEntityMarkdown()` (`src/lib/entity-markdown.js`) that reuses the same
   title/description/JSON-LD already computed for each page's Open Graph tags
   (Metrics from `Dataset.variableMeasured`, ranked links from `ItemList`,
   Sources from `Dataset.citation`, plus a `Structured JSON:` link to the
   matching `/api/*` route where one exists). 340 tests passing (13 new:
   `test/entity-markdown.test.js` unit + `test/entity-markdown.integration.test.js`
   route-level). **Not yet verified against a real browser / chaindump.xyz** —
   this session's sandbox blocks direct network egress to the live domain;
   verify with `curl -s -H 'Accept: text/markdown' https://chaindump.xyz/chain/Solana`
   once deployed.
   - Skill: https://isitagentready.com/.well-known/agent-skills/markdown-negotiation/SKILL.md
   - https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/

8. ✅ **`/.well-known/mcp/server-card.json`** (SEP-1649) — DONE. The Phase F
   `chaindump-mcp` server is now HOSTED on **Cloud Run in `arkova1`** (Carson:
   "use existing for now") at
   `https://chaindump-mcp-270018525501.us-central1.run.app/mcp`. The card
   advertises serverInfo, the streamable-http endpoint, and the 6 tools. Verified
   live: card 200 + the endpoint it points at returns 200 (no dead URL) + real
   `tools/call`s work against production data (screen_address → ⛔ SANCTIONED,
   chain_forensics → sourced verdict).
   - Skill: https://isitagentready.com/.well-known/agent-skills/mcp-server-card/SKILL.md

9. ✅ **`/.well-known/agent-skills/index.json`** (Agent Skills Discovery RFC
   v0.2.0) — DONE. `$schema` + one `chaindump-chain-intel` skill pointing at the
   served skill doc (`/.well-known/agent-skills/chaindump-chain-intel.md`), with a
   **request-time SHA-256** so the digest always matches the doc (verified live:
   both 200, `digestMatches: true`). The skill advertises the LIVE x402 agent API
   (`/api/agent/*`, verified 200/402 before publishing).
   - Skill: https://isitagentready.com/.well-known/agent-skills/agent-skills/SKILL.md
   - https://github.com/cloudflare/agent-skills-discovery-rfc

## Conditional (only if we expose protected APIs)

10. **OAuth/OIDC discovery** — `/.well-known/openid-configuration` or
    `/.well-known/oauth-authorization-server`. The Worker now serves these only
    when a real issuer, token endpoint, JWKS URI, and registration URI are set
    as `OAUTH_*` runtime variables (including the operator's real claim URI).
    Until then the routes return an explicit `oauth_not_configured` 404 and
    `/auth.md` points agents to x402; this avoids publishing fake credentials
    or an unusable issuer.
    - https://www.rfc-editor.org/rfc/rfc8414
11. **OAuth Protected Resource Metadata** — `/.well-known/oauth-protected-resource`.
    It is guarded by the same real-issuer configuration and includes
    `resource`, `authorization_servers`, `scopes_supported`, and
    `bearer_methods_supported: ["header"]` when enabled.
    - RFC 9728: https://www.rfc-editor.org/rfc/rfc9728
12. **`/auth.md`** — agent registration instructions. ✅ **DONE** (2026-07-30).
    The page is self-contained and describes the current x402/no-account flow;
    it adds OAuth registration instructions only when the guarded metadata is
    configured.
    - https://workos.com/auth-md

## Stretch

13. **DNS-AID records** — manifest and DNSSEC runbook are in
    `docs/dns-aid.md` and `ops/dns/dns-aid.zone`. Publication remains an
    external Cloudflare/registrar action requiring zone-edit permissions; a
    committed zone file is not represented as live until `dig +dnssec` shows
    authenticated records.
    - draft-mozleywilliams-dnsop-dnsaid · RFC 9460
14. **WebMCP** — ✅ **DONE** (2026-07-30). `public/index.html` registers four
    read-only tools with `document.modelContext`/`navigator.modelContext` when
    the browser API is present: market summary, chain profile, sourced
    signals, and forensic trace lookup. Registration is abort-signal-backed and
    pagehide-safe; no tool submits a transaction or mutates the site.
    - https://webmachinelearning.github.io/webmcp/

## Notes
- **Carson granted permission (2026-07-13) to use Claude in Chrome for anything
  needed during this phase** — e.g. running the isitagentready.com audit against
  chaindump.xyz to confirm each item flips to pass, testing crawler/agent
  behavior, or verifying `Accept: text/markdown` negotiation from a real browser.
- Most `.well-known/*` and robots/sitemap are cheap Worker routes — batch them.
- The api-catalog + mcp-server-card + agent-skills-index should reference the
  real `/api/agent/*` surface and the Phase F MCP server, so sequence them so
  the pointers are accurate.
- Confirm the Content-Signal + AI-crawler policy with Carson before publishing
  (it's a business decision: do we allow AI training on our analysis?).

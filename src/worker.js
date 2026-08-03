import { Hono } from 'hono';
import { OFAC_FILES, ofacFileUrl, parseSanctionedFile, buildSanctionedRows } from './lib/ofac.js';
import { NFT_LIST_URL, NFT_PER_PAGE, nftRowsFromPage, dedupeNftRows } from './lib/nft.js';
import { validateFieldCitedNft } from './lib/nft-citation.mjs';
import { forensicFreshness } from './lib/evidence-freshness.mjs';
import { prefersMarkdown } from './lib/negotiate.js';
import { renderEntityMarkdown } from './lib/entity-markdown.js';
import { norm, resolveCategory, categoryLabel, coverageTier, relatedBlock, deriveCategory } from './lib/chainkit.js';
import { annotateDataQuality, assessChainDataQuality } from './lib/data-quality.js';
import {
  promotionPlan,
  proposalNeedsHumanReview,
  REVIEW_REQUIRED_PROPOSAL_DATASETS,
  validateResearchCandidateProposal,
} from './lib/desk-promote.js';
import {
  forensicRefreshFreshness,
  proposalAgentFreshness,
} from './lib/research-desk-status.js';
import { USDC_DP, monthKeyFromDate, isLiveMode, decodePaymentHeader, paymentRequirements, structuralCheck, pruneStaleQuota } from './lib/x402.js';
import { TAG_LABELS, canonTags, isFraudy, causeVocab } from './lib/causes.js';
// Aliased deliberately: causes.js above exports TAG_LABELS/canonTags into this
// same scope. An unaliased import would shadow the cause vocabulary silently —
// no error, just wrong labels on the graveyard chips.
import { cohortFor, tagVocab, parseLaunch, canonTags as canonChainTags, isTheme as isChainTheme, isCohort as isChainCohort, themesForCategory } from './lib/tags.js';
import { SCORE_META, TIER_CRITERIA, TIERS, BOARD_SIZE, CHANGE_90D_MIN_SPAN_DAYS, scoreRows, classifyTier, baselineOk, activityIndex } from './lib/scoring.js';
import { DEX_CATEGORIES, aggregateBreakdown, feedIsDegenerate, selectCandidates, dedupeChains, rollupDexProtocols } from './lib/llama.js';
import { renderSsrRows } from './lib/ssr-rows.js';
import { CHAIN_DOSSIER_DIMENSIONS } from './lib/chain-dossier.js';
import { normalizeDossier } from './lib/normalized-dossier.js';
import {
  buildLegacyEntityProfile,
  embeddedCanonicalEntityProfile,
  entityProfileContract,
  ENTITY_TYPES,
  METRIC_DIMENSIONS,
} from './lib/entity-profile.js';
import { projectFieldCitedNftProfile } from './lib/nft-profile-projection.js';
import { normalizeExchangeCase, summarizeExchangeCases } from './lib/exchange-analysis.js';
import { buildNftLifecycleAnalysis } from './lib/nft-lifecycle-analysis.js';
import {
  casinoPublicationCoverageSql,
  summarizeCasinoPublicationCoverage,
} from './lib/casino-publication-cohort.js';
import {
  slmTrainingSchemaPayload,
  trendTaxonomyPayload,
} from './lib/trend-taxonomy.js';
import {
  assessCasinoPublicationDepth,
  assessExchangePublicationDepth,
  assessNftPublicationDepth,
  isIsoReviewTimestamp,
  normalizePublicationSource,
  summarizePublicationDepth,
} from './lib/publication-depth.mjs';

function editorialReviewSql(alias) {
  const reviewedAt = `${alias}.evidence_reviewed_at`;
  const dateShape = `${reviewedAt} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`;
  const dateTimeShape = `substr(${reviewedAt}, 1, 19) GLOB `
    + `'[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T`
    + `[0-9][0-9]:[0-9][0-9]:[0-9][0-9]'`;
  const dateTimeSuffix = `(substr(${reviewedAt}, -1) = 'Z'`
    + ` OR substr(${reviewedAt}, -6, 1) IN ('+', '-'))`;
  return `(${alias}.evidence_reviewed = 1`
    + ` AND NULLIF(TRIM(${alias}.evidence_reviewer), '') IS NOT NULL`
    + ` AND ((${dateShape} AND length(${reviewedAt}) = 10)`
    + ` OR (${dateTimeShape} AND ${dateTimeSuffix}))`
    + ` AND julianday(${reviewedAt}) IS NOT NULL)`;
}

function publicationSourceRecords(sourceValues) {
  if (!Array.isArray(sourceValues)) return [];
  return sourceValues.map((sourceValue) => {
    const source = typeof sourceValue === 'string'
      ? { url: sourceValue }
      : (sourceValue || {});
    const normalized = normalizePublicationSource(source);
    const result = {
      ...source,
      id: source.id || source.source_id || normalized.id,
      url: source.url || source.canonical_url || normalized.url,
      publisher: source.publisher || normalized.publisher,
      source_tier: normalized.tier,
      source_role: normalized.role,
      independence_group: normalized.independence_group,
      independence_key: normalized.independence_key,
      registered: true,
      access_state: normalized.access_state,
      evidence_reviewed: normalized.evidence_reviewed,
      evidence_reviewer: normalized.evidence_reviewer,
      evidence_reviewed_at: normalized.evidence_reviewed_at,
    };
    if (typeof normalized.resolving === 'boolean') {
      result.resolving = normalized.resolving;
      result.reachable = normalized.resolving;
    }
    return result;
  });
}

const PENDING_PUBLICATION_SUPPORT = 'pending_independent_support';
const NFT_PUBLICATION_NARRATIVE_FIELDS = [
  'analysis',
  'benefits',
  'business',
  'community_history',
  'community_sentiment',
  'founder_engagement',
  'notable_holders',
  'social',
];
const NFT_HIGH_RISK_PROFILE_FIELDS = [
  'analysis',
  'chain_dependence',
  'chronology',
  'counterfactual',
  'market_holder_boundaries',
  'products_and_value_capture',
  'risks',
  'strategic_choices',
  'status',
  'team',
  'token_model',
  'why',
];

function publicationDepthGapAt(depth, path) {
  return (depth?.unresolved_high_risk_claims || []).find((claim) => (
    claim.path === path
  )) || null;
}

function hasPublicationDepthGap(depth, predicate) {
  return (depth?.unresolved_high_risk_claims || []).some(predicate);
}

function pendingPublicationSection(section) {
  const result = { publication_support: PENDING_PUBLICATION_SUPPORT };
  for (const field of ['source_refs', 'source_ids', 'evidence_refs', 'refs']) {
    if (Array.isArray(section?.[field])) result[field] = section[field];
  }
  return result;
}

function publicForensicAnalysis(analysisValue, depth) {
  if (!analysisValue || typeof analysisValue !== 'object') return null;
  const analysis = { ...analysisValue };
  for (const field of ['outcome', 'why', 'counterfactual']) {
    if (publicationDepthGapAt(depth, `forensic_analysis.${field}`)) {
      analysis[field] = pendingPublicationSection(analysisValue[field]);
    }
  }
  if (Array.isArray(analysisValue.strategic_choices)) {
    analysis.strategic_choices = analysisValue.strategic_choices.map((choice, index) => (
      publicationDepthGapAt(depth, `forensic_analysis.strategic_choices[${index}]`)
        ? pendingPublicationSection(choice)
        : choice
    ));
  }
  return analysis;
}

function hasPendingCausalConclusion(depth) {
  return hasPublicationDepthGap(depth, ({ path }) => (
    path === 'forensic_analysis.outcome'
    || path === 'forensic_analysis.why'
    || path === 'forensic_analysis.counterfactual'
    || path.startsWith('forensic_analysis.strategic_choices[')
  ));
}

function publicExchangeProfile(profileValue, depth) {
  let profile = profileValue && typeof profileValue === 'object'
    ? { ...profileValue }
    : {};
  const pending = Number(depth?.unresolved_high_risk_claim_count) > 0;
  if (pending) {
    const safeProfile = {};
    for (const field of [
      'citation_schema',
      'evidence',
      'evidence_policy',
      'review',
    ]) {
      if (Object.hasOwn(profile, field)) safeProfile[field] = profile[field];
    }
    profile = safeProfile;
  }
  profile.forensic_analysis = publicForensicAnalysis(
    profileValue?.forensic_analysis,
    depth,
  );
  return profile;
}

function exchangeMetricSupportPending(row, depth) {
  const metricIdentity = `${row.metric_type || ''} ${row.metric_label || ''}`
    .toLowerCase();
  return /(loss|exposure|shortfall|liabilit|stolen)/.test(metricIdentity)
    && Number(depth?.unresolved_high_risk_claim_count) > 0;
}

// Server-side counterpart to the shared report renderer. Keep this projection
// deliberately shallow: it only uses fields that have already passed the
// public redaction/publication gates, while preserving nulls for unknowns.
function normalizedExchangeDossier(row, analysis, profile) {
  const forensic = analysis?.forensic_analysis || profile?.forensic_analysis || {};
  const token = analysis?.token || {};
  return normalizeDossier({
    category: `${String(row.kind || 'exchange').toUpperCase()} · ${row.venue_type || 'exchange'}`,
    name: row.name,
    // `publicExchangeCase` deliberately nulls status when outcome support is
    // pending. Do not fall back to the source lifecycle here or the normalized
    // contract would re-introduce a withheld conclusion.
    status: row.status ?? null,
    metric: row.metric,
    as_of: analysis?.metric?.as_of || row.updated_at,
    what_it_is: profile?.purpose || profile?.what_it_does || analysis?.product_cohort,
    what_happened: row.summary,
    why: forensic.why || profile?.why || profile?.success_factors,
    strategic_choices: forensic.strategic_choices || profile?.strategic_choices,
    operating_model: analysis?.operating_model,
    token_value_capture: token,
    evidence: analysis?.evidence,
    counterfactual: forensic.counterfactual || profile?.counterfactual,
    risks_unknowns: profile?.risks || profile?.risk_factors || forensic.unknowns,
    lifecycle: profile?.synthesis || row.status || null,
    outlook_watch: row.outlook || forensic.watch,
    review_metadata: analysis?.freshness || forensic.review,
    sources: row.sources,
  });
}

function publicExchangeCase(row) {
  const depth = row.publication_depth;
  const outcomePending = Boolean(publicationDepthGapAt(depth, 'forensic_analysis.outcome'));
  const whyPending = Boolean(publicationDepthGapAt(depth, 'forensic_analysis.why'));
  const causalPending = hasPendingCausalConclusion(depth);
  const metricPending = exchangeMetricSupportPending(row, depth);
  const analysis = {
    ...row.analysis,
    forensic_analysis: publicForensicAnalysis(
      row.analysis?.forensic_analysis || row.profile?.forensic_analysis,
      depth,
    ),
    forensic_analysis_status: causalPending
      ? 'support_pending'
      : row.analysis?.forensic_analysis_status,
  };
  const publicProfile = publicExchangeProfile(row.profile, depth);
  const publicRow = {
    ...row,
    status: outcomePending ? null : row.status,
    metric: metricPending ? null : row.metric,
    peak_metric: metricPending ? null : row.peak_metric,
    drawdown_pct: metricPending ? null : row.drawdown_pct,
    summary: outcomePending || whyPending ? null : row.summary,
    outlook: causalPending ? null : row.outlook,
    profile: publicProfile,
    analysis,
  };
  return {
    ...publicRow,
    normalized_dossier: normalizedExchangeDossier(publicRow, analysis, publicProfile),
    publication_support: {
      status: outcomePending ? PENDING_PUBLICATION_SUPPORT : null,
      metric: metricPending ? PENDING_PUBLICATION_SUPPORT : null,
      summary: outcomePending || whyPending ? PENDING_PUBLICATION_SUPPORT : null,
      outlook: causalPending ? PENDING_PUBLICATION_SUPPORT : null,
    },
  };
}

function publicNftProfile(profileValue, depth) {
  const profile = profileValue && typeof profileValue === 'object'
    ? { ...profileValue }
    : {};
  const evidence = Array.isArray(profileValue?.evidence)
    ? profileValue.evidence.map((item) => ({ ...item }))
    : [];
  for (const claim of depth?.unresolved_high_risk_claims || []) {
    const match = /^evidence\[(\d+)\]\.([a-z0-9_]+)$/i.exec(claim.path);
    if (!match) continue;
    const index = Number(match[1]);
    const field = match[2];
    if (Object.hasOwn(profile, field)) profile[field] = null;
    if (evidence[index]) {
      evidence[index].value = null;
      evidence[index].publication_support = PENDING_PUBLICATION_SUPPORT;
    }
  }
  for (const field of NFT_PUBLICATION_NARRATIVE_FIELDS) {
    const support = (depth?.claim_support || []).find((claim) => (
      String(claim.path || '').endsWith(`.${field}`)
    ));
    if (!support?.passes && Object.hasOwn(profile, field)) profile[field] = null;
  }
  if (hasPendingCausalConclusion(depth)) {
    for (const field of NFT_HIGH_RISK_PROFILE_FIELDS) {
      if (Object.hasOwn(profile, field)) profile[field] = null;
    }
  }
  profile.evidence = evidence;
  profile.forensic_analysis = publicForensicAnalysis(
    profileValue?.forensic_analysis,
    depth,
  );
  profile.publication_support = Object.fromEntries(
    [...NFT_PUBLICATION_NARRATIVE_FIELDS, ...NFT_HIGH_RISK_PROFILE_FIELDS]
      .filter((field) => Object.hasOwn(profileValue || {}, field))
      .map((field) => [field, profile[field] == null
        ? PENDING_PUBLICATION_SUPPORT
        : null]),
  );
  return profile;
}

function normalizedNftDossier(row, profile, sources) {
  const forensic = profile?.forensic_analysis || {};
  return normalizeDossier({
    category: `NFT / Ordinals · ${row.chain || 'chain unknown'}`,
    name: row.name,
    status: row.status,
    metric: profile?.secondary_volume_usd ?? profile?.mint_raise_usd ?? null,
    as_of: profile?.evidence_policy?.status_as_of
      || profile?.evidence_policy?.last_verified_at
      || row.updated_at,
    what_it_is: profile?.collection_description || profile?.business,
    what_happened: profile?.community_history || profile?.analysis,
    why: forensic.why || profile?.why || profile?.risks,
    strategic_choices: forensic.strategic_choices || profile?.strategic_choices || profile?.founder_engagement,
    operating_model: profile?.business || profile?.benefits,
    token_value_capture: profile?.token_model || profile?.royalties_enforced || profile?.royalties_earned_usd,
    evidence: profile?.evidence,
    counterfactual: forensic.counterfactual || profile?.counterfactual || profile?.watch,
    risks_unknowns: profile?.risks || profile?.unknowns,
    lifecycle: profile?.analysis,
    outlook_watch: profile?.outlook || forensic.watch,
    review_metadata: profile?.evidence_policy,
    sources,
  });
}

function publicNftRisk(riskValue) {
  if (!riskValue) return null;
  return {
    level: 'review_pending',
    summary: null,
    evidence: null,
    sources: riskValue.sources,
    publication_support: PENDING_PUBLICATION_SUPPORT,
  };
}

const ENV = {};
const app = new Hono();
app.use('*', async (c, next) => {
  if (!ENV.__init) { Object.assign(ENV, c.env || {}); ENV.__init = true; }
  await next();
});

// --- Express(req,res) -> Hono(c) compatibility shim, keeps handler bodies untouched ---
function wrap(handler) {
  return async (c) => {
    const url = new URL(c.req.url);
    const req = {
      query: Object.fromEntries(url.searchParams),
      params: c.req.param(),
      headers: Object.fromEntries(c.req.raw.headers),
      ip: c.req.header('cf-connecting-ip') || '',
      raw: c.req.raw,
      url: c.req.url,
    };
    let body, status = 200, html = null;
    const headers = {};
    const res = {
      json(obj) { body = obj; return res; },
      html(str) { html = str; return res; },
      status(n) { status = n; return res; },
      setHeader(k, v) { headers[k] = v; return res; },
    };
    await handler(req, res);
    const response = html != null
      ? new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
      : c.json(body, status);
    for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
    return response;
  };
}

// ---------------------------------------------------------------------------
// DefiLlama + growthepie + CoinGecko — all free / no-auth endpoints
// ---------------------------------------------------------------------------
const CHAINS_URL = 'https://api.llama.fi/v2/chains';
const DEXS_URL   = 'https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true';
const FEES_URL   = 'https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true';
const STABLES_URL = 'https://stablecoins.llama.fi/stablecoinchains';
const GP_FUND_URL = 'https://api.growthepie.xyz/v1/fundamentals.json';
const GP_MASTER_URL = 'https://api.growthepie.xyz/v1/master.json';
// The CloudFront-fronted fundamentals.json 403s Workers' default fetch UA
// (confirmed via prod logs) while the smaller master.json on the same host
// doesn't — a browser-like UA clears it.
const GP_HEADERS = { 'user-agent': 'Mozilla/5.0 (compatible; chaindump/1.0; +https://chaindump.xyz)' };
const CG_PRICE = 'https://api.coingecko.com/api/v3/simple/price';
// CoinGecko API key (free "Demo" key or Pro) — greatly raises rate limits so prices load reliably.
// Set COINGECKO_API_KEY in the environment. Demo keys use the public host + x_cg_demo_api_key.
function cgUrl(url) { const CG_KEY = ENV.COINGECKO_API_KEY || ''; return CG_KEY ? url + (url.includes('?') ? '&' : '?') + 'x_cg_demo_api_key=' + encodeURIComponent(CG_KEY) : url; }
let priceCache = {}; // gecko_id -> { price, mcap, ch, ts } — sticky so transient CoinGecko failures don't wipe prices

// ---- name normalization so sources line up ----
// norm() + its ALIAS map now live in ./lib/chainkit.js (single source of truth,
// shared with the chain-linking logic so keys can never diverge).
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// fetch JSON with timeout; never throws the whole snapshot down
async function fetchJson(url, ms = 15000, extraHeaders = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { accept: 'application/json', ...extraHeaders }, signal: ctl.signal });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// run promise-returning tasks with a concurrency cap
async function pool(items, worker, limit = 8) {
  const out = new Array(items.length);
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await worker(items[idx], idx); }
      catch (e) { out[idx] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}


// growthepie master: chainId -> { origin, bucket, stack, da_layer } — origin for
// the DAA lookup, the rest to derive a value-prop category when curated misses.
function parseMaster(master) {
  const byChainId = {};
  const chains = (master && master.chains) || {};
  for (const originKey in chains) {
    const c = chains[originKey];
    const cid = c.evm_chain_id != null ? Number(c.evm_chain_id) : null;
    if (cid != null && !Number.isNaN(cid)) byChainId[cid] = { origin: originKey, bucket: c.bucket, stack: c.stack, da_layer: c.da_layer };
  }
  return byChainId;
}
// Back-compat: the CF-blocked D1 seed may still hold the old chainId->string shape.
function masterRec(v) { return typeof v === 'string' ? { origin: v } : (v || null); }
// growthepie fundamentals: latest value per origin_key for a metric
function latestByOrigin(fundamentals, metricKey) {
  const best = {}; // origin -> {date, value}
  for (const row of Array.isArray(fundamentals) ? fundamentals : []) {
    if (row.metric_key !== metricKey) continue;
    const cur = best[row.origin_key];
    if (!cur || row.date > cur.date) best[row.origin_key] = { date: row.date, value: Number(row.value) || 0 };
  }
  const out = {};
  for (const o in best) out[o] = best[o].value;
  return out;
}

// ---------------------------------------------------------------------------
// Snapshot builder
// ---------------------------------------------------------------------------
let cache = { ts: 0, data: null };
const TTL = 60 * 1000;              // per-isolate re-read interval for the D1 snapshot cache

// ---- D1-backed analyst takes / research data (bound directly, no HTTP hop) ----
// Pass `params` + `?` placeholders for anything derived from a request (route
// params, query strings) — never interpolate request-derived values into `sql`.
async function dbQuery(sql, params = []) {
  if (!ENV.DB) return [];
  const stmt = params.length ? ENV.DB.prepare(sql).bind(...params) : ENV.DB.prepare(sql);
  const { results } = await stmt.all();
  return results || [];
}
let masterCache = { ts: 0, data: null };
const MASTER_TTL = 6 * 60 * 60 * 1000;

// master.json (chainId -> growthepie origin_key map, needed to attach DAA to
// each chain) is CloudFront-fronted on the same host as fundamentals.json and
// is blocked from Cloudflare's edge the same way. Without it, origin_key is
// null for every chain and active-address data can never attach even when the
// DAA map itself is present — that's the silent second half of the bug.
// Same strategy: try live, else fall back to the D1-persisted last-good map.
async function getMaster(env) {
  const now = Date.now();
  if (masterCache.data && Object.keys(masterCache.data).length && now - masterCache.ts <= MASTER_TTL) return masterCache.data;
  try {
    const m = parseMaster(await fetchJson(GP_MASTER_URL, 20000, GP_HEADERS));
    if (Object.keys(m).length) {
      masterCache = { ts: now, data: m };
      if (env && env.DB) { try { await env.DB.prepare(
        `INSERT INTO snapshot_cache (key, data, updated_at) VALUES ('master', ?, ?)
         ON CONFLICT(key) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`
      ).bind(JSON.stringify(m), now).run(); } catch (e) {} }
      return m;
    }
  } catch (e) { console.error('[getMaster] live growthepie failed:', e.message); }
  if (env && env.DB) {
    try {
      const row = await env.DB.prepare(`SELECT data FROM snapshot_cache WHERE key='master'`).first();
      if (row && row.data) { masterCache = { ts: now, data: JSON.parse(row.data) }; return masterCache.data; }
    } catch (e) { console.error('[getMaster] D1 fallback failed:', e.message); }
  }
  return masterCache.data || {};
}

// growthepie's fundamentals.json (source of active-address data) 403s from
// Cloudflare's edge — confirmed via prod logs: the identical request succeeds
// from a normal IP but CloudFront blocks Cloudflare's ASN. No smaller daa-only
// endpoint exists and DefiLlama's active-users API is Pro-gated, so there is no
// clean live free source reachable from the Worker. Strategy: keep attempting
// the live fetch (auto-recovers if the block ever clears), but persist the last
// GOOD daa map in D1 (key='daa') so active-address data survives cold starts
// and 403'd ticks instead of nulling every chain. Seeded once from a normal IP.
let daaCache = { ts: 0, data: {} };
const DAA_TTL = 30 * 60 * 1000;
async function getDaaByOrigin(env) {
  const now = Date.now();
  if (Object.keys(daaCache.data).length && now - daaCache.ts < DAA_TTL) return daaCache.data;
  // 1) try live growthepie (works if the CF-edge block ever lifts)
  try {
    const fresh = latestByOrigin(await fetchJson(GP_FUND_URL, 25000, GP_HEADERS), 'daa');
    if (Object.keys(fresh).length) {
      daaCache = { ts: now, data: fresh };
      if (env && env.DB) { try { await env.DB.prepare(
        `INSERT INTO snapshot_cache (key, data, updated_at) VALUES ('daa', ?, ?)
         ON CONFLICT(key) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`
      ).bind(JSON.stringify(fresh), now).run(); } catch (e) {} }
      return fresh;
    }
  } catch (e) { console.error('[getDaaByOrigin] live growthepie failed:', e.message); }
  // 2) fall back to last-good persisted map
  if (env && env.DB) {
    try {
      const row = await env.DB.prepare(`SELECT data, updated_at FROM snapshot_cache WHERE key='daa'`).first();
      if (row && row.data) { daaCache = { ts: row.updated_at, data: JSON.parse(row.data) }; return daaCache.data; }
    } catch (e) { console.error('[getDaaByOrigin] D1 fallback failed:', e.message); }
  }
  return daaCache.data; // {} if never seeded
}

// Every buildSnapshot fetch degrades silently on failure (falls back to a
// default and moves on) — that's the right behavior for resilience, but it
// means a failing upstream shows up only as "some field is null" days later
// with zero trace of why. Log the reason so Workers Logs can show it.
function logSettled(name, r) {
  if (r.status === 'rejected') console.error(`[buildSnapshot] ${name} failed:`, r.reason && r.reason.message || r.reason);
  else if (r.value == null) console.error(`[buildSnapshot] ${name} returned null/empty`);
}

// Map a previously-persisted snapshot blob to { chainKey -> [priorPeerKeys] } so
// buildSnapshot can apply hysteresis and keep peer lists stable across refreshes.
function priorPeersByKey(priorData) {
  const m = {};
  for (const c of (priorData?.chains || [])) {
    if (c.key && c.related?.peers) m[c.key] = c.related.peers.map((p) => p.key);
  }
  return m;
}
async function buildSnapshot(opts = {}) {
  // --- cheap global fetches (partial failure tolerated) ---
  // growthepie DAA is fetched separately via getDaaByOrigin (D1-persisted,
  // its own try-live-then-last-good path), not in this parallel group.
  const [chainsR, dexsR, feesR, stablesR, cgSeed, gpMaster, daaByOrigin] = await Promise.allSettled([
    fetchJson(CHAINS_URL), fetchJson(DEXS_URL), fetchJson(FEES_URL),
    fetchJson(STABLES_URL), Promise.resolve(null), getMaster(ENV), getDaaByOrigin(ENV),
  ]);
  [['chains', chainsR], ['dexs', dexsR], ['fees', feesR], ['stables', stablesR], ['gpMaster', gpMaster], ['daa', daaByOrigin]]
    .forEach(([name, r]) => logSettled(name, r));
  const val = (r, d) => (r.status === 'fulfilled' && r.value != null ? r.value : d);

  const chains = val(chainsR, []);
  if (!Array.isArray(chains) || !chains.length) throw new Error('chains feed unavailable');

  // Volume is filtered to real DEX categories: /overview/dexs also carries
  // Derivatives, Prediction Markets, NFT marketplaces and Telegram bots, and
  // counting those as "DEX volume" overstated Injective by 16x.
  const volAgg = aggregateBreakdown(val(dexsR, {}), norm, { categories: DEX_CATEGORIES });
  // Fees are chain-wide revenue, not one product — no category filter.
  const feeAgg = aggregateBreakdown(val(feesR, {}), norm);
  // A dead volume feed contributes zero to EVERY chain, which silently re-ranks
  // the board on TVL+fees alone while we keep publishing "50% 24h DEX volume".
  // Refuse to build rather than persist a plausible-looking wrong board; the
  // /api/chains catch then serves the last good snapshot with stale: true.
  if (feedIsDegenerate(volAgg, chains.length)) throw new Error('dex volume feed unavailable (empty breakdown)');
  if (feedIsDegenerate(feeAgg, chains.length)) throw new Error('fees feed unavailable (empty breakdown)');
  const masterMap = gpMaster.status === 'fulfilled' ? gpMaster.value : {};
  const daaMap = val(daaByOrigin, {});

  // stablecoin mcap by normalized chain name
  const stableByChain = {};
  for (const s of val(stablesR, [])) {
    const mc = s.totalCirculatingUSD
      ? Object.values(s.totalCirculatingUSD).reduce((a, v) => a + (Number(v) || 0), 0)
      : 0;
    if (s.name) stableByChain[norm(s.name)] = mc;
  }

  // --- assemble base rows from TVL feed (canonical names + chainId + gecko) ---
  // dedupeChains first: DefiLlama double-lists BSC/Binance and OP Mainnet/Optimism
  // under one chainId, and the per-chain endpoint resolves the $0 alias to the real
  // chain's volume — so the board would carry the same chain twice.
  const rows = dedupeChains(chains.filter((c) => c && c.name))
    .map((c) => {
      const key = norm(c.name);
      const mrec = c.chainId != null ? masterRec(masterMap[Number(c.chainId)]) : null;
      const originKey = mrec?.origin || null;
      return {
        key,
        name: c.name,
        symbol: c.tokenSymbol || null,
        gecko: c.gecko_id || null,
        chainId: c.chainId ?? null,
        // value-prop category: curated taxonomy first, then growthepie-derived.
        category: resolveCategory(c.name, deriveCategory(mrec)),
        tvl: Number(c.tvl) || 0,
        volume24h: volAgg[key] || 0,
        fees24h: feeAgg[key] || 0,
        stables: stableByChain[key] || 0,
        activeAddresses: originKey && daaMap[originKey] != null ? daaMap[originKey] : null,
      };
    });

  // --- PASS 1: provisional score, only to decide who is worth enriching ---
  // These volumes come from the aggregated breakdown, which misses any chain the
  // DEX feed names differently from the TVL feed (302 of 458: "Hyperliquid L1" vs
  // "hyperliquid", "OP Mainnet" vs "optimism"). Those chains read 0 on a
  // 50%-weight axis, so this ranking is NOT trustworthy on its own.
  scoreRows(rows);
  // Hence candidates are picked on several axes, not just the provisional score:
  // a chain zeroed on volume still enters on TVL or fees and gets corrected.
  const candidates = selectCandidates(rows, { boardSize: BOARD_SIZE });

  // --- enrich candidates (bounded concurrency) ---
  await pool(candidates, async (r) => {
    const enc = encodeURIComponent(r.name);
    const [dex, hist, fee] = await Promise.allSettled([
      fetchJson(`https://api.llama.fi/overview/dexs/${enc}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`, 12000),
      fetchJson(`https://api.llama.fi/v2/historicalChainTvl/${enc}`, 12000),
      fetchJson(`https://api.llama.fi/overview/fees/${enc}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`, 12000),
    ]);
    // Fees carry BOTH defects the volume axis had, and the aggregate is wrong in
    // both directions. Measured 2026-07-17: Hyperliquid L1 read $0 against a real
    // $3.83M/day (the same TVL-feed-vs-fee-feed name mismatch), while Provenance
    // read $13,971 against $96 — 145x over — and Tron 4.4x, because
    // /overview/fees spans 86 categories and the per-protocol breakdowns
    // double-count. This is a 20%-weight axis AND the denominator of the P/F
    // ratio, fee yield and fees-per-user we publish with definitions attached.
    if (fee.status === 'fulfilled' && fee.value && fee.value.total24h != null) {
      r.fees24h = Number(fee.value.total24h) || r.fees24h;
      r.feeSource = 'perChain';   // authoritative: DefiLlama's own per-chain total
    } else {
      // Diagnose rather than guess: a silently-kept aggregate is indistinguishable
      // from an enriched value in the payload, which is how the 145x Provenance
      // figure survived a deploy that "fixed" it.
      r.feeSource = 'aggregate';  // over-counts: 86 categories, double-counted breakdowns
      console.error(`[fees] ${r.name}: per-chain fetch failed -> keeping aggregate. reason=${fee.status === 'rejected' ? String(fee.reason && fee.reason.message).slice(0, 90) : 'total24h null'}`);
    }
    // Provenance per FIELD, not per row: being selected for enrichment is not the
    // same as having been enriched. A candidate whose per-chain call fails keeps
    // the aggregate, and marking the row "enriched" regardless would republish
    // that aggregate as though we had checked it.
    if (dex.status === 'fulfilled' && dex.value && dex.value.total24h != null) {
      r.volumeSource = 'perChain';
      r.volume24h = Number(dex.value.total24h) || r.volume24h;
      r.volChange1d = dex.value.change_1d ?? null;
      r.volChange7d = dex.value.change_7d ?? null;
      r.volChange30d = dex.value.change_1m ?? null;
      r.volume7d = dex.value.total7d ?? null;
      r.volume30d = dex.value.total30d ?? null;
    } else {
      r.volumeSource = 'aggregate';   // over-counts, and reads 0 on a name mismatch
    }
    if (hist.status === 'fulfilled' && Array.isArray(hist.value) && hist.value.length) {
      const series = hist.value.slice(-30).map((p) => Number(p.tvl) || 0);
      r.tvlSpark = series.slice(-14);
      r.tvlSpark30 = series;
      const now = series[series.length - 1];
      const wk = series.length >= 8 ? series[series.length - 8] : series[0];
      const mo = series[0];
      r.tvlChange7d = wk > 0 ? +(((now - wk) / wk) * 100).toFixed(2) : null;
      r.tvlChange30d = mo > 0 ? +(((now - mo) / mo) * 100).toFixed(2) : null;
    }
  }, 8);

  // --- PASS 2: rescore on the authoritative volumes just fetched ---
  // r.volume24h now holds DefiLlama's own per-chain total24h for every candidate
  // (it resolves chain names correctly and applies DefiLlama's parent-protocol
  // dedup). Rescoring here is what makes the published formula actually
  // reproduce the published score — previously volume24h was overwritten AFTER
  // scoring and never rescored, so the board ranked Injective on $3.2M while
  // serving $200K. The board is drawn from candidates only, so every ranked
  // chain is one we enriched.
  scoreRows(rows);
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, BOARD_SIZE);

  // --- CoinGecko native-token price/mcap/24h (single batched call) ---
  const ids = [...new Set(top.map((r) => r.gecko).filter(Boolean))];
  if (ids.length) {
    try {
      const cg = await fetchJson(
        cgUrl(`${CG_PRICE}?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=usd&include_market_cap=true&include_24hr_change=true`),
        15000
      );
      // persist into a sticky cache so a later failed fetch can't wipe prices
      for (const g in cg) { if (cg[g] && cg[g].usd != null) priceCache[g] = { price: cg[g].usd, mcap: cg[g].usd_market_cap, ch: cg[g].usd_24h_change, ts: Date.now() }; }
    } catch (e) { /* non-fatal — fall back to last-good prices below */ }
  }
  for (const r of top) {
    const p = r.gecko && priceCache[r.gecko];
    if (p) { r.tokenPrice = p.price; r.tokenMcap = p.mcap ?? null; r.tokenChange24h = p.ch != null ? +Number(p.ch).toFixed(2) : null; }
  }

  // --- derived fundamental ratios + anomaly flags (objective signal) ---
  for (const r of top) {
    // Only fees we stand behind feed the ratios. A ratio derived from the
    // over-counted aggregate is a published number with no source — Provenance's
    // fee yield was 309,007% on exactly this path.
    const feesOk = r.feeSource === 'perChain' ? r.fees24h : null;
    const annFees = feesOk ? feesOk * 365 : 0;
    r.pf = (r.tokenMcap && annFees > 0) ? +(r.tokenMcap / annFees).toFixed(1) : null;   // market cap / annualized fees
    // Keep precision below 0.1%: Provenance earns $96/day on $1.5B of TVL — a
    // yield of ~0.0023% — and toFixed(1) published that as a flat 0. Same
    // false-zero as feePerUser: printing 0 is a different claim from "tiny".
    if (r.tvl > 0 && annFees > 0) {
      const y = (annFees / r.tvl) * 100;
      r.feeYield = +y.toFixed(y < 0.1 ? 4 : 1);
    } else {
      r.feeYield = null;
    }
    const volOk = r.volumeSource === 'perChain' ? r.volume24h : null;
    r.turnover = (r.tvl > 0 && volOk != null) ? +(volOk / r.tvl).toFixed(2) : null;      // daily volume / TVL
    // Guard fees the same way pf/feeYield do above. Without the annFees check a
    // chain with fees24h = 0 published "fees per user: $0" — a measured-looking
    // claim derived from a number we don't have.
    //
    // And keep precision below a cent: Celo earns $1,671/day across 483,704
    // active addresses = $0.0035 per user, which toFixed(2) published as a flat
    // "$0". Users pay a third of a cent; printing zero is not a rounding nicety,
    // it is a different claim.
    if (r.activeAddresses && annFees > 0) {
      const per = feesOk / r.activeAddresses;
      r.feePerUser = +per.toFixed(per < 0.01 ? 4 : 2);
    } else {
      r.feePerUser = null;
    }

    const flags = [];
    const s = r.tvlSpark30;
    if (Array.isArray(s) && s.length > 8) {
      const rets = [];
      for (let i = 1; i < s.length; i++) if (s[i - 1] > 0) rets.push((s[i] - s[i - 1]) / s[i - 1]);
      if (rets.length > 4) {
        const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
        const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) || 0;
        const last = rets[rets.length - 1];
        if (sd > 0 && Math.abs((last - mean) / sd) >= 2.2 && Math.abs(last) >= 0.05)
          flags.push({ label: `TVL ${last > 0 ? 'jumped' : 'dropped'} ${(last * 100).toFixed(0)}% in a day`, sev: last > 0 ? 'up' : 'down' });
      }
    }
    if (r.volChange1d != null) {
      const avgDaily = r.volChange7d != null ? r.volChange7d / 7 : 0;
      if (r.volChange1d >= 35 && r.volChange1d > avgDaily * 3) flags.push({ label: `Volume +${r.volChange1d.toFixed(0)}% vs 24h ago`, sev: 'up' });
      else if (r.volChange1d <= -35) flags.push({ label: `Volume ${r.volChange1d.toFixed(0)}% vs 24h ago`, sev: 'down' });
    }
    if (r.tvlChange7d != null && r.tvlChange7d <= -15) flags.push({ label: `TVL ${r.tvlChange7d.toFixed(0)}% over 7d`, sev: 'down' });
    else if (r.tvlChange7d != null && r.tvlChange7d >= 20) flags.push({ label: `TVL +${r.tvlChange7d.toFixed(0)}% over 7d`, sev: 'up' });
    r.flags = flags;
  }

  // --- real signal engine: peer medians + rank maps, then typed signals per chain ---
  const _med = (arr) => { const a = arr.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
  const medPf = _med(top.map((r) => r.pf));
  const medFeeYield = _med(top.map((r) => r.feeYield));
  const medTurnover = _med(top.map((r) => r.turnover));
  const tvlRankMap = {}; [...top].sort((a, b) => (b.tvl || 0) - (a.tvl || 0)).forEach((r, i) => { tvlRankMap[r.name] = i + 1; });
  const feeRankMap = {}; [...top].sort((a, b) => (b.fees24h || 0) - (a.fees24h || 0)).forEach((r, i) => { feeRankMap[r.name] = i + 1; });
  for (const r of top) {
    r.signals = computeSignals(r, { medPf, medFeeYield, medTurnover, tvlRank: tvlRankMap[r.name], feeRank: feeRankMap[r.name], n: top.length });
  }

  // Stamp the DISPLAYED index here, with the same activityIndex() the published
  // 1-100 scale is defined by. The client used to recompute it by hand across
  // state.chains — a second implementation of a rule that already had an owner,
  // and it had no idea what to do with a row that has no score. A tail chain
  // (rank > 50, served from chains_lite, no score) rescaled 0 against the board's
  // 0.549-0.99 range and rendered "Activity index -122" on a scale we publish as
  // 1-100. A rank-less row now simply has no index, and the UI renders it as "—"
  // by the same nullish path it already uses for pf/feeYield.
  const boardScores = top.map((r) => r.score || 0);
  const mnScore = Math.min(...boardScores), mxScore = Math.max(...boardScores);
  for (const r of top) r.activityIndex = activityIndex(r.score, mnScore, mxScore);

  // --- data-quality caveat: mark TVL figures that cannot be independently
  // verified, so a TVL-ordered view doesn't imply two adjacent rows are peers.
  // Best-effort: if /protocols is unavailable we annotate nothing rather than
  // guess — a missing badge is a smaller error than a wrong one.
  try {
    annotateDataQuality(top, await getProtocols());
  } catch (e) {
    console.error('[buildSnapshot] data-quality annotation skipped:', e.message);
  }

  // A board where EVERY row fell back to the aggregate is not a board — it is the
  // per-chain enrichment having collapsed, and the aggregate is wrong in both
  // directions (Hyperliquid $0 against a real $3.83M; Provenance 145x over).
  // feedIsDegenerate only inspects the global maps, so it cannot see this; TLA
  // found the trace where a fully-degraded build persists over a good snapshot.
  // Per-row provenance already tells us — refuse the build and let /api/chains
  // serve the last good board, marked stale.
  const enrichedRows = top.filter((r) => r.volumeSource === 'perChain' || r.feeSource === 'perChain').length;
  const allAggregate = top.length > 0 && enrichedRows === 0;
  // opts.allowDegraded: the cron says NO (refuse, never persist, last-good
  // stands); the request path says YES (a board marked degraded beats a 502 on a
  // cold isolate when D1 is also unreachable). The refusal is about PERSISTING,
  // not about existing.
  if (allAggregate && !opts.allowDegraded) {
    throw new Error(`per-chain enrichment unavailable for all ${top.length} board chains (every row would carry the over-counted aggregate)`);
  }

  // The headline board must be as honest as the tail index. chainsLite already
  // nulls a field whose per-chain call failed; `ranked` spread the same aggregate
  // through as a live number, so the profile of a tail chain told the truth while
  // the board did not. TLA found the 1-of-50 trace: one enriched row clears the
  // all-aggregate guard, and the other 49 publish aggregates as measurements.
  const ranked = top.map((r, i) => ({
    rank: i + 1,
    ...r,
    volume24h: r.volumeSource === 'perChain' ? r.volume24h : null,
    fees24h: r.feeSource === 'perChain' ? r.fees24h : null,
    links: LINKS[norm(r.name)] || null,
  }));
  // Disclose the coverage rather than leaving it implicit in 50 per-row stamps.
  const coverage = {
    board: ranked.length,
    volumePerChain: top.filter((r) => r.volumeSource === 'perChain').length,
    feesPerChain: top.filter((r) => r.feeSource === 'perChain').length,
  };

  // --- chain linking: bake a value-prop category + related peers onto each row ---
  // Peers are drawn from the enriched top-50 (so every peer resolves in this blob)
  // and computed here on the refresh, not per request — stable + reproducible.
  // opts.prior carries the previous blob's peer keys for hysteresis (anti-churn).
  const prior = opts.prior || {};
  for (const r of ranked) { r.coverage = coverageTier(r); r.categoryLabel = categoryLabel(r.category); }
  // Linking view: a chain absent from the volume/fee breakdown carries 0, which
  // means "unknown", not "measured zero" — pass null so similarity never claims a
  // metric it doesn't have (chainkit treats null as absent). Candidates are the
  // enriched top-50, so every peer resolves in this blob (no tail 404s).
  const linkRows = ranked.map((r) => ({
    key: r.key, name: r.name, category: r.category, coverage: r.coverage,
    tvl: r.tvl || null, volume24h: r.volume24h || null, fees24h: r.fees24h || null,
    stables: r.stables || null, feeYield: r.feeYield || null, turnover: r.turnover || null,
  }));
  for (const r of ranked) {
    const rel = relatedBlock(r.name, linkRows, { k: 6, prior: prior[r.key] || [] });
    r.related = rel;
  }
  // Lite index of the WHOLE universe (not just the top-50) so a direct visit to a
  // tail chain resolves to a real profile instead of a 404. Kept in a separate
  // cache key so it never bloats the /api/chains leaderboard payload.
  // Only chains we ENRICHED have trustworthy volume/fees. Everything else holds
  // the aggregate, which is wrong in both directions — it reads 0 for any chain
  // the DEX/fee feeds name differently from the TVL feed (302 of 458), and
  // over-counts elsewhere (Provenance 145x). Shipping those as numbers made 42 of
  // 78 tail profiles publish "$0 volume" for chains that trade millions: XRPL
  // showed $0 against a real $2.64M. This file's own linkRows comment already
  // says it — "0 means unknown, not measured zero" — so null them and let the UI
  // render "—", the way the Stablecoin tile already does.
  const chainsLite = rows.map((r) => ({
    key: r.key, name: r.name, symbol: r.symbol, gecko: r.gecko, chainId: r.chainId,
    category: r.category, categoryLabel: categoryLabel(r.category), coverage: coverageTier(r),
    tvl: r.tvl,
    volume24h: r.volumeSource === 'perChain' ? r.volume24h : null,
    fees24h: r.feeSource === 'perChain' ? r.fees24h : null,
    stables: r.stables,
    activeAddresses: r.activeAddresses,
  }));
  const totals = ranked.reduce((a, r) => {
    a.tvl += r.tvl; a.volume24h += r.volume24h; a.fees24h += r.fees24h; a.stables += r.stables || 0;
    a.activeAddresses += r.activeAddresses || 0;
    return a;
  }, { tvl: 0, volume24h: 0, fees24h: 0, stables: 0, activeAddresses: 0 });

  const usersCoverage = ranked.filter((r) => r.activeAddresses != null).length;

  return {
    schemaVersion: 2,
    updatedAt: new Date().toISOString(),
    coverage,
    // Built anyway because a last-good board was unreachable. Every figure the
    // per-chain feeds could not confirm is already null; this says so at the top.
    ...(allAggregate ? { degraded: true, degradedReason: 'per-chain enrichment was unavailable for every board chain; volume and fee figures are withheld rather than shown from the over-counted aggregate' } : {}),
    count: ranked.length,
    usersCoverage,
    totals,
    chains: ranked,
    chainsLite, // persisted separately (key 'chains_lite'); stripped from the 'chains' blob
  };
}
// Persist the snapshot: the top-50 leaderboard under 'chains' and the whole-
// universe lite index under 'chains_lite'. Keeping them separate stops the lite
// index from bloating every /api/chains response. Returns the trimmed blob.
async function persistSnapshot(db, data, ts) {
  const lite = data.chainsLite;
  const blob = { ...data }; delete blob.chainsLite;
  try {
    await db.prepare(`INSERT INTO snapshot_cache (key, data, updated_at) VALUES ('chains', ?, ?)
       ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .bind(JSON.stringify(blob), ts).run();
    if (lite) await db.prepare(`INSERT INTO snapshot_cache (key, data, updated_at) VALUES ('chains_lite', ?, ?)
       ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .bind(JSON.stringify(lite), ts).run();
  } catch (e) { /* best-effort persistence */ }
  return blob;
}
// Resolve a chain beyond the top-50 from the lite index, and compute its peers at
// request time against the top-50 (every peer resolves in the main blob, so no
// dead links). Returns a basic profile row or null. Not the hot path.
// The lite index is ~107KB / 456 rows, rewritten only by the cron that writes the
// snapshot, so re-reading and re-parsing it per call is pure waste. One visit to a
// tail chain now costs two calls — the server-rendered OG card and the SPA's
// /api/chain/:name fetch — and a crawler hitting /chain/<garbage> pays one to
// learn nothing. Same TTL as the snapshot it is written beside.
let liteCache = { ts: 0, data: null };
async function loadLiteIndex() {
  const now = Date.now();
  if (liteCache.data && now - liteCache.ts < TTL) return liteCache.data;
  try {
    const rows = await dbQuery(`SELECT data FROM snapshot_cache WHERE key='chains_lite' LIMIT 1`);
    if (rows[0]?.data) liteCache = { ts: now, data: JSON.parse(rows[0].data) };
  } catch (e) { /* table may not exist yet — fall through to whatever we hold */ }
  return liteCache.data;
}

// A chain the desk researched that DefiLlama does not carry. We know its name and
// we hold a profile for it; we have no market metrics, and we say so by omitting
// them rather than by 404ing a page we have real analysis for.
async function deskOnlyChain(target) {
  const key = norm(target);
  try {
    const rows = await dbQuery(
      `SELECT chain FROM (
         SELECT chain FROM chain_facts
         UNION SELECT chain FROM dead_chains
         UNION SELECT chain FROM mid_chains
       ) WHERE lower(chain) = lower(?1)`,
      [target]
    );
    let name = rows[0] && rows[0].chain;
    if (!name) {
      // norm() differences (spaces, punctuation) — scan the researched set once.
      const all = await dbQuery(`SELECT DISTINCT chain FROM chain_facts UNION SELECT chain FROM dead_chains UNION SELECT chain FROM mid_chains`);
      const hit = all.find((r) => r.chain && norm(r.chain) === key);
      name = hit && hit.chain;
    }
    if (!name) return null;
    return {
      key,
      name,
      symbol: null, gecko: null, chainId: null,
      category: resolveCategory(name, null),
      // No market feed covers this chain. null, never 0 — 0 is a measurement.
      // (marketData/coverage:'research-only' were dead: written here, read by
      // nothing, and 'research-only' leaked a third value into coverage's
      // fixed 'full'|'basic' vocabulary via related.peers[].coverage.)
      tvl: null, volume24h: null, fees24h: null, stables: null, activeAddresses: null,
    };
  } catch (e) { return null; }
}

// Resolve a chain we hold research on but that is not on the board.
//
// Two ways this used to 404 on a chain the desk had actually researched:
//   1. Raw lowercase matching, while the rest of the pipeline keys on norm().
//      "Cosmos Hub" never matched DefiLlama's "CosmosHub".
//   2. The chain isn't in DefiLlama's feed AT ALL (Polkadot, Karak, OKExChain),
//      or is listed under a name only a human could map (Fuel -> "Fuel Ignition",
//      Merlin Chain -> "Merlin", Manta Pacific -> "Manta" OR "Manta Atlantic"?).
//      Those are ambiguous, and guessing an alias would put the WRONG chain's
//      metrics on a researched profile — a worse error than the 404.
// So: match on norm(), and if the market feed simply doesn't cover the chain,
// still serve the research with no market figures rather than pretend it doesn't
// exist. The UI already renders a missing figure as "—".
async function resolveTailChain(target) {
  const lite = await loadLiteIndex();
  const key = norm(target);
  let row = Array.isArray(lite) ? lite.find((c) => norm(c.name) === key) : null;
  if (!row) row = await deskOnlyChain(target);
  if (!row) return null;
  // Tail rows are never annotated by buildSnapshot (it only sees the board), so
  // annotate here — the one place they are constructed. Every consumer then reads
  // row.dataQuality instead of recomputing it per surface.
  if (row.tvl != null && !row.dataQuality) {
    try {
      const dq = assessChainDataQuality(row.name, await getProtocols(), { displayedTvl: row.tvl });
      if (dq && dq.autoPublish !== false) row.dataQuality = dq;
    } catch (e) { /* best-effort — a missing caveat is bad, a 500 is worse */ }
  }
  const top = (cache.data && cache.data.chains) || [];
  const linkRows = [row, ...top].map((r) => ({
    key: r.key || norm(r.name), name: r.name, category: r.category, coverage: r.coverage || 'basic',
    tvl: r.tvl || null, volume24h: r.volume24h || null, fees24h: r.fees24h || null,
    stables: r.stables || null, feeYield: r.feeYield || null, turnover: r.turnover || null,
  }));
  row.related = relatedBlock(row.name, linkRows, { k: 6 });
  row.categoryLabel = row.categoryLabel || categoryLabel(row.category);
  return row;
}

// Read the cron-refreshed snapshot from D1 (instant, no live upstream calls on
// the hot path). Falls back to a live build only on a cold/empty cache — and
// best-effort primes the cache so subsequent requests don't repeat the miss.
// A snapshot older than this is stale no matter why. The cron runs every 5
// minutes, so 30 minutes is six missed ticks — well past a blip.
const MAX_SNAPSHOT_AGE_MS = 30 * 60 * 1000;

async function loadSnapshot() {
  if (ENV.DB) {
    // Retry once before falling through to a live build: a single D1 hiccup was
    // enough to send a cold isolate into buildSnapshot, which can throw and 502
    // while a perfectly good row sits in the table.
    let row = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        row = await ENV.DB.prepare(`SELECT data, updated_at FROM snapshot_cache WHERE key='chains'`).first();
        break;
      } catch (e) {
        if (attempt) console.error('[loadSnapshot] D1 read failed twice:', e.message);
      }
    }
    // Parse OUTSIDE the retry: a corrupt row is not a D1 hiccup, and retrying the
    // identical read failed identically while logging "D1 read failed twice".
    if (row && row.data) {
      try {
        return { data: JSON.parse(row.data), ts: row.updated_at };
      } catch (e) {
        console.error('[loadSnapshot] snapshot row is not valid JSON — rebuilding:', e.message);
      }
    }
  }
  const data = await buildSnapshot({ allowDegraded: true });   // serving beats 502ing; the cron still refuses to persist one
  const ts = Date.now();
  let blob;
  if (ENV.DB) blob = await persistSnapshot(ENV.DB, data, ts);
  else { blob = { ...data }; delete blob.chainsLite; }
  return { data: blob, ts };
}

function fmtShort(n) {
  n = Number(n) || 0; const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return String(Math.round(n));
}
function _clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
// Typed, confidence-scored, evidence-bearing signals — the paid agent product.
function computeSignals(r, peers) {
  const sig = [];
  const push = (o) => sig.push({ chain: r.name, id: `${r.name.toLowerCase().replace(/\W/g, '')}_${o.type}`, ...o });
  const n = peers.n || 50;
  // 1 — capital flow (USD-denominated TVL delta)
  if (r.tvlChange7d != null && Math.abs(r.tvlChange7d) >= 12) {
    const m = r.tvlChange7d;
    push({ type: 'capital_flow_7d', label: `Capital ${m > 0 ? 'inflow' : 'outflow'} ${m > 0 ? '+' : ''}${m.toFixed(0)}% (7d TVL)`, direction: m > 0 ? 'bullish' : 'bearish', severity: Math.abs(m) >= 30 ? 'critical' : Math.abs(m) >= 20 ? 'notable' : 'info', confidence: +_clamp(0.55 + Math.abs(m) / 120, 0, 0.92).toFixed(2), summary: `Net ${m > 0 ? 'capital entering' : 'capital leaving'} — TVL ${m > 0 ? '+' : ''}${m.toFixed(1)}% over 7d to $${fmtShort(r.tvl)}.`, evidence: { tvlChange7d: m, tvlChange30d: r.tvlChange30d, tvl_usd: r.tvl }, method: 'USD TVL delta (DefiLlama historicalChainTvl), 7d. Partly price-sensitive — corroborate with fee/volume signals.' });
  }
  // 2 — inorganic / wash-traded volume
  if (r.fees24h > 0 && r.volume24h > 0) {
    const vf = r.volume24h / r.fees24h;
    if (vf > 5000) push({ type: 'inorganic_volume', label: `Volume/fee ratio ${Math.round(vf).toLocaleString()}:1 — abnormally low fees for volume`, direction: 'warning', severity: vf > 15000 ? 'critical' : 'notable', confidence: +_clamp(0.5 + (vf - 5000) / 40000, 0, 0.9).toFixed(2), summary: `$${fmtShort(r.volume24h)} of 24h volume produced only $${fmtShort(r.fees24h)} in fees (${Math.round(vf).toLocaleString()}:1). Organic DEX volume runs ~300–2,000:1; elevated ratios flag wash-traded or heavily-incentivized volume.`, evidence: { volFeeRatio: +vf.toFixed(0), volume24h_usd: r.volume24h, fees24h_usd: r.fees24h, turnover: r.turnover }, method: 'volume24h / fees24h. >5000:1 flagged.' });
  }
  // 3 — volume acceleration (2nd derivative)
  if (r.volChange1d != null && r.volChange7d != null) {
    const daily = r.volChange7d / 7, accel = r.volChange1d - daily;
    if (Math.abs(r.volChange1d) >= 40 && Math.abs(accel) >= 30) push({ type: 'volume_accel', label: `Volume ${r.volChange1d > 0 ? 'surge' : 'collapse'} ${r.volChange1d > 0 ? '+' : ''}${r.volChange1d.toFixed(0)}% (24h)`, direction: r.volChange1d > 0 ? 'bullish' : 'bearish', severity: Math.abs(r.volChange1d) >= 80 ? 'notable' : 'info', confidence: +_clamp(0.5 + Math.abs(accel) / 300, 0, 0.85).toFixed(2), summary: `24h volume moved ${r.volChange1d > 0 ? '+' : ''}${r.volChange1d.toFixed(0)}% vs a 7d run-rate of ${daily.toFixed(0)}%/day — ${accel > 0 ? 'positive' : 'negative'} acceleration.`, evidence: { volChange1d: r.volChange1d, volChange7d: r.volChange7d }, method: '1d vs (7d/7) run-rate; 2nd-derivative of DEX volume.' });
  }
  // 4 — mercenary / incentive-parked TVL
  if (r.feeYield != null && r.turnover != null && r.tvl > 5e7 && r.feeYield < 0.8 && r.turnover < 0.15) push({ type: 'mercenary_tvl', label: `Capital parked, barely used — ${r.feeYield}% fee yield, ${r.turnover}× turnover`, direction: 'warning', severity: 'notable', confidence: 0.6, summary: `$${fmtShort(r.tvl)} locked but generating only ${r.feeYield}% annualized fee yield at ${r.turnover}× daily turnover — a signature of incentive-parked ("mercenary") TVL rather than organic usage.`, evidence: { feeYield_pct: r.feeYield, turnover: r.turnover, tvl_usd: r.tvl }, method: 'feeYield=(fees×365/TVL); turnover=(vol/TVL). Low-yield + low-turnover on large TVL ⇒ incentive-dependent capital.' });
  // 5 — real yield (organic activity)
  if (r.feeYield != null && peers.medFeeYield && r.feeYield > peers.medFeeYield * 1.8 && r.turnover > (peers.medTurnover || 0)) push({ type: 'real_yield', label: `Strong real activity — ${r.feeYield}% fee yield (${(r.feeYield / peers.medFeeYield).toFixed(1)}× peer median)`, direction: 'bullish', severity: 'info', confidence: 0.6, summary: `Fee yield of ${r.feeYield}% is ${(r.feeYield / peers.medFeeYield).toFixed(1)}× the peer median (${peers.medFeeYield}%) with above-median turnover — capital here is used, not just parked.`, evidence: { feeYield_pct: r.feeYield, peer_median_pct: peers.medFeeYield, turnover: r.turnover }, method: 'feeYield vs top-50 median.' });
  // 6 — valuation vs peers (P/F)
  if (r.pf != null && peers.medPf) {
    const ratio = r.pf / peers.medPf;
    if (ratio <= 0.5 || ratio >= 2.2) push({ type: 'valuation', label: `${ratio < 1 ? 'Cheap' : 'Rich'} vs peers — P/F ${r.pf} (median ${peers.medPf})`, direction: ratio < 1 ? 'bullish' : 'bearish', severity: 'info', confidence: 0.5, summary: `Market cap is ${r.pf}× annualized fees, ${ratio < 1 ? 'below' : 'above'} the peer median of ${peers.medPf}× — ${ratio < 1 ? 'relatively cheap on fee multiples' : 'a premium vs fees generated'}.`, evidence: { pf: r.pf, peer_median_pf: peers.medPf }, method: 'P/F = tokenMcap / (fees24h×365), vs top-50 median.' });
  }
  // 7 — TVL-vs-fee rank divergence (ghost-chain / whale-not-user)
  if (peers.tvlRank && peers.feeRank) {
    const gap = peers.feeRank - peers.tvlRank;
    if (gap >= Math.max(10, n * 0.25) && peers.tvlRank <= n * 0.4) push({ type: 'tvl_fee_divergence', label: `Big TVL, little usage — #${peers.tvlRank} by TVL but #${peers.feeRank} by fees`, direction: 'warning', severity: 'notable', confidence: 0.6, summary: `Ranks #${peers.tvlRank} in capital locked but only #${peers.feeRank} in fees generated (${gap}-place gap) — capital-heavy, usage-light, a classic ghost-chain / whale-concentration pattern.`, evidence: { tvl_rank: peers.tvlRank, fee_rank: peers.feeRank, gap }, method: 'Rank divergence between TVL and 24h fees across top-50.' });
  }
  // 8 — price vs usage divergence
  if (r.tokenChange24h != null && r.volChange1d != null && r.tokenChange24h >= 8 && r.volChange1d <= 0) push({ type: 'price_usage_divergence', label: `Token +${r.tokenChange24h.toFixed(0)}% but volume flat/down`, direction: 'warning', severity: 'info', confidence: 0.5, summary: `Native token is up ${r.tokenChange24h.toFixed(0)}% on the day while on-chain volume is ${r.volChange1d.toFixed(0)}% — price is running ahead of usage (speculative).`, evidence: { tokenChange24h: r.tokenChange24h, volChange1d: r.volChange1d }, method: '24h token price change vs 24h volume change.' });
  return sig;
}

function factJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch (e) { return fallback; }
}

function reviewDateAfter(date, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function chainDossierFreshness(meta, referenceDate = new Date().toISOString().slice(0, 10)) {
  const lastReviewed = /^\d{4}-\d{2}-\d{2}$/.test(meta?.last_reviewed || '') ? meta.last_reviewed : null;
  const explicitNextReview = /^\d{4}-\d{2}-\d{2}$/.test(meta?.next_review_at || '') ? meta.next_review_at : null;
  const nextReviewAt = explicitNextReview || reviewDateAfter(lastReviewed, 90);
  if (!lastReviewed || !nextReviewAt) return { status: 'unknown', lastReviewedAt: lastReviewed, nextReviewAt: null, derived: false };
  return {
    status: referenceDate > nextReviewAt ? 'review_due' : 'current',
    lastReviewedAt: lastReviewed,
    nextReviewAt,
    derived: !explicitNextReview,
  };
}

function newDossierCoverage() {
  return {
    dimensions: new Set(),
    sources: new Map(),
    dataCompletenessPct: null,
    freshness: null,
    identityStatus: null,
    forensicStatus: null,
    forensicAnalysis: null,
  };
}

function addSynthesisCoverage(coverage, data) {
  const forensic = data.forensic_analysis || {};
  const outcome = forensic.outcome || data.outcome || {};
  if (typeof outcome.label === 'string') coverage.forensicStatus = outcome.label;
  if (forensic.version !== 'forensic-analysis-v1') return;
  coverage.forensicAnalysis = {
    version: forensic.version,
    outcomeAsOf: typeof outcome.as_of === 'string' ? outcome.as_of : null,
    freshness: chainDossierFreshness({
      last_reviewed: forensic.review?.last_reviewed_at,
      next_review_at: forensic.review?.next_review_at,
    }),
  };
}

function addCoverageSources(coverage, row) {
  for (const source of factJson(row.sources, [])) {
    if (source?.url && !coverage.sources.has(source.url)) coverage.sources.set(source.url, source);
  }
}

function addFactCoverage(coverage, row) {
  if (row.dimension === '_meta') {
    const meta = factJson(row.data, {});
    if (Number.isFinite(meta.data_completeness_pct)) {
      coverage.dataCompletenessPct = meta.data_completeness_pct;
    }
    coverage.freshness = chainDossierFreshness(meta);
    return;
  }
  if (!CHAIN_DOSSIER_DIMENSIONS.includes(row.dimension)) return;
  const data = factJson(row.data, {});
  if (row.dimension === 'identity' && typeof data.status === 'string') {
    coverage.identityStatus = data.status;
  }
  if (row.dimension === 'synthesis') addSynthesisCoverage(coverage, data);
  coverage.dimensions.add(row.dimension);
  addCoverageSources(coverage, row);
}

function publicDossierCoverage(coverage) {
  return {
    dimensionCount: coverage.dimensions.size,
    expectedDimensionCount: CHAIN_DOSSIER_DIMENSIONS.length,
    dataCompletenessPct: coverage.dataCompletenessPct,
    citationCount: coverage.sources.size,
    sources: [...coverage.sources.values()].slice(0, 3),
    freshness: coverage.freshness,
    status: coverage.forensicStatus || coverage.identityStatus || 'unknown',
    forensicAnalysis: coverage.forensicAnalysis
      ? { status: 'published', ...coverage.forensicAnalysis }
      : {
          status: 'pending',
          version: null,
          outcomeAsOf: null,
          freshness: chainDossierFreshness(null),
        },
  };
}

async function withDossierCoverage(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.chains)) return snapshot;
  try {
    const rows = await dbQuery('SELECT chain, dimension, data, sources FROM chain_facts');
    const byChain = new Map();
    for (const row of rows) {
      const key = norm(row.chain);
      if (!byChain.has(key)) byChain.set(key, newDossierCoverage());
      addFactCoverage(byChain.get(key), row);
    }
    return {
      ...snapshot,
      chains: snapshot.chains.map((chain) => {
        const coverage = byChain.get(norm(chain.name));
        return coverage ? { ...chain, dossier: publicDossierCoverage(coverage) } : chain;
      }),
    };
  } catch (e) {
    console.warn('[dossier-coverage] chain_facts unavailable:', e.message);
    return snapshot;
  }
}


app.get('/api/chains', wrap(async (req, res) => {
  try {
    const now = Date.now();
    if (!cache.data || now - cache.ts > TTL) {
      cache = await loadSnapshot();
    }
    // Staleness is a property of AGE, not of whether an exception fired. This
    // used to be set only in the catch below — but loadSnapshot returns whatever
    // D1 holds without checking how old it is, and buildSnapshot only runs when
    // there is no row at all. So when a feed died, the degenerate-feed guard
    // correctly refused to persist and /api/chains then served the aging board
    // forever with no marker, because nothing threw. The guard worked; the
    // `stale: true` it promised never appeared.
    const ageMs = Date.now() - cache.ts;
    const stale = ageMs > MAX_SNAPSHOT_AGE_MS;
    const published = await withDossierCoverage(cache.data);
    res.json({ ...published, scoreMeta: SCORE_META, cachedAgeMs: ageMs, ...(stale ? { stale: true, staleReason: `snapshot is ${Math.round(ageMs / 60000)} minutes old; the refresh has not produced a usable board`, error: `snapshot is ${Math.round(ageMs / 60000)} minutes old; the refresh has not produced a usable board` } : {}) });
  } catch (e) {
    console.error('snapshot error:', e.message);
    if (cache.data) {
      // Carry BOTH keys: the age path sets staleReason and the client reads
      // `error`, so an age-based stale banner rendered with an empty reason.
      const ageMs = Date.now() - cache.ts;
      return res.json({ ...cache.data, scoreMeta: SCORE_META, stale: true, cachedAgeMs: ageMs, staleReason: e.message, error: e.message });
    }
    res.status(502).json({ error: 'Failed to fetch chain data: ' + e.message });
  }
}));

// ---------------------------------------------------------------------------
// Per-chain drill-down: curated overview + live top projects by TVL
// ---------------------------------------------------------------------------
const DESCRIPTIONS = {
  ethereum: 'The original smart-contract chain and the largest by TVL. Home to the deepest DeFi, stablecoin and NFT markets; secures most L2s that settle back to it.',
  solana: 'High-throughput monolithic L1 known for low fees and fast finality. A hub for DeFi, memecoins and consumer apps, consistently leading in DEX volume and active traders.',
  base: 'Coinbase\'s Ethereum L2 (OP Stack). Fast-growing retail on-ramp with strong consumer, social and memecoin activity and deep Coinbase integration.',
  bsc: 'BNB Chain — Binance\'s EVM L1. High retail volume, low fees, and one of the largest DEX ecosystems (PancakeSwap) plus heavy stablecoin usage.',
  tron: 'L1 optimized for stablecoin transfers; carries one of the largest USDT floats in crypto. Dominant for payments and remittances rather than DeFi.',
  arbitrum: 'Leading Ethereum L2 (optimistic rollup). Mature DeFi ecosystem with deep liquidity, perps and a large protocol base.',
  polygon: 'EVM scaling ecosystem (PoS chain + zk tech). Broad payments, gaming and enterprise adoption with very high daily active addresses.',
  hyperliquid: 'Purpose-built L1 for a high-performance on-chain perps DEX. Rapidly grew into a top venue for derivatives volume with its own order-book design.',
  avalanche: 'L1 with a subnet architecture for app-specific chains. Used for DeFi, institutional/RWA experiments and gaming.',
  sui: 'Move-based L1 focused on parallel execution and low-latency consumer apps, gaming and DeFi.',
  aptos: 'Move-based L1 (Diem lineage) emphasizing safety and throughput; growing DeFi and payments ecosystem.',
  ton: 'The Open Network, tied to Telegram\'s ~1B users. Focused on mini-apps, payments and consumer-scale distribution.',
  optimism: 'Ethereum L2 and the origin of the OP Stack Superchain. Established DeFi and governance ecosystem.',
  opmainnet: 'Ethereum L2 and the origin of the OP Stack Superchain. Established DeFi and governance ecosystem.',
  near: 'Sharded L1 with an account model aimed at usability; expanding into chain-abstraction and AI-related infrastructure.',
  bitcoin: 'The original blockchain and largest asset by market cap. Increasingly a DeFi settlement layer via L2s, staking and BTCfi protocols.',
  cardano: 'Research-driven PoS L1 (eUTXO model) with a focus on formal methods and a distinct DeFi ecosystem.',
  sei: 'High-performance EVM-compatible L1 optimized for trading and low latency.',
  monad: 'High-performance parallel-EVM L1 focused on massively higher throughput while staying EVM-compatible.',
  celo: 'Mobile-first, EVM-compatible chain (now an Ethereum L2) focused on payments, stablecoins and real-world usage.',
  starknet: 'ZK rollup using the Cairo VM for scalable, low-cost Ethereum execution.',
  zksync: 'ZK rollup (zkEVM) scaling Ethereum with low fees and a growing DeFi ecosystem.',
  gnosis: 'Stable-payments-focused EVM chain (xDai) with strong community and prediction-market roots.',
  osmosis: 'Cosmos SDK app-chain and the ecosystem’s primary DEX/liquidity hub, connecting IBC-linked chains.',
  stacks: 'Bitcoin L2 (Proof of Transfer) bringing smart contracts and DeFi to Bitcoin without modifying its base layer.',
  injective: 'Cosmos SDK L1 built for finance — an on-chain order book, derivatives and cross-chain trading infrastructure.',
  cronos: 'EVM-compatible chain in the Crypto.com ecosystem, focused on DeFi and consumer payments integration.',
  mantle: 'Ethereum L2 (modular rollup) backed by the BitDAO/Mantle treasury, focused on DeFi and lower fees.',
  flow: 'L1 built for consumer apps, NFTs and gaming, known for the NBA Top Shot collectibles ecosystem.',
  linea: 'zkEVM Ethereum L2 built by Consensys, aiming for full EVM equivalence with ZK-proof scaling.',
  unichain: 'Uniswap Labs’ own Ethereum L2 (OP Stack), built to optimize DEX trading and cross-chain liquidity.',
  ronin: 'EVM sidechain purpose-built for gaming, originally created for Axie Infinity and its NFT marketplace.',
  berachain: 'EVM L1 using a novel Proof-of-Liquidity consensus that ties validator rewards to on-chain liquidity provision.',
  sonic: 'High-throughput EVM L1 (formerly Fantom) focused on low-latency execution and developer incentives.',
};

// Curated "most reliable" DEX + NFT marketplace per chain (keyed by norm()).
// Only well-established venues are listed; unknowns fall back to "—" in the UI.
const LINKS = {
  ethereum:   { dex: { name: 'Uniswap',     url: 'https://app.uniswap.org' },     nft: { name: 'OpenSea',      url: 'https://opensea.io' } },
  solana:     { dex: { name: 'Jupiter',     url: 'https://jup.ag' },              nft: { name: 'Magic Eden',   url: 'https://magiceden.io' } },
  base:       { dex: { name: 'Aerodrome',   url: 'https://aerodrome.finance' },   nft: { name: 'OpenSea',      url: 'https://opensea.io' } },
  bsc:        { dex: { name: 'PancakeSwap', url: 'https://pancakeswap.finance' }, nft: { name: 'OpenSea',      url: 'https://opensea.io' } },
  tron:       { dex: { name: 'SunSwap',     url: 'https://sun.io' },              nft: { name: 'APENFT',       url: 'https://apenft.io' } },
  arbitrum:   { dex: { name: 'Uniswap',     url: 'https://app.uniswap.org' },     nft: { name: 'OpenSea',      url: 'https://opensea.io' } },
  polygon:    { dex: { name: 'QuickSwap',   url: 'https://quickswap.exchange' },  nft: { name: 'OpenSea',      url: 'https://opensea.io' } },
  hyperliquid:{ dex: { name: 'Hyperliquid', url: 'https://app.hyperliquid.xyz' }, nft: { name: 'Drip.Trade',   url: 'https://drip.trade' } },
  avalanche:  { dex: { name: 'Trader Joe',  url: 'https://lfj.gg' },              nft: { name: 'Joepegs',      url: 'https://joepegs.com' } },
  sui:        { dex: { name: 'Cetus',       url: 'https://www.cetus.zone' },      nft: { name: 'Tradeport',    url: 'https://www.tradeport.xyz/sui' } },
  aptos:      { dex: { name: 'Thala',       url: 'https://app.thala.fi' },        nft: { name: 'Wapal',        url: 'https://wapal.io' } },
  ton:        { dex: { name: 'STON.fi',     url: 'https://ston.fi' },             nft: { name: 'Getgems',      url: 'https://getgems.io' } },
  opmainnet:  { dex: { name: 'Velodrome',   url: 'https://velodrome.finance' },   nft: { name: 'OpenSea',      url: 'https://opensea.io' } },
  near:       { dex: { name: 'Ref Finance', url: 'https://app.ref.finance' },     nft: { name: 'Mintbase',     url: 'https://www.mintbase.xyz' } },
  bitcoin:    { dex: null,                                                        nft: { name: 'Magic Eden',   url: 'https://magiceden.io/ordinals' } },
  cardano:    { dex: { name: 'Minswap',     url: 'https://minswap.org' },         nft: { name: 'jpg.store',    url: 'https://www.jpg.store' } },
  sei:        { dex: { name: 'Astroport',   url: 'https://sei.astroport.fi' },    nft: { name: 'Pallet',       url: 'https://pallet.exchange' } },
  celo:       { dex: { name: 'Uniswap',     url: 'https://app.uniswap.org' },     nft: null },
  starknet:   { dex: { name: 'Ekubo',       url: 'https://app.ekubo.org' },       nft: { name: 'Unframed',     url: 'https://unframed.co' } },
  zksync:     { dex: { name: 'SyncSwap',    url: 'https://syncswap.xyz' },        nft: { name: 'Element',      url: 'https://element.market' } },
  gnosis:     { dex: { name: 'Balancer',    url: 'https://balancer.fi' },         nft: null },
  osmosis:    { dex: { name: 'Osmosis',     url: 'https://app.osmosis.zone' },    nft: { name: 'Stargaze',     url: 'https://www.stargaze.zone' } },
  stacks:     { dex: { name: 'ALEX',        url: 'https://app.alexlab.co' },      nft: { name: 'Gamma',        url: 'https://gamma.io' } },
  injective:  { dex: { name: 'Helix',       url: 'https://helixapp.com' },        nft: null },
  cronos:     { dex: { name: 'VVS Finance', url: 'https://vvs.finance' },         nft: null },
  mantle:     { dex: { name: 'Merchant Moe',url: 'https://merchantmoe.com' },     nft: null },
  flow:       { dex: { name: 'Increment',   url: 'https://app.increment.fi' },    nft: { name: 'NBA Top Shot', url: 'https://nbatopshot.com' } },
  linea:      { dex: { name: 'Lynex',       url: 'https://www.lynex.fi' },        nft: { name: 'Element',      url: 'https://element.market' } },
  unichain:   { dex: { name: 'Uniswap',     url: 'https://app.uniswap.org' },     nft: null },
  ronin:      { dex: { name: 'Katana',      url: 'https://katana.roninchain.com' }, nft: { name: 'Mavis Market', url: 'https://marketplace.roninchain.com' } },
  berachain:  { dex: { name: 'BEX',         url: 'https://bex.berachain.com' },   nft: null },
  sonic:      { dex: { name: 'Shadow',      url: 'https://www.shadow.so' },       nft: null },
};

// LINKS and DESCRIPTIONS drifted out of sync before (11 chains had a LINKS
// entry but no DESCRIPTIONS entry) — warn once at cold start instead of
// silently shipping a blank description card next time a chain is added.
{
  const missing = Object.keys(LINKS).filter((k) => !(k in DESCRIPTIONS));
  if (missing.length) console.error('[parity] LINKS chains missing a DESCRIPTIONS entry:', missing.join(', '));
}

// Top NFT / Ordinals collections per chain (curated, verified marketplace links)
const CHAIN_NFTS = {
  ethereum: [
    { name: 'CryptoPunks', url: 'https://opensea.io/collection/cryptopunks' },
    { name: 'Bored Ape Yacht Club', url: 'https://opensea.io/collection/boredapeyachtclub' },
    { name: 'Pudgy Penguins', url: 'https://opensea.io/collection/pudgypenguins' },
  ],
  solana: [
    { name: 'Mad Lads', url: 'https://magiceden.io/marketplace/mad_lads' },
    { name: 'Okay Bears', url: 'https://magiceden.io/marketplace/okay_bears' },
    { name: 'Claynosaurz', url: 'https://magiceden.io/marketplace/claynosaurz' },
  ],
  bitcoin: [
    { name: 'NodeMonkes', url: 'https://magiceden.io/ordinals/marketplace/nodemonkes' },
    { name: 'Bitcoin Puppets', url: 'https://magiceden.io/ordinals/marketplace/bitcoin-puppets' },
    { name: 'Runestone', url: 'https://magiceden.io/ordinals/marketplace/runestone' },
  ],
  polygon: [
    { name: 'Courtyard', url: 'https://opensea.io/collection/courtyard-nft' },
    { name: 'DraftKings Reignmakers', url: 'https://opensea.io/collection/reignmakers-football' },
    { name: 'Lens Protocol', url: 'https://opensea.io/collection/lens-protocol-profiles' },
  ],
  base: [
    { name: 'BasePaint', url: 'https://opensea.io/collection/basepaint' },
    { name: 'tiny dinos', url: 'https://opensea.io/collection/tiny-dinos-eth' },
    { name: 'The Bald Eagle', url: 'https://opensea.io/collection/onchain-gaias' },
  ],
  ronin: [
    { name: 'Axie Infinity', url: 'https://marketplace.roninchain.com/collections/axie' },
    { name: 'Pixels (Pixel Farm)', url: 'https://marketplace.roninchain.com/collections/pixel' },
    { name: 'Wild Forest', url: 'https://marketplace.roninchain.com/' },
  ],
  avalanche: [
    { name: 'Dokyo', url: 'https://joepegs.com/collections/avalanche/0x892d81221484f690c0d97d3c2057101377b96f0e' },
    { name: 'Chikn', url: 'https://joepegs.com/' },
    { name: 'The Kingdom', url: 'https://joepegs.com/' },
  ],
  aptos: [
    { name: 'Aptos Monkeys', url: 'https://wapal.io/collection/Aptos-Monkeys' },
    { name: 'Bruh Bears', url: 'https://wapal.io/' },
    { name: 'Aptomingos', url: 'https://wapal.io/' },
  ],
  sui: [
    { name: 'Prime Machin', url: 'https://www.tradeport.xyz/sui/collection/prime-machin' },
    { name: 'Fuddies', url: 'https://www.tradeport.xyz/sui' },
    { name: 'SuiFrens', url: 'https://www.tradeport.xyz/sui' },
  ],
};

// CoinGecko ecosystem category per chain → for live top alt/meme tokens
const CHAIN_CG_CATEGORY = {
  ethereum: 'ethereum-ecosystem', solana: 'solana-ecosystem', base: 'base-ecosystem',
  bsc: 'binance-smart-chain', arbitrum: 'arbitrum-ecosystem', polygon: 'polygon-ecosystem',
  avalanche: 'avalanche-ecosystem', tron: 'tron-ecosystem', sui: 'sui-ecosystem',
  aptos: 'aptos-ecosystem', near: 'near-protocol-ecosystem', opmainnet: 'optimism-ecosystem',
  berachain: 'berachain-ecosystem', sei: 'sei-ecosystem', starknet: 'starknet-ecosystem',
  hyperliquid: 'hyperliquid-ecosystem', cardano: 'cardano-ecosystem', ton: 'open-network-ton-ecosystem',
};
// CoinGecko meme-coin category per chain (preferred for "top meme/alt coins")
const CHAIN_CG_MEME = {
  solana: 'solana-meme-coins', ethereum: 'ethereum-meme-coins', base: 'base-meme-coins',
  bsc: 'bnb-chain-meme-coins', tron: 'tron-meme-coins', ton: 'ton-meme-coins',
  sui: 'sui-meme', avalanche: 'avalanche-meme-coins', arbitrum: 'arbitrum-meme-coins',
  polygon: 'polygon-ecosystem-meme-coins', hyperliquid: 'hyperliquid-ecosystem',
};
let tokensCache = {}; // per-category cache
const TOK_EXCLUDE = /tether|usd-coin|dai|stable|first-digital|ethena|pyusd|frax|wrapped|weth|wbtc|cbbtc|coinbase-wrapped|binance-peg|bridged|staked|steth|reth|jito-staked|marinade|msol|jitosol|bnsol|lido|liquid-staking|savings-dai|rocket-pool|global-dollar|world-liberty/i;
function isStableish(t) {
  if (!t) return true;
  if (TOK_EXCLUDE.test(t.id)) return true;
  if (/usd|dai/i.test(t.symbol || '')) return true;
  if (t.current_price > 0.9 && t.current_price < 1.1 && /usd|dollar|stable|peg/i.test((t.id || '') + (t.symbol || ''))) return true;
  return false;
}
async function fetchCgCategory(cat) {
  if (!cat) return [];
  const cached = tokensCache[cat];
  if (cached && Date.now() - cached.ts < 10 * 60 * 1000) return cached.data;
  try {
    const mk = await fetchJson(cgUrl(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=${cat}&order=market_cap_desc&per_page=40&page=1`), 12000);
    const arr = Array.isArray(mk) ? mk : [];
    tokensCache[cat] = { ts: Date.now(), data: arr };
    return arr;
  } catch (e) { return []; }
}
async function chainTopTokens(row) {
  const nkey = norm(row.name);
  let list = (await fetchCgCategory(CHAIN_CG_MEME[nkey])).filter((t) => t && t.id !== row.gecko && !isStableish(t));
  if (list.length < 3) {
    const eco = (await fetchCgCategory(CHAIN_CG_CATEGORY[nkey])).filter((t) => t && t.id !== row.gecko && !isStableish(t));
    const seen = new Set(list.map((t) => t.id));
    for (const t of eco) if (!seen.has(t.id)) { list.push(t); seen.add(t.id); }
  }
  if (!list.length) return null;
  return list.slice(0, 3).map((t) => ({ name: t.name, symbol: (t.symbol || '').toUpperCase(), price: t.current_price, change24h: t.price_change_percentage_24h, mcap: t.market_cap, url: `https://www.coingecko.com/en/coins/${t.id}` }));
}

let protoCache = { ts: 0, data: null };
const PROTO_TTL = 15 * 60 * 1000;
async function getProtocols() {
  const now = Date.now();
  if (!protoCache.data || now - protoCache.ts > PROTO_TTL) {
    try { protoCache = { ts: now, data: await fetchJson('https://api.llama.fi/protocols', 25000) }; }
    catch (e) { if (!protoCache.data) throw e; }
  }
  return protoCache.data;
}

// Refresh live RWA (DefiLlama RWA category, TVL-ranked) + DePIN (CoinGecko DePIN
// category, market-cap ranked) breadth into D1. Called on a slow cron gate.
const normSlug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
async function refreshRwaDepin(env) {
  if (!env || !env.DB) return;
  try {
    const protos = await getProtocols();
    const rwa = (Array.isArray(protos) ? protos : [])
      .filter((p) => p.category === 'RWA' && (Number(p.tvl) || 0) > 0)
      .sort((a, b) => (b.tvl || 0) - (a.tvl || 0)).slice(0, 150);
    if (rwa.length) {
      const stmt = env.DB.prepare(
        `INSERT INTO rwa_live (slug, name, tvl, chains, url, logo, change_1d, change_7d, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET name=excluded.name, tvl=excluded.tvl, chains=excluded.chains,
           url=excluded.url, logo=excluded.logo, change_1d=excluded.change_1d, change_7d=excluded.change_7d, updated_at=excluded.updated_at`
      );
      const now = Date.now();
      await env.DB.batch(rwa.map((p) => stmt.bind(
        normSlug(p.name), p.name, Number(p.tvl) || 0, JSON.stringify((p.chains || []).slice(0, 10)),
        p.url || null, p.logo || null, p.change_1d ?? null, p.change_7d ?? null, now
      )));
    }
  } catch (e) { console.error('[refreshRwaDepin] RWA failed:', e.message); }
  try {
    const mk = await fetchJson(cgUrl('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=depin&order=market_cap_desc&per_page=50&page=1'), 15000);
    const depin = (Array.isArray(mk) ? mk : []).filter((t) => t && t.id);
    if (depin.length) {
      const stmt = env.DB.prepare(
        `INSERT INTO depin_live (id, name, symbol, mcap, price, change_24h, volume_24h, image, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, symbol=excluded.symbol, mcap=excluded.mcap,
           price=excluded.price, change_24h=excluded.change_24h, volume_24h=excluded.volume_24h, image=excluded.image, updated_at=excluded.updated_at`
      );
      const now = Date.now();
      await env.DB.batch(depin.map((t) => stmt.bind(
        t.id, t.name, (t.symbol || '').toUpperCase(), t.market_cap ?? null, t.current_price ?? null,
        t.price_change_percentage_24h != null ? +t.price_change_percentage_24h.toFixed(2) : null,
        t.total_volume ?? null, t.image || null, now
      )));
    }
  } catch (e) { console.error('[refreshRwaDepin] DePIN failed:', e.message); }
}

// Refresh the OFAC-sanctioned address list from the 0xB10C SDN mirror.
// Per chain: fetch the plain-text file, parse, and atomically replace that
// chain's rows (delete-then-insert) so removed addresses drop off too. A failed
// fetch for a chain leaves that chain's existing rows untouched (fail-safe: we
// never wipe a chain's screening set on a transient network error).
async function refreshSanctioned(env) {
  if (!env || !env.DB) return;
  const now = Date.now();
  let chains = 0, total = 0;
  for (const { file, chain } of OFAC_FILES) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 15000);
      let text;
      try {
        const r = await fetch(ofacFileUrl(file), { headers: GP_HEADERS, signal: ctl.signal });
        if (!r.ok) throw new Error(`${r.status}`);
        text = await r.text();
      } finally { clearTimeout(t); }
      const addrs = parseSanctionedFile(text);
      if (!addrs.length) continue; // never blank out a chain we can't parse
      const rows = buildSanctionedRows(chain, addrs, now);
      const ins = env.DB.prepare(
        `INSERT INTO sanctioned_addresses (address_lc, address, chain, source, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(address_lc, chain) DO UPDATE SET address=excluded.address,
           source=excluded.source, updated_at=excluded.updated_at`
      );
      // upsert fresh in chunks (D1 batch statement cap), then drop this chain's
      // rows not re-stamped this run (addresses removed from the SDN list)
      for (let i = 0; i < rows.length; i += 100) {
        await env.DB.batch(rows.slice(i, i + 100).map((x) =>
          ins.bind(x.address_lc, x.address, x.chain, x.source, x.updated_at)));
      }
      await env.DB.prepare(`DELETE FROM sanctioned_addresses WHERE chain = ? AND updated_at < ?`).bind(chain, now).run();
      chains += 1; total += rows.length;
    } catch (e) { console.error(`[refreshSanctioned] ${chain} failed:`, e.message); }
  }
  if (chains) console.error(`[refreshSanctioned] refreshed ${total} addresses across ${chains} chains`);
}

// Re-index the NFT catalog from CoinGecko /nfts/list (the full collection
// universe, paged). Upserts fresh rows; prunes collections no longer listed.
async function refreshNftCatalog(env) {
  if (!env || !env.DB) return;
  const now = Date.now();
  try {
    const all = [];
    for (let page = 1; page <= 20; page++) { // hard cap ~5000 collections
      // no `order` param: /nfts/list's default enumeration is stable + complete;
      // adding an order causes unstable paging (repeats/gaps → collections skipped)
      const url = cgUrl(`${NFT_LIST_URL}?per_page=${NFT_PER_PAGE}&page=${page}`);
      let batch;
      try { batch = await fetchJson(url, 15000, GP_HEADERS); } catch (e) {
        console.error(`[refreshNftCatalog] page ${page} failed:`, e.message); break;
      }
      const rows = nftRowsFromPage(batch, now);
      if (!rows.length) break; // reached the end
      all.push(...rows);
      if (rows.length < NFT_PER_PAGE) break;
    }
    const rows = dedupeNftRows(all);
    if (rows.length < 100) { // sanity guard: never nuke the catalog on a partial pull
      console.error(`[refreshNftCatalog] only ${rows.length} rows fetched — skipping upsert`); return;
    }
    const ins = env.DB.prepare(
      `INSERT INTO nft_catalog (id, name, chain, contract_address, symbol, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, chain=excluded.chain,
         contract_address=excluded.contract_address, symbol=excluded.symbol, indexed_at=excluded.indexed_at`
    );
    // D1 batches are capped; chunk the upsert, then prune stale in a final statement
    for (let i = 0; i < rows.length; i += 100) {
      await env.DB.batch(rows.slice(i, i + 100).map((x) =>
        ins.bind(x.id, x.name, x.chain, x.contract_address, x.symbol, x.indexed_at)));
    }
    await env.DB.prepare(`DELETE FROM nft_catalog WHERE indexed_at < ?`).bind(now).run();
    console.error(`[refreshNftCatalog] re-indexed ${rows.length} collections`);
  } catch (e) { console.error('[refreshNftCatalog] failed:', e.message); }
}

// Token-guarded ops trigger for the slow refresh jobs (manual re-seed / verify).
// Disabled (404) unless the ADMIN_TOKEN secret is set; requires a matching bearer.
app.post('/api/admin/refresh', wrap(async (req, res) => {
  const token = ENV.ADMIN_TOKEN || '';
  if (!token) return res.status(404).json({ error: 'not found' });
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${token}`) return res.status(401).json({ error: 'unauthorized' });
  const job = (req.query.job || 'all').toLowerCase();
  const ran = [];
  try {
    if (job === 'sanctioned' || job === 'all') { await refreshSanctioned(ENV); ran.push('sanctioned'); }
    if (job === 'nft' || job === 'all') { await refreshNftCatalog(ENV); ran.push('nft'); }
    res.json({ ok: true, ran });
  } catch (e) { res.status(500).json({ error: e.message, ran }); }
}));

// ---------------------------------------------------------------------------
// Research desk (Phase G) write path. Autonomous proposal submission and human
// review use separate credentials: a compromised proposal agent must never be
// able to inspect the queue or publish/reject its own work.
// POSTs verified, sourced findings to /api/desk/propose; they land as 'pending'
// in desk_proposals (a durable, human-reviewed queue). Nothing reaches the live
// tables without a human promoting it (CLAUDE.md §1.5). Disabled (404) unless
// the relevant scoped token is set. DESK_TOKEN remains a proposal-only migration
// fallback; reviewer endpoints require DESK_REVIEW_TOKEN.
// ---------------------------------------------------------------------------
function deskAuth(req, res, scope) {
  const proposalToken = ENV.DESK_PROPOSAL_TOKEN || ENV.DESK_TOKEN || '';
  const reviewToken = ENV.DESK_REVIEW_TOKEN || '';
  // Fail closed on a scope-collapsing configuration. Merely renaming one
  // shared secret would still let the autonomous agent review its own work.
  if (scope === 'review' && reviewToken && reviewToken === proposalToken) {
    res.status(404).json({ error: 'not found' });
    return false;
  }
  const token = scope === 'proposal' ? proposalToken : reviewToken;
  if (!token) { res.status(404).json({ error: 'not found' }); return false; }
  if ((req.headers['authorization'] || '') !== `Bearer ${token}`) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

const DESK_PROPOSAL_UPSERT_SQL = `INSERT INTO desk_proposals
  (dataset, slug, title, summary, payload, sources, names_individuals, confidence, needs_human_review, status, queued_at)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
 ON CONFLICT(dataset, slug) DO UPDATE SET title=excluded.title, summary=excluded.summary, payload=excluded.payload,
   sources=excluded.sources, names_individuals=excluded.names_individuals, confidence=excluded.confidence,
   needs_human_review=excluded.needs_human_review, status='pending', queued_at=datetime('now'),
   reviewer_note=NULL, reviewed_at=NULL`;
const DESK_PROPOSAL_LOCKED_UPSERT_SQL = `${DESK_PROPOSAL_UPSERT_SQL}
 WHERE desk_proposals.status = 'pending'`;

app.post('/api/desk/propose', wrap(async (req, res) => {
  if (!deskAuth(req, res, 'proposal')) return;
  if (!ENV.DB) return res.status(503).json({ error: 'no DB' });
  let b;
  try { b = await req.raw.json(); } catch (e) { return res.status(400).json({ error: 'invalid JSON body: ' + (e && e.message || e) }); }
  const dataset = String(b.dataset || '').trim();
  const slug = String(b.slug || '').trim();
  if (!dataset || !slug) return res.status(400).json({ error: 'dataset and slug are required' });
  const candidateValidation = validateResearchCandidateProposal(dataset, slug, b.payload, b.sources);
  if (!candidateValidation.ok) {
    return res.status(400).json({
      error: 'invalid research candidate',
      details: candidateValidation.errors,
      canonical_slug: candidateValidation.canonicalSlug || null,
    });
  }
  const namesIndividuals = b.names_individuals ? 1 : 0;
  const confidence = Number(b.confidence);
  // Force human review for individual-naming/fraud claims, low/invalid
  // confidence, and every complex forensic evidence-candidate dataset. The
  // latter is enforced here even if a stale/compromised client stamps false.
  const needsReview = proposalNeedsHumanReview(dataset, namesIndividuals, confidence) ? 1 : 0;
  // Dated analysis-candidate keys are immutable after human review so an agent
  // cannot erase that decision. Legacy row datasets intentionally reuse stable
  // entity slugs for later corrections and therefore retain their prior upsert
  // behavior across review cycles.
  const proposalUpsertSql = REVIEW_REQUIRED_PROPOSAL_DATASETS.includes(dataset)
    ? DESK_PROPOSAL_LOCKED_UPSERT_SQL
    : DESK_PROPOSAL_UPSERT_SQL;
  try {
    const result = await ENV.DB.prepare(proposalUpsertSql)
      .bind(dataset, slug, b.title || null, b.summary || null, JSON.stringify(b.payload || {}), JSON.stringify(b.sources || []),
      namesIndividuals, Number.isFinite(confidence) ? confidence : null, needsReview).run();
    const changes = Number(result?.meta?.changes ?? result?.changes ?? 0);
    if (changes !== 1) {
      return res.status(409).json({
        error: 'proposal key already reviewed',
        dataset,
        slug,
      });
    }
    res.json({ ok: true, dataset, slug, needs_human_review: !!needsReview });
  } catch (e) { res.status(500).json({ error: e.message }); }
}));

function researchRunStateMatches(existing, status, effectiveProposals) {
  if (!existing || existing.status !== status) return false;
  if (Number(existing.proposals_queued) !== effectiveProposals) return false;
  return status === 'running'
    ? existing.completed_at == null
    : Boolean(existing.completed_at);
}

// Proposal-agent execution status uses the proposal credential because it
// conveys no review or publication authority. The server owns timestamps and
// permits only one running -> terminal transition, so retries cannot rewrite
// historical outcomes or pretend an agent published anything.
app.post('/api/desk/run-status', wrap(async (req, res) => {
  if (!deskAuth(req, res, 'proposal')) return;
  if (!ENV.DB) return res.status(503).json({ error: 'no DB' });
  let body;
  try { body = await req.raw.json(); } catch {
    return res.status(400).json({ error: 'invalid JSON body' });
  }
  const runId = String(body.run_id || '').trim();
  const status = String(body.status || '').trim();
  const proposalsQueued = Number(body.proposals_queued ?? 0);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{5,127}$/.test(runId)) {
    return res.status(400).json({ error: 'invalid run_id' });
  }
  if (!['running', 'completed', 'failed'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }
  if (!Number.isInteger(proposalsQueued) || proposalsQueued < 0 || proposalsQueued > 10000) {
    return res.status(400).json({ error: 'invalid proposals_queued' });
  }
  try {
    const statement = status === 'running'
      ? ENV.DB.prepare(
        `INSERT OR IGNORE INTO research_desk_runs
          (run_id, started_at, completed_at, status, proposals_queued)
         VALUES (?, datetime('now'), NULL, 'running', 0)`,
      ).bind(runId)
      : ENV.DB.prepare(
        `UPDATE research_desk_runs
            SET status = ?, completed_at = datetime('now'), proposals_queued = ?
          WHERE run_id = ? AND status = 'running'`,
      ).bind(status, proposalsQueued, runId);
    const result = await statement.run();
    const changes = Number(result?.meta?.changes ?? result?.changes ?? 0);
    const effectiveProposals = status === 'running' ? 0 : proposalsQueued;
    if (changes === 0) {
      const existing = await ENV.DB.prepare(
        `SELECT status, completed_at, proposals_queued
           FROM research_desk_runs WHERE run_id = ?`,
      ).bind(runId).first();
      if (!researchRunStateMatches(existing, status, effectiveProposals)) {
        return res.status(409).json({ error: 'invalid run transition' });
      }
    } else if (changes !== 1) {
      return res.status(409).json({ error: 'invalid run transition' });
    }
    res.json({
      ok: true,
      run_id: runId,
      status,
      proposals_queued: effectiveProposals,
      idempotent: changes === 0,
    });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'run status write failed' });
  }
}));

app.get('/api/desk/pending', wrap(async (req, res) => {
  if (!deskAuth(req, res, 'review')) return;
  if (!ENV.DB) return res.status(503).json({ error: 'no DB' });
  try {
    const status = String(req.query.status || 'pending');
    const rows = await dbQuery(
      `SELECT id, dataset, slug, title, summary, names_individuals, confidence, needs_human_review, status, queued_at
       FROM desk_proposals WHERE status = ? ORDER BY queued_at DESC LIMIT 100`, [status]);
    res.json({ status, count: rows.length, proposals: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
}));

// Human-in-the-loop: promote a reviewed proposal into its live table. INJECTION-SAFE —
// table + column names come only from the PROMOTABLE whitelist (never the proposal);
// every value is bound. Marks the proposal status='promoted'.
app.post('/api/desk/promote', wrap(async (req, res) => {
  if (!deskAuth(req, res, 'review')) return;
  if (!ENV.DB) return res.status(503).json({ error: 'no DB' });
  let b; try { b = await req.raw.json(); } catch (e) { return res.status(400).json({ error: 'invalid JSON body' }); }
  const dataset = String(b.dataset || '').trim();
  const slug = String(b.slug || '').trim();
  if (!dataset || !slug) return res.status(400).json({ error: 'dataset and slug are required' });
  try {
    const row = await ENV.DB.prepare(
      `SELECT dataset, slug, payload, sources, status FROM desk_proposals WHERE dataset = ? AND slug = ?`
    ).bind(dataset, slug).first();
    if (!row) return res.status(404).json({ error: 'proposal not found' });
    if (row.status === 'promoted') return res.status(409).json({ error: 'proposal already promoted' });
    let payload = {}, sources = null;
    try { payload = row.payload ? JSON.parse(row.payload) : {}; } catch (e) {}
    try { sources = row.sources ? JSON.parse(row.sources) : null; } catch (e) {}
    // The desk's stored payload is free-form research and rarely matches the target
    // columns 1:1. The reviewer curates the finding into the live schema and sends it
    // as `record`; fall back to the raw payload only if no curated record is given.
    const curated = (b.record && typeof b.record === 'object') ? b.record : payload;
    const plan = promotionPlan(dataset, slug, curated, sources); // throws on bad dataset / missing PK / empty
    const placeholders = plan.columns.map(() => '?').join(', ');
    // ON CONFLICT DO UPDATE, not INSERT OR REPLACE: REPLACE deletes the whole
    // existing row before re-inserting, so a partial curated record (a reviewer
    // correcting just one field) would null out every column it didn't include.
    const updateSet = plan.columns.filter((c) => c !== plan.pk).map((c) => `${c}=excluded.${c}`).join(', ');
    await ENV.DB.prepare(
      `INSERT INTO ${plan.table} (${plan.columns.join(', ')}) VALUES (${placeholders})
       ON CONFLICT(${plan.pk}) DO UPDATE SET ${updateSet}`
    ).bind(...plan.values).run();
    await ENV.DB.prepare(
      `UPDATE desk_proposals SET status='promoted', reviewer_note=?, reviewed_at=datetime('now') WHERE dataset=? AND slug=?`
    ).bind(b.reviewer_note || null, dataset, slug).run();
    res.json({ ok: true, promoted: { dataset, slug, table: plan.table, columns: plan.columns.length } });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));

// Human-in-the-loop: reject a proposal (won't touch live tables).
app.post('/api/desk/reject', wrap(async (req, res) => {
  if (!deskAuth(req, res, 'review')) return;
  if (!ENV.DB) return res.status(503).json({ error: 'no DB' });
  let b; try { b = await req.raw.json(); } catch (e) { return res.status(400).json({ error: 'invalid JSON body' }); }
  const dataset = String(b.dataset || '').trim();
  const slug = String(b.slug || '').trim();
  if (!dataset || !slug) return res.status(400).json({ error: 'dataset and slug are required' });
  try {
    const r = await ENV.DB.prepare(
      `UPDATE desk_proposals SET status='rejected', reviewer_note=?, reviewed_at=datetime('now')
       WHERE dataset=? AND slug=? AND status != 'promoted'`
    ).bind(b.reviewer_note || null, dataset, slug).run();
    res.json({ ok: true, rejected: { dataset, slug }, changed: r.meta?.changes ?? null });
  } catch (e) { res.status(500).json({ error: e.message }); }
}));

// Read the research desk's per-dimension rows for one chain (identity, capital,
// team, narrative, risk, token, onchain, synthesis, links...).
//
// This table held 248 rows of researched, cited analysis and NOTHING in src/ read
// it — every dossier the desk wrote was invisible to users. That is the whole of
// "berachain is thriving but we can't justify it, no citations or analysis".
//
// Match on the desk's name OR a case-insensitive match: chain_facts is keyed by
// the researcher's spelling, which does not always match the TVL feed's ("NEAR"
// in the desk, "Near" on the board).
async function chainFacts(chainName) {
  const out = {};
  try {
    const rows = await dbQuery(
      `SELECT dimension, data, sources, updated_at FROM chain_facts WHERE chain = ?1 OR lower(chain) = lower(?1)`,
      [chainName]
    );
    for (const r of rows) {
      if (!r.dimension || r.dimension === '_meta') continue;
      let data = null, sources = null;
      try { data = r.data ? JSON.parse(r.data) : null; } catch (e) { continue; }   // skip malformed, never serve half-parsed research
      try { sources = r.sources ? JSON.parse(r.sources) : null; } catch (e) { sources = null; }
      out[r.dimension] = { data, sources, updatedAt: r.updated_at || null };
    }
  } catch (e) { /* facts are best-effort — the table may not exist yet */ }
  return Object.keys(out).length ? out : null;
}

// Resolve a chain's tags: themes are curated (stored), the cohort is COMPUTED.
//
// Field names here are taken FROM THE REAL ROWS, not from what a schema ought to
// look like. The first version of this function read `identity.tier` and
// `identity.permissioned` — neither exists in a single one of the 130 rows. It
// then filtered the real cohorts out of `tags[]` with isTheme and read them back
// from those non-existent fields, so 69 researched chains (every graveyard and
// stuck one) computed a null cohort and rendered no chip. The tests passed
// because their fixtures used the invented names too: the code agreed with
// itself about a schema that did not exist.
//
// What the rows ACTUALLY carry:
//   tags[]       cohort AND theme tags together   (Scroll: ['graveyard','l2','zk'])
//   permissioned a THEME tag, not a field          (Canton: [...,'permissioned'])
//   the launch date under one of three keys        (launched | mainnet_live | founded)
const LAUNCH_KEYS = ['launched', 'mainnet_live', 'founded'];
// Verified against all 130 identity rows (2026-07-17): the ONLY status values in
// existence are 'emerging' (8), 'anticipated' (6) and 'declining' (1).
// 'pre-launch' matched nothing — I invented it, in the same commit that called
// out identity.tier for being invented. Values, like field names, come from the
// data or they come from nowhere. ('emerging' is NOT pre-launch: it tags
// Bittensor, which launched in 2021.)
const PRELAUNCH_STATUS = new Set(['anticipated']);
function launchDateOf(identity) {
  for (const k of LAUNCH_KEYS) {
    const v = identity[k];
    // Strings only: `founded: 2021` appears as a NUMBER, and parseLaunch treats a
    // number as epoch millis, so 2021 would resolve to 1st Jan 1970. Beyond that
    // guard, tags.js owns which date FORMATS are valid — this regex used to
    // enumerate them a second time, so a format added there would be filtered out
    // here before cohortFor ever saw it and the cohort would silently go null.
    // That is the exact failure this function exists to fix.
    if (typeof v === 'string' && parseLaunch(v) != null) return v.trim();
  }
  return null;
}

function resolveTags(row, facts, onBoard) {
  const identity = (facts && facts.identity && facts.identity.data) || {};
  const stored = canonChainTags(Array.isArray(identity.tags) ? identity.tags : []);
  const themes = stored.filter(isChainTheme);
  const storedCohort = stored.find(isChainCohort) || null;
  // Fall back to the chain's own category when the desk has not tagged it, so an
  // unresearched chain still carries what we can honestly derive.
  const derived = themes.length ? themes : themesForCategory(row.category);
  const cohort = cohortFor({
    launched: launchDateOf(identity),
    onBoard: !!onBoard,
    // The desk's own classification, which lives in tags[] — this is what makes
    // graveyard and stuck reachable at all.
    tier: storedCohort,
    isPreLaunch: PRELAUNCH_STATUS.has(identity.status),   // cohortFor owns the 'anticipated' TIER itself
    // Canton is permissioned AND on the board; cohortFor checks this last so a
    // private chain can never hide a real board position.
    isPrivate: themes.includes('permissioned'),
  }, Date.now());
  return { cohort, themes: derived };
}

function normalizedChainDossier(row, description, analysis, facts, risk) {
  const profile = analysis?.profile || {};
  const synthesis = facts?.synthesis?.data || {};
  return normalizeDossier({
    category: 'Blockchain',
    name: row?.name,
    status: row?.verdict || row?.lifecycle || analysis?.sentiment,
    metric: row?.tvl ?? null,
    as_of: row?.updated_at || analysis?.updated_at || synthesis.as_of,
    what_it_is: profile.what_it_does || profile.purpose || description,
    what_happened: synthesis.situation || synthesis.postmortem || analysis?.take,
    why: synthesis.why || synthesis.success_mechanism || profile.why || row?.why_stuck,
    strategic_choices: synthesis.strategic_choices || profile.strategic_choices,
    operating_model: profile.operating_model || profile.business_model || profile.purpose,
    token_value_capture: profile.token || row?.token,
    evidence: synthesis.evidence || analysis?.sources,
    counterfactual: synthesis.could_differ || synthesis.counterfactual || profile.could_differ,
    risks_unknowns: synthesis.unknowns || profile.risks || profile.unknowns || risk,
    lifecycle: synthesis.lifecycle || profile.lifecycle || row?.lifecycle,
    outlook_watch: synthesis.outlook || profile.outlook || analysis?.outlook,
    review_metadata: synthesis.review || analysis?.updated_at,
    sources: parsedPublicJson(analysis?.sources, []),
  });
}

app.get('/api/chain/:name', wrap(async (req, res) => {
  try {
    if (!cache.data) cache = await loadSnapshot();
    const target = String(req.params.name || '').toLowerCase();
    // norm() here too, or an alias skips the board and lands in the tail path:
    // /chain/Binance published "Outside the top-50 activity board" for BSC (rank
    // #4), /chain/Ethereum%20L1 denied the rank of the #1 chain, and /chain/BSC
    // said "Rank #4" — two indexed URLs, contradictory claims, same chain.
    let row = cache.data.chains.find((c) => norm(c.name) === norm(target));
    if (!row) { row = await resolveTailChain(target); } // beyond the top-50 → lite index
    // Curated dead/mid studies are a real part of Blockchain Analysis even when
    // they have no live-board or lite-index row. Without this fallback their
    // "Open chain dossier" link returned 404 and hid the existing postmortem.
    let curatedLifecycle = null;
    let curatedAnalysis = null;
    if (!row) {
      try {
        const curated = await dbQuery(
          `SELECT chain, launched, current_tvl AS tvl, why AS take, outlook, profile, sources, updated_at, 'dead' AS lifecycle
             FROM dead_chains WHERE lower(chain) = ?
           UNION ALL
           SELECT chain, launched, tvl, why_stuck AS take, outlook, profile, sources, updated_at, 'mid' AS lifecycle
             FROM mid_chains WHERE lower(chain) = ?
           LIMIT 1`,
          [target, target],
        );
        if (curated[0]) {
          const legacy = curated[0];
          curatedLifecycle = legacy.lifecycle;
          row = {
            name: legacy.chain, tvl: legacy.tvl ?? 0, launched: legacy.launched || null,
            volume24h: null, fees24h: null, stables: null, rank: null,
          };
          let profile = null;
          try { profile = legacy.profile ? JSON.parse(legacy.profile) : null; } catch (e) { /* malformed legacy profile stays withheld */ }
          curatedAnalysis = {
            take: legacy.take || null,
            sentiment: legacy.lifecycle,
            trend: legacy.lifecycle === 'dead' ? 'Curated postmortem; not a live-board rank.' : 'Curated mid-chain analysis; not a live-board rank.',
            sources: legacy.sources || null,
            profile,
            updated_at: legacy.updated_at || null,
          };
        }
      } catch (e) { /* legacy tables may not yet exist during a partial migration */ }
    }
    if (!row) return res.status(404).json({ error: 'unknown chain' });

    // Board membership decides several things below; compute it once.
    const onBoard = (cache.data.chains || []).some((c) => c.name === row.name);

    let topProjects = [];
    let dataQuality = row.dataQuality || null;
    try {
      const protos = await getProtocols();
      const name = row.name;
      // Only assess here for chains OUTSIDE the ranked top-50 — the snapshot has
      // already assessed every board row, and a clean board row legitimately
      // carries no dataQuality. Guarding on `!dataQuality` instead made 49 of 50
      // board chains re-scan all 7,867 protocols on every detail request just to
      // re-derive null.
      if (!onBoard) {
        const dq = assessChainDataQuality(name, protos, { displayedTvl: row.tvl });
        // A caveat above the auto-publish ceiling is held for review, not served.
        if (dq && dq.autoPublish !== false) dataQuality = dq;
      }
      const SKIP = new Set(['CEX', 'Chain', 'Bridge']);
      topProjects = (Array.isArray(protos) ? protos : [])
        .filter((p) => Array.isArray(p.chains) && p.chains.includes(name) && !SKIP.has(p.category))
        .map((p) => ({
          name: p.name, category: p.category || '', tvl: (p.chainTvls && p.chainTvls[name]) || p.tvl || 0,
          description: p.description || null, url: p.url || null, twitter: p.twitter || null, logo: p.logo || null,
        }))
        .sort((a, b) => b.tvl - a.tvl)
        .slice(0, 10);
    } catch (e) { /* projects are best-effort */ }

    let analysis = null;
    try {
      const rows = await dbQuery(`SELECT take, sentiment, trend, sources, profile, updated_at FROM chain_analysis WHERE chain = ? LIMIT 1`, [row.name]);
      if (rows[0]) { analysis = rows[0]; try { analysis.profile = rows[0].profile ? JSON.parse(rows[0].profile) : null; } catch (e) { analysis.profile = null; } }
    } catch (e) { /* analysis is best-effort */ }
    if (!analysis && curatedAnalysis) analysis = curatedAnalysis;

    const nkey = norm(row.name);
    const topNfts = CHAIN_NFTS[nkey] || null;

    // live top meme/alt tokens on this chain (prefers CoinGecko meme category), cached 10m
    let topTokens = null;
    try { topTokens = await chainTopTokens(row); } catch (e) { /* non-fatal */ }

    let risk = null;
    try { const rr = await dbQuery(`SELECT level, summary, evidence, sources FROM risk_flags WHERE entity_type='chain' AND entity_name = ? LIMIT 1`, [row.name]); if (rr[0]) risk = rr[0]; } catch (e) {}

    const facts = await chainFacts(row.name);

    const tags = resolveTags(row, facts, onBoard);

    res.json({ chain: row, curatedLifecycle, scoreMeta: SCORE_META, description: DESCRIPTIONS[nkey] || null, dataQuality, topProjects, topNfts, topTokens, analysis, risk, facts, tags, tagVocab: tagVocab(), normalized_dossier: normalizedChainDossier(row, DESCRIPTIONS[nkey] || null, analysis, facts, risk) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}));

// Graveyard: chains that launched recently and then collapsed (populated by the research agent).
// The cause-of-death vocabulary (canon map + labels + fraud set) lives in
// src/lib/causes.js — the single source of truth, imported above and served to
// the SPA via trends.causeVocab so nothing hand-mirrors a copy.

app.get('/api/dead', wrap(async (req, res) => {
  try {
    const rows = await dbQuery(`SELECT chain, launched, peak_tvl, current_tvl, drawdown_pct, peak_date, why, outlook, verdict, sources, profile, updated_at FROM dead_chains ORDER BY peak_tvl DESC`);
    const chains = rows.map((r) => { let p = null; try { p = r.profile ? JSON.parse(r.profile) : null; } catch (e) {} return { ...r, profile: p }; });

    // aggregate trends across the graveyard
    const tagCounts = {}; let ddSum = 0, ddN = 0, fraud = 0; const verdictCounts = {};
    for (const c of chains) {
      const tags = (c.profile && c.profile.cause_tags) || [];
      // canonicalize synonyms + dedupe per-chain so a merge can't double-count
      canonTags(tags).forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
      if (isFraudy(tags)) fraud++; // canonical: a future synonym can't silently undercount
      if (c.drawdown_pct != null) { ddSum += c.drawdown_pct; ddN++; }
      const v = (c.verdict || 'unknown').toLowerCase();
      verdictCounts[v] = (verdictCounts[v] || 0) + 1;
    }
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])
      .map(([k, n]) => ({ tag: k, label: TAG_LABELS[k] || k, count: n }));

    let narrative = null, successFactors = null;
    try { const m = await dbQuery(`SELECT v, updated_at FROM graveyard_meta WHERE k = 'trends' LIMIT 1`); if (m[0]) narrative = { text: m[0].v, updated_at: m[0].updated_at }; } catch (e) {}
    try { const s = await dbQuery(`SELECT v, updated_at FROM graveyard_meta WHERE k = 'success_factors' LIMIT 1`); if (s[0]) successFactors = { text: s[0].v, updated_at: s[0].updated_at }; } catch (e) {}

    const totalPeak = chains.reduce((a, c) => a + (c.peak_tvl || 0), 0);
    const totalNow = chains.reduce((a, c) => a + (c.current_tvl || 0), 0);

    res.json({
      chains, count: chains.length,
      trends: {
        topTags, verdictCounts, causeVocab: causeVocab(),
        avgDrawdown: ddN ? +(ddSum / ddN).toFixed(1) : null,
        fraudCount: fraud, totalPeakTvl: totalPeak, totalCurrentTvl: totalNow,
        wipedOut: totalPeak > 0 ? +(((totalPeak - totalNow) / totalPeak) * 100).toFixed(1) : null,
        narrative, successFactors,
      },
    });
  } catch (e) {
    res.json({ chains: [], count: 0, error: e.message });
  }
}));

// Mid tier: alive-but-directionless chains
app.get('/api/mid', wrap(async (req, res) => {
  try {
    const rows = await dbQuery(`SELECT chain, launched, tvl, verdict, why_stuck, outlook, profile, sources, updated_at FROM mid_chains ORDER BY tvl DESC`);
    const chains = rows.map((r) => { let p = null; try { p = r.profile ? JSON.parse(r.profile) : null; } catch (e) {} return { ...r, profile: p }; });
    const verdictCounts = {};
    const tagCounts = {};
    for (const c of chains) {
      const v = (c.verdict || 'unknown').toLowerCase(); verdictCounts[v] = (verdictCounts[v] || 0) + 1;
      // same vocabulary as the graveyard: canonicalize + dedupe, or one concept
      // fragments into two bars (e.g. outcompeted vs competition).
      const tags = (c.profile && c.profile.success_factors_missing) || [];
      canonTags(tags).forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
    }
    const topGaps = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])
      .map(([k, n]) => ({ tag: k, label: TAG_LABELS[k] || k.replace(/_/g, ' '), count: n }));
    let framework = null;
    try { const s = await dbQuery(`SELECT v, updated_at FROM graveyard_meta WHERE k = 'success_factors' LIMIT 1`); if (s[0]) framework = { text: s[0].v, updated_at: s[0].updated_at }; } catch (e) {}
    res.json({ chains, count: chains.length, verdictCounts, topGaps, causeVocab: causeVocab(), framework });
  } catch (e) {
    res.json({ chains: [], count: 0, error: e.message });
  }
}));

// ---------------------------------------------------------------------------
// Dynamic tier classifier — buckets chains into thriving / mid / dying / dead
// from LIVE data, so the leaderboards reflect current conditions.
//   dead  = >=90% drawdown from all-time peak TVL (terminal)
//   dying = down >=60% over the last 90 days (steep recent decline, not yet dead)
//   thriving = currently on the live board (top-50 by composite activity)
//   mid   = everything else meaningful (>= $1M TVL)
// ---------------------------------------------------------------------------
let tiersCache = { ts: 0, data: null };
let tiersBuilding = false;
const TIERS_TTL = 45 * 60 * 1000;
const toISO = (unix) => new Date(unix * 1000).toISOString().slice(0, 10);

// Flatten a previous classifyChains() result into a { chainName: metric } map,
// so a later cycle can recover a chain's known peak/drawdown when this
// cycle's own historicalChainTvl fetch fails for it.
function flattenTierMetrics(tierData) {
  const map = {};
  if (!tierData) return map;
  for (const t of TIERS) for (const m of (tierData[t] || [])) map[m.chain] = m;
  return map;
}
export const priorMetricsByChain = (tierData) => flattenTierMetrics(tierData);

function summarizeMetricHistory(series, current) {
  let peak = current;
  let peakDate = null;
  let launched = null;
  let ago90 = null;
  let spanDays = 0;
  if (series.length) {
    launched = series[0].d;
    spanDays = (series[series.length - 1].d - series[0].d) / 86400;
    for (const point of series) if (point.v > peak) { peak = point.v; peakDate = point.d; }
    const last = series[series.length - 1].d;
    const target = last - 90 * 86400;
    let closest = series[0];
    for (const point of series) { if (point.d <= target) closest = point; else break; }
    ago90 = closest.v;
  }
  const drawdown = peak > 0 ? ((peak - current) / peak) * 100 : 0;
  const change90 = spanDays >= CHANGE_90D_MIN_SPAN_DAYS && baselineOk(ago90, peak)
    ? ((current - ago90) / ago90) * 100
    : null;
  return { peak, peakDate, launched, spanDays, drawdown, change90 };
}

export async function classifyChains(priorMetrics = {}) {
  const all = await fetchJson(CHAINS_URL);
  if (!Array.isArray(all)) throw new Error('chains feed unavailable');
  if (!cache.data) cache = await loadSnapshot();
  const thrivingNames = new Set((cache.data.chains || []).map((c) => c.name));

  const universe = all.filter((c) => c && c.name && (Number(c.tvl) || 0) >= 1e6)
    .sort((a, b) => (Number(b.tvl) || 0) - (Number(a.tvl) || 0)).slice(0, 100);

  const metrics = await pool(universe, async (c) => {
    let hist = null;
    try { hist = await fetchJson(`https://api.llama.fi/v2/historicalChainTvl/${encodeURIComponent(c.name)}`, 12000); }
    catch (e) { console.error('[classifyChains] historicalChainTvl fetch failed for', c.name, ':', e.message); }
    const series = Array.isArray(hist) ? hist.filter((p) => p && p.date).map((p) => ({ d: Number(p.date), v: Number(p.tvl) || 0 })) : [];
    const cur = Number(c.tvl) || 0;
    // An empty series (fetch failed, timed out, or came back malformed) would
    // otherwise fall through to `peak = cur` below — silently reporting "at its
    // all-time peak, 0% drawdown" for a chain we may have PREVIOUSLY measured
    // as collapsed. A transient DefiLlama hiccup must never overwrite a known
    // peak with "no decline"; if we have prior data for this chain, keep its
    // peak/history and only refresh drawdown against today's (independently
    // fetched, always-live) TVL.
    const prior = priorMetrics[c.name];
    if (!series.length && prior && prior.peak_tvl > 0) {
      const drawdown = ((prior.peak_tvl - cur) / prior.peak_tvl) * 100;
      return {
        chain: c.name, symbol: c.tokenSymbol || prior.symbol || null, tvl: cur, spanDays: prior.spanDays,
        peak_tvl: prior.peak_tvl, peak_date: prior.peak_date, current_tvl: cur,
        drawdown_pct: +drawdown.toFixed(1), change_90d: prior.change_90d, launched: prior.launched,
        stale: true,
      };
    }
    const { peak, peakDate, launched, spanDays, drawdown, change90 } = summarizeMetricHistory(series, cur);
    return {
      chain: c.name, symbol: c.tokenSymbol || null, tvl: cur, spanDays: Math.round(spanDays),
      peak_tvl: peak, peak_date: peakDate ? toISO(peakDate) : null, current_tvl: cur,
      drawdown_pct: +drawdown.toFixed(1), change_90d: change90 != null ? +change90.toFixed(1) : null,
      launched: launched ? toISO(launched).slice(0, 7) : null,
    };
  }, 6);

  const b = Object.fromEntries(TIERS.map((t) => [t, []]));
  const onBoard = (name) => thrivingNames.has(name);
  for (const m of metrics) b[classifyTier(m, onBoard, norm)].push(m);
  b.mid.sort((x, y) => y.tvl - x.tvl);
  b.dying.sort((x, y) => (x.change_90d ?? 0) - (y.change_90d ?? 0));
  b.dead.sort((x, y) => y.peak_tvl - x.peak_tvl);
  return b;
}

// Complete { chainName: tier } map across all buckets — for the live board to
// badge each row with our own classification (progressive-enhancement fetch).
function tierMapFrom(b) {
  const map = {};
  for (const tier of TIERS) for (const m of (b[tier] || [])) map[m.chain] = tier;
  return map;
}

// Our curated editorial verdicts (the Dead & Dying / Stuck-Mid case studies) take
// precedence over the live activity classifier, so the board badge matches the
// forensic sections (e.g. Cardano reads "mid" on the board, not "thriving").
async function curatedTierMap() {
  const map = {};
  try { (await dbQuery(`SELECT chain FROM dead_chains`)).forEach((r) => { map[r.chain] = 'dead'; }); } catch (e) {}
  try { (await dbQuery(`SELECT chain FROM mid_chains`)).forEach((r) => { if (!map[r.chain]) map[r.chain] = 'mid'; }); } catch (e) {}
  return map;
}

async function getTiers() {
  const now = Date.now();
  // Pass the last cycle's own output back in as `priorMetrics` — this is what
  // lets a failed historicalChainTvl fetch recover a chain's known peak
  // instead of manufacturing a 0% drawdown (see classifyChains above).
  if (!tiersCache.data) tiersCache = { ts: now, data: await classifyChains(priorMetricsByChain(tiersCache.data)) };
  else if (now - tiersCache.ts > TIERS_TTL && !tiersBuilding) {
    tiersBuilding = true;
    classifyChains(priorMetricsByChain(tiersCache.data)).then((d) => { tiersCache = { ts: Date.now(), data: d }; })
      .catch((e) => console.error('tiers refresh:', e.message)).finally(() => { tiersBuilding = false; });
  }
  return tiersCache.data;
}

// ---------------------------------------------------------------------------
// Dead & Stuck-Mid exchanges (DEX + CEX) — the same curated-dossier pattern as
// /api/dead and /api/mid above, sharing one pair of tables via `kind` (see
// migrations/0011_exchange_analysis.sql) rather than duplicating a table and a
// route per kind. Trend aggregation logic is intentionally a near-copy of the
// chain routes above: it is the same computation over a different table, and
// the two already drift in shape (peak/current/drawdown vs a flat metric) in
// ways that would make a shared helper fight both call sites more than it saves.

// Citation-first lifecycle analysis. The query preserves the three source
// tables and joins the normalized feature overlay by kind + slug + lifecycle.
// The response is always scoped to exactly one venue kind, and the summary only
// reports membership/counts for fully matching comparison keys. It never pools
// metric values.
app.get('/api/exchange-analysis', wrap(async (req, res) => {
  const kind = req.query.kind === 'cex' ? 'cex' : 'dex';
  const lifecycle = ['successful', 'mid', 'dead'].includes(req.query.lifecycle)
    ? req.query.lifecycle : null;
  const slug = typeof req.query.slug === 'string' && /^[a-z0-9._-]+$/i.test(req.query.slug)
    ? req.query.slug.toLowerCase() : null;
  const productCohort = typeof req.query.product_cohort === 'string' && req.query.product_cohort.trim()
    ? req.query.product_cohort.trim() : null;
  const quality = ['verified', 'partial', 'limited'].includes(req.query.quality)
    ? req.query.quality : null;
  const filters = { lifecycle, slug, productCohort, quality };
  try {
    // The outer bound kind keeps DEX rows exchange-only; the CEX branch
    // intentionally retains every centralized venue type as a control cohort.
    const rows = await dbQuery(
      `WITH lifecycle_cases AS (
         SELECT slug, kind, 'dead' AS lifecycle, venue_type, name, launched, NULL AS primary_chain,
                verdict AS status, metric_label, metric_type, metric_unit,
                current_metric AS metric, peak_metric, drawdown_pct, collapse_date AS event_date,
                why AS summary, outlook, profile, sources, updated_at
         FROM dead_exchanges
         WHERE venue_type = 'exchange' OR kind = 'cex'
         UNION ALL
         SELECT slug, kind, 'mid', venue_type, name, launched, NULL,
                verdict, metric_label, metric_type, metric_unit,
                metric, NULL, NULL, NULL, why_stuck, outlook, profile, sources, updated_at
         FROM mid_exchanges
         WHERE venue_type = 'exchange' OR kind = 'cex'
         UNION ALL
         SELECT slug, type, 'successful', venue_type, name, launched, primary_chain,
                status, metric_label, metric_type, metric_unit,
                metric, NULL, NULL, NULL, why_successful, outlook, profile, sources, updated_at
         FROM successful_exchanges
         WHERE venue_type = 'exchange' OR type = 'cex'
       )
       SELECT c.*,
              f.operating_model AS feature_operating_model,
              f.product_cohort AS feature_product_cohort,
              f.custody_model AS feature_custody_model,
              f.primary_chain AS feature_primary_chain,
              f.chains AS feature_chains,
              f.token_status AS feature_token_status,
              f.token_symbol AS feature_token_symbol,
              f.token_launch_date AS feature_token_launch_date,
              f.token_launch_timing AS feature_token_launch_timing,
              f.token_strategy AS feature_token_strategy,
              f.token_source_url AS feature_token_source_url,
              f.metric_type AS feature_metric_type,
              f.metric_unit AS feature_metric_unit,
              f.metric_window AS feature_metric_window,
              f.metric_as_of AS feature_metric_as_of,
              f.metric_observed_at AS feature_metric_observed_at,
              f.comparability_key AS feature_comparability_key,
              f.evidence AS feature_evidence,
              f.quality_label AS feature_quality_label,
              f.quality_issues AS feature_quality_issues,
              f.lifecycle_evidence_date AS feature_lifecycle_evidence_date,
              f.last_verified_at AS feature_last_verified_at,
              f.next_review_at AS feature_next_review_at,
              f.freshness_status AS feature_freshness_status
       FROM lifecycle_cases c
       LEFT JOIN exchange_case_features f
         ON f.kind = c.kind AND f.slug = c.slug AND f.lifecycle = c.lifecycle
       WHERE c.kind = ?
       ORDER BY c.lifecycle ASC, c.name ASC`, [kind]);
    const allCases = rows.map(normalizeExchangeCase).map((row) => {
      const sources = publicationSourceRecords(row.sources);
      const caseWithDepth = {
        ...row,
        sources,
        publication_depth: assessExchangePublicationDepth({
          kind: row.kind,
          lifecycle: row.lifecycle,
          slug: row.slug,
          name: row.name,
          sources,
          forensicAnalysis: row.analysis.forensic_analysis
            || row.profile.forensic_analysis,
        }),
      };
      return publicExchangeCase(caseWithDepth);
    });
    const cases = allCases.filter((row) => (
      (!lifecycle || row.lifecycle === lifecycle)
      && (!slug || String(row.slug).toLowerCase() === slug)
      && (!productCohort || row.analysis.product_cohort === productCohort)
      && (!quality || row.analysis.data_quality.label === quality)
    ));
    res.json({
      kind,
      filters,
      cases,
      count: cases.length,
      available: {
        productCohorts: [...new Set(allCases.map((row) => row.analysis.product_cohort))]
          .sort((a, b) => a.localeCompare(b)),
        qualityLabels: [...new Set(allCases.map((row) => row.analysis.data_quality.label))]
          .sort((a, b) => a.localeCompare(b)),
      },
      summary: summarizeExchangeCases(cases, kind),
      claim_support: summarizePublicationDepth(
        cases.map((row) => row.publication_depth),
      ),
    });
  } catch (e) {
    res.json({
      kind, filters, cases: [], count: 0,
      available: { productCohorts: [], qualityLabels: [] },
      summary: summarizeExchangeCases([], kind),
      claim_support: summarizePublicationDepth([]),
      error: e.message,
    });
  }
}));

function parsedPublicJson(value, fallback) {
  if (value && typeof value === 'object') return value;
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function publicLegacyExchangeRow(row, lifecycle, parseSources = false) {
  const profile = parsedPublicJson(row.profile, {});
  const rawSources = parsedPublicJson(row.sources, []);
  const publicationSources = publicationSourceRecords(rawSources);
  const depth = assessExchangePublicationDepth({
    kind: row.kind || row.type,
    lifecycle,
    slug: row.slug,
    name: row.name,
    sources: publicationSources,
    forensicAnalysis: profile.forensic_analysis,
  });
  const summaryField = {
    dead: 'why',
    mid: 'why_stuck',
    successful: 'why_successful',
  }[lifecycle];
  const publicCase = publicExchangeCase({
    ...row,
    lifecycle,
    status: row.verdict || row.status,
    summary: row[summaryField],
    profile,
    sources: publicationSources,
    analysis: {
      forensic_analysis: profile.forensic_analysis,
      forensic_analysis_status: profile.forensic_analysis ? 'published' : 'pending',
    },
    publication_depth: depth,
  });
  const result = {
    ...row,
    metric: publicCase.metric,
    current_metric: publicCase.publication_support.metric
      ? null
      : row.current_metric,
    peak_metric: publicCase.peak_metric,
    drawdown_pct: publicCase.drawdown_pct,
    profile: publicCase.profile,
    sources: parseSources ? publicationSources : row.sources,
    outlook: publicCase.outlook,
    publication_depth: depth,
    publication_support: publicCase.publication_support,
  };
  result[summaryField] = publicCase.summary;
  if (lifecycle === 'successful') result.status = publicCase.status;
  else result.verdict = publicCase.status;
  return result;
}

app.get('/api/dead-exchanges', wrap(async (req, res) => {
  const kind = req.query.kind === 'cex' ? 'cex' : 'dex';
  try {
    // The bound kind keeps DEX rows exchange-only; the OR intentionally
    // includes every centralized CEX venue type.
    const rows = await dbQuery(
      `SELECT slug, kind, venue_type, name, launched, metric_label, metric_type, metric_unit, peak_metric, current_metric, drawdown_pct, peak_date, collapse_date, why, outlook, verdict, sources, profile, updated_at
       FROM dead_exchanges WHERE kind = ? AND (venue_type = 'exchange' OR kind = 'cex')
       ORDER BY CASE WHEN kind = 'cex' THEN metric_type ELSE '' END, CASE WHEN kind = 'cex' THEN metric_unit ELSE '' END, COALESCE(peak_metric, current_metric) DESC, name ASC`, [kind]);
    const exchanges = rows.map((row) => publicLegacyExchangeRow(row, 'dead'));

    const tagCounts = {}; let fraud = 0; const verdictCounts = {}; const metricGroupMap = {};
    for (const c of exchanges) {
      const tags = (c.profile && c.profile.cause_tags) || [];
      canonTags(tags).forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
      if (isFraudy(tags)) fraud++;
      const metricType = c.metric_type || 'unknown';
      const metricUnit = c.metric_unit || 'unknown';
      const metricKey = `${metricType}:${metricUnit}`;
      const group = metricGroupMap[metricKey] || {
        metricType, metricUnit, count: 0, drawdownCount: 0, drawdownSum: 0,
      };
      group.count++;
      if (c.drawdown_pct != null) {
        group.drawdownCount++;
        group.drawdownSum += c.drawdown_pct;
      }
      metricGroupMap[metricKey] = group;
      const v = (c.verdict || 'unknown').toLowerCase();
      verdictCounts[v] = (verdictCounts[v] || 0) + 1;
    }
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])
      .map(([k, n]) => ({ tag: k, label: TAG_LABELS[k] || k, count: n }));

    let narrative = null;
    try { const m = await dbQuery(`SELECT v, updated_at FROM graveyard_meta WHERE k = ?`, [`${kind}_trends`]); if (m[0]) narrative = { text: m[0].v, updated_at: m[0].updated_at }; } catch (e) {}

    const metricGroups = Object.values(metricGroupMap).map(({ drawdownSum, ...group }) => ({
      ...group,
      avgDrawdown: group.drawdownCount ? +(drawdownSum / group.drawdownCount).toFixed(1) : null,
    }));

    res.json({
      kind, exchanges, count: exchanges.length,
      trends: {
        topTags, verdictCounts, causeVocab: causeVocab(),
        fraudCount: fraud, metricGroups,
        narrative,
      },
    });
  } catch (e) {
    res.json({ kind, exchanges: [], count: 0, error: e.message });
  }
}));

app.get('/api/mid-exchanges', wrap(async (req, res) => {
  const kind = req.query.kind === 'cex' ? 'cex' : 'dex';
  try {
    // The bound kind keeps DEX rows exchange-only; the OR intentionally
    // includes every centralized CEX venue type.
    const rows = await dbQuery(
      `SELECT slug, kind, venue_type, name, launched, metric_label, metric_type, metric_unit, metric, verdict, why_stuck, outlook, profile, sources, updated_at
       FROM mid_exchanges WHERE kind = ? AND (venue_type = 'exchange' OR kind = 'cex')
       ORDER BY CASE WHEN kind = 'cex' THEN metric_type ELSE '' END, CASE WHEN kind = 'cex' THEN metric_unit ELSE '' END, metric DESC, name ASC`, [kind]);
    const exchanges = rows.map((row) => publicLegacyExchangeRow(row, 'mid'));
    const verdictCounts = {};
    const tagCounts = {};
    for (const c of exchanges) {
      const v = (c.verdict || 'unknown').toLowerCase(); verdictCounts[v] = (verdictCounts[v] || 0) + 1;
      // DEX mid rows tag gaps as success_factors_missing; CEX mid rows are
      // seeded with cause_tags instead (see migrations/0012_exchange_seed.sql).
      const tags = (c.profile && (c.profile.success_factors_missing || c.profile.cause_tags)) || [];
      canonTags(tags).forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
    }
    const topGaps = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])
      .map(([k, n]) => ({ tag: k, label: TAG_LABELS[k] || k.replace(/_/g, ' '), count: n }));
    res.json({ kind, exchanges, count: exchanges.length, verdictCounts, topGaps, causeVocab: causeVocab() });
  } catch (e) {
    res.json({ kind, exchanges: [], count: 0, error: e.message });
  }
}));

// Citation-backed successful-exchange dossiers. This deliberately returns
// metric *groups*, never a cross-venue total: spot volume, routed volume and
// perpetual notional are different observations and are only comparable within
// their own metric_type + unit cohort. The dedicated Forensics UI consumes this
// alongside /api/mid-exchanges and /api/dead-exchanges.
app.get('/api/successful-exchanges', wrap(async (req, res) => {
  const kind = req.query.kind === 'cex' ? 'cex' : 'dex';
  const chain = typeof req.query.chain === 'string' && req.query.chain.trim() ? req.query.chain.trim() : null;
  const metricType = typeof req.query.metric_type === 'string' && req.query.metric_type.trim() ? req.query.metric_type.trim() : null;
  const filters = { chain, metricType };
  try {
    // The bound type keeps DEX rows exchange-only; the OR intentionally
    // includes every centralized CEX venue type.
    const where = ['type = ?', "(venue_type = 'exchange' OR type = 'cex')"];
    const binds = [kind];
    if (chain) { where.push('primary_chain = ?'); binds.push(chain); }
    if (metricType) { where.push('metric_type = ?'); binds.push(metricType); }
    const rows = await dbQuery(
      `SELECT slug, type AS kind, venue_type, name, launched, primary_chain, status,
              metric_label, metric_type, metric_unit, metric, why_successful, outlook,
              profile, sources, updated_at
       FROM successful_exchanges WHERE ${where.join(' AND ')}
       ORDER BY metric_type ASC, metric_unit ASC, metric DESC, name ASC`, binds);
    const exchanges = rows.map((row) => (
      publicLegacyExchangeRow(row, 'successful', true)
    ));
    const groups = new Map();
    for (const row of exchanges) {
      const metricTypeKey = row.metric_type || 'unknown';
      const metricUnit = row.metric_unit || 'unknown';
      const key = `${metricTypeKey}:${metricUnit}`;
      const group = groups.get(key) || { metricType: metricTypeKey, metricUnit, count: 0 };
      group.count++;
      groups.set(key, group);
    }
    const metricGroups = [...groups.values()].sort((a, b) => (
      a.metricType.localeCompare(b.metricType) || a.metricUnit.localeCompare(b.metricUnit)
    ));
    res.json({ kind, filters, exchanges, count: exchanges.length, metricGroups });
  } catch (e) {
    res.json({ kind, filters, exchanges: [], count: 0, metricGroups: [], error: e.message });
  }
}));

// ---------------------------------------------------------------------------
// Dynamic DEX tier classifier — classifyChains' pattern applied to DefiLlama's
// per-protocol DEX volume instead of per-chain TVL. There is no CEX equivalent:
// a CEX's death is usually a discrete event (a bank run, a fraud disclosure),
// not a gradual drawdown a curve can fit, so forcing this same model onto CEXs
// would produce a number that is computed but not honest. dead_exchanges /
// mid_exchanges (kind='cex') stay 100% desk-curated instead — see the routes
// above.
// ---------------------------------------------------------------------------
const DEX_BOARD_SIZE = 25;
let dexTiersCache = { ts: 0, data: null };
let dexTiersBuilding = false;

// Flatten a previous classifyDexTiers() result into a { dexKey: metric } map, so
// a later cycle can recover a DEX's known peak/drawdown when this cycle's own
// summary/dexs history fetch fails for it — the DEX analog of
// priorMetricsByChain above, guarding the exact bug fixed in commits
// 1f04f66/3d6ec31 (a fetch failure must never report 0% drawdown).
export function priorMetricsByDex(tierData) {
  return flattenTierMetrics(tierData);
}

export async function classifyDexTiers(priorMetrics = {}) {
  const overview = await fetchJson(DEXS_URL);
  const rolled = rollupDexProtocols(overview, { categories: DEX_CATEGORIES });
  if (!rolled.length) throw new Error('dexs feed unavailable');
  const ranked = [...rolled].sort((a, b) => b.total24h - a.total24h);
  const onBoardKeys = new Set(ranked.slice(0, DEX_BOARD_SIZE).map((r) => r.key));
  const universe = ranked.slice(0, 100);

  const metrics = await pool(universe, async (r) => {
    let hist = null;
    try { hist = await fetchJson(`https://api.llama.fi/summary/dexs/${encodeURIComponent(r.key)}?dataType=dailyVolume`, 12000); }
    catch (e) { console.error('[classifyDexTiers] summary/dexs fetch failed for', r.key, ':', e.message); }
    // totalDataChart is [timestamp, value] TUPLES (verified live 2026-07-27) —
    // NOT {date, tvl} objects like historicalChainTvl. A different shape from
    // the chain-TVL endpoint this classifier is otherwise modeled on.
    const chart = hist && Array.isArray(hist.totalDataChart) ? hist.totalDataChart : [];
    const series = chart.filter((p) => Array.isArray(p) && p.length === 2).map(([d, v]) => ({ d: Number(d), v: Number(v) || 0 }));
    const cur = Number(r.total24h) || 0;
    // Same guard classifyChains needed: an empty series must never overwrite a
    // known peak with "no decline" just because today's history fetch failed.
    const prior = priorMetrics[r.key];
    if (!series.length && prior && prior.peak_metric > 0) {
      const drawdown = ((prior.peak_metric - cur) / prior.peak_metric) * 100;
      return {
        chain: r.key, name: r.name, chains: r.chains, volume24h: cur, spanDays: prior.spanDays,
        peak_metric: prior.peak_metric, peak_date: prior.peak_date, current_metric: cur,
        drawdown_pct: +drawdown.toFixed(1), change_90d: prior.change_90d, launched: prior.launched,
        stale: true,
      };
    }
    const { peak, peakDate, launched, spanDays, drawdown, change90 } = summarizeMetricHistory(series, cur);
    return {
      chain: r.key, name: r.name, chains: r.chains, volume24h: cur, spanDays: Math.round(spanDays),
      peak_metric: peak, peak_date: peakDate ? toISO(peakDate) : null, current_metric: cur,
      drawdown_pct: +drawdown.toFixed(1), change_90d: change90 != null ? +change90.toFixed(1) : null,
      launched: launched ? toISO(launched).slice(0, 7) : null,
    };
  }, 6);

  const b = Object.fromEntries(TIERS.map((t) => [t, []]));
  const onBoard = (key) => onBoardKeys.has(key);
  const identity = (s) => s; // DEX slugs need no chain-alias/L1-L2 normalization
  for (const m of metrics) b[classifyTier(m, onBoard, identity)].push(m);
  b.mid.sort((x, y) => y.volume24h - x.volume24h);
  b.dying.sort((x, y) => (x.change_90d ?? 0) - (y.change_90d ?? 0));
  b.dead.sort((x, y) => y.peak_metric - x.peak_metric);
  return b;
}

async function getDexTiers() {
  const now = Date.now();
  if (!dexTiersCache.data) dexTiersCache = { ts: now, data: await classifyDexTiers(priorMetricsByDex(dexTiersCache.data)) };
  else if (now - dexTiersCache.ts > TIERS_TTL && !dexTiersBuilding) {
    dexTiersBuilding = true;
    classifyDexTiers(priorMetricsByDex(dexTiersCache.data)).then((d) => { dexTiersCache = { ts: Date.now(), data: d }; })
      .catch((e) => console.error('[getDexTiers] refresh failed:', e.message)).finally(() => { dexTiersBuilding = false; });
  }
  return dexTiersCache.data;
}

app.get('/api/dex-tiers', wrap(async (req, res) => {
  try {
    const b = await getDexTiers();
    // TIER_CRITERIA describes blockchain TVL/activity classification. The DEX
    // classifier reuses its numeric thresholds over trading-volume history, so
    // publishing the chain-specific prose here would be false. Omit criteria
    // until a separately-authored DEX methodology is reviewed and cited.
    res.json({ ...b, meta: { updated_at: dexTiersCache.ts } });
  } catch (e) {
    res.json({ error: e.message });
  }
}));

// Live "Top 25 DEX" board. Derived from getDexTiers() rather than a second
// independent fetch+rank pipeline: thriving+zombie together ARE the onBoard set
// classifyDexTiers already computed, so this route reads that cache instead of
// re-fetching DEXS_URL on every request.
app.get('/api/dex', wrap(async (req, res) => {
  try {
    const b = (await getDexTiers()) || {};
    const board = [
      ...(b.thriving || []).map((m) => ({ ...m, tier: 'thriving' })),
      ...(b.zombie || []).map((m) => ({ ...m, tier: 'zombie' })),
    ]
      .sort((a, c) => c.volume24h - a.volume24h)
      .slice(0, DEX_BOARD_SIZE)
      .map((m, i) => ({
        rank: i + 1, key: m.chain, name: m.name, chains: m.chains,
        volume24h: m.volume24h, change_90d: m.change_90d, tier: m.tier,
      }));
    res.json({ dexs: board, count: board.length });
  } catch (e) {
    res.json({ dexs: [], count: 0, error: e.message });
  }
}));

// ---------------------------------------------------------------------------
// Live "Top 10 CEX" board — CoinGecko's Trust Score ranking, cron-cached (see
// refreshCex in handleScheduled) rather than fetched per-request: CoinGecko's
// unauthenticated rate limit returned 429 after 2 calls within 20 seconds when
// this was verified live, and this project's COINGECKO_API_KEY (CLAUDE.md §3.3)
// already serves price/NFT lookups on the same quota.
// ---------------------------------------------------------------------------
const CG_EXCHANGES_URL = 'https://api.coingecko.com/api/v3/exchanges?per_page=10&page=1';
const CEX_BOARD_SIZE = 10;
const cexRow = (r) => ({
  id: r.id, name: r.name, trust_score: r.trust_score ?? null, trust_score_rank: r.trust_score_rank ?? null,
  trade_volume_24h_btc: r.trade_volume_24h_btc ?? null, year_established: r.year_established ?? null,
  country: r.country ?? null, url: r.url ?? null, image: r.image ?? null,
});

async function refreshCex(env) {
  if (!env || !env.DB) return;
  try {
    const rows = await fetchJson(cgUrl(CG_EXCHANGES_URL), 15000);
    const cex = (Array.isArray(rows) ? rows : []).filter((r) => r && r.id).slice(0, CEX_BOARD_SIZE).map(cexRow);
    if (!cex.length) return; // never overwrite a good cache with an empty pull
    await env.DB.prepare(
      `INSERT INTO snapshot_cache (key, data, updated_at) VALUES ('cex', ?, ?)
       ON CONFLICT(key) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`
    ).bind(JSON.stringify(cex), Date.now()).run();
  } catch (e) { console.error('[refreshCex] failed:', e.message); }
}

app.get('/api/cex', wrap(async (req, res) => {
  try {
    let row = null;
    if (ENV.DB) { try { row = await ENV.DB.prepare(`SELECT data, updated_at FROM snapshot_cache WHERE key='cex'`).first(); } catch (e) {} }
    if (row && row.data) {
      const exchanges = JSON.parse(row.data);
      return res.json({ exchanges, count: exchanges.length, updated_at: row.updated_at, source: 'CoinGecko Trust Score (cron-cached)' });
    }
    // Cold cache (first deploy, or D1 unavailable): fetch live rather than serve nothing.
    const rows = await fetchJson(cgUrl(CG_EXCHANGES_URL), 15000);
    const exchanges = (Array.isArray(rows) ? rows : []).slice(0, CEX_BOARD_SIZE).map(cexRow);
    res.json({ exchanges, count: exchanges.length, source: 'CoinGecko Trust Score (live)' });
  } catch (e) {
    res.json({ exchanges: [], count: 0, error: e.message });
  }
}));

// updated_at is a COLUMN (not a key inside the profile JSON) — carry it through so
// the dying-watch detail can render the same "Data verified …" stamp as a grave card.
function parseProfileRow(r) {
  let p = null;
  // a malformed profile degrades to null (card renders without the expansion)
  try { p = r.profile ? JSON.parse(r.profile) : null; } catch (e) { console.error('[profile] bad JSON for', r.chain, e.message); }
  return { verdict: r.verdict, why: r.why, outlook: r.outlook, sources: r.sources, updated_at: r.updated_at, profile: p };
}
async function profileMap() {
  const out = {};
  try {
    (await dbQuery(`SELECT chain, verdict, why, outlook, profile, sources, updated_at FROM dead_chains`)).forEach((r) => { out[r.chain] = parseProfileRow(r); });
  } catch (e) { console.error('[profileMap] dead_chains:', e.message); }
  try {
    (await dbQuery(`SELECT chain, verdict, why_stuck AS why, outlook, profile, sources, updated_at FROM mid_chains`)).forEach((r) => { if (!out[r.chain]) out[r.chain] = parseProfileRow(r); });
  } catch (e) { console.error('[profileMap] mid_chains:', e.message); }
  return out;
}


app.get('/api/tiers', wrap(async (req, res) => {
  try {
    const b = await getTiers();
    const pm = await profileMap();
    const attach = (arr, limit) => arr.slice(0, limit).map((m) => ({ ...m, research: pm[m.chain] || null }));
    // "Dying watch" — steepest 90-day decliners among still-alive chains (auto-updating)
    const declining = [...b.mid, ...b.dying]
      .filter((m) => m.change_90d != null && m.change_90d <= -15)
      .sort((x, y) => x.change_90d - y.change_90d)
      .slice(0, 20)
      .map((m) => ({ ...m, research: pm[m.chain] || null }));
    let narrative = null, successFactors = null;
    try { const m = await dbQuery(`SELECT v FROM graveyard_meta WHERE k='trends' LIMIT 1`); if (m[0]) narrative = m[0].v; } catch (e) {}
    try { const s = await dbQuery(`SELECT v FROM graveyard_meta WHERE k='success_factors' LIMIT 1`); if (s[0]) successFactors = s[0].v; } catch (e) {}
    // curated = chains whose tier is a researched verdict (dead_chains/mid_chains),
    // exposed so the UI can label those badges as research, not classifier output.
    const curated = await curatedTierMap();
    res.json({
      updatedAt: new Date(tiersCache.ts).toISOString(),
      criteria: TIER_CRITERIA,
      computedNote: TIER_CRITERIA.computedNote,
      counts: Object.fromEntries(TIERS.map((t) => [t, (b[t] || []).length])),
      tierMap: { ...tierMapFrom(b), ...curated },
      curated: Object.keys(curated),
      mid: attach(b.mid, 25), dying: attach(b.dying, 25), dead: attach(b.dead, 25), declining,
      narrative, successFactors,
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}));

// NFT & Ordinals lifecycle library
// ---------------------------------------------------------------------------
// Live NFT/Ordinals catalog — the full CoinGecko collection universe (~2000
// across ~17 chains), searchable + filterable + paginated from D1.
// ---------------------------------------------------------------------------
app.get('/api/nft-catalog', wrap(async (req, res) => {
  try {
    if (!ENV.DB) return res.json({ collections: [], total: 0, chains: [], page: 1, perPage: 30 });
    const q = String(req.query.q || '').trim().toLowerCase();
    const chain = String(req.query.chain || '').trim();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = Math.min(60, Math.max(10, parseInt(req.query.per) || 30));
    const where = [], binds = [];
    if (q) { where.push('lower(name) LIKE ?'); binds.push('%' + q + '%'); }
    if (chain) { where.push('chain = ?'); binds.push(chain); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const totalRow = await ENV.DB.prepare(`SELECT COUNT(*) n FROM nft_catalog ${whereSql}`).bind(...binds).first();
    const total = (totalRow && totalRow.n) || 0;
    const rows = (await ENV.DB.prepare(
      `SELECT id, name, chain, contract_address, symbol FROM nft_catalog ${whereSql} ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`
    ).bind(...binds, perPage, (page - 1) * perPage).all()).results || [];
    // chain facets (with counts) for the filter dropdown — unfiltered by chain
    const facets = (await ENV.DB.prepare(
      `SELECT chain, COUNT(*) n FROM nft_catalog GROUP BY chain ORDER BY n DESC`
    ).all()).results || [];
    res.json({ collections: rows, total, page, perPage, pages: Math.ceil(total / perPage), chains: facets });
  } catch (e) {
    res.json({ collections: [], total: 0, chains: [], error: e.message });
  }
}));

// On-demand enriched detail for one catalog collection (floor / mcap / 24h vol /
// holders / thumbnail), cached in D1 to stay within the CoinGecko Demo rate limit.
const NFT_DETAIL_TTL = 30 * 60 * 1000;
app.get('/api/nft-collection/:id', wrap(async (req, res) => {
  const id = String(req.params.id || '').toLowerCase().replace(/[^a-z0-9._-]/g, '');
  if (!id) return res.status(400).json({ error: 'bad id' });
  try {
    if (ENV.DB) {
      const cached = await ENV.DB.prepare(`SELECT data, updated_at FROM nft_detail WHERE id = ?`).bind(id).first();
      if (cached && cached.data && Date.now() - cached.updated_at < NFT_DETAIL_TTL) {
        return res.json({ ...JSON.parse(cached.data), cached: true });
      }
    }
    const d = await fetchJson(cgUrl(`https://api.coingecko.com/api/v3/nfts/${encodeURIComponent(id)}`), 12000);
    const detail = {
      id: d.id, name: d.name, chain: d.asset_platform_id || null,
      floorUsd: d.floor_price && d.floor_price.usd != null ? d.floor_price.usd : null,
      floorNative: d.floor_price && d.floor_price.native_currency != null ? d.floor_price.native_currency : null,
      nativeSymbol: d.native_currency_symbol || null,
      mcapUsd: d.market_cap && d.market_cap.usd != null ? d.market_cap.usd : null,
      vol24hUsd: d.volume_24h && d.volume_24h.usd != null ? d.volume_24h.usd : null,
      floorChange24h: d.floor_price_24h_percentage_change && d.floor_price_24h_percentage_change.usd != null ? +d.floor_price_24h_percentage_change.usd.toFixed(1) : null,
      holders: d.number_of_unique_addresses != null ? d.number_of_unique_addresses : null,
      supply: d.total_supply != null ? d.total_supply : null,
      thumb: (d.image && (d.image.small_2x || d.image.small)) || null,
      desc: d.description ? String(d.description).slice(0, 600) : null,
      homepage: (() => { const h = d.links && d.links.homepage; return Array.isArray(h) ? (h[0] || null) : (h || null); })(),
      twitter: d.twitter_account_id ? `https://twitter.com/${d.twitter_account_id}` : null,
      coingecko: `https://www.coingecko.com/en/nft/${d.id}`,
    };
    if (ENV.DB) { try { await ENV.DB.prepare(
      `INSERT INTO nft_detail (id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`
    ).bind(id, JSON.stringify(detail), Date.now()).run(); } catch (e) {} }
    res.json(detail);
  } catch (e) {
    res.status(502).json({ error: 'detail unavailable: ' + e.message });
  }
}));

app.get('/api/nft', wrap(async (req, res) => {
  try {
    const requestedSlug = typeof req.query.slug === 'string' && /^[a-z0-9._-]+$/i.test(req.query.slug)
      ? req.query.slug.toLowerCase() : null;
    const allRows = await dbQuery(`SELECT slug, name, chain, category, status, profile, sources, updated_at FROM nft_collections ORDER BY name`);
    const rows = requestedSlug
      ? allRows.filter((row) => String(row.slug).toLowerCase() === requestedSlug)
      : allRows;
    const collections = rows.map((r) => {
      let p = null;
      try { p = r.profile ? JSON.parse(r.profile) : null; } catch (e) {}
      let sources = [];
      try { sources = r.sources ? JSON.parse(r.sources) : []; } catch (e) {}
      const publicationSources = publicationSourceRecords(sources);
      const citation = validateFieldCitedNft(p, r.sources);
      const freshness = forensicFreshness(p);
      const publicationDepth = assessNftPublicationDepth({
        slug: r.slug,
        name: r.name,
        sources: publicationSources,
        profile: p,
      });
      const lifecyclePending = hasPublicationDepthGap(publicationDepth, ({ path, type }) => (
        type === 'lifecycle' || path === 'forensic_analysis.outcome'
      ));
      const publicProfile = publicNftProfile(p, publicationDepth);
      return {
        ...r,
        status: freshness?.statusWithheld || lifecyclePending ? 'unknown' : r.status,
        profile: publicProfile,
        normalized_dossier: normalizedNftDossier({ ...r, status: freshness?.statusWithheld || lifecyclePending ? 'unknown' : r.status }, publicProfile, publicationSources),
        citation: { fieldCited: p?.citation_schema === 'field-v1' && citation.valid, errors: citation.errors },
        freshness,
        publication_sources: publicationSources,
        publication_depth: publicationDepth,
        publication_support: {
          status: lifecyclePending ? PENDING_PUBLICATION_SUPPORT : null,
          profile: publicationDepth.unresolved_high_risk_claim_count
            ? PENDING_PUBLICATION_SUPPORT
            : null,
        },
        source_status: {
          registered: publicationDepth.registered_source_count,
          reachable: publicationDepth.reachable_source_count,
          editor_reviewed: publicationDepth.reviewed_source_count,
        },
      };
    });
    // aggregate lifecycle stats from profiles
    const nums = (f) => collections.map((c) => c.profile && c.profile[f]).filter((x) => typeof x === 'number' && isFinite(x));
    const avg = (arr) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null;
    const statusCounts = {};
    collections.forEach((c) => { const s = (c.status || 'unknown').toLowerCase(); statusCounts[s] = (statusCounts[s] || 0) + 1; });
    const riskMap = {};
    try { (await dbQuery(`SELECT entity_name, level, summary, evidence, sources FROM risk_flags WHERE entity_type='nft'`)).forEach((r) => { riskMap[r.entity_name] = r; }); } catch (e) {}
    collections.forEach((c) => { c.risk = publicNftRisk(riskMap[c.name]); });
    // broad live-market aggregate from nft_market (hundreds of collections, real CoinGecko data)
    let market = null;
    try {
      const mk = await dbQuery(`SELECT floor_usd, mcap_usd, vol24h_usd FROM nft_market WHERE mcap_usd > 0`);
      if (mk.length > 20) {
        const median = (arr) => { const s = arr.filter((x) => x > 0).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
        market = {
          count: mk.length,
          medianFloorUsd: median(mk.map((r) => r.floor_usd || 0)),
          medianMcapUsd: median(mk.map((r) => r.mcap_usd || 0)),
          total24hUsd: mk.reduce((a, r) => a + (r.vol24h_usd || 0), 0),
        };
      }
    } catch (e) {}

    const fieldCitedCount = collections.filter((c) => c.citation.fieldCited).length;
    const analysis = buildNftLifecycleAnalysis(collections);
    res.json({
      collections, count: collections.length, analysis, statusCounts, market,
      claim_support: summarizePublicationDepth(
        collections.map((collection) => collection.publication_depth),
      ),
      citationCoverage: { fieldCitedCount, legacyCount: collections.length - fieldCitedCount },
      agg: {
        avgLifespanDays: avg(nums('lifespan_days')),
        avgHolderRetentionPct: avg(nums('holder_retention_pct')),
        avgMintRaiseUsd: avg(nums('mint_raise_usd')),
        avgSecondaryUsd: avg(nums('secondary_volume_usd')),
      },
    });
  } catch (e) {
    res.json({ collections: [], count: 0, error: e.message });
  }
}));

// Web3 casino / betting research. Indexed dossiers are distinct from draft
// candidates, but corpus inclusion is not treated as proof that every high-risk
// claim meets the independent-support threshold. That status is computed and
// published separately for every case.
const CASINO_ENTITY_KINDS = new Set(['custodial_operator', 'onchain_casino', 'betting_exchange', 'bankroll_protocol', 'gaming_infrastructure']);
const CASINO_PRODUCT_SUBTYPES = new Set(['casino', 'sportsbook', 'casino_and_sportsbook', 'poker', 'betting_exchange', 'prediction_market', 'bankroll', 'infrastructure']);
const CASINO_STATUSES = new Set(['active', 'restricted', 'paused', 'wind_down_announced', 'inactive', 'insolvent', 'superseded', 'unknown']);
function parseCasinoJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
function casinoRecordWithPublicationSupport(item, unresolvedPaths, withheldFields) {
  const sourceClaimIds = parseCasinoJson(item.source_claim_ids, []);
  const pending = sourceClaimIds.length === 0 || sourceClaimIds.some((claimId) => (
    unresolvedPaths.has(`casino_claims.${claimId}`)
  ));
  const result = {
    ...item,
    source_claim_ids: sourceClaimIds,
    publication_support: pending ? 'pending_independent_support' : null,
  };
  if (pending) {
    for (const field of withheldFields) result[field] = null;
  }
  return result;
}
function casinoCaseRow(row) {
  return {
    ...row,
    chains: parseCasinoJson(row.chains, []), token_contracts: parseCasinoJson(row.token_contracts, []),
    unsourced_fields: parseCasinoJson(row.unsourced_fields, []),
    forensic_review: parseCasinoJson(row.forensic_review, null),
    source_count: Number(row.source_count) || 0,
    registered_source_count: Number(row.registered_source_count) || 0,
    reachable_source_count: Number(row.reachable_source_count) || 0,
    reviewed_source_count: Number(row.reviewed_source_count ?? row.source_count) || 0,
  };
}

function unresolvedCasinoClaims(claims, depth) {
  const unresolvedPaths = new Set(
    (depth?.unresolved_high_risk_claims || []).map(({ path }) => path),
  );
  return claims.filter((claim) => (
    unresolvedPaths.has(`casino_claims.${claim.claim_id}`)
  ));
}

const CASINO_STATUS_CLAIM_TOKENS = new Set([
  'active',
  'ceased',
  'closed',
  'inactive',
  'insolvent',
  'paused',
  'status',
  'superseded',
  'wind',
]);
const CASINO_OUTCOME_CLAIM_TOKENS = new Set([
  'ceased',
  'closed',
  'failed',
  'failure',
  'insolvent',
  'outcome',
  'success',
  'wind',
]);

function casinoClaimHasToken(claim, acceptedTokens) {
  const tokens = `${claim.field_path || ''} ${claim.claim_id || ''}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return tokens.some((token) => acceptedTokens.has(token));
}

function casinoCasePublicationState(claims, depth) {
  const unresolvedClaims = unresolvedCasinoClaims(claims, depth);
  const outcomeGap = publicationDepthGapAt(depth, 'forensic_analysis.outcome');
  const statusPending = Boolean(outcomeGap) || unresolvedClaims.some((claim) => (
    casinoClaimHasToken(claim, CASINO_STATUS_CLAIM_TOKENS)
  ));
  const outcomePending = Boolean(outcomeGap) || unresolvedClaims.some((claim) => (
    casinoClaimHasToken(claim, CASINO_OUTCOME_CLAIM_TOKENS)
  ));
  return { statusPending, outcomePending };
}

function normalizedCasinoDossier(row, synthesis, claims, sources) {
  const forensic = synthesis?.forensic_analysis || {};
  const sourceLedger = Array.isArray(sources) && sources.length
    ? sources
    : [...new Map((claims || [])
      .filter((claim) => claim?.url)
      .map((claim) => [claim.source_id || claim.url, {
        id: claim.source_id || claim.url,
        title: claim.title || claim.source_id || 'source',
        url: claim.url,
      }])).values()];
  const evidence = (claims || []).map((claim) => ({
    claim_id: claim.claim_id,
    field_path: claim.field_path,
    support_direction: claim.support_direction,
    evidence_locator: claim.evidence_locator,
    publication_support: claim.publication_support || null,
  }));
  return normalizeDossier({
    category: `Web3 casino · ${row.product_subtype || 'product unknown'}`,
    name: row.brand_name,
    status: row.status || row.outcome_label,
    metric: row.completeness_pct == null ? null : `${row.completeness_pct}% evidence completeness`,
    as_of: row.status_as_of || row.last_reviewed,
    what_it_is: row.product_scope_note || synthesis?.present_situation,
    what_happened: synthesis?.present_situation,
    why: synthesis?.success_failure_hypotheses || forensic.why,
    strategic_choices: synthesis?.strategic_choices || synthesis?.business_mechanism || forensic.strategic_choices,
    operating_model: synthesis?.business_mechanism || synthesis?.chain_dependence,
    token_value_capture: synthesis?.token_contribution || row.token_symbol || row.token_status,
    evidence,
    counterfactual: synthesis?.counterfactual || forensic.counterfactual,
    risks_unknowns: synthesis?.risk_legal_posture || row.unsourced_fields || forensic.unknowns,
    lifecycle: synthesis?.present_situation || row.outcome_label,
    outlook_watch: synthesis?.outlook || forensic.watch,
    review_metadata: { confidence: row.confidence, completeness_pct: row.completeness_pct, last_reviewed: row.last_reviewed },
    sources: sourceLedger,
  });
}

function publicCasinoCase(row, claims, depth) {
  const result = casinoCaseRow(row);
  const { statusPending, outcomePending } = casinoCasePublicationState(claims, depth);
  if (statusPending) {
    result.status = null;
    result.status_as_of = null;
  }
  if (outcomePending) {
    result.outcome_label = null;
    result.outcome_as_of = null;
    result.outcome_rule_id = null;
  }
  result.publication_support = {
    status: statusPending ? PENDING_PUBLICATION_SUPPORT : null,
    outcome: outcomePending ? PENDING_PUBLICATION_SUPPORT : null,
  };
  result.normalized_dossier = normalizedCasinoDossier(result, null, claims, []);
  return result;
}

function publicCasinoOutlook(outlookValue, forensicAnalysis, depth) {
  const rawOutlook = outlookValue && typeof outlookValue === 'object'
    ? { ...outlookValue }
    : {};
  const pending = Number(depth?.unresolved_high_risk_claim_count) > 0;
  let outlook = rawOutlook;
  if (pending) {
    outlook = {};
    for (const field of ['as_of', 'review']) {
      if (Object.hasOwn(rawOutlook, field)) outlook[field] = rawOutlook[field];
    }
  }
  outlook.forensic_analysis = publicForensicAnalysis(forensicAnalysis, depth);
  outlook.publication_support = pending
    ? PENDING_PUBLICATION_SUPPORT
    : null;
  return outlook;
}

function publicCasinoSynthesis(synthesis, depth) {
  if (!synthesis) return null;
  const anyPending = Number(depth?.unresolved_high_risk_claim_count) > 0;
  const result = {
    ...synthesis,
    outlook: publicCasinoOutlook(
      synthesis.outlook,
      synthesis.forensic_analysis,
      depth,
    ),
    forensic_analysis: publicForensicAnalysis(synthesis.forensic_analysis, depth),
    publication_support: {
      present_situation: anyPending
        ? PENDING_PUBLICATION_SUPPORT
        : null,
      business_mechanism: anyPending ? PENDING_PUBLICATION_SUPPORT : null,
      token_contribution: anyPending ? PENDING_PUBLICATION_SUPPORT : null,
      chain_dependence: anyPending ? PENDING_PUBLICATION_SUPPORT : null,
      risk_legal_posture: anyPending ? PENDING_PUBLICATION_SUPPORT : null,
      success_failure_hypotheses: anyPending
        ? PENDING_PUBLICATION_SUPPORT
        : null,
      counterfactual: anyPending ? PENDING_PUBLICATION_SUPPORT : null,
      outlook: anyPending ? PENDING_PUBLICATION_SUPPORT : null,
      lessons_learned: anyPending ? PENDING_PUBLICATION_SUPPORT : null,
    },
  };
  if (anyPending) {
    result.present_situation = null;
    result.business_mechanism = null;
    result.token_contribution = null;
    result.chain_dependence = null;
    result.risk_legal_posture = null;
    result.success_failure_hypotheses = null;
    result.counterfactual = null;
    result.lessons_learned = [];
  }
  return result;
}

function casinoPublicationDepthMap(caseRows, claimRows, synthesisRows) {
  const claimsByCase = new Map();
  const sourcesByCase = new Map();
  for (const claim of claimRows) {
    if (!claimsByCase.has(claim.case_id)) claimsByCase.set(claim.case_id, []);
    claimsByCase.get(claim.case_id).push(claim);
    if (!sourcesByCase.has(claim.case_id)) sourcesByCase.set(claim.case_id, new Map());
    sourcesByCase.get(claim.case_id).set(claim.source_id, {
      source_id: claim.source_id,
      canonical_url: claim.url,
      title: claim.title,
      publisher: claim.publisher,
      source_tier: claim.source_tier,
      source_role: claim.source_role,
      resolving: claim.resolving,
      evidence_reviewed: claim.evidence_reviewed,
      evidence_reviewed_at: claim.evidence_reviewed_at,
      evidence_reviewer: claim.evidence_reviewer,
    });
  }
  const synthesisByCase = new Map(synthesisRows.map((row) => [
    row.case_id,
    parseCasinoJson(row.outlook, {}),
  ]));
  return new Map(caseRows.map((row) => [row.case_id, assessCasinoPublicationDepth({
    caseId: row.case_id,
    name: row.brand_name,
    sources: [...(sourcesByCase.get(row.case_id)?.values() || [])],
    claims: claimsByCase.get(row.case_id) || [],
    forensicAnalysis: synthesisByCase.get(row.case_id)?.forensic_analysis,
  })]));
}
app.get('/api/casinos', wrap(async (req, res) => {
  const filters = [
    { queryKey: 'entity_kind', clause: 'c.entity_kind = ?', allowed: CASINO_ENTITY_KINDS },
    { queryKey: 'product_subtype', clause: 'c.product_subtype = ?', allowed: CASINO_PRODUCT_SUBTYPES },
    { queryKey: 'status', clause: 'c.status = ?', allowed: CASINO_STATUSES },
  ];
  const where = ['c.quality_passed = 1'];
  const binds = [];
  for (const filter of filters) {
    const value = String(req.query[filter.queryKey] || '').trim();
    if (!value) {
      continue;
    }
    if (!filter.allowed.has(value)) {
      return res.status(400).json({ error: 'invalid casino filter' });
    }
    where.push(filter.clause);
    binds.push(value);
  }
  const sort = String(req.query.sort || 'reviewed').trim();
  const orderBy = { name: 'c.brand_name COLLATE NOCASE ASC', sources: 'reviewed_source_count DESC, c.brand_name COLLATE NOCASE ASC', reviewed: 'c.last_reviewed DESC, c.brand_name COLLATE NOCASE ASC' }[sort] || 'c.last_reviewed DESC, c.brand_name COLLATE NOCASE ASC';
  try {
    const [rows, depthClaims, depthSyntheses] = await Promise.all([
      dbQuery(
        `SELECT c.case_id, c.brand_name, c.entity_kind, c.product_subtype, c.primary_domain, c.custody_model, c.chains,
              c.product_scope_note, c.status, c.status_as_of, c.outcome_label, c.outcome_as_of, c.token_status,
              c.token_symbol, c.token_name, c.completeness_pct, c.confidence, c.unsourced_fields, c.last_reviewed,
              (SELECT json_extract(syn.outlook, '$.forensic_analysis.review')
                 FROM casino_syntheses syn WHERE syn.case_id = c.case_id LIMIT 1) AS forensic_review,
              (SELECT COUNT(DISTINCT cl.source_id) FROM casino_claims cl
                WHERE cl.case_id = c.case_id) AS registered_source_count,
              (SELECT COUNT(DISTINCT cl.source_id) FROM casino_claims cl JOIN casino_sources s ON s.source_id = cl.source_id
                WHERE cl.case_id = c.case_id AND s.resolving = 1) AS reachable_source_count,
              (SELECT COUNT(DISTINCT cl.source_id) FROM casino_claims cl JOIN casino_sources s ON s.source_id = cl.source_id
                WHERE cl.case_id = c.case_id AND s.resolving = 1
                  AND ${editorialReviewSql('s')}) AS reviewed_source_count,
              (SELECT COUNT(DISTINCT cl.source_id) FROM casino_claims cl JOIN casino_sources s ON s.source_id = cl.source_id
                WHERE cl.case_id = c.case_id AND s.resolving = 1
                  AND ${editorialReviewSql('s')}) AS source_count
         FROM casino_cases c WHERE ${where.join(' AND ')} ORDER BY ${orderBy}`,
        binds,
      ),
      dbQuery(`
        SELECT
          cl.case_id, cl.claim_id, cl.field_path, cl.source_id, cl.evidence_locator,
          cl.claim_type, cl.support_direction, cl.analyst_note,
          s.canonical_url AS url, s.title, s.publisher, s.source_tier, s.source_role,
          s.resolving, s.evidence_reviewed, s.evidence_reviewed_at, s.evidence_reviewer
        FROM casino_claims cl
        JOIN casino_sources s ON s.source_id = cl.source_id
        JOIN casino_cases c ON c.case_id = cl.case_id
        WHERE c.quality_passed = 1
        ORDER BY cl.case_id, cl.claim_id
      `),
      dbQuery(`
        SELECT syn.case_id, syn.outlook
        FROM casino_syntheses syn
        JOIN casino_cases c ON c.case_id = syn.case_id
        WHERE c.quality_passed = 1
        ORDER BY syn.case_id
      `),
    ]);
    const depthByCase = casinoPublicationDepthMap(rows, depthClaims, depthSyntheses);
    const claimsByCase = new Map();
    for (const claim of depthClaims) {
      if (!claimsByCase.has(claim.case_id)) claimsByCase.set(claim.case_id, []);
      claimsByCase.get(claim.case_id).push(claim);
    }
    const cases = rows.map((row) => {
      const publicationDepth = depthByCase.get(row.case_id);
      return {
        ...publicCasinoCase(
          row,
          claimsByCase.get(row.case_id) || [],
          publicationDepth,
        ),
        publication_depth: publicationDepth,
      };
    });
    const asOf = rows.map((item) => item.status_as_of).filter(Boolean).sort().at(-1) || null;
    const claimSupport = {
      high_risk_claim_count: cases.reduce(
        (sum, item) => sum + item.publication_depth.high_risk_claim_count,
        0,
      ),
      passing_high_risk_claim_count: cases.reduce(
        (sum, item) => sum + item.publication_depth.passing_high_risk_claim_count,
        0,
      ),
      unresolved_high_risk_claim_count: cases.reduce(
        (sum, item) => sum + item.publication_depth.unresolved_high_risk_claim_count,
        0,
      ),
      policy_note: 'Indexed dossier coverage is not editorial claim support; claim support varies by case.',
    };
    res.json({
      cases,
      count: cases.length,
      as_of: asOf,
      claim_support: claimSupport,
    });
  } catch {
    res.json({ cases: [], count: 0, as_of: null, error: 'casino research unavailable' });
  }
}));
app.get('/api/casino-coverage', wrap(async (req, res) => {
  try {
    const rows = await dbQuery(casinoPublicationCoverageSql());
    res.json({ coverage: summarizeCasinoPublicationCoverage(rows) });
  } catch {
    res.json({ coverage: null, error: 'casino coverage unavailable' });
  }
}));
app.get('/api/casino/:case_id', wrap(async (req, res) => {
  const caseId = String(req.params.case_id || '').trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(caseId)) {
    return res.status(400).json({ error: 'invalid case id' });
  }
  try {
    const rows = await dbQuery(`
      SELECT
        c.case_id, c.brand_name, c.entity_kind, c.product_subtype, c.legal_operator,
        c.parent_entity, c.primary_domain, c.launched, c.date_precision, c.custody_model,
        c.chains, c.product_scope_note, c.status, c.status_as_of, c.outcome_label,
        c.outcome_as_of, c.outcome_rule_id, c.token_status, c.token_symbol, c.token_name,
        c.token_contracts, c.token_launch_date, c.token_utility, c.token_fee_revenue_rights,
        c.token_supply, c.confidence, c.completeness_pct, c.unsourced_fields, c.last_reviewed,
        (SELECT COUNT(DISTINCT cl.source_id) FROM casino_claims cl
          WHERE cl.case_id = c.case_id) AS registered_source_count,
        (SELECT COUNT(DISTINCT cl.source_id) FROM casino_claims cl
          JOIN casino_sources s ON s.source_id = cl.source_id
          WHERE cl.case_id = c.case_id AND s.resolving = 1) AS reachable_source_count,
        (SELECT COUNT(DISTINCT cl.source_id) FROM casino_claims cl
          JOIN casino_sources s ON s.source_id = cl.source_id
          WHERE cl.case_id = c.case_id AND s.resolving = 1
            AND ${editorialReviewSql('s')}) AS reviewed_source_count,
        (SELECT COUNT(DISTINCT cl.source_id) FROM casino_claims cl
          JOIN casino_sources s ON s.source_id = cl.source_id
          WHERE cl.case_id = c.case_id AND s.resolving = 1
            AND ${editorialReviewSql('s')}) AS source_count
      FROM casino_cases c
      WHERE c.case_id = ? AND c.quality_passed = 1
      LIMIT 1
    `, [caseId]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'published casino dossier not found' });
    }
    const [claims, observations, events, licences, syntheses] = await Promise.all([
      dbQuery(`
        SELECT
          cl.claim_id, cl.field_path, cl.evidence_locator, cl.claim_type,
          cl.support_direction, cl.analyst_note, cl.checked_at,
          s.source_id, s.canonical_url AS url, s.title, s.publisher, s.published_at,
          s.accessed_at, s.source_tier, s.source_role, s.resolving,
          s.evidence_reviewed, s.evidence_reviewed_at, s.evidence_reviewer
        FROM casino_claims cl
        JOIN casino_sources s ON s.source_id = cl.source_id
        WHERE cl.case_id = ?
        ORDER BY cl.claim_id
      `, [caseId]),
      dbQuery(`SELECT * FROM casino_observations WHERE case_id = ? ORDER BY as_of DESC, metric_dimension ASC`, [caseId]),
      dbQuery(`SELECT * FROM casino_events WHERE case_id = ? ORDER BY event_date DESC`, [caseId]),
      dbQuery(`SELECT * FROM casino_licences WHERE case_id = ? ORDER BY as_of DESC`, [caseId]),
      dbQuery(`SELECT * FROM casino_syntheses WHERE case_id = ? LIMIT 1`, [caseId]),
    ]);
    const sources = [...new Map(claims.map((claim) => {
      const evidenceReviewer = String(claim.evidence_reviewer || '').trim() || null;
      const reviewTimestamp = String(claim.evidence_reviewed_at || '').trim() || null;
      const evidenceReviewedAt = isIsoReviewTimestamp(reviewTimestamp)
        ? reviewTimestamp
        : null;
      const evidenceReviewed = Number(claim.evidence_reviewed) === 1
        && Boolean(evidenceReviewer && evidenceReviewedAt);
      return [claim.source_id, {
        id: claim.source_id,
        title: claim.title,
        url: claim.url,
        publisher: claim.publisher,
        published_at: claim.published_at,
        accessed_at: claim.accessed_at,
        source_tier: claim.source_tier,
        source_role: claim.source_role,
        registered: true,
        resolving: Number(claim.resolving) === 1,
        reachable: Number(claim.resolving) === 1,
        evidence_reviewed: evidenceReviewed,
        evidence_reviewed_at: evidenceReviewedAt,
        evidence_reviewer: evidenceReviewer,
      }];
    })).values()];
    let synthesis = null;
    if (syntheses[0]) {
      const outlook = parseCasinoJson(syntheses[0].outlook, {});
      synthesis = {
        ...syntheses[0],
        outlook,
        lessons_learned: parseCasinoJson(syntheses[0].lessons_learned, []),
        source_claim_ids: parseCasinoJson(syntheses[0].source_claim_ids, []),
        // Casino waves store the shared causal contract inside the JSON outlook
        // column so older D1 schemas remain compatible. Hoist it at the public
        // boundary: the UI and agents consume one stable synthesis shape.
        forensic_analysis: outlook?.forensic_analysis || null,
      };
    }
    const publicationDepth = assessCasinoPublicationDepth({
      caseId,
      name: rows[0].brand_name,
      sources,
      claims,
      forensicAnalysis: synthesis?.forensic_analysis,
    });
    const unresolvedPaths = new Set(
      publicationDepth.unresolved_high_risk_claims.map(({ path }) => path),
    );
    const publicClaims = claims.map((claim) => ({
      ...claim,
      publication_support: unresolvedPaths.has(`casino_claims.${claim.claim_id}`)
        ? 'pending_independent_support'
        : null,
    }));
    const publicObservations = observations.map((item) => (
      casinoRecordWithPublicationSupport(item, unresolvedPaths, [
        'value',
        'window_definition',
        'method',
        'formula',
        'raw_input_ids',
      ])
    )).map((item) => ({
      ...item,
      chain_scope: parseCasinoJson(item.chain_scope, []),
      quality_flags: parseCasinoJson(item.quality_flags, []),
    }));
    const publicEvents = events.map((item) => (
      casinoRecordWithPublicationSupport(item, unresolvedPaths, [
        'event_type',
        'event_date',
        'amount_usd',
        'description',
      ])
    ));
    const publicLicences = licences.map((item) => (
      casinoRecordWithPublicationSupport(item, unresolvedPaths, [
        'authority',
        'licence_id',
        'legal_entity',
        'domains',
        'activities',
        'jurisdiction',
        'licence_status',
        'valid_from',
        'valid_until',
        'as_of',
        'notes',
      ])
    )).map((item) => ({
      ...item,
      domains: parseCasinoJson(item.domains, []),
      activities: parseCasinoJson(item.activities, []),
    }));
    const publicCase = publicCasinoCase(rows[0], claims, publicationDepth);
    const publicSynthesis = publicCasinoSynthesis(
      synthesis,
      publicationDepth,
    );
    publicCase.normalized_dossier = normalizedCasinoDossier(
      publicCase,
      publicSynthesis,
      publicClaims,
      sources,
    );
    res.json({
      case: publicCase, claims: publicClaims, sources,
      observations: publicObservations,
      events: publicEvents,
      licences: publicLicences,
      synthesis: publicSynthesis,
      publication_depth: publicationDepth,
    });
  } catch {
    res.status(502).json({ error: 'casino dossier unavailable' });
  }
}));

// Public evidence-governance status. This is intentionally separate from the
// live-market snapshot: a successful cron run only identifies dossiers due for
// review. It never promotes, rewrites, or "freshens" an analyst conclusion.
app.get('/api/forensics-refresh-status', wrap(async (req, res) => {
  let refresh = null;
  let refreshError = null;
  let proposalAgent = null;
  let proposalAgentLastCompleted = null;
  let proposalAgentError = null;
  try {
    const rows = await dbQuery(
      `SELECT run_id, scheduled_at, completed_at, status,
              scanned_nft, due_nft, scanned_exchange, due_exchange,
              scanned_casino, due_casino, scanned_chain, due_chain, notes
         FROM forensic_refresh_runs
        ORDER BY run_id DESC LIMIT 1`,
    );
    refresh = rows[0] || null;
  } catch {
    refreshError = 'forensic refresh status unavailable';
  }
  try {
    const rows = await dbQuery(
      `SELECT run_id, started_at, completed_at, status, proposals_queued
         FROM research_desk_runs
        ORDER BY started_at DESC, run_id DESC LIMIT 1`,
    );
    proposalAgent = rows[0] || null;
    const completedRows = await dbQuery(
      `SELECT run_id, started_at, completed_at, status, proposals_queued
         FROM research_desk_runs
        WHERE status = 'completed'
        ORDER BY completed_at DESC, run_id DESC LIMIT 1`,
    );
    proposalAgentLastCompleted = completedRows[0] || null;
  } catch {
    proposalAgentError = 'proposal research status unavailable';
  }
  res.json({
    refresh,
    proposal_agent: proposalAgent,
    proposal_agent_last_completed: proposalAgentLastCompleted,
    refresh_freshness: forensicRefreshFreshness(refresh),
    proposal_agent_freshness: proposalAgentFreshness(proposalAgent),
    server_time: new Date().toISOString(),
    cadence: 'six_hours',
    promotion_policy: 'human_review_required',
    ...(refreshError ? { error: refreshError } : {}),
    ...(proposalAgentError ? { proposal_agent_error: proposalAgentError } : {}),
  });
}));

// Shared outlook/trend vocabulary for analyst refreshes and local-SLM exports.
// This endpoint is intentionally source-backed metadata, not an automated
// rewrite of any dossier conclusion.
app.get('/api/trend-taxonomy', wrap((req, res) => {
  res.json(trendTaxonomyPayload());
}));

app.get('/api/slm/training-schema', wrap((req, res) => {
  res.json(slmTrainingSchemaPayload());
}));

// Canonical entity-profile boundary. Existing vertical endpoints remain
// unchanged; this read-only adapter gives the SPA one versioned shape while the
// legacy rows are migrated. It never recursively converts objects into prose:
// structured values stay under extensions.legacy_unmapped and every missing
// section/citation remains an explicit validation gap.
const PROFILE_ENTITY_TYPES = new Set(ENTITY_TYPES);

function profileJson(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function profileProse(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value?.summary === 'string' && value.summary.trim()) return value.summary.trim();
  }
  return null;
}

function profileIso(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const sqlTimestamp = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(trimmed);
  if (sqlTimestamp) return `${sqlTimestamp[1]}T${sqlTimestamp[2]}Z`;
  return Number.isFinite(Date.parse(trimmed)) ? trimmed : null;
}

function latestProfileDate(...values) {
  return values.map(profileIso).filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
}

function profileSourceValues(...values) {
  const seen = new Set();
  const sources = [];
  for (const value of values) {
    const parsed = profileJson(value, []);
    for (const source of Array.isArray(parsed) ? parsed : []) {
      const url = typeof source === 'string' ? source : source?.url || source?.canonical_url;
      const key = String(url || JSON.stringify(source));
      if (!key || seen.has(key)) continue;
      seen.add(key);
      sources.push(source);
    }
  }
  return sources;
}

function profileFreshness(profile, row = {}, extra = {}) {
  const forensicReview = profileJson(profile?.forensic_analysis?.review, {});
  const lastReviewed = latestProfileDate(
    extra.last_reviewed_at,
    profile?.evidence_policy?.last_verified_at,
    profile?.evidence_policy?.status_as_of,
    forensicReview.last_verified_at,
    forensicReview.reviewed_at,
    row.last_reviewed,
    row.updated_at,
  );
  const nextReview = latestProfileDate(
    extra.next_review_at,
    profile?.evidence_policy?.next_review_at,
    forensicReview.next_review_at,
  );
  let state = 'unknown';
  if (nextReview) state = Date.parse(nextReview) < Date.now() ? 'review_due' : 'current';
  return {
    state,
    last_reviewed_at: lastReviewed,
    next_review_at: nextReview,
    field_reviews: [],
  };
}

function profileMetric(type, values) {
  if (!METRIC_DIMENSIONS[type]?.includes(values.dimension)) return null;
  const value = Number(values.value);
  if (!Number.isFinite(value)) return null;
  return {
    id: values.id,
    dimension: values.dimension,
    label: values.label,
    value,
    unit: values.unit,
    currency: values.currency ?? null,
    window: {
      start: values.window_start ?? null,
      end: values.window_end ?? null,
      definition: values.window_definition || 'point_in_time',
    },
    as_of: profileIso(values.as_of),
    method: values.method || 'observed',
    scope: values.scope || { product: null, chains: [] },
    formula: values.formula ?? null,
    raw_input_ids: Array.isArray(values.raw_input_ids) ? values.raw_input_ids : [],
    claim_ids: Array.isArray(values.claim_ids) ? values.claim_ids : [],
    quality_flags: Array.isArray(values.quality_flags) ? values.quality_flags : [],
  };
}

function profileCandidate(input) {
  return buildLegacyEntityProfile({
    ...input,
    sources: profileSourceValues(...(input.source_values || [])),
  });
}

async function blockchainEntityProfile(slug) {
  const rows = await dbQuery(
    `SELECT * FROM (
       SELECT chain, chain AS name, 'dead_chains' AS legacy_origin, launched,
              verdict AS outcome_label, why AS narrative, outlook, profile,
              sources, updated_at, 1 AS priority
         FROM dead_chains
       UNION ALL
       SELECT chain, chain, 'mid_chains', launched, verdict, why_stuck, outlook,
              profile, sources, updated_at, 2
         FROM mid_chains
       UNION ALL
       SELECT chain, chain, 'chain_analysis', NULL, sentiment, take, NULL,
              profile, sources, updated_at, 3
         FROM chain_analysis
     ) WHERE lower(chain) = ? OR lower(replace(chain, ' ', '-')) = ?
       ORDER BY priority LIMIT 1`,
    [slug, slug],
  );
  if (!rows[0]) return null;
  const row = rows[0];
  const legacy = profileJson(row.profile, {});
  const facts = await chainFacts(row.chain) || {};
  const metaRows = await dbQuery(
    `SELECT data, sources, updated_at FROM chain_facts
      WHERE lower(chain) = ? AND dimension = '_meta' LIMIT 1`,
    [slug],
  );
  const meta = profileJson(metaRows[0]?.data, {});
  const identity = facts.identity?.data || {};
  const narrative = facts.narrative?.data || {};
  const synthesis = facts.synthesis?.data || {};
  const forensic = profileJson(synthesis.forensic_analysis, {});
  const onchain = facts.onchain?.data || {};
  const token = facts.token?.data || {};
  const asOf = latestProfileDate(
    synthesis.as_of, narrative.as_of, onchain.as_of, token.as_of,
    meta.last_reviewed, metaRows[0]?.updated_at, row.updated_at,
  );
  const metrics = [
    profileMetric('blockchain', { id: `blockchain:${slug}:tvl`, dimension: 'tvl', label: 'TVL', value: onchain.tvl_current_usd, unit: 'usd', currency: 'USD', as_of: onchain.as_of }),
    profileMetric('blockchain', { id: `blockchain:${slug}:stablecoins`, dimension: 'stablecoin_supply', label: 'Stablecoin supply', value: onchain.stablecoin_tvl_usd, unit: 'usd', currency: 'USD', as_of: onchain.as_of }),
    profileMetric('blockchain', { id: `blockchain:${slug}:dex-volume-24h`, dimension: 'dex_spot_volume', label: 'DEX spot volume (24h)', value: onchain.spot_dex_volume_24h_usd, unit: 'usd', currency: 'USD', as_of: onchain.as_of, window_definition: 'rolling_24h' }),
    profileMetric('blockchain', { id: `blockchain:${slug}:fees-30d`, dimension: 'fees', label: 'Fees (30d)', value: onchain.fees_30d_usd, unit: 'usd', currency: 'USD', as_of: onchain.as_of, window_definition: 'rolling_30d' }),
    profileMetric('blockchain', { id: `blockchain:${slug}:revenue-30d`, dimension: 'protocol_revenue', label: 'Protocol revenue (30d)', value: onchain.revenue_30d_usd, unit: 'usd', currency: 'USD', as_of: onchain.as_of, window_definition: 'rolling_30d' }),
    profileMetric('blockchain', { id: `blockchain:${slug}:token-price`, dimension: 'token_price', label: 'Token price', value: token.token_current_usd, unit: 'usd', currency: 'USD', as_of: token.as_of }),
    profileMetric('blockchain', { id: `blockchain:${slug}:token-market-cap`, dimension: 'token_market_cap', label: 'Token market cap', value: token.market_cap_usd, unit: 'usd', currency: 'USD', as_of: token.as_of }),
  ].filter(Boolean);
  return profileCandidate({
    identity: {
      id: `blockchain:${slug}`, type: 'blockchain', slug,
      name: identity.chain || row.name,
      aliases: Array.isArray(identity.aliases) ? identity.aliases : [],
    },
    classification: {
      subtype: identity.category || null,
      tags: Array.isArray(identity.tags) ? identity.tags : [],
      chains: [], jurisdictions: [],
    },
    outcome: {
      label: forensic.outcome?.label || row.outcome_label || null,
      as_of: forensic.outcome?.as_of || asOf,
      rule_id: forensic.outcome?.label ? 'forensic-analysis-v1' : 'legacy-lifecycle',
      confidence: forensic.outcome?.confidence || meta.confidence || null,
      claim_ids: [],
    },
    sections: {
      what_it_is: profileProse(narrative.purpose, legacy.what_it_does, legacy.purpose),
      what_happened: profileProse(synthesis.situation, legacy.situation, row.narrative),
      why_this_outcome: profileProse(forensic.why, synthesis.success_mechanism, synthesis.postmortem, legacy.postmortem),
      strategic_choices: forensic.strategic_choices,
      operating_model: profileProse(legacy.operating_model, legacy.business_model),
      token_and_value_capture: profileProse(token.value_capture, legacy.token_value_capture),
      counterfactual: profileProse(forensic.counterfactual, synthesis.could_differ, legacy.could_differ),
      risks_and_unknowns: profileProse(legacy.risks, legacy.unknowns),
      lifecycle: profileProse(legacy.lifecycle),
      outlook_and_watch: synthesis.outlook || legacy.outlook || row.outlook,
    },
    as_of: asOf,
    metrics,
    source_values: [
      row.sources, legacy.sources, metaRows[0]?.sources,
      ...Object.values(facts).map((fact) => fact?.sources),
    ],
    freshness: {
      state: meta.next_review_at
        ? (Date.parse(meta.next_review_at) < Date.now() ? 'review_due' : 'current')
        : 'unknown',
      last_reviewed_at: profileIso(meta.last_reviewed) || asOf,
      next_review_at: profileIso(meta.next_review_at),
      field_reviews: [],
    },
    confidence: meta.confidence || 'unknown',
    extensions: {
      legacy_origin: row.legacy_origin,
      category_data: { identity, narrative, onchain, token },
      structured_analysis: { outlook: synthesis.outlook || null, strategic_choices: forensic.strategic_choices || null },
    },
  });
}

async function exchangeEntityProfile(type, slug) {
  const rows = await dbQuery(
    `SELECT * FROM (
       SELECT slug, kind, 'dead' AS lifecycle, venue_type, name, launched,
              NULL AS primary_chain, verdict AS status, metric_label, metric_type,
              metric_unit, current_metric AS metric, peak_metric, drawdown_pct,
              collapse_date AS event_date, why AS summary, outlook, profile,
              sources, updated_at
         FROM dead_exchanges
       UNION ALL
       SELECT slug, kind, 'mid', venue_type, name, launched, NULL, verdict,
              metric_label, metric_type, metric_unit, metric, NULL, NULL, NULL,
              why_stuck, outlook, profile, sources, updated_at
         FROM mid_exchanges
       UNION ALL
       SELECT slug, type, 'successful', venue_type, name, launched, primary_chain,
              status, metric_label, metric_type, metric_unit, metric, NULL, NULL,
              NULL, why_successful, outlook, profile, sources, updated_at
         FROM successful_exchanges
     ) WHERE kind = ? AND lower(slug) = ? LIMIT 1`,
    [type, slug],
  );
  if (!rows[0]) return null;
  const embeddedProfile = embeddedCanonicalEntityProfile(rows[0].profile, { type, slug });
  if (embeddedProfile) return embeddedProfile;
  const normalized = normalizeExchangeCase(rows[0]);
  const sources = publicationSourceRecords(profileSourceValues(rows[0].sources, normalized.profile?.sources));
  const depth = assessExchangePublicationDepth({
    kind: normalized.kind,
    lifecycle: normalized.lifecycle,
    slug: normalized.slug,
    name: normalized.name,
    sources,
    forensicAnalysis: normalized.analysis?.forensic_analysis || normalized.profile?.forensic_analysis,
  });
  const publicRow = publicExchangeCase({ ...normalized, sources, publication_depth: depth });
  const profile = publicRow.profile || {};
  const forensic = publicRow.analysis?.forensic_analysis || profile.forensic_analysis || {};
  const asOf = latestProfileDate(
    publicRow.analysis?.metric?.as_of,
    forensic.review?.last_verified_at,
    publicRow.updated_at,
  );
  const metric = profileMetric(type, {
    id: `${type}:${slug}:${publicRow.metric_type || 'metric'}`,
    dimension: publicRow.metric_type,
    label: publicRow.metric_label,
    value: publicRow.metric,
    unit: publicRow.metric_unit,
    currency: publicRow.metric_unit === 'usd' ? 'USD' : null,
    as_of: publicRow.analysis?.metric?.as_of || asOf,
    window_definition: publicRow.analysis?.metric?.window,
  });
  return profileCandidate({
    identity: { id: `${type}:${slug}`, type, slug, name: publicRow.name, aliases: [] },
    classification: {
      subtype: publicRow.analysis?.product_cohort || publicRow.venue_type || null,
      tags: [],
      chains: publicRow.analysis?.chains || (publicRow.primary_chain ? [publicRow.primary_chain] : []),
      jurisdictions: [],
    },
    outcome: {
      label: publicRow.status == null ? null : publicRow.lifecycle,
      as_of: publicRow.status == null ? null : asOf,
      rule_id: publicRow.status == null ? null : 'legacy-lifecycle',
      confidence: publicRow.analysis?.data_quality?.label === 'verified' ? 'high' : 'unknown',
      claim_ids: [],
    },
    sections: {
      what_it_is: profileProse(profile.purpose, profile.what_it_does),
      what_happened: profileProse(publicRow.summary),
      why_this_outcome: profileProse(forensic.why, profile.why, profile.success_factors),
      strategic_choices: forensic.strategic_choices || profile.strategic_choices,
      operating_model: profileProse(publicRow.analysis?.operating_model, profile.operating_model),
      token_and_value_capture: profileProse(publicRow.analysis?.token?.strategy, profile.token_value_capture),
      counterfactual: profileProse(forensic.counterfactual, profile.counterfactual, profile.could_differ),
      risks_and_unknowns: profileProse(profile.risks, profile.risk_factors, forensic.unknowns),
      lifecycle: profileProse(profile.synthesis),
      outlook_and_watch: profileProse(publicRow.outlook, forensic.watch),
    },
    as_of: asOf,
    metrics: metric ? [metric] : [],
    source_values: [sources],
    freshness: profileFreshness(profile, publicRow, publicRow.analysis?.freshness),
    extensions: {
      legacy_origin: `${publicRow.lifecycle}_exchanges`,
      publication_depth: depth,
      publication_support: publicRow.publication_support,
      structured_analysis: {
        strategic_choices: forensic.strategic_choices || null,
        token: publicRow.analysis?.token || null,
      },
    },
  });
}

async function nftEntityProfile(type, slug) {
  const rows = await dbQuery(
    `SELECT slug, name, chain, category, status, profile, sources, updated_at
       FROM nft_collections WHERE lower(slug) = ? LIMIT 1`,
    [slug],
  );
  if (!rows[0]) return null;
  const row = rows[0];
  const isOrdinals = String(row.chain || '').toLowerCase().includes('ordinals');
  if ((type === 'ordinals_collection') !== isOrdinals) return null;
  const embeddedProfile = embeddedCanonicalEntityProfile(row.profile, { type, slug });
  if (embeddedProfile) return embeddedProfile;
  const rawProfile = profileJson(row.profile, {});
  const sources = publicationSourceRecords(profileSourceValues(row.sources, rawProfile.sources));
  const depth = assessNftPublicationDepth({
    slug: row.slug, name: row.name, sources, profile: rawProfile,
  });
  const profile = publicNftProfile(rawProfile, depth);
  const freshness = forensicFreshness(rawProfile);
  const lifecyclePending = hasPublicationDepthGap(depth, ({ path, type: claimType }) => (
    claimType === 'lifecycle' || path === 'forensic_analysis.outcome'
  ));
  const asOf = latestProfileDate(
    profile.evidence_policy?.status_as_of,
    profile.evidence_policy?.last_verified_at,
    row.updated_at,
  );
  const projection = projectFieldCitedNftProfile({
    slug,
    profile,
    structuredProfile: rawProfile,
    sources,
    asOf,
  });
  const metricClaimFields = {
    supply: 'profile.evidence.supply_or_mint',
  };
  const claimIdByPath = new Map(projection.claims.map((claim) => [claim.field_path, claim.id]));
  const lifecycleEvidence = (Array.isArray(profile.evidence) ? profile.evidence : [])
    .find((item) => item?.field === 'lifecycle_status'
      && typeof item.value === 'string' && item.value.trim());
  const lifecycleClaimId = claimIdByPath.get('profile.evidence.lifecycle_status');
  const lifecycleSupported = !lifecyclePending && lifecycleEvidence && lifecycleClaimId;
  const metricSpecs = [
    ['secondary_volume_usd', 'secondary_volume', 'Secondary volume', 'usd'],
    ['mint_raise_usd', 'mint_raise', 'Mint raise', 'usd'],
    ['royalties_earned_usd', 'royalties', 'Royalties earned', 'usd'],
    ['holder_count', 'holders', 'Holders', 'count'],
    ['supply', 'supply', 'Supply', 'count'],
  ];
  const metrics = metricSpecs.map(([field, dimension, label, unit]) => profileMetric(type, {
    id: `${type}:${slug}:${dimension}`,
    dimension, label, value: profile[field], unit,
    currency: unit === 'usd' ? 'USD' : null,
    as_of: asOf,
    claim_ids: metricClaimFields[dimension]
      && claimIdByPath.has(metricClaimFields[dimension])
      ? [claimIdByPath.get(metricClaimFields[dimension])]
      : [],
  })).filter((metric) => metric && metric.claim_ids.length > 0);
  const forensic = profile.forensic_analysis || {};
  return profileCandidate({
    identity: { id: `${type}:${slug}`, type, slug, name: row.name, aliases: [] },
    classification: { subtype: row.category || null, tags: [], chains: row.chain ? [row.chain] : [], jurisdictions: [] },
    outcome: {
      label: lifecycleSupported ? row.status : null,
      as_of: lifecycleSupported ? profileIso(lifecycleEvidence.as_of) : null,
      rule_id: lifecycleSupported ? 'nft-lifecycle-v1' : null,
      confidence: null,
      claim_ids: lifecycleSupported ? [lifecycleClaimId] : [],
    },
    sections: Object.keys(projection.sections).length ? projection.sections : {
      what_it_is: profileProse(profile.collection_description, profile.business),
      what_happened: profileProse(profile.community_history, profile.analysis),
      why_this_outcome: profileProse(forensic.why, profile.why, profile.risks),
      strategic_choices: forensic.strategic_choices || profile.strategic_choices,
      operating_model: profileProse(profile.business, profile.benefits),
      token_and_value_capture: profileProse(profile.token_model),
      counterfactual: profileProse(forensic.counterfactual, profile.counterfactual),
      risks_and_unknowns: profileProse(profile.risks, profile.unknowns),
      lifecycle: profileProse(profile.analysis),
      outlook_and_watch: profileProse(profile.outlook, forensic.watch, profile.watch),
    },
    section_dates: projection.section_dates,
    section_claim_ids: projection.section_claim_ids,
    as_of: asOf,
    metrics,
    claims: projection.claims,
    source_values: [sources],
    freshness: {
      state: freshness?.state || 'unknown',
      last_reviewed_at: profileIso(profile.evidence_policy?.last_verified_at) || asOf,
      next_review_at: profileIso(profile.evidence_policy?.next_review_at),
      field_reviews: [],
    },
    extensions: {
      legacy_origin: 'nft_collections',
      publication_depth: depth,
      publication_support: profile.publication_support || {},
      rich_profile_projection: projection.retain_rich_depth,
      evidence: Array.isArray(profile.evidence) ? profile.evidence : [],
      structured_analysis: { strategic_choices: forensic.strategic_choices || null },
    },
  });
}

async function casinoEntityProfile(slug) {
  const cases = await dbQuery(
    `SELECT * FROM casino_cases
      WHERE lower(case_id) = ? AND quality_passed = 1 LIMIT 1`,
    [slug],
  );
  if (!cases[0]) return null;
  const row = cases[0];
  const [syntheses, evidenceRows, observations, events] = await Promise.all([
    dbQuery(`SELECT * FROM casino_syntheses WHERE case_id = ? LIMIT 1`, [row.case_id]),
    dbQuery(
      `SELECT cl.*, s.canonical_url AS url, s.archive_url, s.title, s.publisher,
              s.published_at, s.accessed_at, s.source_tier, s.source_role,
              s.resolving, s.evidence_reviewed, s.evidence_reviewed_at,
              s.evidence_reviewer
         FROM casino_claims cl JOIN casino_sources s ON s.source_id = cl.source_id
        WHERE cl.case_id = ? ORDER BY cl.claim_id`,
      [row.case_id],
    ),
    dbQuery(`SELECT * FROM casino_observations WHERE case_id = ? ORDER BY as_of DESC`, [row.case_id]),
    dbQuery(`SELECT * FROM casino_events WHERE case_id = ? ORDER BY event_date DESC`, [row.case_id]),
  ]);
  const rawSynthesis = syntheses[0] || {};
  const outlook = profileJson(rawSynthesis.outlook, {});
  const sources = [...new Map(evidenceRows.map((evidence) => [evidence.source_id, {
    id: evidence.source_id,
    title: evidence.title,
    url: evidence.url,
    publisher: evidence.publisher,
    published_at: evidence.published_at,
    accessed_at: evidence.accessed_at,
    archive_url: evidence.archive_url,
    tier: evidence.source_tier,
    role: evidence.source_role,
    access_state: Number(evidence.resolving) === 1 ? 'reachable' : (evidence.archive_url ? 'archived' : 'unreachable'),
    checked_at: evidence.checked_at || evidence.accessed_at,
    content_hash: null,
  }])).values()];
  const claims = evidenceRows.map((evidence) => {
    const reviewed = Number(evidence.evidence_reviewed) === 1
      && isIsoReviewTimestamp(evidence.evidence_reviewed_at)
      && String(evidence.evidence_reviewer || '').trim();
    return {
      id: evidence.claim_id,
      field_path: evidence.field_path,
      source_ids: [evidence.source_id],
      evidence_locator: evidence.evidence_locator,
      support_direction: evidence.support_direction,
      note: evidence.analyst_note || null,
      review: {
        state: reviewed ? 'reviewed' : 'pending',
        reviewer: reviewed ? evidence.evidence_reviewer : null,
        reviewed_at: reviewed ? evidence.evidence_reviewed_at : null,
      },
    };
  });
  const depth = assessCasinoPublicationDepth({
    caseId: row.case_id,
    name: row.brand_name,
    sources,
    claims: evidenceRows,
    forensicAnalysis: outlook.forensic_analysis,
  });
  const publicCase = publicCasinoCase(row, evidenceRows, depth);
  const publicSynthesis = publicCasinoSynthesis({
    ...rawSynthesis,
    outlook,
    forensic_analysis: outlook.forensic_analysis || null,
  }, depth) || {};
  const asOf = latestProfileDate(publicCase.status_as_of, publicCase.outcome_as_of, publicCase.last_reviewed, rawSynthesis.reviewed_at);
  const metrics = observations.map((observation) => profileMetric('web3_casino', {
    id: observation.observation_id,
    dimension: observation.metric_dimension,
    label: String(observation.metric_dimension || '').replaceAll('_', ' '),
    value: observation.value,
    unit: observation.unit,
    currency: observation.currency,
    window_start: observation.window_start,
    window_end: observation.window_end,
    window_definition: observation.window_definition,
    as_of: observation.as_of,
    method: observation.method,
    scope: { product: observation.product_scope, chains: profileJson(observation.chain_scope, []) },
    formula: observation.formula,
    raw_input_ids: profileJson(observation.raw_input_ids, []),
    claim_ids: profileJson(observation.source_claim_ids, []),
    quality_flags: profileJson(observation.quality_flags, []),
  })).filter(Boolean);
  const canonicalEvents = events.map((event) => ({
    id: event.event_id,
    type: event.event_type,
    date: event.event_date,
    date_precision: event.date_precision,
    amount_usd: event.amount_usd,
    description: event.description,
    claim_ids: profileJson(event.source_claim_ids, []),
  }));
  return buildLegacyEntityProfile({
    identity: { id: `web3_casino:${slug}`, type: 'web3_casino', slug, name: publicCase.brand_name, aliases: [] },
    classification: {
      subtype: publicCase.product_subtype,
      tags: [publicCase.entity_kind].filter(Boolean),
      chains: profileJson(publicCase.chains, []),
      jurisdictions: [],
    },
    status: {
      operating_state: publicCase.status,
      as_of: publicCase.status_as_of,
      claim_ids: claims.filter((claim) => /(^|\.)status$/.test(claim.field_path)).map((claim) => claim.id),
    },
    outcome: {
      label: publicCase.outcome_label,
      as_of: publicCase.outcome_as_of,
      rule_id: publicCase.outcome_rule_id,
      confidence: publicCase.confidence,
      claim_ids: claims.filter((claim) => claim.field_path.includes('outcome')).map((claim) => claim.id),
    },
    sections: {
      what_it_is: profileProse(publicCase.product_scope_note),
      what_happened: profileProse(publicSynthesis.present_situation),
      why_this_outcome: profileProse(publicSynthesis.success_failure_hypotheses, publicSynthesis.forensic_analysis?.why),
      strategic_choices: publicSynthesis.forensic_analysis?.strategic_choices,
      operating_model: profileProse(publicSynthesis.business_mechanism, publicSynthesis.chain_dependence),
      token_and_value_capture: profileProse(publicSynthesis.token_contribution),
      counterfactual: profileProse(publicSynthesis.counterfactual, publicSynthesis.forensic_analysis?.counterfactual),
      risks_and_unknowns: profileProse(publicSynthesis.risk_legal_posture),
      lifecycle: profileProse(publicSynthesis.present_situation),
      outlook_and_watch: publicSynthesis.outlook || publicSynthesis.forensic_analysis?.watch,
    },
    as_of: asOf,
    section_claim_ids: Object.fromEntries(
      ['what_it_is', 'what_happened', 'why_this_outcome', 'operating_model', 'token_and_value_capture', 'counterfactual', 'risks_and_unknowns', 'lifecycle']
        .map((key) => [key, profileJson(rawSynthesis.source_claim_ids, [])]),
    ),
    metrics,
    events: canonicalEvents,
    sources,
    claims,
    freshness: profileFreshness(outlook, publicCase, { last_reviewed_at: rawSynthesis.reviewed_at }),
    confidence: publicCase.confidence || 'unknown',
    extensions: {
      legacy_origin: 'casino_cases',
      publication_depth: depth,
      licences: [],
      structured_analysis: { outlook: publicSynthesis.outlook || null, strategic_choices: publicSynthesis.forensic_analysis?.strategic_choices || null },
    },
  });
}

async function simpleEntityProfile(type, slug) {
  let rows = [];
  const marketType = {
    crypto_treasury: 'treasury',
    miner: 'miner',
    etf: 'etf',
  }[type];
  if (marketType) {
    rows = await dbQuery(
      `SELECT slug, name, ticker AS symbol, type AS category, status, profile,
              sources, updated_at, 'market_entities' AS legacy_origin
         FROM market_entities WHERE type = ? AND lower(slug) = ? LIMIT 1`,
      [marketType, slug],
    );
  } else if (type === 'stablecoin') {
    rows = await dbQuery(
      `SELECT slug, name, symbol, NULL AS category, NULL AS status, profile,
              sources, updated_at, 'stablecoin_meta' AS legacy_origin
         FROM stablecoin_meta WHERE lower(slug) = ? OR lower(symbol) = ? LIMIT 1`,
      [slug, slug],
    );
  } else if (type === 'infrastructure_network') {
    rows = await dbQuery(
      `SELECT slug, name, NULL AS symbol, category, status, profile, sources,
              updated_at, 'infra_chains' AS legacy_origin
         FROM infra_chains WHERE lower(slug) = ? LIMIT 1`,
      [slug],
    );
  } else {
    rows = await dbQuery(
      `SELECT slug, name, NULL AS symbol, category, status, profile, sources,
              updated_at, 'rwa_depin' AS legacy_origin
         FROM rwa_depin WHERE lower(slug) = ? LIMIT 1`,
      [slug],
    );
  }
  if (!rows[0]) return null;
  const row = rows[0];
  const isRwa = String(row.category || '').startsWith('rwa-');
  const isDepin = String(row.category || '').startsWith('depin-');
  if ((type === 'rwa' && !isRwa) || (type === 'depin' && !isDepin)) return null;
  const profile = profileJson(row.profile, {});
  const canonicalSource = profileJson(profile.canonical_profile, {});
  const hasCanonicalSource = canonicalSource.schema === 'chaindump-entity-profile-source'
    && Number(canonicalSource.version) === 1;
  const asOf = latestProfileDate(profile.evidence_policy?.last_verified_at, row.updated_at);
  const sections = hasCanonicalSource ? canonicalSource.sections : marketType ? {
    what_it_is: profileProse(profile.background),
    what_happened: profileProse(profile.recent_moves, profile.recent_flows),
    why_this_outcome: profileProse(profile.analysis),
    strategic_choices: null,
    operating_model: profileProse(profile.strategy, profile.hodl_vs_sell),
    token_and_value_capture: null,
    counterfactual: null,
    risks_and_unknowns: profileProse(profile.dilution_risk, profile.notes),
    lifecycle: null,
    outlook_and_watch: profileProse(profile.outlook),
  } : type === 'stablecoin' ? {
    what_it_is: profileProse(profile.notes),
    what_happened: profileProse(profile.issuer_background),
    why_this_outcome: null,
    strategic_choices: null,
    operating_model: profileProse(profile.backing),
    token_and_value_capture: profileProse(profile.yield),
    counterfactual: null,
    risks_and_unknowns: profileProse(profile.risks),
    lifecycle: null,
    outlook_and_watch: profileProse(profile.future, profile.outlook),
  } : type === 'infrastructure_network' ? {
    what_it_is: profileProse(profile.what_it_does),
    what_happened: profileProse(profile.adoption),
    why_this_outcome: null,
    strategic_choices: null,
    operating_model: profileProse(profile.how_it_works),
    token_and_value_capture: profileProse(profile.economics),
    counterfactual: null,
    risks_and_unknowns: profileProse(profile.non_economic),
    lifecycle: null,
    outlook_and_watch: profileProse(profile.outlook),
  } : {
    what_it_is: profileProse(profile.what_it_does),
    what_happened: profileProse(profile.traction),
    why_this_outcome: null,
    strategic_choices: null,
    operating_model: profileProse(profile.how_it_works, profile.business_model),
    token_and_value_capture: profileProse(profile.business_model),
    counterfactual: null,
    risks_and_unknowns: null,
    lifecycle: null,
    outlook_and_watch: profileProse(profile.outlook),
  };
  return profileCandidate({
    identity: {
      id: `${type}:${row.slug}`,
      type,
      slug: row.slug,
      name: row.name,
      aliases: row.symbol ? [row.symbol] : [],
    },
    classification: hasCanonicalSource ? canonicalSource.classification : {
      subtype: row.category || profile.type || null,
      tags: [],
      chains: [],
      jurisdictions: [],
    },
    status: hasCanonicalSource ? canonicalSource.status : undefined,
    outcome: hasCanonicalSource ? canonicalSource.outcome : {
      label: row.status || profile.status || null,
      as_of: row.status || profile.status ? asOf : null,
      rule_id: row.status || profile.status ? 'legacy-status' : null,
      confidence: null,
      claim_ids: [],
    },
    sections,
    as_of: hasCanonicalSource
      ? latestProfileDate(...Object.values(canonicalSource.section_dates || {}), asOf)
      : asOf,
    section_dates: hasCanonicalSource ? canonicalSource.section_dates : undefined,
    section_claim_ids: hasCanonicalSource ? canonicalSource.section_claim_ids : undefined,
    metrics: hasCanonicalSource && Array.isArray(canonicalSource.metrics)
      ? canonicalSource.metrics
      : [],
    events: hasCanonicalSource && Array.isArray(canonicalSource.events)
      ? canonicalSource.events
      : [],
    claims: hasCanonicalSource && Array.isArray(canonicalSource.claims)
      ? canonicalSource.claims
      : [],
    source_values: [row.sources, profile.sources],
    freshness: hasCanonicalSource
      ? canonicalSource.freshness
      : profileFreshness(profile, row),
    confidence: hasCanonicalSource ? canonicalSource.confidence : undefined,
    extensions: {
      ...(hasCanonicalSource && canonicalSource.extensions
        && typeof canonicalSource.extensions === 'object'
        ? canonicalSource.extensions
        : {}),
      legacy_origin: row.legacy_origin,
      category_data: Object.fromEntries(Object.entries(profile).filter(
        ([key]) => !['sources', 'canonical_profile'].includes(key),
      )),
    },
  });
}

async function resolveEntityProfile(entityType, slug) {
  switch (entityType) {
    case 'blockchain': return blockchainEntityProfile(slug);
    case 'dex': return exchangeEntityProfile('dex', slug);
    case 'cex': return exchangeEntityProfile('cex', slug);
    case 'nft_collection': return nftEntityProfile('nft_collection', slug);
    case 'ordinals_collection': return nftEntityProfile('ordinals_collection', slug);
    case 'web3_casino': return casinoEntityProfile(slug);
    case 'stablecoin': return simpleEntityProfile('stablecoin', slug);
    case 'rwa': return simpleEntityProfile('rwa', slug);
    case 'depin': return simpleEntityProfile('depin', slug);
    case 'infrastructure_network': return simpleEntityProfile('infrastructure_network', slug);
    case 'crypto_treasury': return simpleEntityProfile('crypto_treasury', slug);
    case 'miner': return simpleEntityProfile('miner', slug);
    case 'etf': return simpleEntityProfile('etf', slug);
    default: return null;
  }
}

app.get('/api/profile-contract', wrap((req, res) => {
  res.json(entityProfileContract());
}));

app.get('/api/profile/:entity_type/:slug', wrap(async (req, res) => {
  const entityType = String(req.params.entity_type || '').trim().toLowerCase();
  const slug = String(req.params.slug || '').trim().toLowerCase();
  if (!PROFILE_ENTITY_TYPES.has(entityType) || !/^[a-z0-9._-]+$/.test(slug)) {
    return res.status(400).json({ error: 'invalid profile identifier' });
  }
  try {
    const profile = await resolveEntityProfile(entityType, slug);
    if (!profile) return res.status(404).json({ error: 'profile not found' });
    res.setHeader('cache-control', 'public, max-age=300');
    return res.json(profile);
  } catch (error) {
    console.error('[entity-profile] lookup failed:', error?.message || error);
    return res.status(502).json({ error: 'profile unavailable' });
  }
}));

// Decentralized storage / document-verification infrastructure
app.get('/api/infra', wrap(async (req, res) => {
  try {
    const rows = await dbQuery(`SELECT slug, name, category, status, profile, sources, updated_at FROM infra_chains ORDER BY name`);
    const chains = rows.map((r) => { let p = null; try { p = r.profile ? JSON.parse(r.profile) : null; } catch (e) {} return { ...r, profile: p }; });
    let analysis = null;
    try { const m = await dbQuery(`SELECT v, updated_at FROM graveyard_meta WHERE k='infra_analysis' LIMIT 1`); if (m[0]) analysis = { text: m[0].v, updated_at: m[0].updated_at }; } catch (e) {}
    const catCounts = {};
    chains.forEach((c) => { const k = (c.category || 'other').toLowerCase(); catCounts[k] = (catCounts[k] || 0) + 1; });
    res.json({ chains, count: chains.length, analysis, catCounts });
  } catch (e) {
    res.json({ chains: [], count: 0, error: e.message });
  }
}));

// TradFi bridge: treasury companies, miners, crypto ETFs
app.get('/api/markets', wrap(async (req, res) => {
  try {
    const rows = await dbQuery(`SELECT slug, name, ticker, type, status, profile, sources, updated_at FROM market_entities ORDER BY type, name`);
    const entities = rows.map((r) => { let p = null; try { p = r.profile ? JSON.parse(r.profile) : null; } catch (e) {} return { ...r, profile: p }; });
    let analysis = null;
    try { const m = await dbQuery(`SELECT v, updated_at FROM graveyard_meta WHERE k='markets_analysis' LIMIT 1`); if (m[0]) analysis = { text: m[0].v, updated_at: m[0].updated_at }; } catch (e) {}
    const byType = { treasury: [], miner: [], etf: [] };
    entities.forEach((e) => { const t = (e.type || '').toLowerCase(); if (byType[t]) byType[t].push(e); });
    res.json({ entities, count: entities.length, byType, analysis });
  } catch (e) {
    res.json({ entities: [], count: 0, error: e.message });
  }
}));

// Stablecoin rankings — live circulating from DefiLlama + enrichment (issuer/type/backing/audits)
let stablesRankCache = { ts: 0, data: null };
const PEG_MECH = { fiatbacked: 'Fiat-backed', 'fiat-backed': 'Fiat-backed', crypto: 'Crypto-backed', 'crypto-backed': 'Crypto-backed', algorithmic: 'Algorithmic' };
app.get('/api/stablecoins', wrap(async (req, res) => {
  try {
    const now = Date.now();
    if (!stablesRankCache.data || now - stablesRankCache.ts > 10 * 60 * 1000) {
      const j = await fetchJson('https://stablecoins.llama.fi/stablecoins?includePrices=true', 20000);
      const assets = (j && j.peggedAssets) || [];
      const list = assets.map((a) => ({
        name: a.name, symbol: a.symbol, gecko: a.gecko_id || null,
        pegType: a.pegType || null, pegMechanism: PEG_MECH[(a.pegMechanism || '').toLowerCase()] || a.pegMechanism || null,
        circulating: (a.circulating && (a.circulating.peggedUSD || Object.values(a.circulating)[0])) || 0,
        price: a.price || null, chains: (a.chains || []).slice(0, 6),
        change7d: a.circulatingPrevWeek ? null : null,
      })).filter((s) => s.circulating > 1e6).sort((x, y) => y.circulating - x.circulating).slice(0, 50);
      stablesRankCache = { ts: now, data: list };
    }
    let metaMap = {};
    try { (await dbQuery(`SELECT slug, symbol, profile, sources FROM stablecoin_meta`)).forEach((r) => { let p = null; try { p = r.profile ? JSON.parse(r.profile) : null; } catch (e) {} metaMap[(r.symbol || '').toUpperCase()] = { profile: p, sources: r.sources }; }); } catch (e) {}
    let analysis = null;
    try { const m = await dbQuery(`SELECT v, updated_at FROM graveyard_meta WHERE k='stablecoin_analysis' LIMIT 1`); if (m[0]) analysis = { text: m[0].v, updated_at: m[0].updated_at }; } catch (e) {}
    const stablecoins = stablesRankCache.data.map((s, i) => ({ rank: i + 1, ...s, meta: metaMap[(s.symbol || '').toUpperCase()] || null }));
    const totalMcap = stablecoins.reduce((a, s) => a + (s.circulating || 0), 0);
    res.json({ stablecoins, count: stablecoins.length, totalMcap, analysis });
  } catch (e) {
    res.json({ stablecoins: [], count: 0, error: e.message });
  }
}));

// Geographic adoption / regulation library
app.get('/api/geo', wrap(async (req, res) => {
  try {
    const rows = await dbQuery(`SELECT slug, name, region, kind, profile, sources, updated_at FROM geo_regions ORDER BY region, name`);
    const regions = rows.map((r) => { let p = null; try { p = r.profile ? JSON.parse(r.profile) : null; } catch (e) {} return { ...r, profile: p }; });
    let analysis = null;
    try { const m = await dbQuery(`SELECT v, updated_at FROM graveyard_meta WHERE k='geo_analysis' LIMIT 1`); if (m[0]) analysis = { text: m[0].v, updated_at: m[0].updated_at }; } catch (e) {}
    // Reconcile with Power Rankings: surface each country's rank + composite
    // score so Global Adoption and Power Rankings agree and cross-reference.
    try {
      const pm = await dbQuery(`SELECT v FROM graveyard_meta WHERE k='power_rankings' LIMIT 1`);
      if (pm[0]) {
        let obj = {}; try { obj = JSON.parse(pm[0].v); } catch (e) {}
        const rankByName = {};
        (obj.countries || []).forEach((c) => { rankByName[c.name] = { rank: c.rank, total: c.total }; });
        regions.forEach((r) => { if (rankByName[r.name]) { r.powerRank = rankByName[r.name].rank; r.powerScore = rankByName[r.name].total; } });
      }
    } catch (e) { /* best-effort */ }
    res.json({ regions, count: regions.length, analysis });
  } catch (e) {
    res.json({ regions: [], count: 0, error: e.message });
  }
}));

// RWA & DePIN library
app.get('/api/rwa', wrap(async (req, res) => {
  try {
    const rows = await dbQuery(`SELECT slug, name, category, status, profile, sources, updated_at FROM rwa_depin ORDER BY category, name`);
    const items = rows.map((r) => { let p = null; try { p = r.profile ? JSON.parse(r.profile) : null; } catch (e) {} return { ...r, profile: p }; });
    let analysis = null;
    try { const m = await dbQuery(`SELECT v, updated_at FROM graveyard_meta WHERE k='rwa_analysis' LIMIT 1`); if (m[0]) analysis = { text: m[0].v, updated_at: m[0].updated_at }; } catch (e) {}
    const byCat = {};
    items.forEach((i) => { const k = (i.category || 'other'); (byCat[k] = byCat[k] || []).push(i); });
    // live breadth: RWA protocols by TVL + DePIN tokens by market cap
    let rwaLive = [], depinLive = [], rwaTvlTotal = 0;
    try {
      rwaLive = (await dbQuery(`SELECT slug, name, tvl, chains, url, logo, change_1d, change_7d FROM rwa_live ORDER BY tvl DESC`))
        .map((r) => { let c = []; try { c = JSON.parse(r.chains || '[]'); } catch (e) {} return { ...r, chains: c }; });
      rwaTvlTotal = rwaLive.reduce((a, r) => a + (r.tvl || 0), 0);
    } catch (e) {}
    try { depinLive = await dbQuery(`SELECT id, name, symbol, mcap, price, change_24h, volume_24h, image FROM depin_live ORDER BY mcap DESC`); } catch (e) {}
    const depinMcapTotal = depinLive.reduce((a, r) => a + (r.mcap || 0), 0);
    res.json({ items, count: items.length, byCat, analysis, rwaLive, depinLive, rwaTvlTotal, depinMcapTotal });
  } catch (e) {
    res.json({ items: [], count: 0, error: e.message });
  }
}));

// US crypto-policy map — per-state stance + federal legislation
app.get('/api/uspolicy', wrap(async (req, res) => {
  try {
    const rows = await dbQuery(`SELECT abbr, name, stance, profile, sources, updated_at FROM us_states`);
    const states = {};
    rows.forEach((r) => { let p = null; try { p = r.profile ? JSON.parse(r.profile) : null; } catch (e) {} states[r.abbr] = { ...r, profile: p }; });
    let federal = null;
    try { const m = await dbQuery(`SELECT v, updated_at FROM graveyard_meta WHERE k='us_federal' LIMIT 1`); if (m[0]) { try { federal = JSON.parse(m[0].v); } catch (e) { federal = { text: m[0].v }; } federal.updated_at = m[0].updated_at; } } catch (e) {}
    res.json({ states, count: rows.length, federal });
  } catch (e) {
    res.json({ states: {}, count: 0, error: e.message });
  }
}));

// News aggregator — merges crypto RSS feeds, cached 10m
const NEWS_FEEDS = [
  { src: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { src: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { src: 'Decrypt', url: 'https://decrypt.co/feed' },
  { src: 'The Block', url: 'https://www.theblock.co/rss.xml' },
  { src: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/feed' },
  { src: 'DL News', url: 'https://www.dlnews.com/arc/outboundfeeds/rss/' },
];
let newsCache = { ts: 0, data: null };
function decodeXml(s) { return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&#8217;/g, "'").replace(/&#8216;/g, "'").replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').trim(); }
function parseRss(xml, src) {
  const items = [];
  const blocks = xml.split(/<item[\s>]/i).slice(1);
  for (const b of blocks.slice(0, 20)) {
    const t = b.match(/<title>([\s\S]*?)<\/title>/i);
    const l = b.match(/<link>([\s\S]*?)<\/link>/i) || b.match(/<link[^>]*href="([^"]+)"/i);
    const d = b.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || b.match(/<dc:date>([\s\S]*?)<\/dc:date>/i);
    const title = t ? decodeXml(t[1]) : null;
    let link = l ? decodeXml(l[1]) : null;
    if (title && link) items.push({ title, link, src, ts: d ? Date.parse(decodeXml(d[1])) || 0 : 0 });
  }
  return items;
}
app.get('/api/news', wrap(async (req, res) => {
  try {
    const now = Date.now();
    if (!newsCache.data || now - newsCache.ts > 10 * 60 * 1000) {
      const results = await Promise.allSettled(NEWS_FEEDS.map(async (f) => {
        const r = await fetch(f.url, { headers: { 'user-agent': 'Mozilla/5.0 chain-monitor' }, signal: AbortSignal.timeout(12000) });
        // previously any non-2xx (block/rate-limit) still fell through to
        // parseRss() on error-page HTML and silently produced 0 items —
        // no signal that the source ever failed. Fail loud instead.
        if (!r.ok) throw new Error(`${f.src} ${r.status}`);
        const items = parseRss(await r.text(), f.src);
        if (!items.length) throw new Error(`${f.src} parsed 0 items`);
        return items;
      }));
      let all = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') all = all.concat(r.value);
        else console.error(`[news] ${NEWS_FEEDS[i].src} failed:`, r.reason && r.reason.message || r.reason);
      });
      all.sort((a, b) => b.ts - a.ts);
      newsCache = { ts: now, data: all.slice(0, 60) };
    }
    res.json({ items: newsCache.data, count: newsCache.data.length, updatedAt: new Date(newsCache.ts).toISOString() });
  } catch (e) {
    res.json({ items: [], count: 0, error: e.message });
  }
}));

// Scammer fund-flow tracker
app.get('/api/traces', wrap(async (req, res) => {
  try {
    const rows = await dbQuery(`SELECT slug, name, category, amount_usd, profile, sources, updated_at FROM scam_traces ORDER BY amount_usd DESC`);
    const cases = rows.map((r) => { let p = null; try { p = r.profile ? JSON.parse(r.profile) : null; } catch (e) {} return { ...r, profile: p }; });
    let analysis = null;
    try { const m = await dbQuery(`SELECT v, updated_at FROM graveyard_meta WHERE k='traces_analysis' LIMIT 1`); if (m[0]) analysis = { text: m[0].v, updated_at: m[0].updated_at }; } catch (e) {}
    let sanctionsStats = null;
    try {
      const s = await dbQuery(`SELECT COUNT(*) n, COUNT(DISTINCT chain) chains FROM sanctioned_addresses`);
      if (s[0]) sanctionsStats = { addresses: s[0].n, chains: s[0].chains };
    } catch (e) {}
    res.json({ cases, count: cases.length, analysis, sanctionsStats });
  } catch (e) {
    res.json({ cases: [], count: 0, error: e.message });
  }
}));

// Country crypto power rankings
app.get('/api/power', wrap(async (req, res) => {
  try {
    const m = await dbQuery(`SELECT v, updated_at FROM graveyard_meta WHERE k='power_rankings' LIMIT 1`);
    if (!m[0]) return res.json({ countries: [], count: 0 });
    let obj = {}; try { obj = JSON.parse(m[0].v); } catch (e) {}
    let countries = obj.countries || [];
    // Reconcile with Global Adoption (geo): the two datasets cover the same
    // countries — merge each country's geo regulatory/adoption profile in so
    // Power Rankings is the unified per-country view (score + regulation),
    // not a second disconnected country list.
    try {
      const geoRows = await dbQuery(`SELECT name, region, profile FROM geo_regions WHERE kind='country'`);
      const geoByName = {};
      for (const g of geoRows) { let p = null; try { p = g.profile ? JSON.parse(g.profile) : null; } catch (e) {} geoByName[g.name] = { region: g.region, profile: p }; }
      countries = countries.map((c) => {
        const g = geoByName[c.name];
        if (!g || !g.profile) return c;
        const p = g.profile;
        return { ...c, region: g.region, geo: {
          adoption: p.adoption, regulation: p.regulation, upcoming_regulation: p.upcoming_regulation,
          gov_holdings: p.gov_holdings, sentiment: p.sentiment, notable: p.notable, use_cases: p.use_cases,
        } };
      });
    } catch (e) { /* geo merge best-effort */ }
    res.json({ countries, count: countries.length, updatedAt: m[0].updated_at });
  } catch (e) {
    res.json({ countries: [], count: 0, error: e.message });
  }
}));

// ---------------------------------------------------------------------------
// x402 monetization — agent-payable API. Gated endpoints return HTTP 402 with
// payment requirements; a valid X-PAYMENT header unlocks the data.
//   Go-live needs: X402_PAY_TO (receiving wallet) + a facilitator for on-chain
//   verification. Until then it runs in demo mode (X-PAYMENT ignored, free quota).
//   Current gate: verify -> settle -> serve. The verify -> serve -> settle +
//   nonce replay-store target for go-live is in docs/x402-billing-design.md.
// ---------------------------------------------------------------------------
// Facilitator decision: Coinbase CDP facilitator on Base mainnet, USDC.
// Gasless (EIP-3009), built-in KYT/OFAC screening, free 1k tx/mo. Go-live needs:
//   X402_PAY_TO = your Base receiving wallet
//   CDP_API_KEY_ID + CDP_API_KEY_SECRET (from portal.cdp.coinbase.com) for the facilitator SDK
// Payment config, resolved from env at call time. No hardcoded payTo fallback:
// with X402_PAY_TO unset, payTo is null → isLiveMode() is false → we run in demo
// mode and never bill. X402_FACILITATOR must be an http(s) URL to go live (the
// default 'coinbase-cdp' sentinel keeps us in demo until a facilitator is wired).
function x402Config() {
  return {
    payTo: ENV.X402_PAY_TO || null,
    network: ENV.X402_NETWORK || 'base',
    asset: ENV.X402_ASSET || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
    facilitator: ENV.X402_FACILITATOR || 'coinbase-cdp',
  };
}
const AGENT_ENDPOINTS = {
  '/api/agent/summary': { price: 5000, desc: 'Market posture + top signals across all chains' },      // 0.005 USDC
  '/api/agent/chain': { price: 10000, desc: 'Full sourced profile + metrics + signals for one chain' }, // 0.01
  '/api/agent/signals': { price: 20000, desc: 'Live signal feed (momentum, flows, anomalies)' },       // 0.02
  '/api/agent/risk': { price: 50000, desc: 'Scam / bad-actor risk assessment with cited evidence' },   // 0.05 (compliance)
};
// 402 body advertising what a caller must pay. `error` is 'payment_required' when
// no/again-needed payment (discovery), 'payment_invalid' when a payment was
// supplied but failed structural or facilitator verification.
function require402(res, resource, priceAtomic, desc, opts = {}) {
  const cfg = x402Config();
  res.status(402).json({
    x402Version: 1,
    error: opts.error || 'payment_required',
    ...(opts.reason ? { reason: opts.reason } : {}),
    accepts: [paymentRequirements(resource, priceAtomic, desc, cfg)],
  });
}
// POST to the facilitator (verify/settle). Throws on a non-2xx so the gate can
// fail closed. Isolated here so it's the single network seam the gate depends on.
async function facilitatorPost(base, path, body) {
  let root = base;
  while (root.endsWith('/')) root = root.slice(0, -1); // trim trailing slashes (no regex backtracking)
  const url = root + path;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error('facilitator ' + path + ' -> ' + r.status);
  return await r.json();
}
// Free preview quota: each client gets FREE_LIMIT calls/month, then x402 payment required.
const FREE_LIMIT = 1;
// ip -> { count, monthKey }. In-process, per-isolate, IP-keyed — a soft limit,
// not a durable hard quota. `lastPruneKey` tracks the month we last pruned for,
// so a rollover drops last month's stale IP entries exactly once instead of
// leaking them for the isolate's whole lifetime.
const freeQuota = {};
let lastPruneKey = null;
function monthKey() { return monthKeyFromDate(new Date()); }
// Gate an agent endpoint. Returns true to let the handler run, false after it
// has written a 402. Async because live mode calls the facilitator.
//   demo mode (no wallet/facilitator): X-PAYMENT is IGNORED — never a bypass —
//     and access is granted only within the free monthly quota.
//   live mode: require a structurally-valid X-PAYMENT for the exact payTo/amount,
//     then verify + settle it via the facilitator before serving.
// Live-mode path: require a structurally-valid X-PAYMENT for the exact
// payTo/amount, then verify + settle via the facilitator before serving.
// Returns true to allow the handler; false after writing a 402. Split out of
// x402Gate to keep each function's complexity low.
async function verifyLivePayment(req, res, baseResource, priceAtomic, desc, cfg) {
  const deny = (reason) => { require402(res, baseResource, priceAtomic, desc, { error: 'payment_invalid', reason }); return false; };
  const header = req.headers['x-payment'];
  if (!header) { require402(res, baseResource, priceAtomic, desc); return false; }
  const requirements = paymentRequirements(baseResource, priceAtomic, desc, cfg);
  const payment = decodePaymentHeader(header);
  const chk = structuralCheck(payment, requirements);
  if (!chk.ok) return deny(chk.reason);
  const body = { x402Version: 1, paymentPayload: payment, paymentRequirements: requirements };
  let verify;
  try { verify = await facilitatorPost(cfg.facilitator, '/verify', body); }
  catch { return deny('verify_unavailable'); }
  if (verify?.isValid !== true) return deny(verify?.invalidReason || 'verify_rejected');
  let settle;
  try { settle = await facilitatorPost(cfg.facilitator, '/settle', body); }
  catch { return deny('settle_unavailable'); }
  if (settle?.success !== true) return deny('settle_failed');
  if (settle.transaction) res.setHeader('X-PAYMENT-RESPONSE', String(settle.transaction));
  return true;
}
async function x402Gate(req, res, baseResource, priceAtomic, desc) {
  const cfg = x402Config();
  if (isLiveMode(cfg)) return verifyLivePayment(req, res, baseResource, priceAtomic, desc, cfg);
  // Demo mode: never trust X-PAYMENT. Key the free quota on Cloudflare's trusted
  // client IP. X-Forwarded-For is client-supplied (leftmost value spoofable), so
  // it must NOT be trusted — an attacker could rotate it for unlimited free calls.
  const ip = req.headers['cf-connecting-ip'] || req.ip || 'anon';
  const mk = monthKey();
  // On month rollover, drop last month's entries (see pruneStaleQuota) so the
  // in-process map can't grow unbounded over the isolate's lifetime.
  if (mk !== lastPruneKey) { pruneStaleQuota(freeQuota, mk); lastPruneKey = mk; }
  let q = freeQuota[ip];
  if (!q || q.monthKey !== mk) { q = freeQuota[ip] = { count: 0, monthKey: mk }; }
  q.count++;
  if (q.count <= FREE_LIMIT) { res.setHeader('X-Free-Calls-Remaining', String(FREE_LIMIT - q.count)); return true; }
  require402(res, baseResource, priceAtomic, desc);
  return false;
}

// Free discovery manifest — how agents learn what's payable and for how much
app.get('/api/agent/manifest', wrap((req, res) => {
  const cfg = x402Config();
  const live = isLiveMode(cfg);
  res.json({
    name: 'Chaindump', description: 'Onchain intelligence — chains, assets, markets, policy & forensics.',
    x402Version: 1, freeCallsPerMonth: FREE_LIMIT,
    payment: { network: cfg.network, asset: cfg.asset, payTo: live ? cfg.payTo : null, currency: 'USDC', mode: live ? 'live' : 'demo' },
    entrypoints: Object.entries(AGENT_ENDPOINTS).map(([path, v]) => ({ path, priceUsd: v.price / USDC_DP, description: v.desc })),
  });
}));

app.get('/api/agent/summary', wrap(async (req, res) => {
  if (!(await x402Gate(req, res, '/api/agent/summary', AGENT_ENDPOINTS['/api/agent/summary'].price, AGENT_ENDPOINTS['/api/agent/summary'].desc))) return;
  if (!cache.data) cache = await loadSnapshot();
  const c = cache.data.chains || [];
  const all = c.flatMap((x) => x.signals || []);
  const rk = { critical: 3, notable: 2, info: 1 };
  all.sort((a, b) => (rk[b.severity] - rk[a.severity]) || (b.confidence - a.confidence));
  const t = cache.data.totals || {};
  res.json({
    schema_version: '2.0.0', data_as_of: cache.data.updatedAt,
    market: { total_tvl_usd: t.tvl, total_volume_24h_usd: t.volume24h, total_fees_24h_usd: t.fees24h, chains_tracked: c.length },
    leaders: c.slice(0, 5).map((x) => ({
      chain: x.name, rank: x.rank, tvl_usd: x.tvl, activity_score: x.score,
      // Present only when the TVL figure can't be independently verified, so an
      // agent consuming this list doesn't treat it as equivalent to its peers.
      ...(x.dataQuality ? { data_quality: x.dataQuality.flag, data_quality_note: x.dataQuality.summary } : {}),
    })),
    top_signals: all.slice(0, 12),
    signal_counts: { critical: all.filter((s) => s.severity === 'critical').length, notable: all.filter((s) => s.severity === 'notable').length, total: all.length },
    provenance: { sources: ['defillama', 'coingecko', 'growthepie'], note: 'Every signal carries its own evidence + method + confidence (0–1). Full feed at /api/agent/signals.' },
  });
}));
app.get('/api/agent/chain/:key', wrap(async (req, res) => {
  if (!(await x402Gate(req, res, '/api/agent/chain', AGENT_ENDPOINTS['/api/agent/chain'].price, AGENT_ENDPOINTS['/api/agent/chain'].desc))) return;
  if (!cache.data) cache = await loadSnapshot();
  const row = (cache.data.chains || []).find((c) => c.name.toLowerCase() === String(req.params.key).toLowerCase());
  if (!row) return res.status(404).json({ error: 'unknown_chain' });
  let analysis = null;
  try { const r = await dbQuery(`SELECT take, sentiment, sources, profile FROM chain_analysis WHERE chain=? LIMIT 1`, [row.name]); if (r[0]) analysis = r[0]; } catch (e) {}
  res.json({ schema_version: '1.0.0', data_as_of: cache.data.updatedAt, chain: row, analysis, provenance: { sources: ['defillama', 'growthepie', 'coingecko'] } });
}));
app.get('/api/agent/signals', wrap(async (req, res) => {
  if (!(await x402Gate(req, res, '/api/agent/signals', AGENT_ENDPOINTS['/api/agent/signals'].price, AGENT_ENDPOINTS['/api/agent/signals'].desc))) return;
  if (!cache.data) cache = await loadSnapshot();
  const all = (cache.data.chains || []).flatMap((c) => c.signals || []);
  const rk = { critical: 3, notable: 2, info: 1 };
  const dir = String(req.query.direction || '').toLowerCase();
  const minConf = Number(req.query.min_confidence) || 0;
  let out = all.filter((s) => (!dir || s.direction === dir) && s.confidence >= minConf);
  out.sort((a, b) => (rk[b.severity] - rk[a.severity]) || (b.confidence - a.confidence));
  res.json({
    schema_version: '2.0.0', data_as_of: cache.data.updatedAt,
    universe: 'top 50 chains by composite activity',
    signal_types: ['capital_flow_7d', 'inorganic_volume', 'volume_accel', 'mercenary_tvl', 'real_yield', 'valuation', 'tvl_fee_divergence', 'price_usage_divergence'],
    count: out.length, signals: out,
    provenance: { sources: ['defillama', 'coingecko', 'growthepie'], methodology: 'Each signal includes evidence + method + confidence(0–1) + severity(critical|notable|info). Filter with ?direction=bullish|bearish|warning and ?min_confidence=0.6.' },
  });
}));
app.get('/api/agent/risk/:entity', wrap(async (req, res) => {
  if (!(await x402Gate(req, res, '/api/agent/risk', AGENT_ENDPOINTS['/api/agent/risk'].price, AGENT_ENDPOINTS['/api/agent/risk'].desc))) return;
  const name = String(req.params.entity);
  let rows = [];
  try { rows = await dbQuery(`SELECT entity_type, entity_name, level, summary, evidence, sources FROM risk_flags WHERE lower(entity_name)=lower(?)`, [name]); } catch (e) {}
  res.json({ schema_version: '1.0.0', entity: name, flagged: rows.length > 0, risk: rows[0] || { level: 'clean', summary: 'No credible scam/bad-actor concerns found in our dataset.' }, all_matches: rows });
}));

// Trace lookup — paste an address / tx / entity / case name; find where it appears across traced cases
app.get('/api/trace-lookup', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 3) return res.json({ query: q, matches: [], risk: [] });
  try {
    const rows = await dbQuery(`SELECT slug, name, category, amount_usd, profile FROM scam_traces`);
    const matches = [];
    for (const r of rows) {
      let p = {}; try { p = JSON.parse(r.profile || '{}'); } catch (e) {}
      const hits = [];
      (p.hops || []).forEach((h) => {
        const blob = `${h.from||''} ${h.to||''} ${h.txhash||''} ${h.note||''}`.toLowerCase();
        if (blob.includes(q)) hits.push({ type: 'hop', detail: `${h.from||''} → ${h.to||''} · ${h.amount||''} ${h.asset||''}`, txurl: h.txurl || null });
      });
      (p.entities || []).forEach((e) => {
        const blob = `${e.name||e.label||''} ${e.address||''} ${e.role||''}`.toLowerCase();
        if (blob.includes(q)) hits.push({ type: 'entity', detail: `${e.name||e.label||''}${e.role?` (${e.role})`:''}${e.address?` — ${e.address}`:''}` });
      });
      const nameHit = r.name.toLowerCase().includes(q) || (p.summary || '').toLowerCase().includes(q);
      if (hits.length || nameHit) matches.push({ slug: r.slug, name: r.name, category: r.category, amount_usd: r.amount_usd, nameHit, hits: hits.slice(0, 8) });
    }
    let risk = [];
    try { risk = await dbQuery(`SELECT entity_type, entity_name, level, summary FROM risk_flags WHERE lower(entity_name) LIKE ? LIMIT 8`, ['%' + q + '%']); } catch (e) {}
    // OFAC sanctions screening: does the pasted address appear on the SDN list?
    let sanctioned = null;
    if (q.length >= 8) {
      try {
        const hit = await dbQuery(`SELECT address, chain, source FROM sanctioned_addresses WHERE address_lc = ?`, [q]);
        if (hit.length) sanctioned = { address: hit[0].address, chains: hit.map((h) => h.chain), source: hit[0].source, sanctioned: true };
      } catch (e) {}
    }
    res.json({ query: q, matches, risk, sanctioned });
  } catch (e) {
    res.json({ query: q, matches: [], risk: [], error: e.message });
  }
}));

// Scam connection graph — merged fund-flow web across all cases; flags shared/suspect hubs
app.get('/api/scam-graph', wrap(async (req, res) => {
  try {
    const [traceRows, addrRows, flowRows, wlRows] = await Promise.all([
      dbQuery(`SELECT slug, name, profile FROM scam_traces`),
      dbQuery(`SELECT address, chain, case_slug, role, label, entity, entity_id FROM scam_addresses`).catch(() => []),
      dbQuery(`SELECT case_slug, from_addr, to_addr, from_label, to_label, asset, amount_usd, tx_url, note, sources FROM scam_flows`).catch(() => []),
      dbQuery(`SELECT address_a, chain_a, address_b, chain_b, link_type, entity, case_slug, tx_url, evidence FROM wallet_links`).catch(() => []),
    ]);
    const nameBySlug = {}; traceRows.forEach((r) => { nameBySlug[r.slug] = r.name; });
    // culpable ACTORS vs neutral INFRASTRUCTURE (tools, not blamed)
    const ACTOR = /exploiter|hacker|attacker|drainer|scammer|thief|fraud|lazarus|dprk|north korea|insider|rug|perp|deployer|launderer/i;
    const INFRA = /tornado|mixer|bridge|thorchain|railgun|sinbad|chipmixer|renbridge|tumbler|\bdex\b|swap|exchange|\bcex\b|binance|huobi|okx|deposit/i;
    const key = (a) => String(a || '').trim().toLowerCase();
    const short = (a) => { const s = String(a || ''); return /^0x[a-f0-9]{8,}/i.test(s) ? s.slice(0, 6) + '…' + s.slice(-4) : s.slice(0, 24); };
    const nodes = {}, nodeCases = {}, edges = [], deg = {};
    function ensure(addr, label, chain, role, entity_id, slug) {
      const id = key(addr); if (!id) return null;
      if (!nodes[id]) nodes[id] = { id, address: addr, label: label || short(addr), chain: chain || '', role: role || '', entity_id: entity_id || '' };
      else { if (label && (!nodes[id].label || /^0x/i.test(nodes[id].label))) nodes[id].label = label; if (chain && !nodes[id].chain) nodes[id].chain = chain; if (role && !nodes[id].role) nodes[id].role = role; if (entity_id && !nodes[id].entity_id) nodes[id].entity_id = entity_id; }
      if (slug) (nodeCases[id] = nodeCases[id] || new Set()).add(nameBySlug[slug] || slug);
      return id;
    }
    addrRows.forEach((a) => ensure(a.address, a.label, a.chain, a.role, a.entity_id, a.case_slug));
    // fund-flow edges (transactions)
    flowRows.forEach((f, i) => {
      const s = ensure(f.from_addr, f.from_label, '', '', '', f.case_slug);
      const t = ensure(f.to_addr, f.to_label, '', '', '', f.case_slug);
      if (s && t) { edges.push({ id: 'f' + i, source: s, target: t, kind: 'flow', caseName: nameBySlug[f.case_slug] || f.case_slug, amount: f.amount_usd ? '$' + Math.round(f.amount_usd).toLocaleString() : '', asset: f.asset || '', txurl: f.tx_url || null, note: f.note || '', sources: f.sources || '' }); deg[s] = (deg[s] || 0) + 1; deg[t] = (deg[t] || 0) + 1; }
    });
    // wallet-linkage edges (entity resolution: current <-> past)
    wlRows.forEach((w, i) => {
      const s = ensure(w.address_a, null, w.chain_a, '', w.entity, w.case_slug);
      const t = ensure(w.address_b, null, w.chain_b, '', w.entity, w.case_slug);
      if (s && t) { edges.push({ id: 'l' + i, source: s, target: t, kind: 'link', linkType: w.link_type || 'linked', caseName: w.entity || nameBySlug[w.case_slug] || '', note: w.evidence || '', txurl: w.tx_url || null }); deg[s] = (deg[s] || 0) + 1; deg[t] = (deg[t] || 0) + 1; }
    });
    // entity clusters: same entity_id across >1 address = same actor over time/chains
    const entityCount = {};
    Object.values(nodes).forEach((n) => { if (n.entity_id) entityCount[n.entity_id] = (entityCount[n.entity_id] || 0) + 1; });
    // A connection web must show CONNECTIONS: only emit wallets that
    // participate in at least one real edge (a traced transaction or link).
    // Otherwise bulk-loaded addresses with no edges render as a meaningless
    // scattered cloud. If there are no edges at all, fall back to all nodes.
    const connected = new Set();
    edges.forEach((e) => { connected.add(e.source); connected.add(e.target); });
    const hasEdges = edges.length > 0;
    const casesWithFlow = new Set([...flowRows, ...wlRows].map((r) => r.case_slug).filter(Boolean));
    const out = Object.values(nodes)
      .filter((n) => !hasEdges || connected.has(n.id))
      .map((n) => {
        const cs = [...(nodeCases[n.id] || [])];
        const roleActor = ACTOR.test(n.role) || ACTOR.test(n.label);
        const roleInfra = !roleActor && (INFRA.test(n.role) || INFRA.test(n.label));
        const clustered = n.entity_id && entityCount[n.entity_id] > 1;
        return { id: n.id, label: n.label, address: n.address, chain: n.chain, role: n.role, entity: n.entity_id, cluster: clustered, cases: cs, shared: cs.length > 1 || clustered, actor: roleActor, infra: roleInfra, degree: deg[n.id] || 0 };
      });
    res.json({ nodes: out, edges, caseCount: traceRows.length, addressCount: addrRows.length, flowCount: flowRows.length, linkCount: wlRows.length, casesMapped: casesWithFlow.size, hiddenIsolated: Object.keys(nodes).length - out.length });
  } catch (e) {
    res.json({ nodes: [], edges: [], error: e.message });
  }
}));

// BUILD_SHA is injected by the protected production workflow. Returning it here
// lets the smoke check prove that the requested revision reached the Worker,
// rather than accepting a 200 from an older deployment that also had /api/health.
app.get('/api/health', wrap((req, res) => res.json({
  ok: true,
  revision: ENV.BUILD_SHA || null,
})));

// ---------------------------------------------------------------------------
// Deep-links + shareable pages. The SPA is served for entity/view paths with
// per-entity Open Graph tags injected so pasted links unfurl (title/desc) in
// Twitter/Discord/Slack. The client reads the path and opens the right view.
// ---------------------------------------------------------------------------
const OG_DESC_FALLBACK = 'Onchain intelligence — chains, assets, markets, policy & forensics. What is changing, why, and what to do about it.';
// Serialize JSON-LD safely for inlining in a <script> (neutralize "</script>").
function jsonLd(obj) { return JSON.stringify(obj).replace(/</g, '\\u003c'); }
function ogHtml(html, { title, desc, url, ld }) {
  const t = escapeHtml(title || 'Chaindump — Onchain Intelligence');
  const d = escapeHtml(desc || OG_DESC_FALLBACK);
  const u = escapeHtml(url || 'https://chaindump.xyz/');
  // Base structured-data graph: Organization + WebSite, present on every page so
  // AI engines and search can attribute claims to Chaindump. Per-page nodes (a
  // chain Dataset, a scam Report, etc.) are appended via the optional `ld` arg.
  const graph = [
    { '@type': 'Organization', '@id': ORIGIN + '/#org', name: 'Chaindump', url: ORIGIN + '/', description: OG_DESC_FALLBACK, logo: ORIGIN + '/favicon.svg' },
    { '@type': 'WebSite', '@id': ORIGIN + '/#site', name: 'Chaindump', url: ORIGIN + '/', description: OG_DESC_FALLBACK, inLanguage: 'en', publisher: { '@id': ORIGIN + '/#org' } },
  ];
  if (ld) graph.push(...(Array.isArray(ld) ? ld : [ld]));
  const structured = jsonLd({ '@context': 'https://schema.org', '@graph': graph });
  const tags = `<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${u}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:type" content="website">
<meta property="og:url" content="${u}">
<meta property="og:site_name" content="Chaindump">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<script type="application/ld+json">${structured}</script>`;
  return html.replace(/<title>[\s\S]*?<\/title>/, tags);
}
// Crawlability: public/index.html brackets the live board's placeholder row
// with <!--ssr-rows-start-->/<!--ssr-rows-end--> markers (inside <tbody
// id="rows">) specifically so this replace doesn't depend on the skeleton's
// exact wording/whitespace — only the marker pair has to survive. Swapped for
// real rows server-side so non-JS clients (crawlers, social-card scrapers)
// see data instead of "Fetching…". If the markers are ever removed from
// index.html, the regex simply finds no match — a silent no-op, the shell
// still renders correctly, just without SSR rows.
const SSR_ROWS_MARKER = /<!--ssr-rows-start-->[\s\S]*?<!--ssr-rows-end-->/;
const SSR_ROWS_LIMIT = 20;

async function spaShell(env, req) {
  try {
    if (!env || !env.ASSETS) throw new Error('no ASSETS binding');
    const r = await env.ASSETS.fetch(new Request(new URL('/index.html', req.url)));
    let html = await r.text();
    try {
      // Same staleness check /api/chains uses — otherwise a warm isolate hit
      // only by no-JS clients (crawlers, social scrapers) never re-reads D1
      // and keeps serving the first snapshot it ever loaded, indefinitely.
      if (!cache.data || Date.now() - cache.ts > TTL) cache = await loadSnapshot();
      const ssr = renderSsrRows(cache.data && cache.data.chains, SSR_ROWS_LIMIT);
      // Replacer callback, not a bare string: a chain name/symbol containing a
      // literal "$" (e.g. "$&") would otherwise be reinterpreted by
      // String.replace()'s special replacement-pattern syntax ($&, $$, $`, $').
      if (ssr) html = html.replace(SSR_ROWS_MARKER, () => ssr);
    } catch (e) { console.error('[spaShell ssr] skipped:', e && e.message); }
    return html;
  } catch (e) { console.error('[spaShell] failed:', e && e.message); throw e; }
}
// BreadcrumbList for entity deep-links: Home › {section} › {entity}.
function breadcrumb(section, sectionUrl, entity, entityUrl) {
  const el = [{ '@type': 'ListItem', position: 1, name: 'Chaindump', item: ORIGIN + '/' }];
  if (section) el.push({ '@type': 'ListItem', position: 2, name: section, item: sectionUrl });
  if (entity) el.push({ '@type': 'ListItem', position: el.length + 1, name: entity, item: entityUrl });
  return { '@type': 'BreadcrumbList', itemListElement: el };
}
// Vary: Accept matters here even though this is the HTML branch — a client
// negotiating on Accept (markdown vs HTML) means any shared cache must key on
// it, or a cached HTML response could be served to a later text/markdown
// request. Set on every response, not just the markdown branch.
function sendHtml(res, html) { res.setHeader('Link', DISCOVERY_LINK); res.setHeader('Vary', 'Accept'); res.status(200).html(html); }
// Serves either the SPA shell (HTML, with OG/JSON-LD tags injected) or a plain
// markdown rendering of the same title/desc/JSON-LD, chosen by content
// negotiation (see negotiate.js). Used by every entity/view deep-link so
// agents that ask for text/markdown get real page content instead of an
// unrendered SPA shell.
async function sendPage(req, res, { title, desc, url, ld, apiUrl }) {
  if (prefersMarkdown(req.headers.accept)) {
    res.setHeader('content-type', 'text/markdown; charset=utf-8');
    res.setHeader('vary', 'Accept');
    res.setHeader('link', DISCOVERY_LINK);
    return res.status(200).html(renderEntityMarkdown({ title, desc, url, ld, apiUrl }));
  }
  return sendHtml(res, ogHtml(await spaShell(ENV, req.raw), { title, desc, url, ld }));
}

// Canonical human-facing profile page. All vertical adapters terminate at the
// same API contract, and the browser renders this route with the same section
// anatomy. Legacy /chain, /collection, /casino and /exchange URLs remain valid;
// the client maps them here after the shell loads.
app.get('/profile/:entity_type/:slug', wrap(async (req, res) => {
  const entityType = String(req.params.entity_type || '').trim().toLowerCase();
  const slug = String(req.params.slug || '').trim().toLowerCase();
  if (!PROFILE_ENTITY_TYPES.has(entityType) || !/^[a-z0-9._-]+$/.test(slug)) {
    return res.status(404).html('Profile not found');
  }
  let profile = null;
  try { profile = await resolveEntityProfile(entityType, slug); } catch (error) {
    console.error('[entity-profile-page] lookup failed:', error?.message || error);
  }
  if (!profile) return res.status(404).html('Profile not found');
  const name = profile.identity?.name || 'Research profile';
  const typeLabel = entityType.replaceAll('_', ' ');
  const summary = profile.analysis?.sections?.what_it_is?.body;
  const desc = typeof summary === 'string' && summary.trim()
    ? summary.trim().slice(0, 240)
    : `Citation-backed ${typeLabel} research profile on Chaindump.`;
  const url = `${ORIGIN}/profile/${encodeURIComponent(entityType)}/${encodeURIComponent(slug)}`;
  const parent = ['dex', 'cex'].includes(entityType) ? 'exchange-analysis'
    : ['nft_collection', 'ordinals_collection'].includes(entityType) ? 'nft-analysis'
      : entityType === 'web3_casino' ? 'casino-analysis'
        : entityType === 'blockchain' ? 'blockchain-analysis'
          : ['crypto_treasury', 'miner', 'etf'].includes(entityType) ? 'markets'
            : ['rwa', 'depin'].includes(entityType) ? 'rwa'
              : entityType === 'stablecoin' ? 'stables' : 'infra';
  const ld = [
    {
      '@type': 'Report', '@id': `${url}#report`, name: `${name} research profile`,
      description: desc, url, inLanguage: 'en', publisher: { '@id': `${ORIGIN}/#org` },
    },
    breadcrumb('Research', `${ORIGIN}/${parent}`, name, url),
  ];
  return sendPage(req, res, {
    title: `${name} — Chaindump`, desc, url, ld,
    apiUrl: `${ORIGIN}/api/profile/${encodeURIComponent(entityType)}/${encodeURIComponent(slug)}`,
  });
}));

// Views that are valid single-segment deep-links → their share copy.
const VIEW_OG = {
  live: ['Live · Top 50 chains — Chaindump', 'The top 50 chains ranked by composite on-chain activity (volume, TVL, fees), with live capital-flow and anomaly signals.'],
  'blockchain-analysis': ['Blockchain Analysis — Chaindump', 'Sortable, citation-backed lifecycle dossiers for the current top 50 plus stuck, dying and dead blockchains.'],
  'exchange-analysis': ['DEX/CEX Analysis — Chaindump', 'Comparable, citation-backed forensic dossiers across successful, middling and failed decentralized and centralized exchanges.'],
  'casino-analysis': ['Web3 Casino Analysis — Chaindump', 'Publication-gated lifecycle research across onchain casinos, sportsbooks, betting exchanges, bankrolls and gaming infrastructure.'],
  'nft-analysis': ['NFT and Ordinals Analysis — Chaindump', 'Sortable, freshness-gated lifecycle research across NFT and Ordinals collections, with field-level citations and explicit unknowns.'],
  mid: ['Stuck / Mid chains — Chaindump', 'Alive-but-directionless chains: real product, weak token value capture, or a stalled thesis.'],
  grave: ['Chain Graveyard — Chaindump', 'Why chains die: the forensic taxonomy of dead chains — mercenary TVL, points collapse, unlock dumps, rugs, and hacks.'],
  nft: ['NFTs & Ordinals — Chaindump', 'The full NFT & Ordinals collection universe across chains, plus deep-dive lifecycle case studies.'],
  stables: ['Stablecoins — Chaindump', 'Live stablecoin rankings by circulating supply, peg mechanism, issuer and chain footprint.'],
  rwa: ['RWA · DePIN — Chaindump', 'Real-world assets on-chain ($25B+ tokenized) and decentralized physical infrastructure networks.'],
  infra: ['Storage / Verify — Chaindump', 'Decentralized storage and document-verification infrastructure.'],
  markets: ['Treasuries · Miners · ETFs — Chaindump', 'The TradFi bridge: crypto treasury companies, miners and ETFs.'],
  geo: ['Global Adoption — Chaindump', 'How countries adopt, regulate and hold crypto — with each country\'s crypto power ranking.'],
  uspolicy: ['US Policy Map — Chaindump', 'US crypto policy state-by-state, plus federal legislation tracking.'],
  power: ['Crypto Power Rankings — Chaindump', 'Countries ranked by a composite of usage, policy, institutional adoption, innovation and government stance.'],
  news: ['Crypto News — Chaindump', 'Aggregated crypto news across the major outlets.'],
  traces: ['Scam Tracker — Chaindump', 'Traced scam fund-flows plus live OFAC wallet screening against 900+ sanctioned addresses across 14 chains.'],
  api: ['Agent API · x402 — Chaindump', 'A versioned, provenance-tagged JSON API for AI agents, payable per-call via x402.'],
};
// Views whose primary content is a ranking → emit an ItemList so AI engines can
// answer "top X" questions directly. Only `live` has its items in the snapshot
// cache at request time; the rest stay description-only until wired to their data.
Object.keys(VIEW_OG).forEach((v) => {
  app.get('/' + v, wrap(async (req, res) => {
    const [title, desc] = VIEW_OG[v];
    const url = `${ORIGIN}/${v}`;
    let ld;
    if (v === 'live') {
      try {
        if (!cache.data) cache = await loadSnapshot();
        const items = (cache.data.chains || []).slice(0, 20).map((c, i) => ({
          '@type': 'ListItem', position: i + 1, name: c.name, url: `${ORIGIN}/chain/${encodeURIComponent(c.name)}`,
        }));
        if (items.length) ld = { '@type': 'ItemList', '@id': url + '#list', name: 'Top chains by on-chain activity', itemListOrder: 'https://schema.org/ItemListOrderDescending', numberOfItems: items.length, itemListElement: items };
      } catch (e) { console.error('[live itemlist] skipped:', e && e.message); }
    }
    await sendPage(req, res, { title, desc, url, ld });
  }));
});
app.get('/chain/:name', wrap(async (req, res) => {
  const key = String(req.params.name || '');
  if (!cache.data) cache = await loadSnapshot();
  let row = (cache.data.chains || []).find((c) => norm(c.name) === norm(key));   // see /api/chain/:name — an alias must not skip the board
  // Board-only lookup made every chain beyond the top-50 unfurl identically to a
  // nonsense string — /chain/Anubis and /chain/NotARealChain shared a title and
  // description, even though we hold a researched profile for one of them.
  if (!row) { try { row = await resolveTailChain(key.toLowerCase()); } catch (e) { /* fall back to the generic card */ } }
  // A caveat that only exists inside the page cannot ride on a social card or into
  // a crawler's structured data. Anubis's own desk row says the headline number
  // "should not be presented to users without a caveat" — and this route was
  // publishing exactly that number, uncaveated, to every unfurl and every
  // crawler. Recompute the rule here rather than trust the row: a tail chain is
  // never annotated by the snapshot.
  // The caveat lives ON the row: buildSnapshot annotates board rows and
  // resolveTailChain annotates tail rows, so every surface reads one value.
  // Recomputing it here re-scanned all 7,867 protocols (an 8MB fetch, ~30MB heap)
  // for every CLEAN board row — a clean row carries no dataQuality, so `!dq` is
  // indistinguishable from "assessed and fine". That is the exact regression
  // /api/chain/:name documents fixing, reintroduced one route over, on the
  // crawler-facing path where cold isolates are most likely.
  const dq = row && row.dataQuality ? row.dataQuality : null;
  const caveat = dq ? ' Chaindump cannot independently verify this TVL figure.' : '';
  // Quote only the figures we actually have. fmtShort coerces null to 0, so
  // building this string unconditionally published "$0 24h volume" for every
  // chain we simply have no volume for — the same false zero the board and the
  // tiles were fixed for, leaking out through the social card instead.
  const parts = [];
  if (row && row.tvl != null) parts.push(`$${fmtShort(row.tvl)} TVL`);
  if (row && row.volume24h != null) parts.push(`$${fmtShort(row.volume24h)} 24h volume`);
  const figures = !row ? ''
    : parts.length ? `${parts.join(', ')}.`
    // A claim about OUR coverage, not about the world. "No market data is
    // available for this chain" is a false universal negative — Polkadot has a
    // multi-billion-dollar market cap and a live CoinGecko price. The sharpest
    // proof: Klaytn is Kaia renamed, so /chain/Klaytn said "no market data" while
    // /chain/Kaia published $11.0M TVL from the same feed.
    : 'Chaindump does not track live market data for this chain; researched analysis only.';

  const title = row ? `${row.name} — Chaindump` : 'Chain — Chaindump';
  const desc = row
    ? (row.rank != null
        ? `${row.name}: ${figures} Rank #${row.rank} by activity.${caveat} Live metrics, fundamentals and analyst take on Chaindump.`
        // A tail chain has no board rank — do not imply one it does not have.
        : `${row.name}: ${figures} Outside the top-50 activity board.${caveat} Metrics and research on Chaindump.`)
    : OG_DESC_FALLBACK;
  const url = `${ORIGIN}/chain/${encodeURIComponent(key)}`;
  let ld;
  if (row) {
    const dm = (cache.data && cache.data.updatedAt) ? new Date(cache.data.updatedAt).toISOString() : undefined;
    const measured = [];
    // Omit a figure we don't have; never publish 0 as a stand-in for unknown.
    if (row.tvl != null) {
      measured.push({
        '@type': 'PropertyValue',
        name: dq ? 'Total value locked (USD) — unverified' : 'Total value locked (USD)',
        value: row.tvl,
        ...(dq ? { description: dq.summary } : {}),
      });
    }
    if (row.volume24h != null) measured.push({ '@type': 'PropertyValue', name: '24h DEX volume (USD)', value: row.volume24h });
    // Only claim a rank when the chain actually has one.
    if (row.rank != null) measured.push({ '@type': 'PropertyValue', name: 'Composite activity rank', value: row.rank });
    if (row.tokenPrice != null) measured.push({ '@type': 'PropertyValue', name: 'Token price (USD)', value: row.tokenPrice });
    ld = [
      { '@type': 'Dataset', '@id': url + '#dataset', name: `${row.name} on-chain metrics`, description: desc, url, isPartOf: { '@id': ORIGIN + '/#site' }, creator: { '@id': ORIGIN + '/#org' }, publisher: { '@id': ORIGIN + '/#org' }, dateModified: dm, variableMeasured: measured, citation: ['https://defillama.com/', 'https://www.coingecko.com/'] },
      breadcrumb('Live · Top 50', `${ORIGIN}/live`, row.name, url),
    ];
  }
  const apiUrl = row ? `${ORIGIN}/api/chain/${encodeURIComponent(key)}` : undefined;
  await sendPage(req, res, { title, desc, url, ld, apiUrl });
}));
function ogDescription(value, fallback) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  return text.length > 280 ? `${text.slice(0, 277).trimEnd()}…` : text;
}
function publicSourceUrls(value) {
  let sources = value;
  if (typeof sources === 'string') {
    try { sources = JSON.parse(sources); } catch (error) { return []; }
  }
  if (!Array.isArray(sources)) return [];
  return [...new Set(sources.map((source) => typeof source === 'string' ? source : source?.url)
    .filter((url) => /^https?:\/\//i.test(url || '')))];
}
async function exchangePageRow(kind, lifecycle, slug) {
  if (!['dex', 'cex'].includes(kind) || !['successful', 'mid', 'dead'].includes(lifecycle)) return null;
  // Each bound kind/type keeps DEX rows exchange-only; the OR intentionally
  // includes every centralized CEX venue type in canonical dossier routes.
  if (lifecycle === 'successful') {
    return (await dbQuery(
      `SELECT slug, name, why_successful AS summary, outlook, sources, updated_at
         FROM successful_exchanges
        WHERE type = ? AND slug = ? AND (venue_type = 'exchange' OR type = 'cex') LIMIT 1`,
      [kind, slug],
    ))[0] || null;
  }
  if (lifecycle === 'mid') {
    return (await dbQuery(
      `SELECT slug, name, why_stuck AS summary, outlook, sources, updated_at
         FROM mid_exchanges
        WHERE kind = ? AND slug = ? AND (venue_type = 'exchange' OR kind = 'cex') LIMIT 1`,
      [kind, slug],
    ))[0] || null;
  }
  return (await dbQuery(
    `SELECT slug, name, why AS summary, outlook, sources, updated_at
       FROM dead_exchanges
      WHERE kind = ? AND slug = ? AND (venue_type = 'exchange' OR kind = 'cex') LIMIT 1`,
    [kind, slug],
  ))[0] || null;
}
app.get('/exchange/:kind/:lifecycle/:slug', wrap(async (req, res) => {
  const kind = String(req.params.kind || '').toLowerCase();
  const lifecycle = String(req.params.lifecycle || '').toLowerCase();
  const slug = String(req.params.slug || '').toLowerCase();
  let row = null;
  try { row = await exchangePageRow(kind, lifecycle, slug); } catch (error) {}
  const url = `${ORIGIN}/exchange/${encodeURIComponent(kind)}/${encodeURIComponent(lifecycle)}/${encodeURIComponent(slug)}`;
  const label = kind === 'cex' ? 'CEX' : 'DEX';
  const title = row ? `${row.name} — ${label} forensic dossier | Chaindump` : `${label} forensic dossier — Chaindump`;
  const desc = row
    ? `${row.name} ${label} indexed lifecycle dossier with per-claim support status and registered evidence on Chaindump.`
    : OG_DESC_FALLBACK;
  const citations = publicSourceUrls(row?.sources);
  const ld = row ? [
    {
      '@type': 'Article', '@id': `${url}#article`, headline: `${row.name} — ${label} forensic dossier`,
      description: desc, url, mainEntityOfPage: url, dateModified: row.updated_at || undefined,
      isPartOf: { '@id': `${ORIGIN}/#site` }, author: { '@id': `${ORIGIN}/#org` },
      publisher: { '@id': `${ORIGIN}/#org` }, citation: citations,
    },
    breadcrumb('DEX/CEX Analysis', `${ORIGIN}/exchange-analysis`, row.name, url),
  ] : undefined;
  const apiUrl = row
    ? `${ORIGIN}/api/exchange-analysis?kind=${encodeURIComponent(kind)}&lifecycle=${encodeURIComponent(lifecycle)}&slug=${encodeURIComponent(slug)}`
    : undefined;
  await sendPage(req, res, { title, desc, url, ld, apiUrl });
}));
app.get('/casino/:case_id', wrap(async (req, res) => {
  const caseId = String(req.params.case_id || '').toLowerCase();
  let row = null;
  try {
    row = (await dbQuery(
      `SELECT c.case_id, c.brand_name, c.last_reviewed,
              (SELECT json_group_array(json_object('title', s.title, 'url', s.canonical_url))
                 FROM casino_claims cl JOIN casino_sources s ON s.source_id = cl.source_id
                WHERE cl.case_id = c.case_id AND s.resolving = 1
                  AND ${editorialReviewSql('s')}) AS sources
         FROM casino_cases c WHERE c.case_id = ? AND c.quality_passed = 1 LIMIT 1`,
      [caseId],
    ))[0] || null;
  } catch (error) {}
  const url = `${ORIGIN}/casino/${encodeURIComponent(caseId)}`;
  const title = row ? `${row.brand_name} — Web3 casino forensic dossier | Chaindump` : 'Web3 casino forensic dossier — Chaindump';
  const desc = row
    ? `${row.brand_name} indexed Web3 casino lifecycle dossier with per-claim support status and registered evidence on Chaindump.`
    : OG_DESC_FALLBACK;
  const ld = row ? [
    {
      '@type': 'Article', '@id': `${url}#article`, headline: `${row.brand_name} — Web3 casino forensic dossier`,
      description: desc, url, mainEntityOfPage: url, dateModified: row.last_reviewed || undefined,
      isPartOf: { '@id': `${ORIGIN}/#site` }, author: { '@id': `${ORIGIN}/#org` },
      publisher: { '@id': `${ORIGIN}/#org` }, citation: publicSourceUrls(row.sources),
    },
    breadcrumb('Web3 Casino Analysis', `${ORIGIN}/casino-analysis`, row.brand_name, url),
  ] : undefined;
  const apiUrl = row ? `${ORIGIN}/api/casino/${encodeURIComponent(caseId)}` : undefined;
  await sendPage(req, res, { title, desc, url, ld, apiUrl });
}));
app.get('/scam/:slug', wrap(async (req, res) => {
  const slug = String(req.params.slug || '');
  let row = null;
  try { row = (await dbQuery(`SELECT name, category, amount_usd FROM scam_traces WHERE slug = ?`, [slug]))[0]; } catch (e) {}
  const title = row ? `${row.name} — Chaindump Scam Tracker` : 'Scam Tracker — Chaindump';
  const desc = row ? `${row.name}${row.amount_usd ? ` — ~$${fmtShort(row.amount_usd)} ${row.category || ''}` : ''}. Traced wallets, fund-flow and sources on Chaindump.` : OG_DESC_FALLBACK;
  const url = `${ORIGIN}/scam/${encodeURIComponent(slug)}`;
  // Article node describes the CASE (an event/report). Named-individual allegations
  // stay out of structured data per the human-review policy (CLAUDE.md §1.5).
  const ld = row ? [
    { '@type': 'Article', '@id': url + '#article', headline: `${row.name} — traced fund-flow`, description: desc, url, mainEntityOfPage: url, isPartOf: { '@id': ORIGIN + '/#site' }, author: { '@id': ORIGIN + '/#org' }, publisher: { '@id': ORIGIN + '/#org' } },
    breadcrumb('Scam Tracker', `${ORIGIN}/traces`, row.name, url),
  ] : undefined;
  await sendPage(req, res, { title, desc, url, ld });
}));

async function collectionPageRows(id) {
  try {
    const lifecycle = (await dbQuery(
      `SELECT slug, name, chain, status, profile, sources, updated_at
         FROM nft_collections WHERE slug = ? LIMIT 1`,
      [id],
    ))[0] || null;
    if (lifecycle) return { row: lifecycle, lifecycle };
  } catch (error) {
    console.error('[collection] lifecycle lookup failed:', error instanceof Error ? error.message : error);
  }
  if (!ENV.DB) return { row: null, lifecycle: null };
  try {
    const row = await ENV.DB.prepare(
      `SELECT name, chain FROM nft_catalog WHERE id = ?`,
    ).bind(id).first();
    return { row, lifecycle: null };
  } catch (error) {
    console.error('[collection] catalog lookup failed:', error instanceof Error ? error.message : error);
    return { row: null, lifecycle: null };
  }
}

function collectionPageTitle(row, lifecycle) {
  if (lifecycle) return `${row.name} — NFT lifecycle dossier | Chaindump`;
  if (row) return `${row.name} — Chaindump`;
  return 'NFT Collection — Chaindump';
}

function collectionPageDescription(row, lifecycle) {
  if (lifecycle) {
    return `${row.name} (${row.chain}) indexed NFT/Ordinals lifecycle dossier with per-claim support status and registered evidence on Chaindump.`;
  }
  if (row) return `${row.name} (${row.chain}) — live floor, market cap, 24h volume and holders on Chaindump.`;
  return OG_DESC_FALLBACK;
}

function collectionPageStructuredData(row, lifecycle, desc, url) {
  if (!row) return undefined;
  const name = lifecycle ? `${row.name} lifecycle evidence` : `${row.name} NFT market metrics`;
  const citation = lifecycle ? publicSourceUrls(lifecycle.sources) : ['https://www.coingecko.com/'];
  return [
    {
      '@type': 'Dataset',
      '@id': url + '#dataset',
      name,
      description: desc,
      url,
      isPartOf: { '@id': ORIGIN + '/#site' },
      publisher: { '@id': ORIGIN + '/#org' },
      dateModified: lifecycle?.updated_at || undefined,
      citation,
    },
    breadcrumb('NFT and Ordinals Analysis', `${ORIGIN}/nft-analysis`, row.name, url),
  ];
}

function collectionPageApiUrl(id, row, lifecycle) {
  if (lifecycle) return `${ORIGIN}/api/nft?slug=${encodeURIComponent(id)}`;
  if (row) return `${ORIGIN}/api/nft-collection/${encodeURIComponent(id)}`;
  return undefined;
}

app.get('/collection/:id', wrap(async (req, res) => {
  const id = String(req.params.id || '');
  // Curated lifecycle dossiers take precedence when a CoinGecko catalog id
  // happens to share the same slug (Azuki is a real example). The SPA opens a
  // lifecycle dossier for this URL, so its server metadata must not describe a
  // different live-market page.
  const { row, lifecycle } = await collectionPageRows(id);
  const title = collectionPageTitle(row, lifecycle);
  const desc = collectionPageDescription(row, lifecycle);
  const url = `${ORIGIN}/collection/${encodeURIComponent(id)}`;
  const ld = collectionPageStructuredData(row, lifecycle, desc, url);
  const apiUrl = collectionPageApiUrl(id, row, lifecycle);
  await sendPage(req, res, { title, desc, url, ld, apiUrl });
}));

// ---------------------------------------------------------------------------
// Phase D — agent-readiness / AI-discovery surface (robots, sitemap, Link
// headers, api-catalog). Content policy (Carson 2026-07-13): AI may read for
// search + answers, but NOT train — Content-Signal ai-train=no, search=yes,
// ai-input=yes. See docs/agent-readiness.md.
// ---------------------------------------------------------------------------
const ORIGIN = 'https://chaindump.xyz';

// OAuth is deliberately opt-in. Chaindump's production API currently uses
// x402 (USDC on Base), not bearer tokens, so publishing placeholder OAuth
// issuers, endpoints, or keys would make agent clients send credentials to a
// service that does not issue them. Set all required OAUTH_* variables only
// after a real authorization server is deployed and tested.
function oauthMetadataConfig() {
  const values = {
    issuer: ENV.OAUTH_ISSUER,
    authorizationEndpoint: ENV.OAUTH_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: ENV.OAUTH_TOKEN_ENDPOINT,
    jwksUri: ENV.OAUTH_JWKS_URI,
    registerUri: ENV.OAUTH_REGISTER_URI,
    claimUri: ENV.OAUTH_CLAIM_URI,
  };
  if (Object.values(values).some((value) => !value)) return null;
  try {
    for (const value of Object.values(values)) {
      const url = new URL(String(value));
      if (url.protocol !== 'https:') return null;
    }
  } catch (error) {
    return null;
  }
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value).replace(/\/$/, '')]));
}

function oauthUnavailable(c) {
  return c.json({
    error: 'oauth_not_configured',
    message: 'Chaindump currently authenticates metered agent requests with x402 (USDC on Base); no OAuth issuer is configured.',
    x402_manifest: `${ORIGIN}/api/agent/manifest`,
  }, 404, { 'cache-control': 'no-store' });
}

function oauthAuthorizationMetadata(config) {
  return {
    issuer: config.issuer,
    authorization_endpoint: config.authorizationEndpoint,
    token_endpoint: config.tokenEndpoint,
    jwks_uri: config.jwksUri,
    registration_endpoint: config.registerUri,
    grant_types_supported: ['authorization_code', 'client_credentials'],
    response_types_supported: ['code'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'private_key_jwt'],
    scopes_supported: ['agent:read'],
    // Auth.md's agent registration contract is published only alongside a
    // real registration endpoint; identity and credential claims remain
    // operator-controlled metadata, never invented by this Worker.
    agent_auth: {
      skill: `${ORIGIN}/auth.md`,
      register_uri: config.registerUri,
      identity_types_supported: ['anonymous'],
      anonymous: {
        credential_types_supported: ['bearer'],
        claim_uri: config.claimUri,
      },
    },
  };
}

const AI_CRAWLERS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-Web', 'anthropic-ai', 'Google-Extended', 'PerplexityBot', 'CCBot', 'Applebot-Extended', 'meta-externalagent'];
const ROBOTS_TXT = [
  '# Chaindump — real-time blockchain intelligence',
  '# Content usage (contentsignals.org): index for search and let AI assistants',
  '# cite/answer with our analysis, but do NOT train models on it.',
  '',
  'User-agent: *',
  'Content-Signal: ai-train=no, search=yes, ai-input=yes',
  'Allow: /',
  'Disallow: /api/agent/',
  '',
  ...AI_CRAWLERS.flatMap((ua) => [`User-agent: ${ua}`, 'Content-Signal: ai-train=no, search=yes, ai-input=yes', 'Allow: /', 'Disallow: /api/agent/', '']),
  `Sitemap: ${ORIGIN}/sitemap.xml`,
  '',
].join('\n');

app.get('/robots.txt', (c) => c.text(ROBOTS_TXT, 200, { 'cache-control': 'public, max-age=3600' }));

// llms.txt (llmstxt.org) — a compact, link-first map of the site for LLMs and
// AI-search crawlers. Built from VIEW_OG so it never drifts from the real views.
app.get('/llms.txt', (c) => {
  const label = (v) => (VIEW_OG[v][0] || '').replace(/ — Chaindump$/, '');
  const line = (v) => `- [${label(v)}](${ORIGIN}/${v}): ${VIEW_OG[v][1]}`;
  const contentViews = ['live', 'blockchain-analysis', 'exchange-analysis', 'casino-analysis', 'nft-analysis', 'mid', 'grave', 'traces', 'stables', 'rwa', 'infra', 'markets', 'geo', 'uspolicy', 'power', 'news'].filter((v) => VIEW_OG[v]);
  const body = [
    '# Chaindump',
    '',
    '> Real-time blockchain intelligence — analysis and aggregation with provenance across chains, assets, markets, policy and on-chain forensics. Chaindump answers "what is changing, why, and what to do about it", not "what is biggest". Every material figure cites a resolving, authoritative source.',
    '',
    'Chaindump is a public-data product. Its differentiation is sourced analysis, not raw numbers: each view pairs live metrics with a written analyst take and an explicit provenance trail.',
    '',
    '## Views',
    ...contentViews.map(line),
    '',
    '## Entity deep-links',
    '- Chain profile: ' + ORIGIN + '/chain/{name} (e.g. ' + ORIGIN + '/chain/ethereum) — live TVL, volume, fundamentals and analyst take.',
    '- Exchange dossier: ' + ORIGIN + '/exchange/{dex|cex}/{successful|mid|dead}/{slug} — cited lifecycle, causal map, strategy and unknowns.',
    '- Casino dossier: ' + ORIGIN + '/casino/{case_id} — indexed lifecycle and operating analysis with per-claim support, evidence state and review date.',
    '- Scam case: ' + ORIGIN + '/scam/{slug} — traced wallets, fund-flow and sources.',
    '- NFT collection: ' + ORIGIN + '/collection/{id} — curated lifecycle dossier when published, otherwise live collection metrics.',
    '',
    '## Full context',
    '- [llms-full.txt](' + ORIGIN + '/llms-full.txt): current top-chains table (real data) plus every view\'s analysis, inlined as text.',
    '',
    '## For agents',
    '- [Agent API (x402)](' + ORIGIN + '/api): versioned, provenance-tagged JSON API, payable per-call via x402 (USDC on Base).',
    '- [API catalog](' + ORIGIN + '/.well-known/api-catalog)',
    '- [Agent skills index](' + ORIGIN + '/.well-known/agent-skills/index.json)',
    '- [MCP server card](' + ORIGIN + '/.well-known/mcp/server-card.json) — Chaindump intelligence as MCP tools.',
    '',
    '## Sources & method',
    'DefiLlama (TVL), CoinGecko (prices), OFAC SDN via the 0xB10C mirror (sanctions screening, 900+ addresses across 18 chains), growthepie (active addresses), and government / mainstream / NPO sources for policy. Claims that name a private individual as a wrongdoer are human-reviewed before publication, never auto-generated.',
    '',
    '## Usage policy',
    'AI assistants may read Chaindump to answer and cite (Content-Signal: search=yes, ai-input=yes) but not to train models (ai-train=no). See ' + ORIGIN + '/robots.txt.',
    '',
  ].join('\n');
  return c.text(body, 200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=3600' });
});

// llms-full.txt — the SPA renders bodies from /api client-side, so non-JS AI
// crawlers can't read the actual numbers. This inlines the current top-chains
// table (real snapshot data, sourced) + every view's analyst framing as citable
// markdown text, closing the client-side-rendering gap for AI engines.
async function llmsFullBody() {
  let chainsMd = '_Live snapshot temporarily unavailable._';
  let asOf = '';
  try {
    if (!cache.data) cache = await loadSnapshot();
    if (cache.data && cache.data.updatedAt) asOf = ` (as of ${cache.data.updatedAt})`;
    const top = (cache.data.chains || []).slice(0, 25);
    if (top.length) {
      chainsMd = ['| # | Chain | TVL | 24h volume | Token price | Activity rank |', '|---|---|---|---|---|---|']
        .concat(top.map((ch) => `| ${ch.rank ?? ''} | ${ch.name}${ch.dataQuality ? ' ⚠️' : ''} | $${fmtShort(ch.tvl)}${ch.dataQuality ? ' (unverified)' : ''} | $${fmtShort(ch.volume24h)} | ${ch.tokenPrice != null ? '$' + ch.tokenPrice : '—'} | ${ch.rank ?? ''} |`)).join('\n');
      // Spell the caveat out in prose — a citing model reads the footnote, not just the glyph.
      const caveats = top.filter((ch) => ch.dataQuality);
      if (caveats.length) {
        chainsMd += '\n\n' + caveats.map((ch) => `> ⚠️ **${ch.name} — unverified TVL.** ${ch.dataQuality.summary}`).join('\n>\n');
      }
    }
  } catch (e) { console.error('[llms-full] snapshot skipped:', e && e.message); }
  const label = (v) => (VIEW_OG[v][0] || '').replace(/ — Chaindump$/, '');
  const contentViews = ['live', 'blockchain-analysis', 'exchange-analysis', 'casino-analysis', 'nft-analysis', 'mid', 'grave', 'traces', 'stables', 'rwa', 'infra', 'markets', 'geo', 'uspolicy', 'power', 'news'].filter((v) => VIEW_OG[v]);
  const body = [
    '# Chaindump — full context for LLMs',
    '',
    '> Real-time blockchain intelligence — sourced analysis and aggregation across chains, assets, markets, policy and on-chain forensics. This file inlines Chaindump\'s current headline data and per-view analysis as plain text, because the site UI renders from a JSON API client-side.',
    '',
    `## Top chains by composite on-chain activity${asOf}`,
    'Ranked by composite activity (50% volume, 30% TVL, 20% fees). Source: DefiLlama (TVL/volume), CoinGecko (price).',
    '',
    chainsMd,
    '',
    '## What each view covers',
    ...contentViews.map((v) => `### ${label(v)} (${ORIGIN}/${v})\n${VIEW_OG[v][1]}`),
    '',
    '## Provenance',
    'Every material figure cites a resolving, authoritative source: DefiLlama (TVL), CoinGecko (prices), OFAC SDN via the 0xB10C mirror (sanctions, 900+ addresses / 18 chains), growthepie (active addresses), government / mainstream / NPO sources (policy). Claims naming a private individual as a wrongdoer are human-reviewed before publication.',
    '',
    '## Programmatic access',
    `Agent API (x402, USDC on Base): ${ORIGIN}/api · API catalog: ${ORIGIN}/.well-known/api-catalog · MCP server card: ${ORIGIN}/.well-known/mcp/server-card.json`,
    '',
    `Usage: AI assistants may read and cite (search=yes, ai-input=yes); training is disallowed (ai-train=no). See ${ORIGIN}/robots.txt.`,
    '',
  ].join('\n');
  return body;
}
app.get('/llms-full.txt', async (c) =>
  c.text(await llmsFullBody(), 200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=600' }));

app.get('/sitemap.xml', async (c) => {
  const urls = [`${ORIGIN}/`, ...Object.keys(VIEW_OG).map((v) => `${ORIGIN}/${v}`)];
  let lastmod;
  try { // include the live top chains as entity deep-links when the snapshot is warm
    if (!cache.data) cache = await loadSnapshot();
    if (cache.data && cache.data.updatedAt) lastmod = new Date(cache.data.updatedAt).toISOString().slice(0, 10);
    for (const ch of (cache.data.chains || []).slice(0, 50)) urls.push(`${ORIGIN}/chain/${encodeURIComponent(ch.name)}`);
  } catch (e) { console.error('[sitemap] chain deep-links skipped:', e instanceof Error ? e.message : e); }
  try { // scam cases + NFT collections — real-time product, so worth crawling
    const scams = await dbQuery(`SELECT slug FROM scam_traces`).catch(() => []);
    for (const s of scams) if (s.slug) urls.push(`${ORIGIN}/scam/${encodeURIComponent(s.slug)}`);
    if (ENV.DB) { const { results } = await ENV.DB.prepare(`SELECT id FROM nft_catalog LIMIT 200`).all(); for (const r of (results || [])) if (r.id != null) urls.push(`${ORIGIN}/collection/${encodeURIComponent(r.id)}`); }
  } catch (e) { console.error('[sitemap] case/collection deep-links skipped:', e instanceof Error ? e.message : e); }
  try {
    const [exchanges, casinos, lifecycleNfts] = await Promise.all([
      // Sitemap coverage keeps DEX rows exchange-only while intentionally
      // including every centralized CEX venue type.
      dbQuery(
        `SELECT type AS kind, 'successful' AS lifecycle, slug FROM successful_exchanges WHERE venue_type = 'exchange' OR type = 'cex'
         UNION ALL SELECT kind, 'mid', slug FROM mid_exchanges WHERE venue_type = 'exchange' OR kind = 'cex'
         UNION ALL SELECT kind, 'dead', slug FROM dead_exchanges WHERE venue_type = 'exchange' OR kind = 'cex'`,
      ),
      dbQuery(`SELECT case_id FROM casino_cases WHERE quality_passed = 1`),
      dbQuery(`SELECT slug FROM nft_collections`),
    ]);
    for (const row of exchanges) {
      if (row.kind && row.lifecycle && row.slug) urls.push(`${ORIGIN}/exchange/${encodeURIComponent(row.kind)}/${encodeURIComponent(row.lifecycle)}/${encodeURIComponent(row.slug)}`);
    }
    for (const row of casinos) if (row.case_id) urls.push(`${ORIGIN}/casino/${encodeURIComponent(row.case_id)}`);
    for (const row of lifecycleNfts) if (row.slug) urls.push(`${ORIGIN}/collection/${encodeURIComponent(row.slug)}`);
  } catch (e) { console.error('[sitemap] forensic dossier deep-links skipped:', e instanceof Error ? e.message : e); }
  const lm = lastmod ? `<lastmod>${lastmod}</lastmod>` : '';
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => `  <url><loc>${u.replaceAll('&', '&amp;')}</loc>${lm}</url>`).join('\n')
    + '\n</urlset>\n';
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
});

// RFC 9727 API catalog — points agents at the x402 agent API, its manifest and health.
app.get('/.well-known/api-catalog', (c) => {
  const linkset = { linkset: [{
    anchor: `${ORIGIN}/api/agent`,
    'service-desc': [{ href: `${ORIGIN}/api/agent/manifest`, type: 'application/json' }],
    'service-doc': [{ href: `${ORIGIN}/api`, type: 'text/html' }],
    status: [{ href: `${ORIGIN}/api/health`, type: 'application/json' }],
  }] };
  return new Response(JSON.stringify(linkset), { headers: { 'content-type': 'application/linkset+json', 'cache-control': 'public, max-age=3600' } });
});

// OAuth/OIDC discovery is conditional on a real issuer. The public Chaindump
// API is x402-authenticated today; returning fabricated issuer or JWKS URLs is
// worse than a 404 because agents could try to provision credentials there.
app.get('/.well-known/oauth-authorization-server', (c) => {
  const config = oauthMetadataConfig();
  if (!config) return oauthUnavailable(c);
  return new Response(JSON.stringify(oauthAuthorizationMetadata(config), null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
});

app.get('/.well-known/openid-configuration', (c) => {
  const config = oauthMetadataConfig();
  if (!config) return oauthUnavailable(c);
  return new Response(JSON.stringify({
    ...oauthAuthorizationMetadata(config),
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
  }, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
});

// RFC 9728 metadata for the resource server. It is published only when the
// same issuer is configured as the authorization server, preventing a
// discoverable but unusable OAuth flow while Chaindump remains x402-first.
app.get('/.well-known/oauth-protected-resource', (c) => {
  const config = oauthMetadataConfig();
  if (!config) return oauthUnavailable(c);
  return new Response(JSON.stringify({
    resource: `${ORIGIN}/api/agent`,
    authorization_servers: [config.issuer],
    scopes_supported: ['agent:read'],
    bearer_methods_supported: ['header'],
  }, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
});

// Auth.md is always truthful, even before an OAuth issuer exists. It gives
// agents a complete x402 registration/provisioning path and explicitly says
// that no account or bearer credential is available today.
app.get('/auth.md', (c) => {
  const config = oauthMetadataConfig();
  const oauthSection = config ? [
    '',
    '## OAuth (configured)',
    '',
    `Use the authorization server metadata at ${ORIGIN}/.well-known/oauth-authorization-server.`,
    `Register at ${config.registerUri}; request the \'agent:read\' scope.`,
    `Use the protected-resource metadata at ${ORIGIN}/.well-known/oauth-protected-resource before sending a bearer token.`,
  ] : [
    '',
    '## OAuth (not configured)',
    '',
    'Chaindump does not currently issue OAuth/OIDC credentials. Do not send a bearer token or invent an issuer; the OAuth discovery routes intentionally return 404 until a real issuer, token endpoint, JWKS URI, and registration endpoint are configured.',
  ];
  const body = [
    '# auth.md — Chaindump agent access',
    '',
    '## Audience',
    '',
    'This document is for software agents that need cited, read-only blockchain, exchange, casino, NFT/Ordinals, policy, and on-chain forensic data from Chaindump.',
    '',
    '## Current access: x402',
    '',
    'Agent registration is not required for Chaindump\'s current x402 agent API; there is no account or bearer-credential provisioning endpoint. Discovery is free; metered calls use HTTP 402 and x402 payment in USDC on Base. Start with:',
    '',
    `- Manifest: ${ORIGIN}/api/agent/manifest`,
    `- API catalog: ${ORIGIN}/.well-known/api-catalog`,
    `- Health: ${ORIGIN}/api/health`,
    '',
    '## Registration and credential provisioning',
    '',
    'Registration endpoint: none required for the current x402 method. Supported method: x402 payment (HTTP 402, USDC on Base). Credential use: an x402 client signs the payment authorization requested by the response and sends it in X-PAYMENT; Chaindump does not issue bearer credentials or store an agent account.',
    '',
    'An x402-aware client reads the payment requirements from the 402 response, signs the requested USDC authorization, and retries with an X-PAYMENT header. In demo mode the API grants a small free quota and ignores payment headers; it never treats a client-supplied header as authentication.',
    '',
    'The API is read-only. Claims carry source/provenance fields and confidence; agents should preserve those citations and treat unverified or human-review-gated material as such.',
    ...oauthSection,
    '',
    '## Safety and contact',
    '',
    'Do not use this service to submit transactions, move funds, change accounts, or infer a person\'s guilt from an automated match. For access or disclosure questions, use the contact listed on the site.',
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=300' } });
});

// Agent Skills Discovery (RFC v0.2.0) — advertises Chaindump's differentiated
// agent capability, pointing at the LIVE x402 agent API (verified 200/402). The
// skill resource is served below; the index digests it so agents can integrity-
// check. (The MCP server-card is intentionally deferred until the chaindump-mcp
// server is hosted at a resolving URL — see docs/agent-readiness.md.)
const AGENT_SKILL_DOC = `# Chaindump — chain-intel (agent skill)

Differentiated blockchain intelligence for AI agents: OFAC sanctions screening,
chain forensics (why chains die/stall), live capital-flow & anomaly signals, and
country crypto power rankings. **Every response carries its sources; signals carry
a confidence score.** This is analysis + provenance — not raw TVL or spot prices
(get those free from DefiLlama/CoinGecko).

## Access
Query via the x402-payable agent API (USDC on Base): a free monthly quota, then
per-call payment. Discover prices, schemas and payment terms at
\`/api/agent/manifest\` and \`/.well-known/api-catalog\`.

## Entrypoints
- \`GET /api/agent/summary\` — market posture + top signals across all chains
- \`GET /api/agent/chain/{key}\` — full sourced profile + metrics + signals for one chain
- \`GET /api/agent/signals\` — live signal feed (momentum, capital rotation, anomalies)
- \`GET /api/agent/risk/{entity}\` — scam / bad-actor risk assessment with cited evidence

## Auth
x402 (HTTP 402 Payment Required on metered calls). Provenance is the product:
sources on every response, confidence (0–1) on every signal.
`;

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

app.get('/.well-known/agent-skills/chaindump-chain-intel.md', () =>
  new Response(AGENT_SKILL_DOC, { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=3600' } }));

app.get('/.well-known/agent-skills/index.json', async () => {
  const index = {
    $schema: 'https://agentskills.io/schema/v0.2.0/index.json',
    skills: [{
      name: 'chaindump-chain-intel',
      type: 'api',
      description: 'Differentiated blockchain intelligence — OFAC screening, chain forensics, live signals, country power rankings — via the x402 agent API. Sourced.',
      url: `${ORIGIN}/.well-known/agent-skills/chaindump-chain-intel.md`,
      sha256: await sha256Hex(AGENT_SKILL_DOC),
    }],
  };
  return new Response(JSON.stringify(index, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
});

// MCP Server Card (SEP-1649) — now that the chaindump-mcp server is hosted at a
// resolving URL (Cloud Run), advertise it so MCP clients can discover it.
const MCP_ENDPOINT = 'https://chaindump-mcp-270018525501.us-central1.run.app/mcp';
app.get('/.well-known/mcp/server-card.json', () => {
  const card = {
    serverInfo: { name: 'chaindump-chain-intel', version: '0.1.0' },
    description: "Chaindump's differentiated blockchain intelligence — OFAC screening, chain forensics, live signals, power rankings — as MCP tools. Every response sourced.",
    transport: { type: 'streamable-http', endpoint: MCP_ENDPOINT },
    capabilities: { tools: {} },
    tools: [
      { name: 'screen_address', description: 'OFAC SDN sanctions screening for a crypto address (+ scam matches, risk).' },
      { name: 'chain_intel', description: 'Composite profile + analyst take + risk for one chain.' },
      { name: 'chain_forensics', description: 'Tier verdict (thriving/mid/dying/dead) + why it is stuck + outlook + sources.' },
      { name: 'power_ranking', description: 'Country crypto power ranking.' },
      { name: 'rwa_depin', description: 'RWA protocols by TVL + DePIN networks by market cap.' },
      { name: 'scam_cases', description: 'Traced scam/exploit cases with fund-flow and sources.' },
    ],
    documentation: `${ORIGIN}/api`,
  };
  return new Response(JSON.stringify(card, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
});

// RFC 8288 Link header advertising the API catalog + service docs. Applied to
// the homepage (run_worker_first: ["/"]) and every Worker-served HTML view.
const DISCOVERY_LINK = `<${ORIGIN}/.well-known/api-catalog>; rel="api-catalog", <${ORIGIN}/api>; rel="service-doc", <${ORIGIN}/api/agent/manifest>; rel="service-desc"`;

// Homepage: Worker-served (run_worker_first: ["/"]) so we can attach the Link
// header (sendHtml sets it) and proper homepage OG tags.
app.get('/', wrap(async (req, res) => {
  // Markdown-for-agents (RFC content negotiation): an agent that explicitly asks
  // for text/markdown gets the inlined markdown; browsers send text/html and are
  // untouched, so HTML stays the default.
  if (prefersMarkdown(req.headers.accept)) {
    res.setHeader('content-type', 'text/markdown; charset=utf-8');
    res.setHeader('vary', 'Accept');
    res.setHeader('link', DISCOVERY_LINK);
    return res.status(200).html(await llmsFullBody());
  }
  sendHtml(res, ogHtml(await spaShell(ENV, req.raw), { title: 'Chaindump — Onchain Intelligence', desc: OG_DESC_FALLBACK, url: `${ORIGIN}/` }));
}));

// Graceful fallback for any unmatched path. A page navigation (GET, wants HTML,
// not /api or a file) renders the SPA shell — the client router lands the user
// on the live board instead of a bare "404 Not Found". API/asset paths keep a
// real 404 so agents and tooling see the correct status.
app.notFound(async (c) => {
  const url = new URL(c.req.url);
  const p = url.pathname;
  // Any extensionless GET that isn't an API/well-known path is a page route —
  // serve the SPA shell regardless of Accept so browsers AND crawlers/agents
  // (which often send Accept: */*) get the app, never a bare 404.
  const isPage = c.req.method === 'GET'
    && !p.startsWith('/api/') && !p.startsWith('/.well-known/')
    && !/\.[a-z0-9]+$/i.test(p); // has a file extension → treat as a missing asset
  if (isPage) {
    try {
      const html = ogHtml(await spaShell(ENV, c.req.raw), { title: 'Chaindump — Onchain Intelligence', desc: OG_DESC_FALLBACK, url: ORIGIN + p });
      return c.html(html, 200, { Link: DISCOVERY_LINK });
    } catch (e) { console.error('[notFound spa] failed:', e && e.message); }
  }
  if (p.startsWith('/api/')) return c.json({ error: 'not_found', path: p }, 404);
  return c.text('404 Not Found', 404);
});

// ---------------------------------------------------------------------------
// Cron Trigger — refreshes the D1 snapshot cache off the request path (real
// freshness bounded by the cron interval, not per-request cache luck) and
// appends a time-series row per chain, the backbone for flow/delta signals.
// ---------------------------------------------------------------------------
// Chaindump-owned 7d deltas for metrics no upstream API pre-computes (stablecoin
// share-of-TVL migration, active-address trend) — computed once here, off the
// request hot path, and baked into the cached snapshot blob every request reads.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_DELTA_SPAN_MS = 6 * 60 * 60 * 1000; // don't compute noisy deltas from <6h of history
async function computeSnapshotDeltas(env, now) {
  const out = {};
  try {
    const { results } = await env.DB.prepare(
      `SELECT chain, ts, tvl, stables, active_addresses FROM chain_snapshots WHERE ts >= ? ORDER BY chain, ts ASC`
    ).bind(now - SEVEN_DAYS_MS).all();
    const byChain = {};
    for (const r of results || []) (byChain[r.chain] = byChain[r.chain] || []).push(r);
    for (const chain in byChain) {
      const rows = byChain[chain];
      const oldest = rows[0], newest = rows[rows.length - 1];
      if (newest.ts - oldest.ts < MIN_DELTA_SPAN_MS) continue;
      const d = {};
      if (oldest.tvl > 0 && newest.tvl > 0 && oldest.stables != null && newest.stables != null) {
        d.stableShareDelta7d = +(((newest.stables / newest.tvl) - (oldest.stables / oldest.tvl)) * 100).toFixed(2);
      }
      if (oldest.active_addresses > 0 && newest.active_addresses != null) {
        d.activeAddressesDelta7d = +(((newest.active_addresses - oldest.active_addresses) / oldest.active_addresses) * 100).toFixed(1);
      }
      if (Object.keys(d).length) out[chain] = d;
    }
  } catch (e) { console.error('[computeSnapshotDeltas] failed:', e.message); }
  return out;
}

// Unbounded growth guard — bounded delete (D1 has no LIMIT on DELETE, so page
// by rowid) run only occasionally, not worth its own cron tick's CPU every time.
async function pruneOldSnapshots(env, now) {
  try {
    const { meta } = await env.DB.prepare(
      `DELETE FROM chain_snapshots WHERE id IN (SELECT id FROM chain_snapshots WHERE ts < ? LIMIT 2000)`
    ).bind(now - 90 * 24 * 60 * 60 * 1000).run();
    if (meta && meta.changes) console.error(`[pruneOldSnapshots] deleted ${meta.changes} rows older than 90d`);
  } catch (e) { console.error('[pruneOldSnapshots] failed:', e.message); }
}

export async function forensicReviewCounts(env, today) {
  const count = async (sql, bind = []) => {
    const statement = bind.length ? env.DB.prepare(sql).bind(...bind) : env.DB.prepare(sql);
    const { results } = await statement.all();
    return Number(results?.[0]?.count || 0);
  };
  const [scannedNft, dueNft, scannedExchange, dueExchange, scannedCasino, dueCasino, scannedChain, dueChain] = await Promise.all([
    count(`SELECT COUNT(*) AS count FROM nft_collections`),
    count(
      `SELECT COUNT(*) AS count
         FROM nft_collections
        WHERE COALESCE(
          json_extract(profile, '$.evidence_policy.next_review_at'),
          json_extract(profile, '$.review.next_review_at'),
          date(substr(updated_at, 1, 10), '+90 days')
        ) <= ?`,
      [today],
    ),
    count(
      `SELECT COUNT(*) AS count FROM (
         SELECT slug, kind FROM dead_exchanges
         UNION ALL
         SELECT slug, kind FROM mid_exchanges
         UNION ALL
         SELECT slug, type AS kind FROM successful_exchanges
       )`,
    ),
    count(
      `WITH lifecycle_cases AS (
         SELECT slug, kind, 'dead' AS lifecycle, profile FROM dead_exchanges
         UNION ALL
         SELECT slug, kind, 'mid' AS lifecycle, profile FROM mid_exchanges
         UNION ALL
         SELECT slug, type AS kind, 'successful' AS lifecycle, profile FROM successful_exchanges
       )
       SELECT COUNT(*) AS count
         FROM lifecycle_cases AS dossier
         LEFT JOIN exchange_case_features AS feature
           ON feature.kind = dossier.kind
          AND feature.slug = dossier.slug
          AND feature.lifecycle = dossier.lifecycle
        WHERE COALESCE(
          json_extract(dossier.profile, '$.forensic_analysis.review.next_review_at'),
          feature.next_review_at
        ) <= ?`,
      [today],
    ),
    count(`SELECT COUNT(*) AS count FROM casino_cases WHERE quality_passed = 1`),
    count(
      `SELECT COUNT(*) AS count
         FROM casino_cases AS casino
         LEFT JOIN casino_syntheses AS synthesis ON synthesis.case_id = casino.case_id
        WHERE casino.quality_passed = 1
          AND COALESCE(
            json_extract(synthesis.outlook, '$.forensic_analysis.review.next_review_at'),
            date(casino.last_reviewed, '+90 days'),
            date(substr(casino.updated_at, 1, 10), '+90 days')
          ) <= ?`,
      [today],
    ),
    count(`SELECT COUNT(*) AS count FROM chain_facts WHERE dimension = '_meta'`),
    count(
      `SELECT COUNT(*) AS count
         FROM chain_facts
        WHERE dimension = '_meta'
          AND COALESCE(
            json_extract(data, '$.next_review_at'),
            date(json_extract(data, '$.last_reviewed'), '+90 days'),
            date(substr(updated_at, 1, 10), '+90 days')
          ) <= ?`,
      [today],
    ),
  ]);
  return { scannedNft, dueNft, scannedExchange, dueExchange, scannedCasino, dueCasino, scannedChain, dueChain };
}

const FORENSIC_REVIEW_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function recordForensicReviewHeartbeat(env, now) {
  if (!env.DB) return;
  const scheduledAt = new Date(now).toISOString();
  const today = scheduledAt.slice(0, 10);
  try {
    const counts = await forensicReviewCounts(env, today);
    await env.DB.prepare(
      `INSERT INTO forensic_refresh_runs
        (scheduled_at, completed_at, status, scanned_nft, due_nft, scanned_exchange, due_exchange, scanned_casino, due_casino, scanned_chain, due_chain, notes)
       VALUES (?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      scheduledAt, new Date().toISOString(), counts.scannedNft, counts.dueNft,
      counts.scannedExchange, counts.dueExchange, counts.scannedCasino, counts.dueCasino,
      counts.scannedChain, counts.dueChain,
      'Automated six-hour review-debt scan. Lifecycle, legal, narrative, and causal changes require human promotion.',
    ).run();
  } catch (error) {
    console.error('[forensics-review] heartbeat failed:', error?.message || error);
  }
}

async function recordForensicReviewHeartbeatIfDue(env, now) {
  if (!env.DB) return;
  try {
    const latest = await env.DB.prepare(
      `SELECT scheduled_at
         FROM forensic_refresh_runs
        WHERE status = 'completed'
        ORDER BY run_id DESC
        LIMIT 1`,
    ).first();
    const lastScheduledAt = Date.parse(latest?.scheduled_at || '');
    if (Number.isFinite(lastScheduledAt) && now - lastScheduledAt < FORENSIC_REVIEW_INTERVAL_MS) return;
    await recordForensicReviewHeartbeat(env, now);
  } catch (error) {
    // A missing migration or transient D1 error must not take down live-market
    // refreshes. The next five-minute trigger retries because no successful
    // heartbeat timestamp was recorded.
    console.error('[forensics-review] due check failed:', error?.message || error);
  }
}

async function handleScheduled(event, env, ctx) {
  if (!ENV.__init) { Object.assign(ENV, env || {}); ENV.__init = true; }
  const scheduledTime = Number(event?.scheduledTime);
  const reviewNow = Number.isFinite(scheduledTime) && scheduledTime > 0 ? scheduledTime : Date.now();
  // Evidence governance is independent of the volatile market-data pipeline.
  // Run immediately in a new environment, then relative to the last successful
  // heartbeat. This also recovers on the next five-minute tick after a missed
  // six-hour boundary.
  if (env.DB) await recordForensicReviewHeartbeatIfDue(env, reviewNow);
  // Read the prior blob BEFORE overwriting it, so peer hysteresis has last tick's
  // peers to compare against (otherwise the anti-churn rule is a no-op).
  let priorData = null;
  if (env.DB) {
    try { const row = await env.DB.prepare(`SELECT data FROM snapshot_cache WHERE key='chains'`).first(); if (row?.data) priorData = JSON.parse(row.data); }
    catch (e) { /* first run / cold cache — no prior, peers computed verbatim */ }
  }
  // buildSnapshot REFUSES to return a board it cannot stand behind — a dead
  // volume/fee feed, or every row falling back to the over-counted aggregate.
  // That refusal must not take the rest of the cron with it: this call had no
  // try/catch, so one transient DefiLlama rate-limit would silently skip the
  // RWA/DePIN refresh, the OFAC sanctions update and the snapshot prune too.
  // A refused board is the intended outcome — the last good snapshot stays, and
  // /api/chains now reports it as stale by age.
  let data = null;
  try {
    data = await buildSnapshot({ prior: priorPeersByKey(priorData) });
  } catch (e) {
    console.error('[cron] snapshot build refused, keeping last good:', e.message);
  }
  const ts = Date.now();

  if (env.DB) {
    const rows = (data && data.chains) || [];
    const stmt = env.DB.prepare(
      `INSERT INTO chain_snapshots (ts, chain, tvl, volume24h, fees24h, stables, active_addresses, token_price, token_mcap, score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const batch = rows.map((c) => stmt.bind(
      ts, c.name, c.tvl ?? null, c.volume24h ?? null, c.fees24h ?? null, c.stables ?? null,
      c.activeAddresses ?? null, c.tokenPrice ?? null, c.tokenMcap ?? null, c.score ?? null
    ));
    if (batch.length) await env.DB.batch(batch);

    const deltas = await computeSnapshotDeltas(env, ts);
    for (const c of rows) Object.assign(c, deltas[c.name] || {});

    const tick = Math.floor(ts / (5 * 60 * 1000));
    // roughly every 4 hours (1-in-48 five-minute ticks) is plenty for a 90-day prune
    if (tick % 48 === 0) await pruneOldSnapshots(env, ts);
    // RWA/DePIN breadth changes slowly — refresh ~hourly (1-in-12 ticks)
    if (tick % 12 === 0) await refreshRwaDepin(env);
    // CEX trust-score ranking doesn't move hourly — ~4-hourly is plenty, and
    // keeps this off CoinGecko's shared quota the rest of the day.
    if (tick % 48 === 0) await refreshCex(env);
    // OFAC SDN list updates often; keep the wallet-screening set current daily (1-in-288)
    if (tick % 288 === 0) await refreshSanctioned(env);
    // NFT collection universe changes slowly — re-index ~weekly (1-in-2016)
    if (tick % 2016 === 0) await refreshNftCatalog(env);
  }

  // No board this tick: leave the cache and D1 holding the last good one.
  if (!data) return;
  if (!env.DB) { const blob = { ...data }; delete blob.chainsLite; cache = { ts, data: blob }; return; }
  cache = { ts, data: await persistSnapshot(env.DB, data, ts) };
}

export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
};

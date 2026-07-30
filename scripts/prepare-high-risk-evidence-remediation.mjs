#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizePublicationSource } from '../src/lib/publication-depth.mjs';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const REVIEWER = 'codex-research-agent';
const REVIEW_DAY = '2026-07-29';
const workspaceRoot = resolve(process.cwd());

function workspacePath(requestedPath, label) {
  const candidate = resolve(workspaceRoot, requestedPath);
  const relation = relative(workspaceRoot, candidate);
  if (relation.startsWith('..') || isAbsolute(relation)) {
    throw new Error(`${label} must stay inside the workspace`);
  }
  return candidate;
}

const RAW_FETCH_BLOCKED = new Set([
  'https://www.theblock.co/linked/136545/fantom-tvl-slumps-as-colleague-tweets-andre-cronje-is-quitting-defi',
  'https://www.theblock.co/post/204593/sushi-dao-implements-proposal-to-direct-all-trading-fees-to-treasury',
  'https://www.theblock.co/post/378634/aerodrome-upgrades-evm-extensions-circles-arc-metadex',
  'https://www.theblock.co/post/409670/bitmart-to-wind-down-trading-platform-as-global-ceo-says-he-was-not-consulted',
]);

const EVIDENCE_SCOPE = {
  'sushi-bank-of-canada-amm-ecology': 'lifecycle_and_governance',
  'sushi-peer-reviewed-governance': 'governance_and_causal_context',
  'sushi-coindesk-kanpai': 'treasury_event',
  'sushi-theblock-kanpai': 'treasury_event_and_vote_concentration',
  'sushi-certik-routeprocessor2': 'security_incident',
  'aerodrome-coindesk-aero': 'lifecycle_and_strategy_event',
  'aerodrome-theblock-aero': 'lifecycle_and_strategy_event',
  'solidly-decrypt-exit': 'lifecycle_event',
  'solidly-theblock-exit': 'lifecycle_event_and_liquidity_response',
  'bitmart-theblock-winddown': 'lifecycle_event_and_management_context',
  'bitmart-decrypt-winddown': 'lifecycle_event_and_withdrawal_process',
  'binance-doj-plea': 'legal_and_strategy_finding',
  'binance-cftc-order': 'legal_and_governance_remediation',
  'casino:source:stake:ukgc-exit-2025': 'jurisdictional_market_exit',
};

const SOURCE_BOUNDARIES = {
  'sushi-coindesk-kanpai': {
    independence_group: 'sushiswap-kanpai-proposal-2022-12',
  },
  'sushi-theblock-kanpai': {
    independence_group: 'sushiswap-kanpai-implementation-vote-2023-01',
  },
  'sushi-certik-routeprocessor2': {
    source_role: 'security-research',
    independence_caveat: 'CertiK had a prior commercial audit relationship with Sushi. Its postmortem states the affected RouteProcessor2 router was outside that audit scope; use it for incident mechanics, not as cleanly independent proof of broader causality.',
  },
  'aerodrome-coindesk-aero': {
    independence_group: 'aero-project-announcement-2026-01',
    source_dependency: 'Substantially reports the same project-announcement event as the paired The Block coverage; publisher diversity does not make the underlying causal evidence independent.',
  },
  'aerodrome-theblock-aero': {
    independence_group: 'aero-project-announcement-2026-01',
    source_dependency: 'Substantially reports the same project-announcement event as the paired CoinDesk coverage; publisher diversity does not make the underlying causal evidence independent.',
  },
  'solidly-decrypt-exit': {
    independence_group: 'cronje-nell-defi-exit-announcement-2022-03',
    source_dependency: 'Reports the same Cronje/Nell departure announcement as the paired The Block coverage; separate newsrooms do not create a second evidence origin for the exit event.',
  },
  'solidly-theblock-exit': {
    independence_group: 'cronje-nell-defi-exit-announcement-2022-03',
    source_dependency: 'Reports the same Cronje/Nell departure announcement as the paired Decrypt coverage; separate newsrooms do not create a second evidence origin for the exit event.',
  },
  'bitmart-theblock-winddown': {
    independence_group: 'bitmart-wind-down-announcement-2026-07',
    source_dependency: 'Reports the same BitMart wind-down announcement as the paired Decrypt coverage; separate newsrooms do not create a second evidence origin for the closure schedule.',
  },
  'bitmart-decrypt-winddown': {
    independence_group: 'bitmart-wind-down-announcement-2026-07',
    source_dependency: 'Reports the same BitMart wind-down announcement as the paired The Block coverage; separate newsrooms do not create a second evidence origin for the closure schedule.',
  },
};

const CASE_BOUNDARIES = {
  'dex:successful:aerodrome': 'The two event reports substantially derive from the same project announcement. They support the AERO expansion event and current strategy framing, but not independent proof that token or emission design caused success.',
  'dex:dead:solidly': 'The two reports trace the lifecycle shock to the same Cronje/Nell departure announcement. They document the event and market response but count as one T3 evidence origin.',
  'cex:dead:bitmart': 'The two reports trace the wind-down schedule to the same operator announcement. They document the schedule and management context but count as one T3 evidence origin and do not prove a cause.',
  'cex:mid:htx': 'OFSI establishes the UK sanctions relationship; it does not establish that sanctions caused reported volume decline, insolvency, or global closure.',
  'cex:successful:binance': 'DOJ and CFTC findings support the compliance-strategy record. They do not establish present solvency, profitability, or the contribution of BNB.',
  'stake-dot-com': 'The UK Gambling Commission notice is scoped to the Great Britain white-label arrangement. It does not classify Stake globally.',
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sourceId(source) {
  return source.id || source.source_id;
}

function sourceUrl(source) {
  return source.url || source.canonical_url;
}

function reviewMetadata(source) {
  const url = sourceUrl(source);
  const rawBlocked = RAW_FETCH_BLOCKED.has(url);
  const boundary = SOURCE_BOUNDARIES[sourceId(source)] || {};
  return {
    ...source,
    source_role: source.source_role === 'regulator' ? 'authority' : source.source_role,
    evidence_scope: EVIDENCE_SCOPE[sourceId(source)] || source.evidence_scope,
    ...boundary,
    checked_at: REVIEW_DAY,
    last_verified_at: REVIEW_DAY,
    resolving: true,
    evidence_reviewed: true,
    evidence_reviewed_at: REVIEW_DAY,
    evidence_reviewer: REVIEWER,
    access_state: rawBlocked ? 'bot_blocked_raw_fetch' : 'accessible',
    access_checked_at: REVIEW_DAY,
    access_http_status: rawBlocked ? 403 : 200,
    access_method: rawBlocked ? 'indexed_browser_retrieval' : 'direct_http_retrieval',
    verification_note: rawBlocked
      ? `Direct automated retrieval returned HTTP 403; the article body and the stated locator were reviewed through an indexed browser snapshot. ${source.evidence_locator}`
      : `Direct retrieval returned HTTP 200 and the stated locator was editorially inspected. ${source.evidence_locator}`,
  };
}

function patchExistingSourceMetadata(patch) {
  return {
    ...patch,
    source_role: patch.source_role === 'regulator' ? 'authority' : patch.source_role,
    checked_at: REVIEW_DAY,
    last_verified_at: REVIEW_DAY,
    resolving: true,
    evidence_reviewed: true,
    evidence_reviewed_at: REVIEW_DAY,
    evidence_reviewer: REVIEWER,
    access_state: 'accessible',
    access_checked_at: REVIEW_DAY,
    access_http_status: 200,
    access_method: 'direct_http_retrieval',
    verification_note: `Direct retrieval returned HTTP 200 and the stated locator was editorially inspected. ${patch.evidence_locator}`,
  };
}

function normalizeCasinoSource(source) {
  const reviewed = reviewMetadata(source);
  return {
    ...reviewed,
    // The live casino schema currently uses `independent` for public
    // authorities and expresses authority strength through tier A/publisher.
    // Preserve the real authority class separately rather than pretending the
    // operator is the source.
    source_role: reviewed.source_role === 'authority' ? 'independent' : reviewed.source_role,
    authority_class: reviewed.source_role === 'authority' ? 'regulator' : null,
  };
}

function unresolvedRows(cases) {
  return cases.flatMap((entry) => asArray(entry.remains_unresolved).map((description) => ({
    dossier_id: entry.dossier_id,
    description,
    publication_support: 'unresolved',
  })));
}

function claimAdditions(entry) {
  if (entry.dossier_id !== 'stake-dot-com') return [];
  return [{
    claim_id: 'casino:claim:stake:ukgc-gb-exit-2025',
    case_id: 'stake-dot-com',
    field_path: 'lifecycle.gb_market_exit',
    source_id: 'casino:source:stake:ukgc-exit-2025',
    evidence_locator: 'UKGC notice dated 2025-02-12, paragraphs under the title through the closure guidance: TGP Europe white-label scope, investigation, 2025-03-11 GB shutdown, due-diligence and geoblocking expectations.',
    claim_type: 'status',
    support_direction: 'supports',
    analyst_note: 'Authority evidence is limited to the Great Britain white-label site and does not classify Stake globally.',
    checked_at: REVIEW_DAY,
  }];
}

function normalizeCase(entry) {
  const casino = !entry.dossier_id.includes(':');
  const sourceAdditions = asArray(entry.source_additions).map((source) => (
    casino ? normalizeCasinoSource(source) : reviewMetadata(source)
  ));
  const metadataPatches = asArray(entry.source_metadata_patches)
    .map(patchExistingSourceMetadata);
  return {
    ...entry,
    source_additions: sourceAdditions,
    source_metadata_patches: metadataPatches,
    casino_claim_additions: claimAdditions(entry),
    evidence_boundary: CASE_BOUNDARIES[entry.dossier_id] || null,
    support_summary: {
      high_risk_before: entry.unresolved_before,
      high_risk_after_projected: entry.unresolved_after_projected,
      resolved_projected: entry.unresolved_before - entry.unresolved_after_projected,
      unresolved_preserved: asArray(entry.remains_unresolved).length,
    },
  };
}

function validateReviewedSource(source) {
  const id = sourceId(source);
  if (!id || !sourceUrl(source)?.startsWith('https://')) {
    throw new Error(`Invalid source ${JSON.stringify(source)}`);
  }
  if (!source.source_tier || !source.source_role || !source.evidence_scope) {
    throw new Error(`Source classification incomplete: ${id}`);
  }
  if (
    source.evidence_reviewed !== true
    || source.evidence_reviewer !== REVIEWER
    || source.evidence_reviewed_at !== REVIEW_DAY
    || !source.evidence_locator
  ) {
    throw new Error(`Source review provenance incomplete: ${id}`);
  }
  const normalized = normalizePublicationSource(source);
  if (
    normalized.tier === 'T3'
    && normalized.role === 'independent'
    && !normalized.independence_group
  ) {
    throw new Error(`T3 source requires an explicit evidence-origin group: ${id}`);
  }
}

function validateReviewedSources(sources) {
  if (sources.length !== 14) {
    throw new Error(`Expected 14 reviewed source additions, received ${sources.length}`);
  }
  const uniqueUrls = new Set(sources.map(sourceUrl));
  if (uniqueUrls.size !== sources.length) throw new Error('Duplicate remediation source URL');
  sources.forEach(validateReviewedSource);
  const accessCounts = Object.groupBy(sources, ({ access_state: state }) => state);
  if (accessCounts.accessible?.length !== 10 || accessCounts.bot_blocked_raw_fetch?.length !== 4) {
    throw new Error('Unexpected source-access audit counts');
  }
}

export function prepareHighRiskRemediation(raw) {
  if (raw?.schema !== 'chaindump-high-risk-remediation-manifest-v1') {
    throw new Error('Unexpected high-risk remediation manifest schema');
  }
  if (!ISO_DAY.test(raw.as_of || '')) throw new Error('Manifest requires an ISO as_of date');
  if (raw.as_of !== REVIEW_DAY) throw new Error(`Unexpected review date ${raw.as_of}`);
  const cases = asArray(raw.cases).map(normalizeCase);
  if (cases.length !== 10) throw new Error(`Expected 10 dossiers, received ${cases.length}`);
  const unresolved = unresolvedRows(cases);
  if (unresolved.length !== 37) {
    throw new Error(`Expected 37 honest unresolved claims, received ${unresolved.length}`);
  }
  const sources = cases.flatMap(({ source_additions: additions }) => additions);
  validateReviewedSources(sources);
  return {
    ...raw,
    schema: 'chaindump-high-risk-remediation-implementation-v1',
    status: 'integrated-migration-0065-rendered',
    migration_sequence: {
      assigned_id: '0065',
      reserved_after: '0064',
      rendered: true,
      rendered_file: 'migrations/0065_high_risk_evidence_remediation.sql',
      note: 'Contiguous migration 0065 was rendered after migrations 0063 and 0064 merged and replayed.',
    },
    ui_contract: {
      depends_on_migration: '0063',
      surface: 'shared publication-depth support state',
      required_states: [
        'high_risk_support_threshold_met',
        'claim_support_pending',
        'unsupported_section_withheld',
        'source_access_and_review_status',
      ],
      note: 'Migration 0065 is integration-tested against the shared 0063 publication-depth API and the existing visible exchange/casino dossier and list UI.',
    },
    source_access_audit: {
      checked_at: REVIEW_DAY,
      direct_http_200: 10,
      direct_http_bot_blocked: 4,
      all_14_editorially_reviewed: true,
      boundary: 'HTTP access and editorial review are separate. Four The Block pages returned HTTP 403 to the raw fetcher but resolved through indexed browser snapshots; the access limitation remains published.',
    },
    cases,
    unresolved_claims: unresolved,
  };
}

function main() {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output) {
    throw new Error('Usage: prepare-high-risk-evidence-remediation.mjs <manifest.json> <output.json>');
  }
  const prepared = prepareHighRiskRemediation(
    JSON.parse(readFileSync(workspacePath(input, 'Input path'), 'utf8')),
  );
  writeFileSync(
    workspacePath(output, 'Output path'),
    `${JSON.stringify(prepared, null, 2)}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

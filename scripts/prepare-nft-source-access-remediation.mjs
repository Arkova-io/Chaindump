#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ACCESS_CLASS_TO_STATE = {
  access_verified: 'accessible',
  bot_blocked: 'bot_blocked',
  unverified: 'unverified',
  dead: 'dead',
};

const EXPECTED_AUDIT_COUNTS = {
  access_verified: 171,
  bot_blocked: 21,
  unverified: 5,
  dead: 1,
};

const REPAIR_SOURCES = [
  {
    dossier_slug: 'bored-ape-yacht-club',
    replaces_source_id: 'bayc-origin',
    source: {
      id: 'bayc-founding-current',
      title: 'The Birth of the Bored Ape Yacht Club',
      url: 'https://boredapeyachtclub.com/activations/bayc-founding',
      publisher: 'Bored Ape Yacht Club / Yuga Labs',
      source_date: '2021-04-23',
      source_date_kind: 'event',
      evidence_scope: 'historical_event',
      access_state: 'accessible',
      access_checked_at: '2026-07-29',
      checked_at: '2026-07-29',
      last_verified_at: '2026-07-29',
      access_http_status: 200,
      verification_note: 'HTTP 200 and the current official page states that 10,000 Bored Apes were released on April 23, 2021.',
    },
  },
  {
    dossier_slug: 'bored-ape-yacht-club',
    supplements_source_id: 'bayc-origin',
    source: {
      id: 'bayc-license-current',
      title: 'BAYC License',
      url: 'https://boredapeyachtclub.com/bayc-license',
      publisher: 'Bored Ape Yacht Club / Yuga Labs',
      source_date: '2026-07-29',
      source_date_kind: 'observed',
      evidence_scope: 'mechanism',
      access_state: 'accessible',
      access_checked_at: '2026-07-29',
      checked_at: '2026-07-29',
      last_verified_at: '2026-07-29',
      access_http_status: 200,
      verification_note: 'HTTP 200; current official ownership and commercial-use terms inspected.',
    },
  },
  {
    dossier_slug: 'decentraland-land',
    replaces_source_id: 'dcl-marketplace',
    source: {
      id: 'dcl-marketplace-current',
      title: 'LAND Manager',
      url: 'https://docs.decentraland.org/marketplace/land-manager',
      publisher: 'Decentraland',
      source_date: '2026-07-29',
      source_date_kind: 'observed',
      evidence_scope: 'current_state',
      stale_after: '2026-10-29',
      stale: false,
      access_state: 'accessible',
      access_checked_at: '2026-07-29',
      checked_at: '2026-07-29',
      last_verified_at: '2026-07-29',
      access_http_status: 200,
      verification_note: 'HTTP 200; current official LAND and Estate management documentation inspected.',
    },
  },
  {
    dossier_slug: 'funko-digital-pop',
    replaces_source_id: 'funko-faq',
    source: {
      id: 'funko-digital-current',
      title: 'Funko Digital Pop — program mechanics and sunset notice',
      url: 'https://funko.com/digital-pop.html',
      publisher: 'Funko',
      source_date: '2026-07-29',
      source_date_kind: 'observed',
      evidence_scope: 'mechanism',
      access_state: 'accessible',
      access_checked_at: '2026-07-29',
      checked_at: '2026-07-29',
      last_verified_at: '2026-07-29',
      access_http_status: 200,
      verification_note: 'HTTP 200; current official page describes packs, redemption tokens, physical figures, marketplace use, and the sunset.',
    },
  },
  {
    dossier_slug: 'nifty-gateway',
    replaces_source_id: 'nifty-s1',
    source: {
      id: 'nifty-s1-sec',
      title: 'Gemini Space Station S-1/A — Nifty Gateway Studio description',
      url: 'https://www.sec.gov/Archives/edgar/data/2055592/000110465925085963/tm255912-15_s1a.htm',
      publisher: 'U.S. Securities and Exchange Commission / Gemini Space Station, Inc.',
      source_date: '2025-09-02',
      source_date_kind: 'published',
      evidence_scope: 'mechanism',
      access_state: 'accessible',
      access_checked_at: '2026-07-29',
      checked_at: '2026-07-29',
      last_verified_at: '2026-07-29',
      access_http_status: 200,
      verification_note: 'HTTP 200; SEC-hosted filing identifies Nifty Gateway Studio and Gemini product rails.',
    },
  },
  {
    dossier_slug: 'nifty-gateway',
    replaces_source_id: 'nifty-risk',
    source: {
      id: 'nifty-risk-sec',
      title: 'Gemini Q3 2025 Form 10-Q — Nifty Gateway demand and commercial-viability risk',
      url: 'https://www.sec.gov/Archives/edgar/data/2055592/000205559225000009/gemi-20250930.htm',
      publisher: 'U.S. Securities and Exchange Commission / Gemini Space Station, Inc.',
      source_date: '2025-11-10',
      source_date_kind: 'published',
      evidence_scope: 'mechanism',
      access_state: 'accessible',
      access_checked_at: '2026-07-29',
      checked_at: '2026-07-29',
      last_verified_at: '2026-07-29',
      access_http_status: 200,
      verification_note: 'HTTP 200; SEC-hosted filing explicitly discusses unpredictable NFT demand and potential Nifty Gateway discontinuation if not commercially viable.',
    },
  },
  {
    dossier_slug: 'nifty-gateway',
    replaces_source_id: 'nifty-8k',
    source: {
      id: 'nifty-winddown-sec',
      title: 'Gemini Q4 2025 shareholder letter — Nifty Gateway wound down',
      url: 'https://www.sec.gov/Archives/edgar/data/2055592/000205559226000023/gemiq425shareholderlette.htm',
      publisher: 'U.S. Securities and Exchange Commission / Gemini Space Station, Inc.',
      source_date: '2026-03-19',
      source_date_kind: 'published',
      evidence_scope: 'terminal_outcome',
      access_state: 'accessible',
      access_checked_at: '2026-07-29',
      checked_at: '2026-07-29',
      last_verified_at: '2026-07-29',
      access_http_status: 200,
      verification_note: 'HTTP 200; SEC-hosted shareholder letter states that Gemini wound down Nifty Gateway.',
    },
  },
];

function day(value) {
  return typeof value === 'string' ? value.slice(0, 10) : null;
}

function auditRecord(item) {
  const accessState = ACCESS_CLASS_TO_STATE[item.audit?.access_class];
  if (!accessState) throw new Error(`Unknown access class for ${item.dossier_slug}:${item.source_id}`);
  return {
    dossier_slug: item.dossier_slug,
    source_id: item.source_id,
    url: item.url,
    access_state: accessState,
    access_checked_at: day(item.audit.checked_at),
    http_status: item.audit.http_status,
    final_url: item.audit.final_url,
    verification_note: item.audit.reason,
    remediation_priority: item.remediation_priority,
  };
}

function countBy(items, selector) {
  const counts = {};
  for (const item of items) {
    const key = selector(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export function prepareRemediationDocument(rawAudit) {
  if (rawAudit?.schema !== 'nft-source-access-remediation-v1') {
    throw new Error('Unexpected source-access audit schema');
  }
  const auditRecords = (rawAudit.items || []).map(auditRecord);
  if (auditRecords.length !== 198) throw new Error(`Expected 198 audited records, received ${auditRecords.length}`);
  const unique = new Set(auditRecords.map(({ dossier_slug: slug, source_id: id }) => `${slug}:${id}`));
  if (unique.size !== auditRecords.length) throw new Error('Duplicate dossier/source identity in source-access audit');
  const actualCounts = countBy(rawAudit.items, (item) => item.audit.access_class);
  if (JSON.stringify(actualCounts) !== JSON.stringify(EXPECTED_AUDIT_COUNTS)) {
    throw new Error(`Unexpected audit counts: ${JSON.stringify(actualCounts)}`);
  }

  const repairTargets = REPAIR_SOURCES.filter(({ replaces_source_id: id }) => id)
    .map(({ dossier_slug: slug, replaces_source_id: id }) => `${slug}:${id}`);
  const criticalTargets = auditRecords.filter(({ remediation_priority: priority }) => priority === 'critical')
    .map(({ dossier_slug: slug, source_id: id }) => `${slug}:${id}`);
  if (JSON.stringify(repairTargets.sort()) !== JSON.stringify(criticalTargets.sort())) {
    throw new Error('Every critical source must have one replacement');
  }

  return {
    schema: 'chaindump-nft-source-remediation-v1',
    research_as_of: '2026-07-29',
    migration_sequence: {
      reserved_after: '0063',
      confirmed_id: '0064',
      rendered: false,
      note: 'Sequence 0064 is confirmed, but the repository migration must not be committed until 0063 is merged and the renderer is rerun on that baseline.',
    },
    evidence_boundary: [
      'accessible plus access_checked_at means an HTTP 2xx response was observed on 2026-07-29; it does not mark the evidence reviewed and does not independently verify every claim attributed to the page',
      'bot-blocked, unverified, and dead source records remain in the ledger with their observed state',
      'critical claim references are remapped to separately verified current sources; unsupported BAYC founder and mint-price detail is withheld',
    ],
    expected: {
      audited_source_records: 198,
      audited_access_states: {
        accessible: 171,
        bot_blocked: 21,
        unverified: 5,
        dead: 1,
      },
      critical_originals_preserved: 6,
      replacement_sources_added: REPAIR_SOURCES.length,
    },
    audit_records: auditRecords,
    repair_sources: REPAIR_SOURCES,
  };
}

function main() {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output) {
    throw new Error('Usage: prepare-nft-source-access-remediation.mjs <raw-audit.json> <output.json>');
  }
  const document = prepareRemediationDocument(JSON.parse(readFileSync(resolve(input), 'utf8')));
  writeFileSync(resolve(output), `${JSON.stringify(document, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

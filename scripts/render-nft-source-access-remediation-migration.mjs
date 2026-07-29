#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import {
  basename,
  isAbsolute,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateFieldCitedNft } from '../src/lib/nft-citation.mjs';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const documentUrl = new URL('../docs/nft-source-access-remediation-wave-2026-07-29.json', import.meta.url);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const EXPECTED_ACCESS = { accessible: 171, bot_blocked: 21, unverified: 5, dead: 1 };

function repositoryPath(requestedPath, label) {
  const candidate = resolve(root, requestedPath);
  const relation = relative(root, candidate);
  if (relation.startsWith('..') || isAbsolute(relation)) {
    throw new Error(`${label} must stay inside the repository`);
  }
  return candidate;
}

function parse(value, fallback) {
  if (value && typeof value === 'object') return structuredClone(value);
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function quoteSql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function identity(slug, sourceId) {
  return `${slug}:${sourceId}`;
}

function countBy(items, selector) {
  const counts = {};
  for (const item of items) {
    const key = selector(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function deepRemap(value, from, to) {
  if (Array.isArray(value)) return value.map((item) => deepRemap(item, from, to));
  if (!value || typeof value !== 'object') return value === from ? to : value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepRemap(item, from, to)]));
}

function evidence(profile, field) {
  return (profile.evidence || []).find((item) => item.field === field);
}

function repairBaycProfile(profile) {
  profile.launched = 'BAYC’s current official history states that 10,000 Bored Apes were released on 2021-04-23. The prior presale/sellout sequence is withheld because its cited path now redirects to a generic homepage.';
  profile.mint_price = 'Withheld: the accessible current first-party pages reviewed in this remediation do not state the original mint price or audited aggregate proceeds.';
  profile.community_history = 'Yuga describes BAYC as a 10,000-item membership club that expanded through companion collections and recurring community activations. Current official ApeFest and activation pages establish continued programming, not holder retention or financial performance.';
  profile.founder_engagement = 'Yuga’s current About page describes BAYC as beginning with four friends but does not name the full founding or original art team. Individual identities, duties, and continued involvement are therefore withheld in this dossier.';
  profile.benefits = 'BAYC ownership functions as membership and the current license documents holder rights in the associated art; events and other benefits are program-specific and can change. Ownership is not represented as equity or guaranteed yield.';
  profile.team = {
    founders: 'four friends per Yuga; individual roster withheld from the accessible current first-party evidence',
    current_operator: 'Yuga Labs / BAYC',
    source_ids: ['bayc-yuga-about'],
  };
  profile.chronology = [
    {
      date: '2021-04-23',
      event: 'The current official BAYC history states that 10,000 Bored Apes were released.',
      source_ids: ['bayc-founding-current'],
    },
    ...(profile.chronology || []).filter(({ date }) => date === '2025-10' || date === '2026-07-27'),
  ];
  profile.products_and_value_capture.source_ids = [
    'bayc-license-current',
    'bayc-activations',
    'bayc-yuga-about',
  ];
  Object.assign(profile.strategic_choices[0], {
    choice: 'Release a fixed 10,000-item collection and frame each NFT as membership rather than art alone.',
    source_ids: ['bayc-founding-current', 'bayc-yuga-about'],
  });
  Object.assign(profile.strategic_choices[1], {
    source_ids: ['bayc-license-current', 'bayc-yuga-about', 'bayc-activations'],
  });
  profile.unknowns = [
    'Current holder count, concentration, and active membership rate.',
    'Current floor, volume, royalties, event economics, and BAYC-attributable Yuga revenue.',
    'Individual founder duties, continued involvement, original mint price, and audited aggregate primary proceeds.',
  ];

  Object.assign(evidence(profile, 'launch'), {
    value: '10,000 Bored Apes released 2021-04-23; prior presale/sellout sequence withheld',
    as_of: '2021-04-23',
    source_ids: ['bayc-founding-current'],
  });
  Object.assign(evidence(profile, 'supply_or_mint'), {
    value: '10,000 Bored Apes; companion assets excluded',
    as_of: '2021-04-23',
    source_ids: ['bayc-founding-current', 'bayc-yuga-about'],
  });
  Object.assign(evidence(profile, 'mint_price'), {
    value: 'Withheld — accessible current first-party evidence reviewed here does not state the original mint price',
    as_of: '2026-07-29',
    source_ids: ['bayc-founding-current', 'bayc-yuga-about'],
  });
  Object.assign(evidence(profile, 'community_history'), {
    value: 'Membership framing, companion collections, and current recurring activations documented; retention withheld',
    source_ids: ['bayc-yuga-about', 'bayc-apefest-2025', 'bayc-apefest-2026', 'bayc-activations'],
  });
  Object.assign(evidence(profile, 'founder_engagement'), {
    value: 'Four-friend origin documented; individual founder roster, duties, and current engagement withheld',
    as_of: '2026-07-29',
    source_ids: ['bayc-yuga-about'],
  });
  Object.assign(evidence(profile, 'benefits'), {
    value: 'Membership, current holder art rights, events, experiences, and merchandise; terms can change and no yield is promised',
    source_ids: ['bayc-license-current', 'bayc-yuga-about', 'bayc-apefest-2026'],
  });

  const forensic = profile.forensic_analysis;
  forensic.why.source_refs = [
    'bayc-founding-current',
    'bayc-license-current',
    'bayc-yuga-about',
    'bayc-apefest-2025',
    'bayc-apefest-2026',
    'bayc-activations',
  ];
  Object.assign(forensic.strategic_choices[0], {
    decision: 'Launch a fixed 10,000-avatar membership collection.',
    source_refs: ['bayc-founding-current', 'bayc-yuga-about'],
  });
  forensic.strategic_choices[1].source_refs = ['bayc-license-current', 'bayc-yuga-about'];
  forensic.counterfactual.source_refs = ['bayc-founding-current', 'bayc-yuga-about', 'bayc-activations'];
  forensic.watch[1].source_refs = ['bayc-license-current', 'bayc-yuga-about'];
  return profile;
}

function validateDocument(document) {
  if (document?.schema !== 'chaindump-nft-source-remediation-v1') throw new Error('Unexpected remediation schema');
  if (!ISO_DAY.test(document.research_as_of || '')) throw new Error('Remediation requires research_as_of');
  if (document.migration_sequence?.rendered !== false) throw new Error('Source document must remain unrendered until migration sequence is confirmed');
  if (document.migration_sequence?.confirmed_id !== '0064') throw new Error('Remediation migration sequence must be confirmed as 0064');
  if (document.audit_records?.length !== 198) throw new Error('Remediation must cover 198 audited source records');
  const counts = countBy(document.audit_records, ({ access_state: state }) => state);
  if (JSON.stringify(counts) !== JSON.stringify(EXPECTED_ACCESS)) {
    throw new Error(`Unexpected access-state counts ${JSON.stringify(counts)}`);
  }
  const keys = new Set();
  for (const record of document.audit_records) {
    const key = identity(record.dossier_slug, record.source_id);
    if (keys.has(key)) throw new Error(`Duplicate audit record ${key}`);
    keys.add(key);
    if (!record.url?.startsWith('https://') || !ISO_DAY.test(record.access_checked_at || '')) {
      throw new Error(`Invalid audit record ${key}`);
    }
  }
  const replacements = (document.repair_sources || []).filter(({ replaces_source_id: id }) => id);
  if (replacements.length !== 6) throw new Error('Exactly six critical sources must be replaced');
  if (document.repair_sources.length !== 7) throw new Error('Expected six replacements and one BAYC license supplement');
  if (document.repair_sources.some(({ source }) => !ISO_DAY.test(source.last_verified_at || ''))) {
    throw new Error('Every claim-bearing repair source requires an explicit evidence-review date');
  }
}

function patchSource(source, record) {
  const patch = {
    access_state: record.access_state,
    access_checked_at: record.access_checked_at,
    access_http_status: record.http_status,
    access_final_url: record.final_url,
    verification_note: record.verification_note,
  };
  return { ...source, ...patch };
}

function validateRow(row) {
  const sourceIds = new Set();
  for (const source of row.sources) {
    if (!source.id || sourceIds.has(source.id)) throw new Error(`${row.slug}: missing or duplicate source id ${source.id}`);
    sourceIds.add(source.id);
  }
  const cited = validateFieldCitedNft(row.profile, row.sources);
  if (!cited.valid) throw new Error(`${row.slug}: ${cited.errors.join('; ')}`);
  const forensic = row.profile?.forensic_analysis;
  if (forensic?.version === 'forensic-analysis-v1' || forensic?.schema === 'forensic-analysis-v1') {
    const resolver = Object.fromEntries(row.sources.map((source) => [source.id, source]));
    const result = validateForensicAnalysis(forensic, { resolver });
    if (result.errors.length || result.warnings.length || result.withheld_sections.length) {
      throw new Error(`${row.slug}: ${[...result.errors, ...result.warnings, ...result.withheld_sections].join('; ')}`);
    }
  }
}

export function buildRemediationRows(document, baselineRows) {
  validateDocument(document);
  const rowMap = new Map(baselineRows.map((row) => [row.slug, {
    slug: row.slug,
    profile: parse(row.profile, {}),
    sources: parse(row.sources, []),
    profileChanged: false,
  }]));
  const auditTargets = new Set();
  const touchedSlugs = new Set();

  for (const record of document.audit_records) {
    const row = rowMap.get(record.dossier_slug);
    if (!row) throw new Error(`Missing dossier ${record.dossier_slug}`);
    const index = row.sources.findIndex(({ id }) => id === record.source_id);
    if (index < 0) throw new Error(`Missing source ${identity(record.dossier_slug, record.source_id)}`);
    if (row.sources[index].url !== record.url) {
      throw new Error(`Source URL drift for ${identity(record.dossier_slug, record.source_id)}`);
    }
    row.sources[index] = patchSource(row.sources[index], record);
    auditTargets.add(identity(record.dossier_slug, record.source_id));
    touchedSlugs.add(record.dossier_slug);
  }
  if (auditTargets.size !== 198) throw new Error('Not every audit target was patched');

  for (const repair of document.repair_sources) {
    const row = rowMap.get(repair.dossier_slug);
    if (!row) throw new Error(`Missing repair dossier ${repair.dossier_slug}`);
    if (row.sources.some(({ id }) => id === repair.source.id)) {
      throw new Error(`Repair source already exists: ${identity(repair.dossier_slug, repair.source.id)}`);
    }
    row.sources.push({ ...repair.source, stale: repair.source.stale ?? false });
    touchedSlugs.add(repair.dossier_slug);
    if (repair.replaces_source_id) {
      row.profile = deepRemap(row.profile, repair.replaces_source_id, repair.source.id);
      row.profileChanged = true;
    }
  }

  const bayc = rowMap.get('bored-ape-yacht-club');
  bayc.profile = repairBaycProfile(bayc.profile);
  bayc.profileChanged = true;

  const rows = [...rowMap.values()]
    .filter((row) => touchedSlugs.has(row.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  rows.forEach(validateRow);
  return rows;
}

export function renderNftSourceAccessRemediationMigration(document, baselineRows, migrationId) {
  if (!/^\d{4}$/.test(migrationId || '')) throw new Error('A confirmed four-digit migration id is required');
  if (migrationId !== document.migration_sequence?.confirmed_id) {
    throw new Error(`Migration id ${migrationId} does not match confirmed sequence ${document.migration_sequence?.confirmed_id}`);
  }
  const rows = buildRemediationRows(document, baselineRows);
  const table = `nft_source_remediation_${migrationId}`;
  const inserts = rows.map((row) => `INSERT INTO ${table} (slug, profile, sources)
VALUES (${quoteSql(row.slug)}, ${row.profileChanged ? quoteSql(JSON.stringify(row.profile)) : 'NULL'}, ${quoteSql(JSON.stringify(row.sources))});`).join('\n\n');
  return `-- Generated by scripts/render-nft-source-access-remediation-migration.mjs.
-- Applies the 2026-07-29 source-access audit and remaps six critical citations.

DROP TABLE IF EXISTS ${table};
CREATE TABLE ${table} (
  slug TEXT PRIMARY KEY,
  profile TEXT,
  sources TEXT NOT NULL
);

${inserts}

UPDATE nft_collections
SET profile = COALESCE((
      SELECT patch.profile FROM ${table} AS patch WHERE patch.slug = nft_collections.slug
    ), profile),
    sources = (
      SELECT patch.sources FROM ${table} AS patch WHERE patch.slug = nft_collections.slug
    ),
    updated_at = ${quoteSql(document.research_as_of)}
WHERE slug IN (SELECT slug FROM ${table});

DROP TABLE IF EXISTS ${table};
`;
}

function baselineRows(database) {
  return database.prepare('SELECT slug, profile, sources FROM nft_collections ORDER BY slug').all();
}

function applyExistingMigrations(database, migrationId) {
  const migrationDirectory = repositoryPath('migrations', 'Migration directory');
  for (const file of readdirSync(migrationDirectory)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name) && name.slice(0, 4) < migrationId)
    .sort()) {
    database.exec(
      readFileSync(repositoryPath(resolve(migrationDirectory, file), 'Migration path'), 'utf8'),
    );
  }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}

function main() {
  const migrationId = argument('--migration-id');
  const destination = argument('--destination');
  if (!migrationId || !destination) {
    throw new Error('Rendering is intentionally gated. Supply --migration-id and --destination only after the preceding migration sequence is confirmed.');
  }
  if (!basename(destination).startsWith(`${migrationId}_`)) {
    throw new Error('Destination filename must start with the confirmed migration id');
  }
  const document = JSON.parse(readFileSync(documentUrl, 'utf8'));
  const database = new DatabaseSync(':memory:');
  applyExistingMigrations(database, migrationId);
  const sql = renderNftSourceAccessRemediationMigration(document, baselineRows(database), migrationId);
  writeFileSync(repositoryPath(destination, 'Destination path'), sql);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

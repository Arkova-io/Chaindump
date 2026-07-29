#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validateFieldCitedNft } from '../src/lib/nft-citation.mjs';
import { validateForensicFreshness } from '../src/lib/evidence-freshness.mjs';

function quoteSql(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function renderNftMigration(document) {
  if (document?.schema !== 'chaindump-nft-field-v1') throw new Error('Unexpected dossier schema');
  if (!Array.isArray(document.dossiers) || !document.dossiers.length) throw new Error('No NFT dossiers to render');
  for (const dossier of document.dossiers) {
    const result = validateFieldCitedNft(dossier.profile, dossier.sources);
    if (!result.valid) throw new Error(`${dossier.slug}: ${result.errors.join('; ')}`);
    const freshness = validateForensicFreshness(dossier);
    if (!freshness.valid) throw new Error(`${dossier.slug} freshness: ${freshness.errors.join('; ')}`);
  }
  const payload = quoteSql(JSON.stringify(document.dossiers));
  return `-- Generated citation-first NFT lifecycle seed. Assign a migration number only after rebasing.
WITH dossier_seed(payload) AS (
  VALUES (${payload})
)
INSERT OR REPLACE INTO nft_collections
  (slug, name, chain, category, status, profile, sources, updated_at)
SELECT
  json_extract(value, '$.slug'),
  json_extract(value, '$.name'),
  json_extract(value, '$.chain'),
  json_extract(value, '$.category'),
  json_extract(value, '$.status'),
  json_extract(value, '$.profile'),
  json_extract(value, '$.sources'),
  ${quoteSql(document.research_as_of)}
FROM dossier_seed, json_each(dossier_seed.payload);
`;
}

function main() {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: node scripts/render-nft-seed-migration.mjs <dossier.json>');
  const document = JSON.parse(readFileSync(input, 'utf8'));
  process.stdout.write(renderNftMigration(document));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

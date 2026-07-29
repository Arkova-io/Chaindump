#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateFieldCitedNft } from '../src/lib/nft-citation.mjs';
import { validateForensicFreshness } from '../src/lib/evidence-freshness.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requestedPath = process.argv[2] || 'docs/nft-citation-wave-2026-07-29.json';
const file = resolve(rootDir, requestedPath);
const relation = relative(rootDir, file);
if (relation === '..' || relation.startsWith(`..${sep}`)) throw new Error('Dossier input must stay within the repository');
const document = JSON.parse(readFileSync(file, 'utf8'));
const errors = [];
if (document.schema !== 'chaindump-nft-field-v1') errors.push('Unexpected dossier schema');
if (!Array.isArray(document.dossiers) || !document.dossiers.length) errors.push('No dossiers');
for (const dossier of document.dossiers || []) {
  const result = validateFieldCitedNft(dossier.profile, dossier.sources);
  if (!result.valid) errors.push(`${dossier.slug}: ${result.errors.join('; ')}`);
  const freshness = validateForensicFreshness(dossier);
  if (!freshness.valid) errors.push(`${dossier.slug} freshness: ${freshness.errors.join('; ')}`);
  for (const source of dossier.sources || []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source.checked_at || '')) errors.push(`${dossier.slug}: source ${source.id} needs checked_at`);
  }
}
if (errors.length) {
  console.error(['NFT dossier check failed:', ...errors.map((error) => `  ✗ ${error}`)].join('\n'));
  process.exit(1);
}
console.log(`NFT dossier check passed: ${document.dossiers.length} field-cited dossier(s).`);

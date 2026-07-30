#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  buildCorpusManifest,
  normalizeTrainingRecord,
  toJsonl,
} from '../src/lib/forensic-corpus-export.mjs';

const DEFAULT_BASE_URL = 'https://chaindump.xyz';
const DEFAULT_OUT_DIR = '.chaindump-corpus';

const baseUrl = (process.env.CHAINDUMP_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const outDir = resolve(process.env.CHAINDUMP_CORPUS_DIR || DEFAULT_OUT_DIR);
const extractedAt = new Date().toISOString();

const ENDPOINTS = [
  {
    endpoint: '/api/chains',
    vertical: 'blockchain',
    rows: (payload) => payload.chains || [],
  },
  {
    endpoint: '/api/exchange-analysis?kind=dex',
    vertical: 'dex',
    rows: (payload) => payload.cases || [],
  },
  {
    endpoint: '/api/exchange-analysis?kind=cex',
    vertical: 'cex',
    rows: (payload) => payload.cases || [],
  },
  {
    endpoint: '/api/casinos',
    vertical: 'casino',
    rows: (payload) => payload.cases || [],
  },
  {
    endpoint: '/api/nft',
    vertical: 'nft_ordinals',
    rows: (payload) => payload.collections || [],
  },
];

async function fetchJson(endpoint) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: { accept: 'application/json', 'user-agent': 'chaindump-corpus-export/1.0' },
  });
  if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
  return response.json();
}

const records = [];
const failures = [];

for (const source of ENDPOINTS) {
  try {
    const payload = await fetchJson(source.endpoint);
    for (const row of source.rows(payload)) {
      records.push(normalizeTrainingRecord(row, {
        vertical: source.vertical,
        endpoint: source.endpoint,
        asOf: payload.as_of || payload.updated_at || null,
        extractedAt,
      }));
    }
  } catch (error) {
    failures.push({ endpoint: source.endpoint, error: error.message });
  }
}

await mkdir(outDir, { recursive: true });
const manifest = buildCorpusManifest(records, {
  generatedAt: extractedAt,
});
manifest.base_url = baseUrl;
manifest.endpoints = ENDPOINTS.map((source) => source.endpoint);
manifest.failures = failures;

await writeFile(resolve(outDir, 'forensic-corpus.jsonl'), toJsonl(records));
await writeFile(resolve(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify(manifest, null, 2));
if (failures.length) process.exitCode = 1;

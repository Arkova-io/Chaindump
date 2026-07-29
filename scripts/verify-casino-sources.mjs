#!/usr/bin/env node
// Network-only aid for editorial source review. This does not set
// `evidence_reviewed`: an HTTP response cannot establish that a source supports
// a particular field. Use it to find links that require manual retrieval or an
// archived copy before publication.
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const file = resolve(root, process.argv[2] || 'docs/web3-casino-cohort-2026-07-29.json');
const relativeFile = relative(root, file);
if (relativeFile.startsWith('..') || isAbsolute(relativeFile)) {
  throw new Error('research input must stay inside the current checkout');
}
const data = JSON.parse(await readFile(file, 'utf8'));
const concurrency = 6;
let next = 0;
const results = [];

async function check(source) {
  try {
    const response = await fetch(source.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
      headers: { 'user-agent': 'ChaindumpResearchVerifier/1.0 (+citation review)' },
    });
    return { source, status: response.status, finalUrl: response.url };
  } catch (error) {
    return { source, status: null, error: error.cause?.code || error.name };
  }
}

async function worker() {
  while (next < data.sources.length) {
    const source = data.sources[next++];
    results.push(await check(source));
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
results.sort((a, b) => a.source.source_id.localeCompare(b.source.source_id));
for (const result of results) {
  const outcome = result.status ?? `error:${result.error}`;
  console.log(`${outcome}\t${result.source.source_id}\t${result.finalUrl || result.source.url}`);
}

const non2xx = results.filter((result) => result.status < 200 || result.status >= 300);
console.log(`checked ${results.length} source URLs; ${non2xx.length} non-2xx/network result(s)`);
if (process.argv.includes('--strict') && non2xx.length) process.exitCode = 1;

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateCasinoResearch } from '../src/lib/casino-research.js';

const file = resolve(
  process.cwd(),
  process.argv[2] || 'docs/web3-casino-cohort-2026-07-29.json',
);
const data = JSON.parse(await readFile(file, 'utf8'));
const result = validateCasinoResearch(data);

for (const warning of result.warnings) {
  console.warn(`warning: ${warning}`);
}
if (result.errors.length) {
  for (const error of result.errors) {
    console.error(`error: ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `casino research valid: ${data.cases.length} cases, ${data.sources.length} sources, ${data.claims.length} claims, ${result.warnings.length} warnings`,
  );
}

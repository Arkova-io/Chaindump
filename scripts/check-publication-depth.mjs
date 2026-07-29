#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPublicationDepthInventory } from '../src/lib/publication-depth.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));

function assertRepositoryPath(path) {
  const relation = relative(root, path);
  if (relation === '..' || relation.startsWith(`..${sep}`)) {
    throw new Error('Publication-depth output must stay within the repository');
  }
}

function replayCorpus({ excludeMigration } = {}) {
  const database = new DatabaseSync(':memory:');
  const files = readdirSync(resolve(root, 'migrations'))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .filter((file) => file !== excludeMigration)
    .sort();
  for (const file of files) {
    database.exec(readFileSync(resolve(root, 'migrations', file), 'utf8'));
  }
  return database;
}

function inventory({ excludeMigration } = {}) {
  const database = replayCorpus({ excludeMigration });
  try {
    return buildPublicationDepthInventory(database, { asOf: '2026-07-29' });
  } finally {
    database.close();
  }
}

const beforeMigration = options.before === true
  ? '0063_publication_depth_wave_a.sql'
  : options.before || null;
let report = inventory({ excludeMigration: beforeMigration });

if (options.compare) {
  const before = inventory({ excludeMigration: '0063_publication_depth_wave_a.sql' });
  const after = inventory();
  const cohortIds = [
    'cex:dead:bitmex',
    'cex:mid:kucoin',
    'bc-game-curacao-small-house',
    'f1-delta-time',
  ];
  const dossierById = (source, id) => source.dossiers.find((dossier) => dossier.id === id);
  report = {
    schema: 'chaindump-publication-depth-comparison-v1',
    as_of: '2026-07-29',
    policy: after.policy,
    before_summary: before.summary,
    after_summary: after.summary,
    delta: {
      high_risk_claim_count: (
        after.summary.high_risk_claim_count - before.summary.high_risk_claim_count
      ),
      passing_high_risk_claim_count: (
        after.summary.passing_high_risk_claim_count
        - before.summary.passing_high_risk_claim_count
      ),
      unresolved_high_risk_claim_count: (
        after.summary.unresolved_high_risk_claim_count
        - before.summary.unresolved_high_risk_claim_count
      ),
      dossiers_with_unresolved_high_risk_claims: (
        after.summary.dossiers_with_unresolved_high_risk_claims
        - before.summary.dossiers_with_unresolved_high_risk_claims
      ),
      dossiers_with_unmatched_source_refs: (
        after.summary.dossiers_with_unmatched_source_refs
        - before.summary.dossiers_with_unmatched_source_refs
      ),
    },
    repaired_cohort: cohortIds.map((id) => {
      const beforeDossier = dossierById(before, id);
      const afterDossier = dossierById(after, id);
      return {
        id,
        vertical: afterDossier.vertical,
        name: afterDossier.name,
        unresolved_high_risk_claims_before: beforeDossier.unresolved_high_risk_claim_count,
        unresolved_high_risk_claims_after: afterDossier.unresolved_high_risk_claim_count,
        unmatched_source_refs_before: beforeDossier.unmatched_source_ref_count,
        unmatched_source_refs_after: afterDossier.unmatched_source_ref_count,
      };
    }),
    dossiers: after.dossiers,
  };
}

if (options.output) {
  const destination = resolve(root, options.output);
  assertRepositoryPath(destination);
  writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
}

if (options.json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  const summary = report.after_summary || report.summary;
  console.log(
    `Publication-depth report: ${summary.dossier_count} dossiers, `
    + `${summary.high_risk_claim_count} high-risk claims, `
    + `${summary.unresolved_high_risk_claim_count} unresolved high-risk claims.`,
  );
  for (const [vertical, result] of Object.entries(summary.by_vertical)) {
    console.log(
      `  ${vertical}: ${result.dossier_count} dossiers; `
      + `${result.unresolved_high_risk_claim_count}/${result.high_risk_claim_count} `
      + 'high-risk claims unresolved',
    );
  }
  if (options.output) console.log(`  wrote ${options.output}`);
}

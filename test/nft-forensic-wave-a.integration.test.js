import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';
import { validateForensicFreshness } from '../src/lib/evidence-freshness.mjs';
import { validateFieldCitedNft } from '../src/lib/nft-citation.mjs';
import {
  buildNftForensicWaveAManifest,
  expectedSlugs,
  renderNftForensicWaveAMigration,
} from '../scripts/render-nft-forensic-wave-a-migration.mjs';

const document = JSON.parse(readFileSync(
  new URL('../docs/nft-forensic-wave-a-2026-07-29.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0057_nft_forensic_wave_a.sql', import.meta.url),
  'utf8',
);

function applyMigrations(database, maximum) {
  const files = readdirSync(new URL('../migrations/', import.meta.url))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .filter((file) => Number(file.slice(0, 4)) <= maximum)
    .sort();
  for (const file of files) {
    database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
}

function createCorpus(maximum = 57) {
  const database = new DatabaseSync(':memory:');
  applyMigrations(database, maximum);
  return database;
}

function parseRow(row) {
  return {
    ...row,
    profile: JSON.parse(row.profile),
    sources: JSON.parse(row.sources),
  };
}

function resolver(sources) {
  return Object.fromEntries(sources.map((source) => [source.id, source]));
}

function collectRefs(analysis) {
  return [
    ...analysis.outcome.source_refs,
    ...analysis.why.source_refs,
    ...analysis.strategic_choices.flatMap((choice) => choice.source_refs),
    ...analysis.counterfactual.source_refs,
    ...analysis.watch.flatMap((item) => item.source_refs),
  ];
}

function snapshot(database) {
  return database.prepare(`
    SELECT slug, name, chain, category, status, profile, sources, updated_at
    FROM nft_collections
    ORDER BY slug
  `).all();
}

function d1Adapter(database) {
  return {
    prepare(sql) {
      let bindings = [];
      return {
        bind(...values) {
          bindings = values;
          return this;
        },
        async all() {
          return { results: database.prepare(sql).all(...bindings) };
        },
      };
    },
  };
}

async function freshWorker() {
  vi.resetModules();
  return (await import('../src/worker.js')).default;
}

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });
let database;

afterEach(() => {
  database?.close();
  database = undefined;
  vi.unstubAllGlobals();
});

describe('NFT forensic causal wave A', () => {
  it('keeps the generated manifest and migration deterministic', () => {
    expect(document).toEqual(buildNftForensicWaveAManifest());
    expect(migration).toBe(renderNftForensicWaveAMigration(document));
    expect(document.schema).toBe('chaindump-nft-field-v1');
    expect(document.generated_migration).toBe('0057_nft_forensic_wave_a.sql');
    expect(document.dossiers.map(({ slug }) => slug)).toEqual(expectedSlugs);
    expect(document.dossiers).toHaveLength(18);
  });

  it('publishes deep validator-clean causal contracts with checked evidence', () => {
    for (const dossier of document.dossiers) {
      const { forensic_analysis: analysis } = dossier.profile;
      expect(validateFieldCitedNft(dossier.profile, dossier.sources), dossier.slug)
        .toEqual({ valid: true, errors: [] });
      expect(validateForensicFreshness(dossier), dossier.slug)
        .toEqual({ valid: true, errors: [] });
      expect(validateForensicAnalysis(analysis, {
        resolver: resolver(dossier.sources),
      }), dossier.slug).toEqual({
        errors: [],
        warnings: [],
        withheld_sections: [],
      });
      expect(analysis.outcome.summary.length, `${dossier.slug}.outcome`)
        .toBeGreaterThanOrEqual(180);
      expect(analysis.why.summary.length, `${dossier.slug}.why`)
        .toBeGreaterThanOrEqual(260);
      expect(analysis.strategic_choices.length, `${dossier.slug}.choices`)
        .toBeGreaterThanOrEqual(3);
      expect(analysis.strategic_choices.length, `${dossier.slug}.choices`)
        .toBeLessThanOrEqual(4);
      expect(analysis.watch.length, `${dossier.slug}.watch`).toBeGreaterThanOrEqual(3);
      expect(analysis.unknowns.length, `${dossier.slug}.unknowns`).toBeGreaterThanOrEqual(4);
      expect(analysis.review.last_reviewed_at).toBe('2026-07-29');
      expect(analysis.review.next_review_at).toBe(dossier.profile.evidence_policy.next_review_at);
      expect(dossier.sources.every((source) => source.checked_at === '2026-07-29'))
        .toBe(true);

      const sourceIds = new Set(dossier.sources.map(({ id }) => id));
      for (const reference of collectRefs(analysis)) {
        expect(sourceIds.has(reference), `${dossier.slug}: ${reference}`).toBe(true);
      }
    }
  });

  it('patches only the intended analysis fields, resolves against corpus sources, and is idempotent', () => {
    database = createCorpus(56);
    const before = snapshot(database);
    const beforeBySlug = Object.fromEntries(before.map((row) => [row.slug, parseRow(row)]));

    database.exec(migration);
    const first = snapshot(database);
    const firstBySlug = Object.fromEntries(first.map((row) => [row.slug, parseRow(row)]));
    expect(first).toHaveLength(51);

    for (const dossier of document.dossiers) {
      const prior = beforeBySlug[dossier.slug];
      const current = firstBySlug[dossier.slug];
      expect(current.name).toBe(prior.name);
      expect(current.chain).toBe(prior.chain);
      expect(current.category).toBe(prior.category);
      expect(current.status).toBe(prior.status);
      expect(current.sources).toEqual(prior.sources);
      expect({
        ...current.profile,
        forensic_analysis: prior.profile.forensic_analysis,
      }).toEqual(prior.profile);
      expect(current.profile.forensic_analysis).toEqual(dossier.profile.forensic_analysis);

      const databaseSources = resolver(current.sources);
      expect(validateForensicAnalysis(current.profile.forensic_analysis, {
        resolver: databaseSources,
      }), dossier.slug).toEqual({
        errors: [],
        warnings: [],
        withheld_sections: [],
      });
      for (const source of dossier.sources) {
        expect(databaseSources[source.id]?.url, `${dossier.slug}: ${source.id}`)
          .toBe(source.url);
      }
    }

    const untouched = before.filter(({ slug }) => !expectedSlugs.includes(slug));
    expect(first.filter(({ slug }) => !expectedSlugs.includes(slug))).toEqual(untouched);

    database.exec(migration);
    expect(snapshot(database)).toEqual(first);
    expect(database.prepare(`
      SELECT COUNT(*) AS count
      FROM sqlite_master
      WHERE type = 'table' AND name = 'nft_forensic_wave_a_0057'
    `).get().count).toBe(0);
  });

  it('renders all 18 causal dossiers through the public NFT API', async () => {
    database = createCorpus();
    const worker = await freshWorker();
    const env = { DB: d1Adapter(database) };

    for (const dossier of document.dossiers) {
      const response = await worker.fetch(
        new Request(`http://localhost/api/nft?slug=${dossier.slug}`),
        env,
        ctx(),
      );
      expect(response.status, dossier.slug).toBe(200);
      const payload = await response.json();
      expect(payload.collections).toHaveLength(1);
      const published = payload.collections[0];
      expect(published.slug).toBe(dossier.slug);
      expect(published.citation).toEqual({ fieldCited: true, errors: [] });
      expect(published.profile.forensic_analysis).toEqual(dossier.profile.forensic_analysis);
      expect(validateForensicAnalysis(published.profile.forensic_analysis, {
        resolver: resolver(JSON.parse(published.sources)),
      }), dossier.slug).toEqual({
        errors: [],
        warnings: [],
        withheld_sections: [],
      });
    }
  });
});

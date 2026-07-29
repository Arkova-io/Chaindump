import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';
import { validateForensicFreshness } from '../src/lib/evidence-freshness.mjs';
import { validateFieldCitedNft } from '../src/lib/nft-citation.mjs';
import {
  renderNftForensicNormalizationMigration,
} from '../scripts/render-nft-forensic-normalization-migration.mjs';

const document = JSON.parse(readFileSync(
  new URL('../docs/nft-forensic-normalization-wave-2026-07-29.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0058_nft_forensic_normalization.sql', import.meta.url),
  'utf8',
);
const publicHtml = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const expectedSlugs = [
  'metroverse',
  'moonbirds',
  'nba-top-shot',
  'nifty-gateway',
  'nouns-dao',
  'onchainmonkey-genesis',
  'opensea-marketplace',
  'pizza-ninjas',
  'pudgy-penguins',
  'quantum-cats',
  'reddit-collectible-avatars',
  'solana-monkey-business',
  'sorare-cards',
  'taproot-wizards',
  'tezzardz',
  'the-sandbox-land',
  'twelvefold',
  'world-of-women',
];
const limitedAccessStates = new Set([
  'bot_blocked',
  'tls_fetch_failed',
  'not_found_by_raw_fetch',
  'redirected_to_homepage',
  'service_unavailable',
]);

function applyMigrations(database, maximum) {
  const files = readdirSync(new URL('../migrations/', import.meta.url))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .filter((file) => Number(file.slice(0, 4)) <= maximum)
    .sort();
  for (const file of files) {
    database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
}

function createCorpus(maximum = 58) {
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

describe('NFT forensic normalization wave', () => {
  it('keeps the exact 18-case manifest and migration deterministic', () => {
    expect(document.schema).toBe('chaindump-nft-field-v1');
    expect(document.patch_schema).toBe('nft-forensic-normalization-v1');
    expect(document.generated_migration).toBe('0058_nft_forensic_normalization.sql');
    expect(document.dossiers.map(({ slug }) => slug)).toEqual(expectedSlugs);
    expect(document.dossiers).toHaveLength(18);
    expect(migration).toBe(renderNftForensicNormalizationMigration(document));
  });

  it('publishes source-resolved causal depth with honest inference boundaries', () => {
    for (const dossier of document.dossiers) {
      const analysis = dossier.profile.forensic_analysis;
      expect(analysis.outcome.summary.length, `${dossier.slug}.outcome`)
        .toBeGreaterThanOrEqual(130);
      expect(analysis.outcome.scope, `${dossier.slug}.scope`).toBeTruthy();
      expect(analysis.why.summary.length, `${dossier.slug}.why`)
        .toBeGreaterThanOrEqual(260);
      expect(analysis.why.summary, `${dossier.slug}.why`).toContain('Observed:');
      expect(analysis.why.summary, `${dossier.slug}.why`).toContain('Inference');
      expect(analysis.why.basis, `${dossier.slug}.basis`).toBeTruthy();
      expect(analysis.strategic_choices.length, `${dossier.slug}.choices`)
        .toBeGreaterThanOrEqual(3);
      expect(analysis.strategic_choices.length, `${dossier.slug}.choices`)
        .toBeLessThanOrEqual(4);
      for (const choice of analysis.strategic_choices) {
        expect(choice.decision, dossier.slug).toBeTruthy();
        expect(choice.intended_mechanism, dossier.slug).toBeTruthy();
        expect(choice.consequence, dossier.slug).toBeTruthy();
      }
      expect(analysis.counterfactual.limits, `${dossier.slug}.counterfactual`).toBeTruthy();
      expect(analysis.watch.length, `${dossier.slug}.watch`).toBeGreaterThanOrEqual(2);
      expect(analysis.unknowns.length, `${dossier.slug}.unknowns`).toBeGreaterThanOrEqual(4);
      expect(analysis.review.last_reviewed_at).toBe('2026-07-29');
      expect(dossier.sources.every(({ checked_at }) => checked_at === '2026-07-29'))
        .toBe(true);
      for (const source of dossier.sources.filter(({ access_state: state }) => state)) {
        expect(limitedAccessStates.has(source.access_state), `${dossier.slug}:${source.id}`)
          .toBe(true);
        expect(source.verification_note, `${dossier.slug}:${source.id}`)
          .toMatch(/Automated GET|raw fetch/i);
      }

      expect(validateFieldCitedNft(dossier.profile, dossier.sources), dossier.slug)
        .toEqual({ valid: true, errors: [] });
      expect(validateForensicAnalysis(analysis, {
        resolver: resolver(dossier.sources),
      }), dossier.slug).toEqual({
        errors: [],
        warnings: [],
        withheld_sections: [],
      });
    }

    const cases = Object.fromEntries(document.dossiers.map((entry) => [entry.slug, entry]));
    expect(cases['quantum-cats'].profile.forensic_analysis.why.summary)
      .toContain('uncertain Bitcoin policy narrative');
    expect(cases.metroverse.profile.forensic_analysis.why.summary)
      .toContain('failed to sustain enough repeat participation');
    expect(cases.tezzardz.profile.forensic_analysis.outcome.label).toBe('unclassified');
    expect(cases.twelvefold.profile.forensic_analysis.outcome.label).toBe('unclassified');
    expect(resolver(cases['quantum-cats'].sources)['quantum-cats-site']).toMatchObject({
      access_state: 'tls_fetch_failed',
    });
    expect(resolver(cases['opensea-marketplace'].sources)['opensea-help-os2'])
      .toMatchObject({ access_state: 'not_found_by_raw_fetch' });
    expect(resolver(cases.twelvefold.sources)['twelvefold-launch'])
      .toMatchObject({ access_state: 'redirected_to_homepage' });
    expect(resolver(cases['world-of-women'].sources)['wow-patio'])
      .toMatchObject({ access_state: 'service_unavailable' });
  });

  it('patches only causal fields, preserves checked_at, resolves canonical sources, and is idempotent', () => {
    database = createCorpus(57);
    const before = snapshot(database);
    const beforeBySlug = Object.fromEntries(before.map((row) => [row.slug, parseRow(row)]));

    database.exec(migration);
    const first = snapshot(database);
    const firstBySlug = Object.fromEntries(first.map((row) => [row.slug, parseRow(row)]));
    expect(first).toHaveLength(51);

    for (const dossier of document.dossiers) {
      const prior = beforeBySlug[dossier.slug];
      const current = firstBySlug[dossier.slug];
      const {
        forensic_analysis: priorForensic,
        token_model: priorToken,
        chain_dependence: priorChain,
        ...priorUnchanged
      } = prior.profile;
      const {
        forensic_analysis: currentForensic,
        token_model: currentToken,
        chain_dependence: currentChain,
        ...currentUnchanged
      } = current.profile;

      expect(current).toMatchObject({
        name: prior.name,
        chain: prior.chain,
        category: prior.category,
        status: prior.status,
        updated_at: '2026-07-29',
      });
      expect(currentUnchanged).toEqual(priorUnchanged);
      expect(currentForensic).toEqual(dossier.profile.forensic_analysis);
      expect(currentToken).toEqual(dossier.profile.token_model);
      expect(currentChain).toEqual(dossier.profile.chain_dependence);
      expect(priorForensic).not.toEqual(currentForensic);
      expect(priorToken).not.toEqual(currentToken);
      expect(priorChain).not.toEqual(currentChain);
      const manifestSources = resolver(dossier.sources);
      expect(current.sources).toEqual(prior.sources.map((source) => ({
        ...source,
        checked_at: '2026-07-29',
        ...(manifestSources[source.id] || {}),
      })));

      const databaseSources = resolver(current.sources);
      expect(validateFieldCitedNft(current.profile, current.sources), dossier.slug)
        .toEqual({ valid: true, errors: [] });
      expect(validateForensicFreshness({
        status: current.status,
        profile: current.profile,
        sources: current.sources,
      }), dossier.slug).toEqual({ valid: true, errors: [] });
      expect(validateForensicAnalysis(currentForensic, {
        resolver: databaseSources,
      }), dossier.slug).toEqual({
        errors: [],
        warnings: [],
        withheld_sections: [],
      });
      for (const source of dossier.sources) {
        expect(databaseSources[source.id]?.url, `${dossier.slug}: ${source.id}`)
          .toBe(source.url);
        expect(databaseSources[source.id]?.checked_at, `${dossier.slug}: ${source.id}`)
          .toBe('2026-07-29');
        if (source.access_state) {
          expect(databaseSources[source.id], `${dossier.slug}: ${source.id}`).toMatchObject({
            access_state: source.access_state,
            verification_note: source.verification_note,
          });
        }
      }
    }

    const untouched = before.filter(({ slug }) => !expectedSlugs.includes(slug));
    expect(first.filter(({ slug }) => !expectedSlugs.includes(slug))).toEqual(untouched);

    database.exec(migration);
    expect(snapshot(database)).toEqual(first);
    expect(database.prepare(`
      SELECT COUNT(*) AS count
      FROM sqlite_temp_master
      WHERE type = 'table' AND name = 'nft_forensic_normalization_0058'
    `).get().count).toBe(0);
  });

  it('finishes a 51-of-51 validator-clean normalized NFT corpus after 0057 and 0058', () => {
    database = createCorpus();
    const rows = database.prepare(`
      SELECT slug, status, profile, sources
      FROM nft_collections
      ORDER BY slug
    `).all().map(parseRow);

    expect(rows).toHaveLength(51);
    expect(rows.filter(({ profile }) => (
      profile.forensic_analysis?.version === 'forensic-analysis-v1'
    ))).toHaveLength(51);

    for (const row of rows) {
      expect(validateFieldCitedNft(row.profile, row.sources), row.slug)
        .toEqual({ valid: true, errors: [] });
      expect(validateForensicFreshness(row), row.slug)
        .toEqual({ valid: true, errors: [] });
      expect(validateForensicAnalysis(row.profile.forensic_analysis, {
        resolver: resolver(row.sources),
      }), row.slug).toEqual({
        errors: [],
        warnings: [],
        withheld_sections: [],
      });
    }
  });

  it('exposes every normalized causal field through the public NFT list and detail contract', async () => {
    expect(publicHtml).toContain('function nftProfileAnalysisHtml(profile, sources)');
    expect(publicHtml).toContain("['Token model &amp; value capture', profile?.token_model]");
    expect(publicHtml).toContain("['Chain dependence', profile?.chain_dependence]");
    expect(publicHtml).toContain('forensicAnalysisHtml(profile?.forensic_analysis, resolveRef');
    for (const label of [
      'Scoped outcome',
      'Why this outcome',
      'Strategic choices',
      'What could have been different',
      'What would change our mind',
      'Material unknowns',
      'Analysis freshness',
    ]) {
      expect(publicHtml).toContain(label);
    }

    database = createCorpus();
    const worker = await freshWorker();
    const env = { DB: d1Adapter(database) };
    const listResponse = await worker.fetch(
      new Request('http://localhost/api/nft'),
      env,
      ctx(),
    );
    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json();
    const listed = new Map(listPayload.collections.map((row) => [row.slug, row]));

    for (const dossier of document.dossiers) {
      const listRow = listed.get(dossier.slug);
      expect(listRow, dossier.slug).toBeTruthy();
      expect(listRow.profile.token_model, dossier.slug).toBeTruthy();
      expect(listRow.profile.chain_dependence, dossier.slug).toBeTruthy();
      expect(listRow.profile.forensic_analysis, dossier.slug).toMatchObject({
        version: 'forensic-analysis-v1',
        outcome: { scope: expect.any(String) },
        why: { summary: expect.any(String) },
        strategic_choices: expect.any(Array),
        counterfactual: { summary: expect.any(String) },
        watch: expect.any(Array),
        unknowns: expect.any(Array),
        review: { next_review_at: expect.any(String) },
      });

      const detailResponse = await worker.fetch(
        new Request(`http://localhost/api/nft?slug=${dossier.slug}`),
        env,
        ctx(),
      );
      expect(detailResponse.status, dossier.slug).toBe(200);
      const detailPayload = await detailResponse.json();
      expect(detailPayload.collections).toHaveLength(1);
      const detail = detailPayload.collections[0];
      expect(detail.profile.forensic_analysis)
        .toEqual(listRow.profile.forensic_analysis);
      expect(detail.profile.token_model).toEqual(listRow.profile.token_model);
      expect(detail.profile.chain_dependence).toEqual(listRow.profile.chain_dependence);
      const detailSources = JSON.parse(detail.sources);
      expect(detailSources.every((source) => source.checked_at === '2026-07-29'))
        .toBe(true);
      for (const source of dossier.sources.filter(({ access_state: state }) => state)) {
        expect(resolver(detailSources)[source.id]).toMatchObject({
          access_state: source.access_state,
          verification_note: source.verification_note,
        });
      }
    }
  });
});

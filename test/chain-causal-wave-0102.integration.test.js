import { Buffer } from 'node:buffer';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { document, renderMigration } from '../scripts/render-chain-causal-wave-0102.mjs';
import {
  ANALYSIS_SECTION_KEYS,
  embeddedCanonicalEntityProfile,
  validateEntityProfile,
} from '../src/lib/entity-profile.js';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';

const artifact = JSON.parse(readFileSync(
  new URL('../docs/chain-causal-completion-wave-k-2026-08-03.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0102_chain_causal_completion_wave_k.sql', import.meta.url),
  'utf8',
);
const expected = {
  monad: { chain: 'Monad', outcome: 'middling', forensic: 'middling', sources: 12, claims: 33, tvl: 770_866_273 },
  'op-mainnet': { chain: 'OP Mainnet', outcome: 'middling', forensic: 'middling', sources: 13, claims: 32, tvl: 306_748_546 },
  sui: { chain: 'Sui', outcome: 'middling', forensic: 'middling', sources: 12, claims: 33, tvl: 414_698_918 },
  near: { chain: 'Near', outcome: 'middling', forensic: 'middling', sources: 13, claims: 31, tvl: 59_063_644 },
  mantle: { chain: 'Mantle', outcome: 'middling', forensic: 'middling', sources: 11, claims: 33, tvl: 68_201_747 },
};

const INTERNAL_COPY = /\[object Object\]|"source_ids"|"evidence_locator"|publication_state|trend_id|claim_ids|field_path|forensic_analysis|canonical_profile|observation_snapshot|quality_flags|review_state/;

function applyMigrations(database, through = Infinity) {
  const files = readdirSync(new URL('../migrations/', import.meta.url))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .filter((file) => Number(file.slice(0, 4)) <= through)
    .sort();
  for (const file of files) {
    database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
}

function d1(database) {
  return {
    prepare(sql) {
      return {
        bindings: [],
        bind(...bindings) {
          this.bindings = bindings;
          return this;
        },
        async all() {
          return { results: database.prepare(sql).all(...this.bindings) };
        },
        async first() {
          return database.prepare(sql).get(...this.bindings) ?? null;
        },
        async run() {
          return database.prepare(sql).run(...this.bindings);
        },
      };
    },
  };
}

function canonicalProfile(database, chain, slug) {
  const row = database.prepare('SELECT profile FROM chain_analysis WHERE chain = ?').get(chain);
  return embeddedCanonicalEntityProfile(row?.profile, { type: 'blockchain', slug });
}

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });
let apiDatabase;
let apiWorker;

beforeAll(async () => {
  apiDatabase = new DatabaseSync(':memory:');
  applyMigrations(apiDatabase);
  vi.resetModules();
  apiWorker = (await import('../src/worker.js')).default;
}, 180_000);

afterAll(() => {
  apiDatabase?.close();
  vi.unstubAllGlobals();
});

describe('chain causal and canonical wave 0102', () => {
  it('keeps the research artifact and preservation-safe migration deterministic', () => {
    expect(artifact).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document).toMatchObject({
      schema: 'chaindump-chain-causal-completion-v2',
      research_as_of: '2026-08-03',
      generated_migration: '0102_chain_causal_completion_wave_k.sql',
    });
    expect(document.cases.map(({ slug }) => slug)).toEqual(Object.keys(expected));
    expect(migration).not.toMatch(/\bCREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE\b/i);
    expect(migration.match(/-- canonical-synthesis-start /g)).toHaveLength(document.cases.length);
    expect(migration.match(/-- canonical-meta-start /g)).toHaveLength(document.cases.length);
    expect(migration.match(/-- canonical-profile-start /g)).toHaveLength(document.cases.length);
    expect(Buffer.byteLength(migration, 'utf8')).toBeGreaterThan(0);
  });

  it('ships ten deep plain-English sections and atomic review-state claims', () => {
    for (const entry of document.cases) {
      const profile = entry.canonical_profile;
      const expectedCase = expected[entry.slug];
      expect(entry.chain).toBe(expectedCase.chain);
      expect(profile.outcome.label).toBe(expectedCase.outcome);
      expect(entry.forensic_analysis.outcome.label).toBe(expectedCase.forensic);
      expect(profile.sources).toHaveLength(expectedCase.sources);
      expect(profile.claims).toHaveLength(expectedCase.claims);
      expect(validateEntityProfile(profile), entry.chain).toEqual([]);
      expect(Object.keys(profile.analysis.sections)).toEqual(ANALYSIS_SECTION_KEYS);
      expect(profile.quality).toMatchObject({
        publication_state: 'review',
        completeness_pct: 100,
      });

      const sourceIds = new Set(profile.sources.map(({ id }) => id));
      expect(profile.sources.some(({ role }) => role === 'primary'), entry.chain).toBe(true);
      expect(profile.sources.some(({ role }) => role === 'independent'), entry.chain).toBe(true);
      for (const source of profile.sources) {
        expect(source, `${entry.chain}:${source.id}`).toMatchObject({
          url: expect.stringMatching(/^https:\/\//),
          accessed_at: expect.stringMatching(/^2026-08-03T/),
          checked_at: expect.stringMatching(/^2026-08-03T/),
          access_state: 'reachable',
          evidence_locator: expect.any(String),
        });
      }
      for (const [key, section] of Object.entries(profile.analysis.sections)) {
        expect(section.body.trim(), `${entry.chain}.${key} body`).not.toBe('');
        expect(section.body, `${entry.chain}.${key} customer copy`).not.toMatch(INTERNAL_COPY);
        expect(section.claim_ids.length, `${entry.chain}.${key} atomic claims`)
          .toBeGreaterThanOrEqual(2);
        expect(section.claim_ids.length, `${entry.chain}.${key} bounded atomic claims`)
          .toBeLessThanOrEqual(4);
        const sectionClaims = section.claim_ids.map((id) => (
          profile.claims.find((item) => item.id === id)
        ));
        for (const item of sectionClaims) {
          expect(item, `${entry.chain}.${key} resolves claim id`).toBeDefined();
          expect(item.field_path, `${entry.chain}.${key}:${item.id} real JSON field`)
            .toBe(`analysis.sections.${key}.body`);
          expect(item.assertion.length, `${entry.chain}.${key}:${item.id} bounded assertion`)
            .toBeLessThanOrEqual(240);
        }
      }
      for (const item of profile.claims) {
        expect(item, `${entry.chain}:${item.id}`).toMatchObject({
          assertion: expect.any(String),
          as_of: expect.stringMatching(/^202[1-6]-\d{2}-\d{2}$/),
          evidence_locator: expect.any(String),
          source_ids: expect.any(Array),
          review: { state: 'pending', reviewer: null, reviewed_at: null },
        });
        expect(item.value, `${entry.chain}:${item.id} value`).not.toBeNull();
        expect(item.source_ids.length, `${entry.chain}:${item.id} sources`).toBeGreaterThan(0);
        expect(item.source_ids.every((id) => sourceIds.has(id)), `${entry.chain}:${item.id} refs`)
          .toBe(true);
      }
    }
  });

  it('keeps facts, inferences, unknowns and point-in-time observations explicit', () => {
    for (const entry of document.cases) {
      const sourceById = Object.fromEntries(entry.sources.map((source) => [source.id, source]));
      expect(validateForensicAnalysis(entry.forensic_analysis, { resolver: sourceById }), entry.chain)
        .toEqual({ errors: [], warnings: [], withheld_sections: [] });
      expect(entry.forensic_analysis.observation_snapshot).toMatchObject({
        observed_at: '2026-08-03T22:07:20.041Z',
        observation_completed_at: '2026-08-03T22:07:28.117Z',
        latest_tvl_usd: expected[entry.slug].tvl,
      });
      expect(entry.forensic_analysis.strategic_choices.length, entry.chain)
        .toBeGreaterThanOrEqual(3);
      expect(entry.forensic_analysis.unknowns, entry.chain).toHaveLength(4);
      expect(entry.forensic_analysis.watch.length, entry.chain).toBeGreaterThanOrEqual(2);
      expect(entry.canonical_profile.claims.some(({ kind }) => kind === 'inference'), entry.chain)
        .toBe(true);
      expect(entry.canonical_profile.claims.some(({ kind }) => kind === 'unknown'), entry.chain)
        .toBe(true);
      expect(entry.canonical_profile.claims.some(({ kind }) => kind === 'fact'), entry.chain)
        .toBe(true);
    }
    const monad = document.cases.find(({ slug }) => slug === 'monad').canonical_profile;
    expect(monad.analysis.sections.what_it_is.body).toContain('not an Ethereum rollup');
    expect(monad.metrics.find(({ dimension }) => dimension === 'dex_spot_volume').quality_flags)
      .toContain('young_network_base_effect');
    const op = document.cases.find(({ slug }) => slug === 'op-mainnet').canonical_profile;
    expect(op.analysis.sections.what_it_is.body).toContain('Base and other OP Chains are separate networks');
    expect(op.analysis.sections.token_and_value_capture.body).toContain('ETH is the gas token');
    const sui = document.cases.find(({ slug }) => slug === 'sui').canonical_profile;
    expect(sui.analysis.sections.what_happened.body).toContain('three more halts');
    expect(sui.analysis.sections.token_and_value_capture.body).toContain('Storage fees enter a fund');
    const near = document.cases.find(({ slug }) => slug === 'near').canonical_profile;
    expect(near.analysis.sections.strategic_choices.body).toContain('seven permissioned validators');
    expect(near.metrics.find(({ dimension }) => dimension === 'dex_spot_volume').quality_flags)
      .toContain('cross_chain_or_provider_scope_requires_attribution');
    const mantle = document.cases.find(({ slug }) => slug === 'mantle').canonical_profile;
    expect(mantle.analysis.sections.what_it_is.body).toContain('affiliated products are separate entities');
    expect(mantle.metrics.find(({ dimension }) => dimension === 'dex_spot_volume').quality_flags)
      .toContain('large_change_from_low_base');
  });

  it('preserves every legacy field, merges sources by URL and replays idempotently', () => {
    const database = new DatabaseSync(':memory:');
    applyMigrations(database, 101);
    const before = Object.fromEntries(document.cases.map((entry) => {
      const facts = database.prepare(`
        SELECT dimension, data, sources, updated_at
        FROM chain_facts WHERE chain = ? ORDER BY dimension
      `).all(entry.chain);
      const analysis = database.prepare(`
        SELECT chain, take, sentiment, trend, updated_at, sources, profile
        FROM chain_analysis WHERE chain = ?
      `).get(entry.chain) || null;
      return [entry.chain, { facts, analysis }];
    }));

    database.exec(migration);
    for (const entry of document.cases) {
      const priorFacts = Object.fromEntries(before[entry.chain].facts.map((row) => [row.dimension, row]));
      const afterFacts = database.prepare(`
        SELECT dimension, data, sources, updated_at
        FROM chain_facts WHERE chain = ? ORDER BY dimension
      `).all(entry.chain);
      expect(afterFacts).toHaveLength(before[entry.chain].facts.length);
      if (afterFacts.length) {
        for (const row of afterFacts.filter(({ dimension }) => !['synthesis', '_meta'].includes(dimension))) {
          expect(row, `${entry.chain}:${row.dimension}`).toEqual(priorFacts[row.dimension]);
        }
        const synthesis = afterFacts.find(({ dimension }) => dimension === 'synthesis');
        const priorSynthesisData = JSON.parse(priorFacts.synthesis.data);
        const currentSynthesisData = JSON.parse(synthesis.data);
        const targetedSynthesisKeys = new Set(['forensic_analysis', 'canonical_profile_ref']);
        for (const [key, value] of Object.entries(priorSynthesisData)) {
          if (targetedSynthesisKeys.has(key)) continue;
          expect(
            JSON.stringify(currentSynthesisData[key]),
            `${entry.chain}:synthesis.${key} byte-identical`,
          ).toBe(JSON.stringify(value));
        }
        const changedSynthesisKeys = Object.keys({ ...priorSynthesisData, ...currentSynthesisData })
          .filter((key) => (
            JSON.stringify(priorSynthesisData[key]) !== JSON.stringify(currentSynthesisData[key])
          ));
        expect(
          changedSynthesisKeys.every((key) => targetedSynthesisKeys.has(key)),
          `${entry.chain}: only intended synthesis keys may change`,
        ).toBe(true);
        expect(currentSynthesisData.forensic_analysis).toEqual(entry.forensic_analysis);
        expect(currentSynthesisData).not.toHaveProperty('canonical_profile');
        expect(currentSynthesisData.canonical_profile_ref)
          .toBe('chain_analysis.profile.canonical_profile');
        expect(JSON.parse(afterFacts.find(({ dimension }) => dimension === '_meta').data))
          .toMatchObject({
            forensic_analysis_version: 'forensic-analysis-v1',
            canonical_profile_schema: 'chaindump-entity-profile',
            last_reviewed: '2026-08-03',
            next_review_at: '2026-08-10',
            canonical_claim_review: {
              state: 'pending',
              claims: entry.canonical_profile.claims.length,
              human_approval_required: true,
            },
          });

        const mergedSources = JSON.parse(synthesis.sources);
        expect(new Set(mergedSources.map(({ url }) => url)).size, entry.chain)
          .toBe(mergedSources.length);
        for (const source of entry.sources) {
          expect(mergedSources.find(({ url }) => url === source.url), `${entry.chain}:${source.id}`)
            .toMatchObject({ title: source.title, checked_at: source.checked_at });
        }
      } else {
        expect(before[entry.chain].facts, `${entry.chain} does not fabricate legacy facts`).toEqual([]);
      }

      const profile = canonicalProfile(database, entry.chain, entry.slug);
      expect(profile).toEqual(entry.canonical_profile);
      const analysisSources = JSON.parse(database.prepare(
        'SELECT sources FROM chain_analysis WHERE chain = ?',
      ).get(entry.chain).sources);
      for (const source of entry.sources) {
        expect(analysisSources.find(({ url }) => url === source.url), `${entry.chain}:${source.id}`)
          .toMatchObject({ title: source.title, checked_at: source.checked_at });
      }
      if (before[entry.chain].analysis) {
        const afterAnalysis = database.prepare(`
          SELECT take, sentiment, trend, profile FROM chain_analysis WHERE chain = ?
        `).get(entry.chain);
        expect(afterAnalysis.take).toBe(before[entry.chain].analysis.take);
        expect(afterAnalysis.sentiment).toBe(before[entry.chain].analysis.sentiment);
        expect(afterAnalysis.trend).toBe(before[entry.chain].analysis.trend);
        const priorProfile = JSON.parse(before[entry.chain].analysis.profile || '{}');
        const currentProfile = JSON.parse(afterAnalysis.profile);
        for (const [key, value] of Object.entries(priorProfile)) {
          if (key === 'canonical_profile') continue;
          expect(
            JSON.stringify(currentProfile[key]),
            `${entry.chain}:profile.${key} byte-identical`,
          ).toBe(JSON.stringify(value));
        }
        expect(currentProfile.canonical_profile).toEqual(entry.canonical_profile);
      }
    }

    const once = database.prepare(`
      SELECT chain, take, sentiment, trend, updated_at, sources, profile
      FROM chain_analysis
      WHERE chain IN (${document.cases.map(() => '?').join(',')})
      ORDER BY chain
    `).all(...document.cases.map(({ chain }) => chain));
    const factsOnce = database.prepare(`
      SELECT chain, dimension, data, sources, updated_at
      FROM chain_facts
      WHERE chain IN (${document.cases.map(() => '?').join(',')})
      ORDER BY chain, dimension
    `).all(...document.cases.map(({ chain }) => chain));
    database.exec(migration);
    expect(database.prepare(`
      SELECT chain, take, sentiment, trend, updated_at, sources, profile
      FROM chain_analysis
      WHERE chain IN (${document.cases.map(() => '?').join(',')})
      ORDER BY chain
    `).all(...document.cases.map(({ chain }) => chain))).toEqual(once);
    expect(database.prepare(`
      SELECT chain, dimension, data, sources, updated_at
      FROM chain_facts
      WHERE chain IN (${document.cases.map(() => '?').join(',')})
      ORDER BY chain, dimension
    `).all(...document.cases.map(({ chain }) => chain))).toEqual(factsOnce);
    database.close();
  });

  it('serves the embedded canonical profiles on the blockchain profile API', async () => {
    for (const entry of document.cases) {
      const response = await apiWorker.fetch(
        new Request(`http://localhost/api/profile/blockchain/${entry.slug}`),
        { DB: d1(apiDatabase) },
        ctx(),
      );
      expect(response.status, entry.chain).toBe(200);
      const body = await response.json();
      expect(body).toEqual(entry.canonical_profile);
      expect(Object.keys(body.analysis.sections)).toEqual(ANALYSIS_SECTION_KEYS);
    }

  }, 30_000);

  it('cannot be marked published while human review is pending', () => {
    for (const entry of document.cases) {
      const profile = structuredClone(entry.canonical_profile);
      profile.quality.publication_state = 'published';
      expect(validateEntityProfile(profile, {
        forPublication: true,
        now: new Date('2026-08-03T19:00:00Z'),
      }).some(({ code }) => code === 'reviewed_support_required'), entry.chain).toBe(true);
    }
  });
});

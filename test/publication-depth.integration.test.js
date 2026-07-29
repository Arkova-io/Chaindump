import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';
import { validateFieldCitedNft } from '../src/lib/nft-citation.mjs';
import { buildPublicationDepthInventory } from '../src/lib/publication-depth.mjs';
import {
  buildPublicationDepthManifest,
  renderPublicationDepthMigration,
} from '../scripts/render-publication-depth-wave-a-migration.mjs';

const manifest = JSON.parse(readFileSync(
  new URL('../docs/publication-depth-wave-a-2026-07-29.json', import.meta.url),
  'utf8',
));
const migration = readFileSync(
  new URL('../migrations/0063_publication_depth_wave_a.sql', import.meta.url),
  'utf8',
);
const inventoryDocument = JSON.parse(readFileSync(
  new URL('../docs/publication-depth-inventory-2026-07-29.json', import.meta.url),
  'utf8',
));

function applyMigrations(database, { exclude = [] } = {}) {
  const excluded = new Set(exclude);
  const files = readdirSync(new URL('../migrations/', import.meta.url))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .filter((file) => !excluded.has(file))
    .sort();
  for (const file of files) {
    database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
}

function createCorpus(options) {
  const database = new DatabaseSync(':memory:');
  applyMigrations(database, options);
  return database;
}

function canonicalDocument() {
  const match = migration.match(
    /-- canonical-payload-start[\s\S]*?VALUES \('([\s\S]*?)'\) -- NOSONAR:[^\n]*\n\)/,
  );
  if (!match) throw new Error('0063 canonical payload not found');
  return JSON.parse(match[1].replaceAll("''", "'"));
}

function dossier(inventory, id) {
  return inventory.dossiers.find((item) => item.id === id);
}

function resolver(sources) {
  return Object.fromEntries(sources.flatMap((source) => [
    [source.id || source.source_id, source],
    [source.url || source.canonical_url, source],
  ]));
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
        async first() {
          return database.prepare(sql).get(...bindings) ?? null;
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

describe('publication-depth Wave A migration 0063', () => {
  it('keeps its risk-first manifest and generated migration deterministic', () => {
    expect(buildPublicationDepthManifest()).toEqual(manifest);
    expect(canonicalDocument()).toEqual(manifest);
    expect(migration).toBe(renderPublicationDepthMigration(manifest));
    expect(migration).not.toMatch(/\bCREATE\s+TEMP(?:ORARY)?\s+TABLE\b/i);
    expect(manifest.exchange_patches.map(({ slug }) => slug)).toEqual(['bitmex', 'kucoin']);
    expect(manifest.casino_patches.map(({ case_id: id }) => id))
      .toEqual(['bc-game-curacao-small-house']);
    expect(manifest.nft_patches.map(({ slug }) => slug)).toEqual(['f1-delta-time']);
  });

  it('records tier, role, access, editorial review, and field-level locators for every new source', () => {
    expect(manifest.source_verification.results).toHaveLength(10);
    expect(manifest.source_verification.results.every(({ http_status: status }) => status === 200))
      .toBe(true);
    const exchangeAndNftSources = [
      ...manifest.exchange_patches.flatMap(({ sources }) => sources),
      ...manifest.nft_patches.flatMap(({ sources }) => sources),
    ];
    for (const source of exchangeAndNftSources) {
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.source_tier).toMatch(/^T[1-4]$/);
      expect(source.source_role).toMatch(/^(authority|primary|independent|aggregator|data)$/);
      expect(source.access_state).toBe('resolving');
      expect(source.resolving).toBe(true);
      expect(source.evidence_reviewed).toBe(true);
      expect(source.checked_at).toBe('2026-07-29');
      expect(source.evidence_locator || source.verification_note).toBeTruthy();
    }
    for (const source of manifest.casino_patches.flatMap(({ sources }) => sources)) {
      expect(source.canonical_url).toMatch(/^https:\/\//);
      expect(source.source_tier).toMatch(/^[A-D]$/);
      expect(source.source_role).toBe('independent');
      expect(source.resolving).toBe(1);
      expect(source.evidence_reviewed).toBe(1);
      expect(source.accessed_at).toBe('2026-07-29');
      expect(source.notes).toBeTruthy();
    }
  });

  it('inventories the complete corpus and clears the selected high-risk cohort without hiding legacy gaps', () => {
    database = createCorpus({ exclude: ['0063_publication_depth_wave_a.sql'] });
    const before = buildPublicationDepthInventory(database, { asOf: '2026-07-29' });
    database.exec(migration);
    const after = buildPublicationDepthInventory(database, { asOf: '2026-07-29' });

    expect(before.summary.by_vertical.exchange.dossier_count).toBe(59);
    expect(before.summary.by_vertical.casino.dossier_count).toBe(29);
    expect(before.summary.by_vertical.nft_ordinals.dossier_count).toBe(51);
    expect(before.summary).toMatchObject({
      dossier_count: 139,
      high_risk_claim_count: 1039,
      unresolved_high_risk_claim_count: 812,
      dossiers_with_unresolved_high_risk_claims: 114,
      dossiers_with_unmatched_source_refs: 41,
    });
    expect(after.summary).toMatchObject({
      dossier_count: 139,
      high_risk_claim_count: 1041,
      unresolved_high_risk_claim_count: 785,
      dossiers_with_unresolved_high_risk_claims: 110,
      dossiers_with_unmatched_source_refs: 40,
    });
    expect(inventoryDocument.before_summary).toEqual(before.summary);
    expect(inventoryDocument.after_summary).toEqual(after.summary);
    expect(inventoryDocument.dossiers).toEqual(after.dossiers);
    expect(inventoryDocument.delta).toEqual({
      high_risk_claim_count: 2,
      passing_high_risk_claim_count: 29,
      unresolved_high_risk_claim_count: -27,
      dossiers_with_unresolved_high_risk_claims: -4,
      dossiers_with_unmatched_source_refs: -1,
    });

    const expectedRepairs = {
      'cex:dead:bitmex': [6, 0],
      'cex:mid:kucoin': [7, 0],
      'bc-game-curacao-small-house': [3, 0],
      'f1-delta-time': [11, 0],
    };
    for (const [id, [beforeCount, afterCount]] of Object.entries(expectedRepairs)) {
      expect(dossier(before, id).unresolved_high_risk_claim_count, `${id} before`)
        .toBe(beforeCount);
      expect(dossier(after, id).unresolved_high_risk_claim_count, `${id} after`)
        .toBe(afterCount);
    }
    expect(after.summary.unresolved_high_risk_claim_count).toBeGreaterThan(0);
  });

  it('patches only the selected dossiers, stays validator-clean, and is idempotent', () => {
    database = createCorpus({ exclude: ['0063_publication_depth_wave_a.sql'] });
    const untouchedBefore = {
      exchange: database.prepare(`
        SELECT profile, sources FROM dead_exchanges
        WHERE kind = 'cex' AND slug = 'ftx'
      `).get(),
      casino: database.prepare(`
        SELECT c.*, s.outlook
        FROM casino_cases AS c JOIN casino_syntheses AS s USING (case_id)
        WHERE c.case_id = 'zkasino-alleged-platform'
      `).get(),
      nft: database.prepare(`
        SELECT profile, sources FROM nft_collections WHERE slug = 'azuki'
      `).get(),
    };

    database.exec(migration);
    const first = {
      bitmex: database.prepare(`
        SELECT why, outlook, profile, sources FROM dead_exchanges
        WHERE kind = 'cex' AND slug = 'bitmex'
      `).get(),
      kucoin: database.prepare(`
        SELECT profile, sources FROM mid_exchanges
        WHERE kind = 'cex' AND slug = 'kucoin'
      `).get(),
      casino: database.prepare(`
        SELECT c.status, c.status_as_of, c.outcome_label, s.outlook, s.source_claim_ids
        FROM casino_cases AS c JOIN casino_syntheses AS s USING (case_id)
        WHERE c.case_id = 'bc-game-curacao-small-house'
      `).get(),
      nft: database.prepare(`
        SELECT profile, sources FROM nft_collections WHERE slug = 'f1-delta-time'
      `).get(),
    };
    database.exec(migration);
    const second = {
      bitmex: database.prepare(`
        SELECT why, outlook, profile, sources FROM dead_exchanges
        WHERE kind = 'cex' AND slug = 'bitmex'
      `).get(),
      kucoin: database.prepare(`
        SELECT profile, sources FROM mid_exchanges
        WHERE kind = 'cex' AND slug = 'kucoin'
      `).get(),
      casino: database.prepare(`
        SELECT c.status, c.status_as_of, c.outcome_label, s.outlook, s.source_claim_ids
        FROM casino_cases AS c JOIN casino_syntheses AS s USING (case_id)
        WHERE c.case_id = 'bc-game-curacao-small-house'
      `).get(),
      nft: database.prepare(`
        SELECT profile, sources FROM nft_collections WHERE slug = 'f1-delta-time'
      `).get(),
    };
    expect(second).toEqual(first);

    for (const row of [first.bitmex, first.kucoin]) {
      const profile = JSON.parse(row.profile);
      const sources = JSON.parse(row.sources);
      expect(validateForensicAnalysis(profile.forensic_analysis, {
        resolver: resolver(sources),
      })).toEqual({ errors: [], warnings: [], withheld_sections: [] });
    }
    const casinoAnalysis = JSON.parse(first.casino.outlook).forensic_analysis;
    expect(validateForensicAnalysis(casinoAnalysis))
      .toEqual({ errors: [], warnings: [], withheld_sections: [] });
    const nftProfile = JSON.parse(first.nft.profile);
    const nftSources = JSON.parse(first.nft.sources);
    expect(validateFieldCitedNft(nftProfile, nftSources))
      .toEqual({ valid: true, errors: [] });
    expect(validateForensicAnalysis(nftProfile.forensic_analysis, {
      resolver: resolver(nftSources),
    })).toEqual({ errors: [], warnings: [], withheld_sections: [] });

    expect(database.prepare(`
      SELECT profile, sources FROM dead_exchanges
      WHERE kind = 'cex' AND slug = 'ftx'
    `).get()).toEqual(untouchedBefore.exchange);
    expect(database.prepare(`
      SELECT c.*, s.outlook
      FROM casino_cases AS c JOIN casino_syntheses AS s USING (case_id)
      WHERE c.case_id = 'zkasino-alleged-platform'
    `).get()).toEqual(untouchedBefore.casino);
    expect(database.prepare(`
      SELECT profile, sources FROM nft_collections WHERE slug = 'azuki'
    `).get()).toEqual(untouchedBefore.nft);
  });

  it('publishes every repaired dossier through the APIs that back the existing UI routes', async () => {
    database = createCorpus();
    const worker = await freshWorker();
    const env = { DB: d1Adapter(database) };

    for (const [kind, lifecycle, slug] of [
      ['cex', 'dead', 'bitmex'],
      ['cex', 'mid', 'kucoin'],
    ]) {
      const response = await worker.fetch(
        new Request(
          `http://localhost/api/exchange-analysis?kind=${kind}`
          + `&lifecycle=${lifecycle}&slug=${slug}`,
        ),
        env,
        ctx(),
      );
      expect(response.status, slug).toBe(200);
      const payload = await response.json();
      expect(payload.cases).toHaveLength(1);
      expect(payload.cases[0].analysis.forensic_analysis_status).toBe('published');
      expect(payload.cases[0].sources.every((source) => source.resolving)).toBe(true);
    }

    const casinoResponse = await worker.fetch(
      new Request('http://localhost/api/casino/bc-game-curacao-small-house'),
      env,
      ctx(),
    );
    expect(casinoResponse.status).toBe(200);
    const casino = await casinoResponse.json();
    expect(casino.case.status).toBe('insolvent');
    expect(casino.synthesis.forensic_analysis.outcome.label).toBe('failed');
    expect(casino.sources.some(({ url }) => (
      url === 'https://nagelmakers.com/downloads/bankruptcies/'
        + '250722-tweede-faillissementsverslag-SH-%28ZB%29.pdf'
    ))).toBe(true);

    const nftResponse = await worker.fetch(
      new Request('http://localhost/api/nft?slug=f1-delta-time'),
      env,
      ctx(),
    );
    expect(nftResponse.status).toBe(200);
    const nft = await nftResponse.json();
    expect(nft.collections).toHaveLength(1);
    expect(JSON.parse(nft.collections[0].sources).map(({ id }) => id))
      .toEqual(['f1dt-closure', 'f1dt-racefans']);
  });
});

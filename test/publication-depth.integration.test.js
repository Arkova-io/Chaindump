import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateForensicAnalysis } from '../src/lib/forensic-analysis.js';
import { validateFieldCitedNft } from '../src/lib/nft-citation.mjs';
import {
  buildPublicationDepthInventory,
  evaluatePublicationClaim,
  normalizePublicationSource,
} from '../src/lib/publication-depth.mjs';
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

function dossier(inventory, id) {
  return inventory.dossiers.find((item) => item.id === id);
}

function resolver(sources) {
  return Object.fromEntries(sources.flatMap((source) => [
    [source.id || source.source_id, source],
    [source.url || source.canonical_url, source],
  ]));
}

function forensicReferences(analysis) {
  return [
    ...analysis.outcome.source_refs,
    ...analysis.why.source_refs,
    ...analysis.strategic_choices.flatMap(({ source_refs: refs }) => refs),
    ...analysis.counterfactual.source_refs,
    ...analysis.watch.flatMap(({ source_refs: refs }) => refs),
  ].map((reference) => (
    typeof reference === 'string'
      ? reference
      : reference.ref || reference.source_id || reference.id || reference.url
  ));
}

function registeredSourceKeys(sources) {
  return new Set(sources.flatMap((source) => {
    if (typeof source === 'string') return [source];
    return [source.id, source.source_id, source.url, source.canonical_url].filter(Boolean);
  }));
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
  it('does not infer editorial review from access dates', () => {
    for (const timestampField of ['checked_at', 'last_verified_at']) {
      const source = normalizePublicationSource({
        id: timestampField,
        url: `https://independent.example/${timestampField}`,
        publisher: 'Independent Example',
        source_tier: 'T2',
        source_role: 'independent',
        resolving: true,
        [timestampField]: '2026-07-29',
      });
      expect(source.resolving).toBe(true);
      expect(source.evidence_reviewed).toBe(false);
      const evaluated = evaluatePublicationClaim({
        path: 'forensic_analysis.why',
        type: 'causal',
        high_risk: true,
        source_refs: [timestampField],
      }, new Map([[timestampField, source]]));
      expect(evaluated.passes).toBe(false);
      expect(evaluated.gaps).toContain('no_resolving_reviewed_evidence');
    }
  });

  it('applies a role-aware high-risk source threshold', () => {
    const source = (id, tier, role) => normalizePublicationSource({
      id,
      url: `https://${id}.example/evidence`,
      publisher: id,
      source_tier: tier,
      source_role: role,
      resolving: true,
      evidence_reviewed: true,
    });
    const primary = source('operator', 'T2', 'primary');
    const independent = source('independent', 'T2', 'independent');
    const tierOnePrimary = source('tier-one-operator', 'T1', 'primary');
    const assess = (type, ...evidence) => evaluatePublicationClaim({
      path: `forensic_analysis.${type}`,
      type,
      high_risk: true,
      source_refs: evidence.map(({ id }) => id),
    }, new Map(evidence.map((item) => [item.id, item])));

    expect(assess('causal', primary).passes).toBe(false);
    expect(assess('legal', primary).passes).toBe(false);
    expect(assess('loss', primary).passes).toBe(false);
    expect(assess('lifecycle', primary).passes).toBe(true);
    expect(assess('causal', independent).passes).toBe(true);
    expect(assess('legal', tierOnePrimary).passes).toBe(false);

    const firstTierThree = source('tier-three-one', 'T3', 'independent');
    const secondTierThree = source('tier-three-two', 'T3', 'independent');
    expect(assess('causal', firstTierThree).passes).toBe(false);
    expect(assess('causal', firstTierThree, secondTierThree).passes).toBe(true);
    const samePublisher = {
      ...secondTierThree,
      id: 'tier-three-same-publisher',
      publisher: firstTierThree.publisher,
      independence_key: firstTierThree.independence_key,
    };
    expect(assess('causal', firstTierThree, samePublisher).passes).toBe(false);

    const authority = normalizePublicationSource({
      id: 'authority',
      url: 'https://www.sec.gov/example',
      publisher: 'SEC',
      source_tier: 'T1',
      source_role: 'independent',
      resolving: true,
      evidence_reviewed: true,
    });
    expect(authority.role).toBe('authority');
    expect(assess('legal', authority).passes).toBe(true);
  });

  it('keeps its risk-first manifest and generated migration deterministic', () => {
    expect(buildPublicationDepthManifest()).toEqual(manifest);
    expect(migration).toBe(renderPublicationDepthMigration(manifest));
    expect(migration).not.toMatch(/\bCREATE\s+TEMP(?:ORARY)?\s+TABLE\b/i);
    expect(migration).toContain('-- batched-payload-start');
    expect(migration.match(
      /INSERT OR REPLACE INTO publication_depth_wave_a_0063 \(vertical, dossier_id, patch\)/g,
    )).toHaveLength(45);
    expect(manifest.exchange_patches.map(({ slug }) => slug)).toEqual(['bitmex', 'kucoin']);
    expect(manifest.casino_patches.map(({ case_id: id }) => id))
      .toEqual(['bc-game-curacao-small-house']);
    expect(manifest.nft_patches.map(({ slug }) => slug)).toEqual(['f1-delta-time']);
    expect(manifest.reference_repairs.summary).toEqual({
      dossier_count: 40,
      source_ref_count: 179,
      resolving_source_ref_count: 161,
      unavailable_source_ref_count: 18,
    });
  });

  it('records tier, role, access, editorial review, and field-level locators for every new source', () => {
    expect(manifest.source_verification.results).toHaveLength(11);
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
    const referenceSources = manifest.reference_repairs.exchange_patches
      .flatMap(({ sources }) => sources);
    expect(referenceSources).toHaveLength(178);
    expect(referenceSources.filter(({ resolving }) => resolving)).toHaveLength(160);
    expect(referenceSources.filter(({ resolving }) => !resolving)).toHaveLength(18);
    for (const source of referenceSources) {
      expect(source).toMatchObject({
        title: expect.any(String),
        publisher: expect.any(String),
        checked_at: '2026-07-29',
        source_tier: expect.stringMatching(/^T[1-4]$/),
        source_role: expect.stringMatching(
          /^(authority|primary|independent|aggregator|data)$/,
        ),
        evidence_reviewed: source.resolving,
      });
      expect(source.url).toMatch(/^https:\/\//);
      if (source.resolving) expect(source.access_state).toBe('resolving');
      else expect(source.access_state).toEqual(expect.any(String));
      expect(source.verification_note).toBeTruthy();
    }
    const casinoReference = manifest.reference_repairs.casino_patches[0];
    expect(casinoReference.sources[0]).toMatchObject({
      canonical_url: 'https://doc.winklink.org/v2/doc/',
      resolving: 1,
      evidence_reviewed: 1,
      accessed_at: '2026-07-29',
    });
    expect(casinoReference.claims[0]).toMatchObject({
      field_path: 'scope.successor_documentation',
      checked_at: '2026-07-29',
    });
    const zkasino = manifest.reference_repairs.casino_strengthening_patches[0];
    expect(zkasino).toMatchObject({
      case_id: 'zkasino-alleged-platform',
      sources: [{
        publisher: 'Dutch Public Prosecution Service',
        source_tier: 'A',
        resolving: 1,
        evidence_reviewed: 1,
      }],
    });
    expect(zkasino.claims).toHaveLength(2);
    expect(Object.values(zkasino.analysis_updates).every((refs) => refs.length === 2))
      .toBe(true);
  });

  it('inventories the complete corpus and reports role-aware repairs without hiding gaps', () => {
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
      unresolved_high_risk_claim_count: 975,
      dossiers_with_unresolved_high_risk_claims: 138,
      dossiers_with_unmatched_source_refs: 41,
    });
    expect(after.summary).toMatchObject({
      dossier_count: 139,
      high_risk_claim_count: 1043,
      unresolved_high_risk_claim_count: 869,
      dossiers_with_unresolved_high_risk_claims: 132,
      dossiers_with_unmatched_source_refs: 0,
    });
    expect(after.dossiers.every(({ unmatched_source_ref_count: count }) => count === 0))
      .toBe(true);
    expect(inventoryDocument.before_summary).toEqual(before.summary);
    expect(inventoryDocument.after_summary).toEqual(after.summary);
    expect(inventoryDocument.dossiers).toEqual(after.dossiers);
    expect(inventoryDocument.delta).toEqual({
      high_risk_claim_count: 4,
      passing_high_risk_claim_count: 110,
      unresolved_high_risk_claim_count: -106,
      dossiers_with_unresolved_high_risk_claims: -6,
      dossiers_with_unmatched_source_refs: -41,
    });

    const expectedRepairs = {
      'cex:dead:bitmex': [6, 3],
      'cex:mid:kucoin': [7, 1],
      'bc-game-curacao-small-house': [7, 9],
      'f1-delta-time': [11, 6],
      'zkasino-alleged-platform': [0, 0],
    };
    for (const [id, [beforeCount, afterCount]] of Object.entries(expectedRepairs)) {
      expect(dossier(before, id).unresolved_high_risk_claim_count, `${id} before`)
        .toBe(beforeCount);
      expect(dossier(after, id).unresolved_high_risk_claim_count, `${id} after`)
        .toBe(afterCount);
    }
    expect(after.summary.unresolved_high_risk_claim_count).toBeGreaterThan(0);
  });

  it('patches only the manifest targets, stays validator-clean, and is idempotent', () => {
    database = createCorpus({ exclude: ['0063_publication_depth_wave_a.sql'] });
    const untouchedBefore = {
      exchange: database.prepare(`
        SELECT profile, sources FROM dead_exchanges
        WHERE kind = 'cex' AND slug = 'fcoin'
      `).get(),
      casino: database.prepare(`
        SELECT c.*, s.outlook
        FROM casino_cases AS c JOIN casino_syntheses AS s USING (case_id)
        WHERE c.case_id = 'stake-dot-com'
      `).get(),
      nft: database.prepare(`
        SELECT profile, sources FROM nft_collections WHERE slug = 'azuki'
      `).get(),
      referenceRepair: database.prepare(`
        SELECT sources FROM dead_exchanges
        WHERE kind = 'cex' AND slug = 'ftx'
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
      referenceRepair: database.prepare(`
        SELECT sources FROM dead_exchanges
        WHERE kind = 'cex' AND slug = 'ftx'
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
      referenceRepair: database.prepare(`
        SELECT sources FROM dead_exchanges
        WHERE kind = 'cex' AND slug = 'ftx'
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
      WHERE kind = 'cex' AND slug = 'fcoin'
    `).get()).toEqual(untouchedBefore.exchange);
    expect(database.prepare(`
      SELECT c.*, s.outlook
      FROM casino_cases AS c JOIN casino_syntheses AS s USING (case_id)
      WHERE c.case_id = 'stake-dot-com'
    `).get()).toEqual(untouchedBefore.casino);
    expect(database.prepare(`
      SELECT profile, sources FROM nft_collections WHERE slug = 'azuki'
    `).get()).toEqual(untouchedBefore.nft);
    expect(JSON.parse(first.referenceRepair.sources).length)
      .toBeGreaterThan(JSON.parse(untouchedBefore.referenceRepair.sources).length);
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

  it('publishes every forensic contract and registers every cited reference at the API boundary', async () => {
    database = createCorpus();
    const worker = await freshWorker();
    const env = { DB: d1Adapter(database) };
    const exchangeCases = [];
    for (const kind of ['dex', 'cex']) {
      const response = await worker.fetch(
        new Request(`http://localhost/api/exchange-analysis?kind=${kind}`),
        env,
        ctx(),
      );
      expect(response.status, kind).toBe(200);
      exchangeCases.push(...(await response.json()).cases);
    }
    expect(exchangeCases).toHaveLength(59);
    for (const item of exchangeCases) {
      expect(item.analysis.forensic_analysis_status, item.slug).toBe('published');
      const analysis = item.analysis.forensic_analysis;
      expect(analysis, item.slug).toBeTruthy();
      const registered = registeredSourceKeys(item.sources);
      for (const reference of forensicReferences(analysis)) {
        expect(registered.has(reference), `${item.slug}: ${reference}`).toBe(true);
      }
    }

    const casinoIds = database.prepare(`
      SELECT case_id FROM casino_cases
      WHERE quality_passed = 1
      ORDER BY case_id
    `).all().map(({ case_id: caseId }) => caseId);
    expect(casinoIds).toHaveLength(29);
    for (const caseId of casinoIds) {
      const response = await worker.fetch(
        new Request(`http://localhost/api/casino/${caseId}`),
        env,
        ctx(),
      );
      expect(response.status, caseId).toBe(200);
      const item = await response.json();
      expect(item.synthesis.forensic_analysis, caseId).toBeTruthy();
      const registered = registeredSourceKeys(item.sources);
      for (const reference of forensicReferences(item.synthesis.forensic_analysis)) {
        expect(registered.has(reference), `${caseId}: ${reference}`).toBe(true);
      }
      if (caseId === 'zkasino-alleged-platform') {
        expect(item.case.source_count).toBeGreaterThanOrEqual(2);
        expect(item.sources.some(({ url }) => (
          url === 'https://www.prosecutionservice.nl/latest/news/2025/07/03/'
            + 'arrest-in-the-uae-in-criminal-case-involving-gambling-platform-zkasino'
        ))).toBe(true);
        expect(item.synthesis.forensic_analysis.why.source_refs).toHaveLength(2);
      }
    }

    const coverageResponse = await worker.fetch(
      new Request('http://localhost/api/casino-coverage'),
      env,
      ctx(),
    );
    expect(coverageResponse.status).toBe(200);
    expect((await coverageResponse.json()).coverage).toMatchObject({
      cohort_id: 'web3-casino-full-corpus-2026-07-29',
      target_count: 29,
      quality_passed_count: 29,
      partial_count: 0,
      missing_count: 0,
    });

    const nftResponse = await worker.fetch(
      new Request('http://localhost/api/nft'),
      env,
      ctx(),
    );
    expect(nftResponse.status).toBe(200);
    const nftPayload = await nftResponse.json();
    expect(nftPayload.collections).toHaveLength(51);
    for (const item of nftPayload.collections) {
      const sources = JSON.parse(item.sources);
      const analysis = item.profile.forensic_analysis;
      expect(analysis, item.slug).toBeTruthy();
      expect(validateForensicAnalysis(analysis, { resolver: resolver(sources) }), item.slug)
        .toEqual({ errors: [], warnings: [], withheld_sections: [] });
      const registered = registeredSourceKeys(sources);
      for (const reference of forensicReferences(analysis)) {
        expect(registered.has(reference), `${item.slug}: ${reference}`).toBe(true);
      }
    }
  });
});

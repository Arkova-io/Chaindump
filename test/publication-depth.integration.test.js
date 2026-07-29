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
  validatePublicationDepthManifest,
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

function expectPublicationSourceState(source) {
  expect(source).toMatchObject({
    url: expect.stringMatching(/^https:\/\//),
    registered: true,
    access_state: expect.any(String),
    source_tier: expect.stringMatching(/^(T[1-4]|unknown)$/),
    source_role: expect.any(String),
    evidence_reviewed: expect.any(Boolean),
  });
  if (typeof source.resolving === 'boolean') {
    expect(source.reachable).toBe(source.resolving);
  } else {
    expect(source).not.toHaveProperty('reachable');
  }
  if (source.evidence_reviewed) {
    expect(source.evidence_reviewer).toEqual(expect.any(String));
    expect(source.evidence_reviewed_at).toEqual(expect.any(String));
  }
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
    const unsupportedReviewFlag = normalizePublicationSource({
      id: 'unsupported-review-flag',
      url: 'https://independent.example/unsupported-review-flag',
      publisher: 'Independent Example',
      source_tier: 'T2',
      source_role: 'independent',
      resolving: true,
      evidence_reviewed: true,
    });
    expect(unsupportedReviewFlag.evidence_reviewed).toBe(false);
    for (const invalidTimestamp of ['not-a-date', '2026-99-99', '2026-07-29T99:99:99Z']) {
      const invalidReview = normalizePublicationSource({
        id: invalidTimestamp,
        url: 'https://independent.example/invalid-review',
        source_tier: 'T2',
        source_role: 'independent',
        resolving: true,
        evidence_reviewed: true,
        evidence_reviewer: 'publication-depth-test',
        evidence_reviewed_at: invalidTimestamp,
      });
      expect(invalidReview.evidence_reviewed, invalidTimestamp).toBe(false);
      expect(invalidReview.evidence_reviewed_at, invalidTimestamp).toBeNull();
    }

    const forbidden = normalizePublicationSource({
      id: 'forbidden',
      url: 'https://independent.example/forbidden',
      source_tier: 'T2',
      source_role: 'independent',
      resolving: false,
      access_state: 'http_403',
    });
    expect(forbidden).toMatchObject({
      access_state: 'http_403',
      resolving: false,
    });
    const indexedOnly = normalizePublicationSource({
      id: 'indexed-only',
      url: 'https://independent.example/indexed-only',
      source_tier: 'T2',
      source_role: 'independent',
      resolving: true,
      access_state: 'bot_blocked_raw_fetch',
    });
    expect(indexedOnly).toMatchObject({
      access_state: 'bot_blocked_raw_fetch',
      resolving: true,
    });
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
      evidence_reviewer: 'publication-depth-test',
      evidence_reviewed_at: '2026-07-29T12:00:00Z',
    });
    const primary = source('operator', 'T2', 'primary');
    const independent = source('independent', 'T2', 'independent');
    const tierOneIndependent = source('tier-one-independent', 'T1', 'independent');
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
    expect(assess('causal', tierOneIndependent).passes).toBe(true);
    expect(assess('legal', tierOneIndependent).passes).toBe(true);
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

    const syndicatedFirst = normalizePublicationSource({
      id: 'syndicated-tier-three-one',
      url: 'https://syndicated-one.example/evidence',
      publisher: 'Syndicated One',
      source_tier: 'T3',
      source_role: 'independent',
      resolving: true,
      evidence_reviewed: true,
      evidence_reviewer: 'publication-depth-test',
      evidence_reviewed_at: '2026-07-29T12:00:00Z',
      evidence_origin: 'shared-project-announcement',
    });
    const syndicatedSecond = normalizePublicationSource({
      id: 'syndicated-tier-three-two',
      url: 'https://syndicated-two.example/evidence',
      publisher: 'Syndicated Two',
      source_tier: 'T3',
      source_role: 'independent',
      resolving: true,
      evidence_reviewed: true,
      evidence_reviewer: 'publication-depth-test',
      evidence_reviewed_at: '2026-07-29T12:00:00Z',
      independence_group: 'shared-project-announcement',
    });
    const syndicatedAssessment = assess('causal', syndicatedFirst, syndicatedSecond);
    expect(syndicatedFirst.independence_key).toBe('shared-project-announcement');
    expect(syndicatedSecond.independence_key).toBe('shared-project-announcement');
    expect(syndicatedAssessment.passes).toBe(false);
    expect(syndicatedAssessment.independent_t3_publisher_count).toBe(1);

    const sameNewsroomRoot = normalizePublicationSource({
      id: 'newsroom-root',
      url: 'https://coindesk.com/evidence',
      publisher: ' CoinDesk ',
      source_tier: 'T3',
      source_role: 'independent',
      resolving: true,
      evidence_reviewed: true,
      evidence_reviewer: 'publication-depth-test',
      evidence_reviewed_at: '2026-07-29T12:00:00Z',
    });
    const sameNewsroomSubdomain = normalizePublicationSource({
      id: 'newsroom-subdomain',
      url: 'https://markets.coindesk.com/other-evidence',
      publisher: 'COINDESK MARKETS',
      source_tier: 'T3',
      source_role: 'independent',
      resolving: true,
      evidence_reviewed: true,
      evidence_reviewer: 'publication-depth-test',
      evidence_reviewed_at: '2026-07-29T12:00:00Z',
    });
    expect(sameNewsroomRoot.independence_key).toBe('coindesk.com');
    expect(sameNewsroomSubdomain.independence_key).toBe('coindesk.com');
    expect(assess('causal', sameNewsroomRoot, sameNewsroomSubdomain).passes).toBe(false);

    const publisherCaseOne = normalizePublicationSource({
      id: 'publisher-case-one',
      url: null,
      publisher: ' Independent Newsroom ',
      source_tier: 'T3',
      source_role: 'independent',
      resolving: true,
      evidence_reviewed: true,
      evidence_reviewer: 'publication-depth-test',
      evidence_reviewed_at: '2026-07-29T12:00:00Z',
    });
    const publisherCaseTwo = normalizePublicationSource({
      id: 'publisher-case-two',
      url: null,
      publisher: 'independent   newsroom',
      source_tier: 'T3',
      source_role: 'independent',
      resolving: true,
      evidence_reviewed: true,
      evidence_reviewer: 'publication-depth-test',
      evidence_reviewed_at: '2026-07-29T12:00:00Z',
    });
    expect(publisherCaseOne.independence_key).toBe('independent newsroom');
    expect(publisherCaseTwo.independence_key).toBe('independent newsroom');
    expect(assess('causal', publisherCaseOne, publisherCaseTwo).passes).toBe(false);

    const authority = normalizePublicationSource({
      id: 'authority',
      url: 'https://www.sec.gov/example',
      publisher: 'SEC',
      source_tier: 'T1',
      source_role: 'independent',
      resolving: true,
      evidence_reviewed: true,
      evidence_reviewer: 'publication-depth-test',
      evidence_reviewed_at: '2026-07-29T12:00:00Z',
    });
    expect(authority.role).toBe('authority');
    expect(assess('legal', authority).passes).toBe(true);

    const issuerFiledDisclosure = normalizePublicationSource({
      id: 'issuer-filed-disclosure',
      url: 'https://www.sec.gov/Archives/edgar/data/1/issuer-s1.htm',
      publisher: 'Issuer filing hosted by SEC EDGAR',
      source_tier: 'T1',
      source_role: 'primary',
      resolving: true,
      evidence_reviewed: true,
      evidence_reviewer: 'publication-depth-test',
      evidence_reviewed_at: '2026-07-29T12:00:00Z',
    });
    expect(issuerFiledDisclosure.role).toBe('primary');
    expect(issuerFiledDisclosure.classification_basis).toBe('declared_metadata');
    expect(assess('causal', issuerFiledDisclosure).passes).toBe(false);
    expect(assess('legal', issuerFiledDisclosure).passes).toBe(false);

    const secEnforcementRelease = normalizePublicationSource({
      id: 'sec-enforcement-release',
      url: 'https://www.sec.gov/newsroom/press-releases/example-enforcement-release',
      publisher: 'SEC',
      resolving: true,
      evidence_reviewed: true,
      evidence_reviewer: 'publication-depth-test',
      evidence_reviewed_at: '2026-07-29T12:00:00Z',
    });
    expect(secEnforcementRelease.role).toBe('authority');
    expect(secEnforcementRelease.classification_basis).toBe('host_policy');
    expect(assess('legal', secEnforcementRelease).passes).toBe(true);
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
      editorially_reviewed_source_ref_count: 1,
    });
  });

  it('records tier, role, access, editorial review, and field-level locators for every new source', () => {
    expect(manifest.source_verification.results).toHaveLength(11);
    expect(manifest.source_verification.method)
      .toContain('does not establish claim-level editorial review');
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
      expect(source.evidence_reviewed).toBe(false);
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
        evidence_reviewed: false,
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

    const allWaveSources = [
      ...manifest.exchange_patches.flatMap(({ sources }) => sources),
      ...manifest.casino_patches.flatMap(({ sources }) => sources),
      ...manifest.nft_patches.flatMap(({ sources }) => sources),
      ...manifest.reference_repairs.exchange_patches.flatMap(({ sources }) => sources),
      ...manifest.reference_repairs.casino_patches.flatMap(({ sources }) => sources),
      ...manifest.reference_repairs.casino_strengthening_patches
        .flatMap(({ sources }) => sources),
    ];
    const reviewed = allWaveSources.filter(({ evidence_reviewed: value }) => (
      value === true || value === 1
    ));
    const resolvingUnreviewed = allWaveSources.filter((source) => (
      (source.resolving === true || source.resolving === 1)
        && (source.evidence_reviewed === false || source.evidence_reviewed === 0)
    ));
    expect(allWaveSources).toHaveLength(190);
    expect(reviewed).toHaveLength(4);
    expect(reviewed.every((source) => (
      source.evidence_reviewer && source.evidence_reviewed_at
    ))).toBe(true);
    expect(resolvingUnreviewed).toHaveLength(168);

    const unsupportedReview = structuredClone(manifest);
    unsupportedReview.exchange_patches[0].sources[0].evidence_reviewed = true;
    expect(() => validatePublicationDepthManifest(unsupportedReview))
      .toThrow(/editorial review requires reviewer identity and review time/);
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
      high_risk_claim_count: 1168,
      unresolved_high_risk_claim_count: 1088,
      dossiers_with_unresolved_high_risk_claims: 137,
      dossiers_with_unmatched_source_refs: 41,
    });
    expect(after.summary).toMatchObject({
      dossier_count: 139,
      high_risk_claim_count: 1172,
      unresolved_high_risk_claim_count: 1084,
      dossiers_with_unresolved_high_risk_claims: 137,
      dossiers_with_unmatched_source_refs: 0,
    });
    expect(after.dossiers.every(({ unmatched_source_ref_count: count }) => count === 0))
      .toBe(true);
    expect(inventoryDocument.before_summary).toEqual(before.summary);
    expect(inventoryDocument.after_summary).toEqual(after.summary);
    expect(inventoryDocument.dossiers).toEqual(after.dossiers);
    expect(inventoryDocument.delta).toEqual({
      high_risk_claim_count: 4,
      passing_high_risk_claim_count: 8,
      unresolved_high_risk_claim_count: -4,
      dossiers_with_unresolved_high_risk_claims: 0,
      dossiers_with_unmatched_source_refs: -41,
    });

    const expectedRepairs = {
      'cex:dead:bitmex': [6, 6],
      'cex:mid:kucoin': [7, 7],
      'bc-game-curacao-small-house': [5, 1],
      'f1-delta-time': [12, 12],
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
      expect(payload.cases[0].analysis.forensic_analysis_status).toBe('support_pending');
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
    expect(casino.sources.every((source) => (
      source.registered === true
        && typeof source.reachable === 'boolean'
        && typeof source.evidence_reviewed === 'boolean'
        && source.source_tier
        && source.source_role
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
    const exchangeClaimSupport = [];
    for (const kind of ['dex', 'cex']) {
      const response = await worker.fetch(
        new Request(`http://localhost/api/exchange-analysis?kind=${kind}`),
        env,
        ctx(),
      );
      expect(response.status, kind).toBe(200);
      const payload = await response.json();
      exchangeCases.push(...payload.cases);
      exchangeClaimSupport.push(payload.claim_support);
    }
    expect(exchangeCases).toHaveLength(59);
    expect(exchangeClaimSupport.reduce((total, item) => ({
      high_risk_claim_count: total.high_risk_claim_count + item.high_risk_claim_count,
      passing_high_risk_claim_count: total.passing_high_risk_claim_count
        + item.passing_high_risk_claim_count,
      unresolved_high_risk_claim_count: total.unresolved_high_risk_claim_count
        + item.unresolved_high_risk_claim_count,
    }), {
      high_risk_claim_count: 0,
      passing_high_risk_claim_count: 0,
      unresolved_high_risk_claim_count: 0,
    })).toEqual({
      high_risk_claim_count: 383,
      passing_high_risk_claim_count: 0,
      unresolved_high_risk_claim_count: 383,
    });
    for (const item of exchangeCases) {
      expect(item.analysis.forensic_analysis_status, item.slug).toBe('support_pending');
      expect(item.publication_depth, item.slug).toMatchObject({
        status: 'claim_support_pending',
        high_risk_claim_count: expect.any(Number),
        passing_high_risk_claim_count: 0,
        unresolved_high_risk_claim_count: expect.any(Number),
        registered_source_count: expect.any(Number),
        reachable_source_count: expect.any(Number),
        reviewed_source_count: expect.any(Number),
      });
      const analysis = item.analysis.forensic_analysis;
      expect(analysis, item.slug).toBeTruthy();
      item.sources.forEach(expectPublicationSourceState);
      const registered = registeredSourceKeys(item.sources);
      for (const reference of forensicReferences(analysis)) {
        expect(registered.has(reference), `${item.slug}: ${reference}`).toBe(true);
      }
    }

    const casinoListResponse = await worker.fetch(
      new Request('http://localhost/api/casinos'),
      env,
      ctx(),
    );
    expect(casinoListResponse.status).toBe(200);
    const casinoList = await casinoListResponse.json();
    expect(casinoList.cases).toHaveLength(29);
    expect(casinoList.claim_support).toMatchObject({
      high_risk_claim_count: 239,
      passing_high_risk_claim_count: 88,
      unresolved_high_risk_claim_count: 151,
    });
    expect(casinoList.cases.every(({ publication_depth: depth }) => (
      depth
        && typeof depth.high_risk_claim_count === 'number'
        && typeof depth.unresolved_high_risk_claim_count === 'number'
    ))).toBe(true);

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
      expect(item.publication_depth, caseId).toMatchObject({
        high_risk_claim_count: expect.any(Number),
        passing_high_risk_claim_count: expect.any(Number),
        unresolved_high_risk_claim_count: expect.any(Number),
      });
      const registered = registeredSourceKeys(item.sources);
      for (const reference of forensicReferences(item.synthesis.forensic_analysis)) {
        expect(registered.has(reference), `${caseId}: ${reference}`).toBe(true);
      }
      for (const observation of item.observations) {
        if (observation.publication_support !== 'pending_independent_support') continue;
        expect(observation.value, `${caseId}: ${observation.observation_id}`).toBeNull();
        expect(observation.method, `${caseId}: ${observation.observation_id}`).toBeNull();
      }
      for (const event of item.events) {
        if (event.publication_support !== 'pending_independent_support') continue;
        expect(event.event_type, `${caseId}: ${event.event_id}`).toBeNull();
        expect(event.description, `${caseId}: ${event.event_id}`).toBeNull();
      }
      for (const licence of item.licences) {
        if (licence.publication_support !== 'pending_independent_support') continue;
        expect(licence.authority, `${caseId}: ${licence.licence_observation_id}`).toBeNull();
        expect(licence.licence_status, `${caseId}: ${licence.licence_observation_id}`).toBeNull();
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
      missing_case_ids: [],
    });

    const nftResponse = await worker.fetch(
      new Request('http://localhost/api/nft'),
      env,
      ctx(),
    );
    expect(nftResponse.status).toBe(200);
    const nftPayload = await nftResponse.json();
    expect(nftPayload.collections).toHaveLength(51);
    expect(nftPayload.claim_support).toMatchObject({
      high_risk_claim_count: 550,
      passing_high_risk_claim_count: 0,
      unresolved_high_risk_claim_count: 550,
    });
    for (const item of nftPayload.collections) {
      const sources = JSON.parse(item.sources);
      expect(item.publication_sources).toHaveLength(sources.length);
      item.publication_sources.forEach(expectPublicationSourceState);
      const analysis = item.profile.forensic_analysis;
      expect(analysis, item.slug).toBeTruthy();
      expect(item.publication_depth, item.slug).toMatchObject({
        status: 'claim_support_pending',
        high_risk_claim_count: expect.any(Number),
        passing_high_risk_claim_count: 0,
        unresolved_high_risk_claim_count: expect.any(Number),
        registered_source_count: expect.any(Number),
        reachable_source_count: expect.any(Number),
        reviewed_source_count: expect.any(Number),
      });
      expect(item.source_status, item.slug).toEqual({
        registered: item.publication_depth.registered_source_count,
        reachable: item.publication_depth.reachable_source_count,
        editor_reviewed: item.publication_depth.reviewed_source_count,
      });
      expect(analysis.outcome, item.slug).toMatchObject({
        publication_support: 'pending_independent_support',
      });
      expect(analysis.outcome, item.slug).not.toHaveProperty('summary');
      expect(analysis.why, item.slug).toMatchObject({
        publication_support: 'pending_independent_support',
      });
      expect(analysis.why, item.slug).not.toHaveProperty('summary');
      const registered = registeredSourceKeys(sources);
      for (const reference of forensicReferences(analysis)) {
        expect(registered.has(reference), `${item.slug}: ${reference}`).toBe(true);
      }
    }
  });

  it('redacts unsupported conclusions from every public machine route', async () => {
    database = createCorpus();
    const exchangeSentinels = {
      dead: 'RAW_PENDING_DEAD_EXCHANGE_CAUSAL_SENTINEL',
      mid: 'RAW_PENDING_MID_EXCHANGE_CAUSAL_SENTINEL',
      successful: 'RAW_PENDING_SUCCESS_EXCHANGE_CAUSAL_SENTINEL',
    };
    const unsupportedLossMetric = 987654321;
    database.prepare(`
      UPDATE dead_exchanges
      SET why = ?,
          outlook = ?,
          current_metric = ?,
          profile = json_set(
            profile,
            '$.risks', ?,
            '$.synthesis', ?,
            '$.trigger', ?,
            '$.reserve_drop_usd', ?,
            '$.prior_liquidity_injection', ?,
            '$.flagged_by', ?,
            '$.withdrawals_suspended_since', ?,
            '$.status', ?
          )
      WHERE slug = 'ascendex'
    `).run(
      exchangeSentinels.dead,
      exchangeSentinels.dead,
      unsupportedLossMetric,
      exchangeSentinels.dead,
      exchangeSentinels.dead,
      exchangeSentinels.dead,
      exchangeSentinels.dead,
      exchangeSentinels.dead,
      exchangeSentinels.dead,
      exchangeSentinels.dead,
      exchangeSentinels.dead,
    );
    database.prepare(`
      UPDATE mid_exchanges
      SET why_stuck = ?,
          outlook = ?,
          profile = json_set(profile, '$.risks', ?, '$.synthesis', ?)
      WHERE slug = 'balancer'
    `).run(
      exchangeSentinels.mid,
      exchangeSentinels.mid,
      exchangeSentinels.mid,
      exchangeSentinels.mid,
    );
    database.prepare(`
      UPDATE successful_exchanges
      SET why_successful = ?,
          outlook = ?,
          profile = json_set(profile, '$.risks', ?, '$.synthesis', ?)
      WHERE slug = 'coinbase'
    `).run(
      exchangeSentinels.successful,
      exchangeSentinels.successful,
      exchangeSentinels.successful,
      exchangeSentinels.successful,
    );

    const nftSentinel = 'RAW_PENDING_NFT_DUPLICATE_CAUSAL_SENTINEL';
    database.prepare(`
      UPDATE nft_collections
      SET profile = json_set(
        profile,
        '$.analysis', ?,
        '$.why', json_object('summary', ?),
        '$.strategic_choices', json_array(json_object('decision', ?)),
        '$.counterfactual', json_object('summary', ?),
        '$.risks', json_array(?),
        '$.chronology', ?,
        '$.team', ?,
        '$.chain_dependence', ?,
        '$.status', ?
      )
      WHERE slug = 'quantum-cats'
    `).run(
      nftSentinel,
      nftSentinel,
      nftSentinel,
      nftSentinel,
      nftSentinel,
      nftSentinel,
      nftSentinel,
      nftSentinel,
      nftSentinel,
    );
    const nftRiskSentinel = 'RAW_PENDING_NFT_RISK_FLAG_SENTINEL';
    database.prepare(`
      UPDATE risk_flags
      SET summary = ?, evidence = ?
      WHERE entity_type = 'nft' AND entity_name = 'Azuki'
    `).run(nftRiskSentinel, nftRiskSentinel);

    const casinoSentinel = 'RAW_PENDING_CASINO_SYNTHESIS_SENTINEL';
    database.prepare(`
      UPDATE casino_syntheses
      SET present_situation = ?,
          business_mechanism = ?,
          token_contribution = ?,
          chain_dependence = ?,
          risk_legal_posture = ?,
          success_failure_hypotheses = ?,
          counterfactual = ?,
          lessons_learned = json_array(?),
          outlook = json_set(
            outlook,
            '$.classification', ?,
            '$.product_status', ?
          )
      WHERE case_id = 'kingtiger-casino'
    `).run(
      casinoSentinel,
      casinoSentinel,
      casinoSentinel,
      casinoSentinel,
      casinoSentinel,
      casinoSentinel,
      casinoSentinel,
      casinoSentinel,
      casinoSentinel,
      casinoSentinel,
    );

    const worker = await freshWorker();
    const env = { DB: d1Adapter(database) };
    for (const [kind, lifecycle, slug, sentinel] of [
      ['cex', 'dead', 'ascendex', exchangeSentinels.dead],
      ['dex', 'mid', 'balancer', exchangeSentinels.mid],
      ['cex', 'successful', 'coinbase', exchangeSentinels.successful],
    ]) {
      const response = await worker.fetch(
        new Request(
          `http://localhost/api/exchange-analysis?kind=${kind}`
            + `&lifecycle=${lifecycle}&slug=${slug}`,
        ),
        env,
        ctx(),
      );
      const payload = await response.json();
      expect(JSON.stringify(payload), `${lifecycle} exchange canonical route`)
        .not.toContain(sentinel);
      expect(payload.cases[0]).toMatchObject({
        status: null,
        summary: null,
        outlook: null,
        publication_support: {
          status: 'pending_independent_support',
          summary: 'pending_independent_support',
          outlook: 'pending_independent_support',
        },
      });
      if (slug === 'ascendex') {
        expect(payload.cases[0]).toMatchObject({
          metric: null,
          publication_support: {
            metric: 'pending_independent_support',
          },
        });
        expect(JSON.stringify(payload)).not.toContain(String(unsupportedLossMetric));
      }
    }
    for (const [route, sentinel] of [
      ['/api/dead-exchanges?kind=cex', exchangeSentinels.dead],
      ['/api/mid-exchanges?kind=dex', exchangeSentinels.mid],
      ['/api/successful-exchanges?kind=cex', exchangeSentinels.successful],
    ]) {
      const response = await worker.fetch(new Request(`http://localhost${route}`), env, ctx());
      const payload = await response.json();
      expect(JSON.stringify(payload), route).not.toContain(sentinel);
      if (route.startsWith('/api/dead-exchanges')) {
        const ascendex = payload.exchanges.find(({ slug }) => slug === 'ascendex');
        expect(ascendex).toMatchObject({
          current_metric: null,
          publication_support: {
            metric: 'pending_independent_support',
          },
        });
        expect(JSON.stringify(payload)).not.toContain(String(unsupportedLossMetric));
      }
    }

    const nftResponse = await worker.fetch(
      new Request('http://localhost/api/nft'),
      env,
      ctx(),
    );
    const nftPayload = await nftResponse.json();
    expect(JSON.stringify(nftPayload)).not.toContain(nftSentinel);
    expect(JSON.stringify(nftPayload)).not.toContain(nftRiskSentinel);
    const quantumCats = nftPayload.collections.find(({ slug }) => slug === 'quantum-cats');
    expect(quantumCats).toMatchObject({
      status: 'unknown',
      publication_support: {
        status: 'pending_independent_support',
        profile: 'pending_independent_support',
      },
    });
    for (const field of [
      'analysis',
      'chain_dependence',
      'chronology',
      'counterfactual',
      'risks',
      'strategic_choices',
      'status',
      'team',
      'why',
    ]) {
      expect(quantumCats.profile[field], field).toBeNull();
    }
    const azuki = nftPayload.collections.find(({ slug }) => slug === 'azuki');
    expect(azuki.risk).toMatchObject({
      level: 'review_pending',
      summary: null,
      evidence: null,
      publication_support: 'pending_independent_support',
    });

    const casinoListResponse = await worker.fetch(
      new Request('http://localhost/api/casinos'),
      env,
      ctx(),
    );
    const casinoList = await casinoListResponse.json();
    expect(JSON.stringify(casinoList)).not.toContain(casinoSentinel);
    const kingTiger = casinoList.cases.find(
      ({ case_id: caseId }) => caseId === 'kingtiger-casino',
    );
    expect(kingTiger).toMatchObject({
      status: null,
      status_as_of: null,
      outcome_label: null,
      outcome_as_of: null,
      publication_support: {
        status: 'pending_independent_support',
        outcome: 'pending_independent_support',
      },
    });
    const bcGame = casinoList.cases.find(
      ({ case_id: caseId }) => caseId === 'bc-game-curacao-small-house',
    );
    expect(bcGame).toMatchObject({
      status: 'insolvent',
      outcome_label: 'failed',
      publication_support: { status: null, outcome: null },
    });

    const casinoDetailResponse = await worker.fetch(
      new Request('http://localhost/api/casino/kingtiger-casino'),
      env,
      ctx(),
    );
    const casinoDetail = await casinoDetailResponse.json();
    expect(JSON.stringify(casinoDetail)).not.toContain(casinoSentinel);
    expect(casinoDetail.case).toMatchObject({
      status: null,
      outcome_label: null,
    });
    expect(casinoDetail.synthesis).toMatchObject({
      present_situation: null,
      business_mechanism: null,
      token_contribution: null,
      chain_dependence: null,
      risk_legal_posture: null,
      success_failure_hypotheses: null,
      counterfactual: null,
      lessons_learned: [],
    });
    expect(casinoDetail.synthesis.forensic_analysis.counterfactual).toMatchObject({
      publication_support: 'pending_independent_support',
    });
  });

  it('reports a deleted expected casino as missing without shrinking the cohort', async () => {
    database = createCorpus();
    database.prepare(`
      DELETE FROM casino_cases
      WHERE case_id = 'zkasino-alleged-platform'
    `).run();
    const worker = await freshWorker();
    const response = await worker.fetch(
      new Request('http://localhost/api/casino-coverage'),
      { DB: d1Adapter(database) },
      ctx(),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).coverage).toMatchObject({
      target_count: 29,
      present_count: 28,
      quality_passed_count: 28,
      missing_count: 1,
      missing_case_ids: ['zkasino-alleged-platform'],
    });
  });

  it('does not count or expose a casino review flag without reviewer provenance', async () => {
    database = createCorpus();
    const target = database.prepare(`
      SELECT cl.case_id, cl.source_id
      FROM casino_claims cl
      JOIN casino_sources s ON s.source_id = cl.source_id
      JOIN casino_cases c ON c.case_id = cl.case_id
      WHERE c.quality_passed = 1
      ORDER BY cl.case_id, cl.source_id
      LIMIT 1
    `).get();
    expect(target).toBeTruthy();
    database.prepare(`
      UPDATE casino_sources
      SET resolving = 1,
          evidence_reviewed = 1,
          evidence_reviewer = 'malformed-review-test',
          evidence_reviewed_at = '2026-99-99'
      WHERE source_id = ?
    `).run(target.source_id);

    const worker = await freshWorker();
    const env = { DB: d1Adapter(database) };
    const listResponse = await worker.fetch(
      new Request('http://localhost/api/casinos'),
      env,
      ctx(),
    );
    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json();
    const listed = listPayload.cases.find(({ case_id: caseId }) => caseId === target.case_id);
    expect(listed).toBeTruthy();
    expect(listed.reviewed_source_count).toBe(listed.publication_depth.reviewed_source_count);
    expect(listed.source_count).toBe(listed.publication_depth.reviewed_source_count);

    const detailResponse = await worker.fetch(
      new Request(`http://localhost/api/casino/${target.case_id}`),
      env,
      ctx(),
    );
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json();
    const exposed = detail.sources.find(({ id }) => id === target.source_id);
    expect(exposed).toMatchObject({
      evidence_reviewed: false,
      evidence_reviewer: 'malformed-review-test',
      evidence_reviewed_at: null,
    });
    expect(detail.case.reviewed_source_count)
      .toBe(detail.publication_depth.reviewed_source_count);
    expect(detail.case.source_count).toBe(detail.publication_depth.reviewed_source_count);
  });
});

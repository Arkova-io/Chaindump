import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANALYSIS_SECTION_KEYS,
  embeddedCanonicalEntityProfile,
  validateEntityProfile,
} from '../src/lib/entity-profile.js';
import {
  document,
  profile,
  renderMigration,
} from '../scripts/render-quantum-cats-profile-migration.mjs';

const migration = readFileSync(
  new URL('../migrations/0072_quantum_cats_profile.sql', import.meta.url),
  'utf8',
);
const researchDocument = JSON.parse(readFileSync(
  new URL('../docs/quantum-cats-profile-2026-08-03.json', import.meta.url),
  'utf8',
));
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');

function openDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE nft_collections (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      chain TEXT NOT NULL,
      category TEXT,
      status TEXT,
      profile TEXT NOT NULL CHECK (json_valid(profile)),
      sources TEXT NOT NULL CHECK (json_valid(sources)),
      updated_at TEXT
    );
    INSERT INTO nft_collections VALUES
      ('quantum-cats', 'Quantum Cats', 'bitcoin-ordinals', 'ordinals-pfp', 'middling',
       '{"preserved":"legacy","forensic_analysis":{"preserved":true}}', '[]', '2026-07-29'),
      ('untouched', 'Untouched', 'ethereum', 'pfp', 'successful',
       '{"preserved":"untouched"}', '[]', '2026-07-29');
  `);
  return database;
}

function canonical(database) {
  const row = database.prepare(
    'SELECT profile FROM nft_collections WHERE slug = ?',
  ).get('quantum-cats');
  return embeddedCanonicalEntityProfile(row?.profile, {
    type: 'ordinals_collection',
    slug: 'quantum-cats',
  });
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
          if (sql.includes('snapshot_cache')) {
            return { data: '{"chains":[]}', updated_at: Date.now() };
          }
          return database.prepare(sql).get(...bindings) ?? null;
        },
      };
    },
  };
}

function profileRenderer() {
  const start = html.indexOf('const PROFILE_SECTION_ORDER');
  const end = html.indexOf('\nfunction synthesisHtml', start);
  if (start < 0 || end < 0) throw new Error('canonical profile renderer not found');
  const context = {
    Date, Intl, URL,
    state: { profileCache: {}, profileRequest: 0 },
    document: { getElementById: () => null },
    history: { pushState() {}, replaceState() {} },
    location: { pathname: '/' },
    fetch: async () => { throw new Error('not used in renderer test'); },
    switchView() {},
    fmtUsd: (value) => `$${Number(value).toLocaleString('en-US')}`,
    esc: (value) => String(value ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#39;'),
    safeUrl: (value) => /^https:\/\//.test(String(value || '')) ? String(value) : '#',
    normalizedText: (value) => typeof value === 'string' ? value.trim() : '',
    normalizedLabel: (key) => String(key).replaceAll('_', ' '),
    verdictClass: () => 'middling',
  };
  vm.runInNewContext(html.slice(start, end), context);
  return context.canonicalProfileHtml;
}

async function freshWorker() {
  vi.resetModules();
  return (await import('../src/worker.js')).default;
}

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });
let database;

beforeEach(() => {
  database = openDatabase();
});

afterEach(() => {
  database?.close();
  database = undefined;
  vi.unstubAllGlobals();
});

describe('Quantum Cats canonical Ordinals profile', () => {
  it('keeps the research document and generated migration deterministic', () => {
    expect(researchDocument).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document.generated_migration).toBe('0072_quantum_cats_profile.sql');
    expect(document.entity.canonical_profile).toEqual(profile);
  });

  it('ships the exact ten-section contract as deep, cited, review-only prose', () => {
    database.exec(migration);
    const result = canonical(database);

    expect(validateEntityProfile(result)).toEqual([]);
    expect(result.identity).toMatchObject({
      id: 'ordinals_collection:quantum-cats',
      type: 'ordinals_collection',
      slug: 'quantum-cats',
      name: 'Quantum Cats',
    });
    expect(Object.keys(result.analysis.sections)).toEqual(ANALYSIS_SECTION_KEYS);
    expect(result.quality).toMatchObject({
      publication_state: 'review',
      completeness_pct: 100,
      confidence: 'medium',
    });
    expect(result.claims.every(({ review }) => (
      review.state === 'pending'
      && review.reviewer === null
      && review.reviewed_at === null
    ))).toBe(true);

    for (const [sectionKey, section] of Object.entries(result.analysis.sections)) {
      expect(section.body.length, sectionKey).toBeGreaterThan(500);
      expect(section.claim_ids, sectionKey).toEqual([
        `claim:quantum-cats:section:${sectionKey}`,
      ]);
      const claim = result.claims.find(({ id }) => id === section.claim_ids[0]);
      expect(claim?.source_ids.length, sectionKey).toBeGreaterThan(0);
      expect(claim?.field_path).toBe(`analysis.sections.${sectionKey}.body`);
    }
    expect(result.sources).toHaveLength(14);
    expect(result.metrics).toHaveLength(7);
    expect(result.events).toHaveLength(10);
  });

  it('keeps advocacy, utility, protocol activation and market observations honest', () => {
    database.exec(migration);
    const result = canonical(database);
    const prose = Object.values(result.analysis.sections).map(({ body }) => body).join(' ');

    expect(result.analysis.sections.what_it_is.body).toContain(
      'does not give the holder a vote over Bitcoin',
    );
    expect(result.analysis.sections.token_and_value_capture.body).toContain(
      'company financing, which must not be counted as value accruing to Cat holders',
    );
    expect(result.analysis.sections.risks_and_unknowns.body).toContain(
      'does not mean OP_CAT is active on Bitcoin',
    );
    expect(result.analysis.sections.risks_and_unknowns.body).toContain(
      'not an executable bid, broad liquidity or realized collection valuation',
    );
    expect(result.analysis.sections.why_this_outcome.body).toContain(
      'does not prove a single cause',
    );
    expect(prose).not.toMatch(/guaranteed|risk[- ]free|certain to|will activate/i);

    const sales = result.metrics.find(({ dimension }) => dimension === 'sales');
    expect(sales).toMatchObject({
      value: 1,
      window: { definition: 'rolling_24h' },
      quality_flags: expect.arrayContaining(['thin_observation', 'not_liquidity_measure']),
    });
    const marketCap = result.metrics.find(({ dimension }) => dimension === 'market_cap');
    expect(marketCap.quality_flags).toContain('not_realized_valuation');
    expect(result.freshness).toEqual({
      state: 'current',
      last_reviewed_at: '2026-08-03T17:01:09Z',
      next_review_at: '2026-08-10T17:01:09Z',
      field_reviews: [],
    });
    expect(result.extensions.methodology_notes[0]).toContain(
      'source verification, not human approval',
    );
  });

  it('cannot be promoted without a human reviewing supporting claims', () => {
    const candidate = structuredClone(profile);
    candidate.quality.publication_state = 'published';
    const errors = validateEntityProfile(candidate, {
      forPublication: true,
      now: new Date('2026-08-03T18:00:00Z'),
    });
    expect(new Set(errors.map(({ code }) => code))).toEqual(
      new Set(['reviewed_support_required']),
    );
    expect(errors).toHaveLength(
      2 + ANALYSIS_SECTION_KEYS.length + candidate.metrics.length + candidate.events.length,
    );
  });

  it('preserves prior research, leaves other collections untouched and replays cleanly', () => {
    database.exec(migration);
    const first = database.prepare(
      'SELECT slug, status, profile, sources, updated_at FROM nft_collections ORDER BY slug',
    ).all();
    const quantumCats = first.find(({ slug }) => slug === 'quantum-cats');
    const parsed = JSON.parse(quantumCats.profile);
    expect(parsed.preserved).toBe('legacy');
    expect(parsed.forensic_analysis).toEqual({ preserved: true });
    expect(parsed.canonical_profile).toEqual(profile);
    expect(quantumCats.sources).toBe('[]');
    expect(quantumCats.updated_at).toBe('2026-08-03');

    database.exec(migration);
    expect(database.prepare(
      'SELECT slug, status, profile, sources, updated_at FROM nft_collections ORDER BY slug',
    ).all()).toEqual(first);
    expect(first.find(({ slug }) => slug === 'untouched')).toEqual({
      slug: 'untouched',
      status: 'successful',
      profile: '{"preserved":"untouched"}',
      sources: '[]',
      updated_at: '2026-07-29',
    });
    expect(database.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='_quantum_cats_profile_0072'",
    ).get().count).toBe(0);
  });

  it('routes the embedded profile before the thin NFT adapter', () => {
    const functionStart = workerSource.indexOf('async function nftEntityProfile(type, slug)');
    const embeddedBranch = workerSource.indexOf(
      'const embeddedProfile = embeddedCanonicalEntityProfile(row.profile, { type, slug });',
      functionStart,
    );
    const legacyBranch = workerSource.indexOf(
      'const rawProfile = profileJson(row.profile, {});',
      functionStart,
    );
    expect(functionStart).toBeGreaterThan(-1);
    expect(embeddedBranch).toBeGreaterThan(functionStart);
    expect(workerSource.slice(embeddedBranch, legacyBranch)).toContain(
      'if (embeddedProfile) return embeddedProfile;',
    );
    expect(legacyBranch).toBeGreaterThan(embeddedBranch);
  });

  it('serves the full dedicated API and page route, with responsive report UI', async () => {
    database.exec(migration);
    const worker = await freshWorker();
    const env = {
      DB: d1Adapter(database),
      ASSETS: {
        fetch: async () => new Response(html, {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      },
    };

    const apiResponse = await worker.fetch(
      new Request('http://localhost/api/profile/ordinals_collection/quantum-cats'),
      env,
      ctx(),
    );
    expect(apiResponse.status).toBe(200);
    const body = await apiResponse.json();
    expect(body).toEqual(profile);
    expect(Object.values(body.analysis.sections).map(({ body: text }) => text).join(' ').length)
      .toBeGreaterThan(7000);

    const wrongType = await worker.fetch(
      new Request('http://localhost/api/profile/nft_collection/quantum-cats'),
      env,
      ctx(),
    );
    expect(wrongType.status).toBe(404);

    const page = await worker.fetch(
      new Request('http://localhost/profile/ordinals_collection/quantum-cats'),
      env,
      ctx(),
    );
    expect(page.status).toBe(200);
    const pageHtml = await page.text();
    expect(pageHtml).toContain('<title>Quantum Cats — Chaindump</title>');
    expect(pageHtml).toContain('@media(max-width:760px)');
    expect(pageHtml).toContain('.profile-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); }');
  });

  it('renders a materially deep human report without raw schema or evidence records', () => {
    const output = profileRenderer()(profile);
    const labels = [
      'What it is', 'What happened', 'Why this outcome', 'Strategic choices',
      'Operating model', 'Token and value capture', 'What could have been different',
      'Risks and unknowns', 'Lifecycle', 'Outlook and what to watch',
      'Key metrics', 'Evidence and sources',
    ];
    for (const label of labels) expect(output).toContain(label);
    expect(output.length).toBeGreaterThan(15000);
    expect(output).toContain('does not give the holder a vote over Bitcoin');
    expect(output).toContain('does not mean OP_CAT is active on Bitcoin');
    expect(output).toContain('Evidence and sources');
    expect(output).toContain('Quantum Cats market data API ↗');
    expect(output).not.toMatch(
      /source_ids|evidence_locator|validation_errors|structured_analysis|chaindump-entity-profile|\[object Object\]/,
    );
  });
});

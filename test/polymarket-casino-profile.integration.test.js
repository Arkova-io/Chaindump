import { readFileSync, readdirSync } from 'node:fs';
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
} from '../scripts/render-polymarket-casino-profile-migration.mjs';

const migration = readFileSync(
  new URL('../migrations/0074_polymarket_casino_profile.sql', import.meta.url),
  'utf8',
);
const researchDocument = JSON.parse(readFileSync(
  new URL('../docs/polymarket-casino-profile-2026-08-03.json', import.meta.url),
  'utf8',
));
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');

function openCorpus(through = 72) {
  const database = new DatabaseSync(':memory:');
  const files = readdirSync(new URL('../migrations/', import.meta.url))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .filter((file) => Number(file.slice(0, 4)) <= through)
    .sort();
  for (const file of files) {
    database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  return database;
}

function canonical(database) {
  const row = database.prepare(
    'SELECT outlook FROM casino_syntheses WHERE case_id = ?',
  ).get('polymarket-international');
  return embeddedCanonicalEntityProfile(row?.outlook, {
    type: 'web3_casino',
    slug: 'polymarket-international',
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
    verdictClass: () => 'successful',
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
  database = openCorpus();
});

afterEach(() => {
  database?.close();
  database = undefined;
  vi.unstubAllGlobals();
});

describe('Polymarket International canonical casino profile', () => {
  it('keeps the research document and migration deterministic', () => {
    expect(researchDocument).toEqual(document);
    expect(migration).toBe(renderMigration(document));
    expect(document.generated_migration).toBe('0074_polymarket_casino_profile.sql');
    expect(document.entity.canonical_profile).toEqual(profile);
  });

  it('ships ten deep, source-linked sections while preserving legal and metric boundaries', () => {
    database.exec(migration);
    const result = canonical(database);

    expect(validateEntityProfile(result)).toEqual([]);
    expect(result.identity).toMatchObject({
      id: 'web3_casino:polymarket-international',
      type: 'web3_casino',
      slug: 'polymarket-international',
      name: 'Polymarket International',
    });
    expect(Object.keys(result.analysis.sections)).toEqual(ANALYSIS_SECTION_KEYS);
    expect(result.quality).toMatchObject({
      publication_state: 'review',
      completeness_pct: 100,
      confidence: 'high',
    });
    expect(result.claims.every(({ review }) => (
      review.state === 'pending'
      && review.reviewer === null
      && review.reviewed_at === null
    ))).toBe(true);
    for (const [sectionKey, section] of Object.entries(result.analysis.sections)) {
      expect(section.body.length, sectionKey).toBeGreaterThan(500);
      expect(section.claim_ids, sectionKey).toEqual([
        `claim:polymarket:section:${sectionKey}`,
      ]);
      const claim = result.claims.find(({ id }) => id === section.claim_ids[0]);
      expect(claim?.source_ids.length, sectionKey).toBeGreaterThan(0);
    }
    expect(result.sources).toHaveLength(18);
    expect(result.metrics).toHaveLength(7);
    expect(result.events).toHaveLength(5);

    const prose = Object.values(result.analysis.sections).map(({ body }) => body).join(' ');
    expect(prose).toContain('did not make the international venue CFTC-regulated');
    expect(prose).toContain('not audited operator revenue');
    expect(prose).toContain('a public wallet is not proof of a person’s identity');
    expect(prose).not.toMatch(/guaranteed|risk[- ]free|certain to|will outperform/i);

    expect(result.metrics.find(({ id }) => id.includes('volume-24h'))).toMatchObject({
      value: 80892377,
      quality_flags: expect.arrayContaining(['not_unique_users']),
    });
    expect(result.metrics.find(({ id }) => id.includes('collateral'))).toMatchObject({
      value: 328654492,
      quality_flags: expect.arrayContaining(['tracked_collateral_not_executable_depth']),
    });
    expect(result.freshness).toEqual({
      state: 'current',
      last_reviewed_at: '2026-08-03T17:13:33Z',
      next_review_at: '2026-08-10T17:13:33Z',
      field_reviews: [],
    });
  });

  it('cannot be published before a human reviews its supporting claims', () => {
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

  it('preserves legacy research, leaves other casinos untouched and replays cleanly', () => {
    const beforePolymarket = database.prepare(
      'SELECT outlook, present_situation, reviewed_at FROM casino_syntheses WHERE case_id = ?',
    ).get('polymarket-international');
    const beforeOther = database.prepare(
      'SELECT * FROM casino_syntheses WHERE case_id = ?',
    ).get('stake-dot-com');

    database.exec(migration);
    const first = database.prepare(
      'SELECT outlook, present_situation, reviewed_at FROM casino_syntheses WHERE case_id = ?',
    ).get('polymarket-international');
    const parsed = JSON.parse(first.outlook);
    expect(parsed.forensic_analysis).toEqual(JSON.parse(beforePolymarket.outlook).forensic_analysis);
    expect(parsed.canonical_profile).toEqual(profile);
    expect(first.present_situation).toBe(beforePolymarket.present_situation);
    expect(first.reviewed_at).toBe(beforePolymarket.reviewed_at);
    expect(database.prepare(
      'SELECT * FROM casino_syntheses WHERE case_id = ?',
    ).get('stake-dot-com')).toEqual(beforeOther);

    database.exec(migration);
    expect(database.prepare(
      'SELECT outlook, present_situation, reviewed_at FROM casino_syntheses WHERE case_id = ?',
    ).get('polymarket-international')).toEqual(first);
    expect(database.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='_polymarket_profile_0074'",
    ).get().count).toBe(0);
  });

  it('routes the embedded profile before the legacy projection', () => {
    const functionStart = workerSource.indexOf('async function casinoEntityProfile(slug)');
    const embeddedBranch = workerSource.indexOf(
      'const embeddedProfile = embeddedCanonicalEntityProfile(outlook, {',
      functionStart,
    );
    const projectionBranch = workerSource.indexOf('const projection = projectCasinoProfile({', functionStart);
    expect(functionStart).toBeGreaterThan(-1);
    expect(embeddedBranch).toBeGreaterThan(functionStart);
    expect(workerSource.slice(embeddedBranch, projectionBranch)).toContain(
      'if (embeddedProfile) return embeddedProfile;',
    );
    expect(projectionBranch).toBeGreaterThan(embeddedBranch);
  });

  it('serves the dedicated API and responsive page route', async () => {
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
      new Request('http://localhost/api/profile/web3_casino/polymarket-international'),
      env,
      ctx(),
    );
    expect(apiResponse.status).toBe(200);
    expect(await apiResponse.json()).toEqual(profile);

    const page = await worker.fetch(
      new Request('http://localhost/profile/web3_casino/polymarket-international'),
      env,
      ctx(),
    );
    expect(page.status).toBe(200);
    const pageHtml = await page.text();
    expect(pageHtml).toContain('<title>Polymarket International — Chaindump</title>');
    expect(pageHtml).toContain('@media(max-width:760px)');
    expect(pageHtml).toContain('.profile-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); }');
  });

  it('renders a deep human report without raw schema or evidence records', () => {
    const output = profileRenderer()(profile);
    const labels = [
      'What it is', 'What happened', 'Why this outcome', 'Strategic choices',
      'Operating model', 'Token and value capture', 'What could have been different',
      'Risks and unknowns', 'Lifecycle', 'Outlook and what to watch',
      'Key metrics', 'Evidence and sources',
    ];
    for (const label of labels) expect(output).toContain(label);
    expect(output.length).toBeGreaterThan(17000);
    expect(output).toContain('did not make the international venue CFTC-regulated');
    expect(output).toContain('CFTC orders event-based binary options market operator');
    expect(output).not.toMatch(
      /source_ids|evidence_locator|validation_errors|structured_analysis|chaindump-entity-profile|\[object Object\]/,
    );
  });
});

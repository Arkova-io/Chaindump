import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateEntityProfile } from '../src/lib/entity-profile.js';
import {
  buildLiveBlockchainProfile,
  buildLiveStablecoinProfile,
  canonicalEntitySlug,
} from '../src/lib/live-profile-adapter.js';

const workerSource = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');

describe('live ranking profile fallbacks', () => {
  it('gives a newly ranked chain a cited partial profile without inventing a causal report', () => {
    const profile = buildLiveBlockchainProfile({
      rank: 47,
      key: 'fraxtal',
      name: 'Fraxtal',
      symbol: 'FXTL',
      category: 'l2-optimistic',
      tvl: 18_305_946,
      volume24h: 570_170,
      fees24h: 192.34,
      stables: 10_251_701,
      activeAddresses: 242,
    }, '2026-08-03T17:26:30.823Z');

    expect(profile.identity).toMatchObject({
      id: 'blockchain:fraxtal',
      type: 'blockchain',
      slug: 'fraxtal',
      name: 'Fraxtal',
    });
    expect(profile.analysis.sections.what_it_is.body).toContain('live chain rankings');
    expect(profile.analysis.sections.why_this_outcome.body).toBeNull();
    expect(profile.analysis.sections.strategic_choices.body).toBeNull();
    expect(profile.analysis.sections.token_and_value_capture.body).toBeNull();
    expect(profile.outcome.label).toBeNull();
    expect(profile.metrics).toHaveLength(5);
    expect(profile.claims.every((claim) => claim.review.state === 'pending')).toBe(true);
    expect(validateEntityProfile(profile)).toEqual([]);
  });

  it('gives a live-only stablecoin a cited partial profile and preserves reserve unknowns', () => {
    const profile = buildLiveStablecoinProfile({
      name: 'Example Dollar',
      symbol: 'EXUSD',
      pegType: 'peggedUSD',
      pegMechanism: 'Fiat-backed',
      circulating: 12_345_678,
      price: 0.9997,
      chains: ['Ethereum', 'Base'],
    }, '2026-08-03T17:26:30.823Z');

    expect(profile.identity.id).toBe('stablecoin:exusd');
    expect(profile.analysis.sections.what_it_is.body).toContain('issuer, reserve, redemption');
    expect(profile.analysis.sections.operating_model.body).toBeNull();
    expect(profile.analysis.sections.risks_and_unknowns.body).toBeNull();
    expect(profile.outcome.label).toBeNull();
    expect(profile.metrics.map((metric) => metric.dimension)).toEqual([
      'circulating_supply',
      'price',
    ]);
    expect(profile.extensions.live_observation_only).toBe(true);
    expect(validateEntityProfile(profile)).toEqual([]);
  });

  it('uses the same URL slug rules as the browser', () => {
    expect(canonicalEntitySlug('RWA USDi')).toBe('rwa-usdi');
    expect(canonicalEntitySlug('  DAI  ')).toBe('dai');
  });

  it('wires both visible live datasets into the profile resolver', () => {
    expect(workerSource).toContain('buildLiveBlockchainProfile(liveChain');
    expect(workerSource).toContain('buildLiveStablecoinProfile(liveStablecoin');
    expect(workerSource).toContain('async function loadStablecoinRankings()');
  });

  it('marks an overdue chain snapshot stale and cites only sources used by its claims', () => {
    const observedAt = '2026-08-03T10:00:00.000Z';
    const profile = buildLiveBlockchainProfile({
      key: 'sparse',
      name: 'Sparse Chain',
      tvl: 4_200_000,
    }, observedAt, Date.parse('2026-08-03T16:00:01.000Z'));

    expect(profile.freshness).toMatchObject({
      state: 'stale',
      last_reviewed_at: observedAt,
      next_review_at: '2026-08-03T16:00:00.000Z',
    });
    expect(profile.sources.map((source) => source.id)).toEqual([
      'chaindump-live-board',
      'defillama-chain-tvl',
    ]);
    expect(new Set(profile.claims.flatMap((claim) => claim.source_ids)))
      .toEqual(new Set(profile.sources.map((source) => source.id)));
    expect(validateEntityProfile(profile)).toEqual([]);
  });
});

describe('live stablecoin profile route', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a standardized profile for a top-50 stablecoin missing from the editorial table', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', async (request) => {
      const url = String(request);
      if (url.startsWith('https://stablecoins.llama.fi/stablecoins')) {
        return new Response(JSON.stringify({
          peggedAssets: [{
            name: 'Example Dollar',
            symbol: 'EXUSD',
            pegType: 'peggedUSD',
            pegMechanism: 'fiat-backed',
            circulating: { peggedUSD: 12_345_678 },
            price: 0.9997,
            chains: ['Ethereum', 'Base'],
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`unexpected network request: ${url}`);
    });
    const worker = (await import('../src/worker.js')).default;
    const env = {
      DB: {
        prepare() {
          return {
            bind() { return this; },
            async all() { return { results: [] }; },
            async first() { return null; },
          };
        },
      },
    };
    const response = await worker.fetch(
      new Request('http://localhost/api/profile/stablecoin/exusd'),
      env,
      { waitUntil() {}, passThroughOnException() {} },
    );
    expect(response.status).toBe(200);
    const profile = await response.json();
    expect(profile.identity.id).toBe('stablecoin:exusd');
    expect(profile.quality.publication_state).toBe('review');
    expect(profile.quality.validation_errors).toEqual([]);
  });

  it('keeps pegged-USD circulation without a price and converts non-USD pegs with a real price', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', async (request) => {
      const url = String(request);
      if (url.startsWith('https://stablecoins.llama.fi/stablecoins')) {
        return new Response(JSON.stringify({
          peggedAssets: [
            {
              name: 'No Price Dollar', symbol: 'NPD', pegType: 'peggedUSD',
              circulating: { peggedUSD: 12_000_000 }, price: null, chains: ['Ethereum'],
            },
            {
              name: 'Example Euro', symbol: 'EURE', pegType: 'peggedEUR',
              circulating: { peggedEUR: 10_000_000 }, price: 1.17, chains: ['Ethereum'],
            },
            {
              name: 'Unpriced Euro', symbol: 'UEUR', pegType: 'peggedEUR',
              circulating: { peggedEUR: 20_000_000 }, price: null, chains: ['Ethereum'],
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`unexpected network request: ${url}`);
    });
    const worker = (await import('../src/worker.js')).default;
    const env = {
      DB: {
        prepare() {
          return {
            bind() { return this; },
            async all() { return { results: [] }; },
            async first() { return null; },
          };
        },
      },
    };
    const response = await worker.fetch(
      new Request('http://localhost/api/stablecoins'),
      env,
      { waitUntil() {}, passThroughOnException() {} },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.stablecoins.map(({ symbol, circulating }) => ({ symbol, circulating }))).toEqual([
      { symbol: 'NPD', circulating: 12_000_000 },
      { symbol: 'EURE', circulating: 11_700_000 },
    ]);
  });

  it('preserves a stale snapshot state through the public blockchain profile route', async () => {
    vi.resetModules();
    const observedAt = '2026-08-03T00:00:00.000Z';
    const worker = (await import('../src/worker.js')).default;
    const env = {
      DB: {
        prepare(sql) {
          return {
            bind() { return this; },
            async all() { return { results: [] }; },
            async first() {
              if (sql.includes("snapshot_cache WHERE key='chains'")) {
                return {
                  data: JSON.stringify({
                    updatedAt: observedAt,
                    chains: [{ key: 'sparse', name: 'Sparse Chain', tvl: 4_200_000 }],
                  }),
                  updated_at: observedAt,
                };
              }
              return null;
            },
          };
        },
      },
    };
    const response = await worker.fetch(
      new Request('http://localhost/api/profile/blockchain/sparse'),
      env,
      { waitUntil() {}, passThroughOnException() {} },
    );
    expect(response.status).toBe(200);
    const profile = await response.json();
    expect(profile.freshness.state).toBe('stale');
    expect(profile.sources.map((source) => source.id)).toEqual([
      'chaindump-live-board',
      'defillama-chain-tvl',
    ]);
  });
});

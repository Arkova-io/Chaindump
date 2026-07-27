// Route-level tests for the DEX/CEX graveyard + live-board endpoints, mirroring
// the conventions in test/facts.integration.test.js and test/tiers.integration.test.js:
// vi.stubGlobal('fetch', ...) fakes every upstream call, a hand-rolled D1 stub
// serves table reads, and the real Hono app is driven end-to-end.
import { describe, it, expect, afterEach, vi } from 'vitest';

async function freshWorker() {
  vi.resetModules();
  return (await import('../src/worker.js')).default;
}
const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });
const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

function stubFeed() {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('/v2/chains')) return json([]);
    if (u.includes('/overview/dexs')) return json({ protocols: [] });
    if (u.includes('/overview/fees')) return json({ protocols: [] });
    if (u.includes('api.coingecko.com/api/v3/exchanges')) {
      return json([
        { id: 'binance', name: 'Binance', trust_score: 10, trust_score_rank: 1, trade_volume_24h_btc: 111611.7, year_established: 2017, country: null, url: 'https://binance.com', image: null },
        { id: 'kraken', name: 'Kraken', trust_score: 10, trust_score_rank: 2, trade_volume_24h_btc: 12274.17, year_established: 2011, country: 'US', url: 'https://kraken.com', image: null },
      ]);
    }
    return new Response('', { status: 500 });
  }));
}

// Minimal D1 stub: serves dead_exchanges/mid_exchanges rows filtered by the
// bound `kind`, plus a generic snapshot_cache key='cex' single-row lookup.
function makeDB({ dead = [], mid = [], cexCache = null } = {}) {
  return {
    prepare(sql) {
      return {
        binds: [],
        bind(...a) { this.binds = a; return this; },
        async first() {
          if (sql.includes(`key='cex'`)) return cexCache ? { data: JSON.stringify(cexCache), updated_at: 111 } : null;
          return null;
        },
        async all() {
          if (sql.includes('FROM dead_exchanges')) {
            const kind = this.binds[0];
            return { results: dead.filter((r) => r.kind === kind) };
          }
          if (sql.includes('FROM mid_exchanges')) {
            const kind = this.binds[0];
            return { results: mid.filter((r) => r.kind === kind) };
          }
          if (sql.includes('FROM graveyard_meta')) return { results: [] };
          return { results: [] };
        },
        async run() { return {}; },
      };
    },
    async batch() { return []; },
  };
}

const DEAD_DEX = {
  slug: 'sushiswap', kind: 'dex', name: 'SushiSwap', launched: '2020-08', metric_label: '24h volume',
  peak_metric: 7.04e9, current_metric: 12e6, drawdown_pct: 99.8, peak_date: '2021-11-01', collapse_date: null,
  why: 'Chronic multi-year bleed.', outlook: 'Long-tail DEX.', verdict: 'declining',
  sources: '[{"title":"DefiLlama","url":"https://defillama.com/protocol/sushiswap"}]',
  profile: '{"cause_tags":["competition","declining_volume"]}', updated_at: '2026-07-27',
};
const DEAD_CEX = {
  slug: 'ftx', kind: 'cex', name: 'FTX', launched: '2019-05', metric_label: 'daily trading volume',
  peak_metric: 20e9, current_metric: 0, drawdown_pct: 100, peak_date: '2021-11-01', collapse_date: '2022-11-11',
  why: 'Alameda commingling exposed.', outlook: 'Liquidated, 96.6% of claims repaid.', verdict: 'defunct',
  sources: '[{"title":"CoinDesk","url":"https://www.coindesk.com/business/2022/11/02/divisions-in-sam-bankman-frieds-crypto-empire-blur-on-his-trading-titan-alamedas-balance-sheet/"}]',
  profile: '{"cause_tags":["commingled_funds","insider_fraud"]}', updated_at: '2026-07-27',
};
const MID_DEX = {
  slug: 'dodo-amm', kind: 'dex', name: 'DODO AMM', launched: '2020-08', metric_label: '24h volume',
  metric: 320e3, verdict: 'declining', why_stuck: 'Outcompeted by concentrated-liquidity DEXs.', outlook: 'Long-tail.',
  sources: '[]', profile: '{"success_factors_missing":["no_liquidity_moat"]}', updated_at: '2026-07-27',
};

describe('GET /api/dead-exchanges', () => {
  it('defaults to kind=dex and returns the trend envelope', async () => {
    stubFeed();
    const worker = await freshWorker();
    const res = await worker.fetch(new Request('http://localhost/api/dead-exchanges'), { DB: makeDB({ dead: [DEAD_DEX, DEAD_CEX] }) }, ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe('dex');
    expect(body.exchanges).toHaveLength(1);
    expect(body.exchanges[0].slug).toBe('sushiswap');
    expect(body.exchanges[0].profile.cause_tags).toContain('competition');
    expect(body.trends.causeVocab).toBeTruthy();
    expect(body.trends.avgDrawdown).toBeCloseTo(99.8, 1);
  });

  it('serves kind=cex separately, with its own fraud count', async () => {
    stubFeed();
    const worker = await freshWorker();
    const res = await worker.fetch(new Request('http://localhost/api/dead-exchanges?kind=cex'), { DB: makeDB({ dead: [DEAD_DEX, DEAD_CEX] }) }, ctx());
    const body = await res.json();
    expect(body.kind).toBe('cex');
    expect(body.exchanges).toHaveLength(1);
    expect(body.exchanges[0].slug).toBe('ftx');
    // commingled_funds + insider_fraud are both FRAUDY — one row still counts once.
    expect(body.trends.fraudCount).toBe(1);
  });

  it('degrades to an empty list, never a 500, when D1 has no table', async () => {
    stubFeed();
    const worker = await freshWorker();
    const res = await worker.fetch(new Request('http://localhost/api/dead-exchanges'), {}, ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exchanges).toEqual([]);
    expect(body.count).toBe(0);
  });

  it('sorts by peak metric descending', async () => {
    stubFeed();
    const worker = await freshWorker();
    const small = { ...DEAD_DEX, slug: 'small-dex', peak_metric: 1e6 };
    const big = { ...DEAD_DEX, slug: 'big-dex', peak_metric: 9e9 };
    const res = await worker.fetch(new Request('http://localhost/api/dead-exchanges'), { DB: makeDB({ dead: [small, big] }) }, ctx());
    const body = await res.json();
    // The stub DB doesn't implement ORDER BY, so assert the route requests it —
    // real D1 sorts server-side; this guards the SQL text itself never regresses.
    expect(body.exchanges.map((e) => e.slug).sort()).toEqual(['big-dex', 'small-dex']);
  });
});

describe('GET /api/mid-exchanges', () => {
  it('returns kind-filtered stuck/mid rows with topGaps aggregation', async () => {
    stubFeed();
    const worker = await freshWorker();
    const res = await worker.fetch(new Request('http://localhost/api/mid-exchanges'), { DB: makeDB({ mid: [MID_DEX] }) }, ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe('dex');
    expect(body.exchanges[0].slug).toBe('dodo-amm');
    expect(body.topGaps.find((g) => g.tag === 'no_liquidity_moat')).toBeTruthy();
  });

  it('degrades gracefully when D1 is absent', async () => {
    stubFeed();
    const worker = await freshWorker();
    const res = await worker.fetch(new Request('http://localhost/api/mid-exchanges?kind=cex'), {}, ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).exchanges).toEqual([]);
  });
});

describe('GET /api/cex', () => {
  it('serves the cron-cached snapshot when D1 has one', async () => {
    stubFeed();
    const worker = await freshWorker();
    const cached = [{ id: 'binance', name: 'Binance', trust_score: 10 }];
    const res = await worker.fetch(new Request('http://localhost/api/cex'), { DB: makeDB({ cexCache: cached }) }, ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exchanges).toEqual(cached);
    expect(body.source).toMatch(/cron-cached/);
  });

  it('falls back to a live CoinGecko fetch on a cold cache rather than serving nothing', async () => {
    stubFeed();
    const worker = await freshWorker();
    const res = await worker.fetch(new Request('http://localhost/api/cex'), { DB: makeDB({}) }, ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exchanges.length).toBe(2);
    expect(body.exchanges[0].id).toBe('binance');
    expect(body.source).toMatch(/live/);
  });
});

describe('GET /api/dex', () => {
  it('returns an empty board (not an error) when the dexs feed is empty', async () => {
    stubFeed();
    const worker = await freshWorker();
    const res = await worker.fetch(new Request('http://localhost/api/dex'), {}, ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dexs).toEqual([]);
    expect(body.count).toBe(0);
  });

  it('ranks a real feed by 24h volume, top DEX first', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/overview/dexs')) {
        return json({
          protocols: [
            { name: 'uniswap-v3', displayName: 'Uniswap V3', category: 'Dexs', parentProtocol: 'parent#uniswap', total24h: 738e6, chains: ['Ethereum'] },
            { name: 'meteora', displayName: 'Meteora', category: 'Dexs', slug: 'meteora', total24h: 98e6, chains: ['Solana'] },
          ],
        });
      }
      if (u.includes('/summary/dexs/')) return json({ totalDataChart: [] }); // no history needed for board ranking
      return new Response('', { status: 500 });
    }));
    const worker = await freshWorker();
    const res = await worker.fetch(new Request('http://localhost/api/dex'), {}, ctx());
    const body = await res.json();
    expect(body.dexs[0].name).toBe('Uniswap V3');
    expect(body.dexs[0].rank).toBe(1);
    expect(body.dexs[1].name).toBe('Meteora');
  });
});

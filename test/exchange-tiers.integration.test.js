// Route-level test for classifyDexTiers()'s failure handling — the DEX analog of
// tiers.integration.test.js. classifyChains() shipped a real bug here (commits
// 1f04f66/3d6ec31): a failed history fetch set `peak = cur` and reported "0%
// drawdown" for a chain previously measured as collapsed. A naive DEX version
// would reproduce the identical bug on the first live network hiccup, so this
// test is written BEFORE classifyDexTiers exists and must guard the same failure
// mode: a transient summary/dexs/{slug} fetch failure must not silently report a
// DEX as freshly healthy.
import { describe, it, expect, afterEach, vi } from 'vitest';

async function freshTiersModule() {
  vi.resetModules();
  return import('../src/worker.js');
}

const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

// A small DEX universe: DoomedDex (the protocol under test) plus enough fillers
// to push it off the live top-25 board, so it counts as "off board" once collapsed.
const DEXS_FEED = {
  protocols: [
    { name: 'DoomedDex', displayName: 'DoomedDex', category: 'Dexs', slug: 'doomeddex', total24h: 2e5, chains: ['Ethereum'] },
    ...Array.from({ length: 30 }, (_, i) => ({
      name: `Filler${i}`, displayName: `Filler${i}`, category: 'Dexs', slug: `filler${i}`,
      total24h: 5e7 - i * 1e5, chains: ['Ethereum'],
    })),
  ],
};

const DAY = 86400;
// A 49-day tuple series (>= DEAD_MIN_SPAN_DAYS=45): peaks at 5e8, ends near
// today's live volume (2e5) — a genuine ~99.96% collapse.
function doomedCollapseSeries() {
  const start = 1_700_000_000;
  return Array.from({ length: 50 }, (_, i) => [start + i * DAY, i === 0 ? 5e8 : 2e5]);
}

function stubFeed({ doomedHistoryFails = false } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('/summary/dexs/doomeddex')) {
      return doomedHistoryFails ? new Response('', { status: 500 }) : json({ totalDataChart: doomedCollapseSeries() });
    }
    if (u.includes('/summary/dexs/')) return json({ totalDataChart: [] }); // fillers: no history, not under test
    if (u.includes('/overview/dexs')) return json(DEXS_FEED);
    return new Response('', { status: 500 });
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('classifyDexTiers — fetch-failure handling', () => {
  it('a transient summary/dexs history failure does not erase a DEX\'s known collapse', async () => {
    stubFeed({ doomedHistoryFails: false });
    const { classifyDexTiers, priorMetricsByDex } = await freshTiersModule();

    const first = await classifyDexTiers({});
    const before = [...first.zombie, ...first.dead, ...first.thriving].find((m) => m.chain === 'doomeddex');
    expect(before).toBeTruthy();
    expect(before.drawdown_pct).toBeGreaterThanOrEqual(90); // genuinely collapsed
    expect(first.thriving.some((m) => m.chain === 'doomeddex')).toBe(false); // NOT mislabeled thriving

    // Next cycle: the deep-history fetch for DoomedDex fails (network hiccup).
    stubFeed({ doomedHistoryFails: true });
    const prior = priorMetricsByDex(first);
    const second = await classifyDexTiers(prior);

    const after = [...second.zombie, ...second.dead].find((m) => m.chain === 'doomeddex');
    expect(after).toBeTruthy(); // still classified as collapsed, not silently dropped
    expect(after.drawdown_pct).toBeGreaterThanOrEqual(90); // NOT reset to 0
    expect(second.thriving.some((m) => m.chain === 'doomeddex')).toBe(false); // did NOT flip to thriving
  });

  it('a brand-new DEX with no history yet (never a failure) is unaffected', async () => {
    stubFeed({ doomedHistoryFails: false });
    const { classifyDexTiers } = await freshTiersModule();
    const first = await classifyDexTiers({});
    const doomed = [...first.zombie, ...first.dead, ...first.thriving].find((m) => m.chain === 'doomeddex');
    expect(doomed).toBeTruthy();
    expect(doomed.drawdown_pct).toBeGreaterThanOrEqual(90);
  });
});

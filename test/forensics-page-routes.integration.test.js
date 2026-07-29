import { afterEach, describe, expect, it, vi } from 'vitest';

async function freshWorker() {
  vi.resetModules();
  return (await import('../src/worker.js')).default;
}

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });
const markdownRequest = (path) => new Request(`http://localhost${path}`, {
  headers: { accept: 'text/markdown' },
});

function makeDB() {
  return {
    prepare(sql) {
      return {
        binds: [],
        bind(...binds) {
          this.binds = binds;
          return this;
        },
        async first() {
          if (sql.includes('FROM nft_catalog')) return null;
          return null;
        },
        async all() {
          if (sql.includes('FROM successful_exchanges')) {
            return {
              results: [{
                slug: 'uniswap',
                name: 'Uniswap',
                summary: 'Uniswap built durable distribution and liquidity across multiple chains.',
                sources: JSON.stringify([{ title: 'Uniswap docs', url: 'https://docs.uniswap.org/' }]),
                updated_at: '2026-07-29',
              }],
            };
          }
          if (sql.includes('FROM casino_cases WHERE')) {
            return {
              results: [{
                case_id: 'stake-dot-com',
                brand_name: 'Stake.com',
                product_scope_note: 'Custodial crypto casino lifecycle research.',
                status: 'active',
                outcome_label: 'successful',
                last_reviewed: '2026-07-29',
              }],
            };
          }
          if (sql.includes('FROM casino_cases c WHERE')) {
            return {
              results: [{
                case_id: 'stake-dot-com',
                brand_name: 'Stake.com',
                product_scope_note: 'Custodial crypto casino lifecycle research.',
                status: 'active',
                outcome_label: 'successful',
                last_reviewed: '2026-07-29',
                sources: JSON.stringify([{ title: 'Stake source', url: 'https://stake.com/policies/terms' }]),
              }],
            };
          }
          if (sql.includes('FROM nft_collections')) {
            return {
              results: [{
                slug: 'azuki',
                name: 'Azuki',
                chain: 'Ethereum',
                status: 'fading',
                profile: JSON.stringify({ analysis: 'Azuki lifecycle analysis with cited launch, community, and operating evidence.' }),
                sources: JSON.stringify([{ title: 'Azuki source', url: 'https://www.coindesk.com/tag/azuki/' }]),
                updated_at: '2026-07-29',
              }],
            };
          }
          return { results: [] };
        },
      };
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('forensic page and entity route metadata', () => {
  it('serves route-aware markdown for every forensic index and direct dossier type', async () => {
    const worker = await freshWorker();
    const env = { DB: makeDB() };

    const index = await worker.fetch(markdownRequest('/exchange-analysis'), env, ctx());
    expect(index.status).toBe(200);
    expect(index.headers.get('content-type')).toContain('text/markdown');
    expect(await index.text()).toContain('# DEX/CEX Analysis — Chaindump');

    const exchange = await worker.fetch(markdownRequest('/exchange/dex/successful/uniswap'), env, ctx());
    const exchangeBody = await exchange.text();
    expect(exchange.status).toBe(200);
    expect(exchangeBody).toContain('# Uniswap — DEX forensic dossier | Chaindump');
    expect(exchangeBody).toContain('https://docs.uniswap.org/');
    expect(exchangeBody).toContain('/api/exchange-analysis?kind=dex&lifecycle=successful&slug=uniswap');

    const casino = await worker.fetch(markdownRequest('/casino/stake-dot-com'), env, ctx());
    const casinoBody = await casino.text();
    expect(casino.status).toBe(200);
    expect(casinoBody).toContain('# Stake.com — Web3 casino forensic dossier | Chaindump');
    expect(casinoBody).toContain('https://stake.com/policies/terms');
    expect(casinoBody).toContain('/api/casino/stake-dot-com');

    const nft = await worker.fetch(markdownRequest('/collection/azuki'), env, ctx());
    const nftBody = await nft.text();
    expect(nft.status).toBe(200);
    expect(nftBody).toContain('# Azuki — NFT lifecycle dossier | Chaindump');
    expect(nftBody).toContain('https://www.coindesk.com/tag/azuki/');
    expect(nftBody).toContain('Structured JSON: https://chaindump.xyz/api/nft?slug=azuki');
  });
});

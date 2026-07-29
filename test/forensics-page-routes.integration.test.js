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
                summary: 'UNSUPPORTED EXCHANGE SEO CONCLUSION',
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
                product_scope_note: 'UNSUPPORTED CASINO SEO CONCLUSION',
                status: 'insolvent',
                outcome_label: 'failed',
                last_reviewed: '2026-07-29',
              }],
            };
          }
          if (sql.includes('FROM casino_cases c WHERE')) {
            return {
              results: [{
                case_id: 'stake-dot-com',
                brand_name: 'Stake.com',
                product_scope_note: 'UNSUPPORTED CASINO SEO CONCLUSION',
                status: 'insolvent',
                outcome_label: 'failed',
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
                profile: JSON.stringify({ analysis: 'UNSUPPORTED NFT SEO CONCLUSION' }),
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
    expect(exchangeBody).toContain('indexed lifecycle dossier with per-claim support status');
    expect(exchangeBody).not.toContain('UNSUPPORTED EXCHANGE SEO CONCLUSION');

    const casino = await worker.fetch(markdownRequest('/casino/stake-dot-com'), env, ctx());
    const casinoBody = await casino.text();
    expect(casino.status).toBe(200);
    expect(casinoBody).toContain('# Stake.com — Web3 casino forensic dossier | Chaindump');
    expect(casinoBody).toContain('https://stake.com/policies/terms');
    expect(casinoBody).toContain('/api/casino/stake-dot-com');
    expect(casinoBody).toContain('indexed Web3 casino lifecycle dossier with per-claim support status');
    expect(casinoBody).not.toContain('UNSUPPORTED CASINO SEO CONCLUSION');
    expect(casinoBody).not.toContain('failed');
    expect(casinoBody).not.toContain('insolvent');

    const nft = await worker.fetch(markdownRequest('/collection/azuki'), env, ctx());
    const nftBody = await nft.text();
    expect(nft.status).toBe(200);
    expect(nftBody).toContain('# Azuki — NFT lifecycle dossier | Chaindump');
    expect(nftBody).toContain('https://www.coindesk.com/tag/azuki/');
    expect(nftBody).toContain('Structured JSON: https://chaindump.xyz/api/nft?slug=azuki');
    expect(nftBody).toContain('indexed NFT/Ordinals lifecycle dossier with per-claim support status');
    expect(nftBody).not.toContain('UNSUPPORTED NFT SEO CONCLUSION');
    expect(nftBody).not.toContain('fading');
  });
});

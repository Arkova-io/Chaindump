import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const sidebar = html.match(/<aside class="tabs" id="sidebar">([\s\S]*?)<\/aside>/)?.[1] || '';

describe('Forensics analysis navigation', () => {
  it('exposes the four requested analysis destinations with exact labels', () => {
    const expected = [
      ['blockchain-analysis', 'Blockchain Analysis'],
      ['exchange-analysis', 'DEX/CEX Analysis'],
      ['casino-analysis', 'Web3 Casino Analysis'],
      ['nft-analysis', 'NFT and Ordinals Analysis'],
    ];

    for (const [view, label] of expected) {
      expect(sidebar).toContain(`data-view="${view}">${label}</button>`);
    }
  });

  it('does not split the primary Forensics navigation into legacy lifecycle pages', () => {
    expect(sidebar).not.toContain('data-view="grave"');
    expect(sidebar).not.toContain('data-view="mid"');
    expect(sidebar).not.toContain('data-view="nft"');
  });

  it('registers dedicated deep-link routes and view containers', () => {
    expect(html).toContain('id="blockchainanalysisview"');
    expect(html).toContain('id="exchangeanalysisview"');
    expect(html).toContain('id="casinoanalysisview"');
    expect(html).toMatch(/KNOWN_VIEWS\s*=\s*\[[^\]]*'blockchain-analysis'/);
    expect(html).toMatch(/KNOWN_VIEWS\s*=\s*\[[^\]]*'exchange-analysis'/);
    expect(html).toMatch(/KNOWN_VIEWS\s*=\s*\[[^\]]*'casino-analysis'/);
    expect(html).toMatch(/KNOWN_VIEWS\s*=\s*\[[^\]]*'nft-analysis'/);
  });
});

describe('Blockchain Analysis research coverage surface', () => {
  it('loads a normalized coverage contract and exposes completeness plus citation sorting', () => {
    expect(html).toContain("fetch('/api/chain-research-coverage')");
    expect(html).toContain('CHAIN_DOSSIER_DIMENSIONS = 8');
    expect(html).toContain('Full dossier · ${CHAIN_DOSSIER_DIMENSIONS}/${CHAIN_DOSSIER_DIMENSIONS} dimensions');
    expect(html).toContain("value=\"completeness\"");
    expect(html).toContain('Dossier completeness');
    expect(html).toContain('Partial dossier');
  });
});

describe('DEX/CEX Analysis data surface', () => {
  it('loads successful, mid, and dead cohorts for both venue types', () => {
    for (const kind of ['dex', 'cex']) {
      expect(html).toContain(`/api/successful-exchanges?kind=${kind}`);
      expect(html).toContain(`/api/mid-exchanges?kind=${kind}`);
      expect(html).toContain(`/api/dead-exchanges?kind=${kind}`);
    }
  });

  it('provides search, venue, lifecycle, sort, and visible source controls', () => {
    expect(html).toContain('id="exchangeAnalysisSearch"');
    expect(html).toContain("filterButton('data-exchange-kind','dex'");
    expect(html).toContain("filterButton('data-exchange-lifecycle','successful'");
    expect(html).toContain('id="exchangeAnalysisSort"');
    expect(html).toContain('Cited sources');
  });

  it('reads nested token metadata and case-normalizes metric units', () => {
    expect(html).toContain('p.token_symbol || token.symbol || token.ticker');
    expect(html).not.toContain('analysisText(p.token_symbol || p.token)');
    expect(html).toContain("String(row.metricUnit || '').toLowerCase()");
  });
});

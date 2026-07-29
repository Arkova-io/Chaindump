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

  it('surfaces and sorts same-format dossier coverage on the blockchain index', () => {
    expect(html).toContain("row.dossier || {}");
    expect(html).toContain('dataCompletenessPct');
    expect(html).toContain('citationCount');
    expect(html).toContain('value="dossier"');
    expect(html).toContain('Dossier coverage');
    expect(html).toContain('Open chain dossier →');
  });
});

describe('DEX/CEX Analysis data surface', () => {
  it('loads normalized lifecycle cohorts for both venue types', () => {
    expect(html).toContain('/api/exchange-analysis?kind=${kind}');
    expect(html).toContain("['dex', 'cex'].map(fetchExchangeAnalysisKind)");
  });

  it('provides search, venue, lifecycle, cohort, quality, sort, and visible source controls', () => {
    expect(html).toContain('id="exchangeAnalysisSearch"');
    expect(html).toContain("filterButton('data-exchange-kind','dex'");
    expect(html).toContain("filterButton('data-exchange-lifecycle','successful'");
    expect(html).toContain('id="exchangeAnalysisCohort"');
    expect(html).toContain('id="exchangeAnalysisQuality"');
    expect(html).toContain('id="exchangeAnalysisSort"');
    expect(html).toContain('Cited sources');
  });

  it('renders normalized token, comparison, provenance, and quality metadata', () => {
    expect(html).toContain('token.launch_timing');
    expect(html).toContain('row.comparisonKey');
    expect(html).toContain('row.metricAsOf');
    expect(html).toContain('row.qualityIssues');
    expect(html).toContain('operating_model_source_indexes');
    expect(html).toContain('metric_source_indexes');
    expect(html).toContain('custody_model_source_indexes');
    expect(html).toContain('product_cohort_source_indexes');
    expect(html).toContain('observation time unknown');
    expect(html).toContain('lifecycle evidence');
    expect(html).toContain('next review');
    expect(html).toContain("String(row.metricUnit || '').toLowerCase()");
  });
});

describe('Stuck/Mid UI parity', () => {
  it('keeps the chain Stuck/Mid page visually live, not just a static dossier list', () => {
    expect(html).toContain('function midLiveWatch(data)');
    expect(html).toContain('Live mid watch — profiled chains on the live board');
    expect(html).toContain('data-mid-watch=');
    expect(html).toContain('sparkline(spark, 58, 18, 2)');
  });

  it('renders DEX/CEX Stuck/Mid with the same live-board and two-column analysis pattern as Dead & Dying', () => {
    expect(html).toContain('function renderExchangeMid(kind, data, board)');
    expect(html).toContain("const boardHtml = renderExchangeBoard(kind, board || (kind === 'dex' ? state.dexBoard : state.cexBoard));");
    expect(html).toContain("kind === 'dex' ? ensureDexBoard() : ensureCexBoard()");
    expect(html).toContain('Why exchanges succeed vs fail');
    expect(html).toContain('${head}${stats}${boardHtml}${panel}');
  });
});

describe('Web3 Casino Analysis data surface', () => {
  it('loads only publication-gated dossiers with coverage and lazy cited detail', () => {
    expect(html).toContain('/api/casinos?sort=${encodeURIComponent(state.casinoAnalysisSort)}');
    expect(html).toContain("fetch('/api/casino-coverage')");
    expect(html).toContain('/api/casino/${encodeURIComponent(caseId)}');
    expect(html).toContain('casinoAnalysisLoaded');
  });

  it('follows the Blockchain Analysis index contract with search, filters, sources, and direct dossier links', () => {
    expect(html).toContain('id="casinoAnalysisSearch"');
    expect(html).toContain('id="casinoAnalysisStatus"');
    expect(html).toContain('Cited sources: ${esc(item.source_count)}');
    expect(html).toContain('Open dossier →');
    expect(html).toContain('Open coverage ledger →');
    expect(html).toContain('publication-gated dossier${filtered.length===1');
  });

  it('keeps unverified candidates visibly withheld rather than rendering them as analyses', () => {
    expect(html).toContain('candidates withheld');
    expect(html).toContain('intentionally not presented as analyses');
    expect(html).toContain('No cross-case “largest casino” ranking is computed.');
    expect(html).toContain('No licence observation is published. Do not infer global legality from this dossier.');
  });
});

describe('NFT and Ordinals Analysis data surface', () => {
  it('uses the same sortable research-index pattern as Blockchain Analysis', () => {
    expect(html).toContain('This index deliberately distinguishes lifecycle research from live catalog coverage.');
    expect(html).toContain('id="nftCaseStatus"');
    expect(html).toContain('id="nftCaseChain"');
    expect(html).toContain('id="nftCaseSort"');
    expect(html).toContain('Citation count');
    expect(html).toContain('Open dossier →');
    expect(html).toContain('Browse live catalog ↓');
  });

  it('shows collapsed citation and coverage metadata before expansion', () => {
    expect(html).toContain('field-cited');
    expect(html).toContain('legacy/collection-cited');
    expect(html).toContain("srcHtml(sourceArray(c.sources).slice(0, 3), 'Cited sources: ')");
    expect(html).toContain('lifecycle case stud');
  });
});

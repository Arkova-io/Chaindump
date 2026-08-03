import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

function block(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`missing block: ${start} -> ${end}`);
  return html.slice(from, to);
}

const categorySurface = [
  block('function renderBlockchainAnalysis()', 'async function loadBlockchainAnalysis()'),
  block('function renderExchangeAnalysis()', 'async function fetchExchangeAnalysisKind('),
  block('function renderCasinoAnalysis()', 'async function loadCasinoAnalysis()'),
  block('function renderNft(data)', 'async function loadNft()'),
  block('function renderInfra(data)', 'async function loadInfra()'),
  block('function renderMarkets(data)', 'async function loadMarkets()'),
  block('function renderStables(data)', 'async function loadStables()'),
  block('function renderRwa(data)', 'async function loadRwa()'),
].join('\n');

describe('customer-facing analysis copy', () => {
  it('keeps internal research operations off category overview pages', () => {
    const forbidden = [
      'research desk',
      'sources auto-checked',
      '90d policy',
      'why-analysis',
      'support pending',
      'field-sourced report',
      'indexed classification',
      'evidence policy',
      'desk check pending',
      'editorial review',
      'source registry',
      'retrieval note',
      'access checked',
      'normalized research report',
      'read full report',
      'read full lifecycle',
      'full profile',
      'local slm',
      'proposal research',
      'human promotion',
    ];
    const copy = categorySurface.toLowerCase();
    for (const phrase of forbidden) expect(copy, phrase).not.toContain(phrase);
  });

  it('retains reader navigation, sorting, metrics, and dedicated profiles', () => {
    expect(categorySurface).toContain("pageHead('Blockchain Analysis'");
    expect(categorySurface).toContain("pageHead('DEX/CEX Analysis'");
    expect(categorySurface).toContain("pageHead('Web3 Casino Analysis'");
    expect(categorySurface).toContain("pageHead('Infrastructure'");
    expect(categorySurface).toContain('class="gstats"');
    expect(categorySurface).toContain('analysis-select');
    expect(categorySurface).toContain('profileHref(');
    expect(categorySurface).toContain('Open report →');
  });

  it('keeps generated market essays off overview pages', () => {
    expect(categorySurface).not.toContain('State of the crypto-equity complex');
    expect(categorySurface).not.toContain('State of stablecoins');
    expect(categorySurface).not.toContain('State of RWAs & DePIN');
    expect(categorySurface).not.toContain('Lifecycle analysis — what the');
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');

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

  it('keeps a compact chart visible while making every report list one tap away', () => {
    const renderers = [
      ['blockchain-analysis', block('function renderBlockchainAnalysis()', 'async function loadBlockchainAnalysis()')],
      ['exchange-analysis', block('function renderExchangeAnalysis()', 'async function fetchExchangeAnalysisKind(')],
      ['casino-analysis', block('function renderCasinoAnalysis()', 'async function loadCasinoAnalysis()')],
      ['nft-analysis', block('function renderNft(data)', 'function catCardHtml(')],
    ];

    for (const [anchor, source] of renderers) {
      const template = source.slice(source.lastIndexOf('el.innerHTML ='));
      expect(template.indexOf('<div class="gwrap">')).toBeGreaterThan(-1);
      expect(template.indexOf('${cohortPanel}')).toBeLessThan(template.indexOf('<div class="gwrap">'));
      expect(template).toContain(`href="/${anchor}#${anchor}-reports"`);
      expect(template).toContain(`id="${anchor}-reports"`);
    }

    const exchange = renderers[1][1].slice(renderers[1][1].lastIndexOf('el.innerHTML ='));
    expect(exchange.indexOf('exchangeTrendSummary(')).toBeGreaterThan(exchange.indexOf('<div class="gwrap">'));
    expect(exchange.indexOf('exchangeAssociationPanel(')).toBeGreaterThan(exchange.indexOf('<div class="gwrap">'));
    expect(exchange).toContain('id="exchange-analysis-patterns"');
  });

  it('keeps generated market essays off overview pages', () => {
    expect(categorySurface).not.toContain('State of the crypto-equity complex');
    expect(categorySurface).not.toContain('State of stablecoins');
    expect(categorySurface).not.toContain('State of RWAs & DePIN');
    expect(categorySurface).not.toContain('Lifecycle analysis — what the');
  });

  it('translates research-desk vocabulary without changing the stored record', () => {
    const analysisTextSource = block('function analysisText(value)', '// Research records retain');
    const customerCopySource = block('function customerCopy(value)', '// A single, shared handoff');
    const translate = new Function(`${analysisTextSource}\n${customerCopySource}\nreturn customerCopy;`)();

    expect(translate('This dossier has a causal map and evidence contract.'))
      .toBe('This report has a reasoned explanation and evidence record.');
    expect(translate('Two dossiers use the source registry; human promotion is pending.'))
      .toBe('Two reports use the source list; human review is pending.');
    expect(translate('GPU model training demand')).toBe('GPU model training demand');
    expect(translate("Injective is pivoting (verdict quietly_building/pivoting). WHY: demand stayed thin. WHAT'S UNIQUE: a native order book."))
      .toBe('Injective is pivoting (current read: quietly building/pivoting). The reason: demand stayed thin. What makes it different: a native order book.');
  });

  it('renders exchange metric units as reader language', () => {
    const exchangeMetricSource = block('function exchangeMetric(row)', 'function lifecycleLabel(value)');
    const exchangeLabelSource = block('function exchangeLabel(value)', 'function exchangeFindingLabel(lifecycle)');
    const exchangeMetric = new Function(`
      const fmtUsd = (value) => '$' + value;
      const fmtTok = (value) => String(value);
      const fmtNum = (value) => String(value);
      const esc = (value) => String(value);
      ${exchangeLabelSource}
      ${exchangeMetricSource}
      return exchangeMetric;
    `)();

    expect(exchangeMetric({ metric: 0.42, metricUnit: 'usd_per_token' })).toBe('$0.42 per token');
    expect(exchangeMetric({ metric: 1250, metricUnit: 'btc_equivalent' })).toBe('1250 BTC equivalent');
    expect(exchangeMetric({ metric: 7, metricUnit: 'daily_active_users' })).toBe('7 daily active users');
  });

  it('keeps public page metadata and share copy in reader language', () => {
    expect(worker).not.toContain('forensic dossier | Chaindump');
    expect(worker).not.toContain('indexed lifecycle dossier with per-claim support status');
    expect(worker).not.toContain('- Exchange dossier:');
    expect(worker).not.toContain('forensic taxonomy of dead chains');
    expect(worker).toContain('lifecycle report with source links, evidence gaps and review dates');
  });

  it('uses a compact publication-support note', () => {
    const source = block('function publicationDepthBanner(depth)', 'function publicationDepthEvidenceHtml');
    const publicationDepthBanner = new Function(`
      const esc = (value) => String(value);
      ${source}
      return publicationDepthBanner;
    `)();
    const output = publicationDepthBanner({
      high_risk_claim_count: 5,
      passing_high_risk_claim_count: 3,
      unresolved_high_risk_claim_count: 2,
    });

    expect(output).toContain('3 of 5 key claims have independent support.');
    expect(output).toContain('2 remain open.');
    expect(output).toContain('Unsupported conclusions are omitted.');
    expect(output).not.toContain('Corpus inclusion');
    expect(output).not.toContain('withheld below');
  });
});

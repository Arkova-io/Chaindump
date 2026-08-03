import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { normalizeExchangeCase } from '../src/lib/exchange-analysis.js';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

function sourceBlock(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`missing block: ${start} -> ${end}`);
  return html.slice(from, to);
}

function uiHelpers() {
  const taxonomy = sourceBlock(
    'const PUBLIC_TAXONOMY_ACRONYMS',
    '// ---------------------------------------------------------------------------\n// Canonical page layout.',
  );
  const exchangeMetric = sourceBlock('function exchangeMetric(row)', 'function lifecycleLabel(value)');
  const nft = sourceBlock('function nftLifecycleMetric(profile)', 'function nftSupplyText(supply)');
  const liveLogo = sourceBlock('function liveRankingLogoHtml(url, name)', 'function renderRwa(data)');
  const context = {
    Intl,
    fmtUsd: (value) => `$${Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(value)}`,
    fmtNum: (value) => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value),
    normalizedText: (value) => String(value ?? '').trim(),
    esc: (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'),
    safeUrl: (value) => /^https?:\/\//.test(String(value || '')) ? String(value) : '#',
  };
  return vm.runInNewContext(`(() => {
    ${taxonomy}
    ${exchangeMetric}
    ${nft}
    ${liveLogo}
    return { publicTaxonomyLabel, exchangeMetric, nftLifecycleMetric, nftLifecycleMetricLabel, nftLaunchTiming, liveRankingLogoHtml };
  })()`, context);
}

function cexMetricRow(overrides = {}) {
  return {
    slug: 'example-cex',
    kind: 'cex',
    lifecycle: 'mid',
    venue_type: 'exchange',
    name: 'Example CEX',
    metric_label: 'daily trading volume',
    metric_type: 'trading_volume',
    metric_unit: 'USD',
    metric: 599_770_000,
    profile: '{}',
    sources: '[]',
    feature_product_cohort: 'centralized_spot_exchange',
    feature_chains: '[]',
    feature_metric_type: 'market_share',
    feature_metric_unit: 'percent',
    feature_metric_window: 'point_in_time',
    feature_comparability_key: 'cex|centralized_spot_exchange|market_share|percent|snapshot',
    feature_quality_label: 'partial',
    feature_quality_issues: '[]',
    ...overrides,
  };
}

describe('customer card rendering guards', () => {
  it('uses reader-facing vocabulary for shared taxonomy labels', () => {
    const { publicTaxonomyLabel } = uiHelpers();
    expect(publicTaxonomyLabel('centralized_multi_product_exchange')).toBe('Centralized multi-product exchange');
    expect(publicTaxonomyLabel('single_chain_vote_escrow_spot_amm')).toBe('Single-chain vote-escrow spot AMM');
    expect(publicTaxonomyLabel('depin-compute')).toBe('DePIN compute');
    expect(publicTaxonomyLabel('Pfp-anime')).toBe('PFP anime');
    expect(publicTaxonomyLabel('BNB_Smart_Chain')).toBe('BNB Smart Chain');
    expect(publicTaxonomyLabel('dYdX')).toBe('dYdX');
    expect(publicTaxonomyLabel('peggedUSD')).toBe('USD peg');
    expect(publicTaxonomyLabel('unclassified')).toBe('Not classified yet');
  });

  it.each([
    ['dollar trading volume', cexMetricRow()],
    ['dollar reserves', cexMetricRow({
      metric_label: 'reserve assets',
      metric_type: 'reserve_assets',
      metric: 133_600_000_000,
      feature_metric_type: 'reserve_coverage',
    })],
  ])('never formats %s as a percentage when the selected value is USD', (_label, raw) => {
    const normalized = normalizeExchangeCase(raw);
    const { exchangeMetric } = uiHelpers();
    const rendered = exchangeMetric({
      metric: normalized.metric,
      metricUnit: normalized.analysis.metric.unit,
    });

    expect(normalized.analysis.metric.unit).toBe('usd');
    expect(rendered).toMatch(/^\$/);
    expect(rendered).not.toContain('%');
  });

  it('keeps missing NFT metrics and prose-shaped launch fields off overview cards', () => {
    const { nftLifecycleMetric, nftLifecycleMetricLabel, nftLaunchTiming } = uiHelpers();
    expect(nftLifecycleMetric({})).toBe('');
    expect(nftLifecycleMetricLabel({})).toBe('');
    expect(nftLaunchTiming('2022-01')).toBe('2022-01');
    expect(nftLaunchTiming('June 2017')).toBe('June 2017');
    expect(nftLaunchTiming('Bitcoin Puppets launched in January 2024 as 10,001 Ordinals.')).toBe('');
    expect(nftLaunchTiming('2020 — Art Blocks dates its founding to 2020.')).toBe('');

    const nftRenderer = sourceBlock('function renderNft(data)', '// ---- Live NFT catalog:');
    expect(nftRenderer).toContain("metricValue ? `<div class=\"gdd\"");
    expect(nftRenderer).toContain("launchTiming?` · launched");
    expect(nftRenderer).not.toContain("'live collections loading'");
  });

  it('shows a letter fallback when a live ranking image fails', () => {
    const { liveRankingLogoHtml } = uiHelpers();
    const withImage = liveRankingLogoHtml('https://icons.example/cash.png', 'Cash Plus');
    expect(withImage).toContain('onerror="this.hidden=true;this.nextElementSibling.hidden=false"');
    expect(withImage).toContain('rllogo-fallback');
    expect(withImage).toContain('>C</span>');
    expect(liveRankingLogoHtml('', 'Untangled')).toContain('>U</span>');
    expect(liveRankingLogoHtml('javascript:alert(1)', 'Render')).toContain('>R</span>');
    expect(liveRankingLogoHtml('javascript:alert(1)', 'Render')).not.toContain('<img');

    const rwaRenderer = sourceBlock('function renderRwa(data)', 'async function loadRwa()');
    expect(rwaRenderer).toContain('liveRankingLogoHtml(r.logo, r.name)');
    expect(rwaRenderer).toContain('liveRankingLogoHtml(t.image, t.name)');
  });
});

import { describe, expect, it } from 'vitest';
import { normalizeExchangeCase, summarizeExchangeCases } from '../src/lib/exchange-analysis.js';

function row(overrides = {}) {
  return {
    slug: 'uniswap',
    kind: 'dex',
    lifecycle: 'successful',
    venue_type: 'exchange',
    name: 'Uniswap',
    metric_label: '24h spot volume',
    metric_type: 'spot_volume_24h',
    metric_unit: 'USD',
    metric: 100,
    profile: '{}',
    sources: '[{"title":"Source","url":"https://example.com"}]',
    feature_operating_model: 'Spot AMM',
    feature_product_cohort: 'spot_amm',
    feature_custody_model: 'non_custodial',
    feature_primary_chain: 'Ethereum',
    feature_chains: '["Ethereum"]',
    feature_token_status: 'launched',
    feature_token_symbol: 'UNI',
    feature_token_launch_timing: 'post_product',
    feature_token_strategy: 'governance',
    feature_token_source_url: 'https://blog.uniswap.org/uni',
    feature_metric_type: 'spot_volume_24h',
    feature_metric_unit: 'usd',
    feature_metric_window: 'rolling_24h',
    feature_metric_as_of: '2026-07-29',
    feature_metric_observed_at: null,
    feature_comparability_key: 'dex|spot_amm|spot_volume_24h|usd|rolling_24h',
    feature_evidence: '{"source_count":1}',
    feature_quality_label: 'partial',
    feature_quality_issues: '["single_source_case"]',
    feature_lifecycle_evidence_date: null,
    feature_last_verified_at: '2026-07-29',
    feature_next_review_at: '2026-08-05',
    feature_freshness_status: 'unknown',
    ...overrides,
  };
}

describe('normalizeExchangeCase', () => {
  it('publishes explicit operating, token, metric, provenance, and quality fields', () => {
    const normalized = normalizeExchangeCase(row());
    expect(normalized.analysis).toMatchObject({
      operating_model: 'Spot AMM',
      product_cohort: 'spot_amm',
      custody_model: 'non_custodial',
      token: {
        status: 'launched', symbol: 'UNI', launch_timing: 'post_product',
        evidence_level: 'documented',
      },
      metric: {
        type: 'spot_volume_24h',
        unit: 'usd',
        window: 'rolling_24h',
        as_of: '2026-07-29',
        observed_at: null,
      },
      evidence: { source_count: 1 },
      data_quality: { label: 'partial', issues: ['single_source_case'] },
      freshness: {
        lifecycle_evidence_date: null,
        last_verified_at: '2026-07-29',
        next_review_at: '2026-08-05',
        status: 'unknown',
      },
    });
    expect(normalized.sources).toHaveLength(1);
  });

  it('labels a missing feature overlay as limited instead of inventing fields', () => {
    const normalized = normalizeExchangeCase(row({
      feature_operating_model: null,
      feature_product_cohort: null,
      feature_quality_label: null,
      feature_quality_issues: null,
    }));
    expect(normalized.analysis.operating_model).toBeNull();
    expect(normalized.analysis.product_cohort).toBe('unclassified');
    expect(normalized.analysis.data_quality).toEqual({
      label: 'limited',
      issues: ['normalized_feature_record_missing'],
    });
  });

  it('applies audited citation replacements without rewriting the legacy case row', () => {
    const oldUrl = 'https://example.com/retired-citation';
    const newUrl = 'https://example.com/live-citation';
    const normalized = normalizeExchangeCase(row({
      sources: JSON.stringify([{ title: 'Case source', url: oldUrl }]),
      feature_evidence: JSON.stringify({
        source_count: 1,
        source_replacements: { [oldUrl]: newUrl },
      }),
    }));
    expect(normalized.sources).toEqual([{ title: 'Case source', url: newUrl }]);
    expect(normalized.analysis.evidence.source_replacements).toEqual({ [oldUrl]: newUrl });
  });
});

describe('summarizeExchangeCases', () => {
  it('keeps DEX and CEX populations separate', () => {
    const dex = normalizeExchangeCase(row());
    const cex = normalizeExchangeCase(row({
      slug: 'ftx',
      kind: 'cex',
      lifecycle: 'dead',
      name: 'FTX',
      feature_product_cohort: 'centralized_multi_product_exchange',
      feature_custody_model: 'custodial',
      feature_metric_type: 'loss_exposure',
      feature_metric_window: 'event_exposure',
      feature_comparability_key: 'cex|centralized_multi_product_exchange|loss_exposure|usd|event_exposure',
    }));
    const summary = summarizeExchangeCases([dex, cex], 'dex');
    expect(summary.count).toBe(1);
    expect(summary.lifecycleCounts).toEqual({ successful: 1 });
    expect(summary.comparisonGroups[0].cases).toEqual(['uniswap']);
    expect(summary.primaryChainContexts).toEqual([{
      primaryChain: 'Ethereum',
      count: 1,
      lifecycleCounts: { successful: 1 },
    }]);
    expect(summary.tokenStrategies[0]).toMatchObject({
      tokenStrategy: 'governance',
      lifecycleCounts: { successful: 1 },
    });
    expect(summary.tokenByLifecycle.successful).toMatchObject({
      documentedLaunched: 1,
      unverifiedLaunched: 0,
    });
  });

  it('never pools spot, routed, or perpetual metric values', () => {
    const cases = [
      normalizeExchangeCase(row()),
      normalizeExchangeCase(row({
        slug: 'jupiter',
        name: 'Jupiter',
        feature_product_cohort: 'liquidity_aggregator',
        feature_metric_type: 'aggregator_routed_volume_24h',
        feature_comparability_key: 'dex|liquidity_aggregator|aggregator_routed_volume_24h|usd|rolling_24h',
      })),
      normalizeExchangeCase(row({
        slug: 'hyperliquid',
        name: 'Hyperliquid',
        feature_product_cohort: 'perpetual_orderbook',
        feature_metric_type: 'perpetual_notional_volume_24h',
        feature_comparability_key: 'dex|perpetual_orderbook|perpetual_notional_volume_24h|usd|rolling_24h',
      })),
    ];
    const summary = summarizeExchangeCases(cases, 'dex');
    expect(summary.comparisonGroups).toHaveLength(3);
    expect(summary).not.toHaveProperty('totalMetric');
    expect(summary.comparisonGroups.every((group) => !Object.hasOwn(group, 'total'))).toBe(true);
  });
});

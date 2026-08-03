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

  it('never attaches a feature-overlay unit to an unconverted stored metric value', () => {
    const normalized = normalizeExchangeCase(row({
      slug: 'bithumb',
      kind: 'cex',
      lifecycle: 'mid',
      name: 'Bithumb',
      metric_label: 'daily trading volume',
      metric_type: 'trading_volume',
      metric_unit: 'USD',
      metric: 599_770_000,
      feature_metric_type: 'market_share',
      feature_metric_unit: 'percent',
      feature_metric_window: 'post_incident_observation',
      feature_metric_as_of: '2026-02-22',
      feature_metric_observed_at: '2026-08-03T21:15:00Z',
      feature_comparability_key: 'cex|centralized_spot_exchange|market_share|percent|domestic_observation',
    }));

    expect(normalized).toMatchObject({
      metric: 599_770_000,
      metric_type: 'trading_volume',
      metric_unit: 'usd',
      analysis: {
        metric: {
          type: 'trading_volume',
          unit: 'usd',
          window: 'unknown',
          as_of: null,
          observed_at: null,
          comparability_key: 'cex|spot_amm|trading_volume|usd|unknown',
        },
      },
    });
    expect(normalized.analysis.data_quality.issues).toContain(
      'feature_metric_identity_conflicts_with_published_value',
    );
  });

  it('never relabels a stored metric as a different feature type even when units match', () => {
    const normalized = normalizeExchangeCase(row({
      slug: 'reserves-example',
      kind: 'cex',
      metric_label: 'reported reserves',
      metric_type: 'reserves',
      metric_unit: 'USD',
      metric: 84_000_000_000,
      feature_metric_type: 'loss_exposure',
      feature_metric_unit: 'usd',
      feature_metric_window: 'event_exposure',
      feature_metric_as_of: '2026-07-31',
      feature_metric_observed_at: '2026-08-03T21:15:00Z',
      feature_comparability_key: 'cex|centralized_multi_product_exchange|loss_exposure|usd|event_exposure',
    }));

    expect(normalized.analysis.metric).toEqual({
      type: 'reserves',
      unit: 'usd',
      window: 'unknown',
      as_of: null,
      observed_at: null,
      comparability_key: 'cex|spot_amm|reserves|usd|unknown',
    });
    expect(normalized.analysis.data_quality.issues).toContain(
      'feature_metric_identity_conflicts_with_published_value',
    );
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

  it('publishes outcome rates with Wilson uncertainty instead of causal-sounding counts', () => {
    const cases = [
      normalizeExchangeCase(row({ slug: 'success-a' })),
      normalizeExchangeCase(row({ slug: 'success-b', feature_primary_chain: 'Base' })),
      normalizeExchangeCase(row({
        slug: 'dead-token',
        lifecycle: 'dead',
        feature_primary_chain: 'Ethereum',
      })),
      normalizeExchangeCase(row({
        slug: 'dead-no-token',
        lifecycle: 'dead',
        feature_primary_chain: 'Base',
        feature_token_status: 'not_identified',
        feature_token_source_url: null,
      })),
    ];
    const summary = summarizeExchangeCases(cases, 'dex');

    expect(summary.outcomeAssociations.overall).toMatchObject({
      sampleSize: 4,
      successful: 2,
      successRate: 0.5,
      smallSample: true,
    });
    expect(summary.outcomeAssociations.overall.ci95.low).toBeCloseTo(0.15, 2);
    expect(summary.outcomeAssociations.overall.ci95.high).toBeCloseTo(0.85, 2);
    expect(summary.outcomeAssociations.tokenLaunch).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'documented_launched',
        sampleSize: 3,
        successful: 2,
        successRate: 0.667,
      }),
      expect.objectContaining({
        key: 'not_identified',
        sampleSize: 1,
        successful: 0,
        successRate: 0,
      }),
    ]));
    expect(summary.outcomeAssociations.primaryChain).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'Base', sampleSize: 2, successRate: 0.5 }),
      expect.objectContaining({ key: 'Ethereum', sampleSize: 2, successRate: 0.5 }),
    ]));
    expect(summary.outcomeAssociations.productCohort).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'spot_amm',
        sampleSize: 4,
        successful: 2,
        successRate: 0.5,
      }),
    ]));
    expect(summary.outcomeAssociations.method).toContain('association');
    expect(summary.outcomeAssociations.method).toContain('Wilson');
  });

  it('reports trend-readiness gaps and predeclared falsifiers', () => {
    const cases = [
      normalizeExchangeCase(row({ feature_freshness_status: 'current' })),
      normalizeExchangeCase(row({
        slug: 'limited',
        lifecycle: 'mid',
        feature_quality_label: 'limited',
        feature_last_verified_at: null,
        feature_token_source_url: null,
      })),
    ];
    const summary = summarizeExchangeCases(cases, 'dex');

    expect(summary.trendReadiness).toMatchObject({
      totalCases: 2,
      documentedTokenCases: 1,
      currentEvidenceCases: 1,
    });
    expect(summary.hypotheses).toEqual(expect.arrayContaining([
      expect.objectContaining({
        variable: 'token_launch',
        causalClaim: false,
        falsifier: expect.any(String),
      }),
      expect.objectContaining({
        variable: 'primary_chain',
        causalClaim: false,
        falsifier: expect.any(String),
      }),
    ]));
  });

  it('does not count stale or overdue records as current evidence', () => {
    const cases = [
      normalizeExchangeCase(row({
        slug: 'current',
        feature_freshness_status: 'current',
        feature_next_review_at: '2099-01-01',
      })),
      normalizeExchangeCase(row({
        slug: 'stale',
        feature_freshness_status: 'stale',
        feature_next_review_at: '2099-01-01',
      })),
      normalizeExchangeCase(row({
        slug: 'overdue',
        feature_freshness_status: 'current',
        feature_next_review_at: '2020-01-01',
      })),
    ];

    expect(summarizeExchangeCases(cases, 'dex', '2026-07-29').trendReadiness.currentEvidenceCases)
      .toBe(1);
  });

  it('returns zeroed associations and readiness instead of throwing when a kind has no cases', () => {
    const summary = summarizeExchangeCases([normalizeExchangeCase(row({ kind: 'cex' }))], 'dex');

    expect(summary.count).toBe(0);
    expect(summary.outcomeAssociations.overall).toMatchObject({
      sampleSize: 0,
      successful: 0,
      successRate: 0,
      ci95: { low: 0, high: 1 },
      smallSample: true,
    });
    expect(summary.outcomeAssociations.tokenLaunch).toEqual([]);
    expect(summary.outcomeAssociations.primaryChain).toEqual([]);
    expect(summary.outcomeAssociations.productCohort).toEqual([]);
    expect(summary.trendReadiness).toMatchObject({
      totalCases: 0,
      causalDossiers: 0,
      documentedTokenCases: 0,
      currentEvidenceCases: 0,
      comparableMetricGroups: 0,
    });
    expect(summary.hypotheses).toHaveLength(3);
  });

  it('computes riskDifferenceVsPopulation as the signed gap from the kind-wide success rate', () => {
    const cases = [
      normalizeExchangeCase(row({ slug: 'a', feature_primary_chain: 'Ethereum' })),
      normalizeExchangeCase(row({ slug: 'b', feature_primary_chain: 'Ethereum' })),
      normalizeExchangeCase(row({
        slug: 'c', lifecycle: 'dead', feature_primary_chain: 'Solana',
      })),
      normalizeExchangeCase(row({
        slug: 'd', lifecycle: 'dead', feature_primary_chain: 'Solana',
      })),
    ];
    const summary = summarizeExchangeCases(cases, 'dex');
    // Population success rate is 0.5 (2 of 4 successful).
    const ethereum = summary.outcomeAssociations.primaryChain.find((entry) => entry.key === 'Ethereum');
    const solana = summary.outcomeAssociations.primaryChain.find((entry) => entry.key === 'Solana');
    expect(ethereum.successRate).toBe(1);
    expect(ethereum.riskDifferenceVsPopulation).toBeCloseTo(0.5, 5);
    expect(solana.successRate).toBe(0);
    expect(solana.riskDifferenceVsPopulation).toBeCloseTo(-0.5, 5);
  });

  it('flips smallSample to false once a cohort reaches 5 cases', () => {
    const cases = Array.from({ length: 5 }, (_, i) => normalizeExchangeCase(row({ slug: `case-${i}` })));
    const summary = summarizeExchangeCases(cases, 'dex');
    expect(summary.outcomeAssociations.overall.sampleSize).toBe(5);
    expect(summary.outcomeAssociations.overall.smallSample).toBe(false);

    const fewer = summarizeExchangeCases(cases.slice(0, 4), 'dex');
    expect(fewer.outcomeAssociations.overall.smallSample).toBe(true);
  });

  it('buckets missing primary chain and product cohort under explicit fallback keys instead of dropping rows', () => {
    const cases = [
      normalizeExchangeCase(row({
        feature_primary_chain: null,
        feature_chains: '[]',
        feature_product_cohort: null,
      })),
    ];
    const summary = summarizeExchangeCases(cases, 'dex');
    expect(summary.outcomeAssociations.primaryChain).toEqual([
      expect.objectContaining({ key: 'unknown', sampleSize: 1 }),
    ]);
    expect(summary.outcomeAssociations.productCohort).toEqual([
      expect.objectContaining({ key: 'unclassified', sampleSize: 1 }),
    ]);
  });
});
